#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════════════
// Radar v2 — EXTRACCIÓN de KPIs de comunicados con la API de Google Gemini (nivel gratuito). Genérico: no lista ningún ticker; las
// empresas, los KPIs y la cola salen de radar-config.json y comunicados/estado.json del repo de datos (--datos).
//
// Qué es: la versión «script determinístico» de la rutina descripta en comunicados/INSTRUCCIONES.md (secciones B «trimestres nuevos»
// y D «carga histórica»). Corre en GitHub Actions después de comunicados-descarga y le pide a Gemini UN objeto JSON por par
// empresa-trimestre leyendo el texto ya descargado en comunicados/fuentes/. La rutina de Claude queda como respaldo: las reglas de
// extracción son las MISMAS (este script lee INSTRUCCIONES.md y esquema.md en cada corrida y se las pasa al modelo; si se editan,
// la próxima corrida las aplica sola).
//
//   node comunicados-extraer.js --datos <carpeta> [--max N] [--tickers A,B] [--modelo id] [--dry-run]
//   env GEMINI_API_KEY        obligatoria salvo --dry-run. Va SOLO en el header x-goog-api-key; nunca se imprime ni se escribe.
//   env GEMINI_MODEL          modelo (por defecto gemini-3.8-flash; --modelo gana sobre la variable).
//   env GEMINI_MODEL_RESPALDO modelo al que se pasa si el principal agota su cupo diario (por defecto gemini-3.6-flash; vacío = ninguno).
//   env GEMINI_RPM            pedidos por minuto como máximo (por defecto 5: el nivel gratuito ya no publica sus cupos en la doc).
//
// Qué procesa (máx. N por grupo, N = 6 por defecto, el mismo tope que INSTRUCCIONES.md):
//   1. NUEVOS: trimestres con fuente descargada (meta.json estado «ok»), que no están en procesados[T] ni en cola_backfill.
//   2. BACKFILL: los primeros N de cola_backfill con fuente descargada, respetando el orden de la cola.
// Por par: prompt (reglas + esquema + KPIs de la config + fuentes + trimestre anterior para los derivados) → JSON → post-proceso
// determinístico (todos los kpi_id y ninguno de más; cada cita comprobada con la MISMA normalización que `fuentes.js citas`; citas
// largas recortadas; un reintento solo para los KPIs que fallan; lo que sigue mal pasa a null con motivo) → guardar.js (`aplicar`),
// que valida antes de escribir. Un par que no pasa la validación NO se guarda y queda anotado en estado.json → errores.
//
// Cupo: ante 429 espera el retryDelay que indica la respuesta (hasta 3 veces); si el cupo DIARIO del modelo se agotó pasa al modelo
// de respaldo; si persiste corta la corrida limpia (lo guardado hasta ahí queda: cada par se escribe apenas termina).
// Sin dependencias; Node ≥ 18 (fetch nativo).
// ════════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const MODELO_DEFECTO = 'gemini-3.8-flash';
const MODELO_RESPALDO = 'gemini-3.6-flash';
const URL_API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const RPM_DEFECTO = 5;
const MAX_PARES_DEFECTO = 6;
const MAX_CITA = 200;
const MAX_TOKENS_SALIDA = 32768;
const REINTENTOS_429 = 3;
const REINTENTOS_RED = 2;
const ESPERA_MAX_MS = 120000; // un retryDelay más largo que esto se trata como cupo agotado
const ESPERA_429_DEFECTO_MS = 60000;
const TIMEOUT_MS = 300000;
const PREFIJO_ERROR = 'extracción Gemini: ';
// Secciones de INSTRUCCIONES.md que se le pasan al modelo (por el comienzo del título). Lo de git, push y herramientas del repo no va.
const SECCIONES_INSTRUCCIONES = [
  '## Reglas que no se negocian',
  '### Qué hay descargado',
  '## Procedimiento por par',
  '## Cómo escribir cada tipo de valor',
  '## Calendarios fiscales',
  '## Errores y casos borde',
];

const dormirReal = ms => new Promise(r => setTimeout(r, ms));
const esObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const esTexto = v => typeof v === 'string' && v.trim().length > 0;
const esUrl = v => { try { return /^https?:$/.test(new URL(v).protocol); } catch (_) { return false; } };
const json = o => JSON.stringify(o, null, 1) + '\n';
const aISO = d => d.toISOString().slice(0, 10);
const fechaReal = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && aISO(new Date(s + 'T00:00:00Z')) === s;
const diasEntre = (a, b) => Math.abs(new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5;

// ── La clave nunca sale ─────────────────────────────────────────────────────
// Reemplaza la clave (y cualquier cosa con forma de clave de Google) en todo texto que se imprime o se escribe en estado.json.
function crearRedactor(clave) {
  return s => {
    let t = String(s);
    if (clave) t = t.split(clave).join('[clave]');
    return t.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[clave]');
  };
}

// ── INSTRUCCIONES.md → secciones ────────────────────────────────────────────
// Una sección va desde su título hasta el siguiente título del mismo nivel o superior.
function extraerSecciones(md, titulos) {
  const lineas = String(md).split('\n');
  const nivel = l => { const m = /^(#{1,6}) /.exec(l); return m ? m[1].length : 0; };
  const partes = [], faltan = [];
  for (const t of titulos) {
    const i = lineas.findIndex(l => nivel(l) && l.replace(/^#+ /, '').startsWith(t.replace(/^#+ /, '')));
    if (i < 0) { faltan.push(t); continue; }
    let j = i + 1;
    while (j < lineas.length && !(nivel(lineas[j]) && nivel(lineas[j]) <= nivel(lineas[i]))) j++;
    partes.push(lineas.slice(i, j).join('\n').trim());
  }
  return { texto: partes.join('\n\n'), faltan };
}

// ── Config: qué KPIs se extraen de cada empresa ─────────────────────────────
// Los de fuente «comunicado» de kpis_generales + los kpis_especificos (el específico gana si el id coincide).
function kpisEsperados(config, ticker) {
  const emp = (config.empresas || []).find(e => e.ticker === ticker);
  const mapa = new Map();
  const meta = k => ({ id: k.id, nombre: k.nombre || k.id, unidad: k.unidad, notas: k.notas || null });
  for (const k of config.kpis_generales || []) if (k.fuente === 'comunicado') mapa.set(k.id, meta(k));
  for (const k of (emp && emp.kpis_especificos) || []) mapa.set(k.id, meta(k));
  return [...mapa.values()];
}

// ── Selección de pares ──────────────────────────────────────────────────────
// fuentes: { T: ['2026-Q3', …] } (carpetas existentes); meta(T, q) → meta.json o null. Solo cuentan los pares con meta.estado «ok».
// Devuelve { pares, restantes }: primero los trimestres NUEVOS, después los primeros N de la cola (en el orden de la cola).
function seleccionarPares({ tickers, estado, kpis = {}, fuentes, meta, max = MAX_PARES_DEFECTO }) {
  const procesados = estado.procesados || {};
  const cola = estado.cola_backfill || [];
  const enCola = new Set(cola.map(p => p.ticker + ':' + p.trimestre));
  const guardado = (t, q) => Boolean(kpis[t] && kpis[t].trimestres && kpis[t].trimestres[q]);
  const ok = (t, q) => { const m = meta(t, q); return Boolean(m && m.estado === 'ok'); };
  const nuevos = [];
  for (const t of tickers) {
    for (const q of [...(fuentes[t] || [])].sort()) {
      if (!ok(t, q) || (procesados[t] || []).includes(q) || enCola.has(t + ':' + q) || guardado(t, q)) continue;
      nuevos.push({ ticker: t, trimestre: q, fecha_fin: null, origen: 'nuevo' });
    }
  }
  const historicos = cola.filter(p => tickers.includes(p.ticker) && ok(p.ticker, p.trimestre) && !guardado(p.ticker, p.trimestre));
  const elegidosHist = historicos.slice(0, max).map(p => ({ ticker: p.ticker, trimestre: p.trimestre, fecha_fin: p.fecha_fin, origen: 'backfill' }));
  const elegidosNuevos = nuevos.slice(0, max);
  return {
    pares: elegidosNuevos.concat(elegidosHist),
    restantes: { nuevos: nuevos.length - elegidosNuevos.length, cola_con_fuente: historicos.length - elegidosHist.length, cola_total: cola.length },
  };
}

// fecha_fin de un trimestre NUEVO (no está en la cola): se avanza de a un trimestre desde el último guardado de la empresa con la
// misma regla que la descarga. Es una estimación (hay empresas que cierran en domingo): sirve para el prompt y para desconfiar de una fecha absurda.
let _siguiente;
function siguienteTrimestre(p) {
  if (_siguiente === undefined) { try { _siguiente = require('./comunicados-descarga.js').siguienteTrimestre; } catch (_) { _siguiente = null; } }
  return _siguiente ? _siguiente(p) : null;
}
function estimarFechaFin(kpisT, trimestre) {
  const lista = Object.entries((kpisT && kpisT.trimestres) || {}).map(([t, v]) => ({ trimestre: t, fecha_fin: v.fecha_fin }))
    .filter(x => fechaReal(x.fecha_fin)).sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin));
  let cur = lista[lista.length - 1];
  for (let i = 0; cur && i < 12; i++) {
    cur = siguienteTrimestre(cur);
    if (cur && cur.trimestre === trimestre) return cur.fecha_fin;
  }
  return null;
}
// Último trimestre ya guardado con cierre anterior a fechaFin: insumo de los derivados (tipo «calculo»).
function trimestreAnterior(kpisT, fechaFin) {
  if (!fechaFin || !kpisT || !kpisT.trimestres) return null;
  const c = Object.entries(kpisT.trimestres).filter(([, v]) => v.fecha_fin < fechaFin).sort((a, b) => b[1].fecha_fin.localeCompare(a[1].fecha_fin))[0];
  if (!c) return null;
  const kpis = {};
  for (const [id, k] of Object.entries(c[1].kpis || {})) {
    if (k.valor === null) continue;
    kpis[id] = { valor: k.valor, unidad: k.unidad };
    if (k.desglose) kpis[id].desglose = k.desglose;
  }
  return { trimestre: c[0], fecha_fin: c[1].fecha_fin, kpis };
}

// ── Prompt ──────────────────────────────────────────────────────────────────
const SISTEMA = `Sos un extractor de indicadores (KPIs) de comunicados trimestrales de resultados. No tenés herramientas, internet ni archivos: recibís el texto del comunicado (y de la presentación, si existe) y devolvés UN objeto JSON. Un script determinístico comprueba cada cita contra el texto, valida el formato y guarda; vos solo extraés.
Las reglas de abajo son el manual de la rutina de extracción, escrito para un agente con terminal: ignorá toda referencia a comandos, git, archivos, carpetas, herramientas, commits o validadores. Lo que aplica es cómo leer el texto, qué valor tomar, cómo expresarlo (unidades, textos, derivados, nulos) y cómo citar. Un número mal es peor que un número faltante: ante la duda, null con motivo.
Respondé SOLO con el objeto JSON (sin texto antes ni después y sin bloques de código).

`;

function construirPrompt({ par, empresa, esperados, esquema, instrucciones, meta, comunicado, presentacion, anterior, fechaFin }) {
  const urlsPres = ((meta.presentacion && meta.presentacion.archivos) || []).map(a => `${a.exhibit || 'anexo'}: ${a.url}`);
  const lineasKpi = esperados.map(k => `- ${k.id} | ${k.nombre} | unidad en la config: ${k.unidad}${k.notas ? ' | notas: ' + k.notas : ''}`);
  const ejemplo = esperados.slice(0, 2).map(k => `"${k.id}": {…}`).join(', ');
  const user = [
    '# Par a extraer',
    `Empresa: ${(empresa && empresa.nombre) || par.ticker} (${par.ticker})`,
    `Trimestre fiscal (etiqueta): ${par.trimestre}`,
    fechaFin ? `fecha_fin esperada: ${fechaFin} (confirmala con el comunicado; si el comunicado dice otra fecha de cierre, manda el comunicado)`
      : 'fecha_fin: no calculada; obtenela del comunicado y del calendario fiscal',
    `URL del comunicado (fuente.url de lo leído en comunicado.txt): ${meta.url}`,
    urlsPres.length ? `Anexos de presentacion.txt (fuente.url de lo leído ahí, con tipo "presentacion"):\n${urlsPres.map(u => '  ' + u).join('\n')}` : 'No hay presentacion.txt para este par.',
    '',
    '# Esquema de los datos (comunicados/esquema.md)',
    esquema.trim(),
    '',
    `# KPIs a extraer: TODOS los siguientes (${esperados.length}); ninguno se omite y no se agrega ninguno`,
    lineasKpi.join('\n'),
    '',
    anterior
      ? `# Trimestre anterior ya guardado (${anterior.trimestre}, cierre ${anterior.fecha_fin}) — solo para derivados de tipo "calculo"; no lo uses para otra cosa\n${JSON.stringify(anterior.kpis)}`
      : '# Trimestre anterior\nNo hay un trimestre anterior guardado: un derivado que lo necesite va en null con motivo "falta el trimestre anterior".',
    '',
    '# Formato de la respuesta',
    `Un solo objeto JSON: { "ticker": "${par.ticker}", "trimestre": "${par.trimestre}", "fecha_fin": "YYYY-MM-DD", "kpis": { ${ejemplo}, … } } con exactamente los ${esperados.length} kpi_id de arriba.`,
    'KPI con valor: { "valor", "unidad", "fuente": { "tipo", "url", "pagina_o_slide", "cita" }, "proxy"?, "nota"?, "desglose"? }.',
    `KPI sin dato: { "valor": null, "motivo": "<por qué>", "fuente": { "url": "${meta.url}" } }.`,
    `Cada cita: máximo ${MAX_CITA} caracteres, copiada TEXTUAL del texto de abajo (carácter por carácter, sin parafrasear ni traducir; si es una fila de tabla, la fila tal cual con sus " | "). Se comprueba con una herramienta.`,
    '',
    '# TEXTO: comunicado.txt',
    comunicado,
    presentacion ? '\n# TEXTO: presentacion.txt\n' + presentacion : '',
  ].join('\n');
  return { system: SISTEMA + instrucciones, user };
}

function construirReintento(user, problemas) {
  const lineas = Object.entries(problemas).map(([id, m]) => `- ${id}: ${m}`);
  return user + [
    '',
    '',
    '# CORRECCIÓN',
    'En tu respuesta anterior estos KPIs tuvieron problemas:',
    ...lineas,
    'Releé el texto y devolvé UN objeto JSON { "kpis": { … } } con SOLO esos KPIs, cada uno bien hecho (cita copiada textual del texto, formato del esquema) o con valor null y motivo si el texto no lo trae.',
  ].join('\n');
}

// ── Post-proceso determinístico ─────────────────────────────────────────────
// Deja solo las claves que admite el validador y la forma de un KPI «sin dato». fuente.url de un null es siempre el documento revisado.
function limpiarKpi(k, urlDoc) {
  const nulo = (motivo, nota) => { const o = { valor: null, motivo, fuente: { url: urlDoc } }; if (esTexto(nota)) o.nota = nota; return o; };
  if (!esObj(k)) return nulo('no informado: respuesta de extracción sin forma de KPI');
  if (k.valor === null || k.valor === undefined) return nulo(esTexto(k.motivo) ? k.motivo : 'no informado', k.nota);
  const f = esObj(k.fuente) ? k.fuente : {};
  const o = { valor: k.valor, unidad: k.unidad, fuente: { tipo: f.tipo, url: f.url, pagina_o_slide: f.pagina_o_slide, cita: f.cita } };
  for (const c of Object.keys(o.fuente)) if (o.fuente[c] === undefined) delete o.fuente[c];
  if (o.unidad === undefined) delete o.unidad;
  if (typeof k.proxy === 'boolean') o.proxy = k.proxy;
  if (esTexto(k.nota)) o.nota = k.nota;
  if (k.desglose !== undefined) o.desglose = k.desglose;
  return o;
}
// Todos los kpi_id esperados y ninguno extra. Lo que falta pasa a null; lo que sobra se descarta (y se cuenta).
function normalizarKpis(crudos, ids, urlDoc) {
  const src = esObj(crudos) ? crudos : {};
  const kpis = {}, faltantes = [];
  for (const id of ids) {
    if (!esObj(src[id])) { faltantes.push(id); kpis[id] = { valor: null, motivo: 'no informado: el KPI no vino en la respuesta de extracción', fuente: { url: urlDoc } }; }
    else kpis[id] = limpiarKpi(src[id], urlDoc);
  }
  return { kpis, faltantes, extras: Object.keys(src).filter(id => !ids.includes(id)) };
}

// Una cita de más de 200 caracteres pasa a un fragmento contiguo de ≤ 200, centrado en el valor si aparece, con bordes en palabra.
// Un fragmento de un texto textual sigue siendo textual; si la cita no lo era, el fragmento falla la comprobación igual que ella.
function recortarCita(cita, valor) {
  const c = String(cita).trim();
  if (c.length <= MAX_CITA) return c;
  const reps = typeof valor === 'number' ? [String(valor), valor.toLocaleString('en-US'), valor.toFixed(1), valor.toFixed(2)] : [];
  let ini = 0;
  for (const r of reps) { const i = c.indexOf(r); if (i >= 0) { ini = Math.max(0, i - Math.floor((MAX_CITA - r.length) / 2)); break; } }
  let fin = Math.min(c.length, ini + MAX_CITA);
  if (ini > 0 && !/\s/.test(c[ini - 1])) { const s = c.indexOf(' ', ini); if (s >= 0 && s < fin) ini = s + 1; }
  if (fin < c.length && !/\s/.test(c[fin])) { const s = c.lastIndexOf(' ', fin); if (s > ini) fin = s; }
  return c.slice(ini, fin).trim();
}

// Documentos contra los que se comprueban las citas: el comunicado y cada anexo de presentacion.txt (=== EX-99.x <url> ===).
function armarDocs({ comunicado, presentacion, meta, norm }) {
  const docs = [{ tipo: 'comunicado', url: meta.url, texto: norm(comunicado) }];
  if (presentacion) {
    const re = /^=== (\S+) (\S+) ===$/gm;
    const cortes = [...presentacion.matchAll(re)];
    if (!cortes.length) docs.push({ tipo: 'presentacion', url: ((meta.presentacion && meta.presentacion.archivos && meta.presentacion.archivos[0]) || {}).url || meta.url, texto: norm(presentacion) });
    cortes.forEach((m, i) => {
      const fin = i + 1 < cortes.length ? cortes[i + 1].index : presentacion.length;
      docs.push({ tipo: 'presentacion', url: m[2], texto: norm(presentacion.slice(m.index + m[0].length, fin)) });
    });
  }
  return docs;
}

// Comprueba las citas (la misma lógica que `fuentes.js citas`: norm() + inclusión; las de tipo calculo no se comprueban).
// Devuelve los KPIs ya corregidos (cita recortada; tipo y url de donde la cita realmente está) y los que fallan { id: motivo }.
function verificarCitas(kpis, docs, norm, urlDoc) {
  const out = {}, fallidos = {};
  for (const [id, k] of Object.entries(kpis)) {
    if (k.valor === null || !esObj(k.fuente)) { out[id] = k; continue; }
    const f = { ...k.fuente };
    if (f.tipo === 'calculo') {
      if (!esUrl(f.url)) f.url = urlDoc;
      if (typeof f.cita === 'string' && f.cita.length > MAX_CITA) f.cita = f.cita.slice(0, MAX_CITA);
      out[id] = { ...k, fuente: f };
      continue;
    }
    if (!esTexto(f.cita)) { fallidos[id] = 'falta la cita textual'; out[id] = k; continue; }
    f.cita = recortarCita(f.cita, k.valor);
    const cn = norm(f.cita);
    const hit = docs.find(d => d.tipo === f.tipo && d.url === f.url && d.texto.includes(cn)) || docs.find(d => d.texto.includes(cn));
    if (!hit) { fallidos[id] = `la cita «${f.cita}» no aparece textualmente en el comunicado ni en la presentación; copiala tal cual del texto`; out[id] = { ...k, fuente: f }; continue; }
    f.tipo = hit.tipo; f.url = hit.url;
    out[id] = { ...k, fuente: f };
  }
  return { kpis: out, fallidos };
}

const aNulo = (urlDoc, motivo) => ({ valor: null, motivo, fuente: { url: urlDoc } });

// ── Gemini ──────────────────────────────────────────────────────────────────
class ErrorGemini extends Error { constructor(msg, o = {}) { super(msg); Object.assign(this, o); } }

function esperaDeRetryDelay(d) {
  if (typeof d === 'string') { const m = /^([\d.]+)s$/.exec(d.trim()); return m ? Math.ceil(Number(m[1]) * 1000) : null; }
  if (esObj(d)) return Math.ceil((Number(d.seconds) || 0) * 1000 + (Number(d.nanos) || 0) / 1e6);
  return null;
}
// 429: cuánto esperar (retryDelay de details/RetryInfo, o «retry in Ns» del mensaje, o el header Retry-After) y si el cupo agotado es el DIARIO.
function interpretar429(cuerpo, headers) {
  let j = null; try { j = JSON.parse(cuerpo); } catch (_) { /* cuerpo no JSON */ }
  const err = (j && j.error) || {};
  const detalles = Array.isArray(err.details) ? err.details : [];
  let esperaMs = null;
  for (const d of detalles) if (esObj(d) && /RetryInfo/.test(d['@type'] || '') && d.retryDelay != null) esperaMs = esperaDeRetryDelay(d.retryDelay);
  if (esperaMs == null) { const m = /retry in ([\d.]+)\s*s/i.exec(err.message || cuerpo || ''); if (m) esperaMs = Math.ceil(Number(m[1]) * 1000); }
  if (esperaMs == null && headers && typeof headers.get === 'function') { const h = Number(headers.get('retry-after')); if (isFinite(h) && h > 0) esperaMs = h * 1000; }
  const texto = JSON.stringify(detalles) + ' ' + (err.message || '') + ' ' + (err.status || '') + ' ' + (err.code || '');
  return { esperaMs, diaria: /PerDay|per day|daily/i.test(texto), mensaje: err.message || '' };
}
function textoDeRespuesta(j) {
  const c = j && Array.isArray(j.candidates) ? j.candidates[0] : null;
  if (!c) throw new ErrorGemini('respuesta sin candidatos' + (j && j.promptFeedback ? ' (promptFeedback: ' + JSON.stringify(j.promptFeedback).slice(0, 200) + ')' : ''));
  const partes = (c.content && c.content.parts) || [];
  const texto = partes.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  if (c.finishReason === 'MAX_TOKENS') throw new ErrorGemini('respuesta cortada por MAX_TOKENS: el JSON quedó incompleto');
  if (!texto.trim()) throw new ErrorGemini('respuesta sin texto (finishReason ' + (c.finishReason || '?') + ')');
  return texto;
}
function parsearJson(texto) {
  const t = String(texto).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (_) { /* probar el tramo entre llaves */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { /* cae al error */ } }
  throw new ErrorGemini('la respuesta no es un JSON válido');
}

// Cliente: pausa entre pedidos (RPM), reintento de 429 con retryDelay, paso al modelo de respaldo si se agota el cupo diario.
function crearGemini({ clave, fetch: f = globalThis.fetch, dormir = dormirReal, modelo, respaldo = null, rpm = RPM_DEFECTO, log = () => {}, ahoraMs = Date.now }) {
  const rpmMs = rpm > 0 ? Math.ceil(60000 / rpm) : 0;
  const cli = { modelo, pedidos: 0, cambios: [] };
  let ultimo = null;
  const cuota = msg => new ErrorGemini(msg, { cuota: true });

  async function pedirTexto(system, user) {
    let n429 = 0, nRed = 0;
    for (;;) {
      if (ultimo !== null && rpmMs) { const falta = rpmMs - (ahoraMs() - ultimo); if (falta > 0) await dormir(falta); }
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_TOKENS_SALIDA },
      };
      let res, cuerpo;
      try {
        cli.pedidos++;
        res = await f(`${URL_API}${cli.modelo}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': clave },
          body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        cuerpo = await res.text();
      } catch (e) {
        ultimo = ahoraMs();
        if (nRed++ < REINTENTOS_RED) { await dormir(5000 * nRed); continue; }
        throw new ErrorGemini('error de red hablando con Gemini: ' + e.message);
      }
      ultimo = ahoraMs();
      if (res.ok) { let j; try { j = JSON.parse(cuerpo); } catch (_) { throw new ErrorGemini('respuesta de Gemini no es JSON'); } return textoDeRespuesta(j); }
      if (res.status === 429) {
        const info = interpretar429(cuerpo, res.headers);
        const agotado = info.diaria || (info.esperaMs != null && info.esperaMs > ESPERA_MAX_MS) || n429 >= REINTENTOS_429;
        if (agotado) {
          if (respaldo && cli.modelo !== respaldo && info.diaria) {
            log(`CUPO diario agotado en ${cli.modelo}: sigo con ${respaldo}`);
            cli.cambios.push({ de: cli.modelo, a: respaldo }); cli.modelo = respaldo; n429 = 0; continue;
          }
          throw cuota(`cupo de Gemini agotado en ${cli.modelo}${info.diaria ? ' (diario)' : ' (sigue en 429 tras ' + REINTENTOS_429 + ' esperas)'}`);
        }
        n429++;
        const espera = (info.esperaMs != null ? info.esperaMs : ESPERA_429_DEFECTO_MS) + 1000;
        log(`429 en ${cli.modelo}: espero ${Math.round(espera / 1000)} s (reintento ${n429}/${REINTENTOS_429})`);
        await dormir(espera);
        continue;
      }
      let msg = cuerpo; try { msg = JSON.parse(cuerpo).error.message || cuerpo; } catch (_) { /* texto crudo */ }
      msg = String(msg).slice(0, 300);
      if (res.status === 404 && respaldo && cli.modelo !== respaldo) {
        log(`modelo ${cli.modelo} no encontrado (404): sigo con ${respaldo}`);
        cli.cambios.push({ de: cli.modelo, a: respaldo }); cli.modelo = respaldo; continue;
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) throw new ErrorGemini(`Gemini rechazó el pedido (HTTP ${res.status}): ${msg}`, { fatal: true });
      if (res.status >= 500 && nRed++ < REINTENTOS_RED) { await dormir(5000 * nRed); continue; }
      throw new ErrorGemini(`Gemini HTTP ${res.status}: ${msg}`);
    }
  }
  // Pide un objeto JSON; si el texto no se puede parsear, un solo reintento del mismo pedido.
  async function pedirObjeto(system, user) {
    for (let i = 0; ; i++) {
      const t = await pedirTexto(system, user);
      try { const o = parsearJson(t); if (esObj(o)) return o; throw new ErrorGemini('la respuesta no es un objeto JSON'); } catch (e) { if (i >= 1) throw e; }
    }
  }
  cli.pedirObjeto = pedirObjeto;
  return cli;
}

// ── Disco ───────────────────────────────────────────────────────────────────
const carpetaPar = (dir, t, q) => path.join(dir, 'comunicados', 'fuentes', t, q);
function leerJson(dir, n) { try { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch (_) { return null; } }
function leerTexto(f) { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return null; } }
function listarFuentes(dir, tickers) {
  const out = {};
  for (const t of tickers) { try { out[t] = fs.readdirSync(path.join(dir, 'comunicados', 'fuentes', t), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (_) { out[t] = []; } }
  return out;
}
function cargarHerramientas(dir) {
  const c = path.join(dir, 'comunicados');
  return { aplicar: require(path.join(c, 'guardar.js')).aplicar, norm: require(path.join(c, 'fuentes.js')).norm };
}
function anotarError(estado, { ticker, trimestre, mensaje, fecha }) {
  estado.errores = (estado.errores || []).filter(e => !(e.ticker === ticker && e.trimestre === trimestre && String(e.mensaje).startsWith(PREFIJO_ERROR)));
  if (mensaje) estado.errores.push({ fecha, ticker, trimestre, mensaje: PREFIJO_ERROR + mensaje });
}

// ── Un par ──────────────────────────────────────────────────────────────────
// Lee todo lo que necesita el par y arma el prompt (sirve igual para --dry-run).
function prepararPar({ dir, par, config, esquema, instrucciones, kpisT }) {
  const meta = leerJson(dir, `comunicados/fuentes/${par.ticker}/${par.trimestre}/meta.json`);
  const base = carpetaPar(dir, par.ticker, par.trimestre);
  const comunicado = leerTexto(path.join(base, 'comunicado.txt'));
  if (!meta || meta.estado !== 'ok' || !esUrl(meta.url) || !comunicado) throw new Error('la fuente descargada no está completa (meta.json / comunicado.txt)');
  const presentacion = leerTexto(path.join(base, 'presentacion.txt'));
  const esperados = kpisEsperados(config, par.ticker);
  if (!esperados.length) throw new Error('la config no define KPIs para ' + par.ticker);
  const fechaFin = par.fecha_fin || estimarFechaFin(kpisT, par.trimestre);
  const anterior = trimestreAnterior(kpisT, fechaFin);
  const empresa = (config.empresas || []).find(e => e.ticker === par.ticker);
  const prompt = construirPrompt({ par, empresa, esperados, esquema, instrucciones, meta, comunicado, presentacion, anterior, fechaFin });
  return { meta, comunicado, presentacion, esperados, fechaFin, prompt };
}

// KPIs que el validador de guardar.js rechaza: { id: mensaje }; y los errores que no son de un KPI puntual.
function erroresDeValidacion(errores) {
  const porKpi = {}, globales = [];
  for (const e of errores) {
    const m = /\.kpis\.([A-Za-z0-9_]+)/.exec(e);
    if (m) porKpi[m[1]] = (porKpi[m[1]] ? porKpi[m[1]] + '; ' : '') + e.replace(/^[^:]*: /, '');
    else globales.push(e);
  }
  return { porKpi, globales };
}

async function procesarPar({ dir, par, config, esquema, instrucciones, herr, gemini, estado, ahora, log }) {
  const kpisActual = leerJson(dir, `kpis-${par.ticker}.json`);
  const p = prepararPar({ dir, par, config, esquema, instrucciones, kpisT: kpisActual });
  const urlDoc = p.meta.url;
  const docs = armarDocs({ comunicado: p.comunicado, presentacion: p.presentacion, meta: p.meta, norm: herr.norm });
  const ids = p.esperados.map(k => k.id);
  const stats = { con_valor: 0, nulos: 0, citas_descartadas: 0, citas_recuperadas: 0, extras: 0, faltantes: 0 };

  const resp = await gemini.pedirObjeto(p.prompt.system, p.prompt.user);
  const norm1 = normalizarKpis(resp.kpis, ids, urlDoc);
  stats.extras = norm1.extras.length; stats.faltantes = norm1.faltantes.length;
  let kpis = norm1.kpis;

  // fecha_fin: manda lo que dice el comunicado (la respuesta) si es una fecha real y no se aleja de la esperada más de 10 días.
  let fechaFin = p.fechaFin;
  if (fechaReal(resp.fecha_fin) && (!p.fechaFin || diasEntre(resp.fecha_fin, p.fechaFin) <= 10)) fechaFin = resp.fecha_fin;
  if (!fechaReal(fechaFin)) throw new Error('no se pudo determinar fecha_fin (la respuesta trajo ' + JSON.stringify(resp.fecha_fin) + ')');

  const armar = k => ({ ticker: par.ticker, trimestre: par.trimestre, fecha_fin: fechaFin, kpis: k });
  // aplicar() agrega el trimestre sobre el objeto que recibe: cada llamada trabaja sobre una copia
  const copia = () => (kpisActual ? JSON.parse(JSON.stringify(kpisActual)) : null);
  const revisar = k => {
    const v = verificarCitas(k, docs, herr.norm, urlDoc);
    const val = erroresDeValidacion(herr.aplicar({ extraccion: armar(v.kpis), kpisActual: copia(), estadoActual: estado, config, merge: false, ahora }).errores);
    return { kpis: v.kpis, citas: v.fallidos, formato: val.porKpi, globales: val.globales };
  };
  let r = revisar(kpis);
  const pendientes = () => ({ ...r.formato, ...r.citas });

  // Un único reintento, solo con los KPIs que fallan (cita no encontrada, falta la cita o el validador los rechaza).
  const primeros = pendientes();
  if (Object.keys(primeros).length) {
    log(`  ${par.ticker} ${par.trimestre}: reintento de ${Object.keys(primeros).length} KPI(s): ${Object.keys(primeros).join(', ')}`);
    try {
      const resp2 = await gemini.pedirObjeto(p.prompt.system, construirReintento(p.prompt.user, primeros));
      const k2 = esObj(resp2.kpis) ? resp2.kpis : {};
      for (const id of Object.keys(primeros)) if (esObj(k2[id])) r.kpis[id] = limpiarKpi(k2[id], urlDoc);
      const antes = Object.keys(r.citas).length;
      r = revisar(r.kpis);
      stats.citas_recuperadas = Math.max(0, antes - Object.keys(r.citas).length);
    } catch (e) {
      if (e.cuota || e.fatal) throw e;
      log(`  ${par.ticker} ${par.trimestre}: el reintento falló (${e.message}); lo que sigue mal pasa a null`);
    }
    for (const id of Object.keys(r.citas)) { r.kpis[id] = aNulo(urlDoc, 'cita no verificada en el comunicado'); stats.citas_descartadas++; }
    for (const id of Object.keys(r.formato)) if (!(id in r.citas)) r.kpis[id] = aNulo(urlDoc, 'valor rechazado por la validación de formato');
    r = revisar(r.kpis);
  }
  if (r.globales.length || Object.keys(r.formato).length || Object.keys(r.citas).length) {
    const todos = r.globales.concat(Object.entries({ ...r.formato, ...r.citas }).map(([id, m]) => `${id}: ${m}`));
    throw new Error('validación: ' + todos.join(' | ').slice(0, 600));
  }
  for (const k of Object.values(r.kpis)) { if (k.valor === null) stats.nulos++; else stats.con_valor++; }
  const final = herr.aplicar({ extraccion: armar(r.kpis), kpisActual: copia(), estadoActual: estado, config, merge: false, ahora });
  if (final.errores.length) throw new Error('validación: ' + final.errores.join(' | ').slice(0, 600));
  fs.writeFileSync(path.join(dir, `kpis-${par.ticker}.json`), json(final.arch));
  return { estado: final.estado, stats, fechaFin };
}

// ── main ────────────────────────────────────────────────────────────────────
async function correr({ dir, env = process.env, argv = [], fetch: f, dormir, log = console.log, ahora, ahoraMs }) {
  const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const clave = env.GEMINI_API_KEY || '';
  const redactar = crearRedactor(clave);
  const logSeguro = s => log(redactar(s));
  const dry = argv.includes('--dry-run');
  const config = leerJson(dir, 'radar-config.json');
  if (!config || !Array.isArray(config.empresas)) throw new Error('No se pudo leer radar-config.json en ' + dir);
  let estado = leerJson(dir, 'comunicados/estado.json') || { v: 1, ultima_corrida: null, procesados: {}, cola_backfill: [], errores: [] };
  const hayEstado = fs.existsSync(path.join(dir, 'comunicados', 'estado.json'));
  const textoInstr = leerTexto(path.join(dir, 'comunicados', 'INSTRUCCIONES.md'));
  const esquema = leerTexto(path.join(dir, 'comunicados', 'esquema.md'));
  if (!textoInstr || !esquema) throw new Error('Faltan comunicados/INSTRUCCIONES.md o comunicados/esquema.md en ' + dir);
  const sec = extraerSecciones(textoInstr, SECCIONES_INSTRUCCIONES);
  if (!sec.texto) throw new Error('INSTRUCCIONES.md no tiene ninguna de las secciones esperadas');
  if (sec.faltan.length) logSeguro(`AVISO: INSTRUCCIONES.md no tiene las secciones: ${sec.faltan.join('; ')}`);
  const herr = cargarHerramientas(dir);

  let tickers = config.empresas.map(e => e.ticker);
  if (arg('--tickers')) { const s = arg('--tickers').split(',').map(x => x.trim().toUpperCase()).filter(Boolean); tickers = tickers.filter(t => s.includes(t)); }
  const max = Number(arg('--max')) > 0 ? Math.floor(Number(arg('--max'))) : MAX_PARES_DEFECTO;
  const kpisPor = {}; for (const t of tickers) kpisPor[t] = leerJson(dir, `kpis-${t}.json`);
  const meta = (t, q) => leerJson(dir, `comunicados/fuentes/${t}/${q}/meta.json`);
  const sel = seleccionarPares({ tickers, estado, kpis: kpisPor, fuentes: listarFuentes(dir, tickers), meta, max });
  const cuenta = o => sel.pares.filter(p => p.origen === o).length;
  logSeguro(`Pares a extraer: ${sel.pares.length} (${cuenta('nuevo')} nuevos, ${cuenta('backfill')} de la cola). Quedan fuera por el tope: ${sel.restantes.nuevos} nuevos, ${sel.restantes.cola_con_fuente} de la cola con fuente.`);

  if (dry) {
    for (const par of sel.pares) {
      const etiqueta = `${par.ticker} ${par.trimestre} (${par.origen})`;
      try {
        const p = prepararPar({ dir, par, config, esquema, instrucciones: sec.texto, kpisT: kpisPor[par.ticker] });
        const n = p.prompt.system.length + p.prompt.user.length;
        logSeguro(`  ${etiqueta}: prompt ${n} caracteres (~${Math.round(n / 4)} tokens), ${p.esperados.length} KPIs, comunicado ${p.comunicado.length}${p.presentacion ? ' + presentación ' + p.presentacion.length : ''}, fecha_fin ${p.fechaFin || 'a confirmar'}`);
      } catch (e) { logSeguro(`  ${etiqueta}: no se puede armar el prompt (${e.message})`); }
    }
    logSeguro('--dry-run: no se llamó a la API ni se escribió nada.');
    return { dry: true, pares: sel.pares, restantes: sel.restantes };
  }

  if (!clave) throw new Error('Falta la variable de entorno GEMINI_API_KEY.');
  const modelo = arg('--modelo') || env.GEMINI_MODEL || MODELO_DEFECTO;
  const resp = env.GEMINI_MODEL_RESPALDO !== undefined ? env.GEMINI_MODEL_RESPALDO : MODELO_RESPALDO;
  const respaldo = resp && resp !== modelo ? resp : null;
  const rpm = env.GEMINI_RPM ? Number(env.GEMINI_RPM) : RPM_DEFECTO;
  const gemini = crearGemini({ clave, fetch: f, dormir, modelo, respaldo, rpm, log: logSeguro, ahoraMs });
  logSeguro(`Modelo: ${modelo}${respaldo ? ' (respaldo ' + respaldo + ')' : ''}, ${rpm} pedidos/min como máximo`);

  const resumen = { procesados: [], errores: [], con_valor: 0, nulos: 0, citas_descartadas: 0, citas_recuperadas: 0, corte: null, modelo_final: modelo, cambios_de_modelo: [] };
  const escribirEstado = () => { if (hayEstado) fs.writeFileSync(path.join(dir, 'comunicados', 'estado.json'), json(estado)); };
  let intentados = 0;
  for (const par of sel.pares) {
    const etiqueta = `${par.ticker} ${par.trimestre}`;
    intentados++;
    try {
      const r = await procesarPar({ dir, par, config, esquema, instrucciones: sec.texto, herr, gemini, estado, ahora, log: logSeguro });
      estado = r.estado || estado;
      if (r.estado) { anotarError(estado, { ticker: par.ticker, trimestre: par.trimestre, mensaje: null }); escribirEstado(); }
      resumen.procesados.push(etiqueta);
      for (const k of ['con_valor', 'nulos', 'citas_descartadas', 'citas_recuperadas']) resumen[k] += r.stats[k];
      logSeguro(`OK     ${etiqueta}  ${r.stats.con_valor} con valor, ${r.stats.nulos} null, ${r.stats.citas_descartadas} cita(s) descartada(s)${r.stats.extras ? ', ' + r.stats.extras + ' KPI(s) de más descartado(s)' : ''}`);
    } catch (e) {
      const msg = redactar(e.message);
      if (e.cuota || e.fatal) { resumen.corte = (e.fatal ? 'ERROR FATAL: ' : 'CUPO: ') + msg; logSeguro(`CORTE  ${etiqueta}  ${msg}`); break; }
      resumen.errores.push(`${etiqueta}: ${msg}`);
      anotarError(estado, { ticker: par.ticker, trimestre: par.trimestre, mensaje: msg, fecha: ahora.slice(0, 10) });
      escribirEstado();
      logSeguro(`ERROR  ${etiqueta}  ${msg}`);
    }
  }
  resumen.modelo_final = gemini.modelo;
  resumen.cambios_de_modelo = gemini.cambios;
  if (intentados && hayEstado) { estado.ultima_corrida = ahora; escribirEstado(); }

  const restoCola = (estado.cola_backfill || []).filter(p => tickers.includes(p.ticker));
  const restoConFuente = restoCola.filter(p => { const m = meta(p.ticker, p.trimestre); return m && m.estado === 'ok'; }).length;
  logSeguro(`Resumen: ${resumen.procesados.length} par(es) guardado(s) [${resumen.procesados.join(', ') || '-'}]; ${resumen.con_valor} KPIs con valor, ${resumen.nulos} null; ` +
    `${resumen.citas_descartadas} cita(s) descartada(s) (${resumen.citas_recuperadas} recuperada(s) en el reintento); ${resumen.errores.length} par(es) con error; ` +
    `quedan ${restoCola.length} en la cola (${restoConFuente} con fuente). Modelo final: ${gemini.modelo}.${resumen.corte ? ' CORTE: ' + resumen.corte : ''}`);
  for (const e of resumen.errores) logSeguro('  error: ' + e);
  return resumen;
}

async function main(argv, env = process.env) {
  const i = argv.indexOf('--datos');
  const dir = i >= 0 ? argv[i + 1] : null;
  if (!dir || !fs.existsSync(dir)) throw new Error('Falta --datos <carpeta del repo de datos>.');
  const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const r = await correr({ dir: path.resolve(dir), env, argv, fetch: globalThis.fetch, ahora });
  // Quedarse sin cupo es normal (sale 0, lo que falta sigue en la cola); una clave rechazada no se arregla sola: sale en rojo.
  if (r.corte && r.corte.startsWith('ERROR FATAL')) process.exitCode = 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => { console.error('ERROR: ' + crearRedactor(process.env.GEMINI_API_KEY || '')(e.message)); process.exit(1); });
}
module.exports = {
  extraerSecciones, kpisEsperados, seleccionarPares, estimarFechaFin, trimestreAnterior, construirPrompt, construirReintento,
  limpiarKpi, normalizarKpis, recortarCita, armarDocs, verificarCitas, interpretar429, textoDeRespuesta, parsearJson,
  crearGemini, crearRedactor, erroresDeValidacion, prepararPar, procesarPar, correr, MODELO_DEFECTO, MODELO_RESPALDO,
};
