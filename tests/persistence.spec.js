// Un cambio hecho en la app tiene que sobrevivir a un reload completo de la
// página (localStorage persiste; el fixture NO se re-siembra si ya hay datos —
// ver mock-firebase.js / fixtures.js).
'use strict';
const { test, expect, completeLoginOverlay, waitForBoot } = require('./support/fixtures');

test('un cambio sobrevive a recargar la página', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="vida"]');
  const text = 'Meta persistente ' + Date.now();

  // #metas-hoy-card solo es visible reubicado dentro del overlay de Planificación.
  await cmPage.evaluate(() => window.plannerOverlayOpen());
  await expect(cmPage.locator('#metas-hoy-card')).toBeVisible();

  await cmPage.click('#metas-hoy-card button:has-text("+ Meta")');
  await cmPage.fill('#newGoalText', text);
  await cmPage.click('#modal-add-goal button:has-text("Agregar")');
  await expect(cmPage.locator('#modal-add-goal')).not.toHaveClass(/open/);

  const beforeReload = await cmPage.evaluate(() => localStorage.getItem('lifedash_v2'));
  expect(beforeReload).toContain(text);

  await cmPage.reload();
  await waitForBoot(cmPage);
  await completeLoginOverlay(cmPage);

  await cmPage.click('.nav-btn[data-tab="vida"]');
  const survived = await cmPage.evaluate((t) => {
    const today = window.getActiveDate();
    return (S.goals[today] || []).some((g) => g.text === t);
  }, text);
  expect(survived, 'la meta creada antes del reload debe seguir en S.goals tras recargar').toBe(true);

  await cmPage.evaluate(() => window.plannerOverlayOpen());
  await expect(cmPage.locator('.goal-item', { hasText: text })).toBeVisible();
});
