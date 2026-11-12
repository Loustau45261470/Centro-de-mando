'use strict';
// Tests de comunicados-extraer.js con datos INVENTADOS, sin red (fetch mockeado). Correr:  node --test tools/radar-job/comunicados-extraer.test.js
// Los tests de punta a punta usan guardar.js / validar.js / fuentes.js del repo de datos (comunicados/): si el script está en un repo
// que no los tiene (el público), esos tests se saltean y quedan los de funciones puras.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const X = require('./comunicados-extraer.js');

const COM = path.join(__dirname, '..', '..', 'comunicados');
const HAY_COM = ['guardar.js', 'validar.js', 'fuentes.js'].every(f => fs.existsSync(path.join(COM, f)));
const integracion = HAY_COM ? {} : { skip: 'sin comunicados/guardar.js (repo público)' };
// misma normalización que fuentes.js (si el repo de datos la trae, se usa la real)
const norm = HAY_COM ? require(path.join(COM, 'fuentes.js')).norm
  : s => String(s).replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, '-').replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const CLAVE = 'AIzaSyFAKEKEYFAKEKEYFAKEKEY0123456789';
const URL_A = 'https://example.test/aaa-q3.htm';
const URL_B = 'https://example.test/bbb-q3.htm';
const FILA_LARGA = 'Detalle de márgenes por línea ' + 'xx '.repeat(80) + 'el margen operativo llegó a 11.2% en el trimestre ' + 'yy '.repeat(40) + 'fin.';
const COMUNICADO = [
  'Ventas | $100 | $120',
  'Clientes 50 million active customers',
  'Adjusted EPS | $1.10 | $1.25',
  FILA_LARGA,
].join('\n') + '\n';

// ── Pedidos de Gemini simulados ─────────────────────────────────────────────
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const gem = obj => resp(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] });
const e429 = (detalles, message = 'You exceeded your current quota') => resp(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message, details: detalles } });
const reintento = s => ({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: s });
const porDia = { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] };
function mockFetch(pasos) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, opts, texto: JSON.parse(opts.body).contents[0].parts[0].text });
    const p = pasos[Math.min(calls.length - 1, pasos.length - 1)];
    return typeof p === 'function' ? p(calls[calls.length - 1]) : p;
  };
  f.calls = calls;
  return f;
}

// ── Datos de prueba: dos empresas ficticias ─────────────────────────────────
const kpi = (valor, unidad, cita, url = URL_A) => ({ valor, unidad, fuente: { tipo: 'comunicado', url, pagina_o_slide: 'tabla de resultados', cita } });
const nulo = (url = URL_A) => ({ valor: null, motivo: 'no informado', fuente: { url } });
function respuestaBuena(o = {}) {
  return {
    ticker: 'AAA', trimestre: '2026-Q3', fecha_fin: '2026-09-30',
    kpis: {
      eps_ajustado: kpi(1.25, 'USD', 'Adjusted EPS | $1.10 | $1.25'),
      ventas: kpi(120, 'USD millones', 'Ventas | $100 | $120'),
      clientes: kpi(50, 'millones', 'Clientes 50 million active customers'),
      margen: nulo(),
      ...o,
    },
  };
}
function crearDatos({ tickers = ['AAA'], estado } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extraer-'));
  fs.mkdirSync(path.join(dir, 'comunicados'), { recursive: true });
  if (HAY_COM) for (const f of ['guardar.js', 'validar.js', 'fuentes.js']) fs.copyFileSync(path.join(COM, f), path.join(dir, 'comunicados', f));
  const esp = id => ({ id, nombre: id.toUpperCase(), unidad: { ventas: 'USD', clientes: 'n', margen: '%' }[id] });
  fs.writeFileSync(path.join(dir, 'radar-config.json'), JSON.stringify({
    v: 1,
    empresas: ['AAA', 'BBB'].map(t => ({ ticker: t, nombre: 'Empresa ' + t, kpis_especificos: ['ventas', 'clientes', 'margen'].map(esp) })),
    kpis_generales: [{ id: 'eps_ajustado', nombre: 'EPS ajustado', unidad: 'USD', fuente: 'comunicado' }, { id: 'roe', unidad: '%', fuente: 'yahoo' }],
  }));
  fs.writeFileSync(path.join(dir, 'comunicados', 'INSTRUCCIONES.md'), [
    '# Rutina', 'intro', '## Extracción automática (no va al prompt)', 'TEXTO-EXCLUIDO', '## Reglas que no se negocian', '1. Nunca inventar.',
    '## Entorno', 'git push', '### Qué hay descargado', 'comunicado.txt es texto', '### Herramientas del repo', 'TEXTO-EXCLUIDO-2',
    '## Procedimiento por par empresa-trimestre', '1. leer', '## Cómo escribir cada tipo de valor', '- Importes en USD millones',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'comunicados', 'esquema.md'), '# Esquema\nforma exacta\n');
  fs.writeFileSync(path.join(dir, 'comunicados', 'estado.json'), JSON.stringify(estado || { v: 1, ultima_corrida: null, procesados: { AAA: [], BBB: [] }, cola_backfill: [], errores: [] }, null, 1) + '\n');
  for (const [t, url] of [['AAA', URL_A], ['BBB', URL_B]]) {
    if (!tickers.includes(t)) continue;
    const c = path.join(dir, 'comunicados', 'fuentes', t, '2026-Q3');
    fs.mkdirSync(c, { recursive: true });
    fs.writeFileSync(path.join(c, 'meta.json'), JSON.stringify({ estado: 'ok', url }));
    fs.writeFileSync(path.join(c, 'comunicado.txt'), COMUNICADO);
  }
  return dir;
}
const leer = (dir, n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
async function correr(dir, fetch, { argv = [], env = {}, extra = {} } = {}) {
  const logs = [], esperas = [];
  const r = await X.correr({
    dir, env: { GEMINI_API_KEY: CLAVE, GEMINI_RPM: '0', ...env }, argv: ['--datos', dir, ...argv], fetch,
    dormir: async ms => { esperas.push(ms); }, log: l => logs.push(l), ahora: '2026-11-12T12:00:00Z', ...extra,
  });
  return { r, logs, esperas };
}
function todoElTexto(dir, logs, fetch) {
  const archivos = [];
  (function rec(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else archivos.push(fs.readFileSync(p, 'utf8')); } })(dir);
  return archivos.join('\n') + logs.join('\n') + (fetch ? fetch.calls.map(c => c.url).join('\n') : '');
}

// ── Funciones puras ─────────────────────────────────────────────────────────
test('extraerSecciones: toma cada sección hasta el siguiente título de su nivel y avisa las que faltan', () => {
  const md = '# T\n## A\nuno\n### A1\ndos\n## B\ntres\n';
  const r = X.extraerSecciones(md, ['## A', '### A1', '## Z']);
  assert.match(r.texto, /## A\nuno\n### A1\ndos\n\n### A1\ndos/);
  assert.doesNotMatch(r.texto, /tres/);
  assert.deepStrictEqual(r.faltan, ['## Z']);
});

test('seleccionarPares: primero los nuevos, después la cola en su orden; sin fuente ok, procesados ni ya guardados', () => {
  const estado = {
    procesados: { AAA: ['2026-Q1'], BBB: [] },
    cola_backfill: [
      { ticker: 'AAA', trimestre: '2025-Q4', fecha_fin: '2025-12-31' }, // sin fuente → se saltea, no frena
      { ticker: 'BBB', trimestre: '2025-Q3', fecha_fin: '2025-09-30' },
      { ticker: 'AAA', trimestre: '2025-Q3', fecha_fin: '2025-09-30' },
      { ticker: 'BBB', trimestre: '2025-Q2', fecha_fin: '2025-06-30' },
    ],
  };
  const fuentes = { AAA: ['2026-Q1', '2026-Q2', '2025-Q3', '2025-Q4'], BBB: ['2026-Q2', '2026-Q3', '2025-Q3', '2025-Q2'] };
  const metas = { 'AAA:2025-Q4': { estado: 'error' }, 'BBB:2026-Q3': { estado: 'error' } };
  const meta = (t, q) => metas[t + ':' + q] || (fuentes[t].includes(q) ? { estado: 'ok' } : null);
  const kpis = { BBB: { trimestres: { '2026-Q2': {} } } }; // ya guardado aunque no figure en procesados
  const r = X.seleccionarPares({ tickers: ['AAA', 'BBB'], estado, kpis, fuentes, meta, max: 2 });
  assert.deepStrictEqual(r.pares.map(p => `${p.origen}:${p.ticker}:${p.trimestre}`), ['nuevo:AAA:2026-Q2', 'backfill:BBB:2025-Q3', 'backfill:AAA:2025-Q3']);
  assert.deepStrictEqual(r.restantes, { nuevos: 0, cola_con_fuente: 1, cola_total: 4 });
  const solo = X.seleccionarPares({ tickers: ['BBB'], estado, kpis, fuentes, meta, max: 1 });
  assert.deepStrictEqual(solo.pares.map(p => p.ticker + p.trimestre), ['BBB2025-Q3']);
});

test('recortarCita: >200 pasa a un fragmento textual de ≤200 que conserva el valor', () => {
  const c = X.recortarCita(FILA_LARGA, 11.2);
  assert.ok(FILA_LARGA.length > 200 && c.length <= 200);
  assert.ok(FILA_LARGA.includes(c) && c.includes('11.2%'));
  assert.strictEqual(X.recortarCita('corta', 1), 'corta');
});

test('normalizarKpis: lo que falta pasa a null y lo que sobra se descarta', () => {
  const r = X.normalizarKpis({ a: kpi(1, 'USD', 'c'), extra: kpi(2, 'USD', 'c'), c: { valor: null } }, ['a', 'b', 'c'], URL_A);
  assert.deepStrictEqual(Object.keys(r.kpis), ['a', 'b', 'c']);
  assert.deepStrictEqual(r.extras, ['extra']);
  assert.deepStrictEqual(r.faltantes, ['b']);
  assert.strictEqual(r.kpis.b.valor, null);
  assert.match(r.kpis.b.motivo, /no vino/);
  assert.strictEqual(r.kpis.c.motivo, 'no informado');
  assert.strictEqual(r.kpis.c.fuente.url, URL_A);
});

test('verificarCitas: aprueba la textual (ignorando espacios y " | "), rechaza la inventada y no mira las de cálculo', () => {
  const docs = X.armarDocs({ comunicado: COMUNICADO, presentacion: null, meta: { url: URL_A }, norm });
  const calc = { valor: 5, unidad: 'USD', fuente: { tipo: 'calculo', url: 'x', pagina_o_slide: 'p', cita: '10 - 5 = 5' } };
  const r = X.verificarCitas({
    bien: kpi(120, 'USD millones', 'Ventas   $100  $120'), mal: kpi(9, 'USD millones', 'Ventas | $999'), calc, vacio: nulo(),
  }, docs, norm, URL_A);
  assert.deepStrictEqual(Object.keys(r.fallidos), ['mal']);
  assert.strictEqual(r.kpis.calc.fuente.url, URL_A);
});

test('verificarCitas: la cita de una presentación queda con el tipo y la url del anexo donde está', () => {
  const pres = '=== EX-99.2 https://example.test/pres.htm ===\nslide uno | Usuarios activos 77\n';
  const docs = X.armarDocs({ comunicado: COMUNICADO, presentacion: pres, meta: { url: URL_A }, norm });
  const r = X.verificarCitas({ u: kpi(77, 'millones', 'Usuarios activos 77') }, docs, norm, URL_A);
  assert.deepStrictEqual(r.fallidos, {});
  assert.strictEqual(r.kpis.u.fuente.tipo, 'presentacion');
  assert.strictEqual(r.kpis.u.fuente.url, 'https://example.test/pres.htm');
});

test('interpretar429: retryDelay de RetryInfo, «retry in Ns» del mensaje, y cupo diario', () => {
  assert.strictEqual(X.interpretar429(JSON.stringify({ error: { details: [reintento('34.5s')] } })).esperaMs, 34500);
  assert.strictEqual(X.interpretar429(JSON.stringify({ error: { message: 'Please retry in 12.2s.' } })).esperaMs, 12200);
  assert.strictEqual(X.interpretar429('no es json', { get: () => '9' }).esperaMs, 9000);
  assert.strictEqual(X.interpretar429(JSON.stringify({ error: { details: [porDia] } })).diaria, true);
  assert.strictEqual(X.interpretar429(JSON.stringify({ error: { details: [reintento('5s')] } })).diaria, false);
});

test('crearGemini: 429 → espera el retryDelay (+1 s) y reintenta; la clave va en el header y no en la URL', async () => {
  const f = mockFetch([e429([reintento('7s')]), gem({ ok: 1 })]);
  const esperas = [];
  const g = X.crearGemini({ clave: CLAVE, fetch: f, dormir: async ms => esperas.push(ms), modelo: 'modelo-a', rpm: 0 });
  assert.deepStrictEqual(await g.pedirObjeto('s', 'u'), { ok: 1 });
  assert.deepStrictEqual(esperas, [8000]);
  assert.strictEqual(f.calls.length, 2);
  assert.strictEqual(f.calls[0].opts.headers['x-goog-api-key'], CLAVE);
  assert.ok(f.calls.every(c => !c.url.includes(CLAVE) && /\/models\/modelo-a:generateContent$/.test(c.url)));
  assert.strictEqual(JSON.parse(f.calls[0].opts.body).generationConfig.responseMimeType, 'application/json');
});

test('crearGemini: 429 que no cede tras 3 esperas corta con error de cupo', async () => {
  const f = mockFetch([e429([reintento('1s')])]);
  const esperas = [];
  const g = X.crearGemini({ clave: CLAVE, fetch: f, dormir: async ms => esperas.push(ms), modelo: 'a', rpm: 0 });
  await assert.rejects(g.pedirObjeto('s', 'u'), e => e.cuota === true);
  assert.deepStrictEqual(esperas, [2000, 2000, 2000]);
  assert.strictEqual(f.calls.length, 4);
});

test('crearGemini: cupo DIARIO del modelo principal → pasa al de respaldo sin esperar y lo deja anotado', async () => {
  const f = mockFetch([e429([porDia, reintento('30s')]), gem({ ok: 2 })]);
  const esperas = [], logs = [];
  const g = X.crearGemini({ clave: CLAVE, fetch: f, dormir: async ms => esperas.push(ms), modelo: 'pro-x', respaldo: 'flash-y', rpm: 0, log: l => logs.push(l) });
  assert.deepStrictEqual(await g.pedirObjeto('s', 'u'), { ok: 2 });
  assert.deepStrictEqual(esperas, []);
  assert.match(f.calls[0].url, /pro-x:generateContent/);
  assert.match(f.calls[1].url, /flash-y:generateContent/);
  assert.deepStrictEqual(g.cambios, [{ de: 'pro-x', a: 'flash-y' }]);
  assert.ok(logs.some(l => /pro-x/.test(l) && /flash-y/.test(l)));
  // sin respaldo: corta
  const g2 = X.crearGemini({ clave: CLAVE, fetch: mockFetch([e429([porDia])]), dormir: async () => {}, modelo: 'a', rpm: 0 });
  await assert.rejects(g2.pedirObjeto('s', 'u'), e => e.cuota === true);
});

test('crearGemini: pausa entre pedidos según el RPM', async () => {
  let ahora = 1000;
  const esperas = [];
  const g = X.crearGemini({ clave: CLAVE, fetch: mockFetch([gem({ a: 1 })]), dormir: async ms => { esperas.push(ms); ahora += ms; }, modelo: 'a', rpm: 5, ahoraMs: () => ahora });
  await g.pedirObjeto('s', 'u');
  await g.pedirObjeto('s', 'u');
  assert.deepStrictEqual(esperas, [12000]);
});

test('crearRedactor: saca la clave y cualquier cosa con forma de clave', () => {
  const r = X.crearRedactor(CLAVE);
  assert.ok(!r(`error con ${CLAVE} adentro`).includes(CLAVE));
  assert.ok(!r('otra AIzaSyOTRAKEYOTRAKEYOTRAKEY123456').includes('AIza'));
});

// ── Punta a punta (repo de datos) ───────────────────────────────────────────
test('correr: par nuevo → guarda KPIs, marca procesado, ultima_corrida; el prompt trae las reglas del archivo y no lo excluido', integracion, async () => {
  const dir = crearDatos();
  const f = mockFetch([gem(respuestaBuena())]);
  const { r } = await correr(dir, f);
  assert.deepStrictEqual(r.procesados, ['AAA 2026-Q3']);
  const k = leer(dir, 'kpis-AAA.json').trimestres['2026-Q3'];
  assert.strictEqual(k.fecha_fin, '2026-09-30');
  assert.strictEqual(k.kpis.ventas.valor, 120);
  assert.strictEqual(k.kpis.margen.valor, null);
  const e = leer(dir, 'comunicados/estado.json');
  assert.deepStrictEqual(e.procesados.AAA, ['2026-Q3']);
  assert.strictEqual(e.ultima_corrida, '2026-11-12T12:00:00Z');
  const sistema = JSON.parse(f.calls[0].opts.body).systemInstruction.parts[0].text;
  assert.ok(sistema.includes('Nunca inventar') && sistema.includes('comunicado.txt es texto') && sistema.includes('USD millones'));
  assert.ok(!sistema.includes('TEXTO-EXCLUIDO') && !sistema.includes('git push'));
  assert.ok(f.calls[0].texto.includes('forma exacta') && f.calls[0].texto.includes('eps_ajustado') && !f.calls[0].texto.includes('roe |'));
  assert.ok(f.calls[0].texto.includes('Clientes 50 million'));
});

test('correr: cita falsa → UN reintento con solo ese KPI y su error → si sigue falsa, null con motivo', integracion, async () => {
  const dir = crearDatos();
  const falsa = kpi(120, 'USD millones', 'Ventas netas | $100 | $120 inventado');
  const f = mockFetch([gem(respuestaBuena({ ventas: falsa })), gem({ kpis: { ventas: falsa } })]);
  const { r } = await correr(dir, f);
  assert.strictEqual(f.calls.length, 2);
  assert.ok(f.calls[1].texto.includes('# CORRECCIÓN') && f.calls[1].texto.includes('- ventas:'));
  assert.ok(!/- clientes:/.test(f.calls[1].texto));
  const v = leer(dir, 'kpis-AAA.json').trimestres['2026-Q3'].kpis.ventas;
  assert.strictEqual(v.valor, null);
  assert.strictEqual(v.motivo, 'cita no verificada en el comunicado');
  assert.strictEqual(r.citas_descartadas, 1);
  assert.strictEqual(r.procesados.length, 1);
});

test('correr: cita falsa que el reintento corrige → queda el valor con la cita buena', integracion, async () => {
  const dir = crearDatos();
  const f = mockFetch([gem(respuestaBuena({ ventas: kpi(120, 'USD millones', 'Ventas netas 120') })), gem({ kpis: { ventas: kpi(120, 'USD millones', 'Ventas | $100 | $120') } })]);
  const { r } = await correr(dir, f);
  assert.strictEqual(f.calls.length, 2);
  assert.strictEqual(leer(dir, 'kpis-AAA.json').trimestres['2026-Q3'].kpis.ventas.valor, 120);
  assert.strictEqual(r.citas_recuperadas, 1);
  assert.strictEqual(r.citas_descartadas, 0);
});

test('correr: KPI faltante → null con motivo; KPI de más → descartado; cita >200 → recortada', integracion, async () => {
  const dir = crearDatos();
  const buena = respuestaBuena({ margen: kpi(11.2, '%', FILA_LARGA), kpi_inventado: kpi(1, 'USD', 'x') });
  delete buena.kpis.clientes;
  const f = mockFetch([gem(buena)]);
  const { r } = await correr(dir, f);
  const k = leer(dir, 'kpis-AAA.json').trimestres['2026-Q3'].kpis;
  assert.deepStrictEqual(Object.keys(k).sort(), ['clientes', 'eps_ajustado', 'margen', 'ventas']);
  assert.strictEqual(k.clientes.valor, null);
  assert.ok(k.margen.valor === 11.2 && k.margen.fuente.cita.length <= 200 && FILA_LARGA.includes(k.margen.fuente.cita));
  assert.strictEqual(f.calls.length, 1);
  assert.strictEqual(r.errores.length, 0);
});

test('correr: 429 con retryDelay → espera ese tiempo y sigue; el par se guarda', integracion, async () => {
  const dir = crearDatos();
  const f = mockFetch([e429([reintento('20s')]), gem(respuestaBuena())]);
  const { r, esperas } = await correr(dir, f);
  assert.deepStrictEqual(esperas, [21000]);
  assert.strictEqual(r.procesados.length, 1);
});

test('correr: cupo agotado a mitad de corrida → corta limpio y lo ya guardado queda', integracion, async () => {
  const dir = crearDatos({ tickers: ['AAA', 'BBB'] });
  const f = mockFetch([gem(respuestaBuena()), e429([reintento('1s')])]);
  const { r, esperas } = await correr(dir, f);
  assert.deepStrictEqual(r.procesados, ['AAA 2026-Q3']);
  assert.match(r.corte, /^CUPO/);
  assert.deepStrictEqual(esperas, [2000, 2000, 2000]);
  assert.ok(fs.existsSync(path.join(dir, 'kpis-AAA.json')) && !fs.existsSync(path.join(dir, 'kpis-BBB.json')));
  const e = leer(dir, 'comunicados/estado.json');
  assert.deepStrictEqual(e.procesados, { AAA: ['2026-Q3'], BBB: [] });
  assert.strictEqual(e.ultima_corrida, '2026-11-12T12:00:00Z');
  assert.deepStrictEqual(e.errores, []); // cortar por cupo no es un error del par
});

test('correr: cupo diario del modelo principal → sigue con el de respaldo y lo informa', integracion, async () => {
  const dir = crearDatos();
  const f = mockFetch([e429([porDia]), gem(respuestaBuena())]);
  const { r, logs } = await correr(dir, f, { argv: ['--modelo', 'pro-x'], env: { GEMINI_MODEL_RESPALDO: 'flash-y' } });
  assert.match(f.calls[0].url, /pro-x:/);
  assert.match(f.calls[1].url, /flash-y:/);
  assert.deepStrictEqual(r.cambios_de_modelo, [{ de: 'pro-x', a: 'flash-y' }]);
  assert.strictEqual(r.modelo_final, 'flash-y');
  assert.ok(logs.some(l => /CUPO diario agotado en pro-x/.test(l)));
  assert.strictEqual(r.procesados.length, 1);
});

test('correr: modelo por defecto, GEMINI_MODEL y --modelo (gana --modelo)', integracion, async () => {
  const modeloDe = async (env, argv) => { const f = mockFetch([gem(respuestaBuena())]); await correr(crearDatos(), f, { env, argv }); return f.calls[0].url.match(/models\/([^:]+):/)[1]; };
  assert.strictEqual(await modeloDe({}, []), X.MODELO_DEFECTO);
  assert.strictEqual(await modeloDe({ GEMINI_MODEL: 'env-m' }, []), 'env-m');
  assert.strictEqual(await modeloDe({ GEMINI_MODEL: 'env-m' }, ['--modelo', 'cli-m']), 'cli-m');
});

test('correr: la clave no aparece en logs, archivos ni URLs, aunque el servidor la repita en un error', integracion, async () => {
  const dir = crearDatos();
  const f = mockFetch([resp(400, { error: { code: 400, message: `API key not valid: ${CLAVE}` } })]);
  const { r, logs } = await correr(dir, f);
  assert.strictEqual(r.procesados.length, 0);
  assert.strictEqual(r.errores.length, 1);
  assert.ok(!todoElTexto(dir, logs, f).includes(CLAVE));
  assert.ok(!todoElTexto(dir, logs, f).includes('AIzaSy'));
  assert.ok(leer(dir, 'comunicados/estado.json').errores[0].mensaje.startsWith('extracción Gemini: '));
  assert.strictEqual(f.calls[0].opts.headers['x-goog-api-key'], CLAVE);
  // y la corrida feliz tampoco la deja en ningún lado
  const dir2 = crearDatos(), f2 = mockFetch([gem(respuestaBuena())]);
  const c2 = await correr(dir2, f2);
  assert.ok(!todoElTexto(dir2, c2.logs, f2).includes(CLAVE));
});

test('correr: un par que no pasa la validación NO se guarda y queda en estado.errores', integracion, async () => {
  const dir = crearDatos();
  const f = mockFetch([gem({ ...respuestaBuena(), fecha_fin: 'no-es-fecha' })]);
  const { r } = await correr(dir, f);
  assert.strictEqual(r.procesados.length, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'kpis-AAA.json')));
  const e = leer(dir, 'comunicados/estado.json');
  assert.deepStrictEqual(e.procesados.AAA, []);
  assert.strictEqual(e.errores.length, 1);
  assert.match(e.errores[0].mensaje, /fecha_fin/);
});

test('correr: KPI con formato inválido → reintento; si sigue mal pasa a null y el par se guarda', integracion, async () => {
  const dir = crearDatos();
  const malo = kpi(120, 'EUR', 'Ventas | $100 | $120');
  const f = mockFetch([gem(respuestaBuena({ ventas: malo })), gem({ kpis: { ventas: malo } })]);
  const { r } = await correr(dir, f);
  assert.strictEqual(f.calls.length, 2);
  assert.strictEqual(r.procesados.length, 1);
  assert.strictEqual(leer(dir, 'kpis-AAA.json').trimestres['2026-Q3'].kpis.ventas.valor, null);
});

test('correr --dry-run: no llama a la API, no escribe nada y muestra pares y tamaño del prompt', integracion, async () => {
  const dir = crearDatos({ tickers: ['AAA', 'BBB'] });
  const antes = fs.readFileSync(path.join(dir, 'comunicados', 'estado.json'), 'utf8');
  const f = mockFetch([gem(respuestaBuena())]);
  const { r, logs } = await correr(dir, f, { argv: ['--dry-run'], env: { GEMINI_API_KEY: '' } });
  assert.strictEqual(f.calls.length, 0);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'comunicados', 'estado.json'), 'utf8'), antes);
  assert.ok(!fs.existsSync(path.join(dir, 'kpis-AAA.json')));
  assert.strictEqual(r.pares.length, 2);
  assert.ok(logs.some(l => /AAA 2026-Q3 \(nuevo\): prompt \d+ caracteres/.test(l)));
});

test('correr: --tickers y --max acotan la selección; sin clave (y sin --dry-run) falla claro', integracion, async () => {
  const dir = crearDatos({ tickers: ['AAA', 'BBB'] });
  const f = mockFetch([gem(respuestaBuena())]);
  const { r } = await correr(dir, f, { argv: ['--tickers', 'aaa', '--max', '1'] });
  assert.deepStrictEqual(r.procesados, ['AAA 2026-Q3']);
  await assert.rejects(correr(crearDatos(), mockFetch([]), { env: { GEMINI_API_KEY: '' } }), /GEMINI_API_KEY/);
});
