// Presupuestos, etapa 8: el día 1 de cada mes se arma desde cómo quedó el mes anterior, y los gastos
// estacionales (regalos, cumpleaños...) se cargan solos en su mes. Los datos de ejemplo viven solo acá.
// Regla: la app solo rehace solo un mes que creó ella (auto:true). Un mes sin banderas (de la versión anterior
// o de Tobías) jamás se pisa solo: se ofrece rehacerlo con un aviso (tests 10 a 14).
// La fecha de "hoy" se fija pisando getActiveDate(), igual que en los otros specs de Finanzas.
'use strict';
const { test, expect, completeLoginOverlay, waitForBoot } = require('./support/fixtures');

const fx = (id, name, v3, category = 'food') => ({ id, name, category, unit: 'kg', v1: 20, v2: 0.7, v3 });
const rs = (id, name, amount, category = 'food') => ({ id, name, category, amount });
const copia = (b, suf) => ({
  fixed: b.fixed.map((x) => ({ ...x, id: x.id + suf })),
  reserved: b.reserved.map((x) => ({ ...x, id: x.id + suf })),
});
const OCT = { fixed: [fx('f1', 'Carne', 14000)], reserved: [rs('r1', 'Seguro', 50000)] };

async function prep(page, { hoy, budgets = {}, seasonals = [] }) {
  if (!(await page.locator('#tab-finanzas.active').count())) await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, budgets, seasonals }) => {
    window.getActiveDate = () => hoy;
    S.budgets = JSON.parse(JSON.stringify(budgets));
    S.seasonals = JSON.parse(JSON.stringify(seasonals));
    budgetActiveMonth = null; budgetActiveYear = null;
  }, { hoy, budgets, seasonals });
}
const hoyEs = (page, hoy) => page.evaluate((h) => { window.getActiveDate = () => h; }, hoy);
const arrancar = (page, year) => page.evaluate((y) => ensureBudgetYear(y), year);
// Límites de un mes sin ids (para comparar "lo mismo" entre meses).
const limites = (page, mk) => page.evaluate((m) => {
  const b = S.budgets[m]; if (!b) return null;
  return { fixed: b.fixed.map(({ id, ...r }) => r), reserved: b.reserved.map(({ id, ...r }) => r) };
}, mk);
const mes = (page, mk) => page.evaluate((m) => JSON.parse(JSON.stringify(S.budgets[m] || null)), mk);
const cats = (page) => page.evaluate(() => { ensureTxnCategories(); return BUDGET_EXPENSE_CATS.slice(0, 2); });

// Edita a mano, con las mismas funciones que usa la pantalla, un ítem fijo / reservado del mes dado.
async function editarFijo(page, mk, id, v3) {
  await page.evaluate(({ mk, id, v3 }) => {
    budgetActiveMonth = mk; openBudgetFixed(id);
    document.getElementById('budgetFixedV3').value = String(v3); saveBudgetFixed();
  }, { mk, id, v3 });
}
async function editarReservado(page, mk, id, amount) {
  await page.evaluate(({ mk, id, amount }) => {
    budgetActiveMonth = mk; openBudgetReserved(id);
    document.getElementById('budgetReservedAmount').value = String(amount); saveBudgetReserved();
  }, { mk, id, amount });
}

async function abrirPresupuesto(page, mk) {
  await page.evaluate(() => openBudgetOverlay());
  await expect(page.locator('#ov-budget #budgetBody')).toBeVisible();
  await page.evaluate((m) => { budgetActiveYear = +m.slice(0, 4); budgetActiveMonth = m; renderBudget(); }, mk);
}
async function crearEstacional(page, { nombre, mes, monto, cat }) {
  await page.click('#budgetBody button:has-text("+ Estacional")');
  await expect(page.locator('#modal-seasonal')).toHaveClass(/open/);
  await page.fill('#seasonalName', nombre);
  await page.selectOption('#seasonalMonth', String(mes));
  if (cat) await page.selectOption('#seasonalCat', cat);
  await page.fill('#seasonalAmount', String(monto));
  await page.click('#modal-seasonal .btn-primary');
}
const toast = (page) => page.locator('#toast');
const MSG_MONTO = 'Escribí un monto mayor a 0, con hasta 2 decimales';

test('1. el 1° de noviembre el presupuesto se crea con los límites finales de octubre', async ({ cmPage, consoleErrors }) => {
  await prep(cmPage, { hoy: '2026-10-05', budgets: { '2026-10': OCT } });
  await arrancar(cmPage, 2026);
  expect((await mes(cmPage, '2026-11')).auto).toBe(true);   // los crea el código nuevo como borradores
  // El 25 de octubre Tobías cambia un límite fijo y un reservado.
  await hoyEs(cmPage, '2026-10-25');
  await editarFijo(cmPage, '2026-10', 'f1', 20000);
  await editarReservado(cmPage, '2026-10', 'r1', 65000);
  const octFinal = await limites(cmPage, '2026-10');
  expect(octFinal.fixed[0].v3).toBe(20000);
  expect(octFinal.reserved[0].amount).toBe(65000);
  // Antes del 1° de noviembre todavía es un borrador con la base vieja.
  expect((await limites(cmPage, '2026-11')).fixed[0].v3).toBe(14000);

  await hoyEs(cmPage, '2026-11-01');
  await arrancar(cmPage, 2026);
  expect(await limites(cmPage, '2026-11')).toEqual(octFinal);
  const nov = await mes(cmPage, '2026-11');
  expect(nov.auto).toBe(false);   // ya llegó: queda fijo (resuelto, no vuelve a rehacerse)
  expect(nov.touched).toBe(false);
  expect(nov.base).toBe('2026-10');
  expect(nov.fixed[0].id).not.toBe('f1');
  expect(await limites(cmPage, '2026-10')).toEqual(octFinal);   // octubre no cambió
  expect(consoleErrors).toEqual([]);
});

test('2. un mes futuro creado por la app se muestra como borrador y se regenera al llegar (aun saltando un mes)', async ({ cmPage }) => {
  await prep(cmPage, { hoy: '2026-10-05', budgets: { '2026-10': OCT } });
  await arrancar(cmPage, 2026);
  await hoyEs(cmPage, '2026-10-25');
  await editarFijo(cmPage, '2026-10', 'f1', 20000);

  // Noviembre (futuro) se ve como borrador, octubre (actual) no.
  await abrirPresupuesto(cmPage, '2026-11');
  await expect(cmPage.locator('#budgetBody .budget-prov')).toContainText('Borrador');
  await expect(cmPage.locator('#budgetBody .budget-prov')).toContainText('Octubre 2026');
  await cmPage.evaluate(() => setBudgetMonth('2026-10'));
  await expect(cmPage.locator('#budgetBody .budget-prov')).toHaveCount(0);

  // La app no se abre en noviembre: el 1° de diciembre se rehacen los dos, en cadena.
  await hoyEs(cmPage, '2026-12-01');
  await arrancar(cmPage, 2026);
  const octFinal = await limites(cmPage, '2026-10');
  expect(await limites(cmPage, '2026-11')).toEqual(octFinal);
  expect(await limites(cmPage, '2026-12')).toEqual(octFinal);
  await cmPage.evaluate(() => setBudgetMonth('2026-12'));
  await expect(cmPage.locator('#budgetBody .budget-prov')).toHaveCount(0);
});

test('3. un mes editado a mano nunca se pisa', async ({ cmPage }) => {
  const ENE = { fixed: [fx('e1', 'Gimnasio', 33000)], reserved: [] };   // mes futuro viejo (sin banderas) con algo propio
  await prep(cmPage, { hoy: '2026-10-05', budgets: { '2026-10': OCT, '2027-01': ENE } });
  await arrancar(cmPage, 2026);
  const idNov = (await mes(cmPage, '2026-11')).fixed[0].id;
  expect((await mes(cmPage, '2026-11')).auto).toBe(true);
  await editarFijo(cmPage, '2026-11', idNov, 99999);   // Tobías ajusta noviembre (borrador) por adelantado
  expect(await mes(cmPage, '2026-11')).toMatchObject({ touched: true });   // editar un borrador lo apaga: ya no es auto
  expect((await mes(cmPage, '2026-11')).auto).toBeUndefined();
  await hoyEs(cmPage, '2026-10-25');
  await editarFijo(cmPage, '2026-10', 'f1', 20000);

  await hoyEs(cmPage, '2026-11-01');
  await arrancar(cmPage, 2026);
  const nov = await mes(cmPage, '2026-11');
  expect(nov.fixed[0].v3).toBe(99999);
  expect(nov.touched).toBe(true);
  expect(nov.fixed[0].id).toBe(idNov);

  // Diciembre arranca desde cómo quedó noviembre (con su ajuste), no desde octubre.
  await hoyEs(cmPage, '2026-12-01');
  await arrancar(cmPage, 2026);
  expect((await limites(cmPage, '2026-12')).fixed[0].v3).toBe(99999);

  // Un mes viejo sin banderas con contenido propio tampoco se pisa solo, ni el día 1.
  await hoyEs(cmPage, '2027-01-01');
  await arrancar(cmPage, 2027);
  expect((await mes(cmPage, '2027-01')).fixed.map((x) => x.name)).toEqual(['Gimnasio']);
  expect((await mes(cmPage, '2027-01')).fixed[0].id).toBe('e1');
  expect((await mes(cmPage, '2027-01')).auto).toBeUndefined();
  expect((await mes(cmPage, '2027-01')).touched).toBeUndefined();
});

test('4. sin el mes inmediatamente anterior usa el más reciente anterior', async ({ cmPage }) => {
  await prep(cmPage, { hoy: '2026-10-03', budgets: { '2026-08': { fixed: [fx('a1', 'Carne', 18000)], reserved: [rs('a2', 'Seguro', 40000)] } } });
  await arrancar(cmPage, 2026);
  expect(await limites(cmPage, '2026-10')).toEqual(await limites(cmPage, '2026-08'));
  expect(await mes(cmPage, '2026-09')).toBeNull();   // no inventa meses pasados
  expect((await mes(cmPage, '2026-10')).base).toBe('2026-08');

  // Sin ningún mes previo, arranca vacío.
  await prep(cmPage, { hoy: '2026-10-03', budgets: {} });
  await arrancar(cmPage, 2026);
  expect(await limites(cmPage, '2026-10')).toEqual({ fixed: [], reserved: [] });
});

test('5. estacionales: alta, edición, baja y validaciones', async ({ cmPage }) => {
  const [c1, c2] = await cats(cmPage);
  await prep(cmPage, { hoy: '2026-10-05', budgets: { '2026-10': OCT } });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-10');
  await expect(cmPage.locator('#budgetBody')).toContainText('Todavía no cargaste ninguno');

  // Validaciones: nada se guarda.
  await crearEstacional(cmPage, { nombre: '   ', mes: 12, monto: 80000, cat: c1 });
  await expect(toast(cmPage)).toHaveText('Escribí un nombre');
  await cmPage.fill('#seasonalName', 'Regalo');
  for (const monto of ['0', '-5', '10.123', '']) {
    await cmPage.fill('#seasonalAmount', monto);
    await cmPage.click('#modal-seasonal .btn-primary');
    await expect(toast(cmPage)).toHaveText(MSG_MONTO);
  }
  await cmPage.evaluate(() => { document.getElementById('seasonalMonth').insertAdjacentHTML('beforeend', '<option value="13">13</option>'); });
  await cmPage.selectOption('#seasonalMonth', '13');
  await cmPage.fill('#seasonalAmount', '1000');
  await cmPage.click('#modal-seasonal .btn-primary');
  await expect(toast(cmPage)).toHaveText('Elegí un mes del 1 al 12');
  expect(await cmPage.evaluate(() => S.seasonals.length)).toBe(0);
  await cmPage.click('#modal-seasonal button:has-text("Cancelar")');

  // Alta válida (con decimales).
  await crearEstacional(cmPage, { nombre: 'Regalo Navidad – mamá', mes: 12, monto: '80000.5', cat: c1 });
  await expect(cmPage.locator('#modal-seasonal')).not.toHaveClass(/open/);
  let lista = await cmPage.evaluate(() => S.seasonals);
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({ name: 'Regalo Navidad – mamá', month: 12, amount: 80000.5, category: c1 });
  const fila = cmPage.locator('#budgetBody [data-seasonal]');
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText('Regalo Navidad – mamá');
  await expect(fila).toContainText('Diciembre');

  // Edición: nombre, mes, monto y categoría.
  await fila.locator('button[aria-label="Editar estacional"]').click();
  await expect(cmPage.locator('#seasonalName')).toHaveValue('Regalo Navidad – mamá');
  await cmPage.fill('#seasonalName', 'Cumpleaños novia');
  await cmPage.selectOption('#seasonalMonth', '3');
  await cmPage.selectOption('#seasonalCat', c2);
  await cmPage.fill('#seasonalAmount', '45000');
  await cmPage.click('#modal-seasonal .btn-primary');
  lista = await cmPage.evaluate(() => S.seasonals);
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({ name: 'Cumpleaños novia', month: 3, amount: 45000, category: c2 });
  await expect(cmPage.locator('#budgetBody [data-seasonal]')).toContainText('Marzo');

  // Baja: pide confirmación; si se cancela no borra.
  cmPage.once('dialog', (d) => d.dismiss());
  await cmPage.locator('#budgetBody [data-seasonal] button[aria-label="Eliminar estacional"]').click();
  expect(await cmPage.evaluate(() => S.seasonals.length)).toBe(1);
  let msg = '';
  cmPage.once('dialog', (d) => { msg = d.message(); d.accept(); });
  await cmPage.locator('#budgetBody [data-seasonal] button[aria-label="Eliminar estacional"]').click();
  await expect(cmPage.locator('#budgetBody [data-seasonal]')).toHaveCount(0);
  expect(msg).toContain('Cumpleaños novia');
  expect(await cmPage.evaluate(() => S.seasonals.length)).toBe(0);
});

test('6. el estacional de diciembre aparece en diciembre, se edita sin tocar el base y si se elimina no vuelve', async ({ cmPage }) => {
  const [c1] = await cats(cmPage);
  const NAV = { id: 's1', name: 'Regalo Navidad – mamá', month: 12, amount: 80000, category: c1 };
  await prep(cmPage, { hoy: '2026-11-30', budgets: { '2026-11': OCT, '2026-12': { ...copia(OCT, 'd'), auto: true } }, seasonals: [NAV] });
  await arrancar(cmPage, 2026);
  // El estacional no viaja a otros meses ni modifica los límites de las categorías base.
  expect((await mes(cmPage, '2026-11')).seasonal || []).toEqual([]);
  expect(await limites(cmPage, '2026-12')).toEqual(await limites(cmPage, '2026-11'));

  await hoyEs(cmPage, '2026-12-01');
  await arrancar(cmPage, 2026);
  let dic = await mes(cmPage, '2026-12');
  expect(dic.seasonal).toHaveLength(1);
  expect(dic.seasonal[0]).toMatchObject({ seasonalId: 's1', name: 'Regalo Navidad – mamá', amount: 80000, category: c1 });
  expect(dic.fixed).toHaveLength(1);   // los límites base siguen siendo solo los del mes anterior

  await abrirPresupuesto(cmPage, '2026-12');
  const linea = cmPage.locator('#budgetBody [data-seasonal-line]');
  await expect(linea).toHaveCount(1);
  await expect(linea).toContainText('Regalo Navidad – mamá');
  await expect(linea).toContainText('80,000');
  const totalAntes = await cmPage.locator('.budget-total-num').innerText();

  // Se edita el monto SOLO para este mes: el estacional base no cambia, el mes queda ajustado.
  await linea.locator('button[aria-label="Cambiar el monto de este mes"]').click();
  await expect(cmPage.locator('#seasonalLineAmount')).toHaveValue('80000');
  await cmPage.fill('#seasonalLineAmount', '95000');
  await cmPage.click('#modal-seasonal-line .btn-primary');
  expect(await cmPage.evaluate(() => S.seasonals[0].amount)).toBe(80000);
  dic = await mes(cmPage, '2026-12');
  expect(dic.seasonal[0]).toMatchObject({ amount: 95000, adjusted: true });
  expect(dic.touched).toBe(true);
  await expect(linea).toContainText('Ajustado para este mes');
  expect(await cmPage.locator('.budget-total-num').innerText()).not.toBe(totalAntes);
  // No se vuelve a pisar.
  await hoyEs(cmPage, '2026-12-02');
  await arrancar(cmPage, 2026);
  await cmPage.evaluate(() => renderBudget());
  expect((await mes(cmPage, '2026-12')).seasonal[0].amount).toBe(95000);

  // Un monto inválido no se guarda.
  await linea.locator('button[aria-label="Cambiar el monto de este mes"]').click();
  await cmPage.fill('#seasonalLineAmount', '1.234');
  await cmPage.click('#modal-seasonal-line .btn-primary');
  await expect(toast(cmPage)).toHaveText(MSG_MONTO);
  await cmPage.click('#modal-seasonal-line button:has-text("Cancelar")');
  expect((await mes(cmPage, '2026-12')).seasonal[0].amount).toBe(95000);

  // Actualizar el monto base desde el mes.
  await linea.locator('button[aria-label="Cambiar el monto de este mes"]').click();
  await cmPage.fill('#seasonalLineAmount', '70000');
  await cmPage.click('#seasonalLineBase');
  expect(await cmPage.evaluate(() => S.seasonals[0].amount)).toBe(70000);
  expect((await mes(cmPage, '2026-12')).seasonal[0]).toMatchObject({ amount: 70000, adjusted: false });

  // Quitar la línea de este mes: no vuelve aunque se recalcule todo; el estacional sigue guardado.
  cmPage.once('dialog', (d) => d.accept());
  await linea.locator('button[aria-label="Quitar de este mes"]').click();
  await expect(linea).toHaveCount(0);
  await arrancar(cmPage, 2026);
  await cmPage.evaluate(() => rollBudgets());
  expect((await mes(cmPage, '2026-12')).seasonal).toEqual([]);
  expect(await cmPage.evaluate(() => S.seasonals.length)).toBe(1);

  // Eliminar el estacional base: tampoco vuelve en meses nuevos.
  await prep(cmPage, { hoy: '2026-11-30', budgets: { '2026-11': OCT, '2026-12': { ...copia(OCT, 'd'), auto: true } }, seasonals: [NAV] });
  await arrancar(cmPage, 2026);
  await cmPage.evaluate(() => { window.confirm = () => true; deleteSeasonal('s1'); });
  expect(await cmPage.evaluate(() => S.seasonals.length)).toBe(0);
  await hoyEs(cmPage, '2026-12-01');
  await arrancar(cmPage, 2026);
  expect((await mes(cmPage, '2026-12')).seasonal || []).toEqual([]);
});

test('7. un estacional borrado o nuevo no altera los meses pasados', async ({ cmPage }) => {
  const [c1] = await cats(cmPage);
  const linea = (amount) => [{ id: 'l1', seasonalId: 's1', name: 'Regalo Navidad – mamá', category: c1, amount }];
  const S1 = { id: 's1', name: 'Regalo Navidad – mamá', month: 12, amount: 80000, category: c1 };
  await prep(cmPage, {
    hoy: '2027-02-10',
    budgets: {
      '2026-12': { ...copia(OCT, 'p'), touched: true, seasonal: linea(83000) },   // ya pasó
      '2027-02': { ...copia(OCT, 'a'), touched: true },
      '2027-12': { ...copia(OCT, 'f'), auto: true, seasonal: linea(80000) },      // todavía no llegó
    },
    seasonals: [S1],
  });
  await cmPage.evaluate(() => { window.confirm = () => true; deleteSeasonal('s1'); });
  expect((await mes(cmPage, '2026-12')).seasonal).toEqual(linea(83000));   // mes pasado intacto
  expect((await mes(cmPage, '2027-12')).seasonal).toEqual([]);             // el próximo diciembre ya no lo carga

  // Un estacional nuevo de diciembre se carga en los diciembres que vienen, no en el que ya pasó.
  await cmPage.evaluate((c) => {
    S.seasonals.push({ id: 's2', name: 'Regalo papá', month: 12, amount: 50000, category: c });
    rollBudgets();
  }, c1);
  expect((await mes(cmPage, '2026-12')).seasonal).toEqual(linea(83000));
  expect((await mes(cmPage, '2027-12')).seasonal.map((x) => x.name)).toEqual(['Regalo papá']);
});

test('8. el nombre se muestra como texto (sin XSS) y un doble clic no duplica', async ({ cmPage, consoleErrors }) => {
  const [c1] = await cats(cmPage);
  const XSS = '<img src=x onerror="window.__xss=1"><b>hola</b>';
  await prep(cmPage, { hoy: '2026-12-05', budgets: { '2026-12': OCT } });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-12');
  await crearEstacional(cmPage, { nombre: XSS, mes: 12, monto: 1500, cat: c1 });
  await expect(cmPage.locator('#budgetBody [data-seasonal]')).toHaveCount(1);
  await expect(cmPage.locator('#budgetBody [data-seasonal-line]')).toHaveCount(1);
  await expect(cmPage.locator('#budgetBody [data-seasonal] .sub-name')).toHaveText(XSS);
  await expect(cmPage.locator('#budgetBody [data-seasonal-line] .sub-name')).toHaveText(XSS);
  await expect(cmPage.locator('#budgetBody img')).toHaveCount(0);
  await expect(cmPage.locator('#budgetBody b', { hasText: 'hola' })).toHaveCount(0);   // el <b> del nombre no se interpreta
  expect(await cmPage.evaluate(() => window.__xss)).toBeUndefined();

  // Doble clic en Guardar (dos clics seguidos sobre el mismo botón): un solo estacional, una sola línea.
  await cmPage.click('#budgetBody button:has-text("+ Estacional")');
  await cmPage.fill('#seasonalName', 'Cumpleaños papá');
  await cmPage.selectOption('#seasonalMonth', '12');
  await cmPage.fill('#seasonalAmount', '30000');
  await cmPage.evaluate(() => { const b = document.querySelector('#modal-seasonal .btn-primary'); b.click(); b.click(); });
  expect(await cmPage.evaluate(() => S.seasonals.filter((s) => s.name === 'Cumpleaños papá').length)).toBe(1);
  expect(await cmPage.evaluate(() => S.budgets['2026-12'].seasonal.filter((l) => l.name === 'Cumpleaños papá').length)).toBe(1);
  expect(consoleErrors).toEqual([]);
});

test('9. en 390px no hay scroll horizontal con estacionales y borrador', async ({ cmPage }) => {
  const [c1] = await cats(cmPage);
  await cmPage.setViewportSize({ width: 390, height: 844 });
  const largo = 'Regalo de Navidad para una persona con un nombre larguísimo y difícil de partir';
  await prep(cmPage, {
    hoy: '2026-11-15',
    budgets: { '2026-11': OCT, '2026-12': { ...copia(OCT, 'd'), auto: true } },
    seasonals: [{ id: 's1', name: largo, month: 12, amount: 1234567.89, category: c1 }, { id: 's2', name: 'Día de la Madre', month: 10, amount: 60000, category: c1 }],
  });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-12');
  await expect(cmPage.locator('#budgetBody .budget-prov')).toBeVisible();
  await expect(cmPage.locator('#budgetBody [data-seasonal-line]')).toHaveCount(1);
  // (se saca el mouse de la lista: el hover de las filas las corre 2px a la derecha, ya existente)
  const medir = async () => { await cmPage.mouse.move(0, 0); return cmPage.evaluate(() => {
    const bb = document.getElementById('budgetBody');
    const ov = document.getElementById('ov-budget');
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      bb: bb.scrollWidth - bb.clientWidth,
      ov: ov ? ov.scrollWidth - ov.clientWidth : 0,
    };
  }); };
  for (const v of Object.values(await medir())) expect(v).toBeLessThanOrEqual(1);
  await cmPage.click('#budgetBody button:has-text("+ Estacional")');
  await expect(cmPage.locator('#modal-seasonal')).toHaveClass(/open/);
  for (const v of Object.values(await medir())) expect(v).toBeLessThanOrEqual(1);
  await cmPage.click('#modal-seasonal button:has-text("Cancelar")');
  await cmPage.locator('#budgetBody [data-seasonal-line] button[aria-label="Cambiar el monto de este mes"]').click();
  await expect(cmPage.locator('#modal-seasonal-line')).toHaveClass(/open/);
  const box = await cmPage.locator('#modal-seasonal-line .modal').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  for (const v of Object.values(await medir())) expect(v).toBeLessThanOrEqual(1);
});

// ── Meses sin banderas (de la versión anterior o de Tobías): nunca se pisan solos; se ofrece rehacerlos ──
// Un ítem fijo "Carne" de precio `p` y cantidad `q` (el total del mes es p × q).
const cm = (id, p, q) => ({ id, name: 'Carne', category: 'food', unit: 'kg', v1: p, v2: q, v3: 1 });
const mesCm = (p, q, id = 'x') => ({ fixed: [cm(id, p, q)], reserved: [] });
const tot = (page, mk) => page.evaluate((m) => S.budgets[m].fixed.reduce((s, x) => s + x.v1 * x.v2 * x.v3, 0), mk);
const aviso = (page) => page.locator('#budgetBody #budgetPending');
const marcados = (page) => page.evaluate(() => [...document.querySelectorAll('#budgetPending input[data-pend]')].map((i) => [i.dataset.pend, i.checked]));
const btn = (page, texto) => page.locator('#budgetBody .budget-notice button', { hasText: texto });
const sinBanderas = async (page, mk) => { const b = await mes(page, mk); expect(b.auto).toBeUndefined(); expect(b.touched).toBeUndefined(); };

test('10. A: Nov editado a mano que coincide con Sep NO se pisa el 1-nov y aparece el aviso', async ({ cmPage, consoleErrors }) => {
  // Ago/Sep/Oct sin banderas (Sep = 2000 x 2, Oct = 3000 x 3) y Nov que Tobías escribió a mano igual que Sep.
  await prep(cmPage, { hoy: '2026-10-31', budgets: { '2026-08': mesCm(1500, 5, 'a'), '2026-09': mesCm(2000, 2, 's'), '2026-10': mesCm(3000, 3, 'o'), '2026-11': mesCm(2000, 2, 'n') } });
  await arrancar(cmPage, 2026);
  await hoyEs(cmPage, '2026-11-01');
  await arrancar(cmPage, 2026);
  await cmPage.evaluate(() => rollBudgets());
  expect(await tot(cmPage, '2026-11')).toBe(4000);   // lo que escribió Tobías (no 9000 de octubre)
  expect((await mes(cmPage, '2026-11')).fixed[0].id).toBe('n');
  for (const mk of ['2026-08', '2026-09', '2026-10', '2026-11']) await sinBanderas(cmPage, mk);

  await abrirPresupuesto(cmPage, '2026-11');
  await expect(aviso(cmPage)).toBeVisible();
  await expect(aviso(cmPage)).toContainText('Noviembre 2026 ya tenía un presupuesto armado antes');
  await expect(aviso(cmPage)).toContainText('1 ítem');   // vista previa: cantidad de ítems y total de cada mes
  await expect(aviso(cmPage)).toContainText('4,000');
  await expect(aviso(cmPage)).toContainText('9,000');
  await expect(btn(cmPage, 'Rehacer los marcados')).toBeDisabled();   // noviembre es el mes actual: viene desmarcado
  await expect(btn(cmPage, 'Dejar los demás como están')).toBeVisible();
  expect(await tot(cmPage, '2026-11')).toBe(4000);   // mirar el aviso no cambia nada
  expect(consoleErrors).toEqual([]);
});

test('11. B: Nov y Dic viejos (1500 x 5) con Sep/Oct editados: el aviso ofrece rehacer; Rehacer deja Nov con Oct; Dejar los demás marca touched y no vuelve a preguntar', async ({ cmPage }) => {
  const base = () => ({ '2026-08': mesCm(1500, 5, 'a'), '2026-09': mesCm(2000, 2, 's'), '2026-10': mesCm(3000, 3, 'o'), '2026-11': mesCm(1500, 5, 'n'), '2026-12': mesCm(1500, 5, 'd') });
  await prep(cmPage, { hoy: '2026-10-20', budgets: base() });
  await arrancar(cmPage, 2026);
  expect(await tot(cmPage, '2026-11')).toBe(7500);   // la app no los toca sola
  await sinBanderas(cmPage, '2026-11'); await sinBanderas(cmPage, '2026-12');

  await abrirPresupuesto(cmPage, '2026-11');
  await expect(aviso(cmPage)).toBeVisible();
  // Una sola lista con un checkbox por mes: octubre (el actual) desmarcado, noviembre y diciembre (futuros) marcados.
  expect(await marcados(cmPage)).toEqual([['2026-10', false], ['2026-11', true], ['2026-12', true]]);
  await expect(cmPage.locator('#budgetBody #budgetPending')).toHaveCount(1);

  // Rehacer los marcados: Nov y Dic quedan como Oct (en cadena) y octubre no se toca.
  await btn(cmPage, 'Rehacer los marcados').click();
  expect(await limites(cmPage, '2026-11')).toEqual(await limites(cmPage, '2026-10'));
  expect(await limites(cmPage, '2026-12')).toEqual(await limites(cmPage, '2026-10'));
  expect(await tot(cmPage, '2026-11')).toBe(9000);
  expect(await mes(cmPage, '2026-11')).toMatchObject({ auto: false, touched: false, base: '2026-10' });
  expect(await mes(cmPage, '2026-12')).toMatchObject({ auto: false, touched: false, base: '2026-11' });
  expect((await mes(cmPage, '2026-11')).fixed[0].id).not.toBe('n');
  await sinBanderas(cmPage, '2026-10');
  // Ya no se vuelve a preguntar por Nov ni Dic; octubre (que no marcó) sigue pendiente.
  expect(await marcados(cmPage)).toEqual([['2026-10', false]]);

  // "Dejar los demás como están": los que no están marcados quedan touched y no se vuelve a preguntar (ni al recalcular ni al llegar el mes).
  await prep(cmPage, { hoy: '2026-10-20', budgets: base() });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-11');
  await cmPage.locator('#budgetPending input[data-pend="2026-11"]').uncheck();
  await cmPage.locator('#budgetPending input[data-pend="2026-12"]').uncheck();
  await btn(cmPage, 'Dejar los demás como están').click();
  expect(await mes(cmPage, '2026-10')).toMatchObject({ touched: true });
  expect(await mes(cmPage, '2026-11')).toMatchObject({ touched: true });
  expect(await mes(cmPage, '2026-12')).toMatchObject({ touched: true });
  expect(await tot(cmPage, '2026-11')).toBe(7500);
  await expect(aviso(cmPage)).toHaveCount(0);
  await hoyEs(cmPage, '2026-11-01');
  await arrancar(cmPage, 2026);
  await cmPage.evaluate(() => renderBudget());
  await expect(aviso(cmPage)).toHaveCount(0);
  expect(await tot(cmPage, '2026-11')).toBe(7500);
});

test('12. un borrador creado por el código nuevo (auto) se regenera al llegar; editarlo lo vuelve touched y no se pisa', async ({ cmPage }) => {
  await prep(cmPage, { hoy: '2026-10-05', budgets: { '2026-10': mesCm(3000, 3, 'o') } });
  await arrancar(cmPage, 2026);
  for (const mk of ['2026-11', '2026-12']) expect((await mes(cmPage, mk)).auto).toBe(true);
  // Sin editar: al llegar noviembre se rehace desde octubre, tal como quedó.
  await hoyEs(cmPage, '2026-10-28');
  await editarFijo(cmPage, '2026-10', 'o', 4);
  await hoyEs(cmPage, '2026-11-01');
  await arrancar(cmPage, 2026);
  expect(await limites(cmPage, '2026-11')).toEqual(await limites(cmPage, '2026-10'));
  expect(await mes(cmPage, '2026-11')).toMatchObject({ auto: false, touched: false });
  // Diciembre (borrador) lo edita Tobías: pasa a touched, auto se apaga y el 1-dic no se pisa.
  const idDic = (await mes(cmPage, '2026-12')).fixed[0].id;
  await editarFijo(cmPage, '2026-12', idDic, 7);
  expect(await mes(cmPage, '2026-12')).toMatchObject({ touched: true });
  expect((await mes(cmPage, '2026-12')).auto).toBeUndefined();
  await hoyEs(cmPage, '2026-12-01');
  await arrancar(cmPage, 2026);
  expect((await mes(cmPage, '2026-12')).fixed[0].v3).toBe(7);
  expect((await mes(cmPage, '2026-12')).fixed[0].id).toBe(idDic);
});

test('13. el mes actual o pasado sin banderas nunca se toca solo (ni creando meses, ni rehaciendo, ni con el estacional)', async ({ cmPage }) => {
  const [c1] = await cats(cmPage);
  await prep(cmPage, {
    hoy: '2026-10-20',
    budgets: { '2026-08': mesCm(1500, 5, 'a'), '2026-09': mesCm(2000, 2, 's'), '2026-10': mesCm(3000, 3, 'o') },
    seasonals: [{ id: 's1', name: 'Regalo', month: 10, amount: 1000, category: c1 }],
  });
  const pasados = () => cmPage.evaluate(() => JSON.stringify(['2026-08', '2026-09'].map((m) => S.budgets[m])));
  const antes = await pasados();
  for (const hoy of ['2026-10-20', '2026-11-03', '2026-12-15']) {
    await hoyEs(cmPage, hoy);
    await arrancar(cmPage, +hoy.slice(0, 4));
    await cmPage.evaluate(() => rollBudgets());
    expect(await pasados()).toBe(antes);
    expect(await tot(cmPage, '2026-10')).toBe(9000);
    expect((await mes(cmPage, '2026-10')).fixed[0].id).toBe('o');
    await sinBanderas(cmPage, '2026-10');
  }
  // Los meses pasados no entran en el aviso (octubre ya es pasado el 15-dic).
  await abrirPresupuesto(cmPage, '2026-12');
  await expect(aviso(cmPage)).toHaveCount(0);
});

test('14. Deshacer devuelve el mes a como estaba, y deja de estar disponible si se edita el mes rehecho', async ({ cmPage }) => {
  await prep(cmPage, { hoy: '2026-10-20', budgets: { '2026-10': mesCm(3000, 3, 'o'), '2026-11': mesCm(1500, 5, 'n') } });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-11');
  await expect(aviso(cmPage)).toContainText('Noviembre 2026 ya tenía un presupuesto armado antes');
  await btn(cmPage, 'Rehacer los marcados').click();
  expect(await tot(cmPage, '2026-11')).toBe(9000);
  await expect(cmPage.locator('#budgetBody .budget-notice-done')).toContainText('Se rehizo Noviembre 2026');
  await btn(cmPage, 'Deshacer').click();
  expect(await tot(cmPage, '2026-11')).toBe(7500);
  expect((await mes(cmPage, '2026-11')).fixed[0].id).toBe('n');
  await sinBanderas(cmPage, '2026-11');
  await expect(aviso(cmPage)).toBeVisible();   // vuelve a quedar pendiente de decidir
  await expect(cmPage.locator('#budgetBody .budget-notice-done')).toHaveCount(0);

  // Rehacer de nuevo y editar el mes: el deshacer desaparece (no pisaría lo nuevo que escribió).
  await btn(cmPage, 'Rehacer los marcados').click();
  const id = (await mes(cmPage, '2026-11')).fixed[0].id;
  await editarFijo(cmPage, '2026-11', id, 5);
  await cmPage.evaluate(() => renderBudget());
  await expect(btn(cmPage, 'Deshacer')).toHaveCount(0);
  expect((await mes(cmPage, '2026-11')).fixed[0].v3).toBe(5);
});

test('15. el estacional también cuenta en el presupuesto del objetivo y del informe (140.000 sobre 100.000 + 50.000 está dentro)', async ({ cmPage }) => {
  const [c1] = await cats(cmPage);
  await prep(cmPage, {
    hoy: '2026-10-20',
    budgets: { '2026-10': { fixed: [{ id: 'f', name: 'Super', category: c1, unit: 'u', v1: 100000, v2: 1, v3: 1 }], reserved: [], seasonal: [{ id: 'l1', seasonalId: 's1', name: 'Regalo', category: c1, amount: 50000 }], touched: true } },
    seasonals: [{ id: 's1', name: 'Regalo', month: 10, amount: 50000, category: c1 }],
  });
  await cmPage.evaluate((c) => {
    S.transactions = [{ id: 't1', type: 'expense', currency: 'ARS', category: c, date: '2026-10-10', amount: 140000 }];
    S.informes = {};
  }, c1);
  // Pantalla de presupuestos: dentro (140.000 de 150.000).
  await abrirPresupuesto(cmPage, '2026-10');
  const fila = cmPage.locator('#budgetBody .budget-cmp-row').first();
  await expect(fila).toContainText('150,000');
  await expect(fila.locator('.text-ok')).toBeVisible();
  await expect(fila.locator('.text-danger')).toHaveCount(0);
  // Objetivo ligado a la categoría: mismo total, no excedido.
  const obj = await cmPage.evaluate((c) => qobjLinkProgress('t4-2026', { type: 'finance', metric: 'presupuesto', category: c }), c1);
  expect(obj.label).toMatch(/140[.,]000\/\S*\s?150[.,]000/);
  expect(obj.exceeded).toBe(false);
  expect(obj.pct).toBe(93);
  // Informe: % ejecutado = 140.000 / 150.000.
  const pct = await cmPage.evaluate(() => { CMInformesData.invalidarCache(); return CMInformesData.valor('fin_presupuesto_ejecutado_pct', CMInformesData.claveDe('M', '2026-10-10')); });
  expect(pct).toBe(93.3);
});

// ── UX de la etapa 8: números largos en 390px, lista que se resuelve de una vez y aviso en el resumen ──
const base3 = () => ({ '2026-08': mesCm(1500, 5, 'a'), '2026-09': mesCm(2000, 2, 's'), '2026-10': mesCm(3000, 3, 'o'), '2026-11': mesCm(1500, 5, 'n'), '2026-12': mesCm(1500, 5, 'd') });
const lineaResumen = (page) => page.locator('#budgetSummaryBody .bsum-pend');
const pendientes = (page) => page.evaluate(() => _budgetPendingMonths(getActiveDate().slice(0, 7)));
async function reabrir(page, hoy) {
  await page.reload();
  await waitForBoot(page);
  await completeLoginOverlay(page);
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await hoyEs(page, hoy);
  await arrancar(page, +hoy.slice(0, 4));
}

for (const [monto, texto] of [[123456789, '9 dígitos'], [100000, 'monto normal']]) {
  test(`16. en 390px el total del presupuesto no desborda ni se corta (estacional de ${monto.toLocaleString('en-US')}, ${texto})`, async ({ cmPage }) => {
    const [c1] = await cats(cmPage);
    await cmPage.setViewportSize({ width: 390, height: 844 });
    await prep(cmPage, { hoy: '2026-11-15', budgets: { '2026-11': OCT }, seasonals: [{ id: 's1', name: 'Regalo', month: 11, amount: monto, category: c1 }] });
    await arrancar(cmPage, 2026);
    await abrirPresupuesto(cmPage, '2026-11');
    await expect(cmPage.locator('#budgetBody [data-seasonal-line]')).toHaveCount(1);
    await cmPage.mouse.move(0, 0);
    const esperado = await cmPage.evaluate(() => { const b = S.budgets['2026-11']; return fmtMoney(b.fixed.reduce((s, x) => s + x.v1 * x.v2 * x.v3, 0) + b.reserved.reduce((s, x) => s + x.amount, 0) + b.seasonal.reduce((s, x) => s + x.amount, 0), 'ARS'); });
    const m = await cmPage.evaluate(() => {
      const bb = document.getElementById('budgetBody'), ov = document.getElementById('ov-budget');
      const num = bb.querySelector('.budget-total-num'), box = bb.querySelector('.budget-totals');
      const r = num.getBoundingClientRect(), rb = box.getBoundingClientRect();
      return {
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
        bb: bb.scrollWidth - bb.clientWidth,
        ov: ov ? ov.scrollWidth - ov.clientWidth : 0,
        numInterno: num.scrollWidth - num.clientWidth,
        totalsInterno: box.scrollWidth - box.clientWidth,
        dentro: r.left >= rb.left - 0.5 && r.right <= rb.right + 0.5,
        texto: num.textContent.trim(),
        subs: [...box.querySelectorAll('.budget-total-sub span')].map((s) => s.scrollWidth - s.clientWidth),
      };
    });
    expect(m.texto).toBe(esperado);          // el total completo, sin '…'
    expect(m.texto).not.toContain('…');
    for (const k of ['doc', 'body', 'bb', 'ov', 'numInterno', 'totalsInterno']) expect(m[k], k).toBeLessThanOrEqual(1);
    for (const v of m.subs) expect(v).toBeLessThanOrEqual(1);
    expect(m.dentro).toBe(true);
  });
}

test('17. la lista se resuelve de una vez: Rehacer los marcados y Dejar los demás; no vuelve a aparecer al reabrir ni recargar', async ({ cmPage, consoleErrors }) => {
  // Es el test más largo del archivo: carga la app 3 veces (fixture + 2 reaperturas, ~4 s cada una por la animación del login)
  // y, en vacío, tarda 22-26 s tanto en HEAD como en el árbol nuevo (medido). Con la suite completa en paralelo el reload
  // pasaba los 30 s por carga de CPU, no por lógica. 60 s deja margen sin tocar el timeout global.
  test.setTimeout(60000);
  await prep(cmPage, { hoy: '2026-10-20', budgets: base3() });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-11');
  expect(await marcados(cmPage)).toEqual([['2026-10', false], ['2026-11', true], ['2026-12', true]]);
  // Marca solo noviembre y rehace: ese cambia, los otros dos siguen igual y la lista sigue ahí.
  await cmPage.locator('#budgetPending input[data-pend="2026-12"]').uncheck();
  await btn(cmPage, 'Rehacer los marcados').click();
  expect(await tot(cmPage, '2026-11')).toBe(9000);
  expect(await mes(cmPage, '2026-11')).toMatchObject({ auto: false, touched: false, base: '2026-10' });
  await sinBanderas(cmPage, '2026-10'); await sinBanderas(cmPage, '2026-12');
  expect(await tot(cmPage, '2026-12')).toBe(7500);
  // Lo que había dejado sin marcar sigue sin marcar al repintarse.
  expect(await marcados(cmPage)).toEqual([['2026-10', false], ['2026-12', false]]);
  await expect(btn(cmPage, 'Rehacer los marcados')).toBeDisabled();
  // Dejar los demás: octubre y diciembre quedan resueltos; noviembre no se toca.
  await btn(cmPage, 'Dejar los demás como están').click();
  expect(await mes(cmPage, '2026-10')).toMatchObject({ touched: true });
  expect(await mes(cmPage, '2026-12')).toMatchObject({ touched: true });
  expect(await mes(cmPage, '2026-11')).toMatchObject({ auto: false, touched: false });
  expect(await tot(cmPage, '2026-12')).toBe(7500);
  expect(await tot(cmPage, '2026-10')).toBe(9000);
  await expect(aviso(cmPage)).toHaveCount(0);
  expect(await pendientes(cmPage)).toEqual([]);
  // Reabrir la app dos veces: sigue resuelto.
  for (let i = 0; i < 2; i++) {
    await reabrir(cmPage, '2026-10-20');
    expect(await pendientes(cmPage)).toEqual([]);
    await abrirPresupuesto(cmPage, '2026-11');
    await expect(aviso(cmPage)).toHaveCount(0);
    expect(await mes(cmPage, '2026-12')).toMatchObject({ touched: true });
    expect(await mes(cmPage, '2026-10')).toMatchObject({ touched: true });
  }
  // Y al llegar noviembre y diciembre tampoco vuelve a preguntar ni pisa nada.
  for (const hoy of ['2026-11-01', '2026-12-01']) {
    await hoyEs(cmPage, hoy);
    await arrancar(cmPage, 2026);
    await cmPage.evaluate(() => renderBudget());
    await expect(aviso(cmPage)).toHaveCount(0);
  }
  expect(await tot(cmPage, '2026-12')).toBe(7500);
  expect(consoleErrors).toEqual([]);
});

test('18. con ningún mes marcado no se puede rehacer, y Dejar los demás deja todos como están', async ({ cmPage }) => {
  await prep(cmPage, { hoy: '2026-10-20', budgets: base3() });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-11');
  await expect(btn(cmPage, 'Rehacer los marcados')).toBeEnabled();
  await cmPage.locator('#budgetPending input[data-pend="2026-11"]').uncheck();
  await expect(btn(cmPage, 'Rehacer los marcados')).toBeEnabled();   // diciembre sigue marcado
  await cmPage.locator('#budgetPending input[data-pend="2026-12"]').uncheck();
  expect((await marcados(cmPage)).every(([, on]) => !on)).toBe(true);
  await expect(btn(cmPage, 'Rehacer los marcados')).toBeDisabled();
  await cmPage.locator('#budgetPending input[data-pend="2026-10"]').check();
  await expect(btn(cmPage, 'Rehacer los marcados')).toBeEnabled();
  await cmPage.locator('#budgetPending input[data-pend="2026-10"]').uncheck();
  await expect(btn(cmPage, 'Rehacer los marcados')).toBeDisabled();
  const sinFlag = (b) => { const { touched, ...r } = b; return r; };
  const antes = await cmPage.evaluate(() => ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].map((m) => S.budgets[m]));
  await btn(cmPage, 'Dejar los demás como están').click();
  for (const mk of ['2026-10', '2026-11', '2026-12']) expect(await mes(cmPage, mk)).toMatchObject({ touched: true });
  expect(await tot(cmPage, '2026-11')).toBe(7500);
  expect(await tot(cmPage, '2026-10')).toBe(9000);
  // Solo se agregó la bandera: los límites de los meses quedaron idénticos.
  const despues = await cmPage.evaluate(() => ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].map((m) => S.budgets[m]));
  expect(despues.map(sinFlag)).toEqual(antes.map(sinFlag));
  await expect(aviso(cmPage)).toHaveCount(0);
});

test('19. el mes actual sin decidir queda resuelto con Dejar los demás (ya no queda pendiente para siempre)', async ({ cmPage }) => {
  await prep(cmPage, { hoy: '2026-10-20', budgets: { '2026-09': mesCm(2000, 2, 's'), '2026-10': mesCm(3000, 3, 'o') } });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-10');
  expect(await marcados(cmPage)).toEqual([['2026-10', false]]);   // el mes actual viene desmarcado
  expect(await pendientes(cmPage)).toEqual(['2026-10']);
  await btn(cmPage, 'Dejar los demás como están').click();
  expect(await mes(cmPage, '2026-10')).toMatchObject({ touched: true });
  expect(await pendientes(cmPage)).toEqual([]);
  await expect(aviso(cmPage)).toHaveCount(0);
  expect(await tot(cmPage, '2026-10')).toBe(9000);
});

test('20. el resumen de Finanzas avisa cuántos meses hay por revisar, solo si hay, y lleva a la pantalla de presupuestos', async ({ cmPage }) => {
  // Sin pendientes: no hay línea.
  await prep(cmPage, { hoy: '2026-10-20', budgets: { '2026-10': OCT } });
  await arrancar(cmPage, 2026);
  await cmPage.evaluate(() => renderBudget());   // renderBudget repinta también el resumen
  await expect(lineaResumen(cmPage)).toHaveCount(0);
  // Con 3 pendientes: una línea, con el número correcto.
  await prep(cmPage, { hoy: '2026-10-20', budgets: base3() });
  await arrancar(cmPage, 2026);
  await cmPage.evaluate(() => renderBudget());   // renderBudget repinta también el resumen
  await expect(lineaResumen(cmPage)).toHaveCount(1);
  await expect(lineaResumen(cmPage)).toContainText('Tenés 3 meses con presupuesto armado antes: revisalos');
  // Navega a la pantalla de presupuestos, donde está la lista.
  await lineaResumen(cmPage).click();
  await expect(cmPage.locator('#ov-budget #budgetBody')).toBeVisible();
  await expect(aviso(cmPage)).toBeVisible();
  // Resolver parte de la lista cambia el número; resolverla toda hace desaparecer la línea.
  await cmPage.locator('#budgetPending input[data-pend="2026-12"]').uncheck();
  await btn(cmPage, 'Rehacer los marcados').click();            // rehace noviembre
  await expect(lineaResumen(cmPage)).toContainText('Tenés 2 meses con presupuesto armado antes: revisalos');
  await btn(cmPage, 'Dejar los demás como están').click();      // octubre y diciembre
  await expect(lineaResumen(cmPage)).toHaveCount(0);
  // Un solo mes pendiente: singular.
  await prep(cmPage, { hoy: '2026-10-20', budgets: { '2026-10': mesCm(3000, 3, 'o'), '2026-11': mesCm(1500, 5, 'n') } });
  await arrancar(cmPage, 2026);
  await cmPage.evaluate(() => renderBudget());   // renderBudget repinta también el resumen
  await expect(lineaResumen(cmPage)).toContainText('Tenés 1 mes con presupuesto armado antes: revisalos');
});

test('21. Deshacer sigue funcionando con la lista de varios meses', async ({ cmPage }) => {
  await prep(cmPage, { hoy: '2026-10-20', budgets: base3() });
  await arrancar(cmPage, 2026);
  await abrirPresupuesto(cmPage, '2026-11');
  await btn(cmPage, 'Rehacer los marcados').click();   // noviembre y diciembre
  expect(await tot(cmPage, '2026-11')).toBe(9000);
  expect(await tot(cmPage, '2026-12')).toBe(9000);
  await expect(cmPage.locator('#budgetBody .budget-notice-done')).toContainText('Se rehizo Noviembre 2026, Diciembre 2026');
  await btn(cmPage, 'Deshacer').click();
  expect(await tot(cmPage, '2026-11')).toBe(7500);
  expect(await tot(cmPage, '2026-12')).toBe(7500);
  await sinBanderas(cmPage, '2026-11'); await sinBanderas(cmPage, '2026-12');
  expect(await marcados(cmPage)).toEqual([['2026-10', false], ['2026-11', true], ['2026-12', true]]);
});
