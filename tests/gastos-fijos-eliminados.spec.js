// Gastos fijos: función eliminada de la app (pedido explícito del usuario; nunca la usó).
// Estos tests prueban la AUSENCIA: ni modales, ni funciones, ni búsqueda, ni contexto de JARVIS, ni métrica de Informes,
// (la tarjeta de proyección del mes ya no existe). Al cargar el estado se borran las dos claves SOLO si están vacías.
// Los datos de ejemplo viven solo acá (si algún día alguien los tuviera cargados, quedan intactos pero ya no hacen nada).
'use strict';
const { test, expect } = require('./support/fixtures');

const FIJOS = [
  { id: 'fx1', name: 'Alquiler del depto', amount: 40000, currency: 'ARS', dayOfMonth: 20 },
  { id: 'fx2', name: 'Expensas', amount: 90000, currency: 'ARS', dayOfMonth: 5 },
];
const IDS_ELIMINADOS = ['modal-add-fixed-expense', 'modal-edit-fixed-expense', 'fexpName', 'fexpAmount', 'fexpCurrency', 'fexpDay',
  'editFexpId', 'editFexpName', 'editFexpAmount', 'editFexpCurrency', 'editFexpDay', 'fixedExpenseList', 'fixedExpenseEmpty', 'fixedExpenseTotal'];
const FUNCIONES_ELIMINADAS = ['renderFixedExpenses', 'addFixedExpense', 'deleteFixedExpense', 'markFixedExpensePaid',
  'openEditFixedExpense', 'saveEditFixedExpense', 'gmFixedPaidCount'];

async function irAFinanzas(page) {
  await page.click('.nav-btn[data-tab="finanzas"]');
  await expect(page.locator('#tab-finanzas')).toHaveClass(/active/);
}

test('1) no queda ningún modal, campo ni función de gastos fijos', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const r = await cmPage.evaluate(([ids, fns]) => ({
    ids: ids.filter((id) => document.getElementById(id)),
    fns: fns.filter((f) => typeof window[f] === 'function'),
    html: /fixed-expense|fexp|FixedExpense/i.test(document.documentElement.innerHTML),
    visible: /gastos? fijos?/i.test(document.body.innerText),
  }), [IDS_ELIMINADOS, FUNCIONES_ELIMINADAS]);
  expect(r).toEqual({ ids: [], fns: [], html: false, visible: false });
  expect(consoleErrors).toEqual([]);
});

test('1b) el modo juego calcula el XP de todas las habilidades sin llamar a funciones borradas', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const errores = await cmPage.evaluate(() => GM_SKILLS.filter((s) => s.xp).flatMap((s) => {
    // GM es null en el fixture (las habilidades de espíritu/vínculos lo leen): acá solo importa que no falte ninguna función
    try { s.xp(); return []; } catch (e) { return e instanceof ReferenceError ? [s.id + ': ' + e.message] : []; }
  }));
  expect(errores).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('2) el estado inicial no trae las claves y la búsqueda global ignora los datos viejos', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const r = await cmPage.evaluate((fijos) => {
    S.fixedExpenses = JSON.parse(JSON.stringify(fijos));
    CMBuscar.reindexar();
    return {
      alquiler: CMBuscar.buscar('Alquiler', 30), expensas: CMBuscar.buscar('Expensas', 30),
      tipos: CMBuscar.buscar('a', 300).map((x) => x.tipo),
      enDefault: Object.keys(JSON.parse(JSON.stringify(DEFAULT_STATE))).filter((k) => /fixedExpense/.test(k)),
    };
  }, FIJOS);
  expect(r.alquiler).toEqual([]);
  expect(r.expensas).toEqual([]);
  expect(r.tipos).not.toContain('gastoFijo');
  expect(r.enDefault).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

// (La tarjeta "Proyección del mes" y su módulo se eliminaron en la reorganización de Finanzas W-B; la prueba de su cálculo se retiró con ella.)

test('4) JARVIS no recibe gastos fijos en su contexto y Informes no ofrece la métrica', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const r = await cmPage.evaluate((fijos) => {
    S.fixedExpenses = JSON.parse(JSON.stringify(fijos));
    S.fixedExpenseLog = { [getActiveDate().slice(0, 7)]: { fx2: true } };
    const ctx = JARVIS_BRAIN.snapshot();
    return {
      jarvis: /GASTOS FIJOS|Alquiler del depto|Expensas/.test(ctx),
      jarvisVivo: ctx.indexOf('MOVIMIENTOS DEL MES') >= 0,
      metricas: CMInformesData.CATALOGO.filter((m) => /fijos|fixed/i.test(m.id + ' ' + m.label)).map((m) => m.id),
    };
  }, FIJOS);
  expect(r.jarvisVivo).toBe(true);   // el contexto sigue armándose entero
  expect(r.jarvis).toBe(false);
  expect(r.metricas).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('5) la migración borra las dos claves solo si están vacías y deja intactas las que tienen datos', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const r = await cmPage.evaluate((fijos) => {
    const out = {};
    S.fixedExpenses = []; S.fixedExpenseLog = {};
    out.vacias = _migrateFixedExpenses();
    out.vaciasQuedan = ['fixedExpenses', 'fixedExpenseLog'].filter((k) => k in S);
    S.fixedExpenses = JSON.parse(JSON.stringify(fijos)); S.fixedExpenseLog = { '2026-10': { fx2: true } };
    out.conDatos = _migrateFixedExpenses();
    out.datosQuedan = [JSON.stringify(S.fixedExpenses), JSON.stringify(S.fixedExpenseLog)];
    S.fixedExpenses = []; S.fixedExpenseLog = { '2026-10': { fx2: true } };   // mezcla: se borra solo la vacía
    out.mezcla = _migrateFixedExpenses();
    out.mezclaQuedan = ['fixedExpenses', 'fixedExpenseLog'].filter((k) => k in S);
    delete S.fixedExpenses; delete S.fixedExpenseLog;
    out.sinClaves = _migrateFixedExpenses();
    return out;
  }, FIJOS);
  expect(r.vacias).toBe(true);
  expect(r.vaciasQuedan).toEqual([]);
  expect(r.conDatos).toBe(false);
  expect(r.datosQuedan).toEqual([JSON.stringify(FIJOS), JSON.stringify({ '2026-10': { fx2: true } })]);
  expect(r.mezcla).toBe(true);
  expect(r.mezclaQuedan).toEqual(['fixedExpenseLog']);
  expect(r.sinClaves).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('6) la migración corre al aplicar el estado de la nube y deja la copia guardada sin las claves vacías', async ({ cmPage, consoleErrors }) => {
  await irAFinanzas(cmPage);
  const r = await cmPage.evaluate((fijos) => {
    const out = {};
    _applyRemoteState(JSON.stringify({ ...S, fixedExpenses: [], fixedExpenseLog: {} }), null);
    out.vacias = ['fixedExpenses', 'fixedExpenseLog'].filter((k) => k in S);
    out.guardadoVacias = ['fixedExpenses', 'fixedExpenseLog'].filter((k) => k in JSON.parse(localStorage.getItem('lifedash_v2')));
    _applyRemoteState(JSON.stringify({ ...S, fixedExpenses: fijos }), null);
    out.conDatos = JSON.stringify(S.fixedExpenses);
    return out;
  }, FIJOS);
  expect(r.vacias).toEqual([]);
  expect(r.guardadoVacias).toEqual([]);
  expect(r.conDatos).toBe(JSON.stringify(FIJOS));
  expect(consoleErrors).toEqual([]);
});
