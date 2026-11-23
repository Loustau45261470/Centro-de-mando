// «Mover a la semana que viene»: va al lunes de la semana nueva (o a hoy si ese lunes ya pasó), una sola vez por tarea.
'use strict';
const { test, expect } = require('./support/fixtures');

async function preparar(page, fecha) {
  await page.clock.setFixedTime(fecha);
  await page.evaluate(() => {
    S.goals = {
      '2026-11-17': [{ id: 'm1', text: 'Llamar electricista', done: false }],
      '2026-11-21': [{ id: 'm2', text: 'Analizar acciones', done: false }],
      '2026-11-22': [{ id: 'm3', text: 'analizar acciones ', done: false }, { id: 'm4', text: 'Lavar auto', done: false }],
    };
    S.revisionSemanal = {};
  });
  await page.evaluate(() => abrirRevisionSemanal());
  await expect(page.locator('#ov-revision-semanal.show')).toBeVisible();
}
const moverTodas = (page) => page.evaluate(() => {
  [['2026-11-17', 'm1'], ['2026-11-21', 'm2'], ['2026-11-22', 'm3'], ['2026-11-22', 'm4']].forEach(([d, id]) => _rsMoverMeta(d, id));
  const g = S.goals; return Object.fromEntries(Object.keys(g).filter(k => (g[k] || []).length).map(k => [k, g[k].map(x => x.id)]));
});

test('revisión del domingo: todo va al lunes siguiente, sin duplicar la misma tarea', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, new Date(2026, 10, 22, 20, 0));   // domingo 22/11
  const r = await moverTodas(cmPage);
  expect(r).toEqual({ '2026-11-23': ['m1', 'm2', 'm4'] });
  const mov = await cmPage.evaluate(() => S.revisionSemanal['2026-W48'].movidas.map(m => m.to));
  expect(new Set(mov)).toEqual(new Set(['2026-11-23']));
  expect(consoleErrors).toEqual([]);
});

test('revisión hecha un miércoles: va a hoy (el lunes ya pasó)', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, new Date(2026, 10, 25, 10, 0));   // miércoles 25/11, cierra la semana 16-22
  const r = await moverTodas(cmPage);
  expect(r).toEqual({ '2026-11-25': ['m1', 'm2', 'm4'] });
  expect(consoleErrors).toEqual([]);
});
