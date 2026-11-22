// Fuzz de merge offline (22/11/2026): con el merge por clave top-level se perdían altas/ediciones locales y volvían borrados. Base común; la "nube" (otro dispositivo) y el "local" hacen
// ediciones al azar sobre la misma base; se guarda y se comprueban invariantes sobre lo que queda en la nube.
'use strict';
const { test, expect } = require('./support/fixtures');

test('merge offline al azar (120 casos): nada propio se pierde, nada borrado vuelve, sin duplicados', async ({ cmPage }) => {
  test.setTimeout(600000);
  const res = await cmPage.evaluate(async () => {
    const N = 120;
    const clone = o => JSON.parse(JSON.stringify(o));
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const viol = {};
    const add = (k, msg) => { (viol[k] = viol[k] || { n: 0, ej: msg }).n++; };
    const base0 = clone(S);
    // asegurar colecciones con ítems en la base
    base0.transactions = [...Array(6)].map((_, i) => ({ id: 'tb' + i, date: '2026-11-20', name: 'b' + i, type: 'expense', amount: i + 1 }));
    base0.notas = [...Array(6)].map((_, i) => ({ id: 'nb' + i, categoria: 'aprendizaje', titulo: 't' + i, texto: 'x', fecha: '2026-11-20' }));
    base0.goals = base0.goals || {}; base0.goals['2026-11-22'] = [...Array(6)].map((_, i) => ({ id: 'gb' + i, text: 'meta ' + i, done: false, priority: 'mid', q: 'un' }));
    const hs = (base0.habitTrackers && base0.habitTrackers.vida) || [];
    if (!hs.length) base0.habitTrackers = { vida: [{ id: 'hb0', name: 'H', emoji: 'x', days: {} }], finanzas: [], salud: [], conocimiento: [], ia: [] };
    const HID = base0.habitTrackers.vida[0].id;
    const DAYS = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

    // Ediciones: devuelven descriptores para chequear invariantes
    function editar(st, quien) {
      const ops = [];
      const n = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const tipo = pick(['tx+', 'tx-', 'txmod', 'nota+', 'nota-', 'goal+', 'goal-', 'goaldone', 'hab']);
        const uid = quien + Math.floor(rnd() * 1e9).toString(36);
        if (tipo === 'tx+') { st.transactions.unshift({ id: 't' + uid, date: '2026-11-22', name: uid, type: 'expense', amount: 9 }); ops.push({ k: 'transactions', op: 'add', id: 't' + uid }); }
        if (tipo === 'tx-' && st.transactions.length) { const it = pick(st.transactions); st.transactions = st.transactions.filter(x => x !== it); ops.push({ k: 'transactions', op: 'del', id: it.id }); }
        if (tipo === 'txmod' && st.transactions.length) { const it = pick(st.transactions); it.amount = Math.floor(rnd() * 1000) + 100; ops.push({ k: 'transactions', op: 'mod', id: it.id, campo: 'amount', v: it.amount }); }
        if (tipo === 'nota+') { st.notas.unshift({ id: 'n' + uid, categoria: 'aprendizaje', titulo: uid, texto: 'y', fecha: '2026-11-22' }); ops.push({ k: 'notas', op: 'add', id: 'n' + uid }); }
        if (tipo === 'nota-' && st.notas.length) { const it = pick(st.notas); st.notas = st.notas.filter(x => x !== it); ops.push({ k: 'notas', op: 'del', id: it.id }); }
        if (tipo === 'goal+') { st.goals['2026-11-22'].push({ id: 'g' + uid, text: 'meta ' + uid, done: false, priority: 'mid', q: 'un' }); ops.push({ k: 'goals', op: 'add', id: 'g' + uid }); }
        if (tipo === 'goal-' && st.goals['2026-11-22'].length) { const it = pick(st.goals['2026-11-22']); st.goals['2026-11-22'] = st.goals['2026-11-22'].filter(x => x !== it); ops.push({ k: 'goals', op: 'del', id: it.id }); }
        if (tipo === 'goaldone' && st.goals['2026-11-22'].length) { const it = pick(st.goals['2026-11-22']); it.done = !it.done; ops.push({ k: 'goals', op: 'mod', id: it.id, campo: 'done', v: it.done }); }
        if (tipo === 'hab') { const d = pick(DAYS); const v = pick(['done', 'missed', 'rest', 'partial']); st.habitTrackers.vida[0].days[d] = v; ops.push({ k: 'habitTrackers', op: 'day', id: d, v }); }
      }
      return ops;
    }
    const lista = (st, k) => k === 'goals' ? (st.goals['2026-11-22'] || []) : k === 'habitTrackers' ? [] : (st[k] || []);

    for (let it = 0; it < N; it++) {
      const base = clone(base0), nube = clone(base0), local = clone(base0);
      const opsN = editar(nube, 'N'), opsL = editar(local, 'L');
      await _DOC().set({ state: JSON.stringify(nube), _wid: 'otro', _savedAt: 2000 + it, _dev: 'PC' });
      window.__cmLecturaVieja = null;
      _lastSyncedSavedAt = 1000; _lastSyncedState = clone(base); S = clone(local);
      await _fbDoSave();
      const fin = JSON.parse((await _DOC().get()).data().state);
      const tocadosN = new Set(opsN.map(o => o.k + ':' + o.id)), tocadosL = new Set(opsL.map(o => o.k + ':' + o.id));
      for (const [ops, otro, quien] of [[opsN, tocadosL, 'nube'], [opsL, tocadosN, 'local']]) {
        // solo la ÚLTIMA op por ítem cuenta
        const ult = new Map(); ops.forEach(o => ult.set(o.k + ':' + o.id, o));
        for (const o of ult.values()) {
          if (otro.has(o.k + ':' + o.id)) continue;   // conflicto real sobre el mismo ítem: no se exige nada
          if (o.k === 'habitTrackers') {
            const v = fin.habitTrackers.vida[0].days[o.id];
            if (v !== o.v) add('habit-dia-perdido-' + quien, { dia: o.id, esperado: o.v, quedo: v, opsN, opsL });
            continue;
          }
          const L = lista(fin, o.k), x = L.find(e => e.id === o.id);
          if (o.op === 'add' && !x) add(o.k + '-alta-perdida-' + quien, { id: o.id, opsN, opsL });
          if (o.op === 'del' && x) add(o.k + '-borrado-resucitado-' + quien, { id: o.id, opsN, opsL });
          if (o.op === 'mod' && x && x[o.campo] !== o.v) add(o.k + '-edicion-perdida-' + quien, { id: o.id, campo: o.campo, esperado: o.v, quedo: x[o.campo] });
          if (o.op === 'mod' && !x) add(o.k + '-editado-desaparecio-' + quien, { id: o.id });
        }
      }
      // duplicados
      for (const k of ['transactions', 'notas', 'goals']) { const ids = lista(fin, k).map(e => e.id); if (new Set(ids).size !== ids.length) add(k + '-duplicados', { ids }); }
    }
    return viol;
  });
  expect(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { n: v.n, ej: v.ej }]))).toEqual({});
});

// ── Hallazgos del análisis (22/11/2026), confirmados con estos tests antes del arreglo ──
const nube = page => page.evaluate(async () => JSON.parse((await _DOC().get()).data().state).transactions.map(t => t.id));
const idle = page => page.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress, null, { timeout: 20000 });

test('H1: cambio sin subir (pendiente) + llega versión de otro dispositivo → no se pierde', async ({ cmPage }) => {
  await idle(cmPage);
  const ids = await cmPage.evaluate(async () => {
    const t = id => ({ id, date: '2026-11-22', name: id, type: 'expense', amount: 1 });
    const base = JSON.parse(JSON.stringify(S));
    _lastSyncedSavedAt = 1000; _lastSyncedState = JSON.parse(JSON.stringify(base));
    S.transactions = [t('t-offline'), ...S.transactions];
    localStorage.setItem('lifedash_v2', JSON.stringify(S)); localStorage.setItem('_pendingCloudSave', '1');
    const otro = JSON.parse(JSON.stringify(base)); otro.transactions = [t('t-pc'), ...otro.transactions];
    const doc = { state: JSON.stringify(otro), _savedAt: 2000, _wid: 'pc', _dev: 'PC' };
    await _DOC().set(doc);
    const cb = window.__cmSnapCbs.filter(x => x.path === 'appdata/lifedash_v2').pop().cb;
    cb({ exists: true, metadata: { fromCache: false }, data: () => doc });
    return S.transactions.map(x => x.id);
  });
  await idle(cmPage);
  const n = await nube(cmPage);
  expect(ids, 'S conserva el cambio offline').toContain('t-offline');
  expect(n, 'la nube termina con ambos').toEqual(expect.arrayContaining(['t-offline', 't-pc']));
});

test('H4: saveState marca pendiente en el acto (si iOS congela la app antes del guardado, no se pierde)', async ({ cmPage }) => {
  await idle(cmPage);
  const p = await cmPage.evaluate(() => { localStorage.removeItem('_pendingCloudSave'); S.notas = [...(S.notas || [])]; saveState(); return localStorage.getItem('_pendingCloudSave'); });
  expect(p).toBe('1');
});

test('H5: un cambio hecho mientras el guardado lee la nube no se pierde', async ({ cmPage }) => {
  await idle(cmPage);
  await cmPage.evaluate(async () => {
    const t = id => ({ id, date: '2026-11-22', name: id, type: 'expense', amount: 1 });
    const base = JSON.parse(JSON.stringify(S));
    _lastSyncedSavedAt = 1000; _lastSyncedState = JSON.parse(JSON.stringify(base));
    const otro = JSON.parse(JSON.stringify(base)); otro.transactions = [t('t-pc5'), ...otro.transactions];
    await _DOC().set({ state: JSON.stringify(otro), _savedAt: 2000, _wid: 'pc', _dev: 'PC' });
    S.transactions = [t('t-antes'), ...S.transactions];
    const p = _fbDoSave();                              // queda esperando la lectura
    S.transactions = [t('t-durante'), ...S.transactions]; saveState();
    await p;
  });
  await cmPage.waitForTimeout(2600); await idle(cmPage);
  const n = await nube(cmPage);
  const s = await cmPage.evaluate(() => S.transactions.map(x => x.id));
  expect(s, 'S conserva el cambio hecho durante la lectura').toContain('t-durante');
  expect(n).toEqual(expect.arrayContaining(['t-antes', 't-durante', 't-pc5']));
});

test('arranque sin nube (offline) y guardado después: merge con el último estado sincronizado, no pisa lo de la PC', async ({ cmPage }) => {
  await idle(cmPage);
  await cmPage.evaluate(async () => {
    const t = id => ({ id, date: '2026-11-22', name: id, type: 'expense', amount: 1 });
    const base = JSON.parse(JSON.stringify(S));
    localStorage.setItem('_lastSyncedStateStr', JSON.stringify(base));
    const otro = JSON.parse(JSON.stringify(base)); otro.transactions = [t('t-pc-off'), ...otro.transactions];
    await _DOC().set({ state: JSON.stringify(otro), _savedAt: 2000, _wid: 'pc', _dev: 'PC' });
    _lastSyncedSavedAt = null; _lastSyncedState = null;              // la carga falló: sesión sin confirmar
    S = JSON.parse(JSON.stringify(base)); S.transactions = [t('t-cel-off'), ...S.transactions];
    await _fbDoSave();
  });
  await idle(cmPage);
  expect(await nube(cmPage)).toEqual(expect.arrayContaining(['t-pc-off', 't-cel-off']));
});

test('un backup diario colgado (sin red) no traba los guardados', async ({ cmPage }) => {
  await idle(cmPage);
  await cmPage.evaluate(async () => {
    await _DOC().set({ state: JSON.stringify(S), _savedAt: 1000, _wid: 'x', _dev: 'PC' });   // hay nube → corre el backup del día
    _lastSyncedSavedAt = 1000; _lastSyncedState = JSON.parse(JSON.stringify(S));
    localStorage.setItem('_lastBackupDay', '2000-01-01');
    window._maybeBackup = () => new Promise(() => {});                 // nunca resuelve
    S.transactions = [{ id: 't-tras-backup', date: '2026-11-22', name: 'x', type: 'expense', amount: 1 }, ...S.transactions];
    await Promise.race([_fbDoSave(), new Promise((_, rej) => setTimeout(() => rej(new Error('guardado trabado')), 8000))]);
  });
  expect(await nube(cmPage)).toContain('t-tras-backup');
});

test('volver a la app con cambios propios sin subir: no aplica la versión remota encima, guarda y junta', async ({ cmPage }) => {
  await idle(cmPage);
  await cmPage.evaluate(async () => {
    const t = id => ({ id, date: '2026-11-22', name: id, type: 'expense', amount: 1 });
    const base = JSON.parse(JSON.stringify(S));
    _lastSyncedSavedAt = 1000; _lastSyncedState = JSON.parse(JSON.stringify(base));
    S.transactions = [t('t-foco-local'), ...S.transactions];
    localStorage.setItem('_pendingCloudSave', '1');
    const otro = JSON.parse(JSON.stringify(base)); otro.transactions = [t('t-foco-pc'), ...otro.transactions];
    await _DOC().set({ state: JSON.stringify(otro), _savedAt: 2000, _wid: 'pc', _dev: 'PC' });
    await _syncOnFocus();
  });
  await cmPage.waitForTimeout(2600); await idle(cmPage);
  expect(await nube(cmPage)).toEqual(expect.arrayContaining(['t-foco-local', 't-foco-pc']));
});

test('guardado temprano al arrancar con S vacío y nube chica: no borra nada de la nube', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async () => {
    const nubeSt = JSON.parse(JSON.stringify(S));
    nubeSt.transactions = [{ id: 't-unica', date: '2026-11-22', name: 'x', type: 'expense', amount: 1 }];
    nubeSt.notas = [...Array(30)].map((_, i) => ({ id: 'n' + i, categoria: 'aprendizaje', titulo: 't' + i, texto: 'x', fecha: '2026-11-20' }));
    nubeSt.goals = {}; nubeSt.accounts = []; nubeSt.subscriptions = []; nubeSt.nwHistory = []; nubeSt.wishlist = []; nubeSt.tomorrowGoals = {};
    nubeSt.habitTrackers = { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] };
    await _DOC().set({ state: JSON.stringify(nubeSt), _savedAt: 3000, _wid: 'pc', _dev: 'PC' });
    localStorage.setItem('_lastSyncedStateStr', JSON.stringify(nubeSt));
    _lastSyncedSavedAt = null; _lastSyncedState = null; S = {};
    await _fbDoSave();
    const st = JSON.parse((await _DOC().get()).data().state);
    return { notas: (st.notas || []).length, tx: (st.transactions || []).length };
  });
  expect(r).toEqual({ notas: 30, tx: 1 });
});

test('red de seguridad: un dispositivo no puede achicar la nube a menos de la mitad (22/11 08:13)', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async () => {
    const grande = JSON.parse(JSON.stringify(S));
    grande.transactions = [...Array(600)].map((_, i) => ({ id: 'tg' + i, date: '2026-11-20', name: 'movimiento ' + i, type: 'expense', amount: i }));
    await _DOC().set({ state: JSON.stringify(grande), _savedAt: 5000, _wid: 'pc', _dev: 'PC' });
    _lastSyncedSavedAt = 5000; _lastSyncedState = JSON.parse(JSON.stringify(grande));
    S = JSON.parse(JSON.stringify(grande)); S.transactions = [];          // copia vieja/incompleta
    await _fbDoSave();
    const d = (await _DOC().get()).data();
    return { savedAt: d._savedAt, tx: JSON.parse(d.state).transactions.length, pend: localStorage.getItem('_pendingCloudSave'),
             ev: JSON.parse(localStorage.getItem('_syncEvents') || '[]').some(e => e.tipo === 'bloqueado-achique') };
  });
  expect(r).toEqual({ savedAt: 5000, tx: 600, pend: '1', ev: true });
});

test('red de seguridad: forzarGuardado (borrado grande intencional) sí puede achicar', async ({ cmPage }) => {
  await idle(cmPage);
  const tx = await cmPage.evaluate(async () => {
    const grande = JSON.parse(JSON.stringify(S));
    grande.transactions = [...Array(600)].map((_, i) => ({ id: 'tg' + i, date: '2026-11-20', name: 'movimiento ' + i, type: 'expense', amount: i }));
    await _DOC().set({ state: JSON.stringify(grande), _savedAt: 5000, _wid: 'pc', _dev: 'PC' });
    _lastSyncedSavedAt = 5000; _lastSyncedState = JSON.parse(JSON.stringify(grande));
    S = JSON.parse(JSON.stringify(grande)); S.transactions = [];
    _forceSaveOnce = true; await _fbDoSave();
    return JSON.parse((await _DOC().get()).data().state).transactions.length;
  });
  expect(tx).toBe(0);
});

// 22/11/2026 08:13: un saveState temprano (cardsCatchUp antes de que termine loadState) dejaba en localStorage los
// valores de fábrica marcados como pendientes; al cargar se mergeaban como si el usuario hubiera borrado todo.
test('recargar: los valores de fábrica que quedaron como pendientes no vacían los datos', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async () => {
    const grande = JSON.parse(JSON.stringify(S));
    grande.transactions = [...Array(600)].map((_, i) => ({ id: 'tg' + i, date: '2026-11-20', name: 'movimiento ' + i, type: 'expense', amount: i }));
    await _DOC().set({ state: JSON.stringify(grande), _savedAt: 7000, _wid: 'pc', _dev: 'PC' });
    localStorage.setItem('_lastSyncedStateStr', JSON.stringify(grande));
    localStorage.setItem('lifedash_v2', JSON.stringify(DEFAULT_STATE));      // lo que dejaba el guardado temprano
    localStorage.setItem('_pendingCloudSave', '1');
    await loadState();
    return { s: (S.transactions || []).length, pend: localStorage.getItem('_pendingCloudSave') };
  });
  expect(r).toEqual({ s: 600, pend: null });
  await cmPage.waitForTimeout(3000); await idle(cmPage);
  const n = await cmPage.evaluate(async () => JSON.parse((await _DOC().get()).data().state).transactions.length);
  expect(n).toBe(600);
});

test('saveState antes de que terminen de cargar los datos no toca nada', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(() => {
    localStorage.removeItem('_pendingCloudSave');
    const antes = localStorage.getItem('lifedash_v2');
    _estadoCargado = false;
    const Sreal = S; S = JSON.parse(JSON.stringify(DEFAULT_STATE));
    saveState();
    const out = { igual: localStorage.getItem('lifedash_v2') === antes, pend: localStorage.getItem('_pendingCloudSave'), timer: !!_fbSaveTid };
    S = Sreal; _estadoCargado = true;
    return out;
  });
  expect(r).toEqual({ igual: true, pend: null, timer: false });
});
