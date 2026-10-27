// Movimientos · encabezado de la card: sin "Foto ticket", los tres botones restantes (Categorías, Tarjetas, + Movimiento)
// van en una sola fila y un poco más chicos que antes. Los datos de ejemplo viven solo acá.
'use strict';
const path = require('path');
const { test, expect } = require('./support/fixtures');
const { cerrarTarjetas } = require('./support/tarjetas-ui');

const TEXTOS = ['🎨 Categorías', '💳 Tarjetas', '+ Movimiento'];
const ANCHOS = [1920, 1440, 1280, 1024, 768, 390, 360];

// Los tests bloquean Google Fonts y medirían con la letra de respaldo del sistema (Segoe en Windows, DejaVu en Linux,
// más ancha): acá se carga la letra real de la app (Geist) para medir lo que se ve en el dispositivo.
async function letraReal(page) {
  await page.route('**/fonts.googleapis.com/**', (r) => r.continue());
  await page.evaluate(() => new Promise((ok) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap&t=' + Date.now();
    l.onload = ok; l.onerror = ok;
    document.head.appendChild(l);
  }));
  await page.evaluate(() => document.fonts.load('600 13px Geist').then(() => document.fonts.ready));
  expect(await page.evaluate(() => document.fonts.check('600 13px Geist')), 'la letra Geist cargó').toBe(true);
}

async function preparar(page) {
  await cerrarTarjetas(page);
  await letraReal(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.locator('#activity-card').scrollIntoViewIfNeeded();
  // Mide recién cuando terminó la animación de entrada de las cards (card-slide-in).
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
}

const medir = (page) => page.evaluate(() => {
  const card = document.getElementById('activity-card').getBoundingClientRect();
  const titulo = document.querySelector('#activity-card .card-title');
  const t = titulo.getBoundingClientRect();
  const botones = [...titulo.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { t: b.textContent.trim(), top: r.top, l: r.left, r: r.right, w: r.width, h: r.height, cortado: b.scrollWidth > b.clientWidth + 1 };
  });
  const de = document.documentElement;
  return { card: { l: card.left, r: card.right }, titulo: { l: t.left, r: t.right }, botones, scrollX: de.scrollWidth - de.clientWidth };
});

test('1) no existe el botón Foto ticket en Finanzas y quedan solo los otros tres, en este orden', async ({ cmPage }) => {
  await preparar(cmPage);
  await expect(cmPage.locator('#tab-finanzas button', { hasText: 'Foto ticket' })).toHaveCount(0);
  await expect(cmPage.locator('#tab-finanzas [onclick*="abrirGastoFoto"]')).toHaveCount(0);
  await expect(cmPage.locator('#activity-card .card-title button')).toHaveText(TEXTOS);
  expect(await cmPage.evaluate(() => typeof window.abrirGastoFoto)).toBe('undefined');
});

for (const ancho of [...ANCHOS, 320]) {
  test.describe(`${ancho}px`, () => {
    test.use({ viewport: { width: ancho, height: 900 } });

    test(`2) los tres botones se ven completos (en una sola fila salvo a 320px) a ${ancho}px, sin scroll horizontal ni errores`, async ({ cmPage, consoleErrors }) => {
      await preparar(cmPage);
      const m = await medir(cmPage);
      expect(m.botones.map((b) => b.t)).toEqual(TEXTOS);
      for (const b of m.botones) {
        expect(b.w, b.t).toBeGreaterThan(40);
        expect(b.l, b.t).toBeGreaterThanOrEqual(m.card.l);
        expect(b.r, b.t).toBeLessThanOrEqual(m.card.r);
        expect(b.l, `${b.t} dentro del título`).toBeGreaterThanOrEqual(m.titulo.l);
        expect(b.r, `${b.t} dentro del título`).toBeLessThanOrEqual(m.titulo.r);
        expect(b.cortado, b.t).toBe(false);
      }
      if (ancho !== 320) {
        const tops = m.botones.map((b) => b.top);
        expect(Math.max(...tops) - Math.min(...tops), `tops ${tops}`).toBeLessThanOrEqual(2);
      }
      // y ninguno queda tapado por otro elemento.
      const tapados = await cmPage.evaluate(() => [...document.querySelectorAll('#activity-card .card-title button')].filter((b) => {
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(el && el.closest('button') === b);
      }).map((b) => b.textContent.trim()));
      expect(tapados).toEqual([]);
      expect(m.scrollX).toBeLessThanOrEqual(0);
      expect(consoleErrors).toEqual([]);
    });
  });
}

for (const ancho of ANCHOS) {
  test.describe(`${ancho}px · tamaño`, () => {
    test.use({ viewport: { width: ancho, height: 900 } });

    // Comparación contra un botón chico común de la misma card (no contra píxeles medidos en una máquina): la letra
    // de "+ Movimiento" queda entre un 5% y un 15% por debajo (la regla es 0,9×) y el alto entre un 5% y un 25%.
    test(`3) los botones son un poco más chicos que un botón chico común a ${ancho}px`, async ({ cmPage }) => {
      await preparar(cmPage);
      const r = await cmPage.evaluate(() => {
        const ref = document.createElement('button');
        ref.className = 'btn btn-ghost btn-sm';
        ref.textContent = '+ Movimiento';
        document.getElementById('activity-card').appendChild(ref);
        const mov = [...document.querySelectorAll('#activity-card .card-title button')].find((b) => b.textContent.trim() === '+ Movimiento');
        const fs = (el) => parseFloat(getComputedStyle(el).fontSize);
        const out = { fsMov: fs(mov), fsRef: fs(ref), hMov: mov.getBoundingClientRect().height, hRef: ref.getBoundingClientRect().height };
        ref.remove();
        return out;
      });
      const dF = 1 - r.fsMov / r.fsRef;
      const dH = 1 - r.hMov / r.hRef;
      expect(dF, `letra ${r.fsMov} vs ${r.fsRef}`).toBeGreaterThanOrEqual(0.05);
      expect(dF, `letra ${r.fsMov} vs ${r.fsRef}`).toBeLessThanOrEqual(0.15);
      expect(dH, `alto ${r.hMov} vs ${r.hRef}`).toBeGreaterThanOrEqual(0.05);
      expect(dH, `alto ${r.hMov} vs ${r.hRef}`).toBeLessThanOrEqual(0.25);   // además del 10% de letra, el padding vertical es menor
    });
  });
}

test.describe('1280px · funcionamiento', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('4) Categorías abre su modal, Tarjetas abre el overlay y + Movimiento abre el formulario', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage);
    const boton = (t) => cmPage.locator('#activity-card .card-title button', { hasText: t });

    await boton('Categorías').click();
    await expect(cmPage.locator('#modal-cat-manager')).toHaveClass(/open/);
    await cmPage.evaluate(() => closeModal('modal-cat-manager'));
    await expect(cmPage.locator('#modal-cat-manager')).not.toHaveClass(/open/);

    await boton('Tarjetas').click();
    await expect(cmPage.locator('#ov-tarjetas')).toHaveClass(/show/);
    await cerrarTarjetas(cmPage);

    await boton('+ Movimiento').click();
    await expect(cmPage.locator('#modal-add-txn')).toHaveClass(/open/);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('1280px · foco y hover', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('6) cada botón muestra foco visible con el teclado y cambia de aspecto al pasar el mouse', async ({ cmPage }) => {
    await preparar(cmPage);
    const botones = cmPage.locator('#activity-card .card-title button');
    for (let i = 0; i < 3; i++) {
      const b = botones.nth(i);
      const antes = await b.evaluate((el) => { const c = getComputedStyle(el); return c.backgroundColor + '|' + c.borderColor + '|' + c.color; });
      await b.hover();
      const hover = await b.evaluate((el) => { const c = getComputedStyle(el); return c.backgroundColor + '|' + c.borderColor + '|' + c.color; });
      expect(hover, `hover ${TEXTOS[i]}`).not.toBe(antes);
      await cmPage.mouse.move(0, 0);
      await b.focus();
      await cmPage.keyboard.press('Shift+Tab');
      await cmPage.keyboard.press('Tab'); // vuelve al botón por teclado: :focus-visible
      await expect(b).toBeFocused();
      const aro = await b.evaluate((el) => { const c = getComputedStyle(el); return { ok: el.matches(':focus-visible'), estilo: c.outlineStyle, ancho: parseFloat(c.outlineWidth) }; });
      expect(aro.ok, `focus-visible ${TEXTOS[i]}`).toBe(true);
      expect(aro.estilo, TEXTOS[i]).not.toBe('none');
      expect(aro.ancho, TEXTOS[i]).toBeGreaterThan(0);
    }
  });
});

// Capturas para revisar a ojo (esperando la animación de entrada): .foreman/scratch/
for (const ancho of [1280, 390]) {
  test.describe(`${ancho}px · captura`, () => {
    test.use({ viewport: { width: ancho, height: 900 } });

    test(`5) captura del encabezado de Movimientos a ${ancho}px`, async ({ cmPage }, testInfo) => {
      await preparar(cmPage);
      await cmPage.locator('#activity-card').screenshot({ path: path.join(__dirname, '..', '.foreman', 'scratch', `encabezado-movimientos-${ancho}-${testInfo.project.name}.png`) });
    });
  });
}
