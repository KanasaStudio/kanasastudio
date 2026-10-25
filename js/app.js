import { sb } from "./db.js";
import { esc, safeUrl, $, $$, money, range, fmtDate, paragraphs, store, toast, uid, STATUS } from "./util.js";
import { applyTheme } from "./theme.js";
import { getRate } from "./fx.js";
import * as cart from "./cart.js";
import { initSfx, play as sfx } from "./sfx.js";

const S = {
  settings: {}, services: null, projects: null,
  order: { step: 1, client: { name: "", email: "", discord: "" }, budget: "", deadline: "", brief: "", files: [], key: uid(), errors: {}, busy: false, progress: 0, done: null, error: "" },
  track: { data: null, ref: "", token: "", error: "", loading: false },
  filter: { cat: "all", q: "" },
};
const app = $("#app");
const set = (k, d = {}) => S.settings[k] ?? d;
const cur = () => set("order").currency || "IDR";

/* ---------- display currency (live USD conversion, display only) ---------- */
S.fx = { rate: null, at: null, mode: store.get("kns_cur", "IDR") };
const usdOn = () => S.fx.mode === "USD" && S.fx.rate && cur() === "IDR" && !set("order").fx_disabled;
const m0 = (n) => usdOn() ? money(+n / S.fx.rate, "USD") : money(n, cur());
const M = (n) => (n == null || n === "") ? "—" : (usdOn() ? "≈ " : "") + m0(n);
const R = (min, max) => min == null ? "Quotation" : (usdOn() ? "≈ " : "") + ((max != null && +max !== +min) ? `${m0(min)} – ${m0(max)}` : m0(min));
const fxNote = () => usdOn() ? `USD amounts are approximate (1 USD = Rp${Math.round(S.fx.rate).toLocaleString("id-ID")}, updated ${new Date(S.fx.at).toLocaleString()}). Orders and quotations are in IDR.` : "";

/* ---------- data ---------- */
async function loadSettings() {
  const { data, error } = await sb.from("site_settings").select("key,value");
  if (error) throw error;
  S.settings = Object.fromEntries(data.map((r) => [r.key, r.value]));
}
async function loadServices(force) {
  if (S.services && !force) return S.services;
  const { data, error } = await sb.from("services").select("*, service_tiers(*), service_addons(*)").eq("publish_state", "published").order("sort_order");
  if (error) throw error;
  for (const s of data) { s.service_tiers.sort((a, b) => a.sort_order - b.sort_order); s.service_addons.sort((a, b) => a.sort_order - b.sort_order); }
  return (S.services = data);
}
async function loadProjects(force) {
  if (S.projects && !force) return S.projects;
  const { data, error } = await sb.from("portfolio_projects").select("*, portfolio_media(*)").eq("status", "published").order("sort_order");
  if (error) throw error;
  for (const p of data) p.portfolio_media.sort((a, b) => a.sort_order - b.sort_order);
  return (S.projects = data);
}

/* ---------- chrome ---------- */
function renderChrome() {
  const b = set("brand"), nav = set("nav", []), f = set("footer"), soc = set("socials", []);
  $("#brand").innerHTML = `<img src="${esc(safeUrl(b.logo_url))}" alt="" width="30" height="30"><span>${esc(b.name || "Studio")}${b.partner ? ` <small>× ${esc(b.partner)}</small>` : ""}</span>`;
  $("#nav").innerHTML = (Array.isArray(nav) ? nav : []).map((n) => `<a href="${esc(safeUrl(n.href))}">${esc(n.label)}</a>`).join("");
  const lg = set("legal", {});
  $("#footer-links").innerHTML = Object.entries(lg).map(([k, l]) => `<li><a href="#/legal/${esc(k)}">${esc(l.title)}</a></li>`).join("") + soc.map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a></li>`).join("");
  $("#footer-text").textContent = f.text || "";
  const ico = safeUrl(b.favicon_url); if (ico) $("#favicon").href = ico;
  applyTheme(set("theme"));
  initSfx(set("sfx"));
}
function setMeta(title, desc) {
  const seo = set("seo"), name = set("brand").name || "";
  document.title = title ? `${title} — ${name}` : seo.title || name;
  $('meta[name="description"]').content = desc || seo.description || "";
  $('meta[property="og:title"]').content = document.title;
  $('meta[property="og:description"]').content = desc || seo.description || "";
  const og = safeUrl(seo.og_image); if (og) $('meta[property="og:image"]').content = new URL(og, location.href).href;
}
const skeleton = (n = 3) => `<div class="container page" aria-busy="true">${Array.from({ length: n }, () => `<div class="skeleton" style="height:5rem;margin-bottom:1rem"></div>`).join("")}</div>`;
const fail = (e) => `<div class="container page"><div class="notice"><strong>Something went wrong.</strong><br>${esc(e?.message || "Could not load data.")} <button class="linkbtn" data-act="reload">Try again</button></div></div>`;

/* ---------- helpers ---------- */
const shareBtn = (kind, slug) => `<button type="button" class="linkbtn" style="float:right" data-act="copy" data-v="${esc(new URL(`share/${kind}/${slug}/`, location.href.split("#")[0]).href)}">Copy share link</button>`;
function svcPrice(s) {
  if (s.custom_quote) return { text: "Quotation", sub: "custom" };
  const mins = [s.price_min, ...s.service_tiers.map((t) => t.price_min)].filter((v) => v != null).map(Number);
  const maxs = [s.price_max, s.price_min, ...s.service_tiers.map((t) => t.price_max ?? t.price_min)].filter((v) => v != null).map(Number);
  if (!mins.length) return { text: "Quotation", sub: "" };
  const lo = Math.min(...mins), hi = Math.max(...maxs);
  return { text: lo === hi ? M(lo, cur()) : `${M(lo, cur())} – ${M(hi, cur())}`, sub: "from DB" };
}
const statusPill = (s) => s.status === "available" ? "" : `<span class="tag">${s.status === "coming_soon" ? "Coming soon" : "Unavailable"}</span>`;
function svcRow(s, i) {
  const p = svcPrice(s);
  return `<a class="svc-row reveal" href="#/services/${esc(s.slug)}">
    <span class="n">${String(i + 1).padStart(2, "0")}</span>
    <div><h3>${esc(s.name)}</h3><span class="eyebrow">${esc(s.category)}</span> ${statusPill(s)}</div>
    <p class="muted">${esc(s.summary || "")}</p>
    <div class="price">${esc(p.text)}</div></a>`;
}
function workCard(p) {
  const img = safeUrl(p.cover_url);
  return `<a class="work reveal" href="#/portfolio/${esc(p.slug)}">
    <div class="thumb">${img ? `<img src="${esc(img)}" alt="${esc(p.cover_alt || p.title)}" loading="lazy" decoding="async">` : ""}</div>
    <div class="meta"><span>${esc(p.title)}</span><span>${esc(p.category)}${p.badge ? ` · ${esc(p.badge)}` : ""}</span></div></a>`;
}
const emptyBox = (t, d) => `<div class="empty"><strong>${esc(t)}</strong>${esc(d)}</div>`;

/* ---------- home sections ---------- */
const SECTIONS = {
  hero() {
    const h = set("hero"), url = safeUrl(h.media_url || h.artwork_url), poster = safeUrl(h.poster_url), alt = h.media_alt || h.artwork_alt || "";
    const title = `<h1 class="sr-only">${esc(h.headline || set("brand").name || "")}</h1>`;
    if (!url) return `<section class="hero-full" aria-label="Intro">${title}<div class="hero-empty">Add a hero image or video in Admin → Site editor → Hero.</div></section>`;
    const focus = ["center", "top", "bottom", "left", "right"].includes(h.focus) ? h.focus : "center";
    const isVideo = h.media_type === "video" || (!h.media_type && /\.(mp4|webm)(\?|$)/i.test(url)), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const media = isVideo
      ? `<video class="hero-media" style="object-position:${focus}" src="${esc(url)}" ${poster ? `poster="${esc(poster)}"` : ""} ${still ? "" : "autoplay"} muted loop playsinline disablepictureinpicture preload="auto" aria-label="${esc(alt)}"></video>`
      : `<img class="hero-media" style="object-position:${focus}" src="${esc(url)}" alt="${esc(alt)}" fetchpriority="high" decoding="async">`;
    return `<section class="hero-full" aria-label="Intro">${title}${media}</section>`;
  },
  async services(l) {
    const all = await loadServices(), list = all.filter((s) => s.is_featured).slice(0, 6), use = list.length ? list : all.slice(0, 6);
    return `<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">Services</span><h2>What you can commission</h2><a class="btn ghost sm" href="#/services">All services</a></div>
      ${use.length ? `<div>${use.map(svcRow).join("")}</div>` : emptyBox("No services yet", "Services published from the admin panel appear here.")}</div></section>`;
  },
  async pricing() {
    const pr = set("pricing"), a = safeUrl(pr.price_image_url), b = safeUrl(pr.illustration_image_url);
    return `<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">Pricing</span><h2>Price list & service illustration</h2><a class="btn ghost sm" href="#/pricing">See all prices</a></div>
      <div class="two">${a ? `<a class="poster reveal" href="#/pricing"><img src="${esc(a)}" alt="${esc(pr.price_image_alt || "Price list")}" loading="lazy" decoding="async"></a>` : ""}${b ? `<a class="poster reveal" href="#/pricing"><img src="${esc(b)}" alt="${esc(pr.illustration_alt || "Service illustration")}" loading="lazy" decoding="async"></a>` : ""}</div></div></section>`;
  },
  async portfolio() {
    const all = await loadProjects(), f = all.filter((p) => p.is_featured), use = (f.length ? f : all).slice(0, 5);
    return `<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">Portfolio</span><h2>Selected work</h2><a class="btn ghost sm" href="#/portfolio">View portfolio</a></div>
      ${use.length ? `<div class="grid">${use.map(workCard).join("")}</div>` : emptyBox("Portfolio coming soon", "Final artwork is being prepared. Published projects will appear here.")}</div></section>`;
  },
  async store() {
    const { cats, products } = await loadStore(), f = products.filter((p) => p.is_featured), use = (f.length ? f : products).slice(0, 6);
    return `<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">Store</span><h2>Digital products</h2><a class="btn ghost sm" href="#/store">Browse store</a></div>
      ${use.length ? `<div class="pgrid">${use.map((p) => prodCard(p, cats)).join("")}</div>` : emptyBox("The store is opening soon", "Published products will appear here.")}</div></section>`;
  },
  testimonials() {
    const t = (set("testimonials", []) || []).filter((x) => x.quote);
    if (!t.length) return "";
    return `<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">Clients</span><h2>What clients say</h2><span></span></div>
      <div class="quotes">${t.map((x) => `<figure class="quote reveal"><blockquote>${esc(x.quote)}</blockquote><figcaption><strong>${esc(x.name || "")}</strong>${x.role ? ` <span class="muted">${esc(x.role)}</span>` : ""}</figcaption></figure>`).join("")}</div></div></section>`;
  },
  workflow() {
    const w = set("workflow", []);
    return `<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">Workflow</span><h2>How a commission works</h2><span></span></div>
      <ol class="steps">${w.map((s) => `<li class="reveal"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join("")}</ol></div></section>`;
  },
  availability() {
    const a = set("availability"), label = { open: "Commissions open", limited: "Limited slots", closed: "Commissions closed" }[a.status] || "";
    return `<section class="section"><div class="container"><div class="avail"><span class="dot ${esc(a.status)}"></span><div><strong>${esc(label)}</strong>${a.note ? `<div class="muted">${esc(a.note)}</div>` : ""}</div></div></div></section>`;
  },
  faq() {
    const q = set("faq", []); if (!q.length) return "";
    return `<section class="section"><div class="container two"><div><span class="eyebrow">FAQ</span><h2 style="margin-top:1rem">Questions</h2></div><div>${q.map((x) => `<details class="faq"><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("")}</div></div></section>`;
  },
  contact() { return contactBlock(); },
};
function contactBlock() {
  const c = set("contact"), soc = set("socials", []);
  return `<section class="section" id="contact"><div class="container two"><div><span class="eyebrow">Contact</span><h2 style="margin:1rem 0">Talk to the studio</h2><p class="muted">Prefer to discuss first? Reach us directly, or <a href="#/order">start a commission</a>.</p></div>
    <ul>${c.email ? `<li class="svc-row" style="grid-template-columns:7rem 1fr"><span class="eyebrow">Email</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : ""}
    ${c.discord_url ? `<li class="svc-row" style="grid-template-columns:7rem 1fr"><span class="eyebrow">Discord</span><a href="${esc(safeUrl(c.discord_url))}" target="_blank" rel="noopener noreferrer">Join server</a></li>` : ""}
    ${c.whatsapp ? `<li class="svc-row" style="grid-template-columns:7rem 1fr"><span class="eyebrow">WhatsApp</span><span>${esc(c.whatsapp)}</span></li>` : ""}
    ${c.hours ? `<li class="svc-row" style="grid-template-columns:7rem 1fr"><span class="eyebrow">Hours</span><span>${esc(c.hours)}</span></li>` : ""}
    ${c.location ? `<li class="svc-row" style="grid-template-columns:7rem 1fr"><span class="eyebrow">Location</span><span>${esc(c.location)}</span></li>` : ""}
    <li class="svc-row" style="grid-template-columns:7rem 1fr"><span class="eyebrow">Social</span><span>${soc.map((s) => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join(" · ")}</span></li></ul></div></section>`;
}

/* ---------- views ---------- */
async function viewHome() {
  setMeta("");
  const parts = [];
  for (const sec of set("sections", [])) if (sec.visible && SECTIONS[sec.id]) parts.push(await SECTIONS[sec.id](sec.layout));
  return parts.join("");
}
async function viewServices() {
  setMeta("Services", "Browse commission services.");
  const all = await loadServices();
  return `<div class="container page"><div class="page-head"><span class="eyebrow">Services</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">Services & pricing</h1><p>Prices come from the studio's live price list. Custom work is handled by quotation.</p></div>
    ${all.length ? all.map(svcRow).join("") : emptyBox("No services published", "Check back soon.")}</div>`;
}
async function viewService(slug) {
  const all = await loadServices(), s = all.find((x) => x.slug === slug);
  if (!s) return notFound();
  setMeta(s.name, s.summary);
  const list = (t, a) => a?.length ? `<h3 style="margin:2rem 0 .8rem;font-size:1.1rem">${t}</h3><ul class="dots">${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const canOrder = s.status === "available", tiers = s.service_tiers.filter((t) => t.is_active);
  return `<div class="container page">${shareBtn("services", s.slug)}<a class="eyebrow" href="#/services">← Services</a>
    <div class="detail" style="margin-top:2rem"><div>
      <span class="eyebrow">${esc(s.category)}</span> ${statusPill(s)}<h1 style="font-size:var(--fs-h2);margin:1rem 0">${esc(s.name)}</h1>
      ${safeUrl(s.cover_url) ? `<img src="${esc(safeUrl(s.cover_url))}" alt="${esc(s.cover_alt || s.name)}" style="margin-bottom:1.5rem;border:1px solid var(--border)">` : ""}
      ${s.description ? paragraphs(s.description) : `<p class="muted">${esc(s.summary || "")}</p>`}
      ${list("Deliverables", s.deliverables)}${list("Included", s.includes)}${list("Not included", s.excludes)}
      ${s.turnaround ? `<p class="muted" style="margin-top:2rem">Estimated turnaround: ${esc(s.turnaround)}</p>` : ""}
      ${s.revisions_included != null ? `<p class="muted">Revisions included: ${esc(s.revisions_included)}</p>` : ""}</div>
    <aside><form id="addform" data-service="${esc(s.id)}"><div class="eyebrow">Configure</div>
      ${tiers.length ? `<div class="tier-pick" role="radiogroup" aria-label="Tier">${tiers.map((t, i) => `<label><span><input type="radio" name="tier" value="${esc(t.id)}" ${i === 0 ? "checked" : ""}>${esc(t.name)}</span><span class="mono">${esc(s.custom_quote ? "Quotation" : R(t.price_min, t.price_max ?? t.price_min, cur()))}</span></label>`).join("")}</div>` : ""}
      ${s.service_addons.filter((a) => a.is_active).length ? `<div class="label">Add-ons</div><div class="tier-pick">${s.service_addons.filter((a) => a.is_active).map((a) => `<label><span><input type="checkbox" name="addon" value="${esc(a.id)}">${esc(a.name)}</span><span class="mono">+${M(a.price, cur())}</span></label>`).join("")}</div>` : ""}
      <div class="field"><label for="qty">Quantity</label><input class="input" id="qty" name="qty" type="number" min="1" max="50" value="1"></div>
      <div class="summary" style="margin-bottom:1rem"><div class="line total"><span>Estimate</span><span id="est">—</span></div></div>
      <p class="muted" style="font-size:.8125rem">Estimates are indicative. The studio confirms the final price in a quotation.</p>
      <button class="btn" ${canOrder ? "" : "disabled"} type="submit">${canOrder ? "Add to order" : "Not available"}</button></form></aside></div></div>`;
}
function wireService() {
  const f = $("#addform"); if (!f) return;
  const s = S.services.find((x) => x.id === f.dataset.service);
  const line = () => ({ service_id: s.id, tier_id: f.tier?.value || null, addon_ids: $$('input[name="addon"]:checked', f).map((i) => i.value), quantity: Math.max(1, Math.min(50, +f.qty.value || 1)) });
  const upd = () => { const e = cart.estimate([line()], S.services); $("#est").textContent = e.quote ? "Quotation" : R(e.min, e.max, cur()); };
  f.addEventListener("input", upd); upd();
  f.addEventListener("submit", (ev) => { ev.preventDefault(); cart.add(line()); toast("Added to your order.", "ok"); openDrawer(); });
}
const tierPrice = (t) => t.price_min == null ? "Quotation" : R(t.price_min, t.price_max ?? t.price_min, cur());
async function viewPricing() {
  setMeta("Pricing", "Price list and service illustration.");
  const all = await loadServices(), pr = set("pricing"), notes = set("pricing_notes", []);
  const live = all.filter((x) => x.status !== "coming_soon"), soon = all.filter((x) => x.status === "coming_soon");
  const a = safeUrl(pr.price_image_url), b = safeUrl(pr.illustration_image_url);
  const fig = (u, alt) => u ? `<a class="poster" href="${esc(u)}" target="_blank" rel="noopener" title="Open full size"><img src="${esc(u)}" alt="${esc(alt)}" loading="lazy" decoding="async"></a>` : "";
  return `<div class="container page"><div class="page-head"><span class="eyebrow">Pricing</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">Price list</h1><p>Prices in ${esc(usdOn() ? "USD (converted live)" : cur())}. This table is the current price list; final price depends on complexity, details, revisions and deadline.</p></div>
    ${live.length ? live.map((s, i) => `<div class="prow reveal"><span class="n mono muted">${String(i + 1).padStart(2, "0")}</span>
      <div><h3><a href="#/services/${esc(s.slug)}" style="text-decoration:none">${esc(s.name)}</a></h3><p class="muted" style="margin:.4rem 0 0;font-size:.9375rem">${esc(s.summary || "")}</p></div>
      <ul class="tiers">${s.service_tiers.filter((t) => t.is_active).map((t) => `<li><span>${esc(t.name)}${t.description ? `<small class="muted">${esc(t.description)}</small>` : ""}</span><span class="mono">${esc(tierPrice(t))}</span></li>`).join("") || `<li><span>${esc(svcPrice(s).text)}</span></li>`}</ul></div>`).join("") : emptyBox("No services published", "Check back soon.")}
    ${notes.length ? `<div class="notice" style="margin-top:2rem"><strong>Price notes</strong><ul style="margin-top:.5rem">${notes.map((n) => `<li>• ${esc(n.text)}</li>`).join("")}</ul></div>` : ""}
    ${soon.length ? `<h2 style="font-size:1.25rem;margin:3rem 0 1rem">Coming soon</h2><div>${soon.map((s) => `<div class="svc-row" style="grid-template-columns:1fr 2fr"><strong>${esc(s.name)} <span class="tag">Coming soon</span></strong><span class="muted">${esc(s.summary || "")}</span></div>`).join("")}</div>` : ""}
    <p style="margin-top:2rem"><a class="btn" href="#/services">Choose a service</a></p>
    <h2 style="font-size:1.25rem;margin:4rem 0 .5rem">Price list poster &amp; service illustration</h2><p class="muted" style="margin-bottom:1.5rem">Reference images (tap to open full size). If a price differs from the poster, the table above is the current one.</p>
    <div class="two">${fig(a, pr.price_image_alt || "Price list")}${fig(b, pr.illustration_alt || "Service illustration")}</div></div>`;
}
async function viewPortfolio() {
  setMeta("Portfolio", "Selected 3D models, rigs and animation.");
  const all = await loadProjects(), cats = [...new Set(all.map((p) => p.category))];
  return `<div class="container page"><div class="page-head"><span class="eyebrow">Portfolio</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">Work</h1></div>
    ${all.length ? `<div class="filters" role="group" aria-label="Filter"><button class="chip" aria-pressed="${S.filter.cat === "all"}" data-cat="all">All</button>${cats.map((c) => `<button class="chip" aria-pressed="${S.filter.cat === c}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
      <input class="input" id="pf-q" type="search" placeholder="Search" aria-label="Search portfolio" value="${esc(S.filter.q)}"></div><div class="grid" id="pf-grid"></div>`
      : emptyBox("Portfolio coming soon", "Final artwork is being prepared. Published projects will appear here.")}</div>`;
}
function drawPortfolio() {
  const g = $("#pf-grid"); if (!g) return;
  const q = S.filter.q.toLowerCase(), list = S.projects.filter((p) => (S.filter.cat === "all" || p.category === S.filter.cat) && (!q || `${p.title} ${p.summary} ${p.software.join(" ")}`.toLowerCase().includes(q)));
  g.innerHTML = list.length ? list.map(workCard).join("") : `<div style="grid-column:1/-1">${emptyBox("No matches", "Try another filter.")}</div>`;
  observe();
}
async function viewProject(slug) {
  const all = await loadProjects(), p = all.find((x) => x.slug === slug); if (!p) return notFound();
  setMeta(p.title, p.summary);
  const models = p.portfolio_media.filter((m) => m.kind === "model"), imgs = p.portfolio_media.filter((m) => m.kind === "image");
  if (models.length) import("https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js").catch(() => {});
  const specs = Object.entries(p.specs || {});
  return `<div class="container page">${shareBtn("portfolio", p.slug)}<a class="eyebrow" href="#/portfolio">← Portfolio</a>
    <div class="detail" style="margin-top:2rem"><div class="gallery">
      ${safeUrl(p.cover_url) ? `<img src="${esc(safeUrl(p.cover_url))}" alt="${esc(p.cover_alt || p.title)}">` : ""}
      ${models.map((m) => `<model-viewer src="${esc(safeUrl(m.url))}" alt="${esc(m.alt || p.title)}" camera-controls auto-rotate loading="lazy"></model-viewer>`).join("")}
      ${imgs.map((m) => `<img src="${esc(safeUrl(m.url))}" alt="${esc(m.alt || p.title)}" loading="lazy">`).join("")}</div>
    <aside><span class="eyebrow">${esc(p.category)}</span><h1 style="font-size:var(--fs-h2);margin:1rem 0">${esc(p.title)}</h1>
      ${p.description ? paragraphs(p.description) : `<p class="muted">${esc(p.summary || "")}</p>`}
      ${p.software.length ? `<p class="mono muted">Software: ${p.software.map(esc).join(", ")}</p>` : ""}
      ${p.service_types.length ? `<p class="mono muted">Services: ${p.service_types.map(esc).join(", ")}</p>` : ""}
      ${specs.length ? `<ul class="dots">${specs.map(([k, v]) => `<li><span class="muted">${esc(k)}</span> — ${esc(v)}</li>`).join("")}</ul>` : ""}
      ${safeUrl(p.external_url) ? `<p><a class="btn ghost sm" href="${esc(safeUrl(p.external_url))}" target="_blank" rel="noopener noreferrer">Open project</a></p>` : ""}</aside></div></div>`;
}
function viewAbout() {
  const a = set("about"), b = set("brand"); setMeta("About", a.body);
  return `<div class="container page"><div class="two"><div><span class="eyebrow">${esc(a.title || "About")}</span><h1 style="font-size:var(--fs-h2);margin:1rem 0">${esc(b.name)} × ${esc(b.partner)}</h1>${paragraphs(a.body || "")}</div>
    <div style="display:grid;place-items:center;border:1px solid var(--border);background:var(--surface);padding:3rem"><img src="${esc(safeUrl(b.logo_url))}" alt="${esc(b.name)}" style="max-height:220px;object-fit:contain"></div></div></div>${contactBlock()}`;
}
const notFound = () => { setMeta("Not found"); return `<div class="container page"><h1>Page not found</h1><p class="muted"><a href="#/">Back to home</a></p></div>`; };
function viewMaintenance() { const m = set("maintenance"); setMeta("Maintenance"); return `<div class="container page"><h1>${esc(m.message || "We will be back shortly.")}</h1></div>`; }

/* ---------- order flow ---------- */
const o = () => S.order;
const errT = (k) => `<div class="err" role="alert">${esc(o().errors[k] || "")}</div>`;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

async function viewOrder() {
  setMeta("Order", "Start a commission.");
  const services = await loadServices(), lines = cart.all(), ord = set("order");
  if (o().done) return orderDone();
  if (!lines.length) return `<div class="container page"><div class="page-head"><span class="eyebrow">Order</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">Start a commission</h1></div>${emptyBox("Your order is empty", "Choose a service first.")}<p style="margin-top:1.5rem"><a class="btn" href="#/services">Browse services</a></p></div>`;
  const e = cart.estimate(lines, services), step = o().step, c = o().client;
  const steps = ["Services", "Brief", "Review"].map((t, i) => `<span ${step === i + 1 ? 'aria-current="step"' : ""}>0${i + 1} ${t}</span>`).join("");
  let body = "";
  if (step === 1) body = `<div>${lines.map((l) => { const s = services.find((x) => x.id === l.service_id); if (!s) return ""; const t = s.service_tiers.find((x) => x.id === l.tier_id);
    return `<div class="cart-line"><div class="top"><strong>${esc(s.name)}</strong><button class="linkbtn" data-act="rm" data-id="${esc(l.uid)}">Remove</button></div><span class="muted">${esc(t?.name || "Custom")} · ×${l.quantity}</span></div>`; }).join("")}</div>
    ${nextBtn("Continue to brief")}`;
  if (step === 2) body = `<div class="two"><div>
      <div class="field"><label class="req" for="f-name">Name or nickname</label><input class="input" id="f-name" data-bind="client.name" value="${esc(c.name)}" maxlength="80" autocomplete="name" aria-invalid="${!!o().errors.name}">${errT("name")}</div>
      <div class="field"><label class="req" for="f-email">Email</label><input class="input" id="f-email" type="email" data-bind="client.email" value="${esc(c.email)}" autocomplete="email" aria-invalid="${!!o().errors.email}">${errT("email")}</div>
      <div class="field"><label for="f-discord">Discord username or other contact</label><input class="input" id="f-discord" data-bind="client.discord" value="${esc(c.discord)}" maxlength="80"></div>
      <div class="field"><label for="f-budget">Budget (${esc(cur())})${ord.min_budget ? ` — minimum ${M(ord.min_budget, cur())}` : ""}</label><input class="input" id="f-budget" type="number" min="0" data-bind="budget" value="${esc(o().budget)}">${errT("budget")}</div>
      <div class="field"><label for="f-deadline">Deadline</label><input class="input" id="f-deadline" type="date" min="${new Date().toISOString().slice(0, 10)}" data-bind="deadline" value="${esc(o().deadline)}">${errT("deadline")}</div></div>
    <div><div class="field"><label class="req" for="f-brief">Project description</label><textarea class="input" id="f-brief" data-bind="brief" maxlength="4000" aria-invalid="${!!o().errors.brief}">${esc(o().brief)}</textarea>${errT("brief")}</div>
      ${lines.map((l) => { const s = services.find((x) => x.id === l.service_id); return (s?.brief_fields || []).map((f) => `<div class="field"><label class="${f.required ? "req" : ""}" for="bf-${esc(l.uid + f.key)}">${esc(s.name)} — ${esc(f.label)}</label>${f.type === "textarea" ? `<textarea class="input" id="bf-${esc(l.uid + f.key)}" data-line="${esc(l.uid)}" data-key="${esc(f.key)}" maxlength="1500">${esc(l.brief?.[f.key] || "")}</textarea>` : `<input class="input" id="bf-${esc(l.uid + f.key)}" data-line="${esc(l.uid)}" data-key="${esc(f.key)}" maxlength="300" value="${esc(l.brief?.[f.key] || "")}">`}${errT(l.uid + f.key)}</div>`).join(""); }).join("")}
      <div class="field"><span class="label">Reference images / files (max ${ord.max_files || 5}, ${ord.max_file_mb || 10} MB each; PNG, JPG, WebP, GIF, PDF)</span><input class="input" type="file" id="f-files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf">${errT("files")}
        <ul class="upload-list">${o().files.map((f, i) => `<li><span>${esc(f.name)}</span><button class="linkbtn" data-act="rmfile" data-i="${i}">Remove</button></li>`).join("")}</ul></div></div></div>
    <div style="display:flex;gap:.75rem"><button class="btn ghost" data-act="back">Back</button>${nextBtn("Review order")}</div>`;
  if (step === 3) body = `<div class="two"><div class="summary">${lines.map((l) => { const s = services.find((x) => x.id === l.service_id), t = s?.service_tiers.find((x) => x.id === l.tier_id); const le = cart.estimate([l], services);
      return `<div class="line"><span>${esc(s?.name)} <span class="muted">${esc(t?.name || "")} ×${l.quantity}</span></span><span class="mono">${le.quote ? "Quotation" : R(le.min, le.max, cur())}</span></div>`; }).join("")}
      <div class="line total"><span>Estimated total</span><span>${e.min == null ? "Quotation" : R(e.min, e.max, cur())}${e.quote && e.min != null ? " + quotation items" : ""}</span></div>
      <p class="muted" style="font-size:.8125rem;margin:.5rem 0 0">${esc(fxNote())} Indicative only. No payment is taken on this site; the studio replies with a quotation to confirm scope and price.</p></div>
    <div class="summary"><div class="line"><span class="muted">Name</span><span>${esc(c.name)}</span></div><div class="line"><span class="muted">Email</span><span>${esc(c.email)}</span></div>${c.discord ? `<div class="line"><span class="muted">Contact</span><span>${esc(c.discord)}</span></div>` : ""}
      ${o().deadline ? `<div class="line"><span class="muted">Deadline</span><span>${esc(o().deadline)}</span></div>` : ""}<div class="line"><span class="muted">Files</span><span>${o().files.length}</span></div><p class="muted" style="margin:.8rem 0 0;white-space:pre-wrap">${esc(o().brief)}</p></div></div>
    ${o().error ? `<div class="notice" role="alert">${esc(o().error)}</div>` : ""}
    ${o().busy ? `<div class="progress" style="margin:1rem 0"><i style="width:${o().progress}%"></i></div>` : ""}
    <div style="display:flex;gap:.75rem;margin-top:1.5rem"><button class="btn ghost" data-act="back" ${o().busy ? "disabled" : ""}>Back</button><button class="btn" data-act="submit" ${o().busy ? "disabled" : ""}>${o().busy ? '<span class="spin"></span> Sending…' : "Send request"}</button></div>`;
  return `<div class="container page"><div class="page-head"><span class="eyebrow">Order</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">Commission request</h1></div><div class="stepper">${steps}</div>${body}</div>`;
}
const nextBtn = (t) => `<button class="btn" data-act="next">${t}</button>`;
function orderDone() {
  const d = o().done, c = set("contact"), ord = set("order"), link = `${location.origin}${location.pathname}#/track?ref=${encodeURIComponent(d.reference)}&t=${encodeURIComponent(d.access_token)}`;
  return `<div class="container page"><div class="page-head"><span class="eyebrow">Received</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">Request sent</h1><p>Your request is saved. Keep this reference and your private tracking link.</p></div>
    <div class="refbox">${esc(d.reference)}</div>
    <div class="notice" style="margin-top:1.5rem"><strong>Save your tracking link — it is shown only once.</strong><br><input class="input" readonly value="${esc(link)}" onfocus="this.select()" style="margin:.7rem 0"><button class="btn sm" data-act="copy" data-v="${esc(link)}">Copy link</button></div>
    <p class="muted">${d.needs_quote ? "Some items need a custom quotation." : ""} ${d.estimated_min != null ? `Estimate: ${R(d.estimated_min, d.estimated_max, d.currency)}.` : ""} The studio will review your brief and reply with a quotation.</p>
    <p>${ord.confirm_discord && c.discord_url ? `<a class="btn ghost" href="${esc(safeUrl(c.discord_url))}" target="_blank" rel="noopener noreferrer">Message us on Discord</a> ` : ""}<a class="btn ghost" href="#/track?ref=${esc(d.reference)}&t=${esc(d.access_token)}">Track this order</a></p></div>`;
}
function validateStep() {
  const er = {}, c = o().client, lines = cart.all(), ord = set("order");
  if (o().step === 2) {
    if (c.name.trim().length < 2) er.name = "Enter your name (at least 2 characters).";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())) er.email = "Enter a valid email address.";
    if (o().brief.trim().length < 10) er.brief = "Describe the project (at least 10 characters).";
    if (o().budget !== "" && +o().budget < 0) er.budget = "Budget cannot be negative.";
    if (ord.min_budget && o().budget !== "" && +o().budget < +ord.min_budget) er.budget = `Minimum budget is ${M(ord.min_budget, cur())}.`;
    if (o().deadline && o().deadline < new Date().toISOString().slice(0, 10)) er.deadline = "Deadline cannot be in the past.";
    for (const l of lines) { const s = S.services.find((x) => x.id === l.service_id); for (const f of s?.brief_fields || []) if (f.required && !String(l.brief?.[f.key] || "").trim()) er[l.uid + f.key] = "Required."; }
  }
  o().errors = er; return !Object.keys(er).length;
}
async function submitOrder() {
  const lines = cart.all(), ord = set("order"); o().error = ""; o().busy = true; o().progress = 5; rerender();
  try {
    const paths = [], files = o().files, folder = uid();
    for (let i = 0; i < files.length; i++) {
      const f = files[i], name = f.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(-80) || "file";
      const path = `incoming/${folder}/${i}-${name}`;
      const { error } = await sb.storage.from("order-attachments").upload(path, f, { contentType: f.type, upsert: false });
      if (error) throw new Error(`Upload failed for "${f.name}": ${error.message}`);
      paths.push({ path }); o().progress = 5 + Math.round(((i + 1) / files.length) * 70); rerender();
    }
    const payload = { idempotency_key: o().key, client: o().client, budget: o().budget || null, deadline: o().deadline || null, brief: o().brief,
      items: lines.map((l) => ({ service_id: l.service_id, tier_id: l.tier_id, addon_ids: l.addon_ids, quantity: l.quantity, brief: l.brief })), attachments: paths,
      website: $("#hp")?.value || "" };
    const { data, error } = await sb.rpc("create_order", { p: payload });
    if (error) throw new Error(error.message);
    const list = store.get("kns_orders", []); list.unshift({ reference: data.reference, token: data.access_token, at: Date.now() }); store.set("kns_orders", list.slice(0, 20));
    o().done = data; cart.clear(); o().progress = 100;
  } catch (e) {
    o().error = navigator.onLine ? e.message : "You appear to be offline. Your input is kept — try again when reconnected.";
  } finally { o().busy = false; rerender(); }
}


/* ---------- payments (client side) ---------- */
const KIND = { bank: "Bank transfer", ewallet: "E-wallet", qris: "QRIS" };
function flowBlock(d) {
  if (d.status === "awaiting_approval") return `<div class="summary" style="margin-top:1.5rem"><div class="eyebrow">Your approval</div><h3 style="margin:.5rem 0">The work is ready for your review</h3>
    <p class="muted" style="font-size:.9rem">Check the result the studio shared with you (see Messages). If you are happy, approve it — the final payment (remaining ${esc(M((d.payment?.total ?? d.quoted_total ?? 0) - (d.payment?.paid ?? 0), d.currency))}) opens next, and your files are delivered after that payment is confirmed.</p>
    <button type="button" class="btn" data-act="approve">Approve the work</button>
    <form id="changesform" style="margin-top:1.2rem"><div class="field"><label for="ch-note">Or ask for changes</label><textarea class="input" id="ch-note" maxlength="1000" placeholder="Describe what should be changed" required></textarea></div><button class="btn ghost sm">Request changes</button></form></div>`;
  if (d.status === "ready_for_delivery") return `<div class="notice ok" style="margin-top:1.5rem">Final payment confirmed. The studio is preparing your files for delivery.</div>`;
  if (d.delivery) return `<div class="summary" style="margin-top:1.5rem"><div class="eyebrow">Delivery</div><h3 style="margin:.5rem 0">Your files are ready</h3>${d.delivery.note ? `<p style="white-space:pre-wrap">${esc(d.delivery.note)}</p>` : ""}${safeUrl(d.delivery.url) ? `<a class="btn" href="${esc(safeUrl(d.delivery.url))}" target="_blank" rel="noopener">Download your files</a>` : ""}<p class="muted mono" style="margin-top:.8rem">${esc(fmtDate(d.delivery.delivered_at))}</p></div>`;
  return "";
}
function payBlock(d) {
  const p = d.payment || {}, cfg = set("payment"), idr = (n) => money(n, d.currency);   // always exact IDR, never converted
  const hist = (d.payments || []).length ? `<ul class="upload-list" style="margin-top:1rem">${d.payments.map((x) => `<li><span>${x.kind === "deposit" ? "Deposit" : "Final payment"} · ${esc(idr(x.amount))} · ${esc(x.method_label || "")}<br><span class="muted mono">${esc(fmtDate(x.created_at))}${x.review_note ? " · " + esc(x.review_note) : ""}</span></span><span class="tag ${x.status === "confirmed" ? "accent" : ""}">${esc({ pending: "Verifying", confirmed: "Confirmed", rejected: "Rejected" }[x.status] || x.status)}</span></li>`).join("")}</ul>` : "";
  if (p.state === "none" && p.paid > 0 && p.total - p.paid > 0) return `<div class="summary" style="margin-top:1.5rem"><div class="eyebrow">Payment</div><p style="margin:.6rem 0 0">Deposit received. Remaining balance: <strong>${esc(idr(p.total - p.paid))}</strong>. It opens after the work is finished and you have approved it; your files are delivered once it is paid.</p>${hist}</div>`;
  if (p.state === "none") return hist ? `<div class="summary" style="margin-top:1.5rem"><div class="eyebrow">Payment</div>${hist}</div>` : "";
  if (p.state === "pending") return `<div class="summary" style="margin-top:1.5rem"><div class="eyebrow">Payment</div><div class="notice ok" style="margin:.8rem 0 0">Proof received. The studio is verifying your payment.</div>${hist}</div>`;
  if (p.state === "paid") return `<div class="summary" style="margin-top:1.5rem"><div class="eyebrow">Payment</div><div class="notice ok" style="margin:.8rem 0 0">Paid in full: ${esc(idr(p.paid))}. Thank you!</div>${hist}</div>`;
  const methods = d.methods || [], det = (m) => `<div class="paydet">${m.account_name ? `<div><span class="muted">Name</span> ${esc(m.account_name)}</div>` : ""}${m.account_number ? `<div><span class="muted">${m.kind === "bank" ? "Account no." : "Number"}</span> <strong class="mono">${esc(m.account_number)}</strong> <button type="button" class="linkbtn" data-act="copy" data-v="${esc(m.account_number)}">Copy</button></div>` : ""}${safeUrl(m.qris_image_url) ? `<a href="${esc(safeUrl(m.qris_image_url))}" target="_blank" rel="noopener"><img class="qris" src="${esc(safeUrl(m.qris_image_url))}" alt="QRIS code for ${esc(m.label)}" loading="lazy"></a><div class="muted" style="font-size:.8125rem">${esc(cfg.qris_notice || "Type the exact amount when paying.")}</div>` : ""}${m.instructions ? `<div class="muted" style="white-space:pre-wrap;font-size:.875rem">${esc(m.instructions)}</div>` : ""}</div>`;
  return `<form class="summary" id="payform" style="margin-top:1.5rem"><div class="eyebrow">Payment due</div>
    <h3 style="margin:.5rem 0">${p.kind === "deposit" ? (p.deposit_percent >= 100 ? "Payment" : `Deposit (${esc(p.deposit_percent)}%)`) : "Final payment"}</h3>
    <div class="refbox" style="font-size:1.6rem;margin:.5rem 0">${esc(idr(p.amount))}</div>
    <p class="muted" style="font-size:.8125rem">Pay this exact amount in IDR. Quoted total: ${esc(idr(p.total))}${p.paid > 0 ? ` · paid so far: ${esc(idr(p.paid))}` : ""}. ${esc(cfg.note || "")}</p>
    ${p.last_rejection ? `<div class="notice" role="alert"><strong>Your last proof was not accepted.</strong><br>${esc(p.last_rejection)}</div>` : ""}
    ${methods.length ? `<div class="label" style="margin:1rem 0 .4rem">Choose a method</div>${methods.map((m, i) => `<label class="paymethod"><input type="radio" name="pm" value="${esc(m.id)}" ${i === 0 ? "checked" : ""}><span><strong>${esc(m.label)}</strong> <span class="tag">${esc(KIND[m.kind] || m.kind)}</span>${det(m)}</span></label>`).join("")}
      <div class="field" style="margin-top:1rem"><label class="req" for="pf-proof">Payment proof (PNG, JPG, WebP, GIF or PDF, max 10 MB)</label><input class="input" id="pf-proof" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" required><div class="err" id="pf-err" role="alert"></div></div>
      <div class="field"><label for="pf-note">Note (optional)</label><input class="input" id="pf-note" maxlength="500" placeholder="e.g. sender name"></div>
      <button class="btn" id="pf-btn">I have paid — send proof</button>`
      : `<div class="notice">The studio will send you payment details directly (Discord / WhatsApp / email).</div>`}${hist}</form>`;
}


/* ---------- digital store ---------- */
const SF = (S.sf = { cat: "all", price: "all", q: "", sort: "featured" });
async function loadStore(force) {
  if (S.store && !force) return S.store;
  const [c, p] = await Promise.all([
    sb.from("product_categories").select("*").eq("is_active", true).order("sort_order"),
    sb.from("products").select("*").eq("status", "published").order("sort_order")]);
  if (c.error) throw c.error; if (p.error) throw p.error;
  return (S.store = { cats: c.data, products: p.data });
}
const pPrice = (p) => +p.price > 0 ? M(p.price) : "Free";
function prodCard(p, cats) {
  const img = safeUrl(p.cover_url), c = cats.find((x) => x.id === p.category_id);
  return `<a class="pcard reveal" href="#/store/${esc(p.slug)}"><div class="thumb">${img ? `<img src="${esc(img)}" alt="${esc(p.cover_alt || p.title)}" loading="lazy" decoding="async">` : ""}<span class="ptag ${+p.price > 0 ? "" : "free"}">${esc(pPrice(p))}</span></div>
    <div class="meta"><strong>${esc(p.title)}</strong><span class="muted">${esc(c?.name || "")}${p.version ? ` · v${esc(p.version)}` : ""}</span>${p.summary ? `<p class="muted" style="margin:.2rem 0 0;font-size:.875rem">${esc(p.summary)}</p>` : ""}</div></a>`;
}
async function viewStore(q) {
  setMeta("Store", "Digital products: plugins, scripts, models and animation poses.");
  const { cats, products } = await loadStore();
  if (q.cat && cats.some((c) => c.slug === q.cat)) SF.cat = q.cat;
  if (q.price === "free" || q.price === "paid") SF.price = q.price;
  const cnt = (id) => products.filter((p) => p.category_id === id).length;
  return `<div class="container page"><div class="page-head"><span class="eyebrow">Store</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">Digital products</h1><p class="lead muted" style="max-width:40rem">Plugins, scripts, ready-made models and animation poses. Free items download instantly; paid items unlock after payment is confirmed.</p></div>
    ${products.length ? `<div class="filters" role="group" aria-label="Category"><button class="chip" aria-pressed="${SF.cat === "all"}" data-scat="all">All</button>${cats.filter((c) => cnt(c.id)).map((c) => `<button class="chip" aria-pressed="${SF.cat === c.slug}" data-scat="${esc(c.slug)}">${esc(c.name)} <small>${cnt(c.id)}</small></button>`).join("")}</div>
      <div class="filters" role="group" aria-label="Price and sort">${[["all", "All"], ["free", "Free"], ["paid", "Buy"]].map(([k, l]) => `<button class="chip" aria-pressed="${SF.price === k}" data-sprice="${k}">${l}</button>`).join("")}
        <select class="input" id="st-sort" aria-label="Sort" style="max-width:11rem;margin-left:auto;padding-block:.5rem">${[["featured", "Featured"], ["new", "Newest"], ["low", "Price: low to high"], ["high", "Price: high to low"], ["az", "Name A–Z"]].map(([k, l]) => `<option value="${k}" ${SF.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input class="input" id="st-q" type="search" placeholder="Search products" aria-label="Search products" value="${esc(SF.q)}" style="max-width:14rem;margin-left:0"></div>
      <div class="pgrid" id="st-grid"></div>`
      : emptyBox("The store is opening soon", "Published products will appear here.")}</div>`;
}
function drawStore() {
  const g = $("#st-grid"); if (!g || !S.store) return;
  const { cats, products } = S.store, q = SF.q.toLowerCase(), cat = cats.find((c) => c.slug === SF.cat);
  let list = products.filter((p) => (SF.cat === "all" || p.category_id === cat?.id) && (SF.price === "all" || (SF.price === "free" ? +p.price === 0 : +p.price > 0)) && (!q || `${p.title} ${p.summary || ""} ${(p.tags || []).join(" ")}`.toLowerCase().includes(q)));
  const by = { featured: (a, b) => (b.is_featured - a.is_featured) || (a.sort_order - b.sort_order), new: (a, b) => b.created_at.localeCompare(a.created_at), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, az: (a, b) => a.title.localeCompare(b.title) };
  list = [...list].sort(by[SF.sort] || by.featured);
  g.innerHTML = list.length ? list.map((p) => prodCard(p, cats)).join("") : `<div style="grid-column:1/-1">${emptyBox("No matches", "Try another category or clear the search.")}</div>`;
  observe();
}
async function viewProduct(slug) {
  const { cats, products } = await loadStore(), p = products.find((x) => x.slug === slug);
  if (!p) return notFound();
  setMeta(p.title, p.summary || "");
  const c = cats.find((x) => x.id === p.category_id), free = +p.price === 0, imgs = [p.cover_url, ...(p.gallery || [])].map(safeUrl).filter(Boolean);
  const meta = [["Category", c?.name], ["Version", p.version], ["Works with", p.compatibility], ["File", p.file_info], ["License", p.license_note]].filter((x) => x[1]);
  return `<div class="container page">${shareBtn("store", p.slug)}<a class="eyebrow" href="#/store">← Store</a>
    <div class="two" style="margin-top:1.5rem"><div>${imgs.length ? `<img class="prod-main" id="pmain" src="${esc(imgs[0])}" alt="${esc(p.cover_alt || p.title)}">${imgs.length > 1 ? `<div class="prod-thumbs">${imgs.map((u, i) => `<button type="button" class="chip" data-pimg="${esc(u)}" aria-label="Image ${i + 1}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}` : `<div class="prod-main"></div>`}</div>
      <div><span class="eyebrow">${esc(c?.name || "")}</span><h1 style="font-size:var(--fs-h2);margin:.6rem 0">${esc(p.title)}</h1>
        <div class="refbox" style="font-size:1.6rem;margin:.5rem 0">${esc(pPrice(p))}</div>${!free && usdOn() ? `<p class="muted" style="font-size:.8125rem">${esc(fxNote())}</p>` : ""}
        <p class="lead" style="font-size:1rem">${esc(p.summary || "")}</p>
        <div id="buybox">${free ? `<button class="btn" data-act="freedl" data-slug="${esc(p.slug)}">Download for free</button>` : `<button class="btn" data-act="showbuy">Buy now</button>`}</div>
        ${meta.length ? `<dl class="specs" style="margin-top:1.5rem">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${(p.tags || []).length ? `<p style="margin-top:1rem">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</p>` : ""}
        ${p.description ? `<div style="margin-top:1.5rem">${paragraphs(p.description)}</div>` : ""}
        <p class="muted" style="font-size:.8125rem;margin-top:1.5rem">By downloading or buying you agree to the <a href="#/legal/terms">Terms</a> and <a href="#/legal/refund">Refund Policy</a>.</p></div></div></div>`;
}
function buyForm(slug) {
  const p = S.store.products.find((x) => x.slug === slug), cl = S.order.client;
  return `<form id="buyform" data-id="${esc(p.id)}" class="summary"><div class="eyebrow">Checkout · ${esc(pPrice(p))}</div>
    <div class="field"><label class="req" for="bf-name">Name</label><input class="input" id="bf-name" value="${esc(cl.name)}" required minlength="2" maxlength="80" autocomplete="name"></div>
    <div class="field"><label class="req" for="bf-email">Email</label><input class="input" id="bf-email" type="email" value="${esc(cl.email)}" required maxlength="254" autocomplete="email"></div>
    <div class="field"><label for="bf-discord">Discord / WhatsApp (optional)</label><input class="input" id="bf-discord" value="${esc(cl.discord)}" maxlength="80"></div>
    <div class="err" id="bf-err" role="alert"></div>
    <p class="muted" style="font-size:.8125rem">Next you will see payment details (bank, e-wallet or QRIS). Upload your proof; the download unlocks on your order page once the studio confirms the payment.</p>
    <button class="btn" id="bf-btn">Continue to payment</button></form>`;
}
async function legalView(key) {
  const l = set("legal", {})[key]; if (!l) return notFound();
  setMeta(l.title);
  return `<div class="container page" style="max-width:48rem"><span class="eyebrow">Legal</span><h1 style="font-size:var(--fs-h2);margin:.8rem 0 1.5rem">${esc(l.title)}</h1><div style="white-space:pre-wrap;line-height:1.7">${esc(l.body)}</div><p class="muted" style="margin-top:2rem;font-size:.8125rem">If something is unclear, contact the studio before ordering.</p></div>`;
}

/* ---------- track ---------- */
async function viewTrack(q) {
  setMeta("Track order");
  const t = S.track;
  if (q.ref && q.t && (t.ref !== q.ref || t.token !== q.t)) { t.ref = q.ref; t.token = q.t; await doTrack(); }
  const saved = store.get("kns_orders", []);
  const d = t.data;
  return `<div class="container page"><div class="page-head"><span class="eyebrow">Track</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">Order status</h1></div>
   ${d ? `<div class="two"><div><div class="eyebrow">${esc(d.reference)}</div><h2 style="margin:.6rem 0 1.5rem">${esc(STATUS[d.status] || d.status)}</h2>
      <ul class="timeline">${d.history.map((h) => `<li><strong>${esc(STATUS[h.to_status] || h.to_status)}</strong><div class="muted mono">${esc(fmtDate(h.created_at))}</div>${h.note ? `<div>${esc(h.note)}</div>` : ""}</li>`).join("")}</ul></div>
     <div><div class="summary">${d.items.map((i) => `<div class="line"><span>${esc(i.service_name)} <span class="muted">${esc(i.tier_name || "")} ×${i.quantity}</span></span></div>`).join("")}
       ${d.quoted_total != null ? `<div class="line total"><span>Quoted total</span><span>${M(d.quoted_total, d.currency)}</span></div>` : `<div class="line"><span class="muted">Estimate</span><span>${d.estimated_min != null ? R(d.estimated_min, d.estimated_max, d.currency) : "Awaiting quotation"}</span></div>`}
       ${d.deadline ? `<div class="line"><span class="muted">Deadline</span><span>${esc(d.deadline)}</span></div>` : ""}</div>
      ${flowBlock(d)}${payBlock(d)}
      <h3 style="margin:2rem 0 1rem;font-size:1.1rem">Messages</h3>${d.messages.length ? d.messages.map((m) => `<div class="cart-line"><span class="eyebrow">${m.author_type === "admin" ? "Studio" : "You"} · ${esc(fmtDate(m.created_at))}</span><span style="white-space:pre-wrap">${esc(m.body)}</span></div>`).join("") : `<p class="muted">No messages yet.</p>`}
      <form id="replyform" style="margin-top:1rem"><div class="field"><label for="reply">Reply to the studio</label><textarea class="input" id="reply" maxlength="2000" required></textarea></div><button class="btn sm">Send</button> <button type="button" class="btn ghost sm" data-act="refresh">Refresh</button></form></div></div>`
   : `<form id="trackform" style="max-width:30rem">${t.error ? `<div class="notice" role="alert">${esc(t.error)}</div>` : ""}
      <div class="field"><label for="tr-ref">Reference</label><input class="input" id="tr-ref" value="${esc(t.ref)}" placeholder="KNS-XXXXXXXX" required></div>
      <div class="field"><label for="tr-tok">Access token (from your tracking link)</label><input class="input" id="tr-tok" value="${esc(t.token)}" required></div>
      <button class="btn" ${t.loading ? "disabled" : ""}>${t.loading ? "Checking…" : "Track order"}</button></form>
      <details class="acc" style="max-width:30rem;margin-top:1.5rem"><summary>Lost your tracking link?</summary><form id="recoverform" style="padding:0 1rem 1rem"><p class="muted" style="font-size:.875rem">Enter your order reference and the email you used. We will issue a new private link (the old one stops working).</p>
        <div class="field"><label for="rc-ref">Reference</label><input class="input" id="rc-ref" placeholder="KNS-XXXXXXXX" required></div><div class="field"><label for="rc-email">Email</label><input class="input" id="rc-email" type="email" required></div><div class="err" id="rc-err" role="alert"></div><button class="btn sm">Get a new link</button></form></details>
      ${saved.length ? `<h3 style="margin:2.5rem 0 1rem;font-size:1.1rem">On this device</h3>${saved.map((s) => `<a class="svc-row" style="grid-template-columns:1fr auto" href="#/track?ref=${esc(s.reference)}&t=${esc(s.token)}"><span class="mono">${esc(s.reference)}</span><span class="muted">${esc(new Date(s.at).toLocaleDateString())}</span></a>`).join("")}` : ""}`}</div>`;
}
async function doTrack() {
  const t = S.track; t.loading = true; t.error = "";
  const { data, error } = await sb.rpc("track_order", { p_reference: t.ref, p_token: t.token });
  t.loading = false;
  if (error) { t.error = error.message; t.data = null; } else if (!data) { t.error = "No order matches that reference and token."; t.data = null; } else t.data = data;
}

/* ---------- cart drawer ---------- */
function drawCart() {
  const lines = cart.all(), services = S.services || [], e = cart.estimate(lines, services);
  $("#cart-count").textContent = cart.count(); $("#cart-count").hidden = !cart.count();
  $("#drawer-body").innerHTML = lines.length ? lines.map((l) => { const s = services.find((x) => x.id === l.service_id); if (!s) return "";
    const t = s.service_tiers.find((x) => x.id === l.tier_id), le = cart.estimate([l], services);
    return `<div class="cart-line"><div class="top"><strong>${esc(s.name)}</strong><button class="linkbtn" data-act="rm" data-id="${esc(l.uid)}">Remove</button></div>
      <span class="muted">${esc(t?.name || "Custom")}${l.addon_ids.length ? ` + ${l.addon_ids.length} add-on` : ""}</span>
      <div style="display:flex;justify-content:space-between;align-items:center"><input class="input" style="width:5rem;padding:.35rem .5rem" type="number" min="1" max="50" value="${l.quantity}" aria-label="Quantity" data-act="qty" data-id="${esc(l.uid)}"><span class="mono">${le.quote ? "Quotation" : R(le.min, le.max, cur())}</span></div></div>`; }).join("")
    : emptyBox("Nothing here yet", "Add a service to start an order.");
  $("#drawer-total").textContent = !lines.length ? "—" : e.min == null ? "Quotation" : R(e.min, e.max, cur());
  $("#drawer-go").hidden = !lines.length;
}
function openDrawer() { loadServices().then(drawCart); $("#drawer").classList.add("open"); $("#scrim").classList.add("on"); $("#drawer").removeAttribute("inert"); }
function closeDrawer() { $("#drawer").classList.remove("open"); $("#scrim").classList.remove("on"); $("#drawer").setAttribute("inert", ""); }

/* ---------- router ---------- */
let seq = 0;
const parse = () => { const h = location.hash.slice(1) || "/", [p, qs = ""] = h.split("?"); return { parts: p.split("/").filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs)) }; };
async function rerender() { const y = scrollY, a = document.activeElement?.id; await route(true); scrollTo(0, y); if (a) $("#" + a)?.focus?.(); }
async function route(keep) {
  const my = ++seq, { parts, q } = parse(); let html;
  $$("#nav a").forEach((a) => a.removeAttribute("aria-current"));
  const cur0 = $$("#nav a").find((a) => a.getAttribute("href") === "#/" + (parts[0] || "")); cur0?.setAttribute("aria-current", "page");
  $("#nav").classList.remove("open");
  if (!keep) { closeDrawer(); app.innerHTML = skeleton(); }
  try {
    const m = set("maintenance");
    if (m.enabled && parts[0] !== "track") html = viewMaintenance();
    else if (!parts.length) html = await viewHome();
    else if (parts[0] === "services") html = parts[1] ? await viewService(parts[1]) : await viewServices();
    else if (parts[0] === "pricing") html = await viewPricing();
    else if (parts[0] === "portfolio") html = parts[1] ? await viewProject(parts[1]) : await viewPortfolio();
    else if (parts[0] === "store") html = parts[1] ? await viewProduct(parts[1]) : await viewStore(q);
    else if (parts[0] === "legal") html = await legalView(parts[1]);
    else if (parts[0] === "about") html = viewAbout();
    else if (parts[0] === "order") html = await viewOrder();
    else if (parts[0] === "track") html = await viewTrack(q);
    else html = notFound();
  } catch (e) { html = fail(e); }
  if (my !== seq) return;
  app.innerHTML = html + `<input id="hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" name="website">`;
  if (!keep) { app.classList.remove("page-in"); void app.offsetWidth; app.classList.add("page-in"); scrollTo(0, 0); app.focus({ preventScroll: true }); }
  if (parts[0] === "services" && parts[1]) wireService();
  if (parts[0] === "portfolio" && !parts[1]) drawPortfolio();
  if (parts[0] === "store" && !parts[1]) drawStore();
  if (parts[0] === "order" && S.services) wireOrder();
  observe();
}
function wireOrder() {
  const f = $("#f-files"); if (!f) return;
  f.addEventListener("change", () => {
    const ord = set("order"), max = ord.max_files || 5, mb = ord.max_file_mb || 10, er = [];
    for (const file of f.files) {
      if (!ALLOWED.includes(file.type)) er.push(`"${file.name}" is not an allowed type.`);
      else if (file.size > mb * 1048576) er.push(`"${file.name}" is over ${mb} MB.`);
      else if (o().files.length >= max) er.push(`Only ${max} files allowed.`);
      else o().files.push(file);
    }
    o().errors.files = er.join(" "); rerender();
  });
}
function observe() {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  $$(".reveal:not(.in)").forEach((el) => io.observe(el));
}

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-act],[data-cat],[data-scat],[data-sprice],[data-pimg]"); if (!el) return;
  if (el.dataset.pimg) { const m = $("#pmain"); if (m) m.src = el.dataset.pimg; return; }
  if (el.dataset.scat || el.dataset.sprice) { if (el.dataset.scat) SF.cat = el.dataset.scat; else SF.price = el.dataset.sprice;
    $$("[data-scat]").forEach((c) => c.setAttribute("aria-pressed", c.dataset.scat === SF.cat)); $$("[data-sprice]").forEach((c) => c.setAttribute("aria-pressed", c.dataset.sprice === SF.price)); return drawStore(); }
  if (el.dataset.cat) { S.filter.cat = el.dataset.cat; $$(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.cat === S.filter.cat)); return drawPortfolio(); }
  const a = el.dataset.act;
  if (a === "reload") return route();
  if (a === "rm") { cart.remove(el.dataset.id); return location.hash.startsWith("#/order") ? rerender() : null; }
  if (a === "rmfile") { o().files.splice(+el.dataset.i, 1); return rerender(); }
  if (a === "next") { if (validateStep()) { o().step++; } return rerender(); }
  if (a === "back") { o().step = Math.max(1, o().step - 1); return rerender(); }
  if (a === "submit") return submitOrder();
  if (a === "copy") { try { await navigator.clipboard.writeText(el.dataset.v); toast("Copied.", "ok"); } catch { toast("Select the link and copy it manually."); } return; }
  if (a === "showbuy") { $("#buybox").innerHTML = buyForm(location.hash.split("/")[2].split("?")[0]); $("#bf-name").focus(); return; }
  if (a === "freedl") { const b = ev.target.closest("[data-act]"); b.disabled = true;
    const { data, error } = await sb.rpc("get_free_download", { p_slug: b.dataset.slug }); b.disabled = false;
    if (error || !data) return toast(error?.message || "Download unavailable.");
    const u = safeUrl(data); if (!u) return toast("Download unavailable.");
    $("#buybox").innerHTML = `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">Open your download</a> <span class="muted" style="font-size:.8125rem">Thanks! Free items are provided as-is.</span>`; return; }
  if (a === "approve") { if (!confirm("Approve the work? The final payment will open next.")) return;
    const { data, error } = await sb.rpc("client_approve", { p_reference: S.track.ref, p_token: S.track.token });
    if (error || !data) return toast(error?.message || "Could not approve."); toast("Approved. Please complete the final payment.", "ok"); await doTrack(); return rerender(); }
  if (a === "refresh") { await doTrack(); return rerender(); }
});
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.bind) { const [a, b] = t.dataset.bind.split("."); if (b) o()[a][b] = t.value; else o()[a] = t.value; }
  if (t.id === "st-q") { SF.q = t.value; drawStore(); }
  if (t.id === "st-sort") { SF.sort = t.value; drawStore(); }
  if (t.id === "pf-q") { S.filter.q = t.value; drawPortfolio(); }
  if (t.dataset.line) { cart.update(t.dataset.line, { brief: { ...(cart.all().find((x) => x.uid === t.dataset.line)?.brief || {}), [t.dataset.key]: t.value } }); }
});
document.addEventListener("change", (ev) => { const t = ev.target; if (t.dataset.act === "qty") { cart.update(t.dataset.id, { quantity: Math.max(1, Math.min(50, +t.value || 1)) }); } });
document.addEventListener("submit", async (ev) => {
  if (ev.target.id === "trackform") { ev.preventDefault(); S.track.ref = $("#tr-ref").value.trim(); S.track.token = $("#tr-tok").value.trim(); S.track.loading = true; await doTrack(); return rerender(); }
  if (ev.target.id === "payform") {
    ev.preventDefault(); const f = ev.target, file = $("#pf-proof").files[0], err = $("#pf-err"), btn = $("#pf-btn"); err.textContent = "";
    if (!file) { err.textContent = "Please choose your payment proof."; return; }
    if (!ALLOWED.includes(file.type)) { err.textContent = "Only PNG, JPG, WebP, GIF or PDF files."; return; }
    if (file.size > 10 * 1048576) { err.textContent = "File is over 10 MB."; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Sending…';
    try {
      const name = file.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(-80) || "proof";
      const path = `incoming/pay-${uid()}/${name}`;
      const up = await sb.storage.from("order-attachments").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error("Upload failed: " + up.error.message);
      const { error } = await sb.rpc("submit_payment", { p_reference: S.track.ref, p_token: S.track.token, p_method: f.pm.value, p_proof: path, p_note: $("#pf-note").value });
      if (error) throw new Error(error.message);
      toast("Proof sent. The studio will verify it.", "ok"); await doTrack(); return rerender();
    } catch (e) { err.textContent = navigator.onLine ? e.message : "You appear to be offline. Try again when reconnected."; btn.disabled = false; btn.textContent = "I have paid — send proof"; }
    return;
  }
  if (ev.target.id === "buyform") {
    ev.preventDefault(); const f = ev.target, btn = $("#bf-btn"), err = $("#bf-err"); err.textContent = ""; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Creating order…';
    const client = { name: $("#bf-name").value, email: $("#bf-email").value, discord: $("#bf-discord").value }; Object.assign(S.order.client, client);
    const { data, error } = await sb.rpc("create_product_order", { p: { idempotency_key: uid(), client, product_id: f.dataset.id, website: $("#hp")?.value || "" } });
    if (error || !data?.access_token) { err.textContent = error?.message || "Could not create the order."; btn.disabled = false; btn.textContent = "Continue to payment"; return; }
    const list = store.get("kns_orders", []); list.unshift({ reference: data.reference, token: data.access_token, at: Date.now() }); store.set("kns_orders", list.slice(0, 20));
    S.track = { data: null, ref: "", token: "", error: "", loading: false };
    location.hash = `#/track?ref=${encodeURIComponent(data.reference)}&t=${encodeURIComponent(data.access_token)}`; return;
  }
  if (ev.target.id === "recoverform") {
    ev.preventDefault(); const btn = $("button", ev.target), err = $("#rc-err"); err.textContent = ""; btn.disabled = true;
    const { data, error } = await sb.rpc("recover_order", { p_reference: $("#rc-ref").value, p_email: $("#rc-email").value }); btn.disabled = false;
    if (error) { err.textContent = error.message; return; }
    if (!data) { err.textContent = "No order matches that reference and email."; return; }
    const list = store.get("kns_orders", []).filter((x) => x.reference !== data.reference); list.unshift({ reference: data.reference, token: data.access_token, at: Date.now() }); store.set("kns_orders", list.slice(0, 20));
    toast("New tracking link issued. The old link no longer works.", "ok");
    S.track = { data: null, ref: "", token: "", error: "", loading: false };
    location.hash = `#/track?ref=${encodeURIComponent(data.reference)}&t=${encodeURIComponent(data.access_token)}`; return;
  }
  if (ev.target.id === "changesform") { ev.preventDefault(); const { data, error } = await sb.rpc("client_request_changes", { p_reference: S.track.ref, p_token: S.track.token, p_note: $("#ch-note").value });
    if (error || !data) return toast(error?.message || "Could not send."); toast("Change request sent.", "ok"); await doTrack(); return rerender(); }
  if (ev.target.id === "replyform") { ev.preventDefault(); const { data, error } = await sb.rpc("client_reply", { p_reference: S.track.ref, p_token: S.track.token, p_body: $("#reply").value });
    if (error || !data) return toast(error?.message || "Could not send message."); toast("Message sent.", "ok"); await doTrack(); return rerender(); }
});
$("#cart-open").addEventListener("click", openDrawer);
$("#drawer-close").addEventListener("click", closeDrawer);
$("#scrim").addEventListener("click", closeDrawer);
$("#drawer-go").addEventListener("click", () => { closeDrawer(); });
$("#menu-btn").addEventListener("click", () => { const n = $("#nav"); const on = n.classList.toggle("open"); $("#menu-btn").setAttribute("aria-expanded", on); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
window.addEventListener("hashchange", () => route());
window.addEventListener("online", () => toast("Back online.", "ok"));
let _cc = cart.count();
cart.onChange(() => { const n = cart.count(); if (n > _cc) sfx("add"); _cc = n; if (S.services) drawCart(); else { $("#cart-count").textContent = cart.count(); $("#cart-count").hidden = !cart.count(); } });

// live preview from the admin editor (same-origin iframe only)
if (new URLSearchParams(location.search).has("preview")) {
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.type !== "kns-preview") return;
    S.settings = { ...S.settings, ...e.data.settings }; renderChrome(); route(true);
  });
  parent.postMessage({ type: "kns-preview-ready" }, location.origin);
}

/* ---------- currency toggle ---------- */
function drawFx() {
  const box = $("#fx"), show = !!S.fx.rate && cur() === "IDR" && !set("order").fx_disabled;
  box.hidden = !show; if (!show) return;
  $$("button", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cur === (S.fx.mode === "USD" ? "USD" : "IDR"))));
  const n = $("#fx-note"); if (n) n.textContent = fxNote();
}
$("#fx").addEventListener("click", (e) => { const b = e.target.closest("button[data-cur]"); if (!b) return; S.fx.mode = b.dataset.cur; store.set("kns_cur", S.fx.mode); drawFx(); route(true); if (S.services) drawCart(); });
async function refreshFx(force) { const r = await getRate(force); if (r) { S.fx.rate = r.rate; S.fx.at = r.at; drawFx(); if (S.fx.mode === "USD") { route(true); if (S.services) drawCart(); } } }

/* ---------- boot ---------- */
(async () => {
  try { await loadSettings(); renderChrome(); } catch (e) { app.innerHTML = fail(e); return; }
  await route();
  loadServices().then(drawCart).catch(() => {});
  refreshFx(); setInterval(() => refreshFx(true), 30 * 60 * 1000);   // live rate, refreshed every 30 min
})();
