// Descifrado fiel a la maqueta HUD #7 (descifrar.js): lo que lo hace NOTAR, no solo que termine bien.
//   · mientras rueda: 0-9 y símbolos # % & @ * en celeste (#38BDF8) con brillo; los fijos en blanco (#EDF4FF)
//   · se fijan de izquierda a derecha y el número no cambia de ancho
//   · termina en texto plano con su color propio
//   · al cambiar el valor: el recuadro destella verde si sube, rojo si baja
//   · con reducir movimiento: valor directo, sin spans ni destello
// Datos de ejemplo inventados.
'use strict';
const { test, expect } = require('./support/fixtures');

const CUENTAS = [
  { id: 'efe', name: 'Efectivo', type: 'cash', balance: 200000, currency: 'ARS', icon: '💵' },
  { id: 'uala', name: 'Ualá', type: 'bank', balance: 500000, currency: 'ARS', icon: '🏦' },
];
const sembrar = (page) => page.evaluate((cuentas) => {
  S.accounts = cuentas.map((a) => ({ ...a })); S.cards = []; S.transactions = []; S.cardCharges = []; S.cardPayments = []; S.moves = [];
  renderFinanzasTab();
}, CUENTAS);

// Muestrea cuadro a cuadro el estado de cada carácter (texto, clase, color, brillo) y el ancho del número.
const muestrear = (page, sel, accion) => page.evaluate(({ sel, accion }) => new Promise((ok) => {
  const cuadros = [], t0 = performance.now();
  const el = () => document.querySelector(sel);
  let box = null, flash = '';
  // azar repetible: recorre todo el juego de caracteres (0-9 y # % & @ *) aunque headless pinte pocos cuadros
  let k = 0; const rnd0 = Math.random; Math.random = () => ((k++ * 0.37) % 1);
  setTimeout(() => { Math.random = rnd0; }, 2500);
  if (accion === 'entrar') document.querySelector('.nav-btn[data-tab="finanzas"]').click();
  else {
    box = el().closest('.nw-hero-text');
    S.accounts.find((a) => a.id === 'uala').balance += accion === 'bajar' ? -150000 : 150000;
    renderAccounts();
  }
  (function f() {
    const e = el();
    const spans = [...e.children].map((s) => { const cs = getComputedStyle(s); return { t: s.textContent, c: s.className, color: cs.color, sh: cs.textShadow, z: e.classList.contains('dx-z') }; });
    cuadros.push({ t: performance.now() - t0, txt: e.textContent, w: e.getBoundingClientRect().width, spans });
    if (box && !flash) flash = box.classList.contains('dx-up') ? 'up' : box.classList.contains('dx-down') ? 'down' : '';
    const t = performance.now() - t0;
    if ((t > 600 && !e._dx) || t > 8000) ok({ cuadros, final: e.textContent, kids: e.children.length, color: getComputedStyle(e).color, flash });
    else requestAnimationFrame(f);
  })();
}), { sel, accion });

test.describe('descifrado fiel a la maqueta', () => {
  test.use({ viewport: { width: 1280, height: 1400 } });

  test('(a) celeste con brillo mientras rueda, blanco al fijarse, de izquierda a derecha, ancho estable, final plano en su color', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    const r = await muestrear(cmPage, '#nwTotal', 'entrar');
    const ex = await cmPage.evaluate(() => fmtMoney(calcNetWorth(), 'USD'));
    const anim = r.cuadros.filter((q) => q.spans.length);
    expect(anim.length, 'cuadros con caracteres animados').toBeGreaterThanOrEqual(3);
    const rodando = anim.flatMap((q) => q.spans.filter((s) => /dx-r/.test(s.c)));
    expect(rodando.length).toBeGreaterThan(0);
    for (const s of rodando) {
      expect(s.color, 'rueda en celeste').toBe('rgb(56, 189, 248)');
      expect(s.sh, 'con brillo').not.toBe('none');
      expect(s.t).toMatch(/^[0-9#%&@*]$/);
    }
    const fijos = anim.flatMap((q) => q.spans.filter((s) => /dx-s/.test(s.c) && !s.z));
    expect(fijos.some((s) => s.color === 'rgb(237, 244, 255)'), 'fijos en blanco').toBe(true);
    expect(rodando.some((s) => /[#%&@*]/.test(s.t)), 'aparecen símbolos, no solo dígitos').toBe(true);
    // izquierda a derecha: en cada cuadro, ningún dígito fijo a la derecha de uno que todavía rueda
    for (const q of anim) {
      const est = q.spans.filter((s) => /dx-d/.test(s.c)).map((s) => (/dx-r/.test(s.c) ? 'r' : 's')).join('');
      expect(est, `orden de asentado "${est}"`).toMatch(/^s*r*$/);
    }
    const w0 = r.cuadros[r.cuadros.length - 1].w;
    for (const q of anim) expect(Math.abs(q.w - w0), 'el número no cambia de ancho').toBeLessThanOrEqual(1);
    expect(r.final).toBe(ex);
    expect(r.kids, 'termina en texto plano').toBe(0);
    expect(r.color, 'vuelve a su color propio (verde Finanzas)').toBe('rgb(187, 247, 208)');
    expect(consoleErrors).toEqual([]);
  });

  test('(b) al cambiar el valor destella rojo si baja y verde si sube, y termina en el valor nuevo', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await cmPage.waitForFunction(() => !document.getElementById('nwTotal')._dx, null, { timeout: 15000 });
    await cmPage.waitForTimeout(400);
    const baja = await muestrear(cmPage, '#nwTotal', 'bajar');
    expect(baja.flash).toBe('down');
    expect(baja.cuadros.some((q) => q.spans.some((s) => /dx-r/.test(s.c))), 'se re-descifra').toBe(true);
    expect(baja.final).toBe(await cmPage.evaluate(() => fmtMoney(calcNetWorth(), 'USD')));
    await cmPage.waitForTimeout(1200);
    const sube = await muestrear(cmPage, '#nwTotal', 'subir');
    expect(sube.flash).toBe('up');
    expect(sube.final).toBe(await cmPage.evaluate(() => fmtMoney(calcNetWorth(), 'USD')));
    await cmPage.waitForTimeout(1200);
    expect(await cmPage.evaluate(() => document.querySelectorAll('.dx-sweep, .dx-flash').length), 'el destello se limpia').toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  test('(c) cambios rápidos seguidos: nunca queda un valor mezclado', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await cmPage.waitForFunction(() => !document.getElementById('nwTotal')._dx, null, { timeout: 15000 });
    const r = await cmPage.evaluate(async () => {
      for (let i = 0; i < 6; i++) { S.accounts.find((a) => a.id === 'uala').balance += 11111 * (i % 2 ? -1 : 3); renderAccounts(); await new Promise((ok) => setTimeout(ok, 70)); }
      const el = document.getElementById('nwTotal');
      await new Promise((ok) => { (function f() { if (!el._dx) ok(); else setTimeout(f, 50); })(); });
      return { t: el.textContent, ex: fmtMoney(calcNetWorth(), 'USD'), kids: el.children.length, role: el.getAttribute('role') };
    });
    expect(r.t).toBe(r.ex);
    expect(r.kids).toBe(0);
    expect(r.role).toBeNull();
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('descifrado fiel · reducir movimiento', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 1400 } });
  test('(d) valor final directo, sin spans ni destello', async ({ cmPage, consoleErrors }) => {
    await sembrar(cmPage);
    await cmPage.click('.nav-btn[data-tab="finanzas"]');
    await cmPage.waitForTimeout(300);
    const r = await muestrear(cmPage, '#nwTotal', 'bajar');
    expect(r.cuadros.every((q) => q.spans.length === 0)).toBe(true);
    expect(r.flash).toBe('');
    expect(r.final).toBe(await cmPage.evaluate(() => fmtMoney(calcNetWorth(), 'USD')));
    expect(consoleErrors).toEqual([]);
  });
});
