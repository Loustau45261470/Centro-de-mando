'use strict';
// ════════════════════════════════════════════════════════════════════════
// LIBROS — overlay del abanico de Conocimiento: una ficha por libro con sus ideas prácticas, filosofía y
// lecciones, frases, cosas para aplicar y un resumen propio. Además, una "frase del día" en la pantalla Conocimiento.
//
// Estado (clave nueva de primer nivel, sincroniza como cualquier otra: el guardado serializa todo S).
// Modelo compacto: fechas ISO cortas, sin campos vacíos innecesarios y sin duplicar texto (los vínculos guardan solo ids).
//   S.libros = {
//     items: [{
//       id, titulo, autor, estado: 'por_leer'|'leyendo'|'leido', ini, fin,    // ini/fin: 'YYYY-MM-DD' o ''
//       pt: 0..5 (0 = sin puntaje), cat (texto libre; la lista sugerida es solo ayuda), creado (ms),
//       notas:   [{ id, cat: 'ideas'|'filo'|'resumen', titulo, texto, fecha }],     // texto = formato de rich-notes.js
//       frases:  [{ id, texto, pag?, fav? }],                                       // pag y fav solo si tienen valor
//       aplicar: [{ id, texto, ok?, hab?, tar? }]                                   // hab = 'seccion|idHabito', tar = 'seccion|idTarea'
//     }]
//   }
// "Para aplicar" → Hábito crea un hábito en la sección elegida (addHabitTo, habitos.js); → Tarea crea una tarea en
// la carpeta "Libros" de esa sección de Proyectos (window.Proyectos). El ítem solo guarda el vínculo.
// ════════════════════════════════════════════════════════════════════════

const LB_ACCENT = '#6B8EFF';
const LB_ESTADOS = [
  ['por_leer', 'Por leer', '#94A3B8'],
  ['leyendo', 'Leyendo', '#38BDF8'],
  ['leido', 'Leído', '#22C55E'],
];
const LB_TABS = [['ideas', 'Ideas prácticas'], ['filo', 'Filosofía y lecciones'], ['frases', 'Frases'], ['aplicar', 'Para aplicar'], ['resumen', 'Resumen y opinión']];
const LB_NOTE_CATS = ['ideas', 'filo', 'resumen'];
const LB_NOTE_HINT = { ideas: 'Escribí la idea práctica…', filo: 'Escribí la lección o la reflexión…', resumen: 'Escribí tu resumen y tu opinión…' };
const LB_CATS = ['Finanzas', 'Filosofía', 'Fe', 'Deporte', 'Negocios', 'Derecho', 'Psicología', 'Historia', 'Ficción', 'Biografía'];
const LB_SECCIONES = [['conocimiento', 'Conocimiento'], ['vida', 'Vida'], ['salud', 'Salud'], ['finanzas', 'Finanzas'], ['ia', 'IA']];

const _lbEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const _LB_IC = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="M14 6.5l3.5 3.5"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
};

// ── Estado de la vista (solo en memoria) ───────────────────────────────────
function _lbViewNew() { return { screen: 'list', id: null, tab: 'ideas', fEstado: '', fCat: '', orden: 'recientes', q: '', nuevo: false, nota: null, frase: null, aplEd: null, conv: null }; }
let _lbV = _lbViewNew();

// ── Datos ──────────────────────────────────────────────────────────────────
function _lbData() {
  if (typeof S === 'undefined') return { items: [] };
  let d = S.libros;
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = S.libros = { items: [] };
  if (!Array.isArray(d.items)) d.items = [];
  return d;
}
function _lbSave() { if (typeof saveState === 'function') saveState(); _lbRenderFraseDia(); }
function _lbToast(m) { if (typeof showToast === 'function') showToast(m); }
function _lbUid() { return (typeof uid === 'function') ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _lbToday() { return (typeof getActiveDate === 'function') ? getActiveDate() : new Date().toISOString().slice(0, 10); }
function _lbFmt(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function _lbVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function _lbFocus(id) { const el = document.getElementById(id); if (el) el.focus(); }
function _lbCur() { return _lbData().items.find(l => l.id === _lbV.id) || null; }
function _lbEstado(k) { return LB_ESTADOS.find(e => e[0] === k) || LB_ESTADOS[0]; }
function _lbSecLabel(k) { return (LB_SECCIONES.find(s => s[0] === k) || [, k])[1]; }
function _lbByDateDesc(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); }
// Sin tildes y en minúsculas, carácter a carácter (el largo no cambia: sirve para ubicar el hallazgo en el texto original).
function _lbNorm(s) {
  s = String(s == null ? '' : s); let o = '';
  for (let i = 0; i < s.length; i++) o += s[i].normalize('NFD')[0].toLowerCase()[0];
  return o;
}
const _lbCatKey = c => _lbNorm(String(c || '').trim());

// ── Apertura ───────────────────────────────────────────────────────────────
// opts opcional: { id, tab } abre directo la ficha de ese libro en esa pestaña (lo usa la frase del día).
function librosOpen(opts) {
  if (typeof CMOverlay === 'undefined') return;
  const { overlay, body } = CMOverlay.build({ id: 'ov-libros', accent: LB_ACCENT, onClose: () => { _lbV = _lbViewNew(); _lbRenderFraseDia(); } });
  if (!overlay._lbBuilt) {
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Libros');
    overlay._lbBuilt = true;
    _lbBind(body);
  }
  _lbV = _lbViewNew();
  if (opts && opts.id && _lbData().items.some(l => l.id === opts.id)) {
    _lbV.screen = 'libro'; _lbV.id = opts.id;
    _lbV.tab = LB_TABS.some(t => t[0] === opts.tab) ? opts.tab : 'ideas';
  }
  _lbRender();
  CMOverlay.open(overlay);
}
window.Libros = { open: librosOpen };
window.openLibrosOverlay = librosOpen;

function _lbBody() { const ov = document.getElementById('ov-libros'); return ov ? ov.querySelector('.cm-ov-body') : null; }
function _lbRender() {
  const body = _lbBody(); if (!body) return;
  const top = body.scrollTop;
  body.innerHTML = `<div class="lb-root" style="--nt-accent:${LB_ACCENT}">${_lbV.screen === 'libro' && _lbCur() ? _lbLibro(_lbCur()) : _lbList()}</div>`;
  body.scrollTop = top;
}

// ── Piezas visuales ────────────────────────────────────────────────────────
function _lbChip(estado) {
  const e = _lbEstado(estado);
  return `<span class="lb-estado" style="--c:${e[2]}">${_lbEsc(e[1])}</span>`;
}
function _lbStars(pt) {
  pt = Math.max(0, Math.min(5, Number(pt) || 0));
  return `<span class="lb-stars" role="img" aria-label="${pt ? pt + ' de 5' : 'Sin puntaje'}">${'★'.repeat(pt)}<i>${'★'.repeat(5 - pt)}</i></span>`;
}
function _lbRich(texto, interactive, onSave) {
  if (typeof rnRender !== 'function') return `<div class="nt-note-text">${_lbEsc(texto)}</div>`;
  return rnRender(texto || '', interactive ? { interactive: true, texto, onSave } : { interactive: false });
}
function _lbCatsUsadas(items) {
  const m = new Map();
  items.forEach(l => { const k = _lbCatKey(l.cat); if (k && !m.has(k)) m.set(k, String(l.cat).trim()); });
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
}

// ── Lista de libros ────────────────────────────────────────────────────────
function _lbOrdenar(items) {
  const arr = items.slice();
  if (_lbV.orden === 'puntaje') arr.sort((a, b) => (b.pt || 0) - (a.pt || 0) || (a.titulo || '').localeCompare(b.titulo || '', 'es'));
  else if (_lbV.orden === 'titulo') arr.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'es'));
  else arr.sort((a, b) => (b.creado || 0) - (a.creado || 0));
  return arr;
}
function _lbCards() {
  const d = _lbData();
  const items = _lbOrdenar(d.items.filter(l => (!_lbV.fEstado || l.estado === _lbV.fEstado) && (!_lbV.fCat || _lbCatKey(l.cat) === _lbV.fCat)));
  if (!items.length) return `<div class="nt-empty">${d.items.length ? 'No hay libros con ese filtro.' : 'Todavía no cargaste libros. Sumá el primero para guardar sus ideas, frases y lo que querés aplicar.'}</div>`;
  return `<div class="lb-grid">${items.map(l => {
    const meta = [l.autor, l.cat].filter(Boolean);
    const cuenta = [(l.frases || []).length ? `${l.frases.length} frase${l.frases.length === 1 ? '' : 's'}` : '', (l.aplicar || []).length ? `${l.aplicar.filter(a => !a.ok).length} por aplicar` : ''].filter(Boolean);
    return `<button class="lb-card" data-act="abrir" data-id="${_lbEsc(l.id)}">
      <span class="lb-card-top"><span class="lb-card-ttl">${_lbEsc(l.titulo || '(sin título)')}</span>${_lbChip(l.estado)}</span>
      ${l.autor ? `<span class="lb-card-aut">${_lbEsc(l.autor)}</span>` : ''}
      <span class="lb-card-foot">${l.pt ? _lbStars(l.pt) : '<span class="lb-muted">Sin puntaje</span>'}${l.cat ? `<span class="lb-cat">${_lbEsc(l.cat)}</span>` : ''}</span>
      ${cuenta.length ? `<span class="lb-card-sum">${_lbEsc(cuenta.join(' · '))}</span>` : ''}
    </button>`;
  }).join('')}</div>`;
}
// Resultados del buscador: título/autor/categoría y el contenido de cada pestaña. Muestra el libro y dónde apareció.
function _lbPlano(s) { return String(s == null ? '' : s).replace(/[`*#>]/g, '').replace(/\[[ xX]?\]/g, '').replace(/\s+/g, ' ').trim(); }
function _lbSnippet(plain, nq) {
  const i = _lbNorm(plain).indexOf(nq); if (i < 0) return null;
  const a = Math.max(0, i - 40), b = Math.min(plain.length, i + nq.length + 70);
  return (a > 0 ? '…' : '') + _lbEsc(plain.slice(a, i)) + '<mark>' + _lbEsc(plain.slice(i, i + nq.length)) + '</mark>' + _lbEsc(plain.slice(i + nq.length, b)) + (b < plain.length ? '…' : '');
}
function _lbBuscar(q) {
  const nq = _lbNorm(_lbPlano(q)); if (!nq) return [];
  const out = [];
  _lbData().items.forEach(l => {
    const hits = [];
    const probar = (tab, label, textos) => {
      for (const t of textos) { const p = _lbPlano(t), s = p && _lbSnippet(p, nq); if (s) { hits.push({ tab, label, html: s }); return; } }
    };
    probar(null, 'Datos del libro', [l.titulo, l.autor, l.cat]);   // sin pestaña: abre la ficha en la primera
    LB_TABS.forEach(([k, label]) => {
      if (LB_NOTE_CATS.includes(k)) probar(k, label, (l.notas || []).filter(n => n.cat === k).flatMap(n => [n.titulo, n.texto]));
      else if (k === 'frases') probar(k, label, (l.frases || []).flatMap(f => [f.texto]));
      else probar(k, label, (l.aplicar || []).map(a => a.texto));
    });
    if (hits.length) out.push({ libro: l, hits });
  });
  return out;
}
function _lbResultados() {
  const q = _lbV.q.trim(); if (!q) return _lbCards();
  const res = _lbBuscar(q);
  if (!res.length) return `<div class="nt-empty">No encontré nada para «${_lbEsc(q)}».</div>`;
  return `<div class="lb-res">${res.map(r => `<div class="lb-resitem">
      <div class="lb-resttl"><span class="lb-card-ttl">${_lbEsc(r.libro.titulo || '(sin título)')}</span>${r.libro.autor ? `<span class="lb-muted">${_lbEsc(r.libro.autor)}</span>` : ''}</div>
      ${r.hits.map(h => `<button class="lb-hit" data-act="abrir" data-id="${_lbEsc(r.libro.id)}" data-t="${h.tab || ''}"><span class="lb-hit-tab">${_lbEsc(h.label)}</span><span class="lb-hit-txt">${h.html}</span></button>`).join('')}
    </div>`).join('')}</div>`;
}
function _lbList() {
  const d = _lbData();
  const counts = {}; d.items.forEach(l => { counts[l.estado] = (counts[l.estado] || 0) + 1; });
  const cats = _lbCatsUsadas(d.items);
  const chips = d.items.length > 1 ? `<div class="nt-tagbar lb-filtros" role="group" aria-label="Filtrar por estado">
      <button class="nt-tagchip${!_lbV.fEstado ? ' on' : ''}" data-act="f-estado" data-v="">Todos · ${d.items.length}</button>
      ${LB_ESTADOS.filter(e => counts[e[0]]).map(e => `<button class="nt-tagchip${_lbV.fEstado === e[0] ? ' on' : ''}" data-act="f-estado" data-v="${e[0]}">${_lbEsc(e[1])} · ${counts[e[0]]}</button>`).join('')}
    </div>` : '';
  const selects = d.items.length > 1 ? `<div class="lb-selects">
      ${cats.length ? `<select class="nt-input" data-chg="f-cat" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>${cats.map(([k, label]) => `<option value="${_lbEsc(k)}"${_lbV.fCat === k ? ' selected' : ''}>${_lbEsc(label)}</option>`).join('')}</select>` : ''}
      <select class="nt-input" data-chg="orden" aria-label="Ordenar libros"><option value="recientes"${_lbV.orden === 'recientes' ? ' selected' : ''}>Más recientes</option><option value="puntaje"${_lbV.orden === 'puntaje' ? ' selected' : ''}>Mejor puntaje</option><option value="titulo"${_lbV.orden === 'titulo' ? ' selected' : ''}>Por título (A-Z)</option></select>
    </div>` : '';
  const form = _lbV.nuevo ? `<div class="lb-formcard">
      <label class="nt-flbl" for="lb-nuevo-titulo">Título del libro</label>
      <input class="nt-input" id="lb-nuevo-titulo" type="text" maxlength="120" placeholder="Ej: El hombre en busca de sentido" data-enter="crear">
      <label class="nt-flbl" for="lb-nuevo-autor">Autor</label>
      <input class="nt-input" id="lb-nuevo-autor" type="text" maxlength="80" placeholder="Ej: Viktor Frankl" data-enter="crear">
      <div class="nt-form-row">
        <div><label class="nt-flbl" for="lb-nuevo-estado">Estado</label>
          <select class="nt-input" id="lb-nuevo-estado">${LB_ESTADOS.map(e => `<option value="${e[0]}">${_lbEsc(e[1])}</option>`).join('')}</select></div>
        <div><label class="nt-flbl" for="lb-nuevo-cat">Categoría</label>
          <input class="nt-input" id="lb-nuevo-cat" type="text" maxlength="40" list="lb-cats" placeholder="Elegí o escribí una" autocomplete="off"></div>
      </div>
      <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="crear">Crear libro</button><button class="nt-btn" data-act="nuevo">Cancelar</button></div>
    </div>` : '';
  const buscando = !!_lbV.q.trim();
  return `<div class="cm-ov-head"><div class="cm-ov-eyebrow">CONOCIMIENTO · LIBROS</div><div class="cm-ov-title">Libros</div></div>
    <datalist id="lb-cats">${_lbCatSugeridas().map(c => `<option value="${_lbEsc(c)}"></option>`).join('')}</datalist>
    <div class="lb-bar">
      ${d.items.length ? `<div class="nt-search-wrap lb-search"><svg class="nt-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input class="nt-input nt-search" id="lb-q" type="search" maxlength="80" value="${_lbEsc(_lbV.q)}" data-inp="buscar" placeholder="Buscar en todos tus libros…" aria-label="Buscar en todos tus libros"></div>` : ''}
      <button class="nt-btn nt-add lb-addbtn" data-act="nuevo"><span class="nt-add-plus">+</span> Libro</button>
    </div>
    ${form}
    <div class="lb-filtrosw" id="lb-filtros"${buscando ? ' hidden' : ''}>${chips}${selects}</div>
    <div id="lb-lista">${_lbResultados()}</div>`;
}
// Sugeridas (lista fija) + las que ya usaste, sin repetir.
function _lbCatSugeridas() {
  const seen = new Set(), out = [];
  LB_CATS.concat(_lbCatsUsadas(_lbData().items).map(c => c[1])).forEach(c => { const k = _lbCatKey(c); if (!seen.has(k)) { seen.add(k); out.push(c); } });
  return out;
}

// ── Dentro de un libro ─────────────────────────────────────────────────────
function _lbTabLabel(l, t) {
  const n = t[0] === 'frases' ? (l.frases || []).length : t[0] === 'aplicar' ? (l.aplicar || []).length : (l.notas || []).filter(x => x.cat === t[0]).length;
  return n ? `${_lbEsc(t[1])} <span class="lb-tn">${n}</span>` : _lbEsc(t[1]);
}
function _lbLibro(l) {
  const tabs = LB_TABS.map(t => `<button class="plov-tab${_lbV.tab === t[0] ? ' on' : ''}" id="lb-tab-${t[0]}" data-act="tab" data-t="${t[0]}" role="tab" aria-selected="${_lbV.tab === t[0]}" aria-controls="lb-pane">${_lbTabLabel(l, t)}</button>`).join('');
  let pane;
  if (LB_NOTE_CATS.includes(_lbV.tab)) pane = _lbNotasPane(l, _lbV.tab);
  else if (_lbV.tab === 'frases') pane = _lbFrasesPane(l);
  else pane = _lbAplicarPane(l);
  const stars = [1, 2, 3, 4, 5].map(n => `<button class="lb-star${(l.pt || 0) >= n ? ' on' : ''}" data-act="pt" data-v="${n}" aria-label="Puntaje ${n} de 5" aria-pressed="${l.pt === n}">★</button>`).join('');
  return `<div class="cm-ov-head"><div class="cm-ov-eyebrow">CONOCIMIENTO · LIBROS</div></div>
    <button class="nt-btn lb-back" data-act="volver">‹ Libros</button>
    <datalist id="lb-cats">${_lbCatSugeridas().map(c => `<option value="${_lbEsc(c)}"></option>`).join('')}</datalist>
    <div class="lb-titlerow">
      <input class="nt-input lb-name" id="lb-titulo" type="text" maxlength="120" value="${_lbEsc(l.titulo)}" data-chg="titulo" aria-label="Título del libro">
      <select class="nt-input lb-estado-sel" id="lb-estado" data-chg="estado" aria-label="Estado del libro" style="--c:${_lbEstado(l.estado)[2]}">${LB_ESTADOS.map(e => `<option value="${e[0]}"${l.estado === e[0] ? ' selected' : ''}>${_lbEsc(e[1])}</option>`).join('')}</select>
    </div>
    <div class="lb-datos">
      <div class="lb-f"><label class="nt-flbl" for="lb-autor">Autor</label><input class="nt-input" id="lb-autor" type="text" maxlength="80" value="${_lbEsc(l.autor)}" data-chg="autor" placeholder="Autor"></div>
      <div class="lb-f"><label class="nt-flbl" for="lb-cat">Categoría</label><input class="nt-input" id="lb-cat" type="text" maxlength="40" list="lb-cats" value="${_lbEsc(l.cat)}" data-chg="cat" placeholder="Elegí o escribí una" autocomplete="off"></div>
      <div class="lb-f"><label class="nt-flbl" for="lb-ini">Empecé</label><input class="nt-input" id="lb-ini" type="date" value="${_lbEsc(l.ini)}" data-chg="ini"></div>
      <div class="lb-f"><label class="nt-flbl" for="lb-fin">Terminé</label><input class="nt-input" id="lb-fin" type="date" value="${_lbEsc(l.fin)}" data-chg="fin"></div>
      <div class="lb-f lb-f-pt"><span class="nt-flbl">Puntaje</span><div class="lb-pt" role="group" aria-label="Puntaje del libro">${stars}</div></div>
    </div>
    <div class="plov-tabs lb-tabs" role="tablist" aria-label="Secciones del libro">${tabs}</div>
    <div class="plov-pane lb-pane" id="lb-pane" role="tabpanel" aria-labelledby="lb-tab-${_lbV.tab}">${pane}</div>
    <div class="lb-foot"><button class="nt-btn lb-borrar" data-act="borrar-libro">Borrar este libro</button></div>`;
}

// ── Notas (Ideas prácticas · Filosofía y lecciones · Resumen) ──────────────
function _lbNotasPane(l, cat) {
  if (_lbV.nota && _lbV.nota.cat === cat) return _lbNotaForm(l, cat);
  const notas = (l.notas || []).map((n, i) => [n, i]).filter(p => p[0].cat === cat).sort((a, b) => _lbByDateDesc(a[0], b[0]) || b[1] - a[1]).map(p => p[0]);
  const cards = notas.map(x => `<div class="nt-note lb-note" data-id="${_lbEsc(x.id)}">
      <div class="nt-note-head"><div class="nt-note-ttl">${_lbEsc(x.titulo || '(sin título)')}</div>
        <div class="nt-note-acts">
          <button class="nt-ico" data-act="nota-editar" data-id="${_lbEsc(x.id)}" title="Editar" aria-label="Editar nota">${_LB_IC.edit}</button>
          <button class="nt-ico nt-del" data-act="nota-borrar" data-id="${_lbEsc(x.id)}" title="Borrar" aria-label="Borrar nota">${_LB_IC.del}</button>
        </div></div>
      <div class="nt-note-meta"><span class="nt-note-date">${_lbEsc(_lbFmt(x.fecha))}</span></div>
      ${x.texto ? `<div class="lb-note-body">${_lbRich(x.texto, true, t => _lbNotaTexto(l.id, x.id, t))}</div>` : ''}
    </div>`).join('');
  const label = (LB_TABS.find(t => t[0] === cat) || [, cat])[1];
  return `<div class="lb-panebar"><button class="nt-btn nt-add" data-act="nota-nueva"><span class="nt-add-plus">+</span> Nueva nota</button></div>
    <div class="nt-list">${cards}</div>
    ${notas.length ? '' : `<div class="nt-empty">Todavía no hay notas en «${_lbEsc(label)}». Creá la primera.</div>`}`;
}
function _lbNotaTexto(libroId, notaId, texto) {
  const l = _lbData().items.find(x => x.id === libroId); if (!l) return;
  const x = (l.notas || []).find(y => y.id === notaId); if (!x) return;
  x.texto = texto; _lbSave();
}
function _lbNotaForm(l, cat) {
  const ed = _lbV.nota.id !== 'new' ? (l.notas || []).find(x => x.id === _lbV.nota.id) : null;
  const v = ed || {};
  return `<div class="nt-form lb-form">
      <label class="nt-flbl" for="lb-n-titulo">Título</label>
      <input class="nt-input" id="lb-n-titulo" type="text" maxlength="120" value="${_lbEsc(v.titulo || '')}" placeholder="(sin título)">
      <div class="nt-flbl-row"><label class="nt-flbl" for="lb-n-texto">Texto</label><button type="button" class="nt-btn nt-preview-btn" data-act="nota-preview">Vista previa</button></div>
      <textarea class="nt-input nt-ta nt-ta-xl" id="lb-n-texto" rows="12" placeholder="${_lbEsc(LB_NOTE_HINT[cat])}">${_lbEsc(v.texto || '')}</textarea>
      <div class="rn-preview-box" id="lb-n-prev" style="display:none"></div>
      <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="nota-guardar">Guardar</button><button class="nt-btn" data-act="nota-cancelar">Cancelar</button></div>
    </div>`;
}

// ── Frases ─────────────────────────────────────────────────────────────────
function _lbFraseTxt(l, f) { return '«' + f.texto + '»' + ' — ' + [l.autor, l.titulo].filter(Boolean).join(', ') + (f.pag ? ' (p. ' + f.pag + ')' : ''); }
function _lbFrasesPane(l) {
  if (_lbV.frase) return _lbFraseForm(l);
  const frases = (l.frases || []).slice().sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));
  const rows = frases.map(f => `<div class="lb-frase-row${f.fav ? ' is-fav' : ''}" data-id="${_lbEsc(f.id)}">
      <blockquote class="lb-q">${_lbEsc(f.texto)}</blockquote>
      <div class="lb-q-foot">
        <span class="lb-q-pag">${f.pag ? 'Página ' + _lbEsc(f.pag) : ''}</span>
        <span class="nt-note-acts">
          <button class="nt-ico lb-fav${f.fav ? ' on' : ''}" data-act="frase-fav" data-id="${_lbEsc(f.id)}" title="${f.fav ? 'Quitar de favoritas' : 'Marcar como favorita'}" aria-label="${f.fav ? 'Quitar de favoritas' : 'Marcar como favorita'}" aria-pressed="${!!f.fav}">${_LB_IC.star}</button>
          <button class="nt-ico" data-act="frase-copiar" data-id="${_lbEsc(f.id)}" title="Copiar" aria-label="Copiar frase">${_LB_IC.copy}</button>
          <button class="nt-ico" data-act="frase-editar" data-id="${_lbEsc(f.id)}" title="Editar" aria-label="Editar frase">${_LB_IC.edit}</button>
          <button class="nt-ico nt-del" data-act="frase-borrar" data-id="${_lbEsc(f.id)}" title="Borrar" aria-label="Borrar frase">${_LB_IC.del}</button>
        </span>
      </div>
    </div>`).join('');
  return `<div class="lb-panebar"><button class="nt-btn nt-add" data-act="frase-nueva"><span class="nt-add-plus">+</span> Nueva frase</button></div>
    <div class="lb-frases">${rows}</div>
    ${frases.length ? '' : '<div class="nt-empty">Todavía no guardaste frases de este libro. Las favoritas pueden aparecer como frase del día en Conocimiento.</div>'}`;
}
function _lbFraseForm(l) {
  const ed = _lbV.frase.id !== 'new' ? (l.frases || []).find(x => x.id === _lbV.frase.id) : null;
  const v = ed || {};
  return `<div class="nt-form lb-form lb-formcard">
      <label class="nt-flbl" for="lb-f-texto">Frase</label>
      <textarea class="nt-input nt-ta" id="lb-f-texto" rows="4" maxlength="800" placeholder="Copiá la frase tal cual está en el libro">${_lbEsc(v.texto || '')}</textarea>
      <label class="nt-flbl" for="lb-f-pag">Página (opcional)</label>
      <input class="nt-input lb-pag" id="lb-f-pag" type="text" maxlength="12" value="${_lbEsc(v.pag || '')}" placeholder="Ej: 42" data-enter="frase-guardar">
      <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="frase-guardar">Guardar</button><button class="nt-btn" data-act="frase-cancelar">Cancelar</button></div>
    </div>`;
}

// ── Para aplicar ───────────────────────────────────────────────────────────
// Los vínculos guardan 'seccion|id'. Si lo vinculado ya no existe, el ítem vuelve a ofrecer los botones.
function _lbHabitoDe(a) {
  if (!a.hab) return null;
  const [sec, id] = a.hab.split('|');
  const h = (typeof _getHabits === 'function' ? _getHabits(sec) : ((S.habitTrackers || {})[sec] || [])).find(x => x.id === id);
  return h ? { sec, h } : null;
}
function _lbTareaDe(a) {
  if (!a.tar || !window.Proyectos) return null;
  const [sec, id] = a.tar.split('|');
  const nd = window.Proyectos.findById(sec, id);
  return nd ? { sec, nd } : null;
}
function _lbAplicarPane(l) {
  const items = (l.aplicar || []).slice().sort((a, b) => (a.ok ? 1 : 0) - (b.ok ? 1 : 0));
  const pend = items.filter(a => !a.ok).length;
  const rows = items.map(a => {
    if (_lbV.aplEd === a.id) return `<div class="lb-apl is-edit" data-id="${_lbEsc(a.id)}"><div class="lb-addrow"><input class="nt-input" id="lb-a-ed" type="text" maxlength="200" value="${_lbEsc(a.texto)}" aria-label="Texto" data-enter="apl-guardar" data-id="${_lbEsc(a.id)}"><button class="nt-btn nt-add" data-act="apl-guardar" data-id="${_lbEsc(a.id)}">Guardar</button><button class="nt-btn" data-act="apl-cancelar">Cancelar</button></div></div>`;
    const hab = _lbHabitoDe(a), tar = _lbTareaDe(a);
    const chips = [
      hab ? `<span class="lb-link" data-link="habito">Hábito: ${_lbEsc(hab.h.name)} · ${_lbEsc(_lbSecLabel(hab.sec))}</span>` : '',
      tar ? `<span class="lb-link" data-link="tarea">Tarea${tar.nd.done ? ' hecha' : ''}: ${_lbEsc(tar.nd.label || '')} · ${_lbEsc(_lbSecLabel(tar.sec))}</span>` : '',
    ].join('');
    const conv = _lbV.conv && _lbV.conv.id === a.id ? _lbConvForm(a) : '';
    return `<div class="lb-apl${a.ok ? ' done' : ''}" data-id="${_lbEsc(a.id)}">
      <div class="lb-apl-main">
        <div class="lb-apl-txt">${_lbEsc(a.texto)}</div>
        <button class="lb-check" data-act="apl-ok" data-id="${_lbEsc(a.id)}" role="checkbox" aria-checked="${!!a.ok}" aria-label="Marcar como aplicado: ${_lbEsc(a.texto)}">${a.ok ? _LB_IC.tick : ''}</button>
      </div>
      ${chips ? `<div class="lb-links">${chips}</div>` : ''}
      <div class="lb-apl-acts">
        ${hab ? '' : `<button class="nt-btn lb-mini" data-act="conv" data-k="habito" data-id="${_lbEsc(a.id)}">→ Hábito</button>`}
        ${tar ? '' : `<button class="nt-btn lb-mini" data-act="conv" data-k="tarea" data-id="${_lbEsc(a.id)}">→ Tarea</button>`}
        <button class="nt-ico" data-act="apl-editar" data-id="${_lbEsc(a.id)}" title="Editar" aria-label="Editar">${_LB_IC.edit}</button>
        <button class="nt-ico nt-del" data-act="apl-borrar" data-id="${_lbEsc(a.id)}" title="Borrar" aria-label="Borrar">${_LB_IC.del}</button>
      </div>
      ${conv}
    </div>`;
  }).join('');
  return `<p class="lb-lead">Lo que vas a poner en práctica de este libro. Pasalo a un hábito o a una tarea para que no quede solo en el libro.</p>
    <div class="lb-addrow"><input class="nt-input" id="lb-a-nuevo" type="text" maxlength="200" placeholder="Algo que vas a aplicar…" aria-label="Nuevo ítem para aplicar" data-enter="apl-nuevo"><button class="nt-btn nt-add" data-act="apl-nuevo">Agregar</button></div>
    <div class="lb-contador">${items.length ? `${pend} por aplicar · ${items.length - pend} aplicado${items.length - pend === 1 ? '' : 's'}` : ''}</div>
    <div class="lb-aplicar" id="lb-aplicar">${rows || '<div class="nt-empty">Todavía no hay nada para aplicar.</div>'}</div>`;
}
function _lbConvForm(a) {
  const k = _lbV.conv.k;
  return `<div class="lb-conv" id="lb-conv">
      <label class="nt-flbl" for="lb-c-nombre">${k === 'habito' ? 'Nombre del hábito' : 'Texto de la tarea'}</label>
      <input class="nt-input" id="lb-c-nombre" type="text" maxlength="${k === 'habito' ? 60 : 200}" value="${_lbEsc(k === 'habito' ? a.texto.slice(0, 60) : a.texto)}" data-enter="conv-crear">
      <label class="nt-flbl" for="lb-c-sec">${k === 'habito' ? 'Sección de hábitos' : 'Sección de Proyectos (carpeta «Libros»)'}</label>
      <select class="nt-input" id="lb-c-sec">${LB_SECCIONES.map(s => `<option value="${s[0]}">${_lbEsc(s[1])}</option>`).join('')}</select>
      <div class="nt-form-acts"><button class="nt-btn nt-add" data-act="conv-crear">${k === 'habito' ? 'Crear hábito' : 'Crear tarea'}</button><button class="nt-btn" data-act="conv-cancelar">Cancelar</button></div>
    </div>`;
}
const _lbIsFolder = nd => (typeof _poIsFolder === 'function') ? _poIsFolder(nd) : (nd.tipo ? nd.tipo === 'carpeta' : !!(nd.children && nd.children.length));

// ── Eventos (delegados en el cuerpo del overlay) ───────────────────────────
function _lbBind(body) {
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && body.contains(b)) _lbAct(b.dataset.act, b);
  });
  body.addEventListener('change', e => {
    const t = e.target.closest('[data-chg]');
    if (t && body.contains(t)) _lbChg(t.dataset.chg, t);
  });
  body.addEventListener('input', e => {
    const t = e.target;
    if (!(t.matches && t.matches('[data-inp="buscar"]'))) return;
    _lbV.q = t.value;
    const lista = document.getElementById('lb-lista'), fil = document.getElementById('lb-filtros');
    if (lista) lista.innerHTML = _lbResultados();
    if (fil) fil.hidden = !!_lbV.q.trim();
  });
  body.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t.matches && t.matches('input[data-enter]')) { e.preventDefault(); _lbAct(t.dataset.enter, t); }
    else if (t.matches && t.matches('.lb-name')) { e.preventDefault(); t.blur(); }
  });
}

function _lbChg(what, el) {
  if (what === 'f-cat') { _lbV.fCat = el.value; _lbRefrescarLista(); return; }
  if (what === 'orden') { _lbV.orden = el.value; _lbRefrescarLista(); return; }
  const l = _lbCur(); if (!l) return;
  if (what === 'titulo') {
    const v = el.value.trim();
    if (!v) { el.value = l.titulo || ''; _lbToast('El libro necesita un título'); return; }
    l.titulo = v;
  } else if (what === 'autor') l.autor = el.value.trim();
  else if (what === 'cat') l.cat = el.value.trim();
  else if (what === 'ini' || what === 'fin') l[what] = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : '';
  else if (what === 'estado') {
    if (!LB_ESTADOS.some(e => e[0] === el.value)) return;
    l.estado = el.value; el.style.setProperty('--c', _lbEstado(l.estado)[2]);
    // Al pasar a "Leyendo" / "Leído" se completa la fecha si estaba vacía (se puede cambiar a mano).
    const hoy = _lbToday();
    if (l.estado !== 'por_leer' && !l.ini) { l.ini = hoy; const i = document.getElementById('lb-ini'); if (i) i.value = hoy; }
    if (l.estado === 'leido' && !l.fin) { l.fin = hoy; const f = document.getElementById('lb-fin'); if (f) f.value = hoy; }
  } else return;
  _lbSave();
}
function _lbRefrescarLista() {
  const lista = document.getElementById('lb-lista'); if (lista) lista.innerHTML = _lbResultados();
}

function _lbAct(a, el) {
  const d = _lbData(), l = _lbCur();
  switch (a) {
    // Lista
    case 'nuevo': _lbV.nuevo = !_lbV.nuevo; _lbRender(); if (_lbV.nuevo) _lbFocus('lb-nuevo-titulo'); break;
    case 'crear': {
      const titulo = _lbVal('lb-nuevo-titulo');
      if (!titulo) { _lbToast('Poné el título del libro'); _lbFocus('lb-nuevo-titulo'); return; }
      const est = _lbVal('lb-nuevo-estado'), hoy = _lbToday();
      const estado = LB_ESTADOS.some(e => e[0] === est) ? est : 'por_leer';
      const nuevo = { id: _lbUid(), titulo, autor: _lbVal('lb-nuevo-autor'), estado, ini: estado === 'por_leer' ? '' : hoy, fin: estado === 'leido' ? hoy : '', pt: 0, cat: _lbVal('lb-nuevo-cat'), creado: Date.now(), notas: [], frases: [], aplicar: [] };
      d.items.push(nuevo);
      _lbSave();
      _lbV = Object.assign(_lbViewNew(), { screen: 'libro', id: nuevo.id, tab: 'ideas' }); _lbRender(); break;
    }
    case 'f-estado': _lbV.fEstado = el.dataset.v || ''; _lbRender(); break;
    case 'abrir': {
      const q = _lbV.q;
      _lbV = Object.assign(_lbViewNew(), { screen: 'libro', id: el.dataset.id, tab: LB_TABS.some(t => t[0] === el.dataset.t) ? el.dataset.t : 'ideas', q });
      _lbRender(); break;
    }
    // Libro
    case 'volver': { const keep = { q: _lbV.q, fEstado: _lbV.fEstado, fCat: _lbV.fCat, orden: _lbV.orden }; _lbV = Object.assign(_lbViewNew(), keep); _lbRender(); break; }
    case 'tab': _lbV.tab = el.dataset.t; _lbV.nota = null; _lbV.frase = null; _lbV.aplEd = null; _lbV.conv = null; _lbRender(); break;
    case 'pt': {
      if (!l) return;
      const v = Number(el.dataset.v) || 0;
      l.pt = l.pt === v ? 0 : v; _lbSave(); _lbRender(); break;
    }
    case 'borrar-libro':
      if (!l || !confirm('¿Borrar el libro «' + (l.titulo || '') + '» con todas sus notas, frases y pendientes? Los hábitos y tareas que ya creaste no se borran.')) return;
      d.items = d.items.filter(x => x.id !== l.id); _lbSave(); _lbV = Object.assign(_lbViewNew(), { q: _lbV.q }); _lbRender(); break;
    // Notas
    case 'nota-nueva': _lbV.nota = { cat: _lbV.tab, id: 'new' }; _lbRender(); _lbFocus('lb-n-titulo'); break;
    case 'nota-editar': _lbV.nota = { cat: _lbV.tab, id: el.dataset.id }; _lbRender(); _lbFocus('lb-n-titulo'); break;
    case 'nota-cancelar': _lbV.nota = null; _lbRender(); break;
    case 'nota-preview': {
      const box = document.getElementById('lb-n-prev'), ta = document.getElementById('lb-n-texto'); if (!box || !ta) return;
      const show = box.style.display === 'none';
      if (show) box.innerHTML = _lbRich(ta.value, false);
      box.style.display = show ? '' : 'none'; break;
    }
    case 'nota-guardar': {
      if (!l || !_lbV.nota) return;
      const titulo = _lbVal('lb-n-titulo'), ta = document.getElementById('lb-n-texto'), texto = ta ? ta.value.trim() : '';
      if (!titulo && !texto) { _lbToast('Escribí un título o un texto'); _lbFocus('lb-n-titulo'); return; }
      if (!l.notas) l.notas = [];
      const ed = _lbV.nota.id !== 'new' ? l.notas.find(x => x.id === _lbV.nota.id) : null;
      if (ed) { ed.titulo = titulo; ed.texto = texto; }
      else l.notas.push({ id: _lbUid(), cat: _lbV.nota.cat, titulo, texto, fecha: _lbToday() });
      _lbSave(); _lbV.nota = null; _lbRender(); break;
    }
    case 'nota-borrar':
      if (!l || !confirm('¿Seguro que querés borrar esta nota?')) return;
      l.notas = (l.notas || []).filter(x => x.id !== el.dataset.id); _lbSave(); _lbRender(); break;
    // Frases
    case 'frase-nueva': _lbV.frase = { id: 'new' }; _lbRender(); _lbFocus('lb-f-texto'); break;
    case 'frase-editar': _lbV.frase = { id: el.dataset.id }; _lbRender(); _lbFocus('lb-f-texto'); break;
    case 'frase-cancelar': _lbV.frase = null; _lbRender(); break;
    case 'frase-guardar': {
      if (!l || !_lbV.frase) return;
      const ta = document.getElementById('lb-f-texto'), texto = ta ? ta.value.trim() : '', pag = _lbVal('lb-f-pag');
      if (!texto) { _lbToast('Escribí la frase'); _lbFocus('lb-f-texto'); return; }
      if (!l.frases) l.frases = [];
      const ed = _lbV.frase.id !== 'new' ? l.frases.find(x => x.id === _lbV.frase.id) : null;
      if (ed) { ed.texto = texto; if (pag) ed.pag = pag; else delete ed.pag; }
      else { const f = { id: _lbUid(), texto }; if (pag) f.pag = pag; l.frases.push(f); }
      _lbSave(); _lbV.frase = null; _lbRender(); break;
    }
    case 'frase-fav': {
      const f = l && (l.frases || []).find(x => x.id === el.dataset.id); if (!f) return;
      if (f.fav) delete f.fav; else f.fav = 1;
      _lbSave(); _lbRender(); break;
    }
    case 'frase-copiar': {
      const f = l && (l.frases || []).find(x => x.id === el.dataset.id); if (!f) return;
      const txt = _lbFraseTxt(l, f);
      const ok = () => _lbToast('Frase copiada'), mal = () => _lbToast('No se pudo copiar');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, mal); else mal();
      break;
    }
    case 'frase-borrar':
      if (!l || !confirm('¿Seguro que querés borrar esta frase?')) return;
      l.frases = (l.frases || []).filter(x => x.id !== el.dataset.id); _lbSave(); _lbRender(); break;
    // Para aplicar
    case 'apl-nuevo': {
      const txt = _lbVal('lb-a-nuevo'); if (!l) return;
      if (!txt) { _lbFocus('lb-a-nuevo'); return; }
      (l.aplicar || (l.aplicar = [])).push({ id: _lbUid(), texto: txt });
      _lbSave(); _lbRender(); _lbFocus('lb-a-nuevo'); break;
    }
    case 'apl-ok': {
      const it = l && (l.aplicar || []).find(x => x.id === el.dataset.id); if (!it) return;
      if (it.ok) delete it.ok; else it.ok = 1;
      _lbSave(); _lbRender(); break;
    }
    case 'apl-editar': _lbV.aplEd = el.dataset.id; _lbV.conv = null; _lbRender(); _lbFocus('lb-a-ed'); break;
    case 'apl-cancelar': _lbV.aplEd = null; _lbRender(); break;
    case 'apl-guardar': {
      const it = l && (l.aplicar || []).find(x => x.id === el.dataset.id), txt = _lbVal('lb-a-ed'); if (!it) return;
      if (!txt) { _lbToast('El texto no puede quedar vacío'); _lbFocus('lb-a-ed'); return; }
      it.texto = txt; _lbSave(); _lbV.aplEd = null; _lbRender(); break;
    }
    case 'apl-borrar':
      if (!l || !confirm('¿Seguro que querés borrar este ítem? Si ya creaste un hábito o una tarea, esos no se borran.')) return;
      l.aplicar = (l.aplicar || []).filter(x => x.id !== el.dataset.id); _lbSave(); _lbRender(); break;
    case 'conv': _lbV.conv = { id: el.dataset.id, k: el.dataset.k }; _lbV.aplEd = null; _lbRender(); _lbFocus('lb-c-nombre'); break;
    case 'conv-cancelar': _lbV.conv = null; _lbRender(); break;
    case 'conv-crear': {
      if (!l || !_lbV.conv) return;
      const it = (l.aplicar || []).find(x => x.id === _lbV.conv.id); if (!it) return;
      const nombre = _lbVal('lb-c-nombre'), sec = _lbVal('lb-c-sec');
      if (!nombre) { _lbToast('Escribí un nombre'); _lbFocus('lb-c-nombre'); return; }
      if (!LB_SECCIONES.some(s => s[0] === sec)) return;
      if (_lbV.conv.k === 'habito') {
        if (typeof addHabitTo !== 'function') { _lbToast('Hábitos no está disponible'); return; }
        const h = addHabitTo(sec, nombre, '📚'); if (!h) { _lbToast('No se pudo crear el hábito'); return; }
        it.hab = sec + '|' + h.id;
        _lbToast('Hábito creado en ' + _lbSecLabel(sec));
      } else {
        if (!window.Proyectos) { _lbToast('Proyectos no está disponible'); return; }
        const tree = window.Proyectos.get(sec);
        let carpeta = tree.find(nd => nd && nd.label === 'Libros' && _lbIsFolder(nd));
        if (!carpeta) { carpeta = window.Proyectos.newNode('Libros', true); carpeta.icon = '📚'; tree.push(carpeta); }
        const t = window.Proyectos.newNode(nombre, false);
        t.description = 'Del libro «' + (l.titulo || '') + '»';
        (carpeta.children || (carpeta.children = [])).push(t);
        window.Proyectos.save(sec);
        it.tar = sec + '|' + t.id;
        _lbToast('Tarea creada en Proyectos · ' + _lbSecLabel(sec));
      }
      _lbV.conv = null; _lbSave(); _lbRender(); break;
    }
  }
}

// ── Frase del día (pantalla Conocimiento) ──────────────────────────────────
// Determinística por fecha: gana la frase con el hash más bajo de (fecha + id), así no depende del orden de la lista
// y agregar una frase nueva casi nunca cambia la del día. Si hay favoritas, solo participan ellas.
function _lbHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function _lbFraseDelDia(fecha) {
  const todas = [];
  _lbData().items.forEach(l => (l.frases || []).forEach(f => { if (f && f.texto) todas.push({ l, f }); }));
  if (!todas.length) return null;
  const favs = todas.filter(x => x.f.fav), pool = favs.length ? favs : todas;
  let mejor = null, mh = Infinity;
  pool.forEach(x => { const h = _lbHash(fecha + '|' + x.f.id); if (h < mh) { mh = h; mejor = x; } });
  return mejor;
}
function _lbRenderFraseDia() {
  const wrap = document.getElementById('libros-frase-wrap'); if (!wrap) return;
  const x = _lbFraseDelDia(_lbToday());
  const html = !x ? '' : `<div class="card lb-dia">
      <div class="lb-dia-lbl">Frase del día</div>
      <blockquote class="lb-dia-q">${_lbEsc(x.f.texto)}</blockquote>
      <div class="lb-dia-foot">
        <span class="lb-dia-src">— ${_lbEsc([x.l.autor, x.l.titulo].filter(Boolean).join(', '))}${x.f.pag ? ` (p. ${_lbEsc(x.f.pag)})` : ''}</span>
        <button class="btn btn-ghost btn-sm" data-lb-abrir="${_lbEsc(x.l.id)}">Abrir libro</button>
      </div>
    </div>`;
  if (wrap._lbHtml === html) return;   // sin cambios: no se rehace el nodo (no corta animaciones en curso)
  wrap._lbHtml = html; wrap.innerHTML = html;
}
(function _lbInitFraseDia() {
  const arrancar = () => {
    const wrap = document.getElementById('libros-frase-wrap');
    if (!wrap) return;
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-lb-abrir]');
      if (b) librosOpen({ id: b.dataset.lbAbrir, tab: 'frases' });
    });
    const tab = document.getElementById('tab-conocimiento');
    if (tab) new MutationObserver(() => { if (tab.classList.contains('active')) _lbRenderFraseDia(); }).observe(tab, { attributes: true, attributeFilter: ['class'] });
    // El estado llega después del arranque (login + carga): se intenta hasta que la app esté lista.
    let n = 0;
    const t = setInterval(() => {
      n++;
      if ((typeof _appBooted !== 'undefined' && _appBooted) || n > 120) { clearInterval(t); _lbRenderFraseDia(); }
    }, 500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})();
