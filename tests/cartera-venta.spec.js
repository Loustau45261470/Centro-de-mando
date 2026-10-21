// Etapa 9 de specs/finanzas-credito.md: "Registrar venta" de un activo de la cartera + pestaña Historial.
// Todo con un fixture inventado (tests/fixtures/cartera-tenencias.json): nunca las posiciones reales.
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/fixtures');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cartera-tenencias.json'), 'utf8'));
const XSS_SIM = FIX.tenencias[4].simbolo;

// Cuentas: Inversiones 1.000.000 y Ualá 200.000 (en pesos), más una en dólares que no debe usarse.
const CUENTAS = [
  { id: 'inv', name: 'Inversiones', type: 'invest', balance: 1000000, currency: 'ARS', icon: '📈' },
  { id: 'uala', name: 'Ualá', type: 'bank', balance: 200000, currency: 'ARS', icon: '🏦' },
  { id: 'usd', name: 'Dólares', type: 'bank', balance: 10, currency: 'USD', icon: '💵' },
];

async function servir(page, fixture) {
  await page.unroute('**/data/cartera/tenencias.json').catch(() => {});
  await page.route('**/data/cartera/tenencias.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
}

// Mockea el JSON de tenencias, deja el Worker en vivo caído (cae al estático) y abre el overlay de Cartera.
async function abrir(page, { fixture = FIX, cuentas = CUENTAS } = {}) {
  await servir(page, fixture);
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.evaluate((c) => {
    S.accounts = JSON.parse(JSON.stringify(c));
    S.transactions = []; S.moves = []; S.carteraTx = [];
  }, cuentas);
  await reabrir(page);
}

async function reabrir(page) {
  await page.evaluate(() => CarteraOverlay.open());
  await expect(page.locator('#cov-pane-tenencias .ten-row[data-simbolo]').first()).toBeVisible();
}

const fila = (page, sim) => page.locator(`#cov-pane-tenencias .ten-row[data-simbolo="${sim}"]`);

async function abrirVenta(page, sim) {
  if (!(await page.locator('#cov-pane-tenencias .ten-detail').filter({ has: page.locator(`.ten-venta-btn[data-simbolo="${sim}"]`) }).count())) await fila(page, sim).click();
  await page.locator(`.ten-venta-btn[data-simbolo="${sim}"]`).click();
  await expect(page.locator('#modal-venta-activo')).toHaveClass(/open/);
}

async function llenar(page, unidades, precio, { from, to } = {}) {
  await page.fill('#ventaUnidades', String(unidades));
  await page.fill('#ventaPrecio', String(precio));
  if (from) await page.selectOption('#ventaFrom', from);
  if (to) await page.selectOption('#ventaTo', to);
}

// Abre el activo, carga la venta y confirma. Si sale bien el modal se cierra.
async function vender(page, sim, unidades, precio, cuentas) {
  await abrirVenta(page, sim);
  await llenar(page, unidades, precio, cuentas);
  await page.click('#ventaConfirmar');
  await expect(page.locator('#modal-venta-activo')).not.toHaveClass(/open/);
}

const saldos = (page) => page.evaluate(() => Object.fromEntries(S.accounts.map((a) => [a.id, a.balance])));
const estado = (page) => page.evaluate(() => JSON.stringify({ a: S.accounts, t: S.transactions, m: S.moves, c: S.carteraTx }));
const fechaCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const hoy = (page) => page.evaluate(() => getActiveDate());

test.describe('Registrar venta', () => {
  test('venta total con ganancia: costo promedio ponderado de 3 lotes, mueve el costo y anota solo el resultado', async ({ cmPage: page }) => {
    await abrir(page);
    const nwAntes = await page.evaluate(() => calcNetWorth());
    // Costo a mano: (20×1000 + 30×1200 + 50×1400) / 100 = 1260 por unidad → 126.000 en total; vende 100 × 1500 = 150.000
    await vender(page, 'TESTA', 100, 1500);

    const s = await saldos(page);
    expect(s.inv).toBe(1000000 - 126000);
    expect(s.uala).toBe(200000 + 126000 + 24000);
    expect(s.usd).toBe(10);
    expect(await page.evaluate(() => calcNetWorth())).toBeCloseTo(nwAntes + 24000, 2); // el patrimonio cambia solo por el resultado

    const moves = await page.evaluate(() => S.moves);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: 'inv', to: 'uala', amount: 126000, note: 'Venta TESTA' });

    const txns = await page.evaluate(() => S.transactions);
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ name: 'Venta TESTA', type: 'income', amount: 24000, category: 'invest', accountId: 'uala', currency: 'ARS' });

    const tx = await page.evaluate(() => S.carteraTx);
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ simbolo: 'TESTA', unidades: 100, precio: 1500, costoUnit: 1260, costo: 126000, resultado: 24000, fechaCompra: '2026-03-10', cierra: true });
    expect(tx[0].fecha).toBe(await hoy(page));
    expect(tx[0].id).toBeTruthy();
  });

  test('venta total con pérdida: el resultado entra como gasto de la categoría Inversión y la cuenta destino recibe lo vendido', async ({ cmPage: page }) => {
    await abrir(page);
    const nwAntes = await page.evaluate(() => calcNetWorth());
    await vender(page, 'TESTA', 100, 1200); // vende por 120.000 con costo 126.000 → pierde 6.000

    const s = await saldos(page);
    expect(s.inv).toBe(1000000 - 126000);
    expect(s.uala).toBe(200000 + 120000); // costo 126.000 − pérdida 6.000 = exactamente lo vendido
    expect(await page.evaluate(() => calcNetWorth())).toBeCloseTo(nwAntes - 6000, 2);
    const txns = await page.evaluate(() => S.transactions);
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ name: 'Venta TESTA', type: 'expense', amount: 6000, category: 'invest', accountId: 'uala' });
    expect(await page.evaluate(() => S.moves.length)).toBe(1);
    expect((await page.evaluate(() => S.carteraTx))[0].resultado).toBe(-6000);
  });

  test('si la categoría Inversión fue borrada, se recrea', async ({ cmPage: page }) => {
    await abrir(page);
    await page.evaluate(() => { ensureTxnCategories(); delete S.txnCategories.invest; _invalidateCatCache(); });
    await vender(page, 'TESTA', 10, 1500);
    expect(await page.evaluate(() => S.txnCategories.invest && S.txnCategories.invest.label)).toBe('Inversión');
  });

  test('venta parcial deja el costo del resto intacto; la segunda cierra y el historial muestra UN registro', async ({ cmPage: page }) => {
    await abrir(page);
    // TESTB: 4 × 1500 + 6 × 2000 → costo 1800. Parcial: 4 × 2200 → vendido 8.800, costo 7.200, resultado +1.600
    await vender(page, 'TESTB', 4, 2200);
    let tx = await page.evaluate(() => S.carteraTx);
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ unidades: 4, costoUnit: 1800, costo: 7200, resultado: 1600, cierra: false, fechaCompra: '2026-02-01' });
    const t = FIX.tenencias[1];
    const disp = await page.evaluate(([tt, g]) => ({ disp: carteraDisponibles(tt, g), costo: carteraCostoUnit(tt).costoUnit }), [t, FIX.generado]);
    expect(disp).toEqual({ disp: 6, costo: 1800 });
    // la UI también lo ve: aparece en el detalle del activo que sigue abierto
    await expect(page.locator('.ten-ventas .ten-venta-item').nth(1)).toContainText('1.600');
    await expect(page.locator('.ten-ventas')).toContainText('Ventas que registraste');
    // el activo sigue en cartera: todavía no hay nada en Historial
    await page.click('.plov-tab[data-t="historial"]');
    await expect(page.locator('#cov-pane-historial .empty-state')).toContainText('Todavía no vendiste');
    await page.click('.plov-tab[data-t="tenencias"]');

    // Segunda venta: las 6 restantes × 2300 → vendido 13.800, costo 10.800, resultado +3.000, cierra
    await vender(page, 'TESTB', 6, 2300);
    tx = await page.evaluate(() => S.carteraTx);
    expect(tx).toHaveLength(2);
    expect(tx[1]).toMatchObject({ unidades: 6, costoUnit: 1800, costo: 10800, resultado: 3000, cierra: true });
    const s = await saldos(page);
    expect(s.inv).toBe(1000000 - 18000);
    expect(s.uala).toBe(200000 + 8800 + 13800);

    await page.click('.plov-tab[data-t="historial"]');
    const filas = page.locator('#cov-pane-historial .ten-hist-row');
    await expect(filas).toHaveCount(1);
    const hoyIso = await hoy(page);
    await expect(filas.first()).toContainText('TESTB');
    await expect(filas.first()).toContainText(`Compra ${fechaCorta('2026-02-01')}`);
    await expect(filas.first()).toContainText(`Venta ${fechaCorta(hoyIso)}`);
    await expect(filas.first()).toContainText('+25.56%'); // (1.600 + 3.000) / 18.000
    await expect(filas.first()).toContainText('4.600');
  });
});

test.describe('Rechazos', () => {
  test('más que lo disponible, precio 0, unidades 0 o vacías y cuentas iguales se rechazan sin tocar nada', async ({ cmPage: page }) => {
    await abrir(page);
    const antes = await estado(page);
    await abrirVenta(page, 'TESTA');
    const casos = [
      [101, 1500, null, /Solo tenés 100/],
      [10, 0, null, /precio de venta/i],
      [0, 1500, null, /unidades/i],
      ['', 1500, null, /unidades/i],
      [10, 1500.12345, null, /4 decimales/],
      [10, 1500, { from: 'inv', to: 'inv' }, /no pueden ser la misma/],
    ];
    for (const [u, p, cu, msg] of casos) {
      await llenar(page, u, p, cu || { from: 'inv', to: 'uala' });
      await page.click('#ventaConfirmar');
      await expect(page.locator('#toast')).toContainText(msg);
      await expect(page.locator('#modal-venta-activo')).toHaveClass(/open/);
    }
    expect(await estado(page)).toBe(antes);
  });

  test('NaN, negativos e Infinity se rechazan en el cálculo', async ({ cmPage: page }) => {
    await abrir(page);
    const r = await page.evaluate(([t, g]) => [NaN, -1, Infinity, null, undefined, 'abc'].map((u) => carteraCalcVenta({ t, generado: g, unidades: u, precio: 1500 }).ok)
      .concat([NaN, -5, Infinity, 'x'].map((p) => carteraCalcVenta({ t, generado: g, unidades: 1, precio: p }).ok)), [FIX.tenencias[0], FIX.generado]);
    expect(r.every((x) => x === false)).toBe(true);
  });

  test('sin cuenta de inversiones: avisa y no abre el modal vacío', async ({ cmPage: page }) => {
    await abrir(page, { cuentas: CUENTAS.filter((a) => a.type !== 'invest') });
    await fila(page, 'TESTA').click();
    await page.locator('.ten-venta-btn[data-simbolo="TESTA"]').click();
    await expect(page.locator('#toast')).toContainText('cuenta de tipo Inversión');
    await expect(page.locator('#modal-venta-activo')).not.toHaveClass(/open/);
  });

  test('cuenta de otra moneda no se puede usar (solo pesos)', async ({ cmPage: page }) => {
    await abrir(page);
    const r = await page.evaluate(([t, g]) => registrarVentaCartera({ t, generado: g, unidades: 1, precio: 1500, fromId: 'inv', toId: 'usd' }), [FIX.tenencias[0], FIX.generado]);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/pesos/);
    expect(await page.evaluate(() => S.carteraTx.length)).toBe(0);
  });

  test('el activo sin precio de compra conocido no se puede vender (no hay forma de calcular el resultado)', async ({ cmPage: page }) => {
    await abrir(page);
    const r = await page.evaluate(([t, g]) => carteraCalcVenta({ t: { ...t, ppc: null, lotes: [] }, generado: g, unidades: 1, precio: 1500 }), [FIX.tenencias[0], FIX.generado]);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/precio de compra/);
  });

  test('origen que queda en negativo: avisa pero deja registrar', async ({ cmPage: page }) => {
    await abrir(page, { cuentas: [{ ...CUENTAS[0], balance: 50000 }, CUENTAS[1]] });
    await abrirVenta(page, 'TESTA');
    await llenar(page, 100, 1500);
    await expect(page.locator('#ventaWarn')).toBeVisible();
    await expect(page.locator('#ventaWarn')).toContainText('negativo');
    await page.click('#ventaConfirmar');
    await expect(page.locator('#toast')).toContainText('negativo');
    expect((await saldos(page)).inv).toBe(50000 - 126000);
  });
});

test.describe('Escala y costo', () => {
  test('bono con precio por unidad (JSON semanal): no se divide por 100', async ({ cmPage: page }) => {
    await abrir(page);
    // costo (100.000 × 1,20 + 100.000 × 1,22) / 200.000 = 1,21; vende 100.000 × 1,30 = 130.000 contra 121.000 → +9.000
    await vender(page, 'TESTBONO', 100000, 1.3);
    const tx = (await page.evaluate(() => S.carteraTx))[0];
    expect(tx).toMatchObject({ costoUnit: 1.21, costo: 121000, resultado: 9000, cierra: false, fechaCompra: '2026-06-01' });
    const s = await saldos(page);
    expect(s.inv).toBe(1000000 - 121000);
    expect(s.uala).toBe(200000 + 121000 + 9000);
  });

  test('letra con precio cada 100 nominales (como IOL en vivo) y sin lotes: usa el promedio de compra, escala 1/100 y fecha s/d', async ({ cmPage: page }) => {
    await abrir(page);
    // 40.000 × 130 / 100 = 52.000 contra 40.000 × 120 / 100 = 48.000 → +4.000
    await vender(page, 'TESTLETRA', 40000, 130);
    let tx = (await page.evaluate(() => S.carteraTx))[0];
    expect(tx).toMatchObject({ costoUnit: 120, costo: 48000, resultado: 4000, fechaCompra: 's/d', cierra: false });
    const s = await saldos(page);
    expect(s.uala).toBe(200000 + 48000 + 4000);
    // las 60.000 restantes cierran y el historial muestra la fecha de compra como s/d
    await vender(page, 'TESTLETRA', 60000, 130);
    tx = await page.evaluate(() => S.carteraTx);
    expect(tx[1]).toMatchObject({ costo: 72000, resultado: 6000, cierra: true });
    await page.click('.plov-tab[data-t="historial"]');
    await expect(page.locator('#cov-pane-historial .ten-hist-row')).toContainText('Compra s/d');
    await expect(page.locator('#cov-pane-historial .ten-hist-row')).toContainText('+8.33%'); // 10.000 / 120.000
  });

  test('si no se puede deducir la escala (¿dólares?) se rechaza', async ({ cmPage: page }) => {
    await abrir(page);
    const r = await page.evaluate(([t, g]) => carteraCalcVenta({ t: { ...t, tipo: 'ONS', valorizado: 777 }, generado: g, unidades: 1, precio: 1500 }), [FIX.tenencias[0], FIX.generado]);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/escala/);
  });
});

// Hallazgo de la verificación ciega: un lote con precio 0 se descartaba del promedio pero el resultado se aplicaba a todas
// las unidades (costo ~2x el real). Regla: promedio de lotes solo si todos son válidos y suman la cantidad; si no, el ppc de IOL.
test.describe('Costo con lotes inconsistentes', () => {
  const calc = (page, sim, unidades, precio) => page.evaluate(([t, g, u, p]) => {
    const c = carteraCalcVenta({ t, generado: g, unidades: u, precio: p });
    return c.ok ? { ok: true, costoUnit: c.costoUnit, costoTot: c.costoTot, resultado: c.resultado, pct: c.pct, origen: c.costoOrigen, aviso: c.avisoLotes, fechaCompra: c.fechaCompra } : c;
  }, [FIX.tenencias.find((x) => x.simbolo === sim), FIX.generado, unidades, precio]);

  test('un lote con precio 0 (5, 6, 26, 13; suman 50): el costo es el ppc y vender a +10% da ~+19,6%, no -42%', async ({ cmPage: page }) => {
    await abrir(page);
    // ppc 920, mercado 1000; vende 10 × 1100 = 11.000 contra 10 × 920 = 9.200 → +1.800 (+19,57%). Con el filtro viejo el costo era 1925 → −42,9%.
    const c = await calc(page, 'TESTC', 10, 1100);
    expect(c).toMatchObject({ ok: true, costoUnit: 920, costoTot: 9200, resultado: 1800, origen: 'ppc', aviso: true });
    expect(c.pct).toBeCloseTo(19.5652, 3);
    const baja = await calc(page, 'TESTC', 10, 900); // −10% sobre mercado: 9.000 − 9.200 = −200 (−2,17%), no −53%
    expect(baja.resultado).toBe(-200);
    expect(baja.pct).toBeCloseTo(-2.1739, 3);
    // y en el modal
    await abrirVenta(page, 'TESTC');
    await llenar(page, 10, 1100);
    await expect(page.locator('#ventaResumen')).toContainText('+19.57%');
    await expect(page.locator('#ventaResumen')).not.toContainText('-42');
    await page.click('#ventaConfirmar');
    await expect(page.locator('#modal-venta-activo')).not.toHaveClass(/open/);
    const tx = (await page.evaluate(() => S.carteraTx))[0];
    expect(tx).toMatchObject({ simbolo: 'TESTC', costoUnit: 920, costo: 9200, resultado: 1800, cierra: false });
  });

  test('lotes que suman más que la cantidad (51 vs 30): el costo es el ppc y el modal avisa', async ({ cmPage: page }) => {
    await abrir(page);
    // ppc 1050; vende 10 × 1200 = 12.000 contra 10.500 → +1.500 (los lotes darían (20×1000 + 31×1100)/51 = 1060,78)
    const c = await calc(page, 'TESTD', 10, 1200);
    expect(c).toMatchObject({ ok: true, costoUnit: 1050, costoTot: 10500, resultado: 1500, origen: 'ppc', aviso: true });
    await abrirVenta(page, 'TESTD');
    await llenar(page, 10, 1200);
    await expect(page.locator('#ventaResumen .ten-venta-aviso')).toContainText('El costo sale del promedio que informa IOL porque los lotes no coinciden');
    await page.click('#ventaConfirmar');
    const tx = (await page.evaluate(() => S.carteraTx))[0];
    expect(tx).toMatchObject({ simbolo: 'TESTD', costoUnit: 1050, costo: 10500, resultado: 1500, fechaCompra: '2026-02-02' });
  });

  test('lotes limpios siguen usando el promedio ponderado exacto, sin aviso', async ({ cmPage: page }) => {
    await abrir(page);
    const c = await calc(page, 'TESTA', 100, 1500);
    expect(c).toMatchObject({ ok: true, costoUnit: 1260, costoTot: 126000, resultado: 24000, origen: 'lotes', aviso: false, fechaCompra: '2026-03-10' });
    // aunque el ppc diga otra cosa, con lotes confiables manda el promedio de los lotes
    const otro = await page.evaluate(([t]) => carteraCostoUnit({ ...t, ppc: 5 }).costoUnit, [FIX.tenencias[0]]);
    expect(otro).toBe(1260);
    // tolerancia relativa: una diferencia de redondeo en la cantidad no descarta los lotes
    const tol = await page.evaluate(([t]) => carteraCostoUnit({ ...t, cantidad: 100 * (1 + 1e-9) }).origen, [FIX.tenencias[0]]);
    expect(tol).toBe('lotes');
    // un lote con cantidad inválida o la suma distinta sí los descarta
    const malos = await page.evaluate(([t]) => [
      carteraCostoUnit({ ...t, lotes: [...t.lotes, { fecha: '2026-01-01', cantidad: 0, precio: 5 }] }).origen,
      carteraCostoUnit({ ...t, lotes: [...t.lotes, null] }).origen,
      carteraCostoUnit({ ...t, lotes: [{ fecha: '2026-01-01', cantidad: 100, precio: 'abc' }] }).origen,
      carteraCostoUnit({ ...t, cantidad: 99 }).origen,
    ], [FIX.tenencias[0]]);
    expect(malos).toEqual(['ppc', 'ppc', 'ppc', 'ppc']);
  });

  test('sin lotes y sin ppc válido: se rechaza con "No hay un costo confiable para este activo"', async ({ cmPage: page }) => {
    await abrir(page);
    const r = await calc(page, 'TESTE', 1, 100);
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('No hay un costo confiable para este activo');
    for (const ppc of [0, -5, 'x', null]) { // ppc inválido con lotes malos tampoco sirve
      const rr = await page.evaluate(([t, g, p]) => carteraCalcVenta({ t: { ...t, ppc: p }, generado: g, unidades: 1, precio: 1100 }), [FIX.tenencias.find((x) => x.simbolo === 'TESTC'), FIX.generado, ppc]);
      expect(rr.ok).toBe(false);
    }
    const antes = await estado(page);
    await abrirVenta(page, 'TESTE');
    await llenar(page, 1, 100);
    await expect(page.locator('#ventaResumen')).toContainText('No hay un costo confiable para este activo');
    await page.click('#ventaConfirmar');
    await expect(page.locator('#toast')).toContainText('No hay un costo confiable para este activo');
    await expect(page.locator('#modal-venta-activo')).toHaveClass(/open/);
    expect(await estado(page)).toBe(antes);
  });

  test('fechaCompra: el lote válido más antiguo (ignora el de precio 0) o "s/d" si no hay ninguno', async ({ cmPage: page }) => {
    await abrir(page);
    // TESTC: el lote más antiguo (2026-01-15) tiene precio 0 → vale el siguiente, 2026-02-10
    expect((await calc(page, 'TESTC', 1, 1100)).fechaCompra).toBe('2026-02-10');
    // TESTD: lotes no coinciden pero la fecha igual se muestra (la del más antiguo)
    expect((await calc(page, 'TESTD', 1, 1200)).fechaCompra).toBe('2026-02-02');
    // TESTF: su único lote tiene precio 0 → ningún lote válido → s/d, y el costo es el ppc con aviso
    expect(await calc(page, 'TESTF', 1, 800)).toMatchObject({ ok: true, costoUnit: 700, fechaCompra: 's/d', origen: 'ppc', aviso: true });
    // sin lotes (letra): s/d y sin aviso
    expect(await calc(page, 'TESTLETRA', 1000, 130)).toMatchObject({ fechaCompra: 's/d', origen: 'ppc', aviso: false });
    // y el historial lo muestra
    await vender(page, 'TESTF', 10, 800);
    await page.click('.plov-tab[data-t="historial"]');
    await expect(page.locator('#cov-pane-historial .ten-hist-row')).toContainText('Compra s/d');
  });

  test('el modal muestra de dónde sale el costo y el costo por unidad usado', async ({ cmPage: page }) => {
    await abrir(page);
    await abrirVenta(page, 'TESTA');
    await llenar(page, 10, 1500);
    await expect(page.locator('#ventaResumen .ten-venta-costo')).toContainText('promedio de tus compras');
    await expect(page.locator('#ventaResumen .ten-venta-costo')).toContainText('$1.260');
    await expect(page.locator('#ventaResumen .ten-venta-aviso')).toHaveCount(0);
    await page.evaluate(() => closeModal('modal-venta-activo'));
    await abrirVenta(page, 'TESTC');
    await llenar(page, 10, 1100);
    await expect(page.locator('#ventaResumen .ten-venta-costo')).toContainText('promedio que informa IOL');
    await expect(page.locator('#ventaResumen .ten-venta-costo')).toContainText('$920');
    await expect(page.locator('#ventaResumen .ten-venta-aviso')).toHaveCount(1);
  });
});

test.describe('Ciclos y desfase semanal', () => {
  test('recompra tras el cierre abre un ciclo nuevo y el cerrado no cambia', async ({ cmPage: page }) => {
    await abrir(page);
    await vender(page, 'TESTB', 10, 2200); // cierra: vendido 22.000, costo 18.000, +4.000
    const cerrado = await page.evaluate(() => carteraCiclosCerrados());
    expect(cerrado).toHaveLength(1);
    expect(cerrado[0].resultado).toBe(4000);

    // El lunes siguiente el JSON trae una compra nueva del mismo activo (3 × 2500)
    const nuevo = JSON.parse(JSON.stringify(FIX));
    nuevo.generado = '2099-01-01T00:00:00Z';
    Object.assign(nuevo.tenencias[1], { cantidad: 3, precio: 2600, valorizado: 7800, ppc: 2500, lotes: [{ fecha: '2026-10-10', cantidad: 3, precio: 2500 }] });
    await servir(page, nuevo);
    await reabrir(page);
    await vender(page, 'TESTB', 1, 2600);
    const tx = await page.evaluate(() => S.carteraTx);
    expect(tx).toHaveLength(2);
    expect(tx[1]).toMatchObject({ costoUnit: 2500, resultado: 100, cierra: false, fechaCompra: '2026-10-10' });
    expect(await page.evaluate(() => carteraCiclosCerrados())).toEqual(cerrado); // el cerrado quedó igual
    expect(await page.evaluate(() => carteraVentasAbiertas('TESTB').length)).toBe(1); // y la venta nueva es de un ciclo aparte
    await page.click('.plov-tab[data-t="historial"]');
    await expect(page.locator('#cov-pane-historial .ten-hist-row')).toHaveCount(1);
  });

  test('hasta que el JSON se actualiza descuenta lo vendido; cuando se actualiza no lo descuenta dos veces', async ({ cmPage: page }) => {
    await abrir(page);
    await vender(page, 'TESTA', 40, 1500);
    expect(await page.evaluate(([t, g]) => carteraDisponibles(t, g), [FIX.tenencias[0], FIX.generado])).toBe(60);
    // El lunes IOL ya refleja la venta: cantidad 60 y generado posterior a la venta
    const lunes = JSON.parse(JSON.stringify(FIX));
    lunes.generado = '2099-01-01T00:00:00Z';
    Object.assign(lunes.tenencias[0], { cantidad: 60, valorizado: 90000 });
    expect(await page.evaluate(([t, g]) => carteraDisponibles(t, g), [lunes.tenencias[0], lunes.generado])).toBe(60); // no 20
    // y no se puede vender más de lo que hay aunque se registre dos veces antes del lunes
    const r = await page.evaluate(([t, g]) => carteraCalcVenta({ t, generado: g, unidades: 61, precio: 1500 }), [FIX.tenencias[0], FIX.generado]);
    expect(r.ok).toBe(false);
  });

  test('un solo ciclo cerrado aparece una vez aunque haya varias ventas (agrupa por símbolo entre registros que cierran)', async ({ cmPage: page }) => {
    await abrir(page);
    await vender(page, 'TESTA', 30, 1500);
    await vender(page, 'TESTA', 30, 1500);
    await vender(page, 'TESTA', 40, 1500);
    const c = await page.evaluate(() => carteraCiclosCerrados());
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ simbolo: 'TESTA', fechaCompra: '2026-03-10', resultado: 24000 });
    expect(c[0].pct).toBeCloseTo(19.0476, 3);
  });
});

test.describe('Seguridad y robustez', () => {
  test('un símbolo con HTML se escapa en la lista, el modal y el historial', async ({ cmPage: page }) => {
    await abrir(page);
    await page.evaluate((s) => { window.__xss = undefined; }, XSS_SIM);
    const fila = page.locator('#cov-pane-tenencias .ten-row').filter({ hasText: '<img src=x' });
    await fila.click();
    await page.locator('#cov-pane-tenencias .ten-venta-btn').click();
    await expect(page.locator('#ventaTitulo')).toContainText('<img src=x');
    await llenar(page, 5, 100);
    await page.click('#ventaConfirmar');
    await expect(page.locator('#modal-venta-activo')).not.toHaveClass(/open/);
    await page.click('.plov-tab[data-t="historial"]');
    await expect(page.locator('#cov-pane-historial .ten-hist-row')).toContainText('<img src=x');
    expect(await page.locator('#ov-cartera img').count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    // el movimiento también va escapado en Actividad
    await page.evaluate(() => { renderFinanzasTab(); });
    expect(await page.locator('#tab-finanzas img').count()).toBe(0);
  });

  test('doble clic en confirmar no duplica la venta', async ({ cmPage: page }) => {
    await abrir(page);
    await abrirVenta(page, 'TESTA');
    await llenar(page, 40, 1500);
    await page.locator('#ventaConfirmar').waitFor();
    // dos activaciones seguidas del mismo botón (lo que hace un doble clic), sin depender de dónde cae el segundo
    await page.evaluate(() => { const b = document.getElementById('ventaConfirmar'); b.click(); b.click(); });
    expect(await page.evaluate(() => S.carteraTx.length)).toBe(1);
    expect(await page.evaluate(() => S.moves.length)).toBe(1);
    expect(await page.evaluate(() => S.transactions.length)).toBe(1);
    expect((await saldos(page)).inv).toBe(1000000 - 50400);
  });
});

test.describe('Móvil 390px', () => {
  test('modal, detalle con ventas e historial no generan scroll horizontal', async ({ cmPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrir(page);
    const sinScroll = async () => {
      const r = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - window.innerWidth,
        ov: (() => { const b = document.querySelector('#ov-cartera .cm-ov-body'); return b.scrollWidth - b.clientWidth; })(),
        modal: (() => { const m = document.querySelector('#modal-venta-activo .modal'); return m.scrollWidth - m.clientWidth; })(),
      }));
      expect(r.doc).toBeLessThanOrEqual(0);
      expect(r.ov).toBeLessThanOrEqual(0);
      expect(r.modal).toBeLessThanOrEqual(0);
    };
    await abrirVenta(page, 'TESTA');
    await llenar(page, 100, 1500.5678);
    await expect(page.locator('#ventaResumen')).toContainText('Ganancia');
    await sinScroll();
    await page.click('#ventaConfirmar');
    await vender(page, 'TESTBONO', 100000, 1.3);
    await sinScroll();
    await page.click('.plov-tab[data-t="historial"]');
    await expect(page.locator('#cov-pane-historial .ten-hist-row')).toHaveCount(1);
    await sinScroll();
    // las tres pestañas caben en una fila
    const ancho = await page.evaluate(() => { const t = document.querySelector('#ov-cartera .plov-tabs'); return t.scrollWidth - t.clientWidth; });
    expect(ancho).toBeLessThanOrEqual(0);
  });
});
