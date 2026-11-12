# Spec: Principios, Objetivos y Revisiones

## Objective
Una pestaña nueva del Centro de Mando que funciona como **sistema de vida guiado por principios**. Reúne cuatro piezas conectadas: (1) una biblioteca de principios rectores (con su "por qué"), (2) objetivos de largo plazo, anuales, trimestrales y mensuales categorizados por área de vida, (3) revisiones periódicas (semanal, mensual, trimestral, semestral, anual) que muestran los datos del período comparados con el anterior, y (4) un consejero con IA que aconseja y recuerda según los principios. Es para Tobías (uso personal). Resuelve que hoy el reporte anual se hace a mano en papel y que los principios, objetivos y hábitos no están conectados entre sí.

Se construye por etapas, en este orden: **A (base) → B (reportes) → C (recordatorios) → D (consejero IA)**. Cada etapa debe poder usarse sin esperar a la siguiente.

## Requirements

### Must-Have — Etapa A: Base (principios, objetivos, categorías)
- [ ] Pestaña nueva en el Centro de Mando, datos en Firestore (mismo documento/mecanismo de sync que el resto, sin romper la arquitectura de sync existente).
- [ ] **Principios:** crear, editar, eliminar y listar. Cada ficha tiene: enunciado, por qué (motivo), sección/dominio, qué hacer, qué no hacer, fuente (texto libre: autor, libro, "propio") y tipo de recordatorio (ver Etapa C). Filtro por sección y búsqueda por texto.
- [ ] **Anti-principios / patrones a evitar:** misma biblioteca, marcados como "comportamiento a evitar" (ej: procrastinar, posponer gratificación), distinguibles visualmente de los principios.
- [ ] **Secciones del reporte (fijas):** Vida, Salud, Conocimiento, Economía, IA.
- [ ] **Categorías por sección (precargadas, editables: crear, renombrar y eliminar):**
  - Vida: Familia, Esposa, Hijas (gatas), Religión, Concentración, Consistencia, Planificación.
  - Economía: Austeridad, Organización, Inversión, Trabajo.
  - Conocimiento: Aprendizaje, Libros, Carrera.
  - Salud: Gym, Jiujitsu, Boxeo, Movilidad, Resistencia, Fuerza, Salud, Alimentación.
  - IA: Aprendizaje, Proyectos personales, Negocios.
  - "Aprendizaje" en Conocimiento y en IA son categorías **independientes**; cada una se compara solo contra sí misma.
- [ ] **Objetivos:** horizonte (largo plazo, anual, trimestral, mensual), sección, categoría, estado (pendiente / cumplido / no cumplido) y fecha. Un objetivo pertenece a una sola categoría.
- [ ] **Cadena de coherencia:** un objetivo puede vincularse a uno de horizonte mayor (mensual → trimestral → anual → largo plazo), a hábitos existentes y a uno o más principios. La pestaña muestra los objetivos sin ningún principio vinculado y los principios sin ningún objetivo ni hábito vinculado.
- [ ] Reutilizar los objetivos trimestrales y los hábitos que ya existen en el Centro (`objetivos.js`, `habitos.js`); no duplicar datos. Si hay conflicto de modelo, se resuelve en el diseño de la Etapa A sin migrar datos a ciegas.
- [ ] Carga inicial de contenido (principios y objetivos de largo plazo) hecha por Claude a partir de lo que Tobías pase (texto, fotos, archivos, autores indicados). Importar desde foto/archivo **dentro de la app** no es parte de la v1.

### Must-Have — Etapa B: Reportes de revisión
- [ ] Un **mismo molde de reporte** para cinco períodos: semanal, mensual, trimestral, semestral y anual. Se elige el período y se genera el reporte con los datos de ese rango.
- [ ] Formato: **una página deslizable por sección** (Foco, Vida, Salud, Conocimiento, Economía, IA, Aprendizajes, Agradecimientos), mostrando los calendarios de los meses que comprende el período y las estadísticas relevantes de cada sección.
- [ ] **Calendarios de hábitos** en todas las secciones, para todos los hábitos de la sección correspondiente.
- [ ] **Comparación período contra período** en hábitos: se muestra la diferencia absoluta y la porcentual contra el período anterior equivalente. Ej: semana 1 = 2 cumplidos, semana 2 = 4 → "+2 / +100%". Trimestre 1 = 30, trimestre 2 = 20 → "-10 / -33%".
- [ ] **Comparación de objetivos por categoría:** se cuentan los objetivos cumplidos de cada categoría y se comparan solo contra la misma categoría del período anterior. Avance: "+N" en verde. Empate: el número en azul. Retroceso: "-N" en rojo.
- [ ] **Regla de color unificada:** mejora = verde, igual = azul, empeora = rojo, en hábitos y objetivos.
- [ ] **Datos presentados, interpretación manual:** estancamientos y deterioros los **carga Tobías a mano** en cada reporte. El reporte solo le muestra los datos para decidir.
- [ ] **Veredicto de Claude al final de cada reporte** (generado por IA, ver Etapa D) con un botón de **conformidad**. Si Tobías coincide, aprieta el botón y queda registrado (fecha y período). Si no coincide, completa su propio veredicto en texto. Ambos quedan guardados en el historial del reporte.
- [ ] Secciones de texto manual (Tobías escribe): Estancamientos, Deterioro, Aprendizajes (tabla error → aprendizaje → propuesta para cambiarlo) y Agradecimientos. Cada fila de Aprendizaje permite **convertir la propuesta en principio candidato o en objetivo** con un clic.
- [ ] Sección "Foco": muestra dónde estuvieron el **tiempo** y el **dinero** del período a partir de los datos del Centro.
- [ ] Historial: los reportes generados y lo que Tobías escribió se guardan y se pueden reabrir.
- [ ] **KPIs de Economía** (confirmados por Tobías): patrimonio; inversiones (monto invertido, ganancia en $ y %, aciertos); gastos (más o menos que el período anterior, por categoría); presupuestos; gastos útiles vs inútiles (marcados con pulgar arriba/abajo); resultado de Pasivo − Activos líquidos (bonos o fondo de emergencia, cuentas como Ualá, deudas a favor); **tasa de ahorro** (% del ingreso que se ahorra); **meses de cobertura del fondo de emergencia** (liquidez ÷ gasto mensual); **% de gasto marcado como inútil**; **cumplimiento de presupuesto en %**.
- [ ] **KPIs de Conocimiento** (confirmados): hábitos; objetivos; materias finalizadas; horas de estudio por día/semana/mes/etc.; **promedio de notas y finales aprobados**; **racha de días con estudio**; **sesiones Pomodoro**; **% de avance de la carrera**.
- [ ] **KPIs de Salud** (confirmados): solo hábitos en esta versión.
- [ ] **KPIs de Vida:** calendarios de hábitos (estilo definido arriba) y objetivos por categoría.

### Must-Have — Importar principios desde Libros (pedido por Tobías, 2026-11-12)
- [ ] Desde la pestaña Principios, botón "Importar desde Libros": lista los libros del overlay de Libros (`libros.js`, `S.libros.items`) y, al elegir uno, muestra sus notas (ideas, filosofía/lecciones, resumen), frases y "para aplicar".
- [ ] Tobías **marca cuáles** convertir en principio; nada se importa solo. Cada elemento marcado crea un principio en borrador editable con: enunciado = texto de la nota/frase, fuente = "Título — Autor", sección sugerida a partir de la categoría del libro (editable).
- [ ] No se duplica: un elemento ya importado aparece marcado "ya importado" (se guarda el origen `libroId + tipo + id` en el principio) y no se vuelve a crear.
- [ ] Los libros y sus notas no se modifican ni se borran por importar.

### Must-Have — Seguimiento de Foco (tiempo, atención, energía)
Se construye **en este orden, uno por vez**; Tobías decide cuándo pasar al siguiente. Mientras no estén, atención y energía los carga Tobías a mano en el reporte.
- [ ] **1. Cierre nocturno (Etapa B):** pantalla de ~60 segundos al final del día con atención del día (1 a 5), energía del día (1 a 5) y una línea de texto "¿dónde se me fue el tiempo?". Un registro por día, editable ese día.
- [ ] **2. Chequeos durante el día (Etapa C):** 3 avisos push al iPhone por día ("¿qué hiciste en las últimas horas?"). Se responde con un toque en una categoría (estudio, gym, trabajo, pantalla/distracción, social, descanso, otro) más energía de 1 a 5. Horarios configurables. Es muestreo, no cronómetro.
- [ ] **3. Tiempo de pantalla semanal:** Tobías anota una vez por semana el total del reporte de pantalla del iPhone (carga manual; no hay integración automática).
- [ ] **4. Cruce con otros datos (Etapa B):** el reporte de Foco cruza energía y atención contra sueño, entrenamiento y comida, y muestra a qué horas la energía suele ser alta. Si hay pocos días registrados para sacar una conclusión, lo dice en vez de mostrar un patrón.
- [ ] El reporte de Foco combina estos registros con el tiempo y el dinero que ya salen de los datos del Centro.

### Must-Have — Etapa C: Recordatorios
- [ ] Cada principio puede tener un disparo: **por datos** (principal), **por horario**, **diario**, o ninguno (solo consulta).
- [ ] Por datos: reglas sobre datos reales del Centro (ej: "N días sin entrenar", "el patrimonio bajó este mes", "gasto mayor a $X").
- [ ] Por horario: dormir temprano, levantarse temprano, no usar pantallas a cierta hora, apagar luces blancas, etc., con hora configurable por principio.
- [ ] Diarios: principios que se recuerdan una vez al día (ej: "lo más difícil primero", "hacer todos los días aunque sea un poco").
- [ ] **Canal en combinación según tipo:** los de horario por notificación push al iPhone; los de datos y diarios como tarjeta dentro del Centro (visible al abrirlo). Reutilizar el mecanismo de push y `deadlines.js` que ya existe; no duplicar lógica de avisos.
- [ ] Cada aviso muestra el principio, su motivo y el dato que lo disparó (si fue por datos).
- [ ] Se puede silenciar o posponer un aviso sin eliminar el principio.

### Must-Have — Etapa D: Consejero con IA
- [ ] Caja de consulta: Tobías describe una situación y recibe un consejo que **cita los principios aplicables y su motivo**. El consejero responde solo con la biblioteca de principios; si ninguno aplica, lo dice.
- [ ] El consejero tiene acceso a **todos los datos del Centro, incluidas las finanzas** (decisión explícita de Tobías).
- [ ] IA gratuita por defecto (Gemini, ya usado en `tools/radar-job`) con un **interruptor** para pasar a API paga sin reescribir nada.
- [ ] Genera el veredicto de cada reporte (Etapa B).
- [ ] Los principios se envían completos en el prompt (sin base vectorial) mientras la biblioteca sea chica (menos de ~100 principios).

### Nice-to-Have (no requerido para aprobar; propuestos por Claude, a confirmar por Tobías)
- Ninguno por ahora. Los que se propusieron y no se confirmaron están en Out of Scope.

### Out of Scope
- KPIs de Salud más allá de los hábitos (peso, medidas, marcas de gym) en esta versión.
- Importar principios desde foto o archivo dentro de la app (v1).
- KPIs de la sección IA en los reportes: fuera de alcance hasta nuevo aviso (Tobías, 2026-11-12). La sección IA sigue existiendo con hábitos, objetivos y categorías.
- Excluidos por Tobías hasta nuevo aviso (2026-11-12): KPI de Economía "ingresos por fuente"; KPI de Economía "rendimiento de inversiones contra inflación o dólar"; KPI de Conocimiento "libros terminados y páginas"; "revisión de cumplimiento de cada principio (lo cumplí / lo violé)" en el reporte.
- App aparte: todo vive dentro del Centro de Mando.
- Operar o decidir por Tobías: el sistema aconseja y recuerda, no ejecuta acciones.

## Inputs & Outputs
**Entradas:** principios y objetivos cargados por Tobías (o por Claude en la carga inicial); hábitos, finanzas, planner y estudio que ya están en el Centro; texto manual de las revisiones (estancamientos, deterioro, aprendizajes, agradecimientos); consultas al consejero.

**Salidas:** biblioteca navegable; reportes deslizables por período con calendarios y comparaciones coloreadas; veredicto de IA con registro de conformidad; avisos (tarjeta y push); respuestas del consejero con principios citados.

**Forma de los datos (esquema final se define en el diseño de la Etapa A):** principio `{id, enunciado, porque, seccion, haz, noHagas, fuente, tipo(principio|anti), disparo}`; objetivo `{id, texto, horizonte, seccion, categoria, estado, fecha, padreId, principiosIds, habitosIds}`; revisión `{id, periodo, desde, hasta, textos, veredictoIA, conformidad, veredictoManual}`.

## Constraints
- HTML/CSS/JS puro, sin bundler ni framework; scripts clásicos con scope global (reglas del proyecto). No reunir de nuevo el código en un solo archivo: archivos nuevos por etapa, cargados en `index.html` después de `app.js` y antes de `gamemode.js`/`jarvis-*.js`.
- Firestore (`appdata/lifedash_v2`) y sync existente. **No se toca `_fbSave`, `_applyRemoteState`, `loadState`** sin diagnóstico previo (regla crítica del proyecto).
- Al tocar `.js`/`.css`: bumpear `CACHE` en `sw.js` y el `?v=` correspondiente en `index.html`; push a `main` y verificar el deploy de Pages.
- Verificación prioritaria en iPhone (celular) y Windows (compu).
- Casillas siempre chicas y a la derecha, nunca a la izquierda (convención del Centro).
- Métricas honestas: un número que no se puede atribuir al período no se muestra; lo estacional no se compara mes a mes sin avisar; sin vocabulario interno en pantalla.
- IA externa: Gemini gratuito por defecto, con interruptor a API paga. La clave de la API no se guarda en el repo público (rama `main` es pública).
- Reporte semanal existente (verificado): `revision-semanal.js` es un ritual de 4 pasos por semana ISO (lunes-domingo, `S.revisionSemanal[weekKey]`) cuyo paso "números de la semana" está **vacío** a la espera de los informes nuevos. La Etapa B lo **reutiliza**: el reporte semanal alimenta ese paso y se comparte la clave de semana; no se crea un segundo ritual semanal.
- Avisos push (verificado): el cron corre en GitHub Actions cada 5 minutos (puede atrasarse), así que los avisos no salen al minuto exacto. Un tipo nuevo de aviso se agrega como un `kind` nuevo en `deadlines.js` (`collect()`), sin tocar `push-reminders.js`. El payload no tiene botones ni URL, y `notificationclick` en `sw.js` hoy ignora `data.url`: hay que hacerlo abrir la pestaña/sub-pestaña concreta (deep-link) para que tocar el aviso lleve al chequeo o al principio.
- IA (verificado): no hay proxy ni clave en el repo. El consejero usa el mismo mecanismo que JARVIS: clave de Gemini guardada en el navegador de Tobías (`localStorage`, `jarvis_gemini_key`), llamada directa desde el cliente; se carga una vez por dispositivo. Sin Worker nuevo.

## Edge Cases
- **Período anterior sin datos o con 0:** el porcentaje no se calcula; se muestra solo el número absoluto, sin "+∞%".
- **Período en curso (incompleto):** el reporte lo marca como parcial y no compara contra uno completo sin avisar.
- **Patrimonio:** no tiene retiros (mover plata entre cuentas no cambia el patrimonio). Su variación mezcla ahorro/gasto del período con valuación (precios de activos, tipo de cambio). Cuando los datos lo permiten, el reporte separa ambas causas; si no, marca la variación como no atribuible. Un movimiento entre cuentas nunca se muestra como cambio de patrimonio.
- **Estacionalidad:** meses de facultad contra vacaciones no se comparan mes a mes como si fueran equivalentes; se marca o se compara contra el mismo período de otro año.
- **Categoría eliminada con objetivos asignados:** se pide reasignar los objetivos a otra categoría antes de borrarla (o quedan en "Sin categoría"); nunca se borran en silencio.
- **Principio eliminado con vínculos:** se avisa cuántos objetivos o hábitos quedan sin principio y se pide confirmación.
- **Hábito sin registros en el período:** aparece con 0 cumplidos, no desaparece del reporte.
- **Sin internet o falla de la IA:** el consejero muestra el error y la biblioteca y los reportes siguen funcionando; el veredicto queda "pendiente" y se puede regenerar.
- **Límite del plan gratuito de IA:** se informa y se ofrece reintentar; no se inventa una respuesta.
- **Dos dispositivos editan a la vez:** rige el sync existente; el reporte no sobrescribe el texto escrito en el otro dispositivo sin aviso.
- **Recordatorio con la app cerrada:** los de horario salen por push; los de datos se muestran al abrir el Centro.
- **Sin principios cargados:** el consejero lo dice y no aconseja con contenido propio.

## Security
- **Auth y roles:** un solo usuario (Tobías), con el login y las reglas de Firestore que ya usa el Centro. No hay roles ni acceso público.
- **Superficies protegidas:** toda la pestaña y sus datos quedan detrás del login existente. La llamada a la IA se hace desde un lugar que no exponga la clave en el código público (no incrustada en archivos del repo).
- **Límites:** tope de consultas al consejero por día para no agotar la cuota gratuita ni generar costo inesperado en la API paga.
- **Datos sensibles:** los datos financieros y personales **se envían a la IA externa** por decisión explícita de Tobías (acceso total). En el plan gratuito pueden usarse para entrenar modelos; por eso existe el interruptor a API paga. Las claves, y los montos y el patrimonio, no aparecen en logs ni en mensajes de error visibles.

## Definition of Done
**Etapa A**
- [ ] Given la pestaña abierta, when creo un principio con enunciado, por qué, sección y fuente, then aparece en la lista, sobrevive a recargar y se sincroniza en el otro dispositivo.
- [ ] Given un principio, when lo edito o elimino, then el cambio persiste; si tiene vínculos, aparece el aviso con la cantidad afectada.
- [ ] Given las categorías precargadas, when creo, renombro y elimino una, then los objetivos asignados se reasignan o quedan en "Sin categoría" sin perderse.
- [ ] Given un objetivo mensual, when lo vinculo a uno trimestral, a un hábito y a un principio, then la cadena se ve completa y la vista de huecos lista los objetivos sin principio.
- [ ] Given objetivos y hábitos existentes del Centro, when abro la pestaña, then aparecen sin duplicarse ni perderse.
- [ ] Given `grep '?v=' index.html` y `sw.js`, then los archivos nuevos están registrados y el deploy de Pages termina en `success`.

**Etapa B**
- [ ] Given un trimestre con 30 cumplidos de un hábito y el anterior con 20, when abro el reporte, then muestra "+10 / +50%" en verde; con 20 contra 30, "-10 / -33%" en rojo; con 30 contra 30, "0" en azul.
- [ ] Given un período anterior con 0, when se compara, then muestra solo el absoluto sin porcentaje.
- [ ] Given objetivos de la categoría Familia: 3 cumplidos este mes y 2 el anterior, then muestra "+1" en verde, comparado solo con Familia.
- [ ] Given un reporte trimestral, when lo deslizo, then veo una página por sección con los calendarios de los tres meses y las estadísticas de la sección.
- [ ] Given el reporte, when escribo Estancamientos, Deterioro, Aprendizajes y Agradecimientos y lo guardo, then se conserva en el historial y se puede reabrir.
- [ ] Given una fila de Aprendizaje, when convierto la propuesta en principio u objetivo, then se crea con el texto y queda vinculado.
- [ ] Given el veredicto de IA, when aprieto conformidad, then queda registrado con fecha y período; when no coincido, then puedo escribir el mío y se guardan ambos.
- [ ] Given los KPIs de Economía y Conocimiento listados arriba, when abro esas secciones, then cada uno aparece con su valor y comparación, o con "sin datos" si no hay.

**Seguimiento de Foco**
- [ ] Given el cierre nocturno, when cargo atención 4, energía 3 y una línea, then queda un solo registro para ese día y lo veo en el reporte; when lo vuelvo a abrir el mismo día, then edita el existente sin duplicar.
- [ ] Given un chequeo del día, when toco una categoría y una energía, then queda registrado con la hora y suma al reparto de tiempo del reporte.
- [ ] Given menos días registrados que el mínimo definido, when abro el cruce con sueño/entrenamiento/comida, then dice que faltan datos y no muestra un patrón.
- [ ] Given el tiempo de pantalla semanal cargado, when abro el reporte semanal, then aparece junto a la energía y atención de esa semana.

**Etapa C**
- [ ] Given un principio por horario (ej: 23:00), when llega la hora, then recibo push en el iPhone con el principio y su motivo.
- [ ] Given un principio por datos con "3 días sin entrenar", when se cumple la condición, then aparece la tarjeta en el Centro con el dato que la disparó.
- [ ] Given un principio diario, when abro el Centro ese día, then se muestra una vez y se puede marcar como visto.
- [ ] Given un aviso, when lo silencio o pospongo, then no vuelve a aparecer en ese plazo y el principio sigue existiendo.

**Etapa D**
- [ ] Given una situación escrita, when consulto, then la respuesta cita al menos un principio de la biblioteca con su motivo, o dice que ninguno aplica.
- [ ] Given que la IA falla o no hay internet, when consulto, then veo el error y el resto de la pestaña sigue funcionando.
- [ ] Given el interruptor a API paga, when lo activo, then el consejero funciona sin cambios de código.
- [ ] Given la clave de la IA, when reviso el repo y el sitio publicado, then no aparece en ningún archivo público.

## Open Questions
- **Foco (sección 1 del reporte):** decidido el rumbo (ver "Seguimiento de Foco", 4 puntos en orden). Queda por definir con Tobías antes de la Etapa B: cuántos días mínimos de registro hacen falta para mostrar un cruce, y la lista de categorías de los chequeos del día.
- **KPIs de Vida más allá de hábitos y objetivos:** a confirmar si hay otros.
- **Contenido a cargar:** principios (textos, fotos, archivos, autores) y objetivos de largo plazo, pendientes de entrega por Tobías; no bloquean el inicio de la Etapa A.
- **Profundidad por período:** qué secciones se muestran en el reporte semanal frente al anual (se asume el mismo molde; a confirmar).
- **Lista final de principios por horario** y sus horas exactas.
