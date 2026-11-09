/* Interactive Digital Letter & Gift — public side: template catalog, 5-step editor, share link + QR, "My letters".
   Routes: #/letters · #/letters/new/<template> · #/letters/mine · #/letters/edit/<id>
   Players live in /letter/ (viewer) and are shown here inside an iframe so the preview matches what the recipient gets. */
import { sb } from "./db.js";
import { esc, $, $$, money, store, toast, fmtDate } from "./util.js";

const H = { setMeta() {}, set: () => ({}) };
const FXL = { opening: ["Opening scene", "A cover to tap (envelope, gift box, cake…) before the letter appears."], typing: ["Typing text", "The message is written out letter by letter. Tap to skip."], hearts: ["Floating hearts", "Soft hearts drift up the screen."], confetti: ["Confetti", "A burst of confetti when it opens and at the end."], petals: ["Falling petals", "Flower petals drift down."], sparkles: ["Sparkles", "Twinkling stars in the background."], gallery: ["Photo gallery", "Show your photos with the letter."], closing: ["Closing scene", "A final card with your name before it ends."] };
const DECL = { tape: "Washi tape", seal: "Wax seal", ribbon: "Ribbon", stars: "Stars", border: "Border" };
const FONTL = { serif: "Elegant serif", script: "Handwritten script", hand: "Casual hand", sans: "Clean sans", classic: "Classic serif" };
const COLS = [["primary", "Main colour"], ["accent", "Accent"], ["bg", "Background"], ["paper", "Paper"]];
const TAGS = ["romantic", "cute", "elegant", "playful", "minimal", "dark"];
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : d);
const F = { cat: "", tag: "", price: "" };
let DATA = null, ED = null, PV = null, MODAL = null;

export function initLetters(h) {
  Object.assign(H, h);
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onInput);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && MODAL) closeModal(); });
}

/* ---------- data ---------- */
async function loadData(force) {
  if (DATA && !force) return DATA;
  const [c, t, p, a] = await Promise.all([
    sb.from("letter_categories").select("*").eq("is_active", true).order("sort_order"),
    sb.from("letter_templates").select("*").eq("is_active", true).order("sort_order"),
    sb.from("letter_plans").select("*").eq("is_active", true).order("sort_order"),
    sb.from("letter_addons").select("*").eq("is_active", true)]);
  for (const r of [c, t, p, a]) if (r.error) throw r.error;
  return (DATA = { cats: c.data, tpls: t.data, plans: p.data, addons: a.data });
}
export const warmLetters = () => loadData(true);
const mine = () => store.get("kns_letters", []);
const saveMine = (l) => store.set("kns_letters", l.slice(0, 40));
const ownKey = () => { let k = store.get("kns_ltkey"); if (!k) { k = crypto.randomUUID(); store.set("kns_ltkey", k); } return k; };
const base = () => new URL("./", document.baseURI).href;
const linkOf = (id) => `${base()}letter/${id}`;
const editLink = (id, tok) => `${base()}#/letters/edit/${id}?k=${tok}`;

/* ---------- catalog (step 1) ---------- */
const mini = (t) => { const th = t.defaults?.theme || {}; return `<div class="ltm ltm-${esc(t.engine)}" style="--p:${hex(th.primary, "#8b1e3f")};--a:${hex(th.accent, "#e8b4b8")};--bg:${hex(th.bg, "#1a0d12")};--paper:${hex(th.paper, "#fbf3ea")}" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`; };
function card(t, cats) {
  const cn = cats.find((c) => c.slug === t.category_slug)?.name || "";
  return `<article class="lt-card"><div class="lt-thumb">${t.thumbnail_url ? `<img src="${esc(t.thumbnail_url)}" alt="" loading="lazy">` : mini(t)}</div>
    <div class="lt-card-b"><div class="lt-meta"><span class="tag">${esc(cn)}</span><span class="tag ${t.tier === "premium" ? "prem" : ""}">${t.tier === "premium" ? money(t.price_idr) : "Free"}</span></div>
    <h3>${esc(t.name)}</h3><p class="muted">${esc(t.tagline || "")}</p>
    <div class="lt-card-act"><button type="button" class="btn ghost sm" data-ltact="preview" data-slug="${esc(t.slug)}">Preview</button><a class="btn sm" href="#/letters/new/${esc(t.slug)}">Use template</a></div></div></article>`;
}
function grid() {
  const { cats, tpls } = DATA;
  const list = tpls.filter((t) => (!F.cat || t.category_slug === F.cat) && (!F.tag || (t.tags || []).includes(F.tag)) && (!F.price || t.tier === F.price));
  return list.length ? list.map((t) => card(t, cats)).join("") : `<div class="empty"><strong>No templates match</strong>Try another category or theme.</div>`;
}
const chip = (a, v, label, cur) => `<button type="button" class="chip" data-ltact="${a}" data-v="${esc(v)}" aria-pressed="${cur === v}">${esc(label)}</button>`;
function filters() {
  const { cats } = DATA, used = new Set(DATA.tpls.map((t) => t.category_slug));
  return `<div class="lt-filters"><div class="chips" role="group" aria-label="Category">${chip("fcat", "", "All", F.cat)}${cats.filter((c) => used.has(c.slug)).map((c) => chip("fcat", c.slug, `${c.icon || ""} ${c.name}`.trim(), F.cat)).join("")}</div>
    <div class="chips" role="group" aria-label="Theme">${chip("ftag", "", "Any theme", F.tag)}${TAGS.map((x) => chip("ftag", x, x[0].toUpperCase() + x.slice(1), F.tag)).join("")}${chip("fprice", "", "Free & premium", F.price)}${chip("fprice", "free", "Free", F.price)}${chip("fprice", "premium", "Premium", F.price)}</div></div>`;
}
async function catalog() {
  H.setMeta("Interactive Digital Letter & Gift", "Create an interactive digital letter or gift and share it with a link.");
  await loadData();
  return `<div class="container page"><div class="lt-hero"><span class="eyebrow">Digital Letter & Gift</span><h1>Make someone's day with a gift that opens.</h1>
    <p class="lead muted">Pick a template, write your message, add photos and music, preview it, then share a private link. The person you send it to needs no account and no app.</p>
    <ol class="lt-how"><li><b>1</b> Choose a template</li><li><b>2</b> Personalise</li><li><b>3</b> Set the interactions</li><li><b>4</b> Preview</li><li><b>5</b> Get your link</li></ol>
    <p><a class="btn ghost sm" href="#/letters/mine">My letters on this device</a></p></div>
    <div id="ltfilters">${filters()}</div><div class="lt-grid" id="ltgrid">${grid()}</div></div>`;
}

/* ---------- preview iframe ---------- */
function mountPreview(host, getLetter) {
  const ifr = document.createElement("iframe"); ifr.title = "Live preview of the letter"; ifr.src = new URL("letter/index.html#preview", document.baseURI).href; ifr.allow = "autoplay"; ifr.loading = "eager";
  let ready = false, last = null;
  const onMsg = (e) => { if (e.source === ifr.contentWindow && e.data?.type === "lt-ready") { ready = true; send(last?.quick ?? false); } };
  addEventListener("message", onMsg);
  const send = (quick = false) => { last = { quick }; if (ready) ifr.contentWindow.postMessage({ type: "lt-preview", letter: { ...getLetter(), quick } }, location.origin); };
  host.replaceChildren(ifr);
  return { send, destroy() { removeEventListener("message", onMsg); ifr.remove(); } };
}
const sampleContent = (t) => ({ ...(t.defaults || {}), from: "Seseorang yang sayang kamu", to: "Kamu", date: new Date().toISOString().slice(0, 10), photos: [] });
function openPreview(slug) {
  const t = DATA?.tpls.find((x) => x.slug === slug); if (!t) return;
  openModal(t.name, () => ({ engine: t.engine, content: sampleContent(t) }), `<a class="btn" href="#/letters/new/${esc(t.slug)}">Use this template</a>`);
}
function openModal(title, getLetter, footer) {
  closeModal(); const prev = document.activeElement;
  const m = document.createElement("div"); m.className = "lt-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", `Preview of ${title}`);
  m.innerHTML = `<div class="lt-modal-in"><header><strong>${esc(title)}</strong>${segHtml("mobile")}<button type="button" class="btn ghost sm" data-ltact="replay">↺ Replay</button><button type="button" class="btn ghost sm" data-ltact="closemodal" aria-label="Close preview">✕</button></header>
    <div class="lt-frame" data-mode="mobile"></div><footer>${footer}</footer></div>`;
  document.body.append(m); document.body.classList.add("lt-lock");
  const pv = mountPreview($(".lt-frame", m), getLetter);
  MODAL = { m, pv, prev }; m.addEventListener("click", (e) => { if (e.target === m) closeModal(); });
  m.addEventListener("keydown", trap); $("[data-ltact=closemodal]", m).focus();
}
function closeModal() { if (!MODAL) return; MODAL.pv.destroy(); MODAL.m.remove(); document.body.classList.remove("lt-lock"); MODAL.prev?.focus?.(); MODAL = null; }
function trap(e) { if (e.key !== "Tab") return; const f = $$("button,a[href]", MODAL.m).filter((x) => !x.disabled); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
const segHtml = (mode) => `<div class="seg" role="group" aria-label="Preview size"><button type="button" data-ltact="mode" data-v="mobile" aria-pressed="${mode === "mobile"}">Mobile</button><button type="button" data-ltact="mode" data-v="desktop" aria-pressed="${mode === "desktop"}">Desktop</button></div>`;

/* ---------- editor state ---------- */
const optFx = () => (ED.tpl?.options?.effects?.length ? ED.tpl.options.effects : Object.keys(FXL));
const optDec = () => (ED.tpl?.options?.decor?.length ? ED.tpl.options.decor : Object.keys(DECL));
const maxGifs = () => (ED.addons.has("gallery") ? 6 : 3);
const maxPhotos = () => (ED.addons.has("gallery") ? 12 : 3);
const plan = () => DATA.plans.find((p) => p.id === ED.planId);
function price() {
  const t = ED.tpl, p = plan(); let rows = [];
  if (t?.tier === "premium") rows.push([`Template — ${t.name}`, t.price_idr]);
  if (p) rows.push([`Duration — ${p.name}`, p.price_idr]);
  for (const a of DATA.addons) if (ED.addons.has(a.key)) rows.push([a.name, a.price_idr]);
  return { rows, total: rows.reduce((s, r) => s + (+r[1] || 0), 0) };
}
function newState(t) {
  const d = t.defaults || {}, th = d.theme || {}, draft = store.get("kns_ltdraft_" + t.slug, null);
  const free = DATA.plans.find((p) => +p.price_idr === 0) || DATA.plans[0];
  return { mode: "new", tpl: t, step: 2, addons: new Set(draft?.addons || []), planId: draft?.planId && DATA.plans.some((p) => p.id === draft.planId) ? draft.planId : free?.id, visibility: "public", contact: store.get("kns_ltcontact", ""), busy: "", result: null,
    c: draft?.c || { from: store.get("kns_ltname", ""), to: "", title: d.title || "", message: d.message || "", date: "", lang: d.lang || "id", font: d.font || "serif",
      theme: { primary: hex(th.primary, "#8b1e3f"), accent: hex(th.accent, "#e8b4b8"), bg: hex(th.bg, "#1a0d12"), paper: hex(th.paper, "#fbf3ea") }, effects: [...(d.effects || [])], decor: [...(d.decor || [])], photos: [], gifs: [], skin: d.skin || "", music: null } };
}
const letterOf = () => ({ engine: ED.tpl?.engine || ED.engine || "envelope", content: ED.c });
let saveT = 0, sendT = 0;
function changed(rerender) {
  if (ED.mode === "new") { clearTimeout(saveT); saveT = setTimeout(() => store.set("kns_ltdraft_" + ED.tpl.slug, { c: ED.c, addons: [...ED.addons], planId: ED.planId }), 400); }
  if (rerender) renderStep(); clearTimeout(sendT); sendT = setTimeout(() => PV?.send(ED.step === 2), 320);
}
function setPath(o, path, v) { const p = path.split("."); let r = o; for (const k of p.slice(0, -1)) r = r[k]; r[p.at(-1)] = v; }

/* ---------- editor shell ---------- */
const STEPS = [["1", "Template"], ["2", "Personalise"], ["3", "Interactions"], ["4", "Preview"], ["5", "Publish"]];
function shell() {
  const edit = ED.mode === "edit";
  return `<div class="container page lt-ed" id="lted" data-step="${ED.step}"><a class="back-link" href="${edit ? "#/letters/mine" : "#/letters"}">← ${edit ? "My letters" : "All templates"}</a>
    <h1 class="lt-ed-h">${edit ? "Edit your letter" : esc(ED.tpl.name)}</h1><ol class="lt-steps" id="ltsteps" aria-label="Steps"></ol>
    <div class="lt-ed-grid"><div class="lt-ed-form" id="ltform" tabindex="-1"></div>
    <aside class="lt-ed-prev" aria-label="Live preview"><div class="lt-prev-bar">${segHtml("mobile")}<button type="button" class="btn ghost sm" data-ltact="replay">↺ Replay</button></div><div class="lt-frame" id="ltframe" data-mode="mobile"></div><p class="muted lt-prev-note">${ED.step === 2 ? "Quick preview while you type. Step 4 plays the whole experience." : "Tap the preview to try every interaction."}</p></aside></div>
    <button type="button" class="btn lt-fab" data-ltact="livepreview" aria-label="Open full-screen preview">▶ Preview</button></div>`;
}
function renderSteps() {
  const edit = ED.mode === "edit";
  $("#ltsteps").innerHTML = STEPS.map(([n, label], i) => {
    const k = i + 1, cur = k === ED.step, lab = k === 5 && edit ? "Save" : label;
    if (k === 1) return edit ? "" : `<li><a href="#/letters" class="done"><b>✓</b>${lab}</a></li>`;
    return `<li><button type="button" data-ltact="go" data-v="${k}" ${cur ? 'aria-current="step"' : ""} class="${k < ED.step ? "done" : ""}"><b>${k < ED.step ? "✓" : k}</b>${lab}</button></li>`;
  }).join("");
}
function renderStep() {
  const f = $("#ltform"); if (!f) return;
  $("#lted").dataset.step = ED.step; renderSteps();
  f.innerHTML = [null, null, s2, s3, s4, s5][ED.step]();
  $(".lt-prev-note")?.replaceChildren(document.createTextNode(ED.step === 2 ? "Quick preview while you type. Step 4 plays the whole experience." : "Tap the preview to try every interaction."));
}
const fld = (label, name, val, o = {}) => `<div class="field"><label for="ltf-${name}">${label}</label>${o.area ? `<textarea class="input" id="ltf-${name}" data-ed="${name}" maxlength="${o.max || 4000}" rows="${o.rows || 8}">${esc(val)}</textarea>` : `<input class="input" id="ltf-${name}" data-ed="${name}" type="${o.type || "text"}" value="${esc(val)}" maxlength="${o.max || 120}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""}>`}${o.hint ? `<small class="muted">${o.hint}</small>` : ""}</div>`;
const addonBox = (a) => `<label class="lt-opt"><input type="checkbox" data-ed-addon="${esc(a.key)}" ${ED.addons.has(a.key) ? "checked" : ""} ${ED.mode === "edit" ? "disabled" : ""}><span><b>${esc(a.name)}</b> <em>${a.price_idr ? "+" + money(a.price_idr) : "Free"}</em><small class="muted">${esc(a.description || "")}</small></span></label>`;
const nav = (back, next, nextLabel = "Next") => `<div class="lt-nav">${back ? `<button type="button" class="btn ghost" data-ltact="go" data-v="${back}">Back</button>` : "<span></span>"}${next ? `<button type="button" class="btn" data-ltact="go" data-v="${next}">${nextLabel}</button>` : ""}</div>`;
const err = () => ED.err ? `<div class="notice" role="alert">${esc(ED.err)}</div>` : "";

function s2() {
  const c = ED.c, photos = c.photos, left = maxPhotos() - photos.length;
  const gal = DATA.addons.find((a) => a.key === "gallery"), mus = DATA.addons.find((a) => a.key === "music");
  return `<h2>Personalise</h2>${err()}
   <div class="lt-two">${fld("From (your name)", "from", c.from, { max: 60 })}${fld("To (their name)", "to", c.to, { max: 60 })}</div>
   ${fld("Title", "title", c.title, { max: 120 })}
   <div class="field"><label for="ltf-message">Your message <span class="req-star" aria-hidden="true">*</span></label><textarea class="input" id="ltf-message" data-ed="message" maxlength="4000" rows="9">${esc(c.message)}</textarea><small class="muted" id="ltcount">${c.message.length}/4000</small></div>
   <div class="lt-two">${fld("Special date (optional)", "date", c.date, { type: "date" })}<div class="field"><label for="ltf-lang">Letter language</label><select class="input" id="ltf-lang" data-ed="lang"><option value="id" ${c.lang === "id" ? "selected" : ""}>Bahasa Indonesia</option><option value="en" ${c.lang === "en" ? "selected" : ""}>English</option></select><small class="muted">Buttons and labels the recipient sees.</small></div></div>
   <fieldset class="lt-set"><legend>Photos <small class="muted">${photos.length}/${maxPhotos()}</small></legend>
    <div class="lt-photos">${photos.map((p, i) => `<div class="lt-ph"><img src="${esc(p.url)}" alt="Photo ${i + 1}"><input class="input" data-ed="photos.${i}.caption" value="${esc(p.caption)}" maxlength="80" placeholder="Caption (optional)" aria-label="Caption for photo ${i + 1}"><div class="lt-ph-act"><button type="button" class="btn ghost sm" data-ltact="phmove" data-v="${i}:-1" aria-label="Move photo ${i + 1} earlier" ${i ? "" : "disabled"}>←</button><button type="button" class="btn ghost sm" data-ltact="phmove" data-v="${i}:1" aria-label="Move photo ${i + 1} later" ${i < photos.length - 1 ? "" : "disabled"}>→</button><button type="button" class="btn ghost sm" data-ltact="phdel" data-v="${i}" aria-label="Remove photo ${i + 1}">Remove</button></div></div>`).join("")}</div>
    ${left > 0 ? `<label class="btn ghost sm lt-up">${ED.busy === "photo" ? "Uploading…" : "Add photos"}<input type="file" id="ltf-photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden ${ED.busy ? "disabled" : ""}></label>` : `<p class="muted">${ED.addons.has("gallery") ? "You reached the 12 photo limit." : "Free letters hold 3 photos."}</p>`}
    ${!ED.addons.has("gallery") && gal && ED.mode === "new" ? addonBox(gal) : ""}<small class="muted">Photos are resized on your device before upload.</small></fieldset>
   <fieldset class="lt-set"><legend>GIF stickers <small class="muted">${(c.gifs || []).length}/${maxGifs()}</small></legend>
    <div class="lt-photos">${(c.gifs || []).map((g, i) => `<div class="lt-ph"><img src="${esc(g.url)}" alt="GIF ${i + 1}"><select class="input" data-ed="gifs.${i}.place" aria-label="Where GIF ${i + 1} appears"><option value="both" ${g.place === "both" ? "selected" : ""}>Intro + letter</option><option value="intro" ${g.place === "intro" ? "selected" : ""}>Intro only</option><option value="letter" ${g.place === "letter" ? "selected" : ""}>Letter only</option></select><div class="lt-ph-act"><button type="button" class="btn ghost sm" data-ltact="gifdel" data-v="${i}" aria-label="Remove GIF ${i + 1}">Remove</button></div></div>`).join("")}</div>
    ${(c.gifs || []).length < maxGifs() ? `<label class="btn ghost sm lt-up">${ED.busy === "gif" ? "Uploading…" : "Upload GIF"}<input type="file" id="ltf-gifs" accept="image/gif,image/webp,image/png" multiple hidden ${ED.busy ? "disabled" : ""}></label>` : `<p class="muted">You reached the ${maxGifs()} GIF limit.</p>`}
    <small class="muted">Your own GIF / animated WebP, max 5 MB each. They play in the intro and under the letter.</small></fieldset>
   <fieldset class="lt-set"><legend>Background music <small class="muted">optional</small></legend>
    ${mus && ED.mode === "new" ? addonBox(mus) : ""}
    ${ED.addons.has("music") ? (c.music ? `<p class="lt-music">♪ ${esc(c.music.title || "Audio")} <button type="button" class="btn ghost sm" data-ltact="musicdel">Remove</button></p>` : `<label class="btn ghost sm lt-up">${ED.busy === "music" ? "Uploading…" : "Upload audio (MP3/M4A, max 5 MB)"}<input type="file" id="ltf-music" accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav" hidden ${ED.busy ? "disabled" : ""}></label>`) : ""}</fieldset>
   <fieldset class="lt-set"><legend>Colours</legend><div class="lt-colors">${COLS.map(([k, l]) => `<label class="lt-color"><input type="color" data-ed="theme.${k}" value="${esc(hex(c.theme[k], "#000000"))}"><span>${l}</span></label>`).join("")}</div></fieldset>
   <fieldset class="lt-set"><legend>Handwriting & font</legend><div class="chips">${Object.entries(FONTL).map(([k, l]) => `<button type="button" class="chip lt-font-${k}" data-ltact="font" data-v="${k}" aria-pressed="${c.font === k}">${l}</button>`).join("")}</div></fieldset>
   ${optDec().length ? `<fieldset class="lt-set"><legend>Decorations</legend><div class="chips">${optDec().filter((k) => DECL[k]).map((k) => `<label class="lt-chk"><input type="checkbox" data-ed-list="decor" value="${k}" ${c.decor.includes(k) ? "checked" : ""}> ${DECL[k]}</label>`).join("")}</div></fieldset>` : ""}
   ${nav(0, 3)}`;
}
function s3() {
  return `<h2>Set the interactions</h2><p class="muted">Switch effects on or off. Each template tells its own story, so some effects look different from one design to another.</p>${err()}
   <div class="lt-fxlist">${optFx().filter((k) => FXL[k]).map((k) => `<label class="lt-opt"><input type="checkbox" data-ed-list="effects" value="${k}" ${ED.c.effects.includes(k) ? "checked" : ""}><span><b>${FXL[k][0]}</b><small class="muted">${FXL[k][1]}</small></span></label>`).join("")}</div>
   ${nav(2, 4, "Preview it")}`;
}
function s4() {
  const miss = [!ED.c.message.trim() && "Write a message", !ED.c.to.trim() && "Add the recipient's name (optional but nicer)", !ED.c.from.trim() && "Add your name (optional but nicer)"].filter(Boolean);
  return `<h2>Live preview</h2><p class="muted">This is what your recipient will see. Tap, wait, and try everything. Use Replay to start again${matchMedia("(max-width:999px)").matches ? "." : ", or switch between Mobile and Desktop."}</p>
   ${miss.length ? `<ul class="lt-todo">${miss.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : `<p class="lt-ok">✓ Looks complete.</p>`}${err()}
   ${nav(3, 5, ED.mode === "edit" ? "Continue to save" : "Continue to publish")}`;
}
function s5() {
  if (ED.result) return resultView();
  const edit = ED.mode === "edit", p = price();
  const planHtml = edit ? "" : `<fieldset class="lt-set"><legend>How long should the link stay active?</legend><div class="lt-plans">${DATA.plans.map((pl) => `<label class="lt-plan"><input type="radio" name="ltplan" data-ed-plan value="${esc(pl.id)}" ${pl.id === ED.planId ? "checked" : ""}><span><b>${esc(pl.name)}</b><em>${+pl.price_idr ? money(pl.price_idr) : "Free"}</em><small class="muted">${esc(pl.description || "")}</small></span></label>`).join("")}</div></fieldset>`;
  return `<h2>${edit ? "Save changes" : "Publish"}</h2>${err()}${planHtml}
   ${edit ? "" : `<div class="lt-sum"><h3>Summary</h3><dl>${p.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${+v ? money(v) : "Free"}</dd></div>`).join("")}<div class="total"><dt>Total</dt><dd>${p.total ? money(p.total) : "Free"}</dd></div></dl>${p.total ? `<p class="muted">Paid letters are activated after the studio confirms your payment. You will get an order reference and instructions after you generate the link.</p>` : ""}</div>`}
   <div class="field"><label for="ltf-contact">${p.total && !edit ? "WhatsApp or email (needed to confirm payment)" : "WhatsApp or email (optional)"}</label><input class="input" id="ltf-contact" data-ed-x="contact" value="${esc(ED.contact)}" maxlength="120" autocomplete="email"></div>
   <div class="field"><label for="ltf-vis">Who can open the link?</label><select class="input" id="ltf-vis" data-ed-x="visibility"><option value="public" ${ED.visibility === "public" ? "selected" : ""}>Anyone with the link</option><option value="private" ${ED.visibility === "private" ? "selected" : ""}>Nobody (private for now)</option></select></div>
   <div class="lt-nav"><button type="button" class="btn ghost" data-ltact="go" data-v="4">Back</button><button type="button" class="btn" data-ltact="${edit ? "save" : "publish"}" ${ED.busy ? "disabled" : ""}>${ED.busy === "publish" ? "Working…" : edit ? "Save changes" : p.total ? "Generate link & order" : "Generate link"}</button></div>`;
}

/* ---------- result (step 5 after publishing) ---------- */
function resultView() {
  const r = ED.result, url = linkOf(r.public_id), ed = editLink(r.public_id, r.edit_token), paid = r.order_status === "free", ct = H.set("contact", {}) || {};
  const ways = [ct.whatsapp && `WhatsApp ${ct.whatsapp}`, ct.email && `email ${ct.email}`, ct.discord_url && "the studio Discord"].filter(Boolean).join(", ");
  return `<h2>${paid ? "Your letter is ready" : "Almost there"}</h2>
   ${paid ? `<div class="notice ok" role="status"><strong>The link is live.</strong> ${r.expires_at ? `It stays active until ${esc(fmtDate(r.expires_at))}.` : "It never expires."}</div>`
    : `<div class="notice" role="status"><strong>Order ${esc(r.order_ref)} — ${money(r.price_idr)} waiting for payment.</strong> The link below starts working once the studio confirms your payment. Send your reference and proof of payment${ways ? ` via ${esc(ways)}` : " to the studio"}. You can follow it any time under <a href="#/letters/mine">My letters</a>.</div>`}
   <div class="field"><label for="ltlink">Link to share</label><div class="lt-copy"><input class="input" id="ltlink" readonly value="${esc(url)}"><button type="button" class="btn" data-ltact="copy" data-v="${esc(url)}">Copy link</button></div></div>
   <div class="lt-share"><a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">Open letter</a>${navigator.share ? `<button type="button" class="btn ghost sm" data-ltact="share" data-v="${esc(url)}">Share…</button>` : ""}<a class="btn ghost sm" href="https://wa.me/?text=${encodeURIComponent(url)}" target="_blank" rel="noopener">WhatsApp</a></div>
   <div class="lt-qr" id="ltqr" aria-label="QR code for the link"><span class="muted">Making QR code…</span></div>
   <div class="lt-private"><h3>Your private edit link</h3><p class="muted">Only you should have this. It lets you change or delete the letter later. It is also saved in <a href="#/letters/mine">My letters</a> on this device.</p>
    <div class="lt-copy"><input class="input" readonly value="${esc(ed)}" aria-label="Private edit link"><button type="button" class="btn ghost" data-ltact="copy" data-v="${esc(ed)}">Copy</button></div></div>
   ${paid ? "" : `<p><button type="button" class="btn" data-ltact="paykt" data-id="${esc(r.public_id)}" data-tok="${esc(r.edit_token)}">Pay with KanasaToken</button> <span class="muted">Instant activation if your balance is enough. <a href="#/dompet">Top up</a></span></p>`}
   <div class="lt-nav"><a class="btn ghost" href="#/letters">Make another</a><a class="btn" href="#/letters/mine">My letters</a></div>`;
}
let qrP = null;
const loadQR = () => (window.qrcode ? Promise.resolve() : (qrP ||= new Promise((res, rej) => { const s = document.createElement("script"); s.src = new URL("js/vendor/qrcode.js", document.baseURI).href; s.onload = res; s.onerror = rej; document.head.append(s); })));
async function drawQR(url) {
  const box = $("#ltqr"); if (!box) return;
  try { await loadQR(); const q = window.qrcode(0, "M"); q.addData(url); q.make(); const svg = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    box.innerHTML = `<div class="lt-qr-img">${svg}</div><a class="btn ghost sm" download="letter-qr.svg" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">Download QR</a>`; box.querySelector("svg").setAttribute("role", "img"); box.querySelector("svg").setAttribute("aria-label", "QR code"); }
  catch { box.innerHTML = `<span class="muted">The QR code could not be made. Copy the link instead.</span>`; }
}

/* ---------- actions ---------- */
function validate() {
  const c = ED.c; if (!c.message.trim()) return "Write a message first.";
  if (c.photos.length > maxPhotos()) return `You can add up to ${maxPhotos()} photos.`; return "";
}
async function publish() {
  if ((ED.err = validate())) { ED.step = 2; renderStep(); return; }
  const p = price(); if (p.total && !ED.contact.trim()) { ED.err = "Add a WhatsApp number or email so we can confirm your payment."; renderStep(); return; }
  ED.err = ""; ED.busy = "publish"; renderStep();
  const { data, error } = await sb.rpc("letter_create", { p_template: ED.tpl.slug, p_content: ED.c, p_plan: ED.planId, p_addons: [...ED.addons], p_contact: ED.contact.trim() || null, p_visibility: ED.visibility });
  ED.busy = "";
  if (error || !data) { ED.err = navigator.onLine ? (error?.message || "Could not create the letter. Please try again.") : "You are offline. Reconnect and try again — your letter is saved on this device."; return renderStep(); }
  ED.result = data; store.set("kns_ltname", ED.c.from); if (ED.contact.trim()) store.set("kns_ltcontact", ED.contact.trim());
  store.remove?.("kns_ltdraft_" + ED.tpl.slug); try { localStorage.removeItem("kns_ltdraft_" + ED.tpl.slug); } catch { /* ignore */ }
  saveMine([{ id: data.public_id, token: data.edit_token, tpl: ED.tpl.name, title: ED.c.title, to: ED.c.to, ref: data.order_ref, at: new Date().toISOString() }, ...mine().filter((x) => x.id !== data.public_id)]);
  renderStep(); drawQR(linkOf(data.public_id)); toast(data.order_status === "free" ? "Your letter is live." : "Order created.", "ok");
}
async function saveEdit() {
  if ((ED.err = validate())) { ED.step = 2; renderStep(); return; }
  ED.busy = "publish"; renderStep();
  const { error } = await sb.rpc("letter_update", { p_id: ED.id, p_token: ED.token, p_content: ED.c, p_visibility: ED.visibility, p_contact: ED.contact.trim() || null });
  ED.busy = ""; if (error) { ED.err = error.message; return renderStep(); }
  toast("Changes saved.", "ok"); location.hash = "#/letters/mine";
}
async function compress(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((r) => cv.toBlob(r, "image/jpeg", .82));
}
async function upload(blob, ext, type) {
  const name = `${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.${ext}`, path = `u/${ownKey()}/${name}`;
  const { error } = await sb.storage.from("letter-media").upload(path, blob, { contentType: type, upsert: false });
  if (error) throw error; return sb.storage.from("letter-media").getPublicUrl(path).data.publicUrl;
}
async function addPhotos(files) {
  ED.busy = "photo"; renderStep();
  try {
    for (const f of files) {
      if (ED.c.photos.length >= maxPhotos()) { toast(`Up to ${maxPhotos()} photos.`); break; }
      if (!/^image\//.test(f.type)) { toast(`"${f.name}" is not an image.`); continue; }
      try { const b = await compress(f); if (!b || b.size > 5.5 * 1048576) { toast(`"${f.name}" is too large.`); continue; } ED.c.photos.push({ url: await upload(b, "jpg", "image/jpeg"), caption: "" }); }
      catch (e) { toast(e?.message && !/createImageBitmap|decode/i.test(e.message) ? e.message : `"${f.name}" could not be read. Try a JPG or PNG.`); }
    }
  } finally { ED.busy = ""; changed(true); }
}
async function addGifs(files) {
  ED.c.gifs = ED.c.gifs || []; ED.busy = "gif"; renderStep();
  try {
    for (const f of files) {
      if (ED.c.gifs.length >= maxGifs()) { toast(`Up to ${maxGifs()} GIFs.`); break; }
      const ext = { "image/gif": "gif", "image/webp": "webp", "image/png": "png" }[f.type]; if (!ext) { toast(`"${f.name}" is not a GIF.`); continue; }
      if (f.size > 5 * 1048576) { toast(`"${f.name}" is larger than 5 MB.`); continue; }
      try { ED.c.gifs.push({ url: await upload(f, ext, f.type), place: "both" }); } catch (e) { toast(e?.message || "Upload failed."); }
    }
  } finally { ED.busy = ""; changed(true); }
}
async function addMusic(f) {
  if (!f) return; if (f.size > 5 * 1048576) return toast("Audio must be 5 MB or smaller.");
  const ext = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav" }[f.type]; if (!ext) return toast("Use an MP3, M4A, OGG or WAV file.");
  ED.busy = "music"; renderStep();
  try { ED.c.music = { url: await upload(f, ext, f.type), title: f.name.replace(/\.[^.]+$/, "").slice(0, 60) }; } catch (e) { toast(e.message || "Upload failed."); }
  ED.busy = ""; changed(true);
}
function go(n) {
  n = +n; if (n > 2 && ED.step === 2 && !ED.c.message.trim()) { ED.err = "Write a message first."; return renderStep(); }
  ED.err = ""; ED.step = Math.max(2, Math.min(5, n)); renderStep(); PV?.send(ED.step === 2); scrollTo({ top: $("#lted")?.offsetTop ?? 0 }); $("#ltform")?.focus({ preventScroll: true });
}

/* ---------- events ---------- */
async function onClick(e) {
  const b = e.target.closest("[data-ltact]"); if (!b) return; const a = b.dataset.ltact, v = b.dataset.v;
  if (a === "fcat" || a === "ftag" || a === "fprice") { F[{ fcat: "cat", ftag: "tag", fprice: "price" }[a]] = v; $("#ltfilters").innerHTML = filters(); $("#ltgrid").innerHTML = grid(); return; }
  if (a === "preview") return openPreview(b.dataset.slug);
  if (a === "livepreview") return openModal(ED.tpl?.name || "Your letter", letterOf, `<button type="button" class="btn" data-ltact="closemodal">Back to editing</button>`);
  if (a === "closemodal") return closeModal();
  if (a === "replay") return (MODAL ? MODAL.pv : PV)?.send(MODAL ? false : ED?.step === 2);
  if (a === "mode") { const host = b.closest(".lt-modal, .lt-ed-prev"); $(".lt-frame", host).dataset.mode = v; $$("[data-ltact=mode]", host).forEach((x) => x.setAttribute("aria-pressed", x === b)); if (host.classList.contains("lt-ed-prev")) $("#lted").dataset.wide = v === "desktop" ? "1" : ""; return; }
  if (a === "copy") { try { await navigator.clipboard.writeText(v); toast("Copied.", "ok"); } catch { toast("Select the link and copy it manually."); } return; }
  if (a === "share") { try { await navigator.share({ title: "A gift for you", text: "I made something for you.", url: v }); } catch { /* cancelled */ } return; }
  if (a === "paykt") return payKT(b);
  if (a === "mdel" || a === "mvis") return mineAction(a, b);
  if (!ED) return;
  if (a === "go") return go(v);
  if (a === "font") { ED.c.font = v; return changed(true); }
  if (a === "phdel") { ED.c.photos.splice(+v, 1); return changed(true); }
  if (a === "phmove") { const [i, d] = v.split(":").map(Number), p = ED.c.photos; if (p[i + d]) { [p[i], p[i + d]] = [p[i + d], p[i]]; changed(true); } return; }
  if (a === "gifdel") { ED.c.gifs.splice(+v, 1); return changed(true); }
  if (a === "musicdel") { ED.c.music = null; return changed(true); }
  if (a === "publish") return publish();
  if (a === "save") return saveEdit();
}
function onInput(e) {
  const t = e.target; if (!ED || !t.closest?.("#lted")) return;
  if (t.id === "ltf-photos" && e.type === "change") { const fs = [...t.files]; t.value = ""; return addPhotos(fs); }
  if (t.id === "ltf-gifs" && e.type === "change") { const fs = [...t.files]; t.value = ""; return addGifs(fs); }
  if (t.id === "ltf-music" && e.type === "change") { const f = t.files[0]; t.value = ""; return addMusic(f); }
  if (t.dataset.ed) { let v = t.value; setPath(ED.c, t.dataset.ed, v); if (t.dataset.ed === "message") { const n = $("#ltcount"); if (n) n.textContent = `${v.length}/4000`; } return changed(e.type === "change" && t.dataset.ed === "lang"); }
  if (t.dataset.edList) { const arr = ED.c[t.dataset.edList], i = arr.indexOf(t.value); if (t.checked && i < 0) arr.push(t.value); if (!t.checked && i >= 0) arr.splice(i, 1); changed(false); if (ED.step === 3) PV?.send(false); return; }
  if (t.dataset.edAddon) { t.checked ? ED.addons.add(t.dataset.edAddon) : ED.addons.delete(t.dataset.edAddon); if (!ED.addons.has("music")) ED.c.music = null; return changed(true); }
  if (t.dataset.edPlan !== undefined) { ED.planId = t.value; changed(true); return; }
  if (t.dataset.edX) { ED[t.dataset.edX] = t.value; if (ED.mode === "new" && t.dataset.edX === "contact") return; }
}

/* ---------- editor views ---------- */
async function editorView(slug) {
  await loadData(); const t = DATA.tpls.find((x) => x.slug === slug);
  if (!t) return `<div class="container page"><h1>Template not found</h1><p class="muted"><a href="#/letters">Browse templates</a></p></div>`;
  H.setMeta(t.name + " — Digital Letter");
  if (!ED || ED.mode !== "new" || ED.tpl.slug !== slug) ED = newState(t);
  if (ED.result) ED = newState(t);
  return shell();
}
async function editView(id, q) {
  await loadData(); let list = mine(), me = list.find((x) => x.id === id), tok = q.k || me?.token;
  if (q.k) { if (!me) { list = [{ id, token: q.k, tpl: "", title: "", to: "", at: new Date().toISOString() }, ...list]; saveMine(list); } else if (me.token !== q.k) { me.token = q.k; saveMine(list); } history.replaceState(null, "", `#/letters/edit/${id}`); }
  const { data } = tok ? await sb.rpc("letter_get_edit", { p_id: id, p_token: tok }) : { data: null };
  if (!data) return `<div class="container page"><h1>You can't edit this letter</h1><p class="muted">The private edit link is missing or wrong, or the letter was deleted. Open the edit link you received after publishing.</p><p><a class="btn ghost" href="#/letters/mine">My letters</a></p></div>`;
  H.setMeta("Edit letter");
  const t = DATA.tpls.find((x) => x.slug === data.template_slug) || null;
  ED = { mode: "edit", id, token: tok, tpl: t, engine: data.engine, step: 2, addons: new Set(data.addons || []), planId: null, visibility: data.visibility, contact: data.contact || "", busy: "", result: null, c: normalizeC(data.content, t) };
  return shell();
}
function normalizeC(c, t) {
  const d = t?.defaults?.theme || {};
  return { from: c.from || "", to: c.to || "", title: c.title || "", message: c.message || "", date: c.date || "", lang: c.lang || "id", font: c.font || "serif",
    theme: { primary: hex(c.theme?.primary, hex(d.primary, "#8b1e3f")), accent: hex(c.theme?.accent, hex(d.accent, "#e8b4b8")), bg: hex(c.theme?.bg, hex(d.bg, "#1a0d12")), paper: hex(c.theme?.paper, hex(d.paper, "#fbf3ea")) },
    effects: c.effects || [], decor: c.decor || [], photos: c.photos || [], gifs: c.gifs || [], skin: c.skin || "", music: c.music || null };
}

/* ---------- my letters ---------- */
async function mineView() {
  H.setMeta("My letters", "Letters you made on this device.");
  const list = mine();
  return `<div class="container page"><a class="back-link" href="#/letters">← Templates</a><h1>My letters</h1><p class="muted">Letters made on this device. Each keeps a private edit key here, so clearing your browser data removes access. Save your private edit links from the publish step if you want a backup.</p>
   <div id="ltmine">${list.length ? list.map((x) => `<article class="lt-mine" data-id="${esc(x.id)}"><div><strong>${esc(x.title || x.tpl || "Letter")}</strong><span class="muted"> ${x.to ? "for " + esc(x.to) : ""}</span><div class="muted lt-mine-s" data-s>Checking…</div></div><div class="lt-mine-a"></div></article>`).join("") : `<div class="empty"><strong>No letters yet</strong>Letters you make on this device show up here.<p><a class="btn" href="#/letters">Choose a template</a></p></div>`}</div></div>`;
}
const ORD = { free: "Free · active", paid: "Paid · active", pending_payment: "Waiting for payment", cancelled: "Cancelled" };
async function fillMine() {
  for (const row of $$("#ltmine .lt-mine")) {
    const id = row.dataset.id, me = mine().find((x) => x.id === id); if (!me) continue;
    const { data, error } = await sb.rpc("letter_get_edit", { p_id: id, p_token: me.token }); const s = $("[data-s]", row), a = $(".lt-mine-a", row);
    if (error) { s.textContent = navigator.onLine ? "Could not load status." : "Offline — status unavailable."; continue; }
    if (!data) { s.textContent = "This letter no longer exists."; a.innerHTML = `<button type="button" class="btn ghost sm" data-ltact="mdel" data-id="${esc(id)}" data-gone="1">Remove from list</button>`; continue; }
    const exp = data.expires_at ? new Date(data.expires_at) : null, expired = exp && exp < new Date();
    s.textContent = `${expired ? "Expired" : ORD[data.order_status] || data.order_status}${data.order_ref && data.order_status === "pending_payment" ? ` (${data.order_ref}, ${money(data.price_idr)})` : ""} · ${data.visibility === "public" ? "Public link" : "Private"} · ${data.views} view${data.views === 1 ? "" : "s"}${exp && !expired ? ` · until ${fmtDate(exp)}` : ""}`;
    const url = linkOf(id), kt = data.order_status === "pending_payment" && data.price_idr > 0 ? `<button type="button" class="btn sm" data-ltact="paykt" data-id="${esc(id)}" data-tok="${esc(me.token)}">Pay with KanasaToken</button>` : "";
    a.innerHTML = kt + `<a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">Open</a><button type="button" class="btn ghost sm" data-ltact="copy" data-v="${esc(url)}">Copy link</button><a class="btn ghost sm" href="#/letters/edit/${esc(id)}">Edit</a><button type="button" class="btn ghost sm" data-ltact="mvis" data-id="${esc(id)}" data-vis="${data.visibility}">${data.visibility === "public" ? "Make private" : "Make public"}</button><button type="button" class="btn ghost sm" data-ltact="mdel" data-id="${esc(id)}" data-name="${esc(data.content?.title || "this letter")}">Delete</button>`;
  }
}
async function payKT(b) {
  if (!confirm("Pay this letter with your KanasaToken balance?")) return;
  b.disabled = true; const { error } = await sb.rpc("letter_pay_tokens", { p_id: b.dataset.id, p_token: b.dataset.tok });
  if (error) { b.disabled = false; if (/Masuk ke akun/i.test(error.message)) { toast("Sign in first to pay with KanasaToken."); location.hash = "#/akun?next=letters/mine"; return; } return toast(error.message.replace(/^Saldo KanasaToken kurang/, "Not enough KanasaToken")); }
  toast("Paid with KanasaToken. Your letter is now live!", "ok"); b.textContent = "Paid ✓"; if (location.hash.includes("/mine")) route2();
}
async function mineAction(a, b) {
  const id = b.dataset.id, me = mine().find((x) => x.id === id);
  if (a === "mdel") {
    if (b.dataset.gone) { saveMine(mine().filter((x) => x.id !== id)); return route2(); }
    if (!confirm(`Delete "${b.dataset.name}"? Its link will stop working and this cannot be undone.`)) return;
    const { error } = await sb.rpc("letter_delete", { p_id: id, p_token: me.token }); if (error) return toast(error.message);
    saveMine(mine().filter((x) => x.id !== id)); toast("Letter deleted.", "ok"); return route2();
  }
  const next = b.dataset.vis === "public" ? "private" : "public";
  const { error } = await sb.rpc("letter_update", { p_id: id, p_token: me.token, p_content: null, p_visibility: next }); if (error) return toast(error.message);
  toast(next === "public" ? "The link is open again." : "The link is now private.", "ok"); fillMine();
}
const route2 = () => dispatchEvent(new HashChangeEvent("hashchange"));

/* ---------- entry points used by app.js ---------- */
export async function viewLetters(parts, q) {
  PV?.destroy(); PV = null;
  if (!parts[0]) return catalog();
  if (parts[0] === "new" && parts[1]) return editorView(parts[1]);
  if (parts[0] === "edit" && parts[1]) return editView(parts[1], q);
  if (parts[0] === "mine") return mineView();
  return null;
}
export function wireLetters(parts) {
  if (parts[0] === "mine") return fillMine();
  if ((parts[0] === "new" || parts[0] === "edit") && ED && $("#ltform")) {
    renderStep();
    if (ED.result) drawQR(linkOf(ED.result.public_id));
    PV = mountPreview($("#ltframe"), letterOf); PV.send(ED.step === 2);
  }
}
/* Homepage teaser */
export async function lettersStrip() {
  const { cats, tpls } = await loadData(); if (!tpls.length) return "";
  const use = tpls.filter((t) => t.is_featured).slice(0, 4), list = use.length ? use : tpls.slice(0, 4);
  return `<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">Digital Letters</span><h2>Send a gift that opens</h2><a class="btn ghost sm" href="#/letters">Browse templates</a></div>
    <div class="lt-grid lt-grid-sm">${list.map((t) => card(t, cats)).join("")}</div></div></section>`;
}
