// Plan semanal de Entrenamiento (S.planEntreno): dos dispositivos editan el plan sin conexión y sincronizan → no se pierde ninguna edición.
// Cada día es un OBJETO {uid: item} (no un array sin id) para que el merge clave por clave de _merge3 no pierda un item agregado en otro dispositivo.
// Usa las funciones REALES de la página (_mergeStates, _rescueLocal y el guardado _fbDoSave con el Firestore simulado).
// Regla en conflicto sobre el MISMO dato primitivo: gana la nube (documentado en _merge3). Quitar un item = null en su uid (tombstone).
'use strict';
const { test, expect } = require('./support/fixtures');

const idle = page => page.waitForFunction(() => !_fbSaveTid && !_fbSaveInProgress, null, { timeout: 20000 });

test('el estado nuevo arranca con planEntreno vacío (DEFAULT_STATE), sin nulls pre-cargados', async ({ cmPage }) => {
  const p = await cmPage.evaluate(() => JSON.parse(JSON.stringify(S.planEntreno)));
  expect(p).toEqual({ fijo: {}, semanas: {}, corridas: {}, pendientes: {} });
  expect(await cmPage.evaluate(() => S.actividadesHechas)).toEqual({});
});

test('_mergeStates con ancestro: items agregados en el MISMO día desde dos dispositivos se conservan los dos; quitar y semanas distintas también', async ({ cmPage }) => {
  const r = await cmPage.evaluate(() => {
    const clone = o => JSON.parse(JSON.stringify(o));
    const R = (uid, id, o) => ({ uid, o: o || 0, tipo: 'rutina', id });
    const base = clone(S);
    base.planEntreno.fijo[0] = { u1: R('u1', 'push'), u2: { uid: 'u2', o: 1, tipo: 'actividad', clave: 'boxeo' } };
    base.planEntreno.fijo[3] = { u4: R('u4', 'legs') };
    const cloud = clone(base), local = clone(base);
    // PC: agrega Tirón al lunes (2.º entreno extra), semana 48 jueves vacío, pendiente del 24
    cloud.planEntreno.fijo[0].c1 = R('c1', 'pull', 2);
    cloud.planEntreno.semanas['2026-W48'] = { 3: { u4: null } };
    cloud.planEntreno.pendientes['2026-11-24'] = 'seguir';
    // iPhone (offline): agrega Sprint al MISMO lunes, quita Piernas del jueves fijo, semana 49 miércoles, otro pendiente
    local.planEntreno.fijo[0].l1 = { uid: 'l1', o: 2, tipo: 'actividad', clave: 'sprint' };
    local.planEntreno.fijo[3].u4 = null;
    local.planEntreno.semanas['2026-W49'] = { 2: { w1: R('w1', 'legs') } };
    local.planEntreno.pendientes['2026-11-25'] = 'corrida';
    const m = _mergeStates(base, local, cloud).planEntreno;
    // el mismo item editado distinto en ambos lados (mover de orden)
    const c2 = clone(base), l2 = clone(base);
    c2.planEntreno.fijo[0].u1.o = 5; l2.planEntreno.fijo[0].u1.o = 7;
    return { m, m2: _mergeStates(base, l2, c2).planEntreno };
  });
  expect(Object.keys(r.m.fijo[0]).sort()).toEqual(['c1', 'l1', 'u1', 'u2']);   // ninguna alta se perdió
  expect(r.m.fijo[0].c1.id).toBe('pull');
  expect(r.m.fijo[0].l1.clave).toBe('sprint');
  expect(r.m.fijo[3].u4).toBeNull();                                           // la baja local (nube no la tocó) se respeta
  expect(r.m.semanas['2026-W48']).toEqual({ 3: { u4: null } });
  expect(r.m.semanas['2026-W49']).toEqual({ 2: { w1: { uid: 'w1', o: 0, tipo: 'rutina', id: 'legs' } } });
  expect(r.m.pendientes).toEqual({ '2026-11-24': 'seguir', '2026-11-25': 'corrida' });
  expect(r.m2.fijo[0].u1.o).toBe(5);                                           // mismo dato primitivo en conflicto: gana la nube
});

test('_rescueLocal SIN ancestro: une las altas de ambos lados en el mismo día (la clave no está en _yaTratadas → _merge3 sin base)', async ({ cmPage }) => {
  const r = await cmPage.evaluate(() => {
    const clone = o => JSON.parse(JSON.stringify(o));
    const R = (uid, id) => ({ uid, o: 0, tipo: 'rutina', id });
    const cloud = clone(S), local = clone(S);
    cloud.planEntreno.fijo[0] = { c1: R('c1', 'pull') }; cloud.planEntreno.semanas['2026-W48'] = { 3: {} };
    local.planEntreno.fijo[0] = { l1: R('l1', 'push') }; local.planEntreno.fijo[4] = { l2: R('l2', 'legs') };
    local.planEntreno.semanas['2026-W49'] = { 2: { w1: R('w1', 'legs') } }; local.planEntreno.pendientes['2026-11-25'] = 'corrida';
    return _rescueLocal(cloud, local).planEntreno;
  });
  expect(Object.keys(r.fijo[0]).sort()).toEqual(['c1', 'l1']);
  expect(Object.keys(r.fijo[4])).toEqual(['l2']);
  expect(r.semanas['2026-W48']).toEqual({ 3: {} });
  expect(Object.keys(r.semanas['2026-W49'][2])).toEqual(['w1']);
  expect(r.pendientes).toEqual({ '2026-11-25': 'corrida' });
});

test('guardado real (_fbDoSave) con ancestro: la nube y S terminan con los items de los dos dispositivos', async ({ cmPage }) => {
  await idle(cmPage);
  const r = await cmPage.evaluate(async () => {
    const clone = o => JSON.parse(JSON.stringify(o));
    const R = (uid, id) => ({ uid, o: 0, tipo: 'rutina', id });
    const base = clone(S);
    base.planEntreno.fijo[0] = { u1: R('u1', 'push') };
    const nubeSt = clone(base);
    nubeSt.planEntreno.fijo[0].c1 = R('c1', 'pull');
    await _DOC().set({ state: JSON.stringify(nubeSt), _savedAt: 2000, _wid: 'pc', _dev: 'PC' });
    _lastSyncedSavedAt = 1000; _lastSyncedState = clone(base);
    S = clone(base);
    S.planEntreno.fijo[0].l1 = { uid: 'l1', o: 1, tipo: 'actividad', clave: 'boxeo' };
    S.planEntreno.fijo[4] = { l2: R('l2', 'legs') };
    await _fbDoSave();
    return { nube: JSON.parse((await _DOC().get()).data().state).planEntreno, local: clone(S.planEntreno) };
  });
  for (const pl of [r.nube, r.local]) {
    expect(Object.keys(pl.fijo[0]).sort()).toEqual(['c1', 'l1', 'u1']);
    expect(Object.keys(pl.fijo[4])).toEqual(['l2']);
  }
});

test('PlanEntreno de la página (script cargado) lee lo que dejó el merge', async ({ cmPage }) => {
  const r = await cmPage.evaluate(() => {
    let p = PlanEntreno.cambiarPermanente(PlanEntreno.vacio(), { op: 'agregar', dia: 0, item: { tipo: 'rutina', id: 'push' }, uid: 'a' });
    p = PlanEntreno.cambiarPermanente(p, { op: 'agregar', dia: 0, item: { tipo: 'actividad', clave: 'sprint' }, uid: 'b' });
    return PlanEntreno.itemsDelDia(p, '2026-11-23').map(i => i.uid);
  });
  expect(r).toEqual(['a', 'b']);
});
