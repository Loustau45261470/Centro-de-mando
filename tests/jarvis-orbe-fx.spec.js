// Capa extra del orbe de JARVIS (jarvis-orbe-fx.js, propuesta HUD #9). Sin APIs reales: el estado se fuerza
// con JARVIS_FX.setState/setLevel y un stub de JARVIS.isSpeaking.
'use strict';
const fs = require('fs');
const { test, expect } = require('./support/fixtures');

const OUT = process.env.ORBE_SHOTS || '';
const frames = (p) => p.evaluate(() => (window.JARVIS_ORBE_FX ? JARVIS_ORBE_FX.frames : -1));

test.describe('jarvis · capa extra del orbe', () => {
  test('monta en la sección JARVIS, reacciona a cada estado y no tapa los controles', async ({ cmPage, consoleErrors }, info) => {
    await expect(cmPage.locator('#jarvis-orbe-fx')).toHaveCount(1);
    expect(await cmPage.evaluate(() => getComputedStyle(document.getElementById('jarvis-orbe-fx')).pointerEvents)).toBe('none');
    const w = info.project.name.includes('mobile') ? 390 : 1280;
    const estados = [
      ['reposo', () => { JARVIS_FX.setState('passive'); JARVIS_FX.setLevel(0); window.JARVIS.isSpeaking = () => false; }],
      ['escuchando', () => { JARVIS_FX.setState('command'); JARVIS_FX.setLevel(0.7); window.JARVIS.isSpeaking = () => false; }],
      ['pensando', () => { JARVIS_FX.setState('thinking'); JARVIS_FX.setLevel(0); window.JARVIS.isSpeaking = () => false; }],
      ['hablando', () => { JARVIS_FX.setState('command'); JARVIS_FX.setLevel(0); window.JARVIS.isSpeaking = () => true; }],
    ];
    for (const [nombre, fn] of estados) {
      await cmPage.evaluate(fn);
      await expect.poll(() => cmPage.evaluate(() => JARVIS_ORBE_FX.modo)).toBe(nombre);
      await cmPage.waitForTimeout(1200);
      if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await cmPage.locator('#jarvis-net').screenshot({ path: `${OUT}/orbe-${nombre}-${w}.png` }); }
    }
    expect(consoleErrors).toEqual([]);
  });

  test('se pausa con la sección oculta y con la pestaña oculta; reanuda al volver', async ({ cmPage }) => {
    const f0 = await frames(cmPage); await cmPage.waitForTimeout(600);
    expect(await frames(cmPage), 'corre en JARVIS').toBeGreaterThan(f0);
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await cmPage.waitForTimeout(300);
    const f1 = await frames(cmPage); await cmPage.waitForTimeout(800);
    expect(await frames(cmPage), 'quieta con JARVIS oculta').toBe(f1);
    expect(await cmPage.evaluate(() => JARVIS_ORBE_FX.corriendo)).toBe(false);
    await cmPage.click('.nav-btn[data-tab="jarvis"]');
    await expect(cmPage.locator('#jarvis-orbe-fx')).toHaveCount(1);
    const f2 = await frames(cmPage); await cmPage.waitForTimeout(600);
    expect(await frames(cmPage), 'reanuda').toBeGreaterThan(f2);
    await cmPage.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await cmPage.waitForTimeout(200);
    const f3 = await frames(cmPage); await cmPage.waitForTimeout(600);
    expect(await frames(cmPage), 'quieta con pestaña oculta').toBe(f3);
  });

  test('un toque en el orbe da un impulso sin romper el resto', async ({ cmPage }) => {
    const box = await cmPage.locator('#jarvis-net').boundingBox();
    await cmPage.mouse.click(box.x + box.width / 2, box.y + box.height * 0.49);
    await cmPage.waitForTimeout(150);
    expect(await cmPage.locator('#jarvis-net').isVisible()).toBe(true);
  });
});

test.describe('jarvis · capa extra del orbe · reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('sin la capa animada', async ({ cmPage }) => {
    await cmPage.waitForTimeout(500);
    await expect(cmPage.locator('#jarvis-orbe-fx')).toHaveCount(0);
    expect(await frames(cmPage)).toBe(0);
  });
});
