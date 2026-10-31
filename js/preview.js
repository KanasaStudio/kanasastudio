/* Card preview videos. Nothing is downloaded until a visitor hovers a card (desktop) or a card is
   mostly on screen (touch). One video plays at a time, and it is removed again afterwards. */
const fine = matchMedia("(hover: hover) and (pointer: fine)"), reduce = matchMedia("(prefers-reduced-motion: reduce)");
const lite = () => navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || "");
let cur = null, io = null, bound = false; const vis = new Set();

function start(card) {
  if (reduce.matches || lite() || cur?.card === card || card.dataset.pvfail) return;
  const url = card.dataset.pv, box = card.querySelector(".pvbox"); if (!url || !box) return;
  stop();
  const v = document.createElement("video");
  Object.assign(v, { className: "pv", muted: true, loop: true, playsInline: true, preload: "auto", disablePictureInPicture: true });
  v.setAttribute("aria-hidden", "true"); v.src = url;
  v.addEventListener("playing", () => card.classList.add("pv-on"), { once: true });
  v.addEventListener("error", () => { card.dataset.pvfail = "1"; stop(); }, { once: true });   // never retry a broken file
  box.append(v); cur = { card, v };
  v.play().catch((e) => { if (e?.name !== "AbortError") card.dataset.pvfail = "1"; stop(); });
}
function stop() {
  if (!cur) return;
  const { card, v } = cur; cur = null; card.classList.remove("pv-on");
  v.pause(); v.removeAttribute("src"); v.load(); v.remove();
}
function pick() {
  const mid = innerHeight / 2; let best = null, d = 1e9;
  for (const c of vis) { const r = c.getBoundingClientRect(), dd = Math.abs(r.top + r.height / 2 - mid); if (dd < d) { d = dd; best = c; } }
  best ? start(best) : stop();
}
export function initPreviews() {
  stop(); io?.disconnect(); vis.clear();
  if (!bound) {
    bound = true;
    document.addEventListener("pointerover", (e) => { if (!fine.matches) return; const c = e.target.closest?.("[data-pv]"); c ? start(c) : stop(); });
    document.addEventListener("focusin", (e) => { const c = e.target.closest?.("[data-pv]"); if (c) start(c); });
    document.addEventListener("focusout", (e) => { if (e.target.closest?.("[data-pv]")) stop(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  }
  if (fine.matches || reduce.matches || lite()) return;
  io = new IntersectionObserver((es) => { for (const e of es) (e.intersectionRatio >= 0.6 ? vis.add(e.target) : vis.delete(e.target)); pick(); }, { threshold: [0, 0.6, 1] });
  document.querySelectorAll("[data-pv]").forEach((c) => io.observe(c));
}
