/* Motion-graphic intro: a timed, skippable sequence of kinetic-type scenes (~15-30 s) played after the cover is opened and before the letter.
   Beats: title -> recipient -> message highlights (word by word) -> photo montage -> sender. Each engine dresses the same beats differently (see css .mg-*). */
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const chars = (s, base = 0) => [...String(s)].map((ch, i) => (ch === " " ? " " : `<i style="--i:${base + i}">${esc(ch)}</i>`)).join("");
const words = (s, base = 0) => String(s).split(/\s+/).filter(Boolean).map((w, i) => `<span class="mw"><b style="--i:${base + i}">${esc(w)}</b></span>`).join(" ");
const SHAPES = `<span class="mg-s s1"></span><span class="mg-s s2"></span><span class="mg-s s3"></span><span class="mg-s s4"></span><span class="mg-s s5"></span><span class="mg-s s6"></span>`;
const L = { id: { skip: "Lewati", to: "Untuk", from: "Dengan sepenuh hati,", words: "Beberapa kata untukmu" }, en: { skip: "Skip", to: "For", from: "With all my heart,", words: "A few words for you" } };

export async function motionIntro(ctx) {
  if (ctx.reduced || ctx.quick) return;
  const { c } = ctx, t = L[c.lang] || L.id, host = ctx.stage.parentElement;
  let skipped = false, release; const skipP = new Promise((r) => { release = r; });
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "lt-skip"; btn.textContent = t.skip; btn.onclick = (e) => { e.stopPropagation(); skipped = true; release(); }; host.append(btn);
  const w = (ms) => Promise.race([ctx.wait(ms), skipP]);
  const beat = async (cls, html, ms, sound = "reveal") => { if (skipped || !ctx.alive()) return; ctx.sfx(sound); ctx.scene(`<div class="mg mg-${cls}">${SHAPES}${html}</div>`); await w(ms); };
  try {
    await beat("title", `<h2 class="mg-title">${chars(c.title)}</h2><span class="mg-line"></span>`, 4200, "open");
    if (c.to) await beat("to", `<p class="mg-small">${esc(t.to)}</p><h2 class="mg-name">${chars(c.to)}</h2><span class="mg-line"></span>`, 3600);
    const ws = c.message.replace(/\s+/g, " ").trim().split(" "), chunks = [];
    for (let i = 0; i < ws.length && chunks.length < 3; i += 9) chunks.push(ws.slice(i, i + 9).join(" "));
    for (const [k, ch] of chunks.entries()) await beat("words", `<p class="mg-small">${k === 0 ? esc(t.words) : "&nbsp;"}</p><p class="mg-words">${words(ch)}</p>`, 2600 + ch.length * 55, "tick");
    const ph = ctx.has("gallery") ? c.photos.slice(0, 4) : [];
    if (ph.length && !skipped && ctx.alive()) {
      ctx.sfx("reveal");
      ctx.scene(`<div class="mg mg-photos">${SHAPES}<div class="mg-strip">${ph.map((p, i) => `<figure style="--i:${i}"><img alt="" src="${esc(p.url)}"><figcaption>${esc(p.caption || "")}</figcaption></figure>`).join("")}</div></div>`);
      await w(1600 + ph.length * 1900);
    }
    if (c.from) await beat("from", `<p class="mg-small">${esc(t.from)}</p><h2 class="mg-name">${chars(c.from)}</h2><span class="mg-line"></span>`, 3600, "end");
  } finally { btn.remove(); }
}
