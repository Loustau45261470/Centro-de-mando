// Crosshair HUD del gráfico de patrimonio: se engancha solo a días (1S), semanas (1M) o meses (3M/6M/9M/12M/Todo).
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const OUT = process.env.XH_SHOTS || '';

const GRAN = { '1S': 'd', '1M': 'w', '3M': 'm', '6M': 'm', '12M': 'm', all: 'm' };

test('crosshair: engancha por día / semana / mes según el rango', async ({ cmPage, browserName }, info) => {
  test.setTimeout(120000);
  await cmPage.evaluate((dias) => {
    const hoy = new Date(getActiveDate() + 'T00:00:00Z'), nw = [];
    for (let i = dias - 1; i >= 0; i--) { const d = new Date(hoy); d.setUTCDate(d.getUTCDate() - i); nw.push({ date: d.toISOString().slice(0, 10), value: 1000 + (dias - i) * 3 + Math.sin(i / 5) * 40 }); }
    S.nwHistory = nw; try { localStorage.removeItem('cm_nw_range'); } catch (e) {}
  }, 400);
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  await cmPage.waitForFunction(() => typeof nwLineInst !== 'undefined' && nwLineInst);
  const cv = cmPage.locator('#nwLineChart');
  for (const r of Object.keys(GRAN)) {
    await cmPage.click(`#nwRangeSeg button[data-range="${r}"]`);
    await cv.scrollIntoViewIfNeeded(); await cmPage.waitForTimeout(250);
    const box = await cv.boundingBox();
    await cmPage.evaluate(() => { window.__xh = []; nwLineInst.canvas.addEventListener('pointermove', () => { const m = nwLineInst._nwXh; if (m.sel != null) window.__xh.push(m.anchors[m.sel].k); }); });
    for (let k = 0; k <= 30; k++) await cmPage.mouse.move(box.x + 4 + (box.width - 8) * k / 30, box.y + box.height / 2);
    const visto = [...new Set(await cmPage.evaluate(() => window.__xh))];
    const n = await cmPage.evaluate(() => nwLineInst._nwXh.anchors.length);
    if (r === '1S') { expect(n).toBe(7); visto.forEach(k => expect(k).toMatch(/^\d{4}-\d\d-\d\d$/)); }
    if (r === '1M') { expect(n).toBeGreaterThanOrEqual(4); expect(n).toBeLessThanOrEqual(6); visto.forEach(k => expect(new Date(k + 'T00:00:00Z').getUTCDay()).toBe(1)); }   // lunes
    if (r !== '1S' && r !== '1M') visto.forEach(k => expect(k).toMatch(/^\d{4}-\d\d$/));
    expect(visto.length).toBe(n);   // recorriendo todo el ancho se pasa por todas las anclas, ninguna de más
    console.log(`[${info.project.name}] ${r}: ${n} anclas -> ${visto.join(' ')}`);
    if (OUT) { await cmPage.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2); await cmPage.locator('#tab-finanzas').screenshot({ path: `${OUT}/${info.project.name}-${r}.png` }); }
  }
  await cmPage.mouse.move(0, 0);
  expect(await cmPage.evaluate(() => nwLineInst._nwXh.sel)).toBeNull();
});
