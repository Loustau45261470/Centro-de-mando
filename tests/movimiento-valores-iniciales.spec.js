// "+ Movimiento": el formulario NUEVO arranca en Gasto + pesos y con el último medio de pago usado en un gasto.
// Al editar un movimiento o una compra existente se respetan SUS valores (no se pisan con los de alta).
// Los datos de ejemplo viven solo acá.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const LLAVE = 'cm_lastTxnAccount';

async function preparar(page) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate((llave) => {
    try { localStorage.removeItem(llave); } catch (e) {}
    window.getActiveDate = () => '2026-11-04';
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
    ];
    S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' }];
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.cardDues = []; S.moves = [];
    renderFinanzasTab();
  }, LLAVE);
}
const abrir = async (page) => {
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
};
const cerrar = async (page) => {
  await page.click('#modal-add-txn button:has-text("Cancelar")');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
};
async function registrar(page, { tipo, moneda, cuenta, nombre = 'Prueba', monto = '1000' }) {
  await abrir(page);
  if (tipo) await page.selectOption('#txnType', tipo);
  if (moneda) await page.selectOption('#txnCurrency', moneda);
  if (cuenta !== undefined) await page.selectOption('#txnAccount', cuenta);
  await page.fill('#txnName', nombre);
  await page.fill('#txnAmount', monto);
  await page.click('#modal-add-txn button:has-text("Registrar")');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
}

test('1) un movimiento nuevo arranca en Gasto, pesos y sin medio de pago si nunca se usó uno', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrir(cmPage);
  await expect(cmPage.locator('#txnType')).toHaveValue('expense');
  await expect(cmPage.locator('#txnCurrency')).toHaveValue('ARS');
  await expect(cmPage.locator('#txnAccount')).toHaveValue('');
  expect(consoleErrors).toEqual([]);
});

test('2) recuerda el último medio de pago de un gasto y vuelve a Gasto/pesos aunque antes se haya elegido otra cosa', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await registrar(cmPage, { tipo: 'expense', moneda: 'USD', cuenta: 'uala' });
  expect(await cmPage.evaluate((l) => localStorage.getItem(l), LLAVE)).toBe('uala');
  await abrir(cmPage);
  await expect(cmPage.locator('#txnType')).toHaveValue('expense');
  await expect(cmPage.locator('#txnCurrency')).toHaveValue('ARS');
  await expect(cmPage.locator('#txnAccount')).toHaveValue('uala');
  await cerrar(cmPage);
  // Un ingreso no cambia el medio recordado.
  await registrar(cmPage, { tipo: 'income', cuenta: 'efe', nombre: 'Honorarios' });
  await abrir(cmPage);
  await expect(cmPage.locator('#txnType')).toHaveValue('expense');
  await expect(cmPage.locator('#txnAccount')).toHaveValue('uala');
  await cerrar(cmPage);
  // Otro gasto con otro medio lo reemplaza.
  await registrar(cmPage, { cuenta: 'efe', nombre: 'Kiosco' });
  await abrir(cmPage);
  await expect(cmPage.locator('#txnAccount')).toHaveValue('efe');
  expect(consoleErrors).toEqual([]);
});

test('3) si el medio recordado ya no existe, el campo queda vacío', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await registrar(cmPage, { cuenta: 'uala' });
  await cmPage.evaluate(() => { S.accounts = S.accounts.filter((a) => a.id !== 'uala'); renderFinanzasTab(); });
  await abrir(cmPage);
  await expect(cmPage.locator('#txnAccount')).toHaveValue('');
  expect(consoleErrors).toEqual([]);
});

test('4) una compra con tarjeta también deja la tarjeta como último medio', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 5000, nombre: 'Café', fecha: '2026-11-04' });
  await guardarCompra(cmPage);
  expect(await cmPage.evaluate((l) => localStorage.getItem(l), LLAVE)).toBe('card:nar');
  await abrir(cmPage);
  await expect(cmPage.locator('#txnAccount')).toHaveValue('card:nar');
  await expect(cmPage.locator('#txnCardPanel')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('5) editar respeta los valores existentes y el próximo alta vuelve a los de siempre', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cmPage.evaluate((l) => {
    localStorage.setItem(l, 'efe');
    S.transactions = [{ id: 't1', date: '2026-11-03', name: 'Cobro en dólares', type: 'income', amount: 100, currency: 'USD', accountId: 'uala', category: '' }];
    S.cardCharges = [{ id: 'mc', cardId: 'nar', date: '2026-11-01', amount: 30000, mode: 'now1', name: 'McDonalds', category: '' }];
    renderFinanzasTab();
  }, LLAVE);
  // Movimiento común: se edita en su propio modal, con sus valores.
  await cmPage.evaluate(() => openEditTxn('t1'));
  await expect(cmPage.locator('#modal-edit-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#editTxnType')).toHaveValue('income');
  await expect(cmPage.locator('#editTxnCurrency')).toHaveValue('USD');
  await expect(cmPage.locator('#editTxnAccount')).toHaveValue('uala');
  await cmPage.evaluate(() => closeModal('modal-edit-txn'));
  // Compra con tarjeta: abre el formulario de alta en modo edición con SU medio de pago, no con el recordado.
  await cmPage.evaluate(() => openEditCardCharge('mc'));
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Editar compra');
  await expect(cmPage.locator('#txnAccount')).toHaveValue('card:nar');
  await expect(cmPage.locator('#txnName')).toHaveValue('McDonalds');
  await expect(cmPage.locator('#txnAmount')).toHaveValue('30000');
  await cmPage.evaluate(() => closeModal('modal-add-txn'));
  // Editar no cambió el medio recordado: el alta siguiente usa el de siempre.
  await abrir(cmPage);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Registrar movimiento');
  await expect(cmPage.locator('#txnType')).toHaveValue('expense');
  await expect(cmPage.locator('#txnCurrency')).toHaveValue('ARS');
  await expect(cmPage.locator('#txnAccount')).toHaveValue('efe');
  await expect(cmPage.locator('#txnName')).toHaveValue('');
  expect(consoleErrors).toEqual([]);
});
