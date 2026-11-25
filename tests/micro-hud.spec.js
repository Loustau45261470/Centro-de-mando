// Microinteracciones HUD (tanda 2): D1 destello al tildar con el color de la sección, D2 avisos apilados (~7 s, cierran
// al tocar, máx. 3) y D4 onda del botón principal + "mantener apretado" de 0,5 s. Datos de ejemplo inventados.
'use strict';
const { test, expect } = require('./support/fixtures');

const irA = async (page, tab) => {
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
};
// Registra cada destello (.ckfx-pt) que se agrega a <body>, con su color.
const espiarDestellos = (page) => page.evaluate(() => {
  window.__fx = [];
  if (window.__fxObs) return;
  window.__fxObs = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.classList && n.classList.contains('ckfx-pt')) window.__fx.push(n.style.getPropertyValue('--fx').trim());
  })));
  window.__fxObs.observe(document.body, { childList: true });
});
const destellos = (page) => page.evaluate(() => window.__fx.slice());
const colorDe = (page, v) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
const norm = (c) => c.toLowerCase();

test.describe('D1 · destello al tildar', () => {
  test('cada sección destella con su color; destildar y re-render no destellan', async ({ cmPage, consoleErrors }) => {
    // Vida: metas de hoy
    await irA(cmPage, 'vida');
    await cmPage.evaluate(() => {
      S.goals[getActiveDate()] = [{ id: 'g1', text: 'Meta de ejemplo uno', done: false, priority: 'mid' }];
      renderMetasReadonly();
    });
    await cmPage.waitForTimeout(400);
    await espiarDestellos(cmPage);
    await cmPage.locator('#metas-readonly-card .mrd-check').first().click();
    await expect.poll(() => destellos(cmPage)).toHaveLength(1);
    expect(norm((await destellos(cmPage))[0])).toBe(norm(await colorDe(cmPage, '--c-vida')));
    // el destello es temporal
    await expect.poll(() => cmPage.locator('.ckfx-pt, .ckfx').count(), { timeout: 2000 }).toBe(0);
    // destildar: sin destello
    await cmPage.evaluate(() => { window.__fx.length = 0; });
    await cmPage.locator('#metas-readonly-card .mrd-item.done .mrd-check').click();
    await cmPage.waitForTimeout(200);
    expect(await destellos(cmPage)).toEqual([]);
    // re-render con una meta ya hecha: sin destello
    await cmPage.evaluate(() => { S.goals[getActiveDate()][0].done = true; renderMetasReadonly(); renderMetasReadonly(); });
    await cmPage.waitForTimeout(200);
    expect(await destellos(cmPage)).toEqual([]);

    // Conocimiento: materia
    await irA(cmPage, 'conocimiento');
    await cmPage.evaluate(() => {
      S.lawProgress = { years: [{ id: 'y1', label: 'Primer Año', subjects: [{ id: 'a1', name: 'Alfa de ejemplo', done: false }] }] };
      saveState(); renderLawProgress();
    });
    await cmPage.waitForTimeout(400);
    await cmPage.evaluate(() => { window.__fx.length = 0; });
    await cmPage.locator('#law-progress-wrap .law-check').first().click();
    await expect.poll(() => destellos(cmPage)).toHaveLength(1);
    expect(norm((await destellos(cmPage))[0])).toBe(norm(await colorDe(cmPage, '--c-conocimiento')));

    // Salud: dieta (overlay fuera de la pestaña → color de la pestaña activa)
    await irA(cmPage, 'salud');
    await cmPage.evaluate(() => {
      S.comidas = { alimentos: [{ id: 'a1', nombre: 'Alimento de ejemplo uno', unidad: 'g', comidas: ['desayuno'] }], registro: {} };
      renderDieta(); openDietaOverlay();
    });
    await cmPage.waitForTimeout(400);
    await cmPage.evaluate(() => { window.__fx.length = 0; });
    await cmPage.locator('#dietaBody .com-row .ptask-check input').first().click();
    await expect.poll(() => destellos(cmPage)).toHaveLength(1);
    expect(norm((await destellos(cmPage))[0])).toBe(norm(await colorDe(cmPage, '--c-salud')));

    const colores = new Set([await colorDe(cmPage, '--c-vida'), await colorDe(cmPage, '--c-conocimiento'), await colorDe(cmPage, '--c-salud')].map(norm));
    expect(colores.size, 'tres colores distintos').toBe(3);
    expect(consoleErrors).toEqual([]);
  });

  test.describe('reduced-motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('sin destello', async ({ cmPage, consoleErrors }) => {
      await irA(cmPage, 'vida');
      await cmPage.evaluate(() => {
        S.goals[getActiveDate()] = [{ id: 'g1', text: 'Meta de ejemplo uno', done: false, priority: 'mid' }];
        renderMetasReadonly();
      });
      await espiarDestellos(cmPage);
      await cmPage.locator('#metas-readonly-card .mrd-check').first().click();
      await cmPage.waitForTimeout(200);
      expect(await cmPage.evaluate(() => S.goals[getActiveDate()][0].done)).toBe(true);
      expect(await destellos(cmPage)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
});

test.describe('D2 · avisos', () => {
  test('duran ~7 s (respeta más), cierran al tocar, máximo 3 y color por tipo', async ({ cmPage, consoleErrors }) => {
    const ts = cmPage.locator('#toast .ts');
    await cmPage.evaluate(() => showToast('Aviso de ejemplo'));
    await expect(ts).toHaveCount(1);
    expect(await ts.first().evaluate((e) => e.style.getPropertyValue('--tms'))).toBe('7000ms');
    await cmPage.waitForTimeout(4000);   // el viejo duraba 3 s
    await expect(ts).toHaveCount(1);
    await expect(ts).toHaveCount(0, { timeout: 5000 });
    await expect(cmPage.locator('#toast')).not.toHaveClass(/show/);

    // duración explícita: menor → 7 s, mayor → se respeta
    await cmPage.evaluate(() => { showToast('Corto de ejemplo', 2000); showToast('Largo de ejemplo', 20000); });
    expect(await ts.evaluateAll((l) => l.map((e) => e.style.getPropertyValue('--tms')))).toEqual(['7000ms', '20000ms']);

    // cerrar tocando
    await ts.filter({ hasText: 'Largo de ejemplo' }).click();
    await expect(ts.filter({ hasText: 'Largo de ejemplo' })).toHaveCount(0);

    // máximo 3 apilados (quedan los últimos)
    await cmPage.evaluate(() => { ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].forEach((t) => showToast(t + ' de ejemplo')); });
    await expect(ts).toHaveCount(3);
    expect(await ts.allTextContents()).toEqual(['Tres de ejemplo', 'Cuatro de ejemplo', 'Cinco de ejemplo']);

    // color por tipo
    await cmPage.evaluate(() => { showToast('❌ No se pudo guardar el ejemplo'); showToast('Guardado de ejemplo', 0, 'ok'); });
    expect(await ts.evaluateAll((l) => l.slice(-2).map((e) => e.dataset.tipo))).toEqual(['err', 'ok']);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D4 · botones', () => {
  test('mantener apretado: 0,3 s no borra, 0,5 s sí', async ({ cmPage, consoleErrors }) => {
    await cmPage.evaluate(() => {
      window.__borrado = [];
      PlanUI.borrarRutina = (id) => window.__borrado.push(id);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pe-del'; b.id = 'hold-prueba'; b.dataset.hold = 'r-ejemplo';
      b.setAttribute('onpointerdown', 'PlanUI.holdIni(this)'); b.setAttribute('onpointerup', 'PlanUI.holdFin(this)');
      b.setAttribute('onpointerleave', 'PlanUI.holdFin(this)');
      b.textContent = 'Borrar (mantener apretado)';
      b.style.cssText = 'position:fixed;left:20px;top:120px;z-index:5000;width:200px;height:40px';
      document.body.appendChild(b);
    });
    const box = await cmPage.locator('#hold-prueba').boundingBox();
    await cmPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await cmPage.mouse.down(); await cmPage.waitForTimeout(300); await cmPage.mouse.up();
    await cmPage.waitForTimeout(400);
    expect(await cmPage.evaluate(() => window.__borrado)).toEqual([]);
    await cmPage.mouse.down(); await cmPage.waitForTimeout(750); await cmPage.mouse.up();
    await expect.poll(() => cmPage.evaluate(() => window.__borrado)).toEqual(['r-ejemplo']);
    expect(consoleErrors).toEqual([]);
  });

  test('botón principal: pulso suave y onda al tocar', async ({ cmPage, consoleErrors }) => {
    await cmPage.evaluate(() => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-primary'; b.id = 'prim-prueba'; b.textContent = 'Guardar';
      b.style.cssText = 'position:fixed;left:20px;top:200px;z-index:5000';
      document.body.appendChild(b);
    });
    expect(await cmPage.locator('#prim-prueba').evaluate((b) => getComputedStyle(b).animationName)).toBe('btnPulse');
    await cmPage.locator('#prim-prueba').click();
    await expect(cmPage.locator('.cm-rpl')).toHaveCount(1);
    await expect(cmPage.locator('.cm-rpl')).toHaveCount(0, { timeout: 2000 });
    expect(consoleErrors).toEqual([]);
  });
});
