// Gastos repartidos en meses + "Ya comprometido" (reparto-gastos.js, tarjetas-motor.js consumeFrom, presupuesto, calendario).
// Los datos de ejemplo viven solo acá. Los meses salen del reloj real de la máquina (la app arma "Actividad" con él);
// para "avanzar el mes" se pisa getActiveDate(), como en los demás specs de tarjetas.
'use strict';
const { test, expect, waitForBoot, completeLoginOverlay } = require('./support/fixtures');
const { abrirTarjetas, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const MK = (off) => { const d = new Date(); const t = new Date(d.getFullYear(), d.getMonth() + off, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };
const digitos = (s) => s.replace(/\D/g, '');
const TJ = { id: 'tj', name: 'Visa', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' };

async function preparar(page) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate((tj) => {
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'usd', name: 'Dólares', type: 'bank', balance: 10, currency: 'USD', icon: '💵' },
    ];
    S.cards = [tj]; S.cardCharges = []; S.cardPayments = []; S.cardDues = []; S.transactions = []; S.repartos = []; S.moves = [];
    renderFinanzasTab();
  }, TJ);
}
const saldo = (page) => page.evaluate(() => S.accounts.find((a) => a.id === 'uala').balance);
const repartos = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.repartos)));
const partes = (page) => page.evaluate(() => S.transactions.filter((t) => t.repartoId).map((t) => ({ id: t.id, date: t.date, name: t.name, amount: t.amount, accountId: t.accountId, type: t.type, category: t.category })));
const hoy = (page, d) => page.evaluate((x) => { window.getActiveDate = () => x; renderFinanzasTab(); }, d);

// "+ Movimiento" -> gasto común con la cuenta Ualá -> "Repartir en meses"
async function abrirGasto(page, { nombre, monto, categoria }) {
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
  await page.selectOption('#txnType', 'expense');
  await page.fill('#txnName', nombre);
  await page.fill('#txnAmount', String(monto));
  if (categoria) await page.selectOption('#txnCategory', categoria);
  await page.selectOption('#txnAccount', 'uala');
}
async function repartir(page, { desde, meses }) {
  await expect(page.locator('#txnRepRow')).toBeVisible();
  await page.check('#txnRepOn');
  await page.selectOption('#txnRepDesde', desde);
  await page.fill('#txnRepMeses', String(meses));
}
async function crear(page, o) {
  await abrirGasto(page, o);
  await repartir(page, o);
  await page.click('#txnSaveBtn');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
}

test('reparto de 3 meses desde el mes siguiente: la cuenta baja ya el total, este mes no suma y el siguiente muestra lo comprometido', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
  await abrirGasto(cmPage, { nombre: 'Zapatillas', monto: 90000, categoria: cat });
  await repartir(cmPage, { desde: 'next', meses: 3 });
  const prev = await cmPage.locator('#txnRepPrev').innerText();
  expect(prev).toContain('Sale hoy de Ualá $90.000');
  expect(prev).toContain('cuenta $30.000 por mes');
  await cmPage.click('#txnSaveBtn');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);

  expect(await saldo(cmPage)).toBe(910000);
  const r = (await repartos(cmPage))[0];
  expect(r).toMatchObject({ name: 'Zapatillas', amount: 90000, currency: 'ARS', accountId: 'uala', category: cat, desde: MK(1), meses: 3 });
  expect(await partes(cmPage)).toHaveLength(0);   // ninguna parte toca todavía
  const gastoEsteMes = await cmPage.evaluate(() => _spentMonth(_curMonthKey()));
  expect(gastoEsteMes).toBe(0);
  const c = await cmPage.evaluate((m) => comprometidoDelMes(m), MK(1));
  expect(c.gasto).toBe(30000);
  expect(c.porCategoria[cat]).toBe(30000);
  // el mes en curso no tiene nada comprometido (ya está materializado: no se cuenta doble)
  expect((await cmPage.evaluate((m) => comprometidoDelMes(m), MK(0))).gasto).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('mes siguiente con 1 mes: todo el gasto cuenta en el mes siguiente', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirGasto(cmPage, { nombre: 'Seguro', monto: 45000 });
  await repartir(cmPage, { desde: 'next', meses: 1 });
  await expect(cmPage.locator('#txnRepPrev')).toContainText('cuenta $45.000 en');
  await cmPage.click('#txnSaveBtn');
  expect(await saldo(cmPage)).toBe(955000);
  expect((await cmPage.evaluate((m) => comprometidoDelMes(m), MK(1))).gasto).toBe(45000);
});

test('al llegar cada mes se crea su parte, una sola vez, sin tocar la cuenta; tocar la parte abre el reparto', async ({ cmPage }) => {
  await preparar(cmPage);
  await crear(cmPage, { nombre: 'Zapatillas', monto: 90000, desde: 'next', meses: 3 });
  const base = await saldo(cmPage);
  const id = (await repartos(cmPage))[0].id;

  await hoy(cmPage, `${MK(1)}-05`);
  await cmPage.evaluate(() => { materializeRepartos(); materializeRepartos(); renderFinanzasTab(); });
  let p = await partes(cmPage);
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ id: `rp:${id}:${MK(1)}`, date: `${MK(1)}-01`, name: 'Zapatillas (1/3)', amount: 30000, type: 'expense', accountId: null });
  expect(await saldo(cmPage)).toBe(base);   // no vuelve a tocar la cuenta
  // ya es parte del gasto del mes y deja de estar "comprometido" (no se cuenta doble)
  expect(await cmPage.evaluate((m) => _spentMonth(m), MK(1))).toBe(30000);
  expect((await cmPage.evaluate((m) => comprometidoDelMes(m), MK(1))).gasto).toBe(0);
  expect((await cmPage.evaluate((m) => comprometidoDelMes(m), MK(2))).gasto).toBe(30000);

  await hoy(cmPage, `${MK(3)}-05`);
  await cmPage.evaluate(() => { for (let i = 0; i < 3; i++) { materializeRepartos(); cardsCatchUp(); renderFinanzasTab(); } });
  p = await partes(cmPage);
  expect(p.map((x) => x.id).sort()).toEqual([MK(1), MK(2), MK(3)].map((m) => `rp:${id}:${m}`).sort());
  expect(new Set(p.map((x) => x.id)).size).toBe(3);
  expect(await saldo(cmPage)).toBe(base);

  // En Actividad la parte lleva "Repartido i/n" y al tocarla se abre el reparto.
  await cmPage.evaluate((m) => setTxnMonth(m), MK(1));
  const badge = cmPage.locator('#activityList .rep-badge');
  await expect(badge).toHaveText('Repartido 1/3');
  await badge.evaluate((e) => e.click());   // la lista vive en el overlay de historial (cerrado)
  await expect(cmPage.locator('#modal-reparto')).toHaveClass(/open/);
  await expect(cmPage.locator('#repEdName')).toHaveValue('Zapatillas');
});

test('"desde este mes" materializa la primera parte en el acto', async ({ cmPage }) => {
  await preparar(cmPage);
  await crear(cmPage, { nombre: 'Curso', monto: 30000, desde: 'cur', meses: 3 });
  const p = await partes(cmPage);
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ name: 'Curso (1/3)', amount: 10000, accountId: null });
  expect(await saldo(cmPage)).toBe(970000);
  expect(await cmPage.evaluate(() => _spentMonth(_curMonthKey()))).toBe(10000);
});

test('borrar un reparto devuelve la plata y borra sus partes materializadas', async ({ cmPage }) => {
  await preparar(cmPage);
  await crear(cmPage, { nombre: 'Curso', monto: 30000, desde: 'cur', meses: 3 });
  expect(await saldo(cmPage)).toBe(970000);
  const id = (await repartos(cmPage))[0].id;
  await cmPage.evaluate((i) => openReparto(i), id);
  await expect(cmPage.locator('#modal-reparto')).toHaveClass(/open/);
  cmPage.once('dialog', (d) => d.accept());
  await cmPage.click('#modal-reparto button:has-text("Borrar")');
  expect(await saldo(cmPage)).toBe(1000000);
  expect(await repartos(cmPage)).toHaveLength(0);
  expect(await partes(cmPage)).toHaveLength(0);
  // el deshacer lo trae de vuelta con la plata ya debitada
  await cmPage.evaluate(() => CMUndo.deshacerUltimo());
  expect(await saldo(cmPage)).toBe(970000);
  expect(await repartos(cmPage)).toHaveLength(1);
  expect(await partes(cmPage)).toHaveLength(1);
});

test('editar un reparto lo rehace entero: la cuenta queda debitada una sola vez y las partes se recalculan', async ({ cmPage }) => {
  await preparar(cmPage);
  await crear(cmPage, { nombre: 'Curso', monto: 30000, desde: 'cur', meses: 3 });
  const id = (await repartos(cmPage))[0].id;
  await cmPage.evaluate((i) => openReparto(i), id);
  await cmPage.fill('#repEdMeses', '2');
  await expect(cmPage.locator('#repEdPrev')).toContainText('$15.000 por mes');
  await cmPage.click('#modal-reparto button:has-text("Guardar")');
  expect(await saldo(cmPage)).toBe(970000);
  const r = await repartos(cmPage);
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({ id, meses: 2, amount: 30000 });
  const p = await partes(cmPage);
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ name: 'Curso (1/2)', amount: 15000 });
});

test('convertir un gasto ya cargado: sin cambio neto en la cuenta', async ({ cmPage }) => {
  await preparar(cmPage);
  const hoyIso = await cmPage.evaluate(() => getActiveDate());
  await cmPage.evaluate((h) => {
    S.accounts.find((a) => a.id === 'uala').balance = 940000;   // ya descontó los 60.000
    S.transactions.unshift({ id: 'gasto1', date: h, name: 'Heladera', type: 'expense', amount: 60000, currency: 'ARS', accountId: 'uala', category: '' });
    renderFinanzasTab();
  }, hoyIso);
  await cmPage.evaluate(() => openEditTxn('gasto1'));
  await expect(cmPage.locator('#editRepRow')).toBeVisible();
  await cmPage.check('#editRepOn');
  await cmPage.selectOption('#editRepDesde', 'next');
  await cmPage.fill('#editRepMeses', '2');
  await expect(cmPage.locator('#editRepPrev')).toContainText('Ya salió de Ualá $60.000');
  await cmPage.click('#modal-edit-txn button:has-text("Guardar")');
  expect(await saldo(cmPage)).toBe(940000);
  expect(await cmPage.evaluate(() => S.transactions.some((t) => t.id === 'gasto1'))).toBe(false);
  const r = (await repartos(cmPage))[0];
  expect(r).toMatchObject({ name: 'Heladera', amount: 60000, accountId: 'uala', date: hoyIso, desde: MK(1), meses: 2 });
  expect(await cmPage.evaluate(() => _spentMonth(_curMonthKey()))).toBe(0);
  expect((await cmPage.evaluate((m) => comprometidoDelMes(m), MK(1))).gasto).toBe(30000);
});

test('no se ofrece repartir un gasto pendiente, en dólares o sin cuenta', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.click('#activity-card button:has-text("+ Movimiento")');
  await cmPage.selectOption('#txnType', 'expense');
  await expect(cmPage.locator('#txnRepRow')).toBeHidden();   // sin cuenta
  await cmPage.selectOption('#txnAccount', 'uala');
  await expect(cmPage.locator('#txnRepRow')).toBeVisible();
  await cmPage.selectOption('#txnCurrency', 'USD');
  await expect(cmPage.locator('#txnRepRow')).toBeHidden();
  await cmPage.selectOption('#txnCurrency', 'ARS');
  await cmPage.selectOption('#txnType', 'income');
  await expect(cmPage.locator('#txnRepRow')).toBeHidden();
});

test('centavos exactos: 100,01 en 3 meses suma 100,01 y el resto va a la primera parte', async ({ cmPage }) => {
  await preparar(cmPage);
  const s = await cmPage.evaluate(() => repartoSchedule({ amount: 100.01, meses: 3, desde: '2026-12' }));
  expect(s.map((x) => x.amount)).toEqual([33.35, 33.33, 33.33]);
  expect(s.map((x) => x.month)).toEqual(['2026-12', '2027-01', '2027-02']);
  expect(Math.round(s.reduce((a, x) => a + x.amount, 0) * 100)).toBe(10001);
  await cmPage.evaluate((m) => _repCreate({ date: getActiveDate(), name: 'Centavos', amount: 100.01, accountId: 'uala', category: '', desde: m, meses: 3 }), MK(1));
  const c = await cmPage.evaluate((m) => comprometidoDelMes(m), MK(1));
  expect(c.gasto).toBe(33.35);   // la primera parte lleva el resto
});

test('tarjeta en cuotas con uso diferido: "Desde" mueve el gasto; la compra vieja sin consumeFrom queda igual', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { fecha: `${MK(0)}-05`, monto: 90000, nombre: 'Heladera', modo: 'deferred', cuotas: 3, meses: 3 });
  await expect(cmPage.locator('#ccChFromRow')).toBeVisible();
  await cmPage.selectOption('#ccChFrom', 'next');
  await guardarCompra(cmPage);
  const ch = (await cmPage.evaluate(() => S.cardCharges))[0];
  expect(ch).toMatchObject({ mode: 'deferred', consumeMonths: 3, consumeFrom: MK(1) });
  expect(await cmPage.evaluate((c) => CMTarjetas.expenseSchedule(c).map((e) => e.month), ch)).toEqual([MK(1), MK(2), MK(3)]);
  expect(await cmPage.evaluate(() => S.transactions.filter((t) => t.cardChargeId).length)).toBe(0);   // este mes no cuenta nada
  expect((await cmPage.evaluate((m) => comprometidoDelMes(m), MK(1))).gasto).toBe(30000);

  const viejo = { id: 'v', cardId: 'tj', date: '2026-10-15', amount: 90000, mode: 'deferred', installments: 3, consumeMonths: 3 };
  expect(await cmPage.evaluate((c) => CMTarjetas.expenseSchedule(c).map((e) => e.month), viejo)).toEqual(['2026-10', '2026-11', '2026-12']);
  expect(await cmPage.evaluate((c) => CMTarjetas.validateCharge(c).ok, viejo)).toBe(true);
  // validación: no puede empezar antes del mes de la compra
  const malo = await cmPage.evaluate((c) => CMTarjetas.validateCharge({ ...c, consumeFrom: '2026-09' }), viejo);
  expect(malo.ok).toBe(false);
  expect(malo.error).toContain('antes del mes de la compra');
});

test('presupuesto de un mes futuro: lo comprometido por categoría suma como usado', async ({ cmPage }) => {
  await preparar(cmPage);
  const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
  await cmPage.evaluate(({ m, cat }) => {
    S.budgets = S.budgets || {};
    S.budgets[m] = { fixed: [], reserved: [{ id: 'rs1', name: 'Reservado', category: cat, amount: 50000 }] };
    budgetActiveYear = +m.slice(0, 4); budgetActiveMonth = m;
  }, { m: MK(1), cat });
  await crear(cmPage, { nombre: 'Zapatillas', monto: 90000, categoria: cat, desde: 'next', meses: 3 });
  expect(await cmPage.evaluate((m) => _spentMonth(m), MK(1))).toBe(30000);
  await cmPage.evaluate((m) => { budgetActiveMonth = m; renderBudget(); }, MK(1));
  const label = await cmPage.evaluate((c) => getCatInfo(c, 'expense').label, cat);
  const fila = cmPage.locator('#budgetBody .budget-cmp-row', { hasText: label }).first();
  expect(digitos(await fila.locator('.budget-cmp-num').nth(0).innerText())).toBe('50000');   // plan
  expect(digitos(await fila.locator('.budget-cmp-num').nth(1).innerText())).toBe('30000');   // real = comprometido
  expect(digitos(await fila.locator('.budget-cmp-num').nth(2).innerText())).toBe('20000');   // saldo
  await expect(cmPage.locator('#budgetComprometido')).toContainText('comprometidos');
});

test('bloque "Ya comprometido" en Actividad: gasto que ya cuenta + pagos de tarjetas, con detalle', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(({ m0 }) => {
    S.cardCharges = [
      { id: 'c1', cardId: 'tj', date: `${m0}-05`, amount: 50000, mode: 'now1', installments: 1, category: '', name: 'Super' },
      { id: 'c2', cardId: 'tj', date: `${m0}-05`, amount: 60000, mode: 'deferred', installments: 3, consumeMonths: 3, category: '', name: 'Sillón' },
      { id: 'c3', cardId: 'tj', date: `${m0}-05`, amount: 12000, mode: 'now1', installments: 1, category: '', name: 'Lo cubre otro', cover: { accountId: '', who: 'Otra persona', periods: [] } },
    ];
    renderFinanzasTab();
  }, { m0: MK(0) });
  await crear(cmPage, { nombre: 'Zapatillas', monto: 90000, desde: 'next', meses: 3 });
  await cmPage.evaluate((m) => setTxnMonth(m), MK(1));
  await expect(cmPage.locator('#txnComprometido')).toBeVisible();
  // 30.000 del reparto + 20.000 de la parte del sillón de ese mes (la compra cubierta por otro no cuenta)
  await expect(cmPage.locator('#repCompGasto summary b')).toHaveText('$50.000');
  // cuotas de tarjeta que se pagan ese mes: 50.000 + 20.000 + 12.000 de la cubierta (ocupa la tarjeta igual)
  const pagos = await cmPage.evaluate((m) => comprometidoDelMes(m).pagos, MK(1));
  expect(digitos(await cmPage.locator('#repCompPagos summary b').innerText())).toBe(String(pagos));
  expect(pagos).toBe(50000 + 20000 + 12000);
  await cmPage.click('#repCompGasto summary');
  await expect(cmPage.locator('#repCompGasto li', { hasText: 'Zapatillas (1/3)' })).toBeVisible();
  await expect(cmPage.locator('#repCompGasto li', { hasText: 'Sillón (2/3)' })).toBeVisible();
  await expect(cmPage.locator('#repCompGasto li', { hasText: 'cubre' })).toHaveCount(0);
  // mes en curso: no hay bloque (ya está todo materializado)
  await cmPage.evaluate((m) => setTxnMonth(m), MK(0));
  await expect(cmPage.locator('#txnComprometido')).toBeHidden();
  // historial mensual: el mes futuro aparece rotulado como comprometido
  await cmPage.evaluate(() => { const el = document.getElementById('monthBalanceList'); el.style.display = ''; renderMonthBalanceList(); });
  await expect(cmPage.locator('#monthBalanceList')).toContainText(/Ya comprometido: -ARS\s50[.]000/);
});

test('el "Gasto previsto" del calendario de tarjetas coincide con el de tarjeta del helper', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(({ m0 }) => {
    S.cardCharges = [{ id: 'c2', cardId: 'tj', date: `${m0}-05`, amount: 60000, mode: 'deferred', installments: 3, consumeMonths: 3, category: '', name: 'Sillón' }];
    renderFinanzasTab();
  }, { m0: MK(0) });
  await abrirTarjetas(cmPage, 'calendario');
  const previsto = digitos(await cmPage.locator(`.cc-cal-m[data-month="${MK(1)}"] .cc-cal-exp b`).innerText());
  const c = await cmPage.evaluate((m) => comprometidoDelMes(m), MK(1));
  expect(previsto).toBe(String(c.gastoTarjeta));
  expect(c.gastoTarjeta).toBe(20000);
});

test('recargar la página conserva los repartos y no duplica las partes', async ({ cmPage }) => {
  await preparar(cmPage);
  await crear(cmPage, { nombre: 'Curso', monto: 30000, desde: 'cur', meses: 3 });
  const antes = await cmPage.evaluate(() => localStorage.getItem('lifedash_v2'));
  expect(antes).toContain('"repartos"');
  await cmPage.reload();
  await waitForBoot(cmPage);
  await completeLoginOverlay(cmPage);
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  await cmPage.evaluate(() => { materializeRepartos(); materializeRepartos(); cardsCatchUp(); renderFinanzasTab(); });
  expect(await repartos(cmPage)).toHaveLength(1);
  const p = await partes(cmPage);
  expect(p).toHaveLength(1);
  expect(p[0].name).toBe('Curso (1/3)');
  expect(await saldo(cmPage)).toBe(970000);
});

test.describe('375px', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('el formulario con "Repartir en meses" abierto entra en pantalla, con la casilla a la derecha', async ({ cmPage }) => {
    await preparar(cmPage);
    await cmPage.addStyleTag({ content: '#theme-trigger{display:none!important}' });   // el botón de tema flota encima del formulario en pantalla chica
    await abrirGasto(cmPage, { nombre: 'Zapatillas', monto: 90000 });
    await repartir(cmPage, { desde: 'pick', meses: 3 });
    await expect(cmPage.locator('#txnRepMes')).toBeVisible();
    const m = await cmPage.locator('#modal-add-txn .modal').boundingBox();
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(376);
    const w = await cmPage.evaluate(() => document.documentElement.scrollWidth);
    expect(w).toBeLessThanOrEqual(376);
    const span = await cmPage.locator('#txnRepRow .rep-opt span').boundingBox();
    const box = await cmPage.locator('#txnRepOn').boundingBox();
    expect(box.x).toBeGreaterThan(span.x);   // la casilla va al final, a la derecha
    await cmPage.screenshot({ path: 'test-results/reparto-375.png' });
  });
});
