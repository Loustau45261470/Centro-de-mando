// Entrenamiento · pestañas Progreso y Ejercicios (etapa 4): resumen por período con la MISMA lógica de estadísticas de siempre,
// evolución por ejercicio con crosshair HUD, entrenos por semana, músculos (6 + "Ver los N"), actividades del plan, récords (4 + "Ver todos"),
// mapa muscular plegable; Ejercicios con buscador, filtros, último peso, historial y "+ Nuevo". Datos inventados.
// Capturas si ENTRENO_CAPTURAS apunta a una carpeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const CAPT = process.env.ENTRENO_CAPTURAS || '';
const shot = async (page, nombre) => { if (!CAPT) return; fs.mkdirSync(CAPT, { recursive: true }); await page.screenshot({ path: path.join(CAPT, nombre + '.png') }); };
const sinScrollH = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
test.describe.configure({ timeout: 60000 });

// 2 rutinas; la primera con 6 ejercicios y 10 sesiones repartidas en ~100 días (series con peso creciente), la segunda con 2 sesiones.
// Historial por ejercicio (exerciseHistory) para los 2 primeros; 3 actividades del plan hechas (una con detalle).
async function preparar(page) {
  await page.evaluate(() => {
    initRoutines();
    const off = n => { const d = new Date(); d.setDate(d.getDate() - n); return localStr(d); };
    const [r0, r1] = S.routines;
    r0.name = 'Empuje'; r0.icon = '💪'; r1.name = 'Tirón'; r1.icon = '🔗';
    // 7 ejercicios de músculos distintos en Empuje y 2 más en Tirón (para que haya más de 6 músculos y más de 4 récords)
    const todos = S.routines.flatMap(r => r.exercises), vistos = new Set(), pick = [];
    todos.forEach(e => { const m = (exLibById(e.libId) || {}).muscle; if (m && !vistos.has(m) && pick.length < 9) { vistos.add(m); pick.push(e); } });
    r0.exercises = pick.slice(0, 7); r1.exercises = pick.slice(7, 9);
    S.routines = [r0, r1]; S.activeRtnSession = null; S.planEntreno = PlanEntreno.vacio();
    const dias = [2, 9, 16, 23, 31, 45, 60, 75, 90, 100];
    S.routineLog = {}; S.exerciseHistory = {};
    S.routineLog[r0.id] = dias.slice().reverse().map((n, k) => ({
      id: 'x' + k, date: off(n), duration: 3000 + k * 60, sets: 12 + k, vol: 4000 + k * 150,
      exSets: Object.fromEntries(r0.exercises.map((e, j) => [e.id, [{ weight: 40 + k * 2.5 + j, reps: 8 }, { weight: 40 + k * 2.5 + j, reps: 6 }]])),
      ...(k === 9 ? { intensidad: 8, concentracion: 7 } : {}),
    }));
    S.routineLog[r1.id] = [88, 3].map((n, k) => ({ id: 'y' + k, date: off(n), duration: 2400, sets: 8, vol: 2500,
      exSets: Object.fromEntries(r1.exercises.map(e => [e.id, [{ weight: 30, reps: 10 }]])) }));
    [r0.exercises[0], r0.exercises[1]].forEach((e, j) => {
      S.exerciseHistory[e.libId] = dias.slice().reverse().map((n, k) => ({ date: off(n), routineId: r0.id, sets: [{ weight: 40 + k * 2.5 + j, reps: 8 }, { weight: 40 + k * 2.5 + j - 5, reps: 10 }] }));
    });
    S.actividadesHechas = {};
    [['boxeo', 4, { intensidad: 8, concentracion: 6 }], ['boxeo', 11, {}], ['resistencia', 6, { intensidad: 6 }]].forEach(([clave, n, det]) => {
      const f = off(n), uid = 'ah' + f + clave + 'manana';
      S.actividadesHechas[uid] = { fecha: f, clave, franja: 'manana', ...det };
    });
    S._testNombres = r0.exercises.map(e => exDisplay(e).name);
    saveState();
    if (window.openGymOverlay) openGymOverlay();
    renderRutinas();
  });
  await page.waitForSelector('#rutinas-wrap .pe-root');
}
const irA = async (page, nombre) => { await page.locator('#rutinas-wrap .pe-tab', { hasText: nombre }).click(); await page.waitForSelector(nombre === 'Progreso' ? '#prg-resumen' : '#prg-liblist'); };

// Lo que calculaba la pantalla vieja (rutinas.js antes de la etapa 4), copiado tal cual, sobre el mismo estado.
const viejoResumen = (page, periodo) => page.evaluate(p => {
  const days = { mes: 30, trimestre: 90, semestre: 180, año: 365 };
  const c = new Date(); c.setDate(c.getDate() - days[p]); const cs = c.toISOString().slice(0, 10);
  const f = S.routines.map(r => (S.routineLog[r.id] || []).filter(e => e.date >= cs));
  const sess = f.reduce((a, h) => a + h.length, 0), vol = f.reduce((a, h) => a + h.reduce((b, e) => b + (e.vol || 0), 0), 0);
  const sets = f.reduce((a, h) => a + h.reduce((b, e) => b + (e.sets || 0), 0), 0), time = f.reduce((a, h) => a + h.reduce((b, e) => b + (e.duration || 0), 0), 0);
  const th = Math.floor(time / 3600), tm = Math.floor((time % 3600) / 60);
  return [String(sess), vol === 0 ? '0' : vol >= 1000 ? `${(vol / 1000).toFixed(1)}t` : vol.toLocaleString(), String(sets), time === 0 ? '—' : (th > 0 ? `${th}h ${tm}m` : `${tm}m`)];
}, periodo);

for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  test.describe(`Progreso y Ejercicios · ${vp.w}px`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    test('Progreso: el resumen de cada período (1M/3M/6M/1A) coincide con la lógica de estadísticas de siempre', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await irA(page, 'Progreso');
      const periodos = [['mes', '1M'], ['trimestre', '3M'], ['semestre', '6M'], ['año', '1A']];
      const vistos = [];
      for (const [k, t] of periodos) {
        await page.locator(`#prg-resumen .prg-chip[data-p="${k}"]`).click();
        const esperado = await viejoResumen(page, k);
        vistos.push(esperado);
        await expect(page.locator(`#prg-resumen .prg-chip[data-p="${k}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#prg-resumen .prg-num')).toHaveText(esperado, { timeout: 5000 });   // el descifrado termina en el valor real
        expect(t).toBeTruthy();
      }
      expect(new Set(vistos.map(v => v.join('|'))).size).toBeGreaterThan(2);   // los períodos realmente difieren (el test no es trivial)
      expect(await sinScrollH(page)).toBe(true);
      expect(consoleErrors).toEqual([]);
    });

    test('Progreso: evolución por ejercicio con crosshair HUD que engancha cada sesión (etiqueta "kg · hace N ses.")', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await irA(page, 'Progreso');
      const info = await page.evaluate(() => {
        const ses = S.exerciseHistory[document.querySelector('#prg-evo .prg-chip.on').dataset.ex].slice(-12);
        return ses.map(e => Math.max(...e.sets.map(s => s.weight)));
      });
      expect(info.length).toBe(10);
      const svg = page.locator('#prg-ch svg');
      await expect(svg).toBeVisible();
      await expect(page.locator('#prg-clab')).toHaveText(/ · última$/);   // arranca en la última sesión
      const box = await svg.boundingBox();
      for (let i = 0; i < info.length; i++) {
        const x = box.x + (22 + i * (276 / (info.length - 1))) / 320 * box.width;
        await page.mouse.move(x, box.y + box.height / 2);
        const atras = info.length - 1 - i;
        await expect(page.locator('#prg-clab')).toHaveText(`${String(info[i]).replace('.', ',')} kg · ${atras === 0 ? 'última' : 'hace ' + atras + ' ses.'}`);
      }
      // la línea punteada acompaña al punto
      const cx = await page.evaluate(() => [document.getElementById('prg-cxl').getAttribute('x1'), document.getElementById('prg-cxc').getAttribute('cx')]);
      expect(cx[0]).toBe(cx[1]);
      // otro ejercicio con historial: cambia la serie
      const otro = page.locator('#prg-evo .prg-chip:not(.on)').first();
      await otro.click();
      await expect(page.locator('#prg-clab')).toHaveText(/kg · última/);
      await shot(page, `progreso-crosshair-${vp.w}`);
      expect(consoleErrors).toEqual([]);
    });

    test('Progreso: semanas (12 columnas), músculos 6 + "Ver los N", actividades con promedios, récords 4 + "Ver todos" con NUEVO', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await irA(page, 'Progreso');
      await page.locator('#prg-resumen .prg-chip[data-p="año"]').click();
      await expect(page.locator('#prg-semanas .prg-wcol > div')).toHaveCount(12);
      const sem = await page.locator('#prg-semanas .prg-wcol > div').evaluateAll(els => els.map(e => +e.dataset.n));
      // esperado calculado aparte (lunes a domingo, la última columna es la semana de hoy)
      const esperadoSem = await page.evaluate(() => {
        const t = new Date(); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));   // lunes de esta semana
        const fechas = Object.values(S.routineLog).flat().map(e => e.date), out = [];
        for (let k = 11; k >= 0; k--) { const a = new Date(t); a.setDate(a.getDate() - 7 * k); const b = new Date(a); b.setDate(b.getDate() + 6); out.push(fechas.filter(f => f >= localStr(a) && f <= localStr(b)).length); }
        return out;
      });
      expect(sem).toEqual(esperadoSem);
      expect(sem.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(3);
      // músculos
      const nMus = await page.locator('#prg-musculos .prg-mus').count();
      expect(nMus).toBeGreaterThan(6);
      await expect(page.locator('#prg-musculos .prg-mus:visible')).toHaveCount(6);
      await page.getByRole('button', { name: `Ver los ${nMus} músculos` }).click();
      await expect(page.locator('#prg-musculos .prg-mus:visible')).toHaveCount(nMus);
      // actividades: boxeo x2 (cardio 1 resistencia / combate 2), con promedio de intensidad y concentración
      const act = page.locator('#prg-actividades');
      await expect(act).toContainText('Boxeo');
      await expect(act).toContainText('2 veces · int 8,0 · conc 6,0');
      await expect(act).toContainText('Resistencia');
      await expect(act).toContainText('Rutinas de gimnasio');
      await expect(act.locator('.prg-st3 b')).toHaveText(['1', '2', '0']);   // cardio · combate · fuerza
      // récords
      const nRec = await page.locator('#prg-records .prg-rec2').count();
      expect(nRec).toBe(await page.evaluate(() => S.routines[0].exercises.length + S.routines[1].exercises.length));
      expect(nRec).toBeGreaterThan(4);
      await expect(page.locator('#prg-records .prg-rec2:visible')).toHaveCount(4);
      await expect(page.locator('#prg-records .prg-new').first()).toHaveText('NUEVO');
      await page.getByRole('button', { name: `Ver todos (${nRec})` }).click();
      await expect(page.locator('#prg-records .prg-rec2:visible')).toHaveCount(nRec);
      await shot(page, `progreso-${vp.w}`);
      expect(await sinScrollH(page)).toBe(true);
      expect(consoleErrors).toEqual([]);
    });

    test('Progreso: el mapa muscular (3 vistas + video 360) está dentro de una sección plegable y se abre', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await irA(page, 'Progreso');
      await expect(page.locator('#scan-stage')).toHaveCount(0);   // cerrado por defecto
      await page.locator('#prg-mapa .prg-fold').click();
      await expect(page.locator('#prg-mapa .spin-video')).toBeAttached();
      await expect(page.locator('#scan-stage .scan-view')).toHaveCount(3);
      await expect(page.locator('#prg-mapa .scan-dot')).toHaveCount(3);
      expect(await page.evaluate(() => !!window.SCAN_DATA && Object.keys(SCAN_DATA.counts).length > 0)).toBe(true);
      await page.locator('#prg-mapa .scan-dot').nth(1).click();
      await expect(page.locator('#scan-stage .scan-view.active')).toHaveAttribute('data-idx', '1');
      await shot(page, `progreso-mapa-${vp.w}`);
      expect(await sinScrollH(page)).toBe(true);
      await page.locator('#prg-mapa .prg-fold').click();
      await expect(page.locator('#scan-stage')).toHaveCount(0);
      expect(consoleErrors).toEqual([]);
    });

    test('Progreso: en compu va en 2 columnas; en celular, en 1', async ({ cmPage: page }) => {
      await preparar(page);
      await irA(page, 'Progreso');
      const x = await page.evaluate(() => [...document.querySelectorAll('.prg-col')].map(c => Math.round(c.getBoundingClientRect().left)));
      if (vp.w >= 900) expect(x[1]).toBeGreaterThan(x[0] + 300); else expect(x[1]).toBe(x[0]);
    });

    test('Ejercicios: buscador (sin tildes), chips de grupo y equipo, último peso, historial al tocar y "+ Nuevo"', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await irA(page, 'Ejercicios');
      const total = await page.locator('#prg-liblist .prg-ex').count();
      expect(total).toBeGreaterThan(10);
      // buscar
      const nombre = await page.evaluate(() => S._testNombres[0]);
      await page.fill('#prg-q', nombre.slice(0, 5).toUpperCase());
      const hallados = await page.locator('#prg-liblist .prg-ex').count();
      expect(hallados).toBeGreaterThan(0); expect(hallados).toBeLessThan(total);
      await expect(page.locator('#prg-liblist .prg-ex').first()).toContainText(nombre.slice(0, 5), { ignoreCase: true });
      await page.fill('#prg-q', 'zzzz-no-existe');
      await expect(page.locator('#prg-liblist')).toContainText('No hay ejercicios con ese filtro');
      await page.fill('#prg-q', '');
      await expect(page.locator('#prg-liblist .prg-ex')).toHaveCount(total);
      // chips: grupo muscular y equipo (los filtros actuales)
      const musc = page.locator('.prg-flbl', { hasText: 'Grupo muscular' }).locator('+ .prg-chips .prg-chip').nth(1);
      const grupo = (await musc.textContent()).trim();
      await musc.click();
      const filtradoM = await page.locator('#prg-liblist .prg-ex').count();
      expect(filtradoM).toBeLessThan(total);
      await expect(page.locator('#prg-liblist .prg-ex-t small').first()).toContainText(grupo);
      await expect(page.locator('.prg-chip.on', { hasText: grupo })).toHaveCount(1);
      await page.locator('.prg-flbl', { hasText: 'Grupo muscular' }).locator('+ .prg-chips .prg-chip').first().click();   // "Todos"
      await expect(page.locator('#prg-liblist .prg-ex')).toHaveCount(total);
      await page.locator('.prg-flbl', { hasText: 'Equipamiento' }).locator('+ .prg-chips .prg-chip', { hasText: 'Barra' }).click();
      const barra = await page.locator('#prg-liblist .prg-ex').count();
      expect(barra).toBeLessThan(total);
      await expect(page.locator('#prg-liblist .prg-ex-t small').first()).toContainText('Barra');
      await page.locator('.prg-flbl', { hasText: 'Equipamiento' }).locator('+ .prg-chips .prg-chip').first().click();
      // último peso / marca: el ejercicio con historial muestra su mejor peso de la última sesión; sin historial, "—"
      const esperado = await page.evaluate(() => { const l = S.routines[0].exercises[0].libId, h = S.exerciseHistory[l]; return { id: l, w: String(Math.max(...h[h.length - 1].sets.map(s => s.weight))).replace('.', ',') + ' kg' }; });
      await expect(page.locator(`#prg-liblist .prg-ex[data-id="${esperado.id}"] .prg-ex-w`)).toHaveText(esperado.w);
      await expect(page.locator('#prg-liblist .prg-ex-w', { hasText: '—' }).first()).toBeVisible();
      await shot(page, `ejercicios-${vp.w}`);
      expect(await sinScrollH(page)).toBe(true);
      // tocar abre el historial
      await page.locator(`#prg-liblist .prg-ex[data-id="${esperado.id}"] .prg-ex-t`).click();
      await expect(page.locator('#modal-ex-hist')).toHaveClass(/open|show|active/);
      await expect(page.locator('#modal-ex-hist-title')).toHaveText(nombre);
      await page.evaluate(() => closeModal('modal-ex-hist'));
      // editar y "+ Nuevo" abren el formulario de la biblioteca
      await page.locator(`#prg-liblist .prg-ex[data-id="${esperado.id}"] .prg-ico`).first().click();
      await expect(page.locator('#modal-lib-ex')).toHaveClass(/open|show|active/);
      await page.evaluate(() => closeModal('modal-lib-ex'));
      await page.getByRole('button', { name: '+ Nuevo' }).click();
      await expect(page.locator('#modal-lib-ex')).toHaveClass(/open|show|active/);
      await expect(page.locator('#modal-lib-ex-title')).toHaveText('Nuevo ejercicio');
      expect(consoleErrors).toEqual([]);
    });
  });
}
