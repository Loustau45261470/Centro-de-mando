'use strict';
// ════════════════════════════════════════════════════════════════════════
// NOTAS DE SALUD — overlay estilo Conocimiento, adaptado a salud.
// Reutiliza las clases .nt-* (CSS de notas) sobre el primitivo CMOverlay.
// Estado: S.notasSalud = [{ id, categoria, titulo, fecha, tag, texto }].
// 4 categorías: lesiones · nutricion · ejecucion · pensamientos.
// ════════════════════════════════════════════════════════════════════════

const _snEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SN_ICONS = {
  lesiones: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M10 10l4 4M14 10l-4 4"/></svg>`,
  nutricion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7c-1-3-4-4-6-3 0 0-1 6 3 10 3 3 6 3 6 3s3 0 6-3c4-4 3-10 3-10-2-1-5 0-6 3"/><path d="M12 7v13"/></svg>`,
  ejecucion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M4 9v6M20 9v6M6.5 12h11"/></svg>`,
  pensamientos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 4A4.5 4.5 0 0 0 6 11a4 4 0 0 0 1 6 3.5 3.5 0 0 0 5 1 3.5 3.5 0 0 0 5-1 4 4 0 0 0 1-6 4.5 4.5 0 0 0-3.5-7 3.5 3.5 0 0 0-5 0z"/><path d="M5 19l-1.5 2M19 19l1.5 2"/></svg>`,
};

const SN_CATS = {
  lesiones:     { label: 'Lesiones / Dolores',         svg: SN_ICONS.lesiones,     accent: '#F43F5E', tag: 'LESIONES' },
  nutricion:    { label: 'Nutrición / Energía',        svg: SN_ICONS.nutricion,    accent: '#10E07C', tag: 'NUTRICIÓN' },
  ejecucion:    { label: 'Ejecución / Tips de gym',    svg: SN_ICONS.ejecucion,    accent: '#F5A623', tag: 'EJECUCIÓN' },
  pensamientos: { label: 'Pensamientos y sensaciones', svg: SN_ICONS.pensamientos, accent: '#818CF8', tag: 'SENSACIONES' },
};
const SN_CAT_KEYS = ['lesiones', 'nutricion', 'ejecucion', 'pensamientos'];

let _snView = null, _snSearch = '', _snSort = 'desc', _snEditing = null, _snTagFilter = null, _snFormCat = 'lesiones';

function _snAll() { return (typeof S !== 'undefined' && Array.isArray(S.notasSalud)) ? S.notasSalud : []; }
function _snPersist(arr) { if (typeof S === 'undefined') return; S.notasSalud = arr; if (typeof saveState === 'function') saveState(); }
function _snByCat(cat) { return _snAll().filter(n => n.categoria === cat); }
function _snFmtDate(iso) { return (typeof fmtDate === 'function') ? fmtDate(iso) : (iso || ''); }
function _snToday() { return (typeof localStr === 'function') ? localStr(new Date()) : new Date().toISOString().slice(0, 10); }
function _snTagsOf(cat) { return [...new Set(_snByCat(cat).map(n => (n.tag || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function _snFiltered(cat) {
  const q = _snSearch.trim().toLowerCase();
  let notes = _snByCat(cat);
  if (_snTagFilter) notes = notes.filter(n => (n.tag || '').trim() === _snTagFilter);
  if (q) notes = notes.filter(n => (`${n.titulo || ''} ${n.tag || ''} ${n.texto || ''}`).toLowerCase().includes(q));
  return notes.sort((a, b) => { const c = (a.fecha || '').localeCompare(b.fecha || ''); return _snSort === 'asc' ? c : -c; });
}

// ── Apertura ───────────────────────────────────────────────────────────────
function saludNotasOpen() {
  if (typeof CMOverlay === 'undefined') return;
  _snView = null; _snSearch = ''; _snSort = 'desc'; _snEditing = null; _snTagFilter = null;
  const { overlay } = CMOverlay.build({ id: 'ov-salud-notas', accent: '#10E07C' });
  if (!overlay._snWired) {
    overlay.querySelector('.cm-ov-body').addEventListener('click', e => {
      const el = e.target.closest && e.target.closest('[data-sntag]');
      if (el) { e.stopPropagation(); _snSetTagFilter(el.dataset.sntag); }
    });
    overlay._snWired = true;
  }
  _snRender();
  CMOverlay.open(overlay);
}
window.saludNotasOpen = saludNotasOpen;

function _snRender() {
  const ov = document.getElementById('ov-salud-notas'); if (!ov) return;
  const body = ov.querySelector('.cm-ov-body'); if (!body) return;
  body.innerHTML = _snEditing ? _snForm() : (_snView ? _snCat(_snView) : _snHome());
  if (_snEditing) { const el = document.getElementById('sn-f-titulo'); if (el) el.focus(); }
}

function _snHome() {
  const cards = SN_CAT_KEYS.map((cat, i) => {
    const meta = SN_CATS[cat];
    const notes = _snByCat(cat).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const preview = notes.slice(0, 3).map(n => `<div class="nt-prev-item"><span class="nt-prev-dot"></span><span class="nt-prev-title">${_snEsc(n.titulo || '(sin título)')}</span>${n.texto ? `<span class="nt-prev-snip">${_snEsc(n.texto.slice(0, 80))}</span>` : ''}</div>`).join('');
    return `<button class="nt-rect" style="--nt-accent:${meta.accent};--d:${i * 80}ms" onclick="saludNotasOpenCat('${cat}')">
      <span class="nt-rect-glow"></span><span class="nt-rect-grid"></span><span class="nt-rect-sweep"></span>
      <span class="nt-rect-3d">
        <div class="nt-rect-head">
          <span class="nt-rect-icon">${meta.svg}</span>
          <span class="nt-rect-titles"><span class="nt-rect-tag">${meta.tag}</span><span class="nt-rect-label">${meta.label}</span></span>
          <span class="nt-rect-count">${notes.length}</span>
        </div>
        <div class="nt-rect-prev">${preview}</div>
      </span>
    </button>`;
  }).join('');
  return `<div class="nt-head"><div class="nt-head-eyebrow">SALUD · NOTAS</div><div class="nt-home-title">Notas de salud</div></div><div class="nt-rects">${cards}</div>`;
}

function _snCat(cat) {
  const meta = SN_CATS[cat];
  const list = _snFiltered(cat).map((n, i) => _snNoteCard(n, i)).join('');
  const tags = _snTagsOf(cat);
  const tagBar = tags.length ? `<div class="nt-tagbar"><button class="nt-tagchip${!_snTagFilter ? ' on' : ''}" data-sntag="">Todas</button>${tags.map(t => `<button class="nt-tagchip${_snTagFilter === t ? ' on' : ''}" data-sntag="${_snEsc(t)}"><span class="nt-tagchip-dot"></span>${_snEsc(t)}</button>`).join('')}</div>` : '';
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${meta.accent}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${meta.svg}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${meta.tag}</span><span class="nt-cat-name">${meta.label}</span></div>
      <button class="nt-x" title="Volver" onclick="saludNotasHome()">✕</button>
    </div>
    <div class="nt-tools">
      <div class="nt-search-wrap"><svg class="nt-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input class="nt-input nt-search" type="text" placeholder="Buscar…" value="${_snEsc(_snSearch)}" oninput="_snOnSearch(this.value)"></div>
      <button class="nt-btn nt-sort" onclick="_snToggleSort()">${_snSort === 'desc' ? '↓ Reciente' : '↑ Antigua'}</button>
      <button class="nt-btn nt-add" onclick="saludNotasNew('${cat}')"><span class="nt-add-plus">+</span> Nueva</button>
    </div>
    ${tagBar}
    <div class="nt-list">${list}</div>
  </div>`;
}

function _snNoteCard(n, i) {
  const delay = typeof i === 'number' ? `style="--d:${Math.min(i, 8) * 55}ms"` : '';
  return `<div class="nt-note" ${delay}>
    <span class="nt-note-edge"></span>
    <div class="nt-note-head">
      <div class="nt-note-ttl">${_snEsc(n.titulo || '(sin título)')}</div>
      <div class="nt-note-acts">
        <button class="nt-ico" title="Editar" onclick="saludNotasEdit('${n.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="M14 6.5l3.5 3.5"/></svg></button>
        <button class="nt-ico nt-del" title="Borrar" onclick="saludNotasDelete('${n.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg></button>
      </div>
    </div>
    <div class="nt-note-meta">
      ${n.tag ? `<button class="nt-note-tag" data-sntag="${_snEsc(n.tag)}" title="Filtrar por ${_snEsc(n.tag)}"><span class="nt-note-tag-dot"></span>${_snEsc(n.tag)}</button>` : ''}
      <span class="nt-note-date">${_snEsc(_snFmtDate(n.fecha))}</span>
    </div>
    ${n.texto ? `<div class="nt-note-text">${_snEsc(n.texto)}</div>` : ''}
  </div>`;
}

function _snForm() {
  const editing = _snEditing !== 'new' ? _snAll().find(n => n.id === _snEditing) : null;
  const cat = editing ? editing.categoria : _snFormCat;
  const meta = SN_CATS[cat]; const v = editing || {};
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${meta.accent}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${meta.svg}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${editing ? 'EDITAR' : 'NUEVA'}</span><span class="nt-cat-name">${meta.label}</span></div>
      <button class="nt-x" title="Cancelar" onclick="_snCancel()">✕</button>
    </div>
    <div class="nt-form">
      <label class="nt-flbl">Título</label>
      <input class="nt-input" id="sn-f-titulo" type="text" value="${_snEsc(v.titulo || '')}" placeholder="(sin título)">
      <div class="nt-form-row">
        <div><label class="nt-flbl">Etiqueta</label><input class="nt-input" id="sn-f-tag" type="text" list="sn-tag-list" value="${_snEsc(v.tag || '')}" placeholder="Ej: rodilla, pierna…"><datalist id="sn-tag-list">${_snTagsOf(cat).map(t => `<option value="${_snEsc(t)}"></option>`).join('')}</datalist></div>
        <div><label class="nt-flbl">Fecha</label><input class="nt-input" id="sn-f-fecha" type="date" value="${_snEsc(v.fecha || _snToday())}"></div>
      </div>
      <label class="nt-flbl">Texto</label>
      <textarea class="nt-input nt-ta" id="sn-f-texto" rows="5">${_snEsc(v.texto || '')}</textarea>
      <div class="nt-form-acts">
        <button class="nt-btn nt-add" onclick="_snSave()">Guardar</button>
        <button class="nt-btn" onclick="_snCancel()">Cancelar</button>
      </div>
    </div>
  </div>`;
}

// ── Acciones ─────────────────────────────────────────────────────────────
function saludNotasHome() { _snView = null; _snSearch = ''; _snEditing = null; _snTagFilter = null; _snRender(); }
function saludNotasOpenCat(cat) { _snView = cat; _snSearch = ''; _snTagFilter = null; _snEditing = null; _snRender(); }
function saludNotasNew(cat) { _snFormCat = cat; _snEditing = 'new'; _snRender(); }
function saludNotasEdit(id) { _snEditing = id; _snRender(); }
function _snCancel() { _snEditing = null; _snRender(); }
function _snToggleSort() { _snSort = _snSort === 'desc' ? 'asc' : 'desc'; _snRender(); }
function _snSetTagFilter(t) { const v = (t || '').trim(); _snTagFilter = (v && v !== _snTagFilter) ? v : null; _snRender(); }
function _snOnSearch(val) { _snSearch = val; const l = document.querySelector('#ov-salud-notas .nt-list'); if (l) l.innerHTML = _snFiltered(_snView).map((n, i) => _snNoteCard(n, i)).join(''); }
function _snVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function _snSave() {
  const editing = _snEditing !== 'new' ? _snAll().find(n => n.id === _snEditing) : null;
  const cat = editing ? editing.categoria : _snFormCat;
  const data = { titulo: _snVal('sn-f-titulo'), tag: _snVal('sn-f-tag'), fecha: _snVal('sn-f-fecha') || _snToday(), texto: _snVal('sn-f-texto') };
  const all = _snAll().slice();
  if (editing) { const i = all.findIndex(n => n.id === editing.id); if (i >= 0) all[i] = { ...all[i], ...data }; }
  else { all.push({ id: (typeof uid === 'function' ? uid() : Date.now().toString(36)), categoria: cat, ...data }); }
  _snPersist(all); _snView = cat; _snEditing = null; _snRender();
}
function saludNotasDelete(id) {
  if (!confirm('¿Seguro que querés borrar esta nota?')) return;
  _snPersist(_snAll().filter(n => n.id !== id)); _snRender();
}
