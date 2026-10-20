// Selector de rango (1M/3M/6M/9M/12M/Todo) del gráfico de patrimonio: reemplaza el
// recorte fijo slice(-30). Las líneas por cuenta usan el mismo rango.
'use strict';
const { test, expect } = require('./support/fixtures');

const DIAS = 400;

async function abrirFinanzasConHistorial(page) {
  await page.evaluate((dias) => {
    const hoy = new Date(getActiveDate() + 'T00:00:00Z');
    const nw = [], acc = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoy); d.setUTCDate(d.getUTCDate() - i);
      const f = d.toISOString().slice(0, 10);
      nw.push({ date: f, value: 1000 + (dias - i) });
      acc.push({ date: f, accountId: 'acc-main', balance: 500 + (dias - i) });
    }
    S.nwHistory = nw;
    S.accountHistory = acc;
    try { localStorage.removeItem('cm_nw_range'); } catch (e) {}
  }, DIAS);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.waitForFunction(() => typeof nwLineInst !== 'undefined' && nwLineInst);
}

const puntos = (page) => page.evaluate(() => ({
  total: nwLineInst.data.datasets[0].data.length,
  labels: nwLineInst.data.labels.length,
  cuenta: nwLineInst.data.datasets[1] ? nwLineInst.data.datasets[1].data.filter((v) => v !== null).length : null,
}));

test('rango del gráfico de patrimonio: 1M ~30, 3M ~90, Todo = todos', async ({ cmPage }) => {
  await abrirFinanzasConHistorial(cmPage);
  await cmPage.evaluate(() => { toggleNWAccountChart('acc-main', true); });

  // Default: Todo
  await cmPage.evaluate(() => updateNWCharts());
  expect((await puntos(cmPage)).total).toBe(DIAS);
  await expect(cmPage.locator('#nwRangeSeg button[data-range="all"]')).toHaveClass(/on/);

  await cmPage.click('#nwRangeSeg button[data-range="1M"]');
  let p = await puntos(cmPage);
  expect(p.total).toBeGreaterThanOrEqual(29);
  expect(p.total).toBeLessThanOrEqual(31);
  expect(p.cuenta).toBe(p.total); // la línea por cuenta respeta el mismo rango

  await cmPage.click('#nwRangeSeg button[data-range="3M"]');
  p = await puntos(cmPage);
  expect(p.total).toBeGreaterThanOrEqual(89);
  expect(p.total).toBeLessThanOrEqual(91);
  expect(p.cuenta).toBe(p.total);

  await cmPage.click('#nwRangeSeg button[data-range="12M"]');
  p = await puntos(cmPage);
  expect(p.total).toBeGreaterThanOrEqual(364);
  expect(p.total).toBeLessThanOrEqual(366);

  await cmPage.click('#nwRangeSeg button[data-range="all"]');
  p = await puntos(cmPage);
  expect(p.total).toBe(DIAS);
  expect(p.cuenta).toBe(DIAS);
});

test('el rango elegido persiste en localStorage', async ({ cmPage }) => {
  await abrirFinanzasConHistorial(cmPage);
  await cmPage.click('#nwRangeSeg button[data-range="6M"]');
  expect(await cmPage.evaluate(() => localStorage.getItem('cm_nw_range'))).toBe('6M');
  await cmPage.evaluate(() => { updateNWCharts(); });
  const p = await puntos(cmPage);
  expect(p.total).toBeGreaterThanOrEqual(179);
  expect(p.total).toBeLessThanOrEqual(181);
  await expect(cmPage.locator('#nwRangeSeg button[data-range="6M"]')).toHaveClass(/on/);
});
