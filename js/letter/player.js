/* Plays a digital letter inside a host element. Used by the public viewer (/letter/<id>) and by the editor's live preview (iframe).
   A "letter" is { engine, content }. The engine (see engines.js) decides the story: cover -> reveal -> letter -> closing. */
import { createFx } from "./fx.js";
import { ENGINES } from "./engines.js";
import { createSound } from "./sound.js";

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
function loadSkins() { if (skinCss) return; skinCss = true; const l = document.createElement("link"); l.rel = "stylesheet"; l.href = new URL("../../css/letter-skins.css?v=20261107c", import.meta.url).href; document.head.append(l); }
const okUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "");

export function createPlayer(host, { preview = false, makeUrl = "../#/letters" } = {}) {
  let run = 0, fx = null, audio = null, root = null, snd = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function destroy() { run++; fx?.destroy(); fx = null; snd?.destroy(); snd = null; if (audio) { audio.pause(); audio = null; } root?.remove(); root = null; }

  function play(letter) {
    destroy(); const my = run, c = normalize(letter.content), eng = ENGINES[letter.engine] || ENGINES.envelope;
    loadFont(c.font);
    root = document.createElement("div"); root.className = `lt lt-${letter.engine in ENGINES ? letter.engine : "envelope"}${preview ? " lt-lite" : ""}`;
    const th = c.theme; root.style.setProperty("--p", th.primary); root.style.setProperty("--a", th.accent); root.style.setProperty("--bg", th.bg); root.style.setProperty("--paper", th.paper);
    root.style.setProperty("--ink", lum(th.paper) > .45 ? "#2b2320" : "#f5efe8"); root.style.setProperty("--onbg", lum(th.bg) > .45 ? "#2b2320" : "#f7f2ec");
    root.style.setProperty("--onp", lum(th.primary) > .45 ? "#2b2320" : "#ffffff"); root.style.setProperty("--font", FONTS[c.font][0]);
    root.dataset.decor = c.decor.join(" ");
    if (c.skin) { root.dataset.skin = c.skin; loadSkins(); const dc = document.createElement("div"); dc.className = "lt-deco"; dc.setAttribute("aria-hidden", "true"); dc.innerHTML = "<i class=d1></i><i class=d2></i><i class=d3></i><i class=d4></i>"; root.append(dc); }
    const stage = document.createElement("div"); stage.className = "lt-stage"; root.append(stage); host.append(root);
    fx = createFx(root, () => [th.primary, th.accent, "#ffffff", th.paper], reduced, { lite: preview });
    if (letter.quick) c.effects = c.effects.filter((e) => !["opening", "typing", "closing"].includes(e));
    snd = createSound(letter.engine in ENGINES ? letter.engine : "envelope", th.primary, { off: reduced }); let opened = false;
    const S = STR[c.lang] || STR.id, alive = () => my === run, tapQ = [];
    stage.addEventListener("click", (e) => { if (!e.target.closest("button,a,.lt-lightbox")) tapQ.splice(0).forEach((r) => r()); });
    const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 80) : ms)).then(() => { if (!alive()) return new Promise(() => {}); });
    const nextTap = () => new Promise((r) => tapQ.push(r));
    let cur = null;
    const ctx = {
      c, t: S, reduced, quick: !!letter.quick, stage, alive, wait, nextTap, preview, makeUrl, fx,
      sfx: (n) => snd?.play(n), has: (k) => c.effects.includes(k), decor: (k) => c.decor.includes(k),
      scene(html, cls = "") {
        const el = document.createElement("section"); el.className = `lt-scene ${cls}`; el.innerHTML = html;
        const old = cur; cur = el; stage.append(el); el.getBoundingClientRect(); el.classList.add("in");
        if (old) { old.classList.add("out"); setTimeout(() => old.remove(), 700); } return el;
      },
      press(el) { return new Promise((r) => el.addEventListener("click", () => { startMusic(); snd?.play(opened ? "reveal" : "open"); opened = true; r(); }, { once: true })); },
      async type(el, text) {
        if (!ctx.has("typing") || reduced) { el.textContent = text; return; }
        el.textContent = ""; let i = 0, skip = false; nextTap().then(() => { skip = true; });
        const d = Math.max(10, Math.min(42, 15000 / Math.max(1, text.length))), sc = el.closest(".scroll");
        while (i < text.length && !skip && alive()) { i++; if (i % 3 === 0 && /\S/.test(text[i - 1])) ctx.sfx("tick"); el.textContent = text.slice(0, i); if (sc && i % 6 === 0) sc.scrollTop = sc.scrollHeight; await wait(d * (/[.!?\n]/.test(text[i - 1]) ? 7 : /[,;]/.test(text[i - 1]) ? 3 : 1)); }
        if (alive()) { el.textContent = text; if (sc) sc.scrollTop = sc.scrollHeight; }
      },
      replay: () => play(letter),
    };
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
