// XSS por categoria de transaccion (preexistente, hallado por la verificacion ciega): renderBudgetSummary pintaba
// `${ci.label || c}` sin escapar, asi que una categoria con HTML (por ejemplo la que guarda JARVIS desde la salida
// del modelo de lenguaje) ejecutaba script al renderizar Finanzas. Los datos de ejemplo viven solo en este test.
'use strict';
const { test, expect } = require('./support/fixtures');

const XSS = '<img src=x onerror=window.__xss=1>';
const RARA = "Ñandú & Café 'x'";

// Carga un mes con gastos de la categoria dada (nombre crudo, sin definir en S.txnCategories) y un item de
// presupuesto en la misma categoria, y vuelve a pintar todo lo de Finanzas que muestra categorias.
async function pintarFinanzas(page, categoria, { definirComo } = {}) {
  if (!(await page.locator('#tab-finanzas.active').count())) await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ categoria, definirComo }) => {
    const hoy = getActiveDate(), mk = hoy.slice(0, 7);
    ensureTxnCategories();
    if (definirComo) { S.txnCategories[categoria] = definirComo; _invalidateCatCache(); }
    window.__xss = undefined;
    S.transactions = [{ id: 'tx1', date: hoy, name: 'Compra', type: 'expense', amount: 5000, currency: 'ARS', accountId: '', category: categoria }];
    S.budgets = { [mk]: { fixed: [], reserved: [{ id: 'r1', name: 'Reserva', category: categoria, amount: 8000 }] } };
    txnActiveMonth = mk; budgetActiveMonth = mk; budgetActiveYear = +mk.slice(0, 4);
    renderBudgetSummary();
    renderActivity();
    fillTxnCategorySelect('editTxnCategory', categoria);
    openBudgetOverlay();
    renderBudget();
  }, { categoria, definirComo });
}

test('1. una categoria con HTML no ejecuta nada al renderizar Finanzas y se ve como texto', async ({ cmPage, consoleErrors }) => {
  await pintarFinanzas(cmPage, XSS);
  await cmPage.waitForTimeout(300); // onerror de un <img src=x> dispara de forma asincrona

  expect(await cmPage.evaluate(() => window.__xss)).toBeUndefined();
  for (const sel of ['#budgetSummaryBody', '#activityList', '#budgetBody']) {
    await expect(cmPage.locator(`${sel} img`)).toHaveCount(0);
  }
  // Resumen de presupuesto: la categoria desconocida se muestra como el texto literal.
  await expect(cmPage.locator('#budgetSummaryBody .bsum-cat-name').first()).toContainText(XSS);
  // Plan vs real del overlay de presupuestos.
  await expect(cmPage.locator('#budgetBody .budget-cmp-cat').first()).toContainText(XSS);
  // El select de edicion conserva el valor crudo como dato, no como marcado.
  expect(await cmPage.evaluate(() => document.getElementById('editTxnCategory').value)).toBe('<img src=x onerror=window.__xss=1>');
  expect(consoleErrors).toEqual([]);
});

test('2. una categoria legitima con tildes, & y comillas se ve identica, sin doble escape', async ({ cmPage }) => {
  // (a) definida en el mapa de categorias: se muestra su nombre, en el resumen, la actividad y el plan vs real.
  await pintarFinanzas(cmPage, 'cat_rara', { definirComo: { label: RARA, icon: '☕', color: '#ff8800', section: null } });
  await expect(cmPage.locator('#budgetSummaryBody .bsum-cat-name').first()).toHaveText(`☕ ${RARA}`);
  await expect(cmPage.locator('#activityList .activity-row').first()).toContainText(RARA);
  await expect(cmPage.locator('#budgetBody .budget-cmp-cat').first()).toHaveText(`☕ ${RARA}`);
  expect(await cmPage.locator('#budgetSummaryBody .bsum-cat-name').first().innerHTML()).not.toContain('&amp;amp;');

  // (b) sin definir (el nombre crudo hace de etiqueta): mismo texto que antes.
  await pintarFinanzas(cmPage, RARA);
  await expect(cmPage.locator('#budgetSummaryBody .bsum-cat-name').first()).toHaveText(`🔴 ${RARA}`);
  await expect(cmPage.locator('#budgetBody .budget-cmp-cat').first()).toHaveText(`🔴 ${RARA}`);
});

test('3. JARVIS add_transaction: una categoria que no existe cae al fallback sin guardar el valor crudo', async ({ cmPage }) => {
  const r = await cmPage.evaluate(() => {
    ensureTxnCategories();
    const lbl = Object.values(S.txnCategories)[0].label;
    const id0 = Object.keys(S.txnCategories)[0];
    S.transactions = [];
    const out = {};
    out.xss = JARVIS_BRAIN.execute('add_transaction', { name: 'a', amount: 10, category: '<img src=x onerror=window.__xss=1>' });
    out.porEtiqueta = JARVIS_BRAIN.execute('add_transaction', { name: 'b', amount: 10, category: lbl });
    out.porId = JARVIS_BRAIN.execute('add_transaction', { name: 'c', amount: 10, category: id0 });
    out.sinCategoria = JARVIS_BRAIN.execute('add_transaction', { name: 'd', amount: 10 });
    out.cats = Object.fromEntries(S.transactions.map((t) => [t.name, t.category]));
    out.id0 = id0;
    return out;
  });
  expect(r.xss.ok).toBe(true);
  expect(r.cats.a).toBe('');          // categoria invalida: fallback vacio (igual que jarvis-agent.js), nunca el valor crudo
  expect(r.cats.b).toBe(r.id0);       // una etiqueta existente se resuelve a su id
  expect(r.cats.c).toBe(r.id0);       // un id existente se conserva
  expect(r.cats.d).toBe('');
});
