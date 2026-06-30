# Emblemas del Árbol de Habilidades

Imágenes (PNG) generadas con IA que reemplazan los glyphs internos del árbol de skills.
El **marco hexagonal con metal por rareza** lo pone el código automáticamente según el tier;
**esta imagen es solo el emblema/ilustración interior** (lo que va dentro del marco).

## Cómo entran al código
1. Poné cada archivo en esta carpeta con el nombre EXACTO `<key>.png` (ver lista abajo).
2. En `gamemode-ui.js`, agregá la `key` al set `GM_EMBLEM_HAVE` (ej: `new Set(['strength','combat'])`).
3. Bump de `CACHE` en `sw.js`. Listo: ese nodo muestra la imagen; los que falten siguen con el glyph SVG.

## Especificaciones de cada imagen
- **Formato:** PNG cuadrado, **fondo transparente** (ideal) o fondo oscuro homogéneo.
- **Tamaño:** ~512×512 px.
- **Encuadre:** la ilustración centrada, ocupando ~80% del cuadro (deja aire en los bordes; se recorta a hexágono).
- **Estilo consistente entre todas:** mismo render 3D, misma dirección de luz, misma paleta metálica, para que la grilla se vea uniforme.

## Lista de emblemas (27)

| Archivo | Concepto / qué debe ilustrar |
|---|---|
| `strength.png` | Fuerza física — mancuerna / músculo / titán |
| `combat.png` | Combate — espadas cruzadas / guerrero |
| `nutrition.png` | Nutrición y salud — hoja / manzana / vida verde |
| `endurance.png` | Resistencia — rayo / corredor incansable |
| `intellect.png` | Intelecto y estudio — libro abierto / cerebro |
| `focus.png` | Enfoque y concentración — diana / ojo |
| `mind.png` | Mente serena — cabeza en meditación / red neuronal |
| `economist.png` | Economía e inversión — gráfico ascendente |
| `ledger.png` | Orden financiero — libro mayor / ledger |
| `faith.png` | Fe — cruz con resplandor divino |
| `love.png` | Amor / pareja — corazón |
| `family.png` | Familia / linaje — figuras unidas / árbol genealógico |
| `cat.png` | Vínculo felino — gato |
| `execution.png` | Ejecución / hacer — martillo / yunque |
| `responsibility.png` | Responsabilidad — reloj / escudo |
| `tools.png` | Programación / oficio — engranaje + herramientas |
| `wealth.png` | Riqueza / patrimonio — monedas / cofre de oro |
| `crown.png` | Élite / maestría suprema — corona |
| `weapon.png` | Manejo de armas — arma / rifle |
| `license.png` | Licencia / credencial — escudo con estrella |
| `temperance.png` | Templanza — balanza equilibrada |
| `graduate.png` | Graduación — birrete |
| `business.png` | Negocio — maletín |
| `medal.png` | Logro / condecoración — medalla con cinta |
| `home.png` | Hogar — casa |
| `star.png` | Polímata / destino — estrella radiante |
| `integrity.png` | Integridad — átomo / órbitas |
