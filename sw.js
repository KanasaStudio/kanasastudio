/* Kanasa Studio — offline support.
   - App files, last-seen data (services, portfolio, store, tools, news, settings) and viewed images are kept on the device,
     so those pages open without a connection. Online, the network always wins (fresh content), the cache is the fallback.
   - Never cached: /admin/, anything with a signed-in user's token, orders/payments/uploads (they are POSTs anyway), videos. */
const V = "20261107b";
const SHELL = `kns-${V}-shell`, API = `kns-${V}-api`, MEDIA = `kns-${V}-media`, LIB = "kns-lib";
const KEEP = [SHELL, API, MEDIA, LIB];
const SB_HOST = "geroipkbzmbkigzwjdok.supabase.co";
const ANON = "Bearer sb_publishable_0GuYwsQSIYD89p-O1NcjMw_4l0pc7xN";
const ROOT = new URL(self.registration.scope).pathname;
const MAX_MEDIA = 220;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["index.html", "assets/kanasa-logo.png", "manifest.webmanifest"]).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("kns-") && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function networkFirst(req, name, ms, key = req) {
  const cache = await caches.open(name);
  const net = fetch(req).then((r) => { if (r.ok && r.type !== "opaque") cache.put(key, r.clone()).catch(() => {}); return r; });
  net.catch(() => {});
  const slow = wait(ms).then(async () => (await cache.match(key)) || net);
  try { return await Promise.race([net, slow]); }
  catch (err) { const hit = await cache.match(key); if (hit) return hit; throw err; }
}
async function cacheFirst(req, name, opts) {
  const cache = await caches.open(name), hit = await cache.match(req);
  if (hit) return hit;
  const r = await fetch(opts ? new Request(req.url, opts) : req);
  if (r.ok && r.type !== "opaque") cache.put(req, r.clone()).catch(() => {});
  return r;
}
async function image(req) {
  const cache = await caches.open(MEDIA), hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const r = await fetch(new Request(req.url, { mode: "cors", credentials: "omit" }));     // public-media sends CORS headers, so the copy is a real (not opaque) response
    if (r.ok) { cache.put(req.url, r.clone()).catch(() => {}); trim(cache); }
    return r;
  } catch { return fetch(req); }
}
async function trim(cache) { const ks = await cache.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - MAX_MEDIA))) await cache.delete(k); }
const apiKey = (req) => { const u = new URL(req.url); if ((req.headers.get("accept") || "").includes("vnd.pgrst.object")) u.searchParams.set("__rep", "obj"); return u.href; };

self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (!url.pathname.startsWith(ROOT) || url.pathname.startsWith(ROOT + "admin/") || url.pathname.startsWith(ROOT + "share/") || url.pathname.startsWith(ROOT + "letter/")) return;
    if (/\.(mp4|webm|mov|mp3|ogg|wav|m4a)$/i.test(url.pathname) || req.headers.has("range")) return;
    if (req.mode === "navigate") return e.respondWith(networkFirst(new Request(ROOT + "index.html"), SHELL, 3500).catch(() => new Response("You are offline and this page has not been saved yet.", { status: 503, headers: { "Content-Type": "text/plain" } })));
    return e.respondWith(url.searchParams.has("v") ? cacheFirst(req, SHELL).catch(() => networkFirst(req, SHELL, 3500)) : networkFirst(req, SHELL, 3500));
  }
  if (url.hostname === SB_HOST) {
    const auth = req.headers.get("authorization");
    if (url.pathname.startsWith("/rest/v1/") && (!auth || auth === ANON)) return e.respondWith(networkFirst(req, API, 4000, new Request(apiKey(req))));
    if (url.pathname.startsWith("/storage/v1/object/public/") && req.destination === "image") return e.respondWith(image(req));
    return;
  }
  if (url.hostname === "cdn.jsdelivr.net" && /supabase-js/.test(url.pathname)) return e.respondWith(cacheFirst(req, LIB));
  if (url.hostname === "fonts.googleapis.com") return e.respondWith(networkFirst(req, LIB, 2500));
  if (url.hostname === "fonts.gstatic.com") return e.respondWith(cacheFirst(req, LIB));
});

/* The page tells us which files it loaded, so a first visit is fully available offline afterwards. */
self.addEventListener("message", (e) => {
  if (e.data?.type !== "warm") return;
  e.waitUntil((async () => {
    for (const u of (e.data.urls || []).slice(0, 80)) {
      try {
        const url = new URL(u), same = url.origin === location.origin;
        if (same && (!url.pathname.startsWith(ROOT) || url.pathname.startsWith(ROOT + "admin/") || /\.(mp4|webm|mp3|ogg|wav)$/i.test(url.pathname))) continue;
        if (!same && !(url.hostname === "cdn.jsdelivr.net" && /supabase-js/.test(url.pathname)) && url.hostname !== "fonts.googleapis.com" && url.hostname !== "fonts.gstatic.com") continue;
        const name = same ? SHELL : LIB, cache = await caches.open(name);
        if (await cache.match(u)) continue;
        const r = await fetch(u, same ? {} : { mode: "cors", credentials: "omit" });
        if (r.ok) await cache.put(u, r);
      } catch { /* skip */ }
    }
  })());
});
