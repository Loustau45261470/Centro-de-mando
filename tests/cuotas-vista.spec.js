// Vista propia «Cuotas» (cuotas.js): F7 (lo que debés, luces por compra, casilla para pagar el mes)
// + J4 (cuándo quedás libre). Datos 100 % ficticios; la fecha de "hoy" se fija pisando getActiveDate().
'use strict';
const { test, expect } = require('./support/fixtures');

const HOY = '2026-11-28';   // Visa ya cerró el 27/11 (vence 10/12); Master cerró el 20/11 (vence 05/12)
const VISA = { id: 'visa', name: 'Visa', limit: 5000000, closeDay: 27, dueDay: 10, openingUsed: 0, payAccountId: 'banco' };
const MASTER = { id: 'master', name: 'Master', limit: 2000000, closeDay: 20, dueDay: 5, openingUsed: 0, payAccountId: 'banco' };
const COMPRAS = [
  { id: 'q1', cardId: 'visa', date: '2026-05-15', amount: 1200000, mode: 'nowInst', installments: 12, name: 'Heladera' },
  { id: 'q2', cardId: 'master', date: '2026-09-01', amount: 180000, mode: 'nowInst', installments: 3, name: 'Zapatillas' },
  { id: 'q3', cardId: 'visa', date: '2026-11-25', amount: 1200000, mode: 'nowInst', installments: 12, name: 'Notebook' },
  { id: 'q4', cardId: 'visa', date: '2026-08-10', amount: 210000, mode: 'nowInst', installments: 3, name: 'Kimono' },
];

async function preparar(page, { compras = COMPRAS, cards = [VISA, MASTER] } = {}) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
  await page.evaluate(({ hoy, compras, cards }) => {
    window.getActiveDate = () => hoy;
    S.accounts = [{ id: 'banco', name: 'Banco', type: 'bank', balance: 5000000, currency: 'ARS', icon: '🏦' }];
    S.cards = cards;
    S.transactions = []; S.cardCharges = compras.map((c) => ({ category: '', ...c })); S.cardPayments = []; S.cardDues = []; S.moves = [];
    renderFinanzasTab();
  }, { hoy: HOY, compras, cards });
}
const saldo = (page) => page.evaluate(() => S.accounts.find((a) => a.id === 'banco').balance);
const abrir = async (page) => {
  await page.locator('#ccCuotasOpen').click();
  await expect(page.locator('#ov-cuotas')).toHaveClass(/show/);
};

for (const ancho of [1280, 390]) {
  test.describe(`vista Cuotas (${ancho})`, () => {
    test.use({ viewport: { width: ancho, height: 900 } });

    test('se abre desde la card Crédito, muestra lo que debés y el calendario, y cierra con ✕ y Escape', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await expect(page.locator('#ccCuotasOpen')).toContainText('$1.860.000 por pagar');
      await expect(page.locator('#ccCuotasOpen')).toContainText('libre en dic 2027');
      await abrir(page);
      // F7: el botón no abre además la ventana de Tarjetas
      await expect(page.locator('#cq-total')).toHaveText('$1.860.000');
      const rows = page.locator('#ov-cuotas .cq-row');
      await expect(rows).toHaveCount(4);
      const heladera = page.locator('.cq-row[data-charge-id="q1"]');
      await expect(heladera.locator('em')).toHaveText('cuota 7 de 12');
      await expect(heladera.locator('.cq-sub')).toHaveText('Visa · faltan 6 cuotas · $600.000');
      const est = await heladera.locator('.cq-l').evaluateAll((els) => els.map((e) => e.className.replace('cq-l ', '')));
      expect(est).toEqual([...Array(6).fill('cq-pa'), 'cq-cu', ...Array(5).fill('cq-fu')]);
      await expect(page.locator('.cq-row[data-charge-id="q4"]')).toHaveClass(/dn/);
      await expect(page.locator('.cq-row[data-charge-id="q4"] em')).toHaveText('Terminada');
      await expect(page.locator('.cq-f7 .cq-meta')).toHaveText('1 de 4 pagas este mes');
      // J4
      const k = page.locator('.cq-k > div');
      await expect(k.nth(0)).toContainText('Este mes pagás · nov 2026');
      await expect(k.nth(0).locator('.v')).toHaveText('$230.000');
      await expect(k.nth(1).locator('.v')).toHaveText('dic 2027');
      await expect(k.nth(1)).toContainText('en 13 meses');
      await expect(page.locator('.cq-free').first()).toHaveAttribute('data-m', String(2027 * 12 + 11));
      await expect(page.locator('.cq-c.end')).toHaveCount(4);
      await expect(page.locator('#cq-ro')).toContainText('nov 2026 · este mes · $230.000 en cuotas · última cuota de Kimono');
      // 390: sin scroll horizontal dentro de la vista
      const desborde = await page.evaluate(() => {
        const b = document.querySelector('#ov-cuotas .cm-ov-body');
        return { body: b.scrollWidth - b.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect(desborde.body).toBeLessThanOrEqual(0);
      expect(desborde.doc).toBeLessThanOrEqual(0);
      // ✕ y Escape
      await page.locator('#ov-cuotas .cm-ov-close').click();
      await expect(page.locator('#ov-cuotas')).not.toHaveClass(/show/);
      await expect(page.locator('#ov-tarjetas.show, .cm-overlay.show')).toHaveCount(0);
      await abrir(page);
      await page.keyboard.press('Escape');
      await expect(page.locator('#ov-cuotas')).not.toHaveClass(/show/);
      expect(consoleErrors).toEqual([]);
    });

    test('pagar el mes: registra el pago del resumen, baja el total con destello y se puede deshacer', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await abrir(page);
      const antes = await saldo(page);
      let guardados = 0;
      await page.evaluate(() => { const o = window.saveState; window.saveState = function () { window.__sv = (window.__sv || 0) + 1; return o.apply(this, arguments); }; });
      const ck = page.locator('.cq-row[data-charge-id="q1"] .cq-ck');
      await expect(ck).toHaveAttribute('aria-checked', 'false');
      await ck.click();
      // Paga todo el resumen de Visa del 10/12 (Heladera + Notebook), con el mismo registro que el pago automático.
      const pago = await page.evaluate(() => S.cardPayments.find((p) => p.key === 'auto:visa:2026-12-10'));
      expect(pago).toMatchObject({ id: 'auto:visa:2026-12-10', cardId: 'visa', amount: 200000, accountId: 'banco', kind: 'auto', via: 'cuotas', date: '2026-12-10' });
      expect(await saldo(page)).toBe(antes - 200000);
      guardados = await page.evaluate(() => window.__sv || 0);
      expect(guardados).toBeGreaterThan(0);
      await expect(page.locator('.cq-row[data-charge-id="q1"] .cq-ck')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.cq-row[data-charge-id="q3"] .cq-ck')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#cq-total')).toHaveText('$1.660.000');
      await expect(page.locator('.cq-f7 .cq-meta')).toHaveText('3 de 4 pagas este mes');
      await expect(page.locator('.cq-row[data-charge-id="q1"] .cq-l').nth(6)).toHaveClass(/cq-pa/);
      // Lo que ya se pagó no se vuelve a cobrar el día del vencimiento.
      await page.evaluate(() => { window.getActiveDate = () => '2026-12-10'; renderFinanzasTab(); });
      expect(await page.evaluate(() => S.cardPayments.filter((p) => p.key === 'auto:visa:2026-12-10').length)).toBe(1);
      // (ese salto de fecha pagó solo el resumen de Master del 05/12: 60.000)
      await page.evaluate((h) => { window.getActiveDate = () => h; renderFinanzasTab(); CMCuotas.render(); }, HOY);
      const antesDeshacer = await saldo(page);
      // Deshacer: vuelve la plata a la cuenta y desaparece el pago
      await page.locator('.cq-row[data-charge-id="q1"] .cq-ck').click();
      expect(await page.evaluate(() => S.cardPayments.some((p) => p.key === 'auto:visa:2026-12-10'))).toBe(false);
      expect(await saldo(page)).toBe(antesDeshacer + 200000);
      await expect(page.locator('#cq-total')).toHaveText('$1.800.000');
      expect(consoleErrors).toEqual([]);
    });

    test('destello al pagar y luces quietas con movimiento reducido', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page);
      await abrir(page);
      await page.locator('.cq-row[data-charge-id="q2"] .cq-ck').click();
      await expect(page.locator('.cq-row[data-charge-id="q2"] .cq-l.po')).toHaveCount(1);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => CMCuotas.render());
      const anim = await page.locator('.cq-l.cq-cu').first().evaluate((e) => getComputedStyle(e).animationName);
      expect(anim).toBe('none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      expect(consoleErrors).toEqual([]);
    });

    test('pago de resumen a mano: la barrita de Compras y la vista cuentan igual las cuotas cubiertas', async ({ cmPage: page, consoleErrors }) => {
      // Master sin cuenta de pago (no hay pago automático). Zapatillas vence 05/10, 05/11 y 05/12 (60.000 c/u);
      // un "Registrar pago de resumen" de 120.000 el 01/10 cubre los dos primeros vencimientos.
      const SIN_CUENTA = { ...MASTER, payAccountId: undefined };
      await preparar(page, { cards: [VISA, SIN_CUENTA], compras: [COMPRAS[1]] });
      await page.evaluate(() => {
        S.cardPayments = [{ id: 'm1', key: 'manual:m1', cardId: 'master', date: '2026-10-01', amount: 120000, accountId: 'banco', kind: 'manual', note: '' }];
        renderFinanzasTab();
      });
      const esperado = ['pagada', 'pagada', 'corriente'];
      // Barrita de Compras (ventana Tarjetas)
      await page.click('#credit-card');
      await expect(page.locator('#ov-tarjetas')).toHaveClass(/show/);
      await page.click('#tj-tab-compras');
      const barra = page.locator('.cc-chg[data-charge-id="q2"] .cc-cuotas .cc-q');
      expect(await barra.evaluateAll((els) => els.map((e) => e.className.replace('cc-q cc-q-', '')))).toEqual(esperado);
      await expect(page.locator('.cc-chg[data-charge-id="q2"] .cc-cuotas-txt')).toHaveText(/^2 de 3 pagadas/);
      await page.click('#ov-tarjetas .cm-ov-close');
      await expect(page.locator('#ov-tarjetas')).not.toHaveClass(/show/);
      // Vista Cuotas: mismas luces y solo falta la última cuota
      await abrir(page);
      const luces = page.locator('.cq-row[data-charge-id="q2"] .cq-l');
      const mapa = { 'cq-pa': 'pagada', 'cq-cu': 'corriente', 'cq-fu': 'futura' };
      expect(await luces.evaluateAll((els) => els.map((e) => e.className.replace('cq-l ', '')))).toEqual(['cq-pa', 'cq-pa', 'cq-cu']);
      expect(esperado).toEqual(['cq-pa', 'cq-pa', 'cq-cu'].map((c) => mapa[c]));
      await expect(page.locator('#cq-total')).toHaveText('$60.000');
      await expect(page.locator('.cq-row[data-charge-id="q2"] .cq-sub')).toHaveText('Master · falta 1 cuota · $60.000');
      expect(consoleErrors).toEqual([]);
    });

    test('estado vacío: sin compras en cuotas', async ({ cmPage: page, consoleErrors }) => {
      await preparar(page, { compras: [{ id: 'u1', cardId: 'visa', date: '2026-11-20', amount: 50000, mode: 'now1', name: 'Un pago' }] });
      await expect(page.locator('#ccCuotasOpen')).toContainText('Sin compras en cuotas');
      await abrir(page);
      await expect(page.locator('#ov-cuotas .cq-empty')).toBeVisible();
      await expect(page.locator('#ov-cuotas .cq-empty')).toContainText('No tenés compras en cuotas');
      await expect(page.locator('#ov-cuotas .cq-empty .cq-total')).toHaveText('$0');
      expect(consoleErrors).toEqual([]);
    });
  });
}
