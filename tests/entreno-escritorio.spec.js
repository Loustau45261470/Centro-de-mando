// Entrenamiento · Inicio en escritorio: 2 columnas que usan el ancho; celu intacto; "~min" con mediana. Datos inventados.
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const CAPT = process.env.ENTRENO_CAPTURAS || '';
test.describe.configure({ timeout: 60000 });

async function preparar(page, log) {
  await page.evaluate((log) => {
    initRoutines();
    const base = S.routines.slice(0, 2);
    base[0].name = 'Empuje'; base[0].icon = '💪'; base[1].name = 'Tirón'; base[1].icon = '🔗';
    S.routines = base; S.activeRtnSession = null; S.actividadesHechas = {};
    const d0 = PlanEntreno.diaDeSemana(getActiveDate());
    let p = PlanEntreno.vacio();
    p = PlanEntreno.cambiarPermanente(p, { op: 'agregar', dia: d0, item: { tipo: 'rutina', id: S.routines[0].id } });
    p = PlanEntreno.cambiarPermanente(p, { op: 'agregar', dia: (d0 + 1) % 7, item: { tipo: 'rutina', id: S.routines[1].id } });
    p = PlanEntreno.cambiarPermanente(p, { op: 'agregar', dia: (d0 + 2) % 7, item: { tipo: 'actividad', clave: 'boxeo', franja: 'tarde' } });
    S.planEntreno = p;
    const hoy = getActiveDate();
    S.routineLog = { [S.routines[0].id]: (log || []).map(m => ({ date: hoy, duration: m * 60, sets: 10, vol: 100 })) };
    saveState();
    if (window.openGymOverlay) openGymOverlay();
    renderRutinas();
  }, log);
  await page.waitForSelector('#rutinas-wrap .pe-root');
}
const shot = async (page, n) => { if (!CAPT) return; fs.mkdirSync(CAPT, { recursive: true }); await page.screenshot({ path: path.join(CAPT, n + '.png') }); };

test.describe('mediana de duraciones', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('log [65, 2687, 51] min muestra ~65 min (no el promedio inflado)', async ({ cmPage: page }) => {
    await preparar(page, [65, 2687, 51]);
    const hoyCard = page.locator('#rutinas-wrap .pe-day-hoy');
    await expect(hoyCard).toContainText('~65 min');
  });
});

for (const w of [1600, 1280]) {
  test.describe(`escritorio · ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test('el Inicio usa el ancho y tiene 2 columnas', async ({ cmPage: page }) => {
      await preparar(page, [60, 55]);
      const r = await page.evaluate(() => {
        const q = s => document.querySelector(s).getBoundingClientRect();
        const l = q('.pe-colL'), rr = q('.pe-colR');
        return { main: q('.pe-main').width, lw: l.width, rw: rr.width, lx: l.left, rx: rr.left, scroll: document.documentElement.scrollWidth <= window.innerWidth + 1 };
      });
      expect(r.main).toBeGreaterThanOrEqual(w === 1600 ? 1200 : 1100);
      expect(r.rx).toBeGreaterThan(r.lx + r.lw - 1);       // lado a lado
      expect(r.lw).toBeGreaterThan(r.rw);                    // izquierda más ancha
      expect(r.scroll).toBe(true);
      await expect(page.locator('.pe-colR .pe-wk')).toHaveCount(7);
      await shot(page, `escritorio-${w}`);
      await page.locator('.pe-colR .pe-wk').nth(1).click();   // seleccionar un día desde la semana
      await expect(page.locator('.pe-s.pe-sel')).toHaveAttribute('data-i', '1');
    });
  });
}

test.describe('celu 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('una sola columna, sin panel lateral ni scroll horizontal', async ({ cmPage: page }) => {
    await preparar(page, [60]);
    await expect(page.locator('.pe-colR')).toBeHidden();
    const sc = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(sc).toBe(true);
    await shot(page, 'celu-390');
  });
});
