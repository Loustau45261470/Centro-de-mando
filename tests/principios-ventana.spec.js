// Principios como ventana (ya no es una pestaña del menú) + cierre del día con el mismo aviso que la Revisión semanal.
'use strict';
const { test, expect, waitForBoot, completeLoginOverlay } = require('./support/fixtures');

const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const mostrarAviso = (page) => page.addStyleTag({ content: '#fo-nudge{display:flex!important}' });   // el fixture lo oculta
// Reloj local simulado (la hora se arma en la zona del propio equipo, igual que la app)
const a = (page, h, m = 0, dia = 12) => page.clock.setFixedTime(new Date(2026, 10, dia, h, m));
const limpiar = (page) => page.evaluate(() => { S.foco = undefined; localStorage.clear(); });

test.describe('Principios en ventana', () => {
  test('el menú principal ya no tiene Principios ni su panel', async ({ cmPage, consoleErrors }) => {
    await expect(cmPage.locator('.nav-btn[data-tab="principios"]')).toHaveCount(0);
    await expect(cmPage.locator('#tab-principios')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('abanico de Vida: abre la ventana; 5 sub-pestañas; crear principio y objetivo', async ({ cmPage, consoleErrors }, testInfo) => {
    await cmPage.click('.nav-btn[data-tab="vida"]');
    await cmPage.locator('#sd-vida .cm-sd-main').click();
    await cmPage.locator('#sd-vida .cm-sd-item[aria-label="Principios"]').click();
    await expect(cmPage.locator('#ov-principios.show')).toBeVisible();
    await expect(cmPage.locator('#ov-principios .pr-sub')).toHaveCount(5);
    expect(await sinScrollH(cmPage)).toBe(true);
    await cmPage.screenshot({ path: testInfo.outputPath('ventana-principios.png') });
    // principio
    await cmPage.locator('#ov-principios .pr-btn-p', { hasText: '+ Principio' }).click();
    await cmPage.locator('#ov-principios textarea, #ov-principios input.pr-in').first().fill('No postergar lo importante');
    await cmPage.locator('#ov-principios .pr-btn-p', { hasText: 'Guardar' }).click();
    expect(await cmPage.evaluate(() => S.principios.principios.map((p) => p.enunciado))).toContain('No postergar lo importante');
    // objetivo
    await cmPage.locator('#ov-principios .pr-sub', { hasText: 'Objetivos' }).click();
    await cmPage.locator('#ov-principios .pr-btn-p', { hasText: '+ Objetivo' }).click();
    await cmPage.locator('#ov-principios textarea, #ov-principios input.pr-in').first().fill('Terminar el módulo');
    await cmPage.locator('#ov-principios .pr-btn-p', { hasText: 'Guardar' }).click();
    expect(await cmPage.evaluate(() => S.principios.objetivos.map((o) => o.texto))).toContain('Terminar el módulo');
    // las otras sub-pestañas dibujan
    for (const t of ['Categorías', 'Huecos', 'Foco']) {
      await cmPage.locator('#ov-principios .pr-sub', { hasText: t }).click();
      await expect(cmPage.locator('#ov-principios .pr-sub.on')).toContainText(t);
      await expect(cmPage.locator('#ov-principios .pr-card').first()).toBeVisible();
    }
    expect(consoleErrors).toEqual([]);
  });

  test('paleta de comandos: "Principios" abre la ventana', async ({ cmPage }) => {
    await cmPage.keyboard.press('Control+k');
    await cmPage.fill('#cmdk-input', 'principios');
    await cmPage.locator('.cmdk-item').filter({ has: cmPage.locator('.ci-lbl', { hasText: /^Principios$/ }) }).click();
    await expect(cmPage.locator('#ov-principios.show')).toBeVisible();
    await expect(cmPage.locator('#ov-principios .pr-sub')).toHaveCount(5);
  });

  test('paleta de comandos: "cierre" abre el cierre del día', async ({ cmPage }) => {
    await cmPage.keyboard.press('Control+k');
    await cmPage.fill('#cmdk-input', 'cierre');
    await cmPage.locator('.cmdk-item').filter({ has: cmPage.locator('.ci-lbl', { hasText: /^Cierre del día$/ }) }).click();
    await expect(cmPage.locator('#ov-foco-cierre.show #fo-nota')).toBeVisible();
  });

  test('formulario a medio escribir: sobrevive a cerrar con Esc y a abrir el chequeo', async ({ cmPage }) => {
    await cmPage.evaluate(() => Principios.abrir());
    await cmPage.locator('#ov-principios .pr-btn-p', { hasText: '+ Principio' }).click();
    await cmPage.fill('#prf-enun', 'Texto a medias');
    await cmPage.keyboard.press('Escape');
    await expect(cmPage.locator('#ov-principios.show')).toHaveCount(0);
    await cmPage.evaluate(() => Principios.abrir());
    await expect(cmPage.locator('#prf-enun')).toHaveValue('Texto a medias');
    // deep-link al chequeo con el formulario abierto
    await cmPage.fill('#prf-enun', 'Texto a medias 2');
    await cmPage.evaluate(() => Foco.abrirDestino());
    await expect(cmPage.locator('#ov-principios .pr-sub.on')).toContainText('Foco');
    await expect(cmPage.locator('#fo-chequeo .fo-cat')).toHaveCount(7);
    await cmPage.locator('#ov-principios .pr-sub', { hasText: 'Principios' }).click();
    await expect(cmPage.locator('#prf-enun')).toHaveValue('Texto a medias 2');
  });

  test('#foco-chequeo abre la ventana en Foco con el chequeo listo', async ({ cmPage }) => {
    await cmPage.goto('/?t=2#foco-chequeo');
    await waitForBoot(cmPage);
    await completeLoginOverlay(cmPage);
    await expect(cmPage.locator('#ov-principios.show')).toBeVisible();
    await expect(cmPage.locator('#ov-principios .pr-sub.on')).toContainText('Foco');
    await expect(cmPage.locator('#fo-chequeo .fo-cat')).toHaveCount(7);
  });
});

test.describe('Cierre del día como la Revisión semanal', () => {
  test('21:00 sin registro: aparece; cerrar no pierde lo tipeado; guardar cierra y no reaparece', async ({ cmPage, consoleErrors }, testInfo) => {
    await limpiar(cmPage);
    await mostrarAviso(cmPage);
    await a(cmPage, 21);
    await cmPage.evaluate(() => Foco.chequearAviso());
    await expect(cmPage.locator('#fo-nudge')).toBeVisible();
    expect(await cmPage.locator('#fo-nudge .btn').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await cmPage.screenshot({ path: testInfo.outputPath('cierre-aviso.png') });
    await cmPage.locator('#fo-nudge .btn').click();
    await expect(cmPage.locator('#ov-foco-cierre.show')).toBeVisible();
    expect(await sinScrollH(cmPage)).toBe(true);
    await cmPage.locator('#ov-foco-cierre .fo-n').nth(3).click();   // atención 4
    await cmPage.fill('#fo-nota', 'Redes y mails');
    await cmPage.screenshot({ path: testInfo.outputPath('cierre-ventana.png') });
    await cmPage.locator('#ov-foco-cierre .cm-ov-close').click();      // cerrar sin guardar
    await expect(cmPage.locator('#fo-nudge')).toBeVisible();            // sigue el aviso
    await cmPage.locator('#fo-nudge .btn').click();
    await expect(cmPage.locator('#fo-nota')).toHaveValue('Redes y mails');
    await expect(cmPage.locator('#ov-foco-cierre .fo-n.on')).toHaveCount(1);
    await cmPage.locator('#ov-foco-cierre .fo-n').nth(5).click();       // energía 1 (segunda escala, primer botón)
    await expect(cmPage.locator('#fo-nota')).toHaveValue('Redes y mails');
    await cmPage.locator('#ov-foco-cierre .pr-btn-p', { hasText: 'Guardar' }).click();
    await expect(cmPage.locator('#ov-foco-cierre.show')).toHaveCount(0);
    await expect(cmPage.locator('#fo-nudge')).toHaveCount(0);
    const r = await cmPage.evaluate(() => ({ d: S.foco.dias, hoy: foHoyCierre() }));
    expect(r.d[r.hoy]).toMatchObject({ atencion: 4, energia: 1, nota: 'Redes y mails' });
    await cmPage.evaluate(() => Foco.chequearAviso());
    await expect(cmPage.locator('#fo-nudge')).toHaveCount(0);           // no reaparece
    expect(consoleErrors).toEqual([]);
  });

  test('descartar con la X: no vuelve ese día', async ({ cmPage }) => {
    await limpiar(cmPage);
    await mostrarAviso(cmPage);
    await a(cmPage, 22);
    await cmPage.evaluate(() => Foco.chequearAviso());
    await cmPage.locator('#fo-nudge .icon-btn').click();
    await cmPage.evaluate(() => Foco.chequearAviso());
    await expect(cmPage.locator('#fo-nudge')).toHaveCount(0);
  });

  test('15:00 no aparece; 02:00 aparece y guarda para el día anterior', async ({ cmPage }) => {
    await limpiar(cmPage);
    await mostrarAviso(cmPage);
    await a(cmPage, 15);
    await cmPage.evaluate(() => Foco.chequearAviso());
    await expect(cmPage.locator('#fo-nudge')).toHaveCount(0);
    await a(cmPage, 2, 0, 13);
    await cmPage.evaluate(() => Foco.chequearAviso());
    await expect(cmPage.locator('#fo-nudge')).toBeVisible();
    await cmPage.locator('#fo-nudge .btn').click();
    await cmPage.locator('#ov-foco-cierre .fo-n').nth(2).click();
    await cmPage.locator('#ov-foco-cierre .fo-n').nth(7).click();
    await cmPage.locator('#ov-foco-cierre .pr-btn-p', { hasText: 'Guardar' }).click();
    expect(await cmPage.evaluate(() => Object.keys(S.foco.dias))).toEqual(['2026-11-12']);
  });

  test('Foco ya no trae el formulario, pero sí el acceso "Hacer el cierre de hoy"', async ({ cmPage }) => {
    await a(cmPage, 15);
    await cmPage.evaluate(() => { S.foco = undefined; Foco.chequearAviso(); Principios.abrir('foco'); });
    await expect(cmPage.locator('#ov-principios #fo-nota')).toHaveCount(0);
    await expect(cmPage.locator('#ov-principios .fo-n')).toHaveCount(0);
    await cmPage.locator('#ov-principios .fo-btn', { hasText: 'Hacer el cierre de hoy' }).click();
    await expect(cmPage.locator('#ov-foco-cierre.show #fo-nota')).toBeVisible();
    await expect(cmPage.locator('#fo-nudge')).toHaveCount(0);   // a las 15:00 el aviso no corre, el acceso sí
  });
});
