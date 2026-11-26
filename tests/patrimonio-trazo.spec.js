// Gráfico de patrimonio con «trazo vivo» (propuesta #6): la luz recorre la línea sola, la línea se dibuja
// al entrar, la punta late, sin puntos sobre la línea, cartel con ▲/▼. La animación se pausa con el gráfico
// fuera de pantalla o la pestaña oculta, y no corre con reduced-motion. Datos inventados, solo en memoria.
'use strict';
const { test, expect } = require('./support/fixtures');
const OUT = process.env.TZ_SHOTS || '';

async function preparar(page, { reduced = false } = {}) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    S.accounts = [
      { id: 'a1', name: 'Banco', type: 'bank', balance: 4200, currency: 'USD', icon: '🏦' },
      { id: 'a2', name: 'Efectivo', type: 'cash', balance: 650, currency: 'USD', icon: '💵' },
      { id: 'a3', name: 'Inversiones', type: 'invest', balance: 6980, currency: 'USD', icon: '📈' },
    ];
    // ~13 meses diarios: tendencia suba con ruido y un par de caídas, como un patrimonio real.
    const hoy = new Date(getActiveDate() + 'T00:00:00Z'), nw = [];
    let v = 8950, s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - .5; };
    for (let i = 400; i >= 0; i--) {
      const d = new Date(hoy); d.setUTCDate(d.getUTCDate() - i);
      v += 7.5 + rnd() * 70 + (i % 97 < 6 ? -45 : 0);
      nw.push({ date: d.toISOString().slice(0, 10), value: Math.round(v * 100) / 100 });
    }
    S.nwHistory = nw; S.accountHistory = [];
    // Hábitos de Finanzas como los de un usuario real: el gráfico toma su alto alineado con esa card (alinear-columnas.js).
    S.habitTrackers = S.habitTrackers && !Array.isArray(S.habitTrackers) ? S.habitTrackers : { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] };
    S.habitTrackers.finanzas = ['Registrar gastos', 'Revisar cuentas', 'No delivery', 'Leer mercados', 'Ahorro semanal', 'Revisar tarjeta'].map((nm, i) => ({ id: 'f' + i, name: nm, emoji: '📒', days: {} }));
    try { localStorage.removeItem('cm_nw_range'); } catch (e) {}
  });
  await page.click('.nav-btn[data-tab="finanzas"]');
  await page.waitForFunction(() => typeof nwLineInst !== 'undefined' && !!nwLineInst && !!nwLineInst._nwTz);
  await page.evaluate(() => updateNWCharts());
  await page.locator('#nwLineChart').scrollIntoViewIfNeeded();
}
const estado = (page) => page.evaluate(() => {
  const st = nwLineInst._nwTz, meta = nwLineInst.getDatasetMeta(0), pts = meta.data.filter((p) => !p.skip);
  return { t: st.t, it: st.it, cx: st.cx, xd: st.xd, x1: pts[pts.length - 1].x, active: st.active, raf: !!st.raf, on: st.on,
    sel: nwLineInst._nwXh.sel, txt: nwLineInst._nwXh.txt };
});
const huella = (page) => page.evaluate(() => {   // suma de píxeles del canvas: cambia si cambia el dibujo
  const c = document.getElementById('nwLineChart'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 0; for (let i = 0; i < d.length; i += 4) h = (h + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7 + d[i + 3]) % 1000000007; return h;
});
const esperar = (page, ms) => page.waitForTimeout(ms);
// El entorno de prueba puede ir a pocos cuadros por segundo: se espera la condición, no un tiempo fijo.
const hasta = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 30000 });
const dibujada = (page) => hasta(page, () => { const st = nwLineInst._nwTz, p = nwLineInst.getDatasetMeta(0).data.filter((q) => !q.skip); return Math.abs(st.xd - p[p.length - 1].x) < .5; });
const anima = (page, on) => hasta(page, (on) => nwLineInst._nwTz.active === on && !!nwLineInst._nwTz.raf === on, on);

test('trazo vivo: la línea se dibuja al entrar y la luz recorre el gráfico sola', async ({ cmPage: page, consoleErrors }, info) => {
  test.setTimeout(60000);
  await preparar(page);
  const ds = await page.evaluate(() => { const d = nwLineInst.data.datasets[0]; return { r: d.pointRadius, hr: d.pointHoverRadius }; });
  expect(ds).toEqual({ r: 0, hr: 0 });   // sin puntos: con 400 puntos la línea se veía punteada

  await anima(page, true);
  if (OUT) await page.locator('#nwLineChart').screenshot({ path: `${OUT}/${info.project.name}-dibujo.png` });
  const a = await estado(page);
  expect(a.active).toBe(true);
  expect(a.xd).toBeLessThan(a.x1 - 5);   // todavía dibujándose
  await dibujada(page);
  const b = await estado(page);
  expect(Math.abs(b.xd - b.x1)).toBeLessThan(.5);   // terminó de dibujarse

  const h1 = await huella(page), c1 = (await estado(page)).cx;
  await esperar(page, 600);
  await hasta(page, (c1) => Math.abs(nwLineInst._nwTz.cx - c1) > 2, c1);
  const h2 = await huella(page), c2 = await estado(page);
  expect(h2).not.toBe(h1);
  expect(Math.abs(c2.cx - c1)).toBeGreaterThan(2);   // la luz se movió
  expect(c2.sel).toBeNull();                          // sin tocar: el crosshair no queda «elegido»
  expect(c2.txt && c2.txt[2]).toMatch(/^[▲▼] |^inicio de la serie$/);   // el cartel acompaña a la luz

  if (OUT) {
    await page.evaluate(() => { const a = document.getElementById('avisos-app'); if (a) a.remove(); });
    // Bloque «evolución»: desde el selector de serie/rango hasta el pie del gráfico.
    const r = await page.evaluate(() => {
      const a = document.querySelector('#tab-finanzas .nw-ctl').getBoundingClientRect(), b = document.getElementById('nwLineChart').closest('.chart-wrap').getBoundingClientRect();
      return { x: Math.max(0, Math.min(a.left, b.left) - 8), y: Math.max(0, a.top - 8), width: Math.max(a.right, b.right) - Math.min(a.left, b.left) + 16, height: b.bottom - a.top + 16 };
    });
    await page.screenshot({ path: `${OUT}/${info.project.name}-card.png`, clip: r });
    for (let k = 0; k < 8; k++) { await page.locator('#nwLineChart').screenshot({ path: `${OUT}/${info.project.name}-luz-${k}.png` }); await esperar(page, 700); }
  }
  expect(consoleErrors).toEqual([]);
});

test('trazo vivo: se pausa fuera de pantalla y con la pestaña oculta', async ({ cmPage: page, consoleErrors }) => {
  test.setTimeout(60000);
  await preparar(page);
  await anima(page, true);
  // Fuera de pantalla (otra pestaña de la app: el gráfico queda sin tamaño)
  await page.click('.nav-btn[data-tab="vida"]');
  await anima(page, false);
  const f1 = await estado(page); await esperar(page, 600); const f2 = await estado(page);
  expect(f1.active).toBe(false); expect(f1.raf).toBe(false); expect(f2.t).toBe(f1.t);
  // Vuelve a Finanzas: anima de nuevo y la línea se vuelve a dibujar
  await page.click('.nav-btn[data-tab="finanzas"]');
  await page.locator('#nwLineChart').scrollIntoViewIfNeeded();
  await anima(page, true);
  await hasta(page, (t) => nwLineInst._nwTz.t > t, f2.t);
  const g = await estado(page);
  expect(g.active).toBe(true); expect(g.t).toBeGreaterThan(f2.t); expect(g.xd).toBeLessThan(g.x1 - 5);
  // Scroll hasta sacarlo de la vista
  await page.evaluate(() => { document.getElementById('app').scrollTo({ top: 0, behavior: 'instant' }); });   // #app es el contenedor con scroll; arriba de todo el gráfico queda bajo el pliegue
  expect(await page.evaluate(() => document.getElementById('nwLineChart').getBoundingClientRect().top > document.getElementById('app').getBoundingClientRect().bottom)).toBe(true);
  await anima(page, false);
  { const s1 = await estado(page); await esperar(page, 500); const s2 = await estado(page); expect(s2.t).toBe(s1.t); }
  await page.locator('#nwLineChart').scrollIntoViewIfNeeded();
  await anima(page, true);
  // Pestaña del navegador oculta
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const o1 = await estado(page); await esperar(page, 500); const o2 = await estado(page);
  expect(o1.active).toBe(false); expect(o2.t).toBe(o1.t);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await hasta(page, (t) => nwLineInst._nwTz.t > t, o2.t);
  expect(consoleErrors).toEqual([]);
});

test('trazo vivo: con reduced-motion la línea queda fija, entera y sin luz', async ({ cmPage: page, consoleErrors }) => {
  await preparar(page, { reduced: true });
  await esperar(page, 300);
  const a = await estado(page), h1 = await huella(page);
  await esperar(page, 700);
  const b = await estado(page), h2 = await huella(page);
  expect(a.active).toBe(false); expect(b.t).toBe(0);
  expect(Math.abs(a.xd - a.x1)).toBeLessThan(.5);   // ya dibujada entera
  expect(h2).toBe(h1);
  expect(b.txt).toBeNull();                          // sin cartel que se mueva solo
  expect(consoleErrors).toEqual([]);
});

test('trazo vivo: el crosshair sigue funcionando y el cartel muestra ▲/▼', async ({ cmPage: page, consoleErrors }, info) => {
  await preparar(page);
  await dibujada(page);
  const box = await page.locator('#nwLineChart').boundingBox();
  await page.mouse.move(box.x + box.width * .55, box.y + box.height / 2);
  await hasta(page, () => nwLineInst._nwXh.sel != null);
  const e = await estado(page);
  expect(e.sel).not.toBeNull();
  expect(e.txt[0]).toMatch(/^[A-ZÁÉÍÓÚ]{3} \d{4}$/);   // mes del rango «Todo»
  expect(e.txt[2]).toMatch(/^[▲▼] [+−]\$/);
  if (OUT) await page.locator('#nwLineChart').screenshot({ path: `${OUT}/${info.project.name}-hover.png` });
  await page.mouse.move(0, 0);
  await esperar(page, 100);
  expect((await estado(page)).sel).toBeNull();
  expect(consoleErrors).toEqual([]);
});
