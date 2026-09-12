'use strict';
// ════════════════════════════════════════════════════════════════════════
// REVISIÓN SEMANAL — ritual guiado de 4 pasos que cierra la semana que
// termina y siembra la que arranca. Eslabón que faltaba entre el trimestre
// (quarterlyObjectives) y el día (goals): sin esto nadie conecta lo que pasó
// en la semana con los objetivos del trimestre.
//
// Patrón de módulo (CONVENCIONES.md): IIFE que se auto-inyecta (style + DOM)
// y expone su API en window. Reusa CMOverlay (overlay-core.js) para la
// pantalla completa y CMInformesData (informes-datos.js) para los números
// de la semana — ninguna cuenta de hábitos/calendario/gasto se reimplementa
// acá, se llama a la MISMA función `calc(desde,hasta)` que usa el motor de
// informes mensuales (esas funciones ya trabajan con cualquier rango de
// fechas, no solo con meses).
// ════════════════════════════════════════════════════════════════════════
(function () {

  // ── Estilos propios ────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .rs-nudge {
      position: fixed; left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom, 0px));
      z-index: 500; margin: 0 auto; max-width: 440px;
      display: flex; align-items: center; gap: 10px;
      background: rgba(10,16,30,.94); border: 1px solid var(--border); border-radius: 14px;
      padding: 11px 12px; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      box-shadow: 0 8px 28px rgba(0,0,0,.35);
      animation: rs-nudge-in .32s var(--ease-out-quart) both;
    }
    @keyframes rs-nudge-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .rs-nudge-txt { flex: 1; min-width: 0; }
    .rs-nudge-title { font-size: var(--fs-14); font-weight: 700; color: var(--tp); }
    .rs-nudge-sub { font-size: var(--fs-12-5); color: var(--ts); margin-top: 1px; }
    @media (prefers-reduced-motion: reduce) { .rs-nudge { animation: none !important; } }

    .rs-steps { display: flex; align-items: center; gap: 6px; margin: 2px 4px 16px; }
    .rs-step-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
    .rs-step-dot.on { background: var(--c-vida, var(--hud)); box-shadow: 0 0 8px color-mix(in oklab, var(--c-vida, var(--hud)) 70%, transparent); }
    .rs-step-label { margin-left: auto; font-family: var(--mono); font-size: var(--fs-12-5); color: var(--tt); }

    .rs-pane { animation: cm-panel-in .28s var(--ease-out-expo) both; }
    @media (prefers-reduced-motion: reduce) { .rs-pane { animation: none !important; } }
    .rs-sub { font-family: var(--mono); font-size: var(--fs-12-5); letter-spacing: 1.5px; text-transform: uppercase; color: var(--ts); margin: 16px 2px 9px; }
    .rs-sub:first-child { margin-top: 2px; }
    .rs-sub::before { content: '▸'; color: var(--c-vida, var(--hud)); margin-right: 6px; }

    .rs-metric-list { display: flex; flex-direction: column; gap: 7px; }
    .rs-metric-row {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px;
      padding: 11px 12px; border-radius: 11px; border: 1px solid var(--border);
      background: linear-gradient(180deg, color-mix(in oklab, var(--c-vida, var(--hud)) 6%, transparent), rgba(10,16,30,.35));
    }
    .rs-metric-label { flex: 1 1 140px; font-size: var(--fs-14); color: var(--tp); }
    .rs-metric-val { font-family: var(--mono); font-weight: 700; font-size: var(--fs-15-5, var(--fs-14)); color: var(--tp); }
    .rs-metric-delta { flex-basis: 100%; }
    @media (min-width: 480px) { .rs-metric-delta { flex-basis: auto; margin-left: auto; } }

    .rs-empty { font-size: var(--fs-13); color: var(--tt); padding: 8px 2px; line-height: 1.5; }

    .rs-goal-list, .rs-obj-list { display: flex; flex-direction: column; gap: 8px; }
    .rs-goal-row { padding: 10px 12px; border-radius: 11px; border: 1px solid var(--border); background: rgba(10,16,30,.4); }
    .rs-goal-text { font-size: var(--fs-14); color: var(--tp); margin-bottom: 8px; }
    .rs-goal-date { font-family: var(--mono); font-size: var(--fs-12-5); color: var(--tt); margin-left: 6px; }
    .rs-goal-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .rs-obj-row { padding: 9px 12px; border-radius: 11px; border: 1px solid var(--border); background: rgba(10,16,30,.3); font-size: var(--fs-14); color: var(--tp); display: flex; align-items: center; gap: 8px; }
    .rs-obj-text { flex: 1; }

    .rs-recap { margin: 0 0 4px; padding-left: 20px; font-size: var(--fs-14); color: var(--tp); line-height: 1.6; }

    .rs-nav { display: flex; justify-content: space-between; gap: 10px; margin-top: 20px; padding-top: 4px; }
    .rs-nav .btn:only-child { margin-left: auto; }
  `;
  document.head.appendChild(style);

  // ── Fechas: helpers propios (reusan localStr/getActiveDate/plannerWeekDates
  // globales de app.js — nunca toISOString) ──────────────────────────────
  function _addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0); // mediodía: evita corrimiento por DST
    dt.setDate(dt.getDate() + n);
    return localStr(dt);
  }
  function _lastSunday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    dt.setDate(dt.getDate() - dt.getDay()); // getDay(): domingo = 0
    return localStr(dt);
  }
  // Semana ISO 8601 (lunes = primer día, la semana pertenece al año de su jueves).
  // Validado contra 2026-01-01, 2026-12-31 y 2027-01-03 (ver reporte del ticket).
  function _isoWeekKey(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    const dow = (dt.getDay() + 6) % 7; // lunes = 0 ... domingo = 6
    dt.setDate(dt.getDate() - dow + 3); // jueves de esta semana ISO
    const isoYear = dt.getFullYear();
    const jan4 = new Date(isoYear, 0, 4, 12, 0, 0);
    const jan4Dow = (jan4.getDay() + 6) % 7;
    const week1Mon = new Date(jan4);
    week1Mon.setDate(jan4.getDate() - jan4Dow);
    const week = Math.round((dt - week1Mon) / 604800000) + 1;
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
  }

  // ── Estado ──────────────────────────────────────────────────────────
  // S.revisionSemanal no está en DEFAULT_STATE (no se puede tocar app.js):
  // se inicializa acá, defensivamente, en cada punto de lectura/escritura —
  // loadState() reemplaza el objeto `S` entero (merge de defaults solo para
  // claves de DEFAULT_STATE), así que no alcanza con inicializar una vez.
  function _rsEnsureState() {
    if (!S.revisionSemanal || typeof S.revisionSemanal !== 'object') S.revisionSemanal = {};
  }
  function _rsEntry(weekKey, create) {
    _rsEnsureState();
    if (!S.revisionSemanal[weekKey] && create) {
      S.revisionSemanal[weekKey] = { hechaEl: null, promesas: [], nota: '', movidas: [], archivadas: [] };
    }
    return S.revisionSemanal[weekKey] || null;
  }

  // "Semana que cierra" = la semana lunes-domingo que termina en el domingo
  // más reciente (hoy incluido, si hoy es domingo). "Semana entrante" = la
  // que arranca al día siguiente de ese domingo. Las promesas y la nota de
  // esta revisión quedan guardadas bajo la clave ISO de la semana ENTRANTE
  // (así promesasVigentes(), que lee la semana de HOY, las encuentra apenas
  // arranca esa semana).
  function _rsComputeInfo() {
    const today = getActiveDate();
    const closeSunday = _lastSunday(today);
    return {
      today,
      closeDates: plannerWeekDates(closeSunday),
      prevDates: plannerWeekDates(_addDays(closeSunday, -7)),
      entryWeekKey: _isoWeekKey(_addDays(closeSunday, 1)),
    };
  }

  // ── Métricas de la semana — reusan CMInformesData.CATALOGO[].calc(desde,hasta),
  // el mismo cálculo que informes.js usa para meses/trimestres/semestres/años.
  // Esas `calc` ya devuelven null cuando no hay datos suficientes (regla de
  // honestidad del proyecto) — acá no se reimplementa esa lógica. ──────────
  const _RS_HABIT_IDS = ['vida_habitos_pct', 'fin_habitos_pct', 'con_habitos_pct', 'salud_habitos_pct', 'ia_habitos_pct'];
  function _rsMetricCalc(id, desde, hasta) {
    if (typeof CMInformesData === 'undefined') return null;
    const m = CMInformesData.CATALOGO.find(x => x.id === id);
    return m ? m.calc(desde, hasta) : null;
  }
  function _rsHabitosPct(desde, hasta) {
    const vals = _RS_HABIT_IDS.map(id => _rsMetricCalc(id, desde, hasta)).filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }
  function _rsWeekMetrics(dates) {
    const desde = dates[0], hasta = dates[dates.length - 1];
    return {
      habitos: _rsHabitosPct(desde, hasta),
      entreno: _rsMetricCalc('salud_workoutcalendar_pct', desde, hasta),
      estudio: _rsMetricCalc('con_studycalendar_pct', desde, hasta),
      planner: _rsMetricCalc('vida_dayplan_pct', desde, hasta),
      gasto: _rsMetricCalc('fin_egresos', desde, hasta),
      sueno: _rsMetricCalc('salud_sueno_horas_prom', desde, hasta),
    };
  }
  const _RS_METRICS = [
    { key: 'habitos', label: '% de hábitos cumplidos', unidad: 'pct', dir: 'up' },
    { key: 'entreno', label: '% de días entrenados', unidad: 'pct', dir: 'up' },
    { key: 'estudio', label: '% de días estudiando', unidad: 'pct', dir: 'up' },
    { key: 'planner', label: '% del planner cumplido', unidad: 'pct', dir: 'up' },
    { key: 'gasto', label: 'Gasto total', unidad: 'ARS', dir: 'down' },
    { key: 'sueno', label: 'Horas de sueño (prom.)', unidad: 'h', dir: 'up' },
  ];
  function _rsFmt(valor, unidad) {
    if (valor === null || valor === undefined) return null;
    return (typeof CMInformesData !== 'undefined') ? CMInformesData.fmt(valor, unidad) : String(valor);
  }
  function _rsFmtDelta(delta, unidad) {
    const sign = delta > 0 ? '+' : (delta < 0 ? '−' : '');
    const abs = Math.abs(delta);
    if (unidad === 'pct') return `${sign}${Math.round(abs)} pts`;
    if (unidad === 'ARS') return `${sign}${_rsFmt(abs, 'ARS')}`;
    if (unidad === 'h') return `${sign}${abs.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
    return `${sign}${abs}`;
  }
  function _rsMetricRowHTML(cfg, curVal, prevVal) {
    const curTxt = (curVal === null || curVal === undefined) ? 'sin datos esta semana' : _rsFmt(curVal, cfg.unidad);
    let deltaHTML = '';
    if (curVal !== null && curVal !== undefined) {
      if (prevVal === null || prevVal === undefined) {
        deltaHTML = `<span class="pill pill-ghost">sin dato de la semana previa</span>`;
      } else {
        const delta = curVal - prevVal;
        const mejora = cfg.dir === 'up' ? delta > 0 : delta < 0;
        const cls = delta === 0 ? 'pill-ghost' : (mejora ? 'pill-ok' : 'pill-warn');
        deltaHTML = `<span class="pill ${cls}">${_rsFmtDelta(delta, cfg.unidad)} vs. semana previa</span>`;
      }
    }
    return `<div class="rs-metric-row">
      <div class="rs-metric-label">${escHtml(cfg.label)}</div>
      <div class="rs-metric-val">${escHtml(curTxt)}</div>
      <div class="rs-metric-delta">${deltaHTML}</div>
    </div>`;
  }

  // ── Metas del día sin hacer + objetivos del trimestre pendientes ────────
  function _rsMetasIncumplidas() {
    const out = [];
    _rsInfo.closeDates.forEach(date => {
      (S.goals[date] || []).forEach(g => {
        if (g && !g.done && !g.archived) out.push({ date, id: g.id, text: g.text || '' });
      });
    });
    return out;
  }
  function _rsObjetivosPendientes() {
    const qo = S.quarterlyObjectives;
    if (!qo || !Array.isArray(qo.periods)) return [];
    const period = qo.periods.find(p => p.id === qo.activePeriod);
    if (!period || !Array.isArray(period.objectives)) return [];
    return period.objectives.filter(o => !o.done).map(o => ({ id: o.id, text: o.text, category: o.category }));
  }
  function _rsFindGoal(date, id) {
    const arr = S.goals[date] || [];
    const idx = arr.findIndex(g => g.id === id);
    return idx >= 0 ? { arr, idx, goal: arr[idx] } : null;
  }
  function _rsRemoveGoalRow(date, id) {
    const list = document.getElementById('rs-goal-list');
    if (!list) return;
    const row = list.querySelector(`.rs-goal-row[data-date="${date}"][data-id="${id}"]`);
    if (row) row.remove();
    if (!list.children.length) list.innerHTML = '<div class="rs-empty">Listo — revisaste todas las metas de la semana.</div>';
  }
  function _rsMoverMeta(date, id) {
    const found = _rsFindGoal(date, id); if (!found) return;
    const newDate = _addDays(date, 7);
    found.arr.splice(found.idx, 1);
    if (!Array.isArray(S.goals[newDate])) S.goals[newDate] = [];
    S.goals[newDate].push(found.goal);
    const entry = _rsEntry(_rsInfo.entryWeekKey, true);
    entry.movidas.push({ id, text: found.goal.text || '', from: date, to: newDate });
    saveState();
    _rsRemoveGoalRow(date, id);
    if (typeof showToast === 'function') showToast('Meta movida a la semana que viene');
  }
  function _rsArchivarMeta(date, id) {
    const found = _rsFindGoal(date, id); if (!found) return;
    found.goal.archived = true;
    const entry = _rsEntry(_rsInfo.entryWeekKey, true);
    entry.archivadas.push({ id, text: found.goal.text || '', date });
    saveState();
    _rsRemoveGoalRow(date, id);
    if (typeof showToast === 'function') showToast('Meta archivada');
  }
  function _rsDejarMeta(date, id) { _rsRemoveGoalRow(date, id); }

  function _rsGoalRowHTML(m) {
    return `<div class="rs-goal-row" data-date="${m.date}" data-id="${m.id}">
      <div class="rs-goal-text">${escHtml(m.text)}<span class="rs-goal-date">${fmtDate(m.date)}</span></div>
      <div class="rs-goal-actions">
        <button class="btn btn-ghost btn-sm" onclick="_rsMoverMeta('${m.date}','${m.id}')">Mover a la semana que viene</button>
        <button class="btn btn-danger btn-sm" onclick="_rsArchivarMeta('${m.date}','${m.id}')">Archivar</button>
        <button class="btn btn-ghost btn-sm" onclick="_rsDejarMeta('${m.date}','${m.id}')">Dejar como está</button>
      </div>
    </div>`;
  }
  function _rsObjRowHTML(o) {
    return `<div class="rs-obj-row">${o.category ? `<span class="pill pill-ghost">${escHtml(o.category)}</span>` : ''}<span class="rs-obj-text">${escHtml(o.text)}</span></div>`;
  }

  // ── Render de los 4 pasos ────────────────────────────────────────────
  let _rsInfo = null;
  let _rsStep = 1;

  function _rsRenderStep1() {
    const host = document.getElementById('rs-pane-1');
    if (!host) return;
    const cur = _rsWeekMetrics(_rsInfo.closeDates);
    const prev = _rsWeekMetrics(_rsInfo.prevDates);
    const rango = `${fmtDate(_rsInfo.closeDates[0])} – ${fmtDate(_rsInfo.closeDates[6])}`;
    host.innerHTML = `
      <div class="rs-sub">Cómo fue la semana · ${escHtml(rango)}</div>
      <div class="rs-metric-list">${_RS_METRICS.map(cfg => _rsMetricRowHTML(cfg, cur[cfg.key], prev[cfg.key])).join('')}</div>`;
  }

  function _rsRenderStep2() {
    const host = document.getElementById('rs-pane-2');
    if (!host) return;
    const metas = _rsMetasIncumplidas();
    const objs = _rsObjetivosPendientes();
    host.innerHTML = `
      <div class="rs-sub">Metas del día sin hacer</div>
      <div class="rs-goal-list" id="rs-goal-list">${metas.length ? metas.map(_rsGoalRowHTML).join('') : '<div class="rs-empty">No quedó ninguna meta del día sin marcar esta semana.</div>'}</div>
      <div class="rs-sub">Objetivos del trimestre en curso, todavía pendientes</div>
      <div class="rs-obj-list">${objs.length ? objs.map(_rsObjRowHTML).join('') : '<div class="rs-empty">No hay objetivos del trimestre en curso pendientes.</div>'}</div>`;
  }

  function _rsRenderStep3() {
    const host = document.getElementById('rs-pane-3');
    if (!host) return;
    const entry = _rsEntry(_rsInfo.entryWeekKey, true);
    while (entry.promesas.length < 3) entry.promesas.push({ id: uid(), text: '', done: false });
    host.innerHTML = `
      <div class="rs-sub">3 promesas para la semana que empieza</div>
      ${entry.promesas.slice(0, 3).map((p, i) => `
        <div class="field">
          <label for="rs-promesa-${i}">Promesa ${i + 1}</label>
          <input class="inp" id="rs-promesa-${i}" type="text" maxlength="140" value="${escHtml(p.text || '')}" placeholder="Un compromiso concreto para esta semana">
        </div>`).join('')}`;
  }

  function _rsRenderStep4() {
    const host = document.getElementById('rs-pane-4');
    if (!host) return;
    const entry = _rsEntry(_rsInfo.entryWeekKey, true);
    const promesasHTML = entry.promesas.filter(p => p.text && p.text.trim()).map(p => `<li>${escHtml(p.text)}</li>`).join('')
      || '<li class="rs-empty" style="list-style:none;margin-left:-20px">Todavía no cargaste promesas.</li>';
    host.innerHTML = `
      <div class="rs-sub">Resumen</div>
      <ul class="rs-recap">
        <li>${entry.movidas.length} meta(s) movida(s) a la semana que viene</li>
        <li>${entry.archivadas.length} meta(s) archivada(s)</li>
      </ul>
      <div class="rs-sub">Tus 3 promesas</div>
      <ul class="rs-recap">${promesasHTML}</ul>
      <div class="field">
        <label for="rs-nota">Nota libre de la semana</label>
        <textarea class="inp" id="rs-nota" rows="3" placeholder="Algo que quieras recordar de esta semana">${escHtml(entry.nota || '')}</textarea>
      </div>
      <button class="btn btn-primary" onclick="_rsFinalizar()">Terminar revisión</button>`;
  }

  // Vuelca a `S` lo que haya escrito en los inputs de texto libre (promesas y
  // nota) ANTES de guardar o de cerrar el overlay — así cerrar a mitad de
  // paso 3/4 sin que el input haya perdido el foco (blur) no pierde lo
  // tipeado (constraint: "guardado parcial").
  function _rsFlushInputs() {
    if (!_rsInfo) return;
    const entry = _rsEntry(_rsInfo.entryWeekKey, false);
    if (!entry) return;
    let changed = false;
    for (let i = 0; i < 3; i++) {
      const el = document.getElementById('rs-promesa-' + i);
      if (el) {
        if (!entry.promesas[i]) entry.promesas[i] = { id: uid(), text: '', done: false };
        if (entry.promesas[i].text !== el.value) { entry.promesas[i].text = el.value; changed = true; }
      }
    }
    const notaEl = document.getElementById('rs-nota');
    if (notaEl && entry.nota !== notaEl.value) { entry.nota = notaEl.value; changed = true; }
    if (changed) saveState();
  }

  function _rsFinalizar() {
    _rsFlushInputs();
    const entry = _rsEntry(_rsInfo.entryWeekKey, true);
    entry.hechaEl = getActiveDate();
    saveState();
    if (typeof showToast === 'function') showToast('Revisión semanal guardada');
    CMOverlay.close('ov-revision-semanal');
    _rsHideNudge();
  }

  function _rsUpdateNav() {
    const back = document.getElementById('rs-btn-back'), next = document.getElementById('rs-btn-next');
    if (back) back.hidden = (_rsStep === 1);
    if (next) next.hidden = (_rsStep === 4);
    const ov = document.getElementById('ov-revision-semanal');
    if (ov) ov.querySelectorAll('.rs-step-dot').forEach(d => d.classList.toggle('on', +d.dataset.s === _rsStep));
    const label = document.getElementById('rs-step-label');
    if (label) label.textContent = `Paso ${_rsStep} de 4`;
  }
  function _rsGoStep(n) {
    _rsFlushInputs();
    _rsStep = Math.min(4, Math.max(1, n));
    for (let i = 1; i <= 4; i++) { const el = document.getElementById('rs-pane-' + i); if (el) el.hidden = (i !== _rsStep); }
    _rsUpdateNav();
  }
  function _rsNext() { _rsGoStep(_rsStep + 1); }
  function _rsBack() { _rsGoStep(_rsStep - 1); }

  // ── Foco: trap simple dentro del overlay mientras esté abierto (Esc ya lo
  // cierra vía CMOverlay, que escucha keydown a nivel documento). ─────────
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const ov = document.getElementById('ov-revision-semanal');
    if (!ov || !ov.classList.contains('show')) return;
    const focusables = Array.from(ov.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function abrir() {
    if (typeof CMOverlay === 'undefined') return;
    _rsEnsureState();
    _rsInfo = _rsComputeInfo();
    _rsStep = 1;
    const { overlay, body } = CMOverlay.build({ id: 'ov-revision-semanal', accent: '#00D4FF', onClose: _rsFlushInputs });
    body.innerHTML = `
      <div class="cm-ov-head"><div class="cm-ov-eyebrow">VIDA · RITUAL SEMANAL</div><div class="cm-ov-title">Revisión semanal</div></div>
      <div class="rs-steps">
        <span class="rs-step-dot" data-s="1"></span><span class="rs-step-dot" data-s="2"></span><span class="rs-step-dot" data-s="3"></span><span class="rs-step-dot" data-s="4"></span>
        <span class="rs-step-label" id="rs-step-label" aria-live="polite" role="status"></span>
      </div>
      <div class="rs-pane" id="rs-pane-1"></div>
      <div class="rs-pane" id="rs-pane-2" hidden></div>
      <div class="rs-pane" id="rs-pane-3" hidden></div>
      <div class="rs-pane" id="rs-pane-4" hidden></div>
      <div class="rs-nav">
        <button class="btn btn-ghost btn-sm" id="rs-btn-back" onclick="_rsBack()" hidden>Atrás</button>
        <button class="btn btn-primary btn-sm" id="rs-btn-next" onclick="_rsNext()">Siguiente</button>
      </div>`;
    _rsRenderStep1();
    _rsRenderStep2();
    _rsRenderStep3();
    _rsRenderStep4();
    _rsUpdateNav();
    CMOverlay.open(overlay);
    setTimeout(() => { const closeBtn = overlay.querySelector('.cm-ov-close'); if (closeBtn) closeBtn.focus(); }, 0);
  }

  // ── Aviso discreto (domingo/lunes, si la revisión de la semana que cierra
  // todavía no se hizo) — banner descartable, nunca un modal. ─────────────
  function _rsShowNudge() {
    if (document.getElementById('rs-nudge')) return;
    const el = document.createElement('div');
    el.id = 'rs-nudge';
    el.className = 'rs-nudge';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="rs-nudge-txt">
        <div class="rs-nudge-title">Cerrá la semana</div>
        <div class="rs-nudge-sub">Todavía no hiciste la revisión semanal</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="abrirRevisionSemanal()">Revisar</button>
      <button class="icon-btn" aria-label="Descartar aviso" onclick="_rsDismissNudge()">✕</button>`;
    document.body.appendChild(el);
  }
  function _rsHideNudge() { const el = document.getElementById('rs-nudge'); if (el) el.remove(); }
  function _rsDismissNudge() {
    const info = _rsComputeInfo();
    try { localStorage.setItem('cm_rs_dismiss_' + info.entryWeekKey, '1'); } catch (e) {}
    _rsHideNudge();
  }
  function _rsCheckNudge() {
    _rsEnsureState();
    const today = getActiveDate();
    const dow = new Date(today + 'T12:00:00').getDay(); // 0 = domingo, 1 = lunes
    if (dow !== 0 && dow !== 1) { _rsHideNudge(); return; }
    const info = _rsComputeInfo();
    const entry = S.revisionSemanal[info.entryWeekKey];
    if (entry && entry.hechaEl) { _rsHideNudge(); return; }
    let dismissed = false;
    try { dismissed = localStorage.getItem('cm_rs_dismiss_' + info.entryWeekKey) === '1'; } catch (e) {}
    if (dismissed) { _rsHideNudge(); return; }
    _rsShowNudge();
  }
  // El boot real (post-login) llama renderGoals() apenas loadState() resuelve
  // (ver _initApp en app.js) — no hay evento "app lista", así que se engancha
  // ahí (mismo patrón que telemetry.js con switchTab).
  function _rsHookBoot() {
    if (typeof window.renderGoals !== 'function' || window._rsBootHooked) return false;
    window._rsBootHooked = true;
    const orig = window.renderGoals;
    window.renderGoals = function () {
      const r = orig.apply(this, arguments);
      try { _rsCheckNudge(); } catch (e) {}
      return r;
    };
    return true;
  }
  if (!_rsHookBoot()) document.addEventListener('DOMContentLoaded', _rsHookBoot);

  // ── API pública ───────────────────────────────────────────────────────
  window.CMRevisionSemanal = {
    abrir,
    semanaActual: () => _isoWeekKey(getActiveDate()),
    promesasVigentes: () => {
      _rsEnsureState();
      const entry = S.revisionSemanal[_isoWeekKey(getActiveDate())];
      return (entry && Array.isArray(entry.promesas)) ? entry.promesas : [];
    },
  };
  window.abrirRevisionSemanal = abrir;
  // Usados desde onclick="" en el HTML generado (ejecutan en scope global).
  window._rsNext = _rsNext;
  window._rsBack = _rsBack;
  window._rsMoverMeta = _rsMoverMeta;
  window._rsArchivarMeta = _rsArchivarMeta;
  window._rsDejarMeta = _rsDejarMeta;
  window._rsFinalizar = _rsFinalizar;
  window._rsDismissNudge = _rsDismissNudge;
})();
