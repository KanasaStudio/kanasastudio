// Chat Founder ↔ karyawan dan rapat grup bersama AURELIA-01.
import { db, Employee, getEmployees, getSettings, honesty, log, runAs, setEmployee } from "./db.ts";
import { ChatMsg, extractJson } from "./providers.ts";

const clip = (s: string | null | undefined, n: number) => (s ?? "").length > n ? (s ?? "").slice(0, n) + "…" : (s ?? "");
const STATUS_ID: Record<string, string> = {
  idle: "sedang senggang", working: "sedang bekerja", researching: "sedang riset", thinking: "sedang berpikir/menganalisis",
  meeting: "sedang ngobrol", resting: "sedang istirahat", reviewing: "sedang mereview", completed: "baru menyelesaikan tugas",
  failed: "baru mengalami kegagalan tugas", paused: "sedang dijeda Founder",
};

async function employeeState(emp: Employee) {
  const { data: current } = emp.current_task_id
    ? await db.from("ai_tasks").select("code,title,progress").eq("id", emp.current_task_id).maybeSingle()
    : { data: null };
  const { data: recent } = await db.from("ai_tasks").select("code,title,status,result_summary,completed_at")
    .eq("employee_id", emp.id).order("updated_at", { ascending: false }).limit(6);
  const { data: queued } = await db.from("ai_tasks").select("code,title").eq("employee_id", emp.id).eq("status", "queued").limit(5);
  return `STATUS NYATA ${emp.name} SAAT INI (dari database, jangan dikarang):
- Status: ${STATUS_ID[emp.status] ?? emp.status}${emp.status_note ? ` (${emp.status_note})` : ""}
- Tugas aktif: ${current ? `${current.code} ${current.title} (${current.progress}%)` : "tidak ada"}
- Antrean: ${(queued ?? []).map((t: any) => `${t.code} ${t.title}`).join("; ") || "kosong"}
- Riwayat terbaru:\n${(recent ?? []).map((t: any) => `  • ${t.code} [${t.status}] ${t.title}${t.result_summary ? `: ${clip(t.result_summary, 200)}` : ""}`).join("\n") || "  • belum ada"}`;
}

async function history(thread: string, limit: number): Promise<any[]> {
  const { data } = await db.from("ai_messages").select("*").eq("thread", thread).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).reverse();
}

function toChat(rows: any[], selfId: string, names: Map<string, string>): ChatMsg[] {
  const msgs: ChatMsg[] = [];
  for (const r of rows) {
    if (r.sender_kind === "system") continue;
    const mine = r.sender_kind === "employee" && r.sender_id === selfId;
    const prefix = mine ? "" : r.sender_kind === "founder" ? "Founder: " : `${names.get(r.sender_id) ?? "Rekan"}: `;
    const role = mine ? "assistant" : "user";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += `\n${prefix}${r.content}`;
    else msgs.push({ role, content: `${prefix}${r.content}` });
  }
  if (msgs[0]?.role === "assistant") msgs.unshift({ role: "user", content: "(awal percakapan)" });
  return msgs;
}

export async function chatWithEmployee(employeeId: string, text: string) {
  const settings = await getSettings();
  const employees = await getEmployees();
  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) throw new Error("Karyawan tidak ditemukan");
  const thread = `dm:${emp.id}`;
  await db.from("ai_messages").insert({ thread, sender_kind: "founder", sender_id: "founder", recipient_id: emp.id, content: clip(text, 4000) });
  const prevStatus = emp.status;
  if (["idle", "completed"].includes(emp.status)) await setEmployee(emp.id, { status: "meeting", status_note: "Ngobrol dengan Founder" });

  const names = new Map(employees.map((e) => [e.id, e.name]));
  const rows = await history(thread, emp.context_messages ?? 12);
  const state = await employeeState(emp);
  let memory = "";
  if ((emp.tool_permissions ?? []).includes("memory_read")) {
    const { data: mem } = await db.rpc("ai_memory_search", { p_query: text, p_scopes: emp.memory_scopes ?? ["company"], p_limit: 4 });
    if (mem?.length) memory = "MEMORI RELEVAN:\n" + mem.map((m: any) => `- ${m.title}: ${clip(m.content, 400)}`).join("\n");
  }
  const proposalField = emp.is_ceo
    ? `"proposed_directive": null | {"objective": "objektif kerja untuk tim", "priority": "critical|high|medium|low"}`
    : `"proposed_task": null | {"title": "", "description": "", "kind": "research|analysis|writing|code|design|marketing|finance|operations|qa|report", "priority": "critical|high|medium|low", "use_web_search": false}`;

  const system = `${emp.system_instructions}
${honesty()}
Kamu sedang chat langsung dengan Founder KANASA STUDIO di aplikasi. Jawab natural, hangat, dan ringkas (maks 120 kata) sesuai kepribadianmu.
${state}
${memory}
Jika Founder meminta pekerjaan yang butuh waktu/riset, JANGAN berpura-pura sudah mengerjakannya; usulkan lewat field ${emp.is_ceo ? "proposed_directive" : "proposed_task"} agar Founder bisa menyetujuinya.
Kamu tidak punya akses internet saat chat.
Balas HANYA JSON: {"reply": "teks balasan", ${proposalField}}`;

  try {
    const { result } = await runAs(emp, settings, {
      system, messages: toChat(rows, emp.id, names), purpose: "chat", json: true, maxTokens: 900, temperature: Math.min(0.8, Number(emp.temperature) + 0.2),
    });
    const out = extractJson(result.text) ?? { reply: result.text };
    const reply = clip(String(out.reply ?? result.text).trim(), 3000) || "…";
    const meta: Record<string, unknown> = {};
    if (out.proposed_task?.title) meta.proposed_task = out.proposed_task;
    if (out.proposed_directive?.objective) meta.proposed_directive = out.proposed_directive;
    const { data: msg } = await db.from("ai_messages").insert({ thread, sender_kind: "employee", sender_id: emp.id, recipient_id: "founder", content: reply, meta }).select("*").single();
    return msg;
  } finally {
    if (["idle", "completed"].includes(prevStatus)) await setEmployee(emp.id, { status: "idle", status_note: null });
  }
}

export async function groupMeeting(text: string) {
  const settings = await getSettings();
  const employees = await getEmployees();
  const ceo = employees.find((e) => e.is_ceo)!;
  const names = new Map(employees.map((e) => [e.id, e.name]));
  await db.from("ai_messages").insert({ thread: "group", sender_kind: "founder", sender_id: "founder", content: clip(text, 4000) });
  const rows = await history("group", 14);
  const roster = employees.filter((e) => !e.is_ceo).map((e) => `"${e.id}" ${e.name} (${e.role_title}, ${STATUS_ID[e.status] ?? e.status}${e.paused ? ", DIJEDA" : ""})`).join("\n");

  await setEmployee(ceo.id, { status: "meeting", status_note: "Memimpin rapat" });
  const out: any[] = [];
  try {
    const { result } = await runAs(ceo, settings, {
      system: `${ceo.system_instructions}\n${honesty()}\nKamu memimpin rapat grup di ruang meeting bersama Founder dan tim. Jawab ringkas (maks 100 kata).
Tim:\n${roster}
Pilih 0-2 karyawan yang paling relevan untuk ikut menanggapi (tidak boleh yang DIJEDA).
Balas HANYA JSON: {"reply": "", "speakers": ["employee_id"], "proposed_directive": null | {"objective": "", "priority": "medium"}}`,
      messages: toChat(rows, ceo.id, names), purpose: "chat", json: true, maxTokens: 700,
    });
    const plan = extractJson(result.text) ?? { reply: result.text, speakers: [] };
    const meta: Record<string, unknown> = {};
    if (plan.proposed_directive?.objective) meta.proposed_directive = plan.proposed_directive;
    const { data: m1 } = await db.from("ai_messages").insert({ thread: "group", sender_kind: "employee", sender_id: ceo.id, content: clip(String(plan.reply ?? ""), 3000) || "…", meta }).select("*").single();
    out.push(m1);
    const speakers = (Array.isArray(plan.speakers) ? plan.speakers : [])
      .map((id: string) => employees.find((e) => e.id === id && !e.is_ceo && !e.paused)).filter(Boolean).slice(0, 2) as Employee[];
    for (const sp of speakers) {
      await setEmployee(sp.id, { status: "meeting", status_note: "Rapat dengan Founder" });
      const rows2 = await history("group", 14);
      const state = await employeeState(sp);
      try {
        const { result: r2 } = await runAs(sp, settings, {
          system: `${sp.system_instructions}\n${honesty()}\nKamu ikut rapat grup bersama Founder dan AURELIA-01. Tanggapi singkat (maks 80 kata) dari sudut keahlianmu.\n${state}`,
          messages: toChat(rows2, sp.id, names), purpose: "chat", maxTokens: 500,
        });
        const { data: m2 } = await db.from("ai_messages").insert({ thread: "group", sender_kind: "employee", sender_id: sp.id, content: clip(r2.text.trim(), 2000) || "…" }).select("*").single();
        out.push(m2);
      } catch (e) {
        await db.from("ai_messages").insert({ thread: "group", sender_kind: "system", content: `${sp.name} tidak bisa menanggapi: ${(e as Error).message}` });
      }
    }
    await log("founder", "founder", "Founder", "chat", `Rapat grup: ${clip(text, 120)}`);
    return out;
  } finally {
    await setEmployee(ceo.id, { status: "idle", status_note: null });
  }
}
