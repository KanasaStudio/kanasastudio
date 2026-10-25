import { sb, esc, toast, fld, chk, csv, uploadPublic, busy, must } from "./admin-lib.js";
import { $, $$, money, slugify, uid } from "./util.js";

const fmtPrice = (p) => (+p > 0 ? money(p, "IDR") : "Free");
const friendly = (e) => (/slug_key/.test(e?.message || "") ? new Error("That URL slug is already used. Change the slug field.") : e);

/* ================= STORE (products + categories) ================= */
export async function viewStore(el, id) { return id ? prodEdit(el, id) : prodList(el); }

async function prodList(el) {
  const [cats, prods] = await Promise.all([
    sb.from("product_categories").select("*").order("sort_order").then(must),
    sb.from("products").select("id,slug,title,price,status,is_featured,category_id,cover_url,sort_order").order("sort_order").then(must)]);
  const catName = (id) => cats.find((c) => c.id === id)?.name || "—";
  let fc = "", fs = "", fp = "";
  const rows = () => prods.filter((p) => (!fc || p.category_id === fc) && (!fs || p.status === fs) && (!fp || (fp === "free" ? +p.price === 0 : +p.price > 0)));
  const draw = () => {
    const list = rows();
    $("#plist").innerHTML = list.length ? `<div class="tablewrap"><table class="t"><thead><tr><th></th><th>Product</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>${list.map((p) => `<tr>
      <td>${p.cover_url ? `<img class="thumb-s" src="${esc(p.cover_url)}" alt="">` : ""}</td>
      <td><a href="#/store/${p.id}"><strong>${esc(p.title)}</strong></a><div class="muted">${esc(catName(p.category_id))}${p.is_featured ? " · ★ featured" : ""}</div></td>
      <td>${esc(fmtPrice(p.price))}</td><td><span class="pill s-${esc(p.status)}">${esc(p.status)}</span></td>
      <td style="white-space:nowrap">${p.status === "published" ? `<button class="btn ghost sm" data-st="draft" data-id="${p.id}">Unpublish</button>` : `<button class="btn sm" data-st="published" data-id="${p.id}">Publish</button>`} <button class="btn ghost sm" data-st="archived" data-id="${p.id}" ${p.status === "archived" ? "disabled" : ""}>Archive</button></td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty"><strong>No products</strong>Create one, or change the filters.</div>';
    $$("[data-st]", el).forEach((b) => b.onclick = () => busy(b, async () => {
      if (b.dataset.st === "published") { const f = must(await sb.from("product_files").select("product_id").eq("product_id", b.dataset.id)); if (!f.length) throw new Error("Add the download link first (open the product)."); }
      must(await sb.from("products").update({ status: b.dataset.st }).eq("id", b.dataset.id)); prodList(el); }));
  };
  el.innerHTML = `<div class="bar"><h1>Store</h1><a class="btn sm" href="#/store/new">New product</a></div>
    <div class="filters" style="margin-bottom:1rem"><select class="input" id="fc" aria-label="Category" style="max-width:14rem"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <select class="input" id="fs" aria-label="Status" style="max-width:10rem"><option value="">All statuses</option><option>draft</option><option>published</option><option>archived</option></select>
      <select class="input" id="fp" aria-label="Price" style="max-width:9rem"><option value="">Free + Buy</option><option value="free">Free</option><option value="paid">Buy</option></select></div>
    <div id="plist"></div>
    <div class="panel" style="margin-top:2rem"><h2>Categories</h2><p class="muted" style="font-size:.85rem">Categories become the filter buttons on the public store. Hide a category to remove its button (products stay).</p>
      ${cats.map((c) => `<form class="rowedit cf" data-id="${c.id}" style="grid-template-columns:2fr 2fr 6rem auto auto;align-items:end">${fld("name", "Name", c.name, { attrs: "required maxlength=60" })}${fld("slug", "Slug", c.slug, { attrs: "required" })}${fld("sort_order", "Order", c.sort_order, { type: "number" })}${chk("is_active", "Visible", c.is_active)}<div style="display:flex;gap:.3rem"><button class="btn sm" value="save">Save</button><button class="btn danger sm" value="del">Delete</button></div></form>`).join("")}
      <form class="rowedit cf" data-id="" style="grid-template-columns:2fr 2fr 6rem auto auto;align-items:end;border-top:1px solid var(--border);padding-top:1rem">${fld("name", "New category", "", { attrs: "required maxlength=60 placeholder='e.g. Textures'" })}${fld("slug", "Slug (optional)", "")}${fld("sort_order", "Order", (cats.at(-1)?.sort_order ?? 0) + 10, { type: "number" })}${chk("is_active", "Visible", true)}<button class="btn sm" value="save">Add</button></form></div>`;
  $("#fc").onchange = (e) => { fc = e.target.value; draw(); }; $("#fs").onchange = (e) => { fs = e.target.value; draw(); }; $("#fp").onchange = (e) => { fp = e.target.value; draw(); };
  $$("form.cf", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); const b = e.submitter, id = f.dataset.id;
    if (b.value === "del") { if (!confirm("Delete this category? It must have no products.")) return;
      return busy(b, async () => { const { error } = await sb.from("product_categories").delete().eq("id", id); if (error) throw new Error(/foreign key|violates/.test(error.message) ? "This category still has products. Move or delete them first, or just hide the category." : error.message); toast("Deleted.", "ok"); prodList(el); }); }
    busy(b, async () => {
      const row = { name: f.name.value.trim(), slug: (f.slug.value || slugify(f.name.value)).trim(), sort_order: +f.sort_order.value || 0, is_active: f.is_active.checked };
      if (!row.name) throw new Error("Name is required."); if (!/^[a-z0-9-]+$/.test(row.slug)) throw new Error("Slug may only contain a–z, 0–9 and dashes.");
      try { if (id) must(await sb.from("product_categories").update(row).eq("id", id)); else must(await sb.from("product_categories").insert(row)); } catch (e) { throw friendly(e); }
      toast("Saved.", "ok"); prodList(el); }); });
  draw();
}

async function prodEdit(el, id) {
  let isNew = id === "new";
  const cats = must(await sb.from("product_categories").select("*").order("sort_order"));
  if (!cats.length) { el.innerHTML = '<div class="notice">Create a category first (Store → Categories).</div>'; return; }
  const p = isNew ? { title: "", slug: "", category_id: cats[0].id, summary: "", description: "", price: 0, cover_url: "", cover_alt: "", gallery: [], tags: [], version: "", compatibility: "", file_info: "", license_note: "", status: "draft", is_featured: false, sort_order: 100 }
    : must(await sb.from("products").select("*").eq("id", id).single());
  const file = isNew ? null : (must(await sb.from("product_files").select("*").eq("product_id", id)))[0];
  const gallery = [...(p.gallery || [])]; let dl = file?.download_url ?? "";
  const draw = () => {
    el.innerHTML = `<div class="bar"><div><a class="muted" href="#/store">← Store</a><h1 style="margin:.3rem 0 0">${isNew ? "New product" : esc(p.title)}</h1></div></div>
    <form id="pf"><div class="panel"><h2>Details</h2><div class="cols">${fld("title", "Title", p.title, { req: 1, attrs: "required maxlength=120" })}${fld("slug", "URL slug", p.slug, { hint: "auto from title if empty" })}
      ${fld("category_id", "Category", p.category_id, { opts: cats.map((c) => [c.id, c.name]) })}${fld("price", "Price (IDR) — 0 = Free", p.price, { type: "number", attrs: 'min="0" step="1000"' })}
      ${fld("status", "Status", p.status, { opts: [["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]] })}${chk("is_featured", "Featured on the home page", p.is_featured)}
      ${fld("version", "Version", p.version ?? "")}${fld("compatibility", "Works with (e.g. Roblox Studio, Blender 4.x)", p.compatibility ?? "")}${fld("file_info", "File info (e.g. .rbxm · 2 MB)", p.file_info ?? "")}${fld("tags", "Tags (comma separated)", (p.tags || []).join(", "))}</div>
      ${fld("summary", "Short summary (max 300)", p.summary ?? "", { area: 2, attrs: "maxlength=300" })}${fld("description", "Description", p.description ?? "", { area: 7 })}${fld("license_note", "License note (what the buyer may do)", p.license_note ?? "", { area: 2, attrs: "maxlength=500" })}</div>
    <div class="panel"><h2>Download link (private)</h2><p class="muted" style="font-size:.85rem">Paste an https link (Google Drive, Mega, Dropbox, itch.io…) to the file. It is never shown publicly: free products reveal it on click, paid products only after you confirm the payment. Make sure the link itself is "anyone with the link".</p>
      ${fld("download_url", "Download URL", dl, { type: "url", attrs: 'placeholder="https://" maxlength=500' })}</div>
    <div class="panel"><h2>Images</h2><div class="field"><label>Cover</label><input class="input" id="cov" type="file" accept="image/*">${p.cover_url ? `<img class="thumb-s" src="${esc(p.cover_url)}" alt="" style="margin-top:.5rem">` : ""}</div>${fld("cover_alt", "Cover alt text", p.cover_alt ?? "")}
      ${gallery.map((u, i) => `<div class="rowedit" style="grid-template-columns:auto 1fr auto;align-items:center"><img class="thumb-s" src="${esc(u)}" alt=""><span class="muted mono" style="overflow:hidden;text-overflow:ellipsis">${esc(u.split("/").pop())}</span><button type="button" class="btn danger sm" data-rm="${i}">✕</button></div>`).join("")}
      <div class="field" style="margin-top:1rem"><label for="gf">Add gallery images</label><input class="input" id="gf" type="file" accept="image/*" multiple></div></div>
    <button class="btn" id="save">Save product</button></form>`;
    $$("[data-rm]", el).forEach((b) => b.onclick = () => { gallery.splice(+b.dataset.rm, 1); sync(); draw(); });
    $("#pf").onsubmit = (e) => { e.preventDefault(); save(); };
  };
  const sync = () => { const f = $("#pf"); if (!f) return; Object.assign(p, { title: f.title.value, slug: f.slug.value, summary: f.summary.value, description: f.description.value, version: f.version.value, compatibility: f.compatibility.value, file_info: f.file_info.value, tags: csv(f.tags.value), license_note: f.license_note.value, cover_alt: f.cover_alt.value, price: f.price.value, category_id: f.category_id.value, status: f.status.value, is_featured: f.is_featured.checked }); dl = f.download_url.value; };
  const save = () => busy($("#save"), async () => {
    sync(); const f = $("#pf");
    const row = { title: f.title.value.trim(), slug: (f.slug.value || slugify(f.title.value)).trim(), category_id: f.category_id.value, price: Math.max(0, Math.round(+f.price.value || 0)), status: f.status.value, is_featured: f.is_featured.checked,
      summary: f.summary.value.trim() || null, description: f.description.value.trim() || null, version: f.version.value.trim() || null, compatibility: f.compatibility.value.trim() || null, file_info: f.file_info.value.trim() || null,
      license_note: f.license_note.value.trim() || null, tags: csv(f.tags.value), cover_alt: f.cover_alt.value.trim() || null, cover_url: p.cover_url || null, gallery };
    const url = f.download_url.value.trim();
    if (!row.title) throw new Error("Title is required."); if (!/^[a-z0-9-]+$/.test(row.slug)) throw new Error("Slug may only contain a–z, 0–9 and dashes.");
    if (url && !/^https:\/\/\S+$/.test(url)) throw new Error("The download link must start with https://");
    if (row.status === "published" && !url) throw new Error("Add the download link before publishing.");
    if (row.status === "published" && !(row.cover_url || $("#cov").files[0]) && !confirm("No cover image. Publish anyway?")) return;
    const cov = $("#cov").files[0]; if (cov) row.cover_url = await uploadPublic(cov, "store");
    for (const g of $("#gf").files) gallery.push(await uploadPublic(g, "store")); row.gallery = gallery;
    let pid = p.id;
    try { if (isNew) { pid = must(await sb.from("products").insert(row).select("id").single()).id; p.id = pid; isNew = false; } else must(await sb.from("products").update(row).eq("id", pid)); } catch (e) { throw friendly(e); }
    if (url) must(await sb.from("product_files").upsert({ product_id: pid, download_url: url })); else if (!isNew) must(await sb.from("product_files").delete().eq("product_id", pid));
    toast("Saved.", "ok"); location.hash = "#/store";
  });
  draw();
}

/* ================= NOTIFICATIONS ================= */
export async function viewNotify(el) {
  const c = must(await sb.from("notify_config").select("*").eq("id", 1).single());
  el.innerHTML = `<div class="bar"><h1>Notifications</h1></div>
  <form id="nf" class="panel"><h2>Discord alerts</h2><p class="muted" style="font-size:.9rem">Get a message in your Discord channel when someone places an order, uploads a payment proof, or writes to you. The webhook link is stored privately and never appears on the public site.</p>
    ${fld("discord_webhook", "Discord webhook URL", c.discord_webhook ?? "", { type: "url", attrs: 'placeholder="https://discord.com/api/webhooks/…" maxlength=300' })}
    ${fld("site_url", "Your website address (so alerts link to the admin)", c.site_url ?? "", { type: "url", attrs: 'placeholder="https://kanasastudio.github.io/kanasastudio"' })}
    ${chk("enabled", "Alerts enabled", c.enabled)}
    <button class="btn sm" value="save">Save</button> <button class="btn ghost sm" value="test" type="button" id="tst">Send test message</button></form>
  <div class="panel"><h2>How to get the webhook</h2><ol style="line-height:1.8"><li>Open Discord → your server → pick a private channel (only you and your staff).</li><li>Channel settings (gear) → <b>Integrations</b> → <b>Webhooks</b> → <b>New Webhook</b>.</li><li>Name it, then <b>Copy Webhook URL</b> and paste it above.</li><li>Press Save, then <b>Send test message</b>. A message should appear within a few seconds.</li></ol>
  <p class="muted" style="font-size:.85rem">Anyone with the webhook URL can post to that channel, so never share it. If it leaks, delete the webhook in Discord and create a new one.</p></div>`;
  $("#nf").onsubmit = (e) => { e.preventDefault(); const f = e.target; busy(e.submitter || $("#nf button"), async () => {
    const url = f.discord_webhook.value.trim(); if (url && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url)) throw new Error("That does not look like a Discord webhook URL.");
    must(await sb.from("notify_config").update({ discord_webhook: url || null, site_url: f.site_url.value.trim().replace(/\/$/, "") || null, enabled: f.enabled.checked }).eq("id", 1)); toast("Saved.", "ok"); }); };
  $("#tst").onclick = (e) => busy(e.target, async () => { must(await sb.rpc("admin_test_notify")); toast("Test sent. Check your Discord channel in a few seconds. Save first if you just changed the URL.", "ok"); });
}
