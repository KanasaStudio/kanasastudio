import { supabase } from "./supabase";

// Semua aksi yang butuh API key / LLM lewat edge function di server.
export async function callAI<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("kanasa-ai", { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context as Response | undefined;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      }
    } catch { /* abaikan */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
