// Adelantar el pago de un resumen ("Registrar pago de resumen" antes del vencimiento) descuenta ese vencimiento
// en todos lados: "A pagar el", calendario, recordatorios y el pago automático del día (que no cobra dos veces).
// También: filtro por tarjeta en el overlay de Tarjetas y en el historial de movimientos.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas } = require('./support/tarjetas-ui');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' };
const MP = { id: 'mp', name: 'Mercado Pago', limit: 1000000, closeDay: 5, dueDay: 10, openingUsed: 0, payAccountId: 'uala' };

async function preparar(page, pagos) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ NARANJA, MP, pagos }) => {
    window.getActiveDate = () => '2026-11-03';
    S.accounts = [{ id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' }];
    S.cards = [{ ...NARANJA }, { ...MP }];
    // Naranja: 100.000 vence el 10/11 y 60.000 el 10/12. Mercado Pago: 30.000 el 10/11.
    S.cardCharges = [
      { id: 'c1', cardId: 'nar', date: '2026-10-20', amount: 100000, mode: 'now1', installments: 1, name: 'Zapatillas', category: '' },
      { id: 'c2', cardId: 'nar', date: '2026-11-01', amount: 60000, mode: 'now1', installments: 1, name: 'Cena', category: '' },
      { id: 'c3', cardId: 'mp', date: '2026-10-20', amount: 30000, mode: 'now1', installments: 1, name: 'Libro', category: '' },
    ];
    S.cardDues = []; S.moves = []; S.transactions = [];
    S.cardPayments = pagos.map((p, i) => ({ id: 'm' + i, key: 'manual:m' + i, kind: 'manual', accountId: 'uala', ...p }));
    renderFinanzasTab();
  }, { NARANJA, MP, pagos });
}
const vence = (page, name) => page.locator('#tj-pane-calendario .cc-due-card', { hasText: name });
const recordatorios = (page) => page.evaluate(() => CMDeadlines.collect(S, { now: new Date('2026-11-03T12:00:00-03:00').getTime(), tz: '-03:00' })
  .filter((x) => x.kind === 'tarjeta').map((x) => `${x.title} ${x.date} ${x.sub}`));

test('adelanto completo: el vencimiento desaparece y el día del vencimiento no se cobra de nuevo', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, [{ cardId: 'nar', date: '2026-11-02', amount: 100000 }]);
  await expect(vence(cmPage, 'Naranja')).not.toContainText('10/11');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/12: $60.000');
  await expect(cmPage.locator('#cardCalendar .cc-cal-m[data-month="2026-11"]')).not.toContainText('Naranja');
  const r = await recordatorios(cmPage);
  expect(r.some((x) => x.includes('Naranja') && x.includes('2026-11-10'))).toBe(false);
  expect(r.some((x) => x.includes('Mercado Pago') && x.includes('2026-11-10'))).toBe(true);
  // Llega el 10/11: Naranja no se vuelve a cobrar; Mercado Pago sí (30.000).
  await cmPage.evaluate(() => { window.getActiveDate = () => '2026-11-10'; renderFinanzasTab(); });
  const s = await cmPage.evaluate(() => ({ uala: S.accounts[0].balance, auto: S.cardPayments.filter((p) => p.kind === 'auto').map((p) => [p.cardId, p.amount]) }));
  expect(s.auto).toEqual([['mp', 30000]]);
  expect(s.uala).toBe(970000);   // el adelanto ya se había descontado al cargarlo (acá vino armado en el estado)
  expect(consoleErrors).toEqual([]);
});

test('adelanto parcial: queda lo que falta, avisa lo adelantado y el automático cobra solo el resto', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, [{ cardId: 'nar', date: '2026-11-01', amount: 40000 }]);
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/11: $60.000');
  await expect(vence(cmPage, 'Naranja')).toContainText('ya adelantaste $40.000');
  const r = await recordatorios(cmPage);
  expect(r.find((x) => x.includes('Naranja') && x.includes('2026-11-10'))).toContain('60.000');
  await cmPage.evaluate(() => { window.getActiveDate = () => '2026-11-10'; renderFinanzasTab(); });
  expect(await cmPage.evaluate(() => S.cardPayments.filter((p) => p.kind === 'auto' && p.cardId === 'nar').map((p) => p.amount))).toEqual([60000]);
  // Ya pagado el 10/11: el siguiente sigue entero.
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/12: $60.000');
  expect(consoleErrors).toEqual([]);
});

test('lo que sobra del adelanto pasa al vencimiento siguiente', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, [{ cardId: 'nar', date: '2026-11-02', amount: 130000 }]);
  await expect(vence(cmPage, 'Naranja')).not.toContainText('10/11');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/12: $30.000');
  expect(consoleErrors).toEqual([]);
});

test('filtro por tarjeta: compras y calendario del overlay, y el historial de movimientos', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, []);
  await cmPage.evaluate(() => { S.transactions = []; materializeCardExpenses(); renderFinanzasTab(); });
  await cmPage.evaluate(() => setCcCardFilter('mp'));
  await expect(cmPage.locator('#cardChargeList .cc-chg')).toHaveCount(1);
  await expect(cmPage.locator('#cardChargeList')).toContainText('Libro');
  await expect(cmPage.locator('#tj-pane-calendario .cc-due-card')).toHaveCount(1);
  await expect(cmPage.locator('#tj-pane-calendario .cc-due-card')).toContainText('Mercado Pago');
  await expect(cmPage.locator('#cardCalendar')).not.toContainText('Naranja');
  await cmPage.evaluate(() => setCcCardFilter(''));
  await expect(cmPage.locator('#cardChargeList .cc-chg')).toHaveCount(3);

  await cmPage.evaluate(() => { txnActiveMonth = '2026-11'; openHistorialOverlay(); });
  await expect(cmPage.locator('#txnHistCardSel')).toBeVisible();
  await cmPage.selectOption('#txnHistCardSel', 'nar');
  await expect(cmPage.locator('#activityList .activity-row')).toHaveCount(1);
  await expect(cmPage.locator('#activityList')).toContainText('Cena');
  await cmPage.selectOption('#txnHistCardSel', '');
  await expect(cmPage.locator('#activityList .activity-row')).toHaveCount(1);   // noviembre: solo Cena es de este mes
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
  await cmPage.selectOption('#txnHistCardSel', 'mp');
  await expect(cmPage.locator('#activityList .activity-row')).toHaveCount(1);
  await expect(cmPage.locator('#activityList')).toContainText('Libro');
  expect(consoleErrors).toEqual([]);
});
