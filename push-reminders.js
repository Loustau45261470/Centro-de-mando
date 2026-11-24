// Centro de Mando — Push Reminders (cron)
// Lo dispara el Worker de Cloudflare cada 5 min (workflow_dispatch; el schedule de GitHub queda de respaldo,
// porque en la práctica corre cada ~4,6 h). Lee el estado de Firestore y manda Web Push
// (VAPID) a las suscripciones de TODOS los dispositivos del usuario, para que los avisos lleguen con la app cerrada.
//
// Qué avisa: TODO lo que tiene fecha — recordatorios, proyectos con fecha límite,
// finales, cursada, metas del día con hora, actividades del planner, proyecciones
// que vencen y pedidos. La lista y los horarios de aviso los calcula
// deadlines.js, el MISMO archivo que usa la app en el navegador.
'use strict';

const webpush = require('web-push');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const CMDeadlines = require('./deadlines.js');

const TZ = '-03:00';                 // Argentina (UTC-3, sin horario de verano)
const MIN = 60000;
// Ventanas de rescate: un aviso de "vence mañana" tolera llegar tarde; uno de
// "en 10 min" no sirve una hora después.
const WINDOW_LEAD  = 60 * MIN;
const WINDOW_TIMED = 20 * MIN;
// Subject VAPID: la URL del sitio (no un email personal: el repo es público).
const VAPID_SUBJECT = 'https://loustau45261470.github.io/Centro-de-mando/';
const SEND_TIMEOUT_MS = 10000;       // un servicio push colgado no frena la corrida entera
const TTL_LEAD = 3600, TTL_TIMED = 900;   // s que el servicio push retiene el aviso (igual que las ventanas)
const LOTE = 5;                      // avisos que se mandan antes de persistir lo ya enviado
const FALLOS_MAX = 3;                // corridas seguidas sin poder enviar a un dispositivo => aviso visible
const SALUD_VIGENCIA_MS = 30 * 24 * 3600000;

// Devuelve true si el servicio push aceptó el envío, o el statusCode del error (0 si no hubo código).
// Así solo se marca como "ya avisado" lo que de verdad salió, y un fallo transitorio se reintenta
// en la próxima corrida.
function send(wp, sub, title, body, tag, requireInteraction, url, lead) {
  const payload = { title, body, tag, requireInteraction };
  if (url) payload.url = url;   // destino al tocar el aviso (lo resuelve sw.js); sin url abre el Centro
  return Promise.resolve()
    .then(() => wp.sendNotification(sub, JSON.stringify(payload), { TTL: lead ? TTL_LEAD : TTL_TIMED, timeout: SEND_TIMEOUT_MS }))
    .then(() => true)
    .catch(err => { console.error('[push] error', tag, err && err.statusCode, err && err.message); return (err && err.statusCode) || 0; });
}

// Manda a cada suscripción por separado (un fallo en un dispositivo no frena a los demás).
// Devuelve { ok: true si al menos un dispositivo lo recibió, code: statusCode del último fallo, dead: endpoints 404/410,
//            porTarget: resultado por dispositivo (true o código) }.
async function sendTodas(wp, targets, title, body, tag, requireInteraction, url, lead) {
  const rs = await Promise.all(targets.map(t => send(wp, t.sub, title, body, tag, requireInteraction, url, lead)));
  const dead = [];
  let code = 0;
  // Prioridad del código: 410, luego 404, luego el último (así una suscripción muerta no queda tapada por un 500 de otra).
  const rango = c => c === 410 ? 2 : c === 404 ? 1 : 0;
  rs.forEach((r, i) => {
    if (r === true) return;
    if (rango(r) >= rango(code)) code = r;
    if (r === 404 || r === 410) dead.push(targets[i].sub.endpoint);
  });
  return { ok: rs.some(r => r === true), code, dead, porTarget: rs };
}

// Suscripciones únicas por endpoint: el mapa por dispositivo (pushSubscriptions) + la legada (pushSubscription).
function juntarTargets(data) {
  const out = [], vistos = new Set();
  const add = (sub, devId, e) => {
    if (!sub || !sub.endpoint) return;
    if (vistos.has(sub.endpoint)) { if (devId) out.find(t => t.sub.endpoint === sub.endpoint).ids.push(devId); return; }
    vistos.add(sub.endpoint); out.push({ sub, ids: devId ? [devId] : [], ua: (e && e.ua) || '', updatedAt: (e && e.updatedAt) || 0 });
  };
  Object.entries(data.pushSubscriptions || {}).forEach(([id, e]) => add(e && e.sub, id, e));
  add(data.pushSubscription, null, null);
  return out;
}

// Clave del dispositivo en pushHealth.fallos: su id (alfanumérico, sirve de clave de campo) o 'legado'.
const claveTarget = t => t.ids[0] || 'legado';

// Fallos consecutivos por dispositivo. `prev` = pushHealth.fallos del documento; `intentos[i]` = { probado, ok, code }
// del dispositivo targets[i] en ESTA corrida (probado=false: no hubo nada que mandar, no hay evidencia, no se toca).
// Devuelve { fallos: mapa nuevo, nuevos: claves que pasan a ser visibles ahora (para avisar una sola vez),
//            graves: subconjunto de `nuevos` que NO es una suscripción muerta (config rota: 401/403/413/429/5xx) }.
// Visible = suscripción muerta (404/410) o FALLOS_MAX corridas seguidas sin poder enviar.
function evaluarSalud(prev, targets, intentos, now) {
  prev = prev || {};
  const next = {};
  Object.entries(prev).forEach(([k, e]) => { if (e && now - (e.at || 0) < SALUD_VIGENCIA_MS) next[k] = e; });   // el tiempo limpia lo abandonado
  targets.forEach((t, i) => {
    const k = claveTarget(t), it = intentos[i] || {}, p = prev[k];
    if (!it.probado) {
      // Sin envíos esta corrida: si el dispositivo se re-suscribió después del fallo, ese fallo ya no vale.
      if (p && t.updatedAt && t.updatedAt > (p.at || 0)) delete next[k];
      return;
    }
    if (it.ok) { delete next[k]; return; }
    const dead = it.code === 404 || it.code === 410;
    next[k] = { n: ((p && p.n) || 0) + 1, code: it.code, desde: (p && p.desde) || now, at: now, ua: t.ua || (p && p.ua) || '', dead };
  });
  const visible = e => !!e && (e.dead || e.n >= FALLOS_MAX);
  const nuevos = Object.keys(next).filter(k => visible(next[k]) && !visible(prev[k]));
  return { fallos: next, nuevos, graves: nuevos.filter(k => !next[k].dead) };
}

// Notificados que se conservan: lo marcado en esta corrida + lo migrado de claves viejas + lo que sigue "vivo"
// (puede volver a corresponder en los próximos 7 días). Todo lo demás se poda.
function podarNotificados(items, notified, marcadas, migradas, now) {
  const out = {};
  Object.keys(marcadas).forEach(k => { out[k] = true; });
  migradas.forEach(k => { out[k] = true; });
  for (const it of items) {
    for (const a of (it.alerts || [])) {
      if (a.at > now - 7 * 24 * 3600000 && notified[a.key]) out[a.key] = true;
    }
  }
  return out;
}

// Una corrida completa. `deps` = { ref, db, webpush, FieldValue, now } (inyectable para tests). Devuelve el exit code.
async function run(deps) {
  const { ref, db, FieldValue: FV } = deps;
  const wp = deps.webpush;
  const snap = await ref.get();
  const data = snap.data();
  if (!data) { console.log('[push] sin datos'); return 0; }

  const targets = juntarTargets(data);
  const vapid   = data.vapidKeys;          // { pubKey, sigKey }
  if (!targets.length || !vapid) {
    console.log('[push] falta suscripción o VAPID — activá notificaciones en la PWA primero');
    return 0;
  }

  // Todo el estado (recordatorios, proyectos, finales, cursada…) vive DENTRO del
  // campo state (JSON serializado del objeto S de la app).
  let state = {};
  try { state = data.state ? JSON.parse(data.state) : {}; }
  catch (e) { console.error('[push] state ilegible:', e.message); return 0; }

  wp.setVapidDetails(VAPID_SUBJECT, vapid.pubKey, vapid.sigKey);

  const now = deps.now || Date.now();
  const notified = data.notifiedReminders || {};
  const marcadas = {};   // avisos enviados en ESTA corrida
  // Claves viejas (sin fecha) de avisos ya enviados cuya fecha no cambió: se heredan con la clave nueva (sin reavisar).
  const migradas = CMDeadlines.migrarClaves(state, { now, tz: TZ }, notified);

  // Qué disparar: lo decide deadlines.js, igual que en el navegador. Acá solo se
  // pasan ventanas de rescate más anchas, porque el cron corre cada 5 minutos y
  // GitHub Actions suele atrasarlo.
  const alertas = CMDeadlines.dueAlerts(state, { now, tz: TZ, seen: notified, windowMs: WINDOW_TIMED, windowLeadMs: WINDOW_LEAD });
  let okCount = 0, muerta = null;
  const muertos = new Set();   // endpoints que respondieron 404/410 (se borran del mapa)
  const intentos = targets.map(() => ({ probado: false, ok: false, code: 0 }));

  // Se manda por lotes y tras cada lote se persiste lo ya enviado: si el job muere a mitad, no se reenvía todo.
  for (let i = 0; i < alertas.length; i += LOTE) {
    const lote = alertas.slice(i, i + LOTE);
    const rs = await Promise.all(lote.map(a => sendTodas(wp, targets, a.title, a.body, a.key, a.lead, a.url, a.lead)));
    rs.forEach((r, j) => {
      r.dead.forEach(e => muertos.add(e));
      // Se marca como avisado si llegó a algún dispositivo. Si no llegó a ninguno y hubo 404/410: suscripción muerta, se reintenta si se reactiva.
      if (r.ok) { okCount++; marcadas[lote[j].key] = true; }
      else if (r.code === 404 || r.code === 410) muerta = r.code;
      r.porTarget.forEach((x, ti) => {
        intentos[ti].probado = true;
        if (x === true) intentos[ti].ok = true; else intentos[ti].code = x;
      });
    });
    if (alertas.length > LOTE) {
      try { await ref.update({ notifiedReminders: Object.assign({}, notified, migradas.reduce((o, k) => (o[k] = true, o), {}), marcadas) }); }
      catch (e) { console.error('[push] no pude persistir el lote:', e.message); }
    }
  }

  // Un aviso sigue "vivo" mientras pueda volver a corresponder: así el mapa de
  // notificados no crece para siempre pero tampoco olvida uno recién mandado.
  const items = CMDeadlines.collect(state, { now, tz: TZ });
  const newNotif = podarNotificados(items, notified, marcadas, migradas, now);

  if (alertas.length) console.log(`[push] enviados ${okCount} de ${alertas.length} pendientes (${items.length} vencimientos en agenda)`);
  else console.log(`[push] nada por enviar (${items.length} vencimientos en agenda)`);

  // `update` (no `set` con merge): reemplaza el mapa entero, así la poda borra de verdad.
  const upd = { notifiedReminders: newNotif };
  let exitCode = 0;
  // Dispositivo con suscripción muerta: se borra solo su entrada (y el legado si es la misma), dentro de una
  // transacción y solo si el endpoint guardado SIGUE siendo el muerto (no pisa una re-suscripción nueva).
  if (muertos.size) {
    await db.runTransaction(async tx => {
      const cur = (await tx.get(ref)).data() || {};
      const borrar = {};
      targets.filter(t => muertos.has(t.sub.endpoint)).forEach(t => t.ids.forEach(id => {
        const e = cur.pushSubscriptions && cur.pushSubscriptions[id];
        if (e && e.sub && e.sub.endpoint === t.sub.endpoint) borrar['pushSubscriptions.' + id] = FV.delete();
      }));
      const leg = cur.pushSubscription;
      if (leg && leg.endpoint && muertos.has(leg.endpoint)) borrar.pushSubscription = FV.delete();
      if (Object.keys(borrar).length) tx.update(ref, borrar);
    });
  }
  if (muerta) {
    // Campo de nivel superior (no toca `state`): la app lo lee y avisa. Solo la corrida que lo marca
    // por primera vez sale con error, para que GitHub Actions mande UN mail y no uno cada 5 minutos.
    console.log(`::error::La suscripción push está muerta (el servicio respondió ${muerta}). Hay que reactivar los avisos desde la app.`);
    if (!data.pushDead) { upd.pushDead = { at: new Date().toISOString(), code: muerta }; exitCode = 1; }
  } else if (okCount > 0 && data.pushDead) {
    upd.pushDead = FV.delete();   // volvió a andar
  }

  // Salud por dispositivo: fallos consecutivos (401/403 VAPID, 413, 429, 5xx, 404/410). Campos puntuales de pushHealth.fallos:
  // no pisa lo que la app borre al re-suscribirse. La app muestra un aviso con los visibles (muertos o >= 3 corridas seguidas).
  const salud = evaluarSalud(data.pushHealth && data.pushHealth.fallos, targets, intentos, now);
  const prevH = (data.pushHealth && data.pushHealth.fallos) || {};
  Object.keys(salud.fallos).forEach(k => { if (JSON.stringify(salud.fallos[k]) !== JSON.stringify(prevH[k])) upd['pushHealth.fallos.' + k] = salud.fallos[k]; });
  Object.keys(prevH).forEach(k => { if (!salud.fallos[k]) upd['pushHealth.fallos.' + k] = FV.delete(); });
  salud.nuevos.forEach(k => console.log(`::warning::Sin poder enviar avisos a ${salud.fallos[k].ua || k} (${salud.fallos[k].dead ? 'suscripción muerta' : salud.fallos[k].n + ' corridas seguidas'}, código ${salud.fallos[k].code}).`));
  if (salud.graves.length) {
    // Fallos que no son una suscripción muerta (VAPID que no coincide, límite, servicio caído): el job sale rojo UNA vez al cruzar el umbral.
    console.log(`::error::Los avisos push fallan ${FALLOS_MAX} corridas seguidas (código ${salud.fallos[salud.graves[0]].code}). Revisá VAPID/servicio push.`);
    exitCode = 1;
  }

  await ref.update(upd);
  return exitCode;
}

async function main() {
  const ENV = process.env;
  if (!ENV.FIREBASE_SERVICE_ACCOUNT) {
    console.log('[push] falta el secret FIREBASE_SERVICE_ACCOUNT — agregalo en Settings → Secrets → Actions del repo');
    return 0;
  }
  initializeApp({ credential: cert(JSON.parse(ENV.FIREBASE_SERVICE_ACCOUNT)) });
  const db = getFirestore();
  return run({ ref: db.collection('appdata').doc('lifedash_v2'), db, webpush, FieldValue });
}

if (require.main === module) {
  main().then(code => process.exit(code || 0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run, send, sendTodas, juntarTargets, evaluarSalud, podarNotificados, claveTarget, FALLOS_MAX, LOTE, VAPID_SUBJECT };
