








const SEINTJE_TAG = 'tt-seintje';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
  event.waitUntil((async () => {
    await self.registration.showNotification(d.titel || 'TalentTent', {
      body: d.tekst || 'Je hebt een nieuw bericht van TalentTent',
      icon: 'icon-192.png',
      tag: SEINTJE_TAG,
      renotify: false,
      silent: true,
      data: { url: d.url || '/#messages/talent-tent' },
    });


    try { if (self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(); } catch (e) { }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/#messages/talent-tent';
  event.waitUntil((async () => {
    const lijst = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lijst) {
      if ('focus' in c) {
        try { await c.navigate(url); } catch (e) { }
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
