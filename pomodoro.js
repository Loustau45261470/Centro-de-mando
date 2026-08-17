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
  let remaining = 0;           // segundos restantes del bloque
  let paused = false;
  let timer = null;
  let container = null;
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
  function logSesion(today) {
    try {
      if (typeof S === 'undefined') return;
      S.pomodoroHistory = S.pomodoroHistory || [];
      S.pomodoroHistory.push({ id: uid(), date: today, minutes: cfg.study, ts: Date.now() });
      saveState(); // no depender de que markHabitDay llegue a guardar
    } catch (e) {}
  }

  // ── Timer ──
  function startTick() { stopTick(); timer = setInterval(tick, 1000); }
  function stopTick() { if (timer) { clearInterval(timer); timer = null; } }

  function tick() {
    if (paused) return;
    remaining--;
    if (remaining < 0) { advance(); return; }
    render();
  }

  function advance() {
    if (phase === 'study') {
      const today = typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10);
      logSesion(today);
      markHabitDay('done', today);
      renderHistory();
      if (cycle < cfg.cycles) {
        phase = 'break'; remaining = cfg.brk * 60;
        announce('☕ Descanso — bloque ' + cycle + ' completo', 'Study block complete, sir. Take a break.');
      } else {
        finish();
        return;
      }
    } else if (phase === 'break') {
      cycle++; phase = 'study'; remaining = cfg.study * 60;
      announce('📚 Estudio — ciclo ' + cycle + '/' + cfg.cycles, 'Break over, sir. Back to work.');
    }
    render();
  }

  function finish() {
    stopTick();
    phase = 'done'; paused = false;
    announce('✅ Pomodoro completo — ' + cfg.cycles + ' ciclos', 'Pomodoro complete, sir. Well done.');
    render();
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
    phase = 'study'; cycle = 1; remaining = cfg.study * 60; paused = false;
    startTick(); render();
    markHabitDay('partial');
  }
  function togglePause() { if (phase !== 'study' && phase !== 'break') return; paused = !paused; render(); }
  function reset() { stopTick(); phase = 'idle'; cycle = 1; remaining = 0; paused = false; render(); }
  // Al cerrar el overlay: cortar el intervalo (no dejar timer corriendo en background).
  function pauseOnHide() { if ((phase === 'study' || phase === 'break') && !paused) { paused = true; render(); } stopTick(); }
  function onShow() { if ((phase === 'study' || phase === 'break') && !timer) startTick(); render(); renderHistory(); }

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
      container.innerHTML = `
        ${phase === 'done' ? `<div class="pomo-done">✅ Pomodoro completo · ${cfg.cycles} ciclos</div>` : ''}
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
        </div>
      </div>`;
  }

  // ── Historial de sesiones (día / semana / mes) ──
  const addDiasH = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  function mountHistory(el) { histContainer = el; renderHistory(); }

  function setHistView(v) { histView = v; renderHistory(); }

  function renderHistory() {
    if (!histContainer) return;
    if (histChartInst) { histChartInst.destroy(); histChartInst = null; }
    const hist = (typeof S !== 'undefined' && Array.isArray(S.pomodoroHistory)) ? S.pomodoroHistory : [];
    if (!hist.length) {
      histContainer.innerHTML = '<div class="empty-state" style="padding:14px 0">Sin pomodoros registrados todavía.</div>';
      return;
    }
    const today = typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10);
    const sumMin = arr => arr.reduce((a, e) => a + (e.minutes || 0), 0);
    const tile = (n, mins, lbl) => `<div class="ci-kpi"><div class="ci-kpi-num">${n}</div><div class="ci-kpi-lbl">${lbl} · ${mins}′</div></div>`;

    const hoyE = hist.filter(h => h.date === today);
    const semDesde = addDiasH(today, -6);
    const semE = hist.filter(h => h.date >= semDesde && h.date <= today);
    const mesPref = today.slice(0, 7);
    const mesE = hist.filter(h => h.date.slice(0, 7) === mesPref);

    const tilesHtml = `<div class="ci-kpis pomo-hist-kpis">
      ${tile(hoyE.length, sumMin(hoyE), '🍅 Hoy')}
      ${tile(semE.length, sumMin(semE), 'Esta semana')}
      ${tile(mesE.length, sumMin(mesE), 'Este mes')}
    </div>`;

    const toggleHtml = `<div class="habit-view-toggle" style="margin-top:12px">
      <button class="${histView === 'day' ? 'active' : ''}" onclick="Pomodoro.setHistView('day')">Día</button>
      <button class="${histView === 'week' ? 'active' : ''}" onclick="Pomodoro.setHistView('week')">Semana</button>
      <button class="${histView === 'month' ? 'active' : ''}" onclick="Pomodoro.setHistView('month')">Mes</button>
    </div>`;

    histContainer.innerHTML = tilesHtml + toggleHtml + `<div style="height:160px;margin-top:10px"><canvas id="pomo-hist-canvas"></canvas></div>`;

    const canvas = document.getElementById('pomo-hist-canvas');
    if (!canvas || typeof Chart === 'undefined') return;

    let labels = [], data = [];
    if (histView === 'day') {
      for (let i = 13; i >= 0; i--) {
        const d = addDiasH(today, -i);
        labels.push(d.slice(8, 10) + '/' + d.slice(5, 7));
        data.push(hist.filter(h => h.date === d).length);
      }
    } else if (histView === 'week') {
      for (let w = 7; w >= 0; w--) {
        const desde = addDiasH(today, -7 * (w + 1) + 1), hasta = addDiasH(today, -7 * w);
        labels.push(desde.slice(8, 10) + '/' + desde.slice(5, 7));
        data.push(hist.filter(h => h.date >= desde && h.date <= hasta).length);
      }
    } else {
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const pref = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        labels.push(typeof CAL_MONTHS !== 'undefined' ? CAL_MONTHS[d.getMonth()].slice(0, 3) : pref.slice(5, 7));
        data.push(hist.filter(h => h.date.slice(0, 7) === pref).length);
      }
    }

    histChartInst = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: 'rgba(107,142,255,.6)', borderRadius: 2, barThickness: 10 }] },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { min: 0, ticks: { precision: 0, font: { size: typeof _cfs === 'function' ? _cfs(13) : 13 } } },
          y: { ticks: { font: { size: typeof _cfs === 'function' ? _cfs(13) : 13 } } }
        }
      }
    });
  }

  return { mount, start, bump, togglePause, reset, pauseOnHide, onShow, mountHistory, setHistView };
})();
window.Pomodoro = Pomodoro;
