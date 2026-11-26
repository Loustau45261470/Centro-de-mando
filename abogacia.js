// ════════════════════════════════════════════════════════
// LAW PROGRESS
// ════════════════════════════════════════════════════════
let _lawSlide = 0;

function renderLawProgress() {
  const wrap = document.getElementById('law-progress-wrap');
  if (!wrap) return;
  const years = S.lawProgress.years;
  const totalSubs = years.reduce((s, y) => s + y.subjects.length, 0);
  const totalDone = years.reduce((s, y) => s + y.subjects.filter(sub => sub.done).length, 0);
  const totalPct  = totalSubs ? Math.round(totalDone / totalSubs * 100) : 0;
  const allGrades = years.flatMap(y => y.subjects.map(s => s.grade)).filter(g => g != null && !isNaN(g));
  const careerAvg = allGrades.length ? allGrades.reduce((a, b) => a + (+b), 0) / allGrades.length : null;

  const slideHTML = years.map((y, yi) => {
    const yDone  = y.subjects.filter(s => s.done).length;
    const yTotal = y.subjects.length;
    const yPct   = yTotal ? Math.round(yDone / yTotal * 100) : 0;
    const yGrades = y.subjects.map(s => s.grade).filter(g => g != null && !isNaN(g));
    const yAvg = yGrades.length ? yGrades.reduce((a, b) => a + (+b), 0) / yGrades.length : null;
    // Final activo más cercano de las materias que faltan de este año (Finales); nada si no hay.
    const prox = window.Finales && Finales.proximoDe ? Finales.proximoDe(y.subjects.filter(s => !s.done).map(s => s.id)) : null;
    const proxHtml = prox ? `<div class="law-next-final">Próximo final: <strong>${escHtml(prox.materia)}</strong> · ${prox.fecha.slice(8, 10)}/${prox.fecha.slice(5, 7)} (${prox.dias === 0 ? 'hoy' : prox.dias === 1 ? 'mañana' : prox.dias + ' días'})</div>` : '';
    return `<div class="law-year-slide">
      <div class="law-nav">
        <button class="law-nav-btn" onclick="lawNav(-1)" ${yi === 0 ? 'style="visibility:hidden"' : ''}>‹ Anterior</button>
        <span class="law-nav-label">${yi + 1} / ${years.length}</span>
        <button class="law-nav-btn" onclick="lawNav(1)" ${yi === years.length - 1 ? 'style="visibility:hidden"' : ''}>Siguiente ›</button>
      </div>
      <div class="law-year-top">
        <span class="law-year-name">${y.label}</span>
        <span class="law-year-pct">${yAvg != null ? `<span class="law-year-avg">prom ${yAvg.toFixed(1)}</span>` : ''}${yPct}%</span>
      </div>
      <div class="law-year-bar"><div class="law-year-bar-fill" style="width:${yPct}%"></div></div>
      <div class="law-subjects">
        ${y.subjects.map(sub => `
          <div class="law-subject-row${sub.done ? ' done' : ''}">
            <span class="law-subject-name">${sub.name}</span>
            <input type="number" class="law-grade" min="1" max="10" step="0.1"
              value="${sub.grade != null ? sub.grade : ''}" placeholder="–" title="Nota del final"
              onclick="event.stopPropagation()" onchange="setLawGrade('${y.id}','${sub.id}',this.value)">
            <input type="checkbox" class="law-check" ${sub.done ? 'checked' : ''}
              onchange="toggleLawSubject('${y.id}','${sub.id}')">
          </div>`).join('')}
      </div>
      ${proxHtml}
    </div>`;
  });

  const dots = years.map((_, i) =>
    `<div class="law-dot${i === _lawSlide ? ' active' : ''}" onclick="lawGoTo(${i})"></div>`
  ).join('');

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      ⚖ Abogacía — Progreso
      <button class="btn btn-ghost btn-sm" onclick="if(window.Correlativas) Correlativas.open()">Correlatividades →</button>
    </div>
    <div class="law-total-row">
      <div>
        <div class="law-total-pct">${totalPct}%</div>
        <div class="law-total-sub">progreso total</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:800;letter-spacing:-.04em">${totalDone}<span style="font-size:var(--fs-14);font-weight:500;color:var(--tt);font-family:var(--mono)">/${totalSubs}</span></div>
        <div class="law-total-sub">materias aprobadas</div>
      </div>
    </div>
    <div class="law-total-bar"><div class="law-total-bar-fill" style="width:${totalPct}%"></div></div>
    <div class="law-total-caption">
      <span>${years.filter(y => y.subjects.every(s => s.done)).length} años completos</span>
      ${careerAvg != null ? `<span>Promedio carrera: <strong style="color:var(--c-conocimiento)">${careerAvg.toFixed(2)}</strong></span>` : ''}
      <span>${totalSubs - totalDone} materias restantes</span>
    </div>
    <div class="law-scroller" id="law-scroller">${slideHTML.join('')}</div>
    <div class="law-dots">${dots}</div>
  </div>`;

  // Restore scroll position and add listener
  const sc = document.getElementById('law-scroller');
  if (sc) {
    sc.scrollLeft = _lawSlide * sc.offsetWidth;
    sc.addEventListener('scroll', () => {
      const idx = Math.round(sc.scrollLeft / (sc.offsetWidth || 1));
      if (idx !== _lawSlide) { _lawSlide = idx; _updateLawDots(); }
    }, { passive: true });
  }
}

function _updateLawDots() {
  document.querySelectorAll('.law-dot').forEach((d, i) => d.classList.toggle('active', i === _lawSlide));
  // re-render slides so nav buttons update visibility
  const sc = document.getElementById('law-scroller');
  if (!sc) return;
  sc.querySelectorAll('.law-nav-btn').forEach(btn => {
    const slide = btn.closest('.law-year-slide');
    const idx   = [...sc.children].indexOf(slide);
    if (btn.textContent.includes('Anterior')) btn.style.visibility = idx === 0 ? 'hidden' : '';
    else btn.style.visibility = idx === S.lawProgress.years.length - 1 ? 'hidden' : '';
  });
}

function lawNav(dir) {
  _lawSlide = Math.max(0, Math.min(S.lawProgress.years.length - 1, _lawSlide + dir));
  const sc = document.getElementById('law-scroller');
  if (sc) sc.scrollTo({ left: _lawSlide * sc.offsetWidth, behavior: 'smooth' });
  setTimeout(_updateLawDots, 350);
}

function lawGoTo(idx) {
  _lawSlide = idx;
  const sc = document.getElementById('law-scroller');
  if (sc) sc.scrollTo({ left: idx * sc.offsetWidth, behavior: 'smooth' });
  setTimeout(_updateLawDots, 350);
}

function setLawGrade(yearId, subId, value) {
  const y = S.lawProgress.years.find(y => y.id === yearId);
  if (!y) return;
  const sub = y.subjects.find(s => s.id === subId);
  if (!sub) return;
  const v = parseFloat(String(value).replace(',', '.'));
  sub.grade = (value === '' || isNaN(v)) ? null : Math.max(1, Math.min(10, Math.round(v * 10) / 10));
  saveState();
  // La nota también se ve en el Plan de materias ("Rendida · 8"): se repinta todo lo conectado.
  if (window.Correlativas && Correlativas.repintar) Correlativas.repintar(); else renderLawProgress();
}

function toggleLawSubject(yearId, subId) {
  const y = S.lawProgress.years.find(y => y.id === yearId);
  if (!y) return;
  const sub = y.subjects.find(s => s.id === subId);
  if (!sub) return;
  // Mismo camino que el ✓ del plan y el Plan de carrera (Correlativas): guarda, cierra/reactiva el final y repinta todo.
  // Fila compartida (seminarios) sin opción elegida: no se adivina cuál; se marca la fila y no se toca S.carrera.pick.
  if (sub.done) Correlativas.desaprobarMateria(subId);
  else Correlativas.aprobarMateria(subId, null, null, { sinOpcion: true });
  if (sub.done) {
    const allYearDone = y.subjects.every(s => s.done);
    if (allYearDone) {
      showConfetti(4500);
      const el = document.createElement('div');
      el.style.cssText = `
        position:fixed; top:18%; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,rgba(75,123,236,.2),rgba(124,142,232,.14));
        border:2px solid rgba(75,123,236,.5); border-radius:20px;
        padding:18px 32px; text-align:center; pointer-events:none; z-index:10000;
        backdrop-filter:blur(20px); box-shadow:0 0 60px rgba(75,123,236,.35),0 20px 60px rgba(0,0,0,.4);
        animation:missionBanner 3.8s cubic-bezier(.22,1,.36,1) forwards; white-space:nowrap;
      `;
      el.innerHTML = `
        <div style="font-size:36px;line-height:1;margin-bottom:6px">🎓</div>
        <div style="font-size:20px;font-weight:900;letter-spacing:.06em;color:#4B7BEC;text-shadow:0 0 30px rgba(75,123,236,.9)">¡${y.label.toUpperCase()} COMPLETADO!</div>
        <div style="font-size:var(--fs-13);color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Todas las materias aprobadas</div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
      showToast('🎓 ¡Año completo!', 4000);
    } else {
      const av = Correlativas.avisoDesbloqueo();
      showToast(`✓ ${sub.name}` + (av ? ' · ' + av : ''), av ? 4500 : 3000);
    }
  }
}

// ════════════════════════════════════════════════════════
// LAW TABLES
// ════════════════════════════════════════════════════════
let _lawMilestoneChart = null;

function _parseMilestoneDate(str) {
  const [d, m, y] = str.split('/').map(Number);
  return new Date(2000 + y, m - 1, d);
}

function _lawTargetTag(target) {
  const t = target.toLowerCase();
  if (t === 'sin fecha')       return `<span class="law-tag law-tag-none">${target}</span>`;
  if (t.includes('promoción')) return `<span class="law-tag law-tag-promo">${target}</span>`;
  if (t.includes('online') || t.includes('libre')) return `<span class="law-tag law-tag-online">${target}</span>`;
  return `<span class="law-tag law-tag-date">${target}</span>`;
}

const _LAW_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Descompone el `target` de texto libre: { t (minúsculas), year, mi (índice de mes o -1), day (número o null) }. null = sin año.
function _lawTargetParts(target) {
  const t = (target || '').toLowerCase();
  const y = t.match(/\b(?:19|20)\d{2}\b/);
  if (!y) return null;
  const mi = _LAW_MONTHS.findIndex(m => t.includes(m));
  // Con día ("25 de noviembre 2026") ordena por ese día; solo el mes va al final de ese mes (después de las que tienen día).
  const day = mi >= 0 && t.match(new RegExp('\\b([12]?\\d|3[01])\\s*(?:de\\s+)?' + _LAW_MONTHS[mi]));
  return { t, year: +y[0], mi, day: day ? +day[1] : null };
}

// Convierte el `target` de texto libre a un timestamp comparable. null = sin fecha (va al final).
function _lawTargetDate(target) {
  const p = _lawTargetParts(target);
  if (!p) return null;
  if (p.day) return new Date(p.year, p.mi, p.day).getTime();
  if (p.mi >= 0) return new Date(p.year, p.mi + 1, 1).getTime() - 1;
  const sem = p.t.match(/([12])\s*\S*\s*sem/);
  if (sem) return new Date(p.year, sem[1] === '1' ? 5 : 10, 1).getTime();
  return new Date(p.year, 11, 1).getTime();
}

// 'YYYY-MM-DD' si el `target` trae día, mes y año válidos ("25 de Noviembre 2026"); null si falta alguno.
function _lawTargetISO(target) {
  const p = _lawTargetParts(target);
  if (!p || p.mi < 0 || !p.day) return null;
  if (new Date(p.year, p.mi, p.day).getMonth() !== p.mi) return null;   // 31 de febrero y similares
  return p.year + '-' + String(p.mi + 1).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
}

// Inversa de _lawTargetISO: '2026-11-25' → '25 de Noviembre 2026'.
function _lawTargetDeISO(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const mes = _LAW_MONTHS[+m[2] - 1];
  return +m[3] + ' de ' + mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + m[1];
}

// ── Fecha estructurada de una fila del Plan de materias ──
// Campos ADITIVOS de la fila: fechaTipo ('exacta'|'mes'|'sin'|'promo'|'libre'), fecha 'YYYY-MM-DD', mes 'YYYY-MM',
// hora 'HH:MM', durMin, sem ('1'|'2'), anio 'YYYY'. `target` (texto) sigue siendo lo que leen el resto de las pantallas:
// se DERIVA de los campos al guardar. Filas viejas (solo `target`) se interpretan al leer (_lawFilaCampos) sin escribir nada.
const _LAW_FECHA_TIPOS = [['exacta', 'Fecha exacta'], ['mes', 'Solo mes'], ['sin', 'Sin fecha'], ['promo', 'Promoción'], ['libre', 'Libre / Online']];
const _LAW_DUR_MIN = 120;   // duración por defecto de un final con hora
const _LAW_MES_ABR = { ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5,
  jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8, set: 8, septiembre: 8, setiembre: 8, oct: 9, octubre: 9,
  nov: 10, noviembre: 10, dic: 11, diciembre: 11 };
const _LAW_MES_RE = '(' + Object.keys(_LAW_MES_ABR).sort((a, b) => b.length - a.length).join('|') + ')';
const _lawHoraOk = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h || '');
const _lawIsoOk = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return false; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]; };
const _lawPad2 = n => String(n).padStart(2, '0');

// Texto libre de `target` → campos nuevos, o null si no se puede interpretar. `hoy` ('YYYY-MM-DD') fija el año de "15/12" / "dic".
// Sin año explícito se toma la próxima ocurrencia (hoy o futura).
function _lawTargetParse(texto, hoy) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  hoy = hoy || (typeof getActiveDate === 'function' ? getActiveDate() : new Date().toISOString().slice(0, 10));
  if (!t || /^(sin fecha|a definir|s\/f|sf|-+|\?+)$/.test(t)) return { fechaTipo: 'sin' };
  const anio = (t.match(/\b(20\d{2})\b/) || [])[1] || '';
  const conMes = new RegExp('\\b' + _LAW_MES_RE + '\\b').test(t);
  if (/promo/.test(t)) {
    if (conMes) return null;
    const s = t.match(/\b([12])\s*[°º]?\s*(?:er|ro|do)?\s*(?:sem|cuatri)/);
    return { fechaTipo: 'promo', sem: s ? s[1] : '', anio };
  }
  if (/online|libre/.test(t)) return conMes ? null : { fechaTipo: 'libre', anio };   // "Noviembre u Online 2027" mezcla dos cosas: no se adivina
  const yHoy = +hoy.slice(0, 4), mHoy = +hoy.slice(5, 7);
  const anioDe = (y, m, d) => {   // año explícito (2 o 4 cifras) o próxima ocurrencia
    if (y) return y < 100 ? 2000 + y : y;
    return (m < mHoy || (d != null && m === mHoy && d < +hoy.slice(8, 10))) ? yHoy + 1 : yHoy;
  };
  const exacta = (y, m, d, inferido) => {
    const iso = y + '-' + _lawPad2(m) + '-' + _lawPad2(d);
    return _lawIsoOk(iso) ? { fechaTipo: 'exacta', fecha: iso, ...(inferido ? { inferido: true } : {}) } : null;
  };
  let r;
  if ((r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return exacta(+r[1], +r[2], +r[3]);
  if ((r = t.match(/^(\d{1,2})\s*[\/.-]\s*(20\d{2})$/))) return +r[1] >= 1 && +r[1] <= 12 ? { fechaTipo: 'mes', mes: r[2] + '-' + _lawPad2(+r[1]) } : null;
  if ((r = t.match(/^(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{4}|\d{2}))?$/))) {
    const d = +r[1], m = +r[2];
    return m >= 1 && m <= 12 ? exacta(anioDe(r[3] ? +r[3] : 0, m, d), m, d, !r[3]) : null;
  }
  if ((r = t.match(new RegExp('^(?:(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\\s+)?(\\d{1,2})\\s*(?:de\\s+)?' + _LAW_MES_RE + '\\.?(?:\\s*(?:de\\s+)?(\\d{4}|\\d{2}))?$')))) {
    const d = +r[1], m = _LAW_MES_ABR[r[2]] + 1;
    return exacta(anioDe(r[3] ? +r[3] : 0, m, d), m, d, !r[3]);
  }
  if ((r = t.match(new RegExp('^' + _LAW_MES_RE + '\\.?(?:\\s*(?:de\\s+)?(\\d{4}|\\d{2}))?$')))) {
    const m = _LAW_MES_ABR[r[1]] + 1;
    return { fechaTipo: 'mes', mes: anioDe(r[2] ? +r[2] : 0, m, null) + '-' + _lawPad2(m), ...(r[2] ? {} : { inferido: true }) };
  }
  return null;
}

// Campos → texto de `target` (el que leen tablas, orden por fecha, Correlativas, búsqueda, sync con Finales).
function _lawTargetDeCampos(c) {
  c = c || {};
  if (c.fechaTipo === 'exacta') return _lawIsoOk(c.fecha) ? _lawTargetDeISO(c.fecha) : 'Sin fecha';
  if (c.fechaTipo === 'mes') {
    const m = /^(\d{4})-(\d{2})$/.exec(c.mes || '');
    return m && +m[2] >= 1 && +m[2] <= 12 ? _LAW_MESES_CAP(+m[2] - 1) + ' ' + m[1] : 'Sin fecha';
  }
  if (c.fechaTipo === 'promo') return 'Promoción' + (c.sem === '1' || c.sem === '2' ? ' ' + c.sem + '° sem.' : '') + (/^\d{4}$/.test(c.anio || '') ? ' ' + c.anio : '');
  if (c.fechaTipo === 'libre') return 'Libre / Online' + (/^\d{4}$/.test(c.anio || '') ? ' ' + c.anio : '');
  return 'Sin fecha';
}
const _LAW_MESES_CAP = i => _LAW_MONTHS[i].charAt(0).toUpperCase() + _LAW_MONTHS[i].slice(1);

// Campos efectivos de una fila: los guardados si siguen coincidiendo con `target` (otro lugar —Finales— puede haber
// reescrito solo el texto); si no, se interpreta `target`. { fechaTipo, fecha?, mes?, hora?, durMin?, sem?, anio?, orig? }.
// `orig` = texto que no se pudo interpretar (se muestra para que lo corrijas; guardar sin tocar la fecha lo conserva).
function _lawFilaCampos(e) {
  const tgt = String((e && e.target) || '');
  if (e && e.fechaTipo && _lawTargetDeCampos(e) === tgt) {
    const c = { fechaTipo: e.fechaTipo, fecha: e.fecha, mes: e.mes, sem: e.sem, anio: e.anio };
    if (e.fechaTipo === 'exacta' && _lawHoraOk(e.hora)) { c.hora = e.hora; c.durMin = e.durMin > 0 ? e.durMin : _LAW_DUR_MIN; }
    return c;
  }
  const p = _lawTargetParse(tgt);
  if (!p) return { fechaTipo: 'sin', orig: tgt };
  delete p.inferido;
  if (p.fechaTipo === 'exacta' && e && e.fecha === p.fecha && _lawHoraOk(e.hora)) { p.hora = e.hora; p.durMin = e.durMin > 0 ? e.durMin : _LAW_DUR_MIN; }
  return p;
}

// "Real" de cada punto del Seguimiento de avance sin número cargado a mano → { [id]: { val, kind } }.
//  · punto futuro: sin valor (no figura).
//  · último punto ya vencido (el vigente): la cuenta actual de aprobadas, kind 'actual'.
//  · puntos vencidos anteriores: aprobadas con doneAt <= fecha del punto, kind 'fecha'. Las aprobadas SIN doneAt (datos
//    viejos) cuentan desde el principio: no se puede saber cuándo fue. Si NINGUNA aprobada tiene doneAt, no hay con qué
//    calcular por fecha y queda la cuenta actual (kind 'actual'), como antes.
// Devuelve también `sinFecha` (aprobadas sin doneAt). Una sola función para la tabla, el historial y el gráfico.
function _lawRealPorHito(ms, today) {
  const aprobadas = S.lawProgress.years.flatMap(y => y.subjects).filter(s => s.done);
  const sinFecha = aprobadas.filter(s => !s.doneAt).length;
  const hayFechas = sinFecha < aprobadas.length;
  const pad = n => String(n).padStart(2, '0');
  const pastIdx = ms.reduce((last, m, i) => _parseMilestoneDate(m.date) <= today ? i : last, -1);
  const out = { sinFecha };
  ms.forEach((m, i) => {
    if (m.real !== null || i > pastIdx || _parseMilestoneDate(m.date) > today) return;
    if (i === pastIdx || !hayFechas) { out[m.id] = { val: aprobadas.length, kind: 'actual' }; return; }
    const d = _parseMilestoneDate(m.date), iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    out[m.id] = { val: aprobadas.filter(s => !s.doneAt || s.doneAt <= iso).length, kind: 'fecha' };
  });
  return out;
}

function renderLawMilestones() {
  const wrap = document.getElementById('law-milestones-wrap');
  if (!wrap) return;
  const ms   = S.lawMilestones;
  const today = new Date();
  const currentDone = S.lawProgress.years.reduce((s, y) => s + y.subjects.filter(sub => sub.done).length, 0);

  // Expected at most-recent past milestone
  let expectedToday = 0;
  for (const m of ms) {
    if (_parseMilestoneDate(m.date) <= today) expectedToday = m.expected;
  }
  const lag = currentDone - expectedToday;
  const lagColor = lag >= 0 ? 'var(--ok)' : 'var(--danger)';
  const lagSign  = lag > 0 ? '+' : '';
  const realMap  = _lawRealPorHito(ms, today);
  const hayFecha = ms.some(m => realMap[m.id] && realMap[m.id].kind === 'fecha');
  const notaFecha = hayFecha ? `<div style="font-size:var(--fs-12-5);color:var(--tt);margin-top:4px">† Según la fecha en que se aprobó cada materia${realMap.sinFecha ? `; las ${realMap.sinFecha} sin fecha cargada cuentan desde el principio` : ''}</div>` : '';

  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  // Table rows
  const _msRow = m => {
    const info     = realMap[m.id];
    const realVal  = m.real !== null ? m.real : (info ? info.val : null);
    const realDisp = realVal !== null ? realVal : '—';
    const diff     = realVal !== null ? realVal - m.expected : null;
    let diffClass = 'diff-neu', diffDisp = '—';
    if (diff !== null) {
      diffDisp  = diff > 0 ? `+${diff}` : `${diff}`;
      diffClass = diff >= 0 ? 'diff-ok' : 'diff-bad';
    }
    return `<tr>
      <td style="font-family:var(--mono);font-size:var(--fs-12-5)">${m.date}</td>
      <td class="num">${realDisp}${info ? `<sup style="font-size:var(--fs-12-5);color:var(--tt)">${info.kind === 'fecha' ? '†' : '*'}</sup>` : ''}</td>
      <td class="num" style="color:var(--ok)">${m.expected}</td>
      <td class="diff ${diffClass}">${diffDisp}</td>
      <td style="padding:4px 4px 4px 0;white-space:nowrap">
        <div style="display:flex;gap:2px">
          <button class="icon-btn" onclick="openEditMilestone('${m.id}')">${PENCIL}</button>
          <button class="icon-btn" onclick="deleteMilestone('${m.id}')">${TRASH}</button>
        </div>
      </td>
    </tr>`;
  };

  // La sección muestra solo la ventana relevante (último punto ya vencido y su
  // entorno). El listado completo se acumula en el overlay de historial: así la
  // card no crece indefinidamente con los años.
  const pastIdx  = ms.reduce((last, m, i) => _parseMilestoneDate(m.date) <= today ? i : last, -1);
  const from     = Math.max(0, pastIdx - 1);
  const recent   = ms.slice(from, pastIdx + 3);
  const rowsHTML = recent.map(_msRow).join('');
  const hiddenN  = ms.length - recent.length;

  const histBody = document.getElementById('lawMsHistBody');
  if (histBody) {
    histBody.innerHTML = ms.length ? `
      <table class="law-tbl">
        <thead><tr><th>Fecha</th><th style="text-align:center">Real</th><th style="text-align:center">Esperado</th><th style="text-align:center">Dif.</th><th></th></tr></thead>
        <tbody>${ms.map(_msRow).join('')}</tbody>
      </table>${notaFecha}` : '<p class="empty-state">Sin puntos registrados</p>';
  }

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      📊 Seguimiento de Avance
      <button class="btn btn-ghost btn-sm" onclick="openAddMilestone()">+ Punto</button>
    </div>
    <div class="law-lag-banner">
      <div class="law-lag-stat">
        <div class="law-lag-num" style="color:var(--accent)">${currentDone}</div>
        <div class="law-lag-lbl">materias reales</div>
      </div>
      <div class="law-lag-stat">
        <div class="law-lag-num" style="color:var(--ok)">${expectedToday}</div>
        <div class="law-lag-lbl">esperadas hoy</div>
      </div>
      <div class="law-lag-stat">
        <div class="law-lag-num" style="color:${lagColor}">${lagSign}${lag}</div>
        <div class="law-lag-lbl">rezago</div>
      </div>
    </div>
    <div style="position:relative;height:150px;margin-bottom:14px"><canvas id="law-milestone-chart"></canvas></div>
    <table class="law-tbl">
      <thead><tr><th>Fecha</th><th style="text-align:center">Real</th><th style="text-align:center">Esperado</th><th style="text-align:center">Dif.</th><th></th></tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    <div style="font-size:var(--fs-12-5);color:var(--tt);margin-top:8px">* Valor actual del progreso registrado</div>
    ${notaFecha}
    <button class="bsum-full" onclick="if(window.openLawMsHistorial)openLawMsHistorial()">
      Ver historial completo${hiddenN > 0 ? ` (${hiddenN} punto${hiddenN > 1 ? 's' : ''} más)` : ''} →
    </button>
  </div>`;

  // Chart
  requestAnimationFrame(() => {
    const canvas = document.getElementById('law-milestone-chart');
    if (!canvas) return;
    if (_lawMilestoneChart) { _lawMilestoneChart.destroy(); _lawMilestoneChart = null; }
    const labels  = ms.map(m => m.label);
    const planned = ms.map(m => m.expected);
    const real    = ms.map(m => (m.real !== null ? m.real : (realMap[m.id] ? realMap[m.id].val : null)));
    _lawMilestoneChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Planificado', data:planned,
            borderColor:'rgba(107,227,164,.75)', backgroundColor:'rgba(107,227,164,.07)',
            borderDash:[5,4], tension:.3, pointRadius:4, pointBackgroundColor:'rgba(107,227,164,.8)' },
          { label:'Real', data:real,
            borderColor:'rgba(75,123,236,.9)',  backgroundColor:'rgba(75,123,236,.08)',
            tension:.3, pointRadius:4, pointBackgroundColor:'rgba(75,123,236,.9)',
            spanGaps:false }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:'#B8B6B0', font:{ size:_cfs(13) }, boxWidth:12 } } },
        scales:{
          x:{ ticks:{ color:'#76746E', font:{ size:_cfs(13) } }, grid:{ color:'rgba(255,255,255,.05)' } },
          y:{ ticks:{ color:'#76746E', font:{ size:_cfs(13) }, stepSize:2 }, grid:{ color:'rgba(255,255,255,.05)' }, min:0 }
        }
      }
    });
  });
}

function openAddMilestone() {
  document.getElementById('lmModalTitle').textContent = 'Nuevo Punto';
  document.getElementById('lmId').value       = '';
  document.getElementById('lmDate').value     = '';
  document.getElementById('lmLabel').value    = '';
  document.getElementById('lmReal').value     = '';
  document.getElementById('lmExpected').value = '';
  openModal('modal-law-milestone');
}

function openEditMilestone(id) {
  const m = S.lawMilestones.find(m => m.id === id);
  if (!m) return;
  document.getElementById('lmModalTitle').textContent = 'Editar Punto';
  document.getElementById('lmId').value       = id;
  document.getElementById('lmDate').value     = m.date;
  document.getElementById('lmLabel').value    = m.label;
  document.getElementById('lmReal').value     = m.real !== null ? m.real : '';
  document.getElementById('lmExpected').value = m.expected;
  openModal('modal-law-milestone');
}

function saveMilestone() {
  const id       = document.getElementById('lmId').value;
  const date     = document.getElementById('lmDate').value.trim();
  const label    = document.getElementById('lmLabel').value.trim();
  const realRaw  = document.getElementById('lmReal').value.trim();
  const expRaw   = document.getElementById('lmExpected').value.trim();
  if (!date || !label) { showToast('Completa fecha y etiqueta'); return; }
  const real     = realRaw === '' ? null : parseInt(realRaw) || 0;
  const expected = parseInt(expRaw) || 0;
  if (id) {
    const m = S.lawMilestones.find(m => m.id === id);
    if (m) Object.assign(m, { date, label, real, expected });
  } else {
    S.lawMilestones.push({ id: uid(), date, label, real, expected });
    S.lawMilestones.sort((a, b) => _parseMilestoneDate(a.date) - _parseMilestoneDate(b.date));
  }
  saveState(); renderLawMilestones(); closeModal('modal-law-milestone');
}

function deleteMilestone(id) {
  S.lawMilestones = S.lawMilestones.filter(m => m.id !== id);
  saveState(); renderLawMilestones();
}

// ── Law Plan ──
// 0 = orden del plan, 1 = fecha ascendente (más cercano primero), 2 = descendente. No se persiste.
let _lawPlanSort = 0;

function cycleLawPlanSort() {
  _lawPlanSort = (_lawPlanSort + 1) % 3;
  renderLawPlan(true);
}

function _lawPlanRows(plan) {
  if (!_lawPlanSort) return plan;
  const dir = _lawPlanSort === 1 ? 1 : -1;
  return plan.map((e, i) => ({ e, i, d: _lawTargetDate(e.target) }))
    .sort((a, b) => {
      if (a.d === null || b.d === null) return a.d === b.d ? a.i - b.i : (a.d === null ? 1 : -1);
      return (a.d - b.d) * dir || a.i - b.i;
    })
    .map(x => x.e);
}

const _LAW_COMISIONES = ['A', 'B', 'C', 'Unificada'];

// Celda de fecha de una fila: chip de fecha (o "Rendida" si su final vinculado está aprobado) + chips de comisión y tipo.
function _lawFechaCell(e) {
  const F = window.Finales;
  const est = F && F.estadoFila ? F.estadoFila(e.id) : null;
  const fecha = est ? `<span class="law-tag law-tag-ok">✅ Rendida${est.nota != null ? ' · ' + est.nota : ''}</span>` : _lawTargetTag(e.target);
  const chips = [];
  if (_LAW_COMISIONES.includes(e.comision)) chips.push(`<span class="law-tag law-tag-mini">${e.comision === 'Unificada' ? 'Unificada' : 'Com. ' + e.comision}</span>`);
  if (e.tipo && F && F.TIPOS.includes(e.tipo)) chips.push(`<span class="law-tag law-tag-mini">${e.tipo}</span>`);
  const hr = _lawFilaCampos(e).hora;
  if (hr && !est) chips.push(`<span class="law-tag law-tag-mini">🕒 ${hr}</span>`);
  return `<div class="law-tags">${fecha}${chips.join('')}</div>`;
}

// La tabla vive en el overlay "Plan de materias" (finales.js crea #law-plan-wrap al abrirlo); si todavía no existe, solo sincroniza.
function renderLawPlan(keepSort) {
  const wrap = document.getElementById('law-plan-wrap');
  if (!keepSort) _lawPlanSort = 0;
  if (window.Finales && Finales.sincronizarDesdePlan) Finales.sincronizarDesdePlan();   // filas con fecha completa → final propio
  if (!wrap) return;
  const plan = _lawPlanRows(S.lawPlan);
  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;
  const CHECK  = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
  const F = window.Finales;
  // ✓ Marcar como rendida: abre el modal de nota de Finales (el final pasa al Historial).
  const btnRendida = id => `<button class="icon-btn law-rendida" onclick="Finales.done('${id}')" title="Marcar como rendida" aria-label="Marcar como rendida">${CHECK}</button>`;

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      📅 Plan de Materias
      <button class="btn btn-ghost btn-sm" onclick="openAddLawPlan()">+ Materia</button>
    </div>
    <table class="law-tbl">
      <thead><tr><th>Materia</th><th class="law-sort" onclick="cycleLawPlanSort()" title="Ordenar por fecha">Fecha / Modalidad <span class="law-sort-ind${_lawPlanSort ? ' on' : ''}">${_lawPlanSort === 1 ? '▲' : _lawPlanSort === 2 ? '▼' : '↕'}</span></th><th></th></tr></thead>
      <tbody>
        ${plan.map(e => `<tr>
          <td class="law-plan-name">${e.subject}</td>
          <td>${_lawFechaCell(e)}</td>
          <td style="padding:4px 8px;white-space:nowrap">
            <div style="display:flex;gap:2px;justify-content:flex-end">
              ${(() => { const fa = F && F.activoDeFila ? F.activoDeFila(e.id) : null; return fa ? btnRendida(fa.id) : ''; })()}
              <button class="icon-btn" onclick="openEditLawPlan('${e.id}')">${PENCIL}</button>
              <button class="icon-btn" onclick="deleteLawPlan('${e.id}')">${TRASH}</button>
            </div>
          </td>
        </tr>`).join('')}
        ${(F && F.sueltos ? F.sueltos() : []).map(f => `<tr class="law-suelto">
          <td class="law-plan-name">${escHtml(f.materia)}</td>
          <td><div class="law-tags">${_lawTargetTag(_lawTargetDeISO(f.fecha))}<span class="law-tag law-tag-mini">${escHtml(f.tipo)}</span></div></td>
          <td style="padding:4px 8px;white-space:nowrap">
            <div style="display:flex;gap:2px;justify-content:flex-end">
              ${btnRendida(f.id)}
              <button class="icon-btn" onclick="Finales.editarSuelto('${f.id}')">${PENCIL}</button>
              <button class="icon-btn" onclick="Finales.del('${f.id}')">${TRASH}</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// Los tipos de examen salen de Finales (una sola lista); la comisión está fija en el HTML del modal.
function _lawPlanFillExtra(e) {
  const sel = document.getElementById('lawPlanTipo');
  sel.innerHTML = '<option value="">—</option>' + (window.Finales ? Finales.TIPOS : []).map(t => `<option value="${t}">${t}</option>`).join('');
  sel.value = (e && e.tipo) || '';
  document.getElementById('lawPlanComision').value = (e && e.comision) || '';
}

// ── Editor de la fecha (tipo + selectores nativos) ──
const _LAW_DURS = [30, 45, 60, 90, 120, 150, 180, 240];
const _lawDurTxt = m => (m < 60 ? m + ' min' : (m % 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m / 60 + ' h'));
let _lawPlanOrig = '';   // texto viejo no interpretable de la fila abierta ('' si no hay)

// Muestra solo los campos del tipo elegido.
function lawPlanFechaTipoChanged() {
  const t = document.getElementById('lawPlanFechaTipo').value;
  document.getElementById('lawPlanFExacta').hidden = t !== 'exacta';
  document.getElementById('lawPlanFMes').hidden    = t !== 'mes';
  document.getElementById('lawPlanFAnio').hidden   = t !== 'promo' && t !== 'libre';
  document.getElementById('lawPlanSemWrap').hidden = t !== 'promo';
  const o = document.getElementById('lawPlanFOrig');
  o.hidden = !(_lawPlanOrig && t === 'sin');
  o.textContent = _lawPlanOrig ? 'Sin fecha (texto original: «' + _lawPlanOrig + '»). Elegí un tipo de fecha para corregirlo; si lo dejás así se conserva.' : '';
}
function lawPlanHoraClear() { document.getElementById('lawPlanHora').value = ''; }

function _lawPlanFillFecha(e) {
  const c = e ? _lawFilaCampos(e) : { fechaTipo: 'exacta' };
  _lawPlanOrig = c.orig || '';
  const $ = i => document.getElementById(i);
  $('lawPlanFechaTipo').innerHTML = _LAW_FECHA_TIPOS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  $('lawPlanFechaTipo').value = c.fechaTipo;
  $('lawPlanFecha').value = c.fecha || '';
  $('lawPlanHora').value  = c.hora || '';
  const dur = c.durMin || _LAW_DUR_MIN, durs = _LAW_DURS.includes(dur) ? _LAW_DURS : _LAW_DURS.concat(dur).sort((a, b) => a - b);
  $('lawPlanDur').innerHTML = durs.map(m => `<option value="${m}">${_lawDurTxt(m)}</option>`).join('');
  $('lawPlanDur').value = String(dur);
  $('lawPlanMes').value  = c.mes || '';
  $('lawPlanSem').value  = c.sem || '';
  $('lawPlanAnio').value = c.anio || '';
  lawPlanFechaTipoChanged();
}

function openAddLawPlan() {
  document.getElementById('lawPlanModalTitle').textContent = 'Nueva Materia';
  document.getElementById('lawPlanId').value      = '';
  document.getElementById('lawPlanSubject').value = '';
  _lawPlanFillFecha(null);
  _lawPlanFillExtra(null);
  openModal('modal-law-plan');
}

function openEditLawPlan(id) {
  const e = S.lawPlan.find(e => e.id === id);
  if (!e) return;
  document.getElementById('lawPlanModalTitle').textContent = 'Editar Materia';
  document.getElementById('lawPlanId').value      = id;
  document.getElementById('lawPlanSubject').value = e.subject;
  _lawPlanFillFecha(e);
  _lawPlanFillExtra(e);
  openModal('modal-law-plan');
}

// Lee el editor → campos de fecha ('sin' con texto viejo intacto → { conservar: true }); null si falta un dato (ya avisó).
function _lawPlanLeerFecha() {
  const v = i => document.getElementById(i).value;
  const fechaTipo = v('lawPlanFechaTipo');
  if (fechaTipo === 'sin' && _lawPlanOrig) return { conservar: true };
  const c = { fechaTipo };
  if (fechaTipo === 'exacta') {
    if (!_lawIsoOk(v('lawPlanFecha'))) { showToast('Elegí la fecha'); return null; }
    c.fecha = v('lawPlanFecha');
    if (_lawHoraOk(v('lawPlanHora'))) { c.hora = v('lawPlanHora'); c.durMin = +v('lawPlanDur') || _LAW_DUR_MIN; }
  } else if (fechaTipo === 'mes') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v('lawPlanMes'))) { showToast('Elegí el mes'); return null; }
    c.mes = v('lawPlanMes');
  } else if (fechaTipo === 'promo' || fechaTipo === 'libre') {
    if (/^\d{4}$/.test(v('lawPlanAnio'))) c.anio = v('lawPlanAnio');
    if (fechaTipo === 'promo' && v('lawPlanSem')) c.sem = v('lawPlanSem');
  }
  return c;
}

function saveLawPlanEntry() {
  const id      = document.getElementById('lawPlanId').value;
  const subject = document.getElementById('lawPlanSubject').value.trim();
  const comision = document.getElementById('lawPlanComision').value;
  const tipo     = document.getElementById('lawPlanTipo').value;
  if (!subject) { showToast('Escribe el nombre'); return; }
  const campos = _lawPlanLeerFecha();
  if (!campos) return;
  const target = campos.conservar ? null : _lawTargetDeCampos(campos);   // null = no tocar la fecha (texto viejo sin interpretar)
  let fila, fechaNueva = true;
  if (id) {
    fila = S.lawPlan.find(e => e.id === id);
    if (fila) {
      fechaNueva = target !== null && fila.target !== target;
      fila.subject = subject;
    }
  } else {
    fila = { id: uid(), subject, target: 'Sin fecha' };
    S.lawPlan.push(fila);
  }
  if (fila && target !== null) {
    ['fechaTipo', 'fecha', 'mes', 'hora', 'durMin', 'sem', 'anio'].forEach(k => delete fila[k]);
    Object.assign(fila, campos, { target });
  }
  if (fila) {
    if (comision) fila.comision = comision; else delete fila.comision;
    if (tipo) fila.tipo = tipo; else delete fila.tipo;
    if (fechaNueva) delete fila.finalOff;   // cambiar la fecha vuelve a habilitar el final automático
    if (window.Finales && Finales.alGuardarFila) Finales.alGuardarFila(fila.id, fechaNueva);
  }
  saveState(); renderLawPlan(true); closeModal('modal-law-plan');
}

function deleteLawPlan(id) {
  S.lawPlan = S.lawPlan.filter(e => e.id !== id);
  saveState(); renderLawPlan(true);
}
