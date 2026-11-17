import { createClient } from "@supabase/supabase-js";

// Kunci publishable aman di frontend: akses data dibatasi RLS (hanya Founder).
export const SUPABASE_URL = "https://geroipkbzmbkigzwjdok.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0GuYwsQSIYD89p-O1NcjMw_4l0pc7xN";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "kanasa-ai-auth" },
  realtime: { params: { eventsPerSecond: 10 } },
});
