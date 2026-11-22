// Construye el script que se inyecta con page.addInitScript ANTES de que corra
// cualquier script de la página. Reemplaza el firebase real (bloqueado por red
// vía page.route en fixtures.js) por un mock en memoria, y siembra localStorage
// con el estado de prueba — así _initApp() arranca sin Firestore ni Auth reales.
//
// Por qué es robusto:
// - window.firebase se define ANTES de que index.html intente cargar los SDKs
//   reales (bloqueados aparte), así que no hay carrera de sobreescritura.
// - onAuthStateChanged dispara recién en el evento 'load' de la ventana: para
//   entonces TODOS los <script> clásicos (incluidos los que definen renderGoals,
//   renderLawProgress, etc.) ya se ejecutaron, igual que en producción donde el
//   auth real resuelve de forma asíncrona después del parseo del documento.
// - localStorage solo se siembra si 'lifedash_v2' todavía no existe, así un
//   test puede mutar estado y hacer page.reload() sin que se pise el fixture.
'use strict';

function buildInitScript(fixtureObj) {
  const fixtureJson = JSON.stringify(JSON.stringify(fixtureObj));
  return `(function () {
    var STORE = new Map();

    // FieldValue.arrayUnion / arrayRemove: centinelas que set()/update() resuelven contra el valor previo del campo.
    function aplicarCentinelas(prev, data) {
      var out = Object.assign({}, data);
      Object.keys(out).forEach(function (k) {
        var v = out[k];
        if (v && v.__fv) {
          var cur = Array.isArray(prev && prev[k]) ? prev[k].slice() : [];
          var ser = function (x) { return JSON.stringify(x); };
          if (v.__fv === 'union') v.els.forEach(function (e) { if (!cur.some(function (c) { return ser(c) === ser(e); })) cur.push(e); });
          else cur = cur.filter(function (c) { return !v.els.some(function (e) { return ser(c) === ser(e); }); });
          out[k] = cur;
        }
      });
      return out;
    }

    function docRef(path) {
      return {
        id: path.split('/').pop(),
        __path: path,
        get: function () {
          // window.__cmLecturaVieja[path]: simula la caché vieja del iPhone (dato viejo con fromCache=false).
          // Solo afecta get(); las lecturas de runTransaction van siempre al STORE ("servidor").
          var vieja = window.__cmLecturaVieja ? window.__cmLecturaVieja[path] : undefined;
          var data = vieja !== undefined ? vieja : STORE.get(path);
          return Promise.resolve({
            exists: data !== undefined,
            data: function () { return data; },
            metadata: { fromCache: false },
          });
        },
        set: function (data, options) {
          var prev = STORE.get(path);
          data = aplicarCentinelas(prev, data);
          var merged = (options && options.merge && prev) ? Object.assign({}, prev, data) : Object.assign({}, data);
          STORE.set(path, merged);
          return Promise.resolve();
        },
        update: function (data) {
          var prev = STORE.get(path) || {};
          STORE.set(path, Object.assign({}, prev, aplicarCentinelas(prev, data)));
          return Promise.resolve();
        },
        delete: function () { STORE.delete(path); return Promise.resolve(); },
        onSnapshot: function (cb) { (window.__cmSnapCbs = window.__cmSnapCbs || []).push({ path: path, cb: cb }); return function () {}; },
      };
    }

    function collectionRef(name, filtros) {
      filtros = filtros || [];
      return {
        doc: function (id) { return docRef(name + '/' + id); },
        // where() solo sobre FieldPath.documentId() con >= y < (lo único que usa la app).
        where: function (campo, op, val) { return collectionRef(name, filtros.concat([[op, val]])); },
        get: function () {
          var docs = [];
          STORE.forEach(function (data, path) {
            if (path.indexOf(name + '/') === 0) {
              var id = path.slice(name.length + 1);
              var ok = filtros.every(function (f) { return f[0] === '>=' ? id >= f[1] : f[0] === '<' ? id < f[1] : true; });
              if (ok) docs.push({ id: id, data: function () { return data; }, ref: docRef(path) });
            }
          });
          return Promise.resolve({ docs: docs });
        },
      };
    }

    var mockUser = { uid: 'test-uid-e2e', email: 'test@example.com' };

    function mockAuth() {
      return {
        currentUser: mockUser,
        onAuthStateChanged: function (cb) {
          var fire = function () { cb(mockUser); };
          if (document.readyState === 'complete') setTimeout(fire, 0);
          else window.addEventListener('load', fire, { once: true });
          return function () {};
        },
        getRedirectResult: function () { return Promise.resolve({ user: null }); },
        signInWithPopup: function () { return Promise.resolve({ user: mockUser }); },
        signInWithRedirect: function () { return Promise.resolve(); },
      };
    }
    mockAuth.GoogleAuthProvider = function GoogleAuthProvider() {};

    var firestoreFn = function () {
        return {
          collection: collectionRef,
          runTransaction: function (fn) {
            var tx = {
              get: function (ref) {
                var key = ref.__path, data = STORE.get(key);
                return Promise.resolve({ exists: data !== undefined, data: function () { return data; }, metadata: { fromCache: false } });
              },
              set: function (ref, data, options) { ref.set(data, options); return tx; },
            };
            return Promise.resolve().then(function () { return fn(tx); });
          },
          enablePersistence: function () { return Promise.resolve(); },
        };
    };
    firestoreFn.FieldPath = { documentId: function () { return '__name__'; } };
    firestoreFn.FieldValue = {
      arrayUnion: function () { return { __fv: 'union', els: Array.prototype.slice.call(arguments) }; },
      arrayRemove: function () { return { __fv: 'remove', els: Array.prototype.slice.call(arguments) }; },
    };
    window.firebase = {
      initializeApp: function () {},
      appCheck: function () { return { activate: function () {} }; },
      firestore: firestoreFn,
      auth: mockAuth,
    };

    try {
      if (!localStorage.getItem('lifedash_v2')) {
        localStorage.setItem('lifedash_v2', ${fixtureJson});
      }
    } catch (e) {}
  })();`;
}

module.exports = { buildInitScript };
