// D3 — anillo del Pomodoro en bloques: N segmentos en círculo, encendidos según el tiempo transcurrido.
'use strict';
const fs = require('fs');
const { test, expect } = require('./support/fixtures');
const OUT = 'C:/Users/Tobias/AppData/Local/Temp/claude/5d52610f902b8d2c/0ee1a2f9-6695-4db7-81d3-bffab298c7c8/scratchpad/d3-pomo';

async function iniciar(page) {
  await page.evaluate(() => { S.pomodoroHistory = []; openSesionEstudioOverlay(); });
  await page.evaluate(() => { Pomodoro.bump('study', -5); Pomodoro.bump('cycles', -3); }); // 20 min, 1 ciclo
  await page.click('#ov-pomodoro .pomo-start');
}
async function shot(page, path) {
  const b = await page.locator('#ov-pomodoro .pomo-run').boundingBox();
  await page.screenshot({ path, clip: { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(b.width, page.viewportSize().width), height: b.height } });
}
const lit = (page) => page.locator('#ov-pomodoro .pomo-seg.on').count();

test('hay 60 bloques en círculo y se encienden proporcional al tiempo', async ({ cmPage }) => {
  await iniciar(cmPage);
  await expect(cmPage.locator('#ov-pomodoro .pomo-seg')).toHaveCount(60);
  expect(await lit(cmPage)).toBe(0);
  await expect(cmPage.locator('#ov-pomodoro .pomo-seg.cur')).toHaveCount(1);
  // Adelantar el reloj 10 de 20 min -> mitad = 30 bloques (recalcula por tiempo al volver a la pestaña).
  await cmPage.evaluate(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 600000;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const n = await lit(cmPage);
  expect(n).toBeGreaterThanOrEqual(29); expect(n).toBeLessThanOrEqual(31);
  // Posiciones en círculo: el bloque 15 queda a 90deg del primero.
  const ang = await cmPage.evaluate(() => {
    const seg = document.querySelectorAll('#ov-pomodoro .pomo-seg');
    const c = (el) => { const r = getComputedStyle(el, '::before'); return el.getBoundingClientRect(); };
    const dial = document.querySelector('#ov-pomodoro .pomo-dial').getBoundingClientRect();
    return [seg[0], seg[15]].map((s) => getComputedStyle(s).transform);
  });
  expect(ang[0]).not.toBe(ang[1]);
  fs.mkdirSync(OUT, { recursive: true });
  const vp = cmPage.viewportSize();
  await shot(cmPage, `${OUT}/pomo-${vp.width}.png`);
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await cmPage.waitForTimeout(200);
  expect(await cmPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(cmPage, `${OUT}/pomo-390.png`);
});

test('pausa congela el cabezal; reduced-motion lo deja sin animación', async ({ cmPage }) => {
  await cmPage.emulateMedia({ reducedMotion: 'reduce' });
  await iniciar(cmPage);
  const anim = await cmPage.locator('#ov-pomodoro .pomo-seg.cur').evaluate((e) => getComputedStyle(e, '::before').animationName);
  expect(anim).toBe('none');
  await cmPage.emulateMedia({ reducedMotion: 'no-preference' });
  const anim2 = await cmPage.locator('#ov-pomodoro .pomo-seg.cur').evaluate((e) => getComputedStyle(e, '::before').animationName);
  expect(anim2).toBe('pomo-seg-head');
  await cmPage.evaluate(() => Pomodoro.togglePause());
  const anim3 = await cmPage.locator('#ov-pomodoro .pomo-seg.cur').evaluate((e) => getComputedStyle(e, '::before').animationName);
  expect(anim3).toBe('none');
});
