-- 19: in-app notifications (+ optional email hook), product reviews, vouchers, shop stats, pay letters with KanasaToken.
alter table public.notify_config add column if not exists email_hook_url text check (email_hook_url is null or email_hook_url ~ '^https://[^\s]+$');
alter table public.notify_config add column if not exists email_hook_secret text;

create table if not exists public.notifications (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users on delete cascade,
  title text not null, body text, link text, read_at timestamptz, created_at timestamptz not null default now());
create index if not exists notifications_user_idx on public.notifications (user_id, id desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notif_own on public.notifications for select to authenticated using (user_id = auth.uid());

create or replace function public._trg_notif_email() returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.notify_config; m text;
begin
  select * into c from public.notify_config where id = 1;
  if c.email_hook_url is null or c.email_hook_secret is null or not c.enabled then return new; end if;
  select email into m from auth.users where id = new.user_id;
  if m is null then return new; end if;
  begin
    perform net.http_post(url := c.email_hook_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', c.email_hook_secret),
      body := jsonb_build_object('to', m, 'subject', left(new.title, 150), 'text', left(coalesce(new.body, ''), 1000), 'link', coalesce(c.site_url, '') || '/' || coalesce(new.link, '')));
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists notif_email on public.notifications;
create trigger notif_email after insert on public.notifications for each row execute function public._trg_notif_email();
revoke all on function public._trg_notif_email() from public, anon, authenticated;

create or replace function public.notif_me() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public._need_user();
begin
  return jsonb_build_object('unread', (select count(*) from public.notifications where user_id = u and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'link', n.link, 'read', n.read_at is not null, 'at', n.created_at) order by n.id desc) from (select * from public.notifications where user_id = u order by id desc limit 30) n), '[]'::jsonb));
end $$;
create or replace function public.notif_read_all() returns void language plpgsql security definer set search_path = '' as $$
begin update public.notifications set read_at = now() where user_id = public._need_user() and read_at is null; end $$;

-- status events now also notify: buyer actions alert the admin (Discord), admin/system actions notify the buyer.
create or replace function public._shop_ev(p_order uuid, p_status text, p_note text, p_actor uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  insert into public.shop_order_events (order_id, status, note, actor) values (p_order, p_status, p_note, p_actor);
  select reference, user_id, kind, total_idr into o from public.shop_orders where id = p_order;
  if o.user_id is null then return; end if;
  if p_actor is not null and p_actor = o.user_id then
    if p_status = 'menunggu_dikirim' or coalesce(p_note, '') ilike '%bukti%' or coalesce(p_note, '') ilike 'pesanan%dibuat%' then
      perform public._notify('Shop · ' || o.reference || ' · ' || p_status, (case when o.kind = 'topup' then 'Top up' else 'Produk' end) || ' · Rp' || o.total_idr::text || E'\n' || coalesce(p_note, ''));
    end if;
  else
    insert into public.notifications (user_id, title, body, link)
    values (o.user_id, 'Pesanan ' || o.reference || ' · ' || case p_status when 'menunggu_pembayaran' then 'Menunggu Pembayaran' when 'menunggu_dikirim' then 'Menunggu Dikirim' when 'sudah_terkirim' then 'Sudah Terkirim' when 'selesai' then 'Selesai' else 'Dibatalkan' end,
      p_note, '#/pesanan?o=' || p_order::text);
  end if;
end $$;

-- ---------- reviews ----------
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products on delete cascade, user_id uuid not null references auth.users on delete cascade,
  rating int not null check (rating between 1 and 5), comment text check (comment is null or char_length(comment) <= 600),
  status text not null default 'published' check (status in ('published','hidden')), created_at timestamptz not null default now(), unique (product_id, user_id));
alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from anon, authenticated;
create policy rev_admin on public.product_reviews for select to authenticated using (public.is_admin());
grant select on public.product_reviews to authenticated;

create or replace function public.reviews_public(p_product uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('count', count(*), 'avg', coalesce(round(avg(r.rating)::numeric, 1), 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('rating', x.rating, 'comment', x.comment, 'name', x.nm, 'at', x.created_at) order by x.created_at desc)
      from (select r2.rating, r2.comment, r2.created_at, coalesce(nullif(split_part(pr.display_name, ' ', 1), ''), 'Pembeli') nm from public.product_reviews r2 left join public.profiles pr on pr.id = r2.user_id
        where r2.product_id = p_product and r2.status = 'published' order by r2.created_at desc limit 30) x), '[]'::jsonb))
  from public.product_reviews r where r.product_id = p_product and r.status = 'published'; $$;

create or replace function public.review_submit(p_product uuid, p_rating int, p_comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user();
begin
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Pilih bintang 1 sampai 5.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.shop_order_items i join public.shop_orders o on o.id = i.order_id where o.user_id = u and i.product_id = p_product and o.status in ('sudah_terkirim','selesai')) then
    raise exception 'Kamu bisa memberi ulasan setelah produk diterima.' using errcode = 'P0001'; end if;
  insert into public.product_reviews (product_id, user_id, rating, comment) values (p_product, u, p_rating, nullif(left(trim(coalesce(p_comment, '')), 600), ''))
  on conflict (product_id, user_id) do update set rating = excluded.rating, comment = excluded.comment, status = 'published';
end $$;

create or replace function public.admin_reviews(p_limit int default 100) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._need_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'product', (select title from public.products where id = r.product_id), 'rating', r.rating, 'comment', r.comment, 'status', r.status, 'at', r.created_at,
    'buyer', (select coalesce(display_name, '') || ' · ' || coalesce(email, '') from auth.users u left join public.profiles p on p.id = u.id where u.id = r.user_id)) order by r.created_at desc)
    from (select * from public.product_reviews order by created_at desc limit least(greatest(p_limit, 1), 300)) r), '[]'::jsonb);
end $$;
create or replace function public.admin_review_set(p_id uuid, p_hidden boolean) returns void language plpgsql security definer set search_path = '' as $$
begin perform public._need_admin(); update public.product_reviews set status = case when p_hidden then 'hidden' else 'published' end where id = p_id; end $$;

-- ---------- vouchers ----------
create table if not exists public.vouchers (
  code text primary key check (code ~ '^[A-Z0-9_-]{3,24}$'), kind text not null check (kind in ('percent','fixed')), value int not null check (value > 0),
  min_total int not null default 0, max_discount int, max_uses int, used int not null default 0, starts_at timestamptz, expires_at timestamptz,
  is_active boolean not null default true, note text, created_at timestamptz not null default now(), check (kind <> 'percent' or value <= 100));
create table if not exists public.voucher_uses (code text not null references public.vouchers on delete cascade, user_id uuid not null references auth.users on delete cascade, order_id uuid, created_at timestamptz not null default now(), primary key (code, user_id));
alter table public.vouchers enable row level security; alter table public.voucher_uses enable row level security;
revoke all on public.vouchers, public.voucher_uses from anon, authenticated;
grant select, insert, update, delete on public.vouchers to authenticated; grant select on public.voucher_uses to authenticated;
create policy v_admin on public.vouchers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy vu_admin on public.voucher_uses for select to authenticated using (public.is_admin());

alter table public.shop_orders add column if not exists discount_idr numeric not null default 0;
alter table public.shop_orders add column if not exists voucher_code text;
grant select (discount_idr, voucher_code) on public.shop_orders to authenticated;

create or replace function public._voucher_calc(p_code text, p_user uuid, p_total numeric) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare v public.vouchers; d numeric;
begin
  select * into v from public.vouchers where code = upper(trim(p_code));
  if not found or not v.is_active then raise exception 'Kode voucher tidak valid.' using errcode = 'P0001'; end if;
  if v.starts_at is not null and v.starts_at > now() then raise exception 'Voucher belum berlaku.' using errcode = 'P0001'; end if;
  if v.expires_at is not null and v.expires_at < now() then raise exception 'Voucher sudah kedaluwarsa.' using errcode = 'P0001'; end if;
  if v.max_uses is not null and v.used >= v.max_uses then raise exception 'Kuota voucher sudah habis.' using errcode = 'P0001'; end if;
  if p_total < v.min_total then raise exception 'Minimal belanja Rp% untuk voucher ini.', v.min_total using errcode = 'P0001'; end if;
  if exists (select 1 from public.voucher_uses where code = v.code and user_id = p_user) then raise exception 'Voucher ini sudah pernah kamu pakai.' using errcode = 'P0001'; end if;
  d := case v.kind when 'percent' then floor(p_total * v.value / 100) else v.value end;
  if v.max_discount is not null then d := least(d, v.max_discount); end if;
  return least(d, p_total);
end $$;
create or replace function public._voucher_release(p_order uuid) returns void language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  select voucher_code into c from public.shop_orders where id = p_order;
  if c is not null and exists (select 1 from public.voucher_uses where order_id = p_order) then
    delete from public.voucher_uses where order_id = p_order; update public.vouchers set used = greatest(used - 1, 0) where code = c; end if;
end $$;

create or replace function public.voucher_check(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public._need_user(); c public.token_config; total numeric; d numeric;
begin
  select * into c from public.token_config where id = 1;
  select coalesce(sum(p.price), 0) into total from public.cart_items ci join public.products p on p.id = ci.product_id where ci.user_id = u and p.status = 'published' and p.price > 0;
  d := public._voucher_calc(p_code, u, total);
  return jsonb_build_object('discount', d, 'total', total - d, 'tokens', ceil((total - d) / c.rate_idr));
end $$;

drop function if exists public.shop_checkout(text, uuid);
create or replace function public.shop_checkout(p_pay text, p_method uuid default null, p_voucher text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); c public.token_config; n int; total numeric; disc numeric := 0; need int; bal bigint; o public.shop_orders; paid boolean := false; vc text := nullif(upper(trim(coalesce(p_voucher, ''))), '');
begin
  if p_pay not in ('tokens','transfer') then raise exception 'Pilih cara pembayaran.' using errcode = 'P0001'; end if;
  select * into c from public.token_config where id = 1;
  select count(*), coalesce(sum(p.price), 0) into n, total from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.user_id = u and p.status = 'published' and p.price > 0 and exists (select 1 from public.product_files f where f.product_id = p.id);
  if n = 0 then raise exception 'Keranjang kosong atau produknya sudah tidak tersedia.' using errcode = 'P0001'; end if;
  if p_method is not null and not exists (select 1 from public.payment_methods where id = p_method and is_active) then raise exception 'Metode pembayaran tidak tersedia.' using errcode = 'P0001'; end if;
  if (select count(*) from public.shop_orders where user_id = u and status = 'menunggu_pembayaran') >= 10 then raise exception 'Terlalu banyak pesanan yang belum dibayar. Selesaikan atau batalkan dulu.' using errcode = 'P0001'; end if;
  if vc is not null then perform 1 from public.vouchers where code = vc for update; disc := public._voucher_calc(vc, u, total); end if;
  total := total - disc; need := ceil(total / c.rate_idr);
  if p_pay = 'tokens' then
    insert into public.token_wallets (user_id) values (u) on conflict do nothing;
    select balance into bal from public.token_wallets where user_id = u for update;
    if bal < need then raise exception 'Saldo KanasaToken kurang: butuh %, saldomu %.', need, bal using errcode = 'P0001'; end if;
    paid := true;
  end if;
  insert into public.shop_orders (reference, user_id, kind, status, pay_with, total_idr, total_tokens, payment_method_id, expires_at, paid_at, discount_idr, voucher_code)
  values (public._ref(), u, 'product', case when paid then 'menunggu_dikirim' else 'menunggu_pembayaran' end, p_pay, total, need, p_method, case when paid then null else now() + interval '24 hours' end, case when paid then now() end, disc, case when disc > 0 then vc end) returning * into o;
  insert into public.shop_order_items (order_id, product_id, title, price_idr, price_tokens)
    select o.id, p.id, p.title, p.price, ceil(p.price / c.rate_idr)::int from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.user_id = u and p.status = 'published' and p.price > 0 and exists (select 1 from public.product_files f where f.product_id = p.id);
  if disc > 0 then insert into public.voucher_uses (code, user_id, order_id) values (vc, u, o.id); update public.vouchers set used = used + 1 where code = vc; end if;
  delete from public.cart_items where user_id = u;
  perform public._shop_ev(o.id, 'menunggu_pembayaran', 'Pesanan dibuat.' || case when disc > 0 then ' Voucher ' || vc || ' (-Rp' || disc::text || ').' else '' end, u);
  if paid then
    perform public._kt_move(u, -need, 'purchase', o.reference, 'Pembelian ' || o.reference);
    perform public._shop_ev(o.id, 'menunggu_dikirim', 'Dibayar dengan ' || need || ' KanasaToken. Pesananmu menunggu dikirim.', u);
  end if;
  return jsonb_build_object('id', o.id, 'reference', o.reference, 'status', o.status, 'total_idr', total, 'total_tokens', need, 'discount', disc);
end $$;

create or replace function public.shop_cancel(p_order uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); o public.shop_orders;
begin
  select * into o from public.shop_orders where id = p_order and user_id = u for update; if not found then raise exception 'Pesanan tidak ditemukan.' using errcode = 'P0001'; end if;
  if o.status <> 'menunggu_pembayaran' then raise exception 'Hanya pesanan yang belum dibayar yang bisa dibatalkan.' using errcode = 'P0001'; end if;
  perform public._voucher_release(o.id);
  update public.shop_orders set status = 'dibatalkan', updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'dibatalkan', 'Dibatalkan oleh pembeli.', u);
end $$;
create or replace function public.admin_shop_cancel(p_order uuid, p_reason text default null) returns void language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders;
begin
  perform public._need_admin();
  select * into o from public.shop_orders where id = p_order for update; if not found or o.status in ('selesai','dibatalkan') then raise exception 'Order cannot be cancelled.'; end if;
  if o.kind = 'product' and o.pay_with = 'tokens' and o.paid_at is not null then perform public._kt_move(o.user_id, o.total_tokens, 'refund', o.reference, 'Refund ' || o.reference); end if;
  perform public._voucher_release(o.id);
  update public.shop_orders set status = 'dibatalkan', updated_at = now() where id = o.id;
  perform public._shop_ev(o.id, 'dibatalkan', coalesce(nullif(trim(p_reason), ''), 'Dibatalkan oleh admin.') || case when o.pay_with = 'tokens' and o.paid_at is not null and o.kind = 'product' then ' KanasaToken dikembalikan.' else '' end, auth.uid());
end $$;
create or replace function public.shop_autoclose() returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.shop_orders where status = 'menunggu_pembayaran' and expires_at is not null and expires_at < now() loop
    perform public._voucher_release(r.id); update public.shop_orders set status = 'dibatalkan', updated_at = now() where id = r.id; perform public._shop_ev(r.id, 'dibatalkan', 'Dibatalkan otomatis karena melewati batas waktu pembayaran (24 jam).'); end loop;
  for r in select id from public.shop_orders where status = 'sudah_terkirim' and delivered_at < now() - interval '3 days' loop
    update public.shop_orders set status = 'selesai', completed_at = now(), updated_at = now() where id = r.id; perform public._shop_ev(r.id, 'selesai', 'Diselesaikan otomatis 3 hari setelah dikirim.'); end loop;
end $$;

-- buyer order list: + product_id, my rating, discount
create or replace function public.shop_orders_me() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public._need_user();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'reference', o.reference, 'kind', o.kind, 'status', o.status, 'pay_with', o.pay_with, 'total_idr', o.total_idr, 'total_tokens', o.total_tokens,
      'tokens_base', o.tokens_base, 'bonus', o.bonus, 'payment_method_id', o.payment_method_id, 'has_proof', o.proof_path is not null, 'reject_reason', o.reject_reason,
      'discount_idr', o.discount_idr, 'voucher_code', o.voucher_code,
      'delivery_url', case when o.status in ('sudah_terkirim','selesai') then o.delivery_url end, 'delivery_note', case when o.status in ('sudah_terkirim','selesai') then o.delivery_note end,
      'expires_at', o.expires_at, 'created_at', o.created_at,
      'items', coalesce((select jsonb_agg(jsonb_build_object('title', i.title, 'price_idr', i.price_idr, 'price_tokens', i.price_tokens, 'product_id', i.product_id,
         'my_rating', (select rt.rating from public.product_reviews rt where rt.product_id = i.product_id and rt.user_id = u))) from public.shop_order_items i where i.order_id = o.id), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.id) from public.shop_order_events e where e.order_id = o.id), '[]'::jsonb)
    ) order by o.created_at desc) from (select * from public.shop_orders where user_id = u order by created_at desc limit 100) o), '[]'::jsonb);
end $$;

-- ---------- admin stats ----------
create or replace function public.admin_shop_stats() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._need_admin();
  return jsonb_build_object(
    'product_idr_30d', coalesce((select sum(total_idr) from public.shop_orders where kind = 'product' and status in ('menunggu_dikirim','sudah_terkirim','selesai') and paid_at > now() - interval '30 days'), 0),
    'topup_idr_30d', coalesce((select sum(total_idr) from public.shop_orders where kind = 'topup' and status = 'selesai' and paid_at > now() - interval '30 days'), 0),
    'orders_30d', (select count(*) from public.shop_orders where created_at > now() - interval '30 days'),
    'to_verify', (select count(*) from public.shop_orders where status = 'menunggu_pembayaran' and proof_path is not null),
    'to_deliver', (select count(*) from public.shop_orders where status = 'menunggu_dikirim'),
    'tokens_in_wallets', coalesce((select sum(balance) from public.token_wallets), 0),
    'tokens_sold', coalesce((select sum(delta) from public.token_ledger where kind = 'topup'), 0),
    'tokens_spent', coalesce((select -sum(delta) from public.token_ledger where kind = 'purchase'), 0),
    'users', (select count(*) from auth.users),
    'top_products', coalesce((select jsonb_agg(t) from (select i.title, count(*) n, sum(i.price_idr) idr from public.shop_order_items i join public.shop_orders o on o.id = i.order_id
        where o.kind = 'product' and o.status in ('menunggu_dikirim','sudah_terkirim','selesai') and o.created_at > now() - interval '30 days' group by i.title order by n desc limit 5) t), '[]'::jsonb));
end $$;

-- ---------- pay a Digital Letter with KanasaToken ----------
create or replace function public.letter_pay_tokens(p_id text, p_token text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := public._need_user(); r public.letters; c public.token_config; need int; bal bigint;
begin
  select * into r from public.letters where public_id = p_id and edit_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex') for update;
  if not found then raise exception 'Surat tidak ditemukan.' using errcode = 'P0001'; end if;
  if r.order_status <> 'pending_payment' or r.price_idr <= 0 then raise exception 'Surat ini tidak menunggu pembayaran.' using errcode = 'P0001'; end if;
  select * into c from public.token_config where id = 1; need := ceil(r.price_idr / c.rate_idr);
  insert into public.token_wallets (user_id) values (u) on conflict do nothing;
  select balance into bal from public.token_wallets where user_id = u for update;
  if bal < need then raise exception 'Saldo KanasaToken kurang: butuh %, saldomu %.', need, bal using errcode = 'P0001'; end if;
  perform public._kt_move(u, -need, 'purchase', r.order_ref, 'Surat digital ' || r.order_ref);
  update public.letters set order_status = 'paid', updated_at = now(), expires_at = case when r.plan_days is null then null else now() + make_interval(days => r.plan_days) end where id = r.id;
  perform public._notify('Surat dibayar dengan KT · ' || r.order_ref, need || ' KT · Rp' || r.price_idr::text);
  return jsonb_build_object('ok', true, 'tokens', need);
end $$;

do $$ declare f text; begin
  foreach f in array array['notif_me()','notif_read_all()','reviews_public(uuid)','review_submit(uuid,int,text)','admin_reviews(int)','admin_review_set(uuid,boolean)','_voucher_calc(text,uuid,numeric)','_voucher_release(uuid)','voucher_check(text)',
    'shop_checkout(text,uuid,text)','shop_cancel(uuid)','admin_shop_cancel(uuid,text)','shop_autoclose()','shop_orders_me()','admin_shop_stats()','letter_pay_tokens(text,text)','_shop_ev(uuid,text,text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f); end loop; end $$;
grant execute on function public.reviews_public(uuid) to anon, authenticated;
grant execute on function public.notif_me(), public.notif_read_all(), public.review_submit(uuid,int,text), public.voucher_check(text), public.shop_checkout(text,uuid,text), public.shop_cancel(uuid), public.shop_orders_me(), public.letter_pay_tokens(text,text),
  public.admin_reviews(int), public.admin_review_set(uuid,boolean), public.admin_shop_cancel(uuid,text), public.admin_shop_stats() to authenticated;
