// HUD tanda 3b: arreglo de la cinta a 390 px (el SYNC/11K se leía a través de la marquesina) + E3 campanita (lo hecho se desliza y se borra),
// E6 plato de comidas (color de la sección Salud, sana/no sana), E8 cuenta regresiva en Vencimientos de TODAS las secciones y E9 monto que se imprime.
// Solo animan en el evento; reduced-motion = sin animación; datos sembrados en memoria (nada a Firestore).
'use strict';
const { test, expect } = require('./support/fixtures');
const { PNG } = require('playwright-core/lib/utilsBundle');

const SHOT = (n) => (process.env.T3B_DIR ? { path: process.env.T3B_DIR + '/' + n + '.png' } : undefined);
const irA = (page, tab) => page.evaluate((t) => switchTab(t, document.querySelector(`.nav-btn[data-tab="${t}"]`)), tab);
const sinHorizontal = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test.describe('cinta de arriba a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la marquesina no se lee a través del reloj ni del SYNC/tamaño', async ({ cmPage: p, consoleErrors }) => {
    await p.evaluate(() => { const d = new Date(Date.now() + 86400000); S.orders.push({ id: 'zz1', name: 'Pedido ZZ', arrival: d.toISOString().slice(0, 10) }); buildTickerAlerts(); });
    // Congela la cinta con un dato justo debajo de los indicadores.
    await p.addStyleTag({ content: '#ticker-inner{animation:none!important;transform:none!important}.tk-dot{animation:none!important}#tk-time{color:transparent!important;text-shadow:none!important}' });
    const cajas = await p.evaluate(() => {
      const R = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: Math.floor(b.left), y: 0, width: Math.ceil(b.width), height: 38 }; };
      const t = R('tk-time'), z = R('tk-size'), s = R('tk-sync');
      return { tiempo: t, derecha: { x: z.x - 2, y: 0, width: s.x + s.width - z.x + 4, height: 38 } };
    });
    const bajo = await p.evaluate(() => [...document.querySelectorAll('#ticker-inner .ticker-item')].some((e) => { const b = e.getBoundingClientRect(); return b.right > 200 && b.left < 285; }));
    expect(bajo).toBe(true);   // hay texto de la cinta justo debajo del SYNC: la prueba mide algo real
    for (const [nombre, clip] of Object.entries(cajas)) {
      let malos = -1;
      for (let intento = 0; intento < 3 && malos !== 0; intento++) {   // (el texto del reloj se oculta: cambia cada segundo; se mide solo lo que se ve a través de su fondo)
        const con = PNG.sync.read(await p.screenshot({ clip }));
        await p.evaluate(() => { document.getElementById('ticker-inner').style.visibility = 'hidden'; });
        const sin = PNG.sync.read(await p.screenshot({ clip }));
        await p.evaluate(() => { document.getElementById('ticker-inner').style.visibility = ''; });
        malos = 0;
        for (let i = 0; i < con.data.length; i += 4) if (Math.max(Math.abs(con.data[i] - sin.data[i]), Math.abs(con.data[i + 1] - sin.data[i + 1]), Math.abs(con.data[i + 2] - sin.data[i + 2])) > 24) malos++;
      }
      expect(malos, 'píxeles de la cinta que se ven a través de ' + nombre).toBe(0);
    }
    await p.screenshot(SHOT('ticker-390'));
    expect(await sinHorizontal(p)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('E3 campanita', () => {
  const a = (page, h, m = 0, dia = 15) => page.clock.setFixedTime(new Date(2026, 10, dia, h, m));
  const preparar = async (p) => { await p.evaluate(() => { S.foco = undefined; S.revisionSemanal = {}; localStorage.clear(); }); await a(p, 21); await p.evaluate(() => Principios.chequearAvisos()); };
  const bell = (p) => p.locator('#pr-avisos .pr-bell');
  const items = (p) => p.locator('#pr-av-panel .pr-av-item');

  test('late solo cuando sube el contador, el panel baja al abrir y lo descartado se desliza afuera y se borra', async ({ cmPage: p, consoleErrors }) => {
    await preparar(p);
    await expect(p.locator('#pr-avisos .pr-bell-n')).toHaveText('2');
    await expect(bell(p)).toHaveClass(/pr-bell-late/);                       // llegaron avisos: late
    await p.evaluate(() => _prAvPintar());
    await expect(bell(p)).not.toHaveClass(/pr-bell-late/);                    // re-pintar sin cambio de número no vuelve a animar
    await bell(p).click();
    await expect(p.locator('#pr-av-panel')).toHaveClass(/pr-av-abre/);        // al abrir baja
    expect(await p.evaluate(() => getComputedStyle(document.getElementById('pr-av-panel')).animationName)).toBe('pr-av-baja');
    await expect(items(p)).toHaveCount(2);
    await p.evaluate(() => _prAvPintar());
    await expect(p.locator('#pr-av-panel')).not.toHaveClass(/pr-av-abre/);   // un re-pintado con el panel abierto no lo vuelve a bajar
    await p.screenshot(SHOT('e3-panel-' + (await p.evaluate(() => innerWidth))));

    // El que sale vive menos de un segundo: un observador anota si llegó a estar en pantalla deslizándose.
    await p.evaluate(() => { window._saleVisto = null; new MutationObserver(() => { const g = document.querySelector('.pr-av-sale'); if (g && !window._saleVisto) window._saleVisto = getComputedStyle(g).animationName; }).observe(document.body, { subtree: true, childList: true, attributes: true }); });
    await p.locator('#pr-av-panel .pr-av-item', { hasText: 'Cerrá el día' }).locator('.pr-btn', { hasText: 'Descartar' }).click();
    await expect.poll(() => p.evaluate(() => window._saleVisto)).toBe('pr-av-sale');   // sale deslizándose
    await expect(p.locator('#pr-avisos .pr-av-sale')).toHaveCount(0, { timeout: 3000 });   // y se borra
    await expect(items(p)).toHaveCount(1);
    await expect(p.locator('#pr-av-panel', { hasText: 'Cerrá el día' })).toHaveCount(0);
    await expect(p.locator('#pr-av-panel .pr-av-ph')).toHaveText('Avisos (1)');
    await p.evaluate(() => Principios.chequearAvisos());
    await expect(p.locator('#pr-av-panel', { hasText: 'Cerrá el día' })).toHaveCount(0);   // no vuelve
    expect(await sinHorizontal(p)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('reduced-motion: ni late, ni baja, ni desliza: lo hecho desaparece de una', async ({ cmPage: p }) => {
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await preparar(p);
    await expect(bell(p)).not.toHaveClass(/pr-bell-late/);
    await bell(p).click();
    await expect(p.locator('#pr-av-panel')).not.toHaveClass(/pr-av-abre/);
    await p.locator('#pr-av-panel .pr-av-item', { hasText: 'Cerrá el día' }).locator('.pr-btn', { hasText: 'Descartar' }).click();
    await expect(p.locator('#pr-avisos .pr-av-sale')).toHaveCount(0);
    await expect(items(p)).toHaveCount(1);
  });
});

test.describe('E6 plato de comidas', () => {
  const sembrar = (p) => p.evaluate(() => {
    S.comidas = { alimentos: [
      { id: 'a1', nombre: 'Avena de ejemplo', unidad: 'g', sana: true, comidas: ['desayuno'] },
      { id: 'a2', nombre: 'Factura de ejemplo', unidad: 'u', sana: false, comidas: ['desayuno'] },
      { id: 'a3', nombre: 'Ensalada de ejemplo', unidad: 'g', sana: true, comidas: ['almuerzo'] },
    ], registro: {} };
    renderDieta(); renderDietaResumen(); openDietaOverlay();
  });
  const marcar = (p, nombre) => p.locator('#dietaBody .com-row', { hasText: nombre }).locator('input[type=checkbox]').check();
  const dash = (p, i, k) => p.locator(`#comPlato .com-plato-p[data-i="${i}"][data-k="${k}"]`).evaluate((e) => e.style.strokeDasharray.split(/[ ,]+/).map(Number).join(' '));

  test('usa el color de la sección y distingue sana de no sana; se mueve al marcar', async ({ cmPage: p, consoleErrors }) => {
    await p.click('.nav-btn[data-tab="salud"]');
    await sembrar(p);
    await expect(p.locator('#dietaBody #comPlato')).toBeVisible();
    await expect(p.locator('#comPlato .com-plato-ct b')).toHaveText('0/4');
    expect(await dash(p, 0, 's')).toBe('0 0 0 2');
    await marcar(p, 'Avena de ejemplo');
    await expect(p.locator('#comPlato .com-plato-ct b')).toHaveText('1/4');
    await expect.poll(() => dash(p, 0, 's')).toBe('0 0 1 2');
    await marcar(p, 'Factura de ejemplo');
    await expect.poll(() => dash(p, 0, 's')).toBe('0 0 0.5 2');
    await expect.poll(() => dash(p, 0, 'n')).toBe('0 0.5 0.5 2');
    await marcar(p, 'Ensalada de ejemplo');
    await expect(p.locator('#comPlato .com-plato-ct b')).toHaveText('2/4');
    await p.waitForTimeout(900);   // termina la transición
    const est = await p.evaluate(() => {
      const probe = document.createElement('i'); probe.style.color = 'var(--c-salud)'; document.body.appendChild(probe);
      const sec = getComputedStyle(probe).color; probe.remove();
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      const s = cs('#comPlato .com-plato-p.s[data-i="0"]'), n = cs('#comPlato .com-plato-p.n[data-i="0"]');
      return { sec, sStroke: s.stroke, nStroke: n.stroke, sOp: Number(s.opacity), nOp: Number(n.opacity) };
    });
    expect(est.sStroke).toBe(est.sec);
    expect(est.nStroke).toBe(est.sec);                 // mismo color de la sección…
    expect(est.sOp).toBeGreaterThan(est.nOp + 0.3);   // …con otra intensidad para la no sana
    const pintados = await p.evaluate(() => [...document.querySelectorAll('#comPlato .com-plato-p')].filter((e) => { const d = e.style.strokeDasharray.split(/[ ,]+/).map(Number); return d[2] > 0; }).length);
    expect(pintados).toBe(3);                          // desayuno sana + desayuno no sana + almuerzo sana
    await p.screenshot(SHOT('e6-' + (await p.evaluate(() => innerWidth))));
    expect(await sinHorizontal(p)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('guardar/volver a pintar no re-anima y reduced-motion no tiene transición', async ({ cmPage: p }) => {
    await p.click('.nav-btn[data-tab="salud"]');
    await sembrar(p);
    await marcar(p, 'Avena de ejemplo');
    await p.waitForTimeout(900);
    const prop = await p.evaluate(() => { renderDieta(); return getComputedStyle(document.querySelector('#comPlato .com-plato-p.s[data-i="0"]')).strokeDasharray; });
    expect(prop.replace(/px/g, '').replace(/,/g, '')).toMatch(/^0 0 1(\.0+)? 2$/);   // ya sale en su estado final
    await p.emulateMedia({ reducedMotion: 'reduce' });
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('#comPlato .com-plato-p')).transitionDuration)).toBe('0s');
  });
});

test.describe('E8 cuenta regresiva en Vencimientos (todas las secciones)', () => {
  const TABS = ['vida', 'finanzas', 'salud', 'conocimiento', 'ia'];
  const poner = (p, tab, offsetMin) => p.evaluate(([tab, off]) => {
    const iso = (d) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
    S.reminders = S.reminders || {};
    S.reminders[tab] = [{ id: 'e8', title: 'Cuenta de ejemplo', datetime: iso(new Date(Date.now() + off * 60000)), priority: 'medium' }];
    renderRemindersNotif(tab);
    const it = document.querySelector(`#reminders-notif-${tab} .rnotif-item`), cd = it.querySelector('.rnotif-cd');
    return { cls: it.className, color: getComputedStyle(cd).color, txt: cd.textContent, bar: !!it.querySelector('.rnotif-bar b'), w: it.querySelector('.rnotif-bar b') ? it.querySelector('.rnotif-bar b').style.getPropertyValue('--w') : null };
  }, [tab, offsetMin]);

  for (const tab of TABS) {
    test('cards de ' + tab + ': verde, ámbar y rojo según la cercanía, con barra', async ({ cmPage: p, consoleErrors }) => {
      await irA(p, tab);
      const lejos = await poner(p, tab, 9 * 24 * 60), medio = await poner(p, tab, 3 * 24 * 60 + 90), cerca = await poner(p, tab, 120);
      expect(lejos.cls).toMatch(/rnotif-t-v/); expect(medio.cls).toMatch(/rnotif-t-a/); expect(cerca.cls).toMatch(/rnotif-t-r/);
      expect(cerca.cls).toMatch(/rnotif-hot/); expect(lejos.cls).not.toMatch(/rnotif-hot/);
      expect(new Set([lejos.color, medio.color, cerca.color]).size).toBe(3);
      expect(lejos.bar && medio.bar && cerca.bar).toBe(true);
      expect(Number(lejos.w)).toBeGreaterThan(Number(medio.w)); expect(Number(medio.w)).toBeGreaterThan(Number(cerca.w));
      expect(medio.txt).toMatch(/^3 d \d+ h$/); expect(cerca.txt).toMatch(/^01:5\d:\d\d$/);
      expect(await sinHorizontal(p)).toBe(true);
      if (tab === 'vida') {
        const t0 = await p.locator('#reminders-notif-vida .rnotif-hot .rnotif-cd').textContent();
        await expect.poll(() => p.locator('#reminders-notif-vida .rnotif-hot .rnotif-cd').textContent(), { timeout: 4000 }).not.toBe(t0);   // corren los segundos
        await p.evaluate(() => {
          const iso = (d) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
          const en = (min) => iso(new Date(Date.now() + min * 60000));
          S.reminders.vida = [{ id: 'q1', title: 'Pago de la tarjeta', datetime: en(95), priority: 'high' }, { id: 'q2', title: 'Final de Civil', datetime: en(3 * 1440 + 200), priority: 'medium' }, { id: 'q3', title: 'Entrega de TP', datetime: en(9 * 1440), priority: 'low' }, { id: 'q4', title: 'Alquiler', datetime: en(-1500), priority: 'high' }];
          renderRemindersNotif('vida');
        });
        await p.locator('#rnotif-card-vida').scrollIntoViewIfNeeded();
        await p.waitForTimeout(600);
        await p.screenshot(SHOT('e8-' + (await p.evaluate(() => innerWidth))));
      }
      expect(consoleErrors).toEqual([]);
    });
  }

  test('vencido sigue como «Vencido» sin barra y reduced-motion no late', async ({ cmPage: p }) => {
    await irA(p, 'vida');
    const venc = await poner(p, 'vida', -30);
    expect(venc.cls).toMatch(/overdue/); expect(venc.cls).not.toMatch(/rnotif-t-/); expect(venc.bar).toBe(false); expect(venc.txt).toBe('Vencido');
    await poner(p, 'vida', 120);
    await p.emulateMedia({ reducedMotion: 'reduce' });
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('#reminders-notif-vida .rnotif-hot')).animationName)).toBe('none');
  });
});

test.describe('E9 monto que se imprime', () => {
  test.use({ locale: 'es-AR' });
  const abrir = async (p) => {
    await p.click('.nav-btn[data-tab="finanzas"]');
    await expect(p.locator('#tab-finanzas')).toHaveClass(/active/);
    await p.evaluate(() => { S.accounts = []; S.cards = []; S.cardCharges = []; S.cardPayments = []; S.cardDues = []; S.moves = []; S.transactions = []; S.purchaseFunds = []; S.purchaseFundLog = {}; S.budgets = {}; renderFinanzasTab(); });
    await p.click('#activity-card button:has-text("+ Movimiento")');
    await expect(p.locator('#modal-add-txn')).toHaveClass(/open/);
  };

  test('escribir 1234,5 imprime con puntos de miles, el campo real queda bien y se guarda bien', async ({ cmPage: p, consoleErrors }) => {
    await abrir(p);
    await expect(p.locator('#txnPrint .txn-print-d')).toHaveText('$0');
    await p.fill('#txnName', 'Gasto de ejemplo');
    await p.locator('#txnAmount').pressSequentially('1234,5');
    expect(await p.inputValue('#txnAmount')).toBe('1234.5');          // el input real conserva su valor normal
    await expect(p.locator('#txnPrint .txn-print-d')).toHaveText('$1.234,5');
    await expect(p.locator('#txnPrint .txn-print-ch.nw')).toHaveCount(1);   // solo el último carácter cae
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('.txn-print-ch.nw')).animationName)).toBe('txn-print-in');
    await p.screenshot(SHOT('e9-' + (await p.evaluate(() => innerWidth))));
    await p.click('#modal-add-txn button:has-text("Registrar")');
    await expect(p.locator('#modal-add-txn')).not.toHaveClass(/open/);
    const t = await p.evaluate(() => S.transactions[0] && { amount: S.transactions[0].amount, currency: S.transactions[0].currency, name: S.transactions[0].name });
    expect(t).toEqual({ amount: 1234.5, currency: 'ARS', name: 'Gasto de ejemplo' });
    // reabrir: el campo vuelve a 0 y no queda nada animando
    await p.click('#activity-card button:has-text("+ Movimiento")');
    await expect(p.locator('#txnPrint .txn-print-d')).toHaveText('$0');
    await expect(p.locator('#txnPrint .txn-print-ch.nw')).toHaveCount(0);
    expect(await sinHorizontal(p)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('con presupuesto cargado la barra de luces marca el % del mes; sin él no aparece', async ({ cmPage: p }) => {
    await abrir(p);
    await p.locator('#txnAmount').pressSequentially('2500');
    await expect(p.locator('#txnPrint .txn-print-led')).toBeHidden();
    await p.evaluate(() => { const mk = _curMonthKey(); S.budgets = { [mk]: { fixed: [{ id: 'b1', name: 'G', v1: 1, v2: 1, v3: 10000, cat: '' }], reserved: [], seasonal: [] } }; });
    await p.locator('#txnAmount').pressSequentially('0');   // 25000 → te pasaste
    await expect(p.locator('#txnPrint .txn-print-note')).toHaveText('250% del presupuesto del mes · te pasaste');
    expect(await p.locator('#txnPrint .txn-print-led i.on').count()).toBe(20);
    await p.locator('#txnAmount').fill('');
    await p.locator('#txnAmount').pressSequentially('2500');
    await expect(p.locator('#txnPrint .txn-print-note')).toHaveText('25% del presupuesto del mes');
    expect(await p.locator('#txnPrint .txn-print-led i.on').count()).toBe(5);
  });

  test('reduced-motion: el carácter no cae', async ({ cmPage: p }) => {
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await abrir(p);
    await p.locator('#txnAmount').pressSequentially('12');
    expect(await p.evaluate(() => getComputedStyle(document.querySelector('.txn-print-ch.nw')).animationName)).toBe('none');
    await expect(p.locator('#txnPrint .txn-print-d')).toHaveText('$12');
  });
});
