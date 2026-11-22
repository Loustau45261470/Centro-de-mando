// Calendario de hábitos: % sobre días transcurridos + atajos «Completar mes» y «Marcar todos hoy».
// "Hoy" se fija pisando getActiveDate() (2026-11-10).
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-10';
const HID = 'habit-entrenamientos';

async function preparar(page, dias) {
  await page.click('.nav-btn[data-tab="salud"]');
  await page.evaluate(([hoy, id, d]) => {
    window.getActiveDate = () => hoy;
    habitCalState.salud = { year: 2026, month: 10 };
    _habitView.salud = 'month';
    S.habitTrackers.salud.forEach((h) => { h.days = {}; });
    S.habitTrackers.salud.find((x) => x.id === id).days = d;
    renderHabitsCard('salud');
  }, [HOY, HID, dias]);
}
const dias = (page) => page.evaluate((id) => S.habitTrackers.salud.find((x) => x.id === id).days, HID);

test('el % y Completados cuentan solo los días transcurridos (hoy sin registro no entra)', async ({ cmPage }) => {
  await preparar(cmPage, { '2026-11-01': 'done', '2026-11-02': 'done', '2026-11-03': 'partial', '2026-11-04': 'rest' });
  // transcurridos: 1..9 (hoy sin registro no cuenta) menos 1 descanso = 8; puntos = 2.5
  await expect(cmPage.locator('#habit-stats-salud .fin-summary-num').nth(1)).toHaveText('2.5/8');
  await expect(cmPage.locator('#habit-stats-salud .habit-ring-txt')).toHaveText('31%');
  // con registro hoy entra: 9 días
  await cmPage.evaluate(([id, hoy]) => { S.habitTrackers.salud.find((x) => x.id === id).days[hoy] = 'done'; renderHabitCal('salud'); }, [HID, HOY]);
  await expect(cmPage.locator('#habit-stats-salud .fin-summary-num').nth(1)).toHaveText('3.5/9');
});

test('mes futuro: sin división por cero, muestra —', async ({ cmPage }) => {
  await preparar(cmPage, {});
  await cmPage.evaluate(() => { habitCalState.salud = { year: 2026, month: 11 }; renderHabitCal('salud'); });
  await expect(cmPage.locator('#habit-stats-salud .habit-ring-txt')).toHaveText('—');
  await expect(cmPage.locator('#habit-stats-salud .fin-summary-num').nth(1)).toHaveText('—');
});

test('Completar mes llena solo vacíos hasta hoy, respeta lo existente y se deshace', async ({ cmPage }) => {
  await preparar(cmPage, { '2026-11-02': 'done', '2026-11-05': 'missed' });
  await cmPage.locator('#habit-cal-salud .habit-bulk-btn').click();
  await cmPage.locator('.hdm-menu .hdm-item[data-st="rest"]').click();
  const d = await dias(cmPage);
  expect(Object.keys(d).length).toBe(10);          // 1..10, nada futuro
  expect(d['2026-11-02']).toBe('done');
  expect(d['2026-11-05']).toBe('missed');
  expect(d['2026-11-01']).toBe('rest');
  expect(d[HOY]).toBe('rest');
  expect(d['2026-11-11']).toBeUndefined();
  await expect(cmPage.locator('.cmundo-msg')).toHaveText('Se completaron 8 días');
  await cmPage.locator('#cmundo-toast button').click();
  const d2 = await dias(cmPage);
  expect(d2).toEqual({ '2026-11-02': 'done', '2026-11-05': 'missed' });
});

test('Marcar todos hoy toca solo los hábitos de la sección sin registro hoy', async ({ cmPage }) => {
  await preparar(cmPage, { [HOY]: 'missed' });
  const n = await cmPage.evaluate(() => S.habitTrackers.salud.length);
  expect(n).toBeGreaterThan(1);
  await cmPage.evaluate((hoy) => { S.habitTrackers.salud[1].days = { '2026-11-03': 'done' }; renderHabitsCard('salud'); }, HOY);
  const otraSec = await cmPage.evaluate(() => Object.keys(S.habitTrackers).filter((k) => k !== 'salud').map((k) => (S.habitTrackers[k][0] || {}).days));
  await cmPage.locator('#tab-salud button', { hasText: 'Marcar todos hoy' }).click();
  await cmPage.locator('.hdm-menu .hdm-item[data-st="done"]').click();
  const r = await cmPage.evaluate(([hoy]) => S.habitTrackers.salud.map((h) => [h.days[hoy], Object.keys(h.days).length]), [HOY]);
  expect(r[0][0]).toBe('missed');                  // el que ya tenía registro no se pisa
  r.slice(1).forEach(([st]) => expect(st).toBe('done'));
  expect(r[1][1]).toBe(2);                         // sus días anteriores intactos, nada de ayer
  await expect(cmPage.locator('.cmundo-msg')).toHaveText(n - 1 === 1 ? "1 hábito marcado" : `${n - 1} hábitos marcados`);
  const otraSec2 = await cmPage.evaluate(() => Object.keys(S.habitTrackers).filter((k) => k !== 'salud').map((k) => (S.habitTrackers[k][0] || {}).days));
  expect(otraSec2).toEqual(otraSec);
});
