// Objetivos (trimestrales y metas mensuales) enlazados a métricas: sueño, entrenamiento, estudio, dieta,
// finanzas (gasto total y superávit) y hábito en Conocimiento. "Hoy" se fija pisando getActiveDate().
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-10';
const TRIM = 't4-2026';
const MES = '2026-11';

async function prep(page, tab = 'vida') {
  await page.evaluate(({ hoy, trim }) => {
    window.getActiveDate = () => hoy;
    const qo = S.quarterlyObjectives;
    if (!qo.periods.find((p) => p.id === trim)) qo.periods.push({ id: trim, label: 'T4 2026', flat: false, note: null, objectives: [] });
    qo.activePeriod = trim;
    S.monthlyGoals = {};
  }, { hoy: HOY, trim: TRIM });
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
}
const prog = (page, periodId, link) => page.evaluate(({ p, l }) => qobjLinkProgress(p, l), { p: periodId, l: link });
const dia = (n) => `2026-11-${String(n).padStart(2, '0')}`;

test.describe('vínculos de objetivos: cálculo', () => {
  test('sueño: levantarse en franja cuenta sobre los días transcurridos (sin registro = no cumplido)', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.evaluate(([a, b, c, d, e]) => {
      S.sleepLog = { [a]: { waketime: '07:10' }, [b]: { waketime: '07:20' }, [c]: { waketime: '07:00' }, [d]: { waketime: '09:00' }, [e]: { waketime: '06:00' } };
    }, [1, 2, 3, 4, 5].map(dia));
    const r = await prog(cmPage, MES, { type: 'sleep', metric: 'wake_in', desde: '07:00', hasta: '07:30', target: 60 });
    expect(r.label).toContain('30% de los días (meta 60%)');   // 3 que cumplen / 10 días transcurridos
    expect(r.label).toContain('5 de 10 días registrados');
    expect(r.pct).toBe(50);
    expect(r.exceeded).toBeFalsy();
  });

  test('sueño: acostarse antes de una hora (23:50 y 00:10 cuentan como antes de 00:30)', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.evaluate(([a, b, c, d]) => {
      S.sleepLog = { [a]: { bedtime: '23:00' }, [b]: { bedtime: '23:45' }, [c]: { bedtime: '00:15' }, [d]: { bedtime: '22:30' } };
    }, [1, 2, 3, 4].map(dia));
    const r = await prog(cmPage, MES, { type: 'sleep', metric: 'bed_before', hora: '23:30', target: 40 });
    expect(r.label).toContain('20% de los días (meta 40%)');   // 2 de 10
    expect(r.label).toContain('4 de 10 días registrados');
    expect(r.pct).toBe(50);
    const r2 = await prog(cmPage, MES, { type: 'sleep', metric: 'bed_before', hora: '00:30', target: 40 });
    expect(r2.label).toContain('40% de los días');             // ahora entran 23:00, 23:45, 00:15, 22:30
    expect(r2.pct).toBe(100);
  });

  test('sueño: mínimo de horas, y sin registros = 0%', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.evaluate((ds) => { S.sleepLog = {}; ds.forEach((d, i) => { S.sleepLog[d] = { hours: [8, 6, 7.5, 5, 7][i] }; }); }, [1, 2, 3, 4, 5].map(dia));
    const r = await prog(cmPage, MES, { type: 'sleep', metric: 'hours_min', horas: 7, target: 30 });
    expect(r.label).toContain('30% de los días (meta 30%)');   // 8, 7.5 y 7 → 3 de 10
    expect(r.pct).toBe(100);
    await cmPage.evaluate(() => { S.sleepLog = {}; });
    const v = await prog(cmPage, MES, { type: 'sleep', metric: 'hours_min', horas: 7, target: 30 });
    expect(v.label).toContain('0% de los días');
    expect(v.label).toContain('0 de 10 días registrados');
    expect(v.pct).toBe(0);
  });

  test('sueño en un trimestre: días transcurridos desde el 1 de octubre', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.evaluate(() => { S.sleepLog = { '2026-10-02': { waketime: '07:00' }, '2026-11-03': { waketime: '07:05' } }; });
    const r = await prog(cmPage, TRIM, { type: 'sleep', metric: 'wake_in', desde: '07:00', hasta: '07:30', target: 10 });
    expect(r.label).toContain('2 de 41 días registrados');   // oct (31) + nov 1-10
    expect(r.label).toContain('5% de los días');
  });

  test('entrenamiento: sesiones terminadas en el rango', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.evaluate(() => { S.routineLog = { r1: [{ id: 'a', date: '2026-11-03' }, { id: 'b', date: '2026-11-09' }, { id: 'c', date: '2026-10-30' }], r2: [{ id: 'd', date: '2026-11-04' }] }; });
    const m = await prog(cmPage, MES, { type: 'gym', metric: 'sesiones', target: 4 });
    expect(m.label).toContain('3/4 sesiones'); expect(m.pct).toBe(75);
    const t = await prog(cmPage, TRIM, { type: 'gym', metric: 'sesiones', target: 8 });
    expect(t.label).toContain('4/8 sesiones'); expect(t.pct).toBe(50);
  });

  test('estudio: horas de Pomodoro hasta hoy', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.evaluate(() => { S.pomodoroHistory = [{ id: '1', date: '2026-11-02', minutes: 90 }, { id: '2', date: '2026-11-05', minutes: 60 }, { id: '3', date: '2026-12-01', minutes: 600 }]; });
    const r = await prog(cmPage, MES, { type: 'estudio', metric: 'horas', target: 10 });
    expect(r.label).toContain('2.5/10 h'); expect(r.pct).toBe(25);
  });

  test('dieta: días cumplidos en el rango', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.evaluate((ds) => {
      ensureDietaState();
      S.dieta.reglas = [{ id: 'x1', text: 'a' }, { id: 'x2', text: 'b' }]; S.dieta.umbral = 2; S.dieta.log = {};
      ds.slice(0, 3).forEach((d) => { S.dieta.log[d] = ['x1', 'x2']; });
      S.dieta.log[ds[3]] = ['x1'];   // no llega al umbral
    }, [1, 2, 3, 4].map(dia));
    const r = await prog(cmPage, MES, { type: 'dieta', metric: 'dias', target: 6 });
    expect(r.label).toContain('3/6 días cumplidos'); expect(r.pct).toBe(50);
  });

  test('finanzas: gasto total pasado del tope se marca como excedido; sin tocar otras monedas', async ({ cmPage }) => {
    await prep(cmPage, 'finanzas');
    await cmPage.evaluate(() => {
      S.transactions = [
        { id: 't1', type: 'expense', currency: 'ARS', category: 'food', date: '2026-11-02', amount: 90000 },
        { id: 't2', type: 'expense', currency: 'ARS', category: 'other', date: '2026-11-05', amount: 60000 },
        { id: 't3', type: 'expense', currency: 'USD', category: 'food', date: '2026-11-05', amount: 999 },
        { id: 't4', type: 'expense', currency: 'ARS', category: 'food', date: '2026-10-05', amount: 777 },
      ];
    });
    const r = await prog(cmPage, MES, { type: 'finance', metric: 'gasto_total', target: 100000 });
    expect(r.label).toMatch(/150[.,]000\/\D*100[.,]000/);
    expect(r.exceeded).toBe(true); expect(r.pct).toBe(100);
    const ok = await prog(cmPage, MES, { type: 'finance', metric: 'gasto_total', target: 300000 });
    expect(ok.exceeded).toBe(false); expect(ok.pct).toBe(50);
  });

  test('finanzas: superávit total y promedio por mes en un trimestre', async ({ cmPage }) => {
    await prep(cmPage, 'finanzas');
    await cmPage.evaluate(() => {
      S.transactions = [
        { id: 'i1', type: 'income', currency: 'ARS', date: '2026-10-05', amount: 300000 },
        { id: 'e1', type: 'expense', currency: 'ARS', category: 'food', date: '2026-10-06', amount: 100000 },
        { id: 'i2', type: 'income', currency: 'ARS', date: '2026-11-05', amount: 200000 },
        { id: 'e2', type: 'expense', currency: 'ARS', category: 'food', date: '2026-11-06', amount: 100000 },
      ];
    });
    const tot = await prog(cmPage, TRIM, { type: 'finance', metric: 'superavit', modo: 'total', target: 600000 });
    expect(tot.label).toMatch(/Superávit · \D*300[.,]000/); expect(tot.pct).toBe(50);
    const prom = await prog(cmPage, TRIM, { type: 'finance', metric: 'superavit', modo: 'promedio', target: 300000 });
    expect(prom.label).toContain('promedio por mes'); expect(prom.label).toMatch(/150[.,]000/); expect(prom.pct).toBe(50);   // 2 meses transcurridos
    const mes = await prog(cmPage, MES, { type: 'finance', metric: 'superavit', modo: 'promedio', target: 100000 });
    expect(mes.label).not.toContain('promedio'); expect(mes.pct).toBe(100);   // en un mes total = promedio: 100.000
    const neg = await prog(cmPage, MES, { type: 'finance', metric: 'superavit', modo: 'total', target: 100000 });
    expect(neg.pct).toBe(100);
  });

  test('hábito de Conocimiento y link viejo de ingresos siguen igual', async ({ cmPage }) => {
    await prep(cmPage, 'conocimiento');
    await cmPage.evaluate((ds) => {
      if (Array.isArray(S.habitTrackers)) S.habitTrackers = { vida: S.habitTrackers };
      const days = {}; ds.slice(0, 5).forEach((d) => { days[d] = 'done'; });
      S.habitTrackers.conocimiento = [{ id: 'hc1', name: 'Leer', emoji: '📖', days }];
      S.transactions = [{ id: 'i1', type: 'income', currency: 'ARS', date: '2026-11-05', amount: 50000 }];
    }, Array.from({ length: 10 }, (_, i) => dia(i + 1)));
    const h = await prog(cmPage, MES, { type: 'habit', section: 'conocimiento', habitId: 'hc1' });
    expect(h.label).toContain('5/10 días'); expect(h.pct).toBe(50);
    const ing = await prog(cmPage, TRIM, { type: 'finance', metric: 'ingreso', target: 100000 });
    expect(ing.pct).toBe(50);
  });
});

test.describe('vínculos de objetivos: UI', () => {
  test('meta mensual con vínculo de sueño: se crea, muestra la barra y se puede editar', async ({ cmPage }) => {
    await prep(cmPage, 'vida');
    await cmPage.evaluate((ds) => {
      S.sleepLog = {}; ds.forEach((d, i) => { S.sleepLog[d] = { waketime: i < 4 ? '07:10' : '09:00' }; });
      selectMonthView('vida', '2026-11');
    }, [1, 2, 3, 4, 5].map(dia));
    await cmPage.click('#qobj-wrap-vida button:has-text("+ Meta mensual")');
    await expect(cmPage.locator('#modal-add-mgoal')).toHaveClass(/open/);
    await cmPage.fill('#mgoal-input-text', 'Levantarme temprano');
    await cmPage.selectOption('#mgoal-link-kind', 'sleep');
    await cmPage.fill('#mgoal-link-sl-desde', '07:00');
    await cmPage.fill('#mgoal-link-sl-hasta', '07:30');
    await cmPage.fill('#mgoal-link-sl-target', '80');
    await cmPage.click('#mgoal-save-btn');
    const g = await cmPage.evaluate(() => S.monthlyGoals.vida['2026-11'][0]);
    expect(g.link).toEqual({ type: 'sleep', metric: 'wake_in', desde: '07:00', hasta: '07:30', target: 80 });
    expect(g.done).toBe(false);
    const item = cmPage.locator('#qobj-wrap-vida .monthly-goal-item').first();
    await expect(item.locator('.qobj-link-label')).toContainText('40% de los días (meta 80%)');   // 4 de 10
    await expect(item.locator('.qobj-link-bar')).toHaveAttribute('style', /width:50%/);
    // Editar: cambia a "dormir 7 h" y vuelve a ver el modal con el valor guardado.
    await item.locator('button[title="Editar"]').click({ force: true });
    await expect(cmPage.locator('#mgoal-link-kind')).toHaveValue('sleep');
    await expect(cmPage.locator('#mgoal-link-sl-desde')).toHaveValue('07:00');
    await cmPage.selectOption('#mgoal-link-sl-metric', 'hours_min');
    await cmPage.fill('#mgoal-link-sl-horas', '7');
    await cmPage.click('#mgoal-save-btn');
    const g2 = await cmPage.evaluate(() => S.monthlyGoals.vida['2026-11']);
    expect(g2).toHaveLength(1);
    expect(g2[0].link).toMatchObject({ metric: 'hours_min', horas: 7, target: 80 });
    expect(g2[0].text).toBe('Levantarme temprano');
  });

  test('meta mensual: superávit no muestra el selector de modo; trimestral sí, y guarda promedio', async ({ cmPage }) => {
    await prep(cmPage, 'finanzas');
    await cmPage.evaluate(() => {
      S.transactions = [
        { id: 'i1', type: 'income', currency: 'ARS', date: '2026-10-05', amount: 300000 },
        { id: 'i2', type: 'income', currency: 'ARS', date: '2026-11-05', amount: 300000 },
      ];
      selectMonthView('finanzas', '2026-11');
    });
    await cmPage.click('#qobj-wrap-finanzas button:has-text("+ Meta mensual")');
    await cmPage.selectOption('#mgoal-link-kind', 'finance');
    await cmPage.selectOption('#mgoal-link-fin-metric', 'superavit');
    await expect(cmPage.locator('#mgoal-link-fin-modo')).toHaveCount(0);
    await cmPage.click('#modal-add-mgoal .btn-ghost');

    await cmPage.evaluate(() => selectMonthView('finanzas', 'trim'));
    await cmPage.click('#qobj-wrap-finanzas .qobj-category-row button');
    await expect(cmPage.locator('#modal-add-qobj')).toHaveClass(/open/);
    await cmPage.fill('#qobj-input-text', 'Superávit promedio');
    await cmPage.selectOption('#qobj-add-kind', 'finance');
    await cmPage.selectOption('#qobj-add-fin-metric', 'superavit');
    await cmPage.selectOption('#qobj-add-fin-modo', 'promedio');
    await cmPage.fill('#qobj-add-fin-target', '300000');
    await cmPage.click('#modal-add-qobj button:has-text("Agregar")');
    const o = await cmPage.evaluate((t) => S.quarterlyObjectives.periods.find((p) => p.id === t).objectives.pop(), TRIM);
    expect(o.link).toEqual({ type: 'finance', metric: 'superavit', modo: 'promedio', target: 300000 });
    await expect(cmPage.locator('#qobj-wrap-finanzas .qobj-link-label').last()).toContainText('promedio por mes');
  });

  test('Conocimiento: el selector ofrece materias y también hábitos', async ({ cmPage }) => {
    await prep(cmPage, 'conocimiento');
    await cmPage.evaluate(() => {
      if (Array.isArray(S.habitTrackers)) S.habitTrackers = { vida: S.habitTrackers };
      S.habitTrackers.conocimiento = [{ id: 'hc1', name: 'Leer', emoji: '📖', days: {} }];
      selectMonthView('conocimiento', '2026-11');
    });
    await cmPage.click('#qobj-wrap-conocimiento button:has-text("+ Meta mensual")');
    const kinds = await cmPage.locator('#mgoal-link-kind option').allTextContents();
    expect(kinds.slice(0, 3)).toEqual(['Sin enlace', 'Materias', 'Hábito']);
    for (const k of ['Sueño', 'Entrenamiento', 'Estudio', 'Dieta', 'Finanzas']) expect(kinds).toContain(k);
    await cmPage.fill('#mgoal-input-text', 'Leer todos los días');
    await cmPage.selectOption('#mgoal-link-kind', 'habit');
    await cmPage.selectOption('#mgoal-link-habit', 'hc1');
    await cmPage.click('#mgoal-save-btn');
    const g = await cmPage.evaluate(() => S.monthlyGoals.conocimiento['2026-11'][0]);
    expect(g.link).toEqual({ type: 'habit', section: 'conocimiento', habitId: 'hc1' });
  });

  test('meta con barra al 100% no se tilda sola', async ({ cmPage }) => {
    await prep(cmPage, 'salud');
    await cmPage.evaluate(() => {
      S.routineLog = { r1: [{ id: 'a', date: '2026-11-03' }, { id: 'b', date: '2026-11-04' }] };
      S.monthlyGoals = { salud: { '2026-11': [{ id: 1, text: 'Entrenar 2', done: false, link: { type: 'gym', metric: 'sesiones', target: 2 } }] } };
      selectMonthView('salud', '2026-11');
    });
    const item = cmPage.locator('#qobj-wrap-salud .monthly-goal-item').first();
    await expect(item.locator('.qobj-link-bar')).toHaveAttribute('style', /width:100%/);
    expect(await cmPage.evaluate(() => S.monthlyGoals.salud['2026-11'][0].done)).toBe(false);
  });

  test('móvil 390: el modal del selector no desborda (sueño y materias)', async ({ cmPage }) => {
    await cmPage.setViewportSize({ width: 390, height: 844 });
    await prep(cmPage, 'conocimiento');
    await cmPage.evaluate(() => selectMonthView('conocimiento', '2026-11'));
    await cmPage.click('#qobj-wrap-conocimiento button:has-text("+ Meta mensual")');
    for (const k of ['sleep', 'law', 'finance']) {
      await cmPage.selectOption('#mgoal-link-kind', k);
      if (k === 'finance') await cmPage.selectOption('#mgoal-link-fin-metric', 'gasto_total');
      const m = await cmPage.evaluate(() => {
        const modal = document.querySelector('#modal-add-mgoal .modal'), r = modal.getBoundingClientRect();
        const fuera = [...modal.querySelectorAll('input,select,.qobj-link-row')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > r.right + 1 || b.left < r.left - 1); }).length;
        return { sw: modal.scrollWidth - modal.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, fuera };
      });
      expect(m.sw, k).toBeLessThanOrEqual(1); expect(m.doc, k).toBeLessThanOrEqual(1); expect(m.fuera, k).toBe(0);
    }
  });
});
