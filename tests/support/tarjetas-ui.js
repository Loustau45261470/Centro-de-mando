// Atajos para operar el overlay de Tarjetas (Compras / Calendario / Tarjetas) desde los tests.
// Las compras, el calendario y la administración de tarjetas viven ahí, no en la card Crédito de Finanzas.
'use strict';
const { expect } = require('@playwright/test');

const abierto = (page) => page.locator('#ov-tarjetas').evaluate((e) => e.classList.contains('show'));

// Abre el overlay (tocando la card Crédito, que lo abre en Tarjetas) y deja visible la pestaña pedida.
async function abrirTarjetas(page, tab = 'tarjetas') {
  if (!(await abierto(page))) await page.click('#credit-card');
  await expect(page.locator('#ov-tarjetas')).toHaveClass(/show/);
  await page.click(`#tj-tab-${tab}`);
  await expect(page.locator(`#tj-pane-${tab}`)).toBeVisible();
}

async function cerrarTarjetas(page) {
  if (await abierto(page)) {
    await page.click('#ov-tarjetas .cm-ov-close');
    await expect(page.locator('#ov-tarjetas')).not.toHaveClass(/show/);
  }
}

// La compra con tarjeta vive en el formulario de Movimientos: gasto + medio de pago = una tarjeta.
async function elegirTarjeta(page, id) {
  await page.selectOption('#txnAccount', `card:${id}`);
  await expect(page.locator('#txnCardPanel')).toBeVisible();
}

// "+ Movimiento" -> Gasto -> medio de pago = la primera tarjeta (con el overlay cerrado).
async function abrirCompraDesdeMovimientos(page) {
  await cerrarTarjetas(page);
  await page.click('#activity-card button:has-text("+ Movimiento")');
  await expect(page.locator('#modal-add-txn')).toHaveClass(/open/);
  await page.selectOption('#txnType', 'expense');
  const valor = await page.locator('#txnAccount option[value^="card:"]').first().getAttribute('value');
  await elegirTarjeta(page, valor.slice('card:'.length));
}

// Llena el formulario unificado (ya con la tarjeta elegida). Campos: card, fecha, monto, nombre, categoria,
// modo, cuotas, meses, cuenta (donde entra la plata de un tercero).
async function llenarCompra(page, c) {
  if (c.card) await elegirTarjeta(page, c.card);
  await page.fill('#ccChDate', c.fecha || '2026-10-15');
  await page.fill('#txnAmount', String(c.monto));
  if (c.nombre !== undefined) await page.fill('#txnName', c.nombre);
  if (c.categoria) await page.selectOption('#txnCategory', c.categoria);
  await page.selectOption('#ccChMode', c.modo || 'now1');
  if (c.cuotas !== undefined) await page.fill('#ccChInst', String(c.cuotas));
  if (c.meses !== undefined) await page.fill('#ccChMonths', String(c.meses));
  if (c.cuenta) await page.selectOption('#ccChToAcc', c.cuenta);
}

// "Registrar" del formulario: la compra se guarda y el formulario se cierra.
async function guardarCompra(page) {
  await page.click('#modal-add-txn .btn-primary');
  await expect(page.locator('#modal-add-txn')).not.toHaveClass(/open/);
}

// "Registrar pago de resumen" está en la pestaña Tarjetas.
async function abrirPagoResumen(page) {
  await abrirTarjetas(page, 'tarjetas');
  await page.click('#tj-pane-tarjetas button:has-text("Registrar pago de resumen")');
  await expect(page.locator('#modal-card-payment')).toHaveClass(/open/);
}

module.exports = { abrirTarjetas, cerrarTarjetas, elegirTarjeta, abrirCompraDesdeMovimientos, llenarCompra, guardarCompra, abrirPagoResumen };
