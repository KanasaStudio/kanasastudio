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
  const vid = /^video\/(mp4|webm)$/.test(file.type), aud = /^audio\//.test(file.type);
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type) && !/\.glb$/i.test(file.name) && !vid && !aud) throw new Error("Allowed: PNG, JPG, WebP, GIF, SVG, GLB, MP4/WebM video or MP3/OGG/WAV audio.");
  if (aud && file.size > 1048576) throw new Error("Sound effects must be under 1 MB (they should be very short).");
  if (file.size > (vid ? 40 : 8) * 1048576) throw new Error(vid ? "Video is over 40 MB. Compress it (e.g. 1080p, ~5 Mbps, no audio)." : "File is over 8 MB.");
  const name = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60);
  const path = `${folder}/${uid()}-${name}`;
  const { error } = await sb.storage.from("public-media").upload(path, file, { contentType: file.type || "model/gltf-binary", upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  return sb.storage.from("public-media").getPublicUrl(path).data.publicUrl;
}

export async function busy(btn, fn) {
  const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Working…';
  try { return await fn(); } catch (e) { toast(/slug_key/.test(e.message || "") ? "That URL slug is already used by another item. Change the slug field, or open the existing item from the list." : (e.message || String(e))); } finally { btn.disabled = false; btn.innerHTML = t; }
}
export const must = ({ data, error }) => { if (error) throw error; return data; };

/* ---- optional card preview video (portfolio / store / tools) ---- */
export const previewPanel = (url) => `<div class="panel"><h2>Preview video (optional)</h2><p class="muted" style="font-size:.85rem">A short silent loop (5–10 s, MP4 or WebM, under 12 MB, ~720p is plenty). It plays when visitors hover the card, or when it scrolls into view on phones. The cover image shows until then, so the page stays light.</p>
  ${url ? `<video src="${esc(url)}" muted playsinline controls preload="metadata" style="max-width:18rem;display:block;margin-bottom:.5rem"></video><label class="check" style="margin-bottom:.6rem"><input type="checkbox" id="pv-rm"> Remove the preview video</label>` : ""}<input class="input" id="pv-file" type="file" accept="video/mp4,video/webm" aria-label="Preview video file"></div>`;
export async function resolvePreview(current, folder) {
  const rm = document.getElementById("pv-rm")?.checked, file = document.getElementById("pv-file")?.files[0];
  if (!file) return { url: rm ? null : current || null, file: null };
  if (!/^video\/(mp4|webm)$/.test(file.type)) throw new Error("The preview must be an MP4 or WebM file.");
  if (file.size > 12 * 1048576) throw new Error("The preview video is over 12 MB. Trim it to 5–10 seconds or compress it.");
  return { url: await uploadPublic(file, folder), file };
}
/* First frame of a video as a WebP cover, for items that have no cover image yet. */
export async function posterFrom(file, folder) {
  try {
    const u = URL.createObjectURL(file), v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = u;
    await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(no, 8000); });
    v.currentTime = Math.min(0.4, (v.duration || 1) / 2); await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 1500); });
    const c = document.createElement("canvas"), sc = Math.min(1, 1280 / v.videoWidth); c.width = Math.round(v.videoWidth * sc); c.height = Math.round(v.videoHeight * sc);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.82)); if (!blob) return null;
    return await uploadPublic(new File([blob], "poster.webp", { type: "image/webp" }), folder);
  } catch { return null; }
}
