// Entrenamiento · Sesión en curso estilo V2 + barra de descanso (etapa 3): acordeón de un ejercicio abierto, auto-avance, filas kg/reps con
// casilla a la derecha, menú ⋯ por ejercicio y de la sesión (cancelar manteniendo apretado), FINALIZAR con detalle opcional, fecha de
// inicio, barra LED de descanso (ámbar / verde / ±15 / omitir), push programado y cuenta por hora de fin con la app en segundo plano.
// Datos inventados. Capturas si ENTRENO_CAPTURAS apunta a una carpeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const CAPT = process.env.ENTRENO_CAPTURAS || '';
const shot = async (page, nombre) => { if (!CAPT) return; fs.mkdirSync(CAPT, { recursive: true }); await page.screenshot({ path: path.join(CAPT, nombre + '.png') }); };
const sinScrollH = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// Una rutina "Empuje" con 3 ejercicios, plan con esa rutina hoy, sin sesión; los pushes quedan registrados en window.__push / __cancel.
async function preparar(page) {
  await page.evaluate(() => {
    initRoutines();
    const r = S.routines[0]; r.name = 'Empuje'; r.icon = '💪'; r.exercises = r.exercises.slice(0, 3);
    S.routines = [r]; S.routineLog = {}; S.exerciseHistory = {}; S.activeRtnSession = null; S.actividadesHechas = {};
    S.planEntreno = PlanEntreno.cambiarPermanente(PlanEntreno.vacio(), { op: 'agregar', dia: PlanEntreno.diaDeSemana(getActiveDate()), item: { tipo: 'rutina', id: r.id } });
    window.__push = []; window.__cancel = [];
    window._schedulePushAlarm = async (...a) => { window.__push.push(a); };
    window._cancelPushAlarm = async (...a) => { window.__cancel.push(a); };
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
// Descanso corto y determinístico en todos los ejercicios de la sesión.
const descansoCorto = (page, secs) => page.evaluate(s => { Object.values(S.activeRtnSession.exMeta).forEach(m => { m.restSecs = s; }); renderRutinas(); }, secs);
const abierto = page => page.locator('#rutinas-wrap .ses-ex.open');
const tildar = async (page, n = 0) => { await abierto(page).locator('.pe-ck').nth(n).click(); };

for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  test.describe(`Sesión en curso · ${vp.w}px`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });
    test.describe.configure({ timeout: 60000 });

    test('acordeón: un solo ejercicio abierto, "Ejercicio X de N", barra de progreso, auto-avance y toque en otro lo abre', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await empezar(page);
      await expect(page.locator('#rutinas-wrap .ses-ex')).toHaveCount(3);
      await expect(abierto(page)).toHaveCount(1);
      await expect(page.locator('.ses-kick')).toContainText('Ejercicio 1 de 3');
      await expect(page.locator('#ses-led i')).toHaveCount(24);
      await expect(page.locator('#ses-cnt')).toHaveText('0/3');                              // 1 serie por ejercicio (sin historial)
      // dos series en el primero: tildar la 1ª no avanza; la 2ª abre el siguiente solo
      await abierto(page).getByRole('button', { name: '+ Serie' }).click();
      await expect(abierto(page).locator('.ses-row')).toHaveCount(2);
      await descansoCorto(page, 30);
      await page.evaluate(() => _rtnExpandedEx.size);                                          // (sigue el mismo ejercicio abierto tras re-render)
      await expect(page.locator('.ses-kick')).toContainText('Ejercicio 1 de 3');
      await tildar(page, 0);
      await expect(page.locator('#ses-cnt')).toHaveText('1/4');
      await page.waitForTimeout(1000);
      await expect(page.locator('.ses-kick')).toContainText('Ejercicio 1 de 3');
      await tildar(page, 1);
      await expect(page.locator('.ses-kick')).toContainText('Ejercicio 2 de 3', { timeout: 4000 });   // auto-avance
      await expect(abierto(page)).toHaveCount(1);
      expect(await page.evaluate(() => document.querySelector('.ses-ex.open').dataset.ex === S.activeRtnSession.exOrder[1])).toBe(true);
      await expect(page.locator('.ses-ex').first()).toHaveClass(/cdone/);
      // el barra LED refleja 2/4 → 12 de 24
      expect(await page.locator('#ses-led i.on').count()).toBe(12);
      // tocar otro ejercicio lo abre (y cierra el actual)
      await page.locator('.ses-ex').nth(2).locator('.ses-exh').click();
      await expect(page.locator('.ses-kick')).toContainText('Ejercicio 3 de 3');
      await expect(abierto(page)).toHaveCount(1);
      // casilla chica a la derecha del campo de reps
      const r = await page.locator('.ses-ex.open .ses-row').first().evaluate(row => {
        const ck = row.querySelector('.pe-ck b').getBoundingClientRect(), inp = row.querySelector('[data-f=r]').getBoundingClientRect();
        return { ckW: ck.width, derecha: ck.left >= inp.right - 1 };
      });
      expect(r.ckW).toBeLessThanOrEqual(18);
      expect(r.derecha).toBe(true);
      expect(await sinScrollH(page)).toBe(true);
      await shot(page, `sesion-acordeon-${vp.w}`);
      expect(consoleErrors).toEqual([]);
    });

    test('descanso: barra LED corre, ámbar en los últimos 5 s, verde "¡A DARLE!" al terminar, ±15 s y Omitir; push programado', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await empezar(page);
      await descansoCorto(page, 20);
      await tildar(page, 0);
      const box = page.locator('#rutinas-wrap .ses-rest');
      await expect(box).toBeVisible();
      await expect(box).toHaveAttribute('role', 'timer');
      await expect(box.locator('.ses-rest-led i')).toHaveCount(32);
      await expect(box.locator('.ses-rest-t')).toContainText('0:');                            // cuenta atrás grande
      // push del descanso programado una vez, con el tag y los segundos del ejercicio
      const p0 = await page.evaluate(() => window.__push.slice());
      expect(p0).toHaveLength(1);
      expect(p0[0][0]).toMatch(/^rtn-/); expect(p0[0][1]).toBe(20); expect(p0[0][4]).toBe('rtn-timer');
      // LEDs: al arrancar casi todos encendidos; a mitad de tiempo, ~16; hay un cabezal de luz
      await expect.poll(() => box.locator('.ses-rest-led i.on').count()).toBeGreaterThanOrEqual(30);
      expect(await box.locator('.ses-rest-led i.head').count()).toBe(1);
      await page.evaluate(() => { _rtnTimerEndsAt[_restFocus] = Date.now() + 10000; });
      await expect.poll(() => box.locator('.ses-rest-led i.on').count()).toBeLessThanOrEqual(17);   // 10 s de 20 = mitad de la barra (la máquina cargada puede gastar tiempo, nunca sumarlo)
      await expect(box).not.toHaveClass(/warn/);
      await shot(page, `descanso-corre-${vp.w}`);
      // ±15: mueve la hora de fin, reprograma el push y no deja pasar de lleno
      // (se compara la hora de fin antes/después del toque: no depende de cuánto tarde la máquina en hacer el clic)
      const fin0 = await page.evaluate(() => _rtnTimerEndsAt[_restFocus]);
      await box.getByRole('button', { name: '+15 s' }).click();
      const fin1 = await page.evaluate(() => _rtnTimerEndsAt[_restFocus]);
      expect(fin1 - fin0).toBe(15000);
      expect(await page.evaluate(() => window.__push.length)).toBe(2);
      await box.getByRole('button', { name: '−15 s' }).click();
      expect(fin1 - (await page.evaluate(() => _rtnTimerEndsAt[_restFocus]))).toBe(15000);
      expect(await page.evaluate(() => window.__push.length)).toBe(3);
      // ámbar con latido en los últimos 5 s
      await page.evaluate(() => { _rtnTimerEndsAt[_restFocus] = Date.now() + 4000; });
      await expect(box).toHaveClass(/warn/);
      await shot(page, `descanso-ambar-${vp.w}`);
      // verde al terminar: texto, vibración y barra llena en verde
      await page.evaluate(() => { window.__vib = []; navigator.vibrate = p => { window.__vib.push(p); return true; }; _rtnTimerEndsAt[_restFocus] = Date.now() - 50; });
      await expect(box).toHaveClass(/done/);
      await expect(box.locator('.ses-rest-t')).toHaveText('¡A DARLE!');
      await expect(box).not.toHaveClass(/warn/);
      expect(await box.locator('.ses-rest-led i.on').count()).toBe(32);
      expect((await page.evaluate(() => window.__vib)).length).toBe(1);
      await shot(page, `descanso-verde-${vp.w}`);
      // el push NO se cancela al vencer en vivo (los otros dispositivos lo reciben); +15 s tras terminar arranca otro descanso de 15 s
      expect(await page.evaluate(() => window.__cancel.length)).toBe(0);
      await box.getByRole('button', { name: '+15 s' }).click();
      await expect(box).not.toHaveClass(/done/);
      const p = await page.evaluate(() => window.__push[window.__push.length - 1]);
      expect(p[1]).toBe(15);
      // Omitir: esconde la barra y cancela el push
      await box.getByRole('button', { name: 'Omitir' }).click();
      await expect(box).toBeHidden();
      expect(await page.evaluate(() => window.__cancel.length)).toBe(1);
      expect(await page.evaluate(() => Object.keys(_rtnTimers).length + Object.keys(_rtnTimerEndsAt).length)).toBe(0);
      expect(consoleErrors).toEqual([]);
    });

    test('app en segundo plano: la cuenta sale de la hora de fin (no de ticks) y al volver se actualiza al toque; el rAF se pausa', async ({ cmPage: page }) => {
      await preparar(page);
      await empezar(page);
      await descansoCorto(page, 40);
      await tildar(page, 0);
      const box = page.locator('#rutinas-wrap .ses-rest');
      await expect(box).toBeVisible();
      // "pestaña oculta": nadie pinta; pasa el tiempo (la hora de fin queda 25 s en el pasado sin ningún tick en el medio)
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        _rtnTimerEndsAt[_restFocus] = Date.now() - 25000;
      });
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => _sesRaf)).toBe(0);                                      // un solo rAF, pausado con la pestaña oculta
      // vuelve a primer plano: el tiempo mostrado y el fin son los reales, sin esperar al próximo tick
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(box).toHaveClass(/done/, { timeout: 1500 });
      await expect(box.locator('.ses-rest-t')).toHaveText('¡A DARLE!');
      // un descanso a medias: queda el tiempo real
      await box.getByRole('button', { name: '+15 s' }).click();
      await page.evaluate(() => { _rtnTimerEndsAt[_restFocus] = Date.now() + 9000; _rtnTimerTick(_restFocus, ''); });
      await expect(box.locator('.ses-rest-t')).toHaveText('0:09');
    });

    test('movimiento reducido: sin latido ni parpadeo en la barra y el destello de la casilla queda quieto', async ({ cmPage: page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await preparar(page);
      await empezar(page);
      await descansoCorto(page, 20);
      await tildar(page, 0);
      await page.evaluate(() => { _rtnTimerEndsAt[_restFocus] = Date.now() + 3000; });
      const box = page.locator('#rutinas-wrap .ses-rest');
      await expect(box).toHaveClass(/warn/);
      expect(await box.evaluate(b => getComputedStyle(b).animationName)).toBe('none');
      expect(await page.locator('.pe-ck.pe-flash b').first().evaluate(b => getComputedStyle(b).animationName)).toBe('none');
    });

    test('menú ⋯ por ejercicio: historial, reemplazar, ajustar descanso, subir, bajar y sacar (ninguna acción se pierde)', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await empezar(page);
      const nombres = await page.evaluate(() => S.activeRtnSession.exOrder.map(id => sessExInfo(id).name));
      const menuDe = i => page.locator('.ses-ex').nth(i).getByRole('button', { name: /^Opciones de/ });
      await menuDe(1).click();
      await expect(page.locator('.ses-ex').nth(1).locator('.ses-menu button')).toHaveText(['Historial', 'Reemplazar (solo esta sesión)', 'Ajustar descanso / series', 'Subir', 'Bajar', 'Sacar de esta sesión']);
      await shot(page, `sesion-menu-ejercicio-${vp.w}`);
      // un solo menú abierto a la vez
      await menuDe(2).click();
      await expect(page.locator('.ses-ex .ses-menu:not([hidden])')).toHaveCount(1);
      // subir / bajar
      await page.locator('.ses-ex').nth(2).getByRole('button', { name: 'Subir' }).click();
      expect(await page.evaluate(() => S.activeRtnSession.exOrder.map(id => sessExInfo(id).name))).toEqual([nombres[0], nombres[2], nombres[1]]);
      await menuDe(0).click();
      await expect(page.locator('.ses-ex').first().getByRole('button', { name: 'Subir' })).toBeDisabled();
      await page.locator('.ses-ex').first().getByRole('button', { name: 'Bajar' }).click();
      expect(await page.evaluate(() => S.activeRtnSession.exOrder.map(id => sessExInfo(id).name))).toEqual([nombres[2], nombres[0], nombres[1]]);
      // "Fijar orden": solo aparece si el orden cambió y lo guarda en la rutina (⋯ de la sesión)
      await page.getByRole('button', { name: 'Más opciones de la sesión' }).click();
      await page.getByRole('button', { name: 'Fijar este orden en la rutina' }).click();
      expect(await page.evaluate(() => S.routines[0].exercises.map(e => sessExInfo(e.id).name))).toEqual([nombres[2], nombres[0], nombres[1]]);
      await page.getByRole('button', { name: 'Más opciones de la sesión' }).click();
      await expect(page.getByRole('button', { name: 'Fijar este orden en la rutina' })).toHaveCount(0);
      await page.mouse.click(5, 5);
      // ajustar descanso/series abre su modal; historial abre el historial del ejercicio; reemplazar abre el selector
      await menuDe(0).click();
      await page.locator('.ses-ex').first().getByRole('button', { name: 'Ajustar descanso / series' }).click();
      await expect(page.locator('#modal-rtn-ex.open')).toBeVisible();
      await page.evaluate(() => closeModal('modal-rtn-ex'));
      await menuDe(0).click();
      await page.locator('.ses-ex').first().getByRole('button', { name: 'Historial' }).click();
      await expect(page.locator('.modal-overlay.open').first()).toBeVisible();
      await page.evaluate(() => document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id)));
      await menuDe(0).click();
      await page.locator('.ses-ex').first().getByRole('button', { name: 'Reemplazar (solo esta sesión)' }).click();
      await expect(page.locator('#modal-ex-picker.open')).toBeVisible();
      await page.evaluate(() => closeModal('modal-ex-picker'));
      // sacar (con confirmación): no se guarda y la rutina queda intacta
      await menuDe(1).click();
      page.once('dialog', d => d.accept());
      await page.locator('.ses-ex').nth(1).getByRole('button', { name: 'Sacar de esta sesión' }).click();
      await expect(page.locator('.ses-ex')).toHaveCount(2);
      expect(await page.evaluate(() => S.routines[0].exercises.length)).toBe(3);
      // + Ejercicio abre el selector
      await page.getByRole('button', { name: '+ Ejercicio' }).click();
      await expect(page.locator('#modal-ex-picker.open')).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });

    test('cancelar sesión: ⋯ de la sesión, un toque corto NO cancela; mantener apretado ~0,5 s sí (sin guardar nada)', async ({ cmPage: page }) => {
      await preparar(page);
      await empezar(page);
      await descansoCorto(page, 30);
      await tildar(page, 0);                                                                   // hay un descanso corriendo: también se apaga
      await page.getByRole('button', { name: 'Más opciones de la sesión' }).click();
      const del = page.locator('#ses-menu .pe-del');
      await expect(del).toContainText('Cancelar sesión');
      const box = await del.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
      expect(await page.evaluate(() => !!S.activeRtnSession)).toBe(true);
      await shot(page, `sesion-menu-sesion-${vp.w}`);
      await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
      await expect.poll(() => page.evaluate(() => S.activeRtnSession)).toBeNull();
      expect(await page.evaluate(() => Object.keys(S.routineLog).length)).toBe(0);
      expect(await page.evaluate(() => Object.keys(_rtnTimers).length)).toBe(0);
      await expect(page.locator('#rutinas-wrap .pe-root')).toBeVisible();                       // vuelve al Inicio
    });

    test('FINALIZAR: se ilumina con todo tildado; guarda igual que antes + detalle opcional + fecha de INICIO; vuelve al Inicio con ✓', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await empezar(page);
      await descansoCorto(page, 5);
      const fin = page.getByRole('button', { name: 'FINALIZAR SESIÓN' });
      await expect(fin).not.toHaveClass(/ready/);
      const ids = await page.evaluate(() => S.activeRtnSession.exOrder.slice());
      // carga kg/reps del primer ejercicio y tilda todas las series de los tres
      for (let i = 0; i < 3; i++) {
        const ex = page.locator('.ses-ex').nth(i);
        if (i > 0) await ex.locator('.ses-exh').click();
        await ex.locator('[data-f=w]').first().fill('60');
        await ex.locator('[data-f=r]').first().fill('8');
        await ex.locator('.pe-ck').first().click();
      }
      await expect(fin).toHaveClass(/ready/);                                                  // se ilumina cuando todo está tildado
      await page.waitForTimeout(450);                                                          // deja terminar la transición de color del botón
      await shot(page, `sesion-lista-${vp.w}`);
      // la sesión empezó HOY a las 23:50 de hace 2 días → la fecha guardada es ese día
      const antes = await page.evaluate(() => { S.activeRtnSession.startedAt = Date.now() - 2 * 86400000 - 3600000; return localStr(new Date(S.activeRtnSession.startedAt)); });
      await fin.click();
      await expect(page.locator('#ses-sheet')).toBeVisible();
      await expect(page.locator('.ses-sheet-s')).toContainText('Duración');
      await shot(page, `sesion-finalizar-${vp.w}`);
      await page.fill('#ses-d-int', '11');
      await page.getByRole('button', { name: 'Guardar sesión' }).click();
      expect(await page.evaluate(() => !!S.activeRtnSession)).toBe(true);                       // 11 inválido: no guarda
      await page.fill('#ses-d-int', '8'); await page.fill('#ses-d-con', '7'); await page.fill('#ses-d-pro', 'Fuerza máxima');
      await page.getByRole('button', { name: 'Guardar sesión' }).click();
      const e = await page.evaluate(() => { const l = S.routineLog[S.routines[0].id]; return { n: l.length, e: l[0], hist: Object.keys(S.exerciseHistory).length, sess: S.activeRtnSession }; });
      expect(e.sess).toBeNull();
      expect(e.n).toBe(1);
      expect(e.e).toMatchObject({ date: antes, vol: 3 * 60 * 8, sets: 3, intensidad: 8, concentracion: 7, proposito: 'Fuerza máxima' });
      expect(e.e.duration).toBeGreaterThan(2 * 86400);
      expect(Object.keys(e.e.exSets)).toEqual(ids);
      expect(Object.keys(e.e).sort()).toEqual(['concentracion', 'date', 'duration', 'exSets', 'id', 'intensidad', 'proposito', 'sets', 'vol']);
      expect(e.hist).toBeGreaterThan(0);                                                        // historial global por ejercicio
      await expect(page.locator('#rutinas-wrap .pe-root')).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });

    test('FINALIZAR sin detalle: la entrada queda con el formato de siempre; hoy queda marcado ✓ en el Inicio', async ({ cmPage: page }) => {
      await preparar(page);
      await empezar(page);
      await page.locator('[data-f=w]').first().fill('40');
      await page.locator('[data-f=r]').first().fill('10');
      await page.getByRole('button', { name: 'FINALIZAR SESIÓN' }).click();
      await page.getByRole('button', { name: 'Guardar sesión' }).click();
      const e = await page.evaluate(() => S.routineLog[S.routines[0].id][0]);
      expect(Object.keys(e).sort()).toEqual(['date', 'duration', 'exSets', 'id', 'sets', 'vol']);   // sin campos opcionales vacíos
      expect(e.date).toBe(await page.evaluate(() => getActiveDate()));
      await expect(page.locator('#rutinas-wrap .pe-s.pe-hoy em')).toHaveText('✓');
      await expect(page.locator('#rutinas-wrap .pe-day-hoy')).toContainText('✓ Hecho');
      await shot(page, `sesion-vuelta-inicio-${vp.w}`);
    });

    test('Volver en la hoja de FINALIZAR no guarda y la sesión sigue', async ({ cmPage: page }) => {
      await preparar(page);
      await empezar(page);
      await page.getByRole('button', { name: 'FINALIZAR SESIÓN' }).click();
      await page.getByRole('button', { name: 'Volver' }).click();
      await expect(page.locator('#ses-sheet')).toHaveCount(0);
      expect(await page.evaluate(() => !!S.activeRtnSession && Object.keys(S.routineLog).length === 0)).toBe(true);
    });
  });
}
