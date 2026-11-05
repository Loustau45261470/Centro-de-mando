// Finanzas · reorganización (W-B): Deuda y Proyección del mes fuera, un solo overlay "Presupuesto" con tres pestañas
// (Presupuestos · Fondos · Historial), tarjeta resumen clickeable y nuevo orden de las dos columnas.
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-10-15';

async function cargarEjemplo(page) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate((hoy) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' },
      { id: 'bco', name: 'Banco Galicia', type: 'bank', balance: 1300000, currency: 'ARS', icon: '🏦' },
    ];
    S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 600000, payAccountId: 'uala' }];
    S.cardCharges = []; S.cardPayments = []; S.moves = []; S.nwHistory = []; S.accountHistory = [];
    S.transactions = Array.from({ length: 6 }, (_, i) => ({
      id: 'tx' + i, date: `2026-10-${String(1 + i).padStart(2, '0')}`, name: i === 0 ? 'Salario' : 'Gasto ' + i,
      type: i === 0 ? 'income' : 'expense', amount: i === 0 ? 1500000 : 20000 + i * 3500, currency: 'ARS', accountId: 'bco',
      category: i === 0 ? 'salary' : undefined,
    }));
    S.budgets = { '2026-10': { fixed: [{ id: 'f1', name: 'Carne', category: 'food', unit: 'kg', v1: 20, v2: 0.7, v3: 14000 }], reserved: [] } };
    budgetActiveMonth = null; budgetActiveYear = null;
    S.wishlist = [{ id: 'w1', name: 'Notebook', amount: 1200, currency: 'USD', category: 'tech', priority: 'high', score: 5 }];
    S.purchaseFunds = [{ id: 'pf1', name: 'Notebook', emoji: '💻', monthlyAmount: 100000, accountId: 'bco', condition: null, createdMonth: '2026-08' }];
    S.reminders = S.reminders || {};
    S.reminders.finanzas = [{ id: 'rem1', title: 'Pagar el resumen de Naranja', datetime: '2026-10-20T10:00', priority: 'high' }];
    S.habitTrackers = S.habitTrackers || {};
    S.habitTrackers.finanzas = [{ id: 'hf1', name: 'Anotar gastos', emoji: '📒', days: { '2026-10-13': 'done' } }];
    renderFinanzasTab();
    renderQuarterlyObjectives();
    renderHabitsCard('finanzas');
    renderRemindersNotif('finanzas');
  }, HOY);
}

const hijos = (page, col) => page.evaluate((idx) => {
  const c = document.querySelectorAll('#tab-finanzas .fin-cols > .fin-col')[idx];
  return [...c.children].filter((el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none').map((el) => {
    if (el.id) return el.id;
    if (el.querySelector('#nwTotal')) return 'patrimonio';
    if (el.classList.contains('rnotif-card')) return 'rnotif-card';
    return el.className || el.tagName;
  });
}, col);

const tabs = (page) => page.locator('#ov-budget .plov-tab');
const tabActiva = (page) => page.locator('#ov-budget .plov-tab.on');

test.describe('1280px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('1) orden de las tarjetas: izquierda y derecha', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    const izq = await hijos(cmPage, 0);
    expect(izq).toEqual(['patrimonio', 'budget-summary-card', 'credit-card', 'wish-top5-card', 'rnotif-card']);
    const der = await hijos(cmPage, 1);
    // Objetivos, hábitos y recién después Actividad; el resto conserva su orden.
    expect(der.slice(0, 3)).toEqual(['qobj-wrap-finanzas', 'finanzas-habits-wrap', 'activity-card']);
    expect(der.indexOf('fin-objectives-wrap')).toBeGreaterThan(2);
    expect(der).not.toContain('credit-card');
    expect(der).not.toContain('fondos-card');
    // En el DOM, las dos columnas se apilan izquierda y después derecha (celular).
    const orden = await cmPage.evaluate(() => [...document.querySelectorAll('#tab-finanzas .fin-cols > .fin-col')].map((c) => c.firstElementChild.id || 'patrimonio'));
    expect(orden).toEqual(['patrimonio', 'qobj-wrap-finanzas']);
    expect(consoleErrors).toEqual([]);
  });

  test('2) Deuda y Proyección del mes no están ni se renderizan', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    expect(await cmPage.evaluate(() => ['debt-flow-card', 'debtFlowBody', 'proyeccion-card'].filter((id) => document.getElementById(id)))).toEqual([]);
    expect(await cmPage.evaluate(() => typeof window.CMProyeccion + '/' + typeof renderProyeccionCard)).toBe('undefined/undefined');
    await expect(cmPage.locator('#tab-finanzas')).not.toContainText('Proyección');
    await expect(cmPage.locator('#tab-finanzas .card-title', { hasText: /Deuda/ })).toHaveCount(0);
    // Los datos y la función de Deuda siguen: vuelve en una futura sección de estadísticas.
    expect(await cmPage.evaluate(() => typeof renderDebtFlow)).toBe('function');
    expect(consoleErrors).toEqual([]);
  });

  test('3) el overlay Presupuesto tiene tres pestañas y abre en Presupuestos', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    await cmPage.evaluate(() => openBudgetOverlay());
    await expect(cmPage.locator('#ov-budget')).toHaveClass(/show/);
    await expect(tabs(cmPage)).toHaveText(['Presupuestos', 'Fondos', 'Historial']);
    await expect(tabActiva(cmPage)).toHaveText('Presupuestos');
    await expect(cmPage.locator('#bd-pane-presupuestos #budget-card')).toBeVisible();
    await expect(cmPage.locator('#bd-pane-fondos')).toBeHidden();
    await expect(cmPage.locator('#bd-pane-historial')).toBeHidden();
    // Los dos overlays viejos ya no existen.
    expect(await cmPage.evaluate(() => !!document.getElementById('ov-historial'))).toBe(false);
    for (const [t, pane] of [['Fondos', '#bd-pane-fondos'], ['Historial', '#bd-pane-historial'], ['Presupuestos', '#bd-pane-presupuestos']]) {
      await cmPage.locator('#ov-budget .plov-tab', { hasText: t }).click();
      await expect(tabActiva(cmPage)).toHaveText(t);
      await expect(cmPage.locator(pane)).toBeVisible();
    }
    expect(consoleErrors).toEqual([]);
  });

  test('4) "Ver historial →" abre el overlay en la pestaña Historial y los filtros siguen andando', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
    const btn = cmPage.locator('#verHistorialBtn');
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(cmPage.locator('#ov-budget')).toHaveClass(/show/);
    await expect(tabActiva(cmPage)).toHaveText('Historial');
    await expect(cmPage.locator('#bd-pane-historial #activityList .activity-row').first()).toBeVisible();
    const total = await cmPage.locator('#activityList .activity-row').count();
    expect(total).toBeGreaterThan(1);
    // Filtro por categoría: Salario (salary) deja una sola fila.
    await cmPage.selectOption('#txnHistCatFilter', 'salary');
    await expect(cmPage.locator('#activityList .activity-row')).toHaveCount(1);
    await cmPage.selectOption('#txnHistCatFilter', '');
    await expect(cmPage.locator('#activityList .activity-row')).toHaveCount(total);
    // window.openHistorialOverlay sigue existiendo y abre en 'historial'.
    await cmPage.keyboard.press('Escape');
    await expect(cmPage.locator('#ov-budget')).not.toHaveClass(/show/);
    await cmPage.evaluate(() => openHistorialOverlay());
    await expect(tabActiva(cmPage)).toHaveText('Historial');
    expect(consoleErrors).toEqual([]);
  });

  test('5) la tarjeta resumen abre en Presupuestos y sus botones internos no abren dos veces', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    const card = cmPage.locator('#budget-summary-card');
    await expect(card).toHaveClass(/cc-card-link/);
    await expect(card).toHaveAttribute('role', 'button');
    // Dejar el overlay en otra pestaña para comprobar que el click lo manda a Presupuestos.
    await cmPage.evaluate(() => openBudgetOverlay('historial'));
    await cmPage.keyboard.press('Escape');
    await card.locator('.card-title').click();
    await expect(cmPage.locator('#ov-budget')).toHaveClass(/show/);
    await expect(tabActiva(cmPage)).toHaveText('Presupuestos');
    await cmPage.keyboard.press('Escape');
    // El botón "Ver presupuesto completo →" también abre en Presupuestos, con stopPropagation (abre una sola vez).
    const aperturas = await cmPage.evaluate(() => {
      let n = 0; const o = window.openBudgetOverlay; window.openBudgetOverlay = (t) => { n++; return o(t); };
      document.querySelector('#budget-summary-card .bsum-full').click();
      window.openBudgetOverlay = o; return n;
    });
    expect(aperturas).toBe(1);
    await expect(tabActiva(cmPage)).toHaveText('Presupuestos');
    expect(consoleErrors).toEqual([]);
  });

  test('6) Fondos vive solo en su pestaña y "+ Fondo" sigue andando', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    expect(await cmPage.evaluate(() => !!document.querySelector('#tab-finanzas #fondos-card'))).toBe(false);
    expect(await cmPage.evaluate(() => document.getElementById('fondos-card').parentElement.id)).toBe('bd-pane-fondos');
    await cmPage.evaluate(() => openBudgetOverlay());
    await cmPage.locator('#ov-budget .plov-tab', { hasText: 'Fondos' }).click();
    await expect(cmPage.locator('#bd-pane-fondos #fondos-card')).toBeVisible();
    await expect(cmPage.locator('#fundsList')).toContainText('Notebook');
    await cmPage.locator('#fondos-card').getByRole('button', { name: '+ Fondo' }).click();
    await expect(cmPage.locator('.modal.open, .modal.show, .modal-overlay.open').first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('7) el abanico de Finanzas tiene "Presupuesto" y no "Historial"', async ({ cmPage, consoleErrors }) => {
    await cargarEjemplo(cmPage);
    await cmPage.locator('#sd-finanzas .cm-sd-main').click();
    const etiquetas = await cmPage.locator('#sd-finanzas .cm-sd-item').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(etiquetas).toContain('Presupuesto');
    expect(etiquetas).not.toContain('Historial');
    await cmPage.locator('#sd-finanzas .cm-sd-item[aria-label="Presupuesto"]').click();
    await expect(cmPage.locator('#ov-budget')).toHaveClass(/show/);
    await expect(tabActiva(cmPage)).toHaveText('Presupuestos');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('celular 390px', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('8) en celular se apila la izquierda y después la derecha, sin desborde horizontal', async ({ cmPage }) => {
    await cargarEjemplo(cmPage);
    const r = await cmPage.evaluate(() => {
      const [a, b] = [...document.querySelectorAll('#tab-finanzas .fin-cols > .fin-col')].map((c) => c.getBoundingClientRect());
      return { apilado: b.top >= a.bottom - 1, desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(r.apilado).toBe(true);
    expect(r.desborde).toBeLessThanOrEqual(1);
  });
});
