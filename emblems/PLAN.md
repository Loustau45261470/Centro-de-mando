# Plan de emblemas v2 — más variedad, mejor calidad

Objetivo: pasar de 27 emblemas compartidos a ~56 únicos, arreglando los nodos mal
representados (centinela mostraba un rifle, etc.). Se generan en 2 láminas con Gemini Pro,
se recortan con `crop.py` y se remapean en `GM_NODE_ICON`.

## MASTER STYLE (va idéntico en las 2 láminas, en el encabezado del prompt)

```
MASTER STYLE — apply identically to EVERY emblem in the grid:
a hyper-detailed, photorealistic 3D-rendered fantasy-RPG skill emblem, Unreal-Engine /
Octane render quality, physically-based metals (gold, silver, bronze, gunmetal) and faceted
gemstones, cinematic studio rim-lighting from the upper-left, ray-traced reflections,
dramatic volumetric glow with subtle magical energy particles, shallow depth of field,
ultra-high definition, crisp 4K, intricate ornamentation. Each emblem is a UNIQUE original
design with its own distinct silhouette — no two alike. Centered, filling ~85% of its cell,
isolated on a FLAT very dark navy background (#0a1018). No hexagon, no frame, no border, no
plaque, no watermark; only a small lowercase label in clean sans-serif directly under each.
Even spacing, equal cell size, consistent camera angle and lighting across all. Max resolution.
```

## LÁMINA A — Atributos base (27, grilla 6×5, últimas 3 vacías)
strength(💪 mancuerna áurea con energía) · combat(🥊 guantes/puños cruzados con chispa) ·
nutrition(🥗 hoja vibrante + fruto, vitalidad) · endurance(🏃 rayo alado / velocidad) ·
intellect(📚 tomo abierto brillante) · focus(🎯 diana con flecha en el centro) ·
mind(🧘 figura en meditación con aura) · economist(💵 monedas + flecha ascendente) ·
ledger(📊 libro mayor + barras) · faith(✝️ cruz radiante con gema) · love(💖 corazón entrelazado) ·
family(👨‍👦 padre e hijo) · cat(🐱 gato majestuoso ojos brillantes) · execution(🔨 martillo rúnico golpeando) ·
responsibility(⏰ reloj/clepsidra ornamentado) · tools(🔧 engranaje + llave) · reader(📖 libro con letras flotando) ·
law(⚖️ balanza de justicia) · graduate(🎓 birrete con diploma) · patrimony(📈 flecha de crecimiento sobre oro) ·
gem(💎 diamante tallado radiante) · firearm(🔫 rifle de tirador ornamentado) · church(⛪ catedral luminosa) ·
robot(🤖 cabeza de IA / circuitos) · medal(🏅 medalla de logro) · crown(👑 corona enjoyada) ·
temperance(🛡️ escudo con símbolo de templanza)

## LÁMINA B — Maestrías y convergencias (29, grilla 6×5)
commander(🎖️ casco+medalla de comandante) · operative(🦾 exoesqueleto biónico) ·
tempered_mind(🧠 cerebro cristalino brillante) · doctor(⚕️ caduceo médico) ·
wealth_forge(🏦 bóveda/banco con oro fluyendo) · dove(🕊️ paloma serena con luz) ·
home_pillar(🏡 hogar con aura protectora) · architect(🏗️ plano + estructura/grúa) ·
sentinel(🛡️ escudo centinela con ojo/torre de vigía) · abacus(🧮 ábaco brillante) ·
method(📐 escuadra + compás de precisión) · support(🤝 apretón de manos con brillo) ·
forged(🔥 emblema forjado en llama / fénix) · coder(💻 laptop con código brillante) ·
righteous(⚖️ balanza recta con luz) · presence_home(🏠 casa cálida iluminada) ·
steel_swords(⚔️ mandobles de acero cruzados) · guardian(🛡️ escudo guardián con alas) ·
strategist(♟️ rey de ajedrez dorado) · discipline(🎯 flecha atravesando diana) ·
provider(🏆 copa/trofeo dorado) · resilient_star(🌟 estrella resiliente ardiente) ·
oracle(🔮 esfera de cristal brillante) · diamond_mind(💠 cristal de diamante irrompible) ·
great_family(👨‍👩‍👧 familia completa con aura) · polymath(🧠 cerebro con engranajes y estrellas) ·
wise_warrior(🦉 búho + espada, sabiduría y guerra) · temple(🏛️ templo griego radiante de integridad) ·
marine(🎖️ insignia militar de élite)

## Remapeo GM_NODE_ICON (aplicar al integrar)
- Base (todas sus tiers): hombre_de_hierro/acero/titanio→strength; combatiente/veterano/letal→combat;
  saludable/nutricionista/impecable→nutrition; resistente/incansable/inagotable→endurance;
  estudiante/letrado→intellect; alerta/enfocado/imperturbable→focus; sereno/estoico/inquebrantable→mind;
  aprendiz_de_capital/inversor/visionario_del_capital→economist; ordenado/austero/patrimonial→ledger;
  creyente/devoto_n/consagrado→faith; atento/companero/incondicional→love;
  hijo_presente_n/hijo_ejemplar/hijo_de_honor→family; protector_felino/padre_felino/guardian_felino→cat;
  hacedor/ejecutor/implacable→execution; confiable/responsable/inflexible→responsibility;
  aprendiz/programador/arquitecto_digital→tools; lector_casual/entusiasta/amante_libros→reader; jurista→law
- Patrimonio: patrimonio_en_marcha/base_solida/capital_creciente→patrimony;
  independencia_visible/umbral_de_libertad→gem; patrimonio_de_elite→crown
- Manuales: manejo_de_armas/tenencia→firearm; marine→marine; templanza_real→temperance;
  catolico_practicante→church; graduado→graduate; primer_ingreso_negocio_ia→robot; coleccionista→medal
- Convergencias: comandante_de_combate→commander; cuerpo_operativo→operative; mente_templada→tempered_mind;
  doctor_en_potencia→doctor; forjador_de_riqueza→wealth_forge; vida_ordenada→dove; pilar_del_hogar→home_pillar;
  arquitecto_de_sistemas→architect; centinela→sentinel; calculador→abacus; metodico→method; sosten→support;
  templado→forged; estudioso_del_sistema→coder; recto→righteous; presente_en_casa→presence_home;
  templado_de_acero→steel_swords; protector→guardian; estratega_total→strategist; disciplinado→discipline;
  proveedor→provider; resiliente→resilient_star; visionario→oracle; sobrio→dove; lider_silencioso→crown;
  inquebrantable_total→diamond_mind; lector_supremo→crown; hombre_de_familia→great_family; polimata→polymath;
  guerrero_sabio→wise_warrior; hombre_integro→temple
