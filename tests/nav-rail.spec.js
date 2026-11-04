// Rail de navegación de escritorio ocultable (nav-rail.js): botón «, Ctrl+B, línea de energía + ⟩,
// vista rápida al acercar el mouse al borde, persistencia, foco, reducir movimiento y celular sin cambios.
'use strict';
const { test, expect, waitForBoot, completeLoginOverlay } = require('./support/fixtures');

const KEY = 'cm_rail_off';
const html = (page) => page.locator('html');
const off = (page) => expect(html(page)).toHaveClass(/rail-off/);
const on = (page) => expect(html(page)).not.toHaveClass(/rail-off/);
// terminó la animación de ocultar (queda el estado final)
const settled = (page) => expect(html(page)).not.toHaveClass(/rail-hiding|rail-showing/);
// posición de layout (ignora el transform de la animación de deslizamiento)
const lay = async (page, sel) => page.locator(sel).evaluate((el) => ({ x: el.offsetLeft, w: el.offsetWidth }));
const box = async (page, sel) => page.locator(sel).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, w: r.width, right: r.right };
});

test.describe('rail de escritorio (1440)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('visible por defecto: botón « con aria, sin línea de energía', async ({ cmPage: page, consoleErrors }) => {
    await on(page);
    const t = page.locator('#rail-toggle');
    await expect(t).toBeVisible();
    await expect(t).toHaveAttribute('aria-label', 'Ocultar barra lateral');
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#rail-show')).toBeHidden();
    expect((await box(page, '#nav')).w).toBeCloseTo(124, 0);
    expect((await lay(page, '#app')).x).toBeCloseTo(124, 0);
    expect(consoleErrors).toEqual([]);
  });

  test('ocultar y mostrar con el botón', async ({ cmPage: page, consoleErrors }) => {
    await page.click('#rail-toggle');
    await off(page);
    await expect(html(page)).toHaveClass(/rail-hiding/);   // animación en curso
    await settled(page);
    await expect(page.locator('#rail-show')).toBeVisible();
    await expect(page.locator('#rail-show')).toBeVisible();
    await expect(page.locator('#rail-show')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#nav')).toBeHidden();
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('1');

    await page.click('#rail-show');
    await on(page);
    await settled(page);
    await expect(page.locator('#nav')).toBeVisible();
    await expect(page.locator('#rail-show')).toBeHidden();
    await expect(page.locator('#rail-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect((await lay(page, '#app')).x).toBeCloseTo(124, 0);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('0');
    expect(consoleErrors).toEqual([]);
  });

  test('Ctrl+B muestra/oculta, pero no actúa dentro de un input ni un contenteditable', async ({ cmPage: page }) => {
    await page.keyboard.press('Control+b');
    await off(page);
    await settled(page);
    await page.keyboard.press('Control+b');
    await on(page);
    await settled(page);

    await page.evaluate(() => {
      const i = document.createElement('input'); i.id = 'zz-in'; i.style.cssText = 'position:fixed;top:60px;left:400px;z-index:9999';
      const d = document.createElement('div'); d.id = 'zz-ce'; d.contentEditable = 'true'; d.textContent = 'x';
      d.style.cssText = 'position:fixed;top:100px;left:400px;z-index:9999;width:80px;height:20px';
      document.body.append(i, d);
    });
    await page.focus('#zz-in');
    await page.keyboard.press('Control+b');
    await on(page);
    await page.focus('#zz-ce');
    await page.keyboard.press('Control+b');
    await on(page);
  });

  test('persiste en localStorage y sobrevive a recargar', async ({ cmPage: page }) => {
    await page.click('#rail-toggle');
    await settled(page);
    await page.reload();
    await waitForBoot(page);
    await completeLoginOverlay(page);
    await off(page);
    await expect(page.locator('#nav')).toBeHidden();
    await expect(page.locator('#rail-show')).toBeVisible();
    expect((await lay(page, '#app')).x).toBe(0);
    // volver a mostrar y recargar: queda visible
    await page.click('#rail-show');
    await settled(page);
    await page.reload();
    await waitForBoot(page);
    await completeLoginOverlay(page);
    await on(page);
    await expect(page.locator('#nav')).toBeVisible();
  });

  test('oculto, #app ocupa todo el ancho', async ({ cmPage: page }) => {
    await page.click('#rail-toggle');
    await settled(page);
    const b = await lay(page, '#app');
    expect(b.x).toBe(0);
    expect(b.w).toBe(1440);
    // y el status-bar sigue arriba, a todo lo ancho
    const tk = await lay(page, '#ticker');
    expect(tk.x).toBe(0);
    expect(tk.w).toBe(1440);
  });

  test('la línea de energía toma el color de la sección activa', async ({ cmPage: page }) => {
    await page.click('#rail-toggle');
    await settled(page);
    await page.click('#rail-show');   // volver a mostrar para cambiar de sección con el rail
    await settled(page);
    await page.click('.nav-btn[data-tab="finanzas"]');
    await expect(html(page)).toHaveAttribute('data-rail-tab', 'finanzas');
    await page.click('#rail-toggle');
    await settled(page);
    const [accent, expected] = await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--c-finanzas');
      document.body.append(probe);
      const exp = getComputedStyle(probe).color; probe.remove();
      return [getComputedStyle(document.querySelector('.re-line')).backgroundImage, exp];
    });
    expect(accent).toContain(expected);
  });

  test('vista rápida: el mouse en el borde asoma el rail, se cambia de sección y se esconde al salir', async ({ cmPage: page, consoleErrors }) => {
    await page.click('#rail-toggle');
    await settled(page);
    await page.mouse.move(300, 400);
    await page.mouse.move(2, 400);
    await expect(html(page)).toHaveClass(/rail-peek/);
    await expect(page.locator('#nav')).toBeVisible();
    await expect.poll(async () => (await box(page, '#nav')).x, { timeout: 3000 }).toBe(0);
    // flota sobre el contenido: el layout no se mueve
    expect((await lay(page, '#app')).x).toBe(0);

    await page.mouse.move(60, 300);
    await page.click('.nav-btn[data-tab="vida"]');
    await expect(page.locator('#tab-vida')).toHaveClass(/active/);
    await expect(html(page)).toHaveClass(/rail-peek/);   // sigue asomado mientras el mouse está encima

    await page.mouse.move(800, 500);
    await expect(html(page)).not.toHaveClass(/rail-peek/);
    await expect(page.locator('#nav')).toBeHidden();
    await off(page);   // sigue oculto (la preferencia no cambió)
    expect(consoleErrors).toEqual([]);
  });

  test('el mouse pasando rápido por el borde no dispara la vista rápida', async ({ cmPage: page }) => {
    await page.click('#rail-toggle');
    await settled(page);
    await page.mouse.move(300, 400);
    await page.mouse.move(2, 400);
    await page.mouse.move(300, 400);
    await page.waitForTimeout(450);
    await expect(html(page)).not.toHaveClass(/rail-peek/);
  });

  test('en la vista rápida, » fija la barra', async ({ cmPage: page }) => {
    await page.click('#rail-toggle');
    await settled(page);
    await page.mouse.move(300, 400);
    await page.mouse.move(2, 400);
    await expect(html(page)).toHaveClass(/rail-peek/);
    await expect(page.locator('#rail-toggle')).toHaveAttribute('aria-label', 'Fijar barra lateral');
    await page.mouse.move(60, 400);
    await page.click('#rail-toggle');
    await on(page);
    await settled(page);
    await expect(html(page)).not.toHaveClass(/rail-peek/);
    expect((await lay(page, '#app')).x).toBeCloseTo(124, 0);
    await expect(page.locator('#nav')).toBeVisible();
  });

  test('oculto, el rail no es enfocable con Tab (sí el botón ⟩)', async ({ cmPage: page }) => {
    await page.click('#rail-toggle');
    await settled(page);
    await expect(page.locator('#nav')).toBeHidden();
    // Shift+Tab desde ⟩ sale hacia atrás sin pasar por el rail; Tab desde ahí vuelve directo a ⟩
    await page.focus('#rail-show');
    await page.keyboard.press('Shift+Tab');
    const prev = await page.evaluate(() => ({ inNav: !!document.activeElement.closest('#nav'), id: document.activeElement.id }));
    expect(prev.inNav).toBe(false);
    expect(prev.id).not.toBe('rail-show');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('rail-show');
    // y cualquier Tab hacia adelante tampoco cae en el rail
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('#nav')), 'Tab cayó dentro del rail oculto').toBe(false);
    }
    await page.focus('#rail-show');
    // con teclado: Enter sobre ⟩ vuelve a mostrar
    await page.focus('#rail-show');
    await page.keyboard.press('Enter');
    await on(page);
  });

  test('reducir movimiento: sin animaciones, el cambio es instantáneo', async ({ cmPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#rail-toggle');
    await off(page);
    await settled(page);   // nunca entra en rail-hiding
    await expect(page.locator('#rail-show')).toBeVisible();
    const anim = await page.evaluate(() => ({
      glow: getComputedStyle(document.querySelector('.re-glow')).animationName,
      spark: getComputedStyle(document.querySelector('.re-spark')).animationName,
      edge: getComputedStyle(document.querySelector('#rail-edge')).animationName,
      nav: getComputedStyle(document.querySelector('#nav')).transitionDuration,
    }));
    expect(anim.glow).toBe('none');
    expect(anim.spark).toBe('none');
    expect(anim.edge).toBe('none');
    expect(anim.nav).toBe('0s');
    await expect(page.locator('#nav')).toBeHidden();
    await page.click('#rail-show');
    await on(page);
    await settled(page);
    await expect(page.locator('#nav')).toBeVisible();
  });
});

test.describe('celular (390): sin cambios', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('la barra inferior queda igual, sin botón ni línea, y Ctrl+B no hace nada', async ({ cmPage: page, consoleErrors }) => {
    const n = await page.locator('#nav').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, w: r.width, bottom: r.bottom, h: r.height, dir: getComputedStyle(el).flexDirection };
    });
    expect(n.x).toBe(0);
    expect(n.w).toBe(390);
    expect(n.bottom).toBe(844);
    expect(n.h).toBeLessThan(110);
    expect(n.dir).toBe('row');
    await expect(page.locator('#rail-toggle')).toBeHidden();
    await expect(page.locator('#rail-show')).toBeHidden();
    expect((await lay(page, '#app')).x).toBe(0);
    await page.keyboard.press('Control+b');
    await expect(html(page)).not.toHaveClass(/rail-off/);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
    await page.click('.nav-btn[data-tab="salud"]');
    await expect(page.locator('#tab-salud')).toHaveClass(/active/);
    expect(consoleErrors).toEqual([]);
  });
});
