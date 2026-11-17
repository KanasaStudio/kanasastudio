// Service worker pengganti: aplikasi pindah ke /kanasa-ai/. Membersihkan cache lama, melepas diri, lalu mengarahkan jendela yang terbuka.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate("https://kanasastudio.github.io/kanasa-ai/");
  })());
});
