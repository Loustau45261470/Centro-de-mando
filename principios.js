'use strict';
// ════════════════════════════════════════════════════════════════════════
// PRINCIPIOS — pestaña "Principios" (Etapa A de specs/principios-y-revisiones.md):
// biblioteca de principios y anti-principios, categorías por sección, objetivos con horizonte y cadena de coherencia.
//
// Estado (clave nueva de primer nivel S.principios; sincroniza como cualquier otra, el guardado serializa todo S):
//   S.principios = {
//     principios: [{ id, tipo:'principio'|'anti', enunciado, porque, seccion, haz, noHagas, fuente, habitosIds:['seccion|idHabito'] }],
//     categorias: [{ id, seccion, nombre }],          // precargadas al primer uso (CATEGORIAS_BASE); id estable aunque se renombre
//     sembrado: true,                                 // para no volver a precargar si Tobías borra categorías
//     objetivos: [{ id, texto, horizonte, seccion, categoriaId, estado, fecha, padreKey, principiosIds, habitosIds }],
//     extras:    { 'q:<periodo>:<idObjetivo>': { seccion, categoriaId, padreKey, principiosIds, habitosIds } }
//   }
// `origen` (opcional, solo en principios importados desde Libros): { libroId, tipo:'nota'|'frase'|'aplicar', itemId } — evita reimportar
// el mismo elemento. S.libros solo se lee, nunca se escribe.
// Objetivos trimestrales: NO se duplican. Siguen viviendo en S.quarterlyObjectives (objetivos.js); acá solo se guarda en
// `extras` lo que ese modelo no tiene (sección, categoría, vínculos), con la clave 'q:<periodo>:<id>'.
// Hábitos: tampoco se copian; se referencian por 'seccion|idHabito' (S.habitTrackers, habitos.js).
// categoriaId '' = "Sin categoría". padreKey apunta a otro objetivo propio (su id) o a uno trimestral ('q:...').
// Las funciones puras (sin DOM) están arriba y se exportan para Node al final del archivo.
// ════════════════════════════════════════════════════════════════════════

const PR_SECCIONES = ['Vida', 'Salud', 'Conocimiento', 'Economía', 'IA'];
const PR_TAB_A_SECCION = { vida: 'Vida', salud: 'Salud', conocimiento: 'Conocimiento', finanzas: 'Economía', ia: 'IA' };
const PR_HORIZONTES = [['largo', 'Largo plazo'], ['anual', 'Anual'], ['trimestral', 'Trimestral'], ['mensual', 'Mensual']];
const PR_RANGO = { largo: 4, anual: 3, trimestral: 2, mensual: 1 };   // el padre debe tener rango mayor que el hijo
const PR_ESTADOS = [['pendiente', 'Pendiente'], ['cumplido', 'Cumplido'], ['no_cumplido', 'No cumplido']];
const PR_CATEGORIAS_BASE = {
  'Vida': ['Familia', 'Esposa', 'Hijas (gatas)', 'Religión', 'Concentración', 'Consistencia', 'Planificación'],
  'Economía': ['Austeridad', 'Organización', 'Inversión', 'Trabajo'],
  'Conocimiento': ['Aprendizaje', 'Libros', 'Carrera'],
  'Salud': ['Gym', 'Jiujitsu', 'Boxeo', 'Movilidad', 'Resistencia', 'Fuerza', 'Salud', 'Alimentación'],
  'IA': ['Aprendizaje', 'Proyectos personales', 'Negocios'],
};

// ── Funciones puras ────────────────────────────────────────────────────────
function prSlug(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function prSembrarCategorias() {
  const out = [];
  Object.keys(PR_CATEGORIAS_BASE).forEach(sec => PR_CATEGORIAS_BASE[sec].forEach(n => out.push({ id: 'c-' + prSlug(sec) + '-' + prSlug(n), seccion: sec, nombre: n })));
  return out;
}

function _prHoyLocal() { const d = new Date(), q = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); }

function prKeyTrimestral(periodId, objId) { return 'q:' + periodId + ':' + objId; }

// Une los objetivos propios con los trimestrales existentes (solo lectura de estos) en una lista homogénea.
// qo = S.quarterlyObjectives; catASeccion = mapa categoría-de-objetivo-trimestral → sección (ej. 'Vida' → 'Vida').
function prVistaObjetivos(data, qo, catASeccion) {
  const out = [];
  (data.objetivos || []).forEach(o => out.push({
    key: o.id, origen: 'propio', texto: o.texto, horizonte: o.horizonte, seccion: o.seccion || '', categoriaId: o.categoriaId || '',
    estado: o.estado || 'pendiente', fecha: o.fecha || '', padreKey: o.padreKey || '', cumplidoEl: o.cumplidoEl || '',
    principiosIds: (o.principiosIds || []).slice(), habitosIds: (o.habitosIds || []).slice(), periodo: '',
  }));
  const ex = data.extras || {};
  ((qo && qo.periods) || []).forEach(p => (p.objectives || []).forEach(o => {
    const key = prKeyTrimestral(p.id, o.id), e = ex[key] || {};
    const secDef = (catASeccion && catASeccion[o.category]) || '';
    out.push({
      key, origen: 'trimestral', texto: o.text, horizonte: 'trimestral', seccion: e.seccion != null ? e.seccion : secDef,
      categoriaId: e.categoriaId || '', estado: o.done ? 'cumplido' : 'pendiente', fecha: '', padreKey: e.padreKey || '', cumplidoEl: o.doneAt || '', periodoId: p.id,
      principiosIds: (e.principiosIds || []).slice(), habitosIds: (e.habitosIds || []).slice(), periodo: p.label || p.id,
    });
  }));
  return out;
}

// Cadena hacia arriba: [objetivo, padre, abuelo...]. Corta ante ciclos o padres que ya no existen.
function prCadena(vista, key) {
  const out = [], visto = {};
  let cur = vista.find(x => x.key === key);
  while (cur && !visto[cur.key]) {
    visto[cur.key] = 1; out.push(cur);
    cur = cur.padreKey ? vista.find(x => x.key === cur.padreKey) : null;
  }
  return out;
}

function prHabitoExiste(habitTrackers, ref) {
  const [sec, id] = String(ref).split('|');
  return !!((habitTrackers && habitTrackers[sec]) || []).find(h => h.id === id);
}

// Vista de huecos: objetivos sin ningún principio, y principios sin ningún objetivo ni hábito vinculado.
function prHuecos(vista, principios, habitTrackers) {
  const objetivosSinPrincipio = vista.filter(o => !(o.principiosIds || []).some(id => principios.some(p => p.id === id)));
  const usados = {};
  vista.forEach(o => (o.principiosIds || []).forEach(id => usados[id] = 1));
  const principiosSinVinculo = principios.filter(p => !usados[p.id] && !(p.habitosIds || []).some(r => prHabitoExiste(habitTrackers, r)));
  return { objetivosSinPrincipio, principiosSinVinculo };
}

// Cuántos vínculos se afectan al borrar un principio (para el aviso de confirmación).
function prVinculosDePrincipio(vista, principios, id) {
  const p = principios.find(x => x.id === id);
  const objs = vista.filter(o => (o.principiosIds || []).includes(id));
  return {
    objetivos: objs.length,
    quedanSinPrincipio: objs.filter(o => (o.principiosIds || []).every(x => x === id)).length,
    habitos: p ? (p.habitosIds || []).length : 0,
  };
}

// Cantidad de objetivos (propios + trimestrales con extras) que usan una categoría.
function prContarObjetivosDeCategoria(data, catId) {
  let n = (data.objetivos || []).filter(o => o.categoriaId === catId).length;
  Object.keys(data.extras || {}).forEach(k => { if (data.extras[k].categoriaId === catId) n++; });
  return n;
}

// Elimina la categoría; sus objetivos pasan a destinoId ('' = Sin categoría). Nunca borra objetivos. Devuelve cuántos movió.
function prEliminarCategoria(data, catId, destinoId) {
  const n = prContarObjetivosDeCategoria(data, catId);
  const dest = (destinoId && destinoId !== catId && (data.categorias || []).some(c => c.id === destinoId)) ? destinoId : '';
  (data.objetivos || []).forEach(o => { if (o.categoriaId === catId) o.categoriaId = dest; });
  Object.keys(data.extras || {}).forEach(k => { if (data.extras[k].categoriaId === catId) data.extras[k].categoriaId = dest; });
  data.categorias = (data.categorias || []).filter(c => c.id !== catId);
  return n;
}

// Saca un principio de todos los vínculos y lo borra.
function prEliminarPrincipio(data, id) {
  (data.objetivos || []).forEach(o => { o.principiosIds = (o.principiosIds || []).filter(x => x !== id); });
  Object.keys(data.extras || {}).forEach(k => { const e = data.extras[k]; e.principiosIds = (e.principiosIds || []).filter(x => x !== id); });
  data.principios = (data.principios || []).filter(p => p.id !== id);
}

// Cantidad de objetivos (propios + trimestrales con extras) que tienen a key como padre.
function prContarHijos(data, key) {
  return (data.objetivos || []).filter(o => o.padreKey === key).length + Object.keys(data.extras || {}).filter(k => data.extras[k].padreKey === key).length;
}

// Borra un objetivo propio; sus hijos quedan sin padre (no se pierden).
function prEliminarObjetivo(data, key) {
  data.objetivos = (data.objetivos || []).filter(o => o.id !== key);
  (data.objetivos || []).forEach(o => { if (o.padreKey === key) o.padreKey = ''; });
  Object.keys(data.extras || {}).forEach(k => { if (data.extras[k].padreKey === key) data.extras[k].padreKey = ''; });
}

function prFiltrarPrincipios(lista, q, seccion, tipo) {
  const t = String(q || '').trim().toLowerCase();
  return lista.filter(p => (!seccion || p.seccion === seccion) && (!tipo || p.tipo === tipo)
    && (!t || [p.enunciado, p.porque, p.haz, p.noHagas, p.fuente].some(s => String(s || '').toLowerCase().includes(t))));
}

// ── Recordatorios (Etapa C de specs/principios-y-revisiones.md) ────────────
// principio.disparo = { tipo:'ninguno'|'horario'|'diario'|'datos', hora?:'HH:MM', regla?:{ plantilla, ...parámetros } }; sin `disparo` = ninguno.
// principio.silenciadoHasta = 'YYYY-MM-DD': primer día en que vuelve a avisar (posponer = mañana, silenciar = hoy + 7). No borra nada.
// principio.silenciadoHastaTs = ms: posponer corto (15 min / 1 h / 3 h); solo lo respetan los avisos dentro del Centro (el push por horario mira solo la fecha).
//   · horario → push (kind 'principio' en deadlines.js, que respeta silenciadoHasta) · diario y datos → aviso dentro del Centro (campanita arriba a la derecha).
// Plantillas de regla (parámetros) y su fuente de datos real:
//   habito_sin_cumplir {habito:'seccion|id', dias}  S.habitTrackers[sec][].days[fecha]==='done'
//   sin_entrenar       {dias}                       S.workoutLog (foEntrenoDelDia de foco.js: serie con reps o peso)
//   sueno_menos        {horas}                      S.sleepLog[hoy].hours (se guarda bajo el día en que te levantás)
//   levantarse_fuera   {desde,hasta,dias}           S.sleepLog[f].waketime: los últimos N días CON hora de levantarse registrada, todos fuera de la franja (el último, de hoy o ayer; días sin registro no cuentan ni cumplen ni rompen)
//   acostarse_tarde    {hora,dias}                  S.sleepLog[f].bedtime: igual, las últimas N noches con hora de acostarse, todas después de `hora` (00:10 es antes de 00:30; 23:50 también)
//   gasto_dia          {monto}                      S.transactions: gastos ARS de hoy netos de reintegros, sin cuotas de tarjeta del día 1
//   presupuesto_mes    {}                           S.budgets[mes] (+ fondos del mes) contra el gasto neto del mes: misma regla que _repPresupuesto de reportes.js
//   energia_baja       {nivel}                      S.foco.dias[hoy|ayer].energia (el cierre más reciente de esos dos días)
const PR_DISPAROS = [['ninguno', 'Ninguno'], ['horario', 'Por horario'], ['diario', 'Diario'], ['datos', 'Por mis datos']];
const PR_PLANTILLAS = [['habito_sin_cumplir', 'Pasaron N días sin cumplir un hábito'], ['sin_entrenar', 'Pasaron N días sin entrenar'], ['sueno_menos', 'Dormí menos de X horas anoche'],
  ['levantarse_fuera', 'Me levanto fuera de mi franja N días seguidos'], ['acostarse_tarde', 'Me acuesto tarde N noches seguidas'],
  ['gasto_dia', 'Gasté más de $X hoy'], ['presupuesto_mes', 'Me pasé del presupuesto del mes'], ['energia_baja', 'Mi energía del cierre fue N o menos']];
const _PR_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const _prDiasEntre = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
function prSumarDias(ds, n) { const [y, m, d] = ds.split('-').map(Number), x = new Date(y, m - 1, d + n), q = k => String(k).padStart(2, '0'); return x.getFullYear() + '-' + q(x.getMonth() + 1) + '-' + q(x.getDate()); }
const _prNDias = n => n + (n === 1 ? ' día' : ' días');
const _prNoches = n => n + (n === 1 ? ' noche' : ' noches');
function _prSueno() { return (typeof window !== 'undefined' && window.CMSueno) || require('./sueno-stats.js'); }
const _prNum = n => String(n).replace('.', ',');
const _prPeso = n => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// Pospuesto por fecha (silenciadoHasta, 'YYYY-MM-DD') o por tiempo corto (silenciadoHastaTs, ms: 15 min / 1 h / 3 h). `ahora` (ms) por defecto Date.now().
const prSilenciado = (p, hoy, ahora) => !!p && ((_PR_FECHA.test(p.silenciadoHasta || '') && p.silenciadoHasta > hoy)
  || (Number.isFinite(p.silenciadoHastaTs) && p.silenciadoHastaTs > (ahora == null ? Date.now() : ahora)));
const _prSilenTxt = (p, hoy) => {   // «el 19/11» o «las 09:15»
  if (_PR_FECHA.test(p.silenciadoHasta || '') && p.silenciadoHasta > hoy) return 'el ' + p.silenciadoHasta.slice(8, 10) + '/' + p.silenciadoHasta.slice(5, 7);
  const d = new Date(p.silenciadoHastaTs), q = n => String(n).padStart(2, '0'); return 'las ' + q(d.getHours()) + ':' + q(d.getMinutes());
};

// Valida y limpia los parámetros de una regla. Devuelve la regla normalizada o null si algo no sirve.
function prNormalizarRegla(r) {
  if (!r || typeof r !== 'object') return null;
  const num = (v, min, max, entero) => { if (v == null || String(v).trim() === '') return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) && n >= min && n <= max && (!entero || Math.floor(n) === n) ? n : null; };
  const pl = r.plantilla;
  if (pl === 'habito_sin_cumplir') { const d = num(r.dias, 1, 365, true); return d && /^[^|]+\|[^|]+$/.test(r.habito || '') ? { plantilla: pl, habito: r.habito, dias: d } : null; }
  if (pl === 'sin_entrenar') { const d = num(r.dias, 1, 365, true); return d ? { plantilla: pl, dias: d } : null; }
  if (pl === 'sueno_menos') { const h = num(r.horas, 1, 12); return h ? { plantilla: pl, horas: h } : null; }
  if (pl === 'levantarse_fuera') { const d = num(r.dias, 1, 30, true), h = /^([01]\d|2[0-3]):[0-5]\d$/; return d && h.test(r.desde || '') && h.test(r.hasta || '') ? { plantilla: pl, desde: r.desde, hasta: r.hasta, dias: d } : null; }
  if (pl === 'acostarse_tarde') { const d = num(r.dias, 1, 30, true); return d && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora || '') ? { plantilla: pl, hora: r.hora, dias: d } : null; }
  if (pl === 'gasto_dia') { const m = num(r.monto, 1, 1e12); return m ? { plantilla: pl, monto: m } : null; }
  if (pl === 'presupuesto_mes') return { plantilla: pl };
  if (pl === 'energia_baja') { const n = num(r.nivel, 1, 5, true); return n ? { plantilla: pl, nivel: n } : null; }
  return null;
}
// d = disparo sin limpiar (del formulario). Devuelve { disparo } o { error }.
function prNormalizarDisparo(d) {
  const tipo = d && d.tipo;
  if (tipo === 'horario') return /^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora || '') ? { disparo: { tipo, hora: d.hora } } : { error: 'Elegí la hora del recordatorio' };
  if (tipo === 'diario') return { disparo: { tipo } };
  if (tipo === 'datos') { const r = prNormalizarRegla(d.regla); return r ? { disparo: { tipo, regla: r } } : { error: 'Completá la regla del recordatorio con un número válido' }; }
  return { disparo: { tipo: 'ninguno' } };
}
function prTextoRegla(r, habLabel) {
  r = prNormalizarRegla(r); if (!r) return '';
  if (r.plantilla === 'habito_sin_cumplir') return 'Pasaron ' + _prNDias(r.dias) + ' sin cumplir ' + (habLabel || 'un hábito');
  if (r.plantilla === 'sin_entrenar') return 'Pasaron ' + _prNDias(r.dias) + ' sin entrenar';
  if (r.plantilla === 'sueno_menos') return 'Dormí menos de ' + _prNum(r.horas) + ' horas anoche';
  if (r.plantilla === 'levantarse_fuera') return 'Me levanté fuera de ' + r.desde + '–' + r.hasta + ' ' + _prNDias(r.dias) + ' seguidos';
  if (r.plantilla === 'acostarse_tarde') return 'Me acosté después de las ' + r.hora + ' ' + _prNoches(r.dias) + ' seguidas';
  if (r.plantilla === 'gasto_dia') return 'Gasté más de ' + _prPeso(r.monto) + ' en el día';
  if (r.plantilla === 'presupuesto_mes') return 'Me pasé del presupuesto del mes';
  return 'Mi energía del cierre fue ' + r.nivel + ' o menos';
}
function _prEntrenoFn() { if (typeof foEntrenoDelDia === 'function') return foEntrenoDelDia; try { return require('./foco.js').foEntrenoDelDia; } catch (e) { return null; } }
// Gasto y presupuesto: una sola fuente, reportes.js (repGastos / repPresupuesto). En el navegador es window.CMReportes; en Node, require.
function _prRep() { return (typeof window !== 'undefined' && window.CMReportes) || require('./reportes.js'); }
// Evalúa una regla contra los datos de `hoy` ('YYYY-MM-DD', hora local). PURA. → { activa, detalle }.
// datos = { habitTrackers, workoutLog, sleepLog, transactions, cardCharges, budgets, fondosMes, foco }. Sin dato suficiente → inactiva.
function prEvaluarRegla(regla, datos, hoy) {
  const no = { activa: false, detalle: '' };
  const r = prNormalizarRegla(regla); if (!r || !_PR_FECHA.test(hoy || '')) return no;
  datos = datos || {};
  if (r.plantilla === 'habito_sin_cumplir') {
    const [sec, id] = r.habito.split('|'), h = ((datos.habitTrackers || {})[sec] || []).find(x => x && x.id === id);
    if (!h) return no;
    const hechos = Object.keys(h.days || {}).filter(f => f <= hoy && h.days[f] === 'done').sort();
    if (!hechos.length) return no;   // nunca cumplido: sin dato, no se puede decir "hace cuánto"
    let n = 0;   // días COMPLETOS entre el último 'done' y hoy (hoy no cuenta), sin los 'rest' (descanso; igual que habitos.js)
    for (let f = prSumarDias(hechos[hechos.length - 1], 1); f < hoy; f = prSumarDias(f, 1)) if (h.days[f] !== 'rest') n++;
    return n >= r.dias ? { activa: true, detalle: 'Llevás ' + _prNDias(n) + ' sin cumplir «' + (h.name || 'el hábito') + '»' } : no;
  }
  if (r.plantilla === 'sin_entrenar') {
    const ent = _prEntrenoFn(), w = datos.workoutLog || {}; if (!ent) return no;
    const dias = Object.keys(w).filter(f => f <= hoy && ent(w, f)).sort();
    if (!dias.length) return no;
    const n = Math.max(0, _prDiasEntre(dias[dias.length - 1], hoy) - 1);   // solo días COMPLETOS: hoy no cuenta hasta que termina
    return n >= r.dias ? { activa: true, detalle: 'Llevás ' + _prNDias(n) + ' sin entrenar' } : no;
  }
  if (r.plantilla === 'sueno_menos') {
    const e = (datos.sleepLog || {})[hoy], h = e && e.hours;
    return typeof h === 'number' && h > 0 && h < r.horas ? { activa: true, detalle: 'Anoche dormiste ' + _prNum(h) + ' horas' } : no;
  }
  if (r.plantilla === 'levantarse_fuera' || r.plantilla === 'acostarse_tarde') {
    const SU = _prSueno(), wake = r.plantilla === 'levantarse_fuera', log = datos.sleepLog || {}, ayer = prSumarDias(hoy, -1);
    const dias = Object.keys(log).filter(f => f <= hoy && _PR_FECHA.test(f) && log[f] && SU.horaAMin(wake ? log[f].waketime : log[f].bedtime) != null).sort();
    if (dias.length < r.dias || dias[dias.length - 1] < ayer) return no;   // faltan registros, o el último ya es viejo (dejaste de cargar: no seguir avisando)
    const ult = dias.slice(-r.dias);
    const fuera = wake ? ult.every(f => !SU.enFranja(SU.horaAMin(log[f].waketime), SU.horaAMin(r.desde), SU.horaAMin(r.hasta))) : ult.every(f => SU.acostarseAMin(log[f].bedtime) > SU.acostarseAMin(r.hora));
    if (!fuera) return no;
    return { activa: true, detalle: wake ? 'Hace ' + _prNDias(r.dias) + ' que te levantás fuera de ' + r.desde + '–' + r.hasta : 'Hace ' + _prNoches(r.dias) + ' que te acostás después de las ' + r.hora };
  }
  if (r.plantilla === 'gasto_dia') {
    const g = _prRep().repGastos(datos, { desde: hoy, hasta: hoy }, true).total;
    return g > r.monto ? { activa: true, detalle: 'Hoy gastaste ' + _prPeso(g) + ' (tu tope era ' + _prPeso(r.monto) + ')' } : no;
  }
  if (r.plantilla === 'presupuesto_mes') {
    const mk = hoy.slice(0, 7), ultimo = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();   // último día REAL (repMeses lee 'mk-31' como otro mes)
    const rp = _prRep().repPresupuesto(datos, { desde: mk + '-01', hasta: mk + '-' + String(ultimo).padStart(2, '0') });
    if (!rp || rp.valor == null || !(rp.gastado > rp.presupuestado)) return no;
    return { activa: true, detalle: 'Llevás gastados ' + _prPeso(rp.gastado) + ' y lo presupuestado del mes es ' + _prPeso(rp.presupuestado) };
  }
  const dias = (datos.foco && datos.foco.dias) || {}, ayer = prSumarDias(hoy, -1);
  const f = [hoy, ayer].find(k => dias[k] && Number.isFinite(Number(dias[k].energia)) && Number(dias[k].energia) >= 1);
  if (!f) return no;
  const en = Math.round(Number(dias[f].energia));
  return en <= r.nivel ? { activa: true, detalle: 'Tu energía del cierre de ' + (f === hoy ? 'hoy' : 'ayer') + ' fue ' + en } : no;
}
// Qué avisos hay hoy dentro del Centro: diarios y reglas por datos activas, sin los silenciados/pospuestos. PURA.
function prAvisosDePrincipios(principios, datos, hoy, ahora) {
  const out = { diarios: [], datos: [] };
  (Array.isArray(principios) ? principios : []).forEach(p => {
    const d = p && p.disparo; if (!d || !p.id || prSilenciado(p, hoy, ahora)) return;
    if (d.tipo === 'diario') out.diarios.push(p);
    else if (d.tipo === 'datos') { let ev; try { ev = prEvaluarRegla(d.regla, datos, hoy); } catch (e) { ev = null; } if (ev && ev.activa) out.datos.push({ p, detalle: ev.detalle }); }
  });
  return out;
}

// ── Jarvis: principio del día y sugerencias (puras; sin costo de IA) ───────────────────────────────────────────────────
// → { p, aviso } o null. aviso = { tipo:'datos', detalle } | { tipo:'diario' } | null (rotación). Prioridad: aviso por datos > aviso diario > rotación
// determinística por fecha entre los no silenciados (principios y antiprincipios). `avisos` = salida de prAvisosDePrincipios.
function prPrincipioDelDia(principios, avisos, hoy, ahora) {
  const ok = p => !!p && !!p.id && !!String(p.enunciado || '').trim() && (p.tipo === 'principio' || p.tipo === 'anti');
  const av = avisos || {};
  const dat = (av.datos || []).find(x => x && ok(x.p)); if (dat) return { p: dat.p, aviso: { tipo: 'datos', detalle: dat.detalle || '' } };
  const dia = (av.diarios || []).find(ok); if (dia) return { p: dia, aviso: { tipo: 'diario' } };
  if (!_PR_FECHA.test(hoy || '')) return null;
  const libres = (Array.isArray(principios) ? principios : []).filter(p => ok(p) && !prSilenciado(p, hoy, ahora)).sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  if (!libres.length) return null;
  return { p: libres[_prDiasEntre('2000-01-01', hoy) % libres.length], aviso: null };
}
// Opciones concretas para un principio: [{ id, label, accion }]. ctx = { habitTrackers, hoy }. Solo reglas, sin IA.
//   agendar → crea una actividad de 30 min en el próximo bloque libre de hoy · habito → marca hecho hoy un hábito vinculado sin registro hoy
//   posponer → 1 h · ver → abre el principio.
function prSugerencias(p, aviso, ctx) {
  const out = []; if (!p) return out;
  ctx = ctx || {};
  const corto = (s, n) => s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  const haz = String(p.haz || '').trim();
  if (haz) out.push({ id: 'agendar', label: 'Agendar 30 min ahora: ' + corto(haz, 40), accion: { tipo: 'agendar', texto: haz } });
  for (const ref of (Array.isArray(p.habitosIds) ? p.habitosIds : [])) {
    const [sec, id] = String(ref).split('|'), h = ((ctx.habitTrackers || {})[sec] || []).find(x => x && x.id === id);
    if (!h || !h.name || (h.days || {})[ctx.hoy]) continue;   // hábito borrado o con algún registro hoy (hecho, parcial, descanso…)
    out.push({ id: 'habito', label: 'Marcar «' + corto(h.name, 28) + '» hecho hoy', accion: { tipo: 'habito', ref: sec + '|' + id } }); break;
  }
  out.push({ id: 'posponer', label: 'Posponer 1 h', accion: { tipo: 'posponer', min: 60 } });
  out.push({ id: 'ver', label: 'Ver principio', accion: { tipo: 'ver' } });
  return out;
}
// Texto hablado/escrito del principio del día (español): «Principio de hoy: …» + la razón corta si viene de un aviso por datos.
function prTextoDelDia(sel) {
  if (!sel || !sel.p) return '';
  const fin = s => String(s || '').trim().replace(/[.\s]+$/, '');
  return 'Principio de hoy: ' + fin(sel.p.enunciado) + '.' + (sel.aviso && sel.aviso.tipo === 'datos' && sel.aviso.detalle ? ' ' + fin(sel.aviso.detalle) + '.' : '');
}
// Primer bloque libre de 30 min a partir de `desdeMin` (minutos del día; se redondea hacia arriba a la media hora), dentro de 05:00–24:00.
// ocupados = [{start,end}] en minutos. null si no entra ninguno. Pura.
function prProximoBloqueLibre(desdeMin, ocupados) {
  let s = Math.max(300, Math.ceil(desdeMin / 30) * 30);
  const oc = (Array.isArray(ocupados) ? ocupados : []).filter(o => Number.isFinite(o.start) && Number.isFinite(o.end));
  while (s + 30 <= 1440) {
    const choca = oc.find(o => o.start < s + 30 && o.end > s);
    if (!choca) return s;
    s = Math.ceil(Math.max(choca.end, s + 1) / 30) * 30;
  }
  return null;
}

// ── Importar desde Libros (solo lectura de S.libros; ver `origen` en el modelo de arriba) ──
const PR_LIBRO_CAT_A_SECCION = { finanzas: 'Economía', negocios: 'Economía', fe: 'Vida', filosofia: 'Vida', deporte: 'Salud' };
function prSeccionDeLibro(cat) { return PR_LIBRO_CAT_A_SECCION[prSlug(cat || '')] || 'Conocimiento'; }

function prRecortarEnunciado(s, max) {   // recorta en límite de palabra con "…"; devuelve {texto, recortado}
  max = max || 200; s = String(s || '').trim();
  if (s.length <= max) return { texto: s, recortado: false };
  let c = s.slice(0, max); const sp = c.lastIndexOf(' ');
  if (sp > max * 0.5) c = c.slice(0, sp);
  return { texto: c.replace(/[\s.,;:\-–—]+$/, '') + '…', recortado: true };
}

// Arma el principio (sin id) a partir de un elemento de un libro. tipo: 'nota'|'frase'|'aplicar'.
function prPrincipioDeLibro(libro, tipo, item) {
  libro = libro || {}; item = item || {};
  const titulo = tipo === 'nota' ? String(item.titulo || '').trim() : '';
  const limpio = x => x.replace(/\*\*|`/g, '').replace(/^\s*(#{1,3}|[-*]|\d+\.|\[x?\]|>{1,2})\s+/gm, '');
  const texto = limpio(String(item.texto || '')).trim();
  const base = titulo || texto.split('\n').map(x => x.trim()).find(Boolean) || '', r = prRecortarEnunciado(base, 200);
  const porque = (titulo || r.recortado || texto !== r.texto) ? texto : '';
  const fuente = [libro.titulo, libro.autor].map(x => String(x || '').trim()).filter(Boolean).join(' — ');
  return { tipo: 'principio', enunciado: r.texto, porque, seccion: prSeccionDeLibro(libro.cat), haz: '', noHagas: '', fuente, habitosIds: [],
    origen: { libroId: libro.id, tipo, itemId: item.id } };
}

// Lista por libro: [{libroId, titulo, autor, items:[{tipo, itemId, grupo, titulo, texto, yaImportado}], total, pendientes}]
function prImportCandidatos(libros, principios) {
  const usados = new Set((Array.isArray(principios) ? principios : []).filter(p => p && p.origen).map(p => p.origen.libroId + '|' + p.origen.tipo + '|' + p.origen.itemId));
  const arr = x => Array.isArray(x) ? x : [];
  return arr(libros).filter(l => l && l.id != null).map(l => {
    const items = [];
    const push = (tipo, grupo, it) => {
      if (!it || it.id == null || !(String(it.texto || '').trim() || String(it.titulo || '').trim())) return;
      items.push({ tipo, itemId: it.id, grupo, titulo: String(it.titulo || '').trim(), texto: String(it.texto || '').trim(), yaImportado: usados.has(l.id + '|' + tipo + '|' + it.id) });
    };
    ['ideas', 'filo', 'resumen'].forEach(g => arr(l.notas).filter(n => n && n.cat === g).forEach(n => push('nota', g, n)));
    arr(l.frases).forEach(f => push('frase', 'frases', f));
    arr(l.aplicar).forEach(a => push('aplicar', 'aplicar', a));
    return { libroId: l.id, titulo: l.titulo || 'Sin título', autor: l.autor || '', items, total: items.length, pendientes: items.filter(i => !i.yaImportado).length };
  });
}

// ── Datos ──────────────────────────────────────────────────────────────────
function _prData() {
  if (typeof S === 'undefined') return { principios: [], categorias: [], objetivos: [], extras: {}, sembrado: true };
  let d = S.principios;
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = S.principios = {};
  if (!Array.isArray(d.principios)) d.principios = [];
  if (!Array.isArray(d.objetivos)) d.objetivos = [];
  if (!d.extras || typeof d.extras !== 'object') d.extras = {};
  if (!Array.isArray(d.categorias)) d.categorias = [];
  if (!d.sembrado) { if (!d.categorias.length) d.categorias = prSembrarCategorias(); d.sembrado = true; }
  return d;
}
function _prSave() { if (typeof saveState === 'function') saveState(); }
function _prToast(m) { if (typeof showToast === 'function') showToast(m); }
function _prUid() { return (typeof uid === 'function') ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _prVista() {
  const map = {};
  if (typeof QOBJ_CAT_TO_TAB !== 'undefined') Object.keys(QOBJ_CAT_TO_TAB).forEach(c => map[c] = PR_TAB_A_SECCION[QOBJ_CAT_TO_TAB[c]] || '');
  return prVistaObjetivos(_prData(), (typeof S !== 'undefined') ? S.quarterlyObjectives : null, map);
}
function _prHabitos() {   // [{ref, label, seccion}]
  const out = [];
  const ht = (typeof S !== 'undefined' && S.habitTrackers && !Array.isArray(S.habitTrackers)) ? S.habitTrackers : {};
  Object.keys(ht).forEach(sec => (ht[sec] || []).forEach(h => out.push({ ref: sec + '|' + h.id, label: ((h.emoji || '') + ' ' + (h.name || '')).trim(), seccion: PR_TAB_A_SECCION[sec] || sec })));
  return out;
}
function _prHabLabel(ref) { const h = _prHabitos().find(x => x.ref === ref); return h ? h.label : null; }

// ── UI ─────────────────────────────────────────────────────────────────────
const _prEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let _prV = { sub: 'principios', q: '', fSec: '', fTipo: '', fHor: '', imp: null, edit: null, delCat: null, renCat: null, sel: null };   // sel = id de un principio puntual (destino del aviso)
let _prDraft = null;   // borrador del formulario abierto

function _prRoot() { return document.getElementById('principios-root'); }
function _prSelect(id, opts, val, extra) {
  return '<select id="' + id + '" class="pr-in" ' + (extra || '') + '>' + opts.map(o => '<option value="' + _prEsc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + _prEsc(o[1]) + '</option>').join('') + '</select>';
}
function _prChecks(name, items, marcados) {   // casilla chica a la derecha (convención del Centro)
  if (!items.length) return '<div class="pr-vacio">No hay nada para elegir todavía.</div>';
  return '<div class="pr-checks">' + items.map(it =>
    '<label class="pr-chk"><span>' + _prEsc(it.label) + '</span><input type="checkbox" data-pr="' + name + '" value="' + _prEsc(it.id) + '"' + (marcados.includes(it.id) ? ' checked' : '') + '></label>').join('') + '</div>';
}
function _prCatNombre(id) { const c = _prData().categorias.find(x => x.id === id); return c ? c.nombre : 'Sin categoría'; }

function prRender() {
  const root = _prRoot(); if (!root) return;
  const d = _prData();
  const subs = [['principios', 'Principios'], ['objetivos', 'Objetivos'], ['categorias', 'Categorías'], ['huecos', 'Huecos'], ['foco', 'Foco'], ['revisiones', 'Revisiones'], ['consejero', 'Consejero']];
  const hu = prHuecos(_prVista(), d.principios, S.habitTrackers);
  const nHuecos = hu.objetivosSinPrincipio.length + hu.principiosSinVinculo.length;
  let h = '<div class="pr-subs">' + subs.map(s => '<button type="button" class="pr-sub' + (_prV.sub === s[0] ? ' on' : '') + '" onclick="Principios.sub(\'' + s[0] + '\')">' + s[1] + (s[0] === 'huecos' && nHuecos ? ' <b>' + nHuecos + '</b>' : '') + '</button>').join('') + '</div>';
  if (_prV.sub === 'principios') h += _prVistaPrincipios(d);
  else if (_prV.sub === 'objetivos') h += _prVistaObjetivos(d);
  else if (_prV.sub === 'categorias') h += _prVistaCategorias(d);
  else if (_prV.sub === 'foco') h += (window.Foco ? window.Foco.html() : '');
  else if (_prV.sub === 'revisiones') h += (window.ReportesVista ? window.ReportesVista.htmlSub() : '');
  else if (_prV.sub === 'consejero') h += (window.Consejero ? window.Consejero.html() : '');
  else h += _prVistaHuecos(d, hu);
  root.innerHTML = h;
}

// ── Principios ─────────────────────────────────────────────────────────────
function _prVistaPrincipios(d) {
  if (_prV.edit && _prV.edit.kind === 'principio') return _prFormPrincipio(d);
  if (_prV.imp) return _prVistaImportar(d);
  if (_prV.sel && !d.principios.some(x => x.id === _prV.sel)) _prV.sel = null;
  const lista = _prV.sel ? d.principios.filter(x => x.id === _prV.sel) : prFiltrarPrincipios(d.principios, _prV.q, _prV.fSec, _prV.fTipo);
  const secOpts = [['', 'Todas las secciones']].concat(PR_SECCIONES.map(s => [s, s]));
  const tipoOpts = [['', 'Principios y a evitar'], ['principio', 'Solo principios'], ['anti', 'Solo a evitar']];
  let h = '<div class="pr-bar"><input id="pr-q" class="pr-in" type="search" placeholder="Buscar…" value="' + _prEsc(_prV.q) + '" oninput="Principios.buscar(this.value,this.selectionStart)">'
    + _prSelect('pr-fsec', secOpts, _prV.fSec, 'onchange="Principios.filtro(\'fSec\',this.value)"')
    + _prSelect('pr-ftipo', tipoOpts, _prV.fTipo, 'onchange="Principios.filtro(\'fTipo\',this.value)"')
    + '<button type="button" class="pr-btn pr-btn-p" onclick="Principios.nuevoPrincipio()">+ Principio</button>'
    + '<button type="button" class="pr-btn" onclick="Principios.abrirImportar()">Importar desde Libros</button></div>';
  if (!d.principios.length) return h + '<div class="pr-vacio">Todavía no hay principios. Creá el primero con el botón de arriba.</div>';
  if (!lista.length) return h + '<div class="pr-vacio">Ningún principio coincide con el filtro.</div>';
  const vista = _prVista(), hoy = _prHoyLocal();
  if (_prV.sel) h += '<div class="pr-bar"><div class="pr-nota" style="flex:1;margin:0;align-self:center">Mostrando solo el principio del aviso.</div><button type="button" class="pr-btn fo-btn" onclick="Principios.verTodos()">Ver todos</button></div>';
  h += lista.map(p => {
    const n = vista.filter(o => (o.principiosIds || []).includes(p.id)).length;
    const anti = p.tipo === 'anti', silen = prSilenciado(p, hoy);
    const rec = _prDisparoTxt(p);
    return '<div class="pr-card ' + (anti ? 'pr-anti' : 'pr-prin') + '" id="pr-card-' + _prEsc(p.id) + '">'
      + '<div class="pr-card-h"><span class="pr-tag">' + (anti ? 'A evitar' : 'Principio') + '</span><span class="pr-chip">' + _prEsc(p.seccion || 'Sin sección') + '</span></div>'
      + '<div class="pr-enun">' + _prEsc(p.enunciado) + '</div>'
      + (p.porque ? '<div class="pr-txt"><b>Por qué:</b> ' + _prEsc(p.porque) + '</div>' : '')
      + (p.haz ? '<div class="pr-txt pr-haz"><b>Qué hacer:</b> ' + _prEsc(p.haz) + '</div>' : '')
      + (p.noHagas ? '<div class="pr-txt pr-nohagas"><b>Qué no hacer:</b> ' + _prEsc(p.noHagas) + '</div>' : '')
      + (p.fuente ? '<div class="pr-fuente">Fuente: ' + _prEsc(p.fuente) + '</div>' : '')
      + (rec ? '<div class="pr-fuente">Recordatorio: ' + _prEsc(rec) + (silen ? ' · silenciado hasta ' + _prEsc(_prSilenTxt(p, hoy)) : '') + '</div>' : '')
      + '<div class="pr-card-f"><span class="pr-meta">' + n + ' objetivo' + (n === 1 ? '' : 's') + ' · ' + (p.habitosIds || []).filter(r => _prHabLabel(r)).length + ' hábito(s)</span>'
      + '<span class="pr-acts">' + (silen ? '<button type="button" class="pr-btn" onclick="Principios.reactivar(\'' + p.id + '\')">Reactivar</button>' : '') + '<button type="button" class="pr-btn" onclick="Principios.editarPrincipio(\'' + p.id + '\')">Editar</button>'
      + '<button type="button" class="pr-btn pr-btn-d" onclick="Principios.borrarPrincipio(\'' + p.id + '\')">Borrar</button></span></div></div>';
  }).join('');
  return h;
}

function _prFormPrincipio(d) {
  const p = _prDraft;
  const habs = _prHabitos().map(x => ({ id: x.ref, label: x.label + ' · ' + x.seccion }));
  return '<div class="pr-card pr-form"><div class="pr-form-t">' + (_prV.edit.id ? 'Editar' : 'Nuevo') + '</div>'
    + '<label class="pr-l">Tipo</label>' + _prSelect('prf-tipo', [['principio', 'Principio'], ['anti', 'Comportamiento a evitar']], p.tipo)
    + '<label class="pr-l">Enunciado</label><textarea id="prf-enun" class="pr-in" rows="2" placeholder="Ej: Lo más difícil primero">' + _prEsc(p.enunciado) + '</textarea>'
    + '<label class="pr-l">Por qué</label><textarea id="prf-porque" class="pr-in" rows="3">' + _prEsc(p.porque) + '</textarea>'
    + '<label class="pr-l">Sección</label>' + _prSelect('prf-sec', PR_SECCIONES.map(s => [s, s]), p.seccion)
    + '<label class="pr-l">Qué hacer</label><textarea id="prf-haz" class="pr-in" rows="2">' + _prEsc(p.haz) + '</textarea>'
    + '<label class="pr-l">Qué no hacer</label><textarea id="prf-nohagas" class="pr-in" rows="2">' + _prEsc(p.noHagas) + '</textarea>'
    + '<label class="pr-l">Fuente (autor, libro, "propio")</label><input id="prf-fuente" class="pr-in" value="' + _prEsc(p.fuente) + '">'
    + '<label class="pr-l">Hábitos que lo practican</label>' + _prChecks('hab', habs, p.habitosIds)
    + _prFormDisparo(p)
    + '<div class="pr-form-f"><button type="button" class="pr-btn" onclick="Principios.cancelar()">Cancelar</button><button type="button" class="pr-btn pr-btn-p" onclick="Principios.guardarPrincipio()">Guardar</button></div></div>';
}

// ── Recordatorio en el formulario ──────────────────────────────────────────
function _prDisparoTxt(p) {
  const d = p.disparo; if (!d) return '';
  if (d.tipo === 'horario' && /^\d{2}:\d{2}$/.test(d.hora || '')) return 'todos los días a las ' + d.hora;
  if (d.tipo === 'diario') return 'una vez por día, al abrir el Centro';
  if (d.tipo === 'datos') return prTextoRegla(d.regla, d.regla && _prHabLabel(d.regla.habito));
  return '';
}
function _prFormDisparo(p) {
  const d = p.disparo || { tipo: 'ninguno' }, tipo = d.tipo || 'ninguno', r = d.regla || {};
  let h = '<label class="pr-l">Recordatorio</label>' + _prSelect('prf-disp', PR_DISPAROS, tipo, 'onchange="Principios.cambioDisparo()"');
  if (tipo === 'horario') h += '<label class="pr-l">Hora del aviso al celular (todos los días)</label><input id="prf-hora" class="pr-in fo-hora" type="time" value="' + _prEsc(d.hora || '') + '">';
  else if (tipo === 'diario') h += '<div class="pr-nota">Una vez por día, como aviso al abrir el Centro, con el motivo.</div>';
  else if (tipo === 'datos') {
    const def = (v, x) => (v == null || v === '' ? x : v), pl = r.plantilla || PR_PLANTILLAS[0][0], num = (id, lbl, v, min, max, step) => '<label class="pr-l">' + lbl + '</label><input id="' + id + '" class="pr-in fo-hs" type="number" inputmode="decimal" min="' + min + '" max="' + max + '" step="' + step + '" value="' + _prEsc(v == null ? '' : v) + '">';
    h += '<label class="pr-l">Avisarme cuando…</label>' + _prSelect('prf-pl', PR_PLANTILLAS, pl, 'onchange="Principios.cambioDisparo()"');
    if (pl === 'habito_sin_cumplir') h += '<label class="pr-l">Hábito</label>' + _prSelect('prf-hab', _prHabitos().map(x => [x.ref, x.label + ' · ' + x.seccion]), r.habito || '') + num('prf-dias', 'Días sin cumplirlo', def(r.dias, 3), 1, 365, 1);
    else if (pl === 'sin_entrenar') h += num('prf-dias', 'Días sin entrenar', def(r.dias, 3), 1, 365, 1);
    else if (pl === 'sueno_menos') h += num('prf-horas', 'Horas de sueño (avisa si dormiste menos)', def(r.horas, 6), 1, 12, 0.5);
    else if (pl === 'levantarse_fuera') h += '<label class="pr-l">Mi franja para levantarme (avisa si te levantás fuera)</label><div class="pr-fila"><input id="prf-desde" class="pr-in fo-hora" type="time" value="' + _prEsc(def(r.desde, '06:45')) + '"><input id="prf-hasta" class="pr-in fo-hora" type="time" value="' + _prEsc(def(r.hasta, '07:15')) + '"></div>' + num('prf-dias', 'Días seguidos fuera de la franja', def(r.dias, 3), 1, 30, 1) + '<div class="pr-nota">Cuentan los días en que cargaste la hora de levantarte; los que no cargaste no suman ni cortan la racha.</div>';
    else if (pl === 'acostarse_tarde') h += '<label class="pr-l">Hora límite para acostarme (avisa si te acostás después)</label><input id="prf-hora-ac" class="pr-in fo-hora" type="time" value="' + _prEsc(def(r.hora, '00:30')) + '">' + num('prf-dias', 'Noches seguidas tarde', def(r.dias, 3), 1, 30, 1) + '<div class="pr-nota">Cuentan las noches en que cargaste la hora de acostarte; las que no cargaste no suman ni cortan la racha.</div>';
    else if (pl === 'gasto_dia') h += num('prf-monto', 'Monto en pesos (avisa si gastaste más hoy)', r.monto, 1, 1000000000, 1);
    else if (pl === 'energia_baja') h += '<label class="pr-l">Energía del cierre (avisa si fue esta o menos)</label>' + _prSelect('prf-nivel', [1, 2, 3, 4, 5].map(n => [n, String(n)]), def(r.nivel, 2));
    else h += '<div class="pr-nota">Compara lo gastado en el mes con el presupuesto que cargaste.</div>';
    h += '<div class="pr-nota">Aparece como tarjeta al abrir el Centro y se revisa cada 5 minutos.</div>';
  }
  return h;
}
function _prLeerDisparo() {   // lo tipeado en el formulario, sin limpiar (prNormalizarDisparo valida)
  const tipo = _prVal('prf-disp') || 'ninguno';
  if (tipo === 'horario') return { tipo, hora: _prVal('prf-hora') };
  if (tipo === 'datos') return { tipo, regla: { plantilla: _prVal('prf-pl') || PR_PLANTILLAS[0][0], habito: _prVal('prf-hab'), dias: _prVal('prf-dias'), horas: _prVal('prf-horas'), monto: _prVal('prf-monto'), desde: _prVal('prf-desde'), hasta: _prVal('prf-hasta'), hora: _prVal('prf-hora-ac'), nivel: _prVal('prf-nivel') } };
  return { tipo };
}

// ── Importar desde Libros ──────────────────────────────────────────────────
const _PR_GRUPOS = { ideas: 'Ideas prácticas', filo: 'Filosofía y lecciones', resumen: 'Resumen y opinión', frases: 'Frases', aplicar: 'Para aplicar' };
function _prLibros() { return (typeof S !== 'undefined' && S.libros && Array.isArray(S.libros.items)) ? S.libros.items : []; }
function _prVistaImportar(d) {
  const cands = prImportCandidatos(_prLibros(), d.principios);
  const volver = '<button type="button" class="pr-btn" onclick="Principios.cerrarImportar()">' + (_prV.imp.libroId == null ? 'Volver' : '← Libros') + '</button>';
  if (_prV.imp.libroId == null) {
    let h = '<div class="pr-bar"><div class="pr-form-t" style="flex:1;margin:0;align-self:center">Importar desde Libros</div>' + volver + '</div>';
    if (!cands.length) return h + '<div class="pr-vacio">Todavía no cargaste libros. Agregalos en Conocimiento → Libros y volvé acá.</div>';
    return h + cands.map(c => '<button type="button" class="pr-card pr-libro" data-libro="' + _prEsc(c.libroId) + '" onclick="Principios.elegirLibro(this.dataset.libro)">'
      + '<div class="pr-enun">' + _prEsc(c.titulo) + (c.autor ? ' — ' + _prEsc(c.autor) : '') + '</div>'
      + '<div class="pr-meta">' + (c.total ? c.total + ' elemento' + (c.total === 1 ? '' : 's') + ' para importar' + (c.total - c.pendientes ? ' · ' + (c.total - c.pendientes) + ' ya importado(s)' : '') : 'Sin notas, frases ni cosas para aplicar') + '</div></button>').join('');
  }
  const c = cands.find(x => String(x.libroId) === String(_prV.imp.libroId));
  if (!c) return '<div class="pr-bar">' + volver + '</div><div class="pr-vacio">No encontramos ese libro.</div>';
  let h = '<div class="pr-bar"><div class="pr-form-t" style="flex:1;margin:0;align-self:center">' + _prEsc(c.titulo) + (c.autor ? ' — ' + _prEsc(c.autor) : '') + '</div>' + volver + '</div>';
  if (!c.total) return h + '<div class="pr-vacio">Este libro todavía no tiene notas, frases ni cosas para aplicar.</div>';
  Object.keys(_PR_GRUPOS).forEach(g => {
    const its = c.items.filter(i => i.grupo === g); if (!its.length) return;
    h += '<div class="pr-l">' + _PR_GRUPOS[g] + '</div><div class="pr-checks">' + its.map(i => {
      const txt = i.titulo ? '<b>' + _prEsc(i.titulo) + '</b>' + (i.texto ? '<br>' + _prEsc(i.texto.length > 160 ? i.texto.slice(0, 160) + '…' : i.texto) : '') : _prEsc(i.texto.length > 200 ? i.texto.slice(0, 200) + '…' : i.texto);
      return '<label class="pr-chk"><span>' + txt + (i.yaImportado ? ' <em class="pr-ya">ya importado</em>' : '') + '</span><input type="checkbox" data-pr="imp" value="' + _prEsc(i.tipo + '|' + i.itemId) + '"' + (i.yaImportado ? ' disabled' : '') + '></label>';
    }).join('') + '</div>';
  });
  return h + '<div class="pr-form-f"><button type="button" class="pr-btn pr-btn-p" onclick="Principios.importarMarcados()">Importar seleccionados</button></div>';
}

// ── Objetivos ──────────────────────────────────────────────────────────────
function _prVistaObjetivos(d) {
  if (_prV.edit && _prV.edit.kind === 'objetivo') return _prFormObjetivo(d);
  const vista = _prVista();
  const horOpts = [['', 'Todos los horizontes']].concat(PR_HORIZONTES);
  let h = '<div class="pr-bar">' + _prSelect('pr-fhor', horOpts, _prV.fHor, 'onchange="Principios.filtro(\'fHor\',this.value)"')
    + _prSelect('pr-fsec', [['', 'Todas las secciones']].concat(PR_SECCIONES.map(s => [s, s])), _prV.fSec, 'onchange="Principios.filtro(\'fSec\',this.value)"')
    + '<button type="button" class="pr-btn pr-btn-p" onclick="Principios.nuevoObjetivo()">+ Objetivo</button></div>';
  const lista = vista.filter(o => (!_prV.fHor || o.horizonte === _prV.fHor) && (!_prV.fSec || o.seccion === _prV.fSec));
  if (!lista.length) return h + '<div class="pr-vacio">No hay objetivos para este filtro.</div>';
  lista.sort((a, b) => PR_RANGO[b.horizonte] - PR_RANGO[a.horizonte]);
  h += '<div class="pr-nota">Los objetivos trimestrales son los de cada pestaña (se editan allá); acá les sumás sección, categoría y vínculos.</div>';
  h += lista.map(o => {
    const cad = prCadena(vista, o.key).slice(1);
    const horN = (PR_HORIZONTES.find(x => x[0] === o.horizonte) || [])[1];
    const estN = (PR_ESTADOS.find(x => x[0] === o.estado) || [])[1];
    const nP = o.principiosIds.filter(id => d.principios.some(p => p.id === id)).length;
    const nH = o.habitosIds.filter(r => _prHabLabel(r)).length;
    return '<div class="pr-card pr-obj pr-est-' + o.estado + '">'
      + '<div class="pr-card-h"><span class="pr-chip pr-chip-h">' + _prEsc(horN) + (o.periodo ? ' · ' + _prEsc(o.periodo) : '') + '</span>'
      + '<span class="pr-chip">' + _prEsc(o.seccion || 'Sin sección') + (o.seccion ? ' › ' + _prEsc(_prCatNombre(o.categoriaId)) : '') + '</span>'
      + '<span class="pr-chip pr-chip-e">' + _prEsc(estN) + '</span></div>'
      + '<div class="pr-enun">' + _prEsc(o.texto) + '</div>'
      + (cad.length ? '<div class="pr-cadena">' + cad.map(c => _prEsc(c.texto)).join(' ‹ ') + '</div>' : '')
      + '<div class="pr-card-f"><span class="pr-meta">' + nP + ' principio(s) · ' + nH + ' hábito(s)' + (o.fecha ? ' · ' + _prEsc(o.fecha) : '') + '</span>'
      + '<span class="pr-acts"><button type="button" class="pr-btn" onclick="Principios.editarObjetivo(\'' + _prEsc(o.key) + '\')">Editar</button>'
      + (o.origen === 'propio' ? '<button type="button" class="pr-btn pr-btn-d" onclick="Principios.borrarObjetivo(\'' + _prEsc(o.key) + '\')">Borrar</button>' : '') + '</span></div></div>';
  }).join('');
  return h;
}

function _prCatOpts(seccion) {
  return [['', 'Sin categoría']].concat(_prData().categorias.filter(c => c.seccion === seccion).map(c => [c.id, c.nombre]));
}

function _prFormObjetivo(d) {
  const o = _prDraft, propio = o.origen === 'propio';
  const vista = _prVista();
  const padresFix = vista.filter(x => x.key !== o.key && PR_RANGO[x.horizonte] > PR_RANGO[o.horizonte]);
  const padreOpts = [['', 'Ninguno']].concat(padresFix.map(x => [x.key, (PR_HORIZONTES.find(z => z[0] === x.horizonte) || [])[1] + ': ' + x.texto.slice(0, 60)]));
  const pr = d.principios.map(p => ({ id: p.id, label: (p.tipo === 'anti' ? '[A evitar] ' : '') + p.enunciado.slice(0, 70) }));
  const habs = _prHabitos().map(x => ({ id: x.ref, label: x.label + ' · ' + x.seccion }));
  return '<div class="pr-card pr-form"><div class="pr-form-t">' + (o.nuevo ? 'Nuevo objetivo' : 'Editar objetivo') + '</div>'
    + (propio
      ? '<label class="pr-l">Objetivo</label><textarea id="pro-texto" class="pr-in" rows="2">' + _prEsc(o.texto) + '</textarea>'
        + '<label class="pr-l">Horizonte</label>' + _prSelect('pro-hor', PR_HORIZONTES, o.horizonte, 'onchange="Principios.cambioHorizonte()"')
      : '<div class="pr-enun">' + _prEsc(o.texto) + '</div><div class="pr-nota">Trimestral (' + _prEsc(o.periodo) + '). El texto y el estado se cambian en la pestaña de cada sección.</div>')
    + '<label class="pr-l">Sección</label>' + _prSelect('pro-sec', [['', 'Sin sección']].concat(PR_SECCIONES.map(s => [s, s])), o.seccion, 'onchange="Principios.cambioSeccion()"')
    + '<label class="pr-l">Categoría</label>' + _prSelect('pro-cat', _prCatOpts(o.seccion), o.categoriaId)
    + (propio ? '<label class="pr-l">Estado</label>' + _prSelect('pro-est', PR_ESTADOS, o.estado)
      + '<label class="pr-l">Fecha</label><input id="pro-fecha" class="pr-in" type="date" value="' + _prEsc(o.fecha) + '">' : '')
    + '<label class="pr-l">Forma parte de (objetivo de horizonte mayor)</label>' + _prSelect('pro-padre', padreOpts, o.padreKey)
    + '<label class="pr-l">Principios</label>' + _prChecks('prin', pr, o.principiosIds)
    + '<label class="pr-l">Hábitos</label>' + _prChecks('hab', habs, o.habitosIds)
    + '<div class="pr-form-f"><button type="button" class="pr-btn" onclick="Principios.cancelar()">Cancelar</button><button type="button" class="pr-btn pr-btn-p" onclick="Principios.guardarObjetivo()">Guardar</button></div></div>';
}

// ── Categorías ─────────────────────────────────────────────────────────────
function _prVistaCategorias(d) {
  let h = '<div class="pr-nota">Las secciones son fijas. Las categorías las podés crear, renombrar o borrar; "Aprendizaje" en Conocimiento y en IA son independientes.</div>';
  h += PR_SECCIONES.map(sec => {
    const cats = d.categorias.filter(c => c.seccion === sec);
    return '<div class="pr-card"><div class="pr-card-h"><span class="pr-chip pr-chip-h">' + sec + '</span></div>'
      + (cats.length ? cats.map(c => {
        const n = prContarObjetivosDeCategoria(d, c.id);
        if (_prV.renCat === c.id) return '<div class="pr-cat"><input id="pr-ren" class="pr-in" value="' + _prEsc(c.nombre) + '" onkeydown="if(event.key===\'Enter\')Principios.guardarRenombre(\'' + c.id + '\')"><span class="pr-acts"><button type="button" class="pr-btn pr-btn-p" onclick="Principios.guardarRenombre(\'' + c.id + '\')">Listo</button><button type="button" class="pr-btn" onclick="Principios.cancelar()">Cancelar</button></span></div>';
        if (_prV.delCat === c.id) {
          const dest = [['', 'Sin categoría']].concat(cats.filter(x => x.id !== c.id).map(x => [x.id, x.nombre]));
          return '<div class="pr-cat pr-cat-del"><div class="pr-nota">' + (n ? 'Tiene ' + n + ' objetivo(s). Pasan a:' : 'No tiene objetivos.') + '</div>'
            + (n ? _prSelect('pr-dest', dest, '') : '') + '<span class="pr-acts"><button type="button" class="pr-btn pr-btn-d" onclick="Principios.confirmarBorrarCategoria(\'' + c.id + '\')">Borrar "' + _prEsc(c.nombre) + '"</button><button type="button" class="pr-btn" onclick="Principios.cancelar()">Cancelar</button></span></div>';
        }
        return '<div class="pr-cat"><span>' + _prEsc(c.nombre) + ' <small class="pr-meta">' + n + '</small></span><span class="pr-acts"><button type="button" class="pr-btn" onclick="Principios.renombrarCategoria(\'' + c.id + '\')">Renombrar</button><button type="button" class="pr-btn pr-btn-d" onclick="Principios.borrarCategoria(\'' + c.id + '\')">Borrar</button></span></div>';
      }).join('') : '<div class="pr-vacio">Sin categorías.</div>')
      + '<div class="pr-cat"><input id="pr-nc-' + prSlug(sec) + '" class="pr-in" placeholder="Nueva categoría" onkeydown="if(event.key===\'Enter\')Principios.nuevaCategoria(\'' + sec + '\')"><button type="button" class="pr-btn pr-btn-p" onclick="Principios.nuevaCategoria(\'' + sec + '\')">Agregar</button></div></div>';
  }).join('');
  return h;
}

// ── Huecos ─────────────────────────────────────────────────────────────────
function _prVistaHuecos(d, hu) {
  let h = '<div class="pr-card"><div class="pr-card-h"><span class="pr-chip pr-chip-h">Objetivos sin ningún principio (' + hu.objetivosSinPrincipio.length + ')</span></div>';
  h += hu.objetivosSinPrincipio.length ? hu.objetivosSinPrincipio.map(o => '<div class="pr-cat"><span>' + _prEsc(o.texto) + ' <small class="pr-meta">' + _prEsc((PR_HORIZONTES.find(x => x[0] === o.horizonte) || [])[1]) + (o.periodo ? ' ' + _prEsc(o.periodo) : '') + '</small></span><button type="button" class="pr-btn" onclick="Principios.editarObjetivo(\'' + _prEsc(o.key) + '\')">Vincular</button></div>').join('') : '<div class="pr-vacio">Todos los objetivos tienen al menos un principio.</div>';
  h += '</div><div class="pr-card"><div class="pr-card-h"><span class="pr-chip pr-chip-h">Principios sin objetivo ni hábito (' + hu.principiosSinVinculo.length + ')</span></div>';
  h += hu.principiosSinVinculo.length ? hu.principiosSinVinculo.map(p => '<div class="pr-cat"><span>' + _prEsc(p.enunciado) + '</span><button type="button" class="pr-btn" onclick="Principios.editarPrincipio(\'' + p.id + '\')">Vincular</button></div>').join('') : '<div class="pr-vacio">Todos los principios están conectados.</div>';
  return h + '</div>';
}

// ── Acciones ───────────────────────────────────────────────────────────────
function _prVals(name) { return Array.from(document.querySelectorAll('input[data-pr="' + name + '"]:checked')).map(i => i.value); }
function _prVal(id) { const e = document.getElementById(id); return e ? e.value : ''; }
function _prLeerBorradorObjetivo() {   // conserva lo tipeado al cambiar horizonte/sección sin guardar
  const o = _prDraft;
  if (o.origen === 'propio') { o.texto = _prVal('pro-texto'); o.horizonte = _prVal('pro-hor') || o.horizonte; o.estado = _prVal('pro-est') || o.estado; o.fecha = _prVal('pro-fecha'); }
  o.seccion = _prVal('pro-sec'); o.categoriaId = _prVal('pro-cat'); o.padreKey = _prVal('pro-padre');
  o.principiosIds = _prVals('prin'); o.habitosIds = _prVals('hab');
}

function _prVuelca() {   // lo tipeado en el formulario abierto pasa al borrador antes de cerrar/cambiar de sub-pestaña: nunca se pierde
  const e = _prV.edit; if (!e || !_prDraft) return;
  if (e.kind === 'principio') {
    if (!document.getElementById('prf-enun')) return;   // el formulario no está en pantalla (otra sub-pestaña)
    const p = _prDraft;
    p.tipo = _prVal('prf-tipo') === 'anti' ? 'anti' : 'principio'; p.enunciado = _prVal('prf-enun'); p.porque = _prVal('prf-porque');
    p.seccion = _prVal('prf-sec'); p.haz = _prVal('prf-haz'); p.noHagas = _prVal('prf-nohagas'); p.fuente = _prVal('prf-fuente'); p.habitosIds = _prVals('hab');
    p.disparo = _prLeerDisparo();
  } else if (e.kind === 'objetivo') {
    if (document.getElementById('pro-sec')) _prLeerBorradorObjetivo();
  }
}

const Principios = {
  render: prRender,
  sub(s) { _prVuelca(); _prV.sub = s; _prV.imp = null; _prV.delCat = null; _prV.renCat = null; _prV.sel = null; prRender(); },
  filtro(k, v) { _prV[k] = v; _prV.sel = null; prRender(); },
  cambioDisparo() { _prVuelca(); prRender(); },
  verTodos() { _prV.sel = null; prRender(); },
  buscar(v, pos) { _prV.q = v; _prV.sel = null; prRender(); const e = document.getElementById('pr-q'); if (e) { const p = pos == null ? v.length : pos; e.focus(); e.setSelectionRange(p, p); } },
  abrirImportar() { _prV.imp = { libroId: null }; prRender(); },
  elegirLibro(id) { _prV.imp = { libroId: id }; prRender(); },
  cerrarImportar() { if (_prV.imp && _prV.imp.libroId != null) _prV.imp.libroId = null; else _prV.imp = null; prRender(); },
  importarMarcados() {
    const d = _prData(), libro = _prLibros().find(l => String(l.id) === String(_prV.imp.libroId));
    const marcados = _prVals('imp'); if (!libro) return;
    if (!marcados.length) { _prToast('Marcá al menos uno'); return; }
    const cand = prImportCandidatos([libro], d.principios)[0]; let n = 0;
    marcados.forEach(v => {
      const i = cand.items.find(x => x.tipo + '|' + x.itemId === v);
      if (!i || i.yaImportado) return;
      const src = i.tipo === 'nota' ? libro.notas : i.tipo === 'frase' ? libro.frases : libro.aplicar;
      const it = (src || []).find(x => x && String(x.id) === String(i.itemId)); if (!it) return;
      const p = prPrincipioDeLibro(libro, i.tipo, it); p.id = _prUid(); d.principios.push(p); n++;
    });
    if (n) _prSave();
    _prV.imp = null; prRender(); _prToast(n ? n + ' principio' + (n === 1 ? '' : 's') + ' importado' + (n === 1 ? '' : 's') + '. Podés editarlos.' : 'Nada para importar');
  },
  cancelar() { _prV.edit = null; _prV.delCat = null; _prV.renCat = null; _prDraft = null; prRender(); },

  nuevoPrincipio() { _prDraft = { tipo: 'principio', enunciado: '', porque: '', seccion: _prV.fSec || 'Vida', haz: '', noHagas: '', fuente: '', habitosIds: [] }; _prV.edit = { kind: 'principio', id: null }; prRender(); },
  editarPrincipio(id) {
    const p = _prData().principios.find(x => x.id === id); if (!p) return;
    _prDraft = Object.assign({}, p, { habitosIds: (p.habitosIds || []).slice() }); _prV.sub = 'principios'; _prV.edit = { kind: 'principio', id }; prRender();
  },
  guardarPrincipio() {
    const d = _prData(), p = _prDraft;
    const enun = _prVal('prf-enun').trim();
    if (!enun) { _prToast('Escribí el enunciado'); return; }
    const nd = prNormalizarDisparo(_prLeerDisparo());
    if (nd.error) { _prToast(nd.error); return; }
    const nuevo = {
      id: _prV.edit.id || _prUid(), disparo: nd.disparo, tipo: _prVal('prf-tipo') === 'anti' ? 'anti' : 'principio', enunciado: enun, porque: _prVal('prf-porque').trim(),
      seccion: _prVal('prf-sec'), haz: _prVal('prf-haz').trim(), noHagas: _prVal('prf-nohagas').trim(), fuente: _prVal('prf-fuente').trim(), habitosIds: _prVals('hab'),
    };
    if (p && p.origen) nuevo.origen = p.origen;
    if (p && p.silenciadoHasta) nuevo.silenciadoHasta = p.silenciadoHasta;
    if (p && p.silenciadoHastaTs) nuevo.silenciadoHastaTs = p.silenciadoHastaTs;
    const i = d.principios.findIndex(x => x.id === nuevo.id);
    if (i >= 0) d.principios[i] = nuevo; else d.principios.push(nuevo);
    _prV.edit = null; _prDraft = null; _prSave(); prRender(); _prToast('Guardado');
  },
  borrarPrincipio(id) {
    const d = _prData(), p = d.principios.find(x => x.id === id); if (!p) return;
    const v = prVinculosDePrincipio(_prVista(), d.principios, id);
    let msg = 'Vas a borrar "' + p.enunciado.slice(0, 80) + '".';
    if (v.objetivos || v.habitos) msg += '\n\nEstá vinculado a ' + v.objetivos + ' objetivo(s) y ' + v.habitos + ' hábito(s).' + (v.quedanSinPrincipio ? ' ' + v.quedanSinPrincipio + ' objetivo(s) quedan sin ningún principio.' : '');
    if (!confirm(msg + '\n\n¿Confirmás?')) return;
    prEliminarPrincipio(d, id); _prSave(); prRender();
  },

  nuevoObjetivo() { _prDraft = { origen: 'propio', nuevo: true, key: '', texto: '', horizonte: _prV.fHor || 'mensual', seccion: _prV.fSec || '', categoriaId: '', estado: 'pendiente', fecha: '', padreKey: '', principiosIds: [], habitosIds: [] }; _prV.edit = { kind: 'objetivo' }; prRender(); },
  editarObjetivo(key) {
    const o = _prVista().find(x => x.key === key); if (!o) return;
    _prDraft = Object.assign({}, o, { nuevo: false, principiosIds: o.principiosIds.slice(), habitosIds: o.habitosIds.slice() }); _prV.sub = 'objetivos'; _prV.edit = { kind: 'objetivo' }; prRender();
  },
  cambioHorizonte() { _prLeerBorradorObjetivo(); if (_prDraft.padreKey) { const v = _prVista().find(x => x.key === _prDraft.padreKey); if (!v || PR_RANGO[v.horizonte] <= PR_RANGO[_prDraft.horizonte]) _prDraft.padreKey = ''; } prRender(); },
  cambioSeccion() { _prLeerBorradorObjetivo(); _prDraft.categoriaId = ''; prRender(); },
  guardarObjetivo() {
    _prLeerBorradorObjetivo();
    const d = _prData(), o = _prDraft;
    if (o.origen === 'propio') {
      if (!o.texto.trim()) { _prToast('Escribí el objetivo'); return; }
      const reg = { id: o.key || _prUid(), texto: o.texto.trim(), horizonte: o.horizonte, seccion: o.seccion, categoriaId: o.categoriaId, estado: o.estado, fecha: o.fecha, padreKey: o.padreKey, principiosIds: o.principiosIds, habitosIds: o.habitosIds };
      const i = d.objetivos.findIndex(x => x.id === reg.id);
      if (reg.estado === 'cumplido') { const prev = i >= 0 ? d.objetivos[i] : null; if (prev && prev.estado === 'cumplido') { if (prev.cumplidoEl) reg.cumplidoEl = prev.cumplidoEl; } else reg.cumplidoEl = _prHoyLocal(); }
      if (i >= 0 && d.objetivos[i].origen) reg.origen = d.objetivos[i].origen;   // creado desde un Reporte: conserva de dónde vino (no se duplica la conversión)
      if (i >= 0) d.objetivos[i] = reg; else d.objetivos.push(reg);
    } else {
      d.extras[o.key] = { seccion: o.seccion, categoriaId: o.categoriaId, padreKey: o.padreKey, principiosIds: o.principiosIds, habitosIds: o.habitosIds };
    }
    _prV.edit = null; _prDraft = null; _prSave(); prRender(); _prToast('Guardado');
  },
  borrarObjetivo(key) {
    const d = _prData(), o = d.objetivos.find(x => x.id === key); if (!o) return;
    const hijos = prContarHijos(d, key);
    if (!confirm('Vas a borrar "' + o.texto.slice(0, 80) + '".' + (hijos ? '\n\n' + hijos + ' objetivo(s) quedan sin objetivo padre.' : '') + '\n\n¿Confirmás?')) return;
    prEliminarObjetivo(d, key); _prSave(); prRender();
  },

  nuevaCategoria(sec) {
    const e = document.getElementById('pr-nc-' + prSlug(sec)), n = e ? e.value.trim() : '';
    if (!n) return;
    const d = _prData();
    if (d.categorias.some(c => c.seccion === sec && c.nombre.toLowerCase() === n.toLowerCase())) { _prToast('Ya existe en ' + sec); return; }
    d.categorias.push({ id: 'c-' + prSlug(sec) + '-' + prSlug(n) + '-' + _prUid(), seccion: sec, nombre: n });
    _prSave(); prRender();
  },
  renombrarCategoria(id) { _prV.renCat = id; _prV.delCat = null; prRender(); const e = document.getElementById('pr-ren'); if (e) e.focus(); },
  guardarRenombre(id) {
    const n = _prVal('pr-ren').trim(); if (!n) return;
    const d = _prData(), c = d.categorias.find(x => x.id === id); if (!c) return;
    if (d.categorias.some(x => x.id !== id && x.seccion === c.seccion && x.nombre.toLowerCase() === n.toLowerCase())) { _prToast('Ya existe en ' + c.seccion); return; }
    c.nombre = n; _prV.renCat = null; _prSave(); prRender();
  },
  borrarCategoria(id) { _prV.delCat = id; _prV.renCat = null; prRender(); },
  confirmarBorrarCategoria(id) {
    const d = _prData(), n = prEliminarCategoria(d, id, _prVal('pr-dest'));
    _prV.delCat = null; _prSave(); prRender(); _prToast(n ? n + ' objetivo(s) reasignados' : 'Categoría borrada');
  },
};
if (typeof window !== 'undefined') window.Principios = Principios;

// Principios ya no es una pestaña del menú: vive en una ventana (CMOverlay) que se abre desde el abanico de Vida,
// la paleta de comandos y el deep-link de los chequeos de Foco. `sub` (opcional) abre directo en esa sub-pestaña.
function prAbrir(sub) {
  if (typeof CMOverlay === 'undefined') return;
  const { overlay, body } = CMOverlay.build({ id: 'ov-principios', accent: '#6B8EFF', onClose: _prVuelca });
  if (!overlay._prBuilt) {
    body.innerHTML = '<div class="cm-ov-head"><div class="cm-ov-eyebrow">VIDA · PRINCIPIOS</div><div class="cm-ov-title">Principios</div></div><div id="principios-root"></div>';
    overlay._prBuilt = true;
  }
  if (sub) Principios.sub(sub); else prRender();
  document.body.appendChild(overlay);
  CMOverlay.open(overlay);
}
if (typeof window !== 'undefined') { Principios.abrir = prAbrir; window.openPrincipiosOverlay = prAbrir; }

// ── Avisos dentro del Centro (diarios y por datos): campanita + panel + destino del push de horario ───────────────────
// Campanita fija arriba a la derecha (en la franja del ticker, a la izquierda del botón de Game Mode) con el contador de avisos activos. Un aviso NUEVO
// (que no se había mostrado en esta sesión) se despliega 8 s como una tarjeta grande con el texto completo y se pliega al panel; si llegan varios juntos,
// una sola tarjeta con «y N más». El panel lista todos con sus acciones. Se evalúa al abrir la app (enganche a renderGoals, igual que foco.js) y cada 5 minutos
// (único intervalo; un posponer corto programa además un setTimeout al vencimiento más próximo). «Visto» del diario y «Ocultar» son por dispositivo.
const PR_AV_CARD_MS = 8000;
let _prAvSig = '', _prAvItems = [], _prAvAbierto = false, _prAvCard = [];
let _prAvTimer = null, _prAvTsTimer = null;
const _prAvMostrados = new Set();   // avisos que ya se desplegaron en esta sesión (se olvidan al desaparecer: si vuelven, son nuevos)
const _prOcultos = {};              // "Ocultar" de los avisos por datos: id → firma del aviso; en memoria, vuelve al cambiar el estado o al recargar
function _prVistoKey(hoy) { return 'cm_pr_visto_' + hoy; }
// Valor: '1' (todos los diarios del día) o un JSON con los ids vistos.
function _prVistosHoy(hoy) { try { const v = localStorage.getItem(_prVistoKey(hoy)); if (v === '1') return '1'; const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function _prVistoHoy(hoy, id) { const v = _prVistosHoy(hoy); return v === '1' || v.indexOf(id) >= 0; }
function _prDatosEval(hoy) {
  const fondosMes = {};
  if (typeof _pfBudgetTotal === 'function') { try { const v = _pfBudgetTotal(hoy.slice(0, 7)); if (v) fondosMes[hoy.slice(0, 7)] = v; } catch (e) {} }
  return { habitTrackers: S.habitTrackers, workoutLog: S.workoutLog, sleepLog: S.sleepLog, transactions: S.transactions, cardCharges: S.cardCharges, budgets: S.budgets, fondosMes, foco: S.foco };
}
function _prQuitarAvisos() {
  const el = document.getElementById('pr-avisos'); if (el) el.remove();
  clearTimeout(_prAvTimer); clearTimeout(_prAvTsTimer);
  _prAvSig = ''; _prAvItems = []; _prAvAbierto = false; _prAvCard = [];
}
function _prAvBtn(txt, label, onclick, id, cls) {
  return '<button type="button" class="pr-btn' + (cls ? ' ' + cls : '') + '" aria-label="' + _prEsc(label) + '"' + (id ? ' data-id="' + _prEsc(id) + '"' : '') + ' onclick="' + onclick + '">' + txt + '</button>';
}
const _PR_BELL_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
// Texto completo del aviso (sin recortar): título, enunciado (tocable: abre el principio) y «por qué».
function _prAvTexto(it) {
  return '<div class="pr-av-t">' + _prEsc(it.diario ? 'Principio de hoy' : it.detalle) + '</div>'
    + '<button type="button" class="pr-av-link" data-id="' + _prEsc(it.p.id) + '" onclick="Principios.abrirPrincipio(this.dataset.id)">' + _prEsc(it.p.enunciado) + '</button>'
    + (it.p.porque ? '<div class="pr-av-por"><b>Por qué:</b> ' + _prEsc(it.p.porque) + '</div>' : '');
}
// Opciones concretas del principio (prSugerencias) como botones. En el panel se omite «Posponer 1 h»: ya está en la fila de posponer.
function _prSugCtx() { return { habitTrackers: (typeof S !== 'undefined' && S) ? S.habitTrackers : null, hoy: _prHoyLocal() }; }
function _prSugsHtml(p, omitirPosponer, cls) {
  const l = prSugerencias(p, null, _prSugCtx()).filter(x => !(omitirPosponer && x.id === 'posponer'));
  return l.length ? '<div class="pr-av-sugs' + (cls ? ' ' + cls : '') + '" role="group" aria-label="Opciones">'
    + l.map(x => '<button type="button" class="pr-btn pr-av-sug" aria-label="' + _prEsc(x.label) + '" data-id="' + _prEsc(p.id) + '" data-s="' + x.id + '" onclick="Principios.sug(this.dataset.id,this.dataset.s)">' + _prEsc(x.label) + '</button>').join('') + '</div>' : '';
}
function _prAvItemPanel(it) {
  const id = it.p.id, pos = (txt, label, fn) => _prAvBtn(txt, label, fn, id);
  return '<div class="pr-av-item">' + _prAvTexto(it) + _prSugsHtml(it.p, true)
    + '<div class="pr-av-pos" role="group" aria-label="Posponer"><span class="pr-av-pl">Posponer</span>'
    + pos('15 min', 'Posponer 15 minutos', 'Principios.posponerMin(this.dataset.id,15)') + pos('1 h', 'Posponer 1 hora', 'Principios.posponerMin(this.dataset.id,60)')
    + pos('3 h', 'Posponer 3 horas', 'Principios.posponerMin(this.dataset.id,180)') + pos('Mañana', 'Posponer hasta mañana', 'Principios.posponer(this.dataset.id)')
    + pos('7 días', 'Silenciar 7 días', 'Principios.silenciar(this.dataset.id)') + '</div>'
    + '<div class="pr-av-fin">' + (it.diario ? _prAvBtn('Visto', 'Visto por hoy', 'Principios.visto(this.dataset.id)', id, 'pr-btn-p') : _prAvBtn('Ocultar', 'Ocultar este aviso', 'Principios.ocultar(this.dataset.id)', id)) + '</div></div>';
}
function _prAvPintar() {
  let el = document.getElementById('pr-avisos');
  if (!el) { el = document.createElement('div'); el.id = 'pr-avisos'; el.className = 'pr-avisos'; document.body.appendChild(el); }
  const n = _prAvItems.length, ab = _prAvAbierto, enPanel = !!el.querySelector('#pr-av-panel:focus-within, #pr-av-panel:focus');
  const card = ab ? [] : _prAvCard.map(k => _prAvItems.find(i => i.k === k)).filter(Boolean);
  let h = '<button type="button" class="pr-bell' + (n ? ' tiene' : '') + '" aria-label="Avisos de principios' + (n ? ': ' + n + (n === 1 ? ' pendiente' : ' pendientes') : ': ninguno') + '" aria-expanded="' + ab + '" aria-controls="pr-av-panel" onclick="Principios.campana()">'
    + _PR_BELL_SVG + (n ? '<span class="pr-bell-n" aria-hidden="true">' + (n > 9 ? '9+' : n) + '</span>' : '') + '</button>';
  if (card.length) {
    h += '<div class="pr-av-card" role="status" aria-live="polite">' + _prAvTexto(card[0]) + _prSugsHtml(card[0].p, false)
      + '<div class="pr-av-fin">' + _prAvBtn(card.length > 1 ? 'y ' + (card.length - 1) + ' más' : 'Posponer…', card.length > 1 ? 'Ver los demás avisos' : 'Ver opciones para posponer', 'Principios.campana()', '', 'pr-btn-p')
      + _prAvBtn('Cerrar', 'Cerrar la tarjeta', 'Principios.cerrarTarjeta()', '') + '</div></div>';
  }
  if (ab) h += '<div class="pr-av-panel" id="pr-av-panel" role="region" aria-label="Avisos de principios" tabindex="-1"><div class="pr-av-ph">Avisos (' + n + ')</div>'
    + (n ? _prAvItems.map(_prAvItemPanel).join('') : '<div class="pr-av-vacio">No tenés avisos por ahora.</div>') + '</div>';
  el.innerHTML = h;
  const c = el.querySelector('.pr-av-card');
  if (c) {
    c.onpointerenter = c.onfocusin = () => clearTimeout(_prAvTimer);
    c.onpointerleave = c.onfocusout = () => _prAvIniciarTimer();
  }
  if (ab && enPanel) { const pn = el.querySelector('#pr-av-panel'); if (pn) pn.focus(); }   // el re-render no te saca del panel
}
function _prAvIniciarTimer() { clearTimeout(_prAvTimer); if (_prAvCard.length) _prAvTimer = setTimeout(prAvPlegar, PR_AV_CARD_MS); }
function prAvPlegar() { clearTimeout(_prAvTimer); if (!_prAvCard.length) return; _prAvCard = []; _prAvPintar(); }
// Vence un posponer corto: reaparece sin esperar a los 5 min.
function _prAvProgramarTs(lista, ahora) {
  clearTimeout(_prAvTsTimer);
  const ts = lista.filter(p => p && p.disparo && Number.isFinite(p.silenciadoHastaTs) && p.silenciadoHastaTs > ahora).map(p => p.silenciadoHastaTs);
  if (ts.length) _prAvTsTimer = setTimeout(() => { try { prChequearAvisos(); } catch (e) {} }, Math.min(Math.min.apply(null, ts) - ahora + 300, 2147483000));
}
// Voz de Jarvis en español (misma voz): solo con Jarvis activado y la pestaña visible; una vez por aviso por día (firma por dispositivo en localStorage).
function _prVozKey(hoy) { return 'cm_pr_voz_' + hoy; }
function _prVozDicho(hoy, k) { try { const a = JSON.parse(localStorage.getItem(_prVozKey(hoy)) || '[]'); return Array.isArray(a) && a.indexOf(k) >= 0; } catch (e) { return false; } }
function _prVozMarcar(hoy, k) { try { const a = JSON.parse(localStorage.getItem(_prVozKey(hoy)) || '[]'); a.push(k); localStorage.setItem(_prVozKey(hoy), JSON.stringify(a.slice(-40))); } catch (e) {} }
function _prHablar(texto) {
  try {
    if (!texto || document.hidden || localStorage.getItem('jarvis_enabled') !== '1' || !window.JARVIS || typeof JARVIS.speak !== 'function') return false;
    JARVIS.speak(texto, { lang: 'es' }); return true;
  } catch (e) { return false; }
}
function _prAvDecir(it, hoy) {
  if (!it || _prVozDicho(hoy, it.k)) return;
  const fin = s => String(s || '').trim().replace(/[.\s]+$/, '');
  if (_prHablar(it.diario ? 'Principio de hoy: ' + fin(it.p.enunciado) + '.' : fin(it.detalle) + '. ' + fin(it.p.enunciado) + '.')) _prVozMarcar(hoy, it.k);
}
// Qué principio recordar hoy (con la misma evaluación de avisos que la campanita, sin los vistos/ocultos).
function _prDelDia() {
  if (typeof S === 'undefined' || !S || !S.principios || !Array.isArray(S.principios.principios)) return null;
  const lista = S.principios.principios, ahora = Date.now(), hoy = _prHoyLocal(), av = prAvisosDePrincipios(lista, _prDatosEval(hoy), hoy, ahora);
  av.datos = av.datos.filter(x => !_prOcultos[x.p.id]); av.diarios = av.diarios.filter(p => !_prVistoHoy(hoy, p.id));
  const sel = prPrincipioDelDia(lista, av, hoy, ahora); if (!sel) return null;
  return { p: sel.p, aviso: sel.aviso, texto: prTextoDelDia(sel), sugerencias: prSugerencias(sel.p, sel.aviso, _prSugCtx()), hoy,
    k: sel.aviso ? (sel.aviso.tipo === 'datos' ? 'd:' : 'h:') + sel.p.id : null };
}
// Agenda `texto` 30 min en el próximo bloque libre de hoy (misma estructura que savePlanActivity de app.js).
function _prAgendar(p) {
  if (typeof getDayPlan !== 'function' || typeof plannerDayAgenda !== 'function') { _prToast('El planner no está disponible'); return; }
  const hoy = _prHoyLocal(), n = new Date();
  const ocup = plannerDayAgenda(hoy).map(t => ({ start: _timeToMin(t.time), end: _timeToMin(t.time) + (t.duration || 30) }));
  const ini = prProximoBloqueLibre(n.getHours() * 60 + n.getMinutes(), ocup);
  if (ini == null) { _prToast('No queda un hueco de 30 min hoy'); return; }
  const slug = prSlug(p.seccion || ''), area = slug === 'economia' ? 'finanzas' : (typeof PLANNER_AREAS !== 'undefined' && PLANNER_AREAS[slug] ? slug : 'vida');
  getDayPlan(hoy).tasks.push({ id: _pid(), text: String(p.haz).trim(), area, priority: 2, time: _minToTime(ini), duration: 30, habit: null, done: false });
  saveState(); if (typeof renderDayPlanner === 'function') renderDayPlanner();
  _prToast('Agendado a las ' + _minToTime(ini) + ' (30 min)');
}
function _prQuitarDia() { const e = document.getElementById('pr-dia'); if (e) e.remove(); clearTimeout(_prDiaTimer); }
let _prDiaTimer = null;
function prChequearAvisos() {
  if (typeof S === 'undefined' || !S || !S.principios || !Array.isArray(S.principios.principios)) { _prQuitarAvisos(); return; }   // lectura pura: no crea S.principios
  const lista = S.principios.principios, ahora = Date.now(), hoy = _prHoyLocal(), av = prAvisosDePrincipios(lista, _prDatosEval(hoy), hoy, ahora);
  _prAvProgramarTs(lista, ahora);
  const sigD = x => JSON.stringify([x.p.enunciado, x.p.porque, x.detalle]), vivos = {};
  av.datos.forEach(x => { vivos[x.p.id] = sigD(x); });
  Object.keys(_prOcultos).forEach(id => { if (vivos[id] !== _prOcultos[id]) delete _prOcultos[id]; });   // cambió el estado: vuelve a mostrarse
  const items = av.datos.filter(x => !_prOcultos[x.p.id]).map(x => ({ k: 'd:' + x.p.id, p: x.p, detalle: x.detalle, diario: false }))
    .concat(av.diarios.filter(p => !_prVistoHoy(hoy, p.id)).map(p => ({ k: 'h:' + p.id, p, diario: true })));
  const clave = i => i.k + (i.diario ? '@' + hoy : '');
  const sig = JSON.stringify(items.map(i => [clave(i), i.p.enunciado, i.p.porque, i.detalle]));
  if (sig === _prAvSig && document.getElementById('pr-avisos')) return;
  const vigentes = new Set(items.map(clave));
  [..._prAvMostrados].forEach(k => { if (!vigentes.has(k)) _prAvMostrados.delete(k); });
  const nuevos = items.filter(i => !_prAvMostrados.has(clave(i)));
  nuevos.forEach(i => _prAvMostrados.add(clave(i)));
  _prAvItems = items; _prAvSig = sig;
  _prAvCard = _prAvCard.filter(k => items.some(i => i.k === k));
  if (nuevos.length && !_prAvAbierto) { _prAvCard = nuevos.map(i => i.k); _prAvIniciarTimer(); _prAvDecir(nuevos[0], hoy); }
  if (!_prAvCard.length) clearTimeout(_prAvTimer);
  _prAvPintar();
}
function _prAvAbrir(abrir, sinFoco) {
  _prAvAbierto = abrir; _prAvCard = []; clearTimeout(_prAvTimer); _prAvPintar();
  if (sinFoco) return;
  const el = document.getElementById('pr-avisos'); if (!el) return;
  const t = el.querySelector(abrir ? '#pr-av-panel' : '.pr-bell'); if (t) t.focus();
}
function _prAvAfuera(e) { if (_prAvAbierto && e.target.isConnected) {   // un botón que re-pinta el panel ya no está en el DOM: no cuenta como clic afuera
    const el = document.getElementById('pr-avisos'); if (el && !el.contains(e.target)) _prAvAbrir(false, true); } }
function _prAvTecla(e) { if (e.key === 'Escape' && _prAvAbierto) { e.stopPropagation(); _prAvAbrir(false); } }
function _prSilenciarDias(id, n) {
  const p = ((S.principios && S.principios.principios) || []).find(x => x.id === id); if (!p) return;
  p.silenciadoHasta = prSumarDias(_prHoyLocal(), n); delete p.silenciadoHastaTs; _prSave();
  prChequearAvisos(); if (document.getElementById('principios-root')) prRender();
}
function _prSilenciarMin(id, min) {
  const p = ((S.principios && S.principios.principios) || []).find(x => x.id === id); if (!p) return;
  p.silenciadoHastaTs = Date.now() + min * 60000; delete p.silenciadoHasta; _prSave();
  prChequearAvisos(); if (document.getElementById('principios-root')) prRender();
}
Object.assign(Principios, {
  chequearAvisos: prChequearAvisos,
  posponer(id) { _prSilenciarDias(id, 1); _prToast('Listo, mañana te lo vuelvo a mostrar'); },
  posponerMin(id, min) { _prSilenciarMin(id, min); _prToast('Listo, te lo vuelvo a mostrar en ' + (min < 60 ? min + ' minutos' : min === 60 ? '1 hora' : (min / 60) + ' horas')); },
  silenciar(id) { _prSilenciarDias(id, 7); _prToast('Silenciado por 7 días'); },
  reactivar(id) {
    const p = _prData().principios.find(x => x.id === id); if (!p) return;
    delete p.silenciadoHasta; delete p.silenciadoHastaTs; _prSave(); prRender(); prChequearAvisos();
  },
  ocultar(id) {
    const x = _prAvItems.find(i => !i.diario && i.p.id === id);
    if (x) _prOcultos[id] = JSON.stringify([x.p.enunciado, x.p.porque, x.detalle]);
    prChequearAvisos();
  },
  visto(id) {
    const hoy = _prHoyLocal(), v = _prVistosHoy(hoy);
    try { localStorage.setItem(_prVistoKey(hoy), id ? JSON.stringify(v === '1' ? [] : v.concat(id)) : '1'); } catch (e) {}   // sin id: todos los de hoy
    prChequearAvisos();
  },
  campana() { _prAvAbrir(!_prAvAbierto); },
  // Jarvis: principio del día → { p, aviso, texto, sugerencias, k } o null.
  delDia: _prDelDia,
  // Resumen compacto para el chat con IA (máx. 10, primero los que tienen aviso activo hoy): [{ enunciado, haz?, aviso? }].
  paraChat() {
    if (typeof S === 'undefined' || !S || !S.principios || !Array.isArray(S.principios.principios)) return [];
    const lista = S.principios.principios.filter(p => p && p.enunciado && (p.tipo === 'principio' || p.tipo === 'anti')), hoy = _prHoyLocal(), ahora = Date.now();
    let av = { diarios: [], datos: [] }; try { av = prAvisosDePrincipios(lista, _prDatosEval(hoy), hoy, ahora); } catch (e) {}
    const det = {}; av.datos.forEach(x => { det[x.p.id] = x.detalle; }); av.diarios.forEach(p => { if (!(p.id in det)) det[p.id] = 'aviso diario'; });
    const cut = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    return lista.map(p => ({ p, a: p.id in det })).sort((x, y) => (y.a ? 1 : 0) - (x.a ? 1 : 0)).slice(0, 10).map(({ p, a }) => {
      const o = { enunciado: cut(p.enunciado, 140) }; if (p.tipo === 'anti') o.tipo = 'anti'; if (p.haz) o.haz = cut(p.haz, 80); if (a) o.aviso = cut(det[p.id], 100); return o;
    });
  },
  // Lo dice en español. `soloSiNuevo`: no repite si ya sonó hoy como aviso de la campanita. Devuelve true si habló.
  decirDelDia(dd, soloSiNuevo) {
    dd = dd || _prDelDia(); if (!dd) return false;
    if (soloSiNuevo && dd.k && _prVozDicho(dd.hoy, dd.k)) return false;
    const ok = _prHablar(dd.texto); if (ok && dd.k) _prVozMarcar(dd.hoy, dd.k); return ok;
  },
  // Tarjeta con el principio del día y sus opciones (la usa el saludo de la mañana). No se muestra si la campanita ya tiene su tarjeta abierta.
  mostrarDelDia(dd, ms) {
    dd = dd || _prDelDia(); if (!dd || typeof document === 'undefined') return;
    if (document.querySelector('#pr-avisos .pr-av-card')) return;
    _prQuitarDia();
    const el = document.createElement('div'); el.id = 'pr-dia'; el.className = 'pr-dia'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="pr-av-t">Principio de hoy</div>'
      + '<button type="button" class="pr-av-link" data-id="' + _prEsc(dd.p.id) + '" onclick="Principios.abrirPrincipio(this.dataset.id)">' + _prEsc(dd.p.enunciado) + '</button>'
      + (dd.aviso && dd.aviso.detalle ? '<div class="pr-av-por">' + _prEsc(dd.aviso.detalle) + '</div>' : '')
      + _prSugsHtml(dd.p, false) + '<div class="pr-av-fin">' + _prAvBtn('Cerrar', 'Cerrar', 'Principios.cerrarDelDia()', '') + '</div>';
    document.body.appendChild(el);
    el.onpointerenter = el.onfocusin = () => clearTimeout(_prDiaTimer);
    el.onpointerleave = el.onfocusout = () => { clearTimeout(_prDiaTimer); _prDiaTimer = setTimeout(_prQuitarDia, 8000); };
    clearTimeout(_prDiaTimer); _prDiaTimer = setTimeout(_prQuitarDia, ms || 15000);
  },
  cerrarDelDia: _prQuitarDia,
  // Ejecuta una opción de prSugerencias (id del principio + id de la opción).
  sug(id, sid) {
    const p = ((typeof S !== 'undefined' && S.principios && S.principios.principios) || []).find(x => x.id === id); if (!p) { _prToast('Ese principio ya no existe'); return; }
    const s = prSugerencias(p, null, _prSugCtx()).find(x => x.id === sid); if (!s) { _prToast('Esa opción ya no aplica'); _prAvPintar(); return; }
    _prQuitarDia();
    if (s.accion.tipo === 'agendar') _prAgendar(p);
    else if (s.accion.tipo === 'habito') {
      const [sec, hid] = s.accion.ref.split('|');
      if (typeof setHabitDay === 'function') setHabitDay(sec, hid, _prHoyLocal(), 'done');
      _prToast('Hábito marcado como hecho hoy'); prChequearAvisos(); _prAvPintar();
    }
    else if (s.accion.tipo === 'posponer') Principios.posponerMin(id, s.accion.min);
    else Principios.abrirPrincipio(id);
  },
  cerrarTarjeta: prAvPlegar,
  // Destino del aviso: la ventana de Principios mostrando solo ese principio.
  abrirPrincipio(id) {
    const existe = ((typeof S !== 'undefined' && S.principios && S.principios.principios) || []).some(x => x.id === id);
    if (!existe) { _prToast('Ese principio ya no existe'); _prV.sel = null; prAbrir(); return; }
    _prVuelca(); _prV.edit = null; _prDraft = null; _prV.imp = null; _prV.sub = 'principios'; _prV.sel = id;
    prAbrir();
  },
});
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const hook = () => {
    if (typeof window.renderGoals !== 'function' || window._prBootHooked) return false;
    window._prBootHooked = true;
    const orig = window.renderGoals;
    window.renderGoals = function () { const r = orig.apply(this, arguments); try { prChequearAvisos(); } catch (e) {} return r; };
    return true;
  };
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
  setInterval(() => { try { if (typeof _appBooted !== 'undefined' && _appBooted) prChequearAvisos(); } catch (e) {} }, 300000);
  document.addEventListener('click', _prAvAfuera); document.addEventListener('keydown', _prAvTecla);

  // Deep-link del push '#principio-<id>': URL al abrir la app cerrada, o mensaje del SW con la app abierta (mismo canal que '#foco-chequeo' de foco.js).
  const PRE = '#principio-';
  const idDe = u => { try { const h = new URL(String(u || ''), location.href).hash; return h.indexOf(PRE) === 0 ? decodeURIComponent(h.slice(PRE.length)) : null; } catch (e) { return null; } };
  let pendId = idDe(location.href);
  if (pendId) history.replaceState(null, '', location.pathname + location.search);
  const enganchar = () => {
    const orig = window.aplicarAccionPendiente;
    window.aplicarAccionPendiente = function () {
      if (typeof orig === 'function') orig.apply(this, arguments);
      if (pendId) { const id = pendId; pendId = null; Principios.abrirPrincipio(id); }
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => {
    const m = e.data; if (!m || m.tipo !== 'abrir-destino') return;
    const id = idDe(m.url); if (!id) return;
    if (typeof _appBooted !== 'undefined' && _appBooted) Principios.abrirPrincipio(id); else pendId = id;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { prPrincipioDelDia, prSugerencias, prTextoDelDia, prProximoBloqueLibre, prNormalizarRegla, prNormalizarDisparo, prEvaluarRegla, prAvisosDePrincipios, prTextoRegla, prSilenciado, prSumarDias, PR_PLANTILLAS, prSembrarCategorias, prVistaObjetivos, prContarHijos, prCadena, prHuecos, prVinculosDePrincipio, prContarObjetivosDeCategoria,
    prEliminarCategoria, prEliminarPrincipio, prEliminarObjetivo, prFiltrarPrincipios, prKeyTrimestral, prImportCandidatos, prPrincipioDeLibro, prSeccionDeLibro, prRecortarEnunciado };
}
