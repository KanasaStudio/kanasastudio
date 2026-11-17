import type { Employee, Task } from "../lib/types";

export interface OfficeContext {
  tasksById: Map<string, Task>;
  lastDoneByEmployee: Map<string, Task>;
  queuedByEmployee: Map<string, number>;
  pendingApprovals: number;
  activeTasks: number;
  providersConnected: number;
}

const short = (s: string | null | undefined, n = 42) => (!s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s);

// Ikon kecil di atas kepala, berdasarkan status nyata.
export function bubbleIcon(e: Employee): string {
  if (e.is_ceo) return e.status === "thinking" || e.status === "reviewing" ? "…" : e.status === "meeting" ? "💬" : "✦";
  switch (e.status) {
    case "working": return e.appearance?.accessory?.includes("headphones") ? "♪" : "⌨";
    case "researching": return "🔍";
    case "thinking": return "…";
    case "reviewing": return "✓?";
    case "meeting": return "💬";
    case "resting": return "Zzz";
    case "completed": return "♥";
    case "failed": return "!";
    case "paused": return "⏸";
    default: return "✦";
  }
}

// Kalimat yang diucapkan karakter: hanya dari data nyata (status, tugas, persetujuan), bukan karangan.
export function bubbleText(e: Employee, ctx: OfficeContext): string {
  const current = e.current_task_id ? ctx.tasksById.get(e.current_task_id) : undefined;
  const lastDone = ctx.lastDoneByEmployee.get(e.id);
  const queued = ctx.queuedByEmployee.get(e.id) ?? 0;
  if (e.is_ceo) {
    if (!ctx.providersConnected) return "Founder, hubungkan API AI di menu API & Integrasi supaya tim bisa mulai bekerja.";
    if (ctx.pendingApprovals) return `Founder, ada ${ctx.pendingApprovals} keputusan yang menunggu persetujuanmu.`;
    if (e.status === "thinking") return `Sedang menyusun rencana${e.status_note ? `: ${short(e.status_note, 30)}` : ""}…`;
    if (e.status === "reviewing") return `Sedang mereview hasil kerja tim…`;
    if (ctx.activeTasks) return `Aku memantau ${ctx.activeTasks} tugas aktif tim.`;
    return "Tim siap. Ada objektif baru untuk kita, Founder?";
  }
  switch (e.status) {
    case "working": return `Sedang mengerjakan ${short(current?.title ?? e.status_note) || "tugas"}…`;
    case "researching": return `Lagi riset ${short(current?.category ?? current?.title ?? e.status_note, 34) || "pasar"}…`;
    case "thinking": return `Hmm, menganalisis ${short(current?.title ?? e.status_note, 34) || "data"}…`;
    case "reviewing": return "Sedang mereview…";
    case "meeting": return e.status_note === "Ngobrol dengan Founder" ? "Senang ngobrol denganmu, Founder!" : "Lagi rapat bareng tim…";
    case "resting": return "Istirahat sebentar sebelum tugas berikutnya!";
    case "completed":
      return lastDone ? `Founder, ${short(lastDone.title, 36)} sudah selesai. Mau direview?` : "Tugasku baru saja selesai!";
    case "failed": return `Ada kendala${e.status_note ? `: ${short(e.status_note.replace(/^Gagal: |^Terblokir: /, ""), 40)}` : ""}. Bisa dicek?`;
    case "paused": return "Aku sedang dijeda dulu ya.";
    default:
      if (e.status_note?.startsWith("Menunggu persetujuan")) return "Draf-ku menunggu persetujuanmu, Founder.";
      if (e.status_note?.startsWith("Revisi diminta")) return "AURELIA minta revisi, aku kerjakan sebentar lagi.";
      if (queued) return `Masih ada ${queued} tugas di antreanku.`;
      if (lastDone && lastDone.kind === "research" && Date.now() - Date.parse(lastDone.completed_at ?? lastDone.updated_at) < 86400_000)
        return `Aku menemukan hal menarik di riset: ${short(lastDone.title, 34)}!`;
      return !ctx.providersConnected ? "Aku menunggu API terhubung untuk mulai bekerja." : "Hai Founder! Tugasku sudah beres. Ada pekerjaan baru untukku?";
  }
}

export function buildContext(employees: Employee[], tasks: Task[], pendingApprovals: number, providersConnected: number): OfficeContext {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const lastDoneByEmployee = new Map<string, Task>();
  const queuedByEmployee = new Map<string, number>();
  let activeTasks = 0;
  for (const t of tasks) {
    if (t.status === "completed" && !lastDoneByEmployee.has(t.employee_id)) lastDoneByEmployee.set(t.employee_id, t);
    if (t.status === "queued") queuedByEmployee.set(t.employee_id, (queuedByEmployee.get(t.employee_id) ?? 0) + 1);
    if (t.status === "queued" || t.status === "running") activeTasks++;
  }
  void employees;
  return { tasksById, lastDoneByEmployee, queuedByEmployee, pendingApprovals, activeTasks, providersConnected };
}
