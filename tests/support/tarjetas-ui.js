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

// "+ Compra con tarjeta" desde Movimientos (con el overlay cerrado).
async function abrirCompraDesdeMovimientos(page) {
  await cerrarTarjetas(page);
  await page.click('#activity-card button:has-text("+ Compra con tarjeta")');
  await expect(page.locator('#modal-card-charge')).toHaveClass(/open/);
}

// "Registrar pago de resumen" está en la pestaña Tarjetas.
async function abrirPagoResumen(page) {
  await abrirTarjetas(page, 'tarjetas');
  await page.click('#tj-pane-tarjetas button:has-text("Registrar pago de resumen")');
  await expect(page.locator('#modal-card-payment')).toHaveClass(/open/);
}

module.exports = { abrirTarjetas, cerrarTarjetas, abrirCompraDesdeMovimientos, abrirPagoResumen };
