// Archivos privados de la cartera: cliente CMDatos (datos-privados.js), ruta GET /datos/<archivo> del Worker
// (cf-worker/src/index.js) y regla del Service Worker (sw.js). Todo inventado y mockeado: nunca se toca GitHub,
// Firebase, IOL ni los datos reales.
//   - Cliente: Playwright con la app real y el Worker mockeado por page.route.
//   - Worker y Service Worker: sin navegador. Se evalúa el texto del archivo en Node con fetch / caches / self falsos
//     (mismo método que worker-cartera.spec.js; cf-worker/ tiene su propio node_modules, que no está en el CI).
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/fixtures');

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' };
const WORKER_DATOS = '**/cdm-push-worker.tobiasloustau11.workers.dev/datos/prueba.json';
const PUBLICO = '**/data/cartera/prueba.json';
const VIVO = { fuente: 'worker', valor: 1 };
const ESTATICO = { fuente: 'publico', valor: 2 };

// ───────────────────────── Cliente (navegador) ─────────────────────────
test.describe('CMDatos.cartera (cliente)', () => {
  // Mockea Worker y copia pública; devuelve lo que vio cada uno.
  async function armar(page, { worker, sesion = true }) {
    const visto = { worker: [], publico: 0 };
    await page.route(WORKER_DATOS, (r) => {
      const req = r.request();
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      visto.worker.push(req.headers().authorization);
      return worker(r);
    });
    await page.route(PUBLICO, (r) => {
      visto.publico++;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ESTATICO) });
    });
    if (sesion) await page.evaluate(() => { _auth.currentUser.getIdToken = async () => 'id-token-fresco'; });
    return visto;
  }
  const ok = (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(VIVO) });
  const pedir = (page, nombre = 'prueba.json') => page.evaluate((n) => CMDatos.cartera(n), nombre);

  test('usa el Worker con Authorization Bearer <ID token> y no toca la copia pública', async ({ cmPage: page }) => {
    const visto = await armar(page, { worker: ok });
    expect(await pedir(page)).toEqual(VIVO);
    expect(visto.worker).toEqual(['Bearer id-token-fresco']);
    expect(visto.publico).toBe(0);
  });

  test('pide un ID token fresco en cada llamada', async ({ cmPage: page }) => {
    const visto = await armar(page, { worker: ok });
    await page.evaluate(() => { let n = 0; _auth.currentUser.getIdToken = async () => 'tok-' + (++n); });
    await pedir(page); await pedir(page);
    expect(visto.worker).toEqual(['Bearer tok-1', 'Bearer tok-2']);
  });

  const TRANSITORIOS = [
    ['Worker viejo sin la ruta (401 unauthorized de texto)', (r) => r.fulfill({ status: 401, contentType: 'text/plain', headers: CORS, body: 'unauthorized' })],
    ['Worker viejo sin la ruta (404 de texto)', (r) => r.fulfill({ status: 404, contentType: 'text/plain', headers: CORS, body: 'not found' })],
    ['401 invalid_token', (r) => r.fulfill({ status: 401, contentType: 'application/json', headers: CORS, body: '{"error":"invalid_token"}' })],
    ['500 missing_gh_token', (r) => r.fulfill({ status: 500, contentType: 'application/json', headers: CORS, body: '{"error":"missing_gh_token"}' })],
    ['502 github_error', (r) => r.fulfill({ status: 502, contentType: 'application/json', headers: CORS, body: '{"error":"github_error"}' })],
    ['falla de red', (r) => r.abort('failed')],
  ];
  for (const [nombre, worker] of TRANSITORIOS) {
    test(`cae a la copia pública (transitorio): ${nombre}`, async ({ cmPage: page }) => {
      const visto = await armar(page, { worker });
      expect(await pedir(page)).toEqual(ESTATICO);
      expect(visto.publico).toBe(1);
    });
  }

  test('sin getIdToken (sin sesión usable) cae a la copia pública sin pegarle al Worker', async ({ cmPage: page }) => {
    const visto = await armar(page, { worker: ok, sesion: false });
    expect(await pedir(page)).toEqual(ESTATICO);
    expect(visto.worker).toEqual([]);
  });

  test('403 forbidden (usuario equivocado): null y NO cae a la copia pública', async ({ cmPage: page }) => {
    const visto = await armar(page, { worker: (r) => r.fulfill({ status: 403, contentType: 'application/json', headers: CORS, body: '{"error":"forbidden"}' }) });
    expect(await pedir(page)).toBeNull();
    expect(visto.publico).toBe(0);
    expect(await page.evaluate(() => CMDatos.carteraDetalle('prueba.json'))).toEqual({ data: null, status: 403 });
  });

  test('404 not_found (el archivo no existe en el repo privado): null, status 404 y NO cae a la copia pública', async ({ cmPage: page }) => {
    const visto = await armar(page, { worker: (r) => r.fulfill({ status: 404, contentType: 'application/json', headers: CORS, body: '{"error":"not_found"}' }) });
    expect(await page.evaluate(() => CMDatos.carteraDetalle('prueba.json'))).toEqual({ data: null, status: 404 });
    expect(visto.publico).toBe(0);
  });

  test('nombre inválido: null sin ningún pedido', async ({ cmPage: page }) => {
    const visto = await armar(page, { worker: ok });
    for (const n of ['../x.json', 'a/b.json', 'x.txt', '', 'x.json?y=1']) expect(await pedir(page, n)).toBeNull();
    expect(visto.worker).toEqual([]);
    expect(visto.publico).toBe(0);
  });
});

// ───────────────────────── Worker: GET /datos/<archivo> (Node) ─────────────────────────
const SRC = fs.readFileSync(path.join(__dirname, '..', 'cf-worker', 'src', 'index.js'), 'utf8');
const ORIGEN = 'https://cdm-push-worker.test';
const OWNER = 'owner-uid';
const CONTENIDO = '{"tenencias":[{"simbolo":"TESTA"}],"nota":"tal cual"}';

function armarWorker({ envExtra = {}, conCache = true } = {}) {
  let src = SRC
    .replace(/^import .*$/m, "const buildPushPayload = () => { throw new Error('no se usa en /datos'); };")
    .replace('export class TimerAlarm', 'class TimerAlarm')
    .replace('export class CarteraGate', 'class CarteraGate')
    .replace('export default', 'const __worker =')
    .replace('async function verifyFirebaseIdToken(', 'async function __verifyOriginal(');
  expect(src).toContain('const __worker =');
  expect(src).toContain('async function __verifyOriginal(');
  src += `
async function verifyFirebaseIdToken(token) {
  if (token === 'tok-owner') return '${OWNER}';
  if (token === 'tok-otro') return 'otro-uid';
  throw new Error('firma inválida');
}
return __worker;`;

  const cuenta = { cacheMatch: 0, cachePut: 0, github: [] };
  const almacen = new Map();
  const cacheDefault = {
    async match(req) { cuenta.cacheMatch++; return almacen.has(req.url) ? new Response(almacen.get(req.url)) : undefined; },
    async put(req, res) { cuenta.cachePut++; almacen.set(req.url, await res.text()); },
  };
  const caches = conCache ? { default: cacheDefault } : { get default() { throw new Error('sin Cache API'); } };
  const github = { status: 200, body: CONTENIDO };
  const fetchFalso = async (url, init) => {
    if (!String(url).startsWith('https://api.github.com/')) throw new Error('fetch inesperado: ' + url);
    cuenta.github.push({ url: String(url), headers: init && init.headers });
    return new Response(github.status === 200 ? github.body : '{"message":"x"}', { status: github.status });
  };
  const worker = new Function('caches', 'fetch', 'console', src)(caches, fetchFalso, { error() {}, warn() {}, log() {} });
  const env = { OWNER_UID: OWNER, GH_DATA_TOKEN: 'gh-token-de-prueba', DATOS_REPO: 'dueno/repo-privado', ...envExtra };
  const pedir = (archivo = 'tenencias.json', tok = 'tok-owner', metodo = 'GET') => worker.fetch(
    new Request(`${ORIGEN}/datos/${archivo}`, { method: metodo, headers: tok ? { Authorization: `Bearer ${tok}` } : {} }), env);
  return { pedir, cuenta, github, env };
}

test.describe('Worker GET /datos/<archivo>', () => {
  test('sin token: 401 y no toca ni la caché ni GitHub', async () => {
    const w = armarWorker();
    const r = await w.pedir('tenencias.json', null);
    expect(r.status).toBe(401);
    expect(w.cuenta).toMatchObject({ cacheMatch: 0, cachePut: 0, github: [] });
  });

  test('token inválido: 401 y no toca la caché ni GitHub', async () => {
    const w = armarWorker();
    const r = await w.pedir('tenencias.json', 'tok-basura');
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('invalid_token');
    expect(w.cuenta).toMatchObject({ cacheMatch: 0, github: [] });
  });

  test('uid ajeno: 403 y no toca la caché ni GitHub (aunque el archivo ya esté cacheado)', async () => {
    const w = armarWorker();
    expect((await w.pedir()).status).toBe(200); // el dueño lo deja en la caché
    const antes = { ...w.cuenta, github: w.cuenta.github.length };
    const r = await w.pedir('tenencias.json', 'tok-otro');
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe('forbidden');
    expect(w.cuenta.cacheMatch).toBe(antes.cacheMatch);
    expect(w.cuenta.github.length).toBe(antes.github);
  });

  test('archivo inválido: 400 (sin subcarpetas, sin traversal, solo .json)', async () => {
    const w = armarWorker();
    for (const a of ['tenencias.txt', 'a/b.json', '.json', '..%2Fx.json', '%2e%2e%2fx.json', 'x.json%00', 'x y.json', 'x.json/', 'x.JSONN', '']) {
      const r = await w.pedir(a);
      expect(r.status, a).toBe(400);
      expect((await r.json()).error).toBe('bad_file');
    }
    expect(w.cuenta.github).toEqual([]);
  });

  test('falta GH_DATA_TOKEN: 500 missing_gh_token', async () => {
    const w = armarWorker({ envExtra: { GH_DATA_TOKEN: undefined } });
    const r = await w.pedir();
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe('missing_gh_token');
    expect(w.cuenta.github).toEqual([]);
  });

  test('ok: 200 con el JSON tal cual, Cache-Control private no-store, CORS y pedido a GitHub con el token y Accept raw', async () => {
    const w = armarWorker();
    const r = await w.pedir('2026-11.json');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(CONTENIDO);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(r.headers.get('access-control-allow-origin')).toBe('https://loustau45261470.github.io');
    expect(w.cuenta.github).toHaveLength(1);
    const g = w.cuenta.github[0];
    expect(g.url).toBe('https://api.github.com/repos/dueno/repo-privado/contents/2026-11.json');
    expect(g.headers.Authorization).toBe('Bearer gh-token-de-prueba');
    expect(g.headers.Accept).toBe('application/vnd.github.raw');
    expect(g.headers['User-Agent']).toBeTruthy();
  });

  test('sin DATOS_REPO en el entorno usa el repo privado por defecto', async () => {
    const w = armarWorker({ envExtra: { DATOS_REPO: undefined } });
    await w.pedir('latest.json');
    expect(w.cuenta.github[0].url).toBe('https://api.github.com/repos/Loustau45261470/centro-de-mando-datos/contents/latest.json');
  });

  test('segundo pedido del dueño sale de la caché (una sola consulta a GitHub), también con Cache-Control private', async () => {
    const w = armarWorker();
    await w.pedir();
    const r = await w.pedir();
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(CONTENIDO);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(w.cuenta.github).toHaveLength(1);
    // la clave incluye el archivo: otro archivo no sale de la caché del primero
    await w.pedir('latest.json');
    expect(w.cuenta.github).toHaveLength(2);
  });

  test('sin Cache API (workers.dev): igual funciona, cada pedido va a GitHub', async () => {
    const w = armarWorker({ conCache: false });
    expect((await w.pedir()).status).toBe(200);
    expect((await w.pedir()).status).toBe(200);
    expect(w.cuenta.github).toHaveLength(2);
  });

  test('GitHub 404: 404 not_found; GitHub 401/500: 502 github_error (sin filtrar el cuerpo de GitHub) y nada queda en la caché', async () => {
    const w = armarWorker();
    w.github.status = 404;
    const r404 = await w.pedir();
    expect(r404.status).toBe(404);
    expect((await r404.json()).error).toBe('not_found');
    for (const s of [401, 500]) {
      w.github.status = s;
      const r = await w.pedir();
      expect(r.status).toBe(502);
      const j = await r.json();
      expect(j.error).toBe('github_error');
      expect(JSON.stringify(j)).not.toContain('gh-token-de-prueba');
    }
    expect(w.cuenta.cachePut).toBe(0);
  });

  test('OPTIONS devuelve 204 con CORS sin autenticar y otro método devuelve 405', async () => {
    const w = armarWorker();
    const o = await w.pedir('tenencias.json', null, 'OPTIONS');
    expect(o.status).toBe(204);
    expect(o.headers.get('access-control-allow-headers')).toBe('authorization');
    const p = await w.pedir('tenencias.json', 'tok-owner', 'POST');
    expect(p.status).toBe(405);
  });
});

// ───────────────────────── Service Worker: /datos/ no se guarda (Node) ─────────────────────────
test.describe('sw.js: respuestas de /datos/', () => {
  function cargarSw() {
    const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const oyentes = {};
    const llamadas = { caches: [], fetch: [] };
    const self = {
      location: { origin: 'https://loustau45261470.github.io' },
      skipWaiting() {}, clients: { claim() {} },
      addEventListener(tipo, fn) { oyentes[tipo] = fn; },
    };
    const caches = {
      open: async (...a) => { llamadas.caches.push(['open', ...a]); return { put: async () => {}, add: async () => {} }; },
      match: async (...a) => { llamadas.caches.push(['match', ...a]); return undefined; },
      keys: async () => [], delete: async () => true,
    };
    new Function('self', 'caches', 'fetch', SW)(self, caches, async (...a) => { llamadas.fetch.push(a); return new Response('{}'); });
    const disparar = (url) => {
      let respondio = false;
      oyentes.fetch({ request: { method: 'GET', url, mode: 'cors' }, respondWith() { respondio = true; } });
      return respondio;
    };
    return { disparar, llamadas };
  }

  test('el SW no intercepta ni guarda nada de /datos/ (network-only)', async () => {
    const sw = cargarSw();
    expect(sw.disparar('https://cdm-push-worker.tobiasloustau11.workers.dev/datos/tenencias.json')).toBe(false);
    expect(sw.disparar('https://cdm-push-worker.tobiasloustau11.workers.dev/datos/2026-11.json')).toBe(false);
    expect(sw.llamadas.caches).toEqual([]);
    expect(sw.llamadas.fetch).toEqual([]);
  });

  test('la regla transitoria de la copia pública sigue activa mientras dure la transición', async () => {
    const sw = cargarSw();
    expect(sw.disparar('https://loustau45261470.github.io/Centro-de-mando/data/cartera/tenencias.json')).toBe(true);
  });

  test('datos-privados.js está en el shell del SW y en index.html antes de sus consumidores', async () => {
    const swTxt = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    expect(swTxt).toContain("BASE + 'datos-privados.js'");
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const pos = (s) => html.indexOf(`<script src="${s}`);
    const dp = pos('datos-privados.js');
    expect(dp).toBeGreaterThan(-1);
    for (const consumidor of ['jarvis-brain.js', 'cartera-inversion.js', 'tenencias.js', 'sgc.js', 'informes-datos.js']) {
      expect(pos(consumidor), consumidor).toBeGreaterThan(dp);
    }
  });
});
