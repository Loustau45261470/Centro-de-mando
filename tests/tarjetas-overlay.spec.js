// Finanzas · reorganización (paso 2): las compras con tarjeta, el calendario de pagos y la administración de tarjetas
// viven en un overlay "Tarjetas" (Compras / Calendario / Tarjetas), accesible desde Movimientos y desde la card Crédito,
// que queda compacta (solo estadísticas). "Flujo del mes" pasa a Movimientos (plegable) y "Deuda" queda con sus dos ratios.
// Los datos de ejemplo viven solo acá; el código de producción no trae ninguno.
'use strict';
const { test, expect } = require('./support/fixtures');
const { abrirTarjetas, cerrarTarjetas, abrirCompraDesdeMovimientos, llenarCompra: llenarFormCompra, guardarCompra } = require('./support/tarjetas-ui');

const NARANJA = { id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 865000 };
const MP = { id: 'mp', name: 'Mercado Pago', limit: 425000, closeDay: 5, dueDay: 10, openingUsed: 357000 };
const GALICIA = { id: 'gal', name: 'Galicia', limit: 1000000, closeDay: 29, dueDay: 11, openingUsed: 0 };
const TRES = [NARANJA, MP, GALICIA];

// Los 4 modos de ejemplo con Naranja el 15-oct-2026 (cierra el 27 → primer resumen vence el 10-nov): igual que cards-calendar.spec.
const CARGOS = [
  { id: 'c-now1', cardId: 'nar', date: '2026-10-15', amount: 50000, mode: 'now1', name: 'Un pago' },
  { id: 'c-def', cardId: 'nar', date: '2026-10-15', amount: 90000, mode: 'deferred', installments: 3, consumeMonths: 5, name: 'Diferida' },
  { id: 'c-inst', cardId: 'nar', date: '2026-10-15', amount: 90000, mode: 'nowInst', installments: 3, name: 'En cuotas' },
  { id: 'c-adv', cardId: 'nar', date: '2026-10-15', amount: 100000, mode: 'advance', installments: 2, toAccountId: 'efe', name: 'Adelanto' },
];

// Altura de la card Crédito con las 3 tarjetas de ejemplo ANTES de esta reorganización (medida en el commit anterior,
// sin compras ni pagos): lista de compras, calendario, botones y frases incluidos.
const ALTURA_ANTES = { desktop: 864, mobile: 853 };

async function preparar(page, { hoy = '2026-10-15', cards = TRES, cargos = [], txns = [], accounts = null } = {}) {
  await cerrarTarjetas(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, cards, cargos, txns, accounts }) => {
    window.getActiveDate = () => hoy;
    S.accounts = accounts || [
      { id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' },
      { id: 'efe', name: 'Efectivo', type: 'cash', balance: 50000, currency: 'ARS', icon: '💵' },
    ];
    S.cards = JSON.parse(JSON.stringify(cards));
    S.transactions = JSON.parse(JSON.stringify(txns));
    S.cardCharges = JSON.parse(JSON.stringify(cargos)); S.cardPayments = []; S.moves = [];
    renderFinanzasTab();
  }, { hoy, cards, cargos, txns, accounts });
}

const digitos = (s) => s.replace(/\D/g, '');
const fila = (page, name) => page.locator('#tj-pane-tarjetas .cc-row', { hasText: name });
const linea = (page, name) => page.locator('#credit-card .cc-line', { hasText: name });
const enfocadoDentro = (page) => page.evaluate(() => document.getElementById('ov-tarjetas').contains(document.activeElement));
const idEnfocado = (page) => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
const dangerRef = (page) => page.evaluate(() => {
  const p = document.createElement('i'); p.style.color = 'var(--danger)'; document.body.appendChild(p);
  const c = getComputedStyle(p).color; p.remove(); return c;
});

async function llenarCompra(page, c) {
  await llenarFormCompra(page, c);
  await guardarCompra(page);
}

test('1) el botón Tarjetas abre el overlay en Compras; Esc y el botón de cerrar lo cierran y devuelven el foco', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  const ov = cmPage.locator('#ov-tarjetas');
  const btn = cmPage.locator('#openTarjetasBtn');
  await expect(btn).toHaveText('💳 Tarjetas');
  // Cerrado no se puede recorrer con el teclado ni lo lee un lector de pantalla.
  expect(await ov.evaluate((e) => e.inert)).toBe(true);

  await btn.focus();
  await btn.click();
  await expect(ov).toHaveClass(/show/);
  await expect(ov).toHaveAttribute('role', 'dialog');
  await expect(ov).toHaveAttribute('aria-modal', 'true');
  await expect(ov).toHaveAttribute('aria-label', 'Tarjetas');
  expect(await ov.evaluate((e) => e.inert)).toBe(false);
  // Abre en Compras.
  await expect(cmPage.locator('#tj-tab-compras')).toHaveAttribute('aria-selected', 'true');
  await expect(cmPage.locator('#tj-pane-compras')).toBeVisible();
  await expect(cmPage.locator('#tj-pane-calendario')).toBeHidden();
  await expect(cmPage.locator('#tj-pane-tarjetas')).toBeHidden();
  await expect(cmPage.locator('.cm-ov-title', { hasText: 'Tarjetas' })).toBeVisible();
  expect(await enfocadoDentro(cmPage)).toBe(true);

  // Foco atrapado: Tab y Shift+Tab nunca salen del overlay.
  for (let i = 0; i < 14; i++) { await cmPage.keyboard.press('Tab'); expect(await enfocadoDentro(cmPage)).toBe(true); }
  for (let i = 0; i < 14; i++) { await cmPage.keyboard.press('Shift+Tab'); expect(await enfocadoDentro(cmPage)).toBe(true); }

  // Esc cierra y el foco vuelve al botón que lo abrió.
  await cmPage.keyboard.press('Escape');
  await expect(ov).not.toHaveClass(/show/);
  expect(await idEnfocado(cmPage)).toBe('openTarjetasBtn');
  expect(await ov.evaluate((e) => e.inert)).toBe(true);

  // El botón de cerrar hace lo mismo.
  await btn.focus();
  await btn.click();
  await expect(ov).toHaveClass(/show/);
  await cmPage.click('#ov-tarjetas .cm-ov-close');
  await expect(ov).not.toHaveClass(/show/);
  expect(await idEnfocado(cmPage)).toBe('openTarjetasBtn');

  // Cada pestaña muestra su panel y oculta los otros.
  await btn.click();
  for (const t of ['calendario', 'tarjetas', 'compras']) {
    await cmPage.click(`#tj-tab-${t}`);
    await expect(cmPage.locator(`#tj-tab-${t}`)).toHaveAttribute('aria-selected', 'true');
    for (const o of ['compras', 'calendario', 'tarjetas']) {
      if (o === t) await expect(cmPage.locator(`#tj-pane-${o}`)).toBeVisible();
      else await expect(cmPage.locator(`#tj-pane-${o}`)).toBeHidden();
    }
  }
  expect(consoleErrors).toEqual([]);
});

test('2) la compra con tarjeta desde Movimientos guarda una compra que aparece en Compras con su calendario; borrar pide confirmación', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage);
  // El acceso es "+ Movimiento" (el botón aparte de compra con tarjeta ya no existe).
  const hdr = cmPage.locator('#activity-card .card-title');
  await expect(hdr.locator('button:has-text("+ Compra con tarjeta")')).toHaveCount(0);
  await expect(hdr.locator('button:has-text("+ Movimiento")')).toBeVisible();
  await abrirCompraDesdeMovimientos(cmPage);
  await llenarCompra(cmPage, { monto: 100000, nombre: 'Compra de prueba' });

  // Gasto del mes (modalidad "consumo inmediato, 1 pago") y el usado sube 865.000 → 965.000.
  const g = await cmPage.evaluate(() => S.transactions.filter((t) => t.cardChargeId).map((t) => ({ id: t.id, amount: t.amount, type: t.type, date: t.date })));
  expect(g).toHaveLength(1);
  expect(g[0]).toMatchObject({ amount: 100000, type: 'expense', date: '2026-10-15' });
  await expect(linea(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$965.000');
  await expect(linea(cmPage, 'Naranja').locator('.cc-avail')).toHaveText('$35.000');
  expect(await cmPage.evaluate(() => S.cardCharges.length)).toBe(1);

  // La compra aparece en la pestaña Compras con su calendario de cuotas.
  await cmPage.click('#openTarjetasBtn');
  const lista = cmPage.locator('#cardChargeList');
  await expect(lista.locator('.cc-chg')).toHaveCount(1);
  const c = lista.locator('.cc-chg').first();
  await expect(c.locator('.cc-chg-name')).toHaveText('Compra de prueba');
  await expect(c.locator('.cc-chg-amt')).toHaveText('$100.000');
  await c.locator('summary').click();
  await expect(c.locator('li')).toHaveText(['Pago único · vence el 10/11/2026 · $100.000']);
  await expect(c).toContainText('Gasto completo en octubre 2026');

  // Desde el propio overlay también se carga una compra (el modal queda por encima) y la lista se actualiza abierta.
  await cmPage.click('#tj-pane-compras button:has-text("+ Compra con tarjeta")');
  await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
  await expect(cmPage.locator('#txnType')).toHaveValue('expense');
  // Con varias tarjetas el medio de pago queda para elegir.
  await expect(cmPage.locator('#txnAccount')).toHaveValue('');
  await expect(cmPage.locator('#txnCardPanel')).toBeHidden();
  await llenarCompra(cmPage, { card: 'nar', fecha: '2026-10-10', monto: 20000, nombre: 'Segunda' });
  await expect(cmPage.locator('#ov-tarjetas')).toHaveClass(/show/);
  await expect(lista.locator('.cc-chg-name')).toHaveText(['Compra de prueba', 'Segunda']);

  // Borrar: cancelar no borra; aceptar sí, y el usado vuelve atrás.
  const borrar = (nombre) => lista.locator('.cc-chg', { hasText: nombre }).locator('button[aria-label="Borrar compra"]').click();
  cmPage.once('dialog', (d) => d.dismiss());
  await borrar('Compra de prueba');
  expect(await cmPage.evaluate(() => S.cardCharges.length)).toBe(2);
  let msg = '';
  cmPage.once('dialog', (d) => { msg = d.message(); d.accept(); });
  await borrar('Compra de prueba');
  expect(msg).toContain('¿Borrar la compra "Compra de prueba" de $100.000?');
  expect(await cmPage.evaluate(() => S.cardCharges.map((x) => x.name))).toEqual(['Segunda']);
  await expect(lista.locator('.cc-chg-name')).toHaveText(['Segunda']);
  cmPage.once('dialog', (d) => d.accept());
  await borrar('Segunda');
  await expect(lista).toContainText('Todavía no cargaste compras con tarjeta');
  expect(await cmPage.evaluate(() => S.transactions.filter((t) => t.cardChargeId).length)).toBe(0);
  await expect(linea(cmPage, 'Naranja').locator('.cc-used')).toHaveText('$865.000');
  expect(consoleErrors).toEqual([]);
});

test('3) pestaña Calendario: 12 meses con los totales de ejemplo y el "A pagar el" de cada tarjeta', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { cargos: CARGOS });
  await abrirTarjetas(cmPage, 'calendario');
  const cal = cmPage.locator('#cardCalendar');
  await expect(cal.locator('.cc-cal-m')).toHaveCount(12);
  const meses = await cal.locator('.cc-cal-m').evaluateAll((els) => els.map((e) => e.dataset.month));
  expect(meses[0]).toBe('2026-10');
  expect(meses[11]).toBe('2027-09');
  const mes = (mk) => cal.locator(`.cc-cal-m[data-month="${mk}"]`);
  await expect(mes('2026-10')).toContainText('Nada para pagar');
  await expect(mes('2026-11').locator('.cc-cal-total')).toHaveText('A pagar $160.000');
  await expect(mes('2026-11').locator('.cc-cal-due')).toHaveText(['10/11 · Naranja · $160.000']);
  await expect(mes('2026-12').locator('.cc-cal-total')).toHaveText('A pagar $110.000');
  await expect(mes('2026-12').locator('.cc-cal-due')).toHaveText(['10/12 · Naranja · $110.000']);
  await expect(mes('2027-01').locator('.cc-cal-total')).toHaveText('A pagar $60.000');
  await expect(mes('2027-01').locator('.cc-cal-due')).toHaveText(['10/01 · Naranja · $60.000']);
  await expect(mes('2027-02')).toContainText('Nada para pagar');
  // "A pagar el DD/MM" por tarjeta: solo las que tienen algo pendiente.
  const naranja = cmPage.locator('#tj-pane-calendario .cc-due-card', { hasText: 'Naranja' });
  await expect(naranja.locator('.cc-due')).toHaveText(['A pagar el 10/11: $160.000', 'A pagar el 10/12: $110.000']);
  await expect(cmPage.locator('#tj-pane-calendario .cc-due-card')).toHaveCount(1);
  expect(consoleErrors).toEqual([]);

  // Estados vacíos: sin compras, y con compras ya pagadas/pasadas.
  await preparar(cmPage, { cargos: [] });
  await abrirTarjetas(cmPage, 'calendario');
  await expect(cmPage.locator('#tj-pane-calendario')).toContainText('Cuando cargues compras con tarjeta');
  await preparar(cmPage, { cargos: CARGOS, hoy: '2028-01-01' });
  await abrirTarjetas(cmPage, 'calendario');
  await expect(cmPage.locator('#tj-pane-calendario')).toContainText('No tenés pagos pendientes en los próximos 12 meses');
});

test('4) pestaña Tarjetas: alta, edición, baja y registrar pago de resumen', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { cards: [] });
  await abrirTarjetas(cmPage, 'tarjetas');
  const pane = cmPage.locator('#tj-pane-tarjetas');
  await expect(pane).toContainText('Todavía no cargaste ninguna tarjeta');

  // Alta
  await pane.locator('button:has-text("+ Agregar tarjeta")').click();
  await expect(cmPage.locator('#modal-card')).toHaveClass(/open/);
  await cmPage.fill('#cardName', 'Visa');
  await cmPage.fill('#cardLimit', '500000');
  await cmPage.fill('#cardCloseDay', '20');
  await cmPage.fill('#cardDueDay', '5');
  await cmPage.fill('#cardOpeningUsed', '100000');
  await cmPage.selectOption('#cardPayAccount', 'uala');
  await cmPage.click('#modal-card button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-card')).not.toHaveClass(/open/);
  await expect(cmPage.locator('#ov-tarjetas')).toHaveClass(/show/);
  await expect(fila(cmPage, 'Visa')).toContainText('Cierra el día 20 · Vence el día 5');
  await expect(fila(cmPage, 'Visa').locator('.cc-used')).toHaveText('$100.000');
  await expect(fila(cmPage, 'Visa').locator('.cc-avail')).toHaveText('$400.000');
  await expect(fila(cmPage, 'Visa').locator('.cc-warnline')).toHaveCount(0);
  await expect(linea(cmPage, 'Visa')).toHaveCount(1);

  // Edición
  await fila(cmPage, 'Visa').locator('button[aria-label="Editar tarjeta"]').click();
  await expect(cmPage.locator('#cardName')).toHaveValue('Visa');
  await cmPage.fill('#cardLimit', '600000');
  await cmPage.click('#modal-card button:has-text("Guardar")');
  await expect(cmPage.locator('#modal-card')).not.toHaveClass(/open/);
  await expect(fila(cmPage, 'Visa').locator('.cc-avail')).toHaveText('$500.000');
  await expect(fila(cmPage, 'Visa').locator('.cc-limit')).toHaveText('$600.000');

  // Registrar pago de resumen: baja el usado y el saldo de la cuenta.
  await pane.locator('button:has-text("Registrar pago de resumen")').click();
  await expect(cmPage.locator('#modal-card-payment')).toHaveClass(/open/);
  await cmPage.fill('#ccPayAmount', '40000');
  await cmPage.click('#modal-card-payment .btn-primary');
  await expect(cmPage.locator('#modal-card-payment')).not.toHaveClass(/open/);
  await expect(fila(cmPage, 'Visa').locator('.cc-used')).toHaveText('$60.000');
  expect(await cmPage.evaluate(() => S.accounts.find((a) => a.id === 'uala').balance)).toBe(960000);
  expect(await cmPage.evaluate(() => S.cardPayments.map((p) => [p.cardId === S.cards[0].id, p.amount, p.kind]))).toEqual([[true, 40000, 'manual']]);

  // Baja con confirmación
  cmPage.once('dialog', (d) => d.dismiss());
  await fila(cmPage, 'Visa').locator('button[aria-label="Eliminar tarjeta"]').click();
  expect(await cmPage.evaluate(() => S.cards.length)).toBe(1);
  cmPage.once('dialog', (d) => d.accept());
  await fila(cmPage, 'Visa').locator('button[aria-label="Eliminar tarjeta"]').click();
  await expect(pane).toContainText('Todavía no cargaste ninguna tarjeta');
  expect(await cmPage.evaluate(() => S.cards.length)).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test('4b) con compras cargadas el cierre y el vencimiento de la tarjeta siguen bloqueados (regresión)', async ({ cmPage }) => {
  await preparar(cmPage, { cards: [NARANJA], cargos: [CARGOS[0]] });
  await abrirTarjetas(cmPage, 'tarjetas');
  await fila(cmPage, 'Naranja').locator('button[aria-label="Editar tarjeta"]').click();
  await expect(cmPage.locator('#modal-card')).toHaveClass(/open/);
  await expect(cmPage.locator('#cardCloseDay')).toBeDisabled();
  await expect(cmPage.locator('#cardDueDay')).toBeDisabled();
  await expect(cmPage.locator('#cardCycleNote')).toBeVisible();
  await expect(cmPage.locator('#cardCycleNote')).toContainText('No se pueden cambiar mientras la tarjeta tenga compras cargadas');
  await expect(cmPage.locator('#cardName')).toBeEnabled();
  await expect(cmPage.locator('#cardLimit')).toBeEnabled();
});

test('5) la card Crédito es compacta: solo estadísticas, un aro total y una línea por tarjeta; al tocarla abre el overlay', async ({ cmPage, consoleErrors }) => {
  await preparar(cmPage, { cargos: [] });
  const card = cmPage.locator('#credit-card');
  await card.scrollIntoViewIfNeeded();
  const alto = (await card.boundingBox()).height;
  const ancho = cmPage.viewportSize().width;
  const antes = ancho >= 1000 ? ALTURA_ANTES.desktop : ALTURA_ANTES.mobile;
  test.info().annotations.push({ type: 'alturas', description: `Crédito antes=${antes}px ahora=${Math.round(alto)}px (${(alto / antes * 100).toFixed(1)}%)` });
  console.log(`ALTURA_CREDITO ancho=${ancho} antes=${antes} ahora=${Math.round(alto)} (${(alto / antes * 100).toFixed(1)}%)`);
  expect(alto).toBeLessThanOrEqual(antes * 0.4);

  // Nada de detalle ni de frases: sin lista de compras, calendario, botones ni textos explicativos.
  await expect(card.locator('button')).toHaveCount(0);
  await expect(card.locator('.cc-chg, #cardChargeList, #cardCalendar, .cc-cal-m, .cc-hint, .cc-warnline, .cc-due, .cc-actions, .cc-meta, p')).toHaveCount(0);
  const texto = await card.innerText();
  expect(texto).not.toMatch(/Calendario|Compras con tarjeta|Registrar pago|Agregar|Cierra el día|Vence el día|Elegí|Todavía|Cuando|cuenta se paga|límite\./);

  // Aro con el % total y "usado / límite" total.
  const tot = cmPage.locator('#creditTotal');
  await expect(tot.locator('svg.cc-ring')).toHaveCount(1);
  await expect(tot.locator('.cc-ring-txt')).toHaveText('50%');
  expect(digitos(await tot.locator('.cc-used').innerText())).toBe('1222000');
  expect(digitos(await tot.locator('.cc-limit').innerText())).toBe('2425000');
  await expect(tot.locator('.cc-total-nums')).toHaveText('$1.222.000 / $2.425.000');

  // Una línea por tarjeta: nombre, barra fina con %, usado / disponible.
  await expect(card.locator('.cc-line')).toHaveCount(3);
  const esperado = [['Naranja', '$865.000', '$135.000', '87%'], ['Mercado Pago', '$357.000', '$68.000', '84%'], ['Galicia', '$0', '$1.000.000', '0%']];
  for (const [n, u, d, p] of esperado) {
    const l = linea(cmPage, n);
    await expect(l.locator('.cc-name')).toHaveText(n);
    await expect(l.locator('.cc-used')).toHaveText(u);
    await expect(l.locator('.cc-avail')).toHaveText(d);
    await expect(l.locator('.cc-pct')).toHaveText(p);
    await expect(l.locator('.cc-bar')).toHaveCount(1);
    expect(await l.locator('.cc-bar').evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(6);   // barra fina
  }

  // Más de 100%: en rojo.
  await cmPage.evaluate(() => { S.cards.push({ id: 'pas', name: 'Pasada', limit: 100000, closeDay: 1, dueDay: 10, openingUsed: 125000 }); renderFinanzasTab(); });
  const pas = linea(cmPage, 'Pasada');
  await expect(pas).toHaveClass(/cc-danger/);
  await expect(pas.locator('.cc-pct')).toHaveText('125%');
  await expect(pas.locator('.cc-avail')).toHaveText('-$25.000');
  const rojo = await dangerRef(cmPage);
  expect(await pas.locator('.cc-pct').evaluate((e) => getComputedStyle(e).color)).toBe(rojo);
  expect(await pas.locator('.cc-avail').evaluate((e) => getComputedStyle(e).color)).toBe(rojo);
  expect(await pas.locator('.cc-bar i').evaluate((e) => e.style.width)).toBe('100%');
  expect(await linea(cmPage, 'Naranja').locator('.cc-pct').evaluate((e) => getComputedStyle(e).color)).not.toBe(rojo);

  // Estado vacío mínimo.
  await cmPage.evaluate(() => { S.cards = []; renderFinanzasTab(); });
  await expect(cmPage.locator('#creditBody')).toHaveText('Sin tarjetas · tocá para agregar');
  await expect(card.locator('.cc-line, .cc-ring, button')).toHaveCount(0);

  // Tocar la card abre el overlay en la pestaña Tarjetas.
  await preparar(cmPage);
  await cmPage.locator('#credit-card').click();
  await expect(cmPage.locator('#ov-tarjetas')).toHaveClass(/show/);
  await expect(cmPage.locator('#tj-tab-tarjetas')).toHaveAttribute('aria-selected', 'true');
  await expect(cmPage.locator('#tj-pane-tarjetas')).toBeVisible();
  await cmPage.keyboard.press('Escape');
  await expect(cmPage.locator('#ov-tarjetas')).not.toHaveClass(/show/);
  expect(await idEnfocado(cmPage)).toBe('credit-card');
  expect(consoleErrors).toEqual([]);
});

test('5b) la card Crédito se opera con el teclado (Enter y Espacio) y es un botón accesible', async ({ cmPage }) => {
  await preparar(cmPage);
  const card = cmPage.locator('#credit-card');
  await expect(card).toHaveAttribute('role', 'button');
  await expect(card).toHaveAttribute('tabindex', '0');
  expect(await card.getAttribute('aria-labelledby')).toBe('creditTitle');
  for (const tecla of ['Enter', ' ']) {
    await card.focus();
    await cmPage.keyboard.press(tecla);
    await expect(cmPage.locator('#ov-tarjetas')).toHaveClass(/show/);
    await expect(cmPage.locator('#tj-tab-tarjetas')).toHaveAttribute('aria-selected', 'true');
    await cmPage.keyboard.press('Escape');
    await expect(cmPage.locator('#ov-tarjetas')).not.toHaveClass(/show/);
    expect(await idEnfocado(cmPage)).toBe('credit-card');
  }
  // El foco muestra un contorno visible.
  await card.focus();
  await cmPage.keyboard.press('Shift+Tab');
  await cmPage.keyboard.press('Tab');
  expect(await card.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
});

test('6) Deuda queda con sus dos ratios sin aclaraciones; Flujo del mes está en Movimientos, plegado y con las mismas cifras', async ({ cmPage, consoleErrors }) => {
  const ACC = [{ id: 'uala', name: 'Ualá', type: 'bank', balance: 2400000, currency: 'ARS', icon: '🏦' }];
  const nar = { id: 'nar', name: 'Naranja', limit: 2000000000, closeDay: 27, dueDay: 10, openingUsed: 800000 };
  const inc = (id, date, amount) => ({ id, date, name: 'Ingreso de prueba', type: 'income', amount, currency: 'ARS', category: 'Sueldo' });
  const exp = (id, date, amount) => ({ id, date, name: 'Gasto de prueba', type: 'expense', amount, currency: 'ARS', category: 'Comida' });
  await preparar(cmPage, {
    hoy: '2026-10-10', accounts: ACC, cards: [nar],
    txns: [
      inc('i1', '2026-10-02', 100000), inc('i2', '2026-10-09', 50000), inc('p1', '2026-07-05', 400000), inc('p2', '2026-08-05', 400000), inc('p3', '2026-09-05', 400000),
      exp('e1', '2026-10-03', 20000), exp('e2', '2026-10-05', 40000), exp('e3', '2026-10-08', 10000),
      exp('fut', '2026-10-20', 400000), exp('sep', '2026-09-30', 700000),
    ],
    cargos: [
      { id: 'c-now1', cardId: 'nar', date: '2026-10-09', amount: 30000, mode: 'now1', name: 'Compra de prueba' },
      { id: 'c-adv', cardId: 'nar', date: '2026-10-09', amount: 200000, mode: 'advance', installments: 2, toAccountId: 'uala', name: 'Adelanto' },
    ],
  });

  // Deuda: título "Deuda" y solo los dos ratios (deuda sobre ingresos y patrimonio sobre deuda), sin la frase eliminada.
  const deuda = cmPage.locator('#debt-flow-card');
  // (el título se muestra en mayúsculas por CSS y workspace.js le agrega la flecha de plegar)
  const titulo = (await deuda.locator('.card-title').textContent()).replace('▾', '').trim();
  expect(titulo).toBe('📊 Deuda');
  await expect(deuda.locator('.df-block')).toHaveCount(2);
  await expect(deuda.locator('.df-h')).toHaveText(['Deuda sobre ingresos', 'Patrimonio sobre deuda']);
  await expect(deuda.locator('#dfFlow, #dfFlowTable, #dfFlowNet')).toHaveCount(0);
  await expect(deuda).not.toContainText('ya tiene descontado');
  await expect(deuda).not.toContainText('no cuenta el mes en curso');
  await expect(cmPage.locator('#tab-finanzas')).not.toContainText('El patrimonio ya tiene descontado el crédito usado');
  await expect(cmPage.locator('#dfDebtIncome')).toContainText('Ingreso mensual promedio $400.000');
  await expect(cmPage.locator('#dfDebtIncome')).toContainText('promedio de 3 meses cerrados');
  await expect(cmPage.locator('#dfNetDebt')).toContainText('Tu patrimonio equivale a');

  // Flujo del mes: dentro de Movimientos, justo debajo de Ingresos / Gastos / Balance, cerrado por defecto.
  const flujo = cmPage.locator('#activity-card #txnFlow');
  await expect(flujo).toHaveCount(1);
  expect(await cmPage.evaluate(() => document.getElementById('txnSummaryRow').nextElementSibling.id)).toBe('txnFlow');
  await expect(flujo.locator('summary')).toHaveText('Flujo del mes');
  expect(await flujo.evaluate((e) => e.open)).toBe(false);
  await expect(cmPage.locator('#dfFlowTable')).toBeHidden();
  await flujo.locator('summary').click();
  expect(await flujo.evaluate((e) => e.open)).toBe(true);
  await expect(cmPage.locator('#dfFlowTable')).toBeVisible();
  const celdas = (i) => cmPage.locator('#dfFlowTable tbody tr').nth(i).locator('th, td');
  await expect(celdas(0)).toHaveText(['Cantidad de registros', '2', '4']);
  await expect(celdas(1)).toHaveText(['Promedio por día', '$15.000', '$10.000']);
  await expect(celdas(2)).toHaveText(['Promedio por registro', '$75.000', '$25.000']);
  await expect(celdas(3)).toHaveText(['Total', '$150.000', '$100.000']);
  await expect(cmPage.locator('#dfFlowNet')).toHaveText('Flujo de efectivo+$50.000');
  await expect(flujo).toContainText('Del 1 al 10 de octubre (10 días)');
  // Plegar de nuevo lo oculta.
  await flujo.locator('summary').click();
  await expect(cmPage.locator('#dfFlowTable')).toBeHidden();

  // Sin movimientos en el mes: mensaje claro.
  await cmPage.evaluate(() => { S.transactions = []; S.cardCharges = []; renderFinanzasTab(); });
  await expect(cmPage.locator('#dfFlow')).toContainText('Sin movimientos este mes');
  expect(consoleErrors).toEqual([]);
});

for (const ancho of [1280, 390]) {
  test.describe(`${ancho}px`, () => {
    test.use({ viewport: { width: ancho, height: 900 } });

    test(`7) los botones del encabezado de Movimientos se ven completos a ${ancho}px`, async ({ cmPage }) => {
      await preparar(cmPage);
      await cmPage.locator('#activity-card').scrollIntoViewIfNeeded();
      const m = await cmPage.evaluate(() => {
        const card = document.getElementById('activity-card').getBoundingClientRect();
        const titulo = document.querySelector('#activity-card .card-title');
        const botones = [...titulo.querySelectorAll('button')].map((b) => {
          const r = b.getBoundingClientRect();
          return { t: b.textContent.trim(), l: r.left, r: r.right, w: r.width, h: r.height, cortado: b.scrollWidth > b.clientWidth + 1 };
        });
        return { cardL: card.left, cardR: card.right, botones, tsw: titulo.scrollWidth, tcw: titulo.clientWidth };
      });
      expect(m.botones.map((b) => b.t)).toEqual(['🎨 Categorías', '💳 Tarjetas', '+ Movimiento']);
      for (const b of m.botones) {
        expect(b.w, b.t).toBeGreaterThan(40);
        expect(b.l, b.t).toBeGreaterThanOrEqual(m.cardL);
        expect(b.r, b.t).toBeLessThanOrEqual(m.cardR);
        expect(b.cortado, b.t).toBe(false);
      }
      expect(m.tsw).toBeLessThanOrEqual(m.tcw + 1);
      // y se pueden tocar: ninguno queda tapado por otro elemento (con las animaciones de entrada ya terminadas).
      const tapados = await cmPage.evaluate(async () => {
        await Promise.all(document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})));
        return [...document.querySelectorAll('#activity-card .card-title button')].filter((b) => {
          b.scrollIntoView({ block: 'center' });
          const r = b.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !(el && el.closest('button') === b);
        }).map((b) => b.textContent.trim());
      });
      expect(tapados).toEqual([]);
    });
  });
}

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('8) con el overlay abierto en las 3 pestañas no hay scroll horizontal ni texto fuera del panel, y sin errores de consola', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage, {
      cargos: [...CARGOS, { id: 'mp1', cardId: 'mp', date: '2026-10-10', amount: 123456789.5, mode: 'nowInst', installments: 12, name: 'Compra con un nombre bastante largo para probar el ajuste de línea' }],
    });
    for (const tab of ['compras', 'calendario', 'tarjetas']) {
      await abrirTarjetas(cmPage, tab);
      if (tab === 'compras') await cmPage.locator('#cardChargeList .cc-chg summary').first().click();
      const m = await cmPage.evaluate((tab) => {
        const body = document.querySelector('#ov-tarjetas .cm-ov-body');
        const br = body.getBoundingClientRect();
        const pane = document.getElementById('tj-pane-' + tab);
        const fuera = [];
        pane.querySelectorAll('*').forEach((el) => {
          if (el.closest('svg')) return;
          const r = el.getBoundingClientRect();
          if (r.width && (r.right > br.right + 1 || r.left < br.left - 1)) fuera.push(`${el.tagName}.${el.className}`);
        });
        return {
          sw: document.body.scrollWidth, cw: document.documentElement.clientWidth,
          bsw: body.scrollWidth, bcw: body.clientWidth, fuera, vacio: pane.innerText.trim().length === 0,
        };
      }, tab);
      expect(m.sw, tab).toBeLessThanOrEqual(m.cw + 1);
      expect(m.bsw, tab).toBeLessThanOrEqual(m.bcw + 1);
      expect(m.fuera, tab).toEqual([]);
      expect(m.vacio, tab).toBe(false);
    }
    // Y sin overlay, la card Crédito compacta tampoco desborda.
    await cerrarTarjetas(cmPage);
    const c = await cmPage.locator('#credit-card').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(c.sw).toBeLessThanOrEqual(c.cw + 1);
    expect(consoleErrors).toEqual([]);
  });
});
