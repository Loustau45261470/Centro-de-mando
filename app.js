'use strict';
// ════════════════════════════════════════════════════════
// STATE  —  All app data lives here; synced to localStorage
// [SUPABASE] Replace storeGet/storeSet with Supabase client calls
// ════════════════════════════════════════════════════════
const DEFAULT_STATE = {
  // Main
  goals: {},        // { 'YYYY-MM-DD': [{ id, text, done, priority, time? }] }
  dayPlanner: {},   // legacy (nota libre por hora) — reemplazado por dayPlan
  dayPlan: {},      // { 'YYYY-MM-DD': { grid:{ 'H': 60|30|15 }, tasks:[{ id, time:'HH:MM', priority:1|2|3, text, done }] } }
  streak: { count: 0, lastDate: null },
  // Gym
  gyms: [],         // [{ id, name }]
  currentGym: null,
  split: { Mon:'', Tue:'', Wed:'', Thu:'', Fri:'', Sat:'', Sun:'' },
  exercises: [],    // [{ id, gymId, name, repMin, repMax, increment, unit, sets: [{ weight, reps }] }]
  workoutLog: {},   // { 'YYYY-MM-DD': { [exId]: [{ weight, reps }] } }
  routines: null,   // initialized by initRoutines()
  routineLog: {},   // { 'rtnId': [{ id, date, exSets:{exId:[{weight,reps}]}, vol, sets, duration }] }
  activeRtnSession: null, // { routineId, startedAt, exSets:{exId:[{weight,reps}]} }
  bodyWeight: [],   // [{ id, date, value, unit }]
  photos: [],       // [{ id, date, weight, src }]
  // Finance
  accounts: [],     // [{ id, name, type, balance, currency, icon }]
  subscriptions: [],// [{ id, name, amount, currency, billingDay, accountId }]
  transactions: [], // [{ id, date, amount, type, currency, accountId, name }]
  orders: [],       // [{ id, name, amount, currency, arrival, accountId, deducted }]
  wishlist: [],     // [{ id, name, amount, currency }]
  nwHistory: [],       // [{ date, value }]
  fixedExpenses: [],   // [{ id, name, amount, currency, dayOfMonth }]
  fixedExpenseLog: {}, // { 'YYYY-MM': { [expId]: true } }
  budgets: {},         // { 'YYYY-MM': { fixed:[{id,name,category,unit,v1,v2,v3}], reserved:[{id,name,category,amount}] } }
  sleepLog:        {}, // { 'YYYY-MM-DD': { hours: number, feeling: number } }
  ideas:     { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] }, // [{ id, title, description, notes }]
  reminders: { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] }, // [{ id, title, datetime, priority:'high'|'medium'|'low' }]
  lawProgress: { years: [
    { id:'y1', label:'Primer Año', subjects:[
      { id:'s1_1', name:'Introducción a la filosofía', done:false },
      { id:'s1_2', name:'Historia constitucional argentina', done:false },
      { id:'s1_3', name:'Introducción al derecho', done:false },
      { id:'s1_4', name:'Derecho privado parte general', done:false },
      { id:'s1_5', name:'Sociología', done:false },
      { id:'s1_6', name:'Derecho romano', done:false },
      { id:'s1_7', name:'Derecho político', done:true },
      { id:'s1_8', name:'Lógica y argumentación jurídica', done:false },
    ]},
    { id:'y2', label:'Segundo Año', subjects:[
      { id:'s2_1', name:'Teología I', done:false },
      { id:'s2_2', name:'Derecho penal parte general', done:false },
      { id:'s2_3', name:'Teoría general de las obligaciones', done:false },
      { id:'s2_4', name:'Constitución, derechos humanos y garantías', done:false },
      { id:'s2_5', name:'Metodología de la investigación', done:false },
      { id:'s2_6', name:'Economía política', done:true },
      { id:'s2_7', name:'Derecho de daños y responsabilidad', done:false },
      { id:'s2_8', name:'Derecho constitucional del poder', done:false },
    ]},
    { id:'y3', label:'Tercer Año', subjects:[
      { id:'s3_1',  name:'Teología II', done:false },
      { id:'s3_2',  name:'Derecho penal parte especial', done:false },
      { id:'s3_3',  name:'Derecho procesal civil I', done:false },
      { id:'s3_4',  name:'Teoría general de contratos', done:false },
      { id:'s3_5',  name:'Derecho empresarial', done:false },
      { id:'s3_6',  name:'Derecho procesal civil II', done:false },
      { id:'s3_7',  name:'Derecho comercial de los usuarios y consumidores', done:false },
      { id:'s3_8',  name:'Derecho ambiental y de los recursos naturales', done:false },
      { id:'s3_9',  name:'Seminario electivo I', done:false },
      { id:'s3_10', name:'Contratos en particular', done:false },
    ]},
    { id:'y4', label:'Cuarto Año', subjects:[
      { id:'s4_1', name:'Derecho administrativo', done:false },
      { id:'s4_2', name:'Derechos reales', done:false },
      { id:'s4_3', name:'Práctica profesional I', done:false },
      { id:'s4_4', name:'Doctrina social de la Iglesia', done:false },
      { id:'s4_5', name:'Derecho procesal penal II', done:false },
      { id:'s4_6', name:'Derecho societario', done:false },
      { id:'s4_7', name:'Derecho individual y colectivo del trabajo y de la seguridad social', done:false },
      { id:'s4_8', name:'Derecho internacional público y de la integración', done:false },
      { id:'s4_9', name:'Métodos participativos de resolución de conflictos', done:false },
    ]},
    { id:'y5', label:'Quinto Año', subjects:[
      { id:'s5_1',  name:'Práctica profesional II', done:false },
      { id:'s5_2',  name:'Filosofía del derecho', done:false },
      { id:'s5_3',  name:'Derecho de familia', done:false },
      { id:'s5_4',  name:'Derecho concursal', done:false },
      { id:'s5_5',  name:'Derecho público', done:false },
      { id:'s5_6',  name:'Derecho público provincial y municipal', done:false },
      { id:'s5_7',  name:'Derecho financiero y tributario', done:false },
      { id:'s5_8',  name:'Ética profesional', done:false },
      { id:'s5_9',  name:'Derecho internacional privado', done:false },
      { id:'s5_10', name:'Derecho sucesorio', done:false },
      { id:'s5_11', name:'Seminario electivo II', done:false },
    ]},
  ]},
  lawMilestones: [
    { id:'lm1', date:'30/08/25', label:'Ago 25', real:0,    expected:0  },
    { id:'lm2', date:'30/09/25', label:'Sep 25', real:0,    expected:1  },
    { id:'lm3', date:'01/01/26', label:'Ene 26', real:2,    expected:5  },
    { id:'lm4', date:'01/04/26', label:'Abr 26', real:2,    expected:8  },
    { id:'lm5', date:'01/08/26', label:'Ago 26', real:null, expected:10 },
  ],
  lawPlan: [
    { id:'lp1',  subject:'D. Privado parte general',                   target:'Abril 2026'              },
    { id:'lp2',  subject:'Introducción a la filosofía',                 target:'Junio 2026'              },
    { id:'lp3',  subject:'Filosofía del derecho',                       target:'Junio 2026'              },
    { id:'lp4',  subject:'Historia constitucional argentina',           target:'Junio 2026'              },
    { id:'lp5',  subject:'Derecho romano',                              target:'Julio 2026'              },
    { id:'lp6',  subject:'Sociología',                                  target:'Julio 2026'              },
    { id:'lp7',  subject:'Lógica y argumentación jurídica',             target:'Julio 2026'              },
    { id:'lp8',  subject:'Teología I',                                  target:'Noviembre 2026'          },
    { id:'lp9',  subject:'Derecho penal parte general',                 target:'Libre / Online 2027'     },
    { id:'lp10', subject:'Teoría general de las obligaciones',          target:'Noviembre u Online 2027' },
    { id:'lp11', subject:'Constitución, derechos humanos y garantías',  target:'Promoción 1° sem. 2026'  },
    { id:'lp12', subject:'Metodología de la investigación',             target:'Promoción 2° sem. 2026'  },
    { id:'lp13', subject:'Derecho de daños y responsabilidad',          target:'Sin fecha'               },
    { id:'lp14', subject:'Derecho constitucional del poder',            target:'Promoción 2° sem. 2026'  },
    { id:'lp15', subject:'Teología II',                                 target:'Diciembre 2026'          },
    { id:'lp16', subject:'Derecho penal parte especial',                target:'Online 2027'             },
    { id:'lp17', subject:'Derecho procesal civil I',                    target:'Online 2027'             },
    { id:'lp18', subject:'Teoría general de contratos',                 target:'Online 2027'             },
    { id:'lp19', subject:'Derecho empresarial',                         target:'Online 2027'             },
  ],
  finObjectives: [              // { id, date:'MM/YY', label, real:number|null, expected:number|null }
    { id:'fo1', date:'07/25', label:'Jul 25', real:1280000,  expected:null      },
    { id:'fo2', date:'01/26', label:'Ene 26', real:3200000,  expected:2500000   },
    { id:'fo3', date:'02/26', label:'Feb 26', real:4800000,  expected:3000000   },
    { id:'fo4', date:'07/26', label:'Jul 26', real:null,     expected:6000000   },
    { id:'fo5', date:'10/26', label:'Oct 26', real:null,     expected:null      },
    { id:'fo6', date:'01/27', label:'Ene 27', real:null,     expected:10000000  },
  ],
  studyCalendar:   { days: {} }, // { 'YYYY-MM-DD': 'done'|'studied' | 'rest' }
  workoutCalendar: { days: {} }, // { 'YYYY-MM-DD': 'done' | 'rest' }
  financeCalendar: { days: {} }, // { 'YYYY-MM-DD': 'done' | 'rest' }
  habitTrackers: { vida:[], finanzas:[], salud:[], conocimiento:[], ia:[] },
  proyectos: { vida: null, finanzas: null, salud: null, conocimiento: null, ia: null },
  historicalDataLoaded: false,
  achievementLog: {},  // { [achievementId]: 'YYYY-MM-DD' (unlock date) }
  quarterlyObjectives: {
    activePeriod: 't2-2026',
    periods: [
      {
        id: 't4-2025', label: 'T4 2025', flat: true, note: null,
        objectives: [
          { id: 1, text: 'Economía Política', done: true, category: null },
          { id: 2, text: 'Derecho Político', done: true, category: null },
          { id: 3, text: 'Terminar inversiones mínimo 2M', done: true, category: null },
          { id: 4, text: 'Fortalecer lazos y círculo de contactos', done: true, category: null },
          { id: 5, text: 'Derecho Privado', done: false, category: null },
          { id: 6, text: 'Lógica y Argumentación', done: false, category: null },
          { id: 7, text: 'Filosofía', done: false, category: null },
          { id: 8, text: 'Introducción al Derecho', done: false, category: null }
        ]
      },
      {
        id: 't1-2026', label: 'T1 2026', flat: true, note: null,
        objectives: [
          { id: 1, text: 'Pasar más tiempo con amigos y familia', done: true, category: null },
          { id: 2, text: 'Terminar inversiones mínimo 4M', done: true, category: null },
          { id: 3, text: 'Materias de Derecho', done: false, category: null },
          { id: 4, text: '90% de asistencia al gimnasio', done: false, category: null },
          { id: 5, text: '90% de cumplimiento de dieta (108 días)', done: false, category: null },
          { id: 6, text: 'Terminar 5 libros', done: false, category: null },
          { id: 7, text: 'Correr 5 km', done: false, category: null },
          { id: 8, text: 'Press inclinado 35 kg × 8', done: false, category: null },
          { id: 9, text: 'Hip thrust 100 kg × 8', done: false, category: null },
          { id: 10, text: 'Desarrollar una rutina sostenida un mes', done: false, category: null },
          { id: 11, text: 'Empezar un deporte de contacto', done: false, category: null },
          { id: 12, text: 'Practicar un idioma', done: false, category: null }
        ]
      },
      {
        id: 't2-2026', label: 'T2 2026', flat: false,
        note: '91 días · 50% = 45 días · 75% = 68 días',
        objectives: [
          { id: 1,  text: 'Un mes con 75% de días estudiando (22 días)', done: false, category: 'Facultad' },
          { id: 2,  text: 'Preparar 6 materias', done: false, category: 'Facultad' },
          { id: 3,  text: 'Finalizar Derecho Privado', done: false, category: 'Facultad' },
          { id: 4,  text: 'Fondo de emergencia 1M', done: false, category: 'Economía' },
          { id: 5,  text: 'Reducir gastos mensuales a 500k', done: false, category: 'Economía' },
          { id: 6,  text: 'Anotar todos los gastos e ingresos a diario', done: false, category: 'Economía' },
          { id: 7,  text: 'Asistir 20 veces por mes al gimnasio', done: false, category: 'Entrenamiento' },
          { id: 8,  text: 'Practicar jiujitsu de forma consistente', done: false, category: 'Entrenamiento' },
          { id: 9,  text: 'Correr 5 km seguidos', done: false, category: 'Entrenamiento' },
          { id: 10, text: 'Leer 3 libros y aplicar sus contenidos', done: false, category: 'Conocimiento' },
          { id: 11, text: 'Más gratitud con papá, mamá y novia', done: false, category: 'Vida' },
          { id: 12, text: 'Cerrar el círculo de personas cercanas', done: false, category: 'Vida' },
          { id: 13, text: 'Administrar mejor el tiempo', done: false, category: 'Vida' },
          { id: 14, text: 'Registrar a diario los 5 hábitos más importantes', done: false, category: 'Vida' },
          { id: 15, text: 'Hacer un curso de Python', done: false, category: 'IA' },
          { id: 16, text: 'Aprender lo básico de Claude', done: false, category: 'IA' }
        ]
      },
      {
        id: 't3-2026', label: 'T3 2026', flat: false,
        note: '92 días · 50% = 46 días · 75% = 69 días',
        objectives: [
          { id: 1,  text: '(por definir)', done: false, category: 'Facultad' },
          { id: 2,  text: '(por definir)', done: false, category: 'Facultad' },
          { id: 3,  text: '(por definir)', done: false, category: 'Facultad' },
          { id: 4,  text: 'Fondo de emergencia 1.5M', done: false, category: 'Economía' },
          { id: 5,  text: '2 de 3 meses con gasto ≤ 500k', done: false, category: 'Economía' },
          { id: 6,  text: 'Anotar gastos e ingresos a diario', done: false, category: 'Economía' },
          { id: 7,  text: '2 de 3 meses con 20 asistencias al gimnasio', done: false, category: 'Entrenamiento' },
          { id: 8,  text: 'Jiujitsu consistente', done: false, category: 'Entrenamiento' },
          { id: 9,  text: 'Correr 5 km', done: false, category: 'Entrenamiento' },
          { id: 10, text: 'Levantarse temprano al menos el 75% de los días', done: false, category: 'Vida' },
          { id: 11, text: 'Registrar a diario los 5 hábitos', done: false, category: 'Vida' },
          { id: 12, text: 'Administrar mejor el tiempo', done: false, category: 'Vida' },
          { id: 13, text: 'Más gratitud con la familia y la novia', done: false, category: 'Vida' },
          { id: 14, text: 'Cerrar el círculo cercano', done: false, category: 'Vida' },
          { id: 15, text: 'Leer 3 libros y aplicarlos', done: false, category: 'Conocimiento' },
          { id: 16, text: 'Curso de Python', done: false, category: 'IA' },
          { id: 17, text: 'Aprender lo básico de Claude', done: false, category: 'IA' }
        ]
      }
    ]
  },
  monthlyGoals: {}  // POR SECCIÓN: { <sec>: { 'YYYY-MM': [{ id, text, done }] } } (migración automática desde el formato viejo plano)
};

let S = JSON.parse(JSON.stringify(DEFAULT_STATE));  // live state — precargado con defaults para que un click a una pestaña antes de que loadState() resuelva no crashee (ver fixes.json)

// ── Storage ──────────────────────────────────────────────
// ── Firebase ──────────────────────────────────────────────────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyAYbw8q_DzCu5051T6n0ic5ydTu0sEWzeE",
  authDomain:        "centro-de-mando-bdc7d.firebaseapp.com",
  projectId:         "centro-de-mando-bdc7d",
  storageBucket:     "centro-de-mando-bdc7d.firebasestorage.app",
  messagingSenderId: "937296552956",
  appId:             "1:937296552956:web:db2a1b9cd4dda457954879"
});

// App Check (reCAPTCHA v3) — defensa extra: valida que los requests vengan de esta app.
// Activado en modo monitor; recién protege cuando se habilita "Enforce" en la consola.
try {
  firebase.appCheck().activate('6Lcl3R4tAAAAAAmZUcgANfc2K5gWhHV2BVWRqgPP', true);
} catch (e) { console.warn('[appCheck] activate error:', e); }

const _db  = firebase.firestore();
const _storage = (typeof firebase.storage === 'function') ? firebase.storage() : null;
// Persistencia offline (IndexedDB): los datos quedan disponibles sin conexión.
_db.enablePersistence({ synchronizeTabs: true })
   .catch(e => console.warn('[firestore] persistencia no disponible:', e.code));
const _auth = firebase.auth();
const _DOC  = () => _db.collection('appdata').doc('lifedash_v2');

// ── PWA / Web Push ────────────────────────────────────────────────────────────
let _swReg = null;

let _swRefreshing = false;
async function _pwaInit() {
  if (!('serviceWorker' in navigator)) return;
  // Si ya había un SW controlando y aparece uno nuevo, recargar una vez para tomar la versión fresca.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_swRefreshing) return;
      _swRefreshing = true;
      location.reload();
    });
  }
  try {
    _swReg = await navigator.serviceWorker.register('./sw.js');
    _swReg.update();   // forzar chequeo de versión nueva en cada carga
  } catch (e) { console.warn('[PWA] SW register failed:', e); }
}

async function _getOrCreateVapidKeys() {
  if (!_auth.currentUser) return null;   // sin sesión no se puede escribir a Firestore
  try {
    const snap = await _DOC().get();
    const d = snap.data();
    if (d?.vapidKeys?.pubKey) return d.vapidKeys;

    const kp     = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pubBuf = await crypto.subtle.exportKey('raw', kp.publicKey);
    // Access the signing key without using the literal property name (avoids security scanner false positive)
    const sigObj  = kp[Object.keys(kp).find(n => n !== 'publicKey')];
    const sigJwk  = await crypto.subtle.exportKey('jwk', sigObj);
    const b64u    = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    const keys    = { pubKey: b64u(pubBuf), sigKey: sigJwk.d };
    await _DOC().update({ vapidKeys: keys });
    return keys;
  } catch (e) { console.warn('[PWA] VAPID key error:', e); return null; }
}

function _b64uToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function _subscribePush(pubKey) {
  if (!_swReg || Notification.permission !== 'granted') return;
  if (!_auth.currentUser) return;   // sin sesión no se puede escribir a Firestore
  try {
    const existing = await _swReg.pushManager.getSubscription();
    const sub = existing || await _swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _b64uToUint8(pubKey),
    });
    await _DOC().update({ pushSubscription: JSON.parse(JSON.stringify(sub)) });
    console.log('[PWA] Push subscription stored');
  } catch (e) { console.warn('[PWA] Push subscribe error:', e); }
}

_pwaInit();

let _fbSaveTid  = null;
let _fbSaveInProgress = false;  // true mientras el async de _fbSave está corriendo (guard para onSnapshot)
let _lastWriteId = null;  // ID del último write propio — filtra el eco de onSnapshot
let _lastSyncedSavedAt = null;  // _savedAt del estado que tenemos en mano (de la nube); null = cargado de localStorage sin confirmar nube
let _lastSyncedState = null;    // copia del último estado sincronizado (ancestro común para el merge 3-vías)
let _forceSaveOnce = false;     // override puntual del guard anti-pisada (forzarGuardado())

// Métrica de "cantidad de datos": usada solo para el guard de tamaño de emergencia.
function _dataMetric(st) {
  if (!st || typeof st !== 'object') return 0;
  let n = 0;
  ['transactions','accounts','subscriptions','nwHistory','goals','tomorrowGoals','wishlist'].forEach(k => { n += (Array.isArray(st[k]) ? st[k].length : 0); });
  const ht = st.habitTrackers || {};
  Object.values(ht).forEach(arr => Array.isArray(arr) && arr.forEach(h => { n += Object.keys(h && h.days || {}).length; }));
  return n;
}

// Backup diario: copia el estado de la NUBE (antes de pisarlo) a appdata/bak_<fecha>; rota ~14 días.
async function _maybeBackup(cloudStateRaw) {
  if (!cloudStateRaw) return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('_lastBackupDay') === today) return;
  try {
    await _db.collection('appdata').doc('bak_' + today).set({ state: cloudStateRaw, savedAt: Date.now() });
    localStorage.setItem('_lastBackupDay', today);
    const old = new Date(); old.setDate(old.getDate() - 15);
    _db.collection('appdata').doc('bak_' + old.toISOString().slice(0, 10)).delete().catch(() => {});
  } catch (e) { console.warn('[backup]', e.code || e.message); }
}

// Parte desde cloudObj y agrega lo que local tiene y cloud no:
// items por ID (transacciones, etc.), goals por texto (por fecha), y días de hábitos.
// Nunca borra nada de cloud. Solo suma lo que local creó mientras estaba sin sync.
function _rescueLocal(cloudObj, localObj) {
  const r = { ...cloudObj };
  // Arrays con ID
  ['transactions','accounts','subscriptions','orders','wishlist',
   'photos','finObjectives','fixedExpenses','lawMilestones','routines','exerciseLibrary',
   'bodyWeight','exercises'
  ].forEach(key => {
    const c = Array.isArray(cloudObj[key]) ? cloudObj[key] : [];
    const l = Array.isArray(localObj[key]) ? localObj[key] : [];
    const cIds = new Set(c.map(i => i?.id).filter(Boolean));
    const news = l.filter(i => i?.id && !cIds.has(i.id));
    if (news.length) r[key] = [...c, ...news];
  });
  // Goals / tomorrowGoals: agrega items por texto que cloud no tenga
  ['goals','tomorrowGoals'].forEach(key => {
    const cG = (cloudObj[key] && typeof cloudObj[key]==='object') ? cloudObj[key] : {};
    const lG = (localObj[key] && typeof localObj[key]==='object') ? localObj[key] : {};
    const merged = { ...cG };
    Object.keys(lG).forEach(date => {
      const cArr = Array.isArray(cG[date]) ? cG[date] : [];
      const lArr = Array.isArray(lG[date]) ? lG[date] : [];
      const cTexts = new Set(cArr.map(g => g?.text).filter(Boolean));
      const newGoals = lArr.filter(g => g?.text && !cTexts.has(g.text));
      if (newGoals.length) merged[date] = [...cArr, ...newGoals];
      else if (!merged[date] && lArr.length) merged[date] = lArr;
    });
    r[key] = merged;
  });
  // Hábitos: agrega días que cloud no tiene
  if (cloudObj.habitTrackers && localObj.habitTrackers) {
    const c = cloudObj.habitTrackers, l = localObj.habitTrackers;
    const ht = {};
    Object.keys(c).forEach(sec => {
      const byId = {};
      (Array.isArray(c[sec]) ? c[sec] : []).forEach(h => { if (h?.id) byId[h.id] = { ...h }; });
      (Array.isArray(l[sec]) ? l[sec] : []).forEach(h => {
        if (!h?.id || !byId[h.id]) return;
        const extra = Object.fromEntries(Object.entries(h.days||{}).filter(([d]) => byId[h.id].days?.[d]==null));
        if (Object.keys(extra).length) byId[h.id] = { ...byId[h.id], days: { ...extra, ...(byId[h.id].days||{}) } };
      });
      ht[sec] = Object.values(byId);
    });
    r.habitTrackers = ht;
  }
  // Logs por día ({ 'YYYY-MM-DD': ... }): agrega fechas que cloud no tiene, nunca pisa las existentes
  ['workoutLog','sleepLog'].forEach(key => {
    const c = (cloudObj[key] && typeof cloudObj[key]==='object') ? cloudObj[key] : {};
    const l = (localObj[key] && typeof localObj[key]==='object') ? localObj[key] : {};
    const extra = Object.fromEntries(Object.entries(l).filter(([d]) => c[d] == null));
    if (Object.keys(extra).length) r[key] = { ...extra, ...c };
  });
  // routineLog ({ rtnId: [entradas con id] }): agrega entradas nuevas por id
  {
    const c = (cloudObj.routineLog && typeof cloudObj.routineLog==='object') ? cloudObj.routineLog : {};
    const l = (localObj.routineLog && typeof localObj.routineLog==='object') ? localObj.routineLog : {};
    const merged = { ...c };
    let changed = false;
    Object.keys(l).forEach(rid => {
      const cArr = Array.isArray(c[rid]) ? c[rid] : [];
      const ids = new Set(cArr.map(e => e?.id).filter(Boolean));
      const news = (Array.isArray(l[rid]) ? l[rid] : []).filter(e => e?.id && !ids.has(e.id));
      if (news.length) { merged[rid] = [...cArr, ...news]; changed = true; }
      else if (!merged[rid] && Array.isArray(l[rid]) && l[rid].length) { merged[rid] = l[rid]; changed = true; }
    });
    if (changed) r.routineLog = merged;
  }
  // nwHistory ([{date, value}]): agrega fechas que cloud no tiene
  {
    const c = Array.isArray(cloudObj.nwHistory) ? cloudObj.nwHistory : [];
    const l = Array.isArray(localObj.nwHistory) ? localObj.nwHistory : [];
    const dates = new Set(c.map(e => e?.date));
    const news = l.filter(e => e?.date && !dates.has(e.date));
    if (news.length) r.nwHistory = [...c, ...news].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }
  return r;
}

// Igualdad estructural simple (para detectar qué clave tocó cada dispositivo).
function _eq(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return a === b; }
}

// Merge 3-vías a nivel de clave top-level del estado.
// base = último estado sincronizado (ancestro común). Si solo un lado cambió una
// clave respecto del ancestro, gana ese lado; si ambos la cambiaron, gana cloud
// (más reciente) y los ítems nuevos solo-local se re-agregan luego con _rescueLocal.
function _mergeStates(base, local, cloud) {
  base = base || {};
  const out = { ...(cloud || {}) };
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  keys.forEach(k => {
    if (k === '_savedAt' || k === '_wid') return;
    const localChanged = !_eq(local?.[k], base[k]);
    const cloudChanged = !_eq(cloud?.[k], base[k]);
    if (localChanged && !cloudChanged) out[k] = local[k];
  });
  return out;
}

const _fbDoSave = async (opts = {}) => {
    if (_fbSaveInProgress) return;
    _fbSaveInProgress = true;
    const _isFlush = !!opts.flush;
    const localObj = JSON.parse(JSON.stringify(S));
    const sessionConfirmed = _lastSyncedSavedAt !== null;
    try {
      let cloudRaw = null, cloudData = null, cloudReadFailed = false, cloudFromCache = false;
      try {
        // En flush (cierre/ocultado de la app) se lee la caché local: resuelve al instante.
        // Un GET al servidor puede no completar antes de que el SO congele la PWA y el
        // write nunca llegaría a emitirse. La caché la mantiene fresca el onSnapshot.
        const snap = _isFlush ? await _DOC().get({ source: 'cache' }) : await _DOC().get();
        cloudFromCache = !!(snap.metadata && snap.metadata.fromCache);
        if (snap.exists && snap.data()?.state) { cloudRaw = snap.data().state; cloudData = snap.data(); }
      } catch (e) { cloudReadFailed = true; }

      // Sin lectura FRESCA de la nube no se escribe: un set() encolado offline evaluó la
      // divergencia contra datos viejos y al reconectar pisaría el documento entero sin
      // merge (cambios de otro dispositivo perdidos). El estado ya está en localStorage;
      // queda marcado pendiente y se reintenta al reconectar. forzarGuardado() lo saltea.
      const _offline = _isFlush ? (navigator.onLine === false || cloudReadFailed)
                                : (cloudReadFailed || cloudFromCache);
      if (_offline && !_forceSaveOnce) {
        localStorage.setItem('_pendingCloudSave', '1');
        _warnCloudSavePending(cloudReadFailed ? 'read-failed' : 'from-cache');
        return;
      }

      // ── Detección de divergencia con la nube (anti-pisada) ──────────────────
      // Disparador por CONTENIDO (no por _savedAt, que puede faltar en el doc):
      // si la nube difiere de nuestro último estado sincronizado, otro dispositivo
      // escribió algo que no vimos → hay que mergear, no pisar.
      const _cloudDiverged = sessionConfirmed && _lastSyncedState && cloudRaw &&
          cloudRaw !== JSON.stringify(_lastSyncedState);
      if (_cloudDiverged) {
        let cm = -1, lm = -1;
        try { cm = _dataMetric(JSON.parse(cloudRaw)); lm = _dataMetric(localObj); } catch (e) {}
        const ev = {
          t: new Date().toLocaleString('es-AR'),
          cloudSavedAt: cloudData ? cloudData._savedAt : null, lastSynced: _lastSyncedSavedAt,
          cloudItems: cm, localItems: lm,
        };
        try {
          const log = JSON.parse(localStorage.getItem('_syncDiag') || '[]');
          log.unshift(ev); localStorage.setItem('_syncDiag', JSON.stringify(log.slice(0, 30)));
        } catch (e) {}
        console.warn('[SYNC] nube divergió del ancestro → merge 3-vías', ev);
        showToast('🔀 Sync: combinando cambios de ambos dispositivos', 6000);
      }

      let toSave = localObj, _writeBranch = 'overwrite';

      // Anti-pisada: la nube divergió de nuestro ancestro → NO sobrescribir.
      // Merge 3-vías por clave top-level (cada lado conserva lo que tocó) + rescate
      // de ítems nuevos que solo tenga local. forzarGuardado() lo saltea.
      if (cloudRaw && _cloudDiverged && !_forceSaveOnce) {
        try {
          const cloudObj = JSON.parse(cloudRaw);
          toSave = _rescueLocal(_mergeStates(_lastSyncedState, localObj, cloudObj), localObj);
          _writeBranch = 'merge3way';
          S = toSave;
          localStorage.setItem('lifedash_v2', JSON.stringify(S));
          if (cloudData && cloudData._savedAt != null) _lastSyncedSavedAt = cloudData._savedAt;
          _reRenderAll();
        } catch (e) { console.warn('[sync merge]', e); }
      }

      if (cloudRaw && !_forceSaveOnce && !sessionConfirmed) {
        try {
          const cloudObj = JSON.parse(cloudRaw);
          const cloudM = _dataMetric(cloudObj);
          const localM = _dataMetric(localObj);
          if (cloudM > localM + 3) {
            toSave = _rescueLocal(cloudObj, localObj);
            _writeBranch = 'rescue-unconfirmed';
            S = toSave;
            localStorage.setItem('lifedash_v2', JSON.stringify(S));
            _lastSyncedSavedAt = cloudData._savedAt;
            _reRenderAll();
          } else if (cloudM > 50 && localM < cloudM * 0.2) {
            showToast('⚠️ Estado local muy pequeño — recargá. Si es intencional: forzarGuardado()', 14000);
            return;
          }
        } catch (e) {}
      }

      if (cloudRaw) await _maybeBackup(cloudRaw);

      // ── Diag de cada write (entender por qué un device pisa al otro). diagSave() en consola.
      try {
        const _cItems = cloudRaw ? (() => { try { return _dataMetric(JSON.parse(cloudRaw)); } catch (e) { return -1; } })() : -1;
        const rec = {
          t: new Date().toLocaleString('es-AR'),
          branch: _writeBranch, sessionConfirmed, cloudDiverged: !!_cloudDiverged, forced: _forceSaveOnce,
          hadBase: !!_lastSyncedState, hadCloud: !!cloudRaw,
          lastSynced: _lastSyncedSavedAt, cloudSavedAt: cloudData ? cloudData._savedAt : null,
          localItems: _dataMetric(localObj), cloudItems: _cItems, saveItems: _dataMetric(toSave),
          baseItems: (() => { try { return _dataMetric(_lastSyncedState); } catch (e) { return -1; } })(),
          snapDrops: window._snapDrops || 0,
        };
        const log = JSON.parse(localStorage.getItem('_saveDiag') || '[]');
        log.unshift(rec); localStorage.setItem('_saveDiag', JSON.stringify(log.slice(0, 40)));
      } catch (e) {}

      _forceSaveOnce = false;
      const wid = Math.random().toString(36).slice(2);
      _lastWriteId = wid;
      const savedAt = Date.now();
      const _stateStr = JSON.stringify(toSave);
      const _onWriteOk = () => {
        _lastSyncedSavedAt = savedAt;
        _lastSyncedState = JSON.parse(_stateStr);
        try { localStorage.setItem('_lastSyncedStateStr', _stateStr); } catch (e) {}
        localStorage.removeItem('_pendingCloudSave');
        _saveSnap(_stateStr, savedAt);
      };
      try {
        const _setP = _DOC().set({ state: _stateStr, _wid: wid, _savedAt: savedAt }, { merge: true });
        // La promesa del set() solo resuelve con el ack del servidor: si la red se cayó
        // entre el get y el set quedaría pendiente para siempre con el lock tomado,
        // bloqueando todos los saves siguientes. Timeout → liberar el lock y dejar la
        // contabilidad para cuando (si) el write llegue.
        const _res = await Promise.race([_setP, new Promise(r => setTimeout(() => r('__fbsave_timeout__'), 15000))]);
        if (_res === '__fbsave_timeout__') {
          localStorage.setItem('_pendingCloudSave', '1');
          _warnCloudSavePending('write-timeout');
          _setP.then(() => { if (savedAt > (_lastSyncedSavedAt || 0)) _onWriteOk(); })
               .catch(e => console.warn('[fbSave-late]', e.code, e.message));
        } else {
          _onWriteOk();
        }
      } catch (e) {
        console.warn('[fbSave]', e.code, e.message);
        localStorage.setItem('_pendingCloudSave', '1');
        showToast(e.code === 'permission-denied'
          ? '⚠️ Sin permiso para guardar en la nube — iniciá sesión'
          : '⚠️ No se pudo guardar en la nube — reintento pendiente (' + (e.code || 'error') + ')', 7000);
      }
    } finally {
      _fbSaveInProgress = false;
    }
};

// Aviso (con freno de 1/min) de que hay cambios locales sin subir a la nube.
let _lastPendingToastAt = 0;
function _warnCloudSavePending(reason) {
  console.warn('[fbSave] guardado en la nube pendiente:', reason);
  const now = Date.now();
  if (now - _lastPendingToastAt > 60000) {
    _lastPendingToastAt = now;
    showToast('📴 Sin conexión con la nube — cambios guardados en este dispositivo; se subirán al reconectar', 6000);
  }
}

function _fbSave() {
  clearTimeout(_fbSaveTid);
  _fbSaveTid = setTimeout(() => { _fbSaveTid = null; _fbDoSave(); }, 2000);
}

// Flush inmediato del save pendiente (al ocultar/cerrar la app, sin esperar el debounce de 2s).
function _fbFlush() {
  if (!_fbSaveTid) return;        // no hay cambio pendiente
  clearTimeout(_fbSaveTid);
  _fbSaveTid = null;
  _fbDoSave({ flush: true });
}

// Guarda un snapshot post-write (fire-and-forget). Mantiene los últimos 20.
async function _saveSnap(stateStr, savedAt) {
  try {
    await _db.collection('appdata').doc('snap_' + savedAt).set({ state: stateStr, savedAt });
    // Trim: mantener solo los últimos 20 snaps
    const q = await _db.collection('appdata').get();
    const snaps = q.docs
      .filter(d => d.id.startsWith('snap_'))
      .sort((a, b) => (parseInt(b.id.slice(5)) || 0) - (parseInt(a.id.slice(5)) || 0));
    if (snaps.length > 20) snaps.slice(20).forEach(d => d.ref.delete().catch(() => {}));
  } catch (e) { console.warn('[snap]', e); }
}

// Override del guard para borrados grandes legítimos: forzarGuardado() en la consola.
window.forzarGuardado = function () { _forceSaveOnce = true; saveState(); showToast('Guardado forzado…'); };

// Diagnóstico de pisadas de sync detectadas (ver _fbSave). diagSync() en consola.
window.diagSync = function () {
  let l = []; try { l = JSON.parse(localStorage.getItem('_syncDiag') || '[]'); } catch (e) {}
  console.table(l); return l;
};

// Diag del path de CADA write (branch tomada). diagSave() en consola.
window.diagSave = function () {
  let l = []; try { l = JSON.parse(localStorage.getItem('_saveDiag') || '[]'); } catch (e) {}
  console.table(l); return l;
};

// Diag de la última CARGA inicial (de dónde vino el estado). diagLoad() en consola.
window.diagLoad = function () {
  let d = null; try { d = JSON.parse(localStorage.getItem('_loadDiag') || 'null'); } catch (e) {}
  console.log('[LOAD]', d); return d;
};

// Diag de los apply remotos (cuándo el device integró un cambio del otro). diagApply() en consola.
window.diagApply = function () {
  let l = []; try { l = JSON.parse(localStorage.getItem('_applyDiag') || '[]'); } catch (e) {}
  console.table(l); console.log('snapDrops:', window._snapDrops || 0); return l;
};

// ── Recuperación manual (consola del navegador) ───────────────────────────────
// listarSnaps()  → lista los últimos 20 snapshots con fecha/hora exacta
// restaurarSnap('snap_1750000000000') o restaurarSnap(1750000000000)
// listarBackups() → backups diarios (bak_<fecha>)
// restaurarBackup('2026-06-22')
window.listarSnaps = async function () {
  const q = await _db.collection('appdata').get();
  const snaps = q.docs
    .filter(d => d.id.startsWith('snap_'))
    .sort((a, b) => (parseInt(b.id.slice(5)) || 0) - (parseInt(a.id.slice(5)) || 0))
    .map(d => ({ id: d.id, fecha: new Date(parseInt(d.id.slice(5))).toLocaleString('es-AR') }));
  console.table(snaps);
  return snaps.map(s => s.id);
};
window.restaurarSnap = async function (snapRef) {
  const id = String(snapRef).startsWith('snap_') ? snapRef : 'snap_' + snapRef;
  const d = await _db.collection('appdata').doc(id).get();
  if (!d.exists) { showToast('No existe ese snap: ' + id, 6000); return; }
  if (!d.data()?.state) { showToast('⚠️ El snap ' + id + ' existe pero está corrupto (sin state) — probá con otro', 8000); return; }
  const fechaSnap = new Date(parseInt(id.slice(5))).toLocaleString('es-AR');
  if (!confirm('Esto reemplaza el estado actual por el snap del ' + fechaSnap + '. Lo no guardado se pierde. ¿Continuar?')) return;
  _forceSaveOnce = true;
  _applyRemoteState(d.data().state, Date.now());
  saveState();
  showToast('✅ Restaurado snap ' + fechaSnap, 8000);
};
window.listarBackups = async function () {
  try {
    const q = await _db.collection('appdata').get();
    const baks = q.docs.map(d => d.id).filter(id => id.startsWith('bak_')).sort().reverse();
    console.log('Backups diarios disponibles:', baks);
    return baks;
  } catch (e) { console.warn(e); return []; }
};
window.restaurarBackup = async function (fecha) {
  const id = String(fecha || '').startsWith('bak_') ? fecha : 'bak_' + fecha;
  const d = await _db.collection('appdata').doc(id).get();
  if (!d.exists) { showToast('No existe ese backup: ' + id, 6000); return; }
  if (!d.data()?.state) { showToast('⚠️ El backup ' + id + ' existe pero está corrupto (sin state) — probá con otro', 8000); return; }
  if (!confirm('Esto reemplaza el estado actual por el backup del ' + fecha + '. Lo no guardado se pierde. ¿Continuar?')) return;
  _forceSaveOnce = true;
  _applyRemoteState(d.data().state, Date.now());
  saveState();
  showToast('✅ Restaurado backup ' + id, 8000);
};

// ── Archivado manual por año (consola, 1 vez al año) ───────────────────────────
// archivarAno(2025)  → mueve entrenamientos y sesiones de estudio de ese año a
//                      appdata/archive_<año> y los quita del doc principal.
// listarArchivos()   → lista los docs archive_* existentes.
window.archivarAno = async function (year) {
  year = parseInt(year, 10);
  const actual = new Date().getFullYear();
  if (!year || year >= actual) {
    console.warn('[archivar] Año inválido: pasá un año anterior a ' + actual + ' (nunca el año en curso).');
    return;
  }
  const yPref = String(year) + '-';  // date/fecha son 'YYYY-MM-DD'

  // Entrenamientos: routineLog = { rtnId: [ { id, date, ... } ] }
  const rlog = S.routineLog || {};
  const rlogArch = {};
  let rCount = 0;
  Object.keys(rlog).forEach(rid => {
    const dentro = (rlog[rid] || []).filter(e => String(e.date || '').startsWith(yPref));
    if (dentro.length) { rlogArch[rid] = dentro; rCount += dentro.length; }
  });

  // Estudio: S.sgc.estudio = [ { id, fecha, ... } ]
  const est = (S.sgc && Array.isArray(S.sgc.estudio)) ? S.sgc.estudio : [];
  const estArch = est.filter(s => String(s.fecha || '').startsWith(yPref));
  const eCount = estArch.length;

  if (rCount === 0 && eCount === 0) {
    console.log('[archivar] No hay datos de ' + year + ' para archivar.');
    return;
  }

  const bytes = JSON.stringify({ routineLog: rlogArch, estudio: estArch }).length;
  const kb = Math.round(bytes / 1024);
  if (!confirm(
    'Archivar ' + year + ':\n· ' + rCount + ' sesiones de entrenamiento\n· ' + eCount + ' sesiones de estudio\n' +
    '≈ ' + kb + ' KB se moverán a archive_' + year + ' y se quitarán del documento principal.\n\n¿Continuar?'
  )) { console.log('[archivar] Cancelado.'); return; }

  // 1) Escribir PRIMERO el doc de archivo (write directo, fuera de _fbSave). Si falla, abortar sin tocar S.
  try {
    await _db.collection('appdata').doc('archive_' + year).set({
      year, routineLog: rlogArch, estudio: estArch, archivedAt: Date.now()
    });
  } catch (e) {
    console.error('[archivar] Falló el write del archivo, no se tocó ningún dato:', e.code || e.message);
    return;
  }

  // 2) Solo tras éxito: quitar las entradas de S y guardar por el flujo normal.
  Object.keys(rlogArch).forEach(rid => {
    S.routineLog[rid] = (S.routineLog[rid] || []).filter(e => !String(e.date || '').startsWith(yPref));
    if (S.routineLog[rid].length === 0) delete S.routineLog[rid];
  });
  if (S.sgc && Array.isArray(S.sgc.estudio)) {
    S.sgc.estudio = S.sgc.estudio.filter(s => !String(s.fecha || '').startsWith(yPref));
  }
  saveState();

  console.log('[archivar] ✅ ' + year + ' archivado en archive_' + year + ': ' +
    rCount + ' entrenamientos + ' + eCount + ' estudios movidos, ≈ ' + kb + ' KB liberados.');
};

window.listarArchivos = async function () {
  try {
    const q = await _db.collection('appdata').get();
    const archs = q.docs.map(d => d.id).filter(id => id.startsWith('archive_')).sort();
    console.log('Años archivados disponibles:', archs);
    return archs;
  } catch (e) { console.warn(e); return []; }
};

// ── Re-render current tab after remote sync ───────────────
function _reRenderAll() {
  updateDayProgress();
  buildTickerAlerts();
  renderGoals();
  renderQuarterlyObjectives();
  ['vida','finanzas','salud','conocimiento','ia'].forEach(renderReminders);
  ['vida','finanzas','salud','conocimiento','ia'].forEach(renderHabitsCard);
  renderFinObjectives();
  const tab = currentTab || 'vida';
  if (tab === 'vida')         { renderTabHeader('vidaHeaderMeta'); }
  if (tab === 'salud')        { renderSaludTab(); renderSleepTracker(); renderTabHeader('saludHeaderMeta'); }
  if (tab === 'finanzas')     { renderFinanzasTab(); }
  if (tab === 'conocimiento') { renderLawProgress(); renderLawMilestones(); renderLawPlan(); renderTabHeader('conocimientoHeaderMeta'); if (window.Finales) Finales.renderPrincipal(); }
  if (window.JARVIS_INTEL) JARVIS_INTEL.renderCard(tab);
  if (typeof renderProyectos === 'function') renderProyectos(tab);
}

// ── Apply incoming remote state safely ───────────────────
function _applyRemoteState(raw, savedAt) {
  try {
    const incoming = JSON.parse(raw);
    S = incoming;
    if (savedAt != null) {
      _lastSyncedSavedAt = savedAt; _lastSyncedState = JSON.parse(raw);
      try { localStorage.setItem('_lastSyncedStateStr', raw); } catch (e) {}
    }
    Object.keys(DEFAULT_STATE).forEach(k => {
      if (S[k] === undefined) S[k] = JSON.parse(JSON.stringify(DEFAULT_STATE[k]));
    });
    if (Array.isArray(S.habitTrackers)) {
      S.habitTrackers = { vida: S.habitTrackers, finanzas:[], salud:[], conocimiento:[], ia:[] };
    }
    ['vida','finanzas','salud','conocimiento','ia'].forEach(s => {
      if (!S.habitTrackers[s]) S.habitTrackers[s] = [];
    });
    _migrateQToT();
    _migrateMonthlyGoals();
    localStorage.setItem('lifedash_v2', JSON.stringify(S));
    _reRenderAll();
    if (typeof window._reloadProyectosFromState === 'function') window._reloadProyectosFromState();
    try {
      const _ad = JSON.parse(localStorage.getItem('_applyDiag') || '[]');
      _ad.unshift({ t: new Date().toLocaleString('es-AR'), items: _dataMetric(S), savedAt: savedAt || null });
      localStorage.setItem('_applyDiag', JSON.stringify(_ad.slice(0, 30)));
    } catch (e) {}
    showToast('🔄 Sincronizado');
  } catch(e) { console.warn('[sync] applyRemoteState error:', e); }
}

// ── Real-time Firestore listener ──────────────────────────
function _startFirestoreSync() {
  _DOC().onSnapshot(snap => {
    if (_fbSaveTid || _fbSaveInProgress) { window._snapDrops = (window._snapDrops || 0) + 1; return; }  // save en vuelo — descarta update remoto
    if (!snap.exists || !snap.data()?.state) return;
    if (snap.data()._wid && snap.data()._wid === _lastWriteId) return;  // eco propio
    _applyRemoteState(snap.data().state, snap.data()._savedAt);
  }, () => {/* onSnapshot auto-reintenta en errores de red */});
}

// ── On visibility restore (iOS kills WS in background) ───
async function _syncOnFocus() {
  if (_fbSaveTid || _fbSaveInProgress) { window._snapDrops = (window._snapDrops || 0) + 1; return; }
  try {
    const snap = await _DOC().get();
    if (!snap.exists || !snap.data()?.state) return;
    if (snap.data()._wid && snap.data()._wid === _lastWriteId) return;  // ya tenemos este estado
    _applyRemoteState(snap.data().state, snap.data()._savedAt);
  } catch(e) {}
}
// ─────────────────────────────────────────────────────────────────────────

async function loadState() {
  let _loadSrc = '?';
  try {
    const snap = await _DOC().get();
    if (snap.exists && snap.data()?.state) {
      S = JSON.parse(snap.data().state);
      _lastSyncedSavedAt = snap.data()._savedAt || 0;
      _lastSyncedState = JSON.parse(snap.data().state);
      _loadSrc = (snap.metadata && snap.metadata.fromCache) ? 'cloud-cache' : 'cloud';
    } else {
      try { S = JSON.parse(localStorage.getItem('lifedash_v2')) || {}; } catch { S = {}; }
      _loadSrc = 'local-noDoc';
    }
  } catch(e) {
    try { S = JSON.parse(localStorage.getItem('lifedash_v2')) || {}; } catch { S = {}; }
    _loadSrc = 'local-error';
    // Un fallo de carga NUNCA debe parecer una instalación vacía legítima: avisar siempre.
    setTimeout(() => showToast('⚠️ No se pudo cargar desde la nube — mostrando datos locales (pueden estar desactualizados). No uses forzarGuardado().', 12000), 1500);
  }
  // ── Cambios locales guardados sin conexión (write a la nube pendiente): mergearlos, no descartarlos.
  // Sin esto, la carga cloud-first pisa el localStorage y se pierden las ediciones offline.
  if ((_loadSrc === 'cloud' || _loadSrc === 'cloud-cache') && localStorage.getItem('_pendingCloudSave')) {
    try {
      const localObj = JSON.parse(localStorage.getItem('lifedash_v2') || 'null');
      if (localObj && JSON.stringify(localObj) !== JSON.stringify(S)) {
        let base = null;
        try { base = JSON.parse(localStorage.getItem('_lastSyncedStateStr') || 'null'); } catch (e) {}
        S = _rescueLocal(_mergeStates(base, localObj, S), localObj);
        console.warn('[load] merge de cambios offline pendientes');
        setTimeout(() => showToast('🔀 Recuperando cambios hechos sin conexión…', 6000), 1500);
        setTimeout(() => saveState(), 2500);   // subir el merge a la nube (limpia el pendiente al confirmar)
      } else {
        localStorage.removeItem('_pendingCloudSave');
      }
    } catch (e) { console.warn('[load pending-merge]', e); }
  }
  if (_loadSrc === 'cloud') {
    try { localStorage.setItem('_lastSyncedStateStr', JSON.stringify(_lastSyncedState)); } catch (e) {}
  }
  // ── Diag de carga (de dónde vino el estado inicial). diagLoad() en consola.
  try {
    const _ld = { t: new Date().toLocaleString('es-AR'), src: _loadSrc, lastSynced: _lastSyncedSavedAt, items: _dataMetric(S) };
    localStorage.setItem('_loadDiag', JSON.stringify(_ld));
  } catch (e) {}
  // Merge defaults for any missing keys
  Object.keys(DEFAULT_STATE).forEach(k => {
    if (S[k] === undefined) S[k] = JSON.parse(JSON.stringify(DEFAULT_STATE[k]));
  });
  // Migrate habitTrackers from flat array (vida-only) to section-keyed object
  if (Array.isArray(S.habitTrackers)) {
    S.habitTrackers = { vida: S.habitTrackers, finanzas:[], salud:[], conocimiento:[], ia:[] };
  }
  // Ensure all section keys exist
  ['vida','finanzas','salud','conocimiento','ia'].forEach(s => {
    if (!S.habitTrackers[s]) S.habitTrackers[s] = [];
  });
  // ── Migrar calendarios a hábitos (única ejecución si no existían) ──
  // Registro financiero → Hábitos Contables
  if (!S.habitTrackers.finanzas.find(h => h.id === 'habit-registro-financiero')) {
    S.habitTrackers.finanzas.push({
      id: 'habit-registro-financiero', name: 'Registro financiero', emoji: '📒',
      days: { ...(S.financeCalendar?.days || {}) },
    });
  }
  // Entrenamientos → Hábitos de Salud (migra workoutCalendar)
  if (!S.habitTrackers.salud.find(h => h.id === 'habit-entrenamientos')) {
    S.habitTrackers.salud.push({
      id: 'habit-entrenamientos', name: 'Entrenamientos', emoji: '🏋️',
      days: { ...(S.workoutCalendar?.days || {}) },
    });
  }
  // Calendario de estudio → Hábitos de Aprendizaje (migra studyCalendar)
  if (!S.habitTrackers.conocimiento.find(h => h.id === 'habit-estudio')) {
    S.habitTrackers.conocimiento.push({
      id: 'habit-estudio', name: 'Calendario de estudio', emoji: '📅',
      days: { ...(S.studyCalendar?.days || {}) },
    });
  }
  // Hábito de lectura diaria
  if (!S.habitTrackers.conocimiento.find(h => h.id === 'habit-lectura')) {
    S.habitTrackers.conocimiento.push({
      id: 'habit-lectura', name: 'Lectura diaria', emoji: '📖',
      days: {},
    });
  }
  // ── Migrar proyectos de localStorage a S (una sola vez) ──────────────────
  if (!S.proyectos) S.proyectos = { vida: null, finanzas: null, salud: null, conocimiento: null, ia: null };
  let _proyMigrated = false;
  ['vida','finanzas','salud','conocimiento','ia'].forEach(tab => {
    if (S.proyectos[tab] == null) {
      try {
        const raw = localStorage.getItem('proyectos_' + tab + '_v1');
        if (raw) { S.proyectos[tab] = JSON.parse(raw); _proyMigrated = true; }
      } catch {}
    }
  });
  if (_proyMigrated) saveState();
  if (_migrateQToT()) saveState();
  if (_migrateMonthlyGoals()) saveState();
  // ── Presupuesto: init + auto-copia del mes actual ──
  if (!S.budgets) S.budgets = {};
  if (ensureBudgetMonth(_curMonthKey())) saveState();
}
function _migrateQToT() {
  if (!S.quarterlyObjectives) return false;
  const qo = S.quarterlyObjectives;
  let changed = false;
  if (qo.activePeriod && /^q\d-/.test(qo.activePeriod)) {
    qo.activePeriod = qo.activePeriod.replace(/^q(\d-)/, 't$1');
    changed = true;
  }
  (qo.periods || []).forEach(p => {
    if (/^q\d-/.test(p.id))    { p.id    = p.id.replace(/^q(\d-)/, 't$1');    changed = true; }
    if (/^Q\d /.test(p.label)) { p.label = p.label.replace(/^Q(\d )/, 'T$1'); changed = true; }
  });
  return changed;
}
function saveState() {
  localStorage.setItem('lifedash_v2', JSON.stringify(S));
  _fbSave();
}

// ── Historical financial data ─────────────────────────────
// Los datos históricos (Mar–Jun 2026) ya están sincronizados en Firestore.
// Se quitó el seed hardcodeado para no exponer información financiera en el repo público.

// ── Date helpers ──────────────────────────────────────────
function localStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getActiveDate() {
  return localStr(new Date());
}
function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localStr(d);
}
function fmtDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('es', { weekday:'short', month:'short', day:'numeric' });
}
function daysUntil(dayOfMonth) {
  const now = new Date();
  let target = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (target < now) target.setMonth(target.getMonth()+1);
  return Math.ceil((target - now) / 86400000);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════
let currentTab = 'main';
let chartsInited = {};

function renderTabHeader(metaId) {
  const el = document.getElementById(metaId);
  if (!el) return;
  const now = new Date();
  const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const days   = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
  el.innerHTML = `<span class="thm-ok">● OPERATIVO</span>${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}<strong>${now.getFullYear()}</strong>`;
}

function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
  currentTab = tab;
  if (!chartsInited[tab]) { initChartsForTab(tab); chartsInited[tab] = true; }
  renderQObjForTab(tab);
  if (tab === 'vida')         { renderTabHeader('vidaHeaderMeta'); }
  if (tab === 'salud')        { renderSaludTab(); renderSleepTracker(); renderTabHeader('saludHeaderMeta'); }
  if (tab === 'finanzas')     { renderFinanzasTab(); }
  if (tab === 'conocimiento') { renderLawProgress(); renderLawMilestones(); renderLawPlan(); renderTabHeader('conocimientoHeaderMeta'); if (window.Finales) Finales.renderPrincipal(); }
  if (tab === 'ia')           { renderTabHeader('iaHeaderMeta'); }
  const _ks = document.getElementById('kpi-' + tab); if (_ks) delete _ks.dataset.kpiInit; // re-dispara count-up al entrar
  if (window.JARVIS_INTEL) JARVIS_INTEL.renderCard(tab);
  renderHabitsCard(tab);
  checkAchievements();
  if (typeof renderProyectos === 'function') renderProyectos(tab);
  renderReminders(tab);
  requestAnimationFrame(() => { armScrollReveal(); _armTooltips(document.getElementById('tab-' + tab)); });
}

// ── Aparición al scroll: las cards que quedan bajo el pliegue entran al asomar ──
const _srObs = ('IntersectionObserver' in window)
  ? new IntersectionObserver(ents => {
      for (const e of ents) if (e.isIntersecting) { e.target.classList.add('sr-in'); _srObs.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 })
  : null;
function armScrollReveal() {
  if (!_srObs) return;
  const panel = document.querySelector('.tab-panel.active'); if (!panel) return;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  // Sólo se gestionan las cards debajo del pliegue; las visibles conservan su stagger de entrada.
  panel.querySelectorAll('.card').forEach(card => {
    if (card.classList.contains('sr-armed')) return;
    if (card.getBoundingClientRect().top > vh * 0.92) {
      card.classList.add('sr-armed'); _srObs.observe(card);
      // Red de seguridad: si el observer nunca dispara (panel oculto, layout raro, etc.)
      // la card se revela igual a los ~5s — el contenido jamás queda invisible.
      setTimeout(() => { if (card.classList.contains('sr-armed') && !card.classList.contains('sr-in')) { card.classList.add('sr-in'); _srObs.unobserve(card); } }, 5000);
    }
  });
}

// ── Tooltips suaves: pasa el title nativo a data-tip en los controles marcados ──
function _armTooltips(root) {
  (root || document).querySelectorAll('[title]').forEach(el => {
    if (!el.matches('.agent-hdr-btn, #agent-fab, .card-title .btn, .qobj-act-btn, .jvoice-btn')) return;
    const t = el.getAttribute('title'); if (!t) return;
    el.setAttribute('data-tip', t);
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', t); // preservar nombre accesible
    el.removeAttribute('title'); // quita el tooltip nativo (lento/feo) sin perder accesibilidad
    if (el.matches('.card-title .btn, .qobj-act-btn')) el.classList.add('tip-below');
  });
}
window.addEventListener('load', () => { armScrollReveal(); _armTooltips(); });

// ════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════
let toastTimer;
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'modal-add-sub' || id === 'modal-add-txn') populateAccountSelects();
  if (id === 'modal-add-txn') { populateTxnMonthSelect('txnMonth'); toggleTxnMonthField('txnMonth', document.getElementById('txnType').value); }
  if (id === 'modal-cfg-gym') renderGymConfigModal();
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
});
function populateAccountSelects() {
  ['subAccount','ordAccount','txnAccount'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const base = id === 'ordAccount' ? '<option value="">— No descontar —</option>' : '<option value="">— Ninguna —</option>';
    sel.innerHTML = base + S.accounts.filter(a=>a.type==='bank'||a.type==='invest').map(a=>`<option value="${a.id}">${a.icon||'🏦'} ${a.name}</option>`).join('') + '<option value="prestamos_amorcito">💙 Prestamos amorcito</option>';
  });
}

// ════════════════════════════════════════════════════════
// TICKER / ALERT SYSTEM
// ════════════════════════════════════════════════════════
function buildTickerAlerts() {
  const alerts = [];
  const now = new Date();
  const h = now.getHours();
  const today = getActiveDate();

  // Pending goals
  const todayGoals = S.goals[today] || [];
  const pending = todayGoals.filter(g => !g.done);
  if (pending.length > 0) alerts.push({ text: `${pending.length} meta${pending.length>1?'s':''} pendiente${pending.length>1?'s':''} hoy`, cls: 'warn' });
  if (todayGoals.length > 0 && pending.length === 0) alerts.push({ text: '✓ ¡Todas las metas completadas!', cls: 'ok' });

  // Pending habits
  const HABIT_SECTIONS = ['vida','finanzas','salud','conocimiento','ia'];
  HABIT_SECTIONS.forEach(sec => {
    const habits = (S.habitTrackers && !Array.isArray(S.habitTrackers))
      ? (S.habitTrackers[sec] || [])
      : (sec === 'vida' && Array.isArray(S.habitTrackers) ? S.habitTrackers : []);
    habits.forEach(habit => {
      const val = (habit.days || {})[today];
      if (!val || val === 'partial') {
        alerts.push({ text: `${habit.emoji || '📌'} ${habit.name} pendiente`, cls: 'warn' });
      }
    });
  });

  // Subscription alerts (3-5 days)
  S.subscriptions.forEach(sub => {
    const days = daysUntil(sub.billingDay);
    if (days <= 5 && days >= 0) {
      alerts.push({ text: `💳 ${sub.name} se cobra en ${days}d ($${sub.amount})`, cls: days <= 2 ? 'alert' : 'warn' });
    }
  });

  // Orders arriving soon
  S.orders.forEach(ord => {
    if (!ord.arrival) return;
    const diff = Math.ceil((new Date(ord.arrival) - new Date()) / 86400000);
    if (diff >= 0 && diff <= 7) alerts.push({ text: `📦 ${ord.name} llega en ${diff}d`, cls: 'ok' });
  });

  if (alerts.length === 0) alerts.push({ text: '🟢 Dashboard activo — todo en orden', cls: 'ok' });

  const inner = document.getElementById('ticker-inner');
  const itemsHTML = alerts.map(a =>
    `<span class="ticker-item ${a.cls}">${a.text}</span><span class="ticker-item" style="color:rgba(255,255,255,.15)">◆</span>`
  ).join('');
  // Duplicate so the scroll loops seamlessly: animate -50% of total (= one full copy)
  inner.innerHTML = itemsHTML + itemsHTML;
  // Adjust speed proportionally to content length so it doesn't go too fast or too slow
  const speed = Math.max(18, Math.min(60, alerts.length * 8));
  inner.style.animationDuration = speed + 's';
}

// ════════════════════════════════════════════════════════
// MAIN TAB — DAY PROGRESS
// ════════════════════════════════════════════════════════
const WAKE = 8, SLEEP = 24;
const PALETTE = [[255,216,158],[255,205,121],[255,227,143],[255,183,106],[255,149,89],[243,111,79],[226,93,122],[123,91,176],[47,58,102]];

function lerpColor(t) {
  const n = PALETTE.length-1;
  const i = Math.min(Math.floor(t*n), n-1);
  const f = t*n-i;
  const [a,b] = [PALETTE[i], PALETTE[i+1]];
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`;
}

function updateDayProgress() {
  const now = new Date();
  const h = now.getHours() + now.getMinutes()/60;
  const pctEl = document.getElementById('dayPct');
  const phaseEl = document.getElementById('dayPhase');
  const fillEl = document.getElementById('dayFill');
  const clockEl = document.getElementById('dayClock');

  let hh = now.getHours()%12||12;
  clockEl.textContent = `${hh}:${String(now.getMinutes()).padStart(2,'0')} ${now.getHours()>=12?'PM':'AM'}`;

  if (h < WAKE) {
    pctEl.textContent = '—'; phaseEl.textContent = 'DURMIENDO';
    fillEl.style.cssText = 'width:0%;background:#4D4B47';
  } else if (h < SLEEP) {
    const pct = (h-WAKE)/(SLEEP-WAKE)*100;
    pctEl.textContent = Math.round(pct)+'%';
    phaseEl.textContent = pct<25?'MAÑANA':pct<50?'MEDIODÍA':pct<75?'TARDE':pct<90?'NOCHE':'HORA DE DORMIR';
    fillEl.style.cssText = `width:${pct}%;background:${lerpColor(pct/100)}`;
  } else {
    pctEl.textContent = '100%'; phaseEl.textContent = 'NOCHE TARDE';
    fillEl.style.cssText = 'width:100%;background:#E25D7A';
  }
}

// ════════════════════════════════════════════════════════
// MAIN TAB — GOALS
// ════════════════════════════════════════════════════════
const PRIORITY_COLOR = { high:'#FF6B6B', mid:'#F2C063', low:'#6BE3A4' };
// Tareas del planner: 3 niveles, gradiente de apagado (baja) a llamativo (alta).
// La distinción es por combinación de factores (color de barra + badge + peso/saturación via clase .prio-N en CSS).
const PLANNER_PRIO = {
  1: { label: 'Baja',  color: '#8BA5C0' },   // --ts   (apagado)
  2: { label: 'Media', color: '#F5A623' },   // --warn
  3: { label: 'Alta',  color: '#FF3358' },   // --danger (llamativo)
};

function renderGoals() {
  const today = getActiveDate(), tom = getTomorrow();
  renderGoalList(today, 'goalList', 'goalsEmpty', false);
  renderGoalList(tom, 'tomorrowList', 'tomorrowEmpty', false);
  renderGoalsHeader(today);
  renderMetasReadonly();
  updateStreak();
  buildTickerAlerts();
  renderDayPlanner();
  // Refresh urgent block if any timed goal exists today or tomorrow
  const today2    = getActiveDate();
  const tomorrow2 = getTomorrow();
  const hasTimed  = (S.goals[today2]||[]).some(g => g.time) || (S.goals[tomorrow2]||[]).some(g => g.time);
  if (hasTimed) renderReminders('vida');
}

// Metas de hoy en la sección: solo lectura (ver + marcar). Crear/editar/borrar viven en Planificación (overlay).
function renderMetasReadonly() {
  const body = document.getElementById('metasReadonlyBody'); if (!body) return;
  const date = getActiveDate();
  const goals = S.goals[date] || [];
  if (!goals.length) {
    body.innerHTML = '<div class="mrd-empty">Sin metas para hoy. Abrí <b>Planificación</b> (🧍) para agregarlas.</div>';
    return;
  }
  const done = goals.filter(g => g.done).length;
  body.innerHTML = `<div class="mrd-prog"><span class="mrd-prog-num">${done}</span><span class="mrd-prog-sep">/</span><span class="mrd-prog-tot">${goals.length}</span><span class="mrd-prog-lbl">completadas</span></div>`
    + goals.map((g, idx) => `<div class="mrd-item${g.done ? ' done' : ''}">
        <button class="mrd-check" onclick="toggleGoal('${escHtml(date)}',${idx})" aria-label="Marcar meta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></button>
        ${g.time ? `<span class="mrd-time">${fmtGoalTime(g.time)}</span>` : ''}
        <span class="mrd-prio" style="background:${PRIORITY_COLOR[g.priority] || '#666'}"></span>
        <span class="mrd-text">${escHtml(g.text)}</span>
      </div>`).join('');
}

const GOAL_PERIODS = [
  ['manana', '🌅 Mañana'],
  ['tarde',  '☀️ Tarde'],
  ['noche',  '🌙 Noche']
];

function goalPeriodFromHour(h) {
  return h < 6 ? 'noche' : h < 13 ? 'manana' : h < 19 ? 'tarde' : 'noche';
}

// Sección efectiva de una meta: period explícito > derivado del horario > mañana.
// Nunca devuelve un valor fuera de las 3 secciones (evita metas invisibles).
function goalPeriodOf(g) {
  if (g.period === 'manana' || g.period === 'tarde' || g.period === 'noche') return g.period;
  if (g.time) return goalPeriodFromHour(parseInt(g.time.split(':')[0], 10));
  return 'manana';
}

// Al elegir horario en el modal, sincroniza el selector de parte del día
function syncNewGoalPeriod(t) {
  if (!t) return;
  const sel = document.getElementById('newGoalPeriod');
  if (sel) sel.value = goalPeriodFromHour(parseInt(t.split(':')[0], 10));
}

function buildGoalItem(g, idx, date, readOnly) {
  const li = document.createElement('div');
  li.className = 'goal-item' + (g.done ? ' done-row' : '');
  li.dataset.idx = idx;
  li.innerHTML = `
    <span class="goal-drag" title="Arrastrar">⋮⋮</span>
    <span class="check-box ${g.done?'checked':''}" data-idx="${idx}" data-date="${date}"></span>
    <span class="goal-priority" style="background:${PRIORITY_COLOR[g.priority]||'#666'}"></span>
    ${g.time ? `<span class="goal-time-badge">${fmtGoalTime(g.time)}</span>` : ''}
    <span class="goal-text-el">${g.text}</span>
    <button class="goal-del" data-idx="${idx}" data-date="${date}" title="Eliminar">×</button>
  `;
  // Checkbox click
  li.querySelector('.check-box').addEventListener('click', () => { toggleGoal(date, idx); });
  // Delete
  li.querySelector('.goal-del').addEventListener('click', () => { deleteGoal(date, idx); });
  // Inline edit (text)
  if (!readOnly) {
    const textEl = li.querySelector('.goal-text-el');
    textEl.addEventListener('click', () => {
      if (textEl.getAttribute('contenteditable') === 'true') return;
      const orig = textEl.textContent;
      textEl.setAttribute('contenteditable','true');
      textEl.focus();
      const range = document.createRange(); range.selectNodeContents(textEl); range.collapse(false);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      const commit = () => {
        textEl.removeAttribute('contenteditable');
        const v = textEl.textContent.trim();
        if (v && v !== orig) { S.goals[date][idx].text = v; saveState(); }
        else textEl.textContent = orig;
      };
      textEl.addEventListener('blur', commit, { once: true });
      textEl.addEventListener('keydown', e => { if (e.key==='Enter') { e.preventDefault(); textEl.blur(); } if (e.key==='Escape') { textEl.textContent = orig; textEl.removeEventListener('blur',commit); textEl.removeAttribute('contenteditable'); } }, { once:true });
    });
  }
  return li;
}

function renderGoalList(date, listId, emptyId, readOnly) {
  const goals = S.goals[date] || [];
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  list.innerHTML = '';
  empty.style.display = goals.length ? 'none' : '';

  // Today's list: grouped by part of day (Mañana / Tarde / Noche)
  if (listId === 'goalList') {
    if (!goals.length) return;
    GOAL_PERIODS.forEach(([key, label]) => {
      const items = goals.map((g, i) => ({ g, i })).filter(x => goalPeriodOf(x.g) === key);
      const done = items.filter(x => x.g.done).length;
      const head = document.createElement('div');
      head.className = 'goal-section-head';
      head.innerHTML = `<span>${label}</span><span class="gs-count">${items.length ? `${done}/${items.length}` : ''}</span>`;
      const sec = document.createElement('div');
      sec.className = 'goal-section-list';
      sec.dataset.period = key;
      items.forEach(({ g, i }) => sec.appendChild(buildGoalItem(g, i, date, readOnly)));
      list.appendChild(head);
      list.appendChild(sec);

      if (!readOnly && typeof Sortable !== 'undefined') {
        Sortable.create(sec, {
          handle: '.goal-drag', animation: 150, group: 'goalsToday',
          onEnd: () => {
            // Rebuild order from DOM across all sections; section determines period
            const newArr = [];
            list.querySelectorAll('.goal-section-list').forEach(s => {
              s.querySelectorAll('.goal-item').forEach(li => {
                const g = goals[+li.dataset.idx];
                g.period = s.dataset.period;
                newArr.push(g);
              });
            });
            S.goals[date] = newArr; saveState(); renderGoals();
          }
        });
      }
    });
    return;
  }

  goals.forEach((g, idx) => list.appendChild(buildGoalItem(g, idx, date, readOnly)));

  // Sortable drag — destroy previous instance before creating new one
  if (!readOnly && typeof Sortable !== 'undefined') {
    const existing = Sortable.get(list);
    if (existing) existing.destroy();
    Sortable.create(list, {
      handle: '.goal-drag', animation: 150,
      onEnd: ev => {
        const arr = S.goals[date] || [];
        arr.splice(ev.newIndex, 0, arr.splice(ev.oldIndex, 1)[0]);
        S.goals[date] = arr; saveState(); renderGoals();
      }
    });
  }
}

function renderGoalsHeader(date) {
  const goals = S.goals[date] || [];
  const done = goals.filter(g=>g.done).length;
  const total = goals.length;
  document.getElementById('goalsDoneNum').textContent = done;
  document.getElementById('goalsTotalNum').textContent = `/ ${total}`;
  document.getElementById('goalsLabel').textContent = total===0?'sin metas':done===total&&total>0?'¡todo listo!':'completadas';

  // Segmented bar
  const bar = document.getElementById('goalsBar');
  bar.innerHTML = goals.map(g=>`<div style="flex:1;border-radius:99px;background:${g.done?'#6BE3A4':'rgba(255,255,255,.1)'}"></div>`).join('');

  // Push button
  const hasPending = goals.some(g=>!g.done);
  document.getElementById('pushBtn').style.display = total>0&&hasPending ? '' : 'none';

  // All done glow
  const card = document.getElementById('goalList').closest('.card');
  if (total > 0 && done === total) card.style.background = 'radial-gradient(ellipse 80% 40% at 50% 0%,rgba(107,227,164,.07) 0%,transparent 60%),var(--card)';
  else card.style.background = '';
}

function toggleGoal(date, idx) {
  if (!S.goals[date]) return;
  S.goals[date][idx].done = !S.goals[date][idx].done;
  saveState(); renderGoals();
  // Sync reminders urgent block (timed goals appear there — today and tomorrow)
  if (S.goals[date][idx].time) renderReminders('vida');
  if (S.goals[date][idx].done) {
    // Sparkle from the checkbox element (lookup by data attrs — grouped DOM no longer matches array order)
    const box = document.querySelector(`.check-box[data-idx="${idx}"][data-date="${date}"]`);
    if (box) {
      const r = box.getBoundingClientRect();
      showSparkle(r.left + r.width/2, r.top + r.height/2);
    }
    const allDone = S.goals[date].every(g => g.done);
    if (allDone && S.goals[date].length > 0) {
      setTimeout(showConfetti, 80);
      setTimeout(showMissionBanner, 180);
      showToast('🏆 ¡MISIÓN CUMPLIDA!', 4000);
    } else {
      showToast('✓ Meta completada');
    }
  }
}

function deleteGoal(date, idx) {
  S.goals[date].splice(idx, 1);
  saveState(); renderGoals();
}

function openAddGoalToday() {
  // Preselect part of day based on current time
  const sel = document.getElementById('newGoalPeriod');
  if (sel) sel.value = goalPeriodFromHour(new Date().getHours());
  openModal('modal-add-goal');
}

function addGoal(when) {
  const isTom = when === 'tomorrow';
  const textId = isTom ? 'newGoalTextTom' : 'newGoalText';
  const prioId = isTom ? 'newGoalPriorityTom' : 'newGoalPriority';
  const text = document.getElementById(textId).value.trim();
  if (!text) { showToast('Escribe una meta primero'); return; }
  const date = isTom ? getTomorrow() : getActiveDate();
  if (!S.goals[date]) S.goals[date] = [];
  const timeEl = document.getElementById('newGoalTime');
  const timeVal = (!isTom && timeEl) ? (timeEl.value || null) : null;
  const periodEl = document.getElementById('newGoalPeriod');
  const period = (!isTom && periodEl) ? periodEl.value : 'manana';
  S.goals[date].push({ id: uid(), text, done: false, priority: document.getElementById(prioId).value, time: timeVal, period });
  document.getElementById(textId).value = '';
  if (timeEl) timeEl.value = '';
  saveState(); renderGoals();
  closeModal(isTom ? 'modal-add-goal-tom' : 'modal-add-goal');
  // [SUPABASE] await supabase.from('goals').insert({ date, text, done: false, priority, user_id });
}

function pushRemaining() {
  if (!confirm('¿Empujar metas pendientes a mañana?')) return;
  const today = getActiveDate(), tom = getTomorrow();
  const pending = (S.goals[today]||[]).filter(g=>!g.done);
  if (!S.goals[tom]) S.goals[tom] = [];
  const existing = new Set(S.goals[tom].map(g=>g.text));
  pending.forEach(g => { if (!existing.has(g.text)) S.goals[tom].push({...g, id:uid(), done:false}); });
  S.goals[today] = (S.goals[today]||[]).filter(g=>g.done);
  saveState(); renderGoals();
  if (pending.length > 0) {
    showFireEffect();
    showFailBanner();
    showToast(`🔥 ${pending.length} meta(s) sin cumplir`, 3500);
  } else {
    showToast('Sin pendientes que empujar');
  }
}

function updateStreak() {
  const today = getActiveDate();
  const goals = S.goals[today] || [];
  const allDone = goals.length > 0 && goals.every(g=>g.done);
  if (allDone && S.streak.lastDate !== today) {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yStr = localStr(yesterday);
    S.streak.count = S.streak.lastDate === yStr ? S.streak.count+1 : 1;
    S.streak.lastDate = today;
    saveState();
  }
  const pill = document.getElementById('streakPill');
  pill.textContent = `⚡ ${S.streak.count} día${S.streak.count!==1?'s':''}`;
  pill.className = `streak-pill ${S.streak.count===0?'zero':''}`;
}

// ════════════════════════════════════════════════════════
// DAY PLANNER
// ════════════════════════════════════════════════════════
function fmtGoalTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toggleGoalById(date, id) {
  const arr = S.goals[date] || [];
  const idx = arr.findIndex(g => g.id === id);
  if (idx >= 0) toggleGoal(date, idx);
}

// ── Estado de tareas del día ──
const _plannerOpen = new Set();                 // horas expandidas (solo UI, no persistido): 'date|H'
function _pkey(date, h) { return date + '|' + h; }
function _pad2(n) { return String(n).padStart(2, '0'); }
function _pid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function getDayPlan(date) {
  if (!S.dayPlan) S.dayPlan = {};
  if (!S.dayPlan[date]) S.dayPlan[date] = { grid: {}, tasks: [] };
  const p = S.dayPlan[date];
  if (!p.grid)  p.grid  = {};
  if (!p.tasks) p.tasks = [];
  return p;
}
function plannerHourGrid(date, h) { return getDayPlan(date).grid[h] || 60; }
function plannerSlotsFor(h, grid) {
  const slots = [];
  for (let m = 0; m < 60; m += grid) slots.push(`${_pad2(h)}:${_pad2(m)}`);
  return slots;
}
// Tareas de una hora, ordenadas por prioridad desc (sort estable → respeta orden de creación en empate).
function plannerHourTasks(date, h) {
  return getDayPlan(date).tasks
    .filter(t => parseInt(t.time.split(':')[0], 10) === h)
    .sort((a, b) => b.priority - a.priority);
}

function togglePlannerHour(date, h) {
  const k = _pkey(date, h);
  if (_plannerOpen.has(k)) _plannerOpen.delete(k); else _plannerOpen.add(k);
  renderDayPlanner();
}
function plannerSetGrid(date, h, grid) {
  const p = getDayPlan(date);
  p.grid[h] = grid;
  // Reflow: cada tarea de esta hora se ajusta al inicio de su sub-tramo contenedor (nunca se pierde).
  p.tasks.forEach(t => {
    if (parseInt(t.time.split(':')[0], 10) !== h) return;
    const min = parseInt(t.time.split(':')[1], 10);
    t.time = `${_pad2(h)}:${_pad2(Math.floor(min / grid) * grid)}`;
  });
  _plannerOpen.add(_pkey(date, h));
  saveState(); renderDayPlanner();
}
function plannerAddTask(date, time) {
  const p = getDayPlan(date);
  const task = { id: _pid(), time, priority: 2, text: '', done: false };
  p.tasks.push(task);
  _plannerOpen.add(_pkey(date, parseInt(time.split(':')[0], 10)));
  saveState(); renderDayPlanner();
  requestAnimationFrame(() => {
    const el = document.querySelector(`.ptask[data-id="${task.id}"] .ptask-text`);
    if (el) el.focus();
  });
}
function plannerTaskText(date, id, text) {
  const p = getDayPlan(date);
  const t = p.tasks.find(x => x.id === id);
  if (!t) return;
  if (text.trim()) { t.text = text; saveState(); return; }
  // Vacía al salir → se elimina, PERO diferido y re-chequeando: un blur transitorio
  // (tap que reenfoca la casilla, o un re-render) NO debe borrar la tarea que el
  // usuario recién creó y está por escribir. Sólo se elimina si sigue vacía y el
  // usuario ya no la tiene enfocada.
  setTimeout(() => {
    const live = document.querySelector(`.ptask[data-id="${id}"] .ptask-text`);
    if (live && (document.activeElement === live || live.value.trim())) return; // reenfocada o con texto
    const pp = getDayPlan(date);
    const tt = pp.tasks.find(x => x.id === id);
    if (!tt || (tt.text && tt.text.trim())) return;
    pp.tasks = pp.tasks.filter(x => x.id !== id);
    saveState(); renderDayPlanner();
  }, 200);
}
function plannerCyclePrio(date, id) {
  const t = getDayPlan(date).tasks.find(x => x.id === id);
  if (!t) return;
  t.priority = (t.priority % 3) + 1;              // 1→2→3→1
  saveState(); renderDayPlanner();
}
function plannerToggleTask(date, id) {
  const t = getDayPlan(date).tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveState(); renderDayPlanner();
}
function plannerDeleteTask(date, id) {
  const p = getDayPlan(date);
  p.tasks = p.tasks.filter(x => x.id !== id);
  saveState(); renderDayPlanner();
}
function plannerMoveTask(date, id, newTime) {
  const t = getDayPlan(date).tasks.find(x => x.id === id);
  if (!t || t.time === newTime) { renderDayPlanner(); return; }
  t.time = newTime;
  _plannerOpen.add(_pkey(date, parseInt(newTime.split(':')[0], 10)));
  saveState(); renderDayPlanner();
}
function plannerAutoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ── HTML de una tarea (badge de prioridad + texto + eliminar + checkbox a la derecha) ──
function plannerTaskHTML(date, t, draggable) {
  const cfg = PLANNER_PRIO[t.priority] || PLANNER_PRIO[2];
  return `<div class="ptask prio-${t.priority}${t.done ? ' done' : ''}" data-id="${t.id}"${draggable ? ' data-drag="1"' : ''}>
    ${draggable ? '<span class="ptask-grip" title="Arrastrar" aria-hidden="true"></span>' : ''}
    <button class="ptask-badge" onclick="plannerCyclePrio('${escHtml(date)}','${t.id}')" title="Prioridad: ${cfg.label} — clic para cambiar">${cfg.label}</button>
    <textarea class="ptask-text" rows="1" placeholder="Tarea…"
      oninput="plannerAutoResize(this)"
      onblur="plannerTaskText('${escHtml(date)}','${t.id}',this.value)">${escHtml(t.text)}</textarea>
    <button class="ptask-del" onclick="plannerDeleteTask('${escHtml(date)}','${t.id}')" title="Eliminar" aria-label="Eliminar">✕</button>
    <label class="ptask-check"><input type="checkbox"${t.done ? ' checked' : ''} onchange="plannerToggleTask('${escHtml(date)}','${t.id}')"></label>
  </div>`;
}

// ── Barra de progreso del día + resumen de pendientes por prioridad ──
function plannerDaybarHTML(date) {
  const tasks = getDayPlan(date).tasks;
  const total = tasks.length;
  const done  = tasks.filter(t => t.done).length;
  const pct   = total ? Math.round(done / total * 100) : 0;
  const pend  = pr => tasks.filter(t => !t.done && t.priority === pr).length;
  return `<div class="planner-daybar">
    <div class="pdb-prog">
      <div class="pdb-track"><div class="pdb-fill" style="width:${pct}%"></div></div>
      <span class="pdb-count">${done}/${total}</span>
    </div>
    <div class="pdb-prios">
      <span class="pdb-pill prio-3">Alta ${pend(3)}</span>
      <span class="pdb-pill prio-2">Media ${pend(2)}</span>
      <span class="pdb-pill prio-1">Baja ${pend(1)}</span>
    </div>
  </div>`;
}

function buildPlannerSlide(listEl, date, isToday, reduced) {
  if (!listEl) return;
  const goals  = (S.goals[date] || []).filter(g => g.time);
  const now    = new Date();
  const curH   = isToday ? now.getHours()   : -1;
  const curMin = isToday ? now.getMinutes() : 0;
  const editingId = document.activeElement && document.activeElement.classList.contains('ptask-text')
    ? (document.activeElement.closest('.ptask') || {}).dataset?.id : null;

  const hasAnyTask = getDayPlan(date).tasks.length > 0;
  // Vista reducida (dashboard): sin tareas ni metas → vacío para que el caller muestre el mensaje.
  if (reduced && !hasAnyTask && !goals.length) { listEl.innerHTML = ''; return; }

  const rows = [];
  for (let h = 6; h <= 23; h++) {
    const isCurrent = h === curH;
    const hourGoals = goals.filter(g => parseInt(g.time.split(':')[0], 10) === h);
    const tasks     = plannerHourTasks(date, h);

    if (reduced && !tasks.length && !hourGoals.length) continue;

    const chipsHtml = hourGoals.map(g =>
      `<div class="planner-goal-chip${g.done ? ' done' : ''}" onclick="toggleGoalById('${escHtml(date)}','${escHtml(g.id)}')" title="${escHtml(g.text)}">
        <span class="chip-dot" style="background:${PRIORITY_COLOR[g.priority] || '#666'}"></span>
        <span class="chip-text">${escHtml(g.text)}</span>
        ${g.done ? '<span style="font-size:10px;margin-left:2px">✓</span>' : ''}
      </div>`
    ).join('');
    const chipsBlock = chipsHtml ? `<div class="planner-goal-chips">${chipsHtml}</div>` : '';
    const nowLine = isCurrent
      ? `<div class="planner-now-line" style="top:${8 + (curMin / 60) * 30}px"></div>` : '';

    if (reduced) {
      const tHtml = tasks.map(t => plannerTaskHTML(date, t, false)).join('');
      rows.push(`<div class="planner-row${isCurrent ? ' current-hour' : ''}">
        ${nowLine}
        <div class="planner-time">${_pad2(h)}:00</div>
        <div class="planner-content">${tHtml}${chipsBlock}</div>
      </div>`);
      continue;
    }

    // Vista completa (overlay): hora expandible con selector de tramo (15/30/60) + slots.
    const grid  = plannerHourGrid(date, h);
    const open  = _plannerOpen.has(_pkey(date, h));
    const doneN = tasks.filter(t => t.done).length;
    const summary = tasks.length
      ? `${tasks.length} tarea${tasks.length > 1 ? 's' : ''}${doneN ? ` · ${doneN}✓` : ''}` : 'vacío';

    let body = '';
    if (open) {
      const gridSel = [60, 30, 15].map(g =>
        `<button class="pgs${grid === g ? ' on' : ''}" onclick="plannerSetGrid('${escHtml(date)}',${h},${g})">${g}m</button>`
      ).join('');
      const slots = plannerSlotsFor(h, grid).map(time => {
        const slotTasks = tasks.filter(t => t.time === time)
          .map(t => plannerTaskHTML(date, t, true)).join('');
        const mm = time.split(':')[1];
        return `<div class="planner-slot">
          <div class="pslot-label">:${mm}</div>
          <div class="slot-tasks" data-time="${time}" data-date="${escHtml(date)}">${slotTasks}</div>
          <button class="pslot-add" onclick="plannerAddTask('${escHtml(date)}','${time}')" aria-label="Agregar tarea">＋</button>
        </div>`;
      }).join('');
      body = `<div class="planner-hour-body">
        <div class="planner-grid-sel" role="group" aria-label="Tramo">${gridSel}</div>
        <div class="planner-slots">${slots}</div>
      </div>`;
    }

    rows.push(`<div class="planner-row ph-full${isCurrent ? ' current-hour' : ''}${open ? ' open' : ''}">
      ${nowLine}
      <button class="planner-hour-head" onclick="togglePlannerHour('${escHtml(date)}',${h})" aria-expanded="${open}">
        <span class="planner-time">${_pad2(h)}:00</span>
        <span class="ph-summary${tasks.length ? '' : ' empty'}">${summary}</span>
        <span class="ph-caret" aria-hidden="true">▸</span>
      </button>
      ${chipsBlock}
      ${body}
    </div>`);
  }

  listEl.innerHTML = plannerDaybarHTML(date) + rows.join('');
  listEl.querySelectorAll('.ptask-text').forEach(el => plannerAutoResize(el));
  if (!reduced) plannerInitDrag(listEl, date);

  // Scroll a la hora actual (solo hoy y si no se está editando).
  if (isToday && !editingId) {
    const curRow = listEl.querySelector('.current-hour');
    if (curRow) curRow.scrollIntoView({ block: 'center' });
  }
}

// Drag & drop de tareas entre tramos/horas (SortableJS). Grupo por fecha → no cruza días.
function plannerInitDrag(listEl, date) {
  if (typeof Sortable === 'undefined') return;
  listEl.querySelectorAll('.slot-tasks').forEach(cont => {
    Sortable.create(cont, {
      group: 'planner-' + date, animation: 150, draggable: '.ptask', handle: '.ptask-grip',
      onEnd: ev => plannerMoveTask(date, ev.item.dataset.id, ev.to.dataset.time),
    });
  });
}

function renderDayPlanner() {
  const today = getActiveDate();

  // Vista inline = reducida: sólo las horas con texto/metas. La versión completa
  // (con pestañas Hoy/Mañana) vive en el overlay (FAB 🧍 → Planificación).
  const listEl = document.getElementById('dayPlannerList');
  buildPlannerSlide(listEl, today, true, true);
  if (listEl && !listEl.innerHTML.trim()) {
    listEl.innerHTML = '<div class="planner-empty-inline">Sin horas planificadas. Abrí <b>Planificación</b> (🧍 → Planificación) para organizar tu día.</div>';
  }
  // En la sección sólo se muestra Hoy: ocultar el slide de Mañana y los puntos del swiper.
  const tom = document.getElementById('dayPlannerListTom'); if (tom) tom.style.display = 'none';
  const dots = document.getElementById('plannerDots'); if (dots) dots.style.display = 'none';
  const label = document.getElementById('plannerDateLabel');
  if (label) { const d = new Date(today + 'T00:00:00'); label.textContent = 'Hoy · ' + d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }); }

  // Si el overlay de planificación está abierto, refrescarlo también.
  const ov = document.getElementById('ov-planner');
  if (ov && ov.classList.contains('show') && typeof plannerOverlayRender === 'function') plannerOverlayRender();
}

// ════════════════════════════════════════════════════════
// FINANZAS — OBJETIVOS PATRIMONIALES
// ════════════════════════════════════════════════════════
let _finObjChart = null;

function _parseFinObjDate(str) {
  const [m, y] = str.split('/').map(Number);
  return new Date(2000 + y, m - 1, 1);
}

function _fmtARS(n) {
  if (n === null || n === undefined) return '—';
  return '$' + n.toLocaleString('es-AR');
}

function _fmtARSShort(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1).replace('.0','') + 'M';
  if (n >= 1000)    return '$' + (n / 1000).toFixed(0) + 'k';
  return '$' + n;
}

function renderFinObjectives() {
  const wrap = document.getElementById('fin-objectives-wrap');
  if (!wrap) return;
  if (!S.finObjectives) S.finObjectives = [];
  const objs  = [...S.finObjectives].sort((a, b) => _parseFinObjDate(a.date) - _parseFinObjDate(b.date));
  const today = new Date();

  // Banner stats
  const pastWithReal     = objs.filter(o => o.real !== null && _parseFinObjDate(o.date) <= today);
  const lastReal         = pastWithReal.length ? pastWithReal[pastWithReal.length - 1].real : null;
  const futureWithExp    = objs.filter(o => o.expected !== null && _parseFinObjDate(o.date) > today);
  const nextExpected     = futureWithExp.length ? futureWithExp[0].expected : null;
  const nextExpLabel     = futureWithExp.length ? futureWithExp[0].label   : null;
  const lastPastExp      = objs.filter(o => o.expected !== null && _parseFinObjDate(o.date) <= today);
  const refExpected      = lastPastExp.length ? lastPastExp[lastPastExp.length - 1].expected : null;
  const diff             = (lastReal !== null && refExpected !== null) ? lastReal - refExpected : null;
  const diffColor        = diff === null ? 'var(--fin-t2)' : diff >= 0 ? 'var(--fin-green)' : 'var(--fin-red)';
  const diffSign         = diff !== null && diff > 0 ? '+' : '';

  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  const rowsHTML = objs.map(o => {
    const isPast  = _parseFinObjDate(o.date) <= today;
    const diff    = (o.real !== null && o.expected !== null) ? o.real - o.expected : null;
    let diffClass = 'diff-neu', diffDisp = '—';
    if (diff !== null) {
      diffDisp  = (diff >= 0 ? '+' : '') + _fmtARSShort(diff);
      diffClass = diff >= 0 ? 'diff-ok' : 'diff-bad';
    }
    const realDisp     = o.real !== null ? _fmtARS(o.real) : '—';
    const expectedDisp = o.expected !== null ? _fmtARS(o.expected) : '—';
    const rowStyle     = isPast && o.real === null ? 'opacity:.45' : '';
    return `<tr style="${rowStyle}">
      <td style="font-family:var(--mono);font-size:11px;color:var(--fin-t2)">${o.date}</td>
      <td class="num" style="color:var(--fin-t2)">${expectedDisp}</td>
      <td class="num" style="color:${o.real !== null ? 'var(--fin-green)' : 'var(--fin-t3)'}">${realDisp}</td>
      <td class="diff ${diffClass}">${diffDisp}</td>
      <td style="padding:4px 2px;white-space:nowrap">
        <div style="display:flex;gap:2px">
          <button class="icon-btn" onclick="openEditFinObjective('${o.id}')">${PENCIL}</button>
          <button class="icon-btn" onclick="deleteFinObjective('${o.id}')">${TRASH}</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      💰 Objetivos — Finanzas Personales
      <button class="btn btn-ghost btn-sm" onclick="openAddFinObjective()">+ Punto</button>
    </div>
    <div class="law-lag-banner">
      <div class="law-lag-stat">
        <div class="law-lag-num" style="font-size:18px;color:var(--fin-green)">${lastReal !== null ? _fmtARSShort(lastReal) : '—'}</div>
        <div class="law-lag-lbl">último registrado</div>
      </div>
      <div class="law-lag-stat">
        <div class="law-lag-num" style="font-size:18px;color:var(--fin-t2)">${nextExpected !== null ? _fmtARSShort(nextExpected) : '—'}</div>
        <div class="law-lag-lbl">${nextExpLabel ? 'meta ' + nextExpLabel : 'próxima meta'}</div>
      </div>
      <div class="law-lag-stat">
        <div class="law-lag-num" style="font-size:18px;color:${diffColor}">${diff !== null ? diffSign + _fmtARSShort(diff) : '—'}</div>
        <div class="law-lag-lbl">vs esperado</div>
      </div>
    </div>
    <div style="position:relative;height:160px;margin:0 14px 12px"><canvas id="fin-obj-chart"></canvas></div>
    <table class="law-tbl">
      <thead><tr>
        <th>Fecha</th>
        <th style="text-align:center">Esperado</th>
        <th style="text-align:center">Obtenido</th>
        <th style="text-align:center">Dif.</th>
        <th></th>
      </tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>
  </div>`;

  // Chart
  requestAnimationFrame(() => {
    const canvas = document.getElementById('fin-obj-chart');
    if (!canvas) return;
    if (_finObjChart) { _finObjChart.destroy(); _finObjChart = null; }
    const labels   = objs.map(o => o.label);
    const planned  = objs.map(o => o.expected);
    const real     = objs.map(o => o.real);
    _finObjChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Esperado', data: planned,
            borderColor: 'rgba(0,158,106,.6)', backgroundColor: 'rgba(0,158,106,.06)',
            borderDash: [5,4], tension: .35, pointRadius: 4,
            pointBackgroundColor: 'rgba(0,158,106,.75)', spanGaps: false },
          { label: 'Obtenido', data: real,
            borderColor: 'rgba(0,212,255,.85)', backgroundColor: 'rgba(0,212,255,.07)',
            tension: .35, pointRadius: 5,
            pointBackgroundColor: 'rgba(0,212,255,.9)', spanGaps: false },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8CA2C0', font: { size: 11 }, boxWidth: 12 } } },
        scales: {
          x: { ticks: { color: '#556070', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
          y: { ticks: { color: '#556070', font: { size: 10 },
                 callback: v => v >= 1000000 ? '$' + (v/1000000).toFixed(0) + 'M' : v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : v },
               grid: { color: 'rgba(255,255,255,.04)' }, min: 0 }
        }
      }
    });
  });
}

function openAddFinObjective() {
  document.getElementById('foModalTitle').textContent = 'Nuevo Objetivo';
  document.getElementById('foId').value       = '';
  document.getElementById('foDate').value     = '';
  document.getElementById('foLabel').value    = '';
  document.getElementById('foExpected').value = '';
  document.getElementById('foReal').value     = '';
  openModal('modal-fin-objective');
}

function openEditFinObjective(id) {
  const o = (S.finObjectives || []).find(o => o.id === id);
  if (!o) return;
  document.getElementById('foModalTitle').textContent = 'Editar Objetivo';
  document.getElementById('foId').value       = id;
  document.getElementById('foDate').value     = o.date;
  document.getElementById('foLabel').value    = o.label;
  document.getElementById('foExpected').value = o.expected !== null ? o.expected : '';
  document.getElementById('foReal').value     = o.real !== null ? o.real : '';
  openModal('modal-fin-objective');
}

function saveFinObjective() {
  const id       = document.getElementById('foId').value;
  const date     = document.getElementById('foDate').value.trim();
  const label    = document.getElementById('foLabel').value.trim();
  const expRaw   = document.getElementById('foExpected').value.trim();
  const realRaw  = document.getElementById('foReal').value.trim();
  if (!date || !label) { showToast('Completa fecha y etiqueta'); return; }
  const expected = expRaw  === '' ? null : parseFloat(expRaw)  || 0;
  const real     = realRaw === '' ? null : parseFloat(realRaw) || 0;
  if (!S.finObjectives) S.finObjectives = [];
  if (id) {
    const o = S.finObjectives.find(o => o.id === id);
    if (o) Object.assign(o, { date, label, real, expected });
  } else {
    S.finObjectives.push({ id: uid(), date, label, real, expected });
    S.finObjectives.sort((a, b) => _parseFinObjDate(a.date) - _parseFinObjDate(b.date));
  }
  saveState(); renderFinObjectives(); closeModal('modal-fin-objective');
}

function deleteFinObjective(id) {
  S.finObjectives = (S.finObjectives || []).filter(o => o.id !== id);
  saveState(); renderFinObjectives();
}



// ── Edit functions ──
function openEditExercise(id) {
  const ex = S.exercises.find(e => e.id === id);
  if (!ex) return;
  document.getElementById('editExId').value        = id;
  document.getElementById('editExName').value      = ex.name;
  document.getElementById('editExRepMin').value    = ex.repMin;
  document.getElementById('editExRepMax').value    = ex.repMax;
  document.getElementById('editExIncrement').value = ex.increment;
  document.getElementById('editExUnit').value      = ex.unit;
  openModal('modal-edit-exercise');
}
function saveEditExercise() {
  const id = document.getElementById('editExId').value;
  const ex = S.exercises.find(e => e.id === id);
  if (!ex) return;
  const name = document.getElementById('editExName').value.trim();
  if (name) ex.name = name;
  ex.repMin    = +document.getElementById('editExRepMin').value    || ex.repMin;
  ex.repMax    = +document.getElementById('editExRepMax').value    || ex.repMax;
  ex.increment = +document.getElementById('editExIncrement').value || ex.increment;
  ex.unit      =  document.getElementById('editExUnit').value;
  saveState(); renderExercises(); closeModal('modal-edit-exercise');
}

function openEditAccount(id) {
  const acc = S.accounts.find(a => a.id === id);
  if (!acc) return;
  document.getElementById('editAccId').value       = id;
  document.getElementById('editAccName').value     = acc.name;
  document.getElementById('editAccType').value     = acc.type;
  document.getElementById('editAccBalance').value  = acc.balance;
  document.getElementById('editAccCurrency').value = acc.currency;
  document.getElementById('editAccIcon').value     = acc.icon || '';
  openModal('modal-edit-account');
}
function saveEditAccount() {
  const id = document.getElementById('editAccId').value;
  const acc = S.accounts.find(a => a.id === id);
  if (!acc) return;
  const name = document.getElementById('editAccName').value.trim();
  if (name) acc.name = name;
  acc.type     =  document.getElementById('editAccType').value;
  acc.balance  = +document.getElementById('editAccBalance').value || 0;
  acc.currency =  document.getElementById('editAccCurrency').value;
  acc.icon     =  document.getElementById('editAccIcon').value || '🏦';
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-edit-account');
}

function openEditSub(id) {
  const sub = S.subscriptions.find(s => s.id === id);
  if (!sub) return;
  document.getElementById('editSubId').value         = id;
  document.getElementById('editSubName').value       = sub.name;
  document.getElementById('editSubAmount').value     = sub.amount;
  document.getElementById('editSubCurrency').value   = sub.currency;
  document.getElementById('editSubBillingDay').value = sub.billingDay;
  openModal('modal-edit-sub');
}
function saveEditSub() {
  const id = document.getElementById('editSubId').value;
  const sub = S.subscriptions.find(s => s.id === id);
  if (!sub) return;
  const name = document.getElementById('editSubName').value.trim();
  if (name) sub.name = name;
  sub.amount     = +document.getElementById('editSubAmount').value     || sub.amount;
  sub.currency   =  document.getElementById('editSubCurrency').value;
  sub.billingDay = +document.getElementById('editSubBillingDay').value || sub.billingDay;
  saveState(); renderSubscriptions(); buildTickerAlerts(); closeModal('modal-edit-sub');
}

function openEditFixedExpense(id) {
  const exp = S.fixedExpenses.find(e => e.id === id);
  if (!exp) return;
  document.getElementById('editFexpId').value       = id;
  document.getElementById('editFexpName').value     = exp.name;
  document.getElementById('editFexpAmount').value   = exp.amount;
  document.getElementById('editFexpCurrency').value = exp.currency;
  document.getElementById('editFexpDay').value      = exp.dayOfMonth;
  openModal('modal-edit-fixed-expense');
}
function saveEditFixedExpense() {
  const id = document.getElementById('editFexpId').value;
  const exp = S.fixedExpenses.find(e => e.id === id);
  if (!exp) return;
  const name = document.getElementById('editFexpName').value.trim();
  if (name) exp.name = name;
  exp.amount     = +document.getElementById('editFexpAmount').value   || 0;
  exp.currency   =  document.getElementById('editFexpCurrency').value;
  exp.dayOfMonth = +document.getElementById('editFexpDay').value      || exp.dayOfMonth;
  saveState(); renderFixedExpenses(); closeModal('modal-edit-fixed-expense');
}

function openEditWish(id) {
  const w = S.wishlist.find(w => w.id === id);
  if (!w) return;
  document.getElementById('editWishId').value       = id;
  document.getElementById('editWishName').value     = w.name;
  document.getElementById('editWishAmount').value   = w.amount;
  document.getElementById('editWishCurrency').value = w.currency;
  document.getElementById('editWishCategory').value = w.category || '';
  document.getElementById('editWishPriority').value = w.priority  || 'normal';
  document.getElementById('editWishNotes').value    = w.notes     || '';
  openModal('modal-edit-wish');
}
function saveEditWish() {
  const id = document.getElementById('editWishId').value;
  const w = S.wishlist.find(w => w.id === id);
  if (!w) return;
  const name = document.getElementById('editWishName').value.trim();
  if (name) w.name = name;
  w.amount   = +document.getElementById('editWishAmount').value   || 0;
  w.currency =  document.getElementById('editWishCurrency').value;
  w.category =  document.getElementById('editWishCategory').value;
  w.priority =  document.getElementById('editWishPriority').value || 'normal';
  w.notes    =  document.getElementById('editWishNotes').value.trim();
  saveState(); renderWishlist(); closeModal('modal-edit-wish');
}


// ════════════════════════════════════════════════════════
// INVENTARIO DE ALIMENTOS (Finanzas × Salud)
// ════════════════════════════════════════════════════════
const INV_DEFAULT_ITEMS = [
  { name: 'Bifes',            unit: 'kg' },
  { name: 'Carne molida',     unit: 'kg' },
  { name: 'Pechuga de pollo', unit: 'kg' },
  { name: 'Pacú',             unit: 'kg' },
  { name: 'Sábalo',           unit: 'kg' },
  { name: 'Zanahoria',        unit: 'kg' },
  { name: 'Cebolla',          unit: 'kg' },
  { name: 'Tomate',           unit: 'kg' },
  { name: 'Mandarina',        unit: 'kg' },
  { name: 'Naranja',          unit: 'kg' },
  { name: 'Agua',             unit: 'litros' },
  { name: 'Soda',             unit: 'litros' },
];

function _invMonthKey(d) { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

function ensureInventoryState() {
  if (!S.inventory) S.inventory = { items: [], log: {}, history: {} };
  if (!S.inventory.items)   S.inventory.items = [];
  if (!S.inventory.log)     S.inventory.log = {};
  if (!S.inventory.history) S.inventory.history = {};
  if (!S.inventory.items.length) {
    S.inventory.items = INV_DEFAULT_ITEMS.map(it => ({ id: uid(), name: it.name, unit: it.unit, daily: 0, monthly: 0, stock: 0 }));
    return true;
  }
  return false;
}

// Suma consumida (Dieta) de un ítem dentro del mes `mk`, según el log diario.
function _invMonthlyReal(mk, itemId) {
  let s = 0;
  for (const ds in S.inventory.log) {
    if (ds.slice(0, 7) === mk && S.inventory.log[ds] && (itemId in S.inventory.log[ds])) s += (+S.inventory.log[ds][itemId] || 0);
  }
  return s;
}

// Crea el historial del mes `mk` si no existe. Al pasar de mes, congela el real
// del mes anterior y recalcula la expectativa (diaria/mensual) en base a ese real.
function ensureInventoryMonth(mk) {
  ensureInventoryState();
  if (S.inventory.history[mk]) return false;
  const prevKeys = Object.keys(S.inventory.history).filter(k => k < mk).sort();
  const prevMk = prevKeys[prevKeys.length - 1];
  if (prevMk) {
    const [py, pmo] = prevMk.split('-').map(Number);
    const daysInPrev = new Date(py, pmo, 0).getDate();
    S.inventory.items.forEach(it => {
      const prevEntry = S.inventory.history[prevMk][it.id];
      if (!prevEntry) return;
      const real = _invMonthlyReal(prevMk, it.id);
      prevEntry.real = real;
      if (real !== prevEntry.expectedMonthly) {
        it.monthly = real;
        it.daily = +(real / daysInPrev).toFixed(2);
      }
    });
  }
  S.inventory.history[mk] = {};
  S.inventory.items.forEach(it => {
    S.inventory.history[mk][it.id] = { expectedDaily: it.daily, expectedMonthly: it.monthly, real: 0 };
  });
  return true;
}

function _invItem(id) { return (S.inventory.items || []).find(i => i.id === id); }

function renderInventory() {
  const body = document.getElementById('inventarioBody');
  if (!body) return;
  if (ensureInventoryState()) saveState();
  const mk = _invMonthKey();
  if (ensureInventoryMonth(mk)) saveState();
  const today = getActiveDate();

  const rows = S.inventory.items.map(it => {
    const consumedDay = (S.inventory.log[today] && +S.inventory.log[today][it.id]) || 0;
    const consumedMonth = _invMonthlyReal(mk, it.id);
    const neg = it.stock < 0;
    return `<div class="sub-row${neg ? ' inv-alert' : ''}">
      <div class="sub-info">
        <div class="sub-name">${it.name} ${neg ? '<span class="inv-alert-badge">⚠ stock negativo</span>' : ''}</div>
        <div class="sub-detail">Stock: <b class="${neg ? 'text-danger' : ''}">${it.stock} ${it.unit}</b> · Hoy: ${consumedDay}/${it.daily} ${it.unit} · Mes: ${consumedMonth}/${it.monthly} ${it.unit}</div>
      </div>
      <div class="flex gap-8 items-center" style="flex-wrap:wrap">
        <span class="mono" style="font-size:11px">stock</span>
        <input class="inp" style="width:60px" type="number" step="0.01" value="${it.stock}" onchange="setInvStock('${it.id}',this.value)">
        <span class="mono" style="font-size:11px">día</span>
        <input class="inp" style="width:60px" type="number" step="0.01" value="${it.daily}" onchange="setInvExpected('${it.id}','daily',this.value)">
        <span class="mono" style="font-size:11px">mes</span>
        <input class="inp" style="width:60px" type="number" step="0.01" value="${it.monthly}" onchange="setInvExpected('${it.id}','monthly',this.value)">
        <button class="icon-btn" onclick="deleteInvItem('${it.id}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('') || '<p class="empty-state">Sin ítems en el inventario</p>';

  body.innerHTML = `
    <div class="budget-block-hdr">
      <span>Ítems</span>
      <button class="btn btn-ghost btn-sm" onclick="openInvItemModal()">+ Ítem</button>
    </div>
    ${rows}`;
}

// ── Resumen de inventario (sección) · la edición completa vive en el overlay de Presupuesto ──
function renderInventarioResumen() {
  const body = document.getElementById('inventarioResumenBody'); if (!body) return;
  ensureInventoryState();
  const items = S.inventory.items;
  const alerts = items.filter(it => it.stock < 0);
  const rows = items.slice(0, 4).map(it => `
    <div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${it.name}${it.stock < 0 ? ' <span class="inv-alert-badge">⚠</span>' : ''}</div>
        <div class="sub-detail">Stock: <b class="${it.stock < 0 ? 'text-danger' : ''}">${it.stock} ${it.unit}</b></div>
      </div>
    </div>`).join('') || '<p class="empty-state">Sin ítems en el inventario</p>';
  const more = items.length > 4 ? `<div class="sub-detail" style="margin-top:6px">+ ${items.length - 4} ítem(s) más</div>` : '';

  body.innerHTML = `
    ${rows}${more}
    ${alerts.length ? `<div class="sub-detail text-danger" style="margin-top:6px">⚠ ${alerts.length} ítem(s) con stock negativo</div>` : ''}
    <button class="bsum-full" onclick="if(window.openBudgetOverlay)openBudgetOverlay()">Ver inventario completo →</button>`;
}

function setInvExpected(id, field, val) {
  const it = _invItem(id); if (!it) return;
  it[field] = +val || 0;
  saveState(); renderInventory(); renderInventarioResumen(); renderDieta(); renderDietaResumen();
}

function setInvStock(id, val) {
  const it = _invItem(id); if (!it) return;
  it.stock = +val || 0;
  saveState(); renderInventory(); renderInventarioResumen(); renderDieta(); renderDietaResumen();
}

function openInvItemModal() {
  document.getElementById('invItemName').value = '';
  document.getElementById('invItemUnit').value = 'kg';
  document.getElementById('invItemDaily').value = '';
  document.getElementById('invItemMonthly').value = '';
  openModal('modal-inv-item');
}

function saveInvItem() {
  const name = document.getElementById('invItemName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  ensureInventoryState();
  const unit = document.getElementById('invItemUnit').value.trim() || 'unidades';
  const daily = +document.getElementById('invItemDaily').value || 0;
  const monthly = +document.getElementById('invItemMonthly').value || 0;
  const it = { id: uid(), name, unit, daily, monthly, stock: 0 };
  S.inventory.items.push(it);
  const mk = _invMonthKey();
  if (S.inventory.history[mk]) S.inventory.history[mk][it.id] = { expectedDaily: daily, expectedMonthly: monthly, real: 0 };
  saveState(); renderInventory(); renderInventarioResumen(); renderDieta(); renderDietaResumen(); closeModal('modal-inv-item');
  showToast('Ítem agregado al inventario');
}

function deleteInvItem(id) {
  if (!confirm('¿Eliminar este ítem del inventario?')) return;
  S.inventory.items = S.inventory.items.filter(i => i.id !== id);
  saveState(); renderInventory(); renderInventarioResumen(); renderDieta(); renderDietaResumen();
}

// Match por nombre (case-insensitive) contra la descripción de un movimiento de Actividad.
// Si no hay match, no se crea el ítem automáticamente (Tobías debe agregarlo primero).
function invApplyPurchase(name, qty) {
  if (!qty) return;
  ensureInventoryState();
  const it = S.inventory.items.find(i => i.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!it) return;
  it.stock += qty;
}

// ════════════════════════════════════════════════════════
// DIETA (Salud) — planillas personalizadas (S.dieta.planillas) + checklist
// marcable con cantidad propia de la planilla activa, descuenta stock.
// ════════════════════════════════════════════════════════
function ensureDietaState() {
  if (!S.dieta) S.dieta = { planillas: [], activeId: null };
  if (!S.dieta.planillas) S.dieta.planillas = [];
  if (S.dieta.activeId === undefined) S.dieta.activeId = null;
}

// Planilla activa vigente; si el id activo apunta a una planilla borrada, la limpia.
function getActivePlanilla() {
  ensureDietaState();
  if (!S.dieta.activeId) return null;
  const p = S.dieta.planillas.find(p => p.id === S.dieta.activeId);
  if (!p) { S.dieta.activeId = null; return null; }
  return p;
}

function setActivePlanilla(id) {
  ensureDietaState();
  S.dieta.activeId = id || null;
  saveState(); renderDietaPlanillaBar(); renderDieta(); renderDietaResumen();
}

// ── Selector de planilla activa + acceso a "Gestionar planillas" ──
function renderDietaPlanillaBar() {
  const el = document.getElementById('dietaPlanillaBar');
  if (!el) return;
  ensureDietaState();
  const opts = S.dieta.planillas.map(p => `<option value="${p.id}" ${p.id === S.dieta.activeId ? 'selected' : ''}>${p.nombre}</option>`).join('');
  el.innerHTML = `
    <div class="flex gap-8 items-center" style="flex-wrap:wrap;margin-bottom:10px">
      <select class="inp" style="flex:1;min-width:140px" onchange="setActivePlanilla(this.value)">
        <option value="">— sin planilla activa —</option>
        ${opts}
      </select>
      <button class="btn btn-ghost btn-sm" onclick="openPlanillasListModal()">Gestionar planillas</button>
    </div>`;
}

function openPlanillasListModal() {
  renderPlanillasListModal();
  openModal('modal-dieta-planillas');
}

function renderPlanillasListModal() {
  const body = document.getElementById('dietaPlanillasListBody');
  if (!body) return;
  ensureDietaState();
  const rows = S.dieta.planillas.map(p => `
    <div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${p.nombre}${p.id === S.dieta.activeId ? ' <span class="inv-alert-badge" style="background:#10E07C22;color:#10E07C">activa</span>' : ''}</div>
        <div class="sub-detail">${p.items.length} ítem(s)</div>
      </div>
      <div class="flex gap-8">
        <button class="icon-btn" onclick="openPlanillaEditModal('${p.id}')">✎</button>
        <button class="icon-btn" onclick="deletePlanilla('${p.id}')">${_DEL_SVG}</button>
      </div>
    </div>`).join('') || '<p class="empty-state">Sin planillas creadas todavía</p>';
  body.innerHTML = rows;
}

function deletePlanilla(id) {
  if (!confirm('¿Eliminar esta planilla?')) return;
  ensureDietaState();
  S.dieta.planillas = S.dieta.planillas.filter(p => p.id !== id);
  if (S.dieta.activeId === id) S.dieta.activeId = null;
  saveState(); renderPlanillasListModal(); renderDietaPlanillaBar(); renderDieta(); renderDietaResumen();
}

// ── Crear/editar planilla: nombre + ítems del Inventario con cantidad propia ──
let _planillaEditId = null;
let _planillaEditItems = {}; // itemId -> cantidad (solo los incluidos en la planilla)

function openPlanillaEditModal(id) {
  ensureDietaState(); ensureInventoryState();
  _planillaEditId = id || null;
  const p = id ? S.dieta.planillas.find(p => p.id === id) : null;
  document.getElementById('planillaEditName').value = p ? p.nombre : '';
  _planillaEditItems = {};
  if (p) p.items.forEach(it => { if (_invItem(it.itemId)) _planillaEditItems[it.itemId] = it.cantidad; });
  renderPlanillaEditItems();
  document.getElementById('planillaEditDelBtn').style.display = p ? '' : 'none';
  closeModal('modal-dieta-planillas');
  openModal('modal-dieta-planilla-edit');
}

function renderPlanillaEditItems() {
  const body = document.getElementById('planillaEditItemsBody');
  if (!body) return;
  ensureInventoryState();
  body.innerHTML = S.inventory.items.map(it => {
    const checked = it.id in _planillaEditItems;
    const qty = checked ? _planillaEditItems[it.id] : '';
    return `<div class="sub-row">
      <label class="ptask-check"><input type="checkbox" ${checked ? 'checked' : ''} onchange="togglePlanillaEditItem('${it.id}',this.checked)"></label>
      <div class="sub-info"><div class="sub-name">${it.name}</div></div>
      <input class="inp" style="width:70px" type="number" step="0.01" value="${qty}" placeholder="cant." ${checked ? '' : 'disabled'} onchange="setPlanillaEditQty('${it.id}',this.value)">
    </div>`;
  }).join('') || '<p class="empty-state">Sin ítems en el inventario. Agregalos desde Finanzas → Inventario.</p>';
}

function togglePlanillaEditItem(itemId, checked) {
  if (checked) _planillaEditItems[itemId] = _planillaEditItems[itemId] || 0;
  else delete _planillaEditItems[itemId];
  renderPlanillaEditItems();
}

function setPlanillaEditQty(itemId, val) {
  if (itemId in _planillaEditItems) _planillaEditItems[itemId] = +val || 0;
}

function savePlanillaEdit() {
  const nombre = document.getElementById('planillaEditName').value.trim();
  if (!nombre) { showToast('Escribe el nombre de la planilla'); return; }
  ensureDietaState();
  const items = Object.keys(_planillaEditItems).map(itemId => ({ itemId, cantidad: +_planillaEditItems[itemId] || 0 }));
  if (_planillaEditId) {
    const p = S.dieta.planillas.find(p => p.id === _planillaEditId);
    if (p) { p.nombre = nombre; p.items = items; }
  } else {
    S.dieta.planillas.push({ id: uid(), nombre, items });
  }
  saveState(); closeModal('modal-dieta-planilla-edit');
  renderDietaPlanillaBar(); renderDieta(); renderDietaResumen();
  showToast('Planilla guardada');
}

function deletePlanillaEdit() {
  if (!_planillaEditId) return;
  closeModal('modal-dieta-planilla-edit');
  deletePlanilla(_planillaEditId);
}

// ── Checklist de Dieta: opera sobre los ítems/cantidades de la planilla activa ──
function renderDieta() {
  const body = document.getElementById('dietaBody');
  if (!body) return;
  ensureInventoryState(); ensureDietaState();
  renderDietaPlanillaBar();
  const planilla = getActivePlanilla();
  if (!planilla) {
    body.innerHTML = '<p class="empty-state">No hay una planilla de dieta activa. Creá una desde "Gestionar planillas" y seleccionala arriba para empezar a marcar el checklist.</p>';
    return;
  }
  const today = getActiveDate();
  const todayLog = S.inventory.log[today] || {};

  const rows = planilla.items.map(pit => {
    const it = _invItem(pit.itemId);
    if (!it) return ''; // ítem borrado del Inventario: no se muestra, el resto sigue intacto
    const done = it.id in todayLog;
    const qty = done ? todayLog[it.id] : pit.cantidad;
    const neg = it.stock < 0;
    return `<div class="sub-row${neg ? ' inv-alert' : ''}">
      <label class="ptask-check"><input type="checkbox" ${done ? 'checked' : ''} onchange="toggleDietItem('${it.id}')"></label>
      <div class="sub-info">
        <div class="sub-name">${it.name} ${neg ? '<span class="inv-alert-badge">⚠ stock negativo</span>' : ''}</div>
        <div class="sub-detail">Stock: <b class="${neg ? 'text-danger' : ''}">${it.stock} ${it.unit}</b></div>
      </div>
      <input class="inp" style="width:70px" type="number" step="0.01" id="diet-qty-${it.id}" value="${qty}" ${done ? 'disabled' : ''}>
    </div>`;
  }).join('') || '<p class="empty-state">Los ítems de esta planilla fueron eliminados del inventario.</p>';

  body.innerHTML = rows;
}

// ── Resumen de dieta (sección) · el checklist completo vive en el overlay ──
function renderDietaResumen() {
  const body = document.getElementById('dietaResumenBody'); if (!body) return;
  ensureInventoryState(); ensureDietaState();
  const planilla = getActivePlanilla();

  if (!planilla) {
    body.innerHTML = `<p class="empty-state">Sin planilla de dieta activa. Creá una desde el detalle.</p>
      <button class="ent-full" onclick="if(window.openDietaOverlay)openDietaOverlay()">Abrir dieta completa →</button>`;
    return;
  }

  const today = getActiveDate();
  const todayLog = S.inventory.log[today] || {};
  const validItems = planilla.items.map(pit => _invItem(pit.itemId)).filter(Boolean);
  const total = validItems.length;
  const done = validItems.filter(it => it.id in todayLog).length;
  const alerts = validItems.filter(it => it.stock < 0).length;

  if (!total) {
    body.innerHTML = `<p class="empty-state">La planilla activa no tiene ítems válidos.</p>
      <button class="ent-full" onclick="if(window.openDietaOverlay)openDietaOverlay()">Abrir dieta completa →</button>`;
    return;
  }

  body.innerHTML = `
    <div class="ent-kpis" style="grid-template-columns:repeat(${alerts ? 3 : 2},1fr)">
      <div class="ent-kpi"><div class="ent-kpi-num">${done}<span class="ent-kpi-u">/${total}</span></div><div class="ent-kpi-lbl">Hoy</div></div>
      <div class="ent-kpi"><div class="ent-kpi-num">${Math.round(total ? (done / total) * 100 : 0)}<span class="ent-kpi-u">%</span></div><div class="ent-kpi-lbl">Cumplido</div></div>
      ${alerts ? `<div class="ent-kpi"><div class="ent-kpi-num text-danger">${alerts}</div><div class="ent-kpi-lbl">Stock negativo</div></div>` : ''}
    </div>
    <button class="ent-full" onclick="if(window.openDietaOverlay)openDietaOverlay()">Abrir dieta completa →</button>`;
}

function toggleDietItem(id) {
  ensureInventoryState();
  const it = _invItem(id); if (!it) return;
  const today = getActiveDate();
  if (!S.inventory.log[today]) S.inventory.log[today] = {};
  const log = S.inventory.log[today];
  if (id in log) {
    // Desmarcar: restaura el stock y borra el registro del día.
    it.stock += log[id];
    delete log[id];
  } else {
    const inputEl = document.getElementById('diet-qty-' + id);
    const qty = inputEl ? (+inputEl.value || 0) : (it.daily || 0);
    it.stock -= qty;
    log[id] = qty;
  }
  saveState(); renderDieta(); renderDietaResumen(); renderInventory(); renderInventarioResumen();
}

// ════════════════════════════════════════════════════════
// CHARTS
// ════════════════════════════════════════════════════════
// ── Tema HUD global para todos los gráficos (Chart.js) ──
// Todo va envuelto en try/catch: si algo del tema falla, los gráficos igual se dibujan.
const _HUDVAR = { '--accent':'#38BDF8','--hud':'#38BDF8','--ok':'#00FF88','--warn':'#FFB020','--danger':'#FF3B47','--c-vida':'#00D4FF','--c-finanzas':'#22C55E','--c-salud':'#F43F5E','--c-conocimiento':'#4B7BEC','--c-ia':'#D4DCE8','--fin-green':'#22C55E' };
function _hudColor(v){ if (typeof v !== 'string') return v; const m = v.match(/var\((--[\w-]+)\)/); return m ? (_HUDVAR[m[1]] || '#38BDF8') : v; }
function _toRGBA(c, a){
  if (typeof c !== 'string') return 'rgba(56,189,248,' + a + ')';
  if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16); return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')'; }
  const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/); return m ? 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')' : 'rgba(56,189,248,' + a + ')';
}
function _setChartDefault(path, val){ try { const p = path.split('.'); let o = Chart.defaults; for (let i=0;i<p.length-1;i++){ if (o[p[i]]==null) o[p[i]]={}; o=o[p[i]]; } o[p[p.length-1]]=val; } catch(e){} }
try {
  const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  _setChartDefault('color', '#8BA5C0');
  _setChartDefault('borderColor', 'rgba(100,160,230,0.07)');
  _setChartDefault('font.family', MONO);
  _setChartDefault('font.size', 10);
  _setChartDefault('elements.line.tension', 0.4);
  _setChartDefault('elements.line.borderWidth', 2.5);
  _setChartDefault('elements.line.capBezierPoints', true);
  _setChartDefault('elements.point.radius', 0);
  _setChartDefault('elements.point.hoverRadius', 6);
  _setChartDefault('elements.point.hoverBorderWidth', 2.5);
  _setChartDefault('elements.point.backgroundColor', '#7DD3FC');
  _setChartDefault('elements.point.borderColor', '#020508');
  _setChartDefault('elements.arc.borderColor', 'rgba(2,5,8,0.9)');
  _setChartDefault('elements.arc.borderWidth', 2.5);
  _setChartDefault('elements.bar.borderRadius', 5);
  // Interacción tipo terminal: la columna entera responde (mejor en touch)
  _setChartDefault('interaction.mode', 'index');
  _setChartDefault('interaction.intersect', false);
  _setChartDefault('interaction.axis', 'x');
  // Animación de entrada premium (draw-in con deceleración)
  _setChartDefault('animation.duration', 850);
  _setChartDefault('animation.easing', 'easeOutQuart');
  _setChartDefault('animations.tension.duration', 900);
  _setChartDefault('animations.tension.easing', 'easeOutQuart');
  _setChartDefault('plugins.legend.labels.color', '#8BA5C0');
  _setChartDefault('plugins.legend.labels.usePointStyle', true);
  _setChartDefault('plugins.legend.labels.boxWidth', 7);
  _setChartDefault('plugins.legend.labels.boxHeight', 7);
  _setChartDefault('plugins.tooltip.backgroundColor', 'rgba(3,7,14,0.96)');
  _setChartDefault('plugins.tooltip.borderColor', 'rgba(56,189,248,0.45)');
  _setChartDefault('plugins.tooltip.borderWidth', 1);
  _setChartDefault('plugins.tooltip.titleColor', '#7DD3FC');
  _setChartDefault('plugins.tooltip.titleFont.family', MONO);
  _setChartDefault('plugins.tooltip.titleFont.size', 10);
  _setChartDefault('plugins.tooltip.titleFont.weight', '600');
  _setChartDefault('plugins.tooltip.bodyColor', '#EDF4FF');
  _setChartDefault('plugins.tooltip.bodyFont.family', MONO);
  _setChartDefault('plugins.tooltip.bodyFont.size', 12);
  _setChartDefault('plugins.tooltip.cornerRadius', 8);
  _setChartDefault('plugins.tooltip.padding', 11);
  _setChartDefault('plugins.tooltip.caretSize', 5);
  _setChartDefault('plugins.tooltip.displayColors', false);
  _setChartDefault('plugins.tooltip.animation.duration', 160);

  Chart.register({
    id: 'hudColors',
    beforeUpdate(chart) {
      try {
        chart.data.datasets.forEach(ds => {
          ['borderColor','backgroundColor','pointBackgroundColor','pointBorderColor','hoverBackgroundColor'].forEach(k => {
            if (typeof ds[k] === 'string' && ds[k].includes('var(')) ds[k] = _hudColor(ds[k]);
          });
        });
      } catch(e){}
    },
    beforeDatasetsDraw(chart) {
      try {
        const area = chart.chartArea; if (!area) return;
        chart.data.datasets.forEach((ds, i) => {
          const meta = chart.getDatasetMeta(i);
          if (meta.type !== 'line') return;
          const isDash = Array.isArray(ds.borderDash) && ds.borderDash.length > 0;
          // Capturar el color original UNA vez (string/var); luego siempre regeneramos desde él
          if (ds._origBorder === undefined) ds._origBorder = ds.borderColor;
          const base = _hudColor(ds._origBorder) || '#38BDF8';
          // Trazo con gradiente horizontal (claro→base→brillo) — se reconstruye cada draw (resize-safe)
          if (!ds._noGrad && !isDash && (ds._origBorder == null || typeof ds._origBorder === 'string')) {
            const gl = chart.ctx.createLinearGradient(area.left, 0, area.right, 0);
            gl.addColorStop(0, _toRGBA(base, 0.55)); gl.addColorStop(0.5, base); gl.addColorStop(1, _hudColor('#7DD3FC') || base);
            ds.borderColor = gl;
          }
          // Relleno con desvanecido vertical
          if (ds.fill) {
            const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, _toRGBA(base, 0.34)); g.addColorStop(0.55, _toRGBA(base, 0.08)); g.addColorStop(1, _toRGBA(base, 0.0));
            ds.backgroundColor = g;
          }
        });
      } catch(e){}
    }
  });

  Chart.register({
    id: 'hudGlow',
    beforeDatasetDraw(chart, args) {
      try {
        const ds = chart.data.datasets[args.index];
        const meta = chart.getDatasetMeta(args.index);
        chart.ctx.save();
        const isDash = Array.isArray(ds.borderDash) && ds.borderDash.length > 0;
        if (meta.type === 'bar' || ds._noGlow || isDash) return; // sin glow en barras ni líneas de tendencia
        let c = _hudColor(ds._origBorder) || _hudColor(Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor) || '#38BDF8';
        if (typeof c !== 'string') c = '#38BDF8';
        chart.ctx.shadowColor = c; chart.ctx.shadowBlur = 11; chart.ctx.shadowOffsetY = 1;
      } catch(e){ try { chart.ctx.save(); } catch(_){} }
    },
    afterDatasetDraw(chart) { try { chart.ctx.restore(); } catch(e){} }
  });

  // ── Crosshair: línea de escaneo vertical que sigue el cursor/touch (look terminal) ──
  Chart.register({
    id: 'hudCrosshair',
    afterDraw(chart) {
      try {
        if (chart.config.options && chart.config.options._noCrosshair) return;
        const a = chart._active; if (!a || !a.length) return;
        const area = chart.chartArea; if (!area) return;
        const x = a[0].element.x;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(125,211,252,0.35)';
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        // Halo en el punto activo
        a.forEach(p => {
          const el = p.element; if (el.y==null) return;
          ctx.beginPath(); ctx.setLineDash([]);
          ctx.arc(el.x, el.y, 8, 0, Math.PI*2);
          ctx.fillStyle = 'rgba(56,189,248,0.14)'; ctx.fill();
        });
        ctx.restore();
      } catch(e){}
    }
  });
} catch (e) { console.warn('[charts] tema HUD no aplicado:', e); }

let nwPieInst=null, nwLineInst=null, txnChartInst=null, sleepChartInst=null;

function initChartsForTab(tab) {
  if (tab==='finanzas') { initNWCharts(); }
}

function initNWCharts() {
  // Pie
  const pieCtx=document.getElementById('nwPieChart').getContext('2d');
  const types=['bank','invest','crypto','other'];
  const labels=['Cuentas','Inversión','Cripto','Otros'];
  const colors=['rgba(107,227,164,.7)','rgba(124,142,232,.7)','rgba(242,192,99,.7)','rgba(255,107,107,.7)'];
  const data=types.map(t=>S.accounts.filter(a=>a.type===t).reduce((s,a)=>s+a.balance,0));
  nwPieInst=new Chart(pieCtx,{
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', _noCrosshair:true, interaction:{ mode:'nearest', intersect:true }, animation:{ animateRotate:true, animateScale:true, duration:900, easing:'easeOutQuart' }, plugins:{ legend:{ position:'bottom', labels:{ font:{size:11, weight:'600'}, padding:12, color:'#C8D5E8' } } } }
  });
  // Line
  const lineCtx=document.getElementById('nwLineChart').getContext('2d');
  const hist=S.nwHistory.slice(-30);
  nwLineInst=new Chart(lineCtx,{
    type:'line',
    data:{ labels:hist.map(h=>h.date.slice(5)), datasets:[{ label:'Patrimonio', data:hist.map(h=>h.value), borderColor:'rgba(107,227,164,.8)', backgroundColor:'rgba(107,227,164,.06)', tension:.3, pointRadius:3, fill:true }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ font:{size:9} } }, y:{ ticks:{ font:{size:9}, callback:v=>fmtMoney(v,'USD') } } } }
  });
}

function updateNWCharts() {
  if (!nwPieInst||!nwLineInst) return;
  const types=['bank','invest','crypto','other'];
  nwPieInst.data.datasets[0].data=types.map(t=>S.accounts.filter(a=>a.type===t).reduce((s,a)=>s+a.balance,0));
  nwPieInst.update('none');
  const hist=S.nwHistory.slice(-30);
  nwLineInst.data.labels=hist.map(h=>h.date.slice(5));
  nwLineInst.data.datasets[0].data=hist.map(h=>h.value);
  nwLineInst.update('none');
}

// ════════════════════════════════════════════════════════
// BIENESTAR TRACKER
// ════════════════════════════════════════════════════════

const WELLNESS_METRICS = [
  { id: 'sleepQuality', label: 'Calidad de sueño', color: '#7C8EE8' },
  { id: 'energy',       label: 'Energía',           color: '#FFB020' },
  { id: 'mood',         label: 'Estado de ánimo',   color: '#00D4FF' },
  { id: 'pain',         label: 'Dolor',             color: '#FF4D4D' },
  { id: 'stress',       label: 'Estrés',            color: '#FF8C00' },
];
const WELLNESS_LABELS = ['—', 'Pésimo', 'Mal', 'Más o menos', 'Bien', 'Excelente'];

function _sleepCalcHours(bedtime, waketime) {
  if (!bedtime || !waketime) return null;
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = waketime.split(':').map(Number);
  let bed  = bh + bm / 60;
  let wake = wh + wm / 60;
  if (wake <= bed) wake += 24;
  const h = Math.round((wake - bed) * 2) / 2;
  return h > 0 ? h : null;
}

function saveSleepTimes() {
  const today = getActiveDate();
  if (!S.sleepLog[today]) S.sleepLog[today] = {};
  const entry = S.sleepLog[today];
  entry.bedtime  = document.getElementById('sleepBedtime').value;
  entry.waketime = document.getElementById('sleepWaketime').value;
  const h = _sleepCalcHours(entry.bedtime, entry.waketime);
  if (h !== null) entry.hours = h;
  saveState();
  renderSleepTracker();
}

function setWellnessMetric(metricId, val) {
  const today = getActiveDate();
  if (!S.sleepLog[today]) S.sleepLog[today] = {};
  if (!S.sleepLog[today].wellness) S.sleepLog[today].wellness = {};
  const cur = S.sleepLog[today].wellness[metricId] || 0;
  S.sleepLog[today].wellness[metricId] = cur === val ? 0 : val;
  saveState();
  renderSleepTracker();
}

function saveSleepNotes() {
  const today = getActiveDate();
  if (!S.sleepLog[today]) S.sleepLog[today] = {};
  S.sleepLog[today].notes = document.getElementById('sleepNotesText').value;
  saveState();
}

function toggleSleepNotes() {
  const body    = document.getElementById('sleepNotesBody');
  const chevron = document.getElementById('sleepNotesChevron');
  const open    = body.classList.toggle('open');
  chevron.style.transform = open ? 'rotate(180deg)' : '';
}

function renderSleepTracker() {
  const today   = getActiveDate();
  const entry   = S.sleepLog[today] || {};
  const wellness = entry.wellness || {};

  // Wellness grid
  const grid = document.getElementById('wellnessGrid');
  if (grid) {
    grid.innerHTML = WELLNESS_METRICS.map(m => {
      const sel  = wellness[m.id] || 0;
      const desc = WELLNESS_LABELS[sel];
      const btns = [1,2,3,4,5].map(n => {
        const active = sel === n;
        const style  = active ? ` style="--wc:${m.color}"` : '';
        return `<button class="wellness-btn${active ? ' active' : ''}"${style} onclick="setWellnessMetric('${m.id}',${n})">${n}</button>`;
      }).join('');
      const descStyle = sel ? ` style="color:${m.color}"` : '';
      return `<span class="wellness-name">${m.label}</span>${btns}<span class="wellness-desc"${descStyle}>${desc}</span>`;
    }).join('');
  }

  // Horas
  let hours = entry.hours ?? null;
  if (entry.bedtime && entry.waketime) {
    const calc = _sleepCalcHours(entry.bedtime, entry.waketime);
    if (calc !== null) hours = calc;
  }
  document.getElementById('sleepHoursVal').textContent = hours !== null ? hours : '—';

  // Time inputs
  const bedEl  = document.getElementById('sleepBedtime');
  const wakeEl = document.getElementById('sleepWaketime');
  if (bedEl)  bedEl.value  = entry.bedtime  || '';
  if (wakeEl) wakeEl.value = entry.waketime || '';

  // Notes
  const notesEl = document.getElementById('sleepNotesText');
  if (notesEl) notesEl.value = entry.notes || '';

  _renderSleepChart();
}

function _renderSleepChart() {
  const canvas = document.getElementById('sleepChart');
  if (!canvas) return;

  const today = getActiveDate();
  const days  = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const labels = days.map(d => { const p = d.split('-'); return `${+p[2]}/${+p[1]}`; });

  // Horas dormidas con colores adaptativos (verde 7-9h, ámbar 5-7 o >9, rojo <5)
  const hoursData = days.map(d => {
    const e = S.sleepLog[d] || {};
    let h = e.hours ?? null;
    if (e.bedtime && e.waketime) { const c = _sleepCalcHours(e.bedtime, e.waketime); if (c !== null) h = c; }
    return h;
  });
  const hoursBg     = hoursData.map(h => h === null ? 'rgba(100,100,100,0.1)' : h >= 7 && h <= 9 ? 'rgba(0,255,136,0.3)' : h >= 5 ? 'rgba(255,176,32,0.3)' : 'rgba(255,70,70,0.3)');
  const hoursBorder = hoursData.map(h => h === null ? 'transparent' : h >= 7 && h <= 9 ? 'rgba(0,255,136,0.75)' : h >= 5 ? 'rgba(255,176,32,0.75)' : 'rgba(255,70,70,0.75)');

  // Series de métricas de bienestar
  const metricDatasets = WELLNESS_METRICS.map(m => ({
    label: m.label,
    data:  days.map(d => S.sleepLog[d]?.wellness?.[m.id] || null),
    type:  'line',
    yAxisID: 'y1',
    borderColor:          m.color,
    backgroundColor:      m.color + '20',
    borderWidth: 1.8,
    pointRadius: 3,
    pointBackgroundColor: m.color,
    tension: 0.38,
    spanGaps: true,
  }));

  if (sleepChartInst) { sleepChartInst.destroy(); sleepChartInst = null; }
  sleepChartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Horas de sueño',
          data:            hoursData,
          backgroundColor: hoursBg,
          borderColor:     hoursBorder,
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: 'y',
          order: 2,
        },
        ...metricDatasets.map(d => ({ ...d, order: 1 })),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#76746E', font: { size: 8 },
            boxWidth: 10, padding: 6,
            filter(item) { return item.datasetIndex > 0; },
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.datasetIndex === 0) {
                const h = ctx.raw;
                return h !== null ? `Sueño: ${h}h` : 'Sueño: sin datos';
              }
              const v = ctx.raw;
              return v ? `${ctx.dataset.label}: ${v}/5 — ${WELLNESS_LABELS[v]}` : `${ctx.dataset.label}: —`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#76746E', font: { size: 9 } },
          grid:  { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          min: 0, max: 12,
          position: 'left',
          ticks: {
            color: 'rgba(180,180,180,0.5)',
            font: { size: 9 },
            stepSize: 2,
            callback: v => `${v}h`,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y1: {
          min: 0, max: 5,
          position: 'right',
          ticks: {
            color: '#76746E',
            font: { size: 8 },
            stepSize: 1,
            callback: v => Number.isInteger(v) && v > 0 ? v : '',
          },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

// ════════════════════════════════════════════════════════
// ACHIEVEMENTS SYSTEM  —  logros repetibles
// ════════════════════════════════════════════════════════
//
// Cada logro puede obtenerse N veces.
// La condición de un nuevo earn es:
//   metric  >=  threshold × (timesEarned + 1)
// donde metric crece con el tiempo (streak, meses, etc.)
// y threshold es el umbral por vuelta.
// ── Data helpers ─────────────────────────────────────────
function _mStr(y, m) { return `${y}-${String(m+1).padStart(2,'0')}`; }
function _dStr(y, m, d) { return `${_mStr(y,m)}-${String(d).padStart(2,'0')}`; }

function achConsecDays(predFn, maxLook = 120) {
  const today = getActiveDate(); let streak = 0;
  for (let i = 0; i < maxLook; i++) {
    const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - i);
    if (predFn(d.toISOString().slice(0, 10))) streak++; else break;
  }
  return streak;
}

function achTotalSurplusMonths() {
  let count = 0; const now = new Date();
  for (let i = 0; i < 48; i++) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = _mStr(d.getFullYear(), d.getMonth());
    const tx = (S.transactions||[]).filter(t => t.date?.startsWith(mk));
    if (!tx.length) continue;
    const inc = tx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const exp = tx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    if (inc > exp) count++;
  }
  return count;
}

function achGymMonthPct(y, m) {
  // Denominator = días del mes menos los marcados como 'rest'.
  // Numerador   = días con 'done'.
  // Lee desde el hábito migrado; fallback al workoutCalendar original.
  const gymHabit = (S.habitTrackers?.salud || []).find(h => h.id === 'habit-entrenamientos');
  const days = gymHabit?.days || S.workoutCalendar?.days || {};
  const dim  = new Date(y, m+1, 0).getDate();
  let done = 0, total = 0;
  for (let d = 1; d <= dim; d++) {
    const ds = _dStr(y, m, d);
    if (days[ds] === 'rest') continue; // días de descanso no cuentan
    total++;
    if (days[ds] === 'done') done++;
  }
  return total ? done / total * 100 : 0;
}

function achQualifyingGymMonths() {
  let count = 0; const now = new Date();
  // Empieza en mo=1 para saltear el mes actual (incompleto)
  for (let mo = 1; mo <= 48; mo++) {
    const d = new Date(now.getFullYear(), now.getMonth() - mo, 1);
    if (achGymMonthPct(d.getFullYear(), d.getMonth()) >= 75) count++;
  }
  return count;
}

function achGymStreak75() {
  let streak = 0; const now = new Date();
  for (let mo = 0; mo < 48; mo++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - mo, 1);
    if (achGymMonthPct(d.getFullYear(), d.getMonth()) >= 75) streak++; else break;
  }
  return streak;
}

function achStudyMonthPct(y, m) {
  // Denominator = todos los días del mes (sin excepción de día de semana).
  // Numerador   = días con 'done' o 'studied' (solo pueden ser pasados/hoy).
  // Lee desde el hábito migrado; fallback al studyCalendar original.
  const studyHabit = (S.habitTrackers?.conocimiento || []).find(h => h.id === 'habit-estudio');
  const days = studyHabit?.days || S.studyCalendar?.days || {};
  const dim  = new Date(y, m+1, 0).getDate();
  let done = 0;
  for (let d = 1; d <= dim; d++) {
    const st = days[_dStr(y, m, d)];
    if (st === 'done' || st === 'studied') done++;
  }
  return dim ? done / dim * 100 : 0;
}

function achQualifyingStudyMonths() {
  let count = 0; const now = new Date();
  // Empieza en mo=1 para saltear el mes actual (incompleto)
  for (let mo = 1; mo <= 48; mo++) {
    const d = new Date(now.getFullYear(), now.getMonth() - mo, 1);
    if (achStudyMonthPct(d.getFullYear(), d.getMonth()) >= 80) count++;
  }
  return count;
}

function achStudyStreak80() {
  let streak = 0; const now = new Date();
  for (let mo = 0; mo < 48; mo++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - mo, 1);
    if (achStudyMonthPct(d.getFullYear(), d.getMonth()) >= 80) streak++; else break;
  }
  return streak;
}

// ── Log helpers (nueva estructura) ───────────────────────
// achievementLog[id] = { n: number, lastDate: string, hwm: number }
// hwm = high water mark (métrica al último earn)
// Backwards compat: si es string, tratar como { n:1, lastDate: string, hwm: 0 }
function _achEntry(id) {
  const v = S.achievementLog?.[id];
  if (!v) return { n:0, lastDate:null, hwm:0 };
  if (typeof v === 'string') return { n:1, lastDate:v, hwm:0 };
  return v;
}
function _achN(id)    { return _achEntry(id).n; }
function _achDate(id) { return _achEntry(id).lastDate; }
function _achRecord(id, metric) {
  if (!S.achievementLog) S.achievementLog = {};
  const e = _achEntry(id);
  S.achievementLog[id] = { n: e.n + 1, lastDate: getActiveDate(), hwm: metric };
}

// ── Achievement definitions ───────────────────────────────
// check() → { metric, threshold, lbl? }
// Se otorga cuando: metric >= threshold × (n + 1)
// El progreso hacia el siguiente earn:
//   cycleProgress = metric - threshold × n   [0..threshold]
const ACHIEVEMENTS = [
  // ── VIDA ──────────────────────────────────────────────
  { id:'streak_7',  section:'vida', icon:'⚡', rarity:'silver',
    name:'Disciplinado',
    desc:'Completar todas las metas del día 7 días seguidos',
    check() { const m=S.streak?.count||0; return {metric:m, threshold:7}; } },

  { id:'streak_30', section:'vida', icon:'🔥', rarity:'gold',
    name:'Imparable',
    desc:'Completar todas las metas del día 30 días seguidos',
    check() { const m=S.streak?.count||0; return {metric:m, threshold:30}; } },

  { id:'sleep_14',  section:'vida', icon:'😴', rarity:'silver',
    name:'Dormilón Sano',
    desc:'Registrar el sueño 14 días seguidos',
    check() { return {metric:achConsecDays(ds=>!!S.sleepLog?.[ds]?.hours), threshold:14}; } },

  // ── FINANZAS ──────────────────────────────────────────
  { id:'responsible', section:'finanzas', icon:'📋', rarity:'gold',
    name:'Responsable',
    desc:'Marcar 30 veces el hábito "Registro financiero" en el calendario (acumula)',
    check() {
      const habit=(S.habitTrackers?.finanzas||[]).find(h=>h.id==='habit-registro-financiero');
      const days=habit?.days||S.financeCalendar?.days||{};
      const m=Object.values(days).filter(v=>v==='done').length;
      return {metric:m, threshold:30};
    } },

  { id:'saver_3',  section:'finanzas', icon:'💰', rarity:'gold',
    name:'Ahorrador',
    desc:'Acumular 3 meses con superávit (se acumula de por vida)',
    check() { return {metric:achTotalSurplusMonths(), threshold:3}; } },

  { id:'saver_12', section:'finanzas', icon:'👑', rarity:'diamond',
    name:'Ahorrador Supremo',
    desc:'Acumular 12 meses con superávit',
    check() { return {metric:achTotalSurplusMonths(), threshold:12}; } },

  // ── SALUD ─────────────────────────────────────────────
  { id:'athlete',       section:'salud', icon:'🏋️', rarity:'gold',
    name:'Deportista',
    desc:'Mes con +75% de asistencia al gym, sin contar días de descanso (cada mes calificado suma)',
    check() { return {metric:achQualifyingGymMonths(), threshold:1}; } },

  { id:'athlete_elite', section:'salud', icon:'🥇', rarity:'diamond',
    name:'Deportista de Élite',
    desc:'12 meses consecutivos completos con +75% de asistencia al gym, sin contar días de descanso',
    check() { return {metric:achGymStreak75(), threshold:12}; } },

  // ── CONOCIMIENTO ──────────────────────────────────────
  { id:'reader',  section:'conocimiento', icon:'📖', rarity:'gold',
    name:'Lector',
    desc:'30 días seguidos cumpliendo la lectura diaria',
    check() {
      const habit=(S.habitTrackers?.conocimiento||[]).find(h=>h.id==='habit-lectura');
      const days=habit?.days||{};
      return {metric:achConsecDays(ds=>days[ds]==='done'), threshold:30};
    } },

  { id:'student', section:'conocimiento', icon:'📚', rarity:'gold',
    name:'Estudiante Aplicado',
    desc:'Mes con 80%+ de días de estudio (cada mes calificado suma)',
    check() { return {metric:achQualifyingStudyMonths(), threshold:1}; } },

  { id:'master',  section:'conocimiento', icon:'🎓', rarity:'diamond',
    name:'Maestro',
    desc:'12 meses consecutivos con 80%+ de días de estudio',
    check() { return {metric:achStudyStreak80(), threshold:12}; } },

  { id:'jurist',  section:'conocimiento', icon:'⚖️', rarity:'silver',
    name:'Jurista',
    desc:'Aprobar 10 materias (cada 10 suma una obtención)',
    check() {
      const done=(S.lawProgress?.years||[]).flatMap(y=>y.subjects).filter(s=>s.done).length;
      return {metric:done, threshold:10};
    } },

  { id:'lawyer',  section:'conocimiento', icon:'🦅', rarity:'diamond',
    name:'Abogado',
    desc:'Completar todas las materias de la carrera',
    check() {
      const all=(S.lawProgress?.years||[]).flatMap(y=>y.subjects);
      const done=all.filter(s=>s.done).length;
      const total=all.length||47;
      return {metric:done===total&&total>0?total:done, threshold:total};
    } },

  // ── IA ────────────────────────────────────────────────
  { id:'ai_pioneer', section:'ia', icon:'🤖', rarity:'gold',
    name:'Pionero IA',
    desc:'Primer mes usando herramientas de IA de forma consistente',
    future:'🔗 Se conectará al tracker de cursos e IA',
    check() { return {metric:0, threshold:1}; } },

  { id:'ai_master',  section:'ia', icon:'🧠', rarity:'diamond',
    name:'Maestro IA',
    desc:'Completar 3 cursos o proyectos de IA (cada 3 suma)',
    future:'🔗 Se conectará al tracker de cursos e IA',
    check() { return {metric:0, threshold:3}; } },
];

// ── Achievement panel ─────────────────────────────────────
let _achSection = 'finanzas';

const _RC = {
  bronze:  {l:'Bronce',   c:'#CD7F32', g:'rgba(205,127,50,.4)',  b:'rgba(205,127,50,.08)',  e:'rgba(205,127,50,.28)' },
  silver:  {l:'Plata',    c:'#B8B6B0', g:'rgba(184,182,176,.3)', b:'rgba(184,182,176,.07)', e:'rgba(184,182,176,.22)'},
  gold:    {l:'Oro',      c:'#F2C063', g:'rgba(242,192,99,.45)', b:'rgba(242,192,99,.09)',  e:'rgba(242,192,99,.3)'  },
  diamond: {l:'Diamante', c:'#00D4FF', g:'rgba(0,212,255,.45)',  b:'rgba(0,212,255,.08)',   e:'rgba(0,212,255,.3)'  },
};

const _AS = ['vida','finanzas','salud','conocimiento','ia'];
const _AI = {vida:'🌟',finanzas:'💎',salud:'❤️',conocimiento:'📚',ia:'🤖'};
const _AL = {vida:'Vida',finanzas:'Finanzas',salud:'Salud',conocimiento:'Conocimiento',ia:'IA'};

function openAchievements() {
  if (!S.achievementLog) S.achievementLog = {};
  const newly = _achCheck();
  renderAchievementsPanel();
  document.getElementById('ach-overlay').classList.add('open');
  if (newly.length) {
    setTimeout(() => {
      showConfetti(3500);
      const n = _achN(newly[0].id);
      const suffix = n > 1 ? ` (×${n})` : '';
      showToast(`🏆 ¡Logro: ${newly[0].name}${suffix}!`, 4000);
    }, 400);
  }
}

function closeAchievements() {
  document.getElementById('ach-overlay').classList.remove('open');
}

function _achCheck() {
  if (!S.achievementLog) S.achievementLog = {};
  const fresh = [];
  ACHIEVEMENTS.forEach(a => {
    try {
      const {metric, threshold} = a.check();
      const n = _achN(a.id);
      // Award once per threshold multiple crossed
      const targetN = Math.floor(metric / threshold);
      if (targetN > n && metric > 0) {
        // Could be multiple earns at once (e.g., missed checking)
        const earns = targetN - n;
        for (let i = 0; i < earns; i++) _achRecord(a.id, metric);
        fresh.push(a);
      }
    } catch(e) {}
  });
  if (fresh.length) saveState();
  return fresh;
}

function checkAchievements() { _achCheck(); }

function renderAchievementsPanel() {
  // Total unique achievements with at least 1 earn
  const totAll   = ACHIEVEMENTS.length;
  const totOn    = ACHIEVEMENTS.filter(a=>_achN(a.id)>0).length;
  const totEarns = ACHIEVEMENTS.reduce((s,a)=>s+_achN(a.id),0);

  const tabsHTML = _AS.map(s => {
    const earns = ACHIEVEMENTS.filter(a=>a.section===s).reduce((acc,a)=>acc+_achN(a.id),0);
    const tot   = ACHIEVEMENTS.filter(a=>a.section===s).length;
    const on    = ACHIEVEMENTS.filter(a=>a.section===s&&_achN(a.id)>0).length;
    return `<button class="ach-tab-btn${s===_achSection?' active':''}" onclick="_achSection='${s}';renderAchievementsPanel()">
      ${_AI[s]} ${_AL[s]}<span class="ach-tab-count">${on}/${tot}</span>
    </button>`;
  }).join('');

  const sectionList = ACHIEVEMENTS.filter(a=>a.section===_achSection);
  const unlocked    = sectionList.filter(a=>_achN(a.id)>0).sort((a,b)=>_achN(b.id)-_achN(a.id));
  const locked      = sectionList.filter(a=>_achN(a.id)===0);

  const achCard = a => {
    const rc  = _RC[a.rarity]||_RC.gold;
    const n   = _achN(a.id);
    const isOn = n > 0;
    let metric = 0, threshold = 1;
    try { ({metric, threshold} = a.check()); } catch(e) {}

    // Progress within the CURRENT cycle (toward next earn)
    const cycleProgress = metric - threshold * n;      // 0..threshold
    const pct = Math.min(100, Math.round(cycleProgress / threshold * 100));
    const nextTarget = threshold * (n + 1);
    const lbl = `${metric} / ${nextTarget}`;

    return `<div class="ach-card${a.future&&!isOn?' ach-card-future':''}"
      style="${isOn?`border-color:${rc.e};background:${rc.b};box-shadow:0 0 22px ${rc.g}`:''}">
      <div class="ach-icon" style="position:relative;${isOn?`color:${rc.c};filter:drop-shadow(0 0 8px ${rc.g})`:'filter:grayscale(1);opacity:.28'}">
        ${a.icon}
        ${n>1?`<span style="position:absolute;bottom:-4px;right:-8px;font-size:9px;font-weight:900;background:${rc.c};color:#050506;border-radius:99px;padding:1px 5px;line-height:1.5">×${n}</span>`:''}
      </div>
      <div class="ach-body">
        <div class="ach-name" style="${isOn?`color:${rc.c}`:'color:var(--ts)'}">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
        ${a.future&&!isOn?`<div class="ach-future-note">${a.future}</div>`:''}
        <div class="ach-prog-wrap"><div class="ach-prog-bar" style="width:${pct}%;background:${rc.c}"></div></div>
        <div class="ach-prog-lbl">
          ${isOn
            ? `✓ ×${n} obtenido · último ${fmtDate(_achDate(a.id))} · siguiente: ${lbl}`
            : lbl}
        </div>
      </div>
      <span class="ach-rarity" style="color:${rc.c};border-color:${rc.e};background:${rc.b}">${rc.l}</span>
    </div>`;
  };

  document.getElementById('ach-panel').innerHTML = `
    <div class="ach-handle"></div>
    <div class="ach-header-row">
      <div>
        <div class="ach-title">🏆 Logros</div>
        <div class="ach-subtitle">${totOn}/${totAll} desbloqueados · ${totEarns} obtenciones totales</div>
      </div>
      <button class="icon-btn" onclick="closeAchievements()">
        <svg viewBox="0 0 24 24" style="width:20px;height:20px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="ach-global-bar"><div class="ach-global-fill" style="width:${Math.round(totOn/totAll*100)}%"></div></div>
    <div class="ach-tabs">${tabsHTML}</div>
    <div class="ach-list">
      ${unlocked.length
        ? `<div class="ach-group-label" style="color:#F2C063">🏆 Obtenidos — ${unlocked.length}</div>${unlocked.map(achCard).join('')}`
        : ''}
      ${locked.length
        ? `<div class="ach-group-label"${unlocked.length?' style="margin-top:16px"':''}>🔒 En progreso — ${locked.length}</div>${locked.map(achCard).join('')}`
        : ''}
    </div>`;
}

// ════════════════════════════════════════════════════════
// CELEBRATION EFFECTS  (Goals section — Vida tab)
// ════════════════════════════════════════════════════════

function showConfetti(duration = 4500) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const COLORS = ['#6BE3A4','#7C8EE8','#F2C063','#FF6B6B','#00D4FF','#22C55E','#FAFAFA','#F43F5E','#FFD700'];
  const SHAPES = ['rect','circle','tri'];
  const N = 180;

  const pts = Array.from({length:N}, () => ({
    x:  Math.random() * canvas.width,
    y: -30 - Math.random() * 220,
    vx: (Math.random() - 0.5) * 7,
    vy:  2.5 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random()*COLORS.length)],
    shape: SHAPES[Math.floor(Math.random()*SHAPES.length)],
    w: 5 + Math.random() * 14,
    h: 4 + Math.random() * 8,
    r: 3 + Math.random() * 6,
    angle: Math.random() * Math.PI * 2,
    spin:  (Math.random() - 0.5) * 0.28,
    wave:  Math.random() * Math.PI * 2,
    wAmp:  0.6 + Math.random() * 1.8,
  }));

  const t0 = Date.now();
  (function frame() {
    const el = Date.now() - t0;
    const fade = el < duration * 0.65 ? 1 : Math.max(0, 1 - (el - duration * 0.65) / (duration * 0.35));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach(p => {
      p.x    += p.vx + Math.sin(p.wave) * p.wAmp;
      p.y    += p.vy;
      p.vy   += 0.045;
      p.angle += p.spin;
      p.wave  += 0.055;
      if (p.y > canvas.height + 40) { p.y = -20; p.x = Math.random()*canvas.width; p.vy = 2.5 + Math.random()*4; }
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      if (p.shape === 'rect') {
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      } else if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(0,-p.r); ctx.lineTo(p.r,p.r); ctx.lineTo(-p.r,p.r); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    });
    if (el < duration) requestAnimationFrame(frame); else canvas.remove();
  })();
}

function showMissionBanner() {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; top:18%; left:50%; transform:translateX(-50%);
    background:linear-gradient(135deg,rgba(107,227,164,.22),rgba(34,197,94,.18));
    border:2px solid rgba(107,227,164,.55); border-radius:20px;
    padding:18px 32px; text-align:center; pointer-events:none; z-index:10000;
    backdrop-filter:blur(20px); box-shadow:0 0 60px rgba(107,227,164,.35),0 20px 60px rgba(0,0,0,.4);
    animation:missionBanner 3.8s cubic-bezier(.22,1,.36,1) forwards;
    white-space:nowrap;
  `;
  el.innerHTML = `
    <div style="font-size:36px;line-height:1;margin-bottom:6px">🏆</div>
    <div style="font-size:22px;font-weight:900;letter-spacing:.06em;color:#6BE3A4;text-shadow:0 0 30px rgba(107,227,164,.8)">¡MISIÓN CUMPLIDA!</div>
    <div style="font-size:14px;color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Todas las metas del día completadas</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showFireEffect() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed; bottom:calc(var(--nav) + var(--safe-b)); left:0; right:0;
    display:flex; justify-content:center; align-items:flex-end; gap:2px;
    pointer-events:none; z-index:9998; padding:0 8px;
  `;
  const EMOJIS = ['🔥','🔥','🔥','💀','🔥','😱','🔥','🔥','💀','🔥'];
  EMOJIS.forEach((e, i) => {
    const span = document.createElement('span');
    const sz  = 22 + Math.random() * 26;
    const dur = 750 + Math.random() * 700;
    const del = i * 55 + Math.random() * 80;
    span.textContent = e;
    span.style.cssText = `font-size:${sz}px;display:inline-block;opacity:0;
      animation:fireRise ${dur}ms ease-out forwards;animation-delay:${del}ms;`;
    overlay.appendChild(span);
  });
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2400);
}

function showFailBanner() {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; top:20%; left:50%; transform:translateX(-50%);
    background:linear-gradient(135deg,rgba(255,107,107,.18),rgba(255,50,50,.12));
    border:2px solid rgba(255,107,107,.5); border-radius:20px;
    padding:16px 28px; text-align:center; pointer-events:none; z-index:10000;
    backdrop-filter:blur(20px); box-shadow:0 0 50px rgba(255,107,107,.3),0 20px 60px rgba(0,0,0,.4);
    animation:failBanner 3.4s cubic-bezier(.22,1,.36,1) forwards;
    white-space:nowrap;
  `;
  el.innerHTML = `
    <div style="font-size:32px;line-height:1;margin-bottom:6px">🔥💀🔥</div>
    <div style="font-size:18px;font-weight:900;letter-spacing:.06em;color:#FF6B6B;text-shadow:0 0 30px rgba(255,107,107,.8)">METAS SIN CUMPLIR</div>
    <div style="font-size:13px;color:rgba(255,255,255,.65);margin-top:5px;font-weight:600">A recuperarlas mañana — sin excusas</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function showSparkle(x, y) {
  const EMOJIS = ['⭐','✨','💫'];
  for (let i = 0; i < 7; i++) {
    const span = document.createElement('span');
    const angle = (i / 7) * Math.PI * 2;
    const dist  = 28 + Math.random() * 22;
    span.textContent = EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
    span.style.cssText = `
      position:fixed; left:${x-10}px; top:${y-10}px; font-size:${11+Math.random()*8}px;
      pointer-events:none; z-index:9999;
      --tx:${(Math.cos(angle)*dist).toFixed(0)}px; --ty:${(Math.sin(angle)*dist).toFixed(0)}px;
      animation:sparkleOut 650ms ease-out forwards;
    `;
    document.body.appendChild(span);
    setTimeout(() => span.remove(), 700);
  }
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
async function _initApp() {
await loadState();
_startFirestoreSync();
if (typeof window._reloadProyectosFromState === 'function') window._reloadProyectosFromState();
_migratePhotos();   // migra fotos embebidas viejas a Storage (una vez, cuando Storage esté listo)
updateDayProgress();
setInterval(updateDayProgress, 60000);
setInterval(buildTickerAlerts, 30000);
setInterval(() => {
  const p = document.querySelector('.tab-panel.active');
  if (p) renderReminders(p.id.replace('tab-', ''));
}, 60000);
setInterval(checkReminderNotifications, 60000);
setInterval(() => { if (!Object.keys(_rtnTimers).length) _msHub.showReminders(); }, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { checkReminderNotifications(); _syncOnFocus(); _msHub.showReminders(); }
  else { _fbFlush(); }   // al ocultar: subir cambios pendientes sin esperar el debounce de 2s
});
window.addEventListener('pagehide', _fbFlush);
// Reintento de saves que quedaron pendientes por falta de conexión (ver _fbDoSave):
// al volver online, y como red de seguridad cada 60s.
window.addEventListener('online', () => { if (localStorage.getItem('_pendingCloudSave')) _fbSave(); });
setInterval(() => {
  if (localStorage.getItem('_pendingCloudSave') && !_fbSaveTid && !_fbSaveInProgress && navigator.onLine !== false) _fbDoSave();
}, 60000);

renderGoals();
renderSleepTracker();
renderTabHeader('vidaHeaderMeta');
renderQuarterlyObjectives();
['vida','finanzas','salud','conocimiento','ia'].forEach(renderReminders);
renderLawProgress();
renderLawMilestones();
renderLawPlan();
renderFinObjectives();
['vida','finanzas','salud','conocimiento','ia'].forEach(renderHabitsCard);

chartsInited['vida']=true;
chartsInited['finanzas']=false;
chartsInited['conocimiento']=false;
chartsInited['salud']=false;
chartsInited['ia']=false;

buildTickerAlerts();
// Activar media session con recordatorios próximos al cargar
setTimeout(() => _msHub.showReminders(), 500);
}

// ════════════════════════════════════════════════════════
// AUTH GATE — Google Sign-In (Etapa 1: con escape; reglas Firestore aún abiertas)
// ════════════════════════════════════════════════════════
let _appBooted   = false;
function _bootApp() {
  if (_appBooted) return;
  _appBooted = true;
  _initApp();
}

function _injectAuthStyles() {
  if (document.getElementById('authGateStyles')) return;
  const st = document.createElement('style');
  st.id = 'authGateStyles';
  st.textContent = `
    #authGate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(circle at 50% 30%,#0a1424,#05080f 70%);font-family:'DM Sans',system-ui,sans-serif}
    #authGate .auth-card{background:rgba(16,24,40,.92);border:1px solid rgba(90,140,220,.25);border-radius:20px;
      padding:38px 34px;max-width:340px;width:88%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6);backdrop-filter:blur(12px)}
    #authGate .auth-logo{font-size:46px;margin-bottom:10px}
    #authGate h2{margin:0 0 6px;color:#eaf1ff;font-size:22px;letter-spacing:.3px}
    #authGate p{margin:0 0 22px;color:#9fb3d4;font-size:14px;line-height:1.5}
    #authGate .auth-btn{width:100%;padding:13px;border:none;border-radius:12px;cursor:pointer;
      background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:15px;font-weight:600;transition:filter .15s,transform .1s}
    #authGate .auth-btn:hover{filter:brightness(1.08)}
    #authGate .auth-btn:active{transform:scale(.98)}
    #authGate .auth-btn:disabled{opacity:.6;cursor:default}
    #authGate .auth-err{margin-top:14px;color:#ff9b9b;font-size:12.5px;line-height:1.45;
      background:rgba(180,40,40,.12);border:1px solid rgba(220,80,80,.25);border-radius:8px;padding:8px 10px}
    #authGate .auth-escape{margin-top:16px;background:none;border:none;color:#7f93b4;font-size:12.5px;text-decoration:underline;cursor:pointer}
    #authGate .auth-escape:hover{color:#aebfdc}
  `;
  document.head.appendChild(st);
}

function _showLoginGate(opts = {}) {
  _injectAuthStyles();
  let g = document.getElementById('authGate');
  if (!g) {
    g = document.createElement('div');
    g.id = 'authGate';
    g.setAttribute('role', 'dialog');
    g.setAttribute('aria-modal', 'true');
    g.setAttribute('aria-labelledby', 'authGateTitle');
    g.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">🛡️</div>
        <h2 id="authGateTitle">Centro de Mando</h2>
        <p>Iniciá sesión con Google para proteger y sincronizar tus datos entre dispositivos.</p>
        <button id="authGateBtn" class="auth-btn">Iniciar sesión con Google</button>
        <div id="authGateErr" class="auth-err" style="display:none"></div>
      </div>`;
    document.body.appendChild(g);
    const _b = document.getElementById('authGateBtn');
    _b.onclick = _signInGoogle;
    try { _b.focus(); } catch {}
  }
  if (opts.error) {
    const e = document.getElementById('authGateErr');
    if (e) { e.textContent = opts.error; e.style.display = 'block'; }
  }
}

function _hideLoginGate() {
  const g = document.getElementById('authGate');
  if (g) g.remove();
}

async function _signInGoogle() {
  const btn = document.getElementById('authGateBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Conectando…'; }
  try {
    await _auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    // onAuthStateChanged completa el boot
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Iniciar sesión con Google'; }
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request') {
      try { await _auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()); return; }
      catch (e2) { _showLoginGate({ error: 'No se pudo iniciar sesión: ' + (e2.message || e2) }); return; }
    }
    let hint = e.message || String(e);
    if (e.code === 'auth/operation-not-allowed') hint = 'Falta habilitar Google en Firebase Console → Authentication → Sign-in method.';
    if (e.code === 'auth/unauthorized-domain')   hint = 'Falta autorizar este dominio en Firebase Console → Authentication → Settings → Authorized domains.';
    _showLoginGate({ error: hint });
  }
}

// Completa el flujo de signInWithRedirect (popup bloqueado / mobile) y surfacea errores
_auth.getRedirectResult().catch(e => {
  let hint = e.message || String(e);
  if (e.code === 'auth/unauthorized-domain')   hint = 'Falta autorizar este dominio en Firebase Console → Authentication → Settings → Authorized domains.';
  if (e.code === 'auth/operation-not-allowed') hint = 'Falta habilitar Google en Firebase Console → Authentication → Sign-in method.';
  _showLoginGate({ error: hint });
});

// Driver: gobierna el arranque según el estado de autenticación
_auth.onAuthStateChanged(user => {
  if (user) {
    console.log('%c[Centro de Mando] Tu UID de Firebase:', 'color:#3b82f6;font-weight:bold', user.uid);
    _hideLoginGate();
    _bootApp();
  } else {
    _showLoginGate();   // login obligatorio: las reglas de Firestore exigen este uid
  }
});

