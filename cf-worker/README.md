# cdm-push-worker

Cloudflare Worker que manda un Web Push en el segundo exacto en que termina un
bloque de Pomodoro o un descanso de gimnasio — a diferencia de un `setTimeout`
del lado del cliente, que el navegador frena o pausa cuando la pestaña está en
segundo plano o el celular tiene otra app abierta.

Un Durable Object por timer (`TimerAlarm`), con una Alarm programada al
timestamp exacto de fin. Sin polling, sin cron: el propio runtime de Cloudflare
despierta al Durable Object en el momento justo.

## Rutas

Todas requieren `Authorization: Bearer <WORKER_SECRET>`.

- `POST /schedule/:id` — body `{ delaySeconds, subscription, title, body, tag }`
- `POST /cancel/:id`

`:id` identifica el timer: `pomo` para el Pomodoro (uno a la vez), `rtn-<exId>`
para cada descanso de gimnasio (puede haber varios en simultáneo).

## Deploy

```bash
cd cf-worker
npm install
CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
```

El token y el Account ID viven en `C:\Users\Tobias\.secrets\cdm-api-keys.json`
(clave `cloudflare`), nunca en este repo — es público.

## Secrets del Worker (una sola vez, o al rotar claves)

```bash
npx wrangler secret put WORKER_SECRET       # gate del endpoint (embebido también en app.js)
npx wrangler secret put VAPID_PUBLIC_KEY    # mismo par de claves que usa push-reminders.js
npx wrangler secret put VAPID_PRIVATE_KEY   # (Firestore: appdata/lifedash_v2.vapidKeys)
```

Reusa el MISMO par VAPID que ya usa `push-reminders.js` (cron de recordatorios) —
así la suscripción push que el navegador ya tiene registrada sirve para ambos
sistemas, sin tener que resuscribirse.

## Cliente

`app.js` (`_schedulePushAlarm` / `_cancelPushAlarm`) llama a este Worker desde
`pomodoro.js` y `rutinas.js`. Si no hay suscripción push activa, la llamada es
un no-op silencioso — el cronómetro en la app sigue funcionando igual.
