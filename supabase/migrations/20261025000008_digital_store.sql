-- Digital product store: categories, products (free / paid), private download links,
-- paid products reuse the order + manual payment flow (100% up front, auto-delivery on confirmation).

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 300),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  title text not null check (char_length(title) between 1 and 120),
  category_id uuid not null references public.product_categories(id) on delete restrict,
  summary text check (char_length(summary) <= 300),
  description text check (char_length(description) <= 6000),
  price numeric not null default 0 check (price >= 0 and price <= 100000000),   -- 0 = Free (IDR)
  cover_url text check (cover_url is null or cover_url ~ '^https://'),
  cover_alt text check (char_length(cover_alt) <= 200),
  gallery text[] not null default '{}',
  tags text[] not null default '{}',
  version text check (char_length(version) <= 40),
  compatibility text check (char_length(compatibility) <= 300),
  file_info text check (char_length(file_info) <= 200),
  license_note text check (char_length(license_note) <= 500),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_featured boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists products_cat_idx on public.products(category_id);

-- download links live apart from the public product row
create table if not exists public.product_files (
  product_id uuid primary key references public.products(id) on delete cascade,
  download_url text not null check (download_url ~ '^https://' and char_length(download_url) <= 500),
  updated_at timestamptz not null default now());

alter table public.orders add column if not exists product_id uuid references public.products(id) on delete set null;

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_files enable row level security;
revoke all on public.product_categories, public.products, public.product_files from anon, authenticated;
grant select on public.product_categories, public.products to anon, authenticated;
grant insert, update, delete on public.product_categories, public.products to authenticated;
grant select, insert, update, delete on public.product_files to authenticated;

create policy pc_read on public.product_categories for select to anon, authenticated using (is_active or public.is_admin());
create policy pc_write on public.product_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pr_read on public.products for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy pr_write on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pf_admin on public.product_files for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger product_categories_set_updated_at before update on public.product_categories for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger product_files_set_updated_at before update on public.product_files for each row execute function public.set_updated_at();
create trigger product_categories_audit after insert or update or delete on public.product_categories for each row execute function public.audit_row();
create trigger products_audit after insert or update or delete on public.products for each row execute function public.audit_row();
create trigger product_files_audit after insert or update or delete on public.product_files for each row execute function public.audit_row();

insert into public.product_categories (slug, name, sort_order) values
 ('software-apps','Software Apps',10), ('roblox-studio-plugins','Plugin Roblox Studio',20), ('blender-plugins','Plugin Blender',30),
 ('ready-models','Model Ready to Sell',40), ('animation-poses','Animation Pose Ready',50), ('roblox-scripts','Script Roblox Studio',60)
on conflict (slug) do nothing;

------------------------------------------------------------------ free download (link revealed only for published free items)
create or replace function public.get_free_download(p_slug text) returns text
language plpgsql security definer set search_path = '' as $$
declare u text;
begin
  select f.download_url into u from public.products p join public.product_files f on f.product_id = p.id
   where p.slug = p_slug and p.status = 'published' and p.price = 0;
  if u is null then raise exception 'This item is not available for free download.' using errcode = 'P0001'; end if;
  return u;
end $$;
revoke execute on function public.get_free_download(text) from public;
grant execute on function public.get_free_download(text) to anon, authenticated;

------------------------------------------------------------------ buy a paid product
create or replace function public.create_product_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := nullif(trim(coalesce(p->>'idempotency_key','')), '');
  v_name text := trim(coalesce(p#>>'{client,name}', ''));
  v_email text := lower(trim(coalesce(p#>>'{client,email}', '')));
  v_discord text := nullif(trim(coalesce(p#>>'{client,discord}', '')), '');
  v_prod public.products; v_order public.orders; v_maint jsonb; v_ref text; v_token text; v_cur text;
begin
  if coalesce(p->>'website','') <> '' then raise exception 'Request rejected.' using errcode = 'P0001'; end if;
  select value into v_maint from public.site_settings where key = 'maintenance';
  if coalesce((v_maint->>'enabled')::boolean, false) then raise exception 'Orders are temporarily closed.' using errcode = 'P0001'; end if;
  if v_key is not null then
    select * into v_order from public.orders where idempotency_key = v_key;
    if found then return jsonb_build_object('reference', v_order.reference, 'duplicate', true); end if;
  end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'Please enter your name (2-80 characters).' using errcode = 'P0001'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then raise exception 'Please enter a valid email address.' using errcode = 'P0001'; end if;
  select * into v_prod from public.products where id = (p->>'product_id')::uuid and status = 'published';
  if not found then raise exception 'This product is no longer available.' using errcode = 'P0001'; end if;
  if v_prod.price <= 0 then raise exception 'This product is free: use the download button.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.product_files where product_id = v_prod.id) then raise exception 'This product has no file yet. Please contact the studio.' using errcode = 'P0001'; end if;
  if (select count(*) from public.orders where client_email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests from this email. Please try again later.' using errcode = 'P0001'; end if;
  if (select count(*) from public.orders where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'The store is busy. Please try again later.' using errcode = 'P0001'; end if;
  select coalesce(value->>'currency','IDR') into v_cur from public.site_settings where key = 'order';
  v_cur := coalesce(v_cur, 'IDR');
  v_ref := 'KNS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.orders (reference, access_token_hash, idempotency_key, client_name, client_email, client_discord, brief, currency,
                             product_id, status, needs_quote, quoted_total, quoted_at, estimated_min, estimated_max)
  values (v_ref, encode(sha256(convert_to(v_token, 'utf8')), 'hex'), v_key, v_name, v_email, v_discord,
          'Digital product purchase: ' || v_prod.title, v_cur, v_prod.id, 'quotation_sent', false, v_prod.price, now(), v_prod.price, v_prod.price)
  returning * into v_order;
  insert into public.order_items (order_id, service_name, tier_name, unit_price_min, unit_price_max, quantity)
  values (v_order.id, v_prod.title, 'Digital product', v_prod.price, v_prod.price, 1);
  insert into public.order_status_history (order_id, from_status, to_status, note, client_visible)
  values (v_order.id, null, 'quotation_sent', 'Order created. Pay to unlock your download.', true);
  return jsonb_build_object('reference', v_ref, 'access_token', v_token, 'currency', v_cur);
end $$;
revoke execute on function public.create_product_order(jsonb) from public;
grant execute on function public.create_product_order(jsonb) to anon, authenticated;

------------------------------------------------------------------ product orders are billed 100% up front
create or replace function public._payment_state(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.orders; pct numeric; paid numeric; total numeric; has_dep boolean; pend boolean; amt numeric; k text; rej text;
begin
  select * into o from public.orders where id = p_order;
  if not found then return jsonb_build_object('state','none'); end if;
  select (value->>'deposit_percent')::numeric into pct from public.site_settings where key = 'payment';
  pct := least(100, greatest(1, coalesce(pct, 50)));
  if o.product_id is not null then pct := 100; end if;
  total := o.quoted_total;
  if total is null or total <= 0 or o.status = 'cancelled' then
    return jsonb_build_object('state','none','deposit_percent',pct);
  end if;
  select coalesce(sum(amount) filter (where status = 'confirmed'), 0),
         coalesce(bool_or(kind = 'deposit' and status = 'confirmed'), false),
         coalesce(bool_or(status = 'pending'), false)
    into paid, has_dep, pend from public.order_payments where order_id = p_order;
  if pend then
    return jsonb_build_object('state','pending','total',total,'paid',paid,'deposit_percent',pct,'currency',o.currency);
  end if;
  if not has_dep then
    if o.status in ('quotation_sent','awaiting_payment') then k := 'deposit'; amt := least(total, round(total * pct / 100)); end if;
  elsif total - paid <= 0 then
    return jsonb_build_object('state','paid','total',total,'paid',paid,'deposit_percent',pct,'currency',o.currency);
  elsif o.status = 'awaiting_payment' then
    k := 'balance'; amt := total - paid;
  end if;
  if k is null then
    return jsonb_build_object('state','none','total',total,'paid',paid,'deposit_percent',pct,'currency',o.currency);
  end if;
  select case when status = 'rejected' then review_note end into rej
    from public.order_payments where order_id = p_order order by created_at desc limit 1;
  return jsonb_build_object('state','due','kind',k,'amount',amt,'total',total,'paid',paid,'deposit_percent',pct,'currency',o.currency,'last_rejection',rej);
end $$;
revoke all on function public._payment_state(uuid) from public, anon, authenticated;

------------------------------------------------------------------ confirming a product payment completes + unlocks the order
create or replace function public.admin_review_payment(p_payment uuid, p_approve boolean, p_note text default null, p_next_status text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.order_payments; o public.orders; old text; nxt text; n text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into pay from public.order_payments where id = p_payment for update;
  if not found then raise exception 'Payment not found.'; end if;
  if pay.status <> 'pending' then raise exception 'This payment was already reviewed.'; end if;
  if not p_approve and n is null then raise exception 'Add a reason so the client knows what to fix.'; end if;
  update public.order_payments set status = case when p_approve then 'confirmed' else 'rejected' end,
         review_note = n, reviewed_by = auth.uid(), reviewed_at = now() where id = p_payment;
  if p_approve then
    select * into o from public.orders where id = pay.order_id for update;
    old := o.status;
    if o.product_id is not null then
      update public.orders set status = 'completed', delivered_at = now() where id = o.id;
      insert into public.order_status_history (order_id, from_status, to_status, note, client_visible, actor_id)
      values (o.id, old, 'completed', 'Payment confirmed. Your download is available on this page.', true, auth.uid());
    else
      nxt := case when pay.kind = 'balance' then 'ready_for_delivery' else coalesce(p_next_status, 'in_progress') end;
      if old is distinct from nxt and nxt <> 'completed' then
        update public.orders set status = nxt where id = o.id;
        insert into public.order_status_history (order_id, from_status, to_status, note, client_visible, actor_id)
        values (o.id, old, nxt, case pay.kind when 'deposit' then 'Deposit confirmed' else 'Final payment confirmed. Your files are being prepared for delivery.' end, true, auth.uid());
      end if;
    end if;
  end if;
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), case when p_approve then 'PAYMENT_CONFIRMED' else 'PAYMENT_REJECTED' end, 'order_payments', p_payment::text,
          jsonb_build_object('status', 'pending'), jsonb_build_object('status', case when p_approve then 'confirmed' else 'rejected' end, 'amount', pay.amount, 'kind', pay.kind));
end $$;
revoke execute on function public.admin_review_payment(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_review_payment(uuid, boolean, text, text) to authenticated;

------------------------------------------------------------------ track_order: product downloads appear only when paid in full
create or replace function public.track_order(p_reference text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; ps jsonb; pu text; pt text;
begin
  select * into o from public.orders
   where reference = upper(trim(p_reference))
     and access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then return null; end if;
  ps := public._payment_state(o.id);
  if o.product_id is not null and ps->>'state' = 'paid' then
    select f.download_url, p.title into pu, pt from public.product_files f join public.products p on p.id = f.product_id where f.product_id = o.product_id;
  end if;
  return jsonb_build_object(
    'reference', o.reference, 'status', o.status, 'created_at', o.created_at, 'deadline', o.deadline,
    'currency', o.currency, 'needs_quote', o.needs_quote, 'is_product', o.product_id is not null,
    'estimated_min', o.estimated_min, 'estimated_max', o.estimated_max, 'quoted_total', o.quoted_total,
    'items', coalesce((select jsonb_agg(jsonb_build_object('service_name', service_name, 'tier_name', tier_name,
              'quantity', quantity, 'unit_price_min', unit_price_min, 'unit_price_max', unit_price_max, 'addons', addons)
              order by created_at) from public.order_items where order_id = o.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('to_status', to_status, 'note', case when client_visible then note end,
              'created_at', created_at) order by id) from public.order_status_history where order_id = o.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('author_type', author_type, 'body', body, 'created_at', created_at)
              order by id) from public.order_messages where order_id = o.id and visibility = 'client'), '[]'::jsonb),
    'payment', ps,
    'methods', case when ps->>'state' = 'due' then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'label', label,
              'account_name', account_name, 'account_number', account_number, 'qris_image_url', qris_image_url, 'instructions', instructions)
              order by sort_order, created_at) from public.payment_methods where is_active), '[]'::jsonb) else '[]'::jsonb end,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'status', status, 'method_label', method_label,
              'created_at', created_at, 'review_note', case when status = 'rejected' then review_note end) order by created_at)
              from public.order_payments where order_id = o.id), '[]'::jsonb),
    'delivery', case
        when pu is not null then jsonb_build_object('url', pu, 'note', 'Digital product: ' || pt, 'delivered_at', o.delivered_at)
        when ps->>'state' = 'paid' and o.delivery_url is not null then jsonb_build_object('url', o.delivery_url, 'note', o.delivery_note, 'delivered_at', o.delivered_at) end);
end $$;

