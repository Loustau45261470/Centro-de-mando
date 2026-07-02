'use strict';
// ════════════════════════════════════════════════════════════════════════
// FICHERO — overlay de la pestaña Vida. Archivero de personas: fichas con
// datos personales (nacimiento, trabajo, familia, pareja, mascotas, gustos).
// CRUD + búsqueda por nombre. Persistencia en S.fichero (sync Firestore).
// Reutiliza CMOverlay + estilos nt-* del sistema de Notas.
// ════════════════════════════════════════════════════════════════════════

const _fpEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FP_ACCENT = '#5EEAD4';
const FP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="2.4"/><path d="M4 8h16M4 16h16"/><circle cx="12" cy="12" r="1.8"/><path d="M8.8 15.2c.5-1.3 1.8-2 3.2-2s2.7.7 3.2 2" stroke-linecap="round"/></svg>`;

// Campos de la ficha, en orden. type: 'text' corto | 'date' | 'textarea' largo.
const FP_FIELDS = [
  { key: 'nombre',     label: 'Nombre',              type: 'text' },
  { key: 'apellido',   label: 'Apellido',            type: 'text' },
  { key: 'nacimiento', label: 'Fecha de nacimiento', type: 'date' },
  { key: 'trabajo',    label: 'Trabajo o estudio',   type: 'text' },
  { key: 'familia',    label: 'Familia',             type: 'textarea' },
  { key: 'pareja',     label: 'Pareja',              type: 'text' },
  { key: 'mascotas',   label: 'Mascotas',            type: 'text' },
  { key: 'intereses',  label: 'Intereses y gustos',  type: 'textarea' },
];

// ── Estado UI (no sincronizado) ──────────────────────────────────────────
let _fpSearch = '';
let _fpEditing = null; // id de ficha en edición, 'new', o null

// ── Datos (persistidos en S.fichero, sync Firestore) ─────────────────────
function _fpAll() { return (typeof S !== 'undefined' && Array.isArray(S.fichero)) ? S.fichero : []; }
function _fpPersist(arr) {
  if (typeof S === 'undefined') return;
  S.fichero = arr;
  if (typeof saveState === 'function') saveState();
}

// Edad derivada de la fecha de nacimiento vs. hoy (no se guarda)
function _fpEdad(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--;
  return edad >= 0 ? String(edad) : '';
}
function _fpFmtDate(iso) { return (typeof fmtDate === 'function') ? fmtDate(iso) : (iso || ''); }

function _fpFiltered() {
  const q = _fpSearch.trim().toLowerCase();
  let fichas = _fpAll();
  if (q) fichas = fichas.filter(p => (`${p.nombre || ''} ${p.apellido || ''}`).toLowerCase().includes(q));
  return fichas.slice().sort((a, b) => (`${a.nombre} ${a.apellido}`).localeCompare(`${b.nombre} ${b.apellido}`));
}

// ════════════════════════════════════════════════════════════════════════
// APERTURA / RENDER
// ════════════════════════════════════════════════════════════════════════
function ficheroOpen() {
  if (typeof CMOverlay === 'undefined') return;
  const { overlay, body } = CMOverlay.build({ id: 'ov-fichero', accent: FP_ACCENT });
  body.id = 'fichero-body';
  _fpSearch = ''; _fpEditing = null;
  ficheroRender();
  CMOverlay.open(overlay);
}

function ficheroRender() {
  const body = document.getElementById('fichero-body');
  if (!body) return;
  body.innerHTML = _fpEditing ? _fpRenderForm() : _fpRenderList();
  if (_fpEditing) { const el = document.getElementById('fp-f-nombre'); if (el) el.focus(); }
}

// ── Listado: cabecera + buscador + alta + fichas ─────────────────────────
function _fpRenderList() {
  const fichas = _fpFiltered();
  const list = fichas.length
    ? fichas.map((p, i) => _fpRenderCard(p, i)).join('')
    : `<div class="fp-empty">${_fpAll().length ? 'Sin resultados' : 'Todavía no hay fichas. Creá la primera con “+ Nueva”.'}</div>`;
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${FP_ACCENT}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${FP_ICON}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">FICHERO</span><span class="nt-cat-name">Fichero</span></div>
    </div>
    <div class="nt-tools">
      <div class="nt-search-wrap">
        <svg class="nt-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input class="nt-input nt-search" type="text" placeholder="Buscar…" value="${_fpEsc(_fpSearch)}" oninput="_fpOnSearch(this.value)">
      </div>
      <button class="nt-btn nt-add" onclick="ficheroNew()"><span class="nt-add-plus">+</span> Nueva</button>
    </div>
    <div class="nt-list" id="fp-list">${list}</div>
  </div>`;
}

// ── Tarjeta de ficha: título Nombre Apellido + apartados en orden ─────────
function _fpRenderCard(p, i) {
  const rows = [
    ['Fecha de nacimiento', _fpFmtDate(p.nacimiento)],
    ['Edad', _fpEdad(p.nacimiento)],
    ['Trabajo o estudio', p.trabajo],
    ['Familia', p.familia],
    ['Pareja', p.pareja],
    ['Mascotas', p.mascotas],
    ['Intereses y gustos', p.intereses],
  ].map(([lbl, val]) => `<div class="fp-row"><span class="fp-row-lbl">${lbl}:</span><span class="fp-row-val">${_fpEsc(val || '—')}</span></div>`).join('');
  const delay = typeof i === 'number' ? `style="--d:${Math.min(i, 8) * 55}ms"` : '';
  return `<div class="nt-note" ${delay}>
    <span class="nt-note-edge"></span>
    <div class="nt-note-head">
      <div class="nt-note-ttl">${_fpEsc(`${p.nombre || ''} ${p.apellido || ''}`.trim() || '(sin nombre)')}</div>
      <div class="nt-note-acts">
        <button class="nt-ico" title="Editar" onclick="ficheroEdit('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="M14 6.5l3.5 3.5"/></svg></button>
        <button class="nt-ico nt-del" title="Borrar" onclick="ficheroDelete('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg></button>
      </div>
    </div>
    <div class="fp-rows">${rows}</div>
  </div>`;
}

// ── Formulario alta/edición: todos los campos obligatorios ───────────────
function _fpRenderForm() {
  const editing = _fpEditing !== 'new' ? _fpAll().find(p => p.id === _fpEditing) : null;
  const v = editing || {};
  const fields = FP_FIELDS.map(f => {
    const val = _fpEsc(v[f.key] || '');
    const input = f.type === 'textarea'
      ? `<textarea class="nt-input nt-ta" id="fp-f-${f.key}" rows="4">${val}</textarea>`
      : `<input class="nt-input" id="fp-f-${f.key}" type="${f.type}" value="${val}">`;
    const edad = f.key === 'nacimiento'
      ? `<div class="fp-edad" id="fp-edad-live">${_fpEdad(v.nacimiento) ? `Edad: ${_fpEdad(v.nacimiento)} años` : ''}</div>`
      : '';
    return `<label class="nt-flbl">${f.label}</label>${input}${edad}`;
  }).join('');
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${FP_ACCENT}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${FP_ICON}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${editing ? 'EDITAR' : 'NUEVA'}</span><span class="nt-cat-name">Ficha</span></div>
      <button class="nt-x" title="Cancelar" onclick="_fpCancelForm()">✕</button>
    </div>
    <div class="nt-form">
      ${fields}
      <div class="nt-form-acts">
        <button class="nt-btn nt-add" onclick="_fpSaveForm()">Guardar</button>
        <button class="nt-btn" onclick="_fpCancelForm()">Cancelar</button>
      </div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════
// ACCIONES
// ════════════════════════════════════════════════════════════════════════
function ficheroNew() { _fpEditing = 'new'; ficheroRender(); }
function ficheroEdit(id) { _fpEditing = id; ficheroRender(); }
function _fpCancelForm() { _fpEditing = null; ficheroRender(); }
function _fpOnSearch(val) {
  _fpSearch = val;
  const l = document.getElementById('fp-list');
  if (!l) return;
  const fichas = _fpFiltered();
  l.innerHTML = fichas.length
    ? fichas.map((p, i) => _fpRenderCard(p, i)).join('')
    : `<div class="fp-empty">${_fpAll().length ? 'Sin resultados' : 'Todavía no hay fichas. Creá la primera con “+ Nueva”.'}</div>`;
}

function _fpSaveForm() {
  const vals = {};
  let firstMissing = null;
  FP_FIELDS.forEach(f => {
    const el = document.getElementById('fp-f-' + f.key);
    const v = el ? el.value.trim() : '';
    vals[f.key] = v;
    if (el) el.classList.toggle('fp-missing', !v);
    if (!v && !firstMissing) firstMissing = { el, label: f.label };
  });
  if (firstMissing) {
    if (typeof showToast === 'function') showToast(`Falta completar: ${firstMissing.label}`);
    if (firstMissing.el) firstMissing.el.focus();
    return;
  }
  const all = _fpAll().slice();
  if (_fpEditing !== 'new') {
    const i = all.findIndex(p => p.id === _fpEditing);
    if (i >= 0) all[i] = { ...all[i], ...vals };
  } else {
    all.push({ id: (typeof uid === 'function' ? uid() : Date.now().toString(36)), ...vals });
  }
  _fpPersist(all);
  _fpEditing = null;
  ficheroRender();
}

function ficheroDelete(id) {
  if (!confirm('¿Seguro que querés borrar esta ficha?')) return;
  _fpPersist(_fpAll().filter(p => p.id !== id));
  ficheroRender();
}

// Edad en vivo al elegir fecha de nacimiento en el formulario
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'fp-f-nacimiento') {
    const out = document.getElementById('fp-edad-live');
    if (out) { const ed = _fpEdad(e.target.value); out.textContent = ed ? `Edad: ${ed} años` : ''; }
  }
});

window.ficheroOpen = ficheroOpen;
