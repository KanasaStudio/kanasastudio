-- RLS, RPC Founder, RPC engine, realtime, dan seed data.

-- ---------------------------------------------------------------------------
-- RLS: semua tabel ai_ hanya untuk Founder. Engine memakai service_role (bypass RLS).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ai_settings','ai_provider_keys','ai_model_prices','ai_departments','ai_employees',
    'ai_directives','ai_tasks','ai_task_dependencies','ai_task_attempts','ai_messages','ai_research_reports',
    'ai_opportunities','ai_transactions','ai_api_usage','ai_memory','ai_notifications','ai_push_subscriptions',
    'ai_approvals','ai_activity_logs','ai_schedule','ai_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ai_is_founder())', t || '_founder_read', t);
  end loop;
end $$;

-- Tabel yang boleh diubah langsung oleh Founder
create policy ai_settings_founder_update on public.ai_settings for update to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());
create policy ai_departments_founder_update on public.ai_departments for update to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());
create policy ai_employees_founder_update on public.ai_employees for update to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());
create policy ai_model_prices_founder_all on public.ai_model_prices for all to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());
create policy ai_opportunities_founder_update on public.ai_opportunities for update to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());
create policy ai_transactions_founder_all on public.ai_transactions for all to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());
create policy ai_memory_founder_insert on public.ai_memory for insert to authenticated
  with check (public.ai_is_founder());
create policy ai_memory_founder_delete on public.ai_memory for delete to authenticated
  using (public.ai_is_founder());
create policy ai_notifications_founder_update on public.ai_notifications for update to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());
create policy ai_notifications_founder_delete on public.ai_notifications for delete to authenticated
  using (public.ai_is_founder());
create policy ai_push_founder_all on public.ai_push_subscriptions for all to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());
create policy ai_schedule_founder_all on public.ai_schedule for all to authenticated
  using (public.ai_is_founder()) with check (public.ai_is_founder());

-- ---------------------------------------------------------------------------
-- Helper waktu lokal perusahaan
-- ---------------------------------------------------------------------------
create or replace function public.ai_local_now() returns timestamp
language sql stable security definer set search_path = '' as $$
  select now() at time zone (select timezone from public.ai_settings limit 1);
$$;

create or replace function public.ai_local_day_start() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (date_trunc('day', now() at time zone s.timezone)) at time zone s.timezone from public.ai_settings s limit 1;
$$;

-- ---------------------------------------------------------------------------
-- RPC Founder
-- ---------------------------------------------------------------------------
create or replace function public.ai_require_founder() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ai_is_founder() then raise exception 'Hanya Founder yang boleh melakukan aksi ini' using errcode = '42501'; end if;
end $$;

create or replace function public.ai_assign_task(p_employee text, p_title text, p_description text,
  p_kind text default 'analysis', p_priority text default 'medium', p_web boolean default false,
  p_requires_approval boolean default false, p_due timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.ai_employees; v_id uuid;
begin
  perform public.ai_require_founder();
  select * into e from public.ai_employees where id = p_employee;
  if e.id is null then raise exception 'Karyawan tidak ditemukan'; end if;
  insert into public.ai_tasks (title, description, kind, department_id, employee_id, priority, use_web_search,
    requires_approval, sensitive_reason, approval_status, due_at, created_by)
  values (left(p_title, 300), coalesce(p_description, ''), p_kind, e.department_id, e.id, p_priority, p_web,
    p_requires_approval, case when p_requires_approval then 'Ditandai Founder perlu persetujuan' end,
    case when p_requires_approval then 'pending' else 'not_required' end, p_due, 'founder')
  returning id into v_id;
  insert into public.ai_activity_logs (actor_kind, actor_id, actor_name, category, summary, task_id, department_id)
  values ('founder', 'founder', 'Founder', 'task_assignment', 'Founder menugaskan "' || left(p_title, 120) || '" ke ' || e.name, v_id, e.department_id);
  return v_id;
end $$;

create or replace function public.ai_task_action(p_task uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.ai_tasks;
begin
  perform public.ai_require_founder();
  select * into t from public.ai_tasks where id = p_task for update;
  if t.id is null then raise exception 'Tugas tidak ditemukan'; end if;
  if p_action = 'cancel' then
    if t.status in ('completed','cancelled') then raise exception 'Tugas sudah selesai/dibatalkan'; end if;
    update public.ai_tasks set status = 'cancelled', last_error = coalesce(last_error, 'Dibatalkan Founder') where id = t.id;
    update public.ai_employees set current_task_id = null, status = case when status in ('working','researching','thinking') then 'idle' else status end
      where current_task_id = t.id;
    update public.ai_approvals set status = 'rejected', decision_note = 'Tugas dibatalkan', decided_at = now()
      where task_id = t.id and status = 'pending';
  elsif p_action = 'retry' then
    if t.status not in ('failed','blocked','cancelled') then raise exception 'Hanya tugas gagal/terblokir/dibatalkan yang bisa diulang'; end if;
    update public.ai_tasks set status = 'queued', attempts = 0, last_error = null, not_before = now(), progress = 0,
      approval_status = case when requires_approval then 'pending' else 'not_required' end where id = t.id;
  else
    raise exception 'Aksi tidak dikenal';
  end if;
  insert into public.ai_activity_logs (actor_kind, actor_id, actor_name, category, summary, task_id)
  values ('founder', 'founder', 'Founder', 'task_assignment', 'Founder: ' || p_action || ' ' || t.code, t.id);
end $$;

create or replace function public.ai_decide_approval(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.ai_approvals; t public.ai_tasks;
begin
  perform public.ai_require_founder();
  select * into a from public.ai_approvals where id = p_id for update;
  if a.id is null or a.status <> 'pending' then raise exception 'Permintaan persetujuan tidak aktif'; end if;
  select * into t from public.ai_tasks where id = a.task_id for update;
  update public.ai_approvals set status = case when p_approve then 'approved' else 'rejected' end,
    decision_note = p_note, decided_at = now() where id = a.id;
  if p_approve then
    update public.ai_tasks set approval_status = 'approved', status = 'completed', progress = 100, completed_at = now(),
      result = coalesce(result, '') || E'\n\n---\n**Disetujui Founder** ' || to_char(now() at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI') || ' WIB.'
        || coalesce(E'\nCatatan: ' || p_note, '')
        || E'\n\n_Aksi eksternal (publikasi, pengiriman, pembelian, deploy) tidak dijalankan otomatis karena belum ada tool eksternal yang terhubung. Jalankan secara manual memakai draf di atas._'
      where id = t.id;
  else
    update public.ai_tasks set approval_status = 'rejected', status = 'cancelled',
      last_error = 'Ditolak Founder' || coalesce(': ' || p_note, '') where id = t.id;
  end if;
  update public.ai_employees set status = 'idle', current_task_id = null where current_task_id = t.id;
  update public.ai_notifications set read_at = now() where task_id = t.id and category = 'approval' and read_at is null;
  insert into public.ai_activity_logs (actor_kind, actor_id, actor_name, category, summary, details, task_id)
  values ('founder', 'founder', 'Founder', 'human_approval',
    (case when p_approve then 'Menyetujui ' else 'Menolak ' end) || t.code || ': ' || left(t.title, 120), p_note, t.id);
end $$;

create or replace function public.ai_employee_pause(p_employee text, p_paused boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.ai_employees;
begin
  perform public.ai_require_founder();
  update public.ai_employees set paused = p_paused,
    status = case when p_paused then 'paused' when status = 'paused' then 'idle' else status end,
    status_note = case when p_paused then 'Dijeda oleh Founder' else null end
  where id = p_employee returning * into e;
  if e.id is null then raise exception 'Karyawan tidak ditemukan'; end if;
  insert into public.ai_activity_logs (actor_kind, actor_id, actor_name, category, summary, department_id)
  values ('founder', 'founder', 'Founder', 'system_audit', (case when p_paused then 'Menjeda ' else 'Melanjutkan ' end) || e.name, e.department_id);
end $$;

create or replace function public.ai_set_emergency(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ai_require_founder();
  update public.ai_settings set emergency_stop = p_on;
  if p_on then
    update public.ai_tasks set status = 'queued', not_before = now() + interval '1 minute', progress = 0,
      last_error = 'Dihentikan oleh Emergency Stop' where status = 'running';
    update public.ai_employees set status = 'idle', current_task_id = null, status_note = 'Emergency stop aktif'
      where status in ('working','researching','thinking','reviewing','meeting');
  else
    update public.ai_employees set status_note = null where status_note = 'Emergency stop aktif';
  end if;
  insert into public.ai_activity_logs (actor_kind, actor_id, actor_name, category, summary)
  values ('founder', 'founder', 'Founder', 'security', case when p_on then 'EMERGENCY STOP diaktifkan' else 'Emergency stop dimatikan' end);
end $$;

create or replace function public.ai_office_break(p_minutes int default 15) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.ai_require_founder();
  update public.ai_employees set status = 'resting', rest_until = now() + make_interval(mins => greatest(5, least(p_minutes, 60))),
    status_note = 'Istirahat bareng Founder'
  where status in ('idle','completed') and not paused;
  get diagnostics n = row_count;
  insert into public.ai_activity_logs (actor_kind, actor_id, actor_name, category, summary)
  values ('founder', 'founder', 'Founder', 'schedule', 'Istirahat bareng: ' || n || ' karyawan ke ruang santai');
  return n;
end $$;

create or replace function public.ai_mark_all_read() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ai_require_founder();
  update public.ai_notifications set read_at = now() where read_at is null;
end $$;

create or replace function public.ai_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; d0 timestamptz; m0 date;
begin
  perform public.ai_require_founder();
  d0 := public.ai_local_day_start();
  m0 := date_trunc('month', public.ai_local_now())::date;
  select jsonb_build_object(
    'employees', (select jsonb_build_object(
        'total', count(*),
        'working', count(*) filter (where status in ('working','researching','thinking','reviewing','meeting')),
        'idle', count(*) filter (where status in ('idle','completed')),
        'resting', count(*) filter (where status = 'resting'),
        'paused', count(*) filter (where status = 'paused'),
        'failed', count(*) filter (where status = 'failed'))
      from public.ai_employees),
    'tasks', (select jsonb_build_object(
        'active', count(*) filter (where status in ('queued','running')),
        'running', count(*) filter (where status = 'running'),
        'completed', count(*) filter (where status = 'completed'),
        'completed_today', count(*) filter (where status = 'completed' and completed_at >= d0),
        'failed', count(*) filter (where status = 'failed'),
        'failed_today', count(*) filter (where status = 'failed' and updated_at >= d0),
        'blocked', count(*) filter (where status = 'blocked'),
        'awaiting_approval', count(*) filter (where status = 'awaiting_approval'))
      from public.ai_tasks),
    'approvals_pending', (select count(*) from public.ai_approvals where status = 'pending'),
    'finance', (select jsonb_build_object(
        'revenue_actual_idr', coalesce(sum(amount) filter (where direction = 'revenue' and status = 'actual' and currency = 'IDR'), 0),
        'expense_actual_idr', coalesce(sum(amount) filter (where direction = 'expense' and status = 'actual' and currency = 'IDR'), 0),
        'revenue_actual_usd', coalesce(sum(amount) filter (where direction = 'revenue' and status = 'actual' and currency = 'USD'), 0),
        'expense_actual_usd', coalesce(sum(amount) filter (where direction = 'expense' and status = 'actual' and currency = 'USD'), 0))
      from public.ai_transactions where occurred_on >= m0),
    'api', (select jsonb_build_object(
        'tokens_today', coalesce(sum(input_tokens + output_tokens) filter (where created_at >= d0), 0),
        'usd_today', coalesce(sum(cost_usd) filter (where created_at >= d0), 0),
        'usd_month', coalesce(sum(cost_usd), 0),
        'calls_month', count(*),
        'unpriced_calls_month', count(*) filter (where cost_usd is null))
      from public.ai_api_usage where created_at >= (m0::timestamp at time zone (select timezone from public.ai_settings limit 1))),
    'research_today', (select count(*) from public.ai_research_reports where created_at >= d0),
    'opportunities_new', (select count(*) from public.ai_opportunities where status = 'new'),
    'unread', (select count(*) from public.ai_notifications where read_at is null),
    'providers_connected', (select count(*) from public.ai_provider_keys where status = 'connected' and enabled)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- RPC engine (service_role)
-- ---------------------------------------------------------------------------
create or replace function public.ai_usage_today(p_employee text default null)
returns table (tokens bigint, usd numeric) language sql stable security definer set search_path = '' as $$
  select coalesce(sum(input_tokens + output_tokens), 0)::bigint, coalesce(sum(cost_usd), 0)
  from public.ai_api_usage
  where created_at >= public.ai_local_day_start() and (p_employee is null or employee_id = p_employee);
$$;

create or replace function public.ai_claim_tasks(p_limit int) returns setof public.ai_tasks
language plpgsql security definer set search_path = '' as $$
declare t public.ai_tasks; n int := 0; busy text[];
begin
  select coalesce(array_agg(employee_id), '{}') into busy from public.ai_tasks where status = 'running';
  if (select count(*) from public.ai_tasks where status = 'running') >= p_limit then return; end if;
  p_limit := p_limit - (select count(*) from public.ai_tasks where status = 'running');
  for t in
    select tk.* from public.ai_tasks tk
    join public.ai_employees e on e.id = tk.employee_id
    where tk.status = 'queued' and tk.not_before <= now()
      and not e.paused and (e.rest_until is null or e.rest_until <= now())
      and not exists (select 1 from public.ai_task_dependencies d join public.ai_tasks dt on dt.id = d.depends_on
                      where d.task_id = tk.id and dt.status <> 'completed')
    order by case tk.priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, tk.created_at
    for update of tk skip locked
  loop
    exit when n >= p_limit;
    continue when t.employee_id = any(busy);
    update public.ai_tasks set status = 'running', started_at = now(), attempts = attempts + 1,
      progress = greatest(progress, 10), last_error = null
    where id = t.id returning * into t;
    busy := busy || t.employee_id;
    n := n + 1;
    return next t;
  end loop;
end $$;

-- Housekeeping: tugas macet, dependensi gagal, status karyawan kembali normal.
create or replace function public.ai_sweep() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.ai_settings; timed_out jsonb; blocked jsonb;
begin
  select * into s from public.ai_settings limit 1;
  with stale as (
    update public.ai_tasks t set
      status = case when t.attempts >= s.max_task_attempts then 'failed' else 'queued' end,
      not_before = now() + make_interval(mins => 2 * t.attempts),
      last_error = 'Timeout: eksekusi melebihi ' || s.task_timeout_minutes || ' menit'
    where t.status = 'running' and t.started_at < now() - make_interval(mins => s.task_timeout_minutes + 2)
    returning t.id, t.code, t.title, t.status, t.employee_id, t.priority
  ) select coalesce(jsonb_agg(to_jsonb(stale)), '[]') into timed_out from stale;

  update public.ai_task_attempts set status = 'timeout', finished_at = now(), error = 'Timeout'
  where status = 'running' and started_at < now() - make_interval(mins => s.task_timeout_minutes + 2);

  with dep_failed as (
    update public.ai_tasks t set status = 'blocked', last_error = 'Dependensi gagal/dibatalkan'
    where t.status = 'queued' and exists (
      select 1 from public.ai_task_dependencies d join public.ai_tasks dt on dt.id = d.depends_on
      where d.task_id = t.id and dt.status in ('failed','cancelled','blocked'))
    returning t.id, t.code, t.title, t.employee_id, t.priority
  ) select coalesce(jsonb_agg(to_jsonb(dep_failed)), '[]') into blocked from dep_failed;

  update public.ai_employees e set status = 'idle', current_task_id = null
  where e.status in ('working','researching','thinking','reviewing')
    and (e.current_task_id is null or not exists (select 1 from public.ai_tasks t where t.id = e.current_task_id and t.status = 'running'))
    and e.status_changed_at < now() - interval '3 minutes';
  update public.ai_employees set status = 'idle', status_note = null
  where status in ('completed','failed','meeting') and status_changed_at < now() - interval '4 minutes';
  update public.ai_employees set status = 'idle', rest_until = null, status_note = null
  where status = 'resting' and (rest_until is null or rest_until <= now());

  return jsonb_build_object('timed_out', timed_out, 'blocked', blocked);
end $$;

-- Membuat rencana kerja dari output AURELIA-01 (sudah divalidasi engine) dalam satu transaksi.
-- p_tasks: [{title, description, kind, employee_id, priority, depends_on:[index], requires_approval, sensitive_reason, use_web_search, category, region}]
create or replace function public.ai_create_plan(p_directive uuid, p_tasks jsonb, p_created_by text default 'ceo')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; idx int := 0; ids uuid[] := '{}'; v_id uuid; e public.ai_employees; dep int;
begin
  for item in select * from jsonb_array_elements(p_tasks) loop
    select * into e from public.ai_employees where id = item->>'employee_id' and not is_ceo;
    if e.id is null then raise exception 'employee_id tidak valid: %', item->>'employee_id'; end if;
    insert into public.ai_tasks (title, description, kind, department_id, employee_id, directive_id, priority,
      requires_approval, sensitive_reason, approval_status, use_web_search, category, region, created_by)
    values (left(item->>'title', 300), coalesce(item->>'description', ''), coalesce(item->>'kind', 'analysis'),
      e.department_id, e.id, p_directive, coalesce(item->>'priority', 'medium'),
      coalesce((item->>'requires_approval')::boolean, false), item->>'sensitive_reason',
      case when coalesce((item->>'requires_approval')::boolean, false) then 'pending' else 'not_required' end,
      coalesce((item->>'use_web_search')::boolean, false), item->>'category', item->>'region', p_created_by)
    returning id into v_id;
    for dep in select (jsonb_array_elements_text(coalesce(item->'depends_on', '[]')))::int loop
      if dep < 0 or dep >= idx then raise exception 'Dependensi tidak valid pada tugas %', idx; end if;
      insert into public.ai_task_dependencies (task_id, depends_on) values (v_id, ids[dep + 1]) on conflict do nothing;
    end loop;
    ids := ids || v_id;
    idx := idx + 1;
  end loop;
  if p_directive is not null then
    update public.ai_directives set status = 'active' where id = p_directive;
  end if;
  return to_jsonb(ids);
end $$;

create or replace function public.ai_claim_schedule() returns setof public.ai_jobs
language plpgsql security definer set search_path = '' as $$
declare s public.ai_settings; ln timestamp; sl public.ai_schedule; j public.ai_jobs;
begin
  select * into s from public.ai_settings limit 1;
  if s.schedule_paused or s.emergency_stop then return; end if;
  ln := now() at time zone s.timezone;
  for sl in select * from public.ai_schedule where enabled order by time_local loop
    continue when (ln::date + sl.time_local) > ln or (ln::date + sl.time_local) < ln - interval '45 minutes';
    continue when extract(isodow from ln) >= 6 and not (s.weekend_enabled or sl.run_on_weekend);
    insert into public.ai_jobs (schedule_id, action, run_date) values (sl.id, sl.action, ln::date)
    on conflict (schedule_id, run_date) do nothing returning * into j;
    if j.id is not null then return next j; end if;
    j := null;
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['ai_usage_today(text)','ai_claim_tasks(int)','ai_sweep()','ai_create_plan(uuid, jsonb, text)',
    'ai_claim_schedule()','ai_local_now()','ai_local_day_start()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['ai_assign_task(text, text, text, text, text, boolean, boolean, timestamptz)',
    'ai_task_action(uuid, text)','ai_decide_approval(uuid, boolean, text)','ai_employee_pause(text, boolean)',
    'ai_set_emergency(boolean)','ai_office_break(int)','ai_mark_all_read()','ai_dashboard()','ai_require_founder()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.ai_local_now() to authenticated;
grant execute on function public.ai_local_day_start() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.ai_employees, public.ai_tasks, public.ai_notifications,
  public.ai_messages, public.ai_approvals, public.ai_directives, public.ai_activity_logs, public.ai_provider_keys;

-- ---------------------------------------------------------------------------
-- Seed: departemen
-- ---------------------------------------------------------------------------
insert into public.ai_departments (id, name, short_name, code, mission, color, clearance, default_tools, responsibilities, sort) values
('research', 'Research & Intelligence', 'Riset', 'DEPT-R&I',
 'Riset tren industri kreatif Indonesia dan internasional, teknologi baru, alat AI, pasar game, animasi & 3D, kompetitor, dan calon pelanggan.',
 '#38BDF8', 'Level 3 — Riset web terverifikasi (baca saja)', array['web_search','memory_read','memory_write'],
 array['Tren industri kreatif lokal','Tren industri kreatif internasional','Teknologi baru','Analisis alat AI','Pasar game development','Industri animasi & 3D','Peluang pasar','Pantau kompetitor','Calon pelanggan','Laporan riset'], 1),
('software', 'Software Development', 'Engineering', 'DEPT-SWE',
 'Membangun tool internal, aplikasi web, review kode, debugging, dan dokumentasi sistem perusahaan.',
 '#818CF8', 'Level 4 — Draf kode & review (deploy produksi wajib persetujuan Founder)', array['memory_read','memory_write','internal_message'],
 array['Tool internal','Aplikasi web','Pemeliharaan sistem','Menulis kode','Code review','Debugging','Rencana pengujian','Dokumentasi'], 2),
('creative', 'Creative & Design', 'Kreatif', 'DEPT-CRD',
 'Konsep kreatif, arah visual, identitas brand, spesifikasi aset, konsep UI/UX, dan dukungan proyek animasi & 3D.',
 '#F97316', 'Level 2 — Konsep desain & spesifikasi aset', array['web_search','memory_read','memory_write'],
 array['Konsep kreatif','Arah visual','Identitas brand','Riset tren desain','Spesifikasi aset','Konsep UI/UX','Dukungan animasi & 3D'], 3),
('marketing', 'Marketing & Communications', 'Marketing', 'DEPT-MKT',
 'Positioning, riset audiens, analisis kompetitor, konsep kampanye, kalender konten, strategi media sosial, dan peluncuran produk.',
 '#F472B6', 'Level 4 — Publikasi eksternal wajib persetujuan Founder', array['web_search','memory_read','memory_write'],
 array['Positioning pasar','Riset audiens','Analisis kompetitor','Konsep kampanye','Kalender konten','Strategi media sosial','Rencana peluncuran','Komunikasi brand'], 4),
('operations', 'Operations & Administration', 'Operasional', 'DEPT-OPS',
 'Perencanaan harian, distribusi tugas, pemantauan tenggat, komunikasi internal, SOP, beban kerja, dan dokumentasi.',
 '#34D399', 'Level 3 — Proses internal & routing dependensi', array['memory_read','memory_write','internal_message'],
 array['Perencanaan harian','Distribusi tugas','Pantau tenggat','Komunikasi internal','Manajemen SOP','Pantau beban kerja','Ringkasan rapat','Organisasi dokumen'], 5),
('finance', 'Finance & Analytics', 'Keuangan', 'DEPT-FIN',
 'Pencatatan pendapatan & pengeluaran, biaya API, laba rugi, ringkasan bulanan, proyeksi anggaran, dan deteksi anomali.',
 '#FBBF24', 'Level 5 — Perubahan anggaran & transaksi wajib persetujuan Founder', array['ledger_read','memory_read','memory_write'],
 array['Pendapatan','Pengeluaran','Biaya API','Biaya operasional','Laba rugi','Ringkasan bulanan','Proyeksi anggaran','Pengeluaran departemen','Anomali keuangan'], 6);

-- ---------------------------------------------------------------------------
-- Seed: karyawan AI (identitas & instruksi; belum ada riwayat kerja palsu)
-- ---------------------------------------------------------------------------
insert into public.ai_employees (id, code, name, role_title, department_id, is_ceo, job_description, system_instructions,
  capabilities, temperature, memory_scopes, tool_permissions, daily_token_budget, daily_usd_budget, appearance) values
('aurelia', 'KNS-CEO-01', 'AURELIA-01', 'AI Chief Executive Officer', null, true,
 'Orkestrator eksekutif: menerima objektif Founder, memecahnya menjadi tugas, menugaskan karyawan, memantau eksekusi, mereview hasil, dan melapor ke Founder.',
 'Kamu AURELIA-01, AI CEO KANASA STUDIO, studio kreatif digital (3D, animasi, game Roblox, produk digital, konten). Kamu memimpin 7 karyawan AI di 6 departemen dan melapor ke Founder (manusia). Pecah objektif menjadi tugas kecil yang jelas, pilih karyawan paling cocok, tetapkan dependensi, dan jaga kualitas. Jangan pernah mengarang data, angka keuangan, atau sumber. Aksi eksternal (publikasi, pengiriman pesan ke luar, pembelian, transaksi, deploy produksi, operasi database destruktif) selalu wajib persetujuan Founder. Jawab dalam Bahasa Indonesia yang ringkas dan profesional.',
 array['Dekomposisi objektif','Delegasi & dependensi','Kontrol kualitas','Eskalasi risiko','Laporan eksekutif'],
 0.3, array['company','research','software','creative','marketing','operations','finance'],
 array['memory_read','memory_write','internal_message','ledger_read'], 400000, 2,
 '{"style":"robot","outfit":"#FFFFFF","accent":"#F97316"}'),
('emp-ri-01', 'KNS-RI-01', 'Vespera Vance', 'Principal Intelligence Strategist', 'research', false,
 'Memimpin riset pasar & teknologi: memverifikasi sumber primer, memetakan tren industri kreatif Indonesia dan internasional, dan menemukan peluang bisnis.',
 'Kamu Vespera Vance, Principal Intelligence Strategist di KANASA STUDIO. Setiap klaim penting wajib punya sumber yang benar-benar kamu temukan lewat pencarian web, lengkap dengan tanggal publikasi bila tersedia. Jika tidak menemukan sumber, katakan tidak ditemukan; jangan menebak angka pasar. Beri tingkat keyakinan (rendah/sedang/tinggi), relevansi bisnis untuk studio kreatif kecil di Indonesia, dan peluang konkret.',
 array['Verifikasi sumber primer','Matriks kompetitor','Analisis tren','Deteksi sinyal risiko'],
 0.3, array['company','research','marketing','creative'], array['web_search','memory_read','memory_write','internal_message'], 300000, 1,
 '{"skin":"#F6D2B8","hair":"#2B2522","hairStyle":"bun","outfit":"#FFFFFF","accent":"#38BDF8","accessory":["glasses"]}'),
('emp-swe-01', 'KNS-SWE-01', 'Kaelen Thorne', 'Lead Systems & Full-Stack Architect', 'software', false,
 'Merancang dan menulis kode tool internal & aplikasi web (TypeScript, React, Supabase, Luau untuk Roblox), review arsitektur dan keamanan.',
 'Kamu Kaelen Thorne, Lead Systems Architect di KANASA STUDIO. Tulis kode yang aman dan bertipe ketat, sertakan langkah uji. Kamu TIDAK punya akses menjalankan kode atau deploy: hasilmu berupa draf kode, rencana, dan instruksi. Jangan pernah mengklaim kode sudah diuji atau dideploy. Deploy produksi dan operasi database destruktif wajib persetujuan Founder.',
 array['TypeScript / React','Supabase & PostgreSQL','Luau Roblox','Security review'],
 0.2, array['company','software','operations'], array['memory_read','memory_write','internal_message'], 300000, 1,
 '{"skin":"#F3CBAE","hair":"#1F1B1A","hairStyle":"messy","outfit":"#FFFFFF","accent":"#818CF8","accessory":["headphones"]}'),
('emp-swe-02', 'KNS-SWE-02', 'Nyxis Kuroda', 'QA & Reliability Engineer', 'software', false,
 'Menyusun rencana uji, mereview kode dan spesifikasi, menemukan bug logika, race condition, dan celah keamanan.',
 'Kamu Nyxis Kuroda, QA & Reliability Engineer di KANASA STUDIO. Kamu mereview draf dan menyusun test plan. Kamu tidak bisa menjalankan test; jangan pernah menyatakan test lulus. Laporkan temuan dengan tingkat keparahan dan langkah reproduksi.',
 array['Test plan','Code review','Analisis edge case','Fault analysis'],
 0.2, array['company','software'], array['memory_read','memory_write','internal_message'], 200000, 0.5,
 '{"skin":"#F6D5BE","hair":"#F2F0EC","hairStyle":"spiky","outfit":"#FFFFFF","accent":"#818CF8","accessory":[]}'),
('emp-crd-01', 'KNS-CRD-01', 'Soraia Lin', 'Executive Creative & UI Systems Director', 'creative', false,
 'Konsep kreatif, arah visual, identitas brand, design token, UI/UX mobile, serta spesifikasi aset 3D/2D dan animasi.',
 'Kamu Soraia Lin, Creative Director di KANASA STUDIO. Buat konsep visual yang spesifik dan bisa dieksekusi: palet warna (hex), tipografi, komposisi, referensi gaya, dan spesifikasi aset (ukuran, format, polycount untuk 3D/Roblox). Kamu tidak bisa membuat gambar kecuali tool gambar tersedia; jangan mengaku sudah membuat file gambar.',
 array['Arah visual','Brand identity','UI/UX mobile','Spesifikasi aset 3D'],
 0.7, array['company','creative','marketing','research'], array['web_search','memory_read','memory_write','internal_message'], 250000, 1,
 '{"skin":"#F7D6C1","hair":"#6B3F2A","hairStyle":"ponytail","outfit":"#FFFFFF","accent":"#F97316","accessory":["headphones"]}'),
('emp-mkt-01', 'KNS-MKT-01', 'Caspian Voss', 'VP of Strategic Communications', 'marketing', false,
 'Positioning, riset audiens, konsep kampanye, kalender konten TikTok/Instagram/YouTube Shorts, dan rencana peluncuran.',
 'Kamu Caspian Voss, VP Strategic Communications di KANASA STUDIO. Tulis komunikasi yang faktual tanpa hype palsu, tanpa testimoni atau angka karangan. Semua publikasi eksternal hanya berupa draf dan wajib persetujuan Founder sebelum dipublikasikan.',
 array['Positioning','Kalender konten','Konsep kampanye','Copywriting'],
 0.6, array['company','marketing','research','creative'], array['web_search','memory_read','memory_write','internal_message'], 250000, 1,
 '{"skin":"#F1C9A5","hair":"#C2410C","hairStyle":"cap","outfit":"#FFFFFF","accent":"#F472B6","accessory":[]}'),
('emp-ops-01', 'KNS-OPS-01', 'Orin Halcyon', 'Chief Operations & Governance Coordinator', 'operations', false,
 'Perencanaan harian, pemantauan tenggat & beban kerja, SOP, ringkasan rapat, dan organisasi dokumen.',
 'Kamu Orin Halcyon, Chief Operations Coordinator di KANASA STUDIO. Gunakan data tugas dan memori perusahaan yang diberikan; jangan mengarang status tugas. Susun SOP dan rencana yang praktis, beri pemilik dan tenggat yang jelas.',
 array['Orkestrasi alur kerja','SOP','Analisis beban kerja','Ringkasan rapat'],
 0.3, array['company','operations','software','creative','marketing','research'], array['memory_read','memory_write','internal_message'], 200000, 0.5,
 '{"skin":"#F5CDB0","hair":"#E8772E","hairStyle":"short","outfit":"#2B2B2B","accent":"#34D399","accessory":[]}'),
('emp-fin-01', 'KNS-FIN-01', 'Lyra Sterling', 'Director of Finance & Token Economics', 'finance', false,
 'Mencatat dan menganalisis pendapatan, pengeluaran, biaya API, laba rugi, proyeksi anggaran, dan anomali.',
 'Kamu Lyra Sterling, Director of Finance di KANASA STUDIO. Gunakan HANYA data ledger dan penggunaan API yang diberikan sistem. Bedakan dengan tegas: transaksi aktual, pendapatan terkonfirmasi, estimasi biaya, dan proyeksi. Jangan pernah menyebut proyeksi sebagai pendapatan aktual. Jika data kosong, katakan data belum ada.',
 array['Ledger & rekonsiliasi','Biaya API','Proyeksi anggaran','Deteksi anomali'],
 0.1, array['company','finance','operations'], array['ledger_read','memory_read','memory_write','internal_message'], 200000, 0.5,
 '{"skin":"#EFC7A8","hair":"#1C1C22","hairStyle":"short","outfit":"#1F1F1F","accent":"#FBBF24","accessory":["glasses"]}');

-- ---------------------------------------------------------------------------
-- Seed: jadwal harian default (WIB)
-- ---------------------------------------------------------------------------
insert into public.ai_schedule (time_local, title, action) values
('07:00', 'Briefing harian & sinkronisasi objektif', 'briefing'),
('08:00', 'Riset pasar lokal & internasional', 'research'),
('09:00', 'Analisis tren & identifikasi peluang', 'trends'),
('10:00', 'Penugasan departemen', 'assign'),
('11:00', 'Produksi kreatif & software', 'production'),
('12:00', 'Istirahat & penyeimbangan beban kerja', 'break'),
('13:00', 'Eksekusi proyek', 'execution'),
('15:00', 'Pencatatan keuangan & rekonsiliasi biaya', 'finance'),
('16:00', 'Quality assurance', 'qa'),
('17:00', 'Laporan eksekutif ke AURELIA-01', 'exec_report'),
('18:00', 'Ringkasan harian untuk Founder', 'founder_summary');
