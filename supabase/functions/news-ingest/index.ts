// Kanasa News ingestion. Called by pg_cron (x-ingest-key header) or by a signed-in admin (JWT).
// Reads RSS/Atom feeds, stores headline + short feed excerpt + attribution + link. Never copies article bodies.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!, SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(SB_URL, SRK, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = "KanasaNewsBot/1.0 (RSS reader; +https://kanasastudio.github.io/kanasastudio/)";
const MAX_BYTES = 3_000_000, MAX_AGE_DAYS = 30;

/* ---------- SSRF guard ---------- */
function safeHost(u: URL) {
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false; // raw IPs
  return true;
}

async function get(url: string, hdr: Record<string, string> = {}) {
  let cur = url;
  for (let i = 0; i < 4; i++) {
    const u = new URL(cur);
    if (!safeHost(u)) throw new Error("Blocked URL (https and a public hostname are required)");
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5", ...hdr } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { cur = new URL(r.headers.get("location")!, u).toString(); continue; }
    return r;
  }
  throw new Error("Too many redirects");
}
async function readText(r: Response) {
  const reader = r.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let n = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > MAX_BYTES) { await reader.cancel(); throw new Error("Feed is too large"); } chunks.push(value); }
  const buf = new Uint8Array(n); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  const head = new TextDecoder("utf-8").decode(buf.slice(0, 200));
  const enc = /encoding=["']([\w-]+)["']/i.exec(head)?.[1] || "utf-8";
  try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

/* ---------- parsing ---------- */
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const c = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(c); } catch { return ""; } }
  return NAMED[e.toLowerCase()] ?? m;
});
const unCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const stripTags = (s: string) => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
const clean = (s: string | undefined | null) => {
  if (!s) return "";
  let t = decode(unCdata(s));            // entity-escaped HTML becomes real tags here
  t = decode(stripTags(t));
  return t.replace(/\s+/g, " ").trim();
};
function tag(block: string, name: string) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  return re.exec(block)?.[1];
}
function attr(block: string, tagName: string, a: string, where?: RegExp) {
  const re = new RegExp(`<${tagName}\\b([^>]*)>`, "gi"); let m;
  while ((m = re.exec(block))) {
    if (where && !where.test(m[1])) continue;
    const v = new RegExp(`\\b${a}=["']([^"']+)["']`, "i").exec(m[1])?.[1];
    if (v) return decode(v);
  }
  return undefined;
}
type Item = { guid: string; url: string; title: string; summary: string; image: string | null; published: Date | null };
function absUrl(u: string | undefined, base: string) { try { if (!u) return null; return new URL(decode(u.trim()), base).toString(); } catch { return null; } }
function canonical(u: string) {
  const x = new URL(u); x.hash = "";
  for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ocid|cmpid|at_|xtor|source$)/i.test(k)) x.searchParams.delete(k);
  return x.toString();
}
function parseFeed(xml: string, base: string): Item[] {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  const out: Item[] = [];
  for (const b of blocks) {
    const title = clean(tag(b, "title")); if (!title) continue;
    let link = clean(tag(b, "link")) || attr(b, "link", "href", /rel=["']alternate["']|^(?:(?!rel=)[^>])*$/i) || attr(b, "link", "href") || "";
    const guid = clean(tag(b, "guid") || tag(b, "id")) || "";
    if (!/^https?:/i.test(link) && /^https?:/i.test(guid)) link = guid;
    const url = absUrl(link, base); if (!url || !/^https?:/.test(url)) continue;
    const rawDesc = tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content:encoded") ?? tag(b, "content") ?? "";
    let summary = clean(rawDesc);
    summary = summary.replace(/\s*The post .{0,200} appeared first on .{0,100}\.?$/i, "").replace(/\s*(Read more|Baca selengkapnya)[:.…]*.*$/i, "").trim();
    let img = attr(b, "media:content", "url", /medium=["']image["']|type=["']image|^(?:(?!medium=|type=)[^>])*$/i) || attr(b, "media:thumbnail", "url") || attr(b, "enclosure", "url", /type=["']image/i);
    if (!img) { const html = decode(unCdata(rawDesc)); img = /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]; }
    const image = absUrl(img, url); 
    const d = clean(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    const dt = d ? new Date(d) : null;
    out.push({ guid: guid || url, url: canonical(url), title: title.slice(0, 300), summary, image: image && image.startsWith("https://") ? image.slice(0, 600) : null, published: dt && !isNaN(+dt) ? dt : null });
  }
  return out;
}
const trunc = (s: string, n: number) => { if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(" "), n - 40)).replace(/[,;:\s-]+$/, "") + "…"; };
const titleKey = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 160);
async function sha(s: string) { const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
const slugify = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70).replace(/-$/, "");

/* ---------- per-source run ---------- */
type Src = Record<string, any>;
async function runSource(s: Src, force: boolean) {
  const t0 = Date.now(), res = { source: s.slug, ok: false, items: 0, inserted: 0, updated: 0, duplicates: 0, error: null as string | null, ms: 0 };
  const now = new Date();
  try {
    const hdr: Record<string, string> = {};
    if (!force && s.etag) hdr["If-None-Match"] = s.etag;
    if (!force && s.last_modified) hdr["If-Modified-Since"] = s.last_modified;
    const r = await get(s.feed_url, hdr);
    let items: Item[] = [], etag = s.etag, lm = s.last_modified;
    if (r.status === 304) { await r.body?.cancel(); }
    else {
      if (!r.ok) { await r.body?.cancel(); throw new Error(`HTTP ${r.status}`); }
      const xml = await readText(r);
      if (!/<(rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error("Response is not an RSS/Atom feed");
      items = parseFeed(xml, s.feed_url);
      if (!items.length) throw new Error("Feed has no readable entries");
      etag = r.headers.get("etag") || null; lm = r.headers.get("last-modified") || null;
    }
    const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
    items = items.filter((i) => !i.published || +i.published > cutoff).slice(0, s.max_items);
    res.items = items.length;
    const urls = items.map((i) => i.url), keys = items.map((i) => titleKey(i.title));
    const known = new Map<string, any>(), keyed = new Set<string>();
    if (items.length) {
      const [{ data: byUrl }, { data: byKey }] = await Promise.all([
        db.from("news_articles").select("id,url,title,summary,summary_kind,image_url,source_id").in("url", urls),
        db.from("news_articles").select("title_key").in("title_key", keys)]);
      for (const a of byUrl || []) known.set(a.url, a);
      for (const a of byKey || []) keyed.add(a.title_key);
    }
    const fresh: any[] = [], seen = new Set<string>();
    for (const it of items) {
      const key = titleKey(it.title), ex = known.get(it.url);
      const summary = s.allow_summary && it.summary.length >= 25 && titleKey(it.summary) !== key ? trunc(it.summary, 300) : null;
      const image = s.allow_images ? it.image : null;
      if (ex) {
        res.duplicates++;
        if (ex.source_id === s.id) {
          const patch: Record<string, unknown> = {};
          if (ex.title !== it.title) patch.title = it.title;
          if (ex.summary_kind === "feed" && (ex.summary ?? null) !== summary) patch.summary = summary;
          if (image && !ex.image_url) patch.image_url = image;
          if (Object.keys(patch).length) { patch.processed_at = now.toISOString(); const { error } = await db.from("news_articles").update(patch).eq("id", ex.id); if (!error) res.updated++; }
        }
        continue;
      }
      if (keyed.has(key) || seen.has(it.url) || seen.has("k:" + key)) { res.duplicates++; continue; }
      seen.add(it.url); seen.add("k:" + key);
      let pub = it.published ?? now; if (+pub > Date.now() + 36e5) pub = now;
      fresh.push({
        source_id: s.id, category_id: s.default_category_id, slug: `${slugify(it.title) || "berita"}-${(await sha(it.url)).slice(0, 7)}`,
        guid: it.guid.slice(0, 500), url: it.url, title: it.title, title_key: key, summary, summary_kind: "feed", image_url: image,
        language: s.language, scope: s.scope, source_name: s.name, source_slug: s.slug, published_at: pub.toISOString(), discovered_at: now.toISOString(), processed_at: now.toISOString() });
    }
    if (fresh.length) {
      const { data, error } = await db.from("news_articles").upsert(fresh, { onConflict: "url", ignoreDuplicates: true }).select("id");
      if (error) throw new Error("Database: " + error.message);
      res.inserted = data?.length ?? 0; res.duplicates += fresh.length - res.inserted;
    }
    res.ok = true;
    await db.from("news_sources").update({ last_fetched_at: now.toISOString(), last_success_at: now.toISOString(), fail_count: 0, last_error: null, last_item_count: res.items, etag, last_modified: lm, next_fetch_at: new Date(Date.now() + s.fetch_interval_min * 60000).toISOString() }).eq("id", s.id);
  } catch (e) {
    res.error = String((e as Error).message || e).slice(0, 300);
    const fc = (s.fail_count || 0) + 1, wait = Math.min(s.fetch_interval_min * 2 ** Math.min(fc, 6), 360);
    await db.from("news_sources").update({ last_fetched_at: now.toISOString(), fail_count: fc, last_error: res.error, next_fetch_at: new Date(Date.now() + wait * 60000).toISOString() }).eq("id", s.id);
  }
  res.ms = Date.now() - t0; return res;
}

async function pool<T, R>(arr: T[], n: number, fn: (x: T) => Promise<R>, deadline: number) {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => { while (i < arr.length && Date.now() < deadline) out.push(await fn(arr[i++])); }));
  return out;
}

/* ---------- auth + routes ---------- */
async function authorized(req: Request) {
  const key = req.headers.get("x-ingest-key");
  if (key) { const { data } = await db.from("news_config").select("ingest_key").eq("id", true).single(); return !!data && data.ingest_key === key ? "cron" : null; }
  const auth = req.headers.get("authorization"); if (!auth) return null;
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.rpc("is_admin"); return data === true ? "manual" : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const who = await authorized(req); if (!who) return json({ error: "Unauthorized" }, 401);
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }

  if (body.action === "preview") {
    try {
      const r = await get(String(body.feed_url || ""));
      if (!r.ok) { await r.body?.cancel(); return json({ ok: false, error: `HTTP ${r.status}` }); }
      const xml = await readText(r);
      if (!/<(rss|feed|rdf:RDF)\b/i.test(xml)) return json({ ok: false, error: "Response is not an RSS/Atom feed" });
      const items = parseFeed(xml, String(body.feed_url));
      return json({ ok: true, total: items.length, items: items.slice(0, 8).map((i) => ({ title: i.title, url: i.url, summary: trunc(i.summary, 160), image: i.image, published: i.published })) });
    } catch (e) { return json({ ok: false, error: String((e as Error).message).slice(0, 200) }); }
  }

  if (body.action === "run") {
    const force = !!body.source_id || who === "manual" && body.force === true;
    let q = db.from("news_sources").select("*").eq("is_active", true);
    if (body.source_id) q = q.eq("id", body.source_id);
    else if (!force) q = q.or(`next_fetch_at.is.null,next_fetch_at.lte.${new Date().toISOString()}`);
    const { data: srcs, error } = await q.order("next_fetch_at", { ascending: true, nullsFirst: true }).limit(body.source_id ? 1 : 14);
    if (error) return json({ error: error.message }, 500);
    const { data: run } = await db.from("news_runs").insert({ trigger: who === "cron" ? "cron" : "manual", sources_total: srcs?.length || 0 }).select("id").single();
    const results = await pool(srcs || [], 5, (s) => runSource(s, force), Date.now() + 110000);
    const sum = (k: "inserted" | "updated" | "duplicates") => results.reduce((a, r) => a + r[k], 0), errs = results.filter((r) => !r.ok).length;
    const status = !results.length ? "ok" : errs === 0 ? "ok" : errs === results.length ? "failed" : "partial";
    if (run) await db.from("news_runs").update({ finished_at: new Date().toISOString(), status, fetched: results.filter((r) => r.ok).length, inserted: sum("inserted"), updated: sum("updated"), duplicates: sum("duplicates"), errors: errs, detail: results }).eq("id", run.id);
    return json({ ok: true, status, sources: results.length, inserted: sum("inserted"), updated: sum("updated"), duplicates: sum("duplicates"), errors: errs, results });
  }
  return json({ error: "Unknown action" }, 400);
});
