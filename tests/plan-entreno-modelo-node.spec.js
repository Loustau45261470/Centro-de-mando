// Plan semanal (plan-entreno.js), decisiones del 24/11: corrida en cadena, resetear, descansar semana, franjas, actividades hechas.
// 2026-11-23 es lunes. Datos inventados. Lógica pura, sin navegador.
'use strict';
const { test, expect } = require('@playwright/test');
const path = require('path');
const P = require(path.join(__dirname, '..', 'plan-entreno.js'));

const R = id => ({ tipo: 'rutina', id });
const A = clave => ({ tipo: 'actividad', clave });
const ag = (dia, item, uid) => ({ op: 'agregar', dia, item, uid });
const d = lista => lista.map(i => (i.tipo === 'rutina' ? i.id : 'a:' + i.clave));
const dia = (p, fecha) => d(P.itemsDelDia(p, fecha));
const sem = (p, key) => P.planDeSemana(p, key).map(d);
const ses = (rutinaId, date) => ({ rutinaId, date });
const base = () => {   // lun [Empuje, Boxeo], mar [Tirón], jue [Piernas], vie [Empuje]
  let p = P.vacio();
  p = P.cambiarPermanente(p, ag(0, R('push'), 'u1'));
  p = P.cambiarPermanente(p, ag(0, A('boxeo'), 'u2'));
  p = P.cambiarPermanente(p, ag(1, R('pull'), 'u3'));
  p = P.cambiarPermanente(p, ag(3, R('legs'), 'u4'));
  p = P.cambiarPermanente(p, ag(4, R('push'), 'u5'));
  return p;
};
const cad = () => P.cambiarPermanente(base(), ag(6, R('legs'), 'z'));   // base + domingo [Piernas]

test.describe('corrida (desplazamiento en cadena)', () => {
  test('corrida el martes: todo se corre un día, en cadena, sin sumarse y cruzando de semana (domingo -> lunes siguiente)', () => {
    const p = P.aplicarCorrida(cad(), '2026-11-24', []);
    expect(dia(p, '2026-11-24')).toEqual(['push', 'a:boxeo']);   // martes: lo de ayer (NO se suma a lo de martes)
    expect(dia(p, '2026-11-25')).toEqual(['pull']);              // miércoles: lo de martes
    expect(dia(p, '2026-11-26')).toEqual([]);                    // jueves: lo de miércoles
    expect(dia(p, '2026-11-27')).toEqual(['legs']);              // viernes: lo de jueves
    expect(dia(p, '2026-11-28')).toEqual(['push']);              // sábado: lo de viernes
    expect(dia(p, '2026-11-29')).toEqual([]);                    // domingo: lo de sábado
    expect(dia(p, '2026-11-30')).toEqual(['legs']);              // lunes siguiente: lo del DOMINGO (no se pierde)
    expect(dia(p, '2026-12-01')).toEqual(['push', 'a:boxeo']);   // martes siguiente: lo del lunes siguiente
    expect(dia(p, '2026-12-02')).toEqual(['pull']);
    expect(P.desfase(p, '2026-11-24')).toBe(1);
    expect(P.desfase(p, '2026-11-20')).toBe(0);
    expect(p.pendientes['2026-11-24']).toBe('corrida');
    expect(P.pendienteDe(p, [], '2026-11-24')).toBeNull();
  });
  test('el fijo no cambia; la corrida es un objeto con uid determinístico por fecha', () => {
    const b = cad(); const p = P.aplicarCorrida(b, '2026-11-24', []);
    expect(p.fijo).toEqual(b.fijo);
    expect(p.corridas).toEqual({ 'c2026-11-24': { desde: '2026-11-24' } });
  });
  test('el pasado no se reescribe: itemsDelDia(ayer) y todo lo anterior queda igual tras la corrida', () => {
    const b = cad(); const p = P.aplicarCorrida(b, '2026-11-24', []);
    expect(dia(p, '2026-11-23')).toEqual(['push', 'a:boxeo']);
    expect(dia(p, '2026-11-23')).toEqual(dia(b, '2026-11-23'));
    expect(dia(p, '2026-11-22')).toEqual(dia(b, '2026-11-22'));
    expect(P.desfase(p, '2026-11-23')).toBe(0);
  });
  test('sin pendiente no cambia nada; repetir el mismo día no acumula', () => {
    const b = cad();
    expect(P.aplicarCorrida(b, '2026-11-26', []).corridas).toEqual({});
    expect(P.aplicarCorrida(b, '2026-11-24', [ses('push', '2026-11-23')]).corridas).toEqual({});
    const p = P.aplicarCorrida(b, '2026-11-24', []);
    expect(P.desfase(P.aplicarCorrida(p, '2026-11-24', []), '2026-11-30')).toBe(1);
  });
  test('segunda corrida otro día se encadena (desfase 2) y la pendiente se evalúa contra lo efectivo', () => {
    let p = P.aplicarCorrida(cad(), '2026-11-24', []);
    expect(d(P.pendienteDe(p, [], '2026-11-25').items)).toEqual(['push']);
    expect(P.pendienteDe(p, [ses('push', '2026-11-24')], '2026-11-25')).toBeNull();
    p = P.aplicarCorrida(p, '2026-11-25', []);
    expect(P.desfase(p, '2026-11-25')).toBe(2);
    expect(dia(p, '2026-11-25')).toEqual(['push', 'a:boxeo']);
    expect(dia(p, '2026-11-26')).toEqual(['pull']);
  });
  test('respeta las excepciones de semana (se leen del día de origen)', () => {
    const b = P.cambiarSoloSemana(cad(), '2026-W48', ag(3, R('pull'), 'x'));
    expect(dia(P.aplicarCorrida(b, '2026-11-24', []), '2026-11-27')).toEqual(['legs', 'pull']);
  });
  test('no muta el plan recibido', () => {
    const b = cad(); const copia = JSON.stringify(b);
    P.aplicarCorrida(b, '2026-11-24', []); P.resetear(b, '2026-11-24'); P.descansarSemana(b, '2026-W48');
    expect(JSON.stringify(b)).toBe(copia);
  });
});

test.describe('resetear no reescribe el pasado', () => {  test('resetear el jueves no cambia itemsDelDia de lunes a miércoles (corrida + excepción de semana)', () => {    let p = P.cambiarSoloSemana(cad(), '2026-W48', ag(2, A('sprint'), 'x'));    p = P.aplicarCorrida(p, '2026-11-24', []);    const antes = ['2026-11-23', '2026-11-24', '2026-11-25'].map(f => dia(p, f));    const r = P.resetear(p, '2026-11-26');    expect(['2026-11-23', '2026-11-24', '2026-11-25'].map(f => dia(r, f))).toEqual(antes);    expect(antes[1]).toEqual(['push', 'a:boxeo']);    expect(dia(r, '2026-11-26')).toEqual(['legs']);    expect(P.desfase(r, '2026-11-25')).toBe(1);    expect(P.desfase(r, '2026-11-26')).toBe(0);  });  test('semanas enteramente pasadas conservan su excepción; descanso pasado sigue vacío', () => {    let p = P.descansarSemana(cad(), '2026-W47');    p = P.resetear(p, '2026-11-26');    expect(P.planDeSemana(p, '2026-W47').map(l => l.length)).toEqual([0, 0, 0, 0, 0, 0, 0]);    expect(p.semanas['2026-W47'].hasta).toBeUndefined();  });});
test.describe('resetear', () => {
  test('anula corridas (claves conservadas), deja sin efecto excepciones de semana y resuelve la pendiente de hoy', () => {
    let p = P.cambiarSoloSemana(cad(), '2026-W48', { op: 'vaciar', dia: 3 });
    p = P.aplicarCorrida(p, '2026-11-24', []);
    p = P.resetear(p, '2026-11-25');
    expect(p.corridas['c2026-11-24']).toEqual({ desde: '2026-11-24', hasta: '2026-11-25' });
    expect(p.pendientes['2026-11-25']).toBe('reset');
    expect(P.desfase(p, '2026-12-05')).toBe(0);
    expect(sem(p, '2026-W48').slice(2)).toEqual(sem(cad(), '2026-W48').slice(2));   // desde el reset = plan fijo
    expect(dia(p, '2026-11-26')).toEqual(['legs']);
    expect(P.pendienteDe(p, [], '2026-11-25')).toBeNull();
  });
  test('editar de nuevo la semana tras resetear no resucita lo viejo', () => {
    let p = P.cambiarSoloSemana(cad(), '2026-W48', ag(3, R('pull'), 'x'));
    p = P.resetear(p, '2026-11-25');
    expect(dia(p, '2026-11-26')).toEqual(['legs']);
    p = P.cambiarSoloSemana(p, '2026-W48', ag(3, A('sprint'), 'y'));
    expect(dia(p, '2026-11-26')).toEqual(['legs', 'a:sprint']);
  });
  test('también anula "descansar semana"', () => {
    const p = P.resetear(P.descansarSemana(cad(), '2026-W48'), '2026-11-25');
    expect(sem(p, '2026-W48').slice(0, 2)).toEqual([[], []]);                          // lunes y martes siguen de descanso
    expect(sem(p, '2026-W48').slice(2)).toEqual(sem(cad(), '2026-W48').slice(2));
  });
});

test.describe('descansar esta semana', () => {
  test('7 días vacíos, sin pendientes; la semana siguiente vuelve al fijo con el desfase vigente', () => {
    let p = P.aplicarCorrida(cad(), '2026-11-24', []);
    p = P.descansarSemana(p, '2026-W48');
    expect(sem(p, '2026-W48')).toEqual([[], [], [], [], [], [], []]);
    expect(P.pendienteDe(p, [], '2026-11-25')).toBeNull();
    expect(sem(p, '2026-W49')[0]).toEqual([]);   // lo del domingo (de la semana descansada) no existe: la semana entera quedó vacía
    expect(sem(p, '2026-W49')[1]).toEqual(['push', 'a:boxeo']);
  });
  test('sin corridas la semana siguiente es el fijo; editar la semana descansada agrega solo ese item', () => {
    let p = P.descansarSemana(cad(), '2026-W48');
    expect(sem(p, '2026-W49')).toEqual(sem(cad(), '2026-W49'));
    p = P.cambiarSoloSemana(p, '2026-W48', ag(2, R('push'), 'n'));
    expect(sem(p, '2026-W48')).toEqual([[], [], ['push'], [], [], [], []]);
  });
});

test.describe('franja horaria', () => {
  test('default mañana; el día se ordena por franja y luego por orden de alta', () => {
    let p = P.vacio();
    p = P.cambiarPermanente(p, ag(0, { ...R('noche1'), franja: 'noche' }, 'a'));
    p = P.cambiarPermanente(p, ag(0, R('man1'), 'b'));
    p = P.cambiarPermanente(p, ag(0, { ...A('boxeo'), franja: 'tarde' }, 'c'));
    p = P.cambiarPermanente(p, ag(0, R('man2'), 'd'));
    expect(dia(p, '2026-11-23')).toEqual(['man1', 'man2', 'a:boxeo', 'noche1']);
    expect(P.itemsDelDia(p, '2026-11-23').map(i => i.franja)).toEqual(['manana', 'manana', 'tarde', 'noche']);
  });
  test('cambiar la franja de un item; franja inválida cae a mañana', () => {
    let p = P.cambiarPermanente(base(), { op: 'franja', dia: 0, uid: 'u1', franja: 'noche' });
    expect(dia(p, '2026-11-23')).toEqual(['a:boxeo', 'push']);
    p = P.cambiarPermanente(p, { op: 'franja', dia: 0, uid: 'u1', franja: 'zzz' });
    expect(dia(p, '2026-11-23')).toEqual(['push', 'a:boxeo']);
  });
});

test.describe('actividades hechas', () => {
  test('marcar con un toque, detalle opcional validado, hechasDe y desmarcar', () => {
    let { registro: r, uid } = P.marcarActividad({}, { fecha: '2026-11-23', clave: 'boxeo', franja: 'tarde' });
    expect(r[uid]).toEqual({ fecha: '2026-11-23', clave: 'boxeo', franja: 'tarde' });
    expect([...P.hechasDe(r, '2026-11-23')]).toEqual(['boxeo']);
    expect([...P.hechasDe(r, '2026-11-24')]).toEqual([]);
    expect(P.marcarActividad(r, { fecha: '2026-11-23', clave: 'boxeo', franja: 'tarde' }).uid).toBe(uid);
    r = P.detalleActividad(r, uid, { duracionMin: 75, intensidad: 8, concentracion: '6', proposito: '  técnica de pegada ' });
    expect(r[uid]).toMatchObject({ duracionMin: 75, intensidad: 8, concentracion: 6, proposito: 'técnica de pegada' });
    r = P.detalleActividad(r, uid, { intensidad: 11, concentracion: 0, duracionMin: -5, proposito: 7 });   // inválidos: se ignoran
    expect(r[uid]).toMatchObject({ duracionMin: 75, intensidad: 8, concentracion: 6 });
    r = P.detalleActividad(r, uid, { intensidad: null });
    expect(r[uid].intensidad).toBeNull();
    r = P.desmarcarActividad(r, uid);
    expect(r[uid]).toBeNull();
    expect(P.hechasDe(r, '2026-11-23').size).toBe(0);
    expect(() => P.marcarActividad({}, { fecha: '2026-11-23', clave: 'zzz' })).toThrow();
  });
  test('escala10 valida enteros 1-10', () => {
    expect([1, 10, 5, '7'].map(P.escala10)).toEqual([1, 10, 5, 7]);
    expect([0, 11, 5.5, 'x', null, undefined, ''].map(P.escala10)).toEqual([null, null, null, null, null, null, null]);
  });
  test('hechasDe alimenta pendienteDe: la actividad hecha ayer no queda pendiente', () => {
    const { registro } = P.marcarActividad({}, { fecha: '2026-11-23', clave: 'boxeo' });
    const h = f => P.hechasDe(registro, f);
    expect(d(P.pendienteDe(base(), [], '2026-11-24', h).items)).toEqual(['push']);
    expect(P.pendienteDe(base(), [ses('push', '2026-11-23')], '2026-11-24', h)).toBeNull();
  });
  test('no muta el registro recibido', () => {
    const r0 = {}; P.marcarActividad(r0, { fecha: '2026-11-23', clave: 'sprint' });
    expect(r0).toEqual({});
  });
});

test.describe('edición por borrador (UI Editar plan)', () => {
  const semKey = '2026-W48';
  test('planBaseDeSemana ignora corridas; accionesDeDiff detecta quitar, mover, agregar y franja', () => {
    const b = P.aplicarCorrida(cad(), '2026-11-24', []);
    const orig = P.planBaseDeSemana(b, semKey);
    expect(orig.map(d)).toEqual([['push', 'a:boxeo'], ['pull'], [], ['legs'], ['push'], [], ['legs']]);
    const draft = JSON.parse(JSON.stringify(orig));
    draft[0].splice(0, 1);                                                  // quita u1 del lunes
    const mov = draft[1].splice(0, 1)[0]; draft[2].push(mov);                // mueve u3 de martes a miércoles
    draft[3][0].franja = 'noche';                                            // cambia franja de u4
    draft[5].push(P.nuevoItem({ tipo: 'actividad', clave: 'sprint' }, 'tarde'));
    const ac = P.accionesDeDiff(orig, draft);
    expect(ac.map(a => a.op).sort()).toEqual(['agregar', 'franja', 'mover', 'quitar']);
    expect(ac.find(a => a.op === 'quitar')).toMatchObject({ dia: 0, uid: 'u1' });
    expect(ac.find(a => a.op === 'mover')).toMatchObject({ uid: 'u3', de: 1, a: 2 });
    expect(ac.find(a => a.op === 'agregar')).toMatchObject({ dia: 5, item: { tipo: 'actividad', clave: 'sprint', franja: 'tarde' } });
    expect(ac.find(a => a.op === 'franja')).toMatchObject({ dia: 3, uid: 'u4', franja: 'noche' });
    expect(P.accionesDeDiff(orig, JSON.parse(JSON.stringify(orig)))).toEqual([]);
  });
  test('aplicarAcciones: siempre toca el fijo, semana solo la excepción', () => {
    const orig = P.planBaseDeSemana(base(), semKey);
    const draft = JSON.parse(JSON.stringify(orig));
    draft[3].push(P.nuevoItem({ tipo: 'rutina', id: 'extra' }, 'noche'));
    const ac = P.accionesDeDiff(orig, draft);
    const sempre = P.aplicarAcciones(base(), 'siempre', semKey, ac), solo = P.aplicarAcciones(base(), 'semana', semKey, ac);
    expect(dia(sempre, '2026-12-03')).toEqual(['legs', 'extra']);           // semana siguiente: cambió el fijo
    expect(dia(solo, '2026-11-26')).toEqual(['legs', 'extra']);
    expect(dia(solo, '2026-12-03')).toEqual(['legs']);                      // la siguiente vuelve al fijo
    expect(Object.keys(solo.fijo[3])).toEqual(['u4']);
  });
});
