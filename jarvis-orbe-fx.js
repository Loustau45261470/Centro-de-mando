/* ══════════════════════════════════════════════════════
   JARVIS ORBE FX — capa extra encima del orbe/red neuronal de la sección JARVIS
   (propuesta HUD #9 "orbe reactivo"). NO reemplaza nada: es un canvas aparte,
   pointer-events:none, que suma barras radiales reactivas a la voz, anillos
   elípticos con satélites, motas orbitando y una onda de impulso al tocar el orbe.
   Estados (de JARVIS_FX/JARVIS): reposo (passive/off) · escuchando (command, nivel
   del micrófono) · pensando (thinking, barrido) · hablando (JARVIS.isSpeaking()).
   Rendimiento: un solo rAF a ~30 fps; se detiene con la pestaña oculta, fuera de
   pantalla (IntersectionObserver) o sin dock. prefers-reduced-motion = sin capa.
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const mqRM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const NB = 84;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  let seed = 9; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const motes = Array.from({ length: 22 }, () => ({ r: 0.2 + rng() * 0.2, a: rng() * TAU, v: (0.2 + rng() * 0.6) * (rng() < 0.5 ? -1 : 1) }));

  let canvas = null, ctx = null, host = null, io = null, inView = !('IntersectionObserver' in window);
  let raf = 0, last = 0, t = 0, a = 0, imp = 0, W = 0, H = 0, DPR = 1, gradKey = '', grad = null;
  const st = { frames: 0, mode: 'reposo' };

  const canRun = () => !!canvas && !document.hidden && inView && !(mqRM && mqRM.matches);
  const fx = () => window.JARVIS_FX;
  const speaking = () => { try { return !!(window.JARVIS && JARVIS.isSpeaking()); } catch (e) { return false; } };
  const fxState = () => { try { return fx().getState(); } catch (e) { return 'passive'; } };
  const fxLevel = () => { try { return fx().getLevel(); } catch (e) { return 0; } };

  function resize() {
    if (!canvas || !host) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = host.clientWidth; H = host.clientHeight;
    canvas.width = Math.max(1, W * DPR); canvas.height = Math.max(1, H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    gradKey = '';
  }

  function onDown(e) {
    if (!canvas || !W) return;
    const r = host.getBoundingClientRect();
    const dx = e.clientX - r.left - W / 2, dy = e.clientY - r.top - H * 0.49;
    if (Math.hypot(dx, dy) <= Math.min(W, H) * 0.5) imp = 1; // un toque en el orbe le da un impulso
  }

  function draw() {
    const sp = speaking(), s = fxState();
    let mode = 'reposo';
    if (sp) mode = 'hablando'; else if (s === 'thinking') mode = 'pensando'; else if (s === 'command') mode = 'escuchando';
    st.mode = mode;
    const dt = 1 / 30;
    t += dt; imp = Math.max(0, imp - dt * 1.6);
    const w = Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1.2)), fl = 0.65 + 0.35 * Math.sin(t * 17) * Math.sin(t * 11.3);
    let tgt;
    if (mode === 'hablando') tgt = clamp(w * 1.5 * fl + 0.14);
    else if (mode === 'pensando') tgt = 0.42 + 0.12 * Math.sin(t * 5);
    else if (mode === 'escuchando') tgt = 0.12 + fxLevel() * 1.1;
    else tgt = (s === 'off' ? 0.02 : 0.05) + 0.03 * Math.sin(t * 1.7);
    a += (clamp(tgt + imp * 0.8) - a) * Math.min(1, dt * 10);

    const cx = W / 2, cy = H * 0.49;
    const cr = Math.min(W * 0.86, H * 0.78) * 0.13 + 6;           // mismo radio base que el núcleo de neural-fx
    const half = Math.min(W, H) / 2 - 4;
    const r0 = Math.min(cr * 2.6, half * 0.62), hmax = Math.max(8, half - r0);
    const vis = s === 'off' ? 0.4 : 1;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = vis;

    // halo reactivo (cian → magenta) detrás de todo
    let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, half);
    g.addColorStop(0, `rgba(56,189,248,${0.05 + 0.14 * a})`); g.addColorStop(0.6, `rgba(255,43,214,${0.015 + 0.07 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, half, 0, TAU); ctx.fill();

    // barras radiales reactivas (84), con pico magenta en la punta
    const key = r0 + '|' + hmax;
    if (key !== gradKey) {
      gradKey = key; grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r0 + hmax);
      grad.addColorStop(0, '#38BDF8'); grad.addColorStop(0.55, '#8C7BFF'); grad.addColorStop(1, '#FF2BD6');
    }
    const ang0 = t * 0.06, tips = [];
    const sweep = mode === 'pensando' ? (t * 1.8) % TAU : 0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < NB; i++) {
      const j = Math.min(i, NB - i), sh = 1 - j / (NB / 2) * 0.55, n = 0.5 + 0.5 * Math.sin(j * 1.1 + t * 9) * Math.cos(j * 0.43 - t * 6.5);
      const an = -Math.PI / 2 + i / NB * TAU + ang0;
      let k = sh * 0.55 + 0.45 * Math.abs(n);
      if (sweep) { let d = Math.abs(((an - sweep) % TAU + TAU + Math.PI) % TAU - Math.PI); k = k * 0.5 + Math.max(0, 1 - d / 0.9); } // barrido al pensar
      const h = 2 + a * hmax * 0.8 * k * (mode === 'pensando' ? 1.3 : 1);
      const c = Math.cos(an), sn = Math.sin(an);
      ctx.moveTo(cx + c * r0, cy + sn * r0); ctx.lineTo(cx + c * (r0 + h), cy + sn * (r0 + h));
      tips.push(cx + c * (r0 + h + 3), cy + sn * (r0 + h + 3));
    }
    ctx.strokeStyle = grad; ctx.lineWidth = Math.max(2, half * 0.014); ctx.globalAlpha = vis * (0.45 + 0.55 * clamp(a * 1.5, 0, 1)); ctx.stroke();
    ctx.globalAlpha = vis * 0.16; ctx.lineWidth = Math.max(5, half * 0.04); ctx.stroke();   // glow barato (sin shadowBlur)
    ctx.globalAlpha = vis * (0.35 + 0.6 * clamp(a * 1.5, 0, 1)); ctx.fillStyle = 'rgba(255,170,240,.9)'; ctx.beginPath();
    for (let i = 0; i < tips.length; i += 2) { ctx.moveTo(tips[i] + 1.5, tips[i + 1]); ctx.arc(tips[i], tips[i + 1], 1.5, 0, TAU); }
    ctx.fill();
    ctx.globalAlpha = vis;

    // anillos elípticos punteados con satélite blanco (aceleran con la actividad)
    [[1.3, 0.5, 0.3, 1], [1.18, 0.62, 2.1, -1], [1.44, 0.42, 4, 1]].forEach(([rx, ry, rot, dir], k) => {
      const R = r0 * 0.78;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot + t * 0.25 * dir);
      ctx.setLineDash([6, 7]); ctx.strokeStyle = `rgba(125,211,252,${0.18 + 0.3 * a})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, 0, R * rx, R * ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const an = t * (1 + k * 0.5 + a * 3) * dir;
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(Math.cos(an) * R * rx, Math.sin(an) * R * ry, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Math.cos(an) * R * rx, Math.sin(an) * R * ry, 2.2, 0, TAU); ctx.fill();
      ctx.restore();
    });

    // motas orbitando
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    motes.forEach(q => {
      const an = q.a + t * q.v * (1 + 2 * a), r = r0 * (0.55 + q.r * 1.4) + r0 * 0.04 * Math.sin(t * 3 + q.a);
      ctx.globalAlpha = vis * (0.25 + 0.6 * a);
      ctx.beginPath(); ctx.arc(cx + Math.cos(an) * r, cy + Math.sin(an) * r, 1.2, 0, TAU); ctx.fill();
    });

    // onda de impulso al tocar el orbe
    if (imp > 0.02) {
      ctx.globalAlpha = vis * imp * 0.7; ctx.strokeStyle = '#7DD3FC'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, cr * 1.2 + (1 - imp) * (half - cr * 1.2), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function frame() {
    raf = 0; if (!canRun()) return;
    const now = performance.now();
    if (now - last < 30) { raf = requestAnimationFrame(frame); return; } // ~30 fps
    last = now;
    if (!W || !H) resize();
    draw(); st.frames++;
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && canRun()) { last = 0; raf = requestAnimationFrame(frame); } };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  function mount(el) {
    if (canvas && host === el) { resize(); kick(); return; }
    unmount();
    host = el;
    canvas = document.createElement('canvas');
    canvas.id = 'jarvis-orbe-fx'; canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    host.appendChild(canvas);
    host.addEventListener('pointerdown', onDown);
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(es => { inView = es[es.length - 1].isIntersecting; inView ? kick() : stop(); });
      io.observe(host);
    }
    resize(); kick();
  }
  function unmount() {
    stop();
    if (io) { io.disconnect(); io = null; }
    if (host) host.removeEventListener('pointerdown', onDown);
    if (canvas) canvas.remove();
    canvas = ctx = host = null; W = H = 0;
  }

  // Lo llama jarvis-neural-fx al montar/desmontar el orbe en la sección
  function sync() {
    const docked = !!(fx() && fx().isDocked && fx().isDocked());
    const el = document.getElementById('jarvis-net');
    if (docked && el && !(mqRM && mqRM.matches)) mount(el); else unmount();
  }

  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : kick(); });
  window.addEventListener('resize', () => { if (canvas) resize(); });
  if (mqRM && mqRM.addEventListener) mqRM.addEventListener('change', sync);

  window.JARVIS_ORBE_FX = { sync, get frames() { return st.frames; }, get corriendo() { return !!raf; }, get modo() { return st.mode; } };
  sync();
})();
