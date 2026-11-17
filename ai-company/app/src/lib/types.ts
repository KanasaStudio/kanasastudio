export type Provider = "gemini" | "anthropic" | "openai";
export type EmployeeStatus =
  | "idle" | "working" | "researching" | "thinking" | "meeting" | "resting" | "reviewing" | "completed" | "failed" | "paused";
export type TaskStatus = "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "blocked" | "cancelled";
export type Priority = "critical" | "high" | "medium" | "low";
export type TaskKind = "research" | "analysis" | "writing" | "code" | "design" | "marketing" | "finance" | "operations" | "qa" | "report";

export interface Appearance {
  style?: "robot";
  skin?: string;
  hair?: string;
  hairStyle?: "messy" | "bun" | "spiky" | "ponytail" | "short" | "cap";
  outfit?: string;
  accent?: string;
  accessory?: string[];
}

export interface Department {
  id: string; name: string; short_name: string; code: string; mission: string; color: string; clearance: string;
  default_tools: string[]; responsibilities: string[]; monthly_usd_budget: number | null; sort: number;
}

export interface Employee {
  id: string; code: string; name: string; role_title: string; department_id: string | null; is_ceo: boolean;
  job_description: string; system_instructions: string; capabilities: string[];
  provider: Provider | null; model: string | null; temperature: number; max_output_tokens: number; context_messages: number;
  memory_scopes: string[]; tool_permissions: string[]; daily_token_budget: number; daily_usd_budget: number; max_steps: number;
  status: EmployeeStatus; paused: boolean; rest_until: string | null; current_task_id: string | null; status_note: string | null;
  appearance: Appearance; last_active_at: string | null; status_changed_at: string;
}

export interface Source { url: string; title?: string; published?: string | null }

export interface Task {
  id: string; code: string; title: string; description: string; kind: TaskKind; department_id: string | null; employee_id: string;
  directive_id: string | null; priority: Priority; status: TaskStatus; progress: number; requires_approval: boolean;
  sensitive_reason: string | null; approval_status: "not_required" | "pending" | "approved" | "rejected"; use_web_search: boolean;
  category: string | null; region: string | null; result: string | null; result_summary: string | null; sources: Source[];
  review_notes: string | null; revision_count: number; attempts: number; last_error: string | null; not_before: string;
  due_at: string | null; created_by: string; started_at: string | null; completed_at: string | null; created_at: string; updated_at: string;
}

export interface Directive {
  id: string; code: string; objective: string; source: string; priority: Priority;
  status: "planning" | "active" | "completed" | "failed" | "cancelled";
  analysis: string | null; reply: string | null; report: string | null; error: string | null; created_at: string; completed_at: string | null;
}

export interface Notification {
  id: string; priority: "critical" | "high" | "normal"; category: string; title: string; body: string;
  employee_id: string | null; task_id: string | null; link: string | null; occurrences: number; read_at: string | null; created_at: string;
}

export interface Approval {
  id: string; task_id: string; action: string; reason: string; details: string | null;
  status: "pending" | "approved" | "rejected"; decision_note: string | null; decided_at: string | null; created_at: string;
}

export interface Message {
  id: string; thread: string; sender_kind: "founder" | "employee" | "system"; sender_id: string | null; recipient_id: string | null;
  content: string; task_id: string | null; meta: Record<string, any>; created_at: string;
}

export interface ProviderKey {
  provider: Provider; masked: string; status: "connected" | "error" | "untested"; last_error: string | null; last_tested_at: string | null;
  models: { id: string; label: string }[]; default_model: string | null; enabled: boolean; updated_at: string;
}

export interface Settings {
  company_name: string; timezone: string; autonomy_enabled: boolean; emergency_stop: boolean; schedule_paused: boolean;
  weekend_enabled: boolean; ceo_review_enabled: boolean; max_parallel_tasks: number; max_task_attempts: number; max_revisions: number;
  max_tasks_per_directive: number; task_timeout_minutes: number; global_daily_token_limit: number; global_daily_usd_limit: number;
  daily_objective: string; research_topics: string[]; research_regions: string[]; research_per_day: number; rest_minutes: number;
  usd_to_idr: number | null; default_provider: Provider | null; push_critical: boolean; push_high: boolean; push_normal: boolean;
  kickoff_done: boolean;
}

export interface Dashboard {
  employees: { total: number; working: number; idle: number; resting: number; paused: number; failed: number };
  tasks: { active: number; running: number; completed: number; completed_today: number; failed: number; failed_today: number; blocked: number; awaiting_approval: number };
  approvals_pending: number;
  finance: { revenue_actual_idr: number; expense_actual_idr: number; revenue_actual_usd: number; expense_actual_usd: number };
  api: { tokens_today: number; usd_today: number; usd_month: number; calls_month: number; unpriced_calls_month: number };
  research_today: number; opportunities_new: number; unread: number; providers_connected: number;
}
