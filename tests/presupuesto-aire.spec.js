// Card PRESUPUESTO (Finanzas): aire entre el medidor y las filas (Gastado/Presupuesto/Disponible), montos sin cortarse ni pegarse al borde.
// Datos inventados, solo en memoria.
'use strict';
const { test, expect } = require('./support/fixtures');

const CASOS = [[1280, 900], [1440, 900], [1920, 1000], [390, 844]];
const MONTOS = [[501347, 640401], [9876543, 12345678]];   // captura real · montos largos (ARS 12.345.678)
const MIN_AIRE = 24;   // antes 18 px (pegado), ahora 28

async function pintar(page, spent, budget) {
  await page.evaluate(({ s, b }) => { window._budgetMonthTotal = () => b; window._spentMonth = () => s; renderBudgetSummary(); }, { s: spent, b: budget });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 1800)))));
}
const medir = (page) => page.evaluate(() => {
  const card = document.getElementById('budget-summary-card');
  const cs = getComputedStyle(card), cr = card.getBoundingClientRect();
  const wrap = card.querySelector('.bsum-gauge-wrap').getBoundingClientRect();
  const lbls = [...card.querySelectorAll('.bsum-fig-lbl')].map((e) => e.getBoundingClientRect());
  const nums = [...card.querySelectorAll('.bsum-fig-num, .bsum-fig-num2, .bsum-fig-num3')].map((e) => e.getBoundingClientRect());
  const fig = [...card.querySelectorAll('.bsum-fig, .bsum-figs, .bsum-top')].map((e) => e.scrollWidth - e.clientWidth);
  const numsOver = [...card.querySelectorAll('.bsum-fig-num, .bsum-fig-num2, .bsum-fig-num3')].map((e) => e.scrollWidth - e.clientWidth);
  return {
    aire: Math.min(...lbls.map((l) => l.left)) - wrap.right,
    contentRight: cr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth),
    maxNumRight: Math.max(...nums.map((n) => n.right)),
    figOverflow: Math.max(...fig), numsOver: Math.max(...numsOver),
    cardOver: card.scrollWidth - card.clientWidth, docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cardW: Math.round(cr.width),
  };
});

for (const [w, h] of CASOS) {
  for (const [s, b] of MONTOS) {
    test(`Presupuesto ${w}px · ARS ${Math.round(b)}: aire >= ${MIN_AIRE}px entre medidor y etiquetas, montos dentro de la card`, async ({ cmPage: page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.click('.nav-btn[data-tab="finanzas"]');
      await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
      await pintar(page, s, b);
      const m = await medir(page);
      console.log(`MED ${w} ${Math.round(b)}`, JSON.stringify(m));
      if (process.env.AIRE_DIR) await page.locator('#budget-summary-card').screenshot({ path: `${process.env.AIRE_DIR}/${process.env.AIRE_TAG || 'x'}-${w}-${Math.round(b)}.png` });
      expect(m.aire).toBeGreaterThanOrEqual(MIN_AIRE);
      expect(m.maxNumRight).toBeLessThanOrEqual(m.contentRight + 0.5);
      expect(m.figOverflow).toBeLessThanOrEqual(0);
      expect(m.numsOver).toBeLessThanOrEqual(0);
      expect(m.cardOver).toBeLessThanOrEqual(0);
      expect(m.docOver).toBeLessThanOrEqual(0);
    });
  }
}

test('Finanzas 1440px: Actividad empieza a la par con Presupuesto aun con montos largos', async ({ cmPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('.nav-btn[data-tab="finanzas"]');
  await pintar(page, 9876543, 12345678);
  await page.evaluate(() => { if (window.CMAlinear) CMAlinear.run(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 900)));
  const pos = (sel) => page.evaluate((s) => { let t = 0; for (let e = document.querySelector(s); e; e = e.offsetParent) t += e.offsetTop; return t; }, sel);
  expect(Math.abs((await pos('#activity-card')) - (await pos('#budget-summary-card')))).toBeLessThanOrEqual(2);
});
