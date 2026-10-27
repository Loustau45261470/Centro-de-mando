// Sync: S.cardDues (vencimientos de lo ya usado de cada tarjeta) no se pierde cuando la nube trae un estado
// sin ese registro. Reproduce el camino real de app.js: _rescueLocal(_mergeStates(base, local, cloud), local).
'use strict';
const { test, expect } = require('./support/fixtures');

test('rescate: un vencimiento cargado solo en este dispositivo sobrevive cuando la nube no lo tiene', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const it = (id) => ({ id, cardId: 'nar', due: '2026-11-10', amount: 1000 });
    const cloud = { cardDues: [it('cd:nar:2026-11-10')] };
    const local = { cardDues: [it('cd:nar:2026-11-10'), it('cd:nar:2026-12-10')] };
    return _rescueLocal(cloud, local).cardDues.map((x) => x.id);
  });
  expect(ids).toEqual(['cd:nar:2026-11-10', 'cd:nar:2026-12-10']);
});

test('merge 3-vias + rescate: ambos dispositivos cargaron vencimientos, no se pierde el local', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const it = (id) => ({ id, cardId: 'nar', due: '2026-11-10', amount: 1000 });
    const base = { cardDues: [it('b1')] };
    const local = { cardDues: [it('b1'), it('l1')] };
    const cloud = { cardDues: [it('b1'), it('c1')] };
    return _rescueLocal(_mergeStates(base, local, cloud), local).cardDues.map((x) => x.id);
  });
  expect(ids.sort()).toEqual(['b1', 'c1', 'l1']);
});

test('dos dispositivos que cargan el mismo mes de la misma tarjeta no duplican (id determinístico)', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const it = (amount) => ({ id: 'cd:nar:2026-11-10', cardId: 'nar', due: '2026-11-10', amount });
    return _rescueLocal({ cardDues: [it(1)] }, { cardDues: [it(2)] }).cardDues.map((x) => x.id);
  });
  expect(ids).toEqual(['cd:nar:2026-11-10']);
});

test('DEFAULT_STATE trae cardDues vacío', async ({ cmPage }) => {
  expect(await cmPage.evaluate(() => DEFAULT_STATE.cardDues)).toEqual([]);
});
