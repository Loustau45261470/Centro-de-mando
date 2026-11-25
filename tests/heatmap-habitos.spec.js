// Mapa de calor de hábitos (HUD D6): solo hábitos de la sección, los descansos no cuentan, ola solo al entrar. Datos sembrados en memoria.
'use strict';
const { test, expect } = require('./support/fixtures');

const irA = async (page, tab) => {
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
};

// Siembra hábitos (en memoria) en `sec`: cada spec = { id, hoy: estado de hoy|null }; todos tienen un registro de hace 3 días (aplican desde ahí).
const sembrar = (page, sec, specs) => page.evaluate(([sec, specs]) => {
  const hoy = window.getActiveDate();
  const d = new Date(hoy + 'T00:00:00'); d.setDate(d.getDate() - 3);
  const ant = calDateStr(d.getFullYear(), d.getMonth(), d.getDate());
  S.habitTrackers[sec] = specs.map(s => ({ id: s.id, name: s.id, emoji: '📌', days: Object.assign({ [ant]: 'done' }, s.hoy ? { [hoy]: s.hoy } : {}) }));
  renderHabitCal(sec);
}, [sec, specs]);

const claseHoy = (page, sec) => page.locator(`#habit-heat-${sec} .hh-today`).getAttribute('class');

test('(a) el mapa de una sección usa solo los hábitos de esa sección', async ({ cmPage }) => {
  await irA(cmPage, 'salud');
  await sembrar(cmPage, 'salud', [{ id: 's1', hoy: 'done' }]);
  await sembrar(cmPage, 'vida', [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }, { id: 'v4' }]);
  expect(await claseHoy(cmPage, 'salud')).toContain('l4');
  // vida: 0 de 4 hoy -> nivel 0, no contaminado por el hecho de salud
  const vida = await cmPage.evaluate(() => { const r = habitHeatDay(_getHabits('vida'), getActiveDate(), getActiveDate()); return r; });
  expect(vida).toMatchObject({ n: 0, pts: 0, den: 4 });
});

test('(b) 5 hábitos, 3 en descanso y 2 hechos = nivel máximo', async ({ cmPage }) => {
  await irA(cmPage, 'salud');
  await sembrar(cmPage, 'salud', [
    { id: 'a', hoy: 'rest' }, { id: 'b', hoy: 'rest' }, { id: 'c', hoy: 'rest' }, { id: 'd', hoy: 'done' }, { id: 'e', hoy: 'done' },
  ]);
  expect(await claseHoy(cmPage, 'salud')).toContain('l4');
  const info = await cmPage.locator('#habit-heat-salud .hh-today').getAttribute('data-i');
  expect(info).toContain('2 de 2');
  expect(info).toContain('3 en descanso');
});

test('(c) todos en descanso = día neutro (ni 0% ni 100%)', async ({ cmPage }) => {
  await irA(cmPage, 'salud');
  await sembrar(cmPage, 'salud', [{ id: 'a', hoy: 'rest' }, { id: 'b', hoy: 'rest' }]);
  const cls = await claseHoy(cmPage, 'salud');
  expect(cls).toContain('neu');
  expect(cls).not.toMatch(/\bon\b|\bl\d\b/);
});

test('(d) 1 de 4 = nivel bajo', async ({ cmPage }) => {
  await irA(cmPage, 'salud');
  await sembrar(cmPage, 'salud', [{ id: 'a', hoy: 'done' }, { id: 'b' }, { id: 'c', hoy: 'missed' }, { id: 'd' }]);
  const cls = await claseHoy(cmPage, 'salud');
  expect(cls).toContain('l1');
  expect(await cmPage.locator('#habit-heat-salud .hh-today').getAttribute('data-i')).toContain('1 de 4');
});

test('(e) la ola se enciende al entrar a la sección y no al guardar', async ({ cmPage }) => {
  await irA(cmPage, 'vida');
  await cmPage.waitForTimeout(1500); // que cierre la ventana mo-in del arranque
  await irA(cmPage, 'salud');
  await sembrar(cmPage, 'salud', [{ id: 'a' }, { id: 'b' }]);
  const olas = () => cmPage.evaluate(() => document.getAnimations().filter(a => a.animationName === 'hh-on' && a.playState === 'running').length);
  await cmPage.click('.nav-btn[data-tab="vida"]');
  await cmPage.waitForTimeout(1500);
  await cmPage.click('.nav-btn[data-tab="salud"]');
  await expect.poll(olas, { timeout: 1500 }).toBeGreaterThan(0);
  await cmPage.waitForTimeout(1500);
  expect(await olas()).toBe(0);
  // guardar un día (re-render) no vuelve a animar
  await cmPage.evaluate(() => setHabitDay('salud', 'a', getActiveDate(), 'done', null));
  await cmPage.waitForTimeout(100);
  expect(await olas()).toBe(0);
  await expect(cmPage.locator('#habit-heat-salud .hh-today')).toHaveClass(/l2/);
});

test('(e2) con reduced-motion no hay ola ni latido', async ({ cmPage }) => {
  await cmPage.emulateMedia({ reducedMotion: 'reduce' });
  await irA(cmPage, 'vida');
  await irA(cmPage, 'salud');
  await sembrar(cmPage, 'salud', [{ id: 'a', hoy: 'done' }]);
  await cmPage.waitForTimeout(300);
  const n = await cmPage.evaluate(() => document.getAnimations().filter(a => /^hh-/.test(a.animationName || '') || (a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('hh-cell'))).length);
  expect(n).toBe(0);
});

test('(f) a 390 px no hay scroll horizontal y el mapa entra en el ancho', async ({ cmPage }) => {
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await irA(cmPage, 'salud');
  await sembrar(cmPage, 'salud', [{ id: 'a', hoy: 'done' }, { id: 'b' }]);
  await cmPage.waitForTimeout(900);
  const m = await cmPage.evaluate(() => {
    const g = document.querySelector('#habit-heat-salud .hh-grid').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, r: g.right, w: g.width };
  });
  expect(m.sw).toBeLessThanOrEqual(m.cw);
  expect(m.r).toBeLessThanOrEqual(m.cw);
});
