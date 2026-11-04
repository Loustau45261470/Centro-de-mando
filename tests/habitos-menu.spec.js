// Menú de un día del calendario de hábitos: un toque abre las opciones y se elige una
// (en vez de ciclar con varios toques). Hábito sembrado de Salud (habit-entrenamientos).
'use strict';
const { test, expect } = require('./support/fixtures');

const HID = 'habit-entrenamientos';
const estado = (page) =>
  page.evaluate((id) => {
    const h = S.habitTrackers.salud.find((x) => x.id === id);
    return h.days[window.getActiveDate()] || null;
  }, HID);

// Deja el día de hoy con el estado dado, repinta y devuelve la celda de hoy.
async function celdaHoy(page, st) {
  await page.evaluate(([id, s]) => {
    const h = S.habitTrackers.salud.find((x) => x.id === id);
    const ds = window.getActiveDate();
    if (s) h.days[ds] = s; else delete h.days[ds];
    renderHabitCal('salud');
  }, [HID, st]);
  return page.locator('#habit-cal-salud .study-cal-day.today-cell .study-cal-dot');
}

// Celda de un día anterior (hoy - 1) dejada sin marca.
async function celdaAyer(page) {
  await page.evaluate((id) => {
    const h = S.habitTrackers.salud.find((x) => x.id === id);
    const d = new Date(window.getActiveDate() + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    delete h.days[d.toLocaleDateString('sv')];
    renderHabitCal('salud');
  }, HID);
  return page
    .locator('#habit-cal-salud .study-cal-day.today-cell')
    .locator('xpath=preceding-sibling::div[1]')
    .locator('.study-cal-dot');
}

const menu = (page) => page.locator('.hdm-menu');

test('un toque abre el menú con las 4 opciones y, sin marca, sin Borrar', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const c = await celdaHoy(cmPage, null);
  await c.click();
  await expect(menu(cmPage)).toHaveCount(1);
  await expect(menu(cmPage)).toHaveAttribute('role', 'menu');
  await expect(menu(cmPage).locator('[role="menuitem"]')).toHaveText([/Hecho/, /Parcial/, /No lo hice/, /Descanso/]);
  await expect(menu(cmPage).locator('.hdm-clear')).toHaveCount(0);
  // el primer toque NO marca nada
  expect(await estado(cmPage)).toBeNull();
  // foco en la primera opción
  await expect(menu(cmPage).locator('.hdm-item').first()).toBeFocused();
});

test('elegir cada opción aplica el estado y cierra; Borrar lo quita', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  for (const st of ['partial', 'missed', 'rest', 'done']) {
    const c = await celdaHoy(cmPage, null);
    await c.click();
    await menu(cmPage).locator(`[data-st="${st}"]`).click();
    await expect(menu(cmPage)).toHaveCount(0);
    expect(await estado(cmPage)).toBe(st);
  }
  // con marca: aparece Borrar y la opción actual queda marcada
  const c = cmPage.locator('#habit-cal-salud .study-cal-day.today-cell .study-cal-dot');
  await c.click({ force: true }); // el punto "hecho" pulsa (animación)
  await expect(menu(cmPage).locator('[data-st="done"]')).toHaveClass(/is-current/);
  await menu(cmPage).locator('.hdm-clear').click();
  await expect(menu(cmPage)).toHaveCount(0);
  expect(await estado(cmPage)).toBeNull();
});

test('un día guardado como "studied" se muestra como Hecho en el menú', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const c = await celdaHoy(cmPage, 'studied');
  await c.click({ force: true }); // el punto "hecho" pulsa (animación): Playwright no lo ve estable
  await expect(menu(cmPage).locator('[data-st="done"]')).toHaveClass(/is-current/);
});

test('Escape, tocar afuera y volver a tocar la celda cierran sin cambiar nada', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const c = await celdaHoy(cmPage, 'partial');

  await c.click();
  await expect(menu(cmPage)).toHaveCount(1);
  await cmPage.keyboard.press('Escape');
  await expect(menu(cmPage)).toHaveCount(0);

  await c.click();
  await expect(menu(cmPage)).toHaveCount(1);
  await cmPage.mouse.click(2, 2);
  await expect(menu(cmPage)).toHaveCount(0);

  // Volver a tocar la celda cierra (solo popover: la hoja inferior tapa la celda con su fondo)
  if (!(await menu(cmPage).count()) && cmPage.viewportSize().width > 480) {
    await c.click();
    await expect(menu(cmPage)).toHaveCount(1);
    await c.click();
    await expect(menu(cmPage)).toHaveCount(0);
  }

  expect(await estado(cmPage)).toBe('partial');
});

test('un solo menú abierto a la vez', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const ayer = await celdaAyer(cmPage);
  await ayer.click();
  await expect(menu(cmPage)).toHaveCount(1);
  // abrir otro (por la vía directa: en mobile el fondo de la hoja tapa las celdas)
  await cmPage.evaluate(() => openHabitDayMenu(document.querySelector('#habit-cal-salud .today-cell .study-cal-dot'), 'salud', 'habit-entrenamientos', window.getActiveDate()));
  await expect(menu(cmPage)).toHaveCount(1);
  await cmPage.evaluate(() => closeHabitDayMenu());
  await expect(menu(cmPage)).toHaveCount(0);
});

test('el festejo salta solo al pasar a Hecho hoy', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const llamadas = async (st, previo) => {
    const c = await celdaHoy(cmPage, previo);
    await cmPage.evaluate(() => {
      window.__cel = 0;
      window.celebrateHabit = () => { window.__cel++; };
    });
    await c.click({ force: true }); // si ya estaba hecho el punto pulsa (animación)
    await menu(cmPage).locator(`[data-st="${st}"]`).click();
    return cmPage.evaluate(() => window.__cel);
  };
  expect(await llamadas('done', null)).toBe(1);
  expect(await llamadas('partial', null)).toBe(0);
  expect(await llamadas('done', 'done')).toBe(0); // ya estaba hecho
  expect(await llamadas('done', 'partial')).toBe(1);
});

test('menú dentro de pantalla y sin scroll horizontal (mobile = hoja inferior)', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const c = await celdaHoy(cmPage, null);
  await c.scrollIntoViewIfNeeded();
  await c.click();
  const caja = await menu(cmPage).boundingBox();
  const vp = cmPage.viewportSize();
  expect(caja.x).toBeGreaterThanOrEqual(0);
  expect(caja.y).toBeGreaterThanOrEqual(0);
  expect(caja.x + caja.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(caja.y + caja.height).toBeLessThanOrEqual(vp.height + 0.5);
  if (vp.width <= 480) await expect(menu(cmPage)).toHaveClass(/hdm-sheet/);
  const sobra = await cmPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(sobra).toBeLessThanOrEqual(0);
});

test('celdas futuras no tienen menú', async ({ cmPage }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  await celdaHoy(cmPage, null);
  const n = await cmPage.evaluate(
    () => [...document.querySelectorAll('#habit-cal-salud .study-cal-dot.future')].filter((d) => d.getAttribute('onclick')).length
  );
  expect(n).toBe(0);
});

test('sin errores de consola al usar el menú', async ({ cmPage, consoleErrors }) => {
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const c = await celdaHoy(cmPage, null);
  await c.click();
  await menu(cmPage).locator('[data-st="rest"]').click();
  expect(consoleErrors).toEqual([]);
});

test('un scroll que mueve la celda (ej. el scroll suave tras cambiar de pestaña) no cierra el menú: lo acompaña', async ({ cmPage, isMobile }) => {
  test.skip(isMobile, 'en mobile es hoja inferior: no sigue a la celda');
  await cmPage.click('.nav-btn[data-tab="salud"]');
  const c = await celdaHoy(cmPage, null);
  await c.click();
  await expect(menu(cmPage)).toHaveCount(1);
  const antes = await menu(cmPage).evaluate((m) => m.getBoundingClientRect().top);
  await cmPage.evaluate(() => { window.scrollBy(0, 40); window.dispatchEvent(new Event('scroll')); });
  await cmPage.waitForTimeout(100);
  await expect(menu(cmPage)).toHaveCount(1);
  const despues = await menu(cmPage).evaluate((m) => m.getBoundingClientRect().top);
  const celda = await c.evaluate((x) => x.getBoundingClientRect().bottom);
  expect(Math.abs(despues - (celda + 6)) < 2 || despues !== antes).toBe(true);
  await menu(cmPage).getByRole('menuitem', { name: /Parcial/ }).click();
  expect(await estado(cmPage)).toBe('partial');
});
