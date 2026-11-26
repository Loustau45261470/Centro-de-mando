// Gráfico de evolución del patrimonio — «trazo vivo» (propuesta #6 de la maqueta HUD).
// Plugin propio de Chart.js: Chart.js calcula escalas y la curva (el dataset queda transparente y
// sin puntos) y este plugin dibuja encima la línea con degradé, el tramo encendido (a la izquierda
// de la luz) y el apagado (a la derecha), la franja de luz que recorre el gráfico sola, la línea que
// se dibuja al entrar a Finanzas y la punta que late con anillos.
// La animación corre solo con el gráfico en pantalla y la pestaña visible (IntersectionObserver +
// visibilitychange). Con prefers-reduced-motion: línea entera encendida y quieta, sin luz.
// El crosshair HUD (_nwCrosshair, app.js) lee chart._nwTz para que el cartel siga a la luz.
'use strict';
const NWTrazo = (() => {
  const DIBUJO_S = 2.2;   // duración del trazo al entrar (igual que la maqueta)
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const quieto = () => !!(mq && mq.matches);
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);

  function actualizar(chart) {
    const st = chart._nwTz; if (!st) return;
    const on = st.vis && !document.hidden && !quieto();
    st.active = on;
    if (on && !st.raf) {
      if (st.pending) { st.pending = false; st.it = 0; }   // entró a Finanzas: la línea se vuelve a dibujar
      st.last = performance.now();
      st.raf = requestAnimationFrame(t => cuadro(chart, t));
    } else if (!on && st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
    if (!on) chart.draw();   // queda el último cuadro (o la línea fija con reduced-motion)
  }
  function cuadro(chart, now) {
    const st = chart._nwTz; if (!st || !st.active) { if (st) st.raf = 0; return; }
    st.dt = Math.min(.1, Math.max(0, (now - st.last) / 1000)); st.last = now;
    st.t += st.dt; st.it += st.dt;
    chart.draw();
    st.raf = requestAnimationFrame(t => cuadro(chart, t));
  }

  return {
    id: 'nwTrazo',
    // Vuelve a dibujar la línea desde cero (al cambiar de rango o de serie).
    replay(chart) { const st = chart && chart._nwTz; if (st) { st.it = 0; st.cx = -1; } },
    afterInit(chart) {
      const st = chart._nwTz = { t: 0, it: 0, dt: 0, last: 0, raf: 0, vis: false, active: false, pending: true, cx: -1, xd: 0 };
      if ('IntersectionObserver' in window) {
        st.io = new IntersectionObserver(es => {
          const e = es[es.length - 1];
          // Tamaño 0 = la pestaña está oculta (display:none): al volver a Finanzas la línea se redibuja.
          if (!e.boundingClientRect.width) st.pending = true;
          st.vis = e.isIntersecting; actualizar(chart);
        }, { threshold: .08 });
        st.io.observe(chart.canvas);
      } else { st.vis = true; }
      st.onVis = () => actualizar(chart);
      document.addEventListener('visibilitychange', st.onVis);
      if (mq) mq.addEventListener('change', st.onVis);
    },
    beforeDestroy(chart) {
      const st = chart._nwTz; if (!st) return;
      if (st.raf) cancelAnimationFrame(st.raf);
      if (st.io) st.io.disconnect();
      document.removeEventListener('visibilitychange', st.onVis);
      if (mq) mq.removeEventListener('change', st.onVis);
      chart._nwTz = null;
    },
    afterDatasetsDraw(chart) {
      const st = chart._nwTz, ds = chart.data.datasets[0], meta = chart.getDatasetMeta(0), line = meta && meta.dataset, area = chart.chartArea;
      if (!st || !ds || !line || !area) return;
      const pts = meta.data.filter(p => p && !p.skip && Number.isFinite(p.x) && Number.isFinite(p.y));
      st.on = false;
      if (!pts.length) return;
      const c = chart.ctx, rm = quieto(), t = st.t, W = area.right - area.left;
      const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
      const pr = rm ? 1 : ease(st.it / DIBUJO_S);
      const xd = x0 + (x1 - x0) * pr;
      let tip = pts[pts.length - 1];
      if (pr < 1) { let q = line.interpolate({ x: xd }, 'x'); if (Array.isArray(q)) q = q[0]; if (q && Number.isFinite(q.y)) tip = q; }
      // Dónde está la luz: con el dedo/mouse encima, en el punto elegido; mientras la línea se dibuja, en la punta;
      // después va y viene sola (como la maqueta).
      const m = chart._nwXh, a = m && m.sel != null ? m.anchors[m.sel] : null;
      const meta0 = a ? meta.data[a.i] : null;
      const objetivo = meta0 ? meta0.x : rm ? x1 : pr < 1 ? xd : x0 + (x1 - x0) * (.5 + .5 * Math.sin(t * .55 - 1.3));
      if (st.cx < 0 || !st.active || (pr < 1 && !meta0)) st.cx = objetivo; else st.cx += (objetivo - st.cx) * Math.min(1, st.dt * 9);
      const cx = st.cx;
      st.xd = xd; st.on = st.active && !rm;

      const col = ds._tz || '#6BE3A4', relleno = ds._tzFill || '#38BDF8', yMin = Math.min(...pts.map(q => q.y));
      const grad = c.createLinearGradient(x0, 0, Math.max(x1, x0 + 1), 0);
      grad.addColorStop(0, '#8C7BFF'); grad.addColorStop(.5, '#3DE8FF'); grad.addColorStop(1, col);
      const camino = () => { c.beginPath(); line.path(c); };
      const area_ = alfa => {
        camino(); c.lineTo(x1, area.bottom); c.lineTo(x0, area.bottom); c.closePath();
        const g = c.createLinearGradient(0, yMin, 0, area.bottom);   // desde el pico de la línea: el relleno se ve pegado al trazo
        g.addColorStop(0, _hexA(relleno, .4 * alfa)); g.addColorStop(1, _hexA(relleno, 0));
        c.fillStyle = g; c.fill();
      };
      const clip = (l, r) => { c.beginPath(); c.rect(l, area.top - 24, Math.max(0, r - l), area.bottom - area.top + 30); c.clip(); };

      c.save();
      c.lineJoin = 'round'; c.lineCap = 'round';
      clip(area.left - 4, xd + 1);   // lo que todavía no se dibujó no se ve
      // Tramo apagado (a la derecha de la luz)
      c.save(); clip(cx, area.right + 30); area_(.3);
      camino(); c.strokeStyle = grad; c.globalAlpha = .32; c.lineWidth = 2; c.stroke(); c.restore();
      // Tramo encendido (a la izquierda de la luz)
      c.save(); clip(area.left - 4, cx); area_(1);
      camino(); c.shadowColor = '#3DE8FF'; c.shadowBlur = 16; c.strokeStyle = grad; c.lineWidth = 3; c.stroke();
      c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.stroke(); c.restore();
      c.restore();

      c.save();
      // Franja de luz que acompaña al barrido
      if (!rm) {
        c.globalCompositeOperation = 'lighter';
        const g = c.createLinearGradient(cx - W * .07, 0, cx + W * .01, 0);
        g.addColorStop(0, 'rgba(61,232,255,0)'); g.addColorStop(1, 'rgba(61,232,255,.22)');
        c.fillStyle = g; c.fillRect(cx - W * .07, area.top - 4, W * .08, area.bottom - area.top + 8);
        c.globalCompositeOperation = 'source-over';
      }
      // Punta que late con anillos
      const pulso = rm ? .5 : .5 + .5 * Math.sin(t * 4);
      c.shadowColor = col; c.shadowBlur = 20; c.fillStyle = col;
      c.beginPath(); c.arc(tip.x, tip.y, 4 + 1.5 * pulso, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
      if (!rm) {
        const f = (t * .8) % 1, f2 = (f + .5) % 1;
        c.lineWidth = 1.6;
        c.strokeStyle = _hexA(col, (1 - f) * .7); c.beginPath(); c.arc(tip.x, tip.y, 5 + 16 * f, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = _hexA(col, (1 - f2) * .4); c.beginPath(); c.arc(tip.x, tip.y, 5 + 16 * f2, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
    },
  };
})();
