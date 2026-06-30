'use strict';
// ════════════════════════════════════════════════════════════════════════
// NOTAS DE ESTUDIO — sección jerárquica dentro del overlay de Notas (Conocimiento).
// Materias (carpetas, autoagrupadas por tag de año) → páginas (título + texto plano).
// Se renderiza dentro de #notas-body reutilizando clases .nt-*. Routing desde
// notas-intelecto.js: _ntView === 'estudio' → estudioRenderHTML().
// Modelo relacional: S.estudioMaterias = [{id,nombre,anio}],
//                    S.estudioPaginas  = [{id,materiaId,titulo,texto,fecha}].
// ════════════════════════════════════════════════════════════════════════

const _esEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ESTUDIO_ACCENT = '#2DD4BF';
const ESTUDIO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.5 5 8 4.5 4 5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5V5c-4-.5-6.5 0-8 1.5z"/><path d="M12 6.5v13"/></svg>`;
const ESTUDIO_FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h3.5a2 2 0 0 1 1.4.6L11.5 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
const ES_EDIT_ICO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="M14 6.5l3.5 3.5"/></svg>`;
const ES_DEL_ICO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>`;

// ── Estado UI (no sincronizado) ──────────────────────────────────────────
let _esView = 'materias';   // 'materias' (lista) | materiaId (lista de páginas)
let _esEditing = null;      // 'mat-new' | 'mat-<id>' | 'pag-new' | 'pag-<id>' | null
let _esAnio = null;         // filtro de año en la lista de materias (null = todas, '' = sin año)
let _esSearch = '';         // búsqueda de páginas dentro de una materia
let _esSort = 'desc';       // orden de páginas por fecha
let _esPagMateria = null;   // materiaId destino al crear una página nueva

// ── Datos ──────────────────────────────────────────────────────────────
function _esMaterias() { return (typeof S !== 'undefined' && Array.isArray(S.estudioMaterias)) ? S.estudioMaterias : []; }
function _esPaginas() { return (typeof S !== 'undefined' && Array.isArray(S.estudioPaginas)) ? S.estudioPaginas : []; }
function _esPersistM(arr) { if (typeof S === 'undefined') return; S.estudioMaterias = arr; if (typeof saveState === 'function') saveState(); }
function _esPersistP(arr) { if (typeof S === 'undefined') return; S.estudioPaginas = arr; if (typeof saveState === 'function') saveState(); }
function _esMateria(id) { return _esMaterias().find(m => m.id === id) || null; }
function _esPagsOf(mid) { return _esPaginas().filter(p => p.materiaId === mid); }
function _esFmtDate(iso) { return (typeof fmtDate === 'function') ? fmtDate(iso) : (iso || ''); }
function _esToday() { return (typeof localStr === 'function') ? localStr(new Date()) : new Date().toISOString().slice(0, 10); }
function _esUid() { return (typeof uid === 'function') ? uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _esVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

// Años distintos presentes (para la barra de filtro)
function _esAnios() { return [...new Set(_esMaterias().map(m => (m.anio || '').trim()).filter(Boolean))].sort((a, b) => b.localeCompare(a)); }
function _esHasSinAnio() { return _esMaterias().some(m => !(m.anio || '').trim()); }

// Materias visibles según filtro de año
function _esFilteredMaterias() {
  let ms = _esMaterias().slice();
  if (_esAnio === '') ms = ms.filter(m => !(m.anio || '').trim());
  else if (_esAnio) ms = ms.filter(m => (m.anio || '').trim() === _esAnio);
  return ms.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}
// Páginas de la materia activa según búsqueda + orden
function _esFilteredPaginas(mid) {
  const q = _esSearch.trim().toLowerCase();
  let ps = _esPagsOf(mid);
  if (q) ps = ps.filter(p => (`${p.titulo || ''} ${p.texto || ''}`).toLowerCase().includes(q));
  return ps.sort((a, b) => { const c = (a.fecha || '').localeCompare(b.fecha || ''); return _esSort === 'asc' ? c : -c; });
}

// ════════════════════════════════════════════════════════════════════════
// TARJETA EN EL HOME DE NOTAS (rectángulo "Notas de estudio")
// ════════════════════════════════════════════════════════════════════════
function estudioHomeCardHTML(i) {
  const count = _esMaterias().length;
  const preview = _esMaterias().slice(0, 3).map(m => `<div class="nt-prev-item">
      <span class="nt-prev-dot"></span>
      <span class="nt-prev-title">${_esEsc(m.nombre || '(sin nombre)')}</span>
      ${(m.anio || '').trim() ? `<span class="nt-prev-snip">${_esEsc(m.anio)}</span>` : ''}
    </div>`).join('');
  return `<button class="nt-rect" style="--nt-accent:${ESTUDIO_ACCENT};--d:${i * 90}ms" onclick="estudioOpenHome()">
    <span class="nt-rect-glow"></span>
    <span class="nt-rect-grid"></span>
    <span class="nt-rect-sweep"></span>
    <span class="nt-rect-3d">
      <div class="nt-rect-head">
        <span class="nt-rect-icon">${ESTUDIO_ICON}</span>
        <span class="nt-rect-titles">
          <span class="nt-rect-tag">ESTUDIO</span>
          <span class="nt-rect-label">Notas de estudio</span>
        </span>
        <span class="nt-rect-count">${count}</span>
      </div>
      <div class="nt-rect-prev">${preview}</div>
    </span>
  </button>`;
}

// ════════════════════════════════════════════════════════════════════════
// RENDER (dentro de #notas-body, despachado por notasRender)
// ════════════════════════════════════════════════════════════════════════
function estudioRenderHTML() {
  if (_esEditing === 'mat-new' || (typeof _esEditing === 'string' && _esEditing.startsWith('mat-'))) return _esMateriaForm();
  if (_esEditing === 'pag-new' || (typeof _esEditing === 'string' && _esEditing.startsWith('pag-'))) return _esPageForm();
  if (_esView !== 'materias') return _esPaginasView(_esView);
  return _esMateriasView();
}
function estudioAfterRender() {
  const el = document.getElementById('es-f-first');
  if (el) el.focus();
}

// ── Lista de materias (home de Notas de estudio) ─────────────────────────
function _esMateriasView() {
  const anios = _esAnios();
  const chips = (anios.length || _esHasSinAnio())
    ? `<div class="nt-tagbar">
        <button class="nt-tagchip${_esAnio === null ? ' on' : ''}" onclick="estudioSetAnio(null)">Todas</button>
        ${anios.map(a => `<button class="nt-tagchip${_esAnio === a ? ' on' : ''}" onclick="estudioSetAnio('${_esEsc(a)}')"><span class="nt-tagchip-dot"></span>${_esEsc(a)}</button>`).join('')}
        ${_esHasSinAnio() ? `<button class="nt-tagchip${_esAnio === '' ? ' on' : ''}" onclick="estudioSetAnio('')"><span class="nt-tagchip-dot"></span>Sin año</button>` : ''}
      </div>`
    : '';
  const materias = _esFilteredMaterias();
  const cards = materias.map((m, i) => {
    const pags = _esPagsOf(m.id);
    const preview = pags.slice(0, 3).map(p => `<div class="nt-prev-item">
        <span class="nt-prev-dot"></span>
        <span class="nt-prev-title">${_esEsc(p.titulo || '(sin título)')}</span>
        ${p.texto ? `<span class="nt-prev-snip">${_esEsc(p.texto.slice(0, 80))}</span>` : ''}
      </div>`).join('');
    return `<div class="nt-rect es-card" style="--nt-accent:${ESTUDIO_ACCENT};--d:${i * 80}ms" onclick="estudioOpenMateria('${m.id}')">
      <span class="nt-rect-glow"></span>
      <span class="nt-rect-grid"></span>
      <span class="nt-rect-sweep"></span>
      <span class="nt-rect-3d">
        <div class="nt-rect-head">
          <span class="nt-rect-icon">${ESTUDIO_FOLDER}</span>
          <span class="nt-rect-titles">
            <span class="nt-rect-tag">${(m.anio || '').trim() ? _esEsc(m.anio) : 'SIN AÑO'}</span>
            <span class="nt-rect-label">${_esEsc(m.nombre || '(sin nombre)')}</span>
          </span>
          <span class="es-card-acts">
            <button class="nt-ico" title="Editar materia" onclick="event.stopPropagation();estudioEditMateria('${m.id}')">${ES_EDIT_ICO}</button>
            <button class="nt-ico nt-del" title="Borrar materia" onclick="event.stopPropagation();estudioDeleteMateria('${m.id}')">${ES_DEL_ICO}</button>
            <span class="nt-rect-count">${pags.length}</span>
          </span>
        </div>
        <div class="nt-rect-prev">${preview}</div>
      </span>
    </div>`;
  }).join('');
  const empty = materias.length ? '' : `<div class="nt-empty">${_esMaterias().length ? 'Ninguna materia en este año.' : 'Todavía no hay materias. Creá la primera.'}</div>`;
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${ESTUDIO_ACCENT}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${ESTUDIO_ICON}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">ESTUDIO</span><span class="nt-cat-name">Notas de estudio</span></div>
      <button class="nt-x" title="Volver" onclick="notasHome()">✕</button>
    </div>
    <div class="nt-tools">
      <button class="nt-btn nt-add" onclick="estudioNewMateria()"><span class="nt-add-plus">+</span> Nueva materia</button>
    </div>
    ${chips}
    <div class="nt-rects">${cards}</div>
    ${empty}
  </div>`;
}

// ── Lista de páginas de una materia ──────────────────────────────────────
function _esPaginasView(mid) {
  const m = _esMateria(mid);
  if (!m) { _esView = 'materias'; return _esMateriasView(); }
  const pags = _esFilteredPaginas(mid);
  const cards = pags.map((p, i) => _esPageCard(p, i)).join('');
  const empty = pags.length ? '' : `<div class="nt-empty">${_esPagsOf(mid).length ? 'Sin resultados.' : 'Esta materia no tiene páginas todavía.'}</div>`;
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${ESTUDIO_ACCENT}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${ESTUDIO_FOLDER}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${(m.anio || '').trim() ? _esEsc(m.anio) : 'MATERIA'}</span><span class="nt-cat-name">${_esEsc(m.nombre || '(sin nombre)')}</span></div>
      <button class="nt-x" title="Volver a materias" onclick="estudioShowMaterias()">✕</button>
    </div>
    <div class="nt-tools">
      <div class="nt-search-wrap">
        <svg class="nt-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input class="nt-input nt-search" type="text" placeholder="Buscar página…" value="${_esEsc(_esSearch)}" oninput="estudioOnSearch(this.value)">
      </div>
      <button class="nt-btn nt-sort" onclick="estudioToggleSort()">${_esSort === 'desc' ? '↓ Reciente' : '↑ Antigua'}</button>
      <button class="nt-btn nt-add" onclick="estudioNewPage('${mid}')"><span class="nt-add-plus">+</span> Nueva página</button>
    </div>
    <div class="nt-list">${cards}</div>
    ${empty}
  </div>`;
}

function _esPageCard(p, i) {
  const delay = typeof i === 'number' ? `style="--d:${Math.min(i, 8) * 55}ms"` : '';
  const snip = (p.texto || '').slice(0, 220);
  return `<div class="nt-note" ${delay}>
    <span class="nt-note-edge"></span>
    <div class="nt-note-head">
      <div class="nt-note-ttl">${_esEsc(p.titulo || '(sin título)')}</div>
      <div class="nt-note-acts">
        <button class="nt-ico" title="Abrir / editar" onclick="estudioEditPage('${p.id}')">${ES_EDIT_ICO}</button>
        <button class="nt-ico nt-del" title="Borrar página" onclick="estudioDeletePage('${p.id}')">${ES_DEL_ICO}</button>
      </div>
    </div>
    <div class="nt-note-meta"><span class="nt-note-date">${_esEsc(_esFmtDate(p.fecha))}</span></div>
    ${snip ? `<div class="nt-note-text">${_esEsc(snip)}${(p.texto || '').length > 220 ? '…' : ''}</div>` : ''}
  </div>`;
}

// ── Formulario de materia ────────────────────────────────────────────────
function _esMateriaForm() {
  const editing = _esEditing !== 'mat-new' ? _esMateria(_esEditing.slice(4)) : null;
  const v = editing || {};
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${ESTUDIO_ACCENT}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${ESTUDIO_FOLDER}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${editing ? 'EDITAR' : 'NUEVA'}</span><span class="nt-cat-name">Materia</span></div>
      <button class="nt-x" title="Cancelar" onclick="estudioCancel()">✕</button>
    </div>
    <div class="nt-form">
      <label class="nt-flbl">Nombre de la materia</label>
      <input class="nt-input" id="es-f-first" type="text" value="${_esEsc(v.nombre || '')}" placeholder="Ej: Derecho Civil">
      <label class="nt-flbl">Año</label>
      <input class="nt-input" id="es-f-anio" type="text" list="es-anio-list" value="${_esEsc(v.anio || '')}" placeholder="Ej: 2026, 3er año…">
      <datalist id="es-anio-list">${_esAnios().map(a => `<option value="${_esEsc(a)}"></option>`).join('')}</datalist>
      <div class="nt-form-acts">
        <button class="nt-btn nt-add" onclick="estudioSaveMateria()">Guardar</button>
        <button class="nt-btn" onclick="estudioCancel()">Cancelar</button>
      </div>
    </div>
  </div>`;
}

// ── Formulario de página ─────────────────────────────────────────────────
function _esPageForm() {
  const editing = _esEditing !== 'pag-new' ? _esPaginas().find(p => p.id === _esEditing.slice(4)) : null;
  const v = editing || {};
  const mid = editing ? editing.materiaId : _esPagMateria;
  const m = _esMateria(mid);
  return `<div class="nt-cat nt-cat-anim" style="--nt-accent:${ESTUDIO_ACCENT}">
    <div class="nt-cat-bar">
      <span class="nt-cat-chip">${ESTUDIO_FOLDER}</span>
      <div class="nt-cat-ttl"><span class="nt-cat-tag">${editing ? 'EDITAR' : 'NUEVA'} · ${m ? _esEsc(m.nombre || '') : ''}</span><span class="nt-cat-name">Página</span></div>
      <button class="nt-x" title="Cancelar" onclick="estudioCancelPage()">✕</button>
    </div>
    <div class="nt-form">
      <label class="nt-flbl">Título</label>
      <input class="nt-input" id="es-f-first" type="text" value="${_esEsc(v.titulo || '')}" placeholder="(sin título)">
      <label class="nt-flbl">Anotaciones</label>
      <textarea class="nt-input nt-ta nt-ta-xl" id="es-f-texto" rows="16" placeholder="Escribí tus anotaciones…">${_esEsc(v.texto || '')}</textarea>
      <div class="nt-form-acts">
        <button class="nt-btn nt-add" onclick="estudioSavePage()">Guardar</button>
        <button class="nt-btn" onclick="estudioCancelPage()">Cancelar</button>
      </div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════
// ACCIONES (globales — invocadas desde onclick; re-render vía notasRender)
// ════════════════════════════════════════════════════════════════════════
function estudioOpenHome() { _esView = 'materias'; _esEditing = null; _esAnio = null; _esSearch = ''; if (typeof _ntView !== 'undefined') _ntView = 'estudio'; notasRender(); }
function estudioShowMaterias() { _esView = 'materias'; _esEditing = null; _esSearch = ''; notasRender(); }
function estudioOpenMateria(id) { _esView = id; _esEditing = null; _esSearch = ''; _esSort = 'desc'; notasRender(); }
function estudioSetAnio(a) { _esAnio = a; notasRender(); }
function estudioToggleSort() { _esSort = _esSort === 'desc' ? 'asc' : 'desc'; notasRender(); }
function estudioOnSearch(val) {
  _esSearch = val;
  const l = document.querySelector('#notas-body .nt-list');
  if (l && _esView !== 'materias') l.innerHTML = _esFilteredPaginas(_esView).map((p, i) => _esPageCard(p, i)).join('');
}

function estudioNewMateria() { _esEditing = 'mat-new'; notasRender(); }
function estudioEditMateria(id) { _esEditing = 'mat-' + id; notasRender(); }
function estudioCancel() { _esEditing = null; _esView = 'materias'; notasRender(); }
function estudioSaveMateria() {
  const editing = _esEditing !== 'mat-new' ? _esMateria(_esEditing.slice(4)) : null;
  const data = { nombre: _esVal('es-f-first'), anio: _esVal('es-f-anio') };
  const all = _esMaterias().slice();
  if (editing) { const i = all.findIndex(m => m.id === editing.id); if (i >= 0) all[i] = { ...all[i], ...data }; }
  else { all.push({ id: _esUid(), ...data }); }
  _esPersistM(all);
  _esEditing = null; _esView = 'materias'; notasRender();
}
function estudioDeleteMateria(id) {
  const m = _esMateria(id);
  const n = _esPagsOf(id).length;
  const msg = n ? `¿Borrar la materia "${m ? m.nombre : ''}" y sus ${n} página(s)?` : `¿Borrar la materia "${m ? m.nombre : ''}"?`;
  if (!confirm(msg)) return;
  _esPersistP(_esPaginas().filter(p => p.materiaId !== id));   // cascada: borra páginas de la materia
  _esPersistM(_esMaterias().filter(m2 => m2.id !== id));
  if (_esView === id) _esView = 'materias';
  notasRender();
}

function estudioNewPage(mid) { _esPagMateria = mid; _esEditing = 'pag-new'; notasRender(); }
function estudioEditPage(id) { _esEditing = 'pag-' + id; notasRender(); }
function estudioCancelPage() {
  const editing = _esEditing !== 'pag-new' ? _esPaginas().find(p => p.id === _esEditing.slice(4)) : null;
  const mid = editing ? editing.materiaId : _esPagMateria;
  _esEditing = null; _esView = mid && _esMateria(mid) ? mid : 'materias'; notasRender();
}
function estudioSavePage() {
  const editing = _esEditing !== 'pag-new' ? _esPaginas().find(p => p.id === _esEditing.slice(4)) : null;
  const mid = editing ? editing.materiaId : _esPagMateria;
  const data = { titulo: _esVal('es-f-first'), texto: _esVal('es-f-texto'), fecha: _esToday() };
  const all = _esPaginas().slice();
  if (editing) { const i = all.findIndex(p => p.id === editing.id); if (i >= 0) all[i] = { ...all[i], ...data, fecha: editing.fecha || data.fecha }; }
  else { all.push({ id: _esUid(), materiaId: mid, ...data }); }
  _esPersistP(all);
  _esEditing = null; _esView = mid && _esMateria(mid) ? mid : 'materias'; notasRender();
}
function estudioDeletePage(id) {
  if (!confirm('¿Borrar esta página?')) return;
  _esPersistP(_esPaginas().filter(p => p.id !== id));
  notasRender();
}
