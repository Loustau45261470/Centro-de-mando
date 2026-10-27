// Tarjetas, etapa 6: calendario de pagos a 12 meses (overlay Tarjetas > Calendario) y vencimientos de tarjeta en
// deadlines.js (card de Recordatorios, ticker y push). Los datos de ejemplo viven solo acá.
// La fecha de "hoy" de Finanzas se fija pisando getActiveDate(); deadlines.js usa la hora real del navegador.
'use strict';
const { test, expect } = require('./support/fixtures');
const CMDeadlines = require('../deadlines.js');
const { abrirTarjetas, cerrarTarjetas } = require('./support/tarjetas-ui');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 865000 };
const MP = { id: 'mp', name: 'Mercado Pago', limit: 425000, closeDay: 5, dueDay: 10, openingUsed: 357000 };
const GALICIA = { id: 'gal', name: 'Galicia', limit: 1000000, closeDay: 29, dueDay: 11, openingUsed: 0 };

// Los 4 modos de ejemplo, todos con Naranja el 15-oct-2026 (cierra el 27 → primer resumen vence el 10-nov).
const CARGOS = [
  { id: 'c-now1', cardId: 'nar', date: '2026-10-15', amount: 50000, mode: 'now1', name: 'Un pago' },
  { id: 'c-def', cardId: 'nar', date: '2026-10-15', amount: 90000, mode: 'deferred', installments: 3, consumeMonths: 5, name: 'Diferida' },
  { id: 'c-inst', cardId: 'nar', date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3, name: 'En cuotas' },
  { id: 'c-adv', cardId: 'nar', date: '2026-10-15', amount: 100000, mode: 'advance', installments: 2, toAccountId: 'efe', name: 'Adelanto' },
];

async function preparar(page, { hoy = '2026-10-15', pagarDesde = null, cards = [NARANJA], cargos = CARGOS } = {}) {
  await cerrarTarjetas(page);
  // El aviso de "revisión semanal" (domingo y lunes) tapa la barra de navegación.
  await page.evaluate(() => { const n = document.getElementById('rs-nudge'); if (n) n.remove(); });
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, pagarDesde, cards, cargos }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
    ];
    S.cards = cards.map((c) => ({ ...c, ...(pagarDesde ? { payAccountId: pagarDesde } : {}) }));
    S.transactions = []; S.cardCharges = JSON.parse(JSON.stringify(cargos)); S.cardPayments = []; S.moves = [];
    renderFinanzasTab();
  }, { hoy, pagarDesde, cards, cargos });
  await abrirTarjetas(page, 'calendario');   // el calendario vive en esa pestaña del overlay
}

const irA = (page, hoy) => page.evaluate((h) => { window.getActiveDate = () => h; renderFinanzasTab(); }, hoy);
const mes = (page, mk) => page.locator(`#cardCalendar .cc-cal-m[data-month="${mk}"]`);

test('calendario: 12 meses y total a pagar correcto por vencimiento con los 4 modos', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const cal = cmPage.locator('#cardCalendar');
  await expect(cal.locator('.cc-cal-m')).toHaveCount(12);
  const meses = await cal.locator('.cc-cal-m').evaluateAll((els) => els.map((e) => e.dataset.month));
  expect(meses[0]).toBe('2026-10');
  expect(meses[11]).toBe('2027-09');

  // Octubre: hoy es 15 y no hay vencimientos hasta el 10-nov.
  await expect(mes(cmPage, '2026-10')).toContainText('Nada para pagar');
  // 10-nov: 50.000 + 30.000 + 30.000 + 50.000 = 160.000 (una sola línea por tarjeta y día).
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-total')).toHaveText('A pagar $160.000');
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-due')).toHaveText(['10/11 · Naranja · $160.000']);
  // 10-dic: 30.000 + 30.000 + 50.000 = 110.000. 10-ene: 30.000 + 30.000 = 60.000.
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-total')).toHaveText('A pagar $110.000');
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $110.000']);
  await expect(mes(cmPage, '2027-01').locator('.cc-cal-total')).toHaveText('A pagar $60.000');
  await expect(mes(cmPage, '2027-01').locator('.cc-cal-due')).toHaveText(['10/01 · Naranja · $60.000']);
  // Después de la última cuota no queda nada.
  await expect(mes(cmPage, '2027-02')).toContainText('Nada para pagar');
  await expect(cal.locator('.cc-cal-due')).toHaveCount(3);
  // Nota: hay saldo usado sin fecha de vencimiento
  await expect(cmPage.locator('.cc-cal-note')).toHaveText("Tenés $865.000 usados sin fecha de vencimiento: cargalos en Tarjetas");
  expect(consoleErrors).toEqual([]);
});

test('calendario: varias tarjetas se listan por vencimiento y tarjeta', async ({ cmPage }) => {
  await preparar(cmPage, {
    cards: [NARANJA, MP, GALICIA],
    cargos: [
      { id: 'a', cardId: 'nar', date: '2026-10-15', amount: 50000, mode: 'now1' },
      { id: 'b', cardId: 'mp', date: '2026-10-10', amount: 20000, mode: 'now1' },
      { id: 'c', cardId: 'gal', date: '2026-10-15', amount: 30000, mode: 'now1' },
    ],
  });
  // Naranja y Mercado Pago (cierra el 5: la compra del 10-oct cae en el resumen de noviembre) vencen el 10-nov;
  // Galicia cierra el 29 y vence el 11-nov.
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-due')).toHaveText([
    '10/11 · Mercado Pago · $20.000', '10/11 · Naranja · $50.000', '11/11 · Galicia · $30.000',
  ]);
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-total')).toHaveText('A pagar $100.000');
});

test('calendario: un vencimiento con pago automático ya registrado no figura como pendiente', async ({ cmPage }) => {
  // Sin cuenta de pago el 10-nov (hoy) sigue pendiente y figura.
  await preparar(cmPage, { hoy: '2026-11-10' });
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-due')).toHaveText(['10/11 · Naranja · $160.000']);

  // Con cuenta de pago, ese día se paga solo y deja de figurar; el resto sigue.
  await preparar(cmPage, { hoy: '2026-11-10', pagarDesde: 'uala' });
  const pagos = await cmPage.evaluate(() => S.cardPayments.map((p) => p.key));
  expect(pagos).toEqual(['auto:nar:2026-11-10']);
  await expect(mes(cmPage, '2026-11')).toContainText('Nada para pagar');
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-due')).toHaveCount(0);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-total')).toHaveText('A pagar $110.000');
  // El calendario no tocó el saldo más allá del pago automático: 1.000.000 - 160.000.
  expect(await cmPage.evaluate(() => S.accounts.find((a) => a.id === 'uala').balance)).toBe(840000);
});

test('calendario: estado vacío sin compras y sin pendientes', async ({ cmPage }) => {
  await preparar(cmPage, { cargos: [] });
  await expect(cmPage.locator('#cardCalendar')).toContainText('Cuando cargues compras con tarjeta');
  await expect(cmPage.locator('#cardCalendar .cc-cal-m')).toHaveCount(0);

  // Con compras pero todo pasado/pagado en la ventana: mensaje de "nada pendiente".
  await preparar(cmPage, { hoy: '2028-01-01' });
  await expect(cmPage.locator('#cardCalendar')).toContainText('No tenés pagos pendientes en los próximos 12 meses');
});

test('gasto previsto de compras diferidas en meses futuros, sin crear gastos reales', async ({ cmPage }) => {
  await preparar(cmPage);
  // 90.000 en 5 meses = 18.000 por mes (oct a feb). Octubre es gasto real; nov a feb son previstos.
  for (const mk of ['2026-11', '2026-12', '2027-01', '2027-02']) {
    await expect(mes(cmPage, mk).locator('.cc-cal-exp')).toHaveText('Gasto previsto: $18.000');
  }
  await expect(mes(cmPage, '2026-10').locator('.cc-cal-exp')).toHaveCount(0);
  await expect(mes(cmPage, '2027-03').locator('.cc-cal-exp')).toHaveCount(0);

  // Solo existen las transacciones del mes en curso; ninguna futura, y no se tocó ningún saldo.
  const tx = await cmPage.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => t.id).sort());
  expect(tx).toEqual(['cc:c-def:2026-10', 'cc:c-inst:2026-10', 'cc:c-now1:2026-10']);
  const saldos = await cmPage.evaluate(() => S.accounts.map((a) => a.balance));
  expect(saldos).toEqual([1000000, 50000]);
  expect(await cmPage.evaluate(() => S.cardPayments.length)).toBe(0);

  // Pasan los meses: el gasto de noviembre se vuelve real y deja de ser previsto.
  await irA(cmPage, '2026-11-02');
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-exp')).toHaveCount(0);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-exp')).toHaveText('Gasto previsto: $18.000');
});

// ── deadlines.js (Node: es el mismo código que corre el cron del push) ──
const ESTADO = () => ({ cards: [NARANJA], cardCharges: CARGOS.map((c) => ({ ...c })), cardPayments: [] });
const TZ = '-03:00';
const tarjetas = (items) => items.filter((i) => i.kind === 'tarjeta');

test.describe('deadlines: vencimientos de tarjeta', () => {
  test('require en Node devuelve una entrada por tarjeta y vencimiento con título, fecha e importe', () => {
    const now = new Date('2026-11-09T12:00:00-03:00').getTime();
    const t = tarjetas(CMDeadlines.collect(ESTADO(), { now, tz: TZ }));
    expect(t.map((i) => [i.date, i.title, i.sub, i.tab, i.allDay])).toEqual([
      ['2026-11-10', 'Naranja vence', '$160.000 a pagar', 'finanzas', true],
      ['2026-12-10', 'Naranja vence', '$110.000 a pagar', 'finanzas', true],
      ['2027-01-10', 'Naranja vence', '$60.000 a pagar', 'finanzas', true],
    ]);
    expect(t[0].id).toBe('tarj_nar_2026-11-10');
    expect(t[0].kindLabel).toBe('Tarjeta');
    expect(t[0].notifBody).toContain('$160.000 a pagar');
    expect(t[0].notifBody).toContain('10/11');
  });

  test('avisa el día anterior y el mismo día a las 09:00', () => {
    const state = ESTADO();
    const opts = (iso) => ({ now: new Date(iso).getTime(), tz: TZ });
    const antes = CMDeadlines.dueAlerts(state, opts('2026-11-09T09:05:00-03:00')).filter((a) => a.item.kind === 'tarjeta');
    expect(antes.map((a) => [a.key, a.title])).toEqual([['tarj_nar_2026-11-10_d1', '💳 Mañana: Naranja vence']]);
    const hoy = CMDeadlines.dueAlerts(state, opts('2026-11-10T09:05:00-03:00')).filter((a) => a.item.kind === 'tarjeta');
    expect(hoy.map((a) => [a.key, a.title])).toEqual([['tarj_nar_2026-11-10_due', '💳 Hoy: Naranja vence']]);
    // Ya notificado: no se repite.
    const seen = { 'tarj_nar_2026-11-10_due': true };
    expect(CMDeadlines.dueAlerts(state, { ...opts('2026-11-10T09:05:00-03:00'), seen }).filter((a) => a.item.kind === 'tarjeta')).toEqual([]);
  });

  test('un vencimiento con pago automático registrado no genera entrada', () => {
    const state = ESTADO();
    state.cardPayments = [{ id: 'auto:nar:2026-11-10', key: 'auto:nar:2026-11-10', cardId: 'nar', date: '2026-11-10', amount: 160000, kind: 'auto' }];
    const now = new Date('2026-11-09T12:00:00-03:00').getTime();
    expect(tarjetas(CMDeadlines.collect(state, { now, tz: TZ })).map((i) => i.date)).toEqual(['2026-12-10', '2027-01-10']);
  });

  test('solo los próximos 12 meses y nada vencido', () => {
    const state = { cards: [NARANJA], cardCharges: [{ id: 'x', cardId: 'nar', date: '2026-10-15', amount: 24000, mode: 'nowInst', installments: 24 }] };
    const now = new Date('2026-11-11T12:00:00-03:00').getTime();   // el 10-nov ya pasó
    const t = tarjetas(CMDeadlines.collect(state, { now, tz: TZ }));
    expect(t[0].date).toBe('2026-12-10');
    expect(t[t.length - 1].date <= '2027-11-11').toBe(true);
    expect(t).toHaveLength(12);
  });

  test('sin cards / cardCharges / cardPayments no lanza y no devuelve entradas de tarjeta', () => {
    const now = new Date('2026-11-09T12:00:00-03:00').getTime();
    for (const state of [
      {}, null, undefined, { cards: [NARANJA] }, { cardCharges: CARGOS }, { cards: [], cardCharges: [] },
      { cards: [NARANJA], cardCharges: [] }, { cards: 'x', cardCharges: 'y' }, { cards: [null, {}], cardCharges: [null, {}] },
    ]) {
      let items;
      expect(() => { items = CMDeadlines.collect(state, { now, tz: TZ }); }).not.toThrow();
      expect(tarjetas(items)).toEqual([]);
    }
    // cardPayments ausente o null: todo sigue pendiente.
    for (const cardPayments of [undefined, null]) {
      const items = CMDeadlines.collect({ ...ESTADO(), cardPayments }, { now, tz: TZ });
      expect(tarjetas(items)).toHaveLength(3);
    }
    expect(() => CMDeadlines.dueAlerts({}, { now, tz: TZ })).not.toThrow();
  });
});

test('las tarjetas aparecen en la card de Recordatorios de Finanzas y no rompen sin el motor', async ({ cmPage, consoleErrors }) => {
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  // Compra de hoy (hora real del navegador): el primer vencimiento cae dentro de los próximos ~2 meses.
  const res = await cmPage.evaluate(() => {
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const hoy = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    S.cards = [{ id: 'nar', name: 'Naranja de prueba', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0 }];
    S.cardCharges = [{ id: 'r1', cardId: 'nar', date: hoy, amount: 12345, mode: 'now1' }];
    S.cardPayments = [];
    const due = CMTarjetas.installmentSchedule(S.cards[0], S.cardCharges[0])[0].dueDate;
    renderReminders('finanzas');
    const wrap = document.getElementById('reminders-wrap-finanzas');
    const items = CMDeadlines.collect(S, { now: Date.now() }).filter((i) => i.kind === 'tarjeta');

    // Resolución perezosa: si el motor no está, el bloque se omite sin lanzar.
    const motor = window.CMTarjetas;
    let sinMotor, threw = false;
    try { delete window.CMTarjetas; window.CMTarjetas = undefined; sinMotor = CMDeadlines.collect(S, { now: Date.now() }).filter((i) => i.kind === 'tarjeta').length; }
    catch (e) { threw = String(e); }
    finally { window.CMTarjetas = motor; }
    return { due, text: wrap ? wrap.textContent : '', items: items.map((i) => [i.date, i.title, i.sub]), sinMotor, threw };
  });
  expect(res.items).toEqual([[res.due, 'Naranja de prueba vence', '$12.345 a pagar']]);
  expect(res.text).toContain('Naranja de prueba vence');
  expect(res.text).toContain('Tarjeta');
  expect(res.threw).toBe(false);
  expect(res.sinMotor).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('un vencimiento de tarjeta que vence hoy sale en el ticker y su chip usa el acento de finanzas', async ({ cmPage, consoleErrors }) => {
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  const res = await cmPage.evaluate(() => {
    // deadlines.js usa la hora real: se busca una compra pasada cuyo primer resumen venza HOY, con cuotas pendientes después.
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hoy = new Date();
    const card = { id: 'nar', name: 'Naranja de prueba', limit: 1000000, closeDay: 15, dueDay: hoy.getDate(), openingUsed: 0 };
    let charge = null;
    for (let back = 0; back <= 90 && !charge; back++) {
      const d = new Date(hoy); d.setDate(d.getDate() - back);
      const c = { id: 'r1', cardId: 'nar', date: fmt(d), amount: 90000, mode: 'nowInst', installments: 3 };
      if (CMTarjetas.installmentSchedule(card, c)[0].dueDate === fmt(hoy)) charge = c;
    }
    if (!charge) return { error: 'no se encontró una compra que venza hoy' };
    S.cards = [card]; S.cardCharges = [charge]; S.cardPayments = [];
    buildTickerAlerts();
    renderReminders('finanzas');
    const wrap = document.getElementById('reminders-wrap-finanzas');
    const chip = [...wrap.querySelectorAll('.cm-kind')].find((e) => e.textContent.includes('Tarjeta'));
    return {
      hoy: fmt(hoy),
      ticker: [...document.querySelectorAll('.ticker-item')].map((e) => e.textContent),
      chipStyle: chip ? chip.getAttribute('style') : null,
    };
  });
  expect(res.error).toBeUndefined();
  expect(res.ticker.some((t) => t.includes('Naranja de prueba vence') && t.includes('$30.000 a pagar'))).toBe(true);
  expect(res.chipStyle).toContain('--k:var(--c-finanzas)');
  expect(consoleErrors).toEqual([]);
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('el calendario no genera scroll horizontal', async ({ cmPage }) => {
    await preparar(cmPage, {
      cards: [NARANJA, MP, GALICIA],
      cargos: [...CARGOS, { id: 'mp1', cardId: 'mp', date: '2026-10-10', amount: 123456789.5, mode: 'nowInst', installments: 12, name: 'Compra con un nombre bastante largo para probar el ajuste de línea' }],
    });
    await cmPage.locator('#cardCalendar').scrollIntoViewIfNeeded();
    await expect(cmPage.locator('#cardCalendar .cc-cal-m')).toHaveCount(12);
    const ovw = await cmPage.locator('#ov-tarjetas .cm-ov-body').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(ovw.sw).toBeLessThanOrEqual(ovw.cw + 1);
    const m = await cmPage.evaluate(() => ({
      sw: document.body.scrollWidth, cw: document.documentElement.clientWidth,
      csw: document.querySelector('#credit-card').scrollWidth, ccw: document.querySelector('#credit-card').clientWidth,
      calw: document.querySelector('#cardCalendar').scrollWidth, calcw: document.querySelector('#cardCalendar').clientWidth,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    expect(m.csw).toBeLessThanOrEqual(m.ccw + 1);
    expect(m.calw).toBeLessThanOrEqual(m.calcw + 1);
  });
});
