// Centro de Mando — Push Reminders (cron)
// Lo ejecuta GitHub Actions cada 5 min. Lee el estado de Firestore y manda Web Push
// (VAPID) a la suscripción del usuario, para que los avisos lleguen con la app cerrada.
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

async function main() {
  const ref = db.collection('appdata').doc('lifedash_v2');
  const snap = await ref.get();
  const data = snap.data();
  if (!data) { console.log('[push] sin datos'); return; }

  const pushSub = data.pushSubscription;
  const vapid   = data.vapidKeys;          // { pubKey, sigKey }
  if (!pushSub || !vapid) {
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
    sends.push({ key: a.key, p: send(pushSub, a.title, a.body, a.key, a.lead, a.url) });
  }
  const results = await Promise.all(sends.map(s => s.p));
  let okCount = 0, muerta = null;
  results.forEach((r, i) => {
    if (r === true) { okCount++; newNotif[sends[i].key] = true; }
    else if (r === 404 || r === 410) muerta = r;   // suscripción muerta: no se marca, se reintenta si se reactiva
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
