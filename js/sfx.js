/* Sound effects: custom files uploaded in the admin (Site editor -> Sound effects) override built-in synthesised sounds.
   Everything is opt-out for visitors through the speaker button; nothing plays before the first user gesture. */
import { store } from "./util.js";

export const EVENTS = [
  ["click", "Click (buttons, links)"], ["hover", "Hover (very quiet)"], ["nav", "Page change"], ["toggle", "Filter / toggle"],
  ["open", "Open cart / menu"], ["add", "Add to order"], ["success", "Success"], ["error", "Error"], ["drag", "Drag / rotate / slider"],
];
let ctx = null, master = null, cfg = { enabled: true, volume: 0.6, files: {} }, muted = store.get("kns_mute", false);
const buffers = new Map(), last = {};

const ac = () => {
  if (ctx) return ctx;
  const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
  ctx = new A(); master = ctx.createGain(); master.connect(ctx.destination); return ctx;
};
const vol = () => Math.max(0, Math.min(1, +cfg.volume || 0)) * 0.9;
const noise = (c, secs) => { const b = c.createBuffer(1, Math.ceil(c.sampleRate * secs), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };

/* ---- built-in synthesised sounds (short, soft, no files needed) ---- */
function tone(c, t, f0, f1, dur, type, gain) {
  const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function swish(c, t, f0, f1, dur, gain, q = 1.2) {
  const s = c.createBufferSource(); s.buffer = noise(c, dur + 0.05); const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
}
const SYNTH = {
  click: (c, t) => { tone(c, t, 1800, 900, 0.05, "triangle", 0.22); tone(c, t, 420, 300, 0.07, "sine", 0.14); },
  hover: (c, t) => tone(c, t, 2400, 2000, 0.03, "sine", 0.05),
  nav: (c, t) => swish(c, t, 500, 2600, 0.26, 0.16),
  toggle: (c, t) => { tone(c, t, 1100, 700, 0.045, "square", 0.07); tone(c, t + 0.045, 1500, 1100, 0.05, "triangle", 0.12); },
  open: (c, t) => { swish(c, t, 300, 1400, 0.22, 0.14, 0.8); tone(c, t + 0.17, 160, 90, 0.12, "sine", 0.2); },
  add: (c, t) => { tone(c, t, 520, 880, 0.12, "sine", 0.22); tone(c, t + 0.07, 1040, 1320, 0.14, "triangle", 0.1); },
  success: (c, t) => { tone(c, t, 784, null, 0.18, "sine", 0.2); tone(c, t + 0.1, 1175, null, 0.32, "sine", 0.2); tone(c, t + 0.1, 2350, null, 0.2, "sine", 0.04); },
  error: (c, t) => { tone(c, t, 180, 120, 0.14, "sawtooth", 0.1); tone(c, t + 0.12, 150, 90, 0.2, "sawtooth", 0.1); },
  drag: (c, t) => swish(c, t, 900 + Math.random() * 500, 1800 + Math.random() * 800, 0.07, 0.07, 2.5),
};

async function getBuffer(url) {
  if (buffers.has(url)) return buffers.get(url);
  const p = fetch(url).then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then((a) => ac().decodeAudioData(a)).catch(() => null);
  buffers.set(url, p); return p;
}
const GAP = { hover: 90, drag: 70, click: 40, toggle: 40 };
export async function play(name, gainMul = 1) {
  if (!cfg.enabled || muted || !SYNTH[name]) return;
  const now = performance.now(); if (now - (last[name] || 0) < (GAP[name] ?? 60)) return; last[name] = now;
  const c = ac(); if (!c) return; if (c.state === "suspended") { try { await c.resume(); } catch { return; } }
  master.gain.value = vol() * gainMul;
  const url = cfg.files?.[name];
  if (url) { const buf = await getBuffer(url); if (buf) { const s = c.createBufferSource(); s.buffer = buf; s.connect(master); s.start(); return; } }
  SYNTH[name](c, c.currentTime + 0.005);
}

export const isMuted = () => muted;
export function setMuted(m) { muted = !!m; store.set("kns_mute", muted); paintBtn(); if (!muted) { last.click = 0; play("toggle"); } }
const ICON = (off) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/>${off ? '<path d="m22 9-6 6M16 9l6 6"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'}</svg>`;
function paintBtn() { const b = document.getElementById("sfx-btn"); if (!b) return; b.innerHTML = ICON(muted); b.setAttribute("aria-pressed", String(!muted)); b.setAttribute("aria-label", muted ? "Turn sound effects on" : "Turn sound effects off"); b.title = muted ? "Sound off" : "Sound on"; }

/* ---- wiring ---- */
const CLICKABLE = 'a[href], button, summary, .chip, label.paymethod, [role="button"], [data-act]';
let wired = false;
export function initSfx(settings) {
  cfg = { enabled: true, volume: 0.6, files: {}, ...(settings || {}) };
  const b = document.getElementById("sfx-btn");
  if (b) { b.hidden = !cfg.enabled; if (!b.dataset.w) { b.dataset.w = 1; b.addEventListener("click", (e) => { e.stopPropagation(); setMuted(!muted); }); } paintBtn(); }
  if (wired) return; wired = true;
  const unlock = () => { const c = ac(); if (c?.state === "suspended") c.resume().catch(() => {}); };
  addEventListener("pointerdown", unlock, { passive: true, capture: true }); addEventListener("keydown", unlock, { capture: true });
  document.addEventListener("click", (e) => {
    const el = e.target.closest(CLICKABLE); if (!el || el.id === "sfx-btn" || el.disabled) return;
    if (el.matches('a[href^="#/"]')) return;   // page links get the "nav" whoosh instead
    const id = el.id || "";
    if (id === "cart-open" || id === "menu-btn" || el.dataset.act === "showbuy") return play("open");
    if (el.matches(".chip, .seg button, summary")) return play("toggle");
    if (el.dataset.act === "approve") return play("success");
    play("click");
  }, true);
  document.addEventListener("change", (e) => { const t = e.target; if (t.matches("input[type=checkbox],input[type=radio],select")) play("toggle"); }, true);
  document.addEventListener("input", (e) => { if (e.target.matches("input[type=range]")) play("drag"); }, true);
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return; const el = e.target.closest?.("a[href], button, .pcard, .work, .svc-row, .chip"); if (!el || el.contains(e.relatedTarget) || el.disabled) return; play("hover");
  }, true);
  document.addEventListener("camera-change", (e) => { if (e.detail?.source === "user-interaction") play("drag"); }, true);   // <model-viewer> rotate / zoom
  let down = null; document.addEventListener("pointerdown", (e) => { down = e.target.closest?.("[data-drag], model-viewer, .prod-main"); }, true);
  addEventListener("pointerup", () => { down = null; }, true);
  document.addEventListener("pointermove", (e) => { if (down && e.buttons) play("drag"); }, true);
  addEventListener("hashchange", () => play("nav"));
  document.addEventListener("kns-toast", (e) => play(e.detail === "ok" ? "success" : "error"));
}
