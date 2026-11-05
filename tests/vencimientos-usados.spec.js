// Tarjetas: S.cardDues = cronograma base de lo ya usado (openingUsed) por mes de vencimiento (hoy lo carga cardArranque).
// Se suma a las cuotas en el calendario, en los avisos y en el pago automático. La carga a mano desde la pantalla ya no existe.
// Los datos de ejemplo viven solo acá. "Hoy" de Finanzas se fija pisando getActiveDate() (2026-10-26).
'use strict';
const { test, expect } = require('./support/fixtures');
const CMDeadlines = require('../deadlines.js');
const M = require('../tarjetas-motor.js');
const { abrirTarjetas } = require('./support/tarjetas-ui');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 865000 };
const MP = { id: 'mp', name: 'Mercado Pago', limit: 425000, closeDay: 5, dueDay: 10, openingUsed: 357000 };
const NOW1 = { id: 'now1', cardId: 'nar', date: '2026-10-15', amount: 50000, mode: 'now1', name: 'Un pago' };
const DUES3 = [
  { id: 'cd:nar:2026-11-10', cardId: 'nar', due: '2026-11-10', amount: 300000, setAt: '2026-10-01' },
  { id: 'cd:nar:2026-12-10', cardId: 'nar', due: '2026-12-10', amount: 200000, setAt: '2026-10-01' },
  { id: 'cd:nar:2027-01-10', cardId: 'nar', due: '2027-01-10', amount: 100000, setAt: '2026-10-01' },
];

async function preparar(page, { hoy = '2026-10-26', pagarDesde = null, cards = [NARANJA], cargos = [], dues = [], pagos = [], tab = 'tarjetas' } = {}) {
  // El aviso de la revisión semanal (domingo/lunes reales) tapa la barra de navegación en pantallas angostas.
  await page.evaluate(() => { const n = document.getElementById('rs-nudge'); if (n) n.remove(); });
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, pagarDesde, cards, cargos, dues, pagos }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
    ];
    S.cards = cards.map((c) => ({ ...c, ...(pagarDesde ? { payAccountId: pagarDesde } : {}) }));
    S.transactions = []; S.moves = [];
    S.cardCharges = JSON.parse(JSON.stringify(cargos));
    S.cardPayments = JSON.parse(JSON.stringify(pagos));
    S.cardDues = JSON.parse(JSON.stringify(dues));
    renderFinanzasTab();
  }, { hoy, pagarDesde, cards, cargos, dues, pagos });
  await abrirTarjetas(page, tab);
}

const dues = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.cardDues)));
const mes = (page, mk) => page.locator(`#cardCalendar .cc-cal-m[data-month="${mk}"]`);

test('calendario: el 10/11 suma la deuda cargada y las cuotas, con detalle', async ({ cmPage }) => {
  await preparar(cmPage, { cargos: [NOW1], dues: DUES3, tab: 'calendario' });
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-total')).toHaveText('A pagar $350.000');
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-due')).toHaveText(['10/11 · Naranja · $350.000']);
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-det')).toHaveText('Compras nuevas $50.000 + saldo de arranque $300.000');
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $200.000']);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-det')).toHaveText('saldo de arranque $200.000');
  await expect(mes(cmPage, '2027-01').locator('.cc-cal-total')).toHaveText('A pagar $100.000');
  await expect(mes(cmPage, '2027-02')).toContainText('Nada para pagar');
  // "A pagar el DD/MM" de la tarjeta
  await expect(cmPage.locator('#tj-pane-calendario .cc-due-card .cc-due').first()).toHaveText('A pagar el 10/11: $350.000');
});

test('calendario: solo deuda cargada (sin compras) también se calcula', async ({ cmPage }) => {
  await preparar(cmPage, { dues: DUES3, tab: 'calendario' });
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-total')).toHaveText('A pagar $300.000');
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-det')).toHaveText('saldo de arranque $300.000');
});

test('pago automático: el 10/11 paga cuotas + deuda en un solo pago, una sola vez, desde la cuenta de pago', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { hoy: '2026-11-09', pagarDesde: 'uala', cargos: [NOW1], dues: DUES3 });
  // Un día antes no se paga nada
  expect(await cmPage.evaluate(() => S.cardPayments.length)).toBe(0);
  const antes = await cmPage.evaluate(() => ({ usado: cardUsed(S.cards[0]), uala: S.accounts[0].balance }));
  expect(antes).toEqual({ usado: 915000, uala: 1000000 });

  await cmPage.evaluate(() => { window.getActiveDate = () => '2026-11-10'; renderFinanzasTab(); renderFinanzasTab(); applyCardAutoPayments(); applyCardAutoPayments(); });
  const r = await cmPage.evaluate(() => ({
    pagos: S.cardPayments.map((p) => [p.id, p.key, p.amount, p.accountId, p.kind]),
    usado: cardUsed(S.cards[0]), uala: S.accounts[0].balance,
  }));
  expect(r.pagos).toEqual([['auto:nar:2026-11-10', 'auto:nar:2026-11-10', 350000, 'uala', 'auto']]);
  expect(r.uala).toBe(650000);
  expect(r.usado).toBe(565000);   // bajó exactamente lo pagado
  // El mes siguiente solo paga lo suyo
  await cmPage.evaluate(() => { window.getActiveDate = () => '2026-12-10'; renderFinanzasTab(); renderFinanzasTab(); });
  const r2 = await cmPage.evaluate(() => ({ n: S.cardPayments.length, uala: S.accounts[0].balance }));
  expect(r2).toEqual({ n: 2, uala: 450000 });
  expect(consoleErrors).toEqual([]);
});

test('pago automático: dos dispositivos con el mismo estado no restan dos veces', async ({ cmPage }) => {
  await preparar(cmPage, { hoy: '2026-11-10', pagarDesde: 'uala', cargos: [NOW1], dues: DUES3 });
  expect(await cmPage.evaluate(() => S.accounts[0].balance)).toBe(650000);
  // Otro dispositivo ya había pagado: llega su pago (misma clave) y el saldo ya viene descontado
  const n = await cmPage.evaluate(() => { const had = S.cardPayments.length; renderFinanzasTab(); return [had, S.cardPayments.length]; });
  expect(n).toEqual([1, 1]);
  expect(await cmPage.evaluate(() => S.accounts[0].balance)).toBe(650000);
});

test('pago automático: solo deuda cargada (sin compras) también se paga', async ({ cmPage }) => {
  await preparar(cmPage, { hoy: '2026-12-10', pagarDesde: 'uala', dues: DUES3 });
  const r = await cmPage.evaluate(() => ({ pagos: S.cardPayments.map((p) => [p.key, p.amount]), uala: S.accounts[0].balance }));
  // 10/11 (ya pasado) y 10/12 se pagan al abrir: 300.000 + 200.000
  expect(r.pagos).toEqual([['auto:nar:2026-11-10', 300000], ['auto:nar:2026-12-10', 200000]]);
  expect(r.uala).toBe(500000);
});

test('pago automático: sin cuenta de pago no se paga y se avisa en la tarjeta', async ({ cmPage }) => {
  await preparar(cmPage, { hoy: '2026-11-10', cargos: [NOW1], dues: DUES3 });
  expect(await cmPage.evaluate(() => [S.cardPayments.length, S.accounts[0].balance])).toEqual([0, 1000000]);
  await abrirTarjetas(cmPage, 'tarjetas');
  await expect(cmPage.locator('#tj-pane-tarjetas .cc-warnline')).toContainText('Elegí desde qué cuenta se paga');
});

test.describe('deadlines (avisos)', () => {
  const NARANJA_ST = { cards: [NARANJA], cardCharges: [NOW1], cardDues: DUES3, cardPayments: [] };
  const now = new Date('2026-10-26T12:00:00-03:00').getTime();
  const tarjetas = (items) => items.filter((i) => i.kind === 'tarjeta').map((i) => [i.date, i.title, i.sub]);

  test('en Node: el vencimiento del 10/11 incluye la deuda cargada; sin cardDues no lanza', () => {
    expect(tarjetas(CMDeadlines.collect(NARANJA_ST, { now, tz: '-03:00' }))).toEqual([
      ['2026-11-10', 'Naranja vence', '$350.000 a pagar'],
      ['2026-12-10', 'Naranja vence', '$200.000 a pagar'],
      ['2027-01-10', 'Naranja vence', '$100.000 a pagar'],
    ]);
    // Sin la clave (estado viejo) o con basura: solo las cuotas, sin lanzar
    for (const cardDues of [undefined, null, 'x', [null, {}], []]) {
      let items;
      expect(() => { items = CMDeadlines.collect({ ...NARANJA_ST, cardDues }, { now, tz: '-03:00' }); }).not.toThrow();
      expect(tarjetas(items)).toEqual([['2026-11-10', 'Naranja vence', '$50.000 a pagar']]);
    }
    // Solo deuda cargada, sin compras
    expect(tarjetas(CMDeadlines.collect({ cards: [NARANJA], cardDues: DUES3 }, { now, tz: '-03:00' })).map((x) => x[2])).toEqual(['$300.000 a pagar', '$200.000 a pagar', '$100.000 a pagar']);
    // El que ya tiene pago registrado no figura
    const pagado = { ...NARANJA_ST, cardPayments: [{ key: 'auto:nar:2026-11-10' }] };
    expect(tarjetas(CMDeadlines.collect(pagado, { now, tz: '-03:00' })).map((x) => x[0])).toEqual(['2026-12-10', '2027-01-10']);
  });

  test('en Recordatorios y en el ticker aparece el total con la deuda cargada', async ({ cmPage, consoleErrors }) => {
    await cmPage.evaluate(() => { const n = document.getElementById('rs-nudge'); if (n) n.remove(); });
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    // deadlines.js usa la hora real: el primer vencimiento a partir de hoy lleva una deuda cargada de $123.000.
    const res = await cmPage.evaluate(() => {
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date(), hoy = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const card = { id: 'nar', name: 'Naranja de prueba', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 500000 };
      const due = CMTarjetas.upcomingDueDates(card, hoy, 1)[0];
      S.cards = [card]; S.cardCharges = []; S.cardPayments = [];
      S.cardDues = [{ id: `cd:nar:${due}`, cardId: 'nar', due, amount: 123000 }];
      buildTickerAlerts();
      renderReminders('finanzas');
      const wrap = document.getElementById('reminders-wrap-finanzas');
      return { text: wrap ? wrap.textContent : '', ticker: [...document.querySelectorAll('.ticker-item')].map((e) => e.textContent), due };
    });
    expect(res.text).toContain('Naranja de prueba vence');
    expect(res.text).toContain('$123.000 a pagar');
    // El ticker solo muestra lo cercano: si el vencimiento cae dentro de su ventana, el total coincide
    const delTicker = res.ticker.filter((t) => t.includes('Naranja de prueba vence'));
    for (const t of delTicker) expect(t).toContain('$123.000 a pagar');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('motor', () => {
  const nar = { id: 'nar', name: 'Naranja', limit: 1, closeDay: 27, dueDay: 10 };
  const cargos = [
    NOW1,
    { id: 'inst', cardId: 'nar', date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3 },
    { id: 'otra', cardId: 'mp', date: '2026-10-15', amount: 777, mode: 'now1' },
  ];
  const desde = '1900-01-01', hasta = '2999-12-31';

  test('dueTotals sin dues es idéntico al de siempre (undefined, null)', () => {
    const base = M.dueTotals(nar, cargos, desde, hasta);
    expect(base).toEqual([
      { dueDate: '2026-11-10', statementKey: '2026-10', amount: 80000 },
      { dueDate: '2026-12-10', statementKey: '2026-11', amount: 30000 },
      { dueDate: '2027-01-10', statementKey: '2026-12', amount: 30000 },
    ]);
    expect(M.dueTotals(nar, cargos, desde, hasta, undefined)).toEqual(base);
    expect(M.dueTotals(nar, cargos, desde, hasta, null)).toEqual(base);
  });

  test('dueTotals con dues suma por fecha y separa cuotas de deuda cargada', () => {
    const r = M.dueTotals(nar, cargos, desde, hasta, [...DUES3, { cardId: 'nar', due: '2026-11-10', amount: 0.5 }]);
    expect(r).toEqual([
      { dueDate: '2026-11-10', statementKey: '2026-10', amount: 380000.5, installmentsAmount: 80000, debtAmount: 300000.5 },
      { dueDate: '2026-12-10', statementKey: '2026-11', amount: 230000, installmentsAmount: 30000, debtAmount: 200000 },
      { dueDate: '2027-01-10', statementKey: '2026-12', amount: 130000, installmentsAmount: 30000, debtAmount: 100000 },
    ]);
    // Una fecha con solo deuda (sin cuotas) y el rango la recorta
    const solo = M.dueTotals(nar, [], '2027-02-01', hasta, [{ cardId: 'nar', due: '2027-02-10', amount: 5 }, ...DUES3]);
    expect(solo).toEqual([{ dueDate: '2027-02-10', statementKey: '2027-01', amount: 5, installmentsAmount: 0, debtAmount: 5 }]);
    // Otra tarjeta no suma
    expect(M.dueTotals(nar, [], desde, hasta, [{ cardId: 'mp', due: '2026-11-10', amount: 9 }])).toEqual([]);
  });

  test('entradas inválidas no lanzan, devuelven [] / ignoran la fila y nunca dan NaN', () => {
    expect(M.dueTotals(nar, [], desde, hasta, 'x')).toEqual([]);
    expect(M.dueTotals(nar, [], desde, hasta, 5)).toEqual([]);
    expect(M.dueTotals(null, [], desde, hasta, DUES3)).toEqual([]);
    expect(M.dueTotals(nar, null, desde, hasta, DUES3)).toEqual([]);
    expect(M.dueTotals(nar, [], 'mal', hasta, DUES3)).toEqual([]);
    const basura = [null, undefined, 3, 'x', {}, [],
      { cardId: 'nar', due: '2026-13-40', amount: 1 }, { cardId: 'nar', due: '2026-11-10', amount: NaN },
      { cardId: 'nar', due: '2026-11-10', amount: Infinity }, { cardId: 'nar', due: '2026-11-10', amount: '5' },
      { cardId: 'nar', due: '2026-11-10', amount: -5 }, { cardId: 'nar', due: '2026-11-10', amount: 0 },
      { cardId: 'nar', due: '2026-11-10', amount: 1e300 }, { cardId: 'nar', due: 20261110, amount: 1 }];
    let r;
    expect(() => { r = M.dueTotals(nar, [], desde, hasta, basura); }).not.toThrow();
    expect(r).toEqual([]);
    expect(M.dueTotals(nar, [], desde, hasta, [...basura, DUES3[0]]).map((x) => x.amount)).toEqual([300000]);
    expect(M.upcomingDueDates(null, '2026-10-26', 12)).toEqual([]);
    expect(M.upcomingDueDates(nar, 'mal', 12)).toEqual([]);
    expect(M.upcomingDueDates(nar, '2026-10-26', 0)).toEqual([]);
    expect(M.validateDue(nar, null).ok).toBe(false);
  });

  test('upcomingDueDates: desde hoy inclusive, clamp al último día del mes', () => {
    expect(M.upcomingDueDates(nar, '2026-11-10', 2)).toEqual(['2026-11-10', '2026-12-10']);
    expect(M.upcomingDueDates(nar, '2026-11-11', 2)).toEqual(['2026-12-10', '2027-01-10']);
    const fin = { ...nar, dueDay: 31 };
    expect(M.upcomingDueDates(fin, '2027-01-15', 3)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(M.upcomingDueDates(fin, '2028-02-01', 1)).toEqual(['2028-02-29']);
  });

  test('validateDue: fecha = día de vencimiento de la tarjeta, monto > 0 con 2 decimales', () => {
    const ok = (d) => M.validateDue(nar, { cardId: 'nar', ...d });
    expect(ok({ due: '2026-11-10', amount: 100.25 }).ok).toBe(true);
    expect(ok({ due: '2026-11-11', amount: 100 }).error).toContain('día de vencimiento');
    expect(ok({ due: '2026-11-10', amount: 100.255 }).error).toContain('2 decimales');
    expect(ok({ due: '2026-11-10', amount: 0 }).ok).toBe(false);
    expect(M.validateDue(nar, { cardId: 'mp', due: '2026-11-10', amount: 1 }).ok).toBe(false);
    expect(M.validateDue({ ...nar, dueDay: 31 }, { cardId: 'nar', due: '2027-02-28', amount: 1 }).ok).toBe(true);
  });
});

test('borrar una tarjeta borra también sus vencimientos y avisa en la confirmación', async ({ cmPage }) => {
  await preparar(cmPage, { cards: [NARANJA, MP], dues: [...DUES3, { id: 'cd:mp:2026-11-10', cardId: 'mp', due: '2026-11-10', amount: 1000 }] });
  let msg = '';
  cmPage.once('dialog', (d) => { msg = d.message(); d.accept(); });
  await cmPage.locator('#tj-pane-tarjetas .cc-row[data-card-id="nar"] button[aria-label="Eliminar tarjeta"]').click();
  expect(msg).toContain('Naranja');
  expect(msg).toContain('3 vencimientos');
  const r = await cmPage.evaluate(() => ({ cards: S.cards.map((c) => c.id), dues: S.cardDues.map((d) => d.cardId) }));
  expect(r).toEqual({ cards: ['mp'], dues: ['mp'] });
});

// Monto cargado a mano (p. ej. el total del resumen del banco): las compras ya cargadas hasta ese día van incluidas,
// solo se suman las posteriores. Los vencimientos viejos sin setAt suman todas las compras, como antes.
test('monto cargado a mano: no suma las compras ya cargadas, solo las nuevas', async ({ cmPage, consoleErrors }) => {
  const RIVER = { id: 'riv', cardId: 'nar', date: '2026-11-03', amount: 72000, mode: 'nowInst', installments: 12, name: 'Camiseta' };
  await preparar(cmPage, { hoy: '2026-11-04', cargos: [RIVER], dues: [{ id: 'cd:nar:2026-12-10', cardId: 'nar', due: '2026-12-10', amount: 308000, setAt: '2026-11-04' }], tab: 'calendario' });
  // Cargado el 04/11: la camiseta (del 03/11) ya está incluida en los 308.000
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $308.000']);
  // Enero no tiene monto a mano: la cuota de la camiseta se suma como siempre
  await expect(mes(cmPage, '2027-01').locator('.cc-cal-due')).toHaveText(['10/01 · Naranja · $6.000']);
  // Compra nueva del 05/11: se suma encima de lo cargado
  await cmPage.evaluate(() => {
    window.getActiveDate = () => '2026-11-05';
    S.cardCharges.push({ id: 'n', cardId: 'nar', date: '2026-11-05', amount: 10000, mode: 'now1', name: 'Nueva' });
    renderFinanzasTab();
  });
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $318.000']);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-det')).toHaveText('Compras nuevas $10.000 + saldo de arranque $308.000');
  expect(consoleErrors).toEqual([]);
});

// Vencimiento sin fecha de carga (de antes de setAt): no se le inventa una, y las compras se suman todas.
test('vencimiento sin fecha de carga: no se le pone fecha y suma todas las compras', async ({ cmPage, consoleErrors }) => {
  const COMPRA = { id: 'c1', cardId: 'nar', date: '2026-11-03', amount: 50000, mode: 'now1', name: 'Regalo' };
  await preparar(cmPage, { hoy: '2026-11-04', cargos: [COMPRA], dues: [{ id: 'cd:nar:2026-12-10', cardId: 'nar', due: '2026-12-10', amount: 30000 }], tab: 'calendario' });
  expect(await dues(cmPage)).toEqual([{ id: 'cd:nar:2026-12-10', cardId: 'nar', due: '2026-12-10', amount: 30000 }]);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $80.000']);
  expect(consoleErrors).toEqual([]);
});

// Reparación única: a los vencimientos de Mercado Pago que quedaron con setAt 04/11 por la versión anterior se les saca.
test('reparación: Mercado Pago vuelve a sumar sus compras; Naranja queda como está', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { hoy: '2026-11-04', cargos: [], dues: [], tab: 'calendario' });
  const r = await cmPage.evaluate(() => {
    delete S.ccSetAtRepair1;
    S.cardDues = [
      { id: 'cd:mvhrtbmwqffs:2026-11-10', cardId: 'mvhrtbmwqffs', due: '2026-11-10', amount: 267000, setAt: '2026-11-04' },
      { id: 'cd:nar:2026-12-10', cardId: 'nar', due: '2026-12-10', amount: 240000, setAt: '2026-11-04' },
    ];
    cardsCatchUp();
    const primera = S.cardDues.map((d) => d.setAt || null);
    S.cardDues[0].setAt = '2026-11-04';   // si después lo cargás a mano hoy, la reparación no vuelve a correr
    cardsCatchUp();
    return { primera, segunda: S.cardDues.map((d) => d.setAt || null), flag: S.ccSetAtRepair1 };
  });
  expect(r).toEqual({ primera: [null, '2026-11-04'], segunda: ['2026-11-04', '2026-11-04'], flag: true });
  expect(consoleErrors).toEqual([]);
});
