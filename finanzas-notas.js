'use strict';
// ════════════════════════════════════════════════════════════════════════
// ANOTACIONES DE FINANZAS — overlay simple, sin categorías. Lista plana y
// compacta sobre el primitivo CMOverlay, reutilizando clases .nt-*.
// Estado: S.notasFinanzas = [{ id, titulo, tag, fecha, texto }].
// El texto no se despliega completo en la lista (snippet de 1 línea); el
// contenido completo se ve al abrir/editar la nota.
// ════════════════════════════════════════════════════════════════════════

const _fnEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FN_ACCENT = '#22C55E';

let _fnSearch = '', _fnSort = 'desc', _fnEditing = null, _fnTagFilter = null;

function _fnAll() { return (typeof S !== 'undefined' && Array.isArray(S.notasFinanzas)) ? S.notasFinanzas : []; }
function _fnPersist(arr) { if (typeof S === 'undefined') return; S.notasFinanzas = arr; if (typeof saveState === 'function') saveState(); }
function _fnFmtDate(iso) { return (typeof fmtDate === 'function') ? fmtDate(iso) : (iso || ''); }
function _fnToday() { return (typeof localStr === 'function') ? localStr(new Date()) : new Date().toISOString().slice(0, 10); }
function _fnUid() { return (typeof uid === 'function') ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _fnVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function _fnTags() { return [...new Set(_fnAll().map(n => (n.tag || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function _fnFiltered() {
  const q = _fnSearch.trim().toLowerCase();
  let notes = _fnAll().slice();
  if (_fnTagFilter) notes = notes.filter(n => (n.tag || '').trim() === _fnTagFilter);
  if (q) notes = notes.filter(n => (`${n.titulo || ''} ${n.tag || ''} ${n.texto || ''}`).toLowerCase().includes(q));
  return notes.sort((a, b) => { const c = (a.fecha || '').localeCompare(b.fecha || ''); return _fnSort === 'asc' ? c : -c; });
}

// ── Apertura ───────────────────────────────────────────────────────────────
function finanzasNotasOpen() {
  if (typeof CMOverlay === 'undefined') return;
  _fnSearch = ''; _fnSort = 'desc'; _fnEditing = null; _fnTagFilter = null;
  const { overlay } = CMOverlay.build({ id: 'ov-finanzas-notas', accent: FN_ACCENT });
  _fnRender();
  CMOverlay.open(overlay);
}
window.finanzasNotasOpen = finanzasNotasOpen;

function _fnRender() {
  const ov = document.getElementById('ov-finanzas-notas'); if (!ov) return;
  const body = ov.querySelector('.cm-ov-body'); if (!body) return;
  body.innerHTML = _fnEditing ? _fnForm() : _fnList();
  if (_fnEditing) { const el = document.getElementById('fn-f-titulo'); if (el) el.focus(); }
}

function _fnList() {
  const notes = _fnFiltered();
  const list = notes.map((n, i) => _fnCard(n, i)).join('');
  const tags = _fnTags();
  const tagBar = tags.length ? `<div class="nt-tagbar">
    <button class="nt-tagchip${!_fnTagFilter ? ' on' : ''}" onclick="finanzasSetTag('')">Todas</button>
    ${tags.map(t => `<button class="nt-tagchip${_fnTagFilter === t ? ' on' : ''}" onclick="finanzasSetTag('${_fnEsc(t)}')"><span class="nt-tagchip-dot"></span>${_fnEsc(t)}</button>`).join('')}
  </div>` : '';
  const empty = notes.length ? '' : `<div class="nt-empty">${_fnAll().length ? 'Sin resultados.' : 'Todavía no hay anotaciones. Creá la primera.'}</div>`;
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${FN_ACCENT}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="13" height="17" rx="2.3"/><path d="M8.5 3.5v17"/><path d="M11 8.5h4M11 12h4"/></svg></span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">FINANZAS · NOTAS</span><span class="nt-cat-name">Anotaciones</span></div>
    </div>
    <div class="nt-tools">
      <div class="nt-search-wrap">
        <svg class="nt-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input class="nt-input nt-search" type="text" placeholder="Buscar…" value="${_fnEsc(_fnSearch)}" oninput="finanzasOnSearch(this.value)">
      </div>
      <button class="nt-btn nt-sort" onclick="finanzasToggleSort()">${_fnSort === 'desc' ? '↓ Reciente' : '↑ Antigua'}</button>
      <button class="nt-btn nt-add" onclick="finanzasNew()"><span class="nt-add-plus">+</span> Nueva</button>
    </div>
    ${tagBar}
    <div class="nt-list nt-list-compact">${list}</div>
    ${empty}
  </div>`;
}

function _fnCard(n, i) {
  const delay = typeof i === 'number' ? `style="--d:${Math.min(i, 8) * 45}ms"` : '';
  const snip = (n.texto || '').replace(/\s+/g, ' ').trim();
  return `<div class="nt-note nt-note-compact" ${delay}>
    <div class="nt-note-head">
      <div class="nt-note-ttl">${_fnEsc(n.titulo || '(sin título)')}</div>
      <div class="nt-note-acts">
        <button class="nt-ico" title="Abrir / editar" onclick="finanzasEdit('${n.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="M14 6.5l3.5 3.5"/></svg></button>
        <button class="nt-ico nt-del" title="Borrar" onclick="finanzasDelete('${n.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg></button>
      </div>
    </div>
    <div class="nt-note-meta">
      ${n.tag ? `<button class="nt-note-tag" onclick="finanzasSetTag('${_fnEsc(n.tag)}')" title="Filtrar por ${_fnEsc(n.tag)}"><span class="nt-note-tag-dot"></span>${_fnEsc(n.tag)}</button>` : ''}
      <span class="nt-note-date">${_fnEsc(_fnFmtDate(n.fecha))}</span>
    </div>
    ${snip ? `<div class="fn-snip">${_fnEsc(snip)}</div>` : ''}
  </div>`;
}

function _fnForm() {
  const editing = _fnEditing !== 'new' ? _fnAll().find(n => n.id === _fnEditing) : null;
  const v = editing || {};
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${FN_ACCENT}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="13" height="17" rx="2.3"/><path d="M8.5 3.5v17"/><path d="M11 8.5h4M11 12h4"/></svg></span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${editing ? 'EDITAR' : 'NUEVA'}</span><span class="nt-cat-name">Anotación</span></div>
      <button class="nt-x" title="Cancelar" onclick="finanzasCancel()">✕</button>
    </div>
    <div class="nt-form">
      <label class="nt-flbl">Título</label>
      <input class="nt-input" id="fn-f-titulo" type="text" value="${_fnEsc(v.titulo || '')}" placeholder="(sin título)">
      <div class="nt-form-row">
        <div><label class="nt-flbl">Etiqueta</label><input class="nt-input" id="fn-f-tag" type="text" list="fn-tag-list" value="${_fnEsc(v.tag || '')}" placeholder="Ej: IOL, gastos, meta…"><datalist id="fn-tag-list">${_fnTags().map(t => `<option value="${_fnEsc(t)}"></option>`).join('')}</datalist></div>
        <div><label class="nt-flbl">Fecha</label><input class="nt-input" id="fn-f-fecha" type="date" value="${_fnEsc(v.fecha || _fnToday())}"></div>
      </div>
      <div class="nt-flbl-row"><label class="nt-flbl">Texto</label><button type="button" class="nt-btn nt-preview-btn" onclick="_fnTogglePreview()">Vista previa</button></div>
      <textarea class="nt-input nt-ta nt-ta-xl" id="fn-f-texto" rows="14" placeholder="Escribí tu anotación…">${_fnEsc(v.texto || '')}</textarea>
      <div class="rn-preview-box" id="fn-f-preview" style="display:none"></div>
      <div class="nt-form-acts">
        <button class="nt-btn nt-add" onclick="finanzasSave()">Guardar</button>
        <button class="nt-btn" onclick="finanzasCancel()">Cancelar</button>
      </div>
    </div>
  </div>`;
}

// Vista previa (solo lectura) del textarea de la anotación, toggleable.
function _fnTogglePreview() {
  const box = document.getElementById('fn-f-preview');
  const ta = document.getElementById('fn-f-texto');
  if (!box || !ta) return;
  const show = box.style.display === 'none';
  if (show) box.innerHTML = rnRender(ta.value, { interactive: false });
  box.style.display = show ? '' : 'none';
}

// ── Acciones ─────────────────────────────────────────────────────────────
function finanzasNew() { _fnEditing = 'new'; _fnRender(); }
function finanzasEdit(id) { _fnEditing = id; _fnRender(); }
function finanzasCancel() { _fnEditing = null; _fnRender(); }
function finanzasToggleSort() { _fnSort = _fnSort === 'desc' ? 'asc' : 'desc'; _fnRender(); }
function finanzasSetTag(t) { const v = (t || '').trim(); _fnTagFilter = (v && v !== _fnTagFilter) ? v : null; _fnRender(); }
function finanzasOnSearch(val) {
  _fnSearch = val;
  const l = document.querySelector('#ov-finanzas-notas .nt-list');
  if (l) l.innerHTML = _fnFiltered().map((n, i) => _fnCard(n, i)).join('');
}
function finanzasSave() {
  const editing = _fnEditing !== 'new' ? _fnAll().find(n => n.id === _fnEditing) : null;
  const data = { titulo: _fnVal('fn-f-titulo'), tag: _fnVal('fn-f-tag'), fecha: _fnVal('fn-f-fecha') || _fnToday(), texto: _fnVal('fn-f-texto') };
  const all = _fnAll().slice();
  if (editing) { const i = all.findIndex(n => n.id === editing.id); if (i >= 0) all[i] = { ...all[i], ...data }; }
  else { all.push({ id: _fnUid(), ...data }); }
  _fnPersist(all); _fnEditing = null; _fnRender();
}
function finanzasDelete(id) {
  if (!confirm('¿Seguro que querés borrar esta anotación?')) return;
  _fnPersist(_fnAll().filter(n => n.id !== id)); _fnRender();
}
