// Patrimonio ← Cartera: las cuentas "Acciones" y "Bonos" toman solas el total real de la cartera
// (botón Actualizar + una vez por día al arrancar). Todo mockeado: nunca se toca el Worker real ni IOL.
'use strict';
const { test, expect } = require('./support/fixtures');

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-expose-headers': 'x-cartera-fuente' };
const t = (simbolo, tipo, valorizado) => ({ simbolo, descripcion: simbolo, tipo, cantidad: 1, comprometido: 0, precio: valorizado, variacionDiariaPct: 0, valorizado, ppc: valorizado, rendimientoPct: 0, rendimientoMonto: 0 });
const TENENCIAS = [t('A1', 'CEDEARS', 100000.555), t('A2', 'ACCIONES', 50000), t('B1', 'TIT. PUBLICOS', 30000), t('B2', 'LETRAS', 20000), t('B3', 'ONS', 10000), t('O1', 'FCI', 7777)];
const resp = (generado, tenencias = TENENCIAS) => ({ generado, tenencias, totales: { valorizado: 0, variacionPct: null } });
// Acciones = 150000.56 (100000.555 + 50000 redondeado), Bonos = 60000, Otros no suma.
const ACC = 150000.56, BON = 60000;

async function preparar(page, { cuentas, normal = resp('2026-11-25T12:00:00Z'), fresh = resp('2026-11-25T15:00:00Z') } = {}) {
  const ctl = { llamadas: [], normal: { status: 200, body: normal }, fresh: { status: 200, body: fresh } };
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/datos/')) return r.fulfill({ status: 404, contentType: 'application/json', headers: CORS, body: '{}' });
    const f = new URL(req.url()).searchParams.get('fresh') === '1';
    ctl.llamadas.push(f ? 'fresh' : 'normal');
    const x = f ? ctl.fresh : ctl.normal;
    return r.fulfill({ status: x.status, contentType: 'application/json', headers: CORS, body: JSON.stringify(x.body) });
  });
  await page.evaluate((c) => {
    _auth.currentUser.getIdToken = async () => 'token-de-prueba';
    Object.defineProperty(navigator, 'webdriver', { get: () => false });   // habilita el disparo diario (en tests está apagado)
    localStorage.removeItem('cdm_carteraSyncDia');
    S.accounts = JSON.parse(JSON.stringify(c));
    S.nwHistory = [];
    window.__saves = 0;
    const orig = saveState;
    saveState = function () { window.__saves++; return orig.apply(this, arguments); };
  }, cuentas || [
    { id: 'a', name: '  ACCIONES ', type: 'invest', balance: 1, currency: 'ARS', icon: '📈' },
    { id: 'b', name: 'Bónos', type: 'invest', balance: 2, currency: 'ARS', icon: '🏛️' },
    { id: 'c', name: 'Ualá', type: 'bank', balance: 300, currency: 'ARS', icon: '🏦' },
  ]);
  return ctl;
}
const saldo = (page, id) => page.evaluate((i) => (S.accounts.find((a) => a.id === i) || {}).balance, id);
const saves = (page) => page.evaluate(() => window.__saves);
const diario = (page) => page.evaluate(() => Tenencias.syncPatrimonioDiario());
const abrirCartera = async (page) => {
  await page.evaluate(() => CarteraOverlay.open());
  await expect(page.locator('#cov-pane-tenencias .ten-row[data-simbolo]').first()).toBeVisible();
};

test.describe('Patrimonio se actualiza desde Cartera', () => {
  test('(a)(h)(i) Actualizar: Acciones y Bonos toman los totales (Otros no suma) y queda el punto del día', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    await abrirCartera(page);
    await page.locator('#cov-pane-tenencias .ten-act-btn').click();
    await expect.poll(() => saldo(page, 'a')).toBe(ACC);
    expect(await saldo(page, 'b')).toBe(BON);
    expect(await saldo(page, 'c')).toBe(300);
    expect(await page.evaluate(() => S.accounts.map((a) => a.fuente || null))).toEqual(['cartera:acciones', 'cartera:bonos', null]);
    const hist = await page.evaluate(() => ({ nw: S.nwHistory.length, today: S.nwHistory[0] && S.nwHistory[0].date === getActiveDate(), acc: S.accountHistory.filter((h) => h.accountId === 'a').map((h) => h.balance) }));
    expect(hist.nw).toBe(1); expect(hist.today).toBe(true); expect(hist.acc).toEqual([ACC]);
    expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('(b) abrir Cartera sin Actualizar no cambia Patrimonio', async ({ cmPage: page }) => {
    await preparar(page);
    await abrirCartera(page);
    await page.waitForTimeout(500);
    expect(await saldo(page, 'a')).toBe(1);
    expect(await saldo(page, 'b')).toBe(2);
    expect(await saves(page)).toBe(0);
  });

  test('(c)(j) arranque del día: falla de red no marca el día; luego actualiza una vez y no vuelve a pedir', async ({ cmPage: page }) => {
    const ctl = await preparar(page);
    ctl.normal = { status: 500, body: { error: 'x' } };
    await diario(page);
    expect(ctl.llamadas).toEqual(['normal']);
    expect(await page.evaluate(() => localStorage.getItem('cdm_carteraSyncDia'))).toBeNull();
    expect(await saldo(page, 'a')).toBe(1);

    ctl.normal = { status: 200, body: resp('2026-11-25T12:00:00Z') };
    await diario(page);
    expect(ctl.llamadas).toEqual(['normal', 'normal']);
    expect(await saldo(page, 'a')).toBe(ACC);
    expect(await saldo(page, 'b')).toBe(BON);
    expect(await page.evaluate(() => localStorage.getItem('cdm_carteraSyncDia') === getActiveDate())).toBe(true);

    await diario(page);   // segundo arranque el mismo día
    expect(ctl.llamadas).toHaveLength(2);
  });

  test('(d) un dato más viejo (generado anterior) no pisa al más nuevo', async ({ cmPage: page }) => {
    await preparar(page);
    await page.evaluate((x) => { syncCuentasDesdeCartera({ acciones: 500, bonos: 600 }, '2026-11-25T15:00:00Z'); }, null);
    expect(await saldo(page, 'a')).toBe(500);
    await page.evaluate(() => syncCuentasDesdeCartera({ acciones: 111, bonos: 222 }, '2026-11-25T09:00:00Z'));
    expect(await saldo(page, 'a')).toBe(500);
    expect(await saldo(page, 'b')).toBe(600);
    await page.evaluate(() => syncCuentasDesdeCartera({ acciones: 700, bonos: 800 }, '2026-11-25T16:00:00Z'));
    expect(await saldo(page, 'a')).toBe(700);
  });

  test('(e) sin cambio de monto no se guarda nada', async ({ cmPage: page }) => {
    await preparar(page);
    await page.evaluate(() => syncCuentasDesdeCartera({ acciones: 500, bonos: 600 }, '2026-11-25T15:00:00Z'));
    const antes = await saves(page);
    expect(antes).toBe(1);
    await page.evaluate(() => syncCuentasDesdeCartera({ acciones: 500, bonos: 600.001 }, '2026-11-25T16:00:00Z'));
    expect(await saves(page)).toBe(antes);
  });

  test('(f) renombrar la cuenta después mantiene el vínculo', async ({ cmPage: page }) => {
    await preparar(page);
    await page.evaluate(() => syncCuentasDesdeCartera({ acciones: 500, bonos: 600 }, '2026-11-25T15:00:00Z'));
    await page.evaluate(() => { S.accounts.find((a) => a.id === 'a').name = 'Mi broker'; });
    await page.evaluate(() => syncCuentasDesdeCartera({ acciones: 900, bonos: 600 }, '2026-11-25T16:00:00Z'));
    expect(await saldo(page, 'a')).toBe(900);
    expect(await page.evaluate(() => S.accounts.length)).toBe(3);
  });

  test('(g) sin cuentas Acciones/Bonos no crea nada ni guarda', async ({ cmPage: page }) => {
    await preparar(page, { cuentas: [{ id: 'c', name: 'Ualá', type: 'bank', balance: 300, currency: 'ARS', icon: '🏦' }] });
    await page.evaluate(() => syncCuentasDesdeCartera({ acciones: 500, bonos: 600 }, '2026-11-25T15:00:00Z', { manual: true }));
    expect(await page.evaluate(() => S.accounts.length)).toBe(1);
    expect(await saldo(page, 'c')).toBe(300);
    expect(await saves(page)).toBe(0);
  });

  test('totalesPorGrupo: acciones = CEDEARS+ACCIONES, bonos = TIT/LETRAS/ONS, redondeo a 2 decimales', async ({ cmPage: page }) => {
    const r = await page.evaluate((ten) => Tenencias.totalesPorGrupo({ tenencias: ten }), TENENCIAS);
    expect(r).toEqual({ acciones: ACC, bonos: BON });
    expect(await page.evaluate(() => Tenencias.totalesPorGrupo(null))).toEqual({ acciones: 0, bonos: 0 });
  });
});
