// Hallazgo 4 de la auditoría (23/11/2026): _rescueLocal solo unía las listas que enumera (arrays con id), goals,
// hábitos y logs. Las claves de tipo OBJETO (comidas, foco, reminders, principios, dayPlan...) que la nube no tenía
// o que cambiaron en local se perdían cuando la sesión arrancaba sin nube confirmada y la nube tenía >3 registros más
// (rama rescue-unconfirmed), o al recuperar cambios pendientes sin ancestro (loadState). S, localStorage y la nube
// quedaban sin lo cargado en el iPhone. Estas pruebas recorren esas rutas con el mock de Firestore.
'use strict';
const { test, expect, completeLoginOverlay, waitForBoot } = require('./support/fixtures');

const idle = page => page.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress, null, { timeout: 20000 });

// Arma (en la página) base común, nube (PC) y local (iPhone) con cambios en claves OBJETO. Autocontenida: Playwright la serializa.
function armar(opt) {
  const clone = o => JSON.parse(JSON.stringify(o));
  const base = clone(S);
  const tx = (id, n) => ({ id, date: '2026-11-20', name: (n || 'x') + ' ' + id, type: 'expense', amount: 1 });
  base.transactions = [...Array(opt.nBase || 10)].map((_, i) => tx('t-base-' + i));
  base.comidas = { alimentos: [{ id: 'al1', nombre: 'Arroz', unidad: 'g', comidas: ['almuerzo'] }], registro: { '2026-11-18': { almuerzo: { al1: { ok: true, cant: 100 } } }, '2026-11-19': { almuerzo: { al1: { ok: true, cant: 90 } } } } };
  base.reminders = { vida: [{ id: 'r-base', title: 'base', datetime: '2026-12-01T10:00', priority: 'low' }], finanzas: [], salud: [], conocimiento: [], ia: [] };
  base.dayPlan = { '2026-11-22': { grid: {}, tasks: [] } };
  if (opt.pesado) base.transactions = [...base.transactions, ...[...Array(1800)].map((_, i) => tx('t-big-' + i, 'movimiento largo de relleno para pesar ' + 'abcdefghij'.repeat(5)))];   // documento grande (>= 300 KB), compartido por ambos lados como en la vida real
  delete base.foco; delete base.principios;               // claves que la nube todavía no tiene

  // Local (iPhone sin nube): carga comida de hoy, chequeos de Foco, un recordatorio, principios y plan del día.
  const local = clone(base);
  local.comidas.registro['2026-11-24'] = { desayuno: { al1: { ok: true, cant: 50 } } };
  local.foco = { config: { horas: ['10:00'] }, chequeos: [{ id: 'fc-local', fecha: '2026-11-24', hora: '10:00', texto: 'iPhone' }] };
  local.reminders.vida = [...local.reminders.vida, { id: 'r-local', title: 'iPhone', datetime: '2026-12-02T10:00', priority: 'high' }];
  local.principios = { principios: [{ id: 'p-local', texto: 'Principio del iPhone' }], extras: {} };
  local.dayPlan['2026-11-23'] = { grid: {}, tasks: [{ id: 'dp-local', time: '09:00', priority: 1, text: 'iPhone', done: false }] };

  // Nube (PC): >3 altas en arrays, comida de otro día y su propio recordatorio.
  const cloud = clone(base);
  cloud.transactions = [...[...Array(8)].map((_, i) => tx('t-pc-' + i, 'pc')), ...cloud.transactions];
  cloud.comidas.registro['2026-11-20'] = { cena: { al1: { ok: true, cant: 200 } } };
  cloud.reminders.vida = [...cloud.reminders.vida, { id: 'r-pc', title: 'PC', datetime: '2026-12-03T10:00', priority: 'medium' }];
  if (opt.nubeBorra) {                                       // la PC borró algo que el ancestro tenía
    cloud.transactions = cloud.transactions.filter(t => t.id !== 't-base-3');
    delete cloud.comidas.registro['2026-11-19'];
    cloud.reminders.vida = cloud.reminders.vida.filter(r => r.id !== 'r-base');
  }
  return { base, cloud, local };
}

// Qué falta (de lo cargado en el iPhone y en la PC) en el estado `st`. Vacío = no se perdió nada.
function faltan(st, opt) {
  const f = [];
  const ids = a => (Array.isArray(a) ? a : []).map(x => x && x.id);
  if (!(st.comidas && st.comidas.registro && st.comidas.registro['2026-11-24'])) f.push('comidas.registro[hoy] (iPhone)');
  if (!(st.comidas && st.comidas.registro && st.comidas.registro['2026-11-20'])) f.push('comidas.registro[20/11] (PC)');
  if (!ids(st.foco && st.foco.chequeos).includes('fc-local')) f.push('foco.chequeos (iPhone)');
  if (!ids(st.reminders && st.reminders.vida).includes('r-local')) f.push('reminders.vida r-local (iPhone)');
  if (!ids(st.reminders && st.reminders.vida).includes('r-pc')) f.push('reminders.vida r-pc (PC)');
  if (!ids(st.principios && st.principios.principios).includes('p-local')) f.push('principios (iPhone)');
  if (!(st.dayPlan && st.dayPlan['2026-11-23'])) f.push('dayPlan[hoy] (iPhone)');
  const tx = ids(st.transactions);
  for (let i = 0; i < 8; i++) if (!tx.includes('t-pc-' + i)) { f.push('transactions t-pc-' + i + ' (PC)'); break; }
  return f;
}
const faltanSrc = faltan.toString();

async function correrRescateSinConfirmar(cmPage, { conAncestro, nubeBorra }) {
  await idle(cmPage);
  return cmPage.evaluate(async ({ armarSrc, faltanSrc, conAncestro, nubeBorra }) => {
    const armar = eval('(' + armarSrc + ')'), faltan = eval('(' + faltanSrc + ')');
    const { base, cloud, local } = armar({ nubeBorra });
    await _DOC().set({ state: JSON.stringify(cloud), _savedAt: 2000, _wid: 'pc', _dev: 'PC' });
    if (conAncestro) localStorage.setItem('_lastSyncedStateStr', JSON.stringify(base)); else localStorage.removeItem('_lastSyncedStateStr');
    _lastSyncedSavedAt = null; _lastSyncedState = null;      // la carga falló: sesión sin confirmar
    S = JSON.parse(JSON.stringify(local));
    await _fbDoSave();
    const rama = (JSON.parse(localStorage.getItem('_saveDiag') || '[]')[0] || {}).branch;
    const enNube = JSON.parse((await _DOC().get()).data().state);
    return { rama, faltanNube: faltan(enNube), faltanS: faltan(S), nubeTx: enNube.transactions.map(t => t.id), nubeCom: Object.keys(enNube.comidas.registro), nubeRem: enNube.reminders.vida.map(r => r.id) };
  }, { armarSrc: armar.toString(), faltanSrc, conAncestro, nubeBorra });
}

test('rescate sin nube confirmada y SIN ancestro: las claves objeto de local no se pierden', async ({ cmPage }) => {
  const r = await correrRescateSinConfirmar(cmPage, { conAncestro: false });
  expect(r.rama).toBe('rescue-unconfirmed');
  expect(r.faltanNube, 'faltan en la nube').toEqual([]);
  expect(r.faltanS, 'faltan en S (memoria)').toEqual([]);
});

test('rescate sin nube confirmada y CON ancestro: las claves objeto de local no se pierden', async ({ cmPage }) => {
  const r = await correrRescateSinConfirmar(cmPage, { conAncestro: true });
  expect(r.rama).toBe('rescue-unconfirmed');
  expect(r.faltanNube, 'faltan en la nube').toEqual([]);
  expect(r.faltanS, 'faltan en S (memoria)').toEqual([]);
});

// (b) Rama «nube con bastante más que local»: SIEMPRE unión, aun con ancestro. Un merge 3 vías acá achicaba la nube cuando el
// ancestro era más nuevo que local (dos pestañas con el mismo localStorage; verificación ciega 24/11). Trade-off aceptado:
// lo que la PC borró puede reaparecer, pero NUNCA se pierde nada de ningún lado.
test('(b) con ancestro: el rescate une sin perder nada de ningún lado (nunca achica la nube)', async ({ cmPage }) => {
  const r = await correrRescateSinConfirmar(cmPage, { conAncestro: true, nubeBorra: true });
  expect(r.faltanNube).toEqual([]);
});

test('loadState con cambios pendientes y SIN ancestro: conserva las claves objeto del iPhone', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async ({ armarSrc, faltanSrc }) => {
    const armar = eval('(' + armarSrc + ')'), faltan = eval('(' + faltanSrc + ')');
    const { cloud, local } = armar({});
    await _DOC().set({ state: JSON.stringify(cloud), _savedAt: 3000, _wid: 'pc', _dev: 'PC' });
    localStorage.removeItem('_lastSyncedStateStr');
    localStorage.setItem('lifedash_v2', JSON.stringify(local)); localStorage.setItem('_pendingCloudSave', '1');
    await loadState();
    return { faltanS: faltan(S) };
  }, { armarSrc: armar.toString(), faltanSrc });
  expect(r.faltanS).toEqual([]);
  await cmPage.waitForTimeout(3200); await idle(cmPage);
  const enNube = await cmPage.evaluate(async src => eval('(' + src + ')')(JSON.parse((await _DOC().get()).data().state)), faltanSrc);
  expect(enNube, 'faltan en la nube tras subir el merge').toEqual([]);
});

test('(a) ida y vuelta entre dos dispositivos: ninguno pierde nada', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async ({ armarSrc, faltanSrc }) => {
    const armar = eval('(' + armarSrc + ')'), faltan = eval('(' + faltanSrc + ')');
    const clone = o => JSON.parse(JSON.stringify(o));
    const { cloud, local } = armar({});
    await _DOC().set({ state: JSON.stringify(cloud), _savedAt: 2000, _wid: 'pc', _dev: 'PC' });
    localStorage.removeItem('_lastSyncedStateStr');
    // 1) iPhone reconecta sin ancestro y sube.
    _lastSyncedSavedAt = null; _lastSyncedState = null; S = clone(local);
    await _fbDoSave();
    const tras1 = JSON.parse((await _DOC().get()).data().state);
    // 2) La PC (confirmada, con su estado anterior) hace un cambio nuevo en otra clave objeto y guarda: junta lo del iPhone.
    _lastSyncedSavedAt = 2000; _lastSyncedState = clone(cloud);
    S = clone(cloud); S.comidas.registro['2026-11-21'] = { merienda: { al1: { ok: true, cant: 30 } } };
    await _fbDoSave();
    const tras2 = JSON.parse((await _DOC().get()).data().state);
    // 3) El iPhone recibe lo de la PC (carga limpia desde la nube).
    await loadState();
    return { faltan1: faltan(tras1), faltan2: faltan(tras2), pcCambio: !!(tras2.comidas.registro['2026-11-21']), faltanIphone: faltan(S), iphoneVePc: !!(S.comidas.registro['2026-11-21']) };
  }, { armarSrc: armar.toString(), faltanSrc });
  expect(r.faltan1, 'tras subir el iPhone').toEqual([]);
  expect(r.faltan2, 'tras guardar la PC').toEqual([]);
  expect(r.pcCambio, 'el cambio nuevo de la PC quedó').toBe(true);
  expect(r.faltanIphone, 'el iPhone al recargar').toEqual([]);
  expect(r.iphoneVePc, 'el iPhone ve el cambio nuevo de la PC').toBe(true);
});

// Recarga real (cmPage.reload): el mock de Firestore vive en memoria y se vacía al recargar, así que el documento de la
// nube se re-siembra desde localStorage en un init script. `nubeCaida` simula el iPhone abriendo sin conexión.
async function recargarConNube(cmPage, { nubeCaida }) {
  await cmPage.addInitScript((caida) => {
    try {
      const d = localStorage.getItem('__testCloudDoc');
      if (d && window.firebase) window.firebase.firestore().collection('appdata').doc('lifedash_v2').set(JSON.parse(d));
      if (caida) {
        window.__cmNubeCaida = true;
        const fs0 = window.firebase.firestore, off = () => Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' }));
        const wrap = function () {
          const db = fs0.apply(this, arguments);
          return Object.assign({}, db, {
            runTransaction: fn => (window.__cmNubeCaida ? off() : db.runTransaction(fn)),
            collection: n => { const c = db.collection(n); return Object.assign({}, c, { doc: id => { const dr = c.doc(id); return Object.assign({}, dr, { get: () => (window.__cmNubeCaida ? off() : dr.get()) }); } }); },
          });
        };
        Object.assign(wrap, fs0); window.firebase.firestore = wrap;
      }
    } catch (e) {}
  }, nubeCaida);
  await cmPage.reload();
  await waitForBoot(cmPage);
  await completeLoginOverlay(cmPage);
}

async function sembrarDocumentoGrande(cmPage) {
  return cmPage.evaluate(async ({ armarSrc }) => {
    const armar = eval('(' + armarSrc + ')');
    const { cloud, local } = armar({ pesado: true });
    const doc = { state: JSON.stringify(cloud), _savedAt: 4000, _wid: 'pc', _dev: 'PC' };
    localStorage.setItem('__testCloudDoc', JSON.stringify(doc));
    localStorage.removeItem('_lastSyncedStateStr');            // sin ancestro: el peor caso
    S = JSON.parse(JSON.stringify(local));
    localStorage.setItem('lifedash_v2', JSON.stringify(S)); localStorage.setItem('_pendingCloudSave', '1');
    return Math.round(doc.state.length / 1024);
  }, { armarSrc: armar.toString() });
}

const estadoFinal = (cmPage) => cmPage.evaluate(async src => {
  const faltan = eval('(' + src + ')');
  const ev = JSON.parse(localStorage.getItem('_syncEvents') || '[]');
  const enNube = JSON.parse((await _DOC().get()).data().state);
  return { carga: (JSON.parse(localStorage.getItem('_loadDiag') || '{}')).src, rama: (JSON.parse(localStorage.getItem('_saveDiag') || '[]')[0] || {}).branch,
           faltanS: faltan(S), faltanNube: faltan(enNube), nTx: enNube.transactions.length, achique: ev.some(e => e.tipo === 'bloqueado-achique') };
}, faltanSrc);

test('(c) recarga real, doc >= 300 KB, el iPhone abre SIN nube y reconecta: no se pierde lo cargado', async ({ cmPage }) => {
  test.setTimeout(120000);
  await idle(cmPage);
  expect(await sembrarDocumentoGrande(cmPage)).toBeGreaterThanOrEqual(300);
  await recargarConNube(cmPage, { nubeCaida: true });
  expect(await cmPage.evaluate(() => (JSON.parse(localStorage.getItem('_loadDiag') || '{}')).src), 'arrancó sin nube').toBe('local-error');
  await idle(cmPage);
  await cmPage.evaluate(async () => { window.__cmNubeCaida = false; await _fbDoSave(); });   // vuelve la conexión
  await cmPage.waitForTimeout(3500); await idle(cmPage);
  const r = await estadoFinal(cmPage);
  expect(r.rama).toBe('rescue-unconfirmed');
  expect(r.achique).toBe(false);
  expect(r.nTx, 'la nube grande sigue entera').toBeGreaterThanOrEqual(1800);
  expect(r.faltanS, 'faltan en S').toEqual([]);
  expect(r.faltanNube, 'faltan en la nube').toEqual([]);
});

test('(c2) recarga real, doc >= 300 KB, cambios pendientes sin ancestro: no se pierde lo cargado', async ({ cmPage }) => {
  test.setTimeout(120000);
  await idle(cmPage);
  expect(await sembrarDocumentoGrande(cmPage)).toBeGreaterThanOrEqual(300);
  await recargarConNube(cmPage, { nubeCaida: false });
  await idle(cmPage);
  await cmPage.waitForTimeout(3500); await idle(cmPage);
  const r = await estadoFinal(cmPage);
  expect(r.carga).toBe('cloud');
  expect(r.achique).toBe(false);
  expect(r.nTx).toBeGreaterThanOrEqual(1800);
  expect(r.faltanS, 'faltan en S').toEqual([]);
  expect(r.faltanNube, 'faltan en la nube').toEqual([]);
});

// ── Redes de seguridad que el arreglo NO debe tocar ─────────────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path');
const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

test('redes de seguridad vivas: bloqueado-achique, _estadoCargado, _localChico y snapshots', () => {
  const app = leer('app.js');
  expect(app).toContain("_dgRes = 'bloqueado-achique'");
  expect(app).toContain("_syncEv('bloqueado-achique'");
  expect(app).toContain('let _estadoCargado = false;');
  expect(app).toContain('if (!_estadoCargado) return;');
  expect(app).toContain('_estadoCargado = true;');
  expect(app).toContain("* 0.5;");                                   // _localChico: umbral del 50 % contra el ancestro
  expect((app.match(/_localChico/g) || []).length).toBeGreaterThanOrEqual(2);   // declaración + rama merge-sin-confirmar
  expect(app).toContain("_col.doc('snap_' + savedAt).set(");
  expect(app).toContain("_col.doc('snapidx')");
});

test('fixes.json: todos los markers de sync/rescate siguen presentes en su archivo (CRLF normalizado)', () => {
  const fx = JSON.parse(leer('fixes.json')).fixes;
  const sync = fx.filter(x => /^(sync-|state-defaults|rescue|rescate|guard-tamano|onsnapshot|.*-sync-rescue)/.test(x.id));
  expect(sync.length).toBeGreaterThan(20);
  const faltan = sync.filter(x => !leer(x.file).includes(String(x.marker).replace(/\r\n/g, '\n'))).map(x => x.id);
  expect(faltan, 'markers ausentes (posible fix revertido)').toEqual([]);
});

test('_localChico: un estado local mucho más chico que el ancestro NO toma bajas de la nube (cae a rescate, no a merge)', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async ({ armarSrc }) => {
    const armar = eval('(' + armarSrc + ')');
    const { base, cloud } = armar({});
    await _DOC().set({ state: JSON.stringify(cloud), _savedAt: 2000, _wid: 'pc', _dev: 'PC' });
    localStorage.setItem('_lastSyncedStateStr', JSON.stringify(base));
    _lastSyncedSavedAt = null; _lastSyncedState = null;
    S = { _savedAt: 1 };                                      // arranque con valores de fábrica (< 50 % del ancestro)
    await _fbDoSave();
    const enNube = JSON.parse((await _DOC().get()).data().state);
    const ev = JSON.parse(localStorage.getItem('_syncEvents') || '[]');
    return { tx: enNube.transactions.length, txCloud: cloud.transactions.length, com: Object.keys((enNube.comidas || {}).registro || {}).length, achique: ev.some(e => e.tipo === 'bloqueado-achique') };
  }, { armarSrc: armar.toString() });
  expect(r.tx, 'la nube no se vació').toBeGreaterThanOrEqual(r.txCloud);
  expect(r.com, 'las comidas de la nube siguen').toBeGreaterThanOrEqual(3);
});
