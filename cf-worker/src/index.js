// cdm-push-worker — dispara un Web Push en el segundo exacto en que termina un
// bloque de Pomodoro o un descanso de gimnasio, aunque la pestaña esté en 2do
// plano o el celular con otra app abierta (donde setTimeout/setInterval del
// cliente se frenan). Un Durable Object por timer, con Alarm programada al
// timestamp exacto de fin — no hay polling ni cron de por medio.
//
// Rutas:
//   POST /schedule/:id  { delaySeconds, subscription, title, body, tag }  — Bearer <WORKER_SECRET>
//   POST /cancel/:id                                                      — Bearer <WORKER_SECRET>
//   GET  /cartera  — cartera IOL en vivo — Bearer <ID token de Firebase Auth>, ver más abajo
//                    (el estado — caché, token de IOL, frenos — vive en el Durable Object CarteraGate)
//   GET  /datos/<archivo>.json — archivos privados de la cartera (repo privado de GitHub) — Bearer <ID token de Firebase Auth>
//                    mismo gate que /cartera (solo el dueño); ver handleDatos() más abajo
//   GET  /rendimiento/operaciones?desde=YYYY-MM-DD  — operaciones de IOL desde esa fecha + efectivo de la cuenta (solo lectura)
//   GET  /rendimiento/cierres?fecha=YYYY-MM-DD&s=SIM:MERCADO,...  — precio de cierre de cada símbolo ese día (serie histórica de IOL)
//   GET  /rendimiento/mercado?desde=YYYY-MM-DD  — MEP, SPY, IPC INDEC y CPI EE.UU. (fuentes públicas) — mismo gate que /cartera
//                    las tres comparten el token de IOL y el estado de CarteraGate; ver handleRendimiento() más abajo
//   GET  /radar/precios?t=NVDA,MELI  — precio en vivo (USD) del subyacente de cada ticker (Yahoo Finance, caché 60 s) — mismo gate que /cartera
//   POST /radar/pedir  { tickers:[...] }  — lanza el workflow del repo privado que baja los fundamentals de la SEC (workflow_dispatch) — mismo gate
//                    Radar de empresas; ver handleRadar() más abajo. Los fundamentals NO se calculan acá: se leen con GET /datos/fund-<TICKER>.json
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

// ── GET /cartera — cartera IOL en vivo (cacheada), consumida por tenencias.js ──
// A diferencia de /schedule y /cancel (datos de push, sin problema si se leen
// desde cualquier origen con el secret compartido), acá el origen SÍ importa
// y el secret compartido NO alcanza: este repo es público y WORKER_SECRET
// está commiteado en texto plano en app.js — un "secret" que cualquiera puede
// leer del repo no protege nada. El gate real de /cartera es el ID token de
// Firebase Auth (el usuario ya inicia sesión con Google en login.js) más una
// allowlist de un solo uid — ver verifyFirebaseIdToken() y env.OWNER_UID.
const CARTERA_ALLOWED_ORIGIN = 'https://loustau45261470.github.io';
// Project id de Firebase — dato público (ya está en el firebaseConfig de
// app.js:251, visible para cualquiera con el repo), no es un secreto: se
// deja como constante acá en vez de agregar un secret innecesario.
const FIREBASE_PROJECT_ID = 'centro-de-mando-bdc7d';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CACHE_KEY_GOOGLE_CERTS = new Request('https://cdm-cartera-cache.internal/google-certs');
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const CARTERA_CORS_HEADERS = {
  'Access-Control-Allow-Origin': CARTERA_ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization',
  // x-cartera-fuente ('iol' | 'cache') le dice al cliente si la respuesta vino de IOL o de la caché del Worker.
  'Access-Control-Expose-Headers': 'x-cartera-fuente',
  'Vary': 'Origin',
};
const IOL_TOKEN_URL = 'https://api.invertironline.com/token';
const IOL_PORTAFOLIO_URL = 'https://api.invertironline.com/api/v2/portafolio/argentina';
const CARTERA_CACHE_TTL_MS = 900 * 1000; // 15 min — no golpear la API de IOL en cada carga
const IOL_TOKEN_TTL_MS = 840 * 1000; // el access_token de IOL dura ~15 min; 14 de margen
// ?fresh=1 salta la caché del portafolio, pero con freno anti-abuso: si el último refresco forzado
// fue hace menos de CARTERA_FRESH_MIN_INTERVAL_MS, se responde lo cacheado.
const CARTERA_FRESH_MIN_INTERVAL_MS = 30000;
const IOL_LOGIN_BACKOFF_MS = 10 * 60 * 1000;

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { ...CARTERA_CORS_HEADERS, 'content-type': 'application/json' },
  });
}

// ── CarteraGate — todo el estado de /cartera vive acá (Durable Object, una sola instancia) ──
// La Cache API no funciona en *.workers.dev (solo en dominios propios): con ella ni la caché
// del portafolio ni los frenos frenaban nada y cada pedido iba a IOL con la contraseña. El
// estado va en el storage del DO: portafolio cacheado, token de IOL, último refresco forzado
// y último ingreso rechazado. Las credenciales llegan por env, nunca por el body ni al storage.
// Un DO atiende pedidos intercalados mientras espera un fetch, así que una sola consulta a IOL
// puede estar en vuelo a la vez (this.enVuelo): los pedidos que llegan mientras tanto reciben
// el resultado de esa misma consulta en vez de disparar otro login u otro portafolio.
export class CarteraGate {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.enVuelo = null;
    this.tokenEnVuelo = null;
    this.vuelos = new Map(); // /rendimiento: pedidos idénticos simultáneos comparten una sola consulta
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/rendimiento/')) {
      const params = await request.json().catch(() => ({}));
      const r = await this.rendimiento(url.pathname.slice('/rendimiento/'.length), params);
      return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
    }
    if (request.method === 'POST' && url.pathname.startsWith('/radar/')) {
      const params = await request.json().catch(() => ({}));
      const r = await this.radar(url.pathname.slice('/radar/'.length), params);
      return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
    }
    if (request.method !== 'POST' || url.pathname !== '/consultar') return new Response('not found', { status: 404 });
    const { fresh } = await request.json().catch(() => ({}));
    if (!this.enVuelo) {
      const p = this.consultar(fresh === true);
      this.enVuelo = p;
      const liberar = () => { if (this.enVuelo === p) this.enVuelo = null; };
      p.then(liberar, liberar);
    }
    const r = await this.enVuelo;
    const headers = { 'content-type': 'application/json' };
    if (r.fuente) headers['x-cartera-fuente'] = r.fuente;
    return new Response(r.body, { status: r.status, headers });
  }

  async consultar(fresh) {
    const storage = this.state.storage;
    const error = (status, code, message) => ({ status, body: JSON.stringify({ error: code, message }), fuente: null });

    let forzar = fresh;
    let frenado = false;
    if (forzar) {
      const ultimo = await storage.get('freshLast');
      if (typeof ultimo === 'number' && Date.now() - ultimo < CARTERA_FRESH_MIN_INTERVAL_MS) { forzar = false; frenado = true; }
    }
    if (forzar) {
      // El freno cuenta cada intento forzado, salga bien o mal: un IOL que falla tampoco se golpea más de una vez cada 30 s.
      await storage.put('freshLast', Date.now());
    } else {
      const cached = await storage.get('portafolio');
      if (cached && typeof cached.at === 'number' && Date.now() - cached.at < CARTERA_CACHE_TTL_MS) {
        return { status: 200, body: cached.body, fuente: 'cache' };
      }
      // Frenado y sin nada guardado (el intento anterior falló): no se vuelve a consultar IOL todavía.
      if (frenado) return error(429, 'too_soon', 'Esperá unos segundos antes de volver a actualizar.');
    }

    try {
      const token = await this.getIolToken();
      const res = await fetch(IOL_PORTAFOLIO_URL, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('portafolio IOL falló (HTTP ' + res.status + ')');
      const raw = await res.json();
      const body = JSON.stringify(transformarPortafolio(raw));
      await storage.put('portafolio', { body, at: Date.now() });
      return { status: 200, body, fuente: 'iol' };
    } catch (e) {
      console.error('cartera error', e);
      return error(502, 'iol_unavailable', 'No se pudo obtener la cartera desde IOL: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // Un solo ingreso a IOL a la vez: /cartera y las rutas de /rendimiento pueden llegar juntas y no deben gastar dos logins.
  getIolToken() {
    if (!this.tokenEnVuelo) {
      const p = this.getIolTokenSinDedupe();
      this.tokenEnVuelo = p;
      const liberar = () => { if (this.tokenEnVuelo === p) this.tokenEnVuelo = null; };
      p.then(liberar, liberar);
    }
    return this.tokenEnVuelo;
  }

  async getIolTokenSinDedupe() {
    const storage = this.state.storage;
    const cached = await storage.get('token');
    if (cached && cached.access_token && cached.expires_at > Date.now()) return cached.access_token;
    // Tras un ingreso rechazado no se reintenta durante IOL_LOGIN_BACKOFF_MS: varios intentos fallidos
    // seguidos con la contraseña podrían bloquear la cuenta de IOL.
    const fallo = await storage.get('loginFail');
    if (fallo) {
      const resta = typeof fallo.at === 'number' ? IOL_LOGIN_BACKOFF_MS - (Date.now() - fallo.at) : 0;
      if (resta > 0) throw new Error(`IOL rechazó el último ingreso (HTTP ${fallo.status}). Para no bloquear tu cuenta, el próximo intento es en ${Math.ceil(resta / 60000)} min`);
    }
    const res = await fetch(IOL_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: this.env.IOL_USER, password: this.env.IOL_PASS, grant_type: 'password' }),
    });
    if (!res.ok) {
      await storage.put('loginFail', { at: Date.now(), status: res.status });
      throw new Error('login IOL falló (HTTP ' + res.status + ')');
    }
    await storage.delete('loginFail');
    const json = await res.json();
    if (!json.access_token) throw new Error('login IOL no devolvió access_token');
    await storage.put('token', { access_token: json.access_token, expires_at: Date.now() + IOL_TOKEN_TTL_MS });
    return json.access_token;
  }

  // ── /rendimiento/*: solo lectura de IOL (operaciones, estado de cuenta, serie histórica) + fuentes públicas ──
  // Pedidos idénticos simultáneos comparten una sola consulta (this.vuelos), igual que /cartera.
  async rendimiento(ruta, params) {
    const clave = ruta + '|' + JSON.stringify(params || {});
    let p = this.vuelos.get(clave);
    if (!p) {
      p = this.rendimientoUnico(ruta, params || {});
      this.vuelos.set(clave, p);
      const liberar = () => { if (this.vuelos.get(clave) === p) this.vuelos.delete(clave); };
      p.then(liberar, liberar);
    }
    return p;
  }

  async rendimientoUnico(ruta, params) {
    const ok = obj => ({ status: 200, body: JSON.stringify(obj) });
    const error = (status, code, message) => ({ status, body: JSON.stringify({ error: code, message }) });
    try {
      if (ruta === 'operaciones') return ok(await this.rndOperaciones(params.desde));
      if (ruta === 'cierres') return ok(await this.rndCierres(params.fecha, params.items));
      if (ruta === 'mercado') return ok(await this.rndMercado(params.desde));
      return error(404, 'not_found_route', 'Ruta de rendimiento inexistente.');
    } catch (e) {
      console.error('rendimiento error', ruta, e);
      return error(502, 'iol_unavailable', 'No se pudo completar la consulta: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // GET a la API de IOL con el token compartido. Si IOL lo rechaza (venció antes de lo previsto) se pide uno nuevo UNA vez.
  async iolGet(path) {
    const storage = this.state.storage;
    for (let intento = 0; intento < 2; intento++) {
      const token = await this.getIolToken();
      const res = await fetch(IOL_API + path, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 && intento === 0) { await storage.delete('token'); continue; }
      if (!res.ok) throw new Error('IOL respondió HTTP ' + res.status + ' en ' + path.split('?')[0]);
      return res.json();
    }
    throw new Error('IOL rechazó el token');
  }

  async cacheado(clave, ttlMs, fn) {
    const storage = this.state.storage;
    const hit = await storage.get(clave);
    if (hit && typeof hit.at === 'number' && Date.now() - hit.at < ttlMs) return hit.valor;
    const valor = await fn();
    await storage.put(clave, { at: Date.now(), valor });
    return valor;
  }

  // Operaciones terminadas desde `desde` + comisión de cada compra/venta (detalle por número, guardado para siempre) + efectivo.
  async rndOperaciones(desde) {
    const storage = this.state.storage;
    return this.cacheado('rnd:ops:' + desde, RND_OPS_TTL_MS, async () => {
      const hasta = sumarDias(hoyAr(), 1);
      const lista = await this.iolGet(`/operaciones?filtro.estado=terminadas&filtro.fechaDesde=${desde}&filtro.fechaHasta=${hasta}&filtro.pais=argentina`);
      const filas = Array.isArray(lista) ? lista : [];
      const operaciones = [];
      let pendientes = 0, detallesPedidos = 0;
      for (const o of filas) {
        const op = normalizarOperacion(o);
        if (!op) continue;
        if (op.tipo === 'compra' || op.tipo === 'venta') {
          let det = await storage.get('rnd:det:' + op.numero);
          if (!det && detallesPedidos < RND_MAX_DETALLES) {
            detallesPedidos++;
            try {
              det = extraerDetalle(await this.iolGet('/operaciones/' + encodeURIComponent(op.numero)));
              await storage.put('rnd:det:' + op.numero, det);
            } catch (e) { console.error('detalle operacion', op.numero, e && e.message); }
          }
          if (det) { op.comision = det.comision; if (det.moneda) op.moneda = det.moneda; } else pendientes++;
        }
        operaciones.push(op);
      }
      let efectivo = null;
      try { efectivo = transformarEstadoCuenta(await this.iolGet('/estadocuenta')); } catch (e) { console.error('estadocuenta', e && e.message); }
      return { desde, generado: new Date().toISOString(), operaciones, efectivo, comisionesPendientes: pendientes };
    });
  }

  // Cierre de cada símbolo en `fecha`. Un día ya cerrado no cambia: se guarda para siempre. El de hoy no se guarda (puede ser intradía).
  async rndCierres(fecha, items) {
    const storage = this.state.storage;
    const guardar = fecha < hoyAr();
    const cierres = {};
    let fallidos = 0;
    const cola = items.slice();
    const trabajar = async () => {
      while (cola.length) {
        const { simbolo, mercado } = cola.shift();
        const clave = `rnd:cierre:${fecha}:${mercado}:${simbolo}`;
        const hit = guardar ? await storage.get(clave) : undefined;
        if (hit !== undefined) { cierres[simbolo] = hit; continue; }
        try {
          const serie = await this.iolGet(`/${encodeURIComponent(mercado)}/Titulos/${encodeURIComponent(simbolo)}/Cotizacion/seriehistorica/${fecha}/${sumarDias(fecha, 1)}/sinAjustar`);
          const cierre = cierreDelDia(serie, fecha);
          cierres[simbolo] = cierre;
          if (guardar && cierre != null) await storage.put(clave, cierre);
        } catch (e) { fallidos++; cierres[simbolo] = null; console.error('cierre', simbolo, e && e.message); }
      }
    };
    await Promise.all([trabajar(), trabajar(), trabajar()]);
    return { fecha, generado: new Date().toISOString(), cierres, fallidos };
  }

  // MEP, SPY, IPC y CPI (todo público). Cada fuente falla por separado y se informa en `errores`; solo se guarda si todas anduvieron.
  async rndMercado(desde) {
    const storage = this.state.storage;
    const clave = 'rnd:mercado:' + desde;
    const hit = await storage.get(clave);
    if (hit && typeof hit.at === 'number' && Date.now() - hit.at < RND_MERCADO_TTL_MS) return hit.valor;
    const [mep, spy, ipc, cpi] = await Promise.allSettled([traerMep(desde), traerSpy(desde), traerIpc(desde), traerCpi(desde)]);
    const errores = {};
    const val = (r, nombre) => { if (r.status === 'fulfilled') return r.value; errores[nombre] = r.reason && r.reason.message ? r.reason.message : String(r.reason); return null; };
    const valor = { desde, generado: new Date().toISOString(), mep: val(mep, 'mep'), spy: val(spy, 'spy'), ipc: val(ipc, 'ipc'), cpi: val(cpi, 'cpi'), errores };
    if (!Object.keys(errores).length) await storage.put(clave, { at: Date.now(), valor });
    return valor;
  }

  // ── /radar/*: precios en vivo (Yahoo) y freno de pedidos al workflow de la SEC. Estado en el storage del DO (la Cache API no sirve en workers.dev). ──
  radar(ruta, params) {
    const clave = 'radar:' + ruta + '|' + JSON.stringify(params || {});
    let p = this.vuelos.get(clave);
    if (!p) {
      p = this.radarUnico(ruta, params || {});
      this.vuelos.set(clave, p);
      const liberar = () => { if (this.vuelos.get(clave) === p) this.vuelos.delete(clave); };
      p.then(liberar, liberar);
    }
    return p;
  }

  async radarUnico(ruta, params) {
    const ok = obj => ({ status: 200, body: JSON.stringify(obj) });
    const tickers = Array.isArray(params.tickers) ? params.tickers : [];
    try {
      if (ruta === 'precios') return ok(await this.radarPrecios(tickers));
      if (ruta === 'filtrar') { // cuáles se pueden pedir ya (no pedidos en los últimos 10 min)
        const nuevos = [], ya = [];
        for (const t of tickers) {
          const at = await this.state.storage.get('radar:pedido:' + t);
          if (typeof at === 'number' && Date.now() - at < RADAR_PEDIDO_TTL_MS) ya.push(t); else nuevos.push(t);
        }
        return ok({ nuevos, ya });
      }
      if (ruta === 'marcar') {
        for (const t of tickers) await this.state.storage.put('radar:pedido:' + t, Date.now());
        return ok({ marcados: tickers });
      }
      return { status: 404, body: JSON.stringify({ error: 'not_found_route', message: 'Ruta del radar inexistente.' }) };
    } catch (e) {
      console.error('radar error', ruta, e);
      return { status: 502, body: JSON.stringify({ error: 'radar_unavailable', message: 'No se pudo completar la consulta: ' + (e && e.message ? e.message : String(e)) }) };
    }
  }

  // Precio de cada ticker: guardado 60 s (los que Yahoo no conoce, 10 min). Cada uno falla por separado y se informa en `errores`.
  async radarPrecios(tickers) {
    const storage = this.state.storage;
    const precios = {}, errores = {};
    const cola = tickers.slice();
    const trabajar = async () => {
      while (cola.length) {
        const t = cola.shift();
        const clave = 'radar:px:' + t;
        const hit = await storage.get(clave);
        if (hit && typeof hit.at === 'number' && Date.now() - hit.at < (hit.nf ? RADAR_NF_TTL_MS : RADAR_PX_TTL_MS)) {
          if (hit.nf) { precios[t] = null; errores[t] = 'not_found'; } else precios[t] = hit.valor;
          continue;
        }
        try {
          const v = await traerPrecioYahoo(t);
          if (v === null) { await storage.put(clave, { at: Date.now(), nf: true }); precios[t] = null; errores[t] = 'not_found'; }
          else { await storage.put(clave, { at: Date.now(), valor: v }); precios[t] = v; }
        } catch (e) { precios[t] = null; errores[t] = 'unavailable'; console.error('precio', t, e && e.message); }
      }
    };
    await Promise.all([trabajar(), trabajar(), trabajar(), trabajar()]);
    return { generado: new Date().toISOString(), precios, errores };
  }
}

// ── Utilidades de /radar ──
const RADAR_TICKER_RE = /^[A-Z][A-Z0-9-]{0,9}$/;
const RADAR_MAX_PRECIOS = 30;  // un subrequest por ticker (el plan gratuito deja 50 por pedido)
const RADAR_MAX_PEDIR = 25;
const RADAR_PX_TTL_MS = 60 * 1000;
const RADAR_NF_TTL_MS = 10 * 60 * 1000;
const RADAR_PEDIDO_TTL_MS = 10 * 60 * 1000;
const RADAR_WORKFLOW = 'radar-fundamentals.yml';

// Último precio regular de un ticker en Yahoo Finance (sin API oficial: se prueban dos hosts). null = Yahoo no lo conoce.
async function traerPrecioYahoo(ticker) {
  let ultimoError = null;
  for (const host of ['query1', 'query2']) {
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; cdm-push-worker)' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status + ' en ' + host);
      const j = await res.json();
      const r = j && j.chart && j.chart.result && j.chart.result[0];
      if (!r) { if (j && j.chart && j.chart.error && /not found/i.test(String(j.chart.error.code))) return null; throw new Error('respuesta sin datos'); }
      const m = r.meta || {};
      const precio = numOrNull(m.regularMarketPrice);
      if (precio == null || precio <= 0) throw new Error('sin precio');
      return { precio, previo: numOrNull(m.chartPreviousClose) ?? numOrNull(m.previousClose), hora: numOrNull(m.regularMarketTime) != null ? Number(m.regularMarketTime) * 1000 : null, moneda: m.currency || null };
    } catch (e) { ultimoError = e; }
  }
  throw new Error('Yahoo Finance: ' + (ultimoError && ultimoError.message));
}

// ── Utilidades de /rendimiento ──
const IOL_API = 'https://api.invertironline.com/api/v2';
const RND_OPS_TTL_MS = 5 * 60 * 1000;
const RND_MERCADO_TTL_MS = 10 * 60 * 1000;
const RND_MAX_DETALLES = 25; // detalles de operación sin guardar que se piden por consulta (límite de subrequests del Worker)
const hoyAr = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // fecha en Argentina (UTC-3)
const sumarDias = (fecha, n) => new Date(Date.parse(fecha + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const numOrNull = v => (v == null || v === '' || isNaN(v)) ? null : Number(v);
const esUsd = s => /dolar|usd/i.test(String(s == null ? '' : s));

// Tipo de movimiento de IOL → 'compra' | 'venta' | 'dividendo' | 'renta' | 'amortizacion' | 'otro' (por el texto: la lista exacta de tipos no está verificada).
function clasificarOperacion(tipoCrudo) {
  const t = String(tipoCrudo == null ? '' : tipoCrudo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/dividendo/.test(t)) return 'dividendo';
  if (/amortiz|pago de rescate/.test(t)) return 'amortizacion';
  if (/renta|cupon/.test(t)) return 'renta';
  if (/venta|rescate/.test(t)) return 'venta';
  if (/compra|suscrip/.test(t)) return 'compra';
  return 'otro';
}

// Fila de /api/v2/operaciones → forma que consume rendimiento-calc.js. La comisión se completa después con el detalle.
function normalizarOperacion(o) {
  if (!o || o.numero == null) return null;
  const crudo = o.fechaOperada || o.fechaAprobada || o.fechaOrden || null;
  const fecha = crudo ? String(crudo).slice(0, 10) : null;
  if (!fecha) return null;
  const cant = numOrNull(o.cantidadOperada) ?? numOrNull(o.cantidad);
  const precio = numOrNull(o.precioOperado) ?? numOrNull(o.precio);
  return {
    numero: o.numero,
    fecha,
    fechaHora: String(crudo).length > 10 ? String(crudo) : null,
    tipo: clasificarOperacion(o.tipo),
    tipoCrudo: o.tipo ?? null,
    simbolo: o.simbolo ?? null,
    mercado: o.mercado ?? null,
    moneda: esUsd(o.moneda) ? 'USD' : 'ARS',
    cantidad: cant,
    precio,
    monto: numOrNull(o.montoOperado) ?? numOrNull(o.monto),
    comision: null,
  };
}

// Detalle de una operación: comisión = suma de aranceles (neto + IVA). Sin el campo `aranceles` la comisión queda en null (desconocida), nunca en 0.
function extraerDetalle(d) {
  const ar = d && Array.isArray(d.aranceles) ? d.aranceles : null;
  const comision = ar ? ar.reduce((a, x) => a + (numOrNull(x && x.neto) || 0) + (numOrNull(x && x.iva) || 0), 0) : null;
  return { comision, moneda: d && d.moneda ? (esUsd(d.moneda) ? 'USD' : 'ARS') : null };
}

// /api/v2/estadocuenta → efectivo por moneda. `saldo` incluye lo pendiente de liquidar; `disponible` es lo disponible hoy.
function transformarEstadoCuenta(d) {
  const cuentas = Array.isArray(d && d.cuentas) ? d.cuentas : [];
  const out = { ARS: { disponible: 0, saldo: 0 }, USD: { disponible: 0, saldo: 0 } };
  let hay = false;
  for (const c of cuentas) {
    if (!c) continue;
    const mon = esUsd(c.moneda) || esUsd(c.tipo) ? 'USD' : 'ARS';
    out[mon].disponible += numOrNull(c.disponible) || 0;
    out[mon].saldo += numOrNull(c.saldo) || 0;
    hay = true;
  }
  return hay ? out : null;
}

// Serie histórica de IOL → cierre (ultimoPrecio) de la barra de ese día, o null si no hay (feriado / aún sin cierre).
function cierreDelDia(serie, fecha) {
  const arr = Array.isArray(serie) ? serie : [];
  let r = null;
  for (const x of arr) if (x && String(x.fechaHora || '').slice(0, 10) === fecha) r = x;
  const v = r ? numOrNull(r.ultimoPrecio) : null;
  return v != null && v > 0 ? v : null;
}

async function pedirOk(url, headers) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; cdm-push-worker)', ...(headers || {}) } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' en ' + new URL(url).host);
  return res;
}

// Dólar MEP (venta) por día desde 7 días antes de `desde`, y el valor actual (dolarapi si es más nuevo que el último día publicado).
async function traerMep(desde) {
  const corte = sumarDias(desde, -7);
  const arr = await (await pedirOk('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa')).json();
  const serie = (Array.isArray(arr) ? arr : []).filter(r => r && r.fecha >= corte && numOrNull(r.venta) > 0).map(r => ({ fecha: r.fecha, venta: Number(r.venta) }));
  if (!serie.length) throw new Error('argentinadatos no devolvió MEP');
  let actual = serie[serie.length - 1];
  try {
    const d = await (await pedirOk('https://dolarapi.com/v1/dolares/bolsa')).json();
    const f = String(d && d.fechaActualizacion || '').slice(0, 10);
    if (f > actual.fecha && numOrNull(d.venta) > 0) actual = { fecha: f, venta: Number(d.venta) };
  } catch (_) { /* con el último día publicado alcanza */ }
  return { serie, actual };
}

// SPY diario (cierre y cierre ajustado por dividendos) desde Yahoo Finance. Sin API oficial: se prueban dos hosts.
async function traerSpy(desde) {
  const p1 = Math.floor(Date.parse(desde + 'T00:00:00Z') / 1000) - 12 * 86400;
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  let ultimoError = null;
  for (const host of ['query1', 'query2']) {
    try {
      const j = await (await pedirOk(`https://${host}.finance.yahoo.com/v8/finance/chart/SPY?period1=${p1}&period2=${p2}&interval=1d&includeAdjustedClose=true`)).json();
      const r = j && j.chart && j.chart.result && j.chart.result[0];
      if (!r || !Array.isArray(r.timestamp)) throw new Error('respuesta sin datos');
      const off = (r.meta && r.meta.gmtoffset) || 0;
      const close = r.indicators.quote[0].close;
      const adj = r.indicators.adjclose && r.indicators.adjclose[0] ? r.indicators.adjclose[0].adjclose : null;
      const out = [];
      r.timestamp.forEach((ts, i) => {
        const c = numOrNull(close[i]);
        if (c == null) return;
        out.push({ fecha: new Date((ts + off) * 1000).toISOString().slice(0, 10), close: c, adj: adj && numOrNull(adj[i]) != null ? Number(adj[i]) : c });
      });
      if (!out.length) throw new Error('serie vacía');
      return out;
    } catch (e) { ultimoError = e; }
  }
  throw new Error('Yahoo Finance: ' + (ultimoError && ultimoError.message));
}

// IPC mensual del INDEC (variación %) publicado hasta hoy, desde 2 meses antes de `desde`.
async function traerIpc(desde) {
  const corte = sumarDias(desde, -70).slice(0, 7);
  const arr = await (await pedirOk('https://api.argentinadatos.com/v1/finanzas/indices/inflacion')).json();
  return (Array.isArray(arr) ? arr : []).filter(r => r && String(r.fecha).slice(0, 7) >= corte && numOrNull(r.valor) != null).map(r => ({ mes: String(r.fecha).slice(0, 7), pct: Number(r.valor) }));
}

// CPI-U EE.UU. (todos los ítems, sin desestacionalizar, nivel mensual): FRED en CSV; si falla, la API pública del BLS.
async function traerCpi(desde) {
  const corte = sumarDias(desde, -70).slice(0, 7);
  try {
    const txt = await (await pedirOk(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS&cosd=${corte}-01`)).text();
    const out = [];
    for (const linea of txt.split('\n').slice(1)) {
      const [f, v] = linea.trim().split(',');
      if (f && numOrNull(v) != null) out.push({ mes: f.slice(0, 7), nivel: Number(v) });
    }
    if (!out.length) throw new Error('CSV vacío');
    return out;
  } catch (e) {
    const y = Number(corte.slice(0, 4));
    const j = await (await pedirOk(`https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0?startyear=${y}&endyear=${new Date().getUTCFullYear()}`)).json();
    const datos = j && j.Results && j.Results.series && j.Results.series[0] ? j.Results.series[0].data : [];
    const out = datos.filter(d => /^M(0[1-9]|1[0-2])$/.test(d.period) && numOrNull(d.value) != null)
      .map(d => ({ mes: d.year + '-' + d.period.slice(1), nivel: Number(d.value) })).filter(d => d.mes >= corte)
      .sort((a, b) => (a.mes < b.mes ? -1 : 1));
    if (!out.length) throw new Error('FRED y BLS sin datos de CPI');
    return out;
  }
}

// ── Verificación del ID token de Firebase Auth (RS256), sin librerías ──
// No hay `firebase-admin` disponible en el runtime de Workers, y agregar una
// dependencia (jose, jsonwebtoken, etc.) queda fuera del write set de este
// ticket (tocaría package.json/lock). Se verifica a mano con WebCrypto:
// bajar los certificados X.509 públicos de Google, extraer la clave pública
// RSA de cada uno (parseo DER mínimo, ver más abajo) e importarla con
// crypto.subtle para validar la firma con crypto.subtle.verify(). Cualquier
// estructura inesperada aborta (throw) — nunca se asume una forma "parecida".

function derReadLength(bytes, pos) {
  const first = bytes[pos];
  if ((first & 0x80) === 0) return { length: first, next: pos + 1 };
  const numBytes = first & 0x7f;
  if (numBytes === 0 || numBytes > 4) throw new Error('DER: longitud no soportada');
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = (length << 8) | bytes[pos + 1 + i];
  return { length, next: pos + 1 + numBytes };
}

function derReadTlv(bytes, pos) {
  const tag = bytes[pos];
  const { length, next } = derReadLength(bytes, pos + 1);
  const contentStart = next;
  const contentEnd = next + length;
  if (contentEnd > bytes.length) throw new Error('DER: longitud fuera de rango');
  return { tag, contentStart, contentEnd, end: contentEnd };
}

function derReadOid(bytes, start, end) {
  const out = [];
  let value = 0;
  let first = true;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    value = value * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) {
      if (first) { out.push(Math.floor(value / 40)); out.push(value % 40); first = false; }
      else out.push(value);
      value = 0;
    }
  }
  return out.join('.');
}

// Recorre el DER del certificado buscando la primera SEQUENCE cuyo primer
// hijo sea { SEQUENCE { OID(rsaEncryption), ... }, BIT STRING } — ese patrón
// identifica sin ambigüedad al SubjectPublicKeyInfo (SPKI) dentro de
// TBSCertificate, sin tener que modelar el resto de la estructura del
// certificado (versión opcional, extensiones variables, etc). Probado contra
// los 4 certificados reales que hoy sirve GOOGLE_CERTS_URL (ver reporte).
function encontrarSpki(bytes, pos, end) {
  while (pos < end) {
    const tlv = derReadTlv(bytes, pos);
    if (tlv.tag === 0x30) {
      try {
        const inner = derReadTlv(bytes, tlv.contentStart);
        if (inner.tag === 0x30) {
          const oidTlv = derReadTlv(bytes, inner.contentStart);
          if (oidTlv.tag === 0x06 && derReadOid(bytes, oidTlv.contentStart, oidTlv.contentEnd) === OID_RSA_ENCRYPTION) {
            return bytes.slice(pos, tlv.end);
          }
        }
      } catch (_) { /* esta SEQUENCE no es el patrón esperado, seguir buscando */ }
      const found = encontrarSpki(bytes, tlv.contentStart, tlv.contentEnd);
      if (found) return found;
    }
    pos = tlv.end;
  }
  return null;
}

function pemCertToBytes(pem) {
  const b64 = pem.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function spkiKeyFromCertPem(pem) {
  const certBytes = pemCertToBytes(pem);
  const spkiDer = encontrarSpki(certBytes, 0, certBytes.length);
  if (!spkiDer) throw new Error('no se pudo extraer la clave pública del certificado');
  return crypto.subtle.importKey('spki', spkiDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

function base64UrlToBytes(b64url) {
  let b64 = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlToJson(b64url) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(b64url)));
}

// Certificados de Google, cacheados respetando su propio Cache-Control (los
// rotan; cachear más tiempo del que ellos indican serviría un cert revocado).
// Ojo: la Cache API no funciona en *.workers.dev (match no devuelve nada), así que
// ahí los certificados se bajan en cada pedido. No es crítico: son públicos.
async function getGoogleCerts() {
  // La caché es solo una optimización (en workers.dev no guarda nada): si falla, se siguen bajando los certificados.
  let cache = null, cached = null;
  try { cache = caches.default; cached = await cache.match(CACHE_KEY_GOOGLE_CERTS); } catch (_) { cache = null; }
  if (cached) return cached.json();
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error('no se pudieron obtener las claves públicas de Google (HTTP ' + res.status + ')');
  const certs = await res.json();
  const cc = res.headers.get('Cache-Control') || '';
  const m = /max-age=(\d+)/.exec(cc);
  const maxAge = m ? Math.min(parseInt(m[1], 10), 24 * 3600) : 3600;
  if (cache) await Promise.resolve().then(() => cache.put(CACHE_KEY_GOOGLE_CERTS, new Response(JSON.stringify(certs), {
    headers: { 'content-type': 'application/json', 'cache-control': `max-age=${maxAge}` },
  }))).catch(() => {});
  return certs;
}

// Verifica un ID token de Firebase Auth de punta a punta: firma RS256 real
// (nunca solo decodificar), exp/iat, aud === project id, iss, y sub no vacío.
// Devuelve el uid (payload.sub) si todo es válido; si no, tira con el motivo.
async function verifyFirebaseIdToken(idToken, projectId) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('token con formato inválido');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = base64UrlToJson(headerB64);
  const payload = base64UrlToJson(payloadB64);

  if (header.alg !== 'RS256') throw new Error('alg no soportado: ' + header.alg);
  if (!header.kid) throw new Error('token sin kid');

  const certs = await getGoogleCerts();
  const certPem = certs[header.kid];
  if (!certPem) throw new Error('kid desconocido (claves de Google rotadas o token corrupto)');

  const key = await spkiKeyFromCertPem(certPem);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBytes(sigB64);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
  if (!valid) throw new Error('firma inválida');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('token vencido');
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) throw new Error('iat inválido');
  if (payload.aud !== projectId) throw new Error('aud inválido');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('iss inválido');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('sub vacío');

  return payload.sub;
}

// Mapa best-effort del campo `tipo` de IOL a los literales que ya usa
// data/cartera/tenencias.json. Sin acceso a la API real no está verificado —
// ver el reporte del ticket. Si no matchea nada, se deja el valor crudo de
// IOL tal cual (mejor un tipo "raro" y visible que inventar uno incorrecto).
const MAPA_TIPO = {
  CEDEARS: 'CEDEARS',
  ACCIONES: 'ACCIONES',
  TITULOSPUBLICOS: 'TIT. PUBLICOS',
  TITULOS_PUBLICOS: 'TIT. PUBLICOS',
  LETRAS: 'Letras',
  ON: 'ONS',
  OBLIGACIONNEGOCIABLE: 'ONS',
};

// Transforma la respuesta cruda de IOL a la forma de tenencias.json.
// Solo incluye lo que sale honesto de un snapshot puntual del portafolio:
// - variacionDiariaPct sí es derivable (IOL ya la da como variación vs. el
//   cierre anterior, mismo significado que el campo homónimo del JSON estático).
// - variacionPct (semanal), precioAnterior, ppcConfianza y lotes NO son
//   derivables de esta consulta (piden un histórico o el cálculo LIFO que
//   hace la rutina semanal) y se omiten a propósito — tenencias.js ya trata
//   cada uno de esos campos como opcional.
function transformarPortafolio(data) {
  const activos = Array.isArray(data && data.activos) ? data.activos : [];
  const tenencias = activos.map(a => {
    const t = a.titulo || {};
    const tipoCrudo = String(t.tipo ?? '').trim().toUpperCase().replace(/\s+/g, '');
    return {
      simbolo: t.simbolo ?? null,
      descripcion: t.descripcion ?? null,
      tipo: MAPA_TIPO[tipoCrudo] || t.tipo || null,
      cantidad: a.cantidad ?? null,
      comprometido: a.comprometido ?? 0,
      precio: a.ultimoPrecio ?? null,
      variacionDiariaPct: a.variacionDiaria ?? null,
      valorizado: a.valorizado ?? null,
      ppc: a.ppc ?? null,
      rendimientoPct: a.gananciaPorcentaje ?? null,
      rendimientoMonto: a.gananciaDinero ?? null,
    };
  });
  const valorizadoTotal = tenencias.reduce((acc, t) => acc + (Number(t.valorizado) || 0), 0);
  return {
    generado: new Date().toISOString(),
    tenencias,
    totales: { valorizado: valorizadoTotal, variacionPct: null },
  };
}

// Gate compartido por /cartera y /datos/: Bearer ID token de Firebase Auth verificado de verdad + uid === env.OWNER_UID.
// Devuelve null si el pedido es del dueño; si no, la Response de error que corresponde (401 / 403 / 500).
async function autorizarDueno(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const bearerMatch = /^Bearer (.+)$/.exec(authHeader);
  if (!bearerMatch) return jsonError(401, 'unauthorized', 'Falta el Authorization Bearer con el ID token de Firebase.');

  if (!env.OWNER_UID) {
    return jsonError(500, 'missing_owner_uid', 'El Worker no tiene configurado el secret OWNER_UID.');
  }
  let uid;
  try {
    uid = await verifyFirebaseIdToken(bearerMatch[1], FIREBASE_PROJECT_ID);
  } catch (e) {
    return jsonError(401, 'invalid_token', 'Token inválido: ' + (e && e.message ? e.message : String(e)));
  }
  if (uid !== env.OWNER_UID) return jsonError(403, 'forbidden', 'Este endpoint es privado.');
  return null;
}

// ── GET /datos/<archivo>.json — archivos de la cartera que viven en un repo PRIVADO de GitHub ──
// El repo del sitio es público: tenencias.json / latest.json / <YYYY-MM>.json no pueden estar ahí. Quedan en
// DATOS_REPO (repo privado) y el Worker los lee con un token de GitHub de solo lectura (secret GH_DATA_TOKEN) SOLO
// después de validar el mismo ID token que /cartera. La caché corta se consulta recién tras esa validación.
const DATOS_REPO_DEFAULT = 'Loustau45261470/centro-de-mando-datos';
const DATOS_ARCHIVO_RE = /^[A-Za-z0-9_-]+\.json$/;
const DATOS_CACHE_TTL_S = 300; // 5 min
const datosCacheKey = archivo => new Request('https://cdm-datos-cache.internal/datos/' + archivo);

function datosOk(body) {
  return new Response(body, {
    status: 200,
    headers: { ...CARTERA_CORS_HEADERS, 'content-type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

async function handleDatos(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CARTERA_CORS_HEADERS });
  if (request.method !== 'GET') return jsonError(405, 'method_not_allowed', 'Este endpoint solo acepta GET.');

  const denegado = await autorizarDueno(request, env);
  if (denegado) return denegado;

  const archivo = new URL(request.url).pathname.slice('/datos/'.length);
  if (!DATOS_ARCHIVO_RE.test(archivo)) return jsonError(400, 'bad_file', 'Nombre de archivo inválido.');

  if (!env.GH_DATA_TOKEN) return jsonError(500, 'missing_gh_token', 'El Worker no tiene configurado el secret GH_DATA_TOKEN.');

  // Autorizado: recién ahora se mira la caché. En *.workers.dev la Cache API no guarda nada (ver getGoogleCerts): es solo una optimización.
  let cache = null;
  try {
    cache = caches.default;
    const hit = await cache.match(datosCacheKey(archivo));
    if (hit) return datosOk(await hit.text());
  } catch (_) { /* sin caché: se sigue contra GitHub */ }

  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${env.DATOS_REPO || DATOS_REPO_DEFAULT}/contents/${archivo}`, {
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${env.GH_DATA_TOKEN}`,
        'User-Agent': 'cdm-push-worker',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (e) {
    console.error('datos fetch error', e);
    return jsonError(502, 'github_unavailable', 'No se pudo consultar GitHub.');
  }
  if (res.status === 404) return jsonError(404, 'not_found', 'Ese archivo no existe.');
  if (!res.ok) {
    console.error('datos github HTTP', res.status);
    return jsonError(502, 'github_error', 'GitHub respondió HTTP ' + res.status + ' (¿token vencido o sin acceso al repo?).');
  }
  const body = await res.text();
  if (cache) {
    try {
      await cache.put(datosCacheKey(archivo), new Response(body, {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${DATOS_CACHE_TTL_S}` },
      }));
    } catch (_) { /* la caché es opcional */ }
  }
  return datosOk(body);
}

async function handleCartera(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CARTERA_CORS_HEADERS });
  if (request.method !== 'GET') return jsonError(405, 'method_not_allowed', 'Este endpoint solo acepta GET.');

  const denegado = await autorizarDueno(request, env);
  if (denegado) return denegado;

  if (!env.IOL_USER || !env.IOL_PASS) {
    return jsonError(500, 'missing_credentials', 'El Worker no tiene configuradas las credenciales de IOL (secrets IOL_USER / IOL_PASS).');
  }

  // Autorizado: el resto (caché, frenos, login a IOL) lo decide CarteraGate. Solo se le pasa `fresh`.
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  try {
    const gate = env.CARTERA.get(env.CARTERA.idFromName('cartera'));
    const res = await gate.fetch('https://do/consultar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fresh }),
    });
    const h = new Headers(res.headers);
    Object.entries(CARTERA_CORS_HEADERS).forEach(([k, v]) => h.set(k, v));
    return new Response(res.body, { status: res.status, headers: h });
  } catch (e) {
    console.error('cartera gate error', e);
    return jsonError(502, 'iol_unavailable', 'No se pudo obtener la cartera desde IOL: ' + (e && e.message ? e.message : String(e)));
  }
}

// ── GET /rendimiento/{operaciones,cierres,mercado} — datos para la pestaña "Rendimiento" de Cartera ──
// Mismo gate que /cartera (ID token de Firebase + OWNER_UID). Solo lectura: jamás se envía una orden a IOL.
// Los parámetros se validan ACÁ (formato estricto) antes de armar cualquier URL hacia IOL o hacia las fuentes públicas.
const RND_FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const RND_SIMBOLO_RE = /^[A-Za-z0-9._-]{1,15}$/;
const RND_MERCADO_RE = /^[A-Za-z_]{2,20}$/;
const RND_MAX_SIMBOLOS = 30;

async function handleRendimiento(request, env, ruta) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CARTERA_CORS_HEADERS });
  if (request.method !== 'GET') return jsonError(405, 'method_not_allowed', 'Este endpoint solo acepta GET.');

  const denegado = await autorizarDueno(request, env);
  if (denegado) return denegado;

  const q = new URL(request.url).searchParams;
  const fechaOk = f => RND_FECHA_RE.test(f || '') && !isNaN(Date.parse(f + 'T00:00:00Z')) && f >= '2020-01-01' && f <= sumarDias(hoyAr(), 1);
  let params;
  if (ruta === 'operaciones' || ruta === 'mercado') {
    const desde = q.get('desde');
    if (!fechaOk(desde)) return jsonError(400, 'bad_param', 'Falta el parámetro desde (YYYY-MM-DD) o no es válido.');
    params = { desde };
  } else if (ruta === 'cierres') {
    const fecha = q.get('fecha');
    if (!fechaOk(fecha)) return jsonError(400, 'bad_param', 'Falta el parámetro fecha (YYYY-MM-DD) o no es válido.');
    const items = [];
    for (const par of String(q.get('s') || '').split(',').filter(Boolean)) {
      const [simbolo, mercado] = par.split(':');
      if (!RND_SIMBOLO_RE.test(simbolo || '') || !RND_MERCADO_RE.test(mercado || '')) return jsonError(400, 'bad_param', 'Símbolo o mercado inválido en s.');
      items.push({ simbolo, mercado });
    }
    if (!items.length || items.length > RND_MAX_SIMBOLOS) return jsonError(400, 'bad_param', `s debe traer entre 1 y ${RND_MAX_SIMBOLOS} símbolos (SIM:MERCADO).`);
    params = { fecha, items };
  } else {
    return jsonError(404, 'not_found_route', 'Ruta de rendimiento inexistente.');
  }

  if (ruta !== 'mercado' && (!env.IOL_USER || !env.IOL_PASS)) {
    return jsonError(500, 'missing_credentials', 'El Worker no tiene configuradas las credenciales de IOL (secrets IOL_USER / IOL_PASS).');
  }
  try {
    const gate = env.CARTERA.get(env.CARTERA.idFromName('cartera'));
    const res = await gate.fetch('https://do/rendimiento/' + ruta, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    const h = new Headers(res.headers);
    Object.entries(CARTERA_CORS_HEADERS).forEach(([k, v]) => h.set(k, v));
    h.set('Cache-Control', 'private, no-store');
    return new Response(res.body, { status: res.status, headers: h });
  } catch (e) {
    console.error('rendimiento gate error', e);
    return jsonError(502, 'iol_unavailable', 'No se pudo completar la consulta: ' + (e && e.message ? e.message : String(e)));
  }
}

// ── /radar/{precios,pedir} — Radar de empresas (pestaña Radar de Cartera) ──
// Mismo gate que /cartera (ID token de Firebase + OWNER_UID). El cálculo de fundamentals NO corre acá (companyfacts pesa varios MB y el
// plan gratuito de Workers da 10 ms de CPU por pedido): lo hace un workflow de GitHub Actions del repo privado, que este Worker solo
// dispara (workflow_dispatch, sin escribir archivos) y el cliente lee después con GET /datos/fund-<TICKER>.json.
const RADAR_CORS_HEADERS = { ...CARTERA_CORS_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type' };
function radarJson(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { ...RADAR_CORS_HEADERS, 'content-type': 'application/json', 'Cache-Control': 'private, no-store' } });
}
const radarError = (status, code, message) => radarJson(status, { error: code, message });
function radarTickers(lista, max) {
  const out = [];
  for (const x of lista) {
    const t = String(x == null ? '' : x).trim().toUpperCase();
    if (!RADAR_TICKER_RE.test(t)) return null;
    if (!out.includes(t)) out.push(t);
  }
  return out.length >= 1 && out.length <= max ? out : null;
}

async function handleRadar(request, env, ruta) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: RADAR_CORS_HEADERS });
  const esperado = ruta === 'precios' ? 'GET' : ruta === 'pedir' ? 'POST' : null;
  if (!esperado) return radarError(404, 'not_found_route', 'Ruta del radar inexistente.');
  if (request.method !== esperado) return radarError(405, 'method_not_allowed', 'Este endpoint solo acepta ' + esperado + '.');

  const denegado = await autorizarDueno(request, env);
  if (denegado) return denegado;

  const viaGate = async (r, params) => {
    const gate = env.CARTERA.get(env.CARTERA.idFromName('cartera'));
    const res = await gate.fetch('https://do/radar/' + r, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  if (ruta === 'precios') {
    const tickers = radarTickers(String(new URL(request.url).searchParams.get('t') || '').split(',').filter(Boolean), RADAR_MAX_PRECIOS);
    if (!tickers) return radarError(400, 'bad_param', 'El parámetro t debe traer entre 1 y ' + RADAR_MAX_PRECIOS + ' tickers válidos separados por coma.');
    try {
      const r = await viaGate('precios', { tickers });
      return radarJson(r.status, r.json || { error: 'radar_unavailable', message: 'Respuesta vacía.' });
    } catch (e) {
      console.error('radar precios gate error', e);
      return radarError(502, 'radar_unavailable', 'No se pudieron consultar los precios.');
    }
  }

  // POST /radar/pedir
  const body = await request.json().catch(() => null);
  const tickers = body && Array.isArray(body.tickers) ? radarTickers(body.tickers, RADAR_MAX_PEDIR) : null;
  if (!tickers) return radarError(400, 'bad_param', 'El body debe ser { tickers: [...] } con entre 1 y ' + RADAR_MAX_PEDIR + ' tickers válidos.');
  if (!env.GH_DATA_TOKEN) return radarError(500, 'missing_gh_token', 'El Worker no tiene configurado el secret GH_DATA_TOKEN.');
  const repo = env.DATOS_REPO || DATOS_REPO_DEFAULT;
  const gh = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GH_DATA_TOKEN}`, 'User-Agent': 'cdm-push-worker', 'X-GitHub-Api-Version': '2022-11-28' };
  try {
    const f = await viaGate('filtrar', { tickers });
    const nuevos = (f.json && f.json.nuevos) || [], ya = (f.json && f.json.ya) || [];
    if (!nuevos.length) return radarJson(200, { pedidos: [], yaPedidos: ya });
    // Rama por defecto del repo de datos (si GitHub no la informa, main).
    let ref = env.DATOS_REF || 'main';
    if (!env.DATOS_REF) {
      try { const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: gh }); if (r.ok) { const j = await r.json(); if (j && j.default_branch) ref = j.default_branch; } } catch (_) { /* queda main */ }
    }
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${RADAR_WORKFLOW}/dispatches`, {
      method: 'POST', headers: { ...gh, 'content-type': 'application/json' }, body: JSON.stringify({ ref, inputs: { tickers: nuevos.join(',') } }),
    });
    if (res.status === 401) return radarError(502, 'github_token', 'GitHub rechazó el token (¿venció?).');
    if (res.status === 403 || res.status === 404) return radarError(502, 'github_permiso', 'GitHub no dejó lanzar la actualización: el token necesita el permiso «Actions: Read and write» sobre el repo de datos, y el archivo ' + RADAR_WORKFLOW + ' tiene que estar subido a ese repo.');
    if (!res.ok) return radarError(502, 'github_error', 'GitHub respondió HTTP ' + res.status + ' al lanzar la actualización (¿rama «' + ref + '» o archivo ' + RADAR_WORKFLOW + ' inexistentes?).');
    await viaGate('marcar', { tickers: nuevos });
    return radarJson(200, { pedidos: nuevos, yaPedidos: ya });
  } catch (e) {
    console.error('radar pedir error', e);
    return radarError(502, 'github_unavailable', 'No se pudo consultar GitHub.');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/cartera') return handleCartera(request, env);
    if (url.pathname.startsWith('/rendimiento/')) return handleRendimiento(request, env, url.pathname.slice('/rendimiento/'.length));
    if (url.pathname.startsWith('/radar/')) return handleRadar(request, env, url.pathname.slice('/radar/'.length));
    if (url.pathname.startsWith('/datos/')) return handleDatos(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.WORKER_SECRET}`) {
      return withCors(new Response('unauthorized', { status: 401 }));
    }
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
