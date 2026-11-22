'use strict';
// Test Node puro de la elección de frases (sin navegador): node tests/frases-elegir.node.js
const assert = require('assert');
const { elegir } = require('../frases.js');
const mk = (n, fav, p) => Array.from({ length: n }, (_, i) => ({ id: p + i, t: 't' + p + i, fav }));

// pool vacío / inválido
assert.strictEqual(elegir([], 5), null);
assert.strictEqual(elegir(null, 5), null);

// 3:1 y sin repetición consecutiva, en una ventana de 400 turnos (desde un turno "real" grande)
const mixto = mk(7, true, 'f').concat(mk(5, false, 'n'));
const T0 = 5900000;
let favs = 0, prev = null;
for (let t = T0; t < T0 + 400; t++) {
  const x = elegir(mixto, t);
  if (x.fav) favs++;
  assert.notStrictEqual(x.id, prev, 'repite consecutiva en turno ' + t);
  prev = x.id;
  assert.strictEqual(!!x.fav, t % 4 !== 3, 'patrón 3:1 roto en ' + t);
}
assert.strictEqual(favs, 300);

// recorre todas las favoritas antes de repetir (ventana de 7 favoritas = 7 turnos fav consecutivos)
const vistas = new Set();
for (let t = 0, c = 0; c < 7; t++) { const x = elegir(mixto, t); if (x.fav) { vistas.add(x.id); c++; } }
assert.strictEqual(vistas.size, 7);

// determinístico
assert.strictEqual(elegir(mixto, 123456).id, elegir(mixto, 123456).id);

// sin favoritas / todas favoritas: todo el pool, sin repetir seguido, sin repetir antes de agotar
for (const pool of [mk(6, false, 'n'), mk(6, true, 'f'), mk(2, false, 'n'), mk(3, true, 'f')]) {
  let p = null; const v = new Set();
  for (let t = T0; t < T0 + 200; t++) {
    const x = elegir(pool, t); assert.notStrictEqual(x.id, p); p = x.id; v.add(x.id);
  }
  assert.strictEqual(v.size, pool.length);
}
const ciclo = new Set(); for (let t = 0; t < 6; t++) ciclo.add(elegir(mk(6, true, 'f'), t).id);
assert.strictEqual(ciclo.size, 6);
const solo = [{ id: 'a', t: 'x', fav: true }];
assert.strictEqual(elegir(solo, 9).id, 'a');
console.log('frases-elegir: OK');
