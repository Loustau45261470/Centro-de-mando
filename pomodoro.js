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
  function start() {
    readCfgInputs();
    saveCfg();
    phase = 'study'; cycle = 1; remaining = cfg.study * 60; paused = false;
    startTick(); render();
  }
  function togglePause() { if (phase !== 'study' && phase !== 'break') return; paused = !paused; render(); }
  function reset() { stopTick(); phase = 'idle'; cycle = 1; remaining = 0; paused = false; render(); }
  // Al cerrar el overlay: cortar el intervalo (no dejar timer corriendo en background).
  function pauseOnHide() { if ((phase === 'study' || phase === 'break') && !paused) { paused = true; render(); } stopTick(); }
  function onShow() { if ((phase === 'study' || phase === 'break') && !timer) startTick(); render(); }

  function readCfgInputs() {
    if (!container) return;
    const g = id => container.querySelector('#' + id);
    if (g('pomo-study')) cfg.study = clampMin(g('pomo-study').value, DEF.study);
    if (g('pomo-break')) cfg.brk = clampMin(g('pomo-break').value, DEF.brk);
    if (g('pomo-cycles')) cfg.cycles = clampCycles(g('pomo-cycles').value);
  }

  // ── Render ──
  const fmt = s => { const m = Math.floor(Math.max(0, s) / 60), ss = Math.max(0, s) % 60; return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); };

  function mount(el) { container = el; render(); }

  function render() {
    if (!container) return;
    const inp = 'width:64px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 8px;font-size:13px;color:inherit;text-align:center';
    if (phase === 'idle' || phase === 'done') {
      container.innerHTML = `
        ${phase === 'done' ? `<div style="text-align:center;font-size:12px;color:var(--ok,#10E07C);font-weight:700;margin-bottom:8px">✅ Pomodoro completo · ${cfg.cycles} ciclos</div>` : ''}
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">
          <label style="font-size:10px;color:var(--tt);text-align:center">Estudio (min)<br><input id="pomo-study" type="number" min="1" value="${cfg.study}" style="${inp}"></label>
          <label style="font-size:10px;color:var(--tt);text-align:center">Descanso (min)<br><input id="pomo-break" type="number" min="1" value="${cfg.brk}" style="${inp}"></label>
          <label style="font-size:10px;color:var(--tt);text-align:center">Ciclos (1-${MAX_CYCLES})<br><input id="pomo-cycles" type="number" min="1" max="${MAX_CYCLES}" value="${cfg.cycles}" style="${inp}"></label>
        </div>
        <div style="text-align:center"><button class="btn btn-sm" onclick="Pomodoro.start()">▶ Iniciar Pomodoro</button></div>`;
      return;
    }
    const isStudy = phase === 'study';
    const accent = isStudy ? 'var(--accent,#6B8EFF)' : 'var(--ok,#10E07C)';
    container.innerHTML = `
      <div style="text-align:center">
        <div style="font-size:9px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:${accent}">${isStudy ? '📚 Estudio' : '☕ Descanso'} · Ciclo ${cycle}/${cfg.cycles}${paused ? ' · ⏸ EN PAUSA' : ''}</div>
        <div style="font-size:46px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;margin:6px 0;color:${accent}">${fmt(remaining)}</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-sm" onclick="Pomodoro.togglePause()">${paused ? '▶ Reanudar' : '⏸ Pausar'}</button>
          <button class="btn btn-ghost btn-sm" onclick="Pomodoro.reset()">■ Reiniciar</button>
        </div>
      </div>`;
  }

  return { mount, start, togglePause, reset, pauseOnHide, onShow };
})();
window.Pomodoro = Pomodoro;
