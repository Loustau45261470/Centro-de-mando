// Centro de Mando — Push Reminders (cron)
// Lo ejecuta GitHub Actions cada 5 min. Lee los recordatorios de Firestore y manda
// Web Push (VAPID) a la suscripción del usuario, para que lleguen con la app cerrada.

const webpush = require('web-push');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ENV = process.env;
if (!ENV.FIREBASE_SERVICE_ACCOUNT) {
  console.log('[push] falta el secret FIREBASE_SERVICE_ACCOUNT — agregalo en Settings → Secrets → Actions del repo');
  process.exit(0);
}
const svcAccount = JSON.parse(ENV.FIREBASE_SERVICE_ACCOUNT);

initializeApp({ credential: cert(svcAccount) });
const db = getFirestore();

const TABS = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
const PRIO_EMOJI = { critical: '⚡', high: '🔴', medium: '🟡', low: '🟢' };
const TZ = '-03:00';                 // Argentina (UTC-3, sin horario de verano)
const HOUR = 3600000, DAY = 86400000;

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

  // Los recordatorios viven DENTRO del campo state (JSON serializado del estado S)
  let state = {};
  try { state = data.state ? JSON.parse(data.state) : {}; }
  catch (e) { console.error('[push] state ilegible:', e.message); return; }
  const reminders = state.reminders || {};

  webpush.setVapidDetails('mailto:tobiloustau@gmail.com', vapid.pubKey, vapid.sigKey);

  const now = Date.now();
  const notified = data.notifiedReminders || {};
  const newNotif = { ...notified };
  const sends = [];

  for (const tab of TABS) {
    for (const r of (reminders[tab] || [])) {
      if (!r.datetime) continue;
      const remMs = new Date(r.datetime.slice(0, 16) + ':00' + TZ).getTime();
      if (isNaN(remMs)) continue;
      const prio  = PRIO_EMOJI[r.priority] || '🔵';
      const toRem = remMs - now;

      // Aviso 1 día antes (ventana de ~1h alrededor de las 24h previas)
      if (toRem > 0 && toRem <= DAY && toRem > DAY - 2 * HOUR && !notified[r.id + '_1d']) {
        newNotif[r.id + '_1d'] = true;
        sends.push(send(pushSub, '📅 Vence mañana — Centro de Mando', `${prio} ${r.title}`, r.id + '_1d', true));
      }
      // Aviso al vencer (recién pasó, dentro de la última hora; el dedup evita repetir)
      if (remMs <= now && now - remMs < HOUR && !notified[r.id]) {
        newNotif[r.id] = true;
        sends.push(send(pushSub, '🔔 Recordatorio — Centro de Mando', `${prio} ${r.title}`, r.id, false));
      }
    }
  }

  if (sends.length) { await Promise.all(sends); console.log(`[push] enviados ${sends.length}`); }
  else console.log('[push] nada por enviar');

  // Persistir "ya notificado", limpiando entradas de recordatorios borrados
  const live = new Set();
  for (const tab of TABS) for (const r of (reminders[tab] || [])) { live.add(r.id); live.add(r.id + '_1d'); }
  const cleaned = {};
  for (const k of Object.keys(newNotif)) if (live.has(k)) cleaned[k] = true;
  await ref.set({ notifiedReminders: cleaned }, { merge: true });
}

main().catch(e => { console.error(e); }).finally(() => process.exit(0));
