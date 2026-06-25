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
  cuerpo:   { icon: '💪', name: 'Cuerpo',   color: '--c-salud',        titulo: 'El Titán' },
  mente:    { icon: '🧠', name: 'Mente',    color: '--c-conocimiento', titulo: 'El Sabio' },
  finanzas: { icon: '💰', name: 'Finanzas', color: '--c-finanzas',     titulo: 'El Inversor' },
  espiritu: { icon: '🙏', name: 'Espíritu', color: '--c-jarvis',       titulo: 'El Devoto' },
  vinculos: { icon: '❤️', name: 'Vínculos', color: '--c-vida',         titulo: 'El Pilar' },
  trabajo:  { icon: '⚙️', name: 'Trabajo',  color: '--c-ia',           titulo: 'El Ejecutor' },
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
  { kw: ['caminar', 'caminata'], xp: 8 }, { kw: ['dormir temprano'], xp: 10 }, { kw: ['aprendizaje de herramientas'], xp: 8 },
];
function gmHabitDisplayXp(name) { const n = (name || '').toLowerCase(); const m = GM_HABIT_XP.find(x => x.kw.some(k => n.includes(k))); return m ? m.xp : 0; }

let GM = null;
let _gmLevelUps = [];   // skills que subieron de nivel vs run anterior
let _gmNewLogros = [];
let _gmNewTreeNodes = [];   // nodos del árbol recién desbloqueados
const _GM_KEY = 'gamemode_v1';

// ── Curva de niveles: costo para subir de nivel n = 100 * n^1.5 ──────────
function gmXpCost(n) { return 12 * n; }   // curva lineal: costo del nivel n→n+1 = 12·n (acum. nivel N = 6·N·(N-1))
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
function gmProyectoNodes() { const out = []; const walk = n => { if (!n) return; out.push(n); (n.children || []).forEach(walk); }; Object.values(S.proyectos || {}).forEach(tree => (tree || []).forEach(walk)); return out; }
// XP de Ejecución por avance: cada proyecto aporta proporcional a su % (completado = 200).
function gmProyectoProgressXp() { return Math.round(gmProyectoNodes().reduce((a, n) => a + (n.done ? 200 : (+n.progress || 0) / 100 * 200), 0)); }
// Builder Activo: máximo de proyectos distintos con avance en un mismo mes.
function gmBuilderActivoMax() {
  const m = {};
  gmProyectoNodes().forEach(n => (n.advances || []).forEach(d => { const k = (d || '').slice(0, 7); if (k) (m[k] = m[k] || new Set()).add(n.id); }));
  let mx = 0; Object.values(m).forEach(s => { if (s.size > mx) mx = s.size; }); return mx;
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
  { id: 'resistencia',      cat: 'cuerpo', name: 'Resistencia', xp: () => gmKwDays(['caminar', 'caminata']) * 8 + gmKwStreakBonus(['caminar', 'caminata']) },
  // 🧠 Mente
  { id: 'intelecto',        cat: 'mente', name: 'Intelecto', xp: () => gmEstudiarXp() + gmKwDays(['leer']) * 8 + gmKwStreakBonus(['estudiar', 'leer']) + gmDoneMaterias().length * 150 + gmMilestonesOnTime() * 200 },
  { id: 'concentracion',    cat: 'mente', name: 'Concentración', xp: () => gmKwDays(['enfoque']) * 5 + gmKwStreakBonus(['enfoque']) },
  { id: 'fortaleza_mental', cat: 'mente', name: 'Fortaleza mental', xp: () => gmKwDays(['meditar', 'visualiz']) * 8 + gmKwStreakBonus(['meditar', 'visualiz']) },
  // (Responsabilidad se movió a la categoría Trabajo, ver abajo)
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
  { id: 'ejecucion',        cat: 'trabajo', name: 'Ejecución', xp: () => gmKwDays(['aplicación de ideas', 'aplicacion de ideas']) * 6 + gmKwDays(['trabajo en proyecto']) * 10 + gmKwStreakBonus(['aplicación de ideas', 'aplicacion de ideas', 'trabajo en proyecto']) + gmProyectoProgressXp() },
  { id: 'responsabilidad',  cat: 'trabajo', name: 'Responsabilidad', xp: () => gmKwDays(['despertar']) * 10 + gmKwDays(['dormir temprano']) * 10 + gmKwDays(['planificar']) * 5 + gmKwStreakBonus(['despertar', 'dormir temprano', 'planificar']) },
  { id: 'dominio_herramientas', cat: 'trabajo', name: 'Dominio de herramientas', xp: () => gmKwDays(['aprendizaje de herramientas', 'herramienta']) * 8 + gmKwStreakBonus(['aprendizaje de herramientas', 'herramienta']) },
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
    tree: { unlocked: [], claimed: [] },
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
  if (!out.tree || typeof out.tree !== 'object') out.tree = { unlocked: [], claimed: [] };
  if (!Array.isArray(out.tree.unlocked)) out.tree.unlocked = [];
  if (!Array.isArray(out.tree.claimed)) out.tree.claimed = [];
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
    fortaleza_fisica: ['entrenamiento'], combate: ['boxeo', 'box', 'jujitsu', 'jiu'], nutricion: ['comer sano', 'liviano', 'nutric'], resistencia: ['caminar', 'caminata'],
    intelecto: ['estudiar', 'leer'], concentracion: ['enfoque'], fortaleza_mental: ['meditar', 'visualiz'], responsabilidad: ['despertar', 'dormir temprano', 'planificar'],
    economista: ['aprendizaje econ', 'económic', 'economic'], gerente: ['registro financiero', 'austeridad'],
    ejecucion: ['aplicación de ideas', 'aplicacion de ideas', 'trabajo en proyecto'], dominio_herramientas: ['aprendizaje de herramientas', 'herramienta'],
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
// Helpers de métricas para logros
function gmKwMaxRun(kws) { return gmKwHabits(kws).reduce((m, h) => Math.max(m, gmHabitRuns(h).reduce((a, b) => Math.max(a, b), 0)), 0); }
function gmCareerAvg() { const g = []; ((S.lawProgress && S.lawProgress.years) || []).forEach(y => (y.subjects || []).forEach(s => { if (s.grade != null && !isNaN(s.grade)) g.push(+s.grade); })); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0; }
function gmMaxGrade() { let mx = 0; ((S.lawProgress && S.lawProgress.years) || []).forEach(y => (y.subjects || []).forEach(s => { if (s.grade != null && +s.grade > mx) mx = +s.grade; })); return mx; }
function gmBalancePositiveMonths() { const m = {}; (S.transactions || []).forEach(t => { const k = (t.date || '').slice(0, 7); if (!k) return; m[k] = m[k] || { i: 0, e: 0 }; if (t.type === 'income') m[k].i += (+t.amount || 0); else m[k].e += (+t.amount || 0); }); return Object.values(m).filter(x => x.i > x.e).length; }
function gmWeekKeyOf(d) { const dd = new Date(d + 'T12:00:00'); dd.setDate(dd.getDate() - ((dd.getDay() + 6) % 7)); return localStr(dd); }
function gmCierreSemanas() { const h = gmKwHabit(['registro financiero']); if (!h) return 0; const w = {}; Object.keys(h.days || {}).forEach(d => { if (gmHabitDone(h, d)) { const k = gmWeekKeyOf(d); w[k] = (w[k] || 0) + 1; } }); return Object.values(w).filter(n => n >= 7).length; }
function gmMaxAnyStreak() { let m = 0; Object.values(S.habitTrackers || {}).forEach(arr => (arr || []).forEach(h => { const r = gmHabitRuns(h).reduce((a, b) => Math.max(a, b), 0); if (r > m) m = r; })); return m; }
function gmStatsBalanced() { const lv = GM_CATEGORIES.map(c => GM.cats[c].nivel); return Math.max(...lv) - Math.min(...lv) <= 2 ? 1 : 0; }
function gmQuarterlyCumplidos() { return (GM.misiones_epicas || []).filter(e => e.progreso >= 1).length; }

// ── Tabla de logros (table-driven): { id, cat, rarity, name, desc, prog, meta } ──
const GM_LOGROS_DEFS = [
  // 💪 Cuerpo
  { id: 'primera_sangre', cat: 'cuerpo', rarity: 'comun', name: 'Primera Sangre', desc: 'Primera sesión de gym logueada', prog: () => gmKwDays(['entrenamiento']) > 0 ? 1 : 0, meta: 1 },
  { id: 'rutina_marcha', cat: 'cuerpo', rarity: 'comun', name: 'Rutina en Marcha', desc: '10 sesiones de gym', prog: () => gmKwDays(['entrenamiento']), meta: 10 },
  { id: 'hierro_venas', cat: 'cuerpo', rarity: 'raro', name: 'Hierro en las Venas', desc: '50 sesiones de gym', prog: () => gmKwDays(['entrenamiento']), meta: 50 },
  { id: 'bestia_hierro', cat: 'cuerpo', rarity: 'epico', name: 'Bestia de Hierro', desc: '200 sesiones de gym', prog: () => gmKwDays(['entrenamiento']), meta: 200 },
  { id: 'leyenda_hierro', cat: 'cuerpo', rarity: 'legendario', name: 'Leyenda del Hierro', desc: '500 sesiones de gym', prog: () => gmKwDays(['entrenamiento']), meta: 500 },
  { id: 'constancia_fisica', cat: 'cuerpo', rarity: 'raro', name: 'Sin Excusas', desc: '30 días seguidos de gym', prog: () => gmKwMaxRun(['entrenamiento']), meta: 30 },
  { id: 'cuerpo_forjado', cat: 'cuerpo', rarity: 'epico', name: 'Cuerpo Forjado', desc: '90 días seguidos de gym', prog: () => gmKwMaxRun(['entrenamiento']), meta: 90 },
  { id: 'primeros_guantes', cat: 'cuerpo', rarity: 'comun', name: 'Primeros Guantes', desc: 'Primera sesión de combate', prog: () => gmKwDays(['boxeo', 'box', 'jujitsu', 'jiu']) > 0 ? 1 : 0, meta: 1 },
  { id: 'ritmo_combate', cat: 'cuerpo', rarity: 'raro', name: 'Ritmo de Combate', desc: '50 sesiones de combate', prog: () => gmKwDays(['boxeo', 'box', 'jujitsu', 'jiu']), meta: 50 },
  { id: 'puno_acero', cat: 'cuerpo', rarity: 'epico', name: 'Puño de Acero', desc: '150 sesiones de combate', prog: () => gmKwDays(['boxeo', 'box', 'jujitsu', 'jiu']), meta: 150 },
  { id: 'campeon_sombra', cat: 'cuerpo', rarity: 'legendario', name: 'Campeón de Sombra', desc: '400 sesiones de combate', prog: () => gmKwDays(['boxeo', 'box', 'jujitsu', 'jiu']), meta: 400 },
  { id: 'habito_saludable', cat: 'cuerpo', rarity: 'comun', name: 'Hábito Saludable', desc: '7 días seguidos comiendo sano', prog: () => gmKwMaxRun(['comer sano', 'liviano']), meta: 7 },
  { id: 'estilo_vida', cat: 'cuerpo', rarity: 'raro', name: 'Estilo de Vida', desc: '30 días seguidos comiendo sano', prog: () => gmKwMaxRun(['comer sano', 'liviano']), meta: 30 },
  { id: 'disciplina_nutricional', cat: 'cuerpo', rarity: 'epico', name: 'Disciplina Nutricional', desc: '90 días seguidos comiendo sano', prog: () => gmKwMaxRun(['comer sano', 'liviano']), meta: 90 },
  // 🧠 Mente
  { id: 'primer_aprobado', cat: 'mente', rarity: 'comun', name: 'Primer Aprobado', desc: 'Primera materia aprobada', prog: () => gmDoneMaterias().length > 0 ? 1 : 0, meta: 1 },
  { id: 'cuatri_marcha', cat: 'mente', rarity: 'raro', name: 'Cuatrimestre en Marcha', desc: '5 materias aprobadas', prog: () => gmDoneMaterias().length, meta: 5 },
  { id: 'mente_brillante', cat: 'mente', rarity: 'raro', name: 'Mente Brillante', desc: '10 materias aprobadas', prog: () => gmDoneMaterias().length, meta: 10 },
  { id: 'mitad_camino', cat: 'mente', rarity: 'epico', name: 'Mitad de Camino', desc: '20 materias aprobadas', prog: () => gmDoneMaterias().length, meta: 20 },
  { id: 'recta_final', cat: 'mente', rarity: 'epico', name: 'Recta Final', desc: '35 materias aprobadas', prog: () => gmDoneMaterias().length, meta: 35 },
  { id: 'camino_doctorado', cat: 'mente', rarity: 'legendario', name: 'Camino al Doctorado', desc: 'Carrera completa: 40 materias', prog: () => gmDoneMaterias().length, meta: 40 },
  { id: 'primer_diez', cat: 'mente', rarity: 'raro', name: 'Sobresaliente', desc: 'Una materia con nota 9 o más', prog: () => gmMaxGrade() >= 9 ? 1 : 0, meta: 1 },
  { id: 'disciplina_total', cat: 'mente', rarity: 'legendario', name: 'Disciplina Total', desc: 'Promedio de carrera 8.5+', prog: () => gmCareerAvg(), meta: 8.5 },
  { id: 'constante_estudio', cat: 'mente', rarity: 'comun', name: 'Constante en el Estudio', desc: '7 días seguidos estudiando', prog: () => gmKwMaxRun(['estudiar']), meta: 7 },
  { id: 'disciplina_academica', cat: 'mente', rarity: 'raro', name: 'Disciplina Académica', desc: '30 días seguidos estudiando', prog: () => gmKwMaxRun(['estudiar']), meta: 30 },
  { id: 'erudito', cat: 'mente', rarity: 'epico', name: 'Erudito', desc: '90 días seguidos estudiando', prog: () => gmKwMaxRun(['estudiar']), meta: 90 },
  { id: 'lector', cat: 'mente', rarity: 'comun', name: 'Lector', desc: '7 días seguidos leyendo', prog: () => gmKwMaxRun(['leer']), meta: 7 },
  { id: 'devorador_libros', cat: 'mente', rarity: 'raro', name: 'Devorador de Libros', desc: '30 días seguidos leyendo', prog: () => gmKwMaxRun(['leer']), meta: 30 },
  { id: 'adelantado', cat: 'mente', rarity: 'raro', name: 'Por Delante del Plan', desc: '3 milestones a tiempo', prog: () => gmMilestonesOnTime(), meta: 3 },
  { id: 'por_delante', cat: 'mente', rarity: 'epico', name: 'Adelantado', desc: '10 milestones a tiempo', prog: () => gmMilestonesOnTime(), meta: 10 },
  { id: 'enfoque_inicial', cat: 'mente', rarity: 'comun', name: 'Enfoque Inicial', desc: '7 días seguidos de foco', prog: () => gmKwMaxRun(['enfoque']), meta: 7 },
  { id: 'mente_laser', cat: 'mente', rarity: 'raro', name: 'Mente Láser', desc: '30 días seguidos de foco', prog: () => gmKwMaxRun(['enfoque']), meta: 30 },
  { id: 'primer_silencio', cat: 'mente', rarity: 'comun', name: 'Primer Silencio', desc: '7 días seguidos meditando', prog: () => gmKwMaxRun(['meditar', 'visualiz']), meta: 7 },
  { id: 'calma_interior', cat: 'mente', rarity: 'raro', name: 'Calma Interior', desc: '30 días seguidos meditando', prog: () => gmKwMaxRun(['meditar', 'visualiz']), meta: 30 },
  { id: 'madrugador', cat: 'trabajo', rarity: 'comun', name: 'Madrugador', desc: '7 días seguidos despertando temprano', prog: () => gmKwMaxRun(['despertar']), meta: 7 },
  { id: 'disciplina_matinal', cat: 'trabajo', rarity: 'raro', name: 'Disciplina Matinal', desc: '30 días seguidos despertando temprano', prog: () => gmKwMaxRun(['despertar']), meta: 30 },
  { id: 'planificador', cat: 'trabajo', rarity: 'comun', name: 'Planificador', desc: '7 días seguidos planificando el día', prog: () => gmKwMaxRun(['planificar']), meta: 7 },
  // 💰 Finanzas
  { id: 'primer_registro', cat: 'finanzas', rarity: 'comun', name: 'Primer Registro', desc: 'Primera transacción logueada', prog: () => (S.transactions || []).length > 0 ? 1 : 0, meta: 1 },
  { id: 'racha_registro', cat: 'finanzas', rarity: 'comun', name: 'Racha de Registro', desc: '7 días seguidos registrando', prog: () => gmKwMaxRun(['registro financiero']), meta: 7 },
  { id: 'contador_constante', cat: 'finanzas', rarity: 'raro', name: 'Contador Constante', desc: '30 días seguidos registrando', prog: () => gmKwMaxRun(['registro financiero']), meta: 30 },
  { id: 'libro_mayor', cat: 'finanzas', rarity: 'epico', name: 'Libro Mayor Personal', desc: '90 días seguidos registrando', prog: () => gmKwMaxRun(['registro financiero']), meta: 90 },
  { id: 'cierre_semanal', cat: 'finanzas', rarity: 'comun', name: 'Cierre Semanal', desc: 'Una semana con registro completo', prog: () => gmCierreSemanas(), meta: 1 },
  { id: 'cierre_prolijo', cat: 'finanzas', rarity: 'raro', name: 'Cierre Prolijo', desc: '8 semanas con registro completo', prog: () => gmCierreSemanas(), meta: 8 },
  { id: 'primera_leccion', cat: 'finanzas', rarity: 'comun', name: 'Primera Lección', desc: '7 días seguidos de aprendizaje económico', prog: () => gmKwMaxRun(['aprendizaje econ', 'económic', 'economic']), meta: 7 },
  { id: 'aprendiz_constante', cat: 'finanzas', rarity: 'raro', name: 'Aprendiz Constante', desc: '30 días seguidos de aprendizaje económico', prog: () => gmKwMaxRun(['aprendizaje econ', 'económic', 'economic']), meta: 30 },
  { id: 'estratega_financiero', cat: 'finanzas', rarity: 'epico', name: 'Estratega Financiero', desc: '90 días seguidos de aprendizaje económico', prog: () => gmKwMaxRun(['aprendizaje econ', 'económic', 'economic']), meta: 90 },
  { id: 'mes_presupuesto', cat: 'finanzas', rarity: 'raro', name: 'Mes Bajo Presupuesto', desc: '30 días seguidos de austeridad', prog: () => gmKwMaxRun(['austeridad']), meta: 30 },
  { id: 'ano_control', cat: 'finanzas', rarity: 'legendario', name: 'Año de Control', desc: '365 días de austeridad sostenida', prog: () => gmKwMaxRun(['austeridad']), meta: 365 },
  { id: 'primer_crecimiento', cat: 'finanzas', rarity: 'comun', name: 'Primer Crecimiento', desc: 'Primer mes con patrimonio en alza', prog: () => gmNwGrowthMonths() > 0 ? 1 : 0, meta: 1 },
  { id: 'camino_crecimiento', cat: 'finanzas', rarity: 'raro', name: 'Camino al Crecimiento', desc: 'Patrimonio en alza 6 meses seguidos', prog: () => gmNwMaxGrowthStreak(), meta: 6 },
  { id: 'patrimonio_x15', cat: 'finanzas', rarity: 'epico', name: 'Patrimonio x1.5', desc: 'Patrimonio +50% en 12 meses', prog: () => gmNwRatio12(), meta: 1.5 },
  { id: 'patrimonio_x2', cat: 'finanzas', rarity: 'legendario', name: 'Patrimonio x2', desc: 'Patrimonio duplicado en 12 meses', prog: () => gmNwRatio12(), meta: 2 },
  { id: 'balance_positivo', cat: 'finanzas', rarity: 'comun', name: 'Balance Positivo', desc: 'Un mes con balance positivo', prog: () => gmBalancePositiveMonths(), meta: 1 },
  { id: 'balance_sostenido', cat: 'finanzas', rarity: 'raro', name: 'Balance Sostenido', desc: '6 meses con balance positivo', prog: () => gmBalancePositiveMonths(), meta: 6 },
  { id: 'solidez_financiera', cat: 'finanzas', rarity: 'epico', name: 'Solidez Financiera', desc: '12 meses con balance positivo', prog: () => gmBalancePositiveMonths(), meta: 12 },
  // 🙏 Espíritu
  { id: 'primer_paso_fe', cat: 'espiritu', rarity: 'comun', name: 'Primer Paso', desc: 'Primera práctica espiritual', prog: () => gmEvCount('mision') > 0 ? 1 : 0, meta: 1 },
  { id: 'fe_constante', cat: 'espiritu', rarity: 'raro', name: 'Fe Constante', desc: '21 prácticas espirituales', prog: () => gmEvCount('mision'), meta: 21 },
  { id: 'custodio_fe', cat: 'espiritu', rarity: 'epico', name: 'Custodio de la Fe', desc: '90 prácticas espirituales', prog: () => gmEvCount('mision'), meta: 90 },
  { id: 'lector_espiritual', cat: 'espiritu', rarity: 'comun', name: 'Lector Espiritual', desc: 'Primera lectura espiritual', prog: () => gmEvCount('lectura') > 0 ? 1 : 0, meta: 1 },
  { id: 'introspeccion', cat: 'espiritu', rarity: 'raro', name: 'Introspección Constante', desc: '12 reflexiones', prog: () => gmEvCount('reflexion'), meta: 12 },
  // ❤️ Vínculos
  { id: 'presente', cat: 'vinculos', rarity: 'comun', name: 'Presente', desc: 'Primer tiempo de calidad con novia', prog: () => gmEvCount('novia_tiempo', 'novia') > 0 ? 1 : 0, meta: 1 },
  { id: 'companero_constante', cat: 'vinculos', rarity: 'raro', name: 'Compañero Constante', desc: '30 días de tiempo de calidad', prog: () => gmEvCount('novia_tiempo', 'novia'), meta: 30 },
  { id: 'detallista', cat: 'vinculos', rarity: 'raro', name: 'Detallista', desc: '10 gestos especiales hacia la novia', prog: () => gmEvCount('novia_gesto'), meta: 10 },
  { id: 'hijo_presente', cat: 'vinculos', rarity: 'raro', name: 'Hijo Presente', desc: '5 gestos especiales hacia los padres', prog: () => gmEvCount('padres_gesto', 'padres'), meta: 5 },
  { id: 'mimos_felinos', cat: 'vinculos', rarity: 'comun', name: 'Mimos Felinos', desc: 'Primer momento con las gatitas', prog: () => gmEvCount('gatitas_mimar') > 0 ? 1 : 0, meta: 1 },
  { id: 'responsable_felino', cat: 'vinculos', rarity: 'raro', name: 'Responsable Felino', desc: 'Limpiar la caja 20 veces', prog: () => gmEvCount('gatitas_caja'), meta: 20 },
  { id: 'familia_primero', cat: 'vinculos', rarity: 'epico', name: 'Familia Primero', desc: 'Novia + padres + gatitas, 10 veces cada uno', prog: () => Math.min(gmEvCount('novia_tiempo', 'novia'), gmEvCount('padres_gesto', 'padres'), gmEvCount('gatitas_mimar')), meta: 10 },
  // ⚙️ Trabajo
  { id: 'primer_proyecto', cat: 'trabajo', rarity: 'comun', name: 'Primer Commit', desc: 'Primer día de trabajo en proyectos', prog: () => gmKwDays(['trabajo en proyecto']) > 0 ? 1 : 0, meta: 1 },
  { id: 'shippeado', cat: 'trabajo', rarity: 'raro', name: 'Shippeado', desc: 'Primer proyecto completado', prog: () => gmDoneProyectos().length, meta: 1 },
  { id: 'constructor_serial', cat: 'trabajo', rarity: 'epico', name: 'Constructor Serial', desc: '5 proyectos completados', prog: () => gmDoneProyectos().length, meta: 5 },
  { id: 'arquitecto', cat: 'trabajo', rarity: 'legendario', name: 'Arquitecto de Sistemas', desc: '15 proyectos completados', prog: () => gmDoneProyectos().length, meta: 15 },
  { id: 'trabajador_constante', cat: 'trabajo', rarity: 'comun', name: 'Trabajador Constante', desc: '7 días seguidos de trabajo en proyectos', prog: () => gmKwMaxRun(['trabajo en proyecto']), meta: 7 },
  { id: 'ejecutor_disciplinado', cat: 'trabajo', rarity: 'raro', name: 'Ejecutor Disciplinado', desc: '30 días seguidos de trabajo en proyectos', prog: () => gmKwMaxRun(['trabajo en proyecto']), meta: 30 },
  { id: 'builder_activo', cat: 'trabajo', rarity: 'raro', name: 'Builder Activo', desc: '3 proyectos con avance en el mismo mes', prog: () => gmBuilderActivoMax(), meta: 3 },
  // 🌐 Generales / cross-stat
  { id: 'dia_perfecto', cat: 'general', rarity: 'comun', name: 'Día Perfecto', desc: 'Un día con todos los hábitos cumplidos', prog: () => GM.dia_perfecto_count > 0 ? 1 : 0, meta: 1 },
  { id: 'semana_perfecta', cat: 'general', rarity: 'raro', name: 'Semana Perfecta', desc: '7 días perfectos', prog: () => GM.dia_perfecto_count, meta: 7 },
  { id: 'mes_perfecto', cat: 'general', rarity: 'epico', name: 'Mes Perfecto', desc: '30 días perfectos', prog: () => GM.dia_perfecto_count, meta: 30 },
  { id: 'racha_hierro', cat: 'general', rarity: 'raro', name: 'Racha de Hierro', desc: 'Una racha llega a 21 días', prog: () => gmMaxAnyStreak(), meta: 21 },
  { id: 'racha_legendaria', cat: 'general', rarity: 'legendario', name: 'Racha Legendaria', desc: 'Una racha llega a 100 días', prog: () => gmMaxAnyStreak(), meta: 100 },
  { id: 'equilibrio', cat: 'general', rarity: 'raro', name: 'Equilibrio', desc: 'Las 6 categorías con diferencia ≤2 niveles', prog: () => gmStatsBalanced(), meta: 1 },
  { id: 'ascenso_general', cat: 'general', rarity: 'comun', name: 'Ascenso General', desc: 'Nivel general 5', prog: () => GM.nivel_general, meta: 5 },
  { id: 'doble_digito', cat: 'general', rarity: 'raro', name: 'Doble Dígito', desc: 'Nivel general 10', prog: () => GM.nivel_general, meta: 10 },
  { id: 'nivel_elite', cat: 'general', rarity: 'epico', name: 'Nivel de Élite', desc: 'Nivel general 25', prog: () => GM.nivel_general, meta: 25 },
  { id: 'maestria_vida', cat: 'general', rarity: 'legendario', name: 'Maestría de Vida', desc: 'Nivel general 50', prog: () => GM.nivel_general, meta: 50 },
  { id: 'mision_epica', cat: 'general', rarity: 'raro', name: 'Misión Épica Cumplida', desc: 'Un objetivo trimestral al 100%', prog: () => gmQuarterlyCumplidos(), meta: 1 },
  // ── Tiers adicionales: completar escaleras Común→Raro→Épico→Legendario ──
  // 💪 Cuerpo
  { id: 'semana_hierro', cat: 'cuerpo', rarity: 'comun', name: 'Semana de Hierro', desc: '7 días seguidos de gym', prog: () => gmKwMaxRun(['entrenamiento']), meta: 7 },
  { id: 'voluntad_acero', cat: 'cuerpo', rarity: 'legendario', name: 'Voluntad Inquebrantable', desc: '365 días seguidos de gym', prog: () => gmKwMaxRun(['entrenamiento']), meta: 365 },
  { id: 'templo_cuerpo', cat: 'cuerpo', rarity: 'legendario', name: 'Templo del Cuerpo', desc: '365 días seguidos comiendo sano', prog: () => gmKwMaxRun(['comer sano', 'liviano']), meta: 365 },
  // 🧠 Mente
  { id: 'estudio_legendario', cat: 'mente', rarity: 'legendario', name: 'Sabio Inagotable', desc: '365 días seguidos estudiando', prog: () => gmKwMaxRun(['estudiar']), meta: 365 },
  { id: 'leer_epico', cat: 'mente', rarity: 'epico', name: 'Biblioteca Viviente', desc: '90 días seguidos leyendo', prog: () => gmKwMaxRun(['leer']), meta: 90 },
  { id: 'leer_legendario', cat: 'mente', rarity: 'legendario', name: 'Erudito de las Letras', desc: '365 días seguidos leyendo', prog: () => gmKwMaxRun(['leer']), meta: 365 },
  { id: 'milestone_legendario', cat: 'mente', rarity: 'legendario', name: 'Profeta del Plan', desc: '20 milestones a tiempo', prog: () => gmMilestonesOnTime(), meta: 20 },
  { id: 'foco_epico', cat: 'mente', rarity: 'epico', name: 'Concentración Absoluta', desc: '90 días seguidos de foco', prog: () => gmKwMaxRun(['enfoque']), meta: 90 },
  { id: 'foco_legendario', cat: 'mente', rarity: 'legendario', name: 'Monje del Foco', desc: '365 días seguidos de foco', prog: () => gmKwMaxRun(['enfoque']), meta: 365 },
  { id: 'meditar_epico', cat: 'mente', rarity: 'epico', name: 'Inquebrantable', desc: '90 días seguidos meditando', prog: () => gmKwMaxRun(['meditar', 'visualiz']), meta: 90 },
  { id: 'meditar_legendario', cat: 'mente', rarity: 'legendario', name: 'Paz Inalterable', desc: '365 días seguidos meditando', prog: () => gmKwMaxRun(['meditar', 'visualiz']), meta: 365 },
  { id: 'despertar_epico', cat: 'trabajo', rarity: 'epico', name: 'Dueño del Amanecer', desc: '90 días seguidos despertando temprano', prog: () => gmKwMaxRun(['despertar']), meta: 90 },
  { id: 'despertar_legendario', cat: 'trabajo', rarity: 'legendario', name: 'Reloj Viviente', desc: '365 días seguidos despertando temprano', prog: () => gmKwMaxRun(['despertar']), meta: 365 },
  { id: 'planificar_raro', cat: 'trabajo', rarity: 'raro', name: 'Organizado', desc: '30 días seguidos planificando el día', prog: () => gmKwMaxRun(['planificar']), meta: 30 },
  { id: 'planificar_epico', cat: 'trabajo', rarity: 'epico', name: 'Maestro del Tiempo', desc: '90 días seguidos planificando el día', prog: () => gmKwMaxRun(['planificar']), meta: 90 },
  { id: 'planificar_legendario', cat: 'trabajo', rarity: 'legendario', name: 'Arquitecto del Día', desc: '365 días seguidos planificando el día', prog: () => gmKwMaxRun(['planificar']), meta: 365 },
  // 💰 Finanzas
  { id: 'registro_legendario', cat: 'finanzas', rarity: 'legendario', name: 'Cronista Financiero', desc: '365 días seguidos registrando', prog: () => gmKwMaxRun(['registro financiero']), meta: 365 },
  { id: 'cierre_epico', cat: 'finanzas', rarity: 'epico', name: 'Cierre Impecable', desc: '26 semanas con registro completo', prog: () => gmCierreSemanas(), meta: 26 },
  { id: 'cierre_legendario', cat: 'finanzas', rarity: 'legendario', name: 'Año Sin Fugas', desc: '52 semanas con registro completo', prog: () => gmCierreSemanas(), meta: 52 },
  { id: 'aprendizaje_legendario', cat: 'finanzas', rarity: 'legendario', name: 'Economista Formado', desc: '365 días seguidos de aprendizaje económico', prog: () => gmKwMaxRun(['aprendizaje econ', 'económic', 'economic']), meta: 365 },
  { id: 'austeridad_comun', cat: 'finanzas', rarity: 'comun', name: 'Semana Austera', desc: '7 días seguidos de austeridad', prog: () => gmKwMaxRun(['austeridad']), meta: 7 },
  { id: 'austeridad_epico', cat: 'finanzas', rarity: 'epico', name: 'Trimestre Bajo Control', desc: '90 días seguidos de austeridad', prog: () => gmKwMaxRun(['austeridad']), meta: 90 },
  { id: 'crecimiento_epico', cat: 'finanzas', rarity: 'epico', name: 'Crecimiento Sostenido', desc: 'Patrimonio en alza 12 meses seguidos', prog: () => gmNwMaxGrowthStreak(), meta: 12 },
  { id: 'crecimiento_legendario', cat: 'finanzas', rarity: 'legendario', name: 'Ascenso Imparable', desc: 'Patrimonio en alza 24 meses seguidos', prog: () => gmNwMaxGrowthStreak(), meta: 24 },
  { id: 'balance_legendario', cat: 'finanzas', rarity: 'legendario', name: 'Fortaleza Financiera', desc: '24 meses con balance positivo', prog: () => gmBalancePositiveMonths(), meta: 24 },
  // 🙏 Espíritu
  { id: 'fe_legendario', cat: 'espiritu', rarity: 'legendario', name: 'Pilar de Fe', desc: '365 prácticas espirituales', prog: () => gmEvCount('mision'), meta: 365 },
  { id: 'lectura_raro', cat: 'espiritu', rarity: 'raro', name: 'Buscador', desc: '30 lecturas espirituales', prog: () => gmEvCount('lectura'), meta: 30 },
  { id: 'lectura_epico', cat: 'espiritu', rarity: 'epico', name: 'Sabio Espiritual', desc: '90 lecturas espirituales', prog: () => gmEvCount('lectura'), meta: 90 },
  { id: 'lectura_legendario', cat: 'espiritu', rarity: 'legendario', name: 'Iluminado', desc: '365 lecturas espirituales', prog: () => gmEvCount('lectura'), meta: 365 },
  { id: 'reflexion_comun', cat: 'espiritu', rarity: 'comun', name: 'Primera Reflexión', desc: 'Primera reflexión', prog: () => gmEvCount('reflexion') > 0 ? 1 : 0, meta: 1 },
  { id: 'reflexion_epico', cat: 'espiritu', rarity: 'epico', name: 'Alma Reflexiva', desc: '52 reflexiones', prog: () => gmEvCount('reflexion'), meta: 52 },
  { id: 'reflexion_legendario', cat: 'espiritu', rarity: 'legendario', name: 'Maestro Interior', desc: '104 reflexiones', prog: () => gmEvCount('reflexion'), meta: 104 },
  // ❤️ Vínculos
  { id: 'novio_epico', cat: 'vinculos', rarity: 'epico', name: 'Pilar de la Relación', desc: '90 tiempos de calidad con novia', prog: () => gmEvCount('novia_tiempo', 'novia'), meta: 90 },
  { id: 'novio_legendario', cat: 'vinculos', rarity: 'legendario', name: 'Amor Eterno', desc: '365 tiempos de calidad con novia', prog: () => gmEvCount('novia_tiempo', 'novia'), meta: 365 },
  { id: 'gestos_novia_epico', cat: 'vinculos', rarity: 'epico', name: 'Romántico Empedernido', desc: '50 gestos hacia la novia', prog: () => gmEvCount('novia_gesto'), meta: 50 },
  { id: 'gestos_novia_legendario', cat: 'vinculos', rarity: 'legendario', name: 'Alma Gemela', desc: '150 gestos hacia la novia', prog: () => gmEvCount('novia_gesto'), meta: 150 },
  { id: 'padres_epico', cat: 'vinculos', rarity: 'epico', name: 'Hijo Devoto', desc: '30 gestos hacia los padres', prog: () => gmEvCount('padres_gesto', 'padres'), meta: 30 },
  { id: 'padres_legendario', cat: 'vinculos', rarity: 'legendario', name: 'Orgullo Familiar', desc: '100 gestos hacia los padres', prog: () => gmEvCount('padres_gesto', 'padres'), meta: 100 },
  { id: 'gatitas_raro', cat: 'vinculos', rarity: 'raro', name: 'Amante Felino', desc: '30 momentos con las gatitas', prog: () => gmEvCount('gatitas_mimar'), meta: 30 },
  { id: 'gatitas_epico', cat: 'vinculos', rarity: 'epico', name: 'Padre Gatuno', desc: '90 momentos con las gatitas', prog: () => gmEvCount('gatitas_mimar'), meta: 90 },
  { id: 'gatitas_legendario', cat: 'vinculos', rarity: 'legendario', name: 'Guardián Felino', desc: '365 momentos con las gatitas', prog: () => gmEvCount('gatitas_mimar'), meta: 365 },
  { id: 'caja_epico', cat: 'vinculos', rarity: 'epico', name: 'Hogar Impecable', desc: '60 limpiezas de la caja', prog: () => gmEvCount('gatitas_caja'), meta: 60 },
  { id: 'caja_legendario', cat: 'vinculos', rarity: 'legendario', name: 'Servicio Eterno', desc: '200 limpiezas de la caja', prog: () => gmEvCount('gatitas_caja'), meta: 200 },
  // ⚙️ Trabajo
  { id: 'trabajo_epico', cat: 'trabajo', rarity: 'epico', name: 'Builder Incansable', desc: '90 días seguidos de trabajo en proyectos', prog: () => gmKwMaxRun(['trabajo en proyecto']), meta: 90 },
  { id: 'trabajo_legendario', cat: 'trabajo', rarity: 'legendario', name: 'Máquina de Crear', desc: '365 días seguidos de trabajo en proyectos', prog: () => gmKwMaxRun(['trabajo en proyecto']), meta: 365 },
  // 🌐 Generales
  { id: 'vida_impecable', cat: 'general', rarity: 'legendario', name: 'Vida Impecable', desc: '100 días perfectos', prog: () => GM.dia_perfecto_count, meta: 100 },
  { id: 'racha_comun', cat: 'general', rarity: 'comun', name: 'Constancia Inicial', desc: 'Una racha llega a 7 días', prog: () => gmMaxAnyStreak(), meta: 7 },
  { id: 'racha_epico', cat: 'general', rarity: 'epico', name: 'Racha Imparable', desc: 'Una racha llega a 50 días', prog: () => gmMaxAnyStreak(), meta: 50 },
  { id: 'conquistador_trimestral', cat: 'general', rarity: 'epico', name: 'Conquistador Trimestral', desc: '4 objetivos trimestrales al 100%', prog: () => gmQuarterlyCumplidos(), meta: 4 },
  { id: 'equilibrio_maestro', cat: 'general', rarity: 'epico', name: 'Equilibrio Maestro', desc: 'Las 6 categorías con diferencia ≤1 nivel', prog: () => { const lv = GM_CATEGORIES.map(c => GM.cats[c].nivel); return Math.max(...lv) - Math.min(...lv) <= 1 ? 1 : 0; }, meta: 1 },
  // ── Hábitos nuevos: Caminar (Resistencia), Dormir temprano, Aprendizaje de herramientas ──
  { id: 'caminante', cat: 'cuerpo', rarity: 'comun', name: 'Caminante', desc: '7 días seguidos caminando', prog: () => gmKwMaxRun(['caminar', 'caminata']), meta: 7 },
  { id: 'senderista', cat: 'cuerpo', rarity: 'raro', name: 'Senderista', desc: '30 días seguidos caminando', prog: () => gmKwMaxRun(['caminar', 'caminata']), meta: 30 },
  { id: 'maraton_vida', cat: 'cuerpo', rarity: 'epico', name: 'Maratón de Vida', desc: '90 días seguidos caminando', prog: () => gmKwMaxRun(['caminar', 'caminata']), meta: 90 },
  { id: 'viajero_infatigable', cat: 'cuerpo', rarity: 'legendario', name: 'Viajero Infatigable', desc: '365 días seguidos caminando', prog: () => gmKwMaxRun(['caminar', 'caminata']), meta: 365 },
  { id: 'buen_dormir', cat: 'trabajo', rarity: 'comun', name: 'Buen Dormir', desc: '7 días seguidos durmiendo temprano', prog: () => gmKwMaxRun(['dormir temprano']), meta: 7 },
  { id: 'descanso_disciplinado', cat: 'trabajo', rarity: 'raro', name: 'Descanso Disciplinado', desc: '30 días seguidos durmiendo temprano', prog: () => gmKwMaxRun(['dormir temprano']), meta: 30 },
  { id: 'maestro_descanso', cat: 'trabajo', rarity: 'epico', name: 'Maestro del Descanso', desc: '90 días seguidos durmiendo temprano', prog: () => gmKwMaxRun(['dormir temprano']), meta: 90 },
  { id: 'reloj_nocturno', cat: 'trabajo', rarity: 'legendario', name: 'Reloj Nocturno', desc: '365 días seguidos durmiendo temprano', prog: () => gmKwMaxRun(['dormir temprano']), meta: 365 },
  { id: 'aprendiz_herramientas', cat: 'trabajo', rarity: 'comun', name: 'Aprendiz de Herramientas', desc: '7 días seguidos aprendiendo herramientas', prog: () => gmKwMaxRun(['aprendizaje de herramientas', 'herramienta']), meta: 7 },
  { id: 'artesano_digital', cat: 'trabajo', rarity: 'raro', name: 'Artesano Digital', desc: '30 días seguidos aprendiendo herramientas', prog: () => gmKwMaxRun(['aprendizaje de herramientas', 'herramienta']), meta: 30 },
  { id: 'maestro_herramientas', cat: 'trabajo', rarity: 'epico', name: 'Maestro de Herramientas', desc: '90 días seguidos aprendiendo herramientas', prog: () => gmKwMaxRun(['aprendizaje de herramientas', 'herramienta']), meta: 90 },
  { id: 'polimata_tecnico', cat: 'trabajo', rarity: 'legendario', name: 'Polímata Técnico', desc: '365 días seguidos aprendiendo herramientas', prog: () => gmKwMaxRun(['aprendizaje de herramientas', 'herramienta']), meta: 365 },
];
function gmCheckLogros() {
  GM_LOGROS_DEFS.forEach(d => gmLogro(d.id, d.cat, d.rarity, d.name, d.desc, d.prog(), d.meta));
}

// ── ÁRBOL DE HABILIDADES (talent tree / DAG con ramas que se unen) ───────
// Cada nodo se desbloquea cuando se cumplen TODOS sus requisitos:
//   requires.metrics: condiciones de datos [{ metric, value }] (umbral >=)
//   requires.nodes:   nodos previos que deben estar desbloqueados (uniones)
//   manual: true → además requiere ser "reclamado" (no hay dato que lo mida)
// Niveles de referencia (curva 12·i): nivel 10 = 540 XP, nivel 25 = 3600, nivel 50 = 14700.
const GM_TREE_NODES = [
  // ── TIER 0 — Iniciado (nivel de skill ≥ 10) ──
  { id: 'hombre_de_hierro', name: 'Hombre de Hierro', icon: '💪', cat: 'cuerpo', tier: 0, requires: { metrics: [{ metric: 'lvl_fortaleza_fisica', value: 10 }] } },
  { id: 'combatiente', name: 'Combatiente', icon: '🥊', cat: 'cuerpo', tier: 0, requires: { metrics: [{ metric: 'lvl_combate', value: 10 }] } },
  { id: 'saludable', name: 'Saludable', icon: '🥗', cat: 'cuerpo', tier: 0, requires: { metrics: [{ metric: 'lvl_nutricion', value: 10 }] } },
  { id: 'resistente', name: 'Resistente', icon: '🏃', cat: 'cuerpo', tier: 0, requires: { metrics: [{ metric: 'lvl_resistencia', value: 10 }] } },
  { id: 'estudiante', name: 'Estudiante', icon: '📚', cat: 'mente', tier: 0, requires: { metrics: [{ metric: 'lvl_intelecto', value: 10 }] } },
  { id: 'alerta', name: 'Alerta', icon: '🎯', cat: 'mente', tier: 0, requires: { metrics: [{ metric: 'lvl_concentracion', value: 10 }] } },
  { id: 'sereno', name: 'Sereno', icon: '🧘', cat: 'mente', tier: 0, requires: { metrics: [{ metric: 'lvl_fortaleza_mental', value: 10 }] } },
  { id: 'aprendiz_de_capital', name: 'Aprendiz de Capital', icon: '💵', cat: 'finanzas', tier: 0, requires: { metrics: [{ metric: 'lvl_economista', value: 10 }] } },
  { id: 'ordenado', name: 'Ordenado', icon: '📊', cat: 'finanzas', tier: 0, requires: { metrics: [{ metric: 'lvl_gerente', value: 10 }] } },
  { id: 'creyente', name: 'Creyente', icon: '✝️', cat: 'espiritu', tier: 0, requires: { metrics: [{ metric: 'lvl_fe', value: 10 }] } },
  { id: 'atento', name: 'Atento', icon: '💖', cat: 'vinculos', tier: 0, requires: { metrics: [{ metric: 'lvl_buen_novio', value: 10 }] } },
  { id: 'hijo_presente_n', name: 'Hijo Presente', icon: '👨‍👦', cat: 'vinculos', tier: 0, requires: { metrics: [{ metric: 'lvl_buen_hijo', value: 10 }] } },
  { id: 'protector_felino', name: 'Protector Felino', icon: '🐱', cat: 'vinculos', tier: 0, requires: { metrics: [{ metric: 'lvl_buen_padre', value: 10 }] } },
  { id: 'hacedor', name: 'Hacedor', icon: '🔨', cat: 'trabajo', tier: 0, requires: { metrics: [{ metric: 'lvl_ejecucion', value: 10 }] } },
  { id: 'confiable', name: 'Confiable', icon: '⏰', cat: 'trabajo', tier: 0, requires: { metrics: [{ metric: 'lvl_responsabilidad', value: 10 }] } },
  { id: 'aprendiz', name: 'Aprendiz', icon: '🔧', cat: 'trabajo', tier: 0, requires: { metrics: [{ metric: 'lvl_dominio_herramientas', value: 10 }] } },
  // ── TIER 1 — Profesional (nivel ≥ 25 + nodo Tier 0) ──
  { id: 'hombre_de_acero', name: 'Hombre de Acero', icon: '💪', cat: 'cuerpo', tier: 1, requires: { metrics: [{ metric: 'lvl_fortaleza_fisica', value: 25 }], nodes: ['hombre_de_hierro'] } },
  { id: 'veterano_de_combate', name: 'Veterano de Combate', icon: '🥊', cat: 'cuerpo', tier: 1, requires: { metrics: [{ metric: 'lvl_combate', value: 25 }], nodes: ['combatiente'] } },
  { id: 'nutricionista', name: 'Nutricionista', icon: '🥗', cat: 'cuerpo', tier: 1, requires: { metrics: [{ metric: 'lvl_nutricion', value: 25 }], nodes: ['saludable'] } },
  { id: 'incansable', name: 'Incansable', icon: '🏃', cat: 'cuerpo', tier: 1, requires: { metrics: [{ metric: 'lvl_resistencia', value: 25 }], nodes: ['resistente'] } },
  { id: 'letrado', name: 'Letrado', icon: '📚', cat: 'mente', tier: 1, requires: { metrics: [{ metric: 'lvl_intelecto', value: 25 }], nodes: ['estudiante'] } },
  { id: 'enfocado', name: 'Enfocado', icon: '🎯', cat: 'mente', tier: 1, requires: { metrics: [{ metric: 'lvl_concentracion', value: 25 }], nodes: ['alerta'] } },
  { id: 'estoico', name: 'Estoico', icon: '🧘', cat: 'mente', tier: 1, requires: { metrics: [{ metric: 'lvl_fortaleza_mental', value: 25 }], nodes: ['sereno'] } },
  { id: 'inversor', name: 'Inversor', icon: '💵', cat: 'finanzas', tier: 1, requires: { metrics: [{ metric: 'lvl_economista', value: 25 }], nodes: ['aprendiz_de_capital'] } },
  { id: 'austero', name: 'Austero', icon: '📊', cat: 'finanzas', tier: 1, requires: { metrics: [{ metric: 'lvl_gerente', value: 25 }], nodes: ['ordenado'] } },
  { id: 'devoto_n', name: 'Devoto', icon: '✝️', cat: 'espiritu', tier: 1, requires: { metrics: [{ metric: 'lvl_fe', value: 25 }], nodes: ['creyente'] } },
  { id: 'companero', name: 'Compañero', icon: '💖', cat: 'vinculos', tier: 1, requires: { metrics: [{ metric: 'lvl_buen_novio', value: 25 }], nodes: ['atento'] } },
  { id: 'hijo_ejemplar', name: 'Hijo Ejemplar', icon: '👨‍👦', cat: 'vinculos', tier: 1, requires: { metrics: [{ metric: 'lvl_buen_hijo', value: 25 }], nodes: ['hijo_presente_n'] } },
  { id: 'padre_felino', name: 'Padre Felino', icon: '🐱', cat: 'vinculos', tier: 1, requires: { metrics: [{ metric: 'lvl_buen_padre', value: 25 }], nodes: ['protector_felino'] } },
  { id: 'ejecutor', name: 'Ejecutor', icon: '🔨', cat: 'trabajo', tier: 1, requires: { metrics: [{ metric: 'lvl_ejecucion', value: 25 }], nodes: ['hacedor'] } },
  { id: 'responsable', name: 'Responsable', icon: '⏰', cat: 'trabajo', tier: 1, requires: { metrics: [{ metric: 'lvl_responsabilidad', value: 25 }], nodes: ['confiable'] } },
  { id: 'programador', name: 'Programador', icon: '🔧', cat: 'trabajo', tier: 1, requires: { metrics: [{ metric: 'lvl_dominio_herramientas', value: 25 }], nodes: ['aprendiz'] } },
  // ── Escalera de patrimonio (paralela, montos en ARS) ──
  { id: 'patrimonio_en_marcha', name: 'Patrimonio en Marcha', icon: '📈', cat: 'patrimonio', tier: 1, requires: { metrics: [{ metric: 'patrimonio', value: 5000000 }] } },
  { id: 'base_solida', name: 'Base Sólida', icon: '📈', cat: 'patrimonio', tier: 1.3, requires: { metrics: [{ metric: 'patrimonio', value: 10000000 }], nodes: ['patrimonio_en_marcha'] } },
  { id: 'capital_creciente', name: 'Capital Creciente', icon: '📈', cat: 'patrimonio', tier: 1.6, requires: { metrics: [{ metric: 'patrimonio', value: 25000000 }], nodes: ['base_solida'] } },
  { id: 'independencia_visible', name: 'Independencia Visible', icon: '💎', cat: 'patrimonio', tier: 2, requires: { metrics: [{ metric: 'patrimonio', value: 50000000 }], nodes: ['capital_creciente'] } },
  { id: 'umbral_de_libertad', name: 'Umbral de Libertad', icon: '💎', cat: 'patrimonio', tier: 2.3, requires: { metrics: [{ metric: 'patrimonio', value: 75000000 }], nodes: ['independencia_visible'] } },
  { id: 'patrimonio_de_elite', name: 'Patrimonio de Élite', icon: '👑', cat: 'patrimonio', tier: 2.6, requires: { metrics: [{ metric: 'patrimonio', value: 100000000 }], nodes: ['umbral_de_libertad'] } },
  // ── TIER 1.5 — Maestría individual (nivel ≥ 50 + nodo Tier 1) ──
  { id: 'hombre_de_titanio', name: 'Hombre de Titanio', icon: '💪', cat: 'cuerpo', tier: 1.5, requires: { metrics: [{ metric: 'lvl_fortaleza_fisica', value: 50 }], nodes: ['hombre_de_acero'] } },
  { id: 'letal', name: 'Letal', icon: '🥊', cat: 'cuerpo', tier: 1.5, requires: { metrics: [{ metric: 'lvl_combate', value: 50 }], nodes: ['veterano_de_combate'] } },
  { id: 'impecable', name: 'Impecable', icon: '🥗', cat: 'cuerpo', tier: 1.5, requires: { metrics: [{ metric: 'lvl_nutricion', value: 50 }], nodes: ['nutricionista'] } },
  { id: 'inagotable', name: 'Inagotable', icon: '🏃', cat: 'cuerpo', tier: 1.5, requires: { metrics: [{ metric: 'lvl_resistencia', value: 50 }], nodes: ['incansable'] } },
  { id: 'jurista', name: 'Jurista', icon: '⚖️', cat: 'mente', tier: 1.5, requires: { metrics: [{ metric: 'lvl_intelecto', value: 50 }], nodes: ['letrado'] } },
  { id: 'imperturbable', name: 'Imperturbable', icon: '🎯', cat: 'mente', tier: 1.5, requires: { metrics: [{ metric: 'lvl_concentracion', value: 50 }], nodes: ['enfocado'] } },
  { id: 'inquebrantable', name: 'Inquebrantable', icon: '🧘', cat: 'mente', tier: 1.5, requires: { metrics: [{ metric: 'lvl_fortaleza_mental', value: 50 }], nodes: ['estoico'] } },
  { id: 'visionario_del_capital', name: 'Visionario del Capital', icon: '💵', cat: 'finanzas', tier: 1.5, requires: { metrics: [{ metric: 'lvl_economista', value: 50 }], nodes: ['inversor'] } },
  { id: 'patrimonial', name: 'Patrimonial', icon: '📊', cat: 'finanzas', tier: 1.5, requires: { metrics: [{ metric: 'lvl_gerente', value: 50 }], nodes: ['austero'] } },
  { id: 'consagrado', name: 'Consagrado', icon: '✝️', cat: 'espiritu', tier: 1.5, requires: { metrics: [{ metric: 'lvl_fe', value: 50 }], nodes: ['devoto_n'] } },
  { id: 'incondicional', name: 'Incondicional', icon: '💖', cat: 'vinculos', tier: 1.5, requires: { metrics: [{ metric: 'lvl_buen_novio', value: 50 }], nodes: ['companero'] } },
  { id: 'hijo_de_honor', name: 'Hijo de Honor', icon: '👨‍👦', cat: 'vinculos', tier: 1.5, requires: { metrics: [{ metric: 'lvl_buen_hijo', value: 50 }], nodes: ['hijo_ejemplar'] } },
  { id: 'guardian_felino', name: 'Guardián Felino', icon: '🐱', cat: 'vinculos', tier: 1.5, requires: { metrics: [{ metric: 'lvl_buen_padre', value: 50 }], nodes: ['padre_felino'] } },
  { id: 'implacable', name: 'Implacable', icon: '🔨', cat: 'trabajo', tier: 1.5, requires: { metrics: [{ metric: 'lvl_ejecucion', value: 50 }], nodes: ['ejecutor'] } },
  { id: 'inflexible', name: 'Inflexible', icon: '⏰', cat: 'trabajo', tier: 1.5, requires: { metrics: [{ metric: 'lvl_responsabilidad', value: 50 }], nodes: ['responsable'] } },
  { id: 'arquitecto_digital', name: 'Arquitecto Digital', icon: '🔧', cat: 'trabajo', tier: 1.5, requires: { metrics: [{ metric: 'lvl_dominio_herramientas', value: 50 }], nodes: ['programador'] } },
  // ── Nodos manuales / libres ──
  { id: 'manejo_de_armas', name: 'Manejo de Armas', icon: '🔫', cat: 'cuerpo', tier: 1, manual: true, requires: {} },
  { id: 'tenencia', name: 'Tenencia', icon: '📜', cat: 'cuerpo', tier: 1.5, manual: true, requires: { nodes: ['manejo_de_armas'] } },
  { id: 'templanza_real', name: 'Templanza Real', icon: '🛡️', cat: 'espiritu', tier: 1, manual: true, requires: {} },
  { id: 'catolico_practicante', name: 'Católico Practicante', icon: '⛪', cat: 'espiritu', tier: 1.5, manual: true, requires: { metrics: [{ metric: 'lvl_fe', value: 25 }] } },
  { id: 'graduado', name: 'Graduado', icon: '🎓', cat: 'mente', tier: 2, requires: { metrics: [{ metric: 'materias', value: 47 }] } },
  { id: 'primer_ingreso_negocio_ia', name: 'Primer Ingreso del Negocio IA', icon: '🤖', cat: 'trabajo', tier: 2, manual: true, requires: {} },
  { id: 'coleccionista', name: 'Coleccionista', icon: '🏅', cat: 'cross', tier: 2, requires: { metrics: [{ metric: 'logros_desbloqueados', value: 50 }] } },
  // ── TIER 2 — Techo de categoría ──
  { id: 'comandante_de_combate', name: 'Comandante de Combate', icon: '🎖️', cat: 'cuerpo', tier: 2, requires: { metrics: [{ metric: 'lvl_combate', value: 50 }], nodes: ['hombre_de_acero', 'veterano_de_combate'] } },
  { id: 'cuerpo_operativo', name: 'Cuerpo Operativo', icon: '🦾', cat: 'cuerpo', tier: 2, requires: { nodes: ['impecable', 'inagotable', 'hombre_de_acero'] } },
  { id: 'mente_templada', name: 'Mente Templada', icon: '🧠', cat: 'mente', tier: 2, requires: { nodes: ['letrado', 'enfocado', 'estoico'] } },
  { id: 'doctor_en_potencia', name: 'Doctor en Potencia', icon: '🎓', cat: 'mente', tier: 2, requires: { metrics: [{ metric: 'materias', value: 35 }], nodes: ['letrado'] } },
  { id: 'forjador_de_riqueza', name: 'Forjador de Riqueza', icon: '🏦', cat: 'finanzas', tier: 2, requires: { nodes: ['inversor', 'austero', 'capital_creciente'] } },
  { id: 'vida_ordenada', name: 'Vida Ordenada', icon: '🕊️', cat: 'espiritu', tier: 2, requires: { nodes: ['devoto_n', 'templanza_real'] } },
  { id: 'pilar_del_hogar', name: 'Pilar del Hogar', icon: '🏡', cat: 'vinculos', tier: 2, requires: { nodes: ['companero', 'hijo_ejemplar', 'padre_felino'] } },
  { id: 'arquitecto_de_sistemas', name: 'Arquitecto de Sistemas', icon: '🏗️', cat: 'trabajo', tier: 2, requires: { nodes: ['ejecutor', 'responsable', 'programador'] } },
  // ── TIER 2.5 — Escalón intermedio de combinación ──
  { id: 'centinela', name: 'Centinela', icon: '🛡️', cat: 'cuerpo', tier: 2.5, requires: { nodes: ['comandante_de_combate', 'manejo_de_armas'] } },
  { id: 'calculador', name: 'Calculador', icon: '🧮', cat: 'mente', tier: 2.5, requires: { nodes: ['mente_templada', 'capital_creciente'] } },
  { id: 'metodico', name: 'Metódico', icon: '📐', cat: 'trabajo', tier: 2.5, requires: { metrics: [{ metric: 'lvl_fortaleza_mental', value: 25 }], nodes: ['responsable'] } },
  { id: 'sosten', name: 'Sostén', icon: '🤝', cat: 'finanzas', tier: 2.5, requires: { nodes: ['forjador_de_riqueza', 'companero'] } },
  { id: 'templado', name: 'Templado', icon: '🔥', cat: 'cuerpo', tier: 2.5, requires: { nodes: ['cuerpo_operativo', 'creyente'] } },
  { id: 'estudioso_del_sistema', name: 'Estudioso del Sistema', icon: '💻', cat: 'mente', tier: 2.5, requires: { nodes: ['letrado', 'programador'] } },
  { id: 'recto', name: 'Recto', icon: '⚖️', cat: 'espiritu', tier: 2.5, requires: { nodes: ['templanza_real', 'ordenado'] } },
  { id: 'presente_en_casa', name: 'Presente en Casa', icon: '🏠', cat: 'vinculos', tier: 2.5, requires: { nodes: ['pilar_del_hogar', 'hacedor'] } },
  { id: 'templado_de_acero', name: 'Templado de Acero', icon: '⚔️', cat: 'cuerpo', tier: 2.5, requires: { nodes: ['comandante_de_combate', 'alerta'] } },
  // ── TIER 3 — Combinaciones cruzadas ──
  { id: 'protector', name: 'Protector', icon: '🛡️', cat: 'cuerpo', tier: 3, requires: { nodes: ['centinela', 'tenencia'] } },
  { id: 'estratega_total', name: 'Estratega Total', icon: '♟️', cat: 'finanzas', tier: 3, requires: { nodes: ['calculador', 'forjador_de_riqueza'] } },
  { id: 'disciplinado', name: 'Disciplinado', icon: '🎯', cat: 'trabajo', tier: 3, requires: { nodes: ['metodico', 'inquebrantable'] } },
  { id: 'proveedor', name: 'Proveedor', icon: '🏆', cat: 'finanzas', tier: 3, requires: { nodes: ['sosten', 'pilar_del_hogar'] } },
  { id: 'resiliente', name: 'Resiliente', icon: '🌟', cat: 'espiritu', tier: 3, requires: { nodes: ['templado', 'devoto_n'] } },
  { id: 'visionario', name: 'Visionario', icon: '🔮', cat: 'trabajo', tier: 3, requires: { nodes: ['estudioso_del_sistema', 'arquitecto_de_sistemas'] } },
  { id: 'sobrio', name: 'Sobrio', icon: '🕊️', cat: 'espiritu', tier: 3, requires: { nodes: ['recto', 'vida_ordenada'] } },
  { id: 'lider_silencioso', name: 'Líder Silencioso', icon: '👑', cat: 'vinculos', tier: 3, requires: { nodes: ['presente_en_casa', 'ejecutor'] } },
  { id: 'inquebrantable_total', name: 'Inquebrantable', icon: '💠', cat: 'mente', tier: 3, requires: { nodes: ['templado_de_acero', 'enfocado'] } },
  // ── TIER 4 — Convergencias mayores ──
  { id: 'hombre_de_familia', name: 'Hombre de Familia', icon: '👨‍👩‍👧', cat: 'cross', tier: 4, requires: { nodes: ['proveedor', 'pilar_del_hogar', 'vida_ordenada'] } },
  { id: 'polimata', name: 'Polímata', icon: '🧠', cat: 'cross', tier: 4, requires: { nodes: ['estratega_total', 'visionario', 'doctor_en_potencia'] } },
  { id: 'guerrero_sabio', name: 'Guerrero Sabio', icon: '⚔️', cat: 'cross', tier: 4, requires: { nodes: ['inquebrantable_total', 'resiliente', 'sobrio'] } },
  // ── TIER 5 — Cima ──
  { id: 'hombre_integro', name: 'Hombre Íntegro', icon: '🏛️', cat: 'cross', tier: 5, requires: { nodes: ['hombre_de_familia', 'polimata', 'guerrero_sabio', 'lider_silencioso'] } },
];
function gmMetric(name) {
  switch (name) {
    case 'boxeo': return gmKwDays(['boxeo', 'box']);
    case 'jujitsu': return gmKwDays(['jujitsu', 'jiu']);
    case 'gym': return gmKwDays(['entrenamiento']);
    case 'caminar': return gmKwDays(['caminar', 'caminata']);
    case 'materias': return gmDoneMaterias().length;
    case 'proyectos': return gmDoneProyectos().length;
    case 'nivel_general': return GM.nivel_general;
    case 'patrimonio': { const nw = gmNwSorted(); return nw.length ? nw[nw.length - 1].value : 0; }
    case 'logros_desbloqueados': return Object.values(GM.logros || {}).filter(l => l && l.desbloqueado).length;
    default:
      if (name.indexOf('lvl_cat_') === 0) return (GM.cats[name.slice(8)] || {}).nivel || 0;
      if (name.indexOf('lvl_') === 0) return (GM.skills[name.slice(4)] || {}).nivel || 0;
      return 0;
  }
}
function gmTreeReqMet(n, unlocked) {
  const r = n.requires || {};
  const mOk = (r.metrics || []).every(c => gmMetric(c.metric) >= c.value);
  const nOk = (r.nodes || []).every(id => unlocked.has(id));
  return mOk && nOk;
}
function gmEvalTree() {
  GM.tree = GM.tree || { unlocked: [], claimed: [] };
  if (!Array.isArray(GM.tree.unlocked)) GM.tree.unlocked = [];
  if (!Array.isArray(GM.tree.claimed)) GM.tree.claimed = [];
  const prev = new Set(GM.tree.unlocked);
  const unlocked = new Set();
  let changed = true, guard = 0;
  while (changed && guard++ < 30) {
    changed = false;
    GM_TREE_NODES.forEach(n => {
      if (unlocked.has(n.id)) return;
      const claimOk = n.manual ? GM.tree.claimed.includes(n.id) : true;
      if (claimOk && gmTreeReqMet(n, unlocked)) { unlocked.add(n.id); changed = true; }
    });
  }
  GM.tree.unlocked = GM_TREE_NODES.filter(n => unlocked.has(n.id)).map(n => n.id);
  _gmNewTreeNodes = GM.tree.unlocked.filter(id => !prev.has(id)).map(id => GM_TREE_NODES.find(n => n.id === id)).filter(Boolean);
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
  _gmLevelUps = []; _gmNewLogros = []; _gmNewTreeNodes = [];
  const today = getActiveDate();
  const firstRun = !GM.ultima_actualizacion;
  const oldSkill = {}; GM_SKILLS.forEach(s => oldSkill[s.id] = (GM.skills[s.id] || {}).nivel || 1);

  gmRecalcSkillsAndCats();
  gmRecalcGeneral();      // antes de los logros: los logros de nivel general dependen de esto
  gmRecalcTitulo();
  gmCountPerfectDays();
  gmBuildDailyMissions(today);
  gmBuildWeeklyMissions(today);
  gmBuildEpicMissions(today);
  gmCheckLogros();
  gmEvalTree();
  gmCheckBuffs();
  gmMaybeSnapshot(today);

  if (!firstRun) GM_SKILLS.forEach(s => { const nv = (GM.skills[s.id] || {}).nivel || 1; if (nv > oldSkill[s.id]) _gmLevelUps.push({ skill: s.id, to: nv }); });
  else { _gmNewLogros = []; _gmNewTreeNodes = []; }
  GM.ultima_actualizacion = today;
  gmSave();
}
