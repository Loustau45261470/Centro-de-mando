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
  let _quietTimer = 0;
  const quiet = ms => {
    _quietUntil = Math.max(_quietUntil, performance.now() + ms);
    const root = document.documentElement; root.classList.add('mo-in');
    clearTimeout(_quietTimer);
    _quietTimer = setTimeout(() => root.classList.remove('mo-in'), Math.max(0, _quietUntil - performance.now()) + 50);
  };
  const isQuiet = () => performance.now() < _quietUntil;
  quiet(2500); // arranque: el primer render de todo no se anima

  // ── 1. Entrada en cascada de sección (HUD C2) ──────────────────────
  // Sin fantasma de salida (2026-11-24: el clon de la sección vieja no copiaba el scroll de #app y tapaba la nueva): el cambio es instantáneo.
  // Cada tarjeta visible (≤8) recibe en --cx-d su delay (0 ms + 50 ms por pieza, tope 200 ms) y styles.css (card-cascade, solo bajo html.mo-in)
  // la enciende con el destello de su --card-accent. La tarjeta NUNCA está invisible: el destello va sobre contenido ya visible. Las de bajo el pliegue no se escalonan.
  const MAX_ENTER = 8, CX_BASE = 0, CX_STEP = 50, CX_CAP = 200;
  function enterPanel(panel) {
    quiet(700);
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
    return els.length;
  }

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

  return { enterPanel, countUp, numFrom, quiet, reduced, burst };
})();
window.CMMotion = CMMotion;
