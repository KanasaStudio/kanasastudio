// Public values only. The publishable (anon) key is designed to be shipped to browsers;
// all access is enforced by Row Level Security. NEVER put the service_role / secret key here.
export const SUPABASE_URL = "https://geroipkbzmbkigzwjdok.supabase.co";
export const SUPABASE_KEY = "sb_publishable_0GuYwsQSIYD89p-O1NcjMw_4l0pc7xN";

// Optional integrations — leave empty to keep them off (see docs/SHOP.md).
export const TURNSTILE_SITEKEY = "";          // Cloudflare Turnstile site key (public). Also enable Captcha in Supabase Auth.
export const ANALYTICS = { plausible: "", cloudflare: "" };   // plausible: your domain, e.g. "kanasastudio.github.io"; cloudflare: Web Analytics token
