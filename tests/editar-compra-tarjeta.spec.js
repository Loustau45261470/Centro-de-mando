// Editar y borrar una compra con tarjeta (también una con fecha futura dentro del mes en curso).
// Se edita con el mismo formulario del alta (modal-add-txn), desde el lápiz del movimiento y desde Tarjetas → Compras.
// Además, el aviso (#toast) tiene que verse por encima de overlays y modales.
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna cuenta ni tarjeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const { abrirTarjetas, cerrarTarjetas, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra } = require('./support/tarjetas-ui');

const PAGADA = 'Esta compra ya tiene cuotas pagadas: no se puede editar. Podés borrarla y cargarla de nuevo.';
const HOY = '2026-10-27';

async function preparar(page, hoy = HOY) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate((hoy) => {
    window.getActiveDate = () => hoy;
    S.accounts = [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
    ];
    S.cards = [
      { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'uala' },
      { id: 'mp', name: 'Mercado Pago', limit: 500000, closeDay: 5, dueDay: 10, openingUsed: 0, payAccountId: 'uala' },
    ];
    S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
    txnActiveMonth = hoy.slice(0, 7);
    renderFinanzasTab();
  }, hoy);
}

const irA = (page, hoy) => page.evaluate((h) => { window.getActiveDate = () => h; renderFinanzasTab(); }, hoy);
const saldo = (page, id) => page.evaluate((i) => S.accounts.find((a) => a.id === i).balance, id);
const cargos = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.cardCharges)));
const gastosTarjeta = (page) => page.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => ({ ...t })));
const modalAlta = (page) => page.locator('#modal-add-txn');

async function cargar(page, c, pct) {
  await abrirCompraDesdeMovimientos(page);
  await llenarCompra(page, c);
  if (pct) await page.locator('#txnDiscount').getByRole('radio', { name: `${pct}%`, exact: true }).click();
  await guardarCompra(page);
}

// El lápiz del movimiento en la lista de Movimientos del mes en curso.
async function lapizDeMovimiento(page, nombre) {
  await page.evaluate(() => { renderActivity(); });
  await page.locator('#activityList .activity-row', { hasText: nombre }).locator('button[title="Editar"]').dispatchEvent('click');
}

test('1) compra del 29/10 (hoy 27/10): el lápiz del movimiento abre "Editar compra" precargada y guardar la reemplaza conservando el id', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 5000, nombre: 'Compra futura', fecha: '2026-10-29' });
  const [orig] = await cargos(cmPage);
  expect(orig).toMatchObject({ date: '2026-10-29', amount: 5000 });
  const [g] = await gastosTarjeta(cmPage);
  expect(g).toMatchObject({ id: `cc:${orig.id}:2026-10`, date: '2026-10-29', amount: 5000 });

  await lapizDeMovimiento(cmPage, 'Compra futura');
  await expect(modalAlta(cmPage)).toHaveClass(/open/);
  await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Editar compra');
  await expect(cmPage.locator('#txnSaveBtn')).toHaveText('Guardar cambios');
  await expect(cmPage.locator('#txnDeleteChargeBtn')).toBeVisible();
  await expect(cmPage.locator('#txnAccount')).toHaveValue('card:nar');
  await expect(cmPage.locator('#ccChDate')).toHaveValue('2026-10-29');
  await expect(cmPage.locator('#txnAmount')).toHaveValue('5000');
  await expect(cmPage.locator('#txnName')).toHaveValue('Compra futura');
  await expect(cmPage.locator('#ccChMode')).toHaveValue('now1');

  await cmPage.fill('#txnAmount', '7500');
  await cmPage.fill('#txnName', 'Compra futura editada');
  await cmPage.fill('#ccChDate', '2026-10-30');
  await cmPage.click('#txnSaveBtn');
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);

  const lista = await cargos(cmPage);
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({ id: orig.id, date: '2026-10-30', amount: 7500, name: 'Compra futura editada', cardId: 'nar', mode: 'now1' });
  const gs = await gastosTarjeta(cmPage);
  expect(gs).toHaveLength(1);
  expect(gs[0]).toMatchObject({ id: `cc:${orig.id}:2026-10`, date: '2026-10-30', amount: 7500, name: 'Compra futura editada' });
  await expect(cmPage.locator('#activityList .activity-row', { hasText: 'Compra futura editada' })).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test('2) precarga completa de una diferida con descuento; guardar sin tocar nada deja la compra idéntica', async ({ cmPage }) => {
  await preparar(cmPage);
  const cat = await cmPage.evaluate(() => Object.keys(_liveCatMap())[0]);
  await cargar(cmPage, { monto: 90000, nombre: 'Heladera', modo: 'deferred', cuotas: 3, meses: 5, categoria: cat, fecha: '2026-10-20' }, 20);
  const [orig] = await cargos(cmPage);
  expect(orig).toMatchObject({ amount: 72000, amountOriginal: 90000, discountPct: 20, installments: 3, consumeMonths: 5, mode: 'deferred', category: cat });

  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await expect(modalAlta(cmPage)).toHaveClass(/open/);
  await expect(cmPage.locator('#txnAccount')).toHaveValue('card:nar');
  await expect(cmPage.locator('#ccChDate')).toHaveValue('2026-10-20');
  await expect(cmPage.locator('#txnAmount')).toHaveValue('90000');   // el total, no el final
  await expect(cmPage.locator('#ccChMode')).toHaveValue('deferred');
  await expect(cmPage.locator('#ccChInst')).toHaveValue('3');
  await expect(cmPage.locator('#ccChMonths')).toHaveValue('5');
  await expect(cmPage.locator('#txnCategory')).toHaveValue(cat);
  await expect(cmPage.locator('#txnName')).toHaveValue('Heladera');
  await expect(cmPage.locator('#txnDiscount').getByRole('radio', { name: '20%', exact: true })).toHaveAttribute('aria-checked', 'true');

  await cmPage.click('#txnSaveBtn');
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  expect(await cargos(cmPage)).toEqual([orig]);
  expect((await gastosTarjeta(cmPage)).map((t) => t.amount)).toEqual([14400]);
});

test('3) plata de un tercero: editar revierte el saldo viejo y aplica el nuevo; pasar a gasto común lo devuelve', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 10000, nombre: 'Adelanto', modo: 'advance', cuotas: 3, cuenta: 'efe' });
  const [orig] = await cargos(cmPage);
  expect(await saldo(cmPage, 'efe')).toBe(60000);
  expect(await gastosTarjeta(cmPage)).toHaveLength(0);

  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await expect(cmPage.locator('#ccChMode')).toHaveValue('advance');
  await expect(cmPage.locator('#ccChToAcc')).toHaveValue('efe');
  await cmPage.fill('#txnAmount', '15000');
  await cmPage.selectOption('#ccChToAcc', 'uala');
  await cmPage.click('#txnSaveBtn');
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect(await saldo(cmPage, 'uala')).toBe(515000);
  expect((await cargos(cmPage))[0]).toMatchObject({ id: orig.id, amount: 15000, toAccountId: 'uala', mode: 'advance' });

  // Pasa a gasto común: el saldo de la cuenta vuelve y aparece el gasto del mes.
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await cmPage.selectOption('#ccChMode', 'now1');
  await cmPage.click('#txnSaveBtn');
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  expect(await saldo(cmPage, 'uala')).toBe(500000);
  expect(await saldo(cmPage, 'efe')).toBe(50000);
  expect((await cargos(cmPage))[0]).toMatchObject({ id: orig.id, amount: 15000, mode: 'now1' });
  expect((await gastosTarjeta(cmPage)).map((t) => t.id)).toEqual([`cc:${orig.id}:2026-10`]);
});

test('4) con una cuota ya pagada no se edita: aviso visible, el formulario no se abre y nada cambia', async ({ cmPage }) => {
  await preparar(cmPage, '2026-10-15');
  await cargar(cmPage, { monto: 5000, nombre: 'Ya pagada', fecha: '2026-10-15' });
  await irA(cmPage, '2026-11-10');
  expect(await cmPage.evaluate(() => S.cardPayments.length)).toBe(1);
  const [orig] = await cargos(cmPage);
  const antes = await cmPage.evaluate(() => JSON.stringify({ t: S.transactions, a: S.accounts, c: S.cardCharges, p: S.cardPayments }));

  // Desde el lápiz del movimiento.
  await cmPage.evaluate(() => { txnActiveMonth = '2026-10'; renderActivity(); });
  await cmPage.locator('#activityList .activity-row', { hasText: 'Ya pagada' }).locator('button[title="Editar"]').dispatchEvent('click');
  await expect(cmPage.locator('#toast')).toContainText(PAGADA);
  await expect(cmPage.locator('#toast')).toHaveClass(/show/);
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);

  // Desde Tarjetas → Compras.
  await cmPage.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await abrirTarjetas(cmPage, 'compras');
  await cmPage.locator('.cc-chg button[aria-label="Editar compra"]').click();
  await expect(cmPage.locator('#toast')).toContainText(PAGADA);
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  expect(await cmPage.evaluate(() => JSON.stringify({ t: S.transactions, a: S.accounts, c: S.cardCharges, p: S.cardPayments }))).toBe(antes);
  expect((await cargos(cmPage))[0].id).toBe(orig.id);
});

test('5) "Borrar compra" del formulario: cancelar el confirm no borra; aceptar borra la compra, sus gastos y cierra el formulario', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 5000, nombre: 'A borrar', fecha: '2026-10-29' });
  const [orig] = await cargos(cmPage);
  await lapizDeMovimiento(cmPage, 'A borrar');
  await expect(modalAlta(cmPage)).toHaveClass(/open/);

  cmPage.once('dialog', (d) => d.dismiss());
  await cmPage.click('#txnDeleteChargeBtn');
  await expect(modalAlta(cmPage)).toHaveClass(/open/);
  expect(await cargos(cmPage)).toHaveLength(1);

  cmPage.once('dialog', (d) => d.accept());
  await cmPage.click('#txnDeleteChargeBtn');
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  expect(await cargos(cmPage)).toEqual([]);
  expect(await gastosTarjeta(cmPage)).toEqual([]);
  expect(orig.id).toBeTruthy();
});

test('6) desde Tarjetas → Compras: el botón de editar está junto al de borrar; editar y borrar una compra del 29/10 andan', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 3000, nombre: 'Del veintinueve', fecha: '2026-10-29' });
  await abrirTarjetas(cmPage, 'compras');
  const chg = cmPage.locator('#cardChargeList .cc-chg', { hasText: 'Del veintinueve' });
  await expect(chg.locator('button[aria-label="Editar compra"]')).toBeVisible();
  await expect(chg.locator('button[aria-label="Borrar compra"]')).toBeVisible();

  await chg.locator('button[aria-label="Editar compra"]').click();
  await expect(modalAlta(cmPage)).toHaveClass(/open/);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Editar compra');
  await cmPage.fill('#txnName', 'Del treinta');
  await cmPage.fill('#txnAmount', '4000');
  await cmPage.click('#txnSaveBtn');
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  const nueva = cmPage.locator('#cardChargeList .cc-chg', { hasText: 'Del treinta' });
  await expect(nueva).toHaveCount(1);
  await expect(nueva.locator('.cc-chg-amt')).toContainText('4.000');
  expect(await cargos(cmPage)).toHaveLength(1);

  cmPage.once('dialog', (d) => d.accept());
  await nueva.locator('button[aria-label="Borrar compra"]').click();
  await expect(cmPage.locator('#cardChargeList .cc-chg')).toHaveCount(0);
  expect(await gastosTarjeta(cmPage)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('7) al cerrar o cancelar la edición, el formulario vuelve al modo alta y el próximo "+ Movimiento" viene limpio', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 5000, nombre: 'Para cancelar', fecha: '2026-10-29' });
  const [orig] = await cargos(cmPage);

  const abrirYVerificarAlta = async () => {
    await cmPage.click('#activity-card button:has-text("+ Movimiento")');
    await expect(modalAlta(cmPage)).toHaveClass(/open/);
    await expect(cmPage.locator('#txnModalTitle')).toHaveText('Registrar movimiento');
    await expect(cmPage.locator('#txnSaveBtn')).toHaveText('Registrar');
    await expect(cmPage.locator('#txnDeleteChargeBtn')).toBeHidden();
    await expect(cmPage.locator('#txnType')).toBeEnabled();
    await expect(cmPage.locator('#txnName')).toHaveValue('');
    await expect(cmPage.locator('#txnAmount')).toHaveValue('');
    await expect(cmPage.locator('#txnAccount')).toHaveValue('');
    await expect(cmPage.locator('#txnCardPanel')).toBeHidden();
    await cmPage.click('#modal-add-txn button:has-text("Cancelar")');
    await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  };

  // Cancelar.
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Editar compra');
  await cmPage.click('#modal-add-txn button:has-text("Cancelar")');
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  await expect(cmPage.locator('#txnModalTitle')).toHaveText('Registrar movimiento');
  await abrirYVerificarAlta();

  // Tocar el fondo.
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await cmPage.evaluate(() => document.getElementById('modal-add-txn').classList.remove('open'));
  await abrirYVerificarAlta();

  // Registrar un gasto común después de editar sigue siendo un alta (no pisa la compra).
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await cmPage.click('#modal-add-txn button:has-text("Cancelar")');
  await cmPage.click('#activity-card button:has-text("+ Movimiento")');
  await cmPage.selectOption('#txnType', 'expense');
  await cmPage.fill('#txnName', 'Café');
  await cmPage.fill('#txnAmount', '800');
  await cmPage.selectOption('#txnAccount', 'efe');
  await cmPage.click('#txnSaveBtn');
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  expect(await cargos(cmPage)).toEqual([orig]);
  expect(await cmPage.evaluate(() => S.transactions.filter((t) => !t.cardChargeId).map((t) => t.name))).toEqual(['Café']);
});

test('8) un movimiento que no es de tarjeta se edita igual que siempre (modal de edición, sin tocar el de alta)', async ({ cmPage }) => {
  await preparar(cmPage);
  await cmPage.evaluate(() => {
    S.transactions.push({ id: 'g1', type: 'expense', name: 'Gasto normal', amount: 1000, date: '2026-10-12', currency: 'ARS', category: '', accountId: 'efe' });
    S.accounts.find((a) => a.id === 'efe').balance = 49000;
    renderActivity();
  });
  await cmPage.evaluate(() => openEditTxn('g1'));
  await expect(cmPage.locator('#modal-edit-txn')).toHaveClass(/open/);
  await expect(modalAlta(cmPage)).not.toHaveClass(/open/);
  await cmPage.fill('#editTxnAmount', '1500');
  await cmPage.click('#modal-edit-txn button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-edit-txn')).not.toHaveClass(/open/);
  expect(await saldo(cmPage, 'efe')).toBe(48500);
});

test('9) si lo editado no es válido, se avisa en el formulario y la compra queda como estaba', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 5000, nombre: 'Intacta', fecha: '2026-10-20' });
  const [orig] = await cargos(cmPage);
  await cmPage.evaluate((id) => openEditCardCharge(id), orig.id);
  await cmPage.fill('#txnAmount', '0');
  await cmPage.click('#txnSaveBtn');
  await expect(modalAlta(cmPage)).toHaveClass(/open/);
  await expect(cmPage.locator('#ccChErr')).not.toHaveText('');
  expect(await cargos(cmPage)).toEqual([orig]);
  expect(await gastosTarjeta(cmPage)).toHaveLength(1);
});

test('10) #toast se ve por encima de un overlay abierto y de un modal', async ({ cmPage }) => {
  await preparar(cmPage);
  await cargar(cmPage, { monto: 5000, nombre: 'Algo', fecha: '2026-10-20' });
  await abrirTarjetas(cmPage, 'compras');
  const z = (sel) => cmPage.evaluate((s) => Number(getComputedStyle(document.querySelector(s)).zIndex), sel);
  await cmPage.evaluate(() => showToast('Aviso de prueba', 20000));
  await expect(cmPage.locator('#toast')).toHaveClass(/show/);
  const zToast = await z('#toast');
  expect(zToast).toBeGreaterThan(await z('#ov-tarjetas'));

  // Con un modal encima del overlay también (los modales usan z-index 1000).
  await cmPage.evaluate(() => openModal('modal-add-txn'));
  await expect(modalAlta(cmPage)).toHaveClass(/open/);
  expect(zToast).toBeGreaterThan(await z('#modal-add-txn'));

  // El toast no recibe clics (pointer-events: none): se lo activa solo para comprobar quién queda arriba en su centro.
  const arriba = await cmPage.evaluate(() => {
    const t = document.getElementById('toast');
    t.style.pointerEvents = 'auto';
    const r = t.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const ok = el === t || t.contains(el);
    t.style.pointerEvents = '';
    return ok;
  });
  expect(arriba).toBe(true);
  expect(await cmPage.evaluate(() => getComputedStyle(document.getElementById('toast')).pointerEvents)).toBe('none');
});
