# Spec: Gastos programados a mes futuro (Actividad — Finanzas)

## Objective
Hoy, todo movimiento cargado en "Actividad" (sección Finanzas) queda fechado al día actual y descuenta la cuenta asociada (impacta el patrimonio) en el mismo instante en que se carga. Esto no refleja casos reales donde Tobías incurre en un gasto ahora (ej. comprar stock) pero ese gasto "pertenece" contablemente al mes siguiente — típicamente porque el débito real (tarjeta, ciclo de facturación) ocurre recién el día 1 del mes próximo. Esta feature permite programar un gasto para un mes futuro: el gasto se computa y se muestra en ese mes, pero el impacto en el patrimonio (y en el inventario, si aplica) recién ocurre cuando llega la fecha programada, no al cargarlo.

**Revisión post-primera-entrega (2026-07-22):** la primera implementación resolvió esto con un selector "Mes destino" escondido dentro del modal "Nuevo movimiento". Probado en producción, no es descubrible ni es el modelo mental esperado — Tobías espera poder entrar directamente a la pestaña del mes siguiente en Actividad (como ya navega entre meses pasados) y cargar el gasto ahí, sin un dropdown adicional. Este documento reemplaza ese mecanismo de entrada por uno basado en pestañas; el resto de la lógica (pending, aplicación diferida, badge, catch-up) no cambia.

## Requirements

### Must-Have
- [ ] La fila de pestañas de mes en Actividad (hoy generada por `getAvailableMonths()`: mes actual + meses con movimientos) siempre incluye también el **mes siguiente al actual**, aunque todavía no tenga movimientos cargados.
- [ ] Al hacer clic en "+ Movimiento" **estando parado en la pestaña del mes siguiente**, el modal no pide elegir mes: el **mes destino queda determinado por la pestaña activa** (`txnActiveMonth`). El modal muestra un aviso (ej. "Se va a cargar en Agosto 2026 · quedará pendiente hasta esa fecha") para que quede claro qué está pasando, sin selector/dropdown adicional.
- [ ] Al hacer clic en "+ Movimiento" estando en la pestaña del mes actual, el comportamiento es exactamente el de hoy (sin aviso, sin `pending`, aplicación inmediata).
- [ ] Si el mes destino es futuro (viene de la pestaña activa) y el tipo es `expense`, la fecha del movimiento se fija automáticamente al **día 1** de ese mes (no hay selector de día) y queda `pending: true`.
- [ ] Un gasto programado a mes futuro **requiere cuenta asociada** (obligatorio) — es la cuenta que se debitará cuando se aplique. Si no hay cuenta seleccionada, el modal avisa y no guarda (mismo criterio que la validación de nombre vacío).
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
- Habilitar más de un mes futuro como pestaña (hoy: solo el mes siguiente).

### Out of Scope
- Ingresos programados a mes futuro: si se carga un `income` estando en la pestaña del mes siguiente, se guarda con fecha de ese mes pero se aplica de inmediato (sin `pending`, mismo criterio que ya regía para income) — no hay diferimiento para ingresos.
- Selector de día específico dentro del mes futuro (se fija siempre el día 1).
- Más de un mes futuro habilitado como pestaña (solo "mes actual + mes siguiente").
- Notificación/alerta al usuario cuando un gasto pendiente se aplica automáticamente (más allá del toast existente que ya dispara `addTransaction`/`autoDeductSubscriptions`).

## Inputs & Outputs
- **Input (Actividad):** la fila de pestañas de mes (`getAvailableMonths()`) siempre incluye mes actual + mes siguiente, además de cualquier mes con movimientos existentes. Sin selector nuevo en el modal "Nuevo movimiento": el mes destino es `txnActiveMonth` (la pestaña activa al momento de abrir el modal).
- **Input (modal "Nuevo movimiento" en pestaña futura):** solo un aviso de texto (no editable) indicando el mes destino y que quedará pendiente si el tipo es gasto.
- **Dato persistido en `S.transactions`:** cada transacción gana un campo `pending: true/false` (o equivalente) y su `date` ya refleja el mes/día programado (día 1 si es mes futuro). `pending` se limpia (pasa a `false`/se elimina) cuando el sistema aplica el impacto.
- **Output visual (Actividad):** en la pestaña del mes futuro, la fila del gasto pendiente muestra el mismo layout que un movimiento normal + badge "Pendiente"; el resumen de ingresos/gastos del mes y el total de patrimonio **no** reflejan gastos pendientes hasta que se aplican.

## Constraints
- Stack existente: HTML/CSS/JS vanilla, sin bundler, Firebase/Firestore para persistencia (`S.transactions` vive en el estado sincronizado). No se agregan dependencias nuevas.
- Reusar el patrón ya presente en `autoDeductSubscriptions()` (finanzas.js) para la aplicación automática por fecha, en vez de crear un mecanismo paralelo.
- El cambio toca `finanzas.js` (lógica: `getAvailableMonths()`, `renderActivity()`/pestañas, `addTransaction()`) e `index.html` (modal "Nuevo movimiento" — quitar el selector "Mes destino" agregado en la primera entrega, reemplazarlo por el aviso de texto) y posiblemente `styles.css` (badge "Pendiente", ya existe). Bumpear `CACHE` en `sw.js` al terminar.
- Compatibilidad hacia atrás: transacciones existentes sin campo `pending` deben tratarse como ya aplicadas (comportamiento actual, sin romper nada).
- El selector "Mes destino" del **modal de edición** (`modal-edit-txn`, agregado en la primera entrega) se mantiene sin cambios — ahí sí tiene sentido un dropdown, porque se está reprogramando un movimiento ya existente, no eligiendo dónde pararse para cargarlo.

## Edge Cases
- **La app no se abre exactamente el día 1 del mes programado:** el chequeo de aplicación debe disparar si `hoy >= fecha programada` (no exigir coincidencia exacta de día, a diferencia de `autoDeductSubscriptions` que sí exige día exacto) — así se recupera aunque el usuario no haya abierto la app ese día puntual.
- **Se borra la cuenta asociada mientras el gasto está pendiente:** al intentar aplicar, si la cuenta ya no existe, el gasto se aplica igual (pasa a no-pendiente) pero sin debitar ninguna cuenta — mismo comportamiento que un movimiento sin `accountId`.
- **Se edita un gasto pendiente y se le cambia el mes destino a uno anterior al actual (vía el dropdown del modal de edición):** se aplica en el próximo render como cualquier gasto vencido.
- **Dos o más gastos pendientes caen el mismo día 1:** se aplican todos en el mismo render, cada uno con su propio `snapshotNW()` (igual que hoy con múltiples suscripciones el mismo `billingDay`).
- **Un gasto pendiente con cantidad de inventario se borra antes de aplicarse:** no se suma stock (nunca llegó a aplicarse), comportamiento simétrico a borrar un gasto ya aplicado con stock (el stock ya sumado no se revierte automáticamente hoy — no se cambia ese comportamiento existente).
- **Se carga un `income` estando parado en la pestaña del mes siguiente:** se guarda con `date` = día 1 de ese mes pero se aplica de inmediato (impacta `balance` ahora, sin `pending`) — ver Out of Scope. El aviso de texto del modal solo menciona "quedará pendiente" cuando el tipo es gasto.
- **Pasa el mes y el "mes siguiente" avanza (ej. de Agosto a Septiembre) sin que el usuario haya cargado nada en Agosto:** la pestaña de mes siguiente se recalcula en cada render a partir de la fecha real del sistema (`getAvailableMonths()` ya se basa en `new Date()`), así que automáticamente pasa a ofrecer Septiembre; Agosto sigue visible como pestaña normal si ya tiene movimientos (aplicados o recién aplicados por catch-up), o desaparece si nunca tuvo ninguno.

## Definition of Done
- [ ] Dado que hoy es 2026-07-22, cuando entro a Actividad, entonces veo la pestaña "Ago 26" disponible aunque no tenga movimientos todavía; al pararme en ella y tocar "+ Movimiento" no hay ningún selector de mes en el modal, solo un aviso de que se cargará en Agosto 2026 y quedará pendiente.
- [ ] Dado lo anterior, cuando cargo un gasto de $50.000 con cuenta X estando en la pestaña "Ago 26", entonces el gasto aparece en esa pestaña con badge "Pendiente", y el `balance` de la cuenta X no cambia.
- [ ] Dado el gasto pendiente anterior, cuando el resumen de Actividad de Agosto se calcula, entonces el total de gastos del mes de Agosto SÍ incluye ese monto (se computa en el mes destino).
- [ ] Dado el gasto pendiente anterior, cuando reviso el patrimonio total (`calcNetWorth()`) el 21/07, entonces el monto pendiente NO está descontado.
- [ ] Dado el gasto pendiente anterior, cuando la fecha del sistema es 2026-08-01 (o posterior) y se renderiza Finanzas, entonces el `balance` de la cuenta X se descuenta automáticamente, `snapshotNW()` se dispara, el badge "Pendiente" desaparece, y si el gasto tenía cantidad de stock, el inventario se actualiza recién en ese momento.
- [ ] Dado un gasto pendiente, cuando lo edito (cambio monto o cuenta) antes de la fecha programada, entonces los cambios se guardan y el gasto sigue sin aplicar hasta su fecha.
- [ ] Dado un gasto pendiente, cuando lo borro antes de la fecha programada, entonces desaparece de Actividad sin haber afectado nunca ninguna cuenta ni inventario.
- [ ] Movimientos existentes (cargados antes de esta feature) se siguen viendo y comportando exactamente igual que hoy.
