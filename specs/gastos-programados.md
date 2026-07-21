# Spec: Gastos programados a mes futuro (Actividad — Finanzas)

## Objective
Hoy, todo movimiento cargado en "Actividad" (sección Finanzas) queda fechado al día actual y descuenta la cuenta asociada (impacta el patrimonio) en el mismo instante en que se carga. Esto no refleja casos reales donde Tobías incurre en un gasto ahora (ej. comprar stock) pero ese gasto "pertenece" contablemente al mes siguiente — típicamente porque el débito real (tarjeta, ciclo de facturación) ocurre recién el día 1 del mes próximo. Esta feature permite programar un gasto para un mes futuro: el gasto se computa y se muestra en ese mes, pero el impacto en el patrimonio (y en el inventario, si aplica) recién ocurre cuando llega la fecha programada, no al cargarlo.

## Requirements

### Must-Have
- [ ] Al cargar un nuevo gasto (modal "Nuevo movimiento"), se puede elegir un **mes destino**: el mes actual (comportamiento actual, sin cambios) o un mes futuro de una lista desplegable.
- [ ] Si se elige un mes futuro, la fecha del movimiento se fija automáticamente al **día 1** de ese mes (no hay selector de día).
- [ ] Un gasto programado a mes futuro **requiere cuenta asociada** (obligatorio, igual que se decide reforzar para este flujo) — es la cuenta que se debitará cuando se aplique.
- [ ] El gasto programado aparece de inmediato en la pestaña de Actividad del mes futuro correspondiente, con un **indicador visual "Pendiente"** que lo distingue de los movimientos ya aplicados.
- [ ] Mientras está "Pendiente", el monto del gasto **no** descuenta el `balance` de la cuenta asociada ni afecta `calcNetWorth()`/patrimonio.
- [ ] Si el gasto tiene cantidad de inventario asociada (flujo actual de `invApplyPurchase` para categorías con stock), el stock **no** se suma al inventario mientras está "Pendiente".
- [ ] Cuando la fecha del sistema alcanza el día programado (el día 1 del mes destino, o cualquier día posterior — ver Edge Cases), el sistema aplica automáticamente el gasto: descuenta el `balance` de la cuenta, dispara `snapshotNW()`, suma el stock a inventario si corresponde, y el gasto pasa a verse como un movimiento normal (sin badge "Pendiente").
- [ ] La aplicación automática se dispara al abrir/renderizar la sección Finanzas (mismo patrón que `autoDeductSubscriptions`), sin acción manual del usuario.
- [ ] Un gasto "Pendiente" se puede **editar** (monto, cuenta, categoría, mes destino, etc.) o **borrar**, igual que cualquier movimiento, sin restricciones especiales, siempre que siga pendiente.
- [ ] Editar o borrar un gasto ya **aplicado** (post fecha) sigue funcionando exactamente como hoy (reversa/reaplica el impacto en cuenta).

### Nice-to-Have (not required to pass review)
- Selector de fecha completo (día específico, no solo el 1) para casos donde el débito real no cae el día 1.
- Extender el mismo mecanismo a ingresos (`type: income`) programados, no solo gastos.

### Out of Scope
- Ingresos programados a mes futuro (queda para una iteración futura si se necesita).
- Selector de día específico dentro del mes futuro (se fija siempre el día 1).
- Notificación/alerta al usuario cuando un gasto pendiente se aplica automáticamente (más allá del toast existente que ya dispara `addTransaction`/`autoDeductSubscriptions`).

## Inputs & Outputs
- **Input (modal "Nuevo movimiento"):** se agrega un selector "Mes destino" con opciones: mes actual + próximos N meses (mismo criterio de generación que `getAvailableMonths()`/los chips de mes ya usados en Actividad). Default: mes actual (comportamiento sin cambios si no se toca el selector).
- **Dato persistido en `S.transactions`:** cada transacción gana un campo `pending: true/false` (o equivalente) y su `date` ya refleja el mes/día programado (día 1 si es mes futuro). `pending` se limpia (pasa a `false`/se elimina) cuando el sistema aplica el impacto.
- **Output visual (Actividad):** en la pestaña del mes futuro, la fila del gasto pendiente muestra el mismo layout que un movimiento normal + badge "Pendiente"; el resumen de ingresos/gastos del mes y el total de patrimonio **no** reflejan gastos pendientes hasta que se aplican.

## Constraints
- Stack existente: HTML/CSS/JS vanilla, sin bundler, Firebase/Firestore para persistencia (`S.transactions` vive en el estado sincronizado). No se agregan dependencias nuevas.
- Reusar el patrón ya presente en `autoDeductSubscriptions()` (finanzas.js) para la aplicación automática por fecha, en vez de crear un mecanismo paralelo.
- El cambio toca `finanzas.js` (lógica) e `index.html` (modal "Nuevo movimiento" — agregar selector de mes destino) y posiblemente `styles.css` (badge "Pendiente"). Bumpear `CACHE` en `sw.js` al terminar.
- Compatibilidad hacia atrás: transacciones existentes sin campo `pending` deben tratarse como ya aplicadas (comportamiento actual, sin romper nada).

## Edge Cases
- **La app no se abre exactamente el día 1 del mes programado:** el chequeo de aplicación debe disparar si `hoy >= fecha programada` (no exigir coincidencia exacta de día, a diferencia de `autoDeductSubscriptions` que sí exige día exacto) — así se recupera aunque el usuario no haya abierto la app ese día puntual.
- **Se borra la cuenta asociada mientras el gasto está pendiente:** al intentar aplicar, si la cuenta ya no existe, el gasto se aplica igual (pasa a no-pendiente) pero sin debitar ninguna cuenta — mismo comportamiento que un movimiento sin `accountId`.
- **Se edita un gasto pendiente y se le cambia el mes destino a uno anterior al actual:** no debería poder pasar porque el selector solo ofrece mes actual + futuros; si igualmente el mes queda en el pasado (por editar el mes activo del sistema), se aplica en el próximo render como cualquier gasto vencido.
- **Dos o más gastos pendientes caen el mismo día 1:** se aplican todos en el mismo render, cada uno con su propio `snapshotNW()` (igual que hoy con múltiples suscripciones el mismo `billingDay`).
- **Un gasto pendiente con cantidad de inventario se borra antes de aplicarse:** no se suma stock (nunca llegó a aplicarse), comportamiento simétrico a borrar un gasto ya aplicado con stock (el stock ya sumado no se revierte automáticamente hoy — no se cambia ese comportamiento existente).

## Definition of Done
- [ ] Dado que hoy es 2026-07-21, cuando cargo un gasto de $50.000 con mes destino "Agosto 2026" y cuenta X, entonces el gasto aparece en la pestaña "Ago 26" de Actividad con badge "Pendiente", y el `balance` de la cuenta X no cambia.
- [ ] Dado el gasto pendiente anterior, cuando el resumen de Actividad de Agosto se calcula, entonces el total de gastos del mes de Agosto SÍ incluye ese monto (se computa en el mes destino).
- [ ] Dado el gasto pendiente anterior, cuando reviso el patrimonio total (`calcNetWorth()`) el 21/07, entonces el monto pendiente NO está descontado.
- [ ] Dado el gasto pendiente anterior, cuando la fecha del sistema es 2026-08-01 (o posterior) y se renderiza Finanzas, entonces el `balance` de la cuenta X se descuenta automáticamente, `snapshotNW()` se dispara, el badge "Pendiente" desaparece, y si el gasto tenía cantidad de stock, el inventario se actualiza recién en ese momento.
- [ ] Dado un gasto pendiente, cuando lo edito (cambio monto o cuenta) antes de la fecha programada, entonces los cambios se guardan y el gasto sigue sin aplicar hasta su fecha.
- [ ] Dado un gasto pendiente, cuando lo borro antes de la fecha programada, entonces desaparece de Actividad sin haber afectado nunca ninguna cuenta ni inventario.
- [ ] Movimientos existentes (cargados antes de esta feature) se siguen viendo y comportando exactamente igual que hoy.
