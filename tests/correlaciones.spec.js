'use strict';
const { test, expect } = require('./support/fixtures');

// Regresión: la caché de correlaciones se indexaba solo por {ventana, día}, así
// que la tarjeta quedaba congelada con el primer render de la sesión —
// normalmente vacío, porque al bootear todavía no hay datos cruzados— y seguía
// diciendo "faltan N días" toda la sesión aunque después se registrara el sueño
// o se completara el planner. Ver la firma de datos en correlaciones.js.
test('Relaciones se actualiza al aparecer datos nuevos en la sesión', async ({ cmPage }) => {
  const antes = await cmPage.evaluate(() => window.CMCorrelaciones.calcular(90).top.length);

  await cmPage.evaluate(() => {
    const iso = n => { const d = new Date(); d.setDate(d.getDate() - n);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    S.sleepLog = {}; S.dayPlan = {};
    for (let i = 1; i <= 25; i++) {
      const f = iso(i), h = 5 + (i % 5);
      S.sleepLog[f] = { hours: h, feeling: 3 };
      const hechas = Math.min(4, h - 4);
      S.dayPlan[f] = { grid: {}, tasks: Array.from({length: 4}, (_, k) => ({
        id: 't'+i+'_'+k, time: '09:00', priority: 2, text: 'x', done: k < hechas })) };
    }
  });

  // Sin forzar: la caché tiene que invalidarse sola por la firma de datos.
  const d = await cmPage.evaluate(() => {
    const r = window.CMCorrelaciones.calcular(90);
    return { top: r.top.length, mejor: r.top[0] ? { r: r.top[0].r, n: r.top[0].n } : null };
  });

  console.log('antes:', antes, '| despues:', JSON.stringify(d));
  expect(d.top).toBeGreaterThan(0);
  expect(d.mejor.n).toBeGreaterThanOrEqual(20);
  expect(Math.abs(d.mejor.r)).toBeGreaterThan(0.5);
});
