// "Objetivos del mes" de ANÁLISIS DE VIDA: el ritmo sale del progreso real de las metas vinculadas, no solo de las tildadas.
// Día 26 de un mes de 30 (87% transcurrido). Datos sintéticos; "hoy" se fija pisando getActiveDate().
'use strict';
const path = require('path');
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-26';
const MES = '2026-11';
const SHOTS = 'C:/Users/Tobias/AppData/Local/Temp/claude/5d52610f902b8d2c/0ee1a2f9-6695-4db7-81d3-bffab298c7c8/scratchpad/objetivos-ritmo';

const ingreso = (target) => ({ type: 'finance', metric: 'ingreso', target });
const topeTotal = (target) => ({ type: 'finance', metric: 'gasto_total', target });
const meta = (text, o = {}) => Object.assign({ id: 'g' + text, text, done: false, link: null }, o);

// Siembra metas del mes en una sección + movimientos, y devuelve la línea "Objetivos del mes" del análisis.
async function linea(page, sec, goals, txns = []) {
  return page.evaluate(({ hoy, mes, sec, goals, txns }) => {
    window.getActiveDate = () => hoy;
    S.monthlyGoals = { [sec]: { [mes]: goals } };
    S.transactions = txns;
    S.routineLog = {};
    const it = JARVIS_INTEL.insights(sec).find((i) => /Objetivos del mes/.test(i.html));
    return it ? { lvl: it.lvl, texto: it.html.replace(/<[^>]+>/g, '') } : null;
  }, { hoy: HOY, mes: MES, sec, goals, txns });
}
const tx = (type, amount) => ({ id: 't' + type + amount, type, amount, currency: 'ARS', category: 'food', date: '2026-11-10' });

test.describe('ritmo de objetivos del mes', () => {
  test('vida: 2 metas vinculadas en camino, sin tildar → NO dice atrasado', async ({ cmPage }) => {
    const r = await linea(cmPage, 'vida',
      [meta('Ingresos', { link: ingreso(100000) }), meta('Gasto bajo', { link: topeTotal(100000) })],
      [tx('income', 90000), tx('expense', 40000)]);
    expect(r.texto).toContain('0/2 cumplidos');
    expect(r.texto).toContain('2 en camino');
    expect(r.texto).toContain('en camino.');
    expect(r.texto).not.toMatch(/atrasad/);
    expect(['ok', 'info']).toContain(r.lvl);
    await cmPage.click('.nav-btn[data-tab="vida"]');
    await cmPage.evaluate(() => JARVIS_INTEL.renderCard('vida'));
    const card = cmPage.locator('#intel-body-vida, #intel-card-vida, [id*="intel"][id*="vida"]').first();
    await cmPage.screenshot({ path: path.join(SHOTS, 'vida-' + cmPage.viewportSize().width + '.png') });
    await expect(card).not.toContainText('atrasado');
  });

  test('finanzas: una vinculada atrasada → "1 atrasada" y palabra atrasado', async ({ cmPage }) => {
    const r = await linea(cmPage, 'finanzas',
      [meta('Ingresos A', { link: ingreso(100000) }), meta('Ingresos B', { link: ingreso(100000) })],
      [tx('income', 90000)]);   // 90% y... ambas ven los mismos ingresos: se separa con metas distintas abajo
    expect(r.texto).toContain('2 en camino');
    const r2 = await linea(cmPage, 'finanzas',
      [meta('Ingresos', { link: ingreso(100000) }), meta('Ingresos grande', { link: ingreso(1000000) })],
      [tx('income', 90000)]);   // 90% (ok) y 9% (atrasada)
    expect(r2.texto).toContain('1 en camino');
    expect(r2.texto).toContain('1 atrasada');
    expect(r2.texto).toContain('atrasado.');
    expect(['warn', 'bad']).toContain(r2.lvl);
  });

  test('finanzas: tope pasado → atrasada; tope bajo el ritmo → en camino', async ({ cmPage }) => {
    const pasado = await linea(cmPage, 'finanzas', [meta('Tope', { link: topeTotal(50000) })], [tx('expense', 60000)]);
    expect(pasado.texto).toContain('1 atrasada');
    const rapido = await linea(cmPage, 'finanzas', [meta('Tope', { link: topeTotal(50000) })], [tx('expense', 49000)]);   // 98% del tope con 87% del mes
    expect(rapido.texto).toContain('1 atrasada');
    const bien = await linea(cmPage, 'finanzas', [meta('Tope', { link: topeTotal(50000) })], [tx('expense', 20000)]);
    expect(bien.texto).toContain('1 en camino');
    expect(bien.texto).not.toMatch(/atrasad/);
  });

  test('salud: sin vínculo y sin tildar → "sin medir", no atrasada', async ({ cmPage }) => {
    const r = await linea(cmPage, 'salud', [meta('Algo libre'), meta('Otra libre')]);
    expect(r.texto).toContain('2 sin medir');
    expect(r.texto).not.toMatch(/atrasad|en camino/);
    expect(r.lvl).toBe('info');
    const mix = await linea(cmPage, 'salud', [meta('Libre'), meta('Hecha', { done: true })]);
    expect(mix.texto).toContain('1/2 cumplidos');
    expect(mix.texto).toContain('1 sin medir');
    expect(mix.texto).not.toMatch(/atrasad/);
  });

  test('salud: gimnasio acumulado a ritmo → en camino; muy corto → atrasada', async ({ cmPage }) => {
    const base = (n) => cmPage.evaluate(({ hoy, mes, n }) => {
      window.getActiveDate = () => hoy;
      S.monthlyGoals = { salud: { [mes]: [{ id: 'gy', text: 'Gym', done: false, link: { type: 'gym', metric: 'sesiones', target: 10 } }] } };
      S.routineLog = { r1: Array.from({ length: n }, (_, i) => ({ date: mes + '-' + String(i + 1).padStart(2, '0') })) };
      return JARVIS_INTEL.insights('salud').find((i) => /Objetivos del mes/.test(i.html)).html.replace(/<[^>]+>/g, '');
    }, { hoy: HOY, mes: MES, n });
    expect(await base(8)).toContain('1 en camino');
    expect(await base(2)).toContain('1 atrasada');
  });

  test('todas tildadas → cumplido', async ({ cmPage }) => {
    const r = await linea(cmPage, 'vida', [meta('A', { done: true }), meta('B', { done: true })]);
    expect(r.texto).toContain('2/2 cumplidos');
    expect(r.texto).toContain('cumplido.');
    expect(r.texto).not.toMatch(/atrasad/);
    expect(r.lvl).toBe('ok');
  });
});
