// Objetivos de PORCENTAJE (hábito con meta en %, sueño): «85% · meta 60%», marca de la meta en la barra,
// estado «En camino» / «Por debajo» y NADA se marca hecho antes de que cierre el período.
// Los de cantidad (gym «8/12») siguen igual. "Hoy" se fija pisando getActiveDate().
'use strict';
const { test, expect } = require('./support/fixtures');

const TRIM = 't4-2026';
const MES = '2026-11';
const dia = (n) => `2026-11-${String(n).padStart(2, '0')}`;

// hoy = 14/11; hábito con `hechos` de los primeros 14 días de noviembre
async function prep(page, { hoy = '2026-11-14', hechos = 11, tab = 'vida', goals = null, objs = null } = {}) {
  await page.evaluate(({ hoy, hechos, tab, goals, objs, TRIM }) => {
    window.getActiveDate = () => hoy;
    if (Array.isArray(S.habitTrackers)) S.habitTrackers = { vida: S.habitTrackers };
    const days = {};
    for (let i = 1; i <= hechos; i++) days['2026-11-' + String(i).padStart(2, '0')] = 'done';
    S.habitTrackers = S.habitTrackers || {};
    S.habitTrackers.vida = [{ id: 'hm1', name: 'Madrugar', emoji: '🌅', days }];
    const qo = S.quarterlyObjectives;
    let per = qo.periods.find((p) => p.id === TRIM);
    if (!per) { per = { id: TRIM, label: 'T4 2026', flat: false, note: null, objectives: [] }; qo.periods.push(per); }
    per.objectives = objs || [];
    qo.activePeriod = TRIM;
    S.monthlyGoals = { vida: { '2026-11': goals || [] } };
    S.sleepLog = {};
  }, { hoy, hechos, tab, goals, objs, TRIM });
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
}
const verMes = (page) => page.evaluate((m) => { selectMonthView('vida', m); }, MES);
const hab = (extra) => ({ type: 'habit', section: 'vida', habitId: 'hm1', ...extra });
const mg = (id, text, link, done = false) => ({ id, text, done, link });

test.describe('objetivos de porcentaje', () => {
  test('hábito 11 de 14 con meta 60%: «85% · meta 60%», En camino, no se marca hecho', async ({ cmPage, consoleErrors }) => {
    await prep(cmPage, { goals: [mg(1, 'Madrugador y responsable: levantarme 60% de los días antes de las 08:00', hab())] });
    await verMes(cmPage);
    const item = cmPage.locator('#qobj-wrap-vida .monthly-goal-item').first();
    await expect(item.locator('.qobj-link-label')).toHaveText('🌅 Madrugar · 85% · meta 60%');   // 11 de 13: hoy (14) sin registro no cuenta, igual que el calendario; la meta sale del texto
    await expect(item.locator('.qobj-link-estado')).toHaveText('En camino');
    await expect(item.locator('.qobj-link-progress')).toHaveAttribute('title', 'Es el % de los días que ya pasaron');
    await expect(item).not.toContainText('11/14');
    expect(await cmPage.evaluate(() => S.monthlyGoals.vida['2026-11'][0].done)).toBe(false);   // mitad de mes: nada hecho
    expect(consoleErrors).toEqual([]);
  });

  test('meta explícita del vínculo manda sobre el texto; 5 de 14 → Por debajo', async ({ cmPage }) => {
    await prep(cmPage, { hechos: 5, goals: [mg(1, 'Levantarme temprano (50% de los días)', hab({ target: 60 }))] });
    await verMes(cmPage);
    const item = cmPage.locator('#qobj-wrap-vida .monthly-goal-item').first();
    await expect(item.locator('.qobj-link-label')).toHaveText('🌅 Madrugar · 38% · meta 60%');   // 5 de 13
    await expect(item.locator('.qobj-link-estado')).toHaveText('Por debajo');
    await expect(item.locator('.qobj-link-estado')).toHaveClass(/low/);
  });

  test('la marca de la meta está en el 60% del ancho de la barra y la barra va al % real', async ({ cmPage }) => {
    await prep(cmPage, { goals: [mg(1, 'Madrugar 60%', hab())] });
    await verMes(cmPage);
    const item = cmPage.locator('#qobj-wrap-vida .monthly-goal-item').first();
    await expect(item.locator('.qobj-link-bar')).toHaveAttribute('style', /width:85%/);
    const m = await item.locator('.qobj-link-bar-wrap').evaluate((w) => {
      const wb = w.getBoundingClientRect(), mk = w.querySelector('.qobj-link-meta').getBoundingClientRect();
      return { frac: (mk.left + mk.width / 2 - wb.left) / wb.width, alto: mk.height };
    });
    expect(m.frac).toBeGreaterThan(0.58); expect(m.frac).toBeLessThan(0.62);
    expect(m.alto).toBeGreaterThan(4);   // sobresale de la barra (4 px)
  });

  test('sueño wake_in en %: «x% · meta y%» y estado', async ({ cmPage }) => {
    await prep(cmPage, { goals: [mg(1, 'Levantarme 07:00–07:30', { type: 'sleep', metric: 'wake_in', desde: '07:00', hasta: '07:30', target: 60 })] });
    await cmPage.evaluate((ds) => { ds.forEach((d) => { S.sleepLog[d] = { waketime: '07:10' }; }); }, Array.from({ length: 10 }, (_, i) => dia(i + 1)));
    await verMes(cmPage);
    const item = cmPage.locator('#qobj-wrap-vida .monthly-goal-item').first();
    await expect(item.locator('.qobj-link-label')).toContainText('71% · meta 60%');   // 10 de 14
    await expect(item.locator('.qobj-link-estado')).toHaveText('En camino');
    expect(await cmPage.evaluate(() => S.monthlyGoals.vida['2026-11'][0].done)).toBe(false);
  });

  test('cantidad (gym 8 de 12) sigue igual: «8/12 sesiones», sin marca ni estado', async ({ cmPage }) => {
    await prep(cmPage, { goals: [mg(1, 'Entrenar 12', { type: 'gym', metric: 'sesiones', target: 12 })] });
    await cmPage.evaluate(() => { S.routineLog = { r1: Array.from({ length: 8 }, (_, i) => ({ id: 'e' + i, date: '2026-11-0' + (i + 1) })) }; });
    await verMes(cmPage);
    const item = cmPage.locator('#qobj-wrap-vida .monthly-goal-item').first();
    await expect(item.locator('.qobj-link-label')).toContainText('8/12 sesiones');
    await expect(item.locator('.qobj-link-meta')).toHaveCount(0);
    await expect(item.locator('.qobj-link-estado')).toHaveCount(0);
    await expect(item.locator('.qobj-link-bar')).toHaveAttribute('style', /width:67%/);
  });

  test('al pasar el fin de mes: cumplida → se marca sola; sin cumplir → no; lo marcado a mano se respeta', async ({ cmPage }) => {
    await prep(cmPage, {
      goals: [mg(1, 'Cumplida 60%', hab()), mg(2, 'No cumplida 95%', hab()), mg(3, 'Desmarcada a mano 60%', hab())],
    });
    await verMes(cmPage);
    expect(await cmPage.evaluate(() => S.monthlyGoals.vida['2026-11'].map((g) => g.done))).toEqual([false, false, false]);
    // pasa el mes: 30/11 con 11 de 30 días hechos (37%) no alcanza para 60%; completamos 20 días → 67%
    await cmPage.evaluate(() => {
      window.getActiveDate = () => '2026-12-02';
      const d = S.habitTrackers.vida[0].days;
      for (let i = 1; i <= 20; i++) d['2026-11-' + String(i).padStart(2, '0')] = 'done';
      selectMonthView('vida', '2026-11');
    });
    const r = await cmPage.evaluate(() => S.monthlyGoals.vida['2026-11'].map((g) => ({ done: g.done, ev: !!g.autoEval })));
    expect(r[0]).toEqual({ done: true, ev: true });    // 20/30 = 67% ≥ 60
    expect(r[1]).toEqual({ done: false, ev: true });   // 67% < 95
    expect(r[2]).toEqual({ done: true, ev: true });
    await expect(cmPage.locator('#qobj-wrap-vida .monthly-goal-item').nth(1).locator('.qobj-link-estado')).toHaveText('No se cumplió');
    await expect(cmPage.locator('#qobj-wrap-vida .monthly-goal-item').nth(0).locator('.qobj-link-estado')).toHaveText('Cumplida');
    // el usuario desmarca la 3.ª: no se vuelve a marcar sola
    await cmPage.evaluate(() => { toggleMonthlyGoal('vida', '2026-11', 2); });
    await cmPage.evaluate(() => { selectMonthView('vida', '2026-11'); });
    expect(await cmPage.evaluate(() => S.monthlyGoals.vida['2026-11'][2].done)).toBe(false);
  });

  test('objetivo trimestral con vínculo en %: mismo formato y recién se marca al cerrar el trimestre', async ({ cmPage }) => {
    await prep(cmPage, { objs: [{ id: 1, text: 'Católico devoto: 60% de días rezando a primera hora', done: false, category: 'Vida', link: hab() }] });
    await cmPage.evaluate(() => selectMonthView('vida', 'trim'));
    const item = cmPage.locator('#qobj-wrap-vida .qobj-item').first();
    await expect(item.locator('.qobj-link-label')).toHaveText('🌅 Madrugar · 25% · meta 60%');   // 11 de 44 días (hoy sin registro no cuenta) (1/10 → 14/11)... hábito solo registra noviembre
    await expect(item.locator('.qobj-link-estado')).toHaveText('Por debajo');
    await expect(item.locator('.qobj-link-meta')).toHaveCount(1);
    expect(await cmPage.evaluate(() => S.quarterlyObjectives.periods.find((p) => p.id === 't4-2026').objectives[0].done)).toBe(false);
    // cierra el trimestre con el hábito cumplido
    await cmPage.evaluate(() => {
      window.getActiveDate = () => '2027-01-03';
      const d = S.habitTrackers.vida[0].days;
      const f = new Date('2026-10-01T00:00:00');
      for (let i = 0; i < 92; i++) { const x = new Date(f); x.setDate(f.getDate() + i); d[x.toISOString().slice(0, 10)] = 'done'; }
      selectMonthView('vida', 'trim');
    });
    expect(await cmPage.evaluate(() => S.quarterlyObjectives.periods.find((p) => p.id === 't4-2026').objectives[0].done)).toBe(true);
  });

  test('móvil 390: sin scroll horizontal con la marca y el estado', async ({ cmPage }) => {
    await cmPage.setViewportSize({ width: 390, height: 844 });
    await prep(cmPage, { goals: [mg(1, 'Madrugador y responsable: Levantarme 60% de los días antes de las 08:00', hab()), mg(2, 'Levantarme 07:00', { type: 'sleep', metric: 'wake_in', desde: '07:00', hasta: '07:30', target: 60 })] });
    await verMes(cmPage);
    await expect(cmPage.locator('#qobj-wrap-vida .qobj-link-estado').first()).toBeVisible();
    const m = await cmPage.evaluate(() => ({ doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    expect(m.doc).toBeLessThanOrEqual(0);
  });

  test('el selector de hábito acepta una meta en % y la guarda en el vínculo', async ({ cmPage }) => {
    await prep(cmPage, {});
    await verMes(cmPage);
    await cmPage.click('#qobj-wrap-vida button:has-text("+ Meta mensual")');
    await cmPage.fill('#mgoal-input-text', 'Madrugar');
    await cmPage.selectOption('#mgoal-link-kind', 'habit');
    await cmPage.selectOption('#mgoal-link-habit', 'hm1');
    await cmPage.fill('#mgoal-link-habit-target', '70');
    await cmPage.click('#mgoal-save-btn');
    expect(await cmPage.evaluate(() => S.monthlyGoals.vida['2026-11'][0].link)).toEqual({ type: 'habit', section: 'vida', habitId: 'hm1', target: 70 });
    await expect(cmPage.locator('#qobj-wrap-vida .qobj-link-label').first()).toContainText('meta 70%');
  });
});

// Bug 24/11: el % del objetivo no coincidía con el del calendario del hábito (parcial contaba 0 y hoy sin registro contaba como fallado).
test('el % del objetivo de hábito coincide con el calendario: parcial = medio día, descanso fuera, hoy sin registro fuera', async ({ cmPage, consoleErrors }) => {
  await prep(cmPage, { hoy: '2026-11-24', hechos: 0, goals: [mg(1, 'Madrugador: levantarme 60% de los días antes de las 08:00', hab())] });
  await cmPage.evaluate(() => {
    const d = S.habitTrackers.vida[0].days;
    for (let i = 1; i <= 11; i++) d['2026-11-' + String(i).padStart(2, '0')] = 'done';      // 11 hechos
    d['2026-11-12'] = 'partial';                                                            // 1 parcial
    d['2026-11-13'] = 'missed';                                                             // 1 fallado
    for (let i = 14; i <= 23; i++) d['2026-11-' + String(i).padStart(2, '0')] = 'rest';    // 10 de descanso; hoy 24 sin registro
  });
  await verMes(cmPage);
  const item = cmPage.locator('#qobj-wrap-vida .monthly-goal-item').first();
  await expect(item.locator('.qobj-link-label')).toHaveText('🌅 Madrugar · 88% · meta 60%');   // (11 + 0,5) / 13
  await expect(item.locator('.qobj-link-estado')).toHaveText('En camino');
  expect(consoleErrors).toEqual([]);
});
