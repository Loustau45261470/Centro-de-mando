// Entrenamiento · etapa 5: la tarjeta resumen de Salud usa el plan semanal ("Hoy toca", pendiente, EMPEZAR y casilla desde la
// tarjeta, tira de la semana, sesión en curso). Fechas relativas a HOY; datos inventados. Capturas si ENTRENO_CAPTURAS apunta a una carpeta.
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const CAPT = process.env.ENTRENO_CAPTURAS || '';
const shot = async (page, nombre) => { if (!CAPT) return; fs.mkdirSync(CAPT, { recursive: true }); await page.locator('#entrenamiento-resumen-card').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(CAPT, nombre + '.png') }); };
const sinScrollH = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const card = page => page.locator('#entrenamiento-resumen-card');
test.describe.configure({ timeout: 60000 });

async function preparar(page) {
  await page.evaluate(() => {
    initRoutines();
    const base = S.routines.slice(0, 2);
    base[0].name = 'Empuje'; base[0].icon = '💪'; base[1].name = 'Tirón'; base[1].icon = '🔗';
    S.routines = base; S.routineLog = {}; S.activeRtnSession = null;
    S.planEntreno = PlanEntreno.vacio(); S.actividadesHechas = {};
    saveState();
  });
  await page.click('.nav-btn[data-tab="salud"]');
  await page.evaluate(() => renderSaludTab());
}
// dias: [{off, items:[{r:indice}|{a:'boxeo', franja}]}], off = días respecto de hoy.
async function armarPlan(page, dias) {
  await page.evaluate((dias) => {
    const d0 = PlanEntreno.diaDeSemana(getActiveDate());
    let p = PlanEntreno.vacio();
    dias.forEach(({ off, items }) => items.forEach(it => {
      p = PlanEntreno.cambiarPermanente(p, { op: 'agregar', dia: (((d0 + off) % 7) + 7) % 7, item: it.r != null ? { tipo: 'rutina', id: S.routines[it.r].id, franja: it.franja } : { tipo: 'actividad', clave: it.a, franja: it.franja } });
    }));
    S.planEntreno = p; saveState(); renderSaludTab();
  }, dias);
}

for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  test.describe(`Resumen de Salud con plan · ${vp.w}px`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    test('sin plan: "Armar mi plan" abre el overlay en Plan; KPI, último entreno y tira de 7 días como antes', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await expect(card(page).locator('.pe-sum-hoy')).toContainText('Todavía no armaste tu plan');
      await expect(card(page).locator('.ent-kpi')).toHaveCount(4);
      await expect(card(page).locator('.ent-week .ent-day')).toHaveCount(7);
      await expect(card(page).locator('.ent-last')).toContainText('Último entreno');
      await shot(page, `01-sin-plan-${vp.w}`);
      await card(page).getByRole('button', { name: 'Armar mi plan' }).click();
      await expect(page.locator('#ov-gym')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Armar mi plan' }).last()).toBeVisible();   // el overlay en Plan, sin plan
      expect(await sinScrollH(page)).toBe(true);
      expect(consoleErrors).toEqual([]);
    });

    test('hoy toca: items por franja, botón Empezar <rutina>, tira de la semana con hoy resaltado; descanso cuando no hay nada', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ r: 0, franja: 'manana' }, { a: 'boxeo', franja: 'tarde' }] }, { off: 1, items: [{ r: 1 }] }]);
      const hoy = card(page).locator('.pe-sum-hoy');
      await expect(hoy.locator('.pe-sum-h')).toHaveText('Hoy toca');
      await expect(hoy.locator('.pe-sum-fr')).toHaveText(['Mañana', 'Tarde']);
      await expect(hoy.locator('.pe-sum-nom')).toHaveText(['Empuje', 'Boxeo']);
      await expect(hoy.getByRole('button', { name: 'Empezar Empuje' })).toBeVisible();
      await expect(card(page).locator('.pe-sum-week .pe-sum-d')).toHaveCount(7);
      await expect(card(page).locator('.pe-sum-hoyd')).toHaveCount(1);
      await expect(card(page).locator('.ent-kpi')).toHaveCount(4);
      await expect(card(page).getByRole('button', { name: /Abrir entrenamiento completo/ })).toBeVisible();
      await shot(page, `02-hoy-toca-${vp.w}`);
      // casilla chica a la derecha
      const g = await card(page).locator('.pe-sum-it').nth(1).evaluate(row => {
        const ck = row.querySelector('.pe-ck b').getBoundingClientRect(), nom = row.querySelector('.pe-sum-nom').getBoundingClientRect();
        return { w: ck.width, derecha: ck.left >= nom.right - 1 };
      });
      expect(g.w).toBeLessThanOrEqual(18); expect(g.derecha).toBe(true);
      expect(await sinScrollH(page)).toBe(true);
      // plan con items en otros días pero hoy vacío -> Descanso
      await armarPlan(page, [{ off: 1, items: [{ r: 1 }] }]);
      await expect(card(page).locator('.pe-sum-hoy')).toContainText('Descanso');
      await expect(card(page).locator('.pe-sum-go')).toHaveCount(0);
      await shot(page, `03-descanso-${vp.w}`);
      expect(consoleErrors).toEqual([]);
    });

    test('pendiente de ayer: línea "Te quedó X de ayer" que abre el overlay en Plan', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await armarPlan(page, [{ off: -1, items: [{ r: 1 }] }, { off: 0, items: [{ r: 0 }] }]);
      const pend = card(page).locator('.pe-sum-pend');
      await expect(pend).toContainText('Te quedó');
      await expect(pend).toContainText('Tirón');
      await expect(pend).toContainText('de ayer');
      await shot(page, `04-pendiente-${vp.w}`);
      await pend.click();
      await expect(page.locator('#ov-gym')).toBeVisible();
      await expect(page.locator('#rutinas-wrap .pe-pend')).toContainText('Tirón');
      expect(consoleErrors).toEqual([]);
    });

    test('Empezar desde la tarjeta arranca la sesión directo; la tarjeta pasa a "Sesión en curso" con cronómetro y Continuar', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await page.evaluate(() => { S.routines[0].exercises = S.routines[0].exercises.length ? S.routines[0].exercises : [{ id: 'e1', name: 'Press', equipment: 'Barra', restSecs: 60, notes: '' }]; saveState(); });
      await armarPlan(page, [{ off: 0, items: [{ r: 0 }] }]);
      await card(page).getByRole('button', { name: 'Empezar Empuje' }).click();
      const ses = await page.evaluate(() => S.activeRtnSession && S.activeRtnSession.routineId === S.routines[0].id);
      expect(ses).toBe(true);
      await expect(page.locator('#ov-gym #rutinas-wrap .ses-ex').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await page.evaluate(() => { const b = document.querySelector('#ov-gym .cm-ov-close'); if (b) b.click(); });
      const live = card(page).locator('.pe-sum-live');
      await expect(live).toContainText('Sesión en curso');
      await expect(live).toContainText('Empuje');
      await expect(live.locator('#pe-sum-chrono')).toHaveText(/^\d{2}:\d{2}$/);
      await page.evaluate(() => { S.activeRtnSession.startedAt = Date.now() - 125000; renderEntrenamientoResumen(); });
      await expect(live.locator('#pe-sum-chrono')).toHaveText(/^02:0\d$/);
      await shot(page, `05-en-curso-${vp.w}`);
      await live.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.locator('#ov-gym #rutinas-wrap .ses-ex').first()).toBeVisible();
      expect(await sinScrollH(page)).toBe(true);
      expect(consoleErrors).toEqual([]);
    });

    test('marcar una actividad desde la tarjeta usa el mismo registro y se refleja en el overlay (y al revés)', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await armarPlan(page, [{ off: 0, items: [{ a: 'boxeo', franja: 'tarde' }] }]);
      await card(page).getByRole('button', { name: /Marcar Boxeo como hecha/ }).click();
      const reg = await page.evaluate(() => Object.values(S.actividadesHechas).filter(Boolean));
      expect(reg).toHaveLength(1);
      expect(reg[0]).toMatchObject({ clave: 'boxeo', franja: 'tarde', fecha: await page.evaluate(() => getActiveDate()) });
      await expect(card(page).locator('.pe-sum-hecho')).toHaveCount(1);
      await expect(card(page).locator('.pe-sum-okd')).toHaveCount(1);          // el día queda ✓ en la tira
      await expect(card(page).locator('.pe-sum-okd em')).toHaveText('✓');
      await shot(page, `06-actividad-hecha-${vp.w}`);
      await page.evaluate(() => openGymOverlay());
      await expect(page.locator('#ov-gym .pe-day-hoy .pe-act.pe-hecho')).toHaveCount(1);
      // desmarcar desde la tarjeta
      await page.keyboard.press('Escape');
      await page.evaluate(() => { const b = document.querySelector('#ov-gym .cm-ov-close'); if (b) b.click(); });
      await card(page).getByRole('button', { name: 'Deshacer hecha' }).click();
      expect(await page.evaluate(() => Object.values(S.actividadesHechas).filter(Boolean).length)).toBe(0);
      await expect(card(page).locator('.pe-sum-hecho')).toHaveCount(0);
      expect(consoleErrors).toEqual([]);
    });
  });
}
