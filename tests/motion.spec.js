// Sistema de motion (motion.js + tokens en styles.css): entrada escalonada al cambiar de sección, count-up de
// números, pop al marcar casillas y entrada de filas nuevas. Todo se apaga con prefers-reduced-motion.
// Datos de ejemplo inventados.
'use strict';
const { test, expect } = require('./support/fixtures');

// Animaciones "finitas" del sistema (WAAPI + CSS animations; las transiciones y los loops infinitos del HUD no cuentan)
// cuyo objetivo cae dentro de `rootSel` (y no es el propio root).
const FINITAS = (rootSel, innerSel, soloActivas = true) => `(() => {
  const root = document.querySelector(${JSON.stringify(rootSel)});
  return document.getAnimations().filter(a => {
    if (a.constructor.name === 'CSSTransition') return false;
    if (${soloActivas} && a.playState === 'finished') return false;   // las con fill:both terminadas siguen en getAnimations()
    const t = a.effect && a.effect.target, tm = a.effect && a.effect.getTiming();
    if (!t || !root || t === root || !root.contains(t)) return false;
    if (tm.iterations === Infinity) return false;
    return ${innerSel ? `!!t.closest(${JSON.stringify(innerSel)})` : 'true'};
  });
})()`;

const irA = async (page, tab) => {
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
};

// Registra las llamadas a Element.animate para ver qué se animó y con qué parámetros.
const espiarAnimate = (page) => page.evaluate(() => {
  window.__anim = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (kf, opts) {
    window.__anim.push({ cls: this.className && this.className.toString ? this.className.toString() : '', tag: this.tagName, id: this.id, dur: opts && opts.duration, delay: (opts && opts.delay) || 0, kf: JSON.stringify(kf) });
    return orig.call(this, kf, opts);
  };
});

test.describe('motion · con movimiento', () => {
  test('(b) switchTab dispara la entrada escalonada una vez y un guardado posterior no re-anima', async ({ cmPage, consoleErrors }) => {
    await espiarAnimate(cmPage);
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);
    const entrada = await cmPage.evaluate(() => window.__anim.filter((a) => /\bcard\b|kpi-strip/.test(a.cls)));
    expect(entrada.length, 'tarjetas animadas al entrar').toBeGreaterThan(0);
    expect(entrada.length, 'tope de tarjetas animadas').toBeLessThanOrEqual(8);
    const delays = entrada.map((a) => a.delay);
    expect(delays[0]).toBe(0);
    for (let i = 1; i < delays.length; i++) expect(delays[i] - delays[i - 1], 'escalonado <= 30 ms').toBeLessThanOrEqual(30);
    for (const a of entrada) {
      expect(a.dur, 'duración de entrada').toBeLessThanOrEqual(300);
      expect(a.kf).toContain('translateY');
      expect(a.kf).not.toMatch(/width|height|top|left|box-shadow/);
    }
    // Termina sola: nada queda animando
    await expect.poll(() => cmPage.evaluate(`${FINITAS('#tab-finanzas', '.card, .kpi-strip')}.length`), { timeout: 3000 }).toBe(0);

    // Re-render por datos: ni WAAPI ni animaciones CSS nuevas sobre las tarjetas
    await cmPage.evaluate(() => { window.__anim.length = 0; });
    await cmPage.evaluate(() => { renderFinanzasTab(); saveState(); renderFinanzasTab(); if (window.JARVIS_INTEL) JARVIS_INTEL.renderCard('finanzas'); });
    await cmPage.waitForTimeout(150);
    expect(await cmPage.evaluate(() => window.__anim.filter((a) => /\bcard\b|kpi-strip/.test(a.cls)).length)).toBe(0);
    expect(await cmPage.evaluate(`${FINITAS('#tab-finanzas', '.card, .kpi-strip')}.length`)).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('(c) count-up: termina en el texto exacto original, mantiene el formato y dura <= 400 ms', async ({ cmPage, consoleErrors }) => {
    const casos = ['$1,234,567', '-$ 1.234,50', '+12,5%', '3.5h', '75%', '🔥 12', '1.234', '0'];
    const res = await cmPage.evaluate(async (casos) => {
      const out = [];
      for (const txt of casos) {
        const el = document.createElement('span'); el.id = 'zz-cu'; el.textContent = txt; document.body.appendChild(el);
        const vistos = new Set(); const t0 = performance.now();
        const arranca = CMMotion.countUp(el, { from: 0 });
        await new Promise((ok) => { (function f() { vistos.add(el.textContent); if (performance.now() - t0 > 700) ok(); else requestAnimationFrame(f); })(); });
        out.push({ txt, arranca, final: el.textContent, vistos: [...vistos] });
        el.remove();
      }
      const bad = document.createElement('span'); bad.textContent = '12/05 10:30'; document.body.appendChild(bad);
      out.push({ txt: 'fecha', arranca: CMMotion.countUp(bad, { from: 0 }), final: bad.textContent, vistos: [] });
      bad.remove();
      return out;
    }, casos);
    for (const r of res) {
      expect(r.final, `texto final de "${r.txt}"`).toBe(r.txt === 'fecha' ? '12/05 10:30' : r.txt);
    }
    const por = Object.fromEntries(res.map((r) => [r.txt, r]));
    expect(por['$1,234,567'].arranca).toBe(true);
    expect(por['$1,234,567'].vistos.length, 'pasa por valores intermedios').toBeGreaterThan(2);
    for (const v of por['$1,234,567'].vistos) expect(v).toMatch(/^\$\d{1,3}(,\d{3})*$/);
    for (const v of por['-$ 1.234,50'].vistos) expect(v).toMatch(/^-\$ \d{1,3}(\.\d{3})*,\d{2}$/);
    for (const v of por['+12,5%'].vistos) expect(v).toMatch(/^\+\d+,\d%$/);
    for (const v of por['3.5h'].vistos) expect(v).toMatch(/^\d\.\dh$/);
    expect(por['fecha'].arranca, 'una fecha no se cuenta').toBe(false);
    expect(por['0'].arranca, 'de 0 a 0 no anima').toBe(false);

    // KPIs de una sección: lo que queda en pantalla es el texto del render, y un re-render sin cambios no anima
    await irA(cmPage, 'vida');
    await cmPage.waitForTimeout(700);
    const antes = await cmPage.locator('#kpi-vida .k-val').allTextContents();
    expect(antes.length).toBeGreaterThan(0);
    await cmPage.evaluate(() => JARVIS_INTEL.renderCard('vida'));
    const despues = await cmPage.locator('#kpi-vida .k-val').allTextContents();
    expect(despues).toEqual(antes);
    expect(await cmPage.evaluate(`${FINITAS('#kpi-vida', '.k-val, .k-spark, .k-bar i')}.length`), 'sin animación si el valor no cambió').toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('(c2) un total que cambia cuenta desde el valor anterior y termina en el texto nuevo', async ({ cmPage, consoleErrors }) => {
    await irA(cmPage, 'finanzas');
    await cmPage.waitForTimeout(900);
    const r = await cmPage.evaluate(async () => {
      const el = document.getElementById('nwTotal');
      el.textContent = '$1,000';           // valor "anterior"
      await new Promise((ok) => setTimeout(ok, 450));
      const visto = new Set(); let fin = false;
      el.textContent = '$5,000';           // valor nuevo (como lo escribe renderAccounts)
      const t0 = performance.now();
      await new Promise((ok) => { (function f() { visto.add(el.textContent); if (performance.now() - t0 > 700) ok(); else requestAnimationFrame(f); })(); });
      return { final: el.textContent, vistos: [...visto] };
    });
    expect(r.final).toBe('$5,000');
    expect(r.vistos.length, 'hubo valores intermedios').toBeGreaterThan(2);
    for (const v of r.vistos) { const n = +v.replace(/[$,]/g, ''); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(5000); }
    expect(r.vistos.some((v) => { const n = +v.replace(/[$,]/g, ''); return n > 1000 && n < 5000; }), 'pasa por valores entre el anterior y el nuevo').toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('(d) marcar como hecho funciona, hace pop en la casilla y no mueve el layout', async ({ cmPage, consoleErrors }) => {
    await irA(cmPage, 'vida');
    await cmPage.evaluate(() => {
      S.goals[getActiveDate()] = [
        { id: 'g1', text: 'Meta de ejemplo uno', done: false, priority: 'mid' },
        { id: 'g2', text: 'Meta de ejemplo dos', done: false, priority: 'high', time: '15:00' },
      ];
      renderMetasReadonly();
    });
    const fila = cmPage.locator('#metas-readonly-card .mrd-item');
    await expect(fila).toHaveCount(2);
    await cmPage.waitForTimeout(500);
    const layout = () => cmPage.evaluate(() => [...document.querySelectorAll('#metas-readonly-card .mrd-item, #metas-readonly-card .mrd-check')]
      .map((e) => [e.className.split(' ')[0], e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight]));
    const cajas = () => cmPage.evaluate(() => [...document.querySelectorAll('#metas-readonly-card .mrd-item, #metas-readonly-card .mrd-check')]
      .map((e) => { const r = e.getBoundingClientRect(), o = document.getElementById('metas-readonly-card').getBoundingClientRect(); return [Math.round(r.left - o.left), Math.round(r.top - o.top), Math.round(r.width), Math.round(r.height)]; }));
    const l0 = await layout(), c0 = await cajas();
    await espiarAnimate(cmPage);
    await fila.first().locator('.mrd-check').click();   // la de horario va primera
    await cmPage.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    expect(await cmPage.evaluate(() => S.goals[getActiveDate()].find((g) => g.text === 'Meta de ejemplo dos').done), 'quedó hecha').toBe(true);
    const pops = await cmPage.evaluate(() => window.__anim.filter((a) => /mrd-check/.test(a.cls)));
    expect(pops.length, 'una sola respuesta de pop').toBe(1);
    expect(pops[0].kf).toContain('scale(1.15)');
    expect(pops[0].dur).toBeLessThanOrEqual(300);
    expect(await layout(), 'layout (offset*) estable durante el pop').toEqual(l0);
    await cmPage.waitForTimeout(450);
    expect(await cajas(), 'cajas idénticas al terminar').toEqual(c0);
    // desmarcar: no hace pop
    await cmPage.evaluate(() => { window.__anim.length = 0; });
    await cmPage.locator('#metas-readonly-card .mrd-item.done .mrd-check').click();
    await cmPage.waitForTimeout(100);
    expect(await cmPage.evaluate(() => window.__anim.filter((a) => /mrd-check/.test(a.cls)).length)).toBe(0);
    expect(await cmPage.evaluate(() => S.goals[getActiveDate()].find((g) => g.text === 'Meta de ejemplo dos').done)).toBe(false);
    expect(consoleErrors).toEqual([]);
  });

  test('(d2) casilla de materia (se re-renderiza) y checkbox nativo también hacen pop', async ({ cmPage, consoleErrors }) => {
    await irA(cmPage, 'conocimiento');
    await cmPage.evaluate(() => {
      S.lawProgress = { years: [{ id: 'y1', label: 'Primer Año', subjects: [
        { id: 'a1', name: 'Alfa de ejemplo', done: false }, { id: 'a2', name: 'Beta de ejemplo', done: false },
      ] }] };
      saveState(); renderLawProgress();
    });
    await cmPage.waitForTimeout(500);
    await espiarAnimate(cmPage);
    await cmPage.locator('#law-progress-wrap .law-subject-row').first().locator('.law-check').click();
    await cmPage.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    expect(await cmPage.evaluate(() => S.lawProgress.years[0].subjects[0].done)).toBe(true);
    expect(await cmPage.evaluate(() => window.__anim.filter((a) => /law-check/.test(a.cls) || a.tag === 'INPUT').length), 'pop en la casilla re-renderizada').toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });

  test('(f) una fila nueva en una lista entra animada; el re-render con las mismas filas no anima', async ({ cmPage, consoleErrors }) => {
    await irA(cmPage, 'vida');
    await cmPage.evaluate(() => {
      S.goals[getActiveDate()] = [
        { id: 'g1', text: 'Meta de ejemplo uno', done: false, priority: 'mid' },
        { id: 'g2', text: 'Meta de ejemplo dos', done: false, priority: 'mid' },
      ];
      renderMetasReadonly();
    });
    await cmPage.waitForTimeout(1000);   // pasa la ventana "silenciosa" de la entrada a la sección
    await espiarAnimate(cmPage);
    await cmPage.evaluate(() => renderMetasReadonly());
    await cmPage.waitForTimeout(100);
    expect(await cmPage.evaluate(() => window.__anim.filter((a) => /mrd-item/.test(a.cls)).length), 'mismas filas: sin animación').toBe(0);
    await cmPage.evaluate(() => {
      S.goals[getActiveDate()].push({ id: 'g3', text: 'Meta de ejemplo tres', done: false, priority: 'mid' });
      renderMetasReadonly();
    });
    await cmPage.waitForTimeout(100);
    const filas = await cmPage.evaluate(() => window.__anim.filter((a) => /mrd-item/.test(a.cls)));
    expect(filas.length, 'solo la fila nueva').toBe(1);
    expect(filas[0].kf).not.toMatch(/width|height|top|left|box-shadow/);
    expect(consoleErrors).toEqual([]);
  });

  test('(g) overlay: abre y cierra con transición corta (tokens) sin errores', async ({ cmPage, consoleErrors }) => {
    await irA(cmPage, 'vida');
    await cmPage.evaluate(() => plannerOverlayOpen());
    const ov = cmPage.locator('#ov-planner');
    await expect(ov).toHaveClass(/show/);
    const t = await ov.evaluate((e) => { const cs = getComputedStyle(e); return { td: cs.transitionDuration, prop: cs.transitionProperty, pan: getComputedStyle(e.querySelector('.cm-panel')).animationDuration }; });
    expect(t.prop).toBe('opacity');
    expect(parseFloat(t.td) * 1000).toBeLessThanOrEqual(300);
    expect(parseFloat(t.pan) * 1000).toBeLessThanOrEqual(300);
    await cmPage.evaluate(() => CMOverlay.close('ov-planner'));
    await expect(ov).not.toHaveClass(/show/);
    const salida = await ov.evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration) * 1000);
    expect(salida, 'la salida es más corta que la entrada').toBeLessThan(parseFloat(t.td) * 1000);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('motion · reducir movimiento', () => {
  test.use({ reducedMotion: 'reduce' });

  test('(a) sin animaciones nuevas al cambiar de sección, abrir un overlay, contar números ni marcar casillas', async ({ cmPage, consoleErrors }) => {
    await espiarAnimate(cmPage);
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);
    expect(await cmPage.evaluate(`${FINITAS('#tab-finanzas', '', false)}.length`), 'getAnimations() vacío tras switchTab').toBe(0);
    expect(await cmPage.evaluate(() => window.__anim.length), 'ninguna llamada a animate()').toBe(0);

    await irA(cmPage, 'vida');
    await cmPage.evaluate(() => plannerOverlayOpen());
    await expect(cmPage.locator('#ov-planner')).toHaveClass(/show/);
    expect(await cmPage.evaluate(`${FINITAS('#ov-planner', '', false)}.length`), 'getAnimations() vacío tras abrir el overlay').toBe(0);
    const dur = await cmPage.locator('#ov-planner').evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration) * 1000);
    expect(dur, 'transición del overlay apagada').toBeLessThan(1);
    await cmPage.evaluate(() => CMOverlay.close('ov-planner'));

    // count-up apagado: el texto no se toca
    const cu = await cmPage.evaluate(() => { const el = document.createElement('span'); el.textContent = '$1,234'; document.body.appendChild(el); const r = CMMotion.countUp(el, { from: 0 }); const t = el.textContent; el.remove(); return { r, t }; });
    expect(cu).toEqual({ r: false, t: '$1,234' });

    // pop apagado
    await cmPage.evaluate(() => {
      S.goals[getActiveDate()] = [{ id: 'g1', text: 'Meta de ejemplo uno', done: false, priority: 'mid' }];
      renderMetasReadonly();
    });
    await cmPage.locator('#metas-readonly-card .mrd-check').first().click();
    await cmPage.waitForTimeout(150);
    expect(await cmPage.evaluate(() => window.__anim.length)).toBe(0);
    expect(await cmPage.evaluate(() => S.goals[getActiveDate()][0].done)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
