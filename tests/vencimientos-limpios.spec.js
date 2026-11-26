// Vencimientos que se limpian solos + notificaciones visibles en escritorio.
//  - Una actividad vinculada a un hábito, ya hecho, no sigue en vencimientos ni en el cron (deadlines.js es puro).
//  - Tildar / mover una actividad o una meta redibuja la card «Vencimientos» al instante (sin esperar el minuto).
//  - Un recordatorio puntual vencido hace más de 7 días no se muestra.
//  - El permiso de notificaciones pendiente se avisa también en escritorio y hay estado visible por dispositivo.
'use strict';
const { test, expect } = require('./support/fixtures');
const CMDeadlines = require('../deadlines.js');

const card = (p) => p.evaluate(() => (document.getElementById('reminders-notif-vida') || {}).innerText || '');

// ── Node puro (lo que corre también el cron push-reminders.js) ──────────────────────────────────────
test.describe('deadlines.js con hábito hecho (Node)', () => {
  const now = new Date(2026, 10, 26, 10, 0, 0).getTime();   // 26/11/2026 10:00 hora local
  const hoy = '2026-11-26';
  const titulos = (S) => CMDeadlines.collect(S, { now, pastDays: 7 }).filter((i) => i.kind === 'actividad' && i.date === hoy).map((i) => i.title);
  const base = (done) => ({
    habitTrackers: { vida: [{ id: 'h1', name: 'Agua', days: done ? { [hoy]: 'done' } : {} }] },
    dayPlan: { [hoy]: { tasks: [{ id: 'p1', text: 'ACT puntual', time: '10:30', area: 'vida', priority: 2, done: false, habit: { section: 'vida', id: 'h1' } }] } },
    planRecurring: [{ id: 'r1', text: 'ACT recurrente', time: '10:40', area: 'vida', priority: 2, startDate: '2026-11-01', repeat: { freq: 'daily', byDays: [] }, exceptions: {}, habit: { section: 'vida', id: 'h1' } }],
  });

  test('con el hábito sin hacer, las actividades vinculadas siguen venciendo', () => {
    expect(titulos(base(false)).sort()).toEqual(['ACT puntual', 'ACT recurrente']);
  });
  test('con el hábito hecho ese día, desaparecen (puntual y recurrente)', () => {
    expect(titulos(base(true))).toEqual([]);
  });
  test('si el hábito ya no existe, vale el done propio de la actividad', () => {
    const s = base(true); s.habitTrackers = { vida: [] };
    expect(titulos(s).sort()).toEqual(['ACT puntual', 'ACT recurrente']);
    s.dayPlan[hoy].tasks[0].done = true;
    expect(titulos(s)).toEqual(['ACT recurrente']);
  });
  test('habitTrackers en formato viejo (array) también se resuelve', () => {
    const s = base(true); s.habitTrackers = [{ id: 'h1', days: { [hoy]: 'done' } }];
    expect(titulos(s)).toEqual([]);
  });
});

// ── Navegador ───────────────────────────────────────────────────────────────────────────────────────
async function sembrar(page) {
  await page.click('.nav-btn[data-tab="vida"]');
  await page.evaluate(() => {
    const t = (m) => new Date(Date.now() + m * 60000);
    const f = (d) => d.toLocaleDateString('sv-SE'), h = (d) => d.toTimeString().slice(0, 5);
    const hoy = getActiveDate();
    S.goals = S.goals || {};
    S.goals[hoy] = [
      { id: 'gA', text: 'VENC meta con hora', time: h(t(15)), done: false },
      { id: 'gB', text: 'VENC meta franja', franja: 'm', oblig: true, done: false },
    ];
    S.dayPlan = S.dayPlan || {};
    S.dayPlan[hoy] = { tasks: [
      { id: 'pA', text: 'VENC actividad puntual', time: h(t(10)), duration: 30, priority: 2, area: 'vida', done: false },
      { id: 'pB', text: 'VENC actividad habito', time: h(t(12)), duration: 30, priority: 2, area: 'vida', done: false, habit: { section: 'vida', id: 'hVenc' } },
    ] };
    S.planRecurring = [];
    S.habitTrackers = S.habitTrackers || {};
    S.habitTrackers.vida = (S.habitTrackers.vida || []).concat([{ id: 'hVenc', name: 'VENC habito', emoji: '💧', days: {} }]);
    S.reminders = S.reminders || {};
    S.reminders.vida = [
      { id: 'rmA', title: 'VENC recordatorio futuro', datetime: f(t(40)) + 'T' + h(t(40)), priority: 'medium' },
      { id: 'rmB', title: 'VENC recordatorio hace 3 dias', datetime: f(t(-60 * 24 * 3)) + 'T09:00', priority: 'medium' },
      { id: 'rmC', title: 'VENC recordatorio hace 40 dias', datetime: f(t(-60 * 24 * 40)) + 'T09:00', priority: 'medium' },
    ];
    renderReminders('vida'); renderDayPlanner();
  });
}

test.describe('vencimientos en el navegador', () => {
  test('actividad con hábito tildada: sale de collect y de la card al instante', async ({ cmPage: page }) => {
    await sembrar(page);
    expect(await card(page)).toContain('VENC actividad habito');
    await page.evaluate(() => plannerToggleTask(getActiveDate(), 'pB'));
    const items = await page.evaluate(() => CMDeadlines.collect(S, { now: Date.now(), pastDays: 7 }).filter((i) => /^VENC/.test(i.title)).map((i) => i.title));
    expect(items).not.toContain('VENC actividad habito');
    expect(await card(page)).not.toContain('VENC actividad habito');
    expect(await card(page)).toContain('VENC actividad puntual');
  });

  test('actividad puntual tildada desaparece de la card sin esperar el minuto, y vuelve al destildar', async ({ cmPage: page }) => {
    await sembrar(page);
    await page.evaluate(() => plannerToggleTask(getActiveDate(), 'pA'));
    expect(await card(page)).not.toContain('VENC actividad puntual');
    await page.evaluate(() => plannerToggleTask(getActiveDate(), 'pA'));
    expect(await card(page)).toContain('VENC actividad puntual');
  });

  test('cambiar el horario de una actividad se refleja al instante (editar y mover a otro día)', async ({ cmPage: page }) => {
    await sembrar(page);
    await page.evaluate(() => {
      const t = getDayPlan(getActiveDate()).tasks.find((x) => x.id === 'pA');
      const d = new Date(Date.now() + 5 * 3600000);
      t.time = d.toTimeString().slice(0, 5); saveState(); renderDayPlanner();
    });
    // Ya no es "en minutos": cae lejos, así que no figura en el tramo inmediato y la card se recalculó sin el refresco de 60 s.
    const items = await page.evaluate(() => CMDeadlines.collect(S, { now: Date.now(), pastDays: 7 }).filter((i) => i.title === 'VENC actividad puntual').map((i) => i.time));
    const nueva = await page.evaluate(() => getDayPlan(getActiveDate()).tasks.find((x) => x.id === 'pA').time);
    expect(items.every((x) => x === nueva)).toBe(true);
    const txt = await card(page);
    // Si la card muestra la actividad, tiene que ser con el horario nuevo, nunca con el viejo.
    if (txt.includes('VENC actividad puntual')) expect(txt).toContain(nueva);
    await page.evaluate(() => {
      const p = getDayPlan(getActiveDate()); const t = p.tasks.find((x) => x.id === 'pA');
      p.tasks = p.tasks.filter((x) => x.id !== 'pA'); t.time = '23:30';
      const m = new Date(); m.setDate(m.getDate() + 2); getDayPlan(m.toLocaleDateString('sv-SE')).tasks.push(t);
      saveState(); renderDayPlanner();
    });
    expect(await card(page)).not.toContain('VENC actividad puntual');
  });

  test('meta tildada sin hora (franja obligatoria) refresca la card', async ({ cmPage: page }) => {
    await sembrar(page);
    expect(await card(page)).toContain('VENC meta franja');
    await page.evaluate(() => toggleGoal(getActiveDate(), S.goals[getActiveDate()].findIndex((g) => g.id === 'gB')));
    expect(await card(page)).not.toContain('VENC meta franja');
  });

  test('recordatorio vencido hace 40 días no aparece; el de hace 3 días sí; el dato se conserva', async ({ cmPage: page }) => {
    await sembrar(page);
    const txt = await card(page);
    expect(txt).not.toContain('VENC recordatorio hace 40 dias');
    expect(txt).toContain('VENC recordatorio hace 3 dias');
    const wrap = await page.evaluate(() => (document.getElementById('reminders-wrap-vida') || {}).innerText || '');
    expect(wrap).not.toContain('VENC recordatorio hace 40 dias');
    expect(await page.evaluate(() => S.reminders.vida.some((r) => r.id === 'rmC'))).toBe(true);
  });
});

// ── Notificaciones ──────────────────────────────────────────────────────────────────────────────────
const fijarPermiso = (page, perm) => page.evaluate((p) => {
  Object.defineProperty(Notification, 'permission', { get: () => p, configurable: true });
  ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'].forEach(renderRemindersNotif);
}, perm);

test.describe('notificaciones en escritorio', () => {
  test('permiso pendiente: aviso con botón que llama a initNotifications', async ({ cmPage: page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('cdm_avisoNotifDia');
      window.__init = 0; window.initNotifications = () => { window.__init++; };
      if (!(typeof _auth !== 'undefined' && _auth && _auth.currentUser)) window.__sinAuth = true;
      Object.defineProperty(Notification, 'permission', { get: () => 'default', configurable: true });
    });
    test.skip(await page.evaluate(() => !!window.__sinAuth), 'el mock no trae sesión');
    await page.evaluate(() => avisoPermisoNotif());
    const btn = page.locator('#av-permiso #av-permiso-activar');
    await expect(btn).toBeVisible();
    await btn.click();
    expect(await page.evaluate(() => window.__init)).toBe(1);
  });

  test('línea de estado: pendiente, bloqueadas y activadas', async ({ cmPage: page }) => {
    await page.click('.nav-btn[data-tab="vida"]');
    await page.evaluate(() => { window.__init = 0; window.initNotifications = () => { window.__init++; }; localStorage.removeItem('cm_push_sub_at'); });
    const estado = page.locator('#tab-vida .rnotif-estado');

    await fijarPermiso(page, 'default');
    await expect(estado).toContainText('pendiente de permiso');
    await page.locator('#tab-vida .rnotif-nb .rnb-btn').click();
    expect(await page.evaluate(() => window.__init)).toBe(1);
    await expect(page.locator('#ov-reminders.show, .rem-overlay.show')).toHaveCount(0);   // el botón no abre el panel

    await fijarPermiso(page, 'denied');
    await expect(estado).toContainText('bloqueadas por el navegador');
    await expect(estado).toContainText('candado');

    await fijarPermiso(page, 'granted');
    await expect(estado).toHaveCount(0);                                   // activadas: solo ícono
    await page.locator('#tab-vida .rnotif-nb .rnb-ico').click();
    await expect(estado).toContainText('activadas');
    await expect(estado).toContainText('Todavía no se registró');
    const ts = new Date(2026, 10, 20).getTime();
    await page.evaluate((t) => { localStorage.setItem('cm_push_sub_at', String(t)); renderRemindersNotif('vida'); }, ts);
    await expect(estado).toContainText('registrados el 20/11');
  });
});
