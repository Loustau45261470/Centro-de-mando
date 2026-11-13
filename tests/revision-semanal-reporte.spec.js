// Etapa B T4: el paso 1 de la Revisión semanal muestra el resumen de la semana que cierra (mismos números que el reporte semanal).
'use strict';
const { test, expect } = require('./support/fixtures');

const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Datos de ~3 semanas alrededor de la fecha simulada.
async function sembrar(page, fecha) {
  await page.clock.setFixedTime(fecha);
  await page.evaluate(() => {
    const q = (n) => String(n).padStart(2, '0'), f = (d) => d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate());
    const dias = [];
    for (let t = new Date(2026, 10, 1); t <= new Date(2027, 0, 10); t.setDate(t.getDate() + 1)) dias.push(f(t));
    const hab = (id, name, paso) => ({ id, name, emoji: '•', days: Object.fromEntries(dias.map((d, i) => [d, ['done', 'partial', 'missed', 'done', 'rest'][(i * paso) % 5]])) });
    S.habitTrackers = { vida: [hab('h-v1', 'Rezar', 1)], salud: [hab('h-s1', 'Entrenar', 2)], conocimiento: [hab('habit-estudio', 'Estudio', 1)], finanzas: [], ia: [] };
    S.accounts = [{ id: 'acc-main', name: 'Cuenta Principal', type: 'bank', balance: 850000, currency: 'ARS', icon: '🏦' }];
    S.transactions = [];
    dias.forEach((d, i) => {
      if (i % 2 === 0) S.transactions.push({ id: 'g' + i, date: d, name: 'Gasto', type: 'expense', amount: 10000 + (i % 7) * 3000, currency: 'ARS', accountId: 'acc-main', category: 'food' });
      if (i % 9 === 0) S.transactions.push({ id: 'i' + i, date: d, name: 'Ingreso', type: 'income', amount: 200000, currency: 'ARS', accountId: 'acc-main', category: 'salary' });
    });
    S.pomodoroHistory = dias.map((d, i) => ({ id: 'p' + i, date: d, minutes: 25, full: true }));
    S.foco = { dias: {}, chequeos: [], pantalla: {}, config: { horas: ['11:00'] } };
    dias.forEach((d, i) => { S.foco.dias[d] = { atencion: 1 + (i % 5), energia: 1 + ((i + 2) % 5), nota: '' }; });
    S.revisionSemanal = { '2026-W01': { hechaEl: '2026-01-05', promesas: [{ id: 'x', text: 'previa', done: false }], nota: 'n', movidas: [], archivadas: [] } };
  });
}
const abrir = async (page) => { await page.evaluate(() => abrirRevisionSemanal()); await expect(page.locator('#ov-revision-semanal.show')).toBeVisible(); };
const shot = async (page, testInfo, nombre) => page.screenshot({ path: testInfo.outputPath(nombre + '.png') });
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test.describe('Revisión semanal: resumen del paso 1', () => {
  test('lunes: fichas de la semana que cerró, iguales al reporte, y "Ver reporte completo" abre semanal:<clave>', async ({ cmPage, consoleErrors }, testInfo) => {
    await sembrar(cmPage, new Date(2026, 10, 9, 12, 0));   // lunes 9/11 → cerró la semana 2026-W46? (2-8 nov)
    const clave = await cmPage.evaluate(() => CMReportes.repClaveDe('semanal', '2026-11-02'));
    const antes = await cmPage.evaluate(() => JSON.stringify(Object.keys(S.revisionSemanal)));
    await abrir(cmPage);
    await expect(cmPage.locator('#rs-pane-1 .rs-sub')).toContainText('2 nov');
    await expect(cmPage.locator('#rs-pane-1 .rv-ficha')).toHaveCount(6);
    const fichas = await cmPage.locator('#rs-pane-1 .rv-ficha').evaluateAll((els) => els.map((e) => ({ t: e.querySelector('.rv-fl').textContent, v: e.querySelector('.rv-fv').textContent, c: (e.querySelector('.rv-chip') || {}).textContent || null, cls: (e.querySelector('.rv-chip') || {}).className || '' })));
    expect(fichas.map((x) => x.t)).toEqual(['Hábitos (suma de puntos)', 'Gastos', 'Tasa de ahorro', 'Atención promedio', 'Energía promedio', 'Horas de estudio']);
    // cada ficha con valor trae comparación con signo o "=" (o motivo)
    for (const x of fichas) if (!x.v.includes('—')) expect(x.c === null || /^[+−=]/.test(x.c.trim())).toBe(true);
    // atención y energía siempre traen chip con signo (hay días registrados en la semana anterior)
    expect(fichas[3].c).toMatch(/^[+−=]/); expect(fichas[4].c).toMatch(/^[+−=]/);
    // hábitos: valor igual a CMReportes para ese rango
    const hab = await cmPage.evaluate(() => {
      const R = CMReportes, r = R.repRango('semanal', R.repClaveDe('semanal', '2026-11-02')), a0 = R.repRango('semanal', R.repAnterior('semanal', R.repClaveDe('semanal', '2026-11-02'))), a = R.repRangoComparable(r, a0, '2026-11-09');
      const h = R.repHabitosComparados(S.habitTrackers, r, a);
      return { tot: h.reduce((s, x) => s + x.puntos, 0), ant: h.reduce((s, x) => s + x.anterior, 0), r, a };
    });
    expect(hab.r).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
    expect(norm(fichas[0].v)).toContain(hab.tot.toLocaleString('es-AR', { maximumFractionDigits: 1 }));
    expect(fichas[0].c).toContain((hab.tot - hab.ant > 0 ? '+' : hab.tot - hab.ant < 0 ? '−' : '='));
    await shot(cmPage, testInfo, 'paso1-390');
    expect(await sinScrollH(cmPage)).toBe(true);
    const alto = await cmPage.locator('.rv-rs-ver').evaluate((b) => b.getBoundingClientRect().height);
    expect(alto).toBeGreaterThanOrEqual(44);
    // el reporte completo muestra los mismos valores de Gastos, atención y energía
    await cmPage.locator('.rv-rs-ver').click();
    await expect(cmPage.locator('#ov-reporte.show')).toBeVisible();
    await expect(cmPage.locator('#ov-reporte .cm-ov-title')).toContainText('Semana ' + Number(clave.slice(-2)));
    const enReporte = async (titulo) => cmPage.locator('#ov-reporte .rv-ficha').filter({ has: cmPage.locator('.rv-fl', { hasText: new RegExp('^' + titulo) }) }).first().evaluate((e) => ({ v: e.querySelector('.rv-fv').textContent, c: (e.querySelector('.rv-chip') || {}).textContent || null }));
    for (const [i, t] of [[1, 'Gastos'], [3, 'Atención promedio'], [4, 'Energía promedio']]) {
      const r = await enReporte(t);
      expect(norm(r.v)).toBe(norm(fichas[i].v));
      expect(r.c).toBe(fichas[i].c);
    }
    await shot(cmPage, testInfo, 'reporte-390');
    // S.revisionSemanal no cambió de forma (abrir el ritual no escribe nada salvo la entrada de la semana entrante)
    const despues = await cmPage.evaluate(() => JSON.stringify(Object.keys(S.revisionSemanal)));
    expect(JSON.parse(despues)).toEqual(expect.arrayContaining(JSON.parse(antes)));
    const forma = await cmPage.evaluate(() => Object.keys(S.revisionSemanal['2026-W01']).sort().join(','));
    expect(forma).toBe('archivadas,hechaEl,movidas,nota,promesas');
    const nueva = await cmPage.evaluate(() => Object.keys(S.revisionSemanal['2026-W46']).sort().join(','));
    expect(nueva).toBe('archivadas,hechaEl,movidas,nota,promesas');
    expect(consoleErrors).toEqual([]);
  });

  test('Esc en el reporte devuelve el foco al ritual y Tab queda atrapado ahí', async ({ cmPage }) => {
    await sembrar(cmPage, new Date(2026, 10, 9, 12, 0));
    await abrir(cmPage);
    await cmPage.locator('.rv-rs-ver').focus();
    await cmPage.locator('.rv-rs-ver').click();
    await expect(cmPage.locator('#ov-reporte.show')).toBeVisible();
    await cmPage.keyboard.press('Escape');
    await expect(cmPage.locator('#ov-reporte.show')).toHaveCount(0);
    await expect(cmPage.locator('#ov-revision-semanal.show')).toBeVisible();
    const dentro = () => cmPage.evaluate(() => !!document.activeElement.closest('#ov-revision-semanal'));
    await expect.poll(dentro).toBe(true);
    for (let i = 0; i < 6; i++) { await cmPage.keyboard.press('Tab'); expect(await dentro()).toBe(true); }
  });

  test('toque sin foco (como en iPhone): Esc igual devuelve el foco al ritual', async ({ cmPage }) => {
    await sembrar(cmPage, new Date(2026, 10, 9, 12, 0));
    await abrir(cmPage);
    // el botón se activa sin recibir foco: activeElement queda en body
    await cmPage.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); document.querySelector('.rv-rs-ver').click(); });
    await expect(cmPage.locator('#ov-reporte.show')).toBeVisible();
    await cmPage.keyboard.press('Escape');
    await expect(cmPage.locator('#ov-reporte.show')).toHaveCount(0);
    const dentro = () => cmPage.evaluate(() => !!document.activeElement.closest('#ov-revision-semanal'));
    await expect.poll(dentro).toBe(true);
    for (let i = 0; i < 6; i++) { await cmPage.keyboard.press('Tab'); expect(await dentro()).toBe(true); }
  });

  test('cambio de año: lunes 4/1/2027 → semana 2026-W53', async ({ cmPage }, testInfo) => {
    await sembrar(cmPage, new Date(2027, 0, 4, 12, 0));
    await abrir(cmPage);
    await expect(cmPage.locator('#rs-pane-1 .rs-sub')).toContainText('28 dic');
    await expect(cmPage.locator('#rs-pane-1 .rv-ficha')).toHaveCount(6);
    await cmPage.locator('.rv-rs-ver').click();
    await expect(cmPage.locator('#ov-reporte.show .cm-ov-title')).toContainText('Semana 53');
    await expect(cmPage.locator('#ov-reporte .rv-sub').first()).toContainText('28 dic – 3 ene 2027');
    await shot(cmPage, testInfo, 'reporte-w53');
  });

  for (const [nombre, fecha] of [['miércoles 11/11', new Date(2026, 10, 11, 12, 0)], ['domingo 8/11', new Date(2026, 10, 8, 12, 0)]]) {
    test('abrir un ' + nombre + ': semana 2-8 nov, comparada con repRangoComparable', async ({ cmPage }) => {
      await sembrar(cmPage, fecha);
      await abrir(cmPage);
      await expect(cmPage.locator('#rs-pane-1 .rs-sub')).toContainText('2 nov');
      await expect(cmPage.locator('#rs-pane-1 .rv-ficha')).toHaveCount(6);
      const esp = await cmPage.evaluate(() => {
        const R = CMReportes, hoy = getActiveDate(), k = R.repClaveDe('semanal', '2026-11-02'), r = R.repRango('semanal', k);
        const a = R.repRangoComparable(r, R.repRango('semanal', R.repAnterior('semanal', k)), hoy);
        const h = R.repHabitosComparados(S.habitTrackers, r, a);
        return { r, tot: h.reduce((s, x) => s + x.puntos, 0) };
      });
      expect(esp.r).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
      const v = await cmPage.locator('#rs-pane-1 .rv-ficha').first().locator('.rv-fv').textContent();
      expect(norm(v)).toContain(esp.tot.toLocaleString('es-AR', { maximumFractionDigits: 1 }));
    });
  }

  test('reporte abierto sobre el ritual: Esc cierra solo el reporte, Tab no se atrapa en el ritual y Revisiones conserva su período', async ({ cmPage }) => {
    await sembrar(cmPage, new Date(2026, 10, 9, 12, 0));
    await cmPage.evaluate(() => { ReportesVista.periodo('anual'); });
    await abrir(cmPage);
    await cmPage.locator('.rv-rs-ver').click();
    await expect(cmPage.locator('#ov-reporte.show')).toBeVisible();
    expect(await cmPage.evaluate(() => !!document.activeElement.closest('#ov-reporte'))).toBe(true);
    for (let i = 0; i < 4; i++) {
      await cmPage.keyboard.press('Tab');
      expect(await cmPage.evaluate(() => !!document.activeElement.closest('#ov-reporte'))).toBe(true);
    }
    expect(await cmPage.evaluate(() => _rvV.periodo)).toBe('anual');
    await cmPage.keyboard.press('Escape');
    await expect(cmPage.locator('#ov-reporte.show')).toHaveCount(0);
    await expect(cmPage.locator('#ov-revision-semanal.show')).toBeVisible();
  });

  test('si el resumen no está disponible o falla: el paso 1 conserva un texto y no rompe', async ({ cmPage }) => {
    await sembrar(cmPage, new Date(2026, 10, 9, 12, 0));
    await cmPage.evaluate(() => { ReportesVista.resumenSemanalHtml = () => { throw new Error('no cargado'); }; });
    await abrir(cmPage);
    await expect(cmPage.locator('#rs-pane-1 .rs-empty')).toContainText('Por ahora no hay números de la semana');
    await expect(cmPage.locator('#rs-pane-1 .rv-ficha')).toHaveCount(0);
  });
});
