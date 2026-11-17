import { ChevronDown, MessageCircle, OctagonX, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../components/Avatar";
import { PageShell } from "../components/Layout";
import { Badge, Button, Card, Empty, ProgressBar, SectionTitle, Toggle } from "../components/ui";
import { rpc } from "../lib/api";
import { dateTime, PRIORITY_LABEL, priorityTone, STATUS_LABEL, TASK_STATUS_LABEL, taskTone } from "../lib/format";
import { Markdown } from "../lib/markdown";
import { navigate } from "../lib/router";
import type { Directive } from "../lib/types";
import { useStore } from "../store/useStore";

const DIR_STATUS: Record<Directive["status"], { label: string; tone: "accent" | "ok" | "bad" | "muted" | "info" }> = {
  planning: { label: "Merencanakan", tone: "accent" }, active: { label: "Berjalan", tone: "info" }, completed: { label: "Selesai", tone: "ok" },
  failed: { label: "Gagal", tone: "bad" }, cancelled: { label: "Dibatalkan", tone: "muted" },
};

export default function CeoPage() {
  const ceo = useStore((s) => s.employees.find((e) => e.is_ceo));
  const directives = useStore((s) => s.directives);
  const tasks = useStore((s) => s.tasks);
  const employees = useStore((s) => s.employees);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const openChat = useStore((s) => s.openChat);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const toast = useStore((s) => s.toast);
  const [open, setOpen] = useState<string | null>(directives[0]?.id ?? null);
  const [stopping, setStopping] = useState(false);

  const emergency = async () => {
    setStopping(true);
    try {
      await rpc("ai_set_emergency", { p_on: !settings?.emergency_stop });
      useStore.setState((s) => ({ settings: s.settings ? { ...s.settings, emergency_stop: !s.settings.emergency_stop } : s.settings }));
      toast(settings?.emergency_stop ? "Operasi dilanjutkan" : "EMERGENCY STOP aktif", settings?.emergency_stop ? "ok" : "bad");
    } catch (e) { toast((e as Error).message, "bad"); } finally { setStopping(false); }
  };

  return (
    <PageShell>
      {ceo && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Avatar appearance={ceo.appearance} status={ceo.status} size={64} />
            <div className="min-w-0 flex-1">
              <div className="text-xl font-black">AURELIA-01</div>
              <div className="text-sm text-muted">AI Chief Executive Officer · {STATUS_LABEL[ceo.status]}</div>
              {ceo.status_note && <div className="mt-0.5 truncate text-xs font-bold text-accent-text">{ceo.status_note}</div>}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">{ceo.job_description}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="primary" onClick={() => setCommandOpen(true)}><Sparkles className="h-4 w-4" /> Perintah</Button>
            <Button onClick={() => openChat("aurelia")}><MessageCircle className="h-4 w-4" /> Chat</Button>
            <Button onClick={() => openChat("group")}><Users className="h-4 w-4" /> Rapat</Button>
          </div>
        </Card>
      )}

      <SectionTitle>Kendali otonomi</SectionTitle>
      {settings && (
        <Card className="px-4 py-2">
          <Toggle label="Mode otonom" hint="Jadwal harian boleh membuat riset & tugas sendiri. Jika mati, tim hanya mengerjakan perintahmu." checked={settings.autonomy_enabled} onChange={(v) => setSettings({ autonomy_enabled: v })} />
          <Toggle label="Review kualitas oleh AURELIA" hint="Hasil penting direview dan bisa diminta revisi." checked={settings.ceo_review_enabled} onChange={(v) => setSettings({ ceo_review_enabled: v })} />
          <Toggle label="Jeda jadwal harian" hint="Jadwal 07:00–18:00 tidak berjalan sementara." checked={settings.schedule_paused} onChange={(v) => setSettings({ schedule_paused: v })} />
          <div className="py-3">
            <Button variant={settings.emergency_stop ? "primary" : "danger"} className="w-full" loading={stopping} onClick={emergency}>
              <OctagonX className="h-5 w-5" /> {settings.emergency_stop ? "Matikan Emergency Stop" : "EMERGENCY STOP"}
            </Button>
            <p className="mt-1.5 text-xs text-muted">Menghentikan semua eksekusi dan jadwal seketika. Tugas yang sedang berjalan dikembalikan ke antrean.</p>
          </div>
        </Card>
      )}

      <SectionTitle>Directive & rencana kerja</SectionTitle>
      {!directives.length ? (
        <Empty icon={<Sparkles className="h-6 w-6" />} title="Belum ada perintah" text="Beri objektif ke AURELIA-01, ia akan memecahnya menjadi tugas dengan dependensi." action={<Button variant="primary" onClick={() => setCommandOpen(true)}>Beri perintah</Button>} />
      ) : (
        <div className="space-y-2.5">
          {directives.map((d) => {
            const ts = tasks.filter((t) => t.directive_id === d.id);
            const done = ts.filter((t) => t.status === "completed").length;
            const isOpen = open === d.id;
            return (
              <Card key={d.id} className="overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : d.id)} className="flex w-full items-start gap-3 p-4 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-black text-muted">{d.code}</span>
                      <Badge tone={DIR_STATUS[d.status].tone}>{DIR_STATUS[d.status].label}</Badge>
                      <Badge tone={priorityTone(d.priority)}>{PRIORITY_LABEL[d.priority]}</Badge>
                      {d.source !== "founder" && <Badge>{d.source === "schedule" ? "Jadwal" : "Dari chat"}</Badge>}
                    </div>
                    <div className="mt-1 font-extrabold leading-snug">{d.objective}</div>
                    {ts.length > 0 && <div className="mt-2 flex items-center gap-2"><ProgressBar value={(done / ts.length) * 100} tone="ok" /><span className="shrink-0 text-xs font-bold text-muted">{done}/{ts.length}</span></div>}
                  </div>
                  <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-muted transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
                    {d.error && <div className="rounded-2xl bg-bad-soft p-3 text-sm text-bad">{d.error}</div>}
                    {d.analysis && <div><div className="text-xs font-black uppercase text-muted">Analisis</div><p className="text-sm">{d.analysis}</p></div>}
                    {ts.length > 0 && (
                      <div className="space-y-1.5">
                        {ts.slice().reverse().map((t) => {
                          const e = employees.find((x) => x.id === t.employee_id);
                          return (
                            <button key={t.id} onClick={() => navigate(`tugas/${t.id}`)} className="flex w-full items-center gap-2.5 rounded-2xl border border-line p-2.5 text-left">
                              {e && <Avatar appearance={e.appearance} size={30} ring={false} />}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">{t.title}</span>
                                <span className="text-[11px] text-muted">{t.code} · {e?.name}</span>
                              </span>
                              <Badge tone={taskTone(t.status)}>{TASK_STATUS_LABEL[t.status]}</Badge>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {d.report && <div className="rounded-2xl bg-surface-2 p-3"><div className="mb-1 text-xs font-black uppercase text-muted">Laporan eksekutif</div><Markdown text={d.report} /></div>}
                    <div className="text-[11px] text-muted">Dibuat {dateTime(d.created_at)}{d.completed_at ? ` · selesai ${dateTime(d.completed_at)}` : ""}</div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
