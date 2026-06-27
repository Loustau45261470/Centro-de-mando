'use strict';
// ════════════════════════════════════════════════════════════════════════
// NOTAS — apartado de la pestaña Conocimiento (Intelecto).
// Panel flotante a pantalla completa. 3 categorías: Reflexiones, Aprendizaje,
// Anotaciones personales. CRUD + búsqueda + orden por fecha. Sync vía S.notas.
// ════════════════════════════════════════════════════════════════════════

const _ntEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── Íconos HUD line-art (stroke = currentColor), estilo JARVIS ────────────
const NOTAS_ICONS = {
  // Reflexiones — ondas concéntricas reflejadas (reflexión / meditación)
  reflexiones: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="1.7"/><path d="M7 9.4a7 7 0 0 1 10 0"/><path d="M4.4 6.9a11 11 0 0 1 15.2 0"/><path d="M7 14.6a7 7 0 0 0 10 0"/><path d="M4.4 17.1a11 11 0 0 0 15.2 0"/></svg>`,
  // Aprendizaje — retícula / target (precisión, foco)
  aprendizaje: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none"/><path d="M12 1.2v3M12 19.8v3M1.2 12h3M19.8 12h3"/></svg>`,
  // Anotaciones personales — pluma / escritura
  personales: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18.5l2.6-.7L18.2 7.2a1.9 1.9 0 0 0 0-2.7l-.2-.2a1.9 1.9 0 0 0-2.7 0L4.7 15.1 4 17.7l1 .8z"/><path d="M13.7 6l3.3 3.3"/></svg>`,
};
const NOTAS_FAB_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="3.5" width="13" height="17.2" rx="2.4"/><path d="M8 3.5v17.2"/><path d="M11 8.2h4M11 12h4"/><path d="M17.5 9.5l3 1.6-3 1.6z" fill="currentColor" stroke="none"/></svg>`;

const NOTAS_CATS = {
  reflexiones: { label: 'Reflexiones',            svg: NOTAS_ICONS.reflexiones, accent: '#6B8EFF', tag: 'REFLEXIÓN' },
  aprendizaje: { label: 'Aprendizaje',            svg: NOTAS_ICONS.aprendizaje, accent: '#38BDF8', tag: 'APRENDIZAJE' },
  personales:  { label: 'Anotaciones personales', svg: NOTAS_ICONS.personales,  accent: '#818CF8', tag: 'PERSONAL' },
};
const NOTAS_CAT_KEYS = ['reflexiones', 'aprendizaje', 'personales'];

// ── Estado UI (no sincronizado) ──────────────────────────────────────────
let _ntView = null;        // null = home (3 rectángulos) | clave de categoría
let _ntSearch = '';
let _ntSort = 'desc';      // 'desc' = más reciente primero | 'asc'
let _ntEditing = null;     // id de nota en edición, 'new', o null
let _ntTagFilter = null;   // null = todas | etiqueta seleccionada dentro de la categoría

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

// Etiquetas (sub-tags) distintas presentes en una categoría
function _ntTagsOf(cat) {
  return [...new Set(_ntByCat(cat).map(n => (n.tag || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
// Filtrado central: etiqueta + búsqueda + orden por fecha
function _ntFilteredNotes(cat) {
  const q = _ntSearch.trim().toLowerCase();
  let notes = _ntByCat(cat);
  if (_ntTagFilter) notes = notes.filter(n => (n.tag || '').trim() === _ntTagFilter);
  if (q) notes = notes.filter(n => (`${n.titulo || ''} ${n.tag || ''} ${_ntText(n)}`).toLowerCase().includes(q));
  return notes.sort((a, b) => {
    const cmp = (a.fecha || '').localeCompare(b.fecha || '');
    return _ntSort === 'asc' ? cmp : -cmp;
  });
}

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

// ── Home: 3 rectángulos holográficos con preview reducida ────────────────
function _ntRenderHome() {
  const cards = NOTAS_CAT_KEYS.map((cat, i) => {
    const meta = NOTAS_CATS[cat];
    const notes = _ntByCat(cat).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const preview = notes.slice(0, 3).map(n => {
      const t = _ntText(n);
      return `<div class="nt-prev-item">
        <span class="nt-prev-dot"></span>
        <span class="nt-prev-title">${_ntEsc(n.titulo || '(sin título)')}</span>
        ${t ? `<span class="nt-prev-snip">${_ntEsc(t.slice(0, 80))}</span>` : ''}
      </div>`;
    }).join('');
    return `<button class="nt-rect" style="--nt-accent:${meta.accent};--d:${i * 90}ms" onclick="notasOpenCat('${cat}')">
      <span class="nt-rect-glow"></span>
      <span class="nt-rect-grid"></span>
      <span class="nt-rect-sweep"></span>
      <span class="nt-rect-3d">
        <div class="nt-rect-head">
          <span class="nt-rect-icon">${meta.svg}</span>
          <span class="nt-rect-titles">
            <span class="nt-rect-tag">${meta.tag}</span>
            <span class="nt-rect-label">${meta.label}</span>
          </span>
          <span class="nt-rect-count">${notes.length}</span>
        </div>
        <div class="nt-rect-prev">${preview}</div>
      </span>
    </button>`;
  }).join('');
  return `<div class="nt-head">
    <div class="nt-head-eyebrow">INTELECTO · ARCHIVO</div>
    <div class="nt-home-title">Notas</div>
  </div><div class="nt-rects">${cards}</div>`;
}

// ── Vista de categoría: lista + búsqueda + orden + filtro por etiqueta + alta ─
function _ntRenderCat(cat) {
  const meta = NOTAS_CATS[cat];
  const list = _ntFilteredNotes(cat).map((n, i) => _ntRenderNoteCard(n, i)).join('');
  const tags = _ntTagsOf(cat);
  const tagBar = tags.length ? `<div class="nt-tagbar">
    <button class="nt-tagchip${!_ntTagFilter ? ' on' : ''}" data-tag="">Todas</button>
    ${tags.map(t => `<button class="nt-tagchip${_ntTagFilter === t ? ' on' : ''}" data-tag="${_ntEsc(t)}"><span class="nt-tagchip-dot"></span>${_ntEsc(t)}</button>`).join('')}
  </div>` : '';
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${meta.accent}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${meta.svg}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${meta.tag}</span><span class="nt-cat-name">${meta.label}</span></div>
      <button class="nt-x" title="Volver" onclick="notasHome()">✕</button>
    </div>
    <div class="nt-tools">
      <div class="nt-search-wrap">
        <svg class="nt-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input class="nt-input nt-search" type="text" placeholder="Buscar…" value="${_ntEsc(_ntSearch)}" oninput="_ntOnSearch(this.value)">
      </div>
      <button class="nt-btn nt-sort" onclick="_ntToggleSort()">${_ntSort === 'desc' ? '↓ Reciente' : '↑ Antigua'}</button>
      <button class="nt-btn nt-add" onclick="notasNew('${cat}')"><span class="nt-add-plus">+</span> Nueva</button>
    </div>
    ${tagBar}
    <div class="nt-list">${list}</div>
  </div>`;
}

function _ntRenderNoteCard(n, i) {
  const fields = n.categoria === 'aprendizaje'
    ? `<div class="nt-learn">
        ${_ntFieldRow('bien', 'Hice bien', n.hiceBien)}
        ${_ntFieldRow('mal', 'Hice mal', n.hiceMal)}
        ${_ntFieldRow('learn', 'Aprendí', n.aprendi)}
        ${_ntFieldRow('next', 'Mejoraría', n.mejorarProxima)}
        ${n.suceso ? `<div class="nt-suceso">${_ntEsc(n.suceso)}</div>` : ''}
      </div>`
    : (n.texto ? `<div class="nt-note-text">${_ntEsc(n.texto)}</div>` : '');
  const delay = typeof i === 'number' ? `style="--d:${Math.min(i, 8) * 55}ms"` : '';
  return `<div class="nt-note" ${delay}>
    <span class="nt-note-edge"></span>
    <div class="nt-note-head">
      <div class="nt-note-ttl">${_ntEsc(n.titulo || '(sin título)')}</div>
      <div class="nt-note-acts">
        <button class="nt-ico" title="Editar" onclick="notasEdit('${n.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="M14 6.5l3.5 3.5"/></svg></button>
        <button class="nt-ico nt-del" title="Borrar" onclick="notasDelete('${n.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg></button>
      </div>
    </div>
    <div class="nt-note-meta">
      ${n.tag ? `<button class="nt-note-tag" data-tag="${_ntEsc(n.tag)}" title="Filtrar por ${_ntEsc(n.tag)}"><span class="nt-note-tag-dot"></span>${_ntEsc(n.tag)}</button>` : ''}
      <span class="nt-note-date">${_ntEsc(_ntFmtDate(n.fecha))}</span>
    </div>
    ${fields}
  </div>`;
}
function _ntFieldRow(kind, label, val) {
  if (!val) return '';
  return `<div class="nt-field nt-f-${kind}"><span class="nt-field-lbl">${label}</span><span class="nt-field-val">${_ntEsc(val)}</span></div>`;
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
    : `<label class="nt-flbl">Texto</label>
       <textarea class="nt-input nt-ta nt-ta-xl" id="nt-f-texto" rows="14" placeholder="${cat === 'personales' ? 'Escribí tu anotación…' : 'Escribí tu reflexión…'}">${_ntEsc(v.texto || '')}</textarea>`;
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${meta.accent}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${meta.svg}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${editing ? 'EDITAR' : 'NUEVA'}</span><span class="nt-cat-name">${meta.label}</span></div>
      <button class="nt-x" title="Cancelar" onclick="_ntCancelForm()">✕</button>
    </div>
    <div class="nt-form">
      <label class="nt-flbl">Título</label>
      <input class="nt-input" id="nt-f-titulo" type="text" value="${_ntEsc(v.titulo || '')}" placeholder="(sin título)">
      <div class="nt-form-row">
        <div>
          <label class="nt-flbl">Etiqueta</label>
          <input class="nt-input" id="nt-f-tag" type="text" list="nt-tag-list" value="${_ntEsc(v.tag || '')}" placeholder="Ej: Novia, Dios, GYM…">
          <datalist id="nt-tag-list">${_ntTagsOf(cat).map(t => `<option value="${_ntEsc(t)}"></option>`).join('')}</datalist>
        </div>
        <div>
          <label class="nt-flbl">Fecha</label>
          <input class="nt-input" id="nt-f-fecha" type="date" value="${_ntEsc(v.fecha || _ntToday())}">
        </div>
      </div>
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

function notasOpenCat(cat) { _ntView = cat; _ntSearch = ''; _ntTagFilter = null; _ntEditing = null; notasRender(); }
function notasNew(cat) { _ntFormCat = cat; _ntEditing = 'new'; notasRender(); }
function notasEdit(id) { _ntEditing = id; notasRender(); }
function _ntCancelForm() { _ntEditing = null; notasRender(); }
function _ntOnSearch(val) { _ntSearch = val; const l = document.querySelector('.nt-list'); if (l) l.innerHTML = _ntCatListHTML(_ntView); }
function _ntToggleSort() { _ntSort = _ntSort === 'desc' ? 'asc' : 'desc'; notasRender(); }
function _ntSetTagFilter(t) { const v = (t || '').trim(); _ntTagFilter = (v && v !== _ntTagFilter) ? v : null; notasRender(); }

// Refresca sólo la lista (búsqueda en vivo) reutilizando el filtrado central
function _ntCatListHTML(cat) {
  return _ntFilteredNotes(cat).map((n, i) => _ntRenderNoteCard(n, i)).join('');
}

function _ntVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

function _ntSaveForm() {
  const editing = _ntEditing !== 'new' ? _ntAll().find(n => n.id === _ntEditing) : null;
  const cat = editing ? editing.categoria : _ntFormCat;
  const base = {
    titulo: _ntVal('nt-f-titulo'),
    tag: _ntVal('nt-f-tag'),
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

  // Overlay (el punto de entrada ahora es el speed-dial de Conocimiento; ver secciones-fab.js)
  const ov = document.createElement('div');
  ov.id = 'notas-overlay';
  ov.innerHTML = `<div id="notas-panel">
    <button id="notas-close" title="Cerrar (Esc)" aria-label="Cerrar" onclick="notasClose()">✕</button>
    <div id="notas-body"></div>
  </div>`;
  document.body.appendChild(ov);

  // Escape cierra todo el panel
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ov.classList.contains('show')) { e.stopPropagation(); notasClose(); }
  });

  // Click en chip/etiqueta con data-tag → filtra la categoría por esa etiqueta
  document.getElementById('notas-body').addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-tag]');
    if (el) { e.stopPropagation(); _ntSetTagFilter(el.dataset.tag); }
  });

  // Tilt 3D de los rectángulos (solo punteros finos con hover; en móvil no aplica)
  const canTilt = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches
    && !(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (canTilt) {
    const body = document.getElementById('notas-body');
    body.addEventListener('pointermove', e => {
      const r = e.target.closest && e.target.closest('.nt-rect');
      if (!r) return;
      const b = r.getBoundingClientRect();
      const px = (e.clientX - b.left) / b.width - 0.5;
      const py = (e.clientY - b.top) / b.height - 0.5;
      r.style.setProperty('--rx', (py * -7).toFixed(2) + 'deg');
      r.style.setProperty('--ry', (px * 9).toFixed(2) + 'deg');
      r.style.setProperty('--mx', (px * 100 + 50).toFixed(1) + '%');
      r.style.setProperty('--my', (py * 100 + 50).toFixed(1) + '%');
    });
    body.addEventListener('pointerleave', () => {
      body.querySelectorAll('.nt-rect').forEach(r => { r.style.removeProperty('--rx'); r.style.removeProperty('--ry'); });
    }, true);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _ntMount);
else _ntMount();
