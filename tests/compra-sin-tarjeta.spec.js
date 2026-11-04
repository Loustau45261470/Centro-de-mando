// Editar compra → medio de pago "— Ninguna —" o una cuenta: la compra sale de la tarjeta (sin cuotas ni usado)
// y queda un gasto común en pesos con la fecha de la compra. Cancelar el aviso no cambia nada.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas } = require('./support/tarjetas-ui');

async function preparar(page) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(() => {
    window.getActiveDate = () => '2026-11-04';
    S.accounts = [{ id: 'uala', name: 'Ualá', type: 'bank', balance: 100000, currency: 'ARS', icon: '🏦' }];
    S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' }];
    S.cardCharges = [{ id: 'mc', cardId: 'nar', date: '2026-11-01', amount: 30000, mode: 'nowInst', installments: 3, name: 'McDonalds', category: '' }];
    S.cardPayments = []; S.cardDues = []; S.moves = []; S.transactions = [];
    document.getElementById('txnCurrency').value = 'USD';   // lo que quedó elegido de otro movimiento
    renderFinanzasTab();
  });
}
const estado = (page) => page.evaluate(() => ({
  cargos: S.cardCharges.length, usado: cardUsed(S.cards[0]), uala: S.accounts[0].balance,
  txns: S.transactions.map((t) => ({ name: t.name, amount: t.amount, currency: t.currency, date: t.date, accountId: t.accountId, card: !!t.cardChargeId, pending: !!t.pending })),
}));

test('con "Ninguna": sale de la tarjeta y queda gasto común en pesos con la fecha de la compra', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => openEditCardCharge('mc'));
  await cmPage.selectOption('#txnAccount', '');
  await expect(cmPage.locator('#txnCurrency')).toHaveValue('ARS');
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  expect(await estado(cmPage)).toEqual({
    cargos: 0, usado: 0, uala: 100000,
    txns: [{ name: 'McDonalds', amount: 30000, currency: 'ARS', date: '2026-11-01', accountId: '', card: false, pending: false }],
  });
  expect(consoleErrors).toEqual([]);
});

test('con una cuenta: sale de la tarjeta y descuenta de la cuenta', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => openEditCardCharge('mc'));
  await cmPage.selectOption('#txnAccount', 'uala');
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.click('#txnSaveBtn');
  const s = await estado(cmPage);
  expect(s.cargos).toBe(0);
  expect(s.uala).toBe(70000);
  expect(s.txns).toEqual([{ name: 'McDonalds', amount: 30000, currency: 'ARS', date: '2026-11-01', accountId: 'uala', card: false, pending: false }]);
  expect(consoleErrors).toEqual([]);
});

test('si cancelás el aviso, la compra queda en la tarjeta como estaba', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const antes = await estado(cmPage);
  await cmPage.evaluate(() => openEditCardCharge('mc'));
  await cmPage.selectOption('#txnAccount', '');
  cmPage.once('dialog', (d) => d.dismiss());
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  expect(await estado(cmPage)).toEqual(antes);
  expect(antes.cargos).toBe(1);
  expect(consoleErrors).toEqual([]);
});
