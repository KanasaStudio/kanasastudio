-- MANUAL ROLLBACK ONLY. Destroys every table created by migrations 1-3. Take a backup first
-- (Dashboard > Database > Backups) and never run this automatically.
drop table if exists public.audit_logs, public.order_messages, public.order_status_history, public.order_attachments,
  public.order_items, public.orders, public.site_settings_versions, public.site_settings_draft, public.site_settings,
  public.portfolio_media, public.portfolio_projects, public.service_addons, public.service_tiers, public.services,
  public.user_roles, public.profiles cascade;
drop function if exists public.create_order(jsonb), public.track_order(text,text), public.client_reply(text,text,text),
  public.admin_set_order_status(uuid,text,text,boolean), public.admin_dashboard(), public.publish_site_settings(text),
  public.rollback_site_settings(bigint), public.is_admin(), public.is_owner(), public.audit_row(), public.set_updated_at();
delete from storage.buckets where id in ('public-media','order-attachments');  -- only works once buckets are emptied
