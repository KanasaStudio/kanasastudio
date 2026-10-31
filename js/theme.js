const FONTS = {
  inter: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  "space-grotesk": '"Space Grotesk", system-ui, sans-serif',
  "ibm-plex-sans": '"IBM Plex Sans", system-ui, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
export const FONT_CHOICES = Object.keys(FONTS);
const EXTRA_FONTS = { "space-grotesk": "Space+Grotesk", "ibm-plex-sans": "IBM+Plex+Sans" };
const HEX = /^#[0-9a-f]{6}$/i;

export function applyTheme(t = {}) {
  const r = document.documentElement.style, set = (k, v) => v != null && r.setProperty(k, v);
  const c = { "--bg": t.bg, "--surface": t.surface, "--surface-2": t.surface2, "--text": t.text, "--muted": t.muted, "--accent": t.accent, "--border": t.border };
  for (const [k, v] of Object.entries(c)) if (HEX.test(v || "")) set(k, v);
  if (FONTS[t.font]) set("--font-sans", FONTS[t.font]);
  if (EXTRA_FONTS[t.font] && !document.getElementById("font-" + t.font)) {      // only download the font that is actually selected
    const l = document.createElement("link"); l.id = "font-" + t.font; l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?family=${EXTRA_FONTS[t.font]}:wght@400;500;600&display=swap`; document.head.append(l);
  }
  document.documentElement.dataset.card = ["sm", "lg"].includes(t.card_size) ? t.card_size : "";
  if (t.body_size >= 14 && t.body_size <= 20) set("--body-size", t.body_size + "px");
  if (t.heading_scale >= 0.7 && t.heading_scale <= 1.4) set("--heading-scale", t.heading_scale);
  if (t.container >= 960 && t.container <= 1600) set("--container", t.container + "px");
  if (t.radius >= 0 && t.radius <= 24) set("--radius", t.radius + "px");
  document.body.dataset.button = t.button_style === "outline" ? "outline" : "solid";
}

export function validateTheme(t) {
  const errs = [];
  for (const k of ["bg", "surface", "surface2", "text", "muted", "accent", "border"]) if (!HEX.test(t[k] || "")) errs.push(`Colour "${k}" must be a hex value like #0b0b0c.`);
  if (!FONTS[t.font]) errs.push("Unsupported font.");
  if (!(t.container >= 960 && t.container <= 1600)) errs.push("Container width must be 960–1600px.");
  if (!(t.body_size >= 14 && t.body_size <= 20)) errs.push("Body size must be 14–20px.");
  if (!(t.heading_scale >= 0.7 && t.heading_scale <= 1.4)) errs.push("Heading scale must be 0.7–1.4.");
  if (!(t.radius >= 0 && t.radius <= 24)) errs.push("Radius must be 0–24px.");
  return errs;
}
