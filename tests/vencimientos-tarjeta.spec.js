// Vencimientos: en cada sección es una tarjeta clickeable entera (patrón .cc-card-link, como Crédito) que abre el panel completo;
// ya no hay entrada en el abanico. Muestra los 5 próximos más cercanos (hoy incluido) con "Ver más (N)", y TODOS los vencidos debajo.
// Finales: primero los 3 no rendidos más cercanos no vencidos, y los vencidos sin rendir a la vista debajo.
'use strict';
const { test, expect, waitForBoot, completeLoginOverlay } = require('./support/fixtures');

const irA = (page, tab) => page.evaluate((t) => switchTab(t, document.querySelector(`.nav-btn[data-tab="${t}"]`)), tab);

// Recordatorios con fecha relativa a ahora: `proximos` días hacia adelante (a las 12:00 + i horas para no empatar) y `vencidos` días hacia atrás.
const armar = (page, tab, proximos, vencidos) => page.evaluate(([tab, proximos, vencidos]) => {
  const iso = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const desde = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(12, 0, 0, 0); return iso(d); };
  S.reminders = S.reminders || {};
  S.reminders[tab] = [];
  for (let i = 1; i <= proximos; i++) S.reminders[tab].push({ id: 'p' + i, title: 'Proximo ' + i, datetime: desde(i + 1), priority: 'medium' });
  for (let i = 1; i <= vencidos; i++) S.reminders[tab].push({ id: 'v' + i, title: 'Vencido ' + i, datetime: desde(-i), priority: 'high' });
  renderReminders(tab);
}, [tab, proximos, vencidos]);

const tarjeta = (page, tab) => page.locator(`#rnotif-card-${tab}`);
const panel = (page, tab) => page.locator(`#ov-rem-${tab}`);
const titulos = (page, tab, sel) => page.locator(`#reminders-notif-${tab} ${sel} .rnotif-title`).allTextContents();

test.describe('la tarjeta de Vencimientos', () => {
  test('con 8 próximos y 2 vencidos: se ven los 5 más cercanos y los 2 vencidos debajo', async ({ cmPage: page, consoleErrors }) => {
    await irA(page, 'vida');
    await armar(page, 'vida', 8, 2);
    expect(await titulos(page, 'vida', '.rnotif-next')).toEqual(['Proximo 1', 'Proximo 2', 'Proximo 3', 'Proximo 4', 'Proximo 5']);
    expect(await titulos(page, 'vida', '.rnotif-over')).toEqual(['Vencido 1', 'Vencido 2']);
    await expect(tarjeta(page, 'vida').locator('.rnotif-over .rnotif-item.overdue')).toHaveCount(2);
    await expect(tarjeta(page, 'vida').locator('.rnotif-over .rnotif-cd').first()).toHaveText('Vencido');
    await expect(tarjeta(page, 'vida').locator('.rnotif-toggle')).toHaveText('Ver más (3)');
    expect(consoleErrors).toEqual([]);
  });

  test('"Ver más" despliega los 3 restantes en la misma tarjeta (sin abrir el panel) y se vuelve a plegar', async ({ cmPage: page }) => {
    await irA(page, 'vida');
    await armar(page, 'vida', 8, 2);
    const toggle = tarjeta(page, 'vida').locator('.rnotif-toggle');
    await toggle.click();
    await expect(tarjeta(page, 'vida').locator('.rnotif-next .rnotif-item')).toHaveCount(8);
    await expect(toggle).toHaveText('Ver menos');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(tarjeta(page, 'vida').locator('.rnotif-over .rnotif-item')).toHaveCount(2);   // los vencidos siguen a la vista
    await expect(panel(page, 'vida')).toHaveCount(0);   // ni se llegó a construir
    // Sobrevive al refresco de cada minuto.
    await page.evaluate(() => refreshRemindersView('vida'));
    await expect(tarjeta(page, 'vida').locator('.rnotif-next .rnotif-item')).toHaveCount(8);
    await toggle.click();
    await expect(tarjeta(page, 'vida').locator('.rnotif-next .rnotif-item')).toHaveCount(5);
    await expect(toggle).toHaveText('Ver más (3)');
    await expect(panel(page, 'vida')).toHaveCount(0);
  });

  test('con 5 o menos próximos no hay "Ver más"', async ({ cmPage: page }) => {
    await irA(page, 'vida');
    await armar(page, 'vida', 5, 0);
    await expect(tarjeta(page, 'vida').locator('.rnotif-next .rnotif-item')).toHaveCount(5);
    await expect(tarjeta(page, 'vida').locator('.rnotif-toggle')).toHaveCount(0);
  });

  test('clic en la tarjeta (título o zona vacía) abre el panel completo; tiene rol de botón y es enfocable', async ({ cmPage: page, consoleErrors }) => {
    await irA(page, 'vida');
    await armar(page, 'vida', 3, 1);
    await expect(tarjeta(page, 'vida')).toHaveAttribute('role', 'button');
    await expect(tarjeta(page, 'vida')).toHaveAttribute('tabindex', '0');
    await expect(tarjeta(page, 'vida')).toHaveClass(/cc-card-link/);
    await tarjeta(page, 'vida').locator('.card-title').click();
    await expect(panel(page, 'vida')).toHaveClass(/show/);
    await expect(panel(page, 'vida')).toContainText('Recordatorio');   // el panel de hoy: la tarjeta completa con "+ Recordatorio"
    await page.keyboard.press('Escape');
    await expect(panel(page, 'vida')).not.toHaveClass(/show/);
    // Una fila de recordatorio (sin acción propia) también abre el panel.
    await tarjeta(page, 'vida').locator('.rnotif-item').first().click();
    await expect(panel(page, 'vida')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    // Enter y Espacio con la tarjeta enfocada.
    for (const tecla of ['Enter', ' ']) {
      await tarjeta(page, 'vida').focus();
      await page.keyboard.press(tecla);
      await expect(panel(page, 'vida')).toHaveClass(/show/);
      await page.keyboard.press('Escape');
      await expect(panel(page, 'vida')).not.toHaveClass(/show/);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('los controles de adentro no abren el panel de más: "Ver más", una fila con acción propia y su casilla/Enter', async ({ cmPage: page }) => {
    await irA(page, 'conocimiento');
    await page.evaluate(() => {
      const f = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
      S.sgc = S.sgc || {};
      S.sgc.finales = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 'fx' + n, materia: 'Materia ' + n, fecha: f(n + 1), tipo: 'Final Escrito', done: false, doneEl: null }));
      renderReminders('conocimiento');
    });
    const t = tarjeta(page, 'conocimiento');
    await t.locator('.rnotif-toggle').click();
    await expect(panel(page, 'conocimiento')).toHaveCount(0);
    await t.locator('.rnotif-toggle').focus();
    await page.keyboard.press('Enter');
    await expect(panel(page, 'conocimiento')).toHaveCount(0);
    // La fila de un final tiene acción propia (abre el Plan de materias): abre eso y NO el panel de Vencimientos.
    await t.locator('.rnotif-item[onclick]').first().click();
    await expect(page.locator('#ov-finales')).toHaveClass(/show/);
    await expect(panel(page, 'conocimiento')).toHaveCount(0);
  });

  test('la casilla "Marcar como rendido" de la tarjeta de Finales no abre el panel de Vencimientos', async ({ cmPage: page }) => {
    await irA(page, 'conocimiento');
    await page.evaluate(() => {
      const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + 5);
      S.sgc = S.sgc || {};
      S.sgc.finales = [{ id: 'fk', materia: 'Casilla', fecha: localStr(d), tipo: 'Final Escrito', done: false, doneEl: null }];
      Finales.renderPrincipal(); renderReminders('conocimiento');
    });
    await page.locator('#finales-wrap-conocimiento .fin-check').first().click();
    await expect(panel(page, 'conocimiento')).toHaveCount(0);
  });

  test('sin nada: estado vacío claro y sigue abriendo el panel para crear un recordatorio', async ({ cmPage: page }) => {
    await irA(page, 'ia');
    await page.evaluate(() => { S.reminders = S.reminders || {}; S.reminders.ia = []; renderReminders('ia'); });
    await expect(tarjeta(page, 'ia')).toContainText('Nada por vencer.');
    await tarjeta(page, 'ia').locator('.rnotif-all').click();
    await expect(panel(page, 'ia')).toHaveClass(/show/);
  });

  test('solo vencidos: aviso de que no hay próximos y los vencidos a la vista', async ({ cmPage: page }) => {
    await irA(page, 'ia');
    await armar(page, 'ia', 0, 2);
    await expect(tarjeta(page, 'ia')).toContainText('Nada próximo por vencer.');
    await expect(tarjeta(page, 'ia').locator('.rnotif-over .rnotif-item')).toHaveCount(2);
  });

  test('window.openRemindersOverlay(tab) sigue existiendo y abre el panel de cada sección', async ({ cmPage: page }) => {
    for (const tab of ['vida', 'salud', 'conocimiento', 'ia', 'finanzas']) {
      await irA(page, tab);
      await page.evaluate((t) => openRemindersOverlay(t), tab);
      await expect(panel(page, tab)).toHaveClass(/show/);
      await page.keyboard.press('Escape');
      await expect(panel(page, tab)).not.toHaveClass(/show/);
    }
  });
});

test.describe('el abanico de cada sección', () => {
  test('ya no trae "Vencimientos" (las 5 secciones) y conserva el resto', async ({ cmPage: page }) => {
    const etiquetas = (sd) => page.evaluate((id) => [...document.querySelectorAll(`#${id} .cm-sd-item`)].map((b) => b.getAttribute('aria-label')), sd);
    for (const tab of ['vida', 'salud', 'conocimiento', 'ia', 'finanzas']) {
      const e = await etiquetas('sd-' + tab);
      expect(e.length, tab).toBeGreaterThan(0);
      expect(e, tab).not.toContain('Vencimientos');
      if (tab !== 'finanzas') expect(e, tab).toContain('Proyectos');   // Finanzas ya no trae Proyectos (ni Notas ni Adquisición)
      expect(e, tab).not.toContain('Informes');
    }
  });
});

test.describe('la tarjeta de Finales', () => {
  const finales = (page, adelante, atras) => page.evaluate(([adelante, atras]) => {
    const f = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
    S.sgc = S.sgc || {};
    // Desordenados a propósito: el orden lo pone la tarjeta, no el orden de carga.
    S.sgc.finales = [
      ...adelante.map((n) => ({ id: 'a' + n, materia: 'Futuro ' + n, fecha: f(n), tipo: 'Final Escrito', done: false, doneEl: null })).reverse(),
      ...atras.map((n) => ({ id: 'b' + n, materia: 'Vencido ' + n, fecha: f(-n), tipo: 'Final Escrito', done: false, doneEl: null })),
    ];
    Finales.renderPrincipal();
  }, [adelante, atras]);
  const nombres = (page, sel) => page.locator(`#finales-wrap-conocimiento ${sel} .fin-item-name`).allTextContents();

  test('5 futuros + 1 vencido: los 3 futuros más cercanos y el vencido debajo, marcado VENCIDO', async ({ cmPage: page, consoleErrors }) => {
    await irA(page, 'conocimiento');
    await finales(page, [1, 2, 3, 4, 5], [2]);
    expect(await nombres(page, '.fin-next')).toEqual(['Futuro 1', 'Futuro 2', 'Futuro 3']);
    expect(await nombres(page, '.fin-over')).toEqual(['Vencido 2']);
    await expect(page.locator('#finales-wrap-conocimiento .fin-over .fin-venc-badge')).toHaveText('VENCIDO');
    await expect(page.locator('#finales-wrap-conocimiento .fin-next .fin-venc-badge')).toHaveCount(0);
    await expect(page.locator('#finales-wrap-conocimiento .fin-item')).toHaveCount(4);
    await expect(page.locator('#fin-ir-plan')).toHaveText('Ir a Finales / Plan de materias');
    expect(consoleErrors).toEqual([]);
  });

  test('con vencidos cerca de hoy no le quitan lugar a los futuros; HOY cuenta como no vencido', async ({ cmPage: page }) => {
    await irA(page, 'conocimiento');
    await finales(page, [0, 1, 2, 9], [1, 3]);
    expect(await nombres(page, '.fin-next')).toEqual(['Futuro 0', 'Futuro 1', 'Futuro 2']);
    expect((await nombres(page, '.fin-over')).sort()).toEqual(['Vencido 1', 'Vencido 3']);
  });

  test('solo vencidos: aviso de que no hay próximos y los vencidos a la vista', async ({ cmPage: page }) => {
    await irA(page, 'conocimiento');
    await finales(page, [], [4]);
    await expect(page.locator('#finales-wrap-conocimiento')).toContainText('Sin finales próximos.');
    expect(await nombres(page, '.fin-over')).toEqual(['Vencido 4']);
  });
});

test.describe('en el celu (390px)', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  test('la tarjeta de Vencimientos desplegada y la de Finales no desbordan en horizontal', async ({ cmPage: page }) => {
    await irA(page, 'conocimiento');
    await page.evaluate(() => {
      const f = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
      S.sgc = S.sgc || {};
      S.sgc.finales = [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: 'a' + n, materia: 'Introducción a la Filosofía del Derecho y Teoría General ' + n, fecha: f(n), tipo: 'Final Escrito', done: false, doneEl: null })),
        { id: 'b1', materia: 'Materiaextraordinariamentelargasinespaciosparaprobaroverflow', fecha: f(-3), tipo: 'Final Oral', done: false, doneEl: null },
      ];
      Finales.renderPrincipal(); renderReminders('conocimiento');
    });
    await page.locator('#rnotif-card-conocimiento .rnotif-toggle').click();
    await page.waitForTimeout(800);   // animación de entrada de las filas
    const sobra = await page.evaluate(() => {
      const hijos = ['#rnotif-card-conocimiento', '#finales-wrap-conocimiento'].map((s) => {
        const c = document.querySelector(s), r = c.getBoundingClientRect();
        return Math.max(0, ...[...c.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - r.right));
      });
      return { pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth, hijos };
    });
    expect(sobra.pagina).toBeLessThanOrEqual(0);
    for (const h of sobra.hijos) expect(h).toBeLessThanOrEqual(1);
  });
});

// Regresión: el colapso genérico de tarjetas (workspace.js) se enganchaba al título de las tarjetas .cc-card-link: tocar el título abría el
// panel Y colapsaba la tarjeta (quedaba oculta al cerrar, con la clave cc_<id>_* guardada y persistente).
test.describe('tocar el título de una tarjeta que abre un panel nunca la colapsa', () => {
  const CASOS = [
    { nombre: 'Vencimientos · vida', tab: 'vida', id: 'rnotif-card-vida', panel: 'ov-rem-vida', cont: '#reminders-notif-vida .rnotif-item', verMas: true,
      armar: (p) => armar(p, 'vida', 8, 1) },
    { nombre: 'Vencimientos · finanzas', tab: 'finanzas', id: 'rnotif-card-finanzas', panel: 'ov-rem-finanzas', cont: '#reminders-notif-finanzas .rnotif-item', verMas: true,
      armar: (p) => armar(p, 'finanzas', 8, 1) },
    { nombre: 'Cursada', tab: 'conocimiento', id: 'cursada-card', panel: 'ov-cursada', cont: '#cursada-card .curs-item',
      armar: (p) => p.evaluate(() => {
        const f = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
        S.cursada = [{ id: 'c1', tipo: 'clase', materia: 'Materia', titulo: 'Clase', fecha: f(2), hora: '10:00', done: false }];
        saveState(); Cursada.renderPrincipal();
      }) },
    { nombre: 'Crédito', tab: 'finanzas', id: 'credit-card', panel: 'ov-tarjetas', cont: '#creditBody', armar: async () => {} },
    { nombre: 'resumen de Presupuesto', tab: 'finanzas', id: 'budget-summary-card', panel: 'ov-budget', cont: '#budgetSummaryBody', armar: async () => {} },
  ];

  // Nada colapsado: sin .collapsed adentro, contenido con opacidad 1 y sin claves cc_<id>_* guardadas.
  const sinColapsar = async (page, c) => {
    await expect(page.locator(`#${c.id}`)).toBeVisible();
    await expect(page.locator(`#${c.id} .collapsed`)).toHaveCount(0);
    expect(await page.evaluate((id) => {
      const el = document.querySelector(`#${id}`);
      const llaves = Object.keys(localStorage).filter((k) => k.startsWith('cc_' + id + '_') && localStorage.getItem(k));
      return { llaves, opacidad: getComputedStyle(el.querySelector('.card-title').nextElementSibling || el).opacity };
    }, c.id), c.nombre).toEqual({ llaves: [], opacidad: '1' });
  };

  for (const c of CASOS) {
    test(c.nombre + ': clic en el título abre el panel; al cerrarlo la tarjeta sigue visible, y tras recargar también', async ({ cmPage: page, consoleErrors }) => {
      await irA(page, c.tab);
      await c.armar(page);
      await page.locator(`#${c.id} .card-title`).first().click();
      await expect(page.locator(`#${c.panel}`)).toHaveClass(/show/);
      await page.keyboard.press('Escape');
      await expect(page.locator(`#${c.panel}`)).not.toHaveClass(/show/);
      await sinColapsar(page, c);
      if (c.cont.includes('.')) await expect(page.locator(c.cont).first()).toBeVisible();
      if (c.verMas) {
        await page.locator(`#${c.id} .rnotif-toggle`).click();   // clickeable: antes estaba en opacidad 0
        await expect(page.locator(c.cont)).toHaveCount(9);
        await expect(page.locator(`#${c.panel}`)).not.toHaveClass(/show/);
      }
      await page.reload(); await waitForBoot(page); await completeLoginOverlay(page);
      await irA(page, c.tab);
      await sinColapsar(page, c);
      expect(consoleErrors).toEqual([]);
    });

    test(c.nombre + ': una clave cc_ guardada de antes (tarjeta que quedó colapsada) se borra al cargar y la tarjeta queda visible', async ({ cmPage: page }) => {
      await page.evaluate(([id]) => localStorage.setItem('cc_' + id + '_Vencimientos', '1'), [c.id]);
      await page.reload(); await waitForBoot(page); await completeLoginOverlay(page);
      await irA(page, c.tab);
      await c.armar(page);
      await sinColapsar(page, c);
    });
  }

  test('las tarjetas normales siguen colapsando con el título', async ({ cmPage: page }) => {
    await irA(page, 'finanzas');
    const t = page.locator('#activity-card > .card-title');   // Top 5 de Adquisiciones ya es .cc-card-link (abre su panel): se usa Actividad
    await t.click({ position: { x: 12, y: 12 } });
    await expect(page.locator('#activity-card > .card-body.collapsed')).toHaveCount(1);
    await t.click({ position: { x: 12, y: 12 } });
    await expect(page.locator('#activity-card > .card-body.collapsed')).toHaveCount(0);
  });
});
