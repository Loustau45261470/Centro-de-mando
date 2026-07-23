// Centro de Mando — Service Worker
// Maneja Web Push, clicks de notificación, y caché offline del app shell.

const CACHE = 'cdm-shell-v182';
const BASE  = '/Centro-de-mando/';
const SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'styles.css',
  BASE + 'overlay-core.css',
  BASE + 'speed-dial.css',
  BASE + 'proyectos-overlay.css',
  BASE + 'app.js',
  BASE + 'workspace.js',
  BASE + 'abogacia.js',
  BASE + 'habitos.js',
  BASE + 'rutinas.js',
  BASE + 'finanzas.js',
  BASE + 'recordatorios.js',
  BASE + 'objetivos.js',
  BASE + 'overlay-core.js',
  BASE + 'speed-dial.js',
  BASE + 'proyectos-overlay.js',
  BASE + 'planificacion-overlay.js',
  BASE + 'secciones-fab.js',
  BASE + 'fichero-personas.js',
  BASE + 'pomodoro.js',
  BASE + 'finales.js',
  BASE + 'gamemode.js',
  BASE + 'gamemode-ui.js',
  BASE + 'gamemode.css',
  BASE + 'jarvis-agent.js',
  BASE + 'jarvis-brain.js',
  BASE + 'jarvis-bridge.js',
  BASE + 'jarvis-neural-fx.js',
  BASE + 'jarvis-voice.js',
  BASE + 'jarvis-ears.js',
  BASE + 'command-palette.js',
  BASE + 'telemetry.js',
  BASE + 'jarvis-intel.js',
  BASE + 'rich-notes.js',
  BASE + 'notas-intelecto.js',
  BASE + 'notas-estudio.js',
  BASE + 'salud-notas.js',
  BASE + 'finanzas-notas.js',
  BASE + 'cartera-inversion.js',
  BASE + 'sgc.js',
  BASE + 'login.js',
  BASE + 'theme-switcher.js',
  BASE + 'jarvis-core-stats.js',
  BASE + 'hud-ambient.js',
  BASE + 'icon.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'apple-touch-icon-180.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-check-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js',
];
// Emblemas del árbol de habilidades (PNG generados con IA)
['strength_1','strength_2','strength_3','combat_1','combat_2','combat_3','nutrition_1','nutrition_2','nutrition_3','endurance_1','endurance_2','endurance_3','focus_1','focus_2','focus_3','mind_1','mind_2','mind_3','intellect_1','intellect_2','economist_1','economist_2','economist_3','ledger_1','ledger_2','ledger_3','faith_1','faith_2','faith_3','love_1','love_2','love_3','family_1','family_2','family_3','cat_1','cat_2','cat_3','execution_1','execution_2','execution_3','responsibility_1','responsibility_2','responsibility_3','tools_1','tools_2','tools_3','reader_1','reader_2','reader_3','church','firearm','patrimony','gem','crown','law','marine','temperance','graduate','robot','medal','commander','operative','tempered_mind','doctor','wealth_forge','dove','home_pillar','architect','sentinel','abacus','method','support','forged','coder','righteous','presence_home','steel_swords','guardian','strategist','discipline','provider','resilient_star','oracle','diamond_mind','great_family','polymath','wise_warrior','temple']
  .forEach(k => SHELL.push(BASE + 'emblems/' + k + '.png'));

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // Cachear cada recurso por separado: un fallo no aborta la instalación.
      // cache:'reload' evita que cache.add reutilice la caché HTTP del navegador
      // (si no, el SW nuevo podía guardar app.js/styles.css VIEJOS y seguías
      //  viendo la versión anterior aunque la versión del SW hubiese cambiado).
      Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' }))))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      // El cache de audio TTS de JARVIS (jarvis-tts-*) NUNCA se limpia acá: cada frase
      // se paga con cuota de ElevenLabs. Borrarlo en cada bump del shell (como pasaba)
      // regeneraba todas las frases tras cada deploy y fundía la cuota mensual.
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && !k.startsWith('jarvis-tts')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estrategia: network-first para la navegación (HTML), cache-first para assets estáticos.
// No se intercepta nada de Firestore/Auth/APIs (van directo a la red; Firestore maneja su offline).
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navegación → network-first SIN caché HTTP (cache:'reload'), fallback al shell cacheado.
  // cache:'reload' evita que el navegador sirva un index.html viejo desde su caché HTTP.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req.url, { cache: 'reload', credentials: 'same-origin' })
        .then(res => { const c = res.clone(); caches.open(CACHE).then(ch => ch.put(BASE, c)); return res; })
        .catch(() => caches.match(BASE).then(r => r || caches.match(BASE + 'index.html')))
    );
    return;
  }

  // Datos de cartera (JSON que commitea el agente cloud cada mes) → network-first,
  // fallback a caché para offline. Cache-first lo dejaría congelado en la 1ª versión.
  if (url.pathname.includes('/data/cartera/')) {
    event.respondWith(
      fetch(req)
        .then(res => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(ch => ch.put(req, c)); } return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Assets estáticos: mismo origen, o uno de los CDNs precacheados del shell → cache-first
  const isStatic = url.origin === self.location.origin || SHELL.includes(url.href);
  if (!isStatic) return;
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)); }
        return res;
      });
    })
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: '🔔 Centro de Mando', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || '🔔 Centro de Mando', {
      body:                payload.body || '',
      tag:                 payload.tag  || 'reminder',
      requireInteraction:  !!payload.requireInteraction,
      icon:                BASE + 'icon-192.png',
      badge:               BASE + 'icon-192.png',
      vibrate:             [200, 100, 200],
      data:                { url: BASE },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('Centro-de-mando') && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(BASE);
    })
  );
});
