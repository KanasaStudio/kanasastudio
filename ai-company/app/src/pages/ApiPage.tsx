import { CheckCircle2, ExternalLink, KeyRound, Lock, Plug, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "../components/Layout";
import { Badge, Button, Card, Field, inputCls, SectionTitle, Sheet, Toggle } from "../components/ui";
import { callAI } from "../lib/api";
import { dateTime, PROVIDER_LABEL } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Provider, ProviderKey } from "../lib/types";
import { useStore } from "../store/useStore";

const INFO: Record<Provider, { url: string; hint: string; color: string }> = {
  gemini: { url: "https://aistudio.google.com/apikey", hint: "Buat key di Google AI Studio. Riset memakai Grounding with Google Search.", color: "#4285F4" },
  anthropic: { url: "https://console.anthropic.com/settings/keys", hint: "Buat key di Claude Console. Riset memakai tool web search Claude.", color: "#D97757" },
  openai: { url: "https://platform.openai.com/api-keys", hint: "Buat key di OpenAI Platform. Riset memakai tool web_search Responses API.", color: "#10A37F" },
};

export default function ApiPage() {
  const providers = useStore((s) => s.providers);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const toast = useStore((s) => s.toast);
  const [connect, setConnect] = useState<Provider | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    const { data } = await supabase.from("ai_provider_keys").select("provider,masked,status,last_error,last_tested_at,models,default_model,enabled,updated_at");
    if (data) useStore.setState({ providers: data as ProviderKey[] });
  };
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok, "ok"); await refresh(); } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(null); }
  };

  return (
    <PageShell>
      <Card className="flex items-start gap-3 p-4 text-sm">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
        <span className="text-muted">
          API key dikirim lewat HTTPS ke server, diuji, lalu disimpan terenkripsi di <b>Supabase Vault</b>. Key tidak pernah disimpan di browser, tidak tampil utuh, dan tidak ditulis ke log.
          Setelah terhubung, engine di server bekerja <b>24 jam</b> sesuai jadwal walau aplikasi ditutup.
        </span>
      </Card>

      <SectionTitle>Provider AI</SectionTitle>
      <div className="space-y-2.5">
        {(Object.keys(INFO) as Provider[]).map((p) => {
          const k = providers.find((x) => x.provider === p);
          return (
            <Card key={p} className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: INFO[p].color }}><Plug className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black">{PROVIDER_LABEL[p]}</span>
                    {!k ? <Badge>Belum terhubung</Badge> : k.status === "connected" ? <Badge tone="ok"><CheckCircle2 className="h-3 w-3" /> Terhubung</Badge> : <Badge tone="bad"><XCircle className="h-3 w-3" /> Error</Badge>}
                    {settings?.default_provider === p && <Badge tone="accent">Default</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{k ? `${k.masked} · dites ${dateTime(k.last_tested_at)}` : INFO[p].hint}</div>
                  {k?.last_error && <div className="mt-1 text-xs font-bold text-bad">{k.last_error}</div>}
                </div>
              </div>
              {k ? (
                <div className="mt-3 space-y-3">
                  <Field label={`Model default (${k.models.length} tersedia)`} hint="Dipakai karyawan yang tidak diatur model khusus. Daftar diambil langsung dari provider.">
                    <select className={inputCls} value={k.default_model ?? ""} onChange={(e) => run(`model-${p}`, () => callAI("provider_set_model", { provider: p, model: e.target.value }), "Model default diperbarui")}>
                      {!k.default_model && <option value="">Pilih model…</option>}
                      {k.models.map((m) => <option key={m.id} value={m.id}>{m.label}{m.label !== m.id ? ` (${m.id})` : ""}</option>)}
                    </select>
                  </Field>
                  <Toggle label="Aktif" hint="Matikan sementara tanpa menghapus key." checked={k.enabled} onChange={(v) => run(`toggle-${p}`, () => callAI("provider_toggle", { provider: p, enabled: v }))} />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Button size="sm" loading={busy === `test-${p}`} onClick={() => run(`test-${p}`, async () => { const r = await callAI("provider_test", { provider: p }); if (!r.ok) throw new Error(r.error); }, "Koneksi OK")}><RefreshCw className="h-4 w-4" /> Tes</Button>
                    <Button size="sm" onClick={() => setConnect(p)}><KeyRound className="h-4 w-4" /> Ganti key</Button>
                    {settings?.default_provider !== p && <Button size="sm" onClick={() => setSettings({ default_provider: p })}>Jadikan default</Button>}
                    <Button size="sm" variant="ghost" className="text-bad" loading={busy === `del-${p}`} onClick={() => { if (window.confirm?.(`Hapus API key ${PROVIDER_LABEL[p]}?`) !== false) run(`del-${p}`, () => callAI("provider_delete", { provider: p }), "Key dihapus"); }}><Trash2 className="h-4 w-4" /> Hapus</Button>
                  </div>
                </div>
              ) : (
                <Button variant="primary" className="mt-3 w-full" onClick={() => setConnect(p)}><KeyRound className="h-4 w-4" /> Hubungkan</Button>
              )}
            </Card>
          );
        })}
      </div>

      <PricesCard />

      <ConnectSheet provider={connect} onClose={() => setConnect(null)} onDone={refresh} />
    </PageShell>
  );
}

function ConnectSheet({ provider, onClose, onDone }: { provider: Provider | null; onClose: () => void; onDone: () => void }) {
  const toast = useStore((s) => s.toast);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ models: { id: string; label: string }[]; default_model: string } | null>(null);
  useEffect(() => { setKey(""); setResult(null); }, [provider]);
  const submit = async () => {
    if (!provider) return;
    setBusy(true);
    try {
      const r = await callAI("provider_connect", { provider, apiKey: key.trim() });
      setKey("");
      setResult(r);
      toast(`${PROVIDER_LABEL[provider]} terhubung. Tim mulai bekerja!`, "ok");
      onDone();
    } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!provider} onClose={onClose} title={provider ? `Hubungkan ${PROVIDER_LABEL[provider]}` : ""}
      footer={result ? <Button variant="primary" className="w-full" onClick={onClose}>Selesai</Button> : <Button variant="primary" className="w-full" loading={busy} disabled={key.trim().length < 20} onClick={submit}>Tes & simpan</Button>}>
      {provider && !result && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{INFO[provider].hint}</p>
          <a href={INFO[provider].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-accent-text underline">Buka halaman API key <ExternalLink className="h-3.5 w-3.5" /></a>
          <Field label="API key"><input className={`${inputCls} font-mono`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Tempel API key di sini" /></Field>
          <p className="text-xs text-muted">Server akan menguji key dengan mengambil daftar model. Key yang gagal tidak disimpan.</p>
        </div>
      )}
      {result && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 font-black text-ok"><CheckCircle2 className="h-5 w-5" /> Terhubung — {result.models.length} model tersedia</div>
          <p>Model default dipilih otomatis dari daftar resmi provider: <b>{result.default_model}</b>. Kamu bisa menggantinya kapan saja.</p>
          <p className="text-muted">AURELIA-01 memulai siklus kerja pertama (riset pasar). Pantau di Kantor atau Pusat Tugas.</p>
        </div>
      )}
    </Sheet>
  );
}

function PricesCard() {
  const providers = useStore((s) => s.providers);
  const toast = useStore((s) => s.toast);
  const [prices, setPrices] = useState<any[]>([]);
  const [draft, setDraft] = useState<{ provider: Provider; model: string; input: string; output: string }>({ provider: "gemini", model: "", input: "", output: "" });
  const load = async () => { const { data } = await supabase.from("ai_model_prices").select("*").order("provider"); setPrices(data ?? []); };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!draft.model || draft.input === "" || draft.output === "") return toast("Lengkapi model dan tarif", "bad");
    const { error } = await supabase.from("ai_model_prices").upsert({ provider: draft.provider, model: draft.model, input_per_mtok: Number(draft.input), output_per_mtok: Number(draft.output), updated_at: new Date().toISOString() });
    if (error) return toast(error.message, "bad");
    setDraft({ ...draft, model: "", input: "", output: "" });
    load();
  };
  const del = async (p: any) => { await supabase.from("ai_model_prices").delete().eq("provider", p.provider).eq("model", p.model); load(); };
  const models = providers.find((p) => p.provider === draft.provider)?.models ?? [];
  return (
    <>
      <SectionTitle>Tarif model (untuk estimasi biaya)</SectionTitle>
      <Card className="p-4">
        <p className="text-sm text-muted">Tarif berubah sewaktu-waktu, jadi isi sendiri dari halaman harga resmi provider (USD per 1 juta token). Tanpa tarif, token tetap dihitung dan dibatasi, tapi biaya ditandai "tanpa tarif".</p>
        <div className="mt-3 space-y-1.5">
          {prices.map((p) => (
            <div key={`${p.provider}-${p.model}`} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate"><b>{p.model}</b> <span className="text-muted">· {p.provider}</span></span>
              <span className="flex shrink-0 items-center gap-2 text-xs">in ${Number(p.input_per_mtok)} · out ${Number(p.output_per_mtok)}<button aria-label="Hapus" onClick={() => del(p)} className="text-bad"><Trash2 className="h-4 w-4" /></button></span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select className={inputCls} value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value as Provider, model: "" })}>
            {(["gemini", "anthropic", "openai"] as Provider[]).map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
          </select>
          {models.length ? (
            <select className={inputCls} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
              <option value="">Pilih model…</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
          ) : <input className={inputCls} placeholder="ID model" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />}
          <input className={inputCls} type="number" step="0.01" min={0} placeholder="Input $/1M" value={draft.input} onChange={(e) => setDraft({ ...draft, input: e.target.value })} />
          <input className={inputCls} type="number" step="0.01" min={0} placeholder="Output $/1M" value={draft.output} onChange={(e) => setDraft({ ...draft, output: e.target.value })} />
        </div>
        <Button className="mt-2 w-full" onClick={save}>Simpan tarif</Button>
      </Card>
    </>
  );
}
