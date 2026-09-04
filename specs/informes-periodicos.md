# Spec: Informes periódicos (mensual / trimestral / semestral / anual)

## Objective

Una superficie de informes dentro de Centro de Mando que, para un período foco elegido
(mes, trimestre, semestre o año), arma un **informe único con capítulos por sección**
—Vida, Finanzas, Conocimiento, Salud, IA— a partir de los datos que la app ya registra
en `S`. Cada métrica no se muestra como un número suelto sino como una **matriz de
cuatro ventanas temporales** (mes, trimestre, semestre, año) con sus variaciones
intra-ventana e interanuales, más gráficos, tablas y conclusiones escritas —por reglas
determinísticas y, cuando hay key de Groq cargada, redactadas también por IA gratuita.
Es para Tobías, único usuario, y resuelve que hoy los datos existen dispersos por
sección sin ninguna lectura agregada del paso del tiempo ni de la evolución entre
períodos.

## Requirements

### Must-Have

**Superficie y navegación**
- [ ] Overlay full-screen construido sobre `CMOverlay.build()` (`overlay-core.js`), en
      archivos nuevos `informes.js` + `informes.css`. No se toca la nav principal: no
      hay 7º tab.
- [ ] Selector de granularidad del **período foco** (Mes / Trimestre / Semestre / Año)
      + selector del período concreto dentro de esa granularidad.
- [ ] Índice lateral fijo con: Resumen ejecutivo, Vida, Finanzas, Conocimiento,
      Salud, IA. Click en el índice hace scroll al capítulo; el índice marca el
      capítulo visible.
- [ ] Resumen ejecutivo arriba del todo: highlights del período (los N mayores
      deltas positivos), alertas (los N mayores deltas negativos), rachas activas y
      su récord, y el conteo de métricas por encima / por debajo de su promedio.

**Matriz de comparativas (el núcleo del informe)**

Cada métrica se despliega en una matriz de **4 ventanas temporales**, calculadas
siempre respecto del período foco seleccionado. Con foco en Septiembre 2026:

| Ventana | Valor | Δ intra-ventana | Δ interanual | vs promedio |
|---|---|---|---|---|
| **Mes** — Sep 2026 | valor | **intermensual** vs Ago 2026 | vs Sep 2025 | vs promedio de todos los meses |
| **Trimestre** — T3 2026 | valor | **intertrimestral** vs T2 2026 | vs T3 2025 | vs promedio de todos los trimestres |
| **Semestre** — S2 2026 | valor | **intersemestral** vs S1 2026 | vs S2 2025 | vs promedio de todos los semestres |
| **Año** — 2026 | valor | **interanual** vs 2025 | — (idéntico a la columna anterior) | vs promedio de todos los años |

- [ ] Las **4 ventanas que contienen o igualan al período foco** se muestran completas:
      valor + Δ intra-ventana + Δ interanual + Δ vs promedio histórico. Son las
      8 métricas pedidas (mensual, intermensual, trimestral, intertrimestral,
      semestral, intersemestral, anual, interanual) más las columnas interanual y
      promedio de cada nivel.
- [ ] Las ventanas **más finas que el foco** (ej. la fila Mes cuando el foco es un año)
      no muestran un valor único sino la **serie desagregada**: sparkline de los 12
      meses, más mejor mes, peor mes, promedio y desvío. Nunca desaparecen del informe.
- [ ] Cada Δ se muestra en absoluto y porcentual, con color según la **dirección
      deseada declarada por métrica** (bajar el gasto es verde; bajar el volumen de
      entrenamiento es rojo). Ninguna métrica queda sin dirección declarada.
- [ ] Definición de períodos, calendario, hora local (nunca UTC), reusando los helpers
      de fecha ya existentes en `app.js`: mes = mes calendario; T1=ene-mar, T2=abr-jun,
      T3=jul-sep, T4=oct-dic; S1=ene-jun, S2=jul-dic; año = año calendario.

**Cobertura histórica y datos faltantes**
- [ ] Los informes se generan para **todo período que tenga datos reales**, hacia atrás
      hasta el primer dato registrado en `S` (aproximadamente junio/julio 2025 según la
      sección). Los períodos pasados se **calculan al vuelo** desde los datos crudos.
- [ ] La app deriva por sí sola la **fecha de inicio de cada métrica** (el dato más
      viejo presente en `S` para esa métrica). El selector de períodos solo ofrece
      períodos comprendidos entre el primer período con datos y hoy.
- [ ] **Nunca se inventa, estima, interpola ni imputa un dato faltante.** Una métrica
      sin registros en un período muestra `sin datos`, queda en gris, se excluye de
      promedios y de cualquier Δ, y no dispara narrativa.
- [ ] Un período **sin ningún dato en ninguna sección** no se ofrece en el selector.
- [ ] Al cerrar un período (primera apertura de la app pasado el corte), la app congela
      un **snapshot** de las métricas agregadas en `S.informes`, de forma
      **idempotente**: si ya existe snapshot para esa clave, no se recalcula ni se
      sobreescribe. Los períodos anteriores al primer cierre **no** se persisten en
      Firestore: se calculan al vuelo y se cachean en memoria durante la sesión.
- [ ] El período **en curso** se puede consultar siempre, recalculado en vivo,
      etiquetado "En curso — datos parciales". Sus comparativas se hacen **pro-rata**:
      contra los mismos N días transcurridos del período de referencia, con la
      advertencia visible en la tarjeta. Nunca se congela antes del corte.

**Narrativa**
- [ ] **Capa base, siempre presente: narrativa por reglas.** Cada capítulo abre con 3-6
      frases generadas en JS puro determinístico a partir de los deltas ya calculados
      (umbrales fijos, sin red, sin costo). Ej: "Gasto en comida +34% intermensual, el
      mayor salto del año", "Racha de estudio más larga del período: 12 días".
- [ ] **Capa IA, opcional: análisis redactado por Groq.** Reusa el adaptador y la key
      ya existentes de `jarvis-agent.js` (`localStorage['agent_api_key_v1']`, modelo
      `llama-3.3-70b-versatile`, free tier). No se agrega una key nueva, ni un
      proveedor nuevo, ni se hardcodea ningún secreto en el repo.
- [ ] La llamada a Groq recibe **solo las métricas agregadas y sus deltas** ya
      calculados — nunca datos crudos, ni notas, ni transacciones individuales, ni
      contenido personal libre.
- [ ] El informe es **completo y válido sin IA**: si no hay key, si falla la llamada,
      si no hay red o si el usuario apagó el toggle, la narrativa por reglas se muestra
      igual y el bloque de IA simplemente no aparece. Ningún error de red rompe el
      informe ni queda tragado en silencio: se muestra un aviso discreto.
- [ ] Toggle visible para apagar la capa IA. Con key presente viene encendido.
- [ ] Ninguna frase, de ninguna de las dos capas, se emite con un hueco, un `null`, un
      `NaN` o un número sin unidad. Si una regla no tiene datos suficientes, no emite.

**Gráficos**
- [ ] Chart.js, ya cargado en el proyecto — no se agrega ninguna dependencia nueva.
- [ ] Los charts de un capítulo se instancian **lazy**, al entrar el capítulo en
      viewport (IntersectionObserver), y se destruyen (`chart.destroy()`) al cerrar el
      overlay o al cambiar de período. Nunca queda una instancia huérfana.
- [ ] Cada capítulo trae, como mínimo: serie temporal de sus métricas principales a lo
      largo de todos los períodos con datos, desglose por categoría del período foco,
      comparativa lado a lado de las 4 ventanas, y sparkline de la serie desagregada
      para las ventanas más finas que el foco.

**Inventario de métricas por capítulo** (todas provienen de datos que ya existen en `S`)
- [ ] **Vida** — `goals` (metas diarias: creadas / cumplidas / % cumplimiento),
      `dayPlan` (actividades planificadas vs hechas), `streak`, `habitTrackers.vida`,
      `monthlyGoals.vida`, `reminders.vida` (vencidos / cumplidos), `ideas.vida`,
      `pomodoroHistory` (sesiones y minutos), `planRecurring`, `achievementLog`
      (logros desbloqueados en el período), `fichero` (contactos registrados),
      `proyectos.vida`.
- [ ] **Finanzas** — `transactions` (ingresos, egresos, neto, por categoría de
      `txnCategories`, por cuenta), `accounts` + `accountHistory`, `nwHistory`
      (patrimonio y su variación), `budgets` (ejecutado por categoría),
      `fixedExpenses` + `fixedExpenseLog` (cumplimiento de gastos fijos),
      `subscriptions`, `orders`, `wishlist`, `purchaseFunds` + `purchaseFundLog` +
      `purchaseFundSpends`, `financeCalendar`, `habitTrackers.finanzas`,
      `sgc.proyecciones`, tenencias de cartera (`tenencias.js`), `proyectos.finanzas`.
- [ ] **Conocimiento** — `lawProgress` (materias aprobadas en el período),
      `carrera.regular` (regularizadas), `lawPlan`, `cursada`, finales rendidos,
      `estudioMaterias` + `estudioPaginas` (páginas estudiadas), `studyCalendar`
      (días de estudio, racha, % del período), `notas` de estudio e intelecto,
      `habitTrackers.conocimiento`, `pomodoroHistory` de estudio,
      `proyectos.conocimiento`.
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
- **Comparación contra objetivo / meta fijada** (`quarterlyObjectives`, `finObjectives`,
  `lawMilestones`, presupuesto asignado, `monthlyGoals` como línea de referencia).
  Excluida a propósito y con motivo declarado: los targets son **eventos cambiantes y
  únicos**, distintos en cada período, así que compararlos entre sí no mide nada. Lo
  que importa medir es lo que **se repite en el día a día**. Estas colecciones pueden
  aportar métricas propias (ej. "materias aprobadas en el período"), pero ninguna otra
  métrica se compara contra un target.
- **Estimación, interpolación o imputación de datos faltantes.** Un hueco es un hueco.
- **Exportar**: no hay PDF, ni impresión, ni descarga JSON/CSV. El informe se consulta
  solo dentro de la app.
- **Portada transversal con correlaciones entre secciones** (tipo "meses con más
  gimnasio = meses con más estudio"): descartada al elegir informe único con capítulos.
- **Proveedores de IA de pago o keys nuevas.** Solo se reusa la key de Groq ya existente.
- Edición manual de un snapshot ya cerrado.

## Inputs & Outputs

**Input:** el estado `S` completo en memoria (Firestore `appdata/lifedash_v2`), más
`S.informes` para los períodos ya cerrados. Para la capa IA, la key de Groq en
`localStorage['agent_api_key_v1']`. Ninguna otra fuente externa.

**Selección del usuario:** `{ granularidad: 'M'|'T'|'S'|'A', periodo: <clave> }`.

**Claves de período** (formato único, ordenable como string):
- Mes: `M-2026-09`
- Trimestre: `T-2026-3`
- Semestre: `S-2026-2`
- Año: `A-2026`

**Output persistido** — nueva clave de estado (solo períodos cerrados de acá en adelante):

```js
S.informes = {
  'M-2026-09': {
    cerrado: '2026-10-01T03:12:44.120Z',   // ISO del momento del cierre
    v: 1,                                   // versión del esquema de métricas
    secciones: {
      vida:         { metricas: { <id>: <number|null> }, labels: { <id>: 'Etiqueta vigente al cierre' } },
      finanzas:     { ... },
      conocimiento: { ... },
      salud:        { ... },
      ia:           { ... }
    }
  }
}
```

`null` en `metricas` significa **sin datos** — es distinto de `0`, y así se propaga a
toda la app: excluido de promedios, de deltas y de narrativa.

**Output en pantalla:** el overlay renderizado — resumen ejecutivo + 5 capítulos, cada
uno con narrativa (reglas + IA opcional), la matriz de 4 ventanas por métrica, tablas y
charts.

## Constraints

- HTML/CSS/JS puro, scripts clásicos, scope global compartido. Sin bundler, sin
  framework, sin módulos ES.
- Chart.js y `CMOverlay` ya disponibles: **no se agrega ninguna dependencia**.
- La capa IA **reusa** el adaptador Groq de `jarvis-agent.js`. Si ese adaptador no
  expone una función invocable desde afuera, se extrae a una función compartida sin
  cambiar su comportamiento actual — no se duplica la lógica de llamada.
- Archivos nuevos: `informes.js`, `informes.css`. Se cargan en `index.html` después de
  las secciones y antes de `gamemode.js`/`jarvis-*.js`, respetando el orden documentado
  en el CLAUDE.md del proyecto. `app.js` no se reescribe: solo el hook mínimo de
  arranque del cierre de período.
- Ambos archivos nuevos van al `SHELL` de `sw.js`, con bump de `const CACHE`, y se
  piden versionados con `?v=` en `index.html`.
- **Peso en Firestore:** el documento entero tiene tope de 1 MiB y ya carga mucho. Un
  snapshot de período debe pesar **≤ 15 KB serializado**. Los snapshots guardan
  únicamente **métricas agregadas y sus etiquetas** — jamás datos crudos, jamás arrays
  de transacciones, series diarias o notas. Los períodos calculados al vuelo no se
  persisten.
- El cierre de período escribe en `S` y guarda por la vía normal (`saveState()`). No
  toca `_fbSave`, `_applyRemoteState`, `loadState` ni ninguna lógica de sync.
- Rendimiento: abrir el overlay y renderizar el resumen ejecutivo + primer capítulo en
  **menos de 1,5 s** con el volumen de datos real actual, incluyendo el cálculo al
  vuelo de los períodos históricos. Los demás capítulos son lazy.

## Edge Cases

- **Métrica sin datos en un período**: muestra `sin datos` en gris. No se cuenta como
  `0`, no entra en el promedio histórico, no genera Δ y no dispara narrativa.
- **Período sin ningún dato en ninguna sección**: no aparece en el selector.
- **No existe el período de comparación** (anterior al primer dato registrado): esa
  celda muestra `— sin dato comparable`. No muestra `0`, ni `0%`, ni se oculta.
- **Menos de 2 períodos con datos** para el promedio histórico de esa ventana: la
  columna "vs promedio" muestra `— sin dato comparable`.
- **Valor anterior = 0 y actual > 0**: el Δ porcentual muestra `nuevo` en vez de `∞`.
  **Ambos 0**: muestra `sin cambios`. Nunca aparece `NaN`, `Infinity` ni un `-100%`
  espurio.
- **Ventana parcialmente cubierta por los datos** (ej. el año 2025 arranca recién en
  junio): el valor de esa ventana se muestra marcado `parcial (jun-dic)` y su Δ
  interanual contra un año completo se suprime, porque compararlos sería engañoso.
- **Cambia una etiqueta o se borra una categoría / regla de dieta / hábito** después de
  cerrar un período: el snapshot conserva el `label` vigente al cierre, así que el
  informe viejo sigue leyéndose correctamente. La métrica se muestra con su etiqueta
  histórica, marcada como ya inexistente.
- **Cierre desde varios dispositivos**: si al abrir la app ya existe snapshot para esa
  clave, no se recalcula ni se pisa. El primero que cierra, gana.
- **App sin abrir durante varios períodos**: al abrir, se cierran en orden todos los
  períodos vencidos sin snapshot, desde los datos crudos disponibles en `S`.
- **Período en curso**: etiquetado "En curso — datos parciales", comparativas pro-rata.
- **Snapshot con `v` distinto al esquema actual**: se muestra con las métricas que sí
  entiende; las que no existen en ese `v` salen como `— sin dato comparable`. Nunca se
  descarta ni rompe el informe.
- **Sin key de Groq / sin red / la API devuelve error o rate limit**: el bloque de IA
  no se renderiza, aparece un aviso discreto con el motivo, y la narrativa por reglas
  se muestra completa. El informe nunca queda a medias por culpa de la IA.
- **La IA devuelve texto vacío o malformado**: se descarta y se cae a la narrativa por
  reglas, con el mismo aviso.
- **Se cambia de período con el overlay abierto**: se destruyen todas las instancias de
  Chart antes de re-renderizar, y se cancela cualquier llamada a IA en vuelo.

## Definition of Done

- [ ] Dado que abro Centro de Mando, cuando abro Informes, entonces veo el overlay con
      el período en curso preseleccionado, etiquetado "En curso — datos parciales".
- [ ] Dado el overlay abierto, cuando cambio la granularidad a Trimestre / Semestre /
      Año, entonces el selector de período se repuebla solo con períodos que tienen
      datos y el informe se re-renderiza completo sin errores de consola.
- [ ] Dado un período foco mensual, cuando miro cualquier métrica, entonces veo las
      **4 filas** (Mes, Trimestre, Semestre, Año) con sus valores y sus Δ intra-ventana
      —intermensual, intertrimestral, intersemestral, interanual— más las columnas
      interanual y vs promedio.
- [ ] Dado un período foco anual, cuando miro cualquier métrica, entonces la fila Mes
      muestra la serie desagregada de los 12 meses con sparkline, mejor mes, peor mes y
      promedio — no un valor único ni una fila vacía.
- [ ] Dado que selecciono un período anterior a la instalación de la feature (ej.
      agosto 2026), cuando abro el informe, entonces se calcula al vuelo desde los
      datos crudos y muestra valores reales, sin snapshot previo.
- [ ] Dado un período anterior al primer dato registrado, cuando abro el selector,
      entonces ese período **no aparece** como opción.
- [ ] Dada una métrica sin registros en el período, cuando la miro, entonces dice
      `sin datos` y **ningún** valor estimado, interpolado o inventado aparece en su
      lugar, ni entra en el promedio histórico.
- [ ] Dado cualquier informe, cuando lo reviso completo, entonces **ninguna** celda
      dice `NaN`, `Infinity`, `undefined` ni `null`.
- [ ] Dado que simulo el cruce de fin de mes, cuando abro la app, entonces aparece
      `S.informes['M-<año>-<mes>']` con `cerrado`, `v` y las 5 secciones pobladas.
- [ ] Dado que ya existe ese snapshot, cuando vuelvo a abrir la app, entonces el
      snapshot **no cambia** (mismo `cerrado`, mismo contenido) — cierre idempotente.
- [ ] Dado un snapshot cerrado, cuando mido `JSON.stringify(snapshot).length`, entonces
      es **≤ 15.360 bytes**.
- [ ] Dado que borro la key de Groq de `localStorage`, cuando abro el informe, entonces
      la narrativa por reglas aparece completa en los 5 capítulos, el bloque de IA no
      se renderiza, y no hay ningún error de consola.
- [ ] Dado que hay key de Groq, cuando abro el informe, entonces aparece el bloque de
      análisis por IA, y en la request enviada **no** viajan transacciones
      individuales, notas ni texto libre personal — solo métricas agregadas.
- [ ] Dado el overlay abierto, cuando lo cierro y lo reabro 5 veces seguidas, entonces
      no crece la cantidad de instancias vivas de Chart (verificable con
      `Object.keys(Chart.instances).length`) — sin fugas.
- [ ] Dado un capítulo fuera del viewport, cuando abro el informe, entonces sus charts
      **no** están instanciados; cuando lo scrolleo a la vista, se instancian.
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
