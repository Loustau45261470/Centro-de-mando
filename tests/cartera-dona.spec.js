// Gráfico "Cartera actual" (dona) de la pestaña "Mis tenencias" del overlay Cartera (tenencias.js).
// Datos inventados acá mismo: nunca las posiciones reales. El Worker en vivo se mockea caído para que
// Tenencias.renderInto caiga a la fuente estática (tenencias.json, que llega por el Worker en /datos/), también mockeada.
'use strict';
const { test, expect } = require('./support/fixtures');

const soloRuidoDeRed = (errores) => errores.filter((e) => !/Failed to load resource/.test(e));

const pos = (simbolo, tipo, valorizado) => ({
  simbolo, descripcion: 'Posición de prueba ' + simbolo, tipo, cantidad: 1, comprometido: 0, precio: valorizado,
  variacionDiariaPct: 0, variacionPct: 0, valorizado, ppc: valorizado, ppcConfianza: 'alta', rendimientoPct: 0, rendimientoMonto: 0, lotes: [],
});

// Total 1.100.000. Acciones (CEDEARS + ACCIONES) suman 820.000.
const TENENCIAS = [
  pos('AAA', 'CEDEARS', 400000),
  pos('BBB', 'CEDEARS', 200000),
  pos('CCC', 'CEDEARS', 100000),
  pos('DDD', 'CEDEARS', 15000),     // 1,36 % del total  · 1,83 % de acciones  -> Otros en ambas vistas
  pos('EEE', 'CEDEARS', 5000),      // 0,45 % del total  · 0,61 % de acciones  -> Otros en ambas vistas
  pos('FFF', 'ACCIONES', 100000),
  pos('BONO', 'TIT. PUBLICOS', 180000),
  pos('LETRA', 'Letras', 100000),
];
const fixtureDe = (tenencias) => ({
  generado: '2026-10-19T11:00:00Z',
  totales: { valorizado: tenencias.reduce((a, t) => a + t.valorizado, 0), variacionPct: 0 },
  tenencias,
});

const TOTAL_ESPERADO = [['AAA', '36.4%'], ['BBB', '18.2%'], ['BONO', '16.3%'], ['CCC', '9.1%'], ['FFF', '9.1%'], ['LETRA', '9.1%'], ['Otros', '1.8%']];
const ACCIONES_ESPERADO = [['AAA', '48.8%'], ['BBB', '24.4%'], ['CCC', '12.2%'], ['FFF', '12.2%'], ['Otros', '2.4%']];

async function abrir(page, fixture = fixtureDe(TENENCIAS)) {
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' };
  // /cartera (en vivo) caída; /datos/tenencias.json (archivo privado) sirve el fixture. El genérico va primero: el de /datos/ lo pisa.
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', headers: CORS, body: '{}' }));
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/datos/tenencias.json', (r) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: CORS })
    : r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(fixture) }));
  await page.evaluate(() => { _auth.currentUser.getIdToken = async () => 'token-de-prueba'; });
  await page.evaluate(() => CarteraOverlay.open());
  await expect(page.locator('#cov-pane-tenencias .ten-dona')).toBeVisible();
}

const leyenda = (page) => page.$$eval('#cov-pane-tenencias .ten-dona-item', (lis) =>
  lis.map((li) => [li.querySelector('.ten-dona-sim').textContent, li.querySelector('.ten-dona-pct').textContent]));
const centro = (page) => page.locator('#cov-pane-tenencias .ten-dona-centro-num').innerText();
const digitos = (s) => s.replace(/\D/g, '');
const chip = (page, id) => page.locator(`#cov-pane-tenencias .ten-dona .ten-orden-chip[data-dona="${id}"]`);

test.describe('Dona "Cartera actual" en Mis tenencias', () => {
  test('vista Total cartera: tarjeta antes de la tabla, % sobre el total, "Otros" agrupa lo menor a 2 %, centro con el total', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);

    await expect(page.locator('#cov-pane-tenencias .ten-dona .sec-label')).toHaveText('Cartera actual');
    // La tarjeta va antes de cualquier grupo de la tabla.
    const orden = await page.$$eval('#cov-pane-tenencias .ten-card', (cs) => cs.map((c) => c.classList.contains('ten-dona')));
    expect(orden[0]).toBe(true);
    expect(orden.filter(Boolean)).toHaveLength(1);

    expect(await leyenda(page)).toEqual(TOTAL_ESPERADO);
    expect(digitos(await centro(page))).toBe('1100000');
    await expect(chip(page, 'total')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'acciones')).toHaveAttribute('aria-pressed', 'false');
    // Los % de la leyenda suman exactamente 100,0 (el redondeo se reparte).
    const suma = (await leyenda(page)).reduce((a, [, p]) => a + parseFloat(p), 0);
    expect(Math.round(suma * 10)).toBe(1000);

    // Chart.js es un script del CDN: si cargó, hay una dona con un dato por fila de la leyenda.
    if (await page.evaluate(() => typeof Chart !== 'undefined')) {
      const info = await page.evaluate(() => {
        const c = Chart.getChart(document.querySelector('#cov-pane-tenencias .ten-dona canvas'));
        return c && { type: c.config.type, n: c.data.datasets[0].data.length };
      });
      expect(info).toEqual({ type: 'doughnut', n: TOTAL_ESPERADO.length });
    }
    expect(soloRuidoDeRed(consoleErrors)).toEqual([]); // el 503 mockeado de /cartera deja su línea de red
  });

  test('Solo acciones recalcula dona, centro y %; Total cartera vuelve; la vista sobrevive al repintado', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);

    await chip(page, 'acciones').click();
    expect(await leyenda(page)).toEqual(ACCIONES_ESPERADO);
    expect(digitos(await centro(page))).toBe('820000');
    await expect(chip(page, 'acciones')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'total')).toHaveAttribute('aria-pressed', 'false');
    // Ni el bono ni la letra aparecen en la vista de acciones.
    const sims = (await leyenda(page)).map(([s]) => s);
    expect(sims).not.toContain('BONO');
    expect(sims).not.toContain('LETRA');

    // Repintado completo (abrir el detalle de una fila): una sola instancia viva, vista intacta.
    const instancias = () => page.evaluate(() => (typeof Chart === 'undefined' ? -1 : Object.keys(Chart.instances).length));
    const antes = await instancias();
    await page.locator('#cov-pane-tenencias .ten-row[data-simbolo="AAA"]').click();
    await expect(page.locator('#cov-pane-tenencias .ten-detail')).toBeVisible();
    expect(await instancias()).toBe(antes);
    await expect(page.locator('#cov-pane-tenencias .ten-dona canvas')).toHaveCount(1);
    expect(await leyenda(page)).toEqual(ACCIONES_ESPERADO);

    await chip(page, 'total').click();
    expect(await leyenda(page)).toEqual(TOTAL_ESPERADO);
    expect(digitos(await centro(page))).toBe('1100000');
    expect(await instancias()).toBe(antes);
    expect(soloRuidoDeRed(consoleErrors)).toEqual([]); // el 503 mockeado de /cartera deja su línea de red
  });

  test('sin acciones: la vista Solo acciones muestra un texto vacío en vez de la dona', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page, fixtureDe([pos('BONO', 'TIT. PUBLICOS', 180000), pos('LETRA', 'Letras', 100000)]));
    expect(await leyenda(page)).toEqual([['BONO', '64.3%'], ['LETRA', '35.7%']]);

    await chip(page, 'acciones').click();
    await expect(page.locator('#cov-pane-tenencias .ten-dona-vacio')).toBeVisible();
    await expect(page.locator('#cov-pane-tenencias .ten-dona canvas')).toHaveCount(0);
    await expect(page.locator('#cov-pane-tenencias .ten-dona-item')).toHaveCount(0);

    await chip(page, 'total').click();
    await expect(page.locator('#cov-pane-tenencias .ten-dona canvas')).toHaveCount(1);
    expect(soloRuidoDeRed(consoleErrors)).toEqual([]); // el 503 mockeado de /cartera deja su línea de red
  });

  test('a 320 px no hay desborde horizontal y la leyenda queda debajo de la dona', async ({ cmPage: page, consoleErrors }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await abrir(page);
    await expect(page.locator('#cov-pane-tenencias .ten-dona-item').first()).toBeVisible();

    for (const vista of ['total', 'acciones']) {
      await chip(page, vista).click();
      const m = await page.evaluate(() => {
        const card = document.querySelector('#cov-pane-tenencias .ten-dona');
        const chart = card.querySelector('.ten-dona-chart').getBoundingClientRect();
        const ley = card.querySelector('.ten-dona-leyenda').getBoundingClientRect();
        const c = card.getBoundingClientRect();
        return {
          pagina: document.documentElement.scrollWidth - window.innerWidth,
          tarjeta: card.scrollWidth - card.clientWidth,
          chartAncho: chart.width, chartDerecha: chart.right, leyDerecha: ley.right, cardDerecha: c.right,
          leyDebajo: ley.top >= chart.bottom - 1,
        };
      });
      expect(m.pagina).toBeLessThanOrEqual(0);
      expect(m.tarjeta).toBeLessThanOrEqual(0);
      expect(m.chartDerecha).toBeLessThanOrEqual(m.cardDerecha + 0.5);
      expect(m.leyDerecha).toBeLessThanOrEqual(m.cardDerecha + 0.5);
      expect(m.leyDebajo).toBe(true);
    }
    expect(soloRuidoDeRed(consoleErrors)).toEqual([]); // el 503 mockeado de /cartera deja su línea de red
  });
});

// Ganancia o pérdida junto a la dona: ponderada por plata (suma ganada / suma costada), no promedio simple de %.
test('ganancia total y de solo acciones: % sobre lo invertido y $; lo que no tiene precio de compra no entra y se avisa', async ({ cmPage: page, consoleErrors }) => {
  const g = (simbolo, tipo, valorizado, rendimientoMonto) => ({ ...pos(simbolo, tipo, valorizado), rendimientoMonto, rendimientoPct: 1 });
  await abrir(page, fixtureDe([
    g('AAA', 'CEDEARS', 300000, 100000),     // costó 200.000
    g('BBB', 'ACCIONES', 100000, -20000),    // costó 120.000
    g('BONO', 'TIT. PUBLICOS', 100000, -30000), // costó 130.000
    { ...pos('SINPPC', 'CEDEARS', 50000), ppc: null, rendimientoMonto: null, rendimientoPct: null },
  ]));
  const filas = await page.$$eval('#cov-pane-tenencias .ten-gan-fila', (fs) => fs.map((f) => f.innerText.replace(/\s+/g, ' ').trim()));
  // Total: +50.000 sobre 450.000 = +11,11 %. Acciones: +80.000 sobre 320.000 = +25,00 %.
  expect(filas[0]).toContain('Total cartera');
  expect(filas[0]).toContain('+11.11%');
  expect(filas[0]).toContain('+$50.000');
  expect(filas[1]).toContain('Solo acciones');
  expect(filas[1]).toContain('+25.00%');
  expect(filas[1]).toContain('+$80.000');
  expect(filas[0]).toContain('1 sin precio de compra');
  await expect(page.locator('#cov-pane-tenencias .ten-gan-fila').first().locator('.text-ok')).toBeVisible();
  expect(soloRuidoDeRed(consoleErrors)).toEqual([]); // el 503 mockeado de /cartera deja su línea de red
});
