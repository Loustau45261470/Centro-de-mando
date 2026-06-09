// Centro de Mando — Push Reminders Server Script
// Run by GitHub Actions every 5 minutes.
// Reads Firestore reminders and sends Web Push notifications via VAPID.

const webpush = require('web-push');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore }        = require('firebase-admin/firestore');

const ENV = process['env'];

const svcAccount = JSON.parse(
  Buffer.from(ENV.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
);

initializeApp({ credential: cert(svcAccount) });
const db = getFirestore();

const TABS       = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
const PRIO_EMOJI = { critical: '⚡', high: '🔴', medium: '🟡', low: '🟢' };

function toMinStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function main() {
  const snap = await db.collection('appdata').doc('lifedash_v2').get();
  const data = snap.data();
  if (!data) { console.log('[push] No app data found'); return; }

  const pushSub  = data.pushSubscription;
  const vapid    = data.vapidKeys;          // { pubKey, sigKey }

  if (!pushSub || !vapid) {
    console.log('[push] No push subscription or VAPID keys — activate notifications in the PWA first');
    return;
  }

  webpush.setVapidDetails('mailto:tobiloustau@gmail.com', vapid.pubKey, vapid.sigKey);

  const now       = new Date();
  const currentDT = toMinStr(now);
  const in24hDT   = toMinStr(new Date(now.getTime() + 86400000));

  const reminders = data.reminders || {};
  const notified  = data.notifiedReminders || {};
  const newNotif  = { ...notified };
  const sends     = [];

  for (const tab of TABS) {
    for (const r of (reminders[tab] || [])) {
      if (!r.datetime) continue;
      const remDT = r.datetime.slice(0, 16);
      const prio  = PRIO_EMOJI[r.priority] || '🔵';

      if (remDT === in24hDT && !notified[r.id + '_1d']) {
        newNotif[r.id + '_1d'] = true;
        sends.push(webpush.sendNotification(pushSub, JSON.stringify({
          title: '📅 Vence mañana — Centro de Mando',
          body: `${prio} ${r.title}`,
          tag: r.id + '_1d',
          requireInteraction: true,
        })).catch(err => console.error('[push] 24h error:', err.statusCode, err.message)));
      }

      if (remDT === currentDT && !notified[r.id]) {
        newNotif[r.id] = true;
        sends.push(webpush.sendNotification(pushSub, JSON.stringify({
          title: '🔔 Recordatorio — Centro de Mando',
          body: `${prio} ${r.title}`,
          tag: r.id,
          requireInteraction: false,
        })).catch(err => console.error('[push] exact error:', err.statusCode, err.message)));
      }
    }
  }

  if (sends.length > 0) {
    await Promise.all(sends);
    console.log(`[push] Sent ${sends.length} notification(s)`);
  } else {
    console.log('[push] No reminders due');
  }

  // Persist notified state + clean stale entries
  const allIds = new Set();
  for (const tab of TABS) {
    for (const r of (reminders[tab] || [])) {
      allIds.add(r.id);
      allIds.add(r.id + '_1d');
    }
  }
  const cleaned = {};
  for (const k of Object.keys(newNotif)) {
    if (allIds.has(k)) cleaned[k] = true;
  }
  await db.collection('appdata').doc('lifedash_v2').update({ notifiedReminders: cleaned });
}

main().catch(console.error).finally(() => process.exit(0));
