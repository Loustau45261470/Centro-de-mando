// "Foto ticket" / gasto por foto: función eliminada de la app (pedido explícito del usuario).
// Prueba la AUSENCIA: sin módulo, sin globales, sin botón, y sin referencias colgando (script tag o entrada del SHELL del
// service worker apuntando a un archivo inexistente: eso rompería la instalación del SW en los dispositivos).
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/fixtures');

const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const esLocal = (src) => !/^(https?:)?\/\//i.test(src) && !/^data:/i.test(src);
const limpiar = (src) => src.split('#')[0].split('?')[0];

test('1) el archivo gasto-foto.js ya no existe y nada del repo de la app lo nombra', () => {
  expect(fs.existsSync(path.join(RAIZ, 'gasto-foto.js'))).toBe(false);
  for (const f of ['index.html', 'sw.js', 'app.js', 'finanzas.js', 'jarvis-agent.js', 'command-palette.js', 'busqueda-global.js', 'secciones-fab.js', 'speed-dial.js', 'manifest.json']) {
    expect(leer(f), f).not.toMatch(/gasto-foto|abrirGastoFoto|CMGastoFoto|gf-overlay/);
  }
});

test('2) todo <script src> y <link href> local de index.html apunta a un archivo que existe', () => {
  const html = leer('index.html');
  const refs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g), ...html.matchAll(/<link[^>]*\shref="([^"]+)"/g)].map((m) => m[1]).filter(esLocal);
  expect(refs.length).toBeGreaterThan(20);
  const faltan = refs.filter((r) => !fs.existsSync(path.join(RAIZ, limpiar(r))));
  expect(faltan).toEqual([]);
});

test('3) cada archivo local del SHELL del service worker existe en disco', () => {
  const sw = leer('sw.js');
  const bloque = sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\];/);
  expect(bloque, 'no se encontró const SHELL en sw.js').not.toBeNull();
  const entradas = [...bloque[1].matchAll(/BASE\s*\+\s*'([^']*)'/g)].map((m) => m[1]).filter((e) => e !== '');
  expect(entradas.length).toBeGreaterThan(20);
  const faltan = entradas.filter((e) => !fs.existsSync(path.join(RAIZ, limpiar(e))));
  expect(faltan).toEqual([]);
});

test('4) no existen abrirGastoFoto ni CMGastoFoto en window ni botón/ids de la foto de ticket', async ({ cmPage, consoleErrors }) => {
  const r = await cmPage.evaluate(() => ({
    fn: typeof window.abrirGastoFoto,
    obj: typeof window.CMGastoFoto,
    ids: ['gf-overlay', 'gf-body', 'gf-take-btn'].filter((id) => document.getElementById(id)),
    clases: document.querySelectorAll('[class*="gf-"]').length,
    html: /gasto-foto|abrirGastoFoto|foto ticket/i.test(document.documentElement.outerHTML),
  }));
  expect(r).toEqual({ fn: 'undefined', obj: 'undefined', ids: [], clases: 0, html: false });
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);
  await expect(cmPage.getByText('Foto ticket')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('5) cargar Finanzas y abrir cada overlay del FAB no genera errores de consola', async ({ cmPage, consoleErrors }) => {
  // El overlay de Informes pide data/cartera/<mes>.json, que puede no existir (404 ajeno a esta función): se sirve vacío.
  await cmPage.route('**/data/cartera/*.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await cmPage.click('.nav-btn[data-tab="finanzas"]');
  await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);
  const etiquetas = await cmPage.evaluate(() => [...document.querySelectorAll('#sd-finanzas .cm-sd-item')].map((b) => b.getAttribute('aria-label')));
  expect(etiquetas.length).toBeGreaterThanOrEqual(5);
  for (const label of etiquetas) {
    await cmPage.locator('#sd-finanzas .cm-sd-main').click();
    await cmPage.locator(`#sd-finanzas .cm-sd-item[aria-label="${label}"]`).click();
    await cmPage.waitForTimeout(250);
    await cmPage.keyboard.press('Escape');
    await cmPage.keyboard.press('Escape');
  }
  expect(consoleErrors).toEqual([]);
});
