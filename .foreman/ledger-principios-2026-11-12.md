# Ledger — Principios y Revisiones, Etapa A (2026-11-12)

- **Baseline commit:** fa67924 (main). Árbol ya tenía cambios ajenos sin commitear (skills-lock.json, tools/radar-job/*) — NO tocar ni commitear.
- **Spec:** specs/principios-y-revisiones.md (sin commitear). Alcance de esta corrida: SOLO Etapa A.
- **Plan:** 1) build `centro-de-mando-expert` (sonnet) → 2) review `vanilla-web-reviewer` (opus) → 3) verificación ciega `verificador` (sonnet) → 4) commit/push + verificar deploy Pages.
- **Ruteo:** LEAD no implementa. Builder no commitea; commit lo hace el LEAD tras PASS.
- **Attempts:** (append-only)
  - Etapa A: build → review (5 hallazgos, 1 fix-ticket) → verificación ciega PASS_WITH_NOTES → commit 98055bf. Deploy Pages OK.
  - Seguimiento de Foco (pedido 2026-11-12: "construí los 4 puntos"): Ticket F1 = puntos 1+3+4 (client-side, foco.js); Ticket F2 = punto 2 (chequeos push). En serie. Mínimos del cruce: 10 días con registro y ≥3 días por grupo.
  - Hechos y en producción (2026-11-12/13): Foco 1/3/4 (69f8e78), secreto del Worker eliminado (786bd94, 741158e, 8ead179), Libros (2192b55), Etapa B T1 (4190798), chequeos push (074730e), Principios como ventana + cierre automático (695d6a8), avisos multi-dispositivo (5a27237), KPIs T2a (9d7e943).
  - EN CURSO (00:xx del 13/11): T2b pantalla de Reportes — fix del FAIL de verificación (test con carrera de scroll, anual 390px, leyenda, nombres de categorías) lanzado; falta: verificación ciega → commit.

## Estado y plan restante (para retomar sin el usuario)
Tobías se fue a dormir (2026-11-13 ~00:30) y pidió seguir SIN preguntas; si se corta por cuota, retomar a las 2:01. Orden:
1. T2b Reportes: terminar (verificación ciega completa con --retries=0 → commit/push/deploy).
2. T3: textos del reporte (Estancamientos/Deterioro por sección, Aprendizajes error→aprendizaje→propuesta con "convertir en principio/objetivo" sin duplicar, Agradecimientos), veredicto (lugar de IA en estado "pendiente" + veredicto manual + conformidad deshabilitada hasta que haya texto de IA), historial en `S.reportes.items` (se crea solo al escribir; `editadoEn` con aviso si cambió en otro dispositivo).
3. T4: enganche con revision-semanal.js (paso "números de la semana" muestra el resumen semanal de CMReportes + botón "Ver reporte completo"; no cambiar la forma de S.revisionSemanal).
4. Etapa C: recordatorios de principios (disparo por datos = tarjeta en el Centro; por horario = push vía deadlines.js con url; diario = tarjeta 1 vez por día; silenciar/posponer).
5. Etapa D: consejero IA (Gemini con clave en localStorage `jarvis_gemini_key`, mismo mecanismo que JARVIS; si falta la clave, la UI pide pegarla; interruptor a API paga; cita principios; acceso a todos los datos por decisión del usuario; límite diario de consultas; genera el veredicto del reporte).
Al terminar: resumen redactado por sub-agente sonnet (≤300 palabras, sin jerga) y memoria actualizada.

- **Decisiones:** KPIs de IA y varios nice-to-have fuera de alcance (ver spec). Recordar a Tobías lo de Foco (atención/energía) antes de la Etapa B.
