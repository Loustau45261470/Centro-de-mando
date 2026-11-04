// Overlay "Libros" (abanico de Conocimiento): una ficha por libro con Ideas prácticas, Filosofía y lecciones, Frases,
// Para aplicar y Resumen. Cubre: crear libro y editar sus campos, notas con formato en cada pestaña de notas, frases con
// página y favoritas, pasar un ítem de "Para aplicar" a hábito y a tarea (se reflejan en Hábitos y en Proyectos), buscador
// por contenido, frase del día (estable en el día, prioriza favoritas, oculta sin frases), filtros y orden, celular sin
// scroll horizontal y sin errores de consola. Todos los datos son de ejemplo inventados.
// Con LIBROS_SHOTS=<carpeta> también guarda capturas (desktop 1440 y celular 390) para revisarlas a ojo.
'use strict';
const { test, expect } = require('./support/fixtures');
const fs = require('fs');
const path = require('path');

const SHOTS = process.env.LIBROS_SHOTS || '';
const LIB = '#ov-libros';

test.beforeEach(async ({ cmPage }) => { test.setTimeout(120000); cmPage.on('dialog', (d) => d.accept()); });

async function irA(page, tab) {
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
}
async function abrirLibros(page) {
  await irA(page, 'conocimiento');
  await page.evaluate(() => Libros.open());
  await expect(page.locator(LIB)).toHaveClass(/show/);
}
async function crearLibro(page, { titulo, autor, estado, cat }) {
  await page.locator(`${LIB} .lb-addbtn`).click();
  await page.fill('#lb-nuevo-titulo', titulo);
  if (autor) await page.fill('#lb-nuevo-autor', autor);
  if (estado) await page.selectOption('#lb-nuevo-estado', estado);
  if (cat) await page.fill('#lb-nuevo-cat', cat);
  await page.locator(`${LIB} [data-act="crear"]`).click();
  await expect(page.locator('#lb-titulo')).toHaveValue(titulo);   // al crear, abre la ficha
}
const irTab = (page, t) => page.locator(`#lb-tab-${t}`).click();
const volver = (page) => page.locator(`${LIB} [data-act="volver"]`).click();
const abrirLib = (page, titulo) => page.locator(`${LIB} .lb-card`, { hasText: titulo }).click();
const dato = (page) => page.evaluate(() => JSON.parse(JSON.stringify(S.libros)));

// Datos de ejemplo para capturas, filtros y pruebas de celular.
async function sembrar(page) {
  await page.evaluate(() => {
    const hoy = getActiveDate();
    const nota = (id, cat, titulo, texto, fecha) => ({ id, cat, titulo, texto, fecha: fecha || hoy });
    S.libros = { items: [
      { id: 'b1', titulo: 'El arte de ahorrar sin sufrir', autor: 'Autora de Ejemplo', estado: 'leido', ini: '2026-08-02', fin: '2026-09-14', pt: 5, cat: 'Finanzas', creado: 3,
        notas: [
          nota('n1', 'ideas', 'Automatizar el ahorro', '# Pasos\n- Transferencia el día de cobro\n- Una cuenta aparte\n[] Probar con el 10%'),
          nota('n2', 'ideas', 'Revisar gastos hormiga', 'Mirar **una vez por semana** los gastos chicos.\n1. Anotar\n2. Sumar'),
          nota('n3', 'filo', 'La paciencia compone', '> El tiempo hace el trabajo pesado.\n---\nLo que importa es la *constancia*.'),
          nota('n4', 'resumen', 'Mi opinión', '## En una línea\nUn libro claro y práctico, con ejemplos simples.\n`Lo volvería a leer`')],
        frases: [
          { id: 'f1', texto: 'Ahorrar es decidir hoy lo que vas a poder elegir mañana.', pag: '34', fav: 1 },
          { id: 'f2', texto: 'La constancia le gana al talento cuando el talento no es constante.', pag: '112' },
          { id: 'f3', texto: 'Lo que se mide, mejora.' }],
        aplicar: [
          { id: 'a1', texto: 'Armar una transferencia automática el día de cobro' },
          { id: 'a2', texto: 'Revisar los gastos chicos todos los domingos', ok: 1 },
          { id: 'a3', texto: 'Abrir una cuenta aparte para el fondo de emergencia' }] },
      { id: 'b2', titulo: 'Meditaciones para días largos', autor: 'Autor de Ejemplo', estado: 'leyendo', ini: '2026-10-20', fin: '', pt: 4, cat: 'Filosofía', creado: 2,
        notas: [nota('n5', 'filo', 'Aceptar lo que no controlo', 'Separar lo que depende de uno de lo que no.')],
        frases: [{ id: 'f4', texto: 'No es lo que pasa, sino cómo respondés.', pag: '7' }], aplicar: [] },
      { id: 'b3', titulo: 'Disciplina en la cancha', autor: 'Entrenador de Ejemplo', estado: 'por_leer', ini: '', fin: '', pt: 0, cat: 'Deporte', creado: 1,
        notas: [], frases: [], aplicar: [] }] };
    saveState();
  });
}

// Nada del overlay se sale del ancho de la pantalla (ni la página ni el cuerpo del overlay).
async function desborde(page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const body = document.querySelector('#ov-libros .cm-ov-body');
    const fuera = [...document.querySelectorAll('#ov-libros .lb-root *')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > w + 1 || r.left < -1);
    }).map((e) => (typeof e.className === 'string' && e.className) || e.tagName).slice(0, 6);
    return { doc: document.documentElement.scrollWidth - w, cuerpo: body.scrollWidth - body.clientWidth, fuera };
  });
}

test('crear un libro, editar sus campos (estado con fechas, puntaje, categoría) y volver a la lista', async ({ cmPage: page, consoleErrors }) => {
  await abrirLibros(page);
  await expect(page.locator(`${LIB} .cm-ov-eyebrow`)).toHaveText('CONOCIMIENTO · LIBROS');
  await expect(page.locator(`${LIB} .nt-empty`)).toContainText('Todavía no cargaste libros');

  // Sin título no se crea.
  await page.locator(`${LIB} .lb-addbtn`).click();
  await page.locator(`${LIB} [data-act="crear"]`).click();
  await expect(page.locator('#lb-nuevo-titulo')).toBeVisible();
  await page.locator(`${LIB} .lb-addbtn`).click();

  await crearLibro(page, { titulo: 'Libro de ejemplo uno', autor: 'Autor Uno', cat: 'Fe' });
  let d = await dato(page);
  expect(d.items).toHaveLength(1);
  expect(d.items[0]).toMatchObject({ titulo: 'Libro de ejemplo uno', autor: 'Autor Uno', estado: 'por_leer', ini: '', fin: '', pt: 0, cat: 'Fe' });

  // Estado → Leyendo completa "Empecé" con hoy; → Leído completa también "Terminé".
  const hoy = await page.evaluate(() => getActiveDate());
  await page.selectOption('#lb-estado', 'leyendo');
  await expect(page.locator('#lb-ini')).toHaveValue(hoy);
  await expect(page.locator('#lb-fin')).toHaveValue('');
  await page.selectOption('#lb-estado', 'leido');
  await expect(page.locator('#lb-fin')).toHaveValue(hoy);

  // Fechas a mano, autor, categoría libre, título y puntaje (tocar de nuevo la misma estrella lo borra).
  await page.fill('#lb-ini', '2026-03-01');
  await page.fill('#lb-fin', '2026-04-10');
  await page.fill('#lb-autor', 'Autor Uno Corregido');
  await page.fill('#lb-cat', 'Categoría propia');
  await page.fill('#lb-cat', 'Categoría propia'); await page.locator('#lb-cat').blur();
  await page.fill('#lb-titulo', 'Libro de ejemplo uno, 2da edición');
  await page.press('#lb-titulo', 'Enter');
  await page.locator(`${LIB} .lb-star[data-v="4"]`).click();
  d = await dato(page);
  expect(d.items[0]).toMatchObject({ titulo: 'Libro de ejemplo uno, 2da edición', autor: 'Autor Uno Corregido', estado: 'leido', ini: '2026-03-01', fin: '2026-04-10', pt: 4, cat: 'Categoría propia' });
  await expect(page.locator(`${LIB} .lb-star.on`)).toHaveCount(4);
  await page.locator(`${LIB} .lb-star[data-v="4"]`).click();
  expect((await dato(page)).items[0].pt).toBe(0);
  await page.locator(`${LIB} .lb-star[data-v="3"]`).click();

  // Un título vacío no pisa el anterior.
  await page.fill('#lb-titulo', '');
  await page.press('#lb-titulo', 'Enter');
  expect((await dato(page)).items[0].titulo).toBe('Libro de ejemplo uno, 2da edición');

  await volver(page);
  const card = page.locator(`${LIB} .lb-card`);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Libro de ejemplo uno, 2da edición');
  await expect(card).toContainText('Autor Uno Corregido');
  await expect(card).toContainText('Categoría propia');
  await expect(card.locator('.lb-estado')).toHaveText('Leído');
  await expect(card.locator('.lb-stars')).toHaveAttribute('aria-label', '3 de 5');

  // Borrar (con confirmación).
  await card.click();
  await page.locator(`${LIB} [data-act="borrar-libro"]`).click();
  await expect(page.locator(`${LIB} .lb-card`)).toHaveCount(0);
  expect((await dato(page)).items).toHaveLength(0);
  expect(consoleErrors).toEqual([]);
});

test('notas con formato en Ideas prácticas, Filosofía y lecciones y Resumen: crear, editar, tildar, ordenar y borrar', async ({ cmPage: page, consoleErrors }) => {
  await abrirLibros(page);
  await crearLibro(page, { titulo: 'Libro de notas', estado: 'leyendo' });

  const TEXTO = '# Título grande\n- primer punto\n- segundo punto\n[] tarea pendiente\nTexto con **negrita** y *cursiva*';
  for (const cat of ['ideas', 'filo', 'resumen']) {
    await irTab(page, cat);
    await expect(page.locator(`${LIB} .nt-empty`)).toBeVisible();
    await page.locator(`${LIB} [data-act="nota-nueva"]`).click();
    await page.fill('#lb-n-titulo', 'Nota de ' + cat);
    await page.fill('#lb-n-texto', TEXTO);
    await page.locator(`${LIB} [data-act="nota-preview"]`).click();
    await expect(page.locator('#lb-n-prev .rn-h1')).toHaveText('Título grande');
    await page.locator(`${LIB} [data-act="nota-guardar"]`).click();
    const nota = page.locator(`${LIB} .lb-note`, { hasText: 'Nota de ' + cat });
    await expect(nota.locator('.rn-h1')).toHaveText('Título grande');
    await expect(nota.locator('.rn-bullet-item')).toHaveCount(2);
    await expect(nota.locator('strong')).toHaveText('negrita');
    await expect(nota.locator('em')).toHaveText('cursiva');
  }
  let d = await dato(page);
  expect(d.items[0].notas.map((n) => n.cat).sort()).toEqual(['filo', 'ideas', 'resumen']);

  // Las notas de una pestaña no aparecen en otra, y la pestaña muestra cuántas tiene.
  await irTab(page, 'filo');
  await expect(page.locator(`${LIB} .lb-note`)).toHaveCount(1);
  await expect(page.locator(`${LIB} .lb-note`)).toContainText('Nota de filo');
  await expect(page.locator('#lb-tab-filo')).toHaveText(/Filosofía y lecciones\s+1/);

  // La casilla del texto enriquecido se tilda y queda guardada.
  await page.locator(`${LIB} .rn-todo-check`).click();
  await expect.poll(async () => (await dato(page)).items[0].notas.find((n) => n.cat === 'filo').texto).toContain('[x] tarea pendiente');

  // Editar.
  await page.locator(`${LIB} [data-act="nota-editar"]`).click();
  await page.fill('#lb-n-titulo', 'Lección corregida');
  await page.locator(`${LIB} [data-act="nota-guardar"]`).click();
  await expect(page.locator(`${LIB} .nt-note-ttl`)).toHaveText('Lección corregida');

  // Orden por fecha: la más reciente arriba.
  await page.evaluate(() => { S.libros.items[0].notas.find((n) => n.cat === 'filo').fecha = '2020-01-15'; });
  await page.locator(`${LIB} [data-act="nota-nueva"]`).click();
  await page.fill('#lb-n-titulo', 'Lección más nueva');
  await page.locator(`${LIB} [data-act="nota-guardar"]`).click();
  await expect(page.locator(`${LIB} .nt-note-ttl`)).toHaveText(['Lección más nueva', 'Lección corregida']);

  // Una nota vacía no se guarda.
  await page.locator(`${LIB} [data-act="nota-nueva"]`).click();
  await page.locator(`${LIB} [data-act="nota-guardar"]`).click();
  await expect(page.locator('#lb-n-titulo')).toBeVisible();
  await page.locator(`${LIB} [data-act="nota-cancelar"]`).click();

  // Borrar.
  await page.locator(`${LIB} .lb-note`, { hasText: 'Lección más nueva' }).locator('[data-act="nota-borrar"]').click();
  await expect(page.locator(`${LIB} .lb-note`)).toHaveCount(1);
  expect((await dato(page)).items[0].notas.filter((n) => n.cat === 'filo')).toHaveLength(1);
  expect(consoleErrors).toEqual([]);
});

test('frases: guardar con página, marcar favorita, copiar, editar y borrar', async ({ cmPage: page, consoleErrors }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await abrirLibros(page);
  await crearLibro(page, { titulo: 'Libro de frases', autor: 'Autora de Frases' });
  await irTab(page, 'frases');
  await expect(page.locator(`${LIB} .nt-empty`)).toContainText('Todavía no guardaste frases');

  await page.locator(`${LIB} [data-act="frase-nueva"]`).click();
  await page.locator(`${LIB} [data-act="frase-guardar"]`).click();   // vacía: no guarda
  await expect(page.locator('#lb-f-texto')).toBeVisible();
  await page.fill('#lb-f-texto', 'Primera frase de ejemplo.');
  await page.fill('#lb-f-pag', '42');
  await page.locator(`${LIB} [data-act="frase-guardar"]`).click();
  await page.locator(`${LIB} [data-act="frase-nueva"]`).click();
  await page.fill('#lb-f-texto', 'Segunda frase, sin página.');
  await page.locator(`${LIB} [data-act="frase-guardar"]`).click();

  const filas = page.locator(`${LIB} .lb-frase-row`);
  await expect(filas).toHaveCount(2);
  await expect(filas.filter({ hasText: 'Primera frase' })).toContainText('Página 42');
  await expect(filas.filter({ hasText: 'Segunda frase' })).not.toContainText('Página');
  let d = await dato(page);
  expect(d.items[0].frases[0]).toMatchObject({ texto: 'Primera frase de ejemplo.', pag: '42' });
  expect(d.items[0].frases[1].pag).toBeUndefined();
  await expect(page.locator('#lb-tab-frases')).toHaveText(/Frases\s+2/);

  // Favorita: queda guardada, se marca y sube al principio.
  await filas.filter({ hasText: 'Segunda frase' }).locator('[data-act="frase-fav"]').click();
  await expect(filas.first()).toContainText('Segunda frase');
  await expect(filas.first().locator('.lb-fav')).toHaveAttribute('aria-pressed', 'true');
  expect((await dato(page)).items[0].frases.find((f) => f.texto.startsWith('Segunda')).fav).toBe(1);
  await filas.first().locator('[data-act="frase-fav"]').click();
  expect((await dato(page)).items[0].frases.find((f) => f.texto.startsWith('Segunda')).fav).toBeUndefined();

  // Copiar: avisa y deja la cita con autor, libro y página.
  await filas.filter({ hasText: 'Primera frase' }).locator('[data-act="frase-copiar"]').click();
  await expect(page.locator('#toast')).toHaveText(/Frase copiada|No se pudo copiar/);
  const copiado = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
  if (copiado !== null) expect(copiado).toBe('«Primera frase de ejemplo.» — Autora de Frases, Libro de frases (p. 42)');

  // Editar: cambia el texto y quita la página.
  await filas.filter({ hasText: 'Primera frase' }).locator('[data-act="frase-editar"]').click();
  await page.fill('#lb-f-texto', 'Primera frase corregida.');
  await page.fill('#lb-f-pag', '');
  await page.locator(`${LIB} [data-act="frase-guardar"]`).click();
  d = await dato(page);
  const f1 = d.items[0].frases.find((f) => f.texto.startsWith('Primera'));
  expect(f1.texto).toBe('Primera frase corregida.');
  expect(f1.pag).toBeUndefined();

  await filas.filter({ hasText: 'Segunda frase' }).locator('[data-act="frase-borrar"]').click();
  await expect(filas).toHaveCount(1);
  expect((await dato(page)).items[0].frases).toHaveLength(1);
  expect(consoleErrors).toEqual([]);
});

test('para aplicar: casilla chica a la derecha, y "→ Hábito" / "→ Tarea" se reflejan en Hábitos y Proyectos', async ({ cmPage: page, consoleErrors }) => {
  await abrirLibros(page);
  await crearLibro(page, { titulo: 'Libro para aplicar' });
  await irTab(page, 'aplicar');
  await expect(page.locator(`${LIB} .nt-empty`)).toContainText('Todavía no hay nada para aplicar');
  for (const t of ['Meditar diez minutos por la mañana', 'Armar la lista de lecturas del año', 'Llamar a un mentor']) {
    await page.fill('#lb-a-nuevo', t);
    await page.press('#lb-a-nuevo', 'Enter');
  }
  const filas = page.locator(`${LIB} .lb-apl`);
  await expect(filas).toHaveCount(3);

  // La casilla es chica y va a la derecha del texto.
  const geo = await filas.first().evaluate((el) => {
    const c = el.querySelector('.lb-check').getBoundingClientRect(), t = el.querySelector('.lb-apl-txt').getBoundingClientRect();
    return { w: c.width, h: c.height, cIzq: c.left, tIzq: t.left, tDer: t.right };
  });
  expect(geo.w).toBeLessThanOrEqual(18);
  expect(geo.h).toBeLessThanOrEqual(18);
  expect(geo.cIzq).toBeGreaterThanOrEqual(geo.tDer - 1);

  // Marcar como aplicado: se guarda, pasa abajo y el contador lo refleja.
  await filas.filter({ hasText: 'Llamar a un mentor' }).locator('.lb-check').click();
  await expect(filas.last()).toContainText('Llamar a un mentor');
  await expect(filas.last().locator('.lb-check')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator(`${LIB} .lb-contador`)).toHaveText('2 por aplicar · 1 aplicado');
  expect((await dato(page)).items[0].aplicar.find((a) => a.texto === 'Llamar a un mentor').ok).toBe(1);

  // → Hábito: crea el hábito en la sección elegida y deja el vínculo visible en el ítem.
  const meditar = filas.filter({ hasText: 'Meditar diez minutos' });
  await meditar.locator('[data-act="conv"][data-k="habito"]').click();
  await expect(page.locator('#lb-c-nombre')).toHaveValue('Meditar diez minutos por la mañana');
  await page.fill('#lb-c-nombre', 'Meditar 10 minutos');
  await page.selectOption('#lb-c-sec', 'salud');
  await page.locator(`${LIB} [data-act="conv-crear"]`).click();
  await expect(meditar.locator('[data-link="habito"]')).toHaveText('Hábito: Meditar 10 minutos · Salud');
  await expect(meditar.locator('[data-act="conv"][data-k="habito"]')).toHaveCount(0);
  const hab = await page.evaluate(() => S.habitTrackers.salud.filter((h) => h.name === 'Meditar 10 minutos').map((h) => ({ name: h.name, emoji: h.emoji, days: h.days })));
  expect(hab).toEqual([{ name: 'Meditar 10 minutos', emoji: '📚', days: {} }]);

  // → Tarea: crea la tarea en la carpeta "Libros" de la sección elegida (Proyectos), con el libro en la descripción.
  const lista = filas.filter({ hasText: 'Armar la lista de lecturas' });
  await lista.locator('[data-act="conv"][data-k="tarea"]').click();
  await page.locator(`${LIB} [data-act="conv-cancelar"]`).click();   // cancelar no crea nada
  expect(await page.evaluate(() => Proyectos.get('conocimiento').filter((n) => n.label === 'Libros').length)).toBe(0);
  await lista.locator('[data-act="conv"][data-k="tarea"]').click();
  await page.locator(`${LIB} [data-act="conv-crear"]`).click();   // sección por defecto: Conocimiento
  await expect(lista.locator('[data-link="tarea"]')).toHaveText('Tarea: Armar la lista de lecturas del año · Conocimiento');
  const tarea = await page.evaluate(() => {
    const c = Proyectos.get('conocimiento').find((n) => n.label === 'Libros');
    return { carpeta: c && c.tipo, hijos: c && c.children.map((t) => ({ label: t.label, tipo: t.tipo, desc: t.description, done: t.done })) };
  });
  expect(tarea).toEqual({ carpeta: 'carpeta', hijos: [{ label: 'Armar la lista de lecturas del año', tipo: 'tarea', desc: 'Del libro «Libro para aplicar»', done: false }] });

  // Otra tarea reutiliza la misma carpeta.
  await page.fill('#lb-a-nuevo', 'Otra cosa para hacer'); await page.press('#lb-a-nuevo', 'Enter');
  await filas.filter({ hasText: 'Otra cosa para hacer' }).locator('[data-act="conv"][data-k="tarea"]').click();
  await page.locator(`${LIB} [data-act="conv-crear"]`).click();
  expect(await page.evaluate(() => Proyectos.get('conocimiento').filter((n) => n.label === 'Libros').length)).toBe(1);

  // Editar y borrar un ítem.
  await filas.filter({ hasText: 'Llamar a un mentor' }).locator('[data-act="apl-editar"]').click();
  await page.fill('#lb-a-ed', 'Llamar a una mentora');
  await page.press('#lb-a-ed', 'Enter');
  await expect(filas.filter({ hasText: 'Llamar a una mentora' })).toHaveCount(1);
  await filas.filter({ hasText: 'Llamar a una mentora' }).locator('[data-act="apl-borrar"]').click();
  await expect(filas).toHaveCount(3);

  // Se reflejan afuera: el hábito en la sección Salud y la tarea en Proyectos de Conocimiento.
  await page.keyboard.press('Escape');
  await irA(page, 'salud');
  await expect(page.locator('#salud-habits-wrap')).toContainText('Meditar 10 minutos');
  await irA(page, 'conocimiento');
  await expect(page.locator('#proyectos-wrap-conocimiento')).toContainText('Libros');

  // El vínculo sigue ahí al reabrir; si la tarea se borra desde Proyectos, el ítem vuelve a ofrecer "→ Tarea".
  await page.evaluate(() => { const l = S.libros.items[0]; const a = l.aplicar.find((x) => x.tar); Proyectos.removeById(a.tar.split('|')[0], a.tar.split('|')[1]); Libros.open({ id: l.id, tab: 'aplicar' }); });
  await expect(page.locator(`${LIB} .lb-apl`, { hasText: 'Armar la lista de lecturas' }).locator('[data-act="conv"][data-k="tarea"]')).toHaveCount(1);
  await expect(page.locator(`${LIB} .lb-apl`, { hasText: 'Meditar diez minutos' }).locator('[data-link="habito"]')).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test('buscador: encuentra por título, autor y por el contenido de cada pestaña, y abre el libro en esa pestaña', async ({ cmPage: page, consoleErrors }) => {
  await abrirLibros(page);
  await sembrar(page);
  await page.evaluate(() => Libros.open());
  const q = page.locator('#lb-q');

  await q.fill('ahorrar');   // título del libro 1, y una idea y un ítem de "Para aplicar" también lo nombran
  await expect(page.locator(`${LIB} .lb-resitem`)).toHaveCount(1);
  await expect(page.locator(`${LIB} .lb-resitem`)).toContainText('El arte de ahorrar sin sufrir');
  await expect(page.locator('#lb-filtros')).toBeHidden();

  // Sin tildes ni mayúsculas, y mostrando en qué pestaña apareció.
  await q.fill('FILOSOFIA');
  await expect(page.locator(`${LIB} .lb-resitem`)).toContainText('Meditaciones para días largos');
  await expect(page.locator(`${LIB} .lb-hit-tab`)).toHaveText('Datos del libro');

  await q.fill('paciencia');
  const hit = page.locator(`${LIB} .lb-hit`);
  await expect(hit).toHaveCount(1);
  await expect(hit.locator('.lb-hit-tab')).toHaveText('Filosofía y lecciones');
  await expect(hit.locator('mark')).toHaveText('paciencia');

  await q.fill('tiempo hace');   // cuerpo de una nota
  await expect(page.locator(`${LIB} .lb-hit-tab`)).toHaveText('Filosofía y lecciones');
  await q.fill('es decidir hoy');   // frase
  await expect(page.locator(`${LIB} .lb-hit-tab`)).toHaveText('Frases');
  await q.fill('cuenta aparte');   // nota de ideas Y ítem de aplicar: dos pestañas del mismo libro
  await expect(page.locator(`${LIB} .lb-hit-tab`)).toHaveText(['Ideas prácticas', 'Para aplicar']);
  await q.fill('opinión');
  await expect(page.locator(`${LIB} .lb-hit-tab`)).toHaveText(['Resumen y opinión']);
  await q.fill('xyz-no-existe');
  await expect(page.locator(`${LIB} .nt-empty`)).toContainText('No encontré nada para «xyz-no-existe»');

  // Clic en un resultado: abre ese libro en esa pestaña.
  await q.fill('es decidir hoy');
  await page.locator(`${LIB} .lb-hit`).click();
  await expect(page.locator('#lb-titulo')).toHaveValue('El arte de ahorrar sin sufrir');
  await expect(page.locator('#lb-tab-frases')).toHaveClass(/on/);
  await expect(page.locator(`${LIB} .lb-frase-row`, { hasText: 'es decidir hoy' })).toBeVisible();

  // Al volver, el buscador conserva lo escrito; al borrarlo vuelven las tarjetas.
  await volver(page);
  await expect(page.locator('#lb-q')).toHaveValue('es decidir hoy');
  await page.fill('#lb-q', '');
  await expect(page.locator(`${LIB} .lb-card`)).toHaveCount(3);
  await expect(page.locator('#lb-filtros')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('filtros por estado y por categoría, y orden por recientes, puntaje y título', async ({ cmPage: page, consoleErrors }) => {
  await abrirLibros(page);
  await sembrar(page);
  await page.evaluate(() => Libros.open());
  const titulos = () => page.locator(`${LIB} .lb-card-ttl`).allTextContents();

  expect(await titulos()).toEqual(['El arte de ahorrar sin sufrir', 'Meditaciones para días largos', 'Disciplina en la cancha']);   // recientes
  await page.selectOption(`${LIB} [data-chg="orden"]`, 'titulo');
  expect(await titulos()).toEqual(['Disciplina en la cancha', 'El arte de ahorrar sin sufrir', 'Meditaciones para días largos']);
  await page.selectOption(`${LIB} [data-chg="orden"]`, 'puntaje');
  expect(await titulos()).toEqual(['El arte de ahorrar sin sufrir', 'Meditaciones para días largos', 'Disciplina en la cancha']);

  await page.getByRole('button', { name: /^Leyendo/ }).click();
  expect(await titulos()).toEqual(['Meditaciones para días largos']);
  await page.getByRole('button', { name: /^Todos/ }).click();
  await page.selectOption(`${LIB} [data-chg="f-cat"]`, { label: 'Deporte' });
  expect(await titulos()).toEqual(['Disciplina en la cancha']);
  // Estado y categoría se combinan: sin coincidencias avisa.
  await page.getByRole('button', { name: /^Leído/ }).click();
  await expect(page.locator(`${LIB} .nt-empty`)).toContainText('No hay libros con ese filtro');
  await page.getByRole('button', { name: /^Todos/ }).click();
  await page.selectOption(`${LIB} [data-chg="f-cat"]`, '');
  await expect(page.locator(`${LIB} .lb-card`)).toHaveCount(3);
  expect(consoleErrors).toEqual([]);
});

test('frase del día: estable en el día, prioriza favoritas, oculta sin frases y abre el libro', async ({ cmPage: page, consoleErrors }) => {
  await irA(page, 'conocimiento');
  const wrap = page.locator('#libros-frase-wrap');

  // Sin libros ni frases: no se muestra nada (ni card ni hueco).
  await page.evaluate(() => _lbRenderFraseDia());
  await expect(wrap.locator('.lb-dia')).toHaveCount(0);
  expect(await wrap.evaluate((e) => e.offsetHeight)).toBe(0);

  await sembrar(page);
  await page.evaluate(() => _lbRenderFraseDia());
  const card = wrap.locator('.lb-dia');
  await expect(card).toBeVisible();
  // Hay una favorita (f1): es la única candidata.
  await expect(card.locator('.lb-dia-q')).toHaveText('Ahorrar es decidir hoy lo que vas a poder elegir mañana.');
  await expect(card.locator('.lb-dia-src')).toHaveText('— Autora de Ejemplo, El arte de ahorrar sin sufrir (p. 34)');

  // Quitar la favorita: participan todas las frases, y la elegida es siempre la misma para una fecha dada.
  await page.evaluate(() => { delete S.libros.items[0].frases[0].fav; });
  const info = await page.evaluate(() => {
    const dias = Array.from({ length: 28 }, (_, i) => '2026-12-' + String(i + 1).padStart(2, '0'));
    const ids = (f) => _lbFraseDelDia(f).f.id;
    return { distintas: new Set(dias.map(ids)).size, hoy1: ids(getActiveDate()), hoy2: ids(getActiveDate()) };
  });
  expect(info.hoy1).toBe(info.hoy2);
  expect(info.distintas, 'con 4 frases y 28 fechas, rota').toBeGreaterThan(1);

  // Con las mismas frases, el orden de la lista no cambia la del día.
  const mismaConOtroOrden = await page.evaluate(() => {
    const antes = _lbFraseDelDia('2026-11-05').f.id;
    S.libros.items.reverse(); S.libros.items.forEach((l) => l.frases.reverse());
    const despues = _lbFraseDelDia('2026-11-05').f.id;
    return antes === despues;
  });
  expect(mismaConOtroOrden).toBe(true);

  // Re-renderizar muchas veces en el día muestra siempre la misma frase.
  const textos = await page.evaluate(() => Array.from({ length: 5 }, () => { _lbRenderFraseDia(); return document.querySelector('#libros-frase-wrap .lb-dia-q').textContent; }));
  expect(new Set(textos).size).toBe(1);

  // El botón abre el libro de la frase, en la pestaña Frases.
  await wrap.locator('[data-lb-abrir]').click();
  await expect(page.locator(LIB)).toHaveClass(/show/);
  await expect(page.locator('#lb-tab-frases')).toHaveClass(/on/);
  const idLibro = await wrap.locator('[data-lb-abrir]').getAttribute('data-lb-abrir');
  expect(await page.evaluate(() => _lbV.id)).toBe(idLibro);
  await page.keyboard.press('Escape');

  // Borrar todas las frases (desde el overlay) la oculta de nuevo.
  await page.evaluate(() => { S.libros.items.forEach((l) => { l.frases = []; }); Libros.open({ id: S.libros.items[0].id, tab: 'frases' }); });
  await page.keyboard.press('Escape');
  await expect(wrap.locator('.lb-dia')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('se abre desde el abanico de Conocimiento, junto a Notas', async ({ cmPage: page }) => {
  await irA(page, 'conocimiento');
  const etiquetas = await page.evaluate(() => [...document.querySelectorAll('#sd-conocimiento .cm-sd-item')].map((b) => b.getAttribute('aria-label')));
  expect(etiquetas).toContain('Libros');
  expect(etiquetas.indexOf('Libros')).toBe(etiquetas.indexOf('Notas') + 1);
  await page.locator('#sd-conocimiento .cm-sd-main').click();
  await page.locator('#sd-conocimiento .cm-sd-item[aria-label="Libros"]').click();
  await expect(page.locator(LIB)).toHaveClass(/show/);
  await expect(page.locator(`${LIB} .cm-ov-title`)).toHaveText('Libros');
  await page.keyboard.press('Escape');
  await expect(page.locator(LIB)).not.toHaveClass(/show/);
});

test('los datos quedan en S.libros con el modelo compacto y sobreviven a recargar el estado', async ({ cmPage: page, consoleErrors }) => {
  await abrirLibros(page);
  await crearLibro(page, { titulo: 'Libro persistente', autor: 'Autor P', cat: 'Historia' });
  await irTab(page, 'frases');
  await page.locator(`${LIB} [data-act="frase-nueva"]`).click();
  await page.fill('#lb-f-texto', 'Frase que persiste.');
  await page.locator(`${LIB} [data-act="frase-guardar"]`).click();
  const antes = await dato(page);
  expect(Object.keys(antes)).toEqual(['items']);
  expect(Object.keys(antes.items[0]).sort()).toEqual(['aplicar', 'autor', 'cat', 'creado', 'estado', 'fin', 'frases', 'id', 'ini', 'notas', 'pt', 'titulo']);
  expect(Object.keys(antes.items[0].frases[0]).sort()).toEqual(['id', 'texto']);

  // Se simula el arranque: se vacía S y se recarga desde el localStorage (page.reload() no conserva el estado en este harness).
  await page.evaluate(() => { S.libros = { items: [] }; });
  await page.evaluate(() => { S.libros = JSON.parse(localStorage.getItem('lifedash_v2')).libros; });
  expect(await dato(page)).toEqual(antes);
  await page.keyboard.press('Escape');
  await page.evaluate(() => Libros.open());
  await expect(page.locator(`${LIB} .lb-card`, { hasText: 'Libro persistente' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

for (const ancho of [390, 360]) {
  test(`celular ${ancho}: ninguna pantalla del overlay ni la frase del día tienen scroll horizontal`, async ({ cmPage: page, consoleErrors }) => {
    await page.setViewportSize({ width: ancho, height: 844 });
    await abrirLibros(page);
    await sembrar(page);
    // Una frase larga y una palabra larga sin espacios no deben empujar el ancho.
    await page.evaluate(() => {
      S.libros.items[0].frases.push({ id: 'f9', texto: 'Una frase bastante larga para verificar que el texto se acomoda en varias líneas sin desbordar la pantalla del celular ' + 'x'.repeat(60), pag: '1234' });
      S.libros.items[0].titulo = 'Un título de libro muy largo para comprobar que se parte en varias líneas ' + 'y'.repeat(40);
      S.libros.items[0].aplicar[0].hab = 'conocimiento|inexistente';
    });
    await page.evaluate(() => Libros.open());
    const ver = async (que) => { const r = await desborde(page); expect(r, que).toEqual({ doc: 0, cuerpo: 0, fuera: [] }); };

    await ver('lista');
    await page.locator(`${LIB} .lb-addbtn`).click();
    await ver('lista con formulario de libro nuevo');
    await page.locator(`${LIB} .lb-addbtn`).click();
    await page.fill('#lb-q', 'ahorrar');
    await ver('resultados de búsqueda');
    await page.fill('#lb-q', '');
    await abrirLib(page, 'Un título de libro muy largo');
    for (const t of ['ideas', 'filo', 'frases', 'aplicar', 'resumen']) {
      await irTab(page, t);
      await ver('pestaña ' + t);
    }
    await irTab(page, 'ideas');
    await page.locator(`${LIB} [data-act="nota-nueva"]`).click();
    await ver('formulario de nota');
    await page.locator(`${LIB} [data-act="nota-cancelar"]`).click();
    await irTab(page, 'frases');
    await page.locator(`${LIB} [data-act="frase-nueva"]`).click();
    await ver('formulario de frase');
    await page.locator(`${LIB} [data-act="frase-cancelar"]`).click();
    await irTab(page, 'aplicar');
    await page.locator(`${LIB} .lb-apl`).first().locator('[data-act="conv"][data-k="habito"]').click();
    await ver('pasar a hábito');
    await page.locator(`${LIB} [data-act="conv-cancelar"]`).click();
    await page.locator(`${LIB} .lb-apl`).first().locator('[data-act="apl-editar"]').click();
    await ver('editar ítem');
    await page.keyboard.press('Escape');

    // La pantalla Conocimiento con la frase del día.
    await page.evaluate(() => { _lbRenderFraseDia(); });
    await expect(page.locator('#libros-frase-wrap .lb-dia')).toBeVisible();
    const sc = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, caja: (() => { const r = document.querySelector('#libros-frase-wrap .lb-dia').getBoundingClientRect(); return r.right - document.documentElement.clientWidth; })() }));
    expect(sc.doc).toBe(0);
    expect(sc.caja).toBeLessThanOrEqual(0);
    expect(consoleErrors).toEqual([]);
  });
}

test('capturas desktop 1440 y celular 390 (solo con LIBROS_SHOTS)', async ({ cmPage: page, consoleErrors }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'las capturas de los dos anchos se sacan una sola vez');
  test.skip(!SHOTS, 'definí LIBROS_SHOTS=<carpeta> para guardar capturas');
  fs.mkdirSync(SHOTS, { recursive: true });
  await irA(page, 'conocimiento');
  await sembrar(page);
  await page.evaluate(() => {
    const l = S.libros.items[0];
    const h = addHabitTo('conocimiento', 'Transferencia automática al cobrar', '📚');
    l.aplicar[0].hab = 'conocimiento|' + h.id;
    saveState();
    _lbRenderFraseDia();
  });
  for (const [vp, ancho, alto] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width: ancho, height: alto });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, `${vp}-00-conocimiento-frase-del-dia.png`) });
    await page.evaluate(() => Libros.open());
    const foto = async (nombre) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(SHOTS, `${vp}-${nombre}.png`) }); };
    await foto('01-lista');
    await page.fill('#lb-q', 'paciencia');
    await foto('02-buscador');
    await page.fill('#lb-q', '');
    await page.locator(`${LIB} .lb-addbtn`).click();
    await foto('03-libro-nuevo-form');
    await page.locator(`${LIB} .lb-addbtn`).click();
    await abrirLib(page, 'El arte de ahorrar');
    let i = 4;
    for (const t of ['ideas', 'filo', 'frases', 'aplicar', 'resumen']) {
      await irTab(page, t);
      await foto(String(i++).padStart(2, '0') + '-' + t);
    }
    await irTab(page, 'aplicar');
    await page.locator(`${LIB} .lb-apl`).filter({ hasText: 'cuenta aparte' }).locator('[data-act="conv"][data-k="tarea"]').click();
    await foto('09-aplicar-pasar-a-tarea');
    await page.locator(`${LIB} [data-act="conv-cancelar"]`).click();
    await irTab(page, 'frases');
    await page.locator(`${LIB} [data-act="frase-nueva"]`).click();
    await foto('10-frase-form');
    await page.locator(`${LIB} [data-act="frase-cancelar"]`).click();
    await page.keyboard.press('Escape');
  }
  expect(consoleErrors).toEqual([]);
});
