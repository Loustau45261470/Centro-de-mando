// Regresión 22/11/2026: el iPhone, al arrancar, guardaba antes de terminar la carga (S vacío, sesión sin
// confirmar) y re-subía la copia de la nube que acababa de leer; con esa lectura vieja pisó cambios de la PC.
// Sin nada propio que subir, _fbDoSave no tiene que escribir.
'use strict';
const { test, expect } = require('./support/fixtures');

async function prepararNube(page, extra) {
  return page.evaluate(async (ex) => {
    const st = JSON.parse(JSON.stringify(S));
    st.transactions = Array.from({ length: 10 }, (_, i) => ({ id: 't-pc-' + i, date: '2026-11-21', name: 'x', type: 'expense', amount: 1 }));
    st.notas = [...(st.notas || []), { id: 'n-otro-dev', categoria: 'aprendizaje', titulo: 'De la PC', texto: 'x', fecha: '2026-11-22' }];
    await _DOC().set({ state: JSON.stringify(st), _wid: 'pc', _savedAt: 1111, _dev: 'PC' });
    _lastSyncedSavedAt = null; _lastSyncedState = null;      // como recién abierta, antes de que termine la carga
    S = ex ? { transactions: [{ id: 't-local-nueva', date: '2026-11-22', name: 'y', type: 'expense', amount: 2 }] } : {};
    await _fbDoSave();
    const d = (await _DOC().get()).data();
    const ds = JSON.parse(d.state); return { savedAt: d._savedAt, dev: d._dev, notas: (ds.notas || []).map(n => n.id), tx: (ds.transactions || []).map(t => t.id), S: (S.notas || []).map(n => n.id) };
  }, extra);
}

test('arranque sin cambios propios: no reescribe la nube y adopta lo que leyó', async ({ cmPage, consoleErrors }) => {
  const r = await prepararNube(cmPage, false);
  expect(r.savedAt, 'la nube no se reescribe').toBe(1111);
  expect(r.dev).toBe('PC');
  expect(r.S).toContain('n-otro-dev');
  const ev = await cmPage.evaluate(() => JSON.parse(localStorage.getItem('_syncEvents') || '[]').find(e => e.tipo === 'guardar-rama'));
  expect(ev.rama).toBe('sin-cambios-propios');
  expect(consoleErrors).toEqual([]);
});

test('arranque con un cambio local real: lo sigue subiendo (rescate) sin perder lo de la nube', async ({ cmPage, consoleErrors }) => {
  const r = await prepararNube(cmPage, true);
  expect(r.savedAt).not.toBe(1111);
  expect(r.notas).toContain('n-otro-dev');
  expect(r.tx).toEqual(expect.arrayContaining(['t-pc-0', 't-local-nueva']));
  expect(consoleErrors).toEqual([]);
});
