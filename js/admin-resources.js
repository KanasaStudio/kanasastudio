import { sb, esc, toast, fld, chk, csv, uploadPublic, busy, must } from "./admin-lib.js";
import { $, $$, slugify } from "./util.js";

const PRICING = [["free", "Free"], ["freemium", "Free + paid"], ["paid", "Paid"]];
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export async function viewResources(el, id) { return id ? resEdit(el, id) : resList(el); }

async function resList(el) {
  const [cats, items] = await Promise.all([
    sb.from("resource_categories").select("*").order("sort_order").then(must),
    sb.from("resources").select("id,title,url,pricing,status,is_featured,category_id,sort_order").order("sort_order").then(must)]);
  const catName = (i) => cats.find((c) => c.id === i)?.name || "—";
  let fc = "", fs = "", fq = "";
  const draw = () => {
    const list = items.filter((r) => (!fc || r.category_id === fc) && (!fs || r.status === fs) && (!fq || `${r.title} ${r.url}`.toLowerCase().includes(fq)));
    $("#rlist").innerHTML = list.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Tool</th><th>Category</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>${list.map((r) => `<tr>
      <td><a href="#/resources/${r.id}"><strong>${esc(r.title)}</strong></a>${r.is_featured ? " ★" : ""}<div class="muted mono" style="font-size:.75rem">${esc(hostOf(r.url))}</div></td>
      <td>${esc(catName(r.category_id))}</td><td>${esc(r.pricing)}</td><td><span class="pill s-${esc(r.status)}">${esc(r.status)}</span></td>
      <td style="white-space:nowrap">${r.status === "published" ? `<button class="btn ghost sm" data-st="draft" data-id="${r.id}">Hide</button>` : `<button class="btn sm" data-st="published" data-id="${r.id}">Show</button>`} <button class="btn danger sm" data-del="${r.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty"><strong>No links</strong>Add one, or change the filters.</div>';
    $$("[data-st]", el).forEach((b) => b.onclick = () => busy(b, async () => { must(await sb.from("resources").update({ status: b.dataset.st }).eq("id", b.dataset.id)); resList(el); }));
    $$("[data-del]", el).forEach((b) => b.onclick = () => confirm("Delete this link?") && busy(b, async () => { must(await sb.from("resources").delete().eq("id", b.dataset.del)); resList(el); }));
  };
  el.innerHTML = `<div class="bar"><h1>Creator tools</h1><a class="btn sm" href="#/resources/new">Add a link</a></div>
    <div class="filters" style="margin-bottom:1rem"><select class="input" id="fc" aria-label="Category" style="max-width:14rem"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <select class="input" id="fs" aria-label="Status" style="max-width:10rem"><option value="">All statuses</option><option>draft</option><option>published</option><option>archived</option></select>
      <input class="input" id="fq" type="search" placeholder="Search" aria-label="Search" style="max-width:14rem"></div>
    <div id="rlist"></div>
    <form id="bulk" class="panel" style="margin-top:2rem"><h2>Add many links at once</h2><p class="muted" style="font-size:.85rem">One per line: <code>Name | https://link | short description</code> (description is optional). All lines get the category and price below.</p>
      <div class="cols">${fld("category_id", "Category", cats[0]?.id, { opts: cats.map((c) => [c.id, c.name]) })}${fld("pricing", "Price", "free", { opts: PRICING })}</div>
      ${fld("lines", "Links", "", { area: 6, attrs: 'placeholder="Photopea | https://www.photopea.com | Editor ala Photoshop di browser"' })}<button class="btn sm">Add links</button></form>
    <div class="panel" style="margin-top:1.5rem"><h2>Categories</h2><p class="muted" style="font-size:.85rem">Categories become the filter buttons on the public Tools page.</p>
      ${cats.map((c) => `<form class="rowedit cf" data-id="${c.id}" style="grid-template-columns:2fr 2fr 6rem auto auto;align-items:end">${fld("name", "Name", c.name, { attrs: "required maxlength=60" })}${fld("slug", "Slug", c.slug, { attrs: "required" })}${fld("sort_order", "Order", c.sort_order, { type: "number" })}${chk("is_active", "Visible", c.is_active)}<div style="display:flex;gap:.3rem"><button class="btn sm" value="save">Save</button><button class="btn danger sm" value="del">Delete</button></div></form>`).join("")}
      <form class="rowedit cf" data-id="" style="grid-template-columns:2fr 2fr 6rem auto auto;align-items:end;border-top:1px solid var(--border);padding-top:1rem">${fld("name", "New category", "", { attrs: "required maxlength=60" })}${fld("slug", "Slug (optional)", "")}${fld("sort_order", "Order", (cats.at(-1)?.sort_order ?? 0) + 10, { type: "number" })}${chk("is_active", "Visible", true)}<button class="btn sm" value="save">Add</button></form></div>`;
  $("#fc").onchange = (e) => { fc = e.target.value; draw(); }; $("#fs").onchange = (e) => { fs = e.target.value; draw(); }; $("#fq").oninput = (e) => { fq = e.target.value.toLowerCase(); draw(); };
  $("#bulk").onsubmit = (e) => { e.preventDefault(); const f = e.target; busy($("button", f), async () => {
    const rows = [], bad = []; let ord = (items.at(-1)?.sort_order ?? 0);
    for (const line of f.lines.value.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const [title, url, ...d] = line.split("|").map((x) => x.trim());
      if (!title || !/^https:\/\/\S+$/.test(url || "")) { bad.push(line); continue; }
      rows.push({ title: title.slice(0, 80), url, description: d.join(" | ").slice(0, 300) || null, category_id: f.category_id.value, pricing: f.pricing.value, status: "published", sort_order: (ord += 10) });
    }
    if (bad.length) throw new Error(`Fix these lines (need a name and an https:// link): ${bad.slice(0, 3).join("  /  ")}`);
    if (!rows.length) throw new Error("Nothing to add.");
    must(await sb.from("resources").insert(rows)); toast(`${rows.length} links added.`, "ok"); resList(el); }); };
  $$("form.cf", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); const b = e.submitter, cid = f.dataset.id;
    if (b.value === "del") { if (!confirm("Delete this category? It must have no links.")) return;
      return busy(b, async () => { const { error } = await sb.from("resource_categories").delete().eq("id", cid); if (error) throw new Error(/foreign key|violates/.test(error.message) ? "This category still has links. Move or delete them first, or hide the category." : error.message); toast("Deleted.", "ok"); resList(el); }); }
    busy(b, async () => {
      const row = { name: f.name.value.trim(), slug: (f.slug.value || slugify(f.name.value)).trim(), sort_order: +f.sort_order.value || 0, is_active: f.is_active.checked };
      if (!row.name) throw new Error("Name is required."); if (!/^[a-z0-9-]+$/.test(row.slug)) throw new Error("Slug may only contain a–z, 0–9 and dashes.");
      if (cid) must(await sb.from("resource_categories").update(row).eq("id", cid)); else must(await sb.from("resource_categories").insert(row));
      toast("Saved.", "ok"); resList(el); }); });
  draw();
}

async function resEdit(el, id) {
  let isNew = id === "new";
  const cats = must(await sb.from("resource_categories").select("*").order("sort_order"));
  if (!cats.length) { el.innerHTML = '<div class="notice">Create a category first.</div>'; return; }
  const r = isNew ? { title: "", url: "https://", description: "", category_id: cats[0].id, pricing: "free", tags: [], icon_url: "", is_featured: false, status: "published", sort_order: 999 }
    : must(await sb.from("resources").select("*").eq("id", id).single());
  el.innerHTML = `<div class="bar"><div><a class="muted" href="#/resources">← Creator tools</a><h1 style="margin:.3rem 0 0">${isNew ? "Add a link" : esc(r.title)}</h1></div></div>
  <form id="rf" class="panel"><div class="cols">${fld("title", "Name", r.title, { req: 1, attrs: "required maxlength=80" })}${fld("url", "Link (https://)", r.url, { type: "url", req: 1, attrs: "required maxlength=500" })}
    ${fld("category_id", "Category", r.category_id, { opts: cats.map((c) => [c.id, c.name]) })}${fld("pricing", "Price", r.pricing, { opts: PRICING })}
    ${fld("status", "Status", r.status, { opts: [["published", "Shown"], ["draft", "Hidden (draft)"], ["archived", "Archived"]] })}${chk("is_featured", "Show on the home page", r.is_featured)}${fld("tags", "Search keywords (comma separated)", (r.tags || []).join(", "))}${fld("sort_order", "Order (small = first)", r.sort_order, { type: "number" })}</div>
    ${fld("description", "Short description (max 300)", r.description ?? "", { area: 3, attrs: "maxlength=300" })}
    <div class="field"><label>Custom icon (optional, otherwise the site's own favicon is used)</label>${r.icon_url ? `<img class="thumb-s" src="${esc(r.icon_url)}" alt="" style="margin-bottom:.4rem;display:block">` : ""}<input class="input" id="ic" type="file" accept="image/*"></div>
    <button class="btn" id="save">Save</button></form>`;
  $("#rf").onsubmit = (e) => { e.preventDefault(); busy($("#save"), async () => {
    const f = e.target, row = { title: f.title.value.trim(), url: f.url.value.trim(), description: f.description.value.trim() || null, category_id: f.category_id.value, pricing: f.pricing.value, status: f.status.value,
      is_featured: f.is_featured.checked, tags: csv(f.tags.value), sort_order: +f.sort_order.value || 0, icon_url: r.icon_url || null };
    if (!row.title) throw new Error("Name is required."); if (!/^https:\/\/\S+$/.test(row.url)) throw new Error("The link must start with https://");
    const ic = $("#ic").files[0]; if (ic) row.icon_url = await uploadPublic(ic, "tools");
    if (isNew) must(await sb.from("resources").insert(row)); else must(await sb.from("resources").update(row).eq("id", id));
    toast("Saved.", "ok"); location.hash = "#/resources"; }); };
}
