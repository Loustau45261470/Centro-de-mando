// Tareas del día: horario editable (hora exacta o franja Mañana/Tarde/Noche), marca "obligatoria a esa hora" con candado,
// orden dentro de cada categoría (hora -> franja -> sin horario), card de la sección a todo el ancho y avisos (deadlines.js).
// Campos nuevos opcionales en S.goals[fecha][i]: franja ('m'|'t'|'n', excluyente con time) y oblig (true; ausente si no). Datos inventados.
'use strict';
const { test, expect } = require('./support/fixtures');
const CMDeadlines = require('../deadlines.js');

async function irAVida(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
}
async function armar(page, goals) {
  await irAVida(page);
  await page.evaluate((gs) => {
    S.goals[getActiveDate()] = gs.map((g, i) => ({ id: 'th' + i, done: false, priority: 'mid', q: 'ni', ...g }));
    saveState(); renderGoals();
  }, goals);
}
const estado = (page, texto) => page.evaluate((t) => S.goals[getActiveDate()].find((g) => g.text === t), texto);
const fila = (page, texto) => page.locator('#metas-readonly-card .mrd-item', { hasText: texto });

test('1) tocar el reloj de una tarea sin horario y poner una hora exacta', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Llamar al contador' }]);
  await fila(cmPage, 'Llamar al contador').locator('button.goal-hora').click();
  await expect(cmPage.locator('#modal-goal-hora')).toHaveClass(/open/);
  await cmPage.click('#ghMode button[data-v="hora"]');
  await cmPage.fill('#ghTime', '08:30');
  await cmPage.click('#modal-goal-hora button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-goal-hora')).not.toHaveClass(/open/);
  await expect(fila(cmPage, 'Llamar al contador').locator('button.goal-hora')).toHaveText('8:30 AM');
  const g = await estado(cmPage, 'Llamar al contador');
  expect(g.time).toBe('08:30');
  expect('franja' in g).toBe(false);
  expect('oblig' in g).toBe(false);
  // Tocar la hora la abre de nuevo y se puede sacar el horario.
  await fila(cmPage, 'Llamar al contador').locator('button.goal-hora').click();
  await expect(cmPage.locator('#ghTime')).toHaveValue('08:30');
  await cmPage.click('#ghMode button[data-v="none"]');
  await cmPage.click('#modal-goal-hora button:has-text("Guardar")');
  expect((await estado(cmPage, 'Llamar al contador')).time).toBeNull();
  expect(consoleErrors).toEqual([]);
});

test('2) franja Tarde reemplaza a la hora y se ve como chip; Cancelar no cambia nada', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Estudiar', time: '10:00' }]);
  await fila(cmPage, 'Estudiar').locator('button.goal-hora').click();
  await cmPage.click('#ghMode button[data-v="none"]');
  await cmPage.click('#modal-goal-hora button:has-text("Cancelar")');
  expect((await estado(cmPage, 'Estudiar')).time).toBe('10:00');
  await fila(cmPage, 'Estudiar').locator('button.goal-hora').click();
  await cmPage.click('#ghMode button[data-v="franja"]');
  await cmPage.click('#ghFranjaSeg button[data-v="t"]');
  await cmPage.click('#modal-goal-hora button:has-text("Guardar")');
  await expect(fila(cmPage, 'Estudiar').locator('button.goal-hora')).toHaveText('Tarde');
  const g = await estado(cmPage, 'Estudiar');
  expect(g.franja).toBe('t');
  expect(g.time).toBeNull();
  expect(consoleErrors).toEqual([]);
});

test('3) obligatoria muestra el candado; sin horario no se puede marcar', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Reunión', time: '15:00' }, { text: 'Suelta' }]);
  await expect(fila(cmPage, 'Reunión').locator('.goal-oblig')).toHaveCount(0);
  await fila(cmPage, 'Reunión').locator('button.goal-hora').click();
  await cmPage.check('#ghOblig');
  await cmPage.click('#modal-goal-hora button:has-text("Guardar")');
  await expect(fila(cmPage, 'Reunión').locator('button.goal-hora .goal-oblig')).toBeVisible();
  expect((await estado(cmPage, 'Reunión')).oblig).toBe(true);
  await fila(cmPage, 'Suelta').locator('button.goal-hora').click();
  await expect(cmPage.locator('#ghObligRow')).toBeHidden();
  await cmPage.click('#modal-goal-hora button:has-text("Cancelar")');
  expect(consoleErrors).toEqual([]);
});

test('4) dentro de la categoría: con hora (por hora) -> franja (mañana, tarde, noche) -> sin horario -> hechas', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [
    { text: 'Sin horario A' },
    { text: 'Noche', franja: 'n' },
    { text: 'Hora 14', time: '14:00' },
    { text: 'Mañana', franja: 'm' },
    { text: 'Hecha', time: '07:00', done: true },
    { text: 'Hora 09', time: '09:00' },
    { text: 'Tarde', franja: 't' },
    { text: 'Sin horario B' },
  ]);
  await expect(cmPage.locator('#metas-readonly-card .tl-q[data-q="ni"] .mrd-text')).toHaveText(
    ['Hora 09', 'Hora 14', 'Mañana', 'Tarde', 'Noche', 'Sin horario A', 'Sin horario B', 'Hecha']);
  // El orden manual queda como desempate entre iguales (A antes que B), sin tocar el almacenado.
  expect(await cmPage.evaluate(() => S.goals[getActiveDate()].map((g) => g.text)))
    .toEqual(['Sin horario A', 'Noche', 'Hora 14', 'Mañana', 'Hecha', 'Hora 09', 'Tarde', 'Sin horario B']);
  expect(consoleErrors).toEqual([]);
});

test('5) la franja no entra al planner como bloque; la hora exacta sí', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Con franja', franja: 'm' }, { text: 'Con hora', time: '11:00' }]);
  const ids = await cmPage.evaluate(() => plannerDayGoals(getActiveDate()).map((x) => x.text));
  expect(ids).toEqual(['Con hora']);
  expect(consoleErrors).toEqual([]);
});

test('6) una regla repetitiva propaga franja y obligatoria a las instancias', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  const res = await cmPage.evaluate(() => {
    const hoy = getActiveDate();
    const r = _grCreate({ text: 'Rutina', q: 'ni', priority: 'mid', time: null, franja: 'n', oblig: true, byDays: [0, 1, 2, 3, 4, 5, 6], startDate: hoy });
    S.goals[hoy] = [];
    ensureGoalRepeats();
    const g = S.goals[hoy].find((x) => x.repId === r.id);
    return { franja: g.franja, oblig: g.oblig };
  });
  expect(res).toEqual({ franja: 'n', oblig: true });
  expect(consoleErrors).toEqual([]);
});

test('7) también se edita desde la lista completa de Planificación', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, [{ text: 'Desde el overlay' }]);
  await cmPage.evaluate(() => plannerOverlayOpen());
  await expect(cmPage.locator('#metas-hoy-card')).toBeVisible();
  await cmPage.locator('#goalList .goal-item', { hasText: 'Desde el overlay' }).locator('button.goal-hora').click();
  await cmPage.click('#ghMode button[data-v="franja"]');
  await cmPage.click('#ghFranjaSeg button[data-v="n"]');
  await cmPage.check('#ghOblig');
  await cmPage.click('#modal-goal-hora button:has-text("Guardar")');
  const chip = cmPage.locator('#goalList .goal-item', { hasText: 'Desde el overlay' }).locator('button.goal-hora');
  await expect(chip).toContainText('Noche');
  await expect(chip.locator('.goal-oblig')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('8) en escritorio la card ocupa todo el ancho del panel y muestra los 4 cuadrantes en una fila', async ({ cmPage, consoleErrors }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'solo escritorio');
  await cmPage.setViewportSize({ width: 1400, height: 900 });
  await armar(cmPage, [{ text: 'Una' }]);
  const m = await cmPage.evaluate(() => {
    const panel = document.getElementById('tab-vida').getBoundingClientRect();
    const card = document.getElementById('metas-readonly-card').getBoundingClientRect();
    const tops = [...document.querySelectorAll('#metas-readonly-card .tl-q')].map((e) => Math.round(e.getBoundingClientRect().top));
    return { panel: panel.width, card: card.width, tops };
  });
  expect(m.card).toBeGreaterThan(m.panel * 0.9);
  expect(new Set(m.tops).size).toBe(1);
  expect(m.tops.length).toBe(4);
  expect(consoleErrors).toEqual([]);
});

test.describe('deadlines: avisos de tareas con horario (Node)', () => {
  const now = new Date('2026-11-23T06:00:00-03:00').getTime();   // lunes
  const metas = (goals) => CMDeadlines.collect({ goals: { '2026-11-23': goals } }, { now, tz: '-03:00' }).filter((i) => i.kind === 'meta');
  const iso = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(11, 16);

  test('hora exacta no obligatoria: igual que antes (10 min antes y a la hora)', () => {
    const [it] = metas([{ id: 'a', text: 'Sin obligar', time: '09:00', priority: 'mid' }]);
    expect(it.alerts.map((a) => [a.key, iso(a.at), a.title])).toEqual([
      ['meta_a_2026-11-23_10m', '08:50', '🎯 En 10 min: Sin obligar'],
      ['meta_a_2026-11-23_due', '09:00', '🎯 Ahora: Sin obligar'],
    ]);
    expect(it.notifBody).toContain('Meta · 09:00');
    expect(it.notifBody).not.toContain('Obligatoria');
  });

  test('hora exacta obligatoria: mismos avisos, con "Obligatoria" y prioridad alta', () => {
    const [it] = metas([{ id: 'b', text: 'Reunión', time: '09:00', priority: 'low', oblig: true }]);
    expect(it.alerts.map((a) => iso(a.at))).toEqual(['08:50', '09:00']);
    expect(it.notifBody).toBe('🔴 Meta · Obligatoria · 09:00');
  });

  test('franja: avisa solo si es obligatoria (08:00 / 13:00 / 19:00); sin obligar, hechas y sin horario no avisan', () => {
    const res = metas([
      { id: 'm', text: 'De mañana', franja: 'm' },
      { id: 't', text: 'De tarde', franja: 't', oblig: true },
      { id: 'n', text: 'De noche', franja: 'n', oblig: true },
      { id: 'h', text: 'Hecha', franja: 'm', oblig: true, done: true },
      { id: 's', text: 'Sin horario' },
      { id: 'x', text: 'Franja rara', franja: 'z', oblig: true },
    ]);
    expect(res.map((i) => i.title)).toEqual(['De tarde', 'De noche']);
    expect(res.map((i) => i.alerts.map((a) => [iso(a.at), a.title]))).toEqual([
      [['13:00', '🎯 Esta tarde: De tarde']],
      [['19:00', '🎯 Esta noche: De noche']],
    ]);
    expect(res[0].notifBody).toBe('🔴 Meta · Obligatoria · Tarde');
    const mañana = metas([{ id: 'm2', text: 'M', franja: 'm', oblig: true }]);
    expect(mañana[0].alerts.map((a) => iso(a.at))).toEqual(['08:00']);
  });
});
