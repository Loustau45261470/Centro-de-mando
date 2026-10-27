// GET /cartera?fresh=1 del Worker (cf-worker/src/index.js). Sin navegador y sin red: el código fuente del Worker se
// evalúa en Node con fetch falso, un storage en memoria para el Durable Object CarteraGate y un env.CARTERA falso que
// enruta siempre a la misma instancia. La verificación del ID token de Firebase se reemplaza por un stub (la firma RS256
// real necesita los certificados de Google; esa parte no cambió y no se prueba acá).
// `caches` falla si se toca: la Cache API no funciona en *.workers.dev, /cartera ya no puede depender de ella.
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

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// Arma el Worker con un entorno aislado. Devuelve el handler y los contadores de llamadas a IOL.
function armar() {
  let src = SRC
    .replace(/^import .*$/m, "const buildPushPayload = () => { throw new Error('no se usa en /cartera'); };")
    .replace('export class TimerAlarm', 'class TimerAlarm')
    .replace('export class CarteraGate', 'class CarteraGate')
    .replace('export default', 'const __worker =')
    .replace('async function verifyFirebaseIdToken(', 'async function __verifyOriginal(');
  expect(src).toContain('const __worker =');
  expect(src).toContain('class CarteraGate');
  expect(src).toContain('async function __verifyOriginal(');
  src += `
async function verifyFirebaseIdToken(token) {
  if (token === 'tok-owner') return '${OWNER}';
  if (token === 'tok-otro') return 'otro-uid';
  throw new Error('firma inválida');
}
return { worker: __worker, CarteraGate };`;

  // Storage del DO: copia estructurada al guardar y al leer, como el real (no se comparten referencias).
  const almacen = new Map();
  const storage = {
    async get(k) { return almacen.has(k) ? structuredClone(almacen.get(k)) : undefined; },
    async put(k, v) { almacen.set(k, structuredClone(v)); },
    async delete(k) { return almacen.delete(k); },
  };
  const caches = { get default() { throw new Error('caches.default no se usa en /cartera'); } };

  // `demora` hace que cada consulta a IOL tarde: así los pedidos simultáneos se intercalan como en el Worker real.
  const llamadas = { token: 0, portafolio: 0, precio: 100, portafolioStatus: 200, tokenStatus: 200, demora: 20, credenciales: [] };
  const fetchFalso = async (url, init) => {
    if (String(url).endsWith('/token')) {
      llamadas.token++;
      llamadas.credenciales.push(String(init && init.body));
      await dormir(llamadas.demora);
      return new Response(JSON.stringify({ access_token: 'acc-' + llamadas.token }), { status: llamadas.tokenStatus });
    }
    if (String(url).includes('/portafolio/')) {
      llamadas.portafolio++;
      await dormir(llamadas.demora);
      return new Response(JSON.stringify(portafolioIol(llamadas.precio)), { status: llamadas.portafolioStatus });
    }
    throw new Error('fetch inesperado: ' + url);
  };

  const { worker, CarteraGate } = new Function('caches', 'fetch', 'console', src)(caches, fetchFalso, { error() {}, warn() {}, log() {} });
  const env = { OWNER_UID: OWNER, IOL_USER: 'u', IOL_PASS: 'p' };
  // Una sola instancia del DO por idFromName, con las credenciales por env (nunca por el body del pedido).
  const gate = new CarteraGate({ storage }, env);
  const llamadasGate = { n: 0, bodies: [], nombres: [] };
  env.CARTERA = {
    idFromName(nombre) { llamadasGate.nombres.push(nombre); return nombre; },
    get() { return { fetch: (url, init) => { llamadasGate.n++; llamadasGate.bodies.push(init && init.body); return gate.fetch(new Request(url, init)); } }; },
  };
  const pedir = (qs = '', tok = 'tok-owner', metodo = 'GET') => worker.fetch(
    new Request(`${ORIGEN}/cartera${qs}`, { method: metodo, headers: tok ? { Authorization: `Bearer ${tok}` } : {} }), env);
  return { pedir, llamadas, llamadasGate, almacen, env, worker };
}

const precioDe = async (res) => (await res.json()).tenencias[0].precio;

// Date.now controlable dentro del test; se restaura siempre.
async function conReloj(fn) {
  const ahora = Date.now;
  const reloj = { t: ahora() };
  Date.now = () => reloj.t;
  try { await fn(reloj); } finally { Date.now = ahora; }
}

test.describe('Worker /cartera (Durable Object CarteraGate)', () => {
  test('sin fresh: la primera consulta va a IOL y la siguiente sale de la caché de 15 min; vencida, vuelve a IOL', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      const r1 = await w.pedir();
      expect(r1.status).toBe(200);
      expect(r1.headers.get('x-cartera-fuente')).toBe('iol');
      expect(await precioDe(r1)).toBe(100);

      w.llamadas.precio = 200; // IOL ya cambió, pero la caché manda
      reloj.t += 14 * 60_000;
      const r2 = await w.pedir();
      expect(r2.headers.get('x-cartera-fuente')).toBe('cache');
      expect(await precioDe(r2)).toBe(100);
      expect(w.llamadas.portafolio).toBe(1);

      reloj.t += 2 * 60_000; // 16 min desde que se guardó
      const r3 = await w.pedir();
      expect(r3.headers.get('x-cartera-fuente')).toBe('iol');
      expect(await precioDe(r3)).toBe(200);
      expect(w.llamadas.portafolio).toBe(2);
    });
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

  test('el access_token se reusa ~14 min; pasado ese tiempo se vuelve a entrar a IOL', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      await w.pedir('?fresh=1');
      reloj.t += 13 * 60_000;
      await w.pedir('?fresh=1');
      expect(w.llamadas.token).toBe(1);
      reloj.t += 2 * 60_000; // 15 min desde el login
      await w.pedir('?fresh=1');
      expect(w.llamadas.token).toBe(2);
    });
  });

  test('freno anti-abuso: un segundo fresh=1 antes de 30 s responde la caché; pasados los 30 s vuelve a IOL', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      w.llamadas.precio = 100;
      const r1 = await w.pedir('?fresh=1');
      expect(r1.headers.get('x-cartera-fuente')).toBe('iol');

      w.llamadas.precio = 300;
      reloj.t += 10_000;
      const r2 = await w.pedir('?fresh=1');
      expect(r2.headers.get('x-cartera-fuente')).toBe('cache');
      expect(await precioDe(r2)).toBe(100);
      expect(w.llamadas.portafolio).toBe(1);

      reloj.t += 25_000; // 35 s desde el último refresco forzado
      const r3 = await w.pedir('?fresh=1');
      expect(r3.headers.get('x-cartera-fuente')).toBe('iol');
      expect(await precioDe(r3)).toBe(300);
      expect(w.llamadas.portafolio).toBe(2);
    });
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

  test('un refresco forzado que falla también activa el freno de 30 s: sin caché responde 429 too_soon y no golpea a IOL', async () => {
    const w = armar();
    w.llamadas.portafolioStatus = 500;
    expect((await w.pedir('?fresh=1')).status).toBe(502);
    const r = await w.pedir('?fresh=1');
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.error).toBe('too_soon');
    expect(j.message).toBe('Esperá unos segundos antes de volver a actualizar.');
    expect(r.headers.get('access-control-allow-origin')).toBe('https://loustau45261470.github.io');
    expect(w.llamadas.portafolio).toBe(1);
  });

  test('ingreso rechazado por IOL: 10 min sin reintentar la contraseña (con y sin fresh) y luego reintenta', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      w.llamadas.tokenStatus = 401;
      const r1 = await w.pedir();
      expect(r1.status).toBe(502);
      expect((await r1.json()).message).toContain('login IOL falló (HTTP 401)');
      expect(w.llamadas.token).toBe(1);

      reloj.t += 60_000;
      const r2 = await w.pedir('?fresh=1');
      expect(r2.status).toBe(502);
      expect((await r2.json()).message).toMatch(/no bloquear tu cuenta.*9 min/);
      expect(w.llamadas.token).toBe(1); // no volvió a mandar la contraseña

      reloj.t += 60_000;
      const r3 = await w.pedir(); // sin fresh
      expect(r3.status).toBe(502);
      expect((await r3.json()).message).toMatch(/no bloquear tu cuenta.*8 min/);
      expect(w.llamadas.token).toBe(1);

      w.llamadas.tokenStatus = 200;
      reloj.t += 10 * 60_000;
      const r4 = await w.pedir();
      expect(r4.status).toBe(200);
      expect(w.llamadas.token).toBe(2);
    });
  });

  test('10 pedidos simultáneos con el ingreso rechazado: un solo intento de login', async () => {
    const w = armar();
    w.llamadas.tokenStatus = 401;
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => w.pedir(i % 2 ? '?fresh=1' : '')));
    expect(rs.map(r => r.status)).toEqual(Array(10).fill(502));
    expect(w.llamadas.token).toBe(1);
    expect(w.llamadas.portafolio).toBe(0);
    // Y uno posterior tampoco reintenta (la espera de 10 min quedó guardada).
    expect((await w.pedir('?fresh=1')).status).toBe(502);
    expect(w.llamadas.token).toBe(1);
  });

  test('10 fresh simultáneos: una sola consulta al portafolio y un solo login, todos reciben el mismo resultado', async () => {
    const w = armar();
    const rs = await Promise.all(Array.from({ length: 10 }, () => w.pedir('?fresh=1')));
    expect(rs.map(r => r.status)).toEqual(Array(10).fill(200));
    expect(w.llamadas.portafolio).toBe(1);
    expect(w.llamadas.token).toBe(1);
    for (const r of rs) {
      expect(r.headers.get('x-cartera-fuente')).toBe('iol');
      expect(await precioDe(r)).toBe(100);
    }
  });

  test('10 pedidos simultáneos sin caché ni fresh: una sola consulta a IOL', async () => {
    const w = armar();
    const rs = await Promise.all(Array.from({ length: 10 }, () => w.pedir()));
    expect(rs.map(r => r.status)).toEqual(Array(10).fill(200));
    expect(w.llamadas.portafolio).toBe(1);
    expect(w.llamadas.token).toBe(1);
  });

  test('las credenciales viajan solo por env: ni en el body al DO ni en el storage ni en la respuesta', async () => {
    const w = armar();
    w.env.IOL_USER = 'usuario-secreto';
    w.env.IOL_PASS = 'clave-secreta';
    const r = await w.pedir('?fresh=1');
    expect(r.status).toBe(200);
    expect(w.llamadasGate.nombres).toEqual(['cartera']);
    expect(w.llamadasGate.bodies).toEqual([JSON.stringify({ fresh: true })]);
    expect(w.llamadas.credenciales[0]).toContain('clave-secreta'); // sí se le manda a IOL, y solo a IOL
    expect(JSON.stringify([...w.almacen.entries()])).not.toMatch(/usuario-secreto|clave-secreta/);
    expect(JSON.stringify(await r.json())).not.toMatch(/usuario-secreto|clave-secreta/);
  });

  test('CORS expone x-cartera-fuente y la auth sigue igual: sin token, inválido o de otro uid no toca el DO ni IOL', async () => {
    const w = armar();
    const ok = await w.pedir('?fresh=1');
    expect(ok.headers.get('access-control-expose-headers')).toContain('x-cartera-fuente');
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://loustau45261470.github.io');
    const pre = await w.pedir('?fresh=1', null, 'OPTIONS');
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-expose-headers')).toContain('x-cartera-fuente');

    const gateAntes = w.llamadasGate.n;
    const iolAntes = w.llamadas.portafolio + w.llamadas.token;
    expect((await w.pedir('?fresh=1', null)).status).toBe(401);
    expect((await w.pedir('?fresh=1', 'tok-malo')).status).toBe(401);
    expect((await w.pedir('?fresh=1', 'tok-otro')).status).toBe(403);
    expect(w.llamadasGate.n).toBe(gateAntes);
    expect(w.llamadas.portafolio + w.llamadas.token).toBe(iolAntes);
  });

  test('credenciales de IOL faltantes: 500 missing_credentials también con fresh, sin tocar el DO ni filtrar nada', async () => {
    const w = armar();
    const r = await w.worker.fetch(new Request(`${ORIGEN}/cartera?fresh=1`, { headers: { Authorization: 'Bearer tok-owner' } }),
      { OWNER_UID: OWNER, CARTERA: w.env.CARTERA });
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.error).toBe('missing_credentials');
    expect(JSON.stringify(j)).not.toMatch(/tok-owner|IOL_PASS=/);
    expect(w.llamadasGate.n).toBe(0);
    expect(w.llamadas.token + w.llamadas.portafolio).toBe(0);
  });
});
