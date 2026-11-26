// Se quitó el botón «+ Período» y los períodos creados a mano (id 'p-…') se pueden borrar con confirmación en la propia
// tarjeta. Los trimestres automáticos (t4-2026…) no. El borrado no resucita desde un snapshot remoto viejo.
'use strict';
const { test, expect } = require('./support/fixtures');

const PID = 'p-1700000000000';
async function prep(page, { activo = true } = {}) {
  await page.evaluate(({ PID, activo }) => {
    const qo = S.quarterlyObjectives;
    if (!qo.periods.find((p) => p.id === 't4-2026')) qo.periods.push({ id: 't4-2026', label: 'T4 2026', flat: false, note: null, objectives: [] });
    qo.periods = qo.periods.filter((p) => p.id !== PID);
    qo.periods.push({ id: PID, label: 'Católico devoto: 50% de días rezando y agradeciendo por la vida', flat: true, note: null,
      objectives: [{ id: 1, text: 'a', done: false, category: null }, { id: 2, text: 'b', done: false, category: null }] });
    qo.activePeriod = activo ? PID : 't4-2026';
  }, { PID, activo });
  await page.click('.nav-btn[data-tab="vida"]');
  await page.evaluate(() => renderQuarterlyObjectives());
}

test.describe('quitar «+ Período» y borrar período manual', () => {
  test('Vida ya no tiene el botón «+ Período»', async ({ cmPage, consoleErrors }) => {
    await prep(cmPage, { activo: false });
    await expect(cmPage.locator('#qobj-wrap-vida .card-title')).toBeVisible();
    await expect(cmPage.locator('#qobj-wrap-vida .card-title .btn')).toHaveCount(0);
    await expect(cmPage.locator('#qobj-wrap-vida')).not.toContainText('+ Período');
    expect(consoleErrors).toEqual([]);
  });

  test('menú: ✕ solo en períodos manuales; confirma con el conteo, cancelar no borra', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.click('#qobj-dd-vida .qobj-period-trigger');
    await expect(cmPage.locator('#qobj-dd-vida-menu .qobj-period-del')).toHaveCount(1);   // solo el 'p-…'
    await cmPage.locator('#qobj-dd-vida-menu .qobj-period-del').click();
    const conf = cmPage.locator('#qobj-wrap-vida .qobj-del-period');
    await expect(conf).toContainText('Tiene 2 objetivos, se borran con él');
    await conf.getByRole('button', { name: 'Cancelar' }).click();
    await expect(conf).toHaveCount(0);
    expect(await cmPage.evaluate((PID) => S.quarterlyObjectives.periods.some((p) => p.id === PID), PID)).toBe(true);
  });

  test('borrar el período activo vuelve a un trimestre y el modal viejo ya no se usa', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.evaluate((PID) => pedirBorrarPeriodo(PID), PID);
    await cmPage.locator('#qobj-wrap-vida .qobj-del-period-ok').click();
    const r = await cmPage.evaluate((PID) => ({ hay: S.quarterlyObjectives.periods.some((p) => p.id === PID), act: S.quarterlyObjectives.activePeriod,
      existe: S.quarterlyObjectives.periods.some((p) => p.id === S.quarterlyObjectives.activePeriod) }), PID);
    expect(r.hay).toBe(false);
    expect(r.existe).toBe(true);
    expect(r.act).toMatch(/^t[1-4]-\d{4}$/);
    await expect(cmPage.locator('#qobj-wrap-vida .qobj-period-trigger')).not.toContainText('Católico');
  });

  test('un trimestre automático no se puede borrar (ni por la función)', async ({ cmPage }) => {
    await prep(cmPage, { activo: false });
    await cmPage.evaluate(() => borrarPeriodo('t4-2026'));
    expect(await cmPage.evaluate(() => S.quarterlyObjectives.periods.some((p) => p.id === 't4-2026'))).toBe(true);
  });

  test('sync: borrado local + nube vieja que aún tiene el período → no resucita', async ({ cmPage }) => {
    await prep(cmPage);
    await cmPage.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress, null, { timeout: 20000 });
    const r = await cmPage.evaluate(async (PID) => {
      const clone = (o) => JSON.parse(JSON.stringify(o));
      const base = clone(S);
      const nube = clone(base);
      nube.transactions = [{ id: 'tx-nube', date: '2026-11-22', name: 'x', type: 'expense', amount: 1 }, ...(nube.transactions || [])];   // la nube cambió otra cosa
      await _DOC().set({ state: JSON.stringify(nube), _wid: 'otro', _savedAt: 2000, _dev: 'PC' });
      window.__cmLecturaVieja = null;
      _lastSyncedSavedAt = 1000; _lastSyncedState = clone(base);
      S = clone(base);
      borrarPeriodo(PID);
      await _fbDoSave();
      const fin = JSON.parse((await _DOC().get()).data().state);
      return { periodoEnNube: fin.quarterlyObjectives.periods.some((p) => p.id === PID), altaDeLaNube: (fin.transactions || []).some((t) => t.id === 'tx-nube'), local: S.quarterlyObjectives.periods.some((p) => p.id === PID) };
    }, PID);
    expect(r).toEqual({ periodoEnNube: false, altaDeLaNube: true, local: false });
  });

  for (const [w, h] of [[1280, 800], [390, 844]]) {
    test('la ✕ del menú es visible y tocable con etiqueta larga a ' + w + ' px', async ({ cmPage }) => {
      await cmPage.setViewportSize({ width: w, height: h });
      await prep(cmPage);
      await cmPage.click('#qobj-dd-vida .qobj-period-trigger');
      const x = cmPage.locator('#qobj-dd-vida-menu .qobj-period-del');
      await x.scrollIntoViewIfNeeded();
      const r = await x.evaluate((el) => {
        const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const top = document.elementFromPoint(cx, cy), m = el.closest('.qobj-period-menu').getBoundingClientRect();
        return { w: b.width, h: b.height, dentro: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight,
          enMenu: b.left >= m.left - 1 && b.right <= m.right + 1, tocable: top === el || el.contains(top), scrollX: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      expect(r.w).toBeGreaterThanOrEqual(28); expect(r.h).toBeGreaterThanOrEqual(28);
      expect(r).toMatchObject({ dentro: true, enMenu: true, tocable: true, scrollX: false });
    });
  }
});
