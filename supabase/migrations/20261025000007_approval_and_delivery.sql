-- Work flow gate: work finished -> client approves -> final payment -> THEN delivery.
-- Adds statuses awaiting_approval and ready_for_delivery, client approve/request-changes,
-- and server-enforced delivery (link is only revealed once the order is paid in full).

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'new_request','under_review','awaiting_client','quotation_sent','awaiting_payment',
  'in_progress','revision','awaiting_approval','ready_for_delivery','completed','cancelled'));

alter table public.orders
  add column if not exists delivery_url text check (delivery_url is null or (delivery_url ~ '^https://' and char_length(delivery_url) <= 500)),
  add column if not exists delivery_note text check (char_length(delivery_note) <= 1000),
  add column if not exists delivered_at timestamptz;

------------------------------------------------------------------ client: approve / ask for changes
create or replace function public.client_approve(p_reference text, p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where reference = upper(trim(p_reference))
     and access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then return false; end if;
  if o.status <> 'awaiting_approval' then raise exception 'There is nothing to approve right now.' using errcode = 'P0001'; end if;
  update public.orders set status = 'awaiting_payment' where id = o.id;
  insert into public.order_status_history (order_id, from_status, to_status, note, client_visible)
  values (o.id, 'awaiting_approval', 'awaiting_payment', 'Client approved the work. Final payment is now due.', true);
  insert into public.order_messages (order_id, visibility, author_type, body) values (o.id, 'internal', 'client', 'Client APPROVED the work (final payment now due).');
  return true;
end $$;

create or replace function public.client_request_changes(p_reference text, p_token text, p_note text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o public.orders; n text := trim(coalesce(p_note, ''));
begin
  select * into o from public.orders where reference = upper(trim(p_reference))
     and access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then return false; end if;
  if o.status <> 'awaiting_approval' then raise exception 'There is nothing to review right now.' using errcode = 'P0001'; end if;
  if char_length(n) not between 3 and 1000 then raise exception 'Please describe the changes you need (3-1000 characters).' using errcode = 'P0001'; end if;
  update public.orders set status = 'revision' where id = o.id;
  insert into public.order_status_history (order_id, from_status, to_status, note, client_visible)
  values (o.id, 'awaiting_approval', 'revision', 'Client requested changes.', true);
  insert into public.order_messages (order_id, visibility, author_type, body) values (o.id, 'client', 'client', n);
  return true;
end $$;
grant execute on function public.client_approve(text, text), public.client_request_changes(text, text, text) to anon, authenticated;

------------------------------------------------------------------ admin: deliver (only after full payment)
create or replace function public.admin_deliver_order(p_order uuid, p_url text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; paid numeric; old text;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.'; end if;
  select coalesce(sum(amount), 0) into paid from public.order_payments where order_id = p_order and status = 'confirmed';
  if o.quoted_total is null or o.quoted_total <= 0 or paid < o.quoted_total then
    raise exception 'Locked: the final payment has not been confirmed yet (paid % of %).', paid, coalesce(o.quoted_total, 0); end if;
  if p_url is null or p_url !~ '^https://[^\s]+$' or char_length(p_url) > 500 then raise exception 'Enter a valid https:// download link.'; end if;
  old := o.status;
  update public.orders set delivery_url = p_url, delivery_note = nullif(trim(coalesce(p_note, '')), ''), delivered_at = now(), status = 'completed' where id = p_order;
  insert into public.order_status_history (order_id, from_status, to_status, note, client_visible, actor_id)
  values (p_order, old, 'completed', 'Delivered. Your files are available on this page.', true, auth.uid());
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), 'DELIVERED', 'orders', p_order::text, jsonb_build_object('status', old), jsonb_build_object('status', 'completed'));
end $$;
revoke execute on function public.admin_deliver_order(uuid, text, text) from public, anon;
grant execute on function public.admin_deliver_order(uuid, text, text) to authenticated;

------------------------------------------------------------------ track_order: reveal delivery only when paid in full
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
    'methods', case when ps->>'state' = 'due' then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'label', label,
              'account_name', account_name, 'account_number', account_number, 'qris_image_url', qris_image_url, 'instructions', instructions)
              order by sort_order, created_at) from public.payment_methods where is_active), '[]'::jsonb) else '[]'::jsonb end,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'status', status, 'method_label', method_label,
              'created_at', created_at, 'review_note', case when status = 'rejected' then review_note end) order by created_at)
              from public.order_payments where order_id = o.id), '[]'::jsonb),
    'delivery', case when ps->>'state' = 'paid' and o.delivery_url is not null
              then jsonb_build_object('url', o.delivery_url, 'note', o.delivery_note, 'delivered_at', o.delivered_at) end);
end $$;

------------------------------------------------------------------ guard: no "completed" without full payment
create or replace function public.admin_set_order_status(p_order uuid, p_status text, p_note text default null, p_client_visible boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare old_status text; q numeric; paid numeric;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select status, quoted_total into old_status, q from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.'; end if;
  if p_status = 'completed' then
    select coalesce(sum(amount), 0) into paid from public.order_payments where order_id = p_order and status = 'confirmed';
    if q is null or q <= 0 or paid < q then
      raise exception 'Locked: cannot complete before the final payment is confirmed. Use Deliver after payment.'; end if;
  end if;
  update public.orders set status = p_status where id = p_order;
  insert into public.order_status_history (order_id, from_status, to_status, note, client_visible, actor_id)
  values (p_order, old_status, p_status, nullif(trim(p_note), ''), p_client_visible, auth.uid());
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), 'STATUS', 'orders', p_order::text, jsonb_build_object('status', old_status), jsonb_build_object('status', p_status));
end $$;

------------------------------------------------------------------ balance confirmed -> ready_for_delivery (server decides)
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
    nxt := case when pay.kind = 'balance' then 'ready_for_delivery' else coalesce(p_next_status, 'in_progress') end;
    select * into o from public.orders where id = pay.order_id for update;
    old := o.status;
    if old is distinct from nxt and nxt <> 'completed' then
      update public.orders set status = nxt where id = o.id;
      insert into public.order_status_history (order_id, from_status, to_status, note, client_visible, actor_id)
      values (o.id, old, nxt, case pay.kind when 'deposit' then 'Deposit confirmed' else 'Final payment confirmed. Your files are being prepared for delivery.' end, true, auth.uid());
    end if;
  end if;
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), case when p_approve then 'PAYMENT_CONFIRMED' else 'PAYMENT_REJECTED' end, 'order_payments', p_payment::text,
          jsonb_build_object('status', 'pending'), jsonb_build_object('status', case when p_approve then 'confirmed' else 'rejected' end, 'amount', pay.amount, 'kind', pay.kind));
end $$;

revoke execute on function public.client_approve(text, text), public.client_request_changes(text, text, text) from public;
grant execute on function public.client_approve(text, text), public.client_request_changes(text, text, text) to anon, authenticated;
revoke execute on function public.admin_set_order_status(uuid, text, text, boolean), public.admin_review_payment(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, text, text, boolean), public.admin_review_payment(uuid, boolean, text, text) to authenticated;
