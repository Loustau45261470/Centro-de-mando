// Números que se decodifican (descifrar.js): los KPIs grandes rotan sus dígitos al entrar a la sección y se fijan
// de izquierda a derecha; un cambio posterior re-descifra el número entero (maqueta #7) y su recuadro destella verde/rojo.
// Datos de ejemplo inventados.
'use strict';
const { test, expect } = require('./support/fixtures');

const CUENTAS = [
  { id: 'efe', name: 'Efectivo', type: 'cash', balance: 200000, currency: 'ARS', icon: '💵' },
  { id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' },
];

// Siembra datos con la pestaña Finanzas oculta (se escribe directo) y vuelve a Vida.
const sembrar = (page) => page.evaluate((cuentas) => {
  S.accounts = cuentas.map((a) => ({ ...a })); S.cards = []; S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
  renderFinanzasTab();
}, CUENTAS);

// Entra a Finanzas y muestrea el texto de varios elementos cuadro a cuadro durante `ms`.
const entrarYMuestrear = (page, sels, ms = 2500) => page.evaluate(({ sels, ms }) => new Promise((ok) => {
  const out = Object.fromEntries(sels.map((s) => [s, []]));
  document.querySelector('.nav-btn[data-tab="finanzas"]').click();
  const t0 = performance.now();
  (function f() {
    for (const s of sels) { const el = document.querySelector(s); out[s].push({ t: el.textContent, role: el.getAttribute('role'), label: el.getAttribute('aria-label') }); }
    const t = performance.now() - t0;   // termina cuando pasó `ms` Y ningún elemento sigue descifrándose (tope 12 s): no depende de los fps
    if ((t > ms && sels.every((s) => !document.querySelector(s)._dx)) || t > 12000) ok(out); else requestAnimationFrame(f);
  })();
}), { sels, ms });

const esperado = (page) => page.evaluate(() => ({
  total: fmtMoney(calcNetWorth(), 'USD'), cash: fmtMoney(calcCash(), 'USD'),
}));
// misma forma que el final: los caracteres que no son dígitos están fijos
const mismaForma = (s, final) => s.length === final.length && [...final].every((c, i) => /\d/.test(c) || s[i] === c);

test.describe('descifrar · con movimiento', () => {
  // Alto suficiente para que Patrimonio/Cash estén en pantalla al entrar: el descifrado completo espera a verse (un número bajo el pliegue se descifra recién al asomar).
  test.use({ viewport: { width: 1280, height: 1400 } });
  test('(a) entrar a Finanzas descifra Patrimonio y Cash, con forma estable, aria con el valor real y valor final exacto', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    const ex = await esperado(cmPage);
    const m = await entrarYMuestrear(cmPage, ['#nwTotal', '#nwCash']);
    for (const [sel, final] of [['#nwTotal', ex.total], ['#nwCash', ex.cash]]) {
      const v = m[sel];
      expect(v[v.length - 1].t, `${sel} termina en el valor real`).toBe(final);
      const raros = v.filter((x) => x.t !== final);
      // El descifrado escribe una vez por cuadro de animación; Chromium headless (sin GPU) corre a ~8-10 fps, así que en 600 ms caben ~5 escrituras.
      // Contar cuadros es frágil: alcanza con que haya pasado por al menos un valor descifrándose (la forma, el aria y el final se verifican abajo).
      expect(raros.length, `${sel} pasó por valores descifrándose`).toBeGreaterThanOrEqual(1);
      for (const x of raros) expect(mismaForma(x.t, final), `${sel} "${x.t}" conserva $ . , y el ancho`).toBe(true);
      for (const x of raros) { expect(x.role).toBe('img'); expect(x.label, 'lector de pantalla: valor real').toBe(final); }
      const fin = v[v.length - 1];
      expect(fin.role, 'sin aria temporal al terminar').toBeNull();
      expect(fin.label).toBeNull();
    }
    expect(consoleErrors).toEqual([]);
  });

  test('(a2) KPIs del kpi-strip (Vida y Finanzas) y centro de la dona terminan en el valor real', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);
    const ex = await esperado(cmPage);
    await cmPage.waitForTimeout(2300);   // descifrado completo ~1,1 s + 200 ms de arranque + render pesado
    expect(await cmPage.locator('#nwDonaNum').textContent()).toBe(ex.total);
    const kf = await cmPage.locator('#kpi-finanzas .k-val').allTextContents();
    expect(kf.length).toBeGreaterThan(0);
    // el texto que dejó el render es el que queda (se compara contra un re-render sin cambios)
    await cmPage.evaluate(() => JARVIS_INTEL.renderCard('finanzas'));
    await cmPage.waitForTimeout(500);
    expect(await cmPage.locator('#kpi-finanzas .k-val').allTextContents()).toEqual(kf);
    await cmPage.click('.nav-btn[data-tab="vida"]');
    await cmPage.waitForTimeout(2300);
    const kv = await cmPage.locator('#kpi-vida .k-val').allTextContents();
    const esperadoVida = await cmPage.evaluate(() => Array.from(document.querySelectorAll('#kpi-vida .k-val'), (e) => e.textContent));
    expect(kv).toEqual(esperadoVida);
    for (const t of kv) expect(t).toMatch(/^[\d🔥%/.,+\-h—\s]+$/u);   // ningún carácter aleatorio ajeno
    // resumen de movimientos (Ingresos / Gastos / Balance del mes)
    const sum = await cmPage.evaluate(() => { renderActivity(); return ['#txnSumIncome', '#txnSumExpense', '#txnSumBalance'].map((s) => document.querySelector(s).textContent); });
    await cmPage.waitForTimeout(800);
    expect(await cmPage.evaluate(() => ['#txnSumIncome', '#txnSumExpense', '#txnSumBalance'].map((s) => document.querySelector(s).textContent))).toEqual(sum);
    expect(consoleErrors).toEqual([]);
  });

  test('(b) guardar un gasto mientras anima termina en el valor nuevo', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    const r = await cmPage.evaluate(() => new Promise((ok) => {
      document.querySelector('.nav-btn[data-tab="finanzas"]').click();          // arranca el descifrado completo
      setTimeout(() => {                                                          // a mitad de la animación
        const antes = document.getElementById('nwTotal').textContent;
        document.getElementById('txnName').value = 'Gasto de ejemplo';
        document.getElementById('txnType').value = 'expense';
        document.getElementById('txnAmount').value = '123456';
        document.getElementById('txnCurrency').value = 'ARS';
        document.getElementById('txnAccount').value = 'uala';
        const n0 = S.transactions.length;
        addTransaction();
        setTimeout(() => ok({ n0, n1: S.transactions.length, antes, total: document.getElementById('nwTotal').textContent, cash: document.getElementById('nwCash').textContent, ex: fmtMoney(calcNetWorth(), 'USD'), exc: fmtMoney(calcCash(), 'USD'), role: document.getElementById('nwTotal').getAttribute('role') }), 2400);
      }, 200);
    }));
    expect(r.n1).toBe(r.n0 + 1);
    expect(r.total).toBe(r.ex);
    expect(r.cash).toBe(r.exc);
    expect(r.role).toBeNull();
    expect(r.total).not.toBe(r.antes);
    expect(consoleErrors).toEqual([]);
  });

  test('(b2) una llamada nueva cancela la anterior y el texto final siempre es el último valor', async ({ cmPage }) => {
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);
    await cmPage.waitForTimeout(900);
    const r = await cmPage.evaluate(async () => {
      const el = document.getElementById('nwTotal');
      cmDescifrar(el, '$1.111.111', { full: true });
      await new Promise((ok) => setTimeout(ok, 100));
      cmDescifrar(el, '$2.222.222');
      await new Promise((ok) => setTimeout(ok, 60));
      cmDescifrar(el, '$3.333.333');
      // re-descifrado entero (250 + 9·75 ms) + vuelta a su color (~0,4 s); headless pinta a pocos fps → se espera a que cierre (tope 6 s)
      const t0 = performance.now();
      await new Promise((ok) => { (function f() { if (!el._dx || performance.now() - t0 > 6000) ok(); else setTimeout(f, 50); })(); });
      if (performance.now() - t0 > 6000) return { t: 'no cerró', role: null, label: null };
      return { t: el.textContent, role: el.getAttribute('role'), label: el.getAttribute('aria-label') };
    });
    expect(r).toEqual({ t: '$3.333.333', role: null, label: null });
  });

  test('(d) un re-render por datos no relanza la animación completa; un cambio re-descifra el número entero (maqueta #7) y su recuadro destella verde', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await expect(cmPage.locator('#tab-finanzas')).toHaveClass(/active/);
    await cmPage.waitForTimeout(2300);
    const final0 = (await esperado(cmPage)).total;
    // mismo dato, varios re-renders: el texto nunca se mueve
    const quieto = await cmPage.evaluate(() => new Promise((ok) => {
      const el = document.getElementById('nwTotal'), vistos = new Set();
      renderFinanzasTab(); saveState(); renderFinanzasTab();
      const t0 = performance.now();
      (function f() { vistos.add(el.textContent + '|' + el.getAttribute('role')); if (performance.now() - t0 > 400) ok([...vistos]); else requestAnimationFrame(f); })();
    }));
    expect(quieto).toEqual([final0 + '|null']);
    // un cambio (maqueta #7): rueda el número entero con $ y . fijos, termina en el valor nuevo y el recuadro destella verde (sube)
    const r = await cmPage.evaluate(() => new Promise((ok) => {
      const el = document.getElementById('nwTotal'), prev = el.textContent, vistos = [], box = el.closest('.nw-hero-text');
      S.accounts.find((a) => a.id === 'efe').balance += 3;                          // 700000 -> 700003
      renderAccounts();
      const fin = fmtMoney(calcNetWorth(), 'USD'), t0 = performance.now();
      let flash = '';
      (function f() {
        vistos.push(el.textContent);
        if (!flash && box.classList.contains('dx-up')) flash = 'up'; else if (!flash && box.classList.contains('dx-down')) flash = 'down';
        const t = performance.now() - t0;
        if ((t > 700 && !el._dx) || t > 6000) ok({ prev, fin, vistos, ultimo: el.textContent, flash }); else requestAnimationFrame(f);
      })();
    }));
    expect(r.ultimo).toBe(r.fin);
    expect(r.fin).not.toBe(r.prev);
    expect(r.vistos.some((t) => t !== r.fin), 'hubo descifrado').toBe(true);
    for (const t of r.vistos) expect(mismaForma(t, r.fin), `"${t}" conserva $ . y el ancho`).toBe(true);
    expect(r.flash, 'destello verde al subir').toBe('up');
    expect(consoleErrors).toEqual([]);
  });

  // Volver a entrar a la sección a mitad de un descifrado relee el DOM (dígitos al azar): no puede quedar como valor final.
  const irYVolver = (page, pasos) => page.evaluate(async (pasos) => {
    for (const t of pasos) { document.querySelector(`.nav-btn[data-tab="${t}"]`).click(); await new Promise((ok) => setTimeout(ok, 90)); }
  }, pasos);

  test('(e) vida → finanzas → vida → finanzas con 90 ms entre clicks: Patrimonio queda en el valor real', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    const ex = await esperado(cmPage);
    await irYVolver(cmPage, ['vida', 'finanzas', 'vida', 'finanzas']);
    await cmPage.waitForFunction(() => ['#nwTotal', '#nwCash'].every((s) => !document.querySelector(s)._dx), null, { timeout: 15000 });   // espera a que termine, no un tiempo fijo
    const r = await cmPage.evaluate(() => ['#nwTotal', '#nwCash'].map((s) => { const e = document.querySelector(s); return [e.textContent, e.getAttribute('role'), !!e._dx]; }));
    expect(r[0]).toEqual([ex.total, null, false]);
    expect(r[1]).toEqual([ex.cash, null, false]);
    // llamada directa a mitad de animación con el texto que hay en pantalla
    const d = await cmPage.evaluate(async () => {
      const el = document.getElementById('nwTotal'), real = el.textContent;
      cmDescifrar(el, real, { full: true });
      await new Promise((ok) => setTimeout(ok, 150));
      cmDescifrar(el, el.textContent, { full: true });
      await new Promise((ok) => setTimeout(ok, 2400));
      return { real, t: el.textContent };
    });
    expect(d.t).toBe(d.real);
    expect(consoleErrors).toEqual([]);
  });

  test('(e2) lo mismo con las tiras de KPI (jarvis-intel): re-render a mitad de animación termina en el valor real', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    await irYVolver(cmPage, ['vida', 'finanzas', 'vida', 'finanzas']);
    await cmPage.evaluate(async () => { JARVIS_INTEL.renderCard('finanzas'); await new Promise((ok) => setTimeout(ok, 60)); JARVIS_INTEL.renderCard('finanzas'); });
    await cmPage.waitForFunction(() => [...document.querySelectorAll('#kpi-finanzas .k-val')].every((e) => !e._dx), null, { timeout: 15000 });
    const a = await cmPage.locator('#kpi-finanzas .k-val').allTextContents();
    await cmPage.evaluate(() => JARVIS_INTEL.renderCard('finanzas'));
    await cmPage.waitForTimeout(600);
    expect(await cmPage.locator('#kpi-finanzas .k-val').allTextContents()).toEqual(a);
    for (const t of a) expect(t).toMatch(/^[0-9🔥%/.,+h—\s-]+$/u);
    expect(await cmPage.evaluate(() => [...document.querySelectorAll('#kpi-finanzas .k-val')].some((e) => e._dx || e.getAttribute('role')))).toBe(false);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('descifrar · reducir movimiento', () => {
  test.use({ reducedMotion: 'reduce' });
  test('(c) texto final inmediato, sin rotación ni aria temporal', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    const ex = await esperado(cmPage);
    const m = await entrarYMuestrear(cmPage, ['#nwTotal', '#nwCash'], 500);
    for (const [sel, final] of [['#nwTotal', ex.total], ['#nwCash', ex.cash]]) {
      for (const x of m[sel]) { expect(x.t).toBe(final); expect(x.role).toBeNull(); expect(x.label).toBeNull(); }
    }
    const r = await cmPage.evaluate(() => { const el = document.getElementById('nwTotal'); cmDescifrar(el, '$9.999', { full: true }); return el.textContent; });
    expect(r).toBe('$9.999');
    expect(consoleErrors).toEqual([]);
  });
});
