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

- `POST /schedule/:id` y `POST /cancel/:id` — requieren `Authorization: Bearer <ID token de Firebase Auth del dueño>` (`uid === OWNER_UID`, mismo gate `autorizarDueno` que `/cartera`; 401 sin token/inválido, 403 si el uid no es el del dueño). El secreto fijo `WORKER_SECRET` que se usaba antes se eliminó (2026-11-12): estaba en texto plano en el repo público. No volver a poner un secreto en el cliente.
  Body de `/schedule`: `{ delaySeconds, subscriptions: [...] (todas las suscripciones push del dueño, máx. 10; cada una con `https://` en el endpoint y `keys`), subscription (la del dispositivo que agenda; formato viejo, sigue aceptándose sola), title, body, tag }`, máx. 32 KB. El timer es **por dispositivo** (`:id` = `pomo-<deviceId>` / `rtn-<deviceId>-<exId>`, el cliente lo arma en `_pushTimerId`) y al sonar la alarma el aviso sale a TODAS las suscripciones (cada envío aislado: uno que falla no frena a los demás).
- `GET /cartera` — requiere `Authorization: Bearer <ID token de Firebase Auth>` (ver abajo).
- `GET /datos/<archivo>.json` — mismo gate que `/cartera`; archivos privados de la cartera (ver abajo).
- `GET /rendimiento/operaciones`, `/rendimiento/cierres`, `/rendimiento/mercado` — mismo gate que `/cartera`; datos de la pestaña "Rendimiento" (ver abajo).
- `GET /radar/precios?t=NVDA,MELI`, `POST /radar/pedir` y `POST /radar/reportar` — mismo gate que `/cartera`; pestaña "Radar" de Cartera (ver "Radar de empresas" abajo).

`:id` identifica el timer: `pomo` para el Pomodoro (uno a la vez), `rtn-<exId>`
para cada descanso de gimnasio (puede haber varios en simultáneo).

## `GET /cartera` — cartera IOL en vivo

Consultada por `tenencias.js` (pestaña "Mis tenencias") con fallback automático
al `tenencias.json` privado (`/datos/`, ver más abajo) si esta ruta falla por cualquier motivo. Solo
lectura: nunca envía una orden a IOL.

- **Auth: ID token de Firebase.** Este repo es público, así que ningún
  "secret" embebido en el cliente protege nada. `/cartera`
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

## `GET /datos/<archivo>.json` — archivos privados de la cartera

Sirve `tenencias.json`, `latest.json` y `<YYYY-MM>.json` desde el repo **privado**
`Loustau45261470/centro-de-mando-datos` (archivos en la raíz), para que no vivan
en el repo público del sitio. El cliente es `datos-privados.js` (`CMDatos.cartera(nombre)`).

- **Auth idéntica a `/cartera`** (mismo helper, `autorizarDueno`): `Authorization: Bearer <ID token de Firebase>`
  verificado de punta a punta + `uid === OWNER_UID`. 401 sin token / token inválido, 403 si el uid no es el del dueño.
- `<archivo>` debe cumplir `^[A-Za-z0-9_-]+\.json$`; si no, 400 `bad_file` (sin subcarpetas ni `..`).
- Lee `GET https://api.github.com/repos/<DATOS_REPO>/contents/<archivo>` con `Accept: application/vnd.github.raw`
  y `Authorization: Bearer <GH_DATA_TOKEN>`. `DATOS_REPO` está en `[vars]` de `wrangler.toml` (no es secreto).
- Errores: 500 `missing_gh_token` si falta el secret; 404 `not_found` si el archivo no existe en el repo privado;
  502 `github_error` / `github_unavailable` si GitHub falla (token vencido, sin acceso al repo, caído).
- Respuesta: el JSON tal cual, con `Cache-Control: private, no-store`. Caché corta (~5 min, `caches.default`)
  que se consulta recién después de validar el token. Igual que arriba: en `*.workers.dev` la Cache API no
  guarda nada, así que ahí cada pedido va a GitHub (son pocos y chicos); la caché solo sirve en dominio propio.
- CORS igual que `/cartera` (solo el origen del sitio, `OPTIONS` incluido).

**Puesta en marcha (una sola vez):**

1. En GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   Repository access: **Only select repositories** → solo `centro-de-mando-datos`. Permissions → Repository
   permissions → **Contents: Read-only** (nada más). Copiar el token.
2. Desde esta carpeta (`cf-worker/`): `npx wrangler secret put GH_DATA_TOKEN` y pegar el token cuando lo pida.
3. `npx wrangler deploy`
4. Probar con un ID token fresco (consola del navegador con la app abierta: `await _auth.currentUser.getIdToken()`):

```bash
curl -i -H "Authorization: Bearer <ID_TOKEN>" https://cdm-push-worker.tobiasloustau11.workers.dev/datos/tenencias.json
```

Sin el header debe dar 401; con el token correcto, el JSON de las tenencias.

## `GET /rendimiento/*` — rendimiento como inversor

Alimentan la pestaña "Rendimiento" de Cartera (`rendimiento.js` + `rendimiento-calc.js`). **Auth idéntica a `/cartera`** (`autorizarDueno`:
ID token de Firebase + `uid === OWNER_UID`; 401 / 403 / 500). Solo lectura: nunca se envía una orden a IOL. Comparten el estado de
`CarteraGate` (mismo token de IOL: `getIolToken` ahora evita dos logins simultáneos; el comportamiento de `/cartera` no cambia). Parámetros con
formato estricto (400 `bad_param`). CORS y `Cache-Control: private, no-store` como `/datos`.

- `GET /rendimiento/operaciones?desde=YYYY-MM-DD` — `GET /api/v2/operaciones?filtro.estado=terminadas&filtro.fechaDesde=…&filtro.pais=argentina`,
  más el detalle de cada compra/venta (`GET /api/v2/operaciones/{numero}`, para la comisión = suma de `aranceles` neto + IVA) y
  `GET /api/v2/estadocuenta` (efectivo por moneda: `disponible` y `saldo`; la app usa `saldo`). Lista y efectivo se guardan 5 min; cada detalle, para siempre.
  Máx. 25 detalles nuevos por consulta (límite de subrequests): si quedan más, `comisionesPendientes > 0` y se completan en la siguiente.
  Devuelve `{ desde, generado, operaciones:[{numero,fecha,fechaHora,tipo,tipoCrudo,simbolo,mercado,moneda,cantidad,precio,monto,comision}], efectivo, comisionesPendientes }`.
  `tipo` = compra | venta | dividendo | renta | amortizacion | otro (clasificado por el texto del tipo de IOL).
- `GET /rendimiento/cierres?fecha=YYYY-MM-DD&s=SIM:MERCADO,SIM:MERCADO` — cierre (`ultimoPrecio`) de cada símbolo ese día:
  `GET /api/v2/{mercado}/Titulos/{simbolo}/Cotizacion/seriehistorica/{fecha}/{fecha+1}/sinAjustar`. Un día ya cerrado se guarda para siempre; el de hoy no
  (puede ser intradía). `null` si no hay barra. Hasta 30 símbolos.
- `GET /rendimiento/mercado?desde=YYYY-MM-DD` — fuentes públicas, guardado 10 min solo si todas respondieron (si no, `errores` dice cuál falló):
  MEP venta diario (`api.argentinadatos.com`, con `dolarapi.com` para el valor del día), SPY diario con cierre ajustado por dividendos
  (Yahoo Finance `v8/finance/chart`, sin API oficial), IPC INDEC mensual (`api.argentinadatos.com`) y CPI-U de EE.UU. (FRED `CPIAUCNS` en CSV; respaldo: API pública v1 del BLS).

**Sin NADA de esto verificado contra la cuenta real de IOL** (no hubo credenciales en el desarrollo): los nombres de campo de operaciones / detalle / estado de
cuenta y de la serie histórica salen de la documentación de la API v2 y de la memoria, y los tests usan respuestas inventadas con esa forma. Revisar la primera
respuesta real (ver "Probar" abajo). Si IOL no informa dividendos/rentas o aranceles, la pestaña lo avisa y se pueden cargar a mano ahí mismo.

**Para volver a desplegar** (cambió `src/index.js`; no hay secrets ni migraciones nuevas, `GH_DATA_TOKEN` ya alcanza para `rendimiento-base.json`):

```bash
cd cf-worker
CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
```

**Probar** (ID token fresco: `await _auth.currentUser.getIdToken()` en la consola con la app abierta):

```bash
curl -H "Authorization: Bearer <ID_TOKEN>" "https://cdm-push-worker.tobiasloustau11.workers.dev/rendimiento/operaciones?desde=2026-11-04"
curl -H "Authorization: Bearer <ID_TOKEN>" "https://cdm-push-worker.tobiasloustau11.workers.dev/rendimiento/mercado?desde=2026-11-04"
```

Mientras el Worker viejo siga publicado, la pestaña dice "Falta publicar el servidor" (las rutas nuevas responden 401 sin JSON).

## Radar de empresas — `GET /radar/precios`, `POST /radar/pedir` y `POST /radar/reportar`

Alimentan la pestaña **Radar** de Cartera (`radar.js` + `radar-calc.js`): ficha por empresa (las de la cartera + las que seguís) con
fundamentals de 10 años de la SEC y múltiplos (P/E, P/S, EV/EBITDA, FCF yield) calculados AL VUELO con el precio en vivo.
**Auth idéntica a `/cartera`** (`autorizarDueno`: ID token de Firebase + `uid === OWNER_UID`; 401 / 403 / 500, antes de tocar nada). CORS solo del sitio
(`POST` y `content-type` permitidos solo en `/radar/`), `Cache-Control: private, no-store`. Solo lectura de fuentes públicas: no opera nada.

### Por qué los fundamentals NO se calculan en el Worker
El JSON `companyfacts` de la SEC pesa 4–10 MB por empresa. El plan gratuito de Workers da **10 ms de CPU por pedido** (y 50 subrequests): parsear eso
ahí puede cortarse a mitad. Con `companyconcept` (un JSON por concepto) harían falta ~30 pedidos por empresa, también al límite. Por eso:

- Un **workflow de GitHub Actions** en el repo privado de datos (`.github/workflows/radar-datos.yml`, Radar v2) baja Yahoo y la SEC y commitea `mercado-<TICKER>.json` y `historia-<TICKER>.json`
  (qué empresas se procesan lo dice `radar-config.json` del repo privado). Corre solo lunes a viernes 11:00 UTC y a pedido (`workflow_dispatch`, inputs `tickers` y `solo`).
- La app los lee con la ruta que ya existe, `GET /datos/<archivo>.json` (mismo login, mismo `GH_DATA_TOKEN`). El Worker **solo dispara** el workflow (`POST /radar/pedir`); el único archivo
  que escribe en el repo privado es `reportes.json` (`POST /radar/reportar`).
- El **precio no pasa por el job** si se quiere en vivo (`/radar/precios`); el denominador de los múltiplos cambia recién cuando la empresa presenta un reporte nuevo.

### Rutas
- `GET /radar/precios?t=NVDA,MELI` — 1 a 30 tickers (`^[A-Z][A-Z0-9-]{0,9}$`, se pasan a mayúsculas; si no, 400 `bad_param`). Último precio regular en USD del subyacente (**no** el CEDEAR en pesos):
  Yahoo Finance `v8/finance/chart/<T>?range=1d&interval=1d` (sin API oficial: se prueban `query1` y `query2`, mismo criterio que el SPY de `/rendimiento/mercado`). Devuelve
  `{ generado, precios: { T: { precio, previo, hora (ms), moneda } | null }, errores: { T: 'not_found' | 'unavailable' } }`. Cada ticker falla por separado.
  Guardado 60 s por ticker en el Durable Object `CarteraGate` (los que Yahoo no conoce, 10 min). La app muestra "hace X min" con `hora` y renueva sola cada minuto.
- `POST /radar/pedir` con `{ "tickers": ["NVDA","MELI"] }` (1 a 25) — lanza `workflow_dispatch` de `radar-datos.yml` en `DATOS_REPO` (rama por defecto del repo) con `inputs.tickers` = los tickers separados por coma (sin `solo`: actualiza mercado e historia).
  Freno: el mismo ticker no se vuelve a pedir durante 10 min (guardado en el DO; un pedido fallido no consume el freno). Respuesta: `{ pedidos, yaPedidos }`.
  Errores: 500 `missing_gh_token`; 502 `github_token` (token rechazado), `github_permiso` (falta el permiso Actions o el archivo del workflow en el repo de datos), `github_error`, `github_unavailable`.
- `POST /radar/reportar` — «este número está mal». Body JSON:
  `{ "ticker": "V", "kpi_id": "margen_op", "trimestre": "2026-09-30", "valor_mostrado": "31,2%", "comentario": "opcional, hasta 500 caracteres" }`.
  Validación (400 `bad_param` con el motivo en `message`): `ticker` como en el resto del radar (se pasa a mayúsculas); `kpi_id` y `trimestre` `^[A-Za-z0-9_.-]{1,64}$`; `valor_mostrado` texto o número, 1 a 60 caracteres (se guarda como texto); `comentario` ≤ 500.
  Agrega la entrada al final de `reportes.json` del repo privado (Contents API con `GH_DATA_TOKEN`: lee el `sha`, agrega, `PUT`; si GitHub da 409 relee y reintenta **una** vez; si el archivo no existe lo crea). Entrada:
  `{ id, ticker, kpi_id, trimestre, valor_mostrado, comentario, estado: "en_revision", reportado_en (ISO), resuelto_en: null, resolucion: null }`, con `id = "TICKER:kpi_id:trimestre"`.
  Si ya hay un reporte `en_revision` de ese mismo número, **no duplica**: devuelve el existente. Si el anterior ya se resolvió, agrega uno nuevo con `id` `…#2`, `…#3` (el historial no se pisa).
  Respuesta 200: `{ ok: true, duplicado: boolean, reporte: {…entrada…} }`. Errores: 400 `bad_param`; 401/403/500 del gate; 429 `limite_diario` (máx. 20 reportes nuevos por día de Buenos Aires, contador en el storage del DO; los duplicados no gastan cupo);
  409 `conflicto` (dos conflictos seguidos con GitHub); 500 `missing_gh_token`; 502 `github_token`, `github_permiso` (el token necesita **Contents: Read and write** sobre el repo de datos, no solo lectura), `github_error`, `reportes_ilegible` (el archivo no es una lista; no se toca).
  Las escrituras se serializan dentro del Durable Object. Como el token de `/datos/` también lee el repo, `GET /datos/reportes.json` sirve la lista (hasta 5 min de caché si el despliegue tuviera caché de Cache API).

### Puesta en marcha (una sola vez) — pasos exactos
1. **Workflow en el repo de datos.** Ya subido en Radar v2: `.github/workflows/radar-datos.yml` (reemplazó a `radar-fundamentals.yml`).
2. **Secret de la SEC.** En ese repo: Settings → Secrets and variables → Actions → New repository secret. Nombre: `SEC_USER_AGENT`. Valor: tu nombre y un mail de contacto, por ejemplo
   `Centro de Mando tu-mail@ejemplo.com`. La SEC lo exige para dejar bajar datos; así el mail no queda en ningún archivo del repo público.
3. **Permisos del workflow.** En ese repo: Settings → Actions → General → Workflow permissions → "Read and write permissions" → Save (el workflow necesita guardar los archivos).
4. **Ampliar el token de GitHub del Worker.** GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → el token que ya usa el Worker (`GH_DATA_TOKEN`) →
   Permissions → Repository permissions: poner **Contents: Read and write** (hace falta para que `/radar/reportar` escriba `reportes.json`) y agregar **Actions: Read and write**, solo sobre `centro-de-mando-datos`. Es el mismo token: no hay que cambiar el secret.
   Si el token fuera nuevo (otro valor), correr `npx wrangler secret put GH_DATA_TOKEN` y pegarlo.
5. **Desplegar el Worker** (cambió `src/index.js`; no hay migraciones ni secrets nuevos del lado del Worker):
   ```bash
   cd cf-worker
   CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
   ```
6. **Primera carga.** Abrir Cartera → pestaña Radar: las empresas de la cartera se piden solas y a los 1–2 minutos aparecen los datos. También se puede correr a mano:
   repo de datos → Actions → radar-datos → Run workflow (en "Tickers" poner por ejemplo `NVDA,MELI`, o dejar vacío para refrescar todo).
7. **Probar** (ID token fresco: `await _auth.currentUser.getIdToken()` en la consola con la app abierta):
   ```bash
   curl -H "Authorization: Bearer <ID_TOKEN>" "https://cdm-push-worker.tobiasloustau11.workers.dev/radar/precios?t=NVDA"
   curl -X POST -H "Authorization: Bearer <ID_TOKEN>" -H "content-type: application/json" -d '{"tickers":["NVDA"]}' https://cdm-push-worker.tobiasloustau11.workers.dev/radar/pedir
   ```
   Sin token deben dar 401 (con POST) o 405 (un GET a `/radar/reportar`: el método se chequea antes que el login). Variable opcional en `[vars]` de `wrangler.toml`: `DATOS_REF` (rama del repo de datos si no se quiere la rama por defecto).

### Mapeo de conceptos de la SEC, fórmulas y TTM
Todo está documentado arriba de `radar-calc.js` (conceptos `us-gaap` e `ifrs-full` con fallback por período, trimestres desde acumulados, Q4 = año − 9 meses, TTM, FCF, EBITDA, ROIC, múltiplos).
Las 20-F (por ejemplo NU, IFRS) no traen trimestres con datos financieros en la SEC: su TTM es el último año fiscal y la ficha lo dice. Lo que una empresa no informa con las etiquetas que leemos queda en «—» (no se estima).
Empresa que la SEC no tiene (fondos, ETFs, no-EE.UU.): el job deja `{ error: 'no_sec' }` y la ficha lo avisa. Si las acciones saltan ×1,5 o más entre años (split), EPS y acciones de los años anteriores quedan en «—».

**Sin NADA de esto verificado contra el despliegue real** (no hay Worker ni repo de datos publicados en el desarrollo): el cálculo se probó con fixtures inventados y, a mano, contra datos públicos de la SEC de cuatro empresas; el workflow no se corrió en GitHub.

## Cliente

`datos-privados.js` (`CMDatos.cartera`) pide cada archivo de cartera a `/datos/<archivo>`. Mientras el repo
público siga teniendo `data/cartera/`, cae a esa copia pública ante un Worker viejo / sin red / 401 / 5xx
(fallback transitorio; se quita al borrar `data/cartera` del repo público). Ante 403 (otro usuario) no cae: devuelve null.

`app.js` (`_schedulePushAlarm` / `_cancelPushAlarm`) llama a este Worker desde
`pomodoro.js` y `rutinas.js`. Si no hay suscripción push activa, la llamada es
un no-op silencioso — el cronómetro en la app sigue funcionando igual.

`tenencias.js` llama a `/cartera` (constante `URL_WORKER`, timeout 6s) y, ante
cualquier falla, muestra el `tenencias.json` de `/datos/` (vía `CMDatos`)
exactamente como antes de que existiera esta ruta.
