// Engine KANASA STUDIO: orkestrasi AURELIA-01, eksekusi tugas karyawan, review, jadwal harian.
import {
  BlockedError, db, Employee, errMessage, getEmployees, getSettings, honesty, log, notify, runAs, setEmployee, Settings, Task,
} from "./db.ts";
import { extractJson, Source } from "./providers.ts";

const TERMINAL = ["completed", "cancelled", "failed", "blocked"];
const KINDS = ["research", "analysis", "writing", "code", "design", "marketing", "finance", "operations", "qa", "report"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const SENSITIVE_RE =
  /(publikasi|publish|posting ke|unggah ke|upload ke|kirim (email|pesan|surat) ke|send (an )?email|blast|pembelian|membeli|purchase|beli lisensi|transfer dana|pembayaran|bayar|deploy (ke )?produksi|production deploy|rilis ke publik|hapus (data|database|tabel)|drop table|ubah akun|ganti password|account change)/i;

const clip = (s: string | null | undefined, n: number) => (s ?? "").length > n ? (s ?? "").slice(0, n) + "…" : (s ?? "");

// ---------------------------------------------------------------------------
// Tick utama (dipanggil pg_cron tiap menit, atau manual)
// ---------------------------------------------------------------------------
export async function tick(trigger: string) {
  const settings = await getSettings();
  if (settings.emergency_stop) return { stopped: true };
  const report: Record<string, unknown> = { trigger };

  const { data: sweep } = await db.rpc("ai_sweep");
  for (const t of (sweep?.timed_out ?? []) as any[]) {
    if (t.status === "failed") {
      await notify({
        priority: t.priority === "critical" ? "critical" : "high", category: "task_failed",
        title: `Tugas gagal: ${t.code}`, body: `${t.title} — timeout berulang.`, taskId: t.id, employeeId: t.employee_id,
        link: `#/tugas/${t.id}`, dedupeKey: `task-failed:${t.id}`,
      });
    }
  }
  for (const t of (sweep?.blocked ?? []) as any[]) {
    await notify({
      priority: "high", category: "blocked", title: `Terblokir dependensi: ${t.code}`,
      body: `${t.title} tidak bisa lanjut karena tugas yang ditunggunya gagal/dibatalkan.`,
      taskId: t.id, employeeId: t.employee_id, link: `#/tugas/${t.id}`, dedupeKey: `blocked:${t.id}`,
    });
  }

  // Jadwal harian
  const { data: jobs } = await db.rpc("ai_claim_schedule");
  for (const job of (jobs ?? []) as any[]) {
    try {
      const detail = await runScheduleAction(job.action, settings);
      await db.from("ai_jobs").update({ status: detail.skipped ? "skipped" : "done", detail: detail.text, finished_at: new Date().toISOString() }).eq("id", job.id);
      await log("system", "scheduler", "Penjadwal", "schedule", `${job.action}: ${detail.text}`);
    } catch (e) {
      await db.from("ai_jobs").update({ status: "failed", detail: errMessage(e), finished_at: new Date().toISOString() }).eq("id", job.id);
      await log("system", "scheduler", "Penjadwal", "schedule", `Jadwal ${job.action} gagal`, errMessage(e));
    }
  }
  report.jobs = (jobs ?? []).length;

  // Directive yang macet di tahap perencanaan
  const { data: stuck } = await db.from("ai_directives").select("*").eq("status", "planning")
    .lt("created_at", new Date(Date.now() - 3 * 60_000).toISOString()).limit(2);
  for (const d of stuck ?? []) {
    if (Date.parse(d.created_at) < Date.now() - 20 * 60_000) {
      await db.from("ai_directives").update({ status: "failed", error: "Perencanaan tidak selesai dalam 20 menit" }).eq("id", d.id);
    } else {
      await planDirective(d.id);
    }
  }

  // Eksekusi tugas
  const { data: claimed, error } = await db.rpc("ai_claim_tasks", { p_limit: settings.max_parallel_tasks });
  if (error) throw error;
  const tasks = (claimed ?? []) as Task[];
  report.executed = tasks.length;
  await Promise.allSettled(tasks.map((t) => executeTask(t)));
  return report;
}

// ---------------------------------------------------------------------------
// Eksekusi satu tugas
// ---------------------------------------------------------------------------
export async function executeTask(task: Task) {
  const settings = await getSettings();
  const employees = await getEmployees();
  const emp = employees.find((e) => e.id === task.employee_id)!;
  const { data: dept } = await db.from("ai_departments").select("*").eq("id", emp.department_id ?? "").maybeSingle();
  const tools: string[] = emp.tool_permissions ?? [];
  const webSearch = !!task.use_web_search && tools.includes("web_search");

  await setEmployee(emp.id, {
    status: task.kind === "research" ? "researching" : task.kind === "analysis" || task.kind === "report" ? "thinking" : "working",
    current_task_id: task.id, status_note: task.title,
  });
  await log("employee", emp.id, emp.name, "task_assignment", `${emp.name} mulai ${task.code}: ${clip(task.title, 120)}`, null, task.id, emp.department_id);

  const { data: attempt } = await db.from("ai_task_attempts").insert({
    task_id: task.id, employee_id: emp.id, step: "execute", status: "running",
  }).select("id").single();

  try {
    const context = await buildContext(task, emp, tools);
    const isResearch = task.kind === "research";
    const system = [
      emp.system_instructions,
      honesty(),
      `Identitas: ${emp.name}, ${emp.role_title}${dept ? `, departemen ${dept.name}` : ""}. Clearance: ${dept?.clearance ?? "-"}.`,
      webSearch
        ? "Kamu PUNYA akses pencarian web untuk tugas ini. Gunakan untuk mencari informasi terbaru. Setiap temuan wajib memakai URL sumber yang benar-benar muncul di hasil pencarianmu."
        : "Kamu TIDAK punya akses internet untuk tugas ini. Jangan menyebut data terbaru atau URL yang tidak diberikan di konteks.",
      "Balas HANYA dengan satu objek JSON valid sesuai format yang diminta, tanpa teks lain.",
    ].join("\n\n");

    const format = `FORMAT JSON:
{
  "status": "done" | "blocked",
  "blocked_reason": string | null,
  "summary": "ringkasan 2-4 kalimat",
  "result_markdown": "hasil kerja lengkap dalam markdown (judul, poin, tabel bila perlu)",
  ${isResearch ? `"findings": [{"title": "", "summary": "", "source_url": "URL dari hasil pencarian", "source_title": "", "published_date": "YYYY-MM-DD atau null", "confidence": "low|medium|high", "business_relevance": "", "opportunity": ""}],
  "opportunities": [{"title": "", "description": "", "region": "Indonesia|Internasional", "category": "", "confidence": "low|medium|high"}],` : ""}
  "memory_notes": ["keputusan/pelajaran penting yang perlu diingat perusahaan (maks 3)"],
  "needs_founder_decision": string | null${tools.includes("internal_message") ? `,
  "message_to": {"employee_id": "id rekan kerja", "content": "pesan internal singkat"} | null` : ""}
}
Gunakan "blocked" hanya bila tugas benar-benar tidak bisa dikerjakan dengan informasi/akses yang ada, dan jelaskan alasannya.
Isi "needs_founder_decision" bila hasilmu butuh keputusan/aksi Founder (misalnya publikasi, pembelian, perubahan anggaran).`;

    const user = `TUGAS ${task.code} (prioritas ${task.priority}, jenis ${task.kind})
Judul: ${task.title}
Deskripsi: ${task.description || "-"}
${task.category ? `Kategori: ${task.category}\n` : ""}${task.region ? `Wilayah: ${task.region}\n` : ""}${task.due_at ? `Tenggat: ${task.due_at}\n` : ""}
${context}

${format}`;

    const { result, rm, cost } = await runAs(emp, settings, {
      system, messages: [{ role: "user", content: user }], purpose: "execute", taskId: task.id,
      webSearch, json: !webSearch, maxTokens: Math.max(emp.max_output_tokens ?? 4096, isResearch ? 6000 : 4096),
    });
    await db.from("ai_task_attempts").update({
      status: "succeeded", provider: rm.provider, model: rm.model, input_tokens: result.inputTokens,
      output_tokens: result.outputTokens, cost_usd: cost, finished_at: new Date().toISOString(),
    }).eq("id", attempt!.id);

    const out = extractJson(result.text) ?? { status: "done", summary: clip(result.text, 400), result_markdown: result.text };
    if (!out.result_markdown && !out.summary) throw new Error("Model tidak mengembalikan hasil yang bisa dibaca");

    if (out.status === "blocked") {
      const reason = clip(out.blocked_reason || "Tidak dijelaskan", 500);
      await db.from("ai_tasks").update({ status: "blocked", last_error: reason, progress: 0, result: out.result_markdown ?? null }).eq("id", task.id);
      await setEmployee(emp.id, { status: "failed", current_task_id: null, status_note: `Terblokir: ${clip(reason, 80)}` });
      await notify({
        priority: "high", category: "blocked", title: `${emp.name} terblokir`, body: `${task.code}: ${reason}`,
        employeeId: emp.id, taskId: task.id, link: `#/tugas/${task.id}`, dedupeKey: `blocked:${task.id}`,
      });
      await log("employee", emp.id, emp.name, "execution_result", `${task.code} terblokir`, reason, task.id, emp.department_id);
      await checkDirective(task.directive_id);
      return;
    }

    // Verifikasi sumber: temuan riset harus menunjuk ke domain yang benar-benar muncul di hasil pencarian.
    const verified = verifySources(out.findings ?? [], result.sources, webSearch);
    let resultMd = String(out.result_markdown || out.summary || "");
    if (webSearch && result.sources.length === 0) {
      resultMd += "\n\n> ⚠️ Pencarian web tidak mengembalikan sumber apa pun untuk tugas ini. Perlakukan isi di atas sebagai belum terverifikasi.";
    }
    if (isResearch && !webSearch) {
      resultMd += "\n\n> ⚠️ Riset ini dikerjakan tanpa akses pencarian web, sehingga tidak ada sumber terbaru yang terverifikasi.";
    }

    // Review oleh AURELIA-01
    const ceo = employees.find((e) => e.is_ceo);
    const shouldReview = settings.ceo_review_enabled && ceo && ceo.id !== emp.id && !ceo.paused &&
      task.revision_count < settings.max_revisions &&
      (["critical", "high"].includes(task.priority) || ["research", "code", "marketing", "design"].includes(task.kind));
    if (shouldReview) {
      const review = await reviewTask(ceo!, settings, task, emp, out, verified.findings.length, result.sources.length);
      if (review && review.verdict === "revise") {
        await db.from("ai_tasks").update({
          status: "queued", progress: 50, review_notes: review.notes, revision_count: task.revision_count + 1,
          result: resultMd, result_summary: out.summary ?? null, not_before: new Date().toISOString(), attempts: 0,
        }).eq("id", task.id);
        await db.from("ai_messages").insert({
          thread: `dm:${emp.id}`, sender_kind: "employee", sender_id: ceo!.id, recipient_id: emp.id, task_id: task.id,
          content: `Revisi untuk ${task.code}: ${review.notes}`, meta: { internal: true, review: true },
        });
        await setEmployee(emp.id, { status: "idle", current_task_id: null, status_note: `Revisi diminta AURELIA: ${clip(task.title, 60)}` });
        await log("ceo", ceo!.id, ceo!.name, "ai_decision", `AURELIA-01 meminta revisi ${task.code}`, review.notes, task.id, emp.department_id);
        return;
      }
      if (review?.notes) resultMd += `\n\n---\n**Review AURELIA-01** (skor ${review.score ?? "-"}/10): ${review.notes}`;
    }

    // Simpan laporan riset & peluang
    if (isResearch) {
      const { data: rep } = await db.from("ai_research_reports").insert({
        task_id: task.id, employee_id: emp.id, title: task.title, category: task.category, region: task.region,
        summary: clip(out.summary || "", 1500), body: resultMd, findings: verified.findings, sources: result.sources,
        verified_sources: webSearch && result.sources.length > 0,
      }).select("id").single();
      const opps = Array.isArray(out.opportunities) ? out.opportunities.slice(0, 5) : [];
      for (const o of opps) {
        if (!o?.title) continue;
        const conf = ["low", "medium", "high"].includes(o.confidence) ? o.confidence : "medium";
        // Peluang dari riset tanpa sumber terverifikasi tidak boleh berkeyakinan tinggi.
        const confidence = (!webSearch || result.sources.length === 0) && conf === "high" ? "medium" : conf;
        await db.from("ai_opportunities").insert({
          report_id: rep?.id, task_id: task.id, title: clip(o.title, 200), description: clip(o.description || "", 1500),
          category: o.category ?? task.category, region: o.region ?? task.region, confidence,
          relevance: clip(o.relevance || "", 500) || null,
        });
        if (confidence === "high") {
          await notify({
            priority: "high", category: "opportunity", title: "Peluang bisnis ditemukan",
            body: `${clip(o.title, 120)} — ${clip(o.description, 200)}`, employeeId: emp.id, taskId: task.id, link: "#/intel",
          });
        }
      }
    }

    // Memori perusahaan
    if (tools.includes("memory_write")) {
      const notes = Array.isArray(out.memory_notes) ? out.memory_notes.filter((n: unknown) => typeof n === "string").slice(0, 3) : [];
      await db.from("ai_memory").insert({
        scope: emp.department_id ?? "company", kind: isResearch ? "report" : "project", title: `${task.code} — ${clip(task.title, 150)}`,
        content: clip(`${out.summary ?? ""}\n${notes.map((n: string) => `- ${n}`).join("\n")}`, 4000), task_id: task.id, employee_id: emp.id,
        tags: [task.kind, task.category].filter(Boolean), created_by: emp.id,
      });
    }

    // Pesan internal ke rekan kerja
    if (tools.includes("internal_message") && out.message_to?.employee_id && out.message_to?.content) {
      const target = employees.find((e) => e.id === out.message_to.employee_id);
      if (target && target.id !== emp.id) {
        await db.from("ai_messages").insert({
          thread: "internal", sender_kind: "employee", sender_id: emp.id, recipient_id: target.id, task_id: task.id,
          content: clip(String(out.message_to.content), 1000),
        });
      }
    }

    const needsApproval = task.requires_approval || !!out.needs_founder_decision || SENSITIVE_RE.test(`${task.title} ${task.description}`);
    if (needsApproval) {
      const reason = task.sensitive_reason || out.needs_founder_decision || "Aksi sensitif terdeteksi";
      await db.from("ai_tasks").update({
        status: "awaiting_approval", approval_status: "pending", requires_approval: true, sensitive_reason: clip(reason, 500),
        progress: 95, result: resultMd, result_summary: clip(out.summary, 1500), sources: result.sources,
      }).eq("id", task.id);
      await db.from("ai_approvals").insert({ task_id: task.id, action: task.title, reason: clip(reason, 500), details: clip(out.summary, 1500) });
      await setEmployee(emp.id, { status: "idle", current_task_id: null, status_note: `Menunggu persetujuan Founder: ${clip(task.title, 60)}` });
      await notify({
        priority: "high", category: "approval", title: "AURELIA-01 butuh keputusan Founder",
        body: `${task.code}: ${clip(task.title, 100)} — ${clip(reason, 160)}`, employeeId: emp.id, taskId: task.id,
        link: `#/tugas/${task.id}`, dedupeKey: `approval:${task.id}`,
      });
      await log("employee", emp.id, emp.name, "execution_result", `${task.code} selesai dikerjakan, menunggu persetujuan Founder`, reason, task.id, emp.department_id);
    } else {
      await db.from("ai_tasks").update({
        status: "completed", progress: 100, completed_at: new Date().toISOString(), result: resultMd,
        result_summary: clip(out.summary, 1500), sources: result.sources,
      }).eq("id", task.id);
      await setEmployee(emp.id, { status: "completed", current_task_id: null, status_note: `Selesai: ${clip(task.title, 80)}` });
      await notify({
        priority: "normal", category: isResearch ? "research_done" : "task_done", title: `${emp.name} menyelesaikan ${task.code}`,
        body: clip(out.summary || task.title, 300), employeeId: emp.id, taskId: task.id, link: `#/tugas/${task.id}`,
      });
      await log("employee", emp.id, emp.name, "execution_result", `${task.code} selesai: ${clip(task.title, 120)}`, clip(out.summary, 1000), task.id, emp.department_id);
    }
    await checkDirective(task.directive_id);
  } catch (e) {
    const msg = errMessage(e);
    await db.from("ai_task_attempts").update({ status: "failed", error: clip(msg, 1000), finished_at: new Date().toISOString() }).eq("id", attempt!.id);
    if (e instanceof BlockedError) {
      await db.from("ai_tasks").update({ status: "blocked", last_error: msg, progress: 0, attempts: Math.max(0, task.attempts - 1) }).eq("id", task.id);
      await setEmployee(emp.id, { status: "idle", current_task_id: null, status_note: clip(msg, 120) });
      await notify({
        priority: e.kind === "budget" ? "critical" : "high", category: e.kind === "budget" ? "budget" : "provider",
        title: e.kind === "budget" ? "Anggaran API tercapai" : "API AI belum siap", body: msg,
        link: e.kind === "budget" ? "#/pengaturan" : "#/api", dedupeKey: e.kind === "budget" ? `budget:${new Date().toISOString().slice(0, 10)}` : "no-provider",
      });
      await log("system", "engine", "System Security Gate", "security", `${task.code} ditahan: ${clip(msg, 200)}`, null, task.id, emp.department_id);
      return;
    }
    const final = task.attempts >= settings.max_task_attempts;
    await db.from("ai_tasks").update({
      status: final ? "failed" : "queued", last_error: clip(msg, 1000), progress: final ? task.progress : 0,
      not_before: new Date(Date.now() + 2 ** task.attempts * 60_000).toISOString(),
    }).eq("id", task.id);
    await setEmployee(emp.id, final
      ? { status: "failed", current_task_id: null, status_note: `Gagal: ${clip(msg, 100)}` }
      : { status: "idle", current_task_id: null, status_note: `Akan mencoba lagi ${task.code}` });
    await log("employee", emp.id, emp.name, "execution_result", `${task.code} ${final ? "GAGAL" : "error, dijadwalkan ulang"}`, msg, task.id, emp.department_id);
    if (final) {
      await notify({
        priority: task.priority === "critical" ? "critical" : "high", category: "task_failed", title: `Tugas gagal: ${task.code}`,
        body: `${clip(task.title, 100)} — ${clip(msg, 200)}`, employeeId: emp.id, taskId: task.id, link: `#/tugas/${task.id}`,
        dedupeKey: `task-failed:${task.id}`,
      });
      await checkDirective(task.directive_id);
    }
  }
}

function hostOf(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function verifySources(findings: any[], sources: Source[], webSearch: boolean) {
  const hosts = new Set<string>();
  for (const s of sources) {
    const h = hostOf(s.url);
    if (h && !h.includes("vertexaisearch")) hosts.add(h);
    // Gemini memberi URL redirect; judul chunk berisi domain asli.
    if (s.title && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.title.trim())) hosts.add(s.title.trim().replace(/^www\./, "").toLowerCase());
  }
  const out = (Array.isArray(findings) ? findings : []).slice(0, 12).map((f) => {
    const h = hostOf(String(f?.source_url ?? ""));
    const ok = webSearch && !!h && [...hosts].some((x) => h === x || h.endsWith("." + x) || x.endsWith("." + h));
    const conf = ["low", "medium", "high"].includes(f?.confidence) ? f.confidence : "low";
    return {
      title: clip(String(f?.title ?? ""), 200),
      summary: clip(String(f?.summary ?? ""), 1200),
      source_url: f?.source_url ? String(f.source_url).slice(0, 500) : null,
      source_title: f?.source_title ? clip(String(f.source_title), 200) : null,
      published_date: f?.published_date || null,
      research_date: new Date().toISOString(),
      confidence: ok ? conf : "low",
      business_relevance: clip(String(f?.business_relevance ?? ""), 600),
      opportunity: clip(String(f?.opportunity ?? ""), 600),
      verified: ok,
    };
  });
  return { findings: out };
}

async function buildContext(task: Task, emp: Employee, tools: string[]) {
  const parts: string[] = [];
  const { data: deps } = await db.from("ai_task_dependencies").select("depends_on").eq("task_id", task.id);
  if (deps?.length) {
    const { data: depTasks } = await db.from("ai_tasks").select("code,title,result_summary,result,employee_id")
      .in("id", deps.map((d: any) => d.depends_on));
    parts.push("HASIL TUGAS SEBELUMNYA (dependensi):\n" + (depTasks ?? []).map((d: any) =>
      `### ${d.code} ${d.title}\nRingkasan: ${d.result_summary ?? "-"}\n${clip(d.result, 3500)}`).join("\n\n"));
  }
  if (task.review_notes) parts.push(`CATATAN REVISI DARI AURELIA-01 (wajib ditangani):\n${task.review_notes}\n\nDraf sebelumnya:\n${clip(task.result, 3000)}`);
  if (task.kind === "research") {
    const { data: prev } = await db.from("ai_research_reports").select("title,summary,research_date")
      .eq("category", task.category ?? "").order("created_at", { ascending: false }).limit(6);
    if (prev?.length) {
      parts.push("RISET SEBELUMNYA DI KATEGORI INI (jangan ulangi; cari informasi BARU setelah tanggal ini):\n" +
        prev.map((p: any) => `- [${String(p.research_date).slice(0, 10)}] ${p.title}: ${clip(p.summary, 300)}`).join("\n"));
    }
  }
  if (tools.includes("memory_read")) {
    const { data: mem } = await db.rpc("ai_memory_search", {
      p_query: `${task.title} ${task.description}`, p_scopes: emp.memory_scopes ?? ["company"], p_limit: 5,
    });
    if (mem?.length) parts.push("MEMORI PERUSAHAAN YANG RELEVAN:\n" + mem.map((m: any) =>
      `- (${m.kind}, ${String(m.created_at).slice(0, 10)}) ${m.title}: ${clip(m.content, 500)}`).join("\n"));
  }
  if (tools.includes("ledger_read") && (task.kind === "finance" || emp.department_id === "finance")) {
    parts.push(await ledgerContext());
  }
  return parts.join("\n\n") || "Tidak ada konteks tambahan.";
}

export async function ledgerContext() {
  const since = new Date(); since.setMonth(since.getMonth() - 2); since.setDate(1);
  const { data: tx } = await db.from("ai_transactions").select("*").gte("occurred_on", since.toISOString().slice(0, 10)).order("occurred_on");
  const { data: usage } = await db.from("ai_api_usage").select("provider,model,input_tokens,output_tokens,cost_usd,created_at")
    .gte("created_at", since.toISOString()).limit(5000);
  const agg = new Map<string, { calls: number; tin: number; tout: number; usd: number; unpriced: number }>();
  for (const u of usage ?? []) {
    const k = `${String(u.created_at).slice(0, 7)} ${u.provider}/${u.model}`;
    const a = agg.get(k) ?? { calls: 0, tin: 0, tout: 0, usd: 0, unpriced: 0 };
    a.calls++; a.tin += u.input_tokens; a.tout += u.output_tokens;
    if (u.cost_usd == null) a.unpriced++; else a.usd += Number(u.cost_usd);
    agg.set(k, a);
  }
  const txLines = (tx ?? []).map((t: any) =>
    `${t.occurred_on} | ${t.direction} | ${t.status} | ${t.category} | ${t.currency} ${t.amount} | ${clip(t.description, 80)}`);
  return `DATA LEDGER (sumber: database, 3 bulan terakhir). Status: actual=uang benar-benar masuk/keluar, confirmed=pendapatan pasti belum cair, estimated=perkiraan biaya, forecast=proyeksi.
${txLines.length ? txLines.join("\n") : "BELUM ADA TRANSAKSI TERCATAT."}

PENGGUNAAN API (dari log sistem):
${agg.size ? [...agg.entries()].map(([k, a]) => `${k}: ${a.calls} panggilan, ${a.tin} token input, ${a.tout} token output, biaya $${a.usd.toFixed(4)}${a.unpriced ? ` (+${a.unpriced} panggilan tanpa tarif)` : ""}`).join("\n") : "Belum ada penggunaan API."}`;
}

async function reviewTask(ceo: Employee, settings: Settings, task: Task, emp: Employee, out: any, verifiedCount: number, sourceCount: number) {
  await setEmployee(ceo.id, { status: "reviewing", status_note: `Mereview ${task.code}` });
  try {
    const { result } = await runAs(ceo, settings, {
      system: `${ceo.system_instructions}\n${honesty()}\nKamu sedang melakukan quality control. Balas HANYA JSON.`,
      messages: [{
        role: "user",
        content: `Review hasil kerja ${emp.name} untuk ${task.code}.
Tugas: ${task.title}
Deskripsi: ${task.description}
Ringkasan hasil: ${out.summary ?? "-"}
Hasil:
${clip(out.result_markdown, 7000)}
${task.kind === "research" ? `Sumber dari pencarian web: ${sourceCount}. Temuan dengan sumber terverifikasi: ${verifiedCount}.` : ""}

Minta revisi HANYA bila hasil jelas tidak memenuhi permintaan, ada klaim penting tanpa dasar, atau ada kesalahan fatal.
JSON: {"verdict": "approve" | "revise", "score": 1-10, "notes": "catatan singkat & spesifik"}`,
      }],
      purpose: "review", taskId: task.id, json: true, maxTokens: 800, temperature: 0.2,
    });
    const r = extractJson(result.text);
    if (!r || !["approve", "revise"].includes(r.verdict)) return null;
    return { verdict: r.verdict as string, score: r.score, notes: clip(String(r.notes ?? ""), 1200) };
  } catch (e) {
    await log("ceo", ceo.id, ceo.name, "ai_decision", `Review ${task.code} dilewati`, errMessage(e), task.id);
    return null;
  } finally {
    await setEmployee(ceo.id, { status: "idle", status_note: null });
  }
}

// ---------------------------------------------------------------------------
// Perencanaan directive oleh AURELIA-01
// ---------------------------------------------------------------------------
export async function planDirective(directiveId: string) {
  const settings = await getSettings();
  const employees = await getEmployees();
  const ceo = employees.find((e) => e.is_ceo)!;
  const { data: d } = await db.from("ai_directives").select("*").eq("id", directiveId).single();
  if (!d || d.status !== "planning") return;
  await setEmployee(ceo.id, { status: "thinking", status_note: `Merencanakan ${d.code}` });
  const { data: depts } = await db.from("ai_departments").select("id,name");
  const { data: open } = await db.from("ai_tasks").select("employee_id").in("status", ["queued", "running"]);
  const load = new Map<string, number>();
  for (const t of open ?? []) load.set(t.employee_id, (load.get(t.employee_id) ?? 0) + 1);
  const roster = employees.filter((e) => !e.is_ceo).map((e) =>
    `- employee_id "${e.id}": ${e.name}, ${e.role_title}, departemen ${e.department_id}; keahlian: ${(e.capabilities ?? []).join(", ")}; ` +
    `web_search: ${(e.tool_permissions ?? []).includes("web_search") ? "ya" : "tidak"}; status: ${e.paused ? "DIJEDA" : e.status}; antrean: ${load.get(e.id) ?? 0}`).join("\n");
  const { data: mem } = await db.rpc("ai_memory_search", { p_query: d.objective, p_scopes: ceo.memory_scopes, p_limit: 5 });
  const max = settings.max_tasks_per_directive;

  try {
    const { result } = await runAs(ceo, settings, {
      system: `${ceo.system_instructions}\n${honesty()}\nBalas HANYA dengan satu objek JSON valid.`,
      messages: [{
        role: "user",
        content: `OBJEKTIF FOUNDER (${d.code}, prioritas ${d.priority}):
"${d.objective}"

TIM:
${roster}

DEPARTEMEN: ${(depts ?? []).map((x: any) => `${x.id} (${x.name})`).join(", ")}
${mem?.length ? `MEMORI RELEVAN:\n${mem.map((m: any) => `- ${m.title}: ${clip(m.content, 300)}`).join("\n")}` : ""}

Pecah objektif menjadi 1-${max} tugas yang konkret. Aturan:
- Pilih employee_id dari daftar TIM (bukan AURELIA). Hindari karyawan DIJEDA.
- "depends_on" berisi indeks (mulai 0) tugas SEBELUMNYA yang harus selesai dulu.
- Tugas yang butuh informasi terkini wajib "use_web_search": true dan diberikan ke karyawan dengan web_search: ya.
- Aksi eksternal (publikasi, kirim pesan ke luar, pembelian, transaksi, deploy produksi, hapus data) → "requires_approval": true dan isi "sensitive_reason".
- Jika objektif hanya pertanyaan yang bisa kamu jawab langsung tanpa kerja tim, kembalikan "tasks": [] dan jawab di "reply_to_founder".
- kind salah satu: ${KINDS.join(", ")}. priority salah satu: ${PRIORITIES.join(", ")}.

JSON:
{"analysis": "analisis objektif singkat", "reply_to_founder": "balasan singkat ke Founder", "tasks": [{"title": "", "description": "instruksi jelas + hasil yang diharapkan", "kind": "", "employee_id": "", "priority": "", "depends_on": [], "use_web_search": false, "requires_approval": false, "sensitive_reason": null, "category": null, "region": null}]}`,
      }],
      purpose: "plan", json: true, maxTokens: 4000, temperature: 0.3,
    });
    const plan = extractJson(result.text);
    if (!plan || !Array.isArray(plan.tasks)) throw new Error("AURELIA-01 tidak menghasilkan rencana JSON yang valid");

    const valid = new Set(employees.filter((e) => !e.is_ceo).map((e) => e.id));
    const tasks = plan.tasks.slice(0, max).map((t: any, i: number) => {
      const emp = valid.has(t.employee_id) ? t.employee_id : null;
      if (!emp) throw new Error(`Rencana memakai karyawan tidak dikenal: ${t.employee_id}`);
      const e = employees.find((x) => x.id === emp)!;
      const text = `${t.title ?? ""} ${t.description ?? ""}`;
      const sensitive = !!t.requires_approval || SENSITIVE_RE.test(text);
      return {
        title: clip(String(t.title || `Tugas ${i + 1}`), 280),
        description: clip(String(t.description || ""), 4000),
        kind: KINDS.includes(t.kind) ? t.kind : "analysis",
        employee_id: emp,
        priority: PRIORITIES.includes(t.priority) ? t.priority : d.priority,
        depends_on: (Array.isArray(t.depends_on) ? t.depends_on : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n < i),
        use_web_search: !!t.use_web_search && (e.tool_permissions ?? []).includes("web_search"),
        requires_approval: sensitive,
        sensitive_reason: sensitive ? clip(String(t.sensitive_reason || "Aksi eksternal/sensitif terdeteksi"), 400) : null,
        category: t.category ? clip(String(t.category), 80) : null,
        region: t.region ? clip(String(t.region), 80) : null,
      };
    });

    if (tasks.length) {
      const { error } = await db.rpc("ai_create_plan", { p_directive: d.id, p_tasks: tasks, p_created_by: d.source === "schedule" ? "schedule" : "ceo" });
      if (error) throw error;
    }
    await db.from("ai_directives").update({
      status: tasks.length ? "active" : "completed", analysis: clip(plan.analysis, 4000), reply: clip(plan.reply_to_founder, 4000),
      completed_at: tasks.length ? null : new Date().toISOString(),
    }).eq("id", d.id);
    const replyText = `${plan.reply_to_founder || plan.analysis || "Rencana siap."}${tasks.length
      ? `\n\nAku membuat ${tasks.length} tugas:\n${tasks.map((t: any, i: number) => `${i + 1}. ${t.title} → ${employees.find((e) => e.id === t.employee_id)?.name}${t.requires_approval ? " (butuh persetujuanmu)" : ""}`).join("\n")}`
      : ""}`;
    await db.from("ai_messages").insert({
      thread: "dm:aurelia", sender_kind: "employee", sender_id: ceo.id, content: replyText, meta: { directive_id: d.id },
    });
    await db.from("ai_memory").insert({
      scope: "company", kind: "directive", title: `${d.code}: ${clip(d.objective, 150)}`,
      content: clip(`${d.objective}\n\nAnalisis: ${plan.analysis ?? ""}`, 4000), created_by: "aurelia",
    });
    await log("ceo", ceo.id, ceo.name, "ai_decision", `AURELIA-01 merencanakan ${d.code}: ${tasks.length} tugas`, clip(plan.analysis, 2000));
  } catch (e) {
    const msg = errMessage(e);
    const blocked = e instanceof BlockedError;
    await db.from("ai_directives").update({ status: "failed", error: clip(msg, 1000) }).eq("id", d.id);
    await db.from("ai_messages").insert({
      thread: "dm:aurelia", sender_kind: "system", content: `Perencanaan ${d.code} gagal: ${msg}`, meta: { directive_id: d.id },
    });
    await notify({
      priority: "high", category: blocked ? "provider" : "directive_failed", title: `Perencanaan ${d.code} gagal`, body: msg,
      link: blocked ? "#/api" : "#/ceo", dedupeKey: blocked ? "no-provider" : null,
    });
    await log("ceo", ceo.id, ceo.name, "ai_decision", `Perencanaan ${d.code} gagal`, msg);
  } finally {
    await setEmployee(ceo.id, { status: "idle", status_note: null });
  }
}

// Laporan konsolidasi bila semua tugas dalam directive sudah final.
export async function checkDirective(directiveId: string | null) {
  if (!directiveId) return;
  const { data: d } = await db.from("ai_directives").select("*").eq("id", directiveId).single();
  if (!d || d.status !== "active") return;
  const { data: tasks } = await db.from("ai_tasks").select("code,title,status,result_summary,last_error,employee_id").eq("directive_id", directiveId);
  if (!tasks?.length || tasks.some((t: any) => !TERMINAL.includes(t.status))) return;
  // Klaim agar laporan tidak dibuat dua kali
  const { data: claimed } = await db.from("ai_directives").update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", directiveId).eq("status", "active").select("id");
  if (!claimed?.length) return;

  const settings = await getSettings();
  const employees = await getEmployees();
  const ceo = employees.find((e) => e.is_ceo)!;
  const lines = tasks.map((t: any) => `- ${t.code} [${t.status}] ${t.title} (${employees.find((e) => e.id === t.employee_id)?.name}): ${t.result_summary ?? t.last_error ?? "-"}`).join("\n");
  let report = `Ringkasan ${d.code}:\n${lines}`;
  try {
    const { result } = await runAs(ceo, settings, {
      system: `${ceo.system_instructions}\n${honesty()}`,
      messages: [{ role: "user", content: `Tulis laporan eksekutif singkat (maks 200 kata, markdown) untuk Founder tentang hasil objektif "${d.objective}". Gunakan HANYA data berikut, sebut tugas yang gagal/terblokir dengan jujur, dan beri 1-3 rekomendasi langkah berikutnya.\n\n${lines}` }],
      purpose: "report", maxTokens: 1200, temperature: 0.3,
    });
    if (result.text.trim()) report = result.text.trim();
  } catch (e) {
    report += `\n\n(Laporan otomatis tanpa AI: ${errMessage(e)})`;
  }
  await db.from("ai_directives").update({ report }).eq("id", directiveId);
  await db.from("ai_messages").insert({ thread: "dm:aurelia", sender_kind: "employee", sender_id: ceo.id, content: `Laporan ${d.code} selesai:\n\n${report}`, meta: { directive_id: d.id } });
  await db.from("ai_memory").insert({ scope: "company", kind: "report", title: `Laporan ${d.code}`, content: clip(report, 4000), created_by: "aurelia" });
  const failed = tasks.filter((t: any) => t.status !== "completed").length;
  await notify({
    priority: failed ? "high" : "normal", category: "directive_done", title: `${d.code} selesai${failed ? ` (${failed} tugas bermasalah)` : ""}`,
    body: clip(report.replace(/[#*_>]/g, ""), 300), link: "#/ceo",
  });
}

// ---------------------------------------------------------------------------
// Jadwal harian
// ---------------------------------------------------------------------------
const TOPIC_OWNER: Record<string, string> = {
  "Tren desain": "emp-crd-01", "Digital marketing": "emp-mkt-01", "Content creation": "emp-mkt-01",
};

async function hasProvider() {
  const { count } = await db.from("ai_provider_keys").select("provider", { count: "exact", head: true })
    .eq("status", "connected").eq("enabled", true).not("default_model", "is", null);
  return (count ?? 0) > 0;
}

async function localDayStart(): Promise<string> {
  const { data } = await db.rpc("ai_local_day_start");
  return (data as string) ?? new Date(Date.now() - 86400_000).toISOString();
}

export async function createResearchTasks(settings: Settings, count: number, createdBy = "schedule") {
  const topics: string[] = settings.research_topics ?? [];
  const regions: string[] = settings.research_regions?.length ? settings.research_regions : ["Indonesia", "Internasional"];
  if (!topics.length || count <= 0) return 0;
  const since = new Date(Date.now() - 21 * 86400_000).toISOString();
  const { data: recent } = await db.from("ai_tasks").select("category,region,created_at").eq("kind", "research").gte("created_at", since);
  const last = new Map<string, number>();
  for (const r of recent ?? []) {
    const k = `${r.category}|${r.region}`;
    last.set(k, Math.max(last.get(k) ?? 0, Date.parse(r.created_at)));
  }
  const combos = topics.flatMap((t) => regions.map((r) => ({ t, r, at: last.get(`${t}|${r}`) ?? 0 })));
  combos.sort((a, b) => a.at - b.at || Math.random() - 0.5);
  const chosen: typeof combos = [];
  for (const c of combos) {
    if (chosen.length >= count) break;
    if (chosen.some((x) => x.t === c.t)) continue;
    chosen.push(c);
  }
  const employees = await getEmployees();
  for (const c of chosen) {
    let owner = employees.find((e) => e.id === (TOPIC_OWNER[c.t] ?? "emp-ri-01"));
    if (!owner || owner.paused) owner = employees.find((e) => e.department_id === "research" && !e.paused) ?? owner;
    if (!owner) continue;
    await db.from("ai_tasks").insert({
      title: `Riset ${c.t} — ${c.r}`,
      description: `Cari perkembangan TERBARU (prioritaskan 30 hari terakhir) tentang ${c.t} di pasar ${c.r} yang relevan untuk KANASA STUDIO (studio kreatif: 3D, animasi, game Roblox, produk digital, konten). Sertakan 3-6 temuan dengan sumber, tanggal publikasi bila ada, tingkat keyakinan, relevansi bisnis, dan peluang konkret. Jangan mengulang temuan dari riset sebelumnya.`,
      kind: "research", department_id: owner.department_id, employee_id: owner.id, priority: "medium",
      use_web_search: true, category: c.t, region: c.r, created_by: createdBy,
    });
  }
  return chosen.length;
}

export async function runScheduleAction(action: string, settings: Settings): Promise<{ text: string; skipped?: boolean }> {
  const llmActions = ["briefing", "research", "trends", "assign", "qa", "exec_report"];
  if (llmActions.includes(action) && !settings.autonomy_enabled) return { text: "Dilewati: mode otonom dimatikan Founder", skipped: true };
  if (llmActions.includes(action) && !(await hasProvider())) {
    await notify({
      priority: "high", category: "provider", title: "Jadwal kerja tertunda", body: "Belum ada API AI terhubung, jadwal harian tidak bisa dijalankan.",
      link: "#/api", dedupeKey: "no-provider",
    });
    return { text: "Dilewati: belum ada API provider terhubung", skipped: true };
  }
  const employees = await getEmployees();
  const ceo = employees.find((e) => e.is_ceo)!;
  const d0 = await localDayStart();

  switch (action) {
    case "briefing": {
      const { data: done } = await db.from("ai_tasks").select("code,title,result_summary").eq("status", "completed")
        .gte("completed_at", new Date(Date.now() - 36 * 3600_000).toISOString()).limit(15);
      const { data: openTasks } = await db.from("ai_tasks").select("code,title,status").in("status", ["queued", "running", "blocked", "awaiting_approval"]).limit(20);
      const { data: opps } = await db.from("ai_opportunities").select("title,confidence").eq("status", "new").limit(8);
      const { result } = await runAs(ceo, settings, {
        system: `${ceo.system_instructions}\n${honesty()}`,
        messages: [{ role: "user", content: `Buat briefing pagi singkat (maks 150 kata, markdown) untuk tim dan Founder. Gunakan HANYA data ini.
Objektif harian Founder: ${settings.daily_objective || "(belum diisi)"}
Selesai 36 jam terakhir:\n${(done ?? []).map((t: any) => `- ${t.code} ${t.title}: ${clip(t.result_summary, 150)}`).join("\n") || "- belum ada"}
Tugas terbuka:\n${(openTasks ?? []).map((t: any) => `- ${t.code} [${t.status}] ${t.title}`).join("\n") || "- tidak ada"}
Peluang baru:\n${(opps ?? []).map((o: any) => `- ${o.title} (${o.confidence})`).join("\n") || "- tidak ada"}` }],
        purpose: "report", maxTokens: 900,
      });
      await db.from("ai_messages").insert({ thread: "group", sender_kind: "employee", sender_id: ceo.id, content: result.text.trim(), meta: { briefing: true } });
      await db.from("ai_memory").insert({ scope: "company", kind: "briefing", title: `Briefing ${new Date().toISOString().slice(0, 10)}`, content: clip(result.text, 4000), created_by: "aurelia" });
      if (settings.daily_objective?.trim()) {
        const { data: dir } = await db.from("ai_directives").insert({ objective: settings.daily_objective.trim(), source: "schedule", priority: "medium" }).select("id").single();
        if (dir) await planDirective(dir.id);
        return { text: "Briefing dibuat dan objektif harian direncanakan" };
      }
      return { text: "Briefing dibuat" };
    }
    case "research": {
      const n = await createResearchTasks(settings, settings.research_per_day);
      return { text: `${n} tugas riset dibuat` };
    }
    case "trends": {
      const { data: today } = await db.from("ai_tasks").select("id,status").eq("kind", "research").gte("created_at", d0);
      if (!today?.length) return { text: "Dilewati: tidak ada riset hari ini", skipped: true };
      const lead = employees.find((e) => e.id === "emp-ri-01" && !e.paused) ?? employees.find((e) => e.department_id === "research" && !e.paused);
      if (!lead) return { text: "Dilewati: tim riset dijeda", skipped: true };
      const { data: t } = await db.from("ai_tasks").insert({
        title: "Analisis tren & peluang hari ini",
        description: "Sintesis hasil riset hari ini (lihat dependensi) menjadi 3-5 peluang bisnis yang paling layak untuk KANASA STUDIO. Untuk tiap peluang: alasan, bukti dari riset (sebut sumbernya), perkiraan usaha, dan risiko. Jangan menambah fakta baru tanpa sumber.",
        kind: "analysis", department_id: lead.department_id, employee_id: lead.id, priority: "medium", created_by: "schedule",
      }).select("id").single();
      if (t) await db.from("ai_task_dependencies").insert(today.map((r: any) => ({ task_id: t.id, depends_on: r.id })));
      return { text: "Tugas analisis tren dibuat" };
    }
    case "assign": {
      const { data: opps } = await db.from("ai_opportunities").select("title,description,confidence").eq("status", "new").order("created_at", { ascending: false }).limit(6);
      if (!opps?.length && !settings.daily_objective?.trim()) return { text: "Dilewati: tidak ada peluang baru atau objektif harian", skipped: true };
      const objective = `Penugasan departemen hari ini. Tentukan maksimal 3 tugas internal bernilai tinggi (riset lanjutan, konsep, draf, rencana) berdasarkan ${settings.daily_objective?.trim() ? `objektif harian Founder: "${settings.daily_objective.trim()}" dan ` : ""}peluang berikut:\n${(opps ?? []).map((o: any) => `- ${o.title} (${o.confidence}): ${clip(o.description, 200)}`).join("\n")}`;
      const { data: dir } = await db.from("ai_directives").insert({ objective: clip(objective, 3900), source: "schedule", priority: "medium" }).select("id").single();
      if (dir) await planDirective(dir.id);
      return { text: "Penugasan departemen direncanakan AURELIA-01" };
    }
    case "production":
    case "execution":
      return { text: "Worker memproses antrean tugas secara otomatis" };
    case "break": {
      const until = new Date(Date.now() + settings.rest_minutes * 60_000).toISOString();
      const { data } = await db.from("ai_employees").update({ status: "resting", rest_until: until, status_note: "Istirahat siang" })
        .in("status", ["idle", "completed"]).eq("paused", false).select("id");
      return { text: `${data?.length ?? 0} karyawan istirahat ${settings.rest_minutes} menit` };
    }
    case "finance": {
      const { data: usage } = await db.from("ai_api_usage").select("provider,cost_usd").gte("created_at", d0);
      const byProv = new Map<string, number>();
      for (const u of usage ?? []) if (u.cost_usd != null) byProv.set(u.provider, (byProv.get(u.provider) ?? 0) + Number(u.cost_usd));
      const date = new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone });
      for (const [p, usd] of byProv) {
        await db.from("ai_transactions").upsert({
          direction: "expense", status: "estimated", category: "api", amount: Math.round(usd * 10000) / 10000, currency: "USD",
          occurred_on: date, description: `Estimasi biaya API ${p} (dihitung dari token × tarif yang Founder isi; bukan tagihan resmi)`,
          source: "api_usage", source_key: `api:${date}:${p}`,
        }, { onConflict: "source_key" });
      }
      const total = [...byProv.values()].reduce((a, b) => a + b, 0);
      if (total >= Number(settings.global_daily_usd_limit) * 0.8) {
        await notify({
          priority: "high", category: "finance_anomaly", title: "Biaya API mendekati batas harian",
          body: `Estimasi biaya hari ini $${total.toFixed(4)} dari batas $${settings.global_daily_usd_limit}.`, link: "#/keuangan",
          dedupeKey: `api-near-limit:${date}`,
        });
      }
      return { text: `Estimasi biaya API dicatat ($${total.toFixed(4)}, ${(usage ?? []).length} panggilan)` };
    }
    case "qa": {
      const { data: done } = await db.from("ai_tasks").select("code,title,result_summary,kind").eq("status", "completed")
        .in("kind", ["code", "design", "writing", "marketing"]).gte("completed_at", d0).limit(8);
      if (!done?.length) return { text: "Dilewati: tidak ada deliverable kode/desain/konten hari ini", skipped: true };
      const qa = employees.find((e) => e.id === "emp-swe-02" && !e.paused);
      if (!qa) return { text: "Dilewati: QA dijeda", skipped: true };
      await db.from("ai_tasks").insert({
        title: "Quality assurance deliverable hari ini",
        description: `Review deliverable berikut dan susun daftar temuan (tingkat keparahan, perbaikan yang disarankan):\n${done.map((t: any) => `- ${t.code} (${t.kind}) ${t.title}: ${clip(t.result_summary, 200)}`).join("\n")}`,
        kind: "qa", department_id: qa.department_id, employee_id: qa.id, priority: "medium", created_by: "schedule",
      });
      return { text: `Tugas QA dibuat untuk ${done.length} deliverable` };
    }
    case "exec_report": {
      const { data: done } = await db.from("ai_tasks").select("code,title,result_summary,employee_id").eq("status", "completed").gte("completed_at", d0).limit(25);
      const { data: failed } = await db.from("ai_tasks").select("code,title,last_error").in("status", ["failed", "blocked"]).gte("updated_at", d0).limit(10);
      const { count: pending } = await db.from("ai_approvals").select("id", { count: "exact", head: true }).eq("status", "pending");
      if (!done?.length && !failed?.length) {
        const text = "Belum ada pekerjaan yang selesai atau gagal hari ini.";
        await db.from("ai_messages").insert({ thread: "group", sender_kind: "employee", sender_id: ceo.id, content: text, meta: { exec_report: true } });
        return { text };
      }
      const { result } = await runAs(ceo, settings, {
        system: `${ceo.system_instructions}\n${honesty()}`,
        messages: [{ role: "user", content: `Tulis laporan eksekutif harian (maks 220 kata, markdown) HANYA dari data ini.
Selesai:\n${(done ?? []).map((t: any) => `- ${t.code} ${t.title} (${employees.find((e) => e.id === t.employee_id)?.name}): ${clip(t.result_summary, 200)}`).join("\n") || "- tidak ada"}
Gagal/terblokir:\n${(failed ?? []).map((t: any) => `- ${t.code} ${t.title}: ${clip(t.last_error, 150)}`).join("\n") || "- tidak ada"}
Menunggu persetujuan Founder: ${pending ?? 0}` }],
        purpose: "report", maxTokens: 1000,
      });
      await db.from("ai_messages").insert({ thread: "group", sender_kind: "employee", sender_id: ceo.id, content: result.text.trim(), meta: { exec_report: true } });
      await db.from("ai_memory").insert({ scope: "company", kind: "report", title: `Laporan eksekutif ${new Date().toISOString().slice(0, 10)}`, content: clip(result.text, 4000), created_by: "aurelia" });
      return { text: "Laporan eksekutif dibuat" };
    }
    case "founder_summary": {
      const { data: dash } = await db.from("ai_tasks").select("status").gte("updated_at", d0);
      const c = (s: string) => (dash ?? []).filter((t: any) => t.status === s).length;
      const { data: lastReport } = await db.from("ai_messages").select("content").eq("thread", "group").eq("sender_id", ceo.id)
        .gte("created_at", d0).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { count: pending } = await db.from("ai_approvals").select("id", { count: "exact", head: true }).eq("status", "pending");
      const body = `Hari ini: ${c("completed")} selesai, ${c("failed")} gagal, ${c("queued") + c("running")} berjalan, ${pending ?? 0} menunggu persetujuanmu.` +
        (lastReport?.content ? ` ${clip(lastReport.content.replace(/[#*_>]/g, ""), 220)}` : "");
      await notify({ priority: "normal", category: "daily_summary", title: "Ringkasan harian KANASA STUDIO", body, link: "#/dashboard" });
      return { text: "Ringkasan harian dikirim" };
    }
  }
  return { text: `Aksi tidak dikenal: ${action}`, skipped: true };
}

// Mulai kerja pertama kali setelah API terhubung.
export async function kickoff() {
  const settings = await getSettings();
  if (settings.kickoff_done) return;
  await db.from("ai_settings").update({ kickoff_done: true }).eq("id", true);
  const employees = await getEmployees();
  const ceo = employees.find((e) => e.is_ceo)!;
  const n = await createResearchTasks(settings, Math.max(1, Math.min(2, settings.research_per_day || 2)), "ceo");
  await db.from("ai_messages").insert({
    thread: "group", sender_kind: "employee", sender_id: ceo.id,
    content: `API sudah terhubung, Founder. Aku memulai siklus kerja pertama: ${n} tugas riset pasar dikirim ke tim. Jadwal harian (07:00–18:00 WIB) akan berjalan otomatis setiap hari kerja.`,
    meta: { kickoff: true },
  });
  await log("ceo", ceo.id, ceo.name, "ai_decision", `Kickoff: ${n} tugas riset pertama dibuat`);
}
