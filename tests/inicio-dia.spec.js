// Inicio del día dinámico: la 1.ª entrada del día entre 05:00 y 07:59 arranca la barra del día en ese momento.
// Reloj fijo; sin llamadas reales (ElevenLabs/LLM bloqueados por el fixture). Datos solo en memoria.
// Con INICIO_SHOTS=<carpeta> guarda capturas de la barra a las 5:12.
'use strict';
const { test, expect, waitForBoot, completeLoginOverlay } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const SHOTS = process.env.INICIO_SHOTS || '';
const fijar = (page, h, m = 0, dia = 24) => page.clock.setFixedTime(new Date(2026, 10, dia, h, m));
const limpiar = (page) => page.evaluate(() => localStorage.removeItem('cdm_inicioDia'));
const barra = (page) => page.evaluate(() => {
  updateDayProgress();
  const t = (id) => document.getElementById(id).textContent;
  const sg = [...document.querySelectorAll('#dayTln .dg2-sg')];
  return {
    pct: t('dayPct'), fase: t('dayPhase'), rango: document.querySelector('.dg2-rg').textContent, quedan: t('dayLeft'),
    cur: sg.findIndex((s) => s.classList.contains('cur')), d: sg.map((s) => parseFloat(s.style.getPropertyValue('--d'))),
    marcas: [...document.querySelectorAll('#dayTln .dg2-mks span')].map((s) => s.textContent),
    inicio: cmInicioDiaMin(), arrancado: cmDiaArrancado(), guardado: JSON.parse(localStorage.getItem('cdm_inicioDia') || 'null'),
    noche: JARVIS.isNight(),
  };
});
const entrar = (page) => page.evaluate(() => cmRegistrarInicioDia());
const recargar = async (page) => { await page.reload(); await waitForBoot(page); await completeLoginOverlay(page); };

test.describe('Inicio del día dinámico', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'el viewport se fija adentro'); });
  test.setTimeout(60000);

  test('entrar a las 5:12: el día arranca ahí, recargar a las 6:00 lo mantiene y el día siguiente no lo arrastra', async ({ cmPage: page }) => {
    await limpiar(page);
    await fijar(page, 5, 12);
    await entrar(page);
    let r = await barra(page);
    expect(r.guardado).toEqual({ fecha: '2026-11-24', min: 312 });
    expect(r.rango).toBe('5:12 AM — 12:00 AM');
    expect(r.fase).toBe('MAÑANA');
    expect(r.pct).toBe('0%');
    expect(r.cur).toBe(0);
    expect(r.quedan).toBe('Quedan 18 h 48 min');
    expect(r.marcas).toEqual(['5:12 AM', '9:54 AM', '2:36 PM', '7:18 PM', '12 AM']);
    expect(r.d.reduce((a, b) => a + b, 0)).toBeCloseTo(1128, 0);
    expect(r.d[0]).toBeCloseTo(282, 0);
    // 9:54 → 25 % exacto del rango (1128 min): pasa a MEDIODÍA.
    await fijar(page, 9, 54);
    r = await barra(page);
    expect(r.fase).toBe('MEDIODÍA'); expect(r.pct).toBe('25%'); expect(r.cur).toBe(1);

    // Recarga real a las 6:00 del mismo día: el inicio se mantiene y la barra sigue sobre 5:12.
    await fijar(page, 6, 0);
    await recargar(page);
    r = await barra(page);
    expect(r.guardado).toEqual({ fecha: '2026-11-24', min: 312 });
    expect(r.rango).toBe('5:12 AM — 12:00 AM');
    expect(r.fase).toBe('MAÑANA'); expect(r.pct).toBe('4%');   // (360-312)/1128 = 4,3 %

    // Día siguiente a las 6:00: el inicio de ayer no cuenta (se registra uno nuevo en la entrada) y antes de entrar es 8:00.
    await fijar(page, 6, 0, 25);
    r = await page.evaluate(() => ({ ini: cmInicioDiaMin(), arr: cmDiaArrancado() }));
    expect(r).toEqual({ ini: 480, arr: false });
    await entrar(page);
    expect((await barra(page)).guardado).toEqual({ fecha: '2026-11-25', min: 360 });
  });

  test('a las 4:30 sigue DURMIENDO y no registra inicio', async ({ cmPage: page }) => {
    await limpiar(page);
    await fijar(page, 4, 30);
    await entrar(page);
    const r = await barra(page);
    expect(r.guardado).toBeNull();
    expect(r.fase).toBe('DURMIENDO'); expect(r.pct).toBe('—');
    expect(r.rango).toBe('8:00 AM — 12:00 AM');
    expect(r.arrancado).toBe(false);
  });

  test('primera entrada a las 9:00: rango 8–24 como siempre y no registra', async ({ cmPage: page }) => {
    await limpiar(page);
    await fijar(page, 9, 0);
    await entrar(page);
    const r = await barra(page);
    expect(r.guardado).toBeNull();
    expect(r.rango).toBe('8:00 AM — 12:00 AM');
    expect(r.marcas).toEqual(['8 AM', '12 PM', '4 PM', '8 PM', '12 AM']);
    expect(r.fase).toBe('MAÑANA'); expect(r.pct).toBe('6%');
    expect(r.d).toEqual([240, 240, 240, 144, 96]);
  });

  test('abrir la app después de las 5 y volver a la pestaña también arrancan el día', async ({ cmPage: page }) => {
    await limpiar(page);
    await fijar(page, 5, 40);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    const r = await barra(page);
    expect(r.guardado).toEqual({ fecha: '2026-11-24', min: 340 });
    expect(r.fase).toBe('MAÑANA');
  });

  test('voz: a las 5:30 no es noche si el día arrancó, sí lo es si no', async ({ cmPage: page }) => {
    await limpiar(page);
    await fijar(page, 5, 30);
    expect((await barra(page)).noche).toBe(true);        // sin entrada registrada
    await entrar(page);
    expect((await barra(page)).noche).toBe(false);       // día arrancado
    await fijar(page, 23, 30);
    expect((await barra(page)).noche).toBe(true);        // a la noche sigue valiendo
    await limpiar(page);
    await fijar(page, 3, 0);
    expect((await barra(page)).noche).toBe(true);
  });

  for (const ancho of [1280, 390]) {
    test(`captura 5:12 (${ancho}) sin scroll horizontal`, async ({ cmPage: page }) => {
      await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 });
      await limpiar(page);
      await fijar(page, 5, 12);
      await entrar(page);
      await page.click('.nav-btn[data-tab="vida"]');
      await page.waitForFunction(() => document.getElementById('dayTln').getBoundingClientRect().width > 0);
      await barra(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 700)))));
        await page.locator('.day-progress-wrap').screenshot({ path: path.join(SHOTS, `barra-0512-${ancho}.png`) });
      }
    });
  }
});
