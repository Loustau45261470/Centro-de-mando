#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════════════
// Radar v2 — DESCARGA de comunicados (y presentaciones) desde la SEC. Genérico: no lista ningún ticker; las empresas salen de
// radar-config.json y la cola de comunicados/estado.json del repo de datos (--datos).
//
// Por qué existe: la routine que EXTRAE los KPIs corre en un entorno sin acceso a sec.gov ni a los sitios IR (proxy 403). GitHub
// Actions sí llega a la SEC. Entonces se separa: este script (con red) deja el TEXTO de cada comunicado en el repo de datos y la
// routine (sin red) lee solo ese texto.
//
//   node comunicados-descarga.js --datos <carpeta> [--max-backfill 12] [--tickers A,B] [--hoy YYYY-MM-DD]
//   env SEC_USER_AGENT   obligatorio ("Nombre contacto@dominio"; la SEC bloquea los pedidos sin contacto real). Mismo secret del job de datos.
//
// Qué descarga (pares empresa-trimestre):
//   · NUEVOS: el trimestre siguiente al más reciente conocido, cuando ya pasó su cierre + 14 días, aún no está procesado y
//             mercado-<T>.json no dice que sus resultados son futuros.
//   · BACKFILL: los primeros N de cola_backfill (estado.json) sin fuente descargada.
//   · KPI NUEVO: trimestres ya procesados (los 4 más recientes de cada empresa) a los que les falta algún KPI que radar-config.json
//                agregó después; la routine los completa con --merge leyendo la fuente descargada.
// Para cada par ubica en EDGAR el 8-K (Item 2.02) o 6-K del trimestre y guarda en  comunicados/fuentes/<T>/<trimestre>/:
//   comunicado.txt     exhibit 99.1 (o el 6-K que ES el comunicado, en emisores extranjeros), HTML → texto plano
//   presentacion.txt   exhibit 99.2/99.3 (presentación, carta, commentary) si existen; separados por «=== EX-99.x ===»
//   meta.json          { estado:'ok', url, filing, fecha, exhibit, bytes, presentacion? }  — o { estado:'error', error, intentos, ultimo_intento }
// Texto: las filas de tabla quedan una por línea y las celdas separadas por « | » (igual que comunicados/fuentes.js texto, así
// `fuentes.js citas` sigue funcionando). No se bajan PDF: EDGAR solo acepta HTML/ASCII como documento oficial (los PDF son copias
// no oficiales), por eso no hace falta ninguna dependencia de PDF. Sin dependencias; Node ≥ 18.
// Lo ya descargado no se vuelve a bajar. Un par que falla no corta el resto: se anota en su meta.json y se reintenta con espera.
// ════════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const MIN_ENTRE_PEDIDOS_MS = 120; // ≤ 10 pedidos/s a la SEC
const MAX_DOC_BYTES = 12e6;
const MAX_6K_PRINCIPAL = 1.5e6; // un 6-K enorme es el balance (estados financieros), no el comunicado
const VENTANA_DIAS = 110; // la presentación de resultados llega entre el cierre y ~3,5 meses después
const INTENTOS_ANTES_DE_ESPERAR = 3;
const ESPERA_DIAS = 7;

const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dormirReal = ms => new Promise(r => setTimeout(r, ms));

// ── Fechas ──────────────────────────────────────────────────────────────────
const aFecha = s => new Date(s + 'T00:00:00.000Z');
const aISO = d => d.toISOString().slice(0, 10);
const sumarDias = (s, n) => aISO(new Date(aFecha(s).getTime() + n * 864e5));
function esFinDeMes(s) { const d = aFecha(s); return new Date(d.getTime() + 864e5).getUTCDate() === 1; }
function sumarMeses3(s) {
  const d = aFecha(s), y = d.getUTCFullYear(), m = d.getUTCMonth();
  return esFinDeMes(s) ? aISO(new Date(Date.UTC(y, m + 4, 0))) : aISO(new Date(Date.UTC(y, m + 3, d.getUTCDate())));
}
// Trimestre siguiente: etiqueta fiscal "<año>-Q<n>" (Q4 → Q1 del año siguiente) y cierre +3 meses (aproximado si no era fin de mes:
// sirve solo para ubicar la ventana de búsqueda; manda lo que diga el comunicado).
function siguienteTrimestre({ trimestre, fecha_fin }) {
  const m = /^(\d{4})-Q([1-4])$/.exec(trimestre);
  if (!m) return null;
  const y = Number(m[1]), q = Number(m[2]);
  return { trimestre: q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`, fecha_fin: sumarMeses3(fecha_fin) };
}

// ── HTML → texto ────────────────────────────────────────────────────────────
// Letras con tilde que los comunicados traen como entidad con nombre (S&atilde;o Paulo, Cr&eacute;dito…); distingue mayúsculas.
const ACENTOS = 'Agrave:À Aacute:Á Acirc:Â Atilde:Ã Auml:Ä Aring:Å Ccedil:Ç Egrave:È Eacute:É Ecirc:Ê Euml:Ë Igrave:Ì Iacute:Í Icirc:Î Iuml:Ï Ntilde:Ñ Ograve:Ò Oacute:Ó Ocirc:Ô Otilde:Õ Ouml:Ö Ugrave:Ù Uacute:Ú Ucirc:Û Uuml:Ü ' +
  'agrave:à aacute:á acirc:â atilde:ã auml:ä aring:å ccedil:ç egrave:è eacute:é ecirc:ê euml:ë igrave:ì iacute:í icirc:î iuml:ï ntilde:ñ ograve:ò oacute:ó ocirc:ô otilde:õ ouml:ö ugrave:ù uacute:ú ucirc:û uuml:ü';
const ENTIDADES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', bull: '•', hellip: '...', reg: '®', copy: '©', trade: '™', euro: '€', pound: '£' };
for (const par of ACENTOS.split(' ')) { const [n, c] = par.split(':'); ENTIDADES[n] = c; }
function decodificar(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ' '; } })
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (_) { return ' '; } })
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTIDADES ? ENTIDADES[n] : n.toLowerCase() in ENTIDADES ? ENTIDADES[n.toLowerCase()] : m));
}
const limpiarCelda = s => decodificar(s.replace(/<[^>]+>/g, ' ')).replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();

// Una fila <tr> → una línea con las celdas no vacías separadas por " | ". Los símbolos sueltos que los comunicados parten en celdas
// propias ("$" antes del número; "%" o ")" después) se pegan a su número para que la cita copiada coincida con el documento.
function filaATexto(trHtml) {
  const celdas = [...trHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)(?=<\/t[dh]>|<t[dh][\s>]|$)/gi)].map(m => limpiarCelda(m[1])).filter(Boolean);
  const out = [];
  for (let i = 0; i < celdas.length; i++) {
    const c = celdas[i];
    if (/^[$€£]$/.test(c) && i + 1 < celdas.length) { celdas[i + 1] = c + celdas[i + 1]; continue; }
    if (/^[%)]+$/.test(c) && out.length) { out[out.length - 1] += c; continue; }
    out.push(c);
  }
  return out.join(' | ');
}

function htmlATexto(html) {
  let h = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ') // los saltos de línea del código fuente no son saltos del texto
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, '')
    .replace(/<(div|span|p)[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Tablas: cada <tr> pasa a una línea ya armada (marcada con \u0001 para no mezclarse con el resto del procesamiento).
  h = h.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, tr) => { const l = filaATexto(tr); return l ? '\n\u0001' + l + '\n' : '\n'; });
  h = h
    // cartas/presentaciones armadas como una imagen por página con el texto de la página oculto debajo: la imagen dice qué página es
    .replace(/<img[^>]*title="slide\s*(\d+)"[^>]*>/gi, (_, n) => `\n[slide ${n}]\n`)
    .replace(/<\/(p|div|h\d|li|table|section|article|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const lineas = decodificar(h).split('\n').map(l => {
    const esFila = l.startsWith('\u0001');
    l = l.replace(/\u0001/g, '').replace(/[   ]/g, ' ');
    return esFila ? l.trim() : l.replace(/[ \t]+/g, ' ').trim();
  }).filter(Boolean);
  return lineas.join('\n') + '\n';
}

// ── Índice de un 8-K/6-K en EDGAR (-index.htm) ──────────────────────────────
// Devuelve [{ tipo: 'EX-99.1', nombre, ruta, size }] con las filas de "Document Format Files".
function parsearIndice(html, base) {
  const docs = [];
  for (const m of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
    if (tds.length < 4) continue;
    const a = /<a[^>]+href="([^"]+)"/i.exec(tds[2]);
    if (!a) continue;
    const tipo = limpiarCelda(tds[3]);
    if (!tipo) continue;
    const ruta = (/\/Archives\/[^"?#]+/.exec(a[1]) || [])[0];
    if (!ruta) continue;
    docs.push({ tipo, nombre: ruta.split('/').pop(), url: base + ruta, size: Number(limpiarCelda(tds[4] || '')) || 0 });
  }
  return docs;
}

const esTextoDoc = d => /\.(htm|html|txt)$/i.test(d.nombre);
const esEx99 = d => /^EX-99(\.\d+)?$/i.test(d.tipo);
const numEx99 = d => Number((/\.(\d+)$/.exec(d.tipo) || [0, 1])[1]);

// ── Decidir si un texto ES el comunicado de resultados del trimestre pedido ─────
function marcadorPeriodo(texto, fechaFin) {
  const d = aFecha(fechaFin), mes = MESES[d.getUTCMonth()], y = d.getUTCFullYear();
  return new RegExp(`${mes}\\s+\\d{1,2}\\s*,?\\s*${y}`, 'i').test(texto) || new RegExp(`${mes}\\s+${y}`, 'i').test(texto);
}
function esComunicado(texto, par) {
  if (texto.length < 2500) return false;
  const ini = texto.slice(0, 600);
  if (/financial statements/i.test(ini) && !/results/i.test(ini)) return false; // los 6-K de balances no son el comunicado
  return /results|earnings/i.test(texto.slice(0, 4000)) && /quarter|three months/i.test(texto) && marcadorPeriodo(texto, par.fecha_fin);
}
const pareceSuplemento = texto => /presentation|supplement|shareholder|investor deck|earnings call/i.test(texto.slice(0, 1500));

// ── Selección de pares pendientes (pura) ────────────────────────────────────
// ctx: { tickers[], estado, kpis:{T:{trimestres:{q:{fecha_fin,kpis}}}}, esperados:{T:[kpi_id]}, mercadoFecha:{T:'YYYY-MM-DD'|null}, meta:(T,q)=>obj|null, hoy, maxBackfill }
function enEspera(meta, hoy) {
  return !!(meta && meta.estado === 'error' && (meta.intentos || 0) >= INTENTOS_ANTES_DE_ESPERAR && meta.ultimo_intento && sumarDias(meta.ultimo_intento, ESPERA_DIAS) > hoy);
}
function seleccionarPares(ctx) {
  const { tickers, estado, kpis = {}, esperados = {}, mercadoFecha = {}, meta, hoy, maxBackfill = 12 } = ctx;
  const cola = (estado && estado.cola_backfill) || [];
  const procesados = (estado && estado.procesados) || {};
  const hecho = (t, q) => { const m = meta(t, q); return !!(m && m.estado === 'ok'); };
  const nuevos = [];
  for (const t of tickers) {
    const conocidos = cola.filter(p => p.ticker === t).map(p => ({ trimestre: p.trimestre, fecha_fin: p.fecha_fin }));
    const tri = (kpis[t] && kpis[t].trimestres) || {};
    for (const q of Object.keys(tri)) conocidos.push({ trimestre: q, fecha_fin: tri[q].fecha_fin });
    const validos = conocidos.filter(c => c.fecha_fin && /^\d{4}-\d\d-\d\d$/.test(c.fecha_fin));
    if (!validos.length) continue;
    const ultimo = validos.reduce((a, b) => (b.fecha_fin > a.fecha_fin ? b : a));
    const sig = siguienteTrimestre(ultimo);
    if (!sig) continue;
    if ((procesados[t] || []).includes(sig.trimestre) || hecho(t, sig.trimestre) || enEspera(meta(t, sig.trimestre), hoy)) continue;
    if (sumarDias(sig.fecha_fin, 14) > hoy) continue; // todavía no pudo haber presentado
    const f = mercadoFecha[t];
    if (f && f > hoy && f <= sumarDias(sig.fecha_fin, 120)) continue; // la fecha de ESE resultado todavía es futura
    nuevos.push({ ticker: t, trimestre: sig.trimestre, fecha_fin: sig.fecha_fin, origen: 'nuevo' });
  }
  const kpiNuevos = [];
  for (const t of tickers) {
    const tri = (kpis[t] && kpis[t].trimestres) || {}, ids = esperados[t] || [];
    const recientes = Object.keys(tri).sort((a, b) => String(tri[b].fecha_fin).localeCompare(String(tri[a].fecha_fin))).slice(0, 4);
    for (const q of recientes) {
      const tiene = (tri[q] && tri[q].kpis) || {};
      if (!ids.some(id => !(id in tiene)) || hecho(t, q) || enEspera(meta(t, q), hoy)) continue;
      kpiNuevos.push({ ticker: t, trimestre: q, fecha_fin: tri[q].fecha_fin, origen: 'kpi_nuevo' });
    }
  }
  const backfill = [];
  for (const p of cola) {
    if (backfill.length >= maxBackfill) break;
    if (!tickers.includes(p.ticker)) continue;
    if ((procesados[p.ticker] || []).includes(p.trimestre) || hecho(p.ticker, p.trimestre) || enEspera(meta(p.ticker, p.trimestre), hoy)) continue;
    backfill.push({ ticker: p.ticker, trimestre: p.trimestre, fecha_fin: p.fecha_fin, origen: 'backfill' });
  }
  return nuevos.concat(kpiNuevos, backfill);
}

// ── Cliente de la SEC (con límite de ritmo, reintentos y caché) ─────────────
function crearSec({ userAgent, fetchFn = fetch, dormir = dormirReal, intervalo = MIN_ENTRE_PEDIDOS_MS, reintentos = 3 }) {
  if (!userAgent || !/\S+@\S+|\S+\s+\S+/.test(userAgent)) throw new Error('Falta SEC_USER_AGENT (nombre + mail de contacto): la SEC bloquea los pedidos sin él.');
  let ultimo = 0;
  const cache = new Map();
  async function pedir(url) {
    let err;
    for (let i = 0; i < reintentos; i++) {
      const espera = ultimo + intervalo - Date.now();
      if (espera > 0) await dormir(espera);
      ultimo = Date.now();
      try {
        const res = await fetchFn(url, { headers: { 'User-Agent': userAgent, Accept: '*/*' }, redirect: 'follow' });
        if (res.status === 429 || res.status >= 500) { err = new Error('HTTP ' + res.status + ' en ' + url); await dormir(1500 * (i + 1)); continue; }
        if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status + ' en ' + url), { definitivo: true });
        return res;
      } catch (e) { err = e; if (e.definitivo) throw e; await dormir(1000 * (i + 1)); }
    }
    throw err || new Error('sin respuesta: ' + url);
  }
  const memo = (clave, fn) => { if (!cache.has(clave)) cache.set(clave, fn().catch(e => { cache.delete(clave); throw e; })); return cache.get(clave); };
  const sec = {
    json: url => memo('j:' + url, async () => (await pedir(url)).json()),
    texto: url => memo('t:' + url, async () => (await pedir(url)).text()),
    async cik(ticker) {
      const tk = await sec.json('https://www.sec.gov/files/company_tickers.json');
      const f = Object.values(tk).find(x => String(x.ticker).toUpperCase() === ticker.toUpperCase());
      if (!f) throw new Error(`La SEC no conoce el ticker ${ticker}`);
      return String(f.cik_str).padStart(10, '0');
    },
    // 8-K con Item 2.02 y 6-K presentados entre desde y hasta (YYYY-MM-DD), de más viejo a más nuevo.
    async filings(cik, desde, hasta) {
      const sub = await sec.json(`https://data.sec.gov/submissions/CIK${cik}.json`);
      const bloques = [sub.filings.recent];
      for (const f of sub.filings.files || []) { // las presentaciones viejas están en archivos aparte
        if (f.filingTo && f.filingTo < desde) continue;
        if (f.filingFrom && f.filingFrom > hasta) continue;
        bloques.push(await sec.json('https://data.sec.gov/submissions/' + f.name));
      }
      const filas = [];
      for (const r of bloques) {
        for (let i = 0; i < r.form.length; i++) {
          const forma = r.form[i], items = (r.items && r.items[i]) || '', f = r.filingDate[i];
          if (!(forma === '6-K' || (forma === '8-K' && /(^|,)2\.02(,|$)/.test(items)))) continue;
          if (f < desde || f > hasta) continue;
          filas.push({ fecha: f, forma, acc: r.accessionNumber[i] });
        }
      }
      return filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.acc.localeCompare(b.acc));
    },
    async documentos(cik, acc) {
      const carpeta = `/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, '')}/`;
      return parsearIndice(await sec.texto(`https://www.sec.gov${carpeta}${acc}-index.htm`), 'https://www.sec.gov');
    },
    async documentoATexto(doc) {
      const res = await pedir(doc.url);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_DOC_BYTES) throw new Error(`documento demasiado grande (${buf.length} bytes): ${doc.url}`);
      return { texto: htmlATexto(buf.toString('utf8')), bytes: buf.length };
    },
  };
  return sec;
}

const noEncontrado = m => Object.assign(new Error(m), { noEncontrado: true });

// ── Un par: ubicar y bajar ──────────────────────────────────────────────────
// Devuelve { comunicado:{texto,url,exhibit,bytes}, presentacion:{texto,exhibits:[{url,exhibit,bytes}]}|null, filing:{acc,fecha,forma} }
async function bajarPar(par, sec, cik) {
  const desde = sumarDias(par.fecha_fin, 1), hasta = sumarDias(par.fecha_fin, VENTANA_DIAS);
  const filings = await sec.filings(cik, desde, hasta);
  if (!filings.length) throw noEncontrado(`sin 8-K (Item 2.02) ni 6-K presentados entre ${desde} y ${hasta}`);
  const leidos = new Map(); // url → {texto, bytes}
  const leer = async d => { if (!leidos.has(d.url)) leidos.set(d.url, await sec.documentoATexto(d)); return leidos.get(d.url); };

  for (const f of filings) {
    let docs;
    try { docs = await sec.documentos(cik, f.acc); } catch (_) { continue; }
    const ex99 = docs.filter(d => esEx99(d) && esTextoDoc(d)).sort((a, b) => numEx99(a) - numEx99(b));
    // candidatos a comunicado: EX-99.1 / EX-99; si el filing no trae anexos (6-K), el documento principal
    let cands = ex99.filter(d => numEx99(d) === 1).slice(0, 1);
    if (!cands.length && f.forma === '6-K' && !ex99.length) cands = docs.filter(d => /^6-K$/i.test(d.tipo) && esTextoDoc(d) && d.size <= MAX_6K_PRINCIPAL);
    for (const c of cands) {
      let r;
      try { r = await leer(c); } catch (_) { continue; }
      if (!esComunicado(r.texto, par)) continue;
      // Presentación / carta / commentary: EX-99.2+ del mismo filing; en 6-K sin anexos, otros 6-K del mismo día que parezcan una presentación.
      const supl = [];
      for (const d of ex99.filter(d => numEx99(d) >= 2)) {
        try { const t = await leer(d); if (t.texto.length > 200) supl.push({ doc: d, ...t }); } catch (_) { /* un anexo ilegible no tira el par */ }
      }
      if (!supl.length && !ex99.length) {
        for (const g of filings.filter(g => g.fecha === f.fecha && g.acc !== f.acc)) {
          let dg; try { dg = await sec.documentos(cik, g.acc); } catch (_) { continue; }
          for (const d of dg.filter(d => /^6-K$/i.test(d.tipo) && esTextoDoc(d) && d.size <= MAX_6K_PRINCIPAL)) {
            try { const t = await leer(d); if (pareceSuplemento(t.texto) && !esComunicado(t.texto, par) && t.texto.length > 600) supl.push({ doc: d, ...t }); } catch (_) { /* idem */ }
          }
        }
      }
      return {
        comunicado: { texto: r.texto, url: c.url, exhibit: c.tipo, bytes: r.bytes },
        presentacion: supl.length ? { texto: supl.map(s => `=== ${s.doc.tipo} ${s.doc.url} ===\n${s.texto}`).join('\n'), exhibits: supl.map(s => ({ url: s.doc.url, exhibit: s.doc.tipo, bytes: s.bytes })) } : null,
        filing: { acc: f.acc, fecha: f.fecha, forma: f.forma },
      };
    }
  }
  throw noEncontrado(`no se encontró el comunicado de resultados de ${par.fecha_fin} entre ${filings.length} presentaciones (${desde} a ${hasta})`);
}

// ── Disco ───────────────────────────────────────────────────────────────────
const carpetaPar = (dir, t, q) => path.join(dir, 'comunicados', 'fuentes', t, q);
function leerMeta(dir, t, q) { try { return JSON.parse(fs.readFileSync(path.join(carpetaPar(dir, t, q), 'meta.json'), 'utf8')); } catch (_) { return null; } }
function escribir(dir, par, r, ahora) {
  const c = carpetaPar(dir, par.ticker, par.trimestre);
  fs.mkdirSync(c, { recursive: true });
  const meta = { estado: 'ok', ticker: par.ticker, trimestre: par.trimestre, url: r.comunicado.url, filing: r.filing.acc, forma: r.filing.forma, fecha: r.filing.fecha, exhibit: r.comunicado.exhibit, bytes: r.comunicado.bytes, descargado: ahora };
  fs.writeFileSync(path.join(c, 'comunicado.txt'), r.comunicado.texto);
  if (r.presentacion) {
    fs.writeFileSync(path.join(c, 'presentacion.txt'), r.presentacion.texto);
    meta.presentacion = { archivos: r.presentacion.exhibits, bytes: r.presentacion.exhibits.reduce((a, e) => a + e.bytes, 0) };
  } else { try { fs.unlinkSync(path.join(c, 'presentacion.txt')); } catch (_) { /* no existía */ } }
  fs.writeFileSync(path.join(c, 'meta.json'), JSON.stringify(meta, null, 1) + '\n'); // al final: meta ok = par completo
}
function escribirError(dir, par, mensaje, hoy) {
  const previo = leerMeta(dir, par.ticker, par.trimestre);
  const c = carpetaPar(dir, par.ticker, par.trimestre);
  fs.mkdirSync(c, { recursive: true });
  const meta = { estado: 'error', ticker: par.ticker, trimestre: par.trimestre, error: mensaje, intentos: ((previo && previo.intentos) || 0) + 1, ultimo_intento: hoy };
  fs.writeFileSync(path.join(c, 'meta.json'), JSON.stringify(meta, null, 1) + '\n');
}

// ── main ────────────────────────────────────────────────────────────────────
async function correr({ dir, env = process.env, argv = [], sec, log = console.log, hoy, ahora }) {
  const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const leer = n => { try { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch (_) { return null; } };
  const config = leer('radar-config.json');
  if (!config || !Array.isArray(config.empresas)) throw new Error('No se pudo leer radar-config.json en ' + dir);
  const estado = leer('comunicados/estado.json') || { cola_backfill: [], procesados: {} };
  let tickers = config.empresas.map(e => e.ticker);
  if (arg('--tickers')) { const s = arg('--tickers').split(',').map(x => x.trim().toUpperCase()).filter(Boolean); tickers = tickers.filter(t => s.includes(t)); }
  const kpis = {}, mercadoFecha = {}, esperados = {};
  for (const t of tickers) {
    const emp = config.empresas.find(e => e.ticker === t);
    esperados[t] = (config.kpis_generales || []).filter(k => k.fuente === 'comunicado').map(k => k.id).concat(((emp && emp.kpis_especificos) || []).map(k => k.id));
    kpis[t] = leer(`kpis-${t}.json`);
    const m = leer(`mercado-${t}.json`);
    mercadoFecha[t] = (m && m.proximos_resultados && m.proximos_resultados.valor && m.proximos_resultados.valor.fecha) || null;
  }
  const maxBackfill = Number(arg('--max-backfill')) || 12;
  const pares = seleccionarPares({ tickers, estado, kpis, esperados, mercadoFecha, meta: (t, q) => leerMeta(dir, t, q), hoy, maxBackfill });
  const cuenta = o => pares.filter(p => p.origen === o).length;
  log(`Pares a descargar: ${pares.length} (${cuenta('nuevo')} nuevos, ${cuenta('kpi_nuevo')} con KPI nuevo, ${cuenta('backfill')} de la cola)`);
  const resumen = { ok: [], error: [] };
  for (const par of pares) {
    const etiqueta = `${par.ticker} ${par.trimestre}`;
    try {
      const cik = await sec.cik(par.ticker);
      const r = await bajarPar(par, sec, cik);
      escribir(dir, par, r, ahora);
      resumen.ok.push(etiqueta);
      log(`OK     ${etiqueta}  ${r.filing.forma} ${r.filing.fecha}  ${r.comunicado.exhibit}  ${r.comunicado.bytes} bytes${r.presentacion ? '  + presentación (' + r.presentacion.exhibits.length + ')' : ''}`);
    } catch (e) {
      // el comunicado de un trimestre NUEVO que todavía no salió no es un error que valga la pena registrar (se prueba de nuevo mañana)
      if (par.origen === 'nuevo' && e.noEncontrado && hoy <= sumarDias(par.fecha_fin, VENTANA_DIAS)) { log(`ESPERA ${etiqueta}  ${e.message}`); continue; }
      escribirError(dir, par, e.message, hoy);
      resumen.error.push(etiqueta);
      log(`ERROR  ${etiqueta}  ${e.message}`);
    }
  }
  log(`Listo: ${resumen.ok.length} descargados, ${resumen.error.length} con error.`);
  return resumen;
}

async function main(argv, env = process.env) {
  const i = argv.indexOf('--datos');
  const dir = i >= 0 ? argv[i + 1] : null;
  if (!dir || !fs.existsSync(dir)) throw new Error('Falta --datos <carpeta del repo de datos>.');
  const sec = crearSec({ userAgent: env.SEC_USER_AGENT });
  const j = argv.indexOf('--hoy');
  const ahoraD = new Date();
  await correr({ dir: path.resolve(dir), env, argv, sec, hoy: j >= 0 ? argv[j + 1] : aISO(ahoraD), ahora: ahoraD.toISOString().replace(/\.\d+Z$/, 'Z') });
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
module.exports = { htmlATexto, parsearIndice, siguienteTrimestre, seleccionarPares, esComunicado, crearSec, bajarPar, correr, enEspera };
