/* ── LOGIN SCREEN ── */
(function () {
  const screen   = document.getElementById('login-screen');
  const bgCanvas = document.getElementById('login-bg-canvas');
  const vizCanvas= document.getElementById('ai-viz-canvas');
  const bgCtx    = bgCanvas.getContext('2d');
  const vizCtx   = vizCanvas.getContext('2d');

  /* ── background: scrolling grid + drifting particles ── */
  let W = 0, H = 0;
  const PTCLS = Array.from({ length: 90 }, () => ({
    x: Math.random(), y: Math.random(),
    s: Math.random() * 1.4 + 0.4,
    sp: Math.random() * 0.00025 + 0.00008,
    o: Math.random() * 0.5 + 0.15,
  }));

  function resizeBg() {
    W = bgCanvas.width  = window.innerWidth;
    H = bgCanvas.height = window.innerHeight;
  }
  resizeBg();
  window.addEventListener('resize', resizeBg);

  let bgT = 0;
  function drawBg() {
    bgCtx.clearRect(0, 0, W, H);
    bgT += 0.004;
    const gs = 55;
    const oy = (bgT * 18) % gs;
    bgCtx.strokeStyle = 'rgba(0,212,255,0.065)';
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    for (let x = 0; x <= W + gs; x += gs) { bgCtx.moveTo(x, 0); bgCtx.lineTo(x, H); }
    for (let y = -gs + oy; y <= H + gs; y += gs) { bgCtx.moveTo(0, y); bgCtx.lineTo(W, y); }
    bgCtx.stroke();
    for (const p of PTCLS) {
      p.y -= p.sp;
      if (p.y < 0) { p.y = 1; p.x = Math.random(); }
      bgCtx.beginPath();
      bgCtx.arc(p.x * W, p.y * H, p.s, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(0,212,255,${p.o})`;
      bgCtx.fill();
    }
  }

  /* ── AI visualisation: neural orb ── */
  const VS = 400;
  vizCanvas.width  = VS;
  vizCanvas.height = VS;
  const CX = VS / 2, CY = VS / 2;

  const NODES = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2;
    const r = 70 + Math.sin(i * 1.9) * 38;
    return { a, r, phase: Math.random() * Math.PI * 2, spd: 0.008 + Math.random() * 0.012 };
  });

  let t = 0;
  function drawViz() {
    vizCtx.clearRect(0, 0, VS, VS);
    t += 0.018;

    /* outer glow rings */
    [160, 120, 85].forEach((r, i) => {
      vizCtx.beginPath();
      vizCtx.arc(CX, CY, r + Math.sin(t * 0.6 + i) * 4, 0, Math.PI * 2);
      vizCtx.strokeStyle = `rgba(0,212,255,${0.07 + i * 0.025})`;
      vizCtx.lineWidth = 1;
      vizCtx.stroke();
    });

    /* rotating arcs */
    for (let a = 0; a < 3; a++) {
      const rot = t * (0.45 + a * 0.28) + a * (Math.PI * 2 / 3);
      vizCtx.beginPath();
      vizCtx.arc(CX, CY, 130 + a * 12, rot, rot + Math.PI * 0.55);
      vizCtx.strokeStyle = `rgba(0,212,255,${0.35 - a * 0.08})`;
      vizCtx.lineWidth = 1.5 - a * 0.3;
      vizCtx.stroke();
      vizCtx.beginPath();
      vizCtx.arc(CX, CY, 130 + a * 12, rot + Math.PI, rot + Math.PI * 1.45);
      vizCtx.strokeStyle = `rgba(140,80,255,${0.22 - a * 0.05})`;
      vizCtx.lineWidth = 1;
      vizCtx.stroke();
    }

    /* node positions */
    const pos = NODES.map(n => ({
      x: Math.cos(n.a + t * 0.08) * (n.r + Math.sin(t * n.spd * 60 + n.phase) * 7) + CX,
      y: Math.sin(n.a + t * 0.08) * (n.r + Math.sin(t * n.spd * 60 + n.phase) * 7) + CY,
    }));

    /* connections between nearby nodes */
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 115) {
          vizCtx.beginPath();
          vizCtx.moveTo(pos[i].x, pos[i].y);
          vizCtx.lineTo(pos[j].x, pos[j].y);
          vizCtx.strokeStyle = `rgba(0,212,255,${(1 - d / 115) * 0.28 * (0.5 + Math.sin(t + i) * 0.5)})`;
          vizCtx.lineWidth = 0.7;
          vizCtx.stroke();
        }
      }
      /* spoke to core */
      vizCtx.beginPath();
      vizCtx.moveTo(CX, CY);
      vizCtx.lineTo(pos[i].x, pos[i].y);
      vizCtx.strokeStyle = `rgba(80,130,255,${0.08 + Math.sin(t * 1.8 + i) * 0.06})`;
      vizCtx.lineWidth = 0.5;
      vizCtx.stroke();
    }

    /* node dots */
    for (const p of pos) {
      const g = vizCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7);
      g.addColorStop(0, 'rgba(0,212,255,0.85)');
      g.addColorStop(1, 'rgba(0,212,255,0)');
      vizCtx.beginPath(); vizCtx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      vizCtx.fillStyle = g; vizCtx.fill();
      vizCtx.beginPath(); vizCtx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      vizCtx.fillStyle = '#fff'; vizCtx.fill();
    }

    /* scanner beam */
    const sa = t * 1.6;
    const sx = Math.cos(sa) * 155 + CX, sy = Math.sin(sa) * 155 + CY;
    const beamGrad = vizCtx.createLinearGradient(CX, CY, sx, sy);
    beamGrad.addColorStop(0, 'rgba(0,212,255,0)');
    beamGrad.addColorStop(0.7, 'rgba(0,212,255,0.1)');
    beamGrad.addColorStop(1,   'rgba(0,212,255,0.65)');
    vizCtx.beginPath(); vizCtx.moveTo(CX, CY); vizCtx.lineTo(sx, sy);
    vizCtx.strokeStyle = beamGrad; vizCtx.lineWidth = 2; vizCtx.stroke();

    /* core pulse */
    const pulse = 0.5 + Math.sin(t * 2) * 0.5;
    const cg = vizCtx.createRadialGradient(CX, CY, 0, CX, CY, 55 + pulse * 18);
    cg.addColorStop(0,   `rgba(0,212,255,${0.55 + pulse * 0.3})`);
    cg.addColorStop(0.35,`rgba(0,212,255,${0.12 + pulse * 0.08})`);
    cg.addColorStop(1,   'rgba(0,212,255,0)');
    vizCtx.beginPath(); vizCtx.arc(CX, CY, 55 + pulse * 18, 0, Math.PI * 2);
    vizCtx.fillStyle = cg; vizCtx.fill();

    const cs = vizCtx.createRadialGradient(CX, CY, 0, CX, CY, 20);
    cs.addColorStop(0,   '#ffffff');
    cs.addColorStop(0.45,'rgba(0,212,255,0.9)');
    cs.addColorStop(1,   'rgba(0,50,120,0.2)');
    vizCtx.beginPath(); vizCtx.arc(CX, CY, 20, 0, Math.PI * 2);
    vizCtx.fillStyle = cs; vizCtx.fill();
  }

  /* ── animation loop ── */
  let running = true;
  function tick() {
    if (!running) return;
    drawBg(); drawViz();
    requestAnimationFrame(tick);
  }
  tick();

  /* ── login logic ── */
  const btnEl   = document.getElementById('login-btn');
  const userEl  = document.getElementById('login-user');
  const passEl  = document.getElementById('login-pass');
  const errEl   = document.getElementById('login-error');

  async function tryLogin() {
    if (userEl.value.trim() === 'Loustau11' && passEl.value === 'Loustau88') {
      errEl.textContent = '';
      btnEl.textContent = 'SINCRONIZANDO...';
      btnEl.style.color = 'rgba(0,212,255,0.9)';
      btnEl.disabled = true;

      // Si hay datos en localStorage, subirlos a Firestore ahora
      const localRaw = localStorage.getItem('lifedash_v2');
      if (localRaw) {
        try {
          await _DOC().set({ state: localRaw });
        } catch(e) {
          errEl.textContent = '[ SYNC ERROR: ' + (e.code || e.message) + ' ]';
          await new Promise(r => setTimeout(r, 3000));
          errEl.textContent = '';
        }
      }

      btnEl.textContent  = 'ACCESO CONCEDIDO';
      btnEl.style.color  = '#00FF88';
      btnEl.style.borderColor = '#00FF88';
      btnEl.style.boxShadow   = '0 0 24px rgba(0,255,136,0.45)';
      if (window.JARVIS) { JARVIS.greeting(); JARVIS.checkOverdue(); setTimeout(() => JARVIS.checkVoiceQuota && JARVIS.checkVoiceQuota(), 4000); }
      setTimeout(() => {
        screen.classList.add('exit');
        setTimeout(() => { screen.remove(); running = false; }, 1700);
      }, 900);
    } else {
      errEl.textContent = '[ ACCESO DENEGADO — CREDENCIALES INVÁLIDAS ]';
      userEl.classList.add('error'); passEl.classList.add('error');
      passEl.value = '';
      setTimeout(() => {
        userEl.classList.remove('error'); passEl.classList.remove('error');
      }, 1600);
    }
  }

  btnEl.addEventListener('click', tryLogin);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  userEl.addEventListener('keydown', e => { if (e.key === 'Enter') passEl.focus(); });

  document.getElementById('ai-viz-canvas').addEventListener('click', async () => {
    errEl.textContent = '';
    btnEl.textContent = 'SINCRONIZANDO...';
    btnEl.style.color = 'rgba(0,212,255,0.9)';
    btnEl.disabled = true;
    const localRaw = localStorage.getItem('lifedash_v2');
    if (localRaw) {
      try { await _DOC().set({ state: localRaw }); } catch(e) {}
    }
    btnEl.textContent = 'ACCESO CONCEDIDO';
    btnEl.style.color = '#00FF88';
    btnEl.style.borderColor = '#00FF88';
    btnEl.style.boxShadow = '0 0 24px rgba(0,255,136,0.45)';
    if (window.JARVIS) JARVIS.greeting();
    setTimeout(() => {
      screen.classList.add('exit');
      setTimeout(() => { screen.remove(); running = false; }, 1700);
    }, 900);
  });
})();
