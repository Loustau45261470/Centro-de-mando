// Finanzas · reorganización de la pestaña (paso 1): Patrimonio y Movimientos arriba a la izquierda,
// Objetivos trimestrales y Calendario de hábitos arriba a la derecha, columnas parejas y sin aclaraciones sobrantes.
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguno.
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-10-15';
const MES = '2026-10';

const TEXTOS_ELIMINADOS = [
  'Balance real',
  'La torta muestra tus cuentas; el crédito usado se descuenta en el balance real.',
  'Desde 21/10/2026 el patrimonio descuenta el crédito usado de las tarjetas; los puntos anteriores no.',
  'Se paga solo desde Ualá',
];

// Estado de ejemplo completo: cuentas, tarjetas, movimientos, presupuesto, objetivos, metas de compra.
async function cargarEjemplo(page) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, mes }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 200000, currency: 'ARS', icon: '💵' },
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' },
      { id: 'bco', name: 'Banco Galicia', type: 'bank', balance: 1300000, currency: 'ARS', icon: '🏦' },
      { id: 'inv', name: 'Inversiones', type: 'invest', balance: 300000, currency: 'ARS', icon: '📈' },
    ];
    S.cards = [
      { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 600000, payAccountId: 'uala' },
      { id: 'vis', name: 'Visa Galicia', limit: 2000000, closeDay: 20, dueDay: 5, openingUsed: 250000, payAccountId: 'bco' },
    ];
    S.cardCharges = []; S.cardPayments = []; S.moves = []; S.nwHistory = []; S.accountHistory = [];
    S.transactions = Array.from({ length: 14 }, (_, i) => ({
      id: 'tx' + i, date: `2026-10-${String(1 + i).padStart(2, '0')}`, name: i === 0 ? 'Salario' : 'Gasto ' + i,
      type: i === 0 ? 'income' : 'expense', amount: i === 0 ? 1500000 : 20000 + i * 3500, currency: 'ARS', accountId: 'bco',
      category: i === 0 ? 'salary' : undefined,
    }));
    S.budgets = { [mes]: {
      fixed: [
        { id: 'f1', name: 'Carne', category: 'food', unit: 'kg', v1: 20, v2: 0.7, v3: 14000 },
        { id: 'f2', name: 'Verdura', category: 'food', unit: 'kg', v1: 15, v2: 0.5, v3: 3000 },
      ],
      reserved: [{ id: 'r1', name: 'Seguro', category: 'food', amount: 50000 }],
    } };
    budgetActiveMonth = null; budgetActiveYear = null;
    S.finObjectives = [
      { id: 'o1', date: '06/26', label: 'Junio', real: 3000000, expected: 2800000 },
      { id: 'o2', date: '09/26', label: 'Septiembre', real: 3400000, expected: 3500000 },
      { id: 'o3', date: '12/26', label: 'Diciembre', real: null, expected: 4200000 },
      { id: 'o4', date: '03/27', label: 'Marzo', real: null, expected: 5000000 },
    ];
    S.wishlist = [
      { id: 'w1', name: 'Notebook', amount: 1200, currency: 'USD', category: 'tech', priority: 'high', score: 5 },
      { id: 'w2', name: 'Bicicleta', amount: 600, currency: 'USD', category: 'sport', priority: 'normal', score: 4 },
      { id: 'w3', name: 'Cámara', amount: 900, currency: 'USD', category: 'tech', priority: 'normal', score: 3 },
      { id: 'w4', name: 'Escritorio', amount: 400, currency: 'USD', category: 'home', priority: 'normal', score: 3 },
      { id: 'w5', name: 'Mochila', amount: 90, currency: 'USD', category: 'sport', priority: 'low', score: 2 },
      { id: 'w6', name: 'Auriculares', amount: 150, currency: 'USD', category: 'tech', priority: 'low', score: 1 },
    ];
    S.purchaseFunds = [
      { id: 'pf1', name: 'Notebook', emoji: '💻', monthlyAmount: 100000, accountId: 'bco', condition: null, createdMonth: '2026-08' },
      { id: 'pf2', name: 'Viaje', emoji: '✈️', monthlyAmount: 50000, accountId: 'bco', condition: null, createdMonth: '2026-09' },
    ];
    S.reminders = S.reminders || {};
    S.reminders.finanzas = [
      { id: 'rem1', title: 'Pagar el resumen de Naranja', datetime: '2026-10-20T10:00', priority: 'high' },
      { id: 'rem2', title: 'Revisar inversiones', datetime: '2026-10-25T10:00', priority: 'medium' },
    ];
    const qo = S.quarterlyObjectives;
    let period = qo.periods.find((p) => p.id === qo.activePeriod) || qo.periods[0];
    period.flat = false;
    period.objectives = (period.objectives || []).filter((o) => o.category !== 'Economía');
    ['Cerrar el mes con superávit', 'Armar el fondo de emergencia', 'Pasar USD a instrumentos de renta', 'Revisar seguros'].forEach((text, i) => {
      period.objectives.push({ id: 9000 + i, category: 'Economía', text, done: i === 0 });
    });
    S.habitTrackers = S.habitTrackers || {};
    S.habitTrackers.finanzas = [
      { id: 'hf1', name: 'Anotar gastos', emoji: '📒', days: { '2026-10-13': 'done', '2026-10-14': 'done', '2026-10-15': 'missed' } },
      { id: 'hf2', name: 'Revisar presupuesto', emoji: '🧮', days: { '2026-10-12': 'done', '2026-10-15': 'done' } },
    ];
    renderFinanzasTab();
    renderQuarterlyObjectives();
    renderHabitsCard('finanzas');
    renderRemindersNotif('finanzas');
  }, { hoy: HOY, mes: MES });
}

// Hijos directos visibles (con caja) de cada columna, como lista de ids o clases identificatorias.
const hijosVisibles = (page, col) => page.evaluate((idx) => {
  const c = document.querySelectorAll('#tab-finanzas .fin-cols > .fin-col')[idx];
  return [...c.children].filter((el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none').map((el) => {
    if (el.id) return el.id;
    if (el.querySelector('#nwTotal')) return 'patrimonio';
    if (el.classList.contains('rnotif-card')) return 'rnotif-card';
    return el.className || el.tagName;
  });
}, col);

// Geometría de Movimientos respecto de Patrimonio con offsets de layout: las tarjetas entran con una animación
// (card-slide-in) que mueve getBoundingClientRect durante ~400 ms, pero no cambia offsetLeft/Top/Width/Height.
const medirPatrimonioMovimientos = (page) => page.evaluate(() => {
  const pos = (el) => { let x = 0, y = 0; for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x, y, w: el.offsetWidth, h: el.offsetHeight }; };
  const p = pos(document.querySelector('#nwTotal').closest('.card'));
  const m = pos(document.getElementById('activity-card'));
  return { dLeft: Math.abs(p.x - m.x), dWidth: Math.abs(p.w - m.w), hueco: m.y - (p.y + p.h) };
});

test.describe('1280px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('1) Movimientos es la 2da tarjeta de la columna izquierda, justo bajo Patrimonio', async ({ cmPage }) => {
    await cargarEjemplo(cmPage);
    const izq = await hijosVisibles(cmPage, 0);
    expect(izq.slice(0, 2)).toEqual(['patrimonio', 'activity-card']);
    // proyeccion-card la inserta proyeccion-mes.js pegada a budget-summary-card (ya viajaba con él antes del cambio)
    expect(izq).toEqual(['patrimonio', 'activity-card', 'budget-summary-card', 'proyeccion-card', 'rnotif-card', 'wish-top5-card']);
    // el orden del DOM coincide con el visual: Movimientos va inmediatamente después de Patrimonio, sin nada en el medio
    const adyacentes = await cmPage.evaluate(() => document.querySelector('#nwTotal').closest('.card').nextElementSibling.id);
    expect(adyacentes).toBe('activity-card');
    // y queda físicamente debajo
    const [bp, bm] = await cmPage.evaluate(() => ['#nwTotal', '#activity-card'].map((s) => {
      const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, left: r.left };
    }));
    expect(bm.top).toBeGreaterThan(bp.top);
    // misma columna (mismo borde izquierdo y mismo ancho) y Movimientos justo debajo, sin otra tarjeta entre ambas
    const g = {
      ...(await medirPatrimonioMovimientos(cmPage)),
      mismaCol: await cmPage.evaluate(() => {
        const cols = [...document.querySelectorAll('#tab-finanzas .fin-cols > .fin-col')];
        return cols.findIndex((c) => c.contains(document.querySelector('#nwTotal'))) === cols.findIndex((c) => c.contains(document.getElementById('activity-card')));
      }),
    };
    expect(g.mismaCol).toBe(true);
    expect(g.dLeft).toBeLessThanOrEqual(1);
    expect(g.dWidth).toBeLessThanOrEqual(1);
    expect(g.hueco).toBeGreaterThanOrEqual(-1);
    expect(g.hueco).toBeLessThanOrEqual(40);
  });

  test('2) la derecha empieza con Objetivos trimestrales y luego el Calendario de hábitos', async ({ cmPage }) => {
    await cargarEjemplo(cmPage);
    const der = await hijosVisibles(cmPage, 1);
    expect(der.slice(0, 2)).toEqual(['qobj-wrap-finanzas', 'finanzas-habits-wrap']);
    expect(der).toEqual(['qobj-wrap-finanzas', 'finanzas-habits-wrap', 'credit-card', 'debt-flow-card', 'fin-objectives-wrap', 'fondos-card']);
  });

  test('3) la tarjeta de obligaciones recurrentes no existe ni en la pestaña ni en el overlay de Presupuesto', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    const ausente = () => cmPage.evaluate(() => ['obligaciones-card', 'subList', 'modal-add-sub', 'modal-edit-sub'].filter((id) => document.getElementById(id)));
    expect(await ausente()).toEqual([]);
    expect(await cmPage.evaluate(() => /obligaciones recurrentes/i.test(document.getElementById('tab-finanzas').innerHTML))).toBe(false);
    await cmPage.evaluate(() => openBudgetOverlay());
    await expect(cmPage.locator('#ov-budget-host #budget-card')).toBeVisible();
    expect(await ausente()).toEqual([]);
    await expect(cmPage.locator('#ov-budget-host')).not.toContainText(/obligaciones recurrentes/i);
    expect(consoleErrors).toEqual([]);
  });

  test('4) los textos eliminados no aparecen en Finanzas y el cash se ve en pequeño', async ({ cmPage }) => {
    await cargarEjemplo(cmPage);
    const tab = cmPage.locator('#tab-finanzas');
    for (const t of TEXTOS_ELIMINADOS) await expect(tab, t).not.toContainText(t);
    // El HTML de la pestaña tampoco los trae (ni siquiera ocultos).
    const html = await cmPage.evaluate(() => document.getElementById('tab-finanzas').innerHTML);
    for (const t of TEXTOS_ELIMINADOS) expect(html.includes(t), t).toBe(false);
    for (const id of ['nwBreakdown', 'nwMethodNote', 'nwPieNote']) expect(await cmPage.locator('#' + id).count(), id).toBe(0);
    // Cash en pequeño, debajo del balance.
    const linea = cmPage.locator('#nwCash').locator('xpath=..');
    const cash = await cmPage.evaluate(() => calcCash());
    expect(cash).toBeGreaterThan(0);
    await expect(linea).toHaveText('Cash ' + (await cmPage.evaluate((v) => fmtMoney(v, 'USD'), cash)));
    const [t, c] = await cmPage.evaluate(() => ['#nwTotal', '#nwCash'].map((s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize)));
    expect(c).toBeLessThan(t / 2);
    const [yt, yc] = await cmPage.evaluate(() => ['#nwTotal', '#nwCash'].map((s) => document.querySelector(s).getBoundingClientRect().top));
    expect(yc).toBeGreaterThan(yt);
    const titulo = await cmPage.evaluate(() => document.querySelector('#nwTotal').closest('.card').querySelector('.card-title').innerText.split(/\n/)[0].trim());
    expect(titulo.toLowerCase()).toBe('💰 patrimonio');
  });

  test('5) las dos columnas quedan parejas (diferencia de alto <= 25%)', async ({ cmPage }, testInfo) => {
    await cargarEjemplo(cmPage);
    const [izq, der] = await cmPage.evaluate(() => [...document.querySelectorAll('#tab-finanzas .fin-cols > .fin-col')].map((c) => Math.round(c.getBoundingClientRect().height)));
    testInfo.annotations.push({ type: 'alturas', description: `izq=${izq}px der=${der}px` });
    console.log(`ALTURAS izq=${izq} der=${der} dif=${(Math.abs(izq - der) / Math.max(izq, der) * 100).toFixed(1)}%`);
    expect(Math.abs(izq - der) / Math.max(izq, der)).toBeLessThanOrEqual(0.25);
  });

  test('7) cargar la pestaña no genera errores de consola', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    await cmPage.evaluate(() => renderFinanzasTab());
    expect(consoleErrors).toEqual([]);
  });

  test('8) Vencimientos y Presupuesto · resumen siguen mostrando datos', async ({ cmPage }) => {
    await cargarEjemplo(cmPage);
    await expect(cmPage.locator('#tab-finanzas .rnotif-card')).toContainText('Pagar el resumen de Naranja');
    const resumen = cmPage.locator('#budget-summary-card');
    await expect(resumen).toBeVisible();
    expect((await resumen.locator('#budgetSummaryBody').innerText()).trim().length).toBeGreaterThan(10);
  });
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('6) orden de lectura Patrimonio → Movimientos y sin scroll horizontal', async ({ cmPage }) => {
    await cargarEjemplo(cmPage);
    // Orden de lectura = tarjetas de las dos columnas apiladas, ordenadas por su posición vertical.
    const todas = await cmPage.evaluate(() => [...document.querySelectorAll('#tab-finanzas .fin-cols > .fin-col > *')]
      .filter((el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none')
      .map((el) => { let y = 0; for (let o = el; o; o = o.offsetParent) y += o.offsetTop; return { id: el.id || (el.querySelector('#nwTotal') ? 'patrimonio' : el.className), top: y }; })
      .sort((a, b) => a.top - b.top).map((x) => x.id));
    const iP = todas.indexOf('patrimonio');
    expect(iP).toBeGreaterThanOrEqual(0);
    // Movimientos es la tarjeta inmediatamente siguiente a Patrimonio: ninguna otra entre ambas.
    expect(todas[iP + 1]).toBe('activity-card');
    // y en el DOM también son contiguas, con los objetivos trimestrales después.
    expect(await cmPage.evaluate(() => document.querySelector('#nwTotal').closest('.card').nextElementSibling.id)).toBe('activity-card');
    expect(todas.indexOf('activity-card')).toBeLessThan(todas.indexOf('qobj-wrap-finanzas'));
    // físicamente, Movimientos queda debajo de Patrimonio a ancho completo de la columna apilada, con poco hueco.
    const g = await medirPatrimonioMovimientos(cmPage);
    expect(g.dLeft).toBeLessThanOrEqual(1);
    expect(g.dWidth).toBeLessThanOrEqual(1);
    expect(g.hueco).toBeGreaterThanOrEqual(-1);
    expect(g.hueco).toBeLessThanOrEqual(40);
    const { sw, cw } = await cmPage.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw + 1);
  });
});
