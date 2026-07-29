# Spec: Presupuesto — meses futuros del año + selector de año

## Objective
Hoy el overlay de Presupuesto (finanzas.js) solo permite ver/editar el mes calendario actual y los meses pasados que ya tienen datos guardados en `S.budgets`. Tobías quiere poder preparar con anticipación el presupuesto de cualquier mes del año en curso (no solo el siguiente) desde el día 1 del mes actual, heredando automáticamente las modificaciones del último mes con datos, y poder saltar al año siguiente cuando se acerca el cambio de año.

## Requirements

### Must-Have
- [ ] El selector de mes del overlay de Presupuesto muestra los 12 meses del año seleccionado, no solo los meses que ya existen en `S.budgets` + el mes actual.
- [ ] Solo se precrean automáticamente los meses **futuros** del año en curso (desde el mes calendario real actual en adelante) que todavía no tengan entrada en `S.budgets`, copiando `fixed`/`reserved` del último mes con datos existente — mismo criterio que `ensureBudgetMonth()` hoy, aplicado en cascada mes a mes. Los meses **pasados** del año que nunca tuvieron presupuesto se listan en el selector pero NO se precrean ni se les inventa contenido — quedan sin presupuesto tal como están hoy.
- [ ] Cada mes precreado puede editarse de forma independiente (agregar/editar/borrar ítems `fixed`/`reserved`), igual que el mes actual hoy.
- [ ] Se agrega un selector de año junto al selector de mes. Opciones: año actual, año siguiente, y cualquier año anterior que ya tenga datos guardados en `S.budgets` (para no perder el acceso que ya existía a presupuestos viejos).
- [ ] Al elegir el año siguiente, se precrean sus 12 meses de la misma forma (cascada desde el último mes con datos, que en el caso normal será diciembre del año actual).
- [ ] Meses precreados nunca sobreescriben un mes que ya tenga datos guardados (idempotencia — mismo comportamiento que `ensureBudgetMonth` hoy: si `S.budgets[mk]` ya existe, no se toca).

### Nice-to-Have (not required to pass review)
- Indicador visual (etiqueta, ícono) que distinga un mes "futuro/en preparación" de uno ya transcurrido. (Tobías confirmó que NO lo necesita por ahora — se deja como posible mejora, no se implementa.)

### Out of Scope
- Precrear o completar meses de años pasados — solo se listan si ya tenían datos guardados, nunca se les agrega contenido nuevo.
- Cualquier lógica de cierre/consolidación de presupuesto al terminar un mes.
- Cambios al modelo de datos de `fixed`/`reserved` en sí (categorías, campos) — se reutiliza tal cual.

## Inputs & Outputs
- Estado: `S.budgets` (objeto per mes, key `'YYYY-MM'`, valor `{fixed: [], reserved: []}`) — sin cambios de forma, solo se le agregan más entradas.
- Salida: overlay renderiza el mes/año elegido igual que hoy (`renderBudget()`), usando los mismos componentes de fila fixed/reserved.

## Constraints
- Vanilla JS existente (`finanzas.js`), sin frameworks. Reutilizar `ensureBudgetMonth()`, `_curMonthKey()`, `_emptyBudget()`, `uid()`.
- Persistencia vía `saveState()` (localStorage + Firestore) — precrear 12 meses de una sola vez debe disparar un solo `saveState()`, no uno por mes, para no generar 12 writes/syncs seguidos.
- No hay función de "mes siguiente" reutilizable hoy — hay que derivarla con `Date` (rollover de año nativo de JS: `new Date(y, m, 1)` con `m` fuera de 0-11 ajusta año solo).

## Edge Cases
- Entrar al overlay por primera vez en un año sin ningún presupuesto previo (`S.budgets` vacío): solo los meses futuros (mes actual en adelante) se crean vacíos (`_emptyBudget()`); los meses pasados del año quedan sin entrada en `S.budgets` y se muestran en el selector sin datos precreados.
- Seleccionar un mes pasado del año que nunca tuvo presupuesto: el overlay lo muestra vacío/sin ítems, sin crear entrada en `S.budgets` ni disparar `saveState()` solo por mirarlo.
- El usuario ya editó manualmente un mes futuro (ej. octubre) y luego llega calendario real a octubre: no debe perder esas ediciones — `ensureBudgetMonth` ya es idempotente (`if (S.budgets[mk]) return false`), así que no hay reimport ni sobreescritura.
- Cambio real de año (31 dic → 1 ene): el año "actual" pasa a ser el que antes era "siguiente"; sus 12 meses ya existen (se precrearon al elegir "año siguiente" antes), no se recrean.
- Selector de año muestra año siguiente pero el usuario nunca lo abrió antes: al abrir el overlay con ese año seleccionado, se disparan las mismas precreaciones en cascada.

## Definition of Done
- [ ] Dado que estoy en agosto 2026 y abro el overlay de Presupuesto, cuando reviso el selector de mes, entonces veo las 12 opciones de 2026 (enero a diciembre), cada una con datos (heredados del último mes con datos existente, o vacíos si no hay ninguno).
- [ ] Dado que edito el presupuesto de septiembre 2026 sin haber llegado ese mes calendario todavía, cuando guardo el cambio, entonces la edición persiste en `S.budgets['2026-09']` y no se pierde ni se sobreescribe al llegar septiembre de verdad.
- [ ] Dado que cambio el selector de año a 2027, cuando lo selecciono, entonces veo las 12 opciones de mes de 2027, precreadas heredando de diciembre 2026 (o el último mes con datos disponible).
- [ ] Dado que abro el overlay 12 veces seguidas en el mismo año, entonces `saveState()`/sync a Firestore no se dispara 12 veces de más — la precreación en cascada de un año hace un solo guardado.
- [ ] El selector de año no precrea ni completa meses de años anteriores al actual, aunque los liste si ya tenían datos guardados.
