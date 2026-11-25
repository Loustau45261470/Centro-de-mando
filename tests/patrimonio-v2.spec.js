// Card PATRIMONIO de Finanzas, segunda versión: dona holograma (canvas propio, dona-holograma.js) con el total adentro (formato argentino), gráfico de evolución con una sola
// serie elegible, categorías de cuentas propias, deudas cobradas (saldo 0) fuera de las listas y deshacer un cobro sin la cuenta.
// Los datos de ejemplo viven acá; el código de producción no trae ninguna cuenta.
'use strict';
const { test, expect } = require('./support/fixtures');

// Medido en HEAD (antes de la v2), mismo viewport 1280: gráfico de línea en un contenedor de 148 px.
const ANTES = { altoGrafico: 148 };
// Medido antes del pedido «dona más grande + 19 px + 2 cm de gráfico + números verdes» (mismo viewport): dona 210 px a 1280 y ~199 a 390,
// aro 198 px, 14 px entre la dona y los chips, gráfico de 186 px.
const PREVIO = { canvas1280: 210, canvas390: 199, aro: 198, aire: 14, grafico: 186 };
// Medido con la dona Chart.js anterior (mismo viewport): el aro de marcas (lo más externo de la dona) quedaba 16 px por debajo del bloque del total
// (10 de separación del bloque + 6 de margen). Pedido: 19 px (0,5 cm) menos entre la dona y el bloque del total de arriba.
const DIAL_TOP_PREVIO = 16;
// Variante A del prototipo: anillo de .785 del lado de su lienzo (R .34 + grosor .105 / 2), lienzo tope de 440 px.
const aroA = (ancho) => .785 * Math.min(ancho, 440);

const CUENTAS = [
  { id: 'a1', name: 'Ualá', type: 'bank', balance: 2150000, currency: 'ARS', icon: '🏦' },
  { id: 'a2', name: 'Efectivo', type: 'cash', balance: 180000, currency: 'ARS', icon: '💵' },
  { id: 'a3', name: 'Inversiones', type: 'invest', balance: 4900000, currency: 'ARS', icon: '📈' },
  { id: 'a4', name: 'A cobrar · Didi', type: 'prestamo', balance: 655408, currency: 'ARS', icon: '🤝' },
  { id: 'a5', name: 'A cobrar · Mamá', type: 'prestamo', balance: 0, currency: 'ARS', icon: '🤝' },
  { id: 'a6', name: 'Fondo', type: 'other', balance: 100000, currency: 'ARS', icon: '💼' },
];
const HOY = '2026-11-23';

async function preparar(page, { ancho = 1280 } = {}) {
  await page.setViewportSize({ width: ancho, height: 1000 });
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.waitForFunction(() => typeof nwLineInst !== 'undefined' && !!nwLineInst);
  await page.evaluate(({ cuentas, hoy }) => {
    window.getActiveDate = () => hoy;
    window.confirm = () => true;
    S.accounts = cuentas.map((a) => ({ ...a }));
    S.accountTypes = [];
    S.cards = []; S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = []; S.coverCollections = [];
    S.nwHistory = []; S.accountHistory = [];
    const d0 = new Date(hoy + 'T00:00:00Z');
    for (let i = 60; i >= 0; i--) {
      const d = new Date(d0); d.setUTCDate(d.getUTCDate() - i);
      const ds = d.toISOString().slice(0, 10), k = 60 - i;
      const b = { a1: 1500000 + k * 10800, a2: 150000 + (k % 7) * 4000, a3: 4000000 + k * 15000, a4: 400000 + k * 4200, a5: 0, a6: 100000 };
      S.nwHistory.push({ date: ds, value: Object.values(b).reduce((s, v) => s + v, 0), c: 1 });
      Object.entries(b).forEach(([id, balance]) => S.accountHistory.push({ date: ds, accountId: id, balance }));
    }
    renderFinanzasTab();
  }, { cuentas: CUENTAS, hoy: HOY });
}

const card = (page) => page.locator('#nwTotal').locator('xpath=ancestor::div[contains(@class,"card")][1]');
const serie = (page) => page.evaluate(() => ({ n: nwLineInst.data.datasets.length, label: nwLineInst.data.datasets[0].label, data: nwLineInst.data.datasets[0].data.filter((v) => v != null),
  min: nwLineInst.scales.y.min, max: nwLineInst.scales.y.max }));
const toastTxt = (page) => page.locator('#toast .ts').last().innerText();
const donaSt = (page) => page.evaluate(() => { const s = nwPieInst.estado; return { W: s.W, H: s.H, D: s.D, RO: s.RO, RT: s.RT, top: s.top, wide: s.wide }; });
// Punto (en px del canvas) sobre el aro, en el medio de la porción de una categoría: ahí hay que tocar para elegirla.
const puntoDe = (page, id) => page.evaluate((id) => { const s = nwPieInst.estado, it = s.items.find((x) => x.id === id), a = (it.a0 + it.a1) / 2 - Math.PI / 2, r = s.RO - s.RT * .4; return { x: s.W / 2 + Math.cos(a) * r, y: s.H / 2 + Math.sin(a) * r }; }, id);
const frames = (page) => page.evaluate(() => nwPieInst.frames);

test.describe('Patrimonio v2', () => {
  test('dona holograma: canvas propio (no Chart.js), del tamaño de la variante A, con el total del patrimonio adentro en formato argentino', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const total = await page.evaluate(() => fmtMoney(calcNetWorth(), 'USD'));
    expect(total).toBe('$7.985.408');   // 2.150.000 + 180.000 + 4.900.000 + 655.408 + 100.000
    await expect(page.locator('#nwTotal')).toHaveText('$7.985.408');
    await expect(page.locator('#nwDonaNum')).toHaveText('$7.985.408');
    await expect(page.locator('#nwDonaLbl')).toHaveText('Patrimonio');
    const m = await page.evaluate(() => {
      const cv = document.getElementById('nwPieChart'), r = cv.getBoundingClientRect(), ce = document.querySelector('.nw-dona-centro').getBoundingClientRect(), s = nwPieInst.estado;
      return { tag: cv.tagName, propio: !Chart.getChart(cv), dial: typeof _nwDialPlugin, w: r.width, h: r.height, D: s.D, RT: s.RT, wide: s.wide,
        cx: ce.left + ce.width / 2 - (r.left + r.width / 2), cy: ce.top + ce.height / 2 - (r.top + r.height / 2),
        inside: ce.left >= r.left - 1 && ce.right <= r.right + 1 && ce.top >= r.top - 1 && ce.bottom <= r.bottom + 1, bitmap: cv.width > 0 && cv.height > 0 };
    });
    expect(m.tag).toBe('CANVAS');
    expect(m.propio, 'la dona ya no es una instancia de Chart.js').toBe(true);
    expect(m.dial, 'el plugin del dial de Chart.js se quitó').toBe('undefined');
    expect(m.bitmap).toBe(true);
    // el anillo tiene el diámetro y el grosor de A (R .34, grosor .105 de un lienzo de 440): 345 px de diámetro como máximo
    expect(m.D, 'el diámetro del anillo es el de A (>= 98%)').toBeGreaterThanOrEqual(aroA(m.w) * .98);
    expect(m.D, 'y mucho más grande que el aro anterior').toBeGreaterThan(PREVIO.aro * 1.5);
    expect(m.RT / m.D).toBeCloseTo(.105 / .785, 3);
    expect(m.wide, 'a 1280 las etiquetas con línea guía entran afuera del anillo').toBe(true);
    expect(m.inside).toBe(true);
    expect(Math.abs(m.cx)).toBeLessThan(2);
    expect(Math.abs(m.cy)).toBeLessThan(2);
    // accesibilidad: role="img" y aria-label con los montos
    const lab = await page.getAttribute('#nwPieChart', 'aria-label'), role = await page.getAttribute('#nwPieChart', 'role');
    expect(role).toBe('img');
    expect(lab).toContain('Patrimonio $7.985.408');
    expect(lab).toContain('Cuentas $2.150.000 (26,9%)');
    expect(lab).toContain('Inversión $4.900.000 (61,4%)');
    expect(lab).not.toContain('Mamá');
    // la deuda en 0 no es una porción ni un chip de la leyenda; "Otros" sí (tiene "Fondo")
    const leyenda = await page.$$eval('#nwLegend .nw-leg-item:not(.nw-leg-edit)', (els) => els.map((e) => e.textContent.trim()));
    expect(leyenda).toEqual(['Cuentas', 'Efectivo', 'Inversión', 'Préstamo', 'Otros']);
    expect(consoleErrors).toEqual([]);
  });

  test('formato argentino: fmtMoney, ejes y tooltips del gráfico', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const r = await page.evaluate(() => ({
      a: fmtMoney(7985408, 'USD'), b: fmtMoney(1234.5, 'ARS', 2), c: fmtMoney(-5000, 'ARS'), d: fmtMoney(0.2, 'USD'), e: fmtMoney(-0.2, 'USD'), n: fmtNum(1234567.891, 1),
      ticks: nwLineInst.scales.y.ticks.map((t) => t.label),
      tip: fmtMoney(5797041.02, 'USD'),   // el valor del crosshair HUD usa fmtMoney (el tooltip nativo se reemplazó)
      loc: Chart.defaults.locale,
    }));
    expect(r.a).toBe('$7.985.408');
    expect(r.b).toBe('ARS 1.234,50');
    expect(r.c).toBe('-ARS 5.000');
    expect(r.d).toBe('$0');
    expect(r.e).toBe('$0');
    expect(r.n).toBe('1.234.567,9');
    expect(r.ticks.length).toBeGreaterThan(2);
    for (const t of r.ticks) expect(t).toMatch(/^\$\d{1,3}(\.\d{3})*$/);
    expect(r.tip).toBe('$5.797.041');
    expect(r.loc).toBe('es-AR');
    expect(consoleErrors).toEqual([]);
  });

  test('gráfico de evolución: una sola serie, el selector la cambia y el eje se ajusta; sin casillas abajo', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const total = await serie(page);
    expect(total.n).toBe(1);
    expect(total.label).toBe('Patrimonio total');
    expect(await page.evaluate(() => nwLineInst.options.plugins.legend.display)).toBe(false);
    expect(total.min).toBeGreaterThan(5000000);
    // sin casillas ni nombres de cuentas debajo del gráfico
    expect(await card(page).locator('input[type="checkbox"]').count()).toBe(0);
    expect(await page.locator('#nwAccountToggles, .nw-acc-toggles, .nw-acc-toggle, #nwScaleNote').count()).toBe(0);

    await page.selectOption('#nwSeriesSel', 'a:a2');   // Efectivo: ~150-180 mil
    const ef = await serie(page);
    expect(ef.n).toBe(1);
    expect(ef.label).toBe('Efectivo');
    expect(ef.max).toBeLessThan(400000);
    expect(ef.min).toBeLessThan(ef.max);
    expect(ef.min, 'el eje no queda en el rango del total').toBeLessThan(400000);

    await page.selectOption('#nwSeriesSel', 't:invest');   // categoría
    const inv = await serie(page);
    expect(inv.label).toBe('Inversión');
    expect(inv.min).toBeGreaterThanOrEqual(3500000);
    expect(inv.max).toBeLessThan(5500000);

    await page.selectOption('#nwSeriesSel', 'total');
    expect((await serie(page)).label).toBe('Patrimonio total');
    // grupos del selector: Total, Categorías, Cuentas; la deuda en 0 no está
    const opts = await page.$$eval('#nwSeriesSel option', (os) => os.map((o) => o.value));
    expect(opts[0]).toBe('total');
    expect(opts).toContain('t:bank');
    expect(opts).toContain('a:a4');
    expect(opts).not.toContain('a:a5');
    expect(consoleErrors).toEqual([]);
  });

  test('tocar una porción de la dona elige esa serie; la leyenda también', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const pt = await puntoDe(page, 'invest');
    await page.locator('#nwPieChart').click({ position: pt });
    await expect(page.locator('#nwSeriesSel')).toHaveValue('t:invest');
    expect((await serie(page)).label).toBe('Inversión');
    await expect(page.locator('#nwLegend .nw-leg-item.on')).toHaveText(/Inversión/);
    await page.locator('#nwLegend .nw-leg-item', { hasText: 'Efectivo' }).click();
    await expect(page.locator('#nwSeriesSel')).toHaveValue('t:cash');
    expect((await serie(page)).label).toBe('Efectivo');
    // tocar otra porción (Cuentas) también la elige, y tocar el hueco del centro no cambia nada
    await page.locator('#nwPieChart').click({ position: await puntoDe(page, 'bank') });
    await expect(page.locator('#nwSeriesSel')).toHaveValue('t:bank');
    const st = await donaSt(page);
    await page.locator('#nwPieChart').click({ position: { x: st.W / 2, y: st.H / 2 } });
    await expect(page.locator('#nwSeriesSel')).toHaveValue('t:bank');
    expect(consoleErrors).toEqual([]);
  });

  test('pasar el mouse por una porción muestra la categoría en el centro y un tooltip; al salir vuelve el total', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    await page.locator('#nwPieChart').hover({ position: await puntoDe(page, 'invest') });
    await expect(page.locator('#nwDonaLbl')).toHaveText('Inversión');
    await expect(page.locator('#nwDonaNum')).toHaveText('$4.900.000');
    await expect(page.locator('#nwDonaSub')).toHaveText('61,4% del total');
    await expect(page.locator('.nw-dona-tip')).toHaveText('Inversión: $4.900.000 · 61,4%');
    await expect(page.locator('.nw-dona-tip')).toBeVisible();
    await page.mouse.move(2, 2);   // afuera de la dona
    await expect(page.locator('#nwDonaLbl')).toHaveText('Patrimonio');
    await expect(page.locator('#nwDonaNum')).toHaveText('$7.985.408');
    await expect(page.locator('.nw-dona-tip')).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });

  test('el gráfico de línea mide 124 px (achicado para alinear el fin de Patrimonio con el de Hábitos) y no muestra las fechas del eje X', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const h = await page.evaluate(() => document.getElementById('nwLineChart').closest('.chart-wrap').getBoundingClientRect().height);
    expect(h).toBe(124);
    const x = await page.evaluate(() => ({ display: nwLineInst.options.scales.x.ticks.display }));
    expect(x.display).toBe(false);
    // el eje Y con los montos se mantiene
    const y = await page.evaluate(() => nwLineInst.scales.y.ticks.map((t) => t.label));
    expect(y.length).toBeGreaterThan(2);
    expect(y.every((t) => t.startsWith('$'))).toBe(true);
    // y cambiar el rango/serie no los trae de vuelta
    await page.click('#nwRangeSeg button[data-range="1M"]');
    expect(await page.evaluate(() => nwLineInst.options.scales.x.ticks.display)).toBe(false);
    expect(consoleErrors).toEqual([]);
  });

  test('los números blancos pasan al verde con brillo de los KPI de Finanzas (mismo color, brillo y fuente)', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    // referencia: el KPI "Balance" de la sección Finanzas (el «+242k» verde con brillo)
    await page.click('.nav-btn[data-tab="finanzas"]');
    await page.evaluate(() => { const t = document.querySelector('#tab-finanzas .kpi-tile .k-val') || (() => { const d = document.createElement('div'); d.className = 'kpi-tile'; d.innerHTML = '<div class="k-val">+242k</div>'; document.querySelector('#tab-finanzas').appendChild(d); return d.firstChild; })(); t.id = 'refVerde'; });
    const css = (sel) => page.evaluate((s) => { const c = getComputedStyle(document.querySelector(s)); return { color: c.color, shadow: c.textShadow, family: c.fontFamily, weight: c.fontWeight }; }, sel);
    const ref = await css('#refVerde'), total = await css('#nwTotal'), centro = await css('#nwDonaNum');
    for (const e of [total, centro]) {
      expect(e.color).toBe(ref.color);
      expect(e.shadow).toBe(ref.shadow);
      expect(e.family).toBe(ref.family);
      expect(e.weight).toBe(ref.weight);
    }
    expect(ref.color).not.toBe('rgb(255, 255, 255)');
    expect(consoleErrors).toEqual([]);
  });

  test('dona con aspecto holograma: bloques LED con la paleta de las categorías, escaneo y anillos; con movimiento reducido queda quieta', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    // 72 bloques de colores sobre el aro (con el color de neón de cada categoría): hay píxeles pintados y del tono de cada categoría
    await page.evaluate(() => { nwPieInst.estado.t = 9.3; nwPieInst.draw(); });
    const px = await page.evaluate(() => {
      const cv = document.getElementById('nwPieChart'), s = nwPieInst.estado, k = cv.width / s.W, ctx = cv.getContext('2d');
      const en = (ang, r) => Array.from(ctx.getImageData(Math.round((s.W / 2 + Math.cos(ang) * r) * k), Math.round((s.H / 2 + Math.sin(ang) * r) * k), 1, 1).data);
      const it = (id) => s.items.find((x) => x.id === id), mid = (x) => (x.a0 + x.a1) / 2 - Math.PI / 2;
      return { inv: en(mid(it('invest')), s.RO - s.RT * .2), bank: en(mid(it('bank')), s.RO - s.RT * .2) };
    });
    expect(px.inv[3], 'bloque de Inversión pintado').toBeGreaterThan(120);
    expect(px.inv[2], 'Inversión es azul/violeta').toBeGreaterThan(px.inv[1]);
    expect(px.bank[3]).toBeGreaterThan(120);
    expect(px.bank[1], 'Cuentas es verde').toBeGreaterThan(px.bank[0]);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.nw-dona'), '::after').backgroundImage)).toContain('repeating-linear-gradient');
    // movimiento reducido: sin cuadros nuevos, sin banda de escaneo, y sigue dibujada
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => page.evaluate(() => nwPieInst.corriendo)).toBe(false);
    const f0 = await frames(page);
    await page.waitForTimeout(600);
    expect(await frames(page)).toBe(f0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.nw-dona'), '::before').display)).toBe('none');
    expect(await page.evaluate(() => { const cv = document.getElementById('nwPieChart'), s = nwPieInst.estado, k = cv.width / s.W; return cv.getContext('2d').getImageData(Math.round((s.W / 2 + s.RO - s.RT * .2) * k), Math.round(s.H / 2 * k), 1, 1).data[3]; })).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => page.evaluate(() => nwPieInst.corriendo)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('un solo requestAnimationFrame: se pausa con la página oculta y con otra pestaña, y retoma al volver', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    await expect.poll(() => page.evaluate(() => nwPieInst.corriendo)).toBe(true);
    await expect.poll(() => frames(page), { timeout: 15000 }).toBeGreaterThan(1);
    // página oculta (visibilitychange)
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await page.evaluate(() => nwPieInst.corriendo)).toBe(false);
    const f0 = await frames(page);
    await page.waitForTimeout(800);
    expect(await frames(page), 'sin cuadros con la página oculta').toBe(f0);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => frames(page), { timeout: 15000 }).toBeGreaterThan(f0);
    // pestaña Finanzas cerrada (otra pestaña activa): también se detiene
    await page.click('.nav-btn[data-tab="vida"]');
    await expect.poll(() => page.evaluate(() => nwPieInst.corriendo)).toBe(false);
    const f1 = await frames(page);
    await page.waitForTimeout(800);
    expect(await frames(page), 'sin cuadros con la pestaña Finanzas cerrada').toBe(f1);
    await page.click('.nav-btn[data-tab="finanzas"]');
    await expect.poll(() => page.evaluate(() => nwPieInst.corriendo)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('separación con el bloque del total: 19 px (0,5 cm) menos que antes entre la dona y el total de arriba', async ({ cmPage: page, consoleErrors }) => {
    for (const ancho of [1280, 390]) {
      await preparar(page, { ancho });
      const d = await page.evaluate(() => {
        const cv = document.getElementById('nwPieChart').getBoundingClientRect(), hero = document.querySelector('.nw-hero-text').getBoundingClientRect(), s = nwPieInst.estado;
        return { visible: cv.top + s.top - hero.bottom, anillo: cv.top + s.H / 2 - s.RO - hero.bottom };
      });
      // lo más externo de la dona (anillo giratorio) respecto del fin del bloque del total: antes +16 px, ahora -3 (19 px menos)
      expect(d.visible, `a ${ancho}px`).toBeLessThanOrEqual(DIAL_TOP_PREVIO - 19 + 1);
      expect(d.visible).toBeGreaterThanOrEqual(DIAL_TOP_PREVIO - 19 - 2);
      // y los bloques de color (antes a 29 px del total) quedan bastante más cerca
      expect(d.anillo).toBeLessThan(29 - 19 + 14);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('categorías: al menos 19 px más de aire debajo de la dona que antes (el aire visible no se achicó)', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const aire = await page.evaluate(() => { const cv = document.getElementById('nwPieChart').getBoundingClientRect(); return document.querySelector('#nwLegend .nw-leg-item').getBoundingClientRect().top - (cv.bottom - nwPieInst.estado.top); });
    expect(aire).toBeGreaterThanOrEqual(PREVIO.aire + 19 - 1);
    expect(consoleErrors).toEqual([]);
  });

  test('crear una categoría "cuenta como cash" cambia el Cash; una sin cash no', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const cash0 = await page.evaluate(() => calcCash());
    expect(cash0).toBe(2150000 + 180000 + 655408);
    await page.locator('#nwLegend .nw-leg-edit').click();
    await expect(page.locator('#modal-acct-types')).toHaveClass(/open/);
    await page.fill('#atName', 'Ahorros');
    await page.fill('#atIcon', '💰');
    await page.check('#atCash');
    await page.click('#atSave');
    const tipo = await page.evaluate(() => S.accountTypes.find((t) => t.label === 'Ahorros'));
    expect(tipo).toMatchObject({ label: 'Ahorros', icon: '💰', cash: true });
    expect(tipo.id).toMatch(/^at_/);
    expect(await page.evaluate(() => S.accountTypes.length)).toBe(6);   // las 5 de fábrica + la nueva
    await page.click('#modal-acct-types .modal-actions .btn-ghost >> text=Cerrar');
    // pasar "Fondo" (Otros, no cash) a la nueva categoría
    await page.evaluate(() => openEditAccount('a6'));
    await page.selectOption('#editAccType', tipo.id);
    await page.evaluate(() => saveEditAccount());
    expect(await page.evaluate(() => calcCash())).toBe(cash0 + 100000);
    await expect(card(page).locator('#nwCash')).toHaveText('$3.085.408');
    // el patrimonio no cambia (el cash no suma ni resta, solo reparte)
    expect(await page.evaluate(() => calcNetWorth())).toBe(7985408);
    // aparece en la leyenda, el selector de tipo del modal y la lista de cuentas
    await expect(page.locator('#nwLegend .nw-leg-item', { hasText: 'Ahorros' })).toHaveCount(1);
    expect(await page.$$eval('#accType option', (os) => os.map((o) => o.value))).toContain(tipo.id);
    await expect(page.locator('#accountList .account-row', { hasText: 'Fondo' }).locator('.account-type')).toHaveText('Ahorros');
    // una categoría sin "cash" no mueve el Cash
    await page.evaluate(() => { S.accountTypes.push({ id: 'at_nocash', label: 'Cripto', icon: '🪙', color: '#ff00aa', cash: false }); S.accounts.find((a) => a.id === 'a1').type = 'at_nocash'; renderFinanzasTab(); });
    expect(await page.evaluate(() => calcCash())).toBe(cash0 + 100000 - 2150000);
    expect(await page.evaluate(() => calcNetWorth())).toBe(7985408);
    expect(consoleErrors).toEqual([]);
  });

  test('borrar una categoría con cuentas obliga a elegir a cuál pasarlas; "Otros" no se puede borrar', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    await page.evaluate(() => {
      S.accountTypes = [..._ACCT_BUILTIN.map((t) => ({ ...t })), { id: 'at_x', label: 'Ahorros', icon: '💰', color: '#ffaa00', cash: true }];
      S.accounts.find((a) => a.id === 'a6').type = 'at_x';
      renderFinanzasTab();
    });
    await page.evaluate(() => openAcctTypes());
    // protegidas: el botón de borrar está deshabilitado
    for (const id of ['other', 'invest', 'prestamo']) await expect(page.locator(`.at-row[data-at="${id}"] .at-del`)).toBeDisabled();
    const cash0 = await page.evaluate(() => calcCash());
    await page.locator('.at-row[data-at="at_x"] .at-del').click();
    await expect(page.locator('#atDel')).toBeVisible();
    // sin elegir destino no borra
    await page.click('#atDel .at-del-btn');
    expect(await page.evaluate(() => S.accountTypes.some((t) => t.id === 'at_x'))).toBe(true);
    expect(await page.evaluate(() => S.accounts.find((a) => a.id === 'a6').type)).toBe('at_x');
    await page.selectOption('#atDelTo', 'other');
    await page.click('#atDel .at-del-btn');
    expect(await page.evaluate(() => S.accountTypes.some((t) => t.id === 'at_x'))).toBe(false);
    expect(await page.evaluate(() => S.accounts.find((a) => a.id === 'a6').type)).toBe('other');
    expect(await page.evaluate(() => calcCash())).toBe(cash0 - 100000);   // pasó a "Otros" (no cash)
    // una categoría sin cuentas se borra con confirmación y sin pedir destino
    await page.evaluate(() => { S.accountTypes.push({ id: 'at_y', label: 'Vacía', icon: '🗑️', color: '#123456', cash: false }); renderAcctTypesList(); });
    await page.locator('.at-row[data-at="at_y"] .at-del').click();
    expect(await page.evaluate(() => S.accountTypes.some((t) => t.id === 'at_y'))).toBe(false);
    expect(consoleErrors).toEqual([]);
  });

  test('deuda cobrada (saldo 0): oculta en lista, dona, selector y destinos; reaparece al subir el saldo; no se borra nada', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const filas = () => page.$$eval('#accountList .account-name', (els) => els.map((e) => e.textContent.trim()));
    expect(await filas()).not.toContain('A cobrar · Mamá');
    expect(await filas()).toContain('A cobrar · Didi');
    expect(await page.evaluate(() => S.accounts.some((a) => a.id === 'a5' && a.balance === 0))).toBe(true);   // intacta en los datos
    expect(await page.$$eval('#nwSeriesSel option', (os) => os.map((o) => o.value))).not.toContain('a:a5');
    await page.evaluate(() => openMoveMoney());
    expect(await page.$$eval('#moveFrom option', (os) => os.map((o) => o.textContent))).not.toEqual(expect.arrayContaining([expect.stringContaining('Mamá')]));
    expect(await page.$$eval('#moveFrom option', (os) => os.map((o) => o.textContent))).toEqual(expect.arrayContaining([expect.stringContaining('Didi')]));
    await page.evaluate(() => closeModal('modal-move-money'));
    // con todas las deudas en 0, "Préstamo" desaparece de la dona y de la leyenda
    await page.evaluate(() => { S.accounts.find((a) => a.id === 'a4').balance = 0; renderFinanzasTab(); });
    expect(await page.$$eval('#nwLegend .nw-leg-item:not(.nw-leg-edit)', (els) => els.map((e) => e.textContent.trim()))).not.toContain('Préstamo');
    expect(await page.evaluate(() => nwPieInst.estado.items.map((i) => i.label))).not.toContain('Préstamo');
    // la serie elegida sobre una deuda que se salda vuelve a Total
    await page.evaluate(() => { S.accounts.find((a) => a.id === 'a4').balance = 500; renderFinanzasTab(); });
    await page.selectOption('#nwSeriesSel', 'a:a4');
    await page.evaluate(() => { S.accounts.find((a) => a.id === 'a4').balance = 0; renderFinanzasTab(); });
    await expect(page.locator('#nwSeriesSel')).toHaveValue('total');
    // reaparece sola con una compra cubierta nueva de la misma persona (_coverApply reusa la cuenta por nombre)
    await page.evaluate(() => { _coverApply({ amount: 5000, cover: { who: 'Mamá' } }); renderFinanzasTab(); });
    expect(await filas()).toContain('A cobrar · Mamá');
    expect(await page.evaluate(() => S.accounts.filter((a) => a.name === 'A cobrar · Mamá').length)).toBe(1);
    expect(await page.$$eval('#nwSeriesSel option', (os) => os.map((o) => o.value))).toContain('a:a5');
    expect(consoleErrors).toEqual([]);
  });

  test('deshacer un cobro cuya cuenta "A cobrar" ya no existe: no rompe, deshace lo que puede y avisa', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const r = await page.evaluate(() => {
      S.cardCharges = [{ id: 'c1', cardId: 'k', date: '2026-10-01', amount: 3000, mode: 'now1', cover: { who: 'Zeta', accountId: 'cuenta-borrada', periods: [{ month: '2026-11', amount: 1000, collected: 1000 }] } }];
      S.coverCollections = [{ id: 'cc1', date: '2026-11-20', accountId: 'cuenta-borrada', toAccountId: 'a1', applied: [{ chargeId: 'c1', month: '2026-11', amount: 1000 }], extraTxnId: '' }];
      S.accounts.find((a) => a.id === 'a1').balance = 5000;
      let err = null;
      try { undoCoverCollection('cc1'); } catch (e) { err = String(e); }
      return { err, collected: S.cardCharges[0].cover.periods[0].collected, quedan: S.coverCollections.length, a1: S.accounts.find((a) => a.id === 'a1').balance };
    });
    expect(r.err).toBeNull();
    expect(r.quedan).toBe(0);
    expect(r.collected).toBe(0);   // la cuota vuelve a figurar como pendiente
    expect(r.a1).toBe(4000);       // la cuenta de destino sí se descuenta
    expect(await toastTxt(page)).toMatch(/ya no existe la cuenta "A cobrar"/);
    expect(consoleErrors).toEqual([]);
  });

  // Orden vertical: total -> dona (centrada en la card) -> chips y botón de categorías -> selector, rango y gráfico. Sin cajas que se pisen.
  for (const ancho of [1280, 390]) {
    test(`acomodo a ${ancho} px: dona centrada debajo del total, categorías debajo de la dona y sin superposiciones`, async ({ cmPage: page, consoleErrors }) => {
      await preparar(page, { ancho });
      await page.waitForTimeout(300);
      const g = await page.evaluate(() => {
        const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const card = document.getElementById('nwTotal').closest('.card');
        const chips = [...document.querySelectorAll('#nwLegend .nw-leg-item:not(.nw-leg-edit)')].map(R);
        const dv = R(document.querySelector('.nw-dona')), top = nwPieInst.estado.top;   // la dona "visible" = hasta el anillo giratorio más externo
        return { card: R(card), total: R(document.getElementById('nwTotal')), cash: R(document.getElementById('nwCash')), dona: { l: dv.l, r: dv.r, t: dv.t + top, b: dv.b - top },
          canvas: R(document.getElementById('nwPieChart')), centro: R(document.querySelector('.nw-dona-centro')), chips, edit: R(document.querySelector('#nwLegend .nw-leg-edit')),
          ctl: R(document.querySelector('.nw-ctl')), graf: R(document.querySelector('.chart-wrap')), scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
          cardOverflow: card.scrollWidth - card.clientWidth };
      });
      const sep = (a, b) => a.b <= b.t + 1 || b.b <= a.t + 1 || a.r <= b.l + 1 || b.r <= a.l + 1;
      // dona centrada horizontalmente en la card, debajo del total
      expect(Math.abs((g.dona.l + g.dona.r) / 2 - (g.card.l + g.card.r) / 2)).toBeLessThan(2);
      expect(g.canvas.r - g.canvas.l).toBeGreaterThanOrEqual(Math.round((ancho === 1280 ? PREVIO.canvas1280 : PREVIO.canvas390) * 1.15));
      expect(g.dona.t).toBeGreaterThanOrEqual(g.total.b);
      expect(g.dona.t).toBeGreaterThanOrEqual(g.cash.b);
      // la dona (A: anillo de .785 del lienzo con tope de 440) no baja de ese tamaño a ningún ancho
      expect(await page.evaluate(() => nwPieInst.estado.D)).toBeGreaterThanOrEqual(aroA(g.canvas.r - g.canvas.l) * .98);
      // categorías debajo de la dona, y el selector/gráfico debajo de las categorías
      for (const c of [...g.chips, g.edit]) expect(c.t).toBeGreaterThanOrEqual(g.dona.b);
      expect(g.ctl.t).toBeGreaterThanOrEqual(Math.max(...g.chips.map((c) => c.b), g.edit.b));
      expect(g.graf.t).toBeGreaterThanOrEqual(g.ctl.b);
      // con aire: el botón de categorías no toca el borde de la card
      expect(g.card.r - g.edit.r).toBeGreaterThanOrEqual(12);
      expect(g.edit.l - g.card.l).toBeGreaterThanOrEqual(12);
      // ninguna caja pisa a otra: total, dona, chips y botón
      const cajas = [g.total, g.cash, g.dona, ...g.chips, g.edit];
      for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) expect(sep(cajas[i], cajas[j]), `cajas ${i} y ${j} se pisan`).toBe(true);
      // el total de adentro queda dentro de la dona
      expect(g.centro.l).toBeGreaterThanOrEqual(g.canvas.l - 1);
      expect(g.centro.r).toBeLessThanOrEqual(g.canvas.r + 1);
      // sin scroll horizontal
      expect(g.scrollW).toBeLessThanOrEqual(g.innerW + 1);
      expect(g.cardOverflow).toBeLessThanOrEqual(1);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('390 px: sin scroll horizontal, con el modal de categorías y el selector', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page, { ancho: 390 });
    const sinScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(await sinScroll()).toBe(true);
    const c = await page.evaluate(() => { const el = document.getElementById('nwTotal').closest('.card'); return el.scrollWidth <= el.clientWidth + 1; });
    expect(c).toBe(true);
    await page.selectOption('#nwSeriesSel', 't:bank');
    expect((await serie(page)).label).toBe('Cuentas');
    // el total queda arriba, la dona debajo y nada se corta
    const caben = await page.evaluate(() => { const t = document.getElementById('nwTotal').getBoundingClientRect(), d = document.querySelector('.nw-dona').getBoundingClientRect(), top = nwPieInst.estado.top; return t.bottom <= d.top + top + 1 && t.right <= innerWidth; });
    expect(await page.evaluate(() => { const s = nwPieInst.estado; return !s.wide && s.D >= .785 * s.W * .99; }), 'a 390 el anillo conserva el tamaño de A y el % va adentro del aro').toBe(true);
    expect(caben).toBe(true);
    await page.evaluate(() => openAcctTypes());
    await expect(page.locator('#modal-acct-types')).toHaveClass(/open/);
    expect(await sinScroll()).toBe(true);
    const modal = await page.evaluate(() => { const m = document.querySelector('#modal-acct-types .modal'); return m.scrollWidth <= m.clientWidth + 1; });
    expect(modal).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
