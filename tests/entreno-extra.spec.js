// Entrenamiento: una sesión registrada fuera del plan ("extra") se ve y cuenta. Datos inventados.
// Caso real: plan Lun Push+Boxeo, Mar Pull+Jiujitsu, resto descanso; se hizo Pull el martes y Push el miércoles (hoy, día de descanso).
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const CAPT = process.env.ENTRENO_CAPTURAS || '';
const HOY = '2026-11-25';   // miércoles
test.describe.configure({ timeout: 60000 });

async function preparar(page) {
  await page.clock.setFixedTime(new Date(HOY + 'T18:10:00'));
  await page.evaluate(() => {
    initRoutines();
    S.routines = S.routines.slice(0, 2);
    const [push, pull] = S.routines;
    push.name = 'Push'; push.icon = '💪'; pull.name = 'Pull'; pull.icon = '🔗';
    S.activeRtnSession = null; S.actividadesHechas = {};
    let p = PlanEntreno.vacio();
    const add = (dia, item) => { p = PlanEntreno.cambiarPermanente(p, { op: 'agregar', dia, item }); };
    add(0, { tipo: 'rutina', id: push.id });
    add(0, { tipo: 'actividad', clave: 'boxeo', franja: 'tarde' });
    add(1, { tipo: 'rutina', id: pull.id });
    add(1, { tipo: 'actividad', clave: 'jiujitsu', franja: 'tarde' });
    S.planEntreno = p;
    S.routineLog = {
      [pull.id]: [{ date: '2026-11-24', duration: 3000, sets: 12, vol: 100 }],
      [push.id]: [{ date: '2026-11-25', duration: 2700, sets: 10, vol: 100 }],
    };
    saveState();
    if (window.openGymOverlay) openGymOverlay();
    renderRutinas();
  });
  await page.waitForSelector('#rutinas-wrap .pe-root');
}
const shot = async (page, n) => { if (!CAPT) return; fs.mkdirSync(CAPT, { recursive: true }); await page.screenshot({ path: path.join(CAPT, n + '.png') }); };

async function verificar(page) {
  // Miércoles (índice 2): sin plan, pero Push hecho como extra
  const dia = page.locator('#rutinas-wrap .pe-day[data-i="2"]');
  await expect(dia).toContainText('Push');
  await expect(dia).toContainText('Fuera del plan');
  await expect(dia.locator('.pe-done')).toContainText('Hecho');
  await expect(dia).toContainText('Entrenar igual');
  await expect(dia).not.toContainText('Descanso');
  // Tira: el miércoles marcado como hecho
  const tira = page.locator('#rutinas-wrap .pe-s[data-i="2"]');
  await expect(tira).toHaveClass(/pe-ok/);
  await expect(tira.locator('em')).toHaveText('✓');
  // Lunes sigue sin hacer (Push planeado el lunes no se reasigna)
  await expect(page.locator('#rutinas-wrap .pe-s[data-i="0"]')).not.toHaveClass(/pe-ok/);
}

test.describe('escritorio 1280', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test('sesión fuera del plan: se ve, marca el día y suma al contador', async ({ cmPage: page }) => {
    await preparar(page);
    await verificar(page);
    const fila = page.locator('#rutinas-wrap .pe-colR .pe-wk[data-i="2"]');
    await expect(fila).toContainText('Push');
    await expect(fila).not.toContainText('Descanso');
    await expect(fila.locator('em')).toHaveText('✓');
    await expect(fila.locator('.pe-wk-ok')).toHaveCount(1);
    // Lunes 0/2; la semana: 4 planeados (Pull hecho = 1) + extra Push = 2/5
    await expect(page.locator('#rutinas-wrap .pe-colR .pe-wk[data-i="0"] em')).toContainText('0/2', { timeout: 5000 });
    await expect.poll(async () => (await page.locator('#rutinas-wrap .pe-kp > div').first().innerText()).replace(/\s+/g, ''), { timeout: 5000 }).toContain('2/5');   // espera al descifrado
    await shot(page, 'extra-1280');
  });
});

test.describe('celu 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('sesión fuera del plan en una sola columna', async ({ cmPage: page }) => {
    await preparar(page);
    await verificar(page);
    await shot(page, 'extra-390');
  });
});
