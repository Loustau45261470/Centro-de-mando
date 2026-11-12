'use strict';
// ════════════════════════════════════════════════════════════════════════
// FOCO — sub-pestaña "Foco" dentro de Principios (puntos 1, 3 y 4 del "Seguimiento de Foco" de specs/principios-y-revisiones.md).
//   1. Cierre nocturno: atención (1-5), energía (1-5) y una línea de "dónde se fue el tiempo". Un registro por día.
//   3. Tiempo de pantalla semanal: horas totales de la semana, una por semana (clave = lunes en fecha local).
//   4. Cruce: energía/atención contra sueño, entrenamiento y comida; solo con datos suficientes.
//   2. Chequeos durante el día: aviso push (kind 'foco' en deadlines.js) que abre esta sub-pestaña con el chequeo listo
//      (destino '#foco-chequeo'); un toque en categoría + energía 1-5; horas configurables; reparto de los últimos 7 días.
//
// Estado (clave nueva de primer nivel S.foco; el guardado serializa todo S, sin tocar la lógica de sync):
//   S.foco = { dias: { 'YYYY-MM-DD': { atencion, energia, nota } },
//              pantalla: { 'YYYY-MM-DD(lunes)': horas },
//              chequeos: [ { fecha:'YYYY-MM-DD', hora:'HH:MM' (hora local de respuesta), categoria, energia } ],
//              config: { horas: ['11:00','15:00','19:00'] } }
// Fuentes del cruce (solo lectura, no se agrega tracking nuevo):
//   sueño        → S.sleepLog['YYYY-MM-DD'].hours        (app.js, tracker de sueño)
//   entrenamiento→ S.workoutLog['YYYY-MM-DD'][ejercicio]  (rutinas.js; día con al menos una serie cargada)
//   comida       → dietaDayMet(fecha) / S.dieta.log       (app.js, tracker de comida sana)
// Las funciones puras (sin DOM) están arriba y se exportan para Node al final del archivo.
// ════════════════════════════════════════════════════════════════════════

const FO_MIN_DIAS = 10;     // mínimo de días con registro para mostrar cualquier cruce
const FO_MIN_GRUPO = 3;     // mínimo de días en cada grupo comparado
const FO_HORAS_BUEN_SUENO = 7;
const FO_MIN_CHEQUEOS = 5;  // mínimo de chequeos en 7 días para mostrar el reparto
const FO_CATEGORIAS = [['estudio', 'Estudio'], ['gym', 'Gym'], ['trabajo', 'Trabajo'], ['pantalla', 'Pantalla/distracción'], ['social', 'Social'], ['descanso', 'Descanso'], ['otro', 'Otro']];
const FO_DESTINO = '#foco-chequeo';   // mismo valor que FOCO_URL de deadlines.js

// ── Funciones puras ────────────────────────────────────────────────────────
function foFecha(d) {   // 'YYYY-MM-DD' en hora LOCAL (nunca toISOString)
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function foParse(ds) { const [y, m, d] = String(ds).split('-').map(Number); return new Date(y, m - 1, d); }
function foLunes(ds) {   // lunes de la semana de ds (lunes a domingo), en fecha local
  const d = foParse(ds), dow = (d.getDay() + 6) % 7;   // lunes = 0 … domingo = 6
  d.setDate(d.getDate() - dow);
  return foFecha(d);
}
function foSumarDias(ds, n) { const d = foParse(ds); d.setDate(d.getDate() + n); return foFecha(d); }

function foNum15(v) { const n = Math.round(Number(v)); return (n >= 1 && n <= 5) ? n : null; }

// Un registro por día: reabrir el mismo día reemplaza, no duplica. Devuelve el registro guardado o null si es inválido.
function foGuardarDia(foco, ds, atencion, energia, nota) {
  const a = foNum15(atencion), e = foNum15(energia);
  if (a == null || e == null) return null;
  if (!foco.dias || typeof foco.dias !== 'object') foco.dias = {};
  foco.dias[ds] = { atencion: a, energia: e, nota: String(nota || '').trim().slice(0, 300) };
  return foco.dias[ds];
}

// Horas de pantalla de una semana (clave = lunes). null/'' borra. Devuelve las horas guardadas o null.
function foGuardarPantalla(foco, ds, horas) {
  if (!foco.pantalla || typeof foco.pantalla !== 'object') foco.pantalla = {};
  const k = foLunes(ds);
  const raw = String(horas == null ? '' : horas).replace(',', '.').trim();
  if (raw === '') { delete foco.pantalla[k]; return null; }
  const h = Number(raw);
  if (!isFinite(h) || h < 0 || h > 168) return null;
  foco.pantalla[k] = Math.round(h * 10) / 10;
  return foco.pantalla[k];
}

function foPromedio(arr) {
  const v = arr.filter(x => typeof x === 'number' && isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function foFmt(n) { return n == null ? '–' : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); }

// Días con registro completo (atención y energía válidas), ordenados.
function foDiasValidos(foco) {
  const d = (foco && foco.dias) || {};
  return Object.keys(d).filter(k => foNum15(d[k] && d[k].energia) != null && foNum15(d[k] && d[k].atencion) != null).sort();
}

// Compara dos grupos de días. clasif(ds) → 'a' | 'b' | null (null = no hay dato de ese día).
// Estados: 'faltan' (menos de minDias con registro) · 'sin_datos' (ningún día clasificable) · 'ok'.
// Cada grupo trae ok=true solo si tiene al menos minGrupo días; la comparación solo vale si ambos ok.
function foCruceGrupos(foco, clasif, minDias, minGrupo) {
  minDias = minDias || FO_MIN_DIAS; minGrupo = minGrupo || FO_MIN_GRUPO;
  const dias = foDiasValidos(foco), n = dias.length;
  if (n < minDias) return { estado: 'faltan', n, minDias };
  const g = { a: [], b: [] };
  dias.forEach(ds => { const c = clasif(ds); if (c === 'a' || c === 'b') g[c].push(ds); });
  if (!g.a.length && !g.b.length) return { estado: 'sin_datos', n };
  const nc = g.a.length + g.b.length;   // el mínimo vale sobre los días efectivamente comparados en este cruce
  if (nc < minDias) return { estado: 'faltan', n: nc, minDias };
  const mk = arr => ({ n: arr.length, ok: arr.length >= minGrupo,
    energia: foPromedio(arr.map(ds => foco.dias[ds].energia)), atencion: foPromedio(arr.map(ds => foco.dias[ds].atencion)) });
  const a = mk(g.a), b = mk(g.b);
  return { estado: 'ok', n, a, b, comparable: a.ok && b.ok };
}

// Clasificadores a partir del estado de los otros módulos (solo lectura). ctx = { sleepLog, workoutLog, dietaLog, dietaMet }.
function foClasifSueno(ctx) {
  return ds => { const h = ctx.sleepLog && ctx.sleepLog[ds] && ctx.sleepLog[ds].hours; return typeof h === 'number' && h > 0 ? (h >= FO_HORAS_BUEN_SUENO ? 'a' : 'b') : null; };
}
function foEntrenoDelDia(workoutLog, ds) {
  const w = workoutLog && workoutLog[ds];
  const lleno = v => v != null && String(v).trim() !== '';
  return !!w && Object.keys(w).some(ex => Array.isArray(w[ex]) && w[ex].some(x => x && (lleno(x.reps) || lleno(x.weight))));
}
function foClasifEntreno(ctx, haySeries) {   // sin ninguna serie cargada en los días registrados no se puede distinguir "no entrené" de "no cargué"
  return haySeries ? (ds => foEntrenoDelDia(ctx.workoutLog, ds) ? 'a' : 'b') : (() => null);
}
function foClasifComida(ctx, hayLog) {   // un día sin nada anotado es "no lo cargué", no "no lo cumplí": queda afuera
  const anotado = ds => !!ctx.dietaLog && Array.isArray(ctx.dietaLog[ds]) && ctx.dietaLog[ds].length > 0;
  return (hayLog && typeof ctx.dietaMet === 'function') ? (ds => anotado(ds) ? (ctx.dietaMet(ds) ? 'a' : 'b') : null) : (() => null);
}

// Arma los tres cruces con su texto. Cada item: { clave, titulo, estado, texto, detalle? }.
function foArmarCruces(foco, ctx) {
  const dias = foDiasValidos(foco);
  const haySeries = dias.some(ds => foEntrenoDelDia(ctx.workoutLog, ds));
  const hayComida = dias.some(ds => ctx.dietaLog && Array.isArray(ctx.dietaLog[ds]) && ctx.dietaLog[ds].length);
  const defs = [
    { clave: 'sueno', titulo: 'Sueño', nombre: 'sueño', clasif: foClasifSueno(ctx),
      a: 'dormiste ' + FO_HORAS_BUEN_SUENO + ' horas o más', b: 'dormiste menos de ' + FO_HORAS_BUEN_SUENO + ' horas' },
    { clave: 'entreno', titulo: 'Entrenamiento', nombre: 'entrenamiento', clasif: foClasifEntreno(ctx, haySeries),
      a: 'cargaste rutina de gym', b: 'no cargaste rutina de gym' },
    { clave: 'comida', titulo: 'Comida', nombre: 'comida', clasif: foClasifComida(ctx, hayComida),
      a: 'cumpliste la meta de comida sana', b: 'no la cumpliste' },
  ];
  return defs.map(d => {
    const r = foCruceGrupos(foco, d.clasif);
    const it = { clave: d.clave, titulo: d.titulo, estado: r.estado, texto: '' };
    if (r.estado === 'faltan') it.texto = 'Faltan datos: llevás ' + r.n + ' de ' + r.minDias + ' días';
    else if (r.estado === 'sin_datos') it.texto = 'Sin datos de ' + d.nombre;
    else if (!r.comparable) it.texto = 'Faltan datos de ' + d.nombre + ': hace falta al menos ' + FO_MIN_GRUPO + ' días en cada grupo (' + r.a.n + ' y ' + r.b.n + ' por ahora)';
    else it.texto = 'Los días que ' + d.a + ', tu energía promedio fue ' + foFmt(r.a.energia) + ' y tu atención ' + foFmt(r.a.atencion) + ' (' + r.a.n + ' días). '
      + 'Los días que ' + d.b + ', tu energía promedio fue ' + foFmt(r.b.energia) + ' y tu atención ' + foFmt(r.b.atencion) + ' (' + r.b.n + ' días).';
    return it;
  });
}

// Energía promedio por hora del día a partir de S.foco.chequeos (forma esperada: { fecha, hora:'HH:MM', energia }).
// Solo cuentan las horas con al menos minGrupo chequeos. Devuelve [] si no hay chequeos (la UI entonces no muestra la parte).
function foFranjas(chequeos, minGrupo) {
  minGrupo = minGrupo || FO_MIN_GRUPO;
  const por = {};
  (Array.isArray(chequeos) ? chequeos : []).forEach(c => {
    const e = foNum15(c && c.energia), m = /^(\d{1,2}):/.exec(String((c && c.hora) || ''));
    if (e == null || !m) return;
    const h = Number(m[1]); if (h > 23) return;
    (por[h] = por[h] || []).push(e);
  });
  return Object.keys(por).map(Number).sort((x, y) => x - y).filter(h => por[h].length >= minGrupo)
    .map(h => ({ hora: h, n: por[h].length, energia: foPromedio(por[h]) }));
}

// Chequeos del día. Devuelve el chequeo guardado o null si algo es inválido.
function foGuardarChequeo(foco, fecha, hora, categoria, energia) {
  const e = foNum15(energia), cat = FO_CATEGORIAS.some(c => c[0] === categoria);
  if (e == null || !cat || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  if (!Array.isArray(foco.chequeos)) foco.chequeos = [];
  const c = { fecha, hora, categoria, energia: e };
  foco.chequeos.push(c);
  return c;
}
// Horas de aviso: solo 'HH:MM' válidas, sin duplicados, ordenadas (misma regla que deadlines.js).
function foNormalizarHoras(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).filter(h => typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h)))).sort();
}
// Reparto por categoría de los chequeos de los últimos 'dias' días (incluye hoy). suficiente=false → "faltan datos".
function foReparto(chequeos, hoy, dias) {
  const desde = foSumarDias(hoy, -((dias || 7) - 1));
  const lista = (Array.isArray(chequeos) ? chequeos : []).filter(c => c && c.fecha >= desde && c.fecha <= hoy && FO_CATEGORIAS.some(k => k[0] === c.categoria));
  const n = lista.length;
  const filas = FO_CATEGORIAS.map(([id, nombre]) => { const k = lista.filter(c => c.categoria === id).length; return { id, nombre, n: k, pct: n ? Math.round(k * 100 / n) : 0 }; })
    .filter(f => f.n > 0).sort((a, b) => b.n - a.n);
  return { n, filas, suficiente: n >= FO_MIN_CHEQUEOS };
}

// ── Datos ──────────────────────────────────────────────────────────────────
function _foData() {
  if (typeof S === 'undefined') return { dias: {}, pantalla: {}, chequeos: [], config: { horas: ['11:00', '15:00', '19:00'] } };
  let d = S.foco;
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = S.foco = {};
  if (!d.dias || typeof d.dias !== 'object' || Array.isArray(d.dias)) d.dias = {};
  if (!d.pantalla || typeof d.pantalla !== 'object' || Array.isArray(d.pantalla)) d.pantalla = {};
  if (!Array.isArray(d.chequeos)) d.chequeos = [];
  if (!d.config || typeof d.config !== 'object') d.config = {};
  if (!Array.isArray(d.config.horas)) d.config.horas = ['11:00', '15:00', '19:00'];
  return d;
}
function _foCtx() {
  return {
    sleepLog: (typeof S !== 'undefined' && S.sleepLog) || {},
    workoutLog: (typeof S !== 'undefined' && S.workoutLog) || {},
    dietaLog: (typeof S !== 'undefined' && S.dieta && S.dieta.log) || {},
    dietaMet: (typeof dietaDayMet === 'function' && typeof S !== 'undefined' && S.dieta && Array.isArray(S.dieta.reglas)) ? dietaDayMet : null,
  };
}
function _foSave() { if (typeof saveState === 'function') saveState(); }
function _foToast(m) { if (typeof showToast === 'function') showToast(m); }
const _foEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── UI ─────────────────────────────────────────────────────────────────────
let _foDraft = null;   // { ds, atencion, energia } del día abierto
let _foChOpen = false;            // chequeo abierto (desde el aviso o desde "Anotar ahora")
let _foCh = { categoria: null };  // categoría elegida, a la espera de la energía
let _foPendiente = false;         // destino '#foco-chequeo' recibido antes de que la app termine de arrancar

// El día del cierre cambia a las 04:00 (las 00:00 es la hora de dormir): antes de las 04:00 cuenta como el día anterior.
function foHoyCierre(ahora) { return foFecha(new Date((ahora == null ? Date.now() : ahora) - 4 * 3600e3)); }
function _foHoy() { return foHoyCierre(); }
function _foDraftHoy() {
  const hoy = _foHoy();
  if (!_foDraft || _foDraft.ds !== hoy) {
    const r = _foData().dias[hoy];
    _foDraft = { ds: hoy, atencion: r ? foNum15(r.atencion) : null, energia: r ? foNum15(r.energia) : null };
  }
  return _foDraft;
}
function _foEscala(campo, val) {
  let h = '<div class="fo-escala">';
  for (let i = 1; i <= 5; i++) h += '<button type="button" class="fo-n' + (val === i ? ' on' : '') + '" onclick="Foco.set(\'' + campo + '\',' + i + ')">' + i + '</button>';
  return h + '</div>';
}
function _foFechaCorta(ds) { const d = foParse(ds); return d.getDate() + '/' + (d.getMonth() + 1); }

function foHtml() {
  const d = _foData(), hoy = _foHoy(), dr = _foDraftHoy(), reg = d.dias[hoy];
  const hr = new Date().getHours(), tarde = hr >= 20 || hr < 4;
  let h = '';
  if (tarde && !reg) h += '<div class="fo-aviso">Todavía no hiciste el cierre de hoy. Te lleva un minuto.</div>';

  // 2. Chequeo del momento
  h += '<div class="pr-card" id="fo-chequeo"><div class="pr-form-t">¿En qué estuviste?</div>';
  if (!_foChOpen) h += '<div class="pr-nota">Anotá en qué usaste las últimas horas. Es un toque.</div><div class="pr-form-f"><button type="button" class="pr-btn pr-btn-p fo-btn" onclick="Foco.abrirChequeo()">Anotar ahora</button></div>';
  else {
    h += '<div class="pr-nota">Elegí la categoría y después tu energía.</div><div class="fo-cats">'
      + FO_CATEGORIAS.map(c => '<button type="button" class="fo-cat' + (_foCh.categoria === c[0] ? ' on' : '') + '" data-cat="' + c[0] + '" onclick="Foco.elegirCategoria(\'' + c[0] + '\')">' + _foEsc(c[1]) + '</button>').join('') + '</div>'
      + '<label class="pr-l">Energía ahora (1 = agotado, 5 = con pila)</label><div class="fo-escala" id="fo-ch-en">'
      + [1, 2, 3, 4, 5].map(i => '<button type="button" class="fo-n" data-en="' + i + '" onclick="Foco.elegirEnergia(' + i + ')">' + i + '</button>').join('') + '</div>'
      + '<div class="pr-form-f"><button type="button" class="pr-btn fo-btn" onclick="Foco.cerrarChequeo()">Cancelar</button></div>';
  }
  h += '</div>';

  // 1. Cierre nocturno
  h += '<div class="pr-card"><div class="pr-form-t">Cierre del día</div>'
    + '<div class="pr-nota">' + (reg ? 'Ya registraste hoy. Podés corregirlo y guardar de nuevo.' : 'Tres datos, menos de un minuto.') + '</div>'
    + '<label class="pr-l">Atención de hoy (1 = dispersa, 5 = enfocada)</label>' + _foEscala('atencion', dr.atencion)
    + '<label class="pr-l">Energía de hoy (1 = agotado, 5 = con pila)</label>' + _foEscala('energia', dr.energia)
    + '<label class="pr-l">¿Dónde se me fue el tiempo?</label><input id="fo-nota" class="pr-in" maxlength="300" placeholder="Una línea" value="' + _foEsc(dr.notaTmp != null ? dr.notaTmp : (reg ? reg.nota : '')) + '" oninput="Foco.nota(this.value)">'
    + '<div class="pr-form-f"><button type="button" class="pr-btn pr-btn-p" onclick="Foco.guardarDia()">' + (reg ? 'Actualizar' : 'Guardar') + '</button></div></div>';

  // 3. Tiempo de pantalla semanal
  const lunes = foLunes(hoy);
  h += '<div class="pr-card"><div class="pr-form-t">Tiempo de pantalla</div><div class="pr-nota">Horas totales de la semana (lunes a domingo), según el reporte del celular.</div>';
  for (let i = 0; i < 6; i++) {
    const k = foSumarDias(lunes, -7 * i), v = d.pantalla[k];
    h += '<div class="pr-cat"><span>' + (i === 0 ? 'Esta semana' : 'Semana del ' + _foFechaCorta(k)) + ' <small class="pr-meta">desde el ' + _foFechaCorta(k) + '</small></span>'
      + '<input class="pr-in fo-hs" type="number" inputmode="decimal" min="0" max="168" step="0.5" placeholder="horas" value="' + (v == null ? '' : _foEsc(v)) + '" onchange="Foco.guardarPantalla(\'' + k + '\',this.value,this.validity.badInput)"></div>';
  }
  h += '</div>';

  // 4. Cruce
  const n = foDiasValidos(d).length;
  h += '<div class="pr-card"><div class="pr-form-t">Cruce con sueño, entrenamiento y comida</div>';
  if (n < FO_MIN_DIAS) h += '<div class="pr-nota">Faltan datos: llevás ' + n + ' de ' + FO_MIN_DIAS + ' días</div>';
  else {
    h += '<div class="pr-nota">Son promedios de tus días registrados (' + n + '). Muestran qué coincide con qué, no qué causa qué.</div>';
    h += foArmarCruces(d, _foCtx()).map(c => '<div class="pr-cat fo-cruce"><b>' + _foEsc(c.titulo) + '</b><div class="fo-txt' + (c.estado === 'ok' && !/^Faltan/.test(c.texto) ? '' : ' fo-sin') + '">' + _foEsc(c.texto) + '</div></div>').join('');
    const fr = foFranjas(d.chequeos);
    if (fr.length) h += '<div class="pr-cat fo-cruce"><b>Horas del día</b><div class="fo-txt">' + fr.map(f => 'A las ' + f.hora + ' h tu energía promedio fue ' + foFmt(f.energia) + ' (' + f.n + ' chequeos)').map(_foEsc).join('. ') + '.</div></div>';
  }
  h += '</div>';

  // 2. Reparto de los últimos 7 días + horas de los avisos
  const rp = foReparto(d.chequeos, foFecha(new Date()), 7);
  h += '<div class="pr-card" id="fo-reparto"><div class="pr-form-t">Reparto de los últimos 7 días</div>';
  if (!rp.suficiente) h += '<div class="pr-nota">Faltan datos: llevás ' + rp.n + ' de ' + FO_MIN_CHEQUEOS + ' chequeos en los últimos 7 días.</div>';
  else h += '<div class="pr-nota">Sobre ' + rp.n + ' chequeos. Es una muestra, no un cronómetro.</div>' + rp.filas.map(f => '<div class="pr-cat fo-rep"><span>' + _foEsc(f.nombre) + '</span><b>' + f.n + ' · ' + f.pct + '%</b></div>').join('');
  h += '</div>';
  const hs = foNormalizarHoras(d.config.horas);
  h += '<div class="pr-card" id="fo-horas"><div class="pr-form-t">Horas de los chequeos</div><div class="pr-nota">' + (hs.length ? 'Te aviso a estas horas todos los días.' : 'Sin horas: no hay avisos.') + '</div>'
    + hs.map((x, i) => '<div class="pr-cat"><input class="pr-in fo-hs fo-hora" type="time" value="' + _foEsc(x) + '" onchange="Foco.cambiarHora(' + i + ',this.value)"><button type="button" class="pr-btn pr-btn-d fo-btn" onclick="Foco.quitarHora(' + i + ')">Quitar</button></div>').join('')
    + '<div class="pr-cat"><input id="fo-nueva" class="pr-in fo-hs fo-hora" type="time"><button type="button" class="pr-btn pr-btn-p fo-btn" onclick="Foco.agregarHora()">Agregar hora</button></div></div>';

  // Últimos cierres
  const ult = Object.keys(d.dias).sort().reverse().slice(0, 7);
  if (ult.length) h += '<div class="pr-card"><div class="pr-form-t">Últimos cierres</div>' + ult.map(k => {
    const r = d.dias[k];
    return '<div class="pr-cat"><span>' + _foFechaCorta(k) + ' · atención ' + _foEsc(r.atencion) + ' · energía ' + _foEsc(r.energia) + (r.nota ? '<br><small class="pr-meta">' + _foEsc(r.nota) + '</small>' : '') + '</span></div>';
  }).join('') + '</div>';
  return h;
}

const Foco = {
  html: foHtml,
  set(campo, v) {
    const nota = document.getElementById('fo-nota'), dr = _foDraftHoy();
    dr[campo] = v;
    if (nota) dr.notaTmp = nota.value;
    if (typeof prRender === 'function') prRender();
    const n2 = document.getElementById('fo-nota'); if (n2 && dr.notaTmp != null) n2.value = dr.notaTmp;
  },
  guardarDia() {
    const dr = _foDraftHoy(), nota = document.getElementById('fo-nota');
    if (dr.atencion == null || dr.energia == null) { _foToast('Elegí atención y energía'); return; }
    foGuardarDia(_foData(), dr.ds, dr.atencion, dr.energia, nota ? nota.value : '');
    dr.notaTmp = null; _foSave(); if (typeof prRender === 'function') prRender(); _foToast('Cierre guardado');
  },
  nota(v) { _foDraftHoy().notaTmp = v; },
  abrirChequeo() { _foChOpen = true; _foCh = { categoria: null }; if (typeof prRender === 'function') prRender(); },
  cerrarChequeo() { _foChOpen = false; if (typeof prRender === 'function') prRender(); },
  elegirCategoria(c) { _foCh.categoria = c; if (typeof prRender === 'function') prRender(); },
  elegirEnergia(e) {
    if (!_foCh.categoria) { _foToast('Elegí primero la categoría'); return; }
    const ahora = new Date(), p = n => String(n).padStart(2, '0');
    if (!foGuardarChequeo(_foData(), foFecha(ahora), p(ahora.getHours()) + ':' + p(ahora.getMinutes()), _foCh.categoria, e)) { _foToast('No se pudo guardar el chequeo'); return; }
    _foChOpen = false; _foCh = { categoria: null }; _foSave(); if (typeof prRender === 'function') prRender(); _foToast('Chequeo guardado');
  },
  _guardarHoras(arr) { _foData().config.horas = foNormalizarHoras(arr); _foSave(); if (typeof prRender === 'function') prRender(); },
  cambiarHora(i, v) {
    const hs = foNormalizarHoras(_foData().config.horas);
    if (!foNormalizarHoras([v]).length) { _foToast('Hora inválida'); if (typeof prRender === 'function') prRender(); return; }
    if (hs.some((x, j) => j !== i && x === v)) { _foToast('Esa hora ya está'); if (typeof prRender === 'function') prRender(); return; }
    hs[i] = v; Foco._guardarHoras(hs);
  },
  quitarHora(i) { const hs = foNormalizarHoras(_foData().config.horas); hs.splice(i, 1); Foco._guardarHoras(hs); },
  agregarHora() {
    const el = document.getElementById('fo-nueva'), v = el ? el.value : '', hs = foNormalizarHoras(_foData().config.horas);
    if (!foNormalizarHoras([v]).length) { _foToast('Elegí una hora'); return; }
    if (hs.includes(v)) { _foToast('Esa hora ya está'); return; }
    Foco._guardarHoras(hs.concat(v));
  },
  // Destino del aviso: Principios > Foco con el chequeo abierto.
  abrirDestino() {
    _foChOpen = true; _foCh = { categoria: null };
    const btn = document.querySelector('.nav-btn[data-tab="principios"]');
    if (btn) btn.click(); else if (typeof switchTab === 'function') switchTab('principios');
    if (window.Principios) window.Principios.sub('foco');
  },
  guardarPantalla(k, v, badInput) {
    if (badInput) { _foToast('Número de horas inválido'); if (typeof prRender === 'function') prRender(); return; }   // no se borra lo ya cargado
    const raw = String(v).trim();
    if (raw !== '' && foGuardarPantalla(_foData(), k, raw) == null) { _foToast('Número de horas inválido'); if (typeof prRender === 'function') prRender(); return; }
    if (raw === '') foGuardarPantalla(_foData(), k, '');
    _foSave(); _foToast('Guardado');
  },
};
if (typeof window !== 'undefined') window.Foco = Foco;

// Deep-link del aviso push: '#foco-chequeo' en la URL (app cerrada → openWindow) o mensaje del SW (app abierta).
// Se aplica cuando la app ya arrancó: engancha aplicarAccionPendiente(), que app.js llama al final de _initApp().
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (location.hash === FO_DESTINO) { _foPendiente = true; history.replaceState(null, '', location.pathname + location.search); }
  const enganchar = () => {
    const orig = window.aplicarAccionPendiente;
    window.aplicarAccionPendiente = function () {
      if (typeof orig === 'function') orig.apply(this, arguments);
      if (_foPendiente) { _foPendiente = false; Foco.abrirDestino(); }
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => {
    const m = e.data;
    if (!m || m.tipo !== 'abrir-destino' || !String(m.url || '').endsWith(FO_DESTINO)) return;
    if (typeof _appBooted !== 'undefined' && _appBooted) Foco.abrirDestino(); else _foPendiente = true;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { foFecha, foLunes, foSumarDias, foGuardarDia, foGuardarPantalla, foPromedio, foDiasValidos, foCruceGrupos, foArmarCruces, foFranjas, foEntrenoDelDia, foHoyCierre, foGuardarChequeo, foNormalizarHoras, foReparto };
}
