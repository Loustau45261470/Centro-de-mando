// Etapa 7: Cash disponible, Balance real y Patrimonio (= Balance real, con el crédito usado descontado).
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna cuenta ni tarjeta.
'use strict';
const { test, expect } = require('./support/fixtures');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 600000, payAccountId: 'uala' };
const HOY = '2026-10-15';

const CUENTAS = [
  { id: 'efe', name: 'Efectivo', type: 'cash', balance: 200000, currency: 'ARS', icon: '💵' },
  { id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' },
  { id: 'didi', name: 'Deuda de Didi', type: 'prestamo', balance: 100000, currency: 'ARS', icon: '🤝' },
  { id: 'inv', name: 'Inversiones', type: 'invest', balance: 300000, currency: 'ARS', icon: '📈' },
];

async function preparar(page, { cuentas = CUENTAS, cards = [NARANJA], hoy = HOY } = {}) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ cuentas, cards, hoy }) => {
    window.getActiveDate = () => hoy;
    S.accounts = cuentas.map((a) => ({ ...a }));
    S.cards = cards.map((c) => ({ ...c }));
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = []; S.nwHistory = []; S.accountHistory = [];
    renderFinanzasTab();
  }, { cuentas, cards, hoy });
}

const irA = (page, hoy) => page.evaluate((h) => { window.getActiveDate = () => h; renderFinanzasTab(); }, hoy);
const nw = (page) => page.evaluate(() => calcNetWorth());
const used = (page) => page.evaluate(() => calcCreditUsed());
const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const digitos = (s) => s.replace(/\D/g, '');
const puntos = (page) => page.evaluate(() => S.nwHistory.map((h) => ({ ...h })));

async function cargar(page, c) {
  await page.click('#credit-card button:has-text("+ Compra")');
  await expect(page.locator('#modal-card-charge')).toHaveClass(/open/);
  await page.fill('#ccChDate', c.fecha || HOY);
  await page.fill('#ccChAmount', String(c.monto));
  await page.selectOption('#ccChMode', c.modo || 'now1');
  if (c.cuotas !== undefined) await page.fill('#ccChInst', String(c.cuotas));
  if (c.cuenta) await page.selectOption('#ccChToAcc', c.cuenta);
  await page.click('#modal-card-charge .btn-primary');
  await expect(page.locator('#modal-card-charge')).not.toHaveClass(/open/);
}

test('1) efectivo 200k + Ualá 500k + deuda a favor 100k + inversiones 300k − crédito 600k: Cash 800k, Balance real 500k = patrimonio mostrado', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  expect(await cmPage.evaluate(() => calcCash())).toBe(800000);
  expect(await used(cmPage)).toBe(600000);
  expect(await cmPage.evaluate(() => calcBalanceReal())).toBe(500000);
  expect(await nw(cmPage)).toBe(500000);
  // Lo que ve el usuario
  expect(digitos(await cmPage.locator('#nwTotal').innerText())).toBe('500000');
  expect(digitos(await cmPage.locator('#nwCash').innerText())).toBe('800000');
  // Reorganización de Finanzas: el balance real es el número grande y el cash va en pequeño debajo; sin desglose ni etiquetas.
  await expect(cmPage.locator('#nwCash').locator('xpath=..')).toHaveText('Cash $800,000');
  expect(await cmPage.locator('#nwBreakdown, #tab-finanzas .nw-label, #tab-finanzas .nw-label-cash').count()).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('1b) un crédito usado negativo se muestra tal cual y suma al balance', async ({ cmPage }) => {
  await preparar(cmPage, { cards: [{ ...NARANJA, openingUsed: -50000 }] });
  expect(await used(cmPage)).toBe(-50000);
  expect(await nw(cmPage)).toBe(1150000);
  expect(digitos(await cmPage.locator('#nwTotal').innerText())).toBe('1150000');   // el desglose textual ya no se muestra
});

test('2) compra now1: sube el usado y baja el patrimonio ese monto; pagar (automático y manual) no cambia el patrimonio', async ({ cmPage }) => {
  await preparar(cmPage);
  const antes = await nw(cmPage);
  await cargar(cmPage, { monto: 100000 });
  expect(await used(cmPage)).toBe(700000);
  expect(await nw(cmPage)).toBe(antes - 100000);
  expect(digitos(await cmPage.locator('#nwTotal').innerText())).toBe(String(antes - 100000));
  const conCompra = await nw(cmPage);

  // Pago automático el 10/11: baja el usado y el saldo de Ualá lo mismo.
  await irA(cmPage, '2026-11-10');
  expect(await used(cmPage)).toBe(600000);
  expect(await saldo(cmPage, 'uala')).toBe(400000);
  expect(await nw(cmPage)).toBe(conCompra);

  // Pago manual de 50.000 desde Ualá.
  await cmPage.click('#creditBody button:has-text("Registrar pago de resumen")');
  await expect(cmPage.locator('#modal-card-payment')).toHaveClass(/open/);
  await cmPage.fill('#ccPayAmount', '50000');
  await cmPage.click('#modal-card-payment .btn-primary');
  await expect(cmPage.locator('#modal-card-payment')).not.toHaveClass(/open/);
  expect(await used(cmPage)).toBe(550000);
  expect(await saldo(cmPage, 'uala')).toBe(350000);
  expect(await nw(cmPage)).toBe(conCompra);
});

test('3) adelanto con tarjeta: suma a la cuenta y suma crédito usado, el patrimonio no cambia', async ({ cmPage }) => {
  await preparar(cmPage);
  const antes = await nw(cmPage);
  await cargar(cmPage, { monto: 100000, modo: 'advance', cuotas: 2, cuenta: 'efe' });
  expect(await saldo(cmPage, 'efe')).toBe(300000);
  expect(await used(cmPage)).toBe(700000);
  expect(await cmPage.evaluate(() => calcCash())).toBe(900000);
  expect(await nw(cmPage)).toBe(antes);
});

test('4) Mover plata no cambia el patrimonio (Ualá a Inversiones: baja el cash, no el balance)', async ({ cmPage }) => {
  await preparar(cmPage);
  const antes = await nw(cmPage);
  await cmPage.click('button:has-text("Mover plata")');
  await cmPage.selectOption('#moveFrom', 'uala');
  await cmPage.selectOption('#moveTo', 'inv');
  await cmPage.fill('#moveAmount', '200000');
  await cmPage.click('#modal-move-money button:has-text("Mover")');
  await expect(cmPage.locator('#modal-move-money')).not.toHaveClass(/open/);
  expect(await nw(cmPage)).toBe(antes);
  expect(await cmPage.evaluate(() => calcCash())).toBe(600000);
  await expect(cmPage.locator('#nwCash').locator('xpath=..')).toHaveText('Cash $600,000');
});

test('5) una cuenta de tipo Otro suma en el balance real pero no en el cash', async ({ cmPage }) => {
  await preparar(cmPage, { cuentas: [...CUENTAS, { id: 'otro', name: 'Otro', type: 'other', balance: 40000, currency: 'ARS', icon: '🏦' }] });
  expect(await cmPage.evaluate(() => calcCash())).toBe(800000);
  expect(await nw(cmPage)).toBe(540000);
  expect(digitos(await cmPage.locator('#nwCash').innerText())).toBe('800000');
  expect(digitos(await cmPage.locator('#nwTotal').innerText())).toBe('540000');   // el desglose textual ya no se muestra
});

test('6) historial: el punto nuevo lleva c:1 y los viejos no se tocan (la nota del método ya no se muestra)', async ({ cmPage }) => {
  await preparar(cmPage);
  const viejos = [{ date: '2026-08-01', value: 1111 }, { date: '2026-08-20', value: 2222 }];

  await cmPage.evaluate((v) => { S.nwHistory = v.map((x) => ({ ...x })); renderFinanzasTab(); }, viejos);

  // snapshotNW agrega el punto nuevo marcado; los viejos quedan idénticos.
  await cmPage.evaluate(() => { snapshotNW(); renderFinanzasTab(); });
  const h = await puntos(cmPage);
  expect(h).toEqual([...viejos, { date: HOY, value: 500000, c: 1 }]);
  expect(await cmPage.locator('#nwMethodNote').count()).toBe(0);

  // Cambiar el rango del gráfico no rompe nada sin la nota.
  await cmPage.click('#nwRangeSeg button[data-range="1M"]');
  await cmPage.click('#nwRangeSeg button[data-range="all"]');

  // Sin puntos viejos: solo el punto nuevo marcado.
  await cmPage.evaluate(() => { S.nwHistory = []; snapshotNW(); renderFinanzasTab(); });
  expect(await puntos(cmPage)).toEqual([{ date: HOY, value: 500000, c: 1 }]);
});

test('6b) cambia el crédito usado: se actualiza el punto de hoy (sin duplicar el día) con c:1', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => { S.nwHistory = [{ date: '2026-10-15', value: 999 }]; });   // punto de hoy con el método viejo
  await cargar(cmPage, { monto: 100000 });
  expect(await puntos(cmPage)).toEqual([{ date: HOY, value: 400000, c: 1 }]);

  // Pago manual
  await cmPage.click('#creditBody button:has-text("Registrar pago de resumen")');
  await cmPage.fill('#ccPayAmount', '10000');
  await cmPage.click('#modal-card-payment .btn-primary');
  await expect(cmPage.locator('#modal-card-payment')).not.toHaveClass(/open/);
  expect(await puntos(cmPage)).toEqual([{ date: HOY, value: 400000, c: 1 }]);

  // Borrar la compra libera crédito: el patrimonio sube y el punto de hoy lo refleja.
  const id = await cmPage.evaluate(() => S.cardCharges[0].id);
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.click(`.cc-chg[data-charge-id="${id}"] button[aria-label="Borrar compra"]`);
  await expect.poll(() => cmPage.evaluate(() => S.cardCharges.length)).toBe(0);
  const esperado = await nw(cmPage);
  expect(esperado).toBe(500000);
  expect(await puntos(cmPage)).toEqual([{ date: HOY, value: 500000, c: 1 }]);

  // Editar el usado inicial de la tarjeta (guardar tarjeta) y borrar la tarjeta.
  await cmPage.evaluate(() => openCardModal('nar'));
  await cmPage.fill('#cardOpeningUsed', '300000');
  await cmPage.click('#modal-card button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-card')).not.toHaveClass(/open/);
  expect(await puntos(cmPage)).toEqual([{ date: HOY, value: 800000, c: 1 }]);
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.click('#creditBody button[aria-label="Eliminar tarjeta"]');
  await expect.poll(() => cmPage.evaluate(() => S.cards.length)).toBe(0);
  expect(await puntos(cmPage)).toEqual([{ date: HOY, value: 1090000, c: 1 }]);
});

test('7) sin tarjetas el patrimonio es la suma de todas las cuentas, como antes', async ({ cmPage }) => {
  const cuentas = [...CUENTAS,
    { id: 'otro', name: 'Otro', type: 'other', balance: 40000.5, currency: 'ARS', icon: '🏦' },
    { id: 'usd', name: 'Dólares', type: 'bank', balance: 10, currency: 'USD', icon: '💵' }];
  await preparar(cmPage, { cuentas, cards: [] });
  expect(await used(cmPage)).toBe(0);
  const viejo = await cmPage.evaluate(() => S.accounts.reduce((s, a) => s + a.balance, 0));
  expect(await nw(cmPage)).toBe(viejo);
  expect(await nw(cmPage)).toBe(1140010.5);
  // También con S.cards ausente (estado viejo).
  await cmPage.evaluate(() => { delete S.cards; });
  expect(await nw(cmPage)).toBe(1140010.5);
});

test('8) logros, JARVIS, objetivos y adquisiciones reciben el mismo valor que calcNetWorth', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => { snapshotNW(); });
  const r = await cmPage.evaluate(() => {
    renderJarvisCore();
    const jarvis = document.querySelector('#tab-jarvis .jstat[data-k="patrimonio"] [data-v]').textContent;
    const obj = _financeLinkProgress({ type: 'finance', metric: 'patrimonio', target: 1000000 }, null);
    return { nw: calcNetWorth(), logros: gmMetric('patrimonio'), jarvis, objLabel: obj.label, objPct: obj.pct, esperadoLabel: fmtMoney(calcNetWorth(), 'ARS') };
  });
  expect(r.nw).toBe(500000);
  expect(r.logros).toBe(r.nw);                 // gamemode lee el último punto de nwHistory, que escribe snapshotNW con calcNetWorth
  expect(digitos(r.jarvis)).toBe('500000');
  expect(r.objLabel).toContain(r.esperadoLabel);
  expect(r.objPct).toBe(50);
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('9) la tarjeta Patrimonio no genera scroll horizontal (con cifras enormes y crédito alto)', async ({ cmPage }) => {
    await preparar(cmPage, {
      cuentas: [...CUENTAS, { id: 'otro', name: 'Otro', type: 'other', balance: 123456789, currency: 'ARS', icon: '🏦' }],
      cards: [{ ...NARANJA, openingUsed: 987654321, limit: 2000000000 }],
    });
    await cmPage.evaluate(() => { S.nwHistory = [{ date: '2026-09-01', value: 1 }]; snapshotNW(); renderFinanzasTab(); });
    await cmPage.locator('#nwCash').scrollIntoViewIfNeeded();
    const { sw, cw } = await cmPage.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw + 1);
    for (const sel of ['#nwTotal', '#nwCash']) {
      const box = await cmPage.locator(sel).boundingBox();
      expect(box.x, sel).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, sel).toBeLessThanOrEqual(cw + 1);
    }
    const t = await cmPage.locator('#nwTotal').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(t.sw).toBeLessThanOrEqual(t.cw + 1);
  });
});
