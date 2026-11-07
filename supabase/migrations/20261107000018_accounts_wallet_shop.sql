-- Buyer accounts, KanasaToken wallet + top-up, store cart and 4-stage shop orders.
-- Money safety: balances change only inside SECURITY DEFINER functions (append-only ledger); clients can only read their own rows.

alter table public.profiles add column if not exists whatsapp text check (whatsapp is null or char_length(whatsapp) <= 30);

create or replace function public._on_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)), 60)) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public._on_user_created();
insert into public.profiles (id, display_name) select id, left(split_part(email, '@', 1), 60) from auth.users on conflict (id) do nothing;

/* ---------- config + packs ---------- */
create table if not exists public.token_config (
  id int primary key default 1 check (id = 1),
  rate_idr int not null default 1000 check (rate_idr > 0),      -- Rp per 1 KanasaToken
  min_tokens int not null default 1 check (min_tokens > 0),
  max_tokens int not null default 1000,
  enabled boolean not null default true,
  updated_at timestamptz not null default now());
insert into public.token_config (id) values (1) on conflict do nothing;

create table if not exists public.token_packs (
  id uuid primary key default gen_random_uuid(),
  tokens int not null check (tokens > 0), bonus int not null default 0 check (bonus >= 0),
  label text, is_popular boolean not null default false, is_active boolean not null default true, sort_order int not null default 0);
insert into public.token_packs (tokens, bonus, label, is_popular, sort_order)
select * from (values (5, 0, 'Starter', false, 10), (10, 1, 'Basic', false, 20), (25, 3, 'Plus', true, 30), (50, 8, 'Pro', false, 40), (100, 20, 'Studio', false, 50), (250, 60, 'Legend', false, 60)) v
where not exists (select 1 from public.token_packs);

/* ---------- wallet + ledger ---------- */
create table if not exists public.token_wallets (user_id uuid primary key references auth.users on delete cascade, balance bigint not null default 0 check (balance >= 0), updated_at timestamptz not null default now());
create table if not exists public.token_ledger (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users on delete cascade,
  delta bigint not null, balance_after bigint not null, kind text not null check (kind in ('topup','purchase','refund','adjust')),
  ref text, note text, created_at timestamptz not null default now());
create index if not exists token_ledger_user_idx on public.token_ledger (user_id, created_at desc);

/* ---------- cart + orders ---------- */
create table if not exists public.cart_items (user_id uuid not null references auth.users on delete cascade, product_id uuid not null references public.products on delete cascade, added_at timestamptz not null default now(), primary key (user_id, product_id));

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(), reference text not null unique, user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('product','topup')),
  status text not null default 'menunggu_pembayaran' check (status in ('menunggu_pembayaran','menunggu_dikirim','sudah_terkirim','selesai','dibatalkan')),
  pay_with text not null check (pay_with in ('tokens','transfer')),
  total_idr numeric not null default 0, total_tokens int not null default 0, tokens_base int, bonus int,
  payment_method_id uuid references public.payment_methods on delete set null,
  proof_path text, proof_submitted_at timestamptz, reject_reason text,
  delivery_url text, delivery_note text,
  expires_at timestamptz, paid_at timestamptz, delivered_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists shop_orders_user_idx on public.shop_orders (user_id, created_at desc);
create index if not exists shop_orders_status_idx on public.shop_orders (status, created_at desc);
create table if not exists public.shop_order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.shop_orders on delete cascade, product_id uuid references public.products on delete set null, title text not null, price_idr numeric not null default 0, price_tokens int not null default 0);
create index if not exists shop_order_items_idx on public.shop_order_items (order_id);
create table if not exists public.shop_order_events (id bigint generated always as identity primary key, order_id uuid not null references public.shop_orders on delete cascade, status text not null, note text, actor uuid, created_at timestamptz not null default now());
create index if not exists shop_order_events_idx on public.shop_order_events (order_id, created_at);

/* ---------- RLS ---------- */
do $$ declare t text; begin
  foreach t in array array['token_config','token_packs','token_wallets','token_ledger','cart_items','shop_orders','shop_order_items','shop_order_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop; end $$;
grant select on public.token_config, public.token_packs to anon, authenticated;
grant insert, update, delete on public.token_config, public.token_packs to authenticated;
grant select on public.token_wallets, public.token_ledger, public.shop_order_items, public.shop_order_events to authenticated;
-- buyers may read their own orders, but never the delivery link / proof path directly (shop_orders_me() releases the link only after delivery)
grant select (id, reference, user_id, kind, status, pay_with, total_idr, total_tokens, tokens_base, bonus, payment_method_id, proof_submitted_at, reject_reason, expires_at, paid_at, delivered_at, completed_at, created_at, updated_at) on public.shop_orders to authenticated;
grant select, insert, delete on public.cart_items to authenticated;

create policy token_config_read on public.token_config for select to anon, authenticated using (true);
create policy token_config_admin on public.token_config for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy token_packs_read on public.token_packs for select to anon, authenticated using (is_active or public.is_admin());
create policy token_packs_admin on public.token_packs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy wallets_read on public.token_wallets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy ledger_read on public.token_ledger for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy cart_read on public.cart_items for select to authenticated using (user_id = auth.uid());
create policy cart_add on public.cart_items for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.products p where p.id = product_id and p.status = 'published' and p.price > 0));
create policy cart_del on public.cart_items for delete to authenticated using (user_id = auth.uid());
create policy so_read on public.shop_orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy soi_read on public.shop_order_items for select to authenticated using (exists (select 1 from public.shop_orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy soe_read on public.shop_order_events for select to authenticated using (exists (select 1 from public.shop_orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));

/* ---------- helpers ---------- */
create or replace function public._kt_move(p_user uuid, p_delta bigint, p_kind text, p_ref text, p_note text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare b bigint;
begin
  insert into public.token_wallets (user_id) values (p_user) on conflict do nothing;
  update public.token_wallets set balance = balance + p_delta, updated_at = now() where user_id = p_user returning balance into b;
  insert into public.token_ledger (user_id, delta, balance_after, kind, ref, note) values (p_user, p_delta, b, p_kind, p_ref, p_note);
  return b;
end $$;
create or replace function public._shop_ev(p_order uuid, p_status text, p_note text, p_actor uuid default null) returns void
language sql security definer set search_path = '' as $$ insert into public.shop_order_events (order_id, status, note, actor) values (p_order, p_status, p_note, p_actor); $$;
create or replace function public._ref() returns text language sql volatile set search_path = '' as $$ select 'KS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)); $$;
create or replace function public._need_user() returns uuid language plpgsql stable set search_path = '' as $$
begin if auth.uid() is null then raise exception 'Masuk ke akunmu dulu.' using errcode = 'P0001'; end if; return auth.uid(); end $$;

/* ---------- public reads ---------- */
create or replace function public.shop_config() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rate_idr', c.rate_idr, 'min_tokens', c.min_tokens, 'max_tokens', c.max_tokens, 'enabled', c.enabled,
    'packs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tokens', p.tokens, 'bonus', p.bonus, 'label', p.label, 'popular', p.is_popular) order by p.sort_order, p.tokens) from public.token_packs p where p.is_active), '[]'::jsonb),
    'methods', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'label', m.label, 'account_name', m.account_name, 'account_number', m.account_number, 'qris_image_url', m.qris_image_url, 'instructions', m.instructions) order by m.sort_order) from public.payment_methods m where m.is_active), '[]'::jsonb))
  from public.token_config c where c.id = 1; $$;

create or replace function public.wallet_me() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public._need_user();
begin
  return jsonb_build_object('balance', coalesce((select balance from public.token_wallets where user_id = u), 0),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l) - 'user_id' order by l.id desc) from (select * from public.token_ledger where user_id = u order by id desc limit 50) l), '[]'::jsonb));
end $$;

create or replace function public.shop_orders_me() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public._need_user();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'reference', o.reference, 'kind', o.kind, 'status', o.status, 'pay_with', o.pay_with, 'total_idr', o.total_idr, 'total_tokens', o.total_tokens,
      'tokens_base', o.tokens_base, 'bonus', o.bonus, 'payment_method_id', o.payment_method_id, 'has_proof', o.proof_path is not null, 'reject_reason', o.reject_reason,
      'delivery_url', case when o.status in ('sudah_terkirim','selesai') then o.delivery_url end, 'delivery_note', case when o.status in ('sudah_terkirim','selesai') then o.delivery_note end,
      'expires_at', o.expires_at, 'created_at', o.created_at,
      'items', coalesce((select jsonb_agg(jsonb_build_object('title', i.title, 'price_idr', i.price_idr, 'price_tokens', i.price_tokens)) from public.shop_order_items i where i.order_id = o.id), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.id) from public.shop_order_events e where e.order_id = o.id), '[]'::jsonb)
    ) order by o.created_at desc) from (select * from public.shop_orders where user_id = u order by created_at desc limit 100) o), '[]'::jsonb);
end $$;

/* ---------- buyer actions ---------- */
create or replace function public.topup_create(p_pack uuid default null, p_tokens int default null, p_method uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); c public.token_config; pk public.token_packs; base int; bon int := 0; o public.shop_orders;
begin
  select * into c from public.token_config where id = 1;
  if not c.enabled then raise exception 'Top up KanasaToken sedang ditutup.' using errcode = 'P0001'; end if;
  if p_pack is not null then
    select * into pk from public.token_packs where id = p_pack and is_active; if not found then raise exception 'Paket tidak tersedia.' using errcode = 'P0001'; end if;
    base := pk.tokens; bon := pk.bonus;
  else
    base := p_tokens; if base is null or base < c.min_tokens or base > c.max_tokens then raise exception 'Jumlah top up harus antara % dan % KanasaToken.', c.min_tokens, c.max_tokens using errcode = 'P0001'; end if;
  end if;
  if p_method is not null and not exists (select 1 from public.payment_methods where id = p_method and is_active) then raise exception 'Metode pembayaran tidak tersedia.' using errcode = 'P0001'; end if;
  if (select count(*) from public.shop_orders where user_id = u and status = 'menunggu_pembayaran') >= 10 then raise exception 'Terlalu banyak pesanan yang belum dibayar. Selesaikan atau batalkan dulu.' using errcode = 'P0001'; end if;
  insert into public.shop_orders (reference, user_id, kind, status, pay_with, total_idr, total_tokens, tokens_base, bonus, payment_method_id, expires_at)
  values (public._ref(), u, 'topup', 'menunggu_pembayaran', 'transfer', base::numeric * c.rate_idr, base + bon, base, bon, p_method, now() + interval '24 hours') returning * into o;
  insert into public.shop_order_items (order_id, title, price_idr, price_tokens) values (o.id, 'Top up ' || (base + bon) || ' KanasaToken', o.total_idr, 0);
  perform public._shop_ev(o.id, 'menunggu_pembayaran', 'Pesanan top up dibuat. Silakan bayar lalu unggah bukti.', u);
  return jsonb_build_object('id', o.id, 'reference', o.reference, 'total_idr', o.total_idr, 'tokens', o.total_tokens);
end $$;

create or replace function public.shop_checkout(p_pay text, p_method uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); c public.token_config; n int; total numeric; need int; bal bigint; o public.shop_orders; paid boolean := false;
begin
  if p_pay not in ('tokens','transfer') then raise exception 'Pilih cara pembayaran.' using errcode = 'P0001'; end if;
  select * into c from public.token_config where id = 1;
  select count(*), coalesce(sum(p.price), 0) into n, total from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.user_id = u and p.status = 'published' and p.price > 0 and exists (select 1 from public.product_files f where f.product_id = p.id);
  if n = 0 then raise exception 'Keranjang kosong atau produknya sudah tidak tersedia.' using errcode = 'P0001'; end if;
  if p_method is not null and not exists (select 1 from public.payment_methods where id = p_method and is_active) then raise exception 'Metode pembayaran tidak tersedia.' using errcode = 'P0001'; end if;
  if (select count(*) from public.shop_orders where user_id = u and status = 'menunggu_pembayaran') >= 10 then raise exception 'Terlalu banyak pesanan yang belum dibayar. Selesaikan atau batalkan dulu.' using errcode = 'P0001'; end if;
  need := ceil(total / c.rate_idr);
  if p_pay = 'tokens' then
    insert into public.token_wallets (user_id) values (u) on conflict do nothing;
    select balance into bal from public.token_wallets where user_id = u for update;
    if bal < need then raise exception 'Saldo KanasaToken kurang: butuh %, saldomu %.', need, bal using errcode = 'P0001'; end if;
    paid := true;
  end if;
  insert into public.shop_orders (reference, user_id, kind, status, pay_with, total_idr, total_tokens, payment_method_id, expires_at, paid_at)
  values (public._ref(), u, 'product', case when paid then 'menunggu_dikirim' else 'menunggu_pembayaran' end, p_pay, total, need, p_method, case when paid then null else now() + interval '24 hours' end, case when paid then now() end) returning * into o;
  insert into public.shop_order_items (order_id, product_id, title, price_idr, price_tokens)
    select o.id, p.id, p.title, p.price, ceil(p.price / c.rate_idr)::int from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.user_id = u and p.status = 'published' and p.price > 0 and exists (select 1 from public.product_files f where f.product_id = p.id);
  delete from public.cart_items where user_id = u;
  perform public._shop_ev(o.id, 'menunggu_pembayaran', 'Pesanan dibuat.', u);
  if paid then
    perform public._kt_move(u, -need, 'purchase', o.reference, 'Pembelian ' || o.reference);
    perform public._shop_ev(o.id, 'menunggu_dikirim', 'Dibayar dengan ' || need || ' KanasaToken. Pesananmu menunggu dikirim.', u);
  end if;
  return jsonb_build_object('id', o.id, 'reference', o.reference, 'status', o.status, 'total_idr', total, 'total_tokens', need);
end $$;

create or replace function public.shop_pay_tokens(p_order uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); o public.shop_orders; bal bigint;
begin
  select * into o from public.shop_orders where id = p_order and user_id = u for update; if not found then raise exception 'Pesanan tidak ditemukan.' using errcode = 'P0001'; end if;
  if o.kind <> 'product' or o.status <> 'menunggu_pembayaran' then raise exception 'Pesanan ini tidak bisa dibayar dengan KanasaToken.' using errcode = 'P0001'; end if;
  insert into public.token_wallets (user_id) values (u) on conflict do nothing;
  select balance into bal from public.token_wallets where user_id = u for update;
  if bal < o.total_tokens then raise exception 'Saldo KanasaToken kurang: butuh %, saldomu %.', o.total_tokens, bal using errcode = 'P0001'; end if;
  perform public._kt_move(u, -o.total_tokens, 'purchase', o.reference, 'Pembelian ' || o.reference);
  update public.shop_orders set status = 'menunggu_dikirim', pay_with = 'tokens', paid_at = now(), expires_at = null, updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'menunggu_dikirim', 'Dibayar dengan ' || o.total_tokens || ' KanasaToken. Pesananmu menunggu dikirim.', u);
  return jsonb_build_object('status', 'menunggu_dikirim');
end $$;

create or replace function public.shop_submit_proof(p_order uuid, p_path text, p_method uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); o public.shop_orders;
begin
  select * into o from public.shop_orders where id = p_order and user_id = u for update; if not found then raise exception 'Pesanan tidak ditemukan.' using errcode = 'P0001'; end if;
  if o.status <> 'menunggu_pembayaran' or o.pay_with <> 'transfer' then raise exception 'Pesanan ini tidak menunggu bukti pembayaran.' using errcode = 'P0001'; end if;
  if p_path is null or p_path !~ ('^incoming/shop/' || u::text || '/[A-Za-z0-9._-]{1,80}$') or p_path like '%..%' then raise exception 'Bukti pembayaran tidak valid.' using errcode = 'P0001'; end if;
  if p_method is not null and not exists (select 1 from public.payment_methods where id = p_method and is_active) then raise exception 'Metode pembayaran tidak tersedia.' using errcode = 'P0001'; end if;
  update public.shop_orders set proof_path = p_path, proof_submitted_at = now(), reject_reason = null, payment_method_id = coalesce(p_method, payment_method_id), updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'menunggu_pembayaran', 'Bukti pembayaran dikirim. Menunggu verifikasi admin.', u);
end $$;

create or replace function public.shop_cancel(p_order uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); o public.shop_orders;
begin
  select * into o from public.shop_orders where id = p_order and user_id = u for update; if not found then raise exception 'Pesanan tidak ditemukan.' using errcode = 'P0001'; end if;
  if o.status <> 'menunggu_pembayaran' then raise exception 'Hanya pesanan yang belum dibayar yang bisa dibatalkan.' using errcode = 'P0001'; end if;
  update public.shop_orders set status = 'dibatalkan', updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'dibatalkan', 'Dibatalkan oleh pembeli.', u);
end $$;

create or replace function public.shop_confirm_received(p_order uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); o public.shop_orders;
begin
  select * into o from public.shop_orders where id = p_order and user_id = u for update; if not found then raise exception 'Pesanan tidak ditemukan.' using errcode = 'P0001'; end if;
  if o.status <> 'sudah_terkirim' then raise exception 'Pesanan ini belum bisa diselesaikan.' using errcode = 'P0001'; end if;
  update public.shop_orders set status = 'selesai', completed_at = now(), updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'selesai', 'Pesanan diterima dan diselesaikan oleh pembeli.', u);
end $$;

/* ---------- admin ---------- */
create or replace function public._need_admin() returns void language plpgsql stable set search_path = '' as $$
begin if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if; end $$;

create or replace function public.admin_shop_orders(p_status text default null, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._need_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'reference', o.reference, 'kind', o.kind, 'status', o.status, 'pay_with', o.pay_with, 'total_idr', o.total_idr, 'total_tokens', o.total_tokens,
      'proof_path', o.proof_path, 'proof_submitted_at', o.proof_submitted_at, 'reject_reason', o.reject_reason, 'delivery_url', o.delivery_url, 'delivery_note', o.delivery_note,
      'created_at', o.created_at, 'user_id', o.user_id,
      'buyer', (select coalesce(pr.display_name, '') || ' · ' || coalesce(u.email, '') from auth.users u left join public.profiles pr on pr.id = u.id where u.id = o.user_id),
      'whatsapp', (select whatsapp from public.profiles where id = o.user_id),
      'method', (select m.label from public.payment_methods m where m.id = o.payment_method_id),
      'items', coalesce((select jsonb_agg(jsonb_build_object('title', i.title, 'product_id', i.product_id)) from public.shop_order_items i where i.order_id = o.id), '[]'::jsonb)
    ) order by o.created_at desc) from (select * from public.shop_orders where p_status is null or status = p_status order by created_at desc limit least(greatest(p_limit, 1), 300)) o), '[]'::jsonb);
end $$;

create or replace function public.admin_shop_confirm(p_order uuid) returns void language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders;
begin
  perform public._need_admin();
  select * into o from public.shop_orders where id = p_order for update; if not found then raise exception 'Order not found.'; end if;
  if o.status <> 'menunggu_pembayaran' or o.pay_with <> 'transfer' then raise exception 'This order is not waiting for a bank/e-wallet payment.'; end if;
  if o.kind = 'topup' then
    perform public._kt_move(o.user_id, o.total_tokens, 'topup', o.reference, 'Top up ' || o.reference);
    update public.shop_orders set status = 'selesai', paid_at = now(), delivered_at = now(), completed_at = now(), expires_at = null, updated_at = now() where id = o.id;
    perform public._shop_ev(o.id, 'menunggu_dikirim', 'Pembayaran dikonfirmasi.', auth.uid());
    perform public._shop_ev(o.id, 'sudah_terkirim', o.total_tokens || ' KanasaToken masuk ke dompetmu.', auth.uid());
    perform public._shop_ev(o.id, 'selesai', 'Top up selesai.', auth.uid());
  else
    update public.shop_orders set status = 'menunggu_dikirim', paid_at = now(), expires_at = null, updated_at = now() where id = o.id;
    perform public._shop_ev(o.id, 'menunggu_dikirim', 'Pembayaran dikonfirmasi. Pesananmu menunggu dikirim.', auth.uid());
  end if;
  insert into public.audit_logs (actor_id, action, table_name, row_id, new_data) values (auth.uid(), 'SHOP_CONFIRM', 'shop_orders', o.id::text, jsonb_build_object('reference', o.reference, 'total_idr', o.total_idr));
end $$;

create or replace function public.admin_shop_reject(p_order uuid, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders;
begin
  perform public._need_admin();
  select * into o from public.shop_orders where id = p_order for update; if not found or o.status <> 'menunggu_pembayaran' then raise exception 'Order is not waiting for payment.'; end if;
  update public.shop_orders set proof_path = null, proof_submitted_at = null, reject_reason = left(coalesce(nullif(trim(p_reason), ''), 'Bukti pembayaran tidak sesuai.'), 300), updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'menunggu_pembayaran', 'Bukti pembayaran ditolak: ' || left(coalesce(nullif(trim(p_reason), ''), 'tidak sesuai'), 300), auth.uid());
end $$;

create or replace function public.admin_shop_deliver(p_order uuid, p_url text default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders; u text := nullif(trim(coalesce(p_url, '')), ''); n int;
begin
  perform public._need_admin();
  select * into o from public.shop_orders where id = p_order for update; if not found then raise exception 'Order not found.'; end if;
  if o.kind <> 'product' or o.status <> 'menunggu_dikirim' then raise exception 'Only paid product orders can be delivered.'; end if;
  if u is null then
    select count(*) into n from public.shop_order_items where order_id = o.id;
    if n = 1 then select f.download_url into u from public.shop_order_items i join public.product_files f on f.product_id = i.product_id where i.order_id = o.id; end if;
  end if;
  if u is null or u !~ '^https://[^\s]+$' or char_length(u) > 500 then raise exception 'Enter a valid https:// download link (it cannot be filled automatically for multi-item orders).'; end if;
  update public.shop_orders set delivery_url = u, delivery_note = nullif(trim(coalesce(p_note, '')), ''), delivered_at = now(), status = 'sudah_terkirim', updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'sudah_terkirim', 'Pesananmu sudah dikirim. Buka halaman pesanan untuk mengunduh.', auth.uid());
  insert into public.audit_logs (actor_id, action, table_name, row_id, new_data) values (auth.uid(), 'SHOP_DELIVER', 'shop_orders', o.id::text, jsonb_build_object('reference', o.reference));
end $$;

create or replace function public.admin_shop_complete(p_order uuid) returns void language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders;
begin
  perform public._need_admin();
  select * into o from public.shop_orders where id = p_order for update; if not found or o.status <> 'sudah_terkirim' then raise exception 'Order is not in the delivered stage.'; end if;
  update public.shop_orders set status = 'selesai', completed_at = now(), updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'selesai', 'Pesanan diselesaikan.', auth.uid());
end $$;

create or replace function public.admin_shop_cancel(p_order uuid, p_reason text default null) returns void language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders;
begin
  perform public._need_admin();
  select * into o from public.shop_orders where id = p_order for update; if not found or o.status in ('selesai','dibatalkan') then raise exception 'Order cannot be cancelled.'; end if;
  if o.kind = 'product' and o.pay_with = 'tokens' and o.paid_at is not null then
    perform public._kt_move(o.user_id, o.total_tokens, 'refund', o.reference, 'Refund ' || o.reference);
  end if;
  update public.shop_orders set status = 'dibatalkan', updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'dibatalkan', coalesce(nullif(trim(p_reason), ''), 'Dibatalkan oleh admin.') || case when o.pay_with = 'tokens' and o.paid_at is not null and o.kind = 'product' then ' KanasaToken dikembalikan.' else '' end, auth.uid());
end $$;

create or replace function public.admin_token_adjust(p_user uuid, p_delta bigint, p_note text) returns bigint language plpgsql security definer set search_path = '' as $$
declare b bigint;
begin
  perform public._need_admin();
  if p_delta = 0 or abs(p_delta) > 100000 then raise exception 'Invalid amount.'; end if;
  if (select coalesce(balance, 0) from public.token_wallets where user_id = p_user) + p_delta < 0 and exists (select 1 from public.token_wallets where user_id = p_user) then raise exception 'Balance cannot go below zero.'; end if;
  b := public._kt_move(p_user, p_delta, 'adjust', null, left(coalesce(nullif(trim(p_note), ''), 'Penyesuaian admin'), 200));
  insert into public.audit_logs (actor_id, action, table_name, row_id, new_data) values (auth.uid(), 'TOKEN_ADJUST', 'token_wallets', p_user::text, jsonb_build_object('delta', p_delta, 'note', p_note));
  return b;
end $$;

create or replace function public.admin_token_users(p_q text default null) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._need_admin();
  return coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', u.id, 'email', u.email, 'name', pr.display_name, 'whatsapp', pr.whatsapp, 'balance', coalesce(w.balance, 0), 'joined', u.created_at) x
    from auth.users u left join public.profiles pr on pr.id = u.id left join public.token_wallets w on w.user_id = u.id
    where p_q is null or p_q = '' or u.email ilike '%' || p_q || '%' or pr.display_name ilike '%' || p_q || '%' order by u.created_at desc limit 50) s), '[]'::jsonb);
end $$;

/* auto housekeeping: unpaid orders expire after 24 h, delivered orders auto-complete after 3 days */
create or replace function public.shop_autoclose() returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.shop_orders where status = 'menunggu_pembayaran' and expires_at is not null and expires_at < now() loop
    update public.shop_orders set status = 'dibatalkan', updated_at = now() where id = r.id; perform public._shop_ev(r.id, 'dibatalkan', 'Dibatalkan otomatis karena melewati batas waktu pembayaran (24 jam).'); end loop;
  for r in select id from public.shop_orders where status = 'sudah_terkirim' and delivered_at < now() - interval '3 days' loop
    update public.shop_orders set status = 'selesai', completed_at = now(), updated_at = now() where id = r.id; perform public._shop_ev(r.id, 'selesai', 'Diselesaikan otomatis 3 hari setelah dikirim.'); end loop;
end $$;
do $$ begin perform cron.schedule('shop-autoclose', '*/30 * * * *', 'select public.shop_autoclose()'); exception when others then raise notice 'pg_cron not scheduled: %', sqlerrm; end $$;

/* ---------- function grants ---------- */
do $$ declare f text; begin
  foreach f in array array['_kt_move(uuid,bigint,text,text,text)','_shop_ev(uuid,text,text,uuid)','_ref()','_need_user()','_need_admin()','_on_user_created()','shop_autoclose()',
    'shop_config()','wallet_me()','shop_orders_me()','topup_create(uuid,int,uuid)','shop_checkout(text,uuid)','shop_pay_tokens(uuid)','shop_submit_proof(uuid,text,uuid)','shop_cancel(uuid)','shop_confirm_received(uuid)',
    'admin_shop_orders(text,int)','admin_shop_confirm(uuid)','admin_shop_reject(uuid,text)','admin_shop_deliver(uuid,text,text)','admin_shop_complete(uuid)','admin_shop_cancel(uuid,text)','admin_token_adjust(uuid,bigint,text)','admin_token_users(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop; end $$;
grant execute on function public.shop_config() to anon, authenticated;
grant execute on function public.wallet_me(), public.shop_orders_me(), public.topup_create(uuid,int,uuid), public.shop_checkout(text,uuid), public.shop_pay_tokens(uuid), public.shop_submit_proof(uuid,text,uuid), public.shop_cancel(uuid), public.shop_confirm_received(uuid),
  public.admin_shop_orders(text,int), public.admin_shop_confirm(uuid), public.admin_shop_reject(uuid,text), public.admin_shop_deliver(uuid,text,text), public.admin_shop_complete(uuid), public.admin_shop_cancel(uuid,text), public.admin_token_adjust(uuid,bigint,text), public.admin_token_users(text) to authenticated;
