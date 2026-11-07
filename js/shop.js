/* Akun pembeli, keranjang, dompet KanasaToken (KT) dan pesanan toko.
   Rute: #/akun · #/keranjang · #/dompet · #/pesanan[?o=<id>]
   Semua logika uang ada di server (RPC SECURITY DEFINER); halaman ini hanya menampilkan dan memanggilnya. */
import { sb } from "./db.js";
import { esc, safeUrl, $, $$, money, fmtDate, store, toast } from "./util.js";
import { play as sfx } from "./sfx.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const H = { setMeta() {}, loadStore: async () => ({ products: [] }), rerender() {}, set: () => ({}) };
const LOGO = "assets/kanasatoken-64.png", LOGO_BIG = "assets/kanasatoken-256.png";
const SL = { menunggu_pembayaran: "Menunggu Pembayaran", menunggu_dikirim: "Menunggu Dikirim", sudah_terkirim: "Sudah Terkirim", selesai: "Selesai", dibatalkan: "Dibatalkan" };
const STEPS = ["menunggu_pembayaran", "menunggu_dikirim", "sudah_terkirim", "selesai"];
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const KEY = "kns_kcart";
let U = null, CFG = null, WAL = null, ORD = null, CART = [], ADMIN = false, POLL = null, RECOVERY = false, ready;
const kt = (n) => `<span class="kt"><img class="kt-ico" src="${LOGO}" alt="" width="18" height="18"> <b class="mono">${Number(n || 0).toLocaleString("id-ID")}</b> <span class="muted">KT</span></span>`;
const ktText = (n) => `${Number(n || 0).toLocaleString("id-ID")} KT`;
const ERR = [[/invalid login/i, "Email atau kata sandi salah."], [/already registered|already been registered/i, "Email ini sudah terdaftar. Silakan masuk."], [/password.*(at least|short)/i, "Kata sandi minimal 8 karakter."],
  [/email not confirmed/i, "Email belum dikonfirmasi. Cek kotak masuk emailmu."], [/rate limit|too many/i, "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."], [/offline/i, "Kamu sedang offline. Coba lagi saat tersambung."]];
const nice = (m) => (ERR.find(([r]) => r.test(m || "")) || [0, m || "Terjadi kesalahan. Coba lagi."])[1];
const page = (eyebrow, title, body, wide) => `<div class="container page shop"><div class="page-head"><span class="eyebrow">${esc(eyebrow)}</span><h1 style="margin-top:1rem;font-size:var(--fs-h2)">${esc(title)}</h1></div>${body}</div>`;
const gate = (next, why) => page("Akun", "Masuk dulu", `<div class="summary k-gate"><p>${esc(why || "Halaman ini khusus pembeli yang sudah masuk.")}</p><a class="btn" href="#/akun?next=${next}">Masuk atau daftar</a></div>`);

/* ---------- state ---------- */
const guestCart = () => { const v = store.get(KEY, []); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) : []; };
async function loadCart() {
  if (!U) { CART = guestCart(); return; }
  const { data } = await sb.from("cart_items").select("product_id").order("added_at");
  CART = (data || []).map((r) => r.product_id);
}
async function loadCfg(force) { if (CFG && !force) return CFG; const { data, error } = await sb.rpc("shop_config"); if (error) throw error; return (CFG = data); }
async function loadWallet() { if (!U) return (WAL = null); const { data, error } = await sb.rpc("wallet_me"); if (!error) WAL = data; return WAL; }
async function loadOrders() { const { data, error } = await sb.rpc("shop_orders_me"); if (error) throw error; return (ORD = data || []); }
const USER_SVG = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
function chip() {
  const a = $("#acct-btn"), c = $("#kcart-btn"); if (!a) return;
  a.innerHTML = U ? `<img class="kt-ico" src="${LOGO}" alt="" width="22" height="22"><span class="k-bal mono">${WAL ? Number(WAL.balance).toLocaleString("id-ID") : "…"}</span>` : USER_SVG;
  a.classList.toggle("in", !!U);
  a.setAttribute("aria-label", U ? "Menu akun" : "Masuk atau daftar"); a.setAttribute("aria-haspopup", U ? "menu" : "false"); a.title = U ? "Akun & dompet" : "Masuk / Daftar";
  if (c) { const n = CART.length; c.querySelector(".count").textContent = n; c.querySelector(".count").hidden = !n; }
  if (!U) closeMenu();
}
function closeMenu() { $("#acct-menu")?.remove(); $("#acct-btn")?.setAttribute("aria-expanded", "false"); }
function toggleMenu() {
  if ($("#acct-menu")) return closeMenu();
  const name = U.user_metadata?.name || (U.email || "").split("@")[0], a = $("#acct-btn"), m = document.createElement("div");
  m.id = "acct-menu"; m.setAttribute("role", "menu");
  const I = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  m.innerHTML = `<div class="am-head"><b>${esc(name)}</b><span class="muted">${esc(U.email || "")}</span></div>
    <a class="am-kt" href="#/dompet" role="menuitem"><img src="${LOGO}" alt="" width="34" height="34"><span><span class="muted">Saldo KanasaToken</span><br><b class="mono">${WAL ? Number(WAL.balance).toLocaleString("id-ID") : "0"} KT</b></span><span class="am-plus">+ Top up</span></a>
    <a href="#/pesanan" role="menuitem">${I('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>')}Pesanan saya</a>
    <a href="#/keranjang" role="menuitem">${I('<path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.2a1 1 0 0 0 1-.76L19 8H6"/><circle cx="9" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/>')}Keranjang</a>
    <a href="#/akun" role="menuitem">${I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>')}Profil</a>
    ${ADMIN ? `<a href="admin/" role="menuitem">${I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>')}Panel admin</a>` : ""}
    <button type="button" data-k="logout" role="menuitem">${I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>')}Keluar</button>`;
  document.body.appendChild(m); a.setAttribute("aria-expanded", "true"); m.querySelector("a")?.focus({ preventScroll: true });
}
async function afterAuth(u) {
  U = u || null; WAL = null; ORD = null; ADMIN = false;
  if (U) {
    const local = guestCart();
    if (local.length) { await Promise.all(local.map((id) => sb.from("cart_items").insert({ user_id: U.id, product_id: id }))); store.set(KEY, []); }
    sb.rpc("is_admin").then(({ data }) => { ADMIN = data === true; });
    await Promise.all([loadCart(), loadWallet()]);
    const nx = store.get("kns_next", null); if (nx) { store.set("kns_next", null); location.hash = "#/" + String(nx).replace(/[^a-z0-9/_-]/gi, ""); }
  } else await loadCart();
  chip();
}

export function initShop(h) {
  Object.assign(H, h);
  ready = sb.auth.getSession().then(({ data }) => afterAuth(data.session?.user)).catch(() => chip());
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "PASSWORD_RECOVERY") { RECOVERY = true; location.hash = "#/akun?m=baru"; }
    if (ev === "SIGNED_IN" && s?.user && U && s.user.id === U.id) return;   // token refresh / tab refocus, nothing changed
    if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") setTimeout(() => afterAuth(s?.user).then(() => { if (/^#\/(akun|keranjang|dompet|pesanan)/.test(location.hash)) H.rerender(); }), 0);
  });
  chip();
  document.addEventListener("click", (e) => {
    const a = e.target.closest("#acct-btn");
    if (a && U) { e.preventDefault(); return toggleMenu(); }
    if ($("#acct-menu") && (!e.target.closest("#acct-menu") || e.target.closest("#acct-menu a, #acct-menu button"))) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("hashchange", closeMenu);
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("input", onInput);
}
export const cartBtn = (id) => `<button class="btn ghost" type="button" data-k="add" data-id="${esc(id)}">+ Keranjang</button>`;
export const isShopRoute = (p) => ["akun", "keranjang", "dompet", "pesanan"].includes(p);

/* ---------- views ---------- */
export async function viewShop(parts, q) {
  await ready;
  clearInterval(POLL);
  const k = parts[0];
  try {
    if (k === "akun") return viewAkun(q);
    if (k === "keranjang") return await viewCart();
    if (k === "dompet") return U ? await viewWallet() : gate("dompet", "Masuk untuk melihat dan mengisi saldo KanasaToken.");
    if (k === "pesanan") return U ? await viewOrders(q) : gate("pesanan", "Masuk untuk melihat pesananmu.");
  } catch (e) { return page("Oops", "Gagal memuat", `<p class="err">${esc(nice(e.message))}</p><p><button class="btn" data-k="reload">Coba lagi</button></p>`); }
  return "";
}
export function wireShop(parts, q) {
  if (!U || !["dompet", "pesanan"].includes(parts[0])) return;
  const snap = () => JSON.stringify((ORD || []).map((o) => [o.id, o.status, o.has_proof]));
  POLL = setInterval(async () => {
    if (document.hidden || !/^#\/(dompet|pesanan)/.test(location.hash)) return;
    const before = new Map((ORD || []).map((o) => [o.id, o.status])), s0 = snap();
    try { await loadOrders(); await loadWallet(); } catch { return; }
    if (snap() === s0) return;
    let kind = "status";
    for (const o of ORD) { const b = before.get(o.id); if (b && b !== o.status) { if (o.status === "sudah_terkirim") kind = "deliver"; else if (o.kind === "topup" && o.status === "selesai") kind = "coin"; } }
    sfx(kind); toast("Status pesananmu diperbarui.", "ok"); chip(); H.rerender();
  }, 15000);
}

function viewAkun(q) {
  H.setMeta("Akun", "Masuk atau daftar akun pembeli.");
  if (RECOVERY || q.m === "baru") {
    return page("Akun", "Buat kata sandi baru", `<form class="summary k-form" id="k-newpw"><div class="field"><label class="req" for="k-pw">Kata sandi baru</label><input class="input" id="k-pw" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></div><div class="err" id="k-err" role="alert"></div><button class="btn">Simpan kata sandi</button></form>`);
  }
  if (!U) {
    const m = ["daftar", "lupa"].includes(q.m) ? q.m : "masuk", next = esc(q.next || "");
    const tabs = `<div class="seg k-tabs" role="tablist"><a role="tab" aria-selected="${m === "masuk"}" href="#/akun?m=masuk${next ? "&next=" + next : ""}">Masuk</a><a role="tab" aria-selected="${m === "daftar"}" href="#/akun?m=daftar${next ? "&next=" + next : ""}">Daftar</a></div>`;
    const err = `<div class="err" id="k-err" role="alert"></div>`;
    const forms = {
      masuk: `<form class="summary k-form" id="k-login" data-next="${next}"><div class="field"><label class="req" for="k-email">Email</label><input class="input" id="k-email" type="email" autocomplete="email" required maxlength="254"></div>
        <div class="field"><label class="req" for="k-pw">Kata sandi</label><input class="input" id="k-pw" type="password" autocomplete="current-password" required maxlength="72"></div>${err}
        <button class="btn" id="k-go">Masuk</button> <a class="muted k-link" href="#/akun?m=lupa">Lupa kata sandi?</a></form>`,
      daftar: `<form class="summary k-form" id="k-signup" data-next="${next}"><div class="field"><label class="req" for="k-name">Nama</label><input class="input" id="k-name" autocomplete="name" required minlength="2" maxlength="60"></div>
        <div class="field"><label class="req" for="k-email">Email</label><input class="input" id="k-email" type="email" autocomplete="email" required maxlength="254"></div>
        <div class="field"><label class="req" for="k-pw">Kata sandi (min. 8 karakter)</label><input class="input" id="k-pw" type="password" autocomplete="new-password" required minlength="8" maxlength="72"></div>${err}
        <button class="btn" id="k-go">Buat akun</button><p class="muted" style="font-size:.8125rem;margin-top:1rem">Dengan mendaftar kamu setuju dengan <a href="#/legal/terms">Syarat</a> dan <a href="#/legal/refund">Kebijakan Refund</a>.</p></form>`,
      lupa: `<form class="summary k-form" id="k-forgot"><p class="muted">Masukkan emailmu, kami kirim tautan untuk membuat kata sandi baru.</p><div class="field"><label class="req" for="k-email">Email</label><input class="input" id="k-email" type="email" autocomplete="email" required></div>${err}<button class="btn" id="k-go">Kirim tautan</button> <a class="muted k-link" href="#/akun?m=masuk">Kembali</a></form>`,
    };
    return page("Akun", m === "daftar" ? "Buat akun" : m === "lupa" ? "Reset kata sandi" : "Masuk", `<div class="k-auth"><div>${m === "lupa" ? "" : tabs}${m === "lupa" ? "" : googleBtn(next)}${forms[m]}</div>${perks()}</div>`);
  }
  const name = U.user_metadata?.name || (U.email || "").split("@")[0];
  return page("Akun", `Halo, ${name}`, `<div class="k-tiles">
      <a class="k-tile" href="#/dompet"><img src="${LOGO_BIG}" alt="" width="56" height="56"><span class="muted">Saldo KanasaToken</span><strong>${WAL ? ktText(WAL.balance) : "…"}</strong><span class="k-cta">Top up →</span></a>
      <a class="k-tile" href="#/pesanan"><span class="k-big" aria-hidden="true">📦</span><span class="muted">Pesanan</span><strong>Lihat status</strong><span class="k-cta">Buka →</span></a>
      <a class="k-tile" href="#/keranjang"><span class="k-big" aria-hidden="true">🛒</span><span class="muted">Keranjang</span><strong>${CART.length} item</strong><span class="k-cta">Buka →</span></a>
    </div>
    <form class="summary k-form" id="k-profile" style="margin-top:2rem"><div class="eyebrow">Profil</div>
      <div class="field"><label for="k-name">Nama</label><input class="input" id="k-name" value="${esc(name)}" maxlength="60" required></div>
      <div class="field"><label for="k-email">Email</label><input class="input" id="k-email" value="${esc(U.email)}" disabled></div>
      <div class="field"><label for="k-wa">WhatsApp (opsional, dipakai admin untuk menghubungi saat pengiriman)</label><input class="input" id="k-wa" value="" maxlength="30" inputmode="tel" placeholder="+62…"></div>
      <div class="err" id="k-err" role="alert"></div><button class="btn">Simpan</button> <button class="btn ghost" type="button" data-k="logout">Keluar</button>${ADMIN ? ` <a class="btn ghost" href="admin/">Panel admin</a>` : ""}</form>`);
}
const G_SVG = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.3-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.9z"/></svg>`;
const GOOGLE_LOGIN = false;   // ubah ke true setelah provider Google diaktifkan di Supabase (lihat docs/SHOP.md)
const googleBtn = (next) => !GOOGLE_LOGIN ? "" :  `<button type="button" class="btn ghost k-google" data-k="google" data-next="${next}">${G_SVG}<span>Lanjutkan dengan Google</span></button><div class="k-or"><span>atau pakai email</span></div>`;
const perks = () => `<aside class="summary k-perks"><img src="${LOGO_BIG}" alt="Logo KanasaToken" width="96" height="96"><h3>Kenapa punya akun?</h3><ul><li>Keranjang tersimpan di semua perangkat</li><li>Top up <b>KanasaToken</b> sekali, bayar produk kapan saja</li><li>Pantau pesanan: Menunggu Pembayaran → Menunggu Dikirim → Sudah Terkirim → Selesai</li></ul></aside>`;

async function viewCart() {
  H.setMeta("Keranjang", "Produk yang kamu simpan sementara.");
  const [{ products }, cfg] = await Promise.all([H.loadStore(), loadCfg().catch(() => null), loadWallet()]);
  const items = CART.map((id) => products.find((p) => p.id === id)).filter((p) => p && +p.price > 0);
  const rate = cfg?.rate_idr || 1000, total = items.reduce((s, p) => s + +p.price, 0), need = Math.ceil(total / rate);
  if (!items.length) return page("Keranjang", "Keranjang belanja", `<div class="k-empty"><p>Keranjangmu kosong.</p><a class="btn" href="#/store">Lihat Store</a></div>`);
  const bal = WAL?.balance ?? 0, enough = U && bal >= need, methods = cfg?.methods || [];
  const rows = items.map((p) => `<div class="k-row">${safeUrl(p.cover_url) ? `<img src="${esc(safeUrl(p.cover_url))}" alt="" loading="lazy">` : `<span class="k-ph"></span>`}
      <div><a href="#/store/${esc(p.slug)}"><strong>${esc(p.title)}</strong></a><div class="muted mono">${money(p.price)} · ${ktText(Math.ceil(p.price / rate))}</div></div>
      <button class="btn ghost sm" data-k="rm" data-id="${esc(p.id)}" aria-label="Hapus ${esc(p.title)}">Hapus</button></div>`).join("");
  const pay = !U ? `<p class="muted">Masuk dulu untuk checkout. Keranjangmu akan ikut tersimpan.</p><a class="btn" href="#/akun?next=keranjang">Masuk untuk checkout</a>` : `<form id="k-checkout">
      <fieldset class="k-pay"><legend class="eyebrow">Bayar dengan</legend>
        <label class="k-opt"><input type="radio" name="pay" value="tokens" ${enough ? "checked" : ""} ${enough ? "" : "disabled"}><span><b>KanasaToken</b> — langsung diproses<br><span class="muted">Butuh ${ktText(need)} · saldomu ${ktText(bal)}</span>${enough ? "" : ` <a href="#/dompet">Top up</a>`}</span></label>
        <label class="k-opt"><input type="radio" name="pay" value="transfer" ${enough ? "" : "checked"}><span><b>Transfer / e-wallet / QRIS</b><br><span class="muted">Kirim bukti bayar setelah checkout. Total ${money(total)}</span></span></label>
      </fieldset>
      <div class="err" id="k-err" role="alert"></div><button class="btn" id="k-go">Checkout · ${money(total)}</button></form>`;
  return page("Keranjang", "Keranjang belanja", `<div class="two k-cart"><div>${rows}</div><aside class="summary"><div class="line"><span>${items.length} produk</span><b>${money(total)}</b></div><div class="line total"><span>Setara</span><span>${kt(need)}</span></div>${pay}
    <p class="muted" style="font-size:.8125rem;margin-top:1rem">1 KT = ${money(rate)}. Pesanan yang belum dibayar otomatis batal setelah 24 jam.${methods.length || !U ? "" : " (Belum ada metode transfer aktif — gunakan KanasaToken.)"}</p></aside></div>`);
}

async function viewWallet() {
  H.setMeta("Dompet KanasaToken", "Top up KanasaToken.");
  const [cfg] = await Promise.all([loadCfg(true), loadWallet(), loadOrders().catch(() => [])]);
  const packs = (cfg.packs || []).map((p) => `<button type="button" class="k-pack${p.popular ? " pop" : ""}" data-k="pack" data-id="${esc(p.id)}" aria-pressed="false">${p.popular ? `<em>Populer</em>` : ""}<img src="${LOGO}" alt="" width="40" height="40"><strong>${p.tokens}${p.bonus ? ` <small>+${p.bonus}</small>` : ""}</strong><span class="muted">${esc(p.label || "")}</span><span class="mono">${money(p.tokens * cfg.rate_idr)}</span></button>`).join("");
  const ledger = (WAL?.ledger || []).map((l) => `<li><span><b>${l.delta > 0 ? "+" : ""}${l.delta}</b> KT <span class="tag">${esc({ topup: "Top up", purchase: "Belanja", refund: "Refund", adjust: "Penyesuaian" }[l.kind] || l.kind)}</span><br><small class="muted">${esc(l.note || l.ref || "")}</small></span><span class="muted mono">${fmtDate(l.created_at)}<br>saldo ${l.balance_after}</span></li>`).join("");
  const pend = (ORD || []).filter((o) => o.kind === "topup" && o.status === "menunggu_pembayaran");
  return page("Dompet", "Dompet KanasaToken", `<div class="k-wallet"><div class="k-balance"><img class="k-coin" src="${LOGO_BIG}" alt="KanasaToken" width="120" height="120"><div><span class="muted">Saldo kamu</span><div class="k-amt">${Number(WAL?.balance || 0).toLocaleString("id-ID")} <small>KT</small></div><span class="muted">1 KT = ${money(cfg.rate_idr)} · dipakai untuk membeli produk di Store</span></div></div>
    ${pend.length ? `<div class="summary k-note">Ada top up yang menunggu pembayaran. <a href="#/pesanan?o=${esc(pend[0].id)}">Lanjutkan bayar →</a></div>` : ""}
    ${cfg.enabled ? `<form id="k-topup" class="summary"><div class="eyebrow">Pilih paket</div><div class="k-packs">${packs}</div>
      <div class="field" style="margin-top:1.2rem"><label for="k-amount">Atau jumlah sendiri (${cfg.min_tokens}–${cfg.max_tokens} KT)</label><input class="input" id="k-amount" type="number" inputmode="numeric" min="${cfg.min_tokens}" max="${cfg.max_tokens}" placeholder="mis. 40"><small class="muted" id="k-amount-rp"></small></div>
      <input type="hidden" id="k-pack" value=""><div class="err" id="k-err" role="alert"></div><button class="btn" id="k-go">Top up sekarang</button>
      <p class="muted" style="font-size:.8125rem;margin-top:.8rem">Setelah ini kamu akan melihat detail pembayaran. Saldo masuk setelah admin memverifikasi bukti bayarmu.</p></form>` : `<div class="summary">Top up sedang ditutup sementara.</div>`}
    <div class="summary"><div class="eyebrow">Riwayat saldo</div>${ledger ? `<ul class="k-ledger">${ledger}</ul>` : `<p class="muted">Belum ada transaksi.</p>`}</div></div>`);
}

const stepper = (o) => {
  if (o.status === "dibatalkan") return `<div class="k-cancel">Pesanan dibatalkan</div>`;
  const at = STEPS.indexOf(o.status);
  return `<ol class="k-steps" aria-label="Status pesanan">${STEPS.map((s, i) => `<li class="${i < at || o.status === "selesai" ? "done" : i === at ? "now" : ""}" ${i === at ? 'aria-current="step"' : ""}><span class="dot">${i < at || o.status === "selesai" ? "✓" : i + 1}</span><span>${SL[s]}</span></li>`).join("")}</ol>`;
};
const methodBox = (m) => `<div class="k-method"><b>${esc(m.label)}</b>${m.account_name ? `<div>a.n. ${esc(m.account_name)}</div>` : ""}${m.account_number ? `<div class="mono">${esc(m.account_number)} <button type="button" class="btn ghost sm" data-k="copy" data-v="${esc(m.account_number)}">Salin</button></div>` : ""}${safeUrl(m.qris_image_url) ? `<img class="k-qris" src="${esc(safeUrl(m.qris_image_url))}" alt="QRIS" loading="lazy">` : ""}${m.instructions ? `<p class="muted" style="white-space:pre-wrap;font-size:.875rem">${esc(m.instructions)}</p>` : ""}</div>`;

async function viewOrders(q) {
  H.setMeta("Pesanan saya", "Status pesanan toko.");
  const [, cfg] = await Promise.all([loadOrders(), loadCfg()]);
  const f = STEPS.includes(q.s) ? q.s : "", list = (ORD || []).filter((o) => !f || o.status === f);
  const chips = [["", "Semua"], ...STEPS.map((s) => [s, SL[s]])].map(([v, l]) => `<a class="chip" href="#/pesanan${v ? "?s=" + v : ""}" aria-pressed="${v === f}">${l}${v ? ` <span class="muted">${(ORD || []).filter((o) => o.status === v).length}</span>` : ""}</a>`).join("");
  const cards = list.map((o) => {
    const open = q.o === o.id || (!q.o && ["menunggu_pembayaran", "sudah_terkirim"].includes(o.status) && list.indexOf(o) < 2);
    const items = o.items.map((i) => `<li>${esc(i.title)} <span class="muted mono">${o.kind === "topup" ? "" : money(i.price_idr)}</span></li>`).join("");
    let act = "";
    if (o.status === "menunggu_pembayaran") {
      if (o.pay_with === "transfer") {
        const ms = cfg.methods || [], chosen = ms.find((m) => m.id === o.payment_method_id);
        act = `<div class="k-pay-box"><p><b>Bayar ${money(o.total_idr)}</b> sebelum ${fmtDate(o.expires_at)}${o.has_proof ? ` — <span class="k-ok">bukti sudah dikirim, menunggu verifikasi admin</span>` : ""}.</p>
          ${o.reject_reason ? `<p class="err">Bukti ditolak: ${esc(o.reject_reason)}</p>` : ""}${ms.length ? (chosen ? methodBox(chosen) : ms.map(methodBox).join("")) : `<p class="muted">Admin belum menambahkan metode pembayaran.</p>`}
          <form class="k-proof" data-id="${esc(o.id)}" data-method="${esc(o.payment_method_id || "")}"><div class="field"><label for="pf-${esc(o.id)}">${o.has_proof ? "Kirim ulang" : "Unggah"} bukti pembayaran (PNG, JPG, WebP, PDF · maks 10 MB)</label><input class="input" id="pf-${esc(o.id)}" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></div>
          ${!chosen && ms.length > 1 ? `<div class="field"><label>Metode yang kamu pakai</label><select class="input" name="m">${ms.map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join("")}</select></div>` : ""}<div class="err" role="alert"></div><button class="btn">Saya sudah bayar</button></form></div>`;
      } else act = `<p class="muted">Saldo KanasaToken belum cukup saat ini.</p>`;
      if (o.kind === "product") act += `<button class="btn ghost sm" data-k="paykt" data-id="${esc(o.id)}">Bayar dengan KanasaToken (${ktText(o.total_tokens)})</button> `;
      act += `<button class="btn danger sm" data-k="cancel" data-id="${esc(o.id)}">Batalkan pesanan</button>`;
    } else if (o.status === "menunggu_dikirim") act = `<p class="muted">Pembayaran diterima. Admin akan mengirim produknya — halaman ini ter-update otomatis.</p>`;
    else if (["sudah_terkirim", "selesai"].includes(o.status) && o.kind === "product") {
      const u = safeUrl(o.delivery_url);
      act = `${u ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">⬇ Unduh produk</a>` : ""}${o.delivery_note ? `<p style="white-space:pre-wrap">${esc(o.delivery_note)}</p>` : ""}${o.status === "sudah_terkirim" ? ` <button class="btn ghost" data-k="done" data-id="${esc(o.id)}">Pesanan sudah diterima ✓</button>` : ""}`;
    } else if (o.kind === "topup" && o.status === "selesai") act = `<p class="k-ok">${ktText(o.total_tokens)} sudah masuk ke dompetmu.</p>`;
    const ev = o.events.slice().reverse().map((e) => `<li><b>${esc(SL[e.status] || e.status)}</b> — ${esc(e.note || "")}<br><small class="muted">${fmtDate(e.at)}</small></li>`).join("");
    return `<details class="summary k-order" ${open ? "open" : ""} id="o-${esc(o.id)}"><summary><span><b class="mono">${esc(o.reference)}</b> <span class="tag">${o.kind === "topup" ? "Top up" : "Produk"}</span></span><span class="k-st st-${o.status}">${SL[o.status]}</span></summary>
      ${stepper(o)}<ul class="k-items">${items}</ul><div class="line total"><span>Total</span><span>${o.kind === "topup" ? `${money(o.total_idr)} → ${kt(o.total_tokens)}` : o.pay_with === "tokens" ? kt(o.total_tokens) : money(o.total_idr)}</span></div>
      <div class="k-act">${act}</div><details class="k-log"><summary>Riwayat status</summary><ul>${ev}</ul></details></details>`;
  }).join("");
  return page("Pesanan", "Pesanan saya", `<div class="chips k-chips">${chips}</div>${cards || `<div class="k-empty"><p>Belum ada pesanan${f ? " dengan status ini" : ""}.</p><a class="btn" href="#/store">Belanja di Store</a></div>`}`);
}

/* ---------- actions ---------- */
async function addToCart(id) {
  if (CART.includes(id)) return toast("Produk ini sudah ada di keranjang.");
  if (U) { const { error } = await sb.from("cart_items").insert({ user_id: U.id, product_id: id }); if (error) return toast(nice(error.message)); }
  else store.set(KEY, [...guestCart(), id]);
  CART.push(id); chip(); sfx("add"); toast("Masuk ke keranjang. Lihat di ikon 🛒.", "ok");
}
async function removeFromCart(id) {
  if (U) await sb.from("cart_items").delete().eq("product_id", id); else store.set(KEY, guestCart().filter((x) => x !== id));
  CART = CART.filter((x) => x !== id); chip(); H.rerender();
}
const busy = (b, on, label) => { if (!b) return; b.disabled = on; if (on) { b.dataset.t = b.textContent; b.innerHTML = '<span class="spin"></span> Memproses…'; } else b.textContent = label || b.dataset.t || b.textContent; };
const rpc = async (fn, args, errEl) => { const { data, error } = await sb.rpc(fn, args); if (error) { const m = nice(error.message); if (errEl) errEl.textContent = m; else toast(m); sfx("error"); return { error: m }; } return { data }; };

async function onClick(ev) {
  const el = ev.target.closest("[data-k]"); if (!el) return;
  const k = el.dataset.k, id = el.dataset.id;
  if (k === "add") return addToCart(id);
  if (k === "rm") return removeFromCart(id);
  if (k === "reload") return H.rerender();
  if (k === "google") {
    el.disabled = true;
    const say = (m) => { el.disabled = false; const e = $("#k-err"); if (e) e.textContent = m; toast(m); sfx("error"); };
    try {   // cek dulu apakah provider Google aktif, supaya pembeli tidak mendarat di halaman error mentah
      const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
      const cfg = r.ok ? await r.json() : null;
      if (cfg && cfg.external && cfg.external.google === false) return say("Login Google belum diaktifkan. Silakan masuk dengan email dulu.");
    } catch { if (!navigator.onLine) return say("Kamu sedang offline. Coba lagi saat tersambung."); }
    store.set("kns_next", el.dataset.next || "akun");
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    if (error) say(/not enabled|unsupported/i.test(error.message) ? "Login Google belum diaktifkan. Silakan masuk dengan email dulu." : nice(error.message));
    return;
  }
  if (k === "copy") { try { await navigator.clipboard.writeText(el.dataset.v); toast("Disalin.", "ok"); } catch { toast("Salin manual ya."); } return; }
  if (k === "logout") { await sb.auth.signOut(); toast("Kamu sudah keluar.", "ok"); location.hash = "#/"; return; }
  if (k === "pack") { $$(".k-pack").forEach((b) => b.setAttribute("aria-pressed", String(b === el))); $("#k-pack").value = id; const a = $("#k-amount"); if (a) { a.value = ""; $("#k-amount-rp").textContent = ""; } return; }
  if (k === "paykt") { if (!confirm("Bayar pesanan ini dengan KanasaToken?")) return; busy(el, true); const r = await rpc("shop_pay_tokens", { p_order: id }); busy(el, false); if (r.error) return; sfx("paid"); await Promise.all([loadOrders(), loadWallet()]); chip(); return H.rerender(); }
  if (k === "cancel") { if (!confirm("Batalkan pesanan ini?")) return; const r = await rpc("shop_cancel", { p_order: id }); if (r.error) return; toast("Pesanan dibatalkan.", "ok"); await loadOrders(); return H.rerender(); }
  if (k === "done") { const r = await rpc("shop_confirm_received", { p_order: id }); if (r.error) return; sfx("success"); toast("Terima kasih! Pesanan selesai.", "ok"); await loadOrders(); return H.rerender(); }
}
function onInput(ev) {
  if (ev.target.id !== "k-amount") return;
  const n = +ev.target.value, rate = CFG?.rate_idr || 1000; $("#k-pack").value = ""; $$(".k-pack").forEach((b) => b.setAttribute("aria-pressed", "false"));
  $("#k-amount-rp").textContent = n > 0 ? `${money(n * rate)}` : "";
}
async function onSubmit(ev) {
  const f = ev.target, id = f.id, err = $("#k-err", f) || $(".err", f), btn = $("button:not([type=button])", f);
  if (!/^k-/.test(id || "") && !f.classList.contains("k-proof")) return;
  ev.preventDefault(); if (err) err.textContent = "";
  const next = f.dataset?.next ? "#/" + f.dataset.next.replace(/[^a-z0-9/_-]/gi, "") : "#/akun";
  if (id === "k-login") {
    busy(btn, true); const { error } = await sb.auth.signInWithPassword({ email: $("#k-email").value.trim(), password: $("#k-pw").value }); busy(btn, false, "Masuk");
    if (error) { err.textContent = nice(error.message); return sfx("error"); }
    sfx("login"); toast("Berhasil masuk. Selamat datang!", "ok"); location.hash = next; return;
  }
  if (id === "k-signup") {
    busy(btn, true); const { data, error } = await sb.auth.signUp({ email: $("#k-email").value.trim(), password: $("#k-pw").value, options: { data: { name: $("#k-name").value.trim() }, emailRedirectTo: location.origin + location.pathname } }); busy(btn, false, "Buat akun");
    if (error) { err.textContent = nice(error.message); return sfx("error"); }
    if (data.session) { sfx("login"); toast("Akun dibuat. Selamat datang!", "ok"); location.hash = next; }
    else { f.innerHTML = `<p><b>Cek emailmu.</b> Kami mengirim tautan konfirmasi ke ${esc($("#k-email")?.value || "emailmu")}. Setelah dikonfirmasi, kamu bisa masuk.</p><a class="btn" href="#/akun?m=masuk">Ke halaman masuk</a>`; sfx("success"); }
    return;
  }
  if (id === "k-forgot") {
    busy(btn, true); const { error } = await sb.auth.resetPasswordForEmail($("#k-email").value.trim(), { redirectTo: location.origin + location.pathname }); busy(btn, false, "Kirim tautan");
    if (error) { err.textContent = nice(error.message); return; }
    f.innerHTML = `<p><b>Tautan terkirim.</b> Jika emailnya terdaftar, kamu akan menerima tautan reset. Cek juga folder spam.</p>`; return;
  }
  if (id === "k-newpw") {
    busy(btn, true); const { error } = await sb.auth.updateUser({ password: $("#k-pw").value }); busy(btn, false, "Simpan kata sandi");
    if (error) { err.textContent = nice(error.message); return; }
    RECOVERY = false; sfx("success"); toast("Kata sandi diperbarui.", "ok"); location.hash = "#/akun"; return;
  }
  if (id === "k-profile") {
    busy(btn, true); const name = $("#k-name").value.trim(), wa = $("#k-wa").value.trim() || null;
    const [a, b] = await Promise.all([sb.auth.updateUser({ data: { name } }), sb.from("profiles").update({ display_name: name, whatsapp: wa }).eq("id", U.id)]); busy(btn, false, "Simpan");
    if (a.error || b.error) { err.textContent = nice((a.error || b.error).message); return; }
    sfx("success"); toast("Profil disimpan.", "ok"); chip(); return;
  }
  if (id === "k-checkout") {
    const pay = new FormData(f).get("pay"); if (!pay) { err.textContent = "Pilih cara pembayaran."; return; }
    busy(btn, true); const r = await rpc("shop_checkout", { p_pay: pay, p_method: null }, err); busy(btn, false);
    if (r.error) return; CART = []; chip(); await loadWallet(); chip(); sfx("paid"); toast(pay === "tokens" ? "Pembayaran berhasil! Pesananmu menunggu dikirim." : "Pesanan dibuat. Selesaikan pembayaran.", "ok");
    ORD = null; location.hash = "#/pesanan?o=" + r.data.id; return;
  }
  if (id === "k-topup") {
    const pack = $("#k-pack").value || null, n = parseInt($("#k-amount").value, 10) || null;
    if (!pack && !n) { err.textContent = "Pilih paket atau isi jumlah KT."; return; }
    busy(btn, true); const r = await rpc("topup_create", { p_pack: pack, p_tokens: pack ? null : n, p_method: null }, err); busy(btn, false);
    if (r.error) return; sfx("open"); ORD = null; location.hash = "#/pesanan?o=" + r.data.id; return;
  }
  if (f.classList.contains("k-proof")) {
    const file = $("input[type=file]", f).files[0]; if (!file) { err.textContent = "Pilih file bukti bayar."; return; }
    if (!ALLOWED.includes(file.type)) { err.textContent = "Hanya PNG, JPG, WebP atau PDF."; return; }
    if (file.size > 10 * 1048576) { err.textContent = "Ukuran file lebih dari 10 MB."; return; }
    busy(btn, true);
    try {
      const name = file.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(-60) || "bukti", path = `incoming/shop/${U.id}/${Date.now().toString(36)}-${name}`;
      const up = await sb.storage.from("order-attachments").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error("Unggah gagal: " + up.error.message);
      const r = await rpc("shop_submit_proof", { p_order: f.dataset.id, p_path: path, p_method: $("select[name=m]", f)?.value || f.dataset.method || null }, err);
      if (r.error) { busy(btn, false); return; }
      sfx("success"); toast("Bukti terkirim. Admin akan memverifikasi.", "ok"); await loadOrders(); H.rerender();
    } catch (e) { err.textContent = nice(e.message); busy(btn, false); }
  }
}
