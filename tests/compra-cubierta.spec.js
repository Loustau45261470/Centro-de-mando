// Compra con tarjeta que cubre otra persona ("La cubre Papá"): specs/compra-cubierta.md.
// Caso real: cuota de la facultad en 12 cuotas; Papá paga la de octubre ahora y la de febrero 2027 recién en febrero.
// La compra ocupa el límite y genera las cuotas de siempre, pero no es gasto: lo que Papá debe queda en "A cobrar · Papá".
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna cuenta ni tarjeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const { abrirTarjetas, cerrarTarjetas, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const HOY = '2026-10-27';
const BASE_UALA = 1000000;
const TOTAL = 570000;

async function preparar(page) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, base }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: base, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
    ];
    S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' }];
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = []; S.coverCollections = [];
    txnActiveMonth = hoy.slice(0, 7);
    renderFinanzasTab();
  }, { hoy: HOY, base: BASE_UALA });
}

const irA = (page, hoy) => page.evaluate((h) => { window.getActiveDate = () => h; renderFinanzasTab(); }, hoy);
const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const aCobrar = (page) => page.evaluate(() => { const a = S.accounts.find((x) => x.name === 'A cobrar · Papá'); return a ? a.balance : null; });
const patrimonio = (page) => page.evaluate(() => calcNetWorth());
const usado = (page) => page.evaluate(() => cardUsed(S.cards[0]));
const cargos = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.cardCharges)));
const txns = (page) => page.evaluate(() => S.transactions.map((t) => ({ ...t })));
const cobros = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.coverCollections || [])));
const gastosCc = (page) => page.evaluate(() => S.transactions.filter((t) => String(t.id).startsWith('cc:') || t.cardChargeId).length);
const modal = (page) => page.locator('#modal-add-txn');

// Compra de la facultad: 570.000 en 12 cuotas, cubre oct-2026 (320.000) y feb-2027 (250.000). Se carga por el formulario.
async function cargarCubierta(page, { nombre = 'Cuota facultad', filas } = {}) {
  await abrirCompraDesdeMovimientos(page);
  await llenarCompra(page, { monto: TOTAL, nombre, fecha: '2026-10-15', modo: 'nowInst', cuotas: 12 });
  await page.check('#ccChCover');
  await expect(page.locator('#ccCoverBox')).toBeVisible();
  const f = filas || [{ month: '2026-10', amount: 320000 }, { month: '2027-02', amount: 250000 }];
  const rows = page.locator('#ccCoverRows .cc-cover-row');
  await expect(rows).toHaveCount(1);
  for (let i = 1; i < f.length; i++) await page.click('#ccCoverAdd');
  await expect(rows).toHaveCount(f.length);
  for (let i = 0; i < f.length; i++) {
    await rows.nth(i).locator('.cc-cover-m').fill(f[i].month);
    await rows.nth(i).locator('.cc-cover-a').fill(String(f[i].amount));
  }
  await guardarCompra(page);
}

async function cobrar(page, monto, cuenta = 'uala') {
  await cerrarTarjetas(page);
  await page.locator('#accountList .acc-cobro').click();
  await expect(page.locator('#modal-cover-collect')).toHaveClass(/open/);
  await page.fill('#cvAmount', String(monto));
  await page.selectOption('#cvToAcc', cuenta);
  return page.locator('#cvPreview');
}
async function confirmarCobro(page) {
  await page.click('#cvSaveBtn');
  await expect(page.locator('#modal-cover-collect')).not.toHaveClass(/open/);
}

test('1) compra 570.000 en 12 cuotas que cubre Papá: ocupa el crédito, no es gasto, queda a cobrar y el patrimonio no baja', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const nw0 = await patrimonio(cmPage);
  await cargarCubierta(cmPage);

  expect(await usado(cmPage)).toBe(TOTAL);
  expect(await gastosCc(cmPage)).toBe(0);
  const acc = await cmPage.evaluate(() => S.accounts.find((a) => a.name === 'A cobrar · Papá'));
  expect(acc).toMatchObject({ type: 'prestamo', balance: TOTAL, currency: 'ARS' });
  expect(await patrimonio(cmPage)).toBe(nw0);
  const [ch] = await cargos(cmPage);
  expect(ch).toMatchObject({ amount: TOTAL, mode: 'nowInst', installments: 12, name: 'Cuota facultad' });
  expect(ch.cover).toEqual({ accountId: acc.id, who: 'Papá', periods: [{ month: '2026-10', amount: 320000, collected: 0 }, { month: '2027-02', amount: 250000, collected: 0 }] });
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);

  // Tampoco aparece como gasto en los meses siguientes, cuando antes se habrían generado.
  await irA(cmPage, '2027-03-05');
  expect(await gastosCc(cmPage)).toBe(0);
  await irA(cmPage, HOY);

  // Tarjetas → Compras: etiqueta y estado por mes.
  await abrirTarjetas(cmPage, 'compras');
  const fila = cmPage.locator('#cardChargeList .cc-chg').first();
  await expect(fila).toContainText('La cubre Papá');
  await expect(fila).toContainText(/Oct 2026 pendiente · Feb 2027 pendiente/);
  expect(consoleErrors).toEqual([]);
});

test('2) el cronograma de una compra cubierta es idéntico al de la misma compra sin cubrir: 12 cuotas de 47.500 desde el próximo resumen', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCubierta(cmPage);
  const r = await cmPage.evaluate(() => {
    const card = S.cards[0], ch = S.cardCharges[0];
    const sinCover = { ...ch }; delete sinCover.cover;
    const a = { due: CMTarjetas.dueTotals(card, [ch], '1900-01-01', '2999-12-31'), cuotas: CMTarjetas.installmentSchedule(card, ch), fx: CMTarjetas.chargeEffects(card, ch), used: cardUsed(card) };
    S.cardCharges = [sinCover];
    const b = { due: CMTarjetas.dueTotals(card, [sinCover], '1900-01-01', '2999-12-31'), cuotas: CMTarjetas.installmentSchedule(card, sinCover), fx: CMTarjetas.chargeEffects(card, sinCover), used: cardUsed(card) };
    return { a, b };
  });
  expect(r.a).toEqual(r.b);
  expect(r.a.cuotas).toHaveLength(12);
  expect(r.a.cuotas.every((q) => q.amount === 47500)).toBe(true);
  expect(r.a.cuotas[0].dueDate).toBe('2026-11-10');   // la compra del 15/10 cae en el resumen que cierra el 27/10
  expect(r.a.cuotas[11].dueDate).toBe('2027-10-10');   // los meses de cobro (feb-2027) no mueven nada
  expect(r.a.used).toBe(TOTAL);
  expect(consoleErrors).toEqual([]);
});

test('3) cobro de 450.000 en octubre: 320.000 cancelan octubre y 130.000 entran como ingreso; queda a cobrar 250.000', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCubierta(cmPage);
  const nw1 = await patrimonio(cmPage);

  const preview = await cobrar(cmPage, 450000);
  await expect(preview).toContainText(/\$320[.,]?000 cubren la cuota de octubre 2026 · \$130[.,]?000 entran como ingreso/);
  await confirmarCobro(cmPage);

  const [ch] = await cargos(cmPage);
  expect(ch.cover.periods.map((p) => p.collected)).toEqual([320000, 0]);
  expect(await aCobrar(cmPage)).toBe(250000);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA + 450000);
  const extra = (await txns(cmPage)).filter((t) => t.type === 'income');
  expect(extra).toHaveLength(1);
  expect(extra[0]).toMatchObject({ name: 'Extra · Papá', amount: 130000, currency: 'ARS', accountId: 'uala', date: HOY });
  const [c] = await cobros(cmPage);
  expect(c).toMatchObject({ date: HOY, toAccountId: 'uala', extraTxnId: extra[0].id });
  expect(c.applied).toEqual([{ chargeId: ch.id, month: '2026-10', amount: 320000 }]);
  // Patrimonio: solo sube el ingreso extra; lo aplicado pasó de "a cobrar" a la cuenta.
  expect(await patrimonio(cmPage)).toBe(nw1 + 130000);

  await abrirTarjetas(cmPage, 'compras');
  await expect(cmPage.locator('#cardChargeList .cc-chg').first()).toContainText(/Oct 2026 ✓ cobrado · Feb 2027 pendiente/);
  expect(consoleErrors).toEqual([]);
});

test('4) cobro de 480.000 en febrero 2027: 250.000 cancelan febrero y 230.000 entran como ingreso; a cobrar queda en 0', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCubierta(cmPage);
  await cobrar(cmPage, 450000);
  await confirmarCobro(cmPage);

  await irA(cmPage, '2027-02-10');
  const antes = await saldo(cmPage, 'uala');
  const preview = await cobrar(cmPage, 480000);
  await expect(preview).toContainText(/\$250[.,]?000 cubren la cuota de febrero 2027 · \$230[.,]?000 entran como ingreso/);
  await confirmarCobro(cmPage);

  const [ch] = await cargos(cmPage);
  expect(ch.cover.periods.map((p) => p.collected)).toEqual([320000, 250000]);
  expect(await aCobrar(cmPage)).toBe(0);
  expect(await saldo(cmPage, 'uala')).toBe(antes + 480000);
  const extras = (await txns(cmPage)).filter((t) => t.type === 'income').map((t) => t.amount).sort((a, b) => a - b);
  expect(extras).toEqual([130000, 230000]);
  expect(await cobros(cmPage)).toHaveLength(2);
  expect(await gastosCc(cmPage)).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('5) antes de que llegue febrero, un cobro solo cubre lo vencido: lo que sobra es ingreso y se avisa', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCubierta(cmPage);
  await cobrar(cmPage, 450000);
  await confirmarCobro(cmPage);

  // Octubre ya está cobrado y febrero todavía no venció: todo lo que entra es ingreso.
  const preview = await cobrar(cmPage, 100000);
  await expect(preview).toContainText(/No hay cuotas vencidas pendientes: los \$100[.,]?000 entran todos como ingreso/);
  await confirmarCobro(cmPage);
  expect(await aCobrar(cmPage)).toBe(250000);
  expect((await cargos(cmPage))[0].cover.periods.map((p) => p.collected)).toEqual([320000, 0]);
  expect((await txns(cmPage)).filter((t) => t.type === 'income').map((t) => t.amount).sort((a, b) => a - b)).toEqual([100000, 130000]);
  expect(await cobros(cmPage)).toHaveLength(1);   // sin nada aplicado no hay qué deshacer desde la compra
  expect(consoleErrors).toEqual([]);
});

test('6) deshacer el cobro de octubre: todo vuelve a como estaba tras la compra (saldos, cobrado, sin el ingreso)', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCubierta(cmPage);
  const nw1 = await patrimonio(cmPage);
  await cobrar(cmPage, 450000);
  await confirmarCobro(cmPage);
  expect(await aCobrar(cmPage)).toBe(250000);

  await abrirTarjetas(cmPage, 'compras');
  await expect(cmPage.locator('#cardChargeList .cc-chg').first()).toContainText('Cobro del');
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.locator('#cardChargeList .cc-chg').first().getByRole('button', { name: 'Deshacer cobro' }).click();

  await expect.poll(() => cobros(cmPage)).toEqual([]);
  expect(await aCobrar(cmPage)).toBe(TOTAL);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
  expect((await cargos(cmPage))[0].cover.periods.map((p) => p.collected)).toEqual([0, 0]);
  expect((await txns(cmPage)).filter((t) => t.type === 'income')).toEqual([]);
  expect(await patrimonio(cmPage)).toBe(nw1);
  await expect(cmPage.locator('#cardChargeList .cc-chg').first()).toContainText(/Oct 2026 pendiente · Feb 2027 pendiente/);
  expect(consoleErrors).toEqual([]);
});

test('7) borrar la compra sin cobros: crédito, saldo a cobrar y patrimonio vuelven al estado previo', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const nw0 = await patrimonio(cmPage);
  await cargarCubierta(cmPage);
  expect(await usado(cmPage)).toBe(TOTAL);

  await abrirTarjetas(cmPage, 'compras');
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.locator('#cardChargeList .cc-chg').first().getByRole('button', { name: 'Borrar compra' }).click();
  await expect.poll(() => cargos(cmPage)).toEqual([]);
  expect(await usado(cmPage)).toBe(0);
  expect(await aCobrar(cmPage)).toBe(0);
  expect(await patrimonio(cmPage)).toBe(nw0);
  expect(await saldo(cmPage, 'uala')).toBe(BASE_UALA);
  expect(consoleErrors).toEqual([]);
});

test('8) con un cobro registrado no se puede borrar ni editar la compra, y el mensaje dice qué hacer', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCubierta(cmPage);
  await cobrar(cmPage, 320000);
  await confirmarCobro(cmPage);

  await abrirTarjetas(cmPage, 'compras');
  let dialogo = false;
  cmPage.on('dialog', (d) => { dialogo = true; d.dismiss(); });
  await cmPage.locator('#cardChargeList .cc-chg').first().getByRole('button', { name: 'Borrar compra' }).click();
  await expect(cmPage.locator('#toast')).toContainText('deshacé los cobros primero');
  expect(dialogo).toBe(false);
  expect(await cargos(cmPage)).toHaveLength(1);

  await cmPage.locator('#cardChargeList .cc-chg').first().getByRole('button', { name: 'Editar compra' }).click();
  await expect(cmPage.locator('#toast')).toContainText('Deshacé los cobros primero');
  await expect(modal(cmPage)).not.toHaveClass(/open/);
  expect(await aCobrar(cmPage)).toBe(250000);
  expect(consoleErrors).toEqual([]);
});

test('9) editar una compra cubierta sin cobros: precarga los meses y el saldo a cobrar se ajusta; se puede dejar de cubrir', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCubierta(cmPage);
  const nw1 = await patrimonio(cmPage);
  const [orig] = await cargos(cmPage);

  await abrirTarjetas(cmPage, 'compras');
  await cmPage.locator('#cardChargeList .cc-chg').first().getByRole('button', { name: 'Editar compra' }).click();
  await expect(modal(cmPage)).toHaveClass(/open/);
  await expect(cmPage.locator('#ccChCover')).toBeChecked();
  await expect(cmPage.locator('#ccCoverWho')).toHaveValue('Papá');
  await expect(cmPage.locator('#ccCoverRows .cc-cover-row')).toHaveCount(2);
  await expect(cmPage.locator('#ccCoverRows .cc-cover-a').first()).toHaveValue('320000');

  // Baja el monto a 400.000 en un solo mes.
  await cmPage.fill('#txnAmount', '400000');
  await cmPage.locator('#ccCoverRows .cc-cover-row').nth(1).getByRole('button', { name: 'Quitar este mes' }).click();
  await cmPage.locator('#ccCoverRows .cc-cover-a').first().fill('400000');
  await guardarCompra(cmPage);
  const [ed] = await cargos(cmPage);
  expect(ed.id).toBe(orig.id);
  expect(ed.cover.periods).toEqual([{ month: '2026-10', amount: 400000, collected: 0 }]);
  expect(await aCobrar(cmPage)).toBe(400000);
  expect(await usado(cmPage)).toBe(400000);
  expect(await patrimonio(cmPage)).toBe(nw1);

  // Deja de ser cubierta: el saldo a cobrar vuelve a 0 y pasa a ser un gasto normal.
  await cmPage.locator('#cardChargeList .cc-chg').first().getByRole('button', { name: 'Editar compra' }).click();
  await cmPage.uncheck('#ccChCover');
  await guardarCompra(cmPage);
  expect((await cargos(cmPage))[0].cover).toBeUndefined();
  expect(await aCobrar(cmPage)).toBe(0);
  expect(await gastosCc(cmPage)).toBe(1);
  expect(consoleErrors).toEqual([]);
});

test('10) validaciones y exclusiones del formulario: la suma de los meses tiene que ser el total; no va con descuento ni con plata de un tercero', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: TOTAL, nombre: 'Prueba', fecha: '2026-10-15', modo: 'nowInst', cuotas: 12 });
  await expect(cmPage.locator('#ccCoverRow')).toBeVisible();
  await expect(cmPage.locator('#ccCoverBox')).toBeHidden();

  // Al marcarla: una fila con el mes de la compra y el total, "Quién" = Papá, y la fila sigue al monto.
  await cmPage.check('#ccChCover');
  await expect(cmPage.locator('#ccCoverWho')).toHaveValue('Papá');
  const fila = cmPage.locator('#ccCoverRows .cc-cover-row');
  await expect(fila).toHaveCount(1);
  await expect(fila.locator('.cc-cover-m')).toHaveValue('2026-10');
  await expect(fila.locator('.cc-cover-a')).toHaveValue(String(TOTAL));
  await expect(cmPage.locator('#ccCoverSum')).toContainText('coincide con el total');
  await expect(cmPage.locator('#txnDiscountRow')).toBeHidden();   // con "la cubre otra persona" no hay descuento

  // Suma distinta: no guarda y explica.
  await fila.locator('.cc-cover-a').fill('300000');
  await expect(cmPage.locator('#ccCoverSum')).toContainText(/Faltan \$270[.,]?000/);
  await cmPage.click('#modal-add-txn .btn-primary');
  await expect(modal(cmPage)).toHaveClass(/open/);
  await expect(cmPage.locator('#ccChErr')).toContainText(/Los meses suman \$300[.,]?000 y la compra es de \$570[.,]?000/);
  expect(await cargos(cmPage)).toEqual([]);
  expect(await aCobrar(cmPage)).toBeNull();

  // Mes repetido.
  await cmPage.click('#ccCoverAdd');
  await cmPage.locator('#ccCoverRows .cc-cover-row').nth(1).locator('.cc-cover-m').fill('2026-10');
  await cmPage.locator('#ccCoverRows .cc-cover-row').nth(1).locator('.cc-cover-a').fill('270000');
  await cmPage.click('#modal-add-txn .btn-primary');
  await expect(cmPage.locator('#ccChErr')).toContainText('está repetido');

  // Desmarcada, vuelve el descuento; con descuento elegido, la opción queda trabada.
  await cmPage.uncheck('#ccChCover');
  await expect(cmPage.locator('#txnDiscountRow')).toBeVisible();
  await cmPage.locator('#txnDiscount').getByRole('radio', { name: '10%', exact: true }).click();
  await expect(cmPage.locator('#ccChCover')).toBeDisabled();
  await expect(cmPage.locator('#ccCoverHint')).toBeVisible();
  await cmPage.locator('#txnDiscount').getByRole('radio', { name: 'Sin descuento', exact: true }).click();
  await expect(cmPage.locator('#ccChCover')).toBeEnabled();

  // "Plata de un tercero" no se combina: la opción desaparece y se desmarca.
  await cmPage.check('#ccChCover');
  await cmPage.selectOption('#ccChMode', 'advance');
  await expect(cmPage.locator('#ccCoverRow')).toBeHidden();
  await expect(cmPage.locator('#ccChCover')).not.toBeChecked();
  expect(consoleErrors).toEqual([]);
});

test('11) un texto raro en "Quién" se escapa y crea su propia cuenta a cobrar; dos compras de la misma persona comparten cuenta', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarCubierta(cmPage, { nombre: 'Primera' });
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 10000, nombre: 'Segunda', fecha: '2026-10-16' });
  await cmPage.check('#ccChCover');
  await guardarCompra(cmPage);
  expect(await aCobrar(cmPage)).toBe(TOTAL + 10000);
  expect(await cmPage.evaluate(() => S.accounts.filter((a) => a.type === 'prestamo').length)).toBe(1);

  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 5000, nombre: 'Tercera', fecha: '2026-10-16' });
  await cmPage.check('#ccChCover');
  await cmPage.fill('#ccCoverWho', '<b>Tío</b>');
  await guardarCompra(cmPage);
  expect(await cmPage.evaluate(() => S.accounts.filter((a) => a.type === 'prestamo').map((a) => a.name).sort())).toEqual(['A cobrar · <b>Tío</b>', 'A cobrar · Papá']);
  await abrirTarjetas(cmPage, 'compras');
  expect(await cmPage.locator('#cardChargeList b').count()).toBe(0);   // el HTML del nombre no se interpreta
  await expect(cmPage.locator('#cardChargeList')).toContainText('La cubre <b>Tío</b>');

  // Con dos compras a cobrar el cobro se reparte del mes más viejo al más nuevo (las dos de octubre).
  await cerrarTarjetas(cmPage);
  await cmPage.locator('#accountList .account-row', { hasText: 'A cobrar · Papá' }).locator('.acc-cobro').click();
  await cmPage.fill('#cvAmount', '330000');
  await cmPage.selectOption('#cvToAcc', 'uala');
  await expect(cmPage.locator('#cvPreview')).toContainText(/\$330[.,]?000 cubren la cuota de octubre 2026/);
  await expect(cmPage.locator('#cvPreview')).not.toContainText('ingreso');
  expect(consoleErrors).toEqual([]);
});

test.describe('a 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const medir = (page, modalSel, contenidoSel) => page.evaluate(({ modalSel, contenidoSel }) => {
    const m = document.querySelector(modalSel + ' .modal');
    const r = m.getBoundingClientRect();
    const fuera = [...m.querySelectorAll(contenidoSel + ' *')]
      .filter((e) => e.offsetParent && (e.getBoundingClientRect().right > r.right + 1 || e.getBoundingClientRect().left < r.left - 1))
      .map((e) => e.id || e.className || e.tagName);
    return { sw: m.scrollWidth, cw: m.clientWidth, fuera, doc: document.documentElement.scrollWidth };
  }, { modalSel, contenidoSel });

  test('12) el formulario (opción, quién, filas de meses, + otro mes) y el modal de cobro entran sin cortes ni scroll horizontal', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage);
    await abrirCompraDesdeMovimientos(cmPage);
    await llenarCompra(cmPage, { monto: TOTAL, nombre: 'Cuota facultad', fecha: '2026-10-15', modo: 'nowInst', cuotas: 12 });
    await cmPage.check('#ccChCover');
    await cmPage.click('#ccCoverAdd');
    await cmPage.click('#ccCoverAdd');
    await expect(cmPage.locator('#ccCoverRows .cc-cover-row')).toHaveCount(3);
    await cmPage.locator('#ccCoverRow').scrollIntoViewIfNeeded();
    for (const sel of ['#ccChCover', '#ccCoverWho', '#ccCoverRows .cc-cover-m', '#ccCoverRows .cc-cover-a', '#ccCoverRows .icon-btn', '#ccCoverAdd', '#ccCoverSum']) {
      await expect(cmPage.locator(sel).first()).toBeVisible();
    }
    // Cada fila: mes, monto y quitar, uno al lado del otro y dentro del modal.
    const filas = await cmPage.evaluate(() => [...document.querySelectorAll('#ccCoverRows .cc-cover-row')].map((r) => {
      const q = [...r.children].map((c) => { const b = c.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width }; });
      return q;
    }));
    const mb = await cmPage.evaluate(() => { const b = document.querySelector('#modal-add-txn .modal').getBoundingClientRect(); return { l: b.left, r: b.right }; });
    for (const f of filas) for (const c of f) { expect(c.l).toBeGreaterThanOrEqual(mb.l - 1); expect(c.r).toBeLessThanOrEqual(mb.r + 1); expect(c.w).toBeGreaterThan(30); }
    const m1 = await medir(cmPage, '#modal-add-txn', '#ccCoverRow');
    expect(m1.sw).toBeLessThanOrEqual(m1.cw);
    expect(m1.fuera).toEqual([]);
    expect(m1.doc).toBeLessThanOrEqual(375);

    // Modal de cobro.
    await cmPage.evaluate(() => closeModal('modal-add-txn'));
    await cmPage.evaluate(() => {
      S.accounts.push({ id: 'cob', name: 'A cobrar · Papá', type: 'prestamo', balance: 570000, currency: 'ARS', icon: '🤝' });
      S.cardCharges = [{ id: 'c1', cardId: 'nar', date: '2026-10-15', amount: 570000, mode: 'nowInst', installments: 12, name: 'Cuota facultad', category: '',
        cover: { accountId: 'cob', who: 'Papá', periods: [{ month: '2026-10', amount: 320000, collected: 0 }, { month: '2027-02', amount: 250000, collected: 0 }] } }];
      renderFinanzasTab();
    });
    const boton = cmPage.locator('#accountList .acc-cobro');
    await boton.scrollIntoViewIfNeeded();
    await expect(boton).toBeVisible();
    const bb = await boton.boundingBox();
    expect(bb.x + bb.width).toBeLessThanOrEqual(375);
    await boton.click();
    await expect(cmPage.locator('#modal-cover-collect')).toHaveClass(/open/);
    await cmPage.fill('#cvAmount', '450000');
    await cmPage.selectOption('#cvToAcc', 'uala');
    await expect(cmPage.locator('#cvPreview')).toContainText(/entran como ingreso/);
    for (const sel of ['#cvAmount', '#cvToAcc', '#cvPreview', '#cvSaveBtn']) await expect(cmPage.locator(sel)).toBeInViewport();
    const m2 = await medir(cmPage, '#modal-cover-collect', '.modal');
    expect(m2.sw).toBeLessThanOrEqual(m2.cw);
    expect(m2.fuera).toEqual([]);
    expect(m2.doc).toBeLessThanOrEqual(375);

    // Tarjetas → Compras: la etiqueta, el estado por mes y "Deshacer cobro" entran.
    await cmPage.evaluate(() => closeModal('modal-cover-collect'));
    await cmPage.evaluate(() => {
      S.cardCharges[0].cover.periods[0].collected = 320000;
      S.coverCollections = [{ id: 'k1', date: '2026-10-27', accountId: 'cob', toAccountId: 'uala', applied: [{ chargeId: 'c1', month: '2026-10', amount: 320000 }], extraTxnId: '' }];
      renderFinanzasTab();
    });
    await abrirTarjetas(cmPage, 'compras');
    expect(await cmPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const ov = await cmPage.evaluate(() => {
      const box = document.querySelector('#cardChargeList .cc-chg').getBoundingClientRect();
      return [...document.querySelectorAll('#cardChargeList .cc-chg *')].filter((e) => e.offsetParent && e.getBoundingClientRect().right > box.right + 1).map((e) => e.className || e.tagName);
    });
    expect(ov).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
