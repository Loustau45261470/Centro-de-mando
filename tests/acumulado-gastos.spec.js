// Historial del overlay Presupuesto · acumulado de gastos (3/6/9/12 meses y YTD) con donut, barras y tabla por categoría.
// Los datos de ejemplo viven solo acá. Hoy real: el período se calcula con new Date() (mes en curso incluido).
'use strict';
const { test, expect} = require('./support/fixtures');

const mk = (off) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() - off, 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`; };
let CA = '', CB = '';
const tx = (id, off, amount, category, extra = {}) => ({ id, type: 'expense', name: id, amount, currency: 'ARS', category, date: mk(off), ...extra });

test('acumulado de gastos: períodos, categorías, donut y barras', async ({ cmPage: page }) => {
  await page.click('.nav-btn[data-tab="finanzas"]');
  [CA, CB] = await page.evaluate(() => { ensureTxnCategories(); return BUDGET_EXPENSE_CATS.slice(0, 2); });
  await page.evaluate((txns) => { S.transactions = txns; }, [
    tx('a', 0, 1000, CA), tx('b', 2, 2000, CA), tx('c', 5, 4000, CB),
    tx('d', 8, 8000, CA), tx('e', 11, 16000, CA),
    tx('usd', 0, 999, CA, { currency: 'USD' }), tx('pend', 0, 777, CA, { pending: true }),
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

test('sin categoría se agrupa y se lista; el selector Mes/Año solo ofrece meses con registro o hasta un año vista', async ({ cmPage: page }) => {
  await page.click('.nav-btn[data-tab="finanzas"]');
  [CA, CB] = await page.evaluate(() => { ensureTxnCategories(); return BUDGET_EXPENSE_CATS.slice(0, 2); });
  await page.evaluate((txns) => { S.transactions = txns; txnActiveMonth = null; }, [
    tx('x1', 1, 500, 'cat_borrada_1'), tx('x2', 3, 700, 'cat_borrada_2'), tx('z', 0, 100, ''),
    { ...tx('vieja', 0, 50, CA), date: '2024-05-10' },
  ]);
  await page.evaluate(() => openBudgetOverlay('historial'));
  const filas = await page.evaluate(() => [...document.querySelectorAll('#gaccTable tbody tr td:first-child')].map((c) => c.textContent.trim()));
  expect(filas.filter((f) => f.includes('Sin categoría')).length).toBe(1);
  await expect(page.locator('#gaccSinCat summary')).toContainText('Sin categoría');
  // Selector: años = con registro (2024) + actual + hasta +12 meses; meses del año elegido solo si hay registro / ventana
  const info = await page.evaluate(() => {
    const ov = document.getElementById('ov-budget');
    const [m, y] = ov.querySelectorAll('#txnHistMonthFilter select');
    return { years: [...y.options].map((o) => o.value), meses: [...m.options].length };
  });
  expect(info.years).toContain('2024');
  await page.evaluate(() => setTxnMonthPart('y', '2024'));
  expect(await page.evaluate(() => txnActiveMonth)).toBe('2024-05');
  await page.evaluate(() => setTxnMonthPart('y', String(new Date().getFullYear())));
  const act = await page.evaluate(() => txnActiveMonth);
  expect(act.startsWith(String(new Date().getFullYear()))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('selector.png') });
});
