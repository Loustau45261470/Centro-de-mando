// Patrimonio (Finanzas, escritorio): el alto que sobra respecto de Hábitos se reparte entre el gráfico de evolución y la dona
// (antes iba todo al gráfico: 445 px a 1280 con 3 cuentas). El gráfico tiene un tope y la dona crece mientras las etiquetas entren.
// Datos de ejemplo inventados, solo en memoria.
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-23';
const GRAFICO_MAX = 420;   // FIN_MAX de alinear-columnas.js
// Medido antes del cambio (mismo viewport 1000 de alto): diámetro del anillo y alto del gráfico con 3 cuentas.
const ANTES = { 1280: { D: 342, graf: 445 }, 1440: { D: 345, graf: 470 }, 1920: { D: 345, graf: 544 } };

async function preparar(page, ancho, nCuentas, alto = 1000) {
  await page.setViewportSize({ width: ancho, height: alto });
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.waitForFunction(() => typeof nwLineInst !== 'undefined' && !!nwLineInst);
  await page.evaluate(({ hoy, n }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'a1', name: 'Ualá', type: 'bank', balance: 2150000, currency: 'ARS', icon: '🏦' },
      { id: 'a2', name: 'Efectivo', type: 'cash', balance: 180000, currency: 'ARS', icon: '💵' },
      { id: 'a3', name: 'Inversiones', type: 'invest', balance: 4900000, currency: 'ARS', icon: '📈' },
      ...Array.from({ length: Math.max(0, n - 3) }, (_, i) => ({ id: 'x' + i, name: 'Cuenta ' + (i + 1), type: 'bank', balance: 100000 * (i + 1), currency: 'ARS', icon: '🏦' })),
    ];
    S.cards = []; S.cardCharges = []; S.cardPayments = []; S.moves = []; S.nwHistory = []; S.accountHistory = []; S.transactions = [];
    S.habitTrackers = S.habitTrackers && !Array.isArray(S.habitTrackers) ? S.habitTrackers : { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] };
    S.habitTrackers.finanzas = ['Registrar gastos', 'Revisar cuentas'].map((nm, i) => ({ id: 'f' + i, name: nm, emoji: '📒', days: {} }));
    renderHabitsCard('finanzas'); renderFinanzasTab();
  }, { hoy: HOY, n: nCuentas });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 1200)))));
}
const medir = (page) => page.evaluate(() => {
  const pos = (el) => { let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t; };
  const fin = (el) => pos(el) + el.getBoundingClientRect().height;
  const card = document.getElementById('nwLineChart').closest('.card'), hab = document.querySelector('#finanzas-habits-wrap > .card'), s = nwPieInst.estado;
  const cv = document.getElementById('nwPieChart').getBoundingClientRect(), ce = document.querySelector('.nw-dona-centro').getBoundingClientRect();
  return { graf: document.getElementById('nwLineChart').closest('.chart-wrap').getBoundingClientRect().height, D: s.D, W: s.W, H: s.H, wide: s.wide, dFin: fin(card) - fin(hab),
    cx: ce.left + ce.width / 2 - (cv.left + cv.width / 2), circular: Math.abs(s.RO * 2 - s.D) < .01, bitmap: document.getElementById('nwPieChart').width > 0 };
});

for (const n of [3, 10]) {
  test(`Patrimonio 1280px, ${n} cuentas: gráfico con tope, dona no más chica y final a la par con Hábitos`, async ({ cmPage: page }) => {
    await preparar(page, 1280, n);
    const m = await medir(page);
    expect(m.graf, 'el gráfico no pasa del tope').toBeLessThanOrEqual(GRAFICO_MAX + .5);
    expect(m.graf, 'y no baja de su piso').toBeGreaterThanOrEqual(110);
    if (n === 3) expect(m.D, 'la dona crece respecto de antes').toBeGreaterThan(ANTES[1280].D + 20);
    else expect(m.D, 'con 10 cuentas las etiquetas del costado fijan el ancho: no puede ser menor que antes').toBeGreaterThanOrEqual(ANTES[1280].D - 1);
    expect(m.wide).toBe(true);
    expect(Math.abs(m.dFin), 'el final de Patrimonio queda a la par del de Hábitos').toBeLessThanOrEqual(2);
    expect(Math.abs(m.cx)).toBeLessThan(2);
    expect(m.bitmap).toBe(true);
    // las etiquetas siguen dentro del lienzo
    const fuera = await page.evaluate(() => { const s = nwPieInst.estado; return s.items.filter((it) => it.value && (it.side > 0 ? it.ex + 11 + it.lw > s.W : it.ex - 11 - it.lw < 0)).length; });
    expect(fuera).toBe(0);
  });
}

for (const ancho of [1440, 1920]) {
  test(`Patrimonio ${ancho}px, 3 cuentas: el alto se reparte (gráfico con tope, dona mucho más grande)`, async ({ cmPage: page }) => {
    await preparar(page, ancho, 3);
    const m = await medir(page);
    expect(m.graf).toBeLessThanOrEqual(GRAFICO_MAX + .5);
    expect(m.graf).toBeLessThan(ANTES[ancho].graf * .8);
    expect(m.D).toBeGreaterThan(ANTES[ancho].D * 1.25);
    expect(Math.abs(m.dFin)).toBeLessThanOrEqual(2);
  });
}

test('Patrimonio 390px: sin cambios (dona de ancho justo, gráfico de altura base, sin alto forzado)', async ({ cmPage: page }) => {
  await preparar(page, 390, 3, 844);
  const m = await medir(page);
  expect(m.wide).toBe(false);
  expect(m.D).toBeCloseTo(.785 * Math.min(m.W, 440), 1);
  expect(m.graf).toBeLessThanOrEqual(190);
  expect(await page.evaluate(() => document.getElementById('nwLineChart').closest('.chart-wrap').style.height)).toBe('');
});
