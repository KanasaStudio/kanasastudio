/* Admin: Digital Letters — orders/letters, templates, categories, plans & add-ons. */
import { sb, esc, toast, fld, chk, busy, must } from "./admin-lib.js";
import { $, $$, money, slugify } from "./util.js";
import { PROFILES } from "./letter/profiles.js?v=20261111a";

const TABS = [["", "Letters & orders"], ["templates", "Templates"], ["categories", "Categories"], ["pricing", "Plans & add-ons"]];
const ENGINES = ["envelope", "giftbox", "cake", "scrapbook", "cinematic"];
const FX = ["opening", "typing", "hearts", "confetti", "petals", "sparkles", "gallery", "closing"], DEC = ["tape", "seal", "ribbon", "stars", "border"];
const FONTS = ["serif", "script", "hand", "sans", "classic"];
const dt = (v) => (v ? new Date(v).toLocaleString() : "—");
const ORD = { free: "Free", pending_payment: "Pending payment", paid: "Paid", cancelled: "Cancelled" };
const shell = (tab, body) => `<div class="bar"><h1>Digital Letters</h1><a class="btn ghost sm" href="../#/letters" target="_blank" rel="noopener">View public page ↗</a></div>
  <nav class="tabs" style="display:flex;gap:1.2rem;border-bottom:1px solid var(--border);margin-bottom:1.5rem" aria-label="Letters sections">${TABS.map(([k, t]) => `<a href="#/letters${k ? "/" + k : ""}" ${k === tab ? 'aria-current="page"' : ""} style="padding:.5rem 0">${t}</a>`).join("")}</nav>${body}`;

export async function viewLetters(el, tab = "") {
  const t = TABS.some(([k]) => k === tab) ? tab : "";
  el.innerHTML = shell(t, '<div id="lbody"><div class="skeleton" style="height:10rem"></div></div>');
  await { "": letters, templates, categories, pricing }[t]($("#lbody", el), el);
}
const reload = (tab) => viewLetters($("#view"), tab);
const csvOf = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const picks = (name, all, on) => `<div class="cols" style="gap:.4rem 1rem;flex-wrap:wrap">${all.map((k) => `<label class="check"><input type="checkbox" name="${name}" value="${k}" ${on.includes(k) ? "checked" : ""}> ${k}</label>`).join("")}</div>`;
const ticked = (f, name) => [...f.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);

/* ---------- letters & orders ---------- */
const PER = 30;
async function letters(el, root, st = { status: "", page: 0 }) {
  let q = sb.from("letters").select("id,public_id,template_name,content,plan_name,plan_days,addons,price_idr,order_status,order_ref,contact,expires_at,views,visibility,created_at,admin_note", { count: "exact" });
  if (st.status) q = q.eq("order_status", st.status);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(st.page * PER, st.page * PER + PER - 1); if (error) throw error;
  const all = must(await sb.from("letters").select("order_status,price_idr"));
  const n = (s) => all.filter((x) => x.order_status === s).length, rev = all.filter((x) => x.order_status === "paid").reduce((a, x) => a + x.price_idr, 0);
  const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  el.innerHTML = `<div class="stats">${stat(all.length, "Letters made")}${stat(n("pending_payment"), "Waiting for payment")}${stat(n("paid"), "Paid")}${stat(money(rev), "Confirmed revenue")}</div>
   <div class="filters" style="margin:1rem 0"><select class="input" id="lst" aria-label="Filter by status" style="max-width:14rem"><option value="">All statuses</option>${Object.entries(ORD).map(([k, t]) => `<option value="${k}" ${st.status === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
   ${data.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Created</th><th>Letter</th><th>Plan</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>${data.map((l) => `<tr>
     <td>${dt(l.created_at)}<br><span class="muted">${esc(l.order_ref || "")}</span></td>
     <td><strong>${esc(l.content?.title || "—")}</strong><br><span class="muted">${esc(l.template_name || "")} · ${l.content?.from ? esc(l.content.from) : "?"} → ${l.content?.to ? esc(l.content.to) : "?"} · ${l.views} views${l.visibility === "private" ? " · private" : ""}</span>${l.contact ? `<br><span class="muted">Contact: ${esc(l.contact)}</span>` : ""}</td>
     <td>${esc(l.plan_name || "")}<br><span class="muted">${money(l.price_idr)}${(l.addons || []).length ? " · " + esc(l.addons.join(", ")) : ""}</span></td>
     <td><span class="pill">${ORD[l.order_status] || l.order_status}</span></td><td>${l.expires_at ? dt(l.expires_at) : "Never"}</td>
     <td style="white-space:nowrap"><a class="btn ghost sm" href="../letter/${esc(l.public_id)}" target="_blank" rel="noopener">Open</a>
      ${l.order_status === "pending_payment" ? `<button class="btn sm" data-set="${l.id}" data-v="paid">Mark paid</button>` : ""}
      ${l.order_status !== "cancelled" ? `<button class="btn ghost sm" data-set="${l.id}" data-v="cancelled">Cancel</button>` : `<button class="btn ghost sm" data-set="${l.id}" data-v="pending_payment">Reopen</button>`}
      <button class="btn ghost sm" data-ext="${l.id}">+30 days</button><button class="btn ghost sm" data-vis="${l.id}" data-v="${l.visibility === "public" ? "private" : "public"}">${l.visibility === "public" ? "Hide" : "Show"}</button><button class="btn ghost sm" data-del="${l.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>
    <div style="display:flex;justify-content:space-between;margin-top:1rem"><button class="btn ghost sm" id="pp" ${st.page ? "" : "disabled"}>← Newer</button><span class="muted">${count} total</span><button class="btn ghost sm" id="pn" ${(st.page + 1) * PER >= count ? "disabled" : ""}>Older →</button></div>`
    : `<div class="empty"><strong>No letters yet</strong>Letters made by visitors appear here.</div>`}
   <p class="muted" style="font-size:.8125rem;margin-top:1rem">Payment is confirmed by hand for now: when a customer pays, press <em>Mark paid</em>; the link then activates and the plan period starts. A payment gateway can later call the same <code>admin_letter_set_order</code> function from an Edge Function (see docs/LETTERS.md). Photos uploaded to a deleted letter stay in the <code>letter-media</code> bucket until you remove them in Supabase Storage.</p>`;
  const redo = (p) => letters(el, root, { ...st, ...p });
  $("#lst", el).onchange = (e) => redo({ status: e.target.value, page: 0 });
  const pp = $("#pp", el), pn = $("#pn", el); if (pp) pp.onclick = () => redo({ page: st.page - 1 }); if (pn) pn.onclick = () => redo({ page: st.page + 1 });
  $$("[data-set]", el).forEach((b) => b.onclick = () => busy(b, async () => { must(await sb.rpc("admin_letter_set_order", { p_id: b.dataset.set, p_order: b.dataset.v })); toast("Updated.", "ok"); redo({}); }));
  $$("[data-ext]", el).forEach((b) => b.onclick = () => busy(b, async () => { must(await sb.rpc("admin_letter_extend", { p_id: b.dataset.ext, p_days: 30 })); toast("Extended by 30 days.", "ok"); redo({}); }));
  $$("[data-vis]", el).forEach((b) => b.onclick = () => busy(b, async () => { must(await sb.from("letters").update({ visibility: b.dataset.v }).eq("id", b.dataset.vis)); redo({}); }));
  $$("[data-del]", el).forEach((b) => b.onclick = () => confirm("Delete this letter permanently? Its link will stop working.") && busy(b, async () => { must(await sb.from("letters").delete().eq("id", b.dataset.del)); toast("Deleted.", "ok"); redo({}); }));
}

/* ---------- templates ---------- */
async function templates(el) {
  const [cats, tpls] = await Promise.all([sb.from("letter_categories").select("slug,name").order("sort_order").then(must), sb.from("letter_templates").select("*").order("sort_order").then(must)]);
  const form = (t) => { const d = t?.defaults || {}, th = d.theme || {}, o = t?.options || {};
    return `<form class="tf panel" data-slug="${esc(t?.slug || "")}" style="margin:0 0 .8rem"><div class="cols">${fld("name", t ? "Name" : "New template name", t?.name, { attrs: "required maxlength=80" })}${fld("slug", "Slug", t?.slug, { attrs: `required ${t ? "readonly" : ""}` })}
     ${fld("category_slug", "Category", t?.category_slug, { opts: cats.map((c) => [c.slug, c.name]) })}${fld("engine", "Animation engine", t?.engine || "envelope", { opts: ENGINES.map((x) => [x, x]) })}</div>
     ${fld("motion", "Motion profile (cover, kinetic type, text reveal, particles, finale)", d.motion || "", { opts: [["", "— Engine default (no profile) —"], ...Object.entries(PROFILES).map(([k, v]) => [k, `${v.label}${v.slug === t?.slug ? " ★" : ""}`])] })}
     ${fld("tagline", "Tagline", t?.tagline, { attrs: "maxlength=200" })}
     <div class="cols">${fld("tier", "Tier", t?.tier || "free", { opts: [["free", "Free"], ["premium", "Premium"]] })}${fld("price_idr", "Template price (IDR, premium only)", t?.price_idr ?? 0, { type: "number", attrs: 'min="0"' })}${fld("tags", "Themes (comma separated: romantic, cute, elegant, playful, minimal, dark)", (t?.tags || []).join(", "))}${fld("sort_order", "Order", t?.sort_order ?? 100, { type: "number" })}</div>
     ${fld("thumbnail_url", "Thumbnail image URL (optional — otherwise an animated mini scene is drawn)", t?.thumbnail_url, { attrs: 'type="url"' })}
     <h3 style="font-size:1rem;margin:1rem 0 .4rem">Starting content</h3>${fld("title", "Default title", d.title)}${fld("message", "Default message", d.message, { area: 5, attrs: "maxlength=4000" })}
     <div class="cols">${[["primary", "Main"], ["accent", "Accent"], ["bg", "Background"], ["paper", "Paper"]].map(([k, l]) => fld("c_" + k, l + " colour", th[k] || "#888888", { type: "color" })).join("")}${fld("font", "Font", d.font || "serif", { opts: FONTS.map((x) => [x, x]) })}${fld("lang", "Language", d.lang || "id", { opts: [["id", "Indonesian"], ["en", "English"]] })}</div>
     <p class="muted" style="margin:.6rem 0 .2rem">Effects this template offers (all start switched on)</p>${picks("fx", FX, o.effects || d.effects || ["opening", "typing", "gallery", "closing"])}<p class="muted" style="margin:.6rem 0 .2rem">Decorations offered</p>${picks("dec", DEC, o.decor || d.decor || [])}
     <div style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center;margin-top:1rem">${chk("is_active", "Visible", t ? t.is_active : true)}${chk("is_featured", "Featured on the home page", t?.is_featured)}<button class="btn sm" value="save">${t ? "Save" : "Add template"}</button>${t ? '<button class="btn ghost sm" value="del">Delete</button>' : ""}</div></form>`; };
  el.innerHTML = `<p class="muted" style="font-size:.875rem">A template = an animation engine + starting content + price. To make a new look, duplicate a row with another engine, colours and text. New engines are added in <code>js/letter/engines.js</code> (see docs/LETTERS.md). Letters already made keep working if you hide or delete their template.</p>${tpls.map(form).join("")}<h2 style="font-size:1.1rem;margin:1.5rem 0 .6rem">Add a template</h2>${form(null)}`;
  $$("form.tf", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); const b = e.submitter, slug0 = f.dataset.slug;
    if (b.value === "del") { if (!confirm("Delete this template? Existing letters keep working.")) return; return busy(b, async () => { must(await sb.from("letter_templates").delete().eq("slug", slug0)); toast("Deleted.", "ok"); reload("templates"); }); }
    busy(b, async () => {
      const g = (n) => f.elements[n], slug = (g("slug").value || slugify(g("name").value)).trim(); if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Slug may only contain a–z, 0–9 and dashes.");
      const fx = ticked(f, "fx"), dec = ticked(f, "dec"), theme = { primary: g("c_primary").value, accent: g("c_accent").value, bg: g("c_bg").value, paper: g("c_paper").value };
      if (!g("message").value.trim()) throw new Error("Add a default message.");
      const row = { slug, name: g("name").value.trim(), category_slug: g("category_slug").value, engine: g("engine").value, tagline: g("tagline").value.trim() || null, tier: g("tier").value, price_idr: g("tier").value === "premium" ? +g("price_idr").value || 0 : 0,
        tags: csvOf(g("tags").value), sort_order: +g("sort_order").value || 0, thumbnail_url: g("thumbnail_url").value.trim() || null, is_active: g("is_active").checked, is_featured: g("is_featured").checked, updated_at: new Date().toISOString(),
        defaults: { ...(tpls.find((x) => x.slug === slug0)?.defaults || {}), title: g("title").value.trim(), message: g("message").value, from: "", to: "", lang: g("lang").value, font: g("font").value, theme, effects: fx, decor: dec, motion: g("motion").value || undefined }, options: { effects: fx, decor: dec } };
      if (slug0) must(await sb.from("letter_templates").update(row).eq("slug", slug0)); else must(await sb.from("letter_templates").insert(row));
      toast("Saved.", "ok"); reload("templates"); }); });
}

/* ---------- categories ---------- */
async function categories(el) {
  const cats = must(await sb.from("letter_categories").select("*").order("sort_order"));
  const row = (c) => `<form class="cf panel" data-slug="${esc(c?.slug || "")}" style="margin:0 0 .8rem"><div class="cols">${fld("name", c ? "Name" : "New category", c?.name, { attrs: "required maxlength=60" })}${fld("slug", "Slug", c?.slug, { attrs: `required ${c ? "readonly" : ""}` })}${fld("icon", "Icon (1 character)", c?.icon, { attrs: "maxlength=2" })}${fld("sort_order", "Order", c?.sort_order ?? 100, { type: "number" })}</div>
    ${fld("description", "Description", c?.description, { attrs: "maxlength=240" })}<div style="display:flex;gap:1.2rem;align-items:center">${chk("is_active", "Visible", c ? c.is_active : true)}<button class="btn sm" value="save">${c ? "Save" : "Add"}</button>${c ? '<button class="btn ghost sm" value="del">Delete</button>' : ""}</div></form>`;
  el.innerHTML = `<p class="muted" style="font-size:.875rem">A category can only be deleted once no template uses it; hide it instead.</p>${cats.map(row).join("")}<h2 style="font-size:1.1rem;margin:1.5rem 0 .6rem">Add a category</h2>${row(null)}`;
  $$("form.cf", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); const b = e.submitter, s0 = f.dataset.slug;
    if (b.value === "del") { if (!confirm("Delete this category?")) return; return busy(b, async () => { must(await sb.from("letter_categories").delete().eq("slug", s0)); toast("Deleted.", "ok"); reload("categories"); }); }
    busy(b, async () => { const nm = f.elements.name.value.trim(), slug = (f.slug.value || slugify(nm)).trim(); if (!nm) throw new Error("Name is required."); if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Slug may only contain a–z, 0–9 and dashes.");
      const r = { slug, name: nm, icon: f.icon.value.trim() || null, sort_order: +f.sort_order.value || 0, description: f.description.value.trim() || null, is_active: f.is_active.checked };
      if (s0) must(await sb.from("letter_categories").update(r).eq("slug", s0)); else must(await sb.from("letter_categories").insert(r)); toast("Saved.", "ok"); reload("categories"); }); });
}

/* ---------- plans & add-ons ---------- */
async function pricing(el) {
  const [plans, addons] = await Promise.all([sb.from("letter_plans").select("*").order("sort_order").then(must), sb.from("letter_addons").select("*").then(must)]);
  const prow = (p) => `<form class="pf panel" data-id="${p?.id || ""}" style="margin:0 0 .8rem"><div class="cols">${fld("name", p ? "Plan name" : "New plan", p?.name, { attrs: "required maxlength=60" })}${fld("days", "Active for (days, empty = forever)", p?.days ?? "", { type: "number", attrs: 'min="1" max="3650"' })}${fld("price_idr", "Price (IDR)", p?.price_idr ?? 0, { type: "number", attrs: 'min="0"' })}${fld("sort_order", "Order", p?.sort_order ?? 100, { type: "number" })}</div>
    ${fld("description", "Description", p?.description, { attrs: "maxlength=160" })}<div style="display:flex;gap:1.2rem;align-items:center">${chk("is_active", "Visible", p ? p.is_active : true)}<button class="btn sm" value="save">${p ? "Save" : "Add"}</button>${p ? '<button class="btn ghost sm" value="del">Delete</button>' : ""}</div></form>`;
  const arow = (a) => `<form class="af panel" data-key="${a.key}" style="margin:0 0 .8rem"><div class="cols">${fld("name", `Add-on “${a.key}”`, a.name, { attrs: "required" })}${fld("price_idr", "Price (IDR)", a.price_idr, { type: "number", attrs: 'min="0"' })}</div>${fld("description", "Description", a.description)}<div style="display:flex;gap:1.2rem;align-items:center">${chk("is_active", "Available", a.is_active)}<button class="btn sm">Save</button></div></form>`;
  el.innerHTML = `<h2 style="font-size:1.1rem">Duration plans</h2><p class="muted" style="font-size:.875rem">The total a customer pays = premium template price + plan price + add-ons. A total of 0 activates the link immediately; anything above 0 waits for you to mark it paid. Keep at least one free plan if you want free letters.</p>${plans.map(prow).join("")}<h3 style="margin:1rem 0 .5rem">Add a plan</h3>${prow(null)}
   <h2 style="font-size:1.1rem;margin-top:2rem">Add-ons</h2>${addons.map(arow).join("")}`;
  $$("form.pf", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); const b = e.submitter, id = f.dataset.id;
    if (b.value === "del") { if (!confirm("Delete this plan? Past letters keep their plan name.")) return; return busy(b, async () => { must(await sb.from("letter_plans").delete().eq("id", id)); toast("Deleted.", "ok"); reload("pricing"); }); }
    busy(b, async () => { const r = { name: f.elements.name.value.trim(), days: f.days.value === "" ? null : +f.days.value, price_idr: +f.price_idr.value || 0, sort_order: +f.sort_order.value || 0, description: f.description.value.trim() || null, is_active: f.is_active.checked };
      if (!r.name) throw new Error("Name is required."); if (id) must(await sb.from("letter_plans").update(r).eq("id", id)); else must(await sb.from("letter_plans").insert(r)); toast("Saved.", "ok"); reload("pricing"); }); });
  $$("form.af", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => { must(await sb.from("letter_addons").update({ name: f.elements.name.value.trim(), price_idr: +f.price_idr.value || 0, description: f.description.value.trim() || null, is_active: f.is_active.checked }).eq("key", f.dataset.key)); toast("Saved.", "ok"); reload("pricing"); }); });
}
