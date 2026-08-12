# Spec: Categorías de gasto personalizables + reorganización por sección

## Objective
El módulo Finanzas (presupuesto, registro de gastos, historial) usa hoy 15 categorías de transacción hardcodeadas en `TXN_CATEGORIES` (`finanzas.js:334`), cada una con su propio color arbitrario. Esta feature agrega 4 categorías nuevas (Salud, Amigos, Libros, IA), recolorea todas las categorías agrupándolas por la sección temática del Centro de Mando a la que pertenecen (Vida, Salud, Conocimiento, Finanzas, IA — paleta ya definida en `styles.css:26-30`), y convierte el sistema de categorías de una constante fija en código a datos gestionables por el usuario: crear, editar (nombre/ícono/color/sección) y borrar categorías desde una pantalla dentro de Finanzas, sin pedir cambios de código.

## Requirements

### Must-Have
- [ ] Migrar `TXN_CATEGORIES` de constante hardcodeada a datos en el estado sincronizado (`S`), sembrados con las 15 categorías actuales + las 4 nuevas en el primer load.
- [ ] Agregar 4 categorías nuevas: **Salud** (sección Salud), **Amigos** (sección Vida), **Libros** (sección Conocimiento), **IA** (sección IA — gasto de suscripciones/herramientas de IA).
- [ ] Recolorear categorías existentes agrupándolas por sección:
  - Salud `#F43F5E`: Deporte/Gym, Alimentación Sana, Hidratación Limpia, Comida Chatarra, Salud (nueva)
  - Vida `#0FB9D6`: Novia, Mascota, Mamá, Papá, Amigos (nueva)
  - Conocimiento `#3B82F6`: Estudio, Libros (nueva)
  - Finanzas `#16B364`: Negocio, Productividad/Fijos, Ingreso, Inversión
  - IA `#8B5CF6`: IA (nueva)
  - Sin sección (quedan como están): Hogar/Insumos, Otro
- [ ] Pantalla "Gestionar categorías" dentro de Finanzas: lista todas las categorías agrupadas por sección, con su ícono y color.
- [ ] Desde esa pantalla: **crear** categoría nueva (nombre, ícono, color, sección — sección puede ser una de las 5 existentes o "sin sección").
- [ ] Desde esa pantalla: **editar** cualquier categoría (nombre, ícono, color, sección), incluidas las 19 predefinidas.
- [ ] Desde esa pantalla: **borrar** categoría (con confirmación).
- [ ] Los selectores de categoría en transacciones y presupuesto (`fillBudgetCatSelect`, dropdown de `txnCategory`, edición de transacción) leen del nuevo set dinámico, no de la constante vieja.
- [ ] El color/ícono de una categoría se resuelve por lookup (`getCatInfo`) en el momento de mostrarse — si se edita el color de una categoría, el historial y el gráfico de torta de transacciones pasadas con esa categoría también cambian (no se "congela" el color al momento de la carga).

### Nice-to-Have (not required to pass review)
- Atajo "+ Nueva categoría" inline desde el mismo dropdown de categoría al cargar una transacción, sin tener que ir a la pantalla de gestión.

### Out of Scope
- Crear secciones nuevas (más allá de las 5 existentes: Vida, Salud, Conocimiento, Finanzas, IA) o "sin sección".
- Reasignar automáticamente transacciones viejas al borrar una categoría (ver Edge Cases: no es retroactivo).
- Cambiar la paleta de colores de las pestañas generales del Centro de Mando (`--c-*` en `styles.css:26-30`) — esta feature solo las reutiliza como referencia para las categorías de gasto.

## Inputs & Outputs
- **Input:** formulario de categoría (nombre: texto libre; ícono: selector de emoji o input de texto; color: color picker; sección: dropdown con las 5 secciones + "sin sección").
- **Output:** categoría persistida en `S` (sincronizada por el mecanismo existente de `saveState`/`_fbSave`, igual que el resto de los datos de Finanzas — no se toca la lógica interna de sync). Se refleja de inmediato en selectores, historial, presupuesto y gráfico de torta.

## Constraints
- No modificar `_fbSave`, `_applyRemoteState` ni `loadState` (regla del proyecto) — solo agregar un nuevo campo al objeto `S` (mismo patrón que otras secciones de datos).
- Debe seguir funcionando en los temas gamemode alternativos (dorado/verde/naranja, `styles.css:2222-2327`) que redefinen las variables `--c-*` — como los colores de categoría van a ser datos propios (no las variables de tab), no se ven afectados por el cambio de tema, pero el color elegido debe seguir siendo legible sobre esos temas (chequeo visual, no automático).
- Mantener compatibilidad con el resto del código que hoy referencia `TXN_CATEGORIES`/`BUDGET_EXPENSE_CATS` como constantes (`finanzas.js:359` y sus usos) — pasan a derivarse del nuevo set dinámico sin romper las funciones que ya los consumen (`getCatInfo`, `fillBudgetCatSelect`, gráfico de historial, resumen por categoría).
- Bumpear `CACHE` en `sw.js` al terminar (regla del proyecto para cualquier cambio de `.js`).

## Edge Cases
- **Borrar una categoría con transacciones/presupuesto ya cargados:** no es retroactivo. Las transacciones y renglones de presupuesto existentes conservan la categoría tal cual (con su ícono/color al momento del borrado, vía fallback si ya no existe en el set activo). La categoría borrada deja de aparecer en los selectores para cargas nuevas.
- **Categoría sin ícono o color al crearla:** si el usuario deja el campo vacío, aplicar fallback (ícono 💸, color gris `rgba(255,255,255,.06)` — mismo fallback que ya usa `getCatInfo` hoy).
- **Nombre de categoría duplicado:** se permite (no hay validación de unicidad) — cada categoría tiene un id interno propio generado al crearla, el nombre es solo display.
- **Dos dispositivos editan categorías en simultáneo:** se resuelve igual que cualquier otro dato de `S` — último write gana vía el mecanismo de sync existente, sin lógica especial nueva.

## Definition of Done
- [ ] Given el usuario abre Finanzas, when entra al panel "Gestionar categorías", then ve las 19 categorías agrupadas por sección con su color e ícono actuales.
- [ ] Given el panel de gestión, when crea una categoría nueva con nombre + ícono + color + sección, then aparece de inmediato en los selectores de transacción y presupuesto.
- [ ] Given una categoría existente, when edita su ícono, color o sección, then el historial, el gráfico de torta y el resumen de presupuesto reflejan el cambio también para transacciones pasadas de esa categoría.
- [ ] Given una categoría con transacciones cargadas, when la borra, then deja de estar disponible para cargas nuevas pero las transacciones pasadas siguen mostrándose sin romper la UI.
- [ ] Given las categorías del grupo Salud (Deporte/Gym, Alimentación Sana, Hidratación Limpia, Comida Chatarra, Salud), then todas muestran `#F43F5E` salvo edición manual posterior del usuario.
- [ ] Given las categorías del grupo Vida (Novia, Mascota, Mamá, Papá, Amigos), then todas muestran `#0FB9D6`.
- [ ] Given las categorías del grupo Conocimiento (Estudio, Libros), then ambas muestran `#3B82F6`.
- [ ] Given las categorías del grupo Finanzas (Negocio, Productividad/Fijos, Ingreso, Inversión), then todas muestran `#16B364`.
- [ ] Given la categoría IA, then muestra `#8B5CF6`.
- [ ] Given dos dispositivos sincronizados, when se crea, edita o borra una categoría en uno, then el otro la refleja tras sync.
