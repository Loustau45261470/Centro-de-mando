// Card PATRIMONIO de Finanzas, segunda versión: dona con el total adentro (formato argentino), gráfico de evolución con una sola
// serie elegible, categorías de cuentas propias, deudas cobradas (saldo 0) fuera de las listas y deshacer un cobro sin la cuenta.
// Los datos de ejemplo viven acá; el código de producción no trae ninguna cuenta.
'use strict';
const { test, expect } = require('./support/fixtures');

// Medido en HEAD (antes de la v2), mismo viewport 1280: gráfico de línea en un contenedor de 148 px.
const ANTES = { altoGrafico: 148 };
// Medido antes del pedido «dona más grande + 19 px + 2 cm de gráfico + números verdes» (mismo viewport): dona 210 px a 1280 y ~199 a 390,
// aro 198 px, 14 px entre la dona y los chips, gráfico de 186 px.
const PREVIO = { canvas1280: 210, canvas390: 199, aro: 198, aire: 14, grafico: 186 };

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
const toastTxt = (page) => page.locator('#toast').innerText();

test.describe('Patrimonio v2', () => {
  test('dona: grande, centrada debajo del total y con el total del patrimonio adentro en formato argentino', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const total = await page.evaluate(() => fmtMoney(calcNetWorth(), 'USD'));
    expect(total).toBe('$7.985.408');   // 2.150.000 + 180.000 + 4.900.000 + 655.408 + 100.000
    await expect(page.locator('#nwTotal')).toHaveText('$7.985.408');
    await expect(page.locator('#nwDonaNum')).toHaveText('$7.985.408');
    const m = await page.evaluate(() => {
      const c = document.getElementById('nwTotal').closest('.card').getBoundingClientRect();
      const cv = document.getElementById('nwPieChart').getBoundingClientRect();
      const ce = document.querySelector('.nw-dona-centro').getBoundingClientRect();
      const arc = nwPieInst.getDatasetMeta(0).data[0];
      return { w: cv.width, ring: arc.outerRadius * 2, cx: ce.left + ce.width / 2 - (cv.left + cv.width / 2), cy: ce.top + ce.height / 2 - (cv.top + cv.height / 2),
        inside: ce.left >= cv.left - 1 && ce.right <= cv.right + 1 && ce.top >= cv.top - 1 && ce.bottom <= cv.bottom + 1 };
    });
    expect(m.w, 'al menos ~15% más grande que antes').toBeGreaterThanOrEqual(Math.round(PREVIO.canvas1280 * 1.15));
    expect(m.ring, 'el aro de colores también crece').toBeGreaterThan(PREVIO.aro);
    expect(m.inside).toBe(true);
    expect(Math.abs(m.cx)).toBeLessThan(2);
    expect(Math.abs(m.cy)).toBeLessThan(2);
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
      tip: nwLineInst.options.plugins.tooltip.callbacks.label({ dataset: { label: 'Total' }, parsed: { y: 5797041.02 } }),
      pieTip: nwPieInst.options.plugins.tooltip.callbacks.label({ label: 'Cuentas', raw: 2150000 }),
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
    expect(r.tip).toBe(' Total: $5.797.041');
    expect(r.pieTip).toBe(' Cuentas: $2.150.000');
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
    const idx = await page.evaluate(() => _nwCats().findIndex((c) => c.t.id === 'invest'));
    const pt = await page.evaluate((i) => { const p = nwPieInst.getDatasetMeta(0).data[i].getCenterPoint(); return { x: p.x, y: p.y }; }, idx);
    await page.locator('#nwPieChart').click({ position: pt });
    await expect(page.locator('#nwSeriesSel')).toHaveValue('t:invest');
    expect((await serie(page)).label).toBe('Inversión');
    await expect(page.locator('#nwLegend .nw-leg-item.on')).toHaveText(/Inversión/);
    await page.locator('#nwLegend .nw-leg-item', { hasText: 'Efectivo' }).click();
    await expect(page.locator('#nwSeriesSel')).toHaveValue('t:cash');
    expect((await serie(page)).label).toBe('Efectivo');
    expect(consoleErrors).toEqual([]);
  });

  test('el gráfico de línea es 76 px (2 cm) más alto que hace un momento y no muestra las fechas del eje X', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const h = await page.evaluate(() => document.getElementById('nwLineChart').closest('.chart-wrap').getBoundingClientRect().height);
    expect(h).toBe(PREVIO.grafico + 76);
    expect(h).toBe(ANTES.altoGrafico + 38 + 76);
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

  test('dona con aspecto tecnológico: porciones separadas, marco tipo dial y círculo interior (tocar una porción sigue eligiendo la serie: ver el test de arriba)', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const r = await page.evaluate(() => ({ plugin: nwPieInst.config.plugins.some((p) => p.id === 'nwDial'), spacing: nwPieInst.data.datasets[0].spacing, pad: nwPieInst.options.layout.padding }));
    expect(r.plugin).toBe(true);
    expect(r.spacing).toBeGreaterThan(0);
    expect(r.pad).toBeGreaterThan(8);
    // el canvas tiene trazos del marco fuera del aro de colores (celdas con el celeste del dial a ~7 px del borde del aro)
    const marco = await page.evaluate(() => {
      const cv = document.getElementById('nwPieChart'), a = nwPieInst.getDatasetMeta(0).data[0], k = cv.width / cv.getBoundingClientRect().width;
      const px = cv.getContext('2d').getImageData(Math.round((a.x) * k), Math.round((a.y - a.outerRadius - 7) * k) - 2, 1, 5).data;
      let max = 0; for (let i = 3; i < px.length; i += 4) max = Math.max(max, px[i]);
      return max;
    });
    expect(marco, 'hay trazo del dial arriba del aro').toBeGreaterThan(30);
    expect(consoleErrors).toEqual([]);
  });

  test('categorías: al menos 19 px más de aire debajo de la dona que antes', async ({ cmPage: page, consoleErrors }) => {
    await preparar(page);
    const aire = await page.evaluate(() => document.querySelector('#nwLegend .nw-leg-item').getBoundingClientRect().top - document.querySelector('.nw-dona').getBoundingClientRect().bottom);
    expect(aire).toBeGreaterThanOrEqual(PREVIO.aire + 19);
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
    expect(await page.evaluate(() => nwPieInst.data.labels)).not.toContain('Préstamo');
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
        return { card: R(card), total: R(document.getElementById('nwTotal')), cash: R(document.getElementById('nwCash')), dona: R(document.querySelector('.nw-dona')),
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
    const caben = await page.evaluate(() => { const t = document.getElementById('nwTotal').getBoundingClientRect(), d = document.querySelector('.nw-dona').getBoundingClientRect(); return t.bottom <= d.top + 1 && t.right <= innerWidth; });
    expect(caben).toBe(true);
    await page.evaluate(() => openAcctTypes());
    await expect(page.locator('#modal-acct-types')).toHaveClass(/open/);
    expect(await sinScroll()).toBe(true);
    const modal = await page.evaluate(() => { const m = document.querySelector('#modal-acct-types .modal'); return m.scrollWidth <= m.clientWidth + 1; });
    expect(modal).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
