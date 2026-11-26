// Barra del día (Vida) como línea de tiempo por fases con cartel «Ahora» (HUD tanda 5 · G2).
// Reloj fijo a varias horas: fase, porcentaje, posición del cartel, sin scroll horizontal a 390 y columnas de Vida a la par a 1280.
// Con G2_SHOTS=<carpeta> guarda capturas. Datos de ejemplo inventados, solo en memoria.
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const SHOTS = process.env.G2_SHOTS || '';
const HOY = '2026-11-24';
const fijar = (page, h, m = 0) => page.clock.setFixedTime(new Date(2026, 10, 24, h, m));
const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const irAVida = async (page) => {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
  await page.waitForFunction(() => document.getElementById('dayTln').getBoundingClientRect().width > 0);
};
const esperar = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 700)))));

// Inicio del día por defecto: 05:00 (rango 5–24 = 1140 min). Con la 1.ª entrada a las 8:00 (INICIO_8) el rango es 8–24 (960 min).
// [hora, min, % mostrado, fase, índice de fase actual (-1 = antes del inicio), texto de hora, texto "quedan"]
const INICIO_5 = [
  [4, 30, '—', 'DURMIENDO', -1, '4:30 AM', 'Quedan 19 h 0 min'],
  [5, 0, '0%', 'MAÑANA', 0, '5:00 AM', 'Quedan 19 h 0 min'],
  [8, 0, '16%', 'MAÑANA', 0, '8:00 AM', 'Quedan 16 h 0 min'],
  [10, 0, '26%', 'MEDIODÍA', 1, '10:00 AM', 'Quedan 14 h 0 min'],
  [14, 30, '50%', 'TARDE', 2, '2:30 PM', 'Quedan 9 h 30 min'],
  [21, 0, '84%', 'NOCHE', 3, '9:00 PM', 'Quedan 3 h 0 min'],
  [22, 30, '92%', 'HORA DE DORMIR', 4, '10:30 PM', 'Quedan 1 h 30 min'],
  [23, 59, '100%', 'HORA DE DORMIR', 4, '11:59 PM', 'Quedan 0 h 1 min'],
];
const INICIO_8 = [
  [6, 0, '—', 'DURMIENDO', -1, '6:00 AM', 'Quedan 16 h 0 min'],
  [8, 0, '0%', 'MAÑANA', 0, '8:00 AM', 'Quedan 16 h 0 min'],
  [10, 0, '13%', 'MAÑANA', 0, '10:00 AM', 'Quedan 14 h 0 min'],
  [12, 0, '25%', 'MEDIODÍA', 1, '12:00 PM', 'Quedan 12 h 0 min'],
  [14, 30, '41%', 'MEDIODÍA', 1, '2:30 PM', 'Quedan 9 h 30 min'],
  [17, 30, '59%', 'TARDE', 2, '5:30 PM', 'Quedan 6 h 30 min'],
  [21, 0, '81%', 'NOCHE', 3, '9:00 PM', 'Quedan 3 h 0 min'],
  [22, 30, '91%', 'HORA DE DORMIR', 4, '10:30 PM', 'Quedan 1 h 30 min'],
  [23, 59, '100%', 'HORA DE DORMIR', 4, '11:59 PM', 'Quedan 0 h 1 min'],
];

async function leer(page) {
  return page.evaluate(() => {
    const t = (id) => document.getElementById(id).textContent;
    const tln = document.getElementById('dayTln').getBoundingClientRect();
    const ln = document.querySelector('#dayTln .dg2-ln').getBoundingClientRect();
    const fg = document.getElementById('dayNow').getBoundingClientRect();
    const sg = [...document.querySelectorAll('#dayTln .dg2-sg')];
    return {
      pct: t('dayPct'), fase: t('dayPhase'), hora: t('dayClock'), quedan: t('dayLeft'), cartel: t('dayNow'),
      cur: sg.findIndex((s) => s.classList.contains('cur')),
      pst: sg.filter((s) => s.classList.contains('pst')).length,
      fill: sg.map((s) => parseFloat(getComputedStyle(s).getPropertyValue('--f'))),
      lnX: (ln.left + ln.width / 2 - tln.left) / tln.width,
      fgL: fg.left - tln.left, fgR: fg.right - tln.right, tlnW: tln.width,
    };
  });
}

test.describe('Barra del día G2', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'el viewport (1280 y 390) se fija adentro'); });

  for (const [ancho, inicio, CASOS] of [[1280, 300, INICIO_5], [390, 300, INICIO_5], [1280, 480, INICIO_8], [390, 480, INICIO_8]]) {
    test(`fase, porcentaje y cartel «Ahora» a distintas horas (${ancho}, día desde las ${inicio / 60}:00)`, async ({ cmPage: page }) => {
      await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 });
      await irAVida(page);
      await page.evaluate(({ hoy, min }) => localStorage.setItem('cdm_inicioDia', JSON.stringify(min === 300 ? null : { fecha: hoy, min })), { hoy: HOY, min: inicio });
      for (const [h, m, pct, fase, cur, hora, quedan] of CASOS) {
        await fijar(page, h, m);
        await page.evaluate(() => updateDayProgress());
        const r = await leer(page);
        const cm = h * 60 + m;
        const p = Math.max(0, Math.min(1, (cm - inicio) / (1440 - inicio)));
        expect(r.pct, `${h}:${m} %`).toBe(pct);
        expect(r.fase, `${h}:${m} fase`).toBe(fase);
        expect(r.hora).toBe(hora);
        expect(r.quedan).toBe(quedan);
        expect(r.cartel).toBe('Ahora · ' + hora);
        expect(r.cur, `${h}:${m} tramo actual`).toBe(cur);
        expect(r.pst).toBe(Math.max(0, cur));
        // La línea del cartel cae en su proporción del día (±2 px).
        expect(Math.abs(r.lnX - p) * r.tlnW, `${h}:${m} posición`).toBeLessThanOrEqual(2);
        // El cartel nunca se sale de la línea de tiempo.
        expect(r.fgL).toBeGreaterThanOrEqual(-1);
        expect(r.fgR).toBeLessThanOrEqual(1);
        // Tramos anteriores llenos, siguientes vacíos.
        r.fill.forEach((f, i) => { if (i < cur) expect(f).toBe(1); if (i > cur) expect(f).toBe(0); });
        expect(await sinScrollH(page), `${h}:${m} scroll horizontal`).toBe(true);
        if (SHOTS && (m === 0 || h === 14)) {
          fs.mkdirSync(SHOTS, { recursive: true });
          await esperar(page);
          await page.locator('.day-progress-wrap').screenshot({ path: path.join(SHOTS, `barra-i${inicio / 60}-${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}-${ancho}.png`) });
        }
      }
    });
  }

  test('«reducir movimiento»: sin animaciones en la línea ni en el tramo actual', async ({ cmPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await irAVida(page);
    await fijar(page, 14, 30);
    await page.evaluate(() => updateDayProgress());
    const an = await page.evaluate(() => [getComputedStyle(document.querySelector('.dg2-ln')).animationName, getComputedStyle(document.querySelector('.dg2-sg.cur .dg2-fl'), '::after').animationName]);
    expect(an).toEqual(['none', 'none']);
  });

  test('Vida a 1280: Planificación termina a la par de Hábitos con la barra nueva', async ({ cmPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await fijar(page, 14, 30);
    await irAVida(page);
    await page.evaluate(({ hoy }) => {
      window.getActiveDate = () => hoy;
      const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
      S.dayPlan = { [hoy]: { tasks: Array.from({ length: 80 }, (_, i) => ({ id: 'p' + i, text: 'Actividad ' + (i + 1), time: hhmm(8 * 60 + i * 10), duration: 30, priority: 2, area: 'vida', done: false })) } };
      S.planRecurring = []; S.goals = {};
      S.habitTrackers = S.habitTrackers && !Array.isArray(S.habitTrackers) ? S.habitTrackers : { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] };
      S.habitTrackers.vida = ['Leer', 'Meditar', 'Caminar'].map((n, i) => ({ id: 'h' + i, name: n, emoji: '📌', days: {} }));
      renderHabitsCard('vida'); renderDayPlanner(); updateDayProgress();
    }, { hoy: HOY });
    await esperar(page);
    const bottom = (sel) => page.evaluate((s) => { const el = document.querySelector(s); let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t + el.getBoundingClientRect().height; }, sel);
    expect(Math.abs((await bottom('#dayPlannerCard')) - (await bottom('#vida-habits-wrap > .card')))).toBeLessThanOrEqual(2);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'vida-1280.png') }); }
  });
});
