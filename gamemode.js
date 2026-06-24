'use strict';
// ════════════════════════════════════════════════════════════════════════
// GAME MODE — motor (read-only sobre S) + estado aislado (appdata/playerstate).
// Modelo de 2 niveles: 6 CATEGORÍAS, cada una compuesta de SKILLS.
//   - Cada skill acumula XP determinista desde sus hábitos/fuentes reales.
//   - El nivel de la categoría sale del XP total de sus skills.
//   - Skills sin fuente quedan en nivel 1 (existen, sin tracker todavía).
// Recálculo completo en cada run (idempotente).
// ════════════════════════════════════════════════════════════════════════

const GM_CATEGORIES = ['cuerpo', 'mente', 'finanzas', 'espiritu', 'vinculos', 'trabajo'];

const GM_CAT_META = {
  cuerpo:   { icon: '💪', name: 'Cuerpo',   color: '--c-salud',        titulo: 'El Forjado' },
  mente:    { icon: '🧠', name: 'Mente',    color: '--c-conocimiento', titulo: 'El Erudito' },
  finanzas: { icon: '💰', name: 'Finanzas', color: '--c-finanzas',     titulo: 'El Estratega' },
  espiritu: { icon: '🙏', name: 'Espíritu', color: '--c-jarvis',       titulo: 'El Custodio' },
  vinculos: { icon: '❤️', name: 'Vínculos', color: '--c-vida',         titulo: 'El Pilar' },
  trabajo:  { icon: '⚙️', name: 'Trabajo',  color: '--c-ia',           titulo: 'El Constructor' },
};

// Colores de rareza fijos, independientes del tema.
const GM_RARITY = {
  comun:      { label: 'Común',      color: '#8B97A8' },
  raro:       { label: 'Raro',       color: '#3B82F6' },
  epico:      { label: 'Épico',      color: '#A855F7' },
  legendario: { label: 'Legendario', color: '#F5A623' },
};

const GM_PLAYER_NAME = 'Tobías';
// XP por día cumplido, por hábito (para mostrar en las misiones del día)
const GM_HABIT_XP = [
  { kw: ['entrenamiento'], xp: 10 }, { kw: ['boxeo', 'box'], xp: 10 }, { kw: ['jujitsu', 'jiu'], xp: 10 },
  { kw: ['comer sano', 'liviano', 'nutric'], xp: 10 }, { kw: ['estudiar'], xp: 15 }, { kw: ['leer'], xp: 8 },
  { kw: ['enfoque'], xp: 5 }, { kw: ['meditar', 'visualiz'], xp: 8 }, { kw: ['despertar'], xp: 10 }, { kw: ['planificar'], xp: 5 },
  { kw: ['aprendizaje econ', 'económic', 'economic'], xp: 5 }, { kw: ['registro financiero'], xp: 8 }, { kw: ['austeridad'], xp: 10 },
  { kw: ['aplicación de ideas', 'aplicacion de ideas'], xp: 6 }, { kw: ['trabajo en proyecto'], xp: 10 },
];
function gmHabitDisplayXp(name) { const n = (name || '').toLowerCase(); const m = GM_HABIT_XP.find(x => x.kw.some(k => n.includes(k))); return m ? m.xp : 0; }

let GM = null;
let _gmLevelUps = [];   // skills que subieron de nivel vs run anterior
let _gmNewLogros = [];
const _GM_KEY = 'gamemode_v1';

// ── Curva de niveles: costo para subir de nivel n = 100 * n^1.5 ──────────
function gmXpCost(n) { return Math.round(100 * Math.pow(n, 1.5)); }
function gmLevelInfo(xp) {
  let lvl = 1, acc = 0;
  while (lvl < 999) { const c = gmXpCost(lvl); if (acc + c <= xp) { acc += c; lvl++; } else break; }
  const cost = gmXpCost(lvl);
  return { nivel: lvl, xpEnNivel: xp - acc, xpParaSiguiente: cost, pct: cost ? (xp - acc) / cost : 0 };
}
function gmXpThreshold(level) { let acc = 0; for (let n = 1; n < level; n++) acc += gmXpCost(n); return acc; }

// ── Helpers de lectura sobre S (read-only) ───────────────────────────────
function gmHabitDone(h, d) { const v = h && h.days && h.days[d]; return v === 'done' || v === 'studied'; }
function gmHabitTotalDone(h) { return Object.values((h && h.days) || {}).filter(v => v === 'done' || v === 'studied').length; }
function gmKwHabits(kws) {
  const out = [];
  Object.values(S.habitTrackers || {}).forEach(arr => (arr || []).forEach(h => {
    const nm = (h.name || '').toLowerCase();
    if (kws.some(k => nm.includes(k))) out.push(h);
  }));
  return out;
}
function gmKwDays(kws) { return gmKwHabits(kws).reduce((n, h) => n + gmHabitTotalDone(h), 0); }
function gmKwHabit(kws) { return gmKwHabits(kws)[0] || null; }
function gmEvCount(...keys) {
  let n = 0;
  Object.values(GM.espiritu_vinculos_log || {}).forEach(day => { if (keys.some(k => day && day[k])) n++; });
  return n;
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
function gmMilestonesOnTime() { return (S.lawMilestones || []).filter(m => m.real != null && m.expected != null && m.real >= m.expected).length; }
// Estudiar: +15 XP/día hasta que su aporte cruza nivel 5, después +10/día.
function gmEstudiarXp() {
  const h = gmKwHabit(['estudiar']); if (!h) return 0;
  const days = Object.keys(h.days || {}).filter(d => gmHabitDone(h, d)).sort();
  const L5 = gmXpThreshold(5);
  let xp = 0;
  days.forEach(() => { xp += xp < L5 ? 15 : 10; });
  return xp;
}
function gmNwSorted() { return (S.nwHistory || []).slice().sort((a, b) => a.date < b.date ? -1 : 1); }
function gmNwByMonth() { const o = {}; gmNwSorted().forEach(r => { o[r.date.slice(0, 7)] = r.value; }); return o; }
function gmNwGrowthMonths() { const m = gmNwByMonth(), ks = Object.keys(m).sort(); let n = 0; for (let i = 1; i < ks.length; i++) if (m[ks[i]] > m[ks[i - 1]]) n++; return n; }
function gmNwMaxGrowthStreak() { const m = gmNwByMonth(), ks = Object.keys(m).sort(); let max = 0, cur = 0; for (let i = 1; i < ks.length; i++) { if (m[ks[i]] > m[ks[i - 1]]) { cur++; max = Math.max(max, cur); } else cur = 0; } return max; }
function gmNwRatio12() {
  const nw = gmNwSorted(); if (nw.length < 2) return 0;
  const latest = nw[nw.length - 1];
  const cut = new Date(latest.date + 'T12:00:00'); cut.setFullYear(cut.getFullYear() - 1);
  const cs = localStr(cut);
  let base = null; for (const r of nw) if (r.date <= cs) base = r.value;
  if (base == null) base = nw[0].value;
  return base > 0 ? latest.value / base : 0;
}
function gmRiquezaXp() {
  let xp = gmNwGrowthMonths() * 50;
  const st = gmNwMaxGrowthStreak();
  if (st >= 6) xp += 100;
  if (st >= 12) xp += 250;
  const r = gmNwRatio12();
  if (r >= 1.5) xp += 250;
  if (r >= 2) xp += 500;
  return xp;
}
function gmFixedPaidCount() {
  let n = 0;
  const log = S.fixedExpenseLog || {};
  Object.keys(log).forEach(mk => Object.values(log[mk] || {}).forEach(v => { if (v) n++; }));
  return n;
}
// Bonus por hitos de racha (una vez cada hito, según la racha más larga del hábito)
const GM_STREAK_MILESTONES = [{ d: 7, xp: 20 }, { d: 30, xp: 50 }, { d: 90, xp: 150 }, { d: 365, xp: 500 }];
// Corridas de racha: un día (pasado) no cumplido corta la corrida; 'rest' es neutral (puentea, no suma ni corta).
function gmHabitRuns(h) {
  const map = (h && h.days) || {};
  const done = Object.keys(map).filter(d => gmHabitDone(h, d)).sort();
  if (!done.length) return [];
  const runs = []; let len = 0;
  const cur = new Date(done[0] + 'T12:00:00');
  const last = new Date(done[done.length - 1] + 'T12:00:00');
  while (cur <= last) {
    const st = map[localStr(cur)];
    if (st === 'done' || st === 'studied') len++;
    else if (st !== 'rest') { if (len > 0) { runs.push(len); len = 0; } }   // gap/partial corta; rest neutral
    cur.setDate(cur.getDate() + 1);
  }
  if (len > 0) runs.push(len);
  return runs;
}
// Bonus REPETIBLE: cada corrida otorga los hitos que alcanza. Al cortar la racha el contador
// se reinicia y una corrida nueva los vuelve a dar; la XP de corridas previas se conserva.
function gmKwStreakBonus(kws) {
  return gmKwHabits(kws).reduce((tot, h) =>
    tot + gmHabitRuns(h).reduce((a, L) => a + GM_STREAK_MILESTONES.filter(m => L >= m.d).reduce((x, y) => x + y.xp, 0), 0), 0);
}
// Racha actual (buffs): hacia atrás desde hoy; 'rest' neutral, hoy sin marcar neutral, día pasado no cumplido corta.
function gmHabitConsec(h) {
  const map = (h && h.days) || {};
  let n = 0, started = false;
  const dd = new Date(getActiveDate() + 'T12:00:00');
  for (let i = 0; i < 400; i++) {
    const st = map[localStr(dd)];
    if (st === 'done' || st === 'studied') { n++; started = true; }
    else if (st !== 'rest') { if (started || i > 0) break; }
    dd.setDate(dd.getDate() - 1);
  }
  return n;
}

// ── SKILLS — cada una con su función de XP determinista (null = sin tracker) ──
const GM_SKILLS = [
  // 💪 Cuerpo
  { id: 'fortaleza_fisica', cat: 'cuerpo', name: 'Fortaleza física', xp: () => gmKwDays(['entrenamiento']) * 10 + gmKwStreakBonus(['entrenamiento']) },
  { id: 'combate',          cat: 'cuerpo', name: 'Habilidad de combate', xp: () => gmKwDays(['boxeo', 'box', 'jujitsu', 'jiu']) * 10 + gmKwStreakBonus(['boxeo', 'box', 'jujitsu', 'jiu']) },
  { id: 'nutricion',        cat: 'cuerpo', name: 'Nutrición / Salud', xp: () => gmKwDays(['comer sano', 'liviano', 'nutric']) * 10 + gmKwStreakBonus(['comer sano', 'liviano', 'nutric']) },
  { id: 'agilidad',         cat: 'cuerpo', name: 'Agilidad', xp: null },
  { id: 'resistencia',      cat: 'cuerpo', name: 'Resistencia', xp: null },
  // 🧠 Mente
  { id: 'intelecto',        cat: 'mente', name: 'Intelecto', xp: () => gmEstudiarXp() + gmKwDays(['leer']) * 8 + gmKwStreakBonus(['estudiar', 'leer']) + gmDoneMaterias().length * 150 + gmMilestonesOnTime() * 200 },
  { id: 'concentracion',    cat: 'mente', name: 'Concentración', xp: () => gmKwDays(['enfoque']) * 5 + gmKwStreakBonus(['enfoque']) },
  { id: 'fortaleza_mental', cat: 'mente', name: 'Fortaleza mental', xp: () => gmKwDays(['meditar', 'visualiz']) * 8 + gmKwStreakBonus(['meditar', 'visualiz']) },
  { id: 'responsabilidad',  cat: 'mente', name: 'Responsabilidad', xp: () => gmKwDays(['despertar']) * 10 + gmKwDays(['planificar']) * 5 + gmKwStreakBonus(['despertar', 'planificar']) },
  // 💰 Finanzas
  { id: 'economista',       cat: 'finanzas', name: 'Economista', xp: () => gmKwDays(['aprendizaje econ', 'económic', 'economic']) * 5 + gmKwStreakBonus(['aprendizaje econ', 'económic', 'economic']) },
  { id: 'riqueza',          cat: 'finanzas', name: 'Riqueza', xp: () => gmRiquezaXp() },
  { id: 'gerente',          cat: 'finanzas', name: 'Gerente de finanzas', xp: () => gmKwDays(['austeridad']) * 10 + gmKwDays(['registro financiero']) * 8 + gmKwStreakBonus(['austeridad', 'registro financiero']) + gmFixedPaidCount() * 5 },
  // 🙏 Espíritu
  { id: 'fe',               cat: 'espiritu', name: 'Fe', xp: () => gmEvCount('mision') * 5 + gmEvCount('lectura') * 5 + gmEvCount('reflexion') * 15 },
  { id: 'templanza',        cat: 'espiritu', name: 'Templanza', xp: null },
  // ❤️ Vínculos
  { id: 'buen_novio',       cat: 'vinculos', name: 'Buen novio', xp: () => gmEvCount('novia_tiempo', 'novia') * 10 + gmEvCount('novia_gesto') * 10 },
  { id: 'buen_hijo',        cat: 'vinculos', name: 'Buen hijo', xp: () => gmEvCount('padres_gesto', 'padres') * 10 },
  { id: 'buen_padre',       cat: 'vinculos', name: 'Buen padre', xp: () => gmEvCount('gatitas_mimar') * 3 + gmEvCount('gatitas_caja') * 3 },
  { id: 'buen_amigo',       cat: 'vinculos', name: 'Buen amigo', xp: null },
  // ⚙️ Trabajo
  { id: 'ejecucion',        cat: 'trabajo', name: 'Ejecución', xp: () => gmKwDays(['aplicación de ideas', 'aplicacion de ideas']) * 6 + gmKwDays(['trabajo en proyecto']) * 10 + gmKwStreakBonus(['aplicación de ideas', 'aplicacion de ideas', 'trabajo en proyecto']) + gmDoneProyectos().length * 200 },
];
const GM_SKILLS_BY_CAT = cat => GM_SKILLS.filter(s => s.cat === cat);

// Input manual: hábitos que no viven en S (Espíritu y Vínculos)
const GM_EV_FIELDS = [
  { key: 'mision',        label: 'Oración / misa',           cat: 'espiritu', skill: 'fe',         xp: 5 },
  { key: 'lectura',       label: 'Lectura espiritual',        cat: 'espiritu', skill: 'fe',         xp: 5 },
  { key: 'reflexion',     label: 'Reflexión',                 cat: 'espiritu', skill: 'fe',         xp: 15 },
  { key: 'novia_tiempo',  label: 'Tiempo de calidad (novia)', cat: 'vinculos', skill: 'buen_novio', xp: 10 },
  { key: 'novia_gesto',   label: 'Gesto especial (novia)',    cat: 'vinculos', skill: 'buen_novio', xp: 10 },
  { key: 'padres_gesto',  label: 'Gesto especial (padres)',   cat: 'vinculos', skill: 'buen_hijo',  xp: 10 },
  { key: 'gatitas_mimar', label: 'Mimar gatitas',             cat: 'vinculos', skill: 'buen_padre', xp: 3 },
  { key: 'gatitas_caja',  label: 'Limpiar caja de arena',     cat: 'vinculos', skill: 'buen_padre', xp: 3 },
];

// ── Estado por defecto ───────────────────────────────────────────────────
function gmDefault() {
  return {
    nivel_general: 1, titulo_actual: 'El Equilibrado', ultima_actualizacion: null,
    cats: {}, skills: {},
    dia_perfecto_count: 0,
    buffs_activos: [], misiones_diarias: [], misiones_generales: [], misiones_semanales: [], misiones_epicas: [],
    logros: {}, snapshots: [], espiritu_vinculos_log: {},
    config: { animaciones: true, voz_jarvis_levelup: false },
  };
}
function gmMergeDefault(g) {
  const d = gmDefault();
  const out = Object.assign({}, d, g);
  out.cats = out.cats || {}; out.skills = out.skills || {};
  out.config = Object.assign({}, d.config, g.config || {});
  ['buffs_activos', 'misiones_diarias', 'misiones_generales', 'misiones_semanales', 'misiones_epicas', 'snapshots'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
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
    try { if (typeof _db !== 'undefined' && _db) _GM_DOC().set({ state: JSON.stringify(GM), _savedAt: Date.now() }, { merge: true }).catch(() => {}); } catch (e) {}
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

// ── Fechas / rachas ──────────────────────────────────────────────────────
function gmWeekDays(today) {
  const dd = new Date(today + 'T12:00:00');
  const dow = (dd.getDay() + 6) % 7;
  const mon = new Date(dd); mon.setDate(dd.getDate() - dow);
  const out = [];
  for (let i = 0; i <= dow; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); out.push(localStr(x)); }
  return out;
}
function gmConsec(pred) {
  let n = 0, started = false;
  const dd = new Date(getActiveDate() + 'T12:00:00');
  for (let i = 0; i < 400; i++) {
    const ds = localStr(dd);
    if (pred(ds)) { n++; started = true; }
    else if (started || i > 0) break;
    dd.setDate(dd.getDate() - 1);
  }
  return n;
}

// ── Cálculo de skills y categorías ───────────────────────────────────────
function gmRecalcSkillsAndCats() {
  GM.skills = {};
  GM_SKILLS.forEach(s => {
    const xp = s.xp ? Math.round(s.xp()) : 0;
    GM.skills[s.id] = { xp, nivel: gmLevelInfo(xp).nivel, hasTracker: !!s.xp };
  });
  GM.cats = {};
  GM_CATEGORIES.forEach(cat => {
    const catXp = GM_SKILLS_BY_CAT(cat).reduce((sum, s) => sum + GM.skills[s.id].xp, 0);
    GM.cats[cat] = { xp: catXp, nivel: gmLevelInfo(catXp).nivel };
  });
}
function gmRecalcGeneral() {
  const sum = GM_CATEGORIES.reduce((a, c) => a + GM.cats[c].nivel, 0);
  GM.nivel_general = Math.round(sum / GM_CATEGORIES.length);
}
function gmRecalcTitulo() {
  const ranked = GM_CATEGORIES.map(c => ({ c, xp: GM.cats[c].xp })).sort((a, b) => b.xp - a.xp);
  const total = ranked.reduce((a, b) => a + b.xp, 0);
  GM.titulo_actual = (total <= 0 || ranked[0].xp <= ranked[1].xp * 1.2) ? 'El Equilibrado' : GM_CAT_META[ranked[0].c].titulo;
}

// ── Misiones del día (hábitos agrupados por categoría) ───────────────────
function gmBuildDailyMissions(today) {
  const ev = GM.espiritu_vinculos_log[today] || {};
  const seen = new Set();
  GM.misiones_diarias = GM_CATEGORIES.map(cat => {
    const items = [];
    GM_SKILLS_BY_CAT(cat).forEach(s => {
      if (!s.xp) return;
      gmKwHabits(_gmSkillKw(s)).forEach(h => {
        if (seen.has(h.id)) return; seen.add(h.id);
        items.push({ texto: h.name, xp: gmHabitDisplayXp(h.name), completada: gmHabitDone(h, today) });
      });
    });
    GM_EV_FIELDS.filter(f => f.cat === cat).forEach(f => items.push({ texto: f.label, xp: f.xp, completada: !!ev[f.key], ev: f.key }));
    return { cat, items };
  }).filter(g => g.items.length);

  const general = [];
  Object.values(S.habitTrackers || {}).forEach(arr => (arr || []).forEach(h => {
    if (!seen.has(h.id)) { seen.add(h.id); general.push({ texto: h.name, xp: 0, completada: gmHabitDone(h, today) }); }
  }));
  ((S.goals && S.goals[today]) || []).forEach(g => general.push({ texto: g.text, xp: 0, completada: !!g.done, esGoal: true }));
  GM.misiones_generales = general;
}
// keywords de un skill (para juntar sus hábitos en las misiones)
function _gmSkillKw(s) {
  return ({
    fortaleza_fisica: ['entrenamiento'], combate: ['boxeo', 'box', 'jujitsu', 'jiu'], nutricion: ['comer sano', 'liviano', 'nutric'],
    intelecto: ['estudiar', 'leer'], concentracion: ['enfoque'], fortaleza_mental: ['meditar', 'visualiz'], responsabilidad: ['despertar', 'planificar'],
    economista: ['aprendizaje econ', 'económic', 'economic'], gerente: ['registro financiero', 'austeridad'],
    ejecucion: ['aplicación de ideas', 'aplicacion de ideas', 'trabajo en proyecto'],
  })[s.id] || [];
}
function gmBuildWeeklyMissions(today) {
  const days = gmWeekDays(today);
  const kwWeek = (kws, n) => { const h = gmKwHabit(kws); return h && days.filter(d => gmHabitDone(h, d)).length >= n; };
  GM.misiones_semanales = [
    { texto: '6 días de registro financiero', completada: kwWeek(['registro financiero'], 6) },
    { texto: '5 días de estudio', completada: kwWeek(['estudiar'], 5) },
    { texto: '4 entrenamientos', completada: kwWeek(['entrenamiento'], 4) },
  ];
}
function gmBuildEpicMissions(today) {
  const qo = S.quarterlyObjectives; const out = [];
  if (qo && qo.periods) {
    const period = qo.periods.find(p => p.id === qo.activePeriod) || qo.periods[0];
    if (period) {
      const cats = {};
      (period.objectives || []).forEach(o => { const c = o.category || 'General'; (cats[c] = cats[c] || []).push(o); });
      const d = new Date(today + 'T12:00:00');
      const qStart = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
      const qEnd = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0);
      const esperado = Math.min(1, Math.max(0, (d - qStart) / (qEnd - qStart)));
      Object.keys(cats).forEach(c => {
        const list = cats[c]; const done = list.filter(o => o.done).length;
        out.push({ id: period.id + ':' + c, nombre: c, progreso: list.length ? done / list.length : 0, esperado, total: list.length, done });
      });
    }
  }
  GM.misiones_epicas = out;
}

// ── Días perfectos (contador; sin XP, se afina en balanceo) ───────────────
function gmDayPerfect(d) {
  const habits = [];
  Object.values(S.habitTrackers || {}).forEach(arr => (arr || []).forEach(h => { if (gmHabitTotalDone(h) > 0) habits.push(h); }));
  if (!habits.length) return false;
  return habits.every(h => gmHabitDone(h, d));
}
function gmCountPerfectDays() {
  const set = new Set();
  Object.values(S.habitTrackers || {}).forEach(arr => (arr || []).forEach(h => Object.keys(h.days || {}).forEach(k => set.add(k))));
  const today = getActiveDate();
  GM.dia_perfecto_count = [...set].filter(d => d <= today && gmDayPerfect(d)).length;
}

// ── Logros (subconjunto adaptado a las categorías; tabla completa en fase 2) ──
function gmLogro(id, cat, rareza, name, desc, progreso, meta) {
  const prev = GM.logros[id] || {};
  const desbloqueado = prev.desbloqueado || progreso >= meta;
  const justUnlocked = !prev.desbloqueado && progreso >= meta;
  GM.logros[id] = { cat, rareza, name, desc, progreso, meta, desbloqueado, fecha: prev.fecha || (justUnlocked ? getActiveDate() : null) };
  if (justUnlocked) _gmNewLogros.push(GM.logros[id]);
}
function gmCheckLogros() {
  const entreno = gmKwHabit(['entrenamiento']);
  gmLogro('primera_sangre', 'cuerpo', 'comun', 'Primera Sangre', 'Primera sesión de entreno logueada', entreno && gmHabitTotalDone(entreno) > 0 ? 1 : 0, 1);
  gmLogro('hierro_forjado', 'cuerpo', 'epico', 'Hierro Forjado', '100 días seguidos entrenando', entreno ? gmHabitConsec(entreno) : 0, 100);
  const combate = gmKwHabit(['boxeo', 'box', 'jujitsu', 'jiu']);
  gmLogro('primeros_guantes', 'cuerpo', 'comun', 'Primeros Guantes', 'Primera sesión de combate logueada', combate && gmHabitTotalDone(combate) > 0 ? 1 : 0, 1);
  const materias = gmDoneMaterias().length;
  gmLogro('primer_aprobado', 'mente', 'comun', 'Primer Aprobado', 'Primera materia aprobada', materias > 0 ? 1 : 0, 1);
  gmLogro('mente_brillante', 'mente', 'raro', 'Mente Brillante', '10 materias aprobadas', Math.min(materias, 10), 10);
  gmLogro('camino_doctorado', 'mente', 'legendario', 'Camino al Doctorado', '40 materias aprobadas', Math.min(materias, 40), 40);
  gmLogro('primer_registro', 'finanzas', 'comun', 'Primer Registro', 'Primera transacción logueada', (S.transactions || []).length > 0 ? 1 : 0, 1);
  gmLogro('patrimonio_crece', 'finanzas', 'raro', 'Camino al Crecimiento', 'Patrimonio en alza 6 meses', Math.min(gmNwGrowthMonths(), 6), 6);
  gmLogro('shippeado', 'trabajo', 'raro', 'Shippeado', 'Primer proyecto completado', gmDoneProyectos().length > 0 ? 1 : 0, 1);
  gmLogro('constructor_serial', 'trabajo', 'epico', 'Constructor Serial', '5 proyectos completados', Math.min(gmDoneProyectos().length, 5), 5);
  gmLogro('fe_constante', 'espiritu', 'raro', 'Fe Constante', '21 prácticas espirituales', Math.min(gmEvCount('mision'), 21), 21);
  gmLogro('presente', 'vinculos', 'comun', 'Presente', 'Primer tiempo de calidad con novia', gmEvCount('novia_tiempo', 'novia') > 0 ? 1 : 0, 1);
  gmLogro('dia_perfecto', 'mente', 'comun', 'Día Perfecto', 'Primer día con todos los hábitos cumplidos', GM.dia_perfecto_count > 0 ? 1 : 0, 1);
  gmLogro('ascenso_general', 'mente', 'comun', 'Ascenso General', 'Nivel general 5', Math.min(GM.nivel_general, 5), 5);
}

// ── Buffs (rachas) ───────────────────────────────────────────────────────
function gmCheckBuffs() {
  const buffs = [];
  const add = (tipo, label, dias) => { if (dias >= 3) buffs.push({ tipo, label, dias }); };
  const entreno = gmKwHabit(['entrenamiento']); if (entreno) add('racha_entreno', 'Entrenamiento', gmHabitConsec(entreno));
  const estudio = gmKwHabit(['estudiar']); if (estudio) add('racha_estudio', 'Estudio', gmHabitConsec(estudio));
  const reg = gmKwHabit(['registro financiero']); if (reg) add('racha_finanzas', 'Finanzas', gmHabitConsec(reg));
  add('racha_metas', 'Metas diarias', (S.streak && S.streak.count) || 0);
  GM.buffs_activos = buffs;
}

// ── Snapshot mensual (niveles por categoría, para el radar) ──────────────
function gmMaybeSnapshot(today) {
  const mk = today.slice(0, 7);
  if (GM.snapshots.some(s => s.fecha.slice(0, 7) === mk)) return;
  const cats = {}; GM_CATEGORIES.forEach(c => cats[c] = GM.cats[c].nivel);
  GM.snapshots.push({ fecha: today, cats });
  if (GM.snapshots.length > 36) GM.snapshots = GM.snapshots.slice(-36);
}

// ── Orquestador ──────────────────────────────────────────────────────────
function gmRunEngine() {
  _gmLevelUps = []; _gmNewLogros = [];
  const today = getActiveDate();
  const firstRun = !GM.ultima_actualizacion;
  const oldSkill = {}; GM_SKILLS.forEach(s => oldSkill[s.id] = (GM.skills[s.id] || {}).nivel || 1);

  gmRecalcSkillsAndCats();
  gmCountPerfectDays();
  gmBuildDailyMissions(today);
  gmBuildWeeklyMissions(today);
  gmBuildEpicMissions(today);
  gmCheckLogros();
  gmCheckBuffs();
  gmRecalcGeneral();
  gmRecalcTitulo();
  gmMaybeSnapshot(today);

  if (!firstRun) GM_SKILLS.forEach(s => { const nv = (GM.skills[s.id] || {}).nivel || 1; if (nv > oldSkill[s.id]) _gmLevelUps.push({ skill: s.id, to: nv }); });
  else _gmNewLogros = [];
  GM.ultima_actualizacion = today;
  gmSave();
}
