// Robustez de sync (solo visibilidad): guard de tamaño medido en BYTES, errores del listener
// de onSnapshot y aviso de avisos caídos (pushDead). Ninguno cambia la lógica de merge/guardado.
'use strict';
const { test, expect } = require('./support/fixtures');

// Espera el próximo "guardar-fin" y devuelve su resultado.
async function guardarYEsperar(page) {
  await page.evaluate(() => { localStorage.setItem('_syncEvents', '[]'); saveState(); });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('_syncEvents') || '[]').some((e) => e.tipo === 'guardar-fin'), null, { timeout: 15000 });
  return page.evaluate(() => JSON.parse(localStorage.getItem('_syncEvents')).find((e) => e.tipo === 'guardar-fin').res);
}

const conTexto = (page, texto) => page.evaluate((t) => {
  S.notas = [{ id: 'n-bytes', categoria: 'aprendizaje', titulo: 'Nota grande', texto: t, fecha: '2026-11-04' }];
}, texto);

test.describe('guard de tamaño en bytes (R7)', () => {
  test('con tildes: pocos caracteres pero más de 900000 bytes → queda bloqueado', async ({ cmPage }) => {
    // 520000 "ñ" = 520000 caracteres (< 900000) pero ~1.04 MB en UTF-8.
    await conTexto(cmPage, 'ñ'.repeat(520000));
    const medidas = await cmPage.evaluate(() => {
      const s = JSON.stringify(S);
      return { chars: s.length, bytes: new TextEncoder().encode(s).length, medir: CMArchivo.medir().total, techo: CMArchivo.BLOQUEO };
    });
    expect(medidas.techo).toBe(900000);
    expect(medidas.chars).toBeLessThan(medidas.techo);
    expect(medidas.bytes).toBeGreaterThan(medidas.techo);
    expect(medidas.medir).toBe(medidas.bytes);   // archivo.js también mide bytes
    expect(await guardarYEsperar(cmPage)).toBe('bloqueado-tamano');
    expect(await cmPage.evaluate(() => localStorage.getItem('_pendingCloudSave'))).toBe('1');
  });

  test('con emojis (4 bytes cada uno) también se bloquea', async ({ cmPage }) => {
    await conTexto(cmPage, '😀'.repeat(250000));   // 500000 caracteres UTF-16, ~1 MB en UTF-8
    expect(await guardarYEsperar(cmPage)).toBe('bloqueado-tamano');
  });

  test('control: texto ASCII de 520000 bytes sigue guardando normal', async ({ cmPage }) => {
    await conTexto(cmPage, 'a'.repeat(520000));
    expect(await guardarYEsperar(cmPage)).toBe('ok');
  });
});

// Reemplaza el doc de Firestore por uno falso que captura los callbacks de onSnapshot y los
// update(); vuelve a arrancar el listener para poder dispararle errores y snapshots a mano.
async function engancharListener(page) {
  await page.evaluate(() => {
    window.__updates = [];
    _db.collection = () => ({
      doc: () => ({
        onSnapshot: (ok, err) => { window.__snap = { ok, err }; return () => {}; },
        update: (d) => { window.__updates.push(d); return Promise.resolve(); },
        get: () => Promise.resolve({ exists: false, data: () => undefined, metadata: {} }),
      }),
    });
    _startFirestoreSync();
  });
}
const toastTexto = (page) => page.evaluate(() => document.getElementById('toast').textContent);
const eventos = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('_syncEvents') || '[]').filter((e) => e.tipo === 'snapshot-error'));

test.describe('error del listener de onSnapshot (R8)', () => {
  test('permission-denied: registra el evento y muestra el aviso visible', async ({ cmPage }) => {
    await engancharListener(cmPage);
    await cmPage.evaluate(() => { localStorage.setItem('_syncEvents', '[]'); document.getElementById('toast').textContent = ''; window.__snap.err({ code: 'permission-denied' }); });
    expect((await eventos(cmPage)).map((e) => e.code)).toEqual(['permission-denied']);
    await expect(cmPage.locator('#toast')).toHaveClass(/show/);
    await expect(cmPage.locator('#toast')).toContainText('La sincronización en vivo se detuvo (permission-denied). Recargá la app.');
  });

  test('unavailable (error de red): se registra pero NO muestra aviso', async ({ cmPage }) => {
    await engancharListener(cmPage);
    await cmPage.evaluate(() => { localStorage.setItem('_syncEvents', '[]'); document.getElementById('toast').textContent = ''; window.__snap.err({ code: 'unavailable' }); });
    expect((await eventos(cmPage)).map((e) => e.code)).toEqual(['unavailable']);
    expect(await toastTexto(cmPage)).toBe('');
  });

  test('deadline-exceeded tampoco avisa; un error sin código sí', async ({ cmPage }) => {
    await engancharListener(cmPage);
    await cmPage.evaluate(() => { document.getElementById('toast').textContent = ''; window.__snap.err({ code: 'deadline-exceeded' }); });
    expect(await toastTexto(cmPage)).toBe('');
    await cmPage.evaluate(() => window.__snap.err(undefined));
    await expect(cmPage.locator('#toast')).toContainText('(desconocido)');
  });
});

test.describe('aviso de avisos caídos (pushDead)', () => {
  const snapConPushDead = (page, pd) => page.evaluate((x) => window.__snap.ok({ exists: true, data: () => ({ _dev: 'otro', pushDead: x }), metadata: {} }), pd);

  test('si el documento trae pushDead aparece el aviso; si lo borran, desaparece', async ({ cmPage }) => {
    await engancharListener(cmPage);
    await expect(cmPage.locator('#pushdead-banner')).toHaveCount(0);
    await snapConPushDead(cmPage, { at: '2026-11-04T12:00:00.000Z', code: 410 });
    const b = cmPage.locator('#pushdead-banner');
    await expect(b).toBeVisible();
    await expect(b).toContainText('Los avisos al celular dejaron de llegar. Tocá para reactivarlos.');
    await snapConPushDead(cmPage, { at: '2026-11-04T12:00:00.000Z', code: 410 });   // otro snapshot: no se duplica
    await expect(b).toHaveCount(1);
    await snapConPushDead(cmPage, undefined);
    await expect(cmPage.locator('#pushdead-banner')).toHaveCount(0);
  });

  test('tocar el aviso resuscribe (descarta la suscripción vieja) y borra pushDead del documento', async ({ cmPage }) => {
    await engancharListener(cmPage);
    await cmPage.evaluate(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      firebase.firestore.FieldValue = { delete: () => '__BORRAR__' };
      window.__unsub = 0;
      _swReg = { pushManager: {
        getSubscription: async () => ({ unsubscribe: async () => { window.__unsub++; } }),
        subscribe: async () => ({ endpoint: 'https://push.nuevo/abc', keys: { p256dh: 'p', auth: 'a' } }),
      } };
      window._getOrCreateVapidKeys = async () => ({ pubKey: 'AAAA' });
    });
    await snapConPushDead(cmPage, { at: '2026-11-04T12:00:00.000Z', code: 410 });
    await cmPage.locator('#pushdead-banner').click();
    await expect(cmPage.locator('#pushdead-banner')).toHaveCount(0);
    expect(await cmPage.evaluate(() => window.__unsub)).toBe(1);
    const upd = await cmPage.evaluate(() => window.__updates[0]);
    expect(upd.pushDead).toBe('__BORRAR__');
    expect(upd.pushSubscription.endpoint).toBe('https://push.nuevo/abc');
    await expect(cmPage.locator('#toast')).toContainText('Avisos reactivados');
  });
});
