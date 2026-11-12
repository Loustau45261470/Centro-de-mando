// Historial del overlay Presupuesto · acumulado de gastos (3/6/9/12 meses y YTD) con donut, barras y tabla por categoría.
// Los datos de ejemplo viven solo acá. Hoy real: el período se calcula con new Date() (mes en curso incluido).
'use strict';
const { test, expect} = require('./support/fixtures');

const mk = (off) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() - off, 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`; };
const tx = (id, off, amount, category, extra = {}) => ({ id, type: 'expense', name: id, amount, currency: 'ARS', category, date: mk(off), ...extra });

test('acumulado de gastos: períodos, categorías, donut y barras', async ({ cmPage: page }) => {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await page.evaluate((txns) => { S.transactions = txns; }, [
    tx('a', 0, 1000, 'food'), tx('b', 2, 2000, 'food'), tx('c', 5, 4000, 'transport'),
    tx('d', 8, 8000, 'food'), tx('e', 11, 16000, 'food'),
    tx('usd', 0, 999, 'food', { currency: 'USD' }), tx('pend', 0, 777, 'food', { pending: true }),
  ]);
  await page.evaluate(() => openBudgetOverlay('historial'));
  await expect(page.locator('#gacc-card')).toBeVisible();
  const tabla = () => page.evaluate(() => [...document.querySelectorAll('#gaccTable tbody tr')].map((r) => [...r.cells].map((c) => c.textContent.replace(/\s/g, ' ').trim())));
  const num = (s) => +s.replace(/[^\d]/g, '');
  const total = (await tabla()).at(-1).slice(1).map(num);
  const esperado = [3000, 7000, 15000, 31000];   // 3M, 6M, 9M, 12M (YTD depende de la fecha de hoy)
  expect(total.slice(0, 4)).toEqual(esperado);
  await page.click('.gacc-chip:has-text("12M")');
  await expect(page.locator('#gaccTotal')).toContainText('31,000');
  expect(await page.evaluate(() => [Chart.getChart('gaccDonut').data.datasets[0].data, Chart.getChart('gaccBars').data.labels.length])).toEqual([[27000, 4000], 12]);
  await page.click('.gacc-chip:has-text("3M")');
  expect(await page.evaluate(() => Chart.getChart('gaccBars').data.labels.length)).toBe(3);
  await page.screenshot({ path: test.info().outputPath('acumulado.png') });
});
