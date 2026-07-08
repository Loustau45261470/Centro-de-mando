'use strict';
// ════════════════════════════════════════════════════════════════════════
// FINALES — fechas de finales de materias (Conocimiento).
// Carga en overlay (materia, fecha, tipo de examen de lista fija); los activos
// se reflejan en la sección principal como "Materia · días restantes" ordenado
// por urgencia. Vencidos se marcan; el check "done" los pasa a historial.
// Datos en S.sgc.finales — no toca la lógica de sync.
// ════════════════════════════════════════════════════════════════════════

const Finales = (() => {
  const TIPOS = ['Final Escrito', 'Final Oral', 'Final MC', 'Final Mixto'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoy = () => (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));
  const diasRest = fecha => Math.round((new Date(fecha + 'T12:00:00') - new Date(hoy() + 'T12:00:00')) / 86400000);
  const fmtF = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—';
  const notify = m => (typeof showToast === 'function' ? showToast(m) : alert(m));

  let _editId = null;   // id del final en edición dentro del overlay

  function ensureF() {
    if (!S.sgc) S.sgc = {};
    if (!Array.isArray(S.sgc.finales)) S.sgc.finales = [];
    return S.sgc.finales;
  }
  const activos = () => ensureF().filter(f => !f.done).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const historial = () => ensureF().filter(f => f.done).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Etiqueta de días restantes según estado.
  function etiqueta(f) {
    const d = diasRest(f.fecha);
    if (d < 0) return `<span style="color:var(--danger,#FF3B47);font-weight:700">Vencido</span>`;
    if (d === 0) return `<span style="color:var(--warn,#FBBF24);font-weight:700">Hoy</span>`;
    const col = d <= 3 ? 'var(--danger,#FF3B47)' : d <= 7 ? 'var(--warn,#FBBF24)' : 'var(--tt)';
    return `<span style="color:${col};font-weight:700">${d} ${d === 1 ? 'día' : 'días'}</span>`;
  }

  // ══════════ Apartado en la sección principal ══════════
  function renderPrincipal() {
    const el = document.getElementById('finales-wrap-conocimiento'); if (!el) return;
    const list = activos();
    const rows = list.length ? list.map(f => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <span style="font-size:12px"><b>${esc(f.materia)}</b> <span style="font-size:10px;color:var(--tt)">· ${esc(f.tipo)}</span></span>
        <span style="font-size:12px;white-space:nowrap">${etiqueta(f)} <span style="font-size:9px;color:var(--tt)">${fmtF(f.fecha)}</span></span>
      </div>`).join('')
      : '<div class="empty-state" style="padding:10px 0">Sin finales próximos. Cargalos desde el menú de Conocimiento → Finales.</div>';
    el.innerHTML = `<div class="card"><div class="card-title">🎓 Finales <span style="font-size:9px;font-weight:400;color:var(--tt)">días restantes</span></div>${rows}</div>`;
  }

  // ══════════ Overlay ══════════
  function ensureOverlay() {
    if (typeof CMOverlay === 'undefined') return null;
    const { overlay, body } = CMOverlay.build({ id: 'ov-finales', accent: '#6B8EFF' });
    if (!overlay._fBuilt) {
      body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">CONOCIMIENTO · FINALES</div><div class="cm-ov-title">Finales de materias</div></div>
        <div class="cm-ov-host"><div id="ov-finales-form"></div><div id="ov-finales-list"></div></div>`;
      overlay._fBuilt = true;
    }
    return overlay;
  }

  function open() {
    const ov = ensureOverlay(); if (!ov) return;
    _editId = null;
    renderForm(); renderList();
    CMOverlay.open(ov);
  }

  function renderForm() {
    const el = document.getElementById('ov-finales-form'); if (!el) return;
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:7px 9px;font-size:12px;color:inherit';
    el.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <input id="fin-materia" placeholder="Materia" style="${inp};flex:1;min-width:140px">
        <input id="fin-fecha" type="date" value="${hoy()}" style="${inp}">
        <select id="fin-tipo" style="${inp}">${TIPOS.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        <button class="btn btn-sm" onclick="Finales.add()">+ Agregar</button>
      </div>`;
  }

  function filaEdit(f) {
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 8px;font-size:11px;color:inherit';
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px;border:1px solid var(--accent,#6B8EFF);border-radius:8px;margin-bottom:6px">
      <input id="fin-e-materia" value="${esc(f.materia)}" style="${inp};flex:1;min-width:120px">
      <input id="fin-e-fecha" type="date" value="${f.fecha}" style="${inp}">
      <select id="fin-e-tipo" style="${inp}">${TIPOS.map(t => `<option value="${t}" ${t === f.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn btn-sm" onclick="Finales.saveEdit('${f.id}')">Guardar</button>
      <button class="btn btn-ghost btn-sm" onclick="Finales.cancelEdit()">Cancelar</button>
    </div>`;
  }

  function filaActiva(f) {
    if (_editId === f.id) return filaEdit(f);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;margin-bottom:6px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1">
        <input type="checkbox" onclick="Finales.done('${f.id}')" title="Marcar como rendido" style="width:16px;height:16px;cursor:pointer">
        <span style="font-size:12px"><b>${esc(f.materia)}</b> <span style="font-size:10px;color:var(--tt)">· ${esc(f.tipo)} · ${fmtF(f.fecha)}</span></span>
      </label>
      <span style="white-space:nowrap;font-size:12px">${etiqueta(f)}
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px" onclick="Finales.edit('${f.id}')">✎</button>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px;opacity:.6" onclick="Finales.del('${f.id}')">🗑</button></span>
    </div>`;
  }

  function filaHist(f) {
    if (_editId === f.id) return filaEdit(f);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;font-size:11px;color:var(--tt);border-bottom:1px solid rgba(255,255,255,.05)">
      <span>✅ <b>${esc(f.materia)}</b> · ${esc(f.tipo)} · ${fmtF(f.fecha)}</span>
      <span style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px" onclick="Finales.edit('${f.id}')" title="Editar fecha / reactivar">✎</button>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px" onclick="Finales.reactivar('${f.id}')" title="Reactivar">↩</button>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px;opacity:.6" onclick="Finales.del('${f.id}')">🗑</button></span>
    </div>`;
  }

  function renderList() {
    const el = document.getElementById('ov-finales-list'); if (!el) return;
    const act = activos(), hist = historial();
    el.innerHTML = `
      <div style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin-bottom:6px">Activos (${act.length})</div>
      ${act.length ? act.map(filaActiva).join('') : '<div class="empty-state" style="padding:8px 0">Sin finales cargados.</div>'}
      ${hist.length ? `<div style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin:14px 0 6px">Historial (${hist.length})</div>${hist.map(filaHist).join('')}` : ''}`;
  }

  function refresh() { renderList(); renderPrincipal(); }

  // ══════════ CRUD ══════════
  function add() {
    const materia = (document.getElementById('fin-materia')?.value || '').trim();
    const fecha = document.getElementById('fin-fecha')?.value || '';
    const tipo = document.getElementById('fin-tipo')?.value || TIPOS[0];
    if (!materia) { notify('Escribí el nombre de la materia'); return; }
    if (!fecha) { notify('Elegí la fecha del final'); return; }
    ensureF().push({ id: uid(), materia, fecha, tipo, done: false, doneEl: null });
    saveState();
    document.getElementById('fin-materia').value = '';
    notify('🎓 Final agregado: ' + materia);
    refresh();
  }
  function edit(id) { _editId = id; renderList(); }
  function cancelEdit() { _editId = null; renderList(); }
  function saveEdit(id) {
    const f = ensureF().find(x => x.id === id); if (!f) { cancelEdit(); return; }
    const materia = (document.getElementById('fin-e-materia')?.value || '').trim();
    const fecha = document.getElementById('fin-e-fecha')?.value || '';
    const tipo = document.getElementById('fin-e-tipo')?.value || f.tipo;
    if (!materia) { notify('La materia no puede quedar vacía'); return; }
    if (!fecha) { notify('Elegí una fecha'); return; }
    f.materia = materia; f.fecha = fecha; f.tipo = tipo;
    // Editar la fecha reactiva un final vencido/rendido.
    if (f.done && diasRest(fecha) >= 0) { f.done = false; f.doneEl = null; }
    saveState(); _editId = null;
    notify('✏️ Final actualizado');
    refresh();
  }
  function done(id) {
    const f = ensureF().find(x => x.id === id); if (!f) return;
    f.done = true; f.doneEl = hoy();
    saveState();
    notify('✅ ' + f.materia + ' → historial');
    refresh();
  }
  function reactivar(id) {
    const f = ensureF().find(x => x.id === id); if (!f) return;
    f.done = false; f.doneEl = null;
    saveState();
    notify('↩ ' + f.materia + ' reactivado');
    refresh();
  }
  function del(id) {
    const arr = ensureF(); const i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    const nombre = arr[i].materia;
    arr.splice(i, 1);
    saveState(); if (_editId === id) _editId = null;
    notify('🗑 ' + nombre + ' eliminado');
    refresh();
  }

  return { renderPrincipal, open, add, edit, cancelEdit, saveEdit, done, reactivar, del };
})();
window.Finales = Finales;
window.openFinalesOverlay = Finales.open;
