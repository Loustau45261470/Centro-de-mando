// Mapa de la carrera (constelacion-materias.js), dentro del overlay «Plan de carrera» (correlativas.js): constelación que se adapta (horizontal en pantalla ancha,
// vertical en celular). Datos sintéticos: nombres genéricos sobre el plan 2019 (códigos/correlativas de correlativas.js).
'use strict';
const { test, expect } = require('./support/fixtures');

// Aprobadas (6): 5-100, 60-250, 60-1351, 20-100, 60-200, 60-4300
// Regularizadas (2): 10-550, 60-510   · Con final activo (1): 60-410   · Plan con mes (1): 60-4310 ("Marzo 2027")
async function armar(page) {
  await page.evaluate(() => {
    const ids = Object.values(CORR_SUBID);
    const unicos = [...new Set(ids.concat(['s4_10']))];
    const porAnio = {};
    unicos.forEach((id) => { const y = 'y' + id[1]; (porAnio[y] = porAnio[y] || []).push(id); });
    const done = new Set(['s1_1', 's1_3', 's1_4', 's1_5', 's1_6', 's1_8']);
    S.lawProgress = { years: Object.keys(porAnio).sort().map((y) => ({ id: y, label: 'Año ' + y.slice(1),
      subjects: porAnio[y].map((id) => ({ id, name: 'Materia ' + id, done: done.has(id) })) })) };
    S.carrera = { regular: { '10-550': true, '60-510': true }, pick: {} };
    S.lawPlan = [{ id: 'p1', subject: 'Materia s2_3', target: 'Marzo 2027', fechaTipo: 'mes', mes: '2027-03' }];
    S.sgc = S.sgc || {};
    S.sgc.finales = [{ id: 'f1', materia: 'Materia s2_2', subjectId: 's2_2', fecha: '2027-02-10', tipo: 'Final Escrito', done: false, doneEl: null }];
    S.lawMilestones = [];
  });
}
async function irAConocimiento(page) {
  await page.evaluate(() => switchTab('conocimiento', document.querySelector('.nav-btn[onclick*="conocimiento"]')));
  await page.evaluate(() => Correlativas.open());   // el mapa vive en el Plan de carrera
  await expect(page.locator('#cmz-card')).toBeVisible();
}
const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);
const clases = (page, code) => page.locator(`.cmz-nd[data-code="${code}"]`).getAttribute('class');

for (const [nombre, ancho, alto, wd, vbW] of [['horizontal en computadora', 1280, 800, true, 1000], ['vertical en celular', 390, 1900, false, 340]]) {
  test(`constelación ${nombre}: orientación, todas las materias, estados y sin scroll horizontal`, async ({ cmPage, consoleErrors }) => {
    await cmPage.setViewportSize({ width: ancho, height: alto });
    await armar(cmPage);
    await irAConocimiento(cmPage);
    const card = cmPage.locator('#cmz-card');
    await expect(card).toHaveClass(wd ? /cmz-wd/ : /^(?!.*cmz-wd).*$/);
    expect(await cmPage.evaluate(() => document.querySelector('#cmz-card svg').viewBox.baseVal.width)).toBe(vbW);
    // Todas las materias del plan presentes
    const n = await cmPage.evaluate(() => CORR_SUBJECTS.length);
    expect(n).toBe(49);
    await expect(cmPage.locator('.cmz-nd')).toHaveCount(n);
    expect(await cmPage.evaluate(() => CORR_SUBJECTS.every((s) => document.querySelector(`.cmz-nd[data-code="${s.code}"]`)))).toBe(true);
    // Estados
    expect(await clases(cmPage, '5-100')).toContain('s-ap');
    expect(await clases(cmPage, '60-4300')).toContain('s-ap');
    expect(await clases(cmPage, '10-550')).toContain('s-cu');       // regularizada
    expect(await clases(cmPage, '60-410')).toContain('s-cu');       // con final activo
    expect(await clases(cmPage, '60-4320')).toContain('s-pe');      // puede cursar
    expect(await clases(cmPage, '60-4340')).toContain('s-bl');      // le falta 60-4320
    await expect(card.locator('.cmz-cnt')).toHaveText('6 aprobadas · 3 en curso o con final · 40 pendientes');
    // Correlativas = líneas; las que salen de una aprobada están encendidas
    expect(await cmPage.locator('.cmz-ed').count()).toBeGreaterThan(60);
    expect(await cmPage.locator('.cmz-ed.on').count()).toBeGreaterThan(5);
    // Todo dentro del mapa: ninguna estrella ni etiqueta se sale del área dibujada
    const fuera = await cmPage.evaluate(() => {
      const s = document.querySelector('#cmz-card svg'), vb = s.viewBox.baseVal;
      return [...s.querySelectorAll('.cmz-nd')].filter((g) => {
        const b = g.querySelector('text').getBBox(), p = g.transform.baseVal[0].matrix;
        return p.e + b.x < 0 || p.e + b.x + b.width > vb.width || p.f + b.y < 0 || p.f + b.y + b.height > vb.height;
      }).map((g) => g.dataset.code);
    });
    expect(fuera).toEqual([]);
    expect(await sinScrollH(cmPage)).toBe(true);
    const caja = await card.boundingBox();
    expect(caja.x + caja.width).toBeLessThanOrEqual(ancho + 1);
    // Legibilidad en reposo: tamaño efectivo de letra, contraste de pendientes/bloqueadas, etiquetas sin trazos encima
    const leg = await cmPage.evaluate(() => {
      const s = document.querySelector('#cmz-card svg'), r = s.getBoundingClientRect(), k = r.width / s.viewBox.baseVal.width;
      const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x = +x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const bg = lum('rgb(16,24,38)');   // fondo de referencia (más claro que el real: caso desfavorable)
      const ratio = (cls) => { const t = document.querySelector(`.cmz-nd.${cls} text`); const L = lum(getComputedStyle(t).fill); return (L + 0.05) / (bg + 0.05); };
      const textos = [...s.querySelectorAll('.cmz-nd text')].map((t) => t.getBoundingClientRect());
      let cruces = 0, visibles = 0;
      s.querySelectorAll('.cmz-ed').forEach((e) => {
        if (+getComputedStyle(e).opacity <= 0.15) return;
        visibles++;
        const x1 = r.left + e.x1.baseVal.value * k, y1 = r.top + e.y1.baseVal.value * k, x2 = r.left + e.x2.baseVal.value * k, y2 = r.top + e.y2.baseVal.value * k;
        for (let i = 0; i <= 40; i++) { const x = x1 + (x2 - x1) * i / 40, y = y1 + (y2 - y1) * i / 40; if (textos.some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)) { cruces++; break; } }
      });
      return { px: parseFloat(getComputedStyle(s.querySelector('.cmz-nd text')).fontSize) * k, pe: ratio('s-pe'), bl: ratio('s-bl'), cruces, visibles };
    });
    console.log('LEGIBILIDAD ' + ancho + ' ' + JSON.stringify(leg));
    expect(leg.pe).toBeGreaterThanOrEqual(4.5);
    expect(leg.bl).toBeGreaterThanOrEqual(4.5);
    if (!wd) {
      expect(leg.px).toBeGreaterThanOrEqual(10.5);
      expect(leg.visibles).toBe(0);   // en reposo, sin líneas encima de las etiquetas
      expect(leg.cruces).toBe(0);
    }
    await card.screenshot({ path: process.env.CMZ_CAP ? `${process.env.CMZ_CAP}/mapa-${ancho}.png` : undefined, animations: 'disabled' }).catch(() => {});

    // Tocar una materia muestra nombre, año, estado, fecha del final y correlativas
    await cmPage.locator('.cmz-nd[data-code="60-410"]').click();
    const info = card.locator('.cmz-info');
    await expect(info).toContainText('Derecho penal parte general');
    await expect(info).toContainText('2° año');
    await expect(info).toContainText('En curso o con final');
    await expect(info).toContainText('Final: 10/02/2027');
    await expect(info).toContainText('Necesita:');
    await expect(card.locator('.cmz-nd.cmz-sel')).toHaveCount(1);
    // fecha del plan (mes) como respaldo, y bloqueada sin fecha
    await cmPage.locator('.cmz-nd[data-code="60-4310"]').click();
    await expect(info).toContainText('Final: Marzo 2027');
    await cmPage.locator('.cmz-nd[data-code="60-4340"]').click();
    await expect(info).toContainText('Bloqueada: faltan correlativas');
    await expect(info).toContainText('Final: sin fecha');
    await card.screenshot({ path: process.env.CMZ_CAP ? `${process.env.CMZ_CAP}/mapa-${ancho}-seleccion.png` : undefined, animations: 'disabled' }).catch(() => {});
    await info.locator('b').click();   // tocar el panel no limpia la selección
    await expect(card.locator('.cmz-nd.cmz-sel')).toHaveCount(1);
    await card.locator('.cmz-cnt').click();   // tocar afuera de un nodo sí
    await expect(card.locator('.cmz-nd.cmz-sel')).toHaveCount(0);
    await cmPage.locator('.cmz-nd[data-code="60-4340"]').click();
    await cmPage.locator('.cmz-nd[data-code="60-4340"]').click();   // de nuevo: deselecciona
    await expect(card.locator('.cmz-nd.cmz-sel')).toHaveCount(0);
    await cmPage.screenshot({ path: process.env.CMZ_CAP ? `${process.env.CMZ_CAP}/captura-${ancho}.png` : undefined, fullPage: false, animations: 'disabled' }).catch(() => {});
    expect(consoleErrors).toEqual([]);
  });
}

test('constelación: aprobar una materia repinta sin rearmar el mapa; girar la pantalla cambia la orientación', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 1280, height: 800 });
  await armar(cmPage);
  await irAConocimiento(cmPage);
  await cmPage.evaluate(() => { document.querySelector('.cmz-nd[data-code="60-250"]').dataset.marca = 'x'; });
  expect(await clases(cmPage, '60-410')).toContain('s-cu');
  await cmPage.evaluate(() => Correlativas.aprobarMateria('s2_2'));   // 60-410 → aprobada (cierra su final)
  await expect(cmPage.locator('.cmz-nd[data-code="60-410"]')).toHaveClass(/s-ap/);
  expect(await cmPage.locator('.cmz-nd[data-code="60-250"]').getAttribute('data-marca')).toBe('x');   // mismo nodo: no se rearmó
  await expect(cmPage.locator('.cmz-cnt')).toHaveText('7 aprobadas · 2 en curso o con final · 40 pendientes');
  await cmPage.setViewportSize({ width: 390, height: 844 });
  await expect(cmPage.locator('#cmz-card')).not.toHaveClass(/cmz-wd/);
  expect(await cmPage.locator('.cmz-nd').count()).toBe(49);
  await expect(cmPage.locator('.cmz-nd[data-code="60-410"]')).toHaveClass(/s-ap/);   // el estado sobrevive al rearmado
  expect(await sinScrollH(cmPage)).toBe(true);
  await cmPage.setViewportSize({ width: 1280, height: 800 });
  await expect(cmPage.locator('#cmz-card')).toHaveClass(/cmz-wd/);
  expect(consoleErrors).toEqual([]);
});

test('constelación: con movimiento reducido el anillo de "en curso" no se anima', async ({ cmPage }) => {
  await cmPage.emulateMedia({ reducedMotion: 'reduce' });
  await armar(cmPage);
  await irAConocimiento(cmPage);
  const anim = await cmPage.evaluate(() => getComputedStyle(document.querySelector('.cmz-nd.s-cu .cmz-rg')).animationName);
  expect(anim).toBe('none');
});

test('constelación: no está en Conocimiento ni se dibuja hasta abrir el Plan de carrera; al cerrar no anima', async ({ cmPage, consoleErrors }) => {
  await cmPage.setViewportSize({ width: 1280, height: 800 });
  await armar(cmPage);
  await cmPage.evaluate(() => switchTab('conocimiento', document.querySelector('.nav-btn[onclick*="conocimiento"]')));
  await cmPage.evaluate(() => { renderLawProgress(); });
  await expect(cmPage.locator('#tab-conocimiento #cmz-card')).toHaveCount(0);
  expect(await cmPage.locator('.cmz-nd').count()).toBe(0);                 // nada dibujado con la vista cerrada
  await cmPage.evaluate(() => Correlativas.open());
  await expect(cmPage.locator('#ov-carrera #cmz-card')).toBeVisible();
  await expect(cmPage.locator('#ov-carrera .cmz-nd')).toHaveCount(49);
  await expect(cmPage.locator('#ov-carrera .corr-sticky')).toBeVisible();   // la lista de materias sigue debajo
  // sin botón redundante al plan de carrera dentro del mapa
  await expect(cmPage.locator('#cmz-card button')).toHaveCount(0);
  await cmPage.locator('.cmz-nd[data-code="60-410"]').click();
  await expect(cmPage.locator('.cmz-info')).toContainText('Derecho penal parte general');
  await expect(cmPage.locator('.cmz-info button')).toHaveCount(0);
  await cmPage.evaluate(() => CMOverlay.close('ov-carrera'));
  expect(await cmPage.evaluate(() => getComputedStyle(document.querySelector('.cmz-nd.s-cu .cmz-rg')).animationName)).toBe('none');
  expect(consoleErrors).toEqual([]);
});
