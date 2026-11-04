// A8 — Pomodoro por materia: selector (por defecto la del próximo final), subjectId/materia en cada sesión,
// helper puro horasPorMateria y horas estudiadas en el apartado de Finales.
'use strict';
const { test, expect } = require('./support/fixtures');

async function armar(page) {
  await page.evaluate(() => {
    S.lawProgress = { years: [
      { id: 'y1', label: 'Primer Año', subjects: [{ id: 's1_1', name: 'Introducción a la filosofía', done: true, grade: 7 }] },
      { id: 'y2', label: 'Segundo Año', subjects: [
        { id: 's2_4', name: 'Constitución, derechos humanos y garantías', done: false },
        { id: 's2_8', name: 'Derecho constitucional del poder', done: false },
      ] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    const hoy = getActiveDate();
    const mas = (n) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    S.sgc = S.sgc || {};
    S.sgc.finales = [
      { id: 'fa', materia: 'Derecho constitucional del poder', subjectId: 's2_8', fecha: mas(5), tipo: 'Final Oral', done: false, doneEl: null },
      { id: 'fb', materia: 'Constitución, derechos humanos y garantías', subjectId: 's2_4', fecha: mas(20), tipo: 'Final Escrito', done: false, doneEl: null },
    ];
    S.pomodoroHistory = [];
    saveState();
  });
}

test('el selector sugiere la materia del próximo final activo y ofrece solo las no aprobadas', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => openSesionEstudioOverlay());
  const sel = cmPage.locator('#pomo-materia-sel');
  await expect(sel).toHaveValue('s2_8'); // el final de 5 días, no el de 20
  const vals = await sel.locator('option').evaluateAll((os) => os.map((o) => o.value));
  expect(vals).toEqual(['', 's2_8', 's2_4']); // "Sin materia" + no aprobadas (s1_1 fuera), por fecha de final (5 días antes que 20)
});

test('sin finales usa la última materia elegida; "Sin materia" sigue permitido', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => { S.sgc.finales = []; localStorage.setItem('cdm_pomodoro_materia', 's2_4'); });
  await cmPage.evaluate(() => openSesionEstudioOverlay());
  await expect(cmPage.locator('#pomo-materia-sel')).toHaveValue('s2_4');
  await cmPage.selectOption('#pomo-materia-sel', '');
  await expect(cmPage.locator('#pomo-materia-sel')).toHaveValue('');
});

test('una sesión nueva guarda subjectId y materia', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => openSesionEstudioOverlay());
  await cmPage.selectOption('#pomo-materia-sel', 's2_4');
  // 1 ciclo de 1 minuto, y se adelanta el reloj para que el bloque termine.
  await cmPage.evaluate(() => { Pomodoro.bump('study', -24); Pomodoro.bump('cycles', -3); });
  await cmPage.click('#ov-pomodoro .pomo-start');
  await expect(cmPage.locator('#ov-pomodoro .pomo-materia-tag')).toContainText('Constitución');
  await cmPage.evaluate(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 90000;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const h = await cmPage.evaluate(() => S.pomodoroHistory);
  expect(h).toHaveLength(1);
  expect(h[0]).toMatchObject({ minutes: 1, full: true, subjectId: 's2_4', materia: 'Constitución, derechos humanos y garantías' });
});

test('sin materia la sesión guarda subjectId null', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => openSesionEstudioOverlay());
  await cmPage.selectOption('#pomo-materia-sel', '');
  await cmPage.evaluate(() => { Pomodoro.bump('study', -24); Pomodoro.bump('cycles', -3); });
  await cmPage.click('#ov-pomodoro .pomo-start');
  await cmPage.evaluate(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 90000;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const h = await cmPage.evaluate(() => S.pomodoroHistory);
  expect(h).toHaveLength(1);
  expect(h[0].subjectId).toBeNull();
});

test('horasPorMateria suma solo la materia y el rango pedidos', async ({ cmPage }) => {
  await armar(cmPage);
  const r = await cmPage.evaluate(() => {
    S.pomodoroHistory = [
      { id: 'a', date: '2026-10-01', minutes: 25, full: true, ts: 1, subjectId: 's2_8' },
      { id: 'b', date: '2026-10-10', minutes: 35, full: true, ts: 2, subjectId: 's2_8' },
      { id: 'c', date: '2026-10-10', minutes: 50, full: true, ts: 3, subjectId: 's2_4' },
      { id: 'd', date: '2026-11-02', minutes: 30, full: false, ts: 4, subjectId: 's2_8' },
      { id: 'e', date: '2026-10-10', minutes: 20, full: true, ts: 5 }, // sesión vieja sin materia
    ];
    return {
      todo: horasPorMateria('s2_8'),
      octubre: horasPorMateria('s2_8', '2026-10-01', '2026-10-31'),
      desde10: horasPorMateria('s2_8', '2026-10-10', null),
      otra: horasPorMateria('s2_4', '2026-10-01', '2026-10-31'),
      inexistente: horasPorMateria('nada', '2026-10-01', '2026-10-31'),
      vacio: horasPorMateria(''),
    };
  });
  expect(r.todo).toBeCloseTo(90 / 60, 5);
  expect(r.octubre).toBeCloseTo(1, 5);
  expect(r.desde10).toBeCloseTo(65 / 60, 5);
  expect(r.otra).toBeCloseTo(50 / 60, 5);
  expect(r.inexistente).toBe(0);
  expect(r.vacio).toBe(0);
});

test('Finales muestra las horas estudiadas de los últimos 30 días junto a cada final con materia', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => {
    const hoy = getActiveDate();
    const mas = (n) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    S.pomodoroHistory = [
      { id: 'a', date: hoy, minutes: 90, full: true, ts: 1, subjectId: 's2_8' },
      { id: 'b', date: mas(-29), minutes: 30, full: true, ts: 2, subjectId: 's2_8' },
      { id: 'c', date: mas(-31), minutes: 600, full: true, ts: 3, subjectId: 's2_8' }, // fuera de los 30 días
    ];
    Finales.renderPrincipal();
  });
  const items = cmPage.locator('#finales-wrap-conocimiento .fin-item');
  await expect(items.nth(0)).toContainText('2 h estudiadas (últimos 30 días)'); // 120 min
  await expect(items.nth(1)).toContainText('0 h estudiadas (últimos 30 días)');
});
