'use strict';
// ════════════════════════════════════════════════════════════════════════
// ENTRENO-PROGRESO — pestañas "Progreso" y "Ejercicios" del overlay de Entrenamiento (etapa 4 del rediseño).
// Los NÚMEROS salen de la misma lógica de siempre: entStatsCalc() (rutinas.js) → sesiones, volumen, series, tiempo, músculos, récords.
// Acá solo se arma el HTML (tarjetas HUD, barras LED, gráfico SVG con crosshair) y se conectan los botones.
// Datos que lee (sin escribir nada): S.routineLog, S.exerciseHistory, S.exerciseLibrary, S.actividadesHechas.
// Scripts clásicos: se carga después de plan-entreno-ui.js. Prefijo CSS .prg- (bloque en styles.css).
// ════════════════════════════════════════════════════════════════════════
const EntrenoProg = (() => {
  const P = () => window.PlanEntreno;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const coma = n => String(n).replace('.', ',');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const PERIODOS = [['mes', '1M', '1 mes'], ['trimestre', '3M', '3 meses'], ['semestre', '6M', '6 meses'], ['año', '1A', '1 año']];
  const GRUPOS = [['cardio', 'Cardio'], ['combate', 'Combate'], ['fuerza', 'Fuerza']];
  const MUS_VISIBLES = 6, REC_VISIBLES = 4, CHIPS_VISIBLES = 8, PTS = 12, SEM = 12;

  // Estado de la vista (no se guarda en S)
  let animar = true;       // la próxima pintura descifra los números (al entrar a la pestaña o cambiar de período)
  let mapaAbierto = false; // sección plegable "Mapa muscular"
  let exSel = null;        // libId elegido en "Evolución por ejercicio"
  let consulta = '';       // buscador de Ejercicios
  let chartPts = [];       // puntos del gráfico actual (para el crosshair)

  // ── Datos ──
  const hoy = () => getActiveDate();
  function sesionesDe(libId) {   // sesiones con series de un ejercicio, cronológicas (misma fuente que el historial del ejercicio)
    return ((S.exerciseHistory && S.exerciseHistory[libId]) || []).filter(e => e.sets && e.sets.length)
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  const mejorPeso = e => Math.max(0, ...e.sets.map(s => s.weight || 0));
  function ejerciciosConHistorial() {   // [{ id, name, n }] por cantidad de sesiones (desc)
    return (S.exerciseLibrary || []).map(l => ({ id: l.id, name: l.name, n: sesionesDe(l.id).length })).filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }
  function entrenosPorSemana() {   // últimas SEM semanas ISO (lunes a domingo), sesiones de rutina por semana, la más vieja primero
    const p = P(), lunes0 = p.lunesDeSemana(p.semanaISO(hoy()));
    const fechas = [];
    Object.values(S.routineLog || {}).forEach(h => (h || []).forEach(e => { if (e && e.date) fechas.push(e.date); }));
    const out = [];
    for (let k = SEM - 1; k >= 0; k--) {
      const ini = p.sumarDias(lunes0, -7 * k), fin = p.sumarDias(ini, 6);
      out.push(fechas.filter(f => f >= ini && f <= fin).length);
    }
    return out;
  }
  // Actividades del plan hechas en el período + detalle (intensidad / concentración) de actividades y de sesiones de gimnasio.
  function actividades(cutoffStr) {
    const p = P(), cuenta = {}, det = { int: [], con: [] }, porClave = {};
    Object.values(S.actividadesHechas || {}).forEach(e => {
      if (!e || typeof e !== 'object' || !e.fecha || e.fecha < cutoffStr) return;
      const a = p.ACTIVIDADES.find(x => x.clave === e.clave); if (!a) return;
      cuenta[a.grupo] = (cuenta[a.grupo] || 0) + 1;
      const c = porClave[a.clave] || (porClave[a.clave] = { n: 0, int: [], con: [] });
      c.n++; if (e.intensidad) { c.int.push(e.intensidad); det.int.push(e.intensidad); } if (e.concentracion) { c.con.push(e.concentracion); det.con.push(e.concentracion); }
    });
    const gim = { n: 0, int: [], con: [] };
    Object.values(S.routineLog || {}).forEach(h => (h || []).forEach(e => {
      if (!e || !e.date || e.date < cutoffStr) return;
      gim.n++; if (e.intensidad) { gim.int.push(e.intensidad); det.int.push(e.intensidad); } if (e.concentracion) { gim.con.push(e.concentracion); det.con.push(e.concentracion); }
    }));
    return { cuenta, porClave, gim, det };
  }
  const prom = a => a.length ? coma((a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)) : null;
  const detTxt = c => [prom(c.int) ? 'int ' + prom(c.int) : '', prom(c.con) ? 'conc ' + prom(c.con) : ''].filter(Boolean).join(' · ');

  // ── Progreso ──
  function resumenHtml(c) {
    const stat = (v, l, i) => `<div class="prg-st"><span class="prg-lbl">${l}</span><b class="prg-num" data-i="${i}">${esc(v)}</b></div>`;
    return `<section class="prg-card" id="prg-resumen"><div class="prg-hd"><span class="prg-h">Resumen</span><div class="prg-per" role="group" aria-label="Período">${PERIODOS.map(([k, t, n]) =>
      `<button type="button" class="prg-chip${c.period === k ? ' on' : ''}" aria-pressed="${c.period === k}" aria-label="${n}" data-p="${k}" onclick="EntrenoProg.periodo('${k}')">${t}</button>`).join('')}</div></div>
      <div class="prg-stats">${stat(String(c.sess), 'Entrenos', 0)}${stat(c.volStr, 'Volumen kg', 1)}${stat(String(c.sets), 'Series', 2)}${stat(c.timeStr, 'Tiempo', 3)}</div></section>`;
  }

  function evoChartHtml() {
    const ses = exSel ? sesionesDe(exSel).slice(-PTS) : [];
    chartPts = ses.map(e => ({ v: mejorPeso(e), d: e.date }));
    if (chartPts.length < 2) return `<p class="prg-vacio">${chartPts.length ? 'Falta una sesión más para dibujar la evolución.' : 'Todavía no hay sesiones con series de este ejercicio.'}</p>`;
    const W = 320, H = 150, p = 22, vs = chartPts.map(q => q.v), mn = Math.min(...vs) - 2.5, mx = Math.max(...vs) + 2.5;
    const X = i => p + i * (W - 2 * p) / (chartPts.length - 1), Y = v => H - p - (v - mn) / (mx - mn) * (H - 2 * p);
    const line = chartPts.map((q, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(q.v).toFixed(1)).join(' ');
    return `<div class="prg-ch" id="prg-ch"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mejor peso por sesión, últimas ${chartPts.length} sesiones">
      <defs><linearGradient id="prg-ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F43F5E" stop-opacity=".35"/><stop offset="1" stop-color="#F43F5E" stop-opacity="0"/></linearGradient></defs>
      ${[0, 1, 2, 3].map(k => `<line x1="${p}" x2="${W - p}" y1="${p + k * (H - 2 * p) / 3}" y2="${p + k * (H - 2 * p) / 3}" class="prg-grid-l"/>`).join('')}
      <path d="${line} L${X(chartPts.length - 1).toFixed(1)} ${H - p} L${X(0).toFixed(1)} ${H - p}Z" fill="url(#prg-ga)"/>
      <path d="${line}" class="prg-line"/>
      <line id="prg-cxl" y1="${p - 6}" y2="${H - p}" class="prg-cxl"/>
      <circle id="prg-cxd" r="9" class="prg-cxd"/><circle id="prg-cxc" r="4" class="prg-cxc"/></svg><div class="prg-clab" id="prg-clab"></div></div>`;
  }
  function cruce(i) {   // mueve el crosshair al punto i (línea punteada, punto con brillo, etiqueta "62,5 kg · hace 2 ses.")
    const ch = document.getElementById('prg-ch'); if (!ch || chartPts.length < 2) return;
    const W = 320, H = 150, p = 22, vs = chartPts.map(q => q.v), mn = Math.min(...vs) - 2.5, mx = Math.max(...vs) + 2.5;
    i = Math.max(0, Math.min(chartPts.length - 1, i));
    const x = p + i * (W - 2 * p) / (chartPts.length - 1), y = H - p - (chartPts[i].v - mn) / (mx - mn) * (H - 2 * p);
    const set = (id, a) => { const el = document.getElementById(id); if (el) Object.entries(a).forEach(([k, v]) => el.setAttribute(k, v)); };
    set('prg-cxl', { x1: x, x2: x }); set('prg-cxd', { cx: x, cy: y }); set('prg-cxc', { cx: x, cy: y });
    const l = document.getElementById('prg-clab');
    l.style.left = Math.max(14, Math.min(86, x / W * 100)) + '%';
    const atras = chartPts.length - 1 - i;
    l.textContent = `${coma(chartPts[i].v)} kg · ${atras === 0 ? 'última' : 'hace ' + atras + ' ses.'}`;
    ch.dataset.i = i;
  }
  function evoHtml() {
    const lista = ejerciciosConHistorial();
    if (!lista.length) return `<section class="prg-card" id="prg-evo"><span class="prg-h">Evolución por ejercicio</span><p class="prg-vacio">Todavía no hay ejercicios con historial.</p></section>`;
    if (!exSel || !lista.some(x => x.id === exSel)) exSel = lista[0].id;
    const chip = (x, i) => `<button type="button" class="prg-chip${x.id === exSel ? ' on' : ''}"${i >= CHIPS_VISIBLES && x.id !== exSel ? ' data-more="ex" hidden' : ''} data-ex="${esc(x.id)}" onclick="EntrenoProg.elegir('${esc(x.id)}')">${esc(x.name)}</button>`;
    return `<section class="prg-card" id="prg-evo"><span class="prg-h">Evolución por ejercicio</span>
      <div class="prg-chips">${lista.map(chip).join('')}</div>${lista.length > CHIPS_VISIBLES ? `<button type="button" class="prg-lnk" onclick="EntrenoProg.mas('ex',this)" data-t="Ver los ${lista.length} ejercicios">Ver los ${lista.length} ejercicios</button>` : ''}
      <div id="prg-evo-ch">${evoChartHtml()}</div></section>`;
  }

  function semanasHtml() {
    const wk = entrenosPorSemana(), alto = Math.max(4, Math.min(7, Math.max(...wk)));
    return `<section class="prg-card" id="prg-semanas"><span class="prg-h">Entrenos por semana</span>
      <div class="prg-wcol" style="--alto:${alto}">${wk.map((n, i) => `<div title="${n}" data-n="${n}">${Array.from({ length: alto }, (_, k) => `<i${k < n ? ' class="on"' : ''}></i>`).join('')}</div>`).join('')}</div>
      <div class="prg-eje"><span>HACE ${SEM} SEM</span><span>ESTA</span></div></section>`;
  }

  function musculosHtml(c) {
    if (!c.muscleArr.length) return `<section class="prg-card" id="prg-musculos"><span class="prg-h">Músculos trabajados</span><p class="prg-vacio">Sin datos en este período.</p></section>`;
    const max = Math.max(...Object.values(c.muscleCounts), 1), N = 14;
    const fila = ([m, n], i) => `<div class="prg-mus"${i >= MUS_VISIBLES ? ' data-more="mus" hidden' : ''}><span>${esc(m)}</span><span class="prg-led" aria-hidden="true">${Array.from({ length: N }, (_, k) => `<i${k < Math.round(n / max * N) ? ' class="on"' : ''}></i>`).join('')}</span><span class="prg-pct">${Math.round(n / c.muscleTotal * 100)}%</span></div>`;
    const t = `Ver los ${c.muscleArr.length} músculos`;
    return `<section class="prg-card" id="prg-musculos"><span class="prg-h">Músculos trabajados</span>${c.muscleArr.map(fila).join('')}${c.muscleArr.length > MUS_VISIBLES ? `<button type="button" class="prg-lnk" data-t="${t}" onclick="EntrenoProg.mas('mus',this)">${t}</button>` : ''}</section>`;
  }

  function actividadesHtml(c) {
    const a = actividades(c.cutoffStr), p = P();
    const grupos = GRUPOS.map(([k, n]) => `<div class="prg-st"><span class="prg-lbl">${n}</span><b class="prg-num">${a.cuenta[k] || 0}</b></div>`).join('');
    const filas = p.ACTIVIDADES.filter(x => a.porClave[x.clave]).map(x => { const d = a.porClave[x.clave]; return `<div class="prg-rec"><span class="prg-rn">${esc(x.nombre)}</span><span class="prg-rv">${d.n} ${d.n === 1 ? 'vez' : 'veces'}${detTxt(d) ? ' · ' + detTxt(d) : ''}</span></div>`; }).join('');
    const gim = a.gim.n ? `<div class="prg-rec"><span class="prg-rn">Rutinas de gimnasio</span><span class="prg-rv">${a.gim.n} ${a.gim.n === 1 ? 'vez' : 'veces'}${detTxt(a.gim) ? ' · ' + detTxt(a.gim) : ''}</span></div>` : '';
    const tot = prom(a.det.int) || prom(a.det.con) ? `<p class="prg-note">Promedio del período: ${detTxt({ int: a.det.int, con: a.det.con })}</p>` : '';
    const hay = filas || gim;
    return `<section class="prg-card" id="prg-actividades"><span class="prg-h">Actividades del plan</span>
      <div class="prg-stats prg-st3">${grupos}</div>${hay ? filas + gim + tot : '<p class="prg-vacio">Sin actividades hechas en este período.</p>'}</section>`;
  }

  function mapaHtml(c) {
    const cuerpo = !mapaAbierto ? '' : (c.muscleArr.length
      ? `<div class="scan-duo">${buildSpinViewer()}${buildMuscleHeatmap(c.muscleCounts)}</div>`
      : '<p class="prg-vacio">Sin datos en este período.</p>');
    return `<section class="prg-card" id="prg-mapa"><button type="button" class="prg-fold" aria-expanded="${mapaAbierto}" onclick="EntrenoProg.mapa()"><span class="prg-chev${mapaAbierto ? ' open' : ''}">▾</span><span class="prg-h">Mapa muscular</span></button>${cuerpo}</section>`;
  }

  function recordsHtml(c) {
    if (!c.recArr.length) return `<section class="prg-card" id="prg-records"><span class="prg-h">Récords</span><p class="prg-vacio">Sin datos en este período.</p></section>`;
    const lim = new Date(); lim.setDate(lim.getDate() - 7);
    const desde = localStr(lim);   // NUEVO = alguna de sus 3 marcas se logró en los últimos 7 días
    const lista = c.recArr.map(r => ({ r, nuevo: [r.maxWeightDate, r.maxRepsDate, r.maxVolDate].some(d => d && d >= desde) }))
      .map((x, i) => ({ ...x, i })).sort((a, b) => (b.nuevo - a.nuevo) || (a.i - b.i));
    const vol = v => v >= 1000 ? (v / 1000).toFixed(1) + 't' : v + ' kg';
    const fila = ({ r, nuevo }, i) => `<div class="prg-rec2"${i >= REC_VISIBLES ? ' data-more="rec" hidden' : ''}>
      <div class="prg-rec"><span class="prg-rn">${esc(r.name)}${nuevo ? '<em class="prg-new">NUEVO</em>' : ''}</span></div>
      <div class="prg-marks"><span><b>${coma(r.maxWeight)}</b> kg<small>${r.maxWeightDate ? r.maxWeightDate.slice(5) : '—'} · peso</small></span>
        <span><b>${r.maxReps}</b> reps<small>${r.maxRepsDate ? r.maxRepsDate.slice(5) : '—'} · reps</small></span>
        <span><b>${vol(r.maxVol)}</b><small>${r.maxVolDate ? r.maxVolDate.slice(5) : '—'} · kg×reps</small></span></div></div>`;
    const t = `Ver todos (${lista.length})`;
    return `<section class="prg-card" id="prg-records"><span class="prg-h">Récords</span>${lista.map(fila).join('')}${lista.length > REC_VISIBLES ? `<button type="button" class="prg-lnk" data-t="${t}" onclick="EntrenoProg.mas('rec',this)">${t}</button>` : ''}</section>`;
  }

  function progresoHtml(c) {
    return `<div class="pe-h2">Progreso</div><div class="prg-grid${animar ? ' prg-anim' : ''}">
      <div class="prg-col">${resumenHtml(c)}${evoHtml()}${semanasHtml()}</div>
      <div class="prg-col">${musculosHtml(c)}${actividadesHtml(c)}${recordsHtml(c)}${mapaHtml(c)}</div></div>`;
  }

  // ── Ejercicios ──
  function filasEjercicios() {
    const all = (S.exerciseLibrary || []).filter(l => !l.archived), q = norm(consulta.trim());
    const lista = all.filter(l => (_libFilterEquip === 'all' || l.equipment === _libFilterEquip) && (_libFilterMuscle === 'all' || l.muscle === _libFilterMuscle) && (!q || norm(l.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!all.length) return '<p class="prg-vacio">Biblioteca vacía. Agregá el primer ejercicio.</p>';
    if (!lista.length) return '<p class="prg-vacio">No hay ejercicios con ese filtro.</p>';
    return lista.map(l => {
      const ses = sesionesDe(l.id), ult = ses[ses.length - 1], usos = libUsageCount(l.id);
      let marca = '—';
      if (ult) { const w = mejorPeso(ult); marca = w > 0 ? coma(w) + ' kg' : Math.max(0, ...ult.sets.map(s => s.reps || 0)) + ' reps'; }
      return `<div class="prg-ex" data-id="${esc(l.id)}">
        <button type="button" class="prg-ex-t" onclick="openExHistByLib('${esc(l.id)}')"><b>${esc(l.name)}</b><small>${esc(l.equipment)} · ${esc(l.muscle)} · ⏱ ${fmtRestTime(l.defaultRestSecs)} · ${l.defaultSets} series${usos ? ` · <i>en ${usos} rutina${usos > 1 ? 's' : ''}</i>` : ''}</small></button>
        <span class="prg-ex-w" title="Último peso">${marca}</span>
        <button type="button" class="prg-ico" onclick="openLibEx('${esc(l.id)}')" aria-label="Editar ${esc(l.name)}" title="Editar"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button type="button" class="prg-ico" onclick="deleteLibEx('${esc(l.id)}')" aria-label="Borrar ${esc(l.name)}" title="Borrar"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button></div>`;
    }).join('');
  }
  function ejerciciosHtml() {
    const all = (S.exerciseLibrary || []).filter(l => !l.archived);
    const presentes = LIB_MUSCLES.filter(m => all.some(l => l.muscle === m));
    const chipM = (v, t) => `<button type="button" class="prg-chip${_libFilterMuscle === v ? ' on' : ''}" aria-pressed="${_libFilterMuscle === v}" onclick="setLibFilter('muscle','${v}')">${t}</button>`;
    const chipE = (v, t) => `<button type="button" class="prg-chip${_libFilterEquip === v ? ' on' : ''}" aria-pressed="${_libFilterEquip === v}" onclick="setLibFilter('equip','${v}')">${t}</button>`;
    return `<div class="pe-h2">Ejercicios <button type="button" class="pe-btn" onclick="openLibEx()">+ Nuevo</button></div>
      <input class="prg-srch" id="prg-q" type="search" placeholder="Buscar ejercicio" value="${esc(consulta)}" aria-label="Buscar ejercicio" autocomplete="off" oninput="EntrenoProg.buscar(this.value)">
      <div class="prg-flbl">Grupo muscular</div><div class="prg-chips">${chipM('all', 'Todos')}${presentes.map(m => chipM(m, m)).join('')}</div>
      <div class="prg-flbl">Equipamiento</div><div class="prg-chips">${chipE('all', 'Todos')}${LIB_EQUIPMENT.map(e => chipE(e, e)).join('')}</div>
      <section class="prg-card" id="prg-liblist">${filasEjercicios()}</section>`;
  }

  // ── Después de pintar ──
  function post(tab) {
    if (tab === 'progreso') {
      if (chartPts.length >= 2) {
        const ch = document.getElementById('prg-ch');
        if (ch) engancharCrosshair(ch);
      }
      if (animar && window.cmDescifrar) {
        document.querySelectorAll('#rutinas-wrap .prg-num').forEach(el => { if (el.getClientRects().length) window.cmDescifrar(el, el.textContent, { full: true }); });
      }
      animar = false;
    }
  }
  function engancharCrosshair(ch) {
    cruce(chartPts.length - 1);
    const mover = e => {
      const r = ch.querySelector('svg').getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 320;
      cruce(Math.round((x - 22) / (276 / (chartPts.length - 1))));
    };
    ch.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons > 0 || ch._tap) mover(e); });
    ch.addEventListener('pointerdown', e => { ch._tap = true; mover(e); });
    ['pointerup', 'pointercancel'].forEach(n => ch.addEventListener(n, () => { ch._tap = false; }));
  }

  const api = {
    progresoHtml, ejerciciosHtml, post,
    entrar() { animar = true; },
    periodo(k) { animar = true; setStatsPeriod(k); },
    elegir(id) {
      exSel = id;
      const card = document.getElementById('prg-evo'); if (!card) return;
      card.querySelectorAll('[data-ex]').forEach(b => { b.classList.toggle('on', b.dataset.ex === id); });
      document.getElementById('prg-evo-ch').innerHTML = evoChartHtml();
      const ch = document.getElementById('prg-ch'); if (ch) engancharCrosshair(ch);
    },
    mas(t, btn) {   // "Ver los N / Ver todos / Ver menos" sin re-render
      const els = document.querySelectorAll(`[data-more="${t}"]`); if (!els.length) return;
      const ocultos = els[0].hidden;
      els.forEach(x => { x.hidden = !ocultos; });
      btn.textContent = ocultos ? 'Ver menos' : btn.dataset.t;
    },
    mapa() { mapaAbierto = !mapaAbierto; renderRutinas(); const m = document.getElementById('prg-mapa'); if (m && mapaAbierto) m.scrollIntoView({ block: 'nearest' }); },
    buscar(v) { consulta = v; const l = document.getElementById('prg-liblist'); if (l) l.innerHTML = filasEjercicios(); },
  };
  return api;
})();
window.EntrenoProg = EntrenoProg;
