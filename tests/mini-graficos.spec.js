// HUD D5 — mini gráficos que se dibujan: los sparklines de tendencia (.k-spark) se revelan de izquierda a derecha con un punto de luz
// al ENTRAR a la sección (motion.js drawSparks); un guardado/re-render no los re-anima; con prefers-reduced-motion aparecen directos.
'use strict';
const fs = require('fs');
const { test, expect } = require('./support/fixtures');
const SHOTS = process.env.D5_SHOTS || '';

const espiar = (page) => page.evaluate(() => {
  window.__sk = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (kf, opts) {
    if (this.closest && this.closest('svg.k-spark') || (this.matches && this.matches('svg.k-spark'))) window.__sk.push({ tag: this.tagName, cls: this.getAttribute('class') || '', kf: JSON.stringify(kf), dur: opts && opts.duration });
    return orig.call(this, kf, opts);
  };
});
const vivas = (page, tab) => page.evaluate((t) => document.getAnimations().filter((a) => {
  const el = a.effect && a.effect.target; return el && a.playState !== 'finished' && el.closest && el.closest(`#tab-${t} svg.k-spark`);
}).length, tab);

test.describe('mini gráficos D5', () => {
  test('al entrar a Finanzas, Salud y Estudio la línea pasa de oculta a completa; guardar no re-anima', async ({ cmPage: page, consoleErrors }) => {
    test.setTimeout(90000);
    const vw = page.viewportSize().width;
    await page.waitForTimeout(2800);   // fuera de la ventana de arranque
    // historial inventado de 14 días (solo en memoria) para que la línea tenga forma
    await page.evaluate(() => {
      const pad = (n) => String(n).padStart(2, '0'); const pat = ['done', 'done', 'none', 'done', 'done', 'done', 'none', 'none', 'done', 'done', 'none', 'done', 'done', 'done'];
      S.habitTrackers = S.habitTrackers || {};
      for (const sec of ['finanzas', 'salud', 'conocimiento']) {
        const days1 = {}, days2 = {};
        for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() - (13 - i)); const k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); if (pat[i] === 'done') days1[k] = 'done'; if (i % 3) days2[k] = 'done'; }
        S.habitTrackers[sec] = [{ id: 'zz1', name: 'A', days: days1 }, { id: 'zz2', name: 'B', days: days2 }];
      }
    });
    for (const tab of ['finanzas', 'salud', 'conocimiento']) {
      await espiar(page);
      await page.click(`.nav-btn[data-tab="${tab}"]`);
      await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
      await page.waitForTimeout(350);
      const mid = await page.evaluate((t) => {
        const svg = document.querySelector(`#tab-${t} svg.k-spark`);
        return { n: document.querySelectorAll(`#tab-${t} svg.k-spark`).length, clip: getComputedStyle(svg).clipPath, tip: !!svg.querySelector('.k-tip') };
      }, tab);
      expect(mid.n, `sparkline en ${tab}`).toBeGreaterThan(0);
      expect(mid.tip, 'punto de luz en la punta').toBe(true);
      expect(mid.clip, 'a mitad del dibujo el trazo está parcialmente oculto').not.toMatch(/^inset\(-?6px -?6px -?6px -?6px\)$|^none$/);
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${tab}-${vw}-mid.png` }); }
      const llamadas = await page.evaluate(() => window.__sk.slice());
      expect(llamadas.some((c) => c.tag === 'svg' && /clipPath/.test(c.kf) && c.dur >= 600 && c.dur <= 900), 'clip 600-900 ms').toBe(true);
      await page.waitForTimeout(1100);
      expect(await vivas(page, tab), 'nada queda animando').toBe(0);
      expect(await page.evaluate((t) => document.querySelectorAll(`#tab-${t} .k-tip`).length, tab), 'el punto se retira').toBe(0);
      expect(await page.evaluate((t) => getComputedStyle(document.querySelector(`#tab-${t} svg.k-spark`)).clipPath, tab), 'trazo completo').toBe('none');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tab}-${vw}-fin.png` });
      // guardar / re-render dentro de la sección: no se re-anima
      await page.evaluate(() => { window.__sk.length = 0; saveState(); JARVIS_INTEL.renderCard(currentTab); });
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => window.__sk.length), 'sin animación al re-renderizar').toBe(0);
      expect(await vivas(page, tab)).toBe(0);
      expect(await page.evaluate((t) => getComputedStyle(document.querySelector(`#tab-${t} svg.k-spark`)).clipPath, tab)).toBe('none');
    }
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('mini gráficos D5 · reducir movimiento', () => {
  test.use({ reducedMotion: 'reduce' });
  test('con prefers-reduced-motion el sparkline aparece directo', async ({ cmPage: page, consoleErrors }) => {
    await page.waitForTimeout(2800);
    await espiar(page);
    await page.click('.nav-btn[data-tab="finanzas"]');
    await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__sk.length)).toBe(0);
    expect(await page.evaluate(() => document.querySelectorAll('#tab-finanzas .k-tip').length)).toBe(0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#tab-finanzas svg.k-spark')).clipPath)).toBe('none');
    expect(await vivas(page, 'finanzas')).toBe(0);
    expect(consoleErrors).toEqual([]);
  });
});
