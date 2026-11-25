// Plan semanal de Entrenamiento (plan-entreno.js): lógica pura sin navegador. Datos inventados.
// 2026-11-23 es lunes, 2026-11-24 martes (semana ISO 2026-W48). Cada día es una LISTA de items (hasta 2 entrenos por día).
'use strict';
const { test, expect } = require('@playwright/test');
const path = require('path');
const P = require(path.join(__dirname, '..', 'plan-entreno.js'));

const R = id => ({ tipo: 'rutina', id });
const A = clave => ({ tipo: 'actividad', clave });
const ag = (dia, item, uid) => ({ op: 'agregar', dia, item, uid });
// descriptor corto de una lista: 'push', 'a:boxeo'
const d = lista => lista.map(i => (i.tipo === 'rutina' ? i.id : 'a:' + i.clave));
const dia = (p, fecha) => d(P.itemsDelDia(p, fecha));
const base = () => {   // lun [Empuje, Boxeo], mar [Tirón], mié [], jue [Piernas], vie [Empuje]
  let p = P.vacio();
  p = P.cambiarPermanente(p, ag(0, R('push'), 'u1'));
  p = P.cambiarPermanente(p, ag(0, A('boxeo'), 'u2'));
  p = P.cambiarPermanente(p, ag(1, R('pull'), 'u3'));
  p = P.cambiarPermanente(p, ag(3, R('legs'), 'u4'));
  p = P.cambiarPermanente(p, ag(4, R('push'), 'u5'));
  return p;
};
const ses = (rutinaId, date) => ({ rutinaId, date });

test.describe('catálogo y semana ISO', () => {
  test('actividades fijas con nombre visible y grupo', () => {
    expect(P.ACTIVIDADES.map(a => a.clave)).toEqual(['boxeo', 'jiujitsu', 'resistencia', 'fuerza', 'sprint', 'futbol', 'rugby']);
    const g = Object.fromEntries(P.ACTIVIDADES.map(a => [a.clave, a.grupo]));
    expect(g).toEqual({ boxeo: 'combate', jiujitsu: 'combate', resistencia: 'cardio', fuerza: 'fuerza', sprint: 'cardio', futbol: 'cardio', rugby: 'cardio' });
    expect(P.nombreActividad('jiujitsu')).toBe('Jiujitsu');
    expect(P.nombreActividad('futbol')).toBe('Fútbol');
    expect(P.nombreActividad('zzz')).toBeNull();
  });
  test('lunesDeSemana', () => {
    expect(P.lunesDeSemana('2026-W48')).toBe('2026-11-23');
    expect(P.lunesDeSemana('2026-W53')).toBe('2026-12-28');
    expect(P.lunesDeSemana('2027-W01')).toBe('2027-01-04');
    expect(P.lunesDeSemana('2026-W01')).toBe('2025-12-29');
  });
  test('bordes de año', () => {
    expect(P.semanaISO('2026-11-24')).toBe('2026-W48');
    expect(P.semanaISO('2026-12-31')).toBe('2026-W53');
    expect(P.semanaISO('2027-01-01')).toBe('2026-W53');
    expect(P.semanaISO('2027-01-03')).toBe('2026-W53');
    expect(P.semanaISO('2027-01-04')).toBe('2027-W01');
    expect(P.semanaISO('2024-12-30')).toBe('2025-W01');
    expect(P.semanaISO('2021-01-03')).toBe('2020-W53');
    expect(P.semanaISO('2025-12-29')).toBe('2026-W01');
  });
  test('lunes = 0, domingo = 6, fechaDeDia y sumarDias cruzan mes/año', () => {
    expect(P.diaDeSemana('2026-11-23')).toBe(0);
    expect(P.diaDeSemana('2026-11-29')).toBe(6);
    expect(P.fechaDeDia('2026-11-26', 0)).toBe('2026-11-23');
    expect(P.fechaDeDia('2026-11-26', 6)).toBe('2026-11-29');
    expect(P.sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(P.sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  test('día local: medianoche local cambia la fecha (no UTC)', () => {
    expect(P.fechaLocal(new Date(2026, 10, 24, 23, 59, 59))).toBe('2026-11-24');
    expect(P.fechaLocal(new Date(2026, 10, 25, 0, 0, 1))).toBe('2026-11-25');
  });
});

test.describe('plan fijo vs excepción (listas por día)', () => {
  test('dos entrenos el mismo día, en orden de alta; día vacío = descanso', () => {
    const p = base();
    expect(dia(p, '2026-11-23')).toEqual(['push', 'a:boxeo']);
    expect(dia(p, '2026-11-25')).toEqual([]);
    expect(P.rutinasDelDia(p, '2026-11-23')).toEqual(['push']);
    expect(P.itemsDelDia(p, '2026-11-23')[0]).toMatchObject({ uid: 'u1', tipo: 'rutina', id: 'push' });
  });
  test('solo esta semana: la excepción reemplaza la lista del día, la semana siguiente vuelve al fijo', () => {
    let p = P.cambiarSoloSemana(base(), '2026-W48', ag(0, R('legs'), 'x1'));
    expect(dia(p, '2026-11-23')).toEqual(['push', 'a:boxeo', 'legs']);   // la primera edición copia la lista fija
    p = P.cambiarSoloSemana(p, '2026-W48', { op: 'quitar', dia: 0, uid: 'u1' });
    expect(dia(p, '2026-11-23')).toEqual(['a:boxeo', 'legs']);
    expect(dia(p, '2026-11-30')).toEqual(['push', 'a:boxeo']);
    expect(P.itemsDelDia(p, '2026-11-23').length).toBe(2);
    expect(dia(p, '2026-11-24')).toEqual(['pull']);                     // otros días intactos
  });
  test('vaciar un día solo esa semana = descanso; la siguiente conserva el fijo', () => {
    const p = P.cambiarSoloSemana(base(), '2026-W48', { op: 'vaciar', dia: 0 });
    expect(dia(p, '2026-11-23')).toEqual([]);
    expect(dia(p, '2026-11-30')).toEqual(['push', 'a:boxeo']);
  });
  test('mover un item a otro día (permanente y solo semana)', () => {
    let p = P.cambiarPermanente(base(), { op: 'mover', uid: 'u4', de: 3, a: 2 });
    expect(dia(p, '2026-11-25')).toEqual(['legs']);
    expect(dia(p, '2026-11-26')).toEqual([]);
    expect(dia(p, '2026-12-02')).toEqual(['legs']);
    p = P.cambiarSoloSemana(p, '2026-W49', { op: 'mover', uid: 'u4', de: 2, a: 5 });
    expect(dia(p, '2026-12-02')).toEqual([]);
    expect(dia(p, '2026-12-05')).toEqual(['legs']);
    expect(dia(p, '2026-12-09')).toEqual(['legs']);                     // W50: fijo
    expect(dia(p, '2026-11-25')).toEqual(['legs']);                     // W48 intacta
  });
  test('cambio permanente rige en las semanas siguientes; alinea la excepción de la semana si existía', () => {
    let p = P.cambiarSoloSemana(base(), '2026-W48', ag(3, R('push'), 'x1'));   // jue W48: [legs, push]
    p = P.cambiarPermanente(p, { op: 'quitar', dia: 3, uid: 'u4' }, '2026-W48');
    expect(dia(p, '2026-11-26')).toEqual(['push']);
    expect(dia(p, '2026-12-03')).toEqual([]);
  });
  test('no muta el plan recibido y tolera estado vacío/undefined', () => {
    const p = base(); const copia = JSON.stringify(p);
    P.cambiarSoloSemana(p, '2026-W48', { op: 'vaciar', dia: 0 }); P.aplicarCorrida(p, '2026-11-24', []); P.limpiarRutinaBorrada(p, 'push');
    expect(JSON.stringify(p)).toBe(copia);
    expect(P.itemsDelDia(undefined, '2026-11-24')).toEqual([]);
    expect(P.pendienteDe(undefined, [], '2026-11-24')).toBeNull();
  });
  test('item inválido o acción inválida lanzan error', () => {
    expect(() => P.cambiarPermanente(P.vacio(), ag(0, { tipo: 'actividad' }))).toThrow();
    expect(() => P.cambiarPermanente(P.vacio(), { op: 'xx', dia: 0 })).toThrow();
  });
  test('agregar sin uid genera uids distintos', () => {
    let p = P.cambiarPermanente(P.vacio(), ag(0, R('a')));
    p = P.cambiarPermanente(p, ag(0, R('a')));
    const [x, y] = P.itemsDelDia(p, '2026-11-23');
    expect(x.uid).toBeTruthy(); expect(x.uid).not.toBe(y.uid);
  });
});

test.describe('pendiente (lista de ayer)', () => {
  test('ayer tenía rutina + actividad y no hay sesión → pendiente solo de rutina si no se inyecta hechas', () => {
    const pe = P.pendienteDe(base(), [], '2026-11-24');
    expect(pe.fecha).toBe('2026-11-23');
    expect(d(pe.items)).toEqual(['push']);                               // la actividad no se evalúa sin registro
  });
  test('con hechas(fecha) inyectado las actividades también pendientes o hechas', () => {
    expect(d(P.pendienteDe(base(), [], '2026-11-24', () => []).items)).toEqual(['push', 'a:boxeo']);
    expect(d(P.pendienteDe(base(), [], '2026-11-24', f => (f === '2026-11-23' ? ['boxeo'] : [])).items)).toEqual(['push']);
    expect(P.pendienteDe(base(), [ses('push', '2026-11-23')], '2026-11-24', () => new Set(['boxeo']))).toBeNull();
  });
  test('sesión de esa rutina ayer → sin pendiente (acepta lista y routineLog)', () => {
    expect(P.pendienteDe(base(), [ses('push', '2026-11-23')], '2026-11-24')).toBeNull();
    expect(P.pendienteDe(base(), { push: [{ id: 'x', date: '2026-11-23' }] }, '2026-11-24')).toBeNull();
    expect(P.pendienteDe(base(), [{ routineId: 'push', date: '2026-11-23' }], '2026-11-24')).toBeNull();
  });
  test('entrenó OTRA rutina ayer → la del plan queda pendiente; sesión de otro día no cuenta', () => {
    expect(d(P.pendienteDe(base(), [ses('legs', '2026-11-23')], '2026-11-24').items)).toEqual(['push']);
    expect(d(P.pendienteDe(base(), [ses('push', '2026-11-22'), ses('push', '2026-11-24')], '2026-11-24').items)).toEqual(['push']);
  });
  test('día con dos rutinas: se hizo una → queda solo la otra', () => {
    const p = P.cambiarPermanente(P.cambiarPermanente(P.vacio(), ag(1, R('pull'), 'a')), ag(1, R('legs'), 'b'));
    expect(d(P.pendienteDe(p, [ses('pull', '2026-11-24')], '2026-11-25').items)).toEqual(['legs']);
  });
  test('no entró varios días: solo se mira el día más reciente (ayer)', () => {
    expect(d(P.pendienteDe(base(), [], '2026-11-25').items)).toEqual(['pull']);
    expect(P.pendienteDe(base(), [], '2026-11-26')).toBeNull();
  });
  test('cruza semana (domingo a lunes)', () => {
    const p = P.cambiarPermanente(base(), ag(6, R('legs'), 'z'));
    expect(P.pendienteDe(p, [], '2026-11-30')).toMatchObject({ fecha: '2026-11-29' });
  });
  test('"seguir" la resuelve ese día y solo ese día', () => {
    const p = P.resolverSeguir(base(), '2026-11-24');
    expect(P.pendienteDe(p, [], '2026-11-24')).toBeNull();
    expect(d(P.pendienteDe(p, [], '2026-11-25').items)).toEqual(['pull']);
    expect(p.pendientes['2026-11-24']).toBe('seguir');
  });
  test('usa la excepción de la semana de ayer', () => {
    const p = P.cambiarSoloSemana(base(), '2026-W48', { op: 'vaciar', dia: 0 });
    expect(P.pendienteDe(p, [], '2026-11-24')).toBeNull();
  });
});

test.describe('rutina borrada', () => {
  test('sus items pasan a null (tombstone) en fijo y excepciones, claves conservadas, el resto intacto', () => {
    let p = P.cambiarSoloSemana(base(), '2026-W49', ag(2, R('push'), 'q'));
    expect(P.usaRutina(p, 'push')).toBe(true);
    p = P.limpiarRutinaBorrada(p, 'push');
    expect(P.usaRutina(p, 'push')).toBe(false);
    expect(p.fijo[0].u1).toBeNull();                                     // la clave sigue (null explícito)
    expect(p.semanas['2026-W49'][2].q).toBeNull();
    expect(dia(p, '2026-11-23')).toEqual(['a:boxeo']);                   // la actividad del día queda
    expect(dia(p, '2026-11-24')).toEqual(['pull']);
    expect(dia(p, '2026-11-27')).toEqual([]);
  });
});
