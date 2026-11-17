import { Info, Plus, Trash2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/Layout";
import { Badge, Button, Card, Empty, Field, inputCls, SectionTitle, Segmented, Sheet, Stat } from "../components/ui";
import { compact, dateShort, idr, num, usd } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useStore } from "../store/useStore";

interface Tx {
  id: string; direction: "revenue" | "expense"; status: "actual" | "confirmed" | "estimated" | "forecast"; category: string;
  amount: number; currency: "IDR" | "USD"; occurred_on: string; description: string; department_id: string | null; source: string;
}

const STATUS_TXT: Record<Tx["status"], string> = { actual: "Aktual", confirmed: "Terkonfirmasi", estimated: "Estimasi", forecast: "Proyeksi" };
const CATS = ["proyek klien", "produk digital", "konten", "lisensi", "api", "langganan software", "hardware", "operasional", "marketing", "lainnya"];

export default function FinancePage() {
  const settings = useStore((s) => s.settings);
  const departments = useStore((s) => s.departments);
  const employees = useStore((s) => s.employees);
  const toast = useStore((s) => s.toast);
  const [tx, setTx] = useState<Tx[] | null>(null);
  const [usage, setUsage] = useState<any[]>([]);
  const [form, setForm] = useState<Partial<Tx> | null>(null);
  const [tab, setTab] = useState<"ringkasan" | "transaksi" | "api">("ringkasan");
  const rate = settings?.usd_to_idr ?? null;

  const load = async () => {
    const since = new Date(); since.setMonth(since.getMonth() - 6); since.setDate(1);
    const [t, u] = await Promise.all([
      supabase.from("ai_transactions").select("*").gte("occurred_on", since.toISOString().slice(0, 10)).order("occurred_on", { ascending: false }).limit(1000),
      supabase.from("ai_api_usage").select("*").gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()).order("created_at", { ascending: false }).limit(3000),
    ]);
    setTx((t.data ?? []) as Tx[]);
    setUsage(u.data ?? []);
  };
  useEffect(() => { load(); }, []);

  // Konversi ke IDR hanya bila Founder mengisi kurs; jika tidak, USD dipisah.
  const toIdr = (t: Tx) => (t.currency === "IDR" ? Number(t.amount) : rate ? Number(t.amount) * rate : 0);
  const month = new Date().toISOString().slice(0, 7);
  const sums = useMemo(() => {
    const m = (tx ?? []).filter((t) => t.occurred_on.startsWith(month));
    const s = (dir: Tx["direction"], st: Tx["status"]) => m.filter((t) => t.direction === dir && t.status === st).reduce((a, t) => a + toIdr(t), 0);
    const usdOnly = !rate ? m.filter((t) => t.currency === "USD") : [];
    const revA = s("revenue", "actual"), expA = s("expense", "actual"), revC = s("revenue", "confirmed"), revF = s("revenue", "forecast"), expE = s("expense", "estimated");
    return {
      revA, expA, net: revA - expA, revC, revF, expE, projected: revA + revC + revF - expA - expE,
      usdExpense: usdOnly.filter((t) => t.direction === "expense").reduce((a, t) => a + Number(t.amount), 0),
      usdRevenue: usdOnly.filter((t) => t.direction === "revenue").reduce((a, t) => a + Number(t.amount), 0),
    };
  }, [tx, rate, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthly = useMemo(() => {
    const out: { key: string; label: string; rev: number; exp: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const rows = (tx ?? []).filter((t) => t.occurred_on.startsWith(key) && t.status === "actual");
      out.push({
        key, label: d.toLocaleDateString("id-ID", { month: "short" }),
        rev: rows.filter((t) => t.direction === "revenue").reduce((a, t) => a + toIdr(t), 0),
        exp: rows.filter((t) => t.direction === "expense").reduce((a, t) => a + toIdr(t), 0),
      });
    }
    return out;
  }, [tx, rate]); // eslint-disable-line react-hooks/exhaustive-deps

  const apiDaily = useMemo(() => {
    const days: { key: string; label: string; tokens: number; cost: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      const rows = usage.filter((u) => String(u.created_at).startsWith(key));
      days.push({ key, label: String(d.getDate()), tokens: rows.reduce((a, u) => a + u.input_tokens + u.output_tokens, 0), cost: rows.reduce((a, u) => a + Number(u.cost_usd ?? 0), 0) });
    }
    return days;
  }, [usage]);

  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of usage) {
      const e = employees.find((x) => x.id === u.employee_id);
      const k = e?.is_ceo ? "ceo" : e?.department_id ?? "lainnya";
      m.set(k, (m.get(k) ?? 0) + u.input_tokens + u.output_tokens);
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      k, v, pct: (v / total) * 100,
      name: k === "ceo" ? "AURELIA-01 (CEO)" : departments.find((d) => d.id === k)?.name ?? k,
      color: k === "ceo" ? "#1b1b1b" : departments.find((d) => d.id === k)?.color ?? "#999",
    }));
  }, [usage, employees, departments]);

  const unpriced = usage.filter((u) => u.cost_usd == null).length;

  const save = async () => {
    if (!form?.amount || !form.direction || !form.status) return toast("Lengkapi jenis, status, dan jumlah", "bad");
    const row = {
      direction: form.direction, status: form.status, category: form.category || "lainnya", amount: Number(form.amount),
      currency: form.currency || "IDR", occurred_on: form.occurred_on || new Date().toISOString().slice(0, 10),
      description: form.description || "", department_id: form.department_id || null, source: "manual",
    };
    const { error } = form.id ? await supabase.from("ai_transactions").update(row).eq("id", form.id) : await supabase.from("ai_transactions").insert(row);
    if (error) return toast(error.message, "bad");
    toast("Transaksi disimpan", "ok");
    setForm(null);
    load();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("ai_transactions").delete().eq("id", id);
    if (error) return toast(error.message, "bad");
    setTx((x) => x?.filter((t) => t.id !== id) ?? null);
    setForm(null);
  };

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: "ringkasan", label: "Ringkasan" }, { value: "transaksi", label: "Transaksi", count: tx?.length }, { value: "api", label: "Biaya API" }]} />
        <Button variant="primary" size="sm" onClick={() => setForm({ direction: "expense", status: "actual", currency: "IDR", category: "lainnya", occurred_on: new Date().toISOString().slice(0, 10) })}><Plus className="h-4 w-4" /> Catat</Button>
      </div>

      {tab === "ringkasan" && (
        <>
          <Card className="mt-3 flex items-start gap-2.5 p-3.5 text-sm text-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>Angka <b>aktual</b> hanya berasal dari transaksi yang kamu catat. Biaya API dihitung dari token × tarif yang kamu isi, jadi berstatus <b>estimasi</b>, bukan tagihan resmi. AI tidak pernah membuat transaksi aktual.</span>
          </Card>
          <SectionTitle>Bulan ini</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Stat label="Pendapatan aktual" value={compact(sums.revA)} sub={idr(sums.revA)} tone="ok" />
            <Stat label="Pengeluaran aktual" value={compact(sums.expA)} sub={idr(sums.expA)} tone="bad" />
            <Stat label="Laba bersih aktual" value={compact(sums.net)} sub={idr(sums.net)} tone={sums.net >= 0 ? "ok" : "bad"} />
            <Stat label="Pendapatan terkonfirmasi" value={compact(sums.revC)} sub="Pasti, belum cair" tone="info" />
            <Stat label="Proyeksi pendapatan" value={compact(sums.revF)} sub="Perkiraan, belum pasti" />
            <Stat label="Estimasi biaya" value={compact(sums.expE)} sub="Termasuk estimasi API" />
            <Stat label="Proyeksi laba" value={compact(sums.projected)} sub="Aktual + terkonfirmasi + proyeksi − biaya" tone={sums.projected >= 0 ? "ok" : "bad"} />
            <Stat label="Kurs USD→IDR" value={rate ? num(rate) : "—"} sub={rate ? "Diatur Founder" : "Isi di Pengaturan untuk menggabungkan USD"} />
          </div>
          {!rate && (sums.usdExpense > 0 || sums.usdRevenue > 0) && (
            <p className="mt-2 px-1 text-xs text-muted">Transaksi USD bulan ini (dipisah karena kurs belum diisi): pendapatan {usd(sums.usdRevenue)}, pengeluaran {usd(sums.usdExpense, 4)}.</p>
          )}

          <SectionTitle>Pendapatan vs pengeluaran (aktual, 6 bulan)</SectionTitle>
          <Card className="p-4">
            <BarPairs data={monthly} />
            <div className="mt-2 flex gap-4 text-xs font-bold text-muted"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-ok" /> Pendapatan</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-accent" /> Pengeluaran</span></div>
          </Card>
          <SectionTitle>Laba & arus kas kumulatif</SectionTitle>
          <Card className="p-4"><ProfitChart data={monthly} /></Card>
        </>
      )}

      {tab === "transaksi" && (
        <div className="mt-3 space-y-2">
          {tx === null ? <div className="h-32 animate-pulse rounded-3xl bg-surface" /> : !tx.length ? (
            <Empty icon={<Wallet className="h-6 w-6" />} title="Belum ada transaksi" text="Catat pendapatan, pengeluaran, pembelian API, langganan software, dan biaya proyek." />
          ) : tx.map((t) => (
            <Card key={t.id} as="button" onClick={() => setForm(t)} className="flex w-full items-center gap-3 p-3.5">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg font-black ${t.direction === "revenue" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{t.direction === "revenue" ? "+" : "−"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">{t.description || t.category}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">{dateShort(t.occurred_on)} · {t.category}<Badge tone={t.status === "actual" ? "ok" : t.status === "confirmed" ? "info" : "muted"}>{STATUS_TXT[t.status]}</Badge>{t.source === "api_usage" && <Badge>otomatis</Badge>}</span>
              </span>
              <span className={`shrink-0 text-right font-black ${t.direction === "revenue" ? "text-ok" : "text-text"}`}>{t.currency === "IDR" ? idr(Number(t.amount)) : usd(Number(t.amount), 4)}</span>
            </Card>
          ))}
        </div>
      )}

      {tab === "api" && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Stat label="Token 30 hari" value={compact(usage.reduce((a, u) => a + u.input_tokens + u.output_tokens, 0))} tone="info" />
            <Stat label="Estimasi biaya 30 hari" value={usd(usage.reduce((a, u) => a + Number(u.cost_usd ?? 0), 0), 4)} />
            <Stat label="Panggilan" value={num(usage.length)} />
            <Stat label="Tanpa tarif" value={num(unpriced)} sub="Isi tarif di API & Integrasi" tone={unpriced ? "bad" : "ok"} />
          </div>
          <SectionTitle>Konsumsi token harian (14 hari)</SectionTitle>
          <Card className="p-4"><Bars data={apiDaily.map((d) => ({ label: d.label, value: d.tokens }))} format={compact} /></Card>
          <SectionTitle>Distribusi pemakaian per departemen</SectionTitle>
          <Card className="space-y-2.5 p-4">
            {byDept.length ? byDept.map((d) => (
              <div key={d.k}>
                <div className="flex justify-between text-sm"><span className="font-bold">{d.name}</span><span className="text-muted">{compact(d.v)} token</span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: d.color }} /></div>
              </div>
            )) : <p className="text-sm text-muted">Belum ada pemakaian API.</p>}
          </Card>
          <SectionTitle>Riwayat pemakaian API</SectionTitle>
          <Card className="divide-y divide-line">
            {usage.slice(0, 40).map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0"><span className="block truncate font-bold">{employees.find((e) => e.id === u.employee_id)?.name ?? "Sistem"} · {u.purpose}</span><span className="block truncate text-xs text-muted">{u.provider} / {u.model} · {new Date(u.created_at).toLocaleString("id-ID")}</span></span>
                <span className="shrink-0 text-right text-xs"><b>{compact(u.input_tokens + u.output_tokens)}</b><br /><span className="text-muted">{u.cost_usd == null ? "tanpa tarif" : usd(Number(u.cost_usd), 4)}</span></span>
              </div>
            ))}
            {!usage.length && <div className="p-4 text-sm text-muted">Belum ada panggilan API.</div>}
          </Card>
        </>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? "Ubah transaksi" : "Catat transaksi"} footer={
        <div className="flex gap-2">
          {form?.id && <Button variant="ghost" className="text-bad" onClick={() => remove(form.id!)}><Trash2 className="h-4 w-4" /></Button>}
          <Button variant="primary" className="flex-1" onClick={save}>Simpan</Button>
        </div>
      }>
        {form && (
          <div className="space-y-3">
            <Segmented value={form.direction ?? "expense"} onChange={(v) => setForm({ ...form, direction: v, status: v === "revenue" ? "actual" : "actual" })} options={[{ value: "revenue", label: "Pendapatan" }, { value: "expense", label: "Pengeluaran" }]} />
            <Field label="Status" hint="Aktual = uang benar-benar masuk/keluar. Terkonfirmasi = pendapatan pasti tapi belum cair.">
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Tx["status"] })}>
                {(form.direction === "revenue" ? ["actual", "confirmed", "forecast"] : ["actual", "estimated"]).map((s) => <option key={s} value={s}>{STATUS_TXT[s as Tx["status"]]}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Mata uang"><select className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Tx["currency"] })}><option>IDR</option><option>USD</option></select></Field>
              <div className="col-span-2"><Field label="Jumlah"><input type="number" inputMode="decimal" min={0} className={inputCls} value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tanggal"><input type="date" className={inputCls} value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} /></Field>
              <Field label="Kategori"><select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            </div>
            <Field label="Departemen (opsional)"><select className={inputCls} value={form.department_id ?? ""} onChange={(e) => setForm({ ...form, department_id: e.target.value || null })}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Keterangan"><input className={inputCls} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mis. Pembayaran rig Kitsune dari klien" /></Field>
          </div>
        )}
      </Sheet>
    </PageShell>
  );
}

function BarPairs({ data }: { data: { label: string; rev: number; exp: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.rev, d.exp]));
  return (
    <div className="flex h-40 items-end gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-32 w-full items-end justify-center gap-1">
            <div className="w-1/2 max-w-5 rounded-t-md bg-ok" style={{ height: `${(d.rev / max) * 100}%`, minHeight: d.rev ? 3 : 0 }} title={idr(d.rev)} />
            <div className="w-1/2 max-w-5 rounded-t-md bg-accent" style={{ height: `${(d.exp / max) * 100}%`, minHeight: d.exp ? 3 : 0 }} title={idr(d.exp)} />
          </div>
          <span className="text-[11px] font-bold text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function ProfitChart({ data }: { data: { label: string; rev: number; exp: number }[] }) {
  const profit = data.map((d) => d.rev - d.exp);
  let c = 0;
  const cum = profit.map((p) => (c += p));
  const all = [...profit, ...cum, 0];
  const min = Math.min(...all), max = Math.max(...all);
  const range = max - min || 1;
  const W = 300, H = 120;
  const y = (v: number) => H - ((v - min) / range) * (H - 10) - 5;
  const x = (i: number) => (i / (data.length - 1)) * (W - 20) + 10;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full">
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="4 4" />
        {profit.map((p, i) => (
          <rect key={i} x={x(i) - 8} width="16" y={Math.min(y(p), y(0))} height={Math.abs(y(p) - y(0)) || 1} rx="3" fill={p >= 0 ? "var(--ok)" : "var(--bad)"} opacity=".75" />
        ))}
        <polyline points={cum.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        {cum.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="var(--accent)" />)}
      </svg>
      <div className="flex justify-between px-1 text-[11px] font-bold text-muted">{data.map((d) => <span key={d.label}>{d.label}</span>)}</div>
      <div className="mt-1 text-xs text-muted">Batang = laba per bulan, garis = arus kas kumulatif (aktual). Total: {idr(cum[cum.length - 1])}</div>
    </div>
  );
}

function Bars({ data, format }: { data: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-36 items-end gap-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1" title={format(d.value)}>
          <div className="flex h-28 w-full items-end"><div className="w-full rounded-t-md bg-accent" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 0 }} /></div>
          <span className="text-[10px] font-bold text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
