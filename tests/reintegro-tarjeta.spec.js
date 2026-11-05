// Reintegro que entra A LA TARJETA (en vez de a una cuenta): baja el Usado como un pago manual (kind:'refund'), se imputa a los
// vencimientos con el arrastre de pendingDues, no mueve ninguna cuenta y sigue contando como ingreso de reintegro.
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
    ];
    S.cards = [
      { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' },
      { id: 'mp', name: 'Mercado Pago', limit: 500000, closeDay: 5, dueDay: 10, openingUsed: 0, payAccountId: 'uala' },
    ];
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.cardDues = []; S.moves = [];
    const n = new Date();
    txnActiveMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;   // el gasto común usa el mes real
    renderFinanzasTab();
  }, { hoy, base: BASE_UALA });
}

const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const cargos = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.cardCharges)));
const txns = (page) => page.evaluate(() => S.transactions.map((t) => ({ ...t })));
const ingresos = (page) => page.evaluate(() => S.transactions.filter((t) => t.refundOf).map((t) => ({ ...t })));
const pagos = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.cardPayments)));
const usado = (page, id = 'nar') => page.evaluate((i) => cardUsed(S.cards.find((c) => c.id === i)), id);
const pendiente = (page, id = 'nar') => page.evaluate((i) => {
  const c = S.cards.find((x) => x.id === i);
  return CMTarjetas.pendingDues(c, S.cardCharges, '1900-01-01', '2999-12-31', S.cardDues, S.cardPayments).map((d) => [d.dueDate, d.amount]);
}, id);
const sumaPendiente = async (page, id) => Math.round((await pendiente(page, id)).reduce((s, [, a]) => s + a, 0) * 100) / 100;
const pctChip = (page, pct) => page.locator('#txnDiscount').getByRole('radio', { name: `${pct}%`, exact: true });
const tipo = (page, nombre) => page.locator('#txnDiscKind').getByRole('radio', { name: nombre, exact: true });
const REINTEGRO = 'Reintegro a una cuenta';

async function abrirMovimiento(page, t) {
  await cerrarTarjetas(page);
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
  if (t) await page.selectOption('#txnType', t);
}

// Naranja, 41.000, 3 cuotas, 25% de reintegro (10.250). destino = valor del selector (por defecto, la tarjeta Naranja).
async function compraNaranja(page, { nombre = 'Zapatillas', destino = 'card:nar' } = {}) {
  await abrirCompraDesdeMovimientos(page);
  await llenarCompra(page, { monto: 41000, nombre, fecha: '2026-10-15', modo: 'nowInst', cuotas: 3 });
  await pctChip(page, 25).click();
  await tipo(page, REINTEGRO).click();
  await page.selectOption('#txnRefundAcc', destino);
  await guardarCompra(page);
}

async function gastoComun(page, { nombre = 'Cena', monto = 10000, cuenta = 'efe', destino = 'card:nar' } = {}) {
  await abrirMovimiento(page, 'expense');
  await page.fill('#txnName', nombre);
  await page.fill('#txnAmount', String(monto));
  await page.selectOption('#txnAccount', cuenta);
  await page.selectOption('#txnCurrency', 'ARS');
  await pctChip(page, 25).click();
  await tipo(page, REINTEGRO).click();
  await page.selectOption('#txnRefundAcc', destino);
  await page.click('#modal-add-txn button:has-text("Registrar")');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
}

test('1) el selector de destino ofrece las cuentas en pesos y, al final, cada tarjeta', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await pctChip(cmPage, 25).click();
  await tipo(cmPage, REINTEGRO).click();
  await expect(cmPage.locator('label[for="txnRefundAcc"]')).toHaveText('Dónde entra el reintegro');
  const opciones = await cmPage.locator('#txnRefundAcc option').evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()]));
  expect(opciones.map((o) => o[0])).toEqual(['', 'uala', 'efe', 'card:nar', 'card:mp']);
  expect(opciones[3][1]).toMatch(/A la tarjeta Naranja · usado \$0/);
  // Por defecto sigue siendo la cuenta de pago de la tarjeta (no cambia lo de siempre)
  await expect(cmPage.locator('#txnRefundAcc')).toHaveValue('uala');
  await cmPage.selectOption('#txnRefundAcc', 'card:nar');
  await cmPage.fill('#txnAmount', '41000');
  await expect(cmPage.locator('#txnDiscountPreview')).toHaveText(/te devuelven \$10[.,]?250 en la tarjeta Naranja/);
  expect(consoleErrors).toEqual([]);
});

test('2) alta: queda un registro kind:refund en cardPayments, baja el Usado y no mueve ninguna cuenta', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  const [ch] = await cargos(cmPage);
  expect(ch).toMatchObject({ cardId: 'nar', amount: 41000, mode: 'nowInst', installments: 3 });
  expect(ch.refund).toEqual({ pct: 25, amount: 10250, accountId: '', cardId: 'nar', txnId: `rf:${ch.id}` });

  const p = await pagos(cmPage);
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ kind: 'refund', cardId: 'nar', date: '2026-10-15', amount: 10250, refundOf: ch.id, key: `refund:${ch.id}` });
  expect(p[0].accountId).toBeUndefined();   // no sale de ni entra a ninguna cuenta

  expect(await usado(cmPage)).toBe(41000 - 10250);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect(await usado(cmPage, 'mp')).toBe(0);   // la otra tarjeta, intacta
  expect(consoleErrors).toEqual([]);
});

test('3) cuenta igual que un reintegro de siempre: ingreso "Reintegro 25% · …" sin cuenta, que no suma saldo a ninguna', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  const [ch] = await cargos(cmPage);
  const ing = await ingresos(cmPage);
  expect(ing).toHaveLength(1);
  expect(ing[0]).toMatchObject({ id: `rf:${ch.id}`, type: 'income', name: 'Reintegro 25% · Zapatillas', amount: 10250, currency: 'ARS', accountId: '', category: '', refundOf: ch.id, refundCardId: 'nar', date: '2026-10-15' });
  // Entra en el total de ingresos del mes igual que cualquier reintegro
  const inc = await cmPage.evaluate(() => S.transactions.filter((t) => t.type === 'income' && t.date.startsWith('2026-10')).reduce((s, t) => s + t.amount, 0));
  expect(inc).toBe(10250);
  // Y no suma saldo a ninguna cuenta (ni siquiera tras recalcular todo varias veces)
  await cmPage.evaluate(() => { for (let i = 0; i < 3; i++) { materializeCardExpenses(); cardsCatchUp(); renderFinanzasTab(); renderActivity(); } });
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect((await ingresos(cmPage))).toHaveLength(1);
  expect((await pagos(cmPage))).toHaveLength(1);
  expect(consoleErrors).toEqual([]);
});

test('4) el reintegro se imputa al calendario como un pago: Σ pendiente == Usado y baja el vencimiento de su ciclo', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  // La compra del 15/10 cae en el resumen que cierra el 27/10 y vence el 10/11: tres cuotas de 13.666,67 (10/11, 10/12, 10/01)
  const p = await pendiente(cmPage);
  expect(p.map((x) => x[0])).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
  expect(p[0][1]).toBeCloseTo(13666.67 - 10250, 1);   // el reintegro (fechado 15/10) se aplica primero al 10/11
  expect(p[1][1]).toBeCloseTo(13666.67, 1);
  expect(await sumaPendiente(cmPage)).toBe(30750);
  expect(await usado(cmPage)).toBe(30750);
  await cmPage.click('#credit-card');
  await cmPage.click('#tj-tab-calendario');
  await expect(cmPage.locator('#tj-pane-calendario')).toContainText(/3[.,]416/);
  expect(consoleErrors).toEqual([]);
});

test('5) un reintegro mayor que el vencimiento de su ciclo pasa al siguiente con saldo (regla de arrastre)', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  // 50% de reintegro sobre 41.000 = 20.500 > 13.666,67 del 10/11: el resto (6.833,33) baja el 10/12
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 41000, nombre: 'Grande', fecha: '2026-10-15', modo: 'nowInst', cuotas: 3 });
  await pctChip(cmPage, 50).click();
  await tipo(cmPage, REINTEGRO).click();
  await cmPage.selectOption('#txnRefundAcc', 'card:nar');
  await guardarCompra(cmPage);
  expect(await usado(cmPage)).toBe(20500);
  const p = await pendiente(cmPage);
  expect(p.map((x) => x[0])).toEqual(['2026-12-10', '2027-01-10']);   // el 10/11 queda cubierto
  expect(await sumaPendiente(cmPage)).toBe(20500);
  expect(consoleErrors).toEqual([]);
});

test('6) gasto común con reintegro a la tarjeta: el gasto sale de su cuenta y el reintegro baja el Usado, sin mover cuentas', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  // Una compra de Naranja para que haya algo usado
  await cmPage.evaluate(() => { S.cardCharges.push({ id: uid(), cardId: 'nar', date: '2026-10-10', amount: 50000, mode: 'now1', name: 'Base' }); renderFinanzasTab(); });
  expect(await usado(cmPage)).toBe(50000);
  await gastoComun(cmPage, { nombre: 'Cena', monto: 10000, cuenta: 'efe', destino: 'card:nar' });
  const gasto = (await txns(cmPage)).find((t) => t.type === 'expense' && t.name === 'Cena');
  expect(gasto.refund).toEqual({ pct: 25, amount: 2500, accountId: '', cardId: 'nar', txnId: `rf:${gasto.id}` });
  expect(await saldo(cmPage, 'efe')).toBe(50000 - 10000);   // el gasto sí sale de Efectivo; el reintegro no entra a ninguna cuenta
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
  expect(await usado(cmPage)).toBe(50000 - 2500);
  expect((await ingresos(cmPage))[0]).toMatchObject({ refundOf: gasto.id, refundCardId: 'nar', accountId: '', amount: 2500 });
  expect(consoleErrors).toEqual([]);
});

test('7) editar la compra: precarga la tarjeta como destino; cambiar a una cuenta revierte todo y volver a la tarjeta no duplica', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  const [orig] = await cargos(cmPage);

  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await expect(cmPage.locator('#txnRefundAcc')).toHaveValue('card:nar');
  // Guardar sin cambios: no se duplica
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  expect(await pagos(cmPage)).toHaveLength(1);
  expect(await ingresos(cmPage)).toHaveLength(1);
  expect(await usado(cmPage)).toBe(30750);

  // A una cuenta: se va el pago de la tarjeta, vuelve a subir el Usado y entra el saldo a la cuenta
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await cmPage.selectOption('#txnRefundAcc', 'efe');
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  expect(await pagos(cmPage)).toHaveLength(0);
  expect(await usado(cmPage)).toBe(41000);
  expect(await saldo(cmPage, 'efe')).toBe(50000 + 10250);
  const [ch] = await cargos(cmPage);
  expect(ch.refund).toEqual({ pct: 25, amount: 10250, accountId: 'efe', txnId: `rf:${orig.id}` });
  expect((await ingresos(cmPage))[0]).toMatchObject({ accountId: 'efe' });
  expect((await ingresos(cmPage))[0].refundCardId).toBeUndefined();

  // De vuelta a la tarjeta: revierte el saldo de Efectivo y aplica el pago una sola vez
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await cmPage.selectOption('#txnRefundAcc', 'card:mp');   // y de paso a otra tarjeta
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect((await pagos(cmPage)).map((p) => [p.cardId, p.amount, p.kind])).toEqual([['mp', 10250, 'refund']]);
  expect(await usado(cmPage, 'nar')).toBe(41000);
  expect(await usado(cmPage, 'mp')).toBe(-10250);
  expect(consoleErrors).toEqual([]);
});

test('8) borrar la compra quita el pago de la tarjeta y el ingreso, y el Usado vuelve a ser el de antes', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  const [ch] = await cargos(cmPage);
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.evaluate((id) => deleteCardCharge(id), ch.id);
  expect(await cargos(cmPage)).toHaveLength(0);
  expect(await pagos(cmPage)).toHaveLength(0);
  expect(await txns(cmPage)).toHaveLength(0);
  expect(await usado(cmPage)).toBe(0);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect(consoleErrors).toEqual([]);
});

test('9) borrar el gasto común quita el pago de la tarjeta y el deshacer lo restaura', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await gastoComun(cmPage, { nombre: 'Cena', monto: 10000, cuenta: 'efe', destino: 'card:nar' });
  const gasto = (await txns(cmPage)).find((t) => t.type === 'expense');
  expect(await usado(cmPage)).toBe(-2500);
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.evaluate((id) => deleteTransaction(id), gasto.id);
  expect(await pagos(cmPage)).toHaveLength(0);
  expect(await txns(cmPage)).toHaveLength(0);
  expect(await usado(cmPage)).toBe(0);
  expect(await saldo(cmPage, 'efe')).toBe(50000);

  await cmPage.evaluate(() => { CMUndo.deshacerUltimo(); });
  expect((await txns(cmPage)).map((t) => t.id).sort()).toEqual([gasto.id, `rf:${gasto.id}`].sort());
  expect(await pagos(cmPage)).toHaveLength(1);
  expect(await usado(cmPage)).toBe(-2500);
  expect(await saldo(cmPage, 'efe')).toBe(50000 - 10000);
  expect(consoleErrors).toEqual([]);
});

test('10) respeta el corte del arranque: un reintegro registrado después cuenta; la compra anterior sigue siendo historial', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { hoy: '2026-11-05' });
  await cmPage.evaluate(() => {
    const viejo = (Date.now() - 10 * 864e5).toString(36) + 'abcd';
    S.cardCharges.push({ id: viejo, cardId: 'nar', date: '2026-10-15', amount: 90000, mode: 'now1', name: 'Vieja' });
    renderFinanzasTab();
  });
  const r = await cmPage.evaluate(() => cardArranque('nar', { usado: 300000, meses: { '2026-12-10': 200000, '2027-01-10': 100000 } }));
  expect(r).toMatchObject({ usado: 300000 });
  await cmPage.waitForTimeout(30);
  await compraNaranja(cmPage, { nombre: 'Nueva', destino: 'card:nar' });   // 41.000 con 10.250 de reintegro, registrada después
  expect(await usado(cmPage)).toBe(300000 + 41000 - 10250);
  expect(await sumaPendiente(cmPage)).toBe(300000 + 41000 - 10250);
  expect(consoleErrors).toEqual([]);
});

test('11) Movimientos: el ingreso se ve como "Reintegro", con la tarjeta; el filtro por tarjeta lo incluye; el lápiz va a la derecha y abre la compra', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; openHistorialOverlay(); });
  const fila = cmPage.locator('#activityList .activity-row', { hasText: 'Reintegro 25% · Zapatillas' });
  await expect(fila).toHaveCount(1);
  await expect(fila.locator('.act-date')).toContainText('Naranja');
  await expect(fila.locator('.act-amount')).toContainText(/10[.,]?250/);
  // Filtro por tarjeta: Naranja incluye la compra y su reintegro; Mercado Pago, nada
  await cmPage.selectOption('#txnHistCardSel', 'nar');
  await expect(cmPage.locator('#activityList .activity-row')).toHaveCount(2);
  await cmPage.selectOption('#txnHistCardSel', 'mp');
  await expect(cmPage.locator('#activityList .activity-row')).toHaveCount(0);
  await cmPage.selectOption('#txnHistCardSel', '');
  // El control (lápiz) va a la derecha del texto de la fila y es chico
  const g = await cmPage.locator('#activityList .activity-row', { hasText: 'Reintegro 25% · Zapatillas' }).evaluate((row) => {
    const b = row.querySelector('button.icon-btn').getBoundingClientRect(), t = row.querySelector('.act-info').getBoundingClientRect();
    return { izq: b.left, derTexto: t.right, ancho: b.width, alto: b.height };
  });
  expect(g.izq).toBeGreaterThanOrEqual(g.derTexto - 1);
  expect(g.ancho).toBeLessThanOrEqual(44);
  expect(g.alto).toBeLessThanOrEqual(44);
  // Editar el ingreso abre la compra de origen
  await cmPage.locator('#activityList .activity-row', { hasText: 'Reintegro 25% · Zapatillas' }).locator('button[title="Editar"]').dispatchEvent('click');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Editar compra');
  expect(consoleErrors).toEqual([]);
});

test('12) etiqueta de la compra: "Con reintegro de $10.250 a la tarjeta Naranja"', async ({ cmPage }) => {
  await preparar(cmPage);
  await compraNaranja(cmPage);
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; openHistorialOverlay(); });
  const tag = cmPage.locator('#activityList .activity-row', { hasText: 'Zapatillas' }).filter({ hasNotText: /Reintegro \d+% ·/ }).locator('.disc-tag-refund');
  await expect(tag).toHaveAttribute('aria-label', /^Con reintegro de \$10[.,]?250 a la tarjeta Naranja$/);
});

test('13) sin destino elegido no se guarda, y una tarjeta que ya no existe tampoco es válida', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirMovimiento(cmPage, 'expense');
  await cmPage.fill('#txnName', 'Algo');
  await cmPage.fill('#txnAmount', '1000');
  await cmPage.selectOption('#txnCurrency', 'ARS');
  await cmPage.selectOption('#txnAccount', '');
  await pctChip(cmPage, 10).click();
  await tipo(cmPage, REINTEGRO).click();
  await cmPage.click('#modal-add-txn button:has-text("Registrar")');
  await expect(cmPage.locator('#toast')).toContainText('Elegí la cuenta o la tarjeta donde entra el reintegro');
  expect(await txns(cmPage)).toHaveLength(0);
  expect(await pagos(cmPage)).toHaveLength(0);
  const validos = await cmPage.evaluate(() => [_refundDest('card:nar'), _refundDest('card:nope'), _refundDest('uala'), _refundDest('')]);
  expect(validos).toEqual([{ accountId: '', cardId: 'nar' }, null, { accountId: 'uala', cardId: '' }, null]);
  expect(consoleErrors).toEqual([]);
});

test('14) a 390px el formulario con la tarjeta como destino y la lista de movimientos no tienen scroll horizontal', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await pctChip(cmPage, 25).click();
  await tipo(cmPage, REINTEGRO).click();
  await cmPage.selectOption('#txnRefundAcc', 'card:nar');
  const form = await cmPage.evaluate(() => {
    const m = document.querySelector('#modal-add-txn .modal'), r = m.getBoundingClientRect();
    const sel = document.getElementById('txnRefundAcc').getBoundingClientRect();
    return { sw: m.scrollWidth, cw: m.clientWidth, doc: document.documentElement.scrollWidth, selDer: sel.right, modalDer: r.right };
  });
  expect(form.sw).toBeLessThanOrEqual(form.cw);
  expect(form.doc).toBeLessThanOrEqual(390);
  expect(form.selDer).toBeLessThanOrEqual(form.modalDer + 1);
  await cmPage.click('#modal-add-txn button:has-text("Cancelar")');
  await compraNaranja(cmPage);
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; openHistorialOverlay(); });
  await expect(cmPage.locator('#activityList .activity-row', { hasText: /Reintegro 25% ·/ })).toHaveCount(1);
  const lista = await cmPage.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(lista.doc).toBeLessThanOrEqual(390);
  expect(lista.body).toBeLessThanOrEqual(390);
  expect(consoleErrors).toEqual([]);
});
