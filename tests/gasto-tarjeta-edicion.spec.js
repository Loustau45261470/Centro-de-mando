// Los gastos que genera una compra con tarjeta (cc:<cargo>:<mes>, con cardChargeId) no se editan desde Actividad:
// si se cambiara el monto o la cuenta dejarían de coincidir con el cargo y el saldo se descontaría dos veces.
// Además, la lista de Movimientos muestra la etiqueta "−NN%" de esos gastos tomando el descuento del cargo.
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna cuenta ni tarjeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const AVISO = 'Este gasto viene de una compra con tarjeta. Para cambiarlo, borrá la compra en Tarjetas y cargala de nuevo.';

async function preparar(page, hoy = '2026-10-15') {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate((hoy) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
    ];
    S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' }];
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
    renderFinanzasTab();
  }, hoy);
}

const irA = (page, hoy) => page.evaluate((h) => { window.getActiveDate = () => h; renderFinanzasTab(); }, hoy);
const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const gastosTarjeta = (page) => page.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => ({ ...t })));
const snapshot = (page) => page.evaluate(() => JSON.stringify({ t: S.transactions, a: S.accounts, c: S.cardCharges, p: S.cardPayments }));

async function cargarCompra(page, c, pct) {
  await abrirCompraDesdeMovimientos(page);
  await llenarCompra(page, c);
  if (pct) await page.locator('#txnDiscount').getByRole('radio', { name: `${pct}%`, exact: true }).click();
  await guardarCompra(page);
}

// Intenta guardar la edición de un movimiento sin pasar por el modal: carga los campos del modal y llama a saveEditTxn.
const guardarEdicionDirecta = (page, id, { monto, cuenta }) => page.evaluate(({ id, monto, cuenta }) => {
  const t = S.transactions.find((x) => x.id === id);
  document.getElementById('editTxnId').value = id;
  document.getElementById('editTxnName').value = t.name;
  document.getElementById('editTxnType').value = t.type;
  document.getElementById('editTxnAmount').value = String(monto);
  document.getElementById('editTxnCurrency').value = t.currency;
  document.getElementById('editTxnAccount').innerHTML = '<option value="uala">Ualá</option><option value="">—</option>';
  document.getElementById('editTxnAccount').value = cuenta;
  saveEditTxn();
}, { id, monto, cuenta });

test('1) editar un gasto de tarjeta no abre el modal de edición común: abre la compra en el formulario de alta y no cambia nada hasta guardar', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCompra(cmPage, { monto: 5000, nombre: 'Compra tarjeta' });
  const g = (await gastosTarjeta(cmPage))[0];
  expect(g.id).toMatch(/^cc:.+:2026-10$/);
  const antes = await snapshot(cmPage);

  await cmPage.evaluate((id) => openEditTxn(id), g.id);
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Editar compra');
  await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  expect(await snapshot(cmPage)).toBe(antes);
  await cmPage.click('#modal-add-txn button:has-text("Cancelar")');

  // También con el lápiz de la lista de Movimientos.
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
  await cmPage.locator('#activityList .activity-row', { hasText: 'Compra tarjeta' }).locator('button[title="Editar"]').dispatchEvent('click');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  expect(await snapshot(cmPage)).toBe(antes);
  expect(consoleErrors).toEqual([]);
});

test('2) saveEditTxn con el id de un gasto de tarjeta no cambia nada (gasto, saldos, cargo, pagos)', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargarCompra(cmPage, { monto: 5000, nombre: 'Compra tarjeta' });
  const g = (await gastosTarjeta(cmPage))[0];
  const antes = await snapshot(cmPage);
  await guardarEdicionDirecta(cmPage, g.id, { monto: 9999, cuenta: 'uala' });
  expect(await snapshot(cmPage)).toBe(antes);
  await expect(cmPage.locator('#toast')).toContainText(AVISO);
  expect(await saldo(cmPage, 'uala')).toBe(500000);
});

test('3) tras el bloqueo, pagar la cuota deja el saldo correcto (500.000 - 5.000 = 495.000)', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargarCompra(cmPage, { monto: 5000, nombre: 'Compra tarjeta' });
  const g = (await gastosTarjeta(cmPage))[0];
  await guardarEdicionDirecta(cmPage, g.id, { monto: 9999, cuenta: 'uala' });
  expect(await saldo(cmPage, 'uala')).toBe(500000);
  expect(await cmPage.evaluate(() => S.cardCharges[0].amount)).toBe(5000);
  await irA(cmPage, '2026-11-10');
  expect(await cmPage.evaluate(() => S.cardPayments.map((p) => p.amount))).toEqual([5000]);
  expect(await saldo(cmPage, 'uala')).toBe(495000);
  const g2 = (await gastosTarjeta(cmPage))[0];
  expect(g2).toMatchObject({ id: g.id, amount: 5000 });
  expect(g2.accountId || null).toBeNull();
});

test('4) un gasto normal, un ingreso y un gasto en efectivo siguen editándose igual', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => {
    S.transactions.push(
      { id: 'g1', type: 'expense', name: 'Gasto', amount: 1000, date: '2026-10-12', currency: 'ARS', category: '', accountId: 'uala' },
      { id: 'i1', type: 'income', name: 'Ingreso', amount: 2000, date: '2026-10-12', currency: 'ARS', category: '', accountId: 'uala' },
      { id: 'e1', type: 'expense', name: 'Efectivo', amount: 300, date: '2026-10-12', currency: 'ARS', category: '', accountId: 'efe' },
      { id: 'p1', type: 'expense', name: 'Programado', amount: 700, date: '2026-12-01', currency: 'ARS', category: '', accountId: 'uala', pending: true },
    );
    S.accounts.find((a) => a.id === 'uala').balance = 500000 - 1000 + 2000;
    S.accounts.find((a) => a.id === 'efe').balance = 50000 - 300;
    txnActiveMonth = '2026-10'; renderActivity(); renderFinanzasTab();
  });
  const editar = async (id, cambios) => {
    await cmPage.evaluate((i) => openEditTxn(i), id);
    await expect(cmPage.locator('#modal-edit-txn')).toHaveClass(/open/);
    if (cambios.nombre !== undefined) await cmPage.fill('#editTxnName', cambios.nombre);
    if (cambios.monto !== undefined) await cmPage.fill('#editTxnAmount', String(cambios.monto));
    if (cambios.cuenta !== undefined) await cmPage.selectOption('#editTxnAccount', cambios.cuenta);
    await cmPage.click('#modal-edit-txn button:has-text("Guardar")');
    await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  };
  const t = (id) => cmPage.evaluate((i) => ({ ...S.transactions.find((x) => x.id === i) }), id);

  await editar('g1', { monto: 1500 });
  expect(await t('g1')).toMatchObject({ amount: 1500, accountId: 'uala' });
  expect(await saldo(cmPage, 'uala')).toBe(500000 - 1500 + 2000);
  await editar('i1', { monto: 2500, cuenta: 'efe' });
  expect(await t('i1')).toMatchObject({ amount: 2500, accountId: 'efe' });
  expect(await saldo(cmPage, 'uala')).toBe(500000 - 1500);
  expect(await saldo(cmPage, 'efe')).toBe(50000 - 300 + 2500);
  await editar('e1', { monto: 400, nombre: 'Efectivo 2' });
  expect(await t('e1')).toMatchObject({ amount: 400, name: 'Efectivo 2', accountId: 'efe' });
  expect(await saldo(cmPage, 'efe')).toBe(50000 - 400 + 2500);
  await editar('p1', { nombre: 'Programado 2' });
  expect(await t('p1')).toMatchObject({ name: 'Programado 2', pending: true, amount: 700 });
  expect(await saldo(cmPage, 'uala')).toBe(500000 - 1500);
  await expect(cmPage.locator('#toast')).not.toContainText('compra con tarjeta');
  expect(consoleErrors).toEqual([]);
});

test('5) la lista de Movimientos muestra "−NN%" en los gastos de una compra con descuento (también en cada mes de una diferida)', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargarCompra(cmPage, { monto: 50000, nombre: 'Con descuento' }, 20);
  await cargarCompra(cmPage, { monto: 3000, nombre: 'Sin descuento' });
  const g = (await gastosTarjeta(cmPage)).find((x) => x.name === 'Con descuento');
  expect(g).not.toHaveProperty('discountPct');   // materializeCardExpenses no se toca: el descuento se lee del cargo
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
  const conDesc = cmPage.locator('#activityList .activity-row', { hasText: 'Con descuento' });
  const tag = conDesc.getByRole('img', { name: 'Compra de $50.000 con descuento 20%' });
  await expect(tag).toHaveText('−20%');
  await expect(tag).toHaveAttribute('title', 'Compra de $50.000 con descuento 20%');
  await expect(conDesc.locator('.act-amount')).toContainText(/40[.,]000/);
  await expect(cmPage.locator('#activityList .activity-row', { hasText: 'Sin descuento' }).locator('.disc-tag')).toHaveCount(0);

  // Diferida con descuento: una etiqueta por cada mes materializado, con el total de la compra completa.
  await preparar(cmPage);
  await cargarCompra(cmPage, { monto: 90000, nombre: 'Diferida', modo: 'deferred', cuotas: 3, meses: 5 }, 20);
  await irA(cmPage, '2027-03-01');
  for (const mes of ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']) {
    await cmPage.evaluate((k) => { txnActiveMonth = k; renderActivity(); }, mes);
    const fila = cmPage.locator('#activityList .activity-row', { hasText: 'Diferida' });
    await expect(fila, mes).toHaveCount(1);
    await expect(fila.getByRole('img', { name: 'Compra de $90.000 con descuento 20%' }), mes).toHaveText('−20%');
  }

  // Cargo que ya no existe o sin descuento: sin etiqueta y sin errores.
  await cmPage.evaluate(() => {
    S.transactions.push({ id: 'cc:fantasma:2027-02', date: '2027-02-10', name: 'Huérfano', type: 'expense', amount: 10, currency: 'ARS', accountId: null, category: '', cardChargeId: 'fantasma' });
    txnActiveMonth = '2027-02'; renderActivity();
  });
  await expect(cmPage.locator('#activityList .activity-row', { hasText: 'Huérfano' })).toHaveCount(1);
  await expect(cmPage.locator('#activityList .activity-row', { hasText: 'Huérfano' }).locator('.disc-tag')).toHaveCount(0);
});

test('6) el botón de borrar de un gasto de tarjeta sigue bloqueado con su aviso', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargarCompra(cmPage, { monto: 5000, nombre: 'Compra tarjeta' });
  const g = (await gastosTarjeta(cmPage))[0];
  await cmPage.evaluate(() => { window.confirm = () => true; });
  await cmPage.evaluate((id) => deleteTransaction(id), g.id);
  await expect(cmPage.locator('#toast')).toContainText('Este gasto viene de una compra con tarjeta. Borralo desde la compra en Tarjetas.');
  expect(await gastosTarjeta(cmPage)).toHaveLength(1);
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('7) con la etiqueta en un gasto de tarjeta y el aviso no hay scroll horizontal ni errores de consola', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage);
    await cargarCompra(cmPage, { monto: 123456.78, nombre: 'Compra con un nombre bastante largo para probar el ajuste de línea' }, 25);
    const g = (await gastosTarjeta(cmPage))[0];
    await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
    await expect(cmPage.locator('#activityList .disc-tag')).toBeVisible();
    // Con una cuota ya pagada la compra no se edita y el aviso se ve (también en pantalla angosta).
    await irA(cmPage, '2026-11-10');
    await cmPage.evaluate((id) => openEditTxn(id), g.id);
    await expect(cmPage.locator('#toast')).toContainText('Esta compra ya tiene cuotas pagadas: no se puede editar.');
    const pg = await cmPage.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(pg.sw).toBeLessThanOrEqual(pg.cw + 1);
    expect(consoleErrors).toEqual([]);
  });
});
