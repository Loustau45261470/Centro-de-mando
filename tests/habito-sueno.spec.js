// Hábito que se marca solo con el sueño: auto {type:'sleep', metric}, sync al guardar horarios (saveSleepTimes) y recálculo al cambiar la config.
'use strict';
const { test, expect } = require('./support/fixtures');
const SU = require('../sueno-stats.js');

test.describe('cumpleCriterio (puro, Node)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });
  test('wake_in, bed_before y hours_min; sin el dato = null', () => {
    const wi = { metric: 'wake_in', desde: '06:45', hasta: '07:15' };
    expect(SU.cumpleCriterio({ waketime: '07:00' }, wi)).toBe(true);
    expect(SU.cumpleCriterio({ waketime: '07:16' }, wi)).toBe(false);
    expect(SU.cumpleCriterio({ bedtime: '23:00' }, wi)).toBeNull();
    expect(SU.cumpleCriterio(undefined, wi)).toBeNull();
    const bb = { metric: 'bed_before', hora: '00:30' };
    expect(SU.cumpleCriterio({ bedtime: '23:50' }, bb)).toBe(true);
    expect(SU.cumpleCriterio({ bedtime: '00:10' }, bb)).toBe(true);
    expect(SU.cumpleCriterio({ bedtime: '01:00' }, bb)).toBe(false);
    expect(SU.cumpleCriterio({ waketime: '07:00' }, bb)).toBeNull();
    const hm = { metric: 'hours_min', horas: 7 };
    expect(SU.cumpleCriterio({ bedtime: '23:00', waketime: '07:00' }, hm)).toBe(true);
    expect(SU.cumpleCriterio({ bedtime: '01:00', waketime: '07:00' }, hm)).toBe(false);
    expect(SU.cumpleCriterio({ hours: 8 }, hm)).toBe(true);
    expect(SU.cumpleCriterio({}, hm)).toBeNull();
  });
});

const restar = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

async function crearHabito(page, cfg) {
  await page.evaluate(() => openAddHabitFor('salud'));
  const m = page.locator('#modal-habit');
  await m.locator('#habitName').fill('Levantarme a horario');
  await m.locator('#habitAutoOn').check();
  await m.locator('#habitAutoMetric').selectOption(cfg.metric);
  if (cfg.desde) { await m.locator('#habitAutoDesde').fill(cfg.desde); await m.locator('#habitAutoHasta').fill(cfg.hasta); }
  await m.getByRole('button', { name: 'Guardar' }).click();
  return page.evaluate(() => S.habitTrackers.salud[S.habitTrackers.salud.length - 1].id);
}
const guardarSueno = (page, bed, wake) => page.evaluate(([b, w]) => {
  document.getElementById('sleepBedtime').value = b; document.getElementById('sleepWaketime').value = w; saveSleepTimes();
}, [bed, wake]);
const dia = (page, id, f) => page.evaluate(([i, f]) => { const h = S.habitTrackers.salud.find((x) => x.id === i); return h.days[f || getActiveDate()] || null; }, [id, f]);

test('wake_in: guardar waketime dentro marca done, fuera lo quita; se persiste auto', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const id = await crearHabito(cmPage, { metric: 'wake_in', desde: '06:45', hasta: '07:15' });
  const auto = await cmPage.evaluate((i) => S.habitTrackers.salud.find((x) => x.id === i).auto, id);
  expect(auto).toEqual({ type: 'sleep', metric: 'wake_in', desde: '06:45', hasta: '07:15' });
  await expect(cmPage.locator('#habit-cal-salud').locator('xpath=..')).toContainText('Se marca solo si te levantás entre 06:45 y 07:15');
  await guardarSueno(cmPage, '23:30', '07:00');
  expect(await dia(cmPage, id)).toBe('done');
  await guardarSueno(cmPage, '23:30', '08:30');
  expect(await dia(cmPage, id)).toBeNull();
  await guardarSueno(cmPage, '23:30', '06:50');
  expect(await dia(cmPage, id)).toBe('done');
  const persistido = await cmPage.evaluate((i) => JSON.parse(localStorage.getItem('lifedash_v2')).habitTrackers.salud.find((x) => x.id === i).days, id);
  expect(Object.values(persistido)).toContain('done');
});

test('partial, rest y missed puestos a mano no se pisan; sin dato no toca nada', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const id = await crearHabito(cmPage, { metric: 'wake_in', desde: '06:45', hasta: '07:15' });
  for (const [est, wake] of [['partial', '07:00'], ['rest', '07:00'], ['missed', '07:00'], ['partial', '09:00']]) {
    await cmPage.evaluate(([i, e]) => { S.habitTrackers.salud.find((x) => x.id === i).days[getActiveDate()] = e; }, [id, est]);
    await guardarSueno(cmPage, '23:30', wake);
    expect(await dia(cmPage, id)).toBe(est);
  }
  // sin hora de levantarse (solo acostarse): no se juzga, el done queda
  await cmPage.evaluate((i) => { S.habitTrackers.salud.find((x) => x.id === i).days[getActiveDate()] = 'done'; }, id);
  await guardarSueno(cmPage, '23:30', '');
  expect(await dia(cmPage, id)).toBe('done');
});

test('cambiar la config recalcula los últimos 60 días; apagarlo quita el campo auto', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const f = await cmPage.evaluate(() => getActiveDate());
  const d3 = restar(f, 3), d70 = restar(f, 70);
  await cmPage.evaluate(([a, b]) => { S.sleepLog[a] = { bedtime: '23:30', waketime: '07:00' }; S.sleepLog[b] = { bedtime: '23:30', waketime: '07:00' }; }, [d3, d70]);
  const id = await crearHabito(cmPage, { metric: 'wake_in', desde: '06:45', hasta: '07:15' });
  expect(await dia(cmPage, id, d3)).toBe('done');
  expect(await dia(cmPage, id, d70)).toBeNull();   // fuera de los 60 días
  await cmPage.evaluate(([s, i]) => openEditHabitFor(s, i), ['salud', id]);
  const m = cmPage.locator('#modal-habit');
  await m.locator('#habitAutoDesde').fill('08:00'); await m.locator('#habitAutoHasta').fill('09:00');
  await m.getByRole('button', { name: 'Guardar' }).click();
  expect(await dia(cmPage, id, d3)).toBeNull();
  await cmPage.evaluate(([s, i]) => openEditHabitFor(s, i), ['salud', id]);
  await m.locator('#habitAutoOn').uncheck();
  await m.getByRole('button', { name: 'Guardar' }).click();
  expect(await cmPage.evaluate((i) => 'auto' in S.habitTrackers.salud.find((x) => x.id === i), id)).toBe(false);
});

test('modal: hours_min se guarda; hábito sin auto no tiene el campo', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  await cmPage.evaluate(() => openAddHabitFor('salud'));
  const m = cmPage.locator('#modal-habit');
  await m.locator('#habitName').fill('Dormir bien');
  await m.locator('#habitAutoOn').check();
  await m.locator('#habitAutoMetric').selectOption('hours_min');
  await m.locator('#habitAutoHoras').fill('7.5');
  await m.getByRole('button', { name: 'Guardar' }).click();
  expect(await cmPage.evaluate(() => S.habitTrackers.salud.slice(-1)[0].auto)).toEqual({ type: 'sleep', metric: 'hours_min', horas: 7.5 });
  await cmPage.evaluate(() => openAddHabitFor('salud'));
  await m.locator('#habitName').fill('Sin auto');
  await m.getByRole('button', { name: 'Guardar' }).click();
  expect(await cmPage.evaluate(() => 'auto' in S.habitTrackers.salud.slice(-1)[0])).toBe(false);
});
