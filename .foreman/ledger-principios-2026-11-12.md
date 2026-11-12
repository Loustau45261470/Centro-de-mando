# Ledger — Principios y Revisiones, Etapa A (2026-11-12)

- **Baseline commit:** fa67924 (main). Árbol ya tenía cambios ajenos sin commitear (skills-lock.json, tools/radar-job/*) — NO tocar ni commitear.
- **Spec:** specs/principios-y-revisiones.md (sin commitear). Alcance de esta corrida: SOLO Etapa A.
- **Plan:** 1) build `centro-de-mando-expert` (sonnet) → 2) review `vanilla-web-reviewer` (opus) → 3) verificación ciega `verificador` (sonnet) → 4) commit/push + verificar deploy Pages.
- **Ruteo:** LEAD no implementa. Builder no commitea; commit lo hace el LEAD tras PASS.
- **Attempts:** (append-only)
  - Etapa A: build → review (5 hallazgos, 1 fix-ticket) → verificación ciega PASS_WITH_NOTES → commit 98055bf. Deploy Pages OK.
  - Seguimiento de Foco (pedido 2026-11-12: "construí los 4 puntos"): Ticket F1 = puntos 1+3+4 (client-side, foco.js); Ticket F2 = punto 2 (chequeos push). En serie. Mínimos del cruce: 10 días con registro y ≥3 días por grupo.
- **Decisiones:** KPIs de IA y varios nice-to-have fuera de alcance (ver spec). Recordar a Tobías lo de Foco (atención/energía) antes de la Etapa B.
