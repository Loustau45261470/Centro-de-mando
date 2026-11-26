'use strict';
// ════════════════════════════════════════════════════════════════════════
// REGISTROS — avisos cada cierto tiempo que preguntan «¿qué estuviste haciendo?» y «¿en qué pensabas?», con pulgar arriba/abajo,
// aprendizajes («qué hago la próxima vez») e historial por día y semana. Sección «Registros» en la pestaña Vida.
//
// Estado (tres colecciones de primer nivel, arrays con id para que el sync las rescate; el guardado serializa todo S):
//   S.registros = [{ id, nombre, principal?:true, frecuencia:{tipo:'cada',cada,unidad:'min'|'h'} | {tipo:'horas',horas:['HH:MM']},
//                    desde:'HH:MM', hasta:'HH:MM', dias:[0..6] (vacío = todos), pausado, pausadoDesde, inicio:'YYYY-MM-DDTHH:MM',
//                    preguntas:[{ id, texto, tipo:'texto'|'opciones'|'escala', opciones:[] }] }]
//     El principal (id 'reg_principal', «Chequeo de foco y reflexión») nace de la config de horas de Foco (S.foco.config.horas) y la reemplaza:
//     una vez creado, los avisos de Foco de deadlines.js se apagan y avisa este registro. Lleva preguntas fijas (actividad + categoría,
//     pensamiento, energía, pulgares) más las propias.
//   S.registroRespuestas = [{ id, registroId, fecha, hora (cuándo se respondió), slot:'YYYY-MM-DDTHH:MM' (ocurrencia del aviso, '' si fue a mano),
//                             actividad, categoria, pensamiento, energia (1-5), valAct, valPen (1 | -1 | 0), extras:[{pid,texto,valor}] }]
//   S.aprendizajes = [{ id, fecha, registroId, respuestaId, sobre:'actividad'|'pensamiento', contexto, etiquetas:[], queHago, principioId }]
// «Sin respuesta» NO se guarda: se calcula al leer (ocurrencias pasadas del horario vigente sin respuesta con ese slot).
// Los chequeos viejos de Foco (S.foco.chequeos) se leen tal cual y se muestran en el historial; nada se copia ni se borra.
// Las funciones puras (sin DOM) están arriba y se exportan para Node al final del archivo; los avisos los calcula deadlines.js.
// ════════════════════════════════════════════════════════════════════════

const RG_PRINCIPAL_ID = 'reg_principal';
const RG_PENDIENTE_MIN = 60;   // misma ventana que los avisos: pasada esa hora sin respuesta, la ocurrencia queda «sin respuesta»
const RG_CATEGORIAS = (typeof FO_CATEGORIAS !== 'undefined') ? FO_CATEGORIAS
  : [['estudio', 'Estudio'], ['gym', 'Gym'], ['trabajo', 'Trabajo'], ['pantalla', 'Pantalla/distracción'], ['social', 'Social'], ['descanso', 'Descanso'], ['otro', 'Otro']];
const RG_FRANJAS = [['Mañana', 0, 12], ['Tarde', 12, 18], ['Noche', 18, 24]];
const RG_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const RG_STOP = new Set(['para', 'pero', 'como', 'esto', 'esta', 'este', 'esos', 'esas', 'entre', 'sobre', 'cuando', 'porque', 'hacer', 'estaba', 'estuve', 'tengo', 'tenia', 'hasta', 'desde', 'donde', 'mucho', 'poco', 'algo', 'cosa', 'cosas', 'todo', 'toda', 'todos', 'muy', 'mas', 'menos', 'ahora', 'solo', 'bien', 'mal', 'unos', 'unas', 'cada', 'tiempo']);

// ── Funciones puras ────────────────────────────────────────────────────────
const _rgDL = () => (typeof CMDeadlines !== 'undefined' ? CMDeadlines : require('./deadlines.js'));
const _rgP2 = n => String(n).padStart(2, '0');
function rgFechaDe(d) { return d.getFullYear() + '-' + _rgP2(d.getMonth() + 1) + '-' + _rgP2(d.getDate()); }
function rgAhoraStr(d) { d = d || new Date(); return rgFechaDe(d) + 'T' + _rgP2(d.getHours()) + ':' + _rgP2(d.getMinutes()); }   // hora LOCAL
function rgSumarDias(ds, n) { const [y, m, d] = ds.split('-').map(Number); return rgFechaDe(new Date(y, m - 1, d + n)); }
function rgLunes(ds) { const [y, m, d] = ds.split('-').map(Number), x = new Date(y, m - 1, d); return rgSumarDias(ds, -((x.getDay() + 6) % 7)); }
function rgMin(dt) { return Date.parse(String(dt).slice(0, 16) + ':00Z') / 60000; }   // 'YYYY-MM-DDTHH:MM' → minutos, sin zona (solo para restar)
function rgNorm(t) { return String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function rgPalabras(t) { return Array.from(new Set(rgNorm(t).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 4 && !RG_STOP.has(w)))); }
// Etiquetas: texto separado por comas (o lista) → normalizadas, sin repetir, sin «#», máximo 6.
function rgEtiquetas(v) {
  const arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(',');
  return Array.from(new Set(arr.map(x => rgNorm(x).replace(/\s+/g, ' ').trim().replace(/^#+/, '')).filter(Boolean))).slice(0, 6);
}
// La categoría guardada es el id de una fija o, si la escribió el usuario, el texto tal cual (en el mismo campo "categoria").
function rgCategoriaNombre(id) { const c = RG_CATEGORIAS.find(x => x[0] === id); return c ? c[1] : String(id == null ? '' : id); }
const RG_CAT_MAX = 40;
function rgCategoriaLimpia(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, RG_CAT_MAX).trim(); }
// Texto escrito → id fijo si coincide con una fija (por id o nombre, sin mayúsculas ni acentos); si no, el texto limpio.
function rgCategoriaCanon(t) {
  const s = rgCategoriaLimpia(t), n = rgNorm(s); if (!s) return '';
  const c = RG_CATEGORIAS.find(x => rgNorm(x[0]) === n || rgNorm(x[1]) === n);
  return c ? c[0] : s;
}
const rgCatClave = c => rgNorm(rgCategoriaLimpia(c));   // para agrupar y comparar categorías
// Categorías de una respuesta: "categorias" (lista) y, por compatibilidad con lo ya guardado y otros dispositivos, "categoria" (= la primera).
// TODA lectura pasa por acá. Sin repetidas (misma clave normalizada).
const RG_CATS_MAX = 6;
function rgCats(e) {
  if (!e) return [];
  const l = (Array.isArray(e.categorias) && e.categorias.length) ? e.categorias : (e.categoria ? [e.categoria] : []);
  const vistos = new Set();
  return l.map(x => rgCategoriaCanon(x)).filter(x => { const k = rgCatClave(x); if (!k || vistos.has(k)) return false; vistos.add(k); return true; });
}
const rgCatsNombres = e => rgCats(e).map(rgCategoriaNombre);
// Categorías propias usadas (no fijas) en las respuestas: [{ clave, nombre (la forma más usada), n, ult }], por uso y recencia.
function rgCategoriasPropias(resps) {
  const m = {};
  (Array.isArray(resps) ? resps : []).forEach(r => {
    rgCats(r).forEach(cn => {
      if (RG_CATEGORIAS.some(x => x[0] === cn)) return;
      const k = rgCatClave(cn), o = m[k] || (m[k] = { clave: k, n: 0, ult: '', formas: {} });
      o.n++; o.formas[cn] = (o.formas[cn] || 0) + 1; const cu = rgCuando(r); if (cu > o.ult) o.ult = cu;
    });
  });
  return Object.values(m).map(o => ({ clave: o.clave, n: o.n, ult: o.ult, nombre: Object.keys(o.formas).sort((a, b) => o.formas[b] - o.formas[a])[0] }))
    .sort((a, b) => b.n - a.n || b.ult.localeCompare(a.ult));
}
function rgCuando(r) { return r && r.slot ? r.slot : (r.fecha || '') + 'T' + (r.hora || '00:00'); }

// Aprendizajes parecidos: comparten una etiqueta (peso 10) o palabras del contexto (peso 1 por palabra). Solo los que dicen qué hacer.
// q = { etiquetas, texto }; `excluir` = ids de aprendizajes que no se muestran (los de la propia respuesta).
function rgBuscarAprendizajes(aprendizajes, q, excluir) {
  const et = new Set(rgEtiquetas(q && q.etiquetas)), pal = new Set(rgPalabras(q && q.texto));
  const ex = new Set(excluir || []);
  if (!et.size && !pal.size) return [];
  return (Array.isArray(aprendizajes) ? aprendizajes : []).filter(a => a && a.id && !ex.has(a.id) && String(a.queHago || '').trim()).map(a => {
    const e = rgEtiquetas(a.etiquetas).filter(x => et.has(x)).length;
    const w = rgPalabras([a.contexto, a.queHago, (a.etiquetas || []).join(' ')].join(' ')).filter(x => pal.has(x)).length;
    return { a, score: e * 10 + w };
  }).filter(x => x.score > 0).sort((x, y) => y.score - x.score || String(y.a.fecha).localeCompare(String(x.a.fecha))).slice(0, 5).map(x => x.a);
}

function rgFrecuenciaTexto(reg) {
  const f = (reg && reg.frecuencia) || {};
  const dias = Array.isArray(reg.dias) && reg.dias.length && reg.dias.length < 7 ? reg.dias.slice().sort((a, b) => a - b).map(d => RG_DIAS[d]).join(' ') : 'todos los días';
  if (f.tipo === 'horas') return 'A las ' + (f.horas || []).slice().sort().join(', ') + ' · ' + dias;
  const u = f.unidad === 'h' ? (f.cada === 1 ? 'hora' : 'horas') : 'min';
  return 'Cada ' + (f.cada === 1 && f.unidad === 'h' ? '' : f.cada + ' ') + u + ' · ' + (reg.desde || '') + ' a ' + (reg.hasta || '') + ' · ' + dias;
}

// Texto del motivo si el registro no se puede guardar; '' si está bien.
function rgValidarRegistro(reg) {
  if (!reg || !String(reg.nombre || '').trim()) return 'Ponele un nombre al registro.';
  const m = _rgDL().regFrecValidar(reg); if (m) return m;
  const ps = Array.isArray(reg.preguntas) ? reg.preguntas : [];
  if (!reg.principal && !ps.length) return 'Agregá al menos una pregunta.';
  for (const p of ps) {
    if (!String(p.texto || '').trim()) return 'Hay una pregunta sin texto.';
    if (p.tipo === 'opciones' && rgEtiquetas(p.opciones).length < 2) return 'La pregunta «' + String(p.texto).trim() + '» necesita al menos dos opciones.';
  }
  return '';
}

// Registro principal predefinido: toma las horas de Foco. Sin horas → nace en pausa (así se respeta «sin avisos»).
function rgPrincipalNuevo(horas, ahoraStr) {
  const hs = Array.isArray(horas) ? horas.filter(h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h || '')) : [];
  const r = { id: RG_PRINCIPAL_ID, nombre: 'Chequeo de foco y reflexión', principal: true, dias: [0, 1, 2, 3, 4, 5, 6], preguntas: [], inicio: ahoraStr, pausado: false, pausadoDesde: '' };
  if (hs.length) r.frecuencia = { tipo: 'horas', horas: hs.slice().sort() };
  else { r.frecuencia = { tipo: 'cada', cada: 60, unidad: 'min' }; r.desde = '09:00'; r.hasta = '21:00'; r.pausado = true; r.pausadoDesde = ahoraStr; }
  return r;
}

// Ocurrencias de un registro entre dos fechas ('YYYY-MM-DD'): [{ slot:'YYYY-MM-DDTHH:MM', fecha, hora }].
function rgSlotsRango(reg, desde, hasta) {
  const D = _rgDL(), out = [];
  for (let d = desde, n = 0; d <= hasta && n < 400; d = rgSumarDias(d, 1), n++) D.regSlotsDia(reg, d).forEach(h => out.push({ slot: d + 'T' + h, fecha: d, hora: h }));
  return out;
}

// Todo lo que se ve en el historial entre dos fechas: respuestas, chequeos viejos de Foco, ocurrencias pendientes y sin respuesta.
// ahora = 'YYYY-MM-DDTHH:MM' local. Devuelve entradas ordenadas de la más nueva a la más vieja.
function rgEntradas(state, desde, hasta, ahora) {
  const S_ = state || {}, regs = Array.isArray(S_.registros) ? S_.registros : [];
  const resp = Array.isArray(S_.registroRespuestas) ? S_.registroRespuestas : [], aprs = Array.isArray(S_.aprendizajes) ? S_.aprendizajes : [];
  const nombre = id => { const r = regs.find(x => x && x.id === id); return r ? r.nombre : 'Registro eliminado'; };
  const hechos = new Set(resp.filter(r => r && r.slot).map(r => r.registroId + '@' + r.slot));
  const out = [];
  resp.forEach(r => {
    if (!r || !r.id) return;
    const cuando = rgCuando(r), fecha = cuando.slice(0, 10);
    if (fecha < desde || fecha > hasta) return;
    const reg = regs.find(x => x && x.id === r.registroId);
    out.push({ tipo: 'respuesta', id: r.id, cuando, fecha, hora: cuando.slice(11, 16), registroId: r.registroId, registro: nombre(r.registroId), principal: !!(reg && reg.principal) || r.registroId === RG_PRINCIPAL_ID,
      actividad: r.actividad || '', categoria: rgCats(r)[0] || '', categorias: rgCats(r), pensamiento: r.pensamiento || '', energia: r.energia || null,
      valAct: r.valAct || 0, valPen: r.valPen || 0, extras: Array.isArray(r.extras) ? r.extras : [], aprendizajes: aprs.filter(a => a && a.respuestaId === r.id) });
  });
  ((S_.foco && Array.isArray(S_.foco.chequeos)) ? S_.foco.chequeos : []).forEach((c, i) => {
    if (!c || !c.fecha || c.fecha < desde || c.fecha > hasta) return;
    out.push({ tipo: 'foco', id: 'foco_' + i, cuando: c.fecha + 'T' + (c.hora || '00:00'), fecha: c.fecha, hora: c.hora || '', registroId: '', registro: 'Chequeo de Foco (anterior)',
      actividad: '', categoria: c.categoria || '', categorias: c.categoria ? [c.categoria] : [], pensamiento: '', energia: c.energia || null, valAct: 0, valPen: 0, extras: [], aprendizajes: [] });
  });
  if (ahora) regs.forEach(reg => {
    if (!reg || !reg.id) return;
    rgSlotsRango(reg, desde, hasta).forEach(s => {
      if (hechos.has(reg.id + '@' + s.slot)) return;
      const dif = rgMin(ahora) - rgMin(s.slot);
      if (dif < 0) return;
      out.push({ tipo: dif <= RG_PENDIENTE_MIN ? 'pendiente' : 'sin_respuesta', id: reg.id + '@' + s.slot, cuando: s.slot, fecha: s.fecha, hora: s.hora, registroId: reg.id, registro: reg.nombre, slot: s.slot });
    });
  });
  return out.sort((a, b) => (b.cuando + b.id).localeCompare(a.cuando + a.id));
}

// Filtros: f = { val:'up'|'down'|'', sobre:'actividad'|'pensamiento'|'', categoria, texto, registroId }.
// Con cualquier filtro de contenido (valoración, tipo, categoría, texto) las ocurrencias sin respuesta no entran: no tienen contenido que filtrar.
function rgFiltrar(entradas, f) {
  f = f || {};
  const v = f.val === 'up' ? 1 : f.val === 'down' ? -1 : 0, q = rgNorm(f.texto).trim();
  const contenido = !!(v || f.sobre || f.categoria || q);
  return (entradas || []).filter(e => {
    if (f.registroId && e.registroId !== f.registroId) return false;
    if (e.tipo === 'sin_respuesta' || e.tipo === 'pendiente') return !contenido;
    if (f.sobre === 'actividad' && !(e.actividad || rgCats(e).length)) return false;
    if (f.sobre === 'pensamiento' && !e.pensamiento) return false;
    if (v && !((f.sobre !== 'pensamiento' && e.valAct === v) || (f.sobre !== 'actividad' && e.valPen === v))) return false;
    if (f.categoria && !rgCats(e).some(c => rgCatClave(c) === rgCatClave(f.categoria))) return false;
    if (q) {
      const pajar = rgNorm([e.actividad, e.pensamiento, rgCatsNombres(e).join(' '), e.registro].concat(e.extras.map(x => x.valor), e.aprendizajes.map(a => (a.queHago || '') + ' ' + (a.etiquetas || []).join(' '))).join(' '));
      if (!pajar.includes(q)) return false;
    }
    return true;
  });
}

// Resumen de un conjunto de entradas (el período que se está mirando).
function rgResumen(entradas) {
  const resp = (entradas || []).filter(e => e.tipo === 'respuesta' || e.tipo === 'foco');
  const sin = (entradas || []).filter(e => e.tipo === 'sin_respuesta').length;
  const conCat = resp.filter(e => rgCats(e).length);
  const grupos = {};   // fijas y propias agrupadas por la misma clave normalizada
  let menciones = 0;   // una respuesta con varias categorías cuenta en cada una; el % se calcula sobre las menciones (suma 100)
  conCat.forEach(e => rgCats(e).forEach(cn => { menciones++; const k = rgCatClave(cn), g = grupos[k] || (grupos[k] = { n: 0, formas: {} }), fm = g.formas[cn] || (g.formas[cn] = { n: 0, t: e.cuando }); g.n++; fm.n++; if (e.cuando < fm.t) fm.t = e.cuando; }));
  const ix = id => { const i = RG_CATEGORIAS.findIndex(c => c[0] === id); return i < 0 ? 999 : i; };
  const categorias = Object.values(grupos).map(g => { const id = Object.keys(g.formas).sort((a, b) => g.formas[b].n - g.formas[a].n || g.formas[a].t.localeCompare(g.formas[b].t))[0]; return { id, nombre: rgCategoriaNombre(id) || id, n: g.n, pct: menciones ? Math.round(g.n * 100 / menciones) : 0 }; })
    .sort((a, b) => b.n - a.n || ix(a.id) - ix(b.id) || a.nombre.localeCompare(b.nombre));   // empate: fijas en su orden, luego propias
  const franjas = RG_FRANJAS.map(([nombre, a, b]) => {
    const l = resp.filter(e => e.energia >= 1 && e.energia <= 5 && /^\d{2}:/.test(e.hora) && +e.hora.slice(0, 2) >= a && +e.hora.slice(0, 2) < b).map(e => e.energia);
    return { nombre, n: l.length, energia: l.length ? l.reduce((x, y) => x + y, 0) / l.length : null };
  }).filter(f => f.n > 0);
  const cuenta = (k, v) => resp.filter(e => e[k] === v).length;
  const items = (k, v, campo) => resp.filter(e => e[k] === v && e[campo]).slice(0, 3).map(e => ({ fecha: e.fecha, hora: e.hora, texto: e[campo] }));
  return { respuestas: resp.length, sinRespuesta: sin, categorias, nCategorias: conCat.length, nMenciones: menciones, franjas,
    upAct: cuenta('valAct', 1), downAct: cuenta('valAct', -1), upPen: cuenta('valPen', 1), downPen: cuenta('valPen', -1),
    bien: items('valAct', 1, 'actividad').concat(items('valPen', 1, 'pensamiento')).slice(0, 4),
    mal: items('valAct', -1, 'actividad').concat(items('valPen', -1, 'pensamiento')).slice(0, 4) };
}

// Conteos de una semana para la Revisión semanal: 👍/👎 (actividades y pensamientos) y aprendizajes nuevos.
function rgConteoSemana(state, desde, hasta) {
  const r = rgResumen(rgEntradas(state, desde, hasta, ''));
  const apr = (Array.isArray((state || {}).aprendizajes) ? state.aprendizajes : []).filter(a => a && a.fecha >= desde && a.fecha <= hasta).length;
  return { respuestas: r.respuestas, up: r.upAct + r.upPen, down: r.downAct + r.downPen, aprendizajes: apr };
}

// ── Datos ──────────────────────────────────────────────────────────────────
const _rgEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _rgUid = () => (typeof uid === 'function') ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function _rgSave() { if (typeof saveState === 'function') saveState(); }
function _rgToast(m) { if (typeof showToast === 'function') showToast(m); }
function _rgArr(k) { if (typeof S === 'undefined') return []; if (!Array.isArray(S[k])) S[k] = []; return S[k]; }
const _rgRegs = () => _rgArr('registros');
const _rgResps = () => _rgArr('registroRespuestas');
const _rgAprs = () => _rgArr('aprendizajes');
const _rgReg = id => _rgRegs().find(r => r && r.id === id);

// Crea el registro principal a partir de las horas de Foco (una sola vez; mismo id en todos los dispositivos → el sync lo junta).
function rgAsegurarPrincipal() {
  if (typeof S === 'undefined' || !S) return false;
  const regs = _rgRegs();
  if (regs.some(r => r && r.principal)) return false;
  const horas = _rgDL().focoHoras(S.foco);
  regs.push(rgPrincipalNuevo(horas, rgAhoraStr()));
  _rgSave(); return true;
}
// Las horas del registro principal y las de la sub-pestaña Foco son las mismas: se editan desde cualquiera de las dos.
function _rgHorasAFoco(reg) {
  if (!reg || !reg.principal || !reg.frecuencia || reg.frecuencia.tipo !== 'horas' || typeof _foData !== 'function') return;
  _foData().config.horas = reg.frecuencia.horas.slice().sort();
}
function rgSincDesdeFoco(horas) {
  const p = _rgRegs().find(r => r && r.principal); if (!p) return;
  const hs = (Array.isArray(horas) ? horas : []).filter(h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h || '')).sort();
  if (hs.length) { p.frecuencia = { tipo: 'horas', horas: hs }; if (p.pausado) { p.pausado = false; p.pausadoDesde = ''; p.inicio = rgAhoraStr(); } }
  else if (!p.pausado) { p.pausado = true; p.pausadoDesde = rgAhoraStr(); }   // sin horas = sin avisos, como en Foco
}

// Ocurrencia sin responder más reciente (dentro de la ventana de aviso) de un registro, o null.
function _rgPendiente(reg) {
  if (!reg || reg.pausado) return null;
  const now = new Date(), hoy = rgFechaDe(now), ahora = rgAhoraStr(now);
  const hechos = new Set(_rgResps().filter(r => r && r.slot && r.registroId === reg.id).map(r => r.slot));
  const l = rgSlotsRango(reg, rgSumarDias(hoy, -1), hoy).filter(s => !hechos.has(s.slot) && rgMin(ahora) - rgMin(s.slot) >= 0 && rgMin(ahora) - rgMin(s.slot) <= RG_PENDIENTE_MIN);
  return l.length ? l[l.length - 1] : null;
}
function _rgProxima(reg) {
  if (!reg || reg.pausado) return null;
  const o = _rgDL().regOcurrencias(reg, Date.now(), {});
  return o.proxima || null;
}
// Orden de presentación (copia: no toca S.registros): próximo aviso más cercano primero; empates por nombre; sin próximo aviso al final.
function rgOrdenados(regs) {
  const k = r => { const p = _rgProxima(r); return p ? p.date + 'T' + p.time : ''; };
  const n = r => String(r.nombre || '');
  return regs.map(r => ({ r, k: k(r) })).sort((x, y) => (x.k && !y.k ? -1 : !x.k && y.k ? 1 : x.k < y.k ? -1 : x.k > y.k ? 1 : n(x.r).localeCompare(n(y.r), 'es'))).map(x => x.r);
}

// ── Lista de registros (ventana #ov-registros) y pulso del botón #rg-btn ─────────────────────────────────────────────
function _rgPulso(regs) {
  const b = document.getElementById('rg-btn'); if (!b) return;
  const n = regs.filter(r => !r.pausado && _rgPendiente(r)).length;
  b.classList.toggle('tiene', n > 0);
  b.setAttribute('aria-label', n ? 'Registros: ' + n + ' sin responder' : 'Registros');
}
function rgRenderCard() {
  const regs = _rgRegs().filter(r => r && r.id);
  _rgPulso(regs);
  const host = document.getElementById('registros-body'); if (!host) return;
  if (!regs.length) { host.innerHTML = '<div class="empty-state">Todavía no hay registros</div>'; return; }
  host.innerHTML = rgOrdenados(regs).map(r => {
    const pen = _rgPendiente(r), prox = _rgProxima(r);
    const sub = r.pausado ? 'En pausa' : (pen ? '<b class="rg-pen">Sin responder: ' + _rgEsc(pen.hora) + '</b>' : (prox ? 'Próximo aviso: ' + _rgEsc(prox.time) + (prox.date !== rgFechaDe(new Date()) ? ' (' + _rgEsc(prox.date.slice(8, 10) + '/' + prox.date.slice(5, 7)) + ')' : '') : ''));
    return '<div class="rg-row" data-id="' + _rgEsc(r.id) + '"><div class="rg-info"><b>' + _rgEsc(r.nombre) + '</b><small>' + _rgEsc(rgFrecuenciaTexto(r)) + '</small><small>' + sub + '</small></div>'
      + '<div class="rg-acc"><button type="button" class="pr-btn pr-btn-p rg-resp" onclick="Registros.responder(\'' + _rgEsc(r.id) + '\')">Responder</button>'
      + '<button type="button" class="pr-btn rg-edit" aria-label="Editar ' + _rgEsc(r.nombre) + '" onclick="Registros.editar(\'' + _rgEsc(r.id) + '\')">✎</button></div></div>';
  }).join('') + '<div class="rg-pie"><button type="button" class="pr-btn" id="rg-abrir-hist" onclick="Registros.abrirHistorial()">Historial y resumen</button></div>';
}

// ── Formulario de respuesta ────────────────────────────────────────────────
let _rgF = null;   // borrador de la respuesta abierta
function _rgBorrador(reg, slot, resp) {
  const aprs = resp ? _rgAprs().filter(a => a.respuestaId === resp.id) : [];
  const lado = s => { const a = aprs.find(x => x.sobre === s); return { id: a ? a.id : '', queHago: a ? a.queHago : '', etiq: a ? (a.etiquetas || []).join(', ') : '', principioId: a ? a.principioId || '' : '' }; };
  const ex = {}; if (resp) (resp.extras || []).forEach(x => { ex[x.pid] = x.valor; });
  return { regId: reg.id, slot: slot || '', editId: resp ? resp.id : '', actividad: resp ? resp.actividad || '' : '', cats: resp ? rgCats(resp) : [],
    pensamiento: resp ? resp.pensamiento || '' : '', energia: resp ? resp.energia || null : null, valAct: resp ? resp.valAct || 0 : 0, valPen: resp ? resp.valPen || 0 : 0,
    otra: '', extras: ex, apr: { actividad: lado('actividad'), pensamiento: lado('pensamiento') } };
}
function _rgTh(lado, val) {
  return '<div class="rg-th" role="group" aria-label="Valoración">'
    + '<button type="button" class="rg-th-b' + (val === 1 ? ' on' : '') + '" data-th="' + lado + '" data-v="1" aria-label="Pulgar arriba: salió bien" onclick="Registros.th(\'' + lado + '\',1)">👍</button>'
    + '<button type="button" class="rg-th-b rg-th-d' + (val === -1 ? ' on' : '') + '" data-th="' + lado + '" data-v="-1" aria-label="Pulgar abajo: salió mal" onclick="Registros.th(\'' + lado + '\',-1)">👎</button></div>';
}
function _rgSugHtml(lado) {
  const f = _rgF; if (!f) return '';
  const a = f.apr[lado], texto = lado === 'actividad' ? f.actividad + ' ' + f.cats.map(rgCategoriaNombre).join(' ') : f.pensamiento;
  const propios = _rgAprs().filter(x => x.respuestaId === f.editId && f.editId).map(x => x.id);
  const l = rgBuscarAprendizajes(_rgAprs(), { etiquetas: a.etiq, texto }, propios);
  if (!l.length) return '';
  return '<div class="rg-sug"><b>Ya te pasó algo parecido. Qué te habías propuesto:</b>' + l.map(x => '<div class="rg-sug-i"><div><span class="pr-meta">' + _rgEsc(x.fecha) + (x.contexto ? ' · ' + _rgEsc(x.contexto) : '') + '</span><br>' + _rgEsc(x.queHago)
    + (x.etiquetas && x.etiquetas.length ? '<br><small class="pr-meta">' + x.etiquetas.map(t => '#' + _rgEsc(t)).join(' ') + '</small>' : '') + '</div>'
    + (x.principioId ? '<span class="pr-meta">Ya es un principio</span>' : '<button type="button" class="pr-btn rg-conv" onclick="Registros.aPrincipio(\'' + _rgEsc(x.id) + '\')">Convertir en principio</button>') + '</div>').join('') + '</div>';
}
function _rgAprHtml(lado) {
  const f = _rgF, a = f.apr[lado], val = lado === 'actividad' ? f.valAct : f.valPen;
  if (val !== -1) return '<div id="rg-apr-' + lado + '" hidden></div>';
  const pre = (typeof S !== 'undefined' ? _rgAprs() : []).reduce((m, x) => { (x.etiquetas || []).forEach(t => { m[t] = (m[t] || 0) + 1; }); return m; }, {});
  const usadas = Object.keys(pre).sort((x, y) => pre[y] - pre[x]).slice(0, 8);
  return '<div id="rg-apr-' + lado + '" class="rg-apr"><label class="pr-l" for="rg-qh-' + lado + '">Qué hago la próxima vez</label>'
    + '<textarea id="rg-qh-' + lado + '" class="pr-in" rows="2" maxlength="300" placeholder="Una acción concreta" oninput="Registros.apr(\'' + lado + '\',\'queHago\',this.value)">' + _rgEsc(a.queHago) + '</textarea>'
    + '<label class="pr-l" for="rg-et-' + lado + '">Etiquetas (separadas por coma)</label>'
    + '<input id="rg-et-' + lado + '" class="pr-in" maxlength="120" placeholder="ej: celular, procrastinar" value="' + _rgEsc(a.etiq) + '" oninput="Registros.apr(\'' + lado + '\',\'etiq\',this.value)">'
    + (usadas.length ? '<div class="rg-tags">' + usadas.map(t => '<button type="button" class="rg-tag-b" onclick="Registros.etiq(\'' + lado + '\',\'' + _rgEsc(t).replace(/'/g, '') + '\')">#' + _rgEsc(t) + '</button>').join('') + '</div>' : '')
    + '<div id="rg-sug-' + lado + '">' + _rgSugHtml(lado) + '</div></div>';
}
const _rgTiene = id => !!_rgF && _rgF.cats.some(c => rgCatClave(c) === rgCatClave(id));
// Propias a mostrar en el formulario: las ya usadas (sugeridas) + las elegidas ahora que todavía no están guardadas.
function _rgPropiasForm() {
  const l = rgCategoriasPropias(_rgResps()).slice(0, 8);
  _rgF.cats.forEach(c => { if (RG_CATEGORIAS.some(x => x[0] === c)) return; const k = rgCatClave(c); if (!l.some(x => x.clave === k)) l.push({ clave: k, nombre: c }); });
  return l;
}
function _rgFormHtml() {
  const f = _rgF, reg = _rgReg(f.regId); if (!reg) return '<div class="pr-vacio">Este registro ya no existe.</div>';
  let h = '<div class="pr-nota">' + (f.editId ? 'Estás corrigiendo una respuesta.' : (f.slot ? 'Aviso de las ' + _rgEsc(f.slot.slice(11, 16)) + '.' : 'Respuesta a mano, ahora.')) + ' Contestá lo que quieras: se guarda lo que completes.</div>';
  if (reg.principal) {
    h += '<label class="pr-l" for="rg-act">¿Qué estuviste haciendo?</label><input id="rg-act" class="pr-in" maxlength="200" placeholder="Una línea" value="' + _rgEsc(f.actividad) + '" oninput="Registros.f(\'actividad\',this.value)">'
      + '<div class="fo-cats rg-cats">' + RG_CATEGORIAS.map(c => '<button type="button" class="fo-cat' + (_rgTiene(c[0]) ? ' on' : '') + '" data-cat="' + c[0] + '" onclick="Registros.cat(\'' + c[0] + '\')">' + _rgEsc(c[1]) + '</button>').join('')
      + _rgPropiasForm().map(c => '<button type="button" class="fo-cat rg-cat-propia' + (_rgTiene(c.clave) ? ' on' : '') + '" data-propia="' + _rgEsc(c.clave) + '" data-n="' + _rgEsc(c.nombre) + '" onclick="Registros.catPropia(this.dataset.n)">' + _rgEsc(c.nombre) + '</button>').join('') + '</div>'
      + '<div class="rg-cat-add"><input id="rg-cat-otra" class="pr-in rg-cat-otra" maxlength="' + RG_CAT_MAX + '" placeholder="Otra categoría… (escribila y tocá +)" aria-label="Otra categoría" value="' + _rgEsc(f.otra) + '" oninput="Registros.otra(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();Registros.agregarOtra();}">'
      + '<button type="button" id="rg-cat-mas" class="pr-btn rg-cat-mas" aria-label="Agregar categoría" onclick="Registros.agregarOtra()">+</button></div>'
      + '<div class="pr-nota rg-cat-ayuda">Podés elegir varias (hasta ' + RG_CATS_MAX + ').</div>'
      + '<div class="rg-valor"><span>¿Salió bien?</span>' + _rgTh('actividad', f.valAct) + '</div>' + _rgAprHtml('actividad')
      + '<label class="pr-l" for="rg-pen">¿En qué estuviste pensando?</label><textarea id="rg-pen" class="pr-in" rows="2" maxlength="300" placeholder="Lo que te daba vueltas" oninput="Registros.f(\'pensamiento\',this.value)">' + _rgEsc(f.pensamiento) + '</textarea>'
      + '<div class="rg-valor"><span>¿Fue un buen pensamiento?</span>' + _rgTh('pensamiento', f.valPen) + '</div>' + _rgAprHtml('pensamiento')
      + '<label class="pr-l">Energía ahora (1 = agotado, 5 = con pila)</label><div class="fo-escala" id="rg-en">' + [1, 2, 3, 4, 5].map(i => '<button type="button" class="fo-n' + (f.energia === i ? ' on' : '') + '" data-en="' + i + '" onclick="Registros.en(' + i + ')">' + i + '</button>').join('') + '</div>';
  }
  (reg.preguntas || []).forEach(p => {
    const v = f.extras[p.id];
    h += '<label class="pr-l">' + _rgEsc(p.texto) + '</label>';
    if (p.tipo === 'escala') h += '<div class="fo-escala">' + [1, 2, 3, 4, 5].map(i => '<button type="button" class="fo-n' + (v === i ? ' on' : '') + '" onclick="Registros.ex(\'' + _rgEsc(p.id) + '\',' + i + ',true)">' + i + '</button>').join('') + '</div>';
    else if (p.tipo === 'opciones') h += '<div class="fo-cats">' + rgEtiquetasOpc(p.opciones).map(o => '<button type="button" class="fo-cat' + (v === o ? ' on' : '') + '" onclick="Registros.ex(\'' + _rgEsc(p.id) + '\',this.dataset.o,true)" data-o="' + _rgEsc(o) + '">' + _rgEsc(o) + '</button>').join('') + '</div>';
    else h += '<input class="pr-in" maxlength="300" value="' + _rgEsc(v || '') + '" oninput="Registros.ex(\'' + _rgEsc(p.id) + '\',this.value,false)">';
  });
  return h + '<div class="pr-form-f"><button type="button" class="pr-btn" onclick="Registros.cerrarForm()">Cancelar</button><button type="button" class="pr-btn pr-btn-p fo-btn" id="rg-guardar" onclick="Registros.guardar()">Guardar</button></div>';
}
// Opciones de una pregunta: lista o texto con comas, tal cual se escribieron (sin pasar a minúsculas).
function rgEtiquetasOpc(v) { const a = Array.isArray(v) ? v : String(v || '').split(','); return Array.from(new Set(a.map(x => String(x).trim()).filter(Boolean))); }

function _rgFormRender() {
  const host = document.getElementById('rg-form-host'); if (!host || !_rgF) return;
  const panel = host.closest('.cm-panel'), top = panel ? panel.scrollTop : 0;
  host.innerHTML = _rgFormHtml(); if (panel) panel.scrollTop = top;
}
function _rgAbrirOv(id, eyebrow, titulo, hostId) {
  if (typeof CMOverlay === 'undefined') return null;
  const { overlay, body } = CMOverlay.build({ id, accent: '#6B8EFF' });
  body.innerHTML = '<div class="cm-ov-head"><div class="cm-ov-eyebrow">' + eyebrow + '</div><div class="cm-ov-title">' + titulo + '</div></div><div id="' + hostId + '"></div>';
  document.body.appendChild(overlay);
  return overlay;
}
function _rgAbrirForm(reg, slot, resp) {
  _rgF = _rgBorrador(reg, slot, resp);
  const ov = _rgAbrirOv('ov-registro-resp', 'VIDA · REGISTROS', _rgEsc(reg.nombre), 'rg-form-host'); if (!ov) return;
  _rgFormRender(); CMOverlay.open(ov);
}

// ── Formulario de un registro (crear / editar) ─────────────────────────────
let _rgE = null;   // borrador de la definición
function _rgPreset(reg) {
  const f = reg.frecuencia || {};
  if (f.tipo === 'horas') return 'horas';
  const min = f.unidad === 'h' ? f.cada * 60 : f.cada;
  return (min === 30 || min === 60 || min === 90) ? String(min) : 'custom';
}
function _rgEdHtml() {
  const e = _rgE, f = e.frecuencia, preset = _rgPreset(e);
  let h = '<label class="pr-l" for="rg-e-nombre">Nombre</label><input id="rg-e-nombre" class="pr-in" maxlength="60" placeholder="Ej: Chequeo de la tarde" value="' + _rgEsc(e.nombre) + '" oninput="Registros.ed(\'nombre\',this.value)">'
    + '<label class="pr-l" for="rg-e-frec">Cada cuánto avisa</label><select id="rg-e-frec" class="pr-in" onchange="Registros.edFrec(this.value)">'
    + [['30', 'Cada 30 minutos'], ['60', 'Cada hora'], ['90', 'Cada 90 minutos'], ['custom', 'Personalizada'], ['horas', 'A horas fijas']].map(o => '<option value="' + o[0] + '"' + (preset === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
  if (preset === 'custom') h += '<div class="pr-cat"><span>Cada</span><input class="pr-in fo-hs" id="rg-e-cada" type="number" inputmode="numeric" min="1" value="' + _rgEsc(f.cada) + '" oninput="Registros.edCada(this.value)">'
    + '<select class="pr-in fo-hs" id="rg-e-unidad" onchange="Registros.edUnidad(this.value)"><option value="min"' + (f.unidad === 'min' ? ' selected' : '') + '>minutos</option><option value="h"' + (f.unidad === 'h' ? ' selected' : '') + '>horas</option></select></div><div class="pr-nota">Desde 15 minutos.</div>';
  if (preset === 'horas') {
    h += '<label class="pr-l">Horas</label>' + (f.horas || []).map((x, i) => '<div class="pr-cat"><input class="pr-in fo-hs fo-hora" type="time" value="' + _rgEsc(x) + '" onchange="Registros.edHora(' + i + ',this.value)"><button type="button" class="pr-btn pr-btn-d" onclick="Registros.edQuitarHora(' + i + ')">Quitar</button></div>').join('')
      + '<div class="pr-cat"><input id="rg-e-nueva" class="pr-in fo-hs fo-hora" type="time"><button type="button" class="pr-btn pr-btn-p" onclick="Registros.edAgregarHora()">Agregar hora</button></div>';
  } else {
    h += '<div class="pr-cat"><span>Desde</span><input class="pr-in fo-hs fo-hora" id="rg-e-desde" type="time" value="' + _rgEsc(e.desde) + '" onchange="Registros.ed(\'desde\',this.value)"><span>hasta</span><input class="pr-in fo-hs fo-hora" id="rg-e-hasta" type="time" value="' + _rgEsc(e.hasta) + '" onchange="Registros.ed(\'hasta\',this.value)"></div>';
  }
  h += '<label class="pr-l">Días de la semana</label><div class="fo-cats rg-dias">' + [1, 2, 3, 4, 5, 6, 0].map(d => '<button type="button" class="fo-cat rg-dia' + (e.dias.includes(d) ? ' on' : '') + '" data-d="' + d + '" onclick="Registros.edDia(' + d + ')">' + RG_DIAS[d] + '</button>').join('') + '</div>';
  h += '<label class="pr-l">Preguntas propias' + (e.principal ? ' (además de las fijas: qué hacías, en qué pensabas, energía y pulgares)' : '') + '</label>'
    + (e.preguntas || []).map((p, i) => '<div class="rg-preg"><input class="pr-in" maxlength="120" placeholder="La pregunta" value="' + _rgEsc(p.texto) + '" oninput="Registros.edPreg(' + i + ',\'texto\',this.value)">'
      + '<div class="pr-cat"><select class="pr-in fo-hs rg-tipo" onchange="Registros.edPreg(' + i + ',\'tipo\',this.value,true)">' + [['texto', 'Texto'], ['opciones', 'Opciones'], ['escala', 'Escala 1 a 5']].map(o => '<option value="' + o[0] + '"' + (p.tipo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>'
      + '<button type="button" class="pr-btn pr-btn-d" onclick="Registros.edQuitarPreg(' + i + ')">Quitar</button></div>'
      + (p.tipo === 'opciones' ? '<input class="pr-in" maxlength="200" placeholder="Opciones separadas por coma" value="' + _rgEsc(Array.isArray(p.opciones) ? p.opciones.join(', ') : p.opciones) + '" oninput="Registros.edPreg(' + i + ',\'opciones\',this.value)">' : '') + '</div>').join('')
    + '<div class="pr-form-f" style="justify-content:flex-start"><button type="button" class="pr-btn" id="rg-e-addp" onclick="Registros.edAgregarPreg()">+ Pregunta</button></div>';
  h += '<label class="pr-chk"><span>En pausa (no avisa)</span><input type="checkbox" id="rg-e-pausa"' + (e.pausado ? ' checked' : '') + ' onchange="Registros.ed(\'pausado\',this.checked)"></label>';
  h += '<div class="pr-form-f">' + (e.esNuevo || e.principal ? '' : '<button type="button" class="pr-btn pr-btn-d" onclick="Registros.eliminar()">Eliminar</button>')
    + '<button type="button" class="pr-btn" onclick="Registros.cerrarEd()">Cancelar</button><button type="button" class="pr-btn pr-btn-p fo-btn" id="rg-e-guardar" onclick="Registros.guardarEd()">Guardar</button></div>';
  return h;
}
function _rgEdRender() {
  const host = document.getElementById('rg-ed-host'); if (!host || !_rgE) return;
  const panel = host.closest('.cm-panel'), top = panel ? panel.scrollTop : 0;
  host.innerHTML = _rgEdHtml(); if (panel) panel.scrollTop = top;
}
function _rgAbrirEd(reg) {
  _rgE = reg ? JSON.parse(JSON.stringify(reg)) : { id: _rgUid(), nombre: '', frecuencia: { tipo: 'cada', cada: 60, unidad: 'min' }, desde: '09:00', hasta: '21:00', dias: [0, 1, 2, 3, 4, 5, 6], pausado: false, pausadoDesde: '', inicio: '', preguntas: [{ id: _rgUid(), texto: '', tipo: 'texto', opciones: [] }], esNuevo: true };
  if (!_rgE.dias || !_rgE.dias.length) _rgE.dias = [0, 1, 2, 3, 4, 5, 6];
  if (!_rgE.desde) _rgE.desde = '09:00'; if (!_rgE.hasta) _rgE.hasta = '21:00';
  _rgE._orig = reg ? JSON.stringify([reg.frecuencia, reg.desde, reg.hasta, (reg.dias || []).slice().sort()]) : '';
  const ov = _rgAbrirOv('ov-registro-ed', 'VIDA · REGISTROS', reg ? 'Editar registro' : 'Nuevo registro', 'rg-ed-host'); if (!ov) return;
  _rgEdRender(); CMOverlay.open(ov);
}

// ── Historial y resumen ────────────────────────────────────────────────────
let _rgH = { preset: 'hoy', desde: '', hasta: '', val: '', sobre: '', categoria: '', texto: '', registroId: '' };
function _rgHRango() {
  const hoy = rgFechaDe(new Date()), p = _rgH.preset;
  if (p === 'hoy') return [hoy, hoy];
  if (p === 'semana') return [rgLunes(hoy), rgSumarDias(rgLunes(hoy), 6)];
  if (p === 'semana_ant') { const l = rgSumarDias(rgLunes(hoy), -7); return [l, rgSumarDias(l, 6)]; }
  if (p === '30') return [rgSumarDias(hoy, -29), hoy];
  const d = _rgH.desde || rgSumarDias(hoy, -6), h = _rgH.hasta || hoy;
  return d <= h ? [d, h] : [h, d];
}
const _rgTit = { hoy: 'Hoy', semana: 'Esta semana', semana_ant: 'La semana pasada', 30: 'Últimos 30 días', rango: 'Rango elegido' };
function _rgIcono(v) { return v === 1 ? '<span class="rg-ic rg-ic-ok" aria-label="Salió bien">👍</span>' : v === -1 ? '<span class="rg-ic rg-ic-mal" aria-label="Salió mal">👎</span>' : ''; }
function _rgFechaLarga(ds) { const [y, m, d] = ds.split('-').map(Number); return ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(y, m - 1, d).getDay()] + ' ' + d + '/' + m; }
function _rgEntradaHtml(e) {
  const hh = '<div class="rg-ent-h"><b>' + _rgEsc(e.hora) + '</b> <span class="rg-chip">' + _rgEsc(e.registro) + '</span>';
  if (e.tipo === 'sin_respuesta') return '<div class="rg-ent rg-sin">' + hh + '<span class="rg-sin-t">Sin respuesta</span></div></div>';
  if (e.tipo === 'pendiente') return '<div class="rg-ent rg-sin">' + hh + '<span class="rg-sin-t">Esperando tu respuesta</span><button type="button" class="pr-btn pr-btn-p rg-resp-h" onclick="Registros.abrirOcurrencia(\'' + _rgEsc(e.registroId) + '\',\'' + _rgEsc(e.slot) + '\')">Responder</button></div></div>';
  let b = '';
  if (e.actividad || rgCats(e).length) b += '<div class="rg-l"><span class="rg-lbl">Hacía</span> ' + _rgEsc(e.actividad) + rgCats(e).map(c => ' <span class="rg-chip rg-cat">' + _rgEsc(rgCategoriaNombre(c) || c) + '</span>').join('') + ' ' + _rgIcono(e.valAct) + '</div>';
  if (e.pensamiento) b += '<div class="rg-l"><span class="rg-lbl">Pensaba</span> ' + _rgEsc(e.pensamiento) + ' ' + _rgIcono(e.valPen) + '</div>';
  if (e.energia) b += '<div class="rg-l"><span class="rg-lbl">Energía</span> ' + _rgEsc(e.energia) + ' de 5</div>';
  e.extras.forEach(x => { if (x.valor !== undefined && x.valor !== '') b += '<div class="rg-l"><span class="rg-lbl">' + _rgEsc(x.texto) + '</span> ' + _rgEsc(x.valor) + '</div>'; });
  e.aprendizajes.forEach(a => {
    b += '<div class="rg-apr-i"><b>Qué hago la próxima vez (' + (a.sobre === 'pensamiento' ? 'pensamiento' : 'actividad') + '):</b> ' + _rgEsc(a.queHago || '—')
      + (a.etiquetas && a.etiquetas.length ? ' <small class="pr-meta">' + a.etiquetas.map(t => '#' + _rgEsc(t)).join(' ') + '</small>' : '')
      + (a.queHago ? (a.principioId ? ' <span class="pr-meta">Ya es un principio</span>' : ' <button type="button" class="pr-btn rg-conv" onclick="Registros.aPrincipio(\'' + _rgEsc(a.id) + '\')">Convertir en principio</button>') : '') + '</div>';
  });
  const edit = e.tipo === 'respuesta' ? '<button type="button" class="pr-btn rg-ed-r" aria-label="Corregir respuesta" onclick="Registros.editarRespuesta(\'' + _rgEsc(e.id) + '\')">✎</button>' : '';
  return '<div class="rg-ent">' + hh + (e.tipo === 'foco' ? ' <small class="pr-meta">chequeo anterior</small>' : '') + edit + '</div>' + b + '</div>';
}
function _rgResumenHtml(res) {
  if (!res.respuestas && !res.sinRespuesta) return '<div class="pr-vacio">Todavía no hay respuestas en este período.</div>';
  let h = '<div class="rg-res-t">' + res.respuestas + ' respuesta' + (res.respuestas === 1 ? '' : 's') + (res.sinRespuesta ? ' · ' + res.sinRespuesta + ' sin respuesta' : '') + '</div>';
  if (res.categorias.length) h += '<div class="rg-res-s">En qué se fue el tiempo</div>' + res.categorias.map(c => '<div class="pr-cat fo-rep"><span>' + _rgEsc(c.nombre) + '</span><b>' + c.n + ' · ' + c.pct + '%</b></div>').join('')
    + '<div class="pr-nota">Sobre ' + res.nCategorias + ' respuestas con categoría. Un registro con varias actividades cuenta en cada una. Es una muestra, no un cronómetro.</div>';
  if (res.franjas.length) h += '<div class="rg-res-s">Energía por momento del día</div>' + res.franjas.map(f => '<div class="pr-cat fo-rep"><span>' + _rgEsc(f.nombre) + (f.n < 3 ? ' <small class="pr-meta">pocos datos</small>' : '') + '</span><b>' + (Math.round(f.energia * 10) / 10).toFixed(1).replace('.', ',') + ' · ' + f.n + ' resp.</b></div>').join('');
  h += '<div class="rg-res-s">Qué salió bien y qué mal</div><div class="pr-cat fo-rep"><span>Actividades</span><b>👍 ' + res.upAct + ' · 👎 ' + res.downAct + '</b></div><div class="pr-cat fo-rep"><span>Pensamientos</span><b>👍 ' + res.upPen + ' · 👎 ' + res.downPen + '</b></div>';
  const lista = (t, l) => l.length ? '<div class="pr-nota"><b>' + t + ':</b> ' + l.map(x => _rgEsc(x.texto)).join(' · ') + '</div>' : '';
  return h + lista('Salió bien', res.bien) + lista('Salió mal', res.mal);
}
function _rgHResultados() {
  const host = document.getElementById('rg-h-res'); if (!host) return;
  const [d, h] = _rgHRango(), todas = rgEntradas(S, d, h, rgAhoraStr());
  const fil = rgFiltrar(todas, _rgH);
  let html = '<div class="pr-card"><div class="pr-form-t">Resumen · ' + _rgEsc(_rgTit[_rgH.preset]) + '</div>' + _rgResumenHtml(rgResumen(todas)) + '</div>';
  const porDia = {}; fil.forEach(e => { (porDia[e.fecha] = porDia[e.fecha] || []).push(e); });
  const dias = Object.keys(porDia).sort().reverse();
  html += dias.length ? dias.map(ds => '<div class="pr-card"><div class="pr-form-t">' + _rgEsc(_rgFechaLarga(ds)) + '</div>' + porDia[ds].map(_rgEntradaHtml).join('') + '</div>').join('') : '<div class="pr-vacio">Nada coincide con lo que elegiste.</div>';
  const aprs = _rgAprs().filter(a => a && a.fecha >= d && a.fecha <= h && String(a.queHago || '').trim());
  const aprsF = _rgH.texto ? aprs.filter(a => rgNorm((a.queHago || '') + ' ' + (a.contexto || '') + ' ' + (a.etiquetas || []).join(' ')).includes(rgNorm(_rgH.texto).trim())) : aprs;
  if (aprsF.length) html += '<div class="pr-card"><div class="pr-form-t">Aprendizajes del período</div>' + aprsF.map(a => '<div class="rg-apr-i">' + _rgEsc(a.queHago) + (a.contexto ? '<br><small class="pr-meta">Cuando: ' + _rgEsc(a.contexto) + '</small>' : '')
    + (a.etiquetas && a.etiquetas.length ? ' <small class="pr-meta">' + a.etiquetas.map(t => '#' + _rgEsc(t)).join(' ') + '</small>' : '')
    + (a.principioId ? ' <span class="pr-meta">Ya es un principio</span>' : ' <button type="button" class="pr-btn rg-conv" onclick="Registros.aPrincipio(\'' + _rgEsc(a.id) + '\')">Convertir en principio</button>') + '</div>').join('') + '</div>';
  host.innerHTML = html;
}
function _rgHRender() {
  const host = document.getElementById('rg-h-host'); if (!host) return;
  const [d, h] = _rgHRango(), sel = (k, ops) => ops.map(o => '<option value="' + _rgEsc(o[0]) + '"' + (_rgH[k] === o[0] ? ' selected' : '') + '>' + _rgEsc(o[1]) + '</option>').join('');
  host.innerHTML = '<div class="fo-cats rg-presets">' + [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['semana_ant', 'Semana pasada'], ['30', '30 días']].map(p => '<button type="button" class="fo-cat' + (_rgH.preset === p[0] ? ' on' : '') + '" data-p="' + p[0] + '" onclick="Registros.h(\'preset\',\'' + p[0] + '\')">' + p[1] + '</button>').join('') + '</div>'
    + '<div class="pr-cat"><span>Del</span><input class="pr-in fo-hs rg-fecha" id="rg-h-desde" type="date" value="' + d + '" onchange="Registros.h(\'desde\',this.value)"><span>al</span><input class="pr-in fo-hs rg-fecha" id="rg-h-hasta" type="date" value="' + h + '" onchange="Registros.h(\'hasta\',this.value)"></div>'
    + '<div class="rg-filtros"><select id="rg-h-val" class="pr-in" aria-label="Valoración" onchange="Registros.h(\'val\',this.value)">' + sel('val', [['', 'Todas las valoraciones'], ['up', '👍 Salió bien'], ['down', '👎 Salió mal']]) + '</select>'
    + '<select id="rg-h-sobre" class="pr-in" aria-label="Actividad o pensamiento" onchange="Registros.h(\'sobre\',this.value)">' + sel('sobre', [['', 'Actividad y pensamiento'], ['actividad', 'Solo actividad'], ['pensamiento', 'Solo pensamiento']]) + '</select>'
    + '<select id="rg-h-cat" class="pr-in" aria-label="Categoría" onchange="Registros.h(\'categoria\',this.value)">' + sel('categoria', [['', 'Todas las categorías']].concat(RG_CATEGORIAS, rgCategoriasPropias(_rgResps()).map(c => [c.clave, c.nombre]))) + '</select>'
    + '<select id="rg-h-reg" class="pr-in" aria-label="Registro" onchange="Registros.h(\'registroId\',this.value)">' + sel('registroId', [['', 'Todos los registros']].concat(rgOrdenados(_rgRegs().filter(r => r && r.id)).map(r => [r.id, r.nombre]))) + '</select>'
    + '<input id="rg-h-texto" class="pr-in" type="search" placeholder="Buscar texto" aria-label="Buscar texto" value="' + _rgEsc(_rgH.texto) + '" oninput="Registros.h(\'texto\',this.value)"></div>'
    + '<div id="rg-h-res"></div>';
  _rgHResultados();
}

// ── API ────────────────────────────────────────────────────────────────────
const Registros = {
  render: rgRenderCard,
  // Ventana principal (antes era una tarjeta de Vida): lista de registros + historial + configuración.
  abrir() {
    if (typeof CMOverlay === 'undefined') return;
    const { overlay, body } = CMOverlay.build({ id: 'ov-registros', accent: '#0FB9D6', onClose: () => { const b = document.getElementById('rg-btn'); if (b) b.focus(); } });
    if (!document.getElementById('registros-body')) body.innerHTML = '<div class="cm-ov-head"><div class="cm-ov-eyebrow">VIDA</div><div class="cm-ov-title">📝 Registros</div></div>'
      + '<div class="rg-ov-acc"><button type="button" class="btn btn-ghost btn-sm" id="rg-nuevo" onclick="Registros.nuevo()">+ Registro</button></div><div id="registros-body"></div>';
    document.body.appendChild(overlay); rgRenderCard(); CMOverlay.open(overlay);
    const c = overlay.querySelector('.cm-ov-close'); if (c) c.focus();
  },
  semana: rgConteoSemana,
  // Respuesta
  responder(id) { const r = _rgReg(id); if (!r) return; const p = _rgPendiente(r); if (p) Registros.abrirOcurrencia(id, p.slot); else _rgAbrirForm(r, '', null); },
  abrirOcurrencia(id, slot) {
    const r = _rgReg(id); if (!r) { _rgToast('Ese registro ya no existe'); return; }
    const hecha = slot ? _rgResps().find(x => x && x.registroId === id && x.slot === slot) : null;
    if (hecha) _rgToast('Ya lo respondiste: podés corregirlo');
    _rgAbrirForm(r, slot, hecha || null);
  },
  editarRespuesta(id) { const x = _rgResps().find(r => r && r.id === id), r = x && _rgReg(x.registroId); if (!r) { _rgToast('No se puede editar: el registro ya no existe'); return; } _rgAbrirForm(r, x.slot, x); },
  f(campo, v) { if (!_rgF) return; _rgF[campo] = v; if (campo === 'actividad') Registros._sug('actividad'); if (campo === 'pensamiento') Registros._sug('pensamiento'); },
  // Multi-selección: tocar enciende/apaga. Tope RG_CATS_MAX.
  _toggleCat(c) {
    const k = rgCatClave(c), i = _rgF.cats.findIndex(x => rgCatClave(x) === k);
    if (i >= 0) _rgF.cats.splice(i, 1);
    else if (_rgF.cats.length >= RG_CATS_MAX) { _rgToast('Máximo ' + RG_CATS_MAX + ' categorías'); return; }
    else _rgF.cats.push(c);
    _rgFormRender();
  },
  cat(c) { if (_rgF) Registros._toggleCat(c); },
  catPropia(n) { if (_rgF) Registros._toggleCat(rgCategoriaCanon(n)); },
  otra(v) { if (_rgF) _rgF.otra = v; },
  // Agrega lo escrito como una categoría elegida más (Enter o +). silencio=true: sin avisos (se usa al guardar).
  agregarOtra(silencio) {
    if (!_rgF) return; const c = rgCategoriaCanon(_rgF.otra); if (!c) return;
    const k = rgCatClave(c);
    if (!_rgF.cats.some(x => rgCatClave(x) === k)) {
      if (_rgF.cats.length >= RG_CATS_MAX) { if (!silencio) _rgToast('Máximo ' + RG_CATS_MAX + ' categorías'); return; }
      _rgF.cats.push(c);
    }
    _rgF.otra = ''; if (!silencio) { _rgFormRender(); const i = document.getElementById('rg-cat-otra'); if (i) i.focus(); }
  },
  en(n) { if (!_rgF) return; _rgF.energia = _rgF.energia === n ? null : n; _rgFormRender(); },
  th(lado, v) {
    if (!_rgF) return; const k = lado === 'actividad' ? 'valAct' : 'valPen';
    _rgF[k] = _rgF[k] === v ? 0 : v; _rgFormRender();
  },
  apr(lado, campo, v) { if (!_rgF) return; _rgF.apr[lado][campo] = v; if (campo === 'etiq') Registros._sug(lado); },
  etiq(lado, t) { if (!_rgF) return; const a = _rgF.apr[lado], l = rgEtiquetas(a.etiq); if (!l.includes(t)) l.push(t); a.etiq = l.join(', '); _rgFormRender(); },
  _sug(lado) { const h = document.getElementById('rg-sug-' + lado); if (h && _rgF) h.innerHTML = _rgSugHtml(lado); },
  ex(pid, v, redib) { if (!_rgF) return; if (redib && _rgF.extras[pid] === v) delete _rgF.extras[pid]; else _rgF.extras[pid] = v; if (redib) _rgFormRender(); },
  cerrarForm() { if (typeof CMOverlay !== 'undefined') CMOverlay.close('ov-registro-resp'); _rgF = null; },
  guardar() {
    const f = _rgF, reg = f && _rgReg(f.regId); if (!reg) return;
    const hay = (reg.principal && (f.actividad.trim() || f.cats.length || f.otra.trim() || f.pensamiento.trim() || f.energia)) || (reg.preguntas || []).some(p => f.extras[p.id] !== undefined && String(f.extras[p.id]).trim() !== '');
    if (!hay) { _rgToast('Contestá al menos una pregunta'); return; }
    const ahora = new Date(), resps = _rgResps();
    let r = f.editId ? resps.find(x => x.id === f.editId) : null;
    if (!r && f.slot) r = resps.find(x => x.registroId === reg.id && x.slot === f.slot) || null;   // un solo registro por aviso
    if (!r) { r = { id: _rgUid(), registroId: reg.id, fecha: rgFechaDe(ahora), hora: _rgP2(ahora.getHours()) + ':' + _rgP2(ahora.getMinutes()), slot: f.slot || '' }; resps.push(r); }
    if (reg.principal) Registros.agregarOtra(true);   // lo escrito y no confirmado con + también entra
    const cats = f.cats.slice(0, RG_CATS_MAX);
    if (reg.principal) Object.assign(r, { actividad: f.actividad.trim(), categoria: cats[0] || '', categorias: cats.slice(), pensamiento: f.pensamiento.trim(), energia: f.energia, valAct: f.valAct, valPen: f.valPen });
    r.extras = (reg.preguntas || []).filter(p => f.extras[p.id] !== undefined && String(f.extras[p.id]).trim() !== '').map(p => ({ pid: p.id, texto: p.texto, valor: f.extras[p.id] }));
    // Aprendizajes de los 👎: uno por lado. Si ya no aplica (pulgar cambiado o vacío) se borra, salvo que ya sea un principio.
    const aprs = _rgAprs();
    ['actividad', 'pensamiento'].forEach(lado => {
      const val = lado === 'actividad' ? f.valAct : f.valPen, a = f.apr[lado], et = rgEtiquetas(a.etiq), que = String(a.queHago || '').trim();
      const i = aprs.findIndex(x => x.respuestaId === r.id && x.sobre === lado);
      if (val === -1 && (que || et.length)) {
        const contexto = (lado === 'actividad' ? [r.actividad, rgCatsNombres(r).join(', ')].filter(Boolean).join(' · ') : r.pensamiento).slice(0, 200);
        const nuevo = { id: i >= 0 ? aprs[i].id : _rgUid(), fecha: (rgCuando(r)).slice(0, 10), registroId: reg.id, respuestaId: r.id, sobre: lado, contexto, etiquetas: et, queHago: que, principioId: i >= 0 ? aprs[i].principioId || '' : '' };
        if (i >= 0) aprs[i] = nuevo; else aprs.push(nuevo);
      } else if (i >= 0 && !aprs[i].principioId) aprs.splice(i, 1);
    });
    _rgSave(); Registros.cerrarForm(); rgRenderCard(); _rgHResultados(); if (typeof Foco !== 'undefined' && typeof prRender === 'function') { try { prRender(); } catch (e) {} }
    _rgToast('Registro guardado');
  },
  aPrincipio(id) {
    const a = _rgAprs().find(x => x && x.id === id); if (!a) return;
    if (!window.Principios || !Principios.crearDesdeAprendizaje) { _rgToast('Principios no está disponible'); return; }
    const r = Principios.crearDesdeAprendizaje(a);
    if (!r.ok) { _rgToast('Escribí primero qué hacés la próxima vez'); return; }
    a.principioId = r.id; _rgSave(); _rgToast(r.ya ? 'Ya era un principio' : 'Ahora es un principio');
    if (_rgF) _rgFormRender(); _rgHResultados();
  },
  // Definición
  nuevo() { _rgAbrirEd(null); },
  editar(id) { const r = _rgReg(id); if (r) _rgAbrirEd(r); },
  ed(campo, v) {
    if (!_rgE) return; _rgE[campo] = v;
    if (campo === 'pausado') { _rgE.pausadoDesde = v ? rgAhoraStr() : ''; }
  },
  edFrec(v) {
    const e = _rgE; if (!e) return;
    if (v === 'horas') e.frecuencia = { tipo: 'horas', horas: (e.frecuencia.horas && e.frecuencia.horas.length) ? e.frecuencia.horas : ['11:00', '15:00', '19:00'] };
    else if (v === 'custom') { if (_rgPreset(e) !== 'custom') e.frecuencia = { tipo: 'cada', cada: 45, unidad: 'min' }; }   // 45 para que no se lea como un preset
    else e.frecuencia = { tipo: 'cada', cada: +v, unidad: 'min' };
    _rgEdRender();
  },
  edCada(v) { if (_rgE) _rgE.frecuencia.cada = Number(v); },
  edUnidad(v) { if (_rgE) _rgE.frecuencia.unidad = v; },
  edHora(i, v) { const hs = _rgE.frecuencia.horas; if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) && !hs.some((x, j) => j !== i && x === v)) hs[i] = v; _rgEdRender(); },
  edQuitarHora(i) { _rgE.frecuencia.horas.splice(i, 1); _rgEdRender(); },
  edAgregarHora() { const el = document.getElementById('rg-e-nueva'), v = el ? el.value : '', hs = _rgE.frecuencia.horas; if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { _rgToast('Elegí una hora'); return; } if (!hs.includes(v)) hs.push(v); hs.sort(); _rgEdRender(); },
  edDia(d) { const l = _rgE.dias, i = l.indexOf(d); if (i >= 0) l.splice(i, 1); else l.push(d); _rgEdRender(); },
  edPreg(i, campo, v, redib) { const p = _rgE.preguntas[i]; if (!p) return; p[campo] = v; if (redib) _rgEdRender(); },
  edQuitarPreg(i) { _rgE.preguntas.splice(i, 1); _rgEdRender(); },
  edAgregarPreg() { _rgE.preguntas.push({ id: _rgUid(), texto: '', tipo: 'texto', opciones: [] }); _rgEdRender(); },
  cerrarEd() { if (typeof CMOverlay !== 'undefined') CMOverlay.close('ov-registro-ed'); _rgE = null; },
  guardarEd() {
    const e = _rgE; if (!e) return;
    const reg = JSON.parse(JSON.stringify(e)); delete reg.esNuevo; delete reg._orig;
    reg.nombre = String(reg.nombre || '').trim();
    reg.preguntas = (reg.preguntas || []).map(p => ({ id: p.id, texto: String(p.texto || '').trim(), tipo: p.tipo, opciones: p.tipo === 'opciones' ? rgEtiquetasOpc(p.opciones) : [] }));
    reg.dias = reg.dias.slice().sort((a, b) => a - b);
    if (reg.frecuencia.tipo === 'cada') reg.frecuencia = { tipo: 'cada', cada: Number(reg.frecuencia.cada), unidad: reg.frecuencia.unidad };
    else { delete reg.desde; delete reg.hasta; }
    const msg = rgValidarRegistro(reg); if (msg) { _rgToast(msg); return; }
    const antes = e.esNuevo ? null : _rgReg(e.id), igual = JSON.stringify([reg.frecuencia, reg.desde, reg.hasta, reg.dias]) === e._orig;
    // El horario nuevo rige desde ahora: lo anterior no se vuelve «sin respuesta» por haber cambiado la cuenta.
    if (!antes || !igual || (antes.pausado && !reg.pausado)) reg.inicio = rgAhoraStr(); else reg.inicio = antes.inicio || rgAhoraStr();
    if (!reg.pausado) reg.pausadoDesde = ''; else if (antes && antes.pausado && antes.pausadoDesde) reg.pausadoDesde = antes.pausadoDesde;
    if (antes) Object.assign(antes, reg); else _rgRegs().push(reg);
    _rgHorasAFoco(antes || reg);
    _rgSave(); Registros.cerrarEd(); rgRenderCard(); _rgToast('Registro guardado');
    if (typeof prRender === 'function' && typeof Foco !== 'undefined') { try { prRender(); } catch (er) {} }
  },
  eliminar() {
    const e = _rgE, r = e && _rgReg(e.id); if (!r || r.principal) return;
    if (!confirm('Vas a borrar el registro «' + r.nombre + '». Sus respuestas ya guardadas se conservan en el historial.\n\n¿Confirmás?')) return;
    S.registros = _rgRegs().filter(x => x.id !== r.id); _rgSave(); Registros.cerrarEd(); rgRenderCard(); _rgToast('Registro borrado');
  },
  // Historial
  abrirHistorial() {
    const ov = _rgAbrirOv('ov-registros-hist', 'VIDA · REGISTROS', 'Historial y resumen', 'rg-h-host'); if (!ov) return;
    _rgHRender(); CMOverlay.open(ov);
  },
  h(campo, v) {
    _rgH[campo] = v;
    if (campo === 'desde' || campo === 'hasta') { if (_rgH.preset !== 'rango') { const [d, h] = _rgHRango(); _rgH.desde = d; _rgH.hasta = h; _rgH[campo] = v; } _rgH.preset = 'rango'; _rgHRender(); return; }
    if (campo === 'preset') { _rgHRender(); return; }
    _rgHResultados();
  },
  sincDesdeFoco: rgSincDesdeFoco,
  asegurarPrincipal: rgAsegurarPrincipal,
  abrirDestino(id, slot) { Registros.abrir(); Registros.abrirOcurrencia(id, slot); },
};
if (typeof window !== 'undefined') window.Registros = Registros;

// Arranque: el registro principal se crea una vez, ya cargado el estado (aplicarAccionPendiente corre al final de _initApp); la tarjeta se
// repinta con cada renderGoals y cada minuto (el «sin responder» y el próximo aviso cambian con la hora).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const hook = () => {
    if (typeof window.renderGoals !== 'function' || window._rgBootHooked) return false;
    window._rgBootHooked = true;
    const orig = window.renderGoals;
    window.renderGoals = function () { const r = orig.apply(this, arguments); try { rgRenderCard(); } catch (e) {} return r; };
    return true;
  };
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
  setInterval(() => { try { if (typeof _appBooted !== 'undefined' && _appBooted) rgRenderCard(); } catch (e) {} }, 60000);

  // Deep-link del aviso: '#registro-<id>@<fecha>T<hora>' en la URL (app cerrada → openWindow) o mensaje del SW (app abierta).
  const PRE = '#registro-';
  const parse = u => {
    try {
      const h = new URL(String(u || ''), location.href).hash; if (h.indexOf(PRE) !== 0) return null;
      const t = decodeURIComponent(h.slice(PRE.length)), i = t.lastIndexOf('@');
      return i > 0 ? { id: t.slice(0, i), slot: t.slice(i + 1) } : { id: t, slot: '' };
    } catch (e) { return null; }
  };
  let pend = parse(location.href);
  if (pend) history.replaceState(null, '', location.pathname + location.search);
  const enganchar = () => {
    const orig = window.aplicarAccionPendiente;
    window.aplicarAccionPendiente = function () {
      if (typeof orig === 'function') orig.apply(this, arguments);
      try { if (rgAsegurarPrincipal()) rgRenderCard(); } catch (e) {}
      if (pend) { const p = pend; pend = null; Registros.abrirDestino(p.id, p.slot); }
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => {
    const m = e.data; if (!m || m.tipo !== 'abrir-destino') return;
    const p = parse(m.url); if (!p) return;
    if (typeof _appBooted !== 'undefined' && _appBooted) Registros.abrirDestino(p.id, p.slot); else pend = p;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { rgFechaDe, rgAhoraStr, rgSumarDias, rgLunes, rgNorm, rgPalabras, rgEtiquetas, rgBuscarAprendizajes, rgFrecuenciaTexto, rgValidarRegistro, rgPrincipalNuevo,
    rgSlotsRango, rgEntradas, rgFiltrar, rgResumen, rgConteoSemana, rgCuando, rgCategoriaNombre, rgCategoriaCanon, rgCategoriasPropias, rgCats, RG_PRINCIPAL_ID };
}
