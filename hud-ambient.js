(function(){
  'use strict';
  const cv = document.getElementById('hud-ambient');
  if (!cv) return;
  const ctx = cv.getContext('2d', { alpha: true });
  const reduce = false; // motion siempre activo, en todos los dispositivos

  // Color de acento por sección (igual a --c-*). Se actualiza al cambiar de tab.
  const TINT = { jarvis:[92,246,255], vida:[0,212,255], finanzas:[34,197,94], salud:[244,63,94], conocimiento:[107,142,255], ia:[196,208,228] };
  let accent = TINT.jarvis.slice();
  let accentTarget = TINT.jarvis.slice();
  function syncAccent(){
    const t = document.querySelector('.nav-btn.active')?.dataset.tab;
    if (t && TINT[t]) accentTarget = TINT[t];
  }

  let W = 0, H = 0, dpr = 1;
  function resize(){
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  // Nodos del campo
  let nodes = [], pulses = [];
  const LINK = 132;        // distancia máxima de enlace
  function nodeCount(){
    const area = W * H;
    const base = Math.round(area / 16000);   // densidad
    return Math.max(26, Math.min(window.innerWidth > 880 ? 110 : 52, base));
  }
  function seed(){
    const n = nodeCount();
    nodes = [];
    for (let i = 0; i < n; i++){
      nodes.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * 0.16, vy: (Math.random() - .5) * 0.16,
        r: Math.random() * 1.3 + 0.6,
        ph: Math.random() * Math.PI * 2
      });
    }
    pulses = [];
  }

  function spawnPulse(){
    if (nodes.length < 2) return;
    const a = nodes[(Math.random() * nodes.length) | 0];
    // buscar un vecino cercano
    let best = null, bd = LINK * LINK;
    for (let k = 0; k < 7; k++){
      const b = nodes[(Math.random() * nodes.length) | 0];
      if (b === a) continue;
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) pulses.push({ a, b: best, t: 0, sp: 0.012 + Math.random() * 0.02 });
  }

  let last = 0, hidden = false, frame = 0;
  function draw(ts){
    if (hidden) return;
    requestAnimationFrame(draw);
    if (ts - last < 22) return;        // ~45fps cap
    last = ts;
    frame++;

    // interpolar tinte de sección
    if (frame % 4 === 0) syncAccent();
    for (let c = 0; c < 3; c++) accent[c] += (accentTarget[c] - accent[c]) * 0.05;
    const [R, G, B] = accent.map(v => Math.round(v));

    ctx.clearRect(0, 0, W, H);

    // mover nodos
    for (const p of nodes){
      p.x += p.vx; p.y += p.vy; p.ph += 0.02;
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
    }

    // enlaces
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++){
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++){
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK * LINK){
          const al = (1 - Math.sqrt(d2) / LINK) * 0.16;
          ctx.strokeStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + al + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }

    // nodos (glow)
    for (const p of nodes){
      const tw = 0.5 + 0.5 * Math.sin(p.ph);
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + (0.25 + tw * 0.45) + ')';
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }

    // pulsos de datos viajando por los enlaces
    if (frame % 16 === 0 && pulses.length < 14) spawnPulse();
    for (let i = pulses.length - 1; i >= 0; i--){
      const pl = pulses[i];
      pl.t += pl.sp;
      if (pl.t >= 1){ pulses.splice(i, 1); continue; }
      const x = pl.a.x + (pl.b.x - pl.a.x) * pl.t;
      const y = pl.a.y + (pl.b.y - pl.a.y) * pl.t;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',0.9)';
      ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',0.18)';
      ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function start(){ hidden = false; last = 0; requestAnimationFrame(draw); }
  function stop(){ hidden = true; }

  addEventListener('resize', () => { clearTimeout(cv._rt); cv._rt = setTimeout(resize, 180); }, { passive: true });
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });

  resize();
  if (reduce){
    // un solo frame estático, sin loop
    syncAccent(); accent = accentTarget.slice();
    requestAnimationFrame(t => { hidden = false; draw(t); hidden = true; });
  } else {
    start();
  }
  // exponer por si otra capa quiere forzar tinte
  window.HUD_AMBIENT = { resize, setTab: t => { if (TINT[t]) accentTarget = TINT[t]; } };
})();
