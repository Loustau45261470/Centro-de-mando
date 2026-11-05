// Rutas /radar/precios y /radar/pedir del Worker (cf-worker/src/index.js). Mismo método que worker-rendimiento.spec.js: el código del
// Worker se evalúa en Node con fetch falso, storage en memoria para el Durable Object CarteraGate y un env.CARTERA falso. La verificación
// del ID token de Firebase se reemplaza por un stub. Todo el contenido es inventado. `caches` falla si se toca.
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'cf-worker', 'src', 'index.js'), 'utf8');
const ORIGEN = 'https://cdm-push-worker.test';
const OWNER = 'owner-uid';
const AHORA = Date.UTC(2026, 10, 10, 15, 0, 0);

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status });
const chartYahoo = (precio, extra) => ({ chart: { result: [{ meta: Object.assign({ symbol: 'X', currency: 'USD', regularMarketPrice: precio, chartPreviousClose: precio - 1, regularMarketTime: 1793800000 }, extra || {}) }], error: null } });

function armar() {
  let src = SRC
    .replace(/^import .*$/m, "const buildPushPayload = () => { throw new Error('no se usa en /radar'); };")
    .replace('export class TimerAlarm', 'class TimerAlarm')
    .replace('export class CarteraGate', 'class CarteraGate')
    .replace('export default', 'const __worker =')
    .replace('async function verifyFirebaseIdToken(', 'async function __verifyOriginal(');
  src += `
async function verifyFirebaseIdToken(token) {
  if (token === 'tok-owner') return '${OWNER}';
  if (token === 'tok-otro') return 'otro-uid';
  throw new Error('firma inválida');
}
return { worker: __worker, CarteraGate };`;

  const almacen = new Map();
  const storage = {
    async get(k) { return almacen.has(k) ? structuredClone(almacen.get(k)) : undefined; },
    async put(k, v) { almacen.set(k, structuredClone(v)); },
    async delete(k) { return almacen.delete(k); },
  };
  const caches = { get default() { throw new Error('caches.default no se usa en /radar'); } };

  const ll = { yahoo: [], github: [], precios: { NVDA: 140.5, MELI: 2000 }, noExiste: ['ZZZZ'], yahooCae: [], ghDispatch: 204, ghRama: 'main' };
  const fetchFalso = async (url, init) => {
    const u = String(url);
    const y = /^https:\/\/(query[12])\.finance\.yahoo\.com\/v8\/finance\/chart\/([^?]+)\?range=1d&interval=1d$/.exec(u);
    if (y) {
      const t = decodeURIComponent(y[2]);
      ll.yahoo.push(t);
      if (ll.yahooCae.includes(t)) return json({}, 503);
      if (ll.noExiste.includes(t)) return json({ chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } }, 404);
      if (!(t in ll.precios)) return json({ chart: { result: null, error: null } });
      return json(chartYahoo(ll.precios[t]));
    }
    if (u.startsWith('https://api.github.com/')) {
      ll.github.push({ url: u, metodo: (init && init.method) || 'GET', headers: (init && init.headers) || {}, body: init && init.body ? JSON.parse(init.body) : null });
      if (u === 'https://api.github.com/repos/Loustau45261470/centro-de-mando-datos') return json({ default_branch: ll.ghRama });
      if (/\/actions\/workflows\/radar-fundamentals\.yml\/dispatches$/.test(u)) return ll.ghDispatch === 204 ? new Response(null, { status: 204 }) : json({ message: 'x' }, ll.ghDispatch);
    }
    throw new Error('fetch inesperado: ' + u);
  };

  const { worker, CarteraGate } = new Function('caches', 'fetch', 'console', src)(caches, fetchFalso, { error() {}, warn() {}, log() {} });
  const env = { OWNER_UID: OWNER, GH_DATA_TOKEN: 'ghp_secreto_de_prueba', DATOS_REPO: 'Loustau45261470/centro-de-mando-datos' };
  const gate = new CarteraGate({ storage }, env);
  env.CARTERA = { idFromName(n) { return n; }, get() { return { fetch: (url, init) => gate.fetch(new Request(url, init)) }; } };
  const pedir = (ruta, { qs = '', tok = 'tok-owner', metodo, body, e } = {}) => worker.fetch(
    new Request(`${ORIGEN}/radar/${ruta}${qs}`, {
      method: metodo || (ruta === 'pedir' ? 'POST' : 'GET'),
      headers: Object.assign(tok ? { Authorization: `Bearer ${tok}` } : {}, body ? { 'content-type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    }), e || env);
  return { pedir, ll, env, worker };
}

async function conReloj(fn) {
  const ahora = Date.now;
  const reloj = { t: AHORA };
  Date.now = () => reloj.t;
  try { await fn(reloj); } finally { Date.now = ahora; }
}

test.describe('Worker /radar', () => {
  test('auth: sin token, token inválido o de otro uid no toca Yahoo ni GitHub (las dos rutas)', async () => {
    const w = armar();
    for (const [ruta, opts] of [['precios', { qs: '?t=NVDA' }], ['pedir', { body: { tickers: ['NVDA'] } }]]) {
      const sin = await w.pedir(ruta, Object.assign({}, opts, { tok: null }));
      expect(sin.status).toBe(401);
      expect((await sin.json()).error).toBe('unauthorized');
      expect((await w.pedir(ruta, Object.assign({}, opts, { tok: 'tok-malo' }))).status).toBe(401);
      const otro = await w.pedir(ruta, Object.assign({}, opts, { tok: 'tok-otro' }));
      expect(otro.status).toBe(403);
      expect(otro.headers.get('access-control-allow-origin')).toBe('https://loustau45261470.github.io');
    }
    expect(w.ll.yahoo).toEqual([]);
    expect(w.ll.github).toEqual([]);
  });

  test('sin OWNER_UID configurado: 500 y no toca nada', async () => {
    const w = armar();
    const r = await w.pedir('precios', { qs: '?t=NVDA', e: { CARTERA: w.env.CARTERA } });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe('missing_owner_uid');
    expect(w.ll.yahoo).toEqual([]);
  });

  test('OPTIONS responde 204 con CORS solo del sitio y permite POST + content-type; el método equivocado da 405; ruta inexistente 404', async () => {
    const w = armar();
    const pre = await w.pedir('pedir', { tok: null, metodo: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://loustau45261470.github.io');
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    expect(pre.headers.get('access-control-allow-headers')).toContain('content-type');
    expect((await w.pedir('precios', { qs: '?t=NVDA', metodo: 'POST', body: { tickers: ['NVDA'] } })).status).toBe(405);
    expect((await w.pedir('pedir', { metodo: 'GET' })).status).toBe(405);
    const nf = await w.pedir('otra');
    expect(nf.status).toBe(404);
    expect((await nf.json()).error).toBe('not_found_route');
    expect(w.ll.yahoo).toEqual([]);
  });

  test('parámetros inválidos: 400 bad_param sin tocar nada', async () => {
    const w = armar();
    for (const qs of ['', '?t=', '?t=NV%20DA', '?t=../x', '?t=1ABC', '?t=TOOLONGTICKERX', '?t=' + Array.from({ length: 31 }, (_, i) => 'A' + i).join(',')]) {
      const r = await w.pedir('precios', { qs });
      expect([qs, r.status]).toEqual([qs, 400]);
      expect((await r.json()).error).toBe('bad_param');
    }
    for (const body of [{}, { tickers: [] }, { tickers: 'NVDA' }, { tickers: ['NV DA'] }, { tickers: [1] }, { tickers: Array.from({ length: 26 }, (_, i) => 'A' + i) }]) {
      const r = await w.pedir('pedir', { body });
      expect([JSON.stringify(body), r.status]).toEqual([JSON.stringify(body), 400]);
      expect((await r.json()).error).toBe('bad_param');
    }
    const sinBody = await w.pedir('pedir');
    expect(sinBody.status).toBe(400);
    expect(w.ll.yahoo).toEqual([]);
    expect(w.ll.github).toEqual([]);
  });

  test('precios: devuelve precio, previo, hora y moneda; pasa a mayúsculas; un ticker que Yahoo no conoce da not_found sin romper al resto', async () => {
    const w = armar();
    await conReloj(async () => {
      const r = await w.pedir('precios', { qs: '?t=nvda,MELI,ZZZZ' });
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('private, no-store');
      const j = await r.json();
      expect(j.precios.NVDA).toEqual({ precio: 140.5, previo: 139.5, hora: 1793800000000, moneda: 'USD' });
      expect(j.precios.MELI.precio).toBe(2000);
      expect(j.precios.ZZZZ).toBeNull();
      expect(j.errores).toEqual({ ZZZZ: 'not_found' });
    });
  });

  test('precios: un ticker con Yahoo caído se informa como unavailable (no 200 con un precio inventado)', async () => {
    const w = armar();
    await conReloj(async () => {
      w.ll.yahooCae = ['NVDA'];
      const j = await (await w.pedir('precios', { qs: '?t=NVDA,MELI' })).json();
      expect(j.precios.NVDA).toBeNull();
      expect(j.errores.NVDA).toBe('unavailable');
      expect(j.precios.MELI.precio).toBe(2000);
    });
  });

  test('precios: se guardan 60 s (misma consulta no vuelve a Yahoo), después se vuelve a pedir y cambia el valor; los no encontrados se guardan 10 min', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      await w.pedir('precios', { qs: '?t=NVDA,ZZZZ' });
      const n1 = w.ll.yahoo.length;
      reloj.t += 30_000;
      expect((await (await w.pedir('precios', { qs: '?t=NVDA,ZZZZ' })).json()).precios.NVDA.precio).toBe(140.5);
      expect(w.ll.yahoo.length).toBe(n1);
      w.ll.precios.NVDA = 150;
      reloj.t += 31_000;
      const j = await (await w.pedir('precios', { qs: '?t=NVDA,ZZZZ' })).json();
      expect(j.precios.NVDA.precio).toBe(150);
      expect(w.ll.yahoo.filter(t => t === 'ZZZZ').length).toBe(1); // no existe: a los 61 s todavía sale de lo guardado
      reloj.t += 11 * 60_000;
      await w.pedir('precios', { qs: '?t=ZZZZ' });
      expect(w.ll.yahoo.filter(t => t === 'ZZZZ').length).toBe(2);
    });
  });

  test('pedir: sin GH_DATA_TOKEN da 500 missing_gh_token y no toca GitHub', async () => {
    const w = armar();
    const r = await w.pedir('pedir', { body: { tickers: ['NVDA'] }, e: { OWNER_UID: OWNER, CARTERA: w.env.CARTERA } });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe('missing_gh_token');
    expect(w.ll.github).toEqual([]);
  });

  test('pedir: lanza el workflow con los tickers (workflow_dispatch en la rama por defecto del repo de datos); NUNCA escribe archivos ni muestra el token', async () => {
    const w = armar();
    await conReloj(async () => {
      w.ll.ghRama = 'principal';
      const r = await w.pedir('pedir', { body: { tickers: ['nvda', 'MELI', 'NVDA'] } });
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j).toEqual({ pedidos: ['NVDA', 'MELI'], yaPedidos: [] });
      expect(JSON.stringify(j)).not.toContain('ghp_');
    });
    const disp = w.ll.github.filter(g => g.metodo === 'POST');
    expect(disp).toHaveLength(1);
    expect(disp[0].url).toBe('https://api.github.com/repos/Loustau45261470/centro-de-mando-datos/actions/workflows/radar-fundamentals.yml/dispatches');
    expect(disp[0].body).toEqual({ ref: 'principal', inputs: { tickers: 'NVDA,MELI' } });
    expect(disp[0].headers.Authorization).toBe('Bearer ghp_secreto_de_prueba');
    // Lo único que hace con GitHub: leer la rama por defecto y disparar el workflow. Ni PUT ni /contents.
    expect(w.ll.github.every(g => g.metodo === 'GET' || /\/dispatches$/.test(g.url))).toBe(true);
    expect(w.ll.github.some(g => /\/contents\//.test(g.url) || g.metodo === 'PUT' || g.metodo === 'DELETE')).toBe(false);
  });

  test('pedir: el mismo ticker no se vuelve a pedir durante 10 min (freno); pasado ese tiempo sí', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      await w.pedir('pedir', { body: { tickers: ['NVDA'] } });
      reloj.t += 60_000;
      const j2 = await (await w.pedir('pedir', { body: { tickers: ['NVDA', 'MELI'] } })).json();
      expect(j2).toEqual({ pedidos: ['MELI'], yaPedidos: ['NVDA'] });
      const j3 = await (await w.pedir('pedir', { body: { tickers: ['NVDA', 'MELI'] } })).json();
      expect(j3).toEqual({ pedidos: [], yaPedidos: ['NVDA', 'MELI'] });
      expect(w.ll.github.filter(g => g.metodo === 'POST')).toHaveLength(2);
      reloj.t += 11 * 60_000;
      const j4 = await (await w.pedir('pedir', { body: { tickers: ['NVDA'] } })).json();
      expect(j4.pedidos).toEqual(['NVDA']);
    });
  });

  test('pedir: si GitHub no deja (403/404) responde 502 github_permiso con el permiso que falta, y no marca el ticker como pedido', async () => {
    const w = armar();
    await conReloj(async () => {
      w.ll.ghDispatch = 403;
      const r = await w.pedir('pedir', { body: { tickers: ['NVDA'] } });
      expect(r.status).toBe(502);
      const j = await r.json();
      expect(j.error).toBe('github_permiso');
      expect(j.message).toContain('Actions: Read and write');
      expect(j.message).toContain('radar-fundamentals.yml');
      expect(JSON.stringify(j)).not.toContain('ghp_');
      w.ll.ghDispatch = 204;
      expect((await (await w.pedir('pedir', { body: { tickers: ['NVDA'] } })).json()).pedidos).toEqual(['NVDA']); // el fallo no consumió el freno
    });
  });

  test('pedir: token rechazado (401) y respuesta rara (422) dan 502 con código propio', async () => {
    const w = armar();
    await conReloj(async () => {
      w.ll.ghDispatch = 401;
      expect((await (await w.pedir('pedir', { body: { tickers: ['AAA'] } })).json()).error).toBe('github_token');
      w.ll.ghDispatch = 422;
      const r = await w.pedir('pedir', { body: { tickers: ['BBB'] } });
      expect(r.status).toBe(502);
      expect((await r.json()).error).toBe('github_error');
    });
  });

  test('las otras rutas siguen respondiendo igual con el Worker nuevo (/cartera sin token = 401)', async () => {
    const w = armar();
    const r = await w.worker.fetch(new Request(`${ORIGEN}/cartera`, { headers: {} }), w.env);
    expect(r.status).toBe(401);
    const rr = await w.worker.fetch(new Request(`${ORIGEN}/rendimiento/mercado?desde=2026-11-04`, { headers: {} }), w.env);
    expect(rr.status).toBe(401);
  });
});
