# Spec: Fondos de compra (gastos fijos acumulables con condición)

## Objective
Tobías quiere reservar plata todos los meses para compras futuras concretas (una musculosa de gym, un libro, un regalo para su novia) en vez de gastarla de golpe cuando aparece el deseo. Cada fondo es un **gasto fijo mensual** del presupuesto que se acredita en un "bote" acumulable, pero **solo si se cumple una condición** ligada a su propio comportamiento — el fondo de la musculosa se acredita solo si cumplió el hábito de gym ≥75% del mes; el del libro, si leyó ≥75% del mes. Los fondos no consumidos se acumulan mes a mes; cuando finalmente compra, el gasto se descuenta del bote y **no** vuelve a computar como gasto del mes (ya se computó mes a mes mientras se formaba el fondo). El resultado es un sistema de ahorro dirigido que convierte la disciplina en poder de compra, visible dentro de Finanzas del Centro de Mando.

## Requirements

### Must-Have

**Modelo de fondo**
- [ ] Se puede crear, editar y eliminar un **fondo**, con: nombre, emoji/icono opcional, monto mensual (ARS), cuenta asociada opcional, y una condición (opcional — puede ser "sin condición").
- [ ] Cada fondo tiene un **acumulado** ("bote") = suma de todas las acreditaciones mensuales menos la suma de todas las compras imputadas al fondo.
- [ ] Los fondos viven en una sección/tarjeta propia dentro de Finanzas, con la lista de fondos, su acumulado y el estado del mes en curso (condición cumplida / no cumplida / sin condición / ya acreditado).
- [ ] Existe una vista de **detalle de fondo** con: acumulado actual, historial de acreditaciones mes a mes (mes, monto, cumplió sí/no) e historial de compras (fecha, descripción, monto).

**Condiciones**
- [ ] Hay un **sector de configuración de condiciones** dentro del fondo (crear / editar / cambiar / quitar la condición), sin necesidad de tocar código.
- [ ] Tipo 1 — **Hábito**: se elige un hábito existente de `S.habitTrackers` (cualquiera de las secciones vida/finanzas/salud/conocimiento/ia) y un umbral porcentual configurable (default 75%). Se cumple si el porcentaje del mes ≥ umbral.
- [ ] Cálculo del porcentaje de hábito del mes: numerador = (días `done` × 1) + (días `partial` × 0,5); denominador = días del mes **excluyendo** los marcados `rest`. Porcentaje = numerador / denominador × 100. Si el denominador es 0, la condición se considera **no cumplida**.
- [ ] Tipo 2 — **Objetivo/logro**: se elige un objetivo mensual (`S.monthlyGoals`) o un objetivo trimestral (`S.quarterlyObjectives`). Se cumple si ese objetivo está `done`. Un fondo atado a un objetivo **mensual** acredita **solo en el mes de ese objetivo**, no en los meses siguientes.
- [ ] Tipo 3 — **Sin condición**: el fondo acredita todos los meses automáticamente.

**Acreditación mensual**
- [ ] La acreditación se evalúa y aplica el **último día del mes** (cierre de mes): si la condición se cumplió, se acredita el monto mensual al acumulado del fondo y se registra un **gasto fijo del mes** por ese monto.
- [ ] Si la condición **no** se cumplió, no se acredita nada y no se registra gasto: ese mes se pierde y el acumulado queda igual.
- [ ] Fondos atados a un **objetivo trimestral**: no acreditan en los meses intermedios; al cierre del trimestre (marzo, junio, septiembre, diciembre), si el objetivo está `done`, acreditan **monto × 3** de una vez (los 3 meses juntos) y registran ese monto como gasto de ese mes. Si no está `done`, no acreditan nada por ese trimestre.
- [ ] **Catch-up retroactivo:** al abrir/renderizar Finanzas, el sistema acredita todos los meses ya cerrados que quedaron pendientes de evaluar, evaluando la condición con los datos de cada uno de esos meses (no con los del mes actual). Un mes ya evaluado nunca se evalúa ni acredita dos veces.
- [ ] Desde el detalle del fondo se puede **forzar** la acreditación de un mes que quedó sin acreditar, y **anular** la acreditación de un mes ya acreditado; ambas acciones ajustan el acumulado y el gasto registrado de ese mes en consecuencia.
- [ ] El monto mensual de cada fondo **cuenta como gasto fijo del presupuesto** (aparece junto a los gastos fijos existentes y suma al total presupuestado), pero el gasto **efectivamente registrado** de un mes es 0 si la condición de ese mes no se cumplió.

**Compras contra el fondo**
- [ ] Se puede registrar una **compra del fondo** con fecha, descripción y monto; resta del acumulado y queda en el historial de compras del fondo.
- [ ] Una compra del fondo **no** computa como gasto del mes: no aparece en las estadísticas de gasto de Actividad ni en los totales de gasto de Finanzas, ni afecta el presupuesto del mes de la compra.
- [ ] Está **prohibido** gastar más que el acumulado disponible: si el monto supera el acumulado, la operación se bloquea con un aviso y no se guarda. No existe saldo negativo.
- [ ] Una compra registrada se puede **editar** (monto, fecha, descripción) y **borrar**; borrar devuelve el monto al acumulado, y editar el monto revalida el tope del acumulado.

### Nice-to-Have (not required to pass review)
- Meta de compra por fondo (precio objetivo) con barra de progreso "te faltan $X para la musculosa".
- Notificación/toast al cierre de mes avisando qué fondos acreditaron y cuáles no.
- Condiciones combinadas (dos hábitos a la vez) o por racha mínima.
- Transferir acumulado de un fondo a otro.

### Out of Scope
- Que la compra del fondo impacte el `balance` de una cuenta o el patrimonio en el momento de la compra (el impacto contable ya ocurrió mes a mes al acreditar).
- Saldo negativo, adelantos o "préstamos" entre fondos.
- Condiciones distintas de las tres definidas (hábito %, objetivo mensual/trimestral, sin condición).
- Fondos en moneda distinta de ARS.
- Acreditación parcial o proporcional al porcentaje logrado (es todo o nada contra el umbral).

## Inputs & Outputs

**Input — alta/edición de fondo (modal):** nombre (texto, obligatorio), emoji (opcional), monto mensual (número > 0, ARS), cuenta asociada (opcional), tipo de condición (`ninguna` | `habito` | `objetivo`), y según el tipo: hábito (sección + id) + umbral %, u objetivo (mensual con su `YYYY-MM`, o trimestral con su período + id de objetivo).

**Input — compra del fondo (modal):** fondo destino, fecha, descripción, monto (≤ acumulado).

**Estado persistido (nuevas claves en `S`, sincronizadas por Firestore como el resto):**
- `S.purchaseFunds`: array de fondos — `{ id, name, emoji, monthlyAmount, accountId, condition }`, donde `condition` es `null` | `{ type:'habito', section, habitId, threshold }` | `{ type:'objetivo', scope:'mensual'|'trimestral', periodKey, goalId }`.
- `S.purchaseFundLog`: por fondo y por mes, el resultado de la evaluación y lo acreditado — `{ [fundId]: { 'YYYY-MM': { credited: number, met: boolean, manual?: boolean } } }`. La presencia de la clave del mes es lo que marca "ya evaluado" (evita doble acreditación).
- `S.purchaseFundSpends`: compras imputadas — `{ id, fundId, date, desc, amount }`.

**Output visual:** tarjeta "Fondos" en Finanzas (lista con nombre, acumulado, estado del mes); detalle de fondo con acumulado, historial de acreditaciones y de compras; los montos mensuales de los fondos sumando al total de gastos fijos del presupuesto.

**Regla de cálculo:** `acumulado(fondo) = Σ credited de S.purchaseFundLog[fundId] − Σ amount de S.purchaseFundSpends con ese fundId`. Nunca menor a 0.

## Constraints
- Stack existente: HTML/CSS/JS vanilla sin bundler, scripts clásicos con scope global, Firestore para persistencia. No se agregan dependencias.
- El código va en `finanzas.js` (lógica y render), `index.html` (tarjeta + modales) y `styles.css` (estilos), siguiendo el patrón ya existente de gastos fijos (`S.fixedExpenses` / `S.fixedExpenseLog` / `renderFixedExpenses()`) y de aplicación automática por fecha (`autoDeductSubscriptions()`), en vez de crear un mecanismo paralelo.
- Lee (nunca escribe) `S.habitTrackers`, `S.monthlyGoals` y `S.quarterlyObjectives` para evaluar condiciones.
- Toda UI nueva usa las clases y tokens de tema existentes (`card`, `btn`, `empty-state`, variables de color), no estilos ad-hoc.
- Compatibilidad hacia atrás: si las claves nuevas no existen en el estado guardado, se inicializan vacías sin romper el arranque ni el merge de sync (`_applyRemoteState`).
- Al terminar: bumpear `const CACHE` en `sw.js` y el `?v=` de los archivos tocados en `index.html`.

## Edge Cases
- **La app no se abre el último día del mes:** al abrir Finanzas, el catch-up evalúa y acredita todos los meses cerrados sin registro en `purchaseFundLog`, usando los datos de cada mes.
- **Se crea un fondo hoy, a mitad de mes:** el primer mes evaluable es el mes en curso (se evalúa completo a su cierre); no se acreditan meses anteriores a la creación del fondo.
- **Se borra o renombra el hábito/objetivo al que apunta una condición:** el fondo queda marcado "condición rota" en la UI y **no acredita** hasta que se le reasigne una condición válida; no se acredita a ciegas.
- **Se edita el monto mensual del fondo:** afecta solo las acreditaciones futuras; los meses ya acreditados conservan el monto con el que se acreditaron.
- **Se elimina un fondo con acumulado > 0:** se pide confirmación explícita indicando el acumulado que se pierde; al confirmar, se borran fondo, su log y sus compras.
- **Compra por un monto mayor al acumulado:** se bloquea con aviso, no se guarda nada.
- **Compra que iguala exactamente el acumulado:** se permite; el acumulado queda en 0.
- **Borrar una compra de un mes ya cerrado:** el monto vuelve al acumulado (el acumulado no está particionado por mes).
- **Forzar la acreditación de un mes ya acreditado:** no duplica — la acción de forzar solo está disponible en meses sin acreditación registrada.
- **Anular una acreditación que dejaría el acumulado negativo** (porque ya se gastó esa plata): se bloquea con aviso; primero hay que borrar o ajustar las compras.
- **Condición de hábito en un mes donde todos los días están marcados `rest`:** denominador 0 → no cumple, no acredita.
- **Fondo con objetivo trimestral creado a mitad del trimestre:** acredita igual el ×3 al cierre si el objetivo está cumplido (el fondo se define contra el trimestre, no contra los meses transcurridos).
- **Dos dispositivos abren la app el mismo día tras un cierre de mes:** la clave `'YYYY-MM'` en `purchaseFundLog` hace la acreditación idempotente — el segundo dispositivo ve el mes ya evaluado y no vuelve a acreditar.

## Definition of Done
- [ ] Dado un fondo "Musculosa" de $20.000/mes con condición "hábito Entrenamientos ≥75%", cuando el mes cierra con 78% (contando `done`=1, `partial`=0,5, excluyendo `rest`), entonces el acumulado pasa de $0 a $20.000 y ese mes figura como gasto fijo de $20.000.
- [ ] Dado el mismo fondo, cuando el mes siguiente cierra con 60%, entonces el acumulado sigue en $20.000, el historial muestra ese mes como "no cumplido" y no se registró gasto por el fondo ese mes.
- [ ] Dados tres meses cumplidos, cuando abro el detalle del fondo, entonces el acumulado muestra $60.000 y el historial lista las tres acreditaciones con su mes y monto.
- [ ] Dado un acumulado de $60.000, cuando registro una compra de $45.000, entonces el acumulado queda en $15.000, la compra aparece en el historial del fondo, y los totales de gasto del mes en Actividad y Finanzas **no** cambian.
- [ ] Dado un acumulado de $15.000, cuando intento registrar una compra de $20.000, entonces la app lo bloquea con un aviso y el acumulado sigue en $15.000.
- [ ] Dado un fondo atado al objetivo trimestral "Terminar inversiones mínimo 4M" con $10.000/mes, cuando cierra un mes intermedio del trimestre, entonces no acredita nada; y cuando cierra el trimestre con el objetivo en `done`, entonces acredita $30.000 de una sola vez.
- [ ] Dado que no abro la app durante dos meses, cuando la abro y entro a Finanzas, entonces los dos meses cerrados quedan evaluados y acreditados (o no) según los datos de cada mes, sin duplicados si vuelvo a entrar.
- [ ] Dado un mes que quedó sin acreditar, cuando uso "forzar acreditación" desde el detalle, entonces el acumulado sube por ese monto y el mes queda marcado como acreditado manualmente; y cuando uso "anular" sobre un mes acreditado con acumulado suficiente, entonces el acumulado baja por ese monto.
- [ ] Dado un fondo "sin condición" de $5.000/mes, cuando cierra cualquier mes, entonces acredita siempre.
- [ ] Dado que borro el hábito al que apunta un fondo, cuando cierra el mes, entonces el fondo no acredita y la UI lo muestra como "condición rota".

---

# Addendum — Modo "devengo diario" (condición tipo 4)

**Fecha:** 2026-09-10 · **Motivo:** el modo todo-o-nada contra umbral (`≥75%`) castiga todo el mes por una mala racha y no da refuerzo hasta el cierre. Este modo paga por día cumplido y premia la repetición, para que el estímulo sea inmediato y visible.

## Alcance
Se **agrega** un cuarto tipo de condición. Los tres existentes (`ninguna`, `habito`, `objetivo`) no cambian en nada: mismo cálculo, misma UI, mismo log.

## Modelo

`condition = { type:'diario', section, habitId, perDay, milestones:[{days,bonus},…] }`

- `perDay`: ARS que suma cada día cumplido del hábito elegido.
- `milestones`: hitos de racha, default `[{days:7,bonus:0},{days:14,bonus:0},{days:30,bonus:0}]` (montos los pone el usuario; un hito con `bonus:0` o `days:0` se ignora).
- `monthlyAmount` **no se pide** en este modo: se deriva. El campo del modal se oculta y en su lugar se muestra el tope calculado.

## Cálculo del devengado de un mes — `pfDailyEarned(fund, mk, upToToday)`

Función **pura y derivada** de `habit.days`: se recalcula en cada render, nunca se lleva un contador incremental. Consecuencia buscada: marcar un día atrasado corrige el fondo solo, sin cron ni migración.

Recorriendo los días 1..N del mes (o hasta `getActiveDate()` si `upToToday`):
- `done` / `studied` → `+perDay`, la racha suma 1.
- `partial` → `+perDay/2`, la racha suma 1.
- `rest` → **no suma plata y no corta la racha** (descanso planificado ≠ fallar).
- cualquier otro estado (incl. sin marcar y `failed`) → la racha vuelve a 0.

**Racha continua entre meses:** el contador arranca con el arrastre de días consecutivos inmediatamente anteriores al día 1 del mes (mirando hacia atrás en `habit.days`, tope 400 días). El **bono se atribuye al mes en que se cruza el hito**.

**Cada hito se paga como máximo una vez por mes** (no es una fábrica de dinero cortando y recomenzando rachas).

**Tope de seguridad:** `earned = Math.min(earned, pfMonthlyCap(fund, mk))`, con
`pfMonthlyCap(fund, mk) = perDay × díasDelMes(mk) + Σ bonus de todos los milestones`.

## Presupuesto
`_pfBudgetTotal(mk)` / `_pfBudgetRows(mk)` usan `pfMonthlyCap(fund, mk)` para los fondos diarios (en vez de `monthlyAmount`). Es deliberadamente conservador: el presupuesto reserva el máximo teórico, y cumplir menos días significa haber gastado menos de lo presupuestado, nunca más.

## Acreditación y cierre de mes
- El mes en curso **no** acredita ni genera transacción: se muestra en vivo como "ganado este mes" pero **no es gastable** hasta el cierre. Se mantiene la invariante contable de que la compra del fondo no es gasto porque el gasto ya se registró al acreditar.
- Al cerrar el mes, `pfCatchUp()` acredita `pfDailyEarned(fund, mk, false)` como **una sola** transacción `Fondo: <nombre>` con fecha del último día del mes (nunca una por día). Si el devengado es 0, se registra `{credited:0, met:false}` sin transacción.
- `_pfAppliesToMonth` → `true` en todos los meses. `_pfIsQuarterly` → `false`.
- "Forzar" acredita el devengado real de ese mes (no un monto fijo); "Anular" funciona igual que hoy.
- Hábito borrado → `pfConditionBroken` = true → no acredita (igual que el tipo `habito`).

## UI — el estímulo inmediato (requisito central)
En la fila del fondo (`.fund-row`) y en el detalle, para fondos diarios:
- Barra de progreso del mes: `ganado / tope`, con el monto en ARS.
- Racha actual con 🔥 y su número de días.
- Próximo hito: "faltan N días para +$X" (o "todos los hitos del mes cobrados").
- El pill de estado muestra el monto ganado en vivo en lugar de "Cumpliendo/No cumple".
- Todo con clases y tokens existentes; barra accesible (`role="progressbar"` con `aria-valuenow/min/max` y `aria-label`).

## Definition of Done (addendum)
- [ ] Fondo diario de $700/día con hitos 7:+$1.500, 14:+$2.000, 30:+$4.000 sobre el hábito Entrenamientos. Con 12 días `done` de los cuales 8 son consecutivos → ganado = 12×700 + 1.500 = $9.900.
- [ ] Un día `partial` en esa serie suma $350 y **no** corta la racha.
- [ ] Un día `rest` en el medio de una racha de 5+3 la mantiene en 8, no la reinicia, y no suma plata.
- [ ] Racha que se corta en el día 9 y vuelve a llegar a 7 dentro del mismo mes → el hito de 7 **no** se paga dos veces.
- [ ] Días 28-31 de agosto cumplidos + días 1-3 de septiembre cumplidos → el hito de 7 días se paga en **septiembre**.
- [ ] Al cerrar el mes se crea **una** transacción por el total devengado, y el acumulado del fondo sube en ese monto.
- [ ] Marcar retroactivamente un día del mes en curso sube el ganado en vivo sin tocar nada más.
- [ ] El presupuesto del mes lista el fondo diario por su tope (`perDay × días + Σ bonos`), no por `monthlyAmount`.
- [ ] Los fondos con condición `ninguna` / `habito` / `objetivo` ya existentes siguen comportándose exactamente igual (sin migración de datos).
