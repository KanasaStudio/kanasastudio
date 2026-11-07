/* Admin: Toko — pesanan (verifikasi bayar → kirim → selesai), top up KanasaToken, paket & kurs, pengguna/saldo. */
import { sb, esc, toast, busy, must } from "./admin-lib.js";
import { $, $$, money } from "./util.js";

const TABS = [["", "Pesanan"], ["packs", "Paket & kurs KT"], ["users", "Pengguna & saldo"]];
const SL = { menunggu_pembayaran: "Menunggu Pembayaran", menunggu_dikirim: "Menunggu Dikirim", sudah_terkirim: "Sudah Terkirim", selesai: "Selesai", dibatalkan: "Dibatalkan" };
const dt = (v) => (v ? new Date(v).toLocaleString() : "—");
const shell = (tab, body) => `<div class="bar"><h1>Shop orders</h1><a class="btn ghost sm" href="../#/store" target="_blank" rel="noopener">View store ↗</a></div>
  <nav class="tabs" style="display:flex;gap:1.2rem;border-bottom:1px solid var(--border);margin-bottom:1.5rem" aria-label="Shop sections">${TABS.map(([k, t]) => `<a href="#/shop${k ? "/" + k : ""}" ${k === tab ? 'aria-current="page"' : ""} style="padding:.5rem 0">${t}</a>`).join("")}</nav>${body}`;

export async function viewShop(el, tab = "") {
  const t = TABS.some(([k]) => k === tab) ? tab : "";
  el.innerHTML = shell(t, '<div id="sbody"><div class="skeleton" style="height:10rem"></div></div>');
  await { "": orders, packs, users }[t]($("#sbody", el));
}
const reload = (tab) => viewShop($("#view"), tab);

async function orders(el, status = "") {
  const list = must(await sb.rpc("admin_shop_orders", { p_status: status || null, p_limit: 150 }));
  const all = status ? null : list, n = (s) => (all || []).filter((o) => o.status === s).length;
  el.innerHTML = `${all ? `<div class="stats">${Object.keys(SL).slice(0, 4).map((s) => `<div class="stat"><b>${n(s)}</b><span>${SL[s]}</span></div>`).join("")}</div>` : ""}
    <div class="filters" style="margin:1rem 0"><select class="input" id="sst" style="max-width:16rem" aria-label="Filter status"><option value="">All statuses</option>${Object.entries(SL).map(([k, t]) => `<option value="${k}" ${status === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    ${list.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Order</th><th>Buyer</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${list.map((o) => `<tr>
      <td><strong class="mono">${esc(o.reference)}</strong><br><span class="muted">${o.kind === "topup" ? "Top up" : "Product"} · ${dt(o.created_at)}</span></td>
      <td>${esc(o.buyer || "")}${o.whatsapp ? `<br><span class="muted">WA ${esc(o.whatsapp)}</span>` : ""}</td>
      <td>${o.items.map((i) => esc(i.title)).join("<br>")}</td>
      <td>${money(o.total_idr)}<br><span class="muted">${o.total_tokens} KT · ${o.pay_with === "tokens" ? "paid with KT" : esc(o.method || "transfer")}</span></td>
      <td><span class="pill">${SL[o.status]}</span>${o.proof_path ? `<br><button class="btn ghost sm" data-proof="${esc(o.proof_path)}">View proof</button>` : ""}${o.reject_reason ? `<br><span class="muted">Rejected: ${esc(o.reject_reason)}</span>` : ""}</td>
      <td style="white-space:nowrap">${actions(o)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><strong>No orders</strong>Shop orders and KanasaToken top-ups appear here.</div>`}`;
  $("#sst", el).addEventListener("change", (e) => orders(el, e.target.value));
  el.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.proof) { const { data, error } = await sb.storage.from("order-attachments").createSignedUrl(b.dataset.proof, 300); if (error) return toast(error.message); return window.open(data.signedUrl, "_blank", "noopener"); }
    const id = b.dataset.id, a = b.dataset.a; if (!a) return;
    let args = { p_order: id }, fn = { confirm: "admin_shop_confirm", reject: "admin_shop_reject", deliver: "admin_shop_deliver", complete: "admin_shop_complete", cancel: "admin_shop_cancel" }[a];
    if (a === "confirm" && !confirm("Confirm that the payment was received?" + (b.dataset.kind === "topup" ? " The tokens will be credited to the buyer." : ""))) return;
    if (a === "reject") { const r = prompt("Reason shown to the buyer:", "Bukti pembayaran tidak sesuai."); if (r === null) return; args.p_reason = r; }
    if (a === "deliver") { const u = prompt("Download link (https://…). Leave empty to use the product's own link (single-item orders only):", ""); if (u === null) return; const nt = prompt("Optional message to the buyer (e.g. password, instructions):", ""); args.p_url = u || null; args.p_note = nt || null; }
    if (a === "cancel") { const r = prompt("Cancel this order? Reason (paid-with-KT orders are refunded):", ""); if (r === null) return; args.p_reason = r; }
    await busy(b, async () => { const { error } = await sb.rpc(fn, args); if (error) return toast(error.message); toast("Done.", "ok"); await orders(el, status); });
  };
}
function actions(o) {
  const B = (a, t, cls = "ghost") => `<button class="btn ${cls} sm" data-a="${a}" data-id="${o.id}" data-kind="${o.kind}">${t}</button> `;
  if (o.status === "menunggu_pembayaran") return (o.pay_with === "transfer" ? B("confirm", o.kind === "topup" ? "Confirm & credit" : "Confirm payment", "") + (o.proof_path ? B("reject", "Reject proof") : "") : "") + B("cancel", "Cancel");
  if (o.status === "menunggu_dikirim") return B("deliver", "Send product", "") + B("cancel", "Cancel & refund");
  if (o.status === "sudah_terkirim") return B("complete", "Mark complete");
  return "";
}

async function packs(el) {
  const [cfg, pk] = await Promise.all([sb.from("token_config").select("*").eq("id", 1).single().then(must), sb.from("token_packs").select("*").order("sort_order").then(must)]);
  el.innerHTML = `<form id="cfgf" class="panel"><h2>KanasaToken settings</h2><div class="cols" style="gap:1rem;flex-wrap:wrap;align-items:end">
      <label class="field">1 KT = Rp <input class="input" name="rate" type="number" min="1" value="${cfg.rate_idr}" style="max-width:9rem"></label>
      <label class="field">Custom min <input class="input" name="min" type="number" min="1" value="${cfg.min_tokens}" style="max-width:7rem"></label>
      <label class="field">Custom max <input class="input" name="max" type="number" min="1" value="${cfg.max_tokens}" style="max-width:7rem"></label>
      <label class="check field"><input type="checkbox" name="on" ${cfg.enabled ? "checked" : ""}> Top up open</label><button class="btn">Save</button></div>
    <p class="muted" style="font-size:.85rem">Changing the rate affects new orders only. Product token prices are always price ÷ rate (rounded up).</p></form>
    <div class="panel"><h2>Top-up packs</h2><div class="tablewrap"><table class="t"><thead><tr><th>Label</th><th>KT</th><th>Bonus</th><th>Popular</th><th>Active</th><th>Order</th><th></th></tr></thead><tbody>${pk.map((p) => row(p)).join("")}${row({ id: "", label: "", tokens: 10, bonus: 0, is_popular: false, is_active: true, sort_order: (pk.length + 1) * 10 })}</tbody></table></div></div>`;
  $("#cfgf", el).addEventListener("submit", async (e) => { e.preventDefault(); const f = e.target, b = $("button", f);
    await busy(b, async () => { const { error } = await sb.from("token_config").update({ rate_idr: +f.rate.value, min_tokens: +f.min.value, max_tokens: +f.max.value, enabled: f.on.checked, updated_at: new Date().toISOString() }).eq("id", 1); if (error) return toast(error.message); toast("Saved.", "ok"); }); });
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-save],button[data-del]"); if (!b) return; const tr = b.closest("tr"), id = tr.dataset.id;
    if (b.dataset.del) { if (!confirm("Delete this pack?")) return; const { error } = await sb.from("token_packs").delete().eq("id", id); if (error) return toast(error.message); return reload("packs"); }
    const v = (n) => tr.querySelector(`[name=${n}]`), row = { label: v("label").value.trim() || null, tokens: +v("tokens").value, bonus: +v("bonus").value || 0, is_popular: v("pop").checked, is_active: v("act").checked, sort_order: +v("ord").value || 0 };
    if (!(row.tokens > 0)) return toast("Tokens must be above 0.");
    await busy(b, async () => { const { error } = id ? await sb.from("token_packs").update(row).eq("id", id) : await sb.from("token_packs").insert(row); if (error) return toast(error.message); toast("Saved.", "ok"); await reload("packs"); });
  });
}
const row = (p) => `<tr data-id="${p.id}"><td><input class="input" name="label" value="${esc(p.label || "")}" style="min-width:7rem"></td><td><input class="input" name="tokens" type="number" min="1" value="${p.tokens}" style="width:5.5rem"></td><td><input class="input" name="bonus" type="number" min="0" value="${p.bonus}" style="width:5rem"></td>
  <td><input type="checkbox" name="pop" ${p.is_popular ? "checked" : ""}></td><td><input type="checkbox" name="act" ${p.is_active ? "checked" : ""}></td><td><input class="input" name="ord" type="number" value="${p.sort_order}" style="width:4.5rem"></td>
  <td style="white-space:nowrap"><button class="btn sm" data-save>${p.id ? "Save" : "Add"}</button>${p.id ? ` <button class="btn ghost sm" data-del>Delete</button>` : ""}</td></tr>`;

async function users(el, q = "") {
  const list = must(await sb.rpc("admin_token_users", { p_q: q || null }));
  el.innerHTML = `<div class="filters" style="margin-bottom:1rem"><input class="input" id="uq" placeholder="Search email or name" value="${esc(q)}" style="max-width:20rem"></div>
    ${list.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>User</th><th>WhatsApp</th><th>Joined</th><th>KT balance</th><th></th></tr></thead><tbody>${list.map((u) => `<tr><td><strong>${esc(u.name || "")}</strong><br><span class="muted">${esc(u.email)}</span></td><td>${esc(u.whatsapp || "—")}</td><td>${dt(u.joined)}</td><td class="mono">${u.balance}</td><td><button class="btn ghost sm" data-adj="${u.id}">Adjust</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><strong>No users</strong>Buyers who register appear here.</div>`}`;
  let t; $("#uq", el).addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => users(el, e.target.value.trim()), 350); });
  el.onclick = async (e) => { const b = e.target.closest("[data-adj]"); if (!b) return;
    const d = prompt("Add (positive) or remove (negative) KanasaToken:", "10"); if (d === null) return; const n = parseInt(d, 10); if (!n) return toast("Enter a whole number.");
    const note = prompt("Note (shown in the buyer's history):", "Bonus dari admin"); if (note === null) return;
    await busy(b, async () => { const { error } = await sb.rpc("admin_token_adjust", { p_user: b.dataset.adj, p_delta: n, p_note: note }); if (error) return toast(error.message); toast("Balance updated.", "ok"); await users(el, q); }); };
}
