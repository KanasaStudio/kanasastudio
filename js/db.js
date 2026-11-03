import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
// While offline, writes fail at once with a readable message (reads are answered from the saved copy by sw.js).
const offlineFetch = (url, opts = {}) => (!navigator.onLine && (opts.method || "GET") !== "GET"
  ? Promise.resolve(new Response(JSON.stringify({ message: "You are offline. Reconnect to the internet and try again." }), { status: 503, headers: { "Content-Type": "application/json" } }))
  : fetch(url, opts));
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: offlineFetch } });
export const publicUrl = (bucket, path) => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
