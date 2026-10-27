// Botón "Actualizar" de Mis tenencias (tenencias.js): fuerza traer las posiciones en vivo del Worker (?fresh=1).
// Todo inventado: el Worker y el JSON estático se mockean, nunca se toca IOL ni las posiciones reales.
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/fixtures');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cartera-tenencias.json'), 'utf8'));
const CUENTAS = [
  { id: 'inv', name: 'Inversiones', type: 'invest', balance: 1000000, currency: 'ARS', icon: '📈' },
  { id: 'uala', name: 'Ualá', type: 'bank', balance: 200000, currency: 'ARS', icon: '🏦' },
];

// Lo que devuelve el Worker en vivo: sin lotes, variacionPct, precioAnterior ni ppcConfianza.
const enVivo = (t, over) => {
  const { lotes, variacionPct, precioAnterior, ppcConfianza, ...resto } = t;
  return { ...resto, ...over };
};
const respuesta = (generado, tenencias) => ({
  generado,
  tenencias,
  totales: { valorizado: tenencias.reduce((a, t) => a + t.valorizado, 0), variacionPct: null },
});
const TESTA = FIX.tenencias[0];
const TESTB = FIX.tenencias[1];
const GEN_NORMAL = '2026-10-27T12:00:00Z';
const GEN_FRESH = '2026-10-27T15:42:00Z';
// Caché de 15 min: TESTA 150.000 + TESTB 20.000 = 170.000. ppc de TESTA a propósito distinto del promedio de sus lotes (1260).
const VIVO_NORMAL = respuesta(GEN_NORMAL, [
  enVivo(TESTA, { ppc: 1300 }),
  enVivo(TESTB),
]);
// Tras forzar: precios nuevos y una posición que no está en el estático. Total 160.000 + 21.000 + 500 = 181.500.
const NUEVA = { simbolo: 'NUEVO', descripcion: 'Posición nueva', tipo: 'CEDEARS', cantidad: 1, comprometido: 0, precio: 500, variacionDiariaPct: 2, valorizado: 500, ppc: 400, rendimientoPct: 25, rendimientoMonto: 100 };
const VIVO_FRESH = respuesta(GEN_FRESH, [
  enVivo(TESTA, { ppc: 1300, precio: 1600, valorizado: 160000 }),
  enVivo(TESTB, { precio: 2100, valorizado: 21000 }),
  NUEVA,
]);

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-expose-headers': 'x-cartera-fuente' };

// Mockea Worker + estático y abre el overlay. `ctl` deja cambiar las respuestas durante el test.
async function abrir(page, { estatico = FIX, normal = VIVO_NORMAL } = {}) {
  const ctl = { llamadas: [], fresh: { status: 200, body: VIVO_FRESH }, espera: null, estaticoStatus: estatico ? 200 : 404 };
  await page.route('**/data/cartera/tenencias.json', (r) => ctl.estaticoStatus === 200
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(estatico) })
    : r.fulfill({ status: ctl.estaticoStatus, contentType: 'application/json', body: '{}' }));
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const fresh = new URL(req.url()).searchParams.get('fresh') === '1';
    ctl.llamadas.push({ fresh, auth: req.headers().authorization });
    if (fresh && ctl.espera) await ctl.espera;
    const resp = fresh ? ctl.fresh : { status: 200, body: normal };
    return r.fulfill({ status: resp.status, contentType: 'application/json', headers: { ...CORS, 'x-cartera-fuente': fresh ? 'iol' : 'cache' }, body: JSON.stringify(resp.body) });
  });
  await page.evaluate((c) => {
    _auth.currentUser.getIdToken = async () => 'token-de-prueba';
    S.accounts = JSON.parse(JSON.stringify(c));
    S.transactions = []; S.moves = []; S.carteraTx = [];
  }, CUENTAS);
  await page.evaluate(() => CarteraOverlay.open());
  await expect(page.locator('#cov-pane-tenencias .ten-row[data-simbolo]').first()).toBeVisible();
  return ctl;
}

const boton = (page) => page.locator('#cov-pane-tenencias .ten-act-btn');
const meta = (page) => page.locator('#cov-pane-tenencias .ci-meta');
const heroNum = async (page) => (await page.locator('#cov-pane-tenencias .ten-hero-num').innerText()).replace(/\D/g, '');
const fila = (page, sim) => page.locator(`#cov-pane-tenencias .ten-row[data-simbolo="${sim}"]`);
const horaLocal = (page, iso) => page.evaluate((i) => new Date(i).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }), iso);
const soloRuidoDeRed = (errores) => errores.filter((e) => !/Failed to load resource/.test(e));

test.describe('Botón Actualizar en Mis tenencias', () => {
  test('el botón se ve en el encabezado, carga normal sin fresh y el click llama con fresh=1 y repinta los valores nuevos', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page);
    await expect(boton(page)).toBeVisible();
    await expect(boton(page)).toHaveText('Actualizar');
    await expect(boton(page)).toBeEnabled();
    await expect(boton(page)).toHaveAttribute('aria-label', /Actualizar tenencias/);
    await expect(boton(page)).toHaveClass(/btn-ghost/);
    await expect(boton(page)).toHaveClass(/btn-sm/);
    expect(await boton(page).evaluate((b) => b.tagName)).toBe('BUTTON');
    expect(ctl.llamadas).toEqual([{ fresh: false, auth: 'Bearer token-de-prueba' }]);
    expect(await heroNum(page)).toBe('170000');
    await expect(fila(page, 'NUEVO')).toHaveCount(0);

    await boton(page).click();
    await expect(fila(page, 'NUEVO')).toBeVisible();
    expect(ctl.llamadas).toHaveLength(2);
    expect(ctl.llamadas[1]).toEqual({ fresh: true, auth: 'Bearer token-de-prueba' });
    expect(await heroNum(page)).toBe('181500');
    await expect(meta(page)).toContainText(`Actualizado a las ${await horaLocal(page, GEN_FRESH)}`);
    await expect(boton(page)).toHaveText('Actualizar');
    await expect(boton(page)).toBeEnabled();
    expect(consoleErrors).toEqual([]);
  });

  test('mientras espera dice "Actualizando…" y está deshabilitado: un segundo click no dispara otra consulta', async ({ cmPage: page }) => {
    const ctl = await abrir(page);
    let liberar;
    ctl.espera = new Promise((r) => { liberar = r; });
    await boton(page).click();
    await expect(boton(page)).toHaveText('Actualizando…');
    await expect(boton(page)).toBeDisabled();
    await boton(page).click({ force: true }).catch(() => {});
    // Aunque se repinte la pantalla mientras espera (abrir una fila), el botón sigue ocupado.
    await fila(page, 'TESTA').click();
    await expect(boton(page)).toBeDisabled();
    await expect(boton(page)).toHaveText('Actualizando…');
    expect(await heroNum(page)).toBe('170000');

    liberar();
    await expect(fila(page, 'NUEVO')).toBeVisible();
    await expect(boton(page)).toBeEnabled();
    await expect(boton(page)).toHaveText('Actualizar');
    expect(ctl.llamadas.filter((l) => l.fresh)).toHaveLength(1);
  });

  test('si el Worker falla: toast con su mensaje, datos previos intactos y el botón vuelve a habilitarse', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page);
    const msg = 'El Worker no tiene configuradas las credenciales de IOL (secrets IOL_USER / IOL_PASS).';
    ctl.fresh = { status: 500, body: { error: 'missing_credentials', message: msg } };
    await fila(page, 'TESTA').click(); // dejar una fila abierta: el error no debe cerrarla ni cambiar nada
    await boton(page).click();
    await expect(page.locator('#toast.show').filter({ hasText: msg })).toBeVisible();
    // El toast queda debajo del overlay: el motivo también se ve dentro de la pantalla de Cartera.
    await expect(page.locator('#cov-pane-tenencias .ten-act-err')).toHaveText('En vivo no disponible: ' + msg);
    await expect(page.locator('#cov-pane-tenencias .ten-act-err')).toBeVisible();
    await expect(boton(page)).toBeEnabled();
    await expect(boton(page)).toHaveText('Actualizar');
    expect(await heroNum(page)).toBe('170000');
    await expect(fila(page, 'NUEVO')).toHaveCount(0);
    await expect(page.locator('#cov-pane-tenencias .ten-detail')).toHaveCount(1);
    await expect(meta(page)).not.toContainText('Actualizado a las');

    // Un 502 de IOL caído también deja todo como estaba y se puede reintentar.
    ctl.fresh = { status: 502, body: { error: 'iol_unavailable', message: 'No se pudo obtener la cartera desde IOL: portafolio IOL falló (HTTP 500)' } };
    await boton(page).click();
    await expect(page.locator('#toast.show').filter({ hasText: 'portafolio IOL falló' })).toBeVisible();
    await expect(boton(page)).toBeEnabled();
    expect(await heroNum(page)).toBe('170000');

    // Y cuando IOL vuelve, el mismo botón funciona.
    ctl.fresh = { status: 200, body: VIVO_FRESH };
    await boton(page).click();
    await expect(fila(page, 'NUEVO')).toBeVisible();
    expect(await heroNum(page)).toBe('181500');
    await expect(page.locator('#cov-pane-tenencias .ten-act-err')).toHaveCount(0);
    // Los 500/502 mockeados dejan su línea de red en la consola; cualquier otro error sería un bug.
    expect(soloRuidoDeRed(consoleErrors)).toEqual([]);
  });

  test('fusión: lo en vivo conserva los lotes del estático (carga normal y forzada) y la venta usa el costo por lotes', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    const detalle = page.locator('#cov-pane-tenencias .ten-detail');

    // Carga normal (sin fresh): el historial de compras y la variación semanal vienen del estático.
    await fila(page, 'TESTA').click();
    await expect(detalle.locator('.ten-lotes-lbl').first()).toHaveText('Historial de compras');
    await expect(detalle.locator('.ten-lotes-list .ten-lote-item')).toHaveCount(3);
    await expect(detalle).toContainText('+1.00%'); // variacionPct semanal del estático

    await boton(page).click();
    await expect(fila(page, 'NUEVO')).toBeVisible();
    // Tras forzar: precio nuevo en vivo + lotes del estático.
    await expect(detalle).toContainText('$1.600'); // precio actual en vivo
    await expect(detalle.locator('.ten-lotes-list .ten-lote-item')).toHaveCount(3);

    // La venta usa el costo por lotes (1260), no el ppc en vivo (1300).
    await page.locator('.ten-venta-btn[data-simbolo="TESTA"]').click();
    await expect(page.locator('#modal-venta-activo')).toHaveClass(/open/);
    await page.fill('#ventaUnidades', '100');
    await page.fill('#ventaPrecio', '1600');
    const resumen = page.locator('#ventaResumen');
    await expect(resumen).toContainText('promedio de tus compras');
    await expect(resumen).not.toContainText('promedio que informa IOL');
    await expect(resumen).toContainText('$1.260');
    await expect(resumen).toContainText('$126.000');
    await page.click('#ventaConfirmar');
    await expect(page.locator('#modal-venta-activo')).not.toHaveClass(/open/);
    expect(await page.evaluate(() => S.carteraTx.map((x) => [x.simbolo, x.costoUnit, x.fechaCompra]))).toEqual([['TESTA', 1260, '2026-03-10']]);

    // Posición nueva, sin match en el estático: se muestra sin historial ni variación semanal y sin romper nada.
    await fila(page, 'NUEVO').click();
    await expect(page.locator('#cov-pane-tenencias .ten-detail')).toContainText('Sin dato aún');
    await expect(page.locator('#cov-pane-tenencias .ten-lotes-lbl').filter({ hasText: 'Historial de compras' })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('si el estático no carga, igual muestra lo en vivo (carga y actualización)', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page, { estatico: null });
    expect(await heroNum(page)).toBe('170000');
    await boton(page).click();
    await expect(fila(page, 'NUEVO')).toBeVisible();
    expect(await heroNum(page)).toBe('181500');
    await fila(page, 'TESTA').click();
    await expect(page.locator('#cov-pane-tenencias .ten-lotes-lbl').filter({ hasText: 'Historial de compras' })).toHaveCount(0);
    expect(ctl.llamadas.filter((l) => l.fresh)).toHaveLength(1);
    expect(soloRuidoDeRed(consoleErrors)).toEqual([]); // el 404 mockeado del estático deja su línea de red
  });

  test('si el Worker no responde al abrir, cae al estático y el botón permite pedir lo en vivo', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page, { normal: null });
    // Sin sesión de Worker al abrir: lo simulamos devolviendo 503 en la carga normal.
    await page.unroute('**/cdm-push-worker.tobiasloustau11.workers.dev/**');
    await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', async (r) => {
      const req = r.request();
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      const fresh = new URL(req.url()).searchParams.get('fresh') === '1';
      ctl.llamadas.push({ fresh });
      return fresh
        ? r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(VIVO_FRESH) })
        : r.fulfill({ status: 503, contentType: 'application/json', headers: CORS, body: '{}' });
    });
    await page.evaluate(() => CarteraOverlay.open());
    await expect(fila(page, 'TESTA')).toBeVisible();
    await expect(meta(page)).toContainText('Último cierre');
    await expect(page.locator('#cov-pane-tenencias .ten-act-err')).toHaveText('En vivo no disponible: worker HTTP 503');
    await expect(boton(page)).toBeVisible();
    await boton(page).click();
    await expect(fila(page, 'NUEVO')).toBeVisible();
    await expect(meta(page)).toContainText('En vivo · Actualizado a las');
    await fila(page, 'TESTB').click();
    await expect(page.locator('#cov-pane-tenencias .ten-lotes-list .ten-lote-item')).toHaveCount(2); // lotes del estático
    expect(soloRuidoDeRed(consoleErrors)).toEqual([]);
  });
});

test.describe('Botón Actualizar a 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('el botón entra en el ancho, sin scroll horizontal, antes y durante la espera', async ({ cmPage: page }) => {
    const ctl = await abrir(page);
    const medir = async () => page.evaluate(() => {
      const b = document.querySelector('#cov-pane-tenencias .ten-act-btn').getBoundingClientRect();
      const pane = document.querySelector('#cov-pane-tenencias');
      return { left: b.left, right: b.right, h: b.height, vw: document.documentElement.clientWidth,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        paneOverflow: pane.scrollWidth - pane.clientWidth };
    });
    const antes = await medir();
    expect(antes.left).toBeGreaterThanOrEqual(0);
    expect(antes.right).toBeLessThanOrEqual(antes.vw);
    expect(antes.docOverflow).toBeLessThanOrEqual(0);
    expect(antes.paneOverflow).toBeLessThanOrEqual(0);

    let liberar;
    ctl.espera = new Promise((r) => { liberar = r; });
    await boton(page).click();
    await expect(boton(page)).toHaveText('Actualizando…');
    const durante = await medir();
    expect(durante.right).toBeLessThanOrEqual(durante.vw);
    expect(durante.docOverflow).toBeLessThanOrEqual(0);
    expect(durante.paneOverflow).toBeLessThanOrEqual(0);
    liberar();
    await expect(meta(page)).toContainText('Actualizado a las');
    const despues = await medir();
    expect(despues.right).toBeLessThanOrEqual(despues.vw);
    expect(despues.docOverflow).toBeLessThanOrEqual(0);
    expect(despues.paneOverflow).toBeLessThanOrEqual(0);
  });
});
