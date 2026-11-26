// Descifrado de números (descifrar.js): el efecto tiene que VERSE.
// Causa raíz que cubre: el descifrado completo duraba 600 ms contados desde que se llamaba (antes del primer cuadro pintado y con la
// sección todavía apareciendo) y corría aunque el número estuviera bajo el pliegue → el usuario veía ~0-3 cuadros cifrados.
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

// Entra a Finanzas y anota cada escritura del elemento: texto, instante y si el usuario lo podía ver (en pantalla y opaco).
const observar = (page, sel, { ms, scrollAl }) => page.evaluate(({ sel, ms, scrollAl }) => new Promise((ok) => {
  const el = document.querySelector(sel), log = [], t0 = performance.now();
  const visible = () => { const r = el.getBoundingClientRect(); let op = 1; for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && op > 0.5; };
  new MutationObserver(() => log.push({ t: performance.now() - t0, txt: el.textContent, vis: visible() })).observe(el, { childList: true, characterData: true, subtree: true });
  document.querySelector('.nav-btn[data-tab="finanzas"]').click();
  if (scrollAl) setTimeout(() => el.scrollIntoView({ block: 'center' }), scrollAl);
  // termina pasado `ms` y cuando el descifrado ya cerró (tope 15 s): no depende de los fps
  (function esperar() { if ((performance.now() - t0 > ms && !el._dx) || performance.now() - t0 > 15000) ok({ log, final: el.textContent, dx: !!el._dx }); else setTimeout(esperar, 100); })();
}), { sel, ms, scrollAl });

const cifradas = (r) => r.log.filter((x) => x.txt !== r.final);

test.describe('descifrado visible', () => {
  test.describe('número en pantalla', () => {
    test.use({ viewport: { width: 1280, height: 1400 } });
    test('(a) Patrimonio muestra varios cuadros cifrados VISIBLES durante ≥ 500 ms y termina en el valor real', async ({ cmPage }) => {
      await sembrar(cmPage);
      const r = await observar(cmPage, '#nwTotal', { ms: 1500 });
      const cif = cifradas(r), vis = cif.filter((x) => x.vis);
      expect(vis.length, 'al menos un cuadro cifrado visible').toBeGreaterThanOrEqual(1);
      // Tiempo, no cantidad (los fps de headless varían): desde el primer cuadro cifrado visible hasta que se escribe el valor real.
      const fin = r.log[r.log.length - 1];
      expect(fin.txt, 'la última escritura es el valor real').toBe(r.final);
      expect(fin.t - cif[0].t, 'ms desde el primer cuadro cifrado hasta el valor real (FULL_MS 1100; el viejo ~500)').toBeGreaterThanOrEqual(800);
      expect(r.final).toBe(await cmPage.evaluate(() => fmtMoney(calcNetWorth(), 'USD')));
      expect(r.dx).toBe(false);
    });
  });

  test.describe('número bajo el pliegue', () => {
    test.use({ viewport: { width: 1280, height: 800 } });
    test('(b) no se gasta fuera de pantalla: se descifra una vez al asomar', async ({ cmPage }) => {
      await sembrar(cmPage);
      const alto = await cmPage.evaluate(() => innerHeight);
      const r = await observar(cmPage, '#nwTotal', { ms: 4000, scrollAl: 2500 });
      const antes = cifradas(r).filter((x) => x.t < 2400);
      expect(antes.length, 'sin cuadros cifrados mientras está fuera de pantalla').toBe(0);
      const todas = cifradas(r).filter((x) => x.t >= 2400), despues = todas.filter((x) => x.vis);
      expect(despues.length, 'al menos un cuadro cifrado visible al asomar').toBeGreaterThanOrEqual(1);
      const fin = r.log[r.log.length - 1];
      expect(fin.txt, 'la última escritura es el valor real').toBe(r.final);
      expect(fin.t - todas[0].t, 'ms desde el primer cuadro cifrado al asomar hasta el valor real (FULL_MS 1100; el viejo ~500)').toBeGreaterThanOrEqual(800);
      expect(r.final).toBe(await cmPage.evaluate(() => fmtMoney(calcNetWorth(), 'USD')));
      expect(alto).toBe(800);
    });
  });

  test('(c) la franja de KPI de la sección: una sola pintura al entrar y muchos cuadros cifrados, termina en el valor real', async ({ cmPage }) => {
    await cmPage.evaluate(() => {
      const td = new Date().toLocaleDateString('sv-SE'); S.habitTrackers = S.habitTrackers || {};
      S.habitTrackers.conocimiento = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 'h' + n, name: 'h' + n, days: n <= 2 ? { [td]: 'done' } : {} }));
    });
    const r = await cmPage.evaluate(() => new Promise((ok) => {
      const box = document.getElementById('kpi-conocimiento'), log = [], t0 = performance.now(); let escrituras = 0;
      const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      Object.defineProperty(box, 'innerHTML', { configurable: true, set(v) { escrituras++; d.set.call(this, v); }, get() { return d.get.call(this); } });
      new MutationObserver(() => log.push({ t: performance.now() - t0, v: [...box.querySelectorAll('.k-val')].map((x) => x.textContent).join('|') })).observe(box, { childList: true, characterData: true, subtree: true });
      document.querySelector('.nav-btn[data-tab="conocimiento"]').click();
      setTimeout(() => { delete box.innerHTML; ok({ log, escrituras, final: [...box.querySelectorAll('.k-val')].map((x) => x.textContent).join('|') }); }, 3800);
    }));
    expect(r.escrituras, 'la franja se pinta una sola vez al entrar (sin valores parciales)').toBe(1);
    expect(r.final.split('|')[0]).toBe('2/6');
    const cif = r.log.filter((x) => x.v !== r.final);
    expect(new Set(cif.map((x) => x.v)).size, 'cuadros distintos cifrados').toBeGreaterThanOrEqual(4);
    const fin = r.log[r.log.length - 1];
    expect(fin.v).toBe(r.final);
    expect(fin.t - cif[0].t, 'duración del efecto hasta el valor real').toBeGreaterThanOrEqual(900);
  });
});
