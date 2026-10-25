
create extension if not exists pg_net with schema extensions;

alter table public.orders add column if not exists recovered_at timestamptz;

create table if not exists public.notify_config (
  id int primary key default 1 check (id = 1),
  discord_webhook text check (discord_webhook is null or discord_webhook ~ '^https://(discord|discordapp)\.com/api/webhooks/'),
  enabled boolean not null default true,
  site_url text check (site_url is null or site_url ~ '^https://'),
  updated_at timestamptz not null default now());
alter table public.notify_config enable row level security;
revoke all on public.notify_config from anon, authenticated;
grant select, insert, update on public.notify_config to authenticated;
create policy nc_admin on public.notify_config for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.notify_config (id) values (1) on conflict do nothing;
create trigger notify_config_set_updated_at before update on public.notify_config for each row execute function public.set_updated_at();

create table if not exists public.recover_log (id bigserial primary key, at timestamptz not null default now(), ok boolean not null);
alter table public.recover_log enable row level security;
revoke all on public.recover_log from anon, authenticated;

create or replace function public._notify(p_title text, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.notify_config;
begin
  select * into c from public.notify_config where id = 1;
  if c.discord_webhook is null or not c.enabled then return; end if;
  begin
    perform net.http_post(url := c.discord_webhook,
      body := jsonb_build_object('username', 'Kanasa Studio', 'embeds', jsonb_build_array(jsonb_build_object(
        'title', left(p_title, 200), 'description', left(coalesce(p_text, ''), 1500),
        'color', 14037549, 'url', coalesce(c.site_url || '/admin/', null)))));
  exception when others then null;
  end;
end $$;
revoke all on function public._notify(text, text) from public, anon, authenticated;

create or replace function public._trg_notify_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._notify('New order ' || new.reference, new.client_name || ' <' || new.client_email || E'>\n' || left(new.brief, 120));
  return new;
end $$;
create or replace function public._trg_notify_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  select reference into r from public.orders where id = new.order_id;
  perform public._notify('Payment proof to verify', r || ' · ' || new.kind || ' · ' || new.amount::text || ' ' || new.currency || ' · ' || coalesce(new.method_label, ''));
  return new;
end $$;
create or replace function public._trg_notify_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  if new.author_type = 'client' then
    select reference into r from public.orders where id = new.order_id;
    perform public._notify('Client message · ' || r, left(new.body, 400));
  end if;
  return new;
end $$;
revoke all on function public._trg_notify_order(), public._trg_notify_payment(), public._trg_notify_message() from public, anon, authenticated;
create trigger orders_notify after insert on public.orders for each row execute function public._trg_notify_order();
create trigger order_payments_notify after insert on public.order_payments for each row execute function public._trg_notify_payment();
create trigger order_messages_notify after insert on public.order_messages for each row execute function public._trg_notify_message();

create or replace function public.admin_test_notify() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  perform public._notify('Test notification', 'If you can read this, order alerts are working.');
end $$;
revoke execute on function public.admin_test_notify() from public, anon;
grant execute on function public.admin_test_notify() to authenticated;

create or replace function public.recover_order(p_reference text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_token text;
begin
  if (select count(*) from public.recover_log where not ok and at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many attempts. Please try again in a few minutes.' using errcode = 'P0001'; end if;
  select * into o from public.orders where reference = upper(trim(coalesce(p_reference, ''))) and client_email = lower(trim(coalesce(p_email, '')));
  if not found then
    insert into public.recover_log (ok) values (false);
    return null;
  end if;
  if o.recovered_at is not null and o.recovered_at > now() - interval '1 minute' then
    raise exception 'A new link was just issued. Please wait a minute.' using errcode = 'P0001'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.orders set access_token_hash = encode(sha256(convert_to(v_token, 'utf8')), 'hex'), recovered_at = now() where id = o.id;
  insert into public.recover_log (ok) values (true);
  insert into public.order_messages (order_id, visibility, author_type, body) values (o.id, 'internal', 'client', 'Client re-issued their tracking link (old link no longer works).');
  return jsonb_build_object('reference', o.reference, 'access_token', v_token);
end $$;
revoke execute on function public.recover_order(text, text) from public;
grant execute on function public.recover_order(text, text) to anon, authenticated;

insert into public.site_settings (key, value) values ('legal', '{"terms": {"title": "Terms of Service", "body": "These terms apply to commissions and digital products sold by the studio.\n\n1. Commissions. A commission starts when you receive a written quotation and the deposit is confirmed. The scope is what the quotation and your brief describe. Changes outside that scope may be quoted separately.\n2. Payment. Commissions are paid in two parts: a deposit before work begins and the remaining balance after you approve the finished work. Final files are delivered only after the balance is confirmed. Digital products are paid in full before the download is unlocked.\n3. Revisions. The number of included revisions is stated on each service. Extra revisions may be charged.\n4. Delivery. Files are delivered through a download link shown on your tracking page. Please download and back them up; links may expire.\n5. Usage rights. Unless the quotation says otherwise, you receive the right to use the delivered work in your own projects. You may not resell or redistribute digital products, templates or source files as they are. The studio may show the work in its portfolio.\n6. Delays. Deadlines are estimates and depend on timely feedback from you.\n7. Contact. Questions about these terms: use the contact details on the website."}, "refund": {"title": "Refund & Revision Policy", "body": "Because digital goods cannot be returned, please read this before paying.\n\nCommissions: the deposit is non-refundable once work has started. If the studio cannot deliver the agreed scope, the unused part of your payment is refunded. After you approve the work and pay the balance, the order is final.\n\nDigital products: because the download is available immediately after payment, purchases are generally final. If the file is corrupted, does not match its description, or you were charged twice, contact the studio within 7 days and we will fix it or refund you.\n\nRefunds are made to the account you paid from, within a reasonable time after approval."}, "privacy": {"title": "Privacy Policy", "body": "What we collect: the name, email and optional Discord/WhatsApp you enter when ordering, your project brief, files you upload, and payment proofs you submit.\n\nWhy: only to quote, produce, deliver and support your order and to prevent fraud.\n\nWho can see it: the studio owner and authorised staff. Data is stored with our database provider (Supabase). We do not sell your data or use it for advertising.\n\nYour access link: your tracking link contains a private token. Anyone with the link can view the order, so keep it private.\n\nRetention and deletion: order data is kept as long as needed for support and accounting. You may ask us to delete your data by contacting the studio.\n\nThis website uses your browser storage only for convenience (cart, currency choice, saved tracking links)."}}'::jsonb), ('testimonials', '[]'::jsonb), ('nav', '[{"href": "#/services", "label": "Services"}, {"href": "#/pricing", "label": "Pricing"}, {"href": "#/portfolio", "label": "Portfolio"}, {"href": "#/store", "label": "Store"}, {"href": "#/about", "label": "About"}, {"href": "#/track", "label": "Track"}, {"href": "#/order", "label": "Order"}]'::jsonb), ('sections', '[{"id": "hero", "layout": "split", "visible": true}, {"id": "services", "layout": "list", "visible": true}, {"id": "pricing", "layout": "table", "visible": true}, {"id": "portfolio", "layout": "grid", "visible": true}, {"id": "store", "layout": "grid", "visible": true}, {"id": "testimonials", "layout": "grid", "visible": true}, {"id": "workflow", "layout": "steps", "visible": true}, {"id": "availability", "layout": "banner", "visible": true}, {"id": "faq", "layout": "list", "visible": true}, {"id": "contact", "layout": "split", "visible": true}]'::jsonb)
  on conflict (key) do update set value = excluded.value where public.site_settings.key in ('nav','sections') and public.site_settings.value::text not like '%#/store%' and public.site_settings.value::text not like '%"store"%';
insert into public.site_settings_draft (key, value) values ('legal', '{"terms": {"title": "Terms of Service", "body": "These terms apply to commissions and digital products sold by the studio.\n\n1. Commissions. A commission starts when you receive a written quotation and the deposit is confirmed. The scope is what the quotation and your brief describe. Changes outside that scope may be quoted separately.\n2. Payment. Commissions are paid in two parts: a deposit before work begins and the remaining balance after you approve the finished work. Final files are delivered only after the balance is confirmed. Digital products are paid in full before the download is unlocked.\n3. Revisions. The number of included revisions is stated on each service. Extra revisions may be charged.\n4. Delivery. Files are delivered through a download link shown on your tracking page. Please download and back them up; links may expire.\n5. Usage rights. Unless the quotation says otherwise, you receive the right to use the delivered work in your own projects. You may not resell or redistribute digital products, templates or source files as they are. The studio may show the work in its portfolio.\n6. Delays. Deadlines are estimates and depend on timely feedback from you.\n7. Contact. Questions about these terms: use the contact details on the website."}, "refund": {"title": "Refund & Revision Policy", "body": "Because digital goods cannot be returned, please read this before paying.\n\nCommissions: the deposit is non-refundable once work has started. If the studio cannot deliver the agreed scope, the unused part of your payment is refunded. After you approve the work and pay the balance, the order is final.\n\nDigital products: because the download is available immediately after payment, purchases are generally final. If the file is corrupted, does not match its description, or you were charged twice, contact the studio within 7 days and we will fix it or refund you.\n\nRefunds are made to the account you paid from, within a reasonable time after approval."}, "privacy": {"title": "Privacy Policy", "body": "What we collect: the name, email and optional Discord/WhatsApp you enter when ordering, your project brief, files you upload, and payment proofs you submit.\n\nWhy: only to quote, produce, deliver and support your order and to prevent fraud.\n\nWho can see it: the studio owner and authorised staff. Data is stored with our database provider (Supabase). We do not sell your data or use it for advertising.\n\nYour access link: your tracking link contains a private token. Anyone with the link can view the order, so keep it private.\n\nRetention and deletion: order data is kept as long as needed for support and accounting. You may ask us to delete your data by contacting the studio.\n\nThis website uses your browser storage only for convenience (cart, currency choice, saved tracking links)."}}'::jsonb), ('testimonials', '[]'::jsonb), ('nav', '[{"href": "#/services", "label": "Services"}, {"href": "#/pricing", "label": "Pricing"}, {"href": "#/portfolio", "label": "Portfolio"}, {"href": "#/store", "label": "Store"}, {"href": "#/about", "label": "About"}, {"href": "#/track", "label": "Track"}, {"href": "#/order", "label": "Order"}]'::jsonb), ('sections', '[{"id": "hero", "layout": "split", "visible": true}, {"id": "services", "layout": "list", "visible": true}, {"id": "pricing", "layout": "table", "visible": true}, {"id": "portfolio", "layout": "grid", "visible": true}, {"id": "store", "layout": "grid", "visible": true}, {"id": "testimonials", "layout": "grid", "visible": true}, {"id": "workflow", "layout": "steps", "visible": true}, {"id": "availability", "layout": "banner", "visible": true}, {"id": "faq", "layout": "list", "visible": true}, {"id": "contact", "layout": "split", "visible": true}]'::jsonb)
  on conflict (key) do update set value = excluded.value where public.site_settings_draft.key in ('nav','sections') and public.site_settings_draft.value::text not like '%#/store%' and public.site_settings_draft.value::text not like '%"store"%';
