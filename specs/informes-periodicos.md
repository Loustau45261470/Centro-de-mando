# Spec: Informes periódicos (mensual / trimestral / semestral / anual)

## Objective

Una superficie de informes dentro de Centro de Mando que, para un período elegido
(mes, trimestre, semestre o año), arma un **informe único con capítulos por sección**
—Vida, Finanzas, Conocimiento, Salud, IA— a partir de los datos que la app ya
registra en `S`, con KPIs, gráficos, tablas y **conclusiones escritas automáticamente
por reglas**. Cada métrica se muestra comparada contra el período anterior inmediato,
contra el mismo período del año anterior y contra el promedio histórico. Es para
Tobías, único usuario, y resuelve que hoy los datos existen dispersos por sección sin
ninguna lectura agregada del paso del tiempo ni de la evolución entre períodos.

## Requirements

### Must-Have

**Superficie y navegación**
- [ ] Overlay full-screen construido sobre `CMOverlay.build()` (`overlay-core.js`), en
      archivos nuevos `informes.js` + `informes.css`. No se toca la nav principal: no
      hay 7º tab.
- [ ] Selector de granularidad (Mes / Trimestre / Semestre / Año) + selector del
      período concreto dentro de esa granularidad.
- [ ] Índice lateral fijo con: Resumen ejecutivo, Vida, Finanzas, Conocimiento,
      Salud, IA. Click en el índice hace scroll al capítulo; el índice marca el
      capítulo visible.
- [ ] Resumen ejecutivo arriba del todo: highlights del período (los N mayores
      deltas positivos), alertas (los N mayores deltas negativos), rachas activas y
      su récord, y el conteo de métricas por encima / por debajo de su promedio.

**Cálculo y comparativas**
- [ ] Para cada métrica, tres comparaciones: **(a)** vs período anterior inmediato,
      **(b)** vs mismo período del año anterior, **(c)** vs promedio histórico de
      todos los períodos cerrados de esa granularidad. Cada una con delta absoluto y
      porcentual, y signo de color (mejor / peor según la dirección deseada de esa
      métrica, declarada por métrica).
- [ ] Definición de períodos, calendario, hora local (nunca UTC), reusando los
      helpers de fecha ya existentes en `app.js`: mes = mes calendario;
      T1=ene-mar, T2=abr-jun, T3=jul-sep, T4=oct-dic; S1=ene-jun, S2=jul-dic;
      año = año calendario.
- [ ] **Sin backfill ni cálculo retroactivo.** Los informes existen solo desde la
      instalación en adelante: el período en curso al momento de instalar es el
      primero. Nada anterior es consultable ni computable.
- [ ] Al cerrar un período (primera apertura de la app pasado el corte), la app
      congela un **snapshot** de las métricas agregadas de ese período en
      `S.informes`. El cierre es **idempotente**: si ya existe snapshot para esa
      clave, no se recalcula ni se sobreescribe.
- [ ] El período **en curso** se puede consultar siempre, recalculado en vivo desde
      `S`, etiquetado "En curso — datos parciales". Sus comparativas se hacen
      **pro-rata**: contra los mismos N días transcurridos del período de referencia,
      con la advertencia visible en la tarjeta.

**Narrativa automática**
- [ ] Cada capítulo abre con 3-6 frases generadas por reglas en JS puro
      determinístico a partir de los deltas ya calculados (umbrales fijos, sin IA,
      sin red, sin costo). Ej: "Gasto en comida +34% vs julio, el mayor salto del
      año", "Racha de estudio más larga del período: 12 días".
- [ ] Si una regla no tiene datos suficientes para dispararse, no emite frase — nunca
      emite una frase con un hueco o un `NaN`.

**Gráficos**
- [ ] Chart.js, ya cargado en el proyecto — no se agrega ninguna dependencia nueva.
- [ ] Los charts de un capítulo se instancian **lazy**, al entrar el capítulo en
      viewport (IntersectionObserver), y se destruyen (`chart.destroy()`) al cerrar el
      overlay o al cambiar de período. Nunca queda una instancia huérfana.
- [ ] Cada capítulo trae, como mínimo: serie temporal de sus métricas principales a lo
      largo de los períodos cerrados, desglose por categoría del período, y comparativa
      lado a lado período actual vs los tres referentes.

**Inventario de métricas por capítulo** (todas provienen de datos que ya existen en `S`)
- [ ] **Vida** — `goals` (metas diarias: creadas / cumplidas / % cumplimiento),
      `dayPlan` (actividades planificadas vs hechas), `streak`, `habitTrackers.vida`,
      `monthlyGoals.vida`, `reminders.vida` (vencidos / cumplidos), `ideas.vida`,
      `pomodoroHistory` (sesiones y minutos), `planRecurring`, `achievementLog`
      (logros desbloqueados en el período), `fichero` (contactos registrados),
      `proyectos.vida`, `quarterlyObjectives` de categorías Vida.
- [ ] **Finanzas** — `transactions` (ingresos, egresos, neto, por categoría de
      `txnCategories`, por cuenta), `accounts` + `accountHistory`, `nwHistory`
      (patrimonio y su variación), `budgets` (presupuestado vs ejecutado),
      `fixedExpenses` + `fixedExpenseLog` (cumplimiento de gastos fijos),
      `subscriptions`, `orders`, `wishlist`, `purchaseFunds` + `purchaseFundLog` +
      `purchaseFundSpends`, `financeCalendar`, `habitTrackers.finanzas`,
      `sgc.proyecciones`, `finObjectives`, tenencias de cartera (`tenencias.js`),
      `proyectos.finanzas`.
- [ ] **Conocimiento** — `lawProgress` (materias aprobadas en el período),
      `carrera.regular` (regularizadas), `lawMilestones` (real vs esperado),
      `lawPlan`, `cursada`, finales rendidos, `estudioMaterias` + `estudioPaginas`
      (páginas estudiadas), `studyCalendar` (días de estudio, racha, % del período),
      `notas` de estudio e intelecto, `habitTrackers.conocimiento`,
      `pomodoroHistory` de estudio, `proyectos.conocimiento`.
- [ ] **Salud** — `workoutLog` + `routineLog` (sesiones, volumen total, series,
      duración), `exercises` / `exerciseHistory` (PRs del período por ejercicio),
      `bodyWeight` (evolución y delta), `photos` (conteo), `sleepLog` (horas promedio,
      calidad promedio, noches registradas), `dieta.log` vs `dieta.reglas` y `umbral`
      (% de días en cumplimiento), `workoutCalendar`, `habitTrackers.salud`,
      `notasSalud`, `proyectos.salud`.
- [ ] **IA** — `mapaIdeas.notes` (notas creadas, tags más usados, conexiones
      aceptadas), `mapaIdeas.suggestionLog` (tasa de aceptación de sugerencias),
      `jarvisMemory`, `agentChat` (volumen de interacción), `capturas`, `ideas.ia`,
      `habitTrackers.ia`, `proyectos.ia`.

### Nice-to-Have (no requerido para aprobar el review)
- Ninguno declarado en la entrevista.

### Out of Scope
- **Comparación contra objetivo / meta fijada** (objetivos trimestrales, presupuesto,
  metas mensuales como línea de referencia). Ofrecida explícitamente en la entrevista
  y **no seleccionada**. Las metas aparecen como métricas propias, pero ninguna otra
  métrica se compara contra un target.
- **Backfill / cálculo retroactivo de períodos anteriores a la instalación.** Decisión
  tomada y reafirmada tras plantearle el conflicto con las comparativas (ver
  "Consecuencia aceptada").
- **Exportar**: no hay PDF, ni impresión, ni descarga JSON/CSV. El informe se consulta
  solo dentro de la app.
- **Análisis narrativo por IA / JARVIS.** La narrativa es 100% por reglas.
- **Portada transversal con correlaciones entre secciones** (tipo "meses con más
  gimnasio = meses con más estudio"): descartada al elegir informe único con capítulos.
- Edición manual de un snapshot ya cerrado.

## Inputs & Outputs

**Input:** el estado `S` completo en memoria (Firestore `appdata/lifedash_v2`), más
`S.informes` para los períodos ya cerrados. Ninguna fuente externa, ninguna llamada de
red.

**Selección del usuario:** `{ granularidad: 'M'|'T'|'S'|'A', periodo: <clave> }`.

**Claves de período** (formato único, ordenable como string):
- Mes: `M-2026-09`
- Trimestre: `T-2026-3`
- Semestre: `S-2026-2`
- Año: `A-2026`

**Output persistido** — nueva clave de estado:

```js
S.informes = {
  'M-2026-09': {
    cerrado: '2026-10-01T03:12:44.120Z',   // ISO del momento del cierre
    v: 1,                                   // versión del esquema de métricas
    secciones: {
      vida:         { metricas: { <id>: <number> }, labels: { <id>: 'Etiqueta vigente al cierre' } },
      finanzas:     { ... },
      conocimiento: { ... },
      salud:        { ... },
      ia:           { ... }
    }
  }
}
```

**Output en pantalla:** el overlay renderizado — resumen ejecutivo + 5 capítulos, cada
uno con narrativa, tarjetas KPI con sus tres deltas, tablas y charts.

## Constraints

- HTML/CSS/JS puro, scripts clásicos, scope global compartido. Sin bundler, sin
  framework, sin módulos ES.
- Chart.js y `CMOverlay` ya disponibles: **no se agrega ninguna dependencia**.
- Archivos nuevos: `informes.js`, `informes.css`. Se cargan en `index.html` después de
  las secciones y antes de `gamemode.js`/`jarvis-*.js`, respetando el orden documentado
  en el CLAUDE.md del proyecto. `app.js` no se reescribe: solo el hook mínimo de
  arranque del cierre de período.
- Ambos archivos nuevos van al `SHELL` de `sw.js`, con bump de `const CACHE`, y se
  piden versionados con `?v=` en `index.html`.
- **Peso en Firestore:** el documento entero tiene tope de 1 MiB y ya carga mucho. Un
  snapshot de período debe pesar **≤ 15 KB serializado**. Los snapshots guardan
  únicamente **métricas agregadas y sus etiquetas** — jamás datos crudos, jamás arrays
  de transacciones, series diarias o notas.
- El cierre de período escribe en `S` y guarda por la vía normal (`saveState()`). No
  toca `_fbSave`, `_applyRemoteState`, `loadState` ni ninguna lógica de sync.
- Rendimiento: abrir el overlay y renderizar el resumen ejecutivo + primer capítulo en
  **menos de 1,5 s** con el volumen de datos real actual. Los demás capítulos son lazy.

## Edge Cases

- **No existe el período de comparación** (no hay snapshot anterior, ni interanual, ni
  suficientes períodos para promedio): la tarjeta muestra `— sin dato comparable` en
  esa fila. No muestra `0`, ni `0%`, ni oculta la fila.
- **Menos de 2 períodos cerrados** para el promedio histórico: la comparación "vs
  promedio" muestra `— sin dato comparable`.
- **Valor anterior = 0 y actual > 0**: el delta porcentual muestra `nuevo` en vez de
  `∞`. **Ambos 0**: muestra `sin cambios`. Nunca aparece `NaN`, `Infinity` ni `-100%`
  espurio.
- **Métrica sin datos en el período** (nunca se registró nada): la tarjeta muestra
  `sin datos` y queda en gris. No se cuenta como 0 en el promedio histórico ni dispara
  narrativa.
- **Cambia una etiqueta o se borra una categoría / regla de dieta / hábito** después de
  cerrar un período: el snapshot conserva el `label` vigente al cierre, así que el
  informe viejo sigue leyéndose correctamente. La métrica se muestra con su etiqueta
  histórica, marcada como ya inexistente.
- **Cierre desde varios dispositivos**: si al abrir la app ya existe un snapshot para
  esa clave de período, no se recalcula ni se pisa. El primero que cierra, gana.
- **App sin abrir durante varios períodos** (ej. no se abre en 3 meses): al abrir, se
  cierran en orden todos los períodos vencidos que aún no tengan snapshot, usando los
  datos crudos disponibles en `S`. Si los datos crudos de un período viejo ya no
  alcanzan, ese snapshot se marca `parcial: true` y el informe lo advierte.
- **Período en curso**: se puede ver siempre, etiquetado "En curso — datos parciales",
  con comparativas pro-rata. Nunca se congela como snapshot antes del corte.
- **Un snapshot con `v` distinto al esquema actual**: se muestra igual con las métricas
  que sí entiende; las que no existen en ese `v` salen como `— sin dato comparable`.
  Nunca se descarta ni se rompe el informe.
- **Se cambia de período con el overlay abierto**: se destruyen todas las instancias de
  Chart antes de re-renderizar.

## Consecuencia aceptada

Al elegir "solo desde hoy en adelante" y descartar el backfill, las comparaciones
**interanual** y **vs promedio histórico** van a mostrar `— sin dato comparable` hasta
que se acumulen suficientes períodos cerrados: ~1 año para la interanual mensual, y más
para trimestres, semestres y años. La comparación vs período anterior inmediato empieza
a funcionar al cerrar el segundo período. Se planteó explícitamente el conflicto y la
decisión se reafirmó.

## Definition of Done

- [ ] Dado que abro Centro de Mando, cuando abro Informes, entonces veo el overlay con
      el período en curso preseleccionado, etiquetado "En curso — datos parciales".
- [ ] Dado el overlay abierto, cuando cambio la granularidad a Trimestre / Semestre /
      Año, entonces el selector de período se repuebla y el informe se re-renderiza
      completo sin errores de consola.
- [ ] Dado un informe abierto, cuando hago click en cada entrada del índice lateral,
      entonces llego al capítulo correspondiente y el índice marca cuál estoy viendo.
- [ ] Dado que ningún período está cerrado todavía, cuando abro el informe, entonces
      **todas** las filas comparativas dicen `— sin dato comparable` y **ninguna** dice
      `NaN`, `Infinity`, `undefined` ni `0%`.
- [ ] Dado que simulo el cruce de fin de mes (inyectando la fecha), cuando abro la app,
      entonces aparece `S.informes['M-<año>-<mes>']` con `cerrado`, `v` y las 5
      secciones pobladas.
- [ ] Dado que ya existe ese snapshot, cuando vuelvo a abrir la app, entonces el
      snapshot **no cambia** (mismo `cerrado`, mismo contenido) — cierre idempotente.
- [ ] Dado un snapshot cerrado, cuando mido `JSON.stringify(snapshot).length`, entonces
      es **≤ 15.360 bytes**.
- [ ] Dado el overlay abierto, cuando lo cierro y lo reabro 5 veces seguidas, entonces
      no crece la cantidad de instancias vivas de Chart (verificable con
      `Object.keys(Chart.instances).length`) — sin fugas.
- [ ] Dado un capítulo fuera del viewport, cuando abro el informe, entonces sus charts
      **no** están instanciados; cuando lo scrolleo a la vista, se instancian.
- [ ] Dado cualquier capítulo, cuando lo leo, entonces trae al menos 3 frases de
      narrativa coherentes con los números que muestran sus tarjetas, y ninguna frase
      contiene un hueco, un `null` o un número sin unidad.
- [ ] Dados los 5 capítulos, cuando reviso el inventario de métricas de este spec,
      entonces cada fuente de datos listada aparece representada por al menos una
      métrica en su capítulo.
- [ ] Dado que borro una categoría de gasto después de cerrar un mes, cuando abro el
      informe de ese mes, entonces la categoría sigue apareciendo con su etiqueta
      histórica y el informe no se rompe.
- [ ] `informes.js` e `informes.css` están en el `SHELL` de `sw.js`, `const CACHE` fue
      bumpeado, y ambos se piden con `?v=` en `index.html`.
- [ ] El agente `verificador` ejercita el overlay de verdad (cargando la página, no
      releyendo el diff) y devuelve PASS.
