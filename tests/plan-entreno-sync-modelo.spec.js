// Modelo 24/11 del plan (corridas en cadena, resetear, descansar semana, actividades hechas) entre dos dispositivos,
// con las funciones REALES de la página (_mergeStates, _rescueLocal, _fbDoSave + Firestore simulado y PlanEntreno).
// Sin ancestro (_rescueLocal) y con ancestro (_mergeStates). Todo es objeto {uid:...}; quitar = null, deshacer = hasta:fecha.
'use strict';
const { test, expect } = require('./support/fixtures');

const idle = page => page.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress, null, { timeout: 20000 });

// Autocontenida (Playwright la serializa a la página): plan base lun [Empuje], mar [Tirón], dom [Piernas].
function armarBase() {
  const P = PlanEntreno, clone = o => JSON.parse(JSON.stringify(o));
  const ag = (dia, item, uid) => ({ op: 'agregar', dia, item, uid });
  let p = P.vacio();
  p = P.cambiarPermanente(p, ag(0, { tipo: 'rutina', id: 'push' }, 'u1'));
  p = P.cambiarPermanente(p, ag(1, { tipo: 'rutina', id: 'pull' }, 'u3'));
  p = P.cambiarPermanente(p, ag(6, { tipo: 'rutina', id: 'legs' }, 'z'));
  const base = clone(S); base.planEntreno = p; base.actividadesHechas = {};
  return { P, clone, base };
}

test('corridas: la misma corrida desde dos dispositivos NO se duplica; corridas de días distintos se suman', async ({ cmPage }) => {
  const r = await cmPage.evaluate((src) => {
    const { P, clone, base } = eval('(' + src + ')')();
    const pc = clone(base), iph = clone(base), iph2 = clone(base);
    pc.planEntreno = P.aplicarCorrida(base.planEntreno, '2026-11-24', []);
    iph.planEntreno = P.aplicarCorrida(base.planEntreno, '2026-11-24', []);       // mismo día, otro dispositivo
    iph2.planEntreno = P.aplicarCorrida(base.planEntreno, '2026-11-25', []);      // otro día (ayer = martes: Tirón)
    const mismo = _mergeStates(base, iph, pc).planEntreno, distinto = _mergeStates(base, iph2, pc).planEntreno;
    const rescate = _rescueLocal(pc, iph2).planEntreno;
    return { n1: Object.keys(mismo.corridas).length, d1: P.desfase(mismo, '2026-11-30'), n2: Object.keys(distinto.corridas).length, d2: P.desfase(distinto, '2026-11-30'),
             nr: Object.keys(rescate.corridas).length, pend: distinto.pendientes };
  }, armarBase.toString());
  expect(r.n1).toBe(1); expect(r.d1).toBe(1);
  expect(r.n2).toBe(2); expect(r.d2).toBe(2);
  expect(r.nr).toBe(2);
  expect(r.pend).toEqual({ '2026-11-24': 'corrida', '2026-11-25': 'corrida' });
});

test('resetear en un dispositivo y edición del plan en otro: la anulación y el item nuevo sobreviven (con y sin ancestro)', async ({ cmPage }) => {
  const r = await cmPage.evaluate((src) => {
    const { P, clone, base } = eval('(' + src + ')')();
    const conCorrida = clone(base); conCorrida.planEntreno = P.aplicarCorrida(base.planEntreno, '2026-11-24', []);
    const pc = clone(conCorrida); pc.planEntreno = P.resetear(conCorrida.planEntreno, '2026-11-25');
    const iph = clone(conCorrida); iph.planEntreno = P.cambiarPermanente(conCorrida.planEntreno, { op: 'agregar', dia: 5, item: { tipo: 'actividad', clave: 'futbol' }, uid: 'f1' });
    const m = _mergeStates(conCorrida, iph, pc).planEntreno;
    const sin = _rescueLocal(pc, iph).planEntreno;
    return { corr: m.corridas, ds: P.desfase(m, '2026-12-01'), sab: P.itemsDelDia(m, '2026-11-28').map(i => i.uid), pend: m.pendientes, sab2: P.itemsDelDia(sin, '2026-11-28').map(i => i.uid) };
  }, armarBase.toString());
  expect(r.corr['c2026-11-24'].hasta).toBe('2026-11-25');
  expect(r.ds).toBe(0);
  expect(r.sab).toEqual(['f1']);
  expect(r.pend['2026-11-25']).toBe('reset');
  expect(r.sab2).toEqual(['f1']);
});

test('descansar semana en un dispositivo + item nuevo en otra semana en el otro: se conservan las dos cosas', async ({ cmPage }) => {
  const r = await cmPage.evaluate((src) => {
    const { P, clone, base } = eval('(' + src + ')')();
    const pc = clone(base); pc.planEntreno = P.descansarSemana(base.planEntreno, '2026-W48');
    const iph = clone(base); iph.planEntreno = P.cambiarSoloSemana(base.planEntreno, '2026-W49', { op: 'agregar', dia: 2, item: { tipo: 'actividad', clave: 'rugby' }, uid: 'r1' });
    const m = _mergeStates(base, iph, pc).planEntreno;
    return { w48: P.planDeSemana(m, '2026-W48').map(l => l.length), w49mie: P.itemsDelDia(m, '2026-12-02').map(i => i.uid), desc: m.semanas['2026-W48'].descanso };
  }, armarBase.toString());
  expect(r.w48).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(r.desc).toBe(true);
  expect(r.w49mie).toEqual(['r1']);
});

test('actividadesHechas: marcas y detalles de dos dispositivos se unen (con y sin ancestro); desmarcar no resucita con ancestro', async ({ cmPage }) => {
  const r = await cmPage.evaluate((src) => {
    const { P, clone, base } = eval('(' + src + ')')();
    const pc0 = P.marcarActividad({}, { fecha: '2026-11-23', clave: 'boxeo' });
    base.actividadesHechas = pc0.registro;                                               // ancestro: boxeo ya marcado
    const pc = clone(base), iph = clone(base);
    pc.actividadesHechas = P.marcarActividad(pc.actividadesHechas, { fecha: '2026-11-23', clave: 'sprint', franja: 'tarde' }).registro;
    iph.actividadesHechas = P.detalleActividad(iph.actividadesHechas, pc0.uid, { duracionMin: 60, intensidad: 7, proposito: 'técnica' });
    iph.actividadesHechas = P.marcarActividad(iph.actividadesHechas, { fecha: '2026-11-23', clave: 'fuerza' }).registro;
    const m = _mergeStates(base, iph, pc).actividadesHechas;
    const sin = _rescueLocal(pc, iph).actividadesHechas;
    const pc2 = clone(base); pc2.actividadesHechas = P.desmarcarActividad(base.actividadesHechas, pc0.uid);
    const iph2 = clone(base); iph2.actividadesHechas = P.marcarActividad(base.actividadesHechas, { fecha: '2026-11-24', clave: 'rugby' }).registro;
    const m2 = _mergeStates(base, iph2, pc2).actividadesHechas;
    return { hechas: [...P.hechasDe(m, '2026-11-23')].sort(), det: m[pc0.uid], sin: [...P.hechasDe(sin, '2026-11-23')].sort(), h2: [...P.hechasDe(m2, '2026-11-23')], h24: [...P.hechasDe(m2, '2026-11-24')] };
  }, armarBase.toString());
  expect(r.hechas).toEqual(['boxeo', 'fuerza', 'sprint']);
  expect(r.det).toMatchObject({ clave: 'boxeo', duracionMin: 60, intensidad: 7, proposito: 'técnica' });
  expect(r.sin).toEqual(['boxeo', 'fuerza', 'sprint']);
  expect(r.h2).toEqual([]);
  expect(r.h24).toEqual(['rugby']);
});

test('guardado real (_fbDoSave) con ancestro: corrida de la nube + actividad hecha y item locales terminan en la nube y en S', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async (src) => {
    const { P, clone, base } = eval('(' + src + ')')();
    const nubeSt = clone(base); nubeSt.planEntreno = P.aplicarCorrida(base.planEntreno, '2026-11-24', []);
    await _DOC().set({ state: JSON.stringify(nubeSt), _savedAt: 2000, _wid: 'pc', _dev: 'PC' });
    _lastSyncedSavedAt = 1000; _lastSyncedState = clone(base);
    S = clone(base);
    S.actividadesHechas = P.marcarActividad(S.actividadesHechas, { fecha: '2026-11-24', clave: 'jiujitsu', franja: 'noche' }).registro;
    S.planEntreno = P.cambiarPermanente(S.planEntreno, { op: 'agregar', dia: 3, item: { tipo: 'actividad', clave: 'sprint' }, uid: 's1' });
    await _fbDoSave();
    const nube = JSON.parse((await _DOC().get()).data().state);
    const resumen = st => ({ corr: Object.keys(st.planEntreno.corridas), jue: Object.keys(st.planEntreno.fijo[3] || {}), hechas: [...P.hechasDe(st.actividadesHechas, '2026-11-24')] });
    return { nube: resumen(nube), local: resumen(S) };
  }, armarBase.toString());
  for (const x of [r.nube, r.local]) { expect(x.corr).toEqual(['c2026-11-24']); expect(x.jue).toEqual(['s1']); expect(x.hechas).toEqual(['jiujitsu']); }
});
