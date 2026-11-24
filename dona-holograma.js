// Dona "Holograma" del patrimonio (Finanzas): 72 bloques LED en dos filas, color desfasado, líneas de escaneo (CSS), parpadeo de
// encendido, tres anillos que giran en sentidos opuestos y etiquetas con línea guía. Canvas propio, sin Chart.js.
// API: DonaHolograma.create({ canvas, centroLbl, centroNum, centroSub, fmt, pct, onSelect }) → { setData, draw, destroy, ... }
//   setData(items, { totalText }) · items = [{ id, label, value, color }] (los de valor 0 no dibujan nada)
// Rendimiento: UN solo requestAnimationFrame, a ~30 fps; se detiene con la pestaña oculta (visibilitychange) o fuera de pantalla
// (IntersectionObserver: también cubre la pestaña Finanzas cerrada). Con prefers-reduced-motion dibuja un cuadro estático.
(function () {
  'use strict';
  const TAU = Math.PI * 2, START = -Math.PI / 2, NC = 72;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const flick = (u, i) => { if (u <= 0) return 0; if (u >= .7) return 1; const h = Math.sin(u * 90 + i * 12.9898) * 43758.5453; return (h - Math.floor(h)) > .5 ? 1 : .18; };
  const mqRM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const RM = () => !!(mqRM && mqRM.matches);

  // Color a "neón": misma tonalidad, saturación alta y luminosidad media-alta para que resalte sobre el fondo oscuro.
  function neon(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); const n = parseInt(m ? m[1] : '3DE8FF', 16);
    const r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
    }
    s = Math.max(s, .85); l = clamp(l, .58, .68);
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return Math.round(255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p)); };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a)})`;

  // Reparte los 72 bloques entre las categorías con valor (resto mayor; al menos uno a cada una).
  function reparto(vals) {
    const tot = vals.reduce((s, v) => s + v, 0); if (tot <= 0) return vals.map(() => 0);
    const raw = vals.map((v) => v / tot * NC), cnt = raw.map(Math.floor);
    let resto = NC - cnt.reduce((s, v) => s + v, 0);
    raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (resto > 0) { cnt[i]++; resto--; } });
    vals.forEach((v, i) => { if (v > 0 && !cnt[i]) { cnt[cnt.indexOf(Math.max(...cnt))]--; cnt[i] = 1; } });
    return cnt;
  }

  function create(o) {
    const cv = o.canvas, ctx = cv.getContext('2d'), root = cv.parentElement;
    const fmt = o.fmt || ((n) => String(Math.round(n))), pct = o.pct || ((f) => (f * 100).toFixed(1).replace('.', ',') + '%');
    const st = { items: [], owner: [], total: 0, totalText: '', W: 0, H: 0, D: 0, RO: 0, RT: 0, r2: 1.12, wide: true, fs: 11, dpr: 1,
      t: RM() ? 9.3 : 0, hv: [], hAny: 0, hover: -1, pinned: -1, frames: 0 };
    let raf = 0, last = 0, inView = !('IntersectionObserver' in window), seen = false, fam = 'sans-serif';
    const tip = document.createElement('div'); tip.className = 'nw-dona-tip'; tip.setAttribute('aria-hidden', 'true'); root.appendChild(tip);

    const target = () => (st.hover >= 0 ? st.hover : st.pinned);
    const canRun = () => !RM() && !document.hidden && inView && cv.isConnected && st.W > 0;

    // ── Datos ──
    function setData(items, opt) {
      const vals = items.map((it) => Math.max(0, +it.value || 0)), cnt = reparto(vals), tot = vals.reduce((s, v) => s + v, 0);
      let c0 = 0;
      st.items = items.map((it, i) => {
        const f = tot > 0 ? vals[i] / tot : 0, r = { id: it.id, label: it.label, value: vals[i], f, color: it.color, rgb: neon(it.color), c0, c1: c0 + cnt[i] };
        r.a0 = c0 / NC * TAU; r.a1 = r.c1 / NC * TAU; c0 += cnt[i]; return r;
      });
      st.owner = []; st.items.forEach((it, i) => { for (let k = it.c0; k < it.c1; k++) st.owner[k] = i; });
      st.total = tot; st.totalText = (opt && opt.totalText) || fmt(tot);
      st.hv = st.items.map((_, i) => st.hv[i] || 0);
      if (st.hover >= st.items.length) st.hover = -1;
      if (st.pinned >= st.items.length || (st.pinned >= 0 && !st.items[st.pinned].value)) st.pinned = -1;
      cv.setAttribute('aria-label', 'Patrimonio ' + st.totalText + (tot > 0 ? ': ' + st.items.filter((it) => it.value > 0).map((it) => `${it.label} ${fmt(it.value)} (${pct(it.f)})`).join(', ') : ''));
      layout(true); centro(); if (!canRun()) draw();
    }
    function centro() {
      const i = target(), it = i >= 0 ? st.items[i] : null;
      if (o.centroLbl) o.centroLbl.textContent = it ? it.label : 'Patrimonio';
      if (o.centroNum) o.centroNum.textContent = it ? fmt(it.value) : st.totalText;
      if (o.centroSub) o.centroSub.textContent = it ? pct(it.f) + ' del total' : '';
      root.classList.toggle('sel', !!it);
      if (it) root.style.setProperty('--cc', rgba(it.rgb, 1)); else root.style.removeProperty('--cc');
    }
    function setTarget(h, p) {
      const a = target(); if (h !== undefined) st.hover = h; if (p !== undefined) st.pinned = p;
      if (target() !== a) centro();
      if (!canRun()) { const t = target(); st.hv = st.items.map((_, i) => i === t ? 1 : 0); st.hAny = t >= 0 ? 1 : 0; draw(); }
    }

    // ── Medidas ──
    // Tamaño: el anillo de la variante A ocupa .785 del lado de su lienzo (R=.34 + grosor .105/2, con el lienzo tope en 440 px). Acá el anillo
    // tiene ese mismo diámetro y grosor (RT/D = .105/.785). Si el ancho alcanza, las etiquetas van afuera con línea guía; si no, el anillo
    // conserva el tamaño de A y el % de cada porción va adentro del aro (nombre y monto, en el centro al tocar y en la leyenda).
    function layout(force) {
      const W = Math.round(cv.clientWidth); if (!W) return;
      if (!force && W === st.W && st.D) return;
      fam = (o.centroNum && getComputedStyle(o.centroNum).fontFamily) || fam;
      const dA = .785 * Math.min(W, 440), fs = 10.5;
      let labelW = 0;
      ctx.save();
      st.items.forEach((it) => { if (!it.value) return; ctx.font = `500 ${fs * .88}px ${fam}`; labelW = Math.max(labelW, ctx.measureText(it.label.toUpperCase()).width);
        ctx.font = `700 ${fs * 1.3}px ${fam}`; labelW = Math.max(labelW, ctx.measureText(pct(it.f)).width); ctx.font = `500 ${fs}px ${fam}`; labelW = Math.max(labelW, ctx.measureText(fmt(it.value)).width); });
      ctx.restore();
      const dWide = 2 * (W / 2 - labelW - 23) / 1.12;   // 23 px = punto de la línea guía + codo + tramo horizontal + aire con el texto
      st.wide = dWide >= dA * .88;
      const D = st.wide ? Math.min(dA, dWide) : dA;
      st.r2 = st.wide ? 1.12 : 1.08;   // radio (en RO) del anillo giratorio más externo
      st.W = W; st.D = D; st.RO = D / 2; st.RT = D * .105 / .785; st.fs = fs;
      st.H = Math.round(D * (st.wide ? 1.2 : 1.12) + 8);
      st.dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.height = st.H + 'px'; cv.width = Math.round(W * st.dpr); cv.height = Math.round(st.H * st.dpr);
      st.top = st.H / 2 - st.RO * st.r2;   // lienzo → anillo giratorio más externo (arriba y abajo)
      root.style.setProperty('--nw-d', D.toFixed(1) + 'px'); root.style.setProperty('--nw-top', st.top.toFixed(1) + 'px');
      place(); if (RM()) draw();
    }
    // Línea guía y posición de cada etiqueta: del mismo lado que su porción, sin pisarse (se separan en vertical).
    function place() {
      const cx = st.W / 2, cy = st.H / 2, R0 = st.RO * st.r2 + 4, fs = st.fs;
      st.items.forEach((it) => {
        const mid = START + (it.a0 + it.a1) / 2, cs = Math.cos(mid), sn = Math.sin(mid);
        it.side = cs >= 0 ? 1 : -1; it.p0 = { x: cx + cs * R0, y: cy + sn * R0 }; it.ly = it.p0.y; it.mid = mid;
      });
      if (!st.wide) return;
      const hBlk = fs * 3.9, lo = st.top + 4 + fs * 1.9, hi = st.H - fs * 1.8 - 2;
      [1, -1].forEach((sd) => {
        const g = st.items.filter((it) => it.value > 0 && it.side === sd).sort((a, b) => a.ly - b.ly);
        g.forEach((it) => { it.ly = clamp(it.ly, lo, hi); });
        for (let i = 1; i < g.length; i++) if (g[i].ly < g[i - 1].ly + hBlk) g[i].ly = g[i - 1].ly + hBlk;
        for (let i = g.length - 1; i >= 0; i--) { const mx = hi - (g.length - 1 - i) * hBlk; if (g[i].ly > mx) g[i].ly = mx; }
        // el codo queda afuera del anillo más externo a la altura de la etiqueta (si no, el texto cae sobre los bloques)
        g.forEach((it) => { const dy = it.ly - cy, rr = st.RO * st.r2, chord = Math.abs(dy) < rr ? Math.sqrt(rr * rr - dy * dy) : 0; it.ex = cx + sd * (Math.max(Math.abs(it.p0.x - cx), chord) + 8); });
      });
    }

    // ── Dibujo ──
    function draw() {
      const W = st.W, H = st.H; if (!W) return;
      const t = st.t, cx = W / 2, cy = H / 2, RO = st.RO, RT = st.RT, wide = st.wide, k = Math.min(1.5, st.D / 196);
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      const empty = st.total <= 0, hv = st.hv, hAny = st.hAny;
      let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, RO * 1.7);
      g.addColorStop(0, 'rgba(61,232,255,.12)'); g.addColorStop(1, 'rgba(61,232,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, RO * 1.7, 0, TAU); ctx.fill();
      const glob = .96 + .04 * Math.sin(t * 31), ra = flick(t - .15, 3) * glob, r2 = st.r2, r1 = r2 - .04;
      ctx.save(); ctx.translate(cx, cy); ctx.lineWidth = 1.6; ctx.globalAlpha = ra;
      ctx.rotate(t * .4); ctx.setLineDash([RO * .2, RO * .065]); ctx.strokeStyle = 'rgba(61,232,255,.75)'; ctx.beginPath(); ctx.arc(0, 0, RO * r1, 0, TAU); ctx.stroke();
      ctx.rotate(-t * .4 - t * .55); ctx.lineWidth = 1; ctx.setLineDash([RO * .73, RO * .25, RO * .08, RO * .25]); ctx.strokeStyle = 'rgba(255,106,213,.7)'; ctx.beginPath(); ctx.arc(0, 0, RO * r2, 0, TAU); ctx.stroke();
      ctx.rotate(t * .55 - t * .3); ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(124,255,178,.5)'; ctx.beginPath(); ctx.arc(0, 0, RO * .645, 0, TAU); ctx.stroke();
      ctx.restore(); ctx.setLineDash([]);
      const glitch = (t % 7 < .12 && t > 2) ? 1 : 0;
      const ab = k * (1.2 + 1.2 * Math.pow(Math.sin(t * 1.3), 2)) + (t < 1.8 ? k * 5 * (1.8 - t) / 1.8 : 0) + glitch * k * 5;
      const row0 = RT * .571, row1o = RT * .629, grow = RO * .065;
      const cells = (dx, dy, mode) => {
        for (let i = 0; i < NC; i++) {
          const ci = empty ? -1 : st.owner[i], it = ci >= 0 ? st.items[ci] : null; if (!empty && !it) continue;
          const h = it ? hv[ci] : 0, f = flick(t - .35 - i * .018, i); if (f <= 0) continue;
          const a0 = START + i / NC * TAU + .009, a1 = START + (i + 1) / NC * TAU - .009, rO = RO + grow * h;
          const chase = .78 + .22 * Math.sin(t * 3 - i * .5) + (Math.max(0, Math.sin(t * 1.1 - i * .09)) > .985 ? .5 : 0);
          const base = f * glob * chase * (empty ? .22 : 1 - .65 * hAny * (1 - h));
          for (let row = 0; row < 2; row++) {
            const rOut = row ? rO - row1o : rO, rIn = row ? RO - RT : rO - row0;
            ctx.beginPath(); ctx.arc(cx + dx, cy + dy, rOut, a0, a1); ctx.arc(cx + dx, cy + dy, rIn, a1, a0, true); ctx.closePath();
            const al = base * (row ? .55 : 1);
            ctx.fillStyle = mode === 0 ? rgba(it ? it.rgb : [110, 150, 200], al) : mode === 1 ? `rgba(255,40,90,${clamp(al * .4)})` : `rgba(40,90,255,${clamp(al * .4)})`;
            ctx.fill();
          }
        }
      };
      ctx.globalCompositeOperation = 'lighter';
      if (!empty) st.items.forEach((it, i) => {
        if (!it.value) return;
        // Resplandor en tres trazos anchos y translúcidos (shadowBlur cuesta el doble de cuadro en el iPhone)
        ctx.save(); ctx.strokeStyle = rgba(it.rgb, 1); const ga = flick(t - .9, i) * (1 - .6 * hAny * (1 - hv[i]));
        ctx.beginPath(); ctx.arc(cx, cy, RO - RT * .45, START + it.a0 + .02, START + it.a1 - .02);
        [[1.5, .05], [1.1, .07], [.7, .1]].forEach(([w, a]) => { ctx.globalAlpha = a * ga; ctx.lineWidth = RT * w; ctx.stroke(); }); ctx.restore();
      });
      cells(-ab, 0, 1); cells(ab, 0, 2);
      ctx.globalCompositeOperation = 'source-over'; cells(0, 0, 0);
      if (!empty) st.items.forEach((it, i) => { if (!it.value) return; (wide ? etiqueta : enAro)(it, i); });
    }
    // Etiqueta exterior (ancho): línea guía + nombre, % y monto.
    function etiqueta(it, i) {
      const t = st.t, lp = ease((t - 1.1 - i * .18) / .7); if (lp <= 0) return;
      const fs = st.fs, h = st.hv[i], col = rgba(it.rgb, 1), d = it.side, dim = 1 - .55 * st.hAny * (1 - h);
      const p0 = it.p0, p1 = { x: it.ex, y: it.ly }, p2 = { x: it.ex + d * 8, y: it.ly };
      ctx.save(); ctx.globalAlpha = lp * dim; ctx.strokeStyle = col; ctx.lineWidth = 1 + .8 * h;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      if (lp < .5) ctx.lineTo(p0.x + (p1.x - p0.x) * lp * 2, p0.y + (p1.y - p0.y) * lp * 2);
      else { const q = (lp - .5) * 2; ctx.lineTo(p1.x, p1.y); ctx.lineTo(p1.x + (p2.x - p1.x) * q, p2.y); }
      ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p0.x, p0.y, 2.2, 0, TAU); ctx.fill();
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = d > 0 ? 'left' : 'right';
      const x = p2.x + d * 3;
      ctx.globalAlpha = lp * (1 - .5 * st.hAny * (1 - h));
      ctx.fillStyle = '#8BA5C0'; ctx.font = `500 ${fs * .88}px ${fam}`; ctx.fillText(it.label.toUpperCase(), x, it.ly - fs * 1.1);
      ctx.fillStyle = col; ctx.font = `700 ${fs * 1.3}px ${fam}`; ctx.fillText(pct(it.f), x, it.ly + fs * .3);
      ctx.fillStyle = '#EDF4FF'; ctx.font = `500 ${fs}px ${fam}`; ctx.fillText(fmt(it.value), x, it.ly + fs * 1.6);
      ctx.restore();
    }
    // Ancho justo (celular): el % va adentro del aro, solo si la porción es lo bastante larga para que quepa.
    function enAro(it, i) {
      const t = st.t, lp = ease((t - 1.1 - i * .18) / .7); if (lp <= 0) return;
      const rm = st.RO - st.RT * .5, ang = (it.a1 - it.a0) * rm, fs = st.fs; ctx.save();
      ctx.font = `700 ${fs}px ${fam}`; const txt = pct(it.f), w = ctx.measureText(txt).width;
      const horiz = Math.abs(Math.cos(it.mid)) > .5;   // arriba/abajo el texto corre a lo largo del aro; a los lados, a lo ancho
      if (ang >= (horiz ? fs * 1.3 : w + 6) && (horiz ? st.RT >= w + 6 : true)) {
        ctx.globalAlpha = lp * (1 - .6 * st.hAny * (1 - st.hv[i])); ctx.fillStyle = '#02121C'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, st.W / 2 + Math.cos(it.mid) * rm, st.H / 2 + Math.sin(it.mid) * rm);
      }
      ctx.restore();
    }

    // ── Puntero ──
    function hit(x, y, touch) {
      if (st.total <= 0) return -1;
      const dx = x - st.W / 2, dy = y - st.H / 2, d = Math.hypot(dx, dy), pad = touch ? 16 : 8;
      if (d < st.RO - st.RT - pad || d > st.RO + pad + 6) return -1;
      let a = Math.atan2(dy, dx) - START; a = ((a % TAU) + TAU) % TAU;
      const c = st.owner[Math.min(NC - 1, Math.floor(a / TAU * NC))]; return c === undefined ? -1 : c;
    }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function mostrarTip(i, x, y) {
      if (i < 0) { tip.style.display = 'none'; return; }
      const it = st.items[i]; tip.textContent = `${it.label}: ${fmt(it.value)} · ${pct(it.f)}`;
      tip.style.display = 'block'; tip.style.left = clamp(x, 8, st.W - 8) + 'px'; tip.style.top = (y - 10) + 'px';
    }
    cv.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const [x, y] = pos(e), i = hit(x, y); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; mostrarTip(i, x, y); setTarget(i); });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { mostrarTip(-1); setTarget(-1); } });
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e), i = hit(x, y, e.pointerType !== 'mouse');
      if (e.pointerType !== 'mouse') setTarget(undefined, i >= 0 && i !== st.pinned ? i : -1);
      if (i >= 0 && o.onSelect) o.onSelect(st.items[i].id);
    });

    // ── Animación: un solo rAF ──
    function frame(now) {
      raf = 0; if (!canRun()) return;
      const dt = Math.min(.05, (now - last) / 1000);
      if (dt < .03) { raf = requestAnimationFrame(frame); return; }   // ~30 fps (alivia el iPhone)
      last = now; st.t += dt;
      const kk = Math.min(1, dt * 12), tg = target();
      st.hv = st.hv.map((v, i) => v + ((tg === i ? 1 : 0) - v) * kk); st.hAny += ((tg >= 0 ? 1 : 0) - st.hAny) * kk;
      draw(); st.frames++; raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && canRun()) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    const onVis = () => { if (document.hidden) stop(); else kick(); };
    document.addEventListener('visibilitychange', onVis);
    const onRM = () => { if (RM()) { stop(); st.t = 9.3; setTarget(); } else kick(); };
    if (mqRM && mqRM.addEventListener) mqRM.addEventListener('change', onRM);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { layout(); kick(); }) : null; if (ro) ro.observe(cv);
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
      inView = es[es.length - 1].isIntersecting; if (inView && !seen) { seen = true; if (!RM()) st.t = 0; }
      if (inView) { layout(); kick(); } else stop();
    }) : null; if (io) io.observe(root);
    if (!io) { seen = true; }

    return {
      setData, draw, layout: () => layout(true), kick,
      get frames() { return st.frames; }, get corriendo() { return !!raf; }, get estado() { return st; },
      destroy() { stop(); document.removeEventListener('visibilitychange', onVis); if (mqRM && mqRM.removeEventListener) mqRM.removeEventListener('change', onRM); if (ro) ro.disconnect(); if (io) io.disconnect(); tip.remove(); },
    };
  }
  window.DonaHolograma = { create };
})();
