// Centro de Mando — Service Worker
// Handles Web Push events and notification clicks for iOS PWA support

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: '🔔 Centro de Mando', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || '🔔 Centro de Mando', {
      body:                payload.body || '',
      tag:                 payload.tag  || 'reminder',
      requireInteraction:  !!payload.requireInteraction,
      icon:                '/Centro-de-mando/icon.svg',
      badge:               '/Centro-de-mando/icon.svg',
      vibrate:             [200, 100, 200],
      data:                { url: '/Centro-de-mando/' },
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
      if (self.clients.openWindow) return self.clients.openWindow('/Centro-de-mando/');
    })
  );
});
