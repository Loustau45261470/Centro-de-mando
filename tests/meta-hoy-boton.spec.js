// Tarjeta "Metas de hoy" de Vida: tiene su propio botón "+ Meta" que abre el modal de agregar meta de hoy
// (el mismo que usa Planificación), y el estado vacío ya no manda a Planificación.
'use strict';
const { test, expect } = require('./support/fixtures');

async function irAVida(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
}

test('1) con el día vacío, el texto menciona el botón y "+ Meta" abre el modal de agregar meta de hoy', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await cmPage.evaluate(() => { S.goals[getActiveDate()] = []; renderMetasReadonly(); });
  const tarjeta = cmPage.locator('#metas-readonly-card');
  await expect(tarjeta.locator('.mrd-empty')).toContainText('+ Meta');
  await expect(tarjeta.locator('.mrd-empty')).not.toContainText('Planificación');
  await tarjeta.getByRole('button', { name: '+ Meta' }).click();
  await expect(cmPage.locator('#modal-add-goal')).toHaveClass(/open/);
  expect(consoleErrors).toEqual([]);
});

test('2) la meta agregada desde la tarjeta aparece en la lista de hoy', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await cmPage.evaluate(() => { S.goals[getActiveDate()] = []; renderMetasReadonly(); });
  await cmPage.locator('#metas-readonly-card').getByRole('button', { name: '+ Meta' }).click();
  await expect(cmPage.locator('#modal-add-goal')).toHaveClass(/open/);
  await cmPage.fill('#newGoalText', 'Llamar al contador');
  await cmPage.click('#modal-add-goal .btn-primary');
  await expect(cmPage.locator('#modal-add-goal')).not.toHaveClass(/open/);
  await expect(cmPage.locator('#metas-readonly-card .mrd-text')).toHaveText('Llamar al contador');
  expect(consoleErrors).toEqual([]);
});

test('3) con metas cargadas el botón sigue ahí', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await cmPage.evaluate(() => { S.goals[getActiveDate()] = [{ text: 'Estudiar', done: false, priority: 'mid' }]; renderMetasReadonly(); });
  await expect(cmPage.locator('#metas-readonly-card .mrd-text')).toHaveText('Estudiar');
  await expect(cmPage.locator('#metas-readonly-card').getByRole('button', { name: '+ Meta' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
