// Toggle de hábito: marcar la celda de hoy en el calendario del hábito activo
// y verificar que el cambio persiste en localStorage (lifedash_v2).
'use strict';
const { test, expect } = require('./support/fixtures');

test('marcar un hábito persiste en localStorage', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="vida"]');
  await expect(cmPage.locator('#tab-vida')).toHaveClass(/active/);

  const cell = cmPage.locator('#habit-cal-vida .study-cal-day.today-cell .study-cal-dot');
  await expect(cell).toBeVisible();

  const before = await cmPage.evaluate(() => {
    const habit = S.habitTrackers.vida.find((h) => h.id === 'habit-lectura');
    const today = window.getActiveDate();
    return habit.days[today] || null;
  });

  await cell.click();

  await expect
    .poll(async () =>
      cmPage.evaluate(() => {
        const habit = S.habitTrackers.vida.find((h) => h.id === 'habit-lectura');
        const today = window.getActiveDate();
        return habit.days[today] || null;
      })
    )
    .not.toBe(before);

  const afterInMemory = await cmPage.evaluate(() => {
    const habit = S.habitTrackers.vida.find((h) => h.id === 'habit-lectura');
    const today = window.getActiveDate();
    return habit.days[today] || null;
  });

  const persisted = await cmPage.evaluate(() => {
    const raw = localStorage.getItem('lifedash_v2');
    const state = JSON.parse(raw);
    const habit = state.habitTrackers.vida.find((h) => h.id === 'habit-lectura');
    const today = window.getActiveDate();
    return habit.days[today] || null;
  });

  expect(persisted).toBe(afterInMemory);
});
