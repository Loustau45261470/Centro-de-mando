# Spec: Presupuesto Mensual

## Objective
Nuevo apartado **Presupuesto** dentro de la pestaña de Finanzas del Centro de Mando. Permite a Tobías planificar cuánto va a gastar cada mes, distinguido por las mismas categorías del registro de gastos, y comparar ese plan contra lo realmente gastado en el mes. El presupuesto se compone de dos bloques: un **mínimo fijo** (ítems calculados con una fórmula de 3 variables) y **gastos reservados** (montos sueltos arbitrarios por categoría). Cada mes tiene su propio presupuesto guardado con historial, y al iniciar un mes nuevo se copia automáticamente el del mes anterior como base editable.

## Requirements

### Must-Have
- [ ] Apartado "Presupuesto" visible dentro de la pestaña de Finanzas.
- [ ] **Bloque 1 — Mínimo fijo:** lista de ítems, cada uno con: nombre, categoría (de las del registro de gastos), unidad (litros / kilos / unidades) y 3 variables numéricas (variable1, variable2, variable3).
- [ ] El total de cada ítem fijo se calcula como `variable1 × variable2 × variable3`. No hay conversión matemática de unidades: la unidad es solo una etiqueta visual del ítem.
- [ ] **Bloque 2 — Gastos reservados:** lista de ítems, cada uno con nombre, categoría y un monto fijo único (sin fórmula).
- [ ] Subtotal del mínimo fijo = suma de todos los ítems fijos.
- [ ] Subtotal de reservados = suma de todos los montos reservados.
- [ ] **Total del presupuesto del mes** = subtotal mínimo fijo + subtotal reservados.
- [ ] Agrupación/visualización por las categorías del registro de gastos.
- [ ] **Comparación plan vs real:** por categoría, mostrar lo presupuestado contra lo realmente gastado ese mes (suma de transacciones `type: expense` en ARS de la categoría, del mes activo), con la diferencia / saldo.
- [ ] **Historial por mes:** cada mes (clave `YYYY-MM`) guarda su propio presupuesto; se pueden consultar meses anteriores.
- [ ] **Auto-copia mensual:** cuando empieza un mes nuevo, se genera automáticamente el presupuesto de ese mes copiando exactamente los ítems (fijos + reservados con sus valores) del mes anterior, quedando editable por el usuario.
- [ ] Crear, editar y borrar ítems tanto en el bloque fijo como en el de reservados.
- [ ] Todo en pesos (ARS).
- [ ] Persistencia en el estado `S` y sync vía Firestore como el resto de la app (bumpear `CACHE` en `sw.js` al tocar js/css).

### Out of Scope
- Conversión matemática entre unidades (gr↔kg, etc.). Solo etiqueta de unidad: litros, kilos, unidades.
- Monedas distintas de ARS en el presupuesto.
- Gramos u otras unidades fuera de litros / kilos / unidades.
- Fórmulas distintas por ítem: todos los ítems fijos usan siempre la misma estructura de 3 variables.
- Alertas/notificaciones automáticas por sobregasto (más allá de mostrar el saldo en la comparación).

## Inputs & Outputs

### Inputs
**Ítem fijo:**
- `name` (string)
- `category` (una de las categorías de gasto, ver lista)
- `unit` (`litros` | `kilos` | `unidades`)
- `v1`, `v2`, `v3` (números)

**Ítem reservado:**
- `name` (string)
- `category` (una de las categorías de gasto)
- `amount` (número, ARS)

### Outputs (calculados)
- Total por ítem fijo = `v1 × v2 × v3`.
- Subtotal fijo, subtotal reservados, total del mes.
- Por categoría: `{ presupuestado, gastadoReal, saldo }` para el mes activo.

### Categorías de gasto (del registro existente, sin las de ingreso `salary`/`invest`)
- `clean_food` — 🥩 Alimentación Sana
- `hydration` — 💧 Hidratación Limpia
- `sports` — 🏋️ Deporte / Gym
- `productivity` — ⚡ Productividad / Fijos
- `girlfriend` — 💑 Novia
- `pet` — 🐱 Mascota
- `junk_food` — 🍟 Comida Chatarra
- `home` — 🏠 Hogar / Insumos
- `mama` — 👩 Mamá
- `papa` — 👨 Papá
- `business` — 💼 Negocio
- `study` — 📚 Estudio
- `other` — 💸 Otro

### Forma de datos sugerida en `S`
```
S.budgets = {
  'YYYY-MM': {
    fixed:    [{ id, name, category, unit, v1, v2, v3 }],
    reserved: [{ id, name, category, amount }]
  }
}
```

## Constraints
- Proyecto Centro de Mando: HTML/CSS/JS puro, sin framework ni bundler.
- Markup en `index.html`, estilos en `styles.css`, lógica en `app.js` (estado `S`, `saveState`/`loadState`, sync Firestore). No reunir archivos.
- Datos del usuario en Firestore (`appdata/lifedash_v2`), sincronizados entre dispositivos. Respetar la arquitectura de sync existente (no tocar `_fbSave`/`_applyRemoteState`/`loadState` sin diagnóstico previo).
- Las categorías deben coincidir con las del selector `txnCategory` (no inventar nuevas).
- La comparación usa `S.transactions` filtradas por mes activo, `type: 'expense'`, moneda ARS y `category`.
- Al tocar `app.js`/`styles.css`/`index.html`, bumpear `const CACHE` en `sw.js`.

## Edge Cases
- **Mes sin presupuesto previo (primer uso):** el mes arranca vacío (sin ítems); el usuario los agrega. No se rompe nada.
- **Auto-copia con mes anterior inexistente:** si no hay mes anterior, no copia nada (presupuesto vacío).
- **Variable vacía o cero en un ítem fijo:** el ítem aporta 0 al subtotal; no produce error ni `NaN`.
- **Ítem sin categoría:** se permite, pero no entra en ninguna agrupación de comparación (queda en total general); preferible exigir categoría al crear.
- **Gasto real en una categoría sin presupuesto:** la comparación muestra presupuestado = 0 y el real, con saldo negativo.
- **Categoría presupuestada sin gasto real:** muestra real = 0 y saldo = presupuestado.
- **Transacciones en USD/EUR de ese mes:** se ignoran en la comparación (solo ARS).
- **Editar un mes pasado del historial:** permitido; afecta solo a ese mes, no recalcula la auto-copia ya generada de meses posteriores.
- **Cambio de mes con la app abierta:** al detectarse el nuevo mes, se genera la copia automática una sola vez (no duplica si ya existe).

## Definition of Done
- [ ] Dado el ejemplo de carne (20 días × 0,7 kg × 14000), cuando se carga como ítem fijo, entonces su total muestra `$196.000`.
- [ ] Dado agua (30 × 2 × 1300) y gym (1 × 1 × 72000) como ítems fijos, cuando se suman, entonces el subtotal fijo refleja `$78.000 + $72.000` correctamente.
- [ ] Dado un mínimo fijo de $350.000 y reservados de Novia $100.000 + Mascota $50.000, cuando se calcula el total, entonces el presupuesto del mes muestra `$500.000`.
- [ ] Dado que existe el presupuesto del mes anterior, cuando empieza un mes nuevo, entonces el nuevo mes aparece con exactamente los mismos ítems (fijos + reservados) y valores, editables.
- [ ] Dado un presupuesto de $196.000 en `clean_food` y gastos reales de $210.000 en esa categoría ese mes, cuando se ve la comparación, entonces muestra presupuestado $196.000, gastado $210.000 y saldo −$14.000.
- [ ] Dado un ítem fijo con una variable vacía, cuando se renderiza, entonces su total es `$0` sin `NaN` ni error en consola.
- [ ] Dado que se agrega/edita/borra un ítem, cuando se recarga la app en otro dispositivo, entonces el cambio aparece sincronizado (Firestore).
- [ ] La unidad (litros/kilos/unidades) se muestra como etiqueta del ítem y no altera el cálculo `v1 × v2 × v3`.
