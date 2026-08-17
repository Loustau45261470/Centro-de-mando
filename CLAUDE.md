# Centro de Mando — Instrucciones del proyecto

## Índice
**Cómo está armado** → Estructura de archivos · Stack · Datos
**Reglas de deploy** → Regla obligatoria: push automático · Repositorio · Hosting
**Cómo trabajar acá** → Lectura de archivos grandes · Disciplina de trabajo
**Cuidado con datos/sync** → Regla crítica: bugs de sync/datos (DIAGNÓSTICO PRIMERO) · Registro witness de fixes (`fixes.json`)
**Fuera del repo** → Segundo cerebro (vault Obsidian)

## Estructura de archivos (reestructurado: ya NO es un solo archivo)
El monolito `index.html` se separó en varios archivos para aligerarlo. NO volver a unirlos.
- `index.html` — solo el HTML (markup de las pestañas, modales, nav). Carga todo lo demás por `<link>`/`<script src>`.
- `styles.css` — todo el CSS.
- `app.js` — núcleo (estado `S`, `loadState`/`saveState`, sync Firestore, utils UI transversales, modales de edición, planner, goals, dieta (tracker de comida sana), chart helpers, bienestar, logros, boot).
- `rutinas.js`, `habitos.js`, `abogacia.js`, `workspace.js`, `finanzas.js`, `recordatorios.js`, `objetivos.js` — secciones extraídas de `app.js` (2026-07-19, dos rondas, movimiento byte-idéntico verificado por multiset de líneas): gym/entrenamiento, hábitos, ley/derecho, Proyectos/Notion, finanzas (tab+gastos+presupuesto+transacciones), recordatorios+notificaciones y objetivos trimestrales. Se cargan en `index.html` inmediatamente después de `app.js` y ANTES de `gamemode.js`/`jarvis-*.js` — **no cambiar ese orden** (scripts clásicos con scope global compartido; `_initApp()` corre post-login así que todo está definido a tiempo).
- `deadlines.js` — fuente ÚNICA de todo lo que tiene fecha (recordatorios, proyectos con `dueDate`, finales, cursada, metas con hora, actividades del planner incl. recurrentes, proyecciones, suscripciones, pedidos) y de cuándo avisa cada uno. Es un archivo puro (sin DOM, sin `S` global): lo carga el navegador como script clásico (`window.CMDeadlines`) **y** lo hace `require()` el cron `push-reminders.js` en Node. Al agregar una entidad con fecha, se registra acá y aparece sola en la card de Recordatorios, en el ticker y en el push — no duplicar la lógica en la sección.
- `jarvis-*.js` — módulos de JARVIS: `jarvis-voice.js` (TTS/ElevenLabs), `jarvis-ears.js` (reconocimiento de voz), `jarvis-brain.js`, `jarvis-intel.js`, `jarvis-neural-fx.js`, `jarvis-agent.js`, `jarvis-core-stats.js`.
- `login.js`, `theme-switcher.js`, `telemetry.js`, `command-palette.js`, `hud-ambient.js` — features sueltas.
- `sw.js` — service worker (PWA). Su `SHELL` lista todos los archivos; al cambiar cualquier `.js`/`.css` hay que **bumpear `const CACHE`** (cache-first) para que el cambio llegue a los dispositivos.
- `cf-worker/` — Cloudflare Worker aparte (Durable Object Alarm) que manda el push de Pomodoro/descanso de gym en el segundo exacto, aunque la pestaña esté de fondo. Deploy independiente del sitio (`cf-worker/README.md`), no lo empaqueta `sw.js`. Cliente en `app.js` (`_schedulePushAlarm`/`_cancelPushAlarm`), usado desde `pomodoro.js` y `rutinas.js`.

Todos los `<script>` son clásicos (no módulos) → las funciones/vars top-level son globales y se comparten entre archivos.

## Regla obligatoria: push automático
Después de CADA cambio en el código, sin excepción y sin que el usuario lo pida:
1. `git add <archivos modificados>` (el/los archivos que tocaste: `app.js`, `styles.css`, `jarvis-*.js`, `index.html`, `sw.js`…)
2. `git commit -m "descripción breve del cambio"`
3. `git push origin main`

Esto dispara el deploy automático en GitHub Pages. No preguntar, no esperar confirmación — hacerlo siempre al terminar.
Si tocaste un `.js` o `.css`, **bumpear también `const CACHE` en `sw.js`** y commitearlo.

**Y bumpear el `?v=` de ese archivo en `index.html`.** Varios assets se piden versionados (`styles.css?v=`, `workspace.js?v=`, `proyectos-overlay.js?v=`, `proyectos-overlay.css?v=`, `app.js?v=`). Mientras ese número no cambia, la URL no cambia y **ningún navegador vuelve a bajar el archivo**, por más que se bumpee `CACHE` en `sw.js` — el SW cachea `styles.css` (sin query) y la página pide `styles.css?v=153`, que son claves distintas. Editar uno de esos archivos sin tocar su `?v=` deja a los dispositivos con la copia vieja (pasó el 2026-08-12: HTML nuevo + CSS viejo → la pantalla de login sin estilos). Chequeo: `grep -n '?v=' index.html` antes de commitear.

**Verificación obligatoria post-push:** el `git push` exitoso NO significa que el sitio esté actualizado — el deploy de GitHub Pages es un workflow separado (Actions) que puede fallar (ha pasado más de una vez, ej. "Deployment failed, try again later" transitorio de infra de GitHub). Antes de confirmarle al usuario que el cambio está listo/en producción:
1. `gh run list --limit 3` para ver el run de "pages build and deployment" disparado por el push.
2. Esperar a que termine (`gh run view <id> --json status,conclusion`) y confirmar `conclusion: success`.
3. Si falla, `gh run rerun <id>` y volver a verificar antes de avisar al usuario.
Nunca dar el cambio por "desplegado" solo porque el `git push` no dio error.

## Repositorio
https://github.com/Loustau45261470/Centro-de-mando.git
Rama: main (público)

## Hosting
GitHub Pages — deploy automático en cada push a main.
URL: https://loustau45261470.github.io/Centro-de-mando/

## Stack
- HTML/CSS/JS puro, sin bundler ni framework
- Firebase (Firestore) para sincronización de datos entre dispositivos
- Chart.js para gráficos
- SortableJS para drag & drop
- GitHub Pages para hosting

## Datos
Los datos del usuario viven en Firebase Firestore (colección `appdata`, documento `lifedash_v2`).
No están en el archivo HTML — no se suben a GitHub ni a GitHub Pages.

## Lectura de archivos grandes (app.js, styles.css)
Nunca leer el archivo completo. Siempre:
1. `Grep` para ubicar el símbolo o la línea (y para saber EN QUÉ archivo está)
2. `Read` con `offset` + `limit` para leer solo la sección relevante

## Disciplina de trabajo
- Piensa antes de actuar. Lee los archivos relevantes antes de escribir código.
- Edita solo lo que cambia; no reescribas archivos enteros.
- No releas archivos que ya hayas leído salvo que hayan cambiado.
- No repitas código sin cambios en las respuestas.
- Sin preámbulos ni resúmenes al final; no expliques lo obvio.
- Testea el comportamiento antes de dar una tarea por terminada.

## Regla crítica: bugs de sync/datos — DIAGNÓSTICO PRIMERO

El sistema de sync (Firestore ↔ localStorage ↔ múltiples dispositivos) es complejo. Ante cualquier problema de sincronización o pérdida de datos:

1. **No tocar `_fbSave`, `_applyRemoteState`, `loadState` ni ninguna lógica de sync sin primero agregar visibilidad** (panel de diagnóstico en UI, toasts con info de estado, etc.) y confirmar qué path está tomando el código.
2. **Un cambio a la vez.** Commitear y esperar confirmación del usuario de que el comportamiento cambió antes de hacer el siguiente cambio de lógica.
3. **No encadenar fixes.** Si el primer fix no resolvió el problema, volver al paso 1 (más diagnóstico), no proponer otro fix distinto.
4. **No reemplazar sistemas enteros** (ej: "cambio todo el sistema de sync") sin entender qué parte puntual falla. Siempre fix quirúrgico.

### Arquitectura de sync actual (no cambiar sin entender esto)
- `loadState()`: lee de Firestore al arrancar. Si falla → localStorage. Setea `_lastSyncedSavedAt`.
- `saveState()`: guarda en localStorage + llama `_fbSave()` (debounce 2s).
- `_fbSave()`: si `_lastSyncedSavedAt !== null` (sesión confirmada) → escribe local directo. Si es null (cargó de localStorage) → rescue desde cloud + guarda.
- `_fbSaveInProgress`: flag que bloquea `onSnapshot` y `_syncOnFocus` mientras hay un write en vuelo. **No eliminar.**
- `onSnapshot`: listener real-time. Solo aplica si no hay write en vuelo.
- `snap_<timestamp>`: snapshots post-write (últimos 20) para recuperación. `listarSnaps()` / `restaurarSnap()` en consola.

## Registro witness de fixes (`fixes.json`)
Registro anti-regresión de bugs resueltos (adaptado del plugin witness de ruflo, sin criptografía). Cada entrada: `{id, fecha, desc, file, marker}` — `marker` es una substring distintiva que debe seguir presente en `file` mientras el fix siga vivo.
- **Al resolver un bug no trivial** (especialmente de sync/datos): agregar su entrada a `fixes.json` en el mismo commit del fix.
- **Antes de diagnosticar un bug "que ya habíamos arreglado"** y en cada verificación post-cambio: `grep` de cada `marker` en su `file`. Marker ausente = el fix probablemente se revirtió — esa es la primera hipótesis a investigar, no un bug nuevo.
- `fixes.json` no es parte del shell de la PWA (no agregarlo a `sw.js`).

## Segundo cerebro (vault Obsidian personal — carpeta separada, fuera de cualquier repo)
El vault Obsidian de Tobías vive en `C:\Users\Tobias\Desktop\Claude\Vault\` (root: `context/`, `inbox/`, `conocimiento/`, `proyectos/`, `plantillas/`, `.obsidian/`, `_CLAUDE.md`, `Inicio.md`, `Como-usar-esto.md`), separado de `Proyectos/` (código) para que Obsidian no mezcle notas con node_modules/binarios. `OBSIDIAN_VAULT_PATH` apunta a `Vault/`; el hook `load_vault_context` solo inyecta el manual cuando el cwd de la sesión está bajo `Vault/` (NO se dispara automáticamente al trabajar en `Proyectos/`).
- Al trabajar con notas, leer primero `context/perfil.md` y `context/objetivos.md` (rutas: `Vault/context/...`).
- Todo material nuevo que Tobías comparta → convertirlo en nota (moldes en `plantillas/`), enlazarla con `[[enlaces]]` y guardarla en la carpeta correcta; ideas rápidas van a `inbox/` y "ordená el inbox" las clasifica.
- Formato Obsidian: markdown, `[[enlaces]]`, frontmatter, etiquetas `#idea #pendiente #importante #recurso #aprendizaje`. Toda nota de `conocimiento/` se enlaza en `conocimiento/Indice.md`.
- Tono: reflexivo para dudas y planteamientos (estudio, decisiones, ideas en formación); directo y conciso para lo técnico/operativo.

### Ruteo de modelo (economía de cuota Fable)
- **Anotar/capturar una idea rápida en `inbox/`** (tarea mecánica, sin criterio) → delegar a sub-agente `general-purpose` con `model: haiku`.
- **"Ordená el inbox"** (clasificar, elegir carpeta, enlazar con `[[...]]`, decidir plantilla) → delegar a sub-agente `general-purpose` con `model: sonnet`.
- El modelo principal de la sesión (Fable/Sonnet/lo que esté activo vía `/model`) nunca ejecuta estas dos tareas inline — siempre delega, sin pedir confirmación.
