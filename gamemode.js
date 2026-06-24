'use strict';
// ════════════════════════════════════════════════════════════════════════
// GAME MODE — motor de cálculo (read-only sobre S) + estado aislado.
// Capa de lectura: NUNCA escribe en colecciones existentes del Centro de Mando.
// Estado propio en Firestore: appdata/playerstate (doc aislado).
// El XP se recalcula de forma determinista desde las fuentes en cada run
// (idempotente: correr dos veces el mismo día nunca duplica XP).
// ════════════════════════════════════════════════════════════════════════

const GM_STATS = ['cuerpo', 'mente', 'espiritu', 'riqueza', 'creacion', 'vinculos'];

const GM_STAT_META = {
  cuerpo:   { icon: '💪', short: 'Cuerpo',   color: '--c-salud',        titulo: 'El Forjado' },
  mente:    { icon: '🧠', short: 'Mente',    color: '--c-conocimiento', titulo: 'El Erudito' },
  espiritu: { icon: '🙏', short: 'Espíritu', color: '--c-jarvis',       titulo: 'El Custodio' },
  riqueza:  { icon: '💰', short: 'Riqueza',  color: '--c-finanzas',     titulo: 'El Estratega' },
  creacion: { icon: '⚙️', short: 'Creación', color: '--c-ia',           titulo: 'El Constructor' },
  vinculos: { icon: '❤️', short: 'Vínculos', color: '--c-vida',         titulo: 'El Pilar' },
};

// Colores de rareza fijos, independientes del tema (spec 2.2)
const GM_RARITY = {
  comun:      { label: 'Común',      color: '#8B97A8' },
  raro:       { label: 'Raro',       color: '#3B82F6' },
  epico:      { label: 'Épico',      color: '#A855F7' },
  legendario: { label: 'Legendario', color: '#F5A623' },
};

const GM_PLAYER_NAME = 'Tobías';

let GM = null;                 // estado de juego (playerstate)
let _gmLevelUps = [];          // subidas de nivel del último run (vs run anterior)
let _gmNewLogros = [];         // logros recién desbloqueados
const _GM_KEY = 'gamemode_v1';

// ── Curva de niveles: costo para subir de nivel n = 100 * n^1.5 ──────────
function gmXpCost(n) { return Math.round(100 * Math.pow(n, 1.5)); }
function gmLevelInfo(xp) {
  let lvl = 1, acc = 0;
  while (lvl < 999) {
    const c = gmXpCost(lvl);
    if (acc + c <= xp) { acc += c; lvl++; } else break;
  }
  const cost = gmXpCost(lvl);
  return { nivel: lvl, xpEnNivel: xp - acc, xpParaSiguiente: cost, pct: cost ? (xp - acc) / cost : 0 };
}
function gmAddXp(stat, amount) {
  if (!amount || !GM.stats[stat]) return;
  const st = GM.stats[stat];
  st.xp += amount;
  st.nivel = gmLevelInfo(st.xp).nivel;
}
function gmAddXpAll(total) { const each = Math.round(total / 6); GM_STATS.forEach(s => gmAddXp(s, each)); }

// ── Estado por defecto ───────────────────────────────────────────────────
function gmDefault() {
  const stats = {}; GM_STATS.forEach(s => stats[s] = { xp: 0, nivel: 1 });
  return {
    nivel_general: 1, titulo_actual: 'El Equilibrado', ultima_actualizacion: null,
    stats,
    dia_perfecto_count: 0,
    buffs_activos: [], misiones_diarias: [], misiones_semanales: [], misiones_epicas: [],
    logros: {}, snapshots: [], espiritu_vinculos_log: {},
    config: {
      animaciones: true, voz_jarvis_levelup: false,
      ponderacion_stats: { cuerpo: 1, mente: 1, espiritu: 1, riqueza: 1, creacion: 1, vinculos: 1 },
    },
  };
}
function gmMergeDefault(g) {
  const d = gmDefault();
  const out = Object.assign({}, d, g);
  out.stats = Object.assign({}, d.stats, g.stats || {});
  GM_STATS.forEach(s => { if (!out.stats[s]) out.stats[s] = { xp: 0, nivel: 1 }; });
  out.config = Object.assign({}, d.config, g.config || {});
  out.config.ponderacion_stats = Object.assign({}, d.config.ponderacion_stats, (g.config && g.config.ponderacion_stats) || {});
  ['buffs_activos', 'misiones_diarias', 'misiones_semanales', 'misiones_epicas', 'snapshots'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  if (!out.logros) out.logros = {};
  if (!out.espiritu_vinculos_log) out.espiritu_vinculos_log = {};
  return out;
}

// ── Persistencia (doc aislado appdata/playerstate) ───────────────────────
function _GM_DOC() { return _db.collection('appdata').doc('playerstate'); }
let _gmSaveTid = null;
function gmSave() {
  try { localStorage.setItem(_GM_KEY, JSON.stringify(GM)); } catch (e) {}
  clearTimeout(_gmSaveTid);
  _gmSaveTid = setTimeout(() => {
    try {
      if (typeof _db !== 'undefined' && _db) {
        _GM_DOC().set({ state: JSON.stringify(GM), _savedAt: Date.now() }, { merge: true }).catch(() => {});
      }
    } catch (e) {}
  }, 1500);
}
async function gmLoad() {
  try { const r = localStorage.getItem(_GM_KEY); if (r) GM = JSON.parse(r); } catch (e) {}
  try {
    if (typeof _db !== 'undefined' && _db) {
      const snap = await _GM_DOC().get();
      if (snap.exists && snap.data() && snap.data().state) GM = JSON.parse(snap.data().state);
    }
  } catch (e) {}
  if (!GM) GM = gmDefault();
  GM = gmMergeDefault(GM);
}

// ── Helpers de lectura sobre S (read-only) ───────────────────────────────
function gmHabitDone(h, d) { const v = h && h.days && h.days[d]; return v === 'done' || v === 'studied'; }
function gmFindHabit(section, id) { return (S.habitTrackers && S.habitTrackers[section] || []).find(h => h.id === id); }
function _gmMin(t) { if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function gmSleepInRange(d) {
  const s = S.sleepLog && S.sleepLog[d]; if (!s) return false;
  const b = _gmMin(s.bedtime), w = _gmMin(s.waketime); if (b == null || w == null) return false;
  const bedOk = b >= 23 * 60 + 30 || b <= 30;          // ~00:00 ±30 min
  const wakeOk = w >= 6 * 60 + 30 && w <= 7 * 60 + 30;  // ~07:00 ±30 min
  return bedOk && wakeOk;
}
function gmWaterGoalMet(d) {
  const ml = S.waterLog && S.waterLog[d]; if (!ml) return false;
  const goal = (typeof calcWaterGoal === 'function') ? calcWaterGoal() : 2000;
  return ml >= goal;
}
function gmDoneMaterias() {
  const out = [];
  ((S.lawProgress && S.lawProgress.years) || []).forEach(y => (y.subjects || []).forEach(s => { if (s.done) out.push(s.id); }));
  return out;
}
function gmDoneProyectos() {
  const ids = [];
  const walk = n => { if (!n) return; if (n.done) ids.push(n.id); (n.children || []).forEach(walk); };
  Object.values(S.proyectos || {}).forEach(tree => (tree || []).forEach(walk));
  return ids;
}

// ── Fechas ───────────────────────────────────────────────────────────────
function gmCollectAllDates() {
  const set = new Set();
  const add = obj => { if (obj) Object.keys(obj).forEach(k => set.add(k)); };
  Object.values((S.habitTrackers) || {}).forEach(arr => (arr || []).forEach(h => add(h.days)));
  add(S.sleepLog); add(S.waterLog); add(S.goals); add(GM.espiritu_vinculos_log);
  return set;
}
function gmWeekDays(today) {
  const d = new Date(today + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7;  // 0 = lunes
  const mon = new Date(d); mon.setDate(d.getDate() - dow);
  const out = [];
  for (let i = 0; i <= dow; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); out.push(localStr(x)); }
  return out;
}
function gmWeekKey(today) { return gmWeekDays(today)[0]; }
function gmWeekDaysFrom(monStr, today) {
  const out = []; const mon = new Date(monStr + 'T12:00:00');
  for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); const ds = localStr(x); if (ds <= today) out.push(ds); }
  return out;
}
function gmQuarterElapsed(today) {
  const d = new Date(today + 'T12:00:00');
  const qStart = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  const qEnd = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0);
  const tot = qEnd - qStart;
  return Math.min(1, Math.max(0, (d - qStart) / tot));
}
function gmConsec(pred) {
  let n = 0, started = false;
  const d = new Date(getActiveDate() + 'T12:00:00');
  for (let i = 0; i < 400; i++) {
    const ds = localStr(d);
    if (pred(ds)) { n++; started = true; }
    else if (started || i > 0) break;   // hoy sin marcar es neutral; un día pasado sin marcar corta
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ── XP por fecha (fuentes con timestamp) ─────────────────────────────────
function gmProcessDate(d) {
  (S.habitTrackers && S.habitTrackers.salud || []).forEach(h => { if (gmHabitDone(h, d)) gmAddXp('cuerpo', h.id === 'habit-entrenamientos' ? 15 : 5); });
  if (gmSleepInRange(d)) gmAddXp('cuerpo', 10);
  if (gmWaterGoalMet(d)) gmAddXp('cuerpo', 5);
  (S.habitTrackers && S.habitTrackers.conocimiento || []).forEach(h => { if (gmHabitDone(h, d)) gmAddXp('mente', h.id === 'habit-estudio' ? 10 : 5); });
  (S.habitTrackers && S.habitTrackers.finanzas || []).forEach(h => { if (gmHabitDone(h, d)) gmAddXp('riqueza', 5); });
  (S.habitTrackers && S.habitTrackers.ia || []).forEach(h => { if (gmHabitDone(h, d)) gmAddXp('creacion', 5); });
  const ev = GM.espiritu_vinculos_log[d];
  if (ev) {
    if (ev.mision) gmAddXp('espiritu', 10);
    if (ev.lectura) gmAddXp('espiritu', 10);
    if (ev.reflexion) gmAddXp('espiritu', 20);
    if (ev.novia) gmAddXp('vinculos', 10);
    if (ev.padres) gmAddXp('vinculos', 10);
    if (ev.gatitas) gmAddXp('vinculos', 5);
  }
}

// ── XP de fuentes booleanas (deterministas) ──────────────────────────────
function gmProcessBooleanSources() {
  gmAddXp('mente', gmDoneMaterias().length * 100);
  gmAddXp('creacion', gmDoneProyectos().length * 100);
  (S.lawMilestones || []).forEach(m => { if (m.real != null && m.expected != null && m.real >= m.expected) gmAddXp('mente', 25); });
  const log = S.fixedExpenseLog || {};
  Object.keys(log).forEach(mk => { const m = log[mk] || {}; Object.keys(m).forEach(expId => { if (m[expId]) gmAddXp('riqueza', 10); }); });
  const byMonth = {};
  (S.nwHistory || []).slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(r => { byMonth[r.date.slice(0, 7)] = r.value; });
  const months = Object.keys(byMonth).sort();
  for (let i = 1; i < months.length; i++) { if (byMonth[months[i]] > byMonth[months[i - 1]]) gmAddXp('riqueza', 30); }
}

// ── Misiones (vista del día/semana/trimestre actual) ─────────────────────
function gmBuildDailyMissions(today) {
  const m = [];
  const tEnt = gmFindHabit('salud', 'habit-entrenamientos');
  m.push({ texto: 'Entrenar hoy', xp: 15, completada: tEnt ? gmHabitDone(tEnt, today) : false });
  m.push({ texto: 'Dormir 00:00–07:00', xp: 10, completada: gmSleepInRange(today) });
  m.push({ texto: 'Hidratación', xp: 5, completada: gmWaterGoalMet(today) });
  const tEst = gmFindHabit('conocimiento', 'habit-estudio');
  m.push({ texto: 'Estudiar', xp: 10, completada: tEst ? gmHabitDone(tEst, today) : false });
  const tFin = gmFindHabit('finanzas', 'habit-registro-financiero');
  m.push({ texto: 'Registro financiero', xp: 5, completada: tFin ? gmHabitDone(tFin, today) : false });
  ((S.goals && S.goals[today]) || []).forEach(g => m.push({ texto: g.text, xp: 0, completada: !!g.done, esGoal: true }));
  GM.misiones_diarias = m;
}
function gmBuildWeeklyMissions(today) {
  const days = gmWeekDays(today);
  const countHabit = (section, id) => { const h = gmFindHabit(section, id); return h ? days.filter(d => gmHabitDone(h, d)).length : 0; };
  GM.misiones_semanales = [
    { texto: '6 días de registro financiero', completada: countHabit('finanzas', 'habit-registro-financiero') >= 6 },
    { texto: '5 días de estudio', completada: countHabit('conocimiento', 'habit-estudio') >= 5 },
    { texto: '4 entrenamientos', completada: countHabit('salud', 'habit-entrenamientos') >= 4 },
    { texto: '5 días de hidratación', completada: days.filter(d => gmWaterGoalMet(d)).length >= 5 },
  ];
}
function gmBuildEpicMissions(today) {
  const qo = S.quarterlyObjectives; const out = [];
  if (qo && qo.periods) {
    const period = qo.periods.find(p => p.id === qo.activePeriod) || qo.periods[0];
    if (period) {
      const cats = {};
      (period.objectives || []).forEach(o => { const c = o.category || 'General'; (cats[c] = cats[c] || []).push(o); });
      const esperado = gmQuarterElapsed(today);
      Object.keys(cats).forEach(c => {
        const list = cats[c]; const done = list.filter(o => o.done).length;
        out.push({ id: period.id + ':' + c, nombre: c, progreso: list.length ? done / list.length : 0, esperado, total: list.length, done });
      });
    }
  }
  GM.misiones_epicas = out;
}

// ── Bonos de misión (históricos, deterministas) ──────────────────────────
function gmDayPerfect(d) {
  const tEnt = gmFindHabit('salud', 'habit-entrenamientos');
  const tEst = gmFindHabit('conocimiento', 'habit-estudio');
  const tFin = gmFindHabit('finanzas', 'habit-registro-financiero');
  const checks = [tEnt && gmHabitDone(tEnt, d), gmSleepInRange(d), gmWaterGoalMet(d), tEst && gmHabitDone(tEst, d), tFin && gmHabitDone(tFin, d)];
  if (!checks.every(Boolean)) return false;
  const goals = (S.goals && S.goals[d]) || [];
  if (goals.length && !goals.every(g => g.done)) return false;
  return true;
}
function gmComputePerfectDays(allDates) {
  let count = 0;
  allDates.forEach(d => { if (gmDayPerfect(d)) { count++; gmAddXpAll(25); } });
  GM.dia_perfecto_count = count;
}
function gmComputeWeeklyBonuses(allDates, today) {
  const weeks = new Set(); allDates.forEach(d => weeks.add(gmWeekKey(d)));
  weeks.forEach(wkStart => {
    const days = gmWeekDaysFrom(wkStart, today);
    const c = (sec, id, n) => { const h = gmFindHabit(sec, id); return h && days.filter(d => gmHabitDone(h, d)).length >= n; };
    const ok = c('finanzas', 'habit-registro-financiero', 6) && c('conocimiento', 'habit-estudio', 5) && c('salud', 'habit-entrenamientos', 4) && days.filter(d => gmWaterGoalMet(d)).length >= 5;
    if (ok) gmAddXpAll(100);
  });
}
function gmComputeEpicBonuses() {
  GM.misiones_epicas.forEach(e => {
    if (e.progreso >= 1) {
      gmAddXpAll(500);
      gmUnlockLogro('epica_' + e.id, { rareza: 'legendario', fuente: 'vida', name: 'Épica: ' + e.nombre, desc: 'Objetivo trimestral cumplido', today: getActiveDate() });
    }
  });
}

// ── Logros ───────────────────────────────────────────────────────────────
function gmLogro(id, rareza, fuente, name, desc, progreso, meta) {
  const prev = GM.logros[id] || {};
  const desbloqueado = prev.desbloqueado || progreso >= meta;
  const justUnlocked = !prev.desbloqueado && progreso >= meta;
  GM.logros[id] = { rareza, fuente, name, desc, progreso, meta, desbloqueado, fecha: prev.fecha || (justUnlocked ? getActiveDate() : null) };
  if (justUnlocked) _gmNewLogros.push(GM.logros[id]);
}
function gmUnlockLogro(id, opt) {
  const prev = GM.logros[id] || {};
  const just = !prev.desbloqueado;
  GM.logros[id] = { rareza: opt.rareza, fuente: opt.fuente, name: opt.name, desc: opt.desc, progreso: 1, meta: 1, desbloqueado: true, fecha: prev.fecha || opt.today };
  if (just) _gmNewLogros.push(GM.logros[id]);
}
function gmNwDoubled() {
  const nw = (S.nwHistory || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  if (nw.length < 2) return false;
  const latest = nw[nw.length - 1];
  const cutoff = new Date(latest.date + 'T12:00:00'); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cs = localStr(cutoff);
  let base = null; for (const r of nw) { if (r.date <= cs) base = r.value; }
  if (base == null) base = nw[0].value;
  return base > 0 && latest.value >= 2 * base;
}
function gmStatsBalanced() { const lv = GM_STATS.map(s => GM.stats[s].nivel); return Math.max(...lv) - Math.min(...lv) <= 2; }
function gmCheckLogros() {
  const train = gmFindHabit('salud', 'habit-entrenamientos');
  const trainAny = train && Object.values(train.days || {}).some(v => v === 'done');
  gmLogro('primera_sangre', 'comun', 'salud', 'Primera Sangre', 'Primera sesión de entreno logueada', trainAny ? 1 : 0, 1);
  gmLogro('constancia', 'raro', 'vida', 'Constancia', '21 días seguidos de sueño 00:00–07:00', gmConsec(gmSleepInRange), 21);
  gmLogro('hierro_forjado', 'epico', 'salud', 'Hierro Forjado', '100 días seguidos entrenando', gmConsec(d => train && gmHabitDone(train, d)), 100);
  const materias = gmDoneMaterias().length;
  gmLogro('mente_brillante', 'raro', 'conocimiento', 'Mente Brillante', '5 materias aprobadas', Math.min(materias, 5), 5);
  gmLogro('camino_doctorado', 'epico', 'conocimiento', 'Camino al Doctorado', '20 materias aprobadas', Math.min(materias, 20), 20);
  gmLogro('patrimonio_x2', 'legendario', 'finanzas', 'Patrimonio x2', 'Patrimonio neto duplicado en 12 meses', gmNwDoubled() ? 1 : 0, 1);
  gmLogro('constructor_serial', 'epico', 'ia', 'Constructor Serial', '5 proyectos completados', Math.min(gmDoneProyectos().length, 5), 5);
  gmLogro('equilibrio', 'raro', 'vida', 'Equilibrio', 'Las 6 stats con diferencia ≤2 niveles', gmStatsBalanced() ? 1 : 0, 1);
  // Disciplina Total: requiere notas/promedio — ese dato no existe en el sistema; meta visible no calculable.
  gmLogro('disciplina_total', 'legendario', 'conocimiento', 'Disciplina Total', 'Promedio 8.5+ por 3 cuatrimestres (requiere registro de notas)', 0, 3);
}

// ── Buffs (rachas) ───────────────────────────────────────────────────────
function gmCheckBuffs() {
  const buffs = [];
  const add = (tipo, label, dias) => { if (dias >= 3) buffs.push({ tipo, label, dias }); };
  const train = gmFindHabit('salud', 'habit-entrenamientos');
  if (train) add('racha_entreno', 'Entrenamiento', gmConsec(d => gmHabitDone(train, d)));
  const est = gmFindHabit('conocimiento', 'habit-estudio');
  if (est) add('racha_estudio', 'Estudio', gmConsec(d => gmHabitDone(est, d)));
  const finh = gmFindHabit('finanzas', 'habit-registro-financiero');
  if (finh) add('racha_finanzas', 'Finanzas', gmConsec(d => gmHabitDone(finh, d)));
  add('racha_metas', 'Metas diarias', (S.streak && S.streak.count) || 0);
  GM.buffs_activos = buffs;
}

// ── Identidad ────────────────────────────────────────────────────────────
function gmRecalcGeneral() {
  const w = GM.config.ponderacion_stats; let sum = 0, wt = 0;
  GM_STATS.forEach(s => { const ww = w[s] || 1; sum += GM.stats[s].nivel * ww; wt += ww; });
  GM.nivel_general = Math.round(wt ? sum / wt : 1);
}
function gmRecalcTitulo() {
  const xps = GM_STATS.map(s => ({ s, xp: GM.stats[s].xp })).sort((a, b) => b.xp - a.xp);
  const total = xps.reduce((a, b) => a + b.xp, 0);
  GM.titulo_actual = (total <= 0 || xps[0].xp <= xps[1].xp * 1.2) ? 'El Equilibrado' : GM_STAT_META[xps[0].s].titulo;
}

// ── Snapshot mensual ─────────────────────────────────────────────────────
function gmMaybeSnapshot(today) {
  const mk = today.slice(0, 7);
  if (GM.snapshots.some(s => s.fecha.slice(0, 7) === mk)) return;
  const stats = {}; GM_STATS.forEach(s => stats[s] = { xp: GM.stats[s].xp, nivel: GM.stats[s].nivel });
  GM.snapshots.push({ fecha: today, stats });
  if (GM.snapshots.length > 36) GM.snapshots = GM.snapshots.slice(-36);
}

// ── Orquestador (recálculo determinista completo) ────────────────────────
function gmRunEngine() {
  _gmLevelUps = []; _gmNewLogros = [];
  const today = getActiveDate();
  const firstRun = !GM.ultima_actualizacion;
  const oldLevels = {}; GM_STATS.forEach(s => oldLevels[s] = GM.stats[s].nivel);

  GM_STATS.forEach(s => { GM.stats[s].xp = 0; GM.stats[s].nivel = 1; });
  const allDates = [...gmCollectAllDates()].filter(d => d <= today).sort();
  allDates.forEach(gmProcessDate);
  gmProcessBooleanSources();
  gmBuildDailyMissions(today);
  gmBuildWeeklyMissions(today);
  gmBuildEpicMissions(today);
  gmComputePerfectDays(allDates);
  gmComputeWeeklyBonuses(allDates, today);
  gmComputeEpicBonuses();
  gmCheckLogros();
  gmCheckBuffs();
  gmRecalcGeneral();
  gmRecalcTitulo();
  gmMaybeSnapshot(today);

  if (!firstRun) GM_STATS.forEach(s => { if (GM.stats[s].nivel > oldLevels[s]) _gmLevelUps.push({ stat: s, from: oldLevels[s], to: GM.stats[s].nivel }); });
  else _gmNewLogros = [];   // primer run: no spamear toasts por todo el histórico
  GM.ultima_actualizacion = today;
  gmSave();
}
