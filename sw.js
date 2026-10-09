// The Talent Tent — service worker (TT-452, 09-10-2026).
// Doet maar één ding: een seintje tonen als de digest er een stuurt, en de
// app openen als iemand erop tikt. Geen cache en geen offline-modus: een
// fout hier mag de app nooit raken. Er is daarom geen `fetch`-handler.
//
// Besluit Ronald, 09-10-2026: de stip op het icoon trekt aandacht, en gaat uit
// zodra de app opent. Het toestel tekent de stip zelf zodra er een melding
// staat; de app bepaalt niet hoe hij eruitziet. De melding is stil.

const SEINTJE_TAG = 'tt-seintje';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
  event.waitUntil((async () => {
    await self.registration.showNotification(d.titel || 'Talent Tent', {
      body: d.tekst || 'Je hebt een nieuw bericht van Talent Tent',
      icon: 'icon-192.png',
      tag: SEINTJE_TAG,   // één seintje tegelijk: een nieuw vervangt het oude
      renotify: false,    // een tweede seintje maakt niet opnieuw gewijzigd lawaai
      silent: true,       // geen geluid, geen trilling
      data: { url: d.url || '/#messages/talent-tent' },
    });
    // Een kleine stip op het icoon, zonder getal, waar de browser dat kent
    // (geïnstalleerde app). De app gaat hem weer uit zodra ze opent.
    try { if (self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(); } catch (e) { /* kan niet: dan alleen de melding */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/#messages/talent-tent';
  event.waitUntil((async () => {
    const lijst = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lijst) {
      if ('focus' in c) {
        try { await c.navigate(url); } catch (e) { /* navigeren mag mislukken */ }
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
