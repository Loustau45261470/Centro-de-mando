// Recordatorios que se repiten: alta desde el modal con texto vivo, lista con 🔁 y próxima hora, aviso local a la hora (reloj simulado),
// «Hecho» sobre una ocurrencia sin borrar el repetido, pausa, eliminación y 390 px. Datos de ejemplo inventados.
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-24';   // martes
const A = (h, m) => new Date(2026, 10, 24, h, m || 0);

test.describe('recordatorios que se repiten', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'una sola vez alcanza (el 390 px se prueba adentro)'); });

  async function preparar(page) {
    await page.clock.setFixedTime(A(9, 5));
    await page.evaluate(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      localStorage.removeItem('cdm_avisosVistos');
      avisosNubeSet({});
      S.reminders = { vida: [] }; S.foco = Object.assign(S.foco || {}, { config: { horas: [] } }); S.registros = []; S.principios = null;   // sin registros: el principal tomó las horas de Foco y avisaría por su cuenta
      window.__notifs = []; window._showNotif = (t, o) => window.__notifs.push({ t, tag: o && o.tag, body: o && o.body });
      openAddReminder('vida');
    });
    await expect(page.locator('#modal-reminder')).toBeVisible();
  }
  const fijar = (page, d) => page.clock.setFixedTime(d);

  async function crear(page) {
    await page.fill('#remTitle', 'Tomar agua');
    await page.check('#remRepOn');
    await page.fill('#remRepCada', '2');
    await page.selectOption('#remRepUnidad', 'h');
    await page.fill('#remRepDesde', '09:00');
    await page.fill('#remRepHasta', '21:00');
    await page.click('#remRepDias [data-d="6"]');
    await page.click('#remRepDias [data-d="0"]');
    await page.click('#modal-reminder .btn-primary');
    await expect(page.locator('#modal-reminder')).not.toBeVisible();
  }

  test('modal: la casilla va chica a la derecha y el texto vivo sigue lo que se elige', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    await expect(page.locator('#remRepBody')).toBeHidden();
    const lbl = await page.locator('.rem-rep-head > span').boundingBox();
    await page.check('#remRepOn');
    const chk = await page.locator('#remRepOn').boundingBox();
    expect(chk.width).toBeLessThanOrEqual(18);
    expect(chk.x).toBeGreaterThan(lbl.x + lbl.width);            // a la derecha del texto, nunca a la izquierda
    await expect(page.locator('#remRepBody')).toBeVisible();
    await expect(page.locator('#remRepDias .rem-dia')).toHaveText(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    await expect(page.locator('#remRepTxt')).toHaveText('Te aviso cada 2 h, de 9 a 21, todos los días');
    await page.click('#remRepDias [data-d="6"]');
    await page.click('#remRepDias [data-d="0"]');
    await expect(page.locator('#remRepTxt')).toHaveText('Te aviso cada 2 h, de 9 a 21, de lunes a viernes');
    await page.fill('#remRepCada', '30'); await page.selectOption('#remRepUnidad', 'min');
    await expect(page.locator('#remRepTxt')).toHaveText('Te aviso cada 30 min, de 9 a 21, de lunes a viernes');
    await page.fill('#remRepCada', '10');
    await expect(page.locator('#remRepTxt')).toContainText('mínimo es cada 15');
    await page.selectOption('#remRepUnidad', 'd'); await page.fill('#remRepCada', '3');
    await expect(page.locator('#remRepVentana')).toBeHidden();
    await expect(page.locator('#remRepDias')).toBeHidden();
    await expect(page.locator('#remRepTxt')).toContainText('cada 3 días');
    // Hora de fin anterior a la de inicio: se explica y no deja guardar.
    await page.selectOption('#remRepUnidad', 'h'); await page.fill('#remRepCada', '2');
    await page.fill('#remRepDesde', '22:00'); await page.fill('#remRepHasta', '08:00');
    await expect(page.locator('#remRepTxt')).toContainText('medianoche');
    await page.fill('#remTitle', 'Algo');
    await page.click('#modal-reminder .btn-primary');
    await expect(page.locator('#modal-reminder')).toBeVisible();
    expect(await page.evaluate(() => S.reminders.vida.length)).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('alta, lista con 🔁 y próxima hora, aviso local una sola vez por ocurrencia', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    await crear(page);
    const r = await page.evaluate(() => S.reminders.vida[0]);
    expect(r.title).toBe('Tomar agua');
    expect(r.datetime).toBe(HOY + 'T09:00');                       // sin fecha elegida: empieza hoy, a la hora de inicio
    expect(r.repetir).toEqual({ cada: 2, unidad: 'h', desde: '09:00', hasta: '21:00', dias: [1, 2, 3, 4, 5] });

    await page.evaluate(() => openRemindersOverlay('vida'));
    const fila = page.locator('#reminders-wrap-vida .rem-rep-item');
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText('🔁 cada 2 h');
    await expect(fila).toContainText('Próxima: hoy 11:00');
    await expect(page.locator('#reminders-wrap-vida')).toContainText('Se repiten');

    // 09:05: el aviso de las 09:00 sale una vez aunque la comprobación corra varias veces.
    await page.evaluate(() => { checkReminderNotifications(); checkReminderNotifications(); });
    expect(await page.evaluate(() => window.__notifs.map((n) => n.tag))).toEqual([r.id + '@' + HOY + 'T09:00']);
    // 11:02: la siguiente ocurrencia, con su propia clave.
    await fijar(page, A(11, 2));
    await page.evaluate(() => { checkReminderNotifications(); checkReminderNotifications(); });
    const tags = await page.evaluate(() => window.__notifs.map((n) => n.tag));
    expect(tags).toEqual([r.id + '@' + HOY + 'T09:00', r.id + '@' + HOY + 'T11:00']);
    expect(await page.evaluate(() => window.__notifs[1].body)).toContain('Tomar agua');
    expect(consoleErrors).toEqual([]);
  });

  test('«Hecho» da por vista esa vez sin borrar el repetido; pausar y reactivar; eliminar', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    await crear(page);
    await page.evaluate(() => openRemindersOverlay('vida'));
    await fijar(page, A(11, 20));
    await page.evaluate(() => renderReminders('vida'));
    const fila = page.locator('#reminders-wrap-vida .rem-rep-item');
    await expect(fila).toContainText('Toca ahora · 11:00');
    await fila.locator('.rem-rep-ok').click();
    await expect(fila).toHaveCount(1);                              // el repetido sigue
    await expect(fila.locator('.rem-rep-ok')).toHaveCount(0);        // y ya no pide marcar esa vez
    await expect(fila).toContainText('Próxima: hoy 13:00');
    const vis = await page.evaluate(() => S.reminders.vida.map((x) => x.repetir.visto));
    expect(vis).toEqual([HOY + 'T11:00']);
    // Lo ya visto no avisa.
    await page.evaluate(() => { window.__notifs.length = 0; checkReminderNotifications(); });
    expect(await page.evaluate(() => window.__notifs.length)).toBe(0);

    // Pausa: no avisa ni muestra próxima; reactivar lo devuelve.
    await fila.locator('.rem-rep-pausa').click();
    await expect(fila).toContainText('En pausa');
    await expect(fila).not.toContainText('Próxima');
    await fijar(page, A(13, 1));
    await page.evaluate(() => { window.__notifs.length = 0; checkReminderNotifications(); });
    expect(await page.evaluate(() => window.__notifs.length)).toBe(0);
    await fila.locator('.rem-rep-pausa').click();
    await expect(fila).toContainText('Próxima: hoy 15:00');
    await page.evaluate(() => { checkReminderNotifications(); });
    expect(await page.evaluate(() => window.__notifs.map((n) => n.tag.slice(-5)))).toEqual(['13:00']);

    // Eliminar: botón claro y el recordatorio desaparece.
    await expect(fila.locator('.rem-rep-del')).toHaveAttribute('aria-label', /Eliminar/);
    await fila.locator('.rem-rep-del').click();
    await expect(fila).toHaveCount(0);
    expect(await page.evaluate(() => S.reminders.vida.length)).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('editar un repetido carga sus datos y se puede apagar la repetición', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    await crear(page);
    const id = await page.evaluate(() => S.reminders.vida[0].id);
    await page.evaluate((i) => openEditReminder('vida', i), id);
    await expect(page.locator('#remRepOn')).toBeChecked();
    await expect(page.locator('#remRepTxt')).toHaveText('Te aviso cada 2 h, de 9 a 21, de lunes a viernes');
    await page.uncheck('#remRepOn');
    await page.click('#modal-reminder .btn-primary');
    expect(await page.evaluate(() => S.reminders.vida[0].repetir)).toBeUndefined();
    await page.evaluate(() => openRemindersOverlay('vida'));
    await expect(page.locator('#reminders-wrap-vida .rem-rep-item')).toHaveCount(0);   // ahora es un recordatorio común
    expect(consoleErrors).toEqual([]);
  });

  test('390 px: el modal y la fila entran sin scroll horizontal', async ({ cmPage: page, consoleErrors }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparar(page);
    await page.fill('#remTitle', 'Tomar agua con un nombre bastante largo para ver cómo se parte la fila en el celular');
    await page.check('#remRepOn');
    const caja = await page.locator('#modal-reminder .modal').boundingBox();
    expect(caja.x + caja.width).toBeLessThanOrEqual(390);
    for (const sel of ['#remRepCada', '#remRepUnidad', '#remRepDesde', '#remRepHasta', '#remRepFin', '#remRepDias .rem-dia:last-child']) {
      const b = await page.locator(sel).boundingBox();
      expect(b.x + b.width, sel).toBeLessThanOrEqual(caja.x + caja.width + 1);
      expect(b.width, sel).toBeGreaterThan(20);
    }
    expect(await page.evaluate(() => { const m = document.querySelector('#modal-reminder .modal'); return m.scrollWidth <= m.clientWidth + 1; })).toBe(true);
    await page.locator('#modal-reminder .modal').screenshot({ path: test.info().outputPath('modal-390.png') });
    await page.click('#modal-reminder .btn-primary');
    await page.evaluate(() => openRemindersOverlay('vida'));
    const fila = page.locator('#reminders-wrap-vida .rem-rep-item');
    await expect(fila).toBeVisible();
    for (const sel of ['.rem-rep-pausa', '.rem-rep-del']) {
      const b = await fila.locator(sel).boundingBox();
      expect(b.x + b.width, sel).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('lista-390.png') });
    expect(consoleErrors).toEqual([]);
  });
});
