#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR v2 — job diario de DATOS (mercado + historia). Genérico: no sabe qué empresas existen; las lee de radar-config.json
// que vive en la carpeta de datos (repo PRIVADO). Corre en GitHub Actions de ese repo (workflow radar-datos.yml, en esta carpeta).
//
//   node radar-datos.js --datos <carpeta> [--tickers A,B] [--solo mercado|historia]
//   env SEC_USER_AGENT   obligatorio salvo --solo mercado (la SEC exige identificarse; va como secret del repo privado)
//
// Salida en --datos (por empresa de radar-config.json):
//   mercado-<T>.json   Yahoo: precio, ATH, múltiplos, consenso, revisiones, insiders, institucionales, short, próxima fecha…
//   historia-<T>.json  SEC (+ Yahoo si la SEC no trae trimestres): serie trimestral, P/E TTM por trimestre, medias a 5/10/15 años
// Reglas: un archivo bueno NUNCA se pisa con uno vacío o con error — si una fuente falla se conserva el anterior y se anota
// `stale_since` (fecha de la primera falla) + `ultimo_error`. Un archivo solo se reescribe si su contenido cambió.
// Pausas: SEC ≤10 pedidos/s (usa ~5/s); Yahoo un ticker a la vez, con reintentos y espera creciente.
// ════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const Calc = require('../../radar-calc.js');
const Yahoo = require('./yahoo.js');
const Historia = require('./historia.js');

const URL_TICKERS = 'https://www.sec.gov/files/company_tickers.json';
const urlFacts = cik => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const jsonEstable = o => JSON.stringify(o, null, 1) + '\n';
const sinGenerado = o => JSON.stringify({ ...o, generado: undefined });
const msg = e => String((e && e.message) || e).slice(0, 200);

// fetchJson(url) → { status, json }. Reintenta 429/5xx con espera creciente; 404 = { status: 404, json: null }.
function crearFetchJson(userAgent, fetchFn = fetch, esperaMs = 1500) {
  return async function fetchJson(url) {
    let ultimo = null;
    for (let i = 0; i < 4; i++) {
      try {
        const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
        if (res.status === 404) return { status: 404, json: null };
        if (res.status === 429 || res.status >= 500) { ultimo = new Error('HTTP ' + res.status); await dormir(esperaMs * (i + 1)); continue; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return { status: 200, json: await res.json() };
      } catch (e) { ultimo = e; await dormir(esperaMs * (i + 1)); }
    }
    throw ultimo || new Error('sin respuesta');
  };
}

const mercadoValido = m => !!m && m.precio && typeof m.precio.valor === 'number' && isFinite(m.precio.valor);
const historiaValida = h => !!h && Array.isArray(h.trimestres) && h.trimestres.length > 0;

// Escribe `nuevo` si es válido y cambió; si no hay `nuevo` conserva el archivo anterior marcándolo stale. → 'ok' | 'sin_cambios' | 'stale' | 'vacio'
function guardar({ nombre, nuevo, valido, noPeor, error, hoy, leer, escribir, log }) {
  let prev = null;
  try { const t = leer(nombre); prev = t ? JSON.parse(t) : null; } catch (_) { prev = null; }
  if (nuevo && valido(nuevo) && prev && valido(prev) && noPeor && !noPeor(prev, nuevo)) { nuevo = null; error = 'los datos nuevos tienen menos historia que los anteriores'; }
  if (nuevo && valido(nuevo)) {
    delete nuevo.stale_since; delete nuevo.ultimo_error;
    if (prev && sinGenerado(prev) === sinGenerado(nuevo)) return 'sin_cambios';
    escribir(nombre, jsonEstable(nuevo));
    return 'ok';
  }
  if (!prev || !valido(prev)) { log(`${nombre}: sin datos y sin archivo previo (${error || 'vacío'})`); return 'vacio'; }
  const marcado = { ...prev, stale_since: prev.stale_since || hoy, ultimo_error: error || 'datos vacíos' };
  if (JSON.stringify(marcado) !== JSON.stringify(prev)) escribir(nombre, jsonEstable(marcado));
  log(`${nombre}: se conserva el anterior (stale desde ${marcado.stale_since}) — ${marcado.ultimo_error}`);
  return 'stale';
}

// Todo lo externo se inyecta: yahoo = crearClienteYahoo(...), fetchJson (SEC), leer/escribir (disco), hoy, pausas.
async function procesar({ config, tickers, solo, yahoo, fetchJson, leer, escribir, hoy, log = () => {}, pausaYahooMs = 1500, pausaSecMs = 200 }) {
  const res = { mercado: {}, historia: {} };
  const empresas = ((config && config.empresas) || []).map(e => ({ ...e, ticker: Calc.normalizarTicker(e.ticker) })).filter(e => e.ticker && (!tickers || tickers.includes(e.ticker)));
  if (!empresas.length) throw new Error('radar-config.json no tiene empresas para procesar.');
  const hacerMercado = solo !== 'historia', hacerHistoria = solo !== 'mercado';

  let porTicker = null;       // company_tickers.json de la SEC, se baja una vez
  let secCaida = null;
  if (hacerHistoria) {
    try {
      const l = await fetchJson(URL_TICKERS);
      if (l.status !== 200 || !l.json) throw new Error('company_tickers.json no disponible');
      porTicker = new Map();
      for (const k of Object.keys(l.json)) { const e = l.json[k]; if (e && e.ticker) porTicker.set(String(e.ticker).toUpperCase(), e); }
    } catch (e) { secCaida = msg(e); log('SEC no disponible: ' + secCaida); }
  }

  for (const emp of empresas) {
    const t = emp.ticker;
    log(`== ${t}`);
    let resumen = null, hist = null, errMercado = null, errHist = null;
    if (hacerMercado) try { resumen = await yahoo.resumen(t); } catch (e) { errMercado = 'Yahoo resumen: ' + msg(e); }
    await dormir(pausaYahooMs / 3);
    try { hist = await yahoo.precios(t); } catch (e) { if (!errMercado) errMercado = 'Yahoo precios: ' + msg(e); hist = null; }

    if (hacerMercado) {
      let nuevo = null;
      if (resumen) { try { nuevo = Yahoo.parsearMercado(resumen, hist, { hoy, financiera: !!emp.financiera }); nuevo.ticker = t; nuevo.generado = hoy; } catch (e) { errMercado = 'parseo: ' + msg(e); } }
      // Sin precios históricos (chart caído) pero con resumen: se publica sin ATH/drawdown propios, usando el ATH del resumen si lo trae.
      res.mercado[t] = guardar({ nombre: `mercado-${t}.json`, nuevo, valido: mercadoValido, error: errMercado, hoy, leer, escribir, log });
    }

    if (hacerHistoria) {
      let cf = null, cfError = null;
      if (secCaida) cfError = secCaida;
      else {
        try {
          const e = porTicker.get(t);
          if (e) {
            await dormir(pausaSecMs);
            const r = await fetchJson(urlFacts(e.cik_str));
            if (r.status === 200) cf = r.json;
          }
        } catch (e) { cfError = 'SEC: ' + msg(e); }
      }
      let nuevo = null;
      if (cfError) errHist = cfError;
      else if (!hist || !hist.precios || !hist.precios.length) errHist = errMercado || 'Yahoo sin precios';
      else {
        try {
          // Si la SEC no alcanza (<12 trimestres), se pide la serie trimestral de Yahoo.
          const splits = hist.splits || [];
          const secQs = cf ? Historia.serieSec(cf, splits) : [];
          const nSec = secQs.length;
          let filas = [];
          if (nSec < 12 || Historia.faltaEps(secQs)) { try { await dormir(pausaYahooMs / 3); filas = await yahoo.trimestralesYahoo(t); } catch (e) { log(`  ${t}: serie trimestral de Yahoo no disponible (${msg(e)})`); } }
          nuevo = Historia.construirHistoria({ ticker: t, cf, yahooFilas: filas, hist, cotizaDesde: emp.cotiza_desde || null, hoy });
        } catch (e) { errHist = 'cálculo: ' + msg(e); }
      }
      res.historia[t] = guardar({ nombre: `historia-${t}.json`, nuevo, valido: historiaValida, noPeor: (p, n) => n.trimestres.length >= p.trimestres.length - 2, error: errHist, hoy, leer, escribir, log });
    }
    log(`  mercado: ${res.mercado[t] || '-'} · historia: ${res.historia[t] || '-'}`);
    await dormir(pausaYahooMs);
  }
  return res;
}

async function main(argv, env) {
  const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const dir = arg('--datos');
  if (!dir || !fs.existsSync(dir)) throw new Error('Falta --datos <carpeta del repo de datos>.');
  const solo = arg('--solo');
  if (solo && solo !== 'mercado' && solo !== 'historia') throw new Error('--solo admite "mercado" o "historia".');
  const ua = env.SEC_USER_AGENT;
  if (solo !== 'mercado' && (!ua || !/\S+@\S+|\S+\s+\S+/.test(ua))) throw new Error('Falta el secret SEC_USER_AGENT (la SEC exige un User-Agent con nombre y contacto).');
  let tickers = null;
  const t = (arg('--tickers') || '').trim();
  if (t) { tickers = t.split(',').map(x => Calc.normalizarTicker(x)).filter(Boolean); if (!tickers.length) throw new Error('--tickers no trae ningún ticker válido.'); }
  const leer = n => { try { return fs.readFileSync(path.join(dir, n), 'utf8'); } catch (_) { return null; } };
  const escribir = (n, txt) => fs.writeFileSync(path.join(dir, n), txt);
  const cfgTxt = leer('radar-config.json');
  if (!cfgTxt) throw new Error('No hay radar-config.json en ' + dir);
  const config = JSON.parse(cfgTxt);

  const YF = require('yahoo-finance2');
  const yf = new (YF.default || YF)({ suppressNotices: ['yahooSurvey'] });
  const yahoo = Yahoo.crearClienteYahoo(yf, { log: m => console.log(m) });
  const hoy = new Date().toISOString().slice(0, 10);
  const r = await procesar({ config, tickers, solo, yahoo, fetchJson: crearFetchJson(ua || 'sin-user-agent'), leer, escribir, hoy, log: m => console.log(m) });

  const cuenta = o => Object.values(o).reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {});
  console.log('Resumen mercado:', JSON.stringify(cuenta(r.mercado)), '· historia:', JSON.stringify(cuenta(r.historia)));
  const malos = [...Object.entries(r.mercado), ...Object.entries(r.historia)].filter(([, v]) => v === 'stale' || v === 'vacio').length;
  if (malos) console.log(`::warning::${malos} archivo(s) sin actualizar (se conservó el anterior o no existe).`);
  const todos = [...Object.values(r.mercado), ...Object.values(r.historia)];
  if (todos.length && todos.every(v => v === 'stale' || v === 'vacio')) throw new Error('Ninguna fuente respondió: no se actualizó nada.');
}

if (require.main === module) main(process.argv.slice(2), process.env).catch(e => { console.error('::error::' + e.message); process.exit(1); });
module.exports = { procesar, guardar, crearFetchJson, mercadoValido, historiaValida, urlFacts, main };
