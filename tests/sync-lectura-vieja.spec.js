// Regresión 22/11/2026: el iPhone leía como "del servidor" (fromCache=false) una copia de su caché de horas/días
// atrás y escribía encima de lo que la PC ya había guardado. La escritura ahora va en una transacción que compara
// contra el servidor; si la versión leída no es la vigente, recalcula (merge) sobre la del servidor.
'use strict';
const { test, expect } = require('./support/fixtures');

const PATH = 'appdata/lifedash_v2';
const tx = (id) => ({ id, date: '2026-11-22', name: id, type: 'expense', amount: 1 });

// Deja la nube en una versión nueva "de la PC" y hace que get() devuelva la versión vieja (caché del iPhone).
async function nubeNuevaYLecturaVieja(page, { confirmada }) {
  await page.evaluate(async ({ PATH, confirmada, txPc, txVieja }) => {
    const base = JSON.parse(JSON.stringify(S));
    base.transactions = [txVieja, ...Array.from({ length: 10 }, (_, i) => ({ id: 't-base-' + i, date: '2026-11-20', name: 'b', type: 'expense', amount: 1 }))];
    const vieja = { state: JSON.stringify(base), _wid: 'iph', _savedAt: 1000, _dev: 'iPhone' };
    const nueva = JSON.parse(JSON.stringify(base)); nueva.transactions = [txPc, ...nueva.transactions];
    await _DOC().set({ state: JSON.stringify(nueva), _wid: 'pc', _savedAt: 2000, _dev: 'PC' });
    window.__cmLecturaVieja = { [PATH]: vieja };
    if (confirmada) { S = JSON.parse(JSON.stringify(base)); _lastSyncedSavedAt = 1000; _lastSyncedState = JSON.parse(JSON.stringify(base)); }
    else { S = {}; _lastSyncedSavedAt = null; _lastSyncedState = null; }
  }, { PATH, confirmada, txPc: tx('t-pc-nueva'), txVieja: tx('t-vieja') });
}

const leerNube = (page) => page.evaluate(async () => {
  window.__cmLecturaVieja = null;
  const d = (await _DOC().get()).data();
  return { savedAt: d._savedAt, dev: d._dev, tx: JSON.parse(d.state).transactions.map(t => t.id) };
});
const eventos = (page, tipo) => page.evaluate(t => JSON.parse(localStorage.getItem('_syncEvents') || '[]').filter(e => e.tipo === t), tipo);

test('sesión abierta con lectura vieja: un cambio local se combina con lo de la PC, no lo pisa', async ({ cmPage, consoleErrors }) => {
  await nubeNuevaYLecturaVieja(cmPage, { confirmada: true });
  await cmPage.evaluate(async (t) => { S.transactions = [t, ...S.transactions]; await _fbDoSave(); }, tx('t-iphone'));
  await cmPage.waitForFunction(() => !_fbSaveInProgress);
  const r = await leerNube(cmPage);
  expect(r.tx, 'lo de la PC sigue').toContain('t-pc-nueva');
  expect(r.tx, 'lo del iPhone se subió').toContain('t-iphone');
  expect(r.savedAt).not.toBe(2000);
  const lv = await eventos(cmPage, 'lectura-vieja');
  expect(lv[0]).toEqual(expect.objectContaining({ leida: 1000, servidor: 2000 }));
  expect(consoleErrors).toEqual([]);
});

test('arranque con lectura vieja y sin cambios propios: no escribe nada', async ({ cmPage, consoleErrors }) => {
  await nubeNuevaYLecturaVieja(cmPage, { confirmada: false });
  await cmPage.evaluate(async () => { await _fbDoSave(); });
  const r = await leerNube(cmPage);
  expect(r.savedAt).toBe(2000);
  expect(r.dev).toBe('PC');
  expect(r.tx).toContain('t-pc-nueva');
  expect(consoleErrors).toEqual([]);
});

test('arranque con lectura vieja y un cambio local real: sube el cambio sin perder lo de la PC', async ({ cmPage, consoleErrors }) => {
  await nubeNuevaYLecturaVieja(cmPage, { confirmada: false });
  await cmPage.evaluate(async (t) => { S = { transactions: [t] }; await _fbDoSave(); }, tx('t-iphone-arranque'));
  await cmPage.waitForFunction(() => !_fbSaveInProgress);
  const r = await leerNube(cmPage);
  expect(r.tx).toEqual(expect.arrayContaining(['t-pc-nueva', 't-iphone-arranque', 't-vieja']));
  expect((await eventos(cmPage, 'lectura-vieja')).length).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});

test('sin lectura vieja el guardado normal sigue igual (una sola escritura, sin reintento)', async ({ cmPage, consoleErrors }) => {
  await cmPage.evaluate(async (t) => { S.transactions = [t, ...(S.transactions || [])]; await _fbDoSave(); }, tx('t-normal'));
  const r = await leerNube(cmPage);
  expect(r.tx).toContain('t-normal');
  expect((await eventos(cmPage, 'lectura-vieja')).length).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('arranque: loadState toma la versión del servidor aunque get() devuelva la copia vieja de la caché', async ({ cmPage, consoleErrors }) => {
  await nubeNuevaYLecturaVieja(cmPage, { confirmada: false });
  const r = await cmPage.evaluate(async () => {
    await loadState();
    window.__cmLecturaVieja = null;
    return { savedAt: _lastSyncedSavedAt, tx: (S.transactions || []).map(t => t.id) };
  });
  expect(r.savedAt).toBe(2000);
  expect(r.tx).toContain('t-pc-nueva');
  expect(consoleErrors).toEqual([]);
});

test('volver a la app: syncOnFocus toma la versión del servidor, no la copia vieja', async ({ cmPage, consoleErrors }) => {
  await nubeNuevaYLecturaVieja(cmPage, { confirmada: true });
  const r = await cmPage.evaluate(async () => {
    await _syncOnFocus();
    window.__cmLecturaVieja = null;
    return { savedAt: _lastSyncedSavedAt, tx: (S.transactions || []).map(t => t.id) };
  });
  expect(r.savedAt).toBe(2000);
  expect(r.tx).toContain('t-pc-nueva');
  expect(consoleErrors).toEqual([]);
});

test('listener en vivo: una versión más vieja que la que ya tenemos no se aplica; una más nueva sí', async ({ cmPage, consoleErrors }) => {
  const r = await cmPage.evaluate(async () => {
    const cb = (window.__cmSnapCbs || []).filter(x => x.path === 'appdata/lifedash_v2').pop().cb;
    const fake = (sa, txId) => { const st = JSON.parse(JSON.stringify(S)); st.transactions = [{ id: txId, date: '2026-11-22', name: txId, type: 'expense', amount: 1 }, ...(st.transactions || [])];
      return { exists: true, metadata: { fromCache: true }, data: () => ({ state: JSON.stringify(st), _savedAt: sa, _wid: 'otro', _dev: 'iPhone' }) }; };
    _lastSyncedSavedAt = 5000;
    cb(fake(4000, 't-snap-vieja'));
    const tieneVieja = (S.transactions || []).some(t => t.id === 't-snap-vieja');
    cb(fake(6000, 't-snap-nueva'));
    const tieneNueva = (S.transactions || []).some(t => t.id === 't-snap-nueva');
    return { tieneVieja, tieneNueva, last: _lastSyncedSavedAt };
  });
  expect(r.tieneVieja).toBe(false);
  expect(r.tieneNueva).toBe(true);
  expect(r.last).toBe(6000);
  expect(consoleErrors).toEqual([]);
});

test('un cambio hecho mientras otro guardado está en vuelo también llega a la nube (y queda pendiente hasta entonces)', async ({ cmPage, consoleErrors }) => {
  const pendienteEnMedio = await cmPage.evaluate(async () => {
    const t = id => ({ id, date: '2026-11-22', name: id, type: 'expense', amount: 1 });
    S.transactions = [t('t-primero'), ...(S.transactions || [])];
    const p1 = _fbDoSave();                         // guardado en vuelo
    S.transactions = [t('t-durante'), ...S.transactions];
    _fbDoSave();                                    // llega con el lock tomado
    await p1;
    return localStorage.getItem('_pendingCloudSave');
  });
  expect(pendienteEnMedio, 'el cambio de en medio sigue marcado pendiente').toBe('1');
  await cmPage.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress && !localStorage.getItem('_pendingCloudSave'), null, { timeout: 15000 });
  const r = await leerNube(cmPage);
  expect(r.tx).toEqual(expect.arrayContaining(['t-primero', 't-durante']));
  expect(consoleErrors).toEqual([]);
});
