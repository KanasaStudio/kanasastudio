// Live USD/IDR rate for DISPLAY ONLY. Orders and quotations are always in the studio's base currency (IDR).
import { store } from "./util.js";
const KEY = "kns_fx_v1", TTL = 60 * 60 * 1000;
const SOURCES = [
  async () => { const r = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" }); const j = await r.json(); return j?.rates?.IDR; },
  async () => { const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR", { cache: "no-store" }); const j = await r.json(); return j?.rates?.IDR; },
];
const ok = (n) => Number.isFinite(n) && n > 1000 && n < 100000;   // sanity range for IDR per USD

export async function getRate(force = false) {
  const c = store.get(KEY, null);
  if (!force && c && ok(c.rate) && Date.now() - c.at < TTL) return c;
  for (const src of SOURCES) {
    try { const rate = +(await src()); if (ok(rate)) { const v = { rate, at: Date.now() }; store.set(KEY, v); return v; } } catch { /* try next source */ }
  }
  return c && ok(c.rate) ? c : null;   // stale cache is better than nothing
}
