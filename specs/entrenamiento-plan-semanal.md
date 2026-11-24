# Spec: Rediseño de Entrenamiento — "Plan semanal" (V2)

## Objective
Rehacer la INTERFAZ de la sección Entrenamiento (rutinas.js, pestaña Salud) sin perder funcionalidad. Hoy la pantalla inicial ocupa ~3,8 pantallas de alto en el celular (rutinas con 4 botones cada una, biblioteca con filtros y ~40 ejercicios, estadísticas abiertas con mapa muscular, 12 barras y 27 récords). El usuario solo entra, elige la rutina del día y aprieta Comenzar; la sesión en curso "está bastante decente". Se adopta la maqueta V2 "Plan semanal" (https://claude.ai/artifact/HLro7bmejJipChMrFF7PLy): cada día de la semana tiene su rutina fija, se ve la semana de un vistazo y se arranca la de hoy con un toque. Todo lo de uso ocasional queda escondido.

## Requirements

### Must-Have
- [ ] **Plan semanal nuevo**: cada día (lunes a domingo) puede tener una rutina asignada o ser descanso. Se edita desde un botón "Editar plan" (asignar/quitar rutina por día).
- [ ] **Inicio (≤ 1 pantalla de iPhone, 390×844)**:
  - tira de 7 días con la inicial de la rutina de cada día; hoy resaltado; días ya entrenados marcados.
  - carrusel de tarjetas por día (se desliza; abre en HOY): nombre de la rutina, cantidad de ejercicios, duración típica, primeros 3 ejercicios + "N más", botón grande EMPEZAR.
  - día ya hecho: "✓ Hecho · min · series" y botón REPETIR.
  - día de descanso: "Descanso" + chips para "entrenar igual" cualquier rutina.
  - editar rutina / agregar ejercicio / reordenar / borrar rutina en menú ⋯ de cada tarjeta (borrar = mantener apretado ~0,5 s).
  - "+ Nueva rutina" chico.
- [ ] **Cambiar el plan, dos modos** (respuesta 1-C):
  - **Permanente**: cambia el plan fijo de ahí en adelante (ej. Piernas pasa al jueves).
  - **Solo esta semana**: mueve/cambia la rutina de un día sin tocar el plan fijo; la semana siguiente vuelve al plan fijo.
  - Al editar se elige explícitamente cuál de los dos.
- [ ] **Rutina no hecha** (respuesta 2-A + decisión del usuario): si un día con rutina pasa sin entrenarla, al día siguiente esa rutina aparece como **pendiente corrida** ("Te quedó Empuje de ayer"). Ese día el usuario elige:
  - **Hacer la pendiente** → el resto de la semana se corre un día (solo esta semana).
  - **Seguir con el plan** → la pendiente queda marcada "no hecha" y se hace la rutina del día.
  - Nada se marca como hecho por el paso del tiempo (si no entra a la app, nada se completa).
- [ ] **Sesión en curso** (estilo V2): un ejercicio abierto a la vez; al completar todas sus series pasa solo al siguiente (se puede tocar otro para abrirlo); contador "Ejercicio X de N" y barra LED de progreso total; filas de series con kg / reps y casilla chica a la DERECHA con destello del color de Salud; menú ⋯ por ejercicio (historial, reemplazar, ajustar descanso, subir/bajar, sacar) en lugar de 6 íconos; "+ Serie", "+ Ejercicio"; **FINALIZAR SESIÓN fijo abajo** (se ilumina cuando todo está tildado); cancelar sesión en ⋯ con mantener apretado.
- [ ] **Descanso = barra** (no anillo): 32 bloques LED que se vacían con cabezal de luz, cuenta atrás grande, −15 s / Omitir / +15 s; ámbar con latido en los últimos 5 s; verde "¡A DARLE!" al terminar + vibración. Debe mantener lo que ya existe: push del descanso con la app de fondo (`_schedulePushAlarm`/cf-worker) y mini temporizador flotante.
- [ ] **Barra de pestañas inferior de la sección**: Plan · Progreso · Ejercicios.
- [ ] **Progreso** (pantalla aparte, cerrada por defecto): resumen por período (1M/3M/6M/1A: entrenos, volumen, series, tiempo) con números que se descifran; evolución por ejercicio con crosshair HUD; entrenos por semana; músculos trabajados (barras LED, 6 visibles + "ver los 12"; el mapa muscular/video 360° actual se conserva dentro de Progreso); récords (4 visibles + "ver todos", marca NUEVO).
- [ ] **Ejercicios** (pantalla aparte): buscador, chips por grupo muscular/equipo, lista con último peso; tocar abre el historial; "+ Nuevo".
- [ ] **Estética HUD ya aprobada**: color de Salud #F43F5E; negativo en rojos oscuros fuertes y positivo en rojo claro #FF8FA3; tarjetas que se encienden en cascada; números que se descifran; botón principal con pulso; casillas chicas a la derecha.
- [ ] **Sin pérdida de funcionalidad**: todo lo que hoy se puede hacer en Entrenamiento sigue siendo posible (aunque esté un nivel más adentro). Inventario de referencia: scratchpad entreno-inventario/inventario.md.
- [ ] **Resumen de Salud**: la tarjeta resumen de la pestaña Salud (4 KPI, tira de 7 días, último entreno, "Abrir entrenamiento completo") sigue funcionando y usa el plan (muestra qué toca hoy).

### Nice-to-Have (not required to pass review)
- En compu, layout de 2 columnas (plan a la izquierda, resumen/progreso a la derecha).
- Ideas de V1/V3 que le gustaron: tarjeta "Hoy toca" destacada; recuperación muscular con barras LED y anillo reactor.

### Out of Scope
- Cambiar la lógica de cálculo de estadísticas, récords o volumen (solo se reubican y re-estilizan).
- Jiujitsu y boxeo en el plan (no se definió; ver Open Questions).

## Inputs & Outputs
- **Entrada nueva**: plan semanal fijo `{0..6: rutinaId | null}` (lunes=0) + excepciones por semana `{ 'AAAA-Www': {dia: rutinaId|null|'descanso'} }` + decisiones sobre pendientes `{fecha: 'hecha_corrida'|'seguir_plan'}`.
- **Salida**: la misma sesión/historial de entrenamiento que hoy (sin cambiar su formato), para que estadísticas, récords, hábitos vinculados y objetivos sigan funcionando.
- **Sync**: las claves nuevas del estado deben entrar en DEFAULT_STATE y respetar las reglas de sync (CLAUDE.md "Regla crítica: bugs de sync/datos"): si son objetos, que el rescate (`_rescueLocal`) y `_merge3` las unan sin pérdida; agregar test de merge de dos dispositivos.

## Constraints
- HTML/CSS/JS puro, scripts clásicos; rutinas.js y su CSS. Bump `const CACHE` (sw.js) y `?v=` de cada archivo tocado.
- Un solo rAF (~30 fps) para animaciones por código, pausado fuera de pantalla/pestaña oculta; `prefers-reduced-motion`.
- iPhone (Safari) y notebook HP (Windows/Chrome) son los dispositivos objetivo.
- Implementación por etapas, cada una con verificador ciego antes de publicar: (1) datos del plan + sync, (2) Inicio V2, (3) sesión + barra de descanso, (4) Progreso y Ejercicios, (5) tarjeta resumen de Salud.

## Edge Cases
- Sin plan cargado (primera vez): Inicio muestra las rutinas como hoy en forma compacta + botón "Armar mi plan".
- Rutina borrada que estaba en el plan: ese día pasa a "sin asignar" y se avisa.
- Varias rutinas pendientes acumuladas (no entró varios días): se ofrece solo la más reciente como pendiente; las anteriores quedan "no hechas".
- Entrenar una rutina distinta a la del día: cuenta como entreno del día; la del plan queda pendiente según la regla de "rutina no hecha".
- Entrenar dos veces el mismo día: se permite; ambas sesiones se registran.
- Cambio de semana con una excepción "solo esta semana" activa: la semana nueva vuelve al plan fijo.
- Sesión en curso y la app se cierra: se conserva como hoy (no regresión).
- Descanso corriendo con la app de fondo: llega el push (no regresión).
- Zona horaria / medianoche: el "día" es el día local del dispositivo; una sesión empezada antes de medianoche cuenta para el día en que empezó.

## Definition of Done
- [ ] Given plan fijo con Empuje el lunes, when es lunes, then la tarjeta de hoy muestra Empuje con EMPEZAR y la pantalla de Inicio mide ≤ 1 pantalla a 390×844.
- [ ] Given cambio "permanente" de Piernas al jueves, when pasa a la semana siguiente, then Piernas sigue en jueves.
- [ ] Given cambio "solo esta semana", when empieza la semana siguiente, then el plan vuelve al fijo.
- [ ] Given el lunes tenía Empuje y no se entrenó, when es martes, then aparece "Te quedó Empuje de ayer" con las opciones Hacer la pendiente / Seguir con el plan, y nada se marcó como hecho solo.
- [ ] Given "Hacer la pendiente", then el resto de la semana se corre un día solo en esta semana.
- [ ] Given una sesión, when se tildan todas las series de un ejercicio, then se abre el siguiente; la barra de descanso corre, pasa a ámbar a 5 s y a verde al terminar; con la app de fondo llega el push.
- [ ] Given FINALIZAR SESIÓN fijo, when se termina, then se guarda igual que hoy y estadísticas/récords/hábitos/objetivos vinculados se actualizan como antes.
- [ ] Toda acción que existía antes es alcanzable (checklist contra el inventario).
- [ ] Dos dispositivos editan el plan sin conexión y luego sincronizan: no se pierde ninguna edición (test de merge).
- [ ] Specs de rutinas/entrenamiento existentes pasan (ajustados solo donde cambia la UI) + specs nuevos para plan, pendientes y sesión; sin errores de consola; 390 y 1280 sin scroll horizontal.

## Open Questions
- ¿Jiujitsu y boxeo entran en el plan semanal (como "actividad" sin ejercicios) o quedan afuera?
- ¿"Duración típica" se calcula del historial o la carga el usuario?
