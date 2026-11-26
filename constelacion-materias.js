'use strict';
// ════════════════════════════════════════════════════════════════════════
// CONSTELACIÓN DE MATERIAS (Conocimiento → "Mapa de la carrera").
// Todas las materias del plan (CORR_SUBJECTS, correlativas.js) como estrellas, unidas por sus correlativas.
// Pantalla ancha: mapa horizontal, una columna por año. Celular: vertical, un año por franja.
// Solo LEE el estado (Correlativas.computeStatus/estado, Finales.activos, S.lawPlan); no guarda nada.
// Rendimiento: el SVG se arma una vez por orientación; cada cambio de datos solo cambia clases (y solo si
// cambió la firma de estados/fechas). Animación solo transform/opacity y solo con el mapa en pantalla.
// ════════════════════════════════════════════════════════════════════════
const Constelacion = (() => {
  const ANCHO_MIN = 620;      // ancho del mapa a partir del cual se usa la versión horizontal
  const ESTADOS = {
    ap: 'Aprobada', cu: 'En curso o con final', pe: 'Pendiente',
    bl: 'Bloqueada: faltan correlativas', ex: 'Otra opción elegida',
  };
  // Nombre corto de cada materia para la etiqueta del mapa (el nombre completo sale al tocarla).
  const CORTO = {
    '60-1351': 'Priv. General', '10-550': 'Hist. Const.', '5-100': 'Filosofía', '60-250': 'Intro Der.',
    '60-510': 'D. Político', '60-200': 'D. Romano', '60-4300': 'Lógica', '20-100': 'Sociología',
    '60-4320': 'Constit.', '60-410': 'Penal Gral.', '0-10': 'Teología I', '60-4310': 'Obligaciones',
    '60-4340': 'Poder', '60-4330': 'Daños', '45-750': 'Economía', '9-3000': 'Metodología',
    '60-4360': 'Empresarial', '60-420': 'Penal Esp.', '60-811': 'Proc. Civil I', '0-20': 'Teología II',
    '60-4350': 'Contratos', '60-4540': 'Contr. Part.', '60-4380': 'Ambiental', '60-4370': 'Comercial',
    '60-812': 'Proc. Civil II', '60-4960': 'Oratoria', '60-4970': 'Argument.',
    '60-4390': 'Admin.', '60-821': 'Proc. Penal I', '60-4400': 'D. Reales', '60-4410': 'Práctica I',
    '60-4440': 'Trabajo', '60-4450': 'DIP', '60-822': 'Proc. Penal II', '60-4430': 'Societario',
    '0-100': 'Doctr. Social', '60-4530': 'Métodos',
    '60-4420': 'Práctica II', '60-4470': 'Concursal', '60-4460': 'Familia', '60-4490': 'Tributario',
    '60-4480': 'Púb. Prov.', '5-300': 'Fil. Derecho', '60-6130': 'Tecnología', '60-550': 'DI Privado',
    '60-6120': 'Previsional', '60-6140': 'Registral', '60-4500': 'Sucesorio', '5-250': 'Ética',
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nm = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
  const pad = n => String(n).padStart(2, '0');

  // ══════════ Datos estáticos del plan (una vez) ══════════
  let N = null, EDGES = null, FR = null, RK = null, POR_ANIO = null, MAX_ANIO = 0;
  function init() {
    if (N) return true;
    if (typeof CORR_SUBJECTS === 'undefined' || !window.Correlativas) return false;
    const idx = {};
    N = CORR_SUBJECTS.map((s, i) => {
      idx[s.code] = i;
      const t = Correlativas.nombrePorCodigo ? Correlativas.nombrePorCodigo(s.code) : s.nombre;
      return { i, code: s.code, subj: s, anio: s.anio, nombre: t, corto: CORTO[s.code] || (t.length > 12 ? t.slice(0, 11) + '…' : t), padres: [], hijos: [] };
    });
    EDGES = [];
    N.forEach(n => {
      const cods = new Set();
      n.subj.reqCursar.forEach(r => cods.add(r[1]));
      n.subj.reqRendir.forEach(c => cods.add(c));
      cods.forEach(c => {
        if (idx[c] == null || idx[c] === n.i) return;
        n.padres.push(idx[c]); N[idx[c]].hijos.push(n.i); EDGES.push([idx[c], n.i]);
      });
    });
    // Orden dentro de cada año: promedio de la posición de sus correlativas (menos cruces de líneas).
    FR = new Array(N.length).fill(0.5); RK = new Array(N.length).fill(0);
    POR_ANIO = {}; N.forEach(n => { (POR_ANIO[n.anio] = POR_ANIO[n.anio] || []).push(n.i); });
    Object.keys(POR_ANIO).map(Number).sort((a, b) => a - b).forEach(y => {
      const arr = POR_ANIO[y];
      const ord = arr.map((i, k) => ({ i, k: (N[i].padres.length ? N[i].padres.reduce((a, p) => a + FR[p], 0) / N[i].padres.length : (k + 0.5) / arr.length) + k * 1e-4 }))
        .sort((a, b) => a.k - b.k);
      ord.forEach((o, r) => { FR[o.i] = (r + 0.5) / ord.length; RK[o.i] = r; });
      POR_ANIO[y] = ord.map(o => o.i);
      MAX_ANIO = Math.max(MAX_ANIO, arr.length);
    });
    return true;
  }

  // ══════════ Geometría ══════════
  const ANIOS = () => Object.keys(POR_ANIO).map(Number).sort((a, b) => a - b);
  const jit = i => [((i * 37) % 11) / 11 - 0.5, ((i * 53) % 13) / 13 - 0.5];
  function geo(ancho) {
    const P = new Array(N.length), anios = ANIOS();
    if (ancho) {
      const W = 1000, H = 56 + MAX_ANIO * 38, paso = (W - 140) / (anios.length - 1);
      anios.forEach((y, a) => POR_ANIO[y].forEach((i, r, arr) => {
        const j = jit(i);
        P[i] = { x: 70 + a * paso + j[0] * 12, y: 40 + (r + 0.5) * (H - 56) / arr.length, ly: 21 };
      }));
      return { W, H, P, anios, ancho };
    }
    const W = 340, FILA = 78, bandas = [];
    let top = 4;
    anios.forEach(y => {
      const arr = POR_ANIO[y], filas = Math.ceil(arr.length / 4), cols = Math.ceil(arr.length / filas);
      const paso = cols > 1 ? Math.min(66, 240 / (cols - 1)) : 0, x0 = 50 + (240 - paso * (cols - 1)) / 2;
      arr.forEach((i, r) => {
        const f = Math.floor(r / cols), c = r % cols, j = jit(i);
        P[i] = { x: x0 + c * paso + j[0] * 3, y: top + f * FILA + FILA / 2 + j[1] * 5, ly: c % 2 === 0 ? -13 : 22 };
      });
      bandas.push({ y, top, h: filas * FILA });
      top += filas * FILA;
    });
    return { W, H: top + 4, P, anios, bandas, ancho };
  }

  // ══════════ Estado vivo (solo lectura) ══════════
  function fechaTexto(fechaISO, hora) {
    if (fechaISO) return fechaISO.slice(8, 10) + '/' + fechaISO.slice(5, 7) + '/' + fechaISO.slice(0, 4) + (hora ? ' · ' + hora : '');
    return null;
  }
  function calcular() {
    const C = Correlativas;
    const porSid = {}, porNombre = {};
    if (window.Finales && Finales.activos && Finales.subjectIdDe) {
      Finales.activos().forEach(f => { const sid = Finales.subjectIdDe(f); if (sid) (porSid[sid] = porSid[sid] || []).push(f); });
    }
    (Array.isArray(S.lawPlan) ? S.lawPlan : []).forEach(e => { if (e && e.subject) porNombre[nm(e.subject)] = e; });
    const nombres = {};
    (C.materiasDelPlan ? C.materiasDelPlan(false) : []).forEach(m => { nombres[m.id] = m.name; });

    return N.map(n => {
      const sid = C.subIdDe ? C.subIdDe(n.code) : null;
      const compartida = sid && C.opcionesDeFila && C.opcionesDeFila(sid).length > 0;
      let fin = (porSid[sid] || []).filter(f => !compartida || (f.codigo && f.codigo === n.code))[0] || null;
      const row = sid ? porNombre[nm(nombres[sid])] : null;
      const own = C.estado(n.code), cs = C.computeStatus(n.subj);
      let st;
      if (cs === 'aprobada') st = 'ap';
      else if (own === 'ninguna' && compartida && S.carrera && S.carrera.pick && S.carrera.pick[sid] && S.carrera.pick[sid] !== n.code) st = 'ex';
      else if (own === 'regular' || fin) st = 'cu';
      else if (cs === 'bloqueada') st = 'bl';
      else st = 'pe';
      // Fecha del final: el final activo manda; si no, la fila del Plan de materias (fechaTipo/fecha/hora, con target de respaldo).
      let fecha = null;
      if (st !== 'ap' && st !== 'ex') {
        if (fin && fin.fecha) {
          const hr = fin.hora || (row && row.fecha === fin.fecha ? row.hora : '');
          fecha = fechaTexto(fin.fecha, hr);
        } else if (row) {
          const c = typeof _lawFilaCampos === 'function' ? _lawFilaCampos(row) : null;
          if (c && c.fechaTipo === 'exacta' && c.fecha) fecha = fechaTexto(c.fecha, c.hora);
          else if (c && c.fechaTipo && c.fechaTipo !== 'sin' && typeof _lawTargetDeCampos === 'function') fecha = _lawTargetDeCampos(c);
          else if (!c && row.target && !/^sin fecha$/i.test(String(row.target).trim())) fecha = String(row.target);
        }
      }
      return { st, fecha };
    });
  }

  // ══════════ DOM ══════════
  let root = null, svg = null, info = null, bar = null, cnt = null, btnVer = null;
  let nodos = [], aristas = [], datos = null, firma = '', construido = null, sel = -1, sucio = false;

  function esqueleto(wrap) {
    wrap.innerHTML = `<div class="card cmz" id="cmz-card">
      <div class="card-title">🗺 Mapa de la carrera
        <button class="btn btn-ghost btn-sm" type="button" onclick="if(window.Correlativas) Correlativas.open()">Correlatividades →</button>
      </div>
      <div class="cmz-vw"><svg role="group" aria-label="Mapa de las materias de la carrera"></svg></div>
      <div class="cmz-bar" aria-hidden="true"><i class="cmz-b-ap"></i><i class="cmz-b-cu"></i><i class="cmz-b-pe"></i></div>
      <div class="cmz-cnt"></div>
      <div class="cmz-info" aria-live="polite"></div>
      <div class="cmz-leg"><span><i class="l-pe"></i>pendiente</span><span><i class="l-cu"></i>en curso o con final</span><span><i class="l-ap"></i>aprobada</span><span><i class="l-bl"></i>bloqueada</span></div>
    </div>`;
    root = wrap.firstElementChild;
    svg = root.querySelector('svg'); info = root.querySelector('.cmz-info');
    bar = root.querySelector('.cmz-bar'); cnt = root.querySelector('.cmz-cnt');
    root.addEventListener('click', e => {
      const g = e.target.closest('.cmz-nd');
      if (g) return elegir(+g.dataset.i);
      if (sel >= 0 && !e.target.closest('button, .cmz-info')) elegir(sel);   // tocar afuera: limpia la selección
    });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const g = e.target.closest('.cmz-nd'); if (!g) return;
      e.preventDefault(); elegir(+g.dataset.i);
    });
    if ('ResizeObserver' in window) new ResizeObserver(ajustar).observe(root);
    // Animación solo mientras el mapa está a la vista.
    root.classList.add('cmz-vis');
    if ('IntersectionObserver' in window) new IntersectionObserver(es => root.classList.toggle('cmz-vis', es[es.length - 1].isIntersecting)).observe(root);
  }

  function armar(ancho) {
    const G = geo(ancho); construido = ancho;
    const R = ancho ? 8.5 : 7.5;
    let h = '';
    if (ancho) {
      G.anios.forEach((y, a) => { h += `<text class="cmz-yr" x="${(70 + a * (G.W - 140) / (G.anios.length - 1)).toFixed(0)}" y="16">AÑO ${y}</text>`; });
    } else {
      G.bandas.forEach(b => {
        if (b.y % 2) h += `<rect class="cmz-band" x="0" y="${b.top}" width="${G.W}" height="${b.h}"/>`;
        h += `<text class="cmz-yn" x="14" y="${b.top + 4 + b.h / 2}">${b.y}°</text>`;
      });
    }
    h += EDGES.map(e => `<line class="cmz-ed" x1="${G.P[e[0]].x.toFixed(1)}" y1="${G.P[e[0]].y.toFixed(1)}" x2="${G.P[e[1]].x.toFixed(1)}" y2="${G.P[e[1]].y.toFixed(1)}"/>`).join('');
    h += N.map(n => `<g class="cmz-nd" tabindex="0" role="button" data-i="${n.i}" data-code="${esc(n.code)}" transform="translate(${G.P[n.i].x.toFixed(1)} ${G.P[n.i].y.toFixed(1)})"><circle class="cmz-hit" r="15"/><circle class="cmz-rg" r="${R}"/><circle class="cmz-c" r="${R}"/><path class="cmz-tk" d="M-3.4 0l2.6 2.6 4.2-5"/><text y="${G.P[n.i].ly}">${esc(n.corto)}</text></g>`).join('');
    svg.innerHTML = h;
    svg.setAttribute('viewBox', `0 0 ${G.W} ${G.H}`);
    root.classList.toggle('cmz-wd', ancho);
    sucio = false;
    nodos = Array.from(svg.querySelectorAll('.cmz-nd')); aristas = Array.from(svg.querySelectorAll('.cmz-ed'));
    pintar();
  }

  function pintar() {
    if (!datos || !nodos.length) return;
    const rel = new Set();
    if (sel >= 0) { N[sel].padres.forEach(p => rel.add(p)); N[sel].hijos.forEach(c => rel.add(c)); }
    nodos.forEach((g, i) => {
      const st = datos[i].st;
      g.setAttribute('class', 'cmz-nd s-' + st + (i === sel ? ' cmz-sel' : '') + (rel.has(i) ? ' cmz-rel' : ''));
      g.setAttribute('aria-label', N[i].nombre + ': ' + ESTADOS[st]);
    });
    EDGES.forEach((e, k) => {
      const on = datos[e[0]].st === 'ap';
      aristas[k].setAttribute('class', 'cmz-ed' + (on ? ' on' : '') + (on && datos[e[1]].st !== 'ap' ? ' live' : '') + (sel >= 0 && (e[0] === sel || e[1] === sel) ? ' hl' : ''));
    });
    root.classList.toggle('cmz-hs', sel >= 0);
    const c = { ap: 0, cu: 0, pe: 0, bl: 0 };
    datos.forEach(d => { if (d.st !== 'ex') c[d.st]++; });
    const tot = c.ap + c.cu + c.pe + c.bl;
    bar.children[0].style.flexGrow = c.ap; bar.children[1].style.flexGrow = c.cu; bar.children[2].style.flexGrow = tot - c.ap - c.cu;
    cnt.textContent = c.ap + ' aprobadas · ' + c.cu + ' en curso o con final · ' + (c.pe + c.bl) + ' pendientes';
    info.innerHTML = sel >= 0 ? detalle(sel) : 'Tocá una materia para ver sus correlativas y la fecha de su final.';
  }

  function detalle(i) {
    const n = N[i], d = datos[i], C = Correlativas;
    const cumple = (tipo, code) => (tipo === 'Aprobada' || tipo === 'Aprobada-OR') ? C.estado(code) === 'aprobada' : (C.estado(code) === 'regular' || C.estado(code) === 'aprobada');
    const corto = code => { const k = N.find(x => x.code === code); return k ? k.corto : code; };
    const need = n.subj.reqCursar.length
      ? n.subj.reqCursar.map(([t, c]) => `<span class="${cumple(t, c) ? 'ok' : 'no'}">${esc(corto(c))}${t === 'Regularizada' ? ' (regularizada)' : ''} ${cumple(t, c) ? '✓' : '✗'}</span>`).join(', ')
      : 'ninguna';
    const hs = n.hijos.map(h => N[h].corto);
    const habilita = hs.length ? esc(hs.slice(0, 6).join(', ')) + (hs.length > 6 ? ' y ' + (hs.length - 6) + ' más' : '') : 'ninguna';
    const fin = d.st === 'ap' || d.st === 'ex' ? '' : `<br>Final: ${d.fecha ? esc(d.fecha) : 'sin fecha'}`;
    return `<b>${esc(n.nombre)}</b> · ${n.anio}° año · ${ESTADOS[d.st]}${fin}<br>Necesita: ${need}<br>Habilita: ${habilita}`
      + `<br><button class="btn btn-ghost btn-sm cmz-ver" type="button" onclick="if(window.Correlativas) Correlativas.open()">Ver en el plan de carrera</button>`;
  }

  function elegir(i) { sel = sel === i ? -1 : i; pintar(); }

  function ajustar() {
    if (!root) return;
    const w = root.clientWidth; if (!w) return;       // pestaña oculta: se arma cuando se vea
    const ancho = (root.querySelector('.cmz-vw').clientWidth || w) >= ANCHO_MIN;
    if (ancho !== construido) armar(ancho);
    else if (sucio) { sucio = false; pintar(); }
  }

  // Punto de entrada: lo llama renderLawProgress (cada cambio de datos / cambio de pestaña).
  function render() {
    const wrap = document.getElementById('constelacion-wrap');
    if (!wrap || !init() || typeof S === 'undefined' || !S || !S.lawProgress) return;
    const d = calcular();
    const f = d.map(x => x.st + (x.fecha || '')).join('|');
    if (!root || !root.isConnected) { esqueleto(wrap); construido = null; firma = ''; }
    if (f !== firma) { firma = f; datos = d; sucio = true; }
    ajustar();
  }

  return { render };
})();
window.Constelacion = Constelacion;
