import { Download, LogOut, Monitor, Moon, Plus, Smartphone, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "../components/Layout";
import { Button, Card, Field, inputCls, SectionTitle, Segmented, Toggle } from "../components/ui";
import { dateTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useLocalPref, useTheme } from "../lib/theme";
import type { Settings } from "../lib/types";
import { useStore } from "../store/useStore";
import { PushCard } from "./NotificationsPage";

const ACTIONS: Record<string, string> = {
  briefing: "Briefing", research: "Riset pasar", trends: "Analisis tren", assign: "Penugasan", production: "Produksi", break: "Istirahat",
  execution: "Eksekusi", finance: "Keuangan", qa: "QA", exec_report: "Laporan eksekutif", founder_summary: "Ringkasan Founder",
};

let deferredPrompt: any = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const signOut = useStore((s) => s.signOut);
  const session = useStore((s) => s.session);
  const toast = useStore((s) => s.toast);
  const { pref, setPref } = useTheme();
  const [mode2d, setMode2d] = useLocalPref<boolean>("kanasa-office-2d", false);
  const [quality, setQuality] = useLocalPref<"high" | "low">("kanasa-quality", window.innerWidth < 768 ? "low" : "high");
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [schedule, setSchedule] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [canInstall, setCanInstall] = useState(!!deferredPrompt);

  useEffect(() => {
    supabase.from("ai_schedule").select("*").order("time_local").then(({ data }) => setSchedule(data ?? []));
    supabase.from("ai_activity_logs").select("*").order("created_at", { ascending: false }).limit(40).then(({ data }) => setLogs(data ?? []));
    const on = () => setCanInstall(true);
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (!settings) return null;
  const v = <K extends keyof Settings>(k: K): Settings[K] => (draft[k] ?? settings[k]) as Settings[K];
  const dirty = Object.keys(draft).length > 0;
  const saveDraft = async () => { try { await setSettings(draft); setDraft({}); toast("Pengaturan disimpan", "ok"); } catch { /* toast di store */ } };

  const updateSlot = async (id: number, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("ai_schedule").update(patch).eq("id", id);
    if (error) return toast(error.message, "bad");
    setSchedule((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)).sort((a, b) => String(a.time_local).localeCompare(String(b.time_local))));
  };
  const addSlot = async () => {
    const { data, error } = await supabase.from("ai_schedule").insert({ time_local: "14:00", title: "Riset tambahan", action: "research" }).select("*").single();
    if (error) return toast(error.message, "bad");
    setSchedule((s) => [...s, data].sort((a, b) => String(a.time_local).localeCompare(String(b.time_local))));
  };
  const delSlot = async (id: number) => {
    const { error } = await supabase.from("ai_schedule").delete().eq("id", id);
    if (error) return toast(error.message, "bad");
    setSchedule((s) => s.filter((x) => x.id !== id));
  };
  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
  };

  return (
    <PageShell>
      <SectionTitle>Tampilan</SectionTitle>
      <Card className="space-y-3 p-4">
        <Segmented value={pref} onChange={setPref} options={[
          { value: "light", label: <span className="flex items-center gap-1.5"><Sun className="h-4 w-4" /> Terang</span> },
          { value: "dark", label: <span className="flex items-center gap-1.5"><Moon className="h-4 w-4" /> Gelap</span> },
          { value: "system", label: <span className="flex items-center gap-1.5"><Monitor className="h-4 w-4" /> Ikuti sistem</span> },
        ]} />
        <Toggle label="Kantor mode 2D" hint="Tampilan ringan tanpa 3D untuk HP yang kurang kuat." checked={mode2d} onChange={setMode2d} />
        <Toggle label="Grafis 3D kualitas tinggi" hint="Bayangan & anti-aliasing. Matikan untuk hemat baterai." checked={quality === "high"} onChange={(x) => setQuality(x ? "high" : "low")} />
      </Card>

      <SectionTitle>Pasang aplikasi</SectionTitle>
      <Card className="space-y-3 p-4 text-sm">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p className="text-muted">Di Android: buka aplikasi ini di Chrome → menu ⋮ → <b>Tambahkan ke layar utama / Instal aplikasi</b>. Aplikasi terpasang bisa menerima notifikasi push walau ditutup.</p>
        </div>
        {canInstall && <Button variant="primary" className="w-full" onClick={install}><Download className="h-4 w-4" /> Instal sekarang</Button>}
        <a className="block text-center text-xs font-bold text-accent-text underline" href="https://github.com/KanasaStudio/kanasastudio/releases/tag/ai-android-latest" target="_blank" rel="noreferrer">File APK Android (dibangun otomatis oleh GitHub Actions)</a>
      </Card>

      <SectionTitle>Notifikasi</SectionTitle>
      <PushCard />
      <Card className="mt-2.5 px-4 py-2">
        <Toggle label="Push untuk KRITIS" hint="Anggaran habis, insiden keamanan, tugas kritis gagal" checked={settings.push_critical} onChange={(x) => setSettings({ push_critical: x })} />
        <Toggle label="Push untuk TINGGI" hint="Butuh keputusanmu, peluang mendesak, karyawan terblokir" checked={settings.push_high} onChange={(x) => setSettings({ push_high: x })} />
        <Toggle label="Push untuk NORMAL" hint="Tugas selesai, riset selesai, ringkasan harian" checked={settings.push_normal} onChange={(x) => setSettings({ push_normal: x })} />
      </Card>

      <SectionTitle action={dirty ? <Button size="sm" variant="primary" onClick={saveDraft}>Simpan</Button> : undefined}>Objektif & riset</SectionTitle>
      <Card className="space-y-3 p-4">
        <Field label="Objektif harian" hint="Direncanakan AURELIA-01 setiap pagi pukul 07:00 (kosongkan bila tidak ada).">
          <textarea className={`${inputCls} min-h-20`} value={v("daily_objective")} onChange={(e) => setDraft({ ...draft, daily_objective: e.target.value })} placeholder="Mis. Siapkan peluncuran paket aset 3D Roblox bulan depan." />
        </Field>
        <Field label="Topik riset (satu per baris)"><textarea className={`${inputCls} min-h-32`} value={v("research_topics").join("\n")} onChange={(e) => setDraft({ ...draft, research_topics: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wilayah (pisah koma)"><input className={inputCls} value={v("research_regions").join(", ")} onChange={(e) => setDraft({ ...draft, research_regions: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
          <Field label="Riset per hari"><input type="number" min={0} max={6} className={inputCls} value={v("research_per_day")} onChange={(e) => setDraft({ ...draft, research_per_day: Number(e.target.value) })} /></Field>
        </div>
        <p className="text-xs text-muted">Topik dirotasi: yang paling lama tidak diriset didahulukan, dan karyawan diberi daftar riset sebelumnya agar tidak mengulang temuan yang sama.</p>
      </Card>

      <SectionTitle action={dirty ? <Button size="sm" variant="primary" onClick={saveDraft}>Simpan</Button> : undefined}>Batas keamanan & anggaran</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Batas token harian"><input type="number" className={inputCls} value={v("global_daily_token_limit")} step={100000} onChange={(e) => setDraft({ ...draft, global_daily_token_limit: Number(e.target.value) })} /></Field>
          <Field label="Batas biaya harian (USD)"><input type="number" className={inputCls} value={v("global_daily_usd_limit")} step={0.5} onChange={(e) => setDraft({ ...draft, global_daily_usd_limit: Number(e.target.value) })} /></Field>
          <Field label="Tugas paralel (1–4)"><input type="number" min={1} max={4} className={inputCls} value={v("max_parallel_tasks")} onChange={(e) => setDraft({ ...draft, max_parallel_tasks: Number(e.target.value) })} /></Field>
          <Field label="Maks percobaan (1–5)"><input type="number" min={1} max={5} className={inputCls} value={v("max_task_attempts")} onChange={(e) => setDraft({ ...draft, max_task_attempts: Number(e.target.value) })} /></Field>
          <Field label="Maks revisi (0–3)"><input type="number" min={0} max={3} className={inputCls} value={v("max_revisions")} onChange={(e) => setDraft({ ...draft, max_revisions: Number(e.target.value) })} /></Field>
          <Field label="Maks tugas per perintah"><input type="number" min={1} max={12} className={inputCls} value={v("max_tasks_per_directive")} onChange={(e) => setDraft({ ...draft, max_tasks_per_directive: Number(e.target.value) })} /></Field>
          <Field label="Timeout tugas (menit)"><input type="number" min={2} max={30} className={inputCls} value={v("task_timeout_minutes")} onChange={(e) => setDraft({ ...draft, task_timeout_minutes: Number(e.target.value) })} /></Field>
          <Field label="Kurs USD→IDR"><input type="number" className={inputCls} value={v("usd_to_idr") ?? ""} placeholder="Opsional" onChange={(e) => setDraft({ ...draft, usd_to_idr: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
        </div>
        <p className="text-xs text-muted">Bila batas tercapai, tugas ditahan dengan status terblokir dan kamu mendapat notifikasi kritis. Tidak ada loop tanpa batas: setiap tugas dibatasi percobaan, revisi, dan timeout.</p>
      </Card>

      <SectionTitle action={<Button size="sm" onClick={addSlot}><Plus className="h-4 w-4" /> Slot</Button>}>Jadwal harian (WIB)</SectionTitle>
      <Card className="px-4 py-2">
        <Toggle label="Jalankan di akhir pekan" checked={settings.weekend_enabled} onChange={(x) => setSettings({ weekend_enabled: x })} />
        <Toggle label="Jeda semua jadwal" checked={settings.schedule_paused} onChange={(x) => setSettings({ schedule_paused: x })} />
        <Field label="Durasi istirahat siang (menit)">
          <input type="number" min={5} max={180} className={`${inputCls} mb-2`} value={v("rest_minutes")} onChange={(e) => setDraft({ ...draft, rest_minutes: Number(e.target.value) })} />
        </Field>
        <div className="divide-y divide-line">
          {schedule.map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-2.5">
              <input type="time" className={`${inputCls} !w-[104px] !px-2`} value={String(s.time_local).slice(0, 5)} onChange={(e) => updateSlot(s.id, { time_local: e.target.value })} />
              <div className="min-w-0 flex-1">
                <input className="w-full bg-transparent text-sm font-bold outline-none" value={s.title} onChange={(e) => setSchedule((x) => x.map((y) => (y.id === s.id ? { ...y, title: e.target.value } : y)))} onBlur={(e) => updateSlot(s.id, { title: e.target.value })} />
                <select className="bg-transparent text-xs text-muted outline-none" value={s.action} onChange={(e) => updateSlot(s.id, { action: e.target.value })}>
                  {Object.entries(ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <button role="switch" aria-checked={s.enabled} onClick={() => updateSlot(s.id, { enabled: !s.enabled })} className={`relative h-6 w-10 shrink-0 rounded-full ${s.enabled ? "bg-accent" : "bg-line"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.enabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
              <button aria-label="Hapus slot" onClick={() => delSlot(s.id)} className="text-muted"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <p className="pb-2 text-xs text-muted">Jadwal dijalankan oleh server (pg_cron setiap menit), bukan oleh aplikasi di HP, jadi tetap berjalan saat aplikasi ditutup.</p>
      </Card>

      <SectionTitle>Log audit (immutable)</SectionTitle>
      <Card className="max-h-80 divide-y divide-line overflow-y-auto">
        {logs.map((l) => (
          <div key={l.id} className="px-4 py-2 text-xs">
            <div><b>{l.actor_name}</b> · {l.summary}</div>
            <div className="text-muted">{dateTime(l.created_at)} · {l.category}</div>
          </div>
        ))}
        {!logs.length && <div className="p-4 text-sm text-muted">Belum ada log.</div>}
      </Card>

      <SectionTitle>Akun</SectionTitle>
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0 text-sm"><div className="font-bold">Founder</div><div className="truncate text-muted">{session?.user.email}</div></div>
        <Button onClick={signOut}><LogOut className="h-4 w-4" /> Keluar</Button>
      </Card>
      <p className="mt-4 text-center text-xs text-muted">KANASA STUDIO — Autonomous AI Company · v1.0</p>
    </PageShell>
  );
}
