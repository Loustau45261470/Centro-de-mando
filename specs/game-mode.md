# Spec: Game Mode — Pestaña de gamificación del Centro de Mando

## Objective

Nueva pestaña ("Game Mode", en el lugar del ícono del trofeo) que convierte el Centro de Mando en un RPG personal: 6 stats, niveles, XP, misiones, rachas como buffs, logros y comparativa histórica. Es **100% una capa de lectura** sobre los datos que ya existen en Firestore (hábitos, gym, materias, finanzas, objetivos trimestrales) más una micro-sección de input manual para 2 stats que hoy no existen. Para Tobías: ver su progreso vital de un vistazo (sesión de 10–60s), motivado y sin fricción de input. **No modifica ninguna funcionalidad existente del Centro de Mando.**

## Requirements

### Must-Have

**Principios no negociables**
- [ ] Cero fricción de input nuevo, salvo la micro-sección manual de Espíritu y Vínculos (única excepción justificada)
- [ ] No-destructivo: Game Mode nunca escribe ni modifica las colecciones existentes; toda su data vive aislada en `appdata/playerstate`
- [ ] Tono motivador, nunca punitivo (romper racha = mensaje neutro-motivador, jamás culpa)
- [ ] Coherencia visual: reutiliza variables CSS del theme switcher, tipografía y Chart.js ya configurados — no es una skin pegada
- [ ] HUD principal se entiende sin scroll; la profundidad (scroll/clicks) es siempre opcional

**Las 6 stats con sus fuentes de XP** (tabla completa en sección Inputs & Outputs)
- [ ] 💪 Cuerpo ← tab Salud (gym/box/jiujitsu, sueño, hábitos de salud)
- [ ] 🧠 Mente ← tab Conocimiento (materias done, días de estudio, milestones a tiempo)
- [ ] 🙏 Espíritu ← input manual (misa/oración, lectura espiritual, reflexión semanal)
- [ ] 💰 Riqueza ← tab Finanzas (hábitos financieros, gastos fijos a tiempo, snapshot patrimonio)
- [ ] ⚙️ Creación ← tab IA + Proyectos (avance de proyecto, proyecto shippeado, hábito IA)
- [ ] ❤️ Vínculos ← input manual (novia, padres, gatitas)

**Mecánicas**
- [ ] Curva de nivel: `XP_para_nivel(n) = 100 * n^1.5`
- [ ] Nivel General = `round(promedio ponderado de los 6 niveles)`, ponderación default equitativa (1/6 c/u), configurable en `config`
- [ ] Título dinámico según stat dominante (ver tabla en Inputs & Outputs); "El Equilibrado" si ninguna domina >20% sobre el resto
- [ ] Misiones diarias auto-generadas desde Goals diarios + no-negociables (reset 00:00); 100% → +25 XP + contador "Día Perfecto"
- [ ] Misiones semanales (3–5 fijas configurables, reset lunes 00:00); todas → +100 XP
- [ ] Misiones épicas = Quarterly Objectives reskineados con barra real vs esperado; cumplido al cierre → +500 XP + logro Legendario
- [ ] Streaks → Buffs visuales con fuego escalado (3-6 / 7-20 / 21-59 / 60+ días)
- [ ] Logros con rareza (Común/Raro/Épico/Legendario) y barra de progreso en incompletos (lista inicial en Inputs & Outputs)
- [ ] Comparativa histórica: radar chart actual vs snapshot pasado (1m / 3m / 1a)

**UI — 6 zonas (de arriba a abajo)**
- [ ] Zona 1 — HUD compacto: avatar + nombre + título + Nivel General + 6 barras de stats
- [ ] Zona 2 — Buffs activos (chips de racha con fuego escalado; estado vacío motivador)
- [ ] Zona 3 — Misiones del día (checklist estilo Goals + barra "4/7")
- [ ] Zona 4 — Misiones épicas (cards horizontales scrollables, ícono boss cerca del deadline)
- [ ] Zona 5 — Logros recientes/cercanos (grid 4–6 + modal completo filtrable por rareza y tab de origen)
- [ ] Zona 6 — Radar comparativo (Chart.js, 2 series, selector de período)

**Microinteracciones** (todas desactivables desde config)
- [ ] Level Up: toast/modal 2–3s con animación de barra + voz JARVIS opcional (toggle)
- [ ] Logro desbloqueado: toast entrando de costado con color de rareza
- [ ] Misión completada: check animado + "+XP flotante"

**Motor de cálculo**
- [ ] Corre on-demand al cargar la pestaña (sin cron en v1)
- [ ] Incremental: lee eventos desde `playerstate.ultima_actualizacion` hasta hoy, no recalcula todo el historial
- [ ] `snapshotMensual()`: on-load con chequeo de fecha, guarda snapshot de las 6 stats el día 1 de cada mes

**Arquitectura de archivos**
- [ ] Todo el código en archivos nuevos: `gamemode.js`, `gamemode.css`, sección nueva en `index.html`
- [ ] Bumpear `const CACHE` en `sw.js` y sumar los archivos nuevos al `SHELL`
- [ ] Reutiliza el patrón de sync Firebase ya usado en otras tabs (respetando `_fbSaveInProgress`, etc.)

### Out of Scope (v1 — diferido a v2)

- Avatar evolutivo (cambia de aspecto cada N niveles)
- Modo "Jefe del mes" / boss fight con barra de vida para el objetivo trimestral
- Eventos especiales "Boss Battle: Final de [Materia]" con cuenta atrás pre-examen
- Narración por voz de JARVIS más allá del toggle básico de level-up
- UI para configurar la ponderación de stats (vive en `config` pero sin interfaz en v1)
- Cron/scheduled function server-side (todo on-load en v1)

## Inputs & Outputs

### Inputs (read-only desde colecciones existentes)
El motor lee, sin escribir: `habits`, sesiones de gym/box/jiujitsu, `materias`, finanzas, `quarterly_objectives`, Goals diarios, streak counters. **Riesgo a resolver en Fase 1: confirmar los nombres/forma reales de estos campos en Firestore antes de mapear** (la spec asume su existencia; varios marcados "si existe").

### Input manual nuevo (única excepción)
3–4 checkboxes diarios para Espíritu y Vínculos, guardados en `playerstate.espiritu_vinculos_log[fecha]`.

### Tabla de XP por evento

| Stat | Evento | XP |
|---|---|---|
| Cuerpo | Sesión gym / box / jiujitsu (cada una) | +15 |
| Cuerpo | Día de sueño en rango 00:00–07:00 (±30 min) | +10 |
| Cuerpo | Habit de salud personalizado (c/u) | +5 |
| Cuerpo | Bonus 3 entrenos el mismo día | +10 |
| Mente | Materia marcada "done" (una vez por materia) | +100 |
| Mente | Día de estudio cumplido | +10 |
| Mente | Milestone a tiempo (real ≤ esperado) | +25 |
| Espíritu | Misa/oración diaria | +10 |
| Espíritu | Lectura espiritual | +10 |
| Espíritu | Reflexión semanal | +20 |
| Riqueza | Hábito financiero (c/u) | +5 |
| Riqueza | Gasto fijo pagado a tiempo | +10 |
| Riqueza | Snapshot mensual con crecimiento de patrimonio | +30 |
| Riqueza | Semana sin gastos fuera de presupuesto (si existe lógica) | +15 |
| Creación | Proyecto con avance/actualización | +20 |
| Creación | Proyecto completado/shippeado | +100 |
| Creación | Habit de estudio de IA | +5 |
| Vínculos | Tiempo de calidad con novia | +10 |
| Vínculos | Llamada/visita a padres | +10 |
| Vínculos | Cuidado de las gatitas | +5 |

### Tabla de títulos

| Stat dominante | Título |
|---|---|
| Cuerpo | El Forjado |
| Mente | El Erudito |
| Espíritu | El Custodio |
| Riqueza | El Estratega |
| Creación | El Constructor |
| Vínculos | El Pilar |
| Balanceado (ninguna domina >20%) | El Equilibrado |

### Escala de buffs (rachas)

| Días | Visual |
|---|---|
| 3–6 | 🔥 pequeño |
| 7–20 | 🔥🔥 ámbar |
| 21–59 | 🔥🔥🔥 naranja intenso |
| 60+ | 🔥👑 dorado |

### Logros iniciales

| Logro | Rareza | Condición |
|---|---|---|
| Primera Sangre | Común | Primera sesión de entreno logueada |
| Constancia | Raro | 21 días seguidos de sueño 00:00–07:00 |
| Hierro Forjado | Épico | 100 días seguidos sin faltar a un entreno |
| Mente Brillante | Raro | 5 materias aprobadas en un cuatrimestre |
| Camino al Doctorado | Épico | 20 materias aprobadas (mitad de carrera) |
| Patrimonio x2 | Legendario | Patrimonio neto duplicado en 12 meses |
| Disciplina Total | Legendario | Promedio 8.5+ sostenido 3 cuatrimestres |
| Constructor Serial | Épico | 5 proyectos de IA completados |
| Equilibrio | Raro | 6 stats con diferencia ≤2 niveles durante 30 días |

### Output (escritura — único documento que Game Mode escribe)
`appdata/playerstate`:
```json
{
  "playerstate": {
    "nivel_general": 14,
    "titulo_actual": "El Forjado",
    "ultima_actualizacion": "2026-06-23",
    "stats": {
      "cuerpo":   { "xp": 1450, "nivel": 12 },
      "mente":    { "xp": 2100, "nivel": 15 },
      "espiritu": { "xp": 800,  "nivel": 8  },
      "riqueza":  { "xp": 1200, "nivel": 11 },
      "creacion": { "xp": 1700, "nivel": 13 },
      "vinculos": { "xp": 950,  "nivel": 9  }
    },
    "buffs_activos":     [{ "tipo": "racha_entreno", "dias": 21, "desde": "2026-06-02" }],
    "misiones_diarias":  [{ "id": "m1", "texto": "Sesión de gym", "xp": 15, "completada": true, "fuente": "salud.gym" }],
    "misiones_semanales": [],
    "misiones_epicas":   [{ "id": "q2_2026", "nombre": "Objetivo T2 2026", "progreso": 0.62, "esperado": 0.70 }],
    "logros":            { "primera_sangre": { "desbloqueado": true, "fecha": "2026-01-10" },
                           "hierro_forjado": { "desbloqueado": false, "progreso": 37, "meta": 100 } },
    "snapshots":         [{ "fecha": "2026-03-23", "stats": { "cuerpo": {} } }],
    "espiritu_vinculos_log": { "2026-06-23": { "mision": true, "lectura": true, "novia": true, "padres": false, "gatitas": true } },
    "config": { "animaciones": true, "voz_jarvis_levelup": false,
                "ponderacion_stats": { "cuerpo": 1, "mente": 1, "espiritu": 1, "riqueza": 1, "creacion": 1, "vinculos": 1 } }
  }
}
```

## Constraints

- Stack existente: HTML/CSS/JS puro (sin bundler/framework), Firebase Firestore, Chart.js, SortableJS, GitHub Pages.
- Scripts clásicos → funciones/vars top-level son globales y se comparten entre archivos.
- Colores de rareza son **fijos e independientes del tema**: Común=gris, Raro=azul, Épico=violeta, Legendario=dorado/ámbar. Todo lo demás consume variables del theme switcher.
- Reutilizar (no recrear): Chart.js cargado, variables CSS del theme switcher, patrón de sync Firebase, estilo visual del checklist de Goals.
- No tocar la lógica de negocio de Salud, Finanzas, Conocimiento, Vida.
- `appdata/playerstate` solo se escribe desde el motor de Game Mode; ninguna otra tab lo lee como fuente de verdad ni lo escribe.

## Edge Cases

- **Primera carga (no existe `playerstate`)**: crear documento con estructura inicial y `ultima_actualizacion` = fecha de inicio razonable, luego correr el motor sobre el historial existente.
- **Campo fuente no existe en Firestore** (ej: presupuesto, milestones): el evento asociado se omite silenciosamente, no rompe el cálculo; se documenta como pendiente.
- **Racha rota**: mensaje neutro-motivador ("Racha de N días cerrada. Vamos de nuevo."), nunca lenguaje de fallo/culpa.
- **Sin rachas activas**: Zona 2 muestra estado vacío motivador ("Hoy es un buen día para empezar una").
- **Animaciones desactivadas en config**: ningún toast/modal/floating-text se dispara; el level-up se refleja solo en el estado.
- **JARVIS/ElevenLabs no disponible**: el toggle de voz no falla; simplemente no anuncia.
- **Recálculo idempotente**: correr el motor dos veces el mismo día no duplica XP (eventos ya contabilizados hasta `ultima_actualizacion` no se reprocesan).
- **Snapshot mensual**: si se abrió la app varias veces el día 1, se guarda un solo snapshot del mes.
- **Mobile**: HUD en 2 filas, stats en grid 2×3, zonas 3–6 en columna única con scroll.

## Definition of Done

Por fase (priorizar Fase 1 + 2 para algo funcional rápido):

**Fase 1 — Fundación de datos**
- [ ] Dado el historial real en Firestore, cuando corre el motor manualmente, entonces calcula XP por stat coincidiendo con la tabla de eventos verificada contra datos reales
- [ ] Dado que ya corrió hoy, cuando vuelve a correr, entonces no duplica XP (incremental por `ultima_actualizacion`)
- [ ] Dado que no existe `playerstate`, cuando carga por primera vez, entonces crea el documento sin tocar ninguna otra colección

**Fase 2 — HUD (Zonas 1 y 2)**
- [ ] Dado un `playerstate` válido, cuando se abre la pestaña, entonces el HUD muestra avatar, título dinámico, Nivel General y 6 barras con su nivel y progreso, usando colores del tema activo
- [ ] Dada una racha ≥3 días, cuando se renderiza Zona 2, entonces aparece el chip con el fuego escalado correcto; sin rachas, el estado vacío motivador
- [ ] El HUD se entiende sin scroll en desktop y mobile

**Fase 3 — Misiones (Zonas 3 y 4)**
- [ ] Dado los Goals del día, cuando se abre la pestaña, entonces las misiones diarias se generan automáticamente y la barra muestra "completadas/total"
- [ ] Dado un Quarterly Objective activo, cuando se renderiza Zona 4, entonces aparece como card con barra real vs esperado igual a la lógica existente

**Fase 4 — Logros y comparativa (Zonas 5 y 6)**
- [ ] Dado el estado + historial, cuando corre `chequearLogros()`, entonces los logros cumplidos quedan desbloqueados y los incompletos muestran progreso/meta
- [ ] Dado ≥1 snapshot pasado, cuando se renderiza el radar, entonces muestra 2 series (actual vs período seleccionado) y el selector cambia el período

**Fase 5 — Microinteracciones**
- [ ] Dado un cruce de umbral de nivel, cuando se recalcula, entonces dispara el toast de Level Up (si animaciones ON) y opcionalmente voz JARVIS (si toggle ON)
- [ ] Dado animaciones OFF en config, cuando ocurre cualquier evento, entonces no se dispara ningún toast/floating-text
- [ ] Input manual de Espíritu/Vínculos guarda en `espiritu_vinculos_log` y otorga XP

**Global**
- [ ] Ninguna colección existente fue modificada por Game Mode (verificable: solo `playerstate` recibe escrituras)
- [ ] `sw.js` tiene `CACHE` bumpeado y los archivos nuevos en `SHELL`; el cambio llega a los dispositivos
