// Sync: S.carteraTx (ventas de activos de la cartera) no se pierde cuando la nube trae un estado sin esa venta.
// Reproduce el camino real de app.js: _rescueLocal(_mergeStates(base, local, cloud), local).
'use strict';
const { test, expect } = require('./support/fixtures');

test('rescate: una venta solo-local sobrevive cuando la nube no la tiene', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const v = (id) => ({ id, simbolo: 'TEST', fecha: '2026-10-20', ts: 1, unidades: 1, precio: 10, costoUnit: 8, costo: 8, resultado: 2, fechaCompra: '2026-01-02', cierra: false });
    const cloud = { carteraTx: [v('c1')] };
    const local = { carteraTx: [v('c1'), v('l1')] };
    return _rescueLocal(cloud, local).carteraTx.map((x) => x.id);
  });
  expect(ids).toEqual(['c1', 'l1']);
});

test('merge 3-vias + rescate: ambos dispositivos vendieron, no se pierde la local', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const v = (id) => ({ id, simbolo: 'TEST', fecha: '2026-10-20', ts: 1, unidades: 1, precio: 10, costoUnit: 8, costo: 8, resultado: 2, fechaCompra: '2026-01-02', cierra: false });
    const base = { carteraTx: [v('b1')] };
    const local = { carteraTx: [v('b1'), v('l1')] };
    const cloud = { carteraTx: [v('b1'), v('c1')] };
    return _rescueLocal(_mergeStates(base, local, cloud), local).carteraTx.map((x) => x.id);
  });
  expect(ids.sort()).toEqual(['b1', 'c1', 'l1']);
});

test('estado nuevo: carteraTx arranca como lista vacia', async ({ cmPage }) => {
  expect(await cmPage.evaluate(() => DEFAULT_STATE.carteraTx)).toEqual([]);
  expect(await cmPage.evaluate(() => Array.isArray(S.carteraTx))).toBe(true);
});
