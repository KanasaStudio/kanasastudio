/* Plays a digital letter inside a host element. Used by the public viewer (/letter/<id>) and by the editor's live preview (iframe).
   A "letter" is { engine, content }. The engine (see engines.js) decides the story: cover -> reveal -> letter -> closing. */
import { createFx } from "./fx.js?v=20261111a";
import { ENGINES, ambient } from "./engines.js?v=20261111a";
import { createSound } from "./sound.js?v=20261111a";
import { resolveProfile, ATMO } from "./profiles.js?v=20261111a";

export const FONTS = {
  serif: ["'Cormorant Garamond',Georgia,serif", "Cormorant+Garamond:ital,wght@0,400;0,600;1,400"],
  script: ["'Dancing Script','Brush Script MT',cursive", "Dancing+Script:wght@500;700"],
  hand: ["'Caveat','Comic Sans MS',cursive", "Caveat:wght@500;700"],
  sans: ["Inter,system-ui,sans-serif", "Inter:wght@400;600"],
  classic: ["'Playfair Display',Georgia,serif", "Playfair+Display:ital,wght@0,400;0,600;1,400"],
};
export const STR = {
  id: { open: "Ketuk untuk membuka", forYou: "Untuk", from: "Dari", replay: "Putar ulang", next: "Lanjut", blow: "Ketuk untuk meniup lilin", wish: "Buat satu permohonan…", begin: "Mulai", tap: "Ketuk untuk lanjut", withLove: "Dengan sepenuh hati,", memories: "Kenangan", mine: "Buat suratmu sendiri", mute: "Suara", gift: "Sebuah hadiah untukmu" },
  en: { open: "Tap to open", forYou: "For", from: "From", replay: "Replay", next: "Continue", blow: "Tap to blow out the candles", wish: "Make a wish…", begin: "Begin", tap: "Tap to continue", withLove: "With love,", memories: "Memories", mine: "Make your own", mute: "Sound", gift: "A gift for you" },
};
const lum = (h) => { const n = parseInt(h.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const hexOk = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : d);
const loaded = new Set();
function loadFont(key) {
  const f = FONTS[key]; if (!f || loaded.has(key)) return; loaded.add(key);
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?family=${f[1]}&display=swap`; document.head.append(l);
}
const SKINS = ["meadow", "roses", "sakura", "bold", "gold", "lineart"];
let skinCss = false;
function loadSkins() { if (skinCss) return; skinCss = true; const l = document.createElement("link"); l.rel = "stylesheet"; l.href = new URL("../../css/letter-skins.css?v=20261111a", import.meta.url).href; document.head.append(l); }
let motionCss = false;
function loadMotion() { if (motionCss) return; motionCss = true; const l = document.createElement("link"); l.rel = "stylesheet"; l.href = new URL("../../css/letter-motion.css?v=20261111a", import.meta.url).href; document.head.append(l); }
/* reveal a text in words or lines (motion profiles). Tokens are DOM text nodes (never HTML); a tap shows everything. */
const sentences = (seg) => { if (/^\n+$/.test(seg)) return [seg]; const m = seg.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g); return m && m.join("") === seg ? m : [seg]; };
const LINE_MODES = new Set(["line", "para", "glow", "mask", "caption", "formal"]);
const okUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "");

export function createPlayer(host, { preview = false, makeUrl = "../#/letters" } = {}) {
  let run = 0, fx = null, audio = null, root = null, snd = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function destroy() { run++; fx?.destroy(); fx = null; snd?.destroy(); snd = null; if (audio) { audio.pause(); audio = null; } root?.remove(); root = null; }

  function play(letter) {
    destroy(); const my = run, c = normalize(letter.content), eng = ENGINES[letter.engine] || ENGINES.envelope, mp = resolveProfile(letter);
    loadFont(c.font); if (mp) { loadMotion(); if (mp.font) loadFont(mp.font); }
    root = document.createElement("div"); root.className = `lt lt-${letter.engine in ENGINES ? letter.engine : "envelope"}${preview ? " lt-lite" : ""}`;
    const th = c.theme; root.style.setProperty("--p", th.primary); root.style.setProperty("--a", th.accent); root.style.setProperty("--bg", th.bg); root.style.setProperty("--paper", th.paper);
    root.style.setProperty("--ink", lum(th.paper) > .45 ? "#2b2320" : "#f5efe8"); root.style.setProperty("--onbg", lum(th.bg) > .45 ? "#2b2320" : "#f7f2ec");
    root.style.setProperty("--onp", lum(th.primary) > .45 ? "#2b2320" : "#ffffff"); root.style.setProperty("--font", FONTS[c.font][0]);
    root.dataset.decor = c.decor.join(" ");
    if (mp) {
      root.classList.add("mp", "mp-" + mp.key); root.dataset.tr = mp.tr; root.dataset.strip = mp.strip; root.dataset.rv = mp.reveal;
      if (mp.font) root.style.setProperty("--mfont", FONTS[mp.font][0]);
      const at = document.createElement("div"); at.className = `lt-atmo at-${mp.atmo}`; at.setAttribute("aria-hidden", "true"); at.innerHTML = ATMO[mp.atmo] || ""; root.append(at);
    }
    if (c.skin) { root.dataset.skin = c.skin; loadSkins(); const dc = document.createElement("div"); dc.className = "lt-deco"; dc.setAttribute("aria-hidden", "true"); dc.innerHTML = "<i class=d1></i><i class=d2></i><i class=d3></i><i class=d4></i>"; root.append(dc); }
    const stage = document.createElement("div"); stage.className = "lt-stage"; root.append(stage); host.append(root);
    fx = createFx(root, () => [th.primary, th.accent, "#ffffff", th.paper], reduced, { lite: preview });
    if (letter.quick) c.effects = c.effects.filter((e) => !["opening", "typing", "closing"].includes(e));
    snd = createSound(mp?.voice || (letter.engine in ENGINES ? letter.engine : "envelope"), th.primary, { off: reduced, shift: mp?.shift || 0 }); let opened = false;
    const S = STR[c.lang] || STR.id, alive = () => my === run, tapQ = [];
    stage.addEventListener("click", (e) => { if (!e.target.closest("button,a,.lt-lightbox")) tapQ.splice(0).forEach((r) => r()); });
    const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 80) : ms)).then(() => { if (!alive()) return new Promise(() => {}); });
    const nextTap = () => new Promise((r) => tapQ.push(r));
    let cur = null;
    const ctx = {
      c, t: S, reduced, quick: !!letter.quick, stage, alive, wait, nextTap, preview, makeUrl, fx, mp, ambient: () => ambient(ctx),
      sfx: (n) => snd?.play(n), has: (k) => c.effects.includes(k), decor: (k) => c.decor.includes(k),
      scene(html, cls = "") {
        const el = document.createElement("section"); el.className = `lt-scene ${cls}`; el.innerHTML = html;
        const old = cur; cur = el; stage.append(el); el.getBoundingClientRect(); el.classList.add("in");
        if (old) { old.classList.add("out"); setTimeout(() => old.remove(), mp ? 1600 : 700); } return el;
      },
      press(el) { return new Promise((r) => el.addEventListener("click", () => { startMusic(); snd?.play(opened ? "reveal" : "open"); opened = true; r(); }, { once: true })); },
      async type(el, text) {
        if (!ctx.has("typing") || reduced) { el.textContent = text; return; }
        if (mp && mp.reveal !== "typewriter") return reveal(el, text, mp.reveal);
        el.textContent = ""; let i = 0, skip = false; nextTap().then(() => { skip = true; });
        const tw = mp?.reveal === "typewriter"; if (tw) el.classList.add("tw-caret");
        const d = Math.max(10, Math.min(42, 15000 / Math.max(1, text.length))) * (tw ? 1.6 : 1), sc = el.closest(".scroll");
        while (i < text.length && !skip && alive()) { i++; if (i % 3 === 0 && /\S/.test(text[i - 1])) ctx.sfx("tick"); el.textContent = text.slice(0, i); if (sc && i % 6 === 0) sc.scrollTop = sc.scrollHeight; await wait(d * (/[.!?\n]/.test(text[i - 1]) ? 7 : /[,;]/.test(text[i - 1]) ? 3 : 1)); }
        if (alive()) { el.textContent = text; if (sc) sc.scrollTop = sc.scrollHeight; el.classList.remove("tw-caret"); }
      },
      replay: () => play(letter),
    };
    async function reveal(el, text, mode) {
      const line = LINE_MODES.has(mode), parts = line ? text.split(/(\n+)/).flatMap(sentences) : text.split(/(\s+)/), toks = [];
      el.textContent = ""; el.classList.add("rv", "rv-" + mode);
      parts.forEach((p) => { if (!p) return; if (/^\s+$/.test(p)) { el.append(p); return; } const sp = document.createElement("span"); sp.className = line ? "rl" : "rw"; sp.textContent = p; sp.style.setProperty("--z", toks.length % 2 ? 1 : -1); sp.style.setProperty("--rx", (Math.random() * 60 - 30).toFixed(0)); sp.style.setProperty("--ry", (Math.random() * 40 - 20).toFixed(0)); el.append(sp); toks.push(sp); });
      if (mode === "marker") toks.forEach((tk, i) => { if (i % 6 === 3 && tk.textContent.length > 3) tk.classList.add("hl"); });
      let skip = false; nextTap().then(() => { skip = true; });
      const k = mp.tempo || 1, step = (line ? Math.max(380, Math.min(1300, 14000 / Math.max(1, toks.length))) : Math.max(45, Math.min(170, 11000 / Math.max(1, toks.length)))) * k, sc = el.closest(".scroll");
      for (let i = 0; i < toks.length && !skip && alive(); i++) {
        toks[i].classList.add("on"); if (i % (line ? 1 : 3) === 0) ctx.sfx("tick");
        if (sc && i % (line ? 1 : 5) === 0) { const y = toks[i].getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom; if (y > -40) sc.scrollTop += y + 80; }
        await wait(step * (/[.!?]$/.test(toks[i].textContent) && !line ? 3.2 : /[,;]$/.test(toks[i].textContent) ? 1.8 : 1));
      }
      if (!alive()) return; el.classList.add("rv-done"); toks.forEach((tk) => tk.classList.add("on")); if (sc) sc.scrollTop = sc.scrollHeight;
    }
    function startMusic() {
      if (root.querySelector(".lt-mute")) return;
      if (c.music && okUrl(c.music.url) && !audio) { audio = new Audio(c.music.url); audio.loop = true; audio.volume = .6; audio.play().catch(() => {}); }
      const b = document.createElement("button"); b.className = "lt-mute"; b.type = "button"; b.setAttribute("aria-label", S.mute); b.textContent = "♪"; b.setAttribute("aria-pressed", String(!snd.muted));
      b.onclick = () => { const on = snd.muted; snd.muted = !on; if (audio) on ? audio.play().catch(() => {}) : audio.pause(); b.setAttribute("aria-pressed", String(on)); b.classList.toggle("off", !on); }; root.append(b);
    }
    root.addEventListener("pointerdown", startMusic, { once: true });
    ctx.okUrl = okUrl;
    Promise.resolve().then(() => eng(ctx)).catch((e) => { if (alive()) { console.error(e); ctx.scene(`<p class="lt-err">${S.gift}</p>`); } });
  }
  return { play, destroy };
}

export function normalize(c = {}) {
  const th = c.theme || {}, arr = (v) => (Array.isArray(v) ? v : []);
  return {
    from: String(c.from || "").slice(0, 60), to: String(c.to || "").slice(0, 60), title: String(c.title || "").slice(0, 120), message: String(c.message || "").slice(0, 4000),
    date: /^\d{4}-\d{2}-\d{2}$/.test(c.date || "") ? c.date : "", lang: c.lang === "en" ? "en" : "id", font: FONTS[c.font] ? c.font : "serif",
    theme: { primary: hexOk(th.primary, "#8b1e3f"), accent: hexOk(th.accent, "#e8b4b8"), bg: hexOk(th.bg, "#1a0d12"), paper: hexOk(th.paper, "#fbf3ea") },
    skin: SKINS.includes(c.skin) ? c.skin : "",
    effects: arr(c.effects).map(String), decor: arr(c.decor).map(String),
    photos: arr(c.photos).filter((p) => okUrl(p?.url)).map((p) => ({ url: p.url, caption: String(p.caption || "").slice(0, 80) })).slice(0, 12),
    gifs: arr(c.gifs).filter((g) => okUrl(g?.url)).map((g) => ({ url: g.url, place: ["intro", "letter", "both"].includes(g.place) ? g.place : "both" })).slice(0, 6),
    music: c.music && okUrl(c.music.url) ? { url: c.music.url, title: String(c.music.title || "") } : null,
  };
}
