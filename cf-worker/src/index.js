// cdm-push-worker — dispara un Web Push en el segundo exacto en que termina un
// bloque de Pomodoro o un descanso de gimnasio, aunque la pestaña esté en 2do
// plano o el celular con otra app abierta (donde setTimeout/setInterval del
// cliente se frenan). Un Durable Object por timer, con Alarm programada al
// timestamp exacto de fin — no hay polling ni cron de por medio.
//
// Rutas (todas requieren header Authorization: Bearer <WORKER_SECRET>):
//   POST /schedule/:id  { delaySeconds, subscription, title, body, tag }
//   POST /cancel/:id
//
// :id identifica el timer — 'pomo' para el Pomodoro (uno a la vez), 'rtn-<exId>'
// para cada descanso de gimnasio (puede haber varios en simultáneo).

import { buildPushPayload } from '@block65/webcrypto-web-push';

export class TimerAlarm {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/schedule') {
      const body = await request.json();
      const { delaySeconds, subscription, title, body: notifBody, tag } = body;
      if (!delaySeconds || delaySeconds < 1 || delaySeconds > 3600 || !subscription || !subscription.endpoint) {
        return new Response('bad request', { status: 400 });
      }
      await this.state.storage.put('payload', { subscription, title, notifBody, tag });
      await this.state.storage.setAlarm(Date.now() + delaySeconds * 1000);
      return new Response('scheduled', { status: 200 });
    }
    if (request.method === 'POST' && url.pathname === '/cancel') {
      await this.state.storage.deleteAlarm();
      await this.state.storage.delete('payload');
      return new Response('cancelled', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }

  async alarm() {
    const payload = await this.state.storage.get('payload');
    await this.state.storage.delete('payload');
    if (!payload) return;
    const { subscription, title, notifBody, tag } = payload;
    const vapid = {
      subject: 'mailto:tobiloustau@gmail.com',
      publicKey: this.env.VAPID_PUBLIC_KEY,
      privateKey: this.env.VAPID_PRIVATE_KEY,
    };
    // Mismo formato de payload que ya espera sw.js: event.data.json() → {title, body, tag}.
    const message = {
      data: JSON.stringify({ title, body: notifBody, tag }),
      options: { ttl: 300 }, // si no se entrega en 5 min ya no sirve, no encolar más
    };
    try {
      const req = await buildPushPayload(message, subscription, vapid);
      const res = await fetch(subscription.endpoint, req);
      if (!res.ok) console.error('push send failed', res.status, await res.text());
    } catch (e) {
      console.error('push send error', e);
    }
  }
}

// CORS: el Worker vive en otro origen que el sitio (loustau45261470.github.io),
// así que el navegador exige preflight (OPTIONS) + el header en cada respuesta.
// El gate real es el Bearer token, no el origin — '*' no relaja nada de fondo.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};
const withCors = res => {
  const h = new Headers(res.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.WORKER_SECRET}`) {
      return withCors(new Response('unauthorized', { status: 401 }));
    }
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/(schedule|cancel)\/([a-zA-Z0-9_-]+)$/);
    if (!m || request.method !== 'POST') return withCors(new Response('not found', { status: 404 }));
    const [, action, id] = m;

    const bodyText = action === 'schedule' ? await request.text() : '';
    const doId = env.TIMER.idFromName(id);
    const stub = env.TIMER.get(doId);
    const res = await stub.fetch(`https://do/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bodyText || undefined,
    });
    return withCors(res);
  },
};
