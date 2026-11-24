// Cierre del día y Revisión semanal viven como ítems «Para hacer» en el panel de la campanita (sin carteles flotantes ni tarjeta grande).
'use strict';
const { test, expect } = require('./support/fixtures');

const a = (page, h, m = 0, dia = 12) => page.clock.setFixedTime(new Date(2026, 10, dia, h, m));   // 12/11 jueves, 15/11 domingo
const limpiar = (page) => page.evaluate(() => { S.foco = undefined; S.revisionSemanal = {}; localStorage.clear(); });
const refrescar = (page) => page.evaluate(() => Principios.chequearAvisos());
const bell = (p) => p.locator('#pr-avisos .pr-bell');
const item = (p, txt) => p.locator('#pr-av-panel .pr-av-rit', { hasText: txt });
const abrirPanel = async (p) => { if (!(await p.locator('#pr-av-panel').count())) await bell(p).click(); await expect(p.locator('#pr-av-panel')).toBeVisible(); };

test.describe('Rituales en la campanita', () => {
  test('21:00 sin cierre: no hay cartel ni tarjeta, la campanita tiene el punto; tocar el ítem abre el formulario y guardar lo quita', async ({ cmPage, consoleErrors }) => {
    await limpiar(cmPage); await a(cmPage, 21); await refrescar(cmPage);
    await expect(cmPage.locator('#fo-nudge, #rs-nudge, .rs-nudge')).toHaveCount(0);
    await expect(cmPage.locator('#pr-avisos .pr-av-card')).toHaveCount(0);
    await expect(bell(cmPage)).toHaveClass(/tiene/);
    await expect(cmPage.locator('#pr-avisos .pr-bell-n')).toHaveText('1');
    await abrirPanel(cmPage);
    await expect(item(cmPage, 'Cerrá el día')).toBeVisible();
    await item(cmPage, 'Cerrá el día').locator('.pr-btn-p').click();
    await expect(cmPage.locator('#ov-foco-cierre.show')).toBeVisible();
    await expect(cmPage.locator('#pr-av-panel')).toHaveCount(0);   // el panel se cierra al abrir el formulario
    await cmPage.locator('#ov-foco-cierre .fo-n').nth(3).click();
    await cmPage.locator('#ov-foco-cierre .fo-n').nth(7).click();
    await cmPage.locator('#ov-foco-cierre .pr-btn-p', { hasText: 'Guardar' }).click();
    await expect(cmPage.locator('#ov-foco-cierre.show')).toHaveCount(0);
    await expect(cmPage.locator('#pr-avisos .pr-bell-n')).toHaveCount(0);
    expect(await cmPage.evaluate(() => window.CMRituales.map((f) => f()).filter(Boolean).length)).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('domingo: la revisión semanal aparece como ítem, abre el overlay y al finalizar desaparece', async ({ cmPage, consoleErrors }) => {
    await limpiar(cmPage); await a(cmPage, 10, 0, 15); await refrescar(cmPage);
    await expect(cmPage.locator('#rs-nudge')).toHaveCount(0);
    await expect(bell(cmPage)).toHaveClass(/tiene/);
    await abrirPanel(cmPage);
    await expect(item(cmPage, 'Cerrá la semana')).toBeVisible();
    await expect(item(cmPage, 'Cerrá el día')).toHaveCount(0);   // a las 10:00 solo la semana
    await item(cmPage, 'Cerrá la semana').locator('.pr-btn-p').click();
    await expect(cmPage.locator('#ov-revision-semanal.show')).toBeVisible();
    await cmPage.evaluate(() => _rsFinalizar());
    await expect(cmPage.locator('#ov-revision-semanal.show')).toHaveCount(0);
    await expect(cmPage.locator('#pr-avisos .pr-bell-n')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('descartar respeta la regla actual: el cierre no vuelve ese día; la revisión no vuelve esa semana', async ({ cmPage }) => {
    await limpiar(cmPage); await a(cmPage, 21, 0, 15); await refrescar(cmPage);
    await expect(cmPage.locator('#pr-avisos .pr-bell-n')).toHaveText('2');
    await abrirPanel(cmPage);
    await item(cmPage, 'Cerrá el día').locator('.pr-btn', { hasText: 'Descartar' }).click();
    await expect(item(cmPage, 'Cerrá el día')).toHaveCount(0);
    await expect(item(cmPage, 'Cerrá la semana')).toBeVisible();
    await item(cmPage, 'Cerrá la semana').locator('.pr-btn', { hasText: 'Descartar' }).click();
    await refrescar(cmPage);
    await expect(cmPage.locator('#pr-av-panel .pr-av-rit, #pr-avisos .pr-bell-n')).toHaveCount(0);   // sin nada pendiente la campanita desaparece
    expect(await cmPage.evaluate(() => Object.keys(localStorage).filter((k) => /^cm_(fo|rs)_dismiss_/.test(k)).length)).toBe(2);
    // al día siguiente (lunes, mismo ISO week de la revisión pendiente) el cierre vuelve, la revisión no
    await a(cmPage, 21, 0, 16); await refrescar(cmPage);
    await abrirPanel(cmPage);
    await expect(item(cmPage, 'Cerrá el día')).toBeVisible();
    await expect(item(cmPage, 'Cerrá la semana')).toHaveCount(0);
  });

  test('15:00 un jueves: no aparece el cierre ni punto en la campanita (sin principios ni rituales la campanita ni se muestra); con el comando de la paleta sigue abriéndose', async ({ cmPage }) => {
    await limpiar(cmPage); await a(cmPage, 15); await refrescar(cmPage);
    await expect(cmPage.locator('#pr-avisos .pr-bell-n')).toHaveCount(0);
    await expect(cmPage.locator('#pr-avisos .pr-av-card, #pr-av-panel .pr-av-rit')).toHaveCount(0);
    await cmPage.evaluate(() => Foco.abrirCierre());
    await expect(cmPage.locator('#ov-foco-cierre.show')).toBeVisible();
  });

  test('390 px: la campanita y su panel no se superponen con la barra superior ni se salen de la pantalla', async ({ cmPage, consoleErrors }, testInfo) => {
    await cmPage.setViewportSize({ width: 390, height: 844 });
    await limpiar(cmPage); await a(cmPage, 21, 0, 15); await refrescar(cmPage);
    await abrirPanel(cmPage);
    await expect(cmPage.locator('#pr-av-panel .pr-av-rit')).toHaveCount(2);
    const r = await cmPage.evaluate(() => {
      const rc = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const b = rc('#pr-avisos .pr-bell'), t = rc('#trophy-btn'), p = rc('#pr-av-panel');
      const cruza = (x, y) => x && y && x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top;
      return { campTrofeo: cruza(b, t), panelOk: p.left >= 0 && p.right <= window.innerWidth && p.top >= 0 && p.bottom <= window.innerHeight, scrollH: document.documentElement.scrollWidth <= window.innerWidth,
        botones: [...document.querySelectorAll('#pr-av-panel .pr-av-rit .pr-btn')].every((e) => e.getBoundingClientRect().height >= 44) };
    });
    expect(r).toEqual({ campTrofeo: false, panelOk: true, scrollH: true, botones: true });
    await cmPage.screenshot({ path: testInfo.outputPath('campanita-390.png') });
    expect(consoleErrors).toEqual([]);
  });
});
