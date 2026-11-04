// GET /rendimiento/{operaciones,cierres,mercado} del Worker (cf-worker/src/index.js). Mismo método que worker-cartera.spec.js:
// el código fuente del Worker se evalúa en Node con fetch falso, storage en memoria para el Durable Object CarteraGate y un
// env.CARTERA falso. La verificación del ID token de Firebase se reemplaza por un stub. Todo el contenido es inventado.
// `caches` falla si se toca: en *.workers.dev la Cache API no funciona y estas rutas no pueden depender de ella.
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'cf-worker', 'src', 'index.js'), 'utf8');
const ORIGEN = 'https://cdm-push-worker.test';
const OWNER = 'owner-uid';
const AHORA = Date.UTC(2026, 10, 10, 15, 0, 0); // 10/11/2026 12:00 hora de Argentina

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status });

const LISTA_OPS = [
  { numero: 101, fechaOperada: '2026-11-06T14:30:00', tipo: 'Compra', simbolo: 'TESTA', mercado: 'BCBA', cantidadOperada: 10, precioOperado: 1500, montoOperado: 15000 },
  { numero: 102, fechaOperada: '2026-11-07T15:00:00', tipo: 'Venta', simbolo: 'TESTB', mercado: 'BCBA', cantidadOperada: 5, precioOperado: 2000, montoOperado: 10000 },
  { numero: 103, fechaOperada: '2026-11-08T10:00:00', tipo: 'Pago de Dividendos', simbolo: 'TESTA', mercado: 'BCBA', monto: 500 },
  { numero: 104, fechaOperada: '2026-11-08T11:00:00', tipo: 'Algo raro', simbolo: 'TESTA', mercado: 'BCBA', monto: 1 },
];
const DETALLES = {
  101: { numero: 101, moneda: 'peso_Argentino', aranceles: [{ neto: 100, iva: 21 }, { neto: 50, iva: 10.5 }] },
  102: { numero: 102, moneda: 'peso_Argentino', aranceles: [] },
};
const ESTADO = { cuentas: [
  { tipo: 'inversion_Argentina_Pesos', moneda: 'peso_Argentino', disponible: 1000, saldo: 900 },
  { tipo: 'inversion_Argentina_Dolares', moneda: 'dolar_Estadounidense', disponible: 5, saldo: 5 },
] };

function armar() {
  let src = SRC
    .replace(/^import .*$/m, "const buildPushPayload = () => { throw new Error('no se usa en /rendimiento'); };")
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
  const caches = { get default() { throw new Error('caches.default no se usa en /rendimiento'); } };

  const ll = { token: 0, urls: [], metodos: [], tokenStatus: 200, ipcFalla: false, rechazarToken: 0, demora: 5 };
  const fetchFalso = async (url, init) => {
    const u = String(url);
    ll.metodos.push((init && init.method) || 'GET');
    if (u.endsWith('/token')) {
      ll.token++;
      await dormir(ll.demora);
      return json({ access_token: 'acc-' + ll.token }, ll.tokenStatus);
    }
    ll.urls.push(u);
    if (u.startsWith('https://api.invertironline.com/api/v2/')) {
      const bearer = String(init && init.headers && init.headers.Authorization || '');
      if (ll.rechazarToken > 0 && bearer === 'Bearer acc-1') { ll.rechazarToken--; return json({}, 401); }
      await dormir(ll.demora);
      const p = u.slice('https://api.invertironline.com/api/v2'.length);
      if (p.startsWith('/operaciones?')) return json(LISTA_OPS);
      const det = /^\/operaciones\/(\d+)$/.exec(p);
      if (det) return DETALLES[det[1]] ? json(DETALLES[det[1]]) : json({}, 404);
      if (p === '/estadocuenta') return json(ESTADO);
      if (/\/Titulos\/TESTA\/Cotizacion\/seriehistorica\//.test(p)) return json([{ fechaHora: '2026-11-04T00:00:00', ultimoPrecio: 1234.5 }]);
      if (/\/Titulos\/TESTLETRA\/Cotizacion\/seriehistorica\//.test(p)) return json([{ fechaHora: '2026-11-04T00:00:00', ultimoPrecio: 121.25 }]);
      if (/\/Titulos\/SINDATO\/Cotizacion\/seriehistorica\//.test(p)) return json([]);
      return json({}, 404);
    }
    if (u.startsWith('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa')) {
      return json([{ casa: 'bolsa', compra: 990, venta: 1000, fecha: '2026-10-20' }, { casa: 'bolsa', compra: 1000, venta: 1010, fecha: '2026-11-04' }, { casa: 'bolsa', compra: 1040, venta: 1050, fecha: '2026-11-09' }]);
    }
    if (u.startsWith('https://dolarapi.com/')) return json({ venta: 1060, fechaActualizacion: '2026-11-10T14:00:00.000Z' });
    if (u.includes('finance.yahoo.com/v8/finance/chart/SPY')) {
      return json({ chart: { result: [{ meta: { gmtoffset: -18000 }, timestamp: [1793802600, 1793975400], indicators: { quote: [{ close: [500, 510] }], adjclose: [{ adjclose: [500, 511] }] } }] } });
    }
    if (u.startsWith('https://api.argentinadatos.com/v1/finanzas/indices/inflacion')) {
      if (ll.ipcFalla) return json({}, 503);
      return json([{ fecha: '2026-08-31', valor: 1.7 }, { fecha: '2026-09-30', valor: 1.9 }]);
    }
    if (u.startsWith('https://fred.stlouisfed.org/')) return new Response('observation_date,CPIAUCNS\n2026-08-01,334.980\n2026-09-01,336.940\n2026-10-01,.\n');
    throw new Error('fetch inesperado: ' + u);
  };

  const { worker, CarteraGate } = new Function('caches', 'fetch', 'console', src)(caches, fetchFalso, { error() {}, warn() {}, log() {} });
  const env = { OWNER_UID: OWNER, IOL_USER: 'u', IOL_PASS: 'p' };
  const gate = new CarteraGate({ storage }, env);
  env.CARTERA = { idFromName(n) { return n; }, get() { return { fetch: (url, init) => gate.fetch(new Request(url, init)) }; } };
  const pedir = (ruta, qs = '', tok = 'tok-owner', metodo = 'GET') => worker.fetch(
    new Request(`${ORIGEN}/rendimiento/${ruta}${qs}`, { method: metodo, headers: tok ? { Authorization: `Bearer ${tok}` } : {} }), env);
  return { pedir, ll, almacen, env, worker };
}

async function conReloj(fn) {
  const ahora = Date.now;
  const reloj = { t: AHORA };
  Date.now = () => reloj.t;
  try { await fn(reloj); } finally { Date.now = ahora; }
}

test.describe('Worker /rendimiento', () => {
  test('auth: sin token, token inválido o de otro uid no llega a IOL ni a las fuentes públicas (las tres rutas)', async () => {
    const w = armar();
    const rutas = [['operaciones', '?desde=2026-11-04'], ['cierres', '?fecha=2026-11-04&s=TESTA:BCBA'], ['mercado', '?desde=2026-11-04']];
    for (const [ruta, qs] of rutas) {
      const sin = await w.pedir(ruta, qs, null);
      expect(sin.status).toBe(401);
      expect((await sin.json()).error).toBe('unauthorized');
      expect((await w.pedir(ruta, qs, 'tok-malo')).status).toBe(401);
      const otro = await w.pedir(ruta, qs, 'tok-otro');
      expect(otro.status).toBe(403);
      expect(otro.headers.get('access-control-allow-origin')).toBe('https://loustau45261470.github.io');
    }
    expect(w.ll.token).toBe(0);
    expect(w.ll.urls).toEqual([]);
  });

  test('OPTIONS responde 204 con CORS solo del sitio; métodos que no son GET dan 405', async () => {
    const w = armar();
    const pre = await w.pedir('operaciones', '?desde=2026-11-04', null, 'OPTIONS');
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://loustau45261470.github.io');
    expect((await w.pedir('operaciones', '?desde=2026-11-04', 'tok-owner', 'POST')).status).toBe(405);
  });

  test('parámetros inválidos: 400 bad_param sin tocar nada, y ruta inexistente 404 en JSON', async () => {
    const w = armar();
    await conReloj(async () => {
      for (const [ruta, qs] of [
        ['operaciones', ''], ['operaciones', '?desde=ayer'], ['operaciones', '?desde=2019-01-01'], ['operaciones', '?desde=2030-01-01'],
        ['mercado', '?desde=2026-13-45'],
        ['cierres', '?fecha=2026-11-04'], ['cierres', '?fecha=2026-11-04&s='], ['cierres', '?fecha=2026-11-04&s=TESTA'],
        ['cierres', '?fecha=2026-11-04&s=TE/ST:BCBA'], ['cierres', '?fecha=2026-11-04&s=TESTA:BC%20BA'],
        ['cierres', '?fecha=2026-11-04&s=' + Array.from({ length: 31 }, (_, i) => 'S' + i + ':BCBA').join(',')],
      ]) {
        const r = await w.pedir(ruta, qs);
        expect([ruta + qs, r.status]).toEqual([ruta + qs, 400]);
        expect((await r.json()).error).toBe('bad_param');
      }
      const nf = await w.pedir('cuenta-corriente', '?desde=2026-11-04');
      expect(nf.status).toBe(404);
      expect((await nf.json()).error).toBe('not_found_route');
    });
    expect(w.ll.token).toBe(0);
    expect(w.ll.urls).toEqual([]);
  });

  test('sin credenciales de IOL: 500 missing_credentials en las rutas de IOL; mercado (público) no las necesita', async () => {
    const w = armar();
    await conReloj(async () => {
      const envSin = { OWNER_UID: OWNER, CARTERA: w.env.CARTERA };
      const get = (ruta, qs) => w.worker.fetch(new Request(`${ORIGEN}/rendimiento/${ruta}${qs}`, { headers: { Authorization: 'Bearer tok-owner' } }), envSin);
      for (const [ruta, qs] of [['operaciones', '?desde=2026-11-04'], ['cierres', '?fecha=2026-11-04&s=TESTA:BCBA']]) {
        const r = await get(ruta, qs);
        expect(r.status).toBe(500);
        expect((await r.json()).error).toBe('missing_credentials');
      }
      expect((await get('mercado', '?desde=2026-11-04')).status).toBe(200);
    });
    expect(w.ll.token).toBe(0);
  });

  test('operaciones: normaliza tipos, suma aranceles (neto + IVA) del detalle, trae el efectivo y NUNCA manda una orden (solo GET, un POST de login)', async () => {
    const w = armar();
    await conReloj(async () => {
      const r = await w.pedir('operaciones', '?desde=2026-11-04');
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('private, no-store');
      const j = await r.json();
      expect(j.operaciones.map(o => [o.numero, o.tipo])).toEqual([[101, 'compra'], [102, 'venta'], [103, 'dividendo'], [104, 'otro']]);
      const compra = j.operaciones[0];
      expect(compra).toMatchObject({ fecha: '2026-11-06', fechaHora: '2026-11-06T14:30:00', simbolo: 'TESTA', cantidad: 10, monto: 15000, moneda: 'ARS', comision: 181.5 });
      expect(j.operaciones[1].comision).toBe(0); // detalle con aranceles vacíos → 0 real
      expect(j.operaciones[2].monto).toBe(500);
      expect(j.comisionesPendientes).toBe(0);
      expect(j.efectivo).toEqual({ ARS: { disponible: 1000, saldo: 900 }, USD: { disponible: 5, saldo: 5 } });
    });
    // El filtro viaja con estado terminadas y la fecha pedida; ninguna llamada de escritura salvo el login.
    expect(w.ll.urls.find(u => u.includes('/operaciones?'))).toContain('filtro.estado=terminadas&filtro.fechaDesde=2026-11-04');
    expect(w.ll.metodos.filter(m => m !== 'GET')).toEqual(['POST']); // el POST es el login a /token
    expect(w.ll.token).toBe(1);
    expect(w.ll.urls.some(u => /\/operar|\/Comprar|\/Vender/i.test(u))).toBe(false);
  });

  test('operaciones: la lista se guarda 5 min y el detalle de cada operación para siempre (no se vuelve a pedir)', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      await w.pedir('operaciones', '?desde=2026-11-04');
      const n1 = w.ll.urls.length;
      await w.pedir('operaciones', '?desde=2026-11-04'); // dentro de 5 min
      expect(w.ll.urls.length).toBe(n1);
      reloj.t += 6 * 60_000;
      await w.pedir('operaciones', '?desde=2026-11-04'); // vencida: vuelve la lista y el estado de cuenta, NO los detalles
      const nuevas = w.ll.urls.slice(n1);
      expect(nuevas.some(u => u.includes('/operaciones?'))).toBe(true);
      expect(nuevas.some(u => /\/operaciones\/\d+$/.test(u))).toBe(false);
      expect(w.ll.token).toBe(1);
    });
  });

  test('si IOL rechaza el token vigente (401), se pide uno nuevo una sola vez y la consulta sale bien', async () => {
    const w = armar();
    await conReloj(async () => {
      w.ll.rechazarToken = 1;
      const r = await w.pedir('operaciones', '?desde=2026-11-04');
      expect(r.status).toBe(200);
      expect(w.ll.token).toBe(2);
    });
  });

  test('operaciones y cierres simultáneos comparten UN solo login a IOL', async () => {
    const w = armar();
    await conReloj(async () => {
      const rs = await Promise.all([
        w.pedir('operaciones', '?desde=2026-11-04'),
        w.pedir('cierres', '?fecha=2026-11-04&s=TESTA:BCBA'),
        w.pedir('cierres', '?fecha=2026-11-04&s=TESTLETRA:BCBA'),
      ]);
      expect(rs.map(r => r.status)).toEqual([200, 200, 200]);
      expect(w.ll.token).toBe(1);
    });
  });

  test('IOL caído o login rechazado: 502 con mensaje, sin 200 vacío', async () => {
    const w = armar();
    await conReloj(async () => {
      w.ll.tokenStatus = 401;
      const r = await w.pedir('operaciones', '?desde=2026-11-04');
      expect(r.status).toBe(502);
      const j = await r.json();
      expect(j.error).toBe('iol_unavailable');
      expect(j.message).toContain('login IOL falló (HTTP 401)');
      expect(j.message).not.toMatch(/acc-|clave|Bearer/);
    });
  });

  test('cierres: toma el último precio del día pedido, null si no hay barra; un día pasado queda guardado, el de hoy no', async () => {
    const w = armar();
    await conReloj(async () => {
      const r = await w.pedir('cierres', '?fecha=2026-11-04&s=TESTA:BCBA,TESTLETRA:BCBA,SINDATO:BCBA');
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.fecha).toBe('2026-11-04');
      expect(j.cierres).toEqual({ TESTA: 1234.5, TESTLETRA: 121.25, SINDATO: null });
      expect(j.fallidos).toBe(0);
      expect(w.ll.urls.find(u => u.includes('TESTA'))).toBe('https://api.invertironline.com/api/v2/BCBA/Titulos/TESTA/Cotizacion/seriehistorica/2026-11-04/2026-11-05/sinAjustar');
      const antes = w.ll.urls.length;
      await w.pedir('cierres', '?fecha=2026-11-04&s=TESTA:BCBA,TESTLETRA:BCBA,SINDATO:BCBA');
      // Los dos con precio salen de lo guardado; el que no tenía barra se vuelve a consultar (podría aparecer más tarde).
      expect(w.ll.urls.length - antes).toBe(1);
      expect(w.ll.urls.slice(antes)[0]).toContain('SINDATO');
    });
    // Hoy (10/11) todavía puede ser intradía: no se guarda.
    const w2 = armar();
    await conReloj(async () => {
      await w2.pedir('cierres', '?fecha=2026-11-10&s=TESTA:BCBA');
      const n = w2.ll.urls.length;
      await w2.pedir('cierres', '?fecha=2026-11-10&s=TESTA:BCBA');
      expect(w2.ll.urls.length).toBe(n + 1);
    });
  });

  test('mercado: MEP (con el valor actual más nuevo de dolarapi), SPY con cierre ajustado, IPC y CPI; se guarda 10 min', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      const r = await w.pedir('mercado', '?desde=2026-11-04');
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.errores).toEqual({});
      expect(j.mep.serie.map(x => x.fecha)).toEqual(['2026-11-04', '2026-11-09']); // 20/10 queda fuera: es anterior a 7 días antes de la base
      expect(j.mep.actual).toEqual({ fecha: '2026-11-10', venta: 1060 });
      expect(j.spy).toEqual([{ fecha: '2026-11-04', close: 500, adj: 500 }, { fecha: '2026-11-06', close: 510, adj: 511 }]);
      expect(j.ipc).toEqual([{ mes: '2026-08', pct: 1.7 }, { mes: '2026-09', pct: 1.9 }]);
      expect(j.cpi).toEqual([{ mes: '2026-08', nivel: 334.98 }, { mes: '2026-09', nivel: 336.94 }]); // el mes sin dato ('.') se omite
      const n = w.ll.urls.length;
      await w.pedir('mercado', '?desde=2026-11-04');
      expect(w.ll.urls.length).toBe(n);
      reloj.t += 11 * 60_000;
      await w.pedir('mercado', '?desde=2026-11-04');
      expect(w.ll.urls.length).toBeGreaterThan(n);
    });
    expect(w.ll.token).toBe(0); // no usa IOL
  });

  test('mercado: si una fuente falla se informa en errores, las demás llegan y no se guarda en la caché', async () => {
    const w = armar();
    await conReloj(async () => {
      w.ll.ipcFalla = true;
      const j = await (await w.pedir('mercado', '?desde=2026-11-04')).json();
      expect(j.ipc).toBeNull();
      expect(j.errores.ipc).toContain('HTTP 503');
      expect(j.mep.serie.length).toBe(2);
      w.ll.ipcFalla = false;
      const j2 = await (await w.pedir('mercado', '?desde=2026-11-04')).json();
      expect(j2.errores).toEqual({});
      expect(j2.ipc.length).toBe(2);
    });
  });

  test('/cartera sigue funcionando igual con el Worker nuevo (misma ruta, mismo gate)', async () => {
    const w = armar();
    const r = await w.worker.fetch(new Request(`${ORIGEN}/cartera`, { headers: {} }), w.env);
    expect(r.status).toBe(401);
  });
});
