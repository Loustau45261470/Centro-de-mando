// A 390px de ancho (celular), el body no debe generar scroll horizontal en
// ninguna de las 6 tabs. Fuerza el viewport del propio test (independiente del
// proyecto de Playwright que lo corra) para que sea determinístico también en
// el proyecto "chromium-desktop".
'use strict';
const { test, expect } = require('./support/fixtures');

const TABS = ['jarvis', 'vida', 'finanzas', 'conocimiento', 'salud', 'ia'];

test.describe('responsive 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ninguna tab produce scroll horizontal en el body', async ({ cmPage }) => {
    for (const tab of TABS) {
      if (tab !== 'jarvis') {
        await cmPage.click(`.nav-btn[data-tab="${tab}"]`);
        await expect(cmPage.locator(`#tab-${tab}`)).toHaveClass(/active/);
      }
      const { scrollWidth, clientWidth } = await cmPage.evaluate(() => ({
        scrollWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `body.scrollWidth en tab "${tab}" no debe exceder el viewport (390px)`).toBeLessThanOrEqual(clientWidth + 1);
    }
  });
});
