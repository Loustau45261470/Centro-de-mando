// HUD D5 — tarjeta «Tendencias» de Vida (fiel a la maqueta): Patrimonio, Gasto diario y Horas de estudio de los últimos 30 días,
// con número grande, comparación honesta, mini gráfico que se dibuja con luz en la punta y valor al tocar (motion.js renderTendencias).
'use strict';
const fs = require('fs');
const { test, expect } = require('./support/fixtures');
const SHOTS = process.env.D5_SHOTS || '';

// Historial inventado SOLO en memoria (nunca se guarda: saveState no corre). 70 días de gastos y Pomodoro, 30 de patrimonio.
const cargar = (page) => page.evaluate(() => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const hoy = getActiveDate(), dia = (n) => CMReportes.repSumarDias(hoy, -n);
  const nw = []; let v = 7200000;
  for (let i = 29; i >= 0; i--) { v += 9000 + (rnd() - .45) * 60000; nw.push({ date: dia(i), value: Math.round(v), c: 1 }); }
  nw.push({ date: dia(45), value: 1, });   // punto viejo sin c:1 (otro cálculo): no debe entrar
  S.nwHistory = nw;
  const tx = [];
  for (let i = 69; i >= 0; i--) { const m = Math.round(15000 + rnd() * 20000 + (i > 29 ? 6000 : 0)); tx.push({ id: 'zt' + i, date: dia(i), name: 'Gasto ' + i, type: 'expense', amount: m, currency: 'ARS', category: 'food' }); }
  tx.push({ id: 'zinc', date: dia(3), name: 'Sueldo', type: 'income', amount: 999999, currency: 'ARS' });   // un ingreso no es gasto
  S.transactions = tx;
  const ph = [];
  for (let i = 69; i >= 0; i--) if (rnd() > .25) ph.push({ id: 'zp' + i, date: dia(i), minutes: Math.round(25 + rnd() * 140), full: true });
  S.pomodoroHistory = ph;
  // lo que la tarjeta tiene que mostrar, calculado aparte
  const d30 = (d) => d >= dia(29) && d <= hoy, dAnt = (d) => d >= dia(59) && d <= dia(30);
  const g = tx.filter((t) => t.type === 'expense' && d30(t.date)).reduce((s, t) => s + t.amount, 0);
  const gA = tx.filter((t) => t.type === 'expense' && dAnt(t.date)).reduce((s, t) => s + t.amount, 0);
  const h = ph.filter((e) => d30(e.date)).reduce((s, e) => s + e.minutes, 0) / 60;
  const hA = ph.filter((e) => dAnt(e.date)).reduce((s, e) => s + e.minutes, 0) / 60;
  const a = nw[0].value, b = nw[29].value;
  return {
    pat: '$' + fmtNum(b), patDl: fmtNum(Math.abs((b - a) / a * 100), 1) + '%', gas: '$' + fmtNum(Math.round(g / 30)) + '/día',
    gasDl: fmtNum(Math.abs((g - gA) / gA * 100), 1) + '%', gasBaja: g < gA, est: fmtNum(h / 30, 1) + ' h/día',
    estDl: fmtNum(Math.abs(h - hA) / 30, 1) + ' h',
  };
});
const prog = (page) => page.evaluate(() => { const st = document.getElementById('tendCard')._tend; return { t0: st.t0, raf: st.raf, filas: st.filas.filter((r) => r.cv).length }; });
const irAVida = async (page) => { await page.click('.nav-btn[data-tab="vida"]'); await expect(page.locator('#tab-vida')).toHaveClass(/active/); };

test.describe('Tendencias D5', () => {
  test('tres filas con datos reales del período, se dibujan al entrar, valor al tocar, pausa fuera de pantalla', async ({ cmPage: page, consoleErrors }) => {
    test.setTimeout(90000);
    const vw = page.viewportSize().width;
    await page.waitForTimeout(2800);   // fuera de la ventana de arranque
    const esp = await cargar(page);
    await irAVida(page);
    const card = page.locator('#tendCard');
    await expect(card).toBeVisible();
    // visible sin scroll: la tarjeta arranca dentro de la primera pantalla
    const box = await card.boundingBox();
    expect(box.y, 'arranca en la primera pantalla').toBeLessThan(page.viewportSize().height * 0.75);
    // a mitad del dibujo: el loop corre y todavía no terminó
    await page.waitForTimeout(450);
    const mid = await prog(page);
    expect(mid.filas).toBe(3);
    expect(mid.t0, 'dibujo en curso').toBeGreaterThan(0);
    expect(mid.raf, 'animando').not.toBe(0);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await card.screenshot({ path: `${SHOTS}/app-${vw}-mid.png` }); }
    await page.waitForTimeout(2200);
    expect((await prog(page)).t0, 'dibujo terminado').toBe(-1);
    // cifras: las mismas que salen de los datos
    const row = (k) => page.locator(`#tendRows .tend-row[data-k="${k}"]`);
    await expect(row('pat').locator('.tend-val')).toHaveText(esp.pat);
    await expect(row('pat').locator('.tend-dl')).toContainText(esp.patDl);
    await expect(row('pat').locator('.tend-dl')).toContainText('desde el');
    await expect(row('gas').locator('.tend-val')).toHaveText(esp.gas);
    await expect(row('gas').locator('.tend-dl')).toContainText(esp.gasDl);
    await expect(row('gas').locator('.tend-dl')).toHaveClass(esp.gasBaja ? /ok/ : /mal/);   // gastar menos es bueno
    await expect(row('est').locator('.tend-val')).toHaveText(esp.est);
    await expect(row('est').locator('.tend-dl')).toContainText(esp.estDl);
    // valor al pasar el mouse / apoyar el dedo
    const cv = row('gas').locator('canvas');
    await cv.scrollIntoViewIfNeeded();
    const cb = await cv.boundingBox();
    await page.mouse.move(cb.x + cb.width * 0.6, cb.y + cb.height / 2);
    await page.waitForTimeout(120);
    const tip = await page.evaluate(() => document.getElementById('tendCard')._tend.tip);
    expect(tip, 'tooltip con la semana y el promedio por día').toMatch(/^\d{1,2}( [a-z]{3})?–\d{1,2} [a-z]{3} · \$[\d.]+\/día$/);
    if (SHOTS) await card.screenshot({ path: `${SHOTS}/app-${vw}.png` });
    await page.mouse.move(2, 2); await page.waitForTimeout(120);
    expect(await page.evaluate(() => document.getElementById('tendCard')._tend.tip)).toBeNull();
    // guardar no re-dibuja
    await page.evaluate(() => { saveState(); if (window.JARVIS_INTEL) JARVIS_INTEL.renderCard('vida'); });
    await page.waitForTimeout(200);
    expect((await prog(page)).t0, 'guardar no re-anima').toBe(-1);
    // fuera de pantalla: el loop de la luz se detiene
    await page.evaluate(() => { const sp = document.createElement('div'); sp.id = 'zz-relleno'; sp.style.height = '3000px'; document.getElementById('tab-vida').appendChild(sp); sp.scrollIntoView({ block: 'end', behavior: 'instant' }); });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('tendCard').getBoundingClientRect().bottom < 0)).toBe(true);
    expect((await prog(page)).raf, 'sin loop fuera de pantalla').toBe(0);
    await page.evaluate(() => { document.getElementById('zz-relleno').remove(); document.getElementById('tendCard').scrollIntoView({ block: 'start', behavior: 'instant' }); });
    await page.waitForTimeout(300);
    expect((await prog(page)).raf, 'vuelve a latir en pantalla').not.toBe(0);
    // otra sección: se detiene
    await page.click('.nav-btn[data-tab="finanzas"]');
    await page.waitForTimeout(300);
    expect((await prog(page)).raf, 'sin loop en otra sección').toBe(0);
    // 390: sin scroll horizontal y la tarjeta dentro del ancho
    await irAVida(page);
    const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, r: document.getElementById('tendCard').getBoundingClientRect().right,
      app: (document.getElementById('app') || document.body).scrollWidth - (document.getElementById('app') || document.body).clientWidth }));
    expect(ancho.sw).toBeLessThanOrEqual(ancho.iw);
    expect(ancho.r).toBeLessThanOrEqual(ancho.iw);
    expect(ancho.app, 'sin scroll horizontal del contenido').toBeLessThanOrEqual(0);
    expect(consoleErrors).toEqual([]);
  });

  test('con pocos datos: mensajes claros, sin gráficos vacíos ni cifras inventadas', async ({ cmPage: page, consoleErrors }) => {
    const vw = page.viewportSize().width;
    await page.waitForTimeout(2800);
    await page.evaluate(() => {
      S.nwHistory = [{ date: getActiveDate(), value: 5000000, c: 1 }];   // un solo registro
      S.pomodoroHistory = [{ id: 'zp', date: getActiveDate(), minutes: 50 }];   // un solo día de registros: promedio de ese día, sin gráfico
      // fixture: los gastos son de agosto → nada en los últimos 30 días
    });
    await irAVida(page);
    await page.waitForTimeout(300);
    const row = (k) => page.locator(`#tendRows .tend-row[data-k="${k}"]`);
    await expect(row('pat').locator('.tend-vacio')).toHaveText('Falta otro día de registro para ver la tendencia');
    await expect(row('pat').locator('.tend-val')).toHaveText('$5.000.000');
    await expect(row('gas').locator('.tend-vacio')).toHaveText('No hay gastos registrados en los últimos 30 días');
    await expect(row('est').locator('.tend-val')).toHaveText('0,8 h/día');
    await expect(row('est').locator('.tend-vacio')).toHaveText('Con una semana de registros se dibuja la tendencia');
    await expect(page.locator('#tendRows canvas')).toHaveCount(0);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.locator('#tendCard').screenshot({ path: `${SHOTS}/app-${vw}-pocos.png` }); }
    // 10 días de Pomodoro (1 h por día): el promedio se divide por esos 10 días, no por 30; sin comparación (antes no había registros)
    await page.evaluate(() => { S.pomodoroHistory = []; for (let i = 0; i < 10; i++) S.pomodoroHistory.push({ id: 'zq' + i, date: CMReportes.repSumarDias(getActiveDate(), -i), minutes: 60 }); });
    await page.click('.nav-btn[data-tab="finanzas"]'); await irAVida(page); await page.waitForTimeout(200);
    await expect(row('est').locator('.tend-val')).toHaveText('1,0 h/día');
    await expect(row('est').locator('.tend-dl')).toHaveText('sin datos de los 30 días previos');
    await expect(row('est').locator('canvas')).toHaveCount(1);
    if (SHOTS) await page.locator('#tendCard').screenshot({ path: `${SHOTS}/app-${vw}-pocos2.png` });
    await page.evaluate(() => { S.nwHistory = []; S.pomodoroHistory = []; });
    await page.click('.nav-btn[data-tab="finanzas"]'); await irAVida(page); await page.waitForTimeout(200);
    await expect(row('pat').locator('.tend-val')).toHaveText('—');
    await expect(row('est').locator('.tend-val')).toHaveText('—');   // sin ningún registro no es «0 h», es desconocido
    await expect(row('est').locator('.tend-vacio')).toHaveText('No hay sesiones de Pomodoro en los últimos 30 días');
    await expect(page.locator('#tendRows canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Tendencias D5 · reducir movimiento', () => {
  test.use({ reducedMotion: 'reduce' });
  test('aparece completa y quieta, sin loop', async ({ cmPage: page, consoleErrors }) => {
    await page.waitForTimeout(2800);
    await cargar(page);
    await irAVida(page);
    await page.waitForTimeout(200);
    const p = await prog(page);
    expect(p.filas).toBe(3);
    expect(p.t0, 'sin dibujo').toBe(-1);
    expect(p.raf, 'sin loop').toBe(0);
    await page.waitForTimeout(300);
    expect((await prog(page)).raf).toBe(0);
    expect(consoleErrors).toEqual([]);
  });
});
