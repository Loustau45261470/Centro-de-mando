// ════════════════════════════════════════════════════════
// GYM TAB — WEIGHT & PHYSIQUE
// ════════════════════════════════════════════════════════
function renderSaludTab() {
  renderRutinas();
  renderEntrenamientoResumen();
  renderDieta();
  renderDietaResumen();
}

// ── Resumen de entrenamiento (sección) · el detalle completo vive en el overlay ──
function _gymDays() {
  const h = (S.habitTrackers && S.habitTrackers.salud || []).find(x => x.id === 'habit-entrenamientos');
  return (h && h.days) || (S.workoutCalendar && S.workoutCalendar.days) || {};
}
function renderEntrenamientoResumen() {
  const body = document.getElementById('entrenoResumenBody'); if (!body) return;
  const days = _gymDays();
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
  const pct = Math.round(typeof achGymMonthPct === 'function' ? achGymMonthPct(y, m) : 0);
  let doneMonth = 0;
  for (let d = 1; d <= today; d++) if (days[_dStr(y, m, d)] === 'done') doneMonth++;
  // Racha de días: cuenta 'done' consecutivos; 'rest' no corta; hoy vacío no corta.
  let dayStreak = 0;
  for (let i = 0; i < 400; i++) {
    const dd = new Date(y, m, today - i), ds = _dStr(dd.getFullYear(), dd.getMonth(), dd.getDate()), v = days[ds];
    if (v === 'done') dayStreak++;
    else if (v === 'rest') continue;
    else { if (i === 0) continue; break; }
  }
  // Tira últimos 7 días
  const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const strip = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(y, m, today - i), ds = _dStr(dd.getFullYear(), dd.getMonth(), dd.getDate());
    strip.push({ v: days[ds] || '', lbl: DOW[dd.getDay()] });
  }
  const streakMonths = typeof achGymStreak75 === 'function' ? achGymStreak75() : 0;
  const logDates = Object.keys(S.workoutLog || {}).filter(d => Object.values(S.workoutLog[d] || {}).some(s => s && s.length)).sort();
  const last = logDates[logDates.length - 1];
  let lastTxt = 'Sin registros';
  if (last) { const exCount = Object.values(S.workoutLog[last]).filter(s => s && s.length).length; lastTxt = `${fmtDate(last)} · ${exCount} ej.`; }

  body.innerHTML = `
    <div class="ent-kpis">
      <div class="ent-kpi"><div class="ent-kpi-num">${dayStreak}</div><div class="ent-kpi-lbl">Racha días</div></div>
      <div class="ent-kpi"><div class="ent-kpi-num">${doneMonth}</div><div class="ent-kpi-lbl">Este mes</div></div>
      <div class="ent-kpi"><div class="ent-kpi-num">${pct}<span class="ent-kpi-u">%</span></div><div class="ent-kpi-lbl">Adherencia</div></div>
      <div class="ent-kpi"><div class="ent-kpi-num">${streakMonths}</div><div class="ent-kpi-lbl">Meses ≥75%</div></div>
    </div>
    <div class="ent-week">${strip.map(s => `<div class="ent-day ent-${s.v || 'none'}"><span class="ent-day-dot"></span><span class="ent-day-lbl">${s.lbl}</span></div>`).join('')}</div>
    <div class="ent-last">Último entreno: <b>${lastTxt}</b></div>
    <button class="ent-full" onclick="if(window.openGymOverlay)openGymOverlay()">Abrir entrenamiento completo →</button>`;
}

// ════════════════════════════════════════════════════════
// RUTINAS
// ════════════════════════════════════════════════════════

function initRoutines() {
  if (!S.routines) {
    S.routines = [
      { id: 'rtn_push', name: 'Push', icon: '💪', exercises: [] },
      { id: 'rtn_pull', name: 'Pull', icon: '🔗', exercises: [] },
      { id: 'rtn_legs', name: 'Legs', icon: '🦵', exercises: [] }
    ];
    saveState();
  }
  if (!S.routineLog) { S.routineLog = {}; saveState(); }
  if (S.activeRtnSession === undefined) { S.activeRtnSession = null; saveState(); }

  // Pre-populate Push with reference session if still empty
  const push = S.routines.find(r => r.id === 'rtn_push');
  if (push && push.exercises.length === 0) {
    const exs = [
      { id:'px1', name:'Press de Pecho Inclinado', equipment:'Máquina',      restSecs:210, notes:'' },
      { id:'px2', name:'Aperturas de Pecho Sentado', equipment:'Cable',      restSecs:165, notes:'' },
      { id:'px3', name:'Elevación Laterales',        equipment:'Cable',      restSecs:165, notes:'' },
      { id:'px4', name:'Extensión de Tríceps',       equipment:'Cable',      restSecs:210, notes:'Sentado en banco. Cuerda corta pero gruesa.' },
      { id:'px5', name:'Tríceps con Polea',          equipment:'Cable',      restSecs:210, notes:'' },
      { id:'px6', name:'Press de Hombros',           equipment:'Mancuerna',  restSecs:210, notes:'' },
      { id:'px7', name:'Abdominal Corto',            equipment:'Cable',      restSecs:165, notes:'' },
      { id:'px8', name:'Curl de Bíceps Detrás de Espalda', equipment:'Barra', restSecs:150, notes:'' }
    ];
    push.exercises = exs;
    if (!S.routineLog['rtn_push']) S.routineLog['rtn_push'] = [];
    const refSets = {
      px1: [{weight:60,reps:8},{weight:60,reps:7},{weight:60,reps:7}],
      px2: [{weight:5,reps:8},{weight:5,reps:6}],
      px3: [{weight:2.5,reps:10},{weight:1.25,reps:12},{weight:1.25,reps:9},{weight:1.25,reps:10}],
      px4: [{weight:12.5,reps:10},{weight:10,reps:10}],
      px5: [{weight:15,reps:10},{weight:15,reps:9}],
      px6: [{weight:15,reps:18},{weight:15,reps:16}],
      px7: [{weight:10,reps:20},{weight:10,reps:15}],
      px8: [{weight:15,reps:15},{weight:10,reps:14},{weight:10,reps:10}]
    };
    let vol = 0, totalSets = 0;
    Object.values(refSets).forEach(sets => sets.forEach(s => { vol += s.weight * s.reps; totalSets++; }));
    S.routineLog['rtn_push'].push({
      id: 'log_push_ref', date: '2026-06-07',
      exSets: refSets, vol, sets: totalSets, duration: 3600
    });
    saveState();
  }

  // Pre-populate Pull with reference session if still empty
  const pull = S.routines.find(r => r.id === 'rtn_pull');
  if (pull && pull.exercises.length === 0) {
    pull.exercises = [
      { id:'pl1', name:'Jalón al Pecho',                       equipment:'Cable',     restSecs:210, notes:'Straps, peso bajo. Rotar codos para adentro.' },
      { id:'pl2', name:'Remo Sentado con Agarre en V',         equipment:'Cable',     restSecs:210, notes:'' },
      { id:'pl3', name:'Remo Bajo Iso-Lateral',                equipment:'Máquina',   restSecs:210, notes:'Straps. Agarre cerrado. Altura 3/4.' },
      { id:'pl4', name:'Tirón a la Cara',                      equipment:'Cable',     restSecs:150, notes:'Apoyo en banco.' },
      { id:'pl5', name:'Encogimiento de Hombros',              equipment:'Mancuerna', restSecs:165, notes:'Straps. Aumentar peso.' },
      { id:'pl6', name:'Curl Martillo',                        equipment:'Cable',     restSecs:240, notes:'Unilateral. Inclinado hacia adelante. Brazo por delante.' },
      { id:'pl7', name:'Curl Predicador',                      equipment:'Mancuerna', restSecs:210, notes:'Apreta tu brazo contra el banco.' },
      { id:'pl8', name:'Curl por Detrás de la Espalda',        equipment:'Cable',     restSecs:165, notes:'Proba sentado en un banco.' },
      { id:'pl9', name:'Curl de Bíceps Detrás de Espalda',     equipment:'Barra',     restSecs:150, notes:'' }
    ];
    if (!S.routineLog['rtn_pull']) S.routineLog['rtn_pull'] = [];
    const pullSets = {
      pl1: [{weight:50,reps:10},{weight:45,reps:10},{weight:45,reps:8}],
      pl2: [{weight:40,reps:8},{weight:30,reps:10}],
      pl3: [{weight:50,reps:12},{weight:50,reps:9},{weight:50,reps:7},{weight:30,reps:9}],
      pl4: [{weight:12.5,reps:16},{weight:12.5,reps:12}],
      pl5: [{weight:12.5,reps:25},{weight:12.5,reps:17},{weight:12.5,reps:20}],
      pl6: [{weight:2.5,reps:20},{weight:2.5,reps:16}],
      pl7: [{weight:12.5,reps:8},{weight:12.5,reps:6}],
      pl8: [{weight:5,reps:8}],
      pl9: [{weight:15,reps:10},{weight:10,reps:14},{weight:10,reps:9}]
    };
    let vol = 0, totalSets = 0;
    Object.values(pullSets).forEach(sets => sets.forEach(s => { vol += s.weight * s.reps; totalSets++; }));
    S.routineLog['rtn_pull'].push({
      id: 'log_pull_ref', date: '2026-06-07',
      exSets: pullSets, vol, sets: totalSets, duration: 4200
    });
    saveState();
  }

  // Pre-populate Legs with reference session if still empty
  const legs = S.routines.find(r => r.id === 'rtn_legs');
  if (legs && legs.exercises.length === 0) {
    legs.exercises = [
      { id:'lg1', name:'Impulso de Cadera',             equipment:'Máquina', restSecs:210, notes:'Si o si con colchoneta. Altura 3.' },
      { id:'lg2', name:'Elevación de Gemelos de Pie',   equipment:'Máquina', restSecs:180, notes:'' },
      { id:'lg3', name:'Sentadilla',                    equipment:'Máquina', restSecs:210, notes:'' },
      { id:'lg4', name:'Extensión de Pierna',           equipment:'Máquina', restSecs:240, notes:'' },
      { id:'lg5', name:'Aducción de Caderas',           equipment:'Máquina', restSecs:210, notes:'No apoyar pies. Pegado al banco.' },
      { id:'lg6', name:'Curl de Piernas Acostado',      equipment:'Máquina', restSecs:210, notes:'Probar unilateral.' }
    ];
    if (!S.routineLog['rtn_legs']) S.routineLog['rtn_legs'] = [];
    const legsSets = {
      lg1: [{weight:40,reps:14},{weight:40,reps:12},{weight:40,reps:9},{weight:30,reps:12}],
      lg2: [{weight:100,reps:22},{weight:100,reps:16},{weight:100,reps:14},{weight:100,reps:12}],
      lg3: [{weight:60,reps:10},{weight:60,reps:9},{weight:40,reps:12}],
      lg4: [{weight:60,reps:9},{weight:50,reps:10},{weight:50,reps:8}],
      lg5: [{weight:50,reps:10},{weight:50,reps:8}],
      lg6: [{weight:30,reps:12},{weight:30,reps:10}]
    };
    let vol = 0, totalSets = 0;
    Object.values(legsSets).forEach(sets => sets.forEach(s => { vol += s.weight * s.reps; totalSets++; }));
    S.routineLog['rtn_legs'].push({
      id: 'log_legs_ref', date: '2026-06-07',
      exSets: legsSets, vol, sets: totalSets, duration: 3900
    });
    saveState();
  }

  migrateExerciseLibrary();
  seedLibraryExtras();
}

// ── Biblioteca de ejercicios ──────────────────────────────
// Mapa duro instancia→músculo de los seeds originales (usado por la migración
// y como fallback en la distribución muscular para ids viejos ya borrados).
const RTN_HARD_MUSCLE = {
  px1:'Pecho', px2:'Pecho', px3:'Hombro lateral', px4:'Tríceps', px5:'Tríceps',
  px6:'Hombro frontal', px7:'Abdomen', px8:'Antebrazos',
  pl1:'Espalda', pl2:'Espalda', pl3:'Espalda', pl4:'Hombro posterior',
  pl5:'Trapecio', pl6:'Bíceps', pl7:'Bíceps', pl8:'Antebrazos', pl9:'Bíceps',
  lg1:'Glúteo', lg2:'Pantorrillas', lg3:'Cuádriceps', lg4:'Cuádriceps',
  lg5:'Aductores', lg6:'Femorales'
};

// Vocabulario de grupos musculares para la biblioteca (alineado al heatmap).
const LIB_MUSCLES = ['Pecho','Espalda','Hombro frontal','Hombro lateral','Hombro posterior',
  'Trapecio','Bíceps','Tríceps','Antebrazos','Abdomen','Core',
  'Cuádriceps','Femorales','Glúteo','Aductores','Pantorrillas','Sin clasificar'];

const LIB_EQUIPMENT = ['Mancuerna','Barra','Máquina','Cable','Peso corporal'];

function exLibById(libId) { return (S.exerciseLibrary || []).find(e => e.id === libId); }

// Resuelve un ejercicio de rutina (nueva forma {id,libId,restSecs,sets}) a un objeto
// display combinando la biblioteca con los overrides de la rutina.
function exDisplay(ex) {
  const lib = exLibById(ex.libId) || {};
  return {
    id: ex.id,
    libId: ex.libId,
    name: lib.name || ex.name || 'Ejercicio',
    equipment: lib.equipment || ex.equipment || '—',
    muscle: lib.muscle || 'Sin clasificar',
    notes: lib.notes || ex.notes || '',
    restSecs: (ex.restSecs != null ? ex.restSecs : (lib.defaultRestSecs != null ? lib.defaultRestSecs : 90)),
    sets: (ex.sets != null ? ex.sets : (lib.defaultSets != null ? lib.defaultSets : 4))
  };
}

// Resuelve una instancia de la sesión activa (via exMeta) a objeto display.
function sessExInfo(id) {
  const meta = (S.activeRtnSession && S.activeRtnSession.exMeta && S.activeRtnSession.exMeta[id]) || {};
  const lib = exLibById(meta.libId) || {};
  return {
    id,
    libId: meta.libId,
    name: lib.name || 'Ejercicio',
    equipment: lib.equipment || '—',
    notes: lib.notes || '',
    restSecs: (meta.restSecs != null ? meta.restSecs : (lib.defaultRestSecs != null ? lib.defaultRestSecs : 90))
  };
}

const _libDedupKey = (name, equip) =>
  (name || '').trim().toLowerCase() + '|' + (equip || '').trim().toLowerCase();

// Migración idempotente: ejercicios de rutinas → biblioteca, sin pérdida de historial.
function migrateExerciseLibrary() {
  if (!S.exerciseLibrary) S.exerciseLibrary = [];
  if (!S.exerciseHistory) S.exerciseHistory = {};
  if (S._libMigrated) return;

  const byKey = {};
  S.exerciseLibrary.forEach(l => { byKey[_libDedupKey(l.name, l.equipment)] = l; });
  const idMap = {};  // oldInstanceId → libId

  // 1. Poblar biblioteca deduplicando por nombre+equipo
  (S.routines || []).forEach(r => {
    (r.exercises || []).forEach(ex => {
      if (ex.libId) { idMap[ex.id] = ex.libId; return; }  // ya en forma nueva: preservar vínculo
      const key = _libDedupKey(ex.name, ex.equipment);
      let lib = byKey[key];
      if (!lib) {
        lib = {
          id: 'lib_' + uid(),
          name: ex.name || 'Ejercicio',
          equipment: ex.equipment || 'Mancuerna',
          muscle: RTN_HARD_MUSCLE[ex.id] || 'Sin clasificar',
          defaultRestSecs: ex.restSecs != null ? ex.restSecs : 90,
          defaultSets: 4,
          notes: ex.notes || '',
          archived: false
        };
        byKey[key] = lib;
        S.exerciseLibrary.push(lib);
      } else {
        if (!lib.notes && ex.notes) lib.notes = ex.notes;
        if ((!lib.muscle || lib.muscle === 'Sin clasificar') && RTN_HARD_MUSCLE[ex.id]) lib.muscle = RTN_HARD_MUSCLE[ex.id];
      }
      idMap[ex.id] = lib.id;
    });
  });

  // 2. Reescribir cada ejercicio de rutina a la forma nueva (mismo id de instancia)
  (S.routines || []).forEach(r => {
    r.exercises = (r.exercises || []).map(ex => {
      if (ex.libId) return ex;  // ya en forma nueva: no tocar
      const lib = exLibById(idMap[ex.id]) || {};
      return {
        id: ex.id,
        libId: idMap[ex.id],
        restSecs: ex.restSecs != null ? ex.restSecs : (lib.defaultRestSecs || 90),
        sets: 4
      };
    });
  });

  // 3. Re-vincular el historial previo (routineLog) al libId correcto
  Object.entries(S.routineLog || {}).forEach(([rtnId, entries]) => {
    (entries || []).forEach(entry => {
      if (!entry.exSets) return;
      Object.entries(entry.exSets).forEach(([oldExId, sets]) => {
        const libId = idMap[oldExId];
        if (!libId || !sets || !sets.length) return;
        const cleanSets = sets
          .filter(s => (s.reps || 0) > 0)
          .map(s => ({ weight: s.weight || 0, reps: s.reps }));
        if (!cleanSets.length) return;
        if (!S.exerciseHistory[libId]) S.exerciseHistory[libId] = [];
        S.exerciseHistory[libId].push({ date: entry.date, routineId: rtnId, sets: cleanSets });
      });
    });
  });
  Object.values(S.exerciseHistory).forEach(arr => arr.sort((a, b) => (a.date || '').localeCompare(b.date || '')));

  S._libMigrated = true;
  saveState();
}

// Seed de ejercicios precargados para completar los grupos musculares principales.
function seedLibraryExtras() {
  if (S._libSeeded) return;
  if (!S.exerciseLibrary) S.exerciseLibrary = [];
  const existing = new Set(S.exerciseLibrary.map(l => _libDedupKey(l.name, l.equipment)));
  const SEED = [
    // Pecho
    { name:'Press Plano con Barra',        equipment:'Barra',        muscle:'Pecho',           rest:180 },
    { name:'Press Inclinado con Mancuernas', equipment:'Mancuerna',  muscle:'Pecho',           rest:150 },
    { name:'Fondos en Paralelas',          equipment:'Peso corporal',muscle:'Pecho',           rest:150 },
    { name:'Pec Deck',                     equipment:'Máquina',      muscle:'Pecho',           rest:120 },
    // Espalda
    { name:'Dominadas',                    equipment:'Peso corporal',muscle:'Espalda',         rest:180 },
    { name:'Remo con Barra',               equipment:'Barra',        muscle:'Espalda',         rest:180 },
    { name:'Remo con Mancuerna',           equipment:'Mancuerna',    muscle:'Espalda',         rest:150 },
    { name:'Pull-Over en Polea',           equipment:'Cable',        muscle:'Espalda',         rest:120 },
    // Hombros
    { name:'Press Militar con Barra',      equipment:'Barra',        muscle:'Hombro frontal',  rest:180 },
    { name:'Elevaciones Laterales con Mancuernas', equipment:'Mancuerna', muscle:'Hombro lateral', rest:90 },
    { name:'Pájaros con Mancuernas',       equipment:'Mancuerna',    muscle:'Hombro posterior',rest:90 },
    { name:'Press Arnold',                 equipment:'Mancuerna',    muscle:'Hombro frontal',  rest:150 },
    // Bíceps
    { name:'Curl con Barra',               equipment:'Barra',        muscle:'Bíceps',          rest:120 },
    { name:'Curl Alternado con Mancuernas',equipment:'Mancuerna',    muscle:'Bíceps',          rest:90 },
    { name:'Curl en Banco Scott',          equipment:'Máquina',      muscle:'Bíceps',          rest:120 },
    // Tríceps
    { name:'Press Francés con Barra',      equipment:'Barra',        muscle:'Tríceps',         rest:120 },
    { name:'Extensión de Tríceps en Polea',equipment:'Cable',        muscle:'Tríceps',         rest:120 },
    { name:'Fondos entre Bancos',          equipment:'Peso corporal',muscle:'Tríceps',         rest:120 },
    // Cuádriceps
    { name:'Sentadilla con Barra',         equipment:'Barra',        muscle:'Cuádriceps',      rest:210 },
    { name:'Prensa de Piernas',            equipment:'Máquina',      muscle:'Cuádriceps',      rest:180 },
    { name:'Zancadas con Mancuernas',      equipment:'Mancuerna',    muscle:'Cuádriceps',      rest:150 },
    // Femorales
    { name:'Peso Muerto Rumano',           equipment:'Barra',        muscle:'Femorales',       rest:210 },
    { name:'Curl Femoral Sentado',         equipment:'Máquina',      muscle:'Femorales',       rest:150 },
    // Glúteos
    { name:'Hip Thrust con Barra',         equipment:'Barra',        muscle:'Glúteo',          rest:180 },
    { name:'Patada de Glúteo en Polea',    equipment:'Cable',        muscle:'Glúteo',          rest:120 },
    // Core
    { name:'Plancha',                      equipment:'Peso corporal',muscle:'Core',            rest:60 },
    { name:'Rueda Abdominal',              equipment:'Peso corporal',muscle:'Core',            rest:90 },
    { name:'Crunch en Polea',              equipment:'Cable',        muscle:'Abdomen',         rest:90 },
    // Pantorrillas
    { name:'Elevación de Talones Sentado', equipment:'Máquina',      muscle:'Pantorrillas',    rest:90 }
  ];
  SEED.forEach(s => {
    const key = _libDedupKey(s.name, s.equipment);
    if (existing.has(key)) return;
    S.exerciseLibrary.push({
      id: 'lib_' + uid(), name: s.name, equipment: s.equipment, muscle: s.muscle,
      defaultRestSecs: s.rest || 120, defaultSets: s.sets || 4, notes: '', archived: false
    });
    existing.add(key);
  });
  S._libSeeded = true;
  saveState();
}

function fmtRestTime(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
}

function renderRutinas() {
  initRoutines();
  const wrap = document.getElementById('rutinas-wrap');
  if (!wrap) return;
  if (S.activeRtnSession) { renderActiveSession(); return; }

  const cards = S.routines.map(r => {
    const hist = S.routineLog[r.id] || [];
    const last = hist[hist.length - 1];

    const lastDateLabel = last ? `<span style="font-family:var(--mono);font-size:11px;color:var(--tt);flex-shrink:0;margin-right:6px">${last.date.slice(5)}</span>` : '';

    const exListHtml = r.exercises.length
      ? r.exercises.map(exRaw => { const ex = exDisplay(exRaw); return `
          <div class="rtn-ex-row">
            <span class="rtn-equip-tag">${ex.equipment}</span>
            <span class="rtn-ex-name" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" onclick="event.stopPropagation();openExHistByLib('${ex.libId}')">${ex.name}</span>
            <span class="rtn-ex-rest">⏱ ${fmtRestTime(ex.restSecs)}</span>
            <button class="icon-btn" onclick="event.stopPropagation();editRtnEx('${r.id}','${ex.id}')" style="color:var(--tt);flex-shrink:0">
              <svg viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" onclick="event.stopPropagation();deleteRtnEx('${r.id}','${ex.id}')" style="color:var(--tt);flex-shrink:0">
              <svg viewBox="0 0 24 24" style="width:15px;height:15px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>`; }).join('')
      : '<p class="text-xs text-ter" style="padding:8px 0">Sin ejercicios. Agregá uno abajo.</p>';

    return `
      <div class="rtn-card" id="rtn-card-${r.id}">
        <div class="rtn-header" onclick="toggleRutina('${r.id}')">
          <span class="rtn-icon">${r.icon}</span>
          <div class="rtn-info">
            <div class="rtn-name">${r.name}</div>
            <div class="rtn-preview" style="margin-top:1px;font-size:11px;color:var(--tt)">${r.exercises.length} ejercicios</div>
          </div>
          <button class="icon-btn" onclick="event.stopPropagation();openEditRoutine('${r.id}')" style="color:var(--tt);flex-shrink:0">
            <svg viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost" onclick="event.stopPropagation();openExPicker('add','${r.id}')" style="font-size:10px;padding:2px 7px;flex-shrink:0;line-height:1.4">+ Ej</button>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();startRutinaSession('${r.id}')" style="flex-shrink:0">▶ Empezar</button>
          <span class="rtn-chevron">▾</span>
        </div>
        <div class="rtn-body">
          <div class="rtn-ex-list">${exListHtml}</div>
        </div>
      </div>`;
  }).join('');

  // ── Estadísticas aggregates ──
  const _allLog = S.routines.map(r => ({ rtn: r, hist: S.routineLog[r.id] || [] }));
  const _periodDays = { mes: 30, trimestre: 90, semestre: 180, año: 365 };
  const _cutoff = new Date(); _cutoff.setDate(_cutoff.getDate() - _periodDays[_statsPeriod]);
  const _cutoffStr = _cutoff.toISOString().slice(0, 10);
  const _filtLog = _allLog.map(({rtn, hist}) => ({ rtn, hist: hist.filter(e => e.date >= _cutoffStr) }));

  const _totalSess = _filtLog.reduce((a, {hist}) => a + hist.length, 0);
  const _totalVol  = _filtLog.reduce((a, {hist}) => a + hist.reduce((b, e) => b + (e.vol || 0), 0), 0);
  const _totalSets = _filtLog.reduce((a, {hist}) => a + hist.reduce((b, e) => b + (e.sets || 0), 0), 0);
  const _totalTime = _filtLog.reduce((a, {hist}) => a + hist.reduce((b, e) => b + (e.duration || 0), 0), 0);
  const _th = Math.floor(_totalTime / 3600);
  const _tm = Math.floor((_totalTime % 3600) / 60);
  const _timeStr = _totalTime === 0 ? '—' : (_th > 0 ? `${_th}h ${_tm}m` : `${_tm}m`);
  const _volStr = _totalVol === 0 ? '0' : _totalVol >= 1000 ? `${(_totalVol/1000).toFixed(1)}t` : _totalVol.toLocaleString();

  // Mapa instancia→músculo: base dura (ids viejos ya borrados) + músculo actual
  // de cada ejercicio de rutina resuelto vía biblioteca.
  const _muscleMap = { ...RTN_HARD_MUSCLE };
  S.routines.forEach(r => (r.exercises || []).forEach(ex => {
    const lib = exLibById(ex.libId);
    if (lib && lib.muscle && lib.muscle !== 'Sin clasificar') _muscleMap[ex.id] = lib.muscle;
  }));
  const _muscleCounts = {};
  const _muscleStats = {};   // { músculo: { sets, vol, dates:Set, last } }
  _filtLog.forEach(({hist}) => {
    hist.forEach(entry => {
      if (!entry.exSets) return;
      Object.entries(entry.exSets).forEach(([exId, sets]) => {
        const m = _muscleMap[exId];
        if (!m) return;
        _muscleCounts[m] = (_muscleCounts[m] || 0) + sets.length;
        if (!_muscleStats[m]) _muscleStats[m] = { sets: 0, vol: 0, dates: new Set(), last: '' };
        const ms = _muscleStats[m];
        ms.sets += sets.length;
        sets.forEach(s => { ms.vol += (s.weight || 0) * (s.reps || 0); });
        ms.dates.add(entry.date);
        if (entry.date > ms.last) ms.last = entry.date;
      });
    });
  });
  const _muscleArr = Object.entries(_muscleCounts).sort((a, b) => b[1] - a[1]);
  const _muscleTotal = _muscleArr.reduce((a, [, n]) => a + n, 0);
  // Exponer datos para el escáner interactivo (popover por músculo)
  window.SCAN_DATA = {
    counts: _muscleCounts,
    max: Math.max(...Object.values(_muscleCounts), 1),
    period: _statsPeriod,
    stats: Object.fromEntries(Object.entries(_muscleStats).map(([m, s]) =>
      [m, { sets: s.sets, vol: s.vol, sessions: s.dates.size, last: s.last }]))
  };

  // ── Records computation ──
  const _recMap = {};
  _filtLog.forEach(({hist}) => {
    hist.forEach(entry => {
      if (!entry.exSets) return;
      Object.entries(entry.exSets).forEach(([exId, sets]) => {
        if (!sets.length) return;
        if (!_recMap[exId]) _recMap[exId] = { maxWeight: 0, maxReps: 0, maxVol: 0, maxWeightDate: '', maxRepsDate: '', maxVolDate: '' };
        const rec = _recMap[exId];
        sets.forEach(s => {
          if ((s.weight || 0) > rec.maxWeight) { rec.maxWeight = s.weight; rec.maxWeightDate = entry.date; }
          if ((s.reps || 0) > rec.maxReps) { rec.maxReps = s.reps; rec.maxRepsDate = entry.date; }
          const setVol = (s.weight || 0) * (s.reps || 0);
          if (setVol > rec.maxVol) { rec.maxVol = setVol; rec.maxVolDate = entry.date; }
        });
      });
    });
  });
  const _recArr = [];
  S.routines.forEach(r => r.exercises.forEach(exRaw => {
    if (_recMap[exRaw.id]) _recArr.push({ name: exDisplay(exRaw).name, ..._recMap[exRaw.id] });
  }));

  const statsBodyHtml = `
    <div style="padding:12px 14px 16px">
      <div style="display:flex;gap:4px;margin-bottom:14px">
        ${['mes','trimestre','semestre','año'].map(p => `<button onclick="setStatsPeriod('${p}')" style="flex:1;padding:5px 0;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;border-radius:6px;border:1px solid ${_statsPeriod===p ? 'var(--c-salud)' : 'var(--border)'};background:${_statsPeriod===p ? 'rgba(244,63,94,.12)' : 'transparent'};color:${_statsPeriod===p ? 'var(--c-salud)' : 'var(--tt)'};cursor:pointer">${p}</button>`).join('')}
      </div>
      <div style="margin-bottom:14px">
        <div onclick="toggleMuscleDist()" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:6px;user-select:none">
          <span id="muscle-dist-chev" style="font-size:10px;color:var(--tt);display:inline-block;transition:transform .2s;transform:${_muscleDistOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}">▾</span>
          <span style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tt)">Distribución muscular</span>
        </div>
        <div id="muscle-dist-body" style="display:${_muscleDistOpen ? 'block' : 'none'}">
          ${_muscleArr.length === 0
            ? `<p style="font-size:12px;color:var(--tt);margin:0">Sin datos en este período.</p>`
            : '<div class="scan-duo">' + buildSpinViewer() + buildMuscleHeatmap(_muscleCounts) + '</div>' + _muscleArr.map(([muscle, count]) => {
                const pct = Math.round(count / _muscleTotal * 100);
                const hc = muscleHeatColor(Math.round(count / Math.max(...Object.values(_muscleCounts), 1) * 100));
                return `<div style="margin-bottom:6px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:2px">
                    <span style="font-size:11px;color:var(--fg)">${muscle}</span>
                    <span style="font-family:var(--mono);font-size:10px;color:var(--tt)">${pct}%</span>
                  </div>
                  <div style="height:3px;background:var(--border);border-radius:2px">
                    <div style="height:100%;width:${pct}%;background:${hc.fill.replace(/[\d.]+\)$/, '0.9)')};border-radius:2px;transition:width .4s"></div>
                  </div>
                </div>`;
              }).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
        <div style="background:var(--bg2);border-radius:10px;padding:10px 12px">
          <div style="font-family:var(--mono);font-size:22px;font-weight:800;color:var(--c-salud);line-height:1">${_totalSess}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin-top:5px">Entrenamientos</div>
        </div>
        <div style="background:var(--bg2);border-radius:10px;padding:10px 12px">
          <div style="font-family:var(--mono);font-size:${_totalVol >= 10000 ? 16 : 22}px;font-weight:800;color:var(--c-salud);line-height:1">${_volStr}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin-top:5px">Volumen kg</div>
        </div>
        <div style="background:var(--bg2);border-radius:10px;padding:10px 12px">
          <div style="font-family:var(--mono);font-size:22px;font-weight:800;color:var(--c-salud);line-height:1">${_totalSets}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin-top:5px">Series</div>
        </div>
        <div style="background:var(--bg2);border-radius:10px;padding:10px 12px">
          <div style="font-family:var(--mono);font-size:22px;font-weight:800;color:var(--c-salud);line-height:1">${_timeStr}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tt);margin-top:5px">Tiempo</div>
        </div>
      </div>
      <div style="margin-top:16px">
        <div onclick="toggleRecords()" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:6px;user-select:none">
          <span id="records-chev" style="font-size:10px;color:var(--tt);display:inline-block;transition:transform .2s;transform:${_recordsOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}">▾</span>
          <span style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tt)">Records</span>
        </div>
        <div id="records-body" style="display:${_recordsOpen ? 'block' : 'none'}">
          ${_recArr.length === 0
            ? `<p style="font-size:12px;color:var(--tt);margin:0">Sin datos en este período.</p>`
            : _recArr.map(rec => `
              <div style="padding:9px 0;border-top:1px solid var(--border)">
                <div style="font-size:11px;font-weight:700;color:var(--fg);margin-bottom:6px">${rec.name}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
                  <div>
                    <div style="font-family:var(--mono);font-size:14px;font-weight:800;color:var(--c-salud);line-height:1">${rec.maxWeight}<span style="font-size:9px;font-weight:400"> kg</span></div>
                    <div style="font-size:9px;color:var(--tt);margin-top:2px">${rec.maxWeightDate ? rec.maxWeightDate.slice(5) : '—'} · peso</div>
                  </div>
                  <div>
                    <div style="font-family:var(--mono);font-size:14px;font-weight:800;color:var(--c-salud);line-height:1">${rec.maxReps}<span style="font-size:9px;font-weight:400"> reps</span></div>
                    <div style="font-size:9px;color:var(--tt);margin-top:2px">${rec.maxRepsDate ? rec.maxRepsDate.slice(5) : '—'} · reps</div>
                  </div>
                  <div>
                    <div style="font-family:var(--mono);font-size:14px;font-weight:800;color:var(--c-salud);line-height:1">${rec.maxVol >= 1000 ? (rec.maxVol/1000).toFixed(1)+'<span style="font-size:9px;font-weight:400">t</span>' : rec.maxVol+'<span style="font-size:9px;font-weight:400"> kg</span>'}</div>
                    <div style="font-size:9px;color:var(--tt);margin-top:2px">${rec.maxVolDate ? rec.maxVolDate.slice(5) : '—'} · kg×reps</div>
                  </div>
                </div>
              </div>`).join('')}
        </div>
      </div>
    </div>`;

  const _rutinaOpen = _rtnSections.has('rutinas');
  const _statsOpen  = _rtnSections.has('estadisticas');
  const _libOpen    = _rtnSections.has('biblioteca');

  wrap.innerHTML = `
    <div class="card">
      <div class="card-title">🏋️ Entrenamiento</div>
      <div class="rtn-section-hdr" onclick="toggleRtnSection('rutinas')">
        <span id="rtn-section-chev-rutinas" style="display:inline-block;transition:transform .2s;transform:${_rutinaOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}">▾</span>
        <span style="flex:1">Rutinas</span>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openModal('modal-add-routine')" style="font-size:9px;letter-spacing:.06em">+ Nueva</button>
      </div>
      <div id="rtn-section-rutinas" style="display:${_rutinaOpen ? 'block' : 'none'}">${cards}</div>
      <div class="rtn-section-hdr" onclick="toggleRtnSection('biblioteca')">
        <span id="rtn-section-chev-biblioteca" style="display:inline-block;transition:transform .2s;transform:${_libOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}">▾</span>
        <span style="flex:1">Biblioteca</span>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openLibEx()" style="font-size:9px;letter-spacing:.06em">+ Nuevo</button>
      </div>
      <div id="rtn-section-biblioteca" style="display:${_libOpen ? 'block' : 'none'}">${buildLibraryBody()}</div>
      <div class="rtn-section-hdr" onclick="toggleRtnSection('estadisticas')">
        <span id="rtn-section-chev-estadisticas" style="display:inline-block;transition:transform .2s;transform:${_statsOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}">▾</span>
        <span>Estadísticas</span>
      </div>
      <div id="rtn-section-estadisticas" style="display:${_statsOpen ? 'block' : 'none'}">${statsBodyHtml}</div>
    </div>`;
  initScanner();
}

// ── Biblioteca: filtros + listado ──
let _libFilterEquip = 'all';
let _libFilterMuscle = 'all';

function setLibFilter(type, val) {
  if (type === 'equip') _libFilterEquip = (_libFilterEquip === val ? 'all' : val);
  else _libFilterMuscle = (_libFilterMuscle === val ? 'all' : val);
  renderRutinas();
}

function libUsageCount(libId) {
  let n = 0;
  (S.routines || []).forEach(r => (r.exercises || []).forEach(ex => { if (ex.libId === libId) n++; }));
  return n;
}

function buildLibraryBody() {
  const all = (S.exerciseLibrary || []).filter(l => !l.archived);
  // Grupos musculares presentes, en orden del vocabulario
  const musclesPresent = LIB_MUSCLES.filter(m => all.some(l => l.muscle === m));
  const equipPill = (val, label) => {
    const active = _libFilterEquip === val;
    return `<button onclick="setLibFilter('equip','${val}')" class="lib-pill${active ? ' active' : ''}">${label}</button>`;
  };
  const musclePill = (val, label) => {
    const active = _libFilterMuscle === val;
    return `<button onclick="setLibFilter('muscle','${val}')" class="lib-pill${active ? ' active' : ''}">${label}</button>`;
  };

  const filtered = all.filter(l =>
    (_libFilterEquip === 'all' || l.equipment === _libFilterEquip) &&
    (_libFilterMuscle === 'all' || l.muscle === _libFilterMuscle)
  ).sort((a, b) => a.name.localeCompare(b.name));

  let listHtml;
  if (all.length === 0) {
    listHtml = `<p style="font-size:12px;color:var(--tt);text-align:center;padding:18px 0">Biblioteca vacía. Agregá el primer ejercicio.</p>`;
  } else if (filtered.length === 0) {
    listHtml = `<p style="font-size:12px;color:var(--tt);text-align:center;padding:18px 0">No hay ejercicios con estos filtros.</p>`;
  } else {
    listHtml = filtered.map(l => {
      const uses = libUsageCount(l.id);
      return `<div class="lib-ex-row">
        <div style="flex:1;min-width:0" onclick="openExHistByLib('${l.id}')" >
          <div class="lib-ex-name">${l.name}</div>
          <div class="lib-ex-meta">${l.equipment} · ${l.muscle} · ⏱ ${fmtRestTime(l.defaultRestSecs)} · ${l.defaultSets} series${uses ? ` · <span style="color:var(--c-salud)">en ${uses} rutina${uses > 1 ? 's' : ''}</span>` : ''}</div>
        </div>
        <button class="icon-btn" onclick="event.stopPropagation();openLibEx('${l.id}')" style="color:var(--tt);flex-shrink:0" title="Editar">
          <svg viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" onclick="event.stopPropagation();deleteLibEx('${l.id}')" style="color:var(--tt);flex-shrink:0" title="Borrar">
          <svg viewBox="0 0 24 24" style="width:15px;height:15px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>`;
    }).join('');
  }

  return `<div style="padding:10px 12px 14px">
    <div class="lib-filter-lbl">Equipamiento</div>
    <div class="lib-pill-row">${equipPill('all', 'Todos')}${LIB_EQUIPMENT.map(e => equipPill(e, e)).join('')}</div>
    <div class="lib-filter-lbl" style="margin-top:10px">Grupo muscular</div>
    <div class="lib-pill-row">${musclePill('all', 'Todos')}${musclesPresent.map(m => musclePill(m, m)).join('')}</div>
    <div style="margin-top:12px">${listHtml}</div>
  </div>`;
}

function toggleRutina(id) {
  const card = document.getElementById('rtn-card-' + id);
  if (card) card.classList.toggle('rtn-open');
}

// ── CRUD ──
function addRoutine() {
  const name = document.getElementById('rtn-new-name').value.trim();
  const icon = document.getElementById('rtn-new-icon').value.trim() || '🏋️';
  if (!name) { showToast('Escribe el nombre'); return; }
  const newId = uid();
  S.routines.push({ id: newId, name, icon, exercises: [] });
  saveState(); renderRutinas(); closeModal('modal-add-routine');
  document.getElementById('rtn-new-name').value = '';
  const newCard = document.getElementById('rtn-card-' + newId);
  if (newCard) newCard.classList.add('rtn-open');
  showToast('Rutina creada — agregá el primer ejercicio');
  openExPicker('add', newId);
}

function openEditRoutine(rtnId) {
  const rtn = S.routines.find(r => r.id === rtnId);
  if (!rtn) return;
  document.getElementById('editRtnId').value   = rtnId;
  document.getElementById('editRtnName').value = rtn.name;
  document.getElementById('editRtnIcon').value = rtn.icon;
  openModal('modal-edit-routine');
}

function saveEditRoutine() {
  const id = document.getElementById('editRtnId').value;
  const rtn = S.routines.find(r => r.id === id);
  if (!rtn) return;
  const name = document.getElementById('editRtnName').value.trim();
  const icon = document.getElementById('editRtnIcon').value.trim();
  if (name) rtn.name = name;
  if (icon) rtn.icon = icon;
  saveState(); renderRutinas(); closeModal('modal-edit-routine');
  showToast('Rutina actualizada');
}

function deleteRoutine() {
  const id = document.getElementById('editRtnId').value;
  const rtn = S.routines.find(r => r.id === id);
  if (!rtn) return;
  if (!confirm(`¿Borrar la rutina "${rtn.name}"? Se perderá el historial asociado.`)) return;
  S.routines = S.routines.filter(r => r.id !== id);
  delete S.routineLog[id];
  saveState(); renderRutinas(); closeModal('modal-edit-routine');
  showToast('Rutina borrada');
}

// ── TUNE: descanso/series de un ejercicio dentro de una rutina (override) ──
function editRtnEx(rtnId, exId) {
  const rtn = S.routines.find(r => r.id === rtnId);
  const exRaw = rtn && rtn.exercises.find(e => e.id === exId);
  const sess = S.activeRtnSession;
  const inSession = sess && sess.exMeta && sess.exMeta[exId];
  if (!exRaw && !inSession) return;
  // Ejercicio de la rutina → usar sus overrides; instancia solo-de-sesión (swap) → usar exMeta/exSets.
  const ex = exRaw
    ? exDisplay(exRaw)
    : (() => { const i = sessExInfo(exId); return { ...i, sets: (sess.exSets[exId] || []).length || 4 }; })();
  document.getElementById('modal-rtn-ex-rtnid').value = rtnId;
  document.getElementById('modal-rtn-ex-exid').value  = exId;
  document.getElementById('rtn-ex-name-lbl').textContent = ex.name + ' · ' + ex.equipment;
  document.getElementById('rtn-ex-frest').value  = ex.restSecs;
  document.getElementById('rtn-ex-fsets').value  = ex.sets;
  document.getElementById('modal-rtn-ex-title').textContent = 'Ajustar ejercicio';
  openModal('modal-rtn-ex');
}

function saveRtnEx() {
  const rtnId = document.getElementById('modal-rtn-ex-rtnid').value;
  const exId  = document.getElementById('modal-rtn-ex-exid').value;
  const restSecs = +document.getElementById('rtn-ex-frest').value || 90;
  const sets     = Math.max(1, +document.getElementById('rtn-ex-fsets').value || 4);
  const rtn = S.routines.find(r => r.id === rtnId);
  const ex = rtn && rtn.exercises.find(e => e.id === exId);
  if (ex) { ex.restSecs = restSecs; ex.sets = sets; }
  // Override en vivo si la instancia está en la sesión activa (incluye swaps).
  const sess = S.activeRtnSession;
  if (sess && sess.exMeta && sess.exMeta[exId]) {
    sess.exMeta[exId].restSecs = restSecs;
    const arr = sess.exSets[exId] || (sess.exSets[exId] = []);
    while (arr.length < sets) arr.push({ weight: '', reps: '' });
    // al reducir, no borrar series ya cargadas
    while (arr.length > sets && !((arr[arr.length - 1].reps || 0) > 0 || (arr[arr.length - 1].weight || 0) > 0)) arr.pop();
  } else if (!ex) {
    return;
  }
  saveState(); renderRutinas(); closeModal('modal-rtn-ex');
  showToast('Ejercicio ajustado');
}

function deleteRtnEx(rtnId, exId) {
  const rtn = S.routines.find(r => r.id === rtnId);
  if (!rtn) return;
  rtn.exercises = rtn.exercises.filter(e => e.id !== exId);
  saveState(); renderRutinas();
}

// ── Biblioteca: alta/edición/borrado ──
function openLibEx(libId) {
  document.getElementById('lib-ex-id').value = libId || '';
  const musSel = document.getElementById('lib-ex-fmuscle');
  if (musSel && !musSel.dataset.filled) {
    musSel.innerHTML = LIB_MUSCLES.filter(m => m !== 'Sin clasificar')
      .map(m => `<option>${m}</option>`).join('') + '<option>Sin clasificar</option>';
    musSel.dataset.filled = '1';
  }
  if (libId) {
    const l = exLibById(libId);
    if (!l) return;
    document.getElementById('lib-ex-fname').value = l.name;
    document.getElementById('lib-ex-fequip').value = l.equipment;
    document.getElementById('lib-ex-fmuscle').value = l.muscle;
    document.getElementById('lib-ex-frest').value = l.defaultRestSecs;
    document.getElementById('lib-ex-fsets').value = l.defaultSets;
    document.getElementById('lib-ex-fnotes').value = l.notes || '';
    document.getElementById('modal-lib-ex-title').textContent = 'Editar ejercicio';
  } else {
    document.getElementById('lib-ex-fname').value = '';
    document.getElementById('lib-ex-fequip').value = 'Mancuerna';
    document.getElementById('lib-ex-fmuscle').value = LIB_MUSCLES[0];
    document.getElementById('lib-ex-frest').value = 120;
    document.getElementById('lib-ex-fsets').value = 4;
    document.getElementById('lib-ex-fnotes').value = '';
    document.getElementById('modal-lib-ex-title').textContent = 'Nuevo ejercicio';
  }
  openModal('modal-lib-ex');
}

function saveLibEx() {
  const id = document.getElementById('lib-ex-id').value;
  const name = document.getElementById('lib-ex-fname').value.trim();
  const equipment = document.getElementById('lib-ex-fequip').value;
  const muscle = document.getElementById('lib-ex-fmuscle').value;
  const defaultRestSecs = +document.getElementById('lib-ex-frest').value || 90;
  const defaultSets = Math.max(1, +document.getElementById('lib-ex-fsets').value || 4);
  const notes = document.getElementById('lib-ex-fnotes').value.trim();
  if (!name) { showToast('Escribe el nombre del ejercicio'); return; }
  if (!muscle) { showToast('Elegí el grupo muscular'); return; }
  if (!S.exerciseLibrary) S.exerciseLibrary = [];
  if (id) {
    const l = exLibById(id);
    if (l) { l.name = name; l.equipment = equipment; l.muscle = muscle; l.defaultRestSecs = defaultRestSecs; l.defaultSets = defaultSets; l.notes = notes; }
  } else {
    S.exerciseLibrary.push({ id: 'lib_' + uid(), name, equipment, muscle, defaultRestSecs, defaultSets, notes, archived: false });
  }
  saveState(); renderRutinas(); closeModal('modal-lib-ex');
  showToast(id ? 'Ejercicio actualizado' : 'Ejercicio agregado a la biblioteca');
}

function deleteLibEx(libId) {
  const l = exLibById(libId);
  if (!l) return;
  const uses = libUsageCount(libId);
  const histN = (S.exerciseHistory && S.exerciseHistory[libId] || []).length;
  if (uses > 0 || histN > 0) {
    const reason = [uses ? `en ${uses} rutina${uses > 1 ? 's' : ''}` : '', histN ? `${histN} sesión${histN > 1 ? 'es' : ''} de historial` : ''].filter(Boolean).join(' y ');
    if (!confirm(`"${l.name}" está ${reason}. No se borrará para no perder el historial: se archivará (desaparece de la lista pero conserva sus datos). ¿Archivar?`)) return;
    l.archived = true;
    saveState(); renderRutinas();
    showToast('Ejercicio archivado');
    return;
  }
  if (!confirm(`¿Borrar "${l.name}" de la biblioteca?`)) return;
  S.exerciseLibrary = S.exerciseLibrary.filter(e => e.id !== libId);
  saveState(); renderRutinas();
  showToast('Ejercicio borrado');
}

// ── Picker: elegir un ejercicio de la biblioteca (agregar a rutina / swap) ──
let _pickerMode = null;     // 'add' | 'swap'
let _pickerCtx = null;      // routineId (add) | session exId (swap)
let _pickerFilterEquip = 'all';
let _pickerFilterMuscle = 'all';

function openExPicker(mode, ctx) {
  _pickerMode = mode; _pickerCtx = ctx;
  _pickerFilterEquip = 'all'; _pickerFilterMuscle = 'all';
  document.getElementById('modal-ex-picker-title').textContent =
    mode === 'swap' ? 'Reemplazar ejercicio' : 'Agregar ejercicio';
  renderExPicker();
  openModal('modal-ex-picker');
}

function setPickerFilter(type, val) {
  if (type === 'equip') _pickerFilterEquip = (_pickerFilterEquip === val ? 'all' : val);
  else _pickerFilterMuscle = (_pickerFilterMuscle === val ? 'all' : val);
  renderExPicker();
}

function renderExPicker() {
  const all = (S.exerciseLibrary || []).filter(l => !l.archived);
  const musclesPresent = LIB_MUSCLES.filter(m => all.some(l => l.muscle === m));
  const eqPill = (val, label) => `<button onclick="setPickerFilter('equip','${val}')" class="lib-pill${_pickerFilterEquip === val ? ' active' : ''}">${label}</button>`;
  const muPill = (val, label) => `<button onclick="setPickerFilter('muscle','${val}')" class="lib-pill${_pickerFilterMuscle === val ? ' active' : ''}">${label}</button>`;
  const filtered = all.filter(l =>
    (_pickerFilterEquip === 'all' || l.equipment === _pickerFilterEquip) &&
    (_pickerFilterMuscle === 'all' || l.muscle === _pickerFilterMuscle)
  ).sort((a, b) => a.name.localeCompare(b.name));

  let list;
  if (all.length === 0) list = `<p style="font-size:12px;color:var(--tt);text-align:center;padding:18px 0">Biblioteca vacía. Creá un ejercicio primero.</p>`;
  else if (filtered.length === 0) list = `<p style="font-size:12px;color:var(--tt);text-align:center;padding:18px 0">No hay ejercicios con estos filtros.</p>`;
  else list = filtered.map(l => `<div class="lib-ex-row" style="cursor:pointer" onclick="pickExercise('${l.id}')">
      <div style="flex:1;min-width:0">
        <div class="lib-ex-name">${l.name}</div>
        <div class="lib-ex-meta">${l.equipment} · ${l.muscle} · ⏱ ${fmtRestTime(l.defaultRestSecs)} · ${l.defaultSets} series</div>
      </div>
      <span style="color:var(--c-salud);font-weight:800;flex-shrink:0">+</span>
    </div>`).join('');

  document.getElementById('modal-ex-picker-body').innerHTML = `
    <div class="lib-filter-lbl">Equipamiento</div>
    <div class="lib-pill-row">${eqPill('all', 'Todos')}${LIB_EQUIPMENT.map(e => eqPill(e, e)).join('')}</div>
    <div class="lib-filter-lbl" style="margin-top:10px">Grupo muscular</div>
    <div class="lib-pill-row">${muPill('all', 'Todos')}${musclesPresent.map(m => muPill(m, m)).join('')}</div>
    <div style="margin-top:12px">${list}</div>`;
}

function pickExercise(libId) {
  const lib = exLibById(libId);
  if (!lib) return;
  if (_pickerMode === 'swap') { _doSwapSessionEx(_pickerCtx, libId); }
  else { _doAddExToRoutine(_pickerCtx, libId); }
  closeModal('modal-ex-picker');
}

function _doAddExToRoutine(rtnId, libId) {
  const rtn = S.routines.find(r => r.id === rtnId);
  const lib = exLibById(libId);
  if (!rtn || !lib) return;
  const newEx = { id: uid(), libId, restSecs: lib.defaultRestSecs, sets: lib.defaultSets };
  const inActiveSession = S.activeRtnSession && S.activeRtnSession.routineId === rtnId;
  rtn.exercises.push(newEx);
  if (inActiveSession) {
    const sess = S.activeRtnSession;
    if (!sess.exOrder) sess.exOrder = rtn.exercises.map(e => e.id);
    else sess.exOrder.push(newEx.id);
    if (!sess.exMeta) sess.exMeta = {};
    sess.exMeta[newEx.id] = { libId, restSecs: lib.defaultRestSecs };
    sess.exSets[newEx.id] = [{ weight: '', reps: '' }];
    _rtnExpandedEx.add(newEx.id);
  }
  saveState(); renderRutinas();
  showToast('Ejercicio agregado');
}

// ── Heat color helpers ──
function muscleHeatColor(pct) {
  if (!pct || pct <= 0)  return { fill: 'rgba(40,70,90,0.30)',   glow: '' };
  if (pct <= 20)         return { fill: 'rgba(0,170,255,0.55)',  glow: '' };
  if (pct <= 40)         return { fill: 'rgba(60,210,120,0.60)', glow: '' };
  if (pct <= 60)         return { fill: 'rgba(240,210,30,0.66)', glow: '' };
  if (pct <= 80)         return { fill: 'rgba(255,120,20,0.74)', glow: '' };
  return                        { fill: 'rgba(255,40,40,0.85)',  glow: '' };
}

// ── Escáner muscular 360 interactivo (3 vistas + tinte rojo + popover) ──
function redOpacity(pct) { return (0.55 + pct / 100 * 0.45).toFixed(2); }
// Regiones por vista [x%, y%, ancho%, alto%] (% del lienzo); simétricos = 2 entradas
const MUSCLE_VIEWS = {
  front: {
    'Trapecio':       [[44,18,16,6],[56,18,16,6]],
    'Hombro frontal': [[31,22,15,9],[69,22,15,9]],
    'Pecho':          [[42,27,18,10],[58,27,18,10]],
    'Bíceps':         [[29,30,11,10],[71,30,11,10]],
    'Antebrazos':     [[26,43,10,12],[74,43,10,12]],
    'Abdomen':        [[50,38,20,18]],
    'Aductores':      [[50,54,12,9]],
    'Cuádriceps':     [[41,61,15,16],[59,61,15,16]],
    'Pantorrillas':   [[43,80,11,13],[57,80,11,13]],
  },
  side: {
    'Hombro frontal': [[50,20,12,9]],
    'Pecho':          [[57,26,11,9]],
    'Espalda':        [[44,29,11,12]],
    'Bíceps':         [[52,31,8,11]],
    'Antebrazos':     [[52,42,9,12]],
    'Abdomen':        [[57,37,11,12]],
    'Glúteo':         [[41,47,12,11]],
    'Cuádriceps':     [[54,60,12,16]],
    'Femorales':      [[46,60,10,16]],
    'Pantorrillas':   [[50,80,11,14]],
  },
  back: {
    'Trapecio':         [[50,21,17,7]],
    'Hombro posterior': [[31,22,15,9],[69,22,15,9]],
    'Espalda':          [[40,32,15,14],[60,32,15,14]],
    'Tríceps':          [[28,30,11,11],[72,30,11,11]],
    'Antebrazos':       [[25,42,10,12],[75,42,10,12]],
    'Glúteo':           [[43,49,16,9],[57,49,16,9]],
    'Femorales':        [[41,62,15,15],[59,62,15,15]],
    'Pantorrillas':     [[43,80,11,13],[57,80,11,13]],
  },
};
const SCAN_VIEWS = [
  { key: 'front', img: 'assets/body-front.jpg', flip: false },
  { key: 'side',  img: 'assets/body-side.jpg',  flip: false },
  { key: 'back',  img: 'assets/body-back.jpg',  flip: false },
];

function _scanLayer(view, idx, counts, maxCount) {
  const regions = MUSCLE_VIEWS[view.key] || {};
  let paint = '', hot = '';
  Object.entries(regions).forEach(([muscle, coords]) => {
    const pct = Math.round((counts[muscle] || 0) / maxCount * 100);
    coords.forEach(([x, y, w, h]) => {
      if (pct > 0) {
        const op = redOpacity(pct);
        paint += `<div class="muscle-paint" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;--base-op:${op};opacity:${op};background:radial-gradient(ellipse at center, rgba(255,0,0,1) 0%, rgba(245,5,5,1) 62%, rgba(220,0,0,0) 90%)"></div>`;
      }
      hot += `<div class="muscle-hot" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%" onclick="scanMuscleTap(event,'${muscle}','${view.key}')"></div>`;
    });
  });
  return `<div class="scan-view${idx === 0 ? ' active' : ''}${view.flip ? ' flip' : ''}" data-idx="${idx}">
    <img src="${view.img}" alt="" loading="lazy">${paint}${hot}
  </div>`;
}

// Visor fluido: video del cuerpo girando 360 (decorativo, sin interacción)
function buildSpinViewer() {
  return `<div style="margin:6px 0 18px">
    <div style="font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,150,40,.6);margin-bottom:8px">◈ GIRO 360°</div>
    <div class="spin-stage">
      <video class="spin-video" src="assets/body-360.mp4" autoplay muted loop playsinline></video>
      <div class="body-scan-line"></div>
    </div>
  </div>`;
}

function buildMuscleHeatmap(muscleCounts) {
  if (!muscleCounts || Object.keys(muscleCounts).length === 0) return '';
  const maxCount = Math.max(...Object.values(muscleCounts), 1);
  const layers = SCAN_VIEWS.map((v, i) => _scanLayer(v, i, muscleCounts, maxCount)).join('');
  const dots = SCAN_VIEWS.map((v, i) => `<button class="scan-dot${i === 0 ? ' on' : ''}" data-dot="${i}" onclick="scanSetView(${i})" title="${v.key}"></button>`).join('');
  return `<div style="margin:10px 0 6px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,200,255,0.45)">◈ MAPA DE ENTRENAMIENTO</span>
      <span style="font-size:8px;color:rgba(0,200,255,0.4)">toca un músculo</span>
    </div>
    <div class="body-scan-stage" id="scan-stage">
      ${layers}
      <div class="body-scan-line"></div>
      <div id="scan-pop"></div>
    </div>
    <div class="scan-controls">
      ${dots}
      <button class="scan-btn" id="scan-play" onclick="scanToggleAuto()" title="Pausar/Reanudar">⏸</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:9px">
      <span style="font-size:9px;color:var(--ts)">Menos</span>
      <div style="flex:0 1 120px;height:7px;border-radius:4px;background:linear-gradient(90deg, rgba(235,20,20,0.15), rgba(235,20,20,0.95))"></div>
      <span style="font-size:9px;color:var(--ts)">Más</span>
    </div>
  </div>`;
}

// ── Estado y control del escáner ──
let _scanView = 0, _scanAuto = true, _scanTimer = null;

function initScanner() {
  const stage = document.getElementById('scan-stage');
  if (!stage) { if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; } return; }
  _scanView = 0; _scanAuto = true;
  _scanApply();
  _scanStart();
  // swipe para rotar
  let sx = null;
  stage.addEventListener('pointerdown', e => { sx = e.clientX; }, { passive: true });
  stage.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 24) { scanSetView((_scanView + (dx < 0 ? 1 : -1) + SCAN_VIEWS.length) % SCAN_VIEWS.length); }
  });
  // cerrar popover al tocar fuera de un músculo
  stage.addEventListener('click', e => { if (!e.target.classList.contains('muscle-hot')) scanClosePop(); });
}
function _scanStart() {
  if (_scanTimer) clearInterval(_scanTimer);
  if (!_scanAuto) return;
  _scanTimer = setInterval(() => { _scanView = (_scanView + 1) % SCAN_VIEWS.length; _scanApply(); }, 2900);
}
function _scanApply() {
  document.querySelectorAll('#scan-stage .scan-view').forEach(el => {
    el.classList.toggle('active', +el.dataset.idx === _scanView);
  });
  document.querySelectorAll('.scan-dot').forEach(el => {
    el.classList.toggle('on', +el.dataset.dot === _scanView);
  });
  scanClosePop();
}
function scanSetView(i) {
  _scanView = i; _scanAuto = false;
  const btn = document.getElementById('scan-play'); if (btn) btn.textContent = '▶';
  if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
  _scanApply();
}
function scanToggleAuto() {
  _scanAuto = !_scanAuto;
  const btn = document.getElementById('scan-play'); if (btn) btn.textContent = _scanAuto ? '⏸' : '▶';
  _scanStart();
}
function scanClosePop() { const p = document.getElementById('scan-pop'); if (p) p.innerHTML = ''; }

function scanMuscleTap(ev, muscle, viewKey) {
  ev.stopPropagation();
  _scanAuto = false;
  const btn = document.getElementById('scan-play'); if (btn) btn.textContent = '▶';
  if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
  const pop = document.getElementById('scan-pop'); if (!pop) return;
  const coords = (MUSCLE_VIEWS[viewKey] || {})[muscle];
  if (!coords) return;
  const [x, y] = coords[0];
  const data = (window.SCAN_DATA && window.SCAN_DATA.stats[muscle]) || null;
  const max = (window.SCAN_DATA && window.SCAN_DATA.max) || 1;
  const cnt = (window.SCAN_DATA && window.SCAN_DATA.counts[muscle]) || 0;
  const pct = Math.round(cnt / max * 100);
  const volStr = data ? (data.vol >= 1000 ? (data.vol / 1000).toFixed(1) + ' t' : data.vol + ' kg') : '—';
  const rows = data
    ? `<div class="mp-row"><span class="mp-k">Veces</span><span class="mp-v">${data.sessions}</span></div>
       <div class="mp-row"><span class="mp-k">Series</span><span class="mp-v">${data.sets}</span></div>
       <div class="mp-row"><span class="mp-k">Volumen</span><span class="mp-v">${volStr}</span></div>
       <div class="mp-row"><span class="mp-k">Último</span><span class="mp-v">${data.last ? data.last.slice(5) : '—'}</span></div>`
    : `<div style="font-size:10px;color:rgba(150,180,200,.7);padding:2px 0">Sin entrenar en este período</div>`;
  const below = y < 30;
  pop.innerHTML = `<div class="muscle-pop${below ? ' below' : ''}" style="left:${x}%;top:${y}%;${below ? 'transform:translate(-50%,18px)' : ''}">
    <div class="mp-name"><span style="width:7px;height:7px;border-radius:50%;background:rgb(255,${Math.round(60 - pct*0.6)},40);box-shadow:0 0 6px rgba(255,40,40,.8)"></span>${muscle}</div>
    ${rows}
    <div style="margin-top:6px;height:4px;border-radius:2px;background:rgba(255,255,255,.1)"><div style="height:100%;width:${pct}%;border-radius:2px;background:linear-gradient(90deg,#ff8a3b,#ff2b2b)"></div></div>
  </div>`;
}

let _exHistCharts = [];

// Historial GLOBAL por ejercicio de la biblioteca (agrega todas las rutinas/sesiones).
function openExHistByLib(libId) {
  const lib = exLibById(libId);
  const log = (S.exerciseHistory && S.exerciseHistory[libId] || [])
    .filter(e => e.sets && e.sets.length)
    .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  document.getElementById('modal-ex-hist-title').textContent = (lib ? lib.name : 'Ejercicio') + (lib && lib.archived ? ' (archivado)' : '');

  // KPIs
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
  const monthAgoStr = localStr(monthAgo);
  const thisMonthCount = log.filter(e => e.date >= monthAgoStr).length;
  let maxWeight = 0, maxReps = 0, maxVol = 0;
  log.forEach(entry => entry.sets.forEach(s => {
    if ((s.weight || 0) > maxWeight) maxWeight = s.weight || 0;
    if ((s.reps   || 0) > maxReps)   maxReps   = s.reps   || 0;
    const v = (s.weight || 0) * (s.reps || 0);
    if (v > maxVol) maxVol = v;
  }));
  const maxVolStr = maxVol >= 1000 ? `${(maxVol / 1000).toFixed(1)}<span style="font-size:11px;font-weight:400"> t</span>` : `${maxVol}<span style="font-size:11px;font-weight:400"> kg</span>`;

  // Serie por sesión (últimas 15 para los charts)
  const perSession = log.map(e => {
    const bestW = Math.max(...e.sets.map(s => s.weight || 0));
    const totReps = e.sets.reduce((a, s) => a + (s.reps || 0), 0);
    const vol = e.sets.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
    return { date: e.date, bestW, totReps, vol, nSets: e.sets.length };
  });
  const chartData = perSession.slice(-15);

  // Tabla (fecha / series / reps / peso / progreso), más reciente primero
  const tableRows = perSession.slice().reverse().map((p, i) => {
    // progreso = delta de mejor peso vs sesión previa cronológica
    const idxChrono = perSession.length - 1 - i;
    const prev = idxChrono > 0 ? perSession[idxChrono - 1] : null;
    let prog = '—', progColor = 'var(--tt)';
    if (prev) {
      const d = +(p.bestW - prev.bestW).toFixed(1);
      if (d > 0) { prog = '▲ ' + d; progColor = 'var(--ok, #34d399)'; }
      else if (d < 0) { prog = '▼ ' + Math.abs(d); progColor = 'var(--c-salud)'; }
      else { prog = '='; }
    }
    return `<tr>
      <td style="font-family:var(--mono);color:rgba(0,200,255,.7)">${p.date.slice(5)}</td>
      <td style="text-align:center">${p.nSets}</td>
      <td style="text-align:center">${p.totReps}</td>
      <td style="text-align:center;font-family:var(--mono);color:#00DCFF;font-weight:700">${p.bestW}</td>
      <td style="text-align:right;color:${progColor};font-family:var(--mono)">${prog}</td>
    </tr>`;
  }).join('');

  const tableHtml = log.length === 0
    ? '<p style="color:rgba(0,200,255,.35);font-size:12px;padding:8px 0;text-align:center">Sin historial aún.</p>'
    : `<table class="ex-hist-table">
        <thead><tr><th>Fecha</th><th style="text-align:center">Series</th><th style="text-align:center">Reps</th><th style="text-align:center">Peso</th><th style="text-align:right">Prog.</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>`;

  const chartsHtml = chartData.length >= 2
    ? `<div class="ex-hud-chart-wrap">
        <div class="ex-hud-chart-title">◈ PESO + REPS — últimas ${chartData.length} sesiones</div>
        <div style="height:150px"><canvas id="exHistChartWR"></canvas></div>
      </div>
      <div class="ex-hud-chart-wrap">
        <div class="ex-hud-chart-title">◈ VOLUMEN (peso × reps) — últimas ${chartData.length} sesiones</div>
        <div style="height:150px"><canvas id="exHistChartVol"></canvas></div>
      </div>`
    : '<div style="font-size:11px;color:rgba(0,200,255,.35);padding:12px 0;text-align:center">Se necesitan al menos 2 sesiones para los gráficos.</div>';

  document.getElementById('modal-ex-hist-body').innerHTML = `
    <div style="position:relative;overflow:hidden">
      <div class="ex-hud-scan-line"></div>
      <div class="ex-hud-kpi-row">
        <div class="ex-hud-kpi">
          <div class="ex-hud-kpi-val">${log.length}</div>
          <div class="ex-hud-kpi-lbl">Sesiones</div>
        </div>
        <div class="ex-hud-kpi">
          <div class="ex-hud-kpi-val">${maxWeight}<span style="font-size:11px;font-weight:400"> kg</span></div>
          <div class="ex-hud-kpi-lbl">Récord Peso</div>
        </div>
        <div class="ex-hud-kpi">
          <div class="ex-hud-kpi-val">${thisMonthCount}</div>
          <div class="ex-hud-kpi-lbl">Últimos 30 días</div>
        </div>
        <div class="ex-hud-kpi">
          <div class="ex-hud-kpi-val">${maxVolStr}</div>
          <div class="ex-hud-kpi-lbl">Récord Vol</div>
        </div>
      </div>
      ${chartsHtml}
      <div style="margin-top:14px">${tableHtml}</div>
    </div>`;
  openModal('modal-ex-hist');

  // Instanciar charts Chart.js (dark) tras render
  _exHistCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
  _exHistCharts = [];
  if (chartData.length >= 2) {
    const labels = chartData.map(p => p.date.slice(5));
    const grid = { color: 'rgba(255,255,255,.06)' };
    const tick = { color: 'rgba(255,255,255,.5)', font: { size: 9 } };
    const wrCanvas = document.getElementById('exHistChartWR');
    if (wrCanvas) _exHistCharts.push(new Chart(wrCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Peso (kg)', data: chartData.map(p => p.bestW), borderColor: '#00DCFF', backgroundColor: 'rgba(0,220,255,.12)', pointRadius: 3, tension: .3, fill: true, yAxisID: 'y' },
          { label: 'Reps', data: chartData.map(p => p.totReps), borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,.08)', pointRadius: 3, tension: .3, fill: false, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: 'rgba(255,255,255,.65)', font: { size: 10 }, boxWidth: 12 } } },
        scales: {
          x: { grid, ticks: tick },
          y: { position: 'left', grid, ticks: { ...tick, color: '#00DCFF' } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { ...tick, color: '#f43f5e' } }
        }
      }
    }));
    const volCanvas = document.getElementById('exHistChartVol');
    if (volCanvas) _exHistCharts.push(new Chart(volCanvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Volumen (kg)', data: chartData.map(p => p.vol), backgroundColor: 'rgba(0,220,255,.45)', borderColor: '#00DCFF', borderWidth: 1, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid, ticks: tick }, y: { grid, ticks: tick, beginAtZero: true } }
      }
    }));
  }
}

// ── Session ──
let _rtnSections = new Set(['rutinas', 'estadisticas']);
let _statsPeriod = 'mes';
let _muscleDistOpen = true;
let _recordsOpen = true;

function toggleRtnSection(name) {
  if (_rtnSections.has(name)) { _rtnSections.delete(name); } else { _rtnSections.add(name); }
  const body = document.getElementById('rtn-section-' + name);
  const chev = document.getElementById('rtn-section-chev-' + name);
  const open = _rtnSections.has(name);
  if (body) body.style.display = open ? 'block' : 'none';
  if (chev) chev.style.transform = open ? 'rotate(0deg)' : 'rotate(-90deg)';
}

function setStatsPeriod(p) { _statsPeriod = p; renderRutinas(); }

function toggleMuscleDist() {
  _muscleDistOpen = !_muscleDistOpen;
  const body = document.getElementById('muscle-dist-body');
  const chev = document.getElementById('muscle-dist-chev');
  if (body) body.style.display = _muscleDistOpen ? 'block' : 'none';
  if (chev) chev.style.transform = _muscleDistOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
}

function toggleRecords() {
  _recordsOpen = !_recordsOpen;
  const body = document.getElementById('records-body');
  const chev = document.getElementById('records-chev');
  if (body) body.style.display = _recordsOpen ? 'block' : 'none';
  if (chev) chev.style.transform = _recordsOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
}

let _rtnTimers = {};         // { exId: intervalId }
let _rtnTimerRemaining = {}; // { exId: secondsLeft }
let _rtnChrono = null;       // session stopwatch interval
let _rtnExpandedEx = new Set(); // currently expanded exercise IDs
let _pipExId = null;         // exercise shown in floating pip

function _updatePip() {
  const pip = document.getElementById('timer-pip');
  if (!pip) return;
  // If current pip timer is gone, try to pick another running one
  if (_pipExId === null || (_rtnTimerRemaining[_pipExId] === undefined && !_rtnTimers[_pipExId])) {
    const running = Object.keys(_rtnTimers);
    _pipExId = running.length > 0
      ? running.reduce((a, b) => (_rtnTimerRemaining[a] || 999) <= (_rtnTimerRemaining[b] || 999) ? a : b)
      : null;
  }
  if (_pipExId === null) {
    pip.classList.remove('visible', 'pip-urgent', 'pip-done');
    return;
  }
  const rem = _rtnTimerRemaining[_pipExId] ?? 0;
  const cd = document.getElementById('pip-countdown');
  const lbl = document.getElementById('pip-label');
  if (!cd) return;
  pip.classList.add('visible');
  pip.classList.remove('pip-urgent', 'pip-done');
  if (rem <= 0) {
    cd.textContent = '¡Listo!';
    pip.classList.add('pip-done');
  } else {
    cd.textContent = fmtTimerDisplay(rem);
    if (rem <= 10) pip.classList.add('pip-urgent');
  }
  if (lbl) {
    const ex = _pipExId ? sessExInfo(_pipExId) : null;
    lbl.textContent = ex && ex.name ? `Descanso — ${ex.name}` : 'Descanso';
  }
}

function pipAdjust(delta) {
  if (_pipExId === null) return;
  adjustRtnTimer(_pipExId, delta);
}

function pipSkip() {
  if (_pipExId !== null) skipRtnTimer(_pipExId);
  _pipExId = null;
  _updatePip();
}

function _playTimerDone() {
  try {
    // Reutilizar el AudioContext del media session hub (ya desbloqueado por gesto del usuario).
    // Crear uno nuevo dentro de setInterval falla en mobile por restricciones de autoplay.
    const ctx = (_msHub?.getCtx()) || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    [[880, 0, 0.14], [1108, 0.18, 0.38]].forEach(([freq, t0, t1]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + t0);
      gain.gain.setValueAtTime(0, ctx.currentTime + t0);
      gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t1);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t1 + 0.05);
    });
  } catch(e) {}
}

// ════════════════════════════════════════════════════════
// MEDIA SESSION HUB  — "Notificación Spotify" del sistema
// Muestra timers, recordatorios y fechas límite en el
// notification center / lock screen con controles reales.
// ════════════════════════════════════════════════════════
const _msHub = (() => {
  const BASE_URL = 'https://loustau45261470.github.io/Centro-de-mando';
  const ARTWORK  = [{ src: BASE_URL + '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }];
  const TABS     = ['vida','finanzas','salud','conocimiento','ia'];
  const PRIO_IC  = { critical: '⚡', high: '🔴', medium: '🟡', low: '🟢' };

  let _ctx = null;   // AudioContext — mantiene la sesión viva
  let _exId = null;  // ejercicio activo en media session (timer mode)

  // ── Audio silencioso para activar el media player ─────
  function _ensureAudio() {
    if (!_ctx) {
      try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Buffer de 1 muestra en loop: sin oscilador → sin click/pop, pero el
        // contexto está "reproduciendo" → media session visible en todos los browsers
        const buf = _ctx.createBuffer(1, 1, _ctx.sampleRate);
        const src = _ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(_ctx.destination);
        src.start();
      } catch(e) {}
    }
    // Resume si estaba suspendido (mobile sin gesto previo; se activa al primer timer)
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
  }

  function _supported() { return 'mediaSession' in navigator && 'MediaMetadata' in window; }

  function _meta(title, artist) {
    if (!_supported()) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: 'Centro de Mando', artwork: ARTWORK });
    navigator.mediaSession.playbackState = 'playing';
  }

  function _handle(action, fn) {
    try { navigator.mediaSession.setActionHandler(action, fn); } catch {}
  }

  function _clearHandlers() {
    ['play','pause','stop','seekbackward','seekforward','previoustrack','nexttrack']
      .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
  }

  function _deactivate() {
    if (!_supported()) return;
    _clearHandlers();
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.metadata = null;
    _exId = null;
  }

  // ── TIMER MODE ─────────────────────────────────────────
  // Llamado cuando arranca un descanso
  function onTimerStart(exId, exName) {
    if (!_supported()) return;
    _exId = exId;
    _ensureAudio();
    _clearHandlers();
    _handle('seekbackward', () => adjustRtnTimer(exId, -15));
    _handle('seekforward',  () => adjustRtnTimer(exId, +15));
    _handle('previoustrack', () => adjustRtnTimer(exId, -15));
    _handle('nexttrack',     () => adjustRtnTimer(exId, +15));
    _handle('pause', () => skipRtnTimer(exId));
    _handle('stop',  () => skipRtnTimer(exId));
    _tickTimer(exId, exName);
  }

  // Llamado cada segundo desde el interval existente
  function onTimerTick(exId, exName) {
    if (_exId !== exId || !_supported()) return;
    _tickTimer(exId, exName);
  }

  function _tickTimer(exId, exName) {
    const rem = _rtnTimerRemaining[exId];
    if (rem === undefined || rem <= 0) return;
    const icon = rem <= 10 ? '⚡' : '⏱';
    _meta(`${icon} ${fmtTimerDisplay(rem)} de descanso`, exName || 'Rutina');
  }

  // Llamado cuando el temporizador llega a 0
  function onTimerDone(exName) {
    if (!_supported()) return;
    _exId = null;
    _clearHandlers();
    _meta('✅ ¡Descanso terminado!', exName || 'Seguí con la rutina');
    // Tras 3s vuelve a mostrar recordatorios
    setTimeout(() => showReminders(), 3000);
  }

  // Llamado cuando se salta/cancela un timer
  function onTimerSkip() {
    _exId = null;
    showReminders();
  }

  // ── REMINDERS MODE ─────────────────────────────────────
  // Muestra próximos recordatorios y fechas límite
  function showReminders() {
    _exId = null;
    if (!_supported()) return;
    const items = _buildQueue();
    if (!items.length) { _deactivate(); return; }
    _ensureAudio();
    _clearHandlers();
    let idx = 0;
    const show = () => _meta(items[idx].title, items[idx].sub);
    if (items.length > 1) {
      _handle('nexttrack',     () => { idx = (idx + 1) % items.length; show(); });
      _handle('previoustrack', () => { idx = (idx - 1 + items.length) % items.length; show(); });
    }
    show();
  }

  function _buildQueue() {
    const now  = new Date();
    const all  = [];
    TABS.forEach(tab => {
      (S?.reminders?.[tab] || []).forEach(r => {
        if (!r.datetime) return;
        const dt      = new Date(r.datetime);
        const diffMin = Math.round((dt - now) / 60000);
        if (diffMin >= -120 && diffMin <= 2880) all.push({ diffMin, r });
      });
    });
    all.sort((a, b) => a.diffMin - b.diffMin);
    return all.slice(0, 10).map(({ diffMin, r }) => {
      const p = PRIO_IC[r.priority] || '🔵';
      let sub;
      if (diffMin < 0)      sub = 'Venció hace ' + Math.abs(diffMin) + 'min';
      else if (diffMin === 0) sub = '¡Ahora mismo!';
      else if (diffMin < 60)  sub = 'En ' + diffMin + ' min';
      else if (diffMin < 1440) sub = 'En ' + Math.round(diffMin / 60) + 'h';
      else                    sub = 'En ' + Math.round(diffMin / 1440) + ' días';
      return { title: p + ' ' + r.title, sub };
    });
  }

  // API pública
  return { onTimerStart, onTimerTick, onTimerDone, onTimerSkip, showReminders, getCtx: () => _ctx };
})();

function startRutinaSession(rtnId) {
  const rtn = S.routines.find(r => r.id === rtnId);
  if (!rtn) return;
  if (!rtn.exercises.length) { showToast('Agregá ejercicios primero'); return; }
  const exSets = {}, exMeta = {};
  rtn.exercises.forEach(ex => {
    exSets[ex.id] = [{ weight: '', reps: '' }];
    const d = exDisplay(ex);
    exMeta[ex.id] = { libId: ex.libId, restSecs: d.restSecs };
  });
  S.activeRtnSession = { routineId: rtnId, startedAt: Date.now(), exSets, exMeta, exOrder: rtn.exercises.map(e => e.id) };
  _rtnExpandedEx = new Set(rtn.exercises.map(e => e.id));
  saveState(); renderRutinas();
}

// Swap: reemplaza un ejercicio SOLO en la sesión activa (no toca S.routines).
function swapSessionEx(exId) { openExPicker('swap', exId); }

function _doSwapSessionEx(oldExId, newLibId) {
  const sess = S.activeRtnSession;
  if (!sess) return;
  _readSaveRtnSets(oldExId);   // preservar lo cargado del original
  const lib = exLibById(newLibId);
  if (!lib) return;
  if (!sess.exMeta) sess.exMeta = {};
  const newId = uid();
  sess.exMeta[newId] = { libId: newLibId, restSecs: lib.defaultRestSecs };
  sess.exSets[newId] = [{ weight: '', reps: '' }];
  // Reemplazar en el orden visible; el original sale de la vista pero SU exSets/exMeta
  // quedan para loguear su historial al finalizar.
  const order = sess.exOrder || [];
  const i = order.indexOf(oldExId);
  if (i >= 0) order[i] = newId; else order.push(newId);
  _rtnExpandedEx.delete(oldExId);
  _rtnExpandedEx.add(newId);
  saveState(); renderRutinas();
  showToast('Ejercicio reemplazado para esta sesión');
}

function moveRtnSessionEx(exId, dir) {
  if (!S.activeRtnSession) return;
  _readSaveRtnSets(exId);
  const order = S.activeRtnSession.exOrder;
  const i = order.indexOf(exId);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  saveState(); renderRutinas();
}

function fmtChrono(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function startRtnChrono() {
  if (_rtnChrono) return;
  _rtnChrono = setInterval(() => {
    if (!S.activeRtnSession) { clearInterval(_rtnChrono); _rtnChrono = null; return; }
    const el = document.getElementById('rtn-chrono');
    if (el) el.textContent = fmtChrono(Math.floor((Date.now() - S.activeRtnSession.startedAt) / 1000));
  }, 1000);
}

function toggleRtnEx(exId) {
  const body = document.getElementById('rtn-exbody-' + exId);
  const chev = document.getElementById('rtn-exchev-' + exId);
  if (!body) return;
  if (_rtnExpandedEx.has(exId)) {
    _rtnExpandedEx.delete(exId);
    body.style.display = 'none';
    if (chev) chev.style.transform = 'rotate(0deg)';
  } else {
    _rtnExpandedEx.add(exId);
    body.style.display = 'block';
    if (chev) chev.style.transform = 'rotate(-180deg)';
  }
}

function renderActiveSession() {
  const wrap = document.getElementById('rutinas-wrap');
  if (!wrap || !S.activeRtnSession) return;
  const { routineId, startedAt, exSets } = S.activeRtnSession;
  const rtn = S.routines && S.routines.find(r => r.id === routineId);
  if (!rtn) { S.activeRtnSession = null; saveState(); renderRutinas(); return; }
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);

  // Compat: sesiones iniciadas antes de la biblioteca no tienen exMeta → reconstruir.
  if (!S.activeRtnSession.exMeta) {
    S.activeRtnSession.exMeta = {};
    rtn.exercises.forEach(ex => {
      const d = exDisplay(ex);
      S.activeRtnSession.exMeta[ex.id] = { libId: ex.libId, restSecs: d.restSecs };
    });
  }

  const _sessionOrder = (S.activeRtnSession.exOrder || rtn.exercises.map(e => e.id));
  const _orderedExes = _sessionOrder.map(id => sessExInfo(id)).filter(e => e.libId || e.name);

  const exBlocks = _orderedExes.map((ex, idx) => {
    const sets = exSets[ex.id] || [{ weight: '', reps: '' }];
    const setsHtml = sets.map((s, si) => `
      <div class="rtn-set-row${s.done ? ' rtn-set-done' : ''}">
        <div class="rtn-set-num">${si + 1}</div>
        <input class="rtn-set-inp" type="number" placeholder="kg" value="${s.weight || ''}"
          data-rtn-exid="${ex.id}" data-si="${si}" data-f="w">
        <input class="rtn-set-inp" type="number" placeholder="reps" value="${s.reps || ''}"
          data-rtn-exid="${ex.id}" data-si="${si}" data-f="r">
        <button class="rtn-set-check${s.done ? ' checked' : ''}" onclick="checkRtnSet('${ex.id}',${si})">✓</button>
        ${sets.length > 1 ? `<button class="rtn-set-del" onclick="deleteRtnSet('${ex.id}',${si})">✕</button>` : '<span></span>'}
      </div>`).join('');
    const tRem = _rtnTimerRemaining[ex.id];
    const tVisible = tRem !== undefined;
    const tDone = tVisible && tRem <= 0;
    const tDisplay = tVisible ? fmtTimerDisplay(tRem) : fmtTimerDisplay(ex.restSecs);
    const isExpanded = _rtnExpandedEx.has(ex.id);
    const isFirst = idx === 0;
    const isLast = idx === _orderedExes.length - 1;
    const btnStyle = 'background:none;border:none;cursor:pointer;padding:2px 5px;font-size:13px;color:var(--tt);line-height:1;flex-shrink:0';
    const btnDisabled = 'opacity:.25;cursor:default;pointer-events:none';
    return `
      <div class="rtn-ex-block">
        <div class="rtn-ex-block-header" onclick="toggleRtnEx('${ex.id}')">
          <div class="rtn-ex-title">
            <span class="rtn-ex-title-name">${ex.name}</span>
            <span class="rtn-ex-title-equip">(${ex.equipment})</span>
          </div>
          <button onclick="event.stopPropagation();openExHistByLib('${ex.libId}')" style="${btnStyle}" title="Historial">📊</button>
          <button onclick="event.stopPropagation();swapSessionEx('${ex.id}')" style="${btnStyle}" title="Reemplazar (solo esta sesión)">⇄</button>
          <button onclick="event.stopPropagation();editRtnEx('${routineId}','${ex.id}')" style="${btnStyle}" title="Ajustar descanso/series">✎</button>
          <button onclick="event.stopPropagation();moveRtnSessionEx('${ex.id}',-1)" style="${btnStyle}${isFirst ? ';'+btnDisabled : ''}">↑</button>
          <button onclick="event.stopPropagation();moveRtnSessionEx('${ex.id}',+1)" style="${btnStyle}${isLast ? ';'+btnDisabled : ''}">↓</button>
          <span class="rtn-ex-chevron" id="rtn-exchev-${ex.id}" style="transform:${isExpanded ? 'rotate(-180deg)' : 'rotate(0deg)'}">▾</span>
        </div>
        <div class="rtn-ex-block-body" id="rtn-exbody-${ex.id}" style="${isExpanded ? '' : 'display:none'}">
          ${ex.notes ? `<div class="rtn-ex-notes">💡 ${ex.notes}</div>` : ''}
          <div style="${ex.notes ? 'margin-top:8px' : ''}">
            <div class="rtn-sets-header"><div>Serie</div><div>KG</div><div>Reps</div><div style="text-align:center;font-size:10px">✓</div><div></div></div>
            <div id="rtn-sets-${ex.id}">${setsHtml}</div>
            <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="addRtnSet('${ex.id}')">+ Serie</button>
          </div>
          <div id="rtn-tband-${ex.id}" class="rtn-timer-band${tDone ? ' done' : ''}" style="${tVisible ? 'display:flex' : 'display:none'}">
            <div class="rtn-timer-countdown" id="rtn-tband-display-${ex.id}">${tDisplay}</div>
            <button class="rtn-timer-adj" onclick="adjustRtnTimer('${ex.id}',-15)">−15s</button>
            <button class="rtn-timer-skip" onclick="skipRtnTimer('${ex.id}')">Omitir</button>
            <button class="rtn-timer-adj" onclick="adjustRtnTimer('${ex.id}',+15)">+15s</button>
          </div>
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="card" style="border-color:rgba(244,63,94,.3)">
      <div class="rtn-session-bar">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="rtn-session-title">🏋️ ${rtn.name}</div>
            <div class="rtn-chrono" id="rtn-chrono">${fmtChrono(elapsed)}</div>
          </div>
          <div class="rtn-session-sub">${_orderedExes.length} ejercicios</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="color:var(--ts);flex-shrink:0" onclick="cancelRtnSession()">✕ Cancelar</button>
      </div>
      <div class="rtn-session-exes">${exBlocks}
        <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="openExPicker('add','${routineId}')">+ Ejercicio</button>
      </div>
      <div style="padding:0 14px 14px">
        <button class="btn btn-primary w-full" onclick="finishRtnSession()">✓ Finalizar sesión</button>
      </div>
    </div>`;

  startRtnChrono();
  wrap.querySelectorAll('.rtn-set-inp').forEach(inp => {
    inp.addEventListener('blur', () => _readSaveRtnSets(inp.dataset.rtnExid));
  });
}

function _readSaveRtnSets(exId) {
  if (!S.activeRtnSession) return;
  const container = document.getElementById('rtn-sets-' + exId);
  if (!container) return;
  const sets = [];
  container.querySelectorAll('.rtn-set-row').forEach(row => {
    const w = row.querySelector('[data-f=w]');
    const r = row.querySelector('[data-f=r]');
    if (w && r) sets.push({ weight: +w.value || 0, reps: +r.value || 0, done: row.classList.contains('rtn-set-done') });
  });
  S.activeRtnSession.exSets[exId] = sets;
  saveState();
}

function addRtnSet(exId) {
  if (!S.activeRtnSession) return;
  _readSaveRtnSets(exId);
  if (!S.activeRtnSession.exSets[exId]) S.activeRtnSession.exSets[exId] = [];
  S.activeRtnSession.exSets[exId].push({ weight: '', reps: '' });
  saveState(); renderRutinas();
}

function deleteRtnSet(exId, si) {
  if (!S.activeRtnSession) return;
  _readSaveRtnSets(exId);
  const sets = S.activeRtnSession.exSets[exId] || [];
  if (sets.length <= 1) return;
  sets.splice(si, 1);
  S.activeRtnSession.exSets[exId] = sets;
  saveState(); renderRutinas();
}

function fmtTimerDisplay(secs) {
  if (secs <= 0) return '¡Listo!';
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function checkRtnSet(exId, si) {
  if (!S.activeRtnSession) return;
  _readSaveRtnSets(exId);
  const sets = S.activeRtnSession.exSets[exId] || [];
  if (!sets[si]) return;
  sets[si].done = !sets[si].done;
  S.activeRtnSession.exSets[exId] = sets;
  saveState();
  const container = document.getElementById('rtn-sets-' + exId);
  if (container) {
    const rows = container.querySelectorAll('.rtn-set-row');
    if (rows[si]) {
      rows[si].classList.toggle('rtn-set-done', sets[si].done);
      const btn = rows[si].querySelector('.rtn-set-check');
      if (btn) btn.classList.toggle('checked', sets[si].done);
    }
  }
  if (sets[si].done) {
    const ex = sessExInfo(exId);
    if (ex && ex.restSecs) startRtnTimerBand(exId, ex.restSecs);
  }
}

function startRtnTimerBand(exId, secs) {
  if (_rtnTimers[exId]) { clearInterval(_rtnTimers[exId]); delete _rtnTimers[exId]; }
  _rtnTimerRemaining[exId] = secs;
  const band = document.getElementById('rtn-tband-' + exId);
  const display = document.getElementById('rtn-tband-display-' + exId);
  if (!band || !display) return;
  band.style.display = 'flex';
  band.classList.remove('done');
  display.textContent = fmtTimerDisplay(secs);
  _pipExId = exId;
  _updatePip();
  // Obtener nombre del ejercicio para media session
  const _ex  = sessExInfo(exId);
  const _exName = _ex?.name || '';
  _msHub.onTimerStart(exId, _exName);
  _rtnTimers[exId] = setInterval(() => {
    _rtnTimerRemaining[exId]--;
    const d = document.getElementById('rtn-tband-display-' + exId);
    const b = document.getElementById('rtn-tband-' + exId);
    if (!d || !b) { clearInterval(_rtnTimers[exId]); delete _rtnTimers[exId]; return; }
    if (_rtnTimerRemaining[exId] <= 0) {
      clearInterval(_rtnTimers[exId]); delete _rtnTimers[exId];
      d.textContent = '¡Listo!';
      b.classList.add('done');
      showToast('⏱ ¡Descansaste! Seguí con la próxima serie.');
      _playTimerDone();
      _msHub.onTimerDone(_exName);
      if (Notification.permission === 'granted') {
        _showNotif('⏱ ¡Descanso terminado!', {
          body: _exName ? `Seguí con ${_exName}` : 'Retomá la rutina',
          tag: 'rtn-timer', icon: './icon.svg', requireInteraction: false,
        });
      }
      if (_pipExId === exId) _updatePip();
      setTimeout(() => { if (_pipExId === exId) { _pipExId = null; _updatePip(); } }, 4000);
    } else {
      d.textContent = fmtTimerDisplay(_rtnTimerRemaining[exId]);
      if (_pipExId === exId) _updatePip();
      _msHub.onTimerTick(exId, _exName);
    }
  }, 1000);
}

function adjustRtnTimer(exId, delta) {
  if (_rtnTimerRemaining[exId] === undefined) return;
  _rtnTimerRemaining[exId] = Math.max(1, _rtnTimerRemaining[exId] + delta);
  const d = document.getElementById('rtn-tband-display-' + exId);
  if (d) d.textContent = fmtTimerDisplay(_rtnTimerRemaining[exId]);
  const b = document.getElementById('rtn-tband-' + exId);
  if (b) b.classList.remove('done');
  if (_pipExId === exId) _updatePip();
}

function skipRtnTimer(exId) {
  if (_rtnTimers[exId]) { clearInterval(_rtnTimers[exId]); delete _rtnTimers[exId]; }
  delete _rtnTimerRemaining[exId];
  const band = document.getElementById('rtn-tband-' + exId);
  if (band) band.style.display = 'none';
  if (_pipExId === exId) { _pipExId = null; _updatePip(); }
  _msHub.onTimerSkip();
}

function cancelRtnSession() {
  Object.values(_rtnTimers).forEach(clearInterval);
  _rtnTimers = {};
  _rtnTimerRemaining = {};
  if (_rtnChrono) { clearInterval(_rtnChrono); _rtnChrono = null; }
  _rtnExpandedEx = new Set();
  _pipExId = null; _updatePip();
  S.activeRtnSession = null;
  _msHub.showReminders();
  saveState(); renderRutinas();
}

function finishRtnSession() {
  if (!S.activeRtnSession) return;
  const sess = S.activeRtnSession;
  // Flush de las filas visibles (los swapeados-out ya quedaron guardados antes del swap).
  (sess.exOrder || []).forEach(id => _readSaveRtnSets(id));
  const { routineId, startedAt, exSets, exMeta } = sess;
  const date = getActiveDate();
  const duration = Math.floor((Date.now() - startedAt) / 1000);
  let vol = 0, totalSets = 0;
  Object.values(exSets).forEach(sets => sets.forEach(s => {
    if ((s.reps || 0) > 0) { vol += (s.weight || 0) * s.reps; totalSets++; }
  }));
  if (!S.routineLog[routineId]) S.routineLog[routineId] = [];
  S.routineLog[routineId].push({
    id: uid(), date,
    exSets: JSON.parse(JSON.stringify(exSets)),
    vol, sets: totalSets, duration
  });
  // Historial GLOBAL por ejercicio: cada instancia (incluidos swaps) loguea a su libId.
  if (!S.exerciseHistory) S.exerciseHistory = {};
  Object.entries(exSets).forEach(([instId, sets]) => {
    const libId = exMeta && exMeta[instId] && exMeta[instId].libId;
    if (!libId) return;
    const cleanSets = sets.filter(s => (s.reps || 0) > 0).map(s => ({ weight: s.weight || 0, reps: s.reps }));
    if (!cleanSets.length) return;
    if (!S.exerciseHistory[libId]) S.exerciseHistory[libId] = [];
    S.exerciseHistory[libId].push({ date, routineId, sets: cleanSets });
  });
  Object.values(_rtnTimers).forEach(clearInterval);
  _rtnTimers = {};
  _rtnTimerRemaining = {};
  if (_rtnChrono) { clearInterval(_rtnChrono); _rtnChrono = null; }
  _rtnExpandedEx = new Set();
  _pipExId = null; _updatePip();
  S.activeRtnSession = null;
  _msHub.showReminders();
  // Marcar hábito de entrenamientos y actualizar calendario
  const today = getActiveDate();
  const gymHabit = (S.habitTrackers?.salud || []).find(h => h.id === 'habit-entrenamientos');
  if (gymHabit) {
    gymHabit.days[today] = 'done';
    _habitActiveId['salud'] = 'habit-entrenamientos';
  }
  saveState(); renderRutinas(); renderHabitsCard('salud');
  showConfetti(3000);
  showToast(`💪 ¡Sesión guardada! ${vol ? vol.toLocaleString() + ' kg de volumen' : ''}`, 4000);
}

function renderBodyWeight() {
  // La UI de peso corporal no está en el HTML actual; JARVIS sigue registrando el dato
  // (jarvis-brain.js llama esta función tras guardar) — sin el guard tiraba TypeError.
  const numEl = document.getElementById('weightNum');
  if (!numEl) return;
  const entries = S.bodyWeight.slice().sort((a,b)=>a.date.localeCompare(b.date));
  if (entries.length === 0) { numEl.textContent='—'; return; }
  const last = entries[entries.length-1];
  numEl.textContent = last.value;
  document.getElementById('weightUnitEl').textContent = last.unit;
  if (entries.length >= 2) {
    const prev = entries[entries.length-2];
    const delta = (last.value - prev.value).toFixed(1);
    const el = document.getElementById('weightDeltaEl');
    const positive = delta > 0;
    el.innerHTML = `<span class="weight-delta ${positive?'delta-up':'delta-down'}">${positive?'▲':'▼'} ${Math.abs(delta)} ${last.unit}</span>`;
  }
}

// ── Progress Photos ──
function renderPhotos() {
  // La UI de fotos no está en el HTML actual; _migratePhotos() todavía la llama — guard.
  const grid = document.getElementById('photoGrid');
  if (!grid) return;
  const empty = document.getElementById('photoEmpty');
  grid.innerHTML = '';
  if (!S.photos.length) { empty.style.display=''; document.getElementById('compareBtn').style.display='none'; return; }
  empty.style.display = 'none';
  document.getElementById('compareBtn').style.display = S.photos.length >= 2 ? '' : 'none';
  S.photos.slice().reverse().forEach((ph,i) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    div.innerHTML = `<img src="${ph.src}" alt="Progress photo"><div class="photo-meta">${fmtDate(ph.date)}${ph.weight?' · '+ph.weight+' kg':''}</div>`;
    div.addEventListener('dblclick', () => { if (confirm('¿Eliminar esta foto?')) _deletePhoto(ph); });
    grid.appendChild(div);
  });
}

function _deletePhoto(ph) {
  if (ph.path && _storage) { try { _storage.ref(ph.path).delete().catch(e => console.warn('[photos] no se pudo borrar de Storage:', e.message)); } catch(e){} }
  S.photos = S.photos.filter(p => p.id !== ph.id);
  saveState(); renderPhotos();
}

// Migra (una vez) las fotos embebidas viejas (data URL) a Storage para encoger el documento de Firestore.
async function _migratePhotos() {
  if (!_storage || !_auth.currentUser) return;
  const pending = (S.photos || []).filter(p => p.src && p.src.startsWith('data:'));
  if (!pending.length) return;
  let changed = false;
  for (const p of pending) {
    try {
      const photoId = p.id || (p.id = uid());   // persiste el id generado (evita ids vacíos duplicados)
      const path = `photos/${_auth.currentUser.uid}/${photoId}`;
      const ref = _storage.ref(path);
      await ref.putString(p.src, 'data_url');
      p.src = await ref.getDownloadURL();
      p.path = path;
      changed = true;
    } catch (e) { console.warn('[photos] migracion pausada (Storage no listo):', e.message); break; }
  }
  if (changed) { saveState(); if (typeof renderPhotos === 'function') renderPhotos(); }
}

// ── Gym Config ──
function renderGymConfigModal() {
  const gymList = document.getElementById('gymList');
  gymList.innerHTML = S.gyms.map(g=>`
    <div class="flex items-center justify-between mb-8">
      <span class="text-sm">${g.name}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteGym('${g.id}')">Eliminar</button>
    </div>`).join('') || '<p class="text-xs text-ter mb-8">Sin gimnasios</p>';
  // Split grid
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const names = { Mon:'L',Tue:'M',Wed:'X',Thu:'J',Fri:'V',Sat:'S',Sun:'D' };
  const options = ['','Push','Pull','Legs','Upper','Lower','Full Body','Descanso'];
  const grid = document.getElementById('splitGrid');
  grid.innerHTML = days.map(d=>`
    <div class="split-day">
      <label>${names[d]}</label>
      <select id="split_${d}" class="inp" style="padding:4px;font-size:10px">
        ${options.map(o=>`<option ${S.split[d]===o?'selected':''}>${o}</option>`).join('')}
      </select>
    </div>`).join('');
}

function addGym() {
  const name = document.getElementById('gymName').value.trim();
  if (!name) return;
  S.gyms.push({ id:uid(), name });
  document.getElementById('gymName').value = '';
  saveState(); renderGymConfigModal();
}
function deleteGym(id) {
  S.gyms = S.gyms.filter(g=>g.id!==id);
  if (S.currentGym===id) S.currentGym=null;
  saveState(); renderGymConfigModal();
}
function saveSplit() {
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>{
    const el = document.getElementById('split_'+d); if (el) S.split[d]=el.value;
  });
  saveState(); renderTodaySplit(); closeModal('modal-cfg-gym'); showToast('Split guardado');
}
function renderTodaySplit() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const day = days[new Date().getDay()];
  const sp = S.split[day] || '—';
  document.getElementById('todaySplit').textContent = sp;
}
// ── Exercises & Workout ──
function renderExercises() {
  const list = document.getElementById('exerciseList');
  const today = getActiveDate();
  const exercises = S.currentGym ? S.exercises.filter(e=>e.gymId===S.currentGym) : S.exercises;
  list.innerHTML = '';
  if (!exercises.length) { list.innerHTML='<p class="text-xs text-ter" style="padding:8px 0">Sin ejercicios configurados para este gimnasio.</p>'; return; }

  const dayLog = S.workoutLog[today] || {};
  let hasAnySets = false;

  exercises.forEach(ex => {
    const exSets = dayLog[ex.id] || [];
    if (exSets.length) hasAnySets = true;

    const card = document.createElement('div');
    card.className = 'exercise-card';
    const setsHtml = (exSets.length ? exSets : [{ weight:'', reps:'' }]).map((set,si)=>
      `<div class="set-row">
        <span class="set-num">S${si+1}</span>
        <input class="set-inp" type="number" placeholder="kg" value="${set.weight||''}" data-ex="${ex.id}" data-si="${si}" data-field="weight">
        <span class="set-label">kg</span>
        <input class="set-inp" type="number" placeholder="reps" value="${set.reps||''}" data-ex="${ex.id}" data-si="${si}" data-field="reps" style="margin-left:4px">
        <span class="set-label">reps</span>
      </div>`
    ).join('');
    const lastMax = exSets.length ? Math.max(...exSets.map(s=>s.reps||0)) : 0;
    const overloadMsg = lastMax >= ex.repMax ?
      `<div class="overload-msg">🎯 Alcanzaste ${lastMax} reps — sube ${ex.increment}${ex.unit} la próxima sesión. Espera hacer ${ex.repMin}-${ex.repMin+1} reps.</div>` : '';

    // Build progression history for this exercise
    const progDates = Object.keys(S.workoutLog).sort().slice(-8);
    const progHasData = progDates.some(d => S.workoutLog[d][ex.id]?.length);

    card.innerHTML = `
      <div class="exercise-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="ex-name">${ex.name}</span>
        <span class="ex-range">${ex.repMin}–${ex.repMax} reps · +${ex.increment}${ex.unit}</span>
        <button class="icon-btn" onclick="event.stopPropagation();openEditExercise('${ex.id}')" style="color:var(--tt)">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" onclick="event.stopPropagation();deleteExercise('${ex.id}')" style="color:var(--tt)">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
        <span class="ex-chevron">▾</span>
      </div>
      <div class="exercise-body" id="exbody_${ex.id}">
        <div id="sets_${ex.id}">${setsHtml}</div>
        ${overloadMsg}
        <div class="flex gap-8 mt-8">
          <button class="btn btn-ghost btn-sm" onclick="addSet('${ex.id}')">+ Serie</button>
          <button class="btn btn-primary btn-sm" onclick="saveExSets('${ex.id}')">Guardar series</button>
        </div>
        ${progHasData ? `<div class="ex-chart-wrap"><canvas id="exchart_${ex.id}"></canvas></div>` : ''}
      </div>
    `;
    // Auto-expand if sets were logged today
    if (exSets.length) card.classList.add('expanded');
    list.appendChild(card);
    // Draw progression chart if data exists
    if (progHasData) drawExerciseChart(ex.id, progDates);
  });

  // Auto-save on blur (not change) to avoid re-render while typing
  list.querySelectorAll('.set-inp').forEach(inp => {
    inp.addEventListener('blur', () => {
      const exId = inp.dataset.ex;
      // Save to state but don't re-render (preserve focus/position)
      saveExSetsQuiet(exId);
    });
  });

  document.getElementById('finishWorkoutBtn').style.display = hasAnySets ? '' : 'none';
}

function addSet(exId) {
  const today = getActiveDate();
  if (!S.workoutLog[today]) S.workoutLog[today] = {};
  // Flush current DOM values before rebuilding (user may not have blurred yet)
  const currentSets = readExSets(exId);
  if (currentSets.length) S.workoutLog[today][exId] = currentSets;
  else if (!S.workoutLog[today][exId]) S.workoutLog[today][exId] = [];
  S.workoutLog[today][exId].push({ weight: '', reps: '' });
  saveState(); renderExercises();
}

function readExSets(exId) {
  const container = document.getElementById('sets_'+exId);
  if (!container) return [];
  const rows = container.querySelectorAll('.set-row');
  const sets = [];
  rows.forEach(row => {
    const wInp = row.querySelector('[data-field=weight]');
    const rInp = row.querySelector('[data-field=reps]');
    if (wInp && rInp) sets.push({ weight: +wInp.value||0, reps: +rInp.value||0 });
  });
  return sets;
}

// Silent save (no re-render) — used on blur
function saveExSetsQuiet(exId) {
  const today = getActiveDate();
  if (!S.workoutLog[today]) S.workoutLog[today] = {};
  const sets = readExSets(exId);
  if (!sets.length) return;
  S.workoutLog[today][exId] = sets;
  saveState();
}

// Full save with overload check and re-render — used on "Guardar" button
function saveExSets(exId) {
  const today = getActiveDate();
  if (!S.workoutLog[today]) S.workoutLog[today] = {};
  const sets = readExSets(exId);
  S.workoutLog[today][exId] = sets;
  // [SUPABASE] await supabase.from('workout_log').upsert({ date: today, ex_id: exId, sets: JSON.stringify(sets), user_id });
  saveState();
  // Progressive overload check
  const ex = S.exercises.find(e=>e.id===exId);
  if (ex && sets.length) {
    const maxReps = Math.max(...sets.map(s=>s.reps||0));
    if (maxReps >= ex.repMax) {
      showToast(`🎯 ¡${maxReps} reps en ${ex.name}! Súbele ${ex.increment}${ex.unit} la próxima sesión.`, 5000);
    }
  }
  renderExercises();
}

function addExercise() {
  const name = document.getElementById('exName').value.trim();
  if (!name) { showToast('Escribe el nombre del ejercicio'); return; }
  S.exercises.push({
    id: uid(), gymId: S.currentGym||'', name,
    repMin: +document.getElementById('exRepMin').value||6,
    repMax: +document.getElementById('exRepMax').value||8,
    increment: +document.getElementById('exIncrement').value||2.5,
    unit: document.getElementById('exUnit').value
  });
  // [SUPABASE] await supabase.from('exercises').insert({ ... });
  saveState(); renderExercises(); closeModal('modal-add-exercise');
  document.getElementById('exName').value = '';
  showToast('Ejercicio agregado');
}

function deleteExercise(id) {
  S.exercises = S.exercises.filter(e=>e.id!==id);
  saveState(); renderExercises();
}

function drawExerciseChart(exId, dates) {
  const ctx = document.getElementById(`exchart_${exId}`);
  if (!ctx) return;
  const labels = [], maxWeights = [];
  dates.forEach(d => {
    const sets = S.workoutLog[d]?.[exId];
    if (sets && sets.length) {
      labels.push(d.slice(5));
      maxWeights.push(Math.max(...sets.map(s => s.weight || 0)));
    }
  });
  if (labels.length < 2) return;
  new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Peso máx.', data: maxWeights, borderColor: 'rgba(124,142,232,.8)', backgroundColor: 'rgba(124,142,232,.1)', pointRadius: 4, tension: .3, fill: true }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 8 } } }, y: { ticks: { font: { size: 8 }, callback: v => v + ' kg' } } } }
  });
}
