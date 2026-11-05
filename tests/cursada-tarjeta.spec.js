// Cursada: la tarjeta de Conocimiento abre el overlay entera (sin entrada en el abanico, como la tarjeta de Crédito) y
// en el celu (390 / 360px) las filas no se encimen ni se salgan, ni en la tarjeta ni en el overlay.
'use strict';
const { test, expect } = require('./support/fixtures');

const irAConocimiento = (page) => page.evaluate(() => switchTab('conocimiento', document.querySelector('.nav-btn[data-tab="conocimiento"]')));

const armar = (page, largos = false) => page.evaluate((largos) => {
  const f = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
  S.cursada = largos ? [
    { id: 'c1', tipo: 'clase', materia: 'Derecho individual y colectivo del trabajo', titulo: 'Clase teórica sobre contrato de trabajo', fecha: f(-3), hora: '10:00', done: false },
    { id: 'c2', tipo: 'tp', materia: 'Introducción a la Filosofía del Derecho y Teoría General', titulo: 'Trabajo práctico integrador número dos', fecha: f(0), hora: '18:30', done: false },
    { id: 'c3', tipo: 'foro', materia: 'Derecho Constitucional', titulo: 'Foro de debate: control de constitucionalidad', fecha: f(12), hora: '', done: false },
    { id: 'c4', tipo: 'clase', materia: 'Materiaextraordinariamentelargasinespaciosparaprobaroverflow', titulo: '', fecha: f(1), hora: '09:00', done: false },
    { id: 'c5', tipo: 'tp', materia: 'Historia', titulo: 'TP', fecha: f(40), hora: '', done: false },
  ] : [
    { id: 'c1', tipo: 'clase', materia: 'Materia de ejemplo', titulo: 'Clase uno', fecha: f(2), hora: '10:00', done: false },
    { id: 'c2', tipo: 'tp', materia: 'Otra materia', titulo: 'TP dos', fecha: f(5), hora: '', done: false },
  ];
  Cursada.renderPrincipal();
}, largos);

const tarjeta = (page) => page.locator('#cursada-card');
const overlay = (page) => page.locator('#ov-cursada');

test.describe('la tarjeta de Cursada abre el overlay', () => {
  test('click en la tarjeta (zona vacía, título o fila) abre Cursada; tiene rol de botón y es enfocable', async ({ cmPage: page, consoleErrors }) => {
    await irAConocimiento(page);
    await armar(page);
    await expect(tarjeta(page)).toHaveAttribute('role', 'button');
    await expect(tarjeta(page)).toHaveAttribute('tabindex', '0');
    await expect(tarjeta(page)).toHaveClass(/cc-card-link/);
    await tarjeta(page).locator('.card-title').click();
    await expect(overlay(page)).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await expect(overlay(page)).not.toHaveClass(/show/);
    await tarjeta(page).locator('.curs-item-name').first().click();
    await expect(overlay(page)).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await expect(overlay(page)).not.toHaveClass(/show/);
    expect(consoleErrors).toEqual([]);
  });

  test('Enter y Espacio sobre la tarjeta enfocada la abren', async ({ cmPage: page }) => {
    await irAConocimiento(page);
    await armar(page);
    for (const tecla of ['Enter', ' ']) {
      await tarjeta(page).focus();
      await page.keyboard.press(tecla);
      await expect(overlay(page)).toHaveClass(/show/);
      await page.keyboard.press('Escape');
      await expect(overlay(page)).not.toHaveClass(/show/);
    }
  });

  test('"Ver toda la cursada →" sigue abriendo el overlay', async ({ cmPage: page }) => {
    await irAConocimiento(page);
    await armar(page);
    await tarjeta(page).locator('.bsum-full').click();
    await expect(overlay(page)).toHaveClass(/show/);
  });

  test('marcar hecho (casilla o su zona de toque) NO abre el overlay y sí marca el ítem', async ({ cmPage: page }) => {
    await irAConocimiento(page);
    await armar(page);
    await tarjeta(page).locator('.curs-item').first().locator('.curs-check input').click();
    expect(await page.evaluate(() => S.cursada.find((c) => c.id === 'c1').done)).toBe(true);
    await expect(overlay(page)).toHaveCount(0);       // ni se llegó a construir
    // Click en el label (zona de toque ampliada) del siguiente ítem, no en el input.
    const label = tarjeta(page).locator('.curs-item').first().locator('.curs-check');
    await label.click({ position: { x: 2, y: 2 } });
    expect(await page.evaluate(() => S.cursada.find((c) => c.id === 'c2').done)).toBe(true);
    await expect(overlay(page)).toHaveCount(0);
  });

  test('Enter sobre la casilla enfocada no dispara la apertura de la tarjeta', async ({ cmPage: page }) => {
    await irAConocimiento(page);
    await armar(page);
    await tarjeta(page).locator('.curs-item').first().locator('.curs-check input').focus();
    await page.keyboard.press('Enter');
    await expect(overlay(page)).toHaveCount(0);
  });

  test('sin ítems: el aviso manda a tocar la tarjeta y ya no habla del menú', async ({ cmPage: page }) => {
    await irAConocimiento(page);
    await page.evaluate(() => { S.cursada = []; Cursada.renderPrincipal(); });
    await expect(tarjeta(page)).toContainText('Tocá esta tarjeta');
    await expect(tarjeta(page)).not.toContainText('menú de Conocimiento');
    await tarjeta(page).click({ position: { x: 20, y: 20 } });
    await expect(overlay(page)).toHaveClass(/show/);
  });

  test('el abanico de Conocimiento ya no trae "Cursada"; el resto sigue', async ({ cmPage: page }) => {
    await irAConocimiento(page);
    const etiquetas = await page.evaluate(() => [...document.querySelectorAll('#sd-conocimiento .cm-sd-item')].map((b) => b.getAttribute('aria-label')));
    expect(etiquetas).not.toContain('Cursada');
    for (const e of ['Notas', 'Libros', 'Sesión de estudio', 'Plan de materias', 'Plan de carrera']) expect(etiquetas).toContain(e);
  });
});

for (const W of [390, 360]) {
  test.describe(`Cursada a ${W}px con nombres largos`, () => {
    test.use({ viewport: { width: W, height: 800 }, hasTouch: true, isMobile: true });

    // Por fila: ningún hijo directo pisa a otro y nada (ni el texto) se sale del borde derecho.
    const medir = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((row) => {
      const rr = row.getBoundingClientRect();
      const kids = [...row.children].map((k) => ({ n: (k.className || k.tagName).toString(), r: k.getBoundingClientRect() })).filter((k) => k.r.width > 0);
      const solapes = [];
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].r, b = kids[j].r;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) solapes.push(kids[i].n + ' x ' + kids[j].n);
      }
      const desborde = Math.max(0, ...[...row.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - rr.right));
      return { solapes, desborde: Math.round(desborde) };
    }), sel);

    test('la tarjeta de la sección: sin encimar ni desbordar, y el nombre ocupa el ancho de la fila', async ({ cmPage: page }) => {
      await irAConocimiento(page);
      await armar(page, true);
      await page.waitForTimeout(800);   // animación de entrada de las filas
      const filas = await medir(page, '#cursada-card .curs-item');
      expect(filas).toHaveLength(5);
      for (const f of filas) { expect(f.solapes).toEqual([]); expect(f.desborde).toBeLessThanOrEqual(0); }
      const w = await page.evaluate(() => {
        const row = document.querySelector('#cursada-card .curs-item'), n = row.querySelector('.curs-item-main');
        return { fila: row.getBoundingClientRect().width, nombre: n.getBoundingClientRect().width };
      });
      expect(w.nombre).toBeGreaterThan(w.fila * 0.8);   // antes: ~100px de 330
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    test('el overlay: sin encimar ni desbordar (incluida la palabra larguísima), sin scroll horizontal', async ({ cmPage: page }) => {
      await irAConocimiento(page);
      await armar(page, true);
      await page.evaluate(() => Cursada.open());
      await expect(overlay(page)).toHaveClass(/show/);
      await page.waitForTimeout(700);
      const filas = await medir(page, '#ov-cursada-list > div:has(input[type="checkbox"])');
      expect(filas).toHaveLength(5);
      for (const f of filas) { expect(f.solapes).toEqual([]); expect(f.desborde).toBeLessThanOrEqual(0); }
      const sobra = await page.evaluate(() => ['#ov-cursada .cm-ov-body', '#ov-cursada .cm-panel'].map((s) => { const e = document.querySelector(s); return e.scrollWidth - e.clientWidth; }));
      expect(sobra.every((x) => x <= 0), String(sobra)).toBe(true);
      // La casilla sigue a la derecha y chica, y las acciones (editar / borrar) siguen tocables.
      const pos = await page.evaluate(() => {
        const row = document.querySelector('#ov-cursada-list > div:has(input[type="checkbox"])');
        const c = row.querySelector('input[type="checkbox"]').getBoundingClientRect(), r = row.getBoundingClientRect();
        return { derecha: r.right - c.right, ancho: c.width };
      });
      expect(pos.derecha).toBeLessThan(16);
      expect(pos.ancho).toBeLessThanOrEqual(20);
    });
  });
}
