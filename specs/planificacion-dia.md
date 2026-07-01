# Spec: Planificación del Día — bloques por tramo y tareas con prioridad

## Objective
Rediseñar la sección **Planificación del Día** del Centro de Mando para que cada bloque de hora
(06:00–23:00) sea expandible y subdivisible en tramos seleccionables (15/30/60 min), y para que
dentro de esos tramos se coloquen **tareas con 3 niveles de prioridad** claramente distinguibles a
simple vista. Reemplaza el sistema actual de una nota de texto libre por hora. Es para uso personal
de Tobías, para organizar el día con jerarquía visual real entre lo importante y lo secundario.

## Requirements

### Must-Have
- [ ] Cada hora del planner (06:00–23:00) se puede **expandir al seleccionarla**; colapsada por defecto.
- [ ] Al expandir una hora se elige la **granularidad del tramo: 15, 30 o 60 min**. La selección se
      recuerda por hora (persistida) y define cómo se subdivide esa hora.
- [ ] Los sub-tramos resultantes son **seleccionables** para colocar tareas (60→1 slot; 30→2 slots
      :00/:30; 15→4 slots :00/:15/:30/:45).
- [ ] Una **tarea** tiene: texto, prioridad (1 baja / 2 media / 3 alta) y estado completada. Nada más.
- [ ] **3 niveles de prioridad** con colores en gradiente de apagado (baja) a llamativo (alta),
      distinguidos por una **combinación de al menos 3 factores** (p. ej. color/intensidad + badge o
      etiqueta de prioridad + acento visual como borde/peso tipográfico), no solo por color.
- [ ] **Checkbox a la derecha** de cada tarea; al marcarla la tarea se **atenúa** (dim + tachado ligero).
- [ ] Este sistema **reemplaza** la nota de texto libre por hora (`S.dayPlanner`). Las notas viejas de
      hoy son **descartables** (se arranca limpio, sin migración).
- [ ] **Barra de progreso del día**: indicador visible con % y conteo de tareas completadas (ej. 4/10).
- [ ] **Ordenar por prioridad dentro de la hora**: dentro de una hora expandida, las tareas de mayor
      prioridad se muestran arriba automáticamente.
- [ ] **Resumen por prioridad**: contador visible de tareas pendientes por nivel (alta/media/baja).
- [ ] **Arrastrar tareas entre tramos/horas** con drag & drop (usar SortableJS, ya presente en el proyecto).
- [ ] Mantener el **indicador de "ahora"** (línea de hora actual) del planner existente.
- [ ] Sincroniza con Firestore usando el mecanismo de sync existente (`saveState`/`_fbSave`), sin tocar
      la lógica de sync.

### Out of Scope
- Duración explícita, recordatorios/alarmas, o notificaciones por tarea.
- Repetición de tareas / plantillas de día.
- Integración o fusión con "Metas de Hoy" (`S.goals`) — queda como sección independiente, sin cambios.
- Migración de las notas de texto libre existentes.
- Vista semanal o de varios días (sigue siendo hoy + mañana como hoy).

## Inputs & Outputs
**Entrada:** interacción del usuario (seleccionar hora, elegir tramo, escribir/priorizar/completar/
arrastrar tareas).

**Salida / persistencia:** nuevo estado por fecha, guardado con `saveState()` y sincronizado por el
sync existente. Forma sugerida (el naming final se decide en build, pero la estructura debe cumplir esto):

```
S.dayPlan[date] = {
  grid:  { "HH": 60 | 30 | 15, ... },        // granularidad recordada por hora
  tasks: [
    { id, time: "HH:MM", priority: 1|2|3, text: string, done: boolean }
  ]
}
```
- `time` es el inicio del sub-tramo (minutos ∈ {00,15,30,45} según la grilla de esa hora).
- Constante de colores por prioridad reutiliza/extiende el patrón existente `PRIORITY_COLOR`.

## Constraints
- Stack del proyecto: **HTML/CSS/JS puro, sin framework ni bundler**. Scripts clásicos, globals compartidos.
- Debe funcionar en **mobile y desktop** (la Planificación se abre desde el overlay 🧍 → Planificación
  y también tiene vista inline reducida en el dashboard).
- Reutilizar **SortableJS** (drag & drop) y respetar `prefers-reduced-motion` para la animación de expandir.
- Al tocar `.js`/`.css`, **bumpear `const CACHE` en `sw.js`** y actualizar el `SHELL` si se agregan archivos.
- No modificar `_fbSave`, `_applyRemoteState`, `loadState` ni la lógica de sync.
- Archivos < 800 líneas; extraer a módulo aparte si crece.

## Edge Cases
- **Hora sin tareas:** se muestra colapsada con un affordance claro para expandir/agregar; en la vista
  inline reducida del dashboard **no aparece** (igual que hoy: solo horas con contenido).
- **Varias tareas en el mismo sub-tramo:** se apilan verticalmente, ordenadas por prioridad (alta arriba).
- **Empate de prioridad:** se ordenan por orden de creación (estable), sin reordenar al azar.
- **Se borra la última tarea de una hora:** la hora vuelve al estado colapsado/vacío; su `grid` puede
  resetearse al default (60).
- **Cambiar la granularidad de una hora con tareas ya colocadas:** las tareas conservan su `time`; si un
  `time` no cae en un sub-tramo de la nueva grilla, se reubica al inicio del sub-tramo contenedor
  (nunca se pierde una tarea).
- **Tarea completada:** cuenta para la barra de progreso y sale del resumen de pendientes por prioridad.
- **Reduced motion:** expandir/colapsar no anima (sin transición de altura), solo cambia de estado.
- **Offline:** funciona desde localStorage; sincroniza al recuperar conexión con el flujo existente.

## Definition of Done
- [ ] Dado el planner en el overlay, cuando selecciono una hora, entonces se expande y puedo elegir
      tramo 15/30/60 y esa elección persiste al cerrar y reabrir.
- [ ] Dada una hora expandida en 15 min, cuando agrego tareas, entonces se colocan en los sub-tramos
      :00/:15/:30/:45 correctos.
- [ ] Dadas 3 tareas de prioridad baja/media/alta, cuando las veo, entonces cada nivel se distingue por
      al menos 3 factores visuales combinados y el gradiente va de apagado (baja) a llamativo (alta).
- [ ] Dada una tarea, cuando toco su checkbox a la derecha, entonces se atenúa y cuenta como completada.
- [ ] Dadas varias tareas en una hora, cuando la abro, entonces aparecen ordenadas con la de mayor
      prioridad arriba.
- [ ] Dado un día con N tareas y M completadas, cuando lo miro, entonces la barra de progreso muestra
      M/N y el % correcto, y el resumen por prioridad refleja los pendientes por nivel.
- [ ] Dado que arrastro una tarea de un tramo/hora a otro, cuando la suelto, entonces queda en el destino
      y persiste tras recargar.
- [ ] Dada la vista inline del dashboard, cuando hay horas con tareas, entonces solo esas horas se
      muestran, con prioridad visible y checkbox funcional.
- [ ] Recargar la app (y en otro dispositivo tras sync) conserva grilla, tareas, prioridades y completadas.
- [ ] Se bumpeó `const CACHE` en `sw.js` y los cambios llegan a los dispositivos.
