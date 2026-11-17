// Adapter provider AI. Semua panggilan terjadi di server; API key tidak pernah dikirim ke browser.
export type Provider = "gemini" | "anthropic" | "openai";
export const PROVIDERS: Provider[] = ["gemini", "anthropic", "openai"];

export interface ChatMsg { role: "user" | "assistant"; content: string }
export interface LLMRequest {
  provider: Provider;
  model: string;
  apiKey: string;
  system: string;
  messages: ChatMsg[];
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
  json?: boolean;
  timeoutMs?: number;
}
export interface Source { url: string; title?: string; published?: string | null }
export interface LLMResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  sources: Source[];
  searches: number;
}
export interface ModelInfo { id: string; label: string }

export class ProviderError extends Error {
  constructor(public provider: Provider, public status: number, message: string) {
    super(message);
  }
}

const ANTHROPIC_VERSION = "2023-06-01";

async function fetchJson(url: string, init: RequestInit, provider: Provider, timeoutMs = 110_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? `Timeout setelah ${Math.round(timeoutMs / 1000)} detik` : `Koneksi gagal: ${(e as Error).message}`;
    throw new ProviderError(provider, 0, msg);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const detail = body?.error?.message || body?.error?.type || body?.message || text.slice(0, 300) || res.statusText;
    throw new ProviderError(provider, res.status, `${providerLabel(provider)} ${res.status}: ${detail}`);
  }
  return body;
}

export function providerLabel(p: Provider) {
  return p === "gemini" ? "Google Gemini" : p === "anthropic" ? "Anthropic Claude" : "OpenAI";
}

export function maskKey(key: string) {
  const k = key.trim();
  if (k.length <= 10) return "••••";
  return `${k.slice(0, 4)}••••••${k.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Daftar model langsung dari provider (tidak ada model ID yang di-hardcode)
// ---------------------------------------------------------------------------
export async function listModels(provider: Provider, apiKey: string): Promise<ModelInfo[]> {
  if (provider === "gemini") {
    const out: ModelInfo[] = [];
    let pageToken = "";
    for (let i = 0; i < 5; i++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const body = await fetchJson(url, { headers: { "x-goog-api-key": apiKey } }, provider, 20_000);
      for (const m of body?.models ?? []) {
        const id = String(m.name || "").replace(/^models\//, "");
        const methods: string[] = m.supportedGenerationMethods ?? [];
        if (!id.includes("gemini") || !methods.includes("generateContent")) continue;
        if (/(embedding|image|tts|live|audio|vision-only|aqa)/i.test(id)) continue;
        out.push({ id, label: m.displayName || id });
      }
      pageToken = body?.nextPageToken || "";
      if (!pageToken) break;
    }
    return out;
  }
  if (provider === "anthropic") {
    const body = await fetchJson("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
    }, provider, 20_000);
    return (body?.data ?? []).map((m: any) => ({ id: m.id, label: m.display_name || m.id }));
  }
  const body = await fetchJson("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } }, provider, 20_000);
  return (body?.data ?? [])
    .map((m: any) => String(m.id))
    .filter((id: string) => /^(gpt-|o\d|chatgpt-)/.test(id))
    .filter((id: string) => !/(audio|realtime|transcribe|tts|image|embedding|search|moderation|instruct|dall-e|whisper|codex|deep-research)/i.test(id))
    .sort()
    .map((id: string) => ({ id, label: id }));
}

// Saran model default dari daftar resmi provider: pilih varian cepat/hemat bila ada.
export function suggestDefaultModel(provider: Provider, models: ModelInfo[]): string | null {
  if (!models.length) return null;
  const ids = models.map((m) => m.id);
  const pick = (re: RegExp, exclude?: RegExp) =>
    ids.filter((id) => re.test(id) && !(exclude && exclude.test(id))).sort().reverse()[0];
  if (provider === "gemini") return pick(/flash/i, /(lite|preview|exp|thinking)/i) || pick(/flash/i) || ids[0];
  if (provider === "anthropic") return pick(/haiku/i) || pick(/sonnet/i) || ids[0];
  return pick(/mini/i, /(nano|preview)/i) || pick(/^gpt-/) || ids[0];
}

// ---------------------------------------------------------------------------
// Panggilan model
// ---------------------------------------------------------------------------
export async function callLLM(req: LLMRequest): Promise<LLMResult> {
  try {
    return await callOnce(req);
  } catch (e) {
    // Beberapa model penalaran menolak parameter temperature: ulangi tanpa parameter itu.
    if (e instanceof ProviderError && e.status === 400 && /temperature/i.test(e.message) && req.temperature !== undefined) {
      return await callOnce({ ...req, temperature: undefined });
    }
    // Model yang tidak mendukung pencarian web: laporkan jelas, jangan diam-diam tanpa sumber.
    throw e;
  }
}

async function callOnce(req: LLMRequest): Promise<LLMResult> {
  const timeout = req.timeoutMs ?? 110_000;
  if (req.provider === "gemini") {
    const body: any = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: req.maxTokens ?? 4096 },
    };
    if (req.temperature !== undefined) body.generationConfig.temperature = req.temperature;
    if (req.webSearch) body.tools = [{ google_search: {} }];
    else if (req.json) body.generationConfig.responseMimeType = "application/json";
    const data = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": req.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      "gemini", timeout,
    );
    const cand = data?.candidates?.[0];
    if (!cand) {
      const block = data?.promptFeedback?.blockReason;
      throw new ProviderError("gemini", 200, block ? `Diblokir oleh filter Gemini: ${block}` : "Gemini tidak mengembalikan jawaban");
    }
    const text = (cand.content?.parts ?? []).filter((p: any) => typeof p.text === "string" && !p.thought).map((p: any) => p.text).join("");
    const gm = cand.groundingMetadata ?? {};
    const sources: Source[] = (gm.groundingChunks ?? [])
      .map((c: any) => c.web)
      .filter((w: any) => w?.uri)
      .map((w: any) => ({ url: w.uri, title: w.title }));
    const u = data?.usageMetadata ?? {};
    if (!text && cand.finishReason && cand.finishReason !== "STOP") {
      throw new ProviderError("gemini", 200, `Gemini berhenti: ${cand.finishReason}`);
    }
    return {
      text,
      inputTokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
      outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      sources: dedupeSources(sources),
      searches: (gm.webSearchQueries ?? []).length,
    };
  }

  if (req.provider === "anthropic") {
    const body: any = {
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (req.temperature !== undefined) body.temperature = Math.min(1, req.temperature);
    if (req.webSearch) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
    const data = await fetchJson("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": req.apiKey, "anthropic-version": ANTHROPIC_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, "anthropic", timeout);
    const blocks: any[] = data?.content ?? [];
    const sources: Source[] = [];
    let lastToolIdx = -1;
    blocks.forEach((b, i) => {
      if (b.type === "web_search_tool_result") {
        lastToolIdx = i;
        if (Array.isArray(b.content)) {
          for (const r of b.content) if (r.url) sources.push({ url: r.url, title: r.title, published: r.page_age ?? null });
        }
      }
    });
    // Teks jawaban akhir = blok teks setelah hasil pencarian terakhir (jika ada pencarian).
    const textBlocks = blocks.map((b, i) => ({ b, i })).filter(({ b, i }) => b.type === "text" && i > lastToolIdx);
    const text = (textBlocks.length ? textBlocks : blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.type === "text"))
      .map(({ b }) => b.text).join("");
    const u = data?.usage ?? {};
    return {
      text,
      inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      sources: dedupeSources(sources),
      searches: u.server_tool_use?.web_search_requests ?? 0,
    };
  }

  // OpenAI Responses API
  const body: any = {
    model: req.model,
    instructions: req.system,
    input: req.messages.map((m) => ({ role: m.role, content: m.content })),
    max_output_tokens: req.maxTokens ?? 4096,
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.webSearch) {
    body.tools = [{ type: "web_search" }];
    body.include = ["web_search_call.action.sources"];
  }
  const data = await fetchJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${req.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, "openai", timeout);
  let text = "";
  const sources: Source[] = [];
  let searches = 0;
  for (const item of data?.output ?? []) {
    if (item.type === "web_search_call") {
      searches++;
      for (const s of item.action?.sources ?? []) if (s.url) sources.push({ url: s.url, title: s.title });
    }
    if (item.type === "message") {
      for (const c of item.content ?? []) {
        if (c.type === "output_text") {
          text += c.text;
          for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url) sources.push({ url: a.url, title: a.title });
        }
      }
    }
  }
  if (!text && data?.status === "incomplete") {
    throw new ProviderError("openai", 200, `Respons tidak lengkap: ${data?.incomplete_details?.reason ?? "unknown"}`);
  }
  const u = data?.usage ?? {};
  return { text, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, sources: dedupeSources(sources), searches };
}

function dedupeSources(list: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of list) {
    const key = s.url.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: s.url, title: s.title?.slice(0, 200), published: s.published ?? null });
  }
  return out.slice(0, 25);
}

// Ambil objek JSON dari teks model (toleran terhadap ```json fence dan teks tambahan).
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try { return JSON.parse(c.slice(start, end + 1)); } catch { /* lanjut */ }
  }
  return null;
}
