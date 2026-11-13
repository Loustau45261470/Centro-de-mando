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
let _prV = { sub: 'principios', q: '', fSec: '', fTipo: '', fHor: '', imp: null, edit: null, delCat: null, renCat: null };
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
  const subs = [['principios', 'Principios'], ['objetivos', 'Objetivos'], ['categorias', 'Categorías'], ['huecos', 'Huecos'], ['foco', 'Foco']];
  const hu = prHuecos(_prVista(), d.principios, S.habitTrackers);
  const nHuecos = hu.objetivosSinPrincipio.length + hu.principiosSinVinculo.length;
  let h = '<div class="pr-subs">' + subs.map(s => '<button type="button" class="pr-sub' + (_prV.sub === s[0] ? ' on' : '') + '" onclick="Principios.sub(\'' + s[0] + '\')">' + s[1] + (s[0] === 'huecos' && nHuecos ? ' <b>' + nHuecos + '</b>' : '') + '</button>').join('') + '</div>';
  if (_prV.sub === 'principios') h += _prVistaPrincipios(d);
  else if (_prV.sub === 'objetivos') h += _prVistaObjetivos(d);
  else if (_prV.sub === 'categorias') h += _prVistaCategorias(d);
  else if (_prV.sub === 'foco') h += (window.Foco ? window.Foco.html() : '');
  else h += _prVistaHuecos(d, hu);
  root.innerHTML = h;
}

// ── Principios ─────────────────────────────────────────────────────────────
function _prVistaPrincipios(d) {
  if (_prV.edit && _prV.edit.kind === 'principio') return _prFormPrincipio(d);
  if (_prV.imp) return _prVistaImportar(d);
  const lista = prFiltrarPrincipios(d.principios, _prV.q, _prV.fSec, _prV.fTipo);
  const secOpts = [['', 'Todas las secciones']].concat(PR_SECCIONES.map(s => [s, s]));
  const tipoOpts = [['', 'Principios y a evitar'], ['principio', 'Solo principios'], ['anti', 'Solo a evitar']];
  let h = '<div class="pr-bar"><input id="pr-q" class="pr-in" type="search" placeholder="Buscar…" value="' + _prEsc(_prV.q) + '" oninput="Principios.buscar(this.value,this.selectionStart)">'
    + _prSelect('pr-fsec', secOpts, _prV.fSec, 'onchange="Principios.filtro(\'fSec\',this.value)"')
    + _prSelect('pr-ftipo', tipoOpts, _prV.fTipo, 'onchange="Principios.filtro(\'fTipo\',this.value)"')
    + '<button type="button" class="pr-btn pr-btn-p" onclick="Principios.nuevoPrincipio()">+ Principio</button>'
    + '<button type="button" class="pr-btn" onclick="Principios.abrirImportar()">Importar desde Libros</button></div>';
  if (!d.principios.length) return h + '<div class="pr-vacio">Todavía no hay principios. Creá el primero con el botón de arriba.</div>';
  if (!lista.length) return h + '<div class="pr-vacio">Ningún principio coincide con el filtro.</div>';
  const vista = _prVista();
  h += lista.map(p => {
    const n = vista.filter(o => (o.principiosIds || []).includes(p.id)).length;
    const anti = p.tipo === 'anti';
    return '<div class="pr-card ' + (anti ? 'pr-anti' : 'pr-prin') + '">'
      + '<div class="pr-card-h"><span class="pr-tag">' + (anti ? 'A evitar' : 'Principio') + '</span><span class="pr-chip">' + _prEsc(p.seccion || 'Sin sección') + '</span></div>'
      + '<div class="pr-enun">' + _prEsc(p.enunciado) + '</div>'
      + (p.porque ? '<div class="pr-txt"><b>Por qué:</b> ' + _prEsc(p.porque) + '</div>' : '')
      + (p.haz ? '<div class="pr-txt pr-haz"><b>Qué hacer:</b> ' + _prEsc(p.haz) + '</div>' : '')
      + (p.noHagas ? '<div class="pr-txt pr-nohagas"><b>Qué no hacer:</b> ' + _prEsc(p.noHagas) + '</div>' : '')
      + (p.fuente ? '<div class="pr-fuente">Fuente: ' + _prEsc(p.fuente) + '</div>' : '')
      + '<div class="pr-card-f"><span class="pr-meta">' + n + ' objetivo' + (n === 1 ? '' : 's') + ' · ' + (p.habitosIds || []).filter(r => _prHabLabel(r)).length + ' hábito(s)</span>'
      + '<span class="pr-acts"><button type="button" class="pr-btn" onclick="Principios.editarPrincipio(\'' + p.id + '\')">Editar</button>'
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
    + '<div class="pr-form-f"><button type="button" class="pr-btn" onclick="Principios.cancelar()">Cancelar</button><button type="button" class="pr-btn pr-btn-p" onclick="Principios.guardarPrincipio()">Guardar</button></div></div>';
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
  } else if (e.kind === 'objetivo') {
    if (document.getElementById('pro-sec')) _prLeerBorradorObjetivo();
  }
}

const Principios = {
  render: prRender,
  sub(s) { _prVuelca(); _prV.sub = s; _prV.imp = null; _prV.delCat = null; _prV.renCat = null; prRender(); },
  filtro(k, v) { _prV[k] = v; prRender(); },
  buscar(v, pos) { _prV.q = v; prRender(); const e = document.getElementById('pr-q'); if (e) { const p = pos == null ? v.length : pos; e.focus(); e.setSelectionRange(p, p); } },
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
    const nuevo = {
      id: _prV.edit.id || _prUid(), tipo: _prVal('prf-tipo') === 'anti' ? 'anti' : 'principio', enunciado: enun, porque: _prVal('prf-porque').trim(),
      seccion: _prVal('prf-sec'), haz: _prVal('prf-haz').trim(), noHagas: _prVal('prf-nohagas').trim(), fuente: _prVal('prf-fuente').trim(), habitosIds: _prVals('hab'),
    };
    if (p && p.origen) nuevo.origen = p.origen;
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { prSembrarCategorias, prVistaObjetivos, prContarHijos, prCadena, prHuecos, prVinculosDePrincipio, prContarObjetivosDeCategoria,
    prEliminarCategoria, prEliminarPrincipio, prEliminarObjetivo, prFiltrarPrincipios, prKeyTrimestral, prImportCandidatos, prPrincipioDeLibro, prSeccionDeLibro, prRecortarEnunciado };
}
