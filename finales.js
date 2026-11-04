'use strict';
// ════════════════════════════════════════════════════════════════════════
// FINALES — fechas de finales de materias (Conocimiento).
// El overlay se llama "Plan de materias" y tiene dos pestañas: el Plan de Materias (tabla de abogacia.js, donde se cargan
// fecha y tipo de examen de cada final) e Historial (finales rendidos). Los activos se reflejan en la sección principal
// como "Materia · días restantes" ordenado por urgencia. Vencidos se marcan; el check "done" los pasa a historial.
// La materia se elige del plan de carrera (S.lawProgress, no aprobadas) y se guarda
// con `subjectId`; al aprobar el final se pide la nota y se marca la materia en la
// carrera. "Otra (escribir)" deja el texto libre de siempre.
// Plan de estudio por final (f.plan): bloques en el planner hasta el día antes, progreso con el Pomodoro y "Reacomodar".
// Plan de Materias (S.lawPlan, abogacia.js) ↔ Finales: una fila con día+mes+año crea su final (f.lawPlanId = fila.id) y las
// fechas/tipo se reflejan en ambos sentidos; ver "Plan de Materias" más abajo.
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

  // Estado corto del plan de la materia `sid` (su final activo con plan) para la línea del Pomodoro; null si no hay.
  function estadoPlanDe(sid) {
    if (!sid) return null;
    const f = activos().find(x => x.plan && subjectIdDe(x) === sid); if (!f) return null;
    const pr = progreso(f);
    return pr.atraso > 0.5 ? { atrasado: true, texto: 'Plan: vas ' + fmtHoras(pr.atraso) + ' h atrasado' } : { atrasado: false, texto: 'Plan: vas al día' };
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

  // ══════════ Plan de Materias ↔ Finales ══════════
  // Fila de S.lawPlan: { id, subject, target (texto libre), comision?, tipo?, finalOff? }. Una fila con día+mes+año
  // (_lawTargetISO, abogacia.js) tiene un final activo vinculado por f.lawPlanId. Borrar ese final deja finalOff=true
  // en la fila para no recrearlo; cambiar la fecha de la fila borra la marca (lo hace abogacia.js al guardar).
  const filasPlan = () => (typeof S !== 'undefined' && Array.isArray(S.lawPlan) ? S.lawPlan : []);
  const filaDe = f => (f && f.lawPlanId ? filasPlan().find(r => r.id === f.lawPlanId) || null : null);
  const mismaMateria = (f, r, sid) => (sid ? subjectIdDe(f) === sid : norm(f.materia) === norm(r.subject));
  const rerender = () => { if (typeof renderLawPlan === 'function') renderLawPlan(true); };

  // Comisión de la fila vinculada a un final ('' si no tiene).
  function comisionDe(f) { const r = filaDe(f); return r && r.comision ? r.comision : ''; }
  const comisionTxt = c => (c ? (c === 'Unificada' ? 'Unificada' : 'Com. ' + c) : '');

  // Final activo vinculado a una fila del plan (null si no hay).
  const activoDeFila = rowId => ensureF().find(x => x.lawPlanId === rowId && !x.done) || null;
  // Finales activos sin fila en el plan (cargados a mano antes del Plan de materias, o cuya fila se borró): la tabla del
  // plan los muestra como filas extra para que sigan accesibles.
  const sueltos = () => activos().filter(f => !filaDe(f));
  // "Editar" un final suelto: se le crea su fila en el plan (misma materia, fecha y tipo) y se abre el modal normal de esa fila.
  function editarSuelto(id) {
    const f = ensureF().find(x => x.id === id); if (!f || f.done) return;
    let fila = filaDe(f);
    if (!fila) {
      fila = { id: uid(), subject: f.materia, target: typeof _lawTargetDeISO === 'function' ? _lawTargetDeISO(f.fecha) : 'Sin fecha' };
      if (TIPOS.includes(f.tipo)) fila.tipo = f.tipo;
      filasPlan().push(fila);
      f.lawPlanId = fila.id;
      saveState();
      rerender();
    }
    if (typeof openEditLawPlan === 'function') openEditLawPlan(fila.id);
  }

  // Para la fila del plan: null si su final vinculado no está rendido; si lo está, { nota } (nota de la carrera o null).
  function estadoFila(rowId) {
    const f = ensureF().find(x => x.lawPlanId === rowId);
    if (!f || !f.done) return null;
    const sid = subjectIdDe(f);
    let nota = null;
    ((S.lawProgress && S.lawProgress.years) || []).forEach(y => (y.subjects || []).forEach(s => {
      if (s.id === sid && s.done && s.grade != null && s.grade !== '') nota = s.grade;
    }));
    return { nota };
  }

  // Lleva la fila `r` a Finales. `guardado` = la acaba de guardar el usuario (actualiza el final ya vinculado);
  // `fechaNueva` = además cambió su fecha (adopta un final suelto de la misma materia aunque tenga otra fecha).
  // Devuelve true si tocó algo (el que llama guarda).
  function sincronizarFila(r, guardado, fechaNueva) {
    const iso = typeof _lawTargetISO === 'function' ? _lawTargetISO(r.target) : null;
    if (!iso) return false;   // sin día, mes y año no se crea nada (y un final ya vinculado se deja como está)
    const arr = ensureF();
    const mover = (f) => {
      const movio = f.fecha !== iso;
      if (!movio && (!r.tipo || f.tipo === r.tipo)) return false;
      f.fecha = iso; if (r.tipo) f.tipo = r.tipo;
      if (movio && f.plan) reacomodar(f.id);
      return true;
    };
    const vinc = arr.find(x => x.lawPlanId === r.id);
    if (vinc) return guardado && !vinc.done ? mover(vinc) : false;
    if (r.finalOff) return false;
    const sid = subjectIdDe({ materia: r.subject });
    const mat = sid && plan().find(x => x.id === sid);
    if (mat && mat.done) return false;   // materia ya aprobada en la carrera
    const suelto = arr.find(x => !x.done && !x.lawPlanId && mismaMateria(x, r, sid));
    if (suelto) {
      if (suelto.fecha === iso) { suelto.lawPlanId = r.id; return true; }
      if (!fechaNueva) return false;   // al iniciar no se pisa un final cargado a mano con otra fecha
      suelto.lawPlanId = r.id; mover(suelto);
      return true;
    }
    if (iso < hoy()) return false;
    // id fijo por fila y fecha: si dos dispositivos lo crean a la vez, es el mismo final y no se duplica.
    arr.push({ id: 'lp_' + r.id + '_' + iso, materia: mat ? mat.name : r.subject, subjectId: sid, fecha: iso, tipo: r.tipo || TIPOS[0], done: false, doneEl: null, lawPlanId: r.id });
    return true;
  }
  // Al iniciar / cada vez que se dibuja el Plan de Materias: crea los finales que falten. Idempotente.
  function sincronizarDesdePlan() {
    let cambio = false;
    filasPlan().forEach(r => { if (sincronizarFila(r, false, false)) cambio = true; });
    if (cambio) { saveState(); renderPrincipal(); renderList(); }
    return cambio;
  }
  // Tras guardar una fila en el modal del plan (el que llama guarda y redibuja el plan).
  function alGuardarFila(rowId, fechaNueva) {
    const r = filasPlan().find(x => x.id === rowId);
    if (r && sincronizarFila(r, true, !!fechaNueva)) { renderPrincipal(); renderList(); }
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

  // Pestaña "Preparación de finales" de la Sesión de estudio (secciones-fab.js crea #ov-prep-finales): finales activos + su plan.
  function renderPrep() {
    const el = document.getElementById('ov-prep-finales'); if (!el) return;
    const list = activos();
    if (!list.length) { el.innerHTML = '<div class="empty-state" style="padding:12px 0">No tenés finales cargados. Cargá la fecha en el Plan de materias.</div>'; return; }
    el.innerHTML = '<div class="fin-list">' + list.map(f => {
      const c = conteo(diasRest(f.fecha));
      return `<div class="fin-item ${c.urgent ? 'urgent' : ''}">
        <div class="fin-item-main">
          <div class="fin-item-name">${esc(f.materia)}</div>
          <div class="fin-item-meta"><span class="fin-tipo-badge">${esc(f.tipo)}</span><span>${fmtF(f.fecha)}</span>${comisionDe(f) ? `<span>${esc(comisionTxt(comisionDe(f)))}</span>` : ''}</div>
          ${planHtml(f)}
        </div>
        <div class="fin-count">${c.html}</div>
      </div>`;
    }).join('') + '</div>';
  }

  function renderPrincipal() {
    renderPrep();
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
            <div class="fin-item-meta"><span class="fin-tipo-badge">${esc(f.tipo)}</span><span>${fmtF(f.fecha)}</span>${comisionDe(f) ? `<span>${esc(comisionTxt(comisionDe(f)))}</span>` : ''}</div>
            ${estudio}
          </div>
          <div class="fin-count">${c.html}</div>
          <input type="checkbox" class="fin-check" onclick="Finales.done('${f.id}');this.checked=false" title="Marcar como rendido" aria-label="Marcar ${esc(f.materia)} como rendido">
        </div>`;
      }).join('') + '</div>';
    } else {
      rows = '<div class="empty-state" style="padding:12px 0">Sin finales próximos. Cargalos en el Plan de materias.</div>';
    }
    el.innerHTML = `<div class="card"><div class="card-title">🎓 Finales <span style="font-size:var(--fs-12-5);font-weight:400;color:var(--tt)">días restantes</span><button class="btn btn-ghost btn-sm" id="fin-ir-plan" onclick="Finales.open('plan')">Ir a Finales / Plan de materias</button></div>${rows}</div>`;
  }

  // ══════════ Overlay ══════════
  // "Plan de materias": pestaña Plan (la tabla de renderLawPlan, abogacia.js, en #law-plan-wrap) e Historial (#ov-finales-list).
  const TABS = ['plan', 'historial'];
  const TAB_KEY = 'cdm_plan_materias_tab';
  function setTab(t, persist) {
    const ov = document.getElementById('ov-finales'); if (!ov) return;
    if (!TABS.includes(t)) t = 'plan';
    ov.querySelectorAll('.plov-tab').forEach(b => {
      const on = b.dataset.t === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    ov.querySelector('.plov-tabs').dataset.on = t;
    TABS.forEach(k => { const p = ov.querySelector('#fin-pane-' + k); if (p) p.hidden = k !== t; });
    if (persist) { try { localStorage.setItem(TAB_KEY, t); } catch (e) {} }
  }
  function ensureOverlay() {
    if (typeof CMOverlay === 'undefined') return null;
    const { overlay, body } = CMOverlay.build({ id: 'ov-finales', accent: '#6B8EFF' });
    if (!overlay._fBuilt) {
      body.innerHTML = `<div class="cm-ov-head"><div class="cm-ov-eyebrow">CONOCIMIENTO · PLAN DE MATERIAS</div><div class="cm-ov-title">Plan de materias</div></div>
        <div class="plov-tabs" data-on="plan" role="tablist" aria-label="Secciones de Plan de materias">
          <button class="plov-tab on" id="fin-tab-plan" data-t="plan" role="tab" aria-selected="true" aria-controls="fin-pane-plan">Plan de materias</button>
          <button class="plov-tab" id="fin-tab-historial" data-t="historial" role="tab" aria-selected="false" aria-controls="fin-pane-historial">Historial</button>
          <span class="plov-tab-ink"></span>
        </div>
        <div class="plov-pane" id="fin-pane-plan" role="tabpanel" aria-labelledby="fin-tab-plan"><div id="law-plan-wrap"></div></div>
        <div class="plov-pane" id="fin-pane-historial" role="tabpanel" aria-labelledby="fin-tab-historial" hidden><div id="ov-finales-list"></div></div>`;
      body.querySelectorAll('.plov-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.t, true)));
      overlay._fBuilt = true;
    }
    return overlay;
  }

  // `tab` ('plan' | 'historial') fuerza la pestaña; sin él, abre la última que se usó (por defecto el Plan de materias).
  function open(tab) {
    const ov = ensureOverlay(); if (!ov) return;
    _editId = null;
    let t = TABS.includes(tab) ? tab : null;
    if (!t) { try { t = localStorage.getItem(TAB_KEY); } catch (e) {} }
    setTab(t, TABS.includes(tab));
    renderList(); rerender();
    CMOverlay.open(ov);
  }

  // Selector de materia (plan no aprobado, ordenado por año) + "Otra (escribir)" con texto libre.
  // `sid` = materia actual (se mantiene en la lista aunque ya esté aprobada); `cod` = código de la opción
  // elegida si la fila es compartida (seminarios). Sin plan → solo texto.
  function selectorMateria(pre, sid, texto, inp, cod) {
    const mats = plan().filter(m => !m.done || m.id === sid);
    if (!mats.length) return `<input id="${pre}-materia" value="${esc(texto)}" placeholder="Materia" style="${inp};flex:1;min-width:140px">`;
    const otra = !sid && !!texto;
    // Arriba "Próximos exámenes" (por fecha); abajo el resto por año, sin repetir lo de arriba.
    const { proximos, resto } = Correlativas.agruparPorFecha(mats, true);
    const grupos = [];
    resto.forEach(m => {
      let g = grupos.find(x => x.anio === m.anio);
      if (!g) { g = { anio: m.anio, label: m.yearLabel, items: [] }; grupos.push(g); }
      g.items.push(m);
    });
    const fuera = id => proximos.filter(p => p.m.id === id && p.cod).map(p => p.cod);
    const top = proximos.length ? `<optgroup label="Próximos exámenes">${proximos.map(p => opcionesHtml(p.m, sid, cod, { solo: p.cod, suf: p.texto })).join('')}</optgroup>` : '';
    const opts = top + grupos.map(g => `<optgroup label="${esc(g.label)}">${g.items.map(m => opcionesHtml(m, sid, cod, { fuera: fuera(m.id) })).join('')}</optgroup>`).join('');
    return `<select id="${pre}-materia-sel" onchange="Finales.onSelMateria('${pre}')" aria-label="Materia" style="${inp};flex:1;min-width:140px;max-width:100%">
        <option value="" ${!sid && !otra ? 'selected' : ''}>Elegí la materia…</option>${opts}<option value="${OTRA}" ${otra ? 'selected' : ''}>Otra (escribir)</option>
      </select>
      <input id="${pre}-materia" value="${esc(texto)}" placeholder="Nombre de la materia" style="${inp};flex:1;min-width:140px;${otra ? '' : 'display:none'}">`;
  }
  // <option> de una materia del plan. Fila compartida (seminarios): una opción por código, con su nombre
  // (value = "idFila#código"). Final viejo de fila compartida sin código: se conserva la genérica hasta que elija.
  // `op` (opcional, grupo "Próximos exámenes"): solo = código único a mostrar, suf = fecha al lado del nombre,
  // fuera = códigos que ya subieron al grupo de arriba.
  function opcionesHtml(m, sid, cod, op) {
    op = op || {};
    const suf = op.suf ? ' · ' + op.suf : '';
    const ops = (window.Correlativas && Correlativas.opcionesDeFila) ? Correlativas.opcionesDeFila(m.id) : [];
    if (!ops.length) return `<option value="${esc(m.id)}" ${m.id === sid ? 'selected' : ''}>${esc(m.name + suf)}</option>`;
    const generica = !op.solo && m.id === sid && !ops.some(o => o.code === cod) ? `<option value="${esc(m.id)}" selected>${esc(m.name)}</option>` : '';
    const lista = ops.filter(o => op.solo ? o.code === op.solo : !(op.fuera || []).includes(o.code));
    return generica + lista.map(o => `<option value="${esc(m.id)}#${esc(o.code)}" ${m.id === sid && o.code === cod ? 'selected' : ''}>${esc(o.nombre + ' (' + o.code + ')' + suf)}</option>`).join('');
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

  // Pestaña Historial: los finales rendidos. Un final activo en edición (solo por API: la UI edita los activos desde el
  // modal del plan) se muestra arriba.
  function renderList() {
    const el = document.getElementById('ov-finales-list'); if (!el) return;
    const hist = historial();
    const editando = _editId && activos().find(f => f.id === _editId);
    const head = 'font-size:var(--fs-12-5);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin-bottom:6px';
    el.innerHTML = `${editando ? filaEdit(editando) : ''}
      <div style="${head}">Historial (${hist.length})</div>
      ${hist.length ? hist.map(filaHist).join('') : '<div class="empty-state" style="padding:8px 0">Todavía no rendiste ningún final.</div>'}`;
  }

  // También repinta Progreso de carrera: su línea "Próximo final" sale de los finales activos.
  function refresh() { renderList(); renderPrincipal(); rerender(); if (typeof renderLawProgress === 'function') renderLawProgress(); if (typeof refreshRemindersView === 'function') refreshRemindersView('conocimiento'); }

  // ══════════ CRUD ══════════
  function edit(id) { _editId = id; setTab('historial', false); renderList(); }
  function cancelEdit() { _editId = null; renderList(); }
  function saveEdit(id) {
    const f = ensureF().find(x => x.id === id); if (!f) { cancelEdit(); return; }
    const fecha = document.getElementById('fin-e-fecha')?.value || '';
    const tipo = document.getElementById('fin-e-tipo')?.value || f.tipo;
    const m = leerMateria('fin-e'); if (!m) return;
    if (!fecha) { notify('Elegí una fecha'); return; }
    const fechaAntes = f.fecha;
    f.materia = m.materia; f.subjectId = m.subjectId; f.fecha = fecha; f.tipo = tipo;
    if (m.codigo) f.codigo = m.codigo; else delete f.codigo;
    // Editar la fecha reactiva un final vencido/rendido.
    if (f.done && diasRest(fecha) >= 0) { f.done = false; f.doneEl = null; delete f.aprobo; }
    // Final vinculado al Plan de Materias: la fila copia fecha y tipo; si tiene plan de estudio y cambió la fecha, se reacomoda.
    const movio = fecha !== fechaAntes;
    const fila = filaDe(f);
    if (fila) {
      if (typeof _lawTargetDeISO === 'function') fila.target = _lawTargetDeISO(f.fecha);
      fila.tipo = f.tipo;
    }
    saveState(); _editId = null;
    if (movio && f.plan && !f.done) reacomodar(f.id);
    notify('✏️ Final actualizado');
    refresh();
  }
  // Pasa el final al historial. `aviso` reemplaza al toast por defecto.
  // `aprobo` = el cierre es la aprobación de la materia (la marca permite reactivarlo si después se desmarca la materia).
  function cerrar(f, aviso, aprobo) {
    f.done = true; f.doneEl = hoy();
    if (aprobo) f.aprobo = true; else delete f.aprobo;
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
    // finalId: este final lo cierra `cerrar` más abajo (no lo cierra la carrera → sin bucle); fecha: cuándo se aprobó.
    if (!Correlativas.aprobarMateria(sid, n, f.codigo, { fecha: f.fecha, finalId: f.id })) {
      // Fila compartida (seminarios) sin saber cuál opción se aprobó: no se adivina, la carrera no se toca.
      const compartida = Correlativas.opcionesDeFila(sid).length > 0;
      cerrar(f, compartida ? '✅ ' + f.materia + ' → historial. Elegí cuál seminario aprobaste en el plan' : undefined);
      return;
    }
    f.subjectId = sid;
    const av = Correlativas.avisoDesbloqueo();
    cerrar(f, '🎓 ' + f.materia + ' aprobada con ' + (Math.round(n * 10) / 10) + ' → carrera actualizada' + (av ? ' · ' + av : ''), true);
  }

  // ── Conexión con la carrera (Progreso de carrera / Plan de carrera aprueban sin pasar por el modal de nota) ──
  // Cierran / reactivan finales SIN guardar ni repintar: quien llama (Correlativas) lo hace una sola vez.
  // Fila compartida (seminarios): solo se tocan los finales de la opción `code`; sin opción conocida no se toca ninguno.
  const compartidaSid = sid => !!(window.Correlativas && Correlativas.opcionesDeFila(sid).length);
  function alAprobar(sid, code, exceptoId) {
    const comp = compartidaSid(sid);
    let plan = false;
    activos().forEach(f => {
      if (f.id === exceptoId || subjectIdDe(f) !== sid) return;
      if (comp && (!code || f.codigo !== code)) return;
      f.done = true; f.doneEl = hoy(); f.aprobo = true;
      if (f.plan) { borrarBloques(f, hoy()); plan = true; }
    });
    if (plan) refrescarPlanner();
  }
  // Reactiva el final más reciente que cerró la aprobación de esa materia (marca `aprobo`). true si reactivó alguno.
  function alDesaprobar(sid, code) {
    const comp = compartidaSid(sid);
    const f = historial().filter(x => x.aprobo && subjectIdDe(x) === sid && (!comp || !code || x.codigo === code))
      .sort((a, b) => ((b.doneEl || '') + b.fecha).localeCompare((a.doneEl || '') + a.fecha))[0];
    if (!f) return false;
    f.done = false; f.doneEl = null; delete f.aprobo;
    return true;
  }
  // Final activo más cercano (de hoy en adelante) entre las materias `ids` (ids de S.lawProgress): { materia, fecha, dias } o null.
  function proximoDe(ids) {
    const set = new Set(ids);
    for (const f of activos()) {   // ya vienen por fecha ascendente
      const sid = subjectIdDe(f), dias = diasRest(f.fecha);
      if (sid && set.has(sid) && dias >= 0) return { materia: f.materia, fecha: f.fecha, dias };
    }
    return null;
  }
  // Sin nota o desaprobado: el final pasa al historial y la carrera no se toca.
  function notaMasTarde() {
    const f = cerrarModalNota(); if (!f) return;
    cerrar(f, '✅ ' + f.materia + ' → historial (la carrera no se tocó; cargala desde el plan)');
  }
  function notaDesaprobe() {
    const f = cerrarModalNota(); if (!f) return;
    // Desaprobado: se desvincula del Plan de Materias (la fila no figura "Rendida") y la fila no lo recrea con
    // la misma fecha; al cargarle una fecha nueva se borra finalOff y aparece el final nuevo.
    if (f.lawPlanId) {
      const r = filasPlan().find(x => x.id === f.lawPlanId);
      if (r) r.finalOff = true;
      delete f.lawPlanId;
    }
    cerrar(f, '✅ ' + f.materia + ' → historial (sin cambios en la carrera)');
    if (typeof renderLawPlan === 'function') renderLawPlan(true);
  }
  function reactivar(id) {
    const f = ensureF().find(x => x.id === id); if (!f) return;
    f.done = false; f.doneEl = null; delete f.aprobo;
    saveState();
    notify('↩ ' + f.materia + ' reactivado (si ya figura aprobada en la carrera, se cambia desde el plan)');
    refresh();
  }
  function del(id) {
    const arr = ensureF(); const i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    const nombre = arr[i].materia, tenia = !!arr[i].plan;
    const fila = filaDe(arr[i]);
    if (fila) fila.finalOff = true;   // la fila conserva su fecha pero no recrea el final
    if (tenia) borrarBloques(arr[i], hoy());
    arr.splice(i, 1);
    saveState(); if (_editId === id) _editId = null;
    notify('🗑 ' + nombre + ' eliminado');
    refresh(); if (tenia) refrescarPlanner();
  }

  return { refresh, alAprobar, alDesaprobar, proximoDe, renderPrincipal, renderPrep, estadoPlanDe, open, edit, cancelEdit, saveEdit, done, reactivar, del, onSelMateria, subjectIdDe, notaGuardar, notaMasTarde, notaDesaprobe, activos, planAbrir, planCerrar, planGuardar, planBorrar, reacomodar, bloquesDe, progreso, TIPOS, estadoFila, sincronizarDesdePlan, alGuardarFila, activoDeFila, sueltos, editarSuelto };
})();
window.Finales = Finales;
window.openFinalesOverlay = Finales.open;
