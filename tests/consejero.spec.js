// Etapa D: Consejero con IA (consejero.js). SIN llamadas reales: todo request a generativelanguage.googleapis.com se intercepta con fixtures.
// Las claves de los tests son inventadas (no son claves reales) y nunca se imprimen: solo se comparan.
'use strict';
const { test, expect } = require('./support/fixtures');

const KEY = 'fake-free-key-for-tests-0001-xxxxxxxx';
const KEY_PAGA = 'fake-paid-key-for-tests-0002-yyyyyyyy';
const URL_IA = '**/generativelanguage.googleapis.com/**';
const sinScrollH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const OK = (texto) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }] }) });

// Intercepta Gemini; devuelve la lista de requests {url, key, body}. `responder(route, n)` decide la respuesta.
async function espiar(page, responder) {
  const reqs = [];
  await page.route(URL_IA, async (route) => {
    const r = route.request();
    reqs.push({ url: r.url(), key: r.headers()['x-goog-api-key'] || null, body: r.postData() || '' });
    if (responder) await responder(route, reqs.length); else await route.fulfill(OK('Respuesta de prueba.'));
  });
  return reqs;
}
async function sembrar(page, { principios = true, key = KEY } = {}) {
  await page.clock.setFixedTime(new Date(2026, 10, 12, 12, 0));
  await page.evaluate(([p, k]) => {
    localStorage.removeItem('cm_consejero_uso'); localStorage.removeItem('cm_consejero_paga'); localStorage.removeItem('cm_consejero_key_paga'); localStorage.removeItem('jarvis_gemini_key');
    if (k) localStorage.setItem('jarvis_gemini_key', k);
    const d = _prData();
    d.principios = p ? [
      { id: 'p1', tipo: 'principio', enunciado: 'Lo más difícil primero', porque: 'La energía es máxima a la mañana', seccion: 'Vida', haz: 'Empezar por la tarea dura', noHagas: 'Abrir el celular al despertar', fuente: 'Libro X' },
      { id: 'p2', tipo: 'principio', enunciado: 'No gastar en lo que no planifiqué', porque: 'El ahorro se defiende', seccion: 'Economía', haz: 'Mirar el presupuesto', noHagas: 'Comprar por impulso', fuente: '' },
      { id: 'p3', tipo: 'anti', enunciado: 'Posponer la facultad', porque: 'Se acumula', seccion: 'Conocimiento', haz: '', noHagas: 'Dejar para la noche anterior', fuente: '' },
    ] : [];
    d.objetivos = [{ id: 'ob1', texto: 'Recibirme en 2028', horizonte: 'largo', seccion: 'Conocimiento', estado: 'pendiente' }, { id: 'ob2', texto: 'Ahorrar un fondo anual', horizonte: 'anual', seccion: 'Economía', estado: 'pendiente' }];
    S.foco = { dias: { '2026-11-11': { atencion: 4, energia: 3, nota: 'Buen día de estudio' } }, chequeos: [], pantalla: {}, config: { horas: [] } };
  }, [principios, key]);
}
const abrir = async (page) => { await page.evaluate(() => Principios.abrir('consejero')); await expect(page.locator('#ov-principios .pr-sub.on')).toContainText('Consejero'); };
const consultar = async (page, txt) => { await page.fill('#cn-txt', txt); await page.click('#cn-go'); };

test.describe('Consejero', () => {
  test('0 principios: no llama a la IA y avisa', async ({ cmPage, consoleErrors }) => {
    const reqs = await espiar(cmPage);
    await sembrar(cmPage, { principios: false }); await abrir(cmPage);
    await expect(cmPage.locator('#cn-root')).toContainText('Cargá principios primero');
    await consultar(cmPage, 'Quiero comprarme algo');
    await expect(cmPage.locator('#cn-error')).toContainText('Cargá principios primero');
    expect(reqs).toHaveLength(0);
    expect(consoleErrors).toEqual([]);
  });

  test('sin clave: aparece el campo con la nota de privacidad y al pegarla se guarda en jarvis_gemini_key', async ({ cmPage }) => {
    const reqs = await espiar(cmPage);
    await sembrar(cmPage, { key: null }); await abrir(cmPage);
    await expect(cmPage.locator('#cn-key')).toBeVisible();
    await expect(cmPage.locator('#cn-root')).toContainText('En el plan gratuito de Google, lo que mandás puede usarse para mejorar sus modelos. Con una clave de plan pago no.');
    await consultar(cmPage, 'Algo');
    await expect(cmPage.locator('#cn-error')).toContainText('Falta la clave');
    expect(reqs).toHaveLength(0);
    await cmPage.fill('#cn-key', KEY); await cmPage.click('.cn-fila button');
    await expect(cmPage.locator('#cn-key')).toHaveCount(0);
    expect(await cmPage.evaluate((k) => localStorage.getItem('jarvis_gemini_key') === k, KEY)).toBe(true);
  });

  test('con clave de JARVIS ya cargada no pide nada', async ({ cmPage }) => {
    await sembrar(cmPage); await abrir(cmPage);
    await expect(cmPage.locator('#cn-key')).toHaveCount(0);
  });

  test('consulta: el prompt trae todos los principios, objetivos y datos, sin la clave; la clave va en el header y no en la URL', async ({ cmPage, consoleErrors }, testInfo) => {
    const reqs = await espiar(cmPage, (route) => route.fulfill(OK('Según "Lo más difícil primero", empezá por la tarea dura.\n\nPor qué: la energía es máxima a la mañana.')));
    await sembrar(cmPage); await abrir(cmPage);
    await consultar(cmPage, 'No me puedo levantar temprano a estudiar');
    await expect(cmPage.locator('#cn-resp')).toContainText('Lo más difícil primero');
    expect(reqs).toHaveLength(1);
    const q = reqs[0], b = JSON.parse(q.body), sys = b.systemInstruction.parts[0].text, user = b.contents[0].parts[0].text;
    for (const t of ['Lo más difícil primero', 'La energía es máxima a la mañana', 'Empezar por la tarea dura', 'Abrir el celular al despertar', 'Libro X', 'No gastar en lo que no planifiqué', 'Posponer la facultad', 'A EVITAR', 'Recibirme en 2028', 'Ahorrar un fondo anual', 'No me puedo levantar temprano a estudiar', 'Buen día de estudio', 'Gastos']) expect(user, t).toContain(t);
    expect(user).toContain('Período: Noviembre 2026');
    expect(sys).toContain('Ningún principio de tu biblioteca aplica');
    expect(JSON.stringify(b).includes(KEY)).toBe(false);
    expect(q.url.includes(KEY) || q.url.includes('key=')).toBe(false);
    expect(q.key === KEY).toBe(true);
    expect(await cmPage.evaluate(() => cnUsoHoy())).toBe(1);
    expect(await sinScrollH(cmPage)).toBe(true);
    await cmPage.screenshot({ path: testInfo.outputPath('consejero-respuesta.png') });
    expect(consoleErrors).toEqual([]);
  });

  test('tamaño típico del prompt con 40 principios completos', async ({ cmPage }, testInfo) => {
    await sembrar(cmPage);
    const n = await cmPage.evaluate(() => {
      const d = _prData(); d.principios = [];
      for (let i = 0; i < 40; i++) d.principios.push({ id: 'x' + i, tipo: i % 5 ? 'principio' : 'anti', enunciado: 'Enunciado número ' + i + ' de un principio de vida bastante típico, con su frase', porque: 'Porque esto es lo que da resultado a largo plazo y evita el arrepentimiento posterior en la vida diaria', seccion: 'Vida', haz: 'Hacer tal cosa concreta todos los días a la misma hora', noHagas: 'No dejar que la distracción gane la partida', fuente: 'Un libro cualquiera' });
      const p = cnArmarPrompt(cnReunirDatos('Una situación de ejemplo de tamaño medio para consultar al consejero sobre mi día.'));
      return { chars: p.system.length + p.user.length, truncado: p.truncado };
    });
    testInfo.annotations.push({ type: 'tamaño del prompt (40 principios)', description: n.chars + ' caracteres' });
    console.log('PROMPT_CHARS_40_PRINCIPIOS=' + n.chars);
    expect(n.chars).toBeLessThan(40000); expect(n.truncado).toBe(false);
  });

  test('la respuesta del modelo con HTML se muestra escapada (nada se inyecta)', async ({ cmPage, consoleErrors }) => {
    await espiar(cmPage, (route) => route.fulfill(OK('Hola <img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> **negrita**')));
    await sembrar(cmPage); await abrir(cmPage);
    await consultar(cmPage, 'Probar');
    await expect(cmPage.locator('#cn-resp')).toContainText('<img src=x onerror="window.__xss=1">');
    await expect(cmPage.locator('#cn-resp img, #cn-resp script')).toHaveCount(0);
    expect(await cmPage.evaluate(() => window.__xss)).toBeUndefined();
    expect(consoleErrors).toEqual([]);
  });

  test('interruptor "Usar clave paga": pide su propia clave y usa esa en el header', async ({ cmPage }) => {
    const reqs = await espiar(cmPage);
    await sembrar(cmPage); await abrir(cmPage);
    await cmPage.locator('#cn-paga').check();
    await expect(cmPage.locator('#cn-key')).toBeVisible();   // pide la clave paga
    await consultar(cmPage, 'Algo');
    await expect(cmPage.locator('#cn-error')).toContainText('clave paga');
    expect(reqs).toHaveLength(0);   // no cae a la gratuita en silencio
    await cmPage.fill('#cn-key', KEY_PAGA); await cmPage.click('.cn-fila button');
    expect(await cmPage.evaluate((k) => localStorage.getItem('cm_consejero_key_paga') === k && localStorage.getItem('jarvis_gemini_key') !== k, KEY_PAGA)).toBe(true);
    await consultar(cmPage, 'Algo');
    await expect(cmPage.locator('#cn-resp')).toBeVisible();
    expect(reqs).toHaveLength(1); expect(reqs[0].key === KEY_PAGA).toBe(true);
    await cmPage.locator('#cn-paga').uncheck();   // vuelve a la gratuita
    await consultar(cmPage, 'Otra');
    await expect(cmPage.locator('#cn-uso')).toContainText('2 de 30');
    expect(reqs).toHaveLength(2); expect(reqs[1].key === KEY).toBe(true);
  });

  test('límite de 30 por día: a la 31 no se llama; al otro día se reinicia', async ({ cmPage }) => {
    const reqs = await espiar(cmPage);
    await sembrar(cmPage); await abrir(cmPage);
    await cmPage.evaluate(() => localStorage.setItem('cm_consejero_uso', JSON.stringify({ f: _cnHoy(), n: 30 })));
    await consultar(cmPage, 'Algo');
    await expect(cmPage.locator('#cn-error')).toContainText('máximo de 30 consultas');
    expect(reqs).toHaveLength(0);
    await cmPage.evaluate(() => localStorage.setItem('cm_consejero_uso', JSON.stringify({ f: '2026-11-11', n: 30 })));
    await consultar(cmPage, 'Algo');
    await expect(cmPage.locator('#cn-resp')).toBeVisible();
    expect(reqs).toHaveLength(1);
  });

  test('errores 429, 400, 500, sin red y respuesta vacía: mensaje claro, sin datos sensibles, y la ventana sigue andando', async ({ cmPage }) => {
    const casos = [
      [(r) => r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { message: 'quota for key ' + KEY } }) }), 'cuota de Google'],
      [(r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'API key not valid ' + KEY } }) }), 'Google rechazó la clave'],
      [(r) => r.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' }), 'no respondió bien'],
      [(r) => r.abort('failed'), 'No hay conexión'],
      [(r) => r.fulfill(OK('')), 'no devolvió una respuesta'],
    ];
    let paso = 0;
    await espiar(cmPage, (route) => casos[paso][0](route));
    await sembrar(cmPage); await abrir(cmPage);
    for (paso = 0; paso < casos.length; paso++) {
      await consultar(cmPage, 'Algo ' + paso);
      await expect(cmPage.locator('#cn-error')).toContainText(casos[paso][1]);
      expect(((await cmPage.locator('#cn-error').textContent()) || '').includes(KEY)).toBe(false);
      await expect(cmPage.locator('#cn-go')).toBeEnabled();
    }
    await cmPage.locator('#ov-principios .pr-sub', { hasText: 'Principios' }).click();   // el resto de la ventana sigue funcionando
    await expect(cmPage.locator('#ov-principios .pr-sub.on')).toContainText('Principios');
  });

  test('doble clic: una sola consulta; el botón queda deshabilitado mientras consulta', async ({ cmPage }) => {
    let liberar; const compuerta = new Promise((r) => { liberar = r; });
    const reqs = await espiar(cmPage, async (route) => { await compuerta; await route.fulfill(OK('Listo.')); });
    await sembrar(cmPage); await abrir(cmPage);
    await cmPage.fill('#cn-txt', 'Algo');
    await cmPage.locator('#cn-go').dblclick();
    await expect(cmPage.locator('#cn-go')).toBeDisabled();
    await expect(cmPage.locator('#cn-go')).toHaveText('Consultando…');
    liberar();
    await expect(cmPage.locator('#cn-resp')).toContainText('Listo.');
    expect(reqs).toHaveLength(1);
  });

  test('móvil: sin scroll horizontal y botones de al menos 44px', async ({ cmPage }, testInfo) => {
    await espiar(cmPage);
    await sembrar(cmPage, { key: null }); await abrir(cmPage);
    expect(await sinScrollH(cmPage)).toBe(true);
    await cmPage.screenshot({ path: testInfo.outputPath('consejero-sin-clave.png') });
    for (const sel of ['#cn-go', '.cn-fila button', '#ov-principios .pr-sub']) {
      const alto = await cmPage.locator(sel).first().evaluate((e) => e.getBoundingClientRect().height);
      expect(alto, sel).toBeGreaterThanOrEqual(43.5);
    }
    await cmPage.evaluate((k) => localStorage.setItem('jarvis_gemini_key', k), KEY);
    await cmPage.evaluate(() => Principios.sub('principios')); await cmPage.evaluate(() => Principios.sub('consejero'));
    await cmPage.fill('#cn-txt', 'Una situación bastante larga '.repeat(8)); await cmPage.click('#cn-go');
    await expect(cmPage.locator('#cn-resp')).toBeVisible();
    expect(await sinScrollH(cmPage)).toBe(true);
    await cmPage.screenshot({ path: testInfo.outputPath('consejero-con-respuesta.png') });
  });

  test('paleta de comandos: "Consejero" abre la sub-pestaña', async ({ cmPage }) => {
    await sembrar(cmPage);
    await cmPage.keyboard.press('Control+k');
    await cmPage.fill('#cmdk-input', 'consejero');
    await cmPage.locator('.cmdk-item').filter({ has: cmPage.locator('.ci-lbl', { hasText: /^Consejero$/ }) }).click();
    await expect(cmPage.locator('#ov-principios.show .pr-sub.on')).toContainText('Consejero');
    await expect(cmPage.locator('#cn-txt')).toBeVisible();
  });
});

test.describe('Consejero: veredicto del reporte', () => {
  const irAlVeredicto = async (page) => {
    await page.evaluate(() => ReportesVista.ver('mensual', '2026-11'));
    await expect(page.locator('#ov-reporte.show')).toBeVisible();
    const i = (await page.locator('.rv-page').count()) - 1;
    await page.locator('.rv-dot').nth(i).click();
    await expect(page.locator('.rv-dot').nth(i)).toHaveClass(/on/);
    await expect.poll(() => page.locator('.rv-page').nth(i).evaluate((p) => Math.abs(p.getBoundingClientRect().left - p.parentElement.getBoundingClientRect().left)), { timeout: 5000 }).toBeLessThan(2);
  };
  const item = (page) => page.evaluate(() => (S.reportes && S.reportes.items && S.reportes.items['mensual:2026-11']) || null);

  test('generar: guarda veredicto.ia listo, habilita "Estoy de acuerdo" y el prompt lleva KPIs, textos y principios; regenerar pide confirmación', async ({ cmPage, consoleErrors }, testInfo) => {
    await cmPage.emulateMedia({ reducedMotion: 'reduce' });
    let n = 0;
    const reqs = await espiar(cmPage, (route) => route.fulfill(OK('Veredicto número ' + (++n) + ': mes parejo.')));
    await sembrar(cmPage);
    await irAlVeredicto(cmPage);
    const pg = cmPage.locator('.rv-page').last();
    await expect(pg.locator('[data-rvact="acuerdo"]')).toBeDisabled();
    await pg.locator('[data-rvf="agr"]').fill('Agradezco la salud');
    await pg.locator('[data-rvf="agr"]').blur();
    await pg.locator('[data-rvact="veredicto"]').click();
    await expect(pg.locator('.rv-vtxt')).toContainText('Veredicto número 1');
    await expect(pg.locator('[data-rvact="acuerdo"]')).toBeEnabled();
    const it = await item(cmPage);
    expect(it.veredicto.ia.estado).toBe('listo'); expect(it.veredicto.ia.texto).toContain('Veredicto número 1'); expect(it.veredicto.ia.el).toBeTruthy();
    expect(it.agradecimientos).toBe('Agradezco la salud');
    const user = JSON.parse(reqs[0].body).contents[0].parts[0].text;
    for (const t of ['Lo más difícil primero', 'Agradezco la salud', 'Período: Noviembre 2026', 'EN CURSO', 'Escribí el veredicto']) expect(user, t).toContain(t);
    expect(JSON.parse(reqs[0].body).systemInstruction.parts[0].text).toContain('veredicto del período');
    expect(reqs[0].key === KEY).toBe(true);
    await expect(pg.locator('[data-rvact="veredicto"]')).toHaveText('Regenerar veredicto');
    await cmPage.screenshot({ path: testInfo.outputPath('veredicto-generado.png') });
    // regenerar: cancelar la confirmación no llama; aceptar reemplaza
    cmPage.once('dialog', (d) => d.dismiss());
    await pg.locator('[data-rvact="veredicto"]').click();
    expect(reqs).toHaveLength(1);
    cmPage.once('dialog', (d) => d.accept());
    await pg.locator('[data-rvact="veredicto"]').click();
    await expect(pg.locator('.rv-vtxt')).toContainText('Veredicto número 2');
    expect(reqs).toHaveLength(2);
    // con conformidad registrada ya no se regenera
    await pg.locator('[data-rvact="acuerdo"]').click();
    await expect(pg.locator('[data-rvact="veredicto"]')).toBeDisabled();
    expect(consoleErrors).toEqual([]);
  });

  test('si falla queda pendiente con el error visible', async ({ cmPage }) => {
    await espiar(cmPage, (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{}' }));
    await sembrar(cmPage);
    await irAlVeredicto(cmPage);
    const pg = cmPage.locator('.rv-page').last();
    await pg.locator('[data-rvact="veredicto"]').click();
    await expect(pg.locator('.rv-iaerr')).toContainText('cuota de Google');
    await expect(pg.locator('[data-rvact="acuerdo"]')).toBeDisabled();
    await expect(pg.locator('[data-rvact="veredicto"]')).toBeEnabled();
    const it = await item(cmPage);
    expect(!it || it.veredicto.ia.estado === 'pendiente').toBe(true);
  });

  test('conflicto editadoEn: si el reporte cambió en otro dispositivo mientras la IA pensaba, no se pisa', async ({ cmPage }) => {
    let liberar; const compuerta = new Promise((r) => { liberar = r; });
    let n = 0;
    await espiar(cmPage, async (route) => { if (++n === 2) await compuerta; await route.fulfill(OK('Texto ' + n)); });
    await sembrar(cmPage);
    await irAlVeredicto(cmPage);
    const pg = cmPage.locator('.rv-page').last();
    await pg.locator('[data-rvact="veredicto"]').click();
    await expect(pg.locator('.rv-vtxt')).toContainText('Texto 1');
    cmPage.once('dialog', (d) => d.accept());
    await pg.locator('[data-rvact="veredicto"]').click();   // 2.ª consulta, retenida
    await expect(pg.locator('[data-rvact="veredicto"]')).toBeDisabled();
    await cmPage.evaluate(() => { S.reportes.items['mensual:2026-11'].editadoEn = new Date(Date.now() + 60000).toISOString(); });   // "llegó" otra versión por sync
    liberar();
    await expect(pg.locator('.rv-iaerr')).toContainText('otro dispositivo');
    await expect(cmPage.locator('#rv-conf')).toBeVisible();
    expect((await item(cmPage)).veredicto.ia.texto).toBe('Texto 1');
  });
});

test.describe('Consejero: ajustes de review', () => {
  const irA = async (page, clave) => {
    await page.evaluate((c) => ReportesVista.ver('mensual', c), clave);
    await expect(page.locator('#ov-reporte.show')).toBeVisible();
  };

  test('veredicto de un mes pasado: sin cierres fuera del rango ni objetivos de hoy', async ({ cmPage }) => {
    const reqs = await espiar(cmPage);
    await sembrar(cmPage);
    await cmPage.evaluate(() => { S.foco.dias['2026-10-15'] = { atencion: 2, energia: 2, nota: 'Nota de octubre' }; });
    await irA(cmPage, '2026-10');
    await cmPage.locator('[data-rvact="veredicto"]').last().click();
    await expect.poll(() => reqs.length).toBe(1);
    const user = JSON.parse(reqs[0].body).contents[0].parts[0].text;
    expect(user).toContain('Nota de octubre');
    expect(user).not.toContain('Buen día de estudio');
    expect(user).not.toContain('Recibirme en 2028');
  });

  test('generar en A, abrir B, terminar: B queda con el botón habilitado', async ({ cmPage }) => {
    let liberar; const compuerta = new Promise((r) => { liberar = r; });
    const reqs = await espiar(cmPage, async (route) => { await compuerta; await route.fulfill(OK('Texto A')); });
    await sembrar(cmPage);
    await irA(cmPage, '2026-10');
    await cmPage.locator('[data-rvact="veredicto"]').last().click();
    await expect.poll(() => reqs.length).toBe(1);
    await irA(cmPage, '2026-09');
    liberar();
    await expect.poll(() => cmPage.evaluate(() => _rvIaBusy)).toBe(false);
    const b = cmPage.locator('[data-rvact="veredicto"]').last();
    await expect(b).toBeEnabled();
    await expect(b).toHaveText('Generar veredicto');
  });

  test('120 principios largos: el prompt no pasa de ~45 KB', async ({ cmPage }) => {
    await sembrar(cmPage);
    const r = await cmPage.evaluate(() => {
      const d = _prData(); d.principios = [];
      const L = (c) => c.repeat(2000);
      for (let i = 0; i < 120; i++) d.principios.push({ id: 'x' + i, tipo: 'principio', enunciado: 'Enunciado ' + i, porque: L('a'), seccion: 'Vida', haz: L('b'), noHagas: L('c'), fuente: '' });
      const p = cnArmarPrompt(cnReunirDatos('Algo'));
      return { chars: p.system.length + p.user.length, aviso: p.user.includes('biblioteca truncada') };
    });
    expect(r.chars).toBeLessThan(45000); expect(r.aviso).toBe(true);
  });

  test('25 aprendizajes: el veredicto propio del usuario igual entra en el prompt', async ({ cmPage }) => {
    await sembrar(cmPage);
    const user = await cmPage.evaluate(() => {
      const ap = []; for (let i = 0; i < 25; i++) ap.push({ seccion: 'Vida', error: 'Error ' + i, aprendizaje: 'Apr ' + i, propuesta: '' });
      const it = { estancamientos: {}, deterioro: {}, agradecimientos: '', aprendizajes: ap, veredicto: { manual: { texto: 'MI VEREDICTO PROPIO' } } };
      return cnArmarPrompt({ modo: 'veredicto', principios: [], textos: _rvTextosParaIA(it), hoy: '2026-11-12' }).user;
    });
    expect(user).toContain('MI VEREDICTO PROPIO');
  });

  test('timeout durante la lectura de la respuesta: mensaje de timeout', async ({ cmPage }) => {
    await sembrar(cmPage);
    const r = await cmPage.evaluate(async () => {
      window.fetch = async () => ({ ok: true, status: 200, json: () => Promise.reject(Object.assign(new Error('abortado'), { name: 'AbortError' })) });
      return cnLlamar({ system: 's', user: 'u' });
    });
    expect(r.ok).toBe(false); expect(r.error).toContain('más de 30 segundos');
  });
});
