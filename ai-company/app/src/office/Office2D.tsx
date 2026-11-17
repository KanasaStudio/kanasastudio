import { Coffee, Users } from "lucide-react";
import { Avatar } from "../components/Avatar";
import { STATUS_LABEL } from "../lib/format";
import type { Department, Employee } from "../lib/types";
import { bubbleIcon, bubbleText, OfficeContext } from "./bubbles";

// Tampilan kantor 2D ringan untuk perangkat yang tidak kuat merender 3D.
export default function Office2D({ employees, departments, ctx, onSelect }: {
  employees: Employee[]; departments: Department[]; ctx: OfficeContext; onSelect: (id: string) => void;
}) {
  const ceo = employees.find((e) => e.is_ceo);
  const meeting = employees.filter((e) => e.status === "meeting" && !e.is_ceo);
  const resting = employees.filter((e) => e.status === "resting");
  const atDesk = (d: string) => employees.filter((e) => e.department_id === d && e.status !== "meeting" && e.status !== "resting");

  const Person = ({ e }: { e: Employee }) => (
    <button onClick={() => onSelect(e.id)} className="flex w-full items-start gap-2.5 rounded-2xl p-2 text-left transition active:scale-[0.98] hover:bg-surface-2">
      <Avatar appearance={e.appearance} status={e.status} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-extrabold">{e.name}</span>
          <span className="text-xs">{bubbleIcon(e)}</span>
        </span>
        <span className="block text-[11px] font-bold text-accent-text">{STATUS_LABEL[e.status]}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{bubbleText(e, ctx)}</span>
      </span>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto px-4 pb-64 pt-20">
      {ceo && (
        <div className="mb-3 rounded-3xl border border-accent/40 bg-surface p-2 shadow-card">
          <Person e={ceo} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {departments.map((d) => (
          <div key={d.id} className="rounded-3xl border border-line bg-surface p-2 shadow-card">
            <div className="flex items-center gap-2 px-2 pb-1 pt-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-xs font-black uppercase tracking-wide text-muted">{d.short_name}</span>
            </div>
            {atDesk(d.id).map((e) => <Person key={e.id} e={e} />)}
            {!atDesk(d.id).length && <div className="px-2 pb-2 text-xs text-muted">Semua anggota sedang di ruang lain.</div>}
          </div>
        ))}
        <div className="rounded-3xl border border-line bg-surface p-2 shadow-card">
          <div className="flex items-center gap-2 px-2 pt-1 text-xs font-black uppercase tracking-wide text-muted"><Users className="h-3.5 w-3.5" /> Ruang rapat</div>
          {meeting.length ? meeting.map((e) => <Person key={e.id} e={e} />) : <div className="px-2 pb-2 pt-1 text-xs text-muted">Kosong</div>}
        </div>
        <div className="rounded-3xl border border-line bg-surface p-2 shadow-card">
          <div className="flex items-center gap-2 px-2 pt-1 text-xs font-black uppercase tracking-wide text-muted"><Coffee className="h-3.5 w-3.5" /> Ruang santai</div>
          {resting.length ? resting.map((e) => <Person key={e.id} e={e} />) : <div className="px-2 pb-2 pt-1 text-xs text-muted">Kosong</div>}
        </div>
      </div>
    </div>
  );
}
