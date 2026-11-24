// Registros (registros.js): crear un registro, recibir el aviso local, responder con actividad y pensamiento separados + 👍/👎,
// aprendizajes con sugerencia y «convertir en principio», historial con filtros y chequeos viejos de Foco, resumen, revisión semanal,
// recarga real y 390 px. Datos de ejemplo inventados; reloj simulado (martes 24/11/2026).
'use strict';
const { test, expect, waitForBoot, completeLoginOverlay } = require('./support/fixtures');

const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const a = (page, h, m = 0, dia = 24) => page.clock.setFixedTime(new Date(2026, 10, dia, h, m));
const irAVida = async (page) => { await page.click('#rg-btn'); await expect(page.locator('#ov-registros.show #registros-body')).toBeVisible(); };
const NOTIF = (page) => page.evaluate(() => {
  Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
  localStorage.removeItem('cdm_avisosVistos');
  window.__notifs = []; window._showNotif = (t, o) => window.__notifs.push({ t, tag: o && o.tag, url: o && o.data && o.data.url, body: o && o.body });
});
// El registro principal nace al arrancar (con la hora real); para probar horas de ese día se lo hace «de antes».
const antiguar = (page) => page.evaluate(() => { S.registros.forEach((r) => { r.inicio = '2026-11-01T00:00'; }); });
const clickAviso = (page, url) => page.evaluate((u) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { tipo: 'abrir-destino', url: u } })), url);

test.describe('Registros', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium-desktop', 'una sola vez alcanza: el viewport se fija adentro'); });

  test('flujo completo: crear, avisar, responder, aprender, historial, resumen, revisión y recarga', async ({ cmPage: page, consoleErrors }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    await a(page, 11, 2);
    await irAVida(page);
    await antiguar(page);

    // El registro principal nace solo con las horas de Foco (11, 15 y 19) y ya no avisa Foco por separado.
    const prin = await page.evaluate(() => S.registros.find((r) => r.principal));
    expect(prin).toMatchObject({ id: 'reg_principal', nombre: 'Chequeo de foco y reflexión', frecuencia: { tipo: 'horas', horas: ['11:00', '15:00', '19:00'] } });
    await expect(page.locator('#registros-body .rg-row')).toHaveCount(1);
    await expect(page.locator('#registros-body')).toContainText('Chequeo de foco y reflexión');
    expect(await sinScrollH(page)).toBe(true);

    // + Registro: nombre, frecuencia, horario, días y una pregunta propia.
    await page.click('#rg-nuevo');
    await expect(page.locator('#ov-registro-ed.show')).toBeVisible();
    await page.fill('#rg-e-nombre', 'Foco de la tarde');
    await page.selectOption('#rg-e-frec', '30');
    await page.fill('#rg-e-desde', '09:00'); await page.fill('#rg-e-hasta', '21:00');
    await page.locator('#ov-registro-ed .rg-dia[data-d="0"]').click();           // sin domingos
    await page.locator('#ov-registro-ed .rg-preg input.pr-in').first().fill('¿Qué tan concentrado estás?');
    await page.locator('#ov-registro-ed .rg-tipo').selectOption('escala');
    expect(await sinScrollH(page)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('editor.png') });
    await page.click('#rg-e-guardar');
    await expect(page.locator('#ov-registro-ed.show')).toHaveCount(0);
    const nuevo = await page.evaluate(() => S.registros.find((r) => !r.principal));
    expect(nuevo).toMatchObject({ nombre: 'Foco de la tarde', frecuencia: { tipo: 'cada', cada: 30, unidad: 'min' }, desde: '09:00', hasta: '21:00', dias: [1, 2, 3, 4, 5, 6] });
    expect(nuevo.inicio).toBe('2026-11-24T11:02');
    expect(nuevo.preguntas).toMatchObject([{ texto: '¿Qué tan concentrado estás?', tipo: 'escala' }]);
    await expect(page.locator('#registros-body .rg-row')).toHaveCount(2);

    // Registro inválido: no se guarda y avisa en español simple.
    await page.click('#rg-nuevo');
    await page.fill('#rg-e-nombre', 'Malo');
    await page.selectOption('#rg-e-frec', 'custom');
    await page.fill('#rg-e-cada', '5');
    await page.click('#rg-e-guardar');
    await expect(page.locator('#ov-registro-ed.show')).toBeVisible();
    expect(await page.evaluate(() => S.registros.length)).toBe(2);
    await page.evaluate(() => Registros.cerrarEd());

    // Aviso local: sale una sola vez, con la url que abre el formulario de ESA ocurrencia.
    await NOTIF(page);
    await page.evaluate(() => checkReminderNotifications());
    await page.evaluate(() => checkReminderNotifications());
    const n1 = await page.evaluate(() => window.__notifs);
    expect(n1.map((x) => x.tag)).toEqual(['reg_reg_principal@2026-11-24T11:00']);
    expect(n1[0]).toMatchObject({ t: '¿Qué estuviste haciendo?', url: '#registro-reg_principal@2026-11-24T11:00' });

    // Tocar el aviso abre el formulario: actividad y pensamiento en casillas separadas, cada una con su 👍/👎.
    await clickAviso(page, n1[0].url);
    await expect(page.locator('#ov-registro-resp.show')).toBeVisible();
    await expect(page.locator('#rg-act')).toBeVisible();
    await expect(page.locator('#rg-pen')).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('rg-act') !== document.getElementById('rg-pen'))).toBe(true);
    await expect(page.locator('#ov-registro-resp .rg-th-b')).toHaveCount(4);
    await expect(page.locator('#ov-registro-resp .fo-cat')).toHaveCount(7);
    await page.fill('#rg-act', 'Redes sociales en el celular');
    await page.locator('#ov-registro-resp [data-cat="pantalla"]').click();
    await page.locator('#ov-registro-resp .rg-th-b[data-th="actividad"][data-v="-1"]').click();
    await expect(page.locator('#rg-qh-actividad')).toBeVisible();                   // 👎 abre «qué hago la próxima vez»
    await expect(page.locator('#rg-apr-pensamiento')).toBeHidden();
    await page.fill('#rg-qh-actividad', 'Dejar el celular en otro cuarto');
    await page.fill('#rg-et-actividad', 'celular, procrastinar');
    await page.fill('#rg-pen', 'Tengo que terminar el final');
    await page.locator('#ov-registro-resp .rg-th-b[data-th="pensamiento"][data-v="1"]').click();
    await page.locator('#rg-en [data-en="2"]').click();
    // Lo tipeado sobrevive a los redibujados del formulario.
    expect(await page.inputValue('#rg-act')).toBe('Redes sociales en el celular');
    expect(await page.inputValue('#rg-qh-actividad')).toBe('Dejar el celular en otro cuarto');
    expect(await sinScrollH(page)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('responder.png') });
    await page.click('#rg-guardar');
    await expect(page.locator('#ov-registro-resp.show')).toHaveCount(0);

    const d1 = await page.evaluate(() => ({ r: S.registroRespuestas, a: S.aprendizajes }));
    expect(d1.r).toHaveLength(1);
    expect(d1.r[0]).toMatchObject({ registroId: 'reg_principal', slot: '2026-11-24T11:00', fecha: '2026-11-24', actividad: 'Redes sociales en el celular', categoria: 'pantalla',
      pensamiento: 'Tengo que terminar el final', energia: 2, valAct: -1, valPen: 1 });
    expect(d1.a).toHaveLength(1);
    expect(d1.a[0]).toMatchObject({ respuestaId: d1.r[0].id, sobre: 'actividad', queHago: 'Dejar el celular en otro cuarto', etiquetas: ['celular', 'procrastinar'], principioId: '' });

    // Reabrir el mismo aviso corrige la respuesta (una por aviso, sin duplicar).
    await clickAviso(page, n1[0].url);
    await expect(page.locator('#rg-act')).toHaveValue('Redes sociales en el celular');
    await page.evaluate(() => Registros.cerrarForm());

    // Segundo aviso (15:00): al poner 👎 con la misma etiqueta aparece lo que ya te habías propuesto.
    await a(page, 15, 2);
    await page.evaluate(() => checkReminderNotifications());
    const n2 = await page.evaluate(() => window.__notifs.map((x) => x.tag));
    expect(n2).toContain('reg_reg_principal@2026-11-24T15:00');
    await clickAviso(page, '#registro-reg_principal@2026-11-24T15:00');
    await page.fill('#rg-act', 'Mirando series con el celular');
    await page.locator('#ov-registro-resp .rg-th-b[data-th="actividad"][data-v="-1"]').click();
    await expect(page.locator("#rg-sug-actividad .rg-sug")).toContainText("Dejar el celular en otro cuarto");   // sin etiqueta propia: coincide por la palabra «celular»
    await page.fill('#rg-et-actividad', 'procrastinar');
    await expect(page.locator('#rg-sug-actividad .rg-sug')).toContainText('Dejar el celular en otro cuarto');
    await page.fill('#rg-et-actividad', 'otra-cosa');
    await page.fill('#rg-act', 'Cocinando');
    await expect(page.locator('#rg-sug-actividad .rg-sug')).toHaveCount(0);        // nada parecido: no sugiere
    await page.fill('#rg-act', 'Con el celular todo el rato');
    await page.fill('#rg-et-actividad', 'procrastinar');
    await expect(page.locator('#rg-sug-actividad .rg-sug')).toContainText('Dejar el celular en otro cuarto');
    expect(await sinScrollH(page)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('sugerencia.png') });

    // Convertir en principio: un toque; queda creado una sola vez.
    await page.locator('#rg-sug-actividad .rg-conv').click();
    const pr = await page.evaluate(() => S.principios.principios.filter((p) => p.fuente === 'Registros'));
    expect(pr).toHaveLength(1);
    expect(pr[0]).toMatchObject({ tipo: 'principio', enunciado: 'Dejar el celular en otro cuarto', haz: 'Dejar el celular en otro cuarto', seccion: 'Vida' });
    expect(pr[0].porque).toContain('Redes sociales en el celular');
    expect(await page.evaluate(() => S.aprendizajes[0].principioId)).toBe(pr[0].id);
    await expect(page.locator('#rg-sug-actividad')).toContainText('Ya es un principio');
    expect(await page.evaluate(() => Principios.crearDesdeAprendizaje(S.aprendizajes[0]))).toMatchObject({ ok: true, ya: true });
    expect(await page.evaluate(() => S.principios.principios.filter((p) => p.fuente === 'Registros').length)).toBe(1);
    await page.click('#rg-guardar');
    expect(await page.evaluate(() => S.registroRespuestas.length)).toBe(2);
    expect(await page.evaluate(() => S.aprendizajes.map((x) => x.queHago))).toEqual(['Dejar el celular en otro cuarto', '']);   // solo etiqueta: se guarda, pero no se sugiere hasta que diga qué hacer

    // Chequeos viejos de Foco: siguen ahí y se ven en el historial.
    await page.evaluate(() => { _foData().chequeos.push({ fecha: '2026-11-24', hora: '10:15', categoria: 'estudio', energia: 4 }); });
    const focoAntes = await page.evaluate(() => JSON.stringify(S.foco.chequeos));

    // Historial del día
    await page.click('#rg-abrir-hist');
    await expect(page.locator('#ov-registros-hist.show')).toBeVisible();
    const ents = page.locator('#rg-h-res .rg-ent:not(.rg-sin)');
    await expect(ents).toHaveCount(3);                                              // 2 respuestas + el chequeo de Foco
    await expect(page.locator('#rg-h-res')).toContainText('chequeo anterior');
    await expect(page.locator('#rg-h-res .rg-sin .rg-sin-t', { hasText: 'Sin respuesta' }).first()).toBeVisible();   // el registro nuevo no se respondió
    expect(await page.evaluate(() => S.registroRespuestas.length)).toBe(2);         // «sin respuesta» no se guarda
    expect(await page.evaluate(() => JSON.stringify(S.foco.chequeos))).toBe(focoAntes);
    await expect(page.locator('#rg-h-res .rg-lbl', { hasText: 'Hacía' }).first()).toBeVisible();
    await expect(page.locator('#rg-h-res .rg-lbl', { hasText: 'Pensaba' })).toHaveCount(1);   // actividad y pensamiento separados
    expect(await sinScrollH(page)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('historial.png') });

    // Filtros
    await page.selectOption('#rg-h-val', 'down');
    await expect(ents).toHaveCount(2);
    await expect(page.locator('#rg-h-res .rg-sin')).toHaveCount(0);                // con filtros de contenido no hay «sin respuesta»
    await page.selectOption('#rg-h-sobre', 'pensamiento');
    await expect(ents).toHaveCount(0);                                              // el pensamiento tuvo 👍, no 👎
    await page.selectOption('#rg-h-val', 'up');
    await expect(ents).toHaveCount(1);
    await page.selectOption('#rg-h-val', ''); await page.selectOption('#rg-h-sobre', '');
    await page.selectOption('#rg-h-cat', 'estudio');
    await expect(ents).toHaveCount(1);
    await expect(ents.first()).toContainText('chequeo anterior');
    await page.selectOption('#rg-h-cat', '');
    await page.fill('#rg-h-texto', 'TODO EL RATO');
    await expect(ents).toHaveCount(1);
    await expect(ents.first()).toContainText('Con el celular todo el rato');
    await page.fill('#rg-h-texto', 'zzz-nada');
    await expect(page.locator('#rg-h-res')).toContainText('Nada coincide');
    await page.fill('#rg-h-texto', '');
    // Rango de fechas: ayer no tiene nada
    await page.fill('#rg-h-desde', '2026-11-20'); await page.fill('#rg-h-hasta', '2026-11-23');
    await expect(ents).toHaveCount(0);
    await page.locator('#rg-h-host .rg-presets [data-p="semana"]').click();
    await expect(ents).toHaveCount(3);

    // Resumen de la semana: reparto, energía por momento del día, 👍/👎
    const res = page.locator('#rg-h-res .pr-card').first();
    await expect(res).toContainText('3 respuestas');
    await expect(res).toContainText('Pantalla/distracción');
    await expect(res).toContainText('Estudio');
    await expect(res).toContainText('Mañana');
    await expect(res).toContainText('Actividades');
    await expect(res).toContainText('Salió mal');
    await expect(page.locator('#rg-h-res')).toContainText('Aprendizajes del período');
    await page.evaluate(() => CMOverlay.close('ov-registros-hist'));

    // Revisión semanal: el paso de resumen suma los 👍/👎 y los aprendizajes de la semana que cierra (16 al 22 de noviembre).
    await page.evaluate(() => {
      S.registroRespuestas.push({ id: 'old1', registroId: 'reg_principal', fecha: '2026-11-18', hora: '11:05', slot: '2026-11-18T11:00', actividad: 'Gym', categoria: 'gym', pensamiento: '', energia: 5, valAct: 1, valPen: 0, extras: [] },
        { id: 'old2', registroId: 'reg_principal', fecha: '2026-11-19', hora: '15:05', slot: '2026-11-19T15:00', actividad: 'Nada', categoria: 'otro', pensamiento: 'miedo', energia: 2, valAct: -1, valPen: -1, extras: [] });
      S.aprendizajes.push({ id: 'oldap', fecha: '2026-11-19', registroId: 'reg_principal', respuestaId: 'old2', sobre: 'actividad', contexto: 'Nada', etiquetas: [], queHago: 'Salir a caminar', principioId: '' });
    });
    await page.evaluate(() => abrirRevisionSemanal());
    await expect(page.locator('#ov-revision-semanal.show')).toBeVisible();
    for (let i = 0; i < 3; i++) await page.evaluate(() => _rsNext());
    await expect(page.locator('#rs-registros')).toContainText('2 respuesta(s): 1 👍 y 2 👎');
    await expect(page.locator('#rs-registros')).toContainText('1 aprendizaje(s) nuevo(s)');
    await page.evaluate(() => CMOverlay.close('ov-revision-semanal'));

    // Recarga real: todo se conserva y la tarjeta vuelve a dibujarse.
    await page.evaluate(() => saveState());
    const antes = await page.evaluate(() => JSON.stringify({ r: S.registros, p: S.registroRespuestas, a: S.aprendizajes }));
    await page.reload();
    await waitForBoot(page); await completeLoginOverlay(page);
    await irAVida(page);
    expect(await page.evaluate(() => JSON.stringify({ r: S.registros, p: S.registroRespuestas, a: S.aprendizajes }))).toBe(antes);
    await expect(page.locator('#registros-body .rg-row')).toHaveCount(2);
    expect(await page.evaluate(() => S.registros.filter((r) => r.principal).length)).toBe(1);   // no se vuelve a crear
    expect(await page.evaluate(() => S.principios.principios.filter((p) => p.fuente === 'Registros').length)).toBe(1);
    await page.locator('#ov-registros .cm-panel').screenshot({ path: testInfo.outputPath('tarjeta.png') });
    expect(await sinScrollH(page)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('destino del aviso con la app cerrada (#registro-… en la URL) abre el formulario de esa ocurrencia', async ({ cmPage: page, consoleErrors }) => {
    await a(page, 11, 2);
    await page.goto('/?t=2#registro-reg_principal@2026-11-24T11:00');
    await waitForBoot(page); await completeLoginOverlay(page);
    await expect(page.locator('#ov-registro-resp.show')).toBeVisible();
    await expect(page.locator('#rg-act')).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe('');
    expect(consoleErrors).toEqual([]);
  });

  test('ocurrencia sin responder: la tarjeta lo dice y «Responder» abre justo ese aviso', async ({ cmPage: page }) => {
    await a(page, 11, 20);
    await irAVida(page);
    await antiguar(page);
    await page.evaluate(() => rgRenderCard());
    await expect(page.locator('#registros-body .rg-pen')).toContainText('Sin responder: 11:00');
    await page.locator('#registros-body .rg-resp').click();
    await expect(page.locator('#ov-registro-resp')).toContainText('Aviso de las 11:00');
  });

  test('Foco: las horas del chequeo y las del registro principal son las mismas, y los cruces suman las respuestas del registro', async ({ cmPage: page }) => {
    await a(page, 12, 0);
    await page.evaluate(() => Principios.abrir('foco'));
    await expect(page.locator('#fo-horas')).toBeVisible();
    await page.fill('#fo-nueva', '17:30');
    await page.locator('#fo-horas button', { hasText: 'Agregar hora' }).click();
    expect(await page.evaluate(() => S.registros.find((r) => r.principal).frecuencia.horas)).toEqual(['11:00', '15:00', '17:30', '19:00']);
    // Cinco respuestas del registro con categoría → el reparto de Foco las cuenta.
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) S.registroRespuestas.push({ id: 'z' + i, registroId: 'reg_principal', fecha: '2026-11-24', hora: '1' + i + ':00', slot: '', actividad: '', categoria: 'estudio', pensamiento: '', energia: 4, valAct: 0, valPen: 0, extras: [] });
      prRender();
    });
    await expect(page.locator('#fo-reparto')).toContainText('Estudio');
  });

  test('varias categorías: se eligen 2 fijas + 1 propia, se guarda, historial, filtros, resumen por menciones, registro viejo y recarga', async ({ cmPage: page, consoleErrors }) => {
    test.setTimeout(120000);
    const SHOTS = 'C:/Users/Tobias/AppData/Local/Temp/claude/5d52610f902b8d2c/0ee1a2f9-6695-4db7-81d3-bffab298c7c8/scratchpad/rg-multicat/';
    await page.setViewportSize({ width: 390, height: 844 });
    await a(page, 11, 2);
    await irAVida(page);
    await antiguar(page);
    const abrir = async () => { await page.evaluate(() => Registros.responder('reg_principal')); await expect(page.locator('#ov-registro-resp.show #rg-cat-otra')).toBeVisible(); };
    const on = page.locator('#ov-registro-resp .fo-cat.on');
    const cats = () => page.evaluate(() => S.registroRespuestas.map((r) => ({ categoria: r.categoria, categorias: r.categorias })));

    // 1) Dos fijas + una propia (Enter la agrega como chip elegido; Enter no guarda el registro).
    await abrir();
    await page.fill('#rg-act', 'Comí, leí y resolví un pendiente');
    await page.locator('#ov-registro-resp .fo-cat[data-cat="estudio"]').click();
    await page.locator('#ov-registro-resp .fo-cat[data-cat="gym"]').click();
    await expect(on).toHaveCount(2);
    await page.fill('#rg-cat-otra', '  Lectura   de   papers  ');
    await expect(on).toHaveCount(2);   // escribir sola no elige: hace falta Enter o +
    await page.press('#rg-cat-otra', 'Enter');
    await expect(on).toHaveCount(3);
    await expect(page.locator('#ov-registro-resp .rg-cat-propia.on')).toHaveText('Lectura de papers');
    await expect(page.locator('#rg-cat-otra')).toHaveValue('');
    await expect(page.locator('#ov-registro-resp.show')).toBeVisible();
    expect(await page.evaluate(() => S.registroRespuestas.length)).toBe(0);
    expect(await sinScrollH(page)).toBe(true);
    await page.screenshot({ path: SHOTS + 'form-390.png' });
    // Tocar una elegida la quita; volver a tocarla la pone.
    await page.locator('#ov-registro-resp .fo-cat[data-cat="gym"]').click();
    await expect(on).toHaveCount(2);
    await page.locator('#ov-registro-resp .fo-cat[data-cat="gym"]').click();
    await expect(on).toHaveCount(3);
    await page.click('#rg-guardar');
    expect(await cats()).toEqual([{ categoria: 'estudio', categorias: ['estudio', 'Lectura de papers', 'gym'] }]);   // orden de elección (gym se quitó y se volvió a poner)

    // 2) Misma propia en otra forma: se agrupa (no duplica); el botón + también agrega.
    await abrir();
    await expect(page.locator('#ov-registro-resp .rg-cat-propia')).toHaveText(['Lectura de papers']);   // sugerida
    await page.locator('#ov-registro-resp .rg-cat-propia').click();
    await page.fill('#rg-cat-otra', 'LECTURA DE PAPERS');
    await page.click('#rg-cat-mas');
    await expect(on).toHaveCount(1);
    expect(await page.evaluate(() => _rgF.cats)).toEqual(['Lectura de papers']);
    await page.fill('#rg-cat-otra', 'x'.repeat(60));
    await page.click('#rg-cat-mas');
    expect(await page.evaluate(() => _rgF.cats.map((c) => c.length))).toEqual([17, 40]);
    await page.locator('#ov-registro-resp .rg-cat-propia.on').last().click();   // la quita: desaparece (no estaba guardada)
    await expect(on).toHaveCount(1);
    await page.fill('#rg-act', 'Más lectura');
    await page.click('#rg-guardar');

    // 3) Lo escrito y no confirmado con + igual entra al guardar.
    await abrir();
    await page.locator('#ov-registro-resp .fo-cat[data-cat="gym"]').click();
    await page.fill('#rg-cat-otra', 'Charla');
    await page.fill('#rg-act', 'Hablé con alguien');
    await page.click('#rg-guardar');

    // Tope: no se pasa de 6.
    await abrir();
    for (const c of ['estudio', 'gym', 'trabajo', 'pantalla', 'social', 'descanso']) await page.locator('#ov-registro-resp .fo-cat[data-cat="' + c + '"]').click();
    await page.fill('#rg-cat-otra', 'Séptima'); await page.press('#rg-cat-otra', 'Enter');
    expect(await page.evaluate(() => _rgF.cats.length)).toBe(6);
    await page.evaluate(() => Registros.cerrarForm());

    // 4) Registro viejo con solo `categoria`: se edita, aparece seleccionada y al guardar escribe ambos campos.
    await page.evaluate(() => { S.registroRespuestas.push({ id: 'old1', registroId: 'reg_principal', fecha: '2026-11-24', hora: '08:05', slot: '', actividad: 'Repaso viejo', categoria: 'estudio', pensamiento: '', energia: null, valAct: 0, valPen: 0, extras: [] }); });
    await page.evaluate(() => Registros.editarRespuesta('old1'));
    await expect(page.locator('#ov-registro-resp.show #rg-cat-otra')).toBeVisible();
    await expect(on).toHaveCount(1);
    await expect(page.locator('#ov-registro-resp .fo-cat[data-cat="estudio"]')).toHaveClass(/on/);
    await page.locator('#ov-registro-resp .fo-cat[data-cat="gym"]').click();
    await page.click('#rg-guardar');
    const old = await page.evaluate(() => S.registroRespuestas.find((r) => r.id === 'old1'));
    expect(old.categoria).toBe('estudio');
    expect(old.categorias).toEqual(['estudio', 'gym']);

    // 5) Historial: todos los chips, filtro por cada categoría, búsqueda y resumen por menciones.
    await page.evaluate(() => { _rgH.preset = 'hoy'; });
    await page.evaluate(() => Registros.abrirHistorial());
    await expect(page.locator('#ov-registros-hist.show')).toBeVisible();
    const ents = page.locator('#rg-h-res .rg-ent:not(.rg-sin)');
    await expect(ents).toHaveCount(4);
    await expect(ents.filter({ hasText: 'Comí, leí y resolví un pendiente' }).locator('.rg-chip.rg-cat')).toHaveText(['Estudio', 'Lectura de papers', 'Gym']);
    const filtro = async (v) => { await page.selectOption('#rg-h-cat', v); };
    await filtro('estudio'); await expect(ents).toHaveCount(2);
    await filtro('gym'); await expect(ents).toHaveCount(3);
    await filtro('lectura de papers'); await expect(ents).toHaveCount(2);
    await filtro({ label: 'Charla' }); await expect(ents).toHaveCount(1);
    await filtro(''); await expect(ents).toHaveCount(4);
    await page.fill('#rg-h-texto', 'charla'); await expect(ents).toHaveCount(1);
    await page.fill('#rg-h-texto', '');
    const res = page.locator('#rg-h-res .pr-card').first();
    // Menciones: estudio 2, gym 3, Lectura 2, Charla 1 = 8.
    await expect(res.locator('.fo-rep', { hasText: 'Gym' })).toContainText('3 · 38%');
    await expect(res.locator('.fo-rep', { hasText: 'Estudio' })).toContainText('2 · 25%');
    await expect(res.locator('.fo-rep', { hasText: 'Lectura de papers' })).toContainText('2 · 25%');
    await expect(res.locator('.fo-rep', { hasText: 'Charla' })).toContainText('1 · 13%');
    await expect(res).toContainText('Un registro con varias actividades cuenta en cada una');
    await page.screenshot({ path: SHOTS + 'historial-390.png' });
    await page.evaluate(() => CMOverlay.close('ov-registros-hist'));
    await page.setViewportSize({ width: 1280, height: 800 });
    await abrir();
    await page.locator('#ov-registro-resp .fo-cat[data-cat="estudio"]').click();
    await page.locator('#ov-registro-resp .fo-cat[data-cat="social"]').click();
    await page.screenshot({ path: SHOTS + 'form-1280.png' });
    await page.evaluate(() => Registros.cerrarForm());

    // 6) Recarga real: persiste.
    const antes = await page.evaluate(() => S.registroRespuestas.map((r) => [r.id, r.categoria, r.categorias]));
    await page.evaluate(() => saveState());
    await page.reload();
    await waitForBoot(page); await completeLoginOverlay(page);
    const despues = await page.evaluate(() => S.registroRespuestas.map((r) => [r.id, r.categoria, r.categorias]));
    expect(despues).toEqual(antes);
    expect(despues.find((x) => x[0] === 'old1')[2]).toEqual(['estudio', 'gym']);
    expect(consoleErrors).toEqual([]);
  });
});
