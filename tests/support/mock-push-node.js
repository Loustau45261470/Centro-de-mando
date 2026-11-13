// Precarga (node -r) para correr push-reminders.js SIN red ni Firestore real.
// Reemplaza web-push y firebase-admin por dobles en memoria:
//   MOCK_DOC  = ruta a un JSON con el documento appdata/lifedash_v2 de partida
//   MOCK_OUT  = ruta donde se escribe el documento resultante (tras cada set)
//   MOCK_SEND = 'ok' | código HTTP con el que falla el envío (ej. '410', '500')
//   MOCK_DEAD = subcadena: los envíos a endpoints que la contengan fallan con 410 (el resto, según MOCK_SEND)
//   MOCK_GET_FALLA = '1' hace fallar la lectura del documento (error fatal de main)
'use strict';
const fs = require('fs');
const Module = require('module');

const BORRAR = { __borrar: true };
const doc = JSON.parse(fs.readFileSync(process.env.MOCK_DOC, 'utf8'));
const envio = process.env.MOCK_SEND || 'ok';
const sends = [], payloads = [], dests = [];   // dests: { tag, endpoint } de cada envío

const volcar = () => fs.writeFileSync(process.env.MOCK_OUT, JSON.stringify({ doc, sends, payloads, dests }));

const ref = {
  get: async () => {
    if (process.env.MOCK_GET_FALLA === '1') throw new Error('firestore caído');
    return { data: () => JSON.parse(JSON.stringify(doc)) };
  },
  set: async (upd) => {
    // merge:true real: un objeto anidado se fusiona campo a campo (y el sentinel de borrado quita solo ese campo).
    Object.keys(upd).forEach(k => {
      if (upd[k] === BORRAR) delete doc[k];
      else if (upd[k] && typeof upd[k] === 'object' && !Array.isArray(upd[k]) && k === 'pushSubscriptions') {
        doc[k] = doc[k] || {};
        Object.keys(upd[k]).forEach(id => { if (upd[k][id] === BORRAR) delete doc[k][id]; else doc[k][id] = upd[k][id]; });
      } else doc[k] = upd[k];
    });
    volcar();
  },
};

const dobles = {
  'web-push': {
    setVapidDetails() {},
    sendNotification: async (sub, payload) => {
      sends.push(JSON.parse(payload).tag); payloads.push(JSON.parse(payload)); dests.push({ tag: JSON.parse(payload).tag, endpoint: sub.endpoint });
      if (process.env.MOCK_DEAD && sub.endpoint.includes(process.env.MOCK_DEAD)) { const e = new Error('mock 410'); e.statusCode = 410; throw e; }
      if (envio === 'ok') return { statusCode: 201 };
      const e = new Error('mock ' + envio); e.statusCode = Number(envio); throw e;
    },
  },
  'firebase-admin/app': { initializeApp() {}, cert: x => x },
  'firebase-admin/firestore': {
    getFirestore: () => ({
      collection: () => ({ doc: () => ref }),
      // MOCK_REESCRIBIR = JSON { <idDispositivo>: <sub> }: simula una re-suscripción que llega justo antes de la transacción.
      runTransaction: async (fn) => {
        if (process.env.MOCK_REESCRIBIR) {
          const r = JSON.parse(process.env.MOCK_REESCRIBIR); doc.pushSubscriptions = doc.pushSubscriptions || {};
          Object.keys(r).forEach(id => { doc.pushSubscriptions[id] = { sub: r[id], ua: 'x', updatedAt: 9 }; });
        }
        const tx = {
          get: async () => ref.get(),
          update: (_r, upd) => {
            Object.keys(upd).forEach(k => {
              const p = k.split('.'); let o = doc;
              p.slice(0, -1).forEach(x => { o = o[x] = o[x] || {}; });
              if (upd[k] === BORRAR) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = upd[k];
            });
          },
        };
        const out = await fn(tx); volcar(); return out;
      },
    }),
    FieldValue: { delete: () => BORRAR },
  },
};

const load = Module._load;
Module._load = function (request, ...rest) {
  return dobles[request] || load.call(this, request, ...rest);
};
// Si el script termina sin ningún set (p. ej. "sin datos"), igual deja el resultado.
process.on('exit', () => { try { if (!fs.existsSync(process.env.MOCK_OUT)) volcar(); } catch (e) {} });
