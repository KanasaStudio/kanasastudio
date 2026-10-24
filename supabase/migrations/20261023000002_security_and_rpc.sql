-- RLS, explicit grants, storage, and server-side business logic.

------------------------------------------------------------------ enable RLS everywhere
alter table public.profiles               enable row level security;
alter table public.user_roles             enable row level security;
alter table public.services               enable row level security;
alter table public.service_tiers          enable row level security;
alter table public.service_addons         enable row level security;
alter table public.portfolio_projects     enable row level security;
alter table public.portfolio_media        enable row level security;
alter table public.site_settings          enable row level security;
alter table public.site_settings_draft    enable row level security;
alter table public.site_settings_versions enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.order_attachments      enable row level security;
alter table public.order_status_history   enable row level security;
alter table public.order_messages         enable row level security;
alter table public.audit_logs             enable row level security;

------------------------------------------------------------------ grants (RLS alone does not revoke grants)
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- visitors: read published catalogue only (rows filtered by RLS below)
grant select on public.services, public.service_tiers, public.service_addons,
                public.portfolio_projects, public.portfolio_media, public.site_settings to anon, authenticated;

-- signed-in users: RLS decides, is_admin() gates everything below
grant select on public.profiles, public.user_roles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant insert, update, delete on public.services, public.service_tiers, public.service_addons,
                public.portfolio_projects, public.portfolio_media to authenticated;
grant select, insert, update, delete on public.site_settings_draft to authenticated;
grant select on public.site_settings_versions, public.audit_logs to authenticated;
grant select on public.orders, public.order_items, public.order_attachments,
                public.order_status_history, public.order_messages to authenticated;
-- admins can edit quote/deadline directly; STATUS only changes through admin_set_order_status()
grant update (quoted_total, quoted_at, deadline) on public.orders to authenticated;
grant insert on public.order_messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant insert, update, delete on public.user_roles to authenticated;   -- gated to owner by policy

grant execute on function public.is_admin(), public.is_owner() to anon, authenticated;

------------------------------------------------------------------ policies
-- profiles / roles
create policy profiles_self_read   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy roles_read_own_or_admin on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy roles_owner_write on public.user_roles for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- catalogue: visitors see published only, admins see everything
create policy services_public_read on public.services for select to anon, authenticated
  using (publish_state = 'published' or public.is_admin());
create policy services_admin_write on public.services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy tiers_public_read on public.service_tiers for select to anon, authenticated
  using (public.is_admin() or (is_active and exists (select 1 from public.services s where s.id = service_id and s.publish_state = 'published')));
create policy tiers_admin_write on public.service_tiers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy addons_public_read on public.service_addons for select to anon, authenticated
  using (public.is_admin() or (is_active and exists (select 1 from public.services s where s.id = service_id and s.publish_state = 'published')));
create policy addons_admin_write on public.service_addons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy portfolio_public_read on public.portfolio_projects for select to anon, authenticated
  using (status = 'published' or public.is_admin());
create policy portfolio_admin_write on public.portfolio_projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy media_public_read on public.portfolio_media for select to anon, authenticated
  using (public.is_admin() or exists (select 1 from public.portfolio_projects p where p.id = project_id and p.status = 'published'));
create policy media_admin_write on public.portfolio_media for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- settings
create policy settings_public_read on public.site_settings for select to anon, authenticated using (true);
create policy settings_draft_admin on public.site_settings_draft for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy settings_versions_admin on public.site_settings_versions for select to authenticated using (public.is_admin());

-- orders: NO anonymous access at all. Visitors go through create_order() / track_order().
create policy orders_admin_read   on public.orders for select to authenticated using (public.is_admin());
create policy orders_admin_update on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy items_admin_read    on public.order_items for select to authenticated using (public.is_admin());
create policy attach_admin_read   on public.order_attachments for select to authenticated using (public.is_admin());
create policy history_admin_read  on public.order_status_history for select to authenticated using (public.is_admin());
create policy messages_admin_read on public.order_messages for select to authenticated using (public.is_admin());
create policy messages_admin_insert on public.order_messages for insert to authenticated
  with check (public.is_admin() and author_type = 'admin' and author_id = auth.uid());
create policy audit_admin_read    on public.audit_logs for select to authenticated using (public.is_admin());

------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-media', 'public-media', true, 8388608, array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','model/gltf-binary','application/octet-stream']),
  ('order-attachments', 'order-attachments', false, 10485760, array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do nothing;

-- public-media: world-readable (it holds published artwork), admin-only writes
create policy "public-media admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and public.is_admin());
create policy "public-media admin update" on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and public.is_admin());
create policy "public-media admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and public.is_admin());

-- order-attachments: visitors may only DROP files into incoming/<random>/..., never list or read
create policy "order-attachments visitor upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'order-attachments' and name like 'incoming/%' and name not like '%..%');
create policy "order-attachments admin read" on storage.objects for select to authenticated
  using (bucket_id = 'order-attachments' and public.is_admin());
create policy "order-attachments admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'order-attachments' and public.is_admin());

------------------------------------------------------------------ order creation (server-side pricing)
create or replace function public.create_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key     text := nullif(trim(coalesce(p->>'idempotency_key','')), '');
  v_name    text := trim(coalesce(p#>>'{client,name}', ''));
  v_email   text := lower(trim(coalesce(p#>>'{client,email}', '')));
  v_discord text := nullif(trim(coalesce(p#>>'{client,discord}', '')), '');
  v_brief   text := trim(coalesce(p->>'brief', ''));
  v_deadline date;
  v_budget  numeric;
  v_order   public.orders;
  v_items   jsonb := coalesce(p->'items', '[]'::jsonb);
  v_att     jsonb := coalesce(p->'attachments', '[]'::jsonb);
  v_it jsonb; v_svc public.services; v_tier public.service_tiers; v_addon public.service_addons;
  v_qty int; v_pmin numeric; v_pmax numeric; v_addons jsonb; v_aid text; v_addon_sum numeric;
  v_tmin numeric := 0; v_tmax numeric := 0; v_quote boolean := false; v_priced boolean := false;
  v_ref text; v_token text; v_path text; v_obj record; v_maint jsonb; v_currency text;
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'Request rejected.' using errcode = 'P0001'; end if;   -- honeypot

  select value into v_maint from public.site_settings where key = 'maintenance';
  if coalesce((v_maint->>'enabled')::boolean, false) then raise exception 'Orders are temporarily closed.' using errcode = 'P0001'; end if;

  -- idempotency: same key returns the original reference, no duplicate order
  if v_key is not null then
    select * into v_order from public.orders where idempotency_key = v_key;
    if found then
      return jsonb_build_object('reference', v_order.reference, 'duplicate', true);
    end if;
  end if;

  if char_length(v_name) not between 2 and 80 then raise exception 'Please enter your name (2-80 characters).' using errcode = 'P0001'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then raise exception 'Please enter a valid email address.' using errcode = 'P0001'; end if;
  if char_length(v_brief) not between 10 and 4000 then raise exception 'Project description must be 10-4000 characters.' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) not between 1 and 20 then raise exception 'Select between 1 and 20 services.' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_att) <> 'array' or jsonb_array_length(v_att) > 8 then raise exception 'Too many attachments (max 8).' using errcode = 'P0001'; end if;

  begin v_deadline := nullif(p->>'deadline', '')::date; exception when others then raise exception 'Invalid deadline date.' using errcode = 'P0001'; end;
  begin v_budget := nullif(p->>'budget', '')::numeric; exception when others then raise exception 'Invalid budget.' using errcode = 'P0001'; end;
  if v_deadline is not null and v_deadline < current_date then raise exception 'Deadline cannot be in the past.' using errcode = 'P0001'; end if;

  -- rate limits: per email and global
  if (select count(*) from public.orders where client_email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests from this email. Please try again later.' using errcode = 'P0001'; end if;
  if (select count(*) from public.orders where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'The order form is busy. Please try again later.' using errcode = 'P0001'; end if;

  select coalesce(value->>'currency', 'IDR') into v_currency from public.site_settings where key = 'order';
  v_ref   := 'KNS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.orders (reference, access_token_hash, idempotency_key, client_name, client_email, client_discord,
                             budget, deadline, brief, currency)
  values (v_ref, encode(sha256(convert_to(v_token, 'utf8')), 'hex'), v_key, v_name, v_email, v_discord,
          v_budget, v_deadline, v_brief, coalesce(v_currency, 'IDR'))
  returning * into v_order;

  for v_it in select * from jsonb_array_elements(v_items) loop
    select * into v_svc from public.services
      where id = (v_it->>'service_id')::uuid and publish_state = 'published' and status = 'available';
    if not found then raise exception 'A selected service is no longer available.' using errcode = 'P0001'; end if;

    v_qty := greatest(1, least(50, coalesce((v_it->>'quantity')::int, 1)));
    if length(coalesce(v_it->'brief', '{}'::jsonb)::text) > 8000 then raise exception 'Brief details too long.' using errcode = 'P0001'; end if;

    v_tier := null;
    if nullif(v_it->>'tier_id', '') is not null then
      select * into v_tier from public.service_tiers
        where id = (v_it->>'tier_id')::uuid and service_id = v_svc.id and is_active;
      if not found then raise exception 'Invalid tier for %.', v_svc.name using errcode = 'P0001'; end if;
    elsif exists (select 1 from public.service_tiers where service_id = v_svc.id and is_active) and not v_svc.custom_quote then
      raise exception 'Please choose a tier for %.', v_svc.name using errcode = 'P0001';
    end if;

    -- price comes ONLY from the database
    v_pmin := case when v_tier.id is not null then v_tier.price_min else v_svc.price_min end;
    v_pmax := case when v_tier.id is not null then coalesce(v_tier.price_max, v_tier.price_min) else coalesce(v_svc.price_max, v_svc.price_min) end;

    v_addons := '[]'::jsonb; v_addon_sum := 0;
    for v_aid in select jsonb_array_elements_text(coalesce(v_it->'addon_ids', '[]'::jsonb)) loop
      select * into v_addon from public.service_addons where id = v_aid::uuid and service_id = v_svc.id and is_active;
      if not found then raise exception 'Invalid add-on selected.' using errcode = 'P0001'; end if;
      v_addons := v_addons || jsonb_build_object('id', v_addon.id, 'name', v_addon.name, 'price', v_addon.price);
      v_addon_sum := v_addon_sum + v_addon.price;
    end loop;

    if v_svc.custom_quote or v_pmin is null then
      v_quote := true;
    else
      v_priced := true;
      v_tmin := v_tmin + (v_pmin + v_addon_sum) * v_qty;
      v_tmax := v_tmax + (coalesce(v_pmax, v_pmin) + v_addon_sum) * v_qty;
    end if;

    insert into public.order_items (order_id, service_id, tier_id, service_name, tier_name, unit_price_min, unit_price_max, quantity, addons, brief)
    values (v_order.id, v_svc.id, v_tier.id, v_svc.name, v_tier.name,
            case when v_svc.custom_quote then null else v_pmin end,
            case when v_svc.custom_quote then null else v_pmax end,
            v_qty, v_addons, coalesce(v_it->'brief', '{}'::jsonb));
  end loop;

  -- attachments: must already exist in storage under incoming/; size/type are read from storage, not from the client
  for v_path in select (a->>'path') from jsonb_array_elements(v_att) a loop
    if v_path is null or v_path !~ '^incoming/[A-Za-z0-9_-]+/[A-Za-z0-9._-]+$' then raise exception 'Invalid attachment path.' using errcode = 'P0001'; end if;
    select name, metadata into v_obj from storage.objects where bucket_id = 'order-attachments' and name = v_path;
    if not found then raise exception 'An attachment was not uploaded correctly.' using errcode = 'P0001'; end if;
    insert into public.order_attachments (order_id, storage_path, file_name, mime_type, size_bytes)
    values (v_order.id, v_path, regexp_replace(v_path, '^.*/', ''), v_obj.metadata->>'mimetype', (v_obj.metadata->>'size')::bigint);
  end loop;

  update public.orders set needs_quote = v_quote,
      estimated_min = case when v_priced then v_tmin end,
      estimated_max = case when v_priced then v_tmax end
    where id = v_order.id;

  insert into public.order_status_history (order_id, from_status, to_status, note, client_visible)
  values (v_order.id, null, 'new_request', 'Request received', true);

  return jsonb_build_object('reference', v_ref, 'access_token', v_token, 'needs_quote', v_quote,
                            'estimated_min', case when v_priced then v_tmin end,
                            'estimated_max', case when v_priced then v_tmax end,
                            'currency', coalesce(v_currency, 'IDR'));
end $$;
grant execute on function public.create_order(jsonb) to anon, authenticated;

------------------------------------------------------------------ client order tracking (reference + secret token)
create or replace function public.track_order(p_reference text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders
   where reference = upper(trim(p_reference))
     and access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then return null; end if;       -- same answer for wrong ref or wrong token
  return jsonb_build_object(
    'reference', o.reference, 'status', o.status, 'created_at', o.created_at, 'deadline', o.deadline,
    'currency', o.currency, 'needs_quote', o.needs_quote,
    'estimated_min', o.estimated_min, 'estimated_max', o.estimated_max, 'quoted_total', o.quoted_total,
    'items', coalesce((select jsonb_agg(jsonb_build_object('service_name', service_name, 'tier_name', tier_name,
              'quantity', quantity, 'unit_price_min', unit_price_min, 'unit_price_max', unit_price_max, 'addons', addons)
              order by created_at) from public.order_items where order_id = o.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('to_status', to_status, 'note', case when client_visible then note end,
              'created_at', created_at) order by id) from public.order_status_history where order_id = o.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('author_type', author_type, 'body', body, 'created_at', created_at)
              order by id) from public.order_messages where order_id = o.id and visibility = 'client'), '[]'::jsonb));
end $$;
grant execute on function public.track_order(text, text) to anon, authenticated;

create or replace function public.client_reply(p_reference text, p_token text, p_body text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o public.orders; b text := trim(coalesce(p_body, ''));
begin
  select * into o from public.orders
   where reference = upper(trim(p_reference))
     and access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then return false; end if;
  if char_length(b) not between 1 and 2000 then raise exception 'Message must be 1-2000 characters.' using errcode = 'P0001'; end if;
  if (select count(*) from public.order_messages where order_id = o.id and author_type = 'client' and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Message limit reached for today.' using errcode = 'P0001'; end if;
  insert into public.order_messages (order_id, visibility, author_type, body) values (o.id, 'client', 'client', b);
  return true;
end $$;
grant execute on function public.client_reply(text, text, text) to anon, authenticated;

------------------------------------------------------------------ admin functions
create or replace function public.admin_set_order_status(p_order uuid, p_status text, p_note text default null, p_client_visible boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare old_status text;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select status into old_status from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.'; end if;
  update public.orders set status = p_status where id = p_order;   -- check constraint validates p_status
  insert into public.order_status_history (order_id, from_status, to_status, note, client_visible, actor_id)
  values (p_order, old_status, p_status, nullif(trim(p_note), ''), p_client_visible, auth.uid());
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), 'STATUS', 'orders', p_order::text, jsonb_build_object('status', old_status), jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.orders group by status) s), '{}'::jsonb),
    -- definition: sum of quoted_total for orders in awaiting_payment / in_progress / revision / completed
    'booked_value', coalesce((select sum(quoted_total) from public.orders where status in ('awaiting_payment','in_progress','revision','completed')), 0),
    'recent', coalesce((select jsonb_agg(r) from (select reference, status, client_name, created_at from public.orders order by created_at desc limit 8) r), '[]'::jsonb),
    'availability', (select value from public.site_settings where key = 'availability'));
end $$;

-- settings: draft -> published, with history + rollback
create or replace function public.publish_site_settings(p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  insert into public.site_settings_versions (snapshot, note, published_by)
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb), p_note, auth.uid() from public.site_settings_draft;
  insert into public.site_settings (key, value, updated_at)
    select key, value, now() from public.site_settings_draft
    on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function public.rollback_site_settings(p_version bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare snap jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select snapshot into snap from public.site_settings_versions where id = p_version;
  if snap is null then raise exception 'Version not found.'; end if;
  insert into public.site_settings_draft (key, value, updated_at)
    select k, v, now() from jsonb_each(snap) as e(k, v)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.publish_site_settings('Rollback to version ' || p_version);
end $$;

grant execute on function public.admin_set_order_status(uuid, text, text, boolean),
  public.admin_dashboard(), public.publish_site_settings(text), public.rollback_site_settings(bigint) to authenticated;

------------------------------------------------------------------ realtime (admin sees new orders live; RLS still applies)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  end if;
end $$;
