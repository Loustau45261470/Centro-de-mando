// Radar v2 — descarga de comunicados (tools/radar-job/comunicados-descarga.js). Todo con empresas y documentos INVENTADOS y una SEC falsa
// (sin red). Cubre: HTML → texto conservando las tablas, índice de un 8-K, trimestre siguiente, selección de pares pendientes
// (nuevos / KPI nuevo / cola), que lo ya descargado no se vuelve a bajar y que un par que falla no rompe al resto.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('./support/fixtures');
const D = require(path.join(__dirname, '..', 'tools', 'radar-job', 'comunicados-descarga.js'));
const Vista = require(path.join(__dirname, '..', 'radar-vista.js'));

test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'job con IO falsa: una sola vez'); });

// ── HTML → texto ────────────────────────────────────────────────────────────
test.describe('htmlATexto', () => {
  test('cada fila de tabla es una línea, con las celdas separadas por " | "', () => {
    const t = D.htmlATexto('<p>Resultados</p><table><tr><td>Ingresos</td><td>$</td><td>1,200</td><td>$</td><td>1,000</td><td>20</td><td>%</td></tr>' +
      '<tr><th>Concepto</th><th>Q3 2026</th><th>Q3 2025</th></tr><tr><td></td><td>Margen</td><td>(3.1</td><td>)</td></tr></table>');
    const lineas = t.split('\n');
    expect(lineas).toContain('Ingresos | $1,200 | $1,000 | 20%');
    expect(lineas).toContain('Concepto | Q3 2026 | Q3 2025');
    expect(lineas).toContain('Margen | (3.1)');
  });
  test('los saltos de línea del código fuente no parten el texto; sí lo hacen los párrafos y <br>', () => {
    const t = D.htmlATexto('<p>Acme Corp.\n   reporta   resultados\ndel trimestre</p>\n<p>Segundo<br>párrafo</p>');
    expect(t.split('\n').filter(Boolean)).toEqual(['Acme Corp. reporta resultados del trimestre', 'Segundo', 'párrafo']);
  });
  test('entidades (con tilde incluida), scripts, comentarios y el encabezado oculto de iXBRL fuera', () => {
    const t = D.htmlATexto('<html><head><title>X</title><style>p{}</style></head><body><!-- nota --><script>var a=1</script><ix:header>OCULTO 12345</ix:header>' +
      '<p>S&atilde;o Paulo &amp; Cr&eacute;dito&nbsp;&#8217;26 &#x2014; &quot;ok&quot;</p></body></html>');
    expect(t).toContain('São Paulo & Crédito ’26 — "ok"');
    expect(t).not.toMatch(/OCULTO|var a|nota|p\{\}/);
  });
  test('las páginas-imagen de una carta dejan su número de slide', () => {
    const t = D.htmlATexto('<div><img src="x.jpg" title="slide6"><div><font>Unique active buyers 128 107</font></div></div>');
    expect(t.trim().split('\n')).toEqual(['[slide 6]', 'Unique active buyers 128 107']);
  });
});

test('parsearIndice: tipo, nombre y URL de cada documento (también los links con /ix?doc=)', () => {
  const fila = (n, tipo, href, nombre, size) => `<tr><td scope="row">${n}</td><td scope="row">${tipo}</td><td scope="row"><a href="${href}">${nombre}</a></td><td scope="row">${tipo}</td><td scope="row">${size}</td></tr>`;
  const html = '<table summary="Document Format Files"><tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>' +
    fila(1, '8-K', '/ix?doc=/Archives/edgar/data/123/000012326000001/acme-8k.htm', 'acme-8k.htm', 3500) +
    fila(2, 'EX-99.1', '/Archives/edgar/data/123/000012326000001/acme-ex991.htm', 'acme-ex991.htm', 90000) +
    fila(3, 'GRAPHIC', '/Archives/edgar/data/123/000012326000001/logo.jpg', 'logo.jpg', 900) + '</table>';
  const docs = D.parsearIndice(html, 'https://sec.test');
  expect(docs.map(d => d.tipo)).toEqual(['8-K', 'EX-99.1', 'GRAPHIC']);
  expect(docs[0].url).toBe('https://sec.test/Archives/edgar/data/123/000012326000001/acme-8k.htm');
  expect(docs[1]).toMatchObject({ nombre: 'acme-ex991.htm', size: 90000 });
});

test('siguienteTrimestre: Q4 salta al Q1 del año siguiente; fin de mes sigue en fin de mes; si no, mismo día', () => {
  expect(D.siguienteTrimestre({ trimestre: '2026-Q3', fecha_fin: '2026-09-30' })).toEqual({ trimestre: '2026-Q4', fecha_fin: '2026-12-31' });
  expect(D.siguienteTrimestre({ trimestre: '2026-Q4', fecha_fin: '2026-12-31' })).toEqual({ trimestre: '2027-Q1', fecha_fin: '2027-03-31' });
  expect(D.siguienteTrimestre({ trimestre: '2026-Q1', fecha_fin: '2025-12-31' })).toEqual({ trimestre: '2026-Q2', fecha_fin: '2026-03-31' });
  expect(D.siguienteTrimestre({ trimestre: '2027-Q2', fecha_fin: '2026-07-26' })).toEqual({ trimestre: '2027-Q3', fecha_fin: '2026-10-26' });
  expect(D.siguienteTrimestre({ trimestre: 'x', fecha_fin: '2026-07-26' })).toBeNull();
});

// ── Selección de pares ──────────────────────────────────────────────────────
test.describe('seleccionarPares', () => {
  const sinMeta = () => null;
  const cola = [
    { ticker: 'ACME', trimestre: '2026-Q3', fecha_fin: '2026-09-30' }, { ticker: 'BETA', trimestre: '2026-Q3', fecha_fin: '2026-09-30' },
    { ticker: 'ACME', trimestre: '2026-Q2', fecha_fin: '2026-06-30' }, { ticker: 'BETA', trimestre: '2026-Q2', fecha_fin: '2026-06-30' },
    { ticker: 'ACME', trimestre: '2026-Q1', fecha_fin: '2026-03-31' },
  ];
  const base = { tickers: ['ACME', 'BETA'], estado: { procesados: {}, cola_backfill: cola }, kpis: {}, esperados: {}, mercadoFecha: {}, meta: sinMeta, hoy: '2026-11-12', maxBackfill: 12 };
  const claves = r => r.map(p => `${p.origen}:${p.ticker}:${p.trimestre}`);

  test('la cola sale en orden y respeta el máximo', () => {
    expect(claves(D.seleccionarPares({ ...base, maxBackfill: 3 }))).toEqual(['backfill:ACME:2026-Q3', 'backfill:BETA:2026-Q3', 'backfill:ACME:2026-Q2']);
  });
  test('se saltea lo ya descargado y lo que falló 3 veces hace poco; vuelve a probar pasada la espera', () => {
    const metas = { 'ACME:2026-Q3': { estado: 'ok' }, 'BETA:2026-Q3': { estado: 'error', intentos: 3, ultimo_intento: '2026-11-10' }, 'ACME:2026-Q2': { estado: 'error', intentos: 2, ultimo_intento: '2026-11-11' } };
    const meta = (t, q) => metas[t + ':' + q] || null;
    expect(claves(D.seleccionarPares({ ...base, meta, maxBackfill: 3 }))).toEqual(['backfill:ACME:2026-Q2', 'backfill:BETA:2026-Q2', 'backfill:ACME:2026-Q1']);
    expect(claves(D.seleccionarPares({ ...base, meta, hoy: '2026-11-20', maxBackfill: 2 }))).toEqual(['backfill:BETA:2026-Q3', 'backfill:ACME:2026-Q2']);
  });
  test('un trimestre ya procesado no se baja', () => {
    const estado = { procesados: { ACME: ['2026-Q3'] }, cola_backfill: cola.slice(1) };
    expect(claves(D.seleccionarPares({ ...base, estado, maxBackfill: 1 }))).toEqual(['backfill:BETA:2026-Q3']);
  });
  test('trimestre NUEVO: el siguiente al más reciente conocido, solo si ya pasó el cierre + 14 días y su fecha de resultados no es futura', () => {
    const kpis = { ACME: { trimestres: { '2026-Q3': { fecha_fin: '2026-09-30', kpis: {} } } } };
    const estado = { procesados: { ACME: ['2026-Q3'] }, cola_backfill: [] };
    // al 12/11 el Q4 (cierra 31/12) todavía no pudo presentar
    expect(D.seleccionarPares({ ...base, tickers: ['ACME'], estado, kpis, hoy: '2026-11-12' })).toEqual([]);
    // al 20/01 sí: se prueba
    expect(D.seleccionarPares({ ...base, tickers: ['ACME'], estado, kpis, hoy: '2027-01-20' })).toEqual([{ ticker: 'ACME', trimestre: '2026-Q4', fecha_fin: '2026-12-31', origen: 'nuevo' }]);
    // …salvo que el mercado diga que sus resultados son futuros
    expect(D.seleccionarPares({ ...base, tickers: ['ACME'], estado, kpis, hoy: '2027-01-20', mercadoFecha: { ACME: '2027-02-10' } })).toEqual([]);
    // y si la fecha ya pasó (o el mercado ya la movió al trimestre siguiente), se prueba igual
    expect(D.seleccionarPares({ ...base, tickers: ['ACME'], estado, kpis, hoy: '2027-02-12', mercadoFecha: { ACME: '2027-02-10' } })).toHaveLength(1);
    expect(D.seleccionarPares({ ...base, tickers: ['ACME'], estado, kpis, hoy: '2027-02-12', mercadoFecha: { ACME: '2027-05-05' } })).toHaveLength(1);
    // ya procesado o ya descargado: no se repite
    const procesado = { procesados: { ACME: ['2026-Q3', '2026-Q4'] }, cola_backfill: [] };
    expect(D.seleccionarPares({ ...base, tickers: ['ACME'], estado: procesado, kpis, hoy: '2027-02-12' })).toEqual([]);
    expect(D.seleccionarPares({ ...base, tickers: ['ACME'], estado, kpis, hoy: '2027-02-12', meta: (t, q) => (q === '2026-Q4' ? { estado: 'ok' } : null) })).toEqual([]);
  });
  test('KPI nuevo en la config: los 4 trimestres más recientes ya procesados que no lo tienen se vuelven a bajar', () => {
    const tri = {};
    ['2026-Q3|2026-09-30', '2026-Q2|2026-06-30', '2026-Q1|2026-03-31', '2025-Q4|2025-12-31', '2025-Q3|2025-09-30'].forEach(s => { const [q, f] = s.split('|'); tri[q] = { fecha_fin: f, kpis: { ventas: {}, clientes: {} } }; });
    const kpis = { ACME: { trimestres: tri } };
    const r = D.seleccionarPares({ ...base, tickers: ['ACME'], estado: { procesados: {}, cola_backfill: [] }, kpis, esperados: { ACME: ['ventas', 'clientes', 'articulos_por_cliente'] }, hoy: '2026-11-12' });
    expect(claves(r)).toEqual(['kpi_nuevo:ACME:2026-Q3', 'kpi_nuevo:ACME:2026-Q2', 'kpi_nuevo:ACME:2026-Q1', 'kpi_nuevo:ACME:2025-Q4']);
    // con todos los KPIs presentes no hay nada que bajar
    expect(D.seleccionarPares({ ...base, tickers: ['ACME'], estado: { procesados: {}, cola_backfill: [] }, kpis, esperados: { ACME: ['ventas', 'clientes'] } })).toEqual([]);
  });
});

// ── Flujo completo con una SEC falsa ────────────────────────────────────────
const relleno = 'The company continued to execute across all segments and markets during the period. '.repeat(40);
const comunicado = (extra = '') => `<html><body><p>Acme Corp. Reports Third Quarter 2026 Results</p><p>Results for the quarter ended September 30, 2026. ${relleno}</p>` +
  `<table><tr><td>Revenue</td><td>$</td><td>1,200</td><td>$</td><td>1,000</td><td>20</td><td>%</td></tr><tr><td>Active clients (millions)</td><td>93</td><td>72</td></tr></table>${extra}</body></html>`;
const indice = filas => '<html><table summary="Document Format Files"><tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>' +
  filas.map(([tipo, nombre, size], i) => `<tr><td>${i + 1}</td><td>${tipo}</td><td><a href="/Archives/edgar/data/${filas.cik}/${filas.acc}/${nombre}">${nombre}</a></td><td>${tipo}</td><td>${size}</td></tr>`).join('') + '</table></html>';

function crearSecFalsa() {
  const paginas = {}, llamadas = [];
  const json = o => ({ ok: true, status: 200, json: async () => o });
  const html = s => ({ ok: true, status: 200, text: async () => s, arrayBuffer: async () => Buffer.from(s) });
  const base = 'https://www.sec.gov/Archives/edgar/data/';
  const filing = (cik, acc, filas, docs) => {
    const sin = acc.replace(/-/g, ''); filas.cik = Number(cik); filas.acc = sin;
    paginas[`${base}${Number(cik)}/${sin}/${acc}-index.htm`] = html(indice(filas));
    for (const [nombre, contenido] of Object.entries(docs)) paginas[`${base}${Number(cik)}/${sin}/${nombre}`] = html(contenido);
  };
  paginas['https://www.sec.gov/files/company_tickers.json'] = json({ 0: { cik_str: 123, ticker: 'ACME' }, 1: { cik_str: 456, ticker: 'BETA' } });
  // ACME: 8-K. Un 2.02 viejo que no es el comunicado del trimestre, uno 7.01 que no cuenta y el bueno con presentación (EX-99.2)
  paginas['https://data.sec.gov/submissions/CIK0000000123.json'] = json({ filings: { recent: {
    form: ['8-K', '8-K', '8-K'], items: ['2.02,9.01', '7.01', '2.02,9.01'], filingDate: ['2026-10-10', '2026-10-15', '2026-10-28'],
    accessionNumber: ['0000000123-26-000001', '0000000123-26-000002', '0000000123-26-000003'], primaryDocument: ['a.htm', 'b.htm', 'c.htm'] } } });
  filing('123', '0000000123-26-000001', [['8-K', 'acme-8k.htm', 3000], ['EX-99.1', 'acme-ex991.htm', 400]], { 'acme-ex991.htm': '<p>Acme announces a webcast date.</p>' });
  filing('123', '0000000123-26-000003', [['8-K', 'acme-8k.htm', 3000], ['EX-99.1', 'acme-ex991.htm', 9000], ['EX-99.2', 'acme-ex992.htm', 5000], ['GRAPHIC', 'logo.jpg', 100]],
    { 'acme-ex991.htm': comunicado(), 'acme-ex992.htm': '<p>Acme Q3 2026 earnings presentation</p><p>Slide 3: active clients 93 million</p>'.repeat(10) });
  // BETA: emisor extranjero, 6-K sin anexos: el documento principal es el comunicado; otro 6-K del mismo día es el balance (no sirve)
  paginas['https://data.sec.gov/submissions/CIK0000000456.json'] = json({ filings: { recent: {
    form: ['6-K', '6-K'], items: ['', ''], filingDate: ['2026-10-29', '2026-10-29'],
    accessionNumber: ['0000000456-26-000010', '0000000456-26-000011'], primaryDocument: ['fs.htm', 'pr.htm'] } } });
  filing('456', '0000000456-26-000011', [['6-K', 'beta-pr.htm', 40000]], { 'beta-pr.htm': comunicado().replace('Acme Corp.', 'Beta Holdings Ltd.') });
  filing('456', '0000000456-26-000010', [['6-K', 'beta-fs.htm', 40000]], { 'beta-fs.htm': '<p>Unaudited interim condensed consolidated financial statements</p>' + `<p>${relleno} September 30, 2026 three months quarter</p>` });
  const fetchFn = async url => { llamadas.push(url); if (!(url in paginas)) return { ok: false, status: 404 }; return paginas[url]; };
  return { fetchFn, llamadas, paginas };
}

function carpetaDatos({ cola, extra = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comunicados-'));
  const w = (n, o) => { fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true }); fs.writeFileSync(path.join(dir, n), JSON.stringify(o)); };
  w('radar-config.json', { v: 1, empresas: [{ ticker: 'ACME', kpis_especificos: [] }, { ticker: 'BETA', kpis_especificos: [] }, { ticker: 'GAMA', kpis_especificos: [] }], kpis_generales: [] });
  w('comunicados/estado.json', { v: 1, ultima_corrida: null, procesados: {}, cola_backfill: cola, errores: [] });
  for (const [n, o] of Object.entries(extra)) w(n, o);
  return dir;
}
const par = (ticker, trimestre = '2026-Q3', fecha_fin = '2026-09-30') => ({ ticker, trimestre, fecha_fin });
const crearCliente = f => D.crearSec({ userAgent: 'Prueba prueba@ejemplo.test', fetchFn: f.fetchFn, dormir: async () => {}, intervalo: 0 });
const leerJson = (dir, ...r) => JSON.parse(fs.readFileSync(path.join(dir, ...r), 'utf8'));

test.describe('correr (SEC falsa)', () => {
  test('baja el comunicado correcto (ignora el 8-K que no es de resultados) y la presentación, con meta.json', async () => {
    const f = crearSecFalsa(), dir = carpetaDatos({ cola: [par('ACME')] });
    const r = await D.correr({ dir, sec: crearCliente(f), log: () => {}, hoy: '2026-11-12', ahora: '2026-11-12T10:30:00Z', argv: [] });
    expect(r.ok).toEqual(['ACME 2026-Q3']);
    const c = path.join(dir, 'comunicados', 'fuentes', 'ACME', '2026-Q3');
    const texto = fs.readFileSync(path.join(c, 'comunicado.txt'), 'utf8');
    expect(texto).toContain('Acme Corp. Reports Third Quarter 2026 Results');
    expect(texto.split('\n')).toContain('Revenue | $1,200 | $1,000 | 20%');
    expect(texto).not.toContain('webcast');
    expect(fs.readFileSync(path.join(c, 'presentacion.txt'), 'utf8')).toContain('=== EX-99.2 ');
    const meta = leerJson(dir, 'comunicados', 'fuentes', 'ACME', '2026-Q3', 'meta.json');
    expect(meta).toMatchObject({ estado: 'ok', forma: '8-K', fecha: '2026-10-28', exhibit: 'EX-99.1', filing: '0000000123-26-000003', descargado: '2026-11-12T10:30:00Z' });
    expect(meta.url).toBe('https://www.sec.gov/Archives/edgar/data/123/000000012326000003/acme-ex991.htm');
    expect(meta.bytes).toBeGreaterThan(2500);
    expect(meta.presentacion.archivos[0].exhibit).toBe('EX-99.2');
  });

  test('emisor extranjero: el 6-K principal es el comunicado y el 6-K de balances (que se presentó primero) no se confunde con él', async () => {
    const f = crearSecFalsa(), dir = carpetaDatos({ cola: [par('BETA')] });
    const r = await D.correr({ dir, sec: crearCliente(f), log: () => {}, hoy: '2026-11-12', ahora: 'x', argv: [] });
    expect(r.ok).toEqual(['BETA 2026-Q3']);
    const meta = leerJson(dir, 'comunicados', 'fuentes', 'BETA', '2026-Q3', 'meta.json');
    expect(meta).toMatchObject({ forma: '6-K', exhibit: '6-K', filing: '0000000456-26-000011' });
    expect(fs.readFileSync(path.join(dir, 'comunicados', 'fuentes', 'BETA', '2026-Q3', 'comunicado.txt'), 'utf8')).toContain('Beta Holdings Ltd. Reports Third Quarter 2026 Results');
  });

  test('no vuelve a bajar lo que ya existe: la segunda corrida no hace ningún pedido', async () => {
    const f = crearSecFalsa(), dir = carpetaDatos({ cola: [par('ACME'), par('BETA')] });
    const arg = { dir, log: () => {}, hoy: '2026-11-12', ahora: 'x', argv: [] };
    await D.correr({ ...arg, sec: crearCliente(f) });
    const antes = f.llamadas.length;
    expect(antes).toBeGreaterThan(0);
    const r2 = await D.correr({ ...arg, sec: crearCliente(f) });
    expect(f.llamadas.length).toBe(antes);
    expect(r2.ok).toEqual([]); expect(r2.error).toEqual([]);
  });

  test('un par que falla (ticker que la SEC no conoce) queda anotado y no corta al resto; a los 3 intentos espera una semana', async () => {
    const f = crearSecFalsa(), dir = carpetaDatos({ cola: [par('GAMA'), par('ACME')] });
    const arg = { dir, log: () => {}, ahora: 'x', argv: [] };
    const r = await D.correr({ ...arg, sec: crearCliente(f), hoy: '2026-11-12' });
    expect(r.ok).toEqual(['ACME 2026-Q3']); expect(r.error).toEqual(['GAMA 2026-Q3']);
    const meta = () => leerJson(dir, 'comunicados', 'fuentes', 'GAMA', '2026-Q3', 'meta.json');
    expect(meta()).toMatchObject({ estado: 'error', intentos: 1, ultimo_intento: '2026-11-12' });
    expect(meta().error).toMatch(/no conoce el ticker GAMA/);
    expect(fs.existsSync(path.join(dir, 'comunicados', 'fuentes', 'GAMA', '2026-Q3', 'comunicado.txt'))).toBe(false);
    await D.correr({ ...arg, sec: crearCliente(f), hoy: '2026-11-13' });
    await D.correr({ ...arg, sec: crearCliente(f), hoy: '2026-11-14' });
    expect(meta().intentos).toBe(3);
    const r4 = await D.correr({ ...arg, sec: crearCliente(f), hoy: '2026-11-15' }); // en espera: ni se intenta
    expect(r4.error).toEqual([]); expect(meta().intentos).toBe(3);
    const r5 = await D.correr({ ...arg, sec: crearCliente(f), hoy: '2026-11-22' }); // pasó la semana: reintenta
    expect(r5.error).toEqual(['GAMA 2026-Q3']); expect(meta().intentos).toBe(4);
  });

  test('un trimestre NUEVO cuyo comunicado todavía no salió no deja error escrito (se reintenta mañana)', async () => {
    const f = crearSecFalsa();
    const dir = carpetaDatos({ cola: [], extra: { 'kpis-ACME.json': { v: 1, ticker: 'ACME', trimestres: { '2026-Q3': { fecha_fin: '2026-09-30', kpis: {} } } } } });
    const est = leerJson(dir, 'comunicados', 'estado.json'); est.procesados = { ACME: ['2026-Q3'] };
    fs.writeFileSync(path.join(dir, 'comunicados', 'estado.json'), JSON.stringify(est));
    const lineas = [];
    const r = await D.correr({ dir, sec: crearCliente(f), log: l => lineas.push(l), hoy: '2027-01-20', ahora: 'x', argv: ['--tickers', 'ACME'] });
    expect(r.ok).toEqual([]); expect(r.error).toEqual([]);
    expect(lineas.join('\n')).toMatch(/ESPERA ACME 2026-Q4/);
    expect(fs.existsSync(path.join(dir, 'comunicados', 'fuentes'))).toBe(false);
  });

  test('sin SEC_USER_AGENT con contacto no arranca', () => {
    expect(() => D.crearSec({ userAgent: '' })).toThrow(/SEC_USER_AGENT/);
    expect(() => D.crearSec({ userAgent: 'solounapalabra' })).toThrow(/SEC_USER_AGENT/);
  });

  test('respeta el ritmo de la SEC: espera entre pedidos y reintenta ante 429/5xx', async () => {
    let n = 0; const esperas = [];
    const fetchFn = async () => (++n < 3 ? { ok: false, status: n === 1 ? 429 : 503 } : { ok: true, status: 200, json: async () => ({ ok: 1 }) });
    const sec = D.crearSec({ userAgent: 'Prueba prueba@ejemplo.test', fetchFn, dormir: async ms => { esperas.push(ms); }, intervalo: 120 });
    expect(await sec.json('https://data.sec.gov/x.json')).toEqual({ ok: 1 });
    expect(n).toBe(3);
    expect(esperas.some(ms => ms >= 1500)).toBe(true); // espera creciente tras un 429/5xx
    // un 404 no se reintenta
    let m = 0; const s2 = D.crearSec({ userAgent: 'Prueba prueba@ejemplo.test', fetchFn: async () => { m++; return { ok: false, status: 404 }; }, dormir: async () => {}, intervalo: 0 });
    await expect(s2.json('https://data.sec.gov/y.json')).rejects.toThrow(/HTTP 404/);
    expect(m).toBe(1);
  });
});

test('la ficha del Radar formatea la unidad "unidades" (artículos por comprador activo) con un decimal', () => {
  expect(Vista.norm('unidades', 4.37)).toEqual({ kind: 'u', v: 4.37 });
  expect(Vista.fmt('u', 4.37)).toBe('4,4');
});
