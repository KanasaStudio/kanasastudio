/* Offline support (the worker itself is /sw.js). This file registers it, shows the offline bar,
   and saves a copy of the shared data so the pages you have seen open without internet. */
const secure = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);

export function initOffline(onBack) {
  const bar = document.getElementById("offline-bar");
  const paint = () => { if (bar) bar.hidden = navigator.onLine; document.documentElement.classList.toggle("is-offline", !navigator.onLine); };
  addEventListener("offline", paint);
  addEventListener("online", () => { paint(); onBack?.(); });
  paint();
  if (secure && "serviceWorker" in navigator) {
    const go = () => navigator.serviceWorker.register("sw.js").catch(() => {});
    document.readyState === "complete" ? go() : addEventListener("load", go, { once: true });
  }
}

/* After the worker controls the page, load every public dataset once more (through the worker, so it is stored)
   and hand it the list of files this page used. Runs at most every 6 hours and never on data-saver. */
export async function warmOffline(loaders) {
  try {
    if (!secure || !("serviceWorker" in navigator) || !navigator.onLine || navigator.connection?.saveData) return;
    const last = +localStorage.getItem("kns_warm") || 0; if (Date.now() - last < 6 * 3600e3) return;
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => { navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }); setTimeout(r, 5000); });
    reg.active?.postMessage({ type: "warm", urls: performance.getEntriesByType("resource").map((e) => e.name) });
    for (const f of loaders) { try { await f(); } catch { /* one dataset failing must not stop the rest */ } }
    localStorage.setItem("kns_warm", String(Date.now()));
  } catch { /* offline support is a bonus, never an error */ }
}
