/* Motion-graphic intro: a timed, skippable sequence of kinetic-type scenes (~15-30 s) played after the cover is opened and before the letter.
   Without a motion profile: title -> recipient -> message highlights -> GIFs -> photo montage -> sender, dressed per engine (css .mg-*).
   With a profile (ctx.mp, see profiles.js): its own beat order and tempo, and every letter/word carries random/order variables
   (--i --rx --ry --rr --z --c) that the profile's text style in css/letter-motion.css turns into a different kinetic-type animation. */
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const r = (a, b) => (a + Math.random() * (b - a)).toFixed(1);
const vars = (i, n) => `--i:${i};--rx:${r(-42, 42)};--ry:${r(-34, 34)};--rr:${r(-40, 40)};--z:${i % 2 ? 1 : -1};--c:${Math.abs(i - (n - 1) / 2).toFixed(1)}`;
/* letters keep their own animation variables, but each word stays unbreakable so titles never wrap mid-word */
const chars = (s) => { const a = [...String(s)]; let i = 0; return String(s).split(/(\s+)/).map((w) => (/^\s*$/.test(w) ? (w ? " " : "") : `<span class="mwc">${[...w].map((ch) => `<i style="${vars(i++, a.length)}">${esc(ch)}</i>`).join("")}</span>`) + (/^\s+$/.test(w) ? (i += w.length, "") : "")).join(""); };
const words = (s) => { const a = String(s).split(/\s+/).filter(Boolean); return a.map((w, i) => `<span class="mw"><b style="${vars(i, a.length)}">${esc(w)}</b></span>`).join(" "); };
const SHAPES = `<span class="mg-s s1"></span><span class="mg-s s2"></span><span class="mg-s s3"></span><span class="mg-s s4"></span><span class="mg-s s5"></span><span class="mg-s s6"></span>`;
const L = { id: { skip: "Lewati", to: "Untuk", from: "Dengan sepenuh hati,", words: "Beberapa kata untukmu" }, en: { skip: "Skip", to: "For", from: "With all my heart,", words: "A few words for you" } };
const DEFAULT_BEATS = ["title", "to", "words", "gif", "photos", "from"];

export async function motionIntro(ctx) {
  if (ctx.reduced || ctx.quick) return;
  const { c } = ctx, t = L[c.lang] || L.id, host = ctx.stage.parentElement, k = ctx.mp?.tempo || 1;
  let skipped = false, release; const skipP = new Promise((res) => { release = res; });
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "lt-skip"; btn.textContent = t.skip; btn.onclick = (e) => { e.stopPropagation(); skipped = true; release(); }; host.append(btn);
  const w = (ms) => Promise.race([ctx.wait(ms * k), skipP]);
  const beat = async (cls, html, ms, sound = "reveal") => { if (skipped || !ctx.alive()) return; ctx.sfx(sound); ctx.scene(`<div class="mg mg-${cls}">${SHAPES}${html}</div>`); await w(ms); };
  const steps = {
    title: () => beat("title", `<h2 class="mg-title">${chars(c.title)}</h2><span class="mg-line"></span>`, 4200, "open"),
    to: () => (c.to ? beat("to", `<p class="mg-small">${esc(t.to)}</p><h2 class="mg-name">${chars(c.to)}</h2><span class="mg-line"></span>`, 3600) : null),
    words: async () => {
      const ws = c.message.replace(/\s+/g, " ").trim().split(" "), chunks = [];
      for (let i = 0; i < ws.length && chunks.length < 3; i += 9) chunks.push(ws.slice(i, i + 9).join(" "));
      for (const [n, ch] of chunks.entries()) await beat("words", `<p class="mg-small">${n === 0 ? esc(t.words) : "&nbsp;"}</p><p class="mg-words">${words(ch)}</p>`, 2600 + ch.length * 55, "tick");
    },
    gif: async () => { for (const g of (c.gifs || []).filter((x) => x.place !== "letter")) await beat("gif", `<figure class="mg-gif"><img alt="" src="${esc(g.url)}"></figure>`, 3400, "reveal"); },
    photos: async () => {
      const ph = ctx.has("gallery") ? c.photos.slice(0, 4) : [];
      if (!ph.length || skipped || !ctx.alive()) return;
      ctx.sfx("reveal");
      ctx.scene(`<div class="mg mg-photos">${SHAPES}<div class="mg-strip">${ph.map((p, i) => `<figure style="--i:${i}"><img alt="" src="${esc(p.url)}"><figcaption>${esc(p.caption || "")}</figcaption></figure>`).join("")}</div></div>`);
      await Promise.race([ctx.wait(1600 + ph.length * 1900), skipP]); // card timings are in CSS, so not tempo-scaled
    },
    from: () => (c.from ? beat("from", `<p class="mg-small">${esc(t.from)}</p><h2 class="mg-name">${chars(c.from)}</h2><span class="mg-line"></span>`, 3600, "end") : null),
  };
  try { for (const b of ctx.mp?.beats || DEFAULT_BEATS) { if (skipped || !ctx.alive()) break; await steps[b]?.(); } }
  finally { btn.remove(); }
}
