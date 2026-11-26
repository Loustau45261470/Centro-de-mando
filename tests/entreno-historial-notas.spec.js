// Entrenamiento · Historial, notas rápidas y registro por ejercicio: nota rápida en la sesión (ligada al ejercicio abierto, varias,
// editables y borrables, sobrevive a una recarga real), medidas por ejercicio (intensidad / concentración / sensación) con oferta al
// terminar el ejercicio, propósito previo (desde el plan o dentro de la sesión) con pregunta de "se cumplió" al finalizar, y la pestaña
// Historial (lista, filtros por rutina y ejercicio, búsqueda en notas, detalle, entradas viejas sin campos nuevos, historial por ejercicio).
// Datos inventados. Capturas si ENTRENO_CAPTURAS apunta a una carpeta.
'use strict';
const { test, expect, waitForBoot, completeLoginOverlay } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const CAPT = process.env.ENTRENO_CAPTURAS || '';
const shot = async (page, nombre) => { if (!CAPT) return; fs.mkdirSync(CAPT, { recursive: true }); await page.screenshot({ path: path.join(CAPT, nombre + '.png') }); };
const sinScrollH = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function preparar(page) {
  await page.evaluate(() => {
    initRoutines();
    const r = S.routines[0]; r.name = 'Empuje'; r.icon = '💪'; r.exercises = r.exercises.slice(0, 3);
    S.routines = [r]; S.routineLog = {}; S.exerciseHistory = {}; S.activeRtnSession = null; S.actividadesHechas = {}; S.entrenoPropositos = {};
    S.planEntreno = PlanEntreno.cambiarPermanente(PlanEntreno.vacio(), { op: 'agregar', dia: PlanEntreno.diaDeSemana(getActiveDate()), item: { tipo: 'rutina', id: r.id } });
    window._schedulePushAlarm = async () => {};
    window._cancelPushAlarm = async () => {};
    saveState();
    if (window.openGymOverlay) openGymOverlay();
    renderRutinas();
  });
  await page.waitForSelector('#rutinas-wrap .pe-root');
}
async function empezar(page) {
  await page.locator('#rutinas-wrap .pe-day-hoy').getByRole('button', { name: 'EMPEZAR' }).click();
  await expect(page.locator('#rutinas-wrap .ses')).toBeVisible();
}
const abierto = page => page.locator('#rutinas-wrap .ses-ex.open');
const exAbierto = page => page.evaluate(() => [..._rtnExpandedEx][0]);
async function nota(page, texto, destino) {
  await page.locator('#ses-nota').click();
  await expect(page.locator('#ses-hoja')).toBeVisible();
  if (destino !== undefined) await page.locator('#eno-n-ex').selectOption(destino);
  await page.locator('#eno-n-txt').fill(texto);
  await page.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.locator('#ses-hoja')).toHaveCount(0);
}
async function cargarSerie(page, w, r) {
  const ex = abierto(page);
  await ex.locator('input[data-f=w]').first().fill(String(w));
  await ex.locator('input[data-f=r]').first().fill(String(r));
  await ex.locator('.pe-ck').first().click();
}
const irTab = (page, t) => page.locator('#rutinas-wrap .pe-tab', { hasText: t }).click();

for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  test.describe(`Historial y notas de entrenamiento · ${vp.w}px`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });
    test.describe.configure({ timeout: 90000 });

    test('nota rápida ligada al ejercicio, varias, editable y borrable; medidas por ejercicio; recarga real; guarda y aparece en el historial', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await empezar(page);

      // botón siempre a mano: dentro de la pantalla, grande, sin scroll horizontal
      const b = await page.locator('#ses-nota').boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(48);
      expect(b.y + b.height).toBeLessThanOrEqual(vp.h);
      expect(await sinScrollH(page)).toBe(true);
      await shot(page, `01-sesion-boton-nota-${vp.w}`);

      // nota 1: queda ligada al ejercicio abierto
      const ex1 = await exAbierto(page);
      await page.locator('#ses-nota').click();
      await expect(page.locator('#eno-n-ex')).toHaveValue(ex1);
      await shot(page, `02-hoja-nota-${vp.w}`);
      await page.locator('#eno-n-txt').fill('Codos mas cerrados, agarre ancho');
      await page.getByRole('button', { name: 'Guardar nota' }).click();
      await expect(abierto(page).locator('.eno-nt')).toContainText('Codos mas cerrados');
      let s = await page.evaluate(() => S.activeRtnSession.notas);
      expect(s).toHaveLength(1);
      expect(s[0].instId).toBe(ex1);

      // nota 2 general, nota 3 general y se borra
      await nota(page, 'Dormi poco, cuerpo pesado', '');
      await nota(page, 'Nota para borrar', '');
      await expect(page.locator('#ses-nota-n')).toHaveText('3');
      await page.locator('#ses-nota').click();
      await page.locator('.eno-li', { hasText: 'Nota para borrar' }).getByRole('button', { name: 'Borrar' }).click();
      await page.locator('#ses-hoja').getByRole('button', { name: 'Cerrar' }).click();
      await expect(page.locator('#ses-nota-n')).toHaveText('2');

      // editar la nota 1 (tocándola dentro del ejercicio)
      await abierto(page).locator('.eno-nt').click();
      await expect(page.locator('#eno-n-txt')).toHaveValue('Codos mas cerrados, agarre ancho');
      await page.locator('#eno-n-txt').fill('Codos mas cerrados, agarre al ancho de hombros');
      await page.getByRole('button', { name: 'Guardar nota' }).click();
      await expect(abierto(page).locator('.eno-nt')).toContainText('al ancho de hombros');
      expect(await page.evaluate(() => S.activeRtnSession.notas.length)).toBe(2);

      // última serie del ejercicio → se ofrece "cómo salió" (tira chica, salteable)
      await cargarSerie(page, 60, 8);
      await expect(page.locator('#ses-pide')).toContainText('¿Cómo salió');
      expect(await sinScrollH(page)).toBe(true);
      await page.locator('#ses-pide').getByRole('button', { name: 'Cargar' }).click();
      await expect(page.locator('#ses-hoja')).toBeVisible();
      await page.getByRole('button', { name: 'Intensidad 8', exact: true }).click();
      await page.getByRole('button', { name: 'Concentración 7', exact: true }).click();
      await page.locator('#ses-hoja .eno-m5 button', { hasText: 'Bien' }).click();
      await shot(page, `03-ficha-medidas-${vp.w}`);
      expect(await sinScrollH(page)).toBe(true);
      await page.locator('#ses-hoja').getByRole('button', { name: 'Listo' }).click();
      await expect(page.locator('#ses-pide')).toBeEmpty();
      expect(await page.evaluate(id => S.activeRtnSession.exMedidas[id], ex1)).toEqual({ int: 8, con: 7, sens: 4 });
      await expect(page.locator(`#ses-ex-${ex1} .eno-med`)).toContainText('Intensidad 8');

      // el 2º ejercicio: se saltea la oferta con la ✕ y no queda nada cargado
      const ex2 = await page.evaluate(() => S.activeRtnSession.exOrder[1]);
      await page.evaluate(id => sesOpen(id, false), ex2);
      await cargarSerie(page, 40, 10);
      await expect(page.locator('#ses-pide')).toContainText('¿Cómo salió');
      await page.locator('#ses-pide').getByRole('button', { name: 'Saltear' }).click();
      await expect(page.locator('#ses-pide')).toBeEmpty();
      expect(await page.evaluate(id => (S.activeRtnSession.exMedidas || {})[id] || null, ex2)).toBeNull();

      // recarga real: notas, medidas y sesión siguen
      await page.reload();
      await waitForBoot(page);
      await completeLoginOverlay(page);
      await page.evaluate(() => { if (window.openGymOverlay) openGymOverlay(); renderRutinas(); });
      await expect(page.locator('#rutinas-wrap .ses')).toBeVisible();
      expect(await page.evaluate(() => S.activeRtnSession.notas.length)).toBe(2);
      expect(await page.evaluate(id => S.activeRtnSession.exMedidas[id], ex1)).toEqual({ int: 8, con: 7, sens: 4 });
      await expect(page.locator('#ses-nota-n')).toHaveText('2');
      await expect(page.locator('.eno-nt', { hasText: 'al ancho de hombros' })).toHaveCount(1);

      // finalizar SIN propósito previo: se pregunta como siempre (campo libre), sin "¿se cumplió?"
      await page.locator('#ses-fin').click();
      await expect(page.locator('#ses-d-pro')).toBeVisible();
      await expect(page.locator('#ses-d-cum')).toHaveCount(0);
      await page.locator('#ses-d-int').fill('7');
      await page.locator('#ses-d-con').fill('6');
      await page.locator('#ses-d-pro').fill('Probar el agarre ancho');
      await page.getByRole('button', { name: 'Guardar sesión' }).click();
      await expect(page.locator('#rutinas-wrap .ses')).toHaveCount(0);

      const e = await page.evaluate(() => { const r = S.routines[0].id; return { rid: r, e: S.routineLog[r][0] }; });
      expect(e.e.proposito).toBe('Probar el agarre ancho');
      expect(e.e.propositoPrevio).toBeUndefined();
      expect(e.e.cumplido).toBeUndefined();
      expect(e.e.exMedidas[ex1]).toEqual({ int: 8, con: 7, sens: 4 });
      expect(Object.keys(e.e.exMedidas)).toEqual([ex1]);
      expect(e.e.notas.map(n => n.instId)).toEqual([ex1, null]);
      expect(e.e.exInfo[ex1].libId).toBeTruthy();
      expect(e.e.intensidad).toBe(7);

      // aparece en el Historial, con el detalle
      await irTab(page, 'Historial');
      await expect(page.locator('.eh-card')).toHaveCount(1);
      await expect(page.locator('.eh-card')).toContainText('Empuje');
      await expect(page.locator('.eh-card')).toContainText('2 notas');
      await expect(page.locator('.eh-card')).toContainText('1 ejercicio con medidas');
      expect(await sinScrollH(page)).toBe(true);
      await page.locator('.eh-card').click();
      const det = page.locator('#eh-detalle');
      await expect(det).toContainText('Probar el agarre ancho');
      await expect(page.locator('#rutinas-wrap')).toContainText('al ancho de hombros');
      await expect(page.locator('#rutinas-wrap')).toContainText('Dormi poco');
      await expect(page.locator('#rutinas-wrap .eh-med').first()).toContainText('Intensidad 8');
      await expect(page.locator('#rutinas-wrap .eh-med').first()).toContainText('Bien');
      expect(await sinScrollH(page)).toBe(true);
      await shot(page, `05-detalle-sesion-${vp.w}`);
      await page.getByRole('button', { name: '← Historial' }).click();
      await expect(page.locator('.eh-card')).toHaveCount(1);
      expect(consoleErrors).toEqual([]);
    });

    test('propósito previo: se carga en el plan, llega a la sesión, al finalizar se pregunta si se cumplió y se guarda', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      const hoy = await page.evaluate(() => getActiveDate());
      const rid = await page.evaluate(() => S.routines[0].id);
      // desde el plan (ítem de hoy)
      await page.locator('#rutinas-wrap .pe-day-hoy .pe-pro').click();
      await page.locator('#pe-pro-in').fill('Subir 2 kg en press');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      expect(await page.evaluate(() => S.entrenoPropositos)).toEqual({ [hoy + '|' + rid]: 'Subir 2 kg en press' });
      await expect(page.locator('#rutinas-wrap .pe-day-hoy .pe-pro')).toContainText('Subir 2 kg en press');
      await shot(page, `06-plan-proposito-${vp.w}`);

      await empezar(page);
      await expect(page.locator('#ses-pro')).toContainText('Subir 2 kg en press');
      await cargarSerie(page, 60, 8);
      await page.locator('#ses-fin').click();
      await expect(page.locator('#ses-d-pro')).toHaveCount(0);   // ya había propósito: no se vuelve a preguntar
      await expect(page.locator('#ses-sheet')).toContainText('Subir 2 kg en press');
      await expect(page.locator('#ses-sheet')).toContainText('¿Se cumplió?');
      await expect(page.locator('#ses-d-cum button')).toHaveText(['Sí', 'A medias', 'No']);
      await page.locator('#ses-d-cum button', { hasText: 'A medias' }).click();
      await expect(page.locator('#ses-d-cum button.on')).toHaveText('A medias');
      expect(await sinScrollH(page)).toBe(true);
      await shot(page, `04-hoja-final-proposito-${vp.w}`);
      await page.getByRole('button', { name: 'Guardar sesión' }).click();
      const e = await page.evaluate(r => S.routineLog[r][0], rid);
      expect(e.proposito).toBe('Subir 2 kg en press');
      expect(e.propositoPrevio).toBe(true);
      expect(e.cumplido).toBe('medias');
      expect(await page.evaluate(() => S.entrenoPropositos)).toEqual({});   // el cargado de antemano se consume

      // propósito escrito DENTRO de la sesión + salteando la pregunta (sin elegir): se guarda sin "cumplido"
      await page.locator('#rutinas-wrap .pe-day-hoy').getByRole('button', { name: 'REPETIR' }).click();
      await expect(page.locator('#ses-pro')).toContainText('Propósito de hoy');
      await page.locator('#ses-pro').click();
      await page.locator('#eno-p-in').fill('Controlar la bajada');
      await page.locator('#ses-hoja').getByRole('button', { name: 'Guardar' }).click();
      await expect(page.locator('#ses-pro')).toContainText('Controlar la bajada');
      await page.locator('#ses-fin').click();
      await expect(page.locator('#ses-d-cum')).toBeVisible();
      await page.getByRole('button', { name: 'Guardar sesión' }).click();
      const e2 = await page.evaluate(r => S.routineLog[r][1], rid);
      expect(e2.proposito).toBe('Controlar la bajada');
      expect(e2.propositoPrevio).toBe(true);
      expect(e2.cumplido).toBeUndefined();
      expect(consoleErrors).toEqual([]);
    });

    test('sacar un ejercicio de la sesión no pierde sus notas: pasan a generales', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await empezar(page);
      const ex1 = await exAbierto(page);
      await nota(page, 'Anotacion del primero', ex1);
      page.once('dialog', d => d.accept());
      await page.evaluate(id => removeSessionEx(id), ex1);
      const n = await page.evaluate(() => S.activeRtnSession.notas);
      expect(n).toHaveLength(1);
      expect(n[0].instId).toBeNull();
      expect(n[0].exNom).toBeTruthy();
      await cargarSerie(page, 20, 10);
      await page.locator('#ses-fin').click();
      await page.getByRole('button', { name: 'Guardar sesión' }).click();
      const e = await page.evaluate(() => S.routineLog[S.routines[0].id][0]);
      expect(e.notas).toHaveLength(1);
      expect(e.notas[0].instId).toBeNull();
      expect(consoleErrors).toEqual([]);
    });

    test('Historial: filtros por rutina y por ejercicio, búsqueda en notas, detalle, entradas viejas sin campos nuevos e historial por ejercicio', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      const ids = await page.evaluate(() => {
        const r1 = S.routines[0];
        const r2 = { id: 'rtb', name: 'Tiron', icon: '🏋️', exercises: [{ id: 'rtb-e1', libId: r1.exercises[2].libId }] };
        S.routines.push(r2);
        const l0 = r1.exercises[0].libId, l1 = r1.exercises[1].libId;
        const set = (w, r) => [{ weight: w, reps: r, done: true }];
        S.routineLog = {
          [r1.id]: [
            // vieja: sin exInfo, sin notas, sin medidas, sin nada nuevo
            { id: 'old1', date: '2026-10-01', exSets: { [r1.exercises[0].id]: set(50, 10) }, vol: 500, sets: 1, duration: 1800 },
            // nueva, con todo
            { id: 'new1', date: '2026-11-10', exSets: { [r1.exercises[0].id]: set(60, 8), [r1.exercises[1].id]: set(30, 12) }, vol: 840, sets: 2, duration: 3000,
              intensidad: 8, concentracion: 7, proposito: 'Controlar la bajada', propositoPrevio: true, cumplido: 'si',
              exInfo: { [r1.exercises[0].id]: { libId: l0, n: 'Press' }, [r1.exercises[1].id]: { libId: l1, n: 'Apertura' } },
              exMedidas: { [r1.exercises[0].id]: { int: 9, con: 6, sens: 2 } },
              notas: [{ id: 'n1', t: 1760000000000, instId: r1.exercises[0].id, texto: 'Hombro molesto, bajar el banco un punto' }, { id: 'n2', t: 1760000100000, instId: null, texto: 'Dia de mucho calor' }] },
          ],
          rtb: [
            { id: 'tir1', date: '2026-11-12', exSets: { 'rtb-e1': set(40, 10) }, vol: 400, sets: 1, duration: 1500,
              exInfo: { 'rtb-e1': { libId: r1.exercises[2].libId, n: 'Remo' } }, notas: [{ id: 'n3', t: 1760000200000, instId: 'rtb-e1', texto: 'Remo con agarre neutro, se siente mejor' }] },
          ],
        };
        saveState(); renderRutinas();
        return { r1: r1.id, l0, l1, l2: r1.exercises[2].libId, ex0: r1.exercises[0].id };
      });
      await irTab(page, 'Historial');
      const cards = page.locator('.eh-card');
      await expect(cards).toHaveCount(3);
      // más reciente primero
      await expect(cards.nth(0)).toContainText('Tiron');
      await expect(cards.nth(1)).toContainText('Empuje');
      await expect(cards.nth(1)).toContainText('Controlar la bajada');
      await expect(cards.nth(1)).toContainText('Cumplido');
      await expect(cards.nth(2)).toContainText('500 kg');
      // la entrada vieja se ve bien: sin "undefined" / "NaN" ni etiquetas de notas
      const viejo = await cards.nth(2).innerText();
      expect(viejo).not.toMatch(/undefined|NaN|null/);
      expect(viejo).not.toMatch(/nota|medidas/);
      expect(await sinScrollH(page)).toBe(true);
      await shot(page, `07-historial-lista-${vp.w}`);

      // filtro por rutina
      await page.locator('#rutinas-wrap .prg-chip', { hasText: 'Tiron' }).click();
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText('Tiron');
      await page.locator('#rutinas-wrap .prg-chip', { hasText: 'Todas' }).click();
      await expect(cards).toHaveCount(3);

      // filtro por ejercicio: solo sesiones donde estuvo, mostrando sus medidas
      await page.locator('#eh-ej').selectOption(ids.l0);
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0)).toContainText('Intensidad 9');
      await expect(cards.nth(0)).toContainText('Sensación: Flojo');
      await page.locator('#eh-ej').selectOption(ids.l1);
      await expect(cards).toHaveCount(1);
      await page.locator('#eh-ej').selectOption('');

      // búsqueda en notas (sin tildes ni mayúsculas) y en propósitos
      await page.locator('#eh-q').fill('HOMBRO');
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText('Hombro molesto');
      await page.locator('#eh-q').fill('neutro');
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText('Tiron');
      await page.locator('#eh-q').fill('bajada');
      await expect(cards).toHaveCount(1);
      await page.locator('#eh-q').fill('zzzz');
      await expect(page.locator('#eh-lista')).toContainText('No hay entrenos con ese filtro');
      await page.locator('#eh-q').fill('');
      await expect(cards).toHaveCount(3);
      await page.locator('#eh-q').fill('hombro');
      await shot(page, `08-historial-filtros-${vp.w}`);
      await page.locator('#eh-q').fill('');

      // detalle de la vieja: el nombre del ejercicio sale de la rutina, sin medidas ni notas
      await cards.nth(2).click();
      const det = page.locator('#rutinas-wrap');
      await expect(det).toContainText('500 kg');
      await expect(page.locator('.eh-ex')).toHaveCount(1);
      await expect(page.locator('.eh-ex').first()).toContainText('50×10');
      expect((await page.locator('#rutinas-wrap .pe-main').innerText())).not.toMatch(/undefined|NaN/);
      await page.getByRole('button', { name: '← Historial' }).click();

      // historial por ejercicio (el de siempre) + medidas y notas, que llevan a la sesión
      await page.evaluate(id => openExHistByLib(id), ids.l0);
      await expect(page.locator('#modal-ex-hist-body')).toContainText('SENSACIONES Y NOTAS');
      await expect(page.locator('#modal-ex-hist-body')).toContainText('Intensidad 9');
      await expect(page.locator('#modal-ex-hist-body')).toContainText('Hombro molesto');
      await page.locator('#modal-ex-hist-body .eh-row').first().click();
      await expect(page.locator('#eh-detalle')).toContainText('Controlar la bajada');
      expect(consoleErrors).toEqual([]);
    });
  });
}
