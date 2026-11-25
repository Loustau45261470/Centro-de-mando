// Columnas de escritorio a la par (alinear-columnas.js):
//  · Vida: Planificación del día termina donde termina Hábitos, mostrando solo las filas que entran (alrededor de la hora actual).
//  · Finanzas: Patrimonio termina donde termina Hábitos (gráfico adaptativo) y Presupuesto empieza donde Actividad (Movimientos).
//  · «Gastado · últimos 6 meses» vive en el overlay de Presupuesto, no en la sección. El abanico de Vida ya no trae «Planificación».
// Datos de ejemplo inventados, solo en memoria.
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-23';
const ANCHOS = [1280, 1536, 1700];

// 80 ítems cada 10 min desde las 08:00, de 30 min de duración (la tarjeta de Hábitos es alta y las filas bajas: con pocos ítems entran todos y la tarjeta solo se estira).
const N = 80;
const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
const tareas = () => Array.from({ length: N }, (_, i) => ({ id: 'p' + i, text: 'Actividad ' + (i + 1), time: hhmm(8 * 60 + i * 10), duration: 30, priority: 2, area: 'vida', done: false }));

async function irA(page, tab, ancho, alto = 1000) {
  await page.setViewportSize({ width: ancho, height: alto });
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator('#tab-' + tab)).toHaveClass(/active/);
}
async function sembrarVida(page) {
  await page.evaluate(({ hoy, t }) => {
    window.getActiveDate = () => hoy;
    S.dayPlan = { [hoy]: { tasks: t } }; S.planRecurring = []; S.goals = {};
    S.habitTrackers = S.habitTrackers && !Array.isArray(S.habitTrackers) ? S.habitTrackers : { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] };
    S.habitTrackers.vida = ['Leer', 'Meditar', 'Caminar'].map((n, i) => ({ id: 'h' + i, name: n, emoji: '📌', days: {} }));
    renderHabitsCard('vida'); renderDayPlanner();
  }, { hoy: HOY, t: tareas() });
}
async function sembrarFinanzas(page, nCuentas = 8) {
  await page.evaluate(({ hoy, n }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'a1', name: 'Ualá', type: 'bank', balance: 2150000, currency: 'ARS', icon: '🏦' },
      { id: 'a2', name: 'Efectivo', type: 'cash', balance: 180000, currency: 'ARS', icon: '💵' },
      { id: 'a3', name: 'Inversiones', type: 'invest', balance: 4900000, currency: 'ARS', icon: '📈' },
      ...Array.from({ length: Math.max(0, n - 3) }, (_, i) => ({ id: 'x' + i, name: 'Cuenta ' + (i + 1), type: 'bank', balance: 100000 * (i + 1), currency: 'ARS', icon: '🏦' })),
    ];
    S.cards = []; S.cardCharges = []; S.cardPayments = []; S.moves = []; S.nwHistory = []; S.accountHistory = [];
    S.transactions = Array.from({ length: 6 }, (_, i) => ({ id: 'tx' + i, date: `2026-11-${String(1 + i).padStart(2, '0')}`, name: 'Gasto ' + i, type: 'expense', amount: 20000 + i * 3000, currency: 'ARS', accountId: 'a1' }));
    S.habitTrackers = S.habitTrackers && !Array.isArray(S.habitTrackers) ? S.habitTrackers : { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] };
    S.habitTrackers.finanzas = ['Registrar gastos', 'Revisar cuentas'].map((n, i) => ({ id: 'f' + i, name: n, emoji: '📒', days: {} }));
    renderHabitsCard('finanzas'); renderFinanzasTab();
  }, { hoy: HOY, n: nCuentas });
}
// Posición de LAYOUT (sin transformaciones): las tarjetas entran con un desplazamiento animado y con el reloj congelado de estos tests la animación no termina.
const bottom = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t + el.getBoundingClientRect().height; }, sel);
const top = (page, sel) => page.evaluate((s) => { let t = 0; for (let e = document.querySelector(s); e; e = e.offsetParent) t += e.offsetTop; return t; }, sel);
const HAB_VIDA = '#vida-habits-wrap > .card';
const esperar = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 900)))));

for (const ancho of ANCHOS) {
  test(`Vida ${ancho}px: el final de Planificación coincide con el de Hábitos`, async ({ cmPage: page }) => {
    await page.clock.setFixedTime(new Date(HOY + 'T18:10:00'));
    await irA(page, 'vida', ancho);
    await sembrarVida(page); await esperar(page);
    const d = Math.abs((await bottom(page, '#dayPlannerCard')) - (await bottom(page, HAB_VIDA)));
    expect(d).toBeLessThanOrEqual(2);
    // Con 80 filas no entran todas: quedan algunas ocultas y el aviso lo dice.
    const vis = await page.locator('#dayPlannerList .pcal-row:visible').count();
    expect(vis).toBeLessThan(N); expect(vis).toBeGreaterThan(0);
    await expect(page.locator('#dayPlannerList .alin-mas')).toHaveText(`+${N - vis} más`);
    // Hora simulada 18:10 → el ítem en curso (18:00) está visible.
    await expect(page.locator('#dayPlannerList .pcal-row:visible', { hasText: 'Actividad 61' })).toHaveCount(1);
    await page.screenshot({ path: process.env.ALIN_DIR ? `${process.env.ALIN_DIR}/vida-${ancho}.png` : undefined, fullPage: false });
  });
}

test('Vida: agregar un hábito vuelve a alinear; recorrer la hora cambia la ventana', async ({ cmPage: page }) => {
  await page.clock.setFixedTime(new Date(HOY + 'T18:10:00'));
  await irA(page, 'vida', 1536);
  await sembrarVida(page); await esperar(page);
  await page.evaluate(() => { ['Estirar mucho', 'Respirar profundo', 'Escribir diario', 'Tomar agua'].forEach((n) => addHabitTo('vida', n, '💧')); });
  await esperar(page);
  expect(Math.abs((await bottom(page, '#dayPlannerCard')) - (await bottom(page, HAB_VIDA)))).toBeLessThanOrEqual(2);
  // Seguir la hora: a las 07:10 la ventana arranca temprano (no se ve la de las 20:00).
  await page.clock.setFixedTime(new Date(HOY + 'T07:10:00'));
  await page.evaluate(() => CMAlinear.run()); await esperar(page);
  await expect(page.locator('#dayPlannerList .pcal-row:visible .pcal-text', { hasText: /^Actividad 2$/ })).toHaveCount(1);
  await expect(page.locator('#dayPlannerList .pcal-row:visible .pcal-text', { hasText: /^Actividad 80$/ })).toHaveCount(0);
});

test('Vida: tocar la tarjeta abre Planificación; casillas, filas y "+N más" no rompen nada', async ({ cmPage: page }) => {
  await page.clock.setFixedTime(new Date(HOY + 'T18:10:00'));
  await irA(page, 'vida', 1536);
  await sembrarVida(page); await esperar(page);
  const card = page.locator('#dayPlannerCard');
  await expect(card).toHaveAttribute('role', 'button');
  await expect(card).toHaveAttribute('tabindex', '0');
  await expect(card).toHaveAttribute('aria-label', /planificación/i);
  // Casilla: tilda la tarea y NO abre el overlay.
  await page.locator('#dayPlannerList .pcal-row:visible .pcal-check input').first().click();
  await esperar(page);
  expect(await page.evaluate(() => document.getElementById('ov-planner')?.classList.contains('show') || false)).toBe(false);
  expect(await page.evaluate(() => S.dayPlan['2026-11-23'].tasks.filter((t) => t.done).length)).toBe(1);
  // El título de la tarjeta sí.
  await card.locator('.card-title').click({ position: { x: 20, y: 10 } });
  await expect(page.locator('#ov-planner')).toHaveClass(/show/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ov-planner')).not.toHaveClass(/show/);
  // "+N más" también abre.
  await page.locator('#dayPlannerList .alin-mas').click();
  await expect(page.locator('#ov-planner')).toHaveClass(/show/);
});

test('Vida: el abanico ya no trae "Planificación"', async ({ cmPage: page }) => {
  await irA(page, 'vida', 1536);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#sd-vida .cm-sd-item')].map((b) => b.getAttribute('aria-label')));
  expect(labels).toContain('Fichero');
  expect(labels).toContain('Principios');
  expect(labels).not.toContain('Planificación');
});

for (const ancho of ANCHOS) {
  test(`Finanzas ${ancho}px: Hábitos termina con Patrimonio y Actividad empieza con Presupuesto`, async ({ cmPage: page }) => {
    await irA(page, 'finanzas', ancho);
    await page.waitForFunction(() => typeof nwLineInst !== 'undefined' && !!nwLineInst);
    await sembrarFinanzas(page); await esperar(page);
    const patri = await page.evaluate(() => { const el = document.getElementById('nwLineChart').closest('.card'); let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t + el.getBoundingClientRect().height; });
    const hab = await bottom(page, '#finanzas-habits-wrap > .card');
    expect(Math.abs(patri - hab)).toBeLessThanOrEqual(2);
    expect(Math.abs((await top(page, '#activity-card')) - (await top(page, '#budget-summary-card')))).toBeLessThanOrEqual(2);
    const h = await page.locator('#nwLineChart').locator('xpath=ancestor::div[contains(@class,"chart-wrap")][1]').evaluate((w) => w.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(110);
    await page.screenshot({ path: process.env.ALIN_DIR ? `${process.env.ALIN_DIR}/finanzas-${ancho}.png` : undefined, fullPage: false });
  });
}

// Cantidad de cuentas × ancho: Patrimonio y Hábitos terminan a la par, Actividad y Presupuesto empiezan a la par, sin aire vacío dentro de Patrimonio.
for (const n of [3, 5, 8, 10, 12, 15]) {
  for (const ancho of ANCHOS) {
    test(`Finanzas ${n} cuentas a ${ancho}px: finales e inicios a la par, sin aire en Patrimonio`, async ({ cmPage: page }) => {
      await irA(page, 'finanzas', ancho, 1000);
      await page.waitForFunction(() => typeof nwLineInst !== 'undefined' && !!nwLineInst);
      await sembrarFinanzas(page, n); await esperar(page);
      await page.evaluate(() => document.getElementById('activity-card').scrollIntoView()); await esperar(page);
      const m = await page.evaluate(() => {
        const pos = (el) => { let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t; };
        const card = document.getElementById('nwLineChart').closest('.card');
        const hab = document.querySelector('#finanzas-habits-wrap > .card');
        const last = [...document.getElementById('accountList').children].reverse().find((c) => c.offsetHeight > 0);
        const fin = (el) => pos(el) + el.getBoundingClientRect().height;
        return { patri: fin(card), hab: fin(hab), act: pos(document.getElementById('activity-card')), pre: pos(document.getElementById('budget-summary-card')), aire: fin(card) - fin(last), h: document.querySelector('#nwLineChart').closest('.chart-wrap').getBoundingClientRect().height, habMin: hab.style.minHeight };
      });
      console.log(`MED n=${n} w=${ancho} dFin=${(m.patri - m.hab).toFixed(1)} dIni=${(m.act - m.pre).toFixed(1)} aire=${m.aire.toFixed(1)} grafico=${m.h} habMin=${m.habMin}`);
      expect(Math.abs(m.patri - m.hab)).toBeLessThanOrEqual(2);
      expect(Math.abs(m.act - m.pre)).toBeLessThanOrEqual(2);
      expect(m.aire).toBeLessThanOrEqual(24);
      expect(m.h).toBeGreaterThanOrEqual(110);
    });
  }
}

test('Finanzas: «Gastado · últimos 6 meses» sale de la sección y queda en el overlay de Presupuesto', async ({ cmPage: page }) => {
  await irA(page, 'finanzas', 1536);
  await sembrarFinanzas(page);
  await expect(page.locator('#budget-summary-card')).not.toContainText('últimos 6 meses');
  await expect(page.locator('#budget-summary-card .bsum-trend')).toHaveCount(0);
  await page.evaluate(() => openBudgetOverlay('presupuestos'));
  await expect(page.locator('#bd-pane-presupuestos #bsum-trend-ov')).toContainText('Gastado · últimos 6 meses');
  await expect(page.locator('#bsum-trend-ov .bsum-tcol')).toHaveCount(6);
  await page.screenshot({ path: process.env.ALIN_DIR ? `${process.env.ALIN_DIR}/finanzas-overlay-presupuesto.png` : undefined });
});

test('390px: sin scroll horizontal, la lista del día completa y el gráfico de Patrimonio como antes', async ({ cmPage: page }) => {
  await page.clock.setFixedTime(new Date(HOY + 'T18:10:00'));
  await irA(page, 'vida', 390, 844);
  await sembrarVida(page); await esperar(page);
  expect(await page.locator('#dayPlannerList .pcal-row:visible').count()).toBe(N);
  await expect(page.locator('#dayPlannerList .alin-mas')).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById('dayPlannerCard').style.minHeight)).toBe('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: process.env.ALIN_DIR ? `${process.env.ALIN_DIR}/vida-390.png` : undefined });
  await irA(page, 'finanzas', 390, 844);
  await sembrarFinanzas(page); await esperar(page);
  expect(await page.locator('#nwLineChart').locator('xpath=ancestor::div[contains(@class,"chart-wrap")][1]').evaluate((w) => w.getBoundingClientRect().height)).toBe(124);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: process.env.ALIN_DIR ? `${process.env.ALIN_DIR}/finanzas-390.png` : undefined });
});
