import { sb } from "./db.js";
import { esc, toast, uid } from "./util.js";
export { sb, esc, toast };

export const fld = (name, label, v = "", o = {}) => {
  const { type = "text", req, area, opts, hint, attrs = "" } = o, id = "f_" + name.replace(/\W/g, "_");
  const val = v ?? "";
  const ctl = opts ? `<select class="input" id="${id}" name="${esc(name)}" ${attrs}>${opts.map(([k, t]) => `<option value="${esc(k)}" ${String(val) === String(k) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`
    : area ? `<textarea class="input" id="${id}" name="${esc(name)}" rows="${area}" ${attrs}>${esc(val)}</textarea>`
    : `<input class="input" id="${id}" name="${esc(name)}" type="${type}" value="${esc(val)}" ${attrs}>`;
  return `<div class="field"><label class="${req ? "req" : ""}" for="${id}">${esc(label)}</label>${ctl}${hint ? `<span class="muted" style="font-size:.75rem">${esc(hint)}</span>` : ""}</div>`;
};
export const chk = (name, label, v) => `<label class="check field"><input type="checkbox" name="${esc(name)}" ${v ? "checked" : ""}> ${esc(label)}</label>`;
export const lines = (a) => (a || []).join("\n");
export const unlines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
export const csv = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
export const num = (v) => (v === "" || v == null ? null : +v);

export function getPath(o, p) { return p.split(".").reduce((a, k) => a?.[k], o); }
export function setPath(o, p, v) { const ks = p.split("."); let c = o; ks.slice(0, -1).forEach((k) => { c = c[k] ??= {}; }); c[ks.at(-1)] = v; }

/* Shrink big images in the browser before upload (keeps QR codes, GIFs, SVG and 3D models untouched). */
async function shrink(file, folder) {
  if (folder === "qris" || !/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file), MAX = 1800, sc = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    if (sc === 1 && file.size < 400 * 1024) return file;
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
  } catch { return file; }
}
export async function uploadPublic(file, folder = "misc") {
  file = await shrink(file, folder);
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type) && !/\.glb$/i.test(file.name)) throw new Error("Only PNG, JPG, WebP, GIF, SVG or GLB files.");
  if (file.size > 8 * 1048576) throw new Error("File is over 8 MB.");
  const name = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60);
  const path = `${folder}/${uid()}-${name}`;
  const { error } = await sb.storage.from("public-media").upload(path, file, { contentType: file.type || "model/gltf-binary", upsert: false });
  if (error) throw error;
  return sb.storage.from("public-media").getPublicUrl(path).data.publicUrl;
}

export async function busy(btn, fn) {
  const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Working…';
  try { return await fn(); } catch (e) { toast(/slug_key/.test(e.message || "") ? "That URL slug is already used by another item. Change the slug field, or open the existing item from the list." : (e.message || String(e))); } finally { btn.disabled = false; btn.innerHTML = t; }
}
export const must = ({ data, error }) => { if (error) throw error; return data; };
