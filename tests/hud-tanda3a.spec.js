// HUD tanda 3a (E1 barra inferior con luz, E2 marquesina, E4 buscador con barrido, E12 insignia que se enciende).
// Solo animan en el evento; reduced-motion = sin animación; datos sembrados en memoria (nada a Firestore).
'use strict';
const { test, expect } = require('./support/fixtures');

const SHOT = (n) => (process.env.T3A_DIR ? { path: process.env.T3A_DIR + '/' + n + '.png' } : undefined);

test.describe('E1 barra inferior con luz (celular)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('cambiar de sección desliza la luz a la pestaña con el color de la sección; resize no anima', async ({ cmPage: p, consoleErrors }) => {
    await expect(p.locator('#nav-glow')).toBeVisible();
    await p.waitForTimeout(300);
    await p.click('.nav-btn[data-tab="finanzas"]');
    const r = await p.evaluate(() => {
      const g = document.getElementById('nav-glow'), b = document.querySelector('.nav-btn[data-tab="finanzas"]');
      return { mv: g.classList.contains('mv'), go: g.classList.contains('go'), gx: g.style.getPropertyValue('--gx'), left: b.offsetLeft + 'px', tab: g.dataset.tab, bg: getComputedStyle(g).backgroundColor };
    });
    expect(r).toMatchObject({ mv: true, go: true, gx: r.left, tab: 'finanzas' });
    await p.waitForTimeout(700);
    const pos = await p.evaluate(() => { const g = document.getElementById('nav-glow').getBoundingClientRect(), b = document.querySelector('.nav-btn.active').getBoundingClientRect(); return { dx: Math.abs(g.left - b.left), dw: Math.abs(g.width - b.width), bg: getComputedStyle(document.getElementById('nav-glow')).backgroundColor }; });
    expect(pos.dx).toBeLessThan(2); expect(pos.dw).toBeLessThan(2);
    expect(pos.bg).toBe('rgb(22, 179, 100)'); // --c-finanzas #16B364
    await p.evaluate(() => window.dispatchEvent(new Event('resize')));
    expect(await p.evaluate(() => { const g = document.getElementById('nav-glow'); return g.classList.contains('mv') || g.classList.contains('go'); })).toBe(false);
    await p.screenshot(SHOT('e1-390'));
    expect(consoleErrors).toEqual([]);
  });

  test('reduced-motion: la luz salta sin animar', async ({ cmPage: p }) => {
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.click('.nav-btn[data-tab="salud"]');
    const r = await p.evaluate(() => { const g = document.getElementById('nav-glow'); return { mv: g.classList.contains('mv'), go: g.classList.contains('go'), tab: g.dataset.tab }; });
    expect(r).toEqual({ mv: false, go: false, tab: 'salud' });
  });

  test('sin scroll horizontal', async ({ cmPage: p }) => {
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe('E1 en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test('el rail lateral no usa la luz', async ({ cmPage: p }) => {
    expect(await p.evaluate(() => getComputedStyle(document.getElementById('nav-glow')).display)).toBe('none');
    await p.click('.nav-btn[data-tab="vida"]');
    expect(await p.evaluate(() => document.getElementById('nav-glow').classList.contains('mv'))).toBe(false);
  });
});

test.describe('E2 marquesina', () => {
  test('dato nuevo parpadea y pasa la luz; render repetido y primer render no', async ({ cmPage: p, consoleErrors }) => {
    const cls = () => p.evaluate(() => ({ sweep: document.getElementById('ticker').classList.contains('tk-sweep'), nuevos: document.querySelectorAll('#ticker-inner .tk-new').length }));
    await p.evaluate(() => { window._tkPrev = undefined; document.getElementById('ticker').classList.remove('tk-sweep'); buildTickerAlerts(); });
    expect(await cls()).toEqual({ sweep: false, nuevos: 0 });
    await p.evaluate(() => buildTickerAlerts());
    expect(await cls()).toEqual({ sweep: false, nuevos: 0 });
    await p.evaluate(() => { const d = new Date(Date.now() + 86400000); S.orders.push({ id: 'zz1', name: 'Pedido ZZ', arrival: d.toISOString().slice(0, 10) }); buildTickerAlerts(); });
    const r = await cls();
    expect(r.sweep).toBe(true); expect(r.nuevos).toBeGreaterThan(0);
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('#ticker-inner .tk-new')).animationName)).toBe('tk-new');
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('#ticker-inner .ticker-item.ok'), '::before').width)).toBe('6px');
    await p.screenshot(SHOT('e2-' + (await p.evaluate(() => innerWidth))));
    await p.hover('#ticker');
    expect(await p.evaluate(() => getComputedStyle(document.getElementById('ticker-inner')).animationPlayState)).toBe('paused');
    expect(await p.locator('#ticker').count()).toBe(1);
    expect(consoleErrors).toEqual([]);
  });
  test('reduced-motion: sin parpadeo ni luz', async ({ cmPage: p }) => {
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.evaluate(() => { window._tkPrev = undefined; buildTickerAlerts(); const d = new Date(Date.now() + 86400000); S.orders.push({ id: 'zz2', name: 'Pedido YY', arrival: d.toISOString().slice(0, 10) }); buildTickerAlerts(); });
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('#ticker-inner .tk-new')).animationName)).toBe('none');
    expect(await p.evaluate(() => getComputedStyle(document.getElementById('ticker'), '::after').animationName)).toBe('none');
  });
});

test.describe('E4 buscador con barrido', () => {
  test('al abrir hay barrido, el tipeo es inmediato y los resultados son los correctos', async ({ cmPage: p, consoleErrors }) => {
    await p.keyboard.press('Control+k');
    expect(await p.evaluate(() => document.activeElement && document.activeElement.id)).toBe('cmdk-input');
    expect(await p.evaluate(() => getComputedStyle(document.getElementById('cmdk-panel'), '::after').animationName)).toBe('cmdk-sw');
    await p.keyboard.type('finanzas', { delay: 0 });
    await expect(p.locator('#cmdk-input')).toHaveValue('finanzas');
    const items = await p.locator('.cmdk-item .ci-lbl').allInnerTexts();
    expect(items.some((t) => t === 'Ir a Finanzas')).toBe(true);
    expect(items.some((t) => t === 'Ir a Salud')).toBe(false);
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('.cmdk-item')).animationName)).toBe('cmdk-it');
    await p.waitForTimeout(700);
    await p.screenshot(SHOT('e4-' + (await p.evaluate(() => innerWidth))));
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
    await expect(p.locator('#cmdk-overlay')).not.toHaveClass(/open/);
    expect(consoleErrors).toEqual([]);
  });
  test('reduced-motion: sin barrido ni entrada escalonada', async ({ cmPage: p }) => {
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.keyboard.press('Control+k');
    expect(await p.evaluate(() => getComputedStyle(document.getElementById('cmdk-panel'), '::after').animationName)).toBe('none');
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('.cmdk-item')).animationName)).toBe('none');
  });
});

test.describe('E12 insignia que se enciende', () => {
  const desbloquear = (p) => p.evaluate(() => { if (!GM) GM = gmDefault(); GM.config.animaciones = true; _gmNewLogros = [{ name: 'Logro ZZ', rareza: 'raro' }]; gmFlushFeedback(); });
  test('el desbloqueo carga el borde, se enciende y suelta chispas una sola vez', async ({ cmPage: p, consoleErrors }) => {
    await desbloquear(p);
    await expect(p.locator('.gm-toast-logro')).toHaveCount(1);
    await expect(p.locator('.gm-toast-logro.gx-chg')).toHaveCount(1);
    await p.evaluate(() => { _gmNewLogros = []; gmFlushFeedback(); });
    await expect(p.locator('.gm-toast-logro')).toHaveCount(1);
    await expect(p.locator('.gm-toast-logro.gx-on')).toHaveCount(1, { timeout: 3000 });
    await p.screenshot(SHOT('e12-' + (await p.evaluate(() => innerWidth))));
    await expect(p.locator('.gm-toast-logro')).toHaveCount(0, { timeout: 6000 });
    expect(consoleErrors).toEqual([]);
  });
  test('reduced-motion: aparece ya encendida, sin carga ni chispas', async ({ cmPage: p }) => {
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await desbloquear(p);
    await expect(p.locator('.gm-toast-logro.gx-on')).toHaveCount(1);
    expect(await p.locator('.gm-toast-logro.gx-chg').count()).toBe(0);
    expect(await p.locator('.gx-sp').count()).toBe(0);
  });
});
