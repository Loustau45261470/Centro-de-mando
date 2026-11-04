'use strict';
// ════════════════════════════════════════════════════════════════════════
// FINALES — fechas de finales de materias (Conocimiento).
// Carga en overlay (materia, fecha, tipo de examen de lista fija); los activos
// se reflejan en la sección principal como "Materia · días restantes" ordenado
// por urgencia. Vencidos se marcan; el check "done" los pasa a historial.
// La materia se elige del plan de carrera (S.lawProgress, no aprobadas) y se guarda
// con `subjectId`; al aprobar el final se pide la nota y se marca la materia en la
// carrera. "Otra (escribir)" deja el texto libre de siempre.
// Plan de estudio por final (f.plan): bloques en el planner hasta el día antes, progreso con el Pomodoro y "Reacomodar".
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

  // ══════════ Plan de estudio ══════════
  // f.plan = { horasSemana, dias:[0-6, 0=domingo], hora:'HH:MM', creado:'YYYY-MM-DD', totalHoras, ajuste?, faltan? }.
  // Los bloques viven en el planner (S.dayPlan) marcados con `studyPlan: f.id`; nunca se tocan otras actividades.
  // `ajuste` = { fecha, estudiadas } lo deja "Reacomodar": lo atrasado hasta ese día ya se repartió de nuevo.
  const TOPE_DIA_MIN = 360;   // tope por día al reacomodar: 6 h
  const DIAS_PLAN = [['L', 1], ['M', 2], ['X', 3], ['J', 4], ['V', 5], ['S', 6], ['D', 0]];
  const dow = iso => new Date(iso + 'T12:00:00').getDay();
  const plannerOk = () => typeof getDayPlan === 'function' && typeof _pid === 'function' && typeof _timeToMin === 'function';
  const refrescarPlanner = () => { if (typeof renderDayPlanner === 'function') renderDayPlanner(); };

  // Bloques del plan de un final, ordenados por fecha: [{ date, duration, task }]
  function bloquesDe(f) {
    const out = [];
    Object.keys(S.dayPlan || {}).forEach(date => {
      ((S.dayPlan[date] || {}).tasks || []).forEach(t => { if (t.studyPlan === f.id) out.push({ date, duration: t.duration || 30, task: t }); });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  // Borra los bloques del plan de ese final desde `desde` (inclusive) en adelante; limpia días que quedan vacíos.
  function borrarBloques(f, desde) {
    Object.keys(S.dayPlan || {}).forEach(date => {
      if (date < desde) return;
      const d = S.dayPlan[date]; if (!d || !Array.isArray(d.tasks)) return;
      const antes = d.tasks.length;
      d.tasks = d.tasks.filter(t => t.studyPlan !== f.id);
      if (d.tasks.length !== antes && !d.tasks.length && Object.keys(d).every(k => k === 'tasks')) delete S.dayPlan[date];
    });
  }
  function horaPasada(hora) {
    const n = new Date();
    return _timeToMin(hora) <= n.getHours() * 60 + n.getMinutes();
  }
  // Días del plan desde hoy hasta el día antes del final (hoy solo si la hora de inicio todavía no pasó).
  function fechasPlan(f, p) {
    const out = [], ult = addDias(f.fecha, -1);
    for (let d = hoy(), n = 0; d <= ult && n < 800; d = addDias(d, 1), n++) {
      if (!p.dias.includes(dow(d))) continue;
      if (d === hoy() && horaPasada(p.hora)) continue;
      out.push(d);
    }
    return out;
  }
  // Un bloque por fecha, con su duración en minutos (múltiplos de 5); el inicio se corre si no entra antes de medianoche.
  function crearBloques(f, p, fechas, mins) {
    const t0 = _timeToMin(p.hora);
    fechas.forEach((date, i) => {
      const dur = mins[i]; if (!(dur >= 5)) return;
      const ini = Math.max(PCAL_START_MIN, Math.min(t0, PCAL_END_MIN - dur));
      getDayPlan(date).tasks.push({ id: _pid(), text: 'Estudiar ' + f.materia, area: 'conocimiento', priority: 2, time: _minToTime(ini), duration: dur, habit: null, done: false, studyPlan: f.id });
    });
  }
  // Horas estudiadas desde que arrancó el plan vs. las que tocaba llevar hasta ayer.
  function progreso(f) {
    const p = f.plan, h = hoy(), sid = subjectIdDe(f);
    const est = (sid && window.Pomodoro) ? Pomodoro.horasPorMateria(sid, p.creado, h) : 0;
    const base = p.ajuste || { fecha: p.creado, estudiadas: 0 };
    const esp = base.estudiadas + bloquesDe(f).filter(b => b.date >= base.fecha && b.date < h).reduce((a, b) => a + b.duration / 60, 0);
    return { sid, est, esp, atraso: esp - est };
  }

  function planHtml(f) {
    const p = f.plan;
    if (!p) return `<div class="fin-item-plan"><button class="btn btn-ghost btn-sm" onclick="Finales.planAbrir('${f.id}')">Armar plan de estudio</button></div>`;
    const pr = progreso(f);
    let estado;
    if (!pr.sid) estado = `<span class="fin-plan-aviso">Registrá el estudio con el Pomodoro eligiendo la materia</span>`;
    else if (pr.atraso > 0.5) estado = `<span class="fin-plan-atraso">Vas ${fmtHoras(pr.atraso)} h atrasado</span> · <button class="btn btn-ghost btn-sm" onclick="Finales.reacomodar('${f.id}')">Reacomodar</button>`;
    else estado = `<span class="fin-plan-ok">Vas al día · ${fmtHoras(pr.est)} de ${fmtHoras(p.totalHoras)} h</span>`;
    const falta = p.faltan > 0 ? `<div class="fin-plan-atraso">No te alcanza el tiempo: faltan ${fmtHoras(p.faltan)} h. Sumá días u horas por semana</div>` : '';
    return `<div class="fin-item-plan"><div>${estado} <button class="btn btn-ghost btn-sm" onclick="Finales.planAbrir('${f.id}')">Plan de estudio</button></div>${falta}</div>`;
  }

  function planAbrir(id) {
    const f = ensureF().find(x => x.id === id); if (!f) return;
    const p = f.plan || { horasSemana: '', dias: [1, 2, 3, 4, 5], hora: '18:00' };
    let ov = document.getElementById('modal-plan-estudio');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'modal-overlay'; ov.id = 'modal-plan-estudio';
      ov.addEventListener('click', e => { if (e.target === ov) planCerrar(); });
      document.body.appendChild(ov);
    }
    ov.dataset.id = id;
    ov.innerHTML = `<div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">Plan de estudio · ${esc(f.materia)}</div>
      <div class="field"><label>Horas por semana</label>
        <input class="inp" id="plan-horas" type="number" inputmode="decimal" min="0.5" max="40" step="0.5" placeholder="Ej: 6" value="${esc(p.horasSemana)}"></div>
      <div class="field"><label>Días disponibles</label>
        <div class="fin-plan-dias">${DIAS_PLAN.map(([l, n]) => `<label class="fin-plan-dia"><input type="checkbox" value="${n}" ${p.dias.includes(n) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <div class="field"><label>Hora de inicio</label>
        <input class="inp" id="plan-hora" type="time" value="${esc(p.hora)}"></div>
      <div class="modal-actions" style="flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="Finales.planCerrar()">Cancelar</button>
        ${f.plan ? `<button class="btn btn-ghost" onclick="Finales.planBorrar('${f.id}')">Borrar plan</button>` : ''}
        <button class="btn btn-primary" onclick="Finales.planGuardar()">Guardar plan</button>
      </div>
    </div>`;
    ov.classList.add('open');
  }
  function planCerrar() { document.getElementById('modal-plan-estudio')?.classList.remove('open'); }

  function planGuardar() {
    const ov = document.getElementById('modal-plan-estudio'); if (!ov) return;
    const f = ensureF().find(x => x.id === ov.dataset.id); if (!f) { planCerrar(); return; }
    if (!plannerOk()) { notify('El planificador no está disponible'); return; }
    const horasSemana = parseFloat(String(document.getElementById('plan-horas')?.value || '').replace(',', '.'));
    const dias = Array.from(ov.querySelectorAll('.fin-plan-dias input:checked')).map(i => parseInt(i.value, 10));
    const hora = document.getElementById('plan-hora')?.value || '';
    if (!(horasSemana > 0) || horasSemana > 40) { notify('Poné las horas por semana (entre 0,5 y 40)'); return; }
    if (!dias.length) { notify('Elegí al menos un día'); return; }
    if (!/^\d{2}:\d{2}$/.test(hora)) { notify('Elegí la hora de inicio'); return; }
    const dEnd = diasRest(f.fecha);
    if (dEnd < 1) { notify('El final es hoy o ya pasó: no queda ningún día para estudiar'); return; }
    const p = { horasSemana: Math.round(horasSemana * 10) / 10, dias, hora, creado: hoy(), totalHoras: Math.round(horasSemana * dEnd / 7 * 2) / 2 };
    const fechas = fechasPlan(f, p);
    if (!fechas.length) { notify('Con esos días no queda ninguno antes del final'); return; }
    borrarBloques(f, hoy());
    f.plan = p;
    const dur = Math.min(TOPE_DIA_MIN, Math.max(5, Math.round(horasSemana * 60 / dias.length / 5) * 5));
    crearBloques(f, p, fechas, fechas.map(() => dur));
    saveState(); planCerrar();
    notify('📚 Plan armado: ' + fechas.length + ' bloques en el planificador');
    refresh(); refrescarPlanner();
  }
  function planBorrar(id) {
    const f = ensureF().find(x => x.id === id); if (!f) return;
    borrarBloques(f, hoy());
    delete f.plan;
    saveState(); planCerrar();
    notify('🗑 Plan de estudio borrado');
    refresh(); refrescarPlanner();
  }
  // Rehace los bloques de hoy en adelante con las horas que faltan (total − estudiadas), tope 6 h por día.
  function reacomodar(id) {
    const f = ensureF().find(x => x.id === id); if (!f || !f.plan) return;
    if (!plannerOk()) { notify('El planificador no está disponible'); return; }
    const p = f.plan, pr = progreso(f);
    const rest = Math.max(0, p.totalHoras - pr.est);
    borrarBloques(f, hoy());
    const fechas = fechasPlan(f, p);
    p.ajuste = { fecha: hoy(), estudiadas: pr.est };
    p.faltan = 0;
    let aviso;
    if (rest <= 0) aviso = '✅ Ya cumpliste las horas del plan';
    else {
      const totalMin = Math.round(rest * 60 / 5) * 5;
      const colocar = Math.min(totalMin, TOPE_DIA_MIN * fechas.length);
      p.faltan = Math.round((totalMin - colocar) / 60 * 10) / 10;
      if (fechas.length) {
        const u = colocar / 5, base = Math.floor(u / fechas.length), extra = u % fechas.length;
        crearBloques(f, p, fechas, fechas.map((_, i) => (base + (i < extra ? 1 : 0)) * 5));
      }
      aviso = p.faltan > 0 ? `No te alcanza el tiempo: faltan ${fmtHoras(p.faltan)} h. Sumá días u horas por semana` : '📚 Plan reacomodado: ' + fmtHoras(rest) + ' h repartidas en ' + fechas.length + ' días';
    }
    saveState();
    notify(aviso);
    refresh(); refrescarPlanner();
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
            ${planHtml(f)}
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
  // `sid` = materia actual (se mantiene en la lista aunque ya esté aprobada); `cod` = código de la opción
  // elegida si la fila es compartida (seminarios). Sin plan → solo texto.
  function selectorMateria(pre, sid, texto, inp, cod) {
    const mats = plan().filter(m => !m.done || m.id === sid);
    if (!mats.length) return `<input id="${pre}-materia" value="${esc(texto)}" placeholder="Materia" style="${inp};flex:1;min-width:140px">`;
    const otra = !sid && !!texto;
    const grupos = [];
    mats.forEach(m => {
      let g = grupos.find(x => x.anio === m.anio);
      if (!g) { g = { anio: m.anio, label: m.yearLabel, items: [] }; grupos.push(g); }
      g.items.push(m);
    });
    const opts = grupos.map(g => `<optgroup label="${esc(g.label)}">${g.items.map(m => opcionesHtml(m, sid, cod)).join('')}</optgroup>`).join('');
    return `<select id="${pre}-materia-sel" onchange="Finales.onSelMateria('${pre}')" aria-label="Materia" style="${inp};flex:1;min-width:140px;max-width:100%">
        <option value="" ${!sid && !otra ? 'selected' : ''}>Elegí la materia…</option>${opts}<option value="${OTRA}" ${otra ? 'selected' : ''}>Otra (escribir)</option>
      </select>
      <input id="${pre}-materia" value="${esc(texto)}" placeholder="Nombre de la materia" style="${inp};flex:1;min-width:140px;${otra ? '' : 'display:none'}">`;
  }
  // <option> de una materia del plan. Fila compartida (seminarios): una opción por código, con su nombre
  // (value = "idFila#código"). Final viejo de fila compartida sin código: se conserva la genérica hasta que elija.
  function opcionesHtml(m, sid, cod) {
    const ops = (window.Correlativas && Correlativas.opcionesDeFila) ? Correlativas.opcionesDeFila(m.id) : [];
    if (!ops.length) return `<option value="${esc(m.id)}" ${m.id === sid ? 'selected' : ''}>${esc(m.name)}</option>`;
    const generica = m.id === sid && !ops.some(o => o.code === cod) ? `<option value="${esc(m.id)}" selected>${esc(m.name)}</option>` : '';
    return generica + ops.map(o => `<option value="${esc(m.id)}#${esc(o.code)}" ${m.id === sid && o.code === cod ? 'selected' : ''}>${esc(o.nombre)} (${esc(o.code)})</option>`).join('');
  }
  function onSelMateria(pre) {
    const sel = document.getElementById(pre + '-materia-sel'), txt = document.getElementById(pre + '-materia');
    if (!sel || !txt) return;
    txt.style.display = sel.value === OTRA ? '' : 'none';
    if (sel.value === OTRA) txt.focus();
  }
  // Lee el selector: { materia, subjectId, codigo? } o null si falta elegir (ya avisó).
  function leerMateria(pre) {
    const sel = document.getElementById(pre + '-materia-sel');
    const texto = (document.getElementById(pre + '-materia')?.value || '').trim();
    if (sel && sel.value && sel.value !== OTRA) {
      const [sid, codigo] = sel.value.split('#');
      const m = plan().find(x => x.id === sid);
      if (m && codigo) {
        const o = Correlativas.opcionesDeFila(sid).find(x => x.code === codigo);
        if (o) return { materia: o.nombre, subjectId: sid, codigo };
      }
      if (m) return { materia: m.name, subjectId: m.id };
    }
    if (sel && !sel.value) { notify('Elegí la materia'); return null; }
    if (!texto) { notify(pre === 'fin' ? 'Escribí el nombre de la materia' : 'La materia no puede quedar vacía'); return null; }
    return { materia: texto, subjectId: subjectIdDe({ materia: texto }) };
  }

  function filaEdit(f) {
    const inp = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 8px;font-size:var(--fs-12-5);color:inherit';
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px;border:1px solid var(--accent,#6B8EFF);border-radius:8px;margin-bottom:6px">
      ${selectorMateria('fin-e', subjectIdDe(f), f.materia, inp, f.codigo)}
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
    const nuevo = { id: uid(), materia: m.materia, subjectId: m.subjectId, fecha, tipo, done: false, doneEl: null };
    if (m.codigo) nuevo.codigo = m.codigo;
    ensureF().push(nuevo);
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
    if (m.codigo) f.codigo = m.codigo; else delete f.codigo;
    // Editar la fecha reactiva un final vencido/rendido.
    if (f.done && diasRest(fecha) >= 0) { f.done = false; f.doneEl = null; }
    saveState(); _editId = null;
    notify('✏️ Final actualizado');
    refresh();
  }
  // Pasa el final al historial. `aviso` reemplaza al toast por defecto.
  function cerrar(f, aviso) {
    f.done = true; f.doneEl = hoy();
    if (f.plan) borrarBloques(f, hoy());
    saveState();
    notify(aviso || ('✅ ' + f.materia + ' → historial'));
    refresh(); if (f.plan) refrescarPlanner();
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
    if (!sid) { cerrar(f); return; }
    if (!Correlativas.aprobarMateria(sid, n, f.codigo)) {
      // Fila compartida (seminarios) sin saber cuál opción se aprobó: no se adivina, la carrera no se toca.
      const compartida = Correlativas.opcionesDeFila(sid).length > 0;
      cerrar(f, compartida ? '✅ ' + f.materia + ' → historial. Elegí cuál seminario aprobaste en el plan' : undefined);
      return;
    }
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
    const nombre = arr[i].materia, tenia = !!arr[i].plan;
    if (tenia) borrarBloques(arr[i], hoy());
    arr.splice(i, 1);
    saveState(); if (_editId === id) _editId = null;
    notify('🗑 ' + nombre + ' eliminado');
    refresh(); if (tenia) refrescarPlanner();
  }

  return { renderPrincipal, open, add, edit, cancelEdit, saveEdit, done, reactivar, del, onSelMateria, subjectIdDe, notaGuardar, notaMasTarde, notaDesaprobe, activos, planAbrir, planCerrar, planGuardar, planBorrar, reacomodar, bloquesDe, progreso };
})();
window.Finales = Finales;
window.openFinalesOverlay = Finales.open;
