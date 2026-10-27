// Tarjetas: "Vencimientos de lo ya usado" (S.cardDues). Lo que ya se usaba antes de empezar (openingUsed) se reparte
// por mes de vencimiento; se suma a las cuotas en el calendario, en los avisos y en el pago automático.
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
  { id: 'cd:nar:2026-11-10', cardId: 'nar', due: '2026-11-10', amount: 300000 },
  { id: 'cd:nar:2026-12-10', cardId: 'nar', due: '2026-12-10', amount: 200000 },
  { id: 'cd:nar:2027-01-10', cardId: 'nar', due: '2027-01-10', amount: 100000 },
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

const seccion = (page, id = 'nar') => page.locator(`#tj-pane-tarjetas details.cc-dues[data-dues-card="${id}"]`);
async function abrirSeccion(page, id = 'nar') {
  const sec = seccion(page, id);
  if (!(await sec.evaluate((e) => e.open))) await sec.locator('summary').click();
  await expect(sec.locator('.cc-due-form')).toBeVisible();
}
async function cargar(page, due, monto, id = 'nar') {
  await abrirSeccion(page, id);
  await page.selectOption(`#ccDueSel-${id}`, due);
  await page.fill(`#ccDueAmt-${id}`, String(monto));
  await page.click(`#tj-pane-tarjetas details.cc-dues[data-dues-card="${id}"] .btn-primary`);
}
const dues = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.cardDues)));
const mes = (page, mk) => page.locator(`#cardCalendar .cc-cal-m[data-month="${mk}"]`);

test('alta: tres vencimientos de Naranja y el control dice cuánto falta asignar', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirSeccion(cmPage);
  const sec = seccion(cmPage);
  await expect(sec.locator('summary')).toHaveText('Vencimientos de lo ya usado');
  await expect(sec.locator('.cc-due-ctl')).toHaveText('Cargaste $0 de $865.000 usados · te faltan $865.000 por asignar');
  // El selector ofrece los próximos 12 vencimientos de la tarjeta (día 10) desde hoy.
  const valores = await cmPage.locator('#ccDueSel-nar option').evaluateAll((os) => os.map((o) => o.value));
  expect(valores).toHaveLength(12);
  expect(valores[0]).toBe('2026-11-10');
  expect(valores[11]).toBe('2027-10-10');

  await cargar(cmPage, '2026-11-10', 300000);
  await cargar(cmPage, '2026-12-10', 200000);
  await cargar(cmPage, '2027-01-10', 100000);
  await expect(sec.locator('.cc-due-row')).toHaveCount(3);
  await expect(sec.locator('.cc-due-row .cc-due-amt')).toHaveText(['$300.000', '$200.000', '$100.000']);
  await expect(sec.locator('.cc-due-row').first()).toContainText('noviembre 2026 · vence el 10/11');
  await expect(sec.locator('.cc-due-ctl')).toHaveText('Cargaste $600.000 de $865.000 usados · te faltan $265.000 por asignar');
  expect(await dues(cmPage)).toEqual(DUES3);   // ids determinísticos, sin otros campos
  // El mes cargado se marca en el selector
  await expect(cmPage.locator('#ccDueSel-nar option[value="2026-11-10"]')).toContainText('ya cargado');
  expect(consoleErrors).toEqual([]);
});

test('alta: con más de lo usado dice "te pasaste" en rojo y no bloquea; con todo asignado lo dice', async ({ cmPage }) => {
  await preparar(cmPage, { dues: DUES3 });
  await abrirSeccion(cmPage);
  const ctl = seccion(cmPage).locator('.cc-due-ctl');
  await cargar(cmPage, '2027-02-10', 265000);
  await expect(ctl).toHaveText('Cargaste $865.000 de $865.000 usados · ya está todo asignado');
  await cargar(cmPage, '2027-03-10', 135000);
  await expect(ctl).toHaveText('Cargaste $1.000.000 de $865.000 usados · te pasaste por $135.000');
  await expect(ctl).toHaveAttribute('data-tone', 'pasado');
  expect(await dues(cmPage)).toHaveLength(5);   // el aviso no bloquea el guardado
  const [color, rojo] = await cmPage.evaluate(() => {
    const p = document.createElement('i'); p.style.color = 'var(--danger)'; document.body.appendChild(p);
    const r = getComputedStyle(p).color; p.remove();
    return [getComputedStyle(document.querySelector('.cc-due-ctl')).color, r];
  });
  expect(color).toBe(rojo);
});

test('un mes ya cargado se edita en vez de duplicarse', async ({ cmPage }) => {
  await preparar(cmPage, { dues: DUES3 });
  await abrirSeccion(cmPage);
  const sec = seccion(cmPage);
  // Editar desde la fila: pasa el monto al formulario
  await sec.locator('.cc-due-row[data-due="2026-11-10"] button[aria-label="Editar vencimiento"]').click();
  await expect(cmPage.locator('#ccDueSel-nar')).toHaveValue('2026-11-10');
  await expect(cmPage.locator('#ccDueAmt-nar')).toHaveValue('300000');
  await cmPage.fill('#ccDueAmt-nar', '350000');
  await cmPage.click('#tj-pane-tarjetas details.cc-dues .btn-primary');
  await expect(sec.locator('.cc-due-row')).toHaveCount(3);
  await expect(sec.locator('.cc-due-row[data-due="2026-11-10"] .cc-due-amt')).toHaveText('$350.000');
  // Elegir el mismo mes en el selector y guardar también actualiza
  await cargar(cmPage, '2026-12-10', 250000);
  await expect(sec.locator('.cc-due-row')).toHaveCount(3);
  const lista = await dues(cmPage);
  expect(lista.map((d) => [d.id, d.amount])).toEqual([
    ['cd:nar:2026-11-10', 350000], ['cd:nar:2026-12-10', 250000], ['cd:nar:2027-01-10', 100000],
  ]);
  await expect(sec.locator('.cc-due-ctl')).toHaveText('Cargaste $700.000 de $865.000 usados · te faltan $165.000 por asignar');
});

test('borrar pide confirmación: cancelar no borra, aceptar sí y vuelve a faltar ese monto', async ({ cmPage }) => {
  await preparar(cmPage, { dues: DUES3 });
  await abrirSeccion(cmPage);
  const sec = seccion(cmPage);
  const fila = sec.locator('.cc-due-row[data-due="2026-12-10"]');
  let msg = '';
  cmPage.once('dialog', (d) => { msg = d.message(); d.dismiss(); });
  await fila.locator('button[aria-label="Borrar vencimiento"]').click();
  expect(msg).toContain('10/12/2026');
  expect(msg).toContain('$200.000');
  expect(await dues(cmPage)).toHaveLength(3);
  cmPage.once('dialog', (d) => d.accept());
  await fila.locator('button[aria-label="Borrar vencimiento"]').click();
  await expect(sec.locator('.cc-due-row')).toHaveCount(2);
  expect((await dues(cmPage)).map((d) => d.due)).toEqual(['2026-11-10', '2027-01-10']);
  await expect(sec.locator('.cc-due-ctl')).toHaveText('Cargaste $400.000 de $865.000 usados · te faltan $465.000 por asignar');
});

test('validaciones: fecha pasada, mes con pago registrado, monto vacío o con más de 2 decimales', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { pagos: [{ id: 'auto:nar:2026-12-10', key: 'auto:nar:2026-12-10', cardId: 'nar', date: '2026-12-10', amount: 1, accountId: 'uala', kind: 'auto' }] });
  await abrirSeccion(cmPage);
  const err = cmPage.locator('#ccDueErr-nar');
  const guardar = () => cmPage.click('#tj-pane-tarjetas details.cc-dues .btn-primary');

  await guardar();
  await expect(err).toContainText('Poné cuánto pagás ese mes');
  await cmPage.fill('#ccDueAmt-nar', '100.005');
  await guardar();
  await expect(err).toHaveText('El monto puede tener como máximo 2 decimales.');
  await cmPage.fill('#ccDueAmt-nar', '-5');
  await guardar();
  await expect(err).toContainText('más de 0');

  // Fecha pasada (el selector nunca la ofrece: se fuerza una opción)
  await cmPage.evaluate(() => { const o = document.createElement('option'); o.value = '2026-10-10'; o.textContent = 'pasado'; document.getElementById('ccDueSel-nar').appendChild(o); });
  await cmPage.selectOption('#ccDueSel-nar', '2026-10-10');
  await cmPage.fill('#ccDueAmt-nar', '1000');
  await guardar();
  await expect(err).toHaveText('Ese vencimiento ya pasó. Cargá solo vencimientos de hoy en adelante.');

  // Mes cuyo pago automático ya está registrado
  await cmPage.selectOption('#ccDueSel-nar', '2026-12-10');
  await guardar();
  await expect(err).toHaveText('El vencimiento del 10/12/2026 ya tiene un pago registrado: no se puede cargar ni cambiar.');
  expect(await dues(cmPage)).toEqual([]);
  // Un monto con 2 decimales es válido
  await cargar(cmPage, '2027-01-10', '1234.56');
  expect((await dues(cmPage)).map((d) => d.amount)).toEqual([1234.56]);
  expect(consoleErrors).toEqual([]);
});

test('doble clic en Guardar no duplica ni muestra un error', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirSeccion(cmPage);
  await cmPage.selectOption('#ccDueSel-nar', '2026-11-10');
  await cmPage.fill('#ccDueAmt-nar', '300000');
  await cmPage.dblclick('#tj-pane-tarjetas details.cc-dues .btn-primary');
  await expect(seccion(cmPage).locator('.cc-due-row')).toHaveCount(1);
  expect(await dues(cmPage)).toHaveLength(1);
  await expect(cmPage.locator('#ccDueErr-nar')).toHaveText('');
  expect(consoleErrors).toEqual([]);
});

test('calendario: el 10/11 suma la deuda cargada y las cuotas, con detalle, y la nota de saldo sin asignar se apaga sola', async ({ cmPage }) => {
  await preparar(cmPage, { cargos: [NOW1], dues: DUES3, tab: 'calendario' });
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-total')).toHaveText('A pagar $350.000');
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-due')).toHaveText(['10/11 · Naranja · $350.000']);
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-det')).toHaveText('Cuotas de compras $50.000 + lo ya usado $300.000');
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $200.000']);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-det')).toHaveText('lo ya usado $200.000');
  await expect(mes(cmPage, '2027-01').locator('.cc-cal-total')).toHaveText('A pagar $100.000');
  await expect(mes(cmPage, '2027-02')).toContainText('Nada para pagar');
  // "A pagar el DD/MM" de la tarjeta
  await expect(cmPage.locator('#tj-pane-calendario .cc-due-card .cc-due').first()).toHaveText('A pagar el 10/11: $350.000');
  // Quedan $265.000 sin fecha
  await expect(cmPage.locator('.cc-cal-note')).toHaveText('Tenés $265.000 usados sin fecha de vencimiento: cargalos en Tarjetas');

  // Se asigna todo (la tarjeta pasa a tener 865.000 repartidos): la nota desaparece
  await cmPage.evaluate(() => { S.cardDues.push({ id: 'cd:nar:2027-02-10', cardId: 'nar', due: '2027-02-10', amount: 265000 }); renderFinanzasTab(); });
  await expect(cmPage.locator('.cc-cal-note')).toHaveCount(0);
  await expect(mes(cmPage, '2027-02').locator('.cc-cal-total')).toHaveText('A pagar $265.000');
  // Sin compras ni vencimientos, y con saldo sin fecha: estado vacío + nota
  await cmPage.evaluate(() => { S.cardDues = []; S.cardCharges = []; renderFinanzasTab(); });
  await expect(cmPage.locator('#cardCalendar')).toContainText('Cuando cargues compras con tarjeta');
  await expect(cmPage.locator('.cc-cal-note')).toHaveText('Tenés $865.000 usados sin fecha de vencimiento: cargalos en Tarjetas');
});

test('calendario: solo deuda cargada (sin compras) también se calcula', async ({ cmPage }) => {
  await preparar(cmPage, { dues: DUES3, tab: 'calendario' });
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-total')).toHaveText('A pagar $300.000');
  await expect(mes(cmPage, '2026-11').locator('.cc-cal-det')).toHaveText('lo ya usado $300.000');
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
  // La fila de la deuda ya pagada figura como pagada y no se puede editar
  await abrirTarjetas(cmPage, 'tarjetas');
  await abrirSeccion(cmPage);
  const fila = seccion(cmPage).locator('.cc-due-row[data-due="2026-11-10"]');
  await expect(fila).toContainText('pagado');
  await expect(fila.locator('button[aria-label="Editar vencimiento"]')).toHaveCount(0);
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

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la sección abierta no genera scroll horizontal, sin errores de consola, y escapa lo que muestra', async ({ cmPage, consoleErrors }) => {
    const larga = { ...NARANJA, name: 'Naranja <i id="xss-nombre">con un nombre largo para probar el ajuste</i>', limit: 123456789.5, openingUsed: 123456789.5 };
    await preparar(cmPage, { cards: [larga], dues: [{ id: 'cd:nar:2026-11-10', cardId: 'nar', due: '2026-11-10', amount: 99999999.99 }, ...DUES3.slice(1)] });
    await abrirSeccion(cmPage);
    await cmPage.fill('#ccDueAmt-nar', '123456789.55');
    await cmPage.locator('#ccDueSel-nar').scrollIntoViewIfNeeded();
    const m = await cmPage.evaluate(() => {
      const body = document.querySelector('#ov-tarjetas .cm-ov-body'), sec = document.querySelector('#tj-pane-tarjetas details.cc-dues');
      return { sw: document.body.scrollWidth, cw: document.documentElement.clientWidth, bsw: body.scrollWidth, bcw: body.clientWidth, ssw: sec.scrollWidth, scw: sec.clientWidth };
    });
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    expect(m.bsw).toBeLessThanOrEqual(m.bcw + 1);
    expect(m.ssw).toBeLessThanOrEqual(m.scw + 1);
    expect(await cmPage.locator('#xss-nombre').count()).toBe(0);
    expect(consoleErrors).toEqual([]);
  });
});

test('registros inválidos llegados por sync (monto negativo, NaN, texto) no cuentan en el control ni en la lista', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { dues: [
    { id: 'cd:nar:2026-11-10', cardId: 'nar', due: '2026-11-10', amount: 100000 },
    { id: 'x1', cardId: 'nar', due: '2026-12-10', amount: -50000 },
    { id: 'x2', cardId: 'nar', due: '2027-01-10', amount: NaN },
    { id: 'x3', cardId: 'nar', due: '2027-02-10', amount: 'abc' },
  ] });
  await abrirSeccion(cmPage);
  const sec = seccion(cmPage);
  await expect(sec.locator('.cc-due-ctl')).toHaveText('Cargaste $100.000 de $865.000 usados · te faltan $765.000 por asignar');
  await expect(sec).not.toContainText('-$50.000');
  expect(consoleErrors).toEqual([]);
});

test('montos guardados como texto o fechas imposibles tampoco cuentan (mismo criterio que el pago automático)', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { dues: [
    { id: 'cd:nar:2026-11-10', cardId: 'nar', due: '2026-11-10', amount: 100000 },
    { id: 'y1', cardId: 'nar', due: '2026-12-10', amount: '30000' },
    { id: 'y2', cardId: 'nar', due: '2027-02-30', amount: 5000 },
    { id: 'y3', cardId: 'nar', due: '2027-13-45', amount: 5000 },
  ] });
  await abrirSeccion(cmPage);
  await expect(seccion(cmPage).locator('.cc-due-ctl')).toHaveText('Cargaste $100.000 de $865.000 usados · te faltan $765.000 por asignar');
  expect(consoleErrors).toEqual([]);
});
