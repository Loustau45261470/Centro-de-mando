// Diagnóstico de sincronización: la pantalla (sync-diagnostico.js) y los diarios que escribe app.js.
// Solo visibilidad: estos tests también comprueban que el merge sigue decidiendo igual.
'use strict';
const { test, expect } = require('./support/fixtures');

const SECRETO = 'ZXQ-NOTA-SECRETA-4471';

// Hace un cambio real (nota) y espera el guardado completo por el camino real (debounce de 2 s incluido).
async function guardarNota(page, texto, id) {
  const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('_saveDiag') || '[]').length + ':' + (JSON.parse(localStorage.getItem('_saveDiag') || '[]')[0] || {}).ts);
  await page.evaluate(([t, i]) => {
    _ntPersist([...(S.notas || []), { id: i, categoria: 'aprendizaje', titulo: 'Nota de prueba', texto: t, fecha: '2026-10-27' }]);
  }, [texto, id]);
  await page.waitForFunction((a) => {
    const l = JSON.parse(localStorage.getItem('_saveDiag') || '[]');
    return (l.length + ':' + (l[0] || {}).ts) !== a && !_fbSaveInProgress && !_fbSaveTid &&
      JSON.parse(localStorage.getItem('_syncEvents') || '[]').some((e) => e.tipo === 'guardado-ok');
  }, antes, { timeout: 15000 });
}

async function abrirPorPaleta(page) {
  await page.keyboard.press('Control+k');
  await page.fill('#cmdk-input', 'Diagnóstico de sincronización');
  // El primer resultado de la paleta es siempre «Ejecutar: …» (JARVIS): el comando se elige con ↓ + Enter.
  await expect(page.locator('.cmdk-item .ci-lbl', { hasText: /^Diagnóstico de sincronización$/ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sdiag-overlay.open')).toBeVisible();
}

test.describe('diagnóstico de sincronización', () => {
  test('abre desde la paleta de comandos y se cierra', async ({ cmPage, consoleErrors }) => {
    await abrirPorPaleta(cmPage);
    await expect(cmPage.locator('.sdiag-title')).toHaveText('Diagnóstico de sincronización');
    await expect(cmPage.locator('.sdiag-resumen')).toContainText('Este dispositivo');
    await cmPage.locator('.sdiag-x').click();
    await expect(cmPage.locator('#sdiag-overlay')).not.toHaveClass(/open/);
    expect(consoleErrors).toEqual([]);
  });

  test('abre desde el panel de ajustes (botón ◐) a 375px y el botón es alcanzable', async ({ cmPage, consoleErrors }) => {
    await cmPage.setViewportSize({ width: 375, height: 667 });
    await cmPage.locator('#theme-trigger').click();
    const btn = cmPage.locator('#theme-panel-sync-diag');
    await expect(btn).toBeVisible();
    // El panel entra en la pantalla (con scroll interno) y el botón se puede traer a la vista con un toque.
    const panel = await cmPage.locator('#theme-panel-inner').boundingBox();
    expect(panel.y + panel.height, 'el panel entra en la pantalla de un iPhone chico').toBeLessThanOrEqual(667);
    await btn.scrollIntoViewIfNeeded();
    const box = await btn.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    await btn.click();
    await expect(cmPage.locator('#sdiag-overlay.open')).toBeVisible();
    await expect(cmPage.locator('#theme-panel')).not.toHaveClass(/open/);
    expect(consoleErrors).toEqual([]);
  });

  test('muestra guardados y eventos después de hacer cambios (con detalle de claves y conteos)', async ({ cmPage, consoleErrors }) => {
    await guardarNota(cmPage, 'primera', 'n-diag-1');
    await guardarNota(cmPage, 'segunda', 'n-diag-2');

    const rec = await cmPage.evaluate(() => JSON.parse(localStorage.getItem('_saveDiag'))[0]);
    expect(rec.branch).toBe('overwrite');
    expect(rec.kLocal, 'kLocal lista las claves donde local difiere del ancestro').toContain('notas');
    expect(rec.kWrite).toContain('notas');
    expect(rec.kCloud).toEqual([]);
    expect(Object.keys(rec.cnt).sort()).toEqual(['activeRtnSession', 'habitTrackers', 'routineLog', 'workoutLog']);
    expect(rec.cnt.routineLog).toEqual(expect.objectContaining({ l: expect.any(Number), c: expect.any(Number), s: expect.any(Number) }));
    expect(rec.ts).toEqual(expect.any(Number));

    const evs = await cmPage.evaluate(() => JSON.parse(localStorage.getItem('_syncEvents')));
    expect(evs.length).toBeLessThanOrEqual(300);
    const tipos = evs.map((e) => e.tipo);
    for (const t of ['boot', 'saveState', 'guardar-inicio', 'guardar-rama', 'guardado-ok', 'guardar-fin']) expect(tipos, 'falta ' + t).toContain(t);
    const ss = evs.find((e) => e.tipo === 'saveState');
    expect(ss.origen, 'el origen nombra a la función de la app que llamó').toMatch(/_ntPersist/);
    expect(ss.t).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);

    await abrirPorPaleta(cmPage);
    await expect(cmPage.locator('.sdiag-guardados li').first()).toContainText('Guardó tal cual');
    await expect(cmPage.locator('.sdiag-guardados li').first()).toContainText('notas');
    await expect(cmPage.locator('.sdiag-eventos')).toContainText('Cambio guardado en este dispositivo');
    await expect(cmPage.locator('.sdiag-eventos')).toContainText('La nube confirmó el guardado');
    expect(await cmPage.locator('.sdiag-eventos li').count()).toBeLessThanOrEqual(30);
    expect(await cmPage.locator('.sdiag-guardados li').count()).toBeLessThanOrEqual(15);
    expect(consoleErrors).toEqual([]);
  });

  test('ocultar y volver deja los eventos en orden: oculta, visible, sync-inicio, sync-fin', async ({ cmPage, consoleErrors }) => {
    await guardarNota(cmPage, 'para tener doc en la nube', 'n-diag-v');
    await cmPage.evaluate(async () => {
      const setHidden = (v) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
      setHidden(true); document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 30));
      setHidden(false); document.dispatchEvent(new Event('visibilitychange'));
    });
    await cmPage.waitForFunction(() => JSON.parse(localStorage.getItem('_syncEvents')).some((e) => e.tipo === 'sync-fin'));
    const cron = (await cmPage.evaluate(() => JSON.parse(localStorage.getItem('_syncEvents')))).reverse();
    const idx = (t) => cron.findIndex((e) => e.tipo === t && e.ts >= cron.find((x) => x.tipo === 'oculta').ts);
    const orden = ['oculta', 'visible', 'sync-inicio', 'sync-fin'].map(idx);
    expect(orden.every((i) => i >= 0), JSON.stringify(orden)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    const visible = cron[idx('visible')];
    expect(visible.ocultaMs).toBeGreaterThanOrEqual(20);
    expect(cron[idx('sync-fin')].res).toBe('sin-cambios-eco-propio');
    expect(consoleErrors).toEqual([]);
  });

  test('merge 3 vías: kFromLocal/kCloud correctos y el resultado del merge no cambia', async ({ cmPage, consoleErrors }) => {
    await guardarNota(cmPage, 'base', 'n-diag-m1');
    // Otro dispositivo cambia sleepLog en la nube; este cambia notas.
    await cmPage.evaluate(async () => {
      const otro = JSON.parse(JSON.stringify(_lastSyncedState));
      otro.sleepLog = { ...(otro.sleepLog || {}), '2026-10-26': { hours: 9, quality: 5, fromOtherDevice: true } };
      await _DOC().set({ state: JSON.stringify(otro), _wid: 'otro-dispositivo', _savedAt: Date.now(), _dev: 'PC de prueba' }, { merge: true });
    });
    await guardarNota(cmPage, 'cambio local durante la divergencia', 'n-diag-m2');

    const rec = await cmPage.evaluate(() => JSON.parse(localStorage.getItem('_saveDiag'))[0]);
    expect(rec.branch).toBe('merge3way');
    expect(rec.kCloud).toEqual(['sleepLog']);
    expect(rec.kLocal).toContain('notas');
    expect(rec.kFromLocal).toContain('notas');
    expect(rec.kFromLocal).not.toContain('sleepLog');
    const st = await cmPage.evaluate(() => ({ notas: S.notas.map((n) => n.id), sleep: S.sleepLog['2026-10-26'] }));
    expect(st.notas).toEqual(['n-diag-m1', 'n-diag-m2']);
    expect(st.sleep.fromOtherDevice).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('apply remoto: registra qué secciones recibió y qué cambios locales sin subir pisó', async ({ cmPage, consoleErrors }) => {
    await guardarNota(cmPage, 'base', 'n-diag-a1');
    const ev = await cmPage.evaluate(() => {
      // Cambio local que todavía no se subió (no se llama a saveState: el ancestro no lo tiene)...
      S.notas = [...S.notas, { id: 'n-diag-local', categoria: 'aprendizaje', titulo: 't', texto: 'x', fecha: '2026-10-27' }];
      // ...y llega un estado de la nube con otro dispositivo.
      const nube = JSON.parse(JSON.stringify(_lastSyncedState));
      nube.sleepLog = { ...(nube.sleepLog || {}), '2026-10-25': { hours: 6 } };
      window._applySrc = 'syncOnFocus';
      _applyRemoteState(JSON.stringify(nube), Date.now());
      return JSON.parse(localStorage.getItem('_syncEvents')).find((e) => e.tipo === 'apply');
    });
    expect(ev.src).toBe('syncOnFocus');
    expect(ev.kRecibe).toEqual(expect.arrayContaining(['sleepLog', 'notas']));
    expect(ev.kPisadas, 'el apply pisó la nota local sin subir').toContain('notas');
    await abrirPorPaleta(cmPage);
    await expect(cmPage.locator('.sdiag-eventos')).toContainText('PISÓ cambios locales sin subir');
    expect(consoleErrors).toEqual([]);
  });

  test('"Copiar todo" produce JSON válido sin el contenido del estado', async ({ cmPage, consoleErrors }) => {
    await cmPage.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(cmPage.url()).origin }).catch(() => {});
    await guardarNota(cmPage, SECRETO, 'n-diag-secreto');
    await guardarNota(cmPage, SECRETO + '-bis', 'n-diag-secreto2');
    await abrirPorPaleta(cmPage);
    await cmPage.locator('.sdiag-copiar').click();
    await expect(cmPage.locator('.sdiag-msg')).toContainText('Copiado');

    const txt = await cmPage.evaluate(() => document.getElementById('sdiag-copia').value);
    const data = JSON.parse(txt);
    for (const k of ['saveDiag', 'syncDiag', 'loadDiag', 'applyDiag', 'syncEvents']) expect(data, 'falta ' + k).toHaveProperty(k);
    expect(data).toHaveProperty('dataMetric');
    expect(data).toHaveProperty('lastSyncedSavedAt');
    expect(data.dispositivo).toEqual(expect.any(String));
    expect(data.syncEvents.length).toBeGreaterThan(0);
    expect(txt).not.toContain(SECRETO);
    expect(txt).not.toContain('Nota de prueba');
    expect(txt).not.toContain('test-uid-e2e');   // el uid de la sesión tampoco viaja

    // Lo que quedó en el portapapeles es lo mismo (si el navegador deja leerlo).
    const clip = await cmPage.evaluate(() => navigator.clipboard.readText().catch(() => null));
    // Windows convierte \n en \r\n al copiar.
    if (clip) expect(clip.split('\r\n').join('\n')).toBe(txt);
    expect(consoleErrors).toEqual([]);
  });

  test('"Copiar todo": si el portapapeles falla (iOS) deja el texto seleccionable', async ({ cmPage, consoleErrors }) => {
    await guardarNota(cmPage, 'algo', 'n-diag-fb');
    await cmPage.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
      document.execCommand = () => false;
    });
    await abrirPorPaleta(cmPage);
    await cmPage.locator('.sdiag-copiar').click();
    const ta = cmPage.locator('#sdiag-copia');
    await expect(ta).toBeVisible();
    await expect(cmPage.locator('.sdiag-msg')).toContainText('No se pudo copiar');
    expect(JSON.parse(await ta.inputValue())).toHaveProperty('syncEvents');
    const sel = await ta.evaluate((el) => el.selectionEnd - el.selectionStart);
    expect(sel, 'el texto queda seleccionado').toBeGreaterThan(100);
    expect(consoleErrors).toEqual([]);
  });

  test('a 375px no hay desborde horizontal ni con eventos largos', async ({ cmPage, consoleErrors }) => {
    await cmPage.setViewportSize({ width: 375, height: 667 });
    await guardarNota(cmPage, 'a', 'n-diag-w1');
    await cmPage.evaluate(() => {
      // Un evento con un origen larguísimo y sin espacios, el peor caso para el ancho.
      _syncEv('saveState', { origen: 'funcionConUnNombreMuyLargoQueNoSePuedePartirEnPalabras_' + 'x'.repeat(80) + ' app.js:1', n: 7, conf: false });
    });
    await abrirPorPaleta(cmPage);
    const m = await cmPage.evaluate(() => {
      const p = document.querySelector('.sdiag-panel');
      const rects = [...p.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
      return {
        doc: document.documentElement.scrollWidth, panel: p.scrollWidth, panelClient: p.clientWidth,
        maxRight: Math.max(...rects.map((r) => r.right)),
      };
    });
    expect(m.doc).toBeLessThanOrEqual(375);
    expect(m.panel).toBeLessThanOrEqual(m.panelClient);
    expect(m.maxRight).toBeLessThanOrEqual(375.5);
    expect(consoleErrors).toEqual([]);
  });
});
