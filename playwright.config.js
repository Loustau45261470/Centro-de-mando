'use strict';
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Un reintento tambien en local: separa el flake de infraestructura de una
  // rotura real. Si pasa al reintentar, se reporta como flaky, no como verde.
  retries: process.env.CI ? 2 : 1,
  // La app abre muchas animaciones en <canvas> (login, JARVIS) que corren en
  // segundo plano por instancia — muchos workers en paralelo compiten por CPU
  // y algunos pasos (abrir el overlay de Planificación) empiezan a superar el
  // timeout por contención, no por lógica de test. 4 es el techo que se probó
  // estable en local; en CI (runners más chicos) igual queda acotado.
  workers: 4,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }]],
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // 'retain-on-failure' graba la traza de TODOS los tests y descarta las que
    // pasan: con varios workers en Windows esa escritura/borrado concurrente en
    // test-results/ hace fallar browserContext.close() con ENOENT sobre su propio
    // archivo .trace — falla del harness, no de la app. Con 'on-first-retry' no se
    // graba nada mientras todo pasa, y ante una falla real el reintento deja la traza.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Bloqueado a nivel de contexto: _pwaInit() intenta registrar sw.js al bootear
    // y no queremos que un Service Worker real interfiera con los tests.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `node tests/server.js`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
