// Edición de movimientos: el modal de edición ofrece las MISMAS cuentas que el formulario de alta
// (efectivo, bancos, inversión, "Prestamos amorcito"), preselecciona la actual y reaplica el saldo
// con la misma mecánica de siempre (revierte lo viejo sobre la cuenta original, aplica lo nuevo sobre la elegida).
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna cuenta.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas } = require('./support/tarjetas-ui');

async function preparar(page) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(() => {
    window.getActiveDate = () => '2026-10-15';
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
      { id: 'inv', name: 'Broker', type: 'invest', balance: 200000, currency: 'ARS', icon: '📈' },
    ];
    S.cards = []; S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
    renderFinanzasTab();
  });
}

const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const txn = (page, id) => page.evaluate((i) => ({ ...S.transactions.find((t) => t.id === i) }), id);

// Carga un movimiento por el formulario de alta (así se prueba el flujo real: alta -> edición).
async function registrar(page, { tipo = 'expense', nombre = 'Compra', monto, cuenta = 'efe' }) {
  await cerrarTarjetas(page);
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
  await page.selectOption('#txnType', tipo);
  await page.fill('#txnName', nombre);
  await page.fill('#txnAmount', String(monto));
  await page.selectOption('#txnCurrency', 'ARS');
  await page.selectOption('#txnAccount', cuenta);
  await page.click('#modal-add-txn button:has-text("Registrar")');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
  return page.evaluate(() => S.transactions[S.transactions.length - 1].id);
}

async function editar(page, id, cambios = {}) {
  await page.evaluate((i) => openEditTxn(i), id);
  await expect(page.locator('#modal-edit-txn')).toHaveClass(/open/);
  if (cambios.nombre !== undefined) await page.fill('#editTxnName', cambios.nombre);
  if (cambios.categoria !== undefined) await page.selectOption('#editTxnCategory', cambios.categoria);
  if (cambios.monto !== undefined) await page.fill('#editTxnAmount', String(cambios.monto));
  if (cambios.cuenta !== undefined) await page.selectOption('#editTxnAccount', cambios.cuenta);
  await page.click('#modal-edit-txn button:has-text("Guardar")');
  await expect(page.locator('#modal-edit-txn')).not.toHaveClass(/open/);
}

const opciones = (page, selector) => page.locator(`${selector} option`).evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));

test('el modal de edición lista las mismas cuentas que el alta (ingreso) y preselecciona la actual', async ({ cmPage }) => {
  await preparar(cmPage);
  const id = await registrar(cmPage, { nombre: 'Efectivo 1', monto: 10000, cuenta: 'efe' });
  // Alta en modo ingreso: solo cuentas (sin tarjetas), igual que la edición.
  await cmPage.click('#activity-card button:has-text("+ Movimiento")');
  await cmPage.selectOption('#txnType', 'income');
  const alta = await opciones(cmPage, '#txnAccount');
  await cmPage.evaluate(() => closeModal('modal-add-txn'));
  await cmPage.evaluate((i) => openEditTxn(i), id);
  const edicion = await opciones(cmPage, '#editTxnAccount');
  expect(edicion).toEqual(alta);
  expect(edicion.map((o) => o.v)).toEqual(['', 'uala', 'efe', 'inv', 'prestamos_amorcito']);
  await expect(cmPage.locator('#editTxnAccount')).toHaveValue('efe');
});

test('a) editar solo nombre, categoría o fecha de un gasto en efectivo conserva cuenta y saldo', async ({ cmPage }) => {
  await preparar(cmPage);
  const id = await registrar(cmPage, { nombre: 'Almuerzo', monto: 10000, cuenta: 'efe' });
  expect(await saldo(cmPage, 'efe')).toBe(40000);
  const cats = await cmPage.evaluate(() => Object.keys(_liveCatMap()));
  await editar(cmPage, id, { nombre: 'Almuerzo editado', categoria: cats[1] });
  expect(await txn(cmPage, id)).toMatchObject({ name: 'Almuerzo editado', category: cats[1], amount: 10000, accountId: 'efe' });
  expect(await saldo(cmPage, 'efe')).toBe(40000);
  // Sin tocar nada también queda igual.
  await editar(cmPage, id);
  expect((await txn(cmPage, id)).accountId).toBe('efe');
  expect(await saldo(cmPage, 'efe')).toBe(40000);
});

test('b) cambiar el monto de un gasto en efectivo ajusta el saldo por la diferencia', async ({ cmPage }) => {
  await preparar(cmPage);
  const id = await registrar(cmPage, { nombre: 'Almuerzo', monto: 10000, cuenta: 'efe' });
  await editar(cmPage, id, { monto: 12500 });
  expect(await txn(cmPage, id)).toMatchObject({ amount: 12500, accountId: 'efe' });
  expect(await saldo(cmPage, 'efe')).toBe(37500);
  await editar(cmPage, id, { monto: 4000 });
  expect(await saldo(cmPage, 'efe')).toBe(46000);
});

test('c) pasar un gasto de Efectivo a Ualá y volver restituye el origen y descuenta el destino', async ({ cmPage }) => {
  await preparar(cmPage);
  const id = await registrar(cmPage, { nombre: 'Almuerzo', monto: 10000, cuenta: 'efe' });
  await editar(cmPage, id, { cuenta: 'uala' });
  expect((await txn(cmPage, id)).accountId).toBe('uala');
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect(await saldo(cmPage, 'uala')).toBe(990000);
  await editar(cmPage, id, { cuenta: 'efe' });
  expect((await txn(cmPage, id)).accountId).toBe('efe');
  expect(await saldo(cmPage, 'efe')).toBe(40000);
  expect(await saldo(cmPage, 'uala')).toBe(1000000);
});

test('d) un ingreso en efectivo se edita igual: cuenta intacta, monto por la diferencia, cambio de cuenta', async ({ cmPage }) => {
  await preparar(cmPage);
  const id = await registrar(cmPage, { tipo: 'income', nombre: 'Cobro', monto: 8000, cuenta: 'efe' });
  expect(await saldo(cmPage, 'efe')).toBe(58000);
  await editar(cmPage, id, { nombre: 'Cobro editado' });
  expect(await txn(cmPage, id)).toMatchObject({ name: 'Cobro editado', accountId: 'efe', type: 'income' });
  expect(await saldo(cmPage, 'efe')).toBe(58000);
  await editar(cmPage, id, { monto: 9000 });
  expect(await saldo(cmPage, 'efe')).toBe(59000);
  await editar(cmPage, id, { cuenta: 'inv' });
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect(await saldo(cmPage, 'inv')).toBe(209000);
});

test('e) movimientos viejos sin cuenta o con cuenta eliminada no se rompen ni cambian de cuenta', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => {
    S.transactions.push(
      { id: 'sin1', type: 'expense', name: 'Sin cuenta', amount: 300, date: '2026-10-11', currency: 'ARS', category: '' },
      { id: 'huer1', type: 'expense', name: 'Cuenta borrada', amount: 400, date: '2026-10-12', accountId: 'borrada', currency: 'ARS', category: '' },
      { id: 'amor1', type: 'expense', name: 'Amorcito', amount: 500, date: '2026-10-13', accountId: 'prestamos_amorcito', currency: 'ARS', category: '' },
    );
    txnActiveMonth = '2026-10'; renderActivity(); renderFinanzasTab();
  });
  const antes = await cmPage.evaluate(() => S.accounts.map((a) => [a.id, a.balance]));
  await editar(cmPage, 'sin1', { nombre: 'Sin cuenta 2' });
  await editar(cmPage, 'huer1', { nombre: 'Cuenta borrada 2' });
  await editar(cmPage, 'amor1', { nombre: 'Amorcito 2' });
  expect(await txn(cmPage, 'sin1')).toMatchObject({ name: 'Sin cuenta 2', amount: 300 });
  expect((await txn(cmPage, 'sin1')).accountId || '').toBe('');
  expect(await txn(cmPage, 'huer1')).toMatchObject({ name: 'Cuenta borrada 2', accountId: 'borrada' });
  expect(await txn(cmPage, 'amor1')).toMatchObject({ name: 'Amorcito 2', accountId: 'prestamos_amorcito' });
  expect(await cmPage.evaluate(() => S.accounts.map((a) => [a.id, a.balance]))).toEqual(antes);
});

test('f) un gasto materializado de tarjeta no se borra ni se edita desde Actividad y no toca saldos', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => {
    S.transactions.push({ id: 'tc1', type: 'expense', name: 'Compra tarjeta', amount: 5000, date: '2026-10-12', currency: 'ARS', category: '', cardChargeId: 'ch1' });
    window.confirm = () => true;
  });
  const antes = await cmPage.evaluate(() => S.accounts.map((a) => [a.id, a.balance]));
  await cmPage.evaluate(() => deleteTransaction('tc1'));
  await expect(cmPage.locator('#toast')).toContainText('Este gasto viene de una compra con tarjeta');
  expect(await cmPage.evaluate(() => S.transactions.some((t) => t.id === 'tc1'))).toBe(true);
  // Editarlo está bloqueado (specs en gasto-tarjeta-edicion.spec.js): el modal no abre y nada cambia.
  await cmPage.evaluate(() => openEditTxn('tc1'));
  await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  expect(await txn(cmPage, 'tc1')).toMatchObject({ name: 'Compra tarjeta', cardChargeId: 'ch1', amount: 5000 });
  expect((await txn(cmPage, 'tc1')).accountId || '').toBe('');
  expect(await cmPage.evaluate(() => S.accounts.map((a) => [a.id, a.balance]))).toEqual(antes);
});

test('g) descuentos: nombre, categoría y cuenta conservan discountPct y amountOriginal; cambiar el monto los borra', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => {
    S.transactions.push({ id: 'd1', type: 'expense', name: 'Con descuento', amount: 8000, date: '2026-10-12', currency: 'ARS', category: '', accountId: 'efe', discountPct: 20, amountOriginal: 10000 });
    S.accounts.find((a) => a.id === 'efe').balance = 42000;
    txnActiveMonth = '2026-10'; renderActivity(); renderFinanzasTab();
  });
  await editar(cmPage, 'd1', { nombre: 'Con descuento 2' });
  expect(await txn(cmPage, 'd1')).toMatchObject({ name: 'Con descuento 2', amount: 8000, accountId: 'efe', discountPct: 20, amountOriginal: 10000 });
  expect(await saldo(cmPage, 'efe')).toBe(42000);
  await editar(cmPage, 'd1', { cuenta: 'uala' });
  expect(await txn(cmPage, 'd1')).toMatchObject({ accountId: 'uala', discountPct: 20, amountOriginal: 10000 });
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect(await saldo(cmPage, 'uala')).toBe(992000);
  await editar(cmPage, 'd1', { cuenta: 'efe', monto: 7000 });
  const t = await txn(cmPage, 'd1');
  expect(t).toMatchObject({ amount: 7000, accountId: 'efe' });
  expect(t).not.toHaveProperty('discountPct');
  expect(t).not.toHaveProperty('amountOriginal');
  expect(await saldo(cmPage, 'efe')).toBe(43000);
  expect(await saldo(cmPage, 'uala')).toBe(1000000);
});
