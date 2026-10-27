# cdm-push-worker

Cloudflare Worker que manda un Web Push en el segundo exacto en que termina un
bloque de Pomodoro o un descanso de gimnasio — a diferencia de un `setTimeout`
del lado del cliente, que el navegador frena o pausa cuando la pestaña está en
segundo plano o el celular tiene otra app abierta.

Un Durable Object por timer (`TimerAlarm`), con una Alarm programada al
timestamp exacto de fin. Sin polling, sin cron: el propio runtime de Cloudflare
despierta al Durable Object en el momento justo.

Un segundo Durable Object, `CarteraGate` (binding `CARTERA`, una sola instancia),
guarda todo el estado de `/cartera` (ver abajo).

## Rutas

- `POST /schedule/:id` y `POST /cancel/:id` — requieren `Authorization: Bearer <WORKER_SECRET>`.
- `GET /cartera` — requiere `Authorization: Bearer <ID token de Firebase Auth>` (ver abajo). **No** usa `WORKER_SECRET`.

`:id` identifica el timer: `pomo` para el Pomodoro (uno a la vez), `rtn-<exId>`
para cada descanso de gimnasio (puede haber varios en simultáneo).

## `GET /cartera` — cartera IOL en vivo

Consultada por `tenencias.js` (pestaña "Mis tenencias") con fallback automático
a `data/cartera/tenencias.json` si esta ruta falla por cualquier motivo. Solo
lectura: nunca envía una orden a IOL.

- **Auth: ID token de Firebase, no el `WORKER_SECRET` compartido.** Este repo
  es público y `WORKER_SECRET` está commiteado en texto plano en `app.js`
  (`_PUSH_WORKER_SECRET`) — perfecto para gatear `/schedule`/`/cancel` (lo
  peor que puede pasar es una notificación de pomodoro de más), pero un
  "secret" legible por cualquiera no protege datos financieros reales. `/cartera`
  exige el ID token que ya emite Firebase Auth cuando el usuario entra con
  Google (`login.js`), lo verifica de punta a punta con WebCrypto — firma
  RS256 contra las claves públicas de Google, `exp`, `iat`, `aud` (= project id
  de Firebase) e `iss` — y además exige que el `sub` (uid) del token matchee
  el secret `OWNER_UID`. Sin esa allowlist, cualquier cuenta de Google válida
  (no solo Tobías) podría pedir la cartera.
- Login OAuth2 password grant de IOL (no de Firebase) contra `https://api.invertironline.com/token` con
  `env.IOL_USER` / `env.IOL_PASS` (nunca hardcodeadas, nunca en `wrangler.toml`).
  El `access_token` queda guardado ~14 min en el storage del Durable Object
  `CarteraGate` — no se pide uno nuevo en cada request. Tras un ingreso rechazado
  (`/token` no-OK) no se reintenta durante 10 min, para no bloquear la cuenta de IOL.
- **El estado vive en `CarteraGate`, no en la Cache API.** La Cache API no funciona
  en `*.workers.dev` ([doc oficial](https://developers.cloudflare.com/workers/runtime-apis/cache/):
  solo los Workers en dominios propios tienen operaciones de caché funcionales) y este
  Worker corre en `cdm-push-worker.tobiasloustau11.workers.dev`: con ella ni la caché ni
  los frenos frenaban nada. El Worker principal verifica el ID token, el `OWNER_UID` y
  que haya credenciales, y recién entonces le pasa al Durable Object solo `fresh`. Las
  credenciales de IOL las lee el DO de `env`; nunca viajan en un body ni se guardan en
  el storage. Una sola consulta a IOL puede estar en vuelo a la vez: los pedidos
  simultáneos esperan esa misma consulta y reciben su resultado (un login y un
  portafolio, no uno por pedido).
- Portafolio: `GET https://api.invertironline.com/api/v2/portafolio/argentina`.
  La respuesta transformada queda guardada ~15 min en el storage del DO — la API de
  IOL no se consulta en cada carga de la app.
- **`GET /cartera?fresh=1` — forzar la actualización.** Misma auth. Salta la caché
  de 15 min del portafolio y consulta IOL (reusa el `access_token` guardado si sigue
  vigente), guarda el resultado nuevo y lo devuelve. Freno anti-abuso: cada intento
  forzado, salga bien o mal, cuenta; si el último fue hace menos de 30 s, responde lo
  guardado (o `429 too_soon` si no hay nada guardado porque el intento anterior falló).
  Toda respuesta 200 trae el header `x-cartera-fuente` (`iol` = se consultó
  IOL, `cache` = salió de lo guardado), expuesto por CORS. Sin `fresh` el comportamiento
  no cambia. Lo usa el botón "Actualizar" de Mis tenencias (timeout de 15 s).
- La verificación del ID token baja los certificados públicos de Google con la Cache
  API (`getGoogleCerts`); en `workers.dev` esa caché no funciona, así que se bajan en
  cada pedido. No es crítico: son públicos y la descarga es liviana.
- CORS restringido a `https://loustau45261470.github.io` (no `*`): expone datos
  financieros personales.
- Devuelve la misma forma que `data/cartera/tenencias.json`, pero solo con los
  campos derivables de un snapshot puntual del portafolio (`simbolo`,
  `descripcion`, `tipo`, `cantidad`, `comprometido`, `precio`,
  `variacionDiariaPct`, `valorizado`, `ppc`, `rendimientoPct`,
  `rendimientoMonto`, y `totales.valorizado`). Quedan sin poder servirse en vivo
  — y se omiten, nunca se inventan — `precioAnterior`, `variacionPct` (semanal),
  `totales.variacionPct`, `ppcConfianza` y `lotes`: piden un histórico o el
  cálculo LIFO que hoy hace la rutina semanal, no algo que salga de una sola
  consulta al portafolio. `tenencias.js` ya trata cada uno de esos campos como
  opcional.
- El mapeo del campo `tipo` de IOL (`MAPA_TIPO` en `src/index.js`) es best-effort
  y **no está verificado contra la API real** — no hubo credenciales para
  probarlo durante el desarrollo. Revisar la primera respuesta real.
- Si faltan `IOL_USER`/`IOL_PASS` o la consulta a IOL falla: HTTP 4xx/5xx con
  `{ error, message }`, nunca un 200 con datos vacíos.

## Deploy

```bash
cd cf-worker
npm install
CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
```

El token y el Account ID viven en `C:\Users\Tobias\.secrets\cdm-api-keys.json`
(clave `cloudflare`), nunca en este repo — es público.

La migración `v2` de `wrangler.toml` (clase nueva `CarteraGate`) se aplica sola con
ese mismo `wrangler deploy`; no hay pasos extra.

## Secrets del Worker (una sola vez, o al rotar claves)

```bash
npx wrangler secret put WORKER_SECRET       # gate de /schedule y /cancel (embebido también en app.js)
npx wrangler secret put VAPID_PUBLIC_KEY    # mismo par de claves que usa push-reminders.js
npx wrangler secret put VAPID_PRIVATE_KEY   # (Firestore: appdata/lifedash_v2.vapidKeys)
npx wrangler secret put IOL_USER            # usuario de la cuenta IOL (para /cartera)
npx wrangler secret put IOL_PASS            # contraseña de esa cuenta IOL (para /cartera)
npx wrangler secret put OWNER_UID           # uid de Firebase de Tobías — único uid que puede pedir /cartera
```

Reusa el MISMO par VAPID que ya usa `push-reminders.js` (cron de recordatorios) —
así la suscripción push que el navegador ya tiene registrada sirve para ambos
sistemas, sin tener que resuscribirse.

`IOL_USER`/`IOL_PASS` y `OWNER_UID` son específicas de `/cartera` — sin las
primeras esa ruta responde `500 missing_credentials`, sin `OWNER_UID` responde
`500 missing_owner_uid` (en ambos casos el resto del Worker, `/schedule` y
`/cancel`, sigue funcionando igual). `wrangler secret put` pide el valor de
forma interactiva; no queda en ningún archivo del repo.

**Cómo conseguir el uid para `OWNER_UID`** (cualquiera de las dos):
- Consola de Firebase → proyecto `centro-de-mando-bdc7d` → Authentication →
  pestaña Users → columna "User UID" de la fila de Tobías.
- Con la app ya abierta y logueado, en la consola del navegador (DevTools):
  `_auth.currentUser.uid`.

Después de correr `wrangler deploy` (sección de arriba), probar `/cartera` a
mano con un ID token fresco (`await _auth.currentUser.getIdToken()` en la
consola del navegador con la app abierta y logueado):

```bash
curl -H "Authorization: Bearer <ID_TOKEN>" https://cdm-push-worker.tobiasloustau11.workers.dev/cartera
```

Debería devolver un JSON con la misma forma que `data/cartera/tenencias.json`.
Si falta algún secret, el token es inválido/de otro uid, o la cuenta IOL
rechaza el login, devuelve un error HTTP con `{ error, message }` explicando
cuál (401/403 por auth, 500 por secrets faltantes, 502 por IOL).

## Cliente

`app.js` (`_schedulePushAlarm` / `_cancelPushAlarm`) llama a este Worker desde
`pomodoro.js` y `rutinas.js`. Si no hay suscripción push activa, la llamada es
un no-op silencioso — el cronómetro en la app sigue funcionando igual.

`tenencias.js` llama a `/cartera` (constante `URL_WORKER`, timeout 6s) y, ante
cualquier falla, cae a `data/cartera/tenencias.json` exactamente como antes de
que existiera esta ruta.
