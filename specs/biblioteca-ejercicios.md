# Spec: Biblioteca de Ejercicios (módulo Entrenamientos)

## Objective
Agregar una **biblioteca de ejercicios** al módulo Entrenamientos del Centro de Mando: un catálogo compartido de ejercicios (con filtros por equipamiento y grupo muscular) desde el cual se arman las rutinas agregando ejercicios en vez de tipearlos a mano. Cada ejercicio de la biblioteca lleva su propio **historial global** (independiente de la rutina) con dos gráficos de progresión. Durante una sesión de entrenamiento, cada ejercicio suma un botón de **swap** (reemplazar por otro de la biblioteca, solo para esa sesión) y un botón de **historial**. Es una herramienta personal de Tobías, dentro de un producto ya en producción; el objetivo es reutilizar ejercicios entre rutinas y tener trazabilidad de progreso por ejercicio.

## Requirements

### Must-Have
- [ ] **Biblioteca de ejercicios** como catálogo compartido (`S.exerciseLibrary`), separado de las rutinas, persistido en el blob `lifedash_v2`.
- [ ] Cada ejercicio de la biblioteca guarda: `nombre`, `equipamiento` (enum), `grupoMuscular`, `descanso por defecto` (editable), `series por defecto` (editable), y su `historial`.
- [ ] **Filtros** en la vista de biblioteca: por equipamiento (máquina, polea/cable, mancuerna, barra, peso corporal) y por grupo muscular (pecho, espalda, bíceps, tríceps, hombros, piernas, core, etc.). Combinables.
- [ ] **Precarga (seed + migración):** migrar todos los ejercicios que hoy existen dentro de las rutinas de Tobías a la biblioteca (deduplicados), preservando su historial ya registrado; y sumar ejercicios similares precargados por Claude para completar los grupos musculares principales. Los campos vacíos quedan para que Tobías los complete después.
- [ ] **Alta de ejercicios propios:** Tobías puede crear ejercicios nuevos en la biblioteca en cualquier momento.
- [ ] **Armar rutina desde la biblioteca:** agregar un ejercicio a una rutina se hace eligiéndolo de la biblioteca (no tipeándolo). Al agregarlo, la rutina hereda `descanso` y `series` como valores por defecto tomados de la biblioteca.
- [ ] **Override por rutina:** el `descanso` y las `series` heredados son editables dentro de la rutina (modal tipo "TUNE") sin alterar el valor por defecto de la biblioteca ni el de otras rutinas.
- [ ] **Historial global por ejercicio:** el historial se indexa por el ID del ejercicio de la biblioteca, agregando las series logueadas en TODAS las rutinas y sesiones donde aparezca (incluyendo swaps). No está atado a una rutina.
- [ ] **Modal de historial** por ejercicio con: KPIs (sesiones, récord, últimos 30 días) y **dos gráficos** de progresión — (1) peso + reps y (2) volumen (peso × reps) — más la tabla de sesiones (fecha / series / reps / peso / progreso), al estilo del ejemplo visual.
- [ ] **Botón de swap durante la sesión:** en cada ejercicio de una sesión activa, un botón que abre la biblioteca y reemplaza ese ejercicio por otro. El swap afecta **solo a la sesión activa** (`activeRtnSession`), no modifica la rutina guardada.
- [ ] **Botón de historial durante la sesión:** en cada ejercicio de la sesión, acceso directo al modal de historial de ese ejercicio.
- [ ] Estética consistente con el módulo actual (dark, tipografía y componentes existentes), fiel a los ejemplos visuales entregados.

### Nice-to-Have (no requerido para aprobar review)
- Buscador por texto en la biblioteca además de los filtros.
- Reutilizar el heatmap muscular existente (`buildMuscleHeatmap`) para mostrar cobertura por grupo muscular en la biblioteca.
- Notas por ejercicio a nivel biblioteca.
- Indicador visual en la biblioteca de "en cuántas rutinas se usa" cada ejercicio.

### Out of Scope
- Tocar o migrar el sistema **legacy** de gimnasios/ejercicios sueltos (`S.exercises`, `S.workoutLog`, `addGym`, `renderExercises`) — queda intacto.
- Videos, imágenes o instrucciones de ejecución de cada ejercicio.
- Recomendación automática de ejercicios / generación de rutinas por IA.
- Compartir la biblioteca entre usuarios (es personal).
- Objetivo de peso ("target") sugerido automáticamente.

## Inputs & Outputs

**Entrada del usuario:**
- Alta/edición de ejercicios en la biblioteca: nombre, equipamiento, grupo muscular, descanso por defecto, series por defecto.
- Selección de filtros (equipamiento / grupo muscular).
- Agregar ejercicio de biblioteca a una rutina; ajustar descanso/series por rutina.
- Durante la sesión: swap de ejercicio, apertura de historial, carga de series (peso/reps) — flujo de sesión ya existente.

**Salida:**
- Vista de biblioteca filtrable.
- Rutinas compuestas por referencias a ejercicios de la biblioteca.
- Modal de historial con KPIs, dos gráficos y tabla.
- Datos persistidos en Firestore (`appdata/lifedash_v2`).

**Shape de datos propuesto** (los nombres exactos los ajusta `/build` respetando el estilo del código):

```js
// Catálogo compartido — NUEVO
S.exerciseLibrary = [
  { id, name, equipment, muscle, defaultRestSecs, defaultSets, notes }
]

// Ejercicio dentro de una rutina — referencia a la biblioteca + overrides
// (hoy es { id, name, equipment, restSecs, notes })
rtn.exercises = [
  { id /*instancia*/, libId, restSecs /*override*/, sets /*override*/ }
  // name/equipment/muscle se leen de la biblioteca vía libId
]

// Historial global por ejercicio — indexado por libId (NO por rutina)
// Reemplaza/complementa el índice actual routineLog[rtnId].exSets[exId]
S.exerciseHistory = {
  [libId]: [ { date, routineId, sets: [{ weight, reps }] } ]
}
```

## Constraints
- **Stack:** vanilla JS + Firebase, sin bundler. Toda la lógica y UI del módulo vive en `app.js`; markup de modales en `index.html`; estilos en `styles.css`. (Ref: sistema "Rutinas" en `app.js:1899-3203`.)
- **Persistencia:** todo el estado `S` se serializa entero al documento `appdata/lifedash_v2` vía `saveState()`/`_fbSave()` (debounce). No crear colecciones nuevas; agregar campos al blob.
- **Migración sin pérdida:** hoy el grupo muscular sale de un diccionario hardcodeado `_muscleMap` (`app.js:2091`) que solo cubre los seeds. La biblioteca mueve `muscle` al objeto ejercicio. La migración debe: (a) mapear los seeds vía `_muscleMap`, (b) preservar el historial ya registrado en `routineLog[rtnId].exSets[exId]` re-vinculándolo al `libId` correcto, (c) no romper datos viejos ni renombrar campos en uso mientras haya datos previos.
- **Gráficos:** Chart.js ya está cargado en el proyecto (usado para peso corporal, `weightChartInst` en `app.js:3218`). Asunción: usar Chart.js para los dos gráficos del historial, en dark, consistente con ese chart. (El historial actual usa un sparkline SVG a mano en `openExHist`, `app.js:2566` — se reemplaza por los dos charts nuevos.)
- **Reuso de UI:** modales sobre el patrón `modal-overlay` + `.modal` (ej. `modal-rtn-ex`, `index.html:820`); filtros sobre el patrón de pills de `setStatsPeriod()` (`app.js:2152`); apertura/cierre con `openModal()`/`closeModal()`.
- **Service worker:** cualquier cambio en `.js`/`.css` exige bumpear `const CACHE` en `sw.js`.
- **Deploy:** repo propio GitHub Pages; seguir las reglas de sync del `CLAUDE.md` del proyecto.

## Edge Cases
- **Swap de un ejercicio ya presente en la sesión (duplicado):** se permite; ambas instancias loguean al mismo `libId` y su historial global suma las series de las dos.
- **Series de A antes de un swap:** las series ya cargadas de A quedan registradas en el historial de A; B arranca vacío y loguea a su propio historial, aunque no estuviera en la rutina original.
- **Borrar un ejercicio de la biblioteca que está en uso o tiene historial:** no se borra en duro — se pide confirmación; si está en alguna rutina o tiene historial, se conserva el historial (opción de archivar/ocultar de la lista en vez de eliminar). Nunca perder historial por un borrado.
- **Ejercicio sin grupo muscular (los que carga Tobías o seeds no mapeados):** el grupo muscular es obligatorio al crear; los migrados sin mapeo caen en "Sin clasificar" y son editables después.
- **Filtro sin resultados / biblioteca vacía:** empty state claro ("no hay ejercicios con estos filtros" / "biblioteca vacía, agregá el primero").
- **Mismo ejercicio en varias rutinas:** el historial global agrega TODAS las sesiones de todas las rutinas para ese `libId`.
- **Editar el descanso/series por defecto en la biblioteca:** no altera retroactivamente los overrides ya guardados en rutinas existentes; solo afecta futuras incorporaciones.
- **Cancelar una sesión con swaps/series cargadas:** se descarta todo sin escribir historial (comportamiento actual de `cancelRtnSession`).

## Definition of Done
- [ ] Dado el módulo Entrenamientos, cuando abro la biblioteca, entonces veo el catálogo con los ejercicios migrados de mis rutinas + los precargados por Claude, filtrable por equipamiento y grupo muscular.
- [ ] Dada la biblioteca, cuando aplico un filtro de equipamiento y/o grupo muscular, entonces la lista muestra solo los ejercicios que coinciden, y un empty state si no hay ninguno.
- [ ] Dada una rutina, cuando agrego un ejercicio, entonces lo elijo desde la biblioteca y hereda su descanso y series por defecto, editables para esa rutina sin cambiar el default de la biblioteca.
- [ ] Dado un ejercicio en cualquier vista (biblioteca, rutina o sesión), cuando abro su historial, entonces veo KPIs, dos gráficos (peso+reps y peso×reps) y la tabla de sesiones, con datos agregados de todas las rutinas donde aparece.
- [ ] Dada una sesión activa, cuando toco swap en un ejercicio y elijo otro de la biblioteca, entonces el ejercicio se reemplaza solo en esa sesión, las series ya cargadas del original quedan en su historial, y el nuevo loguea al suyo — y al terminar la sesión la rutina guardada quedó sin cambios.
- [ ] Dada una sesión activa, cuando toco el botón de historial de un ejercicio, entonces se abre su modal de historial.
- [ ] Dado el historial ya registrado antes de esta feature, cuando se ejecuta la migración, entonces ninguna sesión ni serie previa se pierde y quedan re-vinculadas al ejercicio correcto de la biblioteca.
- [ ] Dado un cambio en `.js`/`.css`, cuando se despliega, entonces `const CACHE` en `sw.js` fue bumpeado.
- [ ] El sistema legacy de gimnasios sigue funcionando igual (sin regresión).
- [ ] Verificación real (correr la app / Playwright) del flujo completo: crear ejercicio → agregarlo a rutina → entrenar → swap → ver historial con ambos gráficos, con evidencia (screenshot/output).
