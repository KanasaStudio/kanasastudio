import { ExternalLink, Lightbulb, Play, Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "../components/Layout";
import { TaskDetail } from "../components/Overlays";
import { Badge, Button, Card, Empty, Segmented } from "../components/ui";
import { callAI } from "../lib/api";
import { dateTime, timeAgo } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useStore } from "../store/useStore";

export default function IntelPage() {
  const toast = useStore((s) => s.toast);
  const settings = useStore((s) => s.settings);
  const [tab, setTab] = useState<"peluang" | "laporan">("peluang");
  const [reports, setReports] = useState<any[] | null>(null);
  const [opps, setOpps] = useState<any[] | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [region, setRegion] = useState("all");
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [r, o] = await Promise.all([
      supabase.from("ai_research_reports").select("*").order("created_at", { ascending: false }).limit(60),
      supabase.from("ai_opportunities").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setReports(r.data ?? []); setOpps(o.data ?? []);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("intel")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_research_reports" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("ai_opportunities").update({ status }).eq("id", id);
    if (error) return toast(error.message, "bad");
    setOpps((x) => x?.map((o) => (o.id === id ? { ...o, status } : o)) ?? null);
  };
  const runResearch = async () => {
    setRunning(true);
    try { const r = await callAI("schedule_action", { scheduleAction: "research" }); toast(r.result?.text ?? "Riset dimulai", "ok"); }
    catch (e) { toast((e as Error).message, "bad"); } finally { setRunning(false); }
  };

  const regions = ["all", ...(settings?.research_regions ?? [])];
  const fOpps = (opps ?? []).filter((o) => region === "all" || o.region === region);
  const fReports = (reports ?? []).filter((r) => region === "all" || r.region === region);

  return (
    <PageShell>
      <Card className="flex items-center gap-3 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><Radar className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1 text-sm">
          <b>Riset otomatis setiap hari kerja pukul 08:00 WIB.</b> Setiap temuan menyimpan sumber, tanggal terbit, tanggal riset, tingkat keyakinan, dan relevansi bisnis. Temuan tanpa sumber dari pencarian web ditandai belum terverifikasi.
        </div>
      </Card>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: "peluang", label: "Peluang", count: opps?.length }, { value: "laporan", label: "Laporan riset", count: reports?.length }]} />
        <Button size="sm" onClick={runResearch} loading={running}><Play className="h-3.5 w-3.5" /> Riset</Button>
      </div>
      <div className="mt-2"><Segmented value={region} onChange={setRegion} options={regions.map((r) => ({ value: r, label: r === "all" ? "Semua wilayah" : r }))} /></div>

      {tab === "peluang" ? (
        <div className="mt-3 space-y-2">
          {opps === null ? <div className="h-32 animate-pulse rounded-3xl bg-surface" /> : !fOpps.length ? (
            <Empty icon={<Lightbulb className="h-6 w-6" />} title="Belum ada peluang" text="Peluang dibuat dari laporan riset. Jalankan riset atau tunggu jadwal pagi." />
          ) : fOpps.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-extrabold leading-snug">{o.title}</div>
                <Badge tone={o.confidence === "high" ? "ok" : o.confidence === "medium" ? "info" : "muted"}>Keyakinan {o.confidence === "high" ? "tinggi" : o.confidence === "medium" ? "sedang" : "rendah"}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{o.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{o.region ?? "-"}</span>·<span>{o.category ?? "-"}</span>·<span>{timeAgo(o.created_at)}</span>
                {o.task_id && <button className="font-bold text-accent-text underline" onClick={() => setTaskId(o.task_id)}>Lihat riset sumber</button>}
              </div>
              <div className="mt-3 flex gap-1.5">
                {[["new", "Baru"], ["reviewing", "Ditinjau"], ["pursuing", "Dikejar"], ["dismissed", "Abaikan"]].map(([v, l]) => (
                  <button key={v} onClick={() => setStatus(o.id, v)} className={`rounded-full px-3 py-1 text-xs font-bold ${o.status === v ? "bg-ink text-ink-text dark:bg-accent dark:text-white" : "border border-line text-muted"}`}>{l}</button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {reports === null ? <div className="h-32 animate-pulse rounded-3xl bg-surface" /> : !fReports.length ? (
            <Empty icon={<Radar className="h-6 w-6" />} title="Belum ada laporan riset" />
          ) : fReports.map((r) => (
            <Card key={r.id} as="button" onClick={() => r.task_id && setTaskId(r.task_id)} className="w-full p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-extrabold leading-snug">{r.title}</div>
                <Badge tone={r.verified_sources ? "ok" : "warn"}>{r.verified_sources ? `${(r.sources ?? []).length} sumber` : "Belum terverifikasi"}</Badge>
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-muted">{r.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(r.sources ?? []).slice(0, 3).map((s: any, i: number) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
                    <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{s.title || s.url}</span>
                  </a>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-muted">Diriset {dateTime(r.research_date)} · {r.category} · {r.region}</div>
            </Card>
          ))}
        </div>
      )}
      <TaskDetail taskId={taskId} onClose={() => setTaskId(null)} />
    </PageShell>
  );
}
