// Barrido de UI: la casilla de "marcar como hecho" de TODA lista es chica (<= 18 px) y va al final de la fila, a la derecha
// del texto (nunca a la izquierda); el texto de la fila queda alineado a la izquierda. Más: en 390 px el overlay
// Plan de materias (pestaña Plan) y el Seguimiento de avance muestran sus acciones (✓, editar, borrar) sin scroll horizontal.
// Todos los datos son de ejemplo inventados.
// Con CASILLAS_SHOTS=<carpeta> y CASILLAS_FASE=antes|despues guarda una captura de cada lista (para revisar a ojo).
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const SHOTS = process.env.CASILLAS_SHOTS || '';
const FASE = process.env.CASILLAS_FASE || 'despues';

async function irA(page, tab) {
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
}

// Una lista = cómo armarla + dónde mirar. `click` = el clic en la casilla debe cambiar `estado`.
const LISTAS = [
  {
    id: 'law-progreso', tab: 'conocimiento',
    armar: () => {
      S.lawProgress = { years: [{ id: 'y1', label: 'Primer Año', subjects: [
        { id: 'a1', name: 'Alfa de ejemplo', done: false }, { id: 'a2', name: 'Beta de ejemplo', done: true, grade: 8 },
      ] }] };
      saveState(); renderLawProgress();
    },
    fila: '#law-progress-wrap .law-subject-row', casilla: '.law-check', texto: '.law-subject-name',
    estado: () => S.lawProgress.years[0].subjects[0].done, click: true,
  },
  {
    id: 'metas-hoy-readonly', tab: 'vida',
    armar: () => {
      S.goals[getActiveDate()] = [
        { id: 'g1', text: 'Meta de ejemplo uno', done: false, priority: 'mid' },
        { id: 'g2', text: 'Meta de ejemplo dos', done: false, priority: 'high', time: '15:00' },
      ];
      renderMetasReadonly();
    },
    fila: '#metas-readonly-card .mrd-item', casilla: '.mrd-check', texto: '.mrd-text',
    estado: () => S.goals[getActiveDate()].find((g) => g.text === 'Meta de ejemplo dos').done, click: true,   // la de horario va primera
  },
  {
    id: 'metas-manana', tab: 'vida',
    armar: () => {
      S.goals[getTomorrow()] = [{ id: 'm1', text: 'Plan de mañana de ejemplo', done: false, priority: 'mid' }];
      renderGoals(); plannerOverlayOpen();
    },
    fila: '#plov-tom-host .goal-item', casilla: '.check-box', texto: '.goal-text-el', captura: '#ov-planner',
    estado: () => S.goals[getTomorrow()][0].done, click: true,
  },
  {
    id: 'metas-hoy-overlay', tab: 'vida',
    armar: () => {
      S.goals[getActiveDate()] = [{ id: 'g1', text: 'Meta de ejemplo uno', done: false, priority: 'mid' }, { id: 'g2', text: 'Meta de ejemplo dos', done: false, priority: 'low' }];
      renderGoals(); plannerOverlayOpen();
    },
    fila: '#plov-metas-host .goal-item', casilla: '.check-box', texto: '.goal-text-el',
    estado: () => S.goals[getActiveDate()][0].done, click: true, captura: '#ov-planner',
  },
  {
    id: 'planner-lista', tab: 'vida',
    armar: () => {
      const d = getActiveDate();
      S.dayPlan = {}; S.dayPlan[d] = { tasks: [
        { id: 'p1', text: 'Actividad de ejemplo uno', time: '09:00', duration: 60, priority: 2, area: 'trabajo', done: false },
        { id: 'p2', text: 'Actividad de ejemplo dos', time: '11:00', duration: 30, priority: 1, area: 'trabajo', done: true },
      ] };
      renderDayPlanner();
    },
    fila: '#dayPlannerList .pcal-row', casilla: '.pcal-check input', texto: '.pcal-text',
    estado: () => getDayPlan(getActiveDate()).tasks[0].done, click: true,
  },
  {
    id: 'planner-bloque', tab: 'vida',
    armar: () => {
      const d = getActiveDate();
      S.dayPlan = {}; S.dayPlan[d] = { tasks: [
        { id: 'p1', text: 'Actividad de ejemplo uno', time: '09:00', duration: 90, priority: 2, area: 'trabajo', done: false },
      ] };
      renderDayPlanner(); plannerOverlayOpen();
    },
    fila: '#plov-list-dia .pcal-block', casilla: '.pcal-check input', texto: '.pcal-text',
    estado: () => getDayPlan(getActiveDate()).tasks[0].done, click: true, captura: '#ov-planner',
  },
  {
    id: 'dieta-reglas', tab: 'salud',
    armar: () => {
      ensureDietaState();
      S.dieta.reglas = [{ id: 'r1', text: 'Regla de ejemplo uno' }, { id: 'r2', text: 'Regla de ejemplo dos' }];
      S.dieta.umbral = 1; renderDieta(); openDietaOverlay();
    },
    fila: '#dietaBody .diet-rule', casilla: '.ptask-check input', texto: '.sub-name', captura: '#ov-dieta',
    estado: () => _dietaDoneIds(getActiveDate()).includes('r1'), click: true,
  },
  {
    id: 'cursada-card', tab: 'conocimiento',
    armar: () => {
      const f = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
      S.cursada = [
        { id: 'c1', tipo: 'clase', materia: 'Materia de ejemplo', titulo: 'Clase uno', fecha: f(2), hora: '10:00', done: false },
        { id: 'c2', tipo: 'tp', materia: 'Otra materia', titulo: 'TP dos', fecha: f(5), hora: '', done: false },
      ];
      Cursada.renderPrincipal();
    },
    fila: '#cursada-card .curs-item', casilla: '.curs-check input', texto: '.curs-item-name',
    estado: () => S.cursada.find((c) => c.id === 'c1').done, click: true,
  },
  {
    id: 'cursada-overlay', tab: 'conocimiento',
    armar: () => {
      const f = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
      S.cursada = [
        { id: 'c1', tipo: 'clase', materia: 'Materia de ejemplo', titulo: 'Clase uno', fecha: f(2), hora: '10:00', done: false },
        { id: 'c2', tipo: 'tp', materia: 'Otra materia', titulo: 'TP dos', fecha: f(5), hora: '', done: false },
      ];
      Cursada.open();
    },
    fila: '#ov-cursada-list > div:has(input[type="checkbox"])', casilla: 'input[type="checkbox"]', texto: 'b',
    estado: () => S.cursada.find((c) => c.id === 'c1').done, click: true, captura: '#ov-cursada',
  },
  {
    id: 'metas-mensuales', tab: 'vida',
    armar: () => {
      const qo = S.quarterlyObjectives;
      const period = qo.periods.find((p) => p.id === qo.activePeriod) || qo.periods[0];
      const mes = _periodMonths(period.id)[0];
      _mgSection('vida')[mes] = [{ id: 1, text: 'Meta mensual de ejemplo uno', done: false }, { id: 2, text: 'Meta mensual de ejemplo dos', done: false }];
      _qobjActiveMonth.vida = mes;
      renderQObjForTab('vida');
    },
    fila: '#qobj-wrap-vida .monthly-goal-item', casilla: 'input[type="checkbox"]', texto: '.mg-text',
    estado: () => {
      const qo = S.quarterlyObjectives;
      const period = qo.periods.find((p) => p.id === qo.activePeriod) || qo.periods[0];
      return _mgSection('vida')[_periodMonths(period.id)[0]][0].done;
    },
    click: true,
  },
  {
    id: 'objetivos-trimestrales', tab: 'vida',
    armar: () => {
      const qo = S.quarterlyObjectives;
      const period = qo.periods.find((p) => p.id === qo.activePeriod) || qo.periods[0];
      period.objectives = [
        { id: 9001, text: 'Objetivo de ejemplo uno', category: 'Vida', done: false },
        { id: 9002, text: 'Objetivo de ejemplo dos', category: 'Vida', done: false },
      ];
      _qobjActiveMonth.vida = 'trim';
      renderQObjForTab('vida');
    },
    fila: '#qobj-wrap-vida .qobj-item', casilla: 'input[type="checkbox"]', texto: '.qobj-item-text',
    estado: () => {
      const qo = S.quarterlyObjectives;
      const period = qo.periods.find((p) => p.id === qo.activePeriod) || qo.periods[0];
      return period.objectives.find((o) => o.id === 9001).done;
    },
    click: true,
  },
  {
    id: 'misiones-juego', tab: null,
    armar: async () => {
      await openGameMode();
      GM.misiones_generales = [{ texto: 'Misión de ejemplo uno', completada: false, xp: 10 }, { texto: 'Misión de ejemplo dos', completada: true, xp: 5 }];
      GM.misiones_semanales = [];
      gmRenderAll();
    },
    fila: '#tab-game .gm-mission', casilla: '.gm-check', texto: '.gm-mission-txt', click: false,
  },
  {
    id: 'espiritu-vinculos', tab: null,
    armar: async () => { await openGameMode(); },
    fila: '#tab-game .gm-ev', casilla: 'input[type="checkbox"]', texto: '.gm-ev-txt',
    estado: () => !!((GM.espiritu_vinculos_log[getActiveDate()] || {}).mision), click: true,
  },
  {
    id: 'proyectos-overlay', tab: 'vida',
    armar: () => {
      const t = Proyectos.get('vida');
      t.length = 0;
      t.push({ id: 'pf1', label: 'Proyecto de ejemplo', icon: '📁', tipo: 'carpeta', children: [
        { id: 'pt1', label: 'Tarea de ejemplo uno', icon: '📄', tipo: 'tarea', done: false, children: [] },
        { id: 'pt2', label: 'Tarea de ejemplo dos', icon: '📄', tipo: 'tarea', done: true, children: [] },
      ] });
      Proyectos.save('vida');
      ProyectosOverlay.open('vida');
      poDrill('pf1');
    },
    fila: '#proy-overlay .po-task', casilla: '.po-check', texto: '.po-task-ttl',
    estado: () => Proyectos.get('vida')[0].children.find((n) => n.id === 'pt1').done, click: true, captura: '#proy-overlay',
  },
  {
    id: 'notas-todo', tab: 'conocimiento',
    armar: () => {
      window.__rnTexto = '[ ] Casilla de ejemplo uno\n[x] Casilla de ejemplo dos';
      window.__rnGuardado = null;
      let box = document.getElementById('zz-rn-prueba');
      if (!box) { box = document.createElement('div'); box.id = 'zz-rn-prueba'; box.style.cssText = 'max-width:420px;padding:12px'; document.querySelector('#tab-conocimiento').prepend(box); }
      box.innerHTML = rnRender(window.__rnTexto, { texto: window.__rnTexto, onSave: (n) => { window.__rnGuardado = n; } });
    },
    fila: '#zz-rn-prueba .rn-todo-item', casilla: '.rn-todo-check', texto: '.rn-todo-text',
    estado: () => (window.__rnGuardado || '').startsWith('[x] Casilla de ejemplo uno'), click: true,
  },
];

for (const L of LISTAS) {
  test(`casilla chica y a la derecha: ${L.id}`, async ({ cmPage, consoleErrors }, testInfo) => {
    const movil = testInfo.project.name.includes('mobile');
    if (!movil) await cmPage.setViewportSize({ width: 1440, height: 900 });
    if (L.tab) await irA(cmPage, L.tab);
    await cmPage.evaluate(`(${L.armar.toString()})()`);

    const fila = cmPage.locator(L.fila).first();
    await expect(fila).toBeVisible();
    await fila.evaluate((el) => el.scrollIntoView({ block: 'center' }));

    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const alvo = L.captura ? cmPage.locator(L.captura).first() : cmPage.locator(L.fila).first().locator('xpath=ancestor-or-self::*[contains(@class,"card")][1]');
      const destino = path.join(SHOTS, `${FASE}-${L.id}-${movil ? 'mobile390' : 'desktop1440'}.png`);
      try { await ((await alvo.count()) ? alvo : fila).screenshot({ path: destino }); } catch (e) { await cmPage.screenshot({ path: destino }); }
      // Además un recorte de la lista tal como se ve en pantalla (la captura de la card puede salirse del viewport).
      const pb = await fila.locator('xpath=..').boundingBox(); const vp = cmPage.viewportSize();
      if (pb) {
        const x = Math.max(0, pb.x - 6), y = Math.max(0, pb.y - 6);
        await cmPage.screenshot({ path: destino.replace('.png', '-fila.png'), clip: { x, y, width: Math.max(1, Math.min(pb.width + 12, vp.width - x)), height: Math.max(1, Math.min(pb.height + 12, vp.height - y)) } });
      }
    }

    const casilla = fila.locator(L.casilla).first();
    const texto = fila.locator(L.texto).first();
    const bf = await fila.boundingBox();
    const bc = await casilla.boundingBox();
    const bt = await texto.boundingBox();
    expect(bc, 'la casilla tiene caja').toBeTruthy();
    expect(bc.width, 'ancho de la casilla').toBeLessThanOrEqual(18);
    expect(bc.height, 'alto de la casilla').toBeLessThanOrEqual(18);
    expect(bc.x, 'la casilla queda a la derecha del texto').toBeGreaterThan(bt.x);
    expect(bc.x + bc.width, 'la casilla queda al final de la fila').toBeGreaterThanOrEqual(bf.x + bf.width - 70);
    expect(await texto.evaluate((el) => getComputedStyle(el).textAlign), 'el texto queda alineado a la izquierda').toMatch(/^(left|start)$/);
    // La casilla se ve entera: cabe en el viewport y en todo ancestro que recorta en horizontal (un overflow la taparía al ir al borde derecho).
    const cortadoPor = await casilla.evaluate((el) => {
      const r = el.getBoundingClientRect(); const out = [];
      if (r.right > innerWidth + 0.5 || r.left < 0) out.push('viewport');
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        if (getComputedStyle(a).overflowX === 'visible') continue;
        const ar = a.getBoundingClientRect();
        if (r.right > ar.right + 0.5 || r.left < ar.left - 0.5) out.push((a.id || String(a.className).slice(0, 30)) + ':' + Math.round(ar.right));
      }
      return out;
    });
    expect(cortadoPor, 'la casilla no queda recortada').toEqual([]);

    if (L.click) {
      const antes = await cmPage.evaluate(`(${L.estado.toString()})()`);
      await casilla.click({ force: true });
      await expect.poll(() => cmPage.evaluate(`(${L.estado.toString()})()`)).toBe(!antes);
    }
    expect(consoleErrors).toEqual([]);
  });
}

// ── 390 px: acciones visibles sin deslizar ──────────────────────────────────────────────────────────
async function sinScrollHorizontal(page, selector) {
  return page.evaluate((sel) => {
    const vw = window.innerWidth;
    const out = { docOverflow: document.documentElement.scrollWidth > vw + 1, fuera: [], scrollers: [], total: 0, revisados: 0 };
    const root = document.querySelector(sel);
    // Un botón está "entero a la vista" si cabe en el viewport y en todos los ancestros que recortan (overflow distinto de visible):
    // un overflow que lo corta deja su borde derecho más allá del borde del ancestro.
    root.querySelectorAll('.icon-btn').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (!r.width) return;
      out.total++; out.revisados++;
      const cortadoPor = [];
      for (let a = b.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible') continue;
        const ar = a.getBoundingClientRect();
        if (r.right > ar.right + 0.5 || r.left < ar.left - 0.5) cortadoPor.push((a.id || a.className.toString().slice(0, 30)) + ':' + Math.round(ar.right));
      }
      if (r.right > vw + 0.5 || r.left < 0 || cortadoPor.length) out.fuera.push({ cls: b.className, left: Math.round(r.left), right: Math.round(r.right), cortadoPor });
    });
    for (let el = root; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1) out.scrollers.push({ id: el.id, cls: el.className.toString().slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth });
    }
    return out;
  }, selector);
}

test('390 px: Plan de materias (pestaña Plan) muestra ✓, editar y borrar sin scroll horizontal', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await cmPage.evaluate(() => {
    S.lawProgress = { years: [{ id: 'y1', label: 'Primer Año', subjects: [
      { id: 'a1', name: 'Derecho Internacional Público', done: false }, { id: 'a2', name: 'Introducción al Derecho', done: false },
      { id: 'a3', name: 'Materia suelta', done: false },
    ] }] };
    S.carrera = { regular: {}, pick: {} };
    const mas = (n) => { const d = new Date(getActiveDate() + 'T12:00:00'); d.setDate(d.getDate() + n); return localStr(d); };
    S.lawPlan = [
      { id: 'r1', subject: 'Derecho Internacional Público', target: _lawTargetDeISO(mas(20)), comision: 'B', tipo: 'Final Oral' },
      { id: 'r2', subject: 'Introducción al Derecho', target: 'Online 2027' },
    ];
    S.sgc = S.sgc || {};
    S.sgc.finales = [{ id: 'fs', materia: 'Materia suelta con nombre largo', subjectId: null, fecha: mas(12), tipo: 'Final MC', done: false, doneEl: null }];
    S.dayPlan = {};
    saveState(); renderLawPlan(); Finales.renderPrincipal();
    Finales.open('plan');
  });
  const tabla = cmPage.locator('#law-plan-wrap table');
  await expect(tabla).toBeVisible();
  await expect(cmPage.locator('#law-plan-wrap .icon-btn')).toHaveCount(8);   // 2 filas con ✓+✎+🗑 pero la 2 sin final → 3+2, más el suelto 3
  const r = await sinScrollHorizontal(cmPage, '#law-plan-wrap');
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await cmPage.locator('#ov-finales').screenshot({ path: path.join(SHOTS, `${FASE}-plan-materias-mobile390.png`) }); }
  expect(r.revisados, 'se midieron todos los botones').toBe(r.total);
  expect(r.fuera, 'botones fuera del viewport o recortados').toEqual([]);
  expect(r.scrollers, 'ningún contenedor con scroll horizontal').toEqual([]);
  expect(r.docOverflow).toBe(false);
  // El nombre parte por palabra, no a media palabra ("Internacio-nal").
  expect(await cmPage.locator('#law-plan-wrap .law-plan-name').first().evaluate((el) => getComputedStyle(el).overflowWrap)).not.toBe('anywhere');
  expect(consoleErrors).toEqual([]);
});

test('390 px: Seguimiento de avance muestra editar y borrar de cada punto sin recorte', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await irA(cmPage, 'conocimiento');
  await cmPage.evaluate(() => {
    const hoy = new Date();
    const mes = (n) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() + n, 1); return '01/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2); };
    S.lawMilestones = [
      { id: 'h1', date: mes(-2), label: 'Punto uno', real: 3, expected: 4 },
      { id: 'h2', date: mes(-1), label: 'Punto dos', real: 5, expected: 5 },
      { id: 'h3', date: mes(1), label: 'Punto tres', real: null, expected: 7 },
    ];
    renderLawMilestones();
  });
  const tabla = cmPage.locator('#law-milestones-wrap table');
  await tabla.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(tabla.locator('.icon-btn').first()).toBeVisible();
  const r = await sinScrollHorizontal(cmPage, '#law-milestones-wrap');
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await cmPage.locator('#law-milestones-wrap').screenshot({ path: path.join(SHOTS, `${FASE}-seguimiento-mobile390.png`) }); }
  expect(r.revisados, 'se midieron todos los botones').toBe(r.total);
  expect(r.fuera, 'botones fuera del viewport o recortados').toEqual([]);
  expect(r.scrollers, 'ningún contenedor con scroll horizontal').toEqual([]);
  expect(r.docOverflow).toBe(false);
  expect(consoleErrors).toEqual([]);
});
