// Meta del día: crear una, completarla y borrarla — verificando S.goals en cada paso.
'use strict';
const { test, expect } = require('./support/fixtures');

test('crear, completar y borrar una meta de hoy', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="vida"]');
  await expect(cmPage.locator('#tab-vida')).toHaveClass(/active/);

  // La tarjeta interactiva de metas (#metas-hoy-card) vive oculta en su
  // posición original (proyectos-overlay.css: "display:none") y solo se
  // muestra reubicada dentro del overlay de Planificación — abrirlo con su
  // API pública, igual que hace el item "Planificación" del speed-dial.
  await cmPage.evaluate(() => window.plannerOverlayOpen());
  await expect(cmPage.locator('#ov-planner')).toHaveClass(/show/);
  await expect(cmPage.locator('#metas-hoy-card')).toBeVisible();

  const text = 'Meta E2E ' + Date.now();

  async function addGoalToday(goalText) {
    await cmPage.click('#metas-hoy-card button:has-text("+ Meta")');
    await expect(cmPage.locator('#modal-add-goal')).toHaveClass(/open/);
    await cmPage.fill('#newGoalText', goalText);
    await cmPage.click('#modal-add-goal button:has-text("Agregar")');
    await expect(cmPage.locator('#modal-add-goal')).not.toHaveClass(/open/);
  }

  // Meta señuelo que queda sin completar: evita que al completar `text` se
  // dispare el banner de "misión cumplida" (todas las metas del día done),
  // cuyo overlay de confetti podría tapar los botones del resto del test.
  await addGoalToday('Meta E2E señuelo (no tocar)');
  await addGoalToday(text);

  const created = await cmPage.evaluate((t) => {
    const today = window.getActiveDate();
    return (S.goals[today] || []).find((g) => g.text === t);
  }, text);
  expect(created, 'la meta debe existir en S.goals[hoy]').toBeTruthy();
  expect(created.done).toBe(false);

  // Completar (vía el checkbox renderizado para esta meta)
  const goalItem = cmPage.locator('.goal-item', { hasText: text }).first();
  await expect(goalItem).toBeVisible();
  await goalItem.locator('.check-box').click();

  await expect
    .poll(async () =>
      cmPage.evaluate((t) => {
        const today = window.getActiveDate();
        const g = (S.goals[today] || []).find((x) => x.text === t);
        return g ? g.done : null;
      }, text)
    )
    .toBe(true);

  // Borrar
  await goalItem.locator('.goal-del').click();

  await expect
    .poll(async () =>
      cmPage.evaluate((t) => {
        const today = window.getActiveDate();
        return (S.goals[today] || []).some((x) => x.text === t);
      }, text)
    )
    .toBe(false);
});
