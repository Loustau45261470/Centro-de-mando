// Centro de Mando — Push Reminders (cron)
// Lo ejecuta GitHub Actions cada 5 min. Lee el estado de Firestore y manda Web Push
// (VAPID) a las suscripciones de TODOS los dispositivos del usuario, para que los avisos lleguen con la app cerrada.
//
// Qué avisa: TODO lo que tiene fecha — recordatorios, proyectos con fecha límite,
// finales, cursada, metas del día con hora, actividades del planner, proyecciones
// que vencen y pedidos. La lista y los horarios de aviso los calcula
// deadlines.js, el MISMO archivo que usa la app en el navegador.

const webpush = require('web-push');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const CMDeadlines = require('./deadlines.js');

const ENV = process.env;
if (!ENV.FIREBASE_SERVICE_ACCOUNT) {
  console.log('[push] falta el secret FIREBASE_SERVICE_ACCOUNT — agregalo en Settings → Secrets → Actions del repo');
  process.exit(0);
}
const svcAccount = JSON.parse(ENV.FIREBASE_SERVICE_ACCOUNT);

initializeApp({ credential: cert(svcAccount) });
const db = getFirestore();

const TZ = '-03:00';                 // Argentina (UTC-3, sin horario de verano)
const MIN = 60000;
// Ventanas de rescate: un aviso de "vence mañana" tolera llegar tarde; uno de
// "en 10 min" no sirve una hora después.
const WINDOW_LEAD  = 60 * MIN;
const WINDOW_TIMED = 20 * MIN;

// Devuelve true si el servicio push aceptó el envío, o el statusCode del error (0 si no hubo código).
// Así main solo marca como "ya avisado" lo que de verdad salió, y un fallo transitorio se reintenta
// en la próxima corrida.
function send(sub, title, body, tag, requireInteraction, url) {
  const payload = { title, body, tag, requireInteraction };
  if (url) payload.url = url;   // destino al tocar el aviso (lo resuelve sw.js); sin url abre el Centro
  return webpush.sendNotification(sub, JSON.stringify(payload))
    .then(() => true)
    .catch(err => { console.error('[push] error', tag, err.statusCode, err.message); return err.statusCode || 0; });
}

// Manda a cada suscripción por separado (un fallo en un dispositivo no frena a los demás).
// Devuelve { ok: true si al menos un dispositivo lo recibió, code: statusCode del último fallo, dead: endpoints 404/410 }.
async function sendTodas(targets, title, body, tag, requireInteraction, url) {
  const rs = await Promise.all(targets.map(t => send(t.sub, title, body, tag, requireInteraction, url)));
  const dead = [];
  let code = 0;
  // Prioridad del código: 410, luego 404, luego el último (así una suscripción muerta no queda tapada por un 500 de otra).
  const rango = c => c === 410 ? 2 : c === 404 ? 1 : 0;
  rs.forEach((r, i) => {
    if (r === true) return;
    if (rango(r) >= rango(code)) code = r;
    if (r === 404 || r === 410) dead.push(targets[i].sub.endpoint);
  });
  return { ok: rs.some(r => r === true), code, dead };
}

// Suscripciones únicas por endpoint: el mapa por dispositivo (pushSubscriptions) + la legada (pushSubscription).
function juntarTargets(data) {
  const out = [], vistos = new Set();
  const add = (sub, devId) => {
    if (!sub || !sub.endpoint) return;
    if (vistos.has(sub.endpoint)) { if (devId) out.find(t => t.sub.endpoint === sub.endpoint).ids.push(devId); return; }
    vistos.add(sub.endpoint); out.push({ sub, ids: devId ? [devId] : [] });
  };
  Object.entries(data.pushSubscriptions || {}).forEach(([id, e]) => add(e && e.sub, id));
  add(data.pushSubscription, null);
  return out;
}

async function main() {
  const ref = db.collection('appdata').doc('lifedash_v2');
  const snap = await ref.get();
  const data = snap.data();
  if (!data) { console.log('[push] sin datos'); return; }

  const targets = juntarTargets(data);
  const vapid   = data.vapidKeys;          // { pubKey, sigKey }
  if (!targets.length || !vapid) {
    console.log('[push] falta suscripción o VAPID — activá notificaciones en la PWA primero');
    return;
  }

  // Todo el estado (recordatorios, proyectos, finales, cursada…) vive DENTRO del
  // campo state (JSON serializado del objeto S de la app).
  let state = {};
  try { state = data.state ? JSON.parse(data.state) : {}; }
  catch (e) { console.error('[push] state ilegible:', e.message); return; }

  webpush.setVapidDetails('mailto:tobiloustau@gmail.com', vapid.pubKey, vapid.sigKey);

  const now = Date.now();
  const notified = data.notifiedReminders || {};
  const newNotif = {};
  const sends = [];   // { key, p } — p resuelve a true o al statusCode del error

  // Qué disparar: lo decide deadlines.js, igual que en el navegador. Acá solo se
  // pasan ventanas de rescate más anchas, porque el cron corre cada 5 minutos y
  // GitHub Actions suele atrasarlo.
  for (const a of CMDeadlines.dueAlerts(state, { now, tz: TZ, seen: notified, windowMs: WINDOW_TIMED, windowLeadMs: WINDOW_LEAD })) {
    sends.push({ key: a.key, p: sendTodas(targets, a.title, a.body, a.key, a.lead, a.url) });
  }
  const results = await Promise.all(sends.map(s => s.p));
  let okCount = 0, muerta = null;
  const muertos = new Set();   // endpoints que respondieron 404/410 (se borran del mapa)
  results.forEach((r, i) => {
    r.dead.forEach(e => muertos.add(e));
    // Se marca como avisado si llegó a algún dispositivo. Si no llegó a ninguno y hubo 404/410: suscripción muerta, se reintenta si se reactiva.
    if (r.ok) { okCount++; newNotif[sends[i].key] = true; }
    else if (r.code === 404 || r.code === 410) muerta = r.code;
  });

  // Un aviso sigue "vivo" mientras pueda volver a corresponder: así el mapa de
  // notificados no crece para siempre pero tampoco olvida uno recién mandado.
  const items = CMDeadlines.collect(state, { now, tz: TZ });
  for (const it of items) {
    for (const a of (it.alerts || [])) {
      if (a.at > now - 7 * 24 * 3600000 && notified[a.key]) newNotif[a.key] = true;
    }
  }

  if (sends.length) console.log(`[push] enviados ${okCount} de ${sends.length} pendientes (${items.length} vencimientos en agenda)`);
  else console.log(`[push] nada por enviar (${items.length} vencimientos en agenda)`);

  // Persistir solo los que ya se mandaron y siguen vigentes.
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
        if (e && e.sub && e.sub.endpoint === t.sub.endpoint) borrar['pushSubscriptions.' + id] = FieldValue.delete();
      }));
      const leg = cur.pushSubscription;
      if (leg && leg.endpoint && muertos.has(leg.endpoint)) borrar.pushSubscription = FieldValue.delete();
      if (Object.keys(borrar).length) tx.update(ref, borrar);
    });
  }
  if (muerta) {
    // Campo de nivel superior (no toca `state`): la app lo lee y avisa. Solo la corrida que lo marca
    // por primera vez sale con error, para que GitHub Actions mande UN mail y no uno cada 5 minutos.
    console.log(`::error::La suscripción push está muerta (el servicio respondió ${muerta}). Hay que reactivar los avisos desde la app.`);
    if (!data.pushDead) { upd.pushDead = { at: new Date().toISOString(), code: muerta }; exitCode = 1; }
  } else if (okCount > 0 && data.pushDead) {
    upd.pushDead = FieldValue.delete();   // volvió a andar
  }
  await ref.set(upd, { merge: true });
  return exitCode;
}

main().then(code => process.exit(code || 0)).catch(e => { console.error(e); process.exit(1); });
