// Atajos de la planificación del día: "Correr" (+30 min, +1 h, +2 h, +3 h y cantidad libre) y "Vaciar día".
// Solo afectan a HOY: las puntuales se tocan directo; las recurrentes por la excepción de esa fecha
// (la regla no cambia y mañana vuelven en su horario). Todo con Deshacer. Datos de ejemplo inventados.
// "Hoy" se fija pisando getActiveDate(): 2026-11-11 (miércoles); mañana = 2026-11-12.
'use strict';
const { test, expect } = require('./support/fixtures');
const CMDeadlines = require('../deadlines.js');

const HOY = '2026-11-11';
const MAN = '2026-11-12';
const TOAST = '#cmundo-toast .cmundo-msg';

// 2 puntuales de hoy + 3 recurrentes diarias (una sin propiedad exceptions, una con excepción "hecha") + 1 puntual de mañana.
const SEMILLA = () => ({
  dayPlan: {
    [HOY]: { tasks: [
      { id: 'p1', text: 'Puntual uno', time: '09:00', duration: 60, priority: 2, area: 'vida', done: false },
      { id: 'p2', text: 'Puntual tarde', time: '22:30', duration: 60, priority: 1, area: 'vida', done: false },
    ] },
    [MAN]: { tasks: [{ id: 'p3', text: 'Puntual de mañana', time: '10:00', duration: 30, priority: 2, area: 'vida', done: false }] },
  },
  planRecurring: [
    { id: 'r1', text: 'Rutina mañana', time: '08:00', duration: 30, priority: 2, area: 'vida', startDate: '2026-11-01', repeat: { freq: 'daily', byDays: [] } },
    { id: 'r2', text: 'Rutina noche', time: '23:00', duration: 45, priority: 2, area: 'vida', startDate: '2026-11-01', repeat: { freq: 'daily', byDays: [] }, exceptions: {} },
    { id: 'r3', text: 'Rutina con excepción', time: '07:00', duration: 30, priority: 2, area: 'vida', startDate: '2026-11-01', repeat: { freq: 'daily', byDays: [] }, exceptions: { [HOY]: { done: true } } },
  ],
});

async function armar(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
  await page.evaluate(([h, m, semilla]) => {
    window.getActiveDate = () => h;
    window.getTomorrow = () => m;
    S.dayPlan = semilla.dayPlan;
    S.planRecurring = semilla.planRecurring;
    S.goals = {};
    renderDayPlanner();
  }, [HOY, MAN, SEMILLA()]);
}

// [texto, hora, duración] del día, ordenado por hora.
const dia = (page, fecha) => page.evaluate((f) =>
  plannerDayTasks(f).map((t) => [t.text, t.time, t.duration]).sort((a, b) => a[1].localeCompare(b[1])), fecha);
const estado = (page) => page.evaluate(() => JSON.stringify({ dayPlan: S.dayPlan, planRecurring: S.planRecurring }));
const barra = '#dayPlannerList .planner-atajos';

test('1) +1 h corre todo hoy conservando la duración; las recurrentes solo por excepción y mañana siguen igual', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  expect(await dia(cmPage, HOY)).toEqual([
    ['Rutina con excepción', '07:00', 30], ['Rutina mañana', '08:00', 30], ['Puntual uno', '09:00', 60],
    ['Puntual tarde', '22:30', 60], ['Rutina noche', '23:00', 45],
  ]);
  await cmPage.click(`${barra} .pat-chip:has-text("+1 h")`);
  expect(await dia(cmPage, HOY)).toEqual([
    ['Rutina con excepción', '08:00', 30], ['Rutina mañana', '09:00', 30], ['Puntual uno', '10:00', 60],
  ]);
  // Las reglas no cambian (solo se agregó la excepción de hoy) y la excepción previa "hecha" se conserva.
  const reglas = await cmPage.evaluate(() => S.planRecurring.map((r) => [r.id, r.time, r.duration, r.repeat.freq, r.startDate]));
  expect(reglas).toEqual([['r1', '08:00', 30, 'daily', '2026-11-01'], ['r2', '23:00', 45, 'daily', '2026-11-01'], ['r3', '07:00', 30, 'daily', '2026-11-01']]);
  expect(await cmPage.evaluate((h) => S.planRecurring[2].exceptions[h], HOY)).toEqual({ done: true, time: '08:00' });
  // Mañana: las recurrentes en su horario original, la puntual de mañana intacta.
  expect(await dia(cmPage, MAN)).toEqual([
    ['Rutina con excepción', '07:00', 30], ['Rutina mañana', '08:00', 30], ['Puntual de mañana', '10:00', 30], ['Rutina noche', '23:00', 45],
  ]);
  // Lo que ve el usuario en la card: filas con el horario nuevo.
  await expect(cmPage.locator('#dayPlannerList .pcal-row .pcal-row-time')).toHaveText(['08:00–08:30', '09:00–09:30', '10:00–11:00']);
  expect(consoleErrors).toEqual([]);
});

test('2) lo que pasaría de la medianoche sale del plan de hoy y el toast lo informa; Deshacer restaura exacto', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  const antes = await estado(cmPage);
  await cmPage.click(`${barra} .pat-chip:has-text("+1 h")`);
  await expect(cmPage.locator(TOAST)).toHaveText('Corriste el día 1 h · 2 actividades quedaron fuera (pasaban la medianoche)');
  await expect(cmPage.locator('#cmundo-toast')).toHaveClass(/show/);
  // Las 2 que pasaban salieron: la puntual se borró y la recurrente quedó "eliminada solo hoy" (no se movió a mañana).
  expect(await cmPage.evaluate((h) => S.dayPlan[h].tasks.map((t) => t.id), HOY)).toEqual(['p1']);
  expect(await cmPage.evaluate((h) => S.planRecurring[1].exceptions[h], HOY)).toEqual({ deleted: true });
  expect(await dia(cmPage, MAN)).toContainEqual(['Rutina noche', '23:00', 45]);
  expect(await cmPage.evaluate((m) => S.dayPlan[m].tasks.map((t) => t.id), MAN)).toEqual(['p3']);

  await cmPage.click('#cmundo-toast button');
  expect(await estado(cmPage)).toBe(antes);                    // idéntico: tasks, reglas y excepciones (incluida la ausencia de la propiedad)
  expect(await dia(cmPage, HOY)).toHaveLength(5);
  await expect(cmPage.locator('#dayPlannerList .pcal-row')).toHaveCount(5);
  expect(consoleErrors).toEqual([]);
});

test('3) una sola actividad que pasa: el toast usa el singular; terminar justo a las 00:00 todavía entra', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate((h) => {
    S.dayPlan[h].tasks = [
      { id: 'p1', text: 'Justo', time: '21:30', duration: 60, priority: 2, area: 'vida', done: false },   // +1 h → 22:30–23:30
      { id: 'p2', text: 'Se pasa', time: '22:30', duration: 90, priority: 2, area: 'vida', done: false },  // +1 h → 23:30–01:00
    ];
    S.planRecurring = [];
    renderDayPlanner();
  }, HOY);
  await cmPage.click(`${barra} .pat-chip:has-text("+1 h")`);
  await expect(cmPage.locator(TOAST)).toHaveText('Corriste el día 1 h · 1 actividad quedó fuera (pasaban la medianoche)');
  expect(await dia(cmPage, HOY)).toEqual([['Justo', '22:30', 60]]);
  await cmPage.click(`${barra} .pat-chip:has-text("+30 min")`);   // 22:30 → 23:00–00:00: termina a medianoche, entra
  expect(await dia(cmPage, HOY)).toEqual([['Justo', '23:00', 60]]);
  await expect(cmPage.locator(TOAST)).toHaveText('Corriste el día 30 min');
  expect(consoleErrors).toEqual([]);
});

test('4) Vaciar día borra todo lo de hoy sin confirmar; mañana queda intacto; Deshacer restaura exacto', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => { window.__confirms = 0; window.confirm = () => { window.__confirms++; return true; }; });
  const antes = await estado(cmPage);
  const mananaAntes = await dia(cmPage, MAN);
  await cmPage.click(`${barra} .pat-clear`);
  expect(await cmPage.evaluate(() => window.__confirms), 'no pregunta nada').toBe(0);
  await expect(cmPage.locator('#modal-recur-scope')).not.toHaveClass(/open/);
  await expect(cmPage.locator(TOAST)).toHaveText('Vaciaste el día · 5 actividades');
  expect(await dia(cmPage, HOY)).toEqual([]);
  await expect(cmPage.locator('#dayPlannerList .empty-state')).toBeVisible();
  await expect(cmPage.locator(`${barra} .pat-clear`)).toBeDisabled();
  expect(await dia(cmPage, MAN)).toEqual(mananaAntes);         // mañana intacto (recurrentes y puntual)
  expect(await cmPage.evaluate(() => S.planRecurring.map((r) => r.time))).toEqual(['08:00', '23:00', '07:00']);

  await cmPage.click('#cmundo-toast button');
  expect(await estado(cmPage)).toBe(antes);
  expect(await dia(cmPage, HOY)).toHaveLength(5);
  await expect(cmPage.locator('#dayPlannerList .pcal-row')).toHaveCount(5);
  expect(consoleErrors).toEqual([]);
});

test('5) cantidad personalizada: minutos, horas, Enter, y rechaza vacío o cero', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate((h) => { S.dayPlan[h].tasks = [{ id: 'p1', text: 'Puntual uno', time: '09:00', duration: 60, priority: 2, area: 'vida', done: false }]; S.planRecurring = []; renderDayPlanner(); }, HOY);
  const uno = async () => (await dia(cmPage, HOY))[0][1];

  await cmPage.fill(`${barra} .pat-num`, '90');                                  // 90 min
  await cmPage.click(`${barra} .pat-go`);
  expect(await uno()).toBe('10:30');
  await expect(cmPage.locator(TOAST)).toHaveText('Corriste el día 1 h 30 min');

  await cmPage.fill(`${barra} .pat-num`, '2');                                   // 2 h
  await cmPage.selectOption(`${barra} .pat-unit`, 'h');
  await cmPage.click(`${barra} .pat-go`);
  expect(await uno()).toBe('12:30');

  await cmPage.fill(`${barra} .pat-num`, '15');                                  // Enter dispara lo mismo
  await cmPage.press(`${barra} .pat-num`, 'Enter');
  expect(await uno()).toBe('12:45');   // la barra se repinta tras cada corrida: la unidad vuelve a "min"
  expect(consoleErrors).toEqual([]);
});

test('5b) campo vacío o 0 no cambian nada y avisan', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  const antes = await estado(cmPage);
  await cmPage.click(`${barra} .pat-go`);                                        // vacío
  await expect(cmPage.locator('#toast')).toHaveText('Poné una cantidad mayor a 0');
  await cmPage.fill(`${barra} .pat-num`, '0');
  await cmPage.click(`${barra} .pat-go`);
  await expect(cmPage.locator('#toast')).toHaveText('Poné una cantidad mayor a 0');
  expect(await estado(cmPage)).toBe(antes);
  await expect(cmPage.locator('#cmundo-toast')).not.toHaveClass(/show/);
  expect(consoleErrors).toEqual([]);
});

test('6) la misma barra está en el calendario del overlay (Día) y no en la vista Semana', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => plannerOverlayOpen());
  await expect(cmPage.locator('#ov-planner')).toHaveClass(/show/);
  await expect(cmPage.locator('#plov-list-dia .planner-atajos')).toBeVisible();
  await cmPage.click('#plov-list-dia .pat-chip:has-text("+30 min")');
  expect(await dia(cmPage, HOY)).toContainEqual(['Puntual uno', '09:30', 60]);
  await expect(cmPage.locator('#plov-list-dia .pcal-block[data-id="p1"] .pcal-text')).toBeVisible();
  await cmPage.click('.plov-tab[data-d="semana"]');
  await expect(cmPage.locator('#plov-list-semana .pcal-week-grid')).toBeVisible();
  await expect(cmPage.locator('#plov-list-semana .planner-atajos')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('7) avisos (deadlines.js en Node): tras correr, el aviso de hoy cae en el horario nuevo; tras vaciar no hay avisos de hoy', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  const TZ = '-03:00';
  const now = new Date(`${HOY}T06:00:00${TZ}`).getTime();
  const snap = () => cmPage.evaluate(() => JSON.parse(JSON.stringify({ dayPlan: S.dayPlan, planRecurring: S.planRecurring, goals: {} })));
  const acts = (st, fecha) => CMDeadlines.collect(st, { now, tz: TZ }).filter((i) => i.kind === 'actividad' && i.date === fecha);
  const horas = (st, fecha) => acts(st, fecha).map((i) => [i.title, i.time]).sort((a, b) => a[1].localeCompare(b[1]));

  const antes = await snap();
  expect(horas(antes, HOY)).toEqual([['Rutina mañana', '08:00'], ['Puntual uno', '09:00'], ['Puntual tarde', '22:30'], ['Rutina noche', '23:00']]);   // "con excepción" está hecha: no avisa

  await cmPage.click(`${barra} .pat-chip:has-text("+1 h")`);
  const corrido = await snap();
  expect(horas(corrido, HOY)).toEqual([['Rutina mañana', '09:00'], ['Puntual uno', '10:00']]);
  const aviso = (st, titulo) => acts(st, HOY).find((i) => i.title === titulo).alerts.map((a) => a.at);
  expect(aviso(antes, 'Puntual uno')).toEqual([new Date(`${HOY}T08:50:00${TZ}`).getTime()]);
  expect(aviso(corrido, 'Puntual uno')).toEqual([new Date(`${HOY}T09:50:00${TZ}`).getTime()]);
  expect(aviso(corrido, 'Rutina mañana')).toEqual([new Date(`${HOY}T08:50:00${TZ}`).getTime()]);
  expect(horas(corrido, MAN).map((x) => x[1])).toEqual(['07:00', '08:00', '10:00', '23:00']);   // mañana sigue con sus horarios

  await cmPage.click('#cmundo-toast button');
  expect(horas(await snap(), HOY)).toEqual(horas(antes, HOY));

  await cmPage.click(`${barra} .pat-clear`);
  const vacio = await snap();
  expect(acts(vacio, HOY)).toEqual([]);
  expect(horas(vacio, MAN)).toHaveLength(4);
  expect(consoleErrors).toEqual([]);
});

test.describe('390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('8) la barra no genera scroll horizontal ni se sale de la pantalla (card y overlay)', async ({ cmPage, consoleErrors }) => {
    await armar(cmPage);
    const medir = (sel) => cmPage.evaluate((s) => {
      const bar = document.querySelector(s);
      const vw = document.documentElement.clientWidth;
      const fuera = Array.from(bar.children).filter((c) => { const r = c.getBoundingClientRect(); return r.left < -0.5 || r.right > vw + 0.5; }).length;
      return { fuera, sw: document.body.scrollWidth, vw, h: bar.getBoundingClientRect().height };
    }, sel);
    let m = await medir(barra);
    expect(m.fuera).toBe(0);
    expect(m.sw).toBeLessThanOrEqual(m.vw + 1);
    await cmPage.evaluate(() => plannerOverlayOpen());
    await expect(cmPage.locator('#plov-list-dia .planner-atajos')).toBeVisible();
    m = await medir('#plov-list-dia .planner-atajos');
    expect(m.fuera).toBe(0);
    expect(m.sw).toBeLessThanOrEqual(m.vw + 1);
    expect(consoleErrors).toEqual([]);
  });
});
