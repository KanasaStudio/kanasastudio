-- Kanasa Studio x Dhandang Studio — core schema (additive, non-destructive).
-- Audited target: project geroipkbzmbkigzwjdok had NO tables and NO migrations when this was written.
-- Everything uses IF NOT EXISTS / ON CONFLICT so it is safe to re-run.

------------------------------------------------------------------ helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

------------------------------------------------------------------ auth / roles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('owner','admin'));
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'owner');
$$;

------------------------------------------------------------------ services
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  category text not null,
  summary text,
  description text,
  cover_url text,
  cover_alt text,
  price_min numeric(12,2) check (price_min >= 0),
  price_max numeric(12,2) check (price_max >= 0),
  custom_quote boolean not null default false,       -- true => no automatic price, quotation only
  deliverables text[] not null default '{}',
  includes text[] not null default '{}',
  excludes text[] not null default '{}',
  turnaround text,                                    -- free text, e.g. "5-7 days" (only when decided)
  revisions_included int check (revisions_included >= 0),
  status text not null default 'available' check (status in ('available','unavailable','coming_soon')),
  publish_state text not null default 'draft' check (publish_state in ('draft','published','archived')),
  is_featured boolean not null default false,
  sort_order int not null default 0,
  brief_fields jsonb not null default '[]'::jsonb,   -- extra form fields: [{key,label,type,required,options}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_max is null or price_min is null or price_max >= price_min)
);
create index if not exists services_public_idx on public.services (publish_state, sort_order);

create table if not exists public.service_tiers (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,                                 -- Low / Mid / Advanced / custom
  description text,
  price_min numeric(12,2) check (price_min >= 0),
  price_max numeric(12,2) check (price_max >= 0),
  turnaround text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_max is null or price_min is null or price_max >= price_min)
);
create index if not exists service_tiers_service_idx on public.service_tiers (service_id, sort_order);

create table if not exists public.service_addons (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null default 0 check (price >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_addons_service_idx on public.service_addons (service_id, sort_order);

------------------------------------------------------------------ portfolio
create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  category text not null,
  summary text,
  description text,
  software text[] not null default '{}',
  service_types text[] not null default '{}',
  specs jsonb not null default '{}'::jsonb,          -- e.g. {"tris":"3k","texture":"1024"}
  cover_url text,
  cover_alt text,
  badge text,                                        -- optional short label e.g. "Sold"
  external_url text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_featured boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portfolio_public_idx on public.portfolio_projects (status, sort_order);

create table if not exists public.portfolio_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portfolio_projects(id) on delete cascade,
  kind text not null default 'image' check (kind in ('image','model')),   -- model = glTF/GLB
  url text not null,
  alt text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists portfolio_media_project_idx on public.portfolio_media (project_id, sort_order);

------------------------------------------------------------------ site settings (draft / published / history)
create table if not exists public.site_settings (          -- PUBLISHED values, readable by visitors
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.site_settings_draft (    -- admin only
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.site_settings_versions ( -- rollback history, admin only
  id bigint generated always as identity primary key,
  snapshot jsonb not null,
  note text,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------ orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  access_token_hash text not null,                         -- sha256 of the token shown once to the client
  idempotency_key text unique,
  status text not null default 'new_request' check (status in (
    'new_request','under_review','awaiting_client','quotation_sent','awaiting_payment',
    'in_progress','revision','completed','cancelled')),
  client_name text not null check (char_length(client_name) between 2 and 80),
  client_email text not null check (client_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(client_email) <= 254),
  client_discord text check (char_length(client_discord) <= 80),
  budget numeric(12,2) check (budget >= 0),
  deadline date,
  brief text not null check (char_length(brief) between 10 and 4000),
  currency text not null default 'IDR',
  needs_quote boolean not null default false,
  estimated_min numeric(12,2),
  estimated_max numeric(12,2),
  quoted_total numeric(12,2) check (quoted_total >= 0),
  quoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_email_idx on public.orders (client_email, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  tier_id uuid references public.service_tiers(id) on delete set null,
  -- SNAPSHOT: later price/name changes never touch old orders
  service_name text not null,
  tier_name text,
  unit_price_min numeric(12,2),
  unit_price_max numeric(12,2),
  quantity int not null default 1 check (quantity between 1 and 50),
  addons jsonb not null default '[]'::jsonb,               -- [{id,name,price}]
  brief jsonb not null default '{}'::jsonb,                -- service-specific answers
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_path text not null,                              -- in private bucket order-attachments
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists order_attachments_order_idx on public.order_attachments (order_id);

create table if not exists public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  client_visible boolean not null default false,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table if not exists public.order_messages (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  visibility text not null check (visibility in ('internal','client')),
  author_type text not null check (author_type in ('admin','client')),
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists order_messages_order_idx on public.order_messages (order_id, created_at);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  row_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

------------------------------------------------------------------ triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','services','service_tiers','service_addons','portfolio_projects','orders'] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), tg_op, tg_table_name, coalesce(r->>'id', r->>'key', r->>'user_id'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['services','service_tiers','service_addons','portfolio_projects','portfolio_media','site_settings','user_roles'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;
drop trigger if exists orders_audit on public.orders;
create trigger orders_audit after update or delete on public.orders for each row execute function public.audit_row();
