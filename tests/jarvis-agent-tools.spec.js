// A5 — JARVIS (chat): herramientas add_reminder y mark_habit. Se ejecuta el handler directo (JARVIS_AGENT.exec),
// sin pasar por el modelo. Los datos de prueba se arman acá (el código no trae datos personales).
'use strict';
const { test, expect } = require('./support/fixtures');

const exec = (page, name, input) => page.evaluate(([n, i]) => JARVIS_AGENT.exec(n, i), [name, input]);
// Mañana a las 10:30 en hora local, formato de datetime-local.
const manana1030 = (page) => page.evaluate(() => getTomorrow() + 'T10:30');

test('las herramientas están declaradas con descripción y campos requeridos', async ({ cmPage }) => {
  const tools = await cmPage.evaluate(() => JARVIS_AGENT.tools.map((t) => ({ n: t.name, d: t.description, r: t.input_schema.required })));
  const rem = tools.find((t) => t.n === 'add_reminder');
  const hab = tools.find((t) => t.n === 'mark_habit');
  expect(rem.d.length).toBeGreaterThan(40);
  expect(rem.r).toEqual(['title', 'datetime']);
  expect(hab.d.length).toBeGreaterThan(40);
  expect(hab.r).toEqual(['name']);
  expect(tools.some((t) => /fij/i.test(t.n))).toBe(false); // nada de gastos fijos
});

test('add_reminder crea el recordatorio y CMDeadlines.collect lo ve', async ({ cmPage, consoleErrors }) => {
  const dt = await manana1030(cmPage);
  const r = await exec(cmPage, 'add_reminder', { title: 'Llamar al contador', datetime: dt, tab: 'finanzas', priority: 'high' });
  expect(r).toContain('Llamar al contador');
  const guardado = await cmPage.evaluate(() => S.reminders.finanzas.find((x) => x.title === 'Llamar al contador'));
  expect(guardado).toMatchObject({ datetime: dt, priority: 'high' });
  expect(guardado.id).toBeTruthy();
  const item = await cmPage.evaluate(() => CMDeadlines.collect(S).find((i) => i.kind === 'rec' && i.title === 'Llamar al contador'));
  expect(item).toBeTruthy();
  expect(item.tab).toBe('finanzas');
  expect(consoleErrors).toEqual([]);
});

test('add_reminder: tab y prioridad por defecto; deshacer con undo_last lo saca', async ({ cmPage }) => {
  const dt = await manana1030(cmPage);
  await exec(cmPage, 'add_reminder', { title: 'Tomar la pastilla', datetime: dt });
  const g = await cmPage.evaluate(() => S.reminders.vida.find((x) => x.title === 'Tomar la pastilla'));
  expect(g).toMatchObject({ priority: 'medium', datetime: dt });
  await exec(cmPage, 'undo_last', {});
  expect(await cmPage.evaluate(() => (S.reminders.vida || []).some((x) => x.title === 'Tomar la pastilla'))).toBe(false);
});

test('add_reminder valida: sin hora, fecha inexistente, fecha pasada y sin texto → error y no crea nada', async ({ cmPage }) => {
  const antes = await cmPage.evaluate(() => JSON.stringify(S.reminders));
  const dia = await cmPage.evaluate(() => getTomorrow());
  expect(await exec(cmPage, 'add_reminder', { title: 'X', datetime: dia })).toMatch(/^Error/);
  expect(await exec(cmPage, 'add_reminder', { title: 'X', datetime: '2027-02-31T10:00' })).toMatch(/^Error/);
  expect(await exec(cmPage, 'add_reminder', { title: 'X', datetime: '2020-01-01T10:00' })).toMatch(/^Error.*pasó/);
  expect(await exec(cmPage, 'add_reminder', { title: '  ', datetime: dia + 'T10:00' })).toMatch(/^Error/);
  expect(await cmPage.evaluate(() => JSON.stringify(S.reminders))).toBe(antes);
});

async function armarHabitos(page) {
  await page.evaluate(() => {
    S.habitTrackers = { vida: [], finanzas: [], salud: [], conocimiento: [], ia: [] };
    S.habitTrackers.vida.push({ id: 'h1', name: 'Lectura', emoji: '📚', days: {} });
    S.habitTrackers.vida.push({ id: 'h2', name: 'Lectura técnica', emoji: '💻', days: {} });
    S.habitTrackers.salud.push({ id: 'h3', name: 'Meditación', emoji: '🧘', days: { '2026-01-01': 'missed' } });
    saveState();
  });
}
const dia = (page, id, sec, fecha) => page.evaluate(([i, s, f]) => (S.habitTrackers[s].find((h) => h.id === i).days[f || getActiveDate()]) || null, [id, sec, fecha]);

test('mark_habit marca hoy como hecho (nombre aproximado, sin tildes) y el undo lo revierte', async ({ cmPage, consoleErrors }) => {
  await armarHabitos(cmPage);
  const r = await exec(cmPage, 'mark_habit', { name: 'meditacion' });
  expect(r).toContain('Meditación');
  expect(await dia(cmPage, 'h3', 'salud')).toBe('done');
  expect(await exec(cmPage, 'mark_habit', { name: 'Meditación' })).toContain('ya estaba');
  await exec(cmPage, 'undo_last', {});
  expect(await dia(cmPage, 'h3', 'salud')).toBeNull();
  expect(consoleErrors).toEqual([]);
});

test('mark_habit con fecha pasada marca ese día; fecha futura o mal escrita → error', async ({ cmPage }) => {
  await armarHabitos(cmPage);
  await exec(cmPage, 'mark_habit', { name: 'Meditación', fecha: '2026-01-01' });
  expect(await dia(cmPage, 'h3', 'salud', '2026-01-01')).toBe('done');   // pisó el "missed"
  const futura = await cmPage.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 3); return localStr(d); });
  expect(await exec(cmPage, 'mark_habit', { name: 'Meditación', fecha: futura })).toMatch(/^Error.*futuro/);
  expect(await exec(cmPage, 'mark_habit', { name: 'Meditación', fecha: '31/12/2026' })).toMatch(/^Error/);
  expect(await dia(cmPage, 'h3', 'salud', futura)).toBeNull();
});

test('mark_habit: nombre exacto gana sobre parcial; ambiguo → error con las opciones; inexistente → error con las opciones', async ({ cmPage }) => {
  await armarHabitos(cmPage);
  // "Lectura" es exacto aunque "Lectura técnica" lo contenga.
  await exec(cmPage, 'mark_habit', { name: 'lectura' });
  expect(await dia(cmPage, 'h1', 'vida')).toBe('done');
  expect(await dia(cmPage, 'h2', 'vida')).toBeNull();

  // "lect" coincide con los dos → no marca ninguno y lista las opciones.
  await cmPage.evaluate(() => { S.habitTrackers.vida.forEach((h) => { h.days = {}; }); });
  const amb = await exec(cmPage, 'mark_habit', { name: 'lect' });
  expect(amb).toMatch(/^Error/);
  expect(amb).toContain('"Lectura" (vida)');
  expect(amb).toContain('"Lectura técnica" (vida)');
  expect(await dia(cmPage, 'h1', 'vida')).toBeNull();
  expect(await dia(cmPage, 'h2', 'vida')).toBeNull();

  const no = await exec(cmPage, 'mark_habit', { name: 'zzz inexistente' });
  expect(no).toMatch(/^Error/);
  expect(no).toContain('"Meditación" (salud)');
  expect(no).toContain('"Lectura" (vida)');
});
