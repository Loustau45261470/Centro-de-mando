'use strict';
// ════════════════════════════════════════════════════════════════════════
// NOTAS — apartado de la pestaña Conocimiento (Intelecto).
// Panel flotante a pantalla completa. 3 categorías: Reflexiones, Aprendizaje,
// Anotaciones personales. CRUD + búsqueda + orden por fecha. Sync vía S.notas.
// ════════════════════════════════════════════════════════════════════════

const _ntEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const NOTAS_CATS = {
  reflexiones: { label: 'Reflexiones',           icon: '🪞', accent: '#6B8EFF' },
  aprendizaje: { label: 'Aprendizaje',           icon: '🎯', accent: '#38BDF8' },
  personales:  { label: 'Anotaciones personales', icon: '✍️', accent: '#818CF8' },
};
const NOTAS_CAT_KEYS = ['reflexiones', 'aprendizaje', 'personales'];

// ── Estado UI (no sincronizado) ──────────────────────────────────────────
let _ntView = null;        // null = home (3 rectángulos) | clave de categoría
let _ntSearch = '';
let _ntSort = 'desc';      // 'desc' = más reciente primero | 'asc'
let _ntEditing = null;     // id de nota en edición, 'new', o null

// ── Datos (persistidos en S.notas, sync Firestore) ───────────────────────
function _ntAll() { return (typeof S !== 'undefined' && Array.isArray(S.notas)) ? S.notas : []; }
function _ntPersist(arr) {
  if (typeof S === 'undefined') return;
  S.notas = arr;
  if (typeof saveState === 'function') saveState();
}
function _ntByCat(cat) { return _ntAll().filter(n => n.categoria === cat); }
function _ntFmtDate(iso) { return (typeof fmtDate === 'function') ? fmtDate(iso) : (iso || ''); }
function _ntToday() { return (typeof localStr === 'function') ? localStr(new Date()) : new Date().toISOString().slice(0, 10); }

// Texto buscable / preview de una nota según su categoría
function _ntText(n) {
  if (n.categoria === 'aprendizaje') {
    return [n.suceso, n.hiceBien, n.hiceMal, n.aprendi, n.mejorarProxima].filter(Boolean).join(' · ');
  }
  return n.texto || '';
}

// ════════════════════════════════════════════════════════════════════════
// APERTURA / CIERRE
// ════════════════════════════════════════════════════════════════════════
function notasOpen() {
  const ov = document.getElementById('notas-overlay');
  if (!ov) return;
  _ntView = null; _ntSearch = ''; _ntSort = 'desc'; _ntEditing = null;
  notasRender();
  ov.classList.add('show');
}
function notasClose() {
  const ov = document.getElementById('notas-overlay');
  if (ov) ov.classList.remove('show');
  _ntEditing = null;
}
function notasHome() { _ntView = null; _ntSearch = ''; _ntEditing = null; notasRender(); }

// ════════════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════════════
function notasRender() {
  const body = document.getElementById('notas-body');
  if (!body) return;
  if (_ntEditing) { body.innerHTML = _ntRenderForm(); _ntFocusForm(); return; }
  body.innerHTML = _ntView ? _ntRenderCat(_ntView) : _ntRenderHome();
}

// ── Home: 3 rectángulos con preview reducida ─────────────────────────────
function _ntRenderHome() {
  const cards = NOTAS_CAT_KEYS.map(cat => {
    const meta = NOTAS_CATS[cat];
    const notes = _ntByCat(cat).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const preview = notes.slice(0, 3).map(n => {
      const t = _ntText(n);
      return `<div class="nt-prev-item">
        <span class="nt-prev-title">${_ntEsc(n.titulo || '(sin título)')}</span>
        ${t ? `<span class="nt-prev-snip">${_ntEsc(t.slice(0, 80))}</span>` : ''}
      </div>`;
    }).join('');
    return `<button class="nt-rect" style="--nt-accent:${meta.accent}" onclick="notasOpenCat('${cat}')">
      <div class="nt-rect-head">
        <span class="nt-rect-icon">${meta.icon}</span>
        <span class="nt-rect-label">${meta.label}</span>
        <span class="nt-rect-count">${notes.length}</span>
      </div>
      <div class="nt-rect-prev">${preview}</div>
    </button>`;
  }).join('');
  return `<div class="nt-home-title">Notas</div><div class="nt-rects">${cards}</div>`;
}

// ── Vista de categoría: lista + búsqueda + orden + alta ───────────────────
function _ntRenderCat(cat) {
  const meta = NOTAS_CATS[cat];
  const q = _ntSearch.trim().toLowerCase();
  let notes = _ntByCat(cat);
  if (q) notes = notes.filter(n => (`${n.titulo || ''} ${_ntText(n)}`).toLowerCase().includes(q));
  notes.sort((a, b) => {
    const cmp = (a.fecha || '').localeCompare(b.fecha || '');
    return _ntSort === 'asc' ? cmp : -cmp;
  });

  const list = notes.map(n => _ntRenderNoteCard(n)).join('');
  return `<div class="nt-cat" style="--nt-accent:${meta.accent}">
    <div class="nt-cat-bar">
      <div class="nt-cat-ttl"><span>${meta.icon}</span> ${meta.label}</div>
      <button class="nt-x" title="Volver" onclick="notasHome()">✕</button>
    </div>
    <div class="nt-tools">
      <input class="nt-input nt-search" type="text" placeholder="Buscar…" value="${_ntEsc(_ntSearch)}"
        oninput="_ntOnSearch(this.value)">
      <button class="nt-btn nt-sort" onclick="_ntToggleSort()">${_ntSort === 'desc' ? '↓ Reciente' : '↑ Antigua'}</button>
      <button class="nt-btn nt-add" onclick="notasNew('${cat}')">+ Nueva</button>
    </div>
    <div class="nt-list">${list}</div>
  </div>`;
}

function _ntRenderNoteCard(n) {
  const fields = n.categoria === 'aprendizaje'
    ? `${_ntFieldRow('Suceso', n.suceso)}
       ${_ntFieldRow('Hice bien', n.hiceBien)}
       ${_ntFieldRow('Hice mal', n.hiceMal)}
       ${_ntFieldRow('Aprendí', n.aprendi)}
       ${_ntFieldRow('Mejoraría', n.mejorarProxima)}`
    : (n.texto ? `<div class="nt-note-text">${_ntEsc(n.texto)}</div>` : '');
  return `<div class="nt-note">
    <div class="nt-note-head">
      <div class="nt-note-ttl">${_ntEsc(n.titulo || '(sin título)')}</div>
      <div class="nt-note-acts">
        <button class="nt-ico" title="Editar" onclick="notasEdit('${n.id}')">✎</button>
        <button class="nt-ico nt-del" title="Borrar" onclick="notasDelete('${n.id}')">🗑</button>
      </div>
    </div>
    <div class="nt-note-date">${_ntEsc(_ntFmtDate(n.fecha))}</div>
    ${fields}
  </div>`;
}
function _ntFieldRow(label, val) {
  if (!val) return '';
  return `<div class="nt-field"><span class="nt-field-lbl">${label}</span><span class="nt-field-val">${_ntEsc(val)}</span></div>`;
}

// ── Formulario alta/edición ──────────────────────────────────────────────
function _ntRenderForm() {
  const editing = _ntEditing !== 'new' ? _ntAll().find(n => n.id === _ntEditing) : null;
  const cat = editing ? editing.categoria : _ntFormCat;
  const meta = NOTAS_CATS[cat];
  const v = editing || {};
  const ta = (id, label, val) => `<label class="nt-flbl">${label}</label>
    <textarea class="nt-input nt-ta" id="${id}" rows="3">${_ntEsc(val || '')}</textarea>`;
  const body = cat === 'aprendizaje'
    ? `${ta('nt-f-suceso', 'Suceso / hecho', v.suceso)}
       ${ta('nt-f-bien', 'Qué hice bien', v.hiceBien)}
       ${ta('nt-f-mal', 'Qué hice mal', v.hiceMal)}
       ${ta('nt-f-aprendi', 'Qué aprendí', v.aprendi)}
       ${ta('nt-f-mejor', 'Cómo lo haría mejor la próxima vez', v.mejorarProxima)}`
    : ta('nt-f-texto', 'Texto', v.texto);
  return `<div class="nt-cat" style="--nt-accent:${meta.accent}">
    <div class="nt-cat-bar">
      <div class="nt-cat-ttl"><span>${meta.icon}</span> ${editing ? 'Editar' : 'Nueva'} · ${meta.label}</div>
      <button class="nt-x" title="Cancelar" onclick="_ntCancelForm()">✕</button>
    </div>
    <div class="nt-form">
      <label class="nt-flbl">Título</label>
      <input class="nt-input" id="nt-f-titulo" type="text" value="${_ntEsc(v.titulo || '')}" placeholder="(sin título)">
      <label class="nt-flbl">Fecha</label>
      <input class="nt-input" id="nt-f-fecha" type="date" value="${_ntEsc(v.fecha || _ntToday())}">
      ${body}
      <div class="nt-form-acts">
        <button class="nt-btn nt-add" onclick="_ntSaveForm()">Guardar</button>
        <button class="nt-btn" onclick="_ntCancelForm()">Cancelar</button>
      </div>
    </div>
  </div>`;
}
function _ntFocusForm() { const el = document.getElementById('nt-f-titulo'); if (el) el.focus(); }

// ════════════════════════════════════════════════════════════════════════
// ACCIONES
// ════════════════════════════════════════════════════════════════════════
let _ntFormCat = 'reflexiones';

function notasOpenCat(cat) { _ntView = cat; _ntSearch = ''; _ntEditing = null; notasRender(); }
function notasNew(cat) { _ntFormCat = cat; _ntEditing = 'new'; notasRender(); }
function notasEdit(id) { _ntEditing = id; notasRender(); }
function _ntCancelForm() { _ntEditing = null; notasRender(); }
function _ntOnSearch(val) { _ntSearch = val; const l = document.querySelector('.nt-list'); if (l) l.innerHTML = _ntCatListHTML(_ntView); }
function _ntToggleSort() { _ntSort = _ntSort === 'desc' ? 'asc' : 'desc'; notasRender(); }

// Reusa el filtrado de _ntRenderCat para refrescar sólo la lista al buscar
function _ntCatListHTML(cat) {
  const q = _ntSearch.trim().toLowerCase();
  let notes = _ntByCat(cat);
  if (q) notes = notes.filter(n => (`${n.titulo || ''} ${_ntText(n)}`).toLowerCase().includes(q));
  notes.sort((a, b) => { const cmp = (a.fecha || '').localeCompare(b.fecha || ''); return _ntSort === 'asc' ? cmp : -cmp; });
  return notes.map(n => _ntRenderNoteCard(n)).join('');
}

function _ntVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

function _ntSaveForm() {
  const editing = _ntEditing !== 'new' ? _ntAll().find(n => n.id === _ntEditing) : null;
  const cat = editing ? editing.categoria : _ntFormCat;
  const base = {
    titulo: _ntVal('nt-f-titulo'),
    fecha: _ntVal('nt-f-fecha') || _ntToday(),
  };
  const extra = cat === 'aprendizaje'
    ? { suceso: _ntVal('nt-f-suceso'), hiceBien: _ntVal('nt-f-bien'), hiceMal: _ntVal('nt-f-mal'), aprendi: _ntVal('nt-f-aprendi'), mejorarProxima: _ntVal('nt-f-mejor') }
    : { texto: _ntVal('nt-f-texto') };

  const all = _ntAll().slice();
  if (editing) {
    const i = all.findIndex(n => n.id === editing.id);
    if (i >= 0) all[i] = { ...all[i], ...base, ...extra };
  } else {
    all.push({ id: (typeof uid === 'function' ? uid() : Date.now().toString(36)), categoria: cat, ...base, ...extra });
  }
  _ntPersist(all);
  _ntView = cat; _ntEditing = null;
  notasRender();
}

function notasDelete(id) {
  if (!confirm('¿Seguro que querés borrar esta nota?')) return;
  _ntPersist(_ntAll().filter(n => n.id !== id));
  notasRender();
}

// ════════════════════════════════════════════════════════════════════════
// MONTAJE: FAB en pestaña Conocimiento + overlay + Escape
// ════════════════════════════════════════════════════════════════════════
function _ntMount() {
  if (document.getElementById('notas-overlay')) return;

  // FAB
  const fab = document.createElement('button');
  fab.id = 'notas-fab';
  fab.title = 'Notas';
  fab.setAttribute('aria-label', 'Abrir notas');
  fab.textContent = '📔';
  fab.onclick = notasOpen;
  document.body.appendChild(fab);

  // Overlay
  const ov = document.createElement('div');
  ov.id = 'notas-overlay';
  ov.innerHTML = `<div id="notas-panel">
    <button id="notas-close" title="Cerrar (Esc)" aria-label="Cerrar" onclick="notasClose()">✕</button>
    <div id="notas-body"></div>
  </div>`;
  document.body.appendChild(ov);

  // Visibilidad del FAB según pestaña activa (Conocimiento = Intelecto)
  const tab = document.getElementById('tab-conocimiento');
  const sync = () => { fab.classList.toggle('on', !!(tab && tab.classList.contains('active'))); };
  if (tab) { new MutationObserver(sync).observe(tab, { attributes: true, attributeFilter: ['class'] }); }
  sync();

  // Escape cierra todo el panel
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ov.classList.contains('show')) { e.stopPropagation(); notasClose(); }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _ntMount);
else _ntMount();
