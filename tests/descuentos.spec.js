// Descuentos porcentuales en el formulario de Movimientos (10, 15, 20, 25 y 50%).
// El usuario carga el TOTAL y la app calcula el final = total x (1 - pct/100), redondeado a centavos (mitad hacia arriba).
// El final es lo que cuenta como gasto, baja del saldo y se usa en las cuotas de la tarjeta.
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna cuenta ni tarjeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const { abrirTarjetas, cerrarTarjetas, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 865000 };

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
const gastosTarjeta = (page) => page.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => ({ id: t.id, date: t.date, amount: t.amount })));
const pagos = (page) => page.evaluate(() => S.cardPayments.map((p) => ({ date: p.date, amount: p.amount })));
const cargos = (page) => page.evaluate(() => S.cardCharges);
const txns = (page) => page.evaluate(() => S.transactions.map((t) => ({ ...t })));
const centavos = (n) => Math.round(n * 100);
// fmtMoney usa el idioma del navegador (8,000 o 8.000): se acepta cualquiera de los dos separadores de miles.
const numRe = (n) => new RegExp(String(n).replace(/\B(?=(\d{3})+$)/g, '[.,]?'));
const fila = (page, name) => page.locator('.cc-row', { hasText: name });
const vence = (page, name) => page.locator('.cc-due-card', { hasText: name });
const chip = (page, etiqueta) => page.locator('#txnDiscount').getByRole('radio', { name: etiqueta, exact: true });
const etiquetaPct = (pct) => (pct ? `${pct}%` : 'Sin descuento');
const elegir = (page, pct) => chip(page, etiquetaPct(pct)).click();
const elegido = (page) => page.locator('#txnDiscount [aria-checked="true"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));

async function abrirMovimiento(page, tipo) {
  await cerrarTarjetas(page);
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
  if (tipo) await page.selectOption('#txnType', tipo);
}

// Movimiento sin tarjeta (efectivo, Ualá...). pct opcional.
async function registrar(page, { tipo = 'expense', nombre = 'Compra', monto, cuenta = 'efe', pct = 0, cat } = {}) {
  await abrirMovimiento(page, tipo);
  await page.fill('#txnName', nombre);
  if (cat) await page.selectOption('#txnCategory', cat);
  await page.fill('#txnAmount', String(monto));
  await page.selectOption('#txnCurrency', 'ARS');
  await page.selectOption('#txnAccount', cuenta);
  if (pct) await elegir(page, pct);
  await page.click('#modal-add-txn button:has-text("Registrar")');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
}

// Compra con tarjeta: abre el formulario, llena y elige el descuento (el monto es el TOTAL).
async function compraConDescuento(page, c, pct) {
  await abrirCompraDesdeMovimientos(page);
  await llenarCompra(page, c);
  if (pct) await elegir(page, pct);
}

// 1 y 2) Gasto con efectivo / Ualá: el final es el gasto real en todas partes.
const CASOS_CUENTA = [
  { cuenta: 'efe', pct: 20, total: 10000, final: 8000, saldoIni: 50000 },
  { cuenta: 'uala', pct: 20, total: 10000, final: 8000, saldoIni: 1000000 },
  { cuenta: 'uala', pct: 50, total: 10000, final: 5000, saldoIni: 1000000 },
  { cuenta: 'efe', pct: 10, total: 10000, final: 9000, saldoIni: 50000 },
  { cuenta: 'uala', pct: 15, total: 10000, final: 8500, saldoIni: 1000000 },
  { cuenta: 'efe', pct: 25, total: 10000, final: 7500, saldoIni: 50000 },
];
for (const c of CASOS_CUENTA) {
  test(`1-2) gasto de $${c.total} con ${c.pct}% en ${c.cuenta}: se registra el final ($${c.final}) en movimiento, saldo, resumen, categoría y presupuesto`, async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage);
    const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
    await registrar(cmPage, { nombre: 'Súper', monto: c.total, cuenta: c.cuenta, pct: c.pct, cat });

    const t = (await txns(cmPage))[0];
    expect(t).toMatchObject({ type: 'expense', name: 'Súper', amount: c.final, discountPct: c.pct, amountOriginal: c.total, accountId: c.cuenta, category: cat, date: '2026-10-15' });
    expect(await saldo(cmPage, c.cuenta)).toBe(c.saldoIni - c.final);
    // Resumen de gastos del mes, categoría y presupuesto: todo sobre el final.
    await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
    await expect(cmPage.locator('#txnSumExpense')).toContainText(numRe(c.final));
    expect(await cmPage.evaluate((k) => _spentMonth(k), '2026-10')).toBe(c.final);
    expect(await cmPage.evaluate((k) => S.transactions.filter((x) => x.category === k && x.type === 'expense').reduce((s, x) => s + x.amount, 0), cat)).toBe(c.final);
    expect(await cmPage.evaluate(() => S.cardCharges.length)).toBe(0);
    expect(consoleErrors).toEqual([]);
  });
}

test('1b) el resumen del presupuesto del mes muestra el final', async ({ cmPage }) => {
  await preparar(cmPage);
  await registrar(cmPage, { monto: 10000, pct: 20 });
  const gastado = await cmPage.evaluate(() => _spentMonth(_curMonthKey()));
  // _curMonthKey sigue la fecha real; si el mes real no es octubre de 2026 el gasto no cae ahí: se comprueba en octubre.
  expect(await cmPage.evaluate(() => _spentMonth('2026-10'))).toBe(8000);
  if (gastado) await expect(cmPage.locator('#budgetSummaryBody')).toContainText(numRe(8000));
});

// 3) Redondeo a centavos, mitad hacia arriba.
test('3) redondeo: 333,33 al 15% -> 283,33; 0,01 al 50% -> 0,01; 1,01 al 50% -> 0,51; 999,99 al 25% -> 749,99', async ({ cmPage }) => {
  await preparar(cmPage);
  const casos = [[333.33, 15, 283.33], [0.01, 50, 0.01], [1.01, 50, 0.51], [999.99, 25, 749.99], [0.03, 50, 0.02], [19.99, 10, 17.99]];
  let esperado = 50000;
  for (const [total, pct, final] of casos) {
    await registrar(cmPage, { nombre: `R ${total}`, monto: total, pct });
    const t = (await txns(cmPage))[0];
    expect(t.amount, `${total} al ${pct}%`).toBe(final);
    expect(t.amountOriginal).toBe(total);
    esperado = Math.round((esperado - final) * 100) / 100;
    expect(await saldo(cmPage, 'efe')).toBeCloseTo(esperado, 2);
  }
});

test('3b) la suma de las cuotas de una compra con descuento es exactamente el final', async ({ cmPage }) => {
  await preparar(cmPage);
  await compraConDescuento(cmPage, { monto: 333.33, nombre: 'En cuotas', modo: 'nowInst', cuotas: 3 }, 15);
  await guardarCompra(cmPage);
  const ch = (await cargos(cmPage))[0];
  expect(ch).toMatchObject({ amount: 283.33, discountPct: 15, amountOriginal: 333.33, mode: 'nowInst', installments: 3 });
  const cuotas = await cmPage.evaluate(() => CMTarjetas.installmentSchedule(S.cards[0], S.cardCharges[0]).map((q) => q.amount));
  expect(cuotas).toHaveLength(3);
  expect(cuotas.reduce((s, x) => s + centavos(x), 0)).toBe(28333);
  await irA(cmPage, '2027-03-01');
  expect((await pagos(cmPage)).reduce((s, p) => s + centavos(p.amount), 0)).toBe(28333);
  expect((await gastosTarjeta(cmPage)).reduce((s, g) => s + centavos(g.amount), 0)).toBe(28333);

  // Diferida con 999,99 al 25% (749,99) en 5 meses y 3 cuotas.
  await preparar(cmPage);
  await compraConDescuento(cmPage, { monto: 999.99, nombre: 'Diferida', modo: 'deferred', cuotas: 3, meses: 5 }, 25);
  await guardarCompra(cmPage);
  expect((await cargos(cmPage))[0]).toMatchObject({ amount: 749.99, discountPct: 25, amountOriginal: 999.99 });
  await irA(cmPage, '2027-03-01');
  const g = await gastosTarjeta(cmPage);
  expect(g).toHaveLength(5);
  expect(g.reduce((s, x) => s + centavos(x.amount), 0)).toBe(74999);
  expect((await pagos(cmPage)).reduce((s, p) => s + centavos(p.amount), 0)).toBe(74999);
});

// 4) Tarjeta: el motor recibe el final.
test('4) tarjeta 1 pago de $50.000 el 15-oct con 20%: cargo 40.000, usado +40.000, gasto de octubre 40.000 y el 10-nov paga 40.000', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
  await compraConDescuento(cmPage, { monto: 50000, nombre: 'Compra de prueba', categoria: cat }, 20);
  await expect(cmPage.locator('#txnDiscountPreview')).toHaveText('Total $50.000 → pagás $40.000 (ahorrás $10.000)');
  await expect(cmPage.locator('#ccChPreview')).toContainText('$40.000');
  await guardarCompra(cmPage);

  const ch = (await cargos(cmPage))[0];
  expect(ch).toMatchObject({ cardId: 'nar', date: '2026-10-15', amount: 40000, mode: 'now1', discountPct: 20, amountOriginal: 50000 });
  const g = await gastosTarjeta(cmPage);
  expect(g).toEqual([{ id: `cc:${ch.id}:2026-10`, date: '2026-10-15', amount: 40000 }]);
  expect(await saldo(cmPage, 'uala')).toBe(1000000);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$905.000');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/11: $40.000');
  await irA(cmPage, '2026-11-10');
  expect(await pagos(cmPage)).toEqual([{ date: '2026-11-10', amount: 40000 }]);
  expect(await saldo(cmPage, 'uala')).toBe(960000);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
  expect(consoleErrors).toEqual([]);
});

test('4b) tarjeta diferida (5 meses, 3 cuotas) y en cuotas con uso inmediato: gasto y cuotas sobre el final', async ({ cmPage }) => {
  await preparar(cmPage);
  await compraConDescuento(cmPage, { monto: 90000, nombre: 'Alimento', modo: 'deferred', cuotas: 3, meses: 5 }, 20);
  const pv = cmPage.locator('#ccChPreview');
  await expect(pv).toContainText('Cuota 1 de 3 · vence el 10/11/2026 · $24.000');
  for (const m of ['octubre 2026', 'noviembre 2026', 'diciembre 2026', 'enero 2027', 'febrero 2027']) await expect(pv).toContainText(`${m} · $14.400`);
  await guardarCompra(cmPage);
  expect((await cargos(cmPage))[0]).toMatchObject({ amount: 72000, discountPct: 20, amountOriginal: 90000, mode: 'deferred' });
  await irA(cmPage, '2027-03-01');
  const g = await gastosTarjeta(cmPage);
  expect(g.map((x) => x.amount)).toEqual([14400, 14400, 14400, 14400, 14400]);
  expect((await pagos(cmPage)).map((p) => p.amount)).toEqual([24000, 24000, 24000]);

  await preparar(cmPage);
  await compraConDescuento(cmPage, { monto: 90000, nombre: 'Carne', modo: 'nowInst', cuotas: 3 }, 20);
  await guardarCompra(cmPage);
  expect((await cargos(cmPage))[0]).toMatchObject({ amount: 72000, discountPct: 20, amountOriginal: 90000, mode: 'nowInst' });
  expect((await gastosTarjeta(cmPage)).map((x) => x.amount)).toEqual([72000]);
  await irA(cmPage, '2027-03-01');
  expect((await pagos(cmPage)).map((p) => p.amount)).toEqual([24000, 24000, 24000]);
  expect(await saldo(cmPage, 'uala')).toBe(928000);
});

test('4c) plata de un tercero con mi tarjeta: sin selector de descuento y se guarda con el monto completo', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await expect(cmPage.locator('#txnDiscountRow')).toBeVisible();
  await elegir(cmPage, 20);
  await cmPage.selectOption('#ccChMode', 'advance');
  await expect(cmPage.locator('#txnDiscountRow')).toBeHidden();
  // Al volver a un gasto real, el descuento quedó reseteado.
  await cmPage.selectOption('#ccChMode', 'now1');
  await expect(cmPage.locator('#txnDiscountRow')).toBeVisible();
  expect(await elegido(cmPage)).toEqual(['Sin descuento']);
  await elegir(cmPage, 20);
  await llenarCompra(cmPage, { monto: 100000, nombre: 'Adelanto', modo: 'advance', cuotas: 2, cuenta: 'efe' });
  await expect(cmPage.locator('#txnDiscountRow')).toBeHidden();
  await guardarCompra(cmPage);
  const ch = (await cargos(cmPage))[0];
  expect(ch).toMatchObject({ mode: 'advance', amount: 100000 });
  expect(ch).not.toHaveProperty('discountPct');
  expect(ch).not.toHaveProperty('amountOriginal');
  expect(await saldo(cmPage, 'efe')).toBe(150000);
});

// 5) Ingresos y reseteo.
test('5) ingreso: sin selector; cambiar de gasto a ingreso resetea el descuento y no se guarda', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage);
  await expect(cmPage.locator('#txnType')).toHaveValue('income');
  await expect(cmPage.locator('#txnDiscountRow')).toBeHidden();
  await cmPage.selectOption('#txnType', 'expense');
  await expect(cmPage.locator('#txnDiscountRow')).toBeVisible();
  await expect(cmPage.locator('#txnDiscountRow label')).toHaveText('Descuento');
  await elegir(cmPage, 25);
  expect(await elegido(cmPage)).toEqual(['25%']);
  await cmPage.selectOption('#txnType', 'income');
  await expect(cmPage.locator('#txnDiscountRow')).toBeHidden();
  await cmPage.selectOption('#txnType', 'expense');
  expect(await elegido(cmPage)).toEqual(['Sin descuento']);
  await expect(cmPage.locator('#txnDiscountPreview')).toHaveText('');

  // Un ingreso cargado tras tocar el descuento queda entero y sin campos de descuento.
  await elegir(cmPage, 25);
  await cmPage.selectOption('#txnType', 'income');
  await cmPage.fill('#txnName', 'Honorarios');
  await cmPage.fill('#txnAmount', '20000');
  await cmPage.selectOption('#txnCurrency', 'ARS');
  await cmPage.selectOption('#txnAccount', 'uala');
  await cmPage.click('#modal-add-txn button:has-text("Registrar")');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  const t = (await txns(cmPage))[0];
  expect(t).toMatchObject({ type: 'income', amount: 20000 });
  expect(t).not.toHaveProperty('discountPct');
  expect(await saldo(cmPage, 'uala')).toBe(1020000);
});

test('5b) el formulario siempre abre en "Sin descuento" y por defecto no se guarda ningún descuento', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage, 'expense');
  expect(await elegido(cmPage)).toEqual(['Sin descuento']);
  await elegir(cmPage, 50);
  await cmPage.click('#modal-add-txn .btn-ghost');
  await abrirMovimiento(cmPage, 'expense');
  expect(await elegido(cmPage)).toEqual(['Sin descuento']);
  // Seis opciones, en orden, accesibles como grupo con etiqueta visible.
  expect(await cmPage.locator('#txnDiscount [role=radio]').allTextContents()).toEqual(['Sin descuento', '10%', '15%', '20%', '25%', '50%']);
  await expect(cmPage.getByRole('radiogroup', { name: 'Descuento' })).toBeVisible();
});

// 6) Vista previa.
test('6) vista previa "Total -> pagás (ahorrás)" para cada porcentaje, y con decimales', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage, 'expense');
  const pv = cmPage.locator('#txnDiscountPreview');
  await cmPage.fill('#txnAmount', '10000');
  await expect(pv).toHaveText('');
  for (const [pct, pagas, ahorras] of [[10, '9.000', '1.000'], [15, '8.500', '1.500'], [20, '8.000', '2.000'], [25, '7.500', '2.500'], [50, '5.000', '5.000']]) {
    await elegir(cmPage, pct);
    await expect(pv).toHaveText(`Total $10.000 → pagás $${pagas} (ahorrás $${ahorras})`);
  }
  // La vista previa sigue al monto mientras se escribe.
  await cmPage.fill('#txnAmount', '333.33');
  await elegir(cmPage, 15);
  await expect(pv).toHaveText('Total $333,33 → pagás $283,33 (ahorrás $50)');
  await cmPage.fill('#txnAmount', '');
  await expect(pv).toHaveText('Cargá el total para ver cuánto pagás.');
  await elegir(cmPage, 0);
  await expect(pv).toHaveText('');
});

// 7) Etiqueta "-20%".
test('7) etiqueta "−20%" con texto accesible en la lista de Movimientos y en Compras; sin etiqueta si no hay descuento', async ({ cmPage }) => {
  await preparar(cmPage);
  await registrar(cmPage, { nombre: 'Con descuento', monto: 10000, pct: 20 });
  await registrar(cmPage, { nombre: 'Sin descuento', monto: 3000 });
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
  const conDesc = cmPage.locator('#activityList .activity-row', { hasText: 'Con descuento' });
  const tag = conDesc.getByRole('img', { name: 'Total $10.000, descuento 20%' });
  await expect(tag).toHaveText('−20%');
  await expect(tag).toHaveAttribute('title', 'Total $10.000, descuento 20%');
  await expect(conDesc.locator('.act-amount')).toContainText(numRe(8000));
  await expect(conDesc.locator('.act-amount')).not.toContainText(numRe(10000));
  await expect(cmPage.locator('#activityList .activity-row', { hasText: 'Sin descuento' }).locator('.disc-tag')).toHaveCount(0);

  await preparar(cmPage);
  await compraConDescuento(cmPage, { monto: 50000, nombre: 'Compra A' }, 20);
  await guardarCompra(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 2000, nombre: 'Compra B' });
  await guardarCompra(cmPage);
  await abrirTarjetas(cmPage, 'compras');
  const a = cmPage.locator('#cardChargeList .cc-chg', { hasText: 'Compra A' });
  await expect(a.locator('.cc-chg-amt')).toContainText('$40.000');
  const tagA = a.getByRole('img', { name: 'Total $50.000, descuento 20%' });
  await expect(tagA).toHaveText('−20%');
  await expect(cmPage.locator('#cardChargeList .cc-chg', { hasText: 'Compra B' }).locator('.disc-tag')).toHaveCount(0);
});

// 8) Regresión: sin descuento todo es idéntico y los registros viejos no cambian.
test('8) sin descuento: mismo resultado que antes (cargo y movimiento sin campos nuevos); registros viejos sin etiqueta', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 50000, nombre: 'Compra de prueba', categoria: cat });
  await expect(cmPage.locator('#txnDiscountPreview')).toHaveText('');
  await guardarCompra(cmPage);
  const ch = (await cargos(cmPage))[0];
  expect(Object.keys(ch).sort()).toEqual(['amount', 'cardId', 'category', 'date', 'id', 'mode', 'name']);
  expect(ch).toMatchObject({ cardId: 'nar', date: '2026-10-15', amount: 50000, mode: 'now1' });
  expect((await gastosTarjeta(cmPage))[0]).toMatchObject({ id: `cc:${ch.id}:2026-10`, amount: 50000 });
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$915.000');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/11: $50.000');
  await irA(cmPage, '2026-11-10');
  expect(await saldo(cmPage, 'uala')).toBe(950000);

  await registrar(cmPage, { nombre: 'Almuerzo', monto: 1500, cuenta: 'efe' });
  const t = (await txns(cmPage)).find((x) => x.name === 'Almuerzo');
  expect(Object.keys(t).sort()).toEqual(['accountId', 'amount', 'category', 'currency', 'date', 'id', 'name', 'type']);
  expect(await saldo(cmPage, 'efe')).toBe(48500);

  // Registros viejos (sin discountPct) y uno con discountPct 0: ninguno muestra etiqueta.
  await cmPage.evaluate(() => {
    S.transactions.push({ id: 'viejo1', type: 'expense', name: 'Viejo', amount: 500, date: '2026-10-10', accountId: 'efe', currency: 'ARS', category: '' });
    S.transactions.push({ id: 'cero1', type: 'expense', name: 'Cero', amount: 700, date: '2026-10-11', accountId: 'efe', currency: 'ARS', category: '', discountPct: 0 });
    S.cardCharges.push({ id: 'chViejo', cardId: 'nar', date: '2026-10-12', amount: 1000, mode: 'now1', category: '', name: 'Cargo viejo' });
    txnActiveMonth = '2026-10'; renderActivity(); renderFinanzasTab();
  });
  await expect(cmPage.locator('#activityList .activity-row', { hasText: 'Viejo' }).locator('.disc-tag')).toHaveCount(0);
  await expect(cmPage.locator('#activityList .activity-row', { hasText: 'Cero' }).locator('.disc-tag')).toHaveCount(0);
  await abrirTarjetas(cmPage, 'compras');
  await expect(cmPage.locator('#cardChargeList .cc-chg', { hasText: 'Cargo viejo' })).toBeVisible();
  await expect(cmPage.locator('#cardChargeList .disc-tag')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

// 9) Edición.
test('9) editar un movimiento con descuento muestra el final y conserva descuento y total al cambiar nombre y categoría', async ({ cmPage }) => {
  await preparar(cmPage);
  const cats = await cmPage.evaluate(() => Object.keys(_liveCatMap()));
  await registrar(cmPage, { nombre: 'Original', monto: 10000, cuenta: 'uala', pct: 20, cat: cats[0] });
  const id = (await txns(cmPage))[0].id;
  await cmPage.evaluate((i) => openEditTxn(i), id);
  await expect(cmPage.locator('#editTxnAmount')).toHaveValue('8000');
  await cmPage.fill('#editTxnName', 'Renombrado');
  await cmPage.selectOption('#editTxnCategory', cats[1]);
  await cmPage.click('#modal-edit-txn button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  const t = (await txns(cmPage))[0];
  expect(t).toMatchObject({ id, name: 'Renombrado', category: cats[1], amount: 8000, discountPct: 20, amountOriginal: 10000, accountId: 'uala' });
  expect(await saldo(cmPage, 'uala')).toBe(992000);
  expect(await cmPage.evaluate(() => _spentMonth('2026-10'))).toBe(8000);

  // Si se corrige el monto final a mano, el total y el descuento de referencia dejan de valer.
  await cmPage.evaluate((i) => openEditTxn(i), id);
  await cmPage.fill('#editTxnAmount', '7000');
  await cmPage.click('#modal-edit-txn button:has-text("Guardar")');
  const t2 = (await txns(cmPage))[0];
  expect(t2.amount).toBe(7000);
  expect(t2).not.toHaveProperty('discountPct');
  expect(t2).not.toHaveProperty('amountOriginal');
  expect(await saldo(cmPage, 'uala')).toBe(993000);
});

// 10) Doble clic y teclado.
test('10) doble clic en Registrar no duplica (movimiento y tarjeta); flechas y Espacio eligen el chip', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage, 'expense');
  await cmPage.fill('#txnName', 'Una vez');
  await cmPage.fill('#txnAmount', '10000');
  await cmPage.selectOption('#txnCurrency', 'ARS');
  await cmPage.selectOption('#txnAccount', 'efe');
  await elegir(cmPage, 20);
  await cmPage.evaluate(() => { const b = document.querySelector('#modal-add-txn .btn-primary'); b.click(); b.click(); });
  expect((await txns(cmPage)).filter((t) => t.name === 'Una vez')).toHaveLength(1);
  expect(await saldo(cmPage, 'efe')).toBe(42000);

  await compraConDescuento(cmPage, { monto: 5000, nombre: 'Tarjeta una vez' }, 10);
  await cmPage.evaluate(() => { const b = document.querySelector('#modal-add-txn .btn-primary'); b.click(); b.click(); });
  const cs = (await cargos(cmPage)).filter((c) => c.name === 'Tarjeta una vez');
  expect(cs).toHaveLength(1);
  expect(cs[0].amount).toBe(4500);

  // Teclado: el chip elegido es el único con tabindex 0; las flechas mueven y eligen.
  await abrirMovimiento(cmPage, 'expense');
  await cmPage.fill('#txnAmount', '1000');
  await chip(cmPage, 'Sin descuento').focus();
  await cmPage.keyboard.press('ArrowRight');
  expect(await elegido(cmPage)).toEqual(['10%']);
  await cmPage.keyboard.press('ArrowRight');
  await cmPage.keyboard.press('ArrowDown');
  expect(await elegido(cmPage)).toEqual(['20%']);
  await expect(chip(cmPage, '20%')).toBeFocused();
  expect(await cmPage.locator('#txnDiscount [role=radio]').evaluateAll((bs) => bs.filter((b) => b.tabIndex === 0).map((b) => b.textContent))).toEqual(['20%']);
  await cmPage.keyboard.press('ArrowLeft');
  expect(await elegido(cmPage)).toEqual(['15%']);
  await cmPage.keyboard.press('End');
  expect(await elegido(cmPage)).toEqual(['50%']);
  await cmPage.keyboard.press('ArrowRight');   // da la vuelta
  expect(await elegido(cmPage)).toEqual(['Sin descuento']);
  await cmPage.keyboard.press('Tab');           // sale del grupo (no recorre cada chip)
  await cmPage.keyboard.press('Shift+Tab');
  await chip(cmPage, '25%').focus();
  await cmPage.keyboard.press('Space');
  expect(await elegido(cmPage)).toEqual(['25%']);
  await expect(cmPage.locator('#txnDiscountPreview')).toHaveText('Total $1.000 → pagás $750 (ahorrás $250)');
});

test('10b) validaciones: más de 2 decimales con descuento no se guarda; el mínimo 0,01 con 50% queda en 0,01', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage, 'expense');
  await cmPage.fill('#txnName', 'Decimales');
  await cmPage.fill('#txnAmount', '100.123');
  await cmPage.selectOption('#txnCurrency', 'ARS');
  await cmPage.selectOption('#txnAccount', 'efe');
  await elegir(cmPage, 20);
  await cmPage.click('#modal-add-txn button:has-text("Registrar")');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#toast')).toContainText('2 decimales');
  expect(await txns(cmPage)).toHaveLength(0);
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  await cmPage.click('#modal-add-txn .btn-ghost');

  // Tarjeta: mismo control sobre el total; la barra de error del panel lo dice.
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: '100.123' });
  await elegir(cmPage, 20);
  await cmPage.click('#modal-add-txn .btn-primary');
  await expect(cmPage.locator('#ccChErr')).toContainText('2 decimales');
  expect(await cargos(cmPage)).toHaveLength(0);
  await cmPage.fill('#txnAmount', '0.01');
  await elegir(cmPage, 50);
  await guardarCompra(cmPage);
  expect((await cargos(cmPage))[0]).toMatchObject({ amount: 0.01, discountPct: 50, amountOriginal: 0.01 });
});

// 11) 390px.
test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('11) con el selector y la vista previa (también en el panel de tarjeta) no hay scroll horizontal ni errores de consola', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage);
    const medir = async (clave) => {
      const modal = cmPage.locator('#modal-add-txn .modal');
      await modal.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
      const b = await modal.boundingBox();
      expect(b.x, clave).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, clave).toBeLessThanOrEqual(391);
      const ov = await modal.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
      expect(ov.sw, clave).toBeLessThanOrEqual(ov.cw + 1);
      const pg = await cmPage.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(pg.sw, clave).toBeLessThanOrEqual(pg.cw + 1);
      const chips = await cmPage.locator('#txnDiscount button').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right }; }));
      for (const c of chips) { expect(c.l, clave).toBeGreaterThanOrEqual(0); expect(c.r, clave).toBeLessThanOrEqual(391); }
    };
    await abrirMovimiento(cmPage, 'expense');
    await cmPage.fill('#txnName', 'Compra con un nombre bastante largo para probar el ajuste de línea');
    await cmPage.fill('#txnAmount', '333.33');
    await elegir(cmPage, 15);
    await expect(cmPage.locator('#txnDiscountPreview')).toContainText('pagás $283,33');
    await medir('sin tarjeta');
    await cmPage.click('#modal-add-txn .btn-ghost');

    await abrirCompraDesdeMovimientos(cmPage);
    for (const modo of ['now1', 'deferred', 'nowInst']) {
      await cmPage.selectOption('#ccChMode', modo);
      await cmPage.fill('#txnAmount', '999999.99');
      await cmPage.fill('#txnName', 'Compra con un nombre bastante largo para probar el ajuste de línea');
      await elegir(cmPage, 50);
      await expect(cmPage.locator('#txnDiscountPreview')).toContainText('pagás $500.000');
      await medir(modo);
    }
    // En un movimiento con etiqueta la lista tampoco desborda.
    await cmPage.click('#modal-add-txn .btn-ghost');
    await registrar(cmPage, { nombre: 'Compra con un nombre bastante largo para probar el ajuste', monto: 123456.78, pct: 25 });
    await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
    await expect(cmPage.locator('#activityList .disc-tag')).toBeVisible();
    const pg = await cmPage.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(pg.sw).toBeLessThanOrEqual(pg.cw + 1);
    expect(consoleErrors).toEqual([]);
  });
});

// 12) Otros caminos que crean gastos no llevan descuento.
test('12) los gastos materializados de una compra con tarjeta, Mover plata y los registros de otras vías no traen campos de descuento', async ({ cmPage }) => {
  await preparar(cmPage);
  await compraConDescuento(cmPage, { monto: 90000, nombre: 'Diferida', modo: 'deferred', cuotas: 3, meses: 5 }, 20);
  await guardarCompra(cmPage);
  await irA(cmPage, '2026-12-05');
  const g = await cmPage.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => Object.keys(t).sort().join(',')));
  expect(g.length).toBe(3);
  for (const k of g) expect(k).not.toMatch(/discountPct|amountOriginal/);
  // JARVIS (add_transaction), gasto-foto y Mover plata arman sus movimientos sin pasar por el formulario: no leen el selector.
  const fs = require('fs'), path = require('path');
  for (const f of ['jarvis-agent.js', 'gasto-foto.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    expect(src, f).not.toMatch(/discountPct|amountOriginal|txnDiscount|_txnDiscountPct/);
  }
});
