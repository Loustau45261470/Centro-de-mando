// Sync: S.cardCharges (compras con tarjeta) y S.cardPayments (pagos de resumen) no se pierden
// cuando la nube trae un estado sin ese registro.
// Reproduce el camino real de app.js: _rescueLocal(_mergeStates(base, local, cloud), local).
'use strict';
const { test, expect } = require('./support/fixtures');

for (const key of ['cardCharges', 'cardPayments']) {
  test(`rescate: ${key} solo-local sobrevive cuando la nube no lo tiene`, async ({ cmPage }) => {
    const ids = await cmPage.evaluate((k) => {
      const it = (id) => ({ id, cardId: 'c', date: '2026-10-20', amount: 1000 });
      const cloud = { [k]: [it('c1')] };
      const local = { [k]: [it('c1'), it('l1')] };
      return _rescueLocal(cloud, local)[k].map((x) => x.id);
    }, key);
    expect(ids).toEqual(['c1', 'l1']);
  });

  test(`merge 3-vias + rescate: ambos dispositivos cambiaron ${key}, no se pierde el local`, async ({ cmPage }) => {
    const ids = await cmPage.evaluate((k) => {
      const it = (id) => ({ id, cardId: 'c', date: '2026-10-20', amount: 1000 });
      const base = { [k]: [it('b1')] };
      const local = { [k]: [it('b1'), it('l1')] };
      const cloud = { [k]: [it('b1'), it('c1')] };
      return _rescueLocal(_mergeStates(base, local, cloud), local)[k].map((x) => x.id);
    }, key);
    expect(ids.sort()).toEqual(['b1', 'c1', 'l1']);
  });
}

test('DEFAULT_STATE trae cardCharges y cardPayments vacíos', async ({ cmPage }) => {
  const r = await cmPage.evaluate(() => [DEFAULT_STATE.cardCharges, DEFAULT_STATE.cardPayments]);
  expect(r).toEqual([[], []]);
});
