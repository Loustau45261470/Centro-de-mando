// GET /cartera?fresh=1 del Worker (cf-worker/src/index.js). Sin navegador y sin red: el código fuente del Worker se
// evalúa en Node con fetch y la Cache API falsos, y la verificación del ID token de Firebase reemplazada por un stub
// (la firma RS256 real necesita los certificados de Google; esa parte no cambió y no se prueba acá).
// Se evalúa el texto del archivo en vez de importarlo porque cf-worker/ tiene su propio node_modules (no está en el CI).
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'cf-worker', 'src', 'index.js'), 'utf8');
const ORIGEN = 'https://cdm-push-worker.test';
const OWNER = 'owner-uid';

// Respuesta cruda mínima de IOL; `precio` cambia para distinguir una consulta nueva de la caché.
const portafolioIol = (precio) => ({ activos: [{
  titulo: { simbolo: 'TESTA', descripcion: 'Cedear de prueba', tipo: 'CEDEARS' },
  cantidad: 10, comprometido: 0, ultimoPrecio: precio, variacionDiaria: 1, valorizado: precio * 10,
  ppc: 100, gananciaPorcentaje: 5, gananciaDinero: 50,
}] });

// Arma el Worker con un entorno aislado. Devuelve el handler y los contadores de llamadas a IOL.
function armar() {
  let src = SRC
    .replace(/^import .*$/m, "const buildPushPayload = () => { throw new Error('no se usa en /cartera'); };")
    .replace('export class TimerAlarm', 'class TimerAlarm')
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

  const almacen = new Map();
  const caches = { default: {
    async match(req) { const e = almacen.get(req.url); return e ? new Response(e.body, { status: e.status, headers: e.headers }) : undefined; },
    async put(req, res) { almacen.set(req.url, { body: await res.text(), status: res.status, headers: [...res.headers.entries()] }); },
  } };

  const llamadas = { token: 0, portafolio: 0, precio: 100, portafolioStatus: 200 };
  const fetchFalso = async (url) => {
    if (String(url).endsWith('/token')) { llamadas.token++; return new Response(JSON.stringify({ access_token: 'acc-' + llamadas.token }), { status: 200 }); }
    if (String(url).includes('/portafolio/')) {
      llamadas.portafolio++;
      return new Response(JSON.stringify(portafolioIol(llamadas.precio)), { status: llamadas.portafolioStatus });
    }
    throw new Error('fetch inesperado: ' + url);
  };

  const worker = new Function('caches', 'fetch', 'console', src)(caches, fetchFalso, { error() {}, warn() {}, log() {} });
  const env = { OWNER_UID: OWNER, IOL_USER: 'u', IOL_PASS: 'p' };
  const pedir = (qs = '', tok = 'tok-owner', metodo = 'GET') => worker.fetch(
    new Request(`${ORIGEN}/cartera${qs}`, { method: metodo, headers: tok ? { Authorization: `Bearer ${tok}` } : {} }), env);
  return { pedir, llamadas, almacen, env, worker };
}

const precioDe = async (res) => (await res.json()).tenencias[0].precio;

test.describe('Worker /cartera?fresh=1', () => {
  test('sin fresh todo igual: la primera consulta va a IOL y la siguiente sale de la caché', async () => {
    const w = armar();
    const r1 = await w.pedir();
    expect(r1.status).toBe(200);
    expect(r1.headers.get('x-cartera-fuente')).toBe('iol');
    expect(await precioDe(r1)).toBe(100);

    w.llamadas.precio = 200; // IOL ya cambió, pero la caché manda
    const r2 = await w.pedir();
    expect(r2.headers.get('x-cartera-fuente')).toBe('cache');
    expect(await precioDe(r2)).toBe(100);
    expect(w.llamadas.portafolio).toBe(1);
  });

  test('fresh=1 ignora la caché, consulta IOL, reusa el access_token vigente y guarda el resultado nuevo', async () => {
    const w = armar();
    await w.pedir(); // llena la caché del portafolio y del token (precio 100)
    w.llamadas.precio = 250;

    const r = await w.pedir('?fresh=1');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-cartera-fuente')).toBe('iol');
    expect(await precioDe(r)).toBe(250);
    expect(w.llamadas.portafolio).toBe(2);
    expect(w.llamadas.token).toBe(1); // el login a IOL no se repite

    // Sin fresh la caché ya tiene lo nuevo.
    w.llamadas.precio = 999;
    const r2 = await w.pedir();
    expect(r2.headers.get('x-cartera-fuente')).toBe('cache');
    expect(await precioDe(r2)).toBe(250);
  });

  test('freno anti-abuso: un segundo fresh=1 antes de 30 s responde la caché; pasados los 30 s vuelve a IOL', async () => {
    const w = armar();
    const ahora = Date.now;
    let t = ahora();
    Date.now = () => t;
    try {
      w.llamadas.precio = 100;
      const r1 = await w.pedir('?fresh=1');
      expect(r1.headers.get('x-cartera-fuente')).toBe('iol');

      w.llamadas.precio = 300;
      t += 10_000;
      const r2 = await w.pedir('?fresh=1');
      expect(r2.headers.get('x-cartera-fuente')).toBe('cache');
      expect(await precioDe(r2)).toBe(100);
      expect(w.llamadas.portafolio).toBe(1);

      t += 25_000; // 35 s desde el último refresco forzado
      const r3 = await w.pedir('?fresh=1');
      expect(r3.headers.get('x-cartera-fuente')).toBe('iol');
      expect(await precioDe(r3)).toBe(300);
      expect(w.llamadas.portafolio).toBe(2);
    } finally {
      Date.now = ahora;
    }
  });

  test('si IOL falla en un refresco forzado: error 502 con mensaje y la caché anterior queda intacta', async () => {
    const w = armar();
    await w.pedir(); // caché con precio 100
    w.llamadas.portafolioStatus = 500;
    const r = await w.pedir('?fresh=1');
    expect(r.status).toBe(502);
    expect((await r.json()).message).toContain('IOL');
    w.llamadas.portafolioStatus = 200;
    const r2 = await w.pedir();
    expect(r2.headers.get('x-cartera-fuente')).toBe('cache');
    expect(await precioDe(r2)).toBe(100);
  });

  test('CORS expone x-cartera-fuente y la auth sigue igual: fresh sin token, con token inválido o de otro uid no consulta IOL', async () => {
    const w = armar();
    const ok = await w.pedir('?fresh=1');
    expect(ok.headers.get('access-control-expose-headers')).toContain('x-cartera-fuente');
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://loustau45261470.github.io');
    const pre = await w.pedir('?fresh=1', null, 'OPTIONS');
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-expose-headers')).toContain('x-cartera-fuente');

    const antes = w.llamadas.portafolio;
    expect((await w.pedir('?fresh=1', null)).status).toBe(401);
    expect((await w.pedir('?fresh=1', 'tok-malo')).status).toBe(401);
    expect((await w.pedir('?fresh=1', 'tok-otro')).status).toBe(403);
    expect(w.llamadas.portafolio).toBe(antes);
  });

  test('credenciales de IOL faltantes: 500 missing_credentials también con fresh, sin filtrar nada', async () => {
    const w = armar();
    const r = await w.worker.fetch(new Request(`${ORIGEN}/cartera?fresh=1`, { headers: { Authorization: 'Bearer tok-owner' } }), { OWNER_UID: OWNER });
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('missing_credentials');
    expect(JSON.stringify(j)).not.toMatch(/tok-owner|IOL_PASS=/);
  });
});
