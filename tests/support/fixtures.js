'use strict';
const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { buildInitScript } = require('./mock-firebase');

const ESTADO_BASE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'estado-base.json'), 'utf8')
);

// Nunca pegarle a Firebase real ni a las APIs de LLM que JARVIS podría llamar.
// Se responde con fulfill() en vez de abort(): un request abortado igual queda
// logueado por Chromium como "Failed to load resource: net::ERR_FAILED" (tipo
// console 'error'), lo que rompería el test de humo aunque la app maneje bien
// el fallo. fulfill() con una respuesta vacía y 200 no genera ese ruido.
const BLOCKED_SCRIPT_PATTERNS = ['**/*gstatic.com/firebasejs/**'];
const BLOCKED_API_PATTERNS = [
  '**/*.googleapis.com/**',
  '**/*recaptcha*/**',
  '**/*firebaseapp.com/**',
  'https://api.anthropic.com/**',
  'https://api.groq.com/**',
  'https://api.elevenlabs.io/**',
  'https://openrouter.ai/**',
  'https://api.voyageai.com/**',
];

// Completa el login decorativo (login.js) usando las credenciales hardcodeadas
// en el propio código fuente del repo (público) — no son un secreto real, y
// automatizar el flujo real de UI es más robusto que tocar el código de la app.
async function completeLoginOverlay(page) {
  await page.fill('#login-user', 'Loustau11');
  await page.fill('#login-pass', 'Loustau88');
  await page.click('#login-btn');
  await page.locator('#login-screen').waitFor({ state: 'detached', timeout: 15000 });
}

async function waitForBoot(page) {
  await page.waitForFunction(() => _appBooted === true, null, { timeout: 15000 });
}

// Bugs REALES y preexistentes de la app, encontrados por este harness, que NO
// se corrigen acá (fuera de alcance del ticket T10 — "documentalo, no lo
// arregles"). Se separan de `consoleErrors` para que el harness quede
// determinístico y sirva para detectar regresiones NUEVAS, no para repetir en
// cada corrida un hallazgo ya reportado. Ver el reporte de T10 para el detalle.
const KNOWN_APP_BUGS = [
  {
    id: 'sgc-init-stale-S-race',
    match: /resolverProyecciones/,
  },
];

function classifyConsoleText(text, consoleErrors, knownAppBugs) {
  const known = KNOWN_APP_BUGS.find((k) => k.match.test(text));
  if (known) knownAppBugs.push({ id: known.id, text });
  else consoleErrors.push(text);
}

const test = base.test.extend({
  consoleErrors: async ({}, use) => {
    await use([]);
  },

  knownAppBugs: async ({}, use) => {
    await use([]);
  },

  cmPage: async ({ page, consoleErrors, knownAppBugs }, use) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') classifyConsoleText(msg.text(), consoleErrors, knownAppBugs);
    });
    page.on('pageerror', (err) => {
      classifyConsoleText('pageerror: ' + (err.stack || err.message), consoleErrors, knownAppBugs);
    });

    for (const pattern of BLOCKED_SCRIPT_PATTERNS) {
      await page.route(pattern, (route) =>
        route.fulfill({ status: 200, contentType: 'application/javascript', body: '// mocked in tests' })
      );
    }
    for (const pattern of BLOCKED_API_PATTERNS) {
      await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    }

    await page.addInitScript({ content: buildInitScript(ESTADO_BASE) });

    await page.goto('/');
    await waitForBoot(page);
    await completeLoginOverlay(page);

    await use(page);
  },
});

module.exports = {
  test,
  expect: base.expect,
  completeLoginOverlay,
  waitForBoot,
  ESTADO_BASE,
};
