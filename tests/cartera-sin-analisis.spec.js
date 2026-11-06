// La pestaña "Análisis mensual" ya no existe en Cartera: el overlay abre con las otras cuatro, un nombre viejo ('analisis') cae en
// la pestaña por defecto, no queda ni el panel ni el script, y no hay errores de consola ni pedidos a cartera-inversion.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/fixtures');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cartera-tenencias.json'), 'utf8'));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-expose-headers': 'x-cartera-fuente' };

async function abrir(page) {
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const u = new URL(req.url());
    const json = (b) => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(b) });
    if (u.pathname === '/datos/tenencias.json') return json(FIX);
    if (u.pathname === '/datos/fund-index.json') return json({ v: 1, empresas: {} });
    return json({ generado: '2026-12-04T15:00:00Z', tenencias: FIX.tenencias.map(({ lotes, ...t }) => t), totales: { valorizado: 1 } });
  });
  await page.evaluate(() => {
    _auth.currentUser.getIdToken = async () => 'token';
    S.accounts = [{ id: 'inv', name: 'Inversiones', type: 'invest', balance: 1000, currency: 'ARS', icon: '📈' }];
    S.transactions = []; S.moves = []; S.carteraTx = []; S.rendimientoFlujos = []; S.radar = { items: [] };
  });
  await page.evaluate(() => CarteraOverlay.open());
  await expect(page.locator('#ov-cartera .plov-tab').first()).toBeVisible();
}

const visibles = (page) => page.$$eval('#ov-cartera .plov-pane', (ps) => ps.filter((p) => !p.hidden).map((p) => p.id));

test.describe('Cartera sin la pestaña Análisis mensual', () => {
  test('abre con cuatro pestañas, sin la de análisis, y las demás cambian de panel', async ({ cmPage: page, consoleErrors }) => {
    const pedidos = [];
    page.on('request', (rq) => { if (/cartera-inversion/.test(rq.url())) pedidos.push(rq.url()); });
    await abrir(page);
    const tabs = await page.$$eval('#ov-cartera .plov-tab', (els) => els.map((e) => ({ t: e.dataset.t, txt: e.textContent.trim() })));
    expect(tabs.map((t) => t.t)).toEqual(['tenencias', 'historial', 'rendimiento', 'radar']);
    expect(tabs.map((t) => t.txt)).not.toContain('Análisis mensual');
    await expect(page.locator('#cov-pane-analisis')).toHaveCount(0);
    expect(await visibles(page)).toEqual(['cov-pane-tenencias']);
    for (const t of ['historial', 'rendimiento', 'radar', 'tenencias']) {
      await page.locator(`#ov-cartera .plov-tab[data-t="${t}"]`).click();
      expect(await visibles(page)).toEqual([`cov-pane-${t}`]);
      await expect(page.locator(`#ov-cartera .plov-tab[data-t="${t}"]`)).toHaveAttribute('aria-selected', 'true');
    }
    expect(await page.evaluate(() => typeof window.CarteraInversion)).toBe('undefined');
    expect(pedidos).toEqual([]);
    expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test("un nombre viejo ('analisis') cae en la pestaña por defecto", async ({ cmPage: page, consoleErrors }) => {
    await abrir(page);
    await page.locator('#ov-cartera .plov-tab[data-t="historial"]').click();
    await page.evaluate(() => CarteraOverlay._tab('analisis'));
    expect(await visibles(page)).toEqual(['cov-pane-tenencias']);
    expect(await page.$eval('#ov-cartera .plov-tabs', (e) => e.dataset.on)).toBe('tenencias');
    await expect(page.locator('#ov-cartera .plov-tab[data-t="tenencias"]')).toHaveAttribute('aria-selected', 'true');
    expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test('el shell no lista ni carga cartera-inversion.js', async () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    expect(html).not.toContain('cartera-inversion');
    expect(sw).not.toContain('cartera-inversion');
    expect(fs.existsSync(path.join(__dirname, '..', 'cartera-inversion.js'))).toBe(false);
  });
});
