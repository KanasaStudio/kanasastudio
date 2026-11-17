import { ClipboardList, Globe, Plus, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { PageShell } from "../components/Layout";
import { TaskDetail } from "../components/Overlays";
import { Badge, Button, Card, Empty, inputCls, ProgressBar, Segmented } from "../components/ui";
import { KIND_LABEL, PRIORITY_LABEL, priorityTone, TASK_STATUS_LABEL, taskTone, timeAgo } from "../lib/format";
import { navigate } from "../lib/router";
import type { Task } from "../lib/types";
import { useStore } from "../store/useStore";

type Filter = "aktif" | "persetujuan" | "selesai" | "masalah" | "semua";

export function filterTasks(tasks: Task[], f: Filter) {
  switch (f) {
    case "aktif": return tasks.filter((t) => ["queued", "running"].includes(t.status));
    case "persetujuan": return tasks.filter((t) => t.status === "awaiting_approval");
    case "selesai": return tasks.filter((t) => t.status === "completed");
    case "masalah": return tasks.filter((t) => ["failed", "blocked"].includes(t.status));
    default: return tasks;
  }
}

export default function TasksPage({ id, kindFilter, title }: { id?: string; kindFilter?: (t: Task) => boolean; title?: string }) {
  const all = useStore((s) => s.tasks);
  const employees = useStore((s) => s.employees);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const tasks = useMemo(() => (kindFilter ? all.filter(kindFilter) : all), [all, kindFilter]);
  const [filter, setFilter] = useState<Filter>(() => (tasks.some((t) => t.status === "awaiting_approval") ? "persetujuan" : "aktif"));
  const [q, setQ] = useState("");
  const list = filterTasks(tasks, filter).filter((t) => !q || `${t.title} ${t.code} ${t.description}`.toLowerCase().includes(q.toLowerCase()));
  const count = (f: Filter) => filterTasks(tasks, f).length;
  const base = kindFilter ? "kreatif" : "tugas";

  return (
    <PageShell>
      {title && <p className="mb-3 text-sm text-muted">{title}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tugas…" />
        </div>
        <Button variant="primary" onClick={() => setCommandOpen(true)}><Plus className="h-4 w-4" /> Baru</Button>
      </div>
      <div className="mt-3">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: "aktif", label: "Aktif", count: count("aktif") },
          { value: "persetujuan", label: "Persetujuan", count: count("persetujuan") },
          { value: "selesai", label: "Selesai", count: count("selesai") },
          { value: "masalah", label: "Gagal/terblokir", count: count("masalah") },
          { value: "semua", label: "Semua", count: tasks.length },
        ]} />
      </div>
      <div className="mt-3 space-y-2">
        {!list.length && <Empty icon={<ClipboardList className="h-6 w-6" />} title="Tidak ada tugas di sini" text="Beri perintah ke AURELIA-01 atau tugaskan langsung ke karyawan." />}
        {list.map((t) => {
          const e = employees.find((x) => x.id === t.employee_id);
          return (
            <Card key={t.id} as="button" onClick={() => navigate(`${base}/${t.id}`)} className="w-full p-3.5">
              <div className="flex items-start gap-3">
                {e && <Avatar appearance={e.appearance} status={e.status} size={38} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-extrabold leading-snug">{t.title}</span>
                    <Badge tone={taskTone(t.status)}>{TASK_STATUS_LABEL[t.status]}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="font-bold">{t.code}</span>·<span>{e?.name}</span>·<span>{KIND_LABEL[t.kind]}</span>
                    <Badge tone={priorityTone(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
                    {t.use_web_search && <Globe className="h-3.5 w-3.5" />}
                    {t.requires_approval && <ShieldAlert className="h-3.5 w-3.5 text-warn" />}
                  </div>
                  {t.status === "running" && <div className="mt-2"><ProgressBar value={t.progress} /></div>}
                  {t.result_summary && t.status === "completed" && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{t.result_summary}</p>}
                  {t.last_error && ["failed", "blocked", "queued"].includes(t.status) && <p className="mt-1.5 line-clamp-2 text-xs font-bold text-bad">{t.last_error}</p>}
                  <div className="mt-1 text-[11px] text-muted">{timeAgo(t.updated_at)}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <TaskDetail taskId={id ?? null} onClose={() => navigate(base)} />
    </PageShell>
  );
}
