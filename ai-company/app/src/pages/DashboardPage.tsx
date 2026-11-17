import { useShallow } from "zustand/react/shallow";
import {
  Activity, AlertTriangle, Bot, CheckCircle2, ClipboardList, Coffee, Coins, Cpu, KeyRound, Lightbulb, Play, Radar, ShieldAlert,
  Sparkles, TrendingDown, TrendingUp, Users, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { PageShell } from "../components/Layout";
import { Badge, Button, Card, Empty, ProgressBar, SectionTitle, Stat } from "../components/ui";
import { callAI } from "../lib/api";
import { compact, dateTime, idr, num, timeAgo, usd } from "../lib/format";
import { Markdown } from "../lib/markdown";
import { navigate } from "../lib/router";
import { supabase } from "../lib/supabase";
import { useStore } from "../store/useStore";

export default function DashboardPage() {
  const d = useStore((s) => s.dashboard);
  const employees = useStore((s) => s.employees);
  const departments = useStore((s) => s.departments);
  const tasks = useStore((s) => s.tasks);
  const approvals = useStore(useShallow((s) => s.approvals.filter((a) => a.status === "pending")));
  const notifications = useStore((s) => s.notifications);
  const settings = useStore((s) => s.settings);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const refresh = useStore((s) => s.refreshDashboard);
  const toast = useStore((s) => s.toast);
  const [logs, setLogs] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [briefing, setBriefing] = useState<any | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    refresh();
    (async () => {
      const [l, o, b] = await Promise.all([
        supabase.from("ai_activity_logs").select("*").order("created_at", { ascending: false }).limit(15),
        supabase.from("ai_opportunities").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("ai_messages").select("*").eq("thread", "group").eq("sender_id", "aurelia").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setLogs(l.data ?? []); setOpps(o.data ?? []); setBriefing(b.data);
    })();
    const ch = supabase.channel("dash-logs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_activity_logs" }, (p) => setLogs((x) => [p.new, ...x].slice(0, 15)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const urgent = notifications.filter((n) => !n.read_at && n.priority !== "normal").slice(0, 4);
  const deadlines = useMemo(() => tasks.filter((t) => t.due_at && !["completed", "cancelled"].includes(t.status))
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!)).slice(0, 5), [tasks]);
  const deptPerf = useMemo(() => departments.map((dep) => {
    const ts = tasks.filter((t) => t.department_id === dep.id);
    const done = ts.filter((t) => t.status === "completed").length;
    const failed = ts.filter((t) => t.status === "failed").length;
    const active = ts.filter((t) => ["queued", "running"].includes(t.status)).length;
    return { dep, done, failed, active, rate: done + failed ? Math.round((done / (done + failed)) * 100) : null };
  }), [departments, tasks]);
  const ceo = employees.find((e) => e.is_ceo);

  const runNow = async () => {
    setRunning(true);
    try { await callAI("schedule_action", { scheduleAction: "research" }); toast("Siklus riset dimulai", "ok"); }
    catch (e) { toast((e as Error).message, "bad"); } finally { setRunning(false); }
  };

  return (
    <PageShell>
      {/* Perintah ke AI CEO */}
      <Card className="overflow-hidden !border-0 !bg-ink p-4 text-ink-text">
        <div className="flex items-center gap-3">
          {ceo && <Avatar appearance={ceo.appearance} status={ceo.status} size={48} />}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white/60">AURELIA-01 · AI CEO</div>
            <div className="font-black">Apa objektif kita hari ini, Founder?</div>
          </div>
        </div>
        <button onClick={() => setCommandOpen(true)} className="mt-3 flex w-full items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-left text-sm text-white/70 transition active:scale-[0.99]">
          <Sparkles className="h-4 w-4 text-accent" /> Tulis perintah, mis. "Riset peluang animasi AI di Indonesia"
        </button>
        {settings?.emergency_stop && <div className="mt-3 rounded-xl bg-bad px-3 py-2 text-sm font-bold">EMERGENCY STOP aktif — semua eksekusi berhenti. Matikan di Pengaturan.</div>}
      </Card>

      {d && !d.providers_connected && (
        <Card className="mt-3 flex items-center gap-3 border-accent/50 p-4" onClick={() => navigate("api")} as="button">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-white"><KeyRound className="h-5 w-5" /></span>
          <span className="text-sm"><b>Hubungkan API AI</b> agar karyawan bekerja otomatis 24 jam. Setelah terhubung, siklus riset pertama langsung dimulai.</span>
        </Card>
      )}

      <SectionTitle action={d?.providers_connected ? <Button size="sm" onClick={runNow} loading={running}><Play className="h-3.5 w-3.5" /> Jalankan riset</Button> : undefined}>Ringkasan perusahaan</SectionTitle>
      {!d ? <div className="h-40 animate-pulse rounded-3xl bg-surface" /> : (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Stat label="Karyawan AI" value={d.employees.total} sub={`${d.employees.working} bekerja · ${d.employees.idle} senggang`} icon={<Users className="h-4 w-4" />} />
          <Stat label="Istirahat / jeda" value={`${d.employees.resting} / ${d.employees.paused}`} sub={d.employees.failed ? `${d.employees.failed} ada kendala` : "Tidak ada kendala"} icon={<Coffee className="h-4 w-4" />} tone="info" />
          <Stat label="Tugas aktif" value={d.tasks.active} sub={`${d.tasks.running} sedang dikerjakan`} icon={<ClipboardList className="h-4 w-4" />} />
          <Stat label="Selesai" value={d.tasks.completed} sub={`${d.tasks.completed_today} hari ini`} icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" />
          <Stat label="Gagal / terblokir" value={`${d.tasks.failed} / ${d.tasks.blocked}`} sub={`${d.tasks.failed_today} gagal hari ini`} icon={<XCircle className="h-4 w-4" />} tone="bad" />
          <Stat label="Butuh persetujuan" value={d.approvals_pending} sub="Keputusan Founder" icon={<ShieldAlert className="h-4 w-4" />} tone={d.approvals_pending ? "bad" : "ok"} />
          <Stat label="Pendapatan aktual" value={compact(d.finance.revenue_actual_idr)} sub={`${idr(d.finance.revenue_actual_idr)} bulan ini`} icon={<TrendingUp className="h-4 w-4" />} tone="ok" />
          <Stat label="Pengeluaran aktual" value={compact(d.finance.expense_actual_idr)} sub={`${idr(d.finance.expense_actual_idr)} bulan ini`} icon={<TrendingDown className="h-4 w-4" />} tone="bad" />
          <Stat label="Biaya API (estimasi)" value={usd(d.api.usd_month)} sub={d.api.unpriced_calls_month ? `${d.api.unpriced_calls_month} panggilan tanpa tarif` : `${d.api.calls_month} panggilan bulan ini`} icon={<Coins className="h-4 w-4" />} />
          <Stat label="Token hari ini" value={compact(d.api.tokens_today)} sub={`batas ${compact(settings?.global_daily_token_limit ?? 0)}`} icon={<Cpu className="h-4 w-4" />} tone="info" />
          <Stat label="Temuan riset" value={d.research_today} sub="laporan hari ini" icon={<Radar className="h-4 w-4" />} />
          <Stat label="Peluang baru" value={d.opportunities_new} sub="belum ditinjau" icon={<Lightbulb className="h-4 w-4" />} tone="ok" />
        </div>
      )}

      <div className="grid gap-x-5 md:grid-cols-2">
        <div>
          <SectionTitle action={approvals.length ? <Badge tone="bad">{approvals.length}</Badge> : undefined}>Menunggu persetujuan</SectionTitle>
          {approvals.length ? (
            <div className="space-y-2">
              {approvals.slice(0, 5).map((a) => {
                const t = tasks.find((x) => x.id === a.task_id);
                return (
                  <Card key={a.id} as="button" onClick={() => navigate(`tugas/${a.task_id}`)} className="flex w-full items-start gap-3 p-3.5">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
                    <span className="min-w-0">
                      <span className="block font-extrabold">{t?.code} · {a.action}</span>
                      <span className="line-clamp-2 block text-sm text-muted">{a.reason}</span>
                    </span>
                  </Card>
                );
              })}
            </div>
          ) : <Empty title="Tidak ada keputusan tertunda" text="Aksi eksternal, keuangan, dan deploy akan muncul di sini sebelum dijalankan." />}

          <SectionTitle>Briefing AURELIA-01</SectionTitle>
          <Card className="p-4">
            {briefing ? (
              <>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold text-muted"><Bot className="h-4 w-4 text-accent" /> {dateTime(briefing.created_at)}</div>
                <Markdown text={briefing.content} />
              </>
            ) : <p className="text-sm text-muted">Belum ada briefing. AURELIA-01 menulis briefing otomatis tiap hari kerja pukul 07:00 WIB dan laporan eksekutif pukul 17:00.</p>}
            <Button size="sm" className="mt-3" onClick={() => useStore.getState().openChat("group")}>Buka ruang rapat</Button>
          </Card>

          <SectionTitle>Notifikasi penting</SectionTitle>
          {urgent.length ? (
            <div className="space-y-2">
              {urgent.map((n) => (
                <Card key={n.id} as="button" onClick={() => navigate(n.link?.replace(/^#\//, "") || "notifikasi")} className="flex w-full items-start gap-3 p-3.5">
                  <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${n.priority === "critical" ? "text-bad" : "text-warn"}`} />
                  <span className="min-w-0">
                    <span className="block font-extrabold">{n.title}{n.occurrences > 1 ? ` (${n.occurrences}×)` : ""}</span>
                    <span className="line-clamp-2 block text-sm text-muted">{n.body}</span>
                    <span className="text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                  </span>
                </Card>
              ))}
            </div>
          ) : <Empty title="Tidak ada notifikasi mendesak" />}
        </div>

        <div>
          <SectionTitle action={<button className="text-xs font-bold text-accent-text" onClick={() => navigate("intel")}>Lihat semua</button>}>Peluang pasar terbaru</SectionTitle>
          {opps.length ? (
            <div className="space-y-2">
              {opps.map((o) => (
                <Card key={o.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-extrabold">{o.title}</div>
                    <Badge tone={o.confidence === "high" ? "ok" : o.confidence === "medium" ? "info" : "muted"}>{o.confidence}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{o.description}</p>
                  <div className="mt-1 text-[11px] text-muted">{o.region ?? "-"} · {o.category ?? "-"} · {timeAgo(o.created_at)}</div>
                </Card>
              ))}
            </div>
          ) : <Empty icon={<Lightbulb className="h-6 w-6" />} title="Belum ada peluang" text="Peluang muncul dari laporan riset tim dengan sumber web." />}

          <SectionTitle>Kinerja departemen</SectionTitle>
          <Card className="divide-y divide-line">
            {deptPerf.map(({ dep, done, failed, active, rate }) => (
              <div key={dep.id} className="flex items-center gap-3 px-4 py-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dep.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{dep.name}</span>
                  <span className="text-xs text-muted">{done} selesai · {failed} gagal · {active} aktif</span>
                </span>
                <span className="w-20">{rate === null ? <span className="text-xs text-muted">—</span> : <ProgressBar value={rate} tone="ok" />}</span>
              </div>
            ))}
          </Card>

          <SectionTitle>Tenggat terdekat</SectionTitle>
          {deadlines.length ? (
            <Card className="divide-y divide-line">
              {deadlines.map((t) => (
                <button key={t.id} onClick={() => navigate(`tugas/${t.id}`)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                  <span className="truncate text-sm font-bold">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted">{dateTime(t.due_at)}</span>
                </button>
              ))}
            </Card>
          ) : <Empty title="Tidak ada tenggat" text="Tambahkan tenggat saat membuat tugas." />}

          <SectionTitle>Aktivitas karyawan</SectionTitle>
          <Card className="p-2">
            {logs.length ? logs.map((l) => (
              <div key={l.id} className="flex items-start gap-2.5 rounded-2xl px-2 py-2">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0">
                  <div className="text-sm"><b>{l.actor_name}</b> · {l.summary}</div>
                  <div className="text-[11px] text-muted">{timeAgo(l.created_at)} · {l.category}</div>
                </div>
              </div>
            )) : <div className="p-4 text-sm text-muted">Belum ada aktivitas.</div>}
            <div className="px-2 pb-1 text-[11px] text-muted">Log aktivitas bersifat immutable (tidak bisa diubah/dihapus). Total aksi: {num(logs.length)} terbaru ditampilkan.</div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
