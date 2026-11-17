import { AlertOctagon, AlertTriangle, Bell, BellRing, CheckCheck, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "../components/Layout";
import { Badge, Button, Card, Empty, Segmented } from "../components/ui";
import { callAI, rpc } from "../lib/api";
import { timeAgo } from "../lib/format";
import { currentSubscription, enablePush, pushSupported } from "../lib/push";
import { navigate } from "../lib/router";
import { supabase } from "../lib/supabase";
import type { Notification } from "../lib/types";
import { useStore } from "../store/useStore";

export function PushCard() {
  const toast = useStore((s) => s.toast);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSubscription().then((s) => setSubscribed(!!s)).catch(() => setSubscribed(false)); }, []);
  const enable = async () => {
    setBusy(true);
    try { await enablePush(); setSubscribed(true); toast("Notifikasi push aktif di perangkat ini", "ok"); }
    catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const r = await callAI<{ sent: number }>("push_test"); toast(r.sent ? `Notifikasi tes dikirim ke ${r.sent} perangkat` : "Belum ada perangkat terdaftar", r.sent ? "ok" : "bad"); }
    catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-extrabold">Notifikasi push di HP</div>
          <p className="text-muted">
            {!pushSupported() ? "Browser ini belum mendukung Web Push. Di Android, buka lewat Chrome lalu pasang aplikasinya (Tambahkan ke layar utama)."
              : subscribed ? "Aktif di perangkat ini. Notifikasi tetap masuk walau aplikasi ditutup (selama izin notifikasi tidak dicabut)."
              : `Aktifkan agar peringatan kritis & keputusan penting masuk walau aplikasi ditutup.${standalone ? "" : " Disarankan pasang aplikasi dulu."}`}
          </p>
        </div>
      </div>
      {pushSupported() && (
        <div className="mt-3 flex gap-2">
          {!subscribed && <Button variant="primary" className="flex-1" loading={busy} onClick={enable}>Aktifkan push</Button>}
          {subscribed && <Button className="flex-1" loading={busy} onClick={test}>Kirim notifikasi tes</Button>}
        </div>
      )}
    </Card>
  );
}

const ICON = { critical: AlertOctagon, high: AlertTriangle, normal: Info } as const;

export default function NotificationsPage() {
  const list = useStore((s) => s.notifications);
  const toast = useStore((s) => s.toast);
  const [filter, setFilter] = useState<"unread" | "critical" | "high" | "all">("unread");
  const shown = list.filter((n) => filter === "all" ? true : filter === "unread" ? !n.read_at : n.priority === filter);
  const open = async (n: Notification) => {
    if (!n.read_at) await supabase.from("ai_notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    if (n.link) navigate(n.link.replace(/^#\//, ""));
  };
  const readAll = async () => {
    try { await rpc("ai_mark_all_read"); useStore.setState((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) })); }
    catch (e) { toast((e as Error).message, "bad"); }
  };
  return (
    <PageShell>
      <PushCard />
      <div className="mt-4 flex items-center justify-between gap-2">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: "unread", label: "Belum dibaca", count: list.filter((n) => !n.read_at).length },
          { value: "critical", label: "Kritis" }, { value: "high", label: "Tinggi" }, { value: "all", label: "Semua" },
        ]} />
        <Button size="sm" variant="ghost" onClick={readAll}><CheckCheck className="h-4 w-4" /></Button>
      </div>
      <div className="mt-3 space-y-2">
        {!shown.length && <Empty icon={<Bell className="h-6 w-6" />} title="Tidak ada notifikasi" text="Peringatan yang sama tidak dikirim berulang; jumlah kejadian dihitung dan dieskalasi bila terus terjadi." />}
        {shown.map((n) => {
          const Icon = ICON[n.priority];
          return (
            <Card key={n.id} as="button" onClick={() => open(n)} className={`flex w-full items-start gap-3 p-3.5 ${n.read_at ? "opacity-70" : ""}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${n.priority === "critical" ? "bg-bad-soft text-bad" : n.priority === "high" ? "bg-warn-soft text-warn" : "bg-info-soft text-info"}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-extrabold leading-snug">{n.title}</span>
                  {!n.read_at && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}
                </span>
                <span className="block text-sm text-muted">{n.body}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                  <Badge tone={n.priority === "critical" ? "bad" : n.priority === "high" ? "warn" : "info"}>{n.priority === "critical" ? "KRITIS" : n.priority === "high" ? "TINGGI" : "NORMAL"}</Badge>
                  {n.occurrences > 1 && <Badge>{n.occurrences}× terjadi</Badge>}
                  {timeAgo(n.created_at)}
                </span>
              </span>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
