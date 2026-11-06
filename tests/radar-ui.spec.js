// Radar v2 — la pestaña "Radar" de Cartera en la app (radar.js + radar-vista.js + radar.css), con el Worker mockeado (page.route) y datos
// INVENTADOS (tests/fixtures/radar-v2.js: empresas ficticias, nunca la cartera real). Corre en escritorio (1280) y celular (390).
// Con RADAR_SHOTS=<carpeta> también guarda capturas para revisarlas a ojo.
'use strict';
const path = require('path');
const fs = require('fs');
const { test, expect } = require('./support/fixtures');
const D = require('./fixtures/radar-v2.js');

const SHOTS = process.env.RADAR_SHOTS || '';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 4h20v16H2z"/></svg>';

async function abrir(page, over = {}) {
  const ctl = { archivos: Object.assign({ 'tenencias.json': { generado: '2026-11-10T12:00:00Z', tenencias: [] } }, D.archivos(over.archivos)), falla: new Set(over.falla || []), reportar: over.reportar || 'ok', llamadas: [], posts: [] };
  await page.route('**/cdn.jsdelivr.net/npm/simple-icons@*/icons/*.svg', (r) => {
    ctl.llamadas.push('ICONO ' + r.request().url().split('/').pop());
    if (r.request().url().endsWith('/acmeicon.svg')) return r.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: SVG });
    return r.fulfill({ status: 404, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'no' });
  });
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const u = new URL(req.url());
    const json = (status, body) => r.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
    const m = /^\/datos\/(.+\.json)$/.exec(u.pathname);
    if (m) {
      ctl.llamadas.push('GET ' + m[1]);
      if (ctl.falla.has(m[1])) return json(500, { error: 'boom' });
      return ctl.archivos[m[1]] !== undefined ? json(200, ctl.archivos[m[1]]) : json(404, { error: 'not_found', message: 'Ese archivo no existe.' });
    }
    if (u.pathname === '/radar/reportar') {
      const b = JSON.parse(req.postData() || '{}');
      ctl.posts.push(b);
      const rep = { id: `${b.ticker}:${b.kpi_id}:${b.trimestre}`, ticker: b.ticker, kpi_id: b.kpi_id, trimestre: b.trimestre, valor_mostrado: b.valor_mostrado, comentario: b.comentario || '', estado: 'en_revision', reportado_en: '2026-11-10T15:00:00Z', resuelto_en: null, resolucion: null };
      if (ctl.reportar === 'limite') return json(429, { error: 'limite_diario', message: 'Ya se enviaron 20 reportes hoy. Probá mañana.' });
      if (ctl.reportar === 'permiso') return json(502, { error: 'github_permiso', message: 'GitHub no dejó escribir reportes.json' });
      if (ctl.reportar === 'bad') return json(400, { error: 'bad_param', message: 'kpi_id inválido.' });
      return json(200, { ok: true, duplicado: ctl.reportar === 'dup', reporte: rep });
    }
    return json(404, { error: 'not_found_route' });
  });
  await page.evaluate(() => {
    _auth.currentUser.getIdToken = async () => 'token-de-prueba';
    S.accounts = [{ id: 'inv', name: 'Inversiones', type: 'invest', balance: 1000, currency: 'ARS', icon: '📈' }];
  });
  await page.evaluate(() => CarteraOverlay.open());
  await page.locator('#ov-cartera .plov-tab[data-t="radar"]').click();
  return ctl;
}

const pane = (page) => page.locator('#cov-pane-radar');
const emp = (page, t) => pane(page).locator(`.rd-emp[data-t="${t}"]`);
const kpi = (page, t, id) => pane(page).locator(`.rd-kpi[data-k="${t}:${id}"]`);
const elegir = async (page, t) => { await emp(page, t).click(); await expect(pane(page).locator('.rd-fn')).toContainText(t); };
const abrirFuente = async (page, t, id) => { const k = kpi(page, t, id); await k.locator('.rd-k-v').click(); await expect(k.locator('.rd-k-f')).toBeVisible(); return k; };
const sinErrores = (consoleErrors) => expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
const esperarGrafico = async (page) => { await page.waitForFunction(() => typeof Chart !== 'undefined' && !!Chart.getChart(document.getElementById('rd-cv'))); };
const desborde = (page) => page.evaluate(() => {
  const p = document.querySelector('#cov-pane-radar'), w = document.documentElement.clientWidth;
  const fuera = [...p.querySelectorAll('.rd-root *')].filter((e) => {
    if (e.closest('.rd-strip-row') || e.closest('.rd-tabla-wrap')) return false;      // la franja y la tabla se desplazan por dentro
    const r = e.getBoundingClientRect();
    return r.width > 0 && (r.right > w + 1 || r.left < -1);
  }).map((e) => (typeof e.className === 'string' && e.className) || e.tagName).slice(0, 6);
  const ov = document.querySelector('#ov-cartera .cm-ov-body');
  return { doc: document.documentElement.scrollWidth - w, cuerpo: ov.scrollWidth - ov.clientWidth, fuera };
});
async function foto(page, nombre) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, nombre + '.png') });
}

async function fotoEl(loc, nombre) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await loc.scrollIntoViewIfNeeded();
  await loc.page().waitForTimeout(400);
  await loc.screenshot({ path: path.join(SHOTS, nombre + '.png') });
}

test.describe('pestaña Radar de Cartera (v2)', () => {
  test.beforeEach(async ({ cmPage }) => { test.setTimeout(120000); cmPage.on('dialog', (d) => d.accept()); });

  test('la franja "Empresas para explorar" reemplaza la grilla: logo monocromo o iniciales + nombre, sin precios; se desliza y se maneja con el teclado', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page);
    await expect(pane(page).locator('.rd-emp')).toHaveCount(12);              // las empresas salen de radar-config.json
    await expect(pane(page).locator('.rd-card, .rd-grid')).toHaveCount(0);   // la grilla de tarjetas ya no existe
    await expect(pane(page).locator('.rd-strip-t')).toHaveText(/empresas para explorar/i);
    await expect(pane(page).locator('.rd-strip-t')).toHaveCSS('text-transform', 'uppercase');
    await expect(emp(page, 'ACME').locator('.rd-emp-n')).toHaveText('Acme Pagos');   // solo logo + nombre: ni precio ni múltiplos
    await expect(emp(page, 'ACME')).not.toContainText(/US$|d,dx|%/);
    await expect(emp(page, 'ACME').locator('.rd-logo.ok')).toHaveCount(1);   // ícono cargado: máscara teñida de gris
    await expect(emp(page, 'ZETA').locator('.rd-logo')).toHaveText('ZM');    // el ícono no existe → iniciales
    await expect(emp(page, 'ZETA').locator('.rd-logo.ok')).toHaveCount(0);
    await expect(emp(page, 'NUBO').locator('.rd-logo')).toHaveText('NB');    // sin ícono en el config → iniciales
    expect(await emp(page, 'ACME').locator('.rd-logo').evaluate((e) => getComputedStyle(e).backgroundColor)).toMatch(/rgb\(174, 185, 201\)/);
    // La franja es una sola fila que se desliza de costado por dentro, sin ensanchar la página.
    const fila = pane(page).locator('.rd-strip-row');
    const m = await fila.evaluate((e) => { const antes = e.scrollLeft; e.scrollLeft = 400; return { ancho: e.scrollWidth, visible: e.clientWidth, antes, despues: e.scrollLeft, snap: getComputedStyle(e).scrollSnapType, alto: e.getBoundingClientRect().height }; });
    expect(m.ancho).toBeGreaterThan(m.visible); expect(m.despues).toBeGreaterThan(m.antes); expect(m.snap).toContain('x');
    expect((await desborde(page)).doc).toBeLessThanOrEqual(0);
    // Teclado: Tab llega a las empresas, las flechas se mueven y Enter abre la ficha.
    await fila.evaluate((e) => { e.scrollLeft = 0; });
    await fotoEl(pane(page).locator('.rd-strip'), 'franja');
    await emp(page, 'ACME').focus();
    await page.keyboard.press('ArrowRight');
    await expect(emp(page, 'NUBO')).toBeFocused();
    await page.keyboard.press('End');
    await expect(emp(page, 'E12')).toBeFocused();
    await page.keyboard.press('Home'); await page.keyboard.press('Enter');
    await expect(pane(page).locator('.rd-fn')).toContainText('Acme Pagos');
    await expect(emp(page, 'ACME')).toHaveAttribute('aria-pressed', 'true');
    await expect(emp(page, 'NUBO')).toHaveAttribute('aria-pressed', 'false');
    expect(ctl.llamadas.filter((l) => l === 'GET radar-config.json')).toHaveLength(1);
    sinErrores(consoleErrors);
  });

  test('elegir una empresa abre su ficha: secciones en el orden de la lista, precio y estado de los datos (mercado, último comunicado)', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    await expect(pane(page).locator('.rd-estado')).toContainText('Elegí una empresa');
    await elegir(page, 'ACME');
    await expect(pane(page).locator('.rd-sec .rd-h3')).toHaveText(['Precio', 'Crecimiento', 'Rentabilidad', 'Calidad de ganancias', 'Caja', 'Eficiencia y retorno', 'Balance y riesgo', 'Capital', 'Valuación', 'Expectativas y mercado', 'Indicadores de Acme Pagos']);
    await expect(pane(page).locator('.rd-fpx')).toContainText('US$ 100,00');
    await expect(pane(page).locator('.rd-fpx')).toContainText('05/11/26');
    await expect(pane(page).locator('.rd-estado')).toContainText('Datos de mercado del 06/11');
    await expect(pane(page).locator('.rd-estado')).toContainText('Último comunicado: Q3 2026');
    await expect(pane(page).locator('.rd-estado')).toContainText('Resultados trimestrales hasta el 30/09/26');
    await pane(page).locator('.rd-estado').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await foto(page, 'ficha');
    sinErrores(consoleErrors);
  });

  test('P/E con la variante en el rótulo (TTM GAAP, ajustado, forward de 12 meses con el del año en curso y el del siguiente como detalle), EPS básico y diluido y las medias de 5/10/15 años', async ({ cmPage: page }) => {
    await abrir(page);
    await elegir(page, 'ACME');
    await expect(kpi(page, 'ACME', 'p_e_ttm')).toContainText('P/E TTM (GAAP)');
    await expect(kpi(page, 'ACME', 'p_e_ttm')).toContainText('25,0x');
    await expect(kpi(page, 'ACME', 'p_e_ttm_ajustado')).toContainText('P/E TTM ajustado');
    await expect(kpi(page, 'ACME', 'p_e_ttm_ajustado')).toContainText('sin datos todavía');
    await expect(kpi(page, 'ACME', 'p_e_forward')).toContainText('P/E fwd (12 meses)');
    await expect(kpi(page, 'ACME', 'p_e_forward')).toContainText('18,0x');
    await expect(kpi(page, 'ACME', 'p_e_forward_fy_actual')).toContainText('P/E fwd año fiscal en curso (EPS 2026e)');
    await expect(kpi(page, 'ACME', 'p_e_forward_siguiente')).toContainText('P/E fwd año fiscal siguiente (EPS 2027e)');
    await expect(kpi(page, 'ACME', 'p_e_forward_siguiente')).toContainText('15,0x');
    await expect(kpi(page, 'ACME', 'eps_gaap')).toContainText('EPS GAAP diluido');
    await expect(kpi(page, 'ACME', 'eps_gaap_basico')).toContainText('EPS GAAP básico');
    const med = await abrirFuente(page, 'ACME', 'p_e_vs_media_5_10_15_anos');
    await expect(med).toContainText('vs media 5 años');
    await expect(med.locator('.rd-ln')).toContainText('Media 5 años (desde 30/09/23)');
    await expect(med.locator('.rd-ln')).toContainText('desde la salida a bolsa, 01/03/21');
  });

  test('retorno y valuación: ROIC, rotación, cobertura, ciclo de caja, WACC visible, ROIC vs WACC, PEG y valuación vs la mediana de los pares', async ({ cmPage: page, consoleErrors }) => {
    const man = { v: 1, empresas: { ACME: { pe_forward_media: { '5y': 20, '10y': null, '15y': null, mediana: 16, desde: 'dic-21', fuente: 'Fuente inventada', fecha_dato: '2026-11-06' }, pares: ['PA', 'PB', 'PC'], pares_fecha: '2026-11-06', wacc: { valor: 0.0733, rango: { bajo: 0.064, alto: 0.083 }, fuente: 'ValueInvesting.io', fecha_dato: '2026-11-06' } } } };
    const par = (v, n) => ({ nombre: n, precio: { valor: 10, fecha: '2026-11-05' }, pe_forward_ntm: { valor: v, fuente: 'yahoo', fecha: '2026-11-06' } });
    await abrir(page, { archivos: { 'radar-manual.json': man, 'pares-mercado.json': { v: 1, generado: '2026-11-06', empresas: { PA: par(15, 'Par A'), PB: par(20, 'Par B'), PC: par(25, 'Par C') } } } });
    await elegir(page, 'ACME');
    for (const id of ['roic', 'rotacion_de_activos', 'cobertura_de_intereses', 'ciclo_de_conversion_de_caja']) await expect(kpi(page, 'ACME', id)).not.toContainText('sin datos todavía');
    await expect(kpi(page, 'ACME', 'wacc')).toContainText('7,3%');
    const wacc = await abrirFuente(page, 'ACME', 'wacc');
    await expect(wacc.locator('.rd-ln')).toContainText('6,4% – 8,3%'); await expect(wacc.locator('.rd-k-f')).toContainText('ValueInvesting.io');
    await expect(kpi(page, 'ACME', 'roic_vs_wacc')).toContainText('crea valor');
    await expect(kpi(page, 'ACME', 'peg')).toContainText('0,90x');
    const pares = await abrirFuente(page, 'ACME', 'valuacion_vs_pares');
    await expect(pares.locator('.rd-k-v')).toHaveText('-10,0% vs mediana de pares');
    await expect(pares.locator('.rd-ln')).toContainText('Mediana de 3 pares'); await expect(pares.locator('.rd-ln')).toContainText('PB · Par B');
    const media = await abrirFuente(page, 'ACME', 'p_e_forward_vs_media_5_10_15_anos');
    await expect(media.locator('.rd-ln').first()).toContainText('Media 5a / mediana 5a');
    sinErrores(consoleErrors);
  });

  test('P/E fwd vs media de 5 años: con pe-forward-sa.json compara Stock Analysis contra Stock Analysis y rotula la semana', async ({ cmPage: page, consoleErrors }) => {
    const man = { v: 1, empresas: { ACME: { pe_forward_media: { '5y': 20, '10y': null, '15y': null, mediana: 16, desde: 'dic-21', fuente: 'Fuente inventada', fecha_dato: '2026-11-06' } } } };
    const sa = { v: 1, fuente: 'Stock Analysis (Forward PE trimestral)', empresas: { ACME: { actual: 28, actual_fecha: '2026-11-09', serie: [], media_5a: 20, mediana_5a: 16, desde: 'dic-21', trimestres: 20, url: 'https://example.test/sa', actualizado: '2026-11-09' } } };
    const ctl = await abrir(page, { archivos: { 'radar-manual.json': man, 'pe-forward-sa.json': sa } });
    await elegir(page, 'ACME');
    const media = await abrirFuente(page, 'ACME', 'p_e_forward_vs_media_5_10_15_anos');
    await expect(media.locator('.rd-k-v')).toHaveText('+40,0% vs media 5 años');            // 28 / 20 − 1; con el NTM de Yahoo (18x) daría -10%
    await expect(media).toContainText('Stock Analysis, semana del 09/11');
    await expect(media.locator('.rd-ln')).toContainText('P/E fwd de hoy');
    await expect(media.locator('.rd-k-f')).toContainText('Stock Analysis, semana del 09/11');
    expect(ctl.llamadas).toContain('GET pe-forward-sa.json');
    await expect(kpi(page, 'ACME', 'p_e_forward')).toContainText('18,0x');                 // el resto de la ficha sigue con el NTM de Yahoo
    sinErrores(consoleErrors);
  });

  test('P/E fwd vs media de 5 años: con el job bloqueado muestra los últimos valores con "datos del dd/mm"', async ({ cmPage: page, consoleErrors }) => {
    const sa = { v: 1, empresas: { ACME: { actual: 28, media_5a: 20, mediana_5a: 16, desde: 'dic-21', trimestres: 20, url: 'https://example.test/sa', actualizado: '2026-11-09', stale_since: '2026-11-16', ultimo_error: 'HTTP 403' } } };
    await abrir(page, { archivos: { 'pe-forward-sa.json': sa } });
    await elegir(page, 'ACME');
    await expect(kpi(page, 'ACME', 'p_e_forward_vs_media_5_10_15_anos')).toContainText('Stock Analysis, datos del 09/11');
    await expect(kpi(page, 'ACME', 'p_e_forward_vs_media_5_10_15_anos').locator('.rd-k-v')).toHaveText('+40,0% vs media 5 años');
    sinErrores(consoleErrors);
  });

  test('cada estado se dice con su nombre y nunca con un cero: pendiente, no informado en Q3 2026, sin datos todavía, n/s y no aplica', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    await elegir(page, 'ACME');
    await expect(kpi(page, 'ACME', 'p_e_forward_vs_media_5_10_15_anos')).toContainText('pendiente');
    await expect(kpi(page, 'ACME', 'valuacion_vs_pares')).toContainText('pendiente');
    await expect(kpi(page, 'ACME', 'eps_ajustado')).toContainText('no informado en Q3 2026');
    await expect(kpi(page, 'ACME', 'mora_90_dias')).toContainText('no informado en Q3 2026');
    await expect(kpi(page, 'ACME', 'costo_por_envio')).toContainText('sin datos todavía');
    await expect(kpi(page, 'ACME', 'costo_por_envio').locator('.rd-rep')).toHaveCount(0);                // lo que no es un número no se reporta
    await elegir(page, 'ZETA');
    await expect(kpi(page, 'ZETA', 'p_e_ttm')).toContainText('n/s');
    await expect(kpi(page, 'ZETA', 'p_e_forward')).toContainText('n/s');
    await expect(kpi(page, 'ZETA', 'p_e_vs_media_5_10_15_anos')).toContainText('sin datos suficientes (datos desde dic-22)');
    await elegir(page, 'NUBO');
    await expect(kpi(page, 'NUBO', 'ev_ebitda')).toContainText('no aplica');
    await expect(kpi(page, 'NUBO', 'deuda_neta')).toContainText('no aplica');
    await expect(kpi(page, 'NUBO', 'margen_operativo')).toContainText('sin datos todavía');
    await expect(kpi(page, 'NUBO', 'rule_of_40')).toHaveCount(1);                             // aplica_a: ["NUBO"]
    await elegir(page, 'ACME');
    await expect(kpi(page, 'ACME', 'rule_of_40')).toHaveCount(0);
    sinErrores(consoleErrors);
  });

  test('la fuente de cada número se ve al tocarlo: comunicado con página y cita, Yahoo con fecha, SEC, cálculo', async ({ cmPage: page }) => {
    await abrir(page);
    await elegir(page, 'ACME');
    let k = await abrirFuente(page, 'ACME', 'crecimiento_de_ingresos_a_moneda_constante');
    await expect(k.locator('.rd-k-v')).toHaveAttribute('aria-expanded', 'true');
    await expect(k.locator('.rd-src')).toContainText('Comunicado de resultados');
    await expect(k.locator('.rd-src')).toContainText('p. 6, tabla de métricas clave');
    await expect(k.locator('.rd-src')).toContainText('«Constant currency revenue growth 12.3%»');
    const a = k.locator('.rd-src a');
    await expect(a).toHaveAttribute('href', D.URL_DOC); await expect(a).toHaveAttribute('target', '_blank'); await expect(a).toHaveAttribute('rel', /noopener/);
    k = await abrirFuente(page, 'ACME', 'distancia_al_ath');
    await expect(k.locator('.rd-src')).toContainText('Yahoo Finance'); await expect(k.locator('.rd-src')).toContainText('dato del 05/11/26');
    k = await abrirFuente(page, 'ACME', 'fcf');
    await expect(k.locator('.rd-src')).toContainText('SEC'); await expect(k.locator('.rd-src')).toContainText('presentado el');
    k = await abrirFuente(page, 'ACME', 'ingresos_totales_a_a');
    await expect(k.locator('.rd-src')).toContainText('Calculado:'); await expect(k.locator('.rd-src')).toContainText('ingresos del trimestre ÷ ingresos de hace un año − 1');
    await expect(k.locator('.rd-sv')).toContainText('Últimos 15 trimestres');          // tabla de la serie: la misma información que la sparkline
    await k.locator('.rd-k-v').click();
    await expect(k.locator('.rd-k-f')).toBeHidden();
    await expect(k.locator('.rd-k-v')).toHaveAttribute('aria-expanded', 'false');
  });

  test('variación t/t y a/a, sparkline con 12+ trimestres, y "datos desde" cuando el historial es corto; proxy, desglose y texto largo', async ({ cmPage: page }) => {
    await abrir(page);
    await elegir(page, 'ACME');
    const f = kpi(page, 'ACME', 'fcf');
    await expect(f.locator('.rd-k-d')).toContainText('t/t +5,0%'); await expect(f.locator('.rd-k-d')).toContainText('a/a +21,6%');
    await expect(f.locator('.rd-sp')).toHaveCount(1);
    expect(await f.locator('.rd-sp polyline').getAttribute('points').then((p) => p.trim().split(/\s+/).length)).toBeGreaterThanOrEqual(12);
    const v = kpi(page, 'ACME', 'volumen_de_pagos');
    await expect(v.locator('.rd-k-v')).toContainText('US$ 1.250 mil M');
    await expect(v.locator('.rd-k-d')).toContainText('t/t +5,9%');
    await expect(v.locator('.rd-sp')).toHaveCount(1);
    expect(await v.locator('.rd-sp polyline').getAttribute('points').then((p) => p.trim().split(/\s+/).length)).toBe(2);   // 2 trimestres cargados: se dibujan 2, no se inventa el resto
    await expect(v.locator('.rd-k-desde')).toHaveText('datos desde jun-26');
    await expect(kpi(page, 'ACME', 'tarjetas_emitidas').locator('.rd-sp')).toHaveCount(0);       // 1 solo trimestre: sin gráfico, con la fecha de inicio
    await expect(kpi(page, 'ACME', 'tarjetas_emitidas').locator('.rd-k-desde')).toHaveText('datos desde sep-26');
    await v.locator('.rd-k-v').click();
    await expect(v.locator('.rd-ln')).toContainText('Crédito'); await expect(v.locator('.rd-ln')).toContainText('US$ 700 mil M');
    await expect(kpi(page, 'ACME', 'tarjetas_emitidas').locator('.rd-tag')).toHaveText('proxy');
    const largo = await abrirFuente(page, 'ACME', 'riesgo_regulatorio');
    await expect(largo.locator('.rd-largo')).toContainText('Se discute un tope a las comisiones');
  });

  test('reportar un número: formulario chico a la derecha, POST /radar/reportar y queda "en revisión"', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page);
    await elegir(page, 'ACME');
    const k = kpi(page, 'ACME', 'sbc_ingresos');
    const rep = k.locator('.rd-rep');
    const [bk, br] = [await k.locator('.rd-k-n').boundingBox(), await rep.boundingBox()];
    expect(br.x).toBeGreaterThan(bk.x);                                           // a la derecha del nombre
    expect(br.width).toBeLessThan(110);                                           // chico
    await rep.click();
    await k.locator('.rd-repf-t').fill('El comunicado dice otro número');
    await k.locator('.rd-repf button[type="submit"]').click();
    await expect(k.locator('.rd-k-row .rd-badge')).toHaveText('en revisión');
    await expect(k.locator('.rd-ok')).toContainText('Reporte enviado');
    expect(ctl.posts).toEqual([{ ticker: 'ACME', kpi_id: 'sbc_ingresos', trimestre: '2026-09-30', valor_mostrado: '3,0%', comentario: 'El comunicado dice otro número' }]);
    await expect(k.locator('.rd-repf')).toHaveCount(0);
    // Sin comentario también vale (es opcional).
    const k2 = kpi(page, 'ACME', 'capex_ingresos');
    await k2.locator('.rd-rep').click(); await k2.locator('.rd-repf button[type="submit"]').click();
    await expect(k2.locator('.rd-k-row .rd-badge')).toHaveText('en revisión');
    expect(ctl.posts[1]).toEqual({ ticker: 'ACME', kpi_id: 'capex_ingresos', trimestre: '2026-09-30', valor_mostrado: '4,0%' });
    // Un número de mercado se reporta con la fecha del dato como período; el id largo se manda entero (el Worker acepta hasta 64 caracteres).
    const k3 = kpi(page, 'ACME', 'crecimiento_de_ingresos_a_moneda_constante');
    await k3.locator('.rd-rep').click(); await k3.locator('.rd-repf button[type="submit"]').click();
    await expect(k3.locator('.rd-k-row .rd-badge')).toHaveText('en revisión');
    expect(ctl.posts[2].kpi_id).toBe('crecimiento_de_ingresos_a_moneda_constante');
    // Escape cancela el formulario.
    const k4 = kpi(page, 'ACME', 'capex');
    await k4.locator('.rd-rep').click(); await expect(k4.locator('.rd-repf')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(k4.locator('.rd-repf')).toHaveCount(0);
    expect(ctl.posts).toHaveLength(3);
    sinErrores(consoleErrors);
  });

  test('reportar: si ya estaba reportado lo dice; límite diario y falta de permiso de GitHub dan un mensaje claro y dejan reintentar', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page, { reportar: 'dup' });
    await elegir(page, 'ACME');
    const k = kpi(page, 'ACME', 'sbc_ingresos');
    await k.locator('.rd-rep').click(); await k.locator('.rd-repf button[type="submit"]').click();
    await expect(k.locator('.rd-ok')).toContainText('ya estaba reportado');
    await expect(k.locator('.rd-k-row .rd-badge')).toHaveText('en revisión');
    const k2 = kpi(page, 'ACME', 'capex');
    ctl.reportar = 'limite';
    await k2.locator('.rd-rep').click(); await k2.locator('.rd-repf button[type="submit"]').click();
    await expect(k2.locator('.rd-repf-msg')).toContainText('límite de 20 reportes por día');
    await expect(k2.locator('.rd-repf button[type="submit"]')).toBeEnabled();
    ctl.reportar = 'permiso';
    await k2.locator('.rd-repf button[type="submit"]').click();
    await expect(k2.locator('.rd-repf-msg')).toContainText('no tiene permiso para guardar el reporte en GitHub');
    await expect(k2.locator('.rd-k-row .rd-badge')).toHaveCount(0);                              // nada quedó "en revisión"
    ctl.reportar = 'ok';
    await k2.locator('.rd-repf button[type="submit"]').click();
    await expect(k2.locator('.rd-k-row .rd-badge')).toHaveText('en revisión');
    sinErrores(consoleErrors);
  });

  test('los reportes ya resueltos de reportes.json se ven: "corregido de X a Y" y "confirmado", con su motivo o cita', async ({ cmPage: page }) => {
    await abrir(page);
    await elegir(page, 'ACME');
    const c = kpi(page, 'ACME', 'margen_neto');
    await expect(c.locator('.rd-k-row .rd-badge')).toContainText('corregido de 15,0% a 14,2%');
    await c.locator('.rd-k-v').click();
    await expect(c.locator('.rd-reps')).toContainText('el comunicado restó una partida');
    const f = kpi(page, 'ACME', 'margen_operativo');
    await expect(f.locator('.rd-k-row .rd-badge')).toHaveText('confirmado');
    await f.locator('.rd-k-v').click();
    await expect(f.locator('.rd-reps')).toContainText('Operating margin 20.0%');
    await expect(kpi(page, 'ACME', 'margen_bruto').locator('.rd-k-row .rd-badge')).toHaveCount(0);
  });

  test('gráfico Crecimiento vs Valuación: cuadrantes con cortes en 15x y 10%, ejes rotulados, puntos de las empresas con dato, advertencias y nota de los puntos distorsionados', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    await esperarGrafico(page);
    const g = await page.evaluate(() => {
      const ch = Chart.getChart(document.getElementById('rd-cv'));
      return { n: ch.data.datasets[0].data.length, pts: ch.data.datasets[0].data.map((p) => [p.t, p.x, Math.round(p.y * 1000) / 1000]), xt: ch.options.scales.x.title.text, yt: [].concat(ch.options.scales.y.title.text).join(' '), ancho: ch.width, xmin: ch.scales.x.min, xmax: ch.scales.x.max, ymin: ch.scales.y.min, ymax: ch.scales.y.max, plugin: ch.config.plugins.map((p) => p.id) };
    });
    expect(g.n).toBe(7);                                                     // ACME, NUBO, E05–E09; ZETA (EPS negativo), QUIM y E10–E12 (sin datos) no
    expect(g.xt).toBe('P/E fwd (12 meses)'); expect(g.yt).toBe(g.ancho < 520 ? 'Crec. EPS esperado (2 años)' : 'Crecimiento EPS esperado (2 años)');   // en el celular el título del eje es corto: no se corta
    const ley = pane(page).locator('.rd-leyenda');
    if (g.ancho < 520) { await expect(ley).toBeVisible(); await expect(ley.locator('li').first()).toContainText('Mayor crecimiento / Menor valuación'); }   // rótulos de cuadrante fuera del gráfico
    else await expect(ley).toBeHidden();
    expect(g.plugin).toContain('rdCuadrantes');
    expect(g.xmin).toBeLessThan(15); expect(g.xmax).toBeGreaterThan(30); expect(g.ymin).toBeLessThanOrEqual(0);
    const pt = Object.fromEntries(g.pts.map((p) => [p[0], p]));
    expect(pt.ACME.slice(1)).toEqual([18, 0.2]);
    expect(pt.E08[2]).toBeCloseTo(0.4, 2);                                   // base inflada → crecimiento del año siguiente vs el actual
    expect(pt.E09[2]).toBeLessThan(g.ymax);                                  // 90%: se dibuja dentro del borde (fuera de escala) y se avisa
    // Tabla con los números (misma información que el gráfico, accesible) y el cuadrante de cada empresa.
    await pane(page).locator('.rd-tabla-det summary').click();
    const fila = (t) => pane(page).locator('.rd-tabla tbody tr', { has: page.locator(`.rd-tk:text-is("${t}")`) });
    await expect(fila('ACME')).toContainText('18,0x'); await expect(fila('ACME')).toContainText('20,0%'); await expect(fila('ACME')).toContainText('Mayor crecimiento / Mayor valuación');
    await expect(fila('NUBO')).toContainText('Mayor crecimiento / Menor valuación');
    await expect(fila('E05')).toContainText('Menor crecimiento / Menor valuación');
    await expect(fila('E06')).toContainText('Menor crecimiento / Mayor valuación');
    await expect(fila('ZETA')).toContainText('sin dato: P/E forward no significativo');
    await expect(fila('QUIM')).toContainText('sin dato: sin datos de mercado todavía');
    // Advertencias.
    const aviso = pane(page).locator('.rd-aviso', { hasText: 'márgenes en expansión: el crecimiento del EPS puede exagerar el del negocio' });
    await expect(aviso).toContainText('NUBO'); await expect(aviso).toContainText('QUIM');
    await expect(pane(page).locator('.rd-aviso', { hasText: 'E07*' })).toContainText('extraordinarios');
    await expect(pane(page).locator('.rd-aviso', { hasText: 'E08*' })).toContainText('distorsionado');
    await expect(pane(page).locator('.rd-aviso', { hasText: 'E09 ▲' })).toContainText('fuera de escala');
    await expect(pane(page).locator('.rd-graf')).toContainText('Sin dato para el gráfico: ZETA');
    await pane(page).locator('.rd-tabla-det summary').click();
    await pane(page).locator('.rd-graf').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await foto(page, 'grafico');
    // Tocar un punto abre la ficha de esa empresa.
    const xy = await page.evaluate(() => { const ch = Chart.getChart(document.getElementById('rd-cv')), m = ch.getDatasetMeta(0).data[0], r = ch.canvas.getBoundingClientRect(); return { x: r.left + m.x, y: r.top + m.y, t: ch.data.datasets[0].data[0].t }; });
    await pane(page).locator('#rd-cv').scrollIntoViewIfNeeded();
    const xy2 = await page.evaluate(() => { const ch = Chart.getChart(document.getElementById('rd-cv')), m = ch.getDatasetMeta(0).data[0], r = ch.canvas.getBoundingClientRect(); return { x: r.left + m.x, y: r.top + m.y }; });
    await page.mouse.click(xy2.x, xy2.y);
    await expect(pane(page).locator('.rd-fn')).toContainText(xy.t);
    sinErrores(consoleErrors);
  });

  test('gráfico con puntos amontonados: las etiquetas no se pisan entre sí ni con los puntos, y en el celular los cuadrantes van en una leyenda debajo (captura en RADAR_SHOTS)', async ({ cmPage: page, consoleErrors }) => {
    const apretados = {};
    for (const [t, pf, cagr] of [['E10', 17, 0.19], ['E11', 19, 0.21], ['E12', 18.5, 0.2]]) apretados['mercado-' + t + '.json'] = D.mercado({ ticker: t, pf, act: 5, sig: 6, base: 4.2, cagr });
    await abrir(page, { archivos: apretados });
    await esperarGrafico(page);
    const g = await page.evaluate(() => {
      const ch = Chart.getChart(document.getElementById('rd-cv')), pts = ch.getDatasetMeta(0).data.map((d) => [d.x, d.y]);
      return { ancho: ch.width, alto: ch.height, n: pts.length, pts, et: ch.rdEtiquetas };
    });
    expect(g.n).toBe(10);
    expect(g.et).toHaveLength(10);
    const choca = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    for (let i = 0; i < g.et.length; i++) {
      const r = g.et[i].r;
      expect(r[0]).toBeGreaterThanOrEqual(0); expect(r[2]).toBeLessThanOrEqual(g.ancho);          // dentro del lienzo
      for (let j = i + 1; j < g.et.length; j++) expect([g.et[i].t, g.et[j].t, choca(r, g.et[j].r)]).toEqual([g.et[i].t, g.et[j].t, false]);
      for (const [x, y] of g.pts) expect([g.et[i].t, choca(r, [x - 5, y - 5, x + 5, y + 5])]).toEqual([g.et[i].t, false]);
    }
    if (g.ancho < 520) expect(g.et.every((e) => e.t.length <= 4)).toBe(true);                     // en el celular, solo el ticker: los valores salen al tocar o en la tabla
    await pane(page).locator('.rd-graf').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await fotoEl(pane(page).locator('.rd-graf'), 'r5-graf-' + (g.ancho < 520 ? '390' : 'escritorio'));
    expect((await desborde(page)).doc).toBeLessThanOrEqual(0);
    sinErrores(consoleErrors);
  });

  test('ficha: sorpresa vs consenso "no comparable" cuando el real es GAAP y el consenso ajustado, FCF del trimestre y de 12 meses con P/FCF sobre el mismo FCF, y media de P/E sin paréntesis vacíos', async ({ cmPage: page, consoleErrors }) => {
    const sinMedias = { '5y': { valor: null, desde: null, hasta: null, trimestres: 0, completo: false }, '10y': { valor: null, desde: null, hasta: null, trimestres: 0, completo: false }, '15y': { valor: null, desde: null, hasta: null, trimestres: 0, completo: false } };
    await abrir(page, { archivos: {
      'mercado-ACME.json': D.mercado({ ticker: 'ACME', pf: 18, act: 5.5, sig: 6.6, base: 4.6, cagr: 0.2, pfs: 15, sorp: { trimestre: '2026-09-30', eps_real: 0.84, eps_estimado: 1.5, diferencia: -0.66, sorpresa_pct: -0.44, ingresos: null } }),
      'historia-ACME.json': D.historia({ ticker: 'ACME', medias: sinMedias, pe: false }),
    } });
    await elegir(page, 'ACME');
    const sorp = await abrirFuente(page, 'ACME', 'sorpresa_vs_consenso_eps');
    await expect(sorp.locator('.rd-k-v')).toHaveText('no comparable (GAAP vs ajustado)');
    await expect(sorp.locator('.rd-ln')).toContainText('EPS real (contable, GAAP)'); await expect(sorp.locator('.rd-k-v')).not.toContainText('%');
    await expect(sorp.locator('.rd-rep')).toHaveCount(0);                                          // sin número no hay qué reportar
    await expect(kpi(page, 'ACME', 'fcf').locator('.rd-k-n')).toContainText('FCF del trimestre');
    await expect(kpi(page, 'ACME', 'fcf_12m').locator('.rd-k-n')).toContainText('FCF 12 meses');
    const pf = await abrirFuente(page, 'ACME', 'p_fcf');
    await expect(pf.locator('.rd-ln')).toContainText('FCF 12 meses'); await expect(pf.locator('.rd-ln')).toContainText('Valor de mercado');
    await expect(pf.locator('.rd-src')).toContainText('valor de mercado ÷ FCF de los últimos 12 meses');
    const med = await abrirFuente(page, 'ACME', 'p_e_vs_media_5_10_15_anos');
    await expect(med.locator('.rd-k-v')).toHaveText('sin datos suficientes');
    await expect(med.locator('.rd-src')).not.toContainText('hasta )'); await expect(med.locator('.rd-src')).not.toContainText('()');
    for (const l of await med.locator('.rd-ln dd').allTextContents()) expect(l).toBe('sin datos suficientes');
    sinErrores(consoleErrors);
  });

  test('datos de mercado viejos (stale_since): se muestran los últimos buenos con su fecha y un aviso, sin errores de consola', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page, { archivos: { 'mercado-ACME.json': D.mercado({ ticker: 'ACME', stale: '2026-11-04', generado: '2026-11-03', pf: 18, act: 5.5, sig: 6.6, base: 4.6, cagr: 0.2 }) } });
    await elegir(page, 'ACME');
    await expect(pane(page).locator('.rd-estado')).toContainText('Datos de mercado del 03/11');
    await expect(pane(page).locator('.rd-estado .rd-warn')).toContainText('No se pudieron actualizar desde el 04/11');
    await expect(pane(page).locator('.rd-estado .rd-warn')).toContainText('Yahoo no respondió');
    await expect(pane(page).locator('.rd-fpx')).toContainText('US$ 100,00');
    await expect(kpi(page, 'ACME', 'p_e_forward')).toContainText('18,0x');
    sinErrores(consoleErrors);
  });

  test('si un archivo falla (500) los demás se muestran igual; una empresa sin archivos dice "Sin datos todavía"', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page, { falla: ['mercado-ACME.json'] });
    await elegir(page, 'ACME');
    await expect(pane(page).locator('.rd-estado')).toContainText('Sin datos de mercado todavía');
    await expect(kpi(page, 'ACME', 'ingresos_totales_t_t')).toContainText('5,0%');       // de la SEC (historia)
    await expect(kpi(page, 'ACME', 'p_e_forward')).toContainText('sin datos todavía');
    await expect(kpi(page, 'ACME', 'crecimiento_de_ingresos_a_moneda_constante')).toContainText('12,3%');
    await elegir(page, 'QUIM');
    await expect(pane(page).locator('.rd-vacio')).toContainText('Sin datos todavía');
    await expect(pane(page).locator('.rd-sec')).toHaveCount(0);
    sinErrores(consoleErrors);
  });

  test('si radar-config.json no se puede leer: mensaje claro y Reintentar que carga la franja', async ({ cmPage: page, consoleErrors }) => {
    const ctl = await abrir(page, { falla: ['radar-config.json'] });
    await expect(pane(page).locator('.rd-strip-row .rd-err')).toContainText('No se pudieron leer los datos');
    await expect(pane(page).locator('.rd-emp')).toHaveCount(0);
    ctl.falla.clear();
    await pane(page).locator('[data-act="reintentar-cfg"]').click();
    await expect(pane(page).locator('.rd-emp')).toHaveCount(12);
    sinErrores(consoleErrors);
  });

  test('sin scroll horizontal de la página con una ficha completa y todas las fuentes abiertas (en 390 px y en escritorio); la franja se desliza por dentro', async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    await elegir(page, 'ACME');
    await esperarGrafico(page);
    for (const b of await pane(page).locator('.rd-k-v[data-act="fuente"]').all()) await b.click();
    await pane(page).locator('.rd-tabla-det summary').click();
    await kpi(page, 'ACME', 'sbc_ingresos').locator('.rd-rep').click();
    const d = await desborde(page);
    expect(d.doc).toBeLessThanOrEqual(0); expect(d.cuerpo).toBeLessThanOrEqual(0); expect(d.fuera).toEqual([]);
    await kpi(page, 'ACME', 'sbc_ingresos').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await foto(page, 'ficha-abierta');
    sinErrores(consoleErrors);
  });
});
