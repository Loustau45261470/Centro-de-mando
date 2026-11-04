// Sesión de estudio en tres pestañas: Pomodoro (cronómetro + estadísticas) · Preparación de finales · Historial.
// El plan de estudio de cada final vive en "Preparación de finales", ya no en la tarjeta del final.
'use strict';
const { test, expect } = require('./support/fixtures');

const MATERIA = 'Constitución, derechos humanos y garantías';

async function armar(page, { conFinal = true, conPlan = false } = {}) {
  await page.evaluate(({ conFinal, conPlan, MATERIA }) => {
    S.lawProgress = { years: [
      { id: 'y2', label: 'Segundo Año', subjects: [{ id: 's2_4', name: MATERIA, done: false }] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    const mas = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
    window.__mas = mas;
    S.lawPlan = [{ id: 'r1', subject: MATERIA, target: '', comision: '3' }];
    S.sgc = S.sgc || {};
    S.sgc.finales = conFinal
      ? [{ id: 'f1', materia: MATERIA, subjectId: 's2_4', fecha: mas(10), tipo: 'Final Oral', done: false, doneEl: null, lawPlanId: 'r1' }]
      : [];
    if (conFinal && conPlan) S.sgc.finales[0].plan = { horasSemana: 6, dias: [1, 2, 3, 4, 5], hora: '18:00', creado: mas(-5), totalHoras: 8 };
    // Una sesión hoy y otra ayer, para que haya estadísticas y bitácora.
    S.pomodoroHistory = [
      { id: 'h1', date: mas(0), minutes: 25, full: true, ts: Date.now(), subjectId: 's2_4', materia: MATERIA },
      { id: 'h2', date: mas(-1), minutes: 50, full: true, ts: Date.now() - 86400000, subjectId: null, materia: null },
    ];
    S.dayPlan = S.dayPlan || {};
    saveState();
    Finales.renderPrincipal();
  }, { conFinal, conPlan, MATERIA });
  await page.evaluate(() => { try { localStorage.removeItem('cdm_sesion_estudio_tab'); } catch (e) {} });
}

const abrir = (page) => page.evaluate(() => openSesionEstudioOverlay());
const tab = (page, t) => page.locator(`#se-tab-${t}`);
const pane = (page, t) => page.locator(`#se-pane-${t}`);

test('hay tres pestañas y arranca en Pomodoro', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await abrir(cmPage);
  await expect(cmPage.locator('#ov-sesion-estudio .plov-tab')).toHaveText(['Pomodoro', 'Preparación de finales', 'Historial']);
  await expect(tab(cmPage, 'pomodoro')).toHaveAttribute('aria-selected', 'true');
  await expect(pane(cmPage, 'pomodoro')).toBeVisible();
  await expect(pane(cmPage, 'finales')).toBeHidden();
  await expect(pane(cmPage, 'historial')).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('Pomodoro: cronómetro + estadísticas (pulso y gráfico), sin la lista de sesiones', async ({ cmPage }) => {
  await armar(cmPage);
  await abrir(cmPage);
  await expect(pane(cmPage, 'pomodoro').locator('#ov-pomodoro .pomo-start')).toBeVisible();
  const stats = cmPage.locator('#ov-pomo-stats');
  await expect(stats.locator('.pomo-pulse-cell')).toHaveCount(3);
  await expect(stats.locator('.pomo-pulse')).toContainText('Hoy');
  await expect(stats.locator('.pomo-pulse')).toContainText('7 días');
  await expect(stats.locator('.pomo-pulse')).toContainText('Este mes');
  await expect(stats.locator('#pomo-hist-canvas')).toBeVisible();
  await expect(pane(cmPage, 'pomodoro').locator('.pomo-log, .pomo-row')).toHaveCount(0);
  // El gráfico sigue cambiando de vista.
  await stats.locator('.pomo-seg button', { hasText: 'Semana' }).click();
  await expect(stats.locator('.pomo-mod-title')).toHaveText('Tiempo por semana');
});

test('Historial: lista de sesiones, sin estadísticas; borrar una sesión la saca', async ({ cmPage }) => {
  await armar(cmPage);
  await abrir(cmPage);
  await tab(cmPage, 'historial').click();
  await expect(pane(cmPage, 'historial')).toBeVisible();
  await expect(pane(cmPage, 'pomodoro')).toBeHidden();
  await expect(cmPage.locator('#ov-pomo-hist .pomo-row')).toHaveCount(2);
  await expect(cmPage.locator('#pomo-hist-tot')).toContainText('2 sesi');
  await expect(cmPage.locator('#ov-pomo-hist .pomo-pulse, #ov-pomo-hist canvas')).toHaveCount(0);
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.locator('#ov-pomo-hist .pomo-row-del').first().evaluate((b) => b.click());
  await expect(cmPage.locator('#ov-pomo-hist .pomo-row')).toHaveCount(1);
  expect(await cmPage.evaluate(() => S.pomodoroHistory.length)).toBe(1);
});

test('Historial vacío: estado vacío en ambas pestañas', async ({ cmPage }) => {
  await armar(cmPage);
  await cmPage.evaluate(() => { S.pomodoroHistory = []; saveState(); });
  await abrir(cmPage);
  await expect(cmPage.locator('#ov-pomo-stats .pomo-empty')).toContainText('Sin sesiones todavía');
  await tab(cmPage, 'historial').click();
  await expect(cmPage.locator('#ov-pomo-hist .pomo-empty')).toContainText('Sin sesiones todavía');
});

test('la pestaña activa se recuerda (localStorage) y vuelve al abrir de nuevo', async ({ cmPage }) => {
  await armar(cmPage);
  await abrir(cmPage);
  await tab(cmPage, 'finales').click();
  expect(await cmPage.evaluate(() => localStorage.getItem('cdm_sesion_estudio_tab'))).toBe('finales');
  // Se reconstruye el overlay (como un arranque nuevo): tiene que reabrir en la pestaña guardada.
  await cmPage.evaluate(() => document.getElementById('ov-sesion-estudio').remove());
  await abrir(cmPage);
  await expect(tab(cmPage, 'finales')).toHaveAttribute('aria-selected', 'true');
  await expect(pane(cmPage, 'finales')).toBeVisible();
  await expect(pane(cmPage, 'pomodoro')).toBeHidden();
  // Un valor inválido cae en Pomodoro.
  await cmPage.evaluate(() => { localStorage.setItem('cdm_sesion_estudio_tab', 'xyz'); document.getElementById('ov-sesion-estudio').remove(); });
  await abrir(cmPage);
  await expect(tab(cmPage, 'pomodoro')).toHaveAttribute('aria-selected', 'true');
});

test('Preparación de finales: materia, tipo, comisión, días que faltan y el plan', async ({ cmPage }) => {
  await armar(cmPage, { conPlan: true });
  await abrir(cmPage);
  await tab(cmPage, 'finales').click();
  const it = cmPage.locator('#ov-prep-finales .fin-item');
  await expect(it).toHaveCount(1);
  await expect(it).toContainText(MATERIA);
  await expect(it).toContainText('Final Oral');
  await expect(it).toContainText('Com. 3');
  await expect(it).toContainText('10');
  await expect(it).toContainText('días');
  await expect(it).toContainText('Vas');
  await expect(it.locator('button:has-text("Plan de estudio")')).toBeVisible();
});

test('Preparación de finales: sin plan ofrece armarlo y el botón abre el modal del plan', async ({ cmPage }) => {
  await armar(cmPage);
  await abrir(cmPage);
  await tab(cmPage, 'finales').click();
  await cmPage.locator('#ov-prep-finales button:has-text("Armar plan de estudio")').click();
  await expect(cmPage.locator('#modal-plan-estudio')).toHaveClass(/open/);
});

test('Preparación de finales: vacío', async ({ cmPage }) => {
  await armar(cmPage, { conFinal: false });
  await abrir(cmPage);
  await tab(cmPage, 'finales').click();
  await expect(cmPage.locator('#ov-prep-finales')).toContainText('No tenés finales cargados. Cargá la fecha en el Plan de Materias o en Finales.');
});

test('Preparación de finales se repinta al reacomodar y al guardar el plan', async ({ cmPage }) => {
  await armar(cmPage, { conPlan: true });
  await cmPage.evaluate(() => {
    // Tocaba llevar 4 h y no se estudió nada: atrasado.
    [-4, -2].forEach((n) => getDayPlan(window.__mas(n)).tasks.push({ id: 'p' + n, text: 'Estudiar X', area: 'conocimiento', priority: 2, time: '18:00', duration: 120, done: false, studyPlan: 'f1' }));
    S.pomodoroHistory = [];
    saveState(); Finales.renderPrincipal();
  });
  await abrir(cmPage);
  await tab(cmPage, 'finales').click();
  await expect(cmPage.locator('#ov-prep-finales')).toContainText('Vas 4 h atrasado');
  await cmPage.locator('#ov-prep-finales button:has-text("Reacomodar")').click();
  await expect(cmPage.locator('#ov-prep-finales')).toContainText('Vas al día');
  await expect(cmPage.locator('#ov-prep-finales button:has-text("Reacomodar")')).toHaveCount(0);

  // Guardar un plan nuevo (desde el modal) también actualiza la pestaña.
  await cmPage.evaluate(() => { delete S.sgc.finales[0].plan; saveState(); Finales.renderPrincipal(); });
  await expect(cmPage.locator('#ov-prep-finales')).toContainText('Armar plan de estudio');
  await cmPage.locator('#ov-prep-finales button:has-text("Armar plan de estudio")').click();
  await cmPage.fill('#plan-horas', '4');
  await cmPage.click('#modal-plan-estudio .btn-primary');
  await expect(cmPage.locator('#ov-prep-finales')).toContainText('Vas al día · 0 de');
});

test('el plan de estudio ya no aparece en la tarjeta del final de la sección principal', async ({ cmPage }) => {
  await armar(cmPage, { conPlan: true });
  const wrap = cmPage.locator('#finales-wrap-conocimiento');
  await expect(wrap).toContainText(MATERIA);                // la tarjeta sigue mostrando el final
  await expect(wrap.locator('.fin-item-plan')).toHaveCount(0);
  await expect(wrap).not.toContainText('Plan de estudio');
  await expect(wrap).not.toContainText('Armar plan');
  await expect(wrap).not.toContainText('Vas al día');
  await expect(cmPage.locator('#ov-prep-finales .fin-item-plan')).toHaveCount(1);
});

test('Pomodoro: línea con el estado del plan de la materia elegida', async ({ cmPage }) => {
  await armar(cmPage, { conPlan: true });
  await cmPage.evaluate(() => {
    getDayPlan(window.__mas(-2)).tasks.push({ id: 'p2', text: 'Estudiar X', area: 'conocimiento', priority: 2, time: '18:00', duration: 120, done: false, studyPlan: 'f1' });
    S.pomodoroHistory = [];
    saveState();
  });
  await abrir(cmPage);
  await cmPage.selectOption('#pomo-materia-sel', 's2_4');
  await expect(cmPage.locator('#ov-pomodoro .pomo-plan-line')).toContainText('Plan: vas 2 h atrasado');
  await cmPage.selectOption('#pomo-materia-sel', '');
  await expect(cmPage.locator('#ov-pomodoro .pomo-plan-line')).toHaveCount(0);
  // Sin plan, tampoco hay línea.
  await cmPage.evaluate(() => { delete S.sgc.finales[0].plan; saveState(); });
  await cmPage.selectOption('#pomo-materia-sel', 's2_4');
  await expect(cmPage.locator('#ov-pomodoro .pomo-plan-line')).toHaveCount(0);
});

test('sin scroll horizontal en ninguna pestaña', async ({ cmPage }) => {
  await armar(cmPage, { conPlan: true });
  await abrir(cmPage);
  for (const t of ['pomodoro', 'finales', 'historial']) {
    await tab(cmPage, t).click();
    await expect(pane(cmPage, t)).toBeVisible();
    const sobra = await cmPage.evaluate(() => {
      const els = [document.documentElement, document.querySelector('#ov-sesion-estudio .cm-panel'), document.querySelector('#ov-sesion-estudio .cm-ov-body')];
      return els.map((e) => e.scrollWidth - e.clientWidth);
    });
    expect(sobra.every((x) => x <= 0), `pestaña ${t}: ${sobra}`).toBe(true);
  }
});
