// Etapa B T2b: pantalla de Reportes (sub-pestaña Revisiones + ventana con páginas deslizables). Solo lectura de S.
'use strict';
const { test, expect } = require('./support/fixtures');

const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Estado de 2-3 meses (sep-nov 2026) con finanzas, hábitos, estudio y foco. "Hoy" = 12/11/2026.
async function sembrar(page) {
  await page.clock.setFixedTime(new Date(2026, 10, 12, 12, 0));
  await page.evaluate(() => {
    const q = (n) => String(n).padStart(2, '0'), f = (y, m, d) => y + '-' + q(m) + '-' + q(d);
    const dias = (desde, hasta) => { const o = []; for (let t = new Date(desde); t <= hasta; t.setDate(t.getDate() + 1)) o.push(f(t.getFullYear(), t.getMonth() + 1, t.getDate())); return o; };
    const todos = dias(new Date(2026, 6, 1), new Date(2026, 10, 12));
    const hab = (id, name, paso) => ({ id, name, emoji: '•', days: Object.fromEntries(todos.map((d, i) => [d, ['done', 'done', 'partial', 'missed', 'rest', 'done', 'done'][(i * paso) % 7]]).filter((_, i) => i % 5 !== 4)) });
    S.habitTrackers = { vida: [hab('h-v1', 'Rezar', 1), hab('h-v2', 'Planificar', 3)], salud: [hab('h-s1', 'Entrenar', 2)], conocimiento: [hab('habit-estudio', 'Calendario de estudio', 1)], finanzas: [hab('h-f1', 'Registro financiero', 4)], ia: [hab('h-i1', 'Practicar con IA', 5)] };
    S.accounts = [
      { id: 'acc-main', name: 'Cuenta Principal', type: 'bank', balance: 850000, currency: 'ARS', icon: '🏦' },
      { id: 'acc-bonos', name: 'Bonos', type: 'invest', balance: 300000, currency: 'ARS', icon: '📈' },
      { id: 'acc-usd', name: 'Ahorro USD', type: 'invest', balance: 1200, currency: 'USD', icon: '💵' },
    ];
    S.accountHistory = []; S.nwHistory = [];
    dias(new Date(2026, 6, 1), new Date(2026, 10, 12)).filter((d, i) => i % 7 === 0 || d === '2026-11-12').forEach((d, i) => {
      S.accountHistory.push({ date: d, accountId: 'acc-main', balance: 600000 + i * 12000 }, { date: d, accountId: 'acc-bonos', balance: 200000 + i * 5000 }, { date: d, accountId: 'acc-usd', balance: 1000 + i * 10 });
      S.nwHistory.push({ date: d, value: 800000 + i * 17000 + 1000 + i * 10, c: 1 });
    });
    S.transactions = [];
    [[9, 12], [10, 12], [11, 12]].forEach(([m, hasta], k) => {
      S.transactions.push({ id: 'i' + m, date: f(2026, m, 5), name: 'Sueldo', type: 'income', amount: 900000 + k * 50000, currency: 'ARS', accountId: 'acc-main', category: 'salary' });
      ['food', 'transport', 'fun'].forEach((c, j) => S.transactions.push({ id: 'g' + m + c, date: f(2026, m, 6 + j), name: 'Gasto ' + c, type: 'expense', amount: 60000 + j * 25000 - k * 8000, currency: 'ARS', accountId: 'acc-main', category: c, verdict: j === 2 ? 'bad' : 'good' }));
    });
    S.budgets = { '2026-09': { fixed: [{ id: 'b1', name: 'Alquiler', category: 'food', unit: 'mes', v1: 1, v2: 1, v3: 150000 }] }, '2026-10': { fixed: [{ id: 'b1', name: 'Alquiler', category: 'food', unit: 'mes', v1: 1, v2: 1, v3: 150000 }] } };
    S.sgc = { finales: [{ id: 'f1', fecha: '2026-09-15', aprobo: true }, { id: 'f2', fecha: '2026-10-20', aprobo: true }, { id: 'f3', fecha: '2026-11-05', aprobo: false }] };
    S.lawProgress.years[0].subjects[0].done = true; S.lawProgress.years[0].subjects[0].doneAt = '2026-10-20'; S.lawProgress.years[0].subjects[0].grade = 8;
    S.lawProgress.years[0].subjects[1].done = true; S.lawProgress.years[0].subjects[1].doneAt = '2026-09-15'; S.lawProgress.years[0].subjects[1].grade = 9;
    S.pomodoroHistory = dias(new Date(2026, 8, 1), new Date(2026, 10, 12)).filter((_, i) => i % 3 === 0).map((d, i) => ({ id: 'p' + i, date: d, minutes: 25, full: true }));
    S.foco = { dias: {}, chequeos: [], pantalla: { '2026-10-05': 14, '2026-10-12': 12, '2026-10-19': 10 }, config: { horas: ['11:00', '15:00', '19:00'] } };
    dias(new Date(2026, 8, 1), new Date(2026, 10, 12)).forEach((d, i) => { S.foco.dias[d] = { atencion: 1 + (i % 5), energia: 1 + ((i + 2) % 5), nota: '' }; });
    ['estudio', 'gym', 'trabajo', 'estudio', 'social', 'estudio', 'descanso'].forEach((c, i) => S.foco.chequeos.push({ id: 'c' + i, fecha: '2026-11-0' + (i + 1), hora: '11:00', categoria: c, energia: 3 }));
    const cats = _prData().categorias;
    const fam = cats.find((c) => c.nombre === 'Familia'), gym = cats.find((c) => c.nombre === 'Gym');
    S.principios.objetivos = [
      { id: 'o1', texto: 'Cena familiar', horizonte: 'mensual', seccion: 'Vida', categoriaId: fam.id, estado: 'cumplido', cumplidoEl: '2026-11-03' },
      { id: 'o2', texto: 'Visita', horizonte: 'mensual', seccion: 'Vida', categoriaId: fam.id, estado: 'cumplido', cumplidoEl: '2026-10-03' },
      { id: 'o3', texto: 'Visita 2', horizonte: 'mensual', seccion: 'Vida', categoriaId: fam.id, estado: 'cumplido', cumplidoEl: '2026-10-09' },
      { id: 'o4', texto: 'Correr 5k', horizonte: 'mensual', seccion: 'Salud', categoriaId: gym.id, estado: 'cumplido', cumplidoEl: '2026-11-08' },
      { id: 'o5', texto: 'Viejo sin fecha', horizonte: 'anual', seccion: 'Salud', categoriaId: '', estado: 'cumplido' },
    ];
    S.monthlyGoals = { vida: { '2026-10': [{ id: 'm1', text: 'Meta suelta', done: true }] } };
    S.reportes = undefined;
  });
}
const abrirRev = async (page) => { await page.evaluate(() => Principios.abrir('revisiones')); await expect(page.locator('#ov-principios .pr-sub.on')).toContainText('Revisiones'); };
const elegir = async (page, periodo, clave) => { await page.evaluate(([p, c]) => ReportesVista.ver(p, c), [periodo, clave]); await expect(page.locator('#ov-reporte.show')).toBeVisible(); };
const irA = async (page, i) => { await page.locator('.rv-dot').nth(i).click(); await expect(page.locator('.rv-dot').nth(i)).toHaveClass(/on/);
  // el punto se marca a mitad del scroll suave: esperar a que la página destino quede alineada con el contenedor
  await expect.poll(() => page.locator('.rv-page').nth(i).evaluate((p) => Math.abs(p.getBoundingClientRect().left - p.parentElement.getBoundingClientRect().left)), { timeout: 5000 }).toBeLessThan(2);
};
const nombresPaginas = (page) => page.locator('.rv-page').evaluateAll((ps) => ps.map((p) => p.getAttribute('aria-label')));
// Capturas: el proyecto mobile saca 390x844; el desktop, 1700x900 (cambiar el viewport dentro de un contexto mobile cuelga el navegador).
const shot = async (page, testInfo, nombre) => {
  const movil = testInfo.project.name === 'chromium-mobile';
  if (!movil) { await page.setViewportSize({ width: 1700, height: 900 }); await page.waitForTimeout(300); }
  await page.screenshot({ path: testInfo.outputPath(nombre + '-' + (movil ? 390 : 1700) + '.png') });
};

test.describe('Reportes: pantalla', () => {
  test('paleta de comandos: "Reportes" abre Revisiones con selector de período y clave', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    await cmPage.keyboard.press('Control+k');
    await cmPage.fill('#cmdk-input', 'reportes');
    await cmPage.locator('.cmdk-item').filter({ has: cmPage.locator('.ci-lbl', { hasText: /^Reportes$/ }) }).click();
    await expect(cmPage.locator('#ov-principios.show .pr-sub.on')).toContainText('Revisiones');
    await expect(cmPage.locator('#rv-per option')).toHaveCount(5);
    await expect(cmPage.locator('#rv-clave')).toHaveText('Noviembre 2026');
    // no se puede ir al futuro; sí al anterior
    await expect(cmPage.locator('.rv-claves .pr-btn').nth(1)).toBeDisabled();
    await cmPage.locator('.rv-claves .pr-btn').nth(0).click();
    await expect(cmPage.locator('#rv-clave')).toHaveText('Octubre 2026');
    await cmPage.selectOption('#rv-per', 'semanal');
    await expect(cmPage.locator('#rv-clave')).toContainText('Semana 46');
    expect(consoleErrors).toEqual([]);
  });

  test('mensual: 8 páginas deslizables con puntos; cada ficha trae valor+comparación o "—"+motivo', async ({ cmPage, consoleErrors }, testInfo) => {
    test.setTimeout(150000);   // recorre 8 páginas y saca 4 capturas con la app (animaciones de fondo) corriendo
    await sembrar(cmPage);
    await abrirRev(cmPage);
    await cmPage.selectOption('#rv-per', 'mensual');
    await cmPage.locator('.rv-ver').click();
    await expect(cmPage.locator('#ov-reporte.show')).toBeVisible();
    expect(await nombresPaginas(cmPage)).toEqual(['Foco', 'Vida', 'Salud', 'Conocimiento', 'Economía', 'IA', 'Aprendizajes', 'Agradecimientos']);
    await expect(cmPage.locator('.rv-banner')).toContainText('Período en curso: se compara contra los mismos días del anterior');
    for (let i = 0; i < 8; i++) {
      await irA(cmPage, i);
      const visible = await cmPage.locator('.rv-page').nth(i).evaluate((p) => { const sc = p.parentElement, r = p.getBoundingClientRect(), s = sc.getBoundingClientRect(); return Math.abs(r.left - s.left) < 2; });
      expect(visible).toBe(true);
      expect(await sinScrollH(cmPage)).toBe(true);
    }
    // fichas: o valor + (comparación | aviso del anterior) o "—" + motivo
    const fichas = await cmPage.locator('.rv-ficha').evaluateAll((fs) => fs.map((f) => ({ t: f.querySelector('.rv-fl').textContent, nulo: !!f.querySelector('.rv-nulo'), motivo: !!f.querySelector('.rv-fm'), chip: !!f.querySelector('.rv-chip'), v: f.querySelector('.rv-fv').textContent })));
    expect(fichas.length).toBeGreaterThan(15);
    fichas.filter((f) => f.nulo).forEach((f) => { expect(f.v.trim(), f.t).toBe('—'); expect(f.motivo, f.t + ' sin motivo').toBe(true); });
    fichas.filter((f) => !f.nulo).forEach((f) => expect(f.v, f.t).not.toMatch(/NaN|undefined|null/));
    // ningún motivo muestra claves técnicas de mes
    expect(await cmPage.locator('#ov-reporte').innerText()).not.toMatch(/\b20\d\d-\d\d\b/);
    // Aprendizajes y Agradecimientos: placeholder
    await irA(cmPage, 6);
    await expect(cmPage.locator('.rv-page').nth(6)).toContainText('Se completa en la próxima versión');
    // chips con signo y número
    const chips = await cmPage.locator('.rv-chip').allInnerTexts();
    chips.forEach((c) => expect(c).toMatch(/^([+−] ?.*\d|= .*\d)/));
    await irA(cmPage, 1);
    await shot(cmPage, testInfo, 'mensual-vida');
    await irA(cmPage, 4);
    await cmPage.locator('.rv-page').nth(4).locator('.rv-fichas').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await shot(cmPage, testInfo, 'mensual-economia');
    await irA(cmPage, 0);
    await shot(cmPage, testInfo, 'mensual-foco');
    await irA(cmPage, 3);
    await cmPage.locator('.rv-page').nth(3).locator('.rv-fichas').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await shot(cmPage, testInfo, 'mensual-conocimiento');
    expect(consoleErrors).toEqual([]);
  });

  test('comparaciones: objetivos de Familia +1 en verde, hábitos con signo; tooltip de celda', async ({ cmPage }) => {
    await sembrar(cmPage);
    await abrirRev(cmPage);
    await elegir(cmPage, 'mensual', '2026-10');
    await expect(cmPage.locator('.rv-banner')).toHaveCount(0);
    await irA(cmPage, 1);
    const fam = cmPage.locator('.rv-page').nth(1).locator('.rv-row', { hasText: 'Familia' });
    await expect(fam.locator('.rv-rn')).toHaveText('2');
    await expect(fam.locator('.rv-chip')).toHaveText('+2');   // oct: 2 cumplidos, sep: 0
    await expect(fam.locator('.rv-chip')).toHaveClass(/rv-ok/);
    // la meta mensual suelta cuenta como "sin categoría"
    await expect(cmPage.locator('.rv-page').nth(1).locator('.rv-row', { hasText: 'Sin categoría' }).locator('.rv-rn')).toHaveText('1');
    // calendario de un mes por hábito + leyenda + tooltip
    await expect(cmPage.locator('.rv-page').nth(1).locator('.rv-hab').first().locator('.rv-mm')).toHaveCount(1);
    await expect(cmPage.locator('.rv-page').nth(1).locator('.rv-ley')).toContainText('Parcial');
    await cmPage.locator('.rv-page').nth(1).locator('.rv-c.rv-d[data-d]').first().hover();
    await expect(cmPage.locator('#rv-tip.on')).toContainText('Hecho');
    await expect(cmPage.locator('#rv-tip')).toContainText('2026');
    // objetivo cumplido sin fecha de la sección Salud va aparte y sin comparar
    await irA(cmPage, 2);
    await expect(cmPage.locator('.rv-page').nth(2).locator('.rv-aparte')).toContainText('Viejo sin fecha');
  });

  test('trimestral: 3 mini-meses por hábito; semestral: 6', async ({ cmPage }, testInfo) => {
    await sembrar(cmPage);
    await abrirRev(cmPage);
    await elegir(cmPage, 'trimestral', '2026-T3');
    await irA(cmPage, 1);
    await expect(cmPage.locator('.rv-page').nth(1).locator('.rv-hab').first().locator('.rv-mm')).toHaveCount(3);
    await shot(cmPage, testInfo, 'trimestral-vida');
    await cmPage.locator('#ov-reporte .cm-ov-close').click();
    await elegir(cmPage, 'semestral', '2026-S2');
    await irA(cmPage, 1);
    await expect(cmPage.locator('.rv-page').nth(1).locator('.rv-hab').first().locator('.rv-mm')).toHaveCount(6);
  });

  test('anual a 390px: fila de 12 mini-meses sin desbordar', async ({ cmPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'solo tiene sentido en 390px');
    await sembrar(cmPage);
    await abrirRev(cmPage);
    await cmPage.evaluate(() => { S.habitTrackers.finanzas = []; });   // Economía sin hábitos
    await elegir(cmPage, 'anual', '2026');
    await irA(cmPage, 1);
    const pg = cmPage.locator('.rv-page').nth(1);
    await expect(pg.locator('.rv-hab').first().locator('.rv-mm')).toHaveCount(12);
    expect(await pg.evaluate((p) => p.scrollWidth <= p.clientWidth + 1)).toBe(true);
    expect(await sinScrollH(cmPage)).toBe(true);
    const cel = await pg.locator('.rv-hab').first().locator('.rv-mm-c .rv-c').first().boundingBox();
    expect(cel.width).toBeGreaterThanOrEqual(8);   // celdas legibles y tocables, no de ~3px
    await pg.locator('.rv-hab').first().locator('.rv-mm-c .rv-c').first().tap();
    await expect(cmPage.locator('#rv-tip.on')).toContainText('—');
    await shot(cmPage, testInfo, 'anual-vida');
    await irA(cmPage, 4);   // Economía: sin hábitos -> sin leyenda de estados
    await expect(cmPage.locator('.rv-page').nth(4).locator('.rv-ley')).toHaveCount(0);
    await cmPage.locator('.rv-page').nth(4).locator('.rv-card').last().evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await shot(cmPage, testInfo, 'anual-economia');
  });

  test('semanal: 4 páginas (Foco, Hábitos, Gastos, Textos)', async ({ cmPage }, testInfo) => {
    await sembrar(cmPage);
    await abrirRev(cmPage);
    await elegir(cmPage, 'semanal', '2026-W45');
    expect(await nombresPaginas(cmPage)).toEqual(['Foco', 'Hábitos', 'Gastos', 'Textos de la semana']);
    await irA(cmPage, 1);
    await expect(cmPage.locator('.rv-page').nth(1).locator('.rv-sem').first().locator('.rv-c')).toHaveCount(7);
    await irA(cmPage, 2);
    await expect(cmPage.locator('.rv-page').nth(2)).toContainText('Gastos');
    await shot(cmPage, testInfo, 'semanal-gastos');
    await irA(cmPage, 3);
    await expect(cmPage.locator('.rv-page').nth(3)).toContainText('Se completa en la próxima versión');
  });

  test('cuentas líquidas: marcar una cambia el KPI de activos líquidos y se guarda en S.reportes.config', async ({ cmPage }) => {
    await sembrar(cmPage);
    await abrirRev(cmPage);
    // solo cuentas en pesos que no son efectivo/banco/préstamo
    await expect(cmPage.locator('#principios-root .pr-chk')).toHaveCount(1);
    await expect(cmPage.locator('#principios-root .pr-chk')).toContainText('Bonos');
    const leer = async () => {
      await elegir(cmPage, 'mensual', '2026-10');
      await irA(cmPage, 4);
      const t = await cmPage.locator('.rv-page').nth(4).locator('.rv-ficha', { hasText: 'Activos líquidos' }).locator('.rv-fv').innerText();
      await cmPage.locator('#ov-reporte .cm-ov-close').click();
      return t;
    };
    const antes = await leer();
    await cmPage.locator('#principios-root .pr-chk input').check();
    expect(await cmPage.evaluate(() => S.reportes.config.cuentasLiquidas)).toEqual(['acc-bonos']);
    const despues = await leer();
    expect(despues).not.toBe(antes);
    await cmPage.locator('#principios-root .pr-chk input').uncheck();
    expect(await cmPage.evaluate(() => S.reportes.config.cuentasLiquidas)).toEqual([]);
  });

  test('revisión: hábito con parcial compara con un decimal, en curso no compara metas, empate "= 0", exámenes sin tono, aria en celdas, top 5 de gastos', async ({ cmPage }) => {
    await sembrar(cmPage);
    await cmPage.evaluate(() => {
      S.habitTrackers.vida.push({ id: 'h-t1', name: 'Test decimal', emoji: '•', days: { '2026-11-01': 'done', '2026-11-02': 'done', '2026-11-03': 'done', '2026-11-04': 'partial', '2026-10-01': 'done', '2026-10-02': 'done' } });
      S.monthlyGoals.vida['2026-11'] = [{ id: 'm9', text: 'Meta de noviembre', done: true }];
    });
    await abrirRev(cmPage);
    await elegir(cmPage, 'mensual', '2026-11');
    await expect(cmPage.locator('.rv-dot').nth(0)).toHaveAttribute('aria-current', 'true');
    await irA(cmPage, 1);
    const pv = cmPage.locator('.rv-page').nth(1);
    const hab = pv.locator('.rv-hab', { hasText: 'Test decimal' });
    await expect(hab.locator('.rv-hp b')).toHaveText('3,5');
    await expect(hab.locator('.rv-chip')).toHaveText(/^\+1,5/);
    // mes en curso con metas mensuales: no se compara
    const sin = pv.locator('.rv-row', { hasText: 'Sin categoría' });
    await expect(sin).toContainText('En curso: sin comparar');
    await expect(sin.locator('.rv-chip')).toHaveCount(0);
    // empate = diferencia 0
    expect(await cmPage.evaluate(() => [_rvChip({ abs: 0, pct: 0, tono: 'azul' }, 30, _rvPts, false), _rvChip({ abs: 0, pct: 0, tono: 'azul' }, 900, _rvMoney, true)].map((h) => h.replace(/<[^>]+>/g, '')))).toEqual(['= 0 pts', '= $ 0']);
    // aria-label en celdas
    const aria = await pv.locator('.rv-c[data-d="2026-11-01"]').first().evaluate((e) => [e.getAttribute('role'), e.getAttribute('aria-label')]);
    expect(aria[0]).toBe('img'); expect(aria[1]).toMatch(/^dom 1 nov 2026 — /);
    // exámenes sin chip de tono
    await irA(cmPage, 3);
    await expect(cmPage.locator('.rv-page').nth(3).locator('.rv-ficha', { hasText: 'Exámenes del período' }).locator('.rv-chip')).toHaveCount(0);
    // Foco: top 5 de gastos
    await irA(cmPage, 0);
    const card = cmPage.locator('.rv-page').nth(0).locator('.rv-card', { hasText: 'Dónde fue el dinero' });
    await expect(card).toBeVisible();
    const n = await card.locator('.rv-row').count();
    expect(n).toBeGreaterThan(0); expect(n).toBeLessThanOrEqual(5);
  });
});
