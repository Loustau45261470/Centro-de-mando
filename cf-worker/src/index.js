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
  'Vary': 'Origin',
};
const IOL_TOKEN_URL = 'https://api.invertironline.com/token';
const IOL_PORTAFOLIO_URL = 'https://api.invertironline.com/api/v2/portafolio/argentina';
const CARTERA_CACHE_TTL_SECONDS = 900; // 15 min — no golpear la API de IOL en cada carga
const IOL_TOKEN_TTL_SECONDS = 840; // el access_token de IOL dura ~15 min; 14 de margen
// Requests sintéticas usadas solo como clave de la Cache API del Worker (no salen a la red).
const CACHE_KEY_PORTAFOLIO = new Request('https://cdm-cartera-cache.internal/portafolio');
const CACHE_KEY_TOKEN = new Request('https://cdm-cartera-cache.internal/token');

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { ...CARTERA_CORS_HEADERS, 'content-type': 'application/json' },
  });
}

async function getIolToken(env) {
  const cache = caches.default;
  const cached = await cache.match(CACHE_KEY_TOKEN);
  if (cached) {
    const { access_token, expires_at } = await cached.json();
    if (access_token && expires_at > Date.now()) return access_token;
  }
  const res = await fetch(IOL_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: env.IOL_USER, password: env.IOL_PASS, grant_type: 'password' }),
  });
  if (!res.ok) throw new Error('login IOL falló (HTTP ' + res.status + ')');
  const json = await res.json();
  if (!json.access_token) throw new Error('login IOL no devolvió access_token');
  await cache.put(CACHE_KEY_TOKEN, new Response(JSON.stringify({
    access_token: json.access_token,
    expires_at: Date.now() + IOL_TOKEN_TTL_SECONDS * 1000,
  }), { headers: { 'content-type': 'application/json' } }));
  return json.access_token;
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
async function getGoogleCerts() {
  const cache = caches.default;
  const cached = await cache.match(CACHE_KEY_GOOGLE_CERTS);
  if (cached) return cached.json();
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error('no se pudieron obtener las claves públicas de Google (HTTP ' + res.status + ')');
  const certs = await res.json();
  const cc = res.headers.get('Cache-Control') || '';
  const m = /max-age=(\d+)/.exec(cc);
  const maxAge = m ? Math.min(parseInt(m[1], 10), 24 * 3600) : 3600;
  await cache.put(CACHE_KEY_GOOGLE_CERTS, new Response(JSON.stringify(certs), {
    headers: { 'content-type': 'application/json', 'cache-control': `max-age=${maxAge}` },
  }));
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

async function handleCartera(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CARTERA_CORS_HEADERS });
  if (request.method !== 'GET') return jsonError(405, 'method_not_allowed', 'Este endpoint solo acepta GET.');

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

  if (!env.IOL_USER || !env.IOL_PASS) {
    return jsonError(500, 'missing_credentials', 'El Worker no tiene configuradas las credenciales de IOL (secrets IOL_USER / IOL_PASS).');
  }

  const cache = caches.default;
  const cached = await cache.match(CACHE_KEY_PORTAFOLIO);
  if (cached) return new Response(cached.body, { status: 200, headers: { ...CARTERA_CORS_HEADERS, 'content-type': 'application/json' } });

  try {
    const token = await getIolToken(env);
    const res = await fetch(IOL_PORTAFOLIO_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('portafolio IOL falló (HTTP ' + res.status + ')');
    const raw = await res.json();
    const body = JSON.stringify(transformarPortafolio(raw));

    await cache.put(CACHE_KEY_PORTAFOLIO, new Response(body, {
      headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CARTERA_CACHE_TTL_SECONDS}` },
    }));
    return new Response(body, { status: 200, headers: { ...CARTERA_CORS_HEADERS, 'content-type': 'application/json' } });
  } catch (e) {
    console.error('cartera error', e);
    return jsonError(502, 'iol_unavailable', 'No se pudo obtener la cartera desde IOL: ' + (e && e.message ? e.message : String(e)));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/cartera') return handleCartera(request, env);

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
