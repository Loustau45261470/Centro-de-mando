'use strict';
const { test, expect } = require('./support/fixtures');
const R = require('../reportes.js');

test.describe('reportes.js (puro, Node)', () => {
  test('comparar: mejora, empeora, igual, anterior 0, menosEsMejor', () => {
    expect(R.repComparar(30, 20)).toEqual({ abs: 10, pct: 50, tono: 'verde' });
    expect(R.repComparar(20, 30)).toEqual({ abs: -10, pct: -33, tono: 'rojo' });
    expect(R.repComparar(30, 30)).toEqual({ abs: 0, pct: 0, tono: 'azul' });
    expect(R.repComparar(5, 0)).toEqual({ abs: 5, pct: null, tono: 'verde' });
    expect(R.repComparar(20, 30, { menosEsMejor: true }).tono).toBe('verde');
    expect(R.repComparar(30, 20, { menosEsMejor: true }).tono).toBe('rojo');
    expect(R.repComparar(3, 2).abs).toBe(1);
  });

  test('comparar: redondeo y valores no finitos', () => {
    expect(R.repComparar(10.000001, 10).tono).toBe('azul');
    expect(R.repComparar(undefined, 10)).toEqual({ abs: null, pct: null, tono: 'azul' });
    expect(R.repComparar(10, NaN)).toEqual({ abs: null, pct: null, tono: 'azul' });
  });

  test('parcial: el último día del período sigue en curso', () => {
    const r = R.repRango('mensual', '2026-11');
    expect(R.repParcial(r, '2026-11-30')).toBe(true);
    expect(R.repParcial(r, '2026-12-01')).toBe(false);
  });

  test('semana ISO en cambios de año', () => {
    expect(R.repClaveDe('semanal', '2026-01-01')).toBe('2026-W01');
    expect(R.repClaveDe('semanal', '2026-12-31')).toBe('2026-W53');
    expect(R.repClaveDe('semanal', '2027-01-03')).toBe('2026-W53');
    expect(R.repClaveDe('semanal', '2026-11-12')).toBe('2026-W46');
    expect(R.repRango('semanal', '2026-W01')).toEqual({ desde: '2025-12-29', hasta: '2026-01-04' });
    expect(R.repRango('semanal', '2026-W53')).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' });
    expect(R.repRango('semanal', '2026-W46')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
    expect(R.repAnterior('semanal', '2026-W01')).toBe('2025-W52');
    expect(R.repAnterior('semanal', '2027-W01')).toBe('2026-W53');
  });

  test('mensual, trimestral, semestral, anual y sus anteriores', () => {
    expect(R.repRango('mensual', '2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(R.repAnterior('mensual', '2026-01')).toBe('2025-12');
    expect(R.repRango('trimestral', '2026-T4')).toEqual({ desde: '2026-10-01', hasta: '2026-12-31' });
    expect(R.repAnterior('trimestral', '2026-T1')).toBe('2025-T4');
    expect(R.repAnterior('trimestral', '2026-T3')).toBe('2026-T2');
    expect(R.repRango('semestral', '2026-S2')).toEqual({ desde: '2026-07-01', hasta: '2026-12-31' });
    expect(R.repAnterior('semestral', '2026-S1')).toBe('2025-S2');
    expect(R.repRango('anual', '2026')).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(R.repAnterior('anual', '2026')).toBe('2025');
    expect(R.repClaveDe('trimestral', '2026-11-12')).toBe('2026-T4');
    expect(R.repClaveDe('semestral', '2026-06-30')).toBe('2026-S1');
    expect(R.repMeses(R.repRango('trimestral', '2026-T4'))).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(R.repMeses(R.repRango('semanal', '2026-W53'))).toEqual(['2026-12', '2027-01']);
  });

  test('período en curso: parcial y anterior recortado', () => {
    const r = R.repRango('mensual', '2026-11'), a = R.repRango('mensual', '2026-10');
    expect(R.repParcial(r, '2026-11-12')).toBe(true);
    expect(R.repParcial(a, '2026-11-12')).toBe(false);
    expect(R.repRangoComparable(r, a, '2026-11-12')).toEqual({ desde: '2026-10-01', hasta: '2026-10-12' });
    expect(R.repRangoComparable(a, R.repRango('mensual', '2026-09'), '2026-11-12')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    // febrero (28) como anterior de un marzo en curso: no pasa del fin de febrero
    expect(R.repRangoComparable(R.repRango('mensual', '2026-03'), R.repRango('mensual', '2026-02'), '2026-03-30').hasta).toBe('2026-02-28');
  });

  test('hábitos: partial aparte del conteo de done; sin registros = 0', () => {
    const tr = { Salud: [
      { id: 'h1', name: 'Gym', days: { '2026-11-02': 'done', '2026-11-03': 'partial', '2026-11-04': 'done', '2026-11-05': 'missed', '2026-10-31': 'done' } },
      { id: 'h2', name: 'Leer', days: {} },
    ] };
    const out = R.repHabitos(tr, { desde: '2026-11-01', hasta: '2026-11-30' });
    expect(out.find(h => h.id === 'h1')).toMatchObject({ done: 2, partial: 1 });
    expect(out.find(h => h.id === 'h2')).toMatchObject({ done: 0, partial: 0 });
  });

  test('objetivos por categoría: Familia 3 vs 2, sin fecha aparte', () => {
    const fam = (f, extra) => Object.assign({ key: 'k' + Math.random(), origen: 'propio', estado: 'cumplido', categoriaId: 'c-vida-familia', seccion: 'Vida', cumplidoEl: f, fecha: '' }, extra);
    const vista = [fam('2026-11-02'), fam('2026-11-05'), fam('2026-11-25'), fam('', { fecha: '2026-11-20' }), fam('2026-10-10'), fam('2026-10-11'),
      fam('', {}), fam('2026-11-03', { estado: 'pendiente' }),
      { key: 't1', origen: 'trimestral', estado: 'cumplido', categoriaId: 'c-x', seccion: 'Vida', cumplidoEl: '', fecha: '', periodoId: 't4-2026' }];
    const nov = R.repObjetivosPorCategoria(vista, R.repRango('mensual', '2026-11'));
    const oct = R.repObjetivosPorCategoria(vista, R.repRango('mensual', '2026-10'));
    expect(nov.porCategoria['c-vida-familia']).toBe(3);     // el plazo (fecha) no cuenta como cumplimiento
    expect(oct.porCategoria['c-vida-familia']).toBe(2);
    expect(R.repComparar(3, 2)).toMatchObject({ abs: 1, tono: 'verde' });   // spec: Familia 3 vs 2 → +1 verde
    expect(nov.sinFecha.map(o => o.key)).toContain('t1');   // trimestral sin fecha no cabe en un mes
    expect(nov.sinFecha.length).toBe(3);                    // los 2 propios sin cumplidoEl + el trimestral
    const t4 = R.repObjetivosPorCategoria(vista, R.repRango('trimestral', '2026-T4'));
    expect(t4.porCategoria['c-x']).toBe(1);                 // el trimestre completo sí lo contiene
  });
});

test.describe('fechas de cumplimiento (app)', () => {
  test('principios.guardarObjetivo guarda y borra cumplidoEl', async ({ cmPage }) => {
    const r = await cmPage.evaluate(() => {
      const val = (id, v) => { let e = document.getElementById(id); if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e); } e.value = v; };
      const d = _prData(); d.objetivos = [];
      const guardar = est => {
        val('pro-texto', 'Obj de prueba'); val('pro-hor', 'mensual'); val('pro-est', est); val('pro-fecha', '');
        val('pro-sec', 'Vida'); val('pro-cat', ''); val('pro-padre', '');
      };
      _prDraft = { origen: 'propio', nuevo: true, key: '', texto: '', horizonte: 'mensual', seccion: 'Vida', categoriaId: '', estado: 'pendiente', fecha: '', padreKey: '', principiosIds: [], habitosIds: [] };
      guardar('cumplido'); Principios.guardarObjetivo();
      const id = d.objetivos[0].id, hoy = _prHoyLocal();
      const a = d.objetivos[0].cumplidoEl;
      d.objetivos[0].cumplidoEl = '2020-01-02';   // fecha original: re-guardar no la pisa
      _prDraft = Object.assign({}, _prVista().find(x => x.key === id), { nuevo: false, principiosIds: [], habitosIds: [] });
      guardar('cumplido'); Principios.guardarObjetivo();
      const b = d.objetivos[0].cumplidoEl;
      _prDraft = Object.assign({}, _prVista().find(x => x.key === id), { nuevo: false, principiosIds: [], habitosIds: [] });
      guardar('pendiente'); Principios.guardarObjetivo();
      const c = d.objetivos[0].cumplidoEl;
      // cumplido previo a T1 (sin cumplidoEl): re-guardar no inventa la fecha de hoy
      delete d.objetivos[0].cumplidoEl; d.objetivos[0].estado = 'cumplido';
      _prDraft = Object.assign({}, _prVista().find(x => x.key === id), { nuevo: false, principiosIds: [], habitosIds: [] });
      guardar('cumplido'); Principios.guardarObjetivo();
      const e = d.objetivos[0].cumplidoEl;
      d.objetivos = [];
      return { hoy, a, b, c, e };
    });
    expect(r.a).toBe(r.hoy);
    expect(r.a).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.b).toBe('2020-01-02');
    expect(r.c).toBeUndefined();
    expect(r.e).toBeUndefined();
  });

  test('toggleQObj guarda y borra doneAt', async ({ cmPage }) => {
    const r = await cmPage.evaluate(() => {
      S.quarterlyObjectives = { activePeriod: 'tx', periods: [{ id: 'tx', label: 'TX', flat: false, note: null, objectives: [{ id: 'o1', text: 'x', category: 'Vida', done: false }] }] };
      const o = S.quarterlyObjectives.periods[0].objectives[0];
      toggleQObj('tx', 'o1'); const a = o.doneAt, hecho = o.done;
      toggleQObj('tx', 'o1');
      return { a, hecho, b: o.doneAt, hoy: _prHoyLocal(), enVista: null };
    });
    expect(r.hecho).toBe(true);
    expect(r.a).toBe(r.hoy);
    expect(r.b).toBeUndefined();
  });
});
