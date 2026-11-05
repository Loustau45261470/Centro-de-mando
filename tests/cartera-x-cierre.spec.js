'use strict';
// La X de cierre (.cm-ov-close) no tapa ningún botón de Cartera en el celu (390px), en ninguna pestaña, ni en reposo ni scrolleado.
// Antes del arreglo: Actualizar (Mis tenencias / Rendimiento), + Empresa y ↻ (Radar) pasaban por debajo de la X al scrollear y un toque ahí cerraba la pantalla.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/fixtures');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cartera-tenencias.json'), 'utf8'));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-expose-headers': 'x-cartera-fuente' };
const BASE_JSON = { fecha: '2026-11-04', tomadoEn: '2026-11-04T15:00:00Z', nota: 'x',
  posiciones: [{ simbolo: 'TESTA', mercado: 'BCBA', tipo: 'CEDEARS', cantidad: 100, precioIntradia: 990 }], efectivo: { ARS: 50000, USD: 0 } };
const MERCADO = { mep: { serie: [{ fecha: '2026-11-04', venta: 1000 }], actual: { fecha: '2026-12-04', venta: 1250 } }, spy: [], ipc: [], cpi: [], errores: {} };

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('ningún botón de ninguna pestaña de Cartera queda debajo de la X (reposo y scrolleado)', async ({ cmPage: page }) => {
  test.setTimeout(120000);
  await page.route('**/cdm-push-worker.tobiasloustau11.workers.dev/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const u = new URL(req.url());
    const json = (b) => r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(b) });
    if (u.pathname === '/datos/tenencias.json') return json(FIX);
    if (u.pathname === '/datos/rendimiento-base.json') return json(BASE_JSON);
    if (u.pathname === '/rendimiento/operaciones') return json({ operaciones: [], efectivo: { ARS: { disponible: 1, saldo: 1 }, USD: { disponible: 0, saldo: 0 } }, comisionesPendientes: 0 });
    if (u.pathname === '/rendimiento/cierres') return json({ cierres: { TESTA: 1000 }, fallidos: 0 });
    if (u.pathname === '/rendimiento/mercado') return json(MERCADO);
    if (u.pathname === '/datos/fund-index.json') return json({ v: 1, empresas: {} });
    return json({ generado: '2026-12-04T15:00:00Z', tenencias: FIX.tenencias.map(({ lotes, ...t }) => t), totales: { valorizado: 1 } });
  });
  await page.evaluate(() => {
    _auth.currentUser.getIdToken = async () => 'token';
    S.accounts = [{ id: 'inv', name: 'Inversiones', type: 'invest', balance: 1000, currency: 'ARS', icon: '📈' }];
    S.transactions = []; S.moves = []; S.carteraTx = []; S.rendimientoFlujos = []; S.radar = { items: [] };
  });
  await page.evaluate(() => CarteraOverlay.open());
  await page.waitForTimeout(800);
  const out = [];
  for (const t of ['tenencias', 'analisis', 'historial', 'rendimiento', 'radar']) {
    await page.evaluate((t) => CarteraOverlay._tab(t), t);
    await page.waitForTimeout(1200);
    const res = await page.evaluate(async () => {
      const body = document.querySelector('#ov-cartera .cm-ov-body');
      const x = document.querySelector('#ov-cartera .cm-ov-close').getBoundingClientRect();
      const pane = [...document.querySelectorAll('#ov-cartera .plov-pane')].find((p) => !p.hidden);
      const medir = () => {
        const hits = [];
        for (const b of pane.querySelectorAll('button, a, select, input')) {
          const r0 = b.getBoundingClientRect(); const bb = body.getBoundingClientRect();
          const r = { left: r0.left, right: r0.right, top: Math.max(r0.top, bb.top), bottom: Math.min(r0.bottom, bb.bottom), width: r0.width, height: r0.height };
          if (!r.width || !r.height || r.bottom <= r.top) continue;
          const w = Math.min(r.right, x.right) - Math.max(r.left, x.left), h = Math.min(r.bottom, x.bottom) - Math.max(r.top, x.top);
          if (w > 0 && h > 0) hits.push({ el: (b.className || b.tagName).toString().slice(0, 30), txt: (b.textContent || '').trim().slice(0, 14), area: Math.round(w * h), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
        }
        return hits;
      };
      const rest = medir();
      const act = pane.querySelector('.ten-act-btn, .rnd-act, .rd-refrescar');
      const actR = act && act.getBoundingClientRect();
      const scrolled = [];
      const max = body.scrollHeight - body.clientHeight;
      for (let y = 0; y <= max; y += 60) { body.scrollTop = y; await new Promise((r) => setTimeout(r, 30)); const h = medir(); if (h.length) scrolled.push({ y, h }); }
      body.scrollTop = 0;
      return { X: { l: Math.round(x.left), t: Math.round(x.top), r: Math.round(x.right), b: Math.round(x.bottom) }, max, act: actR && { l: Math.round(actR.left), t: Math.round(actR.top), r: Math.round(actR.right), b: Math.round(actR.bottom), txt: act.textContent.trim() }, rest, scrolledHits: scrolled.length, ejemplo: scrolled.slice(0, 2) };
    });
    out.push({ tab: t, ...res });
  }
  if (process.env.ZZ_OUT) fs.writeFileSync(process.env.ZZ_OUT, JSON.stringify(out, null, 1));
  for (const o of out) { expect(o.rest, 'reposo ' + o.tab).toEqual([]); expect(o.ejemplo, 'scrolleado ' + o.tab).toEqual([]); expect(o.scrolledHits, 'scrolleado ' + o.tab).toBe(0); }
  expect(out.filter((o) => o.max > 0).length).toBeGreaterThanOrEqual(3);   // que de verdad haya contenido para scrollear
});
