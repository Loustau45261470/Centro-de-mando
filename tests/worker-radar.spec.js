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

  const ll = { yahoo: [], github: [], precios: { NVDA: 140.5, MELI: 2000 }, noExiste: ['ZZZZ'], yahooCae: [], ghDispatch: 204, ghRama: 'main',
    rep: { lista: null, sha: 0, conflictos: 0, putStatus: 200, contenido: null } }; // reportes.json simulado: lista=null -> el archivo no existe
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
      if (u.endsWith('/contents/reportes.json')) {
        const m = (init && init.method) || 'GET';
        const R = ll.rep;
        if (m === 'GET') {
          if (R.contenido !== null) return json({ sha: 'sha' + R.sha, content: R.contenido });
          if (R.lista === null) return json({ message: 'Not Found' }, 404);
          return json({ sha: 'sha' + R.sha, content: Buffer.from(JSON.stringify(R.lista, null, 1), 'utf8').toString('base64').replace(/(.{60})/g, '$1\n') });
        }
        const b = JSON.parse(init.body);
        if (R.putStatus !== 200) return json({ message: 'x' }, R.putStatus);
        if (R.conflictos > 0) { R.conflictos--; R.sha++; return json({ message: 'conflict' }, 409); }
        if (R.lista !== null && b.sha !== 'sha' + R.sha) return json({ message: 'sha mismatch' }, 409);
        R.lista = JSON.parse(Buffer.from(b.content, 'base64').toString('utf8')); R.sha++;
        return json({ content: { sha: 'sha' + R.sha } }, R.lista.length === 1 ? 201 : 200);
      }
      if (/\/actions\/workflows\/radar-datos\.yml\/dispatches$/.test(u)) return ll.ghDispatch === 204 ? new Response(null, { status: 204 }) : json({ message: 'x' }, ll.ghDispatch);
    }
    throw new Error('fetch inesperado: ' + u);
  };

  const { worker, CarteraGate } = new Function('caches', 'fetch', 'console', src)(caches, fetchFalso, { error() {}, warn() {}, log() {} });
  const env = { OWNER_UID: OWNER, GH_DATA_TOKEN: 'ghp_secreto_de_prueba', DATOS_REPO: 'Loustau45261470/centro-de-mando-datos' };
  const gate = new CarteraGate({ storage }, env);
  env.CARTERA = { idFromName(n) { return n; }, get() { return { fetch: (url, init) => gate.fetch(new Request(url, init)) }; } };
  const pedir = (ruta, { qs = '', tok = 'tok-owner', metodo, body, e } = {}) => worker.fetch(
    new Request(`${ORIGEN}/radar/${ruta}${qs}`, {
      method: metodo || (ruta === 'pedir' || ruta === 'reportar' ? 'POST' : 'GET'),
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
    expect(disp[0].url).toBe('https://api.github.com/repos/Loustau45261470/centro-de-mando-datos/actions/workflows/radar-datos.yml/dispatches');
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
      expect(j.message).toContain('radar-datos.yml');
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

  const REP = { ticker: 'zzta', kpi_id: 'margen_op', trimestre: '2026-09-30', valor_mostrado: '31,2%', comentario: 'Dato inventado: no coincide con el comunicado.' };

  test('reportar: crea reportes.json con la entrada completa, id determinístico y estado en_revision (el ticker pasa a mayúsculas)', async () => {
    const w = armar();
    await conReloj(async () => {
      const r = await w.pedir('reportar', { body: REP });
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.ok).toBe(true);
      expect(j.duplicado).toBe(false);
      expect(j.reporte).toEqual({
        id: 'ZZTA:margen_op:2026-09-30', ticker: 'ZZTA', kpi_id: 'margen_op', trimestre: '2026-09-30', valor_mostrado: '31,2%',
        comentario: 'Dato inventado: no coincide con el comunicado.', estado: 'en_revision', reportado_en: new Date(AHORA).toISOString(), resuelto_en: null, resolucion: null,
      });
      expect(JSON.stringify(j)).not.toContain('ghp_');
      expect(w.ll.rep.lista).toEqual([j.reporte]);
    });
    const puts = w.ll.github.filter(g => g.metodo === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toBe('https://api.github.com/repos/Loustau45261470/centro-de-mando-datos/contents/reportes.json');
    expect(puts[0].body.sha).toBeUndefined(); // archivo nuevo: sin sha
    expect(puts[0].headers.Authorization).toBe('Bearer ghp_secreto_de_prueba');
  });

  test('reportar: agrega al final de un reportes.json existente (con tildes) usando el sha leído, sin tocar lo anterior', async () => {
    const w = armar();
    const previo = { id: 'AAAA:roic:2026-06-30', ticker: 'AAAA', kpi_id: 'roic', trimestre: '2026-06-30', valor_mostrado: '12%', comentario: 'Número raro: ñandú', estado: 'confirmado', reportado_en: '2026-10-01T10:00:00.000Z', resuelto_en: '2026-10-02T10:00:00.000Z', resolucion: 'ok' };
    w.ll.rep.lista = [previo]; w.ll.rep.sha = 7;
    await conReloj(async () => {
      expect((await w.pedir('reportar', { body: REP })).status).toBe(200);
    });
    expect(w.ll.rep.lista).toHaveLength(2);
    expect(w.ll.rep.lista[0]).toEqual(previo);
    expect(w.ll.rep.lista[1].id).toBe('ZZTA:margen_op:2026-09-30');
    expect(w.ll.github.find(g => g.metodo === 'PUT').body.sha).toBe('sha7');
  });

  test('reportar: duplicado en revisión devuelve el existente y no escribe; si el anterior ya se resolvió, se agrega uno nuevo con id #2', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      const a = await (await w.pedir('reportar', { body: REP })).json();
      reloj.t += 60_000;
      const b = await w.pedir('reportar', { body: Object.assign({}, REP, { comentario: 'otro texto', valor_mostrado: '99' }) });
      expect(b.status).toBe(200);
      const jb = await b.json();
      expect(jb.duplicado).toBe(true);
      expect(jb.reporte).toEqual(a.reporte);
      expect(w.ll.github.filter(g => g.metodo === 'PUT')).toHaveLength(1);
      expect(w.ll.rep.lista).toHaveLength(1);
      w.ll.rep.lista[0].estado = 'corregido'; // lo resolvió el job
      const c = await (await w.pedir('reportar', { body: REP })).json();
      expect(c.duplicado).toBe(false);
      expect(c.reporte.id).toBe('ZZTA:margen_op:2026-09-30#2');
      expect(w.ll.rep.lista.map(x => x.estado)).toEqual(['corregido', 'en_revision']);
    });
  });

  test('reportar: validación -> 400 bad_param sin tocar GitHub (ticker, kpi_id, trimestre, valor, comentario > 500, body vacío)', async () => {
    const w = armar();
    const malos = [
      {}, null, [], Object.assign({}, REP, { ticker: 'no valido' }), Object.assign({}, REP, { ticker: 1 }), Object.assign({}, REP, { kpi_id: 'a:b' }),
      Object.assign({}, REP, { kpi_id: '' }), Object.assign({}, REP, { kpi_id: 'x'.repeat(65) }), Object.assign({}, REP, { trimestre: '../x' }), Object.assign({}, REP, { trimestre: undefined }),
      Object.assign({}, REP, { valor_mostrado: '' }), Object.assign({}, REP, { valor_mostrado: 'v'.repeat(61) }), Object.assign({}, REP, { valor_mostrado: { a: 1 } }),
      Object.assign({}, REP, { comentario: 'c'.repeat(501) }), Object.assign({}, REP, { comentario: 5 }),
    ];
    for (const body of malos) {
      const r = await w.pedir('reportar', { body: body === null ? undefined : body });
      expect([JSON.stringify(body), r.status]).toEqual([JSON.stringify(body), 400]);
      expect((await r.json()).error).toBe('bad_param');
    }
    expect(w.ll.github).toEqual([]);
    // límites exactos aceptados: comentario de 500 y valor numérico (se guarda como texto); el comentario es opcional
    const ok = await w.pedir('reportar', { body: { ticker: 'AB', kpi_id: 'k', trimestre: 't', valor_mostrado: 12.5, comentario: 'c'.repeat(500) } });
    expect(ok.status).toBe(200);
    const sinCom = await (await w.pedir('reportar', { body: { ticker: 'AB', kpi_id: 'k2', trimestre: 't', valor_mostrado: '1' } })).json();
    expect(sinCom.reporte.comentario).toBe('');
    expect(w.ll.rep.lista[0].valor_mostrado).toBe('12.5');
    // kpi_id de hasta 64 caracteres (los ids largos del config, como el de apalancamiento operativo, entran enteros, sin recorte)
    for (const kpi of ['apalancamiento_operativo_gastos_operativos_vs_ingresos', 'k'.repeat(64)]) {
      const largo = await w.pedir('reportar', { body: { ticker: 'AB', kpi_id: kpi, trimestre: '2026-09-30', valor_mostrado: '1' } });
      expect(largo.status).toBe(200);
      expect((await largo.json()).reporte.id).toBe('AB:' + kpi + ':2026-09-30');
    }
  });

  test('reportar: límite de 20 por día (el 21 da 429 limite_diario sin escribir) y se renueva al día siguiente; los duplicados no gastan cupo', async () => {
    const w = armar();
    await conReloj(async (reloj) => {
      for (let i = 1; i <= 20; i++) {
        const r = await w.pedir('reportar', { body: Object.assign({}, REP, { kpi_id: 'k' + i }) });
        expect([i, r.status]).toEqual([i, 200]);
      }
      const dup = await (await w.pedir('reportar', { body: Object.assign({}, REP, { kpi_id: 'k3' }) })).json();
      expect(dup.duplicado).toBe(true);
      const r21 = await w.pedir('reportar', { body: Object.assign({}, REP, { kpi_id: 'k21' }) });
      expect(r21.status).toBe(429);
      expect((await r21.json()).error).toBe('limite_diario');
      expect(w.ll.rep.lista).toHaveLength(20);
      reloj.t += 24 * 3600 * 1000;
      expect((await w.pedir('reportar', { body: Object.assign({}, REP, { kpi_id: 'k21' }) })).status).toBe(200);
      expect(w.ll.rep.lista).toHaveLength(21);
    });
  });

  test('reportar: auth idéntica al resto (sin token 401, otro uid 403, GET 405, sin GH_DATA_TOKEN 500) y no toca GitHub', async () => {
    const w = armar();
    const sin = await w.pedir('reportar', { body: REP, tok: null });
    expect(sin.status).toBe(401);
    expect((await sin.json()).error).toBe('unauthorized');
    expect((await w.pedir('reportar', { body: REP, tok: 'tok-malo' })).status).toBe(401);
    expect((await w.pedir('reportar', { body: REP, tok: 'tok-otro' })).status).toBe(403);
    expect((await w.pedir('reportar', { metodo: 'GET' })).status).toBe(405);
    const sinTok = await w.pedir('reportar', { body: REP, e: { OWNER_UID: OWNER, CARTERA: w.env.CARTERA } });
    expect(sinTok.status).toBe(500);
    expect((await sinTok.json()).error).toBe('missing_gh_token');
    expect(w.ll.github).toEqual([]);
  });

  test('reportar: conflicto 409 de GitHub -> relee y reintenta una vez (y guarda sin duplicar); dos 409 seguidos dan 409 conflicto', async () => {
    const w = armar();
    w.ll.rep.lista = []; w.ll.rep.sha = 1; w.ll.rep.conflictos = 1;
    await conReloj(async () => {
      const r = await w.pedir('reportar', { body: REP });
      expect(r.status).toBe(200);
      expect((await r.json()).duplicado).toBe(false);
      expect(w.ll.rep.lista).toHaveLength(1);
      const puts = w.ll.github.filter(g => g.metodo === 'PUT');
      expect(puts).toHaveLength(2);
      expect(puts[0].body.sha).toBe('sha1');
      expect(puts[1].body.sha).toBe('sha2'); // releyó el sha nuevo
      expect(w.ll.github.filter(g => g.metodo === 'GET' && g.url.endsWith('reportes.json'))).toHaveLength(2);
      w.ll.rep.conflictos = 2;
      const f = await w.pedir('reportar', { body: Object.assign({}, REP, { kpi_id: 'otro' }) });
      expect(f.status).toBe(409);
      expect((await f.json()).error).toBe('conflicto');
      expect(w.ll.rep.lista).toHaveLength(1);
    });
  });

  test('reportar: errores de GitHub (sin permiso 403, token 401, reportes.json corrupto) dan 502 con código propio, no consumen cupo y no pisan el archivo', async () => {
    const w = armar();
    await conReloj(async () => {
      w.ll.rep.putStatus = 403;
      const r = await w.pedir('reportar', { body: REP });
      expect(r.status).toBe(502);
      const j = await r.json();
      expect(j.error).toBe('github_permiso');
      expect(j.message).toContain('Contents: Read and write');
      w.ll.rep.putStatus = 401;
      expect((await (await w.pedir('reportar', { body: REP })).json()).error).toBe('github_token');
      w.ll.rep.putStatus = 200;
      w.ll.rep.contenido = Buffer.from('{"no":"es lista"}').toString('base64');
      const c = await w.pedir('reportar', { body: REP });
      expect(c.status).toBe(502);
      expect((await c.json()).error).toBe('reportes_ilegible');
      expect(w.ll.github.filter(g => g.metodo === 'PUT')).toHaveLength(2); // solo los dos intentos con 403/401; el corrupto no escribió
      w.ll.rep.contenido = null;
      expect((await w.pedir('reportar', { body: REP })).status).toBe(200); // los fallos no gastaron cupo
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
