import {
  Bell, Bot, BrainCircuit, Building2, ClipboardCheck, Home, KeyRound, LayoutDashboard, LayoutGrid, Moon, Palette, Radar,
  Settings, Sun, Users, Wallet,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ReactNode, useState } from "react";
import logo from "../assets/logo-white.png";
import { navigate } from "../lib/router";
import { useTheme } from "../lib/theme";
import { useStore } from "../store/useStore";
import { Sheet } from "./ui";

export const NAV = [
  { id: "kantor", label: "Kantor Virtual", short: "Kantor", icon: Home },
  { id: "dashboard", label: "Dashboard Founder", short: "Dashboard", icon: LayoutDashboard },
  { id: "ceo", label: "AI CEO", short: "CEO", icon: Bot },
  { id: "karyawan", label: "Karyawan", short: "Tim", icon: Users },
  { id: "departemen", label: "Departemen", short: "Departemen", icon: Building2 },
  { id: "tugas", label: "Pusat Tugas", short: "Tugas", icon: ClipboardCheck },
  { id: "intel", label: "Intel Pasar", short: "Intel", icon: Radar },
  { id: "kreatif", label: "Proyek Kreatif", short: "Kreatif", icon: Palette },
  { id: "keuangan", label: "Keuangan", short: "Keuangan", icon: Wallet },
  { id: "memori", label: "Memori Perusahaan", short: "Memori", icon: BrainCircuit },
  { id: "notifikasi", label: "Notifikasi", short: "Notifikasi", icon: Bell },
  { id: "api", label: "API & Integrasi", short: "API", icon: KeyRound },
  { id: "pengaturan", label: "Pengaturan", short: "Pengaturan", icon: Settings },
] as const;

const BOTTOM = ["kantor", "dashboard", "tugas", "karyawan"];

export function LogoChip({ compact }: { compact?: boolean }) {
  return (
    <button onClick={() => navigate("kantor")} className="flex items-center gap-2.5 rounded-2xl bg-ink py-1.5 pl-1.5 pr-3.5 text-ink-text shadow-card">
      <img src={logo} alt="" className="h-9 w-9" />
      {!compact && (
        <span className="text-left text-[15px] font-black leading-[1.05]">
          Kanasa
          <br />
          Studio
        </span>
      )}
    </button>
  );
}

export function TopBar({ page, floating }: { page: string; floating?: boolean }) {
  const unread = useStore((s) => s.notifications.filter((n) => !n.read_at).length);
  const { dark, toggle } = useTheme();
  const nav = NAV.find((n) => n.id === page);
  return (
    <header className={`pt-safe z-30 ${floating ? "pointer-events-none absolute inset-x-0 top-0" : "sticky top-0 border-b border-line bg-bg/85 backdrop-blur-md"}`}>
      <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="md:hidden"><LogoChip compact={!floating} /></span>
          {!floating && <h1 className="truncate text-lg font-black md:text-xl"><span className="md:hidden">{nav?.short}</span><span className="hidden md:inline">{nav?.label}</span></h1>}
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label={dark ? "Mode terang" : "Mode gelap"}
            title={dark ? "Mode terang" : "Mode gelap"}
            onClick={toggle}
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-text shadow-card transition active:scale-95"
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button aria-label="Notifikasi" onClick={() => navigate("notifikasi")} className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-text shadow-card transition active:scale-95">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-black text-white ring-2 ring-bg">{unread > 99 ? "99+" : unread}</span>}
          </button>
          <button aria-label="Pengaturan" onClick={() => navigate("pengaturan")} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-text shadow-card transition active:scale-95">
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

export function SideRail({ page }: { page: string }) {
  const pending = useStore((s) => s.approvals.filter((a) => a.status === "pending").length);
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[92px] flex-col items-center gap-3 py-4 md:flex">
      <LogoChip compact />
      <nav className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto rounded-[28px] border border-line bg-surface px-2 py-3 shadow-card">
        {NAV.map((n) => {
          const active = page === n.id;
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              title={n.label}
              aria-label={n.label}
              onClick={() => navigate(n.id)}
              className={`group relative flex w-[64px] flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-extrabold transition ${active ? "bg-accent text-white shadow-[0_6px_16px_-6px_rgb(247_147_30/0.8)]" : "text-muted hover:bg-surface-2 hover:text-text"}`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate px-1">{n.short}</span>
              {n.id === "tugas" && pending > 0 && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-bad" />}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function BottomNav({ page }: { page: string }) {
  const [more, setMore] = useState(false);
  const pending = useStore((s) => s.approvals.filter((a) => a.status === "pending").length);
  const inMore = !BOTTOM.includes(page);
  return (
    <>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5">
          {NAV.filter((n) => BOTTOM.includes(n.id)).map((n) => {
            const active = page === n.id;
            const Icon = n.icon;
            return (
              <button key={n.id} onClick={() => navigate(n.id)} className="relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-extrabold">
                <span className={`grid h-9 w-12 place-items-center rounded-2xl transition ${active ? "bg-accent text-white" : "text-muted"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className={active ? "text-text" : "text-muted"}>{n.short}</span>
                {n.id === "tugas" && pending > 0 && <span className="absolute right-4 top-1 h-2.5 w-2.5 rounded-full bg-bad ring-2 ring-surface" />}
              </button>
            );
          })}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-extrabold">
            <span className={`grid h-9 w-12 place-items-center rounded-2xl ${inMore ? "bg-accent text-white" : "text-muted"}`}>
              <LayoutGrid className="h-5 w-5" />
            </span>
            <span className={inMore ? "text-text" : "text-muted"}>Lainnya</span>
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Menu">
        <div className="grid grid-cols-3 gap-2.5 pb-2">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = page === n.id;
            return (
              <button
                key={n.id}
                onClick={() => { setMore(false); navigate(n.id); }}
                className={`flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-3xl border p-2 text-center text-xs font-extrabold transition active:scale-95 ${active ? "border-accent bg-accent-soft text-accent-text" : "border-line bg-surface-2"}`}
              >
                <Icon className="h-6 w-6" />
                {n.label}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0px)] z-[60] flex flex-col items-center gap-2 p-3">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`pointer-events-auto max-w-sm rounded-2xl px-4 py-2.5 text-sm font-bold shadow-xl ${t.tone === "bad" ? "bg-bad text-white" : t.tone === "ok" ? "bg-ok text-white" : "bg-ink text-ink-text"}`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-3 md:pb-12">{children}</main>;
}
