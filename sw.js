// Centro de Mando — Service Worker
// Maneja Web Push, clicks de notificación, y caché offline del app shell.

const CACHE = 'cdm-shell-v38';
const BASE  = '/Centro-de-mando/';
const SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'styles.css',
  BASE + 'app.js',
  BASE + 'gamemode.js',
  BASE + 'gamemode-ui.js',
  BASE + 'gamemode.css',
  BASE + 'jarvis-agent.js',
  BASE + 'jarvis-brain.js',
  BASE + 'jarvis-neural-fx.js',
  BASE + 'jarvis-voice.js',
  BASE + 'jarvis-ears.js',
  BASE + 'command-palette.js',
  BASE + 'telemetry.js',
  BASE + 'jarvis-intel.js',
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

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // Cachear cada recurso por separado: un fallo no aborta la instalación
      Promise.allSettled(SHELL.map(u => cache.add(u)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
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
