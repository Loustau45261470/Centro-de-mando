// Overlay "Plan de materias" (antes "Finales"): dos pestañas — Plan de materias (la tabla de abogacia.js con todo lo suyo
// + ✓ para rendir) e Historial (finales rendidos). La card del plan ya no está en Conocimiento; la card de próximos
// finales suma "Ir a Finales / Plan de materias" y una casilla para marcar el final como hecho.
// Materias y fechas de ejemplo (relativas a hoy para que nunca se venzan).
'use strict';
const { test, expect } = require('./support/fixtures');

const TAB_KEY = 'cdm_plan_materias_tab';

async function armar(page, { suelto = false } = {}) {
  await page.evaluate(({ suelto }) => {
    S.lawProgress = { years: [
      { id: 'y1', label: 'Primer Año', subjects: [
        { id: 'a1', name: 'Alfa', done: true, grade: 7 },
        { id: 'a2', name: 'Beta', done: false },
        { id: 'a3', name: 'Gamma', done: false },
      ] },
    ] };
    S.carrera = { regular: {}, pick: {} };
    const mas = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
    window.__mas = mas;
    S.lawPlan = [
      { id: 'r1', subject: 'Beta', target: _lawTargetDeISO(mas(20)), comision: 'B', tipo: 'Final Oral' },
      { id: 'r2', subject: 'Gamma', target: 'Online 2027' },
    ];
    S.sgc = S.sgc || {};
    S.sgc.finales = [
      { id: 'fh', materia: 'Alfa', subjectId: 'a1', fecha: '2020-01-01', tipo: 'Final Escrito', done: true, doneEl: '2020-01-01' },
    ];
    if (suelto) S.sgc.finales.push({ id: 'fs', materia: 'Materia suelta', subjectId: null, fecha: mas(12), tipo: 'Final MC', done: false, doneEl: null });
    S.dayPlan = {};
    S.pomodoroHistory = [];
    saveState();
    renderLawPlan();   // crea el final de la fila r1 (como al iniciar la app)
    Finales.renderPrincipal();
  }, { suelto });
  await page.evaluate((k) => { try { localStorage.removeItem(k); } catch (e) {} }, TAB_KEY);
}

const abrir = (page, tab) => page.evaluate((t) => Finales.open(t), tab);
const tab = (page, t) => page.locator(`#fin-tab-${t}`);
const pane = (page, t) => page.locator(`#fin-pane-${t}`);
const tabla = (page) => page.locator('#law-plan-wrap');
const finalDe = (page, id) => page.evaluate((i) => S.sgc.finales.find((f) => f.id === i) || null, id);

test('el overlay se llama Plan de materias, con pestañas Plan de materias e Historial (arranca en Plan)', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await abrir(cmPage);
  await expect(cmPage.locator('#ov-finales .cm-ov-title')).toHaveText('Plan de materias');
  await expect(cmPage.locator('#ov-finales .cm-ov-eyebrow')).toHaveText('CONOCIMIENTO · PLAN DE MATERIAS');
  await expect(cmPage.locator('#ov-finales .plov-tab')).toHaveText(['Plan de materias', 'Historial']);
  await expect(tab(cmPage, 'plan')).toHaveAttribute('aria-selected', 'true');
  await expect(pane(cmPage, 'plan')).toBeVisible();
  await expect(pane(cmPage, 'historial')).toBeHidden();
  // Desaparecen el formulario "+ Agregar" y la lista de activos.
  await expect(cmPage.locator('#ov-finales-form')).toHaveCount(0);
  await expect(cmPage.locator('#ov-finales')).not.toContainText('+ Agregar');
  await expect(cmPage.locator('#ov-finales')).not.toContainText('Activos');
  expect(consoleErrors).toEqual([]);
});

test('la pestaña activa se recuerda; el botón de la pantalla principal fuerza el Plan', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await abrir(cmPage);
  await tab(cmPage, 'historial').click();
  await expect(pane(cmPage, 'historial')).toBeVisible();
  await expect(pane(cmPage, 'plan')).toBeHidden();
  await expect(tab(cmPage, 'historial')).toHaveAttribute('aria-selected', 'true');
  expect(await cmPage.evaluate((k) => localStorage.getItem(k), TAB_KEY)).toBe('historial');

  // Cerrar y volver a abrir sin pedir pestaña: queda en Historial.
  await cmPage.evaluate(() => CMOverlay.close(document.getElementById('ov-finales')));
  await abrir(cmPage);
  await expect(pane(cmPage, 'historial')).toBeVisible();
  // Pidiendo el Plan, lo muestra y lo recuerda.
  await abrir(cmPage, 'plan');
  await expect(pane(cmPage, 'plan')).toBeVisible();
  await expect(tab(cmPage, 'plan')).toHaveAttribute('aria-selected', 'true');
  expect(await cmPage.evaluate((k) => localStorage.getItem(k), TAB_KEY)).toBe('plan');
  expect(consoleErrors).toEqual([]);
});

test('Plan: la tabla del plan con sus funciones (+ Materia, chips, orden por fecha, editar, borrar) dentro del overlay', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await abrir(cmPage, 'plan');
  const t = tabla(cmPage);
  await expect(t.locator('tbody tr')).toHaveCount(2);
  const beta = t.locator('tr', { hasText: 'Beta' });
  await expect(beta).toContainText('Com. B');
  await expect(beta).toContainText('Final Oral');
  // Una sola tabla: el id solo existe dentro del overlay, nunca en la pantalla Conocimiento.
  await expect(cmPage.locator('#law-plan-wrap')).toHaveCount(1);
  expect(await cmPage.evaluate(() => !!document.querySelector('#ov-finales #law-plan-wrap'))).toBe(true);

  // Orden por fecha: ciclo ↕ → ▲ → ▼.
  const ind = t.locator('.law-sort-ind');
  await expect(ind).toHaveText('↕');
  await t.locator('th.law-sort').click();
  await expect(ind).toHaveText('▲');
  await expect(t.locator('tbody tr').first()).toContainText('Beta');   // con fecha primero
  await t.locator('th.law-sort').click();
  await expect(ind).toHaveText('▼');
  await expect(t.locator('tbody tr').first()).toContainText('Gamma');

  // + Materia: crea una fila nueva.
  await t.getByRole('button', { name: '+ Materia' }).click();
  await expect(cmPage.locator('#modal-law-plan')).toHaveClass(/open/);
  await cmPage.fill('#lawPlanSubject', 'Delta');
  await cmPage.fill('#lawPlanTarget', 'Junio 2099');
  await cmPage.selectOption('#lawPlanComision', 'A');
  await cmPage.click('#modal-law-plan .btn-primary');
  await expect(t.locator('tr', { hasText: 'Delta' })).toContainText('Com. A');

  // Editar y borrar.
  await t.locator('tr', { hasText: 'Delta' }).locator('.icon-btn').nth(0).click();
  await expect(cmPage.locator('#modal-law-plan')).toHaveClass(/open/);
  await expect(cmPage.locator('#lawPlanSubject')).toHaveValue('Delta');
  await cmPage.fill('#lawPlanSubject', 'Delta II');
  await cmPage.click('#modal-law-plan .btn-primary');
  await expect(t.locator('tr', { hasText: 'Delta II' })).toHaveCount(1);
  await t.locator('tr', { hasText: 'Delta II' }).locator('.icon-btn').nth(1).click();
  await expect(t.locator('tr', { hasText: 'Delta II' })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('✓ en la fila con final activo: pide la nota, el final va al Historial y la fila queda "Rendida"', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await abrir(cmPage, 'plan');
  const t = tabla(cmPage);
  const beta = t.locator('tr', { hasText: 'Beta' });
  await expect(t.locator('.law-rendida')).toHaveCount(1);              // solo la fila con final activo (Gamma no tiene)
  await expect(t.locator('tr', { hasText: 'Gamma' }).locator('.law-rendida')).toHaveCount(0);
  await beta.locator('.law-rendida').click();
  await expect(cmPage.locator('#modal-final-nota')).toHaveClass(/open/);
  await cmPage.fill('#fin-nota', '8');
  await cmPage.click('#modal-final-nota .btn-primary');

  await expect(cmPage.locator('#modal-final-nota')).not.toHaveClass(/open/);
  await expect(beta).toContainText('✅ Rendida');
  await expect(beta).toContainText('8');
  await expect(beta.locator('.law-rendida')).toHaveCount(0);
  expect(await cmPage.evaluate(() => S.sgc.finales.find((f) => f.lawPlanId === 'r1').done)).toBe(true);
  expect(await cmPage.evaluate(() => S.lawProgress.years[0].subjects.find((s) => s.id === 'a2'))).toMatchObject({ done: true, grade: 8 });

  // Aparece en el Historial.
  await tab(cmPage, 'historial').click();
  await expect(pane(cmPage, 'historial')).toContainText('Beta');
  await expect(pane(cmPage, 'historial')).toContainText('Historial (2)');
  expect(consoleErrors).toEqual([]);
});

test('Historial: editar, reactivar y borrar siguen funcionando', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await abrir(cmPage, 'historial');
  const h = pane(cmPage, 'historial');
  await expect(h).toContainText('Alfa');
  await h.locator('button[title="Editar fecha / reactivar"]').click();
  await expect(cmPage.locator('#fin-e-fecha')).toBeVisible();
  await cmPage.click('#ov-finales-list >> text=Cancelar');
  await h.locator('button[title="Reactivar"]').click();
  expect((await finalDe(cmPage, 'fh')).done).toBe(false);
  await expect(h).not.toContainText('Alfa');
  await expect(h).toContainText('Historial (0)');
  expect(consoleErrors).toEqual([]);
});

test('pantalla Conocimiento: la card del plan ya no está; botón "Ir a Finales / Plan de materias" y casilla para marcar hecho', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage);
  await cmPage.click('.nav-btn[data-tab="conocimiento"]');
  await expect(cmPage.locator('#tab-conocimiento')).toHaveClass(/active/);
  await expect(cmPage.locator('#tab-conocimiento #law-plan-wrap')).toHaveCount(0);
  // renderLawPlan sin el contenedor en el DOM (overlay todavía no abierto) no rompe.
  await cmPage.evaluate(() => { renderLawPlan(); renderLawPlan(true); });

  const card = cmPage.locator('#finales-wrap-conocimiento');
  await expect(card.locator('.fin-item')).toHaveCount(1);
  // Botón: abre el overlay en el Plan aunque la última pestaña usada fuera el Historial.
  await cmPage.evaluate((k) => localStorage.setItem(k, 'historial'), TAB_KEY);
  await card.locator('#fin-ir-plan').click();
  await expect(cmPage.locator('#ov-finales')).toHaveClass(/show/);
  await expect(pane(cmPage, 'plan')).toBeVisible();
  await expect(tabla(cmPage)).toContainText('Beta');
  await cmPage.evaluate(() => CMOverlay.close(document.getElementById('ov-finales')));

  // Casilla: abre el modal de nota; al guardar, el final pasa al historial y se refleja en el overlay.
  await card.locator('.fin-item .fin-check').click();
  await expect(cmPage.locator('#modal-final-nota')).toHaveClass(/open/);
  await cmPage.fill('#fin-nota', '9');
  await cmPage.click('#modal-final-nota .btn-primary');
  await expect(card.locator('.fin-item')).toHaveCount(0);
  await abrir(cmPage, 'historial');
  await expect(pane(cmPage, 'historial')).toContainText('Beta');
  await abrir(cmPage, 'plan');
  await expect(tabla(cmPage).locator('tr', { hasText: 'Beta' })).toContainText('✅ Rendida');
  expect(consoleErrors).toEqual([]);
});

test('un final suelto (sin fila en el plan) sigue accesible: aparece en la tabla con ✓, editar y borrar', async ({ cmPage, consoleErrors }) => {
  await armar(cmPage, { suelto: true });
  await abrir(cmPage, 'plan');
  const t = tabla(cmPage);
  const suelta = t.locator('tr.law-suelto', { hasText: 'Materia suelta' });
  await expect(suelta).toHaveCount(1);
  await expect(suelta).toContainText('Final MC');
  expect(await cmPage.evaluate(() => S.lawPlan.length)).toBe(2);   // abrir no le crea fila

  // Editar: se le crea su fila en el plan y se abre el modal de esa fila.
  await suelta.locator('.icon-btn').nth(1).click();
  await expect(cmPage.locator('#modal-law-plan')).toHaveClass(/open/);
  await expect(cmPage.locator('#lawPlanSubject')).toHaveValue('Materia suelta');
  await expect(cmPage.locator('#lawPlanTipo')).toHaveValue('Final MC');
  await cmPage.fill('#lawPlanTarget', await cmPage.evaluate(() => _lawTargetDeISO(__mas(30))));
  await cmPage.click('#modal-law-plan .btn-primary');
  expect(await cmPage.evaluate(() => S.lawPlan.length)).toBe(3);
  expect((await finalDe(cmPage, 'fs')).fecha).toBe(await cmPage.evaluate(() => __mas(30)));
  await expect(t.locator('tr.law-suelto')).toHaveCount(0);          // ya es una fila normal
  await expect(t.locator('tr', { hasText: 'Materia suelta' })).toHaveCount(1);

  // ✓ y borrar sobre otro suelto.
  await cmPage.evaluate(() => { S.sgc.finales.push({ id: 'fs2', materia: 'Otra suelta', subjectId: null, fecha: __mas(5), tipo: 'Final Escrito', done: false, doneEl: null }); saveState(); Finales.open('plan'); });
  await t.locator('tr.law-suelto', { hasText: 'Otra suelta' }).locator('.law-rendida').click();   // materia fuera de la carrera: va directo al historial
  await expect(t.locator('tr.law-suelto')).toHaveCount(0);
  expect((await finalDe(cmPage, 'fs2')).done).toBe(true);
  await cmPage.evaluate(() => { S.sgc.finales.push({ id: 'fs3', materia: 'Tercera suelta', subjectId: null, fecha: __mas(6), tipo: 'Final Escrito', done: false, doneEl: null }); saveState(); Finales.open('plan'); });
  await t.locator('tr.law-suelto', { hasText: 'Tercera suelta' }).locator('.icon-btn').nth(2).click();
  expect(await finalDe(cmPage, 'fs3')).toBeNull();
  expect(consoleErrors).toEqual([]);
});

test.describe('mobile 360', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('el Plan de materias y el Historial no generan scroll horizontal en la página', async ({ cmPage, consoleErrors }) => {
    await armar(cmPage, { suelto: true });
    await cmPage.evaluate(() => {
      // Una fila con nombre largo y todos los chips, para forzar el ancho.
      S.lawPlan.push({ id: 'r9', subject: 'Una materia con un nombre bastante largo para probar el ajuste de línea', target: _lawTargetDeISO(__mas(40)), comision: 'Unificada', tipo: 'Final Mixto' });
      saveState(); renderLawPlan(true);
    });
    await cmPage.click('.nav-btn[data-tab="conocimiento"]');
    const medir = () => cmPage.evaluate(() => {
      const body = document.querySelector('#ov-finales .cm-ov-body');
      return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, ov: body.scrollWidth - body.clientWidth, doc: document.body.scrollWidth - document.documentElement.clientWidth };
    });
    expect(await cmPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await abrir(cmPage, 'plan');
    await expect(tabla(cmPage)).toBeVisible();
    let m = await medir();
    expect(m.page).toBeLessThanOrEqual(1);
    expect(m.doc).toBeLessThanOrEqual(1);
    expect(m.ov).toBeLessThanOrEqual(1);
    // La tabla entra en su contenedor (o scrollea dentro de él).
    const caja = await cmPage.locator('#law-plan-wrap').boundingBox();
    expect(caja.x + caja.width).toBeLessThanOrEqual(360 + 1);
    await tab(cmPage, 'historial').click();
    m = await medir();
    expect(m.page).toBeLessThanOrEqual(1);
    expect(m.ov).toBeLessThanOrEqual(1);
    expect(consoleErrors).toEqual([]);
  });
});
