#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════
// RADAR DE EMPRESAS — job que baja los fundamentals de la SEC (EDGAR) y deja un JSON compacto por empresa.
// Corre en GitHub Actions del repo PRIVADO de datos (workflow: radar-fundamentals.yml, en esta misma carpeta), no en el Worker:
// "companyfacts" pesa varios MB por empresa y el plan gratuito de Cloudflare Workers da 10 ms de CPU por pedido.
//
//   node run.js --datos <carpeta del repo de datos> [--tickers NVDA,MELI]
//   env SEC_USER_AGENT  (obligatorio) — la SEC exige identificarse: "Nombre contacto@mail". Va como secret del repo privado, nunca en este repo.
//
// Sin --tickers (corrida programada): refresca todos los fund-<TICKER>.json que ya están en la carpeta (salvo los marcados no_sec).
// Con --tickers (pedido desde la app): solo esos, aunque estén marcados no_sec (se reintenta).
// Salida (en --datos): fund-<TICKER>.json por empresa y fund-index.json (resumen de todas, lo que lee la lista del Radar).
// Un archivo solo se reescribe si su contenido cambió: no hay commits vacíos ni ruido en el historial.
// Cálculo: ../../radar-calc.js (el mismo módulo que usa la app y los tests).
// ════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const Calc = require('../../radar-calc.js');

const URL_TICKERS = 'https://www.sec.gov/files/company_tickers.json';
const urlFacts = cik => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
const PAUSA_MS = 200; // la SEC permite 10 pedidos por segundo; vamos a ~5
const dormir = ms => new Promise(r => setTimeout(r, ms));
const archivoDe = t => `fund-${t}.json`;

// fetchJson(url) → { status, json }. Reintenta 429/5xx con espera creciente. 404 = { status: 404, json: null }.
function crearFetchJson(userAgent, fetchFn = fetch) {
  return async function fetchJson(url) {
    let ultimo = null;
    for (let intento = 0; intento < 4; intento++) {
      try {
        const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
        if (res.status === 404) return { status: 404, json: null };
        if (res.status === 429 || res.status >= 500) { ultimo = new Error('HTTP ' + res.status + ' en ' + new URL(url).host); await dormir(1500 * (intento + 1)); continue; }
        if (!res.ok) throw new Error('HTTP ' + res.status + ' en ' + new URL(url).host);
        return { status: 200, json: await res.json() };
      } catch (e) { ultimo = e; await dormir(1500 * (intento + 1)); }
    }
    throw ultimo || new Error('sin respuesta');
  };
}

// Resumen para el índice: lo mínimo para calcular los múltiplos de la lista (mismo formato que usa RadarCalc.multiplos).
function resumenDe(f) {
  if (f.error) return { error: f.error };
  return { nombre: f.nombre, datosAl: f.datosAl, presentado: f.presentado, ttm: f.ttm, bal: f.bal, acciones: f.acciones, accionesFin: f.accionesFin };
}

const jsonEstable = obj => JSON.stringify(obj) + '\n';

// IO inyectable (tests): leer(nombre) → string|null, escribir(nombre, texto), listar() → [nombres].
async function procesar({ tickers, fetchJson, leer, escribir, listar, log = () => {}, pausaMs = PAUSA_MS }) {
  const resultado = { ok: [], noSec: [], sinDatos: [], fallidos: [], sinCambios: [] };
  let pedidos = tickers && tickers.length ? tickers.slice() : null;
  if (!pedidos) {
    pedidos = listar().filter(n => /^fund-[A-Z0-9-]+\.json$/.test(n) && n !== 'fund-index.json').map(n => n.slice(5, -5))
      .filter(t => { try { const f = JSON.parse(leer(archivoDe(t)) || '{}'); return f.error !== 'no_sec'; } catch (_) { return true; } });
  }
  if (pedidos.length) {
    const lista = await fetchJson(URL_TICKERS);
    if (lista.status !== 200 || !lista.json) throw new Error('No se pudo bajar company_tickers.json de la SEC');
    const porTicker = new Map();
    for (const k of Object.keys(lista.json)) { const e = lista.json[k]; if (e && e.ticker) porTicker.set(String(e.ticker).toUpperCase(), e); }

    for (const t of pedidos) {
      try {
        const emp = porTicker.get(t);
        let ficha;
        if (!emp) ficha = { v: 1, ticker: t, error: 'no_sec' };
        else {
          await dormir(pausaMs);
          const r = await fetchJson(urlFacts(emp.cik_str));
          if (r.status === 404) ficha = { v: 1, ticker: t, nombre: emp.title || null, error: 'no_sec' };
          else {
            const f = Calc.construirFicha(r.json);
            ficha = f.sinDatos ? { v: 1, ticker: t, nombre: f.nombre || emp.title || null, error: 'sin_datos' } : Object.assign({ ticker: t }, f);
            delete ficha.sinDatos;
          }
        }
        const texto = jsonEstable(ficha);
        if (leer(archivoDe(t)) === texto) resultado.sinCambios.push(t); else escribir(archivoDe(t), texto);
        (ficha.error === 'no_sec' ? resultado.noSec : ficha.error === 'sin_datos' ? resultado.sinDatos : resultado.ok).push(t);
        log(`${t}: ${ficha.error || 'ok'}`);
      } catch (e) {
        // Un fallo de red no pisa lo que ya había: se conserva el archivo anterior.
        resultado.fallidos.push(t);
        log(`${t}: FALLÓ (${e && e.message}) — se conserva el archivo anterior`);
      }
    }
  }
  // Índice con todas las empresas que hay en la carpeta.
  const empresas = {};
  for (const n of listar().sort()) {
    const m = /^fund-([A-Z0-9-]+)\.json$/.exec(n);
    if (!m || n === 'fund-index.json') continue;
    try { empresas[m[1]] = resumenDe(JSON.parse(leer(n))); } catch (_) { /* archivo ilegible: queda fuera del índice */ }
  }
  const indice = jsonEstable({ v: 1, empresas });
  if (leer('fund-index.json') !== indice) escribir('fund-index.json', indice);
  return resultado;
}

async function main(argv, env) {
  const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const dir = arg('--datos');
  if (!dir || !fs.existsSync(dir)) throw new Error('Falta --datos <carpeta del repo de datos>.');
  const ua = env.SEC_USER_AGENT;
  if (!ua || !/\S+@\S+|\S+\s+\S+/.test(ua)) throw new Error('Falta el secret SEC_USER_AGENT (la SEC exige un User-Agent con nombre y contacto, ej. "Centro de Mando tu@mail.com").');
  let tickers = null;
  const t = (arg('--tickers') || '').trim();
  if (t) {
    tickers = t.split(',').map(x => Calc.normalizarTicker(x)).filter(Boolean);
    if (!tickers.length) throw new Error('--tickers no trae ningún ticker válido.');
  }
  const leer = n => { try { return fs.readFileSync(path.join(dir, n), 'utf8'); } catch (_) { return null; } };
  const escribir = (n, txt) => fs.writeFileSync(path.join(dir, n), txt);
  const listar = () => fs.readdirSync(dir);
  const r = await procesar({ tickers, fetchJson: crearFetchJson(ua), leer, escribir, listar, log: m => console.log(m) });
  console.log(`Listo: ${r.ok.length} ok, ${r.noSec.length} no presentan en la SEC, ${r.sinDatos.length} sin datos legibles, ${r.fallidos.length} fallidas, ${r.sinCambios.length} sin cambios.`);
  if (r.fallidos.length) console.log(`::warning::No se pudieron actualizar: ${r.fallidos.join(', ')}`);
}

if (require.main === module) main(process.argv.slice(2), process.env).catch(e => { console.error('::error::' + e.message); process.exit(1); });
module.exports = { procesar, crearFetchJson, resumenDe, urlFacts, main };
