// Tarjetas de crédito (etapa 4): alta/edición/baja y vista de utilización en Finanzas.
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguna tarjeta.
'use strict';
const { test, expect, completeLoginOverlay, waitForBoot } = require('./support/fixtures');

const NARANJA = { name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, used: 865000 };
const MP = { name: 'Mercado Pago', limit: 425000, closeDay: 5, dueDay: 10, used: 357000 };
const GALICIA = { name: 'Galicia', limit: 1000000, closeDay: 29, dueDay: 11, used: 0 };

async function irAFinanzas(page) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(() => { S.cards = []; renderFinanzasTab(); });
}

async function llenar(page, c) {
  await page.fill('#cardName', c.name);
  await page.fill('#cardLimit', String(c.limit));
  await page.fill('#cardCloseDay', String(c.closeDay));
  await page.fill('#cardDueDay', String(c.dueDay));
  await page.fill('#cardOpeningUsed', String(c.used));
}

async function alta(page, c) {
  await page.click('#credit-card button:has-text("+ Tarjeta")');
  await expect(page.locator('#modal-card')).toHaveClass(/open/);
  await llenar(page, c);
  await page.click('#modal-card button:has-text("Guardar")');
  await expect(page.locator('#modal-card')).not.toHaveClass(/open/);
}

const digitos = (s) => s.replace(/\D/g, '');
const fila = (page, name) => page.locator('.cc-row', { hasText: name });

test('estado vacío: mensaje claro y botón para agregar, sin porcentaje engañoso', async ({ cmPage }) => {
  await irAFinanzas(cmPage);
  const body = cmPage.locator('#creditBody');
  await expect(body).toContainText('Todavía no cargaste ninguna tarjeta');
  await expect(body.locator('button:has-text("+ Agregar tarjeta")')).toBeVisible();
  await expect(body.locator('.cc-pct, .cc-ring, .cc-bar')).toHaveCount(0);
  await body.locator('button:has-text("+ Agregar tarjeta")').click();
  await expect(cmPage.locator('#modal-card')).toHaveClass(/open/);
});

test('alta de las 3 tarjetas: usado, disponible y % por tarjeta y en total', async ({ cmPage }) => {
  await irAFinanzas(cmPage);
  for (const c of [NARANJA, MP, GALICIA]) await alta(cmPage, c);

  const esperado = [
    [NARANJA, '865000', '135000', '1000000', '87% usado'],
    [MP, '357000', '68000', '425000', '84% usado'],
    [GALICIA, '0', '1000000', '1000000', '0% usado'],
  ];
  for (const [c, usado, disp, lim, pct] of esperado) {
    const f = fila(cmPage, c.name);
    expect(digitos(await f.locator('.cc-used').innerText())).toBe(usado);
    expect(digitos(await f.locator('.cc-avail').innerText())).toBe(disp);
    expect(digitos(await f.locator('.cc-limit').innerText())).toBe(lim);
    await expect(f.locator('.cc-pct')).toHaveText(pct);
    await expect(f).toContainText(`Cierra el día ${c.closeDay} · Vence el día ${c.dueDay}`);
  }
  const tot = cmPage.locator('#creditTotal');
  expect(digitos(await tot.locator('.cc-used').innerText())).toBe('1222000');
  expect(digitos(await tot.locator('.cc-avail').innerText())).toBe('1203000');
  expect(digitos(await tot.locator('.cc-limit').innerText())).toBe('2425000');
  await expect(tot.locator('.cc-ring-txt')).toHaveText('50%');

  // Formato en pesos con separador de miles (es-AR) y sin tocar gastos ni ingresos.
  await expect(fila(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
  expect(await cmPage.evaluate(() => S.cards.map((c) => c.openingUsed))).toEqual([865000, 357000, 0]);
});

test('el saldo de apertura no genera transacciones ni mueve cuentas', async ({ cmPage }) => {
  await irAFinanzas(cmPage);
  const antes = await cmPage.evaluate(() => JSON.stringify([S.transactions, S.accounts, S.moves]));
  await alta(cmPage, NARANJA);
  expect(await cmPage.evaluate(() => JSON.stringify([S.transactions, S.accounts, S.moves]))).toBe(antes);
});

test('cardUsed suma cargos y resta pagos si existen (contrato para la etapa 5)', async ({ cmPage }) => {
  await irAFinanzas(cmPage);
  const r = await cmPage.evaluate(() => {
    const c = { id: 'x', limit: 1000, openingUsed: 100 };
    const sinNada = cardUsed(c);
    S.cardCharges = [{ cardId: 'x', amount: 300 }, { cardId: 'otra', amount: 999 }];
    S.cardPayments = [{ cardId: 'x', amount: 50 }];
    const con = [cardUsed(c), cardAvailable(c)];
    delete S.cardCharges; delete S.cardPayments;
    return { sinNada, con };
  });
  expect(r.sinNada).toBe(100);
  expect(r.con).toEqual([350, 650]);
});

test('validaciones: rechaza con mensaje y no guarda', async ({ cmPage }) => {
  await irAFinanzas(cmPage);
  await cmPage.click('#credit-card button:has-text("+ Tarjeta")');
  const err = cmPage.locator('#cardErr');
  const guardar = () => cmPage.click('#modal-card button:has-text("Guardar")');
  const base = { name: 'Test', limit: 1000, closeDay: 5, dueDay: 10, used: 0 };
  const casos = [
    [{ ...base, name: '' }, 'nombre'],
    [{ ...base, limit: 0 }, 'límite'],
    [{ ...base, limit: -5 }, 'límite'],
    [{ ...base, closeDay: 0 }, 'cierre'],
    [{ ...base, closeDay: 32 }, 'cierre'],
    [{ ...base, closeDay: 5.5 }, 'cierre'],
    [{ ...base, dueDay: 0 }, 'vencimiento'],
    [{ ...base, dueDay: 40 }, 'vencimiento'],
    [{ ...base, used: -1 }, 'negativo'],
  ];
  for (const [datos, palabra] of casos) {
    await llenar(cmPage, datos);
    await guardar();
    await expect(cmPage.locator('#modal-card')).toHaveClass(/open/);
    await expect(err).toContainText(palabra);
    expect(await cmPage.evaluate(() => S.cards.length)).toBe(0);
  }
  // Con datos válidos (usado vacío = 0) sí guarda.
  await llenar(cmPage, base);
  await cmPage.fill('#cardOpeningUsed', '');
  await guardar();
  await expect(cmPage.locator('#modal-card')).not.toHaveClass(/open/);
  expect(await cmPage.evaluate(() => S.cards.map((c) => [c.name, c.openingUsed]))).toEqual([['Test', 0]]);
});

test('más del 100%: se muestra el porcentaje real, se avisa en texto y se pinta en rojo', async ({ cmPage }) => {
  await irAFinanzas(cmPage);
  await alta(cmPage, { name: 'Pasada', limit: 100000, closeDay: 1, dueDay: 10, used: 125000 });
  const f = fila(cmPage, 'Pasada');
  await expect(f.locator('.cc-pct')).toHaveText('125% usado');
  await expect(f).toContainText('Te pasaste del límite');
  await expect(f).toHaveClass(/cc-danger/);
  expect(digitos(await f.locator('.cc-avail').innerText())).toBe('25000');
  await expect(f.locator('.cc-avail')).toHaveText('-$25.000');
  const rojo = await f.locator('.cc-pct').evaluate((e) => getComputedStyle(e).color);
  const rojoRef = await cmPage.evaluate(() => {
    const p = document.createElement('i'); p.style.color = 'var(--danger)'; document.body.appendChild(p);
    const c = getComputedStyle(p).color; p.remove(); return c;
  });
  expect(rojo).toBe(rojoRef);
  // La barra no se sale de su caja.
  expect(await f.locator('.cc-bar i').evaluate((e) => e.style.width)).toBe('100%');
});

test('editar y borrar (con confirmación)', async ({ cmPage }) => {
  await irAFinanzas(cmPage);
  await alta(cmPage, MP);
  await fila(cmPage, 'Mercado Pago').locator('button[aria-label="Editar tarjeta"]').click();
  await expect(cmPage.locator('#cardName')).toHaveValue('Mercado Pago');
  await expect(cmPage.locator('#cardOpeningUsed')).toHaveValue('357000');
  await cmPage.fill('#cardOpeningUsed', '400000');
  await cmPage.click('#modal-card button:has-text("Guardar")');
  expect(await cmPage.evaluate(() => S.cards.length)).toBe(1);
  expect(digitos(await fila(cmPage, 'Mercado Pago').locator('.cc-avail').innerText())).toBe('25000');

  // Cancelar la confirmación no borra.
  cmPage.once('dialog', (d) => d.dismiss());
  await fila(cmPage, 'Mercado Pago').locator('button[aria-label="Eliminar tarjeta"]').click();
  expect(await cmPage.evaluate(() => S.cards.length)).toBe(1);
  // Aceptar sí borra y vuelve el estado vacío.
  cmPage.once('dialog', (d) => d.accept());
  await fila(cmPage, 'Mercado Pago').locator('button[aria-label="Eliminar tarjeta"]').click();
  await expect(cmPage.locator('#creditBody')).toContainText('Todavía no cargaste ninguna tarjeta');
  expect(await cmPage.evaluate(() => S.cards.length)).toBe(0);
});

test('persistencia: las tarjetas sobreviven a recargar la página', async ({ cmPage }) => {
  await irAFinanzas(cmPage);
  await alta(cmPage, NARANJA);
  await alta(cmPage, GALICIA);
  expect(await cmPage.evaluate(() => localStorage.getItem('lifedash_v2'))).toContain('"Naranja"');

  await cmPage.reload();
  await waitForBoot(cmPage);
  await completeLoginOverlay(cmPage);
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  await expect(fila(cmPage, 'Naranja').locator('.cc-pct')).toHaveText('87% usado');
  await expect(fila(cmPage, 'Galicia').locator('.cc-pct')).toHaveText('0% usado');
  expect(await cmPage.evaluate(() => S.cards.length)).toBe(2);
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('con las 3 tarjetas cargadas no hay scroll horizontal', async ({ cmPage }) => {
    await irAFinanzas(cmPage);
    for (const c of [NARANJA, MP, GALICIA]) await alta(cmPage, c);
    await cmPage.locator('#credit-card').scrollIntoViewIfNeeded();
    const { scrollWidth, clientWidth } = await cmPage.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    const card = await cmPage.locator('#credit-card').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(card.sw).toBeLessThanOrEqual(card.cw + 1);
    // Modal usable en pantalla chica.
    await cmPage.click('#credit-card button:has-text("+ Tarjeta")');
    const m = await cmPage.locator('#modal-card .modal').boundingBox();
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(391);
  });
});
