// Generates tiny static "share pages" (one per service, project and product) with proper
// title / description / preview image, so links look good on Discord, WhatsApp, X, Google.
// Humans are redirected straight to the real single-page app. Also writes sitemap.xml.
// Runs in GitHub Actions on every push and once a day (see .github/workflows/static.yml).
import { mkdir, writeFile } from "node:fs/promises";

const BASE = (process.env.SITE_URL || "https://kanasastudio.github.io/kanasastudio").replace(/\/$/, "");
const API = "https://geroipkbzmbkigzwjdok.supabase.co/rest/v1";
const KEY = "sb_publishable_0GuYwsQSIYD89p-O1NcjMw_4l0pc7xN";   // public by design (RLS protects data)
const NAME = "Kanasa Studio × Dhandang Studio";

const get = async (path) => {
  const r = await fetch(`${API}/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const abs = (u) => (!u ? `${BASE}/assets/og-image.jpg` : /^https:\/\//.test(u) ? u : `${BASE}/${String(u).replace(/^\//, "")}`);
const clip = (s, n = 200) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const idr = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");

const pages = [];
async function page(kind, slug, hash, title, desc, img) {
  const url = `${BASE}/share/${kind}/${slug}/`, target = `${BASE}/#/${hash}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(NAME)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}"><meta name="robots" content="index,follow">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(NAME)}"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(abs(img))}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(abs(img))}">
<meta http-equiv="refresh" content="0;url=${esc(target)}"><script>location.replace(${JSON.stringify(target)})</script></head>
<body style="font-family:system-ui;background:#0b0b0c;color:#f2efe9;padding:2rem"><h1>${esc(title)}</h1><p>${esc(desc)}</p><p><a style="color:#f2efe9" href="${esc(target)}">Open on ${esc(NAME)}</a></p></body></html>
`;
  await mkdir(`share/${kind}/${slug}`, { recursive: true });
  await writeFile(`share/${kind}/${slug}/index.html`, html);
  pages.push(url);
}

const [services, projects, products] = await Promise.all([
  get("services?select=slug,name,summary,cover_url&publish_state=eq.published"),
  get("portfolio_projects?select=slug,title,summary,cover_url&status=eq.published"),
  get("products?select=slug,title,summary,price,cover_url&status=eq.published"),
]);
for (const s of services) await page("services", s.slug, `services/${s.slug}`, s.name, clip(s.summary) || `Commission: ${s.name}`, s.cover_url);
for (const p of projects) await page("portfolio", p.slug, `portfolio/${p.slug}`, p.title, clip(p.summary) || `Portfolio: ${p.title}`, p.cover_url);
for (const p of products) await page("store", p.slug, `store/${p.slug}`, p.title, `${+p.price > 0 ? idr(p.price) : "Free"} · ${clip(p.summary, 160) || "Digital product"}`, p.cover_url);

const urls = [`${BASE}/`, ...pages];
await writeFile("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
console.log(`Built ${pages.length} share pages + sitemap.xml`);
