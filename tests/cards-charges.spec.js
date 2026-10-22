// Tarjetas de crédito (etapa 5b): compras con tarjeta, calendario de cuotas y pagos de resumen.
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna tarjeta ni cuenta.
// La fecha de "hoy" se fija pisando getActiveDate() (el helper que usa todo el código de tarjetas).
'use strict';
const { test, expect } = require('./support/fixtures');
const { abrirTarjetas, cerrarTarjetas, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra, abrirPagoResumen } = require('./support/tarjetas-ui');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 865000 };
const MP = { id: 'mp', name: 'Mercado Pago', limit: 425000, closeDay: 5, dueDay: 10, openingUsed: 357000 };
const GALICIA = { id: 'gal', name: 'Galicia', limit: 1000000, closeDay: 29, dueDay: 11, openingUsed: 0 };

async function preparar(page, { hoy = '2026-10-15', pagarDesde = 'uala', cards = [NARANJA] } = {}) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, pagarDesde, cards }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
      { id: 'usd', name: 'Dólares', type: 'bank', balance: 10, currency: 'USD', icon: '💵' },
    ];
    S.cards = cards.map((c) => ({ ...c, ...(pagarDesde ? { payAccountId: pagarDesde } : {}) }));
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
    renderFinanzasTab();
  }, { hoy, pagarDesde, cards });
}

const irA = (page, hoy) => page.evaluate((h) => { window.getActiveDate = () => h; renderFinanzasTab(); }, hoy);
const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const gastosTarjeta = (page) => page.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => ({ id: t.id, date: t.date, amount: t.amount, type: t.type, accountId: t.accountId, currency: t.currency, category: t.category, name: t.name })));
const pagos = (page) => page.evaluate(() => S.cardPayments.map((p) => ({ id: p.id, key: p.key, cardId: p.cardId, date: p.date, amount: p.amount, kind: p.kind, accountId: p.accountId })));
const cargos = (page) => page.evaluate(() => S.cardCharges);
const digitos = (s) => s.replace(/\D/g, '');
const fila = (page, name) => page.locator('.cc-row', { hasText: name });
// "A pagar el DD/MM" de cada tarjeta vive en la pestaña Calendario del overlay.
const vence = (page, name) => page.locator('.cc-due-card', { hasText: name });

async function abrirCompra(page) {
  await abrirCompraDesdeMovimientos(page);
}

async function cargar(page, c) {
  await abrirCompra(page);
  await llenarCompra(page, c);
  await guardarCompra(page);
}

test('DoD 2: 50.000 en 1 pago el 15-oct con Naranja: gasto en octubre, la plata sale el 10-nov, el usado sube', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
  await cargar(cmPage, { monto: 50000, nombre: 'Compra de prueba', categoria: cat });

  const ch = (await cargos(cmPage))[0];
  expect(ch).toMatchObject({ cardId: 'nar', date: '2026-10-15', amount: 50000, mode: 'now1' });
  const g = await gastosTarjeta(cmPage);
  expect(g).toHaveLength(1);
  expect(g[0]).toMatchObject({ id: `cc:${ch.id}:2026-10`, date: '2026-10-15', amount: 50000, type: 'expense', accountId: null, currency: 'ARS', category: cat });
  // Compra: no toca saldos; el usado sube.
  expect(await saldo(cmPage, 'uala')).toBe(1000000);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$915.000');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/11: $50.000');

  // Un día antes del vencimiento sigue sin salir plata.
  await irA(cmPage, '2026-11-09');
  expect(await saldo(cmPage, 'uala')).toBe(1000000);
  expect(await pagos(cmPage)).toHaveLength(0);
  // El 10/11 sale solo: baja el saldo y el usado, sin crear gasto ni ingreso.
  await irA(cmPage, '2026-11-10');
  expect(await saldo(cmPage, 'uala')).toBe(950000);
  expect(await pagos(cmPage)).toEqual([{ id: 'auto:nar:2026-11-10', key: 'auto:nar:2026-11-10', cardId: 'nar', date: '2026-11-10', amount: 50000, kind: 'auto', accountId: 'uala' }]);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
  await expect(vence(cmPage, 'Naranja')).toHaveCount(0);
  expect(await gastosTarjeta(cmPage)).toHaveLength(1);
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(1);
  expect(consoleErrors).toEqual([]);
});

test('DoD 3: 90.000 diferida (5 meses, 3 cuotas): 18.000 de gasto por mes y 30.000 en cada uno de los 3 vencimientos', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await abrirCompra(cmPage);
  await llenarCompra(cmPage, { monto: 90000, nombre: 'Alimento', modo: 'deferred', cuotas: 3, meses: 5 });
  // Vista previa antes de guardar: resumen, vencimiento de cada cuota y gasto de cada mes.
  const pv = cmPage.locator('#ccChPreview');
  await expect(pv).toContainText('cierra el 27/10/2026 y vence el 10/11/2026');
  await expect(pv).toContainText('Cuota 1 de 3 · vence el 10/11/2026 · $30.000');
  await expect(pv).toContainText('Cuota 2 de 3 · vence el 10/12/2026 · $30.000');
  await expect(pv).toContainText('Cuota 3 de 3 · vence el 10/01/2027 · $30.000');
  for (const m of ['octubre 2026', 'noviembre 2026', 'diciembre 2026', 'enero 2027', 'febrero 2027']) await expect(pv).toContainText(`${m} · $18.000`);
  await guardarCompra(cmPage);

  const ch = (await cargos(cmPage))[0];
  expect(ch).toMatchObject({ mode: 'deferred', installments: 3, consumeMonths: 5, amount: 90000 });
  // Solo el mes que ya llegó (el gasto arranca en el mes de la compra).
  expect((await gastosTarjeta(cmPage)).map((t) => t.id)).toEqual([`cc:${ch.id}:2026-10`]);

  await irA(cmPage, '2026-11-10');
  expect((await gastosTarjeta(cmPage)).map((t) => t.amount)).toEqual([18000, 18000]);
  expect((await pagos(cmPage)).map((p) => p.id)).toEqual(['auto:nar:2026-11-10']);
  expect(await saldo(cmPage, 'uala')).toBe(970000);

  await irA(cmPage, '2027-03-01');
  const g = await gastosTarjeta(cmPage);
  expect(g.map((t) => t.id).sort()).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map((m) => `cc:${ch.id}:${m}`));
  expect(g.every((t) => t.amount === 18000)).toBe(true);
  expect(g.reduce((s, t) => s + t.amount, 0)).toBe(90000);
  const p = await pagos(cmPage);
  expect(p.map((x) => [x.id, x.amount])).toEqual([['auto:nar:2026-11-10', 30000], ['auto:nar:2026-12-10', 30000], ['auto:nar:2027-01-10', 30000]]);
  expect(await saldo(cmPage, 'uala')).toBe(910000);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
  expect(consoleErrors).toEqual([]);
});

test('DoD 4: 90.000 en 3 cuotas con uso inmediato: gasto completo en el mes de compra y 3 pagos de 30.000', async ({ cmPage }) => {
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

test('DoD 5: adelanto de 100.000 en 2 cuotas: entra a la cuenta, no es ingreso ni gasto y consume crédito', async ({ cmPage }) => {
  await preparar(cmPage);
  const nwAntes = await cmPage.evaluate(() => calcNetWorth());
  await abrirCompra(cmPage);
  await llenarCompra(cmPage, { monto: 100000, nombre: 'Adelanto a Didi', modo: 'advance', cuotas: 2, cuenta: 'efe' });
  await expect(cmPage.locator('#ccChPreview')).toContainText('No es ingreso ni gasto');
  await expect(cmPage.locator('#txnCategoryRow')).toBeHidden();
  await guardarCompra(cmPage);

  expect(await saldo(cmPage, 'efe')).toBe(150000);
  // Etapa 7: el adelanto suma plata a la cuenta y suma crédito usado, así que el patrimonio no cambia.
  expect(await cmPage.evaluate(() => calcNetWorth())).toBe(nwAntes);
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(0);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$965.000');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/11: $50.000');

  await irA(cmPage, '2026-12-10');
  expect((await pagos(cmPage)).map((x) => [x.date, x.amount])).toEqual([['2026-11-10', 50000], ['2026-12-10', 50000]]);
  expect(await saldo(cmPage, 'uala')).toBe(900000);
  expect(await saldo(cmPage, 'efe')).toBe(150000);
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(0);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
});

test('compra el día exacto del cierre cae en el resumen siguiente', async ({ cmPage }) => {
  await preparar(cmPage, { hoy: '2026-10-27' });
  await abrirCompra(cmPage);
  await llenarCompra(cmPage, { fecha: '2026-10-26', monto: 1000 });
  await expect(cmPage.locator('#ccChPreview')).toContainText('cierra el 27/10/2026 y vence el 10/11/2026');
  await cmPage.fill('#ccChDate', '2026-10-27');
  await expect(cmPage.locator('#ccChPreview')).toContainText('cierra el 27/11/2026 y vence el 10/12/2026');
  await cmPage.click('#modal-add-txn .btn-primary');
  await expect(vence(cmPage, 'Naranja')).toContainText('A pagar el 10/12: $1.000');
  await expect(vence(cmPage, 'Naranja')).not.toContainText('A pagar el 10/11');
});

test('materializar gastos es idempotente y no crea meses futuros', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 90000, modo: 'deferred', cuotas: 3, meses: 5, nombre: 'X' });
  const r = await cmPage.evaluate(() => {
    const antes = S.transactions.length;
    const a = materializeCardExpenses(), b = materializeCardExpenses();
    renderFinanzasTab(); renderFinanzasTab();
    return { antes, a, b, despues: S.transactions.length };
  });
  expect(r).toEqual({ antes: 1, a: false, b: false, despues: 1 });
  // Llega noviembre: se crea una sola vez aunque se corra muchas veces.
  const r2 = await cmPage.evaluate(() => {
    window.getActiveDate = () => '2026-11-02';
    const a = materializeCardExpenses(), b = materializeCardExpenses();
    renderFinanzasTab(); renderFinanzasTab();
    return { a, b, ids: S.transactions.map((t) => t.id).sort() };
  });
  expect(r2.a).toBe(true);
  expect(r2.b).toBe(false);
  expect(r2.ids).toHaveLength(2);
  expect(new Set(r2.ids).size).toBe(2);
});

test('pago automático: dos renders no restan dos veces; sin cuenta de pago no se paga y avisa', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 50000 });
  await irA(cmPage, '2026-11-10');
  await irA(cmPage, '2026-11-10');
  await cmPage.evaluate(() => { applyCardAutoPayments(); applyCardAutoPayments(); });
  expect(await saldo(cmPage, 'uala')).toBe(950000);
  expect(await pagos(cmPage)).toHaveLength(1);
  // Reorganización de Finanzas: la fila ya no repite "Se paga solo desde Ualá"; con cuenta de pago tampoco avisa que falta.
  await expect(fila(cmPage, 'Naranja')).not.toContainText('Se paga solo');
  await expect(fila(cmPage, 'Naranja')).not.toContainText('Elegí desde qué cuenta se paga');

  // Otro dispositivo ya había guardado el pago (mismo id): no se vuelve a restar.
  const r = await cmPage.evaluate(() => {
    const cloud = JSON.parse(JSON.stringify(S));
    S.cardPayments = []; S.accounts.find((a) => a.id === 'uala').balance = 1000000;
    const base = JSON.parse(JSON.stringify(S));
    renderFinanzasTab();                                  // dispositivo B hace el mismo pago por su cuenta
    const local = JSON.parse(JSON.stringify(S));
    const merged = _rescueLocal(_mergeStates(base, local, cloud), local);
    return { pagos: merged.cardPayments.length, saldo: merged.accounts.find((a) => a.id === 'uala').balance };
  });
  expect(r).toEqual({ pagos: 1, saldo: 950000 });

  // Sin cuenta de pago: no se paga y se avisa.
  await preparar(cmPage, { pagarDesde: null });
  await cargar(cmPage, { monto: 50000 });
  await irA(cmPage, '2026-12-01');
  expect(await pagos(cmPage)).toHaveLength(0);
  expect(await saldo(cmPage, 'uala')).toBe(1000000);
  await expect(fila(cmPage, 'Naranja')).toContainText('Elegí desde qué cuenta se paga');
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$915.000');
});

test('el modal de tarjeta elige la cuenta de pago (solo cuentas en pesos) y se puede quitar', async ({ cmPage }) => {
  await preparar(cmPage, { pagarDesde: null });
  await abrirTarjetas(cmPage, 'tarjetas');
  await fila(cmPage, 'Naranja').locator('button[aria-label="Editar tarjeta"]').click();
  const opciones = await cmPage.locator('#cardPayAccount option').allInnerTexts();
  expect(opciones.join('|')).toContain('Ualá');
  expect(opciones.join('|')).not.toContain('Dólares');
  await cmPage.selectOption('#cardPayAccount', 'uala');
  await cmPage.click('#modal-card button:has-text("Guardar")');
  expect(await cmPage.evaluate(() => S.cards[0].payAccountId)).toBe('uala');
  await fila(cmPage, 'Naranja').locator('button[aria-label="Editar tarjeta"]').click();
  await expect(cmPage.locator('#cardPayAccount')).toHaveValue('uala');
  await cmPage.selectOption('#cardPayAccount', '');
  await cmPage.click('#modal-card button:has-text("Guardar")');
  expect(await cmPage.evaluate(() => 'payAccountId' in S.cards[0])).toBe(false);
});

test('pago manual: baja el usado y el saldo; avisa si supera lo usado pero deja registrarlo', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirPagoResumen(cmPage);
  await expect(cmPage.locator('#modal-card-payment')).toContainText('no vuelvas a cargar ese pago');
  await expect(cmPage.locator('#ccPayAccount')).toHaveValue('uala');
  await cmPage.fill('#ccPayAmount', '100000');
  await cmPage.fill('#ccPayNote', 'resumen anterior');
  await cmPage.click('#modal-card-payment .btn-primary');
  await expect(cmPage.locator('#modal-card-payment')).not.toHaveClass(/open/);
  const p = await cmPage.evaluate(() => S.cardPayments);
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ cardId: 'nar', amount: 100000, accountId: 'uala', kind: 'manual', date: '2026-10-15', note: 'resumen anterior' });
  expect(p[0].key).toBe(`manual:${p[0].id}`);
  expect(await saldo(cmPage, 'uala')).toBe(900000);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$765.000');
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(0);

  // Más de lo usado: aviso en vivo, pero se registra.
  await abrirPagoResumen(cmPage);
  await cmPage.fill('#ccPayAmount', '2000000');
  await expect(cmPage.locator('#ccPayWarn')).toBeVisible();
  await expect(cmPage.locator('#ccPayWarn')).toContainText('más de lo que figura usado');
  await cmPage.click('#modal-card-payment .btn-primary');
  await expect(cmPage.locator('#modal-card-payment')).not.toHaveClass(/open/);
  expect(await cmPage.evaluate(() => S.cardPayments.length)).toBe(2);
  expect(await saldo(cmPage, 'uala')).toBe(-1100000);
});

test('pago manual: validaciones con mensaje en pantalla', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirPagoResumen(cmPage);
  const err = cmPage.locator('#ccPayErr');
  const guardar = () => cmPage.click('#modal-card-payment .btn-primary');
  const casos = [
    [{ monto: '', cuenta: 'uala', fecha: '2026-10-15' }, 'mayor a 0'],
    [{ monto: '0', cuenta: 'uala', fecha: '2026-10-15' }, 'mayor a 0'],
    [{ monto: '-5', cuenta: 'uala', fecha: '2026-10-15' }, 'mayor a 0'],
    [{ monto: '10.005', cuenta: 'uala', fecha: '2026-10-15' }, '2 decimales'],
    [{ monto: '100', cuenta: '', fecha: '2026-10-15' }, 'cuenta'],
    [{ monto: '100', cuenta: 'uala', fecha: '2026-10-16' }, 'futura'],
    [{ monto: '100', cuenta: 'uala', fecha: '' }, 'Fecha'],
  ];
  for (const [c, palabra] of casos) {
    await cmPage.fill('#ccPayAmount', c.monto);
    await cmPage.selectOption('#ccPayAccount', c.cuenta);
    await cmPage.fill('#ccPayDate', c.fecha);
    await guardar();
    await expect(cmPage.locator('#modal-card-payment')).toHaveClass(/open/);
    await expect(err).toContainText(palabra);
  }
  expect(await cmPage.evaluate(() => S.cardPayments.length)).toBe(0);
  expect(await saldo(cmPage, 'uala')).toBe(1000000);
});

test('borrar compra: confirma, quita cargo y gastos, y avisa que los pagos ya hechos no se deshacen', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 90000, nombre: 'Carne', modo: 'nowInst', cuotas: 3 });
  await irA(cmPage, '2026-11-10');
  expect(await pagos(cmPage)).toHaveLength(1);
  await abrirTarjetas(cmPage, 'compras');
  const borrar = () => cmPage.locator('.cc-chg button[aria-label="Borrar compra"]').click();

  // Cancelar no borra nada.
  cmPage.once('dialog', (d) => d.dismiss());
  await borrar();
  expect(await cargos(cmPage)).toHaveLength(1);
  expect(await gastosTarjeta(cmPage)).toHaveLength(1);

  let msg = '';
  cmPage.once('dialog', (d) => { msg = d.message(); d.accept(); });
  await borrar();
  expect(msg).toContain('ya se pagaron 1 cuota');
  expect(msg).toContain('$30.000');
  expect(msg).toContain('no se deshacen');
  expect(await cargos(cmPage)).toHaveLength(0);
  expect(await gastosTarjeta(cmPage)).toHaveLength(0);
  // El pago ya hecho queda registrado y el saldo no se revierte.
  expect(await pagos(cmPage)).toHaveLength(1);
  expect(await saldo(cmPage, 'uala')).toBe(970000);
  await expect(cmPage.locator('#cardChargeList')).toContainText('Todavía no cargaste compras con tarjeta');
  await expect(vence(cmPage, 'Naranja')).toHaveCount(0);
  // Otro render no resucita ni la compra ni sus gastos.
  await irA(cmPage, '2027-03-01');
  expect(await gastosTarjeta(cmPage)).toHaveLength(0);
  expect(await pagos(cmPage)).toHaveLength(1);
});

test('borrar un adelanto devuelve a la cuenta lo que había entrado', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 100000, modo: 'advance', cuotas: 2, cuenta: 'efe', nombre: 'Adelanto' });
  expect(await saldo(cmPage, 'efe')).toBe(150000);
  await abrirTarjetas(cmPage, 'compras');
  let msg = '';
  cmPage.once('dialog', (d) => { msg = d.message(); d.accept(); });
  await cmPage.locator('.cc-chg button[aria-label="Borrar compra"]').click();
  expect(msg).toContain('Se descuentan $100.000 de "Efectivo"');
  expect(msg).not.toContain('ya se pagaron');
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
});

test('calendario de la compra: cuotas con vencimiento, marca de pagada y gasto por mes', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 90000, nombre: 'Alimento', modo: 'deferred', cuotas: 3, meses: 5 });
  await irA(cmPage, '2026-11-10');
  await abrirTarjetas(cmPage, 'compras');
  const c = cmPage.locator('.cc-chg');
  await c.locator('summary').click();
  await expect(c).toContainText('Naranja · 15/10/2026 · En cuotas, uso diferido');
  const items = c.locator('li');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('Cuota 1 de 3 · vence el 10/11/2026 · $30.000 · pagada');
  await expect(items.nth(1)).toContainText('Cuota 2 de 3 · vence el 10/12/2026 · $30.000');
  await expect(items.nth(1)).not.toContainText('pagada');
  await expect(c).toContainText('Gasto repartido en 5 meses desde octubre 2026 ($18.000 por mes)');
});

test('lista de compras: la más reciente arriba', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { fecha: '2026-10-01', monto: 1000, nombre: 'Vieja' });
  await cargar(cmPage, { fecha: '2026-10-10', monto: 2000, nombre: 'Nueva' });
  await expect(cmPage.locator('.cc-chg-name')).toHaveText(['Nueva', 'Vieja']);
});

test('validaciones de la compra: mensaje en pantalla y no se guarda nada', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirCompra(cmPage);
  const err = cmPage.locator('#ccChErr');
  const guardar = () => cmPage.click('#modal-add-txn .btn-primary');
  const casos = [
    [{ monto: '100.123' }, '2 decimales'],
    [{ monto: '0.001' }, '2 decimales'],
    [{ monto: '1.005' }, '2 decimales'],
    [{ monto: '0' }, 'mayor a 0'],
    [{ monto: '-10' }, 'mayor a 0'],
    [{ monto: '' }, 'mayor a 0'],
    [{ monto: '1000', modo: 'nowInst', cuotas: '0' }, 'cuotas'],
    [{ monto: '1000', modo: 'nowInst', cuotas: '2.5' }, 'cuotas'],
    [{ monto: '1000', modo: 'nowInst', cuotas: '61' }, 'cuotas'],
    [{ monto: '1000', modo: 'nowInst', cuotas: '' }, 'cuotas'],
    [{ monto: '1000', modo: 'deferred', cuotas: '3', meses: '0' }, 'meses'],
    [{ monto: '1000', modo: 'deferred', cuotas: '3', meses: '' }, 'meses'],
    [{ monto: '1000', modo: 'advance', cuotas: '2', cuenta: '' }, 'cuenta'],
    [{ monto: '1000', fecha: '' }, 'Fecha'],
  ];
  for (const [c, palabra] of casos) {
    await cmPage.selectOption('#ccChMode', c.modo || 'now1');
    await cmPage.fill('#ccChDate', c.fecha === undefined ? '2026-10-15' : c.fecha);
    await cmPage.fill('#txnAmount', c.monto);
    if (c.cuotas !== undefined) await cmPage.fill('#ccChInst', c.cuotas);
    if (c.meses !== undefined) await cmPage.fill('#ccChMonths', c.meses);
    if (c.modo === 'advance') await cmPage.selectOption('#ccChToAcc', c.cuenta);
    await guardar();
    await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
    await expect(err).toContainText(palabra);
  }
  expect(await cargos(cmPage)).toHaveLength(0);
  expect(await cmPage.evaluate(() => S.transactions.length)).toBe(0);
  // Con 2 decimales exactos sí guarda.
  await cmPage.selectOption('#ccChMode', 'now1');
  await cmPage.fill('#ccChDate', '2026-10-15');
  await cmPage.fill('#txnAmount', '1234.56');
  await guardar();
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  expect((await cargos(cmPage))[0].amount).toBe(1234.56);
});

test('XSS: la descripción con HTML se muestra como texto', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 1000, nombre: '<b>x</b><img src=x onerror="window.__xss=1">' });
  const nombre = cmPage.locator('.cc-chg-name');
  await expect(nombre).toHaveText('<b>x</b><img src=x onerror="window.__xss=1">');
  await expect(cmPage.locator('#cardChargeList .cc-chg-name b, #cardChargeList .cc-chg-name img')).toHaveCount(0);
  expect(await cmPage.evaluate(() => window.__xss)).toBeUndefined();
  // También en la actividad del mes (renderActivity ya escapa el nombre del gasto).
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
  await expect(cmPage.locator('#activityList .act-name', { hasText: '<b>x</b>' }).first()).toBeVisible();
  await expect(cmPage.locator('#activityList .act-name b')).toHaveCount(0);
});

test('doble clic en Guardar no duplica la compra', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirCompra(cmPage);
  await llenarCompra(cmPage, { monto: 5000, nombre: 'Una sola vez' });
  await cmPage.evaluate(() => {
    const b = document.querySelector('#modal-add-txn .btn-primary');
    b.click(); b.click();
  });
  expect(await cargos(cmPage)).toHaveLength(1);
  expect(await gastosTarjeta(cmPage)).toHaveLength(1);
  // Lo mismo con el pago manual.
  await abrirPagoResumen(cmPage);
  await cmPage.fill('#ccPayAmount', '1000');
  await cmPage.evaluate(() => {
    const b = document.querySelector('#modal-card-payment .btn-primary');
    b.click(); b.click();
  });
  expect(await cmPage.evaluate(() => S.cardPayments.length)).toBe(1);
  expect(await saldo(cmPage, 'uala')).toBe(999000);
});

test('sin tarjetas: el botón de Compras avisa en vez de abrir el formulario', async ({ cmPage }) => {
  await preparar(cmPage, { cards: [] });
  await abrirTarjetas(cmPage, 'compras');
  await cmPage.click('#tj-pane-compras button:has-text("+ Compra con tarjeta")');
  await expect(cmPage.locator('#modal-add-txn')).not.toHaveClass(/open/);
  await expect(cmPage.locator('#toast')).toContainText('Primero agregá una tarjeta');
});

test('el fondo de la barra y del aro sigue el tema (variable --border)', async ({ cmPage }) => {
  await preparar(cmPage);
  const r = await cmPage.evaluate(() => {
    const probe = document.createElement('i'); probe.style.background = 'var(--border)'; document.body.appendChild(probe);
    const ref = getComputedStyle(probe).backgroundColor; probe.remove();
    const bar = getComputedStyle(document.querySelector('.cc-bar')).backgroundColor;
    const probe2 = document.createElement('i'); probe2.style.color = 'var(--border)'; document.body.appendChild(probe2);
    const ref2 = getComputedStyle(probe2).color; probe2.remove();
    const ring = getComputedStyle(document.querySelector('.cc-ring-track')).stroke;
    return { ref, bar, ref2, ring };
  });
  expect(r.bar).toBe(r.ref);
  expect(r.ring).toBe(r.ref2);
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sin scroll horizontal, texto alineado con el resto de las cards y modales completos', async ({ cmPage }) => {
    await preparar(cmPage, { cards: [NARANJA, MP, GALICIA] });
    await cargar(cmPage, { monto: 90000, nombre: 'Compra con un nombre bastante largo para probar el ajuste de línea', modo: 'deferred', cuotas: 3, meses: 5 });
    await cargar(cmPage, { card: 'mp', monto: 100000, nombre: 'Adelanto', modo: 'advance', cuotas: 2, cuenta: 'efe' });
    await cmPage.locator('#credit-card').scrollIntoViewIfNeeded();
    await abrirTarjetas(cmPage, 'compras');
    await cmPage.locator('.cc-chg summary').first().click();
    const ovw = await cmPage.locator('#ov-tarjetas .cm-ov-body').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(ovw.sw).toBeLessThanOrEqual(ovw.cw + 1);
    await cerrarTarjetas(cmPage);
    const m = await cmPage.evaluate(() => {
      const card = document.querySelector('#credit-card').getBoundingClientRect();
      const name = document.querySelector('.cc-name').getBoundingClientRect();
      return {
        sw: document.body.scrollWidth, cw: document.documentElement.clientWidth,
        csw: document.querySelector('#credit-card').scrollWidth, ccw: document.querySelector('#credit-card').clientWidth,
        padName: name.left - card.left,
      };
    });
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    expect(m.csw).toBeLessThanOrEqual(m.ccw + 1);
    expect(m.padName).toBeGreaterThanOrEqual(12);

    for (const abrir of [
      async () => { await abrirCompra(cmPage); await cmPage.selectOption('#ccChMode', 'deferred'); await cmPage.fill('#txnAmount', '90000'); },
      async () => { await abrirPagoResumen(cmPage); await cmPage.fill('#ccPayAmount', '5000000'); },
    ]) {
      await abrir();
      const modal = cmPage.locator('.modal-overlay.open .modal');
      await modal.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
      const b = await modal.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(391);
      expect(b.y + b.height).toBeLessThanOrEqual(845);
      const ov = await modal.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
      expect(ov.sw).toBeLessThanOrEqual(ov.cw + 1);
      // El botón principal se alcanza (no queda cortado fuera del scroll del modal).
      await modal.locator('.btn-primary').scrollIntoViewIfNeeded();
      await expect(modal.locator('.btn-primary')).toBeInViewport();
      await cmPage.click('.modal-overlay.open .btn-ghost');
    }
  });
});

// ── Hallazgos de la verificación ciega ──
const cuotas = (page) => page.evaluate(() => CMTarjetas.dueTotals(S.cards[0], S.cardCharges, '1900-01-01', '2999-12-31'));

test('tarjeta con compras: cierre y vencimiento bloqueados, y saveCard rechaza cambiarlos sin tocar las cuotas', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 90000, nombre: 'Alimento', modo: 'deferred', cuotas: 3, meses: 5 });
  const antes = await cuotas(cmPage);
  expect(antes.length).toBeGreaterThan(0);

  await cmPage.evaluate(() => openCardModal('nar'));
  await expect(cmPage.locator('#cardCloseDay')).toBeDisabled();
  await expect(cmPage.locator('#cardDueDay')).toBeDisabled();
  await expect(cmPage.locator('#cardCycleNote')).toBeVisible();
  await expect(cmPage.locator('#cardCycleNote')).toContainText('No se pueden cambiar mientras la tarjeta tenga compras cargadas');
  await expect(cmPage.locator('#cardName')).toBeEnabled();
  await expect(cmPage.locator('#cardLimit')).toBeEnabled();
  await expect(cmPage.locator('#cardOpeningUsed')).toBeEnabled();
  await expect(cmPage.locator('#cardPayAccount')).toBeEnabled();

  // Defensa en el código: aunque alguien reabra los campos, saveCard no cambia el ciclo.
  await cmPage.evaluate(() => {
    document.getElementById('cardCloseDay').disabled = false;
    document.getElementById('cardCloseDay').value = '5';
    saveCard();
  });
  await expect(cmPage.locator('#cardErr')).toContainText('No se pueden cambiar el cierre ni el vencimiento');
  const c = await cmPage.evaluate(() => S.cards[0]);
  expect(c).toMatchObject({ closeDay: 27, dueDay: 10 });
  expect(await cuotas(cmPage)).toEqual(antes);

  // Nombre y límite siguen editables.
  await cmPage.evaluate(() => {
    document.getElementById('cardCloseDay').value = '27';
    document.getElementById('cardName').value = 'Naranja X';
    document.getElementById('cardLimit').value = '2000000';
    saveCard();
  });
  expect(await cmPage.evaluate(() => S.cards[0])).toMatchObject({ name: 'Naranja X', limit: 2000000, closeDay: 27, dueDay: 10 });
});

test('tarjeta sin compras: el ciclo sigue siendo editable', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => openCardModal('nar'));
  await expect(cmPage.locator('#cardCloseDay')).toBeEnabled();
  await expect(cmPage.locator('#cardDueDay')).toBeEnabled();
  await expect(cmPage.locator('#cardCycleNote')).toBeHidden();
  await cmPage.fill('#cardCloseDay', '5');
  await cmPage.fill('#cardDueDay', '15');
  await cmPage.evaluate(() => saveCard());
  expect(await cmPage.evaluate(() => S.cards[0])).toMatchObject({ closeDay: 5, dueDay: 15 });
  // Y una tarjeta nueva abre con los campos libres aunque la anterior tenga compras.
  await cmPage.evaluate(() => openCardModal());
  await expect(cmPage.locator('#cardCloseDay')).toBeEnabled();
});

test('borrar desde Actividad un gasto de tarjeta no lo borra y avisa; uno normal sí se borra', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 50000, nombre: 'Compra tarjeta' });
  const g = (await gastosTarjeta(cmPage))[0];
  await cmPage.evaluate(() => {
    S.transactions.push({ id: 'normal1', type: 'expense', name: 'Normal', amount: 100, date: '2026-10-15', accountId: 'efe', currency: 'ARS', category: '' });
    window.confirm = () => true;
  });
  await cmPage.evaluate((id) => { openEditTxn(id); }, g.id);
  await cmPage.click('#modal-edit-txn button:has-text("Eliminar")');
  await expect(cmPage.locator('#toast')).toContainText('Este gasto viene de una compra con tarjeta. Borralo desde la compra en Tarjetas.');
  await expect(cmPage.locator('#toast')).not.toContainText('eliminado');
  expect(await gastosTarjeta(cmPage)).toHaveLength(1);
  expect(await cmPage.evaluate(() => S.transactions.some((t) => t.id === 'normal1'))).toBe(true);

  await cmPage.evaluate(() => deleteTransaction('normal1'));
  expect(await cmPage.evaluate(() => S.transactions.some((t) => t.id === 'normal1'))).toBe(false);
  expect(await gastosTarjeta(cmPage)).toHaveLength(1);
});

test('Registrar pago de resumen: la barra de error vacía no se ve, y con error sí', async ({ cmPage }) => {
  await preparar(cmPage);
  await abrirPagoResumen(cmPage);
  await expect(cmPage.locator('#ccPayErr')).toBeHidden();
  await cmPage.fill('#ccPayAmount', '0');
  await cmPage.evaluate(() => saveCardPayment());
  await expect(cmPage.locator('#ccPayErr')).toBeVisible();
});
