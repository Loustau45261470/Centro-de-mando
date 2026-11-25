// HUD D7 (carga tipo HUD), D8 (ventana con escaneo) y D9 (medidor de presupuesto de luces). Datos sembrados en memoria / stubs, nada real.
'use strict';
const { test, expect } = require('./support/fixtures');

const irA = async (page, tab) => {
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
};

// ── D7 ─────────────────────────────────────────────────────────────────
test.describe('D7 · carga tipo HUD', () => {
  test('el placeholder HUD aparece mientras carga y desaparece al llegar; las filas nuevas se encienden una vez', async ({ cmPage, consoleErrors }) => {
    await cmPage.evaluate(() => {
      const el = document.createElement('div'); el.id = 'd7-box'; document.body.appendChild(el);
      hudCarga(el, 'Cargando prueba…', 3);
    });
    const box = cmPage.locator('#d7-box');
    await expect(box.locator('.hud-load')).toBeVisible();
    await expect(box.locator('.hud-load-row')).toHaveCount(3);
    await expect(box.locator('.hud-load-h')).toHaveText('Cargando prueba…');
    // el brillo y la barra de escaneo corren (loops infinitos)
    const anims = await cmPage.evaluate(() => document.getAnimations().filter(a => /^hl-(shimmer|scan)$/.test(a.animationName || '') && a.playState === 'running').length);
    expect(anims).toBeGreaterThan(0);
    // llegan los datos: se llama hudLit y se pinta lo real
    await cmPage.evaluate(() => { hudLit(document.getElementById('d7-box')); document.getElementById('d7-box').innerHTML = '<div class="r">uno</div><div class="r">dos</div>'; });
    await expect(box.locator('.hud-load')).toHaveCount(0);
    await expect(box).toHaveClass(/hud-lit/);
    await expect(box).not.toHaveClass(/hud-lit/, { timeout: 3000 });
    // un re-render posterior (no viene de un placeholder) no vuelve a encender
    await cmPage.evaluate(() => { hudLit(document.getElementById('d7-box')); document.getElementById('d7-box').innerHTML = '<div class="r">tres</div>'; });
    await cmPage.waitForTimeout(100);
    await expect(box).not.toHaveClass(/hud-lit/);
    expect(consoleErrors).toEqual([]);
  });

  test('estado de carga real (tenencias): muestra el placeholder HUD y lo reemplaza al llegar los datos', async ({ cmPage }) => {
    await cmPage.evaluate(() => {
      const bx = document.createElement('div'); bx.id = 'd7-ten'; document.body.appendChild(bx);
      window.CMDatos.carteraDetalle = () => new Promise(res => { window.__relD7 = () => res({ data: { tenencias: [], generado: '2026-01-01' }, status: 200 }); });
      Tenencias.renderInto(bx);
    });
    const bx = cmPage.locator('#d7-ten');
    await expect(bx.locator('.hud-load')).toBeVisible();
    await expect(bx.locator('.hud-load-h')).toContainText('Cargando tenencias');
    await cmPage.evaluate(() => window.__relD7());
    await expect(bx.locator('.hud-load')).toHaveCount(0);
  });

  test('reduced-motion: sin animación en el placeholder', async ({ cmPage }) => {
    await cmPage.emulateMedia({ reducedMotion: 'reduce' });
    await cmPage.evaluate(() => { const el = document.createElement('div'); el.id = 'd7-rm'; document.body.appendChild(el); hudCarga(el, 'Cargando…', 2); });
    await expect(cmPage.locator('#d7-rm .hud-load')).toBeVisible();
    const n = await cmPage.evaluate(() => document.getAnimations().filter(a => /^hl-(shimmer|scan|blink|lit)$/.test(a.animationName || '')).length);
    expect(n).toBe(0);
  });

  test('a 390 px el placeholder no desborda', async ({ cmPage }) => {
    await cmPage.setViewportSize({ width: 390, height: 844 });
    await cmPage.evaluate(() => { const el = document.createElement('div'); el.id = 'd7-m'; el.style.cssText = 'padding:16px'; document.body.appendChild(el); hudCarga(el, 'Cargando los datos de mercado de las empresas…', 4); });
    const m = await cmPage.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
  });
});

// ── D8 ─────────────────────────────────────────────────────────────────
test.describe('D8 · ventana con escaneo', () => {
  const MODAL = '#modal-add-mgoal';
  const animsModal = (page) => page.evaluate((sel) => {
    const m = document.querySelector(sel + ' .modal');
    return document.getAnimations().filter(a => {
      const t = a.effect && a.effect.target; return t === m && /^modal-unfold$/.test(a.animationName || '');
    }).map(a => ({ dur: a.effect.getTiming().duration, state: a.playState }))
      .concat(document.getAnimations().filter(a => (a.animationName || '') === 'modal-scan').map(a => ({ dur: a.effect.getTiming().duration, state: a.playState, scan: true })));
  }, MODAL);

  test('abre con la animación (<=350 ms), el input se enfoca al instante y al terminar no queda clip-path', async ({ cmPage }) => {
    await irA(cmPage, 'vida');
    await cmPage.evaluate(() => { openModal('modal-add-mgoal'); document.getElementById('mgoal-input-text').focus(); });
    const act = await animsModal(cmPage);
    expect(act.length).toBeGreaterThanOrEqual(2);          // unfold + scan
    for (const a of act) expect(a.dur).toBeLessThanOrEqual(350);
    // foco y tipeo desde el primer frame
    expect(await cmPage.evaluate(() => document.activeElement && document.activeElement.id)).toBe('mgoal-input-text');
    await cmPage.keyboard.type('hola');
    await expect(cmPage.locator('#mgoal-input-text')).toHaveValue('hola');
    await expect.poll(() => cmPage.evaluate((s) => getComputedStyle(document.querySelector(s + ' .modal')).clipPath, MODAL), { timeout: 3000 }).toBe('none');
    expect(await animsModal(cmPage)).toEqual([]);
  });

  test('cerrar y reabrir vuelve a animar y funciona', async ({ cmPage }) => {
    await irA(cmPage, 'vida');
    await cmPage.evaluate(() => openModal('modal-add-mgoal'));
    await expect(cmPage.locator(MODAL)).toHaveClass(/open/);
    await cmPage.waitForTimeout(450);
    await cmPage.evaluate(() => closeModal('modal-add-mgoal'));
    await expect(cmPage.locator(MODAL)).not.toHaveClass(/open/);
    const n = await cmPage.evaluate(() => { openModal('modal-add-mgoal'); return document.getAnimations().filter(a => /^modal-(unfold|scan)$/.test(a.animationName || '')).length; });
    expect(n).toBeGreaterThanOrEqual(2);
    await expect(cmPage.locator(MODAL)).toHaveClass(/open/);
    await expect(cmPage.locator(MODAL + ' .modal')).toBeVisible();
  });

  test('reduced-motion: abre directo, sin animación', async ({ cmPage }) => {
    await cmPage.emulateMedia({ reducedMotion: 'reduce' });
    await cmPage.evaluate(() => openModal('modal-add-mgoal'));
    await expect(cmPage.locator(MODAL + ' .modal')).toBeVisible();
    expect(await animsModal(cmPage)).toEqual([]);
  });

  test('a 390 px el modal abre sin scroll horizontal', async ({ cmPage }) => {
    await cmPage.setViewportSize({ width: 390, height: 844 });
    await cmPage.evaluate(() => openModal('modal-add-mgoal'));
    await cmPage.waitForTimeout(450);
    const m = await cmPage.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
  });
});

// ── D9 ─────────────────────────────────────────────────────────────────
test.describe('D9 · medidor de presupuesto', () => {
  // Fija presupuesto 100.000 y gasto = pct % y vuelve a pintar.
  const pintar = (page, pct) => page.evaluate((p) => {
    window._budgetMonthTotal = () => 100000; window._spentMonth = () => 100000 * p / 100;
    renderBudgetSummary();
  }, pct);
  const estado = (page) => page.evaluate(() => {
    const w = document.querySelector('#budgetSummaryBody .bsum-gauge-wrap');
    return {
      total: w.querySelectorAll('.bsum-seg').length,
      on: w.querySelectorAll('.bsum-seg.on').length,
      warn: w.classList.contains('warn'),
      pct: w.querySelector('.bsum-gauge-pct').textContent.trim(),
      blink: document.getAnimations().filter(a => a.animationName === 'bsum-warn' && a.playState === 'running').length,
    };
  });

  test('segmentos encendidos proporcionales (0, 50, 95 y >100 %) y parpadeo solo desde 90 %', async ({ cmPage }) => {
    await irA(cmPage, 'finanzas');
    await cmPage.waitForTimeout(1500);   // que cierre la ventana de entrada
    await pintar(cmPage, 0);
    let s = await estado(cmPage); expect(s).toMatchObject({ total: 30, on: 0, warn: false, blink: 0 });
    await pintar(cmPage, 50);
    s = await estado(cmPage); expect(s).toMatchObject({ on: 15, warn: false, blink: 0, pct: '50%' });
    await pintar(cmPage, 89);
    s = await estado(cmPage); expect(s).toMatchObject({ warn: false, blink: 0 });
    await pintar(cmPage, 95);
    s = await estado(cmPage); expect(s).toMatchObject({ on: 29, warn: true, pct: '95%' });
    expect(s.blink).toBeGreaterThan(0);
    await pintar(cmPage, 130);
    s = await estado(cmPage); expect(s).toMatchObject({ on: 30, warn: true, pct: '130%' });
    // semáforo: primer segmento verde, último rojo
    const cols = await cmPage.evaluate(() => { const l = document.querySelectorAll('#budgetSummaryBody .bsum-seg'); return [l[0].style.getPropertyValue('--c'), l[l.length - 1].style.getPropertyValue('--c')]; });
    expect(cols[0]).toBe('rgb(16,224,124)');
    expect(cols[1]).toBe('rgb(255,51,88)');
  });

  test('se dibuja al entrar a Finanzas, el re-render de la entrada lo retoma sin reiniciar y un guardado posterior no re-anima', async ({ cmPage }) => {
    const dibujando = () => cmPage.evaluate(() => document.getAnimations().filter(a => /^bsum-(seg-on|needle-in|bar-rise)$/.test(a.animationName || '') && a.playState === 'running').length);
    await irA(cmPage, 'vida');
    await cmPage.waitForTimeout(1500);
    await cmPage.evaluate(() => { window._budgetMonthTotal = () => 100000; window._spentMonth = () => 60000; });
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    // la sección se pinta al entrar: el medidor y las barras animan
    expect(await dibujando()).toBeGreaterThan(0);
    // re-render a mitad de la entrada (<700 ms): retoma donde iba (animation-delay negativo), no reinicia desde cero
    await cmPage.waitForTimeout(250);
    const r = await cmPage.evaluate(() => {
      renderBudgetSummary();
      const needle = document.getAnimations().find(a => a.animationName === 'bsum-needle-in');
      return needle ? { t: needle.effect.getComputedTiming().localTime, state: needle.playState } : null;
    });
    expect(r === null || r.state === 'finished' || r.t >= 150).toBe(true);
    await cmPage.waitForTimeout(1500);
    expect(await dibujando()).toBe(0);
    // guardar (re-render fuera de la ventana de entrada): sin animación y sin clase de dibujo
    await cmPage.evaluate(() => { window._spentMonth = () => 61000; renderBudgetSummary(); });
    expect(await dibujando()).toBe(0);
    await expect(cmPage.locator('#budgetSummaryBody .bsum-draw')).toHaveCount(0);
  });

  test('reduced-motion: estado final directo, sin animación ni parpadeo', async ({ cmPage }) => {
    await cmPage.emulateMedia({ reducedMotion: 'reduce' });
    await irA(cmPage, 'vida');
    await irA(cmPage, 'finanzas');
    await pintar(cmPage, 95);
    const s = await estado(cmPage);
    expect(s.on).toBe(29);
    expect(s.blink).toBe(0);
    const n = await cmPage.evaluate(() => document.getAnimations().filter(a => /^bsum-/.test(a.animationName || '')).length);
    expect(n).toBe(0);
  });

  test('a 390 px el medidor entra en el ancho y se ve completo', async ({ cmPage }) => {
    await cmPage.setViewportSize({ width: 390, height: 844 });
    await irA(cmPage, 'finanzas');
    await pintar(cmPage, 70);
    const m = await cmPage.evaluate(() => {
      const g = document.querySelector('#budgetSummaryBody .bsum-gauge').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, r: g.right, w: g.width };
    });
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.r).toBeLessThanOrEqual(m.cw);
    expect(m.w).toBeGreaterThan(100);
  });
});
