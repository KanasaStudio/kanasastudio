import { useShallow } from "zustand/react/shallow";
import { ArrowLeft, MessageCircle, Pause, Play, Plus, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { PageShell } from "../components/Layout";
import { AssignForm } from "../components/Overlays";
import { Badge, Button, Card, Empty, Field, inputCls, Segmented, Sheet, Stat } from "../components/ui";
import { rpc } from "../lib/api";
import { compact, dateTime, KIND_LABEL, num, PROVIDER_LABEL, STATUS_LABEL, statusTone, TASK_STATUS_LABEL, taskTone, timeAgo, usd } from "../lib/format";
import { navigate } from "../lib/router";
import { supabase } from "../lib/supabase";
import type { Employee, Provider } from "../lib/types";
import { useDept, useStore } from "../store/useStore";

export default function EmployeesPage({ id }: { id?: string }) {
  if (id) return <EmployeeDetail id={id} />;
  return <EmployeeList />;
}

function EmployeeList() {
  const employees = useStore((s) => s.employees);
  const departments = useStore((s) => s.departments);
  const tasks = useStore((s) => s.tasks);
  const [filter, setFilter] = useState("all");
  const list = employees.filter((e) => filter === "all" || (filter === "ceo" ? e.is_ceo : e.department_id === filter));
  return (
    <PageShell>
      <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "Semua" }, { value: "ceo", label: "CEO" }, ...departments.map((d) => ({ value: d.id, label: d.short_name }))]} />
      <div className="mt-3 grid gap-2.5 md:grid-cols-2">
        {list.map((e) => {
          const dep = departments.find((d) => d.id === e.department_id);
          const current = tasks.find((t) => t.id === e.current_task_id);
          const done = tasks.filter((t) => t.employee_id === e.id && t.status === "completed").length;
          return (
            <Card key={e.id} as="button" onClick={() => navigate(`karyawan/${e.id}`)} className="flex w-full items-center gap-3 p-3.5">
              <Avatar appearance={e.appearance} status={e.status} size={52} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="truncate font-black">{e.name}</span><Badge tone={statusTone(e.status)}>{STATUS_LABEL[e.status]}</Badge></span>
                <span className="block truncate text-xs text-muted">{e.role_title} · {e.is_ceo ? "Eksekutif" : dep?.short_name}</span>
                <span className="mt-0.5 block truncate text-xs font-bold text-accent-text">{current ? `▶ ${current.title}` : e.status_note ?? `${done} tugas selesai`}</span>
              </span>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}

const TOOLS = [
  { id: "web_search", label: "Pencarian web", hint: "Riset dengan sumber terbaru" },
  { id: "memory_read", label: "Baca memori", hint: "Akses memori sesuai cakupan" },
  { id: "memory_write", label: "Tulis memori", hint: "Simpan hasil & pelajaran" },
  { id: "internal_message", label: "Pesan internal", hint: "Kirim catatan ke rekan" },
  { id: "ledger_read", label: "Baca ledger keuangan", hint: "Data transaksi & biaya API" },
];

function EmployeeDetail({ id }: { id: string }) {
  const emp = useStore((s) => s.employees.find((e) => e.id === id));
  const dept = useDept(emp?.department_id);
  const tasks = useStore(useShallow((s) => s.tasks.filter((t) => t.employee_id === id)));
  const openChat = useStore((s) => s.openChat);
  const toast = useStore((s) => s.toast);
  const [tab, setTab] = useState<"profil" | "tugas" | "performa" | "laporan" | "konfigurasi">("profil");
  const [assign, setAssign] = useState(false);
  const [usage, setUsage] = useState<{ tokens: number; usd: number; unpriced: number; calls: number } | null>(null);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data } = await supabase.from("ai_api_usage").select("input_tokens,output_tokens,cost_usd").eq("employee_id", id).gte("created_at", since).limit(5000);
      const rows = data ?? [];
      setUsage({
        tokens: rows.reduce((a, r) => a + r.input_tokens + r.output_tokens, 0), usd: rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0),
        unpriced: rows.filter((r) => r.cost_usd == null).length, calls: rows.length,
      });
      const { data: rep } = await supabase.from("ai_research_reports").select("id,title,summary,created_at,task_id,verified_sources").eq("employee_id", id).order("created_at", { ascending: false }).limit(20);
      setReports(rep ?? []);
    })();
  }, [id]);

  const perf = useMemo(() => {
    const done = tasks.filter((t) => t.status === "completed");
    const failed = tasks.filter((t) => t.status === "failed").length;
    const durations = done.filter((t) => t.started_at && t.completed_at).map((t) => Date.parse(t.completed_at!) - Date.parse(t.started_at!));
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length / 60000 : null;
    const revisions = tasks.reduce((a, t) => a + t.revision_count, 0);
    return { done: done.length, failed, rate: done.length + failed ? Math.round((done.length / (done.length + failed)) * 100) : null, avg, revisions };
  }, [tasks]);

  if (!emp) return <PageShell><Empty title="Karyawan tidak ditemukan" /></PageShell>;
  const togglePause = async () => {
    try { await rpc("ai_employee_pause", { p_employee: emp.id, p_paused: !emp.paused }); } catch (e) { toast((e as Error).message, "bad"); }
  };

  return (
    <PageShell>
      <button onClick={() => navigate("karyawan")} className="mb-2 flex items-center gap-1 text-sm font-bold text-muted"><ArrowLeft className="h-4 w-4" /> Semua karyawan</button>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Avatar appearance={emp.appearance} status={emp.status} size={68} />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-black leading-tight">{emp.name}</div>
            <div className="text-sm text-muted">{emp.role_title}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone="accent">{emp.is_ceo ? "Eksekutif" : dept?.name}</Badge>
              <Badge tone={statusTone(emp.status)}>{STATUS_LABEL[emp.status]}</Badge>
              <Badge>{emp.code}</Badge>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="primary" onClick={() => openChat(emp.id)}><MessageCircle className="h-4 w-4" /> Chat</Button>
          {!emp.is_ceo ? <Button onClick={() => setAssign(true)}><Plus className="h-4 w-4" /> Tugas</Button> : <Button onClick={() => useStore.getState().setCommandOpen(true)}><Plus className="h-4 w-4" /> Perintah</Button>}
          <Button onClick={togglePause}>{emp.paused ? <><Play className="h-4 w-4" /> Lanjut</> : <><Pause className="h-4 w-4" /> Jeda</>}</Button>
        </div>
      </Card>

      <div className="mt-4"><Segmented value={tab} onChange={setTab} options={[
        { value: "profil", label: "Profil" }, { value: "tugas", label: "Tugas", count: tasks.length }, { value: "performa", label: "Performa" },
        { value: "laporan", label: "Laporan", count: reports.length }, { value: "konfigurasi", label: "Konfigurasi" },
      ]} /></div>

      {tab === "profil" && (
        <div className="mt-3 space-y-3">
          <Card className="p-4"><div className="text-xs font-black uppercase text-muted">Deskripsi pekerjaan</div><p className="mt-1 text-sm">{emp.job_description}</p></Card>
          <Card className="p-4">
            <div className="text-xs font-black uppercase text-muted">Kemampuan</div>
            <div className="mt-2 flex flex-wrap gap-1.5">{emp.capabilities.map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs font-black uppercase text-muted">Model AI</div>
            <p className="mt-1 text-sm">{emp.provider ? `${PROVIDER_LABEL[emp.provider]} · ${emp.model ?? "model default provider"}` : "Mengikuti provider & model default perusahaan"}</p>
            <div className="mt-1 text-xs text-muted">Aktif terakhir {timeAgo(emp.last_active_at)}</div>
          </Card>
        </div>
      )}

      {tab === "tugas" && (
        <div className="mt-3 space-y-2">
          {tasks.length ? tasks.map((t) => (
            <Card key={t.id} as="button" onClick={() => navigate(`tugas/${t.id}`)} className="w-full p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-extrabold">{t.title}</span>
                <Badge tone={taskTone(t.status)}>{TASK_STATUS_LABEL[t.status]}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted">{t.code} · {KIND_LABEL[t.kind]} · {timeAgo(t.created_at)}</div>
            </Card>
          )) : <Empty title="Belum ada tugas" />}
        </div>
      )}

      {tab === "performa" && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Stat label="Tugas selesai" value={perf.done} tone="ok" />
          <Stat label="Gagal" value={perf.failed} tone="bad" />
          <Stat label="Tingkat sukses" value={perf.rate === null ? "—" : `${perf.rate}%`} />
          <Stat label="Rata-rata durasi" value={perf.avg === null ? "—" : `${perf.avg.toFixed(1)} mnt`} tone="info" />
          <Stat label="Revisi diminta" value={perf.revisions} />
          <Stat label="Token 30 hari" value={usage ? compact(usage.tokens) : "…"} tone="info" />
          <Stat label="Biaya 30 hari" value={usage ? usd(usage.usd, 4) : "…"} sub={usage?.unpriced ? `${usage.unpriced} panggilan tanpa tarif` : undefined} />
          <Stat label="Panggilan API" value={usage ? num(usage.calls) : "…"} />
        </div>
      )}

      {tab === "laporan" && (
        <div className="mt-3 space-y-2">
          {reports.length ? reports.map((r) => (
            <Card key={r.id} as="button" onClick={() => r.task_id && navigate(`tugas/${r.task_id}`)} className="w-full p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-extrabold">{r.title}</span>
                <Badge tone={r.verified_sources ? "ok" : "warn"}>{r.verified_sources ? "Bersumber" : "Belum terverifikasi"}</Badge>
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-muted">{r.summary}</p>
              <div className="mt-1 text-xs text-muted">{dateTime(r.created_at)}</div>
            </Card>
          )) : <Empty title="Belum ada laporan riset" text="Laporan muncul setelah tugas riset selesai." />}
        </div>
      )}

      {tab === "konfigurasi" && <EmployeeConfig emp={emp} />}

      <Sheet open={assign} onClose={() => setAssign(false)} title={`Tugas untuk ${emp.name}`}>
        <AssignForm employee={emp} onDone={() => setAssign(false)} />
      </Sheet>
    </PageShell>
  );
}

function EmployeeConfig({ emp }: { emp: Employee }) {
  const providers = useStore((s) => s.providers);
  const departments = useStore((s) => s.departments);
  const toast = useStore((s) => s.toast);
  const [f, setF] = useState(() => ({ ...emp }));
  const [saving, setSaving] = useState(false);
  useEffect(() => setF({ ...emp }), [emp.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const prov = providers.find((p) => p.provider === f.provider);
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleArr = (k: "tool_permissions" | "memory_scopes", v: string) =>
    set(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("ai_employees").update({
      job_description: f.job_description, system_instructions: f.system_instructions, capabilities: f.capabilities,
      provider: f.provider, model: f.provider ? f.model : null, temperature: f.temperature, max_output_tokens: f.max_output_tokens,
      context_messages: f.context_messages, memory_scopes: f.memory_scopes, tool_permissions: f.tool_permissions,
      daily_token_budget: f.daily_token_budget, daily_usd_budget: f.daily_usd_budget,
    }).eq("id", emp.id);
    setSaving(false);
    toast(error ? `Gagal: ${error.message}` : "Konfigurasi disimpan", error ? "bad" : "ok");
  };
  return (
    <div className="mt-3 space-y-3">
      <Card className="space-y-3 p-4">
        <div className="text-sm font-black">Model AI</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider">
            <select className={inputCls} value={f.provider ?? ""} onChange={(e) => { set("provider", (e.target.value || null) as Provider | null); set("model", null); }}>
              <option value="">Default perusahaan</option>
              {providers.filter((p) => p.status === "connected").map((p) => <option key={p.provider} value={p.provider}>{PROVIDER_LABEL[p.provider]}</option>)}
            </select>
          </Field>
          <Field label="Model">
            <select className={inputCls} value={f.model ?? ""} disabled={!prov} onChange={(e) => set("model", e.target.value || null)}>
              <option value="">{prov ? `Default (${prov.default_model ?? "-"})` : "—"}</option>
              {prov?.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted">Daftar model diambil langsung dari provider saat API dihubungkan, jadi hanya model yang benar-benar tersedia yang bisa dipilih.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Temperature: ${Number(f.temperature).toFixed(2)}`}>
            <input type="range" min={0} max={1.2} step={0.05} value={f.temperature} onChange={(e) => set("temperature", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label="Maks token output"><input type="number" className={inputCls} value={f.max_output_tokens} min={256} max={32000} onChange={(e) => set("max_output_tokens", Number(e.target.value))} /></Field>
          <Field label="Jendela konteks (pesan)"><input type="number" className={inputCls} value={f.context_messages} min={2} max={40} onChange={(e) => set("context_messages", Number(e.target.value))} /></Field>
          <Field label="Anggaran token/hari"><input type="number" className={inputCls} value={f.daily_token_budget} min={1000} step={10000} onChange={(e) => set("daily_token_budget", Number(e.target.value))} /></Field>
          <Field label="Anggaran USD/hari"><input type="number" className={inputCls} value={f.daily_usd_budget} min={0} step={0.1} onChange={(e) => set("daily_usd_budget", Number(e.target.value))} /></Field>
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-sm font-black">Izin tool</div>
        {TOOLS.map((t) => (
          <label key={t.id} className="flex items-center justify-between gap-3 py-2">
            <span><span className="block text-sm font-bold">{t.label}</span><span className="text-xs text-muted">{t.hint}</span></span>
            <input type="checkbox" checked={f.tool_permissions.includes(t.id)} onChange={() => toggleArr("tool_permissions", t.id)} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
        ))}
      </Card>
      <Card className="p-4">
        <div className="text-sm font-black">Akses memori departemen</div>
        <p className="text-xs text-muted">Karyawan hanya bisa membaca memori dari cakupan yang dicentang.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[{ id: "company", name: "Perusahaan" }, ...departments.map((d) => ({ id: d.id, name: d.short_name }))].map((s) => (
            <button key={s.id} onClick={() => toggleArr("memory_scopes", s.id)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${f.memory_scopes.includes(s.id) ? "border-accent bg-accent-soft text-accent-text" : "border-line text-muted"}`}>{s.name}</button>
          ))}
        </div>
      </Card>
      <Card className="space-y-3 p-4">
        <Field label="Deskripsi pekerjaan"><textarea className={`${inputCls} min-h-20`} value={f.job_description} onChange={(e) => set("job_description", e.target.value)} /></Field>
        <Field label="Kemampuan (pisahkan dengan koma)"><input className={inputCls} value={f.capabilities.join(", ")} onChange={(e) => set("capabilities", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
        <Field label="Instruksi sistem" hint="Kepribadian, aturan kerja, dan standar kualitas karyawan ini."><textarea className={`${inputCls} min-h-40 font-mono text-[13px]`} value={f.system_instructions} onChange={(e) => set("system_instructions", e.target.value)} /></Field>
      </Card>
      <Button variant="primary" size="lg" className="w-full" loading={saving} onClick={save}><Save className="h-5 w-5" /> Simpan konfigurasi</Button>
    </div>
  );
}
