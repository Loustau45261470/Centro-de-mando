'use strict';
// ════════════════════════════════════════════════════════════════════════
// MOTION — sistema único de movimiento de Centro de Mando.
// Tokens (duraciones/easings) en styles.css :root (--dur-*, --ease-out-quart, --motion-rise,
// --motion-stagger): este archivo los lee de ahí, no define números propios.
// Solo opacity/transform. Todo se apaga con prefers-reduced-motion (se chequea en cada llamada).
//
//   CMMotion.enterPanel(panel)   entrada en cascada de las tarjetas visibles (≤8) al cambiar de sección
//   CMMotion.countUp(el, {from}) count-up corto (≤400 ms) de un número; termina en el texto exacto original
//   CMMotion.numFrom(texto)      valor numérico del primer número del texto (o null)
//   CMMotion.quiet(ms)           ventana en la que las listas no animan altas (render masivo de sección/overlay)
//   (automático) marcar casilla → pop + destello con el color de la sección · botón principal → onda · alta de 1-2 filas en una lista → entrada de la fila · totales → descifrado (descifrar.js)
// ════════════════════════════════════════════════════════════════════════
const CMMotion = (() => {
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(mq && mq.matches);
  const canAnimate = () => !reduced() && typeof Element.prototype.animate === 'function';

  // ── Tokens (leídos una vez de :root) ──
  let _tok = null;
  function tok() {
    if (_tok) return _tok;
    const cs = getComputedStyle(document.documentElement);
    const ms = (n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return isFinite(v) ? v : d; };
    _tok = {
      fast: ms('--dur-fast', 150), base: ms('--dur-base', 220), slow: ms('--dur-slow', 300),
      rise: ms('--motion-rise', 8), stagger: ms('--motion-stagger', 28),
      ease: (cs.getPropertyValue('--ease-out-quart') || '').trim() || 'cubic-bezier(0.25, 1, 0.5, 1)',
    };
    return _tok;
  }

  let _quietUntil = 0;
  // Mientras dura, <html> lleva .mo-in: habilita las animaciones de dibujo (medidor/barras de Presupuesto) que no deben repetirse en re-renders.
  let _quietTimer = 0, _win = 0;
  const quiet = ms => {
    _quietUntil = Math.max(_quietUntil, performance.now() + ms);
    const root = document.documentElement; if (!root.classList.contains('mo-in')) _win++;   // ventana de entrada nueva
    root.classList.add('mo-in');
    clearTimeout(_quietTimer);
    _quietTimer = setTimeout(() => root.classList.remove('mo-in'), Math.max(0, _quietUntil - performance.now()) + 50);
  };
  const isQuiet = () => performance.now() < _quietUntil;
  // Dibujos de entrada (medidor/barras de Presupuesto): devuelve los ms transcurridos desde el 1.er dibujo de `key` en esta ventana de entrada
  // (0 la primera vez) o null fuera de la ventana. El render que repite el DOM dentro de la ventana (la sección se pinta dos veces al entrar)
  // retoma la animación donde iba (animation-delay negativo = --age), así no reinicia; fuera de la ventana (guardados) no anima.
  const _seen = {}, _t0 = {};
  const drawAge = key => {
    if (!document.documentElement.classList.contains('mo-in')) return null;
    const now = performance.now();
    if (_seen[key] !== _win) { _seen[key] = _win; _t0[key] = now; return 0; }
    const age = now - _t0[key];
    return age < 900 ? Math.round(age) : null;
  };
  quiet(2500); // arranque: el primer render de todo no se anima

  // ── 1. Entrada en cascada de sección (HUD C2) ──────────────────────
  // Sin fantasma de salida (2026-11-24: el clon de la sección vieja no copiaba el scroll de #app y tapaba la nueva): el cambio es instantáneo.
  // Cada tarjeta visible (≤8) recibe en --cx-d su delay (0 ms + 50 ms por pieza, tope 200 ms) y styles.css (card-cascade, solo bajo html.mo-in)
  // la enciende con el destello de su --card-accent. La tarjeta NUNCA está invisible: el destello va sobre contenido ya visible. Las de bajo el pliegue no se escalonan.
  const MAX_ENTER = 8, CX_BASE = 0, CX_STEP = 50, CX_CAP = 200;
  function enterPanel(panel) {
    quiet(700);
    if (panel && panel.id === 'tab-vida') renderTendencias(canAnimate());   // tarjeta Tendencias (D5): se dibuja al entrar a Vida
    if (!panel || !canAnimate()) return 0;
    const t = tok(), vh = window.innerHeight || document.documentElement.clientHeight;
    // La cascada aplica SOLO a los nodos presentes ahora: .cx-in (con su --cx-d) se quita al terminar; un re-render posterior no re-anima.
    clearTimeout(panel._cxT);
    panel.querySelectorAll('.card.cx-in').forEach(c => { c.classList.remove('cx-in'); c.style.removeProperty('--cx-d'); });
    void panel.offsetWidth;
    const els = [];
    for (const el of panel.querySelectorAll('.kpi-strip, .card')) {
      if (els.length >= MAX_ENTER) break;
      if (el.classList.contains('card') && el.parentElement && el.parentElement.closest('.card')) continue; // tarjeta anidada
      if (el.classList.contains('sr-armed') && !el.classList.contains('sr-in')) continue; // bajo el pliegue: la revela el scroll
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.top > vh * 0.92) continue;
      els.push(el);
    }
    const cx = [];
    els.forEach((el, i) => {
      const d = Math.min(CX_CAP, CX_BASE + i * CX_STEP);
      if (el.classList.contains('card')) { el.style.setProperty('--cx-d', d + 'ms'); el.classList.add('cx-in'); cx.push(el); }
      else el.animate(
        [{ opacity: .55, transform: `translateY(${t.rise}px)` }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: t.base, delay: d, easing: t.ease, fill: 'backwards' }
      );
    });
    if (cx.length) panel._cxT = setTimeout(() => cx.forEach(c => { c.classList.remove('cx-in'); c.style.removeProperty('--cx-d'); }), CX_CAP + 800);   // 700 ms de la animación más larga + margen
    // Totales: descifrado completo al entrar (descifrar.js; los k-val del kpi-strip los maneja jarvis-intel con el mismo helper).
    for (const el of panel.querySelectorAll(NUM_SEL)) if (el.getClientRects().length) { if (window.cmDescifrar) cmDescifrar(el, el.textContent, { full: true }); else countUp(el, { from: 0 }); }
    drawSparks(panel);
    return els.length;
  }

  // ── 1b. Mini gráficos que se dibujan (HUD D5) ──────────────────────
  // Sparklines de tendencia de los KPI (.k-spark: Vida, Finanzas, Salud, Estudio, IA): al ENTRAR a la sección la línea se revela de izquierda a derecha
  // (~800 ms) con un punto de luz en la punta y el último valor aparece al final. Se llama solo desde enterPanel (no al re-renderizar por guardar)
  // y solo sobre los svg visibles. Todo WAAPI (clip-path + transform), nada queda animando al terminar.
  const SPARK_MS = 800, SPARK_PAD = 6;
  function drawSparks(panel) {
    for (const svg of panel.querySelectorAll('svg.k-spark')) {
      try {
        if (!svg.getClientRects().length) continue;
        const poly = svg.querySelector('polyline'); if (!poly) continue;
        if (svg._skA) svg._skA.forEach(a => a.cancel());
        const pts = (poly.getAttribute('points') || '').trim().split(/\s+/).map(p => p.split(',').map(Number)).filter(p => p.length === 2 && isFinite(p[0]) && isFinite(p[1]));
        if (pts.length < 2) continue;
        const col = poly.getAttribute('stroke') || 'currentColor';
        const timing = { duration: SPARK_MS, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'backwards' };
        // el svg se estira (preserveAspectRatio none): elipse con radios compensados para que el punto se vea redondo (3 px)
        const bb = svg.getBoundingClientRect(), tip = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        tip.setAttribute('class', 'k-tip'); tip.setAttribute('rx', String(3 / ((bb.width / 100) || 1))); tip.setAttribute('ry', String(3 / ((bb.height / 24) || 1))); tip.setAttribute('fill', col);
        tip.style.filter = 'drop-shadow(0 0 4px ' + col + ') drop-shadow(0 0 8px ' + col + ')';
        svg.appendChild(tip);
        const anims = [];
        anims.push(svg.animate(
          [{ clipPath: `inset(-${SPARK_PAD}px 100% -${SPARK_PAD}px -${SPARK_PAD}px)` }, { clipPath: `inset(-${SPARK_PAD}px -${SPARK_PAD}px -${SPARK_PAD}px -${SPARK_PAD}px)` }], timing));
        const n = pts.length;
        const kf = pts.map((p, i) => ({ transform: `translate(${p[0]}px, ${p[1]}px)`, offset: i / (n - 1) }));
        anims.push(tip.animate(kf, timing));
        const lastC = svg.querySelector('circle:not(.k-tip)');
        if (lastC) anims.push(lastC.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: SPARK_MS - 160, easing: 'ease-out', fill: 'backwards' }));
        svg._skA = anims;
        anims[1].onfinish = anims[1].oncancel = () => tip.remove();
      } catch (e) {}
    }
  }

  // ── 1c. Tarjeta «Tendencias» de Vida (HUD D5, fiel a la maqueta) ────
  // Tres filas: Patrimonio, Gasto diario y Horas de estudio, cada una con número grande, comparación y un mini gráfico de los últimos
  // 30 días que se dibuja de izquierda a derecha con una luz en la punta; al pasar el mouse o apoyar el dedo muestra fecha y valor.
  // Solo datos con fecha propia dentro del período: patrimonio = registros diarios (S.nwHistory, solo los del cálculo actual c:1);
  // gasto = movimientos por día con la misma regla que Reportes (_repGastos: neto de reintegros, sin cuotas de tarjeta del día 1);
  // estudio = minutos del Pomodoro (S.pomodoroHistory). La comparación con los 30 días anteriores solo aparece si hay registros
  // desde antes de ese tramo (si no, compararía contra días sin registrar). Se pinta al ENTRAR a Vida (enterPanel) y al volver a la
  // app; guardar no la re-anima. La luz late solo mientras la tarjeta está en pantalla; con «reducir movimiento» queda quieta.
  const TEND_N = 30, TEND_DRAW = 1500, TEND_STAG = 180;
  const TEND_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const tFecha = d => (+d.slice(8, 10)) + ' ' + TEND_MES[+d.slice(5, 7) - 1];
  const tPesos = v => (v < 0 ? '-$' : '$') + fmtNum(Math.abs(Math.round(v)));
  const tHoras = v => fmtNum(v, Math.abs(v) >= 100 ? 0 : 1) + ' h';
  const tHex = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + a + ')';
  const tEase = x => { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); };

  function tendDatos() {
    const R = window.CMReportes, hoy = getActiveDate();
    const desde = R.repSumarDias(hoy, -(TEND_N - 1)), pDesde = R.repSumarDias(hoy, -(2 * TEND_N - 1)), pHasta = R.repSumarDias(hoy, -TEND_N);
    const dias = []; for (let i = 0; i < TEND_N; i++) dias.push(R.repSumarDias(desde, i));
    const vs = 'vs 30 días previos';
    // Patrimonio: cada punto es un registro diario.
    const nw = (S.nwHistory || []).filter(p => p && p.c === 1 && p.date >= desde && p.date <= hoy && isFinite(+p.value))
      .slice().sort((a, b) => a.date.localeCompare(b.date)).map(p => ({ d: p.date, v: +p.value, tip: tFecha(p.date) + ' · ' + tPesos(+p.value) }));
    const pat = { k: 'pat', lbl: 'Patrimonio', col: '#16B364', pts: nw, fmt: tPesos, val: nw.length ? tPesos(nw[nw.length - 1].v) : '—', dl: null };
    if (nw.length >= 2) {
      const a = nw[0].v, b = nw[nw.length - 1].v;
      pat.dl = a > 0 ? { n: (b - a) / a * 100, txt: fmtNum(Math.abs((b - a) / a * 100), 1) + '%' } : { n: b - a, txt: tPesos(Math.abs(b - a)).replace('-', '') };
      pat.dl.sub = 'desde el ' + tFecha(nw[0].d); pat.dl.bueno = pat.dl.n >= 0;
    } else pat.vacio = nw.length ? 'Falta otro día de registro para ver la tendencia' : 'Todavía no hay registros del patrimonio en estos 30 días';
    // Gasto y estudio: promedio por día. Se cuenta desde el primer registro (antes no se registraba: no son días en cero).
    // Cada punto del gráfico = promedio por día de la semana que termina ese día (solo semanas enteras con registro).
    const porDia = (o, valDia, prim, antTot, fmt, bueno) => {
      if (!prim || prim > hoy) return Object.assign(o, { pts: [], val: '—', vacio: o.sinDatos });
      const base = prim > desde ? prim : desde, nDias = R.repDiasEntre(base, hoy) + 1;
      let tot = 0; dias.forEach(d => { if (d >= base) tot += valDia(d); });
      const prom = tot / nDias;
      o.val = fmt(prom); o.unidad = '/día';
      o.pts = dias.filter(d => R.repSumarDias(d, -6) >= prim).map(d => {
        const a = R.repSumarDias(d, -6); let s = 0; for (let i = 0; i < 7; i++) s += valDia(R.repSumarDias(a, i));
        const ini = a.slice(5, 7) === d.slice(5, 7) ? String(+a.slice(8, 10)) : tFecha(a);
        return { d, v: s / 7, tip: ini + '–' + tFecha(d) + ' · ' + fmt(s / 7) + '/día' };
      });
      if (!(tot > 0)) o.vacio = o.sinDatos;
      else if (o.pts.length < 2) o.vacio = 'Con una semana de registros se dibuja la tendencia';
      if (tot > 0 && prim <= pDesde && antTot() > 0) {
        const ant = antTot() / TEND_N;
        o.dl = o.k === 'gas' ? { n: (prom - ant) / ant * 100, txt: fmtNum(Math.abs((prom - ant) / ant * 100), 1) + '%' } : { n: Math.round((prom - ant) * 10) / 10, txt: fmt(Math.abs(prom - ant)) };
        o.dl.sub = vs; o.dl.bueno = bueno(o.dl.n);
      }
      return o;
    };
    const gd = { transactions: S.transactions || [], cardCharges: S.cardCharges || [] }, gMap = {};
    const gDia = d => (d in gMap) ? gMap[d] : (gMap[d] = _repGastos(gd, { desde: d, hasta: d }, true).total);
    const gPrim = typeof _repGastos === 'function' ? gd.transactions.reduce((m, t) => (_repEsGasto(t) && t.date && (!m || t.date < m)) ? t.date : m, null) : null;
    const gas = porDia({ k: 'gas', lbl: 'Gasto diario', col: '#F43F5E', fmt: tPesos, dl: null, sinDatos: 'No hay gastos registrados en los últimos 30 días' },
      gDia, gPrim, () => _repGastos(gd, { desde: pDesde, hasta: pHasta }, true).total, tPesos, n => n <= 0);
    const min = {}; let ePrim = null;
    (S.pomodoroHistory || []).forEach(e => { if (!e || !e.date) return; min[e.date] = (min[e.date] || 0) + (+e.minutes || 0); if (!ePrim || e.date < ePrim) ePrim = e.date; });
    const est = porDia({ k: 'est', lbl: 'Horas de estudio', col: '#3B82F6', fmt: tHoras, dl: null, sinDatos: 'No hay sesiones de Pomodoro en los últimos 30 días' },
      d => (min[d] || 0) / 60, ePrim, () => { let s = 0; for (const d in min) if (d >= pDesde && d <= pHasta) s += min[d] / 60; return s; }, tHoras, n => n >= 0);
    return [pat, gas, est];
  }

  const tEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function tendHTML(r) {
    const dl = r.dl ? `<div class="tend-dl ${r.dl.n === 0 ? 'neu' : r.dl.bueno ? 'ok' : 'mal'}">${r.dl.n > 0 ? '+' : r.dl.n < 0 ? '−' : ''}${tEsc(r.dl.txt)} <span>${tEsc(r.dl.sub)}</span></div>`
      : `<div class="tend-dl neu"><span>${r.vacio ? '' : 'sin datos de los 30 días previos'}</span></div>`;
    const ini = r.pts.length ? r.fmt(r.pts[0].v) : '', fin = r.pts.length ? r.fmt(r.pts[r.pts.length - 1].v) : '';
    const graf = r.vacio ? `<div class="tend-vacio">${tEsc(r.vacio)}</div>`
      : `<div class="tend-graf"><canvas role="img" aria-label="${tEsc(r.lbl)}${r.unidad ? ' (promedio por día de cada semana)' : ''}, últimos 30 días: de ${tEsc(ini)} a ${tEsc(fin)}"></canvas></div>`;
    return `<div class="tend-row" data-k="${r.k}" style="--tc:${r.col}"><div class="tend-txt"><div class="tend-lbl">${tEsc(r.lbl)}</div>`
      + `<div class="tend-val">${tEsc(r.val)}${r.unidad ? `<small>${tEsc(r.unidad)}</small>` : ''}</div>${dl}</div>${graf}</div>`;
  }

  // Estado de la tarjeta (expuesto en card._tend para los tests): filas, inicio del dibujo, rAF del loop, fila/punto bajo el puntero.
  let _tendIO = null;
  function renderTendencias(animar) {
    const card = document.getElementById('tendCard'), box = document.getElementById('tendRows');
    if (!card || !box || !window.CMReportes || typeof S === 'undefined') return;
    let filas; try { filas = tendDatos(); } catch (e) { return; }
    const st = card._tend || (card._tend = { t0: 0, raf: 0, vis: true, hov: null });
    box.innerHTML = filas.map(tendHTML).join('');
    st.filas = filas.map((r, i) => Object.assign(r, { i, cv: box.querySelector(`.tend-row[data-k="${r.k}"] canvas`) }));
    st.t0 = animar && !reduced() ? 0 : -1;   // 0 = arranca al primer cuadro visible; -1 = completo (sin dibujo)
    st.hov = null;
    st.font = getComputedStyle(card).fontFamily || 'sans-serif';
    st.filas.forEach(r => { if (r.cv) tendPointer(st, r); });
    if (!_tendIO && 'IntersectionObserver' in window) {
      _tendIO = new IntersectionObserver(es => { for (const e of es) { st.vis = e.isIntersecting; tendLoop(st); } });
      _tendIO.observe(card);
    }
    if (!card._tendRO && 'ResizeObserver' in window) { card._tendRO = new ResizeObserver(() => tendPintar(st, performance.now())); card._tendRO.observe(box); }
    tendPintar(st, performance.now());
    tendLoop(st);
  }
  const tendActiva = () => { const c = document.getElementById('tendCard'); return !!(c && c.getClientRects().length); };
  // El loop corre solo con la tarjeta en pantalla, la app visible y la pestaña Vida activa; con «reducir movimiento» no corre.
  function tendLoop(st) {
    const debe = st.vis && !document.hidden && tendActiva() && !reduced() && st.filas && st.filas.some(r => r.cv);
    if (!debe) { if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; return; }
    if (st.raf) return;
    const f = now => { st.raf = 0; tendPintar(st, now); tendLoop(st); };
    st.raf = requestAnimationFrame(f);
  }
  // Progreso del dibujo de la fila i (0..1).
  function tendProg(st, i, now) {
    if (st.t0 < 0) return 1;
    if (st.t0 === 0) return 0;
    return tEase((now - st.t0 - i * TEND_STAG) / TEND_DRAW);
  }
  function tendPintar(st, now) {
    if (!st.filas) return;
    if (!st.hov) st.tip = null;
    if (st.t0 === 0 && st.vis && !document.hidden && tendActiva()) st.t0 = now;
    if (st.t0 > 0 && now - st.t0 > TEND_DRAW + TEND_STAG * 3) st.t0 = -1;   // terminó: ya no hay dibujo pendiente
    for (const r of st.filas) if (r.cv) tendFila(st, r, now);
  }
  // Coordenadas de la serie: X por fecha (huecos entre registros respetados), Y normalizada al mínimo/máximo de la fila.
  function tendGeo(r, W, H) {
    const pad = 11, T = 11, B = H - 8, L = 4, Rx = W - pad;   // margen para que el halo de la punta (radio 9) no se recorte
    const day = d => Date.parse(d + 'T00:00:00Z') / 86400000;
    const d0 = day(r.pts[0].d), d1 = day(r.pts[r.pts.length - 1].d) || d0 + 1;
    const vs = r.pts.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs);
    const X = k => L + (Rx - L) * (d1 > d0 ? (day(r.pts[k].d) - d0) / (d1 - d0) : k / Math.max(1, r.pts.length - 1));
    const Y = k => mx > mn ? B - (B - T) * (r.pts[k].v - mn) / (mx - mn) : (T + B) / 2;
    return { L, R: Rx, T, B, X, Y };
  }
  function tendFila(st, r, now) {
    const cv = r.cv, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const g = tendGeo(r, W, H), n = r.pts.length, p = tendProg(st, r.i, now), m = p * (n - 1);
    const pts = []; for (let k = 0; k <= Math.floor(m); k++) pts.push([g.X(k), g.Y(k)]);
    let tip = pts[pts.length - 1];
    if (m < n - 1 && p > 0) { const k = Math.floor(m), f = m - k; tip = [g.X(k) + (g.X(k + 1) - g.X(k)) * f, g.Y(k) + (g.Y(k + 1) - g.Y(k)) * f]; pts.push(tip); }
    if (p <= 0 || !pts.length) return;
    const path = () => { c.beginPath(); pts.forEach((q, k) => k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); };
    path(); c.lineTo(tip[0], g.B); c.lineTo(pts[0][0], g.B); c.closePath();
    const gr = c.createLinearGradient(0, g.T, 0, g.B); gr.addColorStop(0, tHex(r.col, .28)); gr.addColorStop(1, tHex(r.col, 0)); c.fillStyle = gr; c.fill();
    c.shadowColor = r.col; c.shadowBlur = 8; c.strokeStyle = r.col; c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round'; path(); c.stroke(); c.shadowBlur = 0;
    // luz en la punta: viaja mientras se dibuja y late al terminar (quieta con «reducir movimiento»)
    const done = p >= 1, pl = reduced() ? .5 : .5 + .5 * Math.sin(now / 1000 * 4);
    c.fillStyle = tHex(r.col, done ? .18 + .18 * pl : .3); c.beginPath(); c.arc(tip[0], tip[1], 5 + (done ? 4 * pl : 3), 0, Math.PI * 2); c.fill();
    c.shadowColor = '#fff'; c.shadowBlur = 8; c.fillStyle = '#fff'; c.beginPath(); c.arc(tip[0], tip[1], 2.6, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    // valor del punto bajo el puntero
    if (st.hov && st.hov.r === r && done) {
      const k = st.hov.k, hx = g.X(k), hy = g.Y(k);
      c.strokeStyle = 'rgba(190,240,255,.5)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(hx, g.T - 4); c.lineTo(hx, g.B + 4); c.stroke(); c.setLineDash([]);
      c.shadowColor = r.col; c.shadowBlur = 10; c.fillStyle = '#fff'; c.beginPath(); c.arc(hx, hy, 3.4, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
      const txt = r.pts[k].tip, fs = 11;
      c.font = '600 ' + fs + 'px ' + st.font;
      const w = c.measureText(txt).width + 14, h = fs + 9;
      const bx = Math.max(1, Math.min(W - w - 1, hx - w / 2)), by = hy - h - 8 >= 1 ? hy - h - 8 : Math.min(H - h - 1, hy + 8);
      c.beginPath(); if (c.roundRect) c.roundRect(bx, by, w, h, 5); else c.rect(bx, by, w, h);
      c.fillStyle = 'rgba(2,8,16,.94)'; c.fill(); c.strokeStyle = tHex(r.col, .8); c.lineWidth = 1; c.stroke();
      c.fillStyle = '#EDF4FF'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, bx + w / 2, by + h / 2 + 1);
      st.tip = txt;
    }
  }
  function tendPointer(st, r) {
    const cv = r.cv;
    const mover = e => {
      const b = cv.getBoundingClientRect(), g = tendGeo(r, b.width, b.height), x = e.clientX - b.left;
      let k = 0, best = Infinity; for (let i = 0; i < r.pts.length; i++) { const d = Math.abs(g.X(i) - x); if (d < best) { best = d; k = i; } }
      st.hov = { r, k }; tendPintar(st, performance.now());
    };
    const salir = () => { if (st.hov && st.hov.r === r) { st.hov = null; st.tip = null; tendPintar(st, performance.now()); } };
    cv.addEventListener('pointermove', mover);
    cv.addEventListener('pointerdown', mover);
    cv.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') salir(); });
    cv.addEventListener('pointerleave', salir);
    cv.addEventListener('pointercancel', salir);
  }
  document.addEventListener('visibilitychange', () => {
    const c = document.getElementById('tendCard');
    if (!c || !c._tend) return;
    if (!document.hidden && tendActiva()) renderTendencias(false);   // al volver a la app: datos frescos, sin re-dibujar
    else tendLoop(c._tend);
  });

  // ── 2. Count-up ─────────────────────────────────────────────────────
  // Interpreta el primer número del texto respetando el formato (separador de miles/decimal, es-AR o en-US).
  const NUM_RX = /\d[\d.,]*\d|\d/;
  function parse(txt) {
    const m = NUM_RX.exec(txt); if (!m) return null;
    const tk = m[0], pre = txt.slice(0, m.index), suf = txt.slice(m.index + tk.length);
    if (/\d/.test(pre) || /\d/.test(suf)) return null; // fechas, 3/4, 07:30…: no son un número solo
    const dots = (tk.match(/\./g) || []).length, commas = (tk.match(/,/g) || []).length;
    let th = '', dec = '', decimals = 0, num;
    const asThousands = (sep, n) => { const g = tk.split(sep); return g.length === n + 1 && g[0] !== '0' && g[0].length <= 3 && g.slice(1).every(x => x.length === 3); };
    if (dots && commas) {
      const ld = tk.lastIndexOf('.'), lc = tk.lastIndexOf(',');
      dec = ld > lc ? '.' : ','; th = dec === '.' ? ',' : '.';
    } else if (dots) {
      if (asThousands('.', dots)) th = '.'; else if (dots === 1) dec = '.'; else return null;
    } else if (commas) {
      if (asThousands(',', commas)) th = ','; else if (commas === 1) dec = ','; else return null;
    }
    const clean = th ? tk.split(th).join('') : tk;
    const parts = dec ? clean.split(dec) : [clean];
    if (parts.length > 2) return null;
    decimals = parts[1] ? parts[1].length : 0;
    num = parseFloat(parts[0] + (parts[1] ? '.' + parts[1] : ''));
    if (!isFinite(num)) return null;
    return { pre, suf, value: num, th, dec, decimals };
  }
  const numFrom = txt => { const p = parse(String(txt == null ? '' : txt)); return p ? p.value : null; };
  function fmt(p, v) {
    const s = Math.abs(v).toFixed(p.decimals), [i, f] = s.split('.');
    const ip = p.th ? i.replace(/\B(?=(\d{3})+(?!\d))/g, p.th) : i;
    return p.pre + ip + (f ? p.dec + f : '') + p.suf;
  }
  const COUNT_MS = 360;
  function countUp(el, opts) {
    if (!el || !canAnimate() || el.children.length) return false;
    const txt = el.textContent, p = parse(txt); if (!p) return false;
    const from = opts && opts.from != null && isFinite(opts.from) ? opts.from : 0;
    if (from === p.value) return false;
    if (el._cmCU) el._cmCU.stopped = true;
    const st = { stopped: false, last: txt }; el._cmCU = st; el._cmSeen = txt;
    const t0 = performance.now(), first = fmt(p, from);
    el.textContent = first; st.last = first;
    const frame = now => {
      if (st.stopped) return;
      if (el.textContent !== st.last) { st.stopped = true; return; } // alguien escribió un valor nuevo: no lo pisamos
      const k = Math.min(1, (now - t0) / COUNT_MS);
      if (k >= 1) { el.textContent = txt; st.stopped = true; el._cmCU = null; return; } // termina en el texto exacto original
      const s = fmt(p, from + (p.value - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = s; st.last = s;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return true;
  }

  // Totales con id fijo: al entrar a la sección se descifran; sus cambios los escribe cada render con cmDescifrar.
  const NUM_SEL = '#nwTotal, #nwCash, #txnSumIncome, #txnSumExpense, #txnSumBalance';

  // ── 3. Marcar como hecho: pop de la casilla (transform, no mueve el layout) ──
  const CHECK_SEL = '.check-box, .law-check, .mrd-check, .po-check, .rn-todo-check, .ng-check, .gm-check, .pe-ck, .lb-check, .study-cal-dot, input[type="checkbox"]';
  const isOn = el => el.matches('input') ? el.checked
    : (el.classList.contains('checked') || el.getAttribute('aria-checked') === 'true' || el.classList.contains('pe-ck-on') || el.classList.contains('studied') || !!el.closest('.done, .done-row, .rn-todo-done, .checked'));
  function rowOf(el) { // el ancestro que contiene solo esta casilla
    let r = el;
    for (let i = 0; i < 6 && r.parentElement; i++) {
      if (r.parentElement.querySelectorAll(CHECK_SEL).length > 1) break;
      r = r.parentElement;
    }
    return r;
  }
  function pop(el) {
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)', offset: 0.45 }, { transform: 'scale(1)' }],
      { duration: tok().base, easing: tok().ease });
  }
  // Destello al tildar (HUD D1): el tilde se dibuja, chispas, anillo y un barrido de luz por la fila, todo con el color de la sección
  // (--card-accent de la tarjeta donde está; fuera de una tarjeta, --accent). Son capas fijas en <body> (no tocan el layout ni la casilla); duran <0,8 s.
  const NOFX = '.gm-toggle, .fin-plan-dia, .rep-opt, .pr-chk';   // interruptores de ajustes: no son "tildar algo hecho"
  const FX_MS = 800, FX_ANG = [0, 45, 90, 135, 180, 225, 270, 315];
  function burst(el) {
    if (!canAnimate() || !el.isConnected || (el.closest && el.closest(NOFX))) return;
    // fuera de una pestaña (overlays de la sección: dieta, entreno, proyectos…) toma el color de la pestaña activa
    const cs = getComputedStyle(el.closest('.tab-panel') ? el : (document.querySelector('.tab-panel.active') || el));
    const col =(cs.getPropertyValue('--card-accent') || cs.getPropertyValue('--accent') || '').trim() || '#38BDF8';
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const layer = [];
    const row = el.closest(ROW_SEL + ', .rn-todo-item, li, tr') || el.parentElement;
    const rr = row ? row.getBoundingClientRect() : null;
    if (rr && rr.width >= 60 && rr.height >= 18 && rr.height <= 120) {
      const f = document.createElement('div'); f.className = 'ckfx';
      f.style.cssText = '--fx:' + col + ';left:' + rr.left + 'px;top:' + rr.top + 'px;width:' + rr.width + 'px;height:' + rr.height + 'px;border-radius:' + getComputedStyle(row).borderRadius;
      layer.push(f);
    }
    const p = document.createElement('div'); p.className = 'ckfx-pt';
    p.style.cssText = '--fx:' + col + ';left:' + (r.left + r.width / 2) + 'px;top:' + (r.top + r.height / 2) + 'px';
    p.innerHTML = '<svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9"/></svg>' + FX_ANG.map(a => '<i style="--a:' + a + 'deg"></i>').join('');
    layer.push(p);
    layer.forEach(n => { n.setAttribute('aria-hidden', 'true'); document.body.appendChild(n); });
    setTimeout(() => layer.forEach(n => n.remove()), FX_MS);
  }

  // Onda al tocar el botón principal (HUD D4): capa fija recortada al botón; el pulso suave es CSS (.btn-primary).
  function onPrimaryClick(e) {
    if (!canAnimate() || !e.target.closest) return;
    const b = e.target.closest('.btn-primary'); if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
    const w = document.createElement('div'); w.className = 'cm-rpl'; w.setAttribute('aria-hidden', 'true');
    const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
    w.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border-radius:' + getComputedStyle(b).borderRadius;
    w.innerHTML = '<i style="left:' + (x - r.left) + 'px;top:' + (y - r.top) + 'px"></i>';
    document.body.appendChild(w); setTimeout(() => w.remove(), 650);
  }

  function onCheckClick(e) {
    if (!canAnimate() || !e.target.closest) return;
    const el = e.target.closest(CHECK_SEL); if (!el) return;
    const alwaysPop = el.classList.contains('fin-check'); // se desmarca solo: la acción es siempre "marcar"
    if (!alwaysPop && (el.matches('input') ? !el.checked : isOn(el))) return; // solo al marcar, no al desmarcar
    const anchor = (el.parentElement || el).closest('[id]'), aid = anchor && anchor.id;
    const idx = anchor ? Array.prototype.indexOf.call(anchor.querySelectorAll(CHECK_SEL), el) : -1;
    const txt = rowOf(el).textContent;
    requestAnimationFrame(() => {
      let t = el.isConnected ? el : null;
      if (!t && aid) { // el render reemplazó el nodo: buscar su equivalente
        const a = document.getElementById(aid);
        if (a) { const list = Array.from(a.querySelectorAll(CHECK_SEL)); t = list.find(x => rowOf(x).textContent === txt) || list[idx] || null; }
      }
      if (t && (alwaysPop || isOn(t))) { pop(t); burst(t); }
    });
  }

  // ── 4. Altas en listas: entra la fila nueva (1-2 filas nuevas respecto del render anterior) ──
  const ROW_SEL = '.goal-item, .pcal-row, .rem-item, .mrd-item, .po-task, .activity-row, .curs-item, .fin-item, .monthly-goal-item, .qobj-item, .law-subject-row, .diet-rule';
  const keyOf = n => (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  function collect(n, out) {
    if (n.nodeType !== 1) return;
    if (n.matches(ROW_SEL)) out.push(n);
    else if (n.firstElementChild) for (const x of n.querySelectorAll(ROW_SEL)) out.push(x);
  }
  function onMutations(records) {
    if (isQuiet() || !canAnimate()) return;
    const added = [], removed = [];
    for (const r of records) {
      for (const n of r.addedNodes) collect(n, added);
      if (added.length) for (const n of r.removedNodes) collect(n, removed);
    }
    if (!added.length || added.length > 40) return; // render masivo: no es un alta
    const prev = new Map();
    for (const n of removed) { const k = keyOf(n); prev.set(k, (prev.get(k) || 0) + 1); }
    const fresh = added.filter(n => { const k = keyOf(n), c = prev.get(k) || 0; if (c > 0) { prev.set(k, c - 1); return false; } return true; });
    if (!fresh.length || fresh.length > 2) return;
    const t = tok();
    for (const n of fresh) {
      if (!n.isConnected || !n.getClientRects().length) continue;
      n.animate([{ opacity: 0, transform: `translateY(${t.rise}px)` }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: t.base, easing: t.ease, fill: 'backwards' });
    }
  }

  function init() {
    document.addEventListener('click', onCheckClick, true);
    document.addEventListener('click', onPrimaryClick);
    // cambiar de pestaña (nav, pestañas internas, hábitos) re-renderiza listas enteras: no son altas
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.nav-btn, .plov-tab, .habit-tab-btn, .rail-btn')) quiet(600); }, true);
    new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { enterPanel, countUp, numFrom, quiet, drawAge, reduced, burst };
})();
window.CMMotion = CMMotion;
