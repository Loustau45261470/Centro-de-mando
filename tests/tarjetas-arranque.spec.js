// Tarjetas: "arranque" (cardArranque). Foto de hoy de una tarjeta: el usado y un cronograma por vencimiento (S.cardDues).
// Desde ahí todo se calcula con lo que se registra después; lo anterior queda de historial y no suma.
// Los datos de ejemplo viven solo acá. "Hoy" de Finanzas se fija pisando getActiveDate() (2026-11-05).
'use strict';
const { test, expect } = require('./support/fixtures');
const CMDeadlines = require('../deadlines.js');
const M = require('../tarjetas-motor.js');
const { abrirTarjetas } = require('./support/tarjetas-ui');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 865000 };
const MP = { id: 'mp', name: 'Mercado Pago', limit: 425000, closeDay: 5, dueDay: 10, openingUsed: 357000 };
const MESES = { '2026-11-10': 250000, '2026-12-10': 300000, '2027-01-10': 150000 };
const HOY = '2026-11-05';

// Estado de antes del arranque: compras y pagos viejos (con ids de 10 y 20 días atrás) que NO tienen que sumar después.
// Los ids con forma de uid() llevan el momento de registro; así se distingue lo anterior de lo posterior al arranque.
async function preparar(page, { hoy = HOY, cards = [NARANJA], pagarDesde = null, tab = 'calendario' } = {}) {
  await page.evaluate(() => { const n = document.getElementById('rs-nudge'); if (n) n.remove(); });
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, cards, pagarDesde }) => {
    window.getActiveDate = () => hoy;
    const viejo = (dias) => (Date.now() - dias * 864e5).toString(36) + 'abcd';
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
    ];
    S.cards = cards.map((c) => ({ ...c, ...(pagarDesde ? { payAccountId: pagarDesde } : {}) }));
    S.transactions = []; S.moves = []; S.cardDues = [];
    S.cardCharges = [
      { id: viejo(10), cardId: 'nar', date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3, name: 'Vieja en cuotas' },
      { id: viejo(20), cardId: 'nar', date: '2026-10-01', amount: 40000, mode: 'now1', name: 'Vieja de un pago' },
      { id: viejo(10), cardId: 'mp', date: '2026-10-15', amount: 20000, mode: 'now1', name: 'MP vieja' },
    ];
    S.cardPayments = [
      { id: viejo(15), key: 'manual:x', cardId: 'nar', date: '2026-10-20', amount: 10000, accountId: 'uala', kind: 'manual' },
      { id: 'auto:nar:2026-10-10', key: 'auto:nar:2026-10-10', cardId: 'nar', date: '2026-10-10', amount: 70000, accountId: 'uala', kind: 'auto' },
    ];
    renderFinanzasTab();
  }, { hoy, cards, pagarDesde });
  await abrirTarjetas(page, tab);
}

const arrancar = (page, ref = 'nar', usado = 700000, meses = MESES) =>
  page.evaluate(({ ref, usado, meses }) => cardArranque(ref, { usado, meses }), { ref, usado, meses });
// Registra algo "después" del arranque: pasa un instante para que el id nuevo sea posterior al momento del arranque.
const despues = async (page, fn, arg) => { await page.waitForTimeout(30); return page.evaluate(fn, arg); };
const usado = (page, id = 'nar') => page.evaluate((i) => cardUsed(S.cards.find((c) => c.id === i)), id);
const estado = (page) => page.evaluate(() => JSON.parse(JSON.stringify({ cards: S.cards, dues: S.cardDues, ch: S.cardCharges, pay: S.cardPayments })));
const mes = (page, mk) => page.locator(`#cardCalendar .cc-cal-m[data-month="${mk}"]`);

test('1) cardArranque valida y, si algo está mal, devuelve el error y no cambia nada', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const antes = await estado(cmPage);
  const casos = [
    [['nada', { usado: 1, meses: {} }], /No existe la tarjeta/],
    [['', { usado: 1, meses: {} }], /Falta la tarjeta/],
    [['nar', null], /Falta/],
    [['nar', { usado: -1, meses: {} }], /usado/],
    [['nar', { usado: '5', meses: {} }], /usado/],
    [['nar', { usado: 10.005, meses: {} }], /2 decimales/],
    [['nar', { usado: 10, meses: [] }], /meses/],
    [['nar', { usado: 10, meses: { '2026-11-11': 100 } }], /día de vencimiento/],       // no es el día 10
    [['nar', { usado: 10, meses: { '2026-11-10': 0 } }], /mayor a 0/],
    [['nar', { usado: 10, meses: { '2026-11-10': -5 } }], /mayor a 0/],
    [['nar', { usado: 10, meses: { '2026-11-10': 100.005 } }], /2 decimales/],
    [['nar', { usado: 10, meses: { '2026-11-10': 'x' } }], /mayor a 0/],
    [['nar', { usado: 10, meses: { '2026-10-10': 100 } }], /ya pasó/],                   // vencimiento pasado
    [['nar', { usado: 10, meses: { '2026-11-10': 100, '2026-12-11': 100 } }], /día de vencimiento/],   // uno bueno y uno malo: no guarda ninguno
  ];
  for (const [args, re] of casos) {
    const r = await cmPage.evaluate((a) => cardArranque(...a), args);
    expect(r && r.error, JSON.stringify(args)).toMatch(re);
  }
  expect(await estado(cmPage)).toEqual(antes);   // ni la tarjeta, ni los vencimientos, ni compras, ni pagos
  expect(consoleErrors).toEqual([]);
});

test('2) tras el arranque, Usado = el usado dado aunque haya compras y pagos anteriores; el historial queda intacto', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const antes = await estado(cmPage);
  // Antes del arranque: 865.000 + 90.000 + 40.000 - 10.000 - 70.000 = 915.000
  expect(await usado(cmPage)).toBe(915000);
  const r = await arrancar(cmPage);
  expect(r).toEqual({ tarjeta: 'Naranja', usado: 700000, meses: MESES });
  expect(await usado(cmPage)).toBe(700000);
  const d = await estado(cmPage);
  expect(d.cards[0]).toMatchObject({ id: 'nar', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 700000 });
  expect(typeof d.cards[0].resetAt).toBe('number');
  expect(d.dues.map((x) => [x.id, x.cardId, x.due, x.amount, x.setAt, x.setAtTs === d.cards[0].resetAt]))
    .toEqual(Object.entries(MESES).map(([due, amount]) => [`cd:nar:${due}`, 'nar', due, amount, HOY, true]));
  expect(d.ch).toEqual(antes.ch);    // compras y pagos no se tocan
  expect(d.pay).toEqual(antes.pay);
  // Disponible = límite - usado
  expect(await cmPage.evaluate(() => cardAvailable(S.cards[0]))).toBe(300000);
  // El gasto/presupuesto de las compras viejas sigue (materializeCardExpenses intacto)
  await cmPage.evaluate(() => { cardsCatchUp(); });
  expect(await cmPage.evaluate(() => S.transactions.filter((t) => t.cardChargeId).length)).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});

test('2b) es idempotente: volver a correrlo reemplaza el arranque y los vencimientos anteriores de esa tarjeta, no los de otras', async ({ cmPage }) => {
  await preparar(cmPage, { cards: [NARANJA, MP] });
  await arrancar(cmPage, 'mp', 100000, { '2026-11-10': 5000 });
  await arrancar(cmPage, 'Naranja', 700000, MESES);
  const r = await arrancar(cmPage, 'naranja', 650000, { '2026-12-10': 400000 });   // por nombre, sin importar mayúsculas
  expect(r).toEqual({ tarjeta: 'Naranja', usado: 650000, meses: { '2026-12-10': 400000 } });
  const d = await estado(cmPage);
  expect(d.dues.filter((x) => x.cardId === 'nar').map((x) => [x.due, x.amount])).toEqual([['2026-12-10', 400000]]);
  expect(d.dues.filter((x) => x.cardId === 'mp').map((x) => [x.due, x.amount])).toEqual([['2026-11-10', 5000]]);
  expect(await usado(cmPage, 'nar')).toBe(650000);
  expect(await usado(cmPage, 'mp')).toBe(100000);
});

test('3) una compra nueva posterior (aunque con fecha anterior) suma al Usado y a los meses justos; las anteriores no', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await arrancar(cmPage);
  // Compra de 30.000 en 3 cuotas, registrada ahora pero con fecha 03/11 (cae en el resumen que cierra el 27/11 y vence el 10/12)
  await despues(cmPage, () => {
    S.cardCharges.push({ id: uid(), cardId: 'nar', date: '2026-11-03', amount: 30000, mode: 'nowInst', installments: 3, name: 'Nueva' });
    renderFinanzasTab();
  });
  expect(await usado(cmPage)).toBe(730000);
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-due')).toHaveText(['10/11 · Naranja · $250.000']);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $310.000']);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-det')).toHaveText('Compras nuevas $10.000 + saldo de arranque $300.000');
  await expect(mes(cmPage, '2027-01').locator('.cc-cal-due')).toHaveText(['10/01 · Naranja · $160.000']);
  await expect(mes(cmPage, '2027-02').locator('.cc-cal-due')).toHaveText(['10/02 · Naranja · $10.000']);
  await expect(mes(cmPage, '2027-03')).toContainText('Nada para pagar');
  // La compra vieja en cuotas (15/10) no puso nada en 10/11 ni en los meses siguientes
  const m = await cmPage.evaluate(() => CMTarjetas.dueTotals(S.cards[0], S.cardCharges, '1900-01-01', '2999-12-31', S.cardDues).map((x) => [x.dueDate, x.amount]));
  expect(m).toEqual([['2026-11-10', 250000], ['2026-12-10', 310000], ['2027-01-10', 160000], ['2027-02-10', 10000]]);
  expect(consoleErrors).toEqual([]);
});

test('3b) un id que no se puede leer cuenta por la fecha del cargo: hasta el día del arranque es historial, después suma', async ({ cmPage }) => {
  await preparar(cmPage);
  await arrancar(cmPage);
  await cmPage.evaluate(() => {
    S.cardCharges.push({ id: 'sin-id-1', cardId: 'nar', date: '2026-11-05', amount: 1000, mode: 'now1' });   // el día del arranque: historial
    S.cardCharges.push({ id: 'sin-id-2', cardId: 'nar', date: '2026-11-06', amount: 2000, mode: 'now1' });   // después: suma
    S.cardPayments.push({ id: 'pago-x', key: 'manual:pago-x', cardId: 'nar', date: '2026-11-05', amount: 300, kind: 'manual' });   // historial
    S.cardPayments.push({ id: 'pago-y', key: 'manual:pago-y', cardId: 'nar', date: '2026-11-07', amount: 500, kind: 'manual' });   // suma
  });
  expect(await usado(cmPage)).toBe(700000 + 2000 - 500);
});

test('4) un pago manual posterior baja el Usado y se descuenta del vencimiento de su ciclo', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await arrancar(cmPage);
  await despues(cmPage, () => {
    S.cardPayments.push({ id: uid(), key: 'manual:p', cardId: 'nar', date: '2026-11-05', amount: 100000, accountId: 'uala', kind: 'manual' });
    renderFinanzasTab();
  });
  expect(await usado(cmPage)).toBe(600000);
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-due')).toHaveText(['10/11 · Naranja · $150.000']);   // 250.000 - 100.000
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-det')).toHaveText('Ya adelantaste $100.000');
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $300.000']);   // lo que sobra no pasa a otro mes
  expect(consoleErrors).toEqual([]);
});

test('5) pago automático: el vencimiento del arranque se paga una sola vez y no arrastra lo anterior', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { pagarDesde: 'uala' });
  await arrancar(cmPage);
  expect(await cmPage.evaluate(() => S.cardPayments.length)).toBe(2);   // al arrancar no se paga nada: 10/11 todavía no llegó
  await cmPage.evaluate(() => { window.getActiveDate = () => '2026-11-10'; renderFinanzasTab(); renderFinanzasTab(); applyCardAutoPayments(); applyCardAutoPayments(); });
  const r = await cmPage.evaluate(() => ({
    nuevos: S.cardPayments.filter((p) => p.date === '2026-11-10').map((p) => [p.key, p.amount, p.accountId, p.kind]),
    todos: S.cardPayments.length, uala: S.accounts[0].balance,
  }));
  expect(r.nuevos).toEqual([['auto:nar:2026-11-10', 250000, 'uala', 'auto']]);   // solo el cronograma del arranque, sin las cuotas viejas
  expect(r.todos).toBe(3);
  expect(r.uala).toBe(750000);
  expect(await usado(cmPage)).toBe(450000);   // 700.000 - 250.000; el auto viejo del 10/10 no vuelve a restar
  // Otro dispositivo con el mismo estado no vuelve a pagar
  await cmPage.evaluate(() => { renderFinanzasTab(); });
  expect(await cmPage.evaluate(() => [S.cardPayments.length, S.accounts[0].balance])).toEqual([3, 750000]);
  expect(consoleErrors).toEqual([]);
});

test('6) una tarjeta sin arranque se calcula igual que antes (todo suma)', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { cards: [NARANJA, MP] });
  await arrancar(cmPage, 'nar');   // Naranja arranca; Mercado Pago no
  expect(await usado(cmPage, 'mp')).toBe(357000 + 20000);
  const mp = await cmPage.evaluate(() => {
    const c = S.cards.find((x) => x.id === 'mp');
    return { reset: CMTarjetas.hasReset(c), dues: CMTarjetas.dueTotals(c, S.cardCharges, '1900-01-01', '2999-12-31', S.cardDues).map((x) => [x.dueDate, x.amount]) };
  });
  expect(mp).toEqual({ reset: false, dues: [['2026-11-10', 20000]] });
  expect(consoleErrors).toEqual([]);
});

test('7) la carga manual de "Vencimientos de lo ya usado" ya no existe', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { tab: 'tarjetas' });
  await expect(cmPage.locator('#tj-pane-tarjetas .cc-row[data-card-id="nar"]')).toBeVisible();
  await expect(cmPage.locator('#tj-pane-tarjetas details.cc-dues')).toHaveCount(0);
  await expect(cmPage.locator('#tj-pane-tarjetas')).not.toContainText('Vencimientos de lo ya usado');
  await expect(cmPage.locator('#tj-pane-tarjetas')).not.toContainText('Cargaste');
  const fns = await cmPage.evaluate(() => ['saveCardDue', 'editCardDue', 'deleteCardDue', '_ccDuesSecHtml', '_ccDueControl', '_ccCalNote'].map((f) => typeof window[f]));
  expect(fns).toEqual(Array(6).fill('undefined'));
  // Con saldo usado sin cronograma ya no sale el aviso "cargalos en Tarjetas"
  await abrirTarjetas(cmPage, 'calendario');
  await expect(cmPage.locator('.cc-cal-note')).toHaveCount(0);
  await expect(cmPage.locator('#tj-pane-calendario')).not.toContainText('cargalos en Tarjetas');
  expect(consoleErrors).toEqual([]);
});

test.describe('deadlines (avisos, en Node)', () => {
  const now = new Date('2026-11-05T12:00:00-03:00').getTime();
  const viejo = (dias) => (now - dias * 864e5).toString(36) + 'abcd';
  const nuevo = (min) => (now + min * 6e4).toString(36) + 'abcd';
  const tarjetas = (st) => CMDeadlines.collect(st, { now, tz: '-03:00' }).filter((i) => i.kind === 'tarjeta').map((i) => [i.date, i.sub]);
  const card = { ...NARANJA, openingUsed: 700000, resetAt: now - 5 * 6e4, resetDay: HOY };
  const dues = Object.entries(MESES).map(([due, amount]) => ({ id: `cd:nar:${due}`, cardId: 'nar', due, amount, setAt: HOY, setAtTs: card.resetAt }));

  test('solo cuentan el cronograma del arranque y lo registrado después', () => {
    const st = {
      cards: [card], cardDues: dues,
      cardCharges: [
        { id: viejo(10), cardId: 'nar', date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3 },        // historial
        { id: nuevo(10), cardId: 'nar', date: '2026-11-03', amount: 30000, mode: 'nowInst', installments: 3 },        // suma, 10.000 por mes desde 10/12
      ],
      cardPayments: [{ id: viejo(1), key: 'manual:a', cardId: 'nar', date: '2026-10-30', amount: 99999, kind: 'manual' }],   // historial: no descuenta
    };
    expect(tarjetas(st)).toEqual([
      ['2026-11-10', '$250.000 a pagar'], ['2026-12-10', '$310.000 a pagar'], ['2027-01-10', '$160.000 a pagar'], ['2027-02-10', '$10.000 a pagar'],
    ]);
    // Un pago manual posterior se descuenta del vencimiento de su ciclo
    const conPago = { ...st, cardPayments: [...st.cardPayments, { id: nuevo(20), key: 'manual:b', cardId: 'nar', date: '2026-11-05', amount: 100000, kind: 'manual' }] };
    expect(tarjetas(conPago)[0]).toEqual(['2026-11-10', '$150.000 a pagar']);
    // Sin arranque, la misma tarjeta suma todo como antes
    const sin = { ...st, cards: [{ ...card, resetAt: undefined, resetDay: undefined }], cardDues: [], cardPayments: [] };
    expect(tarjetas(sin).map((x) => x[0])).toEqual(['2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10']);
  });
});

test.describe('motor', () => {
  const nar = { id: 'nar', name: 'Naranja', limit: 1, closeDay: 27, dueDay: 10 };
  test('idTs lee el momento de registro de un uid() y rechaza lo que no lo es', () => {
    const ms = Date.UTC(2026, 10, 4, 15, 0, 0);
    expect(M.idTs(ms.toString(36) + 'k3j9')).toBe(ms);
    for (const raro of ['auto:nar:2026-11-10', 'now1', 'c1', '', null, undefined, 12345678, '00000000abcd']) expect(M.idTs(raro)).toBe(null);
  });
  test('sin resetAt todo cuenta; con resetAt, hasReset y resetDayOf', () => {
    expect(M.hasReset(nar)).toBe(false);
    expect(M.chargeCounts(nar, { id: 'x', date: '2000-01-01' })).toBe(true);
    expect(M.paymentCounts(nar, { id: 'x', key: 'auto:nar:2000-01-01', date: '2000-01-01' })).toBe(true);
    expect(M.hasReset({ ...nar, resetAt: 'x' })).toBe(false);
    expect(M.resetDayOf({ ...nar, resetAt: 1, resetDay: '2026-11-05' })).toBe('2026-11-05');
  });
  test('used: openingUsed + cargos posteriores - pagos posteriores', () => {
    const t0 = Date.UTC(2026, 10, 5, 12), id = (ms) => ms.toString(36) + 'abcd';
    const c = { ...nar, openingUsed: 1000, resetAt: t0, resetDay: '2026-11-05' };
    const ch = [{ id: id(t0 - 1000), cardId: 'nar', amount: 500 }, { id: id(t0 + 1000), cardId: 'nar', amount: 200 }, { id: id(t0 + 1000), cardId: 'otra', amount: 9 }];
    const pay = [{ id: id(t0 - 1000), key: 'manual:1', cardId: 'nar', amount: 50 }, { id: id(t0 + 2000), key: 'manual:2', cardId: 'nar', amount: 30 },
      { id: 'auto:nar:2026-11-04', key: 'auto:nar:2026-11-04', cardId: 'nar', date: '2026-11-04', amount: 7 },
      { id: 'auto:nar:2026-11-10', key: 'auto:nar:2026-11-10', cardId: 'nar', date: '2026-11-10', amount: 11 }];
    expect(M.used(c, ch, pay)).toBe(1000 + 200 - 30 - 11);
    expect(M.used({ ...c, resetAt: undefined }, ch, pay)).toBe(1000 + 500 + 200 - 50 - 30 - 7 - 11);
    expect(M.used(c, null, undefined)).toBe(1000);
  });
});
