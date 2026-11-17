import { create } from "zustand";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Approval, Dashboard, Department, Directive, Employee, Notification, ProviderKey, Settings, Task } from "../lib/types";

type Toast = { id: number; text: string; tone: "ok" | "bad" | "info" };

interface State {
  session: Session | null;
  authReady: boolean;
  isFounder: boolean | null;
  loaded: boolean;
  loadError: string | null;
  departments: Department[];
  employees: Employee[];
  tasks: Task[];
  directives: Directive[];
  notifications: Notification[];
  approvals: Approval[];
  providers: ProviderKey[];
  settings: Settings | null;
  dashboard: Dashboard | null;
  selectedEmployeeId: string | null;
  chatTarget: string | null; // employee id atau "group"
  commandOpen: boolean;
  officeFx: { kind: "poke" | "snack" | null; at: number };
  toasts: Toast[];
  init: () => Promise<void>;
  loadAll: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  selectEmployee: (id: string | null) => void;
  openChat: (target: string | null) => void;
  setCommandOpen: (v: boolean) => void;
  fx: (kind: "poke" | "snack") => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  signOut: () => Promise<void>;
}

let channel: RealtimeChannel | null = null;
let dashTimer: ReturnType<typeof setTimeout> | null = null;

function upsert<T extends { id: string }>(list: T[], row: T, sort?: (a: T, b: T) => number, max = 400): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  const next = i >= 0 ? list.map((x, j) => (j === i ? row : x)) : [row, ...list];
  return (sort ? next.sort(sort) : next).slice(0, max);
}
const byCreatedDesc = (a: { created_at: string }, b: { created_at: string }) => Date.parse(b.created_at) - Date.parse(a.created_at);

export const useStore = create<State>((set, get) => ({
  session: null,
  authReady: false,
  isFounder: null,
  loaded: false,
  loadError: null,
  departments: [],
  employees: [],
  tasks: [],
  directives: [],
  notifications: [],
  approvals: [],
  providers: [],
  settings: null,
  dashboard: null,
  selectedEmployeeId: null,
  chatTarget: null,
  commandOpen: false,
  officeFx: { kind: null, at: 0 },
  toasts: [],

  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session, authReady: true });
    if (data.session) await get().loadAll();
    supabase.auth.onAuthStateChange((event, session) => {
      const prev = get().session;
      set({ session });
      if (event === "SIGNED_IN" && !prev && session) get().loadAll();
      if (event === "SIGNED_OUT") {
        channel?.unsubscribe();
        channel = null;
        set({ isFounder: null, loaded: false, employees: [], tasks: [], notifications: [] });
      }
    });
  },

  loadAll: async () => {
    set({ loadError: null });
    const { data: founder, error: fErr } = await supabase.rpc("ai_is_founder");
    if (fErr || founder !== true) {
      set({ isFounder: false, loaded: true });
      return;
    }
    set({ isFounder: true });
    const [deps, emps, tasks, dirs, notifs, appr, prov, sett] = await Promise.all([
      supabase.from("ai_departments").select("*").order("sort"),
      supabase.from("ai_employees").select("*").order("code"),
      supabase.from("ai_tasks").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("ai_directives").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("ai_notifications").select("*").order("created_at", { ascending: false }).limit(150),
      supabase.from("ai_approvals").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("ai_provider_keys").select("provider,masked,status,last_error,last_tested_at,models,default_model,enabled,updated_at"),
      supabase.from("ai_settings").select("*").single(),
    ]);
    const err = [deps, emps, tasks, dirs, notifs, appr, prov, sett].find((r) => r.error)?.error;
    if (err) {
      set({ loadError: err.message, loaded: true });
      return;
    }
    set({
      departments: deps.data as Department[], employees: emps.data as Employee[], tasks: tasks.data as Task[],
      directives: dirs.data as Directive[], notifications: notifs.data as Notification[], approvals: appr.data as Approval[],
      providers: prov.data as ProviderKey[], settings: sett.data as Settings, loaded: true,
    });
    await get().refreshDashboard();
    subscribe(set, get);
  },

  refreshDashboard: async () => {
    const { data } = await supabase.rpc("ai_dashboard");
    if (data) set({ dashboard: data as Dashboard });
  },

  setSettings: async (patch) => {
    const prev = get().settings;
    set({ settings: { ...(prev as Settings), ...patch } });
    const { error } = await supabase.from("ai_settings").update(patch).eq("id", true);
    if (error) {
      set({ settings: prev });
      get().toast(`Gagal menyimpan: ${error.message}`, "bad");
      throw error;
    }
  },

  selectEmployee: (id) => set({ selectedEmployeeId: id }),
  openChat: (target) => set({ chatTarget: target, selectedEmployeeId: null }),
  setCommandOpen: (v) => set({ commandOpen: v }),
  fx: (kind) => set({ officeFx: { kind, at: Date.now() } }),
  toast: (text, tone = "info") => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3800);
  },
  signOut: async () => {
    await supabase.auth.signOut();
  },
}));

function scheduleDashboard(get: () => State) {
  if (dashTimer) clearTimeout(dashTimer);
  dashTimer = setTimeout(() => get().refreshDashboard(), 800);
}

function subscribe(set: (p: Partial<State>) => void, get: () => State) {
  channel?.unsubscribe();
  channel = supabase
    .channel("kanasa-ai")
    .on("postgres_changes", { event: "*", schema: "public", table: "ai_employees" }, (p) => {
      if (p.eventType === "DELETE") return;
      set({ employees: upsert(get().employees, p.new as Employee, (a, b) => a.code.localeCompare(b.code)) });
      scheduleDashboard(get);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "ai_tasks" }, (p) => {
      if (p.eventType === "DELETE") {
        set({ tasks: get().tasks.filter((t) => t.id !== (p.old as Task).id) });
      } else set({ tasks: upsert(get().tasks, p.new as Task, byCreatedDesc, 300) });
      scheduleDashboard(get);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "ai_directives" }, (p) => {
      if (p.eventType !== "DELETE") set({ directives: upsert(get().directives, p.new as Directive, byCreatedDesc, 50) });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "ai_notifications" }, (p) => {
      if (p.eventType === "DELETE") set({ notifications: get().notifications.filter((n) => n.id !== (p.old as Notification).id) });
      else {
        const n = p.new as Notification;
        set({ notifications: upsert(get().notifications, n, byCreatedDesc, 150) });
        if (p.eventType === "INSERT" && n.priority !== "normal") get().toast(n.title, n.priority === "critical" ? "bad" : "info");
      }
      scheduleDashboard(get);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "ai_approvals" }, (p) => {
      if (p.eventType !== "DELETE") set({ approvals: upsert(get().approvals, p.new as Approval, byCreatedDesc, 100) });
      scheduleDashboard(get);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "ai_provider_keys" }, async () => {
      const { data } = await supabase.from("ai_provider_keys").select("provider,masked,status,last_error,last_tested_at,models,default_model,enabled,updated_at");
      if (data) set({ providers: data as ProviderKey[] });
      scheduleDashboard(get);
    })
    .subscribe();
}

export const useEmployee = (id: string | null | undefined) => useStore((s) => s.employees.find((e) => e.id === id) ?? null);
export const useDept = (id: string | null | undefined) => useStore((s) => s.departments.find((d) => d.id === id) ?? null);
