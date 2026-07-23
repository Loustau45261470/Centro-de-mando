# Spec: Calendario semanal + rediseño del overlay de Planificación

## Aclaración de alcance (post-interview, tras descubrir `planificacion-overlay.js`)
El overlay real (`ov-planner`) ya existía con pestañas fijas **Hoy/Mañana**, reutilizando `buildPlannerSlide()` (app.js) tanto ahí como en la card standalone `#dayPlannerCard` (pestaña Vida, con su propio swiper Hoy/Mañana + dots). Alcance confirmado:
- El overlay pasa de Hoy/Mañana a **Día/Semana**. La pestaña **Día muestra solo el día de hoy** (sin swiper, sin navegación a otras fechas — para eso está Semana, que sí cubre mañana y el resto).
- La card standalone `#dayPlannerCard` (fuera del overlay) **también se actualiza** al estilo calendario con bloques por área — reutiliza el mismo renderer nuevo. Mantiene su swiper Hoy/Mañana actual (eso no cambia, solo el estilo del contenido de cada slide).
- `buildPlannerSlide()` se reemplaza/extiende para pintar bloques de calendario en vez de lista de tareas por hora, y la sigue usando tanto la card standalone (hoy/mañana) como la pestaña Día del overlay (solo hoy).

## Objective
El overlay "Planificación del día" de Centro de Mando se renombra a **"Planificación"** y pasa a tener dos pestañas: **Día** y **Semana**, ambas leyendo y escribiendo el mismo modelo de datos (`S.dayPlan[date]`), de forma que una actividad cargada desde cualquiera de las dos vistas aparece automáticamente en la otra sin sincronización manual. El objetivo es que Tobías tenga una referencia visual clara de qué horarios están ocupados (franja pintada con el color del área a la que pertenece la actividad) y qué tan movible es cada actividad, tanto mirando un día puntual como la semana completa.

## Requirements

### Must-Have
- [ ] El overlay actual "Planificación del día" se renombra a "Planificación" y gana 2 pestañas internas: **Día** y **Semana**.
- [ ] **Pestaña Día**: reemplaza la agenda por hora actual (lista de tareas por franja de 60/30/15 min) por una vista estilo calendario donde cada actividad se dibuja como un bloque vertical pintado con el color de su área, con alto proporcional a su duración en minutos, sobre una grilla de 24hs.
- [ ] **Pestaña Semana**: grilla de 7 columnas (lunes a domingo) × 24 horas. Cada actividad de cada día se dibuja como bloque pintado con el color de su área, en la columna del día y con alto proporcional a la duración.
- [ ] Cada actividad tiene: hora de inicio, duración en minutos (puede exceder los 60 min y cruzar de una hora a la siguiente), texto, **área** (obligatoria, una de las 5 existentes: Vida / Conocimiento / Salud / IA / Finanzas) y **prioridad** (reutiliza el campo existente de 3 niveles: Baja/Media/Alta — mismo campo que ya cicla `plannerCyclePrio`, ahora también interpretado como "qué tan postergable es").
- [ ] El color de cada bloque sale de las variables CSS ya existentes: `--c-vida`, `--c-finanzas`, `--c-salud`, `--c-conocimiento`, `--c-ia`.
- [ ] Crear una actividad nueva requiere elegir área antes de guardar (no hay actividades sin área).
- [ ] Reglas de solapamiento (ver Edge Cases) se aplican igual en ambas pestañas, porque ambas leen el mismo `S.dayPlan`.
- [ ] Al llegar la fecha de una actividad cargada desde la vista Semana, esa actividad ya está disponible en la vista Día del día correspondiente sin ninguna acción manual — esto se cumple naturalmente porque ambas vistas leen `S.dayPlan[date]`, no hay migración ni copia de datos.
- [ ] Se preserva toda la funcionalidad actual del planner por tarea: editar texto, marcar como hecha, eliminar, ciclar prioridad.

### Nice-to-Have (not required to pass review)
- Redimensionar la duración de una actividad arrastrando el borde inferior del bloque (drag-resize).
- Mover una actividad arrastrándola a otro horario/día (drag-move) en la vista Semana.
- Navegación entre semanas (anterior/siguiente) en la pestaña Semana.

### Out of Scope
- Notificaciones o recordatorios ligados a una actividad del calendario.
- Actividades recurrentes (repetir todos los lunes, etc.).
- Editar el set de áreas/colores existentes (se reutilizan tal cual están).
- Vista mensual.

## Inputs & Outputs
- **Input**: interacción del usuario en la UI — clic en una franja libre para crear actividad, formulario/inline con texto + duración + área + prioridad, clic en bloque existente para editar/eliminar.
- **Output**: bloques renderizados en las grillas Día y Semana, coloreados por área, con alto proporcional a duración; persistidos en `S.dayPlan[date].tasks[]` (localStorage + Firestore vía `saveState()`/`_fbSave()` ya existentes — sin cambios al pipeline de sync).
- **Modelo de dato por actividad** (extensión de la estructura actual `{id, time, priority, text, done}`):
  ```
  { id, time: 'HH:MM', duration: <minutos, entero > 0>, area: 'vida'|'finanzas'|'salud'|'conocimiento'|'ia', priority: 1|2|3, text, done }
  ```

## Constraints
- Sin frameworks: HTML/CSS/JS puro, scripts clásicos, mismo patrón que el resto del proyecto (`app.js` / `planner.js` si se decide extraer, siguiendo el patrón de partición ya usado con `rutinas.js`, `habitos.js`, etc.).
- Reutilizar `S.dayPlan`, `getDayPlan()`, `saveState()` — no crear un almacén de datos paralelo.
- Reutilizar las 5 áreas y sus colores ya definidos en `styles.css` (`--c-vida`, `--c-finanzas`, `--c-salud`, `--c-conocimiento`, `--c-ia`) y el campo de prioridad ya existente (`PLANNER_PRIO`, `plannerCyclePrio`).
- Al tocar `app.js`/`styles.css`/`index.html`: bumpear `CACHE` en `sw.js` y hacer push automático a `main` según regla del proyecto.

## Edge Cases
- **Actividades existentes sin `area` o `duration`** (creadas antes de este cambio): al migrar, se les asigna `duration: plannerHourGrid(date, h)` (el grid actual de esa hora, ya existe) y `area: 'vida'` por defecto. Se muestran con el color de Vida hasta que el usuario les asigne otra área.
- **Intentar crear una actividad en minutos ya ocupados por otra actividad ya fijada**: se bloquea — no se permite crear la nueva actividad en esos minutos. El usuario debe eliminar la actividad existente primero.
- **Extender la duración de una actividad hasta que se solape con otra ya creada**: se bloquea — la duración máxima permitida al editar/crear es hasta el inicio de la siguiente actividad ya fijada en ese día (si la hay), nunca más allá.
- **Actividad que cruza la medianoche** (ej: empieza 23:30 y dura 90 min): no soportado — la duración máxima permitida es hasta las 23:59 del mismo día (se trunca/bloquea al llegar al límite del día).
- **Crear actividad sin elegir área**: el guardado queda bloqueado (botón deshabilitado o validación) hasta que se seleccione una de las 5 áreas.
- **Eliminar una actividad**: libera esos minutos inmediatamente para poder crear una nueva actividad ahí, en ambas vistas.
- **Cambiar de pestaña (Día ↔ Semana) o cambiar de fecha en Día**: siempre lee el estado más reciente de `S.dayPlan`, sin caché obsoleta.

## Definition of Done
- [ ] El overlay se llama "Planificación" y muestra 2 pestañas: Día y Semana.
- [ ] En la pestaña Día, crear una actividad con área "Salud" y 90 min de duración pinta un bloque continuo del color `--c-salud` que ocupa visualmente 1.5 horas en la grilla.
- [ ] En la pestaña Semana, la misma actividad aparece en la columna del día correspondiente, mismo color y alto proporcional.
- [ ] Dado que hoy es 23/07 y se crea desde la vista Semana una actividad para el 24/07, al llegar el 24/07 y abrir la pestaña Día esa actividad ya aparece, sin acción manual.
- [ ] Intentar crear una segunda actividad que se superponga en minutos con una ya existente es rechazado por la UI (no se guarda, se informa al usuario).
- [ ] Intentar extender la duración de una actividad hasta invadir los minutos de otra ya creada es rechazado.
- [ ] Guardar una actividad sin área seleccionada es rechazado.
- [ ] Editar texto, marcar como hecha, eliminar y ciclar prioridad siguen funcionando igual que antes, ahora también reflejando el color/área del bloque.
- [ ] `sw.js` tiene `CACHE` bumpeado y el cambio está pusheado a `main` con deploy verificado (`gh run list`).
