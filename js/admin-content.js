import { sb, esc, toast, fld, chk, lines, unlines, csv, num, getPath, setPath, uploadPublic, busy, must } from "./admin-lib.js";
import { $, $$, money, slugify, uid, STATUS, fmtDate } from "./util.js";
import { validateTheme, FONT_CHOICES } from "./theme.js";
import { GUIDE } from "./payment-guide.js";

const SVC_CATS = ["Model", "Animation", "Texturing", "Rigging", "UGC", "Other"];
const swapOrder = async (table, a, b) => { await sb.from(table).update({ sort_order: b.sort_order }).eq("id", a.id); await sb.from(table).update({ sort_order: a.sort_order }).eq("id", b.id); };

/* ================= SERVICES ================= */
const friendly = (e) => { if (/slug_key/.test(e?.message || "")) return new Error("That URL slug is already used by another item. Change the slug field (or edit the existing item from the list)."); return e; };
export async function viewServices(el, id) { return id ? svcEdit(el, id) : svcList(el); }
async function svcList(el) {
  const d = must(await sb.from("services").select("*").order("sort_order"));
  el.innerHTML = `<div class="bar"><h1>Services & pricing</h1><a class="btn sm" href="#/services/new">New service</a></div>
  ${d.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Order</th><th>Service</th><th>State</th><th>Availability</th><th>Home</th><th></th></tr></thead><tbody>${d.map((s, i) => `<tr><td><button class="linkbtn" data-mv="-1" data-i="${i}" ${i ? "" : "disabled"} aria-label="Move up">↑</button> <button class="linkbtn" data-mv="1" data-i="${i}" ${i < d.length - 1 ? "" : "disabled"} aria-label="Move down">↓</button></td>
    <td><a href="#/services/${s.id}"><strong>${esc(s.name)}</strong></a><div class="muted">${esc(s.category)} · ${s.custom_quote ? "Quotation" : s.price_min != null ? money(s.price_min) : "No price"}</div></td>
    <td><span class="pill s-${esc(s.publish_state)}">${esc(s.publish_state)}</span></td><td><span class="pill s-${esc(s.status)}">${esc(s.status.replace("_", " "))}</span></td><td>${s.is_featured ? "★" : ""}</td>
    <td style="white-space:nowrap"><button class="btn ghost sm" data-dup="${i}">Duplicate</button> <button class="btn ghost sm" data-arch="${i}" ${s.publish_state === "archived" ? "disabled" : ""}>Archive</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><strong>No services</strong>Create one to get started.</div>'}`;
  $$("[data-mv]", el).forEach((b) => b.onclick = () => busy(b, async () => { const i = +b.dataset.i, j = i + +b.dataset.mv; await swapOrder("services", d[i], d[j]); svcList(el); }));
  $$("[data-arch]", el).forEach((b) => b.onclick = () => confirm("Archive this service? It disappears from the public site; existing orders keep their snapshots.") && busy(b, async () => { must(await sb.from("services").update({ publish_state: "archived" }).eq("id", d[+b.dataset.arch].id)); svcList(el); }));
  $$("[data-dup]", el).forEach((b) => b.onclick = () => busy(b, async () => {
    const s = d[+b.dataset.dup], full = must(await sb.from("services").select("*, service_tiers(*), service_addons(*)").eq("id", s.id).single());
    const { id: _i, created_at, updated_at, service_tiers, service_addons, ...rest } = full;
    const n = must(await sb.from("services").insert({ ...rest, name: s.name + " (copy)", slug: s.slug + "-copy-" + uid().slice(0, 4), publish_state: "draft", sort_order: Math.max(...d.map((x) => x.sort_order)) + 10 }).select().single());
    if (service_tiers.length) must(await sb.from("service_tiers").insert(service_tiers.map(({ id, created_at, updated_at, service_id, ...t }) => ({ ...t, service_id: n.id }))));
    if (service_addons.length) must(await sb.from("service_addons").insert(service_addons.map(({ id, created_at, updated_at, service_id, ...t }) => ({ ...t, service_id: n.id }))));
    toast("Duplicated as draft.", "ok"); location.hash = "#/services/" + n.id;
  }));
}
async function svcEdit(el, id) {
  let isNew = id === "new";
  const s = isNew ? { name: "", slug: "", category: "Model", summary: "", description: "", cover_url: "", cover_alt: "", price_min: null, price_max: null, custom_quote: true, deliverables: [], includes: [], excludes: [], turnaround: "", revisions_included: null, status: "available", publish_state: "draft", is_featured: false, sort_order: 999, brief_fields: [], service_tiers: [], service_addons: [] }
    : must(await sb.from("services").select("*, service_tiers(*), service_addons(*)").eq("id", id).single());
  const tiers = s.service_tiers.sort((a, b) => a.sort_order - b.sort_order), addons = s.service_addons.sort((a, b) => a.sort_order - b.sort_order), bf = [...s.brief_fields];
  const rows = (arr, kind) => arr.map((r, i) => kind === "tier" ? `<div class="rowedit" data-kind="tier" data-i="${i}">${fld("t_name_" + i, "Tier", r.name)}${fld("t_min_" + i, "Min", r.price_min ?? "", { type: "number", attrs: 'min="0"' })}${fld("t_max_" + i, "Max", r.price_max ?? "", { type: "number", attrs: 'min="0"' })}${fld("t_ta_" + i, "Turnaround", r.turnaround ?? "")}<button type="button" class="btn danger sm" data-rm="tier:${i}">✕</button></div>`
    : kind === "addon" ? `<div class="rowedit" data-kind="addon" data-i="${i}">${fld("a_name_" + i, "Add-on", r.name)}${fld("a_price_" + i, "Price", r.price, { type: "number", attrs: 'min="0"' })}${fld("a_desc_" + i, "Description", r.description ?? "")}<button type="button" class="btn danger sm" data-rm="addon:${i}">✕</button></div>`
    : `<div class="rowedit" data-kind="bf" data-i="${i}">${fld("b_key_" + i, "Key", r.key)}${fld("b_label_" + i, "Label", r.label)}${fld("b_type_" + i, "Type", r.type, { opts: [["text", "Text"], ["textarea", "Long text"]] })}${chk("b_req_" + i, "Required", r.required)}<button type="button" class="btn danger sm" data-rm="bf:${i}">✕</button></div>`).join("");
  const draw = () => {
    el.innerHTML = `<div class="bar"><div><a class="muted" href="#/services">← Services</a><h1 style="margin:.3rem 0 0">${isNew ? "New service" : esc(s.name)}</h1></div></div>
    <form id="sf"><div class="panel"><h2>Basics</h2><div class="cols">${fld("name", "Name", s.name, { req: 1, attrs: "required" })}${fld("slug", "URL slug", s.slug, { req: 1, hint: "lowercase letters, numbers, dashes" })}${fld("category", "Category", s.category, { opts: SVC_CATS.map((c) => [c, c]) })}${fld("turnaround", "Turnaround (only if decided)", s.turnaround ?? "")}${fld("revisions_included", "Revisions included", s.revisions_included ?? "", { type: "number", attrs: 'min="0"' })}</div>
      ${fld("summary", "Short summary", s.summary ?? "", { area: 2 })}${fld("description", "Full description", s.description ?? "", { area: 6 })}
      <div class="field"><label for="cov">Cover image</label><input class="input" id="cov" type="file" accept="image/*">${s.cover_url ? `<img class="thumb-s" src="${esc(s.cover_url)}" alt="" style="margin-top:.5rem">` : ""}</div>${fld("cover_alt", "Cover alt text", s.cover_alt ?? "")}</div>
    <div class="panel"><h2>Price & publishing</h2><div class="cols">${chk("custom_quote", "Quotation only (no automatic price)", s.custom_quote)}${fld("price_min", "Base min price", s.price_min ?? "", { type: "number", attrs: 'min="0"', hint: "Used when no tier is chosen" })}${fld("price_max", "Base max price", s.price_max ?? "", { type: "number", attrs: 'min="0"' })}
      ${fld("publish_state", "Publish state", s.publish_state, { opts: [["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]] })}${fld("status", "Availability", s.status, { opts: [["available", "Available"], ["coming_soon", "Coming soon"], ["unavailable", "Unavailable"]] })}${chk("is_featured", "Show on homepage", s.is_featured)}</div>
      <p class="muted" style="font-size:.8rem">Price changes affect new orders only. Existing orders keep their saved snapshot.</p></div>
    <div class="panel"><h2>Deliverables / included / not included</h2><div class="cols">${fld("deliverables", "Deliverables (one per line)", lines(s.deliverables), { area: 5 })}${fld("includes", "Included (one per line)", lines(s.includes), { area: 5 })}${fld("excludes", "Not included (one per line)", lines(s.excludes), { area: 5 })}</div></div>
    <div class="panel"><h2>Tiers</h2>${rows(tiers, "tier")}<button type="button" class="btn ghost sm" data-add="tier">Add tier</button></div>
    <div class="panel"><h2>Add-ons</h2>${rows(addons, "addon")}<button type="button" class="btn ghost sm" data-add="addon">Add add-on</button></div>
    <div class="panel"><h2>Extra brief fields</h2><p class="muted" style="font-size:.85rem">Shown on the order form for this service (e.g. UGC: accessory type, target avatar).</p>${rows(bf, "bf")}<button type="button" class="btn ghost sm" data-add="bf">Add field</button></div>
    <button class="btn" id="save">Save service</button></form>`;
    $$("[data-add]", el).forEach((b) => b.onclick = () => { sync(); ({ tier: () => tiers.push({ name: "", price_min: null, price_max: null, turnaround: "", sort_order: tiers.length + 1, is_active: true }), addon: () => addons.push({ name: "", price: 0, description: "", sort_order: addons.length + 1, is_active: true }), bf: () => bf.push({ key: "", label: "", type: "text", required: false }) })[b.dataset.add](); draw(); });
    $$("[data-rm]", el).forEach((b) => b.onclick = () => { sync(); const [k, i] = b.dataset.rm.split(":"); ({ tier: tiers, addon: addons, bf })[k].splice(+i, 1); draw(); });
    $("#sf").onsubmit = (e) => { e.preventDefault(); save(); };
  };
  const sync = () => { const f = $("#sf"); if (!f) return;
    tiers.forEach((t, i) => { t.name = f["t_name_" + i].value; t.price_min = num(f["t_min_" + i].value); t.price_max = num(f["t_max_" + i].value); t.turnaround = f["t_ta_" + i].value || null; t.sort_order = i + 1; });
    addons.forEach((a, i) => { a.name = f["a_name_" + i].value; a.price = +f["a_price_" + i].value || 0; a.description = f["a_desc_" + i].value || null; a.sort_order = i + 1; });
    bf.forEach((b, i) => { b.key = f["b_key_" + i].value; b.label = f["b_label_" + i].value; b.type = f["b_type_" + i].value; b.required = f["b_req_" + i].checked; }); };
  const save = () => busy($("#save"), async () => {
    sync(); const f = $("#sf"), errs = [];
    const row = { name: f.name.value.trim(), slug: (f.slug.value || slugify(f.name.value)).trim(), category: f.category.value, summary: f.summary.value || null, description: f.description.value || null, turnaround: f.turnaround.value || null, revisions_included: num(f.revisions_included.value),
      custom_quote: f.custom_quote.checked, price_min: num(f.price_min.value), price_max: num(f.price_max.value), publish_state: f.publish_state.value, status: f.status.value, is_featured: f.is_featured.checked, cover_alt: f.cover_alt.value || null,
      deliverables: unlines(f.deliverables.value), includes: unlines(f.includes.value), excludes: unlines(f.excludes.value), brief_fields: bf.filter((b) => b.key && b.label), cover_url: s.cover_url || null };
    if (!row.name) errs.push("Name is required."); if (!/^[a-z0-9-]+$/.test(row.slug)) errs.push("Slug may only contain a–z, 0–9 and dashes.");
    if (row.price_min != null && row.price_max != null && row.price_max < row.price_min) errs.push("Base max price is below min.");
    tiers.forEach((t) => { if (!t.name) errs.push("Every tier needs a name."); if (t.price_min != null && t.price_max != null && t.price_max < t.price_min) errs.push(`Tier "${t.name}": max below min.`); });
    if (row.publish_state === "published" && !row.custom_quote && row.price_min == null && !tiers.some((t) => t.price_min != null)) errs.push("Set a price (or tick Quotation only) before publishing.");
    if (errs.length) throw new Error([...new Set(errs)].join(" "));
    const file = $("#cov").files[0]; if (file) row.cover_url = await uploadPublic(file, "services");
    let sid = s.id;
    if (isNew) { sid = must(await sb.from("services").insert(row).select("id").single()).id; s.id = sid; isNew = false; } else must(await sb.from("services").update(row).eq("id", sid));
    for (const [table, list, orig] of [["service_tiers", tiers, s.service_tiers], ["service_addons", addons, s.service_addons]]) {
      const keep = list.filter((x) => x.id).map((x) => x.id), gone = orig.filter((x) => x.id && !keep.includes(x.id)).map((x) => x.id);
      if (gone.length) must(await sb.from(table).delete().in("id", gone));
      for (const x of list) { const { created_at, updated_at, ...rest } = x; must(await sb.from(table).upsert({ ...rest, service_id: sid })); }
    }
    toast("Saved.", "ok"); location.hash = "#/services";
  });
  draw();
}

/* ================= PORTFOLIO ================= */
export async function viewPortfolio(el, id) { return id ? pfEdit(el, id) : pfList(el); }
async function pfList(el) {
  const d = must(await sb.from("portfolio_projects").select("*").order("sort_order"));
  el.innerHTML = `<div class="bar"><h1>Portfolio</h1><a class="btn sm" href="#/portfolio/new">New project</a></div>
  ${d.length ? `<div class="tablewrap"><table class="t"><tbody>${d.map((p, i) => `<tr><td><button class="linkbtn" data-mv="-1" data-i="${i}" ${i ? "" : "disabled"}>↑</button> <button class="linkbtn" data-mv="1" data-i="${i}" ${i < d.length - 1 ? "" : "disabled"}>↓</button></td>
   <td>${p.cover_url ? `<img class="thumb-s" src="${esc(p.cover_url)}" alt="">` : ""}</td><td><a href="#/portfolio/${p.id}"><strong>${esc(p.title)}</strong></a><div class="muted">${esc(p.category)}${p.is_featured ? " · ★ featured" : ""}</div></td><td><span class="pill s-${esc(p.status)}">${esc(p.status)}</span></td>
   <td style="white-space:nowrap">${p.status === "published" ? `<button class="btn ghost sm" data-st="draft" data-i="${i}">Unpublish</button>` : `<button class="btn sm" data-st="published" data-i="${i}">Publish</button>`} <button class="btn ghost sm" data-st="archived" data-i="${i}" ${p.status === "archived" ? "disabled" : ""}>Archive</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><strong>No projects</strong></div>'}`;
  $$("[data-mv]", el).forEach((b) => b.onclick = () => busy(b, async () => { const i = +b.dataset.i; await swapOrder("portfolio_projects", d[i], d[i + +b.dataset.mv]); pfList(el); }));
  $$("[data-st]", el).forEach((b) => b.onclick = () => busy(b, async () => { const p = d[+b.dataset.i]; if (b.dataset.st === "published" && !p.cover_url && !confirm("This project has no cover image. Publish anyway?")) return; must(await sb.from("portfolio_projects").update({ status: b.dataset.st }).eq("id", p.id)); pfList(el); }));
}
async function pfEdit(el, id) {
  let isNew = id === "new";
  const p = isNew ? { title: "", slug: "", category: "Model", summary: "", description: "", software: [], service_types: [], specs: {}, cover_url: "", cover_alt: "", badge: "", external_url: "", status: "draft", is_featured: false, sort_order: 999, portfolio_media: [] }
    : must(await sb.from("portfolio_projects").select("*, portfolio_media(*)").eq("id", id).single());
  const media = p.portfolio_media.sort((a, b) => a.sort_order - b.sort_order);
  const draw = () => {
    el.innerHTML = `<div class="bar"><div><a class="muted" href="#/portfolio">← Portfolio</a><h1 style="margin:.3rem 0 0">${isNew ? "New project" : esc(p.title)}</h1></div></div>
    <form id="pf"><div class="panel"><h2>Details</h2><div class="cols">${fld("title", "Title", p.title, { req: 1, attrs: "required" })}${fld("slug", "URL slug", p.slug, { hint: "auto from title if empty" })}${fld("category", "Category", p.category, { attrs: 'list="cats"' })}<datalist id="cats">${["Game", "Model", "Animation", "UGC", "Texturing", "Rigging"].map((c) => `<option value="${c}">`).join("")}</datalist>${fld("badge", "Badge (optional)", p.badge ?? "")}
      ${fld("software", "Software (comma separated)", p.software.join(", "))}${fld("service_types", "Services used (comma separated)", p.service_types.join(", "))}${fld("external_url", "External link", p.external_url ?? "", { type: "url" })}${fld("status", "Status", p.status, { opts: [["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]] })}${chk("is_featured", "Featured", p.is_featured)}</div>
      ${fld("summary", "Summary", p.summary ?? "", { area: 2 })}${fld("description", "Description", p.description ?? "", { area: 5 })}${fld("specs", "Specs (key: value, one per line)", Object.entries(p.specs || {}).map(([k, v]) => `${k}: ${v}`).join("\n"), { area: 3 })}</div>
    <div class="panel"><h2>Cover</h2><input class="input" id="cov" type="file" accept="image/*">${p.cover_url ? `<img class="thumb-s" src="${esc(p.cover_url)}" alt="" style="margin-top:.5rem">` : ""}${fld("cover_alt", "Cover alt text", p.cover_alt ?? "")}</div>
    <div class="panel"><h2>Images & 3D models</h2>${media.map((m, i) => `<div class="rowedit" data-i="${i}">${m.kind === "image" ? `<img class="thumb-s" src="${esc(m.url)}" alt="">` : '<span class="pill">GLB</span>'}${fld("m_alt_" + i, "Alt text", m.alt ?? "")}<div style="display:flex;gap:.3rem"><button type="button" class="btn ghost sm" data-up="${i}">↑</button><button type="button" class="btn danger sm" data-rm="${i}">✕</button></div></div>`).join("")}
      <div class="field" style="margin-top:1rem"><label for="mf">Add images or a .glb model</label><input class="input" id="mf" type="file" accept="image/*,.glb" multiple></div></div>
    <button class="btn" id="save">Save project</button></form>`;
    $$("[data-rm]", el).forEach((b) => b.onclick = () => { sync(); media.splice(+b.dataset.rm, 1); draw(); });
    $$("[data-up]", el).forEach((b) => b.onclick = () => { sync(); const i = +b.dataset.up; if (i) [media[i - 1], media[i]] = [media[i], media[i - 1]]; draw(); });
    $("#pf").onsubmit = (e) => { e.preventDefault(); save(); };
  };
  const sync = () => { const f = $("#pf"); media.forEach((m, i) => { if (f["m_alt_" + i]) m.alt = f["m_alt_" + i].value || null; }); };
  const save = () => busy($("#save"), async () => {
    sync(); const f = $("#pf");
    const specs = Object.fromEntries(unlines(f.specs.value).map((l) => { const i = l.indexOf(":"); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(Boolean));
    const row = { title: f.title.value.trim(), slug: (f.slug.value || slugify(f.title.value)).trim(), category: f.category.value.trim() || "Model", badge: f.badge.value || null, software: csv(f.software.value), service_types: csv(f.service_types.value), external_url: f.external_url.value || null,
      status: f.status.value, is_featured: f.is_featured.checked, summary: f.summary.value || null, description: f.description.value || null, specs, cover_alt: f.cover_alt.value || null, cover_url: p.cover_url || null };
    if (!row.title) throw new Error("Title is required."); if (!/^[a-z0-9-]+$/.test(row.slug)) throw new Error("Slug may only contain a–z, 0–9 and dashes.");
    const cov = $("#cov").files[0]; if (cov) row.cover_url = await uploadPublic(cov, "portfolio");
    if (row.status === "published" && !row.cover_url && !confirm("No cover image. Publish anyway?")) return;
    let pid = p.id; if (isNew) { pid = must(await sb.from("portfolio_projects").insert(row).select("id").single()).id; p.id = pid; isNew = false; } else must(await sb.from("portfolio_projects").update(row).eq("id", pid));
    for (const file of $("#mf").files) media.push({ project_id: pid, kind: /\.glb$/i.test(file.name) ? "model" : "image", url: await uploadPublic(file, "portfolio"), alt: null });
    const keep = media.filter((m) => m.id).map((m) => m.id), gone = p.portfolio_media.filter((m) => !keep.includes(m.id)).map((m) => m.id);
    if (gone.length) must(await sb.from("portfolio_media").delete().in("id", gone));
    for (let i = 0; i < media.length; i++) { const { created_at, ...m } = media[i]; must(await sb.from("portfolio_media").upsert({ ...m, project_id: pid, sort_order: i })); }
    toast("Saved.", "ok"); location.hash = "#/portfolio";
  });
  draw();
}

/* ================= SITE EDITOR ================= */
const SECTION_LAYOUTS = { hero: ["split", "stacked"], pricing: ["table"], services: ["list"], portfolio: ["grid"], workflow: ["steps"], availability: ["banner"], faq: ["list"], contact: ["split"] };
export async function viewSite(el) {
  const pub = Object.fromEntries(must(await sb.from("site_settings").select("key,value")).map((r) => [r.key, r.value]));
  const dr = Object.fromEntries(must(await sb.from("site_settings_draft").select("key,value")).map((r) => [r.key, r.value]));
  const draft = structuredClone({ ...pub, ...dr }); let dirty = false, device = "100%";
  const input = (path, label, o = {}) => fld(path, label, getPath(draft, path) ?? "", { ...o, attrs: `data-path="${path}" ${o.type === "number" ? 'data-type="number"' : ""} ${o.attrs || ""}` });
  const check = (path, label) => `<label class="check field"><input type="checkbox" data-path="${path}" data-type="bool" ${getPath(draft, path) ? "checked" : ""}> ${esc(label)}</label>`;
  const upload = (path, label) => `<div class="field"><label>${label}</label>${getPath(draft, path) ? `<img class="thumb-s" src="${esc(getPath(draft, path))}" alt="" style="margin-bottom:.4rem;object-fit:contain">` : ""}<input class="input" type="file" accept="image/*" data-upload="${path}"></div>`;
  const list = (key, cols) => `<div>${(draft[key] || []).map((r, i) => `<div class="rowedit">${cols.map(([f, l, o]) => input(`${key}.${i}.${f}`, l, o)).join("")}<div style="display:flex;gap:.3rem"><button type="button" class="btn ghost sm" data-mv="${key}:${i}:-1">↑</button><button type="button" class="btn ghost sm" data-mv="${key}:${i}:1">↓</button><button type="button" class="btn danger sm" data-del="${key}:${i}">✕</button></div></div>`).join("")}<button type="button" class="btn ghost sm" data-addrow="${key}">Add</button></div>`;
  const panels = () => [
    ["Brand & logo", `${input("brand.name", "Studio name")}${input("brand.partner", "Partner studio")}${upload("brand.logo_url", "Logo")}${upload("brand.favicon_url", "Favicon")}<p class="muted" style="font-size:.8rem">Upload the real Dhandang Studio logo here when available — nothing is drawn or substituted.</p>`],
    ["Colours & type", `<div class="cols">${["bg:Background", "surface:Surface", "surface2:Surface 2", "text:Text", "muted:Muted text", "accent:Accent", "border:Border"].map((x) => { const [k, l] = x.split(":"); return input("theme." + k, l, { type: "color" }); }).join("")}</div>
      ${input("theme.font", "Font", { opts: FONT_CHOICES.map((f) => [f, f]) })}<div class="cols">${input("theme.body_size", "Body size (px)", { type: "number" })}${input("theme.heading_scale", "Heading scale", { type: "number", attrs: 'step="0.05"' })}${input("theme.container", "Container width (px)", { type: "number" })}${input("theme.radius", "Corner radius (px)", { type: "number" })}</div>${input("theme.button_style", "Button style", { opts: [["solid", "Solid"], ["outline", "Outline"]] })}`],
    ["Hero", `${input("hero.headline", "Headline")}${input("hero.description", "Description", { area: 3 })}${upload("hero.artwork_url", "Hero artwork")}${input("hero.artwork_alt", "Artwork alt text")}<div class="cols">${input("hero.cta_primary.label", "Primary button")}${input("hero.cta_primary.href", "Primary link")}${input("hero.cta_secondary.label", "Secondary button")}${input("hero.cta_secondary.href", "Secondary link")}</div>`],
    ["Sections (order, visibility, layout)", (draft.sections || []).map((s, i) => `<div class="rowedit"><strong style="align-self:center">${esc(s.id)}</strong>${check(`sections.${i}.visible`, "Visible")}${input(`sections.${i}.layout`, "Layout", { opts: (SECTION_LAYOUTS[s.id] || [s.layout]).map((l) => [l, l]) })}<div style="display:flex;gap:.3rem"><button type="button" class="btn ghost sm" data-mv="sections:${i}:-1">↑</button><button type="button" class="btn ghost sm" data-mv="sections:${i}:1">↓</button></div></div>`).join("")],
    ["Navigation & footer", `${list("nav", [["label", "Label"], ["href", "Link"]])}${input("footer.text", "Footer text")}`],
    ["Availability & contact", `${input("availability.status", "Commission status", { opts: [["open", "Open"], ["limited", "Limited slots"], ["closed", "Closed"]] })}${input("availability.note", "Note")}<div class="cols">${input("contact.email", "Email")}${input("contact.discord_url", "Discord invite URL")}${input("contact.whatsapp", "WhatsApp")}${input("contact.hours", "Hours")}${input("contact.location", "Location")}</div><h3 style="margin:1rem 0 .5rem;font-size:1rem">Social links</h3>${list("socials", [["label", "Label"], ["url", "URL"]])}`],
    ["About, workflow & FAQ", `${input("about.title", "About title")}${input("about.body", "About text", { area: 5 })}<h3 style="margin:1rem 0 .5rem;font-size:1rem">Workflow steps</h3>${list("workflow", [["title", "Title"], ["text", "Text"]])}<h3 style="margin:1rem 0 .5rem;font-size:1rem">FAQ</h3>${list("faq", [["q", "Question"], ["a", "Answer"]])}`],
    ["Price list & illustrations", `${upload("pricing.price_image_url", "Price list poster")}${input("pricing.price_image_alt", "Price list alt text")}${upload("pricing.illustration_image_url", "Service illustration")}${input("pricing.illustration_alt", "Illustration alt text")}<h3 style="margin:1rem 0 .5rem;font-size:1rem">Price notes</h3>${list("pricing_notes", [["text", "Note"]])}<p class="muted" style="font-size:.8rem">The live price table comes from <em>Services & pricing</em>. The posters are reference images.</p>`],
    ["Payments", `${input("payment.deposit_percent", "Deposit percentage (1-100)", { type: "number", attrs: 'min="1" max="100"' })}${input("payment.note", "Payment note shown to clients", { area: 3 })}${input("payment.qris_notice", "QRIS reminder")}<p class="muted" style="font-size:.8rem">Payment methods (bank, e-wallet, QRIS) are managed under <a href="#/payments">Payments</a>. The deposit amount is always calculated on the server from the quoted total.</p>`],
    ["Orders & commission terms", `<div class="cols">${input("order.currency", "Currency (ISO code)")}${input("order.min_budget", "Minimum budget", { type: "number" })}${input("order.max_files", "Max files per order", { type: "number" })}${input("order.max_file_mb", "Max file size (MB)", { type: "number" })}</div>${input("order.terms", "Commission terms", { area: 4 })}${input("order.revision_info", "Revision information", { area: 3 })}${check("order.fx_disabled", "Hide the IDR/USD toggle (no live USD conversion)")}${check("order.confirm_discord", "Offer Discord contact after ordering")}${check("order.confirm_whatsapp", "Offer WhatsApp contact after ordering")}<p class="muted" style="font-size:.8rem">Server-side limits (10 MB, image/PDF only) are enforced by the storage bucket regardless of these values. Notifications by email/Discord are not connected yet.</p>`],
    ["Maintenance & SEO", `${check("maintenance.enabled", "Maintenance mode (public pages show the message; /admin keeps working)")}${input("maintenance.message", "Maintenance message")}${input("seo.title", "Default page title")}${input("seo.description", "Default description", { area: 2 })}${upload("seo.og_image", "Share image (Open Graph)")}`],
  ];
  const openIdx = new Set([0]);
  const draw = () => {
    el.innerHTML = `<div class="bar"><h1>Site editor</h1><div style="display:flex;gap:.5rem;flex-wrap:wrap"><span class="pill" id="dirty">${dirty ? "Unsaved changes" : "Saved"}</span><button class="btn ghost sm" id="hist">History</button><button class="btn danger sm" id="disc">Discard draft</button><button class="btn ghost sm" id="sv">Save draft</button><button class="btn sm" id="pb">Publish</button></div></div>
    <div class="split"><div>${panels().map(([t, h], i) => `<details class="acc" data-i="${i}" ${openIdx.has(i) ? "open" : ""}><summary>${t}</summary><div>${h}</div></details>`).join("")}</div>
    <div class="preview"><div style="display:flex;gap:.4rem;margin-bottom:.5rem">${[["100%", "Desktop"], ["820px", "Tablet"], ["390px", "Mobile"]].map(([w, l]) => `<button class="chip" data-dev="${w}" aria-pressed="${device === w}">${l}</button>`).join("")}</div><iframe id="pv" title="Live preview" src="../index.html?preview=1" style="width:${device}"></iframe></div></div><div id="histbox"></div>`;
    $$("details.acc", el).forEach((d) => d.addEventListener("toggle", () => d.open ? openIdx.add(+d.dataset.i) : openIdx.delete(+d.dataset.i)));
    $$("[data-dev]", el).forEach((b) => b.onclick = () => { device = b.dataset.dev; $("#pv").style.width = device; $$("[data-dev]", el).forEach((x) => x.setAttribute("aria-pressed", x.dataset.dev === device)); });
    $("#pv").addEventListener("load", push);
    $$("[data-upload]", el).forEach((i) => i.onchange = async () => { try { setPath(draft, i.dataset.upload, await uploadPublic(i.files[0], "site")); mark(); draw(); } catch (e) { toast(e.message); } });
    $$("[data-mv]", el).forEach((b) => b.onclick = () => { const [k, i, d] = b.dataset.mv.split(":"), a = draft[k], j = +i + +d; if (j < 0 || j >= a.length) return; [a[+i], a[j]] = [a[j], a[+i]]; mark(); draw(); });
    $$("[data-del]", el).forEach((b) => b.onclick = () => { const [k, i] = b.dataset.del.split(":"); draft[k].splice(+i, 1); mark(); draw(); });
    $$("[data-addrow]", el).forEach((b) => b.onclick = () => { const k = b.dataset.addrow; (draft[k] ||= []).push(k === "pricing_notes" ? { text: "" } : k === "faq" ? { q: "", a: "" } : k === "workflow" ? { title: "", text: "" } : k === "nav" ? { label: "", href: "#/" } : { label: "", url: "https://" }); mark(); draw(); });
    $("#sv").onclick = () => busy($("#sv"), saveDraft); $("#pb").onclick = () => busy($("#pb"), publish); $("#disc").onclick = discard; $("#hist").onclick = history;
  };
  const push = () => $("#pv")?.contentWindow?.postMessage({ type: "kns-preview", settings: draft }, location.origin);
  const mark = () => { dirty = true; const d = $("#dirty"); if (d) d.textContent = "Unsaved changes"; push(); };
  el.oninput = el.onchange = (e) => { const t = e.target, p = t.dataset?.path; if (!p) return; let v = t.type === "checkbox" ? t.checked : t.value; if (t.dataset.type === "number") v = v === "" ? null : +v; setPath(draft, p, v); mark(); };
  const saveDraft = async () => { must(await sb.from("site_settings_draft").upsert(Object.entries(draft).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() })))); dirty = false; $("#dirty").textContent = "Draft saved"; toast("Draft saved.", "ok"); };
  const validate = () => {
    const e = [...validateTheme(draft.theme || {})];
    if (!draft.hero?.headline?.trim()) e.push("Hero headline is empty.");
    if (!/^[A-Z]{3}$/.test(draft.order?.currency || "")) e.push("Currency must be a 3-letter ISO code (e.g. IDR).");
    (draft.nav || []).forEach((n, i) => { if (!n.label?.trim() || !/^(#\/|https?:\/\/|\/)/.test(n.href || "")) e.push(`Navigation item ${i + 1} needs a label and a valid link.`); });
    (draft.socials || []).forEach((s, i) => { if (!/^https?:\/\//.test(s.url || "")) e.push(`Social link ${i + 1} needs an http(s) URL.`); });
    (draft.faq || []).forEach((q, i) => { if (!q.q?.trim() || !q.a?.trim()) e.push(`FAQ ${i + 1} needs both question and answer.`); });
    if (draft.contact?.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.contact.email)) e.push("Contact email is invalid.");
    const dp = draft.payment?.deposit_percent; if (!(dp >= 1 && dp <= 100)) e.push("Deposit percentage must be between 1 and 100.");
    if (!(draft.sections || []).some((s) => s.visible)) e.push("At least one homepage section must be visible.");
    return e;
  };
  const publish = async () => {
    const e = validate(); if (e.length) throw new Error(e.join(" "));
    const big = []; if (draft.maintenance?.enabled && !pub.maintenance?.enabled) big.push("turn ON maintenance mode");
    if (JSON.stringify(draft.theme) !== JSON.stringify(pub.theme)) big.push("change the colours/typography for every visitor");
    if (draft.availability?.status !== pub.availability?.status) big.push(`set commissions to “${draft.availability.status}”`);
    if (big.length && !confirm(`You are about to ${big.join(", ")}. Publish now?`)) return;
    await saveDraft(); must(await sb.rpc("publish_site_settings", { p_note: null })); Object.assign(pub, structuredClone(draft)); dirty = false; $("#dirty").textContent = "Published"; toast("Published. The public site is updated.", "ok");
  };
  const discard = async () => { if (!confirm("Replace your draft with the currently published settings?")) return; must(await sb.from("site_settings_draft").upsert(Object.entries(pub).map(([key, value]) => ({ key, value })))); viewSite(el); };
  const history = async () => {
    const v = must(await sb.from("site_settings_versions").select("id,note,created_at").order("id", { ascending: false }).limit(15));
    $("#histbox").innerHTML = `<div class="panel" style="margin-top:1rem"><h2>Published versions</h2>${v.length ? v.map((x) => `<div class="rowedit" style="grid-template-columns:1fr auto"><span>#${x.id} · ${esc(new Date(x.created_at).toLocaleString())} ${x.note ? "· " + esc(x.note) : ""}</span><button class="btn ghost sm" data-rb="${x.id}">Roll back</button></div>`).join("") : '<p class="muted">Nothing published yet.</p>'}</div>`;
    $$("[data-rb]", el).forEach((b) => b.onclick = () => confirm(`Roll back to version #${b.dataset.rb}? This republishes immediately.`) && busy(b, async () => { must(await sb.rpc("rollback_site_settings", { p_version: +b.dataset.rb })); toast("Rolled back.", "ok"); viewSite(el); }));
  };
  draw();
}


/* ================= PAYMENTS ================= */
export async function viewPayments(el) {
  const [methods, pend] = await Promise.all([
    sb.from("payment_methods").select("*").order("sort_order").then(must),
    sb.from("order_payments").select("id,kind,amount,currency,method_label,created_at,order_id,orders(reference,client_name)").eq("status", "pending").order("created_at").then(must),
  ]);
  const mform = (m) => { const n = !m.id, k = m.id || "new"; return `<form class="panel mf" data-id="${esc(m.id || "")}" data-qr="${esc(m.qris_image_url || "")}"><h2>${n ? "Add payment method" : esc(m.label) + ` <span class="pill">${esc(m.kind)}</span>`}</h2>
    <div class="cols">${fld("kind", "Type", m.kind || "bank", { opts: [["bank", "Bank transfer"], ["ewallet", "E-Wallet"], ["qris", "QRIS"]] })}${fld("label", "Label (e.g. BCA, DANA, QRIS Kanasa)", m.label || "", { req: 1, attrs: "required maxlength=60" })}
    ${fld("account_name", "Account name (as shown in the app)", m.account_name || "")}${fld("account_number", "Account / phone number", m.account_number || "")}${fld("sort_order", "Order", m.sort_order ?? 0, { type: "number" })}</div>
    <div class="field"><label>QRIS image (QRIS type only)</label>${m.qris_image_url ? `<img src="${esc(m.qris_image_url)}" alt="QRIS" style="width:9rem;background:#fff;padding:.4rem;margin-bottom:.4rem">` : ""}<input class="input" type="file" name="qr" accept="image/*"></div>
    ${fld("instructions", "Instructions shown to the client", m.instructions || "", { area: 3 })}${chk("is_active", "Active (visible to clients who owe a payment)", m.id ? m.is_active : true)}
    <button class="btn sm" value="save">${n ? "Add method" : "Save"}</button> ${n ? "" : '<button class="btn danger sm" value="del" type="submit">Delete</button>'}</form>`; };
  el.innerHTML = `<div class="bar"><h1>Payments</h1></div>
   <div class="panel"><h2>Payments waiting for verification (${pend.length})</h2>${pend.length ? `<table class="t"><tbody>${pend.map((x) => `<tr class="click" data-o="${x.order_id}"><td class="mono">${esc(x.orders?.reference)}</td><td>${esc(x.orders?.client_name)}</td><td>${x.kind === "deposit" ? "Deposit" : "Final"} ${money(x.amount, x.currency)}</td><td class="muted">${esc(x.method_label || "")}</td><td class="muted">${esc(fmtDate(x.created_at))}</td></tr>`).join("")}</tbody></table><p class="muted" style="font-size:.8rem">Click a row to open the order and verify the proof.</p>` : '<p class="muted">Nothing to verify.</p>'}</div>
   <p class="muted">Deposit percentage and the payment note are set in <a href="#/site">Site editor → Payments</a> (then Publish).</p>
   <h2 style="font-size:1.2rem;margin:2rem 0 1rem">Payment methods</h2>${methods.length ? "" : '<div class="notice">No methods yet. Clients cannot pay online until you add at least one. Add a bank account, e-wallet and/or QRIS below.</div>'}
   ${methods.map(mform).join("")}${mform({})}
   <h2 style="font-size:1.2rem;margin:2rem 0 1rem">Setup guide</h2>${GUIDE.map(([t, h], i) => `<details class="acc" ${i === 0 ? "open" : ""}><summary>${t}</summary><div>${h}</div></details>`).join("")}`;
  $$("tr[data-o]", el).forEach((tr) => tr.onclick = () => (location.hash = "#/orders/" + tr.dataset.o));
  $$("form.mf", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); const btn = e.submitter, id = f.dataset.id;
    if (btn.value === "del") { if (!confirm("Delete this payment method? Past payments keep their saved label.")) return; return busy(btn, async () => { must(await sb.from("payment_methods").delete().eq("id", id)); toast("Deleted.", "ok"); viewPayments(el); }); }
    busy(btn, async () => {
      const row = { kind: f.kind.value, label: f.label.value.trim(), account_name: f.account_name.value.trim() || null, account_number: f.account_number.value.trim() || null, instructions: f.instructions.value.trim() || null, is_active: f.is_active.checked, sort_order: +f.sort_order.value || 0, qris_image_url: f.dataset.qr || null };
      if (!row.label) throw new Error("Label is required.");
      if (row.kind !== "qris") row.qris_image_url = null;
      const file = f.qr.files[0]; if (file) { if (row.kind !== "qris") throw new Error("QRIS image is only for the QRIS type."); row.qris_image_url = await uploadPublic(file, "qris"); }
      if (row.kind === "qris" && !row.qris_image_url) throw new Error("Upload your QRIS image.");
      if (row.kind !== "qris" && !row.account_number) throw new Error("Enter the account / phone number.");
      if (id) must(await sb.from("payment_methods").update(row).eq("id", id)); else must(await sb.from("payment_methods").insert(row));
      toast("Saved.", "ok"); viewPayments(el);
    }); });
}
