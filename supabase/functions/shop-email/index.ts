// Sends buyer notification emails through Resend. Called only by the database (pg_net) with a shared secret.
// Secrets to set in Supabase (Edge Functions -> Secrets): HOOK_SECRET, RESEND_API_KEY, EMAIL_FROM (e.g. "Kanasa Studio <noreply@yourdomain.com>").
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("HOOK_SECRET");
  if (!secret || req.headers.get("x-hook-secret") !== secret) return new Response("unauthorized", { status: 401 });
  let b: { to?: string; subject?: string; text?: string; link?: string };
  try { b = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const to = String(b.to || ""), subject = String(b.subject || "").slice(0, 150), text = String(b.text || "").slice(0, 1000), link = String(b.link || "").slice(0, 300);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject) return new Response("bad request", { status: 400 });
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return new Response(JSON.stringify({ skipped: "RESEND_API_KEY not set" }), { status: 200 });
  const safeLink = /^https:\/\//.test(link) ? link : "";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto"><h2 style="margin:0 0 12px">${esc(subject)}</h2><p style="white-space:pre-wrap;line-height:1.6">${esc(text)}</p>${safeLink ? `<p><a href="${esc(safeLink)}" style="display:inline-block;background:#d6322d;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Buka pesanan</a></p>` : ""}<p style="color:#888;font-size:12px">Email otomatis dari Kanasa Studio.</p></div>`;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM") || "Kanasa Studio <onboarding@resend.dev>", to: [to], subject, text: `${text}\n\n${safeLink}`, html }) });
  return new Response(JSON.stringify({ ok: r.ok, status: r.status }), { status: r.ok ? 200 : 502, headers: { "Content-Type": "application/json" } });
});
