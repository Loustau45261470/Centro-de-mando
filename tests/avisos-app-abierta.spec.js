// Avisos con la app abierta (tanda N2): resumen al volver (8), avisos ya mostrados persistentes y compartidos (9),
// aviso a otros dispositivos al terminar pomodoro/descanso (10), permiso de notificaciones (12) y recarga diferida (14).
'use strict';
const { test, expect, completeLoginOverlay, waitForBoot } = require('./support/fixtures');

test.describe('avisos con la app abierta', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'una sola vez alcanza'); });

  // Estado limpio: permiso concedido, sin avisos vistos, sin tarjetas, una sola lista de recordatorios propia.
  async function preparar(page, permiso) {
    await page.evaluate((perm) => {
      Object.defineProperty(Notification, 'permission', { get: () => perm, configurable: true });
      localStorage.removeItem('cdm_avisosVistos'); localStorage.removeItem('cdm_avisoNotifDia');
      document.getElementById('avisos-app') && document.getElementById('avisos-app').remove();
      avisosNubeSet({}); _avUlt = 0; _avResumenItems = [];
      window.__notifs = []; window._showNotif = (t, o) => window.__notifs.push({ t, tag: o && o.tag });
    }, permiso || 'granted');
  }
  // Recordatorio con fecha a `min` minutos del "ahora" local.
  function ponerRec(page, id, titulo, min) {
    return page.evaluate(([i, t, m]) => {
      const d = new Date(Date.now() + m * 60000), p = n => String(n).padStart(2, '0');
      const dt = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
      S.reminders = { vida: [{ id: i, title: t, datetime: dt, priority: 'media' }] };
      return dt;
    }, [id, titulo, min]);
  }

  test('8: reloj +40 min con algo vencido en el medio, al volver aparece UN solo resumen con ese ítem', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage);
    await ponerRec(cmPage, 'rec_av8', 'Pagar patente XYZ', 15);
    await cmPage.evaluate(() => { const real = Date.now; window.__real = real; Date.now = () => real.call(Date) + 40 * 60000; document.dispatchEvent(new Event('visibilitychange')); });
    const r = cmPage.locator('#av-resumen');
    await expect(r).toBeVisible();
    await expect(r).toContainText('Mientras no estabas');
    await expect(r).toContainText('Pagar patente XYZ');
    // Otros eventos de regreso no lo repiten ni crean un segundo resumen.
    await cmPage.evaluate(() => { _avUlt = 0; window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('resume')); });
    await cmPage.waitForTimeout(400);
    await expect(cmPage.locator('#av-resumen')).toHaveCount(1);
    await expect(cmPage.locator('#av-resumen .av-row', { hasText: 'Pagar patente XYZ' })).toHaveCount(1);
    expect(await cmPage.evaluate(() => window.__notifs.filter(n => String(n.tag).startsWith('rec_av8')).length)).toBe(0);   // no hay además una notificación suelta
    expect(consoleErrors).toEqual([]);
  });

  test('8: ventana local de 20 min — vencido hace 10 min se avisa como notificación, hace 25 min solo en el resumen', async ({ cmPage }) => {
    await preparar(cmPage);
    await ponerRec(cmPage, 'rec_av8b', 'Hace 10', -10);
    await cmPage.evaluate(() => checkReminderNotifications());
    expect(await cmPage.evaluate(() => window.__notifs.filter(n => String(n.tag).startsWith('rec_av8b')).length)).toBe(1);
    await ponerRec(cmPage, 'rec_av8c', 'Hace 25', -25);
    await cmPage.evaluate(() => checkReminderNotifications());
    expect(await cmPage.evaluate(() => window.__notifs.filter(n => String(n.tag).startsWith('rec_av8c')).length)).toBe(0);
    await cmPage.evaluate(() => avisosAlVolver());
    await expect(cmPage.locator('#av-resumen')).toContainText('Hace 25');
  });

  test('9: un aviso ya mostrado no vuelve tras recargar la página', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage);
    await ponerRec(cmPage, 'rec_av9', 'Aviso persistente', -1);
    await cmPage.evaluate(() => checkReminderNotifications());
    expect(await cmPage.evaluate(() => window.__notifs.filter(n => String(n.tag).startsWith('rec_av9')).length)).toBe(1);
    const guardado = await cmPage.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cdm_avisosVistos'))));
    expect(guardado.some(k => k.startsWith('rec_av9@'))).toBe(true);
    await cmPage.reload();
    await waitForBoot(cmPage);
    await completeLoginOverlay(cmPage);
    await cmPage.evaluate(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      window.__notifs = []; window._showNotif = (t, o) => window.__notifs.push({ t, tag: o && o.tag });
    });
    await ponerRec(cmPage, 'rec_av9', 'Aviso persistente', -1);
    await cmPage.evaluate(() => { checkReminderNotifications(); });
    expect(await cmPage.evaluate(() => window.__notifs.filter(n => String(n.tag).startsWith('rec_av9')).length)).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('9: la poda borra lo vencido hace más de 3 días y las claves de otra pestaña/nube no se repiten', async ({ cmPage }) => {
    await preparar(cmPage);
    const dt = await ponerRec(cmPage, 'rec_av9b', 'Otra pestaña', -1);
    // Otra pestaña ya tomó el aviso.
    await cmPage.evaluate(([k]) => localStorage.setItem('cdm_avisosVistos', JSON.stringify({ [k]: [Date.now(), 'otraPestana'], vieja: [Date.now() - 4 * 86400000, 'x'] })), ['rec_av9b@' + dt]);
    await cmPage.evaluate(() => checkReminderNotifications());
    expect(await cmPage.evaluate(() => window.__notifs.length)).toBe(0);
    // Un nuevo claim poda la clave de hace 4 días.
    expect(await cmPage.evaluate(() => _notifiedSet.claim('otra@2026-01-01T10:00'))).toBe(true);
    expect(await cmPage.evaluate(() => _notifiedSet.claim('otra@2026-01-01T10:00'))).toBe(false);
    const ks = await cmPage.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cdm_avisosVistos'))));
    expect(ks).not.toContain('vieja');
    expect(ks).toContain('rec_av9b@' + dt);
  });

  test('9: una clave que el push ya avisó (notifiedReminders de la nube) no se muestra, ni en notificación ni en el resumen', async ({ cmPage }) => {
    await preparar(cmPage);
    const dtA = await ponerRec(cmPage, 'rec_av9c', 'Ya avisado por push', -1);
    await cmPage.evaluate(([k]) => avisosNubeSet({ [k]: true }), ['rec_av9c@' + dtA]);
    await cmPage.evaluate(() => checkReminderNotifications());
    expect(await cmPage.evaluate(() => window.__notifs.length)).toBe(0);
    // Resumen: vencido hace 30 min, y el documento del servidor (solo lectura) trae la clave que el push marcó mientras dormía.
    const dtB = await ponerRec(cmPage, 'rec_av9d', 'Push mientras dormía', -30);
    await cmPage.evaluate(([k]) => {
      _db.collection = () => ({ doc: () => ({ get: (o) => { window.__getOpts = o; return Promise.resolve({ exists: true, data: () => ({ notifiedReminders: { [k]: true } }) }); } }) });
    }, ['rec_av9d@' + dtB]);
    await cmPage.evaluate(() => avisosAlVolver());
    await cmPage.waitForTimeout(500);
    await expect(cmPage.locator('#av-resumen')).toHaveCount(0);
    expect(await cmPage.evaluate(() => window.__getOpts)).toEqual({ source: 'server' });
  });

  test('10: terminar una fase del pomodoro con la pestaña viva no cancela el aviso a los otros dispositivos; resetear a propósito sí', async ({ cmPage, consoleErrors }) => {
    await cmPage.evaluate(() => {
      window.__fetches = [];
      _db.collection = () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ pushSubscriptions: { dOtro: { sub: { endpoint: 'https://push.otro.invalido/x', keys: { p256dh: 'a', auth: 'b' } } } } }) }) }) });
      window.fetch = (u, init) => { window.__fetches.push({ u: String(u), body: init && init.body ? JSON.parse(init.body) : null }); return Promise.resolve({ ok: true }); };
      window._pushWorkerToken = async () => 'tok';
      _swReg = { pushManager: { getSubscription: async () => ({ endpoint: 'https://push.propio.invalido/x', keys: { p256dh: 'p', auth: 'a' } }) } };
      Pomodoro.start();
    });
    await expect.poll(() => cmPage.evaluate(() => window.__fetches.length)).toBe(1);
    // Vence la fase de estudio en vivo.
    await cmPage.evaluate(() => { const real = Date.now; Date.now = () => real.call(Date) + 3 * 3600000; });
    await expect.poll(() => cmPage.evaluate(() => window.__fetches.filter(f => f.u.includes('/schedule/')).length), { timeout: 8000 }).toBe(2);
    const f1 = await cmPage.evaluate(() => ({ f: window.__fetches, id: _pushDeviceId() }));
    expect(f1.f.some(f => f.u.includes('/cancel/'))).toBe(false);                                  // no se canceló nada al vencer
    expect(f1.f[0].u.endsWith('/schedule/pomo-' + f1.id + '-e')).toBe(true);                       // fin de estudio
    expect(f1.f[1].u.endsWith('/schedule/pomo-' + f1.id + '-d')).toBe(true);                       // el descanso usa OTRO timer: no pisa al que acaba de vencer
    expect(f1.f[0].body.subscriptions.map(s => s.endpoint)).toContain('https://push.otro.invalido/x');
    // Reset a propósito: cancela los dos timers.
    await cmPage.evaluate(() => Pomodoro.reset());
    await expect.poll(() => cmPage.evaluate(() => window.__fetches.filter(f => f.u.includes('/cancel/')).length)).toBe(2);
    const c = await cmPage.evaluate(() => ({ u: window.__fetches.filter(f => f.u.includes('/cancel/')).map(f => f.u), id: _pushDeviceId() }));
    expect(c.u.some(u => u.endsWith('/cancel/pomo-' + c.id + '-e'))).toBe(true);
    expect(c.u.some(u => u.endsWith('/cancel/pomo-' + c.id + '-d'))).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('10: descanso de rutina — al vencer en vivo no cancela el aviso del Worker; saltarlo a propósito sí', async ({ cmPage }) => {
    await cmPage.evaluate(() => {
      window.__fetches = [];
      window.fetch = (u, init) => { window.__fetches.push({ u: String(u) }); return Promise.resolve({ ok: true }); };
      window._pushWorkerToken = async () => 'tok';
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      window._showNotif = () => {};
      document.body.insertAdjacentHTML('beforeend', '<div id="rtn-tband-ex1"><span id="rtn-tband-display-ex1"></span></div>');
      _rtnTimers['ex1'] = setInterval(() => {}, 100000); _rtnTimerEndsAt['ex1'] = Date.now() - 1000;
      _rtnTimerTick('ex1', 'Press');
    });
    await cmPage.waitForTimeout(300);
    expect(await cmPage.evaluate(() => window.__fetches.filter(f => f.u.includes('/cancel/')).length)).toBe(0);
    await cmPage.evaluate(() => skipRtnTimer('ex1'));
    await expect.poll(() => cmPage.evaluate(() => window.__fetches.filter(f => f.u.includes('/cancel/')).length)).toBe(1);
  });

  test('12: permiso denegado — tarjeta cerrable una sola vez por día', async ({ cmPage, consoleErrors }) => {
    await preparar(cmPage, 'denied');
    await cmPage.evaluate(() => checkReminderNotifications());
    const a = cmPage.locator('#av-permiso');
    await expect(a).toBeVisible();
    await expect(a).toContainText('bloqueadas en este dispositivo');
    await a.locator('.av-x').click();
    await expect(cmPage.locator('#av-permiso')).toHaveCount(0);
    await cmPage.evaluate(() => { checkReminderNotifications(); avisoPermisoNotif(); });
    await expect(cmPage.locator('#av-permiso')).toHaveCount(0);                           // mismo día: no vuelve
    await cmPage.evaluate(() => { localStorage.setItem('cdm_avisoNotifDia', '2000-01-01'); avisoPermisoNotif(); });
    await expect(cmPage.locator('#av-permiso')).toBeVisible();                            // otro día: vuelve
    expect(consoleErrors).toEqual([]);
  });

  test('12: iPhone sin la app instalada — pide agregarla a la pantalla de inicio', async ({ cmPage }) => {
    await preparar(cmPage, 'denied');
    await cmPage.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', configurable: true });
      Object.defineProperty(navigator, 'standalone', { get: () => false, configurable: true });
      delete window.Notification;
      avisoPermisoNotif();
    });
    const a = cmPage.locator('#av-permiso');
    await expect(a).toBeVisible();
    await expect(a).toContainText('pantalla de inicio');
    await expect(a).not.toContainText('bloqueadas');
  });

  test('14: controllerchange con un modal abierto no recarga y avisa; al cerrar el modal recarga', async ({ cmPage, consoleErrors }) => {
    await cmPage.evaluate(() => {
      window.__rec = 0; window._swRecargar = () => { window.__rec++; };
      _swRefreshing = false; clearInterval(_swPendTid); _swPendTid = null;
      window.__ov = document.querySelector('.modal-overlay'); window.__ov.classList.add('open');
      _swControllerCambio();
    });
    await expect(cmPage.locator('#av-update')).toContainText('Hay una versión nueva');
    await cmPage.waitForTimeout(2200);
    expect(await cmPage.evaluate(() => window.__rec)).toBe(0);
    await cmPage.evaluate(() => window.__ov.classList.remove('open'));
    await expect.poll(() => cmPage.evaluate(() => window.__rec), { timeout: 6000 }).toBe(1);
    await cmPage.waitForTimeout(2200);
    expect(await cmPage.evaluate(() => window.__rec)).toBe(1);                              // una sola vez
    expect(consoleErrors).toEqual([]);
  });

  test('14: con foco en un campo de texto no recarga; al soltar el foco sí; sin nada abierto recarga al instante', async ({ cmPage }) => {
    await cmPage.evaluate(() => {
      window.__rec = 0; window._swRecargar = () => { window.__rec++; };
      _swRefreshing = false; clearInterval(_swPendTid); _swPendTid = null;
      document.body.insertAdjacentHTML('beforeend', '<input id="av-test-input" type="text" style="position:fixed;bottom:0;left:0">');
      document.getElementById('av-test-input').focus();
      _swControllerCambio();
    });
    await expect(cmPage.locator('#av-update')).toBeVisible();
    await cmPage.waitForTimeout(2000);
    expect(await cmPage.evaluate(() => window.__rec)).toBe(0);
    await cmPage.evaluate(() => document.getElementById('av-test-input').blur());
    await expect.poll(() => cmPage.evaluate(() => window.__rec), { timeout: 6000 }).toBe(1);
    // Sin nada abierto (y sin guardado en curso): recarga en el acto.
    await cmPage.evaluate(() => {
      window.__rec = 0; _swRefreshing = false; clearInterval(_swPendTid); _swPendTid = null;
      document.getElementById('av-test-input').remove(); document.getElementById('av-update') && document.getElementById('av-update').remove();
    });
    await expect.poll(() => cmPage.evaluate(() => !_fbSaveTid && !_fbSaveInProgress)).toBe(true);
    await cmPage.evaluate(() => _swControllerCambio());
    expect(await cmPage.evaluate(() => window.__rec)).toBe(1);
  });
});
