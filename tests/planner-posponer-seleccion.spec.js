// Planificación del día: modo "Seleccionar" para correr solo algunas actividades (sin empujar todo).
// "Correr todo" no cambia. Recurrentes: solo la ocurrencia de hoy. Datos inventados, solo en memoria.
// "Hoy" = 2026-11-11 (pisando getActiveDate); mañana = 2026-11-12.
'use strict';
const fs = require('fs');
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-11';
const MAN = '2026-11-12';
const CAP = 'C:/Users/Tobias/AppData/Local/Temp/claude/5d52610f902b8d2c/0ee1a2f9-6695-4db7-81d3-bffab298c7c8/scratchpad/posponer/';
const barra = '#dayPlannerList .planner-atajos';

// 4 puntuales (una hecha) + 1 recurrente diaria.
const SEMILLA = () => ({
  dayPlan: { [HOY]: { tasks: [
    { id: 'p1', text: 'Puntual uno', time: '09:00', duration: 60, priority: 2, area: 'vida', done: false },
    { id: 'p2', text: 'Puntual dos', time: '11:00', duration: 30, priority: 2, area: 'vida', done: false },
    { id: 'p3', text: 'Puntual tres', time: '13:00', duration: 30, priority: 1, area: 'vida', done: false },
    { id: 'p4', text: 'Puntual hecha', time: '15:00', duration: 30, priority: 2, area: 'vida', done: true },
  ] } },
  planRecurring: [
    { id: 'r1', text: 'Rutina diaria', time: '08:00', duration: 30, priority: 2, area: 'vida', startDate: '2026-11-01', repeat: { freq: 'daily', byDays: [] } },
  ],
});

async function armar(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
  await page.evaluate(([h, m, s]) => {
    window.getActiveDate = () => h; window.getTomorrow = () => m;
    S.dayPlan = s.dayPlan; S.planRecurring = s.planRecurring; S.goals = {};
    renderDayPlanner();
  }, [HOY, MAN, SEMILLA()]);
}
const dia = (page, f) => page.evaluate((x) => plannerDayTasks(x).map((t) => [t.text, t.time]).sort((a, b) => a[1].localeCompare(b[1])), f);
const estado = (page) => page.evaluate((m) => { const d = { ...S.dayPlan }; delete d[m]; return JSON.stringify({ dayPlan: d, planRecurring: S.planRecurring }); }, MAN);   // getDayPlan(mañana) al leer crea una entrada vacía: no cuenta
const fila = (page, texto) => page.locator('#dayPlannerList .pcal-row', { hasText: texto });

test('1) elegir 2 (una recurrente) y +1 h: solo se mueven esas; la recurrente solo hoy; Deshacer restaura todo', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  const antes = await estado(cmPage);
  await cmPage.click(`${barra} .pat-selbtn`);
  // Chips deshabilitados hasta elegir; las hechas no tienen casilla de selección.
  await expect(cmPage.locator(`${barra} .pat-chip:has-text("+1 h")`)).toBeDisabled();
  await expect(cmPage.locator('#dayPlannerList .plsel-box')).toHaveCount(4);   // 3 puntuales pendientes + 1 recurrente; la hecha no
  await expect(fila(cmPage, 'Puntual hecha').locator('.plsel-box')).toHaveCount(0);
  await fila(cmPage, 'Rutina diaria').locator('.plsel-box').check();
  await fila(cmPage, 'Puntual dos').click();   // tocar la fila también elige
  await expect(cmPage.locator(`${barra} .pat-lbl`)).toHaveText('Correr 2 elegidas');
  // Regresión: la marca visual va en la FILA (antes quedaba en el propio input por closest('[data-id]')).
  await expect(cmPage.locator('#dayPlannerList .plsel-box.plsel-on')).toHaveCount(0);
  await expect(cmPage.locator('#dayPlannerList .pcal-row.plsel-on, #dayPlannerList .pcal-block.plsel-on')).toHaveCount(2);
  await cmPage.screenshot({ path: CAP + 'seleccion-1280.png' }).catch(() => {});
  await cmPage.click(`${barra} .pat-chip:has-text("+1 h")`);
  expect(await dia(cmPage, HOY)).toEqual([
    ['Puntual uno', '09:00'], ['Rutina diaria', '09:00'], ['Puntual dos', '12:00'], ['Puntual tres', '13:00'], ['Puntual hecha', '15:00'],
  ]);
  expect(await dia(cmPage, MAN)).toEqual([['Rutina diaria', '08:00']]);   // mañana intacta
  expect(await cmPage.evaluate(() => S.planRecurring[0].time)).toBe('08:00');   // la regla no cambia
  await expect(cmPage.locator(`${barra} .pat-selbtn`)).toBeVisible();   // salió del modo
  await expect(cmPage.locator('#dayPlannerList .plsel-box')).toHaveCount(0);
  await expect(cmPage.locator('#cmundo-toast .cmundo-msg')).toHaveText('Corriste 2 actividades 1 h');
  // Un solo Deshacer para el lote.
  await cmPage.click('#cmundo-toast button');
  expect(await estado(cmPage)).toBe(antes);
  expect(consoleErrors).toEqual([]);
});

test('2) Correr todo sigue igual; Cancelar sale del modo sin mover nada', async ({ cmPage }) => {
  await armar(cmPage);
  const antes = await estado(cmPage);
  await cmPage.click(`${barra} .pat-selbtn`);
  await fila(cmPage, 'Puntual uno').locator('.plsel-box').check();
  await cmPage.click(`${barra} .pat-cancel`);
  expect(await estado(cmPage)).toBe(antes);
  await expect(cmPage.locator('#dayPlannerList .plsel-box')).toHaveCount(0);
  await cmPage.click(`${barra} .pat-chip:has-text("+1 h")`);
  expect(await dia(cmPage, HOY)).toEqual([
    ['Rutina diaria', '09:00'], ['Puntual uno', '10:00'], ['Puntual dos', '12:00'], ['Puntual tres', '14:00'], ['Puntual hecha', '15:00'],
  ]);
  await expect(cmPage.locator('#cmundo-toast .cmundo-msg')).toHaveText('Corriste el día 1 h');
});

test('3) tocar la card sin modo selección abre el overlay; en el overlay se elige y cerrar sale del modo', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.click('#dayPlannerCard .card-title, #dayPlannerCard h3, #dayPlannerCard', { position: { x: 20, y: 12 } });
  await expect(cmPage.locator('#ov-planner')).toHaveClass(/show/);
  const bo = '#plov-list-dia .planner-atajos';
  await cmPage.click(`${bo} .pat-selbtn`);
  await cmPage.locator('#plov-list-dia .pcal-block[data-id="p1"] .plsel-box').check();
  await expect(cmPage.locator(`${bo} .pat-lbl`)).toHaveText('Correr 1 elegida');
  await cmPage.screenshot({ path: CAP + 'overlay-1280.png' }).catch(() => {});
  await cmPage.click(`${bo} .pat-chip:has-text("+30 min")`);
  expect(await dia(cmPage, HOY)).toContainEqual(['Puntual uno', '09:30']);
  expect(await dia(cmPage, HOY)).toContainEqual(['Puntual dos', '11:00']);
  // Re-entrar al modo y cerrar el overlay: el modo se apaga.
  await cmPage.click(`${bo} .pat-selbtn`);
  await cmPage.keyboard.press('Escape');
  await expect(cmPage.locator('#ov-planner')).not.toHaveClass(/show/);
  await expect(cmPage.locator('#dayPlannerList .plsel-box')).toHaveCount(0);
});

test('4) a 390 px el modo selección no genera scroll horizontal', async ({ cmPage }) => {
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await armar(cmPage);
  await cmPage.click(`${barra} .pat-selbtn`);
  await fila(cmPage, 'Puntual uno').locator('.plsel-box').check();
  const ancho = await cmPage.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(ancho[0]).toBeLessThanOrEqual(ancho[1]);
  await cmPage.locator('#dayPlannerCard').scrollIntoViewIfNeeded();
  await cmPage.screenshot({ path: CAP + 'seleccion-390.png' }).catch(() => {});
});
