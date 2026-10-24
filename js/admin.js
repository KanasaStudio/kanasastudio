import { sb, esc, toast, fld, chk, busy, must } from "./admin-lib.js";
import { $, $$, money, range, fmtDate, STATUS } from "./util.js";
import { viewServices, viewPortfolio, viewSite } from "./admin-content.js?v=20261024c";

const root = $("#root");
const NAV = [["dashboard", "Dashboard"], ["orders", "Orders"], ["services", "Services & pricing"], ["portfolio", "Portfolio"], ["site", "Site editor"], ["audit", "Audit log"]];
let channel = null;

/* ---------- auth ---------- */
function loginView(msg = "") {
  root.innerHTML = `<div class="login"><form id="login"><h1 style="font-size:1.5rem;margin-bottom:.4rem">Studio admin</h1><p class="muted">Authorized staff only.</p>${msg ? `<div class="notice" role="alert">${esc(msg)}</div>` : ""}
    ${fld("email", "Email", "", { type: "email", req: 1, attrs: 'autocomplete="username" required' })}${fld("password", "Password", "", { type: "password", req: 1, attrs: 'autocomplete="current-password" required' })}
    <button class="btn">Sign in</button></form></div>`;
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, b = $("button", f);
    await busy(b, async () => {
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) return loginView("Sign-in failed. Check your email and password.");
      await boot();
    });
  });
}
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return loginView();
  const { data: ok } = await sb.rpc("is_admin");
  if (!ok) { await sb.auth.signOut(); return loginView("This account is not an admin."); }
  shell(session.user.email);
}
function shell(email) {
  root.innerHTML = `<div class="shell"><aside class="side"><strong>Kanasa Studio</strong><nav id="anav" aria-label="Admin">${NAV.map(([k, t]) => `<a href="#/${k}" data-k="${k}">${t}</a>`).join("")}</nav>
    <div style="margin-top:auto" class="muted"><div style="font-size:.8rem;word-break:break-all">${esc(email)}</div><button class="linkbtn" id="out">Sign out</button> · <a href="../" target="_blank" rel="noopener">View site</a></div></aside>
    <main class="main" id="view" tabindex="-1"></main></div>`;
  $("#out").onclick = async () => { await sb.auth.signOut(); channel?.unsubscribe(); loginView(); };
  channel?.unsubscribe();
  channel = sb.channel("orders-live").on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
    toast(`New order ${p.new.reference}`, "ok"); if (/^#\/(orders|dashboard)?$/.test(location.hash) || !location.hash) route();
  }).subscribe();
  route();
}
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") loginView(); });

/* ---------- router ---------- */
const view = () => $("#view");
async function route() {
  if (!view()) return;
  const [, k = "dashboard", id] = location.hash.split("/");
  $$("#anav a").forEach((a) => a.removeAttribute("aria-current"));
  $$("#anav a").forEach((a) => { if (a.dataset.k === k) a.setAttribute("aria-current", "page"); });
  view().innerHTML = '<div class="skeleton" style="height:12rem"></div>';
  try {
    if (k === "dashboard") await viewDashboard();
    else if (k === "orders") id ? await viewOrder(id) : await viewOrders();
    else if (k === "services") await viewServices(view(), id);
    else if (k === "portfolio") await viewPortfolio(view(), id);
    else if (k === "site") await viewSite(view());
    else if (k === "audit") await viewAudit();
  } catch (e) { view().innerHTML = `<div class="notice" role="alert"><strong>Could not load.</strong> ${esc(e.message)}</div>`; }
}
window.addEventListener("hashchange", route);

/* ---------- dashboard ---------- */
async function viewDashboard() {
  const d = must(await sb.rpc("admin_dashboard")), c = d.counts || {}, n = (...k) => k.reduce((a, x) => a + (c[x] || 0), 0);
  const [{ count: svc }, { count: pf }] = await Promise.all([sb.from("services").select("id", { count: "exact", head: true }).eq("publish_state", "published"), sb.from("portfolio_projects").select("id", { count: "exact", head: true }).eq("status", "published")]);
  const cur = (await sb.from("site_settings").select("value").eq("key", "order").single()).data?.value?.currency || "IDR";
  view().innerHTML = `<div class="bar"><h1>Dashboard</h1><span class="pill">Commissions: ${esc(d.availability?.status || "?")}</span></div>
   <div class="stats"><div class="stat"><b>${n("new_request")}</b><span>New requests</span></div><div class="stat"><b>${n("under_review")}</b><span>Under review</span></div>
    <div class="stat"><b>${n("awaiting_client", "quotation_sent", "awaiting_payment")}</b><span>Waiting for response / payment</span></div><div class="stat"><b>${n("in_progress", "revision")}</b><span>In progress (incl. revision)</span></div>
    <div class="stat"><b>${n("completed")}</b><span>Completed</span></div><div class="stat"><b>${money(d.booked_value, cur)}</b><span>Booked value*</span></div></div>
   <p class="muted" style="font-size:.8rem">*Sum of <em>quoted total</em> for orders in Awaiting Payment, In Progress, Revision and Completed. Orders without a recorded quote count as 0.</p>
   <div class="cols" style="margin-top:2rem"><div class="panel"><h2>Recent activity</h2>${d.recent.length ? `<table class="t"><tbody>${d.recent.map((r) => `<tr class="click" data-ref="${esc(r.reference)}"><td class="mono">${esc(r.reference)}</td><td>${esc(r.client_name)}</td><td><span class="pill s-${esc(r.status)}">${esc(STATUS[r.status])}</span></td><td class="muted">${esc(fmtDate(r.created_at))}</td></tr>`).join("")}</tbody></table>` : '<div class="empty"><strong>No orders yet</strong>New requests appear here.</div>'}</div>
   <div class="panel"><h2>Shortcuts</h2><p><a class="btn sm" href="#/services/new">New service</a></p><p><a class="btn sm ghost" href="#/portfolio/new">New portfolio project</a></p><p><a class="btn sm ghost" href="#/site">Edit site / availability</a></p>
     <p class="muted">${svc} services and ${pf} projects published.</p></div></div>`;
  $$("tr[data-ref]").forEach((tr) => tr.onclick = async () => { const r = must(await sb.from("orders").select("id").eq("reference", tr.dataset.ref).single()); location.hash = "#/orders/" + r.id; });
}

/* ---------- orders ---------- */
const OS = { page: 0, status: "", q: "" }, PS = 20;
async function viewOrders() {
  const clean = OS.q.replace(/[,()%*\\]/g, " ").trim();
  let q = sb.from("orders").select("id,reference,status,client_name,client_email,created_at,estimated_min,estimated_max,quoted_total,needs_quote,currency", { count: "exact" }).order("created_at", { ascending: false }).range(OS.page * PS, OS.page * PS + PS - 1);
  if (OS.status) q = q.eq("status", OS.status);
  if (clean) q = q.or(`reference.ilike.%${clean}%,client_name.ilike.%${clean}%,client_email.ilike.%${clean}%`);
  const { data, count, error } = await q; if (error) throw error;
  view().innerHTML = `<div class="bar"><h1>Orders</h1><form id="of" style="display:flex;gap:.5rem;flex-wrap:wrap"><select class="input" name="status" aria-label="Status"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, t]) => `<option value="${k}" ${OS.status === k ? "selected" : ""}>${t}</option>`).join("")}</select>
    <input class="input" name="q" placeholder="Reference, name, email" value="${esc(OS.q)}" aria-label="Search"><button class="btn sm">Filter</button></form></div>
    ${data.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Ref</th><th>Client</th><th>Status</th><th>Estimate / quote</th><th>Created</th></tr></thead><tbody>
    ${data.map((r) => `<tr class="click" data-id="${r.id}"><td class="mono">${esc(r.reference)}</td><td>${esc(r.client_name)}<div class="muted">${esc(r.client_email)}</div></td><td><span class="pill s-${esc(r.status)}">${esc(STATUS[r.status])}</span></td>
      <td>${r.quoted_total != null ? money(r.quoted_total, r.currency) : r.estimated_min != null ? range(r.estimated_min, r.estimated_max, r.currency) : '<span class="muted">Needs quotation</span>'}</td><td class="muted">${esc(fmtDate(r.created_at))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><strong>No orders found</strong>Adjust the filters.</div>'}
    <div class="bar" style="margin-top:1rem"><span class="muted">${count ?? 0} total · page ${OS.page + 1}</span><span><button class="btn ghost sm" id="pp" ${OS.page ? "" : "disabled"}>Previous</button> <button class="btn ghost sm" id="pn" ${(OS.page + 1) * PS >= (count || 0) ? "disabled" : ""}>Next</button></span></div>`;
  $("#of").onsubmit = (e) => { e.preventDefault(); OS.status = e.target.status.value; OS.q = e.target.q.value; OS.page = 0; viewOrders(); };
  $("#pp").onclick = () => { OS.page--; viewOrders(); }; $("#pn").onclick = () => { OS.page++; viewOrders(); };
  $$("tr[data-id]").forEach((tr) => tr.onclick = () => (location.hash = "#/orders/" + tr.dataset.id));
}
async function viewOrder(id) {
  const o = must(await sb.from("orders").select("*, order_items(*), order_attachments(*), order_status_history(*), order_messages(*)").eq("id", id).single());
  const att = await Promise.all(o.order_attachments.map(async (a) => ({ ...a, url: (await sb.storage.from("order-attachments").createSignedUrl(a.storage_path, 300)).data?.signedUrl })));
  const msgs = o.order_messages.sort((a, b) => a.id - b.id), hist = o.order_status_history.sort((a, b) => a.id - b.id);
  view().innerHTML = `<div class="bar"><div><a href="#/orders" class="muted">← Orders</a><h1 style="margin:.3rem 0 0">${esc(o.reference)}</h1></div><button class="btn ghost sm" id="dl">Download summary</button></div>
  <div class="cols"><div>
   <div class="panel"><h2>Status</h2><form id="stf"><span class="pill s-${esc(o.status)}">${esc(STATUS[o.status])}</span><div style="margin-top:1rem">${fld("status", "Change to", o.status, { opts: Object.entries(STATUS) })}${fld("note", "Note (saved in history)", "", { area: 2 })}${chk("vis", "Show this note to the client", false)}</div><button class="btn sm">Update status</button></form></div>
   <div class="panel"><h2>Quotation & deadline</h2><form id="qf">${fld("quoted_total", `Quoted total (${o.currency})`, o.quoted_total ?? "", { type: "number", attrs: 'min="0" step="1"' })}${fld("deadline", "Deadline", o.deadline ?? "", { type: "date" })}<p class="muted" style="font-size:.8rem">Estimate from items: ${o.estimated_min != null ? range(o.estimated_min, o.estimated_max, o.currency) : "none (custom quotation)"}. Changes are written to the audit log.</p><button class="btn sm">Save quotation</button></form></div>
   <div class="panel"><h2>Client</h2><p><strong>${esc(o.client_name)}</strong><br><a href="mailto:${esc(o.client_email)}">${esc(o.client_email)}</a>${o.client_discord ? `<br>Discord: ${esc(o.client_discord)}` : ""}</p><p class="muted">Budget: ${o.budget != null ? money(o.budget, o.currency) : "—"} · Deadline requested: ${esc(o.deadline || "—")}</p></div></div>
  <div>
   <div class="panel"><h2>Items (price snapshot)</h2>${o.order_items.map((i) => `<div style="padding:.6rem 0;border-top:1px solid var(--border)"><strong>${esc(i.service_name)}</strong> ${esc(i.tier_name || "")} ×${i.quantity}<div class="muted">${i.unit_price_min != null ? range(i.unit_price_min, i.unit_price_max, o.currency) : "Quotation"}${i.addons.length ? " + " + i.addons.map((a) => esc(a.name)).join(", ") : ""}</div>
     ${Object.entries(i.brief || {}).map(([k, v]) => `<div class="muted">${esc(k)}: ${esc(v)}</div>`).join("")}</div>`).join("")}</div>
   <div class="panel"><h2>Brief</h2><p style="white-space:pre-wrap">${esc(o.brief)}</p><h2 style="margin-top:1.5rem">Attachments</h2>${att.length ? att.map((a) => `<div>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.file_name)}</a>` : esc(a.file_name)} <span class="muted">${esc(a.mime_type || "")} · ${a.size_bytes ? Math.round(a.size_bytes / 1024) + " KB" : ""}</span></div>`).join("") + '<p class="muted" style="font-size:.8rem">Links expire after 5 minutes.</p>' : '<p class="muted">None.</p>'}</div></div></div>
  <div class="panel"><h2>Messages</h2>${msgs.map((m) => `<div class="msg ${m.visibility}"><span class="eyebrow">${m.visibility === "internal" ? "Internal — never shown to client" : m.author_type === "admin" ? "To client" : "From client"} · ${esc(fmtDate(m.created_at))}</span><br>${esc(m.body)}</div>`).join("") || '<p class="muted">No messages.</p>'}
   <form id="mf" style="margin-top:1rem">${fld("body", "New message", "", { area: 3, attrs: "required maxlength=4000" })}${fld("visibility", "Visibility", "internal", { opts: [["internal", "Internal note (private)"], ["client", "Visible to client"]] })}<button class="btn sm">Add message</button></form></div>
  <div class="panel"><h2>Status history</h2>${hist.map((h) => `<div style="padding:.4rem 0;border-top:1px solid var(--border)"><strong>${esc(STATUS[h.to_status] || h.to_status)}</strong> <span class="muted">${esc(fmtDate(h.created_at))}${h.client_visible ? " · visible to client" : ""}</span>${h.note ? `<div>${esc(h.note)}</div>` : ""}</div>`).join("")}</div>`;
  const redo = () => viewOrder(id);
  $("#stf").onsubmit = (e) => { e.preventDefault(); const f = e.target; busy($("button", f), async () => { must(await sb.rpc("admin_set_order_status", { p_order: id, p_status: f.status.value, p_note: f.note.value, p_client_visible: f.vis.checked })); toast("Status updated.", "ok"); redo(); }); };
  $("#qf").onsubmit = (e) => { e.preventDefault(); const f = e.target; busy($("button", f), async () => { const v = f.quoted_total.value; const { error } = await sb.from("orders").update({ quoted_total: v === "" ? null : +v, quoted_at: v === "" ? null : new Date().toISOString(), deadline: f.deadline.value || null }).eq("id", id); if (error) throw error; toast("Saved.", "ok"); redo(); }); };
  $("#mf").onsubmit = (e) => { e.preventDefault(); const f = e.target, u = sb.auth.getUser(); busy($("button", f), async () => { const { data: { user } } = await u; const { error } = await sb.from("order_messages").insert({ order_id: id, visibility: f.visibility.value, author_type: "admin", author_id: user.id, body: f.body.value.trim() }); if (error) throw error; redo(); }); };
  $("#dl").onclick = () => {
    const t = [`Order ${o.reference}`, `Status: ${STATUS[o.status]}`, `Created: ${o.created_at}`, `Client: ${o.client_name} <${o.client_email}> ${o.client_discord || ""}`, `Deadline: ${o.deadline || "-"}`, `Quoted: ${o.quoted_total ?? "-"} ${o.currency}`, "", "ITEMS", ...o.order_items.map((i) => `- ${i.service_name} ${i.tier_name || ""} x${i.quantity}  ${i.unit_price_min ?? "quote"}`), "", "BRIEF", o.brief].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/plain" })); a.download = `${o.reference}.txt`; a.click(); URL.revokeObjectURL(a.href);
  };
}

/* ---------- audit ---------- */
async function viewAudit() {
  const d = must(await sb.from("audit_logs").select("id,actor_id,action,table_name,row_id,created_at").order("created_at", { ascending: false }).limit(150));
  view().innerHTML = `<h1>Audit log</h1>${d.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>When</th><th>Action</th><th>Table</th><th>Row</th><th>Actor</th></tr></thead><tbody>${d.map((r) => `<tr><td class="muted">${esc(fmtDate(r.created_at))}</td><td>${esc(r.action)}</td><td>${esc(r.table_name)}</td><td class="mono">${esc(r.row_id || "")}</td><td class="mono muted">${esc((r.actor_id || "system").slice(0, 8))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><strong>No activity yet</strong></div>'}`;
}

boot();
