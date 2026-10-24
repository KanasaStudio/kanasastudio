import { store, uid } from "./util.js";
const KEY = "kns_cart_v1";
let items = store.get(KEY, []);
if (!Array.isArray(items)) items = [];
const subs = new Set();
const save = () => { store.set(KEY, items); subs.forEach((f) => f(items)); };
export const onChange = (f) => { subs.add(f); f(items); };
export const all = () => items;
export const count = () => items.reduce((n, i) => n + i.quantity, 0);
export function add(line) { items.push({ uid: uid(), quantity: 1, addon_ids: [], brief: {}, ...line }); save(); }
export function update(id, patch) { const i = items.find((x) => x.uid === id); if (i) { Object.assign(i, patch); save(); } }
export function remove(id) { items = items.filter((x) => x.uid !== id); save(); }
export function clear() { items = []; save(); }

// DISPLAY-ONLY estimate. The database recomputes the real figure in create_order().
export function estimate(lines, services) {
  let min = 0, max = 0, quote = false, priced = false;
  for (const l of lines) {
    const s = services.find((x) => x.id === l.service_id); if (!s) continue;
    const t = s.service_tiers?.find((x) => x.id === l.tier_id);
    const pmin = t ? t.price_min : s.price_min;
    const pmax = t ? (t.price_max ?? t.price_min) : (s.price_max ?? s.price_min);
    const add = (l.addon_ids || []).reduce((n, id) => n + +(s.service_addons?.find((a) => a.id === id)?.price || 0), 0);
    if (s.custom_quote || pmin == null) { quote = true; continue; }
    priced = true; min += (+pmin + add) * l.quantity; max += (+(pmax ?? pmin) + add) * l.quantity;
  }
  return { min: priced ? min : null, max: priced ? max : null, quote };
}
