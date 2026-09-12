// Mini festejo al marcar un hábito: cartel + confetti al marcar HOY, y nada al
// rellenar un día viejo del calendario (evita 20 festejos al ponerse al día).
'use strict';
const { test, expect } = require('./support/fixtures');

const confettiCanvas = () =>
  [...document.querySelectorAll('canvas')].filter((c) => c.style.zIndex === '9999' && !c.id).length;

test('marcar un hábito de hoy lanza el mini festejo', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="vida"]');
  await expect(cmPage.locator('#tab-vida')).toHaveClass(/active/);

  await cmPage.evaluate(() => {
    const h = S.habitTrackers.vida.find((x) => x.id === 'habit-lectura');
    delete h.days[window.getActiveDate()];
    renderHabitCal('vida');
  });

  await cmPage.locator('#habit-cal-vida .study-cal-day.today-cell .study-cal-dot').click();

  await expect(cmPage.getByText('Lectura', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect.poll(() => cmPage.evaluate(confettiCanvas), { timeout: 3000 }).toBeGreaterThan(0);
  // El overlay se limpia solo (no queda tapando la pantalla)
  await expect.poll(() => cmPage.evaluate(confettiCanvas), { timeout: 6000 }).toBe(0);
});

test('rellenar un día pasado no lanza el festejo', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="vida"]');
  const res = await cmPage.evaluate(() => {
    const h = S.habitTrackers.vida.find((x) => x.id === 'habit-lectura');
    const d = new Date(window.getActiveDate() + 'T00:00:00');
    d.setDate(d.getDate() - 5);
    const ds = d.toISOString().slice(0, 10);
    delete h.days[ds];
    renderHabitCal('vida');
    let called = false;
    const orig = window.celebrateHabit;
    window.celebrateHabit = () => { called = true; };
    toggleHabitDay('vida', 'habit-lectura', ds, null);
    window.celebrateHabit = orig;
    return { called, state: h.days[ds] };
  });
  expect(res.state).toBe('done');
  expect(res.called).toBe(false);
});
