/* Cover / opening scenes for motion profiles (see profiles.js). Each one is its own little film: the object, how it waits,
   how it opens and what bursts out. All user text is set with textContent. Styles live in css/letter-motion.css (.op-*). */
import { SVG } from "./profiles.js";

const coverTitle = (ctx) => (ctx.c.to ? `${ctx.t.forYou} ${ctx.c.to}` : ctx.t.gift);
const set = (s, sel, txt) => { const e = s.querySelector(sel); if (e) e.textContent = txt; return e; };
const tw = (ctx, ms) => ctx.wait(ms * (ctx.mp?.tempo || 1));
const rnd = (a, b) => a + Math.random() * (b - a);
const many = (k, f) => Array.from({ length: k }, (_, i) => f(i)).join("");
const ENV = `<i class="env-paper"></i><i class="env-front"></i><i class="env-flap"></i>`;
const BOX = `<i class="box-card"></i><i class="box-body"></i><i class="box-lid"></i>`;

/* a physical object: caption, the object (a <button class="cv">), hint; tap opens it */
async function object(ctx, name, inner, ms, { cap = true, before, after } = {}) {
  const s = ctx.scene(`<div class="lt-center op op-${name}">${cap ? '<p class="lt-cap"></p>' : ""}${inner}<p class="lt-hint"></p></div>`);
  if (cap) set(s, ".lt-cap", typeof cap === "string" ? cap : coverTitle(ctx)); set(s, ".lt-hint", ctx.t.open);
  const b = s.querySelector(".cv"); b.setAttribute("aria-label", ctx.t.open); ctx.ambient(); if (before) before(s, b);
  await ctx.press(b); if (!ctx.alive()) return;
  if (after) await after(s, b); b.classList.add("open"); s.classList.add("opened"); await tw(ctx, ms); return s;
}
/* a title card (art + caption + big title + "Begin" button) */
async function titled(ctx, name, art, ms, { after, words = false } = {}) {
  const s = ctx.scene(`<div class="lt-center op op-${name}">${art}<p class="lt-cap"></p><h2 class="lt-big"></h2><button class="lt-btn cv" type="button"></button></div>`);
  set(s, ".lt-cap", coverTitle(ctx)); const big = set(s, ".lt-big", ctx.c.title); set(s, ".lt-btn", ctx.t.begin);
  if (words) { big.textContent = ""; ctx.c.title.split(/\s+/).filter(Boolean).forEach((w, i) => { const sp = document.createElement("span"); sp.className = "sw"; sp.textContent = w; sp.style.cssText = `--i:${i};--rx:${rnd(-38, 38).toFixed(1)}vw;--ry:${rnd(-30, 30).toFixed(1)}vh;--rr:${rnd(-40, 40).toFixed(0)}deg`; big.append(sp, " "); }); }
  ctx.ambient(); await ctx.press(s.querySelector(".lt-btn")); if (!ctx.alive()) return;
  s.classList.add("opened"); if (after) await after(s); await tw(ctx, ms); return s;
}
function bookCover(s, ctx) { set(s, ".book-cover b", ctx.c.title); set(s, ".book-cover .bt", ctx.c.to ? `${ctx.t.forYou} ${ctx.c.to}` : ""); set(s, ".book-cover em", ctx.c.from ? `— ${ctx.c.from}` : ""); }
const BOOK = (extra = "", cover = "") => `<button class="cv book" type="button"><i class="book-page"></i>${extra}<i class="book-cover">${cover}<b></b><span class="bt"></span><em></em></i></button>`;

export const OPEN = {
  /* envelope family */
  waxseal: (ctx) => object(ctx, "waxseal", `<button class="cv env" type="button">${ENV}<i class="wax"><b></b><b></b></i></button>`, 3000, { after: () => { setTimeout(() => ctx.fx.burst("petals", 26), 500); } }),
  windflap: (ctx) => object(ctx, "windflap", `<button class="cv env" type="button">${ENV}</button><div class="stems" aria-hidden="true">${many(7, (i) => `<i style="--i:${i}"></i>`)}</div>`, 2100, { after: () => ctx.fx.burst("fluff", 24) }),
  ribbon: (ctx) => object(ctx, "ribbon", `<button class="cv env" type="button">${ENV}<i class="tw tw-h"></i><i class="tw tw-v"></i><i class="bow"><b></b><b></b></i></button>${many(4, (i) => `<span class="orn o${i + 1}" aria-hidden="true">${SVG.corner}</span>`)}`, 2800, { after: () => setTimeout(() => ctx.fx.burst("dust", 50), 700) }),
  lightsweep: (ctx) => object(ctx, "lightsweep", `<div class="rays" aria-hidden="true"></div><button class="cv env" type="button">${ENV}<i class="glow"></i></button>`, 2600, { after: () => ctx.fx.burst("fireflies", 14) }),
  trifold: (ctx) => object(ctx, "trifold", `<button class="cv fold" type="button"><i class="f1"><b></b></i><i class="f2"><i class="f3"></i></i></button><div class="vine-l" aria-hidden="true">${many(5, (i) => `<i style="--i:${i}"></i>`)}</div>`, 2500),
  hop: (ctx) => object(ctx, "hop", `<button class="cv env" type="button">${ENV}</button>`, 1300, { after: () => setTimeout(() => ctx.fx.burst("glyphs", 22), 250) }),
  /* cinematic family */
  linedraw: (ctx) => titled(ctx, "linedraw", `<div class="art" aria-hidden="true">${SVG.heart}</div>`, 1300),
  blurfocus: (ctx) => titled(ctx, "blurfocus", `<div class="art" aria-hidden="true">${SVG.branch}</div>`, 1700, { after: () => ctx.fx.burst("sakura", 40) }),
  constellation: (ctx) => titled(ctx, "constellation", `<div class="ring" aria-hidden="true">${many(28, (i) => `<i style="--a:${(i * 360) / 28}deg;--rx:${rnd(-45, 45).toFixed(0)}vw;--ry:${rnd(-40, 40).toFixed(0)}vh;--d:${(rnd(0, 900)) | 0}ms"></i>`)}</div>`, 1400, { after: () => { ctx.fx.burst("dust", 60); ctx.fx.burst("shooting", 3); } }),
  inkdrop: (ctx) => titled(ctx, "inkdrop", `<div class="ink" aria-hidden="true"><i class="drop"></i><i class="blot"></i><i class="rip"></i><i class="rip r2"></i></div>`, 2300),
  shuffle: (ctx) => titled(ctx, "shuffle", "", 1100, { words: true, after: () => ctx.fx.burst("bubbles", 20) }),
  /* scrapbook family */
  sketch: (ctx) => object(ctx, "sketch", BOOK("", `<span class="sk" aria-hidden="true">${SVG.branch}</span>`), 1600, { cap: false, before: (s) => bookCover(s, ctx) }),
  stamp: (ctx) => object(ctx, "stamp", BOOK(`<span class="tp t1"></span><span class="tp t2"></span>`, `<span class="stp"><span></span></span>`), 1600, { cap: false, before: (s) => { bookCover(s, ctx); set(s, ".stp span", ctx.c.lang === "en" ? "♥ FOR YOU ♥" : "♥ UNTUKMU ♥"); } }),
  riffle: (ctx) => object(ctx, "riffle", BOOK(many(4, (i) => `<i class="pg" style="--i:${i}"></i>`)), 2300, { cap: false, before: (s) => bookCover(s, ctx) }),
  burst: (ctx) => object(ctx, "burst", BOOK(), 1000, { cap: false, before: (s) => bookCover(s, ctx), after: () => { ctx.fx.burst("stars", 26); ctx.fx.confetti(50, .5, .55); } }),
  captoss: (ctx) => object(ctx, "captoss", BOOK("", `<span class="emb" aria-hidden="true"></span>`) + `<div class="caps" aria-hidden="true">${many(5, (i) => `<i style="--i:${i};--x:${(10 + i * 19).toFixed(0)}%;--r:${rnd(380, 760).toFixed(0)}deg"></i>`)}</div>`, 2200, { cap: false, before: (s) => bookCover(s, ctx) }),
  /* gift box family */
  untie: (ctx) => object(ctx, "untie", `<button class="cv box" type="button">${BOX}<i class="bow2"><b></b><b></b></i></button><div class="peony" aria-hidden="true">${many(10, (i) => `<i style="--a:${i * 36}deg;--i:${i}"></i>`)}</div>`, 2600),
  crescendo: (ctx) => object(ctx, "crescendo", `<button class="cv box" type="button">${BOX}</button><i class="flash" aria-hidden="true"></i>`, 1300, {
    after: async (s, b) => { b.classList.add("shake"); await tw(ctx, 1300); if (!ctx.alive()) return; ctx.sfx("reveal"); ctx.fx.confetti(110, .5, .55); ctx.fx.burst("balloons", 8); } }),
  doors: (ctx) => object(ctx, "doors", `<button class="cv box" type="button">${BOX}<span class="dl"></span><span class="dr"></span><span class="it">${many(4, (i) => `<b style="--i:${i}"></b>`)}</span></button>`, 2200, { after: () => setTimeout(() => ctx.fx.burst("sparkles", 20), 600) }),
  diploma: (ctx) => object(ctx, "diploma", `<button class="cv box" type="button">${BOX}</button><div class="roll" aria-hidden="true"><i class="rod"></i><i class="sheet"><b></b></i><i class="rod r2"></i></div>`, 2700, { before: (s) => set(s, ".sheet b", ctx.c.title), after: () => setTimeout(() => ctx.fx.burst("glitter", 40), 900) }),
  /* cake */
  blowsmoke: (ctx) => object(ctx, "blowsmoke", `<button class="cv cake" type="button"><span class="candles"><i><b></b></i><i><b></b></i><i><b></b></i></span><span class="smoke">${many(3, (i) => `<i style="--i:${i}"></i>`)}</span><span class="tier t1"></span><span class="tier t2"></span><span class="plate"></span></button>`, 2400, {
    cap: ctx.c.to ? `${ctx.c.to} — ${ctx.t.wish}` : ctx.t.wish, before: (s) => set(s, ".lt-hint", ctx.t.blow), after: () => { setTimeout(() => { ctx.fx.fireworks(3); ctx.fx.burst("balloons", 9); }, 700); } }),
};
