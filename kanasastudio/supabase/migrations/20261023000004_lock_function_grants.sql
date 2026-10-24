-- Functions created after the blanket REVOKE inherited Postgres' default EXECUTE-to-PUBLIC.
-- Admin RPCs are for signed-in users only (they also check is_admin() internally).
revoke execute on function public.admin_set_order_status(uuid,text,text,boolean), public.admin_dashboard(),
  public.publish_site_settings(text), public.rollback_site_settings(bigint) from public, anon;
grant execute on function public.admin_set_order_status(uuid,text,text,boolean), public.admin_dashboard(),
  public.publish_site_settings(text), public.rollback_site_settings(bigint) to authenticated;
-- trigger-only functions must not be callable over the API
revoke execute on function public.audit_row(), public.set_updated_at() from public, anon, authenticated;
-- create_order / track_order / client_reply are intentionally public (token-gated or server-validated);
-- is_admin / is_owner must stay executable because RLS policies call them as the requesting role.
