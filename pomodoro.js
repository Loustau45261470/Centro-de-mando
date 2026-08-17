'use strict';
// ════════════════════════════════════════════════════════════════════════
// POMODORO — cronómetro de ciclos automáticos para la Sesión de estudio.
// Config editable (estudio / descanso / ciclos, tope 6) persistida en
// localStorage. Ciclos automáticos: estudio → descanso → … → estudio (sin
// descanso tras el último). Aviso al fin de cada bloque: beep + toast + voz.
// Estado del timer efímero: pausar/reanudar/reiniciar; se pausa al cerrar.
// ════════════════════════════════════════════════════════════════════════

const Pomodoro = (() => {
  const CFG_KEY = 'cdm_pomodoro_cfg';
  const DEF = { study: 25, brk: 5, cycles: 4 };
  const MAX_CYCLES = 6;

  let cfg = loadCfg();
  let phase = 'idle';          // 'idle' | 'study' | 'break' | 'done'
  let cycle = 1;               // bloque de estudio actual (1..cfg.cycles)
  let remaining = 0;           // segundos restantes del bloque (derivado de phaseEndsAt, no se decrementa a mano)
  let phaseEndsAt = 0;         // timestamp ms absoluto de fin del bloque actual — la cuenta real vive acá
  let paused = false;
  let timer = null;
  let container = null;
  let sessionBlocks = 0;       // bloques de estudio COMPLETOS en la sesión actual
  let sessionMinutes = 0;      // minutos totales registrados en la sesión actual (completos + parcial de cierre)
  let sessionEarly = false;    // true si se cortó con "Finalizar sesión" antes de los N ciclos
  let histContainer = null;
  let histView = 'day';       // 'day' | 'week' | 'month'
  let histChartInst = null;

  function loadCfg() {
    try {
      const raw = JSON.parse(localStorage.getItem(CFG_KEY));
      if (raw) return { study: clampMin(raw.study, DEF.study), brk: clampMin(raw.brk, DEF.brk), cycles: clampCycles(raw.cycles) };
    } catch (e) {}
    return { ...DEF };
  }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
  const clampMin = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 1 ? n : d; };
  const clampCycles = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(1, Math.min(MAX_CYCLES, n)) : DEF.cycles; };

  // ── Avisos ──
  let _ac = null;
  function beep() {
    try {
      _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
      if (_ac.state === 'suspended') _ac.resume();
      const o = _ac.createOscillator(), g = _ac.createGain();
      o.type = 'sine'; o.frequency.value = 820; o.connect(g); g.connect(_ac.destination);
      g.gain.setValueAtTime(0.0001, _ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, _ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, _ac.currentTime + 0.5);
      o.start(); o.stop(_ac.currentTime + 0.52);
    } catch (e) {}
  }
  function announce(toast, voice) {
    beep();
    if (typeof showToast === 'function') showToast(toast, 3500);
    try { if (window.JARVIS && typeof JARVIS.speak === 'function') JARVIS.speak(voice); } catch (e) {}
  }

  // ── Hábito de estudio + historial de sesiones ──
  function markHabitDay(state, todayArg) {
    try {
      const habit = (S.habitTrackers && S.habitTrackers.conocimiento || []).find(h => h.id === 'habit-estudio');
      if (!habit) return;
      const today = todayArg || (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));
      if (state === 'partial' && (habit.days[today] === 'done' || habit.days[today] === 'rest')) return; // no bajar de categoría ni pisar descanso
      habit.days[today] = state;
      saveState();
      if (typeof renderHabitsCard === 'function') try { renderHabitsCard('conocimiento'); } catch (e) {}
    } catch (e) {}
  }
  function logSesion(today, minutes, full) {
    try {
      if (typeof S === 'undefined') return;
      S.pomodoroHistory = S.pomodoroHistory || [];
      S.pomodoroHistory.push({ id: uid(), date: today, minutes, full: !!full, ts: Date.now() });
      saveState(); // no depender de que markHabitDay llegue a guardar
    } catch (e) {}
  }
  function deleteSession(id) {
    if (!confirm('¿Eliminar esta sesión del historial?')) return;
    if (typeof S === 'undefined' || !Array.isArray(S.pomodoroHistory)) return;
    S.pomodoroHistory = S.pomodoroHistory.filter(e => e.id !== id);
    saveState();
    renderHistory();
  }

  // ── Timer ──
  // La cuenta se recalcula siempre desde phaseEndsAt (timestamp absoluto), nunca
  // decrementando de a 1 por tick — el navegador achica/pausa setInterval en pestañas
  // en segundo plano, y decrementar por tick hacía que el estudio/descanso se
  // "estirara" cuando el usuario miraba otra pestaña o app. Con timestamp absoluto,
  // aunque el tick llegue tarde o salteado, el tiempo mostrado sigue siendo el real.
  function syncRemaining() { remaining = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000)); }

  // ── Aviso preciso (Cloudflare Worker) — llega aunque la pestaña esté de fondo o
  // el celular con otra app. Se reprograma en cada transición de fase; el aviso
  // local (announce()) ya cubre el caso con la pestaña activa, así que al completar
  // una fase EN VIVO se cancela el push pendiente para no duplicar el aviso.
  function scheduleStudyPush() {
    const isLast = cycle >= cfg.cycles;
    if (typeof _schedulePushAlarm === 'function') {
      _schedulePushAlarm('pomo', remaining,
        isLast ? '✅ Pomodoro completo' : '☕ ¡Descanso!',
        isLast ? `${cfg.cycles} ciclos completos — buen trabajo.` : `Bloque ${cycle} completo — tomate ${cfg.brk} min.`,
        'pomo');
    }
  }
  function scheduleBreakPush() {
    if (typeof _schedulePushAlarm === 'function') {
      _schedulePushAlarm('pomo', remaining, '📚 ¡A estudiar!', `Descanso terminado — arrancá el ciclo ${cycle}/${cfg.cycles}.`, 'pomo');
    }
  }
  function cancelPush() { if (typeof _cancelPushAlarm === 'function') _cancelPushAlarm('pomo'); }

  function startTick() { stopTick(); timer = setInterval(tick, 1000); }
  function stopTick() { if (timer) { clearInterval(timer); timer = null; } }

  function tick() {
    if (paused) return;
    syncRemaining();
    if (remaining <= 0) { advance(); return; }
    render();
  }

  function advance() {
    cancelPush(); // la fase que recién terminó ya se anunció localmente (announce) — no duplicar con el push
    if (phase === 'study') {
      const today = typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10);
      logSesion(today, cfg.study, true);
      markHabitDay('done', today);
      sessionBlocks++; sessionMinutes += cfg.study;
      renderHistory();
      if (cycle < cfg.cycles) {
        phase = 'break'; remaining = cfg.brk * 60; phaseEndsAt = Date.now() + remaining * 1000;
        announce('☕ Descanso — bloque ' + cycle + ' completo', 'Study block complete, sir. Take a break.');
        scheduleBreakPush();
      } else {
        finish();
        return;
      }
    } else if (phase === 'break') {
      cycle++; phase = 'study'; remaining = cfg.study * 60; phaseEndsAt = Date.now() + remaining * 1000;
      announce('📚 Estudio — ciclo ' + cycle + '/' + cfg.cycles, 'Break over, sir. Back to work.');
      scheduleStudyPush();
    }
    render();
  }

  function finish() {
    stopTick();
    phase = 'done'; paused = false; sessionEarly = false;
    announce('✅ Pomodoro completo — ' + cfg.cycles + ' ciclos', 'Pomodoro complete, sir. Well done.');
    render();
  }
  function endSession() {
    if (phase !== 'study' && phase !== 'break') return;
    cancelPush();
    if (phase === 'study') {
      // Bloque de estudio cortado antes de tiempo: registra el tiempo real transcurrido (no el bloque completo).
      syncRemaining();
      const elapsedMin = Math.floor((cfg.study * 60 - remaining) / 60);
      if (elapsedMin >= 1) {
        const today = typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10);
        logSesion(today, elapsedMin, false);
        sessionMinutes += elapsedMin;
      }
    }
    stopTick();
    phase = 'done'; paused = false; sessionEarly = true;
    announce(
      sessionMinutes ? '🏁 Sesión finalizada — ' + sessionMinutes + ' min estudiados' : '🏁 Sesión finalizada',
      sessionMinutes ? 'Session ended, sir. ' + sessionMinutes + ' minutes logged.' : 'Session ended, sir.'
    );
    render(); renderHistory();
  }

  // ── Controles ──
  function bump(field, delta) {
    if (field === 'cycles') cfg.cycles = clampCycles(cfg.cycles + delta);
    else if (field === 'study') cfg.study = Math.max(1, cfg.study + delta);
    else if (field === 'brk') cfg.brk = Math.max(1, cfg.brk + delta);
    saveCfg(); render();
  }
  function start() {
    saveCfg();
    phase = 'study'; cycle = 1; remaining = cfg.study * 60; phaseEndsAt = Date.now() + remaining * 1000; paused = false;
    sessionBlocks = 0; sessionMinutes = 0; sessionEarly = false;
    startTick(); render();
    markHabitDay('partial');
    scheduleStudyPush();
  }
  function togglePause() {
    if (phase !== 'study' && phase !== 'break') return;
    if (!paused) { syncRemaining(); paused = true; cancelPush(); }
    else {
      phaseEndsAt = Date.now() + remaining * 1000; paused = false;
      if (phase === 'study') scheduleStudyPush(); else scheduleBreakPush();
    }
    render();
  }
  function reset() { cancelPush(); stopTick(); phase = 'idle'; cycle = 1; remaining = 0; paused = false; render(); }
  // Al cerrar el overlay: cortar el intervalo (no dejar timer corriendo en background).
  function pauseOnHide() { if ((phase === 'study' || phase === 'break') && !paused) { syncRemaining(); paused = true; cancelPush(); render(); } stopTick(); }
  function onShow() { if ((phase === 'study' || phase === 'break') && !timer) startTick(); render(); renderHistory(); }
  // Al volver a la pestaña: recalcular al toque en vez de esperar al próximo tick
  // (que el navegador puede demorar bastante si venía de estar en segundo plano).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (phase === 'study' || phase === 'break') && !paused) tick();
  });

  // ── Render ──
  const fmt = s => { const m = Math.floor(Math.max(0, s) / 60), ss = Math.max(0, s) % 60; return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); };
  const stepper = (field, label, unit, val) => `
    <div class="pomo-stepper">
      <div class="pomo-stepper-lbl">${label}</div>
      <div class="pomo-stepper-row">
        <button class="pomo-stepper-btn" onclick="Pomodoro.bump('${field}',-1)" aria-label="menos">−</button>
        <div class="pomo-stepper-val">${val}</div>
        <button class="pomo-stepper-btn" onclick="Pomodoro.bump('${field}',1)" aria-label="más">+</button>
      </div>
      <div class="pomo-stepper-lbl" style="opacity:.55">${unit}</div>
    </div>`;

  function mount(el) { container = el; render(); }

  function render() {
    if (!container) return;
    if (phase === 'idle' || phase === 'done') {
      const doneHtml = phase === 'done' ? `<div class="pomo-done">
          ${sessionEarly ? '🏁 Sesión finalizada' : '✅ Pomodoro completo'}
          ${sessionMinutes ? ` · ${sessionBlocks} bloque${sessionBlocks === 1 ? '' : 's'} completo${sessionBlocks === 1 ? '' : 's'} · ${sessionMinutes} min estudiados` : ' · sin estudio registrado'}
        </div>` : '';
      container.innerHTML = `
        ${doneHtml}
        <div class="pomo-config">
          ${stepper('study', 'Estudio', 'min', cfg.study)}
          ${stepper('brk', 'Descanso', 'min', cfg.brk)}
          ${stepper('cycles', 'Ciclos', '1–' + MAX_CYCLES, cfg.cycles)}
        </div>
        <div style="text-align:center"><button class="pomo-start" onclick="Pomodoro.start()">▶ Iniciar Pomodoro</button></div>`;
      return;
    }
    const isStudy = phase === 'study';
    const blockTotal = (isStudy ? cfg.study : cfg.brk) * 60;
    const p = blockTotal > 0 ? Math.min(1, (blockTotal - remaining) / blockTotal) : 0;
    container.innerHTML = `
      <div class="pomo-run ${isStudy ? 'study' : 'break'} ${paused ? 'paused' : ''}" style="--p:${p.toFixed(3)}">
        <div class="pomo-dial">
          <div class="pomo-dial-inner">
            <div class="pomo-phase">${isStudy ? '📚 Estudio' : '☕ Descanso'}</div>
            <div class="pomo-time">${fmt(remaining)}</div>
            <div class="pomo-cyc">Ciclo ${cycle}/${cfg.cycles}</div>
            ${paused ? '<div class="pomo-paused-tag">⏸ EN PAUSA</div>' : ''}
          </div>
        </div>
        <div class="pomo-controls">
          <button class="pomo-start" onclick="Pomodoro.togglePause()">${paused ? '▶ Reanudar' : '⏸ Pausar'}</button>
          <button class="btn btn-ghost btn-sm" onclick="Pomodoro.reset()">■ Reiniciar</button>
          <button class="btn btn-ghost btn-sm" onclick="Pomodoro.endSession()">🏁 Finalizar sesión</button>
        </div>
      </div>`;
  }

  // ── Historial de sesiones (día / semana / mes) ──
  const addDiasH = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  function mountHistory(el) { histContainer = el; renderHistory(); }

  function setHistView(v) { histView = v; renderHistory(); }

  const fmtDur = m => {
    const h = Math.floor((m || 0) / 60), mm = (m || 0) % 60;
    return h ? `${h}<span class="u">h</span>${mm ? ' ' + mm + '<span class="u">′</span>' : ''}` : `${m || 0}<span class="u">′</span>`;
  };

  function renderHistory() {
    if (!histContainer) return;
    if (histChartInst) { histChartInst.destroy(); histChartInst = null; }
    const hist = (typeof S !== 'undefined' && Array.isArray(S.pomodoroHistory)) ? S.pomodoroHistory : [];
    const totEl = document.getElementById('pomo-hist-tot');
    if (!hist.length) {
      if (totEl) totEl.textContent = '';
      histContainer.innerHTML = `<div class="pomo-empty">
        <div class="pomo-empty-ico">🍅</div>
        <div class="pomo-empty-t">Sin sesiones todavía</div>
        <div class="pomo-empty-s">Arrancá un pomodoro arriba y acá vas a ver tu historial.</div>
      </div>`;
      return;
    }
    const today = typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10);
    const sumMin = arr => arr.reduce((a, e) => a + (e.minutes || 0), 0);
    if (totEl) totEl.textContent = `${hist.length} sesión${hist.length === 1 ? '' : 'es'} · ${Math.round(sumMin(hist) / 60 * 10) / 10}h`;

    // ── Pulso: hoy / 7 días / este mes, hoy como héroe ──
    const hoyE = hist.filter(h => h.date === today);
    const semDesde = addDiasH(today, -6);
    const semE = hist.filter(h => h.date >= semDesde && h.date <= today);
    const mesPref = today.slice(0, 7);
    const mesE = hist.filter(h => h.date.slice(0, 7) === mesPref);
    const pulseCell = (n, lbl, hero) => `<div class="pomo-pulse-cell${hero ? ' is-hero' : ''}">
      <div class="pomo-pulse-lbl">${lbl}</div>
      <div class="pomo-pulse-val">${fmtDur(sumMin(n))}</div>
      <div class="pomo-pulse-sub">${n.length} sesion${n.length === 1 ? '' : 'es'}</div>
    </div>`;
    const pulseHtml = `<div class="pomo-pulse">
      ${pulseCell(hoyE, 'Hoy', true)}
      ${pulseCell(semE, '7 días', false)}
      ${pulseCell(mesE, 'Este mes', false)}
    </div>`;

    // ── Módulo de tendencia: datos del gráfico + promedios, sobre la MISMA ventana
    // que muestran las barras (14 días / 8 semanas / 6 meses) — coherentes entre sí. ──
    const horas = arr => Math.round(sumMin(arr) / 60 * 10) / 10;
    let labels = [], data = [], totalMin = 0, totalSes = 0, nBuckets = 0;
    if (histView === 'day') {
      nBuckets = 14;
      for (let i = 13; i >= 0; i--) {
        const d = addDiasH(today, -i);
        const es = hist.filter(h => h.date === d);
        labels.push(d.slice(8, 10) + '/' + d.slice(5, 7));
        data.push(horas(es));
        totalMin += sumMin(es); totalSes += es.length;
      }
    } else if (histView === 'week') {
      nBuckets = 8;
      for (let w = 7; w >= 0; w--) {
        const desde = addDiasH(today, -7 * (w + 1) + 1), hasta = addDiasH(today, -7 * w);
        const es = hist.filter(h => h.date >= desde && h.date <= hasta);
        labels.push(desde.slice(8, 10) + '/' + desde.slice(5, 7));
        data.push(horas(es));
        totalMin += sumMin(es); totalSes += es.length;
      }
    } else {
      nBuckets = 6;
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const pref = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        const es = hist.filter(h => h.date.slice(0, 7) === pref);
        labels.push(typeof CAL_MONTHS !== 'undefined' ? CAL_MONTHS[d.getMonth()].slice(0, 3) : pref.slice(5, 7));
        data.push(horas(es));
        totalMin += sumMin(es); totalSes += es.length;
      }
    }

    const vistaLbl = { day: 'día', week: 'semana', month: 'mes' }[histView];
    const avgMinSesion = totalSes ? Math.round(totalMin / totalSes) : 0;
    const avgSesBucket = Math.round(totalSes / nBuckets * 10) / 10;
    const avgMinBucket = Math.round(totalMin / nBuckets);

    const modHtml = `<div class="pomo-mod">
      <div class="pomo-mod-head">
        <div class="pomo-mod-title">Tiempo por ${vistaLbl}</div>
        <div class="pomo-seg">
          <button class="${histView === 'day' ? 'active' : ''}" onclick="Pomodoro.setHistView('day')">Día</button>
          <button class="${histView === 'week' ? 'active' : ''}" onclick="Pomodoro.setHistView('week')">Semana</button>
          <button class="${histView === 'month' ? 'active' : ''}" onclick="Pomodoro.setHistView('month')">Mes</button>
        </div>
      </div>
      <div class="pomo-chart"><canvas id="pomo-hist-canvas"></canvas></div>
      <div class="pomo-mod-foot">
        <span class="pomo-avg"><b>${avgMinSesion || '—'}′</b> por sesión</span>
        <span class="pomo-avg"><b>${avgSesBucket}</b> sesiones por ${vistaLbl}</span>
        <span class="pomo-avg"><b>${avgMinBucket}′</b> por ${vistaLbl}</span>
      </div>
    </div>`;

    // ── Bitácora: sesiones agrupadas por día, más nuevo primero ──
    const ayer = addDiasH(today, -1);
    const dayLbl = d => d === today ? 'Hoy' : d === ayer ? 'Ayer' : (typeof fmtDate === 'function' ? fmtDate(d) : d);
    const maxMin = Math.max(25, ...hist.map(e => e.minutes || 0));
    const byDay = {};
    hist.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
    const days = Object.keys(byDay).sort().reverse();

    const sessionRow = e => `<div class="pomo-row${e.full ? '' : ' is-cut'}">
      <span class="pomo-row-tick"></span>
      <span class="pomo-row-min">${e.minutes}′</span>
      <span class="pomo-row-bar" style="--w:${Math.max(6, Math.round((e.minutes || 0) / maxMin * 100))}%"></span>
      ${e.full ? '' : '<span class="pomo-tag-cut">Parcial</span>'}
      <span class="pomo-row-time">${new Date(e.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
      <button class="pomo-row-del" onclick="Pomodoro.deleteSession('${e.id}')" aria-label="Eliminar sesión">🗑</button>
    </div>`;
    const dayBlock = d => `<div class="pomo-day${d === today ? ' is-today' : ''}">
        <span class="pomo-day-lbl">${dayLbl(d)}</span>
        <span class="pomo-day-line"></span>
        <span class="pomo-day-tot">${fmtDur(sumMin(byDay[d]))}</span>
      </div>${byDay[d].slice().sort((a, b) => b.ts - a.ts).map(sessionRow).join('')}`;

    const logHtml = `<div class="pomo-log-head">
        <div class="pomo-log-title">Bitácora</div>
        <div class="pomo-log-count">${hist.length} sesión${hist.length === 1 ? '' : 'es'}</div>
      </div>
      <div class="pomo-log" id="pomo-log-scroll">${days.map(dayBlock).join('')}</div>`;

    histContainer.innerHTML = pulseHtml + modHtml + '<div class="pomo-sep"></div>' + logHtml;

    const logEl = document.getElementById('pomo-log-scroll');
    if (logEl && logEl.scrollHeight <= logEl.clientHeight) logEl.classList.add('is-short');

    const canvas = document.getElementById('pomo-hist-canvas');
    if (!canvas || typeof Chart === 'undefined') return;

    const _f = n => (typeof _cfs === 'function' ? _cfs(n) : n);
    histChartInst = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: data.map((_, i) => i === data.length - 1 ? '#6B8EFF' : 'rgba(107,142,255,.34)'),
          hoverBackgroundColor: '#8AA6FF',
          borderRadius: 5, maxBarThickness: 22
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(8,14,26,.94)', borderColor: 'rgba(107,142,255,.35)', borderWidth: 1,
            titleColor: '#EDF4FF', bodyColor: '#8BA5C0', padding: 9, displayColors: false,
            callbacks: { label: c => fmtDur(Math.round(c.parsed.y * 60)).replace(/<\/?span[^>]*>/g, '') }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false },
               ticks: { color: '#8BA5C0', font: { size: _f(11.5) }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { min: 0, grid: { color: 'rgba(107,142,255,.09)' }, border: { display: false },
               ticks: { color: '#8BA5C0', font: { size: _f(11.5) }, maxTicksLimit: 4, callback: v => v + 'h' } }
        }
      }
    });
  }

  return { mount, start, bump, togglePause, reset, endSession, pauseOnHide, onShow, mountHistory, setHistView, deleteSession };
})();
window.Pomodoro = Pomodoro;
