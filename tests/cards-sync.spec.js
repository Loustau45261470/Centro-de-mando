// Sync: S.cards (tarjetas de crédito) no se pierde cuando la nube trae un estado sin esa tarjeta.
// Reproduce el camino real de app.js: _rescueLocal(_mergeStates(base, local, cloud), local).
'use strict';
const { test, expect } = require('./support/fixtures');

test('rescate: una tarjeta solo-local sobrevive cuando la nube no la tiene', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const card = (id) => ({ id, name: id, limit: 1000, closeDay: 1, dueDay: 10, openingUsed: 0 });
    const cloud = { cards: [card('c1')] };
    const local = { cards: [card('c1'), card('l1')] };
    return _rescueLocal(cloud, local).cards.map((x) => x.id);
  });
  expect(ids).toEqual(['c1', 'l1']);
});

test('merge 3-vias + rescate: ambos dispositivos cambiaron cards, no se pierde la local', async ({ cmPage }) => {
  const ids = await cmPage.evaluate(() => {
    const card = (id) => ({ id, name: id, limit: 1000, closeDay: 1, dueDay: 10, openingUsed: 0 });
    const base = { cards: [card('b1')] };
    const local = { cards: [card('b1'), card('l1')] };
    const cloud = { cards: [card('b1'), card('c1')] };
    return _rescueLocal(_mergeStates(base, local, cloud), local).cards.map((x) => x.id);
  });
  expect(ids.sort()).toEqual(['b1', 'c1', 'l1']);
});
