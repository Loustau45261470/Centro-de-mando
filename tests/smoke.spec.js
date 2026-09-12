// Test de humo: la app arranca y renderiza sin una sola excepción en consola.
// Es el test más valioso — cualquier regresión que rompa el boot lo hace fallar.
'use strict';
const { test, expect } = require('./support/fixtures');

test.describe('humo', () => {
  test('la app arranca, hace login y renderiza sin errores de consola', async ({ cmPage, consoleErrors }) => {
    // cmPage ya esperó el boot y completó el login al resolverse el fixture.
    await expect(cmPage.locator('#tab-jarvis')).toBeVisible();
    await expect(cmPage.locator('#login-screen')).toHaveCount(0);

    expect(consoleErrors, 'no debe haber console.error ni excepciones no capturadas al bootear').toEqual([]);
  });
});
