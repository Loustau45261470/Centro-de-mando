// Sync: S.seasonals (gastos estacionales) no se pierde cuando la nube trae un estado sin ese estacional.
// Reproduce el camino real de app.js: _rescueLocal(_mergeStates(base, local, cloud), local).
'use strict';
const { test, expect } = require('./support/fixtures');

test('rescate: un estacional solo-local sobrevive cuando la nube no lo tiene', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const s = (id) => ({ id, name: id, month: 12, amount: 1000, category: 'food' });
    const cloud = { seasonals: [s('c1')] };
    const local = { seasonals: [s('c1'), s('l1')] };
    return _rescueLocal(cloud, local).seasonals.map((x) => x.id);
  });
  expect(ids).toEqual(['c1', 'l1']);
});

test('merge 3-vias + rescate: ambos dispositivos cambiaron seasonals, no se pierde el local', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const s = (id) => ({ id, name: id, month: 12, amount: 1000, category: 'food' });
    const base = { seasonals: [s('b1')] };
    const local = { seasonals: [s('b1'), s('l1')] };
    const cloud = { seasonals: [s('b1'), s('c1')] };
    return _rescueLocal(_mergeStates(base, local, cloud), local).seasonals.map((x) => x.id);
  });
  expect(ids.sort()).toEqual(['b1', 'c1', 'l1']);
});

test('estado nuevo: seasonals arranca como lista vacia', async ({ cmPage }) => {
  expect(await cmPage.evaluate(() => DEFAULT_STATE.seasonals)).toEqual([]);
  expect(await cmPage.evaluate(() => Array.isArray(S.seasonals))).toBe(true);
});
