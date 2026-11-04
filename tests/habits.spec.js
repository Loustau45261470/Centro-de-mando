// Marcar un hábito: tocar la celda de hoy abre el menú, elegir "Hecho" persiste en
// localStorage (lifedash_v2). Usa el hábito sembrado de Salud (el de "vida" ya no existe).
'use strict';
const { test, expect } = require('./support/fixtures');

const leer = (page) =>
  page.evaluate(() => {
    const h = S.habitTrackers.salud.find((x) => x.id === 'habit-entrenamientos');
    return h.days[window.getActiveDate()] || null;
  });

test('marcar un hábito persiste en localStorage', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  await expect(cmPage.locator('#tab-salud')).toHaveClass(/active/);

  const cell = cmPage.locator('#habit-cal-salud .study-cal-day.today-cell .study-cal-dot');
  await expect(cell).toBeVisible();
  expect(await leer(cmPage)).toBeNull();

  await cell.click();
  await cmPage.locator('.hdm-menu .hdm-item[data-st="done"]').click();

  await expect.poll(() => leer(cmPage)).toBe('done');

  const persisted = await cmPage.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('lifedash_v2'));
    const h = state.habitTrackers.salud.find((x) => x.id === 'habit-entrenamientos');
    return h.days[window.getActiveDate()] || null;
  });
  expect(persisted).toBe('done');
});
