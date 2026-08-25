# Spec: Mapa de Ideas

## Objective
Overlay nuevo dentro de Centro de Mando donde Tobías captura, en texto plano, sus opiniones, valores, teorías que apoya y puntos de vista sobre cualquier tema. Las notas se conectan entre sí — a mano con `[[enlaces]]` y automáticamente por similitud semántica sugerida por IA — formando un grafo navegable de su propio pensamiento. Reemplaza, para este uso específico, la función que hoy cumpliría el vault de Obsidian (que sigue existiendo para lo técnico/de proyectos, no para esto). Se integra con Jarvis para que pueda responder preguntas citando las propias ideas guardadas del usuario en vez de dar una respuesta genérica.

## Requirements

### Must-Have
- [ ] Notas en texto plano (no archivos): documento Firestore con `id`, `texto`, `tags[]`, `creado`, `editado`.
- [ ] Captura rápida: botón flotante "nueva idea" con textarea + tags, guardado en menos de 10 segundos de fricción.
- [ ] Vista lista/buscador de texto plano con búsqueda full-text client-side.
- [ ] Enlaces manuales `[[algo]]` dentro del texto, resueltos por ID de nota (no por título) — renombrar una nota no rompe los links que apuntan a ella. Autocompletado al tipear `[[`.
- [ ] Al borrar una nota, cualquier `[[link]]` que apuntaba a ella se limpia solo del texto de las notas que la referenciaban — sin dejar rastro ni marcador de "nota eliminada".
- [ ] Embeddings automáticos: cada nota se vectoriza con Voyage AI al guardar/editar.
- [ ] Sugerencias de conexión automática: al guardar una nota, buscar las N notas semánticamente más cercanas y mostrarlas como sugerencias de link — nunca auto-conectar sin confirmación.
- [ ] Aprendizaje del criterio de conexión: cada aceptación/rechazo de sugerencia queda en un log; los últimos 20-30 se pasan como few-shot al modelo para ajustar futuras sugerencias al criterio personal de Tobías.
- [ ] Vista de grafo: nodos = notas, aristas = links (manuales + sugeridos aceptados), navegable (click en nodo abre la nota), librería liviana (vis-network o d3-force), sin backend extra.
- [ ] Detector de contradicciones: al guardar una nota nueva, comparar por similitud semántica contra notas existentes y avisar (no bloquear) si detecta una postura contradictoria.
- [ ] "Idea del día": sugerencia pasiva y no invasiva de una nota huérfana o poco conectada, para revisar o enlazar.
- [ ] Tool nueva en Jarvis (`jarvis-agent.js`, array `TOOLS`): `consultar_mapa_ideas(pregunta)` — busca por embedding sobre las notas guardadas y devuelve las más relevantes como contexto para que Jarvis responda citando las ideas reales del usuario.
- [ ] "Modo debate" (PILOTO): Jarvis argumenta en contra de una postura guardada, usando las propias notas/valores del usuario como restricción del argumento.
- [ ] Toggle ON/OFF visible y persistente para "Modo debate", claramente distinguible del resto de la UI — se puede desactivar por completo en cualquier momento, por defecto puede quedar OFF hasta validarlo.
- [ ] Módulo nuevo `mapa-ideas.js`, cargado como script clásico en `index.html` en el mismo bloque que `rutinas.js`/`habitos.js`/etc. (antes de `gamemode.js`/`jarvis-*.js`).
- [ ] `sw.js`: agregar `mapa-ideas.js` al `SHELL` y bumpear `CACHE`. `index.html`: bumpear `?v=` de los assets tocados.
- [ ] API key de Voyage AI guardada en `C:\Users\Tobias\.secrets\cdm-api-keys.json`, mismo patrón que las demás keys del proyecto — nunca hardcodeada ni subida al repo.

### Nice-to-Have (not required to pass review)
- Exportar una nota o el grafo completo a algún formato compartible.
- Filtro del grafo por tag o por rango de fechas.
- Buscar/filtrar notas contradictorias detectadas históricamente en un solo lugar.

### Out of Scope
- Migración del contenido existente del vault Obsidian (`Vault/conocimiento/`) — Mapa de Ideas arranca vacío.
- Edición de las notas desde Obsidian o cualquier sincronización bidireccional con el vault.
- Cualquier función de "Modo debate" más allá del piloto con toggle (por ejemplo, debates programados o multi-turno automáticos) hasta validar el piloto.

## Inputs & Outputs
- **Input humano:** texto libre de la nota, tags opcionales, aceptar/rechazar sugerencias de conexión, preguntas habladas/escritas a Jarvis.
- **Input de sistema:** embeddings generados por Voyage AI a partir del texto de cada nota.
- **Output:** notas renderizadas en lista y en grafo, sugerencias de conexión, avisos de contradicción, la "idea del día", respuestas de Jarvis que citan notas concretas (con referencia a cuál), argumentos del modo debate.
- **Formato de datos:** documentos Firestore (mismo proyecto/colección que ya usa Centro de Mando), vectores de embedding almacenados junto a cada nota o en un índice paralelo por nota.

## Constraints
- Sin bundler: todo HTML/CSS/JS puro, scripts clásicos con scope global compartido (arquitectura ya establecida del proyecto).
- Firebase/Firestore como única fuente de datos — nada en localStorage salvo como cache del patrón ya existente en `app.js`.
- GitHub Pages como hosting — cualquier llamada a Voyage AI/Jarvis se hace client-side, igual que ya hace `jarvis-agent.js` con Anthropic/Groq.
- Voyage AI: usar el tier gratuito; no se prevé necesidad de plan pago para uso personal.
- La estética es prioridad alta: en fase de build corresponde el pipeline `design-master` (dirección visual + estilo + implementación + crítica + accesibilidad), no CSS suelto — anotado para esa fase, no para esta spec.
- Debe respetar el flujo de sync existente (`_fbSave`, `_applyRemoteState`, `loadState`) sin tocar esa lógica core; Mapa de Ideas agrega su propia porción de estado dentro del mismo documento/patrón, no un sistema de sync paralelo.

## Edge Cases
- Nota sin ningún link ni tag: válida igual, aparece como huérfana y es candidata a "idea del día".
- Se borra una nota con links entrantes: los `[[links]]` en las notas que la referenciaban se limpian automáticamente del texto, sin dejar marcador.
- Voyage AI no responde o falla la llamada (sin conexión, rate limit): la nota se guarda igual en texto plano; el embedding y las sugerencias de conexión quedan pendientes para reintentar en el próximo guardado o edición.
- Dos notas casi idénticas semánticamente: se sugiere la conexión igual que cualquier otra; no hay deduplicación automática de notas (el usuario decide si fusiona a mano).
- Contradicción detectada sobre una nota vieja que el usuario ya revisó y descartó antes: el aviso puede volver a aparecer (no hay estado de "contradicción ya vista/descartada" en v1) — queda anotado como posible fricción a observar tras el piloto.
- Modo debate desactivado (toggle OFF): la tool/función correspondiente no se ofrece a Jarvis en absoluto, ni aparece en la UI más que el propio switch.
- Grafo con muchas notas (cientos+): debe seguir siendo navegable sin trabarse — layout con librería liviana pensada para esto, sin requerir paginación en v1.

## Definition of Done
- [ ] Given que el usuario toca el botón flotante, when escribe una idea y guarda, then la nota queda persistida en Firestore en menos de 10 segundos de interacción y aparece en la lista.
- [ ] Given una nota con `[[texto]]` que coincide con otra nota existente, when se guarda, then el link se resuelve al ID correcto y es clickeable.
- [ ] Given dos notas semánticamente relacionadas, when se guarda la segunda, then aparece como sugerencia de conexión (no se autoconecta).
- [ ] Given que el usuario acepta/rechaza varias sugerencias, when guarda una nota nueva, then las sugerencias futuras reflejan ese patrón de aceptación (verificable comparando antes/después de 20+ decisiones).
- [ ] Given el grafo de notas, when el usuario lo abre, then puede ver los nodos, hacer click en uno y llegar a la nota correspondiente.
- [ ] Given una nota borrada con links entrantes, when se recarga la nota que la referenciaba, then el `[[link]]` ya no aparece en su texto.
- [ ] Given una pregunta hablada/escrita a Jarvis sobre un tema que solo existe en Mapa de Ideas, when Jarvis responde, then la respuesta cita contenido real de una nota guardada (verificable comparando contra el texto de la nota).
- [ ] Given el toggle de Modo debate en OFF, when el usuario le pide a Jarvis que debata una postura, then Jarvis no ejecuta el modo debate (responde que está desactivado o simplemente no tiene la capacidad disponible).
- [ ] Given el toggle de Modo debate en ON, when se le pide debatir una postura guardada, then Jarvis argumenta en contra usando las notas del usuario como referencia.
- [ ] Given que se agrega `mapa-ideas.js` al proyecto, when se despliega, then `sw.js` tiene el archivo en `SHELL` con `CACHE` bumpeado y `index.html` tiene el `?v=` actualizado.
