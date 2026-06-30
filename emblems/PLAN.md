# Plan de emblemas v3 — arte único por tier (escala real)

Cada skill base tiene 3 emblemas que ESCALAN (Novato/T0 → Adepto/T1 → Maestro/T1.5).
Keys: `<skill>_1`, `<skill>_2`, `<skill>_3`. Las convergencias (tier 2-5) mantienen sus
emblemas únicos de la v2 (grid B). Se generan en 3 láminas (fila=skill, 3 col=tier) + 1 fix.

## MASTER STYLE (encabezado de cada lámina)
```
MASTER STYLE — apply identically to EVERY emblem: hyper-detailed photorealistic 3D-rendered
fantasy-RPG skill emblem, Unreal-Engine/Octane quality, physically-based metals and faceted
gemstones, cinematic rim-light from upper-left, volumetric glow with energy particles, ultra-HD
crisp 4K. FLAT very dark navy background (#0a1018). No frame/border/plaque/watermark; only a
small lowercase label (the key) under each cell. Even cells, consistent camera and lighting.
LAYOUT: a 3-column × N-row grid. Each ROW is ONE skill at three escalating tiers, left→right:
NOVICE (humble, simple, single material) → ADEPT (stronger, ornate, richer) → MASTER (epic,
radiant, powerful, glowing). The 3 in a row are clearly the SAME theme but visibly escalating.
```

## LÁMINA 1 (6 skills)
- strength: dumbbell de hierro simple → barra olímpica cargada → titán flexionando con aura
- combat: guantes de boxeo → espada cruzada con un puño → casco de campeón con espadas cruzadas
- nutrition: hoja verde → hoja con manzana y naranja → corazón radiante de frutas y vitalidad
- endurance: zapatilla alada → rayo alado → corredor envuelto en fuego, imparable
- focus: diana simple → flecha en el centro → ojo omnividente de puntería perfecta
- mind: figura meditando → figura con aura de chakras → loto-mente radiante iluminado

## LÁMINA 2 (6 skills)
- reader: un libro abierto → pila de libros → gran tomo brillante con letras flotando
- economist: una moneda de oro → monedas con gráfico ascendente → toro dorado con cascada de riqueza
- ledger: libro mayor → libro mayor con barras → libro ornamentado con balanza y monedas
- faith: cruz simple → cruz radiante con rubí → cruz alada con halo, gloria divina
- love: un corazón → dos corazones entrelazados → corazón eterno con anillos de infinito
- family: un niño con la mano alzada → padre e hijo juntos → árbol genealógico brillante de generaciones

## LÁMINA 3 (5 skills; intellect solo usa 2, generar 3 igual)
- cat: gatito → gato noble orgulloso → gato guardián majestuoso con aura, tipo león
- execution: martillo simple → martillo de forja con chispas → mazo rúnico crepitando energía
- responsibility: reloj de bolsillo → reloj con reloj de arena → gran reloj ornamentado con engranajes y aura
- tools: una llave inglesa → engranaje con llave → sigilo de arquitecto digital (engranajes + código + plano)
- intellect: libro cerrado con manzana → tomo abierto con pluma brillante → tomo de erudito con runas radiantes

## FIX (2 emblemas sueltos, mismo MASTER STYLE, etiquetados)
- firearm: un RIFLE de francotirador ornamentado SOLO (sin edificio)
- church: una CATEDRAL gótica luminosa SOLA

## Remapeo GM_NODE_ICON (al integrar)
- hombre_de_hierro→strength_1, hombre_de_acero→strength_2, hombre_de_titanio→strength_3
- combatiente→combat_1, veterano_de_combate→combat_2, letal→combat_3
- saludable→nutrition_1, nutricionista→nutrition_2, impecable→nutrition_3
- resistente→endurance_1, incansable→endurance_2, inagotable→endurance_3
- alerta→focus_1, enfocado→focus_2, imperturbable→focus_3
- sereno→mind_1, estoico→mind_2, inquebrantable→mind_3
- lector_casual→reader_1, lector_entusiasta→reader_2, amante_libros→reader_3
- aprendiz_de_capital→economist_1, inversor→economist_2, visionario_del_capital→economist_3
- ordenado→ledger_1, austero→ledger_2, patrimonial→ledger_3
- creyente→faith_1, devoto_n→faith_2, consagrado→faith_3
- atento→love_1, companero→love_2, incondicional→love_3
- hijo_presente_n→family_1, hijo_ejemplar→family_2, hijo_de_honor→family_3
- protector_felino→cat_1, padre_felino→cat_2, guardian_felino→cat_3
- hacedor→execution_1, ejecutor→execution_2, implacable→execution_3
- confiable→responsibility_1, responsable→responsibility_2, inflexible→responsibility_3
- aprendiz→tools_1, programador→tools_2, arquitecto_digital→tools_3
- estudiante→intellect_1, letrado→intellect_2
- manejo_de_armas→firearm, tenencia→firearm, catolico_practicante→church
- (sin cambios) jurista→law, marine→marine, graduado→graduate, primer_ingreso_negocio_ia→robot,
  coleccionista→medal, templanza_real→temperance; patrimonio_en_marcha/base_solida/capital_creciente→patrimony;
  independencia_visible/umbral_de_libertad→gem; patrimonio_de_elite/lider_silencioso/lector_supremo→crown;
  y todas las convergencias v2 (comandante→commander, centinela→sentinel, etc.)
