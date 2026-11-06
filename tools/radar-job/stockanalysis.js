#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR v2 — "P/E forward de hoy vs su media de 5 años" con UNA sola fuente: Stock Analysis (página trimestral de ratios).
// El número de hoy y la media salen del mismo consenso, así que la comparación es consistente. Corre una vez por semana
// (workflow radar-sa-semanal.yml, en esta carpeta). Genérico: las empresas se leen de radar-config.json (repo PRIVADO).
//
//   node stockanalysis.js --datos <carpeta> [--tickers A,B]
//
// Salida en --datos: pe-forward-sa.json
//   { v:1, fuente, generado, empresas: { T: { actual, actual_fecha, serie:[[fecha,valor]], media_5a, mediana_5a, desde, trimestres,
//                                             url, actualizado, nota?, media_desde?, mediana_desde?, pe_ttm_referencia, stale_since?, ultimo_error? } } }
// Reglas: un dato bueno NUNCA se pisa con uno vacío o con error (403/429/captcha, HTML que cambió y no se puede parsear, menos
// historia que antes): se conserva el anterior con `stale_since`. Pausa ≥3 s entre pedidos, User-Agent de navegador, máx 2 reintentos;
// ante un bloqueo (403/429 que no cede) se corta la corrida para no insistir. El archivo solo se reescribe si cambió algo relevante.
// Los datos viajan incrustados en el HTML de la página (datekey:[…], peForward:[…], pe:[…]); no se lee el texto visible.
// ════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const Calc = require('../../radar-calc.js');

const ARCHIVO = 'pe-forward-sa.json';
const FUENTE = 'Stock Analysis (Forward PE trimestral)';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TRIMESTRES_5A = 20, MIN_TRIMESTRES = 16;
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dormir = ms => new Promise(r => setTimeout(r, ms));
const esNum = v => typeof v === 'number' && isFinite(v);
const redond = (x, n) => Math.round(x * 10 ** n) / 10 ** n;
const msg = e => String((e && e.message) || e).slice(0, 200);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const urlDe = t => 'https://stockanalysis.com/stocks/' + encodeURIComponent(String(t).toLowerCase()) + '/financials/ratios/?p=quarterly';
const desdeTxt = f => MES[+f.slice(5, 7) - 1] + '-' + f.slice(2, 4);

class ErrSA extends Error { constructor(tipo, m) { super(m); this.tipo = tipo; } }   // tipo: 'bloqueo' (403/429/captcha) | 'http' | 'formato' | 'red'

// Saca un arreglo incrustado `clave:[…]` del HTML (objeto JS sin comillas en las claves). null si no está o no es JSON válido.
function arregloIncrustado(html, clave) {
  const m = new RegExp('(?:^|[^A-Za-z0-9_$])' + clave + ':\\[').exec(html);
  if (!m) return null;
  const ini = m.index + m[0].length - 1;
  const fin = html.indexOf(']', ini);
  if (fin < 0) return null;
  try { const a = JSON.parse(html.slice(ini, fin + 1).replace(/void 0/g, 'null')); return Array.isArray(a) ? a : null; } catch (_) { return null; }
}

// HTML → { fechas, forward, pe } alineados; null si la página no trae esas series (cambió el formato o es un captcha).
function parsearRatios(html) {
  if (typeof html !== 'string' || !html) return null;
  const d = arregloIncrustado(html, 'datekey'), f = arregloIncrustado(html, 'peForward'), p = arregloIncrustado(html, 'pe');
  if (!d || !f || d.length < 2 || f.length !== d.length || d.some(x => typeof x !== 'string')) return null;
  if (p && p.length !== d.length) return null;
  return { fechas: d, forward: f, pe: p };
}

const serieDe = (fechas, valores) => fechas.map((x, i) => [x, valores[i]]).filter(([x, v]) => ISO.test(x) && esNum(v) && v > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-TRIMESTRES_5A);
const media = a => redond(a.reduce((s, [, v]) => s + v, 0) / a.length, 2);
const medianaDe = a => { const o = a.map(x => x[1]).sort((x, y) => x - y), n = o.length; return redond(n % 2 ? o[(n - 1) / 2] : (o[n / 2 - 1] + o[n / 2]) / 2, 2); };

// parseado → entrada de pe-forward-sa.json; null si no hay ninguna serie utilizable.
// Media/mediana sobre los últimos 20 trimestres; con menos de 16 NO se publican como "5 años" (quedan en media_desde / mediana_desde con la nota).
function construirEmpresa({ ticker, parseado, hoy }) {
  if (!parseado) return null;
  const serie = serieDe(parseado.fechas, parseado.forward);
  if (!serie.length) return null;
  const i0 = parseado.fechas.indexOf('TTM');
  const actual = i0 >= 0 && esNum(parseado.forward[i0]) && parseado.forward[i0] > 0 ? redond(parseado.forward[i0], 2) : null;
  const n = serie.length, desde = desdeTxt(serie[0][0]);
  const e = { actual, actual_fecha: hoy, serie, media_5a: null, mediana_5a: null, desde, trimestres: n, url: urlDe(ticker), actualizado: hoy };
  if (n >= MIN_TRIMESTRES) {
    e.media_5a = media(serie); e.mediana_5a = medianaDe(serie);
    e.nota = n >= TRIMESTRES_5A ? '20 trimestres (5 años).' : n + ' trimestres (' + String(redond(n / 4, 2)).replace('.', ',') + ' años, desde ' + desde + '): no cubre 5 años completos.';
  } else {
    e.media_desde = media(serie); e.mediana_desde = medianaDe(serie);
    e.nota = 'Solo ' + n + ' trimestres con Forward PE (desde ' + desde + '): menos de 4 años, no se publica como media de 5 años.';
  }
  if (!esNum(actual)) e.nota += ' El Forward PE de hoy no está disponible (ganancias esperadas ≤ 0 o sin dato).';
  const pe = parseado.pe ? serieDe(parseado.fechas, parseado.pe) : [];
  const j0 = parseado.fechas.indexOf('TTM');
  e.pe_ttm_referencia = { actual: j0 >= 0 && parseado.pe && esNum(parseado.pe[j0]) && parseado.pe[j0] > 0 ? redond(parseado.pe[j0], 2) : null, media: pe.length ? media(pe) : null, trimestres: pe.length };
  return e;
}

// Baja una página. Reintenta (máx 2 veces) los 429/5xx/errores de red con espera creciente; un 403 o un captcha no se reintenta.
async function bajarHtml(url, { fetchFn = fetch, esperaMs = 5000, reintentos = 2, log = () => {} } = {}) {
  let ultimo = null;
  for (let i = 0; i <= reintentos; i++) {
    if (i > 0) await dormir(esperaMs * i);
    try {
      const res = await fetchFn(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow' });
      if (res.status === 403) throw new ErrSA('bloqueo', 'HTTP 403 (bloqueado)');
      if (res.status === 429) { ultimo = new ErrSA('bloqueo', 'HTTP 429 (demasiados pedidos)'); log('  429, se reintenta'); continue; }
      if (res.status >= 500) { ultimo = new ErrSA('http', 'HTTP ' + res.status); continue; }
      if (!res.ok) throw new ErrSA('http', 'HTTP ' + res.status);
      const html = await res.text();
      if (/captcha|cf-challenge|Just a moment|Attention Required/i.test(html.slice(0, 20000)) && !/datekey:\[/.test(html)) throw new ErrSA('bloqueo', 'captcha o desafío anti-bots');
      return html;
    } catch (e) {
      if (e instanceof ErrSA) throw e;                 // 403, captcha o un HTTP que no se reintenta (los 429/5xx ya siguieron arriba)
      ultimo = new ErrSA('red', msg(e));
    }
  }
  throw ultimo || new ErrSA('red', 'sin respuesta');
}

// Contenido comparable: sin la fecha de la corrida (generado / actualizado / actual_fecha), para no reescribir el archivo por nada.
function relevante(o) {
  const r = JSON.parse(JSON.stringify(o || {}));
  delete r.generado;
  for (const t of Object.keys(r.empresas || {})) { delete r.empresas[t].actualizado; delete r.empresas[t].actual_fecha; }
  return JSON.stringify(r);
}

// Todo lo externo se inyecta (leer/escribir en disco, fetchFn, hoy, pausas) para poder probarlo con datos inventados.
async function actualizar({ config, tickers, leer, escribir, fetchFn = fetch, hoy, log = () => {}, pausaMs = 3500, esperaReintentoMs = 5000 }) {
  const lista = ((config && config.empresas) || []).map(e => Calc.normalizarTicker(e.ticker)).filter(t => t && (!tickers || tickers.includes(t)));
  if (!lista.length) throw new Error('radar-config.json no tiene empresas para procesar.');
  let prev = null;
  try { const t = leer(ARCHIVO); prev = t ? JSON.parse(t) : null; } catch (_) { prev = null; }
  const previas = (prev && prev.empresas) || {};
  const empresas = { ...previas };
  const res = {};
  let bloqueado = null;
  for (let k = 0; k < lista.length; k++) {
    const t = lista[k];
    const ant = previas[t] && Array.isArray(previas[t].serie) && previas[t].serie.length ? previas[t] : null;
    let nueva = null, error = null;
    if (bloqueado) error = 'no se pidió: ' + bloqueado;
    else {
      if (k > 0) await dormir(pausaMs);
      log('== ' + t);
      try {
        const html = await bajarHtml(urlDe(t), { fetchFn, esperaMs: esperaReintentoMs, log });
        const parseado = parsearRatios(html);
        if (!parseado) throw new ErrSA('formato', 'la página no trae las series esperadas (¿cambió el formato?)');
        nueva = construirEmpresa({ ticker: t, parseado, hoy });
        if (!nueva) throw new ErrSA('formato', 'la serie de Forward PE vino vacía');
        if (ant && nueva.trimestres < ant.trimestres - 2) { error = 'los datos nuevos tienen menos historia que los anteriores (' + nueva.trimestres + ' vs ' + ant.trimestres + ')'; nueva = null; }
      } catch (e) { error = msg(e); nueva = null; if (e instanceof ErrSA && e.tipo === 'bloqueo') bloqueado = error; }
    }
    if (nueva) { empresas[t] = nueva; res[t] = 'ok'; }
    else if (ant) { empresas[t] = { ...ant, stale_since: ant.stale_since || hoy, ultimo_error: error }; res[t] = 'stale'; log(`  ${t}: se conserva el anterior (stale desde ${empresas[t].stale_since}) — ${error}`); }
    else { delete empresas[t]; res[t] = 'vacio'; log(`  ${t}: sin datos y sin archivo previo — ${error}`); }
  }
  const nuevoArchivo = { v: 1, fuente: FUENTE, generado: hoy, empresas };
  let escrito = false;
  if (Object.keys(empresas).length && (!prev || relevante(prev) !== relevante(nuevoArchivo))) { escribir(ARCHIVO, JSON.stringify(nuevoArchivo, null, 1) + '\n'); escrito = true; }
  return { res, escrito, bloqueado };
}

async function main(argv) {
  const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const dir = arg('--datos');
  if (!dir || !fs.existsSync(dir)) throw new Error('Falta --datos <carpeta del repo de datos>.');
  let tickers = null;
  const t = (arg('--tickers') || '').trim();
  if (t) { tickers = t.split(',').map(x => Calc.normalizarTicker(x)).filter(Boolean); if (!tickers.length) throw new Error('--tickers no trae ningún ticker válido.'); }
  const leer = n => { try { return fs.readFileSync(path.join(dir, n), 'utf8'); } catch (_) { return null; } };
  const escribir = (n, txt) => fs.writeFileSync(path.join(dir, n), txt);
  const cfgTxt = leer('radar-config.json');
  if (!cfgTxt) throw new Error('No hay radar-config.json en ' + dir);
  const r = await actualizar({ config: JSON.parse(cfgTxt), tickers, leer, escribir, hoy: new Date().toISOString().slice(0, 10), log: m => console.log(m) });
  const cuenta = Object.values(r.res).reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {});
  console.log('Resumen:', JSON.stringify(cuenta), r.escrito ? '· ' + ARCHIVO + ' actualizado' : '· sin cambios');
  const malos = (cuenta.stale || 0) + (cuenta.vacio || 0);
  if (malos) console.log(`::warning::${malos} empresa(s) sin actualizar (se conservó el dato anterior o no existe).`);
  if (malos === Object.keys(r.res).length) throw new Error('Stock Analysis no respondió: no se actualizó nada.');
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('::error::' + e.message); process.exit(1); });
module.exports = { ARCHIVO, FUENTE, UA, urlDe, arregloIncrustado, parsearRatios, construirEmpresa, bajarHtml, relevante, actualizar, main };
