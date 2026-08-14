// Centro de Mando — Push Reminders (cron)
// Lo ejecuta GitHub Actions cada 5 min. Lee el estado de Firestore y manda Web Push
// (VAPID) a la suscripción del usuario, para que los avisos lleguen con la app cerrada.
//
// Qué avisa: TODO lo que tiene fecha — recordatorios, proyectos con fecha límite,
// finales, cursada, metas del día con hora, actividades del planner, proyecciones
// que vencen, suscripciones y pedidos. La lista y los horarios de aviso los calcula
// deadlines.js, el MISMO archivo que usa la app en el navegador.

const webpush = require('web-push');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
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

function send(sub, title, body, tag, requireInteraction) {
  return webpush.sendNotification(sub, JSON.stringify({ title, body, tag, requireInteraction }))
    .catch(err => console.error('[push] error', tag, err.statusCode, err.message));
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
  const sends = [];

  const items = CMDeadlines.collect(state, { now, tz: TZ });
  for (const it of items) {
    for (const a of (it.alerts || [])) {
      const isLead = a.lead;
      const win = isLead ? WINDOW_LEAD : WINDOW_TIMED;
      // Sigue "vivo" mientras el aviso pueda volver a corresponder: así el mapa de
      // notificados no crece para siempre pero tampoco olvida uno recién mandado.
      if (a.at > now - 7 * 24 * 3600000) newNotif[a.key] = notified[a.key] || false;
      if (a.at <= now && now - a.at < win && !notified[a.key]) {
        newNotif[a.key] = true;
        sends.push(send(pushSub, a.title, a.body, a.key, isLead));
      }
    }
  }

  if (sends.length) { await Promise.all(sends); console.log(`[push] enviados ${sends.length} de ${items.length} vencimientos`); }
  else console.log(`[push] nada por enviar (${items.length} vencimientos en agenda)`);

  // Persistir solo los que ya se mandaron y siguen vigentes.
  const cleaned = {};
  for (const k of Object.keys(newNotif)) if (newNotif[k]) cleaned[k] = true;
  await ref.set({ notifiedReminders: cleaned }, { merge: true });
}

main().catch(e => { console.error(e); }).finally(() => process.exit(0));
