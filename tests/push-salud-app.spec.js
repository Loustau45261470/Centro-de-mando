// Lado app de la salud del push: resuscripción automática del dispositivo muerto, aviso visible (pushHealth) y claves VAPID sin carrera.
'use strict';
const { test, expect } = require('./support/fixtures');

const EP_VIEJO = 'https://push.vieja.invalido/x';
const EP_NUEVO = 'https://push.nueva.invalido/x';
const sub = (n) => ({ endpoint: 'https://push.' + n + '.invalido/x', keys: { p256dh: 'a', auth: 'b' } });

test.describe('push: salud en la app', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'una sola vez alcanza'); });

  // Documento falso con update() de caminos con puntos y borrado por sentinel; `get` registra las opciones recibidas.
  async function falsoDoc(page, inicial, opciones) {
    await page.evaluate(([ini, op]) => {
      const doc = JSON.parse(JSON.stringify(ini));
      window.__doc = doc; window.__upd = 0; window.__gets = []; window.__txUpd = 0; window.__fetches = [];
      firebase.firestore.FieldValue.delete = () => ({ __del: true });
      window.fetch = (u, init) => { window.__fetches.push(String(u)); return Promise.resolve({ ok: false }); };
      const aplicar = (d) => Object.keys(d).forEach((k) => {
        const p = k.split('.'); let o = doc;
        p.slice(0, -1).forEach((x) => { o = o[x] = o[x] || {}; });
        if (d[k] && d[k].__del) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = d[k];
      });
      const ref = {
        get: (o) => { window.__gets.push(o || null); return op.getFalla ? Promise.reject(new Error('offline')) : Promise.resolve({ exists: true, data: () => JSON.parse(JSON.stringify(doc)) }); },
        update: (d) => { window.__upd++; aplicar(d); return Promise.resolve(); },
        firestore: { runTransaction: async (fn) => {
          // Entre la lectura inicial y la transacción "otro dispositivo" guardó sus claves.
          if (op.otroGuarda) doc.vapidKeys = op.otroGuarda;
          return fn({ get: async () => ({ data: () => JSON.parse(JSON.stringify(doc)) }), update: (_r, d) => { window.__txUpd++; aplicar(d); } });
        } },
      };
      _db.collection = () => ({ doc: () => ref });
    }, [inicial, opciones || {}]);
  }
  // Permiso concedido + suscripción del navegador con espías de unsubscribe/subscribe.
  async function navegador(page, endpointActual) {
    await page.evaluate(([epActual, epNuevo]) => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      window.__toasts = []; window.showToast = (m) => window.__toasts.push(String(m));
      window.__unsub = 0; window.__subs = 0;
      const actual = epActual ? { endpoint: epActual, keys: { p256dh: 'p', auth: 'a' }, unsubscribe: async () => { window.__unsub++; return true; } } : null;
      _swReg = { pushManager: {
        getSubscription: async () => actual,
        subscribe: async () => { window.__subs++; return { endpoint: epNuevo, keys: { p256dh: 'p', auth: 'a' } }; },
      } };
    }, [endpointActual, EP_NUEVO]);
  }

  test('dispositivo cuya entrada borró el cron por muerta: descarta el endpoint viejo, crea uno nuevo, limpia el fallo y avisa', async ({ cmPage }) => {
    const id = await cmPage.evaluate(() => _pushDeviceId());
    await falsoDoc(cmPage, {
      vapidKeys: { pubKey: 'AAAA', sigKey: 'k' },
      pushSubscriptions: { dOtro: { sub: sub('otro'), ua: 'Windows', updatedAt: 1 } },   // la propia ya no está
      pushHealth: { fallos: { [id]: { n: 1, code: 410, dead: true, at: 1, ua: 'iPhone' } } },
      pushDead: { at: 'x', code: 410 },
    });
    await navegador(cmPage, EP_VIEJO);
    await cmPage.evaluate(() => _asegurarPushDispositivo());
    const r = await cmPage.evaluate(() => ({ doc: window.__doc, unsub: window.__unsub, subs: window.__subs, toasts: window.__toasts, gets: window.__gets }));
    expect(r.unsub).toBe(1);                       // el endpoint muerto del navegador se descartó
    expect(r.subs).toBe(1);                        // y se creó uno nuevo
    expect(r.doc.pushSubscriptions[id].sub.endpoint).toBe(EP_NUEVO);
    expect(r.doc.pushSubscriptions.dOtro).toBeTruthy();   // la del otro dispositivo, intacta
    expect(r.doc.pushHealth.fallos[id]).toBeUndefined();
    expect(r.doc.pushDead).toBeUndefined();
    expect(r.toasts.some((m) => m.includes('se renovaron'))).toBe(true);
    expect(r.gets[0]).toEqual({ source: 'server' });       // lee del servidor, no de la caché local
  });

  test('sin entrada propia ni fallo registrado (dispositivo previo al mapa): renueva en silencio, sin toast', async ({ cmPage }) => {
    await falsoDoc(cmPage, { vapidKeys: { pubKey: 'AAAA' }, pushSubscriptions: {} });
    await navegador(cmPage, EP_VIEJO);
    await cmPage.evaluate(() => _asegurarPushDispositivo());
    const r = await cmPage.evaluate(() => ({ doc: window.__doc, id: _pushDeviceId(), unsub: window.__unsub, toasts: window.__toasts }));
    expect(r.unsub).toBe(1);
    expect(r.doc.pushSubscriptions[r.id].sub.endpoint).toBe(EP_NUEVO);
    expect(r.toasts).toEqual([]);
  });

  test('si el servidor no responde no toca nada (una entrada "faltante" de la caché no obliga a resuscribir)', async ({ cmPage }) => {
    await falsoDoc(cmPage, { vapidKeys: { pubKey: 'AAAA' } }, { getFalla: true });
    await navegador(cmPage, EP_VIEJO);
    await cmPage.evaluate(() => _asegurarPushDispositivo());
    const r = await cmPage.evaluate(() => ({ upd: window.__upd, unsub: window.__unsub, subs: window.__subs }));
    expect(r).toEqual({ upd: 0, unsub: 0, subs: 0 });
  });

  test('entrada propia al día y sin fallos: no hace nada', async ({ cmPage }) => {
    const id = await cmPage.evaluate(() => _pushDeviceId());
    await falsoDoc(cmPage, { vapidKeys: { pubKey: 'AAAA' }, pushSubscriptions: { [id]: { sub: { endpoint: EP_VIEJO } } } });
    await navegador(cmPage, EP_VIEJO);
    await cmPage.evaluate(() => _asegurarPushDispositivo());
    expect(await cmPage.evaluate(() => ({ upd: window.__upd, unsub: window.__unsub }))).toEqual({ upd: 0, unsub: 0 });
  });

  test('aviso visible: otro dispositivo muerto → banner con el nombre; tocarlo lo oculta y borra solo esa entrada', async ({ cmPage }) => {
    await falsoDoc(cmPage, { pushHealth: { fallos: { dX: { n: 1, code: 410, dead: true, at: 1, ua: 'Windows' }, dY: { n: 2, code: 500, dead: false, at: 1, ua: 'Android' } } } });
    await cmPage.evaluate(() => pushDeadAviso(null, window.__doc.pushHealth));
    const b = cmPage.locator('#pushdead-banner');
    await expect(b).toBeVisible();
    await expect(b).toContainText('Windows');
    await expect(b).not.toContainText('Android');   // 2 fallos seguidos todavía no es visible
    await b.click();
    await expect.poll(() => cmPage.evaluate(() => Object.keys(window.__doc.pushHealth.fallos))).toEqual(['dY']);
    await cmPage.evaluate(() => pushDeadAviso(null, window.__doc.pushHealth));
    await expect(cmPage.locator('#pushdead-banner')).toHaveCount(0);
  });

  test('aviso visible: si el dispositivo afectado es este, el texto lo dice y ofrece reactivar; y se actualiza sin duplicar el banner', async ({ cmPage }) => {
    await falsoDoc(cmPage, {});
    const id = await cmPage.evaluate(() => _pushDeviceId());
    await cmPage.evaluate(([i]) => pushDeadAviso(null, { fallos: { dZ: { n: 3, code: 401, at: 1, ua: 'Mac' } } }), [id]);
    await expect(cmPage.locator('#pushdead-banner')).toContainText('Mac');
    await cmPage.evaluate(([i]) => pushDeadAviso(null, { fallos: { [i]: { n: 3, code: 401, at: 1, ua: 'iPhone' } } }), [id]);
    await expect(cmPage.locator('#pushdead-banner')).toHaveCount(1);
    await expect(cmPage.locator('#pushdead-banner')).toContainText('este dispositivo');
    await cmPage.evaluate(() => pushDeadAviso({ at: 'x', code: 410 }, null));
    await expect(cmPage.locator('#pushdead-banner')).toContainText('dejaron de llegar');   // pushDead (nadie recibe) sigue teniendo prioridad
  });

  test('VAPID: si ya hay claves en la nube se usan (no se generan nuevas)', async ({ cmPage }) => {
    await falsoDoc(cmPage, { vapidKeys: { pubKey: 'EXISTE', sigKey: 's' } });
    const keys = await cmPage.evaluate(() => _getOrCreateVapidKeys());
    expect(keys.pubKey).toBe('EXISTE');
    expect(await cmPage.evaluate(() => ({ upd: window.__upd, tx: window.__txUpd, g: window.__gets[0] }))).toEqual({ upd: 0, tx: 0, g: { source: 'server' } });
  });

  test('VAPID: carrera de dos dispositivos — si otro guardó entre la lectura y la escritura, gana el que ya está', async ({ cmPage }) => {
    await falsoDoc(cmPage, {}, { otroGuarda: { pubKey: 'DEL_OTRO', sigKey: 's2' } });
    const keys = await cmPage.evaluate(() => _getOrCreateVapidKeys());
    expect(keys.pubKey).toBe('DEL_OTRO');
    const r = await cmPage.evaluate(() => ({ tx: window.__txUpd, doc: window.__doc.vapidKeys }));
    expect(r.tx).toBe(0);                          // la transacción vio las del otro y no escribió
    expect(r.doc.pubKey).toBe('DEL_OTRO');
  });

  test('VAPID: sin claves en ningún lado se generan y se guardan una sola vez; sin conexión no se generan', async ({ cmPage }) => {
    await falsoDoc(cmPage, {});
    const keys = await cmPage.evaluate(() => _getOrCreateVapidKeys());
    expect(keys.pubKey.length).toBeGreaterThan(40);
    expect(await cmPage.evaluate(() => ({ tx: window.__txUpd, guardada: window.__doc.vapidKeys.pubKey }))).toEqual({ tx: 1, guardada: keys.pubKey });
    await falsoDoc(cmPage, {}, { getFalla: true });
    expect(await cmPage.evaluate(() => _getOrCreateVapidKeys())).toBeNull();
    expect(await cmPage.evaluate(() => window.__txUpd + window.__upd)).toBe(0);
  });
});
