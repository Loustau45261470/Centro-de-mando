// Finanzas, etapa 10: bloque "Deuda y flujo" (deuda sobre ingresos, patrimonio sobre deuda, flujo de efectivo del mes)
// y los tres detalles pendientes de la etapa 7 (nota bajo la torta, título del patrimonio, descripción de la métrica).
// La fecha de "hoy" se fija pisando getActiveDate(). Los datos de ejemplo viven solo acá (repo público).
'use strict';
const { test, expect } = require('./support/fixtures');

const ACC = [{ id: 'uala', name: 'Ualá', type: 'bank', balance: 2400000, currency: 'ARS', icon: '🏦' }];
const card = (used, over = {}) => ({ id: 'nar', name: 'Naranja', limit: 2000000000, closeDay: 27, dueDay: 10, openingUsed: used, ...over });
const inc = (id, date, amount) => ({ id, date, name: 'Ingreso de prueba', type: 'income', amount, currency: 'ARS', category: 'Sueldo' });
const exp = (id, date, amount) => ({ id, date, name: 'Gasto de prueba', type: 'expense', amount, currency: 'ARS', category: 'Comida' });

async function preparar(page, { hoy = '2026-10-15', accounts = ACC, cards = [card(800000)], txns = [], cargos = [], moves = [] } = {}) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate((d) => {
    window.getActiveDate = () => d.hoy;
    S.accounts = JSON.parse(JSON.stringify(d.accounts));
    S.cards = JSON.parse(JSON.stringify(d.cards));
    S.transactions = JSON.parse(JSON.stringify(d.txns));
    S.cardCharges = JSON.parse(JSON.stringify(d.cargos)); S.cardPayments = []; S.moves = JSON.parse(JSON.stringify(d.moves));
    renderFinanzasTab();
  }, { hoy, accounts, cards, txns, cargos, moves });
}

const bloque = (page) => page.locator('#debt-flow-card');
const deudaIng = (page) => page.locator('#dfDebtIncome');
const filas = (page) => page.locator('#dfFlowTable tbody tr');
const celdas = (page, i) => filas(page).nth(i).locator('th, td');

test('deuda sobre ingresos: promedio de 3 meses cerrados, equivale a 2 meses y 200%', async ({ cmPage, consoleErrors }) => {
  // (300.000 + 400.000 + 500.000) / 3 = 400.000; deuda 800.000 / 400.000 = 2 meses = 200%.
  await preparar(cmPage, { txns: [inc('a', '2026-07-05', 300000), inc('b', '2026-08-05', 400000), inc('c', '2026-09-05', 500000)] });
  const b = deudaIng(cmPage);
  await expect(b).toContainText('Deuda sobre ingresos');
  await expect(b).toContainText('Ingreso mensual promedio $400.000');
  await expect(b).toContainText('Deuda $800.000');
  await expect(b).toContainText('equivale a 2 meses de ingresos');
  await expect(cmPage.locator('#dfDebtPct')).toHaveText('200%');
  await expect(b).toContainText('promedio de 3 meses cerrados');
  await expect(b.locator('svg.df-ring')).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test('deuda sobre ingresos: con un solo mes cerrado dice "promedio de 1 mes" (y un mes fuera de la ventana no cuenta)', async ({ cmPage }) => {
  // Los 3 meses cerrados son jul, ago y sep: junio queda fuera y no entra. Solo septiembre: 800.000 / 800.000 = 1 mes.
  await preparar(cmPage, { txns: [inc('a', '2026-09-05', 800000), inc('z', '2026-06-05', 9000000)] });
  const b = deudaIng(cmPage);
  await expect(b).toContainText('promedio de 1 mes cerrado');
  await expect(b).not.toContainText('promedio de 1 meses');
  await expect(b).toContainText('Ingreso mensual promedio $800.000');
  await expect(b).toContainText('equivale a 1 mes de ingresos');
  await expect(cmPage.locator('#dfDebtPct')).toHaveText('100%');
});

test('deuda sobre ingresos: sin ingresos en meses cerrados dice "Sin datos suficientes", no un 0%', async ({ cmPage }) => {
  // Solo hay ingresos en el mes en curso: no alcanza.
  await preparar(cmPage, { txns: [inc('a', '2026-10-02', 700000)] });
  const b = deudaIng(cmPage);
  await expect(b).toContainText('Sin datos suficientes');
  await expect(b).not.toContainText('%');
  await expect(b).not.toContainText('equivale');
  await expect(b.locator('svg')).toHaveCount(0);
  // Y sin ninguna transacción, igual.
  await preparar(cmPage, { txns: [] });
  await expect(deudaIng(cmPage)).toContainText('Sin datos suficientes');
  await expect(deudaIng(cmPage)).not.toContainText('%');
});

test('el mes en curso no entra en el promedio de ingresos', async ({ cmPage }) => {
  const base = [inc('a', '2026-08-05', 400000), inc('b', '2026-09-05', 400000)];
  await preparar(cmPage, { txns: base });
  await expect(deudaIng(cmPage)).toContainText('Ingreso mensual promedio $400.000');
  await preparar(cmPage, { txns: [...base, inc('c', '2026-10-01', 90000000), inc('d', '2026-10-14', 5000000)] });
  await expect(deudaIng(cmPage)).toContainText('Ingreso mensual promedio $400.000');
  await expect(deudaIng(cmPage)).toContainText('promedio de 2 meses cerrados');
  await expect(cmPage.locator('#dfDebtPct')).toHaveText('200%');
  // Cambio de año: el 15-ene-2027 los 3 meses cerrados son oct, nov y dic de 2026.
  await preparar(cmPage, { hoy: '2027-01-15', txns: [inc('e', '2026-10-05', 300000), inc('f', '2026-12-05', 500000), inc('g', '2026-09-05', 7000000)] });
  await expect(deudaIng(cmPage)).toContainText('Ingreso mensual promedio $400.000');
  await expect(deudaIng(cmPage)).toContainText('promedio de 2 meses cerrados');
});

test('deuda 0: "Sin deuda" en las dos relaciones', async ({ cmPage }) => {
  await preparar(cmPage, { cards: [], txns: [inc('a', '2026-09-05', 500000)] });
  await expect(deudaIng(cmPage)).toContainText('Sin deuda');
  await expect(cmPage.locator('#dfNetDebt')).toContainText('Sin deuda');
  await expect(cmPage.locator('#dfNetDebt')).not.toContainText('veces');
});

test('patrimonio sobre deuda: cuenta correcta, y un patrimonio negativo se muestra', async ({ cmPage }) => {
  // Patrimonio = 2.400.000 - 800.000 = 1.600.000; 1.600.000 / 800.000 = 2 veces.
  await preparar(cmPage);
  const nd = cmPage.locator('#dfNetDebt');
  await expect(nd).toContainText('Tu patrimonio equivale a 2 veces tu deuda');
  await expect(nd).toContainText('Patrimonio $1.600.000');
  await expect(nd).toContainText('Deuda $800.000');
  expect(await cmPage.evaluate(() => calcNetWorth())).toBe(1600000);

  // 1,5 veces: patrimonio 1.200.000 con deuda 800.000 (cuenta de 2.000.000).
  await preparar(cmPage, { accounts: [{ ...ACC[0], balance: 2000000 }] });
  await expect(nd).toContainText('Tu patrimonio equivale a 1,5 veces tu deuda');

  // Patrimonio negativo: 200.000 - 800.000 = -600.000. No se esconde.
  await preparar(cmPage, { accounts: [{ ...ACC[0], balance: 200000 }] });
  await expect(nd).toContainText('Tu patrimonio es negativo: -$600.000');
  await expect(nd).toContainText('No alcanza para cubrir la deuda de $800.000');
  await expect(nd).not.toContainText('veces');

  // Patrimonio exactamente 0.
  await preparar(cmPage, { accounts: [{ ...ACC[0], balance: 800000 }] });
  await expect(nd).toContainText('Tu patrimonio es cero: $0');
});

test('flujo del mes: cantidad, promedios y total; compra con tarjeta cuenta; Mover plata y adelanto no', async ({ cmPage, consoleErrors }) => {
  // Hoy 10-oct (10 días transcurridos).
  // Ingresos: 100.000 + 50.000 = 150.000 (2 registros) -> 15.000 por día, 75.000 por registro.
  // Gastos: 20.000 + 40.000 + 10.000 + compra con tarjeta de 30.000 = 100.000 (4 registros) -> 10.000 por día, 25.000 por registro.
  // Quedan afuera: un gasto del 20-oct (futuro), otro de septiembre, un traspaso (Mover plata) y un adelanto con tarjeta.
  await preparar(cmPage, {
    hoy: '2026-10-10',
    txns: [
      inc('i1', '2026-10-02', 100000), inc('i2', '2026-10-09', 50000),
      exp('e1', '2026-10-03', 20000), exp('e2', '2026-10-05', 40000), exp('e3', '2026-10-08', 10000),
      exp('fut', '2026-10-20', 400000), exp('sep', '2026-09-30', 700000),
    ],
    cargos: [
      { id: 'c-now1', cardId: 'nar', date: '2026-10-09', amount: 30000, mode: 'now1', name: 'Compra de prueba' },
      { id: 'c-adv', cardId: 'nar', date: '2026-10-09', amount: 200000, mode: 'advance', installments: 2, toAccountId: 'uala', name: 'Adelanto' },
    ],
    moves: [{ id: 'm1', date: '2026-10-09', from: 'uala', to: 'uala', amount: 500000, note: '' }],
  });
  await expect(cmPage.locator('#dfFlow')).toContainText('Flujo de efectivo del mes');
  await expect(cmPage.locator('#dfFlow')).toContainText('Del 1 al 10 de octubre (10 días)');
  await expect(cmPage.locator('#dfFlowTable thead th').nth(1)).toHaveText('Ingreso');
  await expect(cmPage.locator('#dfFlowTable thead th').nth(2)).toHaveText('Gasto');
  await expect(celdas(cmPage, 0)).toHaveText(['Cantidad de registros', '2', '4']);
  await expect(celdas(cmPage, 1)).toHaveText(['Promedio por día', '$15.000', '$10.000']);
  await expect(celdas(cmPage, 2)).toHaveText(['Promedio por registro', '$75.000', '$25.000']);
  await expect(celdas(cmPage, 3)).toHaveText(['Total', '$150.000', '$100.000']);
  await expect(cmPage.locator('#dfFlowNet')).toHaveText('Flujo de efectivo+$50.000');
  await expect(cmPage.locator('#dfFlow')).toContainText('Entró más de lo que salió');

  // Mismo mes, 20 días transcurridos: entra el gasto del 20 (500.000 en total / 20 días = 25.000 por día), y el flujo pasa a negativo.
  await cmPage.evaluate(() => { window.getActiveDate = () => '2026-10-20'; renderFinanzasTab(); });
  await expect(celdas(cmPage, 0)).toHaveText(['Cantidad de registros', '2', '5']);
  await expect(celdas(cmPage, 1)).toHaveText(['Promedio por día', '$7.500', '$25.000']);
  await expect(celdas(cmPage, 2)).toHaveText(['Promedio por registro', '$75.000', '$100.000']);
  await expect(celdas(cmPage, 3)).toHaveText(['Total', '$150.000', '$500.000']);
  await expect(cmPage.locator('#dfFlowNet')).toHaveText('Flujo de efectivo-$350.000');
  await expect(cmPage.locator('#dfFlow')).toContainText('Salió más de lo que entró');
  expect(consoleErrors).toEqual([]);
});

test('flujo del mes: sin movimientos dice "Sin movimientos este mes", no ceros', async ({ cmPage }) => {
  // Hay movimientos, pero de otro mes.
  await preparar(cmPage, { txns: [exp('sep', '2026-09-30', 700000)] });
  await expect(cmPage.locator('#dfFlow')).toContainText('Sin movimientos este mes');
  await expect(cmPage.locator('#dfFlowTable')).toHaveCount(0);
  await expect(cmPage.locator('#dfFlowNet')).toHaveCount(0);
  // Solo gastos: el lado de ingresos no inventa promedios por registro.
  await preparar(cmPage, { txns: [exp('e1', '2026-10-03', 60000)] });
  await expect(celdas(cmPage, 0)).toHaveText(['Cantidad de registros', '0', '1']);
  await expect(celdas(cmPage, 2)).toHaveText(['Promedio por registro', '—', '$60.000']);
  await expect(cmPage.locator('#dfFlowNet')).toHaveText('Flujo de efectivo-$60.000');
});

test('torta, título del patrimonio y descripción de la métrica (pendientes de la etapa 7)', async ({ cmPage }) => {
  await preparar(cmPage);
  await expect(cmPage.locator('#nwPieNote')).toHaveText('La torta muestra tus cuentas; el crédito usado se descuenta en el balance real.');
  await expect(cmPage.locator('#tab-finanzas .card-title', { hasText: 'Patrimonio' }).first()).toContainText('Patrimonio (balance real)');
  await expect(cmPage.locator('#tab-finanzas')).not.toContainText('Patrimonio Neto');
  const desc = await cmPage.evaluate(() => CMInformesData.CATALOGO.find((m) => m.id === 'fin_patrimonio').descripcion);
  expect(desc).toContain('Tus cuentas más inversiones, menos el crédito usado de las tarjetas');
  expect(desc).not.toContain('El valor total de tus cuentas');
});

test('el bloque no usa vocabulario interno en ningún estado', async ({ cmPage }) => {
  const prohibido = /materializ|snapshot|\bflag\b|\bmotor\b|\bkind\b|pipeline|\bhook\b|orquestador|harness|telemetr|instrument|\bratio\b|\bcash\b|undefined|NaN|Infinity/i;
  const estados = [
    { txns: [inc('a', '2026-07-05', 300000), inc('b', '2026-08-05', 400000), inc('c', '2026-09-05', 500000), exp('e', '2026-10-03', 1000)] },
    { txns: [] },
    { cards: [], txns: [inc('a', '2026-09-05', 500000)] },
    { accounts: [{ ...ACC[0], balance: 200000 }], txns: [exp('e', '2026-10-03', 1000)] },
    { accounts: [], cards: [card(0)], txns: [] },
  ];
  for (const e of estados) {
    await preparar(cmPage, e);
    const texto = await bloque(cmPage).innerText();
    expect(texto).not.toMatch(prohibido);
    expect(texto.length).toBeGreaterThan(20);
  }
});

test('ningún texto del usuario (categorías, nombres) llega al bloque, ni como HTML', async ({ cmPage }) => {
  const mal = '<img src=x onerror="window.__xss=1">';
  await preparar(cmPage, {
    cards: [card(800000, { name: mal })],
    txns: [{ ...inc('a', '2026-09-05', 500000), name: mal, category: mal }, { ...exp('e', '2026-10-03', 1000), name: mal, category: mal }],
  });
  const html = await cmPage.locator('#debtFlowBody').innerHTML();
  expect(html).not.toContain('onerror');
  expect(html).not.toContain('<img');
  // Otras secciones de Finanzas (presupuesto) todavía pintan la categoría sin escapar: se aísla este bloque.
  const xss = await cmPage.evaluate(() => new Promise((res) => {
    window.__xss = undefined; renderDebtFlow(); setTimeout(() => res(window.__xss), 300);
  }));
  expect(xss).toBeUndefined();
  await expect(deudaIng(cmPage)).toContainText('Ingreso mensual promedio $500.000');
});

for (const ancho of [390, 360]) {
  test.describe(`${ancho}px`, () => {
    test.use({ viewport: { width: ancho, height: 800 } });

    test('con montos de 9 dígitos no hay scroll horizontal ni texto cortado', async ({ cmPage }) => {
      await preparar(cmPage, {
        hoy: '2026-10-28',
        accounts: [{ ...ACC[0], balance: 987654321 }],
        cards: [card(123456789)],
        txns: [
          inc('a', '2026-07-05', 987654321), inc('b', '2026-08-05', 987654321), inc('c', '2026-09-05', 987654321),
          inc('i', '2026-10-02', 987654321), exp('e', '2026-10-03', 876543210), exp('f', '2026-10-04', 123456789),
        ],
      });
      await bloque(cmPage).scrollIntoViewIfNeeded();
      await expect(filas(cmPage)).toHaveCount(4);
      const m = await cmPage.evaluate(() => {
        const card = document.querySelector('#debt-flow-card');
        const cr = card.getBoundingClientRect();
        const cortados = [];
        card.querySelectorAll('*').forEach((el) => {
          if (el.closest('svg') || el.classList.contains('sr-only')) return;
          const r = el.getBoundingClientRect();
          if (!r.width) return;
          if (r.right > cr.right + 1 || r.left < cr.left - 1) cortados.push(`${el.tagName}.${el.className}:${(el.textContent || '').slice(0, 30)}`);
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') cortados.push(`scroll ${el.tagName}.${el.className}`);
        });
        return {
          sw: document.body.scrollWidth, cw: document.documentElement.clientWidth,
          csw: card.scrollWidth, ccw: card.clientWidth, cortados,
          texto: card.innerText,
        };
      });
      expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
      expect(m.csw).toBeLessThanOrEqual(m.ccw + 1);
      expect(m.cortados).toEqual([]);
      expect(m.texto).toContain('$987.654.321');
      expect(m.texto).toContain('$123.456.789');
    });
  });
}
