-- Manual-verified payments: bank / e-wallet / QRIS, deposit (default 50%) then balance.
-- Amounts are computed on the server from orders.quoted_total; the client never sends an amount.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bank','ewallet','qris')),
  label text not null,                 -- e.g. "BCA", "DANA", "QRIS Kanasa"
  account_name text,
  account_number text,
  qris_image_url text,
  instructions text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('deposit','balance')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'IDR',
  method_id uuid references public.payment_methods(id) on delete set null,
  method_label text,                   -- snapshot, survives later edits/deletes of the method
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  proof_path text not null,            -- private bucket order-attachments
  payer_note text check (char_length(payer_note) <= 500),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_payments_order_idx on public.order_payments (order_id, created_at);
create index if not exists order_payments_pending_idx on public.order_payments (status) where status = 'pending';

alter table public.payment_methods enable row level security;
alter table public.order_payments  enable row level security;
revoke all on public.payment_methods, public.order_payments from anon, authenticated;
grant select, insert, update, delete on public.payment_methods to authenticated;   -- RLS: admin only
grant select on public.order_payments to authenticated;                            -- changes only via functions
create policy pm_admin_all on public.payment_methods for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy op_admin_read on public.order_payments for select to authenticated using (public.is_admin());

drop trigger if exists payment_methods_set_updated_at on public.payment_methods;
create trigger payment_methods_set_updated_at before update on public.payment_methods for each row execute function public.set_updated_at();
drop trigger if exists payment_methods_audit on public.payment_methods;
create trigger payment_methods_audit after insert or update or delete on public.payment_methods for each row execute function public.audit_row();

------------------------------------------------------------------ what is due right now (internal)
create or replace function public._payment_state(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.orders; pct numeric; paid numeric; total numeric; has_dep boolean; pend boolean; amt numeric; k text; rej text;
begin
  select * into o from public.orders where id = p_order;
  if not found then return jsonb_build_object('state','none'); end if;
  select (value->>'deposit_percent')::numeric into pct from public.site_settings where key = 'payment';
  pct := least(100, greatest(1, coalesce(pct, 50)));
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

------------------------------------------------------------------ track_order now includes payment info
create or replace function public.track_order(p_reference text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; ps jsonb;
begin
  select * into o from public.orders
   where reference = upper(trim(p_reference))
     and access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then return null; end if;
  ps := public._payment_state(o.id);
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
              order by id) from public.order_messages where order_id = o.id and visibility = 'client'), '[]'::jsonb),
    'payment', ps,
    -- account numbers / QRIS are revealed only to a client who holds the token AND has a payment due
    'methods', case when ps->>'state' = 'due' then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'label', label,
              'account_name', account_name, 'account_number', account_number, 'qris_image_url', qris_image_url, 'instructions', instructions)
              order by sort_order, created_at) from public.payment_methods where is_active), '[]'::jsonb) else '[]'::jsonb end,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'status', status, 'method_label', method_label,
              'created_at', created_at, 'review_note', case when status = 'rejected' then review_note end) order by created_at)
              from public.order_payments where order_id = o.id), '[]'::jsonb));
end $$;

------------------------------------------------------------------ client submits proof
create or replace function public.submit_payment(p_reference text, p_token text, p_method uuid, p_proof text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; ps jsonb; m public.payment_methods; obj record; note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into o from public.orders
   where reference = upper(trim(p_reference))
     and access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then raise exception 'Order not found.' using errcode = 'P0001'; end if;
  if note is not null and char_length(note) > 500 then raise exception 'Note is too long (max 500 characters).' using errcode = 'P0001'; end if;
  ps := public._payment_state(o.id);
  if ps->>'state' <> 'due' then raise exception 'No payment is due for this order right now.' using errcode = 'P0001'; end if;
  select * into m from public.payment_methods where id = p_method and is_active;
  if not found then raise exception 'Please choose a payment method.' using errcode = 'P0001'; end if;
  if p_proof is null or p_proof !~ '^incoming/[A-Za-z0-9_-]+/[A-Za-z0-9._-]+$' then raise exception 'Please upload your payment proof.' using errcode = 'P0001'; end if;
  select name, metadata into obj from storage.objects where bucket_id = 'order-attachments' and name = p_proof;
  if not found then raise exception 'The proof file was not uploaded correctly.' using errcode = 'P0001'; end if;
  if (select count(*) from public.order_payments where order_id = o.id and created_at > now() - interval '1 day') >= 6 then
    raise exception 'Too many submissions today. Please contact the studio.' using errcode = 'P0001'; end if;
  insert into public.order_payments (order_id, kind, amount, currency, method_id, method_label, proof_path, payer_note)
  values (o.id, ps->>'kind', (ps->>'amount')::numeric, o.currency, m.id, m.label || ' (' || m.kind || ')', p_proof, note);
  insert into public.order_messages (order_id, visibility, author_type, body)
  values (o.id, 'internal', 'client', 'Payment proof submitted: ' || (ps->>'kind') || ' ' || (ps->>'amount') || ' ' || o.currency || ' via ' || m.label);
  return jsonb_build_object('ok', true, 'kind', ps->>'kind', 'amount', (ps->>'amount')::numeric);
end $$;
grant execute on function public.submit_payment(text, text, uuid, text, text) to anon, authenticated;

------------------------------------------------------------------ admin verifies
create or replace function public.admin_review_payment(p_payment uuid, p_approve boolean, p_note text default null, p_next_status text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.order_payments; o public.orders; old text; n text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into pay from public.order_payments where id = p_payment for update;
  if not found then raise exception 'Payment not found.'; end if;
  if pay.status <> 'pending' then raise exception 'This payment was already reviewed.'; end if;
  if not p_approve and n is null then raise exception 'Add a reason so the client knows what to fix.'; end if;
  update public.order_payments set status = case when p_approve then 'confirmed' else 'rejected' end,
         review_note = n, reviewed_by = auth.uid(), reviewed_at = now() where id = p_payment;
  if p_approve and p_next_status is not null then
    select * into o from public.orders where id = pay.order_id for update;
    old := o.status;
    if old is distinct from p_next_status then
      update public.orders set status = p_next_status where id = o.id;
      insert into public.order_status_history (order_id, from_status, to_status, note, client_visible, actor_id)
      values (o.id, old, p_next_status, case pay.kind when 'deposit' then 'Deposit confirmed' else 'Final payment confirmed' end, true, auth.uid());
    end if;
  end if;
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), case when p_approve then 'PAYMENT_CONFIRMED' else 'PAYMENT_REJECTED' end, 'order_payments', p_payment::text,
          jsonb_build_object('status', 'pending'), jsonb_build_object('status', case when p_approve then 'confirmed' else 'rejected' end, 'amount', pay.amount, 'kind', pay.kind));
end $$;
revoke execute on function public.admin_review_payment(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_review_payment(uuid, boolean, text, text) to authenticated;

------------------------------------------------------------------ dashboard: pending payments
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.orders group by status) s), '{}'::jsonb),
    'booked_value', coalesce((select sum(quoted_total) from public.orders where status in ('awaiting_payment','in_progress','revision','completed')), 0),
    'pending_payments', (select count(*) from public.order_payments where status = 'pending'),
    'recent', coalesce((select jsonb_agg(r) from (select reference, status, client_name, created_at from public.orders order by created_at desc limit 8) r), '[]'::jsonb),
    'availability', (select value from public.site_settings where key = 'availability'));
end $$;

------------------------------------------------------------------ settings
insert into public.site_settings (key, value) values
 ('payment', '{"deposit_percent":50,"note":"A 50% deposit starts the work; the remaining balance is due before final files are delivered.","qris_notice":"When paying by QRIS, type the exact amount shown."}')
on conflict (key) do nothing;
insert into public.site_settings_draft (key, value) select key, value from public.site_settings where key = 'payment' on conflict (key) do nothing;
