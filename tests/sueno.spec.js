// Sueño: estadísticas de horarios (sueno-stats.js, puro) + fichas en Salud + overlay de Historial de Bienestar + reportes.
'use strict';
const { test, expect } = require('./support/fixtures');
const SU = require('../sueno-stats.js');
const R = require('../reportes.js');

const noche = (bed, wake, extra) => Object.assign({ bedtime: bed, waketime: wake }, extra || {});

test.describe('sueno-stats.js (puro, Node)', () => {
  test('media circular: 23:30 y 00:30 promedian 00:00 (no 12:00)', () => {
    const log = { '2026-11-01': noche('23:30', '07:00'), '2026-11-02': noche('00:30', '08:00') };
    const r = SU.resumen(log, { desde: '2026-11-01', hasta: '2026-11-02' });
    expect(r.bed).toBe('00:00');
    expect(r.wake).toBe('07:30');
    expect(r.horasProm).toBe(7.5);
    expect(r.noches).toBe(2);
  });

  test('desvío y texto de regularidad (≤20 muy regular, ≤45 regular, >45 irregular)', () => {
    const mk = (beds) => { const l = {}; beds.forEach((b, i) => { l['2026-11-0' + (i + 1)] = noche(b, '07:00'); }); return l; };
    const rg = { desde: '2026-11-01', hasta: '2026-11-09' };
    // 23:30 / 00:30 → desvío 30 → regular; el despertar es constante (0) → promedio 15 → muy regular. Ver bedDesvio aparte.
    const a = SU.resumen(mk(['23:30', '00:30', '23:30', '00:30']), rg);
    expect(a.bedDesvio).toBe(30); expect(a.wakeDesvio).toBe(0); expect(a.desvio).toBe(15); expect(a.regularidad).toBe('muy regular');
    expect(SU.textoRegularidad(20)).toBe('muy regular');
    expect(SU.textoRegularidad(21)).toBe('regular');
    expect(SU.textoRegularidad(45)).toBe('regular');
    expect(SU.textoRegularidad(46)).toBe('irregular');
    const b = SU.resumen(mk(['22:00', '01:00', '22:00', '01:00']), rg);   // ±90 min
    expect(b.bedDesvio).toBe(90); expect(b.regularidad).toBe('regular');   // (90 + 0) / 2 = 45
    const c = SU.resumen(mk(['21:00', '02:00', '21:00', '02:00']), rg);
    expect(c.regularidad).toBe('irregular');
  });

  test('vacío o con pocas noches → null (nunca ceros)', () => {
    const rg = { desde: '2026-11-01', hasta: '2026-11-30' };
    const v = SU.resumen({}, rg);
    expect(v).toMatchObject({ noches: 0, horasProm: null, bed: null, wake: null, desvio: null, regularidad: null });
    const dos = SU.resumen({ '2026-11-01': noche('23:00', '07:00'), '2026-11-02': noche('23:30', '07:00') }, rg);
    expect(dos.bed).toBe('23:15'); expect(dos.desvio).toBeNull(); expect(dos.regularidad).toBeNull();
    expect(SU.pctDiasLevantarEnFranja({}, rg, '06:00', '08:00')).toBeNull();
    expect(SU.pctNochesAcostarseAntes({}, rg, '00:00')).toBeNull();
    expect(SU.pctNochesHorasMin({}, rg, 7)).toBeNull();
    expect(SU.horaAMin('25:00')).toBeNull(); expect(SU.horaAMin('')).toBeNull(); expect(SU.horaAMin(null)).toBeNull();
  });

  test('franjas: levantarse, acostarse antes de (cruza medianoche) y horas mínimas', () => {
    const log = {
      '2026-11-01': noche('23:00', '06:30'),   // 7.5 h
      '2026-11-02': noche('00:10', '07:45'),   // 7.5 h
      '2026-11-03': noche('01:30', '08:30'),   // 7 h
      '2026-11-04': noche('23:50', '05:50'),   // 6 h
      '2026-12-01': noche('03:00', '12:00'),   // fuera de rango
    };
    const rg = { desde: '2026-11-01', hasta: '2026-11-30' };
    expect(SU.pctDiasLevantarEnFranja(log, rg, '06:00', '08:00')).toBe(50);   // 06:30 y 07:45
    expect(SU.pctDiasLevantarEnFranja(log, rg, '06:30', '06:30')).toBe(25);   // inclusive
    expect(SU.pctNochesAcostarseAntes(log, rg, '00:30')).toBe(75);            // 23:00, 00:10, 23:50 sí; 01:30 no
    expect(SU.pctNochesAcostarseAntes(log, rg, '23:00')).toBe(25);
    expect(SU.pctNochesHorasMin(log, rg, 7)).toBe(75);
    expect(SU.pctNochesHorasMin(log, rg, 8)).toBe(0);
    // franja que cruza la medianoche
    expect(SU.pctDiasLevantarEnFranja({ a: noche('22:00', '23:30') }, { desde: 'a', hasta: 'a' }, '23:00', '01:00')).toBe(100);
  });

  test('repKpiSueno: comparación en minutos, tonos y "Sin registros"', () => {
    const log = {};
    for (let d = 1; d <= 7; d++) log['2026-11-0' + d] = noche('23:30', '07:00');
    for (let d = 1; d <= 7; d++) log['2026-10-0' + d] = noche('00:30', '07:30');
    const k = R.repKpiSueno({ sleepLog: log }, { desde: '2026-11-01', hasta: '2026-11-07' }, { desde: '2026-10-01', hasta: '2026-10-07' });
    expect(k.acostarse.hora).toBe('23:30');
    expect(k.acostarse.comparacion).toMatchObject({ abs: -60, tono: 'verde' });   // más temprano = mejora
    expect(k.levantarse.comparacion).toMatchObject({ abs: -30, tono: 'azul' });   // a qué hora te levantás no es ni bueno ni malo
    expect(k.horas.valor).toBe(7.5);
    expect(k.regularidad.valor).toBe(0); expect(k.regularidad.texto).toBe('muy regular');
    const vacio = R.repKpiSueno({ sleepLog: {} }, { desde: '2026-08-01', hasta: '2026-08-31' }, { desde: '2026-07-01', hasta: '2026-07-31' });
    ['horas', 'acostarse', 'levantarse', 'regularidad', 'noches'].forEach((c) => { expect(vacio[c].valor).toBeNull(); });
    expect(vacio.horas.motivo).toBe('Sin registros');
  });
});

// "Hoy" = 12/11/2026. 24 noches (1/10 al 12/11): octubre tarde, 1/11 tarde, desde el 2/11 más temprano.
async function sembrarSueno(page) {
  await page.clock.setFixedTime(new Date(2026, 10, 12, 12, 0));
  await page.evaluate(() => {
    const q = (n) => String(n).padStart(2, '0'), f = (t) => t.getFullYear() + '-' + q(t.getMonth() + 1) + '-' + q(t.getDate());
    S.sleepLog = {};
    for (let t = new Date(2026, 9, 1); t <= new Date(2026, 10, 12); t.setDate(t.getDate() + 1)) {
      const k = f(t);
      const nuevo = k >= '2026-11-02';
      S.sleepLog[k] = { bedtime: nuevo ? '23:30' : '00:30', waketime: nuevo ? '07:00' : '07:30', hours: nuevo ? 7.5 : 7 };
    }
    S.reportes = undefined;
  });
}

test.describe('Sueño: Salud, historial y reportes', () => {
  test('Salud: fichas de horarios con selector 7/30 días', async ({ cmPage, consoleErrors }) => {
    await sembrarSueno(cmPage);
    await cmPage.evaluate(() => { switchTab('salud', document.querySelector('.nav-btn[data-tab="salud"]')); renderSleepTracker(); });
    const bloque = cmPage.locator('.sstats-wrap');
    await expect(bloque).toBeVisible();
    // 7 días (6 al 12/11): todas las noches nuevas → 23:30 / 07:00, desvío 0
    await expect(bloque.locator('.sstat', { hasText: 'Te levantás' }).locator('.sstat-v')).toHaveText('07:00');
    await expect(bloque.locator('.sstat', { hasText: 'Te acostás' }).locator('.sstat-v')).toHaveText('23:30');
    await expect(bloque.locator('.sstat', { hasText: 'Regularidad' }).locator('.sstat-v')).toHaveText('muy regular');
    await expect(bloque.locator('.sstat', { hasText: 'Horas promedio' }).locator('.sstat-v')).toHaveText('7,5 h');
    // 30 días (14/10 al 12/11): mezcla de las dos pautas
    await bloque.locator('.sstats-seg button', { hasText: '30 días' }).click();
    await expect(bloque.locator('.sstats-seg button.active')).toHaveText('30 días');
    await expect(bloque.locator('.sstat', { hasText: 'Te acostás' }).locator('.sstat-v')).not.toHaveText('23:30');
    await expect(bloque.locator('.sstat', { hasText: 'Regularidad' }).locator('.sstat-v')).not.toHaveText('—');
    expect(consoleErrors).toEqual([]);
  });

  test('Salud: sin registros muestra "Sin registros", no ceros', async ({ cmPage }) => {
    await cmPage.evaluate(() => { S.sleepLog = {}; switchTab('salud', document.querySelector('.nav-btn[data-tab="salud"]')); renderSleepTracker(); });
    await expect(cmPage.locator('.sstats-vacio')).toHaveText('Sin registros en este período');
  });

  test('Historial de bienestar: métricas Hora de levantarse / acostarse con gráfico', async ({ cmPage, consoleErrors }) => {
    await sembrarSueno(cmPage);
    await cmPage.evaluate(() => { switchTab('salud', document.querySelector('.nav-btn[data-tab="salud"]')); renderSleepTracker(); openBienestarHistOverlay(); });
    const host = cmPage.locator('#ov-bienestar-hist-host');
    await expect(host.locator('.wb-metrics button', { hasText: 'Hora de levantarse' })).toBeVisible();
    await host.locator('.wb-metrics button', { hasText: 'Hora de acostarse' }).click();
    await expect(host.locator('.wb-pulse-cell').nth(1).locator('.wb-pulse-val')).toHaveText('23:30');   // 7 días
    await expect(host.locator('.wb-mod-title')).toContainText('Hora de acostarse');
    const tipo = await cmPage.evaluate(() => ({ t: _wbHistChart && _wbHistChart.config.type, n: _wbHistChart.data.datasets[0].data.filter((v) => v !== null).length,
      tick: _wbHistChart.scales.y.ticks.map((x) => x.label) }));
    expect(tipo.t).toBe('line');
    expect(tipo.n).toBe(14);
    tipo.tick.forEach((l) => expect(l).toMatch(/^\d\d:\d\d$/));
    await host.locator('.wb-metrics button', { hasText: 'Hora de levantarse' }).click();
    await expect(host.locator('.wb-pulse-cell').nth(1).locator('.wb-pulse-val')).toHaveText('07:00');
    await host.locator('.wb-seg button', { hasText: 'Mes' }).click();   // vista por mes también pinta
    await expect(host.locator('canvas')).toBeVisible();
    // la bitácora muestra el rango horario de cada noche
    await expect(host.locator('.wb-day-hm').first()).toHaveText('23:30 → 07:00');
    expect(consoleErrors).toEqual([]);
  });

  test('Reporte semanal: ficha de Sueño en Foco, comparada con la semana anterior en minutos', async ({ cmPage, consoleErrors }) => {
    await sembrarSueno(cmPage);
    await cmPage.evaluate(() => ReportesVista.ver('semanal', '2026-W45'));   // 2 al 8/11 vs 26/10 al 1/11
    await expect(cmPage.locator('#ov-reporte.show')).toBeVisible();
    const foco = cmPage.locator('.rv-page').nth(0);
    const bed = foco.locator('.rv-ficha', { hasText: 'Hora de acostarse' });
    await expect(bed.locator('.rv-fv')).toHaveText('23:30');
    await expect(bed.locator('.rv-chip')).toContainText('60 min');
    await expect(bed.locator('.rv-chip')).toContainText('más temprano');
    await expect(bed.locator('.rv-chip')).toHaveClass(/rv-ok/);
    const wake = foco.locator('.rv-ficha', { hasText: 'Hora de levantarse' });
    await expect(wake.locator('.rv-fv')).toHaveText('07:00');
    await expect(wake.locator('.rv-chip')).toHaveClass(/rv-eq/);
    await expect(foco.locator('.rv-ficha', { hasText: 'Regularidad' })).toContainText('Muy regular');
    await expect(foco.locator('.rv-ficha', { hasText: 'Noches registradas' }).locator('.rv-fv')).toHaveText('7');
    expect(consoleErrors).toEqual([]);
  });

  test('Reporte mensual: ficha de Sueño en Salud; período sin datos dice "Sin registros"', async ({ cmPage }) => {
    await sembrarSueno(cmPage);
    await cmPage.evaluate(() => ReportesVista.ver('mensual', '2026-11'));
    await expect(cmPage.locator('#ov-reporte.show')).toBeVisible();
    const salud = cmPage.locator('.rv-page[aria-label="Salud"]');
    const bed = salud.locator('.rv-ficha', { hasText: 'Hora de acostarse' });
    await expect(bed).toBeVisible();
    await expect(bed.locator('.rv-fv')).not.toHaveText('—');
    await expect(bed.locator('.rv-chip')).toContainText('más temprano');   // noviembre vs los mismos 12 días de octubre
    await expect(salud.locator('.rv-ficha', { hasText: 'Horas promedio' }).locator('.rv-chip')).toBeVisible();
    await cmPage.evaluate(() => { CMOverlay.close(document.getElementById('ov-reporte')); ReportesVista.ver('mensual', '2026-08'); });
    await expect(cmPage.locator('.rv-page[aria-label="Salud"]')).toContainText('Sin registros de sueño en este período');
  });

  test('móvil 390: Salud y overlay sin desborde horizontal', async ({ cmPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'solo mobile');
    await sembrarSueno(cmPage);
    await cmPage.evaluate(() => { switchTab('salud', document.querySelector('.nav-btn[data-tab="salud"]')); renderSleepTracker(); });
    await expect(cmPage.locator('.sstats-wrap')).toBeVisible();
    expect(await cmPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await cmPage.evaluate(() => openBienestarHistOverlay());
    await cmPage.locator('#ov-bienestar-hist-host .wb-metrics button', { hasText: 'Hora de acostarse' }).click();
    expect(await cmPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
