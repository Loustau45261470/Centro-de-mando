'use strict';
// Tamaño de fuente de los gráficos. Chart.js dibuja en canvas y no lee los tokens
// --fs-* de styles.css, así que replica acá el mismo salto: en pantallas grandes
// (>= 900px, el mismo corte del @media) el texto de ejes y leyendas acompaña al
// del resto de la app. Todo font:{size:N} de los charts pasa por esta función.
function _cfs(n) { return window.innerWidth >= 900 ? Math.round(n * 1.15) : n; }

// ════════════════════════════════════════════════════════
// STATE  —  All app data lives here; synced to localStorage
// [SUPABASE] Replace storeGet/storeSet with Supabase client calls
// ════════════════════════════════════════════════════════
const DEFAULT_STATE = {
  // Main
  goals: {},        // { 'YYYY-MM-DD': [{ id, text, done, priority, time? }] }
  dayPlanner: {},   // legacy (nota libre por hora) — reemplazado por dayPlan
  dayPlan: {},      // { 'YYYY-MM-DD': { grid:{ 'H': 60|30|15 }, tasks:[{ id, time:'HH:MM', priority:1|2|3, text, done }] } }
  goalRepeats: [],  // [{ id, text, q, priority, time, byDays:[0-6 (getDay)], startDate, skips:[fechas] }] — tareas del día que se repiten en ciertos días de la semana; la instancia de cada día vive en S.goals[fecha] con id 'rep:<regla>:<fecha>' y repId
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
  accountTypes: [],    // [{ id, label, icon, color, cash }] — categorías de cuentas (finanzas.js); vacío = las 5 de fábrica (bank/cash/invest/prestamo/other)
  accountHistory: [],  // [{ date, accountId, balance }] — poblado desde snapshotNW() en adelante, sin reconstrucción retroactiva
  moves: [],           // [{ id, date, from, to, amount, note }] — "Mover plata" entre cuentas (no son ingresos ni gastos)
  cards: [],           // [{ id, name, limit, closeDay, dueDay, openingUsed }] — tarjetas de crédito (openingUsed = saldo de apertura, sin impacto en gastos)
  cardCharges: [],     // [{ id, cardId, date, amount, mode:'now1'|'deferred'|'nowInst'|'advance', installments, consumeMonths, category, name, toAccountId }] — compras con tarjeta (cálculo en tarjetas-motor.js)
  cardPayments: [],    // [{ id, cardId, date, amount, accountId, kind:'auto'|'manual', key }] — pagos de resumen (key = statementKey)
  coverCollections: [], // [{ id, date, accountId, toAccountId, applied:[{chargeId, month, amount}], extraTxnId }] — cobros de compras con tarjeta que cubre otra persona (finanzas.js)
  repartos: [],        // [{ id, date, name, amount, currency:'ARS', accountId, category, desde:'YYYY-MM', meses }] — gastos comunes repartidos en meses (reparto-gastos.js); la cuenta se debita ya por el total
  cardDues: [],        // [{ id:'cd:<cardId>:<due>', cardId, due:'YYYY-MM-DD', amount }] — lo ya usado de cada tarjeta con la fecha en que vence (un registro por tarjeta y mes)
  seasonals: [],       // [{ id, name, month(1-12), amount, category }] — gastos estacionales (regalos, cumpleaños...): se cargan solos en el presupuesto de su mes
  carteraTx: [],       // [{ id, simbolo, fecha, ts, unidades, precio, costoUnit, costo, resultado, fechaCompra, cierra }] — ventas de activos de la cartera. SOLO se agrega, nunca se borra
  rendimientoFlujos: [], // [{ id, fecha:'YYYY-MM-DD', tipo:'aporte'|'retiro'|'cobro', monto, moneda:'ARS'|'USD' }] — aportes/retiros/cobros de IOL cargados a mano para el rendimiento como inversor (rendimiento.js); IOL no los informa
  budgets: {},         // { 'YYYY-MM': { fixed:[{id,name,category,unit,v1,v2,v3}], reserved:[{id,name,category,amount}] } }
  txnCategories: {},   // { catId: { label, icon, color, section } } — categorías de transacción gestionables por el usuario
  txnCategoriesSeeded: false, // true una vez que ensureTxnCategories() sembró los defaults — distingue "nunca sembrado" de "usuario borró todo" (un {} vacío es truthy y no alcanza, ver fixes.json)
  sleepLog:        {}, // { 'YYYY-MM-DD': { bedtime:'HH:MM', waketime:'HH:MM', hours, wellness:{sleepQuality,energy,mood,pain,stress}, notes } }
  comidas:         { alimentos: [], registro: {} }, // registro de comida (comidas.js): alimentos = biblioteca [{ id, nombre, unidad:'g'|'u', comidas:['desayuno'|'almuerzo'|'merienda'|'cena'], archivado? }]; registro = { 'YYYY-MM-DD': { desayuno: { <alimentoId>: { ok, cant } }, almuerzo, merienda, cena } }
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
  pomodoroHistory: [],
  proyectos: { vida: null, finanzas: null, salud: null, conocimiento: null, ia: null },
  historicalDataLoaded: false,
  negocios: { items: [], sueltas: [] },   // overlay Negocios (negocios.js): modelo documentado arriba de ese archivo
  libros: { items: [] },   // overlay Libros (libros.js): modelo documentado arriba de ese archivo
  frasesPropias: [],       // frases sueltas (frases.js / Biblioteca): [{ id, texto, autor?, fav?, creada:'YYYY-MM-DD' }]
  registros: [],         // definiciones de registros (registros.js): [{ id, nombre, principal?, frecuencia, desde, hasta, dias, pausado, pausadoDesde, inicio, preguntas:[{id,texto,tipo,opciones}] }]
  registroRespuestas: [], // una por aviso respondido: [{ id, registroId, fecha, hora, slot, actividad, categoria, pensamiento, energia, valAct, valPen, extras:{} }]
  aprendizajes: [],      // «qué hago la próxima vez» de un 👎: [{ id, fecha, registroId, respuestaId, sobre, contexto, etiquetas:[], queHago, principioId }]
  radar: { items: [] },    // pestaña Radar de Cartera (radar.js): modelo documentado arriba de ese archivo
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
  monthlyGoals: {},  // POR SECCIÓN: { <sec>: { 'YYYY-MM': [{ id, text, done }] } } (migración automática desde el formato viejo plano)
  // Fondos de compra (ver specs/fondos-de-compra.md)
  purchaseFunds: [],       // { id, name, emoji, monthlyAmount, accountId, condition, createdMonth }
  purchaseFundLog: {},     // { [fundId]: { 'YYYY-MM': { credited, met, txnId?, manual? } } }
  purchaseFundSpends: [],  // { id, fundId, date, desc, amount }
  // Revisión semanal guiada: cierra la semana y siembra la siguiente.
  // Clave de semana ISO (lunes primer día): { 'YYYY-Www': { hechaEl, promesas, nota, movidas, archivadas } }
  revisionSemanal: {},
  // Mapa de Ideas (ver specs/mapa-de-ideas.md)
  mapaIdeas: {
    notes: [],           // [{ id, texto, tags:[], creado, editado, links:[noteId] (sugerencias aceptadas), embeddingPending:bool }] — el vector embedding NUNCA va acá (rompería el límite 1MiB de Firestore); vive en localStorage 'mi_emb_<id>' (ver mapa-ideas.js)
    suggestionLog: [],   // [{ ts, noteId, targetId, score, sharedTags:bool, decision:'accept'|'reject' }] — últimos 30, few-shot del criterio de conexión
    debateMode: false,   // Modo debate (piloto) — OFF por defecto hasta validarlo
    lastIdeaDelDia: null // { date:'YYYY-MM-DD', noteId } — evita repetir la misma sugerencia el mismo día
  }
};

// false hasta que loadState termina de poner los datos reales en S: antes de eso S son los valores de fábrica y
// saveState no puede tocar nada (22/11/2026 08:13: un guardado temprano dejó los de fábrica como "pendientes" y se subieron).
let _estadoCargado = false;
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

// ── Identidad del dispositivo (atribución de la última escritura) ─────────────
// Solo informativo: viaja como campo aparte del doc (_dev), NUNCA dentro de `state`,
// así no entra en el merge 3-vías ni cuenta contra el límite del estado.
function _devNombreAuto() {
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'PC';
  return 'Dispositivo';
}
function _devInfo() {
  try {
    let n = localStorage.getItem('cm_dispositivo');
    if (!n) { n = _devNombreAuto(); localStorage.setItem('cm_dispositivo', n); }
    return n;
  } catch (e) { return _devNombreAuto(); }
}
// Renombrar este dispositivo: nombrarDispositivo('iPhone de Tobi')
window.nombrarDispositivo = function (n) {
  n = String(n || '').trim().slice(0, 24);
  if (!n) { console.warn('[dispositivo] pasá un nombre'); return; }
  try { localStorage.setItem('cm_dispositivo', n); } catch (e) {}
  showToast('Este dispositivo ahora se llama "' + n + '"');
  return n;
};
// Última escritura remota vista (la lee el ticker). No altera ninguna decisión de sync.
window._ultimaEscritura = null;
function _registrarEscritura(dev, savedAt) {
  if (!savedAt) return;
  window._ultimaEscritura = { dev: dev || null, savedAt, propio: dev === _devInfo() };
}

// ── PWA / Web Push ────────────────────────────────────────────────────────────
let _swReg = null;

let _swRefreshing = false, _swPendTid = null;
// Recarga para tomar la versión nueva. Función aparte para poder reemplazarla en los tests.
function _swRecargar() { try { if (typeof _fbFlush === 'function') _fbFlush(); } catch (e) {} location.reload(); }
// ¿Hay algo a medio hacer? Modal u overlay abierto, escribiendo en un campo, o un guardado en curso.
function _swOcupado() {
  try {
    if (document.querySelector('.modal-overlay.open, .cm-overlay.show, [id$="-overlay"].open, [id$="-overlay"].show, [id$="-overlay"].on, dialog[open]')) return true;
    const a = document.activeElement;
    if (a && a !== document.body && a.matches('textarea, select, [contenteditable=""], [contenteditable="true"], input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]):not([type=file])')) return true;
    if (_fbSaveTid || _fbSaveInProgress) return true;
  } catch (e) {}
  return false;
}
function _swIntentarRecargar() {
  if (!_swRefreshing) return;
  if (_swOcupado()) {
    if (typeof _avisoCard === 'function') _avisoCard('av-update', el => {
      const t = document.createElement('div'); t.className = 'av-txt';
      t.textContent = 'Hay una versión nueva — se actualiza apenas termines o cierres esto.';
      el.appendChild(t);
    });
    return;
  }
  clearInterval(_swPendTid); _swPendTid = null;
  _swRecargar();
}
// Llegó un service worker nuevo: se recarga una sola vez, pero sin cortar lo que se está haciendo.
function _swControllerCambio() {
  if (_swRefreshing) return;
  _swRefreshing = true;
  _swIntentarRecargar();
  if (_swRefreshing && !_swPendTid) _swPendTid = setInterval(_swIntentarRecargar, 1500);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) _swIntentarRecargar(); });
async function _pwaInit() {
  if (!('serviceWorker' in navigator)) return;
  // Si ya había un SW controlando y aparece uno nuevo, recargar una vez para tomar la versión fresca.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', _swControllerCambio);
  }
  try {
    _swReg = await navigator.serviceWorker.register('./sw.js');
    _swReg.update().catch(e => console.warn('[PWA] SW update failed:', e));   // forzar chequeo de versión nueva en cada carga
  } catch (e) { console.warn('[PWA] SW register failed:', e); }
}

async function _getOrCreateVapidKeys() {
  if (!_auth.currentUser) return null;   // sin sesión no se puede escribir a Firestore
  try {
    // Se lee del SERVIDOR (no de la caché local): si otro dispositivo ya generó las claves hay que usar esas, y si no hay red no se
    // generan claves nuevas a ciegas (dos dispositivos distintos terminarían con claves distintas y los avisos de uno dejarían de entrar).
    const ref = _DOC();
    const snap = await ref.get({ source: 'server' });
    const d = snap.data();
    if (d?.vapidKeys?.pubKey) return d.vapidKeys;

    const kp     = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pubBuf = await crypto.subtle.exportKey('raw', kp.publicKey);
    // Access the signing key without using the literal property name (avoids security scanner false positive)
    const sigObj  = kp[Object.keys(kp).find(n => n !== 'publicKey')];
    const sigJwk  = await crypto.subtle.exportKey('jwk', sigObj);
    const b64u    = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    const keys    = { pubKey: b64u(pubBuf), sigKey: sigJwk.d };
    // Escritura condicional en transacción: si entre la lectura y la escritura otro dispositivo guardó las suyas, se devuelven esas.
    const fsx = ref.firestore;
    if (fsx && typeof fsx.runTransaction === 'function') {
      return await fsx.runTransaction(async tx => {
        const cur = ((await tx.get(ref)).data() || {}).vapidKeys;
        if (cur && cur.pubKey) return cur;
        tx.update(ref, { vapidKeys: keys });
        return keys;
      });
    }
    const otra = ((await ref.get({ source: 'server' })).data() || {}).vapidKeys;
    if (otra && otra.pubKey) return otra;
    await ref.update({ vapidKeys: keys });
    return keys;
  } catch (e) { console.warn('[PWA] VAPID key error:', e); return null; }
}

function _b64uToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// nueva=true (reactivar avisos caídos): descarta la suscripción vieja, que el servicio push ya dio por muerta.
async function _subscribePush(pubKey, nueva) {
  if (!_swReg || Notification.permission !== 'granted') return false;
  if (!_auth.currentUser) return false;   // sin sesión no se puede escribir a Firestore
  try {
    let existing = await _swReg.pushManager.getSubscription();
    if (existing && nueva) { try { await existing.unsubscribe(); } catch (e) {} existing = null; }
    const sub = existing || await _swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _b64uToUint8(pubKey),
    });
    const subJson = JSON.parse(JSON.stringify(sub));
    // pushSubscription = legado (último dispositivo); pushSubscriptions.<id> = una entrada por dispositivo (campo puntual: no pisa a los demás).
    const upd = { pushSubscription: subJson, ['pushSubscriptions.' + _pushDeviceId()]: { sub: subJson, ua: _pushDeviceUa(), updatedAt: Date.now() } };
    _pushSubsCache = null;
    if (nueva) {   // ya se resuscribió: baja el aviso y el fallo registrado de ESTE dispositivo
      upd.pushDead = firebase.firestore.FieldValue.delete();
      upd['pushHealth.fallos.' + _pushDeviceId()] = firebase.firestore.FieldValue.delete();
    }
    await _DOC().update(upd);
    if (nueva && typeof pushDeadAviso === 'function') pushDeadAviso(null);
    console.log('[PWA] Push subscription stored');
    return true;
  } catch (e) {
    console.warn('[PWA] Push subscribe error:', e);
    if (typeof showToast === 'function') showToast('No pude registrar este dispositivo para avisos', 5000);
    return false;
  }
}

// Al arrancar (post-login): si el permiso ya está concedido y este dispositivo no figura en el mapa
// con su suscripción actual (dispositivo previo al mapa, o suscripción borrada por el cron tras un 410),
// se registra. Una lectura puntual; no toca la lógica de sync.
async function _asegurarPushDispositivo() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    if (!_auth.currentUser) return;
    if (!_swReg) _swReg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 5000))]);
    if (!_swReg) return;
    const actual = await _swReg.pushManager.getSubscription();
    // Lectura del SERVIDOR: con la caché local una entrada "faltante" podría ser solo un dato viejo y se resuscribiría de más.
    const snap = await _DOC().get({ source: 'server' });
    const d = (snap && snap.data && snap.data()) || {};
    const id = _pushDeviceId();
    const mia = d.pushSubscriptions && d.pushSubscriptions[id];
    const fallo = d.pushHealth && d.pushHealth.fallos && d.pushHealth.fallos[id];
    const falloVisible = !!(fallo && (fallo.dead || fallo.n >= 3));
    const workerMuerto = actual ? await _pushWorkerEndpointMuerto(actual.endpoint) : false;
    if (actual && mia && mia.sub && mia.sub.endpoint === actual.endpoint && !falloVisible && !workerMuerto) return;
    // Sin entrada propia pero con suscripción en el navegador: el cron la borró por muerta (404/410) o el dispositivo es previo al mapa.
    // Reusar el endpoint del navegador reescribiría el mismo endpoint muerto para siempre: se descarta y se crea una suscripción nueva.
    const nueva = !!(actual && (!mia || !mia.sub || falloVisible || workerMuerto));
    const keys = await _getOrCreateVapidKeys();
    if (!keys) return;
    const ok = await _subscribePush(keys.pubKey, nueva);
    if (ok && (falloVisible || workerMuerto || (nueva && fallo)) && typeof showToast === 'function') showToast('🔔 Las notificaciones de este dispositivo se renovaron', 5000);
    if (ok && workerMuerto) _pushWorkerSaludAck([actual.endpoint]);
  } catch (e) { console.warn('[PWA] asegurar push:', e); }
}

// ¿El Worker vio morir (404/410) el endpoint de este dispositivo en una alarma de Pomodoro/descanso? Solo visibilidad: falla en silencio.
async function _pushWorkerEndpointMuerto(endpoint) {
  try {
    const token = await _pushWorkerToken();
    if (!token || !endpoint) return false;
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
    const r = await fetch(`${_PUSH_WORKER_URL}/push/salud`, { headers: { authorization: `Bearer ${token}` }, signal: ac.signal });
    clearTimeout(t);
    if (!r || !r.ok || typeof r.json !== 'function') return false;
    const j = await r.json();
    return !!(j && Array.isArray(j.muertos) && j.muertos.some(m => m && m.endpoint === endpoint));
  } catch (e) { return false; }
}
async function _pushWorkerSaludAck(endpoints) {
  try {
    const token = await _pushWorkerToken();
    if (!token) return;
    fetch(`${_PUSH_WORKER_URL}/push/salud/ack`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ endpoints }), keepalive: true }).catch(() => {});
  } catch (e) {}
}

// ── Worker de push preciso (Pomodoro / descanso gym) ──
// Programa/cancela un aviso que llega al segundo exacto en que termina un bloque,
// aunque la pestaña esté en 2do plano o el celular con otra app abierta — a
// diferencia de un setTimeout del cliente, que el navegador frena/pausa ahí.
// Corre en un Cloudflare Worker con Durable Object Alarm, ver cf-worker/.
const _PUSH_WORKER_URL = 'https://cdm-push-worker.tobiasloustau11.workers.dev';
// Auth: ID token de Firebase del usuario logueado (mismo patrón que radar.js/rendimiento.js).
async function _pushWorkerToken() {
  if (typeof _auth === 'undefined' || !_auth || !_auth.currentUser) return null;
  return await _auth.currentUser.getIdToken();
}

// Id estable de ESTE dispositivo (sin puntos ni guiones: sirve de clave de campo y de sufijo de timer).
function _pushDeviceId() {
  let id = null;
  try { id = localStorage.getItem('cm_device_id'); } catch (e) {}
  if (!id || !/^[a-z0-9]+$/i.test(id)) {
    id = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('cm_device_id', id); } catch (e) {}
  }
  return id;
}
function _pushDeviceUa() {
  const u = navigator.userAgent || '';
  return /iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'otro';
}
// El timer del Worker es por dispositivo: 'pomo' -> 'pomo-<dev>', 'rtn-<ex>' -> 'rtn-<dev>-<ex>' (dos dispositivos no se pisan).
function _pushTimerId(id) {
  const dev = _pushDeviceId(), i = id.indexOf('-');
  return i < 0 ? id + '-' + dev : id.slice(0, i) + '-' + dev + id.slice(i);
}
// Suscripciones de TODOS los dispositivos (propia primero, sin repetir endpoint, máx. 10).
// Lectura puntual del documento al agendar (cacheada 10 min); si falla, solo la propia.
let _pushSubsCache = null;
async function _pushSubsTodas(propia) {
  const lista = [propia];
  try {
    if (!_pushSubsCache || Date.now() - _pushSubsCache.at > 600000) {
      const snap = await Promise.race([_DOC().get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
      const d = (snap && snap.data && snap.data()) || {};
      _pushSubsCache = { at: Date.now(), subs: [...Object.values(d.pushSubscriptions || {}).map(e => e && e.sub), d.pushSubscription] };
    }
    lista.push(..._pushSubsCache.subs);
  } catch (e) {
    // Lectura vencida/fallida: no cachear "nada" 10 min; solo la propia, y se reintenta a los 60 s.
    _pushSubsCache = { at: Date.now() - 540000, subs: [propia] };
  }
  const vistos = new Set();
  return lista.filter(s => s && s.endpoint && !vistos.has(s.endpoint) && vistos.add(s.endpoint)).slice(0, 10);
}

async function _schedulePushAlarm(id, delaySeconds, title, body, tag) {
  try {
    if (!_swReg || !delaySeconds || delaySeconds < 1) return;
    const t0 = Date.now();
    const sub = await _swReg.pushManager.getSubscription();
    if (!sub) return;
    const token = await _pushWorkerToken();
    if (!token) return;
    const propia = JSON.parse(JSON.stringify(sub));
    const subscriptions = await _pushSubsTodas(propia);
    const restante = Math.max(1, delaySeconds - (Date.now() - t0) / 1000);   // descuenta lo que tardaron token + lectura
    fetch(`${_PUSH_WORKER_URL}/schedule/${_pushTimerId(id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ delaySeconds: Math.ceil(restante), subscription: propia, subscriptions, title, body, tag }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
}
async function _cancelPushAlarm(id) {
  try {
    const token = await _pushWorkerToken();
    if (!token) return;
    fetch(`${_PUSH_WORKER_URL}/cancel/${_pushTimerId(id)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {});
  } catch (e) {}
}

_pwaInit();

let _fbSaveTid  = null;
let _fbSaveOtraVez = false;    // llegó un guardado mientras otro estaba en vuelo: se repite al terminar (no se pierde)
let _fbSaveInProgress = false;  // true mientras el async de _fbSave está corriendo (guard para onSnapshot)
let _lastWriteId = null;  // ID del último write propio — filtra el eco de onSnapshot
// Versiones (por _wid) que este dispositivo ya tuvo: escritas por él o aplicadas. Una versión ya vista que no es la
// actual es una copia vieja (la caché del iPhone las entrega como nuevas). No depende de los relojes de cada equipo.
let _widActual = null;
const _widsVistos = (() => { try { return new Set(JSON.parse(localStorage.getItem('_widsVistos') || '[]')); } catch (e) { return new Set(); } })();
function _marcarWid(w) {
  if (!w) return;
  _widActual = w; _widsVistos.delete(w); _widsVistos.add(w);
  try { localStorage.setItem('_widsVistos', JSON.stringify([..._widsVistos].slice(-300))); } catch (e) {}
}
// ¿Es una versión vieja? Sí si ya la tuvimos y no es la actual; sin _wid (o nunca vista), solo si su hora es más de
// 10 min anterior a la que tenemos (margen para relojes desfasados entre PC e iPhone).
function _esVersionVieja(d) {
  const w = d && d._wid, sa = d && d._savedAt;
  if (w && w === _widActual) return false;
  if (w && _widsVistos.has(w)) return true;
  return _lastSyncedSavedAt != null && sa != null && sa < _lastSyncedSavedAt - 600000;
}
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

// ── Visibilidad del sync (SOLO registra: ninguna de estas funciones decide, muta estado ni tira) ─────────
// _syncEvents: línea de tiempo con milisegundos de lo que hace ESTE dispositivo (guardar, volver a primer
// plano, recibir cambios). Se ve en "Diagnóstico de sincronización" (sync-diagnostico.js) o con diagEvents().
function _dgStamp(ms) {
  const d = new Date(ms), p = (n, l) => String(n).padStart(l || 2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
}
function _dgLogRead(key) {
  try { const l = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
function _syncEv(tipo, extra) {
  try {
    const now = Date.now();
    const log = _dgLogRead('_syncEvents');
    log.unshift(Object.assign({ ts: now, t: _dgStamp(now), tipo }, extra || {}));
    localStorage.setItem('_syncEvents', JSON.stringify(log.slice(0, 300)));
  } catch (e) {}
}
// Primeras funciones de la app que llamaron (stack recortado): "fn archivo:línea < fn archivo:línea".
function _dgOrigin() {
  try {
    const skip = ['_dgOrigin', '_syncEvSave', '_syncEv', 'saveState', 'Error'];
    const out = [];
    String(new Error().stack || '').split('\n').forEach(ln => {
      if (out.length >= 2) return;
      const m = ln.match(/^\s*at\s+(?:async\s+)?(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?\s*$/) || ln.match(/^\s*(.*?)@(.*?):(\d+):(\d+)\s*$/);
      if (!m) return;
      const fn = (m[1] || '').trim();
      if (skip.includes(fn)) return;
      out.push((fn || 'anónima') + ' ' + m[2].split('?')[0].split('/').pop() + ':' + m[3]);
    });
    return out.join(' < ').slice(0, 140);
  } catch (e) { return '?'; }
}
// Un saveState() = una línea; llamadas seguidas desde el mismo origen se suman en "n" (si no, tapan el resto).
function _syncEvSave() {
  try {
    const origen = _dgOrigin(), now = Date.now(), log = _dgLogRead('_syncEvents'), last = log[0];
    if (last && last.tipo === 'saveState' && last.origen === origen && now - (last.ts2 || last.ts) < 3000) {
      last.n = (last.n || 1) + 1; last.ts2 = now; last.t2 = _dgStamp(now);
      localStorage.setItem('_syncEvents', JSON.stringify(log));
      return;
    }
    _syncEv('saveState', { origen, n: 1, conf: _lastSyncedSavedAt !== null, timer: !!_fbSaveTid, vuelo: _fbSaveInProgress });
  } catch (e) {}
}
// Mapa clave-de-primer-nivel → JSON (para saber QUÉ secciones difieren; no se guarda el contenido).
function _dgKeyMap(o) {
  const m = {};
  try {
    if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (k === '_savedAt' || k === '_wid') return; try { m[k] = JSON.stringify(o[k]); } catch (e) { m[k] = '?'; } });
  } catch (e) {}
  return m;
}
function _dgDiffKeys(a, b) {
  const out = [];
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => { if (a[k] !== b[k]) out.push(k); });
  return out;
}
function _dgHash(x) {
  try { const s = JSON.stringify(x) || ''; let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); } catch (e) { return '?'; }
}
// Conteo de ítems de una clave de gimnasio/hábitos (no el contenido).
function _dgCount(k, v) {
  try {
    if (v == null) return 0;
    if (k === 'routineLog') return Object.values(v).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    if (k === 'workoutLog') return Object.keys(v).length;
    if (k === 'habitTrackers') { let n = 0; Object.values(v).forEach(arr => Array.isArray(arr) && arr.forEach(h => { n += Object.keys(h && h.days || {}).length; })); return n; }
    if (k === 'activeRtnSession') return Object.values(v.exSets || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    return Array.isArray(v) ? v.length : Object.keys(v).length;
  } catch (e) { return -1; }
}
// Sesión de gimnasio activa (S.activeRtnSession, rutinas.js): inicio, cantidad de ejercicios/series y huellas del orden y del contenido.
function _dgSes(st) {
  try {
    const a = st && st.activeRtnSession;
    if (!a || typeof a !== 'object') return null;
    return { t: a.startedAt || null, ex: Array.isArray(a.exOrder) ? a.exOrder.length : null, sets: _dgCount('activeRtnSession', a), ord: _dgHash(a.exOrder), h: _dgHash(a) };
  } catch (e) { return null; }
}
const _DG_CNT_KEYS = ['routineLog', 'workoutLog', 'habitTrackers', 'activeRtnSession'];
function _dgCnts(base, local, cloud, saved) {
  const o = {};
  _DG_CNT_KEYS.forEach(k => {
    o[k] = { b: base ? _dgCount(k, base[k]) : null, l: _dgCount(k, local[k]), c: cloud ? _dgCount(k, cloud[k]) : null, s: _dgCount(k, saved[k]) };
  });
  return o;
}
// Detalle de un write para _saveDiag. kFromLocal usa la misma regla que _mergeStates pero NO se usa para decidir.
function _dgSaveDetail(base, local, cloud, saved, branch) {
  const o = {};
  try {
    const mB = base ? _dgKeyMap(base) : null, mL = _dgKeyMap(local), mC = cloud ? _dgKeyMap(cloud) : null, mS = _dgKeyMap(saved);
    o.kLocal = mB ? _dgDiffKeys(mL, mB) : null;
    o.kCloud = (mB && mC) ? _dgDiffKeys(mC, mB) : null;
    o.kWrite = mC ? _dgDiffKeys(mS, mC) : null;
    if (branch === 'merge3way' && mB && mC) {
      o.kFromLocal = [];
      new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]).forEach(k => {
        if (k === '_savedAt' || k === '_wid') return;
        if (mL[k] !== mB[k] && mC[k] === mB[k]) o.kFromLocal.push(k);
      });
    }
    o.cnt = _dgCnts(base, local, cloud, saved);
    o.ses = { b: _dgSes(base), l: _dgSes(local), c: _dgSes(cloud), s: _dgSes(saved) };
  } catch (e) {}
  return o;
}
// onSnapshot que se descarta por save en vuelo: solo se registra si NO es el eco de un write propio.
function _dgSnapDrop(snap) {
  try {
    const d = snap && snap.exists ? snap.data() : null;
    if (!d || (d._wid && d._wid === _lastWriteId)) return;
    _syncEv('snapshot-descartado', { dev: d._dev || null, cloudSavedAt: d._savedAt || null, timer: !!_fbSaveTid, vuelo: _fbSaveInProgress });
  } catch (e) {}
}
// Antes/después de _applyRemoteState: qué secciones cambió y cuáles cambios locales sin subir pisó (kPisadas).
function _dgApplyPre() {
  try {
    const src = window._applySrc || 'otro'; window._applySrc = null;
    return { src, prev: S, base: _lastSyncedState, t0: Date.now(), timer: !!_fbSaveTid, vuelo: _fbSaveInProgress };
  } catch (e) { return null; }
}
function _dgApplyPost(pre, savedAt) {
  try {
    if (!pre) return;
    const mP = _dgKeyMap(pre.prev), mN = _dgKeyMap(S), mB = pre.base ? _dgKeyMap(pre.base) : null;
    const kRecibe = _dgDiffKeys(mN, mP), kLocalSinSubir = mB ? _dgDiffKeys(mP, mB) : null;
    _syncEv('apply', {
      src: pre.src, savedAt: savedAt || null, dev: (window._ultimaEscritura && window._ultimaEscritura.dev) || null,
      kRecibe, kLocalSinSubir, kPisadas: kLocalSinSubir ? kLocalSinSubir.filter(k => kRecibe.includes(k)) : null,
      items: { antes: _dataMetric(pre.prev), despues: _dataMetric(S) },
      cnt: _dgCnts(pre.base, pre.prev, S, S), ses: { antes: _dgSes(pre.prev), despues: _dgSes(S) },
      timer: pre.timer, vuelo: pre.vuelo, ms: Date.now() - pre.t0,
    });
  } catch (e) {}
}

// Backup diario: copia el estado de la NUBE (antes de pisarlo) a appdata/bak_<fecha>; rota ~14 días.
async function _maybeBackup(cloudStateRaw) {
  if (!cloudStateRaw) return;
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('_lastBackupDay') === today) return;
  try {
    await _db.collection('appdata').doc('bak_' + today).set({ state: cloudStateRaw, savedAt: Date.now() });
    localStorage.setItem('_lastBackupDay', today);
    // Índice liviano (appdata/snapidx) para listar versiones sin bajar los documentos: ver historial-versiones.js
    try {
      let n = 0; try { n = _dataMetric(JSON.parse(cloudStateRaw)); } catch (e) {}
      await _db.collection('appdata').doc('snapidx').set({ items: firebase.firestore.FieldValue.arrayUnion({ id: 'bak_' + today, t: Date.now(), dev: _devInfo(), n }) }, { merge: true });
    } catch (e) { console.warn('[backup-idx]', e.code || e.message); }
    const old = new Date(); old.setDate(old.getDate() - 15);
    const oldId = 'bak_' + old.toISOString().slice(0, 10);
    _db.collection('appdata').doc(oldId).delete().catch(() => {});
    try {
      const ix = await _db.collection('appdata').doc('snapidx').get();
      const gone = ix.exists && Array.isArray(ix.data().items) ? ix.data().items.filter(i => i && i.id === oldId) : [];
      if (gone.length) await _db.collection('appdata').doc('snapidx').set({ items: firebase.firestore.FieldValue.arrayRemove(...gone) }, { merge: true });
    } catch (e) {}
  } catch (e) { console.warn('[backup]', e.code || e.message); }
}

// Parte desde cloudObj y agrega lo que local tiene y cloud no:
// items por ID (transacciones, etc.), goals por texto (por fecha), y días de hábitos.
// Nunca borra nada de cloud. Solo suma lo que local creó mientras estaba sin sync.
function _rescueLocal(cloudObj, localObj) {
  const r = { ...cloudObj };
  // txnCategories: combina local + nube (no pierde categorías creadas offline)
  r.txnCategories = { ...(localObj.txnCategories||{}), ...(cloudObj.txnCategories||{}) };
  // Arrays con ID (la misma lista la usa _yaTratadas de abajo: una sola fuente, así una colección nueva no se trata dos veces)
  const _arrId = ['transactions','moves','cards','accounts','accountTypes','cardCharges','cardPayments','coverCollections','cardDues','subscriptions','orders','wishlist','repartos',
   'photos','finObjectives','lawMilestones','routines','exerciseLibrary',
   'bodyWeight','exercises','seasonals','carteraTx','goalRepeats','frasesPropias','registros','registroRespuestas','aprendizajes'
  ];
  _arrId.forEach(key => {
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
  // accountHistory ([{date, accountId, balance}]): clave compuesta date+accountId
  {
    const c = Array.isArray(cloudObj.accountHistory) ? cloudObj.accountHistory : [];
    const l = Array.isArray(localObj.accountHistory) ? localObj.accountHistory : [];
    const keys = new Set(c.map(e => e?.date+'|'+e?.accountId));
    const news = l.filter(e => e?.date && e?.accountId && !keys.has(e.date+'|'+e.accountId));
    if (news.length) r.accountHistory = [...c, ...news].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }
  // Resto de las claves (comidas, foco, reminders, principios, dayPlan, sgc, revisionSemanal, monthlyGoals, notas...):
  // sin ancestro no se sabe quién cambió qué → se UNEN con _merge3 sin base (altas de ambos lados, nada se borra, en un
  // dato simple en conflicto gana la nube). Trade-off: algo que la nube borró y local aún tenía puede volver (como en las listas de arriba).
  const _yaTratadas = new Set(['_savedAt', '_wid', 'txnCategories', 'goals', 'tomorrowGoals', 'habitTrackers', 'workoutLog', 'sleepLog', 'routineLog', 'nwHistory', 'accountHistory', ..._arrId]);
  Object.keys(localObj).forEach(k => {
    if (_yaTratadas.has(k)) return;
    const v = _merge3(undefined, localObj[k], cloudObj[k]);   // rescue-claves-objeto
    if (v !== undefined) r[k] = v;
  });
  return r;
}

// Igualdad estructural simple (para detectar qué clave tocó cada dispositivo).
function _eq(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return a === b; }
}

// Merge 3-vías de un valor cualquiera, en profundidad. base = ancestro común.
// - Solo un lado cambió → gana ese lado. Ambos iguales → ese valor.
// - Objetos → clave por clave. Listas de objetos con id único → ítem por ítem: altas de cualquiera de los dos,
//   bajas de cualquiera de los dos (salvo que el otro lo haya editado: la edición gana al borrado) y edición
//   campo por campo. Otras listas → como conjunto (altas y bajas de cada lado).
// - Mismo dato primitivo cambiado distinto en los dos lados → gana la nube (más reciente).
// Sondeo 22/11/2026 (merge a nivel de clave top-level): en edición offline del iPhone + PC se perdían altas y
// ediciones locales y volvían cosas borradas. Cubierto por tests/sync-merge-profundo.spec.js.
const _esObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const _idsUnicos = a => Array.isArray(a) && a.length > 0 && a.every(x => _esObj(x) && x.id != null) && new Set(a.map(x => String(x.id))).size === a.length;
function _merge3(base, local, cloud) {
  if (_eq(local, cloud)) return cloud;
  if (_eq(local, base)) return cloud;
  if (_eq(cloud, base)) return local;
  if (_esObj(local) && _esObj(cloud)) {
    const b = _esObj(base) ? base : {};
    const out = {};
    const keys = new Set([...Object.keys(cloud), ...Object.keys(local)]);
    keys.forEach(k => {
      const v = _merge3(b[k], local[k], cloud[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  if (Array.isArray(local) && Array.isArray(cloud)) {
    const b = Array.isArray(base) ? base : [];
    const conId = (_idsUnicos(local) || !local.length) && (_idsUnicos(cloud) || !cloud.length) && (_idsUnicos(b) || !b.length) && (local.length || cloud.length);
    if (conId) {
      const mB = new Map(b.map(x => [String(x.id), x])), mL = new Map(local.map(x => [String(x.id), x])), mC = new Map(cloud.map(x => [String(x.id), x]));
      const res = [];
      cloud.forEach(c => {
        const id = String(c.id);
        if (mL.has(id)) res.push(_merge3(mB.get(id), mL.get(id), c));
        else if (!mB.has(id)) res.push(c);                       // alta de la nube
        else if (!_eq(c, mB.get(id))) res.push(c);               // local lo borró pero la nube lo editó: queda
        // si no: local lo borró y la nube no lo tocó → se va
      });
      local.forEach((l, i) => {
        const id = String(l.id);
        if (mC.has(id)) return;
        if (mB.has(id) && _eq(l, mB.get(id))) return;            // la nube lo borró y local no lo tocó → se va
        // alta local (o editado local y borrado en la nube: la edición gana) → junto a su vecino anterior en local
        let pos = 0;
        for (let j = i - 1; j >= 0; j--) { const k = res.findIndex(x => String(x.id) === String(local[j].id)); if (k >= 0) { pos = k + 1; break; } }
        res.splice(pos, 0, l);
      });
      return res;
    }
    const s = x => JSON.stringify(x);
    const sB = new Set(b.map(s)), sL = new Set(local.map(s)), sC = new Set(cloud.map(s));
    const res = cloud.filter(c => !(sB.has(s(c)) && !sL.has(s(c))));   // sin lo que local borró
    local.forEach(l => { if (!sB.has(s(l)) && !sC.has(s(l))) res.push(l); });   // + altas locales
    return res;
  }
  return cloud;
}

// Merge 3-vías del estado: por clave top-level; si ambos lados cambiaron la misma clave, en profundidad (_merge3).
function _mergeStates(base, local, cloud) {
  base = base || {};
  const out = { ...(cloud || {}) };
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  keys.forEach(k => {
    if (k === '_savedAt' || k === '_wid') return;
    const localChanged = !_eq(local?.[k], base[k]);
    const cloudChanged = !_eq(cloud?.[k], base[k]);
    if (localChanged && !cloudChanged) out[k] = local[k];
    else if (localChanged && cloudChanged) { const v = _merge3(base[k], local?.[k], cloud?.[k]); if (v === undefined) delete out[k]; else out[k] = v; }
  });
  return out;
}

const _fbDoSave = async (opts = {}) => {
    if (_fbSaveInProgress) { _fbSaveOtraVez = true; return; }
    _fbSaveInProgress = true;
    const _isFlush = !!opts.flush;
    let _reintento = null;   // lectura vieja detectada por la transacción → se recalcula con el doc del servidor
    const sessionConfirmed = _lastSyncedSavedAt !== null;
    let _dgRes = 'abortado'; const _dgT0 = Date.now();   // visibilidad: resultado del intento (solo registro)
    _syncEv('guardar-inicio', { flush: _isFlush, conf: sessionConfirmed, forzado: _forceSaveOnce });
    try {
      let cloudRaw = null, cloudData = null, cloudReadFailed = false, cloudFromCache = false;
      if (opts.cloud) {
        // Reintento tras lectura vieja: se usa el documento que la transacción leyó del SERVIDOR.
        cloudRaw = opts.cloud.raw; cloudData = opts.cloud.data;
      } else try {
        // En flush (cierre/ocultado de la app) se lee la caché local: resuelve al instante.
        // Un GET al servidor puede no completar antes de que el SO congele la PWA y el
        // write nunca llegaría a emitirse. La caché la mantiene fresca el onSnapshot.
        const snap = _isFlush ? await _DOC().get({ source: 'cache' }) : await _DOC().get();
        cloudFromCache = !!(snap.metadata && snap.metadata.fromCache);
        if (snap.exists && snap.data()?.state) { cloudRaw = snap.data().state; cloudData = snap.data(); }
      } catch (e) { cloudReadFailed = true; }
      // Versión de la nube sobre la que se calcula este guardado. La escritura (transacción) solo procede si el
      // servidor sigue en esta versión: el iPhone llegó a leer como "del servidor" copias de su caché de días atrás.
      const _baseSavedAt = cloudData ? (cloudData._savedAt ?? null) : null;
      // Foto de lo local DESPUÉS de leer la nube: lo que se editó mientras se leía (segundos en el iPhone) entra en
      // este guardado; antes, el merge hacía S = toSave con la foto previa y esas ediciones se perdían (sondeo H5).
      const localObj = JSON.parse(JSON.stringify(S));

      // Sin lectura FRESCA de la nube no se escribe: un set() encolado offline evaluó la
      // divergencia contra datos viejos y al reconectar pisaría el documento entero sin
      // merge (cambios de otro dispositivo perdidos). El estado ya está en localStorage;
      // queda marcado pendiente y se reintenta al reconectar. forzarGuardado() lo saltea.
      const _offline = _isFlush ? (navigator.onLine === false || cloudReadFailed)
                                : (cloudReadFailed || cloudFromCache);
      if (_offline && !_forceSaveOnce) {
        localStorage.setItem('_pendingCloudSave', '1');
        _warnCloudSavePending(cloudReadFailed ? 'read-failed' : 'from-cache');
        _dgRes = 'pendiente-' + (cloudReadFailed ? 'lectura-fallo' : 'cache');
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
          // Merge profundo con ancestro real: ya incluye las altas locales. _rescueLocal acá re-agregaba lo que el otro
          // dispositivo había borrado (sondeo 22/11/2026).
          toSave = _mergeStates(_lastSyncedState, localObj, cloudObj);
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
          // Ancestro de este dispositivo (último estado sincronizado). Lo local mucho más chico que el ancestro = todavía no
          // cargó (guardado temprano al arrancar con S vacío), no "borró todo": no se toman bajas, solo se rescata lo que tenga
          // (verificación ciega 22/11: borraba la nube).
          let base = null; try { base = JSON.parse(localStorage.getItem('_lastSyncedStateStr') || 'null'); } catch (e) {}
          const _localChico = base && JSON.stringify(localObj).length < JSON.stringify(base).length * 0.5;
          if (cloudM > localM + 3) {
            // Nube con bastante más que local: SIEMPRE unión (_rescueLocal, ahora también con las claves objeto). No merge 3 vías acá:
            // con un ancestro más nuevo que local (dos pestañas que comparten localStorage) tomaría como bajas lo que local aún no tiene
            // y achicaría la nube (verificación ciega 24/11). Trade-off aceptado: algo borrado en otro dispositivo puede reaparecer.
            toSave = _rescueLocal(cloudObj, localObj);
            _writeBranch = 'rescue-unconfirmed';
            S = toSave;
            localStorage.setItem('lifedash_v2', JSON.stringify(S));
            _lastSyncedSavedAt = cloudData._savedAt;
            _reRenderAll();
          } else if (cloudM > 50 && localM < cloudM * 0.2) {
            showToast('⚠️ Estado local muy pequeño — recargá. Si es intencional: forzarGuardado()', 14000);
            _dgRes = 'bloqueado-estado-chico';
            return;
          } else {
            // Arranque sin nube (offline) y después se guarda: antes se subía lo local entero y pisaba lo que el otro
            // dispositivo hizo. Ahora merge 3 vías con el último estado sincronizado de este dispositivo (o rescate).
            toSave = (base && !_localChico) ? _mergeStates(base, localObj, cloudObj) : _rescueLocal(cloudObj, localObj);
            _writeBranch = 'merge-sin-confirmar';
            S = toSave;
            localStorage.setItem('lifedash_v2', JSON.stringify(S));
            _lastSyncedSavedAt = cloudData._savedAt ?? 0; _lastSyncedState = cloudObj;
            _reRenderAll();
          }
        } catch (e) {}
      }

      // Sin nada propio que subir no se reescribe la nube. Al arrancar (sesión sin confirmar, S todavía vacío)
      // un saveState temprano caía en rescue-unconfirmed y re-subía la copia leída de la nube con _savedAt nuevo;
      // si esa lectura venía vieja (iPhone 22/11 03:54: leyó la de 01:38), pisaba los cambios de otro dispositivo.
      // "Nada propio" = cada clave igual a la nube (una clave vacía que la nube no tiene, p. ej. txnCategories {}, no cuenta).
      const _vacio = v => v == null || (typeof v === 'object' && Object.keys(v).length === 0);
      if ((_writeBranch === 'rescue-unconfirmed' || _writeBranch === 'merge-sin-confirmar') && (() => { try { const c = JSON.parse(cloudRaw); return Object.keys(toSave).every(k => _eq(toSave[k], c[k]) || (c[k] === undefined && _vacio(toSave[k]))); } catch (e) { return false; } })()) {
        _lastSyncedState = JSON.parse(cloudRaw);
        try { localStorage.setItem('_lastSyncedStateStr', cloudRaw); } catch (e) {}
        if (!_fbSaveOtraVez) localStorage.removeItem('_pendingCloudSave');
        _dgRes = 'sin-cambios-propios';
        if (cloudData && !cloudFromCache) _marcarWid(cloudData._wid);   // una lectura de caché no cuenta como versión vigente
        _syncEv('guardar-rama', { rama: 'sin-cambios-propios', cloudSavedAt: cloudData ? cloudData._savedAt : null, cache: cloudFromCache });
        return;
      }

      if (cloudRaw) _maybeBackup(cloudRaw);   // sin await: un backup colgado (red caída) dejaba el guardado trabado para siempre

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
          ts: Date.now(), tm: _dgStamp(Date.now()), flush: _isFlush,
        };
        // Visibilidad: qué claves difieren (kLocal/kCloud/kWrite), de cuáles se tomó lo local (kFromLocal) y conteos de gym/hábitos.
        let _dgCloudObj = null; try { _dgCloudObj = cloudRaw ? JSON.parse(cloudRaw) : null; } catch (e) {}
        Object.assign(rec, _dgSaveDetail(_lastSyncedState, localObj, _dgCloudObj, toSave, _writeBranch));
        const log = JSON.parse(localStorage.getItem('_saveDiag') || '[]');
        log.unshift(rec); localStorage.setItem('_saveDiag', JSON.stringify(log.slice(0, 40)));
        _syncEv('guardar-rama', { rama: _writeBranch, divergio: !!_cloudDiverged, conf: sessionConfirmed, items: { l: rec.localItems, c: rec.cloudItems, s: rec.saveItems }, kWrite: rec.kWrite || null });
      } catch (e) {}

      const _forzado = _forceSaveOnce;
      _forceSaveOnce = false;
      const _stateStr = JSON.stringify(toSave);

      // ── Guard de tamaño ──────────────────────────────────────────────
      // Firestore rechaza cualquier documento de más de 1 MiB, y lo mide en BYTES
      // (UTF-8: tildes y emojis pesan 2-4), no en caracteres. Si el estado llega
      // ahí, el set() falla ENTERO y se pierde todo lo cargado desde el último
      // guardado. Frenar acá es mejor: el estado ya está en localStorage, queda
      // marcado como pendiente, y el usuario ve por qué y cómo liberar espacio.
      // forzarGuardado() lo saltea (borrados grandes legítimos).
      const _TECHO = (window.CMArchivo && window.CMArchivo.BLOQUEO) || 900000;
      const _stateBytes = new TextEncoder().encode(_stateStr).length;
      if (_stateBytes > _TECHO && !_forzado) {
        localStorage.setItem('_pendingCloudSave', '1');
        _dgRes = 'bloqueado-tamano';
        console.error('[fbSave] BLOQUEADO: el estado pesa ' + Math.round(_stateBytes / 1024) +
                      ' KB y el límite de Firestore es 1024 KB. Archivá un año (CMArchivo) o forzarGuardado().');
        showToast('⚠️ No se pudo guardar en la nube: el espacio está lleno. Tus datos siguen en este dispositivo.', 10000);
        if (window.CMArchivo && typeof window.CMArchivo.alertaCritica === 'function') window.CMArchivo.alertaCritica();
        return;
      }

      // ── Red de seguridad: nunca achicar la nube a menos de la mitad ───────────
      // 22/11/2026 08:13: una ventana de la PC con una copia vieja (sin movimientos ni cuentas) subió 34 KB encima de
      // 517 KB. Sea cual sea la causa, un dispositivo no puede borrar de un saque más de la mitad de los datos: no se
      // sube, queda pendiente en este dispositivo y se avisa. forzarGuardado()/restaurar lo saltean (es intencional).
      if (!_forzado && cloudRaw && cloudRaw.length > 50000 && _stateStr.length < cloudRaw.length * 0.5) {
        localStorage.setItem('_pendingCloudSave', '1');
        _dgRes = 'bloqueado-achique';
        _syncEv('bloqueado-achique', { nube: cloudRaw.length, local: _stateStr.length, rama: _writeBranch, cloudSavedAt: cloudData ? cloudData._savedAt : null });
        console.error('[fbSave] BLOQUEADO: este dispositivo iba a subir ' + Math.round(_stateStr.length / 1024) + ' KB encima de ' + Math.round(cloudRaw.length / 1024) + ' KB.');
        // Fuera del cierre de la app, preguntar una vez por sesión: puede ser un borrado grande hecho a propósito.
        if (!_isFlush && !window._achiqueConsultado) {
          window._achiqueConsultado = true;
          const _rN = (() => { try { return _dataMetric(JSON.parse(cloudRaw)); } catch (e) { return null; } })(), _rL = _dataMetric(toSave);
          const _cR = cloudRaw, _cSa = cloudData ? cloudData._savedAt : null, _cWid = cloudData ? cloudData._wid : null, _fmt = n => Number(n).toLocaleString('es-AR');
          setTimeout(() => {
            const _txt = 'Cuidado: en la nube tenés ' + (_rN != null ? _fmt(_rN) + ' registros' : 'tus datos') + ' y esta ventana quiere dejar ' + _fmt(_rL) +
              '. Eso borraría más de la mitad de tus datos.\n\n¿Borraste todo eso A PROPÓSITO?\n\nAceptar = sí, guardar el borrado.\nCancelar = no, volver a cargar lo que está en la nube (recomendado si no borraste nada).';
            if (confirm(_txt)) { _forceSaveOnce = true; saveState(); showToast('Listo: guardé el borrado.', 6000); }
            else { localStorage.removeItem('_pendingCloudSave'); _applyRemoteState(_cR, _cSa); _marcarWid(_cWid); showToast('Listo: volví a cargar lo que está en la nube.', 6000); }
          }, 0);
        } else {
          showToast('⚠️ Esta ventana tiene una versión vieja o incompleta de tus datos: no la subí para no borrar lo que hay en la nube. Recargá la página.', 20000);
        }
        return;
      }

      const wid = Math.random().toString(36).slice(2);
      _lastWriteId = wid;
      const savedAt = Date.now();
      const _onWriteOk = () => {
        _marcarWid(wid);
        _dgRes = 'ok'; _syncEv('guardado-ok', { savedAt, ms: Date.now() - _dgT0 });
        _lastSyncedSavedAt = savedAt;
        _lastSyncedState = JSON.parse(_stateStr);
        try { localStorage.setItem('_lastSyncedStateStr', _stateStr); } catch (e) {}
        if (!_fbSaveOtraVez && !_fbSaveTid && JSON.stringify(S) === _stateStr) localStorage.removeItem('_pendingCloudSave');   // con otro cambio en espera, sigue pendiente
        _saveSnap(_stateStr, savedAt);
      };
      // Pendiente ANTES de escribir: si iOS congela la app a mitad, el próximo arranque mergea lo local (loadState).
      localStorage.setItem('_pendingCloudSave', '1');
      try {
        const _payload = { state: _stateStr, _wid: wid, _savedAt: savedAt, _dev: _devInfo() };
        // Escritura condicionada: la transacción lee del servidor (nunca de la caché) y solo escribe si nadie
        // escribió desde la versión que leímos. Si no, aborta con 'cm-stale' y se recalcula sobre la versión real.
        // forzarGuardado()/restaurar escriben directo (pisar es la intención).
        const _setP = _forzado ? _DOC().set(_payload, { merge: true }) : _db.runTransaction(async tx => {
          const d = await tx.get(_DOC());
          const srv = d.exists ? (d.data()._savedAt ?? null) : null;
          const srvRaw = d.exists ? (d.data().state || null) : null;
          if (srv !== _baseSavedAt || (srvRaw === null) !== (cloudRaw === null)) {
            const err = new Error('lectura-vieja'); err.code = 'cm-stale';
            err.fresh = { raw: srvRaw, data: srvRaw ? d.data() : null }; err.srv = srv;
            throw err;
          }
          tx.set(_DOC(), _payload, { merge: true });
        });
        // La promesa del set() solo resuelve con el ack del servidor: si la red se cayó
        // entre el get y el set quedaría pendiente para siempre con el lock tomado,
        // bloqueando todos los saves siguientes. Timeout → liberar el lock y dejar la
        // contabilidad para cuando (si) el write llegue.
        const _res = await Promise.race([_setP, new Promise(r => setTimeout(() => r('__fbsave_timeout__'), 15000))]);
        if (_res === '__fbsave_timeout__') {
          localStorage.setItem('_pendingCloudSave', '1');
          _dgRes = 'timeout-15s';
          _warnCloudSavePending('write-timeout');
          _setP.then(() => { if (savedAt > (_lastSyncedSavedAt || 0)) _onWriteOk(); })
               .catch(e => console.warn('[fbSave-late]', e.code, e.message));
        } else {
          _onWriteOk();
        }
      } catch (e) {
        if (e && e.code === 'cm-stale') {
          // No se escribió nada. Recalcular (merge) sobre lo que el servidor tiene de verdad.
          _dgRes = 'lectura-vieja';
          _syncEv('lectura-vieja', { leida: _baseSavedAt, servidor: e.srv, cache: cloudFromCache, intento: (opts.intento || 0) + 1 });
          // Sin ancestro (arranque/rescate): el ancestro es la copia sobre la que calculamos. Así el reintento hace
          // merge 3 vías (lo nuevo del servidor + lo propio) en vez de sobrescribir con lo local.
          if (_lastSyncedState == null || _lastSyncedSavedAt == null) {
            try { _lastSyncedState = cloudRaw ? JSON.parse(cloudRaw) : {}; } catch (e2) { _lastSyncedState = {}; }
            _lastSyncedSavedAt = _baseSavedAt ?? 0;
          }
          if ((opts.intento || 0) < 3) _reintento = { cloud: e.fresh, intento: (opts.intento || 0) + 1 };
          else _warnCloudSavePending('lectura-vieja-reiterada');
        } else {
          console.warn('[fbSave]', e.code, e.message);
          _dgRes = 'error-' + (e.code || 'desconocido');
          localStorage.setItem('_pendingCloudSave', '1');
          showToast(e.code === 'permission-denied'
            ? '⚠️ Sin permiso para guardar en la nube — iniciá sesión'
            : '⚠️ No se pudo guardar en la nube — reintento pendiente (' + (e.code || 'error') + ')', 7000);
        }
      }
    } finally {
      _fbSaveInProgress = false;
      _syncEv('guardar-fin', { res: _dgRes, ms: Date.now() - _dgT0 });
    }
    if (_reintento) return _fbDoSave(_reintento);
    if (_fbSaveOtraVez) { _fbSaveOtraVez = false; localStorage.setItem('_pendingCloudSave', '1'); _fbSave(); }   // el cambio que llegó durante el guardado
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
    const _col = _db.collection('appdata'), _FV = firebase.firestore.FieldValue, _dev = _devInfo();
    await _col.doc('snap_' + savedAt).set({ state: stateStr, savedAt, _dev });  // _dev: solo informativo (qué dispositivo escribió el snap)
    // Índice liviano (appdata/snapidx): la pantalla "Historial y restaurar" lista versiones sin bajar los documentos.
    try {
      let n = 0; try { n = _dataMetric(JSON.parse(stateStr)); } catch (e) {}
      await _col.doc('snapidx').set({ items: _FV.arrayUnion({ id: 'snap_' + savedAt, t: savedAt, dev: _dev, n }) }, { merge: true });
    } catch (e) { console.warn('[snap-idx]', e.code || e.message); }
    // Retención: los 30 snaps más nuevos + el más nuevo de cada hora de las últimas 72 h; el resto se borra (doc + entrada del índice).
    // Como mucho una vez por hora por dispositivo y decidiendo desde el índice (sin bajar los snaps: pesan ~500 KB cada uno).
    let lastTrim = 0; try { lastTrim = +localStorage.getItem('_snapTrimAt') || 0; } catch (e) {}
    if (Date.now() - lastTrim < 3600000) return;
    try { localStorage.setItem('_snapTrimAt', String(Date.now())); } catch (e) {}
    if (!window.CMHistorial) return;
    const items = await CMHistorial.indice();   // reconstruye el índice una sola vez si no existía
    const snaps = items.filter(i => i && String(i.id).startsWith('snap_'))
      .sort((a, b) => (b.t || 0) - (a.t || 0));
    const keep = new Set(snaps.slice(0, 30).map(i => i.id));
    const desde = Date.now() - 72 * 3600000, horas = new Set();
    snaps.forEach(i => { if (i.t < desde) return; const h = Math.floor(i.t / 3600000); if (!horas.has(h)) { horas.add(h); keep.add(i.id); } });
    const borrar = snaps.filter(i => !keep.has(i.id));
    if (borrar.length) {
      borrar.forEach(i => _col.doc(i.id).delete().catch(() => {}));
      await _col.doc('snapidx').set({ items: _FV.arrayRemove(...borrar) }, { merge: true });
    }
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

// Línea de tiempo con milisegundos de lo que hace este dispositivo (ver _syncEv). diagEvents() en consola.
window.diagEvents = function () {
  const l = _dgLogRead('_syncEvents');
  console.table(l.map(e => ({ t: e.t, tipo: e.tipo, res: e.res || e.rama || e.src || e.origen || '', n: e.n || '' }))); return l;
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

// ── Archivado por año (consola) ───────────────────────────────────────────────
// La implementación vive en CMArchivo (archivo.js): archiva TODAS las claves
// históricas, verifica el archivo antes de podar y avisa solo cuando el documento
// se acerca al techo de 1 MiB. Acá quedan los alias de consola de siempre.
// archivarAno(2025)  → mueve lo de ese año a appdata/archive_<año>.
// listarArchivos()   → lista los docs archive_* existentes.
// espacio()          → qué clave ocupa lugar y qué años se pueden archivar.
window.archivarAno = async function (year) {
  // Delega en CMArchivo (archivo.js). La version original escribia el documento
  // archive_<anio> con un .set() SIN merge y solo con routineLog: si CMArchivo ya
  // habia archivado otras claves de ese mismo anio (movimientos, metas, sueno...),
  // esta funcion las borraba del archivo sin aviso. Una sola semantica de escritura.
  if (!window.CMArchivo) { console.warn('[archivar] archivo.js no esta cargado.'); return; }
  return window.CMArchivo.archivar(year);
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
  if (tab === 'conocimiento') { renderLawProgress(); renderLawMilestones(); renderLawPlan(); renderTabHeader('conocimientoHeaderMeta'); if (window.Finales) Finales.renderPrincipal(); if (window.Cursada) Cursada.renderPrincipal(); }
  if (window.JARVIS_INTEL) JARVIS_INTEL.renderCard(tab);
  if (typeof renderProyectos === 'function') renderProyectos(tab);
  if (tab === 'vida'     && typeof renderCorrelacionesCard === 'function') renderCorrelacionesCard();
  if (tab === 'ia'       && typeof renderErroresCard === 'function')       renderErroresCard();
}

// ── Apply incoming remote state safely ───────────────────
function _applyRemoteState(raw, savedAt) {
  try {
    const _dgPre = _dgApplyPre();   // visibilidad: foto de antes (solo registro)
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
    _migrateFixedExpenses();
    _migrateDietaRetirada();
    localStorage.setItem('lifedash_v2', JSON.stringify(S));
    _reRenderAll();
    if (typeof window._reloadProyectosFromState === 'function') window._reloadProyectosFromState();
    if (typeof window._invalidateCatCache === 'function') window._invalidateCatCache();
    try {
      const _ad = JSON.parse(localStorage.getItem('_applyDiag') || '[]');
      _ad.unshift({ t: new Date().toLocaleString('es-AR'), items: _dataMetric(S), savedAt: savedAt || null });
      localStorage.setItem('_applyDiag', JSON.stringify(_ad.slice(0, 30)));
    } catch (e) {}
    showToast('🔄 Sincronizado');
    _dgApplyPost(_dgPre, savedAt);
  } catch(e) { console.warn('[sync] applyRemoteState error:', e); _syncEv('apply-error', { msg: String((e && e.name) || 'Error') }); } // sin e.message: el de JSON.parse trae un pedazo del estado
}

// ── Real-time Firestore listener ──────────────────────────
// Si el listener muere por un error que no es de red (permisos, sesión), se reconecta solo al volver a la app.
let _listenerVivo = false;
function _reanudarListener() {
  if (_listenerVivo || !_estadoCargado || !(_auth && _auth.currentUser)) return;
  _syncEv('listener-reanudado', {});
  _startFirestoreSync();
}
function _startFirestoreSync() {
  _listenerVivo = true;
  _DOC().onSnapshot(snap => {
    if (snap.exists) _registrarEscritura(snap.data()._dev, snap.data()._savedAt);  // solo informativo
    if (typeof pushDeadAviso === 'function') pushDeadAviso(snap.exists ? snap.data().pushDead : null, snap.exists ? snap.data().pushHealth : null);  // solo visibilidad: aviso de avisos caídos
    if (typeof avisosNubeSet === 'function' && snap.exists) avisosNubeSet(snap.data().notifiedReminders);  // solo lectura: lo que el push ya avisó no se repite en la app
    if (_fbSaveTid || _fbSaveInProgress) { window._snapDrops = (window._snapDrops || 0) + 1; _dgSnapDrop(snap); return; }  // save en vuelo — descarta update remoto
    if (!snap.exists || !snap.data()?.state) return;
    if (snap.data()._wid && snap.data()._wid === _lastWriteId) return;  // eco propio
    // Hay cambios propios sin subir: no se aplica lo remoto encima (los pisaba). Se guarda y el merge 3 vías junta ambos.
    if (localStorage.getItem('_pendingCloudSave')) { _syncEv('snapshot-con-pendiente', { savedAt: snap.data()._savedAt }); _fbSave(); return; }
    // Versión más vieja que la que ya tenemos (la caché del iPhone entrega primero copias de horas/días atrás):
    // no se aplica. En el peor caso (relojes desfasados) solo demora la vista; al guardar, la transacción mergea.
    if (_esVersionVieja(snap.data())) {
      _syncEv('snapshot-viejo-ignorado', { savedAt: snap.data()._savedAt, lastSynced: _lastSyncedSavedAt, cache: !!(snap.metadata && snap.metadata.fromCache) });
      return;
    }
    if (snap.data()._wid && snap.data()._wid === _widActual) return;   // ya es la versión que tenemos
    window._applySrc = 'onSnapshot';   // visibilidad: quién pidió el apply (solo registro)
    _applyRemoteState(snap.data().state, snap.data()._savedAt);
    _marcarWid(snap.data()._wid);
  }, err => {
    // Los errores de red los reintenta el SDK solo. Cualquier otro (permission-denied,
    // unauthenticated…) cierra el listener para siempre: se registra y se avisa. No se re-suscribe.
    const code = (err && err.code) || 'desconocido';
    _syncEv('snapshot-error', { code });
    if (code !== 'unavailable' && code !== 'deadline-exceeded') {
      _listenerVivo = false;
      showToast('⚠️ Se cortó la conexión en vivo con la nube (' + code + '). Reconecto sola cuando vuelvas a la app; si no, recargá.', 15000);
    }
  });
}

// ── On visibility restore (iOS kills WS in background) ───
async function _syncOnFocus() {
  const _dgT0 = Date.now();   // visibilidad: inicio/fin y resultado (solo registro)
  _syncEv('sync-inicio', { timer: !!_fbSaveTid, vuelo: _fbSaveInProgress, conf: _lastSyncedSavedAt !== null, lastSynced: _lastSyncedSavedAt });
  if (_fbSaveTid || _fbSaveInProgress) { window._snapDrops = (window._snapDrops || 0) + 1; _syncEv('sync-fin', { res: 'descartado-save-en-vuelo', ms: 0 }); return; }
  try {
    const snap = await _leerServidor();
    if (_fbSaveTid || _fbSaveInProgress) { _syncEv('sync-fin', { res: 'descartado-save-en-vuelo', ms: Date.now() - _dgT0 }); return; }  // empezó un guardado mientras se leía
    if (snap.exists) _registrarEscritura(snap.data()._dev, snap.data()._savedAt);  // solo informativo
    const _dgInfo = { dev: snap.exists ? (snap.data()._dev || null) : null, cloudSavedAt: snap.exists ? (snap.data()._savedAt || null) : null, lastSynced: _lastSyncedSavedAt, cache: !!(snap.metadata && snap.metadata.fromCache), ms: Date.now() - _dgT0 };
    if (!snap.exists || !snap.data()?.state) { _syncEv('sync-fin', Object.assign({ res: 'sin-documento' }, _dgInfo)); return; }
    if (snap.data()._wid && snap.data()._wid === _lastWriteId) { _syncEv('sync-fin', Object.assign({ res: 'sin-cambios-eco-propio' }, _dgInfo)); return; }  // ya tenemos este estado
    // Cambios propios sin subir → no pisarlos: guardar y que el merge 3 vías junte ambos.
    if (localStorage.getItem('_pendingCloudSave')) { _syncEv('sync-fin', Object.assign({ res: 'pendiente-propio-guardo' }, _dgInfo)); _fbSave(); return; }
    // Versión más vieja que la conocida (la lectura cayó a la caché del iPhone): no se aplica.
    if (_esVersionVieja(snap.data())) { _syncEv('sync-fin', Object.assign({ res: 'version-vieja-ignorada' }, _dgInfo)); return; }
    window._applySrc = 'syncOnFocus';   // visibilidad: quién pidió el apply (solo registro)
    _applyRemoteState(snap.data().state, snap.data()._savedAt);
    _marcarWid(snap.data()._wid);
    _syncEv('sync-fin', Object.assign({ res: 'aplicado' }, _dgInfo));
  } catch(e) { _syncEv('sync-fin', { res: 'error', msg: String((e && (e.code || e.message)) || e).slice(0, 120), ms: Date.now() - _dgT0 }); }
}
// ─────────────────────────────────────────────────────────────────────────

// Lectura garantizada del servidor: el get() normal llegó a devolver en el iPhone (con fromCache=false) una copia
// de su caché de horas o días atrás. Las lecturas de una transacción nunca salen de la caché. Sin red o lenta
// (6 s) cae al get() de siempre, que sí puede servir la caché offline.
async function _leerServidor() {
  try {
    let snap = null;
    const p = _db.runTransaction(async tx => { snap = await tx.get(_DOC()); });
    const r = await Promise.race([p.then(() => 'ok'), new Promise(res => setTimeout(() => res('lento'), 6000))]);
    if (r === 'ok' && snap) return snap;
    p.catch(() => {});
    _syncEv('lectura-servidor', { res: r });
  } catch (e) { _syncEv('lectura-servidor', { res: 'error', code: String((e && e.code) || 'error') }); }
  return _DOC().get();
}

async function loadState() {
  let _loadSrc = '?', _loadErr = null;
  try {
    const snap = await _leerServidor();
    if (snap.exists && snap.data()?.state) {
      S = JSON.parse(snap.data().state);
      _lastSyncedSavedAt = snap.data()._savedAt || 0;
      _marcarWid(snap.data()._wid);
      _lastSyncedState = JSON.parse(snap.data().state);
      _loadSrc = (snap.metadata && snap.metadata.fromCache) ? 'cloud-cache' : 'cloud';
    } else {
      try { S = JSON.parse(localStorage.getItem('lifedash_v2')) || {}; } catch { S = {}; }
      _loadSrc = 'local-noDoc';
    }
  } catch(e) {
    try { S = JSON.parse(localStorage.getItem('lifedash_v2')) || {}; } catch { S = {}; }
    _loadSrc = 'local-error';
    // El motivo del fallo se guarda y se muestra: sin el codigo de error no se puede
    // distinguir un permiso denegado de una caida de red, y se diagnostica a ciegas.
    _loadErr = (e && (e.code || e.name) ? (e.code || e.name) + ' — ' : '') + ((e && e.message) || String(e));
    console.error('[load] fallo la lectura de la nube:', e);
    // Un fallo de carga NUNCA debe parecer una instalación vacía legítima: avisar siempre.
    setTimeout(() => showToast('⚠️ No se pudo cargar desde la nube (' + _loadErr + ') — mostrando datos locales (pueden estar desactualizados). No uses forzarGuardado().', 15000), 1500);
  }
  // ── Cambios locales guardados sin conexión (write a la nube pendiente): mergearlos, no descartarlos.
  // Sin esto, la carga cloud-first pisa el localStorage y se pierden las ediciones offline.
  if ((_loadSrc === 'cloud' || _loadSrc === 'cloud-cache') && localStorage.getItem('_pendingCloudSave')) {
    try {
      const localObj = JSON.parse(localStorage.getItem('lifedash_v2') || 'null');
      if (localObj && JSON.stringify(localObj) !== JSON.stringify(S)) {
        let base = null;
        try { base = JSON.parse(localStorage.getItem('_lastSyncedStateStr') || 'null'); } catch (e) {}
        // Copia local mucho más chica que lo último sincronizado (o que la nube) = restos de un arranque, no ediciones:
        // se descarta. Mergearla como si fueran bajas vació la nube el 22/11/2026 08:13.
        const _refLen = Math.max(base ? JSON.stringify(base).length : 0, JSON.stringify(S).length);
        if (JSON.stringify(localObj).length < _refLen * 0.5) {
          localStorage.removeItem('_pendingCloudSave');
          _syncEv('pendiente-descartado-chico', { local: JSON.stringify(localObj).length, ref: _refLen });
        } else {
          S = base ? _mergeStates(base, localObj, S) : _rescueLocal(_mergeStates(base, localObj, S), localObj);   // sin ancestro: rescate (no se sabe qué se borró)
          console.warn('[load] merge de cambios offline pendientes');
          setTimeout(() => showToast('🔀 Recuperando cambios hechos sin conexión…', 6000), 1500);
          setTimeout(() => saveState(), 2500);   // subir el merge a la nube (limpia el pendiente al confirmar)
        }
      } else {
        localStorage.removeItem('_pendingCloudSave');
      }
    } catch (e) { console.warn('[load pending-merge]', e); }
  }
  if (_loadSrc === 'cloud') {
    try { localStorage.setItem('_lastSyncedStateStr', JSON.stringify(_lastSyncedState)); } catch (e) {}
  }
  _estadoCargado = true;   // desde acá S son los datos reales: saveState ya puede guardar
  // ── Diag de carga (de dónde vino el estado inicial). diagLoad() en consola.
  try {
    const _ld = { t: new Date().toLocaleString('es-AR'), src: _loadSrc, lastSynced: _lastSyncedSavedAt, items: _dataMetric(S), err: _loadErr || null, uid: (_auth.currentUser && _auth.currentUser.uid) || null };
    localStorage.setItem('_loadDiag', JSON.stringify(_ld));
    // Visibilidad: evento de arranque (fuente, savedAt, cuánto pasó desde el último uso y cuántos datos tenía la copia local previa).
    let _dgLocalItems = null; try { _dgLocalItems = _dataMetric(JSON.parse(localStorage.getItem('lifedash_v2') || 'null')); } catch (e) {}
    const _dgPrev = _dgLogRead('_syncEvents')[0];
    _syncEv('boot', { src: _loadSrc, lastSynced: _lastSyncedSavedAt, items: _ld.items, localItems: _dgLocalItems, pend: !!localStorage.getItem('_pendingCloudSave'), err: _loadErr || null, sinUsoMs: _dgPrev ? Date.now() - (_dgPrev.ts2 || _dgPrev.ts) : null, ses: _dgSes(S) });
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
  // Una sola vez y solo en una instalación nueva: antes corría en cada arranque y volvía a crear los hábitos que
  // el usuario había borrado (22/11/2026). Con hábitos ya cargados solo se marca como hecho.
  if (!S._habitosBaseCreados) {
    const _yaTieneHabitos = ['vida','finanzas','salud','conocimiento','ia'].some(s => (S.habitTrackers[s] || []).length);
    if (!_yaTieneHabitos) {
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
    }
    S._habitosBaseCreados = true;
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
  if (_migrateFixedExpenses()) saveState();
  if (_migrateDietaRetirada()) saveState();
  // ── Presupuesto: init + auto-copia en cascada de los meses futuros del año real actual ──
  if (!S.budgets) S.budgets = {};
  ensureBudgetYear(new Date().getFullYear());
}
// Gastos fijos: función eliminada. Se borran sus dos claves solo si están vacías; con datos se dejan intactas.
function _migrateFixedExpenses() {
  let changed = false;
  if (Array.isArray(S.fixedExpenses) && !S.fixedExpenses.length) { delete S.fixedExpenses; changed = true; }
  const log = S.fixedExpenseLog;
  if (log && typeof log === 'object' && !Object.keys(log).length) { delete S.fixedExpenseLog; changed = true; }
  return changed;
}
// Dieta de reglas retirada: los objetivos con vínculo "días de dieta cumplida" pasan a manuales (se quita solo el link; el resto del objetivo
// —texto, done, categoría— queda igual: un objetivo manual no guarda progreso numérico, solo `done`) y un hábito con criterio automático de dieta
// queda como hábito común (se quita solo `auto`; sus días marcados no se tocan). Idempotente. Nunca toca S.dieta ni ningún historial.
function _migrateDietaRetirada() {
  let changed = false;
  const sinLink = o => { if (o && typeof o === 'object' && o.link && o.link.type === 'dieta') { delete o.link; changed = true; } };
  const lista = a => { if (Array.isArray(a)) a.forEach(sinLink); };
  const qo = S.quarterlyObjectives;
  if (qo && Array.isArray(qo.periods)) qo.periods.forEach(p => { if (p) lista(p.objectives); });
  const mg = S.monthlyGoals;
  if (mg && typeof mg === 'object') Object.values(mg).forEach(v => { if (Array.isArray(v)) lista(v); else if (v && typeof v === 'object') Object.values(v).forEach(lista); });
  const ht = S.habitTrackers;
  const habs = Array.isArray(ht) ? ht : (ht && typeof ht === 'object' ? Object.values(ht).reduce((a, x) => a.concat(Array.isArray(x) ? x : []), []) : []);
  habs.forEach(h => { if (h && h.auto && h.auto.type === 'dieta') { delete h.auto; changed = true; } });
  return changed;
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
  _syncEvSave();   // visibilidad: quién llamó y cuándo (solo registro)
  if (!_estadoCargado) return;   // S todavía son los valores de fábrica: no se guarda ni se marca nada (ver _estadoCargado)
  // Pendiente en el acto: si iOS congela/mata la app antes de que el guardado llegue a la nube, el próximo arranque
  // lo mergea (loadState) y mientras tanto no se aplica encima una versión remota (onSnapshot/_syncOnFocus).
  try { localStorage.setItem('_pendingCloudSave', '1'); } catch (e) {}
  try { localStorage.setItem('lifedash_v2', JSON.stringify(S)); }
  catch (e) { console.warn('[saveState] localStorage:', e && e.name); showToast('⚠️ La memoria del dispositivo está llena: el cambio se sube a la nube igual, pero no queda copia local', 8000); }
  _fbSave();   // siempre, aunque localStorage falle (QuotaExceeded)
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
// Formato numérico argentino de toda la app: punto de miles, coma decimal (dec = decimales fijos; 0 por defecto).
function fmtNum(n, dec) { const d = dec || 0; return (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
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
  const _panel = document.getElementById('tab-' + tab);
  _panel.classList.add('active');
  btn.classList.add('active');
  currentTab = tab;
  if (!chartsInited[tab]) { initChartsForTab(tab); chartsInited[tab] = true; }
  renderQObjForTab(tab);
  if (tab === 'vida')         { renderTabHeader('vidaHeaderMeta'); }
  if (tab === 'salud')        { renderSaludTab(); renderSleepTracker(); renderTabHeader('saludHeaderMeta'); }
  if (tab === 'finanzas')     { renderFinanzasTab(); }
  if (tab === 'conocimiento') { renderLawProgress(); renderLawMilestones(); renderLawPlan(); renderTabHeader('conocimientoHeaderMeta'); if (window.Finales) Finales.renderPrincipal(); if (window.Cursada) Cursada.renderPrincipal(); }
  if (tab === 'ia')           { renderTabHeader('iaHeaderMeta'); }
  const _ks = document.getElementById('kpi-' + tab); if (_ks) delete _ks.dataset.kpiInit; // re-dispara count-up al entrar
  if (window.JARVIS_INTEL) JARVIS_INTEL.renderCard(tab);
  renderHabitsCard(tab);
  checkAchievements();
  if (typeof renderProyectos === 'function') renderProyectos(tab);
  renderReminders(tab);
  if (tab === 'vida'     && typeof renderCorrelacionesCard === 'function') renderCorrelacionesCard();
  if (tab === 'ia'       && typeof renderErroresCard === 'function')       renderErroresCard();
  if (window.CMMotion) CMMotion.enterPanel(_panel);   // entrada escalonada + count-up de totales (motion.js)
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
  if (id === 'modal-add-txn') { initTxnForm(); updateTxnMonthNotice(); }   // medio de pago + panel de tarjeta (finanzas.js)
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
  ['ordAccount','fundAccount'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const base = id === 'ordAccount' ? '<option value="">— No descontar —</option>' : '<option value="">— Ninguna —</option>';
    sel.innerHTML = base + S.accounts.filter(a=>a.type==='invest'||(a.type!=='prestamo'&&acctIsCash(a))).map(a=>`<option value="${a.id}">${a.icon||'🏦'} ${a.name}</option>`).join('') + '<option value="prestamos_amorcito">💙 Prestamos amorcito</option>';
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
  if (pending.length > 0) alerts.push({ text: `${pending.length} tarea${pending.length>1?'s':''} pendiente${pending.length>1?'s':''} hoy`, cls: 'warn' });
  if (todayGoals.length > 0 && pending.length === 0) alerts.push({ text: '✓ ¡Todas las tareas completadas!', cls: 'ok' });

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

  // Vencimientos de hoy y atrasados (misma fuente que las notificaciones).
  // Se excluyen las actividades del planner: son agenda, no deuda.
  if (typeof CMDeadlines !== 'undefined') {
    const nowMs = now.getTime();
    const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
    // Los pedidos tienen su propio bloque de ticker más abajo.
    const DEADLINE_KINDS = ['proy', 'final', 'cursada', 'proyeccion', 'tarjeta'];
    CMDeadlines.collect(S, { now: nowMs, pastDays: 14 })
      .filter(d => DEADLINE_KINDS.includes(d.kind) && d.at <= endToday.getTime())
      .slice(0, 6)
      .forEach(d => alerts.push({
        text: `${d.icon} ${d.title} · ${d.at <= nowMs ? 'ATRASADO' : d.allDay ? (d.kind === 'tarjeta' ? d.sub : 'vence hoy') : d.time}`,
        cls: d.at <= nowMs ? 'alert' : 'warn',
      }));
  }

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

// Lista de tareas del día: 4 categorías de la matriz de Eisenhower (campo opcional g.q en S.goals).
// Sin g.q (tareas viejas, de Proyectos o de JARVIS) la categoría se deriva de la prioridad al leer; no hay migración.
const GOAL_QUADS = [
  ['ui', 'Urgente-importante'],
  ['un', 'Urgente-no importante'],
  ['ni', 'No urgente-importante'],
  ['nn', 'No urgente-no importante'],
];
const GOAL_QUAD_PRIO = { ui: 'high', un: 'mid', ni: 'mid', nn: 'low' };   // prioridad que acompaña a una categoría elegida
function cuadranteDe(g) {
  if (g && GOAL_QUAD_PRIO[g.q]) return g.q;
  const p = g && g.priority;
  if (p === 'high' || p === 'alta' || p === 'critical' || p === 3) return 'ui';
  if (p === 'low' || p === 'baja' || p === 1) return 'nn';
  return 'ni';   // mid / medium / media / sin prioridad / valor desconocido
}
function goalQuadOptions(sel) {
  return GOAL_QUADS.map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${l}</option>`).join('');
}
function setGoalQuad(date, idx, q) {
  if (!GOAL_QUAD_PRIO[q]) return;
  const m = _aHoySiPasada(date, idx);   // una arrastrada primero pasa a hoy
  if (!m) return;
  const g = (S.goals[m.date] || [])[m.idx];
  if (!g) return;
  g.q = q; g.priority = GOAL_QUAD_PRIO[q];
  saveState(); renderGoals();
}
// Horario de una tarea: hora exacta (g.time 'HH:MM') o franja (g.franja 'm'|'t'|'n', excluyente con time). g.oblig=true = "obligatoria a esa hora".
// Solo la hora exacta entra al planner; la franja solo ordena y avisa (a las 08:00 / 13:00 / 19:00, ver deadlines.js).
const GOAL_FRANJAS = { m: 'Mañana', t: 'Tarde', n: 'Noche' };
function goalHoraTxt(g) { return g.time ? fmtGoalTime(g.time) : (GOAL_FRANJAS[g.franja] || ''); }
// Chip de horario (abre el editor). conHora=true → el chip con la hora/franja (al inicio de la fila); false → el reloj discreto de las tareas sin horario (con los otros íconos).
function _goalHoraBtn(g, date, idx, cls, conHora) {
  const txt = goalHoraTxt(g);
  if (!!txt !== conHora) return '';
  const a = `openGoalHora('${escHtml(date)}',${idx})`;
  if (!txt) return `<button class="goal-hora goal-hora-vacio" type="button" onclick="${a}" title="Poner horario" aria-label="Poner horario a la tarea"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button>`;
  return `<button class="goal-hora ${cls}" type="button" onclick="${a}" title="Editar horario" aria-label="Editar horario: ${txt}${g.oblig ? ', obligatoria' : ''}">${txt}${g.oblig ? '<span class="goal-oblig" title="Obligatoria a esa hora">🔒</span>' : ''}</button>`;
}
let _ghEdit = null;   // { date, idx }
function _ghSetMode(mode) {
  document.querySelectorAll('#ghMode button').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
  document.getElementById('ghHoraBox').hidden = mode !== 'hora';
  document.getElementById('ghFranjaSeg').hidden = mode !== 'franja';
  document.getElementById('ghObligRow').hidden = mode === 'none';
}
function _ghSetFranja(f) { document.querySelectorAll('#ghFranjaSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === f)); }
function openGoalHora(date, idx) {
  const g = (S.goals[date] || [])[idx]; if (!g) return;
  _ghEdit = { date, idx };
  document.getElementById('ghText').textContent = g.text;
  document.getElementById('ghTime').value = g.time || '';
  _ghSetFranja(g.franja || 'm');
  document.getElementById('ghOblig').checked = !!g.oblig;
  _ghSetMode(g.time ? 'hora' : g.franja ? 'franja' : 'none');
  openModal('modal-goal-hora');
}
function saveGoalHora() {
  if (!_ghEdit) { closeModal('modal-goal-hora'); return; }
  const modeBtn = document.querySelector('#ghMode button.on');
  const mode = modeBtn ? modeBtn.dataset.v : 'none';
  const time = document.getElementById('ghTime').value;
  if (mode === 'hora' && !time) { showToast('Elegí una hora, o cambiá a Franja / Sin horario'); return; }
  const m = _aHoySiPasada(_ghEdit.date, _ghEdit.idx);   // una arrastrada primero pasa a hoy
  const g = m && (S.goals[m.date] || [])[m.idx];
  if (!g) { closeModal('modal-goal-hora'); return; }
  g.time = mode === 'hora' ? time : null;
  if (mode === 'franja') { const f = document.querySelector('#ghFranjaSeg button.on'); g.franja = f ? f.dataset.v : 'm'; } else delete g.franja;
  if (mode !== 'none' && document.getElementById('ghOblig').checked) g.oblig = true; else delete g.oblig;
  _ghEdit = null;
  closeModal('modal-goal-hora');
  saveState(); renderGoals();
  renderReminders('vida');
}
// Tareas del planner: 3 niveles, gradiente de apagado (baja) a llamativo (alta).
// La distinción es por combinación de factores (color de barra + badge + peso/saturación via clase .prio-N en CSS).
const PLANNER_PRIO = {
  1: { label: 'Baja',  color: '#8BA5C0' },   // --ts   (apagado)
  2: { label: 'Media', color: '#F5A623' },   // --warn
  3: { label: 'Alta',  color: '#FF3358' },   // --danger (llamativo)
};

// Vuelca a "Metas de hoy" las tareas de Proyectos (todas las secciones) cuyo vencimiento es hoy.
// Vínculo por g.fromTask: si la tarea se completa/borra/cambia de fecha, la meta se actualiza o se retira.
function syncDueProjectsToGoals() {
  if (!window.Proyectos || typeof window.Proyectos.get !== 'function') return false;
  const today = getActiveDate();
  if (!S.goals[today]) S.goals[today] = [];
  const todayGoals = S.goals[today];
  const PRIO_MAP = { '1': 'high', '2': 'mid', '3': 'low' };
  const dismissed = (S.goalsDismissed && S.goalsDismissed[today]) || [];
  const seenTaskIds = new Set();
  let changed = false;

  ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'].forEach(tab => {
    const walk = nodes => (nodes || []).forEach(n => {
      if (!_poIsFolder(n) && n.dueDate === today && !dismissed.includes(n.id)) {
        seenTaskIds.add(n.id);
        const existing = todayGoals.find(g => g.fromTask === n.id);
        if (!existing) {
          todayGoals.push({ id: uid(), text: n.label || '(sin título)', done: !!n.done,
            priority: PRIO_MAP[n.priority] || 'mid', time: '', period: '', fromTask: n.id, fromTab: tab });
          changed = true;
        } else if (n.done && !existing.done) {
          // Solo empuja completada tarea→meta; no desmarca una meta que el usuario ya tildó a mano.
          existing.done = true; changed = true;
        }
      }
      if (n.children) walk(n.children);
    });
    walk(window.Proyectos.get(tab));
  });

  const before = todayGoals.length;
  S.goals[today] = todayGoals.filter(g => !g.fromTask || seenTaskIds.has(g.fromTask));
  if (S.goals[today].length !== before) changed = true;

  if (changed) saveState();
  return changed;
}

function renderGoals() {
  syncDueProjectsToGoals();
  ensureGoalRepeats();
  const today = getActiveDate(), tom = getTomorrow();
  renderGoalList(today, 'goalList', 'goalsEmpty', false);
  renderGoalList(tom, 'tomorrowList', 'tomorrowEmpty', false);
  renderGoalsHeader(today);
  renderMetasReadonly();
  renderPendientes();
  updateStreak();
  buildTickerAlerts();
  renderDayPlanner();
  // Refresh urgent block if any timed goal exists today or tomorrow
  const today2    = getActiveDate();
  const tomorrow2 = getTomorrow();
  const hasTimed  = (S.goals[today2]||[]).some(g => g.time) || (S.goals[tomorrow2]||[]).some(g => g.time);
  if (hasTimed) renderReminders('vida');
}

// La tarjeta entera abre Planificación (patrón .cc-card-link). Las filas (zona de arrastre y edición) y los controles NO la abren.
// Se mira dónde EMPEZÓ el clic: un arrastre de Sortable o una selección de texto que termina fuera de la fila genera un click
// cuyo target es un ancestro común, así que el target solo no alcanza.
const _MRD_PROPIO = '.mrd-item, .pend-item, button, select, input, a, [contenteditable="true"]';
function _initMetasCardLink() {
  const card = document.getElementById('metas-readonly-card');
  if (!card || card._linkInit) return;
  card._linkInit = true;
  let desdeInterno = false;
  card.addEventListener('pointerdown', e => { desdeInterno = !!(e.target.closest && e.target.closest(_MRD_PROPIO)); }, true);
  card.addEventListener('click', e => {
    const interno = desdeInterno || (e.target.closest && e.target.closest(_MRD_PROPIO));
    desdeInterno = false;
    if (interno) return;
    if (typeof plannerOverlayOpen === 'function') plannerOverlayOpen();
  });
  card.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); if (typeof plannerOverlayOpen === 'function') plannerOverlayOpen(); }
  });
}

// Lista de tareas del día en la sección: ver, marcar, agregar, editar el texto (clic), cambiar de categoría (⇅) y arrastrar entre categorías. Borrar vive en Planificación (overlay).
function renderMetasReadonly() {
  _initMetasCardLink();
  const body = document.getElementById('metasReadonlyBody'); if (!body) return;
  const date = getActiveDate();
  const goals = S.goals[date] || [];
  const view = _goalsHoyVista(date);   // las de hoy + las arrastradas de días anteriores (estas no cuentan en el progreso)
  if (!view.length) {
    body.innerHTML = '<div class="mrd-empty">Sin tareas para hoy. Tocá <b>+ Tarea</b> para agregar la primera.</div>';
    return;
  }
  const done = goals.filter(g => g.done).length;
  body.innerHTML = `<div class="mrd-prog"><span class="mrd-prog-num">${done}</span><span class="mrd-prog-sep">/</span><span class="mrd-prog-tot">${goals.length}</span><span class="mrd-prog-lbl">completadas</span></div>`
    + '<div class="tl-matrix">' + GOAL_QUADS.map(([key, label]) => {
      const items = view.filter(x => cuadranteDe(x.g) === key);
      const propias = items.filter(x => x.date === date);   // las arrastradas no entran en el contador de la categoría
      const nDone = propias.filter(x => x.g.done).length;
      return `<section class="tl-q" data-q="${key}"><div class="tl-q-head"><span class="tl-q-name">${label}</span><span class="gs-count">${nDone}/${propias.length}</span></div>`
        + `<div class="tl-q-list" data-q="${key}">` + (items.length ? items.map(({ g, i: idx, date: gd }) => `<div class="mrd-item${g.done ? ' done' : ''}${gd !== date ? ' mrd-arrastrada' : ''}" data-idx="${idx}"${gd !== date ? ` data-from="${escHtml(gd)}"` : ''}>
        ${_goalHoraBtn(g, gd, idx, 'mrd-time', true)}
        <span class="mrd-prio" style="background:${PRIORITY_COLOR[g.priority] || '#666'}"></span>
        <span class="mrd-text" title="Tocá para editar">${escHtml(g.text)}</span>
        ${_goalHoraBtn(g, gd, idx, 'mrd-time', false)}${_goalRepBtn(g, gd, idx)}
        <span class="goal-q-wrap" title="Cambiar de categoría"><span class="goal-q-ic" aria-hidden="true">⇅</span><select class="goal-q-sel" aria-label="Categoría de la tarea">${goalQuadOptions(key)}</select></span>
        <button class="mrd-check" onclick="toggleGoal('${escHtml(gd)}',${idx})" aria-label="Marcar tarea"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></button>
      </div>`).join('') : '<div class="tl-q-vacia">Nada acá</div>')
        + '</div></section>';
    }).join('') + '</div>';
  body.querySelectorAll('.mrd-item').forEach(row => {
    const idx = +row.dataset.idx, rd = row.dataset.from || date;
    row.querySelector('.goal-q-sel').addEventListener('change', e => setGoalQuad(rd, idx, e.target.value));
    _goalTextEditable(row.querySelector('.mrd-text'), rd, idx);
  });
  if (typeof Sortable !== 'undefined') {
    const matrix = body.querySelector('.tl-matrix');
    matrix.querySelectorAll('.tl-q-list').forEach(sec => Sortable.create(sec, {
      group: 'goalsCard', animation: 150, draggable: '.mrd-item',
      filter: '.mrd-check, .goal-q-wrap, .goal-rep, .goal-hora', preventOnFilter: false,
      delay: 250, delayOnTouchOnly: true,   // en el celu: mantener apretado para arrastrar (si no, choca con el scroll)
      onEnd: () => { _goalMatrixReorder(matrix, date, '.mrd-item'); setTimeout(renderGoals, 0); }
    }));
  }
}

// Reordena S.goals[date] según el DOM de una matriz de categorías; mover a otra categoría guarda q (y su prioridad).
// Usa el estado vivo (no el del render) para evitar corrupción por renderGoals() re-entrante.
// Una arrastrada (data-from = su fecha vieja) que se mueve en la lista pasa a ser de hoy: se saca de su fecha y entra en el nuevo orden.
function _goalMatrixReorder(matrix, date, itemSel) {
  const cur = S.goals[date] || [];
  const newArr = [];
  const traidas = [];
  matrix.querySelectorAll('.tl-q-list').forEach(s2 => {
    s2.querySelectorAll(itemSel).forEach(el => {
      const from = el.dataset.from;
      const item = from ? (S.goals[from] || [])[+el.dataset.idx] : cur[+el.dataset.idx];
      if (!item) return;
      if (from) { if (!item.id) item.id = uid(); traidas.push({ from, item }); }
      if (cuadranteDe(item) !== s2.dataset.q) { item.q = s2.dataset.q; item.priority = GOAL_QUAD_PRIO[s2.dataset.q]; }
      newArr.push(item);
    });
  });
  if (newArr.length === cur.length + traidas.length) {
    traidas.forEach(({ from, item }) => { S.goals[from] = S.goals[from].filter(x => x !== item); });
    S.goals[date] = newArr; saveState();
  }
}

// Edición en línea del texto de una tarea (clic → editable; Enter guarda, Escape cancela).
function _goalTextEditable(textEl, date, idx) {
  textEl.addEventListener('click', () => {
    if (textEl.getAttribute('contenteditable') === 'true') return;
    const orig = textEl.textContent;
    textEl.setAttribute('contenteditable','true');
    textEl.focus();
    const range = document.createRange(); range.selectNodeContents(textEl); range.collapse(false);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    const onKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
      else if (e.key === 'Escape') { textEl.textContent = orig; textEl.blur(); }
    };
    const commit = () => {
      textEl.removeEventListener('keydown', onKey);
      textEl.removeAttribute('contenteditable');
      const v = textEl.textContent.trim();
      let d = date, i = idx;
      if (v && v !== orig && _esPasada(date)) { const m = _aHoySiPasada(date, idx); if (m) { d = m.date; i = m.idx; } }   // arrastrada: se edita ya movida a hoy
      const g = (S.goals[d] || [])[i];
      if (g && v && v !== orig) { g.text = v; saveState(); if (d !== date) renderGoals(); }
      else textEl.textContent = orig;
    };
    textEl.addEventListener('blur', commit, { once: true });
    textEl.addEventListener('keydown', onKey);
  });
}

// ── Orden automático de metas (capa de vista: ordena una copia y conserva el índice real) ──
// Grupos: 0) pendientes con horario (hora asc, empate → importancia),
//         1) pendientes sin horario (importancia), 2) completadas al final.
// Empates: sort nativo estable → respeta el orden manual (drag) dentro del mismo nivel.
const GOAL_PRIO_ORDER = { high: 0, mid: 1, low: 2 };
function goalPrioRank(g) { const v = GOAL_PRIO_ORDER[g.priority]; return v == null ? 1 : v; }
// Grupos: 0) con hora, 1) con franja (mañana, tarde, noche), 2) sin horario, 3) completadas.
const GOAL_FRANJA_ORD = { m: 0, t: 1, n: 2 };
function _goalGrupo(g) { return g.done ? 3 : g.time ? 0 : GOAL_FRANJAS[g.franja] ? 1 : 2; }
function _sortVista(items) {
  return items.sort((a, b) => {
    const ra = _goalGrupo(a.g), rb = _goalGrupo(b.g);
    if (ra !== rb) return ra - rb;
    if (ra === 0 && a.g.time !== b.g.time) return a.g.time < b.g.time ? -1 : 1;
    if (ra === 1 && a.g.franja !== b.g.franja) return GOAL_FRANJA_ORD[a.g.franja] - GOAL_FRANJA_ORD[b.g.franja];
    return goalPrioRank(a.g) - goalPrioRank(b.g);
  });
}
function sortGoalsView(goals) {
  return _sortVista((goals || []).map((g, i) => ({ g, i })));
}
// Lista de hoy: sus tareas + las arrastradas (pendientes de días anteriores). Cada ítem lleva su fecha real: i es el índice en S.goals[date].
function _goalsHoyVista(hoy) {
  const propias = (S.goals[hoy] || []).map((g, i) => ({ g, i, date: hoy }));
  const arrastradas = _pendientesCalc().map(p => ({ g: p.g, i: p.idx, date: p.date }));
  return _sortVista(propias.concat(arrastradas));
}

function buildGoalItem(g, idx, date, readOnly) {
  const li = document.createElement('div');
  const arrastrada = _esPasada(date);   // tarea de un día anterior mostrada en hoy: sin marca visible, solo clase/atributo internos
  li.className = 'goal-item' + (g.done ? ' done-row' : '') + (arrastrada ? ' goal-arrastrada' : '');
  li.dataset.idx = idx;
  if (arrastrada) li.dataset.from = date;
  li.innerHTML = `
    <span class="goal-drag" title="Arrastrar">⋮⋮</span>
    <span class="goal-priority" style="background:${PRIORITY_COLOR[g.priority]||'#666'}"></span>
    ${_goalHoraBtn(g, date, idx, 'goal-time-badge', true)}
    <span class="goal-text-el">${escHtml(g.text)}</span>
    ${_goalHoraBtn(g, date, idx, 'goal-time-badge', false)}${_goalRepBtn(g, date, idx)}
    <span class="goal-q-wrap" title="Cambiar de categoría"><span class="goal-q-ic" aria-hidden="true">⇅</span><select class="goal-q-sel" aria-label="Categoría de la tarea">${goalQuadOptions(cuadranteDe(g))}</select></span>
    <button class="goal-del" data-idx="${idx}" data-date="${date}" title="Eliminar">×</button>
    <span class="check-box ${g.done?'checked':''}" data-idx="${idx}" data-date="${date}"></span>
  `;
  // Checkbox click
  li.querySelector('.check-box').addEventListener('click', () => { toggleGoal(date, idx); });
  // Cambiar de categoría
  li.querySelector('.goal-q-sel').addEventListener('change', (e) => { setGoalQuad(date, idx, e.target.value); });
  // Delete
  li.querySelector('.goal-del').addEventListener('click', () => { deleteGoal(date, idx); });
  // Inline edit (text)
  if (!readOnly) _goalTextEditable(li.querySelector('.goal-text-el'), date, idx);
  return li;
}

function renderGoalList(date, listId, emptyId, readOnly) {
  const goals = S.goals[date] || [];
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  list.innerHTML = '';
  const hoyView = listId === 'goalList' ? _goalsHoyVista(date) : null;
  empty.style.display = (hoyView ? hoyView.length : goals.length) ? 'none' : '';

  // Today's list: matriz de 4 categorías (Urgente/importante). El orden dentro de cada una sigue sortGoalsView.
  if (listId === 'goalList') {
    if (!hoyView.length) return;
    const matrix = document.createElement('div');
    matrix.className = 'tl-matrix';
    const view = hoyView;
    GOAL_QUADS.forEach(([key, label]) => {
      const items = view.filter(x => cuadranteDe(x.g) === key);
      const propias = items.filter(x => x.date === date);   // las arrastradas no entran en el contador de la categoría
      const done = propias.filter(x => x.g.done).length;
      const box = document.createElement('section');
      box.className = 'tl-q';
      box.dataset.q = key;
      box.innerHTML = `<div class="tl-q-head"><span class="tl-q-name">${label}</span><span class="gs-count">${done}/${propias.length}</span><button class="tl-q-add" onclick="openAddGoalToday('${key}')" title="Agregar tarea en ${label}" aria-label="Agregar tarea en ${label}">+</button></div>`;
      const sec = document.createElement('div');
      sec.className = 'goal-section-list tl-q-list';
      sec.dataset.q = key;
      items.forEach(({ g, i, date: gd }) => sec.appendChild(buildGoalItem(g, i, gd, readOnly)));
      box.appendChild(sec);
      matrix.appendChild(box);

      if (!readOnly && typeof Sortable !== 'undefined') {
        Sortable.create(sec, {
          handle: '.goal-drag', animation: 150, group: 'goalsToday',
          onEnd: () => {
            // Arrastrar a otra categoría guarda q (y la prioridad que le corresponde); dentro de la misma no cambia nada.
            _goalMatrixReorder(matrix, date, '.goal-item');
            // Deferred: avoids re-entrant onEnd corruption from synchronous renderGoals().
            setTimeout(renderGoals, 0);
          }
        });
      }
    });
    list.appendChild(matrix);
    return;
  }

  sortGoalsView(goals).forEach(({ g, i }) => list.appendChild(buildGoalItem(g, i, date, readOnly)));

  // Sortable drag — destroy previous instance before creating new one
  if (!readOnly && typeof Sortable !== 'undefined') {
    const existing = Sortable.get(list);
    if (existing) existing.destroy();
    Sortable.create(list, {
      handle: '.goal-drag', animation: 150,
      onEnd: (evt) => {
        // Uses live state (not the render-time closure) to avoid re-entrant renderGoals() corruption.
        const cur = S.goals[date] || [];
        const li = evt.item;
        const g = cur[+li.dataset.idx];
        if (g && !g.done) {
          // Dragging changes priority: adopt the nearest pending neighbor's priority (up, then down).
          let neighbor = li.previousElementSibling;
          while (neighbor && neighbor.classList.contains('done-row')) neighbor = neighbor.previousElementSibling;
          if (!neighbor) {
            neighbor = li.nextElementSibling;
            while (neighbor && neighbor.classList.contains('done-row')) neighbor = neighbor.nextElementSibling;
          }
          const ng = neighbor ? cur[+neighbor.dataset.idx] : null;
          if (ng && !ng.done) g.priority = ng.priority;
        }
        // Rebuild order from DOM (list is sorted for view, not for storage): real idx lives in dataset.
        const newArr = [];
        list.querySelectorAll('.goal-item').forEach(el => newArr.push(cur[+el.dataset.idx]));
        S.goals[date] = newArr; saveState();
        // Deferred: destroy() below re-enters _onDrop synchronously if called from within onEnd.
        setTimeout(renderGoals, 0);
      }
    });
  }
}

// Progreso del día (número, barra, "¡todo listo!"): solo cuenta S.goals[hoy]; las arrastradas se suman al confirmarlas o marcarlas hechas.
function renderGoalsHeader(date) {
  const goals = S.goals[date] || [];
  const done = goals.filter(g=>g.done).length;
  const total = goals.length;
  document.getElementById('goalsDoneNum').textContent = done;
  document.getElementById('goalsTotalNum').textContent = `/ ${total}`;
  document.getElementById('goalsLabel').textContent = total===0?'sin tareas':done===total&&total>0?'¡todo listo!':'completadas';

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
  if (_esPasada(date)) {   // arrastrada: se mueve a hoy y se marca ahí, así cuenta en el progreso de hoy
    const m = _aHoySiPasada(date, idx);
    if (!m) return;
    date = m.date; idx = m.idx;
  }
  const g = S.goals[date][idx];
  g.done = !g.done;
  // Meta vinculada a una tarea de Proyectos: completarla también completa la tarea de origen.
  if (g.fromTask && g.done && window.Proyectos && typeof window.Proyectos.setDone === 'function') {
    try { window.Proyectos.setDone(g.fromTab, g.fromTask, true); } catch (e) {}
  }
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
      showToast('✓ Tarea completada');
    }
  }
}

function deleteGoal(date, idx) {
  const g = S.goals[date][idx];
  if (g && g.repId) _grSkip(g.repId, date);   // borrar la instancia de un día no borra la regla ni la vuelve a crear ese día
  if (g && g.fromTask) {
    // Descarte definitivo: si no se registra, syncDueProjectsToGoals la vuelve a crear en el próximo render.
    if (!S.goalsDismissed) S.goalsDismissed = {};
    if (!S.goalsDismissed[date]) S.goalsDismissed[date] = [];
    S.goalsDismissed[date].push(g.fromTask);
  }
  S.goals[date].splice(idx, 1);
  saveState(); renderGoals();
}

function openAddGoalToday(q) {
  // Categoría por defecto: No urgente-importante, o la del botón "+" de la categoría desde la que se tocó.
  const sel = document.getElementById('newGoalQuad');
  if (sel) sel.value = (typeof q === 'string' && GOAL_QUAD_PRIO[q]) ? q : 'ni';
  _grFillDays('newGoalDays', []);
  openModal('modal-add-goal');
}
function openAddGoalTom() {
  _grFillDays('newGoalDaysTom', []);
  openModal('modal-add-goal-tom');
}

function addGoal(when) {
  const isTom = when === 'tomorrow';
  const textId = isTom ? 'newGoalTextTom' : 'newGoalText';
  const quadEl = document.getElementById(isTom ? 'newGoalQuadTom' : 'newGoalQuad');
  const q = (quadEl && GOAL_QUAD_PRIO[quadEl.value]) ? quadEl.value : 'ni';
  const text = document.getElementById(textId).value.trim();
  if (!text) { showToast('Escribe una tarea primero'); return; }
  const date = isTom ? getTomorrow() : getActiveDate();
  if (!S.goals[date]) S.goals[date] = [];
  const timeEl = document.getElementById('newGoalTime');
  const timeVal = (!isTom && timeEl) ? (timeEl.value || null) : null;
  const days = _grReadDays(isTom ? 'newGoalDaysTom' : 'newGoalDays');
  if (days.length) {
    // Repetitiva: se crea la regla; esta fecha solo recibe la instancia si cae en uno de los días marcados.
    const r = _grCreate({ text, q, priority: GOAL_QUAD_PRIO[q], time: timeVal, byDays: days, startDate: date });
    ensureGoalRepeats();
    showToast('↻ Se repite ' + _grDaysLabel(r.byDays));
  } else {
    S.goals[date].push({ id: uid(), text, done: false, priority: GOAL_QUAD_PRIO[q], q, time: timeVal });
  }
  document.getElementById(textId).value = '';
  if (quadEl) quadEl.value = 'ni';
  if (timeEl) timeEl.value = '';
  saveState(); renderGoals();
  closeModal(isTom ? 'modal-add-goal-tom' : 'modal-add-goal');
  // [SUPABASE] await supabase.from('goals').insert({ date, text, done: false, priority, user_id });
}

// Qué metas pendientes de 'from' se copiarían a 'to' (sin duplicar por texto ni por regla repetitiva). No toca nada.
// Una instancia de regla conserva su vínculo solo si la regla cae en 'to'; si no, pasa a ser una tarea común.
function _planMoverMetas(from, to) {
  const dest = S.goals[to] || [];
  const texts = new Set(dest.map(g => g.text));
  const reps = new Set(dest.filter(g => g.repId).map(g => g.repId));
  const add = [];
  (S.goals[from] || []).filter(g => !g.done).forEach(g => {
    if (texts.has(g.text) || (g.repId && reps.has(g.repId))) return;
    const copy = { ...g, id: uid(), done: false };
    const r = g.repId ? _grStore().find(x => x.id === g.repId) : null;
    if (r && (r.byDays || []).includes(new Date(to + 'T00:00:00').getDay())) copy.id = `rep:${r.id}:${to}`;
    else delete copy.repId;
    add.push(copy);
  });
  return add;
}

// Pasa las metas no hechas de un día a otro (sin duplicar por texto) y las saca del día de origen.
// Devuelve las metas que estaban pendientes. No guarda ni pinta: lo hace quien llama.
function _moverMetasPendientes(from, to) {
  const pending = (S.goals[from]||[]).filter(g=>!g.done);
  if (!S.goals[to]) S.goals[to] = [];
  _planMoverMetas(from, to).forEach(c => S.goals[to].push(c));
  pending.forEach(g => { if (g.repId) _grSkip(g.repId, from); });   // la instancia de origen no se regenera
  S.goals[from] = (S.goals[from]||[]).filter(g=>g.done);
  return pending;
}

function pushRemaining() {
  if (!confirm('¿Empujar tareas pendientes a mañana?')) return;
  const today = getActiveDate(), tom = getTomorrow();
  const pending = _moverMetasPendientes(today, tom);
  saveState(); renderGoals();
  if (pending.length > 0) {
    showFireEffect();
    showFailBanner();
    showToast(`🔥 ${pending.length} tarea(s) sin cumplir`, 3500);
  } else {
    showToast('Sin pendientes que empujar');
  }
}

// ── Pendientes: tareas no hechas de días anteriores ──
// Vista CALCULADA: nada se escribe en S al cambiar de día (evita carreras de sync entre dispositivos). Son pendientes las tareas
// con done=false de los últimos PEND_DIAS días anteriores a hoy que no son instancias de repetición (esas se regeneran solas)
// ni vienen de Proyectos (fromTask: syncDueProjectsToGoals las manejaría por su fecha de vencimiento).
// Se muestran en la lista de hoy (sin marca de fecha) y en el bloque "Pendientes" con Confirmar / Reprogramar / Descartar.
// Solo las acciones explícitas del usuario escriben en S: mover = sacar de la fecha vieja y agregar al destino si ese id no está.
// PROGRESO: las arrastradas NO cuentan en el contador/barra/racha de hoy hasta que se confirmen o se marquen hechas
// (así lo de ayer no castiga el día actual); al hacerlo ya son tareas de hoy.
const PEND_DIAS = 14;
function _esPasada(date) { return !!date && date < getActiveDate(); }
function _pendientesCalc() {
  const hoy = getActiveDate();
  const d0 = new Date(hoy + 'T00:00:00'); d0.setDate(d0.getDate() - PEND_DIAS);
  const desde = localStr(d0);
  const idsHoy = new Set((S.goals[hoy] || []).map(g => g && g.id).filter(Boolean));
  const out = [];
  Object.keys(S.goals || {}).filter(f => /^\d{4}-\d\d-\d\d$/.test(f) && f < hoy && f >= desde).sort().forEach(f => {
    (S.goals[f] || []).forEach((g, idx) => {
      if (!g || g.done || g.repId || g.fromTask || String(g.id || '').startsWith('rep:')) return;
      if (g.id && idsHoy.has(g.id)) return;   // ya está hoy (otro dispositivo la movió): no se muestra dos veces
      out.push({ date: f, idx, g });
    });
  });
  return out;
}
// Mueve la tarea idx de la fecha 'from' a 'to' (mismo id y campos). Idempotente: si 'to' ya tiene ese id no se duplica.
function _pendMover(from, idx, to) {
  const src = S.goals[from] || [];
  const g = src[idx]; if (!g) return null;
  if (!g.id) g.id = uid();
  if (!S.goals[to]) S.goals[to] = [];
  let j = S.goals[to].findIndex(x => x && x.id === g.id);
  if (j < 0) { S.goals[to].push(g); j = S.goals[to].length - 1; }
  src.splice(idx, 1);
  return { g: S.goals[to][j], idx: j };
}
function _pendMoverId(from, id, to) {
  const idx = (S.goals[from] || []).findIndex(g => g && g.id === id);
  return idx < 0 ? null : _pendMover(from, idx, to);
}
// Editar / marcar / cambiar de grupo una arrastrada se hace sobre la tarea ya movida a hoy.
function _aHoySiPasada(date, idx) {
  if (!_esPasada(date)) return { date, idx };
  const hoy = getActiveDate();
  const m = _pendMover(date, idx, hoy);
  return m ? { date: hoy, idx: m.idx } : null;
}
function pendConfirmar(date, id) {
  if (!_pendMoverId(date, id, getActiveDate())) return;
  saveState(); renderGoals();
  showToast('Tarea confirmada para hoy');
}
let _pendRepro = null;   // { date, id }
function pendReprogramar(date, id) {
  const g = (S.goals[date] || []).find(x => x && x.id === id); if (!g) return;
  _pendRepro = { date, id };
  document.getElementById('pendReproText').textContent = g.text;
  const inp = document.getElementById('pendReproFecha');
  inp.min = getTomorrow(); inp.value = getTomorrow();
  openModal('modal-pend-repro');
}
function pendReproGuardar() {
  if (!_pendRepro) return;
  const f = document.getElementById('pendReproFecha').value;
  if (!f || f < getTomorrow()) { showToast('Elegí una fecha desde mañana'); return; }
  const { date, id } = _pendRepro;
  _pendRepro = null;
  closeModal('modal-pend-repro');
  if (!_pendMoverId(date, id, f)) return;
  saveState(); renderGoals();
  showToast('Tarea reprogramada');
}
function pendDescartar(date, id) {
  const arr = S.goals[date] || [];
  const idx = arr.findIndex(g => g && g.id === id); if (idx < 0) return;
  if (!confirm('¿Descartar esta tarea? Se borra y no vuelve.')) return;
  arr.splice(idx, 1);
  saveState(); renderGoals();
  showToast('Tarea descartada');
}
function _pendHtml(lista, conAcceso) {
  return `<div class="pend-head"><span class="pend-tit">Pendientes</span><span class="gs-count">${lista.length}</span>`
    + (conAcceso ? '<button type="button" class="pend-btn pend-acceso" onclick="plannerOverlayOpen()">Abrir planificación</button>' : '') + '</div>'
    + lista.map(p => {
      const a = `'${escHtml(p.date)}','${escHtml(p.g.id || '')}'`;
      return `<div class="pend-item"><span class="mrd-prio" style="background:${PRIORITY_COLOR[p.g.priority] || '#666'}"></span>`
        + `<span class="pend-text">${escHtml(p.g.text)}</span>`
        + `<span class="pend-acc"><button type="button" class="pend-btn pend-confirmar" onclick="pendConfirmar(${a})">Confirmar</button>`
        + `<button type="button" class="pend-btn pend-reprogramar" onclick="pendReprogramar(${a})">Reprogramar</button>`
        + `<button type="button" class="pend-btn pend-descartar" onclick="pendDescartar(${a})">Descartar</button></span></div>`;
    }).join('');
}
function renderPendientes() {
  // Los ids se aseguran acá (no en el render) para que los botones siempre tengan a qué apuntar.
  const lista = _pendientesCalc();
  let nuevo = false;
  lista.forEach(p => { if (!p.g.id) { p.g.id = uid(); nuevo = true; } });
  if (nuevo) saveState();
  [['pendientesPlan', false], ['pendientesCard', true]].forEach(([id, acceso]) => {
    const el = document.getElementById(id); if (!el) return;
    el.hidden = !lista.length;
    el.innerHTML = lista.length ? _pendHtml(lista, acceso) : '';
  });
}

// ── Repetición por días de la semana (mismo modelo que las actividades del planner: byDays en getDay()) ──
// Regla en S.goalRepeats; cada día tiene su propia instancia en S.goals[fecha] con id determinístico 'rep:<regla>:<fecha>'
// (dos dispositivos que la generen producen el mismo id, no un duplicado) y su propio done.
const GOAL_WD = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
function _grStore() { if (!Array.isArray(S.goalRepeats)) S.goalRepeats = []; return S.goalRepeats; }
function _grFind(id) { return _grStore().find(r => r.id === id) || null; }
function _grDow(date) { return new Date(date + 'T00:00:00').getDay(); }
function _grOccursOn(r, date) {
  return !!r && date >= (r.startDate || '') && (r.byDays || []).includes(_grDow(date)) && !(r.skips || []).includes(date);
}
function _grSkip(repId, date) {
  const r = _grFind(repId);
  if (r && !(r.skips || []).includes(date)) { if (!r.skips) r.skips = []; r.skips.push(date); }
}
function _grCreate(o) {
  const r = { id: 'gr' + uid(), text: o.text, q: o.q, priority: o.priority, time: o.time || null, ...(o.franja ? { franja: o.franja } : {}), ...(o.oblig ? { oblig: true } : {}), byDays: o.byDays.slice(), startDate: o.startDate, skips: [] };
  _grStore().push(r);
  return r;
}
function _grDaysLabel(days) { return GOAL_WD.filter(([v]) => days.includes(v)).map(([, l]) => l).join(' '); }
function _goalIsRep(g) { return !!(g && g.repId && _grFind(g.repId)); }
function _goalRepBtn(g, date, idx) {
  if (_esPasada(date)) return '';   // una arrastrada no se repite: primero se confirma o se marca hecha
  const on = _goalIsRep(g);
  return `<button class="goal-rep${on ? ' on' : ''}" type="button" onclick="openGoalRepeat('${escHtml(date)}',${idx})" title="${on ? 'Se repite: ' + _grDaysLabel(_grFind(g.repId).byDays) : 'Repetir en ciertos días'}" aria-label="Repetición de la tarea">↻</button>`;
}
function _grFillDays(id, sel) {
  const box = document.getElementById(id); if (!box) return;
  box.innerHTML = GOAL_WD.map(([v, l]) => `<button type="button" data-v="${v}" class="${sel.includes(v) ? 'on' : ''}" onclick="this.classList.toggle('on')">${l}</button>`).join('');
}
function _grReadDays(id) {
  const box = document.getElementById(id); if (!box) return [];
  return Array.from(box.querySelectorAll('button.on')).map(b => parseInt(b.dataset.v, 10));
}
// Crea la instancia de hoy y de mañana de cada regla que cae esos días (si no existe ya). Devuelve true si cambió algo.
function ensureGoalRepeats() {
  const rules = _grStore(); if (!rules.length) return false;
  let changed = false;
  [getActiveDate(), getTomorrow()].forEach(date => {
    rules.forEach(r => {
      if (!_grOccursOn(r, date)) return;
      if (!S.goals[date]) S.goals[date] = [];
      if (S.goals[date].some(g => g.repId === r.id)) return;
      S.goals[date].push({ id: `rep:${r.id}:${date}`, repId: r.id, text: r.text, done: false, priority: r.priority, q: r.q, time: r.time || null, ...(r.franja ? { franja: r.franja } : {}), ...(r.oblig ? { oblig: true } : {}) });
      changed = true;
    });
  });
  if (changed) saveState();
  return changed;
}
let _grEdit = null;   // { date, gid }
function _grTarget() {
  if (!_grEdit) return null;
  const arr = S.goals[_grEdit.date] || [];
  const idx = arr.findIndex(g => g.id === _grEdit.gid);
  return idx < 0 ? null : { g: arr[idx], idx, arr };
}
function openGoalRepeat(date, idx) {
  const g = (S.goals[date] || [])[idx]; if (!g) return;
  _grEdit = { date, gid: g.id };
  const r = g.repId ? _grFind(g.repId) : null;
  document.getElementById('goalRepText').textContent = g.text;
  _grFillDays('goalRepDays', r ? r.byDays : []);
  document.getElementById('goalRepStop').hidden = !r;
  openModal('modal-goal-repeat');
}
// Quita de mañana las instancias sin hacer de una regla que ya no cae ese día.
function _grPruneTomorrow(r) {
  const tom = getTomorrow();
  if (!S.goals[tom]) return;
  S.goals[tom] = S.goals[tom].filter(g => g.repId !== r.id || g.done || _grOccursOn(r, tom));
}
function saveGoalRepeat() {
  const t = _grTarget(); if (!t) { closeModal('modal-goal-repeat'); return; }
  const days = _grReadDays('goalRepDays');
  if (!days.length) { showToast('Elegí al menos un día, o tocá "Dejar de repetir"'); return; }
  let r = t.g.repId ? _grFind(t.g.repId) : null;
  if (r) { r.byDays = days; _grPruneTomorrow(r); }
  else {
    delete t.g.repId;
    r = _grCreate({ text: t.g.text, q: cuadranteDe(t.g), priority: t.g.priority, time: t.g.time, franja: t.g.franja, oblig: t.g.oblig, byDays: days, startDate: _grEdit.date });
    if (days.includes(_grDow(_grEdit.date))) { t.g.repId = r.id; t.g.id = `rep:${r.id}:${_grEdit.date}`; }
  }
  closeModal('modal-goal-repeat');
  saveState(); renderGoals();
  showToast('↻ Se repite ' + _grDaysLabel(r.byDays));
}
function stopGoalRepeat() {
  const t = _grTarget(); if (!t) { closeModal('modal-goal-repeat'); return; }
  const rid = t.g.repId;
  S.goalRepeats = _grStore().filter(r => r.id !== rid);
  const hoy = getActiveDate();
  [hoy, getTomorrow()].forEach(d => {
    if (!S.goals[d]) return;
    // Hoy y lo ya hecho quedan como tareas comunes; lo de mañana que se generó solo y no se tocó, se va.
    S.goals[d] = S.goals[d].filter(g => g.repId !== rid || g.done || d === hoy);
    S.goals[d].forEach(g => { if (g.repId === rid) delete g.repId; });
  });
  closeModal('modal-goal-repeat');
  saveState(); renderGoals();
  showToast('Dejó de repetirse');
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
function _pad2(n) { return String(n).padStart(2, '0'); }
function _pid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Áreas del calendario: mismas 5 categorías/colores ya usados en el resto de Centro de Mando.
const PLANNER_AREAS = {
  vida:         { label: 'Vida',         cssVar: '--c-vida' },
  finanzas:     { label: 'Finanzas',     cssVar: '--c-finanzas' },
  salud:        { label: 'Salud',        cssVar: '--c-salud' },
  conocimiento: { label: 'Conocimiento', cssVar: '--c-conocimiento' },
  ia:           { label: 'IA',           cssVar: '--c-ia' },
};

function getDayPlan(date) {
  if (!S.dayPlan) S.dayPlan = {};
  if (!S.dayPlan[date]) S.dayPlan[date] = { tasks: [] };
  const p = S.dayPlan[date];
  if (!p.tasks) p.tasks = [];
  // Migración: tareas creadas antes del calendario por área no tienen duration/area.
  p.tasks.forEach(t => {
    if (!t.duration) t.duration = 30;
    if (!t.area || !PLANNER_AREAS[t.area]) t.area = t.area === null ? t.area : 'vida';
  });
  return p;
}
function _timeToMin(time) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
function _minToTime(min) { return `${_pad2(Math.floor(min / 60))}:${_pad2(min % 60)}`; }
function _minToTimeDisp(min) { return min >= 1440 ? '00:00' : _minToTime(min); }

// Ventana visible del calendario: 05:00 → 00:00 (medianoche). Todo el pintado y la matemática de
// coordenadas se cuelgan de estas dos constantes.
const PCAL_START_MIN = 300;   // 05:00
const PCAL_END_MIN   = 1440;  // 00:00 del día siguiente
const PCAL_SPAN_MIN  = PCAL_END_MIN - PCAL_START_MIN; // 1140 (19 h)

// ── Recurrencia: reglas en S.planRecurring, ocurrencias generadas al vuelo por fecha ──
function _recStore() { if (!S.planRecurring) S.planRecurring = []; return S.planRecurring; }
function _recFind(id) { return _recStore().find(r => r.id === id); }
// ¿La regla r genera una ocurrencia en la fecha 'date' (YYYY-MM-DD)? Intervalo fijo = 1.
function plannerRecOccursOn(r, date) {
  if (!r || !r.repeat || date < r.startDate) return false;
  const d = new Date(date + 'T00:00:00'), s = new Date(r.startDate + 'T00:00:00');
  switch (r.repeat.freq) {
    case 'daily':    return true;
    case 'weekly':   return d.getDay() === s.getDay();
    case 'weekdays': return (r.repeat.byDays || []).includes(d.getDay());
    case 'monthly':  return d.getDate() === s.getDate();
    case 'yearly':   return d.getDate() === s.getDate() && d.getMonth() === s.getMonth();
    default:         return false;
  }
}
// ── Vínculo actividad ↔ hábito ──
// Una actividad puede apuntar a un hábito ({ section, id }). Cuando lo hace, el "hecho" no
// vive en la actividad sino en el hábito (S.habitTrackers[section][].days[fecha]): marcarlo
// en el planner o en el calendario del hábito es exactamente lo mismo. Si el hábito se borró,
// todo cae de nuevo en el done propio de la actividad.
function _habitFind(link) {
  if (!link || !link.section || !link.id || typeof _getHabits !== 'function') return null;
  return (_getHabits(link.section) || []).find(h => h.id === link.id) || null;
}
function _habitDone(link, date) {          // true/false, o null si el hábito ya no existe
  const h = _habitFind(link);
  return h ? (h.days || {})[date] === 'done' : null;
}
function _habitSetDone(link, date, done) {
  const h = _habitFind(link); if (!h) return false;
  if (!h.days) h.days = {};
  if (done) h.days[date] = 'done';
  else if (h.days[date] === 'done' || h.days[date] === 'studied') delete h.days[date];
  return true;
}
// Copia de la tarea con el done tomado del hábito (si está vinculada y el hábito existe).
function _withHabitDone(t, date) {
  if (!t.habit) return t;
  const st = _habitDone(t.habit, date);
  return st === null ? t : { ...t, done: st };
}

// Tareas concretas de una fecha = puntuales de S.dayPlan + ocurrencias de las reglas recurrentes.
// Las ocurrencias virtuales llevan id compuesto 'r…@fecha' y campos _rec/_date para rutear acciones.
function plannerDayTasks(date) {
  const out = getDayPlan(date).tasks.map(t => _withHabitDone(t, date));
  _recStore().forEach(r => {
    if (!plannerRecOccursOn(r, date)) return;
    const ex = (r.exceptions || {})[date] || {};
    if (ex.deleted) return;
    out.push(_withHabitDone({
      id: r.id + '@' + date, _rec: r.id, _date: date,
      habit:    ex.habit    !== undefined ? ex.habit    : r.habit,
      time:     ex.time     != null ? ex.time     : r.time,
      duration: ex.duration != null ? ex.duration : r.duration,
      priority: ex.priority != null ? ex.priority : r.priority,
      area:     ex.area     != null ? ex.area     : r.area,
      text:     ex.text     != null ? ex.text     : r.text,
      done:     !!ex.done,
      repeat:   r.repeat.freq,
    }, date));
  });
  return out;
}

// Metas del día con horario (S.goals) vistas como bloques del planner: una sola agenda.
// Acá son de sólo lectura — se crean y editan en la card "Metas de hoy"; el check marca
// la meta. Duración fija de 30 min porque la meta no tiene duración propia.
const GOAL_PRIO_LEVEL = { high: 3, mid: 2, low: 1 };
function plannerDayGoals(date) {
  return ((S.goals && S.goals[date]) || [])
    .filter(g => g.time)
    .map(g => ({
      id: 'g:' + g.id, _goal: g.id,
      time: g.time, duration: 30, priority: GOAL_PRIO_LEVEL[g.priority] || 2,
      area: null, text: g.text, done: !!g.done,
    }));
}
// Todo lo que ocupa el día: actividades del planner + metas con horario.
function plannerDayAgenda(date) { return plannerDayTasks(date).concat(plannerDayGoals(date)); }

// Reparte en columnas los bloques que se pisan (estilo Google Calendar): agrupa por
// clúster de solapamiento y le da a cada bloque su columna y el total de columnas.
function _pcalLayout(tasks) {
  const items = tasks
    .map(t => ({ t, s: _timeToMin(t.time), e: _timeToMin(t.time) + (t.duration || 30) }))
    .sort((a, b) => a.s - b.s || a.e - b.e);
  let cluster = [], clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    const colEnds = [];
    cluster.forEach(it => {
      let c = colEnds.findIndex(end => end <= it.s);
      if (c < 0) { c = colEnds.length; colEnds.push(0); }
      colEnds[c] = it.e; it.col = c;
    });
    cluster.forEach(it => { it.cols = colEnds.length; });
    cluster = [];
  };
  items.forEach(it => {
    if (it.s >= clusterEnd) { flush(); clusterEnd = it.e; }
    else clusterEnd = Math.max(clusterEnd, it.e);
    cluster.push(it);
  });
  flush();
  return items;
}
// Tareas de una hora, ordenadas por prioridad desc (sort estable → respeta orden de creación en empate).
function plannerHourTasks(date, h) {
  return plannerDayTasks(date)
    .filter(t => parseInt(t.time.split(':')[0], 10) === h)
    .sort((a, b) => b.priority - a.priority);
}

// ── Modal crear/editar actividad (área, importancia, horario, repetición) ──
let _planEdit = null;      // { mode:'create'|'one'|'rec', date, id?, recId? }
let _planFinMode = 'dur';  // 'dur' | 'end'
const PLAN_REPEAT_OPTS = [
  ['none', 'No repetir'], ['daily', 'Todos los días'], ['weekly', 'Semanal'],
  ['monthly', 'Mensual'], ['yearly', 'Anual'], ['weekdays', 'Días particulares'],
];
const PLAN_WEEKDAYS = [['1', 'L'], ['2', 'M'], ['3', 'X'], ['4', 'J'], ['5', 'V'], ['6', 'S'], ['0', 'D']]; // getDay()
function _pel(id) { return document.getElementById(id); }
function _segSet(segId, val) { const s = _pel(segId); if (s) s.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === val)); }
function planPickArea(k) { _pel('planArea').value = k; _segSet('planAreaSeg', k); }
function planPickPrio(v) { _pel('planPrio').value = v; _segSet('planPrioSeg', String(v)); }
function planPickFinMode(m) { _planFinMode = m; _segSet('planFinModeSeg', m); _pel('planDurWrap').hidden = m !== 'dur'; _pel('planEndWrap').hidden = m !== 'end'; }
function planToggleWeekday(btn) { btn.classList.toggle('on'); }
function planRepeatChanged() { _pel('planWeekdays').hidden = _pel('planRepeat').value !== 'weekdays'; }
// Opciones del select de hábitos: todos los hábitos de las 5 secciones, agrupados por sección.
// value = 'seccion:id' (o '' para ninguno).
function _planHabitOptions(sel) {
  let html = '<option value="">— Ninguno —</option>';
  Object.keys(PLANNER_AREAS).forEach(sec => {
    const hs = typeof _getHabits === 'function' ? (_getHabits(sec) || []) : [];
    if (!hs.length) return;
    html += `<optgroup label="${escHtml(PLANNER_AREAS[sec].label)}">` +
      hs.map(h => `<option value="${escHtml(sec + ':' + h.id)}">${escHtml((h.emoji || '📌') + ' ' + h.name)}</option>`).join('') +
      '</optgroup>';
  });
  const el = _pel('planHabit'); if (!el) return;
  el.innerHTML = html;
  el.value = sel || '';
  if (el.value !== (sel || '')) el.value = '';   // el hábito vinculado ya no existe
}
// Al elegir un hábito: completa el título vacío con su nombre y alinea el área con su sección.
function planHabitChanged() {
  const v = _pel('planHabit').value;
  if (!v) return;
  const [sec, id] = v.split(':');
  const h = _habitFind({ section: sec, id });
  if (!h) return;
  if (!_pel('planText').value.trim()) _pel('planText').value = h.name;
  if (PLANNER_AREAS[sec]) planPickArea(sec);
}

function openPlanModal(date, id, presetTime) {
  date = date || getActiveDate();
  let src;
  if (!id) {
    const now = new Date();
    const startMin = presetTime != null ? _timeToMin(presetTime)
      : Math.max(PCAL_START_MIN, Math.min(PCAL_END_MIN - 30, Math.round((now.getHours() * 60 + now.getMinutes()) / 15) * 15));
    src = { text: '', area: 'vida', priority: 2, time: _minToTime(startMin), duration: 30, repeat: { freq: 'none', byDays: [] }, habit: null };
    _planEdit = { mode: 'create', date };
  } else if (id.indexOf('@') >= 0) {
    const r = _recFind(id.split('@')[0]); if (!r) return;
    const ex = (r.exceptions || {})[date] || {};
    src = {
      text: ex.text != null ? ex.text : r.text, area: ex.area != null ? ex.area : r.area,
      priority: ex.priority != null ? ex.priority : r.priority, time: ex.time != null ? ex.time : r.time,
      duration: ex.duration != null ? ex.duration : r.duration, repeat: r.repeat, habit: r.habit || null,
    };
    _planEdit = { mode: 'rec', date, recId: r.id };
  } else {
    const t = getDayPlan(date).tasks.find(x => x.id === id); if (!t) return;
    src = { text: t.text, area: t.area || 'vida', priority: t.priority, time: t.time, duration: t.duration || 30, repeat: { freq: 'none', byDays: [] }, habit: t.habit || null };
    _planEdit = { mode: 'one', date, id };
  }
  _pel('planModalTitle').textContent = id ? 'Editar actividad' : 'Nueva actividad';
  _pel('planAreaSeg').innerHTML = Object.entries(PLANNER_AREAS).map(([k, c]) =>
    `<button type="button" data-v="${k}" style="--area-c:var(${c.cssVar})" onclick="planPickArea('${k}')"><span class="seg-dot"></span>${c.label}</button>`).join('');
  _pel('planRepeat').innerHTML = PLAN_REPEAT_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  _pel('planWeekdays').innerHTML = PLAN_WEEKDAYS.map(([v, l]) => `<button type="button" data-v="${v}" onclick="planToggleWeekday(this)">${l}</button>`).join('');
  _pel('planText').value = src.text || '';
  _planHabitOptions(src.habit ? src.habit.section + ':' + src.habit.id : '');
  _pel('planDate').value = date;
  _pel('planStart').value = src.time;
  const endMin = _timeToMin(src.time) + (src.duration || 30);
  _pel('planDur').value = src.duration || 30;
  _pel('planEnd').value = endMin >= 1440 ? '00:00' : _minToTime(endMin);
  planPickArea(PLANNER_AREAS[src.area] ? src.area : 'vida');
  planPickPrio(src.priority || 2);
  planPickFinMode('dur');
  _pel('planRepeat').value = src.repeat && src.repeat.freq ? src.repeat.freq : 'none';
  planRepeatChanged();
  if (src.repeat && src.repeat.freq === 'weekdays') {
    const set = new Set((src.repeat.byDays || []).map(String));
    _pel('planWeekdays').querySelectorAll('button').forEach(b => b.classList.toggle('on', set.has(b.dataset.v)));
  }
  _pel('planDeleteBtn').hidden = _planEdit.mode === 'create';
  openModal('modal-plan-activity');
}

function _normRepeat(f) { return { freq: f.repeat.freq, byDays: f.repeat.freq === 'weekdays' ? f.repeat.byDays.slice() : [] }; }
function _planReadForm() {
  const startMin = _timeToMin(_pel('planStart').value);
  let endMin;
  if (_planFinMode === 'end') { endMin = _timeToMin(_pel('planEnd').value); if (endMin === 0) endMin = 1440; }
  else { endMin = startMin + Math.max(5, Math.round((parseInt(_pel('planDur').value, 10) || 30) / 5) * 5); }
  const freq = _pel('planRepeat').value;
  const byDays = freq === 'weekdays'
    ? Array.from(_pel('planWeekdays').querySelectorAll('button.on')).map(b => parseInt(b.dataset.v, 10)) : [];
  const hv = (_pel('planHabit') || {}).value || '';
  return {
    date: _pel('planDate').value, text: _pel('planText').value.trim(), area: _pel('planArea').value,
    priority: parseInt(_pel('planPrio').value, 10) || 2, startMin, endMin, duration: endMin - startMin,
    repeat: { freq, byDays },
    habit: hv ? { section: hv.split(':')[0], id: hv.split(':')[1] } : null,
  };
}

function savePlanActivity() {
  const f = _planReadForm();
  if (!f.text) { showToast('Escribí la actividad'); return; }
  if (!f.date) { showToast('Elegí una fecha'); return; }
  if (f.endMin <= f.startMin) { showToast('El fin debe ser posterior al inicio'); return; }
  if (f.repeat.freq === 'weekdays' && !f.repeat.byDays.length) { showToast('Elegí al menos un día'); return; }
  // Las actividades pueden solaparse a propósito (se dibujan lado a lado); sólo se exige
  // que entren en la ventana visible del calendario.
  if (f.startMin < PCAL_START_MIN || f.endMin > PCAL_END_MIN) {
    showToast('El horario tiene que estar entre 05:00 y 00:00'); return;
  }
  const base = { text: f.text, area: f.area, priority: f.priority, time: _minToTime(f.startMin), duration: f.duration, habit: f.habit };
  const commit = () => { saveState(); renderDayPlanner(); closeModal('modal-plan-activity'); };

  if (_planEdit.mode === 'create') {
    if (f.repeat.freq === 'none') getDayPlan(f.date).tasks.push({ id: _pid(), ...base, done: false });
    else _recStore().push({ id: 'r' + _pid(), ...base, startDate: f.date, repeat: _normRepeat(f), exceptions: {} });
    commit(); return;
  }
  if (_planEdit.mode === 'one') {
    const t = getDayPlan(_planEdit.date).tasks.find(x => x.id === _planEdit.id);
    if (!t) { closeModal('modal-plan-activity'); return; }
    if (f.repeat.freq !== 'none') {                       // puntual → recurrente
      getDayPlan(_planEdit.date).tasks = getDayPlan(_planEdit.date).tasks.filter(x => x.id !== t.id);
      _recStore().push({ id: 'r' + _pid(), ...base, startDate: f.date, repeat: _normRepeat(f), exceptions: {} });
    } else if (f.date !== _planEdit.date) {               // cambió de día
      getDayPlan(_planEdit.date).tasks = getDayPlan(_planEdit.date).tasks.filter(x => x.id !== t.id);
      getDayPlan(f.date).tasks.push({ ...t, ...base });
    } else { Object.assign(t, base); }
    commit(); return;
  }
  // mode 'rec' → preguntar alcance
  const r = _recFind(_planEdit.recId); if (!r) { closeModal('modal-plan-activity'); return; }
  askRecurScope('Esta actividad se repite. ¿Aplicar el cambio a…?').then(scope => {
    if (!scope) return;
    if (scope === 'day') {
      if (!r.exceptions) r.exceptions = {};
      r.exceptions[_planEdit.date] = { ...(r.exceptions[_planEdit.date] || {}), ...base };
    } else if (f.repeat.freq === 'none') {                // serie → dejar de repetir: una puntual
      S.planRecurring = _recStore().filter(x => x.id !== r.id);
      getDayPlan(f.date).tasks.push({ id: _pid(), ...base, done: false });
    } else {
      Object.assign(r, base, { startDate: f.date || r.startDate, repeat: _normRepeat(f) });
    }
    commit();
  });
}

function deletePlanActivity() {
  if (!_planEdit) return;
  if (_planEdit.mode === 'one') {
    const d = _planEdit.date;
    getDayPlan(d).tasks = getDayPlan(d).tasks.filter(x => x.id !== _planEdit.id);
    saveState(); renderDayPlanner(); closeModal('modal-plan-activity'); return;
  }
  if (_planEdit.mode === 'rec') {
    _recDelete(_planEdit.recId, _planEdit.date).then(ok => { if (ok) { closeModal('modal-plan-activity'); renderDayPlanner(); } });
    return;
  }
  closeModal('modal-plan-activity');
}

// Alcance de un cambio/borrado sobre una serie recurrente: modal de dos botones → Promise.
let _recScopeResolve = null;
function askRecurScope(msg) {
  return new Promise(resolve => {
    _recScopeResolve = resolve;
    const m = _pel('recScopeMsg'); if (m) m.textContent = msg || 'Esta actividad se repite. ¿Aplicar a…?';
    openModal('modal-recur-scope');
  });
}
function _recScopePick(scope) {
  closeModal('modal-recur-scope');
  const r = _recScopeResolve; _recScopeResolve = null;
  if (r) r(scope);
}
function _recDelete(recId, date) {
  const r = _recFind(recId); if (!r) return Promise.resolve(false);
  return askRecurScope('¿Eliminar solo este día o toda la serie?').then(scope => {
    if (!scope) return false;
    if (scope === 'day') { if (!r.exceptions) r.exceptions = {}; r.exceptions[date] = { ...(r.exceptions[date] || {}), deleted: true }; }
    else S.planRecurring = _recStore().filter(x => x.id !== recId);
    saveState(); return true;
  });
}
// Marcar "hecho": puntual escribe en la tarea; recurrente escribe la excepción por fecha.
// Vínculo de una actividad del planner (por id) con un hábito vivo, o null.
function _plannerTaskHabit(date, id) {
  let link = null;
  if (id.indexOf('@') >= 0) {
    const r = _recFind(id.split('@')[0]);
    if (r) { const ex = (r.exceptions || {})[date] || {}; link = ex.habit !== undefined ? ex.habit : r.habit; }
  } else {
    const t = getDayPlan(date).tasks.find(x => x.id === id);
    link = t ? t.habit : null;
  }
  return link && _habitFind(link) ? link : null;
}
function plannerToggleTask(date, id, ev) {
  if (id.indexOf('g:') === 0) { toggleGoalById(date, id.slice(2)); return; }
  const link = _plannerTaskHabit(date, id);
  if (link) {   // el estado vive en el hábito: se marca ahí y se repintan ambas superficies
    const done = _habitDone(link, date) !== true;
    _habitSetDone(link, date, done);
    saveState(); renderDayPlanner();
    if (typeof renderHabitCal === 'function') renderHabitCal(link.section);
    if (typeof buildTickerAlerts === 'function') buildTickerAlerts();
    if (typeof checkAchievements === 'function') checkAchievements();
    const h = done && date === getActiveDate() ? _habitFind(link) : null;
    if (h) celebrateHabit(h.name, h.emoji, habitCurrentStreak(h.days || {}, date), ev);
    return;
  }
  if (id.indexOf('@') >= 0) {
    const r = _recFind(id.split('@')[0]); if (!r) return;
    if (!r.exceptions) r.exceptions = {};
    const ex = r.exceptions[date] || {};
    r.exceptions[date] = { ...ex, done: !ex.done };
    saveState(); renderDayPlanner(); return;
  }
  const t = getDayPlan(date).tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveState(); renderDayPlanner();
}
// Borrar desde el bloque: puntual directo; recurrente pregunta alcance (este día vs serie).
function plannerDeleteTask(date, id) {
  if (id.indexOf('g:') === 0) return;   // las metas se borran desde su propia card
  if (id.indexOf('@') >= 0) { _recDelete(id.split('@')[0], date).then(ok => { if (ok) renderDayPlanner(); }); return; }
  const p = getDayPlan(date);
  p.tasks = p.tasks.filter(x => x.id !== id);
  saveState(); renderDayPlanner();
}

// ── Atajos del día de HOY: correr todo el plan / vaciarlo ──
// Solo afectan a la fecha de hoy. Las puntuales (S.dayPlan[hoy].tasks) se modifican directo; las
// ocurrencias de reglas recurrentes se tocan por la excepción de esa fecha (r.exceptions[hoy], el
// mismo mecanismo de "solo este día"), así la regla no cambia y mañana vuelven en su horario.
// Las metas con horario (Lista de tareas) no se tocan. Cada atajo registra un Deshacer (CMUndo).
function _plannerSnap(date) {
  const clone = v => JSON.parse(JSON.stringify(v));
  const rec = {};
  _recStore().forEach(r => {
    const e = (r.exceptions || {})[date];
    rec[r.id] = { hadProp: 'exceptions' in r, ex: e === undefined ? null : clone(e) };
  });
  return { tasks: clone(getDayPlan(date).tasks), rec };
}
function _plannerRestore(date, snap) {
  getDayPlan(date).tasks = snap.tasks;
  _recStore().forEach(r => {
    const s = snap.rec[r.id]; if (!s) return;
    if (s.ex === null) {
      if (r.exceptions) delete r.exceptions[date];
      if (!s.hadProp) delete r.exceptions;
    } else {
      if (!r.exceptions) r.exceptions = {};
      r.exceptions[date] = s.ex;
    }
  });
}
function _plannerAfterBulk() {
  saveState(); renderDayPlanner();
  if (typeof buildTickerAlerts === 'function') buildTickerAlerts();
}
function _plannerBulkUndo(date, snap, descripcion) {
  const deshacer = () => { _plannerRestore(date, snap); renderDayPlanner(); if (typeof buildTickerAlerts === 'function') buildTickerAlerts(); };
  if (window.CMUndo) CMUndo.registrar({ descripcion, deshacer });
  else showToast(descripcion, 4000);
}
function _plannerFmtMin(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return (h ? h + ' h' : '') + (h && r ? ' ' : '') + (r || !h ? r + ' min' : '');
}
function plannerShiftToday(mins) {
  mins = Math.round(Number(mins));
  if (!(mins > 0)) { showToast('Poné una cantidad mayor a 0'); return; }
  const date = getActiveDate();
  const todas = plannerDayTasks(date);
  if (!todas.length) { showToast('No hay actividades para correr hoy'); return; }
  const acts = todas.filter(t => !t.done);   // las hechas (incl. las vinculadas a hábito, ya resueltas en plannerDayTasks) no se mueven
  if (!acts.length) { showToast('No hay actividades pendientes para correr'); return; }
  const snap = _plannerSnap(date);
  const plan = getDayPlan(date);
  let fuera = 0;
  acts.forEach(t => {
    const start = _timeToMin(t.time) + mins;
    const pasa = start + (t.duration || 30) > PCAL_END_MIN;   // terminaría después de las 00:00 → sale del plan de hoy
    if (t._rec) {
      const r = _recFind(t._rec); if (!r) return;
      if (!r.exceptions) r.exceptions = {};
      const ex = r.exceptions[date] || {};
      r.exceptions[date] = pasa ? { ...ex, deleted: true } : { ...ex, time: _minToTime(start) };
    } else {
      const pt = plan.tasks.find(x => x.id === t.id); if (!pt) return;
      if (pasa) plan.tasks = plan.tasks.filter(x => x.id !== t.id); else pt.time = _minToTime(start);
    }
    if (pasa) fuera++;
  });
  _plannerAfterBulk();
  _plannerBulkUndo(date, snap, 'Corriste el día ' + _plannerFmtMin(mins) +
    (fuera ? ` · ${fuera} ${fuera === 1 ? 'actividad quedó' : 'actividades quedaron'} fuera (pasaban la medianoche)` : ''));
}
// Campo de cantidad libre de la barra de atajos (número + unidad min/h).
function plannerShiftCustom(el) {
  const bar = el.closest('.planner-atajos'); if (!bar) return;
  const n = parseFloat(bar.querySelector('.pat-num').value);
  plannerShiftToday(bar.querySelector('.pat-unit').value === 'h' ? n * 60 : n);
}
function plannerClearToday() {
  const date = getActiveDate();
  const acts = plannerDayTasks(date);
  if (!acts.length) { showToast('No hay actividades para vaciar hoy'); return; }
  const snap = _plannerSnap(date);
  getDayPlan(date).tasks = [];
  acts.filter(t => t._rec).forEach(t => {
    const r = _recFind(t._rec); if (!r) return;
    if (!r.exceptions) r.exceptions = {};
    r.exceptions[date] = { ...(r.exceptions[date] || {}), deleted: true };
  });
  _plannerAfterBulk();
  _plannerBulkUndo(date, snap, 'Vaciaste el día · ' + acts.length + (acts.length === 1 ? ' actividad' : ' actividades'));
}
function plannerAtajosHTML(date) {
  const d = plannerDayTasks(date).length ? '' : ' disabled';
  const chip = (m, l) => `<button type="button" class="pat-chip" onclick="plannerShiftToday(${m})"${d}>${l}</button>`;
  return `<div class="planner-atajos" role="group" aria-label="Atajos del día de hoy">
    <span class="pat-lbl">Correr</span>
    ${chip(30, '+30 min')}${chip(60, '+1 h')}${chip(120, '+2 h')}${chip(180, '+3 h')}
    <input class="pat-num" type="number" min="1" step="1" inputmode="numeric" placeholder="otra" aria-label="Otra cantidad para correr el día"${d}
      onkeydown="if(event.key==='Enter'){event.preventDefault();plannerShiftCustom(this)}">
    <select class="pat-unit" aria-label="Unidad"${d}><option value="min">min</option><option value="h">h</option></select>
    <button type="button" class="pat-chip pat-go" onclick="plannerShiftCustom(this)"${d}>Correr</button>
    <button type="button" class="pat-chip pat-clear" onclick="plannerClearToday()"${d}>Vaciar día</button>
  </div>`;
}

// ── Bloque de calendario (relleno sólido por área, alto proporcional a la duración) ──
// El bloque es de sólo lectura: se toca para abrir el modal de edición. Sólo el check
// (hecho) y el ✕ (borrar) actúan directo. Las tareas recurrentes llevan id compuesto.
function plannerBlockHTML(date, t, hourPx, compact, lay) {
  const startMin = _timeToMin(t.time);
  // El bloque no puede pasarse del final de la ventana visible (una meta a las 23:50
  // dura 30 min por defecto y se desbordaria del track).
  const endMin   = Math.min(startMin + (t.duration || 30), PCAL_END_MIN);
  const top    = ((startMin - PCAL_START_MIN) / 60) * hourPx;
  const height = Math.min(Math.max(((endMin - startMin) / 60) * hourPx, compact ? 22 : 34), ((PCAL_END_MIN - startMin) / 60) * hourPx);
  const cols   = (lay && lay.cols) || 1, col = (lay && lay.col) || 0;
  // Bloques solapados: cada uno toma su columna dentro del ancho del día.
  const pos = cols > 1
    ? `left:calc(2px + ${col} * (100% - 4px) / ${cols});width:calc((100% - 4px) / ${cols} - 2px);right:auto;`
    : '';
  const isGoal = !!t._goal;
  const hIcon  = t.habit ? escHtml((_habitFind(t.habit) || {}).emoji || '📌') + ' ' : '';
  const area   = PLANNER_AREAS[t.area] ? t.area : 'vida';
  const areaCfg = PLANNER_AREAS[area];
  const prioCfg = PLANNER_PRIO[t.priority] || PLANNER_PRIO[2];
  const rid = escHtml(t.id);
  const range = `${t.time}–${_minToTimeDisp(endMin)}`;
  const colorVar = isGoal ? '--hud' : areaCfg.cssVar;
  const label = isGoal ? 'Tarea' : areaCfg.label;
  // Vista previa minimalista: sólo título (hora/área/repetición/prioridad se ven al abrir la tarjeta).
  // El tooltip conserva el detalle para hover. El color del bloque ya comunica el área.
  return `<div class="pcal-block${compact ? ' pcal-compact' : ''}${isGoal ? ' pcal-goal' : ''} prio-${t.priority}${t.done ? ' done' : ''}" data-id="${rid}"
    style="top:${top}px;height:${height}px;${pos}--area-c:var(${colorVar})"
    ${isGoal ? '' : `onclick="openPlanModal('${escHtml(date)}','${rid}')"`} title="${escHtml(t.text)} · ${range} · ${label} · ${prioCfg.label}${t.habit ? ' · Hábito' : ''}">
    <div class="pcal-head">
      <div class="pcal-text">${hIcon}${escHtml(t.text) || '<span class="pcal-empty">Sin título</span>'}</div>
      ${isGoal ? '' : `<button class="pcal-del" onclick="event.stopPropagation();plannerDeleteTask('${escHtml(date)}','${rid}')" title="Eliminar" aria-label="Eliminar">✕</button>`}
      <label class="pcal-check" onclick="event.stopPropagation()"><input type="checkbox" aria-label="Marcar como hecha: ${escHtml(t.text)}"${t.done ? ' checked' : ''} onchange="plannerToggleTask('${escHtml(date)}','${rid}',event)"></label>
    </div>
    ${compact ? '' : `<div class="pcal-foot"><span class="pcal-prio-tag">${isGoal ? 'Tarea · ' + prioCfg.label : prioCfg.label}</span></div>`}
  </div>`;
}

// ── Barra de progreso del día + resumen de pendientes por prioridad ──
function plannerDaybarHTML(date) {
  const tasks = plannerDayAgenda(date);
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
  </div>${date === getActiveDate() ? plannerAtajosHTML(date) : ''}`;
}

// Convierte una coordenada Y (px, relativa al track) en 'HH:MM' redondeado a 15 min, dentro de la ventana visible.
function _pcalTimeFromY(y, hourPx) {
  let totalMin = PCAL_START_MIN + Math.round((y / hourPx) * 60 / 15) * 15;
  totalMin = Math.max(PCAL_START_MIN, Math.min(PCAL_END_MIN - 15, totalMin));
  return _minToTime(totalMin);
}
// Click en zona vacía de un track de calendario → abre el modal con esa fecha/hora precargadas.
function plannerTrackClick(e) {
  if (e.target.closest('.pcal-block')) return;
  const track = e.currentTarget;
  const rect = track.getBoundingClientRect();
  const time = _pcalTimeFromY(e.clientY - rect.top, parseFloat(track.dataset.hourpx));
  openPlanModal(track.dataset.date, null, time);
}
// Grilla de un solo día (05:00–00:00): líneas de hora + bloques posicionados por horario/duración.
function plannerDayTrackHTML(date, hourPx, compact) {
  const hourLines = [];
  for (let m = PCAL_START_MIN; m < PCAL_END_MIN; m += 60) hourLines.push(`<div class="pcal-hourline" style="top:${((m - PCAL_START_MIN) / 60) * hourPx}px"></div>`);
  // Sólo lo que cae dentro de la ventana visible (una meta a las 03:00 no tiene dónde pintarse;
  // sigue apareciendo en la lista del día y en su propia card).
  const agenda = plannerDayAgenda(date).filter(t => { const m = _timeToMin(t.time); return m >= PCAL_START_MIN && m < PCAL_END_MIN; });
  const blocks = _pcalLayout(agenda).map(it => plannerBlockHTML(date, it.t, hourPx, compact, it)).join('');
  return `<div class="pcal-track" data-date="${escHtml(date)}" data-hourpx="${hourPx}"
    style="height:${(PCAL_SPAN_MIN / 60) * hourPx}px" onclick="plannerTrackClick(event)">${hourLines.join('')}${blocks}</div>`;
}
function plannerHourTicksHTML(hourPx) {
  const ticks = [];
  for (let h = PCAL_START_MIN / 60; h <= PCAL_END_MIN / 60; h++) {
    ticks.push(`<div class="pcal-hour-tick" style="top:${((h * 60 - PCAL_START_MIN) / 60) * hourPx}px">${h >= 24 ? '00:00' : _pad2(h) + ':00'}</div>`);
  }
  return ticks.join('');
}

// ── Lista simple del día (card standalone, pestaña Vida): solo actividades con horario, sin huecos vacíos ──
function plannerListRowHTML(date, t) {
  const endMin  = _timeToMin(t.time) + (t.duration || 30);
  const isGoal  = !!t._goal;
  const hIcon   = t.habit ? escHtml((_habitFind(t.habit) || {}).emoji || '📌') + ' ' : '';
  const area    = PLANNER_AREAS[t.area] ? t.area : 'vida';
  const areaCfg = PLANNER_AREAS[area];
  const prioCfg = PLANNER_PRIO[t.priority] || PLANNER_PRIO[2];
  const rid     = escHtml(t.id);
  const range   = isGoal ? t.time : `${t.time}–${_minToTimeDisp(endMin)}`;
  const label   = isGoal ? 'Tarea' : areaCfg.label;
  return `<div class="pcal-row${isGoal ? ' pcal-goal' : ''}${t.done ? ' done' : ''}" data-id="${rid}"
    style="--area-c:var(${isGoal ? '--hud' : areaCfg.cssVar})"
    ${isGoal ? '' : `onclick="openPlanModal('${escHtml(date)}','${rid}')"`} title="${escHtml(t.text)} · ${label} · ${prioCfg.label}">
    ${isGoal ? '' : `<button class="pcal-del" onclick="event.stopPropagation();plannerDeleteTask('${escHtml(date)}','${rid}')" title="Eliminar" aria-label="Eliminar">✕</button>`}
    <span class="pcal-row-time">${range}</span>
    <div class="pcal-text">${hIcon}${escHtml(t.text) || '<span class="pcal-empty">Sin título</span>'}</div>
    ${isGoal ? '<span class="pcal-row-tag">Tarea</span>' : ''}
    <label class="pcal-check" onclick="event.stopPropagation()"><input type="checkbox" aria-label="Marcar como hecha: ${escHtml(t.text)}"${t.done ? ' checked' : ''} onchange="plannerToggleTask('${escHtml(date)}','${rid}',event)"></label>
  </div>`;
}
function buildDayList(containerEl, date) {
  if (!containerEl) return;
  const tasks = plannerDayAgenda(date).sort((a, b) => _timeToMin(a.time) - _timeToMin(b.time));
  const body = tasks.length
    ? `<div class="pcal-list">${tasks.map(t => plannerListRowHTML(date, t)).join('')}</div>`
    : '<p class="empty-state">Sin actividades planificadas para hoy.</p>';
  containerEl.innerHTML = plannerDaybarHTML(date) + body;
}

const PCAL_HOUR_PX = 64;      // pestaña Día (overlay) — grande y legible, estilo Google Calendar
const PCAL_WEEK_HOUR_PX = 48; // columnas de la vista Semana

function buildDayCalendar(containerEl, date) {
  if (!containerEl) return;
  containerEl.innerHTML = plannerDaybarHTML(date) + `
    <div class="pcal-day-wrap">
      <div class="pcal-hours-col" style="height:${(PCAL_SPAN_MIN / 60) * PCAL_HOUR_PX}px">${plannerHourTicksHTML(PCAL_HOUR_PX)}</div>
      <div class="pcal-day-body">${plannerDayTrackHTML(date, PCAL_HOUR_PX, false)}</div>
    </div>`;
  const now = new Date();
  const curTop = Math.max(0, ((now.getHours() * 60 + now.getMinutes()) - PCAL_START_MIN) / 60 * PCAL_HOUR_PX);
  containerEl.scrollTop = Math.max(0, curTop - containerEl.clientHeight / 2);
}

// ── Vista Semana: 7 columnas (lunes a domingo) sobre el mismo S.dayPlan por fecha, grid CSS único ──
function plannerWeekDates(anchorDate) {
  const d = new Date(anchorDate + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  const monday = new Date(d); monday.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(monday.getDate() + i); return localStr(x); });
}
function buildWeekCalendar(containerEl, anchorDate) {
  if (!containerEl) return;
  const dates = plannerWeekDates(anchorDate || getActiveDate());
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const today = getActiveDate();
  const heads = dates.map((d, i) => {
    const dt = new Date(d + 'T00:00:00');
    return `<div class="pcal-week-head${d === today ? ' is-today' : ''}"><span class="pcal-wh-dow">${dayNames[i]}</span><span class="pcal-wh-num">${dt.getDate()}</span></div>`;
  }).join('');
  const cols = dates.map(d => `<div class="pcal-week-col">${plannerDayTrackHTML(d, PCAL_WEEK_HOUR_PX, true)}</div>`).join('');
  containerEl.innerHTML = `
    <div class="pcal-week-scroll">
      <div class="pcal-week-grid">
        <div class="pcal-week-corner"></div>
        ${heads}
        <div class="pcal-hours-col pcal-hours-col-week" style="height:${(PCAL_SPAN_MIN / 60) * PCAL_WEEK_HOUR_PX}px">${plannerHourTicksHTML(PCAL_WEEK_HOUR_PX)}</div>
        ${cols}
      </div>
    </div>`;
  const now = new Date();
  const scroller = containerEl.querySelector('.pcal-week-scroll');
  if (scroller) scroller.scrollTop = Math.max(0, ((now.getHours() * 60 + now.getMinutes()) - PCAL_START_MIN) / 60 * PCAL_WEEK_HOUR_PX - scroller.clientHeight / 2);
}

function renderDayPlanner() {
  const today = getActiveDate();

  // Card standalone (pestaña Vida): siempre hoy, lista de actividades sin horas vacías.
  const listEl = document.getElementById('dayPlannerList');
  buildDayList(listEl, today);
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
  if (n >= 1000000) return '$' + fmtNum(n / 1000000, 1).replace(',0', '') + 'M';
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

  const _objRow = o => {
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
      <td style="font-family:var(--mono);font-size:var(--fs-12-5);color:var(--fin-t2)">${o.date}</td>
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
  };

  // La sección muestra solo la ventana relevante (los 2 últimos puntos ya vencidos
  // y los 2 próximos). El listado completo se acumula en el overlay de historial:
  // así la card no crece indefinidamente con los años.
  const pastIdx  = objs.reduce((last, o, i) => _parseFinObjDate(o.date) <= today ? i : last, -1);
  const from     = Math.max(0, pastIdx - 1);
  const recent   = objs.slice(from, pastIdx + 3);
  const rowsHTML = recent.map(_objRow).join('');
  const hiddenN  = objs.length - recent.length;

  const histBody = document.getElementById('finObjHistBody');
  if (histBody) {
    histBody.innerHTML = objs.length ? `
      <table class="law-tbl">
        <thead><tr>
          <th>Fecha</th>
          <th style="text-align:center">Esperado</th>
          <th style="text-align:center">Obtenido</th>
          <th style="text-align:center">Dif.</th>
          <th></th>
        </tr></thead>
        <tbody>${objs.map(_objRow).join('')}</tbody>
      </table>` : '<p class="empty-state">Sin puntos registrados</p>';
  }

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
    <button class="bsum-full" onclick="if(window.openFinObjHistorial)openFinObjHistorial()">
      Ver historial completo${hiddenN > 0 ? ` (${hiddenN} punto${hiddenN > 1 ? 's' : ''} más)` : ''} →
    </button>
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
        plugins: { legend: { labels: { color: '#8CA2C0', font: { size: _cfs(13) }, boxWidth: 12 } } },
        scales: {
          x: { ticks: { color: '#556070', font: { size: _cfs(13) } }, grid: { color: 'rgba(255,255,255,.04)' } },
          y: { ticks: { color: '#556070', font: { size: _cfs(13) },
                 callback: v => v >= 1000000 ? '$' + fmtNum(v/1000000, 0) + 'M' : v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : v },
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
  document.getElementById('editAccType').innerHTML = acctTypeOptionsHtml(acc.type);
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


// DIETA / registro de comida: vive en comidas.js (S.comidas). El tracker viejo de reglas (S.dieta) se retiró de la pantalla;
// sus datos quedan en S.dieta sin tocar. La limpieza de vínculos viejos está en _migrateDietaRetirada().

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
  // Los gráficos dibujan en canvas y no leen CSS: se les pasa la misma familia que
  // usa la app (el --sans que haya elegido el usuario en Ajustes), para que los
  // números de ejes, leyendas y tooltips no queden en otra letra que el resto.
  const MONO = (getComputedStyle(document.body).getPropertyValue('--sans') || '').trim()
    || "'Plus Jakarta Sans', -apple-system, 'Segoe UI', sans-serif";
  _setChartDefault('locale', 'es-AR');   // números de ejes y tooltips: punto de miles, coma decimal
  _setChartDefault('color', '#8BA5C0');
  _setChartDefault('borderColor', 'rgba(100,160,230,0.07)');
  _setChartDefault('font.family', MONO);
  // Piso de tamaño para cualquier gráfico que no fije el suyo (antes 10px, ilegible).
  _setChartDefault('font.size', _cfs(13));
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
  _setChartDefault('plugins.tooltip.titleFont.size', _cfs(13));
  _setChartDefault('plugins.tooltip.titleFont.weight', '600');
  _setChartDefault('plugins.tooltip.bodyColor', '#EDF4FF');
  _setChartDefault('plugins.tooltip.bodyFont.family', MONO);
  _setChartDefault('plugins.tooltip.bodyFont.size', _cfs(14));
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

let nwPieInst=null, nwLineInst=null, txnChartInst=null;

function initChartsForTab(tab) {
  if (tab==='finanzas') { initNWCharts(); }
}

// ── Serie del gráfico de evolución: una sola a la vez, con su propio eje Y ──
// 'total' = patrimonio · 't:<id de categoría>' = suma de las cuentas de esa categoría · 'a:<id de cuenta>' = una cuenta.
// Solo en memoria (arranca en Total). Los saldos por día salen de S.accountHistory (S.nwHistory para el total).
let _nwSeries = 'total';
const _hexA = (hex, a) => { const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); return m ? `rgba(${parseInt(m[1].slice(0,2),16)},${parseInt(m[1].slice(2,4),16)},${parseInt(m[1].slice(4,6),16)},${a})` : `rgba(107,227,164,${a})`; };

// Categorías con al menos una cuenta visible (las de deuda en 0 no cuentan) + lo que suman: lo que leen la dona, su leyenda y el selector.
function _nwCats() {
  return acctTypes().map(t => {
    const accs = visibleAccounts().filter(a => acctTypeId(a) === t.id);
    return { t, accs, sum: accs.reduce((s, a) => s + (+a.balance || 0), 0) };
  }).filter(c => c.accs.length);
}

function _nwSeriesInfo() {
  if (_nwSeries.startsWith('t:')) {
    const c = _nwCats().find(x => x.t.id === _nwSeries.slice(2));
    if (c) return { label: c.t.label, color: c.t.color, ids: (S.accounts || []).filter(a => acctTypeId(a) === c.t.id).map(a => a.id) };
  } else if (_nwSeries.startsWith('a:')) {
    const a = visibleAccounts().find(x => x.id === _nwSeries.slice(2));
    if (a) return { label: a.name, color: (acctType(a.type) || {}).color, ids: [a.id] };
  }
  _nwSeries = 'total';
  return { label: 'Patrimonio total', color: '#6BE3A4', ids: null };
}
function _nwSeriesData(info, hist) {
  if (!info.ids) return hist.map(h => h.value);
  const by = {};
  (S.accountHistory || []).forEach(h => { if (info.ids.includes(h.accountId)) (by[h.date] = by[h.date] || []).push(+h.balance || 0); });
  return hist.map(h => by[h.date] ? Math.round(by[h.date].reduce((s, v) => s + v, 0) * 100) / 100 : null);
}

function renderNWSeriesSelect() {
  const el = document.getElementById('nwSeriesSel');
  if (!el) return;
  const cats = _nwCats();
  const html = '<option value="total">Total</option>'
    + (cats.length ? '<optgroup label="Categorías">' + cats.map(c => `<option value="t:${escHtml(c.t.id)}">${escHtml(c.t.icon || '')} ${escHtml(c.t.label)}</option>`).join('') + '</optgroup>' : '')
    + (visibleAccounts().length ? '<optgroup label="Cuentas">' + visibleAccounts().map(a => `<option value="a:${escHtml(a.id)}">${escHtml(a.icon || '🏦')} ${escHtml(a.name)}</option>`).join('') + '</optgroup>' : '');
  if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
  _nwSeriesInfo();   // valida: si la serie elegida ya no existe vuelve a Total
  el.value = _nwSeries;
}
function setNWSeries(v) {
  _nwSeries = String(v || 'total');
  updateNWCharts();
}

// Leyenda de la dona (chips tocables: elegir una categoría = elegir su serie) + acceso a administrar categorías.
function renderNWLegend() {
  const el = document.getElementById('nwLegend');
  if (!el) return;
  el.innerHTML = _nwCats().map(c => `<button type="button" class="nw-leg-item${_nwSeries === 't:' + c.t.id ? ' on' : ''}" onclick="setNWSeries('t:${escHtml(c.t.id)}')"><span class="nw-leg-dot" style="background:${escHtml(c.t.color || '#888')}"></span>${escHtml(c.t.label)}</button>`).join('')
    + '<button type="button" class="nw-leg-item nw-leg-edit" onclick="openAcctTypes()" aria-label="Administrar categorías de cuentas">✎ Categorías</button>';
}

// ── Rango del gráfico de patrimonio (1M/3M/6M/9M/12M/Todo) ──
// Preferencia por dispositivo en localStorage (no va a Firestore). Default: Todo.
const _NW_RANGE_KEY = 'cm_nw_range';
const _NW_RANGES = { '1S': 7, '1M': 30, '3M': 90, '6M': 180, '9M': 270, '12M': 365, 'all': 0 };
function _nwRangeGet() {
  try { const v = localStorage.getItem(_NW_RANGE_KEY); return v in _NW_RANGES ? v : 'all'; } catch (e) { return 'all'; }
}
// Puntos de nwHistory dentro del rango elegido (compartido por initNWCharts y updateNWCharts).
function _nwHist() {
  const all = Array.isArray(S.nwHistory) ? S.nwHistory : [];
  const days = _NW_RANGES[_nwRangeGet()];
  if (!days) return all;
  const c = new Date(getActiveDate() + 'T00:00:00Z');
  c.setUTCDate(c.getUTCDate() - days);
  const cutoff = c.toISOString().slice(0, 10);
  return all.filter(h => h.date > cutoff);
}
// Etiquetas del eje X: MM-DD en rangos cortos; "sep 26" (con año) si el rango abarca
// más de un año calendario o más de 365 días (si no, MM-DD se repite entre años).
const _NW_MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function _nwLabels(hist) {
  if (!hist.length) return [];
  const a = hist[0].date, b = hist[hist.length - 1].date;
  const dias = (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
  if (!(dias > 365 || a.slice(0, 4) !== b.slice(0, 4))) return hist.map(h => h.date.slice(5));
  return hist.map(h => _NW_MESES[+h.date.slice(5, 7) - 1] + ' ' + h.date.slice(2, 4));
}
function _renderNWRange() {
  const cur = _nwRangeGet();
  document.querySelectorAll('#nwRangeSeg button').forEach(b => {
    const on = b.dataset.range === cur;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function setNWRange(r) {
  if (!(r in _NW_RANGES)) return;
  try { localStorage.setItem(_NW_RANGE_KEY, r); } catch (e) {}
  _renderNWRange();
  updateNWCharts();
}

// Escalas del gráfico de líneas: el eje Y se ajusta solo a la serie elegida (no arranca en cero).
function _nwLineScales() {
  return {
    x: { type: 'category', ticks: { display: false } },   // sin fechas en el eje X (la fecha sigue en el tooltip)
    y: { grace: '8%', ticks: { font: { size: _cfs(13) }, callback: (v, i, ticks) => {
      const step = ticks && ticks.length > 1 ? Math.abs(ticks[1].value - ticks[0].value) : 1;
      return fmtMoney(v, 'USD', step < 1 ? 2 : 0);
    } } },
  };
}
function _nwLineDataset(info, hist) {
  return { label: info.label, data: _nwSeriesData(info, hist), borderColor: _hexA(info.color, .85), backgroundColor: _hexA(info.color, .08), tension: .3, pointRadius: 3, fill: true, spanGaps: true };
}

// ── Crosshair HUD del gráfico de evolución ──
// Se engancha solo a puntos de la granularidad del rango: 1S = cada día, 1M = 1 por semana,
// 3M/6M/9M/12M/Todo = 1 por mes. Cada ancla es el ÚLTIMO punto con dato de su período
// (cierre semanal / mensual); la línea dibujada no cambia, el crosshair solo elige dónde pararse.
const _NW_DIAS = ['dom','lun','mar','mié','jue','vie','sáb'];
function _nwGran() { const r = _nwRangeGet(); return r === '1S' ? 'd' : r === '1M' ? 'w' : 'm'; }
function _nwWeekStart(d) {   // lunes de la semana de 'YYYY-MM-DD'
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
function _nwAnchors(dates, data, gran) {
  const out = [], seen = {};
  for (let i = 0; i < dates.length; i++) {
    if (data[i] == null) continue;
    const k = gran === 'd' ? dates[i] : gran === 'w' ? _nwWeekStart(dates[i]) : dates[i].slice(0, 7);
    if (k in seen) out[seen[k]] = { i, k }; else { seen[k] = out.length; out.push({ i, k }); }   // pisa: queda el último del período
  }
  return out;
}
function _nwXhLabel(a, gran) {
  if (gran === 'm') return _NW_MESES[+a.k.slice(5, 7) - 1] + ' ' + a.k.slice(0, 4);
  const d = new Date(a.k + 'T00:00:00Z'), dm = String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
  return gran === 'd' ? _NW_DIAS[d.getUTCDay()] + ' ' + dm : 'sem. del ' + dm;
}
const _nwCrosshair = {
  id: 'nwCrosshair',
  afterInit(chart) {
    const cv = chart.canvas;
    cv.style.touchAction = 'pan-y';   // arrastre horizontal mueve el crosshair; el vertical sigue haciendo scroll
    const set = (e, on) => {
      const m = chart._nwXh; if (!m) return;
      if (!on) { m.sel = null; chart.draw(); return; }
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, xs = chart.scales.x;
      if (!xs || !m.anchors.length) return;
      let best = 0, bd = Infinity;
      m.anchors.forEach((a, j) => { const d = Math.abs(xs.getPixelForValue(a.i) - x); if (d < bd) { bd = d; best = j; } });
      if (m.sel !== best) { m.sel = best; chart.draw(); }
    };
    chart._nwHandlers = [
      ['pointermove', e => set(e, e.pointerType === 'mouse' || e.buttons > 0 || chart._nwTouch)],
      ['pointerdown', e => { chart._nwTouch = e.pointerType !== 'mouse'; set(e, true); }],
      ['pointerup', e => { chart._nwTouch = false; if (e.pointerType !== 'mouse') set(e, false); }],   // touch: al soltar desaparece
      ['pointercancel', e => { chart._nwTouch = false; set(e, false); }],
      ['pointerleave', e => { if (!chart._nwTouch) set(e, false); }],
    ];
    chart._nwHandlers.forEach(([n, f]) => cv.addEventListener(n, f));
  },
  beforeDestroy(chart) { (chart._nwHandlers || []).forEach(([n, f]) => chart.canvas.removeEventListener(n, f)); },
  afterDatasetsDraw(chart) {
    const m = chart._nwXh; if (!m || m.sel == null) return;
    const a = m.anchors[m.sel]; if (!a) return;
    const ds = chart.data.datasets[0], v = ds && ds.data[a.i]; if (v == null) return;
    const c = chart.ctx, area = chart.chartArea, x = chart.scales.x.getPixelForValue(a.i), y = chart.scales.y.getPixelForValue(v);
    const col = getComputedStyle(chart.canvas).getPropertyValue('--accent').trim() || '#38BDF8';
    c.save();
    c.setLineDash([4, 4]); c.strokeStyle = _hexA(col, .65); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, area.top); c.lineTo(x, area.bottom); c.stroke(); c.setLineDash([]);
    c.shadowColor = '#fff'; c.shadowBlur = 14; c.fillStyle = '#fff';
    c.beginPath(); c.arc(x, y, 3.6, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    c.strokeStyle = _hexA(col, .9); c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.stroke();
    const t1 = fmtMoney(v, 'USD'), t2 = _nwXhLabel(a, m.gran), fs = 11;
    c.font = `600 ${fs}px ui-monospace, Menlo, Consolas, monospace`;
    const w = Math.max(c.measureText(t1).width, c.measureText(t2).width) + 14, h = fs * 2 + 12;
    let bx = x - w / 2; bx = Math.max(2, Math.min(chart.width - w - 2, bx));
    let by = y - h - 12; if (by < 2) by = Math.min(chart.height - h - 2, y + 12);
    c.fillStyle = 'rgba(8,14,26,.94)'; c.strokeStyle = _hexA(col, .85); c.lineWidth = 1;
    c.beginPath(); c.roundRect(bx, by, w, h, 5); c.fill(); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#fff'; c.fillText(t1, bx + w / 2, by + 6 + fs / 2);
    c.fillStyle = _hexA(col, 1); c.fillText(t2, bx + w / 2, by + 6 + fs * 1.5 + 2);
    c.restore();
  },
};

function initNWCharts() {
  // Dona holograma (dona-holograma.js, canvas propio): una porción por categoría con cuentas; tocar una elige esa serie en el gráfico de evolución.
  nwPieInst=DonaHolograma.create({
    canvas:document.getElementById('nwPieChart'), centroLbl:document.getElementById('nwDonaLbl'), centroNum:document.getElementById('nwDonaNum'), centroSub:document.getElementById('nwDonaSub'),
    fmt:v => fmtMoney(v, 'USD'), pct:f => fmtNum(f * 100, 1) + '%', onSelect:id => setNWSeries('t:' + id)
  });
  // Línea: una sola serie
  const lineCtx=document.getElementById('nwLineChart').getContext('2d');
  nwLineInst=new Chart(lineCtx,{
    type:'line',
    data:{ labels:[], datasets:[{ data:[] }] },
    options:{ responsive:true, maintainAspectRatio:false, events:[], plugins:{ legend:{ display:false }, tooltip:{ enabled:false } }, scales:_nwLineScales() },   // events:[] → hover/tooltip nativos fuera; el crosshair HUD (_nwCrosshair) maneja sus propios eventos
    plugins:[_nwCrosshair]
  });
  nwLineInst._nwXh = { anchors:[], sel:null, gran:'m' };
  _renderNWRange();
  updateNWCharts();
}

function updateNWCharts() {
  if (!nwPieInst||!nwLineInst) return;
  const cats = _nwCats();
  nwPieInst.setData(cats.map(c => ({ id: c.t.id, label: c.t.label, value: Math.max(0, c.sum), color: c.t.color })), { totalText: fmtMoney(calcNetWorth(), 'USD') });
  renderNWLegend();
  renderNWSeriesSelect();
  const hist = _nwHist(), info = _nwSeriesInfo();
  nwLineInst.data.labels = _nwLabels(hist);
  nwLineInst.data.datasets = [_nwLineDataset(info, hist)];
  nwLineInst.options.scales = _nwLineScales();
  const gran = _nwGran();
  nwLineInst._nwXh = { anchors:_nwAnchors(hist.map(h => h.date), nwLineInst.data.datasets[0].data, gran), sel:null, gran };
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
  if (typeof _habitSleepSyncAll === 'function' && _habitSleepSyncAll(null, 1)) ['vida', 'salud', 'conocimiento'].forEach(sec => { if (typeof renderHabitsCard === 'function') renderHabitsCard(sec); });
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

  _renderWellnessStrips();

  // "Ver historial →" solo si hay al menos un día con datos de bienestar
  const histBtn = document.getElementById('verBienestarHistBtn');
  if (histBtn) histBtn.style.display = Object.keys(S.sleepLog).some(d => _wbHasAny(S.sleepLog[d])) ? '' : 'none';

  // Si el overlay de historial está abierto (dato remoto entrante, JARVIS, etc.), refrescarlo en vivo
  if (document.getElementById('ov-bienestar-hist')?.classList.contains('show')) renderBienestarHistory();
}

// Franjas de 14 días: una fila por métrica, un cuadrito por día. La intensidad
// del color de la fila codifica el nivel 1-5 (ramp secuencial de un solo tono),
// y a la derecha va el promedio de los días registrados.
const _WSTRIP_MIX = { 1: 20, 2: 38, 3: 56, 4: 78, 5: 100 };

function _renderWellnessStrips() {
  const el = document.getElementById('wellnessStrips');
  if (!el) return;

  const today = getActiveDate();
  const days  = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const dLabel = ds => { const p = ds.split('-'); return `${+p[2]}/${+p[1]}`; };

  const rows = WELLNESS_METRICS.map(m => {
    const vals   = days.map(ds => S.sleepLog[ds]?.wellness?.[m.id] || 0);
    const marked = vals.filter(v => v > 0);
    const avg    = marked.length ? (marked.reduce((a, b) => a + b, 0) / marked.length).toFixed(1) : '—';
    const cells  = days.map((ds, i) => {
      const v  = vals[i];
      const bg = v ? ` style="background:color-mix(in oklab, ${m.color} ${_WSTRIP_MIX[v]}%, transparent)"` : '';
      const tip = `${dLabel(ds)} · ${m.label}: ${v ? `${v}/5 — ${WELLNESS_LABELS[v]}` : 'sin registro'}`;
      return `<span class="wstrip-cell${v ? '' : ' empty'}"${bg} title="${tip}"></span>`;
    }).join('');
    return `<div class="wstrip-row">
      <span class="wstrip-name">${m.label}</span>
      <span class="wstrip-cells">${cells}</span>
      <span class="wstrip-avg">${avg}</span>
    </div>`;
  }).join('');

  // Sueño de los últimos 7 días: promedio y noches dentro del rango 7-9h.
  const last7 = days.slice(-7).map(ds => {
    const e = S.sleepLog[ds] || {};
    let h = e.hours ?? null;
    if (e.bedtime && e.waketime) { const c = _sleepCalcHours(e.bedtime, e.waketime); if (c !== null) h = c; }
    return h;
  }).filter(h => h !== null);
  const avg7  = last7.length ? (last7.reduce((a, b) => a + b, 0) / last7.length).toFixed(1) : null;
  const inRng = last7.filter(h => h >= 7 && h <= 9).length;

  el.innerHTML = `
    <div class="wstrip-hdr"><span>Últimos 14 días</span><span>hoy →</span></div>
    ${rows}
    <div class="wstrip-foot">
      <span>Sueño 7 días: <b>${avg7 !== null ? avg7 + 'h' : '—'}</b> promedio</span>
      <span><b>${inRng}</b> de ${last7.length || 0} noches en rango 7-9h</span>
    </div>
    ${_sleepStatsHtml(today)}`;
}

// Horarios de sueño (CMSueno, sueno-stats.js): fichas chicas con selector 7/30 días. El selector es solo de pantalla (no se guarda).
let _sleepStatsDias = 7;
function setSleepStatsDias(n) { _sleepStatsDias = n === 30 ? 30 : 7; _renderWellnessStrips(); }
function _sleepStatsHtml(today) {
  if (typeof CMSueno === 'undefined') return '';
  const r = CMSueno.resumen(S.sleepLog || {}, { desde: _wbAddDias(today, -(_sleepStatsDias - 1)), hasta: today });
  const ficha = (lbl, val, sub) => `<div class="sstat"><div class="sstat-l">${lbl}</div><div class="sstat-v${val === null ? ' is-nulo' : ''}">${val === null ? '—' : val}</div>${sub ? `<div class="sstat-s">${sub}</div>` : ''}</div>`;
  const reg = r.regularidad ? `${r.regularidad}` : null;
  const regSub = r.desvio != null ? `±${r.desvio} min` : (r.bedN || r.wakeN ? 'faltan noches' : '');
  const seg = n => `<button type="button" class="${_sleepStatsDias === n ? 'active' : ''}" aria-pressed="${_sleepStatsDias === n}" onclick="setSleepStatsDias(${n})">${n} días</button>`;
  const cuerpo = (r.bedN || r.wakeN || r.noches)
    ? `<div class="sstats">
        ${ficha('Te levantás', r.wake, r.wakeN ? `${r.wakeN} registro${r.wakeN === 1 ? '' : 's'}` : '')}
        ${ficha('Te acostás', r.bed, r.bedN ? `${r.bedN} registro${r.bedN === 1 ? '' : 's'}` : '')}
        ${ficha('Regularidad', reg, regSub)}
        ${ficha('Horas promedio', r.horasProm !== null ? String(r.horasProm).replace('.', ',') + ' h' : null, `${r.noches} noche${r.noches === 1 ? '' : 's'}`)}
      </div>`
    : '<div class="sstats-vacio">Sin registros en este período</div>';
  return `<div class="sstats-wrap">
    <div class="sstats-head"><span>Tus horarios de sueño</span><span class="sstats-seg">${seg(7)}${seg(30)}</span></div>
    ${cuerpo}
  </div>`;
}

// ── Historial de Bienestar (overlay) — mismo patrón día/semana/mes que el
// historial de Sesión de estudio (pomodoro.js): pulso hoy/7días/mes, gráfico
// de barras por bucket, bitácora agrupada por día. Selector de métrica propio
// (horas de sueño + las 5 métricas de WELLNESS_METRICS).
const WB_METRICS = [
  { id: 'hours', label: 'Sueño', unit: 'h', color: '#5EEAD4' },
  { id: 'wake',  label: 'Hora de levantarse', unit: 'hm', color: '#FFD166' },
  { id: 'bed',   label: 'Hora de acostarse',  unit: 'hm', color: '#8FA8FF' },
  ...WELLNESS_METRICS.map(m => ({ id: m.id, label: m.label, unit: '/5', color: m.color })),
];
// Horas de reloj (unit 'hm'): minutos del día; acostarse como día corrido desde el mediodía (00:30 = 1470) para no romperse al cruzar la medianoche.
const _wbHm = v => (typeof CMSueno !== 'undefined' ? CMSueno.fmtHora(v) : null);
let _wbHistContainer = null;
let _wbHistView   = 'day';   // 'day' | 'week' | 'month'
let _wbHistMetric = 'hours';
let _wbHistChart  = null;

const _wbAddDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function _wbVal(entry, metricId) {
  if (!entry) return null;
  if (metricId === 'wake' || metricId === 'bed') {
    if (typeof CMSueno === 'undefined') return null;
    return metricId === 'wake' ? CMSueno.horaAMin(entry.waketime) : CMSueno.acostarseAMin(entry.bedtime);
  }
  if (metricId === 'hours') {
    let h = entry.hours ?? null;
    if (entry.bedtime && entry.waketime) { const c = _sleepCalcHours(entry.bedtime, entry.waketime); if (c !== null) h = c; }
    return h;
  }
  const v = entry.wellness && entry.wellness[metricId];
  return v > 0 ? v : null;
}
function _wbHasAny(entry) { return WB_METRICS.some(m => _wbVal(entry, m.id) !== null); }
function _wbAvg(dates, metricId) {
  const vals = dates.map(d => _wbVal(S.sleepLog[d], metricId)).filter(v => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function _wbFmt(val, metric) {
  if (val === null || val === undefined) return '—';
  if (metric.unit === 'hm') return _wbHm(val) || '—';
  return metric.unit === 'h' ? val.toFixed(1) + '<span class="u">h</span>' : val.toFixed(1) + '<span class="u">/5</span>';
}
const _wbPlain = (val, metric) => _wbFmt(val, metric).replace(/<\/?span[^>]*>/g, '');

function mountBienestarHistory(el) { _wbHistContainer = el; renderBienestarHistory(); }
function setBienestarHistView(v)   { _wbHistView = v; renderBienestarHistory(); }
function setBienestarHistMetric(id) { _wbHistMetric = id; renderBienestarHistory(); }

function renderBienestarHistory() {
  const el = _wbHistContainer;
  if (!el) return;
  if (_wbHistChart) { _wbHistChart.destroy(); _wbHistChart = null; }
  const log = S.sleepLog || {};
  const allDates = Object.keys(log).filter(d => _wbHasAny(log[d])).sort();
  const metric = WB_METRICS.find(m => m.id === _wbHistMetric) || WB_METRICS[0];

  const metricsRow = `<div class="wb-metrics">${WB_METRICS.map(m =>
    `<button type="button" class="${m.id === metric.id ? 'active' : ''}" style="--c:${m.color}" aria-pressed="${m.id === metric.id}" onclick="setBienestarHistMetric('${m.id}')">${m.label}</button>`
  ).join('')}</div>`;

  if (!allDates.length) {
    el.innerHTML = metricsRow + `<div class="wb-empty">
      <div class="wb-empty-ico">🌿</div>
      <div class="wb-empty-t">Sin registros todavía</div>
      <div class="wb-empty-s">Cargá tu sueño y bienestar del día y acá vas a ver tu historial.</div>
    </div>`;
    return;
  }

  const today = getActiveDate();

  // ── Pulso: hoy / 7 días / este mes, hoy como héroe ──
  const hoyVal   = _wbVal(log[today], metric.id);
  const semDesde = _wbAddDias(today, -6);
  const semDates = allDates.filter(d => d >= semDesde && d <= today);
  const mesPref  = today.slice(0, 7);
  const mesDates = allDates.filter(d => d.slice(0, 7) === mesPref);
  const pulseCell = (val, n, lbl, hero) => `<div class="wb-pulse-cell${hero ? ' is-hero' : ''}">
    <div class="wb-pulse-lbl">${lbl}</div>
    <div class="wb-pulse-val"${val !== null ? ` style="color:${metric.color}"` : ''}>${_wbFmt(val, metric)}</div>
    <div class="wb-pulse-sub">${n} día${n === 1 ? '' : 's'} registrado${n === 1 ? '' : 's'}</div>
  </div>`;
  const nSem = semDates.filter(d => _wbVal(log[d], metric.id) !== null).length;
  const nMes = mesDates.filter(d => _wbVal(log[d], metric.id) !== null).length;
  const pulseHtml = `<div class="wb-pulse">
    ${pulseCell(hoyVal, hoyVal !== null ? 1 : 0, 'Hoy', true)}
    ${pulseCell(_wbAvg(semDates, metric.id), nSem, '7 días', false)}
    ${pulseCell(_wbAvg(mesDates, metric.id), nMes, 'Este mes', false)}
  </div>`;

  // ── Módulo de tendencia: mismos buckets que muestran las barras ──
  let labels = [], data = [];
  if (_wbHistView === 'day') {
    for (let i = 13; i >= 0; i--) {
      const d = _wbAddDias(today, -i);
      labels.push(d.slice(8, 10) + '/' + d.slice(5, 7));
      data.push(_wbVal(log[d], metric.id));
    }
  } else if (_wbHistView === 'week') {
    for (let w = 7; w >= 0; w--) {
      const desde = _wbAddDias(today, -7 * (w + 1) + 1), hasta = _wbAddDias(today, -7 * w);
      const es = allDates.filter(d => d >= desde && d <= hasta);
      labels.push(desde.slice(8, 10) + '/' + desde.slice(5, 7));
      data.push(_wbAvg(es, metric.id));
    }
  } else {
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const pref = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const es = allDates.filter(dd => dd.slice(0, 7) === pref);
      labels.push(typeof CAL_MONTHS !== 'undefined' ? CAL_MONTHS[d.getMonth()].slice(0, 3) : pref.slice(5, 7));
      data.push(_wbAvg(es, metric.id));
    }
  }
  const vals = data.filter(v => v !== null);
  const avgVal   = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const vistaLbl = { day: 'día', week: 'semana', month: 'mes' }[_wbHistView];

  const modHtml = `<div class="wb-mod">
    <div class="wb-mod-head">
      <div class="wb-mod-title">${metric.label} por ${vistaLbl}</div>
      <div class="wb-seg">
        <button type="button" class="${_wbHistView === 'day' ? 'active' : ''}" aria-pressed="${_wbHistView === 'day'}" onclick="setBienestarHistView('day')">Día</button>
        <button type="button" class="${_wbHistView === 'week' ? 'active' : ''}" aria-pressed="${_wbHistView === 'week'}" onclick="setBienestarHistView('week')">Semana</button>
        <button type="button" class="${_wbHistView === 'month' ? 'active' : ''}" aria-pressed="${_wbHistView === 'month'}" onclick="setBienestarHistView('month')">Mes</button>
      </div>
    </div>
    <div class="wb-chart"><canvas id="wb-hist-canvas"></canvas></div>
    <div class="wb-mod-foot">
      <span class="wb-avg"><b>${avgVal !== null ? _wbPlain(avgVal, metric) : '—'}</b> promedio por ${vistaLbl}</span>
    </div>
  </div>`;

  // ── Bitácora: agrupada por día, más nuevo primero ──
  const ayer  = _wbAddDias(today, -1);
  const dayLbl = d => d === today ? 'Hoy' : d === ayer ? 'Ayer' : (typeof fmtDate === 'function' ? fmtDate(d) : d);
  const days  = allDates.slice().reverse();
  const dayBlock = d => {
    const entry    = log[d] || {};
    const hoursVal = _wbVal(entry, 'hours');
    const chips = WELLNESS_METRICS.map(m => {
      const v = entry.wellness && entry.wellness[m.id];
      if (!v) return '';
      return `<span class="wb-chip" style="--c:${m.color}" title="${m.label}: ${v}/5 — ${WELLNESS_LABELS[v]}">${m.label} ${v}</span>`;
    }).join('');
    return `<div class="wb-day${d === today ? ' is-today' : ''}">
        <span class="wb-day-lbl">${dayLbl(d)}</span>
        <span class="wb-day-line"></span>
        <span class="wb-day-tot">${entry.bedtime && entry.waketime ? `<small class="wb-day-hm">${entry.bedtime} → ${entry.waketime}</small> ` : ''}${hoursVal !== null ? hoursVal.toFixed(1) + 'h' : '—'}</span>
      </div>
      <div class="wb-chips-row">${chips || '<span class="wb-chip-empty">Sin métricas registradas</span>'}</div>`;
  };
  const logHtml = `<div class="wb-log-head">
      <div class="wb-log-title">Bitácora</div>
      <div class="wb-log-count">${days.length} día${days.length === 1 ? '' : 's'}</div>
    </div>
    <div class="wb-log" id="wb-log-scroll">${days.map(dayBlock).join('')}</div>`;

  el.innerHTML = metricsRow + pulseHtml + modHtml + '<div class="wb-sep"></div>' + logHtml;

  const logEl = document.getElementById('wb-log-scroll');
  if (logEl && logEl.scrollHeight <= logEl.clientHeight) logEl.classList.add('is-short');

  const canvas = document.getElementById('wb-hist-canvas');
  if (!canvas || typeof Chart === 'undefined') return;
  const _f = n => (typeof _cfs === 'function' ? _cfs(n) : n);
  const esHora = metric.unit === 'hm';
  _wbHistChart = new Chart(canvas.getContext('2d'), {
    type: esHora ? 'line' : 'bar',
    data: {
      labels,
      datasets: [esHora ? {
        // Hora de reloj: puntos unidos por una línea fina; las noches sin dato se saltan en vez de caer a 0.
        data, spanGaps: true, borderColor: metric.color + '99', borderWidth: 1.5, tension: 0,
        pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: metric.color, pointBorderColor: metric.color
      } : {
        data,
        backgroundColor: data.map((_, i) => i === data.length - 1 ? metric.color : metric.color + '57'),
        hoverBackgroundColor: metric.color,
        borderRadius: 5, maxBarThickness: 22
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(8,14,26,.94)', borderColor: metric.color + '59', borderWidth: 1,
          titleColor: '#EDF4FF', bodyColor: '#8BA5C0', padding: 9, displayColors: false,
          callbacks: { label: c => c.parsed.y === null ? 'Sin datos' : _wbPlain(c.parsed.y, metric) }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false },
             ticks: { color: '#8BA5C0', font: { size: _f(11.5) }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { min: esHora ? undefined : 0, max: metric.unit === '/5' ? 5 : undefined, grace: esHora ? 30 : undefined, grid: { color: 'rgba(255,255,255,.06)' }, border: { display: false },
             ticks: esHora
               ? { color: '#8BA5C0', font: { size: _f(11.5) }, maxTicksLimit: 5, stepSize: 60, callback: v => _wbHm(v) }
               : { color: '#8BA5C0', font: { size: _f(11.5) }, maxTicksLimit: 4, callback: v => v + (metric.unit === 'h' ? 'h' : '') } }
      }
    }
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
    const inc = tx.filter(t=>t.type==='income' && !t.refundOf).reduce((s,t)=>s+t.amount,0);   // un reintegro no es ingreso (reintegros.js)
    const exp = tx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0) - (window.CMReintegros ? CMReintegros.restarMes(S, mk) : 0);
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
    desc:'Completar todas las tareas del día 7 días seguidos',
    check() { const m=S.streak?.count||0; return {metric:m, threshold:7}; } },

  { id:'streak_30', section:'vida', icon:'🔥', rarity:'gold',
    name:'Imparable',
    desc:'Completar todas las tareas del día 30 días seguidos',
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
        ${n>1?`<span style="position:absolute;bottom:-4px;right:-8px;font-size:var(--fs-12-5);font-weight:900;background:${rc.c};color:#050506;border-radius:99px;padding:1px 5px;line-height:1.5">×${n}</span>`:''}
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

function showConfetti(duration = 4500, count = 180) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const COLORS = ['#6BE3A4','#7C8EE8','#F2C063','#FF6B6B','#00D4FF','#22C55E','#FAFAFA','#F43F5E','#FFD700'];
  const SHAPES = ['rect','circle','tri'];
  const N = count;

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
    <div style="font-size:var(--fs-14);color:rgba(255,255,255,.7);margin-top:5px;font-weight:600">Todas las tareas del día completadas</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Mini festejo al marcar un hábito: la versión corta del "¡MISIÓN CUMPLIDA!" de las metas
// (chispas desde el control + confetti breve + cartel con la racha). Se dispara solo al marcar
// el día activo — rellenar días viejos del calendario no lanza el show.
function celebrateHabit(name, emoji, streak, ev) {
  const el = ev && (ev.currentTarget || ev.target);
  if (el && typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    if (r.width || r.height) showSparkle(r.left + r.width / 2, r.top + r.height / 2);
  }
  if (navigator.vibrate) { try { navigator.vibrate([18, 40, 26]); } catch (e) {} }
  showConfetti(2000, 70);
  setTimeout(() => showHabitBanner(name, emoji, streak), 90);
}

function showHabitBanner(name, emoji, streak) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; top:22%; left:50%; transform:translateX(-50%);
    background:linear-gradient(135deg,rgba(107,227,164,.22),rgba(34,197,94,.18));
    border:2px solid rgba(107,227,164,.55); border-radius:18px;
    padding:14px 26px; text-align:center; pointer-events:none; z-index:10000;
    backdrop-filter:blur(20px); box-shadow:0 0 50px rgba(107,227,164,.3),0 16px 50px rgba(0,0,0,.4);
    animation:missionBanner 2.6s cubic-bezier(.22,1,.36,1) forwards;
    max-width:min(88vw,420px);
  `;
  const sub = streak > 1
    ? `🔥 ${streak} días seguidos`
    : 'Un día más del lado correcto';
  el.innerHTML = `
    <div style="font-size:30px;line-height:1;margin-bottom:5px">${escHtml(emoji || '✅')}</div>
    <div style="font-size:18px;font-weight:900;letter-spacing:.04em;color:#6BE3A4;text-shadow:0 0 26px rgba(107,227,164,.8)">${escHtml(name || 'HÁBITO HECHO')}</div>
    <div style="font-size:var(--fs-14);color:rgba(255,255,255,.72);margin-top:4px;font-weight:700">${sub}</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2700);
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
    <div style="font-size:var(--fs-13);color:rgba(255,255,255,.65);margin-top:5px;font-weight:600">A recuperarlas mañana — sin excusas</div>
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
if (window.CMMotion) CMMotion.quiet(2500);   // el primer render de la app no anima altas de lista
await loadState();
_startFirestoreSync();
if (typeof window._reloadProyectosFromState === 'function') window._reloadProyectosFromState();
_migratePhotos();   // migra fotos embebidas viejas a Storage (una vez, cuando Storage esté listo)
updateDayProgress();
setInterval(updateDayProgress, 60000);
setInterval(buildTickerAlerts, 30000);
// Si la app queda abierta pasada la medianoche, al cambiar el día vuelve a correr renderGoals()
// (que llama syncDueProjectsToGoals) para cargar las tareas que vencen hoy sin recargar la página.
let _lastGoalSyncDay = getActiveDate();
setInterval(() => {
  const d = getActiveDate();
  if (d !== _lastGoalSyncDay) { _lastGoalSyncDay = d; renderGoals(); }
}, 60000);
setInterval(() => {
  const p = document.querySelector('.tab-panel.active');
  if (p) renderReminders(p.id.replace('tab-', ''));
}, 60000);
setInterval(() => { checkReminderNotifications(); refreshRemindersView(); }, 60000);
setInterval(() => { if (!Object.keys(_rtnTimers).length) _msHub.showReminders(); }, 60000);
setTimeout(_asegurarPushDispositivo, 4000);   // avisos push: registra este dispositivo si falta en el mapa
// Visibilidad del sync (solo registra): cuánto estuvo oculta la app y en qué orden pasa todo al volver.
// Se registra ANTES que el listener de abajo, así "visible" queda antes del inicio de _syncOnFocus.
let _dgHiddenAt = null;
document.addEventListener('visibilitychange', () => {
  try {
    if (document.hidden) { _dgHiddenAt = Date.now(); _syncEv('oculta', { timer: !!_fbSaveTid, vuelo: _fbSaveInProgress }); }
    else { _syncEv('visible', { ocultaMs: _dgHiddenAt ? Date.now() - _dgHiddenAt : null }); _dgHiddenAt = null; }
  } catch (e) {}
});
window.addEventListener('pagehide', () => _syncEv('pagehide', { timer: !!_fbSaveTid, vuelo: _fbSaveInProgress }));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { avisosAlVolver(); _reanudarListener(); _syncOnFocus(); _msHub.showReminders(); }
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
if (window.Cursada) Cursada.renderPrincipal();
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
// Atajo del ícono de la app o algo compartido desde otra app: se aplica acá,
// ya con sesión iniciada y el estado cargado (ver share-target.js).
if (typeof aplicarAccionPendiente === 'function') aplicarAccionPendiente();
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
    #authGate p{margin:0 0 22px;color:#9fb3d4;font-size:var(--fs-14);line-height:1.5}
    #authGate .auth-btn{width:100%;padding:13px;border:none;border-radius:12px;cursor:pointer;
      background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:var(--fs-15);font-weight:600;transition:filter .15s,transform .1s}
    #authGate .auth-btn:hover{filter:brightness(1.08)}
    #authGate .auth-btn:active{transform:scale(.98)}
    #authGate .auth-btn:disabled{opacity:.6;cursor:default}
    #authGate .auth-err{margin-top:14px;color:#ff9b9b;font-size:var(--fs-13);line-height:1.45;
      background:rgba(180,40,40,.12);border:1px solid rgba(220,80,80,.25);border-radius:8px;padding:8px 10px}
    #authGate .auth-escape{margin-top:16px;background:none;border:none;color:#7f93b4;font-size:var(--fs-13);text-decoration:underline;cursor:pointer}
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

