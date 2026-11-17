/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// Shell aplikasi tetap terbuka saat offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

const BASE = self.registration.scope;

self.addEventListener("push", (event) => {
  let data: any = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: "KANASA STUDIO", body: event.data?.text() }; }
  const title = data.title || "KANASA STUDIO";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: `${BASE}icons/icon-192.png`,
      badge: `${BASE}icons/badge-96.png`,
      tag: data.id || undefined,
      requireInteraction: data.priority === "critical",
      data: { link: data.link || "#/notifikasi" },
      timestamp: Date.now(),
    } as NotificationOptions),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data?.link as string) || "#/notifikasi";
  const url = `${BASE}${link.startsWith("#") ? link : `#/${link.replace(/^\//, "")}`}`;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(BASE)) {
        await (c as WindowClient).focus();
        (c as WindowClient).navigate(url).catch(() => undefined);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
