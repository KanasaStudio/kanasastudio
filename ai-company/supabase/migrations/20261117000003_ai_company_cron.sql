-- Engine 24 jam: pg_cron memanggil edge function kanasa-ai setiap menit bila ada pekerjaan.
alter table public.ai_transactions alter column amount type numeric(18,4);

create or replace function public.ai_cron_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare s public.ai_settings; k text; ln timestamp; has_work boolean;
begin
  select * into s from public.ai_settings limit 1;
  if s.emergency_stop then return; end if;
  ln := now() at time zone s.timezone;
  has_work :=
    exists (select 1 from public.ai_tasks where status = 'running'
            or (status = 'queued' and not_before <= now()))
    or exists (select 1 from public.ai_directives where status = 'planning')
    or exists (select 1 from public.ai_employees
               where (status = 'resting' and rest_until <= now())
                  or (status in ('completed','failed','meeting','working','researching','thinking','reviewing')
                      and status_changed_at < now() - interval '3 minutes'))
    or (not s.schedule_paused and exists (
          select 1 from public.ai_schedule sl
          where sl.enabled and (ln::date + sl.time_local) between ln - interval '45 minutes' and ln
            and not exists (select 1 from public.ai_jobs j where j.schedule_id = sl.id and j.run_date = ln::date)));
  if not has_work then return; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'kanasa_ai_engine_key';
  if k is null then return; end if;
  perform net.http_post(
    url := 'https://geroipkbzmbkigzwjdok.supabase.co/functions/v1/kanasa-ai',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-engine-key', k),
    body := jsonb_build_object('action', 'tick', 'trigger', 'cron'),
    timeout_milliseconds := 30000);
end $$;
revoke all on function public.ai_cron_tick() from public, anon, authenticated;

select cron.schedule('kanasa-ai-engine', '* * * * *', 'select public.ai_cron_tick()');

-- Fungsi cek Founder tidak perlu dipanggil tanpa login
revoke execute on function public.ai_is_founder() from anon, public;
grant execute on function public.ai_is_founder() to authenticated;
