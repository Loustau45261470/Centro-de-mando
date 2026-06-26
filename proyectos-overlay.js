'use strict';
// ════════════════════════════════════════════════════════════════════════
// PROYECTOS OVERLAY — navegador inmersivo drill-down (estilo Notas).
// Cada carpeta/subcarpeta/tarea abre su propia vista completa:
//   Título (grande) · Detalles · Subcarpetas (sección) · Tareas (sección)
// Comparte datos con el árbol inline vía window.Proyectos (app.js).
// ════════════════════════════════════════════════════════════════════════

const _poEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PO_ICONS = {
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h3.4a2 2 0 0 1 1.4.6L11 7h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 11h18"/></svg>`,
  task: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l2.5 2.5L17 8"/><rect x="3.5" y="3.5" width="17" height="17" rx="4"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  chev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
};
const PO_ACCENT = '#38BDF8';

let _poTab = 'conocimiento';
let _poPath = [];   // ids desde la raíz hasta el nodo actual

// ── Datos ────────────────────────────────────────────────────────────────
function _poTree() { return (window.Proyectos && window.Proyectos.get(_poTab)) || []; }
function _poSave() { if (window.Proyectos) window.Proyectos.save(_poTab); }
function _poIsFolder(n) {
  if (n.tipo) return n.tipo === 'carpeta';
  if (n.children && n.children.length) return true;
  return /[📁📂🗂💡🚀🎯📋💼📌🔖]/.test(n.icon || '');
}
// Resuelve el nodo actual según _poPath. Raíz (path vacío) → null (sus "hijos" = árbol).
function _poResolve() {
  let list = _poTree(), node = null;
  for (const id of _poPath) {
    const found = (list || []).find(n => n.id === id);
    if (!found) { _poPath = _poPath.slice(0, _poPath.indexOf(id)); break; }
    node = found; list = node.children || [];
  }
  return { node, children: node ? (node.children || []) : _poTree() };
}
function _poCount(n) {
  const ch = n.children || [];
  return { sub: ch.filter(_poIsFolder).length, task: ch.filter(c => !_poIsFolder(c)).length };
}

// ── Apertura ───────────────────────────────────────────────────────────────
const ProyectosOverlay = {
  open(tab) {
    if (!window.Proyectos) { if (typeof showToast === 'function') showToast('Proyectos no disponible'); return; }
    _poTab = tab || 'conocimiento'; _poPath = [];
    const { overlay } = CMOverlay.build({ id: 'proy-overlay', accent: PO_ACCENT, onClose: () => { _poPath = []; } });
    _poRender();
    CMOverlay.open(overlay);
  },
};
window.ProyectosOverlay = ProyectosOverlay;

// ── Render ─────────────────────────────────────────────────────────────────
function _poRender() {
  const ov = document.getElementById('proy-overlay'); if (!ov) return;
  const body = ov.querySelector('.cm-ov-body'); if (!body) return;
  const { node, children } = _poResolve();
  body.innerHTML = node ? _poRenderNode(node, children) : _poRenderRoot(children);
}

function _poBreadcrumb() {
  if (!_poPath.length) return '';
  const crumbs = []; let list = _poTree();
  crumbs.push(`<button class="po-crumb" onclick="poGoto(-1)">Proyectos</button>`);
  _poPath.forEach((id, i) => {
    const n = (list || []).find(x => x.id === id); if (!n) return;
    crumbs.push(`<span class="po-crumb-sep">${PO_ICONS.chev}</span><button class="po-crumb${i === _poPath.length - 1 ? ' on' : ''}" onclick="poGoto(${i})">${_poEsc(n.label)}</button>`);
    list = n.children || [];
  });
  return `<div class="po-crumbs">${crumbs.join('')}</div>`;
}

// Raíz: lista de proyectos (carpetas de primer nivel)
function _poRenderRoot(children) {
  const cards = children.map((n, i) => _poFolderCard(n, i)).join('');
  return `<div class="cm-ov-head">
      <div class="cm-ov-eyebrow">CONOCIMIENTO · PROYECTOS</div>
      <div class="cm-ov-title">Proyectos</div>
    </div>
    <div class="po-sec">
      <div class="po-sec-h"><span>Proyectos</span><button class="po-add" onclick="poAddChild(true)">${PO_ICONS.plus} Nuevo</button></div>
      <div class="po-grid">${cards || _poEmpty('Sin proyectos todavía')}</div>
    </div>`;
}

// Vista de un nodo (carpeta o tarea): título, detalles, subcarpetas, tareas
function _poRenderNode(node, children) {
  const subs = children.filter(_poIsFolder);
  const tasks = children.filter(c => !_poIsFolder(c));
  const isFolder = _poIsFolder(node);
  return `${_poBreadcrumb()}
    <div class="po-view" style="--po-accent:${isFolder ? PO_ACCENT : '#818CF8'}">
      <button class="po-back" onclick="poBack()">${PO_ICONS.back} Atrás</button>
      <div class="po-titlewrap">
        <span class="po-titleico">${isFolder ? PO_ICONS.folder : PO_ICONS.task}</span>
        <input class="po-title" value="${_poEsc(node.label)}" placeholder="Sin título"
          onchange="poSaveTitle(this.value)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <label class="po-flbl">Detalles</label>
      <textarea class="po-details" rows="3" placeholder="Descripción, objetivo, contexto…" onchange="poSaveDetails(this.value)">${_poEsc(node.description || '')}</textarea>

      <div class="po-sec">
        <div class="po-sec-h"><span>Subcarpetas</span><button class="po-add" onclick="poAddChild(true)">${PO_ICONS.plus} Subcarpeta</button></div>
        <div class="po-grid">${subs.map((n, i) => _poFolderCard(n, i)).join('') || _poEmpty('Sin subcarpetas')}</div>
      </div>

      <div class="po-sec">
        <div class="po-sec-h"><span>Tareas</span><button class="po-add" onclick="poAddChild(false)">${PO_ICONS.plus} Tarea</button></div>
        <div class="po-tasks">${tasks.map(_poTaskRow).join('') || _poEmpty('Sin tareas')}</div>
      </div>

      <button class="po-del" onclick="poDelCurrent()">Eliminar ${isFolder ? 'carpeta' : 'tarea'}</button>
    </div>`;
}

function _poFolderCard(n, i) {
  const c = _poCount(n);
  const meta = [c.sub ? `${c.sub} sub` : '', c.task ? `${c.task} tareas` : ''].filter(Boolean).join(' · ');
  return `<button class="po-card" style="--d:${Math.min(i, 8) * 45}ms" onclick="poDrill('${n.id}')">
    <span class="po-card-ico">${PO_ICONS.folder}</span>
    <span class="po-card-body">
      <span class="po-card-ttl">${_poEsc(n.label || '(sin título)')}</span>
      <span class="po-card-meta">${meta || 'Vacía'}</span>
    </span>
    <span class="po-card-chev">${PO_ICONS.chev}</span>
  </button>`;
}

function _poTaskRow(n) {
  const has = (n.children || []).length;
  return `<div class="po-task${n.done ? ' done' : ''}">
    <button class="po-check" onclick="poToggleDone('${n.id}')" aria-label="Completar">${n.done ? PO_ICONS.task : ''}</button>
    <button class="po-task-main" onclick="poDrill('${n.id}')">
      <span class="po-task-ttl">${_poEsc(n.label || '(sin título)')}</span>
      ${has ? `<span class="po-task-sub">${has} item${has > 1 ? 's' : ''}</span>` : ''}
    </button>
    <span class="po-task-chev">${PO_ICONS.chev}</span>
  </div>`;
}
function _poEmpty(txt) { return `<div class="po-empty">${txt}</div>`; }

// ── Acciones ─────────────────────────────────────────────────────────────
function poDrill(id) { _poPath = _poPath.concat(id); _poRender(); }
function poBack() { _poPath = _poPath.slice(0, -1); _poRender(); }
function poGoto(i) { _poPath = i < 0 ? [] : _poPath.slice(0, i + 1); _poRender(); }

function poAddChild(isFolder) {
  const { node } = _poResolve();
  const n = window.Proyectos.newNode(isFolder ? 'Nueva carpeta' : 'Nueva tarea', isFolder);
  if (node) { if (!node.children) node.children = []; node.children.push(n); }
  else { _poTree().push(n); }
  _poSave(); _poRender();
}
function poToggleDone(id) {
  const { children } = _poResolve();
  const n = children.find(c => c.id === id); if (!n) return;
  n.done = !n.done; if (n.done) n.progress = 100;
  _poSave(); _poRender();
}
function poSaveTitle(val) {
  const { node } = _poResolve(); if (!node) return;
  node.label = (val || '').trim(); _poSave();
}
function poSaveDetails(val) {
  const { node } = _poResolve(); if (!node) return;
  node.description = (val || '').trim(); _poSave();
}
function poDelCurrent() {
  const { node } = _poResolve(); if (!node) return;
  if (!confirm(`¿Eliminar "${node.label}" y todo su contenido?`)) return;
  const id = node.id;
  poBack();
  window.Proyectos.removeById(_poTab, id);
  _poRender();
}
