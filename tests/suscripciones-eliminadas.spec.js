// Obligaciones recurrentes / suscripciones: función eliminada de la app (pedido explícito del usuario).
// Estos tests prueban la AUSENCIA: ni tarjeta, ni modales, ni comando, ni búsqueda, ni avisos, ni descuento
// automático, ni peso en "comprometido". El dato viejo (S.subscriptions) queda intacto y las transacciones
// históricas "Sub: …" siguen siendo gasto común que no cuenta como ritmo variable.
// Los datos de ejemplo viven solo acá.
'use strict';
const { test, expect, completeLoginOverlay, waitForBoot } = require('./support/fixtures');

const SUBS = [
  { id: 's1', name: 'Netflix', amount: 6000, currency: 'ARS', billingDay: 8, accountId: 'bco' },
  { id: 's2', name: 'Spotify', amount: 4500, currency: 'ARS', billingDay: 25, accountId: 'bco' },
];

const IDS_ELIMINADOS = ['obligaciones-card', 'subList', 'subEmpty', 'subTotal', 'modal-add-sub', 'modal-edit-sub',
  'subName', 'subAmount', 'subCurrency', 'subBillingDay', 'subAccount', 'editSubId', 'editSubName'];
const FUNCIONES_ELIMINADAS = ['renderSubscriptions', 'addSubscription', 'deleteSub', 'openEditSub', 'saveEditSub', 'autoDeductSubscriptions'];

async function irAFinanzas(page) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
}

// Estado mínimo: cuenta bancaria, una suscripción cuyo día de cobro es HOY y otra que cobra en 2 días.
async function cargarEstado(page, subs) {
  await page.evaluate((subs) => {
    S.accounts = [{ id: 'bco', name: 'Banco', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' }];
    S.transactions = []; S.cards = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
    S.subscriptions = JSON.parse(JSON.stringify(subs));
    renderFinanzasTab();
  }, subs);
}

// Nada de la función eliminada existe en el DOM (ni oculto) ni se ve en pantalla.
async function verAusencia(page, donde) {
  const r = await page.evaluate((ids) => ({
    ids: ids.filter((id) => document.getElementById(id)),
    html: /obligaciones recurrentes|\+ suscripci[oó]n|modal-add-sub|modal-edit-sub|openEditSub|addSubscription/i.test(document.body.innerHTML),
    visible: /obligaciones recurrentes|\+ suscripci[oó]n/i.test(document.body.innerText),
  }), IDS_ELIMINADOS);
  expect(r, donde).toEqual({ ids: [], html: false, visible: false });
}

// El overlay de Informes pide data/cartera/<mes actual>.json, que puede no existir todavía (404 ajeno a esta función): se sirve vacío.
const sinCarteraDelMes = (page) => page.route('**/data/cartera/*.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

// Abre uno por uno los overlays del FAB de Finanzas (los de cada ítem del abanico) y comprueba la ausencia en cada uno.
async function recorrerOverlays(page, alCadaUno) {
  const etiquetas = await page.evaluate(() => [...document.querySelectorAll('#sd-finanzas .cm-sd-item')].map((b) => b.getAttribute('aria-label')));
  expect(etiquetas.length).toBeGreaterThanOrEqual(5);
  for (const label of etiquetas) {
    await page.locator('#sd-finanzas .cm-sd-main').click();
    await page.locator(`#sd-finanzas .cm-sd-item[aria-label="${label}"]`).click();
    await page.waitForTimeout(250);
    await alCadaUno(label);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }
  return etiquetas;
}

test('1) no queda tarjeta, lista ni modales de suscripciones en Finanzas ni en ningún overlay del FAB', async ({ cmPage, consoleErrors }) => {
  await sinCarteraDelMes(cmPage);
  await irAFinanzas(cmPage);
  await cargarEstado(cmPage, SUBS);
  await verAusencia(cmPage, 'pestaña Finanzas');
  await expect(cmPage.getByText('Obligaciones recurrentes', { exact: false })).toHaveCount(0);
  await expect(cmPage.getByRole('button', { name: '+ Suscripción' })).toHaveCount(0);
  // Presupuesto sigue funcionando: su tarjeta existe y es lo único que aloja el overlay fuera de los fondos.
  await cmPage.evaluate(() => openBudgetOverlay());
  await expect(cmPage.locator('#ov-budget-host #budget-card')).toBeVisible();
  await verAusencia(cmPage, 'overlay de Presupuesto');
  expect(await cmPage.locator('#ov-budget-host > .card').evaluateAll((els) => els.map((e) => e.id))).toEqual(['budget-card', 'fondos-card']);
  await cmPage.keyboard.press('Escape');
  const vistos = await recorrerOverlays(cmPage, (label) => verAusencia(cmPage, 'overlay ' + label));
  expect(vistos).toContain('Presupuesto');
  expect(vistos).toContain('Historial');
  expect(await cmPage.evaluate((fns) => fns.filter((f) => typeof window[f] === 'function'), FUNCIONES_ELIMINADAS)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('2) la paleta de comandos no ofrece "Nueva suscripción" y la búsqueda global no devuelve suscripciones', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  await cargarEstado(cmPage, SUBS);
  await cmPage.keyboard.press('Control+k');
  await expect(cmPage.locator('#cmdk-overlay')).toHaveClass(/open/);
  // Un texto libre siempre agrega la línea "Ejecutar: …" (JARVIS); lo que no debe haber son comandos ni resultados de datos.
  const etiquetas = () => cmPage.locator('#cmdk-list .ci-lbl').allInnerTexts().then((ls) => ls.filter((l) => !l.startsWith('Ejecutar:')));
  await cmPage.fill('#cmdk-input', 'suscrip');
  await expect(cmPage.locator('#cmdk-list .cmdk-item').first()).toContainText('Ejecutar:');
  expect(await etiquetas()).toEqual([]);
  await cmPage.fill('#cmdk-input', 'Netflix');
  await expect(cmPage.locator('#cmdk-list .cmdk-item').first()).toContainText('Ejecutar:');
  expect(await etiquetas()).toEqual([]);
  await cmPage.fill('#cmdk-input', 'Nueva');
  await expect(cmPage.locator('#cmdk-list')).toContainText('Nueva cuenta');   // la paleta sí responde
  expect((await etiquetas()).join('|')).not.toMatch(/suscrip/i);
  await cmPage.keyboard.press('Escape');
  const r = await cmPage.evaluate(() => { CMBuscar.reindexar(); return { netflix: CMBuscar.buscar('Netflix', 30), spotify: CMBuscar.buscar('Spotify', 30), tipos: CMBuscar.buscar('s', 200).map((x) => x.tipo) }; });
  expect(r.netflix).toEqual([]);
  expect(r.spotify).toEqual([]);
  expect(r.tipos).not.toContain('suscripcion');
  expect(consoleErrors).toEqual([]);
});

test('3) con una suscripción que cobra HOY, renderizar Finanzas no crea ninguna transacción "Sub: …" ni toca el saldo', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const hoy = new Date().getDate();
  await cargarEstado(cmPage, [{ id: 's9', name: 'Dropbox', amount: 5000, currency: 'ARS', billingDay: hoy, accountId: 'bco' }]);
  const antes = await cmPage.evaluate(() => ({ saldo: S.accounts.find((a) => a.id === 'bco').balance, txns: S.transactions.length }));
  await cmPage.evaluate(() => { renderFinanzasTab(); renderActivity(); renderFinanzasTab(); });
  await cmPage.click('.nav-btn[data-tab="vida"]');
  await irAFinanzas(cmPage);
  const despues = await cmPage.evaluate(() => ({
    saldo: S.accounts.find((a) => a.id === 'bco').balance,
    txns: S.transactions.length,
    subs: S.transactions.filter((t) => String(t.name).indexOf('Sub: ') === 0).length,
  }));
  expect(despues.subs).toBe(0);
  expect(despues.txns).toBe(antes.txns);
  expect(despues.saldo).toBe(antes.saldo);
  expect(consoleErrors).toEqual([]);
});

test('4) los vencimientos y el ticker no avisan suscripciones, y los de tarjeta siguen', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const en2dias = new Date(Date.now() + 2 * 86400000).getDate();
  await cmPage.evaluate((day) => {
    S.subscriptions = [{ id: 's7', name: 'Disney', amount: 7000, currency: 'ARS', billingDay: day, accountId: 'bco' }];
    S.accounts = [{ id: 'bco', name: 'Banco', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' }];
    S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 865000 }];
    S.cardCharges = [{ id: 'c1', cardId: 'nar', date: '2026-10-15', amount: 50000, mode: 'now1', name: 'Un pago' }];
    S.cardPayments = [];
    buildTickerAlerts();
  }, en2dias);
  const kinds = await cmPage.evaluate(() => CMDeadlines.collect(S, { now: new Date(2026, 9, 15, 9, 0).getTime() }).map((d) => d.kind));
  expect(kinds).not.toContain('suscripcion');
  expect(kinds).toContain('tarjeta');   // regresión: el bloque de vencimientos de tarjeta no se tocó
  const titulos = await cmPage.evaluate(() => CMDeadlines.collect(S, { now: new Date(2026, 9, 15, 9, 0).getTime() }).map((d) => d.title).join('|'));
  expect(titulos).not.toMatch(/Disney|se cobra/);
  const ticker = await cmPage.evaluate(() => document.getElementById('ticker-inner').innerText);
  expect(ticker.length).toBeGreaterThan(0);
  expect(ticker).not.toMatch(/se cobra|Disney/);
  expect(consoleErrors).toEqual([]);
});

// Estado de ejemplo del cálculo a mano (hoy = 15-oct-2026, 15 días transcurridos, 16 restantes):
//   gasto real  = Comida 15.000 + Cine 9.000 + "Sub: Netflix" 6.000 (histórica) = 30.000
//   variable    = 30.000 - 6.000 (la "Sub:" no cuenta como ritmo) = 24.000 → 1.600/día → 16 × 1.600 = 25.600
//   comprometido = Gimnasio 40.000 (sin marcar) + Zapatillas 30.000 (llegan el 25) = 70.000
//                  (con la función vieja sumaba además Spotify 4.500, que cobra el 25 y no tenía transacción: 74.500)
//   proyección del mes = 30.000 + 70.000 + 25.600 = 125.600
test('5) proyección del mes: "comprometido" ya no suma suscripciones y las "Sub: …" históricas no cuentan como gasto variable', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const d = await cmPage.evaluate(() => {
    window.getActiveDate = () => '2026-10-15';
    S.subscriptions = [
      { id: 's1', name: 'Netflix', amount: 6000, currency: 'ARS', billingDay: 8, accountId: 'bco' },
      { id: 's2', name: 'Spotify', amount: 4500, currency: 'ARS', billingDay: 25, accountId: 'bco' },
    ];
    S.transactions = [
      { id: 't1', date: '2026-10-03', name: 'Comida', type: 'expense', amount: 15000, currency: 'ARS', accountId: 'bco' },
      { id: 't2', date: '2026-10-10', name: 'Cine', type: 'expense', amount: 9000, currency: 'ARS', accountId: 'bco' },
      { id: 't3', date: '2026-10-08', name: 'Sub: Netflix', type: 'expense', amount: 6000, currency: 'ARS', accountId: 'bco' },
    ];
    S.fixedExpenses = [
      { id: 'fx1', name: 'Gimnasio', amount: 40000, currency: 'ARS', dayOfMonth: 20 },
      { id: 'fx2', name: 'Expensas', amount: 90000, currency: 'ARS', dayOfMonth: 5 },
    ];
    S.fixedExpenseLog = { '2026-10': { fx2: true } };
    S.orders = [{ id: 'o1', name: 'Zapatillas', amount: 30000, currency: 'ARS', arrival: '2026-10-25', deducted: false }];
    renderFinanzasTab();
    CMProyeccion.render();
    return { calc: CMProyeccion.calcular('2026-10'), texto: document.getElementById('proyeccion-card').innerText, comp: fmtMoney(70000, 'ARS') };
  });
  expect(d.calc.comprometido).toBe(70000);
  expect(d.calc.comprometidoDetalle).toEqual({ fijos: 40000, pedidos: 30000 });
  expect(d.calc.gastoRealAcumulado).toBe(30000);
  expect(d.calc.ritmoDiarioMes).toBe(1600);        // la "Sub: Netflix" histórica queda fuera del ritmo variable
  expect(d.calc.variableProyMes).toBe(25600);
  expect(d.calc.proyeccionMes).toBe(125600);
  expect(d.calc.proyeccion7).toBeCloseTo(30000 + 70000 + (9000 / 7) * 16, 5);   // últimos 7 días (9 al 15): solo el cine
  expect(d.texto).toContain(d.comp);
  expect(d.texto).not.toMatch(/suscrip/i);
  expect(consoleErrors).toEqual([]);
});

test('6) los datos de S.subscriptions siguen intactos tras renderizar, guardar y recargar', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  await cargarEstado(cmPage, SUBS);
  const original = JSON.stringify(SUBS);
  await cmPage.evaluate(() => { renderFinanzasTab(); renderActivity(); buildTickerAlerts(); saveState(); });
  expect(await cmPage.evaluate(() => JSON.stringify(S.subscriptions))).toBe(original);
  expect(await cmPage.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lifedash_v2')).subscriptions))).toBe(original);
  await cmPage.reload();
  await waitForBoot(cmPage);
  await completeLoginOverlay(cmPage);
  await irAFinanzas(cmPage);
  expect(await cmPage.evaluate(() => JSON.stringify(S.subscriptions))).toBe(original);
  expect(consoleErrors).toEqual([]);
});

test('7) cargar Finanzas y abrir cada overlay del FAB no genera errores de consola', async ({ cmPage, consoleErrors }) => {
  await sinCarteraDelMes(cmPage);
  await irAFinanzas(cmPage);
  await cargarEstado(cmPage, SUBS);
  await recorrerOverlays(cmPage, async () => {});
  expect(consoleErrors).toEqual([]);
});
