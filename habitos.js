// ════════════════════════════════════════════════════════
// HABIT CALENDARS  (Estudio · Entrenamientos · Contable)
// ════════════════════════════════════════════════════════
const CAL_MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const habitCalState = {
  studyCalendar:   { year: new Date().getFullYear(), month: new Date().getMonth() },
  workoutCalendar: { year: new Date().getFullYear(), month: new Date().getMonth() },
  financeCalendar: { year: new Date().getFullYear(), month: new Date().getMonth() },
  vida:            { year: new Date().getFullYear(), month: new Date().getMonth() },
  finanzas:        { year: new Date().getFullYear(), month: new Date().getMonth() },
  salud:           { year: new Date().getFullYear(), month: new Date().getMonth() },
  conocimiento:    { year: new Date().getFullYear(), month: new Date().getMonth() },
  ia:              { year: new Date().getFullYear(), month: new Date().getMonth() },
};

function calDateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function computeCalStreaks(calKey) {
  const days = S[calKey].days;
  const today = getActiveDate();
  const isDone = ds => days[ds] === 'done' || days[ds] === 'studied';

  // Current streak: backwards from today; done=count, rest=neutral, past-empty=stop
  let current = 0;
  for (let i = 0; i < 730; i++) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (isDone(ds))               current++;
    else if (days[ds] === 'rest') { /* neutral */ }
    else if (ds === today)        { /* not logged yet — don't break */ }
    else                          break;
  }

  // Best streak: forward from first done day; rest=neutral, missed=reset
  const allDone = Object.keys(days).filter(isDone).sort();
  if (!allDone.length) return { current, best: current };
  const start = new Date(allDone[0] + 'T00:00:00');
  const end   = new Date(today + 'T00:00:00');
  let best = 0, run = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    if (isDone(ds))               { run++; best = Math.max(best, run); }
    else if (days[ds] === 'rest') { /* neutral */ }
    else if (ds <= today)         run = 0;
  }
  return { current, best: Math.max(best, current) };
}

function renderHabitCalendar(calKey, wrapId, title, labelPlural, labelSingle) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;

  const today = getActiveDate();
  const { year: y, month: m } = habitCalState[calKey];
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let startDow = new Date(y, m, 1).getDay();
  startDow = startDow === 0 ? 6 : startDow - 1; // Mon-based

  const days = S[calKey].days;
  const isDone = ds => days[ds] === 'done' || days[ds] === 'studied';
  let nDone = 0, nPartial = 0, nRest = 0, nMissed = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = calDateStr(y, m, d);
    if (isDone(ds))                nDone++;
    else if (days[ds] === 'partial') nPartial++;
    else if (days[ds] === 'rest')  nRest++;
    else if (ds < today)           nMissed++;
  }
  const nPoints = nDone + nPartial * 0.5;

  // ── Streaks ──
  const streaks = computeCalStreaks(calKey);

  // ── Weekly breakdown (past days of displayed month) ──
  const weeks = [];
  let week = { done: 0, active: 0 };   // active = días no-descanso hasta hoy
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = calDateStr(y, m, d);
    if (ds <= today && days[ds] !== 'rest') {   // los descansos no cuentan
      week.active++;
      if (isDone(ds))                week.done++;
      else if (days[ds]==='partial') week.done += 0.5;
    }
    if ((startDow + d - 1) % 7 === 6 || d === daysInMonth) {
      if (week.active > 0) weeks.push({ ...week });
      week = { done: 0, active: 0 };
    }
  }
  const weekBarsHTML = weeks.map((w, i) => {
    const donePct = Math.round(w.done / w.active * 100);
    return `<div class="cal-week-row">
      <span class="cal-week-lbl">S${i + 1}</span>
      <div class="cal-week-bar-wrap">
        <div class="cal-week-bar-done" style="width:${donePct}%"></div>
      </div>
      <span class="cal-week-num">${w.done}/${w.active}</span>
    </div>`;
  }).join('');

  // ── Monthly comparison (3 months ending at displayed month) ──
  const monthComp = [];
  for (let i = 2; i >= 0; i--) {
    let cy = y, cm = m - i;
    while (cm < 0) { cm += 12; cy--; }
    const dim = new Date(cy, cm + 1, 0).getDate();
    let mdone = 0, mtotal = 0;
    for (let d = 1; d <= dim; d++) {
      const ds = calDateStr(cy, cm, d);
      if (ds > today) continue;
      if (days[ds] === 'rest') continue;   // los descansos no cuentan
      mtotal++;
      if (isDone(ds))                      mdone++;
      else if (days[ds] === 'partial')     mdone += 0.5;
    }
    if (mtotal > 0) monthComp.push({
      label: CAL_MONTHS[cm].slice(0, 3).toUpperCase(),
      pct: Math.round(mdone / mtotal * 100),
      done: mdone, total: mtotal
    });
  }
  const monthBarsHTML = monthComp.length > 1 ? monthComp.map(mc =>
    `<div class="cal-month-row">
      <span class="cal-month-lbl">${mc.label}</span>
      <div class="cal-month-bar-wrap"><div class="cal-month-bar-fill" style="width:${mc.pct}%"></div></div>
      <span class="cal-month-pct">${mc.pct}%</span>
    </div>`).join('') : '';

  // ── Grid cells ──
  let cells = '';
  for (let i = 0; i < startDow; i++) {
    cells += `<div class="study-cal-day empty"><div class="study-cal-num"></div><div class="study-cal-dot"></div></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = calDateStr(y, m, d);
    const st = days[ds];
    const isFuture = ds > today;
    const isToday  = ds === today;
    const colIndex = (startDow + d - 1) % 7;

    let dotCls = '', txt = '';
    if (isDone(ds))            { dotCls = 'studied'; txt = '✓'; }
    else if (st === 'partial') { dotCls = 'partial'; txt = '½'; }
    else if (st === 'rest')    { dotCls = 'rest';    txt = '—'; }
    else if (!isFuture)        { dotCls = 'missed'; }
    else                       { dotCls = 'future'; }

    let dayCls = '';
    if (colIndex >= 5) dayCls += ' weekend';
    if (isToday)       dayCls += ' today-cell';

    cells += `<div class="study-cal-day${dayCls}">
      <div class="study-cal-num">${d}</div>
      <div class="study-cal-dot ${dotCls}" onclick="cycleHabitDay('${calKey}','${ds}')">${txt}</div>
    </div>`;
  }

  const weekdayHdrs = ['L','M','X','J','V','S','D']
    .map((w, i) => `<div class="study-cal-weekday${i>=5?' weekend':''}">${w}</div>`)
    .join('');

  wrap.innerHTML = `<div class="card">
    <div class="card-title">${title}</div>
    <div class="study-cal-header">
      <button class="study-cal-nav" onclick="prevHabitMonth('${calKey}')">◀</button>
      <span class="study-cal-title">${CAL_MONTHS[m]} ${y}</span>
      <button class="study-cal-nav" onclick="nextHabitMonth('${calKey}')">▶</button>
    </div>
    <div class="study-cal-weekdays">${weekdayHdrs}</div>
    <div class="study-cal-grid">${cells}</div>
    <div class="study-cal-stats">
      <div class="study-cal-stat">
        <span class="study-cal-stat-num" style="color:var(--accent)">${nPoints}</span>
        <span class="study-cal-stat-label">${labelPlural}</span>
      </div>
      <div class="study-cal-stat">
        <span class="study-cal-stat-num" style="color:var(--ts)">${nRest}</span>
        <span class="study-cal-stat-label">Descansos</span>
      </div>
      <div class="study-cal-stat">
        <span class="study-cal-stat-num" style="color:var(--danger)">${nMissed}</span>
        <span class="study-cal-stat-label">Incumplidos</span>
      </div>
      <div class="study-cal-stat">
        <span class="study-cal-stat-num" style="color:var(--accent)">${streaks.current}</span>
        <span class="study-cal-stat-label">🔥 Racha</span>
      </div>
    </div>
    ${weekBarsHTML ? `<div class="cal-chart-section">
      <div class="cal-chart-title">Desglose semanal</div>
      ${weekBarsHTML}
    </div>` : ''}
    ${monthBarsHTML ? `<div class="cal-chart-section">
      <div class="cal-chart-title">Comparativa mensual</div>
      <div class="cal-best-streak">Mejor racha histórica: <strong>${streaks.best} días</strong></div>
      ${monthBarsHTML}
    </div>` : ''}
    <div class="study-cal-legend">
      <div class="study-cal-legend-item">
        <div class="study-cal-legend-dot" style="background:var(--accent)"></div>${labelSingle} (1 toque)
      </div>
      <div class="study-cal-legend-item">
        <div class="study-cal-legend-dot" style="background:linear-gradient(to right,var(--ok) 50%,var(--danger) 50%)"></div>Parcial (2 toques)
      </div>
      <div class="study-cal-legend-item">
        <div class="study-cal-legend-dot" style="background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3)"></div>Descanso (3 toques)
      </div>
      <div class="study-cal-legend-item">
        <div class="study-cal-legend-dot" style="background:rgba(244,63,94,.25);border:1px solid rgba(244,63,94,.6)"></div>Incumplido
      </div>
    </div>
  </div>`;
}

function renderStudyCalendar()   { renderHabitCalendar('studyCalendar',   'study-cal-wrap',   '📅 Calendario de Estudio',    'Estudiados',  'Estudiado'); }
function renderWorkoutCalendar() { renderHabitCalendar('workoutCalendar', 'workout-cal-wrap', '🏋️ Entrenamientos',           'Entrenados',  'Entrenado'); }
function renderFinanceCalendar() { renderHabitCalendar('financeCalendar', 'finance-cal-wrap', '📒 Registro Contable',        'Registrados', 'Registrado'); }

// ════════════════════════════════════════════════════════
// HABIT TRACKERS  —  multi-hábito, todas las secciones
// ════════════════════════════════════════════════════════

const HABIT_CFG = {
  vida:         { title:'🌱 Hábitos de Vida',         wrap:'vida-habits-wrap'         },
  finanzas:     { title:'📒 Hábitos Contables',         wrap:'finanzas-habits-wrap'     },
  salud:        { title:'❤️ Hábitos de Salud',         wrap:'salud-habits-wrap'        },
  conocimiento: { title:'📚 Hábitos de Aprendizaje',  wrap:'conocimiento-habits-wrap' },
  ia:           { title:'🤖 Hábitos de IA',            wrap:'ia-habits-wrap'           },
};

const HABIT_CHART_COLOR = {
  vida:         'rgba(0,212,255,.5)',
  finanzas:     'rgba(34,197,94,.5)',
  salud:        'rgba(244,63,94,.5)',
  conocimiento: 'rgba(75,123,236,.5)',
  ia:           'rgba(212,220,232,.45)',
};

let _habitActiveId = { vida:null, finanzas:null, salud:null, conocimiento:null, ia:null };
let _habitView = { vida:'month', finanzas:'month', salud:'month', conocimiento:'month', ia:'month' };
let _habitChartInst = {};

function _getHabits(section) {
  const ht = S.habitTrackers;
  if (!ht) return [];
  if (Array.isArray(ht)) return section === 'vida' ? ht : [];
  return ht[section] || [];
}

function renderHabitsCard(section) {
  const cfg  = HABIT_CFG[section];
  if (!cfg) return;
  const wrap = document.getElementById(cfg.wrap);
  if (!wrap) return;
  const habits = _getHabits(section);

  if (!_habitActiveId[section] || !habits.find(h => h.id === _habitActiveId[section]))
    _habitActiveId[section] = habits[0]?.id || null;

  if (!habits.length) {
    wrap.innerHTML = `<div class="card">
      <div class="card-title">${cfg.title}
        <button class="btn btn-ghost btn-sm" onclick="openAddHabitFor('${section}')">+ Hábito</button>
      </div>
      <div class="empty-state" style="padding:24px 0">Agrega tu primer hábito para comenzar el seguimiento</div>
    </div>`;
    return;
  }

  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

  const tabsHTML = habits.map(h =>
    `<button class="habit-tab-btn${h.id===_habitActiveId[section]?' active':''}"
      onclick="setHabit('${section}','${h.id}')">
      ${h.emoji||'📌'} ${h.name}
    </button>`).join('');

  wrap.innerHTML = `<div class="card">
    <div class="card-title">${cfg.title}
      <div style="display:flex;gap:6px;align-items:center">
        <button class="icon-btn" onclick="openEditHabitFor('${section}','${_habitActiveId[section]}')" title="Editar">${PENCIL}</button>
        <button class="btn btn-ghost btn-sm" onclick="openAddHabitFor('${section}')">+ Hábito</button>
      </div>
    </div>
    <div class="habit-tabs">${tabsHTML}</div>
    <div id="habit-stats-${section}"></div>
    <div id="habit-cal-${section}"></div>
    <div id="habit-chart-wrap-${section}" style="height:120px;margin:12px 0 4px;display:none">
      <canvas id="habit-chart-${section}"></canvas>
    </div>
  </div>`;

  // Permite recorrer los tabs con la rueda del mouse en desktop (sin esto,
  // con muchos hábitos no se llega a los de la derecha porque la rueda
  // solo scrollea vertical).
  const tabsEl = wrap.querySelector('.habit-tabs');
  if (tabsEl) tabsEl.addEventListener('wheel', e => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    tabsEl.scrollLeft += e.deltaY;
  }, { passive: false });

  renderHabitCal(section);
}

// Alias para backward compat

function setHabit(section, id) {
  _habitActiveId[section] = id;
  renderHabitsCard(section);
}

function renderHabitCal(section) {
  const calEl   = document.getElementById(`habit-cal-${section}`);
  const statsEl = document.getElementById(`habit-stats-${section}`);
  if (!calEl) return;

  const activeId = _habitActiveId[section];
  if (!activeId) return;
  const habit = _getHabits(section).find(h => h.id === activeId);
  if (!habit) return;

  const cs    = habitCalState[section];
  const y = cs.year, m = cs.month;
  const days  = habit.days || {};
  const today = getActiveDate();
  const dim   = new Date(y, m+1, 0).getDate();
  let startDow = new Date(y, m, 1).getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  const isDone = ds => days[ds] === 'done' || days[ds] === 'studied';

  // ── Stats (los días de descanso no cuentan en el denominador) ──
  let nDone = 0, nPartial = 0, nMissed = 0, nRest = 0;
  for (let d = 1; d <= dim; d++) {
    const ds = calDateStr(y, m, d);
    if (isDone(ds))                nDone++;
    else if (days[ds]==='partial') nPartial++;
    else if (days[ds]==='rest')    nRest++;
    else if (!days[ds] && ds < today) nMissed++;
  }
  const nPoints = nDone + nPartial * 0.5;
  const denom   = Math.max(0, dim - nRest);   // mes menos descansos
  const monthPct = denom ? Math.round(nPoints / denom * 100) : 0;

  // Current streak
  let curStreak = 0;
  for (let i = 0; i < 730; i++) {
    const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (isDone(ds))            curStreak++;
    else if (days[ds]==='rest') { /* neutral */ }
    else if (ds === today)     { /* not yet logged */ }
    else break;
  }

  // Best streak
  const allDone = Object.keys(days).filter(isDone).sort();
  let bestStreak = curStreak;
  if (allDone.length) {
    const st = new Date(allDone[0] + 'T00:00:00');
    const en = new Date(today + 'T00:00:00');
    let run = 0;
    for (let d = new Date(st); d <= en; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      if (isDone(ds))            { run++; bestStreak = Math.max(bestStreak, run); }
      else if (days[ds]==='rest') { /* neutral */ }
      else if (ds <= today)       run = 0;
    }
  }

  // ── Summary stats (estilos finanzas) ────────────────
  if (statsEl) {
    const R = 28, C = 2 * Math.PI * R;
    const pctClamped = Math.max(0, Math.min(100, monthPct));
    const off = C * (1 - pctClamped / 100);
    statsEl.innerHTML = `
    <div class="habit-ring-row" style="margin:10px 0 6px">
      <svg class="habit-ring" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${monthPct}% del mes">
        <circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
        <circle class="habit-ring-prog" cx="32" cy="32" r="${R}" fill="none" stroke="var(--accent)" stroke-width="6"
          stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 32 32)"/>
        <text x="32" y="32" text-anchor="middle" dominant-baseline="central" class="habit-ring-txt">${monthPct}%</text>
      </svg>
      <div class="fin-summary-row" style="flex:1;margin:0">
        <div class="fin-summary-stat">
          <div class="fin-summary-num" style="color:var(--ok)">${curStreak}</div>
          <div class="fin-summary-lbl">Racha</div>
        </div>
        <div class="fin-summary-stat">
          <div class="fin-summary-num">${nPoints}/${denom}</div>
          <div class="fin-summary-lbl">Completados</div>
        </div>
        <div class="fin-summary-stat">
          <div class="fin-summary-num" style="color:var(--warn)">${bestStreak}</div>
          <div class="fin-summary-lbl">Mejor racha</div>
        </div>
      </div>
    </div>`;
  }

  // ── Calendar grid ────────────────────────────────────
  let cells = '';
  for (let i = 0; i < startDow; i++)
    cells += `<div class="study-cal-day empty"><div class="study-cal-num"></div><div class="study-cal-dot"></div></div>`;

  for (let d = 1; d <= dim; d++) {
    const ds = calDateStr(y, m, d);
    const isFuture = ds > today, isToday = ds === today;
    const colIndex = (startDow + d - 1) % 7;
    const st = days[ds];
    let dotCls = '', txt = '';
    if (isDone(ds))           { dotCls='studied'; txt='✓'; }
    else if (st==='partial')  { dotCls='partial'; txt='½'; }
    else if (st==='rest')     { dotCls='rest';    txt='—'; }
    else if (!isFuture)       { dotCls='missed'; }
    else                      { dotCls='future'; }
    let dayCls = '';
    if (colIndex >= 5) dayCls += ' weekend';
    if (isToday)       dayCls += ' today-cell';
    cells += `<div class="study-cal-day${dayCls}">
      <div class="study-cal-num">${d}</div>
      <div class="study-cal-dot ${dotCls}"
        ${!isFuture?`onclick="toggleHabitDay('${section}','${habit.id}','${ds}')"`:''}>${txt}</div>
    </div>`;
  }

  const view = _habitView[section] || 'month';
  const toggle = `<div class="habit-view-toggle">
    <button class="${view==='month'?'active':''}" onclick="_setHabitView('${section}','month')">Mes</button>
    <button class="${view==='year'?'active':''}" onclick="_setHabitView('${section}','year')">Año</button>
  </div>`;

  if (view === 'year') {
    calEl.innerHTML = toggle + _renderHabitHeatmap(section, habit, today);
    const cw = document.getElementById(`habit-chart-wrap-${section}`);
    if (cw) cw.style.display = 'none';
    const sc = calEl.querySelector('.hm-scroll');
    if (sc) sc.scrollLeft = sc.scrollWidth;   // arrancar mostrando lo más reciente
    return;
  }

  const WD = ['L','M','X','J','V','S','D'];
  calEl.innerHTML = toggle + `
    <div class="study-cal-header" style="margin-top:8px">
      <button class="study-cal-nav" onclick="_habitMonthNav('${section}',-1)">‹</button>
      <div class="study-cal-title">${CAL_MONTHS[m].toUpperCase()} ${y}</div>
      <button class="study-cal-nav" onclick="_habitMonthNav('${section}',1)">›</button>
    </div>
    <div class="study-cal-weekdays">
      ${WD.map(w=>`<div class="study-cal-weekday${w==='S'||w==='D'?' weekend':''}">${w}</div>`).join('')}
    </div>
    <div class="study-cal-grid">${cells}</div>
    <div class="study-cal-legend" style="margin-top:10px">
      <div class="study-cal-legend-item"><div class="study-cal-legend-dot" style="background:var(--accent)"></div>Hecho</div>
      <div class="study-cal-legend-item"><div class="study-cal-legend-dot" style="background:linear-gradient(to right,var(--ok) 50%,var(--danger) 50%)"></div>Parcial</div>
      <div class="study-cal-legend-item"><div class="study-cal-legend-dot" style="background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.22)"></div>Descanso</div>
      <div class="study-cal-legend-item"><div class="study-cal-legend-dot" style="border:1.5px solid rgba(244,63,94,.55);background:rgba(244,63,94,.1)"></div>Sin marcar</div>
    </div>`;

  // ── Monthly chart (últimos 6 meses) ─────────────────
  _renderHabitChart(section, habit);
}

function _setHabitView(section, view) {
  _habitView[section] = view;
  renderHabitCal(section);
}

function _renderHabitHeatmap(section, habit, today) {
  const days = habit.days || {};
  const isDone = ds => days[ds] === 'done' || days[ds] === 'studied';
  const end = new Date(today + 'T00:00:00');
  const WEEKS = 53;
  const start = new Date(end);
  start.setDate(start.getDate() - (WEEKS * 7 - 1));
  let dow = start.getDay(); dow = dow === 0 ? 6 : dow - 1;   // alinear a lunes
  start.setDate(start.getDate() - dow);

  const MON = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  let cells = '', months = '', col = 0, dayOfCol = 0, lastMonth = -1;
  const d = new Date(start);
  while (d <= end || dayOfCol !== 0) {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let cls = 'hm-cell';
    if (ds > today)                cls += ' future';
    else if (isDone(ds))           cls += ' done';
    else if (days[ds] === 'partial') cls += ' partial';
    else if (days[ds] === 'rest')    cls += ' rest';
    cells += `<div class="${cls}" title="${ds}"></div>`;
    if (dayOfCol === 0) {
      const mo = d.getMonth();
      if (mo !== lastMonth) { months += `<span style="grid-column:${col+1}">${MON[mo]}</span>`; lastMonth = mo; }
    }
    d.setDate(d.getDate() + 1);
    if (++dayOfCol === 7) { dayOfCol = 0; col++; }
  }

  const WD = ['L','','X','','V','',''];
  return `<div class="hm-scroll"><div class="hm">
    <div class="hm-months">${months}</div>
    <div class="hm-wds">${WD.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="hm-grid">${cells}</div>
  </div></div>
  <div class="hm-legend">
    <span><i class="dot" style="background:var(--accent)"></i>Hecho</span>
    <span><i class="dot" style="background:color-mix(in srgb,var(--accent) 45%,transparent)"></i>Parcial</span>
    <span><i class="dot" style="background:rgba(255,255,255,.14)"></i>Descanso</span>
    <span><i class="dot" style="background:rgba(255,255,255,.05)"></i>Sin marcar</span>
  </div>`;
}

function _renderHabitChart(section, habit) {
  const wrapEl = document.getElementById(`habit-chart-wrap-${section}`);
  const canvas = document.getElementById(`habit-chart-${section}`);
  if (!wrapEl || !canvas) return;

  const now = new Date();
  const labels = [], data = [];
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y2  = d.getFullYear(), m2 = d.getMonth();
    const dim = new Date(y2, m2+1, 0).getDate();
    let done = 0, denom = 0;
    for (let dd = 1; dd <= dim; dd++) {
      const ds = _dStr(y2, m2, dd);
      const st = habit.days?.[ds];
      if (st==='rest') continue;            // los descansos no cuentan
      denom++;
      if (st==='done'||st==='studied') done++;
      else if (st==='partial')         done += 0.5;
    }
    labels.push(CAL_MONTHS[m2].slice(0,3));
    data.push(denom ? Math.round(done / denom * 100) : 0);
  }

  if (!data.some(v => v > 0)) { wrapEl.style.display='none'; return; }
  wrapEl.style.display = '';

  if (_habitChartInst[section]) { _habitChartInst[section].destroy(); _habitChartInst[section]=null; }
  _habitChartInst[section] = new Chart(canvas.getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[{ data, backgroundColor: HABIT_CHART_COLOR[section]||'rgba(255,255,255,.3)', borderRadius:2, barThickness:2 }] },
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ min:0, max:100, ticks:{ font:{size:9}, callback:v=>v+'%' } },
        y:{ ticks:{ font:{size:9} } }
      }
    }
  });
}

function toggleHabitDay(section, habitId, ds) {
  const habit = _getHabits(section).find(h => h.id === habitId);
  if (!habit) return;
  const cur = habit.days[ds];
  if (cur==='done')         habit.days[ds]='partial';
  else if (cur==='partial') habit.days[ds]='rest';
  else if (cur==='rest')    delete habit.days[ds];
  else                      habit.days[ds]='done';
  saveState(); renderHabitCal(section); checkAchievements();
}

function _habitMonthNav(section, dir) {
  const s = habitCalState[section];
  if (!s) return;
  s.month += dir;
  if (s.month < 0)  { s.month=11; s.year--; }
  if (s.month > 11) { s.month=0;  s.year++; }
  renderHabitCal(section);
}

function openAddHabitFor(section) {
  document.getElementById('habitModalTitle').textContent = 'Nuevo hábito';
  document.getElementById('habitSection').value = section;
  document.getElementById('habitId').value      = '';
  document.getElementById('habitName').value    = '';
  document.getElementById('habitEmoji').value   = '';
  document.getElementById('habitDeleteBtn').style.display = 'none';
  openModal('modal-habit');
}

function openEditHabitFor(section, id) {
  if (!id) return;
  const habit = _getHabits(section).find(h => h.id === id);
  if (!habit) return;
  document.getElementById('habitModalTitle').textContent = 'Editar hábito';
  document.getElementById('habitSection').value = section;
  document.getElementById('habitId').value      = id;
  document.getElementById('habitName').value    = habit.name;
  document.getElementById('habitEmoji').value   = habit.emoji||'';
  document.getElementById('habitDeleteBtn').style.display = '';
  openModal('modal-habit');
}

function saveHabit() {
  const section = document.getElementById('habitSection').value;
  const id      = document.getElementById('habitId').value;
  const name    = document.getElementById('habitName').value.trim();
  const emoji   = document.getElementById('habitEmoji').value.trim()||'📌';
  if (!name) { showToast('Escribe el nombre del hábito'); return; }
  const arr = S.habitTrackers[section];
  if (!arr) return;
  if (id) {
    const h = arr.find(h => h.id===id);
    if (h) { h.name=name; h.emoji=emoji; }
  } else {
    const newH = { id:uid(), name, emoji, days:{} };
    arr.push(newH);
    _habitActiveId[section] = newH.id;
  }
  saveState(); closeModal('modal-habit'); renderHabitsCard(section);
}

function deleteHabit(id) {
  const section = document.getElementById('habitSection').value;
  if (!id || !confirm('¿Eliminar este hábito y todos sus registros?')) return;
  const arr = S.habitTrackers[section];
  if (!arr) return;
  S.habitTrackers[section] = arr.filter(h => h.id!==id);
  if (_habitActiveId[section]===id)
    _habitActiveId[section] = S.habitTrackers[section][0]?.id||null;
  saveState(); closeModal('modal-habit'); renderHabitsCard(section);
}

function cycleHabitDay(calKey, ds) {
  if (ds > getActiveDate() || !S[calKey]?.days) return;
  const st = S[calKey].days[ds];
  if (!st)                              S[calKey].days[ds] = 'done';
  else if (st==='done'||st==='studied') S[calKey].days[ds] = 'partial';
  else if (st==='partial')              S[calKey].days[ds] = 'rest';
  else                                  delete S[calKey].days[ds];
  saveState();
  const renderFns = { studyCalendar: renderStudyCalendar, workoutCalendar: renderWorkoutCalendar, financeCalendar: renderFinanceCalendar };
  if (renderFns[calKey]) renderFns[calKey]();
}
