import { sb, esc, toast, fld, chk, busy, must } from "./admin-lib.js";
import { $, $$, slugify } from "./util.js";

const TABS = [["", "Overview"], ["sources", "Sources"], ["articles", "Articles"], ["categories", "Categories"]];
const dt = (v) => (v ? new Date(v).toLocaleString() : "—");
const rel = (v) => { if (!v) return "never"; const m = Math.round((Date.now() - new Date(v)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const SCOPES = [["id", "Indonesia"], ["intl", "International"]];
const shell = (tab, body) => `<div class="bar"><h1>Kanasa News</h1><a class="btn ghost sm" href="#/news-public" data-pub>View public page ↗</a></div>
  <nav class="tabs" style="display:flex;gap:1.2rem;border-bottom:1px solid var(--border);margin-bottom:1.5rem" aria-label="News sections">${TABS.map(([k, t]) => `<a href="#/news${k ? "/" + k : ""}" ${k === tab ? 'aria-current="page"' : ""} style="padding:.6rem 0;${k === tab ? "border-bottom:2px solid var(--accent);" : "color:var(--muted)"}">${t}</a>`).join("")}</nav>${body}`;

export async function viewNews(el, tab = "") {
  const t = TABS.some(([k]) => k === tab) ? tab : "";
  const fn = { "": overview, sources, articles, categories }[t];
  el.innerHTML = shell(t, '<div id="nbody"><div class="skeleton" style="height:10rem"></div></div>');
  await fn($("#nbody", el));
  const pub = $("[data-pub]", el); if (pub) pub.href = new URL("../#/news", location.href).href;
}

/* ---------- overview ---------- */
async function overview(el) {
  const o = must(await sb.rpc("admin_news_overview"));
  const st = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  el.innerHTML = `<div class="stats">${st(o.published, "Published articles")}${st(o.new_24h, "New in 24 h")}${st(`${o.sources_active - o.sources_failing}/${o.sources_active}`, "Sources healthy")}${st(o.hidden, "Hidden / archived")}${st(o.dup_30d, "Duplicates skipped (30 d)")}</div>
    <div class="panel" style="margin-top:1.5rem"><h2>Automation</h2>
      <p class="muted" style="font-size:.875rem">A scheduled job on the database calls the <code>news-ingest</code> function every 10 minutes (${o.cron_active ? "<strong>scheduler is running</strong>" : '<strong style="color:var(--accent)">scheduler is OFF</strong>'}). Each source is fetched at its own interval. Last successful fetch: <strong>${esc(rel(o.last_success))}</strong>.</p>
      <form id="cfg" class="cols" style="align-items:end">${chk("auto", "Automatic collection enabled", o.auto_enabled)}${fld("ret", "Keep articles for (days)", o.retention_days, { type: "number", attrs: 'min="7" max="3650"' })}<div style="display:flex;gap:.5rem"><button class="btn sm">Save</button><button class="btn ghost sm" type="button" id="syncall">Sync all sources now</button></div></form>
      <div id="syncres" role="status" style="margin-top:1rem"></div></div>
    <div class="panel" style="margin-top:1.5rem"><h2>Recent runs</h2>${o.runs.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Started</th><th>By</th><th>Status</th><th>Sources</th><th>New</th><th>Dupes</th><th>Errors</th></tr></thead><tbody>${o.runs.map((r) => `<tr><td>${esc(dt(r.started_at))}</td><td>${esc(r.trigger)}</td><td><span class="pill s-${r.status === "ok" ? "published" : r.status === "partial" ? "draft" : "archived"}">${esc(r.status)}</span></td><td>${r.fetched}/${r.sources_total}</td><td>${r.inserted}</td><td>${r.duplicates}</td><td>${r.errors ? `<details><summary>${r.errors}</summary>${(r.detail || []).filter((d) => !d.ok).map((d) => `<div style="font-size:.75rem"><strong>${esc(d.source)}</strong>: ${esc(d.error)}</div>`).join("")}</details>` : "0"}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No runs yet.</p>'}</div>`;
  $("#cfg", el).onsubmit = (e) => { e.preventDefault(); const f = e.target; busy($("button", f), async () => { must(await sb.rpc("admin_news_set_config", { p_auto: f.auto.checked, p_retention: +f.ret.value || 365 })); toast("Saved.", "ok"); }); };
  $("#syncall", el).onclick = (e) => busy(e.target, async () => { $("#syncres", el).textContent = "Fetching… this can take up to a minute."; $("#syncres", el).innerHTML = syncSummary(await invoke({ action: "run", force: true })); });
}
async function invoke(body) {
  const { data, error } = await sb.functions.invoke("news-ingest", { body });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch { /* ignore */ } throw new Error(m); }
  return data;
}
const syncSummary = (d) => `<div class="notice"><strong>${d.status === "ok" ? "Done" : d.status === "partial" ? "Finished with errors" : "Failed"}.</strong> ${d.sources} source(s): ${d.inserted} new, ${d.updated} updated, ${d.duplicates} duplicates, ${d.errors} error(s).${(d.results || []).filter((r) => !r.ok).map((r) => `<div style="font-size:.8125rem">• ${esc(r.source)}: ${esc(r.error)}</div>`).join("")}</div>`;

/* ---------- sources ---------- */
async function sources(el) {
  const [srcs, cats] = await Promise.all([sb.from("news_sources").select("*").order("scope").order("name").then(must), sb.from("news_categories").select("id,name").order("sort_order").then(must)]);
  const catOpts = [["", "—"], ...cats.map((c) => [c.id, c.name])];
  const health = (s) => !s.is_active ? '<span class="pill">off</span>' : s.fail_count ? `<span class="pill s-archived" title="${esc(s.last_error || "")}">failing ×${s.fail_count}</span>` : s.last_success_at ? '<span class="pill s-published">ok</span>' : '<span class="pill s-draft">never fetched</span>';
  const form = (s) => `<form class="sf panel" data-id="${s?.id || ""}" style="margin:0 0 1rem"><div class="cols">${fld("name", "Name", s?.name, { attrs: "required maxlength=80" })}${fld("slug", "Slug", s?.slug, { attrs: "required", hint: "lowercase, dashes" })}</div>
    ${fld("feed_url", "RSS / Atom feed URL (https)", s?.feed_url, { attrs: "required type=url maxlength=500" })}${fld("site_url", "Publisher website", s?.site_url, { attrs: "type=url" })}
    <div class="cols">${fld("scope", "Coverage", s?.scope || "id", { opts: SCOPES })}${fld("language", "Language (2 letters)", s?.language || "id", { attrs: 'pattern="[a-z]{2}" maxlength=2 required' })}${fld("default_category_id", "Category for its articles", s?.default_category_id || "", { opts: catOpts })}</div>
    <div class="cols">${fld("fetch_interval_min", "Fetch every (minutes)", s?.fetch_interval_min ?? 30, { type: "number", attrs: 'min="5" max="1440"' })}${fld("max_items", "Max items per fetch", s?.max_items ?? 30, { type: "number", attrs: 'min="1" max="100"' })}${fld("priority", "Priority", s?.priority ?? 100, { type: "number" })}</div>
    ${fld("attribution", "Attribution text", s?.attribution, { attrs: "maxlength=200" })}
    <div style="display:flex;gap:1.2rem;flex-wrap:wrap">${chk("is_active", "Enabled", s ? s.is_active : true)}${chk("allow_images", "Show publisher thumbnails (hotlinked, never copied)", s ? s.allow_images : true)}${chk("allow_summary", "Show feed excerpt", s ? s.allow_summary : true)}</div>
    <div class="err" role="alert"></div><div style="display:flex;gap:.5rem;margin-top:.8rem;flex-wrap:wrap"><button class="btn sm" value="save">${s ? "Save" : "Add source"}</button><button class="btn ghost sm" type="button" data-test>Test feed</button>${s ? '<button class="btn danger sm" type="button" data-del>Delete</button>' : ""}</div><div class="prev" style="margin-top:.8rem;font-size:.8125rem"></div></form>`;
  el.innerHTML = `<div class="tablewrap"><table class="t"><thead><tr><th>Source</th><th>Coverage</th><th>Health</th><th>Last fetch</th><th>Items</th><th></th></tr></thead><tbody>${srcs.map((s) => `<tr><td><strong>${esc(s.name)}</strong><div class="muted mono" style="font-size:.75rem">${esc(new URL(s.feed_url).hostname)}</div></td><td>${esc(s.scope === "id" ? "ID" : "Intl")} · ${esc(s.language)}</td><td>${health(s)}${s.last_error ? `<div class="muted" style="font-size:.75rem;max-width:18rem">${esc(s.last_error)}</div>` : ""}</td><td>${esc(rel(s.last_fetched_at))}</td><td>${s.last_item_count ?? "—"}</td>
      <td style="white-space:nowrap"><button class="btn ghost sm" data-sync="${s.id}">Sync</button> <button class="btn ghost sm" data-edit="${s.id}">Edit</button></td></tr><tr hidden data-row="${s.id}"><td colspan="6">${form(s)}</td></tr>`).join("")}</tbody></table></div>
    <h2 style="margin:2rem 0 .8rem">Add a source</h2>${form(null)}`;
  $$("[data-edit]", el).forEach((b) => b.onclick = () => { const r = $(`[data-row="${b.dataset.edit}"]`, el); r.hidden = !r.hidden; });
  $$("[data-sync]", el).forEach((b) => b.onclick = () => busy(b, async () => { const d = await invoke({ action: "run", source_id: b.dataset.sync }); toast(d.errors ? `Failed: ${d.results[0]?.error || "error"}` : `${d.inserted} new, ${d.duplicates} duplicates.`, d.errors ? "err" : "ok"); viewNews($("#view"), "sources"); }));
  $$("form.sf", el).forEach((f) => {
    $("[data-test]", f).onclick = (e) => busy(e.target, async () => {
      const d = await invoke({ action: "preview", feed_url: f.feed_url.value.trim() }), p = $(".prev", f);
      p.innerHTML = d.ok ? `<strong>${d.total} entries found.</strong> Preview:<ul style="margin:.4rem 0 0 1rem">${d.items.map((i) => `<li>${esc(i.title)} <span class="muted">${esc(i.image ? "· image" : "· no image")}</span></li>`).join("")}</ul>` : `<span style="color:var(--accent)">Could not read the feed: ${esc(d.error)}</span>`; });
    const del = $("[data-del]", f); if (del) del.onclick = () => confirm("Delete this source? Its imported articles stay, but they will no longer be updated.") && busy(del, async () => { must(await sb.from("news_sources").delete().eq("id", f.dataset.id)); toast("Deleted.", "ok"); viewNews($("#view"), "sources"); });
    f.onsubmit = (e) => { e.preventDefault(); busy(e.submitter || $("button", f), async () => {
      const g = (n) => f.elements[n], row = { name: g("name").value.trim(), slug: (g("slug").value || slugify(g("name").value)).trim(), feed_url: g("feed_url").value.trim(), site_url: g("site_url").value.trim() || null, scope: g("scope").value, language: g("language").value.trim().toLowerCase(),
        default_category_id: g("default_category_id").value || null, fetch_interval_min: +g("fetch_interval_min").value || 30, max_items: +g("max_items").value || 30, priority: +g("priority").value || 100, attribution: g("attribution").value.trim() || null,
        is_active: g("is_active").checked, allow_images: g("allow_images").checked, allow_summary: g("allow_summary").checked };
      if (!/^[a-z0-9-]+$/.test(row.slug)) throw new Error("Slug may only contain a–z, 0–9 and dashes.");
      if (f.dataset.id) must(await sb.from("news_sources").update(row).eq("id", f.dataset.id)); else must(await sb.from("news_sources").insert(row));
      toast("Saved.", "ok"); viewNews($("#view"), "sources"); }); };
  });
}

/* ---------- articles ---------- */
const PER = 40;
async function articles(el, st = { q: "", status: "", src: "", cat: "", page: 0 }) {
  const [cats, srcs] = await Promise.all([sb.from("news_categories").select("id,name").order("sort_order").then(must), sb.from("news_sources").select("slug,name").order("name").then(must)]);
  let qb = sb.from("news_articles").select("id,title,summary,summary_kind,status,is_featured,category_id,source_name,source_slug,published_at,correction_note,url,slug", { count: "exact" });
  if (st.q) qb = qb.ilike("title", `%${st.q.replace(/[%,()]/g, " ")}%`); if (st.status) qb = qb.eq("status", st.status); if (st.src) qb = qb.eq("source_slug", st.src); if (st.cat) qb = qb.eq("category_id", st.cat);
  const { data, count, error } = await qb.order("published_at", { ascending: false }).range(st.page * PER, st.page * PER + PER - 1); if (error) throw error;
  const sel = (id, label, opts, v) => `<select class="input" id="${id}" aria-label="${label}" style="max-width:13rem"><option value="">${label}</option>${opts.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const catName = (id) => cats.find((c) => c.id === id)?.name || "—";
  el.innerHTML = `<div class="filters" style="margin-bottom:1rem"><input class="input" id="aq" type="search" placeholder="Search headline" aria-label="Search headline" value="${esc(st.q)}" style="max-width:16rem">${sel("as", "Any status", [["published", "published"], ["hidden", "hidden"], ["archived", "archived"]], st.status)}${sel("ar", "Any source", srcs.map((s) => [s.slug, s.name]), st.src)}${sel("ac", "Any category", cats.map((c) => [c.id, c.name]), st.cat)}</div>
    <p class="muted" style="font-size:.8125rem">${count} articles</p>
    ${data.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Headline</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody>${data.map((a) => `<tr><td><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(a.title)}</strong></a>${a.is_featured ? " ★" : ""}<div class="muted" style="font-size:.75rem">${esc(a.source_name)} · ${esc(dt(a.published_at))}</div></td><td>${esc(catName(a.category_id))}</td><td><span class="pill s-${a.status === "published" ? "published" : "draft"}">${esc(a.status)}</span></td>
      <td style="white-space:nowrap"><button class="btn ghost sm" data-feat="${a.id}" data-v="${a.is_featured ? 0 : 1}">${a.is_featured ? "Unfeature" : "Feature"}</button> <button class="btn ghost sm" data-hide="${a.id}" data-v="${a.status === "published" ? "hidden" : "published"}">${a.status === "published" ? "Hide" : "Restore"}</button> <button class="btn ghost sm" data-ed="${a.id}">Edit</button></td></tr>
      <tr hidden data-erow="${a.id}"><td colspan="4"><form class="ef panel" data-id="${a.id}" style="margin:0">${fld("summary", "Summary (shown as “edited by Kanasa” once you change it)", a.summary, { area: 3, attrs: "maxlength=600" })}<div class="cols">${fld("category_id", "Category", a.category_id || "", { opts: [["", "—"], ...cats.map((c) => [c.id, c.name])] })}${fld("correction_note", "Correction note (shown publicly)", a.correction_note, { attrs: "maxlength=500" })}</div><button class="btn sm">Save</button></form></td></tr>`).join("")}</tbody></table></div>
      <div style="display:flex;justify-content:space-between;margin-top:1rem"><button class="btn ghost sm" id="pp" ${st.page ? "" : "disabled"}>← Newer</button><button class="btn ghost sm" id="pn" ${(st.page + 1) * PER >= count ? "disabled" : ""}>Older →</button></div>` : '<div class="empty"><strong>No articles</strong>Run a sync from Overview, or change the filters.</div>'}`;
  const redo = (patch) => articles(el, { ...st, ...patch });
  $("#aq", el).onchange = (e) => redo({ q: e.target.value.trim(), page: 0 }); $("#as", el).onchange = (e) => redo({ status: e.target.value, page: 0 }); $("#ar", el).onchange = (e) => redo({ src: e.target.value, page: 0 }); $("#ac", el).onchange = (e) => redo({ cat: e.target.value, page: 0 });
  const pp = $("#pp", el), pn = $("#pn", el); if (pp) pp.onclick = () => redo({ page: st.page - 1 }); if (pn) pn.onclick = () => redo({ page: st.page + 1 });
  $$("[data-feat]", el).forEach((b) => b.onclick = () => busy(b, async () => { if (b.dataset.v === "1") must(await sb.from("news_articles").update({ is_featured: false }).eq("is_featured", true)); must(await sb.from("news_articles").update({ is_featured: b.dataset.v === "1" }).eq("id", b.dataset.feat)); redo({}); }));
  $$("[data-hide]", el).forEach((b) => b.onclick = () => busy(b, async () => { must(await sb.from("news_articles").update({ status: b.dataset.v }).eq("id", b.dataset.hide)); redo({}); }));
  $$("[data-ed]", el).forEach((b) => b.onclick = () => { const r = $(`[data-erow="${b.dataset.ed}"]`, el); r.hidden = !r.hidden; });
  $$("form.ef", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); const a = data.find((x) => x.id === f.dataset.id); busy($("button", f), async () => {
    const s = f.summary.value.trim() || null, row = { summary: s, category_id: f.category_id.value || null, correction_note: f.correction_note.value.trim() || null };
    if (s !== (a.summary || null)) row.summary_kind = "edited";
    must(await sb.from("news_articles").update(row).eq("id", f.dataset.id)); toast("Saved.", "ok"); redo({}); }); });
}

/* ---------- categories ---------- */
async function categories(el) {
  const cats = must(await sb.from("news_categories").select("*").order("sort_order"));
  const row = (c) => `<form class="cf panel" data-id="${c?.id || ""}" style="margin:0 0 .8rem"><div class="cols">${fld("name", c ? "Name" : "New category", c?.name, { attrs: "required maxlength=60" })}${fld("slug", "Slug", c?.slug, { attrs: c ? "required" : "", hint: c ? "" : "optional" })}${fld("scope", "Group", c?.scope || "topic", { opts: [["id", "Indonesia"], ["intl", "International"], ["topic", "Topics"]] })}${fld("sort_order", "Order", c?.sort_order ?? (cats.at(-1)?.sort_order ?? 0) + 10, { type: "number" })}</div>
    ${fld("description", "Description", c?.description, { attrs: "maxlength=300" })}${fld("parent_id", "Parent category", c?.parent_id || "", { opts: [["", "—"], ...cats.filter((x) => x.id !== c?.id).map((x) => [x.id, x.name])] })}
    <div style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center">${chk("is_active", "Visible", c ? c.is_active : true)}${chk("show_home", "Eligible for homepage module", c ? c.show_home : true)}<button class="btn sm" value="save">${c ? "Save" : "Add"}</button>${c ? '<button class="btn danger sm" value="del">Delete</button>' : ""}</div></form>`;
  el.innerHTML = `<p class="muted" style="font-size:.875rem">Each source feeds one category. A category only appears in the public menu once it has articles. Deleting a category keeps its articles (they become uncategorised).</p>${cats.map(row).join("")}<h2 style="margin:2rem 0 .8rem">Add a category</h2>${row(null)}`;
  $$("form.cf", el).forEach((f) => f.onsubmit = (e) => { e.preventDefault(); const b = e.submitter, id = f.dataset.id;
    if (b.value === "del") { if (!confirm("Delete this category? Articles are kept but lose their category.")) return; return busy(b, async () => { must(await sb.from("news_categories").delete().eq("id", id)); toast("Deleted.", "ok"); viewNews($("#view"), "categories"); }); }
    busy(b, async () => {
      const nm = f.elements.name.value;
      const r = { name: nm.trim(), slug: (f.slug.value || slugify(nm)).trim(), scope: f.scope.value, sort_order: +f.sort_order.value || 0, description: f.description.value.trim() || null, parent_id: f.parent_id.value || null, is_active: f.is_active.checked, show_home: f.show_home.checked };
      if (!r.name) throw new Error("Name is required."); if (!/^[a-z0-9-]+$/.test(r.slug)) throw new Error("Slug may only contain a–z, 0–9 and dashes.");
      if (id) must(await sb.from("news_categories").update(r).eq("id", id)); else must(await sb.from("news_categories").insert(r));
      toast("Saved.", "ok"); viewNews($("#view"), "categories"); }); });
}
