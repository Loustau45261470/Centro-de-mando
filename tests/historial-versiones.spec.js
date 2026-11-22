// Historial y restaurar (historial-versiones.js): listar versiones, ver qué cambia, recuperar lo que falta,
// volver a una versión, copia previa y retención de _saveSnap.
'use strict';
const { test, expect } = require('./support/fixtures');

const H = 3600000;

// Siembra una versión vieja (copia del estado actual con una modificación) como doc snap_<t> + su entrada en el índice,
// igual que lo hace _saveSnap. (La reconstrucción del índice se prueba en el test de retención.)
async function sembrar(page, t, dev, mod) {
  await page.evaluate(async ([tt, d, m]) => {
    const st = JSON.parse(JSON.stringify(S));
    if (m === 'tareas') {
      st.goals = st.goals || {};
      st.goals['2026-11-21'] = [
        { id: 'viejo-1', text: 'Tarea vieja uno', done: false },
        { id: 'viejo-2', text: 'Tarea vieja dos', done: false },
        { id: 'viejo-3', text: 'Tarea vieja tres', done: true },
      ];
    }
    await _db.collection('appdata').doc('snap_' + tt).set({ state: JSON.stringify(st), savedAt: tt, _dev: d });
    await _db.collection('appdata').doc('snapidx').set({ items: firebase.firestore.FieldValue.arrayUnion({ id: 'snap_' + tt, t: tt, dev: d, n: 0 }) }, { merge: true });
  }, [t, dev, mod]);
}

// Algo cargado "después": existe hoy pero no en la versión vieja.
async function cargarMovimientoNuevo(page) {
  await page.evaluate(() => { S.transactions = [...S.transactions, { id: 'txn-despues', date: '2026-11-22', name: 'Claude', type: 'expense', amount: 40000, currency: 'ARS', accountId: 'acc-main' }]; });
}

async function abrirPorPaleta(page) {
  await page.keyboard.press('Control+k');
  await page.fill('#cmdk-input', 'Historial y restaurar');
  await expect(page.locator('.cmdk-item .ci-lbl', { hasText: /^Historial y restaurar$/ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hv-overlay.open')).toBeVisible();
}

const abrirDirecto = async (page) => { await page.evaluate(() => CMHistorial.open()); await expect(page.locator('#hv-overlay.open')).toBeVisible(); };

test.describe('historial y restaurar', () => {
  test('abre desde el panel de ajustes y desde la paleta de comandos', async ({ cmPage, consoleErrors }) => {
    await cmPage.locator('#theme-trigger').click();
    const btn = cmPage.locator('#theme-panel-historial');
    await expect(btn).toContainText('Historial y restaurar');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(cmPage.locator('#hv-overlay.open')).toBeVisible();
    await expect(cmPage.locator('#theme-panel')).not.toHaveClass(/open/);
    await expect(cmPage.locator('.hv-body')).toContainText('Ahora');
    await cmPage.keyboard.press('Escape');
    await expect(cmPage.locator('#hv-overlay')).not.toHaveClass(/open/);

    await abrirPorPaleta(cmPage);
    await cmPage.locator('#hv-overlay .sdiag-x').click();
    await expect(cmPage.locator('#hv-overlay')).not.toHaveClass(/open/);
    expect(consoleErrors).toEqual([]);
  });

  test('el detalle dice cuántas tareas faltan y cuántos movimientos se cargaron después, sin jerga', async ({ cmPage, consoleErrors }) => {
    const now = Date.now();
    await sembrar(cmPage, now - 5 * H, 'Equipo A', 'tareas');
    await sembrar(cmPage, now - 9 * H, 'Equipo B', null);
    await cargarMovimientoNuevo(cmPage);
    await abrirDirecto(cmPage);
    await expect(cmPage.locator('.hv-item', { hasText: 'Equipo' })).toHaveCount(2);
    await expect(cmPage.locator('.hv-item', { hasText: 'Equipo A' })).toContainText('guardado');
    await cmPage.locator('.hv-item', { hasText: 'Equipo A' }).click();
    const cambios = cmPage.locator('.hv-cambios');
    await expect(cambios).toContainText('Tareas: 3 que hoy no están');
    await expect(cambios).toContainText('Tarea vieja uno');
    await expect(cambios).toContainText('Movimientos: esa versión no tiene 1 que cargaste después');
    await expect(cambios).toContainText('Claude');
    await expect(cambios).toContainText('$40.000');
    const txt = (await cmPage.locator('#hv-overlay').innerText()).toLowerCase();
    for (const prohibida of ['snapshot', 'merge', 'firestore', 'sync', 'documento', 'json']) expect(txt, prohibida).not.toContain(prohibida);
    expect(consoleErrors).toEqual([]);
  });

  test('"Recuperar lo que falta" suma lo viejo y no borra lo nuevo; pide confirmación y deja copia', async ({ cmPage, consoleErrors }) => {
    const now = Date.now();
    await sembrar(cmPage, now - 5 * H, 'Equipo A', 'tareas');
    await cargarMovimientoNuevo(cmPage);
    await abrirDirecto(cmPage);
    await cmPage.locator('.hv-item', { hasText: 'Equipo A' }).click();
    await cmPage.locator('.hv-falta').click();
    await expect(cmPage.locator('.hv-confirmar')).toContainText('No se borra nada de lo nuevo');
    // Cancelar no toca nada.
    await cmPage.locator('.hv-no').click();
    expect(await cmPage.evaluate(() => (S.goals['2026-11-21'] || []).length)).toBe(0);
    await cmPage.locator('.hv-falta').click();
    await cmPage.locator('.hv-si').click();
    await expect(cmPage.locator('#hv-overlay')).not.toHaveClass(/open/);
    const r = await cmPage.evaluate(() => ({
      tareas: (S.goals['2026-11-21'] || []).map(g => g.id),
      conTxnNueva: S.transactions.some(t => t.id === 'txn-despues'),
    }));
    expect(r.tareas).toEqual(['viejo-1', 'viejo-2', 'viejo-3']);
    expect(r.conTxnNueva, 'lo cargado después sigue').toBe(true);
    await expect(cmPage.locator('.toast, #toast, [class*="toast"]').filter({ hasText: 'Listo' }).first()).toBeVisible();
    await cmPage.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress, null, { timeout: 20000 });
    expect(consoleErrors).toEqual([]);
  });

  test('"Volver a esta versión" deja exactamente esa versión y antes guarda una copia "antes de restaurar"', async ({ cmPage, consoleErrors }) => {
    const now = Date.now();
    await sembrar(cmPage, now - 5 * H, 'Equipo A', 'tareas');
    await cargarMovimientoNuevo(cmPage);
    const actualAntes = await cmPage.evaluate(() => JSON.stringify(S));
    await abrirDirecto(cmPage);
    await cmPage.locator('.hv-item', { hasText: 'Equipo A' }).click();
    await cmPage.locator('.hv-volver').click();
    await expect(cmPage.locator('.hv-confirmar')).toContainText('exactamente como estaban');
    await cmPage.locator('.hv-si').click();
    await expect(cmPage.locator('#hv-overlay')).not.toHaveClass(/open/);
    const r = await cmPage.evaluate(() => ({
      tareas: (S.goals['2026-11-21'] || []).map(g => g.id),
      conTxnNueva: S.transactions.some(t => t.id === 'txn-despues'),
    }));
    expect(r.tareas).toEqual(['viejo-1', 'viejo-2', 'viejo-3']);
    expect(r.conTxnNueva, 'lo cargado después ya no está').toBe(false);

    // (e) La copia de lo de antes quedó guardada y listada, y se puede volver a ella.
    const copia = await cmPage.evaluate(async () => {
      const q = await _db.collection('appdata').get();
      const d = q.docs.filter(x => x.id.startsWith('snap_') && x.data()._dev === 'antes de restaurar');
      const idx = (await _db.collection('appdata').doc('snapidx').get()).data();
      return { n: d.length, state: d[0] && d[0].data().state, enIndice: idx.items.filter(i => i.dev === 'antes de restaurar').length };
    });
    expect(copia.n).toBe(1);
    expect(copia.enIndice).toBe(1);
    expect(copia.state).toBe(actualAntes);
    await cmPage.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress, null, { timeout: 20000 });
    await abrirDirecto(cmPage);
    await expect(cmPage.locator('.hv-item', { hasText: 'antes de restaurar' })).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test('retención: deja los 30 más nuevos + el más nuevo de cada hora de las últimas 72 h', async ({ cmPage, consoleErrors }) => {
    const now = Date.now();
    const ts = [];
    for (let i = 1; i <= 100; i++) ts.push(now - i * 57 * 60000);   // ~95 h de historia, 100 versiones
    const previos = await cmPage.evaluate(async () => (await _db.collection('appdata').get()).docs.filter(d => d.id.startsWith('snap_')).map(d => parseInt(d.id.slice(5))));
    await cmPage.evaluate(async (lista) => {
      for (const t of lista) await _db.collection('appdata').doc('snap_' + t).set({ state: '{"a":1}', savedAt: t, _dev: 'PC' });
      await _db.collection('appdata').doc('snapidx').delete();   // sin índice: se reconstruye leyendo los docs
      localStorage.removeItem('_snapTrimAt');
    }, ts);
    const nuevoT = await cmPage.evaluate(async () => { const t = Date.now(); await _saveSnap(JSON.stringify(S), t); return t; });

    const todos = [nuevoT, ...ts, ...previos].sort((a, b) => b - a);
    const esperado = new Set(todos.slice(0, 30));
    const horas = new Set();
    for (const t of todos) { if (t < Date.now() - 72 * H) continue; const h = Math.floor(t / H); if (!horas.has(h)) { horas.add(h); esperado.add(t); } }
    expect(esperado.size).toBeGreaterThan(30);
    expect(esperado.size).toBeLessThan(todos.length);

    await expect.poll(async () => cmPage.evaluate(async () => (await _db.collection('appdata').get()).docs.filter(d => d.id.startsWith('snap_')).length)).toBe(esperado.size);
    const r = await cmPage.evaluate(async () => {
      const docs = (await _db.collection('appdata').get()).docs.filter(d => d.id.startsWith('snap_')).map(d => d.id);
      const idx = (await _db.collection('appdata').doc('snapidx').get()).data();
      return { docs, idx: idx.items.map(i => i.id).filter(id => id.startsWith('snap_')), rebuilt: idx.rebuilt };
    });
    expect(new Set(r.docs)).toEqual(new Set([...esperado].map(t => 'snap_' + t)));
    expect(new Set(r.idx), 'el índice queda igual a los documentos').toEqual(new Set(r.docs));
    expect(r.rebuilt).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('a 390px no hay desborde horizontal (lista y detalle)', async ({ cmPage, consoleErrors }) => {
    await cmPage.setViewportSize({ width: 390, height: 844 });
    const now = Date.now();
    await sembrar(cmPage, now - 2 * H, 'Equipo de prueba con un nombre bastante largo', 'tareas');
    await sembrar(cmPage, now - 30 * H, 'Equipo B', null);
    await abrirDirecto(cmPage);
    const medir = () => cmPage.evaluate(() => {
      const p = document.querySelector('#hv-overlay .sdiag-panel');
      const rects = [...p.querySelectorAll('*')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
      return { doc: document.documentElement.scrollWidth, panel: p.scrollWidth, panelClient: p.clientWidth, maxRight: Math.max(...rects.map(r => r.right)) };
    });
    await expect(cmPage.locator('.hv-item', { hasText: 'Equipo' })).toHaveCount(2);
    for (const fase of ['lista', 'detalle']) {
      if (fase === 'detalle') { await cmPage.locator('.hv-item', { hasText: 'Equipo de prueba' }).click(); await expect(cmPage.locator('.hv-cambios')).toBeVisible(); await cmPage.locator('.hv-volver').click(); await expect(cmPage.locator('.hv-confirmar')).toBeVisible(); }
      const m = await medir();
      expect(m.doc, fase).toBeLessThanOrEqual(390);
      expect(m.panel, fase).toBeLessThanOrEqual(m.panelClient);
      expect(m.maxRight, fase).toBeLessThanOrEqual(390.5);
    }
    expect(consoleErrors).toEqual([]);
  });
});
