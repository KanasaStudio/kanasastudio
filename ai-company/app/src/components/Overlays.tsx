import { useShallow } from "zustand/react/shallow";
import {
  BarChart3, Check, ClipboardList, ExternalLink, FileText, Globe, Loader2, MessageCircle, Pause, Play, Plus, RotateCcw, Send,
  ShieldAlert, Sparkles, User, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { callAI, rpc } from "../lib/api";
import {
  dateTime, KIND_LABEL, PRIORITY_LABEL, priorityTone, STATUS_LABEL, statusTone, TASK_STATUS_LABEL, taskTone, timeAgo,
} from "../lib/format";
import { Markdown } from "../lib/markdown";
import { navigate } from "../lib/router";
import { supabase } from "../lib/supabase";
import type { Employee, Message, Priority, Task, TaskKind } from "../lib/types";
import { useDept, useEmployee, useStore } from "../store/useStore";
import { Avatar } from "./Avatar";
import { Badge, Button, Field, inputCls, ProgressBar, Segmented, Sheet } from "./ui";

// ---------------------------------------------------------------------------
// Panel interaksi karakter (muncul saat karakter di kantor diketuk)
// ---------------------------------------------------------------------------
export function EmployeePanel() {
  const id = useStore((s) => s.selectedEmployeeId);
  const select = useStore((s) => s.selectEmployee);
  const openChat = useStore((s) => s.openChat);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const toast = useStore((s) => s.toast);
  const emp = useEmployee(id);
  const dept = useDept(emp?.department_id);
  const current = useStore((s) => s.tasks.find((t) => t.id === emp?.current_task_id));
  const queued = useStore((s) => s.tasks.filter((t) => t.employee_id === id && t.status === "queued").length);
  const [assign, setAssign] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setAssign(false), [id]);
  if (!emp) return <Sheet open={false} onClose={() => select(null)}>{null}</Sheet>;

  const togglePause = async () => {
    setBusy(true);
    try {
      await rpc("ai_employee_pause", { p_employee: emp.id, p_paused: !emp.paused });
      toast(emp.paused ? `${emp.name} dilanjutkan` : `${emp.name} dijeda`, "ok");
    } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  const go = (to: string) => { select(null); navigate(to); };

  return (
    <Sheet open={!!id} onClose={() => select(null)} title={null}>
      <div className="flex items-start gap-3 pt-1">
        <Avatar appearance={emp.appearance} status={emp.status} size={64} />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-black leading-tight">{emp.name}</div>
          <div className="text-sm text-muted">{emp.role_title}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="accent">{emp.is_ceo ? "Eksekutif" : dept?.name ?? "-"}</Badge>
            <Badge tone={statusTone(emp.status)}>{STATUS_LABEL[emp.status]}</Badge>
          </div>
        </div>
        <button aria-label="Tutup" onClick={() => select(null)} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted"><X className="h-5 w-5" /></button>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
        <div className="text-[11px] font-black uppercase tracking-wide text-muted">Tugas saat ini</div>
        {current ? (
          <button onClick={() => go(`tugas/${current.id}`)} className="mt-1 block w-full text-left">
            <div className="font-extrabold">{current.title}</div>
            <div className="mt-2"><ProgressBar value={current.progress} /></div>
            <div className="mt-1 text-xs text-muted">{current.code} · mulai {timeAgo(current.started_at)}</div>
          </button>
        ) : (
          <div className="mt-1 text-sm text-muted">{emp.status_note ?? "Tidak ada tugas aktif."}{queued ? ` · ${queued} di antrean` : ""}</div>
        )}
      </div>

      {assign && !emp.is_ceo ? (
        <AssignForm employee={emp} onDone={() => setAssign(false)} />
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-2">
          <ActionTile icon={<MessageCircle />} label="Chat" onClick={() => openChat(emp.id)} primary />
          {emp.is_ceo ? (
            <ActionTile icon={<Sparkles />} label="Perintah" onClick={() => { select(null); setCommandOpen(true); }} />
          ) : (
            <ActionTile icon={<Plus />} label="Beri tugas" onClick={() => setAssign(true)} />
          )}
          <ActionTile icon={<ClipboardList />} label="Tugas" onClick={() => go(`karyawan/${emp.id}`)} />
          <ActionTile icon={emp.paused ? <Play /> : <Pause />} label={emp.paused ? "Lanjutkan" : "Jeda"} onClick={togglePause} loading={busy} />
          <ActionTile icon={<User />} label="Profil" onClick={() => go(`karyawan/${emp.id}`)} />
          <ActionTile icon={<BarChart3 />} label="Performa" onClick={() => go(`karyawan/${emp.id}`)} />
          <ActionTile icon={<FileText />} label="Laporan" onClick={() => go(emp.is_ceo ? "ceo" : `karyawan/${emp.id}`)} />
          {emp.is_ceo && <ActionTile icon={<MessageCircle />} label="Rapat" onClick={() => openChat("group")} />}
        </div>
      )}
    </Sheet>
  );
}

function ActionTile({ icon, label, onClick, primary, loading }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-3 text-[11px] font-extrabold transition active:scale-95 [&_svg]:h-5 [&_svg]:w-5 ${primary ? "border-accent bg-accent text-white" : "border-line bg-surface"}`}
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

const KINDS: TaskKind[] = ["research", "analysis", "writing", "code", "design", "marketing", "finance", "operations", "qa", "report"];

export function AssignForm({ employee, onDone, initial }: { employee: Employee; onDone: () => void; initial?: Partial<{ title: string; description: string; kind: TaskKind; priority: Priority; use_web_search: boolean }> }) {
  const toast = useStore((s) => s.toast);
  const canSearch = employee.tool_permissions.includes("web_search");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<TaskKind>(initial?.kind ?? (employee.department_id === "research" ? "research" : "analysis"));
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [web, setWeb] = useState(initial?.use_web_search ?? (canSearch && employee.department_id === "research"));
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return toast("Judul tugas minimal 3 karakter", "bad");
    setBusy(true);
    try {
      await rpc("ai_assign_task", {
        p_employee: employee.id, p_title: title.trim(), p_description: desc.trim(), p_kind: kind, p_priority: priority,
        p_web: web && canSearch, p_requires_approval: approval, p_due: null,
      });
      await callAI("run_now").catch(() => undefined);
      toast(`Tugas dikirim ke ${employee.name}`, "ok");
      onDone();
    } catch (err) { toast((err as Error).message, "bad"); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label="Judul tugas"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Analisis alat animasi AI terbaru" autoFocus /></Field>
      <Field label="Detail & hasil yang diharapkan"><textarea className={`${inputCls} min-h-24`} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Jelaskan konteks, batasan, dan format hasil." /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jenis">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Prioritas">
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(["critical", "high", "medium", "low"] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </Field>
      </div>
      <label className={`flex items-center gap-2 text-sm font-bold ${canSearch ? "" : "opacity-50"}`}>
        <input type="checkbox" checked={web && canSearch} disabled={!canSearch} onChange={(e) => setWeb(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        Boleh mencari di web {canSearch ? "" : "(karyawan ini tidak punya izin)"}
      </label>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        Hasilnya wajib saya setujui
      </label>
      <div className="flex gap-2 pt-1">
        <Button onClick={onDone} className="flex-1">Batal</Button>
        <Button type="submit" variant="primary" loading={busy} className="flex-[2]"><Send className="h-4 w-4" /> Kirim tugas</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Chat langsung & rapat grup
// ---------------------------------------------------------------------------
export function ChatSheet() {
  const target = useStore((s) => s.chatTarget);
  const openChat = useStore((s) => s.openChat);
  const employees = useStore((s) => s.employees);
  const toast = useStore((s) => s.toast);
  const emp = employees.find((e) => e.id === target);
  const thread = target === "group" ? "group" : target ? `dm:${target}` : null;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [proposalFor, setProposalFor] = useState<Message | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!thread) return;
    let alive = true;
    setLoading(true);
    supabase.from("ai_messages").select("*").eq("thread", thread).order("created_at", { ascending: false }).limit(60).then(({ data }) => {
      if (!alive) return;
      setMessages(((data ?? []) as Message[]).reverse());
      setLoading(false);
    });
    const ch = supabase.channel(`chat-${thread}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_messages", filter: `thread=eq.${thread}` }, (p) => {
        setMessages((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m, p.new as Message]));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [thread]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, sending]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || !target) return;
    setText("");
    setSending(true);
    try {
      if (target === "group") await callAI("group", { text: t });
      else await callAI("chat", { employeeId: target, text: t });
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally { setSending(false); }
  };

  const nameOf = (m: Message) => m.sender_kind === "founder" ? "Kamu" : m.sender_kind === "system" ? "Sistem" : employees.find((x) => x.id === m.sender_id)?.name ?? "AI";
  const title = target === "group" ? "Rapat bersama AURELIA-01" : emp?.name ?? "";
  const runDirective = async (objective: string, priority?: string) => {
    try {
      await callAI("command", { objective, priority: priority ?? "medium", source: "chat" });
      toast("Perintah dikirim ke AURELIA-01", "ok");
    } catch (err) { toast((err as Error).message, "bad"); }
  };

  return (
    <Sheet
      open={!!target}
      onClose={() => openChat(null)}
      title={
        <span className="flex items-center gap-2.5">
          {emp ? <Avatar appearance={emp.appearance} status={emp.status} size={36} /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent"><MessageCircle className="h-5 w-5" /></span>}
          <span className="min-w-0">
            <span className="block truncate text-base leading-tight">{title}</span>
            <span className="block text-xs font-bold text-muted">{target === "group" ? "AURELIA memilih anggota tim yang relevan" : emp ? STATUS_LABEL[emp.status] : ""}</span>
          </span>
        </span>
      }
      footer={
        <form onSubmit={send} className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder={target === "group" ? "Sampaikan sesuatu ke tim…" : `Tulis pesan ke ${emp?.name.split(" ")[0] ?? ""}…`}
            className={`${inputCls} max-h-32 min-h-11 resize-none`}
          />
          <Button type="submit" variant="primary" disabled={!text.trim()} loading={sending} className="h-11 w-11 shrink-0 !px-0" title="Kirim">
            {!sending && <Send className="h-4 w-4" />}
          </Button>
        </form>
      }
    >
      <div className="min-h-[45dvh] space-y-3 pt-2">
        {loading && <div className="py-8 text-center text-sm text-muted">Memuat percakapan…</div>}
        {!loading && !messages.length && (
          <div className="rounded-2xl bg-surface-2 p-4 text-center text-sm text-muted">
            Belum ada percakapan. Balasan dibuat oleh model AI yang terhubung, berdasarkan status dan riwayat kerja nyata karyawan.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_kind === "founder";
          const sender = employees.find((x) => x.id === m.sender_id);
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
              {!mine && sender && <Avatar appearance={sender.appearance} size={28} ring={false} />}
              <div className={`max-w-[82%] rounded-3xl px-3.5 py-2.5 text-sm ${mine ? "rounded-br-lg bg-accent text-white" : m.sender_kind === "system" ? "border border-bad/30 bg-bad-soft text-bad" : "rounded-bl-lg border border-line bg-surface-2"}`}>
                {!mine && <div className="mb-0.5 text-[11px] font-black text-accent-text">{nameOf(m)}{m.meta?.internal ? " · catatan internal" : ""}</div>}
                {mine ? <div className="whitespace-pre-wrap">{m.content}</div> : <Markdown text={m.content} className="!text-sm" />}
                {m.meta?.proposed_task && emp && !emp.is_ceo && (
                  <button onClick={() => setProposalFor(m)} className="mt-2 flex w-full items-center gap-2 rounded-2xl bg-accent-soft px-3 py-2 text-left text-xs font-extrabold text-accent-text">
                    <Plus className="h-4 w-4 shrink-0" /> Usulan tugas: {m.meta.proposed_task.title}
                  </button>
                )}
                {m.meta?.proposed_directive && (
                  <button onClick={() => runDirective(m.meta.proposed_directive.objective, m.meta.proposed_directive.priority)} className="mt-2 flex w-full items-center gap-2 rounded-2xl bg-accent-soft px-3 py-2 text-left text-xs font-extrabold text-accent-text">
                    <Sparkles className="h-4 w-4 shrink-0" /> Jalankan sebagai perintah: {m.meta.proposed_directive.objective}
                  </button>
                )}
                <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>{timeAgo(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin text-accent" /> {target === "group" ? "Tim sedang menanggapi…" : `${emp?.name.split(" ")[0]} sedang mengetik…`}</div>
        )}
        <div ref={endRef} />
      </div>
      {proposalFor && emp && (
        <Sheet open onClose={() => setProposalFor(null)} title={`Tugas untuk ${emp.name}`}>
          <AssignForm employee={emp} initial={proposalFor.meta.proposed_task} onDone={() => setProposalFor(null)} />
        </Sheet>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Perintah Founder → AURELIA-01
// ---------------------------------------------------------------------------
const EXAMPLES = [
  "Riset peluang animasi AI paling menjanjikan di Indonesia.",
  "Temukan 5 peluang produk digital internasional yang bisa dimonetisasi Kanasa Studio.",
  "Siapkan analisis pasar untuk studio game indie.",
  "Hitung pengeluaran API aktual bulan ini.",
  "Minta Software Department membuat rencana website portofolio.",
];

export function CommandSheet() {
  const open = useStore((s) => s.commandOpen);
  const setOpen = useStore((s) => s.setCommandOpen);
  const providers = useStore((s) => s.providers.filter((p) => p.status === "connected" && p.enabled).length);
  const toast = useStore((s) => s.toast);
  const [objective, setObjective] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (objective.trim().length < 3) return;
    setBusy(true);
    try {
      await callAI("command", { objective: objective.trim(), priority });
      toast("AURELIA-01 sedang merencanakan tugas…", "ok");
      setObjective("");
      setOpen(false);
      navigate("ceo");
    } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Perintah untuk AURELIA-01"
      footer={<Button variant="primary" className="w-full" size="lg" loading={busy} disabled={objective.trim().length < 3} onClick={submit}><Sparkles className="h-5 w-5" /> Kirim ke AI CEO</Button>}>
      {!providers && (
        <div className="mb-3 rounded-2xl border border-warn/40 bg-warn-soft p-3 text-sm font-bold text-warn">
          Belum ada API AI terhubung. Perintah tetap tersimpan, tapi AURELIA baru bisa merencanakan setelah API dihubungkan.
          <button onClick={() => { setOpen(false); navigate("api"); }} className="mt-1 block underline">Hubungkan API sekarang</button>
        </div>
      )}
      <p className="mb-3 text-sm text-muted">Tulis objektif dengan bahasa biasa. AURELIA-01 akan menganalisis, memecahnya menjadi tugas, menugaskan karyawan yang tepat, lalu memantau hasilnya.</p>
      <textarea value={objective} onChange={(e) => setObjective(e.target.value)} className={`${inputCls} min-h-32`} placeholder="Contoh: Riset peluang animasi AI di Indonesia lalu siapkan konsep produk digital pertama kita." autoFocus />
      <div className="mt-3">
        <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">Prioritas</div>
        <Segmented value={priority} onChange={setPriority} options={(["low", "medium", "high", "critical"] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
      </div>
      <div className="mt-4 text-xs font-extrabold uppercase tracking-wide text-muted">Contoh</div>
      <div className="mt-2 flex flex-col gap-2">
        {EXAMPLES.map((x) => (
          <button key={x} onClick={() => setObjective(x)} className="rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-left text-sm font-semibold transition active:scale-[0.99]">{x}</button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Detail tugas (hasil, sumber, percobaan, persetujuan)
// ---------------------------------------------------------------------------
export function TaskDetail({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const fromStore = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const approvals = useStore(useShallow((s) => s.approvals.filter((a) => a.task_id === taskId)));
  const employees = useStore((s) => s.employees);
  const toast = useStore((s) => s.toast);
  const [task, setTask] = useState<Task | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [deps, setDeps] = useState<Task[]>([]);
  const [report, setReport] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    setTask(fromStore ?? null);
    (async () => {
      if (!fromStore) {
        const { data } = await supabase.from("ai_tasks").select("*").eq("id", taskId).maybeSingle();
        setTask(data as Task);
      }
      const [{ data: at }, { data: dp }, { data: rep }] = await Promise.all([
        supabase.from("ai_task_attempts").select("*").eq("task_id", taskId).order("started_at", { ascending: false }),
        supabase.from("ai_task_dependencies").select("depends_on").eq("task_id", taskId),
        supabase.from("ai_research_reports").select("*").eq("task_id", taskId).maybeSingle(),
      ]);
      setAttempts(at ?? []);
      setReport(rep);
      if (dp?.length) {
        const { data: dt } = await supabase.from("ai_tasks").select("*").in("id", dp.map((d: any) => d.depends_on));
        setDeps((dt ?? []) as Task[]);
      } else setDeps([]);
    })();
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (fromStore) setTask(fromStore); }, [fromStore]);

  const t = task;
  const emp = employees.find((e) => e.id === t?.employee_id);
  const pending = approvals.find((a) => a.status === "pending");

  const act = async (kind: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(kind);
    try { await fn(); toast(okMsg, "ok"); } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(null); }
  };

  return (
    <Sheet open={!!taskId} onClose={onClose} wide title={t ? <span className="text-base">{t.code}</span> : "Tugas"}>
      {!t ? <div className="py-10 text-center text-sm text-muted">Memuat…</div> : (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-black leading-snug">{t.title}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={taskTone(t.status)}>{TASK_STATUS_LABEL[t.status]}</Badge>
              <Badge tone={priorityTone(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
              <Badge>{KIND_LABEL[t.kind]}</Badge>
              {t.use_web_search && <Badge tone="info"><Globe className="h-3 w-3" /> Web</Badge>}
              {t.requires_approval && <Badge tone="warn"><ShieldAlert className="h-3 w-3" /> Persetujuan</Badge>}
              {t.revision_count > 0 && <Badge tone="accent">Revisi {t.revision_count}×</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            {emp && <Avatar appearance={emp.appearance} status={emp.status} size={40} />}
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-extrabold">{emp?.name}</div>
              <div className="text-xs text-muted">Dibuat {dateTime(t.created_at)} oleh {t.created_by === "founder" ? "Founder" : t.created_by === "schedule" ? "jadwal harian" : "AURELIA-01"}</div>
            </div>
            <div className="w-20"><ProgressBar value={t.progress} tone={t.status === "failed" ? "bad" : t.status === "completed" ? "ok" : "accent"} /></div>
          </div>
          {t.description && <div className="whitespace-pre-wrap text-sm text-muted">{t.description}</div>}

          {pending && (
            <div className="rounded-3xl border-2 border-warn/50 bg-warn-soft p-4">
              <div className="flex items-center gap-2 font-black text-warn"><ShieldAlert className="h-5 w-5" /> Butuh persetujuan Founder</div>
              <p className="mt-1 text-sm">{pending.reason}</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} mt-3 min-h-16`} placeholder="Catatan keputusan (opsional)" />
              <div className="mt-2 flex gap-2">
                <Button variant="danger" className="flex-1" loading={busy === "reject"} onClick={() => act("reject", () => rpc("ai_decide_approval", { p_id: pending.id, p_approve: false, p_note: note || null }), "Ditolak")}>
                  <X className="h-4 w-4" /> Tolak
                </Button>
                <Button variant="primary" className="flex-1" loading={busy === "approve"} onClick={() => act("approve", () => rpc("ai_decide_approval", { p_id: pending.id, p_approve: true, p_note: note || null }), "Disetujui")}>
                  <Check className="h-4 w-4" /> Setujui
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted">Menyetujui menandai draf sebagai disetujui. Aksi eksternal (publikasi, pengiriman, pembelian) tetap dijalankan manual karena belum ada tool eksternal yang terhubung.</p>
            </div>
          )}

          {t.last_error && t.status !== "completed" && (
            <div className="rounded-2xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad"><b>Error tercatat:</b> {t.last_error}</div>
          )}

          {deps.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-muted">Menunggu tugas</div>
              <div className="space-y-1.5">
                {deps.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
                    <span className="truncate font-bold">{d.code} · {d.title}</span>
                    <Badge tone={taskTone(d.status)}>{TASK_STATUS_LABEL[d.status]}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {t.result ? (
            <div className="rounded-3xl border border-line p-4">
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-muted">Hasil kerja</div>
              <Markdown text={t.result} />
            </div>
          ) : t.status === "running" ? (
            <div className="flex items-center gap-2 rounded-2xl bg-accent-soft p-3 text-sm font-bold text-accent-text"><Loader2 className="h-4 w-4 animate-spin" /> {emp?.name} sedang mengerjakan tugas ini…</div>
          ) : null}

          {report?.findings?.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-black uppercase tracking-wide text-muted">
                Temuan riset {report.verified_sources ? <Badge tone="ok">Sumber dari pencarian web</Badge> : <Badge tone="warn">Belum terverifikasi</Badge>}
              </div>
              <div className="space-y-2">
                {report.findings.map((f: any, i: number) => (
                  <div key={i} className="rounded-2xl border border-line p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-extrabold">{f.title}</div>
                      <Badge tone={f.confidence === "high" ? "ok" : f.confidence === "medium" ? "info" : "muted"}>{f.confidence === "high" ? "Yakin" : f.confidence === "medium" ? "Sedang" : "Rendah"}</Badge>
                    </div>
                    <p className="mt-1 text-muted">{f.summary}</p>
                    {f.business_relevance && <p className="mt-1"><b>Relevansi:</b> {f.business_relevance}</p>}
                    {f.opportunity && <p className="mt-1"><b>Peluang:</b> {f.opportunity}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {f.source_url && <a href={f.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-accent-text underline"><ExternalLink className="h-3 w-3" />{f.source_title || "Sumber"}</a>}
                      <span>Terbit: {f.published_date || "tidak diketahui"}</span>
                      <span>Diriset: {dateTime(f.research_date)}</span>
                      {!f.verified && <span className="text-warn">· domain tidak ada di hasil pencarian</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {t.sources?.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-muted">Sumber dari pencarian ({t.sources.length})</div>
              <div className="space-y-1">
                {t.sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" /><span className="truncate">{s.title || s.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {attempts.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-black uppercase tracking-wide text-muted">Riwayat eksekusi</div>
              <div className="space-y-1.5">
                {attempts.map((a) => (
                  <div key={a.id} className="rounded-2xl border border-line px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold">{a.step} · {a.provider ?? "-"} {a.model ?? ""}</span>
                      <Badge tone={a.status === "succeeded" ? "ok" : a.status === "running" ? "accent" : "bad"}>{a.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-muted">{dateTime(a.started_at)} · {a.input_tokens ?? 0}+{a.output_tokens ?? 0} token{a.cost_usd != null ? ` · $${Number(a.cost_usd).toFixed(4)}` : ""}</div>
                    {a.error && <div className="mt-0.5 text-bad">{a.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {["failed", "blocked", "cancelled"].includes(t.status) && (
              <Button className="flex-1" loading={busy === "retry"} onClick={() => act("retry", async () => { await rpc("ai_task_action", { p_task: t.id, p_action: "retry" }); await callAI("run_now").catch(() => undefined); }, "Tugas diantrekan ulang")}>
                <RotateCcw className="h-4 w-4" /> Ulangi
              </Button>
            )}
            {!["completed", "cancelled"].includes(t.status) && (
              <Button variant="ghost" className="flex-1 text-bad" loading={busy === "cancel"} onClick={() => act("cancel", () => rpc("ai_task_action", { p_task: t.id, p_action: "cancel" }), "Tugas dibatalkan")}>
                <X className="h-4 w-4" /> Batalkan
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function useTaskRoute(page: string, id?: string) {
  return useMemo(() => (page === "tugas" && id ? id : null), [page, id]);
}
