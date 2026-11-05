// Tareas del día con repetición por días de la semana (L M X J V S D), como las actividades del planner.
// Modelo: regla en S.goalRepeats + una instancia por día en S.goals[fecha] con id 'rep:<regla>:<fecha>' y repId.
// Las fechas se simulan reemplazando getActiveDate/getTomorrow (la app las usa para "hoy" y "mañana").
// 2026-11-08 es domingo; 09 lunes; 10 martes; 11 miércoles. Datos de ejemplo inventados.
'use strict';
const { test, expect } = require('./support/fixtures');

async function irAVida(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await expect(page.locator('#tab-vida')).toHaveClass(/active/);
}

// Fija "hoy" (y "mañana") y vuelve a pintar.
async function fijarDia(page, hoy) {
  await page.evaluate((h) => {
    const d = new Date(h + 'T00:00:00'); d.setDate(d.getDate() + 1);
    const m = localStr(d);
    window.getActiveDate = () => h;
    window.getTomorrow = () => m;
    renderGoals();
  }, hoy);
}

// Crea una tarea desde el modal "Nueva tarea — Hoy" marcando los días (valores getDay: 1=L ... 0=D).
async function crearRepetitiva(page, texto, dias, q = 'ui') {
  await page.click('#metas-readonly-card button:has-text("+ Tarea")');
  await page.fill('#newGoalText', texto);
  await page.selectOption('#newGoalQuad', q);
  for (const d of dias) await page.click(`#newGoalDays button[data-v="${d}"]`);
  await page.click('#modal-add-goal button:has-text("Agregar")');
  await expect(page.locator('#modal-add-goal')).not.toHaveClass(/open/);
}

const delDia = (page, fecha) => page.evaluate((f) => (S.goals[f] || []).map((g) => ({ id: g.id, text: g.text, done: g.done, q: g.q, repId: g.repId || null })), fecha);
const reglas = (page) => page.evaluate(() => S.goalRepeats.map((r) => ({ id: r.id, text: r.text, byDays: r.byDays, q: r.q, skips: r.skips })));

test('1) una tarea L-M-V aparece sola lunes y miércoles (con su texto y categoría) y no el martes', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await fijarDia(cmPage, '2026-11-08');                     // domingo: la regla se crea hoy pero no cae hoy
  await crearRepetitiva(cmPage, 'Ir al gimnasio de ejemplo', [1, 3, 5], 'ui');
  const [r] = await reglas(cmPage);
  expect(r.byDays.sort()).toEqual([1, 3, 5]);
  expect(await delDia(cmPage, '2026-11-08')).toEqual([]);   // domingo: nada
  expect((await delDia(cmPage, '2026-11-09')).map((g) => g.text)).toEqual(['Ir al gimnasio de ejemplo']);   // lunes, ya generado para "mañana"

  await fijarDia(cmPage, '2026-11-09');                     // lunes
  let lun = await delDia(cmPage, '2026-11-09');
  expect(lun).toHaveLength(1);
  expect(lun[0]).toMatchObject({ id: `rep:${r.id}:2026-11-09`, text: 'Ir al gimnasio de ejemplo', q: 'ui', repId: r.id, done: false });
  await expect(cmPage.locator('#metas-readonly-card .mrd-text')).toHaveText(['Ir al gimnasio de ejemplo']);
  await expect(cmPage.locator('#metas-readonly-card .tl-q[data-q="ui"] .mrd-item')).toHaveCount(1);
  await expect(cmPage.locator('#metas-readonly-card .goal-rep.on')).toHaveCount(1);   // indicador ↻

  await fijarDia(cmPage, '2026-11-10');                     // martes: hoy no cae
  expect(await delDia(cmPage, '2026-11-10')).toEqual([]);
  await expect(cmPage.locator('#metas-readonly-card .mrd-item')).toHaveCount(0);
  expect((await delDia(cmPage, '2026-11-11')).map((g) => g.repId)).toEqual([r.id]);   // y Plan Mañana (miércoles) ya la trae
  await expect(cmPage.locator('#tomorrowList .goal-item')).toHaveCount(1);
  await expect(cmPage.locator('#tomorrowList .goal-rep.on')).toHaveCount(1);

  await fijarDia(cmPage, '2026-11-11');                     // miércoles
  expect((await delDia(cmPage, '2026-11-11')).map((g) => g.text)).toEqual(['Ir al gimnasio de ejemplo']);
  expect(consoleErrors).toEqual([]);
});

test('2) sin duplicados: re-render, mismo id determinístico, estado releído y merge de sync', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await crearRepetitiva(cmPage, 'Todos los días de ejemplo', [1, 2, 3, 4, 5, 6, 0], 'ni');   // cae hoy y mañana sin importar la fecha real
  for (let i = 0; i < 3; i++) await cmPage.evaluate(() => renderGoals());
  const hoy = await cmPage.evaluate(() => getActiveDate());
  const man = await cmPage.evaluate(() => getTomorrow());
  const [r] = await reglas(cmPage);
  for (const f of [hoy, man]) {
    const a = await delDia(cmPage, f);
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe(`rep:${r.id}:${f}`);
  }

  // Recarga: el estado serializado (lo que viaja a localStorage/Firestore) y vuelto a leer no duplica ni pierde nada.
  // (Una recarga real no sirve de prueba en este arnés: la nube simulada vive en memoria y persistence.spec ya falla de base.)
  await cmPage.evaluate(() => { S = JSON.parse(JSON.stringify(S)); renderGoals(); renderGoals(); });
  expect(await reglas(cmPage)).toHaveLength(1);
  for (const f of [hoy, man]) expect(await delDia(cmPage, f)).toHaveLength(1);

  // Sincronización: la regla es una clave de primer nivel que el merge 3-vías conserva y el rescate suma por id.
  const m = await cmPage.evaluate(({ rid }) => {
    const local = JSON.parse(JSON.stringify(S));
    const cloud = JSON.parse(JSON.stringify(S)); delete cloud.goalRepeats;
    const base = JSON.parse(JSON.stringify(cloud));
    const tres = _mergeStates(base, local, cloud);
    const resc = _rescueLocal(cloud, local);
    return { tres: (tres.goalRepeats || []).map((x) => x.id), resc: (resc.goalRepeats || []).map((x) => x.id) };
  }, { rid: r.id });
  expect(m.tres).toEqual([r.id]);
  expect(m.resc).toEqual([r.id]);

  // Otro dispositivo que genere la misma instancia produce el mismo id: no queda doble.
  await cmPage.evaluate(({ f, rid }) => { S.goals[f] = S.goals[f].filter((g) => g.repId !== rid); ensureGoalRepeats(); ensureGoalRepeats(); }, { f: hoy, rid: r.id });
  expect((await delDia(cmPage, hoy)).map((g) => g.id)).toEqual([`rep:${r.id}:${hoy}`]);
  expect(consoleErrors).toEqual([]);
});

test('3) cada día tiene su propio hecho: marcarla el lunes no la marca el miércoles', async ({ cmPage }) => {
  await irAVida(cmPage);
  await fijarDia(cmPage, '2026-11-08');
  await crearRepetitiva(cmPage, 'Leer de ejemplo', [1, 3], 'ni');
  await fijarDia(cmPage, '2026-11-09');
  await cmPage.locator('#metas-readonly-card .mrd-check').click();
  expect((await delDia(cmPage, '2026-11-09'))[0].done).toBe(true);
  await fijarDia(cmPage, '2026-11-11');
  const mie = await delDia(cmPage, '2026-11-11');
  expect(mie).toHaveLength(1);
  expect(mie[0].done).toBe(false);
  await fijarDia(cmPage, '2026-11-09');                     // volver al lunes no la pisa ni la duplica
  const lun = await delDia(cmPage, '2026-11-09');
  expect(lun).toHaveLength(1);
  expect(lun[0].done).toBe(true);
});

test('4) borrar la instancia de un día no borra la regla ni se regenera ese día', async ({ cmPage }) => {
  await irAVida(cmPage);
  await fijarDia(cmPage, '2026-11-08');
  await crearRepetitiva(cmPage, 'Borrable de ejemplo', [1, 3], 'ni');
  await fijarDia(cmPage, '2026-11-09');
  await cmPage.evaluate(() => plannerOverlayOpen());
  await expect(cmPage.locator('#goalList .goal-item')).toHaveCount(1);
  await cmPage.evaluate(() => deleteGoal('2026-11-09', 0));
  await cmPage.evaluate(() => { renderGoals(); renderGoals(); });
  expect(await delDia(cmPage, '2026-11-09')).toEqual([]);   // ese lunes no vuelve
  const [r] = await reglas(cmPage);
  expect(r.skips).toEqual(['2026-11-09']);
  await fijarDia(cmPage, '2026-11-11');
  expect(await delDia(cmPage, '2026-11-11')).toHaveLength(1);   // el miércoles sí
});

test('5) editar días y "Dejar de repetir" desde el ↻ de la fila', async ({ cmPage, consoleErrors }) => {
  await irAVida(cmPage);
  await fijarDia(cmPage, '2026-11-08');
  await crearRepetitiva(cmPage, 'Rutina de ejemplo', [1, 3], 'un');
  await fijarDia(cmPage, '2026-11-09');                     // lunes; mañana (martes) no cae
  await cmPage.locator('#metas-readonly-card .goal-rep').click();
  await expect(cmPage.locator('#modal-goal-repeat')).toHaveClass(/open/);
  await expect(cmPage.locator('#goalRepText')).toHaveText('Rutina de ejemplo');
  await expect(cmPage.locator('#goalRepDays button.on')).toHaveCount(2);
  await cmPage.click('#goalRepDays button[data-v="2"]');    // + martes
  await cmPage.click('#modal-goal-repeat button:has-text("Guardar")');
  expect((await reglas(cmPage))[0].byDays.sort()).toEqual([1, 2, 3]);
  expect((await delDia(cmPage, '2026-11-10')).map((g) => g.text)).toEqual(['Rutina de ejemplo']);   // ya aparece en Plan Mañana

  await cmPage.locator('#metas-readonly-card .goal-rep').click();
  await cmPage.click('#modal-goal-repeat button:has-text("Dejar de repetir")');
  expect(await reglas(cmPage)).toEqual([]);
  expect((await delDia(cmPage, '2026-11-09')).map((g) => g.repId)).toEqual([null]);   // la de hoy queda como tarea común
  expect(await delDia(cmPage, '2026-11-10')).toEqual([]);                             // la de mañana, generada sola, se va
  await expect(cmPage.locator('#metas-readonly-card .goal-rep.on')).toHaveCount(0);
  await fijarDia(cmPage, '2026-11-11');
  expect(await delDia(cmPage, '2026-11-11')).toEqual([]);   // y no vuelve a aparecer
  expect(consoleErrors).toEqual([]);
});

test('6) una tarea común se vuelve repetitiva desde su ↻ (sin tocar el texto) y la categoría se conserva', async ({ cmPage }) => {
  await irAVida(cmPage);
  await fijarDia(cmPage, '2026-11-09');
  await cmPage.evaluate(() => { S.goals['2026-11-09'] = [{ id: 'c1', text: 'Común de ejemplo', done: false, priority: 'low', q: 'nn' }]; saveState(); renderGoals(); });
  await expect(cmPage.locator('#metas-readonly-card .goal-rep.on')).toHaveCount(0);
  await cmPage.locator('#metas-readonly-card .goal-rep').click();
  await expect(cmPage.locator('#goalRepStop')).toBeHidden();
  await cmPage.click('#goalRepDays button[data-v="1"]');    // lunes (hoy)
  await cmPage.click('#goalRepDays button[data-v="4"]');    // jueves
  await cmPage.click('#modal-goal-repeat button:has-text("Guardar")');
  const [r] = await reglas(cmPage);
  expect(r).toMatchObject({ text: 'Común de ejemplo', q: 'nn' });
  const lun = await delDia(cmPage, '2026-11-09');
  expect(lun).toHaveLength(1);
  expect(lun[0]).toMatchObject({ id: `rep:${r.id}:2026-11-09`, repId: r.id });
  await fijarDia(cmPage, '2026-11-12');                     // jueves
  expect(await delDia(cmPage, '2026-11-12')).toMatchObject([{ text: 'Común de ejemplo', q: 'nn' }]);
});

test('7) Plan Mañana: el modal también ofrece los días; sin días marcados no repite', async ({ cmPage }) => {
  await irAVida(cmPage);
  await fijarDia(cmPage, '2026-11-08');                     // mañana = lunes
  await cmPage.evaluate(() => plannerOverlayOpen());
  await cmPage.click('#tomorrow-card button:has-text("+ Tarea")');
  await cmPage.fill('#newGoalTextTom', 'Mañana común de ejemplo');
  await cmPage.click('#modal-add-goal-tom button:has-text("Agregar")');
  expect(await reglas(cmPage)).toEqual([]);
  expect((await delDia(cmPage, '2026-11-09')).map((g) => g.repId)).toEqual([null]);

  await cmPage.click('#tomorrow-card button:has-text("+ Tarea")');
  await cmPage.fill('#newGoalTextTom', 'Mañana repetitiva de ejemplo');
  await cmPage.click('#newGoalDaysTom button[data-v="1"]');
  await cmPage.click('#modal-add-goal-tom button:has-text("Agregar")');
  const [r] = await reglas(cmPage);
  expect(r.byDays).toEqual([1]);
  expect((await delDia(cmPage, '2026-11-09')).map((g) => g.repId).sort()).toEqual([null, r.id].sort());
});

test('8) la fila con el ↻ no desborda a 390 px y la casilla sigue al final a la derecha', async ({ cmPage }) => {
  await cmPage.setViewportSize({ width: 390, height: 800 });
  await irAVida(cmPage);
  await fijarDia(cmPage, '2026-11-08');
  await crearRepetitiva(cmPage, 'Una tarea repetitiva con un texto bastante largo para probar el ajuste de línea', [1], 'ui');
  await fijarDia(cmPage, '2026-11-09');
  const m = await cmPage.evaluate(() => {
    const row = document.querySelector('#metas-readonly-card .mrd-item');
    const r = row.getBoundingClientRect();
    const chk = row.querySelector('.mrd-check').getBoundingClientRect();
    const rep = row.querySelector('.goal-rep').getBoundingClientRect();
    return { fila: r.right, chkRight: chk.right, chkW: chk.width, repRight: rep.right, scroll: document.documentElement.scrollWidth, vw: window.innerWidth };
  });
  expect(m.scroll).toBeLessThanOrEqual(m.vw);
  expect(m.chkW).toBeLessThanOrEqual(24);
  expect(m.repRight).toBeLessThanOrEqual(m.chkRight);
  expect(m.chkRight).toBeLessThanOrEqual(m.fila + 1);
});
