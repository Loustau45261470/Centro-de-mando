// Cada movimiento de Actividad dice de dónde salió la plata: la cuenta, la tarjeta de la compra o "Prestamos amorcito".
// Sin medio de pago, la línea queda solo con la fecha.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas } = require('./support/tarjetas-ui');

test('el origen de los fondos aparece en cuentas, tarjetas y préstamo; sin medio de pago queda vacío', async ({ cmPage, consoleErrors }) => {
  await cerrarTarjetas(cmPage);
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);
  await cmPage.evaluate(() => {
    window.getActiveDate = () => '2026-11-02';
    S.accounts = [{ id: 'uala', name: 'Ualá', type: 'bank', balance: 100000, currency: 'ARS', icon: '💵' }];
    S.cards = [{ id: 'nar', name: 'Naranja <b>X</b>', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0 }];
    S.cardCharges = [{ id: 'c1', cardId: 'nar', date: '2026-11-01', amount: 16000, mode: 'now1', installments: 1, name: 'Hamburguesa', category: '' }];
    S.cardPayments = []; S.moves = [];
    S.transactions = [
      { id: 'cc:c1:2026-11', date: '2026-11-01', name: 'Hamburguesa', type: 'expense', amount: 16000, currency: 'ARS', accountId: null, category: '', cardChargeId: 'c1' },
      { id: 't1', date: '2026-11-02', name: 'Soda', type: 'expense', amount: 2000, currency: 'ARS', accountId: 'uala', category: '' },
      { id: 't2', date: '2026-11-02', name: 'Regalo', type: 'expense', amount: 5000, currency: 'ARS', accountId: 'prestamos_amorcito', category: '' },
      { id: 't3', date: '2026-11-02', name: 'Chedar', type: 'expense', amount: 5000, currency: 'ARS', accountId: '', category: '' },
    ];
    renderFinanzasTab();
  });
  const linea = (nombre) => cmPage.locator('#activityList .activity-row', { hasText: nombre }).locator('.act-date');
  await expect(linea('Hamburguesa')).toContainText('💳 Naranja <b>X</b>');   // escapado: se ve como texto
  await expect(linea('Soda')).toContainText('💵 Ualá');
  await expect(linea('Regalo')).toContainText('💙 Prestamos amorcito');
  await expect(linea('Chedar')).not.toContainText('·');
  expect(consoleErrors).toEqual([]);
});
