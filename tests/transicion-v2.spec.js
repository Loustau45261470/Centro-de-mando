// Cambio de sección sin parpadeo: al click se marca el botón en el mismo cuadro, la sección vieja sigue visible (atenuándose) mientras se
// renderiza la nueva y ningún cuadro queda sin una sección visible. Con prefers-reduced-motion el cambio es inmediato.
'use strict';
const { test, expect } = require('./support/fixtures');

// Clica el botón del nav y muestrea cada rAF durante `ms`: por cuadro, opacidad máxima entre los paneles visibles y si el nav ya marca el destino.
const muestrear = (page, tab, ms = 4000) => page.evaluate(({ tab, ms }) => new Promise((res) => {
  const f = [], t0 = performance.now();
  const tick = () => {
    const ops = [...document.querySelectorAll('.tab-panel')].map((p) => { const cs = getComputedStyle(p); return cs.display === 'none' ? 0 : +cs.opacity; });
    const nb = document.querySelector('.nav-btn.active');
    f.push({ t: performance.now() - t0, maxop: Math.max(0, ...ops), navok: !!nb && nb.dataset.tab === tab });
    const fin = document.querySelector('#tab-' + tab + '.active') && f[f.length - 1].maxop > 0.99 && f.length > 2;   // termina al quedar opaca (con la máquina cargada los cuadros se atrasan: no se fija una duración)
    if (!fin && performance.now() - t0 < ms) requestAnimationFrame(tick); else res(f);
  };
  document.querySelector(`.nav-btn[data-tab="${tab}"]`).click();
  requestAnimationFrame(tick);
}), { tab, ms });

test.describe('transición de sección v2', () => {
  test('(a) nav marcado en el primer cuadro y ningún cuadro vacío en 4 cambios seguidos', async ({ cmPage, consoleErrors }) => {
    for (const tab of ['finanzas', 'conocimiento', 'salud', 'vida']) {
      await cmPage.waitForTimeout(400);
      const f = await muestrear(cmPage, tab);
      expect(f.length, tab + ': hubo cuadros').toBeGreaterThan(1);
      expect(f[0].navok, tab + ': nav marcado en el primer cuadro').toBe(true);
      const vacios = f.filter((x) => x.maxop <= 0.05);
      expect(vacios.length, tab + ': cuadros vacíos').toBe(0);
      expect(f[f.length - 1].maxop, tab + ': termina opaca').toBeGreaterThan(0.99);
      await expect(cmPage.locator(`#tab-${tab}`)).toHaveClass(/active/);
      expect(await cmPage.locator('.tab-panel.active').count()).toBe(1);
      expect(await cmPage.locator('.tab-panel.tab-out').count()).toBe(0);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('(b) la sección vieja sigue visible hasta que la nueva está activa', async ({ cmPage }) => {
    const r = await cmPage.evaluate(() => new Promise((res) => {
      const vieja = document.querySelector('.tab-panel.active').id, log = [];
      document.querySelector('.nav-btn[data-tab="salud"]').click();
      const tick = () => {
        const v = document.getElementById(vieja), n = document.getElementById('tab-salud');
        log.push({ vieja: getComputedStyle(v).display !== 'none', nueva: n.classList.contains('active') });
        if (n.classList.contains('active') || log.length > 60) res(log); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    // en todo cuadro previo al cambio la vieja se ve; en el cuadro del cambio la nueva ya está activa
    expect(r.length, 'al menos un cuadro con la vieja todavía visible (el click solo marca el nav)').toBeGreaterThan(1);
    for (const x of r.slice(0, -1)) expect(x.vieja).toBe(true);
    expect(r[r.length - 1].nueva).toBe(true);
  });

  test('(c) clicks seguidos: queda solo la última sección, con su botón', async ({ cmPage }) => {
    await cmPage.evaluate(() => { for (const t of ['finanzas', 'salud', 'ia']) document.querySelector(`.nav-btn[data-tab="${t}"]`).click(); });
    await expect(cmPage.locator('#tab-ia')).toHaveClass(/active/);
    await cmPage.waitForTimeout(500);
    expect(await cmPage.locator('.tab-panel.active').count()).toBe(1);
    expect(await cmPage.locator('.tab-panel.tab-out').count()).toBe(0);
    expect(await cmPage.locator('.nav-btn.active').evaluateAll((b) => b.map((x) => x.dataset.tab))).toEqual(['ia']);
  });

  test('(d) con movimiento reducido el cambio es inmediato (sin fase intermedia)', async ({ cmPage }) => {
    await cmPage.emulateMedia({ reducedMotion: 'reduce' });
    const r = await cmPage.evaluate(() => {
      document.querySelector('.nav-btn[data-tab="finanzas"]').click();
      return { act: document.getElementById('tab-finanzas').classList.contains('active'), out: document.querySelectorAll('.tab-out').length };
    });
    expect(r).toEqual({ act: true, out: 0 });
  });
});
