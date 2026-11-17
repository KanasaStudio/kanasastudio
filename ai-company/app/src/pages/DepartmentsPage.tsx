import { Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../components/Avatar";
import { PageShell } from "../components/Layout";
import { Badge, Button, Card, Field, inputCls, Sheet } from "../components/ui";
import { STATUS_LABEL } from "../lib/format";
import { navigate } from "../lib/router";
import { supabase } from "../lib/supabase";
import type { Department } from "../lib/types";
import { useStore } from "../store/useStore";

export default function DepartmentsPage() {
  const departments = useStore((s) => s.departments);
  const employees = useStore((s) => s.employees);
  const tasks = useStore((s) => s.tasks);
  const [edit, setEdit] = useState<Department | null>(null);
  return (
    <PageShell>
      <div className="grid gap-3 md:grid-cols-2">
        {departments.map((d) => {
          const members = employees.filter((e) => e.department_id === d.id);
          const ts = tasks.filter((t) => t.department_id === d.id);
          const active = ts.filter((t) => ["queued", "running"].includes(t.status)).length;
          const done = ts.filter((t) => t.status === "completed").length;
          return (
            <Card key={d.id} className="overflow-hidden">
              <div className="h-1.5" style={{ background: d.color }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-muted">{d.code}</div>
                    <div className="text-lg font-black leading-tight">{d.name}</div>
                  </div>
                  <Button size="sm" onClick={() => setEdit(d)}>Ubah</Button>
                </div>
                <p className="mt-2 text-sm text-muted">{d.mission}</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-accent-text"><ShieldCheck className="h-4 w-4" />{d.clearance}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.responsibilities.slice(0, 6).map((r) => <Badge key={r}>{r}</Badge>)}
                  {d.responsibilities.length > 6 && <Badge>+{d.responsibilities.length - 6}</Badge>}
                </div>
                <div className="mt-3 space-y-1.5">
                  {members.map((e) => (
                    <button key={e.id} onClick={() => navigate(`karyawan/${e.id}`)} className="flex w-full items-center gap-2.5 rounded-2xl bg-surface-2 p-2 text-left">
                      <Avatar appearance={e.appearance} status={e.status} size={34} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold">{e.name}</span><span className="text-xs text-muted">{e.role_title}</span></span>
                      <span className="text-xs font-bold text-muted">{STATUS_LABEL[e.status]}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-surface-2 py-2"><div className="text-lg font-black">{active}</div><div className="text-[11px] text-muted">aktif</div></div>
                  <div className="rounded-2xl bg-surface-2 py-2"><div className="text-lg font-black">{done}</div><div className="text-[11px] text-muted">selesai</div></div>
                  <div className="rounded-2xl bg-surface-2 py-2"><div className="text-lg font-black">{d.monthly_usd_budget != null ? `$${d.monthly_usd_budget}` : "—"}</div><div className="text-[11px] text-muted">anggaran/bln</div></div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <EditDept dept={edit} onClose={() => setEdit(null)} />
    </PageShell>
  );
}

function EditDept({ dept, onClose }: { dept: Department | null; onClose: () => void }) {
  const toast = useStore((s) => s.toast);
  const [f, setF] = useState<Department | null>(dept);
  const [saving, setSaving] = useState(false);
  if (dept && f?.id !== dept.id) setF(dept);
  const save = async () => {
    if (!f) return;
    setSaving(true);
    const { error } = await supabase.from("ai_departments").update({
      mission: f.mission, responsibilities: f.responsibilities, monthly_usd_budget: f.monthly_usd_budget,
    }).eq("id", f.id);
    setSaving(false);
    if (error) return toast(error.message, "bad");
    useStore.setState((s) => ({ departments: s.departments.map((d) => (d.id === f.id ? f : d)) }));
    toast("Departemen disimpan", "ok");
    onClose();
  };
  return (
    <Sheet open={!!dept} onClose={onClose} title={dept?.name} footer={<Button variant="primary" className="w-full" loading={saving} onClick={save}><Save className="h-4 w-4" /> Simpan</Button>}>
      {f && (
        <div className="space-y-3">
          <Field label="Misi"><textarea className={`${inputCls} min-h-24`} value={f.mission} onChange={(e) => setF({ ...f, mission: e.target.value })} /></Field>
          <Field label="Tanggung jawab (satu per baris)"><textarea className={`${inputCls} min-h-32`} value={f.responsibilities.join("\n")} onChange={(e) => setF({ ...f, responsibilities: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Field>
          <Field label="Anggaran bulanan (USD)" hint="Untuk pemantauan. Kosongkan bila tidak dibatasi."><input type="number" className={inputCls} value={f.monthly_usd_budget ?? ""} onChange={(e) => setF({ ...f, monthly_usd_budget: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
        </div>
      )}
    </Sheet>
  );
}
