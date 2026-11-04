// Aviso de "presupuesto superado" al registrar un gasto: compara los gastos en PESOS del mes contra el presupuesto
// real del mes (S.budgets). Sin presupuesto cargado no avisa nada. Los gastos en otra moneda no cuentan.
// Los datos de ejemplo viven solo acá.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas } = require('./support/tarjetas-ui');

async function preparar(page, presupuesto) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate((presupuesto) => {
    window.getActiveDate = () => '2026-11-15';
    S.accounts = []; S.cards = []; S.cardCharges = []; S.cardPayments = []; S.cardDues = []; S.moves = [];
    S.transactions = []; S.purchaseFunds = []; S.purchaseFundLog = {};
    S.budgets = presupuesto ? { '2026-11': { fixed: [{ id: 'b1', name: 'Gasto', v1: 1, v2: 1, v3: presupuesto, cat: '' }], reserved: [], seasonal: [] } } : {};
    renderFinanzasTab();
  }, presupuesto);
}
async function gasto(page, monto, moneda = 'ARS') {
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
  await page.selectOption('#txnCurrency', moneda);
  await page.fill('#txnName', 'Prueba');
  await page.fill('#txnAmount', String(monto));
  await page.click('#modal-add-txn button:has-text("Registrar")');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
}
const toast = (page) => page.locator('#toast');

test('1) sin presupuesto cargado para el mes no hay aviso, por grande que sea el gasto', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, 0);
  expect(await cmPage.evaluate(() => _budgetMonthTotal('2026-11'))).toBe(0);
  await gasto(cmPage, 900000);
  await expect(toast(cmPage)).toHaveText('Movimiento registrado');
  await expect(cmPage.getByText('PRESUPUESTO SUPERADO')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('2) con presupuesto: avisa al 90% y al superarlo, comparando solo los gastos en pesos', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, 100000);
  expect(await cmPage.evaluate(() => _budgetMonthTotal('2026-11'))).toBe(100000);
  await gasto(cmPage, 50000);
  await expect(toast(cmPage)).toHaveText('Movimiento registrado');
  // 5.000.000 en dólares no suma al total en pesos.
  await gasto(cmPage, 5000000, 'USD');
  await expect(toast(cmPage)).toHaveText('Movimiento registrado');
  await gasto(cmPage, 41000);
  await expect(toast(cmPage)).toContainText('Gastos al 91%');
  await expect(cmPage.getByText('PRESUPUESTO SUPERADO')).toHaveCount(0);
  await gasto(cmPage, 10000);
  await expect(toast(cmPage)).toContainText('Límite mensual superado');
  await expect(cmPage.getByText('¡PRESUPUESTO SUPERADO!')).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});
