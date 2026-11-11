// Tareas de ayer sin hacer: ya NO hay cartel "Te quedaron N tareas de ayer" ni botón "Traer de ayer".
// Las no hechas pasan solas al día siguiente como Pendientes (ver tests/pendientes.spec.js); acá queda lo que sigue vigente:
// que el cartel y el botón no existan y que "Empujar restantes a mañana" siga igual (misma lógica compartida).
'use strict';
const { test, expect } = require('./support/fixtures');

async function irAVida(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
}
const ayerStr = (page) => page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return localStr(d); });

test('1) con tareas de ayer sin hacer no aparece ningún cartel ni botón "Traer de ayer"; nada se mueve solo', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  const ayer = await ayerStr(cmPage);
  await cmPage.evaluate((a) => {
    S.goals[a] = [{ id: 'm1', text: 'A', done: false, priority: 'mid' }, { id: 'm2', text: 'B', done: false, priority: 'mid' }];
    saveState(); renderGoals();
  }, ayer);
  await expect(cmPage.locator('#metas-ayer-aviso')).toHaveCount(0);
  await expect(cmPage.locator('.traer-ayer-btn')).toHaveCount(0);
  await expect(cmPage.getByRole('button', { name: /Traer de ayer|Pasarlas a hoy/ })).toHaveCount(0);
  // En su lugar quedan como pendientes, sin escribir nada en S.
  await expect(cmPage.locator('#pendientesCard .pend-item')).toHaveCount(2);
  expect(await cmPage.evaluate((a) => S.goals[a].length, ayer)).toBe(2);
  expect(await cmPage.evaluate(() => (S.goals[getActiveDate()] || []).length)).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('2) "Empujar restantes a mañana" sigue igual (misma lógica compartida)', async ({ cmPage }) => {
  await irAVida(cmPage);
  await cmPage.evaluate(() => {
    const hoy = getActiveDate();
    S.goals[hoy] = [{ id: 'x1', text: 'P', done: false, priority: 'mid' }, { id: 'x2', text: 'Q', done: true, priority: 'mid' }];
    S.goals[getTomorrow()] = [{ id: 'x3', text: 'P', done: false, priority: 'mid' }];
    window.confirm = () => true;
    pushRemaining();
  });
  expect(await cmPage.evaluate(() => S.goals[getActiveDate()].map((g) => g.text))).toEqual(['Q']);
  expect(await cmPage.evaluate(() => S.goals[getTomorrow()].map((g) => g.text))).toEqual(['P']);
});
