'use strict';
// ════════════════════════════════════════════════════════════════════════
// CURSADA — clases, trabajos prácticos y foros de la cursada de Abogacía.
// Carga en overlay (tipo, materia, título, fecha, hora, recurrencia semanal
// opcional); los pendientes se reflejan en la sección principal como card
// resumen (solo próximos 5 + vencidos, no crece con el tiempo).
// Datos en S.cursada — no toca la lógica de sync.
//
// Recurrencia semanal: NO se generan filas futuras. Al marcar hecho un ítem
// 'weekly' se le corre la fecha +7 días (contador `hechas`) en vez de
// archivarlo. Los ítems 'none' marcados hechos pasan a historial (done:true),
// igual que finales.js.
// ════════════════════════════════════════════════════════════════════════

const Cursada = (() => {
  const TIPOS = {
    clase: { label: 'Clase', icon: '📘', color: 'var(--c-conocimiento)' },
    tp:    { label: 'TP',    icon: '📝', color: 'var(--warn)' },
    foro:  { label: 'Foro',  icon: '💬', color: 'var(--accent)' },
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoy = () => (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));
  const diasRest = fecha => Math.round((new Date(fecha + 'T12:00:00') - new Date(hoy() + 'T12:00:00')) / 86400000);
  const fmtF = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—';
  const notify = m => (typeof showToast === 'function' ? showToast(m) : alert(m));
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  let _editId = null;    // id del ítem en edición dentro del overlay
  let _filtTipo = 'todos'; // filtro de tipo en el overlay

  function ensureCursada() {
    if (!Array.isArray(S.cursada)) S.cursada = [];
    return S.cursada;
  }

  const pendientes = () => ensureCursada().filter(it => !it.done).slice().sort((a, b) => a.fecha === b.fecha ? (a.hora || '').localeCompare(b.hora || '') : a.fecha.localeCompare(b.fecha));
  const historial = () => ensureCursada().filter(it => it.done).slice().sort((a, b) => (b.doneEl || '').localeCompare(a.doneEl || ''));

  function etiqueta(it) {
    const d = diasRest(it.fecha);
    if (d < 0) return `<span style="color:var(--danger);font-weight:700">Vencido</span>`;
    if (d === 0) return `<span style="color:var(--warn);font-weight:700">Hoy</span>`;
    const col = d <= 3 ? 'var(--danger)' : d <= 7 ? 'var(--warn)' : 'var(--tt)';
    return `<span style="color:${col};font-weight:700">en ${d} ${d === 1 ? 'día' : 'días'}</span>`;
  }

  function badge(it) {
    const m = TIPOS[it.tipo] || TIPOS.clase;
    return `<span class="curs-badge" style="--cb:${m.color}">${m.icon} ${m.label}</span>`;
  }

  // ══════════ Apartado en la sección principal ══════════
  function filaCard(it, i) {
    const venc = diasRest(it.fecha) < 0;
    return `<div class="curs-item ${venc ? 'venc' : ''}" style="animation-delay:${i * 60}ms">
      <label class="curs-check" title="Marcar hecho">
        <input type="checkbox" onclick="Cursada.done('${it.id}')">
      </label>
      ${badge(it)}
      <div class="curs-item-main">
        <div class="curs-item-name">${esc(it.materia)}${it.titulo ? ' · ' + esc(it.titulo) : ''}</div>
        <div class="curs-item-meta">${fmtF(it.fecha)}${it.hora ? ' · ' + esc(it.hora) : ''}</div>
      </div>
      <div class="curs-item-est">${etiqueta(it)}</div>
    </div>`;
  }

  function renderPrincipal() {
    const el = document.getElementById('cursada-wrap-conocimiento'); if (!el) return;
    const list = pendientes();
    const vencidos = list.filter(it => diasRest(it.fecha) < 0);
    const proximos = list.filter(it => diasRest(it.fecha) >= 0).slice(0, 5);
    const rows = vencidos.concat(proximos);
    let body;
    if (rows.length) {
      body = '<div class="curs-list">' + rows.map(filaCard).join('') + '</div>';
    } else {
      body = '<div class="empty-state" style="padding:12px 0">Sin clases, TPs ni foros pendientes. Cargalos desde el menú de Conocimiento → Cursada.</div>';
    }
    el.innerHTML = `<div class="card" id="cursada-card"><div class="card-title">📚 Cursada</div>${body}
      <button class="bsum-full" onclick="Cursada.open()">Ver toda la cursada →</button></div>`;
  }

  // ══════════ Overlay ══════════
  function ensureOverlay() {
    if (typeof CMOverlay === 'undefined') return null;
    const { overlay, body } = CMOverlay.build({ id: 'ov-cursada', accent: '#3B82F6' });
    if (!overlay._cuBuilt) {
      body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">CONOCIMIENTO · CURSADA</div><div class="cm-ov-title">Cursada</div></div>
        <div class="cm-ov-host">
          <div id="ov-cursada-form"></div>
          <div class="curs-chips" id="ov-cursada-filters"></div>
          <div id="ov-cursada-list"></div>
        </div>`;
      overlay._cuBuilt = true;
    }
    return overlay;
  }

  function open() {
    const ov = ensureOverlay(); if (!ov) return;
    _editId = null;
    renderForm(); renderFiltros(); renderList();
    CMOverlay.open(ov);
  }

  function renderForm() {
    const el = document.getElementById('ov-cursada-form'); if (!el) return;
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:7px 9px;font-size:var(--fs-12-5);color:inherit';
    el.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <select id="curs-tipo" style="${inp}">${Object.keys(TIPOS).map(k => `<option value="${k}">${TIPOS[k].icon} ${TIPOS[k].label}</option>`).join('')}</select>
        <input id="curs-materia" placeholder="Materia" style="${inp};flex:1;min-width:120px">
        <input id="curs-titulo" placeholder="Título / consigna (opcional)" style="${inp};flex:1;min-width:140px">
        <input id="curs-fecha" type="date" value="${hoy()}" style="${inp}">
        <input id="curs-hora" type="time" style="${inp}">
        <label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-12-5);color:var(--tt);cursor:pointer">
          <input type="checkbox" id="curs-repeat" style="width:14px;height:14px;cursor:pointer"> Se repite todas las semanas
        </label>
        <button class="btn btn-sm" onclick="Cursada.add()">+ Agregar</button>
      </div>`;
  }

  function renderFiltros() {
    const el = document.getElementById('ov-cursada-filters'); if (!el) return;
    const opts = [['todos', 'Todos'], ['clase', 'Clases'], ['tp', 'TPs'], ['foro', 'Foros']];
    el.innerHTML = opts.map(([v, l]) => `<button class="curs-chip ${_filtTipo === v ? 'on' : ''}" aria-pressed="${_filtTipo === v}" onclick="Cursada.setFiltro('${v}')">${l}</button>`).join('');
  }
  function setFiltro(v) { _filtTipo = v; renderFiltros(); renderList(); }

  function filaEdit(it) {
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 8px;font-size:var(--fs-12-5);color:inherit';
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px;border:1px solid var(--c-conocimiento);border-radius:8px;margin-bottom:6px">
      <select id="curs-e-tipo" style="${inp}">${Object.keys(TIPOS).map(k => `<option value="${k}" ${k === it.tipo ? 'selected' : ''}>${TIPOS[k].icon} ${TIPOS[k].label}</option>`).join('')}</select>
      <input id="curs-e-materia" value="${esc(it.materia)}" style="${inp};flex:1;min-width:100px">
      <input id="curs-e-titulo" value="${esc(it.titulo || '')}" placeholder="Título / consigna" style="${inp};flex:1;min-width:120px">
      <input id="curs-e-fecha" type="date" value="${it.fecha}" style="${inp}">
      <input id="curs-e-hora" type="time" value="${it.hora || ''}" style="${inp}">
      <label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-12-5);color:var(--tt);cursor:pointer">
        <input type="checkbox" id="curs-e-repeat" ${it.repeat === 'weekly' ? 'checked' : ''} style="width:13px;height:13px;cursor:pointer"> Semanal
      </label>
      <button class="btn btn-sm" onclick="Cursada.saveEdit('${it.id}')">Guardar</button>
      <button class="btn btn-ghost btn-sm" onclick="Cursada.cancelEdit()">Cancelar</button>
    </div>`;
  }

  function filaActiva(it) {
    if (_editId === it.id) return filaEdit(it);
    const rep = it.repeat === 'weekly' ? `<span style="font-size:var(--fs-12-5);color:var(--tt)"> · 🔁 semanal${it.hechas ? ` (${it.hechas})` : ''}</span>` : '';
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;margin-bottom:6px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:0">
        <input type="checkbox" onclick="Cursada.done('${it.id}')" title="Marcar hecho" style="width:16px;height:16px;cursor:pointer;flex-shrink:0">
        <span style="font-size:var(--fs-12-5)">${badge(it)} <b>${esc(it.materia)}</b>${it.titulo ? ` <span style="color:var(--tt)">· ${esc(it.titulo)}</span>` : ''} <span style="font-size:var(--fs-12-5);color:var(--tt)">· ${fmtF(it.fecha)}${it.hora ? ' ' + esc(it.hora) : ''}${rep}</span></span>
      </label>
      <span style="white-space:nowrap;font-size:var(--fs-12-5)">${etiqueta(it)}
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px" onclick="Cursada.edit('${it.id}')">✎</button>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px;opacity:.6" onclick="Cursada.del('${it.id}')">🗑</button></span>
    </div>`;
  }

  function filaHist(it) {
    if (_editId === it.id) return filaEdit(it);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;font-size:var(--fs-12-5);color:var(--tt);border-bottom:1px solid rgba(255,255,255,.05)">
      <span>✅ ${badge(it)} <b>${esc(it.materia)}</b>${it.titulo ? ` · ${esc(it.titulo)}` : ''} · ${fmtF(it.fecha)}</span>
      <span style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px" onclick="Cursada.edit('${it.id}')" title="Editar / reactivar">✎</button>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px" onclick="Cursada.reactivar('${it.id}')" title="Reactivar">↩</button>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px;opacity:.6" onclick="Cursada.del('${it.id}')">🗑</button></span>
    </div>`;
  }

  function renderList() {
    const el = document.getElementById('ov-cursada-list'); if (!el) return;
    const filt = it => _filtTipo === 'todos' || it.tipo === _filtTipo;
    const act = pendientes().filter(filt), hist = historial().filter(filt);
    el.innerHTML = `
      <div style="font-size:var(--fs-12-5);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin-bottom:6px">Pendientes (${act.length})</div>
      ${act.length ? act.map(filaActiva).join('') : '<div class="empty-state" style="padding:8px 0">Sin ítems cargados.</div>'}
      ${hist.length ? `<div style="font-size:var(--fs-12-5);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin:14px 0 6px">Historial (${hist.length})</div>${hist.map(filaHist).join('')}` : ''}`;
  }

  function refresh() { renderList(); renderPrincipal(); if (typeof refreshRemindersView === 'function') refreshRemindersView('conocimiento'); }

  // ══════════ CRUD ══════════
  function add() {
    const tipo = document.getElementById('curs-tipo')?.value || 'clase';
    const materia = (document.getElementById('curs-materia')?.value || '').trim();
    const titulo = (document.getElementById('curs-titulo')?.value || '').trim();
    const fecha = document.getElementById('curs-fecha')?.value || '';
    const hora = document.getElementById('curs-hora')?.value || '';
    const repeat = document.getElementById('curs-repeat')?.checked ? 'weekly' : 'none';
    if (!materia) { notify('Escribí la materia'); return; }
    if (!fecha) { notify('Elegí la fecha'); return; }
    ensureCursada().push({ id: uid(), tipo, materia, titulo, fecha, hora, repeat, done: false, doneEl: null, hechas: 0, notas: '' });
    saveState();
    document.getElementById('curs-materia').value = '';
    document.getElementById('curs-titulo').value = '';
    notify(`${TIPOS[tipo].icon} Agregado: ` + materia);
    refresh();
  }
  function edit(id) { _editId = id; renderList(); }
  function cancelEdit() { _editId = null; renderList(); }
  function saveEdit(id) {
    const it = ensureCursada().find(x => x.id === id); if (!it) { cancelEdit(); return; }
    const tipo = document.getElementById('curs-e-tipo')?.value || it.tipo;
    const materia = (document.getElementById('curs-e-materia')?.value || '').trim();
    const titulo = (document.getElementById('curs-e-titulo')?.value || '').trim();
    const fecha = document.getElementById('curs-e-fecha')?.value || '';
    const hora = document.getElementById('curs-e-hora')?.value || '';
    const repeat = document.getElementById('curs-e-repeat')?.checked ? 'weekly' : 'none';
    if (!materia) { notify('La materia no puede quedar vacía'); return; }
    if (!fecha) { notify('Elegí una fecha'); return; }
    it.tipo = tipo; it.materia = materia; it.titulo = titulo; it.fecha = fecha; it.hora = hora; it.repeat = repeat;
    // Editar la fecha reactiva un ítem vencido/hecho de una sola vez.
    if (it.done && diasRest(fecha) >= 0) { it.done = false; it.doneEl = null; }
    saveState(); _editId = null;
    notify('✏️ Actualizado');
    refresh();
  }
  function done(id) {
    const it = ensureCursada().find(x => x.id === id); if (!it) return;
    if (it.repeat === 'weekly') {
      it.fecha = addDays(it.fecha, 7);
      it.hechas = (it.hechas || 0) + 1;
      notify(`✅ ${it.materia} → próxima ${fmtF(it.fecha)}`);
    } else {
      it.done = true; it.doneEl = hoy();
      notify('✅ ' + it.materia + ' → historial');
    }
    saveState();
    refresh();
  }
  function reactivar(id) {
    const it = ensureCursada().find(x => x.id === id); if (!it) return;
    it.done = false; it.doneEl = null;
    saveState();
    notify('↩ ' + it.materia + ' reactivado');
    refresh();
  }
  function del(id) {
    const arr = ensureCursada(); const i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    const nombre = arr[i].materia;
    arr.splice(i, 1);
    saveState(); if (_editId === id) _editId = null;
    notify('🗑 ' + nombre + ' eliminado');
    refresh();
  }

  return { ensureCursada, renderPrincipal, open, add, edit, cancelEdit, saveEdit, done, reactivar, del, setFiltro };
})();
window.Cursada = Cursada;
