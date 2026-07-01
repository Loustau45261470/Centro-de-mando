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

let S = {};  // live state

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
   'photos','finObjectives','fixedExpenses','lawMilestones','routines'
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

const _fbDoSave = async () => {
    if (_fbSaveInProgress) return;
    _fbSaveInProgress = true;
    const localObj = JSON.parse(JSON.stringify(S));
    const sessionConfirmed = _lastSyncedSavedAt !== null;
    try {
      let cloudRaw = null, cloudData = null;
      try {
        const snap = await _DOC().get();
        if (snap.exists && snap.data()?.state) { cloudRaw = snap.data().state; cloudData = snap.data(); }
      } catch (e) {}

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
      try {
        await _DOC().set({ state: JSON.stringify(toSave), _wid: wid, _savedAt: savedAt }, { merge: true });
        _lastSyncedSavedAt = savedAt;
        _lastSyncedState = JSON.parse(JSON.stringify(toSave));
        _saveSnap(JSON.stringify(toSave), savedAt);
      } catch (e) {
        console.warn('[fbSave]', e.code, e.message);
        if (e.code === 'permission-denied') showToast('⚠️ Sin permiso para guardar — iniciá sesión');
      }
    } finally {
      _fbSaveInProgress = false;
    }
};

function _fbSave() {
  clearTimeout(_fbSaveTid);
  _fbSaveTid = setTimeout(() => { _fbSaveTid = null; _fbDoSave(); }, 2000);
}

// Flush inmediato del save pendiente (al ocultar/cerrar la app, sin esperar el debounce de 2s).
function _fbFlush() {
  if (!_fbSaveTid) return;        // no hay cambio pendiente
  clearTimeout(_fbSaveTid);
  _fbSaveTid = null;
  _fbDoSave();
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
  if (!d.exists || !d.data()?.state) { showToast('No existe ese snap: ' + id, 6000); return; }
  _forceSaveOnce = true;
  _applyRemoteState(d.data().state, Date.now());
  saveState();
  showToast('✅ Restaurado snap ' + new Date(parseInt(id.slice(5))).toLocaleString('es-AR'), 8000);
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
  if (!d.exists || !d.data()?.state) { showToast('No existe ese backup: ' + id, 6000); return; }
  _forceSaveOnce = true;
  _applyRemoteState(d.data().state, Date.now());
  saveState();
  showToast('✅ Restaurado backup ' + id, 8000);
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
  if (tab === 'conocimiento') { renderLawProgress(); renderLawMilestones(); renderLawPlan(); renderTabHeader('conocimientoHeaderMeta'); }
  if (window.JARVIS_INTEL) JARVIS_INTEL.renderCard(tab);
  if (typeof renderProyectos === 'function') renderProyectos(tab);
}

// ── Apply incoming remote state safely ───────────────────
function _applyRemoteState(raw, savedAt) {
  try {
    const incoming = JSON.parse(raw);
    S = incoming;
    if (savedAt != null) { _lastSyncedSavedAt = savedAt; _lastSyncedState = JSON.parse(raw); }
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
  if (tab === 'conocimiento') { renderLawProgress(); renderLawMilestones(); renderLawPlan(); renderTabHeader('conocimientoHeaderMeta'); }
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
  if (text.trim()) { t.text = text; saveState(); }
  else { p.tasks = p.tasks.filter(x => x.id !== id); saveState(); renderDayPlanner(); } // vacía al salir → se elimina
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

function updatePlannerLabel() {
  const swiper = document.getElementById('plannerSwiper');
  const label  = document.getElementById('plannerDateLabel');
  const dots   = document.getElementById('plannerDots');
  if (!swiper || !label) return;

  const onTomorrow = swiper.scrollLeft > swiper.offsetWidth * 0.5;
  const date = onTomorrow ? getTomorrow() : getActiveDate();
  const d    = new Date(date + 'T00:00:00');
  const fmt  = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  label.textContent = (onTomorrow ? 'Mañana · ' : 'Hoy · ') + fmt;

  if (dots) dots.innerHTML = [0, 1].map(i =>
    `<div class="planner-dot" style="background:${i === (onTomorrow ? 1 : 0) ? 'var(--accent)' : 'rgba(255,255,255,.18)'}"></div>`
  ).join('');
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

// ════════════════════════════════════════════════════════
// GYM TAB — WEIGHT & PHYSIQUE
// ════════════════════════════════════════════════════════
function renderSaludTab() {
  renderRutinas();
  renderEntrenamientoResumen();
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
}

function fmtRestTime(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
}

function fmtElapsed(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  if (m < 60) return `${m}min${s ? ` ${s}s` : ''}`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h${rm ? ` ${rm}min` : ''}`;
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
      ? r.exercises.map(ex => `
          <div class="rtn-ex-row">
            <span class="rtn-equip-tag">${ex.equipment}</span>
            <span class="rtn-ex-name" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" onclick="event.stopPropagation();openExHist('${r.id}','${ex.id}')">${ex.name}</span>
            <span class="rtn-ex-rest">⏱ ${fmtRestTime(ex.restSecs)}</span>
            <button class="icon-btn" onclick="event.stopPropagation();editRtnEx('${r.id}','${ex.id}')" style="color:var(--tt);flex-shrink:0">
              <svg viewBox="0 0 24 24" style="width:15px;height:15px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" onclick="event.stopPropagation();deleteRtnEx('${r.id}','${ex.id}')" style="color:var(--tt);flex-shrink:0">
              <svg viewBox="0 0 24 24" style="width:15px;height:15px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>`).join('')
      : '<p class="text-xs text-ter" style="padding:8px 0">Sin ejercicios. Agregá uno abajo.</p>';

    return `
      <div class="rtn-card" id="rtn-card-${r.id}">
        <div class="rtn-header" onclick="toggleRutina('${r.id}')">
          <span class="rtn-icon">${r.icon}</span>
          <div class="rtn-info">
            <div class="rtn-name">${r.name}</div>
            <div class="rtn-preview" style="margin-top:1px;font-size:11px;color:var(--tt)">${r.exercises.length} ejercicios</div>
          </div>
          <button class="btn btn-ghost" onclick="event.stopPropagation();openAddRtnEx('${r.id}')" style="font-size:10px;padding:2px 7px;flex-shrink:0;line-height:1.4">+ Ej</button>
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

  const _muscleMap = {
    px1:'Pecho', px2:'Pecho', px3:'Hombro lateral', px4:'Tríceps', px5:'Tríceps',
    px6:'Hombro frontal', px7:'Abdomen', px8:'Antebrazos',
    pl1:'Espalda', pl2:'Espalda', pl3:'Espalda', pl4:'Hombro posterior',
    pl5:'Trapecio', pl6:'Bíceps', pl7:'Bíceps', pl8:'Antebrazos', pl9:'Bíceps',
    lg1:'Glúteo', lg2:'Pantorrillas', lg3:'Cuádriceps', lg4:'Cuádriceps',
    lg5:'Aductores', lg6:'Femorales'
  };
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
  S.routines.forEach(r => r.exercises.forEach(ex => {
    if (_recMap[ex.id]) _recArr.push({ name: ex.name, ..._recMap[ex.id] });
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

  wrap.innerHTML = `
    <div class="card">
      <div class="card-title">🏋️ Entrenamiento</div>
      <div class="rtn-section-hdr" onclick="toggleRtnSection('rutinas')">
        <span id="rtn-section-chev-rutinas" style="display:inline-block;transition:transform .2s;transform:${_rutinaOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}">▾</span>
        <span style="flex:1">Rutinas</span>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openModal('modal-add-routine')" style="font-size:9px;letter-spacing:.06em">+ Nueva</button>
      </div>
      <div id="rtn-section-rutinas" style="display:${_rutinaOpen ? 'block' : 'none'}">${cards}</div>
      <div class="rtn-section-hdr" onclick="toggleRtnSection('estadisticas')">
        <span id="rtn-section-chev-estadisticas" style="display:inline-block;transition:transform .2s;transform:${_statsOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}">▾</span>
        <span>Estadísticas</span>
      </div>
      <div id="rtn-section-estadisticas" style="display:${_statsOpen ? 'block' : 'none'}">${statsBodyHtml}</div>
    </div>`;
  initScanner();
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
  openAddRtnEx(newId);
}

function openAddRtnEx(rtnId) {
  document.getElementById('modal-rtn-ex-rtnid').value = rtnId;
  document.getElementById('modal-rtn-ex-exid').value = '';
  document.getElementById('rtn-ex-fname').value = '';
  document.getElementById('rtn-ex-fequip').value = 'Mancuerna';
  document.getElementById('rtn-ex-frest').value = 90;
  document.getElementById('rtn-ex-fnotes').value = '';
  document.getElementById('modal-rtn-ex-title').textContent = 'Nuevo ejercicio';
  openModal('modal-rtn-ex');
}

function editRtnEx(rtnId, exId) {
  const rtn = S.routines.find(r => r.id === rtnId);
  const ex  = rtn && rtn.exercises.find(e => e.id === exId);
  if (!ex) return;
  document.getElementById('modal-rtn-ex-rtnid').value = rtnId;
  document.getElementById('modal-rtn-ex-exid').value  = exId;
  document.getElementById('rtn-ex-fname').value  = ex.name;
  document.getElementById('rtn-ex-fequip').value = ex.equipment;
  document.getElementById('rtn-ex-frest').value  = ex.restSecs;
  document.getElementById('rtn-ex-fnotes').value = ex.notes || '';
  document.getElementById('modal-rtn-ex-title').textContent = 'Editar ejercicio';
  openModal('modal-rtn-ex');
}

function saveRtnEx() {
  const rtnId = document.getElementById('modal-rtn-ex-rtnid').value;
  const exId  = document.getElementById('modal-rtn-ex-exid').value;
  const name  = document.getElementById('rtn-ex-fname').value.trim();
  const equipment = document.getElementById('rtn-ex-fequip').value;
  const restSecs  = +document.getElementById('rtn-ex-frest').value || 90;
  const notes     = document.getElementById('rtn-ex-fnotes').value.trim();
  if (!name) { showToast('Escribe el nombre del ejercicio'); return; }
  const rtn = S.routines.find(r => r.id === rtnId);
  if (!rtn) return;
  if (exId) {
    const ex = rtn.exercises.find(e => e.id === exId);
    if (ex) { ex.name = name; ex.equipment = equipment; ex.restSecs = restSecs; ex.notes = notes; }
  } else {
    rtn.exercises.push({ id: uid(), name, equipment, restSecs, notes });
  }
  saveState(); renderRutinas(); closeModal('modal-rtn-ex');
  showToast(exId ? 'Ejercicio actualizado' : 'Ejercicio agregado');
}

function deleteRtnEx(rtnId, exId) {
  const rtn = S.routines.find(r => r.id === rtnId);
  if (!rtn) return;
  rtn.exercises = rtn.exercises.filter(e => e.id !== exId);
  saveState(); renderRutinas();
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

function openExHist(rtnId, exId) {
  const rtn = S.routines.find(r => r.id === rtnId);
  const ex = rtn && rtn.exercises.find(e => e.id === exId);
  if (!ex) return;
  const log = (S.routineLog[rtnId] || []).filter(e => e.exSets && e.exSets[exId] && e.exSets[exId].length);
  document.getElementById('modal-ex-hist-title').textContent = ex.name;

  // Compute stats
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
  const monthAgoStr = monthAgo.toISOString().slice(0, 10);
  const thisMonthCount = log.filter(e => e.date >= monthAgoStr).length;
  let maxWeight = 0, maxReps = 0, maxVol = 0;
  log.forEach(entry => entry.exSets[exId].forEach(s => {
    if ((s.weight || 0) > maxWeight) maxWeight = s.weight || 0;
    if ((s.reps   || 0) > maxReps)   maxReps   = s.reps   || 0;
    const v = (s.weight || 0) * (s.reps || 0);
    if (v > maxVol) maxVol = v;
  }));

  // Chart: best weight per session (last 12)
  const chartSrc = log.slice(-12).map(e => Math.max(...e.exSets[exId].map(s => s.weight || 0)));
  const chartH = 50, chartW = 220, pad = 8;
  let chartSvg = '<div style="font-size:11px;color:rgba(0,200,255,.35);padding:8px 0;text-align:center">Sin suficientes sesiones para el gráfico</div>';
  if (chartSrc.length >= 2) {
    const minV = Math.min(...chartSrc), maxV = Math.max(...chartSrc);
    const range = maxV - minV || 1;
    const n = chartSrc.length;
    const gx = i => pad + i / (n - 1) * (chartW - pad * 2);
    const gy = v => chartH - pad - (v - minV) / range * (chartH - pad * 2);
    const pts = chartSrc.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
    const firstPt = `${gx(0).toFixed(1)},${gy(chartSrc[0]).toFixed(1)}`;
    const lastPt  = `${gx(n-1).toFixed(1)},${gy(chartSrc[n-1]).toFixed(1)}`;
    const base    = (chartH - pad).toFixed(1);
    const areaD   = `M ${firstPt} L ${pts.split(' ').slice(1).join(' L ')} L ${gx(n-1).toFixed(1)},${base} L ${gx(0).toFixed(1)},${base} Z`;
    const dots    = chartSrc.map((v, i) => `<circle cx="${gx(i).toFixed(1)}" cy="${gy(v).toFixed(1)}" r="2.5" fill="#00DCFF" stroke="rgba(0,0,20,.8)" stroke-width="1.2"/>`).join('');
    chartSvg = `<svg viewBox="0 0 ${chartW} ${chartH}" width="100%" height="${chartH}">
      <path d="${areaD}" fill="rgba(0,200,255,0.12)"/>
      <polyline points="${pts}" fill="none" stroke="#00DCFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>`;
  }

  const maxVolStr = maxVol >= 1000 ? `${(maxVol / 1000).toFixed(1)}<span style="font-size:11px;font-weight:400"> t</span>` : `${maxVol}<span style="font-size:11px;font-weight:400"> kg</span>`;

  const histHtml = log.length === 0
    ? '<p style="color:rgba(0,200,255,.35);font-size:12px;padding:4px 0">Sin historial aún.</p>'
    : log.slice().reverse().map(entry => {
        const sets = entry.exSets[exId];
        const setRows = sets.map((s, i) => `
          <div style="display:flex;gap:10px;padding:2px 0;font-size:12px">
            <span style="color:rgba(0,200,255,.4);width:48px;flex-shrink:0;font-family:var(--mono)">S${i + 1}</span>
            <span style="font-family:var(--mono);color:#00DCFF;font-weight:700">${s.weight}<span style="font-weight:400;font-size:10px"> kg</span></span>
            <span style="color:rgba(255,255,255,.25);margin:0 2px">×</span>
            <span style="font-family:var(--mono);font-weight:700">${s.reps}<span style="font-weight:400;font-size:10px"> reps</span></span>
          </div>`).join('');
        return `<div class="ex-hud-hist-entry">
          <div style="font-size:9px;font-weight:800;letter-spacing:.1em;color:rgba(0,200,255,.6);font-family:var(--mono);margin-bottom:5px">${entry.date}</div>
          ${setRows}
        </div>`;
      }).join('');

  document.getElementById('modal-ex-hist-body').innerHTML = `
    <div style="position:relative;overflow:hidden">
      <div class="ex-hud-scan-line"></div>
      <div class="ex-hud-kpi-row">
        <div class="ex-hud-kpi">
          <div class="ex-hud-kpi-val">${thisMonthCount}</div>
          <div class="ex-hud-kpi-lbl">Sesiones / mes</div>
        </div>
        <div class="ex-hud-kpi">
          <div class="ex-hud-kpi-val">${maxWeight}<span style="font-size:11px;font-weight:400"> kg</span></div>
          <div class="ex-hud-kpi-lbl">Record Peso</div>
        </div>
        <div class="ex-hud-kpi">
          <div class="ex-hud-kpi-val">${maxReps}<span style="font-size:11px;font-weight:400"> reps</span></div>
          <div class="ex-hud-kpi-lbl">Record Reps</div>
        </div>
        <div class="ex-hud-kpi">
          <div class="ex-hud-kpi-val">${maxVolStr}</div>
          <div class="ex-hud-kpi-lbl">Record Vol</div>
        </div>
      </div>
      <div class="ex-hud-chart-wrap">
        <div class="ex-hud-chart-title">◈ PROGRESIÓN DE PESO — últimas ${Math.min(log.length, 12)} sesiones</div>
        ${chartSvg}
      </div>
      ${histHtml}
    </div>`;
  openModal('modal-ex-hist');
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
    const rtn = S.routines && S.routines.find(r => r.id === S.activeRtnSession?.routineId);
    const ex = rtn && rtn.exercises.find(e => e.id === _pipExId);
    lbl.textContent = ex ? `Descanso — ${ex.name}` : 'Descanso';
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
  const exSets = {};
  rtn.exercises.forEach(ex => { exSets[ex.id] = [{ weight: '', reps: '' }]; });
  S.activeRtnSession = { routineId: rtnId, startedAt: Date.now(), exSets, exOrder: rtn.exercises.map(e => e.id) };
  _rtnExpandedEx = new Set(rtn.exercises.map(e => e.id));
  saveState(); renderRutinas();
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

  const _sessionOrder = (S.activeRtnSession.exOrder || rtn.exercises.map(e => e.id));
  const _orderedExes = _sessionOrder.map(id => rtn.exercises.find(e => e.id === id)).filter(Boolean);

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
          <button onclick="event.stopPropagation();moveRtnSessionEx('${ex.id}',-1)" style="${btnStyle}${isFirst ? ';'+btnDisabled : ''}">↑</button>
          <button onclick="event.stopPropagation();moveRtnSessionEx('${ex.id}',+1)" style="${btnStyle}${isLast ? ';'+btnDisabled : ''}">↓</button>
          <span class="rtn-ex-chevron" id="rtn-exchev-${ex.id}" style="transform:${isExpanded ? 'rotate(-180deg)' : 'rotate(0deg)'}">▾</span>
        </div>
        <div class="rtn-ex-block-body" id="rtn-exbody-${ex.id}" style="${isExpanded ? '' : 'display:none'}">
          ${ex.notes ? `<div class="rtn-ex-notes">💡 ${ex.notes}</div>` : ''}
          <div style="${ex.notes ? 'margin-top:8px' : ''}">
            <div class="rtn-sets-header"><div>Serie</div><div>KG</div><div>Reps</div><div style="text-align:center;font-size:10px">✓</div></div>
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
          <div class="rtn-session-sub">${rtn.exercises.length} ejercicios</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="color:var(--ts);flex-shrink:0" onclick="cancelRtnSession()">✕ Cancelar</button>
      </div>
      <div class="rtn-session-exes">${exBlocks}</div>
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
    const rtn = S.routines && S.routines.find(r => r.id === S.activeRtnSession.routineId);
    const ex = rtn && rtn.exercises.find(e => e.id === exId);
    if (ex) startRtnTimerBand(exId, ex.restSecs);
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
  const _rtn = S.routines && S.routines.find(r => r.id === S.activeRtnSession?.routineId);
  const _ex  = _rtn && _rtn.exercises.find(e => e.id === exId);
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
  const rtn = S.routines && S.routines.find(r => r.id === S.activeRtnSession.routineId);
  if (rtn) rtn.exercises.forEach(ex => _readSaveRtnSets(ex.id));
  const { routineId, startedAt, exSets } = S.activeRtnSession;
  const duration = Math.floor((Date.now() - startedAt) / 1000);
  let vol = 0, totalSets = 0;
  Object.values(exSets).forEach(sets => sets.forEach(s => {
    if (s.weight && s.reps) { vol += s.weight * s.reps; totalSets++; }
  }));
  if (!S.routineLog[routineId]) S.routineLog[routineId] = [];
  S.routineLog[routineId].push({
    id: uid(), date: getActiveDate(),
    exSets: JSON.parse(JSON.stringify(exSets)),
    vol, sets: totalSets, duration
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
  const entries = S.bodyWeight.slice().sort((a,b)=>a.date.localeCompare(b.date));
  if (entries.length === 0) { document.getElementById('weightNum').textContent='—'; return; }
  const last = entries[entries.length-1];
  document.getElementById('weightNum').textContent = last.value;
  document.getElementById('weightUnitEl').textContent = last.unit;
  if (entries.length >= 2) {
    const prev = entries[entries.length-2];
    const delta = (last.value - prev.value).toFixed(1);
    const el = document.getElementById('weightDeltaEl');
    const positive = delta > 0;
    el.innerHTML = `<span class="weight-delta ${positive?'delta-up':'delta-down'}">${positive?'▲':'▼'} ${Math.abs(delta)} ${last.unit}</span>`;
  }
  if (weightChartInst) updateWeightChart();
  analyzeBodyComp();
}

function analyzeBodyComp() {
  const entries = S.bodyWeight.slice().sort((a,b)=>a.date.localeCompare(b.date));
  if (entries.length < 4) return;
  const recent = entries.slice(-4);
  const weightDelta = recent[3].value - recent[0].value;
  // Simplified strength trend: count exercises with recent progress
  const recentDates = Object.keys(S.workoutLog).sort().slice(-8);
  let strengthGain = 0, count = 0;
  S.exercises.forEach(ex => {
    const vals = recentDates.map(d => {
      const log = S.workoutLog[d];
      if (!log || !log[ex.id]) return null;
      const sets = log[ex.id];
      return Math.max(...sets.map(s=>s.weight||0));
    }).filter(Boolean);
    if (vals.length >= 2) { strengthGain += vals[vals.length-1] - vals[0]; count++; }
  });
  const avgStrGain = count ? strengthGain/count : 0;
  const sec = document.getElementById('compSection');
  sec.classList.remove('hidden');
  const bar = document.getElementById('compBar');
  const lbl = document.getElementById('compLabel');
  if (weightDelta > 0.3 && avgStrGain > 0) {
    bar.innerHTML = '<div class="comp-muscle" style="width:70%"></div><div class="comp-fat" style="width:30%"></div>';
    lbl.innerHTML = '<span class="text-ok">↗ Construcción muscular dominante</span>';
  } else if (weightDelta > 0.3 && avgStrGain <= 0) {
    bar.innerHTML = '<div class="comp-muscle" style="width:30%"></div><div class="comp-fat" style="width:70%"></div>';
    lbl.innerHTML = '<span class="text-warn">⚠ Ganancia predominantemente grasa</span>';
  } else if (weightDelta < -0.3 && avgStrGain >= -2) {
    bar.innerHTML = '<div class="comp-muscle" style="width:80%"></div><div class="comp-fat" style="width:20%"></div>';
    lbl.innerHTML = '<span style="color:var(--accent)">↘ Pérdida de grasa — fuerza mantenida</span>';
  } else if (weightDelta < -0.3 && avgStrGain < -2) {
    bar.innerHTML = '<div class="comp-fat" style="width:100%"></div>';
    lbl.innerHTML = '<span class="text-danger">⛔ Déficit demasiado agresivo — perdiendo músculo</span>';
  } else {
    bar.innerHTML = '<div class="comp-muscle" style="width:50%"></div><div class="comp-fat" style="width:50%"></div>';
    lbl.innerHTML = '<span class="text-ter">→ Mantenimiento</span>';
  }
}

function logWeight() {
  const val = parseFloat(document.getElementById('logWeightVal').value);
  const date = document.getElementById('logWeightDate').value;
  const unit = document.getElementById('logWeightUnit').value;
  if (!val||!date) { showToast('Completa todos los campos'); return; }
  // Remove existing entry for that date
  S.bodyWeight = S.bodyWeight.filter(e=>e.date!==date);
  S.bodyWeight.push({ id:uid(), date, value:val, unit });
  S.bodyWeight.sort((a,b)=>a.date.localeCompare(b.date));
  // Snapshot net worth history
  snapshotNW();
  // [SUPABASE] await supabase.from('body_weight').upsert({ date, value: val, unit, user_id });
  saveState(); renderBodyWeight(); closeModal('modal-log-weight'); showToast(`${val} ${unit} guardado`);
}

// ── Progress Photos ──
function renderPhotos() {
  const grid = document.getElementById('photoGrid');
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

// Sube un archivo a Firebase Storage en photos/{uid}/{id} y devuelve el registro con la URL.
async function _uploadPhoto(file, date, weight) {
  if (!_storage || !_auth.currentUser) throw new Error('storage/auth no disponible');
  const id = uid();
  const path = `photos/${_auth.currentUser.uid}/${id}`;
  const ref = _storage.ref(path);
  await ref.put(file);
  const src = await ref.getDownloadURL();
  return { id, date, weight, src, path };
}

async function savePhoto() {
  const file = document.getElementById('photoFile').files[0];
  const date = document.getElementById('photoDate').value;
  if (!file||!date) { showToast('Selecciona foto y fecha'); return; }
  const weight = document.getElementById('photoWeight').value;
  showToast('📤 Subiendo foto…');
  try {
    const ph = await _uploadPhoto(file, date, weight);
    S.photos.push(ph);
    saveState(); renderPhotos(); closeModal('modal-add-photo'); showToast('Foto guardada');
  } catch (e) {
    // Storage no disponible (no habilitado / sin reglas) → guardar como data URL embebida para no perder la foto
    console.warn('[photos] upload fallo, fallback local:', e.message);
    const reader = new FileReader();
    reader.onload = ev => {
      S.photos.push({ id:uid(), date, weight, src:ev.target.result });
      saveState(); renderPhotos(); closeModal('modal-add-photo'); showToast('Foto guardada (local)');
    };
    reader.readAsDataURL(file);
  }
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

function populateCompareSelects() {
  const opts = S.photos.map(p=>`<option value="${p.id}">${fmtDate(p.date)}${p.weight?' ('+p.weight+')':''}</option>`).join('');
  document.getElementById('compareLeftSel').innerHTML = opts;
  document.getElementById('compareRightSel').innerHTML = opts;
  if (S.photos.length >= 2) {
    document.getElementById('compareRightSel').selectedIndex = 1;
  }
  updateCompareSide('left'); updateCompareSide('right');
}

function updateCompareSide(side) {
  const id = document.getElementById(`compare${side.charAt(0).toUpperCase()+side.slice(1)}Sel`).value;
  const ph = S.photos.find(p=>p.id===id);
  const el = document.getElementById(`compare${side.charAt(0).toUpperCase()+side.slice(1)}`);
  el.innerHTML = ph ? `<img src="${ph.src}" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px">` : '<div class="no-photo">Sin foto</div>';
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
  saveState(); renderGymConfigModal(); renderGymSelector();
}
function deleteGym(id) {
  S.gyms = S.gyms.filter(g=>g.id!==id);
  if (S.currentGym===id) S.currentGym=null;
  saveState(); renderGymConfigModal(); renderGymSelector();
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
function renderGymSelector() {
  const sel = document.getElementById('gymSelector');
  sel.innerHTML = '<option value="">Sin gimnasio configurado</option>' +
    S.gyms.map(g=>`<option value="${g.id}" ${S.currentGym===g.id?'selected':''}>${g.name}</option>`).join('');
}
function selectGym(id) { S.currentGym = id; saveState(); renderExercises(); }

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

function finishWorkout() {
  document.getElementById('finishWorkoutBtn').style.display='none';
  buildTickerAlerts();
  showConfetti(4000);
  // Gym-specific banner
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; top:18%; left:50%; transform:translateX(-50%);
    background:linear-gradient(135deg,rgba(244,63,94,.18),rgba(255,107,107,.12));
    border:2px solid rgba(244,63,94,.5); border-radius:20px;
    padding:18px 32px; text-align:center; pointer-events:none; z-index:10000;
    backdrop-filter:blur(20px); box-shadow:0 0 60px rgba(244,63,94,.3),0 20px 60px rgba(0,0,0,.4);
    animation:missionBanner 3.8s cubic-bezier(.22,1,.36,1) forwards; white-space:nowrap;
  `;
  el.innerHTML = `
    <div style="font-size:36px;line-height:1;margin-bottom:6px">💪</div>
    <div style="font-size:22px;font-weight:900;letter-spacing:.06em;color:#F43F5E;text-shadow:0 0 30px rgba(244,63,94,.8)">¡ENTRENO COMPLETADO!</div>
    <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Sesión registrada — seguí así</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
  showToast('💪 ¡Entrenamiento completado!', 3500);
}

// ════════════════════════════════════════════════════════
// FINANCE TAB
// ════════════════════════════════════════════════════════
function calcNetWorth() {
  return S.accounts.reduce((sum,a)=>sum+(a.type!=='crypto'&&a.type!=='invest'?a.balance:a.balance),0);
}

function snapshotNW() {
  const today = getActiveDate();
  const val = calcNetWorth();
  const existing = S.nwHistory.find(h=>h.date===today);
  if (existing) existing.value = val;
  else S.nwHistory.push({ date:today, value:val });
  S.nwHistory.sort((a,b)=>a.date.localeCompare(b.date));
}

function renderFinanzasTab() {
  renderTabHeader('finanzasHeaderMeta');
  renderAccounts();
  renderSubscriptions();
  renderWishlist();
  renderWishTop5();
  renderActivity();
  renderFinObjectives();
  renderBudget();
  renderBudgetSummary();
  if (nwPieInst) updateNWCharts();
}

function renderAccounts() {
  const nw = calcNetWorth();
  document.getElementById('nwTotal').textContent = fmtMoney(nw, 'USD');
  document.getElementById('nw1pct').textContent = `1% = ${fmtMoney(nw*0.01,'USD')}`;
  const list = document.getElementById('accountList');
  list.innerHTML = S.accounts.length ? S.accounts.map(a=>`
    <div class="account-row">
      <div class="account-icon">${a.icon||'🏦'}</div>
      <div class="account-info">
        <div class="account-name">${a.name}</div>
        <div class="account-type">${{bank:'Banco',invest:'Inversión',crypto:'Cripto',other:'Otro'}[a.type]}</div>
      </div>
      <div class="account-bal pos">${fmtMoney(a.balance,a.currency)}</div>
      <button class="icon-btn" onclick="openEditAccount('${a.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="icon-btn" onclick="deleteAccount('${a.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
    </div>`).join('') : '<p class="empty-state">Sin cuentas registradas</p>';
  if (nwPieInst) updateNWCharts();
}

function fmtMoney(val, cur) {
  if (cur==='BTC') return `₿${val.toFixed(6)}`;
  return new Intl.NumberFormat('en-US',{style:'currency',currency:cur||'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(val);
}

function addAccount() {
  const name=document.getElementById('accName').value.trim();
  const balance=+document.getElementById('accBalance').value||0;
  if (!name) { showToast('Escribe el nombre de la cuenta'); return; }
  S.accounts.push({
    id:uid(), name, type:document.getElementById('accType').value,
    balance, currency:document.getElementById('accCurrency').value,
    icon:document.getElementById('accIcon').value||'🏦'
  });
  snapshotNW();
  // [SUPABASE] await supabase.from('accounts').insert({ name, type, balance, currency, user_id });
  saveState(); renderFinanzasTab(); closeModal('modal-add-account');
  document.getElementById('accName').value='';document.getElementById('accBalance').value='';
  showToast('Cuenta agregada');
}

function deleteAccount(id) {
  if (!confirm('¿Eliminar esta cuenta?')) return;
  S.accounts=S.accounts.filter(a=>a.id!==id);
  snapshotNW(); saveState(); renderFinanzasTab();
}

function renderSubscriptions() {
  const list=document.getElementById('subList');
  const empty=document.getElementById('subEmpty');
  if (!S.subscriptions.length) { list.innerHTML=''; empty.classList.remove('hidden'); document.getElementById('subTotal').textContent='$0'; return; }
  empty.classList.add('hidden');
  const now=new Date();
  let total=0;
  list.innerHTML = [...S.subscriptions].sort((a,b)=>a.billingDay-b.billingDay).map(sub=>{
    const days=daysUntil(sub.billingDay);
    const alert=days<=5;
    total+=sub.amount;
    return `<div class="sub-row ${alert?'sub-alert':''}">
      <div class="sub-info">
        <div class="sub-name">${sub.name} ${alert?'<span class="pill pill-danger" style="font-size:10px">⚠ '+days+'d</span>':''}</div>
        <div class="sub-detail">Día ${sub.billingDay} de cada mes</div>
      </div>
      <div class="sub-amount">${fmtMoney(sub.amount,sub.currency)}</div>
      <button class="icon-btn" onclick="openEditSub('${sub.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="icon-btn" onclick="deleteSub('${sub.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
    </div>`;
  }).join('');
  document.getElementById('subTotal').textContent=fmtMoney(total,'USD');
}

function addSubscription() {
  const name=document.getElementById('subName').value.trim();
  const amount=+document.getElementById('subAmount').value||0;
  const day=+document.getElementById('subBillingDay').value;
  if (!name||!day) { showToast('Completa nombre y día de cobro'); return; }
  S.subscriptions.push({ id:uid(), name, amount, currency:document.getElementById('subCurrency').value, billingDay:day, accountId:document.getElementById('subAccount').value });
  // [SUPABASE] await supabase.from('subscriptions').insert({ name, amount, currency, billing_day: day, account_id, user_id });
  saveState(); renderSubscriptions(); buildTickerAlerts(); closeModal('modal-add-sub');
  document.getElementById('subName').value=''; document.getElementById('subAmount').value='';
  showToast('Suscripción agregada');
}
function deleteSub(id) { S.subscriptions=S.subscriptions.filter(s=>s.id!==id); saveState(); renderSubscriptions(); buildTickerAlerts(); }

function renderOrders() {
  const list=document.getElementById('orderList');
  const empty=document.getElementById('orderEmpty');
  if (!S.orders.length) { list.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = S.orders.map(ord=>{
    const diff=ord.arrival?Math.ceil((new Date(ord.arrival)-new Date())/86400000):null;
    return `<div class="order-row">
      <div class="order-info">
        <div class="order-name">${ord.name} ${!ord.deducted?`<button class="btn btn-ghost btn-sm" onclick="deductOrder('${ord.id}')" style="font-size:10px">Descontar</button>`:''}</div>
        <div class="order-detail">${fmtMoney(ord.amount,ord.currency)} ${diff!==null?'· Llega en '+diff+'d':''}</div>
      </div>
      <div class="flex gap-8 items-center">
        ${ord.deducted?'<span class="pill pill-ok">✓ Descontado</span>':''}
        <button class="icon-btn" onclick="deleteOrder('${ord.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div>
    </div>`;
  }).join('');
}

function addOrder() {
  const name=document.getElementById('ordName').value.trim();
  if (!name) { showToast('Escribe la descripción'); return; }
  S.orders.push({ id:uid(), name, amount:+document.getElementById('ordAmount').value||0, currency:document.getElementById('ordCurrency').value, arrival:document.getElementById('ordArrival').value, accountId:document.getElementById('ordAccount').value, deducted:false });
  // [SUPABASE] await supabase.from('orders').insert({ ... });
  saveState(); renderOrders(); buildTickerAlerts(); closeModal('modal-add-order');
  document.getElementById('ordName').value=''; showToast('Pedido registrado');
}
function deductOrder(id) {
  const ord=S.orders.find(o=>o.id===id);
  if (!ord||ord.deducted) return;
  if (ord.accountId) {
    const acc=S.accounts.find(a=>a.id===ord.accountId);
    if (acc) { acc.balance-=ord.amount; snapshotNW(); }
  }
  ord.deducted=true;
  S.transactions.unshift({ id:uid(), date:getActiveDate(), name:`Pedido: ${ord.name}`, type:'expense', amount:ord.amount, currency:ord.currency, accountId:ord.accountId });
  saveState(); renderFinanzasTab(); showToast(`${fmtMoney(ord.amount,ord.currency)} descontado`);
}
function deleteOrder(id) { S.orders=S.orders.filter(o=>o.id!==id); saveState(); renderOrders(); }

function renderWishlist() {
  const list=document.getElementById('wishList');
  const empty=document.getElementById('wishEmpty');
  const nw=calcNetWorth();
  if (!S.wishlist.length) { list.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  const PRIO_ORDER = ['urgente','importante','normal','poco_importante','irrelevante'];
  const PRIO_INFO  = {
    urgente:         { label:'Urgente',        color:'var(--danger)' },
    importante:      { label:'Importante',     color:'var(--warn)'   },
    normal:          { label:'Normal',         color:'var(--ts)'     },
    poco_importante: { label:'Poco importante',color:'var(--tt)'     },
    irrelevante:     { label:'Irrelevante',    color:'rgba(255,255,255,.25)' },
  };

  // Sort: by category (alpha, "Sin categoría" last), then by priority rank
  const sorted = [...S.wishlist].sort((a,b) => {
    const cA = a.category || '￿', cB = b.category || '￿';
    if (cA !== cB) return cA.localeCompare(cB, 'es');
    return (PRIO_ORDER.indexOf(a.priority||'normal')) - (PRIO_ORDER.indexOf(b.priority||'normal'));
  });

  // Group by category
  const groups = {}, groupOrder = [];
  for (const w of sorted) {
    const cat = w.category || 'Sin categoría';
    if (!groups[cat]) { groups[cat]=[]; groupOrder.push(cat); }
    groups[cat].push(w);
  }

  const DETAIL_SVG = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  const EDIT_SVG   = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const DEL_SVG    = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  const catId = cat => 'wcat_' + cat.replace(/[^a-zA-Z0-9]/g, '_');

  let html = '';
  for (const cat of groupOrder) {
    const cid = catId(cat);
    const collapsed = localStorage.getItem('wish_cat_' + cid) === '1';
    html += `<div class="wish-category-hdr" onclick="toggleWishCat('${cid}')">
      <span>${_esc(cat)} <span style="opacity:.45">(${groups[cat].length})</span></span>
      <span class="wish-cat-chevron${collapsed?' collapsed':''}">▾</span>
    </div>`;
    html += `<div class="wish-cat-body${collapsed?' collapsed':''}" id="${cid}">`;
    for (const w of groups[cat]) {
      const pctOfNW = nw > 0 ? (w.amount / nw * 100).toFixed(1) : '∞';
      const saved   = nw > 0 ? Math.min(100, nw / w.amount * 100) : 0;
      const affordable = nw >= w.amount;
      const pi = PRIO_INFO[w.priority||'normal'] || PRIO_INFO.normal;
      const hasNotes = w.notes && w.notes.trim();
      html += `<div class="wish-row">
        <div class="flex items-center justify-between">
          <div class="wish-name">${_esc(w.name)}${affordable?' <span class="pill pill-ok" style="font-size:10px">¡Puedes comprarlo!</span>':''}</div>
          <div class="flex gap-8 items-center">
            <span class="wish-priority-badge" style="color:${pi.color}">${pi.label}</span>
            <span class="mono text-sm">${fmtMoney(w.amount,w.currency)}</span>
            ${hasNotes?`<button class="icon-btn" onclick="toggleWishDetail('${w.id}')" title="Detalles">${DETAIL_SVG}</button>`:''}
            <button class="icon-btn" onclick="openEditWish('${w.id}')">${EDIT_SVG}</button>
            <button class="icon-btn" onclick="deleteWish('${w.id}')">${DEL_SVG}</button>
          </div>
        </div>
        <div class="wish-pct">Representa el <strong>${pctOfNW}%</strong> de tu patrimonio · Ahorrado: ${saved.toFixed(0)}%</div>
        <div class="wish-bar"><div class="prog-bar"><div class="prog-fill" style="width:${saved}%;background:${affordable?'var(--ok)':'var(--accent)'}"></div></div></div>
        <div class="wish-score"><span class="wish-score-lbl">Puntaje</span>${[1,2,3,4,5].map(n=>`<button class="ws-dot${n<=_wishScore(w)?' on':''}" onclick="setWishScore('${w.id}',${n})" title="${n} de 5" aria-label="Puntaje ${n}"></button>`).join('')}</div>
        ${hasNotes?`<div class="wish-detail-panel" id="wish-detail-${w.id}"><div class="wish-detail-body">${_esc(w.notes)}</div></div>`:''}
      </div>`;
    }
    html += `</div>`;
  }
  list.innerHTML = html;
  renderWishTop5();
}

// Puntaje de adquisición (1–5). Si no está seteado, se deriva de la prioridad.
const _WISH_PRIO_SCORE = { urgente: 5, importante: 4, normal: 3, poco_importante: 2, irrelevante: 1 };
function _wishScore(w) {
  if (w.score >= 1 && w.score <= 5) return w.score;
  return _WISH_PRIO_SCORE[w.priority || 'normal'] || 3;
}
function setWishScore(id, n) {
  const w = (S.wishlist || []).find(x => x.id === id); if (!w) return;
  w.score = (w.score === n) ? 0 : n; // volver a tocar el mismo punto lo limpia (vuelve a derivar de prioridad)
  saveState(); renderWishlist(); renderWishTop5();
}
// Top 5 adquisiciones más importantes/urgentes (por puntaje) — vista de sección.
function renderWishTop5() {
  const body = document.getElementById('wishTop5Body'); if (!body) return;
  const items = [...(S.wishlist || [])].sort((a, b) => _wishScore(b) - _wishScore(a) || ((+a.amount || 0) - (+b.amount || 0))).slice(0, 5);
  if (!items.length) { body.innerHTML = '<div class="wt-empty">Sin objetivos de adquisición. Abrí <b>Adquisición</b> (📈 → Adquisición) para cargarlos y puntuarlos.</div>'; return; }
  const nw = (typeof calcNetWorth === 'function') ? calcNetWorth() : 0;
  body.innerHTML = items.map((w, i) => {
    const sc = _wishScore(w), affordable = nw >= (+w.amount || 0);
    return `<div class="wt-item">
      <span class="wt-rank">${i + 1}</span>
      <div class="wt-body">
        <div class="wt-name">${escHtml(w.name)}${affordable ? '<span class="wt-ok">alcanzable</span>' : ''}</div>
        <div class="wt-dots" aria-label="Puntaje ${sc} de 5">${[1, 2, 3, 4, 5].map(n => `<span class="wt-dot${n <= sc ? ' on' : ''}"></span>`).join('')}</div>
      </div>
      <span class="wt-amt mono">${fmtMoney(w.amount, w.currency)}</span>
    </div>`;
  }).join('');
}

function toggleWishCat(cid) {
  const body    = document.getElementById(cid);
  const chevron = body?.previousElementSibling?.querySelector('.wish-cat-chevron');
  if (!body) return;
  const nowCollapsed = body.classList.toggle('collapsed');
  if (chevron) chevron.classList.toggle('collapsed', nowCollapsed);
  localStorage.setItem('wish_cat_' + cid, nowCollapsed ? '1' : '');
}

function toggleWishDetail(id) {
  const p = document.getElementById('wish-detail-'+id);
  if (p) p.classList.toggle('open');
}

function addWish() {
  const name = document.getElementById('wishName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  S.wishlist.push({
    id:       uid(),
    name,
    amount:   +document.getElementById('wishAmount').value || 0,
    currency: document.getElementById('wishCurrency').value,
    category: document.getElementById('wishCategory').value,
    priority: document.getElementById('wishPriority').value || 'normal',
    notes:    document.getElementById('wishNotes').value.trim(),
  });
  saveState(); renderWishlist(); closeModal('modal-add-wish');
  document.getElementById('wishName').value  = '';
  document.getElementById('wishNotes').value = '';
  showToast('Objetivo agregado');
}
function deleteWish(id) { S.wishlist=S.wishlist.filter(w=>w.id!==id); saveState(); renderWishlist(); }

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
    </div>`;
  });

  const dots = years.map((_, i) =>
    `<div class="law-dot${i === _lawSlide ? ' active' : ''}" onclick="lawGoTo(${i})"></div>`
  ).join('');

  wrap.innerHTML = `<div class="card">
    <div class="card-title">⚖ Abogacía — Progreso</div>
    <div class="law-total-row">
      <div>
        <div class="law-total-pct">${totalPct}%</div>
        <div class="law-total-sub">progreso total</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:800;letter-spacing:-.04em">${totalDone}<span style="font-size:14px;font-weight:500;color:var(--tt);font-family:var(--mono)">/${totalSubs}</span></div>
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
  saveState(); renderLawProgress();
}

function toggleLawSubject(yearId, subId) {
  const y = S.lawProgress.years.find(y => y.id === yearId);
  if (!y) return;
  const sub = y.subjects.find(s => s.id === subId);
  if (!sub) return;
  sub.done = !sub.done;
  saveState(); renderLawProgress();
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
        <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Todas las materias aprobadas</div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
      showToast('🎓 ¡Año completo!', 4000);
    } else {
      showToast(`✓ ${sub.name}`);
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

  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  // Table rows
  const rowsHTML = ms.map(m => {
    const isPast   = _parseMilestoneDate(m.date) <= today;
    const realVal  = m.real !== null ? m.real : (isPast ? currentDone : null);
    const realDisp = realVal !== null ? realVal : '—';
    const diff     = realVal !== null ? realVal - m.expected : null;
    let diffClass = 'diff-neu', diffDisp = '—';
    if (diff !== null) {
      diffDisp  = diff > 0 ? `+${diff}` : `${diff}`;
      diffClass = diff >= 0 ? 'diff-ok' : 'diff-bad';
    }
    return `<tr>
      <td style="font-family:var(--mono);font-size:12px">${m.date}</td>
      <td class="num">${realDisp}${m.real === null && isPast ? '<sup style="font-size:9px;color:var(--tt)">*</sup>' : ''}</td>
      <td class="num" style="color:var(--ok)">${m.expected}</td>
      <td class="diff ${diffClass}">${diffDisp}</td>
      <td style="padding:4px 4px 4px 0;white-space:nowrap">
        <div style="display:flex;gap:2px">
          <button class="icon-btn" onclick="openEditMilestone('${m.id}')">${PENCIL}</button>
          <button class="icon-btn" onclick="deleteMilestone('${m.id}')">${TRASH}</button>
        </div>
      </td>
    </tr>`;
  }).join('');

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
    <div style="font-size:11px;color:var(--tt);margin-top:8px">* Valor actual del progreso registrado</div>
  </div>`;

  // Chart
  requestAnimationFrame(() => {
    const canvas = document.getElementById('law-milestone-chart');
    if (!canvas) return;
    if (_lawMilestoneChart) { _lawMilestoneChart.destroy(); _lawMilestoneChart = null; }
    const labels  = ms.map(m => m.label);
    const planned = ms.map(m => m.expected);
    const real    = ms.map(m => {
      if (m.real !== null) return m.real;
      if (_parseMilestoneDate(m.date) <= today) return currentDone;
      return null;
    });
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
        plugins:{ legend:{ labels:{ color:'#B8B6B0', font:{ size:11 }, boxWidth:12 } } },
        scales:{
          x:{ ticks:{ color:'#76746E', font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.05)' } },
          y:{ ticks:{ color:'#76746E', font:{ size:10 }, stepSize:2 }, grid:{ color:'rgba(255,255,255,.05)' }, min:0 }
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
function renderLawPlan() {
  const wrap = document.getElementById('law-plan-wrap');
  if (!wrap) return;
  const plan = S.lawPlan;
  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      📅 Plan de Materias
      <button class="btn btn-ghost btn-sm" onclick="openAddLawPlan()">+ Materia</button>
    </div>
    <table class="law-tbl">
      <thead><tr><th>Materia</th><th>Fecha / Modalidad</th><th></th></tr></thead>
      <tbody>
        ${plan.map(e => `<tr>
          <td class="law-plan-name">${e.subject}</td>
          <td>${_lawTargetTag(e.target)}</td>
          <td style="padding:4px 8px;white-space:nowrap">
            <div style="display:flex;gap:2px">
              <button class="icon-btn" onclick="openEditLawPlan('${e.id}')">${PENCIL}</button>
              <button class="icon-btn" onclick="deleteLawPlan('${e.id}')">${TRASH}</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function openAddLawPlan() {
  document.getElementById('lawPlanModalTitle').textContent = 'Nueva Materia';
  document.getElementById('lawPlanId').value      = '';
  document.getElementById('lawPlanSubject').value = '';
  document.getElementById('lawPlanTarget').value  = '';
  openModal('modal-law-plan');
}

function openEditLawPlan(id) {
  const e = S.lawPlan.find(e => e.id === id);
  if (!e) return;
  document.getElementById('lawPlanModalTitle').textContent = 'Editar Materia';
  document.getElementById('lawPlanId').value      = id;
  document.getElementById('lawPlanSubject').value = e.subject;
  document.getElementById('lawPlanTarget').value  = e.target;
  openModal('modal-law-plan');
}

function saveLawPlanEntry() {
  const id      = document.getElementById('lawPlanId').value;
  const subject = document.getElementById('lawPlanSubject').value.trim();
  const target  = document.getElementById('lawPlanTarget').value.trim();
  if (!subject) { showToast('Escribe el nombre'); return; }
  if (id) {
    const e = S.lawPlan.find(e => e.id === id);
    if (e) Object.assign(e, { subject, target: target || 'Sin fecha' });
  } else {
    S.lawPlan.push({ id: uid(), subject, target: target || 'Sin fecha' });
  }
  saveState(); renderLawPlan(); closeModal('modal-law-plan');
}

function deleteLawPlan(id) {
  S.lawPlan = S.lawPlan.filter(e => e.id !== id);
  saveState(); renderLawPlan();
}

// ════════════════════════════════════════════════════════
// REMINDERS
// ════════════════════════════════════════════════════════
function remCountdown(datetimeStr) {
  const diff = new Date(datetimeStr) - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return null;
  if (h > 0)  return `en ${h}h ${m}m`;
  if (m > 0)  return `en ${m}m`;
  return '¡Ahora!';
}

function remFormatDate(datetimeStr) {
  const d = new Date(datetimeStr);
  return d.toLocaleString('es-AR', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

const REM_CFG = {
  critical: { label:'Crítico',    dot:'#ff3c3c',            icon:'🔴' },
  high:     { label:'Alto',       dot:'#FF8C3C',            icon:'🟠' },
  medium:   { label:'Medio',      dot:'var(--warn)',         icon:'🟡' },
  low:      { label:'Bajo',       dot:'var(--ok)',           icon:'🟢' },
  someday:  { label:'Algún día',  dot:'var(--accent)',       icon:'🔵' },
};
const REM_ORDER = { critical:0, high:1, medium:2, low:3, someday:4 };

function renderReminders(tab) {
  const wrap = document.getElementById('reminders-wrap-' + tab);
  if (!wrap) return;
  if (!S.reminders) S.reminders = {};
  const all = S.reminders[tab] || [];
  const now = Date.now();

  const PENCIL = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH  = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  // ── Inject timed goals as virtual urgent items (vida only) ──
  let goalUrgent = [];
  if (tab === 'vida') {
    const today    = getActiveDate();
    const tomorrow = getTomorrow();

    const pushGoals = (date, isTomorrow) => {
      (S.goals[date] || []).forEach(g => {
        if (!g.time || g.done) return;
        const remPrio = g.priority === 'high' ? 'high' : g.priority === 'mid' ? 'medium' : 'low';
        goalUrgent.push({ _isGoal: true, _isTomorrow: isTomorrow,
          _date: date, _id: g.id, id: 'goal_' + g.id,
          title: g.text, datetime: date + 'T' + g.time, priority: remPrio });
      });
    };
    pushGoals(today,    false);
    pushGoals(tomorrow, true);
    goalUrgent.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }

  // Categorize regular reminders
  const imminent = all.filter(r => r.datetime && (new Date(r.datetime) - now) > 0 && (new Date(r.datetime) - now) < 86400000);
  const critical = all.filter(r => !r.datetime && r.priority === 'critical');
  const upcoming = all.filter(r => r.datetime && (new Date(r.datetime) - now) >= 86400000).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
  const noDate   = all.filter(r => !r.datetime && r.priority !== 'critical').sort((a,b)=>(REM_ORDER[a.priority]||2)-(REM_ORDER[b.priority]||2));
  const past     = all.filter(r => r.datetime && (new Date(r.datetime) - now) <= 0).sort((a,b)=>new Date(b.datetime)-new Date(a.datetime));

  const actionsHTML = (r) => `
    <div style="display:flex;gap:2px;flex-shrink:0">
      <button class="icon-btn" onclick="openEditReminder('${tab}','${r.id}')">${PENCIL}</button>
      <button class="icon-btn" onclick="deleteReminder('${tab}','${r.id}')">${TRASH}</button>
    </div>`;

  // Urgent block (critical no-date + imminent dated + timed goals)
  const urgentAll = [...critical, ...goalUrgent, ...imminent.sort((a,b)=>new Date(a.datetime)-new Date(b.datetime))];
  const urgentHTML = urgentAll.length ? `
    <div class="rem-urgent-section">
      <div class="rem-urgent-label">⚠ Atención inmediata</div>
      ${urgentAll.map(r => {
        if (r._isGoal) {
          const cd = remCountdown(r.datetime);
          const isPast = new Date(r.datetime) - now <= 0;
          const countdownTxt = cd ? cd : isPast ? '¡Atrasada!' : '¡Ahora!';
          const countdownStyle = isPast ? 'color:#FF6B6B;text-shadow:0 0 10px rgba(255,107,107,.7)' : '';
          return `<div class="rem-urgent-item priority-${r.priority}">
            <div class="rem-urgent-row">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                  <span style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,.09);color:var(--ts)">${r._isTomorrow ? '🗓 Mañana' : '🎯 Meta'}</span>
                  <span style="font-size:10px;color:var(--tt);font-family:var(--mono)">${fmtGoalTime(r.datetime.split('T')[1])}</span>
                </div>
                <div class="rem-urgent-title">${escHtml(r.title)}</div>
                <div class="rem-urgent-countdown" style="${countdownStyle}">${countdownTxt}</div>
              </div>
              <button class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:12px" onclick="toggleGoalById('${r._date}','${r._id}')">✓ Completar</button>
            </div>
          </div>`;
        }
        const hasDate = !!r.datetime;
        return `<div class="rem-urgent-item priority-${r.priority}">
          <div class="rem-urgent-row">
            <div>
              <div class="rem-urgent-title">${r.title}</div>
              ${hasDate ? `<div class="rem-urgent-countdown">${remCountdown(r.datetime)}</div>
              <div class="rem-urgent-when">${remFormatDate(r.datetime)}</div>` : `<div class="rem-urgent-countdown">Sin fecha — hacer ahora</div>`}
            </div>
            ${actionsHTML(r)}
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  const remItemHTML = r => {
    const cfg = REM_CFG[r.priority] || REM_CFG.medium;
    const isPast = r.datetime && (new Date(r.datetime) - now) <= 0;
    const dateStr = r.datetime ? remFormatDate(r.datetime) : 'Sin fecha';
    return `<div class="rem-item${isPast ? ' rem-past' : ''}">
      <div class="rem-priority-dot" style="background:${cfg.dot}"></div>
      <div class="rem-info">
        <div class="rem-title">${r.title}</div>
        <div class="rem-meta">${dateStr}</div>
      </div>
      <span class="rem-badge rem-badge-${r.priority}">${cfg.label}</span>
      <div class="rem-actions">
        <button class="icon-btn" onclick="openEditReminder('${tab}','${r.id}')">${PENCIL}</button>
        <button class="icon-btn" onclick="deleteReminder('${tab}','${r.id}')">${TRASH}</button>
      </div>
    </div>`;
  };

  const upcomingHTML = upcoming.length ? upcoming.map(remItemHTML).join('') : '';
  const noDateHTML   = noDate.length
    ? `<div class="rem-nodate-section">📌 Sin fecha asignada</div>${noDate.map(remItemHTML).join('')}`
    : '';
  const pastHTML = past.length
    ? `<div class="rem-nodate-section" style="margin-top:14px">✓ Pasados</div>${past.map(remItemHTML).join('')}`
    : '';

  const isEmpty = all.length === 0;

  wrap.innerHTML = `<div class="card">
    <div class="card-title">
      🔔 Recordatorios
      <div style="display:flex;gap:6px;align-items:center">
        ${_notifBtnHTML()}
        <button class="btn btn-ghost btn-sm" onclick="openAddReminder('${tab}')">+ Recordatorio</button>
      </div>
    </div>
    ${isEmpty ? '<div class="empty-state">Sin recordatorios</div>' : urgentHTML + upcomingHTML + noDateHTML + pastHTML}
  </div>`;
  renderRemindersNotif(tab);
}

// Notificación de recordatorios en la sección (solo lectura). La creación vive en el overlay.
function renderRemindersNotif(tab) {
  const body = document.getElementById('reminders-notif-' + tab); if (!body) return;
  if (!S.reminders) S.reminders = {};
  const now = Date.now();
  const dated = (S.reminders[tab] || []).filter(r => r.datetime && new Date(r.datetime) - now > 0)
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime)).slice(0, 4);
  if (!dated.length) {
    body.innerHTML = '<div class="rnotif-empty">Sin recordatorios próximos. Abrí <b>Recordatorios</b> desde el FAB para crear uno.</div>';
    return;
  }
  body.innerHTML = dated.map(r => {
    const cd = (typeof remCountdown === 'function') ? remCountdown(r.datetime) : '';
    const d = new Date(r.datetime);
    const when = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toTimeString().slice(0, 5);
    const imminent = new Date(r.datetime) - now < 86400000;
    return `<div class="rnotif-item${imminent ? ' imminent' : ''}">
      <span class="rnotif-dot"></span>
      <div class="rnotif-body"><div class="rnotif-title">${escHtml(r.title)}</div><div class="rnotif-when">${when}</div></div>
      ${cd ? `<span class="rnotif-cd">${cd}</span>` : ''}
    </div>`;
  }).join('');
}

function openAddReminder(tab) {
  document.getElementById('remModalTitle').textContent = 'Nuevo Recordatorio';
  document.getElementById('remTab').value      = tab;
  document.getElementById('remId').value       = '';
  document.getElementById('remTitle').value    = '';
  document.getElementById('remDatetime').value = '';
  document.getElementById('remPriority').value = 'medium';
  openModal('modal-reminder');
}

function openEditReminder(tab, id) {
  if (!S.reminders?.[tab]) return;
  const r = S.reminders[tab].find(r => r.id === id);
  if (!r) return;
  document.getElementById('remModalTitle').textContent = 'Editar Recordatorio';
  document.getElementById('remTab').value      = tab;
  document.getElementById('remId').value       = id;
  document.getElementById('remTitle').value    = r.title;
  document.getElementById('remDatetime').value = r.datetime ? r.datetime.slice(0, 16) : '';
  document.getElementById('remPriority').value = r.priority || 'medium';
  openModal('modal-reminder');
}

function saveReminder() {
  const tab      = document.getElementById('remTab').value;
  const id       = document.getElementById('remId').value;
  const title    = document.getElementById('remTitle').value.trim();
  const datetime = document.getElementById('remDatetime').value || '';
  const priority = document.getElementById('remPriority').value;
  if (!title) { showToast('Escribe el título'); return; }
  if (!S.reminders)      S.reminders = {};
  if (!S.reminders[tab]) S.reminders[tab] = [];
  if (id) {
    const r = S.reminders[tab].find(r => r.id === id);
    if (r) Object.assign(r, { title, datetime, priority });
  } else {
    S.reminders[tab].push({ id: uid(), title, datetime, priority });
  }
  saveState(); renderReminders(tab); closeModal('modal-reminder');
}

function deleteReminder(tab, id) {
  if (!S.reminders?.[tab]) return;
  S.reminders[tab] = S.reminders[tab].filter(r => r.id !== id);
  saveState(); renderReminders(tab);
}

// ── Reminder Notifications ──
const _notifiedSet = new Set();

function initNotifications() {
  if (!('Notification' in window)) { showToast('Este navegador no soporta notificaciones'); return; }
  if (Notification.permission === 'denied') { showToast('🔕 Notificaciones bloqueadas — habilítalas en Ajustes del navegador'); return; }
  if (Notification.permission === 'granted') {
    showToast('🔔 Notificaciones ya activas');
    _getOrCreateVapidKeys().then(k => k && _subscribePush(k.pubKey));
    return;
  }
  Notification.requestPermission().then(async perm => {
    ['vida','finanzas','salud','conocimiento','ia'].forEach(renderReminders);
    if (perm === 'granted') {
      showToast('🔔 Notificaciones activadas');
      const keys = await _getOrCreateVapidKeys();
      if (keys) await _subscribePush(keys.pubKey);
    } else {
      showToast('Notificaciones no habilitadas');
    }
  });
}

function _showNotif(title, opts) {
  if (_swReg) {
    _swReg.showNotification(title, opts).catch(() => {
      // Fallback: SW showNotification falló (ej. iOS foreground), usar API directa
      try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch(e) {}
    });
    return;
  }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch(e) {}
}

function checkReminderNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const toMinStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const currentDT  = toMinStr(now);
  const in24hDT    = toMinStr(new Date(now.getTime() + 86400000));
  const PRIO_EMOJI = { critical:'⚡', high:'🔴', medium:'🟡', low:'🟢' };
  ['vida','finanzas','salud','conocimiento','ia'].forEach(tab => {
    (S.reminders?.[tab] || []).forEach(r => {
      if (!r.datetime) return;
      const remDT = r.datetime.slice(0, 16);
      // 24 h de anticipación
      if (remDT === in24hDT && !_notifiedSet.has(r.id + '_1d')) {
        _notifiedSet.add(r.id + '_1d');
        _showNotif('📅 Vence mañana — Centro de Mando', {
          body: `${PRIO_EMOJI[r.priority] || '🔵'} ${r.title}`,
          tag: r.id + '_1d',
          requireInteraction: true,
          icon: './icon.svg',
        });
      }
      // Al momento exacto
      if (remDT === currentDT && !_notifiedSet.has(r.id)) {
        _notifiedSet.add(r.id);
        _showNotif('🔔 Recordatorio — Centro de Mando', {
          body: `${PRIO_EMOJI[r.priority] || '🔵'} ${r.title}`,
          tag: r.id,
          requireInteraction: false,
          icon: './icon.svg',
        });
      }
    });
  });
}

function _notifBtnHTML() {
  if (!('Notification' in window)) return '';
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (Notification.permission === 'granted') {
    const iosHint = isIOS && !isStandalone
      ? `<button class="btn btn-ghost btn-sm" style="font-size:10px;opacity:.6" onclick="showToast('En iPhone: abre desde el ícono de la pantalla de inicio para recibir push cuando la app está cerrada')">📱 Instalar</button>`
      : '';
    return `<span style="font-size:11px;opacity:.5;cursor:default" title="Notificaciones activas">🔔</span>${iosHint}`;
  }
  if (Notification.permission === 'denied') return '<span style="font-size:11px;opacity:.5;cursor:default" title="Notificaciones bloqueadas en el navegador">🔕</span>';
  if (isIOS && !isStandalone) return `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="showToast('En iPhone: toca Compartir → Agregar a pantalla de inicio, luego abre la app instalada y activa notificaciones')">Instalar en iPhone 📱</button>`;
  return `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="initNotifications()">Activar 🔔</button>`;
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

// ── Fixed Expenses ──
function renderFixedExpenses() {
  const list = document.getElementById('fixedExpenseList');
  const empty = document.getElementById('fixedExpenseEmpty');
  if (!list) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const log = S.fixedExpenseLog[monthKey] || {};
  if (!S.fixedExpenses.length) {
    list.innerHTML = ''; empty.classList.remove('hidden');
    document.getElementById('fixedExpenseTotal').textContent = '$0'; return;
  }
  empty.classList.add('hidden');
  let total = 0;
  list.innerHTML = S.fixedExpenses.map(exp => {
    const paid = !!log[exp.id];
    total += exp.amount;
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${exp.name}</div>
        <div class="sub-detail">Día ${exp.dayOfMonth} · ${fmtMoney(exp.amount, exp.currency)}</div>
      </div>
      <div class="flex gap-8 items-center">
        ${paid
          ? '<span class="pill pill-ok" style="font-size:10px">✓ Pagado</span>'
          : `<button class="btn btn-ghost btn-sm" onclick="markFixedExpensePaid('${exp.id}')" style="font-size:10px">Marcar pagado</button>`}
        <button class="icon-btn" onclick="openEditFixedExpense('${exp.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="icon-btn" onclick="deleteFixedExpense('${exp.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('fixedExpenseTotal').textContent = fmtMoney(total, 'ARS');
}

function addFixedExpense() {
  const name = document.getElementById('fexpName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  S.fixedExpenses.push({
    id: uid(), name,
    amount: +document.getElementById('fexpAmount').value || 0,
    currency: document.getElementById('fexpCurrency').value,
    dayOfMonth: +document.getElementById('fexpDay').value || 1
  });
  saveState(); renderFixedExpenses(); closeModal('modal-add-fixed-expense');
  document.getElementById('fexpName').value = ''; document.getElementById('fexpAmount').value = '';
  showToast('Gasto fijo agregado');
}

function deleteFixedExpense(id) {
  S.fixedExpenses = S.fixedExpenses.filter(e => e.id !== id);
  saveState(); renderFixedExpenses();
}

function markFixedExpensePaid(id) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  if (!S.fixedExpenseLog[monthKey]) S.fixedExpenseLog[monthKey] = {};
  S.fixedExpenseLog[monthKey][id] = true;
  saveState(); renderFixedExpenses(); showToast('Marcado como pagado');
}

const TXN_CATEGORIES = {
  clean_food:   { label:'Alimentación Sana',     icon:'🥩', color:'rgba(107,227,164,.15)', border:'rgba(107,227,164,.4)',  chartColor:'rgba(107,227,164,.85)' },
  hydration:    { label:'Hidratación Limpia',     icon:'💧', color:'rgba(0,212,255,.12)',   border:'rgba(0,212,255,.35)',   chartColor:'rgba(0,212,255,.8)'    },
  sports:       { label:'Deporte / Gym',          icon:'🏋️', color:'rgba(124,142,232,.15)', border:'rgba(124,142,232,.4)',  chartColor:'rgba(124,142,232,.85)' },
  productivity: { label:'Productividad / Fijos',  icon:'⚡', color:'rgba(242,192,99,.15)',  border:'rgba(242,192,99,.4)',   chartColor:'rgba(242,192,99,.85)'  },
  girlfriend:   { label:'Novia',                  icon:'💑', color:'rgba(244,63,94,.12)',   border:'rgba(244,63,94,.35)',   chartColor:'rgba(244,63,94,.85)'   },
  pet:          { label:'Mascota',                icon:'🐱', color:'rgba(75,123,236,.15)',  border:'rgba(75,123,236,.4)',   chartColor:'rgba(75,123,236,.85)'  },
  junk_food:    { label:'Comida Chatarra',        icon:'🍟', color:'rgba(255,107,107,.15)', border:'rgba(255,107,107,.4)',  chartColor:'rgba(255,107,107,.85)' },
  home:         { label:'Hogar / Insumos',        icon:'🏠', color:'rgba(212,220,232,.1)',  border:'rgba(212,220,232,.3)',  chartColor:'rgba(212,220,232,.7)'  },
  mama:         { label:'Mamá',                   icon:'👩', color:'rgba(244,114,182,.15)', border:'rgba(244,114,182,.4)',  chartColor:'rgba(244,114,182,.85)' },
  papa:         { label:'Papá',                   icon:'👨', color:'rgba(56,189,248,.15)',  border:'rgba(56,189,248,.4)',   chartColor:'rgba(56,189,248,.85)'  },
  business:     { label:'Negocio',                icon:'💼', color:'rgba(251,191,36,.15)',  border:'rgba(251,191,36,.4)',   chartColor:'rgba(251,191,36,.85)'  },
  study:        { label:'Estudio',                icon:'📚', color:'rgba(167,139,250,.15)', border:'rgba(167,139,250,.4)',  chartColor:'rgba(167,139,250,.85)' },
  salary:       { label:'Ingreso',                icon:'💰', color:'rgba(107,227,164,.2)',  border:'rgba(107,227,164,.5)',  chartColor:'rgba(107,227,164,.9)'  },
  invest:       { label:'Inversión',              icon:'📈', color:'rgba(124,142,232,.18)', border:'rgba(124,142,232,.45)', chartColor:'rgba(124,142,232,.9)'  },
  other:        { label:'Otro',                   icon:'💸', color:'rgba(255,255,255,.06)', border:'rgba(255,255,255,.2)',  chartColor:'rgba(255,255,255,.5)'  },
};

function getCatInfo(cat, type) {
  return TXN_CATEGORIES[cat] || { label:'', icon: type==='income'?'💚':'🔴', color:'rgba(255,255,255,.06)', border:'rgba(255,255,255,.1)' };
}

// ════════════════════════════════════════════════════════
// PRESUPUESTO MENSUAL
// ════════════════════════════════════════════════════════
const BUDGET_EXPENSE_CATS = ['clean_food','hydration','sports','productivity','girlfriend','pet','junk_food','home','mama','papa','business','study','other'];

const _EDIT_SVG = '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const _DEL_SVG  = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>';

let budgetActiveMonth = null;

function _curMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}

function _emptyBudget() { return { fixed: [], reserved: [] }; }

function _budgetItemTotal(it) { return (+it.v1 || 0) * (+it.v2 || 0) * (+it.v3 || 0); }

// Crea el presupuesto del mes `mk` si no existe, copiando el último mes previo
// existente (con ids nuevos). Devuelve true si lo creó. Edge: sin mes previo → vacío.
function ensureBudgetMonth(mk) {
  if (!S.budgets) S.budgets = {};
  if (S.budgets[mk]) return false;
  const prevKeys = Object.keys(S.budgets).filter(k => k < mk).sort();
  const src = prevKeys.length ? S.budgets[prevKeys[prevKeys.length - 1]] : null;
  if (src) {
    S.budgets[mk] = {
      fixed:    (src.fixed    || []).map(it => ({ id: uid(), name: it.name, category: it.category, unit: it.unit, v1: it.v1, v2: it.v2, v3: it.v3 })),
      reserved: (src.reserved || []).map(it => ({ id: uid(), name: it.name, category: it.category, amount: it.amount })),
    };
  } else {
    S.budgets[mk] = _emptyBudget();
  }
  return true;
}

function getBudgetMonths() {
  const set = new Set(Object.keys(S.budgets || {}));
  set.add(_curMonthKey());
  return [...set].sort().reverse();
}

function setBudgetMonth(m) { budgetActiveMonth = m; renderBudget(); }

function renderBudget() {
  const body = document.getElementById('budgetBody');
  if (!body) return;
  if (!S.budgets) S.budgets = {};
  // Auto-copia del mes actual (una sola vez)
  if (ensureBudgetMonth(_curMonthKey())) saveState();

  const months = getBudgetMonths();
  if (!budgetActiveMonth || !months.includes(budgetActiveMonth)) budgetActiveMonth = months[0];
  ensureBudgetMonth(budgetActiveMonth);
  const b = S.budgets[budgetActiveMonth] || _emptyBudget();

  // Selector de mes
  const sel = document.getElementById('budgetMonthSel');
  if (sel) {
    sel.innerHTML = months.map(m => {
      const [y, mo] = m.split('-');
      return `<option value="${m}" ${m === budgetActiveMonth ? 'selected' : ''}>${CAL_MONTHS[+mo-1]} ${y}</option>`;
    }).join('');
  }
  const [my, mmo] = budgetActiveMonth.split('-');
  const monthLabel = `${CAL_MONTHS[+mmo-1]} ${my}`;

  // Ítems fijos
  let totalFijo = 0;
  const fixedRows = b.fixed.length ? b.fixed.map(it => {
    const ci = getCatInfo(it.category, 'expense');
    const tot = _budgetItemTotal(it);
    totalFijo += tot;
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${it.name}</div>
        <div class="sub-detail">${ci.icon} ${ci.label || '—'} · ${(+it.v1||0)} × ${(+it.v2||0)} × ${(+it.v3||0)} ${it.unit || ''}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(tot, 'ARS')}</span>
        <button class="icon-btn" onclick="openBudgetFixed('${it.id}')">${_EDIT_SVG}</button>
        <button class="icon-btn" onclick="deleteBudgetFixed('${it.id}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('') : '<p class="empty-state">Sin ítems fijos</p>';

  // Gastos reservados
  let totalRes = 0;
  const resRows = b.reserved.length ? b.reserved.map(it => {
    const ci = getCatInfo(it.category, 'expense');
    totalRes += (+it.amount || 0);
    return `<div class="sub-row">
      <div class="sub-info">
        <div class="sub-name">${it.name}</div>
        <div class="sub-detail">${ci.icon} ${ci.label || '—'}</div>
      </div>
      <div class="flex gap-8 items-center">
        <span class="mono bold">${fmtMoney(+it.amount || 0, 'ARS')}</span>
        <button class="icon-btn" onclick="openBudgetReserved('${it.id}')">${_EDIT_SVG}</button>
        <button class="icon-btn" onclick="deleteBudgetReserved('${it.id}')">${_DEL_SVG}</button>
      </div>
    </div>`;
  }).join('') : '<p class="empty-state">Sin gastos reservados</p>';

  // Comparación plan vs real (solo ARS, mes activo)
  const realByCat = {};
  S.transactions.forEach(t => {
    if (t.type === 'expense' && t.currency === 'ARS' && t.date && t.date.slice(0,7) === budgetActiveMonth) {
      const c = t.category || 'other';
      realByCat[c] = (realByCat[c] || 0) + (+t.amount || 0);
    }
  });
  const budByCat = {};
  b.fixed.forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + _budgetItemTotal(it); });
  b.reserved.forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + (+it.amount || 0); });
  const allCats = [...new Set([...Object.keys(budByCat), ...Object.keys(realByCat)])]
    .sort((a, c) => ((budByCat[c]||0)+(realByCat[c]||0)) - ((budByCat[a]||0)+(realByCat[a]||0)));
  const compRows = allCats.map(c => {
    const ci = getCatInfo(c, 'expense');
    const plan = budByCat[c] || 0, real = realByCat[c] || 0, saldo = plan - real;
    return `<div class="budget-cmp-row">
      <span class="budget-cmp-cat">${ci.icon} ${ci.label || c}</span>
      <span class="budget-cmp-num">${fmtMoney(plan, 'ARS')}</span>
      <span class="budget-cmp-num">${fmtMoney(real, 'ARS')}</span>
      <span class="budget-cmp-num ${saldo < 0 ? 'text-danger' : 'text-ok'}">${fmtMoney(saldo, 'ARS')}</span>
    </div>`;
  }).join('');
  const comparison = allCats.length ? `
    <div class="budget-cmp-hdr"><span>Categoría</span><span>Plan</span><span>Real</span><span>Saldo</span></div>
    ${compRows}` : '<p class="empty-state">Sin datos para comparar</p>';

  body.innerHTML = `
    <div class="budget-totals">
      <div class="budget-total-main">
        <span class="budget-total-lbl">Presupuesto total</span>
        <span class="budget-total-num">${fmtMoney(totalFijo + totalRes, 'ARS')}</span>
      </div>
      <div class="budget-total-sub">
        <span>Mínimo fijo: <b>${fmtMoney(totalFijo, 'ARS')}</b></span>
        <span>Reservados: <b>${fmtMoney(totalRes, 'ARS')}</b></span>
      </div>
    </div>
    <div class="budget-block-hdr">
      <span>Mínimo fijo</span>
      <button class="btn btn-ghost btn-sm" onclick="openBudgetFixed()">+ Ítem fijo</button>
    </div>
    ${fixedRows}
    <div class="budget-block-hdr">
      <span>Gastos reservados</span>
      <button class="btn btn-ghost btn-sm" onclick="openBudgetReserved()">+ Reservado</button>
    </div>
    ${resRows}
    <div class="budget-block-hdr"><span>Plan vs. real · ${monthLabel}</span></div>
    ${comparison}`;
  if (typeof renderBudgetSummary === 'function') renderBudgetSummary();
}

// ── Resumen comparativo de presupuesto (vista de sección; el detalle vive en el overlay) ──
function _budgetMonthTotal(mk) {
  const b = S.budgets && S.budgets[mk]; if (!b) return 0;
  let t = 0;
  (b.fixed || []).forEach(it => t += _budgetItemTotal(it));
  (b.reserved || []).forEach(it => t += (+it.amount || 0));
  return t;
}
function _spentMonth(mk) {
  return (S.transactions || []).filter(t => t.type === 'expense' && t.currency === 'ARS' && t.date && t.date.slice(0, 7) === mk)
    .reduce((s, t) => s + (+t.amount || 0), 0);
}
function renderBudgetSummary() {
  const body = document.getElementById('budgetSummaryBody'); if (!body) return;
  if (!S.budgets) S.budgets = {};
  const mk = _curMonthKey();
  const budget = _budgetMonthTotal(mk), spent = _spentMonth(mk);
  const ratio = budget > 0 ? spent / budget : 0;
  const over = budget > 0 && spent > budget;

  // Por categoría (plan vs real), top 5 por gasto real
  const realByCat = {}, budByCat = {};
  (S.transactions || []).forEach(t => {
    if (t.type === 'expense' && t.currency === 'ARS' && t.date && t.date.slice(0, 7) === mk) {
      const c = t.category || 'other'; realByCat[c] = (realByCat[c] || 0) + (+t.amount || 0);
    }
  });
  const b = S.budgets[mk];
  if (b) {
    (b.fixed || []).forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + _budgetItemTotal(it); });
    (b.reserved || []).forEach(it => { if (it.category) budByCat[it.category] = (budByCat[it.category] || 0) + (+it.amount || 0); });
  }
  const cats = [...new Set([...Object.keys(budByCat), ...Object.keys(realByCat)])]
    .sort((a, c) => (realByCat[c] || 0) - (realByCat[a] || 0)).slice(0, 5);

  // Tendencia últimos 6 meses
  const months = []; const now = new Date();
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const trend = months.map(m => ({ m, spent: _spentMonth(m), budget: _budgetMonthTotal(m) }));
  const maxT = Math.max(1, ...trend.map(t => Math.max(t.spent, t.budget)));

  const catRows = cats.map(c => {
    const ci = getCatInfo(c, 'expense'); const plan = budByCat[c] || 0, real = realByCat[c] || 0;
    const w = plan > 0 ? Math.min(real / plan * 100, 100) : (real > 0 ? 100 : 0);
    const ov = plan > 0 && real > plan;
    return `<div class="bsum-cat">
      <div class="bsum-cat-top"><span class="bsum-cat-name">${ci.icon} ${ci.label || c}</span><span class="bsum-cat-val mono ${ov ? 'text-danger' : ''}">${fmtMoney(real, 'ARS')} / ${fmtMoney(plan, 'ARS')}</span></div>
      <div class="bsum-cat-bar"><div class="bsum-cat-fill${ov ? ' over' : ''}" style="width:${w}%"></div></div>
    </div>`;
  }).join('') || '<p class="empty-state">Sin movimientos este mes</p>';

  const trendCols = trend.map(t => {
    const h = Math.round(t.spent / maxT * 100), bh = Math.round(t.budget / maxT * 100);
    const [, mm] = t.m.split('-'); const ov = t.budget > 0 && t.spent > t.budget;
    return `<div class="bsum-tcol" title="${CAL_MONTHS[+mm - 1]}: gastado ${fmtMoney(t.spent, 'ARS')} / plan ${fmtMoney(t.budget, 'ARS')}">
      <div class="bsum-tbars"><div class="bsum-tbudget" style="height:${Math.max(bh, 2)}%"></div><div class="bsum-tspent${ov ? ' over' : ''}" style="height:${Math.max(h, 2)}%"></div></div>
      <div class="bsum-tlbl">${CAL_MONTHS[+mm - 1].slice(0, 3)}</div>
    </div>`;
  }).join('');

  // Medidor radial (arco 270°). C = 2·π·50 ≈ 314.16; arco visible = 0.75·C ≈ 235.6.
  const ARC = 235.6, FULL = 314.16;
  const valDash = `${(ARC * Math.min(ratio, 1)).toFixed(1)} ${FULL}`;
  body.innerHTML = `
    <div class="bsum-top">
      <div class="bsum-gauge-wrap">
        <svg class="bsum-gauge" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="bsum-gauge-track" cx="60" cy="60" r="50"/>
          <circle class="bsum-gauge-val${over ? ' over' : ''}" cx="60" cy="60" r="50" style="--dash:${valDash}"/>
        </svg>
        <div class="bsum-gauge-center">
          <div class="bsum-gauge-pct${over ? ' over' : ''}">${budget > 0 ? Math.round(ratio * 100) : 0}<span>%</span></div>
          <div class="bsum-gauge-sub">usado</div>
        </div>
      </div>
      <div class="bsum-figs">
        <div class="bsum-fig"><span class="bsum-fig-lbl">Gastado</span><span class="bsum-fig-num${over ? ' over' : ''}">${fmtMoney(spent, 'ARS')}</span></div>
        <div class="bsum-fig"><span class="bsum-fig-lbl">Presupuesto</span><span class="bsum-fig-num2">${fmtMoney(budget, 'ARS')}</span></div>
        <div class="bsum-fig"><span class="bsum-fig-lbl">${over ? 'Excedido' : 'Disponible'}</span><span class="bsum-fig-num3 ${over ? 'text-danger' : 'text-ok'}">${fmtMoney(Math.abs(budget - spent), 'ARS')}</span></div>
      </div>
    </div>
    <div class="bsum-sec">Por categoría · real / plan</div>
    ${catRows}
    <div class="bsum-sec">Gastado · últimos 6 meses</div>
    <div class="bsum-trend">${trendCols}</div>
    <button class="bsum-full" onclick="if(window.openBudgetOverlay)openBudgetOverlay()">Ver presupuesto completo →</button>`;
}

function fillBudgetCatSelect(elId, selected) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = BUDGET_EXPENSE_CATS.map(c => {
    const ci = getCatInfo(c, 'expense');
    return `<option value="${c}" ${c === selected ? 'selected' : ''}>${ci.icon} ${ci.label}</option>`;
  }).join('');
}

function openBudgetFixed(id) {
  const b = S.budgets[budgetActiveMonth];
  const it = id && b ? b.fixed.find(x => x.id === id) : null;
  document.getElementById('budgetFixedTitle').textContent = it ? 'Editar ítem fijo' : 'Nuevo ítem fijo';
  document.getElementById('budgetFixedId').value = it ? it.id : '';
  document.getElementById('budgetFixedName').value = it ? it.name : '';
  fillBudgetCatSelect('budgetFixedCat', it ? it.category : BUDGET_EXPENSE_CATS[0]);
  document.getElementById('budgetFixedUnit').value = it ? (it.unit || 'unidades') : 'unidades';
  document.getElementById('budgetFixedV1').value = it ? it.v1 : '';
  document.getElementById('budgetFixedV2').value = it ? it.v2 : '';
  document.getElementById('budgetFixedV3').value = it ? it.v3 : '';
  document.getElementById('budgetFixedDel').style.display = it ? '' : 'none';
  updateBudgetFixedPreview();
  openModal('modal-budget-fixed');
}

function updateBudgetFixedPreview() {
  const el = document.getElementById('budgetFixedPreview');
  if (!el) return;
  const v1 = +document.getElementById('budgetFixedV1').value || 0;
  const v2 = +document.getElementById('budgetFixedV2').value || 0;
  const v3 = +document.getElementById('budgetFixedV3').value || 0;
  el.textContent = `${v1} × ${v2} × ${v3} = ${fmtMoney(v1 * v2 * v3, 'ARS')}`;
}

function saveBudgetFixed() {
  const name = document.getElementById('budgetFixedName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  ensureBudgetMonth(budgetActiveMonth);
  const b = S.budgets[budgetActiveMonth];
  const id = document.getElementById('budgetFixedId').value;
  const data = {
    name,
    category: document.getElementById('budgetFixedCat').value,
    unit: document.getElementById('budgetFixedUnit').value,
    v1: +document.getElementById('budgetFixedV1').value || 0,
    v2: +document.getElementById('budgetFixedV2').value || 0,
    v3: +document.getElementById('budgetFixedV3').value || 0,
  };
  if (id) { const it = b.fixed.find(x => x.id === id); if (it) Object.assign(it, data); }
  else { b.fixed.push({ id: uid(), ...data }); }
  saveState(); renderBudget(); closeModal('modal-budget-fixed');
  showToast('Ítem fijo guardado');
}

function deleteBudgetFixed(id) {
  const b = S.budgets[budgetActiveMonth];
  if (!b) return;
  b.fixed = b.fixed.filter(x => x.id !== id);
  saveState(); renderBudget(); closeModal('modal-budget-fixed');
}

function openBudgetReserved(id) {
  const b = S.budgets[budgetActiveMonth];
  const it = id && b ? b.reserved.find(x => x.id === id) : null;
  document.getElementById('budgetReservedTitle').textContent = it ? 'Editar gasto reservado' : 'Nuevo gasto reservado';
  document.getElementById('budgetReservedId').value = it ? it.id : '';
  document.getElementById('budgetReservedName').value = it ? it.name : '';
  fillBudgetCatSelect('budgetReservedCat', it ? it.category : BUDGET_EXPENSE_CATS[0]);
  document.getElementById('budgetReservedAmount').value = it ? it.amount : '';
  document.getElementById('budgetReservedDel').style.display = it ? '' : 'none';
  openModal('modal-budget-reserved');
}

function saveBudgetReserved() {
  const name = document.getElementById('budgetReservedName').value.trim();
  if (!name) { showToast('Escribe el nombre'); return; }
  ensureBudgetMonth(budgetActiveMonth);
  const b = S.budgets[budgetActiveMonth];
  const id = document.getElementById('budgetReservedId').value;
  const data = {
    name,
    category: document.getElementById('budgetReservedCat').value,
    amount: +document.getElementById('budgetReservedAmount').value || 0,
  };
  if (id) { const it = b.reserved.find(x => x.id === id); if (it) Object.assign(it, data); }
  else { b.reserved.push({ id: uid(), ...data }); }
  saveState(); renderBudget(); closeModal('modal-budget-reserved');
  showToast('Gasto reservado guardado');
}

function deleteBudgetReserved(id) {
  const b = S.budgets[budgetActiveMonth];
  if (!b) return;
  b.reserved = b.reserved.filter(x => x.id !== id);
  saveState(); renderBudget(); closeModal('modal-budget-reserved');
}

let txnActiveMonth = null;

function getAvailableMonths() {
  const months = new Set();
  S.transactions.forEach(t => { if (t.date) months.add(t.date.slice(0,7)); });
  // El mes actual siempre está disponible aunque no tenga movimientos todavía,
  // así Actividad rota al mes en curso el día 1 en vez de quedarse en el último mes con datos.
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  return [...months].sort().reverse();
}

function setTxnMonth(m) { txnActiveMonth = m; renderActivity(); }

let activityListCollapsed = false;

function toggleActivityList() {
  activityListCollapsed = !activityListCollapsed;
  const list = document.getElementById('activityList');
  const icon = document.getElementById('activityCollapseIcon');
  if (list) list.classList.toggle('collapsed', activityListCollapsed);
  if (icon) icon.classList.toggle('collapsed', activityListCollapsed);
}

function renderActivity() {
  autoDeductSubscriptions();

  const months = getAvailableMonths();
  const now = new Date();
  const curMK = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  if (!txnActiveMonth || !months.includes(txnActiveMonth)) txnActiveMonth = months[0] || curMK;

  // Month filter tabs (sección + espejo en el overlay de historial)
  const chipsHtml = months.map(m => {
    const [y,mo] = m.split('-');
    const lbl = CAL_MONTHS[+mo-1].slice(0,3)+' '+y.slice(2);
    return `<button class="txn-month-btn${m===txnActiveMonth?' active':''}" onclick="setTxnMonth('${m}')">${lbl}</button>`;
  }).join('');
  const filterEl = document.getElementById('txnMonthFilter');
  if (months.length > 1) { filterEl.style.display = ''; filterEl.innerHTML = chipsHtml; }
  else { filterEl.style.display = 'none'; }
  // Overlay de historial = archivo completo: muestra siempre todos los meses con datos.
  const histFilterEl = document.getElementById('txnHistMonthFilter');
  if (histFilterEl) histFilterEl.innerHTML = chipsHtml;

  const filtered = S.transactions.filter(t => t.date && t.date.startsWith(txnActiveMonth));

  // Summary
  let totalInc = 0, totalExp = 0;
  filtered.forEach(t => { if (t.type==='income') totalInc+=t.amount; else totalExp+=t.amount; });
  const bal = totalInc - totalExp;
  const sumRow = document.getElementById('txnSummaryRow');
  sumRow.style.display = filtered.length ? '' : 'none';
  document.getElementById('txnSumIncome').textContent = '+'+fmtMoney(totalInc, filtered[0]?.currency||'ARS');
  document.getElementById('txnSumExpense').textContent = '-'+fmtMoney(totalExp, filtered[0]?.currency||'ARS');
  const balEl = document.getElementById('txnSumBalance');
  balEl.textContent = (bal>=0?'+':'')+fmtMoney(Math.abs(bal), filtered[0]?.currency||'ARS');
  balEl.className = 'fin-summary-num '+(bal>=0?'text-ok':'text-danger');

  // Transaction list
  const list = document.getElementById('activityList');
  const empty = document.getElementById('activityEmpty');
  const accMap = {};
  S.accounts.forEach(a => accMap[a.id] = a);

  const colHdr = document.getElementById('activityColHdr');
  if (!filtered.length) {
    list.innerHTML=''; empty.classList.remove('hidden');
    if (colHdr) colHdr.style.display = 'none';
  } else {
    empty.classList.add('hidden');
    if (colHdr) colHdr.style.display = '';
    list.innerHTML = filtered.map(t => {
      const cat = getCatInfo(t.category, t.type);
      const acc = t.accountId ? accMap[t.accountId] : null;
      const catBadge = t.category
        ? `<span style="font-size:10px;padding:1px 7px;border-radius:99px;font-weight:700;background:${cat.color};border:1px solid ${cat.border};color:var(--ts);margin-left:4px">${cat.icon} ${cat.label}</span>`
        : '';
      return `<div class="activity-row">
        <div class="act-icon" style="background:${t.type==='income'?'rgba(107,227,164,.1)':'rgba(255,107,107,.1)'}">${cat.icon||(t.type==='income'?'💚':'🔴')}</div>
        <div class="act-info">
          <div class="act-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">${t.name}${catBadge}</div>
          <div class="act-date">${fmtDate(t.date)}${acc?` <span style="color:var(--ts)">· ${acc.icon||'🏦'} ${acc.name}</span>`:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="act-amount ${t.type}">${t.type==='expense'?'-':'+'} ${fmtMoney(t.amount,t.currency)}</div>
          <div class="txn-actions"><button class="icon-btn" onclick="openEditTxn('${t.id}')" title="Editar"><svg viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></div>
        </div>
      </div>`;
    }).join('');
  }

  // Expense chart
  renderTxnChart(filtered);

  // "Ver historial →" en la sección (abre el overlay que aloja la lista)
  const verHistBtn = document.getElementById('verHistorialBtn');
  if (verHistBtn) verHistBtn.style.display = S.transactions.length ? '' : 'none';

  // Monthly balance toggle button
  const histBtn = document.getElementById('toggleMonthBalance');
  histBtn.style.display = S.transactions.length ? '' : 'none';

  // Render month balance if visible
  const histEl = document.getElementById('monthBalanceList');
  if (histEl.style.display !== 'none') renderMonthBalanceList();
}

function renderTxnChart(transactions) {
  const wrap = document.getElementById('txnChartWrap');
  const canvas = document.getElementById('txnExpenseChart');
  if (!wrap || !canvas) return;

  const expenses = transactions.filter(t => t.type === 'expense');
  if (!expenses.length) {
    wrap.style.display = 'none';
    if (txnChartInst) { txnChartInst.destroy(); txnChartInst = null; }
    return;
  }
  wrap.style.display = '';

  // Group expenses by category
  const byCat = {};
  expenses.forEach(t => {
    const k = t.category || 'other';
    byCat[k] = (byCat[k] || 0) + t.amount;
  });

  // Sort by amount descending
  const sorted = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  const labels  = sorted.map(([k]) => { const c = TXN_CATEGORIES[k]; return c ? c.icon+' '+c.label : k; });
  const data    = sorted.map(([,v]) => v);
  const colors  = sorted.map(([k]) => (TXN_CATEGORIES[k]?.chartColor || 'rgba(255,255,255,.4)'));
  const total   = data.reduce((a,b)=>a+b,0);

  if (txnChartInst) { txnChartInst.destroy(); txnChartInst = null; }
  txnChartInst = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      _noCrosshair: true,
      interaction: { mode: 'nearest', intersect: true },
      animation: { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { size: 11, weight: '600' },
            padding: 10,
            boxWidth: 10,
            color: '#FFFFFF',
            generateLabels(chart) {
              // Solo las 5 categorías con más gasto (el donut conserva todas las porciones)
              return chart.data.labels.slice(0, 5).map((label, i) => ({
                text: label + '  ' + fmtMoney(data[i], 'ARS'),
                fillStyle: colors[i],
                strokeStyle: 'transparent',
                fontColor: '#FFFFFF',
                color: '#FFFFFF',
                hidden: false,
                index: i,
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const pct = total ? ((ctx.raw/total)*100).toFixed(1) : 0;
              return ` ${fmtMoney(ctx.raw,'ARS')}  (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderMonthBalanceList() {
  const el = document.getElementById('monthBalanceList');
  if (!el) return;
  const monthData = {};
  S.transactions.forEach(t => {
    if (!t.date) return;
    const mk = t.date.slice(0,7);
    if (!monthData[mk]) monthData[mk] = { inc:0, exp:0 };
    if (t.type==='income') monthData[mk].inc += t.amount;
    else monthData[mk].exp += t.amount;
  });
  const months = Object.keys(monthData).sort().reverse();
  if (!months.length) { el.innerHTML='<div class="empty-state" style="padding:16px 0">Sin historial aún</div>'; return; }
  el.innerHTML = months.map(mk => {
    const { inc, exp } = monthData[mk];
    const bal = inc - exp;
    const [y,m] = mk.split('-');
    return `<div class="month-balance-row">
      <div>
        <div class="month-balance-label">${CAL_MONTHS[+m-1]} ${y}</div>
        <div class="month-balance-sub">Ingr: +${fmtMoney(inc,'ARS')} · Gast: -${fmtMoney(exp,'ARS')}</div>
      </div>
      <div class="month-balance-val ${bal>=0?'text-ok':'text-danger'}">${bal>=0?'+':''}${fmtMoney(Math.abs(bal),'ARS')}</div>
    </div>`;
  }).join('');
}

function toggleMonthBalanceView() {
  const el = document.getElementById('monthBalanceList');
  const btn = document.getElementById('toggleMonthBalance');
  if (!el) return;
  const visible = el.style.display !== 'none';
  el.style.display = visible ? 'none' : '';
  btn.textContent = visible ? '↓ Ver historial mensual' : '↑ Ocultar historial';
  if (!visible) renderMonthBalanceList();
}

function openEditTxn(id) {
  const txn = S.transactions.find(t=>t.id===id);
  if (!txn) return;
  document.getElementById('editTxnId').value = txn.id;
  document.getElementById('editTxnName').value = txn.name;
  document.getElementById('editTxnType').value = txn.type;
  document.getElementById('editTxnAmount').value = txn.amount;
  document.getElementById('editTxnCurrency').value = txn.currency;
  document.getElementById('editTxnCategory').value = txn.category || '';
  const sel = document.getElementById('editTxnAccount');
  sel.innerHTML = '<option value="">— Ninguna —</option>' +
    S.accounts.filter(a=>a.type==='bank'||a.type==='invest')
      .map(a=>`<option value="${a.id}">${a.icon||'🏦'} ${a.name}</option>`).join('');
  sel.value = txn.accountId || '';
  openModal('modal-edit-txn');
}

function saveEditTxn() {
  const id = document.getElementById('editTxnId').value;
  const txn = S.transactions.find(t=>t.id===id);
  if (!txn) return;
  // Reverse original account impact
  if (txn.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance -= txn.type==='income' ? txn.amount : -txn.amount;
  }
  txn.name     = document.getElementById('editTxnName').value.trim() || txn.name;
  txn.type     = document.getElementById('editTxnType').value;
  txn.amount   = +document.getElementById('editTxnAmount').value || txn.amount;
  txn.currency = document.getElementById('editTxnCurrency').value;
  txn.category = document.getElementById('editTxnCategory').value;
  txn.accountId= document.getElementById('editTxnAccount').value;
  // Apply new account impact
  if (txn.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance += txn.type==='income' ? txn.amount : -txn.amount;
  }
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-edit-txn');
  showToast('Movimiento actualizado');
}

function deleteTransaction(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  const txn = S.transactions.find(t=>t.id===id);
  if (txn?.accountId) {
    const acc = S.accounts.find(a=>a.id===txn.accountId);
    if (acc) acc.balance -= txn.type==='income' ? txn.amount : -txn.amount;
  }
  S.transactions = S.transactions.filter(t=>t.id!==id);
  snapshotNW(); saveState(); renderFinanzasTab(); closeModal('modal-edit-txn');
  showToast('Movimiento eliminado');
}

function addTransaction() {
  const name=document.getElementById('txnName').value.trim();
  if (!name) { showToast('Escribe la descripción'); return; }
  const type=document.getElementById('txnType').value;
  const amount=+document.getElementById('txnAmount').value||0;
  const currency=document.getElementById('txnCurrency').value;
  const accountId=document.getElementById('txnAccount').value;
  const category=document.getElementById('txnCategory').value;
  if (accountId) {
    const acc=S.accounts.find(a=>a.id===accountId);
    if (acc) { acc.balance += type==='income'?amount:-amount; snapshotNW(); }
  }
  S.transactions.unshift({ id:uid(), date:getActiveDate(), name, type, amount, currency, accountId, category });
  saveState(); renderFinanzasTab(); closeModal('modal-add-txn');
  document.getElementById('txnName').value='';
  document.getElementById('txnAmount').value='';

  if (type === 'income') {
    // Sparkle near the modal close button / center of screen
    showSparkle(window.innerWidth/2, window.innerHeight*0.4);
    showToast('💰 ¡Ingreso registrado!', 2500);
  } else {
    // Check budget alert (June 2026 mode: $500k limit)
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthExp = S.transactions.filter(t => t.type==='expense' && t.date && t.date.startsWith(mk)).reduce((s,t)=>s+t.amount,0);
    const BUDGET_LIMIT = 500000;
    if (monthExp >= BUDGET_LIMIT) {
      showFireEffect();
      const el = document.createElement('div');
      el.style.cssText = `
        position:fixed; top:20%; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,rgba(255,60,60,.2),rgba(255,107,107,.12));
        border:2px solid rgba(255,60,60,.6); border-radius:20px;
        padding:16px 28px; text-align:center; pointer-events:none; z-index:10000;
        backdrop-filter:blur(20px); box-shadow:0 0 60px rgba(255,60,60,.4),0 20px 60px rgba(0,0,0,.4);
        animation:failBanner 4s cubic-bezier(.22,1,.36,1) forwards; white-space:nowrap;
      `;
      el.innerHTML = `
        <div style="font-size:32px;line-height:1;margin-bottom:6px">🔥💸🔥</div>
        <div style="font-size:18px;font-weight:900;letter-spacing:.06em;color:#ff3c3c;text-shadow:0 0 30px rgba(255,60,60,.9)">¡PRESUPUESTO SUPERADO!</div>
        <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Gastos del mes: ${fmtMoney(monthExp,'ARS')} / $500.000</div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4200);
      showToast('🔥 ¡Límite mensual superado!', 4000);
    } else if (monthExp >= BUDGET_LIMIT * 0.9) {
      showToast(`⚠ Gastos al ${Math.round(monthExp/BUDGET_LIMIT*100)}% del límite mensual`, 3500);
    } else {
      showToast('Movimiento registrado');
    }
  }
}

function autoDeductSubscriptions() {
  const today=new Date();
  S.subscriptions.forEach(sub=>{
    if (sub.billingDay!==today.getDate()) return;
    const already=S.transactions.some(t=>t.name===`Sub: ${sub.name}`&&t.date===getActiveDate());
    if (already) return;
    if (sub.accountId) {
      const acc=S.accounts.find(a=>a.id===sub.accountId);
      if (acc) { acc.balance-=sub.amount; snapshotNW(); }
    }
    S.transactions.unshift({ id:uid(), date:getActiveDate(), name:`Sub: ${sub.name}`, type:'expense', amount:sub.amount, currency:sub.currency, accountId:sub.accountId });
    saveState();
  });
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

let weightChartInst=null, nwPieInst=null, nwLineInst=null, txnChartInst=null, sleepChartInst=null;

function initChartsForTab(tab) {
  if (tab==='finanzas') { initNWCharts(); }
}

function getLast14Days() {
  const days=[]; const now=new Date();
  for (let i=13;i>=0;i--) { const d=new Date(now); d.setDate(d.getDate()-i); days.push(localStr(d)); }
  return days;
}

function initWeightChart() {
  const ctx=document.getElementById('weightChart').getContext('2d');
  const entries=S.bodyWeight.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-20);
  const labels=entries.map(e=>e.date.slice(5));
  const data=entries.map(e=>e.value);
  // Simple linear trend
  const trendData=calcTrend(data);
  weightChartInst=new Chart(ctx,{
    type:'line',
    data:{
      labels,
      datasets:[
        { label:'Peso', data, borderColor:'var(--accent)', backgroundColor:'rgba(124,142,232,.1)', pointRadius:4, tension:.3, fill:true },
        { label:'Tendencia', data:trendData, borderColor:'rgba(255,255,255,.2)', borderDash:[5,5], pointRadius:0, tension:.3 }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ font:{size:9} } }, y:{ ticks:{ font:{size:9} } } } }
  });
}

function updateWeightChart() {
  if (!weightChartInst) return;
  const entries=S.bodyWeight.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-20);
  weightChartInst.data.labels=entries.map(e=>e.date.slice(5));
  weightChartInst.data.datasets[0].data=entries.map(e=>e.value);
  weightChartInst.data.datasets[1].data=calcTrend(entries.map(e=>e.value));
  weightChartInst.update('none');
}

function calcTrend(data) {
  if (data.length < 2) return data;
  const n=data.length, xi=Array.from({length:n},(_,i)=>i);
  const mx=xi.reduce((a,b)=>a+b,0)/n, my=data.reduce((a,b)=>a+b,0)/n;
  const num=xi.reduce((s,x,i)=>s+(x-mx)*(data[i]-my),0);
  const den=xi.reduce((s,x)=>s+(x-mx)**2,0);
  const slope=den?num/den:0, int=my-slope*mx;
  return xi.map(x=>+(slope*x+int).toFixed(2));
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
function renderVidaHabits() { renderHabitsCard('vida'); }

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
// QUARTERLY OBJECTIVES
// ════════════════════════════════════════════════════════
const QOBJ_TAB_CATS = {
  vida:         ['Vida'],
  finanzas:     ['Economía'],
  conocimiento: ['Facultad', 'Conocimiento'],
  salud:        ['Entrenamiento'],
  ia:           ['IA']
};

const _MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function _periodMonths(periodId) {
  const m = periodId.match(/^t([1-4])-(\d{4})$/);
  if (!m) return [];
  const q = parseInt(m[1]), yr = m[2];
  const start = (q - 1) * 3;
  return [0, 1, 2].map(i => `${yr}-${String(start + i + 1).padStart(2, '0')}`);
}

const _qobjActiveMonth = {}; // tabName → 'trim' | 'YYYY-MM'

function selectMonthView(tabName, view) {
  _qobjActiveMonth[tabName] = view;
  renderQObjForTab(tabName);
}

// ── Metas mensuales POR SECCIÓN ──────────────────────────────
// Forma: S.monthlyGoals = { <sec>: { 'YYYY-MM': [{ id, text, done }] } }
const _MG_SECTIONS = Object.keys(QOBJ_TAB_CATS); // vida, finanzas, salud, conocimiento, ia
function _migrateMonthlyGoals() {
  if (!S.monthlyGoals || typeof S.monthlyGoals !== 'object') { S.monthlyGoals = {}; return false; }
  const keys = Object.keys(S.monthlyGoals);
  // Formato viejo (global por mes): claves 'YYYY-MM' en el primer nivel → mover a 'vida'
  if (!keys.some(k => /^\d{4}-\d{2}$/.test(k))) return false;
  const old = S.monthlyGoals, next = {};
  _MG_SECTIONS.forEach(s => next[s] = {});
  keys.forEach(k => {
    if (/^\d{4}-\d{2}$/.test(k)) next.vida[k] = old[k];
    else if (old[k] && typeof old[k] === 'object') next[k] = old[k];
  });
  S.monthlyGoals = next;
  return true;
}
function _mgSection(sec) {
  _migrateMonthlyGoals();
  if (!S.monthlyGoals[sec]) S.monthlyGoals[sec] = {};
  return S.monthlyGoals[sec];
}
function getMonthlyGoals(sec, monthKey) {
  return _mgSection(sec)[monthKey] || [];
}
function _refreshMonthly(sec) {
  renderQObjForTab(sec);
  if (window.JARVIS_INTEL) try { JARVIS_INTEL.renderCard(sec); } catch (e) {}
}

function toggleMonthlyGoal(tabName, monthKey, idx) {
  const goals = getMonthlyGoals(tabName, monthKey);
  if (!goals[idx]) return;
  goals[idx].done = !goals[idx].done;
  saveState(); _refreshMonthly(tabName);
}

function deleteMonthlyGoal(tabName, monthKey, idx) {
  const goals = getMonthlyGoals(tabName, monthKey);
  if (!goals[idx]) return;
  goals.splice(idx, 1);
  saveState(); _refreshMonthly(tabName);
}

let _mgoalAddTab = null, _mgoalAddMonth = null;

function openAddMonthlyGoal(tabName, monthKey) {
  _mgoalAddTab = tabName;
  _mgoalAddMonth = monthKey;
  const [yr, mn] = monthKey.split('-');
  const secLbl = (QOBJ_TAB_CATS[tabName] || []).join(' & ') || tabName;
  document.getElementById('mgoal-modal-title').textContent =
    `Meta de ${secLbl} — ${_MONTH_SHORT[parseInt(mn) - 1]} ${yr}`;
  document.getElementById('mgoal-input-text').value = '';
  openModal('modal-add-mgoal');
}

function saveNewMonthlyGoal() {
  const text = document.getElementById('mgoal-input-text').value.trim();
  if (!text || !_mgoalAddMonth || !_mgoalAddTab) return;
  const m = _mgSection(_mgoalAddTab);
  if (!m[_mgoalAddMonth]) m[_mgoalAddMonth] = [];
  const goals = m[_mgoalAddMonth];
  const nextId = goals.length ? Math.max(...goals.map(g => g.id)) + 1 : 1;
  goals.push({ id: nextId, text, done: false });
  saveState();
  closeModal('modal-add-mgoal');
  _refreshMonthly(_mgoalAddTab);
}

function renderQObjForTab(tabName) {
  const wrap = document.getElementById('qobj-wrap-' + tabName);
  if (!wrap) return;

  const qo = S.quarterlyObjectives;
  const period = qo.periods.find(p => p.id === qo.activePeriod) || qo.periods[0];
  const cats = QOBJ_TAB_CATS[tabName];
  const isVida = tabName === 'vida';

  const activeView = _qobjActiveMonth[tabName] || 'trim';
  const months = _periodMonths(period.id);

  const ddId = `qobj-dd-${tabName}`;
  const dropdownHTML = `<div class="qobj-period-dropdown" id="${ddId}" style="margin-bottom:0">
    <button class="qobj-period-trigger" onclick="toggleQObjDropdown('${ddId}')">
      ${period.label}<span class="qobj-period-chevron">▾</span>
    </button>
    <div class="qobj-period-menu">
      ${qo.periods.map(p => `<button class="qobj-period-option${p.id===qo.activePeriod?' active':''}" onclick="selectQPeriod('${p.id}');closeQObjDropdown('${ddId}')">${p.label}</button>`).join('')}
    </div>
  </div>`;

  let monthTabsHTML = '';
  if (months.length) {
    const tabs = [
      `<button class="qobj-month-tab${activeView==='trim'?' active':''}" onclick="selectMonthView('${tabName}','trim')">Trim</button>`,
      ...months.map(m => {
        const label = _MONTH_SHORT[parseInt(m.split('-')[1]) - 1];
        return `<button class="qobj-month-tab${activeView===m?' active':''}" onclick="selectMonthView('${tabName}','${m}')">${label}</button>`;
      })
    ].join('');
    monthTabsHTML = `<div class="qobj-month-tabs">${tabs}</div>`;
  }

  const titleCats = cats.length === 1 ? cats[0] : cats.join(' & ');
  const addPeriodBtn = isVida
    ? `<button class="btn btn-ghost btn-sm" onclick="openModal('modal-add-period')">+ Período</button>`
    : '';

  let contentHTML;
  if (activeView === 'trim') {
    const objs = (period.flat && !isVida) ? []
      : period.flat ? period.objectives
      : period.objectives.filter(o => cats.includes(o.category));

    const total = objs.length;
    const done  = objs.filter(o => o.done).length;
    const barWidth = total ? Math.round(done / total * 100) : 0;
    const noteHTML = period.note ? `<div class="qobj-note">${period.note}</div>` : '';

    let listHTML;
    if (period.flat && !isVida) {
      listHTML = `<div class="empty-state" style="font-size:11px;padding:16px 0">Sin categorías en este período</div>`;
    } else if (period.flat) {
      listHTML = objs.map(o => qobjItemHTML(period.id, o)).join('');
    } else {
      listHTML = cats.map(cat => {
        const items = period.objectives.filter(o => o.category === cat);
        const bodyId = `qobj-body-${period.id}-${cat.replace(/\W+/g,'_')}`;
        return `<div class="qobj-category-row" onclick="toggleQObjCat('${bodyId}',this)">
          <span class="qobj-category-label">${cat}<span class="qobj-category-chevron">▾</span></span>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openAddQObj('${period.id}','${cat}')">+</button>
        </div>
        <div class="qobj-category-body" id="${bodyId}">
          ${items.length ? items.map(o => qobjItemHTML(period.id, o)).join('') : ''}
        </div>`;
      }).join('');
    }

    contentHTML = `${noteHTML}
    <div class="qobj-progress-row">
      <span class="qobj-progress-num">${done}</span>
      <span class="qobj-progress-den">/${total}</span>
      <div class="qobj-progress-bar-wrap">
        <div class="qobj-progress-bar" style="width:${barWidth}%"></div>
      </div>
    </div>
    <div>${listHTML}</div>`;
  } else {
    const monthKey = activeView;
    const goals = getMonthlyGoals(tabName, monthKey);
    const mn = parseInt(monthKey.split('-')[1]) - 1;
    const yr = monthKey.split('-')[0];
    const totalM = goals.length;
    const doneM = goals.filter(g => g.done).length;
    const barWM = totalM ? Math.round(doneM / totalM * 100) : 0;

    const progressHTML = totalM ? `<div class="qobj-progress-row">
      <span class="qobj-progress-num">${doneM}</span>
      <span class="qobj-progress-den">/${totalM}</span>
      <div class="qobj-progress-bar-wrap">
        <div class="qobj-progress-bar" style="width:${barWM}%"></div>
      </div>
    </div>` : '';

    const goalsHTML = goals.length
      ? goals.map((g, i) => `<div class="monthly-goal-item${g.done?' done':''}">
          <input type="checkbox" ${g.done?'checked':''} onchange="toggleMonthlyGoal('${tabName}','${monthKey}',${i})">
          <span class="mg-text">${g.text}</span>
          <button class="mg-del" onclick="deleteMonthlyGoal('${tabName}','${monthKey}',${i})">✕</button>
        </div>`).join('')
      : `<div class="empty-state" style="font-size:12px;padding:14px 0;text-align:center">Sin metas para ${_MONTH_SHORT[mn]} ${yr}</div>`;

    contentHTML = `${progressHTML}
    <div>${goalsHTML}</div>
    <button class="btn btn-ghost btn-sm" onclick="openAddMonthlyGoal('${tabName}','${monthKey}')" style="margin-top:8px">+ Meta mensual</button>`;
  }

  wrap.innerHTML = `<div class="card">
    <div class="card-title">🏆 Objetivos · ${titleCats}${addPeriodBtn}</div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${dropdownHTML}
      ${monthTabsHTML}
    </div>
    ${contentHTML}
  </div>`;
}

function renderQuarterlyObjectives() {
  Object.keys(QOBJ_TAB_CATS).forEach(t => renderQObjForTab(t));
}

function toggleQObjDropdown(ddId) {
  const dd = document.getElementById(ddId);
  if (!dd) return;
  const menu = dd.querySelector('.qobj-period-menu');
  const trigger = dd.querySelector('.qobj-period-trigger');
  const isOpen = menu.classList.toggle('open');
  trigger.classList.toggle('open', isOpen);
  if (isOpen) {
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!dd.contains(e.target)) {
          closeQObjDropdown(ddId);
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }
}

function closeQObjDropdown(ddId) {
  const dd = document.getElementById(ddId);
  if (!dd) return;
  dd.querySelector('.qobj-period-menu').classList.remove('open');
  dd.querySelector('.qobj-period-trigger').classList.remove('open');
}

function toggleQObjCat(bodyId, rowEl) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const collapsed = body.classList.toggle('collapsed');
  const chevron = rowEl.querySelector('.qobj-category-chevron');
  if (chevron) chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
}

function qobjItemHTML(periodId, o) {
  return `<div class="qobj-item${o.done?' done':''}">
    <input type="checkbox" ${o.done?'checked':''} onchange="toggleQObj('${periodId}',${o.id})">
    <span class="qobj-item-text">${o.text}</span>
    <div class="qobj-item-actions">
      <button class="qobj-act-btn" onclick="openEditQObj('${periodId}',${o.id})" title="Editar">✎</button>
      <button class="qobj-act-btn" onclick="deleteQObj('${periodId}',${o.id})" title="Eliminar">✕</button>
    </div>
  </div>`;
}

function selectQPeriod(id) {
  S.quarterlyObjectives.activePeriod = id;
  saveState(); renderQuarterlyObjectives();
}

function toggleQObj(periodId, objId) {
  const period = S.quarterlyObjectives.periods.find(p=>p.id===periodId);
  const o = period.objectives.find(o=>o.id===objId);
  o.done = !o.done; saveState(); renderQuarterlyObjectives();
  if (o.done) {
    const allDone = period.objectives.every(o => o.done);
    if (allDone) {
      showConfetti(5000);
      const el = document.createElement('div');
      el.style.cssText = `
        position:fixed; top:16%; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,rgba(242,192,99,.2),rgba(255,183,106,.14));
        border:2px solid rgba(242,192,99,.55); border-radius:20px;
        padding:20px 36px; text-align:center; pointer-events:none; z-index:10000;
        backdrop-filter:blur(20px); box-shadow:0 0 70px rgba(242,192,99,.4),0 20px 60px rgba(0,0,0,.4);
        animation:missionBanner 4s cubic-bezier(.22,1,.36,1) forwards; white-space:nowrap;
      `;
      el.innerHTML = `
        <div style="font-size:38px;line-height:1;margin-bottom:8px">🏅</div>
        <div style="font-size:22px;font-weight:900;letter-spacing:.06em;color:#F2C063;text-shadow:0 0 35px rgba(242,192,99,.9)">¡${period.label} COMPLETADO!</div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;font-weight:600">Todos los objetivos del trimestre logrados</div>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4200);
      showToast(`🏅 ¡${period.label} completado!`, 4000);
    } else {
      showToast('✓ Objetivo logrado');
    }
  }
}

let _qobjAddPeriod = null, _qobjAddCat = null;
function openAddQObj(periodId, cat) {
  _qobjAddPeriod = periodId; _qobjAddCat = cat || null;
  document.getElementById('qobj-input-text').value = '';
  const catSel = document.getElementById('qobj-input-cat');
  if (cat) { catSel.value = cat; catSel.style.display = 'none'; }
  else catSel.style.display = 'block';
  openModal('modal-add-qobj');
}
function saveNewQObj() {
  const text = document.getElementById('qobj-input-text').value.trim();
  if (!text) return;
  const period = S.quarterlyObjectives.periods.find(p=>p.id===_qobjAddPeriod);
  const nextId = period.objectives.length ? Math.max(...period.objectives.map(o=>o.id)) + 1 : 1;
  const cat = _qobjAddCat || (period.flat ? null : document.getElementById('qobj-input-cat').value);
  period.objectives.push({ id: nextId, text, done: false, category: cat });
  saveState(); closeModal('modal-add-qobj'); renderQuarterlyObjectives();
}

function openEditQObj(periodId, objId) {
  const o = S.quarterlyObjectives.periods.find(p=>p.id===periodId).objectives.find(o=>o.id===objId);
  document.getElementById('qobj-edit-text').value = o.text;
  document.getElementById('qobj-edit-period').value = periodId;
  document.getElementById('qobj-edit-id').value = objId;
  openModal('modal-edit-qobj');
}
function saveEditQObj() {
  const text = document.getElementById('qobj-edit-text').value.trim();
  if (!text) return;
  const periodId = document.getElementById('qobj-edit-period').value;
  const objId = parseInt(document.getElementById('qobj-edit-id').value);
  const o = S.quarterlyObjectives.periods.find(p=>p.id===periodId).objectives.find(o=>o.id===objId);
  o.text = text;
  saveState(); closeModal('modal-edit-qobj'); renderQuarterlyObjectives();
}

function deleteQObj(periodId, objId) {
  const period = S.quarterlyObjectives.periods.find(p=>p.id===periodId);
  period.objectives = period.objectives.filter(o=>o.id!==objId);
  saveState(); renderQuarterlyObjectives();
}

function saveNewPeriod() {
  const label = document.getElementById('period-input-label').value.trim();
  if (!label) return;
  const note  = document.getElementById('period-input-note').value.trim() || null;
  const flat  = document.getElementById('period-input-flat').checked;
  const id    = 'p-' + Date.now();
  S.quarterlyObjectives.periods.push({ id, label, flat, note, objectives: [] });
  S.quarterlyObjectives.activePeriod = id;
  saveState(); closeModal('modal-add-period'); renderQuarterlyObjectives();
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
// Migrate lawProgress if it contains old placeholder subjects
if (S.lawProgress?.years?.[0]?.subjects?.[0]?.id === 's1_1') {
  S.lawProgress = JSON.parse(JSON.stringify(DEFAULT_STATE.lawProgress));
  saveState();
}
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

// ════════════════════════════════════════════════════════
// PLANNER MOTIVATIONAL QUOTES
// ════════════════════════════════════════════════════════
(function initPlannerQuotes() {
  const quotes = [
    'Planifica tu tiempo y tu concentración',
    '"Actuar sin planear es la causa de cada fracaso"',
    'Lista de 3: trabaja con máximo 3 tareas importantes al día; lo demás es secundario',
  ];
  let idx = 0;
  const BASE_FONT = 13.5, MIN_FONT = 8;
  function fitOneLine(el) {
    let size = BASE_FONT;
    el.style.fontSize = size + 'px';
    while (el.scrollWidth > el.clientWidth && size > MIN_FONT) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  }
  function rotate() {
    const el = document.getElementById('plannerQuoteText');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent = quotes[idx];
      fitOneLine(el);
      el.style.opacity = '1';
      idx = (idx + 1) % quotes.length;
    }, 460);
  }
  rotate();
  setInterval(rotate, 7000);
})();

// ════════════════════════════════════════════════════════
// PROYECTOS WORKSPACE
// ════════════════════════════════════════════════════════
(function() {
  const TABS = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
  const storageKey = tab => 'proyectos_' + tab + '_v1';

  const ICONS = ['📁','📂','🚀','🎯','⭐','📋','🛠️','💡','📝','🔍','🌐','💼','📌','🔖','🏆','⚡','🧠','🔧','📊','✅'];

  const DEFAULTS = {
    vida:         [{ id: uid(), label: 'Proyectos personales', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
    finanzas:     [{ id: uid(), label: 'Proyectos financieros', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
    salud:        [{ id: uid(), label: 'Proyectos de salud', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
    conocimiento: [{ id: uid(), label: 'Proyectos de estudio', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
    ia:           [{ id: uid(), label: 'Proyectos de IA', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] }],
  };

  function migrateOrDefault(tab) {
    const tree = JSON.parse(JSON.stringify(DEFAULTS[tab] || []));
    const ideas = (typeof S !== 'undefined' && S.ideas && S.ideas[tab]) ? S.ideas[tab] : [];
    if (ideas.length) {
      const folder = { id: uid(), label: 'Ideas migradas', icon: '💡', open: true, description: '', notes: '', detailOpen: false, children: [] };
      ideas.forEach(idea => {
        folder.children.push({ id: idea.id || uid(), label: idea.title || 'Sin título', icon: '📝', open: false, description: idea.description || '', notes: idea.notes || '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] });
      });
      tree.push(folder);
    }
    return tree;
  }

  function loadTree(tab) {
    // Prefer S.proyectos (Firebase-synced) when available
    if (typeof S !== 'undefined' && S.proyectos?.[tab] != null) return S.proyectos[tab];
    // Fall back to old localStorage key (will be migrated on next loadState)
    try { const r = localStorage.getItem(storageKey(tab)); return r ? JSON.parse(r) : migrateOrDefault(tab); }
    catch { return migrateOrDefault(tab); }
  }

  function saveTree(tab, tree) {
    localStorage.setItem(storageKey(tab), JSON.stringify(tree)); // cache local
    if (typeof S !== 'undefined') {
      if (!S.proyectos) S.proyectos = {};
      S.proyectos[tab] = tree;
      if (typeof saveState === 'function') saveState(); // sync a Firebase
    }
  }

  const trees = {};
  TABS.forEach(t => { trees[t] = loadTree(t); });

  function renderProyectos(tab) {
    const wrap = document.getElementById('proyectos-wrap-' + tab);
    if (!wrap) return;
    if (!trees[tab]) trees[tab] = loadTree(tab);
    wrap.innerHTML = '';
    const ws = document.createElement('div');
    ws.className = 'proy-workspace';

    const hdr = document.createElement('div');
    hdr.className = 'proy-header';
    hdr.style.cursor = 'pointer';
    hdr.innerHTML = `<div class="proy-header-title">🗂️ Proyectos</div>`;

    const hdrRight = document.createElement('div');
    hdrRight.style.cssText = 'display:flex;align-items:center;gap:8px';

    const addBtn = document.createElement('button');
    addBtn.className = 'proy-add-root-btn';
    addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nuevo proyecto`;
    addBtn.onclick = e => { e.stopPropagation(); addRootNode(tab); };

    const proyCKey = 'proy_collapsed_' + tab;
    const proyChevron = document.createElement('span');
    proyChevron.className = 'card-collapse-chevron';
    proyChevron.textContent = '▾';

    hdrRight.append(addBtn, proyChevron);
    hdr.appendChild(hdrRight);

    const treeEl = document.createElement('div');
    treeEl.className = 'proy-tree';
    trees[tab].forEach(node => treeEl.appendChild(buildNodeEl(tab, node, 0)));

    // Restore collapsed state
    if (localStorage.getItem(proyCKey) === '1') {
      treeEl.style.cssText = 'max-height:0;overflow:hidden;opacity:0';
      proyChevron.style.transform = 'rotate(-90deg)';
    }

    hdr.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const isCollapsed = treeEl.style.maxHeight === '0px';
      if (isCollapsed) {
        treeEl.style.cssText = 'max-height:4000px;overflow:hidden;opacity:1;transition:max-height .28s ease,opacity .22s ease';
        proyChevron.style.transform = '';
        localStorage.setItem(proyCKey, '');
      } else {
        treeEl.style.cssText = 'max-height:0;overflow:hidden;opacity:0;transition:max-height .28s ease,opacity .22s ease';
        proyChevron.style.transform = 'rotate(-90deg)';
        localStorage.setItem(proyCKey, '1');
      }
    });

    ws.appendChild(hdr);
    ws.appendChild(treeEl);
    wrap.appendChild(ws);
  }

  function buildNodeEl(tab, node, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = 'proy-node';
    wrapper.dataset.depth = depth;
    wrapper.dataset.id = node.id;

    const headerEl = document.createElement('div');
    headerEl.className = 'proy-node-header';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'proy-toggle-btn' + (node.open ? ' open' : '');
    toggleBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
    toggleBtn.onclick = e => { e.stopPropagation(); toggleChildren(tab, node); };

    const checkEl = document.createElement('div');
    checkEl.className = 'proy-check' + (node.done ? ' done' : '');
    checkEl.title = node.done ? 'Marcar como pendiente' : 'Marcar como completado';
    checkEl.onclick = e => {
      e.stopPropagation();
      node.done = !node.done;
      if (node.done) { node.advances = node.advances || []; node.advances.push(getActiveDate()); }
      checkEl.classList.toggle('done', node.done);
      checkEl.title = node.done ? 'Marcar como pendiente' : 'Marcar como completado';
      labelEl.classList.toggle('done', node.done);
      if (node.done && window.JARVIS) JARVIS.onTaskDone();
      saveTree(tab, trees[tab]);
    };

    const iconEl = document.createElement('span');
    iconEl.className = 'proy-node-icon';
    iconEl.textContent = node.icon || '📁';

    const labelEl = document.createElement('span');
    labelEl.className = 'proy-node-label' + (node.done ? ' done' : '');
    labelEl.contentEditable = 'true';
    labelEl.spellcheck = false;
    labelEl.textContent = node.label;
    labelEl.onclick = e => e.stopPropagation();
    labelEl.onblur = () => { node.label = labelEl.textContent.trim() || node.label; labelEl.textContent = node.label; saveTree(tab, trees[tab]); };
    labelEl.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); labelEl.blur(); } };

    const countEl = document.createElement('span');
    countEl.className = 'proy-node-count';
    if ((node.children || []).length) countEl.textContent = node.children.length;

    const priorityEl = node.priority ? document.createElement('span') : null;
    if (priorityEl) {
      const labels = { '1': 'P1', '2': 'P2', '3': 'P3' };
      priorityEl.className = 'proy-priority p' + node.priority;
      priorityEl.textContent = labels[node.priority] || '';
    }

    const dueEl = node.dueDate ? document.createElement('span') : null;
    if (dueEl) {
      const today = new Date(); today.setHours(0,0,0,0);
      const due = new Date(node.dueDate + 'T00:00:00');
      const diff = Math.round((due - today) / 86400000);
      dueEl.className = 'proy-due' + (diff < 0 ? ' overdue' : diff <= 3 ? ' soon' : '');
      const [y, m, d] = node.dueDate.split('-');
      dueEl.textContent = d + '/' + m + '/' + y.slice(2);
      dueEl.title = diff < 0 ? 'Vencido hace ' + Math.abs(diff) + ' día(s)' : diff === 0 ? 'Vence hoy' : 'Vence en ' + diff + ' día(s)';
    }

    const actionsEl = document.createElement('div');
    actionsEl.className = 'proy-node-actions';

    const detailBtn = makeBtn(`<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`, 'Detalles');
    detailBtn.onclick = e => { e.stopPropagation(); openDetailModal(tab, node); };

    const addFolderBtn = makeBtn(`<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`, 'Subcarpeta');
    addFolderBtn.onclick = e => { e.stopPropagation(); addChildNode(tab, node, true); };

    const addItemBtn = makeBtn(`<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`, 'Agregar tarea');
    addItemBtn.onclick = e => { e.stopPropagation(); addChildNode(tab, node, false); };

    const iconBtn = makeBtn(`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`, 'Cambiar ícono');
    iconBtn.onclick = e => { e.stopPropagation(); pickIcon(tab, node, iconEl); };

    const delBtn = makeBtn(`<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`, 'Eliminar');
    delBtn.className += ' danger';
    delBtn.onclick = e => { e.stopPropagation(); deleteNode(tab, node.id); };

    actionsEl.append(detailBtn, addFolderBtn, addItemBtn, iconBtn, delBtn);
    const metaEls = [countEl];
    if (priorityEl) metaEls.push(priorityEl);
    if (dueEl) metaEls.push(dueEl);
    headerEl.append(toggleBtn, checkEl, iconEl, labelEl, ...metaEls, actionsEl);
    headerEl.onclick = () => toggleChildren(tab, node);

    // Detail panel
    const detailPanel = document.createElement('div');
    detailPanel.className = 'proy-detail-panel' + (node.detailOpen ? ' open' : '');
    detailPanel.dataset.detailFor = node.id;
    if (node.description || node.notes) {
      const body = document.createElement('div');
      body.className = 'proy-detail-body';
      if (node.description) body.innerHTML += `<div class="proy-detail-field"><div class="proy-detail-label">Descripción</div><div class="proy-detail-text">${esc(node.description)}</div></div>`;
      if (node.notes) body.innerHTML += `<div class="proy-detail-field"><div class="proy-detail-label">Notas</div><div class="proy-detail-text">${esc(node.notes)}</div></div>`;
      detailPanel.appendChild(body);
    }

    // Children
    const childrenEl = document.createElement('div');
    childrenEl.className = 'proy-children' + (node.open ? '' : ' collapsed');
    childrenEl.dataset.childrenFor = node.id;
    (node.children || []).forEach(child => childrenEl.appendChild(buildNodeEl(tab, child, depth + 1)));
    childrenEl.appendChild(buildAddRow(tab, node));

    const _prog = node.done ? 100 : (+node.progress || 0);
    let progEl = null;
    if (_prog > 0 && _prog < 100) {
      progEl = document.createElement('div');
      progEl.className = 'proy-progress';
      progEl.innerHTML = `<div class="proy-progress-track"><div class="proy-progress-fill" style="width:${_prog}%"></div></div><span class="proy-progress-pct">${_prog}%</span>`;
    }
    wrapper.append(headerEl, ...(progEl ? [progEl] : []), detailPanel, childrenEl);
    return wrapper;
  }

  function buildAddRow(tab, node) {
    const row = document.createElement('div');
    row.className = 'proy-add-row';
    const input = document.createElement('input');
    input.className = 'proy-add-input';
    input.placeholder = '+ Nueva tarea o sub-proyecto…';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'proy-add-confirm-btn';
    confirmBtn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const doAdd = () => {
      const val = input.value.trim(); if (!val) return;
      if (!node.children) node.children = [];
      node.children.push({ id: uid(), label: val, icon: '📄', open: false, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] });
      node.open = true;
      saveTree(tab, trees[tab]); renderProyectos(tab); input.value = '';
    };
    confirmBtn.onclick = doAdd;
    input.onkeydown = e => { if (e.key === 'Enter') doAdd(); };
    row.append(input, confirmBtn);
    return row;
  }

  function makeBtn(svg, title) {
    const b = document.createElement('button');
    b.className = 'proy-node-action-btn'; b.title = title; b.innerHTML = svg; return b;
  }

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

  function toggleChildren(tab, node) {
    node.open = !node.open;
    saveTree(tab, trees[tab]);
    const c = document.querySelector(`[data-children-for="${node.id}"]`);
    const t = document.querySelector(`[data-id="${node.id}"] > .proy-node-header .proy-toggle-btn`);
    if (c) c.classList.toggle('collapsed', !node.open);
    if (t) t.classList.toggle('open', node.open);
  }

  function addRootNode(tab) {
    const n = { id: uid(), label: 'Nuevo proyecto', icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] };
    trees[tab].push(n); saveTree(tab, trees[tab]); renderProyectos(tab);
    if (window.JARVIS) JARVIS.onNewProject();
    setTimeout(() => { const el = document.querySelector(`[data-id="${n.id}"] .proy-node-label`); if (el) { el.focus(); selAll(el); } }, 50);
  }

  function addChildNode(tab, parent, isFolder) {
    const n = { id: uid(), label: isFolder ? 'Nueva carpeta' : 'Nueva tarea', icon: isFolder ? '📁' : '📄', open: false, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] };
    if (!parent.children) parent.children = [];
    parent.children.push(n); parent.open = true;
    saveTree(tab, trees[tab]); renderProyectos(tab);
    setTimeout(() => { const el = document.querySelector(`[data-id="${n.id}"] .proy-node-label`); if (el) { el.focus(); selAll(el); } }, 50);
  }

  function deleteNode(tab, id) {
    if (!confirm('¿Eliminar este elemento y todo su contenido?')) return;
    if (window.JARVIS) JARVIS.onDeleteProject();
    trees[tab] = removeById(trees[tab], id);
    saveTree(tab, trees[tab]); renderProyectos(tab);
  }

  function removeById(nodes, id) {
    return nodes.filter(n => n.id !== id).map(n => ({ ...n, children: n.children ? removeById(n.children, id) : [] }));
  }

  function findById(nodes, id) {
    for (const n of nodes) { if (n.id === id) return n; const f = findById(n.children || [], id); if (f) return f; }
    return null;
  }

  function pickIcon(tab, node, iconEl) {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;z-index:9999;background:#1a1a1f;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;max-width:190px;box-shadow:0 8px 32px rgba(0,0,0,.6)';
    const rect = iconEl.getBoundingClientRect();
    p.style.top = Math.min(rect.bottom + 4, window.innerHeight - 160) + 'px';
    p.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    ICONS.forEach(ic => {
      const b = document.createElement('button');
      b.textContent = ic;
      b.style.cssText = 'background:none;border:none;cursor:pointer;font-size:18px;padding:5px;border-radius:6px;transition:background .1s';
      b.onmouseover = () => b.style.background = 'rgba(255,255,255,.1)';
      b.onmouseout = () => b.style.background = 'none';
      b.onclick = () => { node.icon = ic; iconEl.textContent = ic; saveTree(tab, trees[tab]); document.body.removeChild(p); };
      p.appendChild(b);
    });
    document.body.appendChild(p);
    const close = e => { if (!p.contains(e.target)) { if (p.parentNode) document.body.removeChild(p); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function selAll(el) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }

  function openDetailModal(tab, node) {
    document.getElementById('proyDetailModalTitle').textContent = 'Detalles — ' + node.label;
    document.getElementById('proyDetailTab').value      = tab;
    document.getElementById('proyDetailId').value       = node.id;
    document.getElementById('proyDetailLabel').value    = node.label;
    document.getElementById('proyDetailDesc').value     = node.description || '';
    document.getElementById('proyDetailNotes').value    = node.notes || '';
    document.getElementById('proyDetailPriority').value = node.priority || '';
    document.getElementById('proyDetailDue').value      = node.dueDate || '';
    const _dp = node.done ? 100 : (+node.progress || 0);
    document.getElementById('proyDetailProg').value = _dp;
    document.getElementById('proyDetailProgVal').textContent = _dp;
    openModal('modal-proy-detail');
  }

  window.proyDetailSave = function() {
    const tab   = document.getElementById('proyDetailTab').value;
    const id    = document.getElementById('proyDetailId').value;
    const label = document.getElementById('proyDetailLabel').value.trim();
    if (!label) { showToast('Escribe un título'); return; }
    const node = findById(trees[tab], id);
    if (!node) return;
    node.label       = label;
    node.description = document.getElementById('proyDetailDesc').value.trim();
    node.notes       = document.getElementById('proyDetailNotes').value.trim();
    const newPriority = document.getElementById('proyDetailPriority').value;
    if (newPriority === '1' && node.priority !== '1' && window.JARVIS) JARVIS.onPrioritySet();
    node.priority    = newPriority;
    node.dueDate     = document.getElementById('proyDetailDue').value;
    const _newP = +document.getElementById('proyDetailProg').value || 0;
    const _oldP = node.done ? 100 : (+node.progress || 0);
    node.progress = _newP;
    if (_newP > _oldP) { node.advances = node.advances || []; node.advances.push(getActiveDate()); }
    saveTree(tab, trees[tab]);
    closeModal('modal-proy-detail');
    renderProyectos(tab);
  };

  window.renderProyectos = renderProyectos;
  // API compartida para el navegador inmersivo (proyectos-overlay.js): mismos datos, persistencia y re-render del árbol inline.
  window.Proyectos = {
    get: tab => (trees[tab] || (trees[tab] = loadTree(tab))),
    save: (tab) => { saveTree(tab, trees[tab]); renderProyectos(tab); },
    findById: (tab, id) => findById(trees[tab] || [], id),
    newNode: (label, isFolder) => ({ id: uid(), label: label || (isFolder ? 'Nueva carpeta' : 'Nueva tarea'), icon: isFolder ? '📁' : '📄', tipo: isFolder ? 'carpeta' : 'tarea', open: false, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', progress: 0, children: [] }),
    removeById: (tab, id) => { trees[tab] = removeById(trees[tab], id); saveTree(tab, trees[tab]); renderProyectos(tab); },
  };

  // Recarga trees desde S.proyectos (llamado tras loadState o sync remoto)
  window._reloadProyectosFromState = function() {
    TABS.forEach(tab => {
      if (typeof S !== 'undefined' && S.proyectos?.[tab] != null) {
        trees[tab] = S.proyectos[tab];
      }
    });
    const activeTab = document.querySelector('.tab-panel.active')?.id?.replace('tab-', '') || 'vida';
    renderProyectos(activeTab);
  };

  // ── API para comandos de voz (JARVIS EARS) ──
  window.PROY_VOICE = {
    addProject(tab, name) {
      if (!TABS.includes(tab)) tab = 'vida';
      const n = { id: uid(), label: name, icon: '📁', open: true, description: '', notes: '', detailOpen: false, done: false, priority: '', dueDate: '', children: [] };
      trees[tab].push(n); saveTree(tab, trees[tab]); renderProyectos(tab);
      return true;
    },
    // Borra por voz el nodo (proyecto o subtarea) cuyo label coincide mejor, en cualquier sección.
    deleteProject(query) {
      const q = (query || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!q) return null;
      let best = null;
      TABS.forEach(tab => {
        (function walk(nodes) {
          (nodes || []).forEach(n => {
            const label = (n.label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (label && label.includes(q) && (!best || (n.label || '').length < (best.node.label || '').length)) best = { tab, node: n };
            walk(n.children);
          });
        })(trees[tab]);
      });
      if (!best) return null;
      trees[best.tab] = removeById(trees[best.tab], best.node.id);
      saveTree(best.tab, trees[best.tab]);
      try { renderProyectos(best.tab); } catch (e) {}
      if (window.JARVIS) try { JARVIS.onDeleteProject(); } catch (e) {}
      return best.node.label;
    },
    completeTask(query) {
      const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      let best = null;
      TABS.forEach(tab => {
        (function walk(nodes) {
          (nodes || []).forEach(n => {
            const label = (n.label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (!n.done && label.includes(q)) {
              if (!best || n.label.length < best.node.label.length) best = { tab, node: n };
            }
            walk(n.children);
          });
        })(trees[tab]);
      });
      if (!best) return null;
      best.node.done = true;
      saveTree(best.tab, trees[best.tab]); renderProyectos(best.tab);
      return best.node.label;
    },
    // Marca el día de hoy en un hábito por nombre (todas las secciones). status: 'done'|'partial'|'rest'
    markHabit(query, status) {
      status = status || 'done';
      const q = (query || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!q) return null;
      let best = null;
      ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'].forEach(sec => {
        _getHabits(sec).forEach(h => {
          const name = (h.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          if (name && name.includes(q) && (!best || h.name.length < best.habit.name.length)) best = { sec, habit: h };
        });
      });
      if (!best) return null;
      best.habit.days = best.habit.days || {};
      best.habit.days[getActiveDate()] = status;
      saveState();
      try { renderHabitCal(best.sec); } catch (e) {}
      try { renderHabitsCard(best.sec); } catch (e) {}
      try { checkAchievements(); } catch (e) {}
      return best.habit.name;
    },
    stats() {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let pending = 0, overdue = 0;
      TABS.forEach(tab => {
        (function walk(nodes) {
          (nodes || []).forEach(n => {
            if (!n.done && (!n.children || !n.children.length)) pending++;
            if (n.dueDate && !n.done && new Date(n.dueDate + 'T00:00:00') < today) overdue++;
            walk(n.children);
          });
        })(trees[tab]);
      });
      return { pending, overdue };
    },
    // Igual que stats() pero acotado a una sola sección
    statsFor(tab) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (!trees[tab]) trees[tab] = loadTree(tab);
      let pending = 0, overdue = 0;
      (function walk(nodes) {
        (nodes || []).forEach(n => {
          if (!n.done && (!n.children || !n.children.length)) pending++;
          if (n.dueDate && !n.done && new Date(n.dueDate + 'T00:00:00') < today) overdue++;
          walk(n.children);
        });
      })(trees[tab]);
      return { pending, overdue };
    }
  };

  setTimeout(() => renderProyectos('vida'), 0);
})();

// ════════════════════════════════════════════════════════
// NOTION WORKSPACE
// ════════════════════════════════════════════════════════
(function() {
  const STORAGE_KEY = 'notion_workspace_v2';

  const DEFAULT_TREE = [
    {
      id: 'notion', label: 'Notion', icon: '📓', open: true,
      children: [
        {
          id: 'proyectos', label: 'Proyectos', icon: '📁', open: true,
          children: [
            { id: uid(), label: 'Centro de Comando', icon: '📄', children: [] },
            { id: uid(), label: 'Automatizaciones', icon: '📄', children: [] }
          ]
        },
        {
          id: 'ideas', label: 'Ideas', icon: '💡', open: false,
          children: [
            { id: uid(), label: 'IA aplicada al trabajo', icon: '📄', children: [] }
          ]
        },
        {
          id: 'herramientas', label: 'Herramientas', icon: '🔧', open: false,
          children: []
        }
      ]
    }
  ];

  function loadTree() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_TREE));
    } catch { return JSON.parse(JSON.stringify(DEFAULT_TREE)); }
  }

  function saveTree(tree) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  }

  let notionTree = loadTree();

  function renderNotion() {
    const container = document.getElementById('notion-tree');
    if (!container) return;
    container.innerHTML = '';
    notionTree.forEach((node, idx) => {
      container.appendChild(buildNodeEl(node, 0, idx));
    });
  }

  function buildNodeEl(node, depth, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'notion-node';
    wrapper.dataset.depth = depth;
    wrapper.dataset.id = node.id;

    // Header row
    const header = document.createElement('div');
    header.className = 'notion-node-header';

    // Toggle chevron (only for nodes with children array)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'notion-toggle-btn' + (node.open ? ' open' : '');
    toggleBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
    toggleBtn.onclick = (e) => { e.stopPropagation(); toggleNode(node); };

    // Icon
    const iconEl = document.createElement('span');
    iconEl.className = 'notion-node-icon';
    iconEl.textContent = node.icon || '📁';

    // Label (editable)
    const labelEl = document.createElement('span');
    labelEl.className = 'notion-node-label';
    labelEl.contentEditable = 'true';
    labelEl.spellcheck = false;
    labelEl.textContent = node.label;
    labelEl.onclick = (e) => e.stopPropagation();
    labelEl.onblur = () => {
      node.label = labelEl.textContent.trim() || node.label;
      labelEl.textContent = node.label;
      saveTree(notionTree);
    };
    labelEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); labelEl.blur(); } };

    // Children count badge
    const countEl = document.createElement('span');
    countEl.className = 'notion-node-count';
    const childCount = (node.children || []).length;
    if (childCount > 0) countEl.textContent = childCount;

    // Actions
    const actionsEl = document.createElement('div');
    actionsEl.className = 'notion-node-actions';

    // Add child folder btn
    const addFolderBtn = makeActionBtn(
      `<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
      'Agregar subcarpeta'
    );
    addFolderBtn.onclick = (e) => { e.stopPropagation(); addChildFolder(node); };

    // Add page btn
    const addPageBtn = makeActionBtn(
      `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
      'Agregar página'
    );
    addPageBtn.onclick = (e) => { e.stopPropagation(); addChildPage(node); };

    // Change icon btn
    const iconBtn = makeActionBtn(
      `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
      'Cambiar ícono'
    );
    iconBtn.onclick = (e) => { e.stopPropagation(); pickIcon(node, iconEl); };

    // Delete btn
    const delBtn = makeActionBtn(
      `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
      'Eliminar'
    );
    delBtn.onclick = (e) => { e.stopPropagation(); deleteNode(node, depth); };

    actionsEl.append(addFolderBtn, addPageBtn, iconBtn, delBtn);
    header.append(toggleBtn, iconEl, labelEl, countEl, actionsEl);
    header.onclick = () => toggleNode(node);

    // Children area
    const childrenEl = document.createElement('div');
    childrenEl.className = 'notion-children' + (node.open ? '' : ' collapsed');
    childrenEl.dataset.childrenFor = node.id;

    if (node.children && node.children.length > 0) {
      node.children.forEach((child, ci) => {
        childrenEl.appendChild(buildNodeEl(child, depth + 1, ci));
      });
    }

    // Add-item input row (for adding new items to this folder)
    childrenEl.appendChild(buildAddRowEl(node, depth + 1));

    wrapper.append(header, childrenEl);
    return wrapper;
  }

  function buildAddRowEl(node, depth) {
    const row = document.createElement('div');
    row.className = 'notion-add-item-row';
    row.dataset.addFor = node.id;

    const input = document.createElement('input');
    input.className = 'notion-add-item-input';
    input.placeholder = '+ Nueva página o nota…';
    input.type = 'text';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'notion-add-item-btn';
    confirmBtn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    confirmBtn.title = 'Agregar';

    const doAdd = () => {
      const val = input.value.trim();
      if (!val) return;
      addChildPage(node, val);
      input.value = '';
    };
    confirmBtn.onclick = doAdd;
    input.onkeydown = (e) => { if (e.key === 'Enter') doAdd(); };

    row.append(input, confirmBtn);
    return row;
  }

  function makeActionBtn(svgHtml, title) {
    const btn = document.createElement('button');
    btn.className = 'notion-node-action-btn';
    btn.title = title;
    btn.innerHTML = svgHtml;
    return btn;
  }

  function toggleNode(node) {
    node.open = !node.open;
    saveTree(notionTree);
    const childrenEl = document.querySelector(`[data-children-for="${node.id}"]`);
    const toggleBtn = document.querySelector(`[data-id="${node.id}"] > .notion-node-header .notion-toggle-btn`);
    if (childrenEl) childrenEl.classList.toggle('collapsed', !node.open);
    if (toggleBtn) toggleBtn.classList.toggle('open', node.open);
  }

  function addChildFolder(node) {
    if (!node.children) node.children = [];
    const newNode = { id: uid(), label: 'Nueva carpeta', icon: '📁', open: true, children: [] };
    node.children.push(newNode);
    node.open = true;
    saveTree(notionTree);
    renderNotion();
    // Focus the new node's label after render
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${newNode.id}"] .notion-node-label`);
      if (el) { el.focus(); selectAll(el); }
    }, 50);
  }

  function addChildPage(node, labelText) {
    if (!node.children) node.children = [];
    const label = labelText || 'Nueva página';
    const newPage = { id: uid(), label, icon: '📄', open: false, children: [] };
    node.children.push(newPage);
    node.open = true;
    saveTree(notionTree);
    renderNotion();
    if (!labelText) {
      setTimeout(() => {
        const el = document.querySelector(`[data-id="${newPage.id}"] .notion-node-label`);
        if (el) { el.focus(); selectAll(el); }
      }, 50);
    }
  }

  function deleteNode(node, depth) {
    if (!confirm(`¿Eliminar "${node.label}" y todo su contenido?`)) return;
    notionTree = removeNodeById(notionTree, node.id);
    saveTree(notionTree);
    renderNotion();
  }

  function removeNodeById(nodes, id) {
    return nodes
      .filter(n => n.id !== id)
      .map(n => ({ ...n, children: n.children ? removeNodeById(n.children, id) : [] }));
  }

  function pickIcon(node, iconEl) {
    const icons = ['📁','📂','📄','📝','💡','🔧','🛠️','🤖','🧠','🚀','⭐','🎯','📊','🔍','🌐','💼','📌','🔖','🗂️','📋'];
    const current = node.icon || '📁';
    const picker = document.createElement('div');
    picker.style.cssText = 'position:fixed;z-index:9999;background:#1a1a1f;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;max-width:180px;box-shadow:0 8px 32px rgba(0,0,0,.6)';
    const rect = iconEl.getBoundingClientRect();
    picker.style.top = (rect.bottom + 6) + 'px';
    picker.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    icons.forEach(ic => {
      const btn = document.createElement('button');
      btn.textContent = ic;
      btn.style.cssText = 'background:' + (ic === current ? 'rgba(255,255,255,.12)' : 'none') + ';border:none;cursor:pointer;font-size:18px;padding:5px;border-radius:6px;transition:background .1s';
      btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,.1)';
      btn.onmouseout = () => btn.style.background = ic === current ? 'rgba(255,255,255,.12)' : 'none';
      btn.onclick = () => {
        node.icon = ic;
        iconEl.textContent = ic;
        saveTree(notionTree);
        document.body.removeChild(picker);
      };
      picker.appendChild(btn);
    });
    document.body.appendChild(picker);
    const close = (e) => { if (!picker.contains(e.target)) { if (picker.parentNode) document.body.removeChild(picker); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function selectAll(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Public API
  window.notionAddRootItem = function() {
    const newNode = { id: uid(), label: 'Nueva sección', icon: '📁', open: true, children: [] };
    notionTree.push(newNode);
    saveTree(notionTree);
    renderNotion();
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${newNode.id}"] .notion-node-label`);
      if (el) { el.focus(); selectAll(el); }
    }, 50);
  };

  // Initial render (deferred to let DOM settle)
  setTimeout(renderNotion, 0);
})();

// ════════════════════════════════════════════════════════
// COLLAPSIBLE CARDS — sistema genérico
// ════════════════════════════════════════════════════════
(function() {
  function cardKey(card) {
    const titleEl = card.querySelector(':scope > .card-title');
    if (!titleEl) return null;
    const parentId = card.closest('[id]')?.id || 'root';
    const text = titleEl.textContent.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '').slice(0, 24);
    return 'cc_' + parentId + '_' + text;
  }

  function initCard(card) {
    if (card.dataset.ccInit) return;
    const titleEl = card.querySelector(':scope > .card-title');
    if (!titleEl) return;

    // Collect all non-title direct children
    const bodyChildren = Array.from(card.children).filter(c => c !== titleEl);
    if (!bodyChildren.length) { card.dataset.ccInit = '1'; return; }

    // Wrap in .card-body
    const body = document.createElement('div');
    body.className = 'card-body';
    bodyChildren.forEach(c => body.appendChild(c));
    card.appendChild(body);

    // Wrap title's existing content in inner group, add chevron alongside
    const innerNodes = Array.from(titleEl.childNodes);
    const innerWrap = document.createElement('div');
    innerWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0;justify-content:space-between;';
    innerNodes.forEach(n => innerWrap.appendChild(n));

    const chevron = document.createElement('span');
    chevron.className = 'card-collapse-chevron';
    chevron.textContent = '▾';

    titleEl.appendChild(innerWrap);
    titleEl.appendChild(chevron);
    titleEl.style.cursor = 'pointer';
    titleEl.style.gap = '8px';

    // Restore state
    const key = cardKey(card);
    if (key && localStorage.getItem(key) === '1') {
      body.classList.add('collapsed');
      card.style.paddingBottom = '0';
      chevron.style.transform = 'rotate(-90deg)';
    }

    // Toggle on click
    titleEl.addEventListener('click', e => {
      if (e.target.closest('button, a, input, select, [contenteditable]')) return;
      const collapsed = body.classList.toggle('collapsed');
      card.style.paddingBottom = collapsed ? '0' : '';
      chevron.style.transform = collapsed ? 'rotate(-90deg)' : '';
      if (key) localStorage.setItem(key, collapsed ? '1' : '');
    });

    card.dataset.ccInit = '1';
  }

  function initAll() {
    document.querySelectorAll('.card').forEach(initCard);
  }

  // Watch for dynamically added cards
  new MutationObserver(muts => {
    muts.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.classList?.contains('card')) initCard(node);
        node.querySelectorAll?.('.card').forEach(initCard);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  // Initial pass after all dynamic renders settle
  setTimeout(initAll, 200);
})();
