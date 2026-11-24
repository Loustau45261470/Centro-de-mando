// Anillo "Reactor" del % de hábitos: núcleo que gira más rápido y brilla más cuanto más alto el %, y dos arcos exteriores (mejor racha y
// racha actual, en días del mes). TODO el dibujo usa UN solo color por cuadro (externo = interno): rampa rojo → ámbar → color de la
// sección (--card-accent del lugar donde está el anillo; al 100 % es exactamente ese color).
// API: ReactorHabitos.mount(canvas, { key, pct (0-100), racha, mejor, dim, label })
// Rendimiento: UN solo requestAnimationFrame compartido (~30 fps) para todos los anillos; se detiene con la pestaña oculta o cuando ningún
// anillo está en pantalla (IntersectionObserver: cubre también la sección cerrada). prefers-reduced-motion = un cuadro estático.
(function () {
  'use strict';
  const TAU = Math.PI * 2, START = -Math.PI / 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mqRM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const RM = () => !!(mqRM && mqRM.matches);
  const rgbA = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const glow = (c, col, b, dpr) => { c.shadowColor = col; c.shadowBlur = b * dpr; };

  // Rampa: bajo = rojo, medio = ámbar, 100 % = color de la sección (mezcla lineal en RGB).
  const BAJO = [255, 51, 88], MEDIO = [245, 166, 35];
  function rampa(v, sec) {
    v = clamp(v);
    if (v <= .4) return [0, 1, 2].map((i) => lerp(BAJO[i], MEDIO[i], v / .4));
    return [0, 1, 2].map((i) => lerp(MEDIO[i], sec[i], (v - .4) / .6));
  }

  const reg = new Set(), memoria = {};   // memoria[key] = último % mostrado: al re-renderizar no se repite la intro
  let raf = 0, last = 0;

  // Color de la sección tal como lo ve el navegador (resuelve var(), color-mix, temas) vía la propiedad `color` del canvas.
  function colorSeccion(cv) {
    const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(getComputedStyle(cv).color || '');
    return m ? [+m[1], +m[2], +m[3]] : [56, 189, 248];
  }

  function medir(r) {
    const cv = r.cv, S = Math.round(cv.clientWidth);
    if (!S || S === r.W) return;
    r.W = S; r.dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(S * r.dpr); cv.height = Math.round(S * r.dpr);
  }

  function draw(r) {
    const S = r.W; if (!S) return;
    const c = r.ctx, cx = S / 2, cy = S / 2, t = r.t, dpr = r.dpr;
    const pe = r.intro ? ease((t - r.t0) / 1.6) : 1, v = r.v * (r.intro ? pe : 1);
    const col = rampa(v, r.sec), cs = rgbA(col, 1);
    r.col = col; r.cExt = cs; r.cInt = cs;   // un solo color para el anillo externo y el interno
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.globalAlpha = 1; c.shadowBlur = 0; c.setLineDash([]); c.lineCap = 'butt';
    c.clearRect(0, 0, S, S);
    let g = c.createRadialGradient(cx, cy, 0, cx, cy, S * (.18 + .3 * v));
    g.addColorStop(0, rgbA(col, .18 + .5 * v)); g.addColorStop(.6, rgbA(col, .06 + .1 * v)); g.addColorStop(1, rgbA(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, S * .5, 0, TAU); c.fill();
    // 60 marcas LED exteriores: encendidas hasta el %
    const lit = Math.round(v * 60);
    for (let i = 0; i < 60; i++) {
      const a = START + i / 60 * TAU, on = i < lit;
      c.strokeStyle = on ? rgbA(col, .95) : 'rgba(125,211,252,.18)'; c.lineWidth = on ? 1.6 : 1;
      if (on) glow(c, cs, 4, dpr); else c.shadowBlur = 0;
      const r1 = S * .497, r2 = S * (i % 5 === 0 ? .468 : .481);
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); c.stroke();
    }
    c.shadowBlur = 0;
    // arcos exteriores: mejor racha (más tenue) y racha actual, en fracción de los días del mes — mismo color que el resto
    [[.452, r.fMejor, .55], [.425, r.fRacha, 1]].forEach(([rad, f, al]) => {
      c.lineWidth = Math.max(1.4, S * .017); c.lineCap = 'round';
      c.strokeStyle = 'rgba(255,255,255,.06)'; c.beginPath(); c.arc(cx, cy, S * rad, 0, TAU); c.stroke();
      if (f * pe > .002) {
        glow(c, cs, 6, dpr); c.strokeStyle = rgbA(col, al); c.beginPath(); c.arc(cx, cy, S * rad, START, START + TAU * f * pe); c.stroke(); c.shadowBlur = 0;
      }
    });
    // anillo de progreso (el %)
    const R = S * .355, th = S * .06;
    c.lineCap = 'butt'; c.lineWidth = th; c.strokeStyle = 'rgba(255,255,255,.055)'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    const ea = START + v * TAU;
    if (v > .004) {
      c.lineCap = 'round'; glow(c, cs, 8 + 14 * v, dpr);
      if (c.createConicGradient) {
        const cg = c.createConicGradient(START, cx, cy);
        cg.addColorStop(0, rgbA(col, .3)); cg.addColorStop(clamp(v), rgbA(col, 1)); cg.addColorStop(clamp(v + .0005), rgbA(col, 0)); cg.addColorStop(1, rgbA(col, 0));
        c.strokeStyle = cg;
      } else c.strokeStyle = cs;
      c.beginPath(); c.arc(cx, cy, R, START, ea); c.stroke(); c.shadowBlur = 0;
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = th * .14; c.beginPath(); c.arc(cx, cy, R - th * .26, START, ea); c.stroke();
      for (let i = 0; i < 6; i++) {
        const a = ea - i * .06, f = 1 - i / 6; c.fillStyle = `rgba(255,255,255,${f * .9})`; glow(c, cs, 6, dpr);
        c.beginPath(); c.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, S * .011 * f + .4, 0, TAU); c.fill();
      }
      c.shadowBlur = 0;
    }
    // núcleo: anillos discontinuos que giran más rápido cuanto más alto el %
    const sp = .4 + 3.2 * v; c.lineCap = 'butt';
    [[.292, 26, -1, 1.8], [.262, 18, 1, 1.5], [.232, 36, -1, 1]].forEach(([rad, n, dir, lw], i) => {
      c.save(); c.translate(cx, cy); c.rotate(t * sp * dir * (1 + i * .35));
      c.setLineDash([S * rad * TAU / n * .55, S * rad * TAU / n * .45]); c.lineWidth = lw; c.strokeStyle = rgbA(col, .35 + .5 * v); glow(c, cs, 4 + 5 * v, dpr);
      c.beginPath(); c.arc(0, 0, S * rad, 0, TAU); c.stroke(); c.restore();
    });
    c.shadowBlur = 0; c.setLineDash([]);
    c.save(); c.translate(cx, cy); c.rotate(t * sp * 1.6); c.lineWidth = Math.max(1.4, S * .014); c.lineCap = 'round'; c.strokeStyle = rgbA(col, .9); glow(c, cs, 7, dpr);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; c.beginPath(); c.arc(0, 0, S * .205, a, a + .7); c.stroke(); }
    c.restore(); c.shadowBlur = 0;
    const cr = S * (.15 + .03 * v + .006 * v * Math.sin(t * 7));
    g = c.createRadialGradient(cx, cy, 0, cx, cy, cr);
    g.addColorStop(0, rgbA(col, .05)); g.addColorStop(.6, rgbA(col, .16 * v + .04)); g.addColorStop(1, rgbA(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, cr, 0, TAU); c.fill();
    if (r.target > .99 && pe > .95) {
      for (let i = 0; i < 2; i++) { const f = ((t * .7 + i * .5) % 1); c.strokeStyle = rgbA(col, (1 - f) * .5); c.lineWidth = 1.4; c.beginPath(); c.arc(cx, cy, S * (.1 + .38 * f), 0, TAU); c.stroke(); }
    }
    const key = cs;   // el número del centro toma el mismo color (cambia poco: solo se reescribe si cambió)
    if (key !== r.lastCc && r.wrap) { r.lastCc = key; r.wrap.style.setProperty('--cc', cs); }
    memoria[r.key] = r.v;
  }

  const activo = (r) => r.inView && r.cv.isConnected && r.W > 0;
  function frame(now) {
    raf = 0; if (document.hidden || RM()) return;
    const dt = Math.min(.05, (now - last) / 1000);
    if (dt < .03) { raf = requestAnimationFrame(frame); return; }   // ~30 fps (alivia el iPhone)
    last = now; let any = false;
    reg.forEach((r) => {
      if (!r.cv.isConnected) { if (r.io) r.io.disconnect(); if (r.ro) r.ro.disconnect(); reg.delete(r); return; }
      if (!activo(r)) return;
      any = true; r.t += dt; r.v += (r.target - r.v) * Math.min(1, dt * 4); r.sec = colorSeccion(r.cv); medir(r); draw(r); r.frames++;
    });
    if (any) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && !document.hidden && !RM()) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function estatico(r) { r.sec = colorSeccion(r.cv); medir(r); r.v = r.target; r.intro = false; r.t = 9.3; draw(r); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  if (mqRM && mqRM.addEventListener) mqRM.addEventListener('change', () => { if (RM()) reg.forEach(estatico); else kick(); });

  function mount(cv, o) {
    if (!cv || !cv.getContext) return null;
    o = o || {};
    const key = o.key || 'x', target = clamp((+o.pct || 0) / 100), dim = Math.max(1, +o.dim || 30);
    const vistoAntes = key in memoria;
    const r = { cv, ctx: cv.getContext('2d'), wrap: cv.parentElement, key, target, v: vistoAntes ? memoria[key] : 0, intro: !vistoAntes && !RM(),
      t: 0, t0: 0, W: 0, dpr: 1, frames: 0, inView: !('IntersectionObserver' in window), sec: [56, 189, 248],
      fRacha: clamp((+o.racha || 0) / dim), fMejor: clamp((+o.mejor || 0) / dim) };
    cv.style.color = 'var(--card-accent)';
    if (o.label) cv.setAttribute('aria-label', o.label);
    reg.add(r); cv._reactor = r;
    medir(r);
    if (RM()) estatico(r);
    else {
      r.sec = colorSeccion(cv); draw(r);   // cuadro inicial (nunca queda en blanco antes de entrar en pantalla)
      if ('IntersectionObserver' in window) { r.io = new IntersectionObserver((es) => { r.inView = es[es.length - 1].isIntersecting; if (r.inView) kick(); }); r.io.observe(cv); }
      else kick();
      if ('ResizeObserver' in window) { r.ro = new ResizeObserver(() => { medir(r); if (!raf) draw(r); }); r.ro.observe(cv); }
    }
    return r;
  }
  window.ReactorHabitos = { mount, rampa, estado: (cv) => cv && cv._reactor, get corriendo() { return !!raf; } };
})();
