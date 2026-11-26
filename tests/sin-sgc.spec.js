// El SGC (cards "🛡 SGC · ..." en Análisis de Salud/Finanzas) se quitó: ninguna sección lo muestra y no hay errores.
'use strict';
const { test, expect } = require('./support/fixtures');

const SHOTS = process.env.SGC_SHOTS || '';

test('ninguna sección muestra cards SGC y no hay errores de consola', async ({ cmPage: page, consoleErrors }) => {
  for (const tab of ['jarvis', 'vida', 'salud', 'finanzas', 'conocimiento', 'ia']) {
    await page.click(`.nav-btn[data-tab="${tab}"]`);
    await expect(page.locator('#tab-' + tab)).toHaveClass(/active/);
    await page.waitForTimeout(1200);
    const hallado = await page.evaluate(() => ({
      ids: document.querySelectorAll('[id^="sgc-"]').length,
      texto: /SGC|Progresión de volumen|Precisión de proyecciones/.test(document.body.innerText),
      api: typeof window.SGC,
    }));
    expect(hallado, 'sección ' + tab).toEqual({ ids: 0, texto: false, api: 'undefined' });
    if (SHOTS && (tab === 'salud' || tab === 'finanzas')) {
      const w = page.viewportSize().width;
      await page.screenshot({ path: `${SHOTS}/${tab}-${w}.png`, fullPage: true });
    }
  }
  expect(consoleErrors).toEqual([]);
});
