// Recorre las 6 tabs una por una: cada una debe activarse, mostrar contenido
// y no disparar ningún error de consola ni excepción no capturada.
'use strict';
const { test, expect } = require('./support/fixtures');

const TABS = ['jarvis', 'vida', 'finanzas', 'conocimiento', 'salud', 'ia'];

for (const tab of TABS) {
  test(`tab "${tab}" renderiza contenido sin errores`, async ({ cmPage, consoleErrors }) => {
    if (tab !== 'jarvis') {
      await cmPage.click(`.nav-btn[data-tab="${tab}"]`);
    }
    const panel = cmPage.locator(`#tab-${tab}`);
    await expect(panel).toHaveClass(/active/);
    await expect(panel).toBeVisible();

    // El panel activo tiene que tener contenido real, no quedar vacío.
    await expect
      .poll(async () => (await panel.innerText()).trim().length, { timeout: 5000 })
      .toBeGreaterThan(0);

    expect(consoleErrors, `sin errores de consola al entrar a "${tab}"`).toEqual([]);
  });
}
