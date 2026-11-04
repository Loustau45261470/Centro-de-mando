// A9 — Plan de estudio de un final: horas por semana + días → bloques en el planner (S.dayPlan, marcados con
// studyPlan) hasta el día antes del final; progreso con las horas del Pomodoro; "Reacomodar" tras días perdidos;
// editar / borrar el plan; rendir el final borra los bloques futuros.
'use strict';
const { test, expect } = require('./support/fixtures');

// Final a 30 días de la materia s2_4 + una actividad ajena en el planner (no se debe tocar nunca).
async function armar(page, extraFinal) {
  await page.evaluate((extra) => {
    S.lawProgress = { years: [
      { id: 'y2', label: 'Segundo Año', subjects: [
        { id: 's2_4', name: 'Constitución, derechos humanos y garantías', done: false },
      ] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    const mas = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
    S.sgc = S.sgc || {};
    S.sgc.finales = [Object.assign({ id: 'f1', materia: 'Constitución, derechos humanos y garantías', subjectId: 's2_4', fecha: mas(30), tipo: 'Final Escrito', done: false, doneEl: null }, extra || {})];
    S.pomodoroHistory = [];
    S.dayPlan = {};
    getDayPlan(mas(1)).tasks.push({ id: 'otra1', text: 'Actividad ajena', area: 'vida', priority: 2, time: '10:00', duration: 30, done: false });
    saveState();
    Finales.renderPrincipal();
  }, extraFinal);
}

// Utilidades en la página: fecha relativa a hoy y bloques del plan.
const EN_PAGE = `
  window.__mas = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
  window.__bloques = () => Finales.bloquesDe(S.sgc.finales[0]).map((b) => ({ date: b.date, dur: b.duration, time: b.task.time, text: b.task.text, area: b.task.area }));
  window.__dow = (iso) => new Date(iso + 'T12:00:00').getDay();
`;
async function util(page) { await page.evaluate(EN_PAGE); }

const bloques = (page) => page.evaluate(() => window.__bloques());
const hoy = (page) => page.evaluate(() => getActiveDate());
const mas = (page, n) => page.evaluate((k) => window.__mas(k), n);
const card = (page) => page.locator('#finales-wrap-conocimiento');

// Plan sembrado a mano (sin depender de la hora del día): creado hace `atras` días.
async function sembrarPlan(page, { atras = 5, horasSemana = 6, dias = [2, 4, 6], totalHoras = 25.5, hora = '18:00' } = {}) {
  await page.evaluate(({ atras, horasSemana, dias, totalHoras, hora }) => {
    S.sgc.finales[0].plan = { horasSemana, dias, hora, creado: window.__mas(-atras), totalHoras };
    saveState();
  }, { atras, horasSemana, dias, totalHoras, hora });
}
// Bloques pasados de `dur` minutos en los días indicados (relativos a hoy, negativos).
async function sembrarPasados(page, offsets, dur) {
  await page.evaluate(({ offsets, dur }) => {
    offsets.forEach((n) => getDayPlan(window.__mas(n)).tasks.push({ id: 'p' + n, text: 'Estudiar X', area: 'conocimiento', priority: 2, time: '18:00', duration: dur, done: false, studyPlan: 'f1' }));
    saveState();
  }, { offsets, dur });
}
async function estudiar(page, offset, minutos) {
  await page.evaluate(({ offset, minutos }) => {
    S.pomodoroHistory.push({ date: window.__mas(offset), minutes: minutos, subjectId: 's2_4', materia: 'x', full: true });
    saveState(); Finales.renderPrincipal();
  }, { offset, minutos });
}

test('armar el plan: guarda f.plan y crea un bloque por día elegido hasta el día antes del final', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await util(cmPage);
  await expect(card(cmPage)).toContainText('Armar plan de estudio');

  await card(cmPage).locator('button:has-text("Armar plan de estudio")').evaluate((b) => b.click());
  await expect(cmPage.locator('#modal-plan-estudio')).toHaveClass(/open/);
  await expect(cmPage.locator('#plan-hora')).toHaveValue('18:00');
  await cmPage.fill('#plan-horas', '6');
  for (const v of ['1', '3', '5']) await cmPage.locator(`#modal-plan-estudio .fin-plan-dias input[value="${v}"]`).uncheck();
  await cmPage.locator('#modal-plan-estudio .fin-plan-dias input[value="6"]').check(); // quedan M, J, S
  await cmPage.click('#modal-plan-estudio .btn-primary');
  await expect(cmPage.locator('#modal-plan-estudio')).not.toHaveClass(/open/);

  const h = await hoy(cmPage);
  const f = await cmPage.evaluate(() => S.sgc.finales[0]);
  expect(f.plan).toMatchObject({ horasSemana: 6, dias: [2, 4, 6], hora: '18:00', creado: h, totalHoras: 25.5 }); // 6 h × 30/7 = 25,7 → 25,5

  // Fechas esperadas: M/J/S entre hoy y el día antes del final (hoy solo si las 18:00 todavía no pasaron).
  const esperadas = await cmPage.evaluate(() => {
    const out = [], n = new Date(), ahora = n.getHours() * 60 + n.getMinutes();
    for (let i = 0; i <= 29; i++) {
      const d = window.__mas(i);
      if (![2, 4, 6].includes(window.__dow(d))) continue;
      if (i === 0 && 18 * 60 <= ahora) continue;
      out.push(d);
    }
    return out;
  });
  const b = await bloques(cmPage);
  expect(b.map((x) => x.date)).toEqual(esperadas);
  expect(b.length).toBeGreaterThan(8);
  b.forEach((x) => expect(x).toMatchObject({ dur: 120, time: '18:00', text: 'Estudiar Constitución, derechos humanos y garantías', area: 'conocimiento' }));
  expect(b[b.length - 1].date <= (await mas(cmPage, 29))).toBe(true); // nada el día del final ni después

  // La actividad ajena sigue ahí, y el planner del día muestra el bloque marcado.
  expect(await cmPage.evaluate(() => getDayPlan(window.__mas(1)).tasks.some((t) => t.id === 'otra1'))).toBe(true);
  await expect(card(cmPage)).toContainText('Vas al día · 0 de 25,5 h');
  expect(consoleErrors).toEqual([]);
});

test('validaciones: sin horas o sin días no crea nada', async ({ cmPage }) => {
  await armar(cmPage);
  await util(cmPage);
  await cmPage.evaluate(() => Finales.planAbrir('f1'));
  await cmPage.click('#modal-plan-estudio .btn-primary'); // horas vacías
  expect(await cmPage.evaluate(() => S.sgc.finales[0].plan)).toBeUndefined();
  await cmPage.fill('#plan-horas', '4');
  for (const v of ['1', '2', '3', '4', '5']) await cmPage.locator(`#modal-plan-estudio .fin-plan-dias input[value="${v}"]`).uncheck();
  await cmPage.click('#modal-plan-estudio .btn-primary'); // sin días
  expect(await cmPage.evaluate(() => S.sgc.finales[0].plan)).toBeUndefined();
  expect(await bloques(cmPage)).toEqual([]);
});

test('progreso: sin estudiar atrasa; estudiando alcanza y vuelve a "al día"', async ({ cmPage }) => {
  await armar(cmPage);
  await util(cmPage);
  await sembrarPlan(cmPage);
  await sembrarPasados(cmPage, [-4, -2], 120); // tocaba llevar 4 h
  await estudiar(cmPage, -3, 60);               // llevó 1 h
  await expect(card(cmPage)).toContainText('Vas 3 h atrasado');
  await expect(card(cmPage).locator('button:has-text("Reacomodar")')).toHaveCount(1);

  await estudiar(cmPage, -1, 150);              // +2,5 h = 3,5 h → atraso 0,5: todavía al día
  await expect(card(cmPage)).toContainText('Vas al día · 3,5 de 25,5 h');
  await expect(card(cmPage).locator('button:has-text("Reacomodar")')).toHaveCount(0);
});

test('final sin materia del plan: avisa cómo registrar el estudio', async ({ cmPage }) => {
  await armar(cmPage, { id: 'f1', materia: 'Materia libre', subjectId: null });
  await util(cmPage);
  await sembrarPlan(cmPage);
  await cmPage.evaluate(() => Finales.renderPrincipal());
  await expect(card(cmPage)).toContainText('Registrá el estudio con el Pomodoro eligiendo la materia');
});

test('reacomodar tras días perdidos: reparte lo que falta en los días que quedan, sin tocar pasado ni otras actividades', async ({ cmPage }) => {
  await armar(cmPage);
  await util(cmPage);
  await sembrarPlan(cmPage);
  await sembrarPasados(cmPage, [-4, -2], 120);
  await estudiar(cmPage, -3, 60); // 1 h estudiada de 25,5
  // Un bloque viejo futuro del plan que debe desaparecer.
  await cmPage.evaluate(() => getDayPlan(window.__mas(10)).tasks.push({ id: 'viejo', text: 'Estudiar X', area: 'conocimiento', priority: 2, time: '18:00', duration: 45, done: false, studyPlan: 'f1' }));

  await card(cmPage).locator('button:has-text("Reacomodar")').evaluate((b) => b.click());

  const h = await hoy(cmPage);
  const b = await bloques(cmPage);
  const futuros = b.filter((x) => x.date >= h);
  const pasados = b.filter((x) => x.date < h);
  expect(pasados.map((x) => x.date)).toEqual([await mas(cmPage, -4), await mas(cmPage, -2)]); // intactos
  expect(futuros.reduce((a, x) => a + x.dur, 0)).toBe(24.5 * 60); // 25,5 − 1 h estudiada
  expect(futuros.length).toBeGreaterThan(8);
  for (const x of futuros) {
    expect([2, 4, 6]).toContain(await cmPage.evaluate((d) => window.__dow(d), x.date));
    expect(x.dur).toBeLessThanOrEqual(360);
    expect(x.date <= await mas(cmPage, 29)).toBe(true);
  }
  expect(futuros.some((x) => x.dur === 45)).toBe(false); // el bloque viejo se rehízo
  expect(await cmPage.evaluate(() => getDayPlan(window.__mas(1)).tasks.some((t) => t.id === 'otra1'))).toBe(true);
  await expect(card(cmPage)).toContainText('Vas al día');
  await expect(card(cmPage)).not.toContainText('No te alcanza');
  expect(await cmPage.evaluate(() => S.sgc.finales[0].plan.faltan)).toBe(0);
});

test('reacomodar tras muchos días sin estudiar (plan que arrancó hace 20 días)', async ({ cmPage }) => {
  await armar(cmPage);
  await util(cmPage);
  await cmPage.evaluate(() => { S.sgc.finales[0].fecha = window.__mas(14); saveState(); });
  await sembrarPlan(cmPage, { atras: 20, horasSemana: 6, dias: [0, 1, 2, 3, 4, 5, 6], totalHoras: 30 });
  await sembrarPasados(cmPage, [-18, -15, -12, -9, -6, -3], 120);
  await cmPage.evaluate(() => Finales.reacomodar('f1')); // nada estudiado: faltan las 30 h, en ≤ 14 días
  const h = await hoy(cmPage);
  const futuros = (await bloques(cmPage)).filter((x) => x.date >= h);
  expect(futuros.reduce((a, x) => a + x.dur, 0)).toBe(30 * 60);
  expect(Math.max(...futuros.map((x) => x.dur))).toBeLessThanOrEqual(360);
  expect(futuros[futuros.length - 1].date <= await mas(cmPage, 13)).toBe(true);
  await expect(card(cmPage)).not.toContainText('No te alcanza');
  await expect(card(cmPage)).toContainText('Vas al día');
});

test('reacomodar cuando no alcanza: tope de 6 h por día y aviso visible con lo que falta', async ({ cmPage }) => {
  await armar(cmPage);
  await util(cmPage);
  await cmPage.evaluate(() => { S.sgc.finales[0].fecha = window.__mas(3); saveState(); }); // quedan hoy, mañana y pasado
  await sembrarPlan(cmPage, { atras: 1, horasSemana: 40, dias: [0, 1, 2, 3, 4, 5, 6], totalHoras: 40 });
  await cmPage.evaluate(() => Finales.reacomodar('f1'));
  const h = await hoy(cmPage);
  const futuros = (await bloques(cmPage)).filter((x) => x.date >= h);
  expect(futuros.length).toBeGreaterThanOrEqual(2);
  futuros.forEach((x) => expect(x.dur).toBe(360));
  const faltan = 40 - futuros.length * 6;
  expect(await cmPage.evaluate(() => S.sgc.finales[0].plan.faltan)).toBe(faltan);
  await expect(card(cmPage)).toContainText(`No te alcanza el tiempo: faltan ${faltan} h. Sumá días u horas por semana`);
  // El aviso persiste al volver a pintar la tarjeta.
  await cmPage.evaluate(() => Finales.renderPrincipal());
  await expect(card(cmPage)).toContainText('No te alcanza el tiempo');
});

test('editar el plan: modal precargado y rehace solo los bloques futuros', async ({ cmPage }) => {
  await armar(cmPage);
  await util(cmPage);
  await cmPage.evaluate(() => Finales.planAbrir('f1'));
  await cmPage.fill('#plan-horas', '6');
  await cmPage.click('#modal-plan-estudio .btn-primary');
  await sembrarPasados(cmPage, [-2], 90);
  expect((await bloques(cmPage)).length).toBeGreaterThan(8);

  await cmPage.evaluate(() => Finales.planAbrir('f1'));
  await expect(cmPage.locator('#plan-horas')).toHaveValue('6');
  await expect(cmPage.locator('#modal-plan-estudio .fin-plan-dias input:checked')).toHaveCount(5); // L a V
  await cmPage.fill('#plan-horas', '3');
  for (const v of ['2', '3', '4', '5']) await cmPage.locator(`#modal-plan-estudio .fin-plan-dias input[value="${v}"]`).uncheck(); // queda solo L
  await cmPage.fill('#plan-hora', '20:00');
  await cmPage.click('#modal-plan-estudio .btn-primary');

  const h = await hoy(cmPage);
  const b = await bloques(cmPage);
  expect(b.filter((x) => x.date < h).map((x) => x.dur)).toEqual([90]); // el pasado queda
  const futuros = b.filter((x) => x.date >= h);
  expect(futuros.length).toBeGreaterThanOrEqual(3);
  for (const x of futuros) {
    expect(await cmPage.evaluate((d) => window.__dow(d), x.date)).toBe(1);
    expect(x).toMatchObject({ dur: 180, time: '20:00' });
  }
  expect(await cmPage.evaluate(() => S.sgc.finales[0].plan)).toMatchObject({ horasSemana: 3, dias: [1], hora: '20:00', creado: h });
});

test('borrar el plan: saca f.plan y los bloques futuros, deja los pasados y las otras actividades', async ({ cmPage }) => {
  await armar(cmPage);
  await util(cmPage);
  await cmPage.evaluate(() => Finales.planAbrir('f1'));
  await cmPage.fill('#plan-horas', '6');
  await cmPage.click('#modal-plan-estudio .btn-primary');
  await sembrarPasados(cmPage, [-2], 90);

  await cmPage.evaluate(() => Finales.planAbrir('f1'));
  await cmPage.click('#modal-plan-estudio >> text=Borrar plan');
  const h = await hoy(cmPage);
  expect(await cmPage.evaluate(() => S.sgc.finales[0].plan)).toBeUndefined();
  const b = await bloques(cmPage);
  expect(b.map((x) => x.date)).toEqual([await mas(cmPage, -2)]);
  expect(b.every((x) => x.date < h)).toBe(true);
  expect(await cmPage.evaluate(() => getDayPlan(window.__mas(1)).tasks.some((t) => t.id === 'otra1'))).toBe(true);
  await expect(card(cmPage)).toContainText('Armar plan de estudio');
});

test('marcar el final como rendido borra los bloques futuros (y los pasados quedan)', async ({ cmPage }) => {
  await armar(cmPage);
  await util(cmPage);
  await cmPage.evaluate(() => Finales.planAbrir('f1'));
  await cmPage.fill('#plan-horas', '6');
  await cmPage.click('#modal-plan-estudio .btn-primary');
  await sembrarPasados(cmPage, [-2], 90);
  expect((await bloques(cmPage)).length).toBeGreaterThan(8);

  await cmPage.evaluate(() => Finales.done('f1'));
  await cmPage.click('#modal-final-nota .btn-ghost >> text=Sin cargar nota');
  const b = await bloques(cmPage);
  expect(b.map((x) => x.date)).toEqual([await mas(cmPage, -2)]);
  expect(await cmPage.evaluate(() => S.sgc.finales[0].done)).toBe(true);
  expect(await cmPage.evaluate(() => getDayPlan(window.__mas(1)).tasks.some((t) => t.id === 'otra1'))).toBe(true);
});
