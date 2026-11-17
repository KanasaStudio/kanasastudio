import { Coffee, Cookie, Hand, KeyRound, MessageCircle, Plus, Smile, TrendingUp, Zap } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { rpc } from "../lib/api";
import { navigate } from "../lib/router";
import { useLocalPref, useTheme } from "../lib/theme";
import { buildContext } from "../office/bubbles";
import Office2D from "../office/Office2D";
import { webglAvailable } from "../office/webgl";
import { useStore } from "../store/useStore";

const Office3D = lazy(() => import("../office/Office3D"));

export default function OfficePage() {
  const employees = useStore((s) => s.employees);
  const departments = useStore((s) => s.departments);
  const tasks = useStore((s) => s.tasks);
  const approvals = useStore((s) => s.approvals);
  const providers = useStore((s) => s.providers);
  const dashboard = useStore((s) => s.dashboard);
  const settings = useStore((s) => s.settings);
  const selectedId = useStore((s) => s.selectedEmployeeId);
  const select = useStore((s) => s.selectEmployee);
  const openChat = useStore((s) => s.openChat);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const fxState = useStore((s) => s.officeFx);
  const fx = useStore((s) => s.fx);
  const toast = useStore((s) => s.toast);
  const { dark } = useTheme();
  const [mode2d, setMode2d] = useLocalPref<boolean>("kanasa-office-2d", !webglAvailable());
  const [quality] = useLocalPref<"high" | "low">("kanasa-quality", window.innerWidth < 768 ? "low" : "high");
  const [slowHint, setSlowHint] = useState(false);

  const connected = providers.filter((p) => p.status === "connected" && p.enabled && p.default_model).length;
  const pending = approvals.filter((a) => a.status === "pending").length;
  const ctx = useMemo(() => buildContext(employees, tasks, pending, connected), [employees, tasks, pending, connected]);
  const bars = useMemo(() => departments.map((d) => tasks.filter((t) => t.department_id === d.id && t.status === "completed").length), [departments, tasks]);

  // Produktivitas = tugas selesai hari ini dibanding semua tugas yang tersentuh hari ini (data nyata).
  const t = dashboard?.tasks;
  const doneToday = t?.completed_today ?? 0;
  const touched = doneToday + (t?.failed_today ?? 0) + (t?.active ?? 0);
  const productivity = touched ? Math.round((doneToday / touched) * 100) : null;
  const working = dashboard?.employees.working ?? 0;
  const mood = settings?.emergency_stop
    ? { label: "Emergency stop aktif", face: "😶", tone: "bad" }
    : !connected ? { label: "Menunggu API terhubung", face: "🙂", tone: "muted" }
    : (dashboard?.employees.failed ?? 0) > 0 || (t?.failed_today ?? 0) > 0 ? { label: "Ada kendala, perlu dicek", face: "😟", tone: "warn" }
    : working > 0 ? { label: "Seru & produktif!", face: "😄", tone: "ok" }
    : (dashboard?.employees.resting ?? 0) > 0 ? { label: "Lagi santai sejenak", face: "😌", tone: "info" }
    : { label: "Tenang, siap tugas baru", face: "🙂", tone: "ok" };

  const takeBreak = async () => {
    try {
      const n = await rpc<number>("ai_office_break", { p_minutes: 15 });
      toast(n ? `${n} karyawan ke ruang santai selama 15 menit` : "Semua karyawan sedang sibuk bekerja", n ? "ok" : "info");
    } catch (e) { toast((e as Error).message, "bad"); }
  };

  const actions = [
    { icon: Hand, label: "Sapa Tim", onClick: () => fx("poke") },
    { icon: MessageCircle, label: "Ajak Ngobrol", onClick: () => openChat("group") },
    { icon: Cookie, label: "Kasih Camilan", onClick: () => fx("snack") },
    { icon: Plus, label: "Tugas Baru", onClick: () => setCommandOpen(true), primary: true },
    { icon: Coffee, label: "Istirahat Bareng", onClick: takeBreak },
  ];

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden md:pl-[92px]">
      <div className="absolute inset-0 md:left-[92px]">
        {mode2d ? (
          <Office2D employees={employees} departments={departments} ctx={ctx} onSelect={select} />
        ) : (
          <Suspense fallback={<div className="grid h-full place-items-center text-sm font-bold text-muted">Menyiapkan kantor 3D…</div>}>
            <Office3D
              employees={employees}
              ctx={ctx}
              dark={dark}
              quality={quality}
              selectedId={selectedId}
              onSelect={select}
              fx={fxState}
              bars={bars}
              onSlow={() => setSlowHint(true)}
            />
          </Suspense>
        )}
      </div>

      {/* Peringatan & mode tampilan */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-20 flex flex-col items-center gap-2 px-4 md:left-[92px]">
        {!connected && (
          <button onClick={() => navigate("api")} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-accent/50 bg-surface/95 px-4 py-3 text-left shadow-card backdrop-blur">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-white"><KeyRound className="h-5 w-5" /></span>
            <span className="text-sm"><b>Tim belum bisa bekerja.</b> Hubungkan API Gemini, Claude, atau OpenAI agar karyawan AI mulai bekerja otomatis.</span>
          </button>
        )}
        {slowHint && !mode2d && (
          <button onClick={() => { setMode2d(true); setSlowHint(false); }} className="pointer-events-auto rounded-2xl border border-line bg-surface/95 px-4 py-2.5 text-sm font-bold shadow-card">
            Kantor 3D terasa berat? <span className="text-accent-text underline">Beralih ke mode 2D</span>
          </button>
        )}
      </div>
      <button
        onClick={() => setMode2d(!mode2d)}
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+66px)] z-20 hidden rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-extrabold shadow-card md:block"
      >
        {mode2d ? "Mode 3D" : "Mode 2D"}
      </button>

      {/* Aksi & kartu bawah (seperti referensi) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-20 px-3 md:bottom-4 md:left-[92px] md:px-6">
        <div className="pointer-events-auto mx-auto max-w-3xl">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2.5">
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className={`flex h-[70px] min-w-[74px] flex-1 flex-col items-center justify-center gap-1.5 rounded-3xl border px-2 text-[11px] font-extrabold shadow-card transition active:scale-95 ${a.primary ? "border-accent bg-accent text-white" : "border-line bg-surface/95 backdrop-blur"}`}
              >
                <a.icon className="h-6 w-6" strokeWidth={2.2} />
                <span className="whitespace-nowrap">{a.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => navigate("dashboard")} className="rounded-3xl border border-line bg-surface/95 p-3.5 text-left shadow-card backdrop-blur">
              <div className="flex items-center gap-2 text-[13px] font-extrabold"><span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-white"><TrendingUp className="h-3.5 w-3.5" /></span> Produktivitas Tim</div>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="text-2xl font-black">{productivity === null ? "—" : `${productivity}%`}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
                  <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${productivity ?? 0}%` }} />
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted">{touched ? `${doneToday} dari ${touched} tugas hari ini selesai` : "Belum ada tugas hari ini"}</div>
            </button>
            <button onClick={() => navigate("karyawan")} className="flex items-center gap-3 rounded-3xl border border-line bg-surface/95 p-3.5 text-left shadow-card backdrop-blur">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-2xl">{mood.face}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[13px] font-extrabold"><Smile className="h-3.5 w-3.5" /> Mood Kantor</span>
                <span className="block text-sm font-bold leading-tight">{mood.label}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted"><Zap className="h-3 w-3" />{working} bekerja · {dashboard?.employees.resting ?? 0} istirahat</span>
              </span>
            </button>
          </div>
          <button onClick={() => setMode2d(!mode2d)} className="mt-2 w-full text-center text-[11px] font-bold text-muted md:hidden">
            {mode2d ? "Tampilkan kantor 3D" : "Ganti ke tampilan 2D ringan"}
          </button>
        </div>
      </div>
    </div>
  );
}
