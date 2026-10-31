/* Kanasa News — public reading experience (aggregated headlines, attribution, search).
   Routes: #/news · #/news/c/<category> · #/news/a/<article> · filters live in the query string. */
import { sb } from "./db.js";
import { esc, safeUrl } from "./util.js";

const H = { setMeta() {}, observe() {}, set: () => ({}) };
const COLS = "id,slug,title,summary,summary_kind,image_url,url,source_name,source_slug,scope,language,category_id,published_at,updated_at,created_at,is_featured,correction_note";
const PAGE = 20, SCOPE = { id: "Indonesia", intl: "Internasional" }, LANG = { id: "Bahasa Indonesia", en: "English" };
const FILTERS = ["q", "scope", "src", "lang", "from", "to", "sort", "page"];
let CATS = null, COUNTS = {}, FACETS = null, factAt = 0;

export function initNews(h) {
  Object.assign(H, h);
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("form[data-nform]"); if (!f) return;
    e.preventDefault();
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(f)) { const s = String(v).trim(); if (s && FILTERS.includes(k)) p.set(k, s.slice(0, 100)); }
    const qs = p.toString(); location.hash = f.dataset.nform + (qs ? "?" + qs : "");
  });
  document.addEventListener("change", (e) => { const f = e.target.closest("form[data-nform]"); if (f && e.target.matches("select, input[type=date]")) f.requestSubmit(); });
}

/* ---------- data ---------- */
async function loadMeta() {
  if (!CATS) {
    const [c, n] = await Promise.all([sb.from("news_categories").select("*").eq("is_active", true).order("sort_order"), sb.rpc("news_category_counts")]);
    if (c.error) throw c.error;
    CATS = c.data; COUNTS = n.data || {};
  }
  if (!FACETS || Date.now() - factAt > 300000) { const f = await sb.rpc("news_facets"); FACETS = f.data || { sources: [], languages: [] }; factAt = Date.now(); }
}
const cat = (a) => CATS.find((c) => c.id === a.category_id);
async function latest(n, extra) {
  let q = sb.from("news_articles").select(COLS).eq("status", "published");
  if (extra) q = extra(q);
  const { data, error } = await q.order("published_at", { ascending: false }).limit(n);
  if (error) throw error; return data;
}

/* ---------- small pieces ---------- */
const idf = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });
const idfull = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short" });
function ago(iso) { const s = (Date.now() - new Date(iso)) / 1000; if (s < 90) return "baru saja"; if (s < 3600) return `${Math.floor(s / 60)} menit lalu`; if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`; if (s < 172800) return "kemarin"; return idf.format(new Date(iso)); }
const when = (a) => `<time datetime="${esc(a.published_at)}" title="${esc(idfull.format(new Date(a.published_at)))}">${esc(ago(a.published_at))}</time>`;
const href = (a) => `#/news/a/${encodeURIComponent(a.slug)}`;
const fig = (a, cls = "") => {
  const u = safeUrl(a.image_url); if (!u) return "";
  return `<div class="nfig ${cls}"><img src="${esc(u.replace("/standard/240/", "/standard/800/"))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('.nfig')?.remove()"></div>`;
};
const kick = (a) => { const c = cat(a); return `<span class="nk">${esc(c ? c.name : SCOPE[a.scope] || "Berita")}</span>`; };
const src = (a) => `<span class="nm">${esc(a.source_name)} · ${when(a)}</span>`;
const leadHtml = (a) => `<article class="n-lead">${fig(a, "wide")}<div>${kick(a)}<h2><a href="${href(a)}">${esc(a.title)}</a></h2>${a.summary ? `<p class="n-sum">${esc(a.summary)}</p>` : ""}${src(a)}</div></article>`;
const brief = (a) => `<article class="n-brief">${kick(a)}<h3><a href="${href(a)}">${esc(a.title)}</a></h3>${src(a)}</article>`;
const row = (a) => `<article class="n-row"><div>${kick(a)}<h3><a href="${href(a)}">${esc(a.title)}</a></h3>${a.summary ? `<p class="n-sum sm">${esc(a.summary)}</p>` : ""}${src(a)}</div>${fig(a, "thumb")}</article>`;
const empty = (t, d) => `<div class="empty"><strong>${esc(t)}</strong>${esc(d)}</div>`;
const nq = (base, o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v != null && v !== "" && !(k === "page" && +v <= 1)) p.set(k, v); const s = p.toString(); return base + (s ? "?" + s : ""); };

function masthead(active = {}, q = {}, base = "#/news") {
  const today = new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date());
  const links = [["#/news", "Terbaru", !active.cat && !active.scope], ["#/news?scope=id", "Indonesia", active.scope === "id"], ["#/news?scope=intl", "Internasional", active.scope === "intl"]]
    .concat(CATS.filter((c) => COUNTS[c.slug] > 0).map((c) => [`#/news/c/${c.slug}`, c.name, active.cat === c.slug]));
  return `<header class="n-mast"><div class="n-mast-top"><a class="n-logo" href="#/news">Kanasa <b>News</b></a><span class="n-date muted">${esc(today)}</span>
    <form class="n-search" role="search" data-nform="#/news"><label class="sr-only" for="n-q">Cari berita</label><input id="n-q" class="input" type="search" name="q" maxlength="100" placeholder="Cari berita" value="${esc(q.q || "")}" autocomplete="off"><button class="btn sm">Cari</button></form></div>
    <nav class="n-cats" aria-label="Kategori berita">${links.map(([h, t, on]) => `<a href="${esc(h)}" ${on ? 'aria-current="true"' : ""}>${esc(t)}</a>`).join("")}</nav></header>`;
}
const note = () => `<p class="n-note muted">Kanasa News menghimpun judul dan kutipan dari feed publik penerbit; isi lengkap hanya ada di situs penerbit. Kami tidak menulis atau memverifikasi laporan ini. <a href="#/legal/news-policy">Kebijakan sumber &amp; koreksi</a></p>`;
const wrap = (inner) => `<div class="container page n-wrap">${inner}</div>`;

/* ---------- views ---------- */
export async function viewNews(parts, q) {
  try {
    await loadMeta();
    if (parts[0] === "a" && parts[1]) return await article(decodeURIComponent(parts[1]));
    if (parts[0] === "c" && parts[1]) return await listing(q, CATS.find((c) => c.slug === parts[1]) || null, parts[1]);
    if (parts.length) return wrap(masthead() + empty("Halaman tidak ditemukan", "Kembali ke beranda Kanasa News."));
    if (FILTERS.some((k) => q[k])) return await listing(q, null);
    return await home();
  } catch (e) {
    H.setMeta("Kanasa News");
    return wrap(`<div class="notice" role="alert"><strong>Berita belum bisa dimuat.</strong> Coba lagi sebentar lagi. <button class="linkbtn" data-act="reload">Muat ulang</button></div>`);
  }
}

async function home() {
  H.setMeta("Kanasa News", "Berita Indonesia dan dunia dari berbagai penerbit, dihimpun otomatis dengan sumber dan tautan asli.");
  const list = await latest(90);
  if (!list.length) return wrap(masthead() + empty("Belum ada berita", "Sinkronisasi pertama belum berhasil. Admin bisa menjalankannya dari Admin → News.") + note());
  // Lead rule (documented in the news policy): editor-flagged story, else the newest story with a picture.
  const lead = list.find((a) => a.is_featured) || list.find((a) => a.image_url && Date.now() - new Date(a.published_at) < 36 * 36e5) || list.find((a) => a.image_url) || list[0];
  const rest = list.filter((a) => a !== lead), seen = new Set([lead.source_slug]), side = [];
  for (const a of rest.slice(0, 24)) if (!seen.has(a.source_slug) && side.length < 4) { seen.add(a.source_slug); side.push(a); }
  const used = new Set([lead, ...side]), feed = rest.filter((a) => !used.has(a)).slice(0, 14);
  const shown = new Set([...used, ...feed]), idn = rest.filter((a) => a.scope === "id" && !shown.has(a)).slice(0, 5), intl = rest.filter((a) => a.scope === "intl" && !shown.has(a)).slice(0, 5);
  const picks = CATS.filter((c) => c.show_home && COUNTS[c.slug] >= 4).slice(0, 3);
  const mods = await Promise.all(picks.map(async (c) => ({ c, items: await latest(4, (q) => q.eq("category_id", c.id)) })));
  return wrap(`${masthead()}
    <section class="n-top" aria-label="Berita utama">${leadHtml(lead)}<aside aria-label="Berita lainnya"><h2 class="n-h">Juga hari ini</h2>${side.map(brief).join("")}</aside></section>
    <div class="n-cols"><section aria-labelledby="n-latest"><h2 class="n-h" id="n-latest">Terbaru</h2>${feed.map(row).join("")}<p><a class="btn ghost sm" href="#/news?sort=new&page=2">Berita sebelumnya →</a></p></section>
      <aside aria-label="Menurut cakupan">${idn.length ? `<h2 class="n-h"><a href="#/news?scope=id">Indonesia</a></h2>${idn.map(brief).join("")}` : ""}${intl.length ? `<h2 class="n-h"><a href="#/news?scope=intl">Internasional</a></h2>${intl.map(brief).join("")}` : ""}</aside></div>
    ${mods.length ? `<div class="n-mods">${mods.map(({ c, items }) => `<section><h2 class="n-h"><a href="#/news/c/${esc(c.slug)}">${esc(c.name)}</a></h2>${items.map((a, i) => i ? brief(a) : `<article class="n-brief first">${fig(a)}${kick(a)}<h3><a href="${href(a)}">${esc(a.title)}</a></h3>${src(a)}</article>`).join("")}</section>`).join("")}</div>` : ""}
    ${note()}`);
}

async function listing(q, c, slugTried) {
  if (slugTried && !c) { H.setMeta("Kategori tidak ditemukan"); return wrap(masthead() + empty("Kategori tidak ditemukan", "Periksa tautan, atau pilih kategori dari menu di atas.")); }
  const page = Math.max(1, parseInt(q.page, 10) || 1), kw = String(q.q || "").trim().slice(0, 100);
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
  const f = { q: kw, scope: SCOPE[q.scope] ? q.scope : "", src: /^[a-z0-9-]{1,60}$/.test(q.src || "") ? q.src : "", lang: /^[a-z]{2}$/.test(q.lang || "") ? q.lang : "", from: date(q.from), to: date(q.to), sort: q.sort === "old" ? "old" : "new" };
  let qb = sb.from("news_articles").select(COLS, { count: "exact" }).eq("status", "published");
  if (c) qb = qb.eq("category_id", c.id);
  if (kw) qb = qb.textSearch("search_tsv", kw, { type: "websearch", config: "simple" });
  if (f.scope) qb = qb.eq("scope", f.scope); if (f.src) qb = qb.eq("source_slug", f.src); if (f.lang) qb = qb.eq("language", f.lang);
  if (f.from) qb = qb.gte("published_at", f.from + "T00:00:00+07:00"); if (f.to) qb = qb.lte("published_at", f.to + "T23:59:59+07:00");
  const { data, count, error } = await qb.order("published_at", { ascending: f.sort === "old" }).range((page - 1) * PAGE, page * PAGE - 1);
  if (error) throw error;
  const base = c ? `#/news/c/${c.slug}` : "#/news", pages = Math.max(1, Math.ceil((count || 0) / PAGE));
  const title = c ? c.name : kw ? `Hasil untuk “${kw}”` : f.scope ? SCOPE[f.scope] : f.src ? FACETS.sources.find((s) => s.slug === f.src)?.name || "Sumber" : "Semua berita";
  H.setMeta(`${title} — Kanasa News`, c?.description || "Berita terbaru dari berbagai penerbit.");
  const chip = (label, key) => `<a class="n-chip" href="${esc(nq(base, { ...f, [key]: "", page: 1 }))}" aria-label="Hapus filter ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></a>`;
  const chips = [f.q && chip(`“${f.q}”`, "q"), f.scope && chip(SCOPE[f.scope], "scope"), f.src && chip(FACETS.sources.find((s) => s.slug === f.src)?.name || f.src, "src"), f.lang && chip(LANG[f.lang] || f.lang, "lang"), f.from && chip(`dari ${f.from}`, "from"), f.to && chip(`sampai ${f.to}`, "to")].filter(Boolean);
  const opt = (v, t, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`;
  const form = `<form class="n-filters" data-nform="${esc(base)}"><div class="field"><label for="nf-q">Kata kunci</label><input class="input" id="nf-q" type="search" name="q" maxlength="100" value="${esc(f.q)}"></div>
    <div class="field"><label for="nf-s">Cakupan</label><select class="input" id="nf-s" name="scope">${opt("", "Semua", f.scope)}${opt("id", "Indonesia", f.scope)}${opt("intl", "Internasional", f.scope)}</select></div>
    <div class="field"><label for="nf-r">Sumber</label><select class="input" id="nf-r" name="src">${opt("", "Semua sumber", f.src)}${FACETS.sources.map((s) => opt(s.slug, s.name, f.src)).join("")}</select></div>
    <div class="field"><label for="nf-l">Bahasa</label><select class="input" id="nf-l" name="lang">${opt("", "Semua", f.lang)}${FACETS.languages.map((l) => opt(l, LANG[l] || l, f.lang)).join("")}</select></div>
    <div class="field"><label for="nf-f">Dari tanggal</label><input class="input" id="nf-f" type="date" name="from" value="${esc(f.from)}"></div>
    <div class="field"><label for="nf-t">Sampai tanggal</label><input class="input" id="nf-t" type="date" name="to" value="${esc(f.to)}"></div>
    <div class="field"><label for="nf-o">Urutan</label><select class="input" id="nf-o" name="sort">${opt("new", "Terbaru dulu", f.sort)}${opt("old", "Terlama dulu", f.sort)}</select></div>
    <div class="field"><button class="btn sm">Terapkan</button></div></form>`;
  const pager = pages > 1 ? `<nav class="n-pager" aria-label="Halaman">${page > 1 ? `<a class="btn ghost sm" href="${esc(nq(base, { ...f, page: page - 1 }))}">← Sebelumnya</a>` : "<span></span>"}<span class="muted">Halaman ${page} dari ${pages}</span>${page < pages ? `<a class="btn ghost sm" href="${esc(nq(base, { ...f, page: page + 1 }))}">Berikutnya →</a>` : "<span></span>"}</nav>` : "";
  const sibl = c ? CATS.filter((x) => x.scope === c.scope && x.id !== c.id && COUNTS[x.slug] > 0).slice(0, 8) : [];
  return wrap(`${masthead({ cat: c?.slug, scope: !c ? f.scope : "" }, f)}
    <nav class="n-crumb" aria-label="Breadcrumb"><a href="#/news">Kanasa News</a>${c ? ` <span aria-hidden="true">›</span> <span>${esc(c.name)}</span>` : ""}</nav>
    <h1 class="n-title">${esc(title)}</h1>${c?.description ? `<p class="muted">${esc(c.description)}</p>` : ""}
    <details class="n-fbox" ${chips.length ? "open" : ""}><summary>Filter dan urutan</summary>${form}</details>
    ${chips.length ? `<p class="n-chips">${chips.join("")}<a class="n-chip clear" href="${esc(base)}">Hapus semua</a></p>` : ""}
    <p class="muted" style="font-size:.8125rem" role="status">${count || 0} berita</p>
    ${data.length ? `<div class="n-list">${data.map(row).join("")}</div>${pager}` : empty(kw || chips.length ? "Tidak ada hasil" : "Belum ada berita di sini", kw || chips.length ? "Coba kata kunci lain atau hapus beberapa filter." : "Berita akan muncul setelah sumber untuk kategori ini berhasil disinkronkan.")}
    ${sibl.length ? `<h2 class="n-h" style="margin-top:3rem">Kategori terkait</h2><p class="n-chips">${sibl.map((x) => `<a class="n-chip" href="#/news/c/${esc(x.slug)}">${esc(x.name)}</a>`).join("")}</p>` : ""}${note()}`);
}

async function article(slug) {
  const { data: a, error } = await sb.from("news_articles").select(COLS).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw error;
  if (!a) { H.setMeta("Berita tidak ditemukan"); return wrap(masthead() + empty("Berita tidak ditemukan", "Artikel ini mungkin sudah disembunyikan atau dihapus.") + `<p style="text-align:center"><a class="btn ghost sm" href="#/news">Ke beranda Kanasa News</a></p>`); }
  H.setMeta(a.title, a.summary || `Dari ${a.source_name}`);
  const [rel, more] = await Promise.all([
    sb.rpc("news_related", { p_id: a.id, p_limit: 5 }).then((r) => r.data || []).catch(() => []),
    a.category_id ? latest(6, (q) => q.eq("category_id", a.category_id).neq("id", a.id)).catch(() => []) : []]);
  const c = cat(a), ct = H.set("contact"), original = safeUrl(a.url);
  const edited = +new Date(a.updated_at) - +new Date(a.created_at) > 36e5 && a.summary_kind !== "feed";
  const report = ct.email ? `mailto:${encodeURIComponent(ct.email).replace("%40", "@")}?subject=${encodeURIComponent("Koreksi berita: " + a.title.slice(0, 80))}&body=${encodeURIComponent("Tautan: " + location.href.split("#")[0] + "#/news/a/" + a.slug + "\n\nMasalah:")}` : "#/legal/news-policy";
  const kind = { feed: "Kutipan dari feed penerbit", edited: "Ringkasan disunting redaksi Kanasa", ai: "Ringkasan otomatis" }[a.summary_kind];
  return wrap(`${masthead({ cat: c?.slug })}
    <nav class="n-crumb" aria-label="Breadcrumb"><a href="#/news">Kanasa News</a>${c ? ` <span aria-hidden="true">›</span> <a href="#/news/c/${esc(c.slug)}">${esc(c.name)}</a>` : ""}</nav>
    <article class="n-article">${kick(a)}<h1 class="n-title">${esc(a.title)}</h1>
      <p class="n-byline"><strong>${esc(a.source_name)}</strong> · ${when(a)} · ${esc(LANG[a.language] || a.language)}${edited ? ` · diperbarui ${esc(idf.format(new Date(a.updated_at)))}` : ""}</p>
      <p class="n-agg"><strong>Berita dari penerbit lain.</strong> Ini bukan liputan Kanasa News. Judul dan kutipan di bawah dihimpun dari feed ${esc(a.source_name)}.</p>
      ${fig(a, "wide")}${a.image_url ? `<p class="n-cred muted">Gambar: ${esc(a.source_name)}</p>` : ""}
      ${a.summary ? `<p class="n-body">${esc(a.summary)}</p><p class="n-kind muted">${esc(kind)}</p>` : `<p class="n-body muted">Penerbit tidak menyediakan kutipan untuk berita ini.</p>`}
      ${a.correction_note ? `<p class="notice"><strong>Koreksi:</strong> ${esc(a.correction_note)}</p>` : ""}
      <p class="n-actions">${original ? `<a class="btn" href="${esc(original)}" target="_blank" rel="noopener noreferrer nofollow">Baca selengkapnya di ${esc(a.source_name)} ↗</a>` : ""}
        <button type="button" class="btn ghost" data-act="copy" data-v="${esc(location.href.split("#")[0] + "#/news/a/" + a.slug)}">Salin tautan</button>
        <a class="linkbtn" href="${esc(report)}">Laporkan kesalahan</a></p></article>
    ${rel.length ? `<section><h2 class="n-h">Juga diberitakan</h2><p class="muted" style="font-size:.8125rem;margin:-.5rem 0 1rem">Judul mirip dari penerbit lain (dicocokkan otomatis).</p>${rel.map(brief).join("")}</section>` : ""}
    ${more.length ? `<section><h2 class="n-h">${c ? `Lainnya di ${esc(c.name)}` : "Lainnya"}</h2>${more.map(row).join("")}</section>` : ""}${note()}`);
}

/* Homepage strip for the main site. */
export async function newsStrip() {
  await loadMeta();
  const list = await latest(5); if (!list.length) return "";
  return `<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">News</span><h2>Kanasa News</h2><a class="btn ghost sm" href="#/news">Semua berita</a></div><div class="n-strip">${list.map((a) => `<article class="n-brief">${kick(a)}<h3><a href="${href(a)}">${esc(a.title)}</a></h3>${src(a)}</article>`).join("")}</div></div></section>`;
}
