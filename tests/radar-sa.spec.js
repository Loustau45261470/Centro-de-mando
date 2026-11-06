// Radar v2 — "P/E fwd de hoy vs media de 5 años" con UNA sola fuente (Stock Analysis): job semanal (tools/radar-job/stockanalysis.js) y su
// lectura en la ficha (radar-vista.js). Todo con datos y HTML INVENTADOS, red y disco falsos: nunca se pega a Stock Analysis.
'use strict';
const path = require('path');
const { test, expect } = require('./support/fixtures');
const SA = require(path.join(__dirname, '..', 'tools', 'radar-job', 'stockanalysis.js'));
const V = require(path.join(__dirname, '..', 'radar-vista.js'));
const D = require('./fixtures/radar-v2.js');

test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'cálculo puro / job con IO falsa: una sola vez'); });

const HOY = '2026-11-09';
// n trimestres terminando el 30/09/2026, del más nuevo al más viejo (como los trae la página: primero "TTM").
function fechas(n) {
  const r = ['TTM'];
  for (let k = 0; k < n; k++) r.push(new Date(Date.UTC(2026, 9 - 3 * k, 0)).toISOString().slice(0, 10));   // día 0 del mes siguiente = último día del trimestre
  return r;
}
// Forward PE inventado: los más viejos 10, 11, 12… y el más nuevo (último trimestre) 100 (extremo: separa media de mediana). n=20 → media 23,05, mediana 19,5.
const valores = n => { const asc = Array.from({ length: n }, (_, i) => 10 + i); asc[n - 1] = 100; return asc.slice().reverse(); };
function html({ n = 20, ttm = 31.25, fw, pe, extra = '' } = {}) {
  const f = fechas(n), v = [ttm].concat(fw || valores(n)), p = [40.5].concat(pe || valores(n).map(x => x + 5));
  return `<!doctype html><html><head><title>Acme Test Corp ratios</title></head><body><script>__sveltekit={xpe:[1,2],data:[{type:"data",data:{ratios:{datekey:${JSON.stringify(f)},peForward:${JSON.stringify(v)},pe:${JSON.stringify(p)}${extra}}}}]}</script></body></html>`;
}
const cfg = { empresas: [{ ticker: 'ACME' }, { ticker: 'nubo' }] };

// Entorno falso: disco en memoria + fetch que responde por ticker (en minúscula, como en la URL). resp: { acme: {status, body}|fn, … }
function entorno({ resp = {}, previo = null } = {}) {
  const fsm = new Map(); if (previo) fsm.set(SA.ARCHIVO, typeof previo === 'string' ? previo : JSON.stringify(previo));
  const pedidos = [];
  const fetchFn = async (url, opts) => {
    pedidos.push({ url, ua: opts && opts.headers && opts.headers['User-Agent'] });
    const t = /\/stocks\/([^/]+)\//.exec(url)[1];
    let r = resp[t]; if (typeof r === 'function') r = r(pedidos.filter(p => p.url === url).length);
    if (!r) r = { status: 200, body: html() };
    return { status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => r.body || '' };
  };
  const args = { config: cfg, leer: n => (fsm.has(n) ? fsm.get(n) : null), escribir: (n, t) => fsm.set(n, t), fetchFn, hoy: HOY, pausaMs: 0, esperaReintentoMs: 0 };
  return { fsm, pedidos, args, archivo: () => (fsm.has(SA.ARCHIVO) ? JSON.parse(fsm.get(SA.ARCHIVO)) : null) };
}

test.describe('Stock Analysis: parseo del HTML', () => {
  test('saca datekey, peForward y pe incrustados; no confunde una clave que termina igual (xpe) y acepta null / void 0', () => {
    const p = SA.parsearRatios(html({ n: 3, fw: [11, null, 9] }));
    expect(p.fechas).toEqual(['TTM', '2026-09-30', '2026-06-30', '2026-03-31']);
    expect(p.forward).toEqual([31.25, 11, null, 9]);
    expect(p.pe).toEqual([40.5].concat(valores(3).map(x => x + 5)));
    const raro = SA.parsearRatios('x{datekey:["TTM","2026-09-30"],peForward:[void 0,12.5],pe:[30,25]}');
    expect(raro.forward).toEqual([null, 12.5]);
  });
  test('HTML que cambió (sin las series, largos distintos, captcha) → null, no un resultado inventado', () => {
    expect(SA.parsearRatios('<html>Just a moment... captcha</html>')).toBeNull();
    expect(SA.parsearRatios('')).toBeNull();
    expect(SA.parsearRatios(null)).toBeNull();
    expect(SA.parsearRatios('{datekey:["TTM","2026-09-30"],peForward:[1,2,3],pe:[1,2]}')).toBeNull();
    expect(SA.parsearRatios('{datekey:["TTM","2026-09-30"],pe:[1,2]}')).toBeNull();
  });
});

test.describe('Stock Analysis: media, mediana y "desde"', () => {
  const emp = (n, o) => SA.construirEmpresa({ ticker: 'ACME', parseado: SA.parsearRatios(html(Object.assign({ n }, o))), hoy: HOY });

  test('20 trimestres: actual = TTM, media y mediana de los 20, "desde" del más viejo, serie ascendente', () => {
    const e = emp(20);
    expect(e).toMatchObject({ actual: 31.25, actual_fecha: HOY, media_5a: 23.05, mediana_5a: 19.5, desde: 'dic-21', trimestres: 20, actualizado: HOY });
    expect(e.url).toBe('https://stockanalysis.com/stocks/acme/financials/ratios/?p=quarterly');
    expect(e.serie).toHaveLength(20);
    expect(e.serie[0]).toEqual(['2021-12-31', 10]); expect(e.serie[19]).toEqual(['2026-09-30', 100]);
    expect(e.nota).toBe('20 trimestres (5 años).');
  });
  test('más de 20 trimestres: solo cuentan los últimos 20; valores ≤ 0 o nulos no entran', () => {
    const e = emp(24);
    expect(e.trimestres).toBe(20); expect(e.desde).toBe('dic-21');
    const raro = emp(20, { fw: valores(20).map((v, i) => (i === 5 ? -3 : i === 6 ? null : v)) });
    expect(raro.trimestres).toBe(18); expect(raro.media_5a).not.toBeNull();
  });
  test('entre 16 y 19 trimestres hay media con nota de período parcial; con menos de 16 NO se publica como 5 años (queda en media_desde)', () => {
    const e17 = emp(17);
    expect(e17.media_5a).not.toBeNull(); expect(e17.nota).toMatch(/17 trimestres \(4,25 años, desde .*no cubre 5 años/);
    const e14 = emp(14);
    expect(e14).toMatchObject({ media_5a: null, mediana_5a: null, trimestres: 14 });
    expect(e14.media_desde).toBeGreaterThan(0); expect(e14.nota).toMatch(/Solo 14 trimestres.*no se publica como media de 5 años/);
    expect(e14.desde).toBe('jun-23');
  });
  test('sin Forward PE de hoy (TTM nulo): actual null con nota, igual hay media; sin ninguna serie válida no hay entrada', () => {
    const e = emp(20, { ttm: null });
    expect(e.actual).toBeNull(); expect(e.media_5a).toBe(23.05); expect(e.nota).toMatch(/Forward PE de hoy no está disponible/);
    expect(SA.construirEmpresa({ ticker: 'ACME', parseado: SA.parsearRatios(html({ n: 4, fw: [null, null, -1, 0] })), hoy: HOY })).toBeNull();
  });
});

test.describe('Stock Analysis: job semanal', () => {
  test('corrida normal: pide cada empresa del config (minúscula, sin tickers en el código), con User-Agent de navegador, y escribe pe-forward-sa.json', async () => {
    const e = entorno();
    const r = await SA.actualizar(e.args);
    expect(r.res).toEqual({ ACME: 'ok', NUBO: 'ok' }); expect(r.escrito).toBe(true);
    expect(e.pedidos.map(p => p.url)).toEqual(['https://stockanalysis.com/stocks/acme/financials/ratios/?p=quarterly', 'https://stockanalysis.com/stocks/nubo/financials/ratios/?p=quarterly']);
    expect(e.pedidos[0].ua).toMatch(/^Mozilla\/5\.0 .*Chrome\//);
    const a = e.archivo();
    expect(a).toMatchObject({ v: 1, fuente: 'Stock Analysis (Forward PE trimestral)', generado: HOY });
    expect(Object.keys(a.empresas)).toEqual(['ACME', 'NUBO']);
    expect(a.empresas.ACME).toMatchObject({ actual: 31.25, media_5a: 23.05, mediana_5a: 19.5, desde: 'dic-21', trimestres: 20 });
    expect(a.empresas.ACME.stale_since).toBeUndefined();
  });
  test('--tickers limita la corrida y conserva a las demás empresas del archivo', async () => {
    const e = entorno();
    await SA.actualizar(e.args);
    const antes = e.archivo().empresas.NUBO;
    e.pedidos.length = 0;
    await SA.actualizar(Object.assign({}, e.args, { tickers: ['ACME'], hoy: '2026-11-16' }));
    expect(e.pedidos).toHaveLength(1);
    expect(e.archivo().empresas.NUBO).toEqual(antes);
  });
  test('si no cambió nada relevante (solo la fecha de la corrida) no se reescribe; si cambió un valor, sí', async () => {
    const e = entorno();
    await SA.actualizar(e.args);
    const txt = e.fsm.get(SA.ARCHIVO);
    const r2 = await SA.actualizar(Object.assign({}, e.args, { hoy: '2026-11-16' }));
    expect(r2.escrito).toBe(false); expect(e.fsm.get(SA.ARCHIVO)).toBe(txt);
    const r3 = await SA.actualizar(Object.assign({}, e.args, { hoy: '2026-11-23', fetchFn: async () => ({ status: 200, ok: true, text: async () => html({ ttm: 33 }) }) }));
    expect(r3.escrito).toBe(true); expect(e.archivo().empresas.ACME).toMatchObject({ actual: 33, actualizado: '2026-11-23' });
  });
  test('403: no pisa nada, conserva lo anterior con stale_since, y no insiste con las demás empresas', async () => {
    const e = entorno();
    await SA.actualizar(e.args);
    const antes = e.archivo();
    e.pedidos.length = 0;
    const r = await SA.actualizar(Object.assign({}, e.args, { hoy: '2026-11-16', fetchFn: async (u) => { e.pedidos.push({ url: u }); return { status: 403, ok: false, text: async () => 'Forbidden' }; } }));
    expect(r.res).toEqual({ ACME: 'stale', NUBO: 'stale' }); expect(e.pedidos).toHaveLength(1);   // un solo pedido: el bloqueo corta la corrida
    const a = e.archivo();
    for (const t of ['ACME', 'NUBO']) {
      expect(a.empresas[t]).toMatchObject({ actual: antes.empresas[t].actual, media_5a: antes.empresas[t].media_5a, actualizado: HOY, stale_since: '2026-11-16' });
      expect(a.empresas[t].ultimo_error).toMatch(/403|no se pidió/);
    }
    const r2 = await SA.actualizar(Object.assign({}, e.args, { hoy: '2026-11-23', fetchFn: async () => ({ status: 403, ok: false, text: async () => '' }) }));
    expect(e.archivo().empresas.ACME.stale_since).toBe('2026-11-16'); expect(r2.escrito).toBe(false);    // sigue stale desde la primera falla; sin reescribir
  });
  test('HTML roto o captcha con status 200: stale, no se pisa; cuando vuelve a andar se limpia stale_since', async () => {
    const e = entorno();
    await SA.actualizar(e.args);
    const buenoMedia = e.archivo().empresas.ACME.media_5a;
    const roto = await SA.actualizar(Object.assign({}, e.args, { hoy: '2026-11-16', fetchFn: async () => ({ status: 200, ok: true, text: async () => '<html><body>Cambiamos todo el diseño</body></html>' }) }));
    expect(roto.res.ACME).toBe('stale'); expect(e.archivo().empresas.ACME).toMatchObject({ media_5a: buenoMedia, stale_since: '2026-11-16' });
    expect(e.archivo().empresas.ACME.ultimo_error).toMatch(/cambió el formato/);
    const captcha = await SA.actualizar(Object.assign({}, e.args, { hoy: '2026-11-17', fetchFn: async () => ({ status: 200, ok: true, text: async () => '<html><title>Just a moment...</title>captcha</html>' }) }));
    expect(captcha.bloqueado).toMatch(/captcha/);
    const ok = await SA.actualizar(Object.assign({}, e.args, { hoy: '2026-11-23' }));
    expect(ok.res).toEqual({ ACME: 'ok', NUBO: 'ok' });
    expect(e.archivo().empresas.ACME.stale_since).toBeUndefined(); expect(e.archivo().empresas.ACME.ultimo_error).toBeUndefined();
  });
  test('sin archivo previo y sin respuesta: no se inventa nada (no se crea el archivo)', async () => {
    const e = entorno({ resp: { acme: { status: 403 }, nubo: { status: 403 } } });
    const r = await SA.actualizar(e.args);
    expect(r.res).toEqual({ ACME: 'vacio', NUBO: 'vacio' }); expect(e.fsm.has(SA.ARCHIVO)).toBe(false);
  });
  test('reintentos: un 500 o un 429 se reintentan hasta 2 veces (3 pedidos en total); 429 que no cede = bloqueo', async () => {
    const e = entorno({ resp: { acme: n => (n < 3 ? { status: 500 } : { status: 200, body: html() }) } });
    const r = await SA.actualizar(Object.assign({}, e.args, { tickers: ['ACME'] }));
    expect(r.res.ACME).toBe('ok'); expect(e.pedidos).toHaveLength(3);
    const e2 = entorno({ resp: { acme: { status: 429 } } });
    const r2 = await SA.actualizar(Object.assign({}, e2.args, { tickers: ['ACME'] }));
    expect(e2.pedidos).toHaveLength(3); expect(r2.res.ACME).toBe('vacio'); expect(r2.bloqueado).toMatch(/429/);
  });
  test('un 404 no se reintenta; un error de red sí (y si no cede, queda stale)', async () => {
    const e = entorno({ resp: { acme: { status: 404 } } });
    await SA.actualizar(Object.assign({}, e.args, { tickers: ['ACME'] }));
    expect(e.pedidos).toHaveLength(1);
    const e2 = entorno();
    let n = 0;
    const r = await SA.actualizar(Object.assign({}, e2.args, { tickers: ['ACME'], fetchFn: async () => { n++; throw new Error('ECONNRESET'); } }));
    expect(n).toBe(3); expect(r.res.ACME).toBe('vacio');
  });
  test('si la página nueva trae bastante menos historia que la anterior, se la trata como HTML roto y se conserva la anterior', async () => {
    const e = entorno();
    await SA.actualizar(e.args);
    const r = await SA.actualizar(Object.assign({}, e.args, { hoy: '2026-11-16', fetchFn: async () => ({ status: 200, ok: true, text: async () => html({ n: 12 }) }) }));
    expect(r.res.ACME).toBe('stale'); expect(e.archivo().empresas.ACME.trimestres).toBe(20); expect(e.archivo().empresas.ACME.ultimo_error).toMatch(/menos historia/);
  });
  test('radar-config.json sin empresas: error claro', async () => {
    await expect(SA.actualizar(Object.assign({}, entorno().args, { config: { empresas: [] } }))).rejects.toThrow(/no tiene empresas/);
  });
});

// ───────────── Lectura en la ficha ─────────────
const ARCH = D.archivos();
const MAN = { v: 1, empresas: { ACME: { pe_forward_media: { '5y': 20, '10y': null, '15y': null, mediana: 16, desde: 'dic-21', fuente: 'Fuente inventada', url: 'https://example.test/m', fecha_dato: '2026-11-06' }, pares: [], wacc: { valor: null } } } };
const saArch = (o = {}) => ({ v: 1, fuente: SA.FUENTE, empresas: { ACME: Object.assign({ actual: 28, actual_fecha: '2026-11-09', serie: [], media_5a: 20, mediana_5a: 16, desde: 'dic-21', trimestres: 20, url: 'https://example.test/sa', actualizado: '2026-11-09' }, o) } });
const vistaDe = (t, extra = {}) => {
  const config = ARCH['radar-config.json'], emp = config.empresas.find(e => e.ticker === t);
  return V.vista(Object.assign({ config, emp, mercado: ARCH['mercado-' + t + '.json'], historia: ARCH['historia-' + t + '.json'], kpis: ARCH['kpis-' + t + '.json'], manual: MAN }, extra));
};
const item = v => { for (const s of v.secciones) { const i = s.items.find(x => x.id === 'p_e_forward_vs_media_5_10_15_anos'); if (i) return i; } return null; };

test.describe('Stock Analysis: la fila "P/E fwd vs media de 5 años" en la ficha', () => {
  test('los dos lados salen de Stock Analysis: hoy 28 vs media 20 (+40%), NO el NTM de Yahoo (18x) que daría -10%', () => {
    const it = item(vistaDe('ACME', { peSa: saArch() }));
    expect(it).toMatchObject({ estado: 'ok', nombre: 'P/E fwd vs media de 5 años', txt: '+40,0% vs media 5 años' });
    expect(it.lineas).toEqual([
      { k: 'P/E fwd de hoy', txt: '28,0x' },
      { k: 'Media 5a / mediana 5a (desde dic-21)', txt: '20,0x / 16,0x · hoy +40,0% vs media · +75,0% vs mediana' },
    ]);
    expect(it.nota).toMatch(/misma fuente/);
  });
  test('rótulo con la fecha: "Stock Analysis, semana del dd/mm" en el nombre del período y en la fuente, con el enlace', () => {
    const it = item(vistaDe('ACME', { peSa: saArch() }));
    expect(it.periodo).toBe('Stock Analysis, semana del 09/11');
    expect(it.fuente).toMatchObject({ tipo: 'stockanalysis', titulo: 'Stock Analysis, semana del 09/11', url: 'https://example.test/sa' });
    expect(it.tri).toBe('2026-11-09');
  });
  test('si el job quedó bloqueado (stale_since) se muestran los últimos valores con "datos del dd/mm" y se aclara desde cuándo no se actualiza', () => {
    const it = item(vistaDe('ACME', { peSa: saArch({ stale_since: '2026-11-23', actualizado: '2026-11-16', ultimo_error: 'HTTP 403' }) }));
    expect(it).toMatchObject({ estado: 'ok', txt: '+40,0% vs media 5 años', periodo: 'Stock Analysis, datos del 16/11' });
    expect(it.fuente.titulo).toBe('Stock Analysis, datos del 16/11'); expect(it.fuente.detalle).toMatch(/no se pudo actualizar desde el 23\/11/);
  });
  test('sin pe-forward-sa.json (o sin esa empresa) rige radar-manual.json como hasta ahora', () => {
    for (const peSa of [undefined, null, { v: 1, empresas: {} }, { v: 1, empresas: { OTRA: saArch().empresas.ACME } }]) {
      const it = item(vistaDe('ACME', { peSa }));
      expect(it).toMatchObject({ nombre: 'P/E fwd (12 meses) vs media de 5, 10 y 15 años', txt: '-10,0% vs media 5 años' });   // 18 (Yahoo NTM) / 20 − 1
      expect(it.fuente).toMatchObject({ tipo: 'manual' });
    }
  });
  test('menos de 16 trimestres: sin datos suficientes, con el motivo; sin Forward PE de hoy: n/s; sin mediana: solo la media', () => {
    const corto = item(vistaDe('ACME', { peSa: saArch({ media_5a: null, mediana_5a: null, media_desde: 21, trimestres: 14, desde: 'jun-23', nota: 'Solo 14 trimestres con Forward PE.' }) }));
    expect(corto).toMatchObject({ estado: 'sin_datos', txt: 'sin datos suficientes (solo 14 trimestres, desde jun-23)' });
    expect(corto.lineas).toEqual([{ k: 'P/E fwd de hoy', txt: '28,0x' }]);
    expect(item(vistaDe('ACME', { peSa: saArch({ actual: null }) }))).toMatchObject({ estado: 'ns', txt: 'n/s' });
    expect(item(vistaDe('ACME', { peSa: saArch({ mediana_5a: null }) })).lineas[1].txt).toBe('20,0x · hoy +40,0% vs media');
  });
  test('el resto de la ficha sigue con el NTM de Yahoo (P/E fwd 12 meses = 18x)', () => {
    const v = vistaDe('ACME', { peSa: saArch() });
    const pf = v.secciones.flatMap(s => s.items).find(x => x.id === 'p_e_forward');
    expect(pf).toMatchObject({ nombre: 'P/E fwd (12 meses)', txt: '18,0x' });
  });
});
