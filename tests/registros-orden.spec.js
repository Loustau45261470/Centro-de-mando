// Registros: la lista se ordena por próximo aviso (más cercano primero), empates por nombre, sin próximo aviso al final.
// Solo presentación: S.registros no se reordena. Datos inventados; reloj fijo (martes 24/11/2026).
'use strict';
const { test, expect } = require('./support/fixtures');

const SHOT = 'C:/Users/Tobias/AppData/Local/Temp/claude/5d52610f902b8d2c/0ee1a2f9-6695-4db7-81d3-bffab298c7c8/scratchpad/registros-orden/';
const a = (page, h, m = 0) => page.clock.setFixedTime(new Date(2026, 10, 24, h, m));
const base = { inicio: '2026-11-01T00:00', dias: [0, 1, 2, 3, 4, 5, 6], preguntas: [] };
const REGS = [
  { ...base, id: 'r1', nombre: 'Cada hora', frecuencia: { tipo: 'cada', cada: 60, unidad: 'min' }, desde: '06:00', hasta: '22:00' },
  { ...base, id: 'r2', nombre: 'Tomar agua', frecuencia: { tipo: 'horas', horas: ['08:00'] } },
  { ...base, id: 'r3', nombre: 'Cierre del día', frecuencia: { tipo: 'horas', horas: ['21:00'] } },
  { ...base, id: 'r4', nombre: 'Mañana y mediodía', frecuencia: { tipo: 'horas', horas: ['06:00', '12:00'] } },
  { ...base, id: 'r5', nombre: 'Arranque', frecuencia: { tipo: 'horas', horas: ['08:00'] } },
  { ...base, id: 'r6', nombre: 'Pausado', pausado: true, pausadoDesde: '2026-11-02T00:00', frecuencia: { tipo: 'horas', horas: ['09:00'] } },
];
const orden = (page, h, m) => page.evaluate(async ({ h, m, REGS }) => {
  S.registros = JSON.parse(JSON.stringify(REGS)); rgRenderCard();
  return { ui: [...document.querySelectorAll('#registros-body .rg-row')].map(e => e.dataset.id), S: S.registros.map(r => r.id) };
}, { h, m, REGS });

test('Registros ordenados por próximo aviso', async ({ cmPage: page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  await a(page, 7, 0);
  await page.click('#rg-btn'); await expect(page.locator('#ov-registros.show #registros-body')).toBeVisible();
  // 07:00: r1 y r4 ya pasaron las 06:00 → r1 08:00 (cada hora), r2/r5 08:00; r4 12:00; r3 21:00; pausado al final.
  let o = await orden(page, 7, 0);
  expect(o.ui).toEqual(['r5', 'r1', 'r2', 'r4', 'r3', 'r6']);   // empate 08:00 por nombre: Arranque, Cada hora, Tomar agua
  await page.screenshot({ path: SHOT + '0700.png' });
  await a(page, 13, 0);
  o = await orden(page, 13, 0);
  // 13:00: r1 14:00, r3 21:00; luego los de mañana por su próximo: r4 06:00, r5/r2 08:00 (por nombre); pausado al final.
  expect(o.ui).toEqual(['r1', 'r3', 'r4', 'r5', 'r2', 'r6']);
  await page.screenshot({ path: SHOT + '1300.png' });
  await a(page, 22, 30);
  o = await orden(page, 22, 30);
  // 22:30: todo es de mañana: 06:00 (Cada hora, Mañana y mediodía), 08:00 (Arranque, Tomar agua), 21:00.
  expect(o.ui).toEqual(['r1', 'r4', 'r5', 'r2', 'r3', 'r6']);
  await page.screenshot({ path: SHOT + '2230.png' });
  // El arreglo guardado conserva su orden de creación.
  expect(o.S).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
});
