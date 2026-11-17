import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { callLLM, ChatMsg, LLMResult, Provider, PROVIDERS, ProviderError } from "./providers.ts";
import { sendPush } from "./push.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const APP_URL = "https://kanasastudio.github.io/kanasastudio/ai/";

export type Settings = Record<string, any>;
export type Employee = Record<string, any>;
export type Task = Record<string, any>;

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db.from("ai_settings").select("*").limit(1).single();
  if (error) throw error;
  return data;
}

export async function getEmployees(): Promise<Employee[]> {
  const { data, error } = await db.from("ai_employees").select("*").order("code");
  if (error) throw error;
  return data ?? [];
}

export async function vaultGet(name: string): Promise<string | null> {
  const { data, error } = await db.rpc("ai_vault_get", { p_name: name });
  if (error) throw error;
  return (data as string) ?? null;
}

export const keyName = (p: Provider) => `kanasa_ai_key_${p}`;

export async function log(actorKind: string, actorId: string | null, actorName: string, category: string,
  summary: string, details?: string | null, taskId?: string | null, departmentId?: string | null) {
  await db.rpc("ai_log", {
    p_actor_kind: actorKind, p_actor_id: actorId, p_actor_name: actorName, p_category: category,
    p_summary: summary, p_details: details ?? null, p_task_id: taskId ?? null, p_department_id: departmentId ?? null,
  });
}

export async function setEmployee(id: string, patch: Record<string, unknown>) {
  await db.from("ai_employees").update({ ...patch, last_active_at: new Date().toISOString() }).eq("id", id);
}

// ---------------------------------------------------------------------------
// Notifikasi dengan deduplikasi & eskalasi
// ---------------------------------------------------------------------------
export async function notify(opts: {
  priority: "critical" | "high" | "normal";
  category: string;
  title: string;
  body: string;
  employeeId?: string | null;
  taskId?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
}) {
  const settings = await getSettings();
  let priority = opts.priority;
  let shouldPush = true;
  if (opts.dedupeKey) {
    const { data: existing } = await db.from("ai_notifications").select("*")
      .eq("dedupe_key", opts.dedupeKey).is("read_at", null).maybeSingle();
    if (existing) {
      const occ = existing.occurrences + 1;
      // Eskalasi: masalah yang sama berulang 3x naik satu tingkat prioritas.
      const escalate = occ === 3 && existing.priority !== "critical";
      if (escalate) priority = existing.priority === "normal" ? "high" : "critical";
      await db.from("ai_notifications").update({
        occurrences: occ, body: opts.body, priority: escalate ? priority : existing.priority,
      }).eq("id", existing.id);
      shouldPush = escalate;
      if (!shouldPush) return;
      await pushTo(settings, priority, opts.title + " (berulang)", opts.body, opts.link, existing.id);
      return;
    }
  }
  const { data: row, error } = await db.from("ai_notifications").insert({
    priority, category: opts.category, title: opts.title.slice(0, 140), body: opts.body.slice(0, 600),
    employee_id: opts.employeeId ?? null, task_id: opts.taskId ?? null, link: opts.link ?? null, dedupe_key: opts.dedupeKey ?? null,
  }).select("id").single();
  if (error) {
    // Konflik unik = notifikasi sama baru saja dibuat proses lain.
    if (error.code === "23505") return;
    throw error;
  }
  await pushTo(settings, priority, opts.title, opts.body, opts.link, row.id);
}

async function pushTo(settings: Settings, priority: string, title: string, body: string, link: string | null | undefined, id: string) {
  const allowed = priority === "critical" ? settings.push_critical : priority === "high" ? settings.push_high : settings.push_normal;
  if (!allowed) return;
  try {
    const sent = await sendPush({ title, body, link: link ?? "#/notifikasi", priority, id });
    if (sent > 0) await db.from("ai_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    console.error("push gagal", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Pemilihan model, anggaran, dan pencatatan biaya
// ---------------------------------------------------------------------------
export interface ResolvedModel { provider: Provider; model: string; apiKey: string }

export async function resolveModel(emp: Employee, settings: Settings): Promise<ResolvedModel | { error: string }> {
  const { data: keys } = await db.from("ai_provider_keys").select("*").eq("status", "connected").eq("enabled", true);
  const connected = new Map<string, any>((keys ?? []).map((k: any) => [k.provider, k]));
  if (!connected.size) return { error: "Belum ada API provider yang terhubung. Hubungkan di menu API & Integrasi." };
  const order: string[] = [emp.provider, settings.default_provider, ...PROVIDERS].filter(Boolean);
  for (const p of order) {
    const k = connected.get(p);
    if (!k) continue;
    const model = (emp.provider === p && emp.model) ? emp.model : k.default_model;
    if (!model) continue;
    const apiKey = await vaultGet(keyName(p as Provider));
    if (!apiKey) continue;
    return { provider: p as Provider, model, apiKey };
  }
  return { error: "Provider terhubung tetapi model default belum dipilih. Pilih model di menu API & Integrasi." };
}

export async function checkBudget(emp: Employee, settings: Settings): Promise<string | null> {
  const [{ data: mine }, { data: all }] = await Promise.all([
    db.rpc("ai_usage_today", { p_employee: emp.id }),
    db.rpc("ai_usage_today", { p_employee: null }),
  ]);
  const m = mine?.[0] ?? { tokens: 0, usd: 0 };
  const g = all?.[0] ?? { tokens: 0, usd: 0 };
  if (Number(g.tokens) >= Number(settings.global_daily_token_limit)) return `Batas token harian perusahaan tercapai (${g.tokens} token).`;
  if (Number(g.usd) >= Number(settings.global_daily_usd_limit)) return `Batas biaya harian perusahaan tercapai ($${Number(g.usd).toFixed(4)}).`;
  if (Number(m.tokens) >= Number(emp.daily_token_budget)) return `Anggaran token harian ${emp.name} habis (${m.tokens} token).`;
  if (Number(m.usd) >= Number(emp.daily_usd_budget)) return `Anggaran biaya harian ${emp.name} habis ($${Number(m.usd).toFixed(4)}).`;
  return null;
}

async function priceFor(provider: string, model: string) {
  const { data } = await db.from("ai_model_prices").select("*").eq("provider", provider).eq("model", model).maybeSingle();
  return data as { input_per_mtok: number; output_per_mtok: number } | null;
}

export async function recordUsage(rm: ResolvedModel, r: LLMResult, purpose: string, employeeId: string | null, taskId: string | null) {
  const price = await priceFor(rm.provider, rm.model);
  const cost = price
    ? (r.inputTokens * Number(price.input_per_mtok) + r.outputTokens * Number(price.output_per_mtok)) / 1_000_000
    : null;
  await db.from("ai_api_usage").insert({
    provider: rm.provider, model: rm.model, employee_id: employeeId, task_id: taskId, purpose,
    input_tokens: r.inputTokens, output_tokens: r.outputTokens, web_searches: r.searches, cost_usd: cost,
  });
  return cost;
}

// Panggil model atas nama karyawan: pilih model, cek anggaran, catat penggunaan.
export async function runAs(emp: Employee, settings: Settings, args: {
  system: string; messages: ChatMsg[]; purpose: string; taskId?: string | null; webSearch?: boolean; json?: boolean;
  maxTokens?: number; temperature?: number; timeoutMs?: number;
}): Promise<{ result: LLMResult; rm: ResolvedModel; cost: number | null }> {
  const rm = await resolveModel(emp, settings);
  if ("error" in rm) throw new BlockedError(rm.error, "no_provider");
  const budget = await checkBudget(emp, settings);
  if (budget) throw new BlockedError(budget, "budget");
  const result = await callLLM({
    provider: rm.provider, model: rm.model, apiKey: rm.apiKey, system: args.system, messages: args.messages,
    temperature: args.temperature ?? Number(emp.temperature), maxTokens: args.maxTokens ?? emp.max_output_tokens,
    webSearch: args.webSearch, json: args.json, timeoutMs: args.timeoutMs,
  });
  const cost = await recordUsage(rm, result, args.purpose, emp.id, args.taskId ?? null);
  return { result, rm, cost };
}

export class BlockedError extends Error {
  constructor(message: string, public kind: "no_provider" | "budget") { super(message); }
}

export function errMessage(e: unknown): string {
  if (e instanceof ProviderError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function nowJakarta() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date()) + " WIB";
}

export const honesty = () => `
ATURAN WAJIB KANASA STUDIO:
- Jangan pernah mengarang data, angka, kutipan, nama klien, testimoni, atau sumber.
- Bila informasi tidak tersedia, tulis "tidak diketahui" atau "data belum ada".
- Jangan mengklaim sudah menjalankan aksi yang tidak kamu lakukan (mengirim email, publikasi, deploy, membeli, menjalankan kode).
- Aksi eksternal hanya boleh berupa DRAF untuk disetujui Founder.
- Tulis dalam Bahasa Indonesia yang jelas. Waktu sekarang: ${nowJakarta()}.`;
