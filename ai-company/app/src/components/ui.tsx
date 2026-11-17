import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { ReactNode, useEffect } from "react";
import type { Tone } from "../lib/format";

const toneCls: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-text",
  muted: "bg-surface-2 text-muted border border-line",
};

export function Badge({ tone = "muted", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 whitespace-nowrap ${toneCls[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "", onClick, as = "div" }: { children: ReactNode; className?: string; onClick?: () => void; as?: "div" | "button" }) {
  const Cmp = as as any;
  return (
    <Cmp
      onClick={onClick}
      className={`rounded-3xl border border-line bg-surface shadow-card ${onClick ? "text-left transition active:scale-[0.99] hover:border-accent/40" : ""} ${className}`}
    >
      {children}
    </Cmp>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "ink";
const btnCls: Record<BtnVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong shadow-[0_6px_16px_-6px_rgb(247_147_30/0.7)]",
  secondary: "bg-surface text-text border border-line hover:border-accent/50",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-bad text-white hover:opacity-90",
  ink: "bg-ink text-ink-text hover:opacity-90",
};

export function Button({
  children, onClick, variant = "secondary", disabled, loading, className = "", type = "button", size = "md", title,
}: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant; disabled?: boolean; loading?: boolean; className?: string;
  type?: "button" | "submit"; size?: "sm" | "md" | "lg"; title?: string;
}) {
  const sz = size === "sm" ? "h-9 px-3 text-sm" : size === "lg" ? "h-13 px-5 text-base" : "h-11 px-4 text-sm";
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 ${sz} ${btnCls[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ children, onClick, label, className = "", badge }: { children: ReactNode; onClick?: () => void; label: string; className?: string; badge?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`relative grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-text shadow-card transition active:scale-95 ${className}`}
    >
      {children}
      {badge && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface" />}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 className="h-5 w-5 animate-spin text-accent" /> {label ?? "Memuat…"}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <div className="font-extrabold">{title}</div>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 py-2 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
      </button>
    </label>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-[15px] text-text placeholder:text-muted/70 outline-none transition focus:border-accent focus:bg-surface";

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "ok" | "bad" }) {
  const c = tone === "ok" ? "bg-ok" : tone === "bad" ? "bg-bad" : "bg-accent";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
      <div className={`h-full rounded-full ${c} transition-all duration-500`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between gap-2 px-1">
      <h2 className="text-[15px] font-extrabold">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "accent" | "ok" | "bad" | "info" }) {
  const c = tone === "ok" ? "text-ok bg-ok-soft" : tone === "bad" ? "text-bad bg-bad-soft" : tone === "info" ? "text-info bg-info-soft" : "text-accent bg-accent-soft";
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2">
        {icon && <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${c}`}>{icon}</span>}
        <span className="text-xs font-bold text-muted">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

// Bottom sheet di HP, dialog di layar lebar.
export function Sheet({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-line bg-surface shadow-2xl md:rounded-[28px] ${wide ? "md:max-w-3xl" : "md:max-w-lg"}`}
            initial={{ y: 60, opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
          >
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line md:hidden" />
            {title !== undefined && (
              <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
                <div className="min-w-0 text-lg font-black">{title}</div>
                <button aria-label="Tutup" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="pb-safe border-t border-line bg-surface px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition ${value === o.value ? "bg-ink text-ink-text dark:bg-accent dark:text-white" : "border border-line bg-surface text-muted"}`}
        >
          {o.label}
          {o.count !== undefined && <span className={`rounded-full px-1.5 text-[11px] ${value === o.value ? "bg-white/20" : "bg-surface-2"}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
