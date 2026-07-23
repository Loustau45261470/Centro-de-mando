# Spec — Crear/editar actividad del planner por modal + repetición + rango 05:00–00:00

Mejora del calendario de planificación (overlay Vida, pestañas Día y Semana). Reemplaza la
creación inline (bloque vacío + puntitos de área) por un **modal** disparado con un botón **＋**.

## Alcance
- Overlay `#ov-planner` (Día y Semana) y card standalone de Vida (`#dayPlannerList`), todos vía
  `buildDayCalendar`/`buildWeekCalendar`.
- No se toca el pipeline de sync (`_fbSave`, `loadState`, `onSnapshot`). El estado nuevo
  (`S.planRecurring`) persiste con `saveState()` como cualquier otro campo de `S`.

## Creación
- [ ] Botón **＋ Actividad** visible arriba de la pestaña Día y de la pestaña Semana.
- [ ] Click en zona vacía de un track del calendario abre el mismo modal, precargando esa hora y
      esa fecha (ya no crea un bloque vacío).
- [ ] El modal permite elegir: **actividad** (texto), **área** (una de las 5: Vida/Finanzas/Salud/
      Conocimiento/IA), **importancia** (Baja/Media/Alta), **fecha**, **hora de inicio**, y el fin
      por **duración en minutos** _o_ por **hora de fin** (toggle), y **repetición**.
- [ ] Repetición: No repetir · Todos los días · Semanal · Mensual · Anual · Días particulares
      (checkboxes L M X J V S D).
- [ ] Al guardar sin repetición → tarea puntual en `S.dayPlan[fecha].tasks`.
- [ ] Al guardar con repetición → regla en `S.planRecurring`, con `startDate = fecha`.
- [ ] Validación: la ventana [inicio, fin) debe estar dentro de 05:00–00:00, con fin > inicio, y no
      solaparse con otra actividad de esa fecha (excluyéndose a sí misma). Fin `00:00` = medianoche.

## Edición (modal unificado)
- [ ] Tocar un bloque existente abre el modal con todos sus campos cargados (área, importancia,
      horario, repetición). No hay controles inline en el bloque salvo el check de "hecho" y ✕.
- [ ] Editar/borrar una actividad **repetida** pregunta **"Solo este día"** vs **"Toda la serie"**
      (estilo Google), guardando excepciones por fecha.
  - Solo este día → override en `S.planRecurring[i].exceptions[fecha]`.
  - Toda la serie → modifica los campos base de la regla.
- [ ] Borrar puntual (no repetida) la elimina directo.
- [ ] Marcar "hecho" en una repetida es por fecha (`exceptions[fecha].done`), no afecta la serie.

## Bloque
- [ ] Pintado **completo** con el color del área (relleno sólido, no gradiente tenue).
- [ ] Muestra rango horario (HH:MM–HH:MM), título, área e indicador de importancia; ⟳ si se repite.
- [ ] Alto proporcional a la duración.

## Rango del calendario
- [ ] El calendario muestra solo **05:00 a 00:00** (19 h) en Día y en Semana: ticks de hora, líneas,
      posición de bloques, línea de "ahora", scroll inicial y click-para-crear, todo respeta ese rango.

## Modelo de datos
```
S.planRecurring = [{
  id: 'r…', text, area, priority, time:'HH:MM', duration:min,
  startDate:'YYYY-MM-DD',
  repeat: { freq:'daily'|'weekly'|'monthly'|'yearly'|'weekdays', byDays:[0..6] },  // getDay(): 0=Dom
  exceptions: { 'YYYY-MM-DD': { deleted?, done?, time?, duration?, area?, priority?, text? } }
}]
```
Ocurrencias virtuales en render: `plannerDayTasks(date)` = tareas puntuales + ocurrencias generadas
(id compuesto `r…@YYYY-MM-DD`). Las acciones (toggle/delete/editar) detectan el id compuesto y rutean
a la lógica de recurrencia.

## No-objetivos (YAGNI)
- Sin "cada N días/semanas" (intervalo siempre 1). Sin fin de recurrencia (`until`). Sin arrastrar
  bloques (no había drag&drop en el calendario). Tareas legacy anteriores a 05:00 quedan fuera de la
  ventana visible (caso borde aceptado).
