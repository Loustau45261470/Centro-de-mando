// HUD tanda 4 (solo estética, datos de ejemplo inventados; reloj simulado martes 24/11/2026):
//  F2 · Agenda del día: línea de "ahora" en su hora exacta y bloque en curso que se llena; NADA se marca como hecho por el paso del tiempo.
//  F3 · Botón de registros que late (y quieto con "reducir movimiento") y ventana que sube con barrido, sin romper su uso.
//  F7 · Cuotas de una compra con tarjeta: pagada = verde, a pagar (mes corriente / próxima) = ámbar, por venir = apagada.
// Con TANDA4_SHOTS=<carpeta> guarda capturas a 1280 y 390.
'use strict';
const { test, expect } = require('./support/fixtures');
const { abrirTarjetas } = require('./support/tarjetas-ui');
const fs = require('fs');
const path = require('path');

const SHOTS = process.env.TANDA4_SHOTS || '';
const FIJAR = (page, h, m = 0) => page.clock.setFixedTime(new Date(2026, 10, 24, h, m));
const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
async function foto(page, nombre, sel) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const w = page.viewportSize().width;
  const dest = path.join(SHOTS, `${nombre}-${w}.png`);
  if (sel) await page.locator(sel).first().screenshot({ path: dest }); else await page.screenshot({ path: dest });
}

test.describe('HUD tanda 4', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'el viewport (1280 y 390) se fija adentro'); });

  const TAREAS = [
    { id: 'a1', text: 'Actividad pasada', time: '09:00', duration: 60, priority: 2, area: 'trabajo', done: false },
    { id: 'a2', text: 'Actividad en curso', time: '10:00', duration: 60, priority: 2, area: 'estudio', done: false },
    { id: 'a3', text: 'Actividad que viene', time: '12:00', duration: 30, priority: 1, area: 'trabajo', done: false },
  ];
  const armarPlan = (page) => page.evaluate((tareas) => {
    const d = getActiveDate();
    S.dayPlan = {}; S.dayPlan[d] = { tasks: JSON.parse(JSON.stringify(tareas)) };
    renderDayPlanner();
  }, TAREAS);
  const hechos = (page) => page.evaluate(() => getDayPlan(getActiveDate()).tasks.map((t) => !!t.done));

  for (const ancho of [1280, 390]) {
    test(`F2 agenda: línea de ahora, bloque en curso que se llena y nada se marca solo (${ancho})`, async ({ cmPage: page, consoleErrors }) => {
      await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 });
      await FIJAR(page, 10, 30);
      await page.click('.nav-btn[data-tab="vida"]');
      await armarPlan(page);

      // Lista del día: la fila en curso se llena a la mitad; la línea cae justo antes de la que todavía no empezó.
      const filas = page.locator('#dayPlannerList .pcal-row');
      await expect(filas).toHaveCount(3);
      await expect(filas.nth(0)).not.toHaveClass(/pcal-actual/);
      await expect(filas.nth(1)).toHaveClass(/pcal-actual/);
      await expect(filas.nth(2)).not.toHaveClass(/pcal-actual/);
      await expect(filas.nth(2)).toHaveClass(/pcal-ahora-antes/);
      expect(parseFloat(await filas.nth(1).locator('.pcal-prog').evaluate((e) => e.style.getPropertyValue('--pr')))).toBeCloseTo(0.5, 2);
      // El relleno se dibuja con transform, no con ancho.
      expect(await filas.nth(1).locator('.pcal-prog').evaluate((e) => getComputedStyle(e).transform)).not.toBe('none');
      expect(await hechos(page)).toEqual([false, false, false]);
      await expect(page.locator('#dayPlannerList .pcal-check input:checked')).toHaveCount(0);
      expect(await sinScrollH(page)).toBe(true);
      await foto(page, 'F2-lista', '#dayPlannerCard');

      // Pasa el tiempo: se corre la línea y cambia el bloque en curso, pero ninguna actividad se tilda sola.
      await FIJAR(page, 12, 15);
      await page.evaluate(() => plannerAhoraTick());
      await expect(filas.nth(1)).not.toHaveClass(/pcal-actual/);
      await expect(filas.nth(2)).toHaveClass(/pcal-actual/);
      await expect(filas.nth(2)).toHaveClass(/pcal-ahora-fin/);
      expect(parseFloat(await filas.nth(2).locator('.pcal-prog').evaluate((e) => e.style.getPropertyValue('--pr')))).toBeCloseTo(0.5, 2);
      expect(await hechos(page)).toEqual([false, false, false]);
      await expect(page.locator('#dayPlannerList .pcal-check input:checked')).toHaveCount(0);
      await FIJAR(page, 20, 0);
      await page.evaluate(() => plannerAhoraTick());
      expect(await hechos(page)).toEqual([false, false, false]);
      await expect(page.locator('#dayPlannerList .pcal-actual')).toHaveCount(0);

      // Overlay de Planificación (vista Día): línea a la hora exacta (10:30 → 5,5 h × 64 px = 352 px) y bloque con relleno proporcional.
      await FIJAR(page, 10, 30);
      await page.evaluate(() => plannerOverlayOpen());
      const linea = page.locator('#plov-list-dia .pcal-ahora');
      await expect(linea).toHaveCount(1);
      expect(parseFloat(await linea.evaluate((e) => e.style.top))).toBeCloseTo(352, 0);
      expect(await linea.evaluate((e) => e.dataset.hora)).toBe('10:30');
      const bloque = page.locator('#plov-list-dia .pcal-block[data-id="a2"]');
      await expect(bloque).toHaveClass(/pcal-actual/);
      expect(parseFloat(await bloque.locator('.pcal-prog').evaluate((e) => e.style.getPropertyValue('--pr')))).toBeCloseTo(0.5, 2);
      await expect(page.locator('#plov-list-dia .pcal-block[data-id="a1"]')).not.toHaveClass(/pcal-actual/);
      await expect(page.locator('#plov-list-dia .pcal-block[data-id="a3"]')).not.toHaveClass(/pcal-actual/);
      // La línea se mueve con la hora: 12:00 → 7 h × 64 = 448 px.
      await FIJAR(page, 12, 0);
      await page.evaluate(() => plannerAhoraTick());
      expect(parseFloat(await linea.evaluate((e) => e.style.top))).toBeCloseTo(448, 0);
      expect(await hechos(page)).toEqual([false, false, false]);
      await FIJAR(page, 10, 30);
      await page.evaluate(() => plannerAhoraTick());
      await page.locator('#plov-list-dia .pcal-ahora').evaluate((e) => e.scrollIntoView({ block: 'center' }));
      expect(await sinScrollH(page)).toBe(true);
      await foto(page, 'F2-overlay', '#ov-planner');
      expect(consoleErrors).toEqual([]);
    });

    test(`F3 registros: el botón late, sin movimiento queda quieto, y la ventana sube con barrido y se usa igual (${ancho})`, async ({ cmPage: page, consoleErrors }) => {
      await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 });
      await page.evaluate(() => document.getElementById('rg-btn').classList.add('tiene'));
      const anim = (pseudo) => page.evaluate((p) => getComputedStyle(document.getElementById('rg-btn'), p || null).animationName, pseudo);
      expect(await anim()).toBe('rg-pulso');
      expect(await anim('::before')).toBe('rg-onda');
      await foto(page, 'F3-boton', '#rg-btn');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await anim()).toBe('none');
      expect(await anim('::before')).toBe('none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });

      // La ventana abre con la animación de subida y el barrido.
      await page.click('#rg-btn');
      const ov = page.locator('#ov-registros');
      await expect(ov).toHaveClass(/show/);
      expect(await ov.locator('.cm-panel').evaluate((e) => getComputedStyle(e).animationName)).toBe('rg-ov-sube');
      expect(await ov.evaluate((e) => getComputedStyle(e, '::after').animationName)).toBe('rg-ov-barrido');
      await expect(page.locator('#registros-body')).toBeVisible();
      await expect(ov.locator('.rg-row').first()).toBeVisible();
      expect(await sinScrollH(page)).toBe(true);
      await page.waitForTimeout(900);   // que termine la animación antes de la captura
      await foto(page, 'F3-ventana', '#ov-registros');
      // Sigue funcionando: se puede abrir un registro para responder y cerrar con ✕.
      await ov.locator('.rg-resp').first().click();
      await expect(page.locator('#ov-registro-resp')).toHaveClass(/show/);
      await expect(page.locator('#rg-form-host')).toBeVisible();
      expect(await page.locator('#ov-registro-resp .cm-panel').evaluate((e) => getComputedStyle(e).animationName)).toBe('rg-ov-sube');
      await page.click('#ov-registro-resp .cm-ov-close');
      await expect(page.locator('#ov-registro-resp')).not.toHaveClass(/show/);
      await page.click('#ov-registros .cm-ov-close');
      await expect(ov).not.toHaveClass(/show/);

      // Con "reducir movimiento" la ventana abre sin animación.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.click('#rg-btn');
      await expect(ov).toHaveClass(/show/);
      expect(await ov.locator('.cm-panel').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
      expect(await ov.evaluate((e) => getComputedStyle(e, '::after').animationName)).toBe('none');
      await page.click('#ov-registros .cm-ov-close');
      expect(consoleErrors).toEqual([]);
    });

    test(`F7 cuotas: pagada verde, a pagar ámbar, por venir apagada; al pagar el mes pasa a verde (${ancho})`, async ({ cmPage: page, consoleErrors }) => {
      await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 });
      await page.click('.nav-btn[data-tab="finanzas"]');
      await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
      // Naranja cierra el 27 y vence el 10: una compra del 15-oct en 4 cuotas vence 10-nov, 10-dic, 10-ene y 10-feb.
      await page.evaluate(() => {
        window.getActiveDate = () => '2026-11-15';
        S.accounts = [{ id: 'uala', name: 'Ualá', type: 'bank', balance: 1000000, currency: 'ARS', icon: '🏦' }];
        S.cards = [{ id: 'nar', name: 'Naranja', limit: 1000000, closeDay: 27, dueDay: 10, openingUsed: 0 }];
        S.cardCharges = [
          { id: 'c4', cardId: 'nar', date: '2026-10-15', amount: 40000, mode: 'nowInst', installments: 4, name: 'Heladera de ejemplo' },
          { id: 'c1', cardId: 'nar', date: '2026-10-15', amount: 9000, mode: 'now1', name: 'Un solo pago' },
        ];
        S.cardPayments = []; S.transactions = []; S.moves = [];
        renderFinanzasTab();
      });
      await abrirTarjetas(page, 'compras');
      const barra = page.locator('.cc-chg[data-charge-id="c4"] .cc-cuotas');
      const estados = () => barra.locator('.cc-q').evaluateAll((els) => els.map((e) => e.className.replace('cc-q ', '')));
      await expect(barra.locator('.cc-q')).toHaveCount(4);
      // Mes corriente (la cuota del 10-nov, todavía sin pagar) = ámbar; el resto por venir.
      expect(await estados()).toEqual(['cc-q-corriente', 'cc-q-futura', 'cc-q-futura', 'cc-q-futura']);
      const color = (i) => barra.locator('.cc-q').nth(i).evaluate((e) => getComputedStyle(e).backgroundColor);
      expect(await color(0)).toBe('rgb(245, 166, 35)');
      expect(await color(1)).toBe('rgba(0, 0, 0, 0.6)');
      await expect(page.locator('.cc-chg[data-charge-id="c4"] .cc-cuotas-txt')).toHaveText(/^0 de 4 pagadas · próxima vence el /);
      // Un solo pago no lleva barra.
      await expect(page.locator('.cc-chg[data-charge-id="c1"] .cc-cuotas')).toHaveCount(0);
      await foto(page, 'F7-antes', '#ov-tarjetas');

      // Se paga el mes (mismo pago automático que ya marca "pagada" en "Ver cuotas"): esa cuota pasa a verde y la próxima queda ámbar.
      await page.evaluate(() => {
        S.cardPayments.push({ id: 'auto:nar:2026-11-10', key: 'auto:nar:2026-11-10', cardId: 'nar', date: '2026-11-10', amount: 10000, accountId: 'uala', kind: 'auto' });
        renderCardsOverlay();
      });
      expect(await estados()).toEqual(['cc-q-pagada', 'cc-q-corriente', 'cc-q-futura', 'cc-q-futura']);
      expect(await color(0)).toBe('rgb(16, 224, 124)');
      expect(await color(1)).toBe('rgb(245, 166, 35)');
      await expect(page.locator('.cc-chg[data-charge-id="c4"] .cc-cuotas-txt')).toHaveText(/^1 de 4 pagadas · próxima vence el /);
      // Con reducir movimiento la cuota a pagar no parpadea.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await barra.locator('.cc-q-corriente').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      expect(await barra.locator('.cc-q-corriente').evaluate((e) => getComputedStyle(e).animationName)).toBe('cc-q-late');
      expect(await sinScrollH(page)).toBe(true);
      await foto(page, 'F7-despues', '#ov-tarjetas');

      // Una cuota vencida sin pagar (la tarjeta no paga sola) sigue "a pagar": nunca se da por paga por el paso del tiempo.
      await page.evaluate(() => { S.cardPayments = []; window.getActiveDate = () => '2027-01-20'; renderCardsOverlay(); });
      expect(await estados()).toEqual(['cc-q-corriente', 'cc-q-corriente', 'cc-q-corriente', 'cc-q-futura']);
      expect(consoleErrors).toEqual([]);
    });
  }
});
