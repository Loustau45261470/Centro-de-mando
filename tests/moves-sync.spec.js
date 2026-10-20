// Sync: S.moves (movimientos entre cuentas) no se pierde cuando la nube trae un estado sin ese movimiento.
// Reproduce el camino real de app.js: _rescueLocal(_mergeStates(base, local, cloud), local).
'use strict';
const { test, expect } = require('./support/fixtures');

test('rescate: un movimiento solo-local sobrevive cuando la nube no lo tiene', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const mv = (id) => ({ id, date: '2026-10-20', from: 'uala', to: 'inv', amount: 1000, note: '' });
    const cloud = { moves: [mv('c1')] };
    const local = { moves: [mv('c1'), mv('l1')] };
    return _rescueLocal(cloud, local).moves.map((x) => x.id);
  });
  expect(ids).toEqual(['c1', 'l1']);
});

test('merge 3-vias + rescate: ambos dispositivos cambiaron moves, no se pierde el local', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const mv = (id) => ({ id, date: '2026-10-20', from: 'uala', to: 'inv', amount: 1000, note: '' });
    const base = { moves: [mv('b1')] };
    const local = { moves: [mv('b1'), mv('l1')] };
    const cloud = { moves: [mv('b1'), mv('c1')] };
    return _rescueLocal(_mergeStates(base, local, cloud), local).moves.map((x) => x.id);
  });
  expect(ids.sort()).toEqual(['b1', 'c1', 'l1']);
});
