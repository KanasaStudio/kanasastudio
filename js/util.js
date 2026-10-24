export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// allow http(s) and relative URLs only (blocks javascript:, data: etc.)
export const safeUrl = (u) => { u = String(u ?? "").trim(); return (!/^[a-z][a-z0-9+.-]*:/i.test(u) || /^https?:/i.test(u)) ? u : ""; };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const paragraphs = (t) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

export function money(n, cur = "IDR") {
  if (n == null || n === "") return "—";
  try { return new Intl.NumberFormat(cur === "IDR" ? "id-ID" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: cur === "IDR" ? 0 : 2 }).format(+n); }
  catch { return `${cur} ${n}`; }
}
export function range(min, max, cur) {
  if (min == null) return "Quotation";
  return max != null && +max !== +min ? `${money(min, cur)} – ${money(max, cur)}` : money(min, cur);
}
export const fmtDate = (d) => d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

export function toast(msg, kind = "") {
  let host = $(".toast-host");
  if (!host) { host = document.createElement("div"); host.className = "toast-host"; host.setAttribute("role", "status"); document.body.append(host); }
  const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = msg; host.append(t);
  setTimeout(() => t.remove(), 5000);
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
export const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-") || "item";

export const STATUS = {
  new_request: "New Request", under_review: "Under Review", awaiting_client: "Awaiting Client Response",
  quotation_sent: "Quotation Sent", awaiting_payment: "Awaiting Payment", in_progress: "In Progress",
  revision: "Revision", completed: "Completed", cancelled: "Cancelled",
};
