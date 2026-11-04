'use strict';
// ════════════════════════════════════════════════════════════════════════
// DATOS PRIVADOS — acceso único a los archivos de la cartera de inversión
// (tenencias.json, latest.json, <YYYY-MM>.json). Viven en un repo PRIVADO de
// GitHub y el Worker (cf-worker/, ruta GET /datos/<archivo>) los sirve solo al
// dueño: Bearer = ID token de Firebase fresco, el mismo gate que /cartera.
// Los consumidores (tenencias, cartera-inversion, informes-datos, jarvis-brain,
// sgc) piden TODO por acá — no hay otro fetch de archivos de cartera.
//
// FALLBACK TRANSITORIO hasta borrar data/cartera del repo público: si el Worker
// todavía no tiene la ruta (viejo, sin desplegar), no hay red / sesión / token, o
// responde 401 / 5xx (incluye 500 missing_gh_token), se lee la copia pública
// data/cartera/<nombre>. Quitar `publico()` y su uso en `detalle()` en el paso de
// limpieza. NO cae al público ante 403 (otro usuario: devuelve null, sin filtrar),
// ni ante 400 / 404 'not_found' (el archivo no existe en el repo privado).
// ════════════════════════════════════════════════════════════════════════

const CMDatos = (() => {
  const BASE_WORKER = 'https://cdm-push-worker.tobiasloustau11.workers.dev/datos/';
  const TIMEOUT_MS = 8000;
  const SESION_ESPERA_MS = 5000;
  const NOMBRE_RE = /^[A-Za-z0-9_-]+\.json$/;

  // Al abrir la app Firebase restaura la sesión de forma asíncrona (currentUser es null un rato): se espera
  // el primer onAuthStateChanged en vez de caer al público de entrada. `_auth` es el global de app.js.
  function sesion() {
    if (typeof _auth === 'undefined' || !_auth) return Promise.resolve(null);
    if (_auth.currentUser) return Promise.resolve(_auth.currentUser);
    return new Promise(resolve => {
      let off = null, listo = false;
      const fin = u => { if (listo) return; listo = true; clearTimeout(t); if (off) off(); resolve(u || null); };
      const t = setTimeout(() => fin(null), SESION_ESPERA_MS);
      off = _auth.onAuthStateChanged(fin, () => fin(null));
      if (listo && off) off();
    });
  }

  // → { data, status } si el Worker dio una respuesta DEFINITIVA; null si hay que probar el fallback transitorio.
  async function delWorker(nombre) {
    const user = await sesion();
    if (!user || typeof user.getIdToken !== 'function') return null;
    const idToken = await user.getIdToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(BASE_WORKER + nombre, { headers: { authorization: `Bearer ${idToken}` }, cache: 'no-store', signal: ctrl.signal });
    } finally { clearTimeout(timer); }
    if (res.ok) return { data: await res.json(), status: 200 };
    if (res.status === 403 || res.status === 400) return { data: null, status: res.status };
    if (res.status === 404) {
      // 404 con { error: 'not_found' } = el Worker nuevo dice que el archivo no existe. Otro 404 = ruta inexistente (Worker viejo).
      const j = await res.json().catch(() => null);
      return j && j.error === 'not_found' ? { data: null, status: 404 } : null;
    }
    return null; // 401, 5xx, otros → transitorio
  }

  // FALLBACK TRANSITORIO hasta borrar data/cartera del repo público; quitar en el paso de limpieza.
  async function publico(nombre) {
    try {
      const r = await fetch('data/cartera/' + nombre, { cache: 'no-store' });
      if (!r.ok) return { data: null, status: r.status };
      return { data: await r.json(), status: 200 };
    } catch (_) { return { data: null, status: 0 }; }
  }

  // { data, status }: status 200 con data; 404 = no existe; 403 = no autorizado; 400 = nombre inválido; 0 = no se pudo leer.
  async function detalle(nombre) {
    if (!NOMBRE_RE.test(String(nombre))) return { data: null, status: 400 };
    let r = null;
    try { r = await delWorker(nombre); } catch (_) { r = null; } // red caída, timeout, token imposible, JSON roto → fallback
    return r || publico(nombre);
  }

  // El JSON ya parseado, o null.
  const cartera = nombre => detalle(nombre).then(r => r.data);

  return { cartera, carteraDetalle: detalle };
})();
window.CMDatos = CMDatos;
