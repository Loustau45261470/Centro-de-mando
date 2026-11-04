// Precarga (node -r) para correr push-reminders.js SIN red ni Firestore real.
// Reemplaza web-push y firebase-admin por dobles en memoria:
//   MOCK_DOC  = ruta a un JSON con el documento appdata/lifedash_v2 de partida
//   MOCK_OUT  = ruta donde se escribe el documento resultante (tras cada set)
//   MOCK_SEND = 'ok' | código HTTP con el que falla el envío (ej. '410', '500')
//   MOCK_GET_FALLA = '1' hace fallar la lectura del documento (error fatal de main)
'use strict';
const fs = require('fs');
const Module = require('module');

const BORRAR = { __borrar: true };
const doc = JSON.parse(fs.readFileSync(process.env.MOCK_DOC, 'utf8'));
const envio = process.env.MOCK_SEND || 'ok';
const sends = [];

const volcar = () => fs.writeFileSync(process.env.MOCK_OUT, JSON.stringify({ doc, sends }));

const ref = {
  get: async () => {
    if (process.env.MOCK_GET_FALLA === '1') throw new Error('firestore caído');
    return { data: () => JSON.parse(JSON.stringify(doc)) };
  },
  set: async (upd) => {
    Object.keys(upd).forEach(k => { if (upd[k] === BORRAR) delete doc[k]; else doc[k] = upd[k]; });
    volcar();
  },
};

const dobles = {
  'web-push': {
    setVapidDetails() {},
    sendNotification: async (sub, payload) => {
      sends.push(JSON.parse(payload).tag);
      if (envio === 'ok') return { statusCode: 201 };
      const e = new Error('mock ' + envio); e.statusCode = Number(envio); throw e;
    },
  },
  'firebase-admin/app': { initializeApp() {}, cert: x => x },
  'firebase-admin/firestore': {
    getFirestore: () => ({ collection: () => ({ doc: () => ref }) }),
    FieldValue: { delete: () => BORRAR },
  },
};

const load = Module._load;
Module._load = function (request, ...rest) {
  return dobles[request] || load.call(this, request, ...rest);
};
// Si el script termina sin ningún set (p. ej. "sin datos"), igual deja el resultado.
process.on('exit', () => { try { if (!fs.existsSync(process.env.MOCK_OUT)) volcar(); } catch (e) {} });
