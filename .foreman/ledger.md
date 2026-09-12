# Ledger — 12 features (pedido 2026-09-11)

baseline commit: 2e2616c
Objetivo: las 12 ideas aprobadas (1a,1b,1c / 2d,2e,2f,2g,2h,2j / 3k,3l,3m) implementadas,
desplegadas en GitHub Pages y verificadas.

## Ruteo de seats
- LEAD (opus): plan, cableado de index.html/sw.js/?v=, T8 y T9 (tocan app.js), review, commits.
- WORKHORSE (sonnet, foreman-worker): T1-T7, T10-T12.

## Write sets (disjuntos por ola)
| T | Feature | Write set | Estado |
|---|---|---|---|
| T1 | (c) caja negra de errores | NEW errores.js | pendiente |
| T2 | (f) motor de correlaciones | NEW correlaciones.js | pendiente |
| T3 | (h) revisión semanal | NEW revision-semanal.js | pendiente |
| T4 | (d) atajos + share target | manifest.json, NEW share-target.js | pendiente |
| T5 | (l) búsqueda global | command-palette.js, NEW busqueda-global.js | pendiente |
| T6 | (k) deshacer global | NEW undo.js + call sites finanzas.js/habitos.js | pendiente |
| T7 | (g) proyección fin de mes | NEW proyeccion-mes.js | pendiente |
| T8 | (m) quién escribió último | telemetry.js + app.js (_onWriteOk) | pendiente |
| T9 | (a) archivado auto + guard 1MiB | NEW archivo.js + app.js (guard) | pendiente |
| T10 | (b) harness Playwright | NEW tests/, package.json, workflow | pendiente |
| T11 | (e) gasto por voz + foto | jarvis-agent.js + NEW gasto-foto.js | pendiente |
| T12 | (j) cartera en vivo | cf-worker/src/index.js + cartera-inversion.js | pendiente |

## Decisiones
- D1: (a) NO se hace como sharding en subcolecciones (reescribiría loadState/_fbDoSave —
  prohibido por CLAUDE.md del proyecto y sin tests que lo respalden). Se hace extendiendo
  el `archivarAno()` que YA existe (app.js:761) + guard de tamaño. Mismo objetivo, quirúrgico.
- D2: (j) queda sin deploy — requiere credencial IOL del usuario como secret del Worker.
  Se entrega el código + fallback al JSON estático actual.

## Attempts (append-only)

### Ola 1 (despachada)
- T1 errores.js — DONE. Se auto-monta en tab IA. Expone renderErroresCard().
- T4 manifest+share-target — DONE. Pide: script tag + llamada a aplicarAccionPendiente() al final de _initApp, y share-target.js en el SHELL de sw.js.
- T2 correlaciones / T3 revision-semanal / T10 tests — en curso.

### LEAD (hecho, sin delegar: tocan app.js)
- T8 (m) atribución de dispositivo — DONE.
  · app.js: _devInfo()/_devNombreAuto()/nombrarDispositivo()/_registrarEscritura() tras _DOC (l.266)
  · app.js: campo _dev agregado al set() del write (l.~642). Va FUERA de `state`: no entra
    al merge 3-vías ni cuenta contra el límite del documento.
  · app.js: bookkeeping en onSnapshot y _syncOnFocus — no altera ninguna branch de decisión.
  · telemetry.js: #tk-dev en el ticker, solo visible si la última escritura fue de OTRO device.
- T9 (a) archivado + guard — DONE.
  · NUEVO archivo.js → window.CMArchivo + window.espacio() en consola.
    Orden de seguridad: escribir archivo → RELEER y verificar completitud → recién ahí podar S.
    Lo archivado NUNCA vuelve a S (si volviera, la próxima escritura re-infla el documento).
  · app.js: guard duro en _fbDoSave — si el estado supera 1.000.000 bytes NO se escribe;
    queda pendiente en localStorage + aviso en pantalla + banner para archivar.
    forzarGuardado() lo saltea (borrados grandes legítimos).
  · app.js: el archivarAno() viejo queda, con nota de que CMArchivo lo supera.

### Ola 2 (despachada)
- T5 búsqueda global, T6 deshacer, T7 proyección, T11 gasto voz/foto, T12 cartera en vivo.

### Resultados ola 1-2
- T2 correlaciones.js — DONE. Auto-monta en tab Vida. renderCorrelacionesCard(). NO reusó los
  extractores de informes-datos.js: son agregados por rango y están encerrados en su IIFE;
  necesitaba valor día a día. Pearson validado a mano (r=0.8 en caso conocido).
- T6 undo.js — DONE. 5 puntos de enganche (transacción, suscripción, deseo, gasto fijo, hábito),
  todos restaurando por índice con splice. "Pedidos" NO se enganchó: S.orders existe en el schema
  pero no hay función de alta ni de borrado en toda la base — no hay borrado que capturar. Correcto.
- T12 — NEEDS_CONTEXT y tenía razón: mi ticket apuntaba a cartera-inversion.js/latest.json (análisis
  mensual con razonamiento generado, no reproducible desde una API). El objetivo real es
  tenencias.js/tenencias.json (posiciones semanales, forma 1:1 con el portafolio de IOL).
  Ticket corregido y reenviado al MISMO seat (regla: ticket malo → arreglar ticket, no subir seat).

## CIERRE — 2026-09-11
Los 12 entregados, pusheados (2e2616c..615b4c6, 6 commits) y verificados en produccion.

Gates corridos:
- Suite Playwright: 34/34 local (3 corridas seguidas) + verde en GitHub Actions real.
- Markers de fixes.json: 31/31 vivos intactos + 2 entradas nuevas (33 total).
- pages build and deployment: success. sw.js v292 y los 9 modulos sirviendo 200 en produccion.

Revisiones y que encontraron:
- vanilla-web-reviewer: 3 hallazgos (2 ALTA de integridad de datos, 1 MEDIA de UX). Todos corregidos.
- security-reviewer: 1 ALTA (XSS con dos fuentes nuevas introducidas por este lote), corregida.
  Ataco la verificacion del ID token de /cartera sin poder pasarla.
- verificador (ciego): PASS_WITH_NOTES, 1 FAIL en correlaciones (cache sin invalidacion).
  Corregido + test de regresion permanente.

Errores del LEAD en esta corrida (para no repetir):
1. Ticket T12 mal escrito: apuntaba a cartera-inversion.js/latest.json (analisis mensual con
   razonamiento generado) cuando el objetivo real era tenencias.js/tenencias.json. El worker
   freno bien con NEEDS_CONTEXT. Leccion: verificar QUE archivo es el objetivo antes de despachar.
2. Me olvide de bumpear el ?v= de app.js/finanzas.js/habitos.js/tenencias.js en el primer lote.
   Detectado antes del push. Es la regla del CLAUDE.md que ya habia fallado en agosto.
3. El arbol cambio a mitad de la verificacion ciega (commit 1936fa9). El verificador lo marco
   como hallazgo de proceso y tiene razon: las correcciones deberian haber esperado su veredicto.

Pendiente para Tobias (no bloqueante):
- Desplegar el Worker con sus credenciales para activar la cartera en vivo (comandos en cf-worker/README.md).
- Decidir sobre _PUSH_WORKER_SECRET hardcodeado en app.js:371 (preexistente, repo publico).
- Sinks XSS preexistentes sin escapar en finanzas.js:112,342,1274,1293 (solo texto propio, riesgo bajo).
