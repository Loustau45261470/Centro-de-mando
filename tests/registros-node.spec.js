// Registros (registros.js + deadlines.js): lógica pura sin navegador (ocurrencias, sin respuesta, aprendizajes parecidos, filtros, resumen)
// y envío de push-reminders.js con mocks. Datos de ejemplo inventados. 2026-11-24 es martes. Hora de Argentina (-03:00).
'use strict';
const { test, expect } = require('@playwright/test');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const D = require(path.join(ROOT, 'deadlines.js'));
const R = require(path.join(ROOT, 'registros.js'));
const P = require(path.join(ROOT, 'push-reminders.js'));
const TZ = '-03:00';
const BORRAR = { __borrar: true };
const clone = (x) => JSON.parse(JSON.stringify(x));
const ms = (fecha, hora) => Date.parse(fecha + 'T' + hora + ':00' + TZ);
const reg = (extra) => Object.assign({ id: 'r1', nombre: 'Chequeo', frecuencia: { tipo: 'cada', cada: 30, unidad: 'min' }, desde: '09:00', hasta: '12:00', dias: [0, 1, 2, 3, 4, 5, 6], inicio: '2026-11-01T00:00', pausado: false, pausadoDesde: '', preguntas: [] }, extra || {});
const estado = (regs, resp, extra) => Object.assign({ foco: { config: { horas: [] } }, registros: regs, registroRespuestas: resp || [] }, extra || {});

function avisosDelDia(state, fecha) {
  const seen = {}, orden = [];
  for (let m = 0; m < 24 * 60; m += 5) {
    const now = ms(fecha, String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
    D.dueAlerts(state, { now, tz: TZ, seen }).forEach((a) => { orden.push(a.key); seen[a.key] = true; });
  }
  return orden;
}

test.describe('registros: ocurrencias y avisos (deadlines.js)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('cada 30 min de 09 a 12: avisa 7 veces con clave id@fecha-hora y url del formulario', () => {
    const claves = avisosDelDia(estado([reg()]), '2026-11-24');
    expect(claves).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'].map((h) => `reg_r1@2026-11-24T${h}`));
    const due = D.dueAlerts(estado([reg()]), { now: ms('2026-11-24', '11:02'), tz: TZ, seen: {} });
    expect(due).toHaveLength(1);
    expect(due[0].url).toBe('#registro-r1@2026-11-24T11:00');
    expect(due[0].lead).toBe(false);
  });

  test('horas fijas, días de la semana y fecha de inicio', () => {
    const fijas = reg({ frecuencia: { tipo: 'horas', horas: ['15:00', '11:00', '11:00'] } });
    expect(avisosDelDia(estado([fijas]), '2026-11-24')).toEqual(['11:00', '15:00'].map((h) => `reg_r1@2026-11-24T${h}`));
    const lv = reg({ dias: [1, 2, 3, 4, 5] });
    expect(avisosDelDia(estado([lv]), '2026-11-28')).toEqual([]);                 // sábado
    expect(avisosDelDia(estado([lv]), '2026-11-27')).toHaveLength(7);             // viernes
    const nuevo = reg({ inicio: '2026-11-24T10:10' });                              // creado a las 10:10: lo anterior no existe
    expect(avisosDelDia(estado([nuevo]), '2026-11-24')).toEqual(['10:30', '11:00', '11:30', '12:00'].map((h) => `reg_r1@2026-11-24T${h}`));
  });

  test('mínimo 15 min, validación de horarios y de horas fijas', () => {
    expect(D.regFrecValidar(reg({ frecuencia: { tipo: 'cada', cada: 10, unidad: 'min' } }))).toMatch(/mínimo.*15/);
    expect(D.regFrecValidar(reg({ frecuencia: { tipo: 'cada', cada: 15, unidad: 'min' } }))).toBe('');
    expect(D.regFrecValidar(reg({ hasta: '08:00' }))).toMatch(/fin/);
    expect(D.regFrecValidar(reg({ frecuencia: { tipo: 'horas', horas: [] } }))).not.toBe('');
    expect(D.regFrecValidar(reg({ dias: [9] }))).not.toBe('');
    expect(R.rgValidarRegistro(reg({ nombre: ' ' }))).toMatch(/nombre/);
    expect(R.rgValidarRegistro(reg())).toMatch(/pregunta/);                         // no principal: necesita preguntas
    expect(R.rgValidarRegistro(reg({ preguntas: [{ id: 'p', texto: 'x', tipo: 'opciones', opciones: ['a'] }] }))).toMatch(/dos opciones/);
    expect(R.rgValidarRegistro(reg({ preguntas: [{ id: 'p', texto: 'x', tipo: 'escala', opciones: [] }] }))).toBe('');
    expect(R.rgValidarRegistro(Object.assign(reg(), { principal: true }))).toBe('');
  });

  test('si ya se respondió esa ocurrencia no avisa; la siguiente sí', () => {
    const st = estado([reg()], [{ id: 'x', registroId: 'r1', fecha: '2026-11-24', hora: '11:04', slot: '2026-11-24T11:00', actividad: 'a' }]);
    expect(D.dueAlerts(st, { now: ms('2026-11-24', '11:03'), tz: TZ, seen: {} })).toHaveLength(0);
    expect(D.dueAlerts(st, { now: ms('2026-11-24', '11:32'), tz: TZ, seen: {} }).map((a) => a.key)).toEqual(['reg_r1@2026-11-24T11:30']);
  });

  test('pausa: no avisa, y las ocurrencias desde la pausa no cuentan como sin respuesta', () => {
    const p = reg({ pausado: true, pausadoDesde: '2026-11-24T10:00' });
    expect(D.dueAlerts(estado([p]), { now: ms('2026-11-24', '11:02'), tz: TZ, seen: {} })).toHaveLength(0);
    expect(D.regSlotsDia(p, '2026-11-24')).toEqual(['09:00', '09:30']);
    expect(D.regOcurrencias(p, ms('2026-11-24', '09:40'), { tz: TZ })).toEqual({ actual: null, proxima: null });
  });

  test('el chequeo de Foco se apaga cuando existe el registro principal; sin él sigue igual', () => {
    const solo = { foco: { config: { horas: ['11:00'] } } };
    expect(D.dueAlerts(solo, { now: ms('2026-11-24', '11:02'), tz: TZ, seen: {} }).map((a) => a.key)).toEqual(['foco_2026-11-24_11:00']);
    const prin = R.rgPrincipalNuevo(['11:00'], '2026-11-01T00:00');
    const con = Object.assign({}, solo, { registros: [prin] });
    expect(D.dueAlerts(con, { now: ms('2026-11-24', '11:02'), tz: TZ, seen: {} }).map((a) => a.key)).toEqual(['reg_reg_principal@2026-11-24T11:00']);
    expect(prin.id).toBe('reg_principal');
    expect(prin.frecuencia).toEqual({ tipo: 'horas', horas: ['11:00'] });
    // Sin horas en Foco: nace en pausa (no avisa, respeta «sin avisos»).
    const vacio = R.rgPrincipalNuevo([], '2026-11-01T00:00');
    expect(vacio.pausado).toBe(true);
    expect(D.dueAlerts({ registros: [vacio] }, { now: ms('2026-11-24', '11:02'), tz: TZ, seen: {} })).toHaveLength(0);
  });

  test('no se cuela en Recordatorios ni en el ticker (sin tab) y no rompe un estado sin registros', () => {
    D.collect(estado([reg()]), { now: ms('2026-11-24', '11:02'), tz: TZ }).filter((i) => i.kind === 'registro').forEach((i) => expect(i.tab).toBeUndefined());
    expect(() => D.collect({}, { now: ms('2026-11-24', '11:02'), tz: TZ })).not.toThrow();
  });
});

test.describe('registros: historial, «sin respuesta», filtros y resumen (puro)', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });
  const resp = (o) => Object.assign({ id: 'a' + Math.random(), registroId: 'r1', fecha: '2026-11-24', hora: '09:03', slot: '2026-11-24T09:00', actividad: '', categoria: '', pensamiento: '', energia: null, valAct: 0, valPen: 0, extras: [] }, o);

  test('sin respuesta se calcula al leer: antes de la hora de gracia queda pendiente; lo futuro no figura', () => {
    const st = estado([reg()], [resp({ actividad: 'estudiaba' })]);
    const e = R.rgEntradas(st, '2026-11-24', '2026-11-24', '2026-11-24T10:20');
    const por = (t) => e.filter((x) => x.tipo === t).map((x) => x.hora);
    expect(por('respuesta')).toEqual(['09:00']);
    expect(por('sin_respuesta')).toEqual([]);                        // 09:30 pasó hace 50 min: todavía dentro de la hora de gracia
    expect(por('pendiente').sort()).toEqual(['09:30', '10:00']);
    expect(e.some((x) => x.hora === '10:30')).toBe(false);          // todavía no llegó
  });

  test('sin respuesta: 61 min de demora ya es sin respuesta; 31 min sigue pendiente', () => {
    const st = estado([reg()], []);
    const e = R.rgEntradas(st, '2026-11-24', '2026-11-24', '2026-11-24T10:31');
    expect(e.filter((x) => x.tipo === 'sin_respuesta').map((x) => x.hora).sort()).toEqual(['09:00', '09:30']);
    expect(e.filter((x) => x.tipo === 'pendiente').map((x) => x.hora).sort()).toEqual(['10:00', '10:30']);
    // nada se guardó: es solo lectura
    expect(st.registroRespuestas).toEqual([]);
  });

  test('los chequeos viejos de Foco aparecen en el historial y no se tocan', () => {
    const st = estado([], [], { foco: { chequeos: [{ fecha: '2026-11-20', hora: '15:05', categoria: 'estudio', energia: 4 }], config: { horas: [] } } });
    const e = R.rgEntradas(st, '2026-11-19', '2026-11-21', '');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ tipo: 'foco', categoria: 'estudio', energia: 4, hora: '15:05' });
    expect(st.foco.chequeos).toHaveLength(1);
  });

  test('filtros: valoración, actividad o pensamiento, categoría, texto; sin respuesta solo sin filtros de contenido', () => {
    const rs = [
      resp({ id: 'a', slot: '2026-11-24T09:00', actividad: 'Estudié contratos', categoria: 'estudio', pensamiento: 'ansiedad por el final', valAct: 1, valPen: -1, energia: 4 }),
      resp({ id: 'b', slot: '2026-11-24T09:30', actividad: 'Redes sociales', categoria: 'pantalla', pensamiento: 'nada', valAct: -1, valPen: 0, energia: 2 }),
      resp({ id: 'c', slot: '2026-11-24T10:00', actividad: 'Gym', categoria: 'gym', pensamiento: '', valAct: 1, valPen: 1, energia: 5 }),
    ];
    const todas = R.rgEntradas(estado([reg()], rs), '2026-11-24', '2026-11-24', '2026-11-24T12:30');
    const ids = (f) => R.rgFiltrar(todas, f).filter((x) => x.tipo === 'respuesta').map((x) => x.id).sort();
    expect(ids({})).toEqual(['a', 'b', 'c']);
    expect(ids({ val: 'down' })).toEqual(['a', 'b']);
    expect(ids({ val: 'down', sobre: 'actividad' })).toEqual(['b']);
    expect(ids({ val: 'down', sobre: 'pensamiento' })).toEqual(['a']);
    expect(ids({ val: 'up', sobre: 'actividad' })).toEqual(['a', 'c']);
    expect(ids({ sobre: 'pensamiento' })).toEqual(['a', 'b']);                       // c no tiene pensamiento
    expect(ids({ categoria: 'pantalla' })).toEqual(['b']);
    expect(ids({ texto: 'CONTRATOS' })).toEqual(['a']);                              // sin tildes ni mayúsculas
    expect(ids({ texto: 'ansiedad' })).toEqual(['a']);
    expect(R.rgFiltrar(todas, {}).some((x) => x.tipo === 'sin_respuesta')).toBe(true);
    expect(R.rgFiltrar(todas, { val: 'up' }).some((x) => x.tipo === 'sin_respuesta')).toBe(false);
    expect(R.rgFiltrar(todas, { registroId: 'otro' })).toHaveLength(0);
  });

  test('varias categorías: rgCats lee lista o categoria vieja; el filtro encuentra por cualquiera; el resumen cuenta menciones y suma 100', () => {
    expect(R.rgCats({ categoria: 'gym' })).toEqual(['gym']);
    expect(R.rgCats({ categorias: ['estudio', 'Lectura  libre', 'ESTUDIO'], categoria: 'estudio' })).toEqual(['estudio', 'Lectura libre']);
    expect(R.rgCats({ categorias: [], categoria: 'gym' })).toEqual(['gym']);
    expect(R.rgCats({})).toEqual([]);
    const rs = [
      resp({ id: 'a', slot: '2026-11-24T09:00', categoria: 'estudio', categorias: ['estudio', 'gym'] }),
      resp({ id: 'b', slot: '2026-11-24T09:30', categoria: 'Charla', categorias: ['Charla', 'estudio'] }),
      resp({ id: 'c', slot: '2026-11-24T10:00', categoria: 'gym' }),   // guardado viejo: solo categoria
    ];
    const ents = R.rgEntradas(estado([reg()], rs), '2026-11-24', '2026-11-24', '');
    const ids = (f) => R.rgFiltrar(ents, f).map((e) => e.id).sort();
    expect(ids({ categoria: 'estudio' })).toEqual(['a', 'b']);
    expect(ids({ categoria: 'gym' })).toEqual(['a', 'c']);
    expect(ids({ categoria: 'charla' })).toEqual(['b']);
    expect(ids({ texto: 'charla' })).toEqual(['b']);
    const res = R.rgResumen(ents);
    expect(res.nCategorias).toBe(3);
    expect(res.nMenciones).toBe(5);
    expect(res.categorias.map((c) => [c.id, c.n, c.pct])).toEqual([['estudio', 2, 40], ['gym', 2, 40], ['Charla', 1, 20]]);
    expect(res.categorias.reduce((s, c) => s + c.pct, 0)).toBe(100);
  });

  test('resumen: reparto por categoría, energía por momento del día y 👍/👎', () => {
    const rs = [
      resp({ id: 'a', slot: '2026-11-24T09:00', actividad: 'Estudié', categoria: 'estudio', valAct: 1, energia: 4 }),
      resp({ id: 'b', slot: '2026-11-24T09:30', actividad: 'Redes', categoria: 'pantalla', valAct: -1, pensamiento: 'ruido', valPen: -1, energia: 2 }),
      resp({ id: 'c', slot: '2026-11-24T15:00', actividad: 'Estudié', categoria: 'estudio', valAct: 1, energia: 3 }),
      resp({ id: 'd', slot: '2026-11-24T21:00', categoria: 'descanso', energia: 5 }),
    ];
    const res = R.rgResumen(R.rgEntradas(estado([reg()], rs), '2026-11-24', '2026-11-24', ''));
    expect(res.respuestas).toBe(4);
    expect(res.categorias.map((c) => [c.id, c.n, c.pct])).toEqual([['estudio', 2, 50], ['pantalla', 1, 25], ['descanso', 1, 25]]);
    expect(res.franjas.map((f) => [f.nombre, f.n, f.energia])).toEqual([['Mañana', 2, 3], ['Tarde', 1, 3], ['Noche', 1, 5]]);
    expect([res.upAct, res.downAct, res.upPen, res.downPen]).toEqual([2, 1, 0, 1]);
    expect(res.mal.map((x) => x.texto)).toEqual(['Redes', 'ruido']);
  });

  test('conteo de la semana para la revisión: 👍/👎 y aprendizajes nuevos', () => {
    const rs = [resp({ id: 'a', valAct: 1, valPen: -1 }), resp({ id: 'b', slot: '2026-11-25T09:00', fecha: '2026-11-25', valAct: -1 })];
    const st = estado([reg()], rs, { aprendizajes: [{ id: 'z', fecha: '2026-11-24', queHago: 'x' }, { id: 'y', fecha: '2026-10-01', queHago: 'y' }] });
    expect(R.rgConteoSemana(st, '2026-11-23', '2026-11-29')).toEqual({ respuestas: 2, up: 1, down: 2, aprendizajes: 1 });
  });

  test('migración: el principal toma las horas de Foco; lunes y fechas locales', () => {
    expect(R.rgLunes('2026-11-24')).toBe('2026-11-23');
    expect(R.rgSumarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(D.focoHoras({})).toEqual(['11:00', '15:00', '19:00']);
    expect(R.rgPrincipalNuevo(D.focoHoras({}), 'x').frecuencia.horas).toEqual(['11:00', '15:00', '19:00']);
  });
});

test.describe('registros: aprendizajes parecidos', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });
  const aps = [
    { id: 'a1', fecha: '2026-11-10', contexto: 'Scrolleando redes sociales en el celular', etiquetas: ['celular', 'procrastinar'], queHago: 'Dejar el celular en otro cuarto' },
    { id: 'a2', fecha: '2026-11-12', contexto: 'Discutí con un compañero', etiquetas: ['enojo'], queHago: 'Respirar antes de contestar' },
    { id: 'a3', fecha: '2026-11-13', contexto: 'Mirando series', etiquetas: ['pantalla'], queHago: '' },
  ];

  test('por etiqueta (sin importar mayúsculas, tildes ni #)', () => {
    expect(R.rgBuscarAprendizajes(aps, { etiquetas: '#Celular', texto: '' }).map((a) => a.id)).toEqual(['a1']);
    expect(R.rgBuscarAprendizajes(aps, { etiquetas: ['ENOJO', 'otra'], texto: '' }).map((a) => a.id)).toEqual(['a2']);
  });
  test('por palabras parecidas del texto, ordenado por cercanía', () => {
    expect(R.rgBuscarAprendizajes(aps, { etiquetas: '', texto: 'Estuve scrolleando redes sociales un buen rato' }).map((a) => a.id)).toEqual(['a1']);
    expect(R.rgBuscarAprendizajes(aps, { etiquetas: 'enojo', texto: 'redes sociales' }).map((a) => a.id)).toEqual(['a2', 'a1']);
  });
  test('sin coincidencia, sin «qué hago», o la propia respuesta: no sugiere', () => {
    expect(R.rgBuscarAprendizajes(aps, { etiquetas: 'cocina', texto: 'hice la cena' })).toEqual([]);
    expect(R.rgBuscarAprendizajes(aps, { etiquetas: 'pantalla', texto: 'series' })).toEqual([]);      // a3 no tiene «qué hago»
    expect(R.rgBuscarAprendizajes(aps, { etiquetas: 'celular', texto: '' }, ['a1'])).toEqual([]);
    expect(R.rgBuscarAprendizajes(aps, { etiquetas: '', texto: '' })).toEqual([]);
    expect(R.rgBuscarAprendizajes(null, { etiquetas: 'x', texto: 'y' })).toEqual([]);
  });
  test('etiquetas: se normalizan, no se repiten y son máximo 6', () => {
    expect(R.rgEtiquetas(' #Foco, foco ,  Celular  Móvil ,, ')).toEqual(['foco', 'celular movil']);
    expect(R.rgEtiquetas('a,b,c,d,e,f,g,h')).toHaveLength(6);
  });
});

// ── push-reminders.js con un Firestore y un web-push de mentira ──
function armar(docInicial) {
  const doc = clone(docInicial), sends = [];
  const aplicar = (upd) => Object.keys(upd).forEach((k) => {
    const p = k.split('.'); let o = doc;
    p.slice(0, -1).forEach((x) => { o = o[x] = o[x] || {}; });
    if (upd[k] === BORRAR) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = clone(upd[k]);
  });
  const ref = { get: async () => ({ data: () => clone(doc) }), update: async (upd) => aplicar(upd) };
  const db = { runTransaction: async (fn) => fn({ get: async () => ref.get(), update: (_r, upd) => aplicar(upd) }) };
  const webpush = { setVapidDetails: () => {}, sendNotification: async (sub, payload) => { const j = JSON.parse(payload); sends.push({ tag: j.tag, title: j.title, body: j.body, url: j.url, ri: j.requireInteraction }); return { statusCode: 201 }; } };
  return { doc, sends, correr: (now) => P.run({ ref, db, webpush, FieldValue: { delete: () => BORRAR }, now }) };
}

test.describe('push-reminders.js: registros', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'no usa navegador'); });

  test('manda cada ocurrencia con su url, una sola vez, y deja de mandar si ya se respondió o está en pausa', async () => {
    const base = (st) => ({ state: JSON.stringify(st), vapidKeys: { pubKey: 'pub', sigKey: 'sig' }, notifiedReminders: {},
      pushSubscriptions: { dA: { sub: { endpoint: 'https://push.A.invalido/x', keys: { p256dh: 'a', auth: 'b' } }, ua: 'iPhone', updatedAt: 1 } } });
    const t = armar(base(estado([reg({ nombre: 'Foco de la mañana', preguntas: [{ id: 'q', texto: 'x', tipo: 'texto', opciones: [] }] })])));
    await t.correr(ms('2026-11-24', '11:03'));
    expect(t.sends).toHaveLength(1);
    expect(t.sends[0]).toMatchObject({ tag: 'reg_r1@2026-11-24T11:00', title: '📝 Foco de la mañana', url: '#registro-r1@2026-11-24T11:00', ri: false });
    await t.correr(ms('2026-11-24', '11:08'));
    expect(t.sends).toHaveLength(1);                                                  // no repite
    await t.correr(ms('2026-11-24', '11:31'));
    expect(t.sends.map((s) => s.tag)).toEqual(['reg_r1@2026-11-24T11:00', 'reg_r1@2026-11-24T11:30']);
    // Ya respondida la de las 12:00 (desde otro dispositivo): no sale.
    t.doc.state = JSON.stringify(estado([reg()], [{ id: 'x', registroId: 'r1', fecha: '2026-11-24', hora: '11:55', slot: '2026-11-24T12:00', actividad: 'a' }]));
    await t.correr(ms('2026-11-24', '12:02'));
    expect(t.sends).toHaveLength(2);
    // En pausa: nada más.
    t.doc.state = JSON.stringify(estado([reg({ pausado: true, pausadoDesde: '2026-11-24T08:00' })]));
    await t.correr(ms('2026-11-25', '10:01'));
    expect(t.sends).toHaveLength(2);
  });

  test('el principal avisa «¿Qué estuviste haciendo?» a las horas de Foco y Foco deja de avisar aparte', async () => {
    const st = { foco: { config: { horas: ['11:00'] } }, registros: [R.rgPrincipalNuevo(['11:00'], '2026-11-01T00:00')] };
    const t = armar({ state: JSON.stringify(st), vapidKeys: { pubKey: 'pub', sigKey: 'sig' }, notifiedReminders: {},
      pushSubscriptions: { dA: { sub: { endpoint: 'https://push.A.invalido/x', keys: { p256dh: 'a', auth: 'b' } }, ua: 'iPhone', updatedAt: 1 } } });
    await t.correr(ms('2026-11-24', '11:02'));
    expect(t.sends).toHaveLength(1);
    expect(t.sends[0]).toMatchObject({ tag: 'reg_reg_principal@2026-11-24T11:00', title: '¿Qué estuviste haciendo?', url: '#registro-reg_principal@2026-11-24T11:00' });
  });
});
