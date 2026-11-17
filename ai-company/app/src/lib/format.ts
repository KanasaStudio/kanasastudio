import type { EmployeeStatus, Priority, TaskKind, TaskStatus } from "./types";

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  idle: "Senggang", working: "Bekerja", researching: "Riset", thinking: "Berpikir", meeting: "Rapat",
  resting: "Istirahat", reviewing: "Mereview", completed: "Selesai", failed: "Ada kendala", paused: "Dijeda",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Antre", running: "Dikerjakan", awaiting_approval: "Butuh persetujuan", completed: "Selesai",
  failed: "Gagal", blocked: "Terblokir", cancelled: "Dibatalkan",
};

export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Kritis", high: "Tinggi", medium: "Sedang", low: "Rendah" };

export const KIND_LABEL: Record<TaskKind, string> = {
  research: "Riset", analysis: "Analisis", writing: "Penulisan", code: "Kode", design: "Desain", marketing: "Marketing",
  finance: "Keuangan", operations: "Operasional", qa: "QA", report: "Laporan",
};

export type Tone = "ok" | "warn" | "bad" | "info" | "accent" | "muted";

export const statusTone = (s: EmployeeStatus): Tone =>
  s === "failed" ? "bad" : s === "completed" ? "ok" : s === "paused" ? "muted" : s === "resting" ? "info" : s === "idle" ? "muted" : "accent";

export const taskTone = (s: TaskStatus): Tone =>
  s === "completed" ? "ok" : s === "failed" ? "bad" : s === "blocked" ? "warn" : s === "awaiting_approval" ? "warn" : s === "running" ? "accent" : s === "cancelled" ? "muted" : "info";

export const priorityTone = (p: Priority): Tone => (p === "critical" ? "bad" : p === "high" ? "warn" : p === "medium" ? "info" : "muted");

const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "-";
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "baru saja";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return dateShort(iso);
}

export const dateShort = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "-";

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)) + " WIB" : "-";

export const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
export const usd = (n: number, digits = 2) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) }).format(n || 0);
export const num = (n: number) => new Intl.NumberFormat("id-ID").format(n || 0);
export const compact = (n: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

export const PROVIDER_LABEL = { gemini: "Google Gemini", anthropic: "Anthropic Claude", openai: "OpenAI" } as const;
