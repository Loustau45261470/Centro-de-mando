'use strict';
// ════════════════════════════════════════════════════════════════════════
// FINALES — fechas de finales de materias (Conocimiento).
// Carga en overlay (materia, fecha, tipo de examen de lista fija); los activos
// se reflejan en la sección principal como "Materia · días restantes" ordenado
// por urgencia. Vencidos se marcan; el check "done" los pasa a historial.
// La materia se elige del plan de carrera (S.lawProgress, no aprobadas) y se guarda
// con `subjectId`; al aprobar el final se pide la nota y se marca la materia en la
// carrera. "Otra (escribir)" deja el texto libre de siempre.
// Datos en S.sgc.finales — no toca la lógica de sync.
// ════════════════════════════════════════════════════════════════════════

const Finales = (() => {
  const TIPOS = ['Final Escrito', 'Final Oral', 'Final MC', 'Final Mixto'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoy = () => (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));
  const diasRest = fecha => Math.round((new Date(fecha + 'T12:00:00') - new Date(hoy() + 'T12:00:00')) / 86400000);
  const fmtF = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—';
  const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const fmtHoras = h => (Math.round(h * 10) / 10).toString().replace('.', ',');
  const notify = m => (typeof showToast === 'function' ? showToast(m) : alert(m));

  let _editId = null;   // id del final en edición dentro del overlay
  let _notaId = null;   // id del final que espera la nota en el modal

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
  const OTRA = '__otra';

  // Materias del plan de carrera (todas, con `done`); [] si el plan no está disponible.
  const plan = () => (window.Correlativas && Correlativas.materiasDelPlan) ? Correlativas.materiasDelPlan(false) : [];

  // Materia del plan a la que apunta un final: por subjectId, o (finales viejos) por nombre
  // exacto normalizado (tildes/mayúsculas). null si no coincide — el final sigue como texto libre.
  function subjectIdDe(f) {
    if (!f) return null;
    const mats = plan();
    if (f.subjectId && mats.some(m => m.id === f.subjectId)) return f.subjectId;
    const n = norm(f.materia);
    if (!n) return null;
    const m = mats.find(x => norm(x.name) === n);
    return m ? m.id : null;
  }

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
  // Bloque de conteo (número-héroe de días o badge VENCIDO) según urgencia.
  function conteo(d) {
    if (d < 0) return { urgent: true, html: `<span class="fin-venc-badge">VENCIDO</span>` };
    const isUrgent = d <= 3;
    const cd = d === 0 || d <= 3 ? 'var(--danger)' : d <= 7 ? 'var(--warn)' : 'var(--ts, #8BA5C0)';
    const glow = isUrgent ? 'rgba(255,51,88,.5)' : d <= 7 ? 'rgba(245,166,35,.4)' : 'transparent';
    const num = d === 0 ? 'HOY' : d;
    const lbl = d === 0 ? '' : `<div class="fin-count-lbl">${d === 1 ? 'día' : 'días'}</div>`;
    return { urgent: isUrgent || d === 0, html: `<div class="fin-count-num" style="--cd:${cd};--cd-glow:${glow}">${num}</div>${lbl}` };
  }

  function renderPrincipal() {
    const el = document.getElementById('finales-wrap-conocimiento'); if (!el) return;
    const list = activos();
    let rows;
    if (list.length) {
      const desde = addDias(hoy(), -29);
      rows = '<div class="fin-list">' + list.map((f, i) => {
        const c = conteo(diasRest(f.fecha));
        const sid = subjectIdDe(f);
        const horas = (sid && window.Pomodoro) ? Pomodoro.horasPorMateria(sid, desde, hoy()) : null;
        const estudio = horas == null ? '' : `<div class="fin-item-estudio">${fmtHoras(horas)} h estudiadas (últimos 30 días)</div>`;
        return `<div class="fin-item ${c.urgent ? 'urgent' : ''}" style="animation-delay:${i * 60}ms">
          <div class="fin-item-main">
            <div class="fin-item-name">${esc(f.materia)}</div>
            <div class="fin-item-meta"><span class="fin-tipo-badge">${esc(f.tipo)}</span><span>${fmtF(f.fecha)}</span></div>
            ${estudio}
          </div>
          <div class="fin-count">${c.html}</div>
        </div>`;
      }).join('') + '</div>';
    } else {
      rows = '<div class="empty-state" style="padding:12px 0">Sin finales próximos. Cargalos desde el menú de Conocimiento → Finales.</div>';
    }
    el.innerHTML = `<div class="card"><div class="card-title">🎓 Finales <span style="font-size:var(--fs-12-5);font-weight:400;color:var(--tt)">días restantes</span></div>${rows}</div>`;
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
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:7px 9px;font-size:var(--fs-12-5);color:inherit';
    el.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        ${selectorMateria('fin', null, '', inp)}
        <input id="fin-fecha" type="date" value="${hoy()}" style="${inp}">
        <select id="fin-tipo" style="${inp}">${TIPOS.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        <button class="btn btn-sm" onclick="Finales.add()">+ Agregar</button>
      </div>`;
  }

  // Selector de materia (plan no aprobado, ordenado por año) + "Otra (escribir)" con texto libre.
  // `sid` = materia actual (se mantiene en la lista aunque ya esté aprobada). Sin plan → solo texto.
  function selectorMateria(pre, sid, texto, inp) {
    const mats = plan().filter(m => !m.done || m.id === sid);
    if (!mats.length) return `<input id="${pre}-materia" value="${esc(texto)}" placeholder="Materia" style="${inp};flex:1;min-width:140px">`;
    const otra = !sid && !!texto;
    const grupos = [];
    mats.forEach(m => {
      let g = grupos.find(x => x.anio === m.anio);
      if (!g) { g = { anio: m.anio, label: m.yearLabel, items: [] }; grupos.push(g); }
      g.items.push(m);
    });
    const opts = grupos.map(g => `<optgroup label="${esc(g.label)}">${g.items.map(m => `<option value="${esc(m.id)}" ${m.id === sid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
    return `<select id="${pre}-materia-sel" onchange="Finales.onSelMateria('${pre}')" aria-label="Materia" style="${inp};flex:1;min-width:140px;max-width:100%">
        <option value="" ${!sid && !otra ? 'selected' : ''}>Elegí la materia…</option>${opts}<option value="${OTRA}" ${otra ? 'selected' : ''}>Otra (escribir)</option>
      </select>
      <input id="${pre}-materia" value="${esc(texto)}" placeholder="Nombre de la materia" style="${inp};flex:1;min-width:140px;${otra ? '' : 'display:none'}">`;
  }
  function onSelMateria(pre) {
    const sel = document.getElementById(pre + '-materia-sel'), txt = document.getElementById(pre + '-materia');
    if (!sel || !txt) return;
    txt.style.display = sel.value === OTRA ? '' : 'none';
    if (sel.value === OTRA) txt.focus();
  }
  // Lee el selector: { materia, subjectId } o null si falta elegir (ya avisó).
  function leerMateria(pre) {
    const sel = document.getElementById(pre + '-materia-sel');
    const texto = (document.getElementById(pre + '-materia')?.value || '').trim();
    if (sel && sel.value && sel.value !== OTRA) {
      const m = plan().find(x => x.id === sel.value);
      if (m) return { materia: m.name, subjectId: m.id };
    }
    if (sel && !sel.value) { notify('Elegí la materia'); return null; }
    if (!texto) { notify(pre === 'fin' ? 'Escribí el nombre de la materia' : 'La materia no puede quedar vacía'); return null; }
    return { materia: texto, subjectId: subjectIdDe({ materia: texto }) };
  }

  function filaEdit(f) {
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 8px;font-size:var(--fs-12-5);color:inherit';
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px;border:1px solid var(--accent,#6B8EFF);border-radius:8px;margin-bottom:6px">
      ${selectorMateria('fin-e', subjectIdDe(f), f.materia, inp)}
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
        <span style="font-size:var(--fs-12-5)"><b>${esc(f.materia)}</b> <span style="font-size:var(--fs-12-5);color:var(--tt)">· ${esc(f.tipo)} · ${fmtF(f.fecha)}</span></span>
      </label>
      <span style="white-space:nowrap;font-size:var(--fs-12-5)">${etiqueta(f)}
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px" onclick="Finales.edit('${f.id}')">✎</button>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px;opacity:.6" onclick="Finales.del('${f.id}')">🗑</button></span>
    </div>`;
  }

  function filaHist(f) {
    if (_editId === f.id) return filaEdit(f);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;font-size:var(--fs-12-5);color:var(--tt);border-bottom:1px solid rgba(255,255,255,.05)">
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
      <div style="font-size:var(--fs-12-5);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin-bottom:6px">Activos (${act.length})</div>
      ${act.length ? act.map(filaActiva).join('') : '<div class="empty-state" style="padding:8px 0">Sin finales cargados.</div>'}
      ${hist.length ? `<div style="font-size:var(--fs-12-5);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin:14px 0 6px">Historial (${hist.length})</div>${hist.map(filaHist).join('')}` : ''}`;
  }

  function refresh() { renderList(); renderPrincipal(); if (typeof refreshRemindersView === 'function') refreshRemindersView('conocimiento'); }

  // ══════════ CRUD ══════════
  function add() {
    const fecha = document.getElementById('fin-fecha')?.value || '';
    const tipo = document.getElementById('fin-tipo')?.value || TIPOS[0];
    const m = leerMateria('fin'); if (!m) return;
    if (!fecha) { notify('Elegí la fecha del final'); return; }
    ensureF().push({ id: uid(), materia: m.materia, subjectId: m.subjectId, fecha, tipo, done: false, doneEl: null });
    saveState();
    notify('🎓 Final agregado: ' + m.materia);
    renderForm(); // limpia el formulario
    refresh();
  }
  function edit(id) { _editId = id; renderList(); }
  function cancelEdit() { _editId = null; renderList(); }
  function saveEdit(id) {
    const f = ensureF().find(x => x.id === id); if (!f) { cancelEdit(); return; }
    const fecha = document.getElementById('fin-e-fecha')?.value || '';
    const tipo = document.getElementById('fin-e-tipo')?.value || f.tipo;
    const m = leerMateria('fin-e'); if (!m) return;
    if (!fecha) { notify('Elegí una fecha'); return; }
    f.materia = m.materia; f.subjectId = m.subjectId; f.fecha = fecha; f.tipo = tipo;
    // Editar la fecha reactiva un final vencido/rendido.
    if (f.done && diasRest(fecha) >= 0) { f.done = false; f.doneEl = null; }
    saveState(); _editId = null;
    notify('✏️ Final actualizado');
    refresh();
  }
  // Pasa el final al historial. `aviso` reemplaza al toast por defecto.
  function cerrar(f, aviso) {
    f.done = true; f.doneEl = hoy();
    saveState();
    notify(aviso || ('✅ ' + f.materia + ' → historial'));
    refresh();
  }
  // Final con materia del plan todavía no aprobada → pide la nota (modal); si no, solo historial.
  function done(id) {
    const f = ensureF().find(x => x.id === id); if (!f || f.done) return;
    const sid = subjectIdDe(f);
    const m = sid && plan().find(x => x.id === sid);
    if (m && !m.done) { pedirNota(f, m); return; }
    cerrar(f);
  }

  // ── Modal de nota (reusa .modal-overlay/.modal; z-index por encima de los overlays) ──
  function pedirNota(f, m) {
    let ov = document.getElementById('modal-final-nota');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'modal-overlay'; ov.id = 'modal-final-nota';
      ov.addEventListener('click', e => { if (e.target === ov) notaMasTarde(); });
      document.body.appendChild(ov);
    }
    _notaId = f.id;
    ov.innerHTML = `<div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">${esc(m.name)}</div>
      <div class="field"><label>Si aprobaste, ¿con qué nota? (1 a 10)</label>
        <input class="inp" id="fin-nota" type="number" inputmode="decimal" min="1" max="10" step="0.5" placeholder="Ej: 8" onkeydown="if(event.key==='Enter')Finales.notaGuardar()"></div>
      <div class="modal-actions" style="flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="Finales.notaMasTarde()">Sin cargar nota</button>
        <button class="btn btn-ghost" onclick="Finales.notaDesaprobe()">Desaprobé / no rendí</button>
        <button class="btn btn-primary" onclick="Finales.notaGuardar()">Guardar nota</button>
      </div>
    </div>`;
    ov.classList.add('open');
    setTimeout(() => document.getElementById('fin-nota')?.focus(), 50);
  }
  function cerrarModalNota() {
    document.getElementById('modal-final-nota')?.classList.remove('open');
    const id = _notaId; _notaId = null;
    return ensureF().find(x => x.id === id);
  }
  function notaGuardar() {
    const f = ensureF().find(x => x.id === _notaId); if (!f) { cerrarModalNota(); return; }
    const n = parseFloat(String(document.getElementById('fin-nota')?.value || '').replace(',', '.'));
    if (isNaN(n) || n < 1 || n > 10) { notify('Poné una nota entre 1 y 10'); return; }
    const sid = subjectIdDe(f);
    cerrarModalNota();
    if (!sid || !Correlativas.aprobarMateria(sid, n)) { cerrar(f); return; }
    f.subjectId = sid;
    cerrar(f, '🎓 ' + f.materia + ' aprobada con ' + (Math.round(n * 10) / 10) + ' → carrera actualizada');
  }
  // Sin nota o desaprobado: el final pasa al historial y la carrera no se toca.
  function notaMasTarde() {
    const f = cerrarModalNota(); if (!f) return;
    cerrar(f, '✅ ' + f.materia + ' → historial (la carrera no se tocó; cargala desde el plan)');
  }
  function notaDesaprobe() {
    const f = cerrarModalNota(); if (!f) return;
    cerrar(f, '✅ ' + f.materia + ' → historial (sin cambios en la carrera)');
  }
  function reactivar(id) {
    const f = ensureF().find(x => x.id === id); if (!f) return;
    f.done = false; f.doneEl = null;
    saveState();
    notify('↩ ' + f.materia + ' reactivado (si ya figura aprobada en la carrera, se cambia desde el plan)');
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

  return { renderPrincipal, open, add, edit, cancelEdit, saveEdit, done, reactivar, del, onSelMateria, subjectIdDe, notaGuardar, notaMasTarde, notaDesaprobe, activos };
})();
window.Finales = Finales;
window.openFinalesOverlay = Finales.open;
