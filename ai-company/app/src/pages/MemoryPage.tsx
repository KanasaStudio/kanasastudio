import { BrainCircuit, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "../components/Layout";
import { Badge, Button, Card, Empty, Field, inputCls, Segmented, Sheet } from "../components/ui";
import { dateTime } from "../lib/format";
import { Markdown } from "../lib/markdown";
import { supabase } from "../lib/supabase";
import { useStore } from "../store/useStore";

const KIND_TXT: Record<string, string> = {
  directive: "Directive", report: "Laporan", decision: "Keputusan", lesson: "Pelajaran", strategy: "Strategi",
  conversation: "Percakapan", project: "Proyek", finance: "Keuangan", note: "Catatan", briefing: "Briefing",
};

export default function MemoryPage() {
  const departments = useStore((s) => s.departments);
  const employees = useStore((s) => s.employees);
  const toast = useStore((s) => s.toast);
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [open, setOpen] = useState<any | null>(null);
  const [form, setForm] = useState<{ title: string; content: string; kind: string; scope: string } | null>(null);

  const load = async () => {
    if (q.trim().length >= 3) {
      const scopes = scope === "all" ? ["company", ...departments.map((d) => d.id)] : [scope];
      const { data } = await supabase.rpc("ai_memory_search", { p_query: q, p_scopes: scopes, p_limit: 20 });
      setItems(data ?? []);
    } else {
      let qb = supabase.from("ai_memory").select("id,scope,kind,title,content,created_at,employee_id,task_id").order("created_at", { ascending: false }).limit(80);
      if (scope !== "all") qb = qb.eq("scope", scope);
      const { data } = await qb;
      setItems(data ?? []);
    }
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q, scope, departments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form || form.title.trim().length < 3 || form.content.trim().length < 3) return toast("Isi judul dan isi memori", "bad");
    const { error } = await supabase.from("ai_memory").insert({ ...form, created_by: "founder" });
    if (error) return toast(error.message, "bad");
    toast("Memori disimpan. Karyawan dengan akses cakupan ini bisa memakainya.", "ok");
    setForm(null);
    load();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("ai_memory").delete().eq("id", id);
    if (error) return toast(error.message, "bad");
    setOpen(null);
    setItems((x) => x?.filter((m) => m.id !== id) ?? null);
  };
  const scopeName = (s: string) => (s === "company" ? "Perusahaan" : departments.find((d) => d.id === s)?.short_name ?? s);

  return (
    <PageShell>
      <Card className="flex items-start gap-3 p-4 text-sm text-muted">
        <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        Memori perusahaan menyimpan directive, laporan, keputusan, dan pelajaran. Sebelum bekerja, karyawan mencari memori yang relevan (pencarian teks penuh) hanya dari cakupan yang diizinkan untuk perannya.
      </Card>
      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari memori (min. 3 huruf)…" />
        </div>
        <Button variant="primary" onClick={() => setForm({ title: "", content: "", kind: "note", scope: "company" })}><Plus className="h-4 w-4" /> Tambah</Button>
      </div>
      <div className="mt-3"><Segmented value={scope} onChange={setScope} options={[{ value: "all", label: "Semua" }, { value: "company", label: "Perusahaan" }, ...departments.map((d) => ({ value: d.id, label: d.short_name }))]} /></div>
      <div className="mt-3 space-y-2">
        {items === null ? <div className="h-32 animate-pulse rounded-3xl bg-surface" /> : !items.length ? (
          <Empty icon={<BrainCircuit className="h-6 w-6" />} title={q ? "Tidak ditemukan" : "Memori masih kosong"} text="Memori terisi otomatis saat tim menyelesaikan tugas, atau tambahkan catatanmu sendiri." />
        ) : items.map((m) => (
          <Card key={m.id} as="button" onClick={() => setOpen(m)} className="w-full p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-extrabold leading-snug">{m.title}</span>
              <Badge tone="accent">{KIND_TXT[m.kind] ?? m.kind}</Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{m.content}</p>
            <div className="mt-1 text-[11px] text-muted">{scopeName(m.scope)} · {dateTime(m.created_at)}</div>
          </Card>
        ))}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title} footer={<Button variant="ghost" className="w-full text-bad" onClick={() => remove(open.id)}><Trash2 className="h-4 w-4" /> Hapus memori</Button>}>
        {open && (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5"><Badge tone="accent">{KIND_TXT[open.kind] ?? open.kind}</Badge><Badge>{scopeName(open.scope)}</Badge>{open.employee_id && <Badge>{employees.find((e) => e.id === open.employee_id)?.name ?? open.employee_id}</Badge>}</div>
            <Markdown text={open.content} />
            <div className="mt-3 text-xs text-muted">{dateTime(open.created_at)}</div>
          </>
        )}
      </Sheet>
      <Sheet open={!!form} onClose={() => setForm(null)} title="Tambah memori" footer={<Button variant="primary" className="w-full" onClick={save}>Simpan</Button>}>
        {form && (
          <div className="space-y-3">
            <Field label="Judul"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Mis. Target klien utama 2027" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Jenis"><select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KIND_TXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Cakupan akses"><select className={inputCls} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="company">Perusahaan (semua)</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            </div>
            <Field label="Isi"><textarea className={`${inputCls} min-h-40`} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
          </div>
        )}
      </Sheet>
    </PageShell>
  );
}
