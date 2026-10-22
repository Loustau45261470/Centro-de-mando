// Compra con tarjeta unificada en el formulario de Movimientos: el campo "Cuenta" pasa a ser "Medio de pago"
// (cuentas + una opción por tarjeta, solo en gastos) y al elegir una tarjeta aparece el panel de modalidades.
// Los valores esperados son los mismos que cards-charges.spec (Naranja cierra 27 vence 10, hoy = 15-oct-2026).
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna cuenta ni tarjeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const { abrirTarjetas, cerrarTarjetas, elegirTarjeta, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 865000 };
const MP = { id: 'mp', name: 'Mercado Pago', limit: 425000, closeDay: 5, dueDay: 10, openingUsed: 357000 };

async function preparar(page, { hoy = '2026-10-15', cards = [NARANJA] } = {}) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, cards }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
      { id: 'usd', name: 'Dólares', type: 'bank', balance: 10, currency: 'USD', icon: '💵' },
    ];
    S.cards = cards.map((c) => ({ ...c, payAccountId: 'uala' }));
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
    renderFinanzasTab();
  }, { hoy, cards });
}

const irA = (page, hoy) => page.evaluate((h) => { window.getActiveDate = () => h; renderFinanzasTab(); }, hoy);
const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const gastosTarjeta = (page) => page.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => ({ id: t.id, date: t.date, amount: t.amount, type: t.type, accountId: t.accountId, currency: t.currency, category: t.category, name: t.name })));
const pagos = (page) => page.evaluate(() => S.cardPayments.map((p) => ({ id: p.id, key: p.key, cardId: p.cardId, date: p.date, amount: p.amount, kind: p.kind, accountId: p.accountId })));
const cargos = (page) => page.evaluate(() => S.cardCharges);
const fila = (page, name) => page.locator('.cc-row', { hasText: name });
const vence = (page, name) => page.locator('.cc-due-card', { hasText: name });
const opciones = (page, sel) => page.locator(`${sel} option`).evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })));

async function abrirMovimiento(page, tipo) {
  await cerrarTarjetas(page);
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
  if (tipo) await page.selectOption('#txnType', tipo);
}

test('1) medio de pago: en gasto lista cuentas + una opción por tarjeta; en ingreso solo cuentas', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { cards: [NARANJA, MP] });
  await abrirMovimiento(cmPage, 'expense');
  await expect(cmPage.locator('#txnAccountLbl')).toHaveText('Medio de pago');
  const gasto = await opciones(cmPage, '#txnAccount');
  expect(gasto.map((o) => o.v)).toEqual(['', 'uala', 'efe', 'usd', 'prestamos_amorcito', 'card:nar', 'card:mp']);
  expect(gasto.find((o) => o.v === 'uala').t).toContain('Ualá');
  expect(gasto.find((o) => o.v === 'efe').t).toContain('Efectivo');
  expect(gasto.find((o) => o.v === 'card:nar').t).toBe('💳 Naranja');
  expect(gasto.find((o) => o.v === 'card:mp').t).toBe('💳 Mercado Pago');
  // Por defecto no hay medio de pago ni panel de tarjeta.
  await expect(cmPage.locator('#txnAccount')).toHaveValue('');
  await expect(cmPage.locator('#txnCardPanel')).toBeHidden();

  // Ingreso: solo cuentas, nunca tarjetas.
  await cmPage.selectOption('#txnType', 'income');
  await expect(cmPage.locator('#txnAccountLbl')).toHaveText('Cuenta');
  expect((await opciones(cmPage, '#txnAccount')).map((o) => o.v)).toEqual(['', 'uala', 'efe', 'usd', 'prestamos_amorcito']);

  // Elegir una tarjeta y pasar a ingreso saca la tarjeta y el panel.
  await cmPage.selectOption('#txnType', 'expense');
  await elegirTarjeta(cmPage, 'mp');
  await cmPage.selectOption('#txnType', 'income');
  await expect(cmPage.locator('#txnAccount')).toHaveValue('');
  await expect(cmPage.locator('#txnCardPanel')).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('1b) sin tarjetas el selector se ve como siempre y no hay panel', async ({ cmPage }) => {
  await preparar(cmPage, { cards: [] });
  await abrirMovimiento(cmPage, 'expense');
  expect((await opciones(cmPage, '#txnAccount')).map((o) => o.v)).toEqual(['', 'uala', 'efe', 'usd', 'prestamos_amorcito']);
  await expect(cmPage.locator('#txnCardPanel')).toBeHidden();
  await expect(cmPage.locator('#txnCurrency')).toBeVisible();
});

test('2) elegir tarjeta muestra las 4 modalidades con sus campos y la vista previa; la moneda y la nota de mes se ocultan', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage, 'expense');
  await expect(cmPage.locator('#txnCurrency')).toBeVisible();
  await elegirTarjeta(cmPage, 'nar');
  await expect(cmPage.locator('#txnCurrency')).toBeHidden();
  expect((await opciones(cmPage, '#ccChMode')).map((o) => [o.v, o.t])).toEqual([
    ['now1', 'Consumo inmediato, 1 pago'],
    ['deferred', 'En cuotas, uso diferido'],
    ['nowInst', 'En cuotas, uso inmediato'],
    ['advance', 'Plata de un tercero con mi tarjeta'],
  ]);
  await expect(cmPage.locator('#ccChDate')).toHaveValue('2026-10-15');
  await expect(cmPage.locator('#ccChPreview')).toContainText('Completá los datos');
  await cmPage.fill('#txnAmount', '90000');

  const visibles = async () => ({
    cuotas: await cmPage.locator('#ccChInstRow').isVisible(),
    meses: await cmPage.locator('#ccChMonthsRow').isVisible(),
    cuenta: await cmPage.locator('#ccChToAccRow').isVisible(),
    categoria: await cmPage.locator('#txnCategoryRow').isVisible(),
  });
  await cmPage.selectOption('#ccChMode', 'now1');
  expect(await visibles()).toEqual({ cuotas: false, meses: false, cuenta: false, categoria: true });
  await expect(cmPage.locator('#ccChModeHint')).toContainText('El gasto cuenta en el mes de la compra');
  await expect(cmPage.locator('#ccChPreview')).toContainText('Cae en el resumen que cierra el 27/10/2026 y vence el 10/11/2026');
  await expect(cmPage.locator('#ccChPreview')).toContainText('Pago único · vence el 10/11/2026 · $90.000');
  await cmPage.selectOption('#ccChMode', 'deferred');
  expect(await visibles()).toEqual({ cuotas: true, meses: true, cuenta: false, categoria: true });
  await cmPage.fill('#ccChInst', '3'); await cmPage.fill('#ccChMonths', '5');
  await expect(cmPage.locator('#ccChPreview')).toContainText('Cuota 2 de 3 · vence el 10/12/2026 · $30.000');
  await expect(cmPage.locator('#ccChPreview')).toContainText('febrero 2027 · $18.000');
  await cmPage.selectOption('#ccChMode', 'nowInst');
  expect(await visibles()).toEqual({ cuotas: true, meses: false, cuenta: false, categoria: true });
  await cmPage.selectOption('#ccChMode', 'advance');
  expect(await visibles()).toEqual({ cuotas: true, meses: false, cuenta: true, categoria: false });
  await cmPage.selectOption('#ccChToAcc', 'efe');
  await expect(cmPage.locator('#ccChPreview')).toContainText('No es ingreso ni gasto');

  // Volver a una cuenta oculta el panel y devuelve la moneda y la categoría.
  await cmPage.selectOption('#txnAccount', 'efe');
  await expect(cmPage.locator('#txnCardPanel')).toBeHidden();
  await expect(cmPage.locator('#txnCurrency')).toBeVisible();
  await expect(cmPage.locator('#txnCategoryRow')).toBeVisible();
  // Cerrar y volver a abrir deja el formulario limpio.
  await cmPage.click('#modal-add-txn .btn-ghost');
  await abrirMovimiento(cmPage);
  await expect(cmPage.locator('#txnAccount')).toHaveValue('');
  await expect(cmPage.locator('#txnCardPanel')).toBeHidden();
  await expect(cmPage.locator('#ccChMode')).toHaveValue('now1');
  expect(consoleErrors).toEqual([]);
});

async function cargar(page, c) {
  await abrirCompraDesdeMovimientos(page);
  await llenarCompra(page, c);
  await guardarCompra(page);
}

test('2a) consumo inmediato 1 pago, 50.000 el 15-oct: gasto en octubre, la plata sale el 10-nov, el usado sube', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
  await cargar(cmPage, { monto: 50000, nombre: 'Compra de prueba', categoria: cat });
  const ch = (await cargos(cmPage))[0];
  expect(ch).toMatchObject({ cardId: 'nar', date: '2026-10-15', amount: 50000, mode: 'now1', category: cat, name: 'Compra de prueba' });
  expect(ch.installments).toBeUndefined();
  const g = await gastosTarjeta(cmPage);
  expect(g).toHaveLength(1);
  expect(g[0]).toMatchObject({ id: `cc:${ch.id}:2026-10`, date: '2026-10-15', amount: 50000, type: 'expense', accountId: null, currency: 'ARS', category: cat });
  expect(await saldo(cmPage, 'uala')).toBe(1000000);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$915.000');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/11: $50.000');
  await irA(cmPage, '2026-11-10');
  expect(await saldo(cmPage, 'uala')).toBe(950000);
  expect(await pagos(cmPage)).toEqual([{ id: 'auto:nar:2026-11-10', key: 'auto:nar:2026-11-10', cardId: 'nar', date: '2026-11-10', amount: 50000, kind: 'auto', accountId: 'uala' }]);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(1);
  // El formulario quedó limpio.
  await expect(cmPage.locator('#txnName')).toHaveValue('');
  await expect(cmPage.locator('#txnAmount')).toHaveValue('');
  expect(consoleErrors).toEqual([]);
});

test('2b) en cuotas con uso diferido, 90.000 en 3 cuotas y 5 meses: 18.000 de gasto por mes y 30.000 en cada vencimiento', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 90000, nombre: 'Alimento', modo: 'deferred', cuotas: 3, meses: 5 });
  const ch = (await cargos(cmPage))[0];
  expect(ch).toMatchObject({ mode: 'deferred', installments: 3, consumeMonths: 5, amount: 90000 });
  expect((await gastosTarjeta(cmPage)).map((t) => t.id)).toEqual([`cc:${ch.id}:2026-10`]);
  await irA(cmPage, '2027-03-01');
  const g = await gastosTarjeta(cmPage);
  expect(g.map((t) => t.id).sort()).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map((m) => `cc:${ch.id}:${m}`));
  expect(g.every((t) => t.amount === 18000)).toBe(true);
  expect((await pagos(cmPage)).map((x) => [x.id, x.amount])).toEqual([['auto:nar:2026-11-10', 30000], ['auto:nar:2026-12-10', 30000], ['auto:nar:2027-01-10', 30000]]);
  expect(await saldo(cmPage, 'uala')).toBe(910000);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
});

test('2c) en cuotas con uso inmediato, 90.000 en 3: gasto completo en el mes de compra y 3 pagos de 30.000', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 90000, nombre: 'Carne', modo: 'nowInst', cuotas: 3 });
  const ch = (await cargos(cmPage))[0];
  const g = await gastosTarjeta(cmPage);
  expect(g).toHaveLength(1);
  expect(g[0]).toMatchObject({ id: `cc:${ch.id}:2026-10`, amount: 90000, date: '2026-10-15' });
  await irA(cmPage, '2027-03-01');
  expect(await gastosTarjeta(cmPage)).toHaveLength(1);
  expect((await pagos(cmPage)).map((x) => [x.date, x.amount])).toEqual([['2026-11-10', 30000], ['2026-12-10', 30000], ['2027-01-10', 30000]]);
  expect(await saldo(cmPage, 'uala')).toBe(910000);
});

test('2d) plata de un tercero, 100.000 en 2 cuotas: entra a Efectivo, no es ingreso ni gasto y consume crédito', async ({ cmPage }) => {
  await preparar(cmPage);
  const nwAntes = await cmPage.evaluate(() => calcNetWorth());
  await cargar(cmPage, { monto: 100000, nombre: 'Adelanto a Didi', modo: 'advance', cuotas: 2, cuenta: 'efe' });
  const ch = (await cargos(cmPage))[0];
  expect(ch).toMatchObject({ mode: 'advance', installments: 2, amount: 100000, toAccountId: 'efe', category: '' });
  expect(await saldo(cmPage, 'efe')).toBe(150000);
  expect(await cmPage.evaluate(() => calcNetWorth())).toBe(nwAntes);
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(0);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$965.000');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/11: $50.000');
  await irA(cmPage, '2026-12-10');
  expect((await pagos(cmPage)).map((x) => [x.date, x.amount])).toEqual([['2026-11-10', 50000], ['2026-12-10', 50000]]);
  expect(await saldo(cmPage, 'uala')).toBe(900000);
  expect(await saldo(cmPage, 'efe')).toBe(150000);
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(0);
});

test('2e) el día exacto del cierre cae en el resumen siguiente (la fecha de compra manda)', async ({ cmPage }) => {
  await preparar(cmPage, { hoy: '2026-10-27' });
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { fecha: '2026-10-26', monto: 1000 });
  await expect(cmPage.locator('#ccChPreview')).toContainText('cierra el 27/10/2026 y vence el 10/11/2026');
  await cmPage.fill('#ccChDate', '2026-10-27');
  await expect(cmPage.locator('#ccChPreview')).toContainText('cierra el 27/11/2026 y vence el 10/12/2026');
  await guardarCompra(cmPage);
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/12: $1.000');
});

test('3) un gasto con efectivo, uno con Ualá y un ingreso siguen funcionando igual', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
  const registrar = async (c) => {
    await abrirMovimiento(cmPage, c.tipo);
    await cmPage.fill('#txnName', c.nombre);
    await cmPage.selectOption('#txnCategory', cat);
    await cmPage.fill('#txnAmount', String(c.monto));
    await cmPage.selectOption('#txnCurrency', 'ARS');
    await cmPage.selectOption('#txnAccount', c.cuenta);
    await expect(cmPage.locator('#txnCardPanel')).toBeHidden();
    await cmPage.click('#modal-add-txn button:has-text("Registrar")');
    await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  };
  await registrar({ tipo: 'expense', nombre: 'Almuerzo', monto: 1500, cuenta: 'efe' });
  expect(await saldo(cmPage, 'efe')).toBe(48500);
  await registrar({ tipo: 'expense', nombre: 'Suscripción', monto: 2500.5, cuenta: 'uala' });
  expect(await saldo(cmPage, 'uala')).toBe(997499.5);
  await registrar({ tipo: 'income', nombre: 'Honorarios', monto: 20000, cuenta: 'uala' });
  expect(await saldo(cmPage, 'uala')).toBe(1017499.5);
  const txs = await cmPage.evaluate(() => S.transactions.map((t) => ({ name: t.name, type: t.type, amount: t.amount, currency: t.currency, accountId: t.accountId, category: t.category, date: t.date, cc: !!t.cardChargeId })));
  expect(txs.find((t) => t.name === 'Almuerzo')).toEqual({ name: 'Almuerzo', type: 'expense', amount: 1500, currency: 'ARS', accountId: 'efe', category: cat, date: '2026-10-15', cc: false });
  expect(txs.find((t) => t.name === 'Suscripción')).toMatchObject({ type: 'expense', amount: 2500.5, accountId: 'uala', category: cat });
  expect(txs.find((t) => t.name === 'Honorarios')).toMatchObject({ type: 'income', amount: 20000, accountId: 'uala' });
  expect(await cmPage.evaluate(() => S.cardCharges.length)).toBe(0);
  // Historial de Actividad.
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
  for (const n of ['Almuerzo', 'Suscripción', 'Honorarios']) await expect(cmPage.locator('#activityList')).toContainText(n);
  expect(consoleErrors).toEqual([]);
});

test('4) validaciones: mensaje en pantalla y no se guarda nada', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  const err = cmPage.locator('#ccChErr');
  const casos = [
    [{ monto: '100.123' }, '2 decimales'],
    [{ monto: '1.005' }, '2 decimales'],
    [{ monto: '0' }, 'mayor a 0'],
    [{ monto: '' }, 'mayor a 0'],
    [{ monto: '1000', modo: 'nowInst', cuotas: '0' }, 'cuotas'],
    [{ monto: '1000', modo: 'nowInst', cuotas: '61' }, 'cuotas'],
    [{ monto: '1000', modo: 'deferred', cuotas: '3', meses: '' }, 'meses'],
    [{ monto: '1000', modo: 'deferred', cuotas: '3', meses: '0' }, 'meses'],
    [{ monto: '1000', modo: 'advance', cuotas: '2', cuenta: '' }, 'cuenta'],
    [{ monto: '1000', fecha: '' }, 'Fecha'],
    [{ monto: '1000', nombre: 'x'.repeat(81) }, '80 caracteres'],
  ];
  for (const [c, palabra] of casos) {
    await cmPage.selectOption('#ccChMode', c.modo || 'now1');
    await cmPage.fill('#ccChDate', c.fecha === undefined ? '2026-10-15' : c.fecha);
    await cmPage.fill('#txnAmount', c.monto);
    await cmPage.fill('#txnName', c.nombre || '');
    if (c.cuotas !== undefined) await cmPage.fill('#ccChInst', c.cuotas);
    if (c.meses !== undefined) await cmPage.fill('#ccChMonths', c.meses);
    if (c.modo === 'advance') await cmPage.selectOption('#ccChToAcc', c.cuenta);
    await cmPage.click('#modal-add-txn .btn-primary');
    await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
    await expect(err).toContainText(palabra);
  }
  expect(await cargos(cmPage)).toHaveLength(0);
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(0);
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  // Con 2 decimales exactos sí guarda.
  await cmPage.selectOption('#ccChMode', 'now1');
  await cmPage.fill('#ccChDate', '2026-10-15');
  await cmPage.fill('#txnName', '');
  await cmPage.fill('#txnAmount', '1234.56');
  await guardarCompra(cmPage);
  expect((await cargos(cmPage))[0].amount).toBe(1234.56);
});

test('5) el botón de la pestaña Compras abre Movimientos con el medio de pago en tarjeta', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirTarjetas(cmPage, 'compras');
  await cmPage.click('#tj-pane-compras button:has-text("+ Compra con tarjeta")');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#txnType')).toHaveValue('expense');
  await expect(cmPage.locator('#txnAccount')).toHaveValue('card:nar');
  await expect(cmPage.locator('#txnCardPanel')).toBeVisible();
  await expect(cmPage.locator('#modal-add-txn')).toBeVisible();
  // Se carga desde ahí y la lista de Compras (overlay abierto) se actualiza.
  await llenarCompra(cmPage, { monto: 7000, nombre: 'Desde Compras' });
  await guardarCompra(cmPage);
  await expect(cmPage.locator('#ov-tarjetas')).toHaveClass(/show/);
  await expect(cmPage.locator('#cardChargeList .cc-chg-name')).toHaveText(['Desde Compras']);

  // Con varias tarjetas: gasto, sin tarjeta preseleccionada y el foco en el medio de pago.
  await cerrarTarjetas(cmPage);
  await preparar(cmPage, { cards: [NARANJA, MP] });
  await abrirTarjetas(cmPage, 'compras');
  await cmPage.click('#tj-pane-compras button:has-text("+ Compra con tarjeta")');
  await expect(cmPage.locator('#txnType')).toHaveValue('expense');
  await expect(cmPage.locator('#txnAccount')).toHaveValue('');
  expect(await cmPage.evaluate(() => document.activeElement.id)).toBe('txnAccount');
  await elegirTarjeta(cmPage, 'mp');
  expect(consoleErrors).toEqual([]);
});

test('6) ya no existe el modal ni el botón de compra en el encabezado, ni sus funciones', async ({ cmPage }) => {
  await preparar(cmPage);
  await expect(cmPage.locator('#modal-card-charge')).toHaveCount(0);
  await expect(cmPage.locator('#ccChCard, #ccChAmount, #ccChName, #ccChCategory')).toHaveCount(0);
  await expect(cmPage.locator('#activity-card button:has-text("+ Compra con tarjeta")')).toHaveCount(0);
  expect(await cmPage.evaluate(() => [typeof openCardChargeModal, typeof saveCardCharge])).toEqual(['undefined', 'undefined']);
});

for (const ancho of [1280, 390]) {
  test.describe(`${ancho}px`, () => {
    test.use({ viewport: { width: ancho, height: 900 } });

    test(`6b) los botones del encabezado de Movimientos se ven completos a ${ancho}px`, async ({ cmPage }) => {
      await preparar(cmPage);
      await cmPage.locator('#activity-card').scrollIntoViewIfNeeded();
      const m = await cmPage.evaluate(() => {
        const card = document.getElementById('activity-card').getBoundingClientRect();
        const titulo = document.querySelector('#activity-card .card-title');
        const botones = [...titulo.querySelectorAll('button')].map((b) => {
          const r = b.getBoundingClientRect();
          return { t: b.textContent.trim(), l: r.left, r: r.right, w: r.width, cortado: b.scrollWidth > b.clientWidth + 1 };
        });
        return { cardL: card.left, cardR: card.right, botones, tsw: titulo.scrollWidth, tcw: titulo.clientWidth };
      });
      expect(m.botones.map((b) => b.t)).toEqual(['🎨 Categorías', '💳 Tarjetas', '+ Movimiento']);
      for (const b of m.botones) {
        expect(b.w, b.t).toBeGreaterThan(40);
        expect(b.l, b.t).toBeGreaterThanOrEqual(m.cardL);
        expect(b.r, b.t).toBeLessThanOrEqual(m.cardR);
        expect(b.cortado, b.t).toBe(false);
      }
      expect(m.tsw).toBeLessThanOrEqual(m.tcw + 1);
    });
  });
}

test('7) XSS: la descripción con HTML se muestra como texto; doble clic en Registrar no duplica la compra', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 1000, nombre: '<b>x</b><img src=x onerror="window.__xss=1">' });
  await abrirTarjetas(cmPage, 'compras');
  await expect(cmPage.locator('.cc-chg-name')).toHaveText('<b>x</b><img src=x onerror="window.__xss=1">');
  await expect(cmPage.locator('#cardChargeList .cc-chg-name b, #cardChargeList .cc-chg-name img')).toHaveCount(0);
  await cerrarTarjetas(cmPage);
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
  await expect(cmPage.locator('#activityList .act-name', { hasText: '<b>x</b>' }).first()).toBeVisible();
  await expect(cmPage.locator('#activityList .act-name b')).toHaveCount(0);
  expect(await cmPage.evaluate(() => window.__xss)).toBeUndefined();

  // Doble clic.
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 5000, nombre: 'Una sola vez' });
  await cmPage.evaluate(() => {
    const b = document.querySelector('#modal-add-txn .btn-primary');
    b.click(); b.click();
  });
  expect((await cargos(cmPage)).filter((c) => c.name === 'Una sola vez')).toHaveLength(1);
  expect((await gastosTarjeta(cmPage)).filter((t) => t.name === 'Una sola vez')).toHaveLength(1);
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('8) con el formulario y el panel de tarjeta abiertos no hay scroll horizontal ni errores de consola', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage, { cards: [NARANJA, MP] });
    await abrirCompraDesdeMovimientos(cmPage);
    for (const modo of ['now1', 'deferred', 'nowInst', 'advance']) {
      await cmPage.selectOption('#ccChMode', modo);
      await cmPage.fill('#txnAmount', '90000');
      await cmPage.fill('#txnName', 'Compra con un nombre bastante largo para probar el ajuste de línea');
      const modal = cmPage.locator('#modal-add-txn .modal');
      await modal.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
      const b = await modal.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(391);
      expect(b.y + b.height).toBeLessThanOrEqual(845);
      const ov = await modal.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
      expect(ov.sw, modo).toBeLessThanOrEqual(ov.cw + 1);
      const pg = await cmPage.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(pg.sw, modo).toBeLessThanOrEqual(pg.cw + 1);
      // El botón principal se alcanza dentro del scroll del modal.
      await modal.locator('.btn-primary').scrollIntoViewIfNeeded();
      await expect(modal.locator('.btn-primary')).toBeInViewport();
    }
    expect(consoleErrors).toEqual([]);
  });
});
