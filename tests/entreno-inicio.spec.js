// Entrenamiento · Inicio "Plan semanal" (etapa 2): tira de 7 días + carrusel, pendientes, actividades hechas, editar plan
// (para siempre / solo esta semana), resetear, descansar semana, ⋯ por rutina y barra Plan · Progreso · Ejercicios.
// Fechas relativas a HOY (el día lo da getActiveDate()); datos inventados. Capturas si ENTRENO_CAPTURAS apunta a una carpeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const CAPT = process.env.ENTRENO_CAPTURAS || '';

// Deja 2 rutinas con ejercicios (Empuje, Tirón), plan vacío, sin sesión, y abre el overlay de Entrenamiento.
async function preparar(page) {
  await page.evaluate(() => {
    initRoutines();
    const base = S.routines.slice(0, 2);
    base[0].name = 'Empuje'; base[0].icon = '💪'; base[1].name = 'Tirón'; base[1].icon = '🔗';
    S.routines = base; S.routineLog = {}; S.activeRtnSession = null;
    S.planEntreno = PlanEntreno.vacio(); S.actividadesHechas = {};
    saveState();
    if (window.openGymOverlay) openGymOverlay();
    renderRutinas();
  });
  await page.waitForSelector('#rutinas-wrap .pe-root');
}
// dias: [{off, items:[{r:indiceRutina}|{a:'boxeo', franja}]}], off = días respecto de hoy (el plan fijo se arma por día de la semana).
async function armarPlan(page, dias) {
  await page.evaluate((dias) => {
    const d0 = PlanEntreno.diaDeSemana(getActiveDate());
    let p = PlanEntreno.vacio();
    dias.forEach(({ off, items }) => items.forEach(it => {
      p = PlanEntreno.cambiarPermanente(p, { op: 'agregar', dia: (((d0 + off) % 7) + 7) % 7, item: it.r != null ? { tipo: 'rutina', id: S.routines[it.r].id } : { tipo: 'actividad', clave: it.a, franja: it.franja } });
    }));
    S.planEntreno = p; saveState(); renderRutinas();
  }, dias);
}
const hoyCard = page => page.locator('#rutinas-wrap .pe-day-hoy');
const sinScrollH = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, nombre) => { if (!CAPT) return; fs.mkdirSync(CAPT, { recursive: true }); await page.screenshot({ path: path.join(CAPT, nombre + '.png') }); };

for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  test.describe(`Inicio plan semanal · ${vp.w}px`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    test('sin plan: rutinas compactas + "Armar mi plan"; se arma el plan y aparece la tarjeta de hoy con EMPEZAR', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await expect(page.getByRole('button', { name: 'Armar mi plan' })).toBeVisible();
      await expect(page.locator('#rutinas-wrap .rtn-card')).toHaveCount(2);                 // las rutinas como hoy, compactas
      await shot(page, `01-sin-plan-${vp.w}`);
      await page.getByRole('button', { name: 'Armar mi plan' }).click();
      const d0 = await page.evaluate(() => PlanEntreno.diaDeSemana(getActiveDate()));
      await page.locator('select[aria-label="Día"]').selectOption(String(d0));
      const rid = await page.evaluate(() => S.routines[0].id);
      await page.locator('select[aria-label="Rutina o actividad"]').selectOption('r:' + rid);
      await page.getByRole('button', { name: 'Agregar', exact: true }).click();
      await page.locator('select[aria-label="Rutina o actividad"]').selectOption('a:boxeo');
      await page.locator('.pe-add select[aria-label="Franja"]').selectOption('tarde');
      await page.getByRole('button', { name: 'Agregar', exact: true }).click();
      await shot(page, `02-editar-${vp.w}`);
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('button', { name: 'Para siempre' }).click();
      await expect(hoyCard(page).getByRole('button', { name: 'EMPEZAR' })).toBeVisible();
      await expect(hoyCard(page)).toContainText('Empuje');
      await expect(hoyCard(page)).toContainText('Boxeo');
      await expect(hoyCard(page).locator('.pe-fr')).toHaveText(['Mañana', 'Tarde']);   // ordenados por franja
      const st = await page.evaluate(() => ({ fijo: Object.keys(S.planEntreno.fijo[PlanEntreno.diaDeSemana(getActiveDate())]).length, semanas: Object.keys(S.planEntreno.semanas).length }));
      expect(st).toEqual({ fijo: 2, semanas: 0 });
      expect(await sinScrollH(page)).toBe(true);
      await shot(page, `03-inicio-${vp.w}`);
      expect(consoleErrors).toEqual([]);
    });

    test('Inicio cabe en una pantalla: tira de 7 días + tarjeta de hoy + barra inferior, sin scroll vertical ni horizontal', async ({ cmPage: page }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ r: 0 }, { a: 'boxeo', franja: 'tarde' }] }, { off: 1, items: [{ r: 1 }] }]);
      await expect(page.locator('#rutinas-wrap .pe-s')).toHaveCount(7);
      await expect(page.locator('#rutinas-wrap .pe-s.pe-hoy')).toHaveCount(1);
      const m = await page.evaluate(() => {
        const w = document.getElementById('rutinas-wrap').getBoundingClientRect(), t = document.querySelector('.pe-tabbar').getBoundingClientRect();
        const sc = document.getElementById('rutinas-wrap').closest('.cm-ov-body');
        return { tabBottom: t.bottom, vh: innerHeight, scrolls: !!sc && sc.scrollHeight > sc.clientHeight + 1, wrapH: w.height };
      });
      expect(m.tabBottom).toBeLessThanOrEqual(m.vh);
      expect(m.scrolls).toBe(false);
      expect(await sinScrollH(page)).toBe(true);
      await shot(page, `04-una-pantalla-${vp.w}`);
    });

    test('EMPEZAR inicia la sesión actual de rutinas; día hecho muestra ✓ y REPETIR', async ({ cmPage: page }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ r: 0 }] }]);
      await hoyCard(page).getByRole('button', { name: 'EMPEZAR' }).click();
      const s = await page.evaluate(() => ({ r: S.routines[0].id, ses: S.activeRtnSession && S.activeRtnSession.routineId, ex: S.activeRtnSession && Object.keys(S.activeRtnSession.exSets).length }));
      expect(s.ses).toBe(s.r);
      expect(s.ex).toBeGreaterThan(0);
      await expect(page.locator('#rutinas-wrap')).toContainText('Finalizar');            // la sesión de siempre
      // cancelar la sesión y marcar una sesión hecha hoy
      await page.evaluate(() => { S.activeRtnSession = null; S.routineLog[S.routines[0].id] = [{ id: 'l1', date: getActiveDate(), exSets: {}, vol: 100, sets: 12, duration: 2700 }]; saveState(); renderRutinas(); });
      await expect(hoyCard(page)).toContainText('✓ Hecho');
      await expect(hoyCard(page)).toContainText('45');
      await expect(hoyCard(page)).toContainText('12');
      await expect(hoyCard(page).getByRole('button', { name: 'REPETIR' })).toBeVisible();
      await expect(page.locator('#rutinas-wrap .pe-s.pe-hoy em')).toHaveText('✓');
      await shot(page, `05-hecho-${vp.w}`);
    });

    test('actividad: Hecho con un toque y Detalle opcional (valida 1-10)', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ a: 'jiujitsu', franja: 'noche' }] }]);
      await hoyCard(page).getByRole('button', { name: /Marcar Jiujitsu como hecha/ }).click();
      let reg = await page.evaluate(() => Object.values(S.actividadesHechas).filter(Boolean));
      expect(reg).toHaveLength(1);
      expect(reg[0]).toMatchObject({ fecha: await page.evaluate(() => getActiveDate()), clave: 'jiujitsu', franja: 'noche' });
      await expect(hoyCard(page)).toContainText('✓ Hecha');
      await hoyCard(page).getByRole('button', { name: 'Detalle' }).click();
      await page.fill('#pe-d-dur', '75'); await page.fill('#pe-d-int', '11'); await page.fill('#pe-d-con', '6'); await page.fill('#pe-d-pro', 'Pasadas de guardia');
      await hoyCard(page).getByRole('button', { name: 'Guardar' }).click();
      reg = await page.evaluate(() => Object.values(S.actividadesHechas).filter(Boolean));
      expect(reg[0].intensidad).toBeUndefined();                                          // 11 inválido: no se guardó nada
      await page.fill('#pe-d-int', '8');
      await shot(page, `06-detalle-${vp.w}`);
      await hoyCard(page).getByRole('button', { name: 'Guardar' }).click();
      reg = await page.evaluate(() => Object.values(S.actividadesHechas).filter(Boolean));
      expect(reg[0]).toMatchObject({ duracionMin: 75, intensidad: 8, concentracion: 6, proposito: 'Pasadas de guardia' });
      await expect(hoyCard(page)).toContainText('75 min');
      await hoyCard(page).getByRole('button', { name: 'Deshacer hecha' }).click();
      expect(await page.evaluate(() => Object.values(S.actividadesHechas).filter(Boolean).length)).toBe(0);
      await expect(hoyCard(page).getByRole('button', { name: /Marcar Jiujitsu como hecha/ })).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });

    test('pendiente de ayer: aviso "Te quedó X de ayer"; Hacer la pendiente corre el plan, Seguir con el plan la deja sin hacer', async ({ cmPage: page }) => {
      await preparar(page);
      await armarPlan(page, [{ off: -1, items: [{ r: 0 }] }, { off: 0, items: [{ r: 1 }] }]);
      await expect(page.locator('#rutinas-wrap .pe-pend')).toContainText('Te quedó Empuje de ayer');
      expect(await page.evaluate(() => Object.keys(S.planEntreno.pendientes).length)).toBe(0);   // nada se marcó solo
      await shot(page, `07-pendiente-${vp.w}`);
      await page.getByRole('button', { name: 'Hacer la pendiente' }).click();
      await expect(page.locator('#rutinas-wrap .pe-pend')).toHaveCount(0);
      await expect(hoyCard(page)).toContainText('Empuje');                                // hoy ya muestra lo de ayer
      await expect(hoyCard(page)).not.toContainText('Tirón');
      const c = await page.evaluate(() => ({ n: Object.keys(S.planEntreno.corridas).length, p: S.planEntreno.pendientes[getActiveDate()] }));
      expect(c).toEqual({ n: 1, p: 'corrida' });
      // otro camino: resetear y elegir seguir
      await page.evaluate(() => { S.planEntreno = PlanEntreno.vacio(); saveState(); });
      await armarPlan(page, [{ off: -1, items: [{ r: 0 }] }, { off: 0, items: [{ r: 1 }] }]);
      await page.getByRole('button', { name: 'Seguir con el plan' }).click();
      await expect(page.locator('#rutinas-wrap .pe-pend')).toHaveCount(0);
      await expect(hoyCard(page)).toContainText('Tirón');
      expect(await page.evaluate(() => S.planEntreno.pendientes[getActiveDate()])).toBe('seguir');
      expect(await page.evaluate(() => Object.keys(S.planEntreno.corridas).length)).toBe(0);
    });

    test('editar plan: "Solo esta semana" no toca el plan fijo; "Para siempre" sí; mover y quitar', async ({ cmPage: page }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ r: 0 }] }]);
      const d0 = await page.evaluate(() => PlanEntreno.diaDeSemana(getActiveDate()));
      const rid1 = await page.evaluate(() => S.routines[1].id);
      // Solo esta semana: agrega Tirón hoy
      await page.getByRole('button', { name: 'Editar plan' }).click();
      await page.locator('select[aria-label="Día"]').selectOption(String(d0));
      await page.locator('select[aria-label="Rutina o actividad"]').selectOption('r:' + rid1);
      await page.getByRole('button', { name: 'Agregar', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('button', { name: 'Solo esta semana' }).click();
      await expect(hoyCard(page)).toContainText('Tirón');
      let st = await page.evaluate(() => ({ fijo: Object.values(S.planEntreno.fijo[PlanEntreno.diaDeSemana(getActiveDate())]).filter(Boolean).length, sem: Object.keys(S.planEntreno.semanas) }));
      expect(st.fijo).toBe(1);
      expect(st.sem).toHaveLength(1);
      expect(await page.evaluate(() => PlanEntreno.itemsDelDia(S.planEntreno, PlanEntreno.sumarDias(getActiveDate(), 7)).length)).toBe(1);   // la semana siguiente vuelve al fijo
      // Para siempre: mover Empuje a otro día
      await page.getByRole('button', { name: 'Editar plan' }).click();
      const otro = (d0 + 2) % 7;
      await page.locator('.pe-ed-it', { hasText: 'Empuje' }).locator('select[aria-label="Mover a otro día"]').selectOption(String(otro));
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('button', { name: 'Para siempre' }).click();
      st = await page.evaluate((otro) => ({ hoyFijo: Object.values(S.planEntreno.fijo[PlanEntreno.diaDeSemana(getActiveDate())] || {}).filter(Boolean).length, otroFijo: Object.values(S.planEntreno.fijo[otro] || {}).filter(Boolean).map(i => i.id) }), otro);
      expect(st.hoyFijo).toBe(0);
      expect(st.otroFijo).toEqual([await page.evaluate(() => S.routines[0].id)]);
      expect(await page.evaluate(() => PlanEntreno.itemsDelDia(S.planEntreno, PlanEntreno.sumarDias(getActiveDate(), 14)).length)).toBe(0);   // el mismo día de la semana ya no tiene Empuje
      // Quitar con ✕ y cancelar
      await page.getByRole('button', { name: 'Editar plan' }).click();
      await page.getByRole('button', { name: 'Quitar' }).first().click();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(page.locator('#rutinas-wrap .pe-car')).toBeVisible();
      await shot(page, `08-editado-${vp.w}`);
    });

    test('Resetear y Descansar esta semana (con confirmación)', async ({ cmPage: page }) => {
      await preparar(page);
      await armarPlan(page, [{ off: -1, items: [{ r: 0 }] }, { off: 0, items: [{ r: 1 }] }]);
      await page.getByRole('button', { name: 'Hacer la pendiente' }).click();
      await expect(hoyCard(page)).toContainText('Empuje');
      // Resetear: cancelar la confirmación no hace nada, aceptar vuelve al plan fijo desde hoy
      page.once('dialog', d => d.dismiss());
      await page.getByRole('button', { name: 'Más opciones del plan' }).click();
      await page.getByRole('button', { name: 'Resetear' }).click();
      expect(await page.evaluate(() => PlanEntreno.desfase(S.planEntreno, getActiveDate()))).toBe(1);
      page.once('dialog', d => d.accept());
      await page.getByRole('button', { name: 'Resetear' }).click();
      await expect(hoyCard(page)).toContainText('Tirón');
      expect(await page.evaluate(() => PlanEntreno.desfase(S.planEntreno, getActiveDate()))).toBe(0);
      expect(await page.evaluate(() => { const c = Object.values(S.planEntreno.corridas)[0]; return c.hasta === getActiveDate(); })).toBe(true);   // solo desde hoy
      // Descansar esta semana
      await page.getByRole('button', { name: 'Más opciones del plan' }).click();
      page.once('dialog', d => d.accept());
      await page.getByRole('button', { name: 'Descansar esta semana' }).click();
      await expect(hoyCard(page)).toContainText('Descanso');
      await expect(hoyCard(page).getByRole('button', { name: /Empuje/ })).toBeVisible();   // "entrenar igual"
      expect(await page.evaluate(() => PlanEntreno.planDeSemana(S.planEntreno, PlanEntreno.semanaISO(getActiveDate())).every(l => l.length === 0))).toBe(true);
      await shot(page, `09-descanso-${vp.w}`);
    });

    test('⋯ por rutina: editar, + ejercicio, reordenar y borrar manteniendo apretado ~0,5 s', async ({ cmPage: page }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ r: 0 }] }, { off: 1, items: [{ r: 1 }] }]);
      const rid0 = await page.evaluate(() => S.routines[0].id);
      await hoyCard(page).getByRole('button', { name: /Más opciones de Empuje/ }).click();
      await expect(page.locator('.pe-menu button')).toHaveText(['Editar rutina', '+ Ejercicio', 'Reordenar / ejercicios', 'Borrar (mantener apretado)']);
      await shot(page, `10-menu-${vp.w}`);
      await page.getByRole('button', { name: 'Editar rutina' }).click();
      await expect(page.locator('#modal-edit-routine.open')).toBeVisible();
      await page.evaluate(() => closeModal('modal-edit-routine'));
      await page.getByRole('button', { name: 'Reordenar / ejercicios' }).click();
      await expect(page.locator('#rtn-section-rutinas')).toBeVisible();
      await expect(page.locator('#rtn-card-' + (await page.evaluate(() => S.routines[0].id)))).toHaveClass(/rtn-open/);
      // borrar: un toque corto NO borra
      await hoyCard(page).getByRole('button', { name: /Más opciones de Empuje/ }).click();
      const del = page.locator('.pe-del');
      const box = await del.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
      expect(await page.evaluate(() => S.routines.length)).toBe(2);
      // mantener apretado borra y deja el día sin asignar
      await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
      await expect.poll(() => page.evaluate(() => S.routines.map(r => r.name))).toEqual(['Tirón']);
      expect(await page.evaluate((id) => PlanEntreno.usaRutina(S.planEntreno, id), rid0)).toBe(false);
      await expect(hoyCard(page)).toContainText('Descanso');
    });

    test('barra inferior Plan · Progreso · Ejercicios: nada se pierde', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ r: 0 }] }]);
      await expect(page.locator('.pe-tab')).toHaveText(['Plan', 'Progreso', 'Ejercicios']);
      await page.locator('.pe-tab', { hasText: 'Progreso' }).click();
      await expect(page.locator('#rutinas-wrap')).toContainText('Entrenamientos');
      await expect(page.locator('#rutinas-wrap')).toContainText('Records');
      await expect(page.locator('#rutinas-wrap')).toContainText('Distribución muscular');
      await page.getByRole('button', { name: 'trimestre' }).click();                       // selector de período sigue funcionando
      await expect(page.locator('#rutinas-wrap')).toContainText('Entrenamientos');
      await shot(page, `11-progreso-${vp.w}`);
      await page.locator('.pe-tab', { hasText: 'Ejercicios' }).click();
      await expect(page.locator('#rutinas-wrap .lib-pill').first()).toBeVisible();          // filtros de la biblioteca
      await expect(page.getByRole('button', { name: '+ Nuevo' })).toBeVisible();
      await shot(page, `12-ejercicios-${vp.w}`);
      await page.locator('.pe-tab', { hasText: 'Plan' }).click();
      await expect(hoyCard(page)).toBeVisible();
      // Mis rutinas (acordeón) conserva todo lo de las tarjetas viejas
      await page.locator('#rutinas-wrap .rtn-section-hdr', { hasText: 'Mis rutinas' }).click();
      await expect(page.locator('#rutinas-wrap .rtn-card')).toHaveCount(2);
      await expect(page.locator('#rutinas-wrap .rtn-card').first().getByRole('button', { name: /Empezar/ })).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });

    test('carrusel: abre en HOY, tocar un día de la tira lo selecciona y el día sin items es "Descanso"', async ({ cmPage: page }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ r: 0 }] }]);
      const i0 = await page.evaluate(() => PlanEntreno.diaDeSemana(getActiveDate()));
      await expect.poll(() => page.evaluate(() => { const c = document.getElementById('pe-car'); return Math.round(c.scrollLeft / c.clientWidth); })).toBe(i0);
      const otro = (i0 + 1) % 7;
      await page.locator(`#rutinas-wrap .pe-s[data-i="${otro}"]`).click();
      await expect(page.locator(`#rutinas-wrap .pe-s[data-i="${otro}"]`)).toHaveClass(/pe-sel/);
      await expect.poll(() => page.evaluate(() => { const c = document.getElementById('pe-car'); return Math.round(c.scrollLeft / c.clientWidth); })).toBe(otro);
      await expect(page.locator(`#rutinas-wrap .pe-day[data-i="${otro}"]`)).toContainText('Descanso');
    });
  });
}
