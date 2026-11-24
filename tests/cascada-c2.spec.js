// HUD C2 — cascada al cambiar de sección (motion.js leavePanel/enterPanel + styles.css card-cascade).
'use strict';
const fs = require('fs');
const { test, expect } = require('./support/fixtures');
const SHOTS = process.env.CASCADA_SHOTS || '';

const irA = (page, tab) => page.click(`.nav-btn[data-tab="${tab}"]`);

test.describe('cascada C2', () => {
  test('cascada: tarjetas visibles escalonadas, mid-shot, y todo vuelve a opacity 1 / sin transform', async ({ cmPage: page, consoleErrors }) => {
    test.setTimeout(90000);
    const vw = page.viewportSize().width;
    for (const tab of ['finanzas', 'salud']) {
      await irA(page, tab);
      await page.waitForTimeout(330);
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${tab}-${vw}-mid.png` }); }
      // durante la cascada hay una tarjeta aún oculta/animando y la sección ya es clickeable
      const delays = await page.evaluate((t) => [...document.querySelectorAll(`#tab-${t} .card`)].map((c) => c.style.getPropertyValue('--cx-d')).filter(Boolean), tab);
      expect(delays.length).toBeGreaterThan(0);
      expect(Math.min(...delays.map(parseFloat))).toBeGreaterThanOrEqual(120);
      expect(Math.max(...delays.map(parseFloat))).toBeLessThanOrEqual(480);
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => document.documentElement.classList.contains('mo-in'))).toBe(false);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tab}-${vw}-fin.png` });
      const bad = await page.evaluate((t) => [...document.querySelectorAll(`#tab-${t} .card`)].filter((c) => {
        if (c.classList.contains('sr-armed')) return false; const s = getComputedStyle(c); return s.transform !== 'none' || s.opacity !== '1';
      }).length, tab);
      expect(bad).toBe(0);
    }
    expect(await page.locator('body > .tab-panel').count(), 'sin fantasmas').toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('4 cambios rápidos (80 ms): al final las .card de la sección activa tienen opacity 1 y sin transform; sin fantasma', async ({ cmPage: page, consoleErrors }) => {
    for (const tab of ['finanzas', 'salud', 'conocimiento', 'vida']) { await irA(page, tab); await page.waitForTimeout(80); }
    await page.waitForTimeout(1900);
    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.tab-panel.active .card')];
      return { n: cards.length, bad: cards.filter((c) => { const s = getComputedStyle(c); return !c.classList.contains('sr-armed') && (s.opacity !== '1' || s.transform !== 'none'); }).length,
        ghosts: document.querySelectorAll('body > .tab-panel').length,
        anims: document.getAnimations().filter((a) => a.playState === 'running' && a.constructor.name !== 'CSSTransition' && a.effect.getTiming().iterations !== Infinity && a.effect.target && a.effect.target.closest && a.effect.target.closest('.tab-panel.active .card')).length };
    });
    expect(r.n).toBeGreaterThan(0);
    expect(r.bad).toBe(0); expect(r.ghosts).toBe(0); expect(r.anims).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('un re-render por datos a 400/900/1400 ms de entrar a la sección no crea animaciones nuevas', async ({ cmPage: page, consoleErrors }) => {
    for (const espera of [400, 900, 1400]) {
      await irA(page, espera === 400 ? 'finanzas' : 'vida');
      await irA(page, 'finanzas');
      await page.waitForTimeout(espera);
      const nuevas = await page.evaluate(async () => {
        const vivas = () => document.getAnimations().filter((a) => a.constructor.name !== 'CSSTransition' && a.effect && a.effect.getTiming().iterations !== Infinity
          && a.effect.target && a.effect.target.closest && a.effect.target.closest('#tab-finanzas'));
        const antes = new Set(vivas());
        renderFinanzasTab(); saveState(); renderFinanzasTab(); if (window.JARVIS_INTEL) JARVIS_INTEL.renderCard('finanzas');
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 120))));
        return vivas().filter((a) => !antes.has(a)).map((a) => (a.animationName || 'waapi') + '@' + (a.effect.target.id || a.effect.target.className));
      });
      expect(nuevas, `re-render a ${espera} ms`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('clicks funcionan durante la cascada y el colapso de card-body sigue andando', async ({ cmPage: page }) => {
    await irA(page, 'finanzas');
    await page.waitForTimeout(100);
    await irA(page, 'vida'); // el click llega a la nav mientras anima
    await expect(page.locator('#tab-vida')).toHaveClass(/active/);
    await page.waitForTimeout(1600);
    const h0 = await page.evaluate(() => { window.__cb = [...document.querySelectorAll('.tab-panel.active .card-body')].filter((b) => b.getBoundingClientRect().height > 40); const h = __cb.map((b) => b.getBoundingClientRect().height); __cb.forEach((b) => b.classList.add('collapsed')); return h; });
    await expect.poll(() => page.evaluate((h0) => __cb.filter((b, i) => b.getBoundingClientRect().height < h0[i]).length, h0), { timeout: 6000 }).toBe(h0.length);
    expect(h0.length).toBeGreaterThan(0);
    await page.evaluate(() => __cb.forEach((b) => b.classList.remove('collapsed')));
  });

  test('prefers-reduced-motion: sin cascada ni fantasma', async ({ cmPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await irA(page, 'finanzas');
    expect(await page.locator('body > .tab-panel').count()).toBe(0);
    const a = await page.evaluate(() => [...document.querySelectorAll('#tab-finanzas .card')].filter((c) => getComputedStyle(c).animationName !== 'none').length);
    expect(a).toBe(0);
  });
});
