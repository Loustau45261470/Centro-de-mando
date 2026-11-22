// Pendientes de la auditoría de sync (22/11/2026): hábitos de fábrica que reaparecían, relojes desfasados entre
// dispositivos y reconexión del listener en vivo.
'use strict';
const { test, expect } = require('./support/fixtures');
const idle = page => page.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress, null, { timeout: 20000 });

test('un hábito de fábrica borrado no vuelve a aparecer al recargar', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async () => {
    S.habitTrackers.conocimiento = (S.habitTrackers.conocimiento || []).filter(h => h.id !== 'habit-lectura');
    S.habitTrackers.vida = [...(S.habitTrackers.vida || []), { id: 'h-mio', name: 'Mío', emoji: 'x', days: {} }];
    S._habitosBaseCreados = true;
    const st = JSON.stringify(S);
    await _DOC().set({ state: st, _savedAt: 9000, _wid: 'pc9', _dev: 'PC' });
    localStorage.setItem('lifedash_v2', st); localStorage.removeItem('_pendingCloudSave');
    await loadState();
    return (S.habitTrackers.conocimiento || []).some(h => h.id === 'habit-lectura');
  });
  expect(r).toBe(false);
});

test('usuario con hábitos y sin la marca (datos de antes del arreglo): no se recrean los borrados, se marca', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async () => {
    const st = JSON.parse(JSON.stringify(S));
    delete st._habitosBaseCreados;
    st.habitTrackers = { vida: [{ id: 'h-mio', name: 'Mío', emoji: 'x', days: {} }], finanzas: [], salud: [], conocimiento: [], ia: [] };
    await _DOC().set({ state: JSON.stringify(st), _savedAt: 9100, _wid: 'pc91', _dev: 'PC' });
    localStorage.removeItem('_pendingCloudSave');
    await loadState();
    return { lectura: S.habitTrackers.conocimiento.some(h => h.id === 'habit-lectura'), marca: S._habitosBaseCreados };
  });
  expect(r).toEqual({ lectura: false, marca: true });
});

test('instalación nueva (sin hábitos): se crean los de fábrica una vez', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async () => {
    const st = JSON.parse(JSON.stringify(S));
    delete st._habitosBaseCreados;
    st.habitTrackers = { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] };
    await _DOC().set({ state: JSON.stringify(st), _savedAt: 9200, _wid: 'pc92', _dev: 'PC' });
    localStorage.removeItem('_pendingCloudSave');
    await loadState();
    return S.habitTrackers.conocimiento.some(h => h.id === 'habit-lectura') && S.habitTrackers.salud.some(h => h.id === 'habit-entrenamientos');
  });
  expect(r).toBe(true);
});

const fakeSnap = (S0, sa, wid, txId) => { const st = JSON.parse(JSON.stringify(S0)); st.transactions = [{ id: txId, date: '2026-11-22', name: txId, type: 'expense', amount: 1 }, ...(st.transactions || [])];
  return { exists: true, metadata: { fromCache: false }, data: () => ({ state: JSON.stringify(st), _savedAt: sa, _wid: wid, _dev: 'PC' }) }; };

test('reloj de la PC 2 minutos atrasado: un cambio nuevo de la PC igual se aplica', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate((fs) => {
    const fakeSnap = eval(fs);
    const cb = window.__cmSnapCbs.filter(x => x.path === 'appdata/lifedash_v2').pop().cb;
    localStorage.removeItem('_pendingCloudSave');
    _lastSyncedSavedAt = 10000000;
    cb(fakeSnap(S, 10000000 - 120000, 'wid-pc-nuevo', 't-reloj-atrasado'));
    return S.transactions.some(t => t.id === 't-reloj-atrasado');
  }, fakeSnap.toString());
  expect(r).toBe(true);
});

test('una versión que ya tuvimos (copia vieja) no se vuelve a aplicar, aunque su hora sea reciente', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate((fs) => {
    const fakeSnap = eval(fs);
    const cb = window.__cmSnapCbs.filter(x => x.path === 'appdata/lifedash_v2').pop().cb;
    localStorage.removeItem('_pendingCloudSave');
    _lastSyncedSavedAt = 10000000;
    cb(fakeSnap(S, 10000000, 'wid-A', 't-version-A'));            // la aplicamos: queda vista
    cb(fakeSnap(S, 10000100, 'wid-B', 't-version-B'));            // otra más nueva: es la actual
    const sinA = JSON.parse(JSON.stringify(S));
    cb(fakeSnap(sinA, 10000050, 'wid-A', 't-version-A-vieja'));   // vuelve A (la caché del iPhone)
    return { vieja: S.transactions.some(t => t.id === 't-version-A-vieja'), b: S.transactions.some(t => t.id === 't-version-B') };
  }, fakeSnap.toString());
  expect(r).toEqual({ vieja: false, b: true });
});

test('si la conexión en vivo se corta, se reconecta sola al volver a la app', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(() => {
    const antes = window.__cmSnapCbs.length;
    _listenerVivo = false;                       // como tras un error de permisos
    _reanudarListener();
    const despues = window.__cmSnapCbs.length;
    _reanudarListener();                         // ya vivo: no duplica
    return { antes, despues, otra: window.__cmSnapCbs.length };
  });
  expect(r.despues).toBe(r.antes + 1);
  expect(r.otra).toBe(r.despues);
});
