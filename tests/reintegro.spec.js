// Reintegro: muchas veces el descuento no baja el precio sino que te devuelven un % en una cuenta.
// Pagás el TOTAL (cuotas y límite usan el total) y entra un ingreso aparte a la cuenta elegida.
// El descuento en el precio sigue igual (lo cubre descuentos.spec.js).
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna cuenta ni tarjeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const HOY = '2026-10-27';
const BASE_UALA = 1000000;

async function preparar(page, { hoy = HOY } = {}) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, base }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: base, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
      { id: 'usd', name: 'Dólares', type: 'bank', balance: 10, currency: 'USD', icon: '💵' },
    ];
    S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' }];
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
    const n = new Date();
    txnActiveMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;   // el gasto común usa el mes real
    renderFinanzasTab();
  }, { hoy, base: BASE_UALA });
}

const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const cargos = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.cardCharges)));
const txns = (page) => page.evaluate(() => S.transactions.map((t) => ({ ...t })));
const ingresosReintegro = (page) => page.evaluate(() => S.transactions.filter((t) => t.refundOf).map((t) => ({ ...t })));
const usado = (page) => page.evaluate(() => cardUsed(S.cards[0]));
const numRe = (n) => new RegExp(String(n).replace(/\B(?=(\d{3})+$)/g, '[.,]?'));
const pctChip = (page, pct) => page.locator('#txnDiscount').getByRole('radio', { name: `${pct}%`, exact: true });
const tipo = (page, nombre) => page.locator('#txnDiscKind').getByRole('radio', { name: nombre, exact: true });
const PRECIO = 'Descuento en el precio';
const REINTEGRO = 'Reintegro a una cuenta';

async function abrirMovimiento(page, t) {
  await cerrarTarjetas(page);
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
  if (t) await page.selectOption('#txnType', t);
}

// Gasto sin tarjeta con reintegro (pct opcional: sin pct no toca el selector).
async function gastoComun(page, { nombre = 'Cena', monto, cuenta = 'uala', pct = 25, reintegro = true, cuentaReintegro } = {}) {
  await abrirMovimiento(page, 'expense');
  await page.fill('#txnName', nombre);
  await page.fill('#txnAmount', String(monto));
  await page.selectOption('#txnCurrency', 'ARS');
  await page.selectOption('#txnAccount', cuenta);
  await pctChip(page, pct).click();
  if (reintegro) await tipo(page, REINTEGRO).click();
  if (cuentaReintegro) await page.selectOption('#txnRefundAcc', cuentaReintegro);
  await page.click('#modal-add-txn button:has-text("Registrar")');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
}

// Naranja, 41.000, 3 cuotas, 25% de reintegro (el caso del pedido).
async function compraNaranja(page, { nombre = 'Zapatillas', cuentaReintegro, reintegro = true, pct = 25 } = {}) {
  await abrirCompraDesdeMovimientos(page);
  await llenarCompra(page, { monto: 41000, nombre, fecha: '2026-10-15', modo: 'nowInst', cuotas: 3 });
  await pctChip(page, pct).click();
  if (reintegro) await tipo(page, REINTEGRO).click();
  if (cuentaReintegro) await page.selectOption('#txnRefundAcc', cuentaReintegro);
  await guardarCompra(page);
}

test('1) al elegir un % aparece el selector de dos opciones (descuento en el precio por defecto) y, con reintegro, la cuenta con la de pago de la tarjeta', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await expect(cmPage.locator('#txnDiscKind')).toBeHidden();
  await pctChip(cmPage, 25).click();
  const grupo = cmPage.locator('#txnDiscKind');
  await expect(grupo).toBeVisible();
  await expect(grupo).toHaveAttribute('role', 'radiogroup');
  await expect(grupo.getByRole('radio')).toHaveCount(2);
  await expect(tipo(cmPage, PRECIO)).toHaveAttribute('aria-checked', 'true');
  await expect(tipo(cmPage, REINTEGRO)).toHaveAttribute('aria-checked', 'false');
  await expect(cmPage.locator('#txnRefundAccRow')).toBeHidden();

  await tipo(cmPage, REINTEGRO).click();
  await expect(tipo(cmPage, REINTEGRO)).toHaveAttribute('aria-checked', 'true');
  await expect(cmPage.locator('#txnRefundAccRow')).toBeVisible();
  await expect(cmPage.locator('label[for="txnRefundAcc"]')).toHaveText('Cuenta donde entra el reintegro');
  await expect(cmPage.locator('#txnRefundAcc')).toHaveValue('uala');   // la cuenta de pago de la tarjeta
  const opciones = await cmPage.locator('#txnRefundAcc option').evaluateAll((os) => os.map((o) => o.value));
  expect(opciones).toEqual(['', 'uala', 'efe']);   // solo cuentas en pesos

  // Con el teclado: las flechas mueven y eligen.
  await tipo(cmPage, REINTEGRO).focus();
  await cmPage.keyboard.press('ArrowLeft');
  await expect(tipo(cmPage, PRECIO)).toHaveAttribute('aria-checked', 'true');
  await expect(cmPage.locator('#txnRefundAccRow')).toBeHidden();

  // "Sin descuento" borra todo.
  await tipo(cmPage, REINTEGRO).click();
  await cmPage.locator('#txnDiscount').getByRole('radio', { name: 'Sin descuento', exact: true }).click();
  await expect(cmPage.locator('#txnDiscKind')).toBeHidden();
  await expect(cmPage.locator('#txnRefundAccRow')).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('2) Naranja, 41.000, 3 cuotas, 25% de reintegro: cuotas y crédito por el total, ingreso de 10.250 y saldo +10.250', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);

  const [ch] = await cargos(cmPage);
  expect(ch).toMatchObject({ cardId: 'nar', amount: 41000, mode: 'nowInst', installments: 3, name: 'Zapatillas' });
  expect(ch.refund).toEqual({ pct: 25, amount: 10250, accountId: 'uala', txnId: `rf:${ch.id}` });
  expect(ch.discountPct).toBeUndefined();
  expect(ch.amountOriginal).toBeUndefined();

  // Cuotas por el total (41.000 en 3 cuotas con el redondeo del motor).
  const cuotas = await cmPage.evaluate(() => CMTarjetas.installmentSchedule(S.cards[0], S.cardCharges[0]).map((q) => q.amount));
  expect(cuotas).toHaveLength(3);
  expect(Math.round(cuotas.reduce((s, x) => s + x, 0) * 100)).toBe(4100000);
  expect(cuotas[0]).toBeGreaterThan(13666);
  expect(cuotas[0]).toBeLessThan(13667);

  // Crédito usado por el total; el gasto de la compra también.
  expect(await usado(cmPage)).toBe(41000);
  const gasto = (await txns(cmPage)).filter((t) => t.cardChargeId);
  expect(gasto).toHaveLength(1);
  expect(gasto[0]).toMatchObject({ type: 'expense', amount: 41000 });

  // Ingreso de reintegro y saldo.
  const ing = await ingresosReintegro(cmPage);
  expect(ing).toHaveLength(1);
  expect(ing[0]).toMatchObject({ id: `rf:${ch.id}`, type: 'income', name: 'Reintegro 25% · Zapatillas', amount: 10250, currency: 'ARS', accountId: 'uala', date: '2026-10-15', refundOf: ch.id });
  expect(ing[0].cardChargeId).toBeUndefined();
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA + 10250);
  expect(consoleErrors).toEqual([]);
});

test('3) cuenta de reintegro distinta a la sugerida: el ingreso y el saldo van a la elegida', async ({ cmPage }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage, { cuentaReintegro: 'efe' });
  const [ch] = await cargos(cmPage);
  expect(ch.refund.accountId).toBe('efe');
  expect((await ingresosReintegro(cmPage))[0].accountId).toBe('efe');
  expect(await saldo(cmPage, 'efe')).toBe(60250);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
});

test('4) la vista previa dice "Pagás $41.000 · te devuelven $10.250 en Ualá" y las cuotas usan el total', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 41000, nombre: 'Zapatillas', fecha: '2026-10-15', modo: 'nowInst', cuotas: 3 });
  await pctChip(cmPage, 25).click();
  await tipo(cmPage, REINTEGRO).click();
  await expect(cmPage.locator('#txnDiscountPreview')).toHaveText(/Pagás \$41[.,]?000 · te devuelven \$10[.,]?250 en Ualá/);
  await expect(cmPage.locator('#ccChPreview')).toContainText('Cuota 1 de 3');
  await expect(cmPage.locator('#ccChPreview')).toContainText(/13[.,]666/);
  // Con descuento en el precio, el texto de siempre.
  await tipo(cmPage, PRECIO).click();
  await expect(cmPage.locator('#txnDiscountPreview')).toContainText('pagás');
  await expect(cmPage.locator('#txnDiscountPreview')).not.toContainText('te devuelven');
});

test('5) gasto común + reintegro: el gasto sale por el total y entra el ingreso ligado con refundOf', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await gastoComun(cmPage, { nombre: 'Cena', monto: 10000, cuenta: 'uala' });
  const lista = await txns(cmPage);
  const gasto = lista.find((t) => t.type === 'expense');
  const ing = lista.find((t) => t.refundOf);
  expect(gasto).toMatchObject({ name: 'Cena', amount: 10000, accountId: 'uala' });
  expect(gasto.discountPct).toBeUndefined();
  expect(gasto.refund).toEqual({ pct: 25, amount: 2500, accountId: 'uala', txnId: `rf:${gasto.id}` });
  expect(ing).toMatchObject({ id: `rf:${gasto.id}`, type: 'income', name: 'Reintegro 25% · Cena', amount: 2500, currency: 'ARS', accountId: 'uala', refundOf: gasto.id, date: gasto.date });
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA - 10000 + 2500);
  expect(consoleErrors).toEqual([]);
});

test('6) gasto común: la cuenta sugerida es la del gasto y se puede cambiar', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage, 'expense');
  await cmPage.fill('#txnAmount', '10000');
  await cmPage.selectOption('#txnCurrency', 'ARS');
  await cmPage.selectOption('#txnAccount', 'efe');
  await pctChip(cmPage, 20).click();
  await tipo(cmPage, REINTEGRO).click();
  await expect(cmPage.locator('#txnRefundAcc')).toHaveValue('efe');
  await cmPage.selectOption('#txnAccount', 'uala');   // sin haber tocado la cuenta de reintegro, la sugerida acompaña
  await expect(cmPage.locator('#txnRefundAcc')).toHaveValue('uala');
  await cmPage.selectOption('#txnRefundAcc', 'efe');  // ya elegida a mano: no se pisa
  await cmPage.selectOption('#txnAccount', 'efe');
  await cmPage.selectOption('#txnAccount', 'uala');
  await expect(cmPage.locator('#txnRefundAcc')).toHaveValue('efe');
});

test('7) sin cuenta de reintegro elegida no se guarda (aviso) y en otra moneda o en otro mes la opción no se ofrece', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage, 'expense');
  await cmPage.fill('#txnName', 'Algo');
  await cmPage.fill('#txnAmount', '1000');
  await cmPage.selectOption('#txnCurrency', 'ARS');
  await cmPage.selectOption('#txnAccount', '');   // sin cuenta de gasto: no hay sugerida
  await pctChip(cmPage, 10).click();
  await tipo(cmPage, REINTEGRO).click();
  await expect(cmPage.locator('#txnRefundAcc')).toHaveValue('');
  await cmPage.click('#modal-add-txn button:has-text("Registrar")');
  await expect(cmPage.locator('#toast')).toContainText('Elegí la cuenta donde entra el reintegro');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  expect(await txns(cmPage)).toHaveLength(0);

  // En dólares no se ofrece (el reintegro entra en pesos).
  await cmPage.selectOption('#txnCurrency', 'USD');
  await expect(cmPage.locator('#txnDiscKind')).toBeHidden();
  await expect(cmPage.locator('#txnRefundAccRow')).toBeHidden();
  await cmPage.selectOption('#txnCurrency', 'ARS');
  await expect(cmPage.locator('#txnDiscKind')).toBeVisible();

  // Mes futuro (el gasto queda pendiente): la opción no se ofrece, queda el descuento en el precio.
  await cmPage.evaluate(() => { const n = new Date(); txnActiveMonth = `${n.getFullYear() + 1}-01`; });
  await cmPage.selectOption('#txnAccount', 'uala');
  await expect(cmPage.locator('#txnDiscKind')).toBeHidden();
  await cmPage.click('#modal-add-txn button:has-text("Registrar")');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  const lista = await txns(cmPage);
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({ pending: true, discountPct: 10, amount: 900 });
  expect(lista[0].refund).toBeUndefined();
  expect(await ingresosReintegro(cmPage)).toHaveLength(0);
});

test('8) borrar la compra con tarjeta quita el reintegro y devuelve el saldo; el confirm lo avisa', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  const [ch] = await cargos(cmPage);
  let mensaje = '';
  cmPage.once('dialog', (d) => { mensaje = d.message(); d.accept(); });
  await cmPage.evaluate((id) => deleteCardCharge(id), ch.id);
  expect(mensaje).toMatch(/También se quita el reintegro de \$10[.,]?250 de Ualá/);
  expect(await cargos(cmPage)).toHaveLength(0);
  expect(await txns(cmPage)).toHaveLength(0);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
  expect(await usado(cmPage)).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('9) borrar el gasto común quita el reintegro (confirm avisa) y el deshacer restaura los dos', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await gastoComun(cmPage, { nombre: 'Cena', monto: 10000 });
  const gasto = (await txns(cmPage)).find((t) => t.type === 'expense');
  let mensaje = '';
  cmPage.once('dialog', (d) => { mensaje = d.message(); d.accept(); });
  await cmPage.evaluate((id) => deleteTransaction(id), gasto.id);
  expect(mensaje).toContain('¿Eliminar este movimiento?');
  expect(mensaje).toMatch(/También se quita el reintegro de \$2[.,]?500 de Ualá/);
  expect(await txns(cmPage)).toHaveLength(0);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);

  await cmPage.evaluate(() => { CMUndo.deshacerUltimo(); });
  const lista = await txns(cmPage);
  expect(lista.map((t) => t.id).sort()).toEqual([gasto.id, `rf:${gasto.id}`].sort());
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA - 10000 + 2500);
  expect(consoleErrors).toEqual([]);
});

test('10) editar la compra: precarga reintegro, % y cuenta; al guardar con otros datos no duplica y los saldos cierran', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  const [orig] = await cargos(cmPage);

  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Editar compra');
  await expect(cmPage.locator('#txnAmount')).toHaveValue('41000');
  await expect(pctChip(cmPage, 25)).toHaveAttribute('aria-checked', 'true');
  await expect(tipo(cmPage, REINTEGRO)).toHaveAttribute('aria-checked', 'true');
  await expect(cmPage.locator('#txnRefundAcc')).toHaveValue('uala');

  // Mismo reintegro, sin cambios: no se duplica y el saldo no se mueve.
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  expect(await ingresosReintegro(cmPage)).toHaveLength(1);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA + 10250);

  // Cambia a 50% y a Efectivo: se revierte el viejo y se aplica el nuevo.
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await pctChip(cmPage, 50).click();
  await expect(tipo(cmPage, REINTEGRO)).toHaveAttribute('aria-checked', 'true');
  await cmPage.selectOption('#txnRefundAcc', 'efe');
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  const [ch] = await cargos(cmPage);
  expect(ch).toMatchObject({ id: orig.id, amount: 41000 });
  expect(ch.refund).toEqual({ pct: 50, amount: 20500, accountId: 'efe', txnId: `rf:${orig.id}` });
  const ing = await ingresosReintegro(cmPage);
  expect(ing).toHaveLength(1);
  expect(ing[0]).toMatchObject({ name: 'Reintegro 50% · Zapatillas', amount: 20500, accountId: 'efe' });
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
  expect(await saldo(cmPage, 'efe')).toBe(50000 + 20500);
  expect(await usado(cmPage)).toBe(41000);

  // Pasa a "descuento en el precio": desaparece el reintegro y el cargo baja al final.
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await tipo(cmPage, PRECIO).click();
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  const [ch2] = await cargos(cmPage);
  expect(ch2).toMatchObject({ amount: 20500, discountPct: 50, amountOriginal: 41000 });
  expect(ch2.refund).toBeUndefined();
  expect(await ingresosReintegro(cmPage)).toHaveLength(0);
  expect(await saldo(cmPage, 'efe')).toBe(50000);

  // Y de vuelta a reintegro desde cero: una sola vez.
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await tipo(cmPage, REINTEGRO).click();
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  expect(await ingresosReintegro(cmPage)).toHaveLength(1);
  expect((await cargos(cmPage))[0].amount).toBe(41000);
  expect(consoleErrors).toEqual([]);
});

test('11) Movimientos: el gasto muestra "reintegro 25%" con su aria-label, el ingreso su nombre normal y el lápiz del ingreso abre la compra', async ({ cmPage }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  await gastoComun(cmPage, { nombre: 'Cena', monto: 10000, cuenta: 'efe', cuentaReintegro: 'efe' });
  await cmPage.evaluate(() => { renderActivity(); });

  const filaCompra = cmPage.locator('#activityList .activity-row', { hasText: 'Zapatillas' }).filter({ hasNotText: /Reintegro \d+% ·/ });
  const tag = filaCompra.locator('.disc-tag.disc-tag-refund');
  await expect(tag).toHaveText('reintegro 25%');
  await expect(tag).toHaveAttribute('aria-label', /^Con reintegro de \$10[.,]?250 a Ualá$/);

  const filaComun = cmPage.locator('#activityList .activity-row', { hasText: 'Cena' }).filter({ hasNotText: /Reintegro \d+% ·/ });
  await expect(filaComun.locator('.disc-tag-refund')).toHaveAttribute('aria-label', /^Con reintegro de \$2[.,]?500 a Efectivo$/);

  const filaIngreso = cmPage.locator('#activityList .activity-row', { hasText: 'Reintegro 25% · Zapatillas' });
  await expect(filaIngreso).toHaveCount(1);
  await expect(filaIngreso.locator('.disc-tag')).toHaveCount(0);
  await expect(filaIngreso.locator('.act-amount')).toContainText(numRe(10250));

  // Editar el ingreso abre la compra de origen (no se edita suelto).
  await filaIngreso.locator('button[title="Editar"]').dispatchEvent('click');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Editar compra');
  await expect(cmPage.locator('#txnAmount')).toHaveValue('41000');
  await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  await cmPage.click('#modal-add-txn button:has-text("Cancelar")');

  // Y el ingreso del gasto común abre el gasto de origen.
  await cmPage.evaluate(() => { openEditTxn('rf:' + S.transactions.find((t) => t.type === 'expense' && !t.cardChargeId).id); });
  await expect(cmPage.locator('#modal-edit-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#editTxnName')).toHaveValue('Cena');
});

test('12) el gasto común con reintegro no cambia de monto en la edición, pero sí de nombre', async ({ cmPage }) => {
  await preparar(cmPage);
  await gastoComun(cmPage, { nombre: 'Cena', monto: 10000 });
  const gasto = (await txns(cmPage)).find((t) => t.type === 'expense');
  await cmPage.evaluate((id) => openEditTxn(id), gasto.id);
  await cmPage.fill('#editTxnAmount', '12000');
  await cmPage.click('#modal-edit-txn button:has-text("Guardar")');
  await expect(cmPage.locator('#toast')).toContainText('Este gasto tiene reintegro');
  expect((await txns(cmPage)).find((t) => t.id === gasto.id).amount).toBe(10000);
  await cmPage.fill('#editTxnAmount', '10000');
  await cmPage.fill('#editTxnName', 'Cena grande');
  await cmPage.click('#modal-edit-txn button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  expect((await txns(cmPage)).find((t) => t.id === gasto.id).name).toBe('Cena grande');
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA - 10000 + 2500);
});

test('13) multi-dispositivo: re-renderizar y recalcular los gastos de tarjeta no duplica ni el gasto ni el reintegro', async ({ cmPage }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  await cmPage.evaluate(() => {
    for (let i = 0; i < 3; i++) { materializeCardExpenses(); cardsCatchUp(); renderFinanzasTab(); renderActivity(); }
  });
  const lista = await txns(cmPage);
  expect(lista.filter((t) => t.refundOf)).toHaveLength(1);
  expect(lista.filter((t) => t.cardChargeId)).toHaveLength(1);
  expect(new Set(lista.map((t) => t.id)).size).toBe(lista.length);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA + 10250);
});

test('14) a 375px el formulario con reintegro no desborda', async ({ cmPage }) => {
  await cmPage.setViewportSize({ width: 375, height: 800 });
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await pctChip(cmPage, 25).click();
  await tipo(cmPage, REINTEGRO).click();
  await expect(cmPage.locator('#txnRefundAccRow')).toBeVisible();
  const medidas = await cmPage.evaluate(() => {
    const m = document.querySelector('#modal-add-txn .modal');
    const r = m.getBoundingClientRect();
    const fuera = [...m.querySelectorAll('#txnDiscountRow *')].filter((e) => e.getBoundingClientRect().right > r.right + 1).map((e) => e.id || e.textContent.slice(0, 20));
    return { sw: m.scrollWidth, cw: m.clientWidth, fuera, doc: document.documentElement.scrollWidth };
  });
  expect(medidas.sw).toBeLessThanOrEqual(medidas.cw);
  expect(medidas.fuera).toEqual([]);
  expect(medidas.doc).toBeLessThanOrEqual(375);
});
