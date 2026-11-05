// Tarjetas: Plan Z (el total se paga en partes, sin interés). La tarjeta lo ofrece (card.planZ) y la compra en cuotas
// lo activa (charge.z). Matemática = cuotas: la 1ª parte va al resumen de la compra y el resto a los meses siguientes.
// Los datos de ejemplo viven solo acá. "Hoy" de Finanzas se fija pisando getActiveDate() (2026-11-05).
'use strict';
const { test, expect } = require('./support/fixtures');
const M = require('../tarjetas-motor.js');
const { abrirTarjetas, cerrarTarjetas, abrirCompraDesdeMovimientos, elegirTarjeta, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const HOY = '2026-11-05';
const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, planZ: true, payAccountId: 'uala' };
const VISA = { id: 'vis', name: 'Visa', limit: 500000, closeDay: 5, dueDay: 10, openingUsed: 0, payAccountId: 'uala' };

async function preparar(page, hoy = HOY) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, cards }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [{ id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' }];
    S.cards = cards;
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.cardDues = []; S.moves = [];
    txnActiveMonth = hoy.slice(0, 7);
    renderFinanzasTab();
  }, { hoy, cards: [NARANJA, VISA] });
}

const cargos = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.cardCharges)));
const gastos = (page) => page.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => [t.date.slice(0, 7), t.amount]));
const mes = (page, mk) => page.locator(`#cardCalendar .cc-cal-m[data-month="${mk}"]`);
const fila = (page) => page.locator('#ccChZRow');

async function cargarZ(page, c) {
  await abrirCompraDesdeMovimientos(page);
  await llenarCompra(page, { card: 'nar', ...c });
  await expect(fila(page)).toBeVisible();
  await page.check('#ccChZ');
  await guardarCompra(page);
}

test('1) la casilla Plan Z solo se ve en una tarjeta que lo ofrece y con una compra en cuotas', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await elegirTarjeta(cmPage, 'nar');
  await expect(fila(cmPage)).toBeHidden();                         // un pago: no
  await cmPage.selectOption('#ccChMode', 'deferred');
  await expect(fila(cmPage)).toBeVisible();                        // cuotas, uso diferido
  await cmPage.selectOption('#ccChMode', 'nowInst');
  await expect(fila(cmPage)).toBeVisible();                        // cuotas, uso inmediato
  await cmPage.selectOption('#ccChMode', 'advance');
  await expect(fila(cmPage)).toBeHidden();                         // plata de un tercero: no
  await cmPage.selectOption('#ccChMode', 'nowInst');
  await elegirTarjeta(cmPage, 'vis');
  await expect(fila(cmPage)).toBeHidden();                         // tarjeta sin Plan Z: no, aunque sea en cuotas
  await cmPage.selectOption('#txnAccount', 'card:nar');
  await expect(fila(cmPage)).toBeVisible();
  await expect(cmPage.locator('#ccChZ')).not.toBeChecked();        // nunca viene tildada sola
  // La casilla es chica y está a la derecha del texto
  const g = await cmPage.evaluate(() => {
    const i = document.getElementById('ccChZ').getBoundingClientRect(), t = document.querySelector('#ccChZRow span').getBoundingClientRect();
    return { w: i.width, izq: i.left, finTexto: t.right };
  });
  expect(g.w).toBeLessThanOrEqual(18);
  expect(g.izq).toBeGreaterThanOrEqual(g.finTexto - 1);
  expect(consoleErrors).toEqual([]);
});

test('2) 39.800 en 3 partes comprado el 04/11 en una tarjeta que cierra el 27 y vence el 10: 10/12, 10/01, 10/02', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarZ(cmPage, { fecha: '2026-11-04', monto: 39800, nombre: 'Compra Z', modo: 'nowInst', cuotas: 3 });
  const [ch] = await cargos(cmPage);
  expect(ch).toMatchObject({ cardId: 'nar', amount: 39800, mode: 'nowInst', installments: 3, z: true });
  const plan = await cmPage.evaluate(() => CMTarjetas.installmentSchedule(S.cards[0], S.cardCharges[0]).map((q) => [q.n, q.dueDate, q.amount]));
  expect(plan).toEqual([[1, '2026-12-10', 13266.66], [2, '2027-01-10', 13266.66], [3, '2027-02-10', 13266.68]]);
  expect(plan.reduce((s, q) => s + Math.round(q[2] * 100), 0)).toBe(3980000);
  // Consume el límite completo
  expect(await cmPage.evaluate(() => cardUsed(S.cards[0]))).toBe(39800);
  // Calendario: el número real de cada mes (no el total)
  await abrirTarjetas(cmPage, 'calendario');
  await expect(mes(cmPage, '2026-11')).toContainText('Nada para pagar');
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $13.266,66']);
  await expect(mes(cmPage, '2027-01').locator('.cc-cal-due')).toHaveText(['10/01 · Naranja · $13.266,66']);
  await expect(mes(cmPage, '2027-02').locator('.cc-cal-due')).toHaveText(['10/02 · Naranja · $13.266,68']);
  await expect(mes(cmPage, '2027-03')).toContainText('Nada para pagar');
  // Lista de compras: marcada como Plan Z con sus partes
  await abrirTarjetas(cmPage, 'compras');
  const item = cmPage.locator('#tj-pane-compras .cc-chg', { hasText: 'Compra Z' });
  await expect(item.locator('.cc-z-tag')).toHaveText('Plan Z · 3 partes');
  await item.locator('summary').click();
  await expect(item.locator('.cc-chg-list li').first()).toContainText('Parte 1 de 3 · vence el 10/12/2026');
  expect(consoleErrors).toEqual([]);
});

test('3) uso inmediato + Z: el gasto completo cuenta en el mes de la compra', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargarZ(cmPage, { fecha: '2026-11-04', monto: 39800, nombre: 'Z inmediata', modo: 'nowInst', cuotas: 3 });
  expect(await gastos(cmPage)).toEqual([['2026-11', 39800]]);
  expect(await cmPage.evaluate(() => CMTarjetas.expenseSchedule(S.cardCharges[0]).map((e) => [e.month, e.amount]))).toEqual([['2026-11', 39800]]);
});

test('4) uso diferido + Z con 3 meses: el gasto se reparte en esos meses; las partes del resumen siguen siendo las de Z', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargarZ(cmPage, { fecha: '2026-11-04', monto: 39800, nombre: 'Z diferida', modo: 'deferred', cuotas: 3, meses: 3 });
  const [ch] = await cargos(cmPage);
  expect(ch).toMatchObject({ mode: 'deferred', installments: 3, consumeMonths: 3, z: true });
  expect(await cmPage.evaluate(() => CMTarjetas.expenseSchedule(S.cardCharges[0]).map((e) => [e.month, e.amount])))
    .toEqual([['2026-11', 13266.66], ['2026-12', 13266.66], ['2027-01', 13266.68]]);
  expect(await gastos(cmPage)).toEqual([['2026-11', 13266.66]]);   // los meses futuros se crean cuando llegan
  await abrirTarjetas(cmPage, 'calendario');
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $13.266,66']);
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-exp')).toContainText('$13.266,66');   // gasto previsto de diciembre
});

test('5) editar: pasar a 6 partes recalcula el calendario; sacar el Plan Z lo quita de la compra', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargarZ(cmPage, { fecha: '2026-11-04', monto: 39800, nombre: 'Compra Z', modo: 'nowInst', cuotas: 3 });
  const [orig] = await cargos(cmPage);
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#ccChZ')).toBeChecked();
  await expect(cmPage.locator('#ccChInst')).toHaveValue('3');
  await cmPage.fill('#ccChInst', '6');
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  const [ed] = await cargos(cmPage);
  expect(ed).toMatchObject({ id: orig.id, installments: 6, z: true, amount: 39800 });
  const plan = await cmPage.evaluate(() => CMTarjetas.installmentSchedule(S.cards[0], S.cardCharges[0]).map((q) => [q.dueDate, q.amount]));
  expect(plan.map((q) => q[0])).toEqual(['2026-12-10', '2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10', '2027-05-10']);
  expect(plan.reduce((s, q) => s + Math.round(q[1] * 100), 0)).toBe(3980000);
  expect(plan[0][1]).toBe(6633.33);
  await abrirTarjetas(cmPage, 'calendario');
  await expect(mes(cmPage, '2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $6.633,33']);
  await expect(mes(cmPage, '2027-05').locator('.cc-cal-due')).toHaveText(['10/05 · Naranja · $6.633,35']);
  await expect(mes(cmPage, '2027-06')).toContainText('Nada para pagar');

  // Sacar el Plan Z: queda una compra en cuotas común
  await cerrarTarjetas(cmPage);
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await cmPage.uncheck('#ccChZ');
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  const [sin] = await cargos(cmPage);
  expect(sin.z).toBeUndefined();
  expect(sin.installments).toBe(6);
  expect(consoleErrors).toEqual([]);
});

test('6) una compra Z de una tarjeta que ya no ofrece Plan Z se puede editar y destildar; en la alta la casilla no aparece', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargarZ(cmPage, { fecha: '2026-11-04', monto: 12000, nombre: 'Compra Z', modo: 'nowInst', cuotas: 3 });
  const [orig] = await cargos(cmPage);
  await cmPage.evaluate(() => { delete S.cards[0].planZ; });
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await expect(fila(cmPage)).toBeVisible();
  await expect(cmPage.locator('#ccChZ')).toBeChecked();
  await cmPage.uncheck('#ccChZ');
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  expect((await cargos(cmPage))[0].z).toBeUndefined();
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await expect(fila(cmPage)).toBeHidden();
});

test('7) el editor de tarjeta tiene la casilla "Ofrece Plan Z" y la guarda', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => openCardModal('vis'));
  await expect(cmPage.locator('#cardPlanZ')).not.toBeChecked();
  await expect(cmPage.locator('label[for="cardPlanZ"]')).toContainText('Ofrece Plan Z (el total se paga en partes sin interés)');
  await cmPage.locator('label[for="cardPlanZ"] span').click();   // se toca el texto: en el celu el botón flotante de tema tapa la casilla del borde derecho
  await expect(cmPage.locator('#cardPlanZ')).toBeChecked();
  await cmPage.click('#modal-card .btn-primary');
  await expect(cmPage.locator('#modal-card')).not.toHaveClass(/open/);
  expect(await cmPage.evaluate(() => S.cards.map((c) => [c.id, c.planZ === true]))).toEqual([['nar', true], ['vis', true]]);
  await cmPage.evaluate(() => openCardModal('vis'));
  await expect(cmPage.locator('#cardPlanZ')).toBeChecked();
  await cmPage.locator('label[for="cardPlanZ"] span').click();
  await expect(cmPage.locator('#cardPlanZ')).not.toBeChecked();
  await cmPage.click('#modal-card .btn-primary');
  expect(await cmPage.evaluate(() => S.cards.find((c) => c.id === 'vis').planZ)).toBeUndefined();
  expect(consoleErrors).toEqual([]);
});

test.describe('motor', () => {
  const nar = { id: 'nar', name: 'Naranja', limit: 1, closeDay: 27, dueDay: 10 };
  const base = { cardId: 'nar', date: '2026-11-04', amount: 39800, mode: 'nowInst', installments: 3 };
  test('validateCharge: z solo en cuotas (nowInst/deferred) y con al menos 2 partes', () => {
    expect(M.validateCharge({ ...base, z: true }).ok).toBe(true);
    expect(M.validateCharge({ ...base, mode: 'deferred', consumeMonths: 3, z: true }).ok).toBe(true);
    expect(M.validateCharge({ ...base, z: false }).ok).toBe(true);
    expect(M.validateCharge({ ...base, mode: 'now1', installments: 1, z: true }).error).toContain('Plan Z');
    expect(M.validateCharge({ ...base, mode: 'advance', toAccountId: 'a', z: true }).error).toContain('Plan Z');
    expect(M.validateCharge({ ...base, installments: 1, z: true }).error).toContain('2 partes');
    expect(M.validateCharge({ ...base, z: 'si' }).error).toContain('Plan Z');
    // Sin z, todo igual que antes
    expect(M.validateCharge(base).ok).toBe(true);
  });
  test('las partes de Z suman el total (centavos a la última) y no cambian con z', () => {
    const a = M.installmentSchedule(nar, { ...base, z: true }), b = M.installmentSchedule(nar, base);
    expect(a).toEqual(b);
    expect(a.map((q) => q.amount)).toEqual([13266.66, 13266.66, 13266.68]);
    expect(a.map((q) => q.dueDate)).toEqual(['2026-12-10', '2027-01-10', '2027-02-10']);
  });
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('el formulario con Plan Z y el editor de tarjeta no generan scroll horizontal, sin errores de consola', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage);
    await abrirCompraDesdeMovimientos(cmPage);
    await elegirTarjeta(cmPage, 'nar');
    await cmPage.selectOption('#ccChMode', 'nowInst');
    await cmPage.check('#ccChZ');
    await cmPage.fill('#txnAmount', '39800');
    await expect(cmPage.locator('#ccChInstRow label')).toHaveText('Cantidad de partes (Plan Z)');
    await cmPage.locator('#ccChZRow').scrollIntoViewIfNeeded();
    const m1 = await cmPage.evaluate(() => {
      const md = document.querySelector('#modal-add-txn .modal');
      return { sw: document.body.scrollWidth, cw: document.documentElement.clientWidth, msw: md.scrollWidth, mcw: md.clientWidth };
    });
    expect(m1.sw).toBeLessThanOrEqual(m1.cw + 1);
    expect(m1.msw).toBeLessThanOrEqual(m1.mcw + 1);
    await cmPage.evaluate(() => closeModal('modal-add-txn'));
    await cmPage.evaluate(() => openCardModal('nar'));
    await cmPage.locator('#cardPlanZ').scrollIntoViewIfNeeded();
    const m2 = await cmPage.evaluate(() => {
      const md = document.querySelector('#modal-card .modal');
      return { sw: document.body.scrollWidth, cw: document.documentElement.clientWidth, msw: md.scrollWidth, mcw: md.clientWidth };
    });
    expect(m2.sw).toBeLessThanOrEqual(m2.cw + 1);
    expect(m2.msw).toBeLessThanOrEqual(m2.mcw + 1);
    expect(consoleErrors).toEqual([]);
  });
});
