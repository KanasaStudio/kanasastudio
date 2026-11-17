// KANASA STUDIO — Autonomous AI Company backend (Supabase Edge Function)
// Dua jalur akses:
//   1. Founder (JWT Supabase Auth + public.ai_is_founder()) → aksi aplikasi.
//   2. pg_cron (header x-engine-key dari Vault) → tick engine tiap menit.
import { createClient } from "npm:@supabase/supabase-js@2";
import { ANON_KEY, db, errMessage, getSettings, keyName, log, SUPABASE_URL, vaultGet } from "./db.ts";
import { kickoff, planDirective, runScheduleAction, tick } from "./engine.ts";
import { chatWithEmployee, groupMeeting } from "./chat.ts";
import { listModels, maskKey, Provider, PROVIDERS, providerLabel, suggestDefaultModel } from "./providers.ts";
import { sendPush, vapidPublicKey } from "./push.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-engine-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function background(p: Promise<unknown>) {
  const wrapped = p.catch((e) => console.error("background", errMessage(e)));
  try { EdgeRuntime.waitUntil(wrapped); } catch { /* lokal */ }
}

async function isFounder(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data, error } = await client.rpc("ai_is_founder");
  return !error && data === true;
}

let engineKeyCache: string | null = null;
async function isEngine(req: Request) {
  const k = req.headers.get("x-engine-key");
  if (!k) return false;
  engineKeyCache ??= await vaultGet("kanasa_ai_engine_key");
  return !!engineKeyCache && k === engineKeyCache;
}

const isProvider = (p: unknown): p is Provider => typeof p === "string" && (PROVIDERS as string[]).includes(p);

// Rate limit sederhana untuk aksi yang memanggil model (per menit).
async function rateLimited(purpose: string, perMinute: number) {
  const { count } = await db.from("ai_api_usage").select("id", { count: "exact", head: true })
    .eq("purpose", purpose).gte("created_at", new Date(Date.now() - 60_000).toISOString());
  return (count ?? 0) >= perMinute;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* kosong */ }
  const action = String(body.action ?? "");

  try {
    // ---------------- Engine (cron) ----------------
    if (action === "tick") {
      if (!(await isEngine(req))) return json({ error: "unauthorized" }, 401);
      background(tick(String(body.trigger ?? "cron")));
      return json({ accepted: true });
    }

    // ---------------- Founder ----------------
    if (!(await isFounder(req))) return json({ error: "Hanya Founder yang bisa mengakses." }, 401);

    switch (action) {
      case "status": {
        const { data: keys } = await db.from("ai_provider_keys").select("provider,status,default_model,masked");
        return json({ vapidPublicKey: await vapidPublicKey(), providers: keys ?? [] });
      }

      case "provider_connect": {
        const provider = body.provider;
        const apiKey = String(body.apiKey ?? "").trim();
        if (!isProvider(provider)) return json({ error: "Provider tidak dikenal" }, 400);
        if (apiKey.length < 20 || apiKey.length > 300 || /\s/.test(apiKey)) return json({ error: "Format API key tidak valid" }, 400);
        let models;
        try {
          models = await listModels(provider, apiKey);
        } catch (e) {
          return json({ error: `Tes koneksi gagal: ${errMessage(e)}` }, 400);
        }
        if (!models.length) return json({ error: `${providerLabel(provider)} tidak mengembalikan model chat untuk key ini.` }, 400);
        const chosen = body.defaultModel && models.some((m) => m.id === body.defaultModel) ? body.defaultModel : suggestDefaultModel(provider, models);
        const { error: vErr } = await db.rpc("ai_vault_put", { p_name: keyName(provider), p_secret: apiKey });
        if (vErr) throw vErr;
        const { error } = await db.from("ai_provider_keys").upsert({
          provider, masked: maskKey(apiKey), status: "connected", last_error: null, last_tested_at: new Date().toISOString(),
          models, default_model: chosen, enabled: true,
        });
        if (error) throw error;
        const settings = await getSettings();
        if (!settings.default_provider) await db.from("ai_settings").update({ default_provider: provider }).eq("id", true);
        await log("founder", "founder", "Founder", "security", `API key ${providerLabel(provider)} disimpan (${maskKey(apiKey)})`);
        await db.from("ai_notifications").update({ read_at: new Date().toISOString() }).eq("dedupe_key", "no-provider").is("read_at", null);
        // Tugas yang tertahan karena belum ada provider dijalankan ulang.
        await db.from("ai_tasks").update({ status: "queued", last_error: null, not_before: new Date().toISOString() })
          .eq("status", "blocked").ilike("last_error", "%provider%");
        await db.from("ai_tasks").update({ status: "queued", last_error: null, not_before: new Date().toISOString() })
          .eq("status", "blocked").ilike("last_error", "%model default%");
        background((async () => { await kickoff(); await tick("connect"); })());
        return json({ ok: true, models, default_model: chosen });
      }

      case "provider_test": {
        if (!isProvider(body.provider)) return json({ error: "Provider tidak dikenal" }, 400);
        const key = await vaultGet(keyName(body.provider));
        if (!key) return json({ error: "Key belum disimpan" }, 404);
        try {
          const models = await listModels(body.provider, key);
          const { data: row } = await db.from("ai_provider_keys").select("default_model").eq("provider", body.provider).single();
          const stillValid = models.some((m) => m.id === row?.default_model);
          await db.from("ai_provider_keys").update({
            status: "connected", last_error: stillValid ? null : "Model default tidak lagi tersedia, pilih ulang.",
            last_tested_at: new Date().toISOString(), models, default_model: stillValid ? row?.default_model : suggestDefaultModel(body.provider, models),
          }).eq("provider", body.provider);
          return json({ ok: true, models: models.length });
        } catch (e) {
          await db.from("ai_provider_keys").update({ status: "error", last_error: errMessage(e), last_tested_at: new Date().toISOString() }).eq("provider", body.provider);
          return json({ ok: false, error: errMessage(e) });
        }
      }

      case "provider_set_model": {
        if (!isProvider(body.provider)) return json({ error: "Provider tidak dikenal" }, 400);
        const { data: row } = await db.from("ai_provider_keys").select("models").eq("provider", body.provider).single();
        if (!row || !(row.models as any[]).some((m) => m.id === body.model)) return json({ error: "Model tidak ada di daftar provider" }, 400);
        await db.from("ai_provider_keys").update({ default_model: body.model }).eq("provider", body.provider);
        return json({ ok: true });
      }

      case "provider_toggle": {
        if (!isProvider(body.provider)) return json({ error: "Provider tidak dikenal" }, 400);
        await db.from("ai_provider_keys").update({ enabled: !!body.enabled }).eq("provider", body.provider);
        return json({ ok: true });
      }

      case "provider_delete": {
        if (!isProvider(body.provider)) return json({ error: "Provider tidak dikenal" }, 400);
        await db.rpc("ai_vault_delete", { p_name: keyName(body.provider) });
        await db.from("ai_provider_keys").delete().eq("provider", body.provider);
        const settings = await getSettings();
        if (settings.default_provider === body.provider) {
          const { data: other } = await db.from("ai_provider_keys").select("provider").eq("status", "connected").limit(1).maybeSingle();
          await db.from("ai_settings").update({ default_provider: other?.provider ?? null }).eq("id", true);
        }
        await db.from("ai_employees").update({ provider: null, model: null }).eq("provider", body.provider);
        await log("founder", "founder", "Founder", "security", `API key ${providerLabel(body.provider)} dihapus`);
        return json({ ok: true });
      }

      case "command": {
        const objective = String(body.objective ?? "").trim();
        if (objective.length < 3) return json({ error: "Perintah terlalu pendek" }, 400);
        const priority = ["critical", "high", "medium", "low"].includes(body.priority) ? body.priority : "medium";
        const { data: d, error } = await db.from("ai_directives").insert({
          objective: objective.slice(0, 3900), priority, source: body.source === "chat" ? "chat" : "founder",
        }).select("*").single();
        if (error) throw error;
        await db.from("ai_messages").insert({ thread: "dm:aurelia", sender_kind: "founder", sender_id: "founder", content: `Perintah ${d.code}: ${objective}`, meta: { directive_id: d.id } });
        await log("founder", "founder", "Founder", "task_assignment", `Founder memberi perintah ${d.code}`, objective);
        background((async () => { await planDirective(d.id); await tick("command"); })());
        return json({ ok: true, directive: d });
      }

      case "chat": {
        if (await rateLimited("chat", 20)) return json({ error: "Terlalu banyak pesan, tunggu sebentar." }, 429);
        const text = String(body.text ?? "").trim();
        if (!text) return json({ error: "Pesan kosong" }, 400);
        const msg = await chatWithEmployee(String(body.employeeId), text);
        return json({ ok: true, message: msg });
      }

      case "group": {
        if (await rateLimited("chat", 20)) return json({ error: "Terlalu banyak pesan, tunggu sebentar." }, 429);
        const text = String(body.text ?? "").trim();
        if (!text) return json({ error: "Pesan kosong" }, 400);
        const msgs = await groupMeeting(text);
        return json({ ok: true, messages: msgs });
      }

      case "run_now": {
        background(tick("manual"));
        return json({ ok: true });
      }

      case "schedule_action": {
        const allowed = ["briefing", "research", "trends", "assign", "break", "finance", "qa", "exec_report", "founder_summary"];
        if (!allowed.includes(body.scheduleAction)) return json({ error: "Aksi jadwal tidak dikenal" }, 400);
        const settings = await getSettings();
        const res = await runScheduleAction(body.scheduleAction, { ...settings, autonomy_enabled: true });
        await log("founder", "founder", "Founder", "schedule", `Menjalankan manual: ${body.scheduleAction}`, res.text);
        background(tick("manual"));
        return json({ ok: true, result: res });
      }

      case "push_test": {
        const sent = await sendPush({ title: "Tes notifikasi KANASA STUDIO", body: "Notifikasi push berfungsi di perangkat ini.", link: "#/notifikasi", priority: "high", id: "test" });
        return json({ ok: true, sent });
      }

      default:
        return json({ error: "Aksi tidak dikenal" }, 400);
    }
  } catch (e) {
    console.error(action, e);
    return json({ error: errMessage(e) }, 500);
  }
});
