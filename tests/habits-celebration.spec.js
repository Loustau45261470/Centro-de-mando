// Mini festejo al marcar un hábito: cartel + confetti al marcar HOY, y nada al
// rellenar un día viejo del calendario (evita 20 festejos al ponerse al día).
'use strict';
const { test, expect } = require('./support/fixtures');

const confettiCanvas = () =>
  [...document.querySelectorAll('canvas')].filter((c) => c.style.zIndex === '9999' && !c.id).length;

test('marcar un hábito de hoy lanza el mini festejo', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  await expect(cmPage.locator('#tab-salud')).toHaveClass(/active/);

  await cmPage.evaluate(() => {
    const h = S.habitTrackers.salud.find((x) => x.id === 'habit-entrenamientos');
    delete h.days[window.getActiveDate()];
    renderHabitCal('salud');
  });

  await cmPage.locator('#habit-cal-salud .study-cal-day.today-cell .study-cal-dot').click();
  await cmPage.locator('.hdm-menu .hdm-item[data-st="done"]').click();

  await expect(cmPage.locator('div[style*="missionBanner"]', { hasText: 'Entrenamientos' })).toBeVisible({ timeout: 3000 });
  await expect.poll(() => cmPage.evaluate(confettiCanvas), { timeout: 3000 }).toBeGreaterThan(0);
  // El overlay se limpia solo (no queda tapando la pantalla)
  await expect.poll(() => cmPage.evaluate(confettiCanvas), { timeout: 6000 }).toBe(0);
});

test('rellenar un día pasado no lanza el festejo', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const res = await cmPage.evaluate(() => {
    const h = S.habitTrackers.salud.find((x) => x.id === 'habit-entrenamientos');
    const d = new Date(window.getActiveDate() + 'T00:00:00');
    d.setDate(d.getDate() - 5);
    const ds = d.toISOString().slice(0, 10);
    delete h.days[ds];
    renderHabitCal('salud');
    let called = false;
    const orig = window.celebrateHabit;
    window.celebrateHabit = () => { called = true; };
    setHabitDay('salud', 'habit-entrenamientos', ds, 'done', null);
    window.celebrateHabit = orig;
    return { called, state: h.days[ds] };
  });
  expect(res.state).toBe('done');
  expect(res.called).toBe(false);
});
