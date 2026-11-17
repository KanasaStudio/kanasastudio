-- KANASA STUDIO — Autonomous AI Company
-- Semua objek memakai awalan ai_ agar terpisah dari tabel website di project yang sama.
-- Akses data hanya untuk Founder (akun owner website, lihat public.is_owner()).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helper akses
-- ---------------------------------------------------------------------------
create or replace function public.ai_is_founder() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_owner(), false);
$$;
grant execute on function public.ai_is_founder() to authenticated;

create or replace function public.ai_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- Pengaturan perusahaan (satu baris)
-- ---------------------------------------------------------------------------
create table public.ai_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'KANASA STUDIO',
  timezone text not null default 'Asia/Jakarta',
  autonomy_enabled boolean not null default true,
  emergency_stop boolean not null default false,
  schedule_paused boolean not null default false,
  weekend_enabled boolean not null default false,
  ceo_review_enabled boolean not null default true,
  max_parallel_tasks int not null default 2 check (max_parallel_tasks between 1 and 4),
  max_task_attempts int not null default 2 check (max_task_attempts between 1 and 5),
  max_revisions int not null default 1 check (max_revisions between 0 and 3),
  max_tasks_per_directive int not null default 6 check (max_tasks_per_directive between 1 and 12),
  task_timeout_minutes int not null default 6 check (task_timeout_minutes between 2 and 30),
  global_daily_token_limit bigint not null default 1500000,
  global_daily_usd_limit numeric(12,4) not null default 3,
  daily_objective text not null default '',
  research_topics text[] not null default array[
    'Pengembangan AI','3D modeling','Animasi','Game development','Produk digital',
    'Software kreatif','Tren desain','Content creation','Digital marketing','Teknologi baru'],
  research_regions text[] not null default array['Indonesia','Internasional'],
  research_per_day int not null default 2 check (research_per_day between 0 and 6),
  rest_minutes int not null default 45 check (rest_minutes between 5 and 180),
  usd_to_idr numeric(12,2),
  default_provider text check (default_provider in ('gemini','anthropic','openai')),
  push_critical boolean not null default true,
  push_high boolean not null default true,
  push_normal boolean not null default false,
  kickoff_done boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.ai_settings default values;
create trigger ai_settings_touch before update on public.ai_settings for each row execute function public.ai_touch();

-- ---------------------------------------------------------------------------
-- Provider API (kunci disimpan di Supabase Vault, tabel ini hanya metadata)
-- ---------------------------------------------------------------------------
create table public.ai_provider_keys (
  provider text primary key check (provider in ('gemini','anthropic','openai')),
  masked text not null,
  status text not null default 'untested' check (status in ('connected','error','untested')),
  last_error text,
  last_tested_at timestamptz,
  models jsonb not null default '[]',
  default_model text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ai_provider_keys_touch before update on public.ai_provider_keys for each row execute function public.ai_touch();

create table public.ai_model_prices (
  provider text not null check (provider in ('gemini','anthropic','openai')),
  model text not null,
  input_per_mtok numeric(12,4) not null check (input_per_mtok >= 0),
  output_per_mtok numeric(12,4) not null check (output_per_mtok >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, model)
);

-- Vault helpers: hanya service_role (edge function) yang boleh memanggil.
create or replace function public.ai_vault_put(p_name text, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_secret, p_name, 'Kanasa AI secret');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end $$;

create or replace function public.ai_vault_get(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

create or replace function public.ai_vault_delete(p_name text) returns void
language sql security definer set search_path = '' as $$
  delete from vault.secrets where name = p_name;
$$;

revoke all on function public.ai_vault_put(text, text) from public, anon, authenticated;
revoke all on function public.ai_vault_get(text) from public, anon, authenticated;
revoke all on function public.ai_vault_delete(text) from public, anon, authenticated;
grant execute on function public.ai_vault_put(text, text) to service_role;
grant execute on function public.ai_vault_get(text) to service_role;
grant execute on function public.ai_vault_delete(text) to service_role;

-- ---------------------------------------------------------------------------
-- Departemen & karyawan AI
-- ---------------------------------------------------------------------------
create table public.ai_departments (
  id text primary key,
  name text not null,
  short_name text not null,
  code text not null unique,
  mission text not null,
  color text not null,
  clearance text not null,
  default_tools text[] not null default '{}',
  responsibilities text[] not null default '{}',
  monthly_usd_budget numeric(12,2),
  sort int not null default 0
);

create table public.ai_employees (
  id text primary key,
  code text not null unique,
  name text not null,
  role_title text not null,
  department_id text references public.ai_departments(id),
  is_ceo boolean not null default false,
  job_description text not null,
  system_instructions text not null,
  capabilities text[] not null default '{}',
  provider text check (provider in ('gemini','anthropic','openai')),
  model text,
  temperature numeric(3,2) not null default 0.4 check (temperature between 0 and 1.5),
  max_output_tokens int not null default 4096 check (max_output_tokens between 256 and 32000),
  context_messages int not null default 12 check (context_messages between 2 and 40),
  memory_scopes text[] not null default array['company'],
  tool_permissions text[] not null default '{}',
  daily_token_budget int not null default 250000,
  daily_usd_budget numeric(10,4) not null default 1,
  max_steps int not null default 3 check (max_steps between 1 and 6),
  status text not null default 'idle'
    check (status in ('idle','working','researching','thinking','meeting','resting','reviewing','completed','failed','paused')),
  paused boolean not null default false,
  rest_until timestamptz,
  current_task_id uuid,
  status_note text,
  appearance jsonb not null default '{}',
  last_active_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ai_employees_touch before update on public.ai_employees for each row execute function public.ai_touch();
create or replace function public.ai_employee_status_ts() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then new.status_changed_at = now(); end if;
  return new;
end $$;
create trigger ai_employees_status_ts before update on public.ai_employees for each row execute function public.ai_employee_status_ts();

-- ---------------------------------------------------------------------------
-- Directive Founder → AURELIA-01, tugas, dependensi, percobaan eksekusi
-- ---------------------------------------------------------------------------
create sequence public.ai_directive_seq start 1;
create table public.ai_directives (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DIR-' || lpad(nextval('public.ai_directive_seq')::text, 3, '0')),
  objective text not null check (length(objective) between 3 and 4000),
  source text not null default 'founder' check (source in ('founder','schedule','chat')),
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  status text not null default 'planning' check (status in ('planning','active','completed','failed','cancelled')),
  analysis text,
  reply text,
  report text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create sequence public.ai_task_seq start 101;
create table public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('TSK-' || nextval('public.ai_task_seq')::text),
  title text not null check (length(title) between 3 and 300),
  description text not null default '',
  kind text not null default 'analysis'
    check (kind in ('research','analysis','writing','code','design','marketing','finance','operations','qa','report')),
  department_id text references public.ai_departments(id),
  employee_id text not null references public.ai_employees(id),
  directive_id uuid references public.ai_directives(id) on delete set null,
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  status text not null default 'queued'
    check (status in ('queued','running','awaiting_approval','completed','failed','blocked','cancelled')),
  progress int not null default 0 check (progress between 0 and 100),
  requires_approval boolean not null default false,
  sensitive_reason text,
  approval_status text not null default 'not_required'
    check (approval_status in ('not_required','pending','approved','rejected')),
  use_web_search boolean not null default false,
  category text,
  region text,
  result text,
  result_summary text,
  sources jsonb not null default '[]',
  review_notes text,
  revision_count int not null default 0,
  attempts int not null default 0,
  last_error text,
  not_before timestamptz not null default now(),
  due_at timestamptz,
  created_by text not null default 'founder' check (created_by in ('founder','ceo','schedule','chat')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_tasks_status_idx on public.ai_tasks (status, not_before);
create index ai_tasks_employee_idx on public.ai_tasks (employee_id, status);
create index ai_tasks_directive_idx on public.ai_tasks (directive_id);
create index ai_tasks_created_idx on public.ai_tasks (created_at desc);
create trigger ai_tasks_touch before update on public.ai_tasks for each row execute function public.ai_touch();

alter table public.ai_employees
  add constraint ai_employees_current_task_fk foreign key (current_task_id) references public.ai_tasks(id) on delete set null;

create table public.ai_task_dependencies (
  task_id uuid not null references public.ai_tasks(id) on delete cascade,
  depends_on uuid not null references public.ai_tasks(id) on delete cascade,
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);
create index ai_task_dependencies_dep_idx on public.ai_task_dependencies (depends_on);

create table public.ai_task_attempts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.ai_tasks(id) on delete cascade,
  directive_id uuid references public.ai_directives(id) on delete cascade,
  employee_id text references public.ai_employees(id),
  step text not null check (step in ('execute','review','plan','report')),
  provider text,
  model text,
  status text not null default 'running' check (status in ('running','succeeded','failed','timeout')),
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12,6),
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_task_attempts_task_idx on public.ai_task_attempts (task_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Pesan (chat Founder ↔ karyawan, rapat grup, pesan internal antarkaryawan)
-- ---------------------------------------------------------------------------
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread text not null,
  sender_kind text not null check (sender_kind in ('founder','employee','system')),
  sender_id text,
  recipient_id text,
  content text not null,
  task_id uuid references public.ai_tasks(id) on delete set null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index ai_messages_thread_idx on public.ai_messages (thread, created_at desc);

-- ---------------------------------------------------------------------------
-- Riset & peluang pasar
-- ---------------------------------------------------------------------------
create table public.ai_research_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.ai_tasks(id) on delete set null,
  employee_id text references public.ai_employees(id),
  title text not null,
  category text,
  region text,
  summary text not null,
  body text,
  findings jsonb not null default '[]',
  sources jsonb not null default '[]',
  verified_sources boolean not null default false,
  research_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index ai_research_reports_cat_idx on public.ai_research_reports (category, created_at desc);

create table public.ai_opportunities (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.ai_research_reports(id) on delete cascade,
  task_id uuid references public.ai_tasks(id) on delete set null,
  title text not null,
  description text not null,
  category text,
  region text,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  relevance text,
  source_url text,
  status text not null default 'new' check (status in ('new','reviewing','pursuing','dismissed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Keuangan
-- ---------------------------------------------------------------------------
create table public.ai_transactions (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('revenue','expense')),
  status text not null check (status in ('actual','confirmed','estimated','forecast')),
  category text not null default 'lainnya',
  amount numeric(16,2) not null check (amount >= 0),
  currency text not null default 'IDR' check (currency in ('IDR','USD')),
  occurred_on date not null default current_date,
  description text not null default '',
  department_id text references public.ai_departments(id),
  source text not null default 'manual' check (source in ('manual','api_usage')),
  source_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (direction = 'expense' and status in ('confirmed','forecast'))),
  check (not (direction = 'revenue' and status = 'estimated'))
);
create index ai_transactions_date_idx on public.ai_transactions (occurred_on desc);
create trigger ai_transactions_touch before update on public.ai_transactions for each row execute function public.ai_touch();

create table public.ai_api_usage (
  id bigserial primary key,
  provider text not null,
  model text not null,
  employee_id text references public.ai_employees(id),
  task_id uuid references public.ai_tasks(id) on delete set null,
  purpose text not null check (purpose in ('execute','review','plan','chat','report','test')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  web_searches int not null default 0,
  cost_usd numeric(12,6),
  created_at timestamptz not null default now()
);
create index ai_api_usage_created_idx on public.ai_api_usage (created_at desc);
create index ai_api_usage_employee_idx on public.ai_api_usage (employee_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Memori perusahaan (full-text search)
-- ---------------------------------------------------------------------------
create table public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'company',
  kind text not null default 'note'
    check (kind in ('directive','report','decision','lesson','strategy','conversation','project','finance','note','briefing')),
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  task_id uuid references public.ai_tasks(id) on delete set null,
  employee_id text references public.ai_employees(id),
  created_by text not null default 'system',
  fts tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))) stored,
  created_at timestamptz not null default now()
);
create index ai_memory_fts_idx on public.ai_memory using gin (fts);
create index ai_memory_scope_idx on public.ai_memory (scope, created_at desc);

create or replace function public.ai_memory_search(p_query text, p_scopes text[], p_limit int default 6)
returns table (id uuid, scope text, kind text, title text, content text, created_at timestamptz, rank real)
language sql stable security definer set search_path = '' as $$
  with q as (
    select to_tsquery('simple', string_agg(w || ':*', ' | ')) as tsq
    from (select distinct lower(w) as w
          from regexp_split_to_table(coalesce(p_query, ''), '[^[:alnum:]]+') w
          where length(w) >= 4 limit 12) s
  )
  select m.id, m.scope, m.kind, m.title, left(m.content, 1500), m.created_at, ts_rank(m.fts, q.tsq)
  from public.ai_memory m, q
  where q.tsq is not null and m.fts @@ q.tsq and m.scope = any(p_scopes)
  order by ts_rank(m.fts, q.tsq) desc, m.created_at desc
  limit greatest(1, least(p_limit, 20));
$$;
revoke all on function public.ai_memory_search(text, text[], int) from public, anon;
grant execute on function public.ai_memory_search(text, text[], int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Notifikasi & push
-- ---------------------------------------------------------------------------
create table public.ai_notifications (
  id uuid primary key default gen_random_uuid(),
  priority text not null check (priority in ('critical','high','normal')),
  category text not null,
  title text not null,
  body text not null,
  employee_id text references public.ai_employees(id),
  task_id uuid references public.ai_tasks(id) on delete set null,
  link text,
  dedupe_key text,
  occurrences int not null default 1,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ai_notifications_dedupe_open on public.ai_notifications (dedupe_key) where read_at is null and dedupe_key is not null;
create index ai_notifications_created_idx on public.ai_notifications (created_at desc);
create trigger ai_notifications_touch before update on public.ai_notifications for each row execute function public.ai_touch();

create table public.ai_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Persetujuan Founder
-- ---------------------------------------------------------------------------
create table public.ai_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ai_tasks(id) on delete cascade,
  action text not null,
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index ai_approvals_status_idx on public.ai_approvals (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Log aktivitas (immutable)
-- ---------------------------------------------------------------------------
create table public.ai_activity_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_kind text not null check (actor_kind in ('founder','ceo','employee','system')),
  actor_id text,
  actor_name text not null,
  department_id text,
  category text not null check (category in
    ('task_assignment','ai_decision','execution_result','human_approval','system_audit','schedule','security','finance','chat')),
  summary text not null,
  details text,
  task_id uuid
);
create index ai_activity_logs_created_idx on public.ai_activity_logs (created_at desc);
create or replace function public.ai_logs_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'ai_activity_logs bersifat immutable'; end $$;
create trigger ai_activity_logs_no_update before update or delete on public.ai_activity_logs
  for each row execute function public.ai_logs_immutable();

create or replace function public.ai_log(p_actor_kind text, p_actor_id text, p_actor_name text, p_category text,
  p_summary text, p_details text default null, p_task_id uuid default null, p_department_id text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.ai_activity_logs (actor_kind, actor_id, actor_name, category, summary, details, task_id, department_id)
  values (p_actor_kind, p_actor_id, p_actor_name, p_category, left(p_summary, 500), left(p_details, 4000), p_task_id, p_department_id);
$$;
revoke all on function public.ai_log(text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.ai_log(text, text, text, text, text, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Jadwal harian
-- ---------------------------------------------------------------------------
create table public.ai_schedule (
  id serial primary key,
  time_local time not null,
  title text not null,
  action text not null check (action in
    ('briefing','research','trends','assign','production','break','execution','finance','qa','exec_report','founder_summary')),
  enabled boolean not null default true,
  run_on_weekend boolean not null default false
);

create table public.ai_jobs (
  id bigserial primary key,
  schedule_id int references public.ai_schedule(id) on delete set null,
  action text not null,
  run_date date not null,
  status text not null default 'running' check (status in ('running','done','skipped','failed')),
  detail text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (schedule_id, run_date)
);
create index ai_jobs_started_idx on public.ai_jobs (started_at desc);
