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

    function docRef(path) {
      return {
        id: path.split('/').pop(),
        get: function () {
          var data = STORE.get(path);
          return Promise.resolve({
            exists: data !== undefined,
            data: function () { return data; },
            metadata: { fromCache: false },
          });
        },
        set: function (data, options) {
          var prev = STORE.get(path);
          var merged = (options && options.merge && prev) ? Object.assign({}, prev, data) : Object.assign({}, data);
          STORE.set(path, merged);
          return Promise.resolve();
        },
        update: function (data) {
          var prev = STORE.get(path) || {};
          STORE.set(path, Object.assign({}, prev, data));
          return Promise.resolve();
        },
        delete: function () { STORE.delete(path); return Promise.resolve(); },
        onSnapshot: function () { return function () {}; },
      };
    }

    function collectionRef(name) {
      return {
        doc: function (id) { return docRef(name + '/' + id); },
        get: function () {
          var docs = [];
          STORE.forEach(function (data, path) {
            if (path.indexOf(name + '/') === 0) {
              docs.push({ id: path.slice(name.length + 1), data: function () { return data; }, ref: docRef(path) });
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

    window.firebase = {
      initializeApp: function () {},
      appCheck: function () { return { activate: function () {} }; },
      firestore: function () {
        return {
          collection: collectionRef,
          enablePersistence: function () { return Promise.resolve(); },
        };
      },
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
