/* ══════════════════════════════════════════════════════
   JARVIS NEURAL FX — red neuronal viva (canvas), cian eléctrico.
   Reacciona a la voz (nivel de micrófono) y al estado de JARVIS.
   Reposo: núcleo compacto en la esquina. Al activarse: la red se
   despliega a pantalla completa como un HUD, con el dashboard atenuado.
   API global: JARVIS_FX.setState('off'|'passive'|'command'|'thinking'),
               JARVIS_FX.setLevel(0..1), JARVIS_FX.onExit = fn
   ══════════════════════════════════════════════════════ */
(function () {
  const REDUCED = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  const C  = { r: 56,  g: 189, b: 248 }; // #38bdf8 cian base
  const C2 = { r: 125, g: 211, b: 252 }; // #7dd3fc cian brillante
  const rgba = (c, a) => `rgba(${c.r},${c.g},${c.b},${a})`;

  /* ── DOM ── */
  const style = document.createElement('style');
  style.textContent = `
    #jarvis-fx-backdrop{position:fixed;inset:0;z-index:9998;pointer-events:none;opacity:0;
      background:radial-gradient(ellipse at 50% 44%, rgba(8,18,30,0.50), rgba(2,5,11,0.88));
      -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);transition:opacity .55s ease}
    #jarvis-fx-backdrop.on{opacity:1;pointer-events:auto}
    #jarvis-fx-canvas{position:fixed;inset:0;z-index:9999;pointer-events:none;display:none}`;
  document.head.appendChild(style);
  const backdrop = document.createElement('div'); backdrop.id = 'jarvis-fx-backdrop';
  const canvas   = document.createElement('canvas'); canvas.id = 'jarvis-fx-canvas';
  document.body.appendChild(backdrop); document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  backdrop.addEventListener('click', () => { if (api.onExit) api.onExit(); });

  let W = 0, H = 0, DPR = 1;
  let host = null, docked = false;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    if (docked && host && host.clientWidth) { W = host.clientWidth; H = host.clientHeight; }
    else { W = window.innerWidth; H = window.innerHeight; }
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  let _resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(_resizeTimer); _resizeTimer = setTimeout(resize, 150); });
  resize();

  /* ── Paleta extendida ── */
  const CW = { r: 224, g: 248, b: 255 }; // blanco-cian: núcleos calientes / picos de voz
  const CD = { r: 30,  g: 130, b: 190 }; // cian profundo: estructuras de fondo
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  /* ── Red neuronal: nodos en espacio unitario (0..1) mapeados a la región activa ── */
  const N = REDUCED ? 30 : 84;
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const ang = Math.random() * TAU, rad = Math.pow(Math.random(), 0.65) * 0.5;
    nodes.push({
      ux: 0.5 + Math.cos(ang) * rad, uy: 0.5 + Math.sin(ang) * rad,
      vx: rnd(-1, 1) * 0.00045, vy: rnd(-1, 1) * 0.00045,
      z: Math.random(), r: rnd(0.7, 2.2), ph: Math.random() * TAU, fire: 0
    });
  }
  nodes[0].ux = 0.5; nodes[0].uy = 0.5; nodes[0].core = true; nodes[0].z = 1;
  const adj = Array.from({ length: N }, () => []);

  /* ── Partículas de ambiente (motas a la deriva, en unidades de la región) ── */
  const PMAX = REDUCED ? 18 : 90;
  const parts = [];
  for (let i = 0; i < PMAX; i++) parts.push({ ux: Math.random(), uy: Math.random(), vx: rnd(-1, 1) * 0.0006, vy: rnd(-1, 1) * 0.0006, r: rnd(0.4, 1.5), tw: Math.random() * TAU });

  /* ── Satélites en órbita del núcleo ── */
  const sats = [];
  for (let i = 0; i < 7; i++) sats.push({ a: Math.random() * TAU, rad: rnd(0.5, 1.4), sp: (Math.random() < 0.5 ? -1 : 1) * rnd(0.25, 0.6), r: rnd(1, 2.4), e: rnd(0.3, 0.9) });

  /* ── Lluvia de datos hexadecimales (sólo a pantalla completa) ── */
  const HEX = '0123456789ABCDEF';
  const cols = [];
  for (let i = 0; i < 5; i++) cols.push({ sp: rnd(0.3, 0.9), off: 0 });

  const cornerRect = () => ({ x: 5, y: H - 195, w: 130, h: 130 });
  const fullRect   = () => ({ x: W * 0.07, y: H * 0.10, w: W * 0.86, h: H * 0.78 });
  let R = cornerRect(), RT = cornerRect();

  const STATES = {
    off:      { e: 0.05, op: 0.32, full: 0 },
    passive:  { e: 0.24, op: 0.95, full: 0 },
    command:  { e: 0.58, op: 1.00, full: 1 },
    thinking: { e: 0.92, op: 1.00, full: 1 }
  };

  let state = 'off', energy = 0.05, energyT = 0.05, level = 0, levelS = 0, levelPk = 0;
  let expand = 0, expandT = 0, opacity = 0, opacityT = 0.32, t = 0;
  const pulses = [], waves = [], sparks = []; let edges = [], edgeTimer = 0, lastWave = 0, idleTimer = 0;

  function _wakeOn(){ try { return localStorage.getItem('jarvis_wake') === '1'; } catch(e){ return false; } }
  const api = {
    onExit: null,
    setState(s) {
      const cfg = STATES[s] || STATES.passive; state = STATES[s] ? s : 'passive';
      energyT = cfg.e; opacityT = docked ? 1 : cfg.op; expandT = docked ? 1 : cfg.full;
      const fullscreen = cfg.full === 1 && !docked;
      backdrop.classList.toggle('on', fullscreen);
      // Sin montar en la sección CORE, el núcleo sólo aparece a pantalla completa cuando lo invocás
      // por voz; en reposo no se dibuja el orbe de la esquina inferior izquierda.
      canvas.style.display = (docked || fullscreen) ? 'block' : 'none';
    },
    setLevel(l) { level = clamp01(l); },
    // Montar la red neuronal confinada y permanente dentro de un contenedor (sección CORE)
    dock(el) {
      if (!el) return;
      host = el; docked = true;
      canvas.style.position = 'absolute'; canvas.style.left = '0'; canvas.style.top = '0'; canvas.style.zIndex = '0';
      el.appendChild(canvas);
      backdrop.classList.remove('on');
      expandT = 1; opacityT = 1; expand = 1; opacity = Math.max(opacity, 0.9);
      resize();
      // encajar la región a todo el host de inmediato (núcleo centrado, sin animación de despliegue)
      const fr = fullRect();
      R.x = RT.x = fr.x; R.y = RT.y = fr.y; R.w = RT.w = fr.w; R.h = RT.h = fr.h;
      computeEdges();
      api.setState(_wakeOn() ? 'command' : 'passive');
    },
    // Volver al overlay fullscreen disparado por voz
    undock() {
      host = null; docked = false;
      canvas.style.position = 'fixed'; canvas.style.left = ''; canvas.style.top = ''; canvas.style.zIndex = '9999';
      document.body.appendChild(canvas);
      resize();
      api.setState('passive');
    },
    isDocked(){ return docked; }
  };
  window.JARVIS_FX = api;

  /* ── Topología: aristas por cercanía + lista de adyacencia (para propagar señales) ── */
  function computeEdges() {
    edges.length = 0;
    for (let i = 0; i < N; i++) adj[i].length = 0;
    const maxD = (R.w + R.h) * 0.15 + 26;
    for (let i = 0; i < N; i++) {
      let cnt = 0;
      const ax = R.x + nodes[i].ux * R.w, ay = R.y + nodes[i].uy * R.h;
      for (let j = i + 1; j < N; j++) {
        const bx = R.x + nodes[j].ux * R.w, by = R.y + nodes[j].uy * R.h;
        const d = Math.hypot(ax - bx, ay - by);
        if (d < maxD) { edges.push([i, j, maxD]); adj[i].push(j); adj[j].push(i); if (++cnt > 5) break; }
      }
    }
  }

  /* ── Señales que disparan como neuronas: saltan de nodo a nodo y se ramifican ── */
  function ignite(i, hop) {
    nodes[i].fire = 1;
    if (hop > 5 || pulses.length >= ((REDUCED || W < 760) ? 40 : 80)) return;
    const ns = adj[i]; if (!ns.length) return;
    const branches = hop === 0 ? 2 : (Math.random() < 0.45 ? 2 : 1);
    for (let b = 0; b < branches; b++) {
      const j = ns[(Math.random() * ns.length) | 0];
      pulses.push({ a: i, b: j, t: 0, sp: rnd(0.7, 1.3) + energy * 0.7, hop: hop });
    }
  }
  function igniteRandom() { ignite((Math.random() * N) | 0, 0); }
  const speaking = () => { try { return !!(window.JARVIS && JARVIS.isSpeaking()); } catch (e) { return false; } };

  /* ── Glow aditivo barato (2 capas, sin shadowBlur) ── */
  function glow(x, y, r, c, a) {
    if (a <= 0) return;
    ctx.fillStyle = rgba(c, a * 0.26); ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(c, a);        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  /* ── Estructuras de fondo: grilla de puntería + anillos + radios (sólo expandido) ── */
  function drawBackdrop(cx, cy, vis) {
    const base = Math.max(R.w, R.h) * 0.5, a = vis * opacity;
    ctx.lineWidth = 1;
    // anillos concéntricos, alternando sólidos y punteados
    for (let i = 0; i < 4; i++) {
      ctx.setLineDash(i % 2 ? [2, 7] : []);
      ctx.strokeStyle = rgba(CD, (i % 2 ? 0.04 : 0.06) * a);
      ctx.beginPath(); ctx.arc(cx, cy, base * (0.42 + i * 0.2), 0, TAU); ctx.stroke();
    }
    ctx.setLineDash([]);
    // radios tenues girando (los múltiplos de 4 llegan más lejos)
    const spokes = 48, rot = t * 0.05;
    ctx.strokeStyle = rgba(CD, 0.03 * a);
    for (let i = 0; i < spokes; i++) {
      const ang = rot + i / spokes * TAU, c = Math.cos(ang), s = Math.sin(ang), far = i % 4 ? 1.0 : 1.18;
      ctx.beginPath(); ctx.moveTo(cx + c * base * 0.42, cy + s * base * 0.42); ctx.lineTo(cx + c * base * far, cy + s * base * far); ctx.stroke();
    }
    // cruz de mira sutil a través del centro
    ctx.strokeStyle = rgba(CD, 0.045 * a);
    ctx.beginPath();
    ctx.moveTo(cx - base * 1.3, cy); ctx.lineTo(cx + base * 1.3, cy);
    ctx.moveTo(cx, cy - base * 1.3); ctx.lineTo(cx, cy + base * 1.3);
    ctx.stroke();
  }

  /* ── Núcleo tipo reactor: halo, anillos, arcos, iris doble, filamentos, satélites, orbe ── */
  function drawCore(cx, cy, cr) {
    const e = energy, rot = t, o = opacity;

    // halo radial suave detrás del núcleo (atmósfera / profundidad)
    const hg = ctx.createRadialGradient(cx, cy, cr * 0.2, cx, cy, cr * 2.0);
    hg.addColorStop(0, rgba(C2, (0.10 + 0.10 * e + levelS * 0.15) * o));
    hg.addColorStop(1, rgba(C2, 0));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, cr * 2.0, 0, TAU); ctx.fill();

    // anillo exterior con marcas finas (+ marcadores diamante en las mayores)
    const ticks = 60;
    ctx.lineWidth = 1;
    for (let i = 0; i < ticks; i++) {
      const a = rot * 0.2 + i / ticks * TAU, big = i % 5 === 0, ca = Math.cos(a), sa = Math.sin(a);
      const r1 = cr * 1.45, r2 = cr * (big ? 1.64 : 1.55);
      ctx.strokeStyle = rgba(C, (big ? 0.55 : 0.20) * o);
      ctx.beginPath(); ctx.moveTo(cx + ca * r1, cy + sa * r1); ctx.lineTo(cx + ca * r2, cy + sa * r2); ctx.stroke();
      if (big) { ctx.fillStyle = rgba(C2, 0.5 * o); ctx.beginPath(); ctx.arc(cx + ca * cr * 1.72, cy + sa * cr * 1.72, 1.3, 0, TAU); ctx.fill(); }
    }

    // arcos parciales rotando (gyroscopio, 4 niveles)
    const arcs = [[cr * 1.18, 0.2, 2.0, 0.6, 2, C2], [cr * 1.30, 3.2, 5.0, -0.4, 1.5, C], [cr * 1.00, 1.5, 3.0, 0.9, 2.5, C2], [cr * 0.86, 4.0, 5.2, -0.7, 1.5, C2]];
    for (const ar of arcs) {
      ctx.strokeStyle = rgba(ar[5], (0.4 + 0.4 * e) * o); ctx.lineWidth = ar[4];
      ctx.beginPath(); ctx.arc(cx, cy, ar[0], rot * ar[3] + ar[1], rot * ar[3] + ar[2]); ctx.stroke();
    }

    // anillos finos internos
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C, 0.18 * o); ctx.beginPath(); ctx.arc(cx, cy, cr * 0.74, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(C, 0.12 * o); ctx.beginPath(); ctx.arc(cx, cy, cr * 0.46, 0, TAU); ctx.stroke();

    // anillo punteado exterior
    ctx.setLineDash([3, 6]); ctx.strokeStyle = rgba(C, 0.3 * o); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, cr * 1.7, -rot * 0.3, -rot * 0.3 + TAU); ctx.stroke();
    ctx.setLineDash([]);

    // iris hexagonal pulsante
    const ir = cr * (0.55 + 0.12 * Math.sin(t * 3) + levelS * 0.4), irot = -rot * 0.5;
    ctx.strokeStyle = rgba(C2, (0.5 + 0.4 * e) * o); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const a = irot + i / 6 * TAU, fx = cx + Math.cos(a) * ir, fy = cy + Math.sin(a) * ir; i ? ctx.lineTo(fx, fy) : ctx.moveTo(fx, fy); }
    ctx.stroke();
    // iris triangular interior contra-rotando
    const ir2 = cr * (0.34 + levelS * 0.25), trot = rot * 0.7;
    ctx.strokeStyle = rgba(CW, (0.32 + 0.4 * e) * o); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) { const a = trot + i / 3 * TAU, fx = cx + Math.cos(a) * ir2, fy = cy + Math.sin(a) * ir2; i ? ctx.lineTo(fx, fy) : ctx.moveTo(fx, fy); }
    ctx.stroke();

    // radios internos pulsantes
    for (let i = 0; i < 12; i++) {
      const a = rot * 0.4 + i / 12 * TAU, pl = 0.5 + 0.5 * Math.sin(t * 4 + i);
      ctx.strokeStyle = rgba(C2, 0.18 * pl * (0.4 + e) * o); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * cr * 0.62, cy + Math.sin(a) * cr * 0.62); ctx.lineTo(cx + Math.cos(a) * cr * (0.9 + 0.2 * pl), cy + Math.sin(a) * cr * (0.9 + 0.2 * pl)); ctx.stroke();
    }

    // filamentos eléctricos que parpadean entre el iris y el anillo
    if (!REDUCED) for (let i = 0; i < 5; i++) {
      const fl = Math.sin(t * 7 + i * 1.7); if (fl < 0.4) continue;
      const a = rot * 0.9 + i / 5 * TAU + i, r1 = cr * 0.5, r2 = cr * 1.12, midR = (r1 + r2) / 2, ja = a + (Math.random() - 0.5) * 0.3;
      ctx.strokeStyle = rgba(CW, (fl - 0.4) * 0.5 * (0.4 + e) * o); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(ja) * midR, cy + Math.sin(ja) * midR);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }

    // satélites en órbita (con estela corta)
    for (const s of sats) {
      s.a += s.sp / 60;
      const x = cx + Math.cos(s.a) * cr * s.rad, y = cy + Math.sin(s.a) * cr * s.rad;
      const xb = cx + Math.cos(s.a - s.sp * 0.12) * cr * s.rad, yb = cy + Math.sin(s.a - s.sp * 0.12) * cr * s.rad;
      ctx.strokeStyle = rgba(C2, s.e * 0.3 * o); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(x, y); ctx.stroke();
      glow(x, y, s.r, C2, s.e * (0.5 + 0.5 * e) * o);
    }

    // orbe central con bloom
    ctx.shadowColor = rgba(C2, 1); ctx.shadowBlur = 26 + e * 36 + levelS * 30;
    ctx.fillStyle = rgba(C2, 0.85 * o);
    ctx.beginPath(); ctx.arc(cx, cy, cr * 0.34 + levelS * 6, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(CW, 0.95 * o);
    ctx.beginPath(); ctx.arc(cx, cy, cr * 0.16 + levelS * 3, 0, TAU); ctx.fill();
  }

  /* ── Marco HUD: brackets, retícula con grados, radar, ecualizador, telemetría, datos ── */
  function drawHUD(cx, cy, vis) {
    const a = vis * opacity, rr = Math.min(W, H) * 0.42, wide = W > 760;
    // brackets de esquina (doble línea + punto)
    const m = 24, L = 36;
    const corner = (x, y, dx, dy) => {
      ctx.strokeStyle = rgba(C, 0.55 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L); ctx.stroke();
      ctx.strokeStyle = rgba(C, 0.22 * a); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + dx * (L * 0.6), y + dy * 6); ctx.lineTo(x + dx * 6, y + dy * 6); ctx.lineTo(x + dx * 6, y + dy * (L * 0.6)); ctx.stroke();
      ctx.fillStyle = rgba(C2, 0.6 * a); ctx.beginPath(); ctx.arc(x + dx * 6, y + dy * 6, 1.6, 0, TAU); ctx.fill();
    };
    corner(m, m, 1, 1); corner(W - m, m, -1, 1); corner(m, H - m, 1, -1); corner(W - m, H - m, -1, -1);
    // retícula grande rotando con marcas de grado + cruces cardinales
    ctx.lineWidth = 1;
    for (let s = 0; s < 4; s++) { const a0 = t * 0.1 + s * (TAU / 4); ctx.strokeStyle = rgba(C, 0.10 * a); ctx.beginPath(); ctx.arc(cx, cy, rr, a0 + 0.15, a0 + TAU / 4 - 0.15); ctx.stroke(); }
    for (let i = 0; i < 72; i++) {
      const ang = i / 72 * TAU + t * 0.1, big = i % 9 === 0, c = Math.cos(ang), s = Math.sin(ang), len = big ? 9 : 4;
      ctx.strokeStyle = rgba(C, (big ? 0.30 : 0.12) * a);
      ctx.beginPath(); ctx.moveTo(cx + c * rr, cy + s * rr); ctx.lineTo(cx + c * (rr - len), cy + s * (rr - len)); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) { const ang = i * (TAU / 4) + t * 0.1, x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr; ctx.strokeStyle = rgba(C2, 0.4 * a); ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke(); }
    // barrido de radar (cuña con degradé + línea)
    if (!REDUCED) {
      const sweep = t * (state === 'thinking' ? 1.5 : 0.7);
      const wg = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep) * rr, cy + Math.sin(sweep) * rr);
      wg.addColorStop(0, rgba(C2, 0.20 * a)); wg.addColorStop(1, rgba(C2, 0));
      ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, sweep - 0.28, sweep); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(C2, 0.5 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep) * rr, cy + Math.sin(sweep) * rr); ctx.stroke();
    }
    // ecualizador de voz (barras simétricas que reaccionan al nivel)
    if (wide) {
      const bars = 24, bw = 3, gap = 3, bx0 = cx - bars * (bw + gap) / 2, by0 = H - 44;
      for (let i = 0; i < bars; i++) {
        const dd = Math.abs(i - bars / 2) / (bars / 2);
        const h = 3 + (levelS * 58 + energy * 12) * (1 - dd * 0.7) * (0.55 + 0.45 * Math.sin(t * 8 + i));
        ctx.fillStyle = rgba(i % 2 ? C2 : C, (0.22 + 0.5 * levelS) * a);
        ctx.fillRect(bx0 + i * (bw + gap), by0 - h, bw, h);
      }
    }
    // telemetría dinámica en las esquinas
    if (wide) {
      ctx.font = '10px monospace'; ctx.textBaseline = 'top';
      const stat = state === 'thinking' ? 'PROCESSING' : state === 'command' ? 'LISTENING' : 'STANDBY';
      ctx.fillStyle = rgba(C2, 0.7 * a);
      ctx.fillText((Math.sin(t * 4) > 0 ? '● ' : '○ ') + 'NEURAL LINK · ' + stat, m + 16, m + 5);
      ctx.fillStyle = rgba(C, 0.45 * a);
      ctx.fillText('NODES ' + N + ' · SYNC ' + (90 + (((t * 3) | 0) % 10)) + '%', m + 16, m + 19);
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(C2, 0.6 * a); ctx.fillText('PWR ' + Math.round((0.4 + energy * 0.6) * 100) + '%', W - m - 16, m + 5);
      ctx.fillStyle = rgba(C, 0.45 * a); ctx.fillText('AUDIO ' + Math.round(levelS * 100) + '%', W - m - 16, m + 19);
      ctx.textAlign = 'left';
    }
    // lluvia de datos hexadecimales (sólo en pantallas anchas, por costo)
    if (!REDUCED && wide) {
      ctx.font = '10px monospace'; ctx.textBaseline = 'top';
      const step = 18, rows = Math.min(46, Math.ceil(H / step) + 1);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i]; c.off += c.sp; if (c.off >= step) c.off -= step;
        const x = (i + 0.5) / cols.length * W;
        for (let r = 0; r < rows; r++) {
          const ch = HEX[(r * 7 + i * 13 + ((t * (2 + i)) | 0)) % 16];
          ctx.fillStyle = rgba(C, 0.09 * a * (0.4 + 0.6 * ((r + i) % 5) / 4));
          ctx.fillText(ch, x, r * step - step + c.off);
        }
      }
    }
  }

  let raf;
  function frame() {
    t += 1 / 60;
    levelS += (level - levelS) * 0.22;
    levelPk *= 0.90; if (level > levelPk) levelPk = level;
    const breath = (state === 'passive' || state === 'off') ? (Math.sin(t * 1.5) * 0.5 + 0.5) * 0.10 : 0;
    const eTarget = energyT + (state === 'command' ? levelS * 0.5 : 0) + breath;
    energy  += (eTarget  - energy)  * 0.08;
    opacity += (opacityT - opacity) * 0.08;
    expand  += (expandT  - expand)  * 0.06;
    const exv = clamp01((expand - 0.12) / 0.88);

    const cr = cornerRect(), fr = fullRect();
    RT.x = cr.x + (fr.x - cr.x) * expand; RT.y = cr.y + (fr.y - cr.y) * expand;
    RT.w = cr.w + (fr.w - cr.w) * expand; RT.h = cr.h + (fr.h - cr.h) * expand;
    R.x += (RT.x - R.x) * 0.2; R.y += (RT.y - R.y) * 0.2;
    R.w += (RT.w - R.w) * 0.2; R.h += (RT.h - R.h) * 0.2;

    // nodos: deriva suave + decaimiento de la activación neuronal
    const jit = REDUCED ? 0 : 0.0006 * energy;
    for (let i = 1; i < N; i++) {
      const n = nodes[i];
      n.ux += n.vx + (Math.random() - 0.5) * jit;
      n.uy += n.vy + (Math.random() - 0.5) * jit;
      if (n.ux < 0.04 || n.ux > 0.96) n.vx *= -1;
      if (n.uy < 0.04 || n.uy > 0.96) n.vy *= -1;
      n.ux = n.ux < 0.03 ? 0.03 : n.ux > 0.97 ? 0.97 : n.ux;
      n.uy = n.uy < 0.03 ? 0.03 : n.uy > 0.97 ? 0.97 : n.uy;
      n.fire *= 0.94;
    }
    nodes[0].fire = Math.max(nodes[0].fire, 0.5 + 0.5 * energy);

    if (--edgeTimer <= 0) { computeEdges(); edgeTimer = REDUCED ? 45 : 30; }
    if (!REDUCED) {
      const rate = 0.10 + energy * (state === 'thinking' ? 1.0 : 0.5);
      if (Math.random() < rate) igniteRandom();
      if (state === 'thinking' && Math.random() < rate * 0.7) igniteRandom();
      // chispas en picos de voz
      if (state === 'command' && levelPk > 0.55 && sparks.length < 120 && Math.random() < levelPk) {
        const sx = R.x + 0.5 * R.w, sy = R.y + 0.5 * R.h;
        for (let s = 0; s < 3; s++) { const a = Math.random() * TAU, v = rnd(1.5, 4); sparks.push({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 }); }
      }
    }
    if (speaking() && !REDUCED && t - lastWave > 0.5) { waves.push({ t: 0 }); lastWave = t; }

    ctx.clearRect(0, 0, W, H);
    // Pausar el loop cuando el canvas está oculto (reposo sin dock): retomar en 800ms en vez de cada frame
    if (canvas.style.display === 'none' && !docked) {
      idleTimer = setTimeout(() => { idleTimer = 0; raf = requestAnimationFrame(frame); }, 800);
      return;
    }
    if (opacity <= 0.012) { raf = requestAnimationFrame(frame); return; }
    ctx.globalCompositeOperation = 'lighter';
    const cx = R.x + 0.5 * R.w, cy = R.y + 0.5 * R.h;
    const coreR = Math.min(R.w, R.h) * (0.13 + 0.02 * Math.sin(t * 2)) + 6 + levelS * 10;

    if (exv > 0.01) drawBackdrop(cx, cy, exv);

    // partículas
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.ux += p.vx; p.uy += p.vy;
      if (p.ux < 0) p.ux += 1; else if (p.ux > 1) p.ux -= 1;
      if (p.uy < 0) p.uy += 1; else if (p.uy > 1) p.uy -= 1;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + p.tw));
      glow(R.x + p.ux * R.w, R.y + p.uy * R.h, p.r, C, tw * (0.10 + 0.25 * energy) * opacity);
    }

    // sinapsis curvas (brillan cuando sus extremos disparan)
    for (let k = 0; k < edges.length; k++) {
      const a = nodes[edges[k][0]], b = nodes[edges[k][1]], maxD = edges[k][2];
      const ax = R.x + a.ux * R.w, ay = R.y + a.uy * R.h, bx = R.x + b.ux * R.w, by = R.y + b.uy * R.h;
      const d = Math.hypot(ax - bx, ay - by), prox = 1 - d / maxD;
      if (prox <= 0) continue;
      const fireB = a.fire > b.fire ? a.fire : b.fire;
      const al = prox * (0.05 + 0.16 * energy + 0.5 * fireB) * opacity;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, off = (a.ph - b.ph) * 6, inv = 1 / (d || 1);
      ctx.strokeStyle = rgba(fireB > 0.2 ? C2 : C, al); ctx.lineWidth = 0.6 + fireB * 1.6;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx - (by - ay) * inv * off, my + (bx - ax) * inv * off, bx, by); ctx.stroke();
    }

    // señales viajando (con cola) que se encadenan al llegar
    for (let p = pulses.length - 1; p >= 0; p--) {
      const pl = pulses[p]; pl.t += pl.sp / 60;
      const a = nodes[pl.a], b = nodes[pl.b];
      const ax = R.x + a.ux * R.w, ay = R.y + a.uy * R.h, bx = R.x + b.ux * R.w, by = R.y + b.uy * R.h;
      if (pl.t >= 1) { pulses.splice(p, 1); if (Math.random() < 0.62) ignite(pl.b, pl.hop + 1); else nodes[pl.b].fire = 1; continue; }
      const x = ax + (bx - ax) * pl.t, y = ay + (by - ay) * pl.t;
      // cola tipo cometa en 2 segmentos (sin createLinearGradient por frame: mucho más barato en mobile)
      const back = Math.max(0, pl.t - 0.16), mid = Math.max(0, pl.t - 0.08);
      const tx = ax + (bx - ax) * back, ty = ay + (by - ay) * back, hx = ax + (bx - ax) * mid, hy = ay + (by - ay) * mid;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = rgba(C2, opacity * 0.22); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = rgba(C2, opacity * 0.6);  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(x, y); ctx.stroke();
      glow(x, y, 1.8, CW, opacity);
    }

    // chispas
    for (let s = sparks.length - 1; s >= 0; s--) {
      const sk = sparks[s]; sk.x += sk.vx; sk.y += sk.vy; sk.vx *= 0.96; sk.vy *= 0.96; sk.life -= 0.03;
      if (sk.life <= 0) { sparks.splice(s, 1); continue; }
      glow(sk.x, sk.y, 1.5, CW, sk.life * opacity);
    }

    // neuronas
    for (let i = 1; i < N; i++) {
      const n = nodes[i], x = R.x + n.ux * R.w, y = R.y + n.uy * R.h;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + n.ph);
      const rr = (n.r * (0.6 + 0.7 * n.z)) * (0.7 + expand * 0.7) * (0.85 + 0.3 * pulse) + energy + n.fire * 2.5;
      const al = (0.30 + 0.40 * pulse + 0.5 * n.fire) * opacity * (0.5 + 0.5 * energy) * (0.5 + 0.5 * n.z);
      glow(x, y, rr, n.fire > 0.25 ? CW : C2, al);
      // detalle: anillo de activación que se expande + destello en cruz al disparar
      if (n.fire > 0.18) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(CW, n.fire * 0.5 * opacity);
        ctx.beginPath(); ctx.arc(x, y, rr + 2 + (1 - n.fire) * 6, 0, TAU); ctx.stroke();
        const g = (rr + 5) * n.fire;
        ctx.strokeStyle = rgba(CW, n.fire * 0.55 * opacity);
        ctx.beginPath(); ctx.moveTo(x - g, y); ctx.lineTo(x + g, y); ctx.moveTo(x, y - g); ctx.lineTo(x, y + g); ctx.stroke();
      } else if (n.z > 0.82 && expand > 0.3) {
        // halo tenue alrededor de los nodos grandes (sensación de profundidad)
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(C, 0.14 * al);
        ctx.beginPath(); ctx.arc(x, y, rr + 3, 0, TAU); ctx.stroke();
      }
    }

    drawCore(cx, cy, coreR);
    if (exv > 0.01) drawHUD(cx, cy, exv);

    // ondas (hablando)
    for (let w = waves.length - 1; w >= 0; w--) {
      const wv = waves[w]; wv.t += 1 / 60;
      const al = 1 - wv.t; if (al <= 0) { waves.splice(w, 1); continue; }
      ctx.strokeStyle = rgba(C2, al * 0.4 * opacity); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, wv.t * Math.max(R.w, R.h) * 0.6, 0, TAU); ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf); clearTimeout(idleTimer); idleTimer = 0;
    if (!document.hidden) raf = requestAnimationFrame(frame);
  });
})();
