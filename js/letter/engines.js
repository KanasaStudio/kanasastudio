import { motionIntro } from "./motion.js?v=20261111a";
import { OPEN } from "./openings.js?v=20261111a";
import { SVG } from "./profiles.js?v=20261111a";
/* Template engines. Each engine is an async function that tells one story using the player's context:
     ctx.scene(html, cls)  swap the visible scene          ctx.press(el)   wait for a button press
     ctx.type(el, text)    typing effect (tap to skip)     ctx.nextTap()   wait for a tap anywhere
     ctx.wait(ms)          cancellable delay               ctx.fx          confetti() / ambient(kind, rate)
     ctx.has(effect)       is an effect switched on        ctx.c           the letter content
   To add a new design: write a function here, add it to ENGINES, then create a template row (admin -> Letters) that uses its key.
   Engines may differ completely; shared pieces (readLetter, closing) are optional helpers. */
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fmt = (d, lang) => { try { return new Date(d + "T12:00:00").toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { dateStyle: "long" }); } catch { return d; } };

/* ambient particles: the motion profile's own atmosphere (always), plus the sender's hearts/petals/sparkles toggles */
export function ambient(ctx) {
  const m = ctx.mp ? .45 : 1;
  if (ctx.mp) ctx.mp.amb.forEach(([k, r]) => ctx.fx.ambient(k, r));
  if (ctx.has("hearts")) ctx.fx.ambient("hearts", .8 * m);
  if (ctx.has("petals")) ctx.fx.ambient("petals", 1.1 * m);
  if (ctx.has("sparkles")) ctx.fx.ambient("sparkles", 2.2 * m);
}
/* motion profile cover + intro (replaces the engine's own cover when the template has a profile) */
async function mpOpen(ctx) { await OPEN[ctx.mp.open](ctx); if (ctx.alive()) await motionIntro(ctx); }
function lightbox(root, url, alt) {
  const o = el("div", "lt-lightbox"); const i = el("img"); i.src = url; i.alt = alt || ""; o.append(i); o.onclick = () => o.remove(); root.append(o);
}
/* GIF stickers: animated images dropped in by the sender (content.gifs, place = intro | letter | both) */
function gifsFor(ctx, where) { return (ctx.c.gifs || []).filter((g) => g.place === "both" || g.place === where); }
function gifRow(ctx, host) {
  const g = gifsFor(ctx, "letter"); if (!g.length) return;
  const row = el("div", "lt-gifs"); g.forEach((x, i) => { const f = el("figure", "lt-gif"); f.style.setProperty("--r", `${((i * 5) % 7) - 3}deg`); f.style.setProperty("--d", `${i * 160}ms`); const im = el("img"); im.src = x.url; im.alt = ""; im.loading = "lazy"; f.append(im); row.append(f); });
  host.append(row); requestAnimationFrame(() => row.classList.add("show"));
}
function polaroids(ctx, host, cls = "") {
  ctx.sfx("reveal"); const wrap = el("div", `lt-gal ${cls}`); wrap.setAttribute("aria-label", ctx.t.memories);
  ctx.c.photos.forEach((p, i) => {
    const f = el("figure", "pol"); f.style.setProperty("--r", `${((i * 37) % 9) - 4}deg`); f.style.setProperty("--d", `${i * 140}ms`);
    const im = el("img"); im.src = p.url; im.alt = p.caption || ""; im.loading = "lazy"; im.decoding = "async"; f.append(im);
    if (p.caption) f.append(el("figcaption", "", p.caption));
    f.onclick = () => lightbox(ctx.stage.parentElement, p.url, p.caption); wrap.append(f);
  });
  host.append(wrap); requestAnimationFrame(() => wrap.classList.add("show")); return wrap;
}

/* shared: the letter itself (paper, typed text, signature, photos) */
async function readLetter(ctx, cls = "") {
  const { c, t } = ctx;
  const s = ctx.scene(`<div class="paper-wrap ${cls}"><article class="paper"><h2 class="lt-title"></h2><p class="lt-to"></p><div class="lt-body" aria-live="polite"></div><footer class="lt-sig" hidden></footer><div class="lt-extra"></div><div class="lt-actions" hidden></div></article></div>`, "scroll");
  s.querySelector(".lt-title").textContent = c.title; s.querySelector(".lt-to").textContent = c.to ? `${t.forYou} ${c.to},` : "";
  ambient(ctx);
  await ctx.type(s.querySelector(".lt-body"), c.message);
  if (!ctx.alive()) return;
  const sig = s.querySelector(".lt-sig"); sig.hidden = false;
  sig.append(el("span", "lt-w", t.withLove), el("strong", "", c.from || ""), ...(c.date ? [el("small", "", fmt(c.date, c.lang))] : []));
  if (gifsFor(ctx, "letter").length) { await ctx.wait(400); ctx.sfx("reveal"); gifRow(ctx, s.querySelector(".lt-extra")); s.scrollTo({ top: s.scrollHeight, behavior: "smooth" }); await ctx.wait(600); }
  if (ctx.has("gallery") && c.photos.length) { await ctx.wait(500); polaroids(ctx, s.querySelector(".lt-extra")); s.scrollTo({ top: s.scrollHeight, behavior: "smooth" }); await ctx.wait(400 + c.photos.length * 140); }
  const act = s.querySelector(".lt-actions"); act.hidden = false;
  if (ctx.has("closing")) { const b = el("button", "lt-btn", t.next); b.type = "button"; act.append(b); await ctx.press(b); if (ctx.alive()) await closing(ctx); }
  else act.append(replayBtn(ctx));
}
function replayBtn(ctx) { const b = el("button", "lt-btn ghost", "↺ " + ctx.t.replay); b.type = "button"; b.onclick = () => ctx.replay(); return b; }
/* profile finales: decoration markup + what the particle layer does */
const FINALE = {
  petals: [12, (fx) => fx.burst("petals", 60)], meadow: [9, (fx) => fx.burst("fluff", 30)], frame: [4, (fx) => fx.burst("dust", 70)],
  lanterns: [5, (fx) => fx.burst("lanterns", 16)], wreath: [12, (fx) => fx.burst("hearts", 14)], stickers: [10, (fx) => fx.burst("glyphs", 30)],
  heartline: [0, (fx) => fx.burst("motes", 30)], petalstorm: [0, (fx) => fx.burst("sakura", 90)], "fireworks-gold": [12, (fx) => fx.fireworks(6, ["#f3d98a", "#fff3c4", "#d9b45a"])],
  dawn: [2, (fx) => fx.ambient("rain", 0)], aurora: [3, (fx) => fx.burst("bubbles", 36)], wreathdraw: [0, (fx) => fx.burst("sprigs", 14)],
  stamp: [1, (fx) => fx.burst("scraps", 30)], collage: [6, (fx) => fx.burst("hearts", 10)], stickerboom: [8, (fx) => { fx.burst("stars", 30); fx.confetti(80, .5, .5); }],
  caps: [6, (fx) => fx.burst("streamers", 40)], bigbloom: [12, (fx) => fx.burst("peonyp", 24)], cannons: [0, (fx) => { fx.burst("cannon", 70, .02, .98, 1); fx.burst("cannon", 70, .98, .98, -1); fx.burst("balloons", 10); }],
  hopstars: [5, (fx) => fx.burst("sparkles", 30)], seal: [3, (fx) => fx.burst("glitter", 60)], fireworks: [0, (fx) => { fx.fireworks(7); fx.burst("balloons", 10); }],
};
async function finale(ctx) {
  const { c, t, mp } = ctx, [k, run] = FINALE[mp.close] || [0, () => {}]; ctx.sfx("end");
  const deco = mp.close === "heartline" ? SVG.heart : mp.close === "wreathdraw" ? SVG.wreath : Array.from({ length: k }, (_, i) => `<i style="--i:${i};--a:${(i * 360) / Math.max(k, 1)}deg;--x:${(5 + Math.random() * 90).toFixed(0)}%;--r:${(Math.random() * 60 - 30).toFixed(0)}deg"></i>`).join("");
  const s = ctx.scene(`<div class="lt-center closing fin fin-${mp.close}"><div class="lt-cdeco" aria-hidden="true">${deco}</div><p class="lt-w"></p><h2 class="lt-big"></h2><small class="lt-date"></small><div class="lt-actions"></div></div>`);
  s.querySelector(".lt-w").textContent = t.withLove; s.querySelector(".lt-big").textContent = c.from || c.title; s.querySelector(".lt-date").textContent = c.date ? fmt(c.date, c.lang) : "";
  if (mp.close === "stamp") s.querySelector(".lt-cdeco i").textContent = c.lang === "en" ? "THANK YOU" : "TERIMA KASIH";
  if (mp.close === "collage") s.querySelectorAll(".lt-cdeco i").forEach((e, i) => { const p = c.photos[i]; if (p) { const im = el("img"); im.src = p.url; im.alt = ""; im.loading = "lazy"; e.append(im); } });
  const a = s.querySelector(".lt-actions"); a.append(replayBtn(ctx));
  if (!ctx.preview) { const m = el("a", "lt-link", t.mine); m.href = ctx.makeUrl; a.append(m); }
  ctx.stage.parentElement.classList.add("finale"); await ctx.wait(350); if (ctx.alive()) run(ctx.fx);
}
async function closing(ctx) {
  if (ctx.mp) return finale(ctx);
  const { c, t } = ctx; ctx.sfx("end");
  const s = ctx.scene(`<div class="lt-center closing"><p class="lt-w"></p><h2 class="lt-big"></h2><small class="lt-date"></small><div class="lt-actions"></div></div>`);
  s.querySelector(".lt-w").textContent = t.withLove; s.querySelector(".lt-big").textContent = c.from || c.title; s.querySelector(".lt-date").textContent = c.date ? fmt(c.date, c.lang) : "";
  const a = s.querySelector(".lt-actions"); a.append(replayBtn(ctx));
  if (!ctx.preview) { const m = el("a", "lt-link", t.mine); m.href = ctx.makeUrl; a.append(m); }
  if (ctx.has("confetti")) ctx.fx.confetti(70, .5, .35); else ctx.fx.ambient("sparkles", 3);
}
const coverTitle = (ctx) => (ctx.c.to ? `${ctx.t.forYou} ${ctx.c.to}` : ctx.t.gift);

export const ENGINES = {
  /* envelope: wax-sealed envelope, flap opens, letter slides out */
  async envelope(ctx) {
    if (ctx.has("opening") && ctx.mp) await mpOpen(ctx);
    else if (ctx.has("opening")) {
      const s = ctx.scene(`<div class="lt-center"><p class="lt-cap"></p><button class="env" type="button" aria-label="${ctx.t.open}"><i class="env-paper"></i><i class="env-front"></i><i class="env-flap"></i><i class="env-seal">♥</i></button><p class="lt-hint">${ctx.t.open}</p></div>`);
      s.querySelector(".lt-cap").textContent = coverTitle(ctx); ambient(ctx);
      const b = s.querySelector(".env"); await ctx.press(b); b.classList.add("open"); s.querySelector(".lt-hint").style.opacity = 0; await ctx.wait(1500); await motionIntro(ctx);
    }
    if (ctx.alive()) await readLetter(ctx, "env-paper-style");
  },
  /* giftbox: shaking box, lid pops, card rises, confetti */
  async giftbox(ctx) {
    if (ctx.has("opening") && ctx.mp) await mpOpen(ctx);
    else if (ctx.has("opening")) {
      const s = ctx.scene(`<div class="lt-center"><p class="lt-cap"></p><button class="box" type="button" aria-label="${ctx.t.open}"><i class="box-card"></i><i class="box-body"></i><i class="box-lid"></i></button><p class="lt-hint">${ctx.t.open}</p></div>`);
      s.querySelector(".lt-cap").textContent = coverTitle(ctx); ambient(ctx);
      const b = s.querySelector(".box"); await ctx.press(b); b.classList.add("open"); s.querySelector(".lt-hint").style.opacity = 0;
      await ctx.wait(350); if (ctx.has("confetti")) ctx.fx.confetti(110, .5, .5); await ctx.wait(1300); await motionIntro(ctx);
    }
    if (ctx.alive()) await readLetter(ctx, "card-style");
  },
  /* cake: tap to blow out the candles, balloons rise, then the greeting */
  async cake(ctx) {
    if (ctx.has("opening") && ctx.mp) await mpOpen(ctx);
    else if (ctx.has("opening")) {
      const s = ctx.scene(`<div class="lt-center"><p class="lt-cap"></p><button class="cake" type="button" aria-label="${ctx.t.blow}"><span class="candles"><i><b></b></i><i><b></b></i><i><b></b></i></span><span class="tier t1"></span><span class="tier t2"></span><span class="plate"></span></button><p class="lt-hint">${ctx.t.blow}</p></div>`);
      s.querySelector(".lt-cap").textContent = ctx.t.wish; if (ctx.c.to) s.querySelector(".lt-cap").textContent = `${ctx.c.to} — ${ctx.t.wish}`; ambient(ctx);
      const b = s.querySelector(".cake"); await ctx.press(b); b.classList.add("out"); s.querySelector(".lt-hint").style.opacity = 0;
      for (let i = 0; i < 7; i++) { const bl = el("i", "balloon"); bl.style.cssText = `--x:${8 + i * 13}%;--d:${i * 160}ms;--h:${i % 2 ? "var(--p)" : "var(--a)"}`; s.append(bl); }
      if (ctx.has("confetti")) ctx.fx.confetti(120, .5, .55); await ctx.wait(2100); await motionIntro(ctx);
    }
    if (ctx.alive()) await readLetter(ctx, "card-style");
  },
  /* scrapbook: closed book opens onto a board of taped polaroids, then a handwritten note */
  async scrapbook(ctx) {
    const { c, t } = ctx;
    if (ctx.has("opening") && ctx.mp) await mpOpen(ctx);
    else if (ctx.has("opening")) {
      const s = ctx.scene(`<div class="lt-center"><button class="book" type="button" aria-label="${t.open}"><i class="book-page"></i><i class="book-cover"><b></b><span></span><em></em></i></button><p class="lt-hint">${t.open}</p></div>`);
      s.querySelector(".book-cover b").textContent = c.title; s.querySelector(".book-cover span").textContent = c.to ? `${t.forYou} ${c.to}` : ""; s.querySelector(".book-cover em").textContent = c.from ? `— ${c.from}` : "";
      const b = s.querySelector(".book"); await ctx.press(b); b.classList.add("open"); s.querySelector(".lt-hint").style.opacity = 0; await ctx.wait(1300); await motionIntro(ctx);
    }
    if (!ctx.alive()) return;
    const s = ctx.scene(`<div class="board"><h2 class="lt-title"></h2><div class="board-photos"></div><article class="paper note"><p class="lt-to"></p><div class="lt-body" aria-live="polite"></div><footer class="lt-sig" hidden></footer><div class="lt-actions" hidden></div></article></div>`, "scroll");
    s.querySelector(".lt-title").textContent = c.title; s.querySelector(".lt-to").textContent = c.to ? `${t.forYou} ${c.to},` : ""; ambient(ctx);
    gifRow(ctx, s.querySelector(".board-photos"));
    if (ctx.has("gallery") && c.photos.length) polaroids(ctx, s.querySelector(".board-photos"), "scatter");
    const body = s.querySelector(".lt-body"), note = s.querySelector(".note");
    if (ctx.has("typing") && s.querySelector(".board-photos .pol")) { // typed when the note scrolls into view
      const bl = new Promise((r) => { const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); r(); } }, { root: s, threshold: .35 }); io.observe(note); });
      const ph = s.querySelectorAll(".pol"); s.addEventListener("scroll", () => { ph.forEach((p, i) => p.style.translate = `0 ${Math.round(Math.sin(s.scrollTop / 90 + i) * 6)}px`); }, { passive: true });
      await bl;
    }
    await ctx.type(body, c.message); if (!ctx.alive()) return;
    const sig = s.querySelector(".lt-sig"); sig.hidden = false; sig.append(el("span", "lt-w", t.withLove), el("strong", "", c.from || ""), ...(c.date ? [el("small", "", fmt(c.date, c.lang))] : []));
    const act = s.querySelector(".lt-actions"); act.hidden = false;
    if (ctx.has("closing")) { const b = el("button", "lt-btn", t.next); b.type = "button"; act.append(b); await ctx.press(b); if (ctx.alive()) await closing(ctx); } else act.append(replayBtn(ctx));
  },
  /* cinematic: night sky, one paragraph per scene, tap or wait to continue */
  async cinematic(ctx) {
    const { c, t } = ctx;
    if (ctx.quick) { const s = ctx.scene(`<div class="paper-wrap"><article class="paper"><h2 class="lt-title"></h2><div class="lt-body"></div></article></div>`, "scroll"); s.querySelector(".lt-title").textContent = c.title; s.querySelector(".lt-body").textContent = c.message; ambient(ctx); return; }
    const mk = () => Array.from({ length: 60 }, () => `${(Math.random() * 100).toFixed(1)}vw ${(Math.random() * 100).toFixed(1)}vh 0 ${Math.random() < .2 ? 1 : 0}px #fff`).join(",");
    const sky = el("div", "sky"); sky.setAttribute("aria-hidden", "true"); sky.innerHTML = `<i class="stars s1"></i><i class="stars s2"></i><i class="moon"></i>`;
    sky.querySelector(".s1").style.boxShadow = mk(); sky.querySelector(".s2").style.boxShadow = mk();
    if (!ctx.mp) ctx.stage.before(sky);
    const dots = (n, i) => `<div class="dots" aria-hidden="true">${Array.from({ length: n }, (_, k) => `<i${k <= i ? ' class="on"' : ""}></i>`).join("")}</div>`;
    ambient(ctx);
    if (ctx.has("opening") && ctx.mp) await mpOpen(ctx);
    else if (ctx.has("opening")) {
      const s = ctx.scene(`<div class="lt-center"><p class="lt-cap"></p><h2 class="lt-big"></h2><button class="lt-btn" type="button">${t.begin}</button></div>`);
      s.querySelector(".lt-cap").textContent = coverTitle(ctx); s.querySelector(".lt-big").textContent = c.title; await ctx.press(s.querySelector("button")); await motionIntro(ctx);
    }
    const paras = c.message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean), photos = ctx.has("gallery") ? c.photos : [], total = paras.length + photos.length + 1;
    let i = 0;
    for (const p of paras) {
      if (!ctx.alive()) return;
      ctx.sfx("reveal"); const s = ctx.scene(`<div class="lt-center slide"><p class="lt-line"></p><small class="lt-tap">${t.tap}</small>${dots(total, i++)}</div>`);
      await ctx.type(s.querySelector(".lt-line"), p); await Promise.race([ctx.wait(1500 + p.length * 28), ctx.nextTap()]);
    }
    for (const ph of photos) {
      if (!ctx.alive()) return;
      const s = ctx.scene(`<div class="lt-center slide ph"><figure><img alt=""><figcaption></figcaption></figure>${dots(total, i++)}</div>`);
      const im = s.querySelector("img"); im.src = ph.url; im.alt = ph.caption || ""; s.querySelector("figcaption").textContent = ph.caption; await Promise.race([ctx.wait(4200), ctx.nextTap()]);
    }
    for (const g of gifsFor(ctx, "letter")) {
      if (!ctx.alive()) return;
      const s = ctx.scene(`<div class="lt-center slide ph gif"><figure><img alt=""></figure></div>`); s.querySelector("img").src = g.url; await Promise.race([ctx.wait(3600), ctx.nextTap()]);
    }
    if (!ctx.alive()) return;
    if (ctx.mp) return finale(ctx);
    ctx.sfx("end"); const s = ctx.scene(`<div class="lt-center slide closing"><p class="lt-w">${t.withLove}</p><h2 class="lt-big"></h2><small class="lt-date"></small><div class="lt-actions"></div>${dots(total, total)}</div>`);
    s.querySelector(".lt-big").textContent = c.from || c.title; s.querySelector(".lt-date").textContent = c.date ? fmt(c.date, c.lang) : "";
    const a = s.querySelector(".lt-actions"); a.append(replayBtn(ctx)); if (!ctx.preview) { const m = el("a", "lt-link", t.mine); m.href = ctx.makeUrl; a.append(m); }
    if (ctx.has("closing")) ctx.fx.confetti(40, .5, .4);
  },
};
