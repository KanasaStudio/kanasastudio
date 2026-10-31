-- Kanasa News: aggregated news (RSS) with sources, categories, articles, ingestion history.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.news_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 300),
  scope text not null default 'topic' check (scope in ('id','intl','topic')),
  parent_id uuid references public.news_categories(id) on delete set null,
  sort_order int not null default 100,
  is_active boolean not null default true,
  show_home boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 80),
  site_url text check (site_url is null or site_url ~ '^https://'),
  feed_url text not null unique check (feed_url ~ '^https://[^\s]+$' and char_length(feed_url) <= 500),
  language text not null default 'id' check (language ~ '^[a-z]{2}$'),
  scope text not null default 'id' check (scope in ('id','intl')),
  default_category_id uuid references public.news_categories(id) on delete set null,
  is_active boolean not null default true,
  allow_images boolean not null default true,
  allow_summary boolean not null default true,
  priority int not null default 100,
  fetch_interval_min int not null default 30 check (fetch_interval_min between 5 and 1440),
  max_items int not null default 30 check (max_items between 1 and 100),
  attribution text check (char_length(attribution) <= 200),
  fail_count int not null default 0,
  next_fetch_at timestamptz,
  last_fetched_at timestamptz, last_success_at timestamptz,
  last_error text, last_item_count int,
  etag text, last_modified text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.news_sources(id) on delete set null,
  category_id uuid references public.news_categories(id) on delete set null,
  slug text not null unique,
  guid text,
  url text not null unique check (url ~ '^https?://'),
  title text not null check (char_length(title) between 1 and 400),
  title_key text not null,
  summary text check (char_length(summary) <= 600),
  summary_kind text not null default 'feed' check (summary_kind in ('feed','edited','ai')),
  image_url text check (image_url is null or image_url ~ '^https://'),
  language text not null default 'id',
  scope text not null default 'id' check (scope in ('id','intl')),
  source_name text not null, source_slug text not null,
  tags text[] not null default '{}',
  status text not null default 'published' check (status in ('published','hidden','archived')),
  is_featured boolean not null default false,
  correction_note text check (char_length(correction_note) <= 500),
  published_at timestamptz not null,
  discovered_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(title,'') || ' ' || coalesce(summary,''))) stored);
create index if not exists news_articles_pub_idx on public.news_articles (status, published_at desc);
create index if not exists news_articles_cat_idx on public.news_articles (category_id, published_at desc);
create index if not exists news_articles_src_idx on public.news_articles (source_id, published_at desc);
create index if not exists news_articles_scope_idx on public.news_articles (scope, published_at desc);
create index if not exists news_articles_tkey_idx on public.news_articles (title_key);
create index if not exists news_articles_tsv_idx on public.news_articles using gin (search_tsv);
create index if not exists news_articles_title_trgm on public.news_articles using gin (title extensions.gin_trgm_ops);

create table if not exists public.news_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(), finished_at timestamptz,
  trigger text not null default 'cron' check (trigger in ('cron','manual')),
  status text not null default 'running' check (status in ('running','ok','partial','failed')),
  sources_total int not null default 0, fetched int not null default 0,
  inserted int not null default 0, updated int not null default 0, duplicates int not null default 0, errors int not null default 0,
  detail jsonb not null default '[]');

create table if not exists public.news_config (
  id boolean primary key default true check (id),
  auto_enabled boolean not null default true,
  retention_days int not null default 365 check (retention_days between 7 and 3650),
  ingest_key text not null default encode(extensions.gen_random_bytes(24), 'hex'));
insert into public.news_config (id) values (true) on conflict do nothing;

alter table public.news_categories enable row level security;
alter table public.news_sources enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_runs enable row level security;
alter table public.news_config enable row level security;
revoke all on public.news_categories, public.news_sources, public.news_articles, public.news_runs, public.news_config from anon, authenticated;
grant select on public.news_categories, public.news_articles to anon, authenticated;
grant insert, update, delete on public.news_categories, public.news_articles to authenticated;
grant select, insert, update, delete on public.news_sources to authenticated;
grant select on public.news_runs to authenticated;
create policy nc_read on public.news_categories for select to anon, authenticated using (is_active or public.is_admin());
create policy nc_write on public.news_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy na_read on public.news_articles for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy na_write on public.news_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ns_admin on public.news_sources for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy nr_read on public.news_runs for select to authenticated using (public.is_admin());
-- news_config: no policies and no grants → only security-definer functions and the service role can touch it.

create trigger news_categories_set_updated_at before update on public.news_categories for each row execute function public.set_updated_at();
create trigger news_sources_set_updated_at before update on public.news_sources for each row execute function public.set_updated_at();
create trigger news_articles_set_updated_at before update on public.news_articles for each row execute function public.set_updated_at();
create trigger news_categories_audit after insert or update or delete on public.news_categories for each row execute function public.audit_row();
create trigger news_sources_audit after insert or update or delete on public.news_sources for each row execute function public.audit_row();

-- Public facets (sources that actually have published articles) without exposing feed URLs.
create or replace function public.news_facets() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object('slug', source_slug, 'name', source_name, 'n', n) order by n desc)
                         from (select source_slug, max(source_name) source_name, count(*) n from public.news_articles where status = 'published' group by source_slug) s), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(language order by language) from (select distinct language from public.news_articles where status = 'published') l), '[]'::jsonb));
$$;

-- Same-event coverage: similar headlines from other sources within a few days.
create or replace function public.news_related(p_id uuid, p_limit int default 6)
returns setof public.news_articles language sql stable set search_path = '' as $$
  select b.* from public.news_articles a
  join public.news_articles b on b.id <> a.id and b.status = 'published' and b.source_slug <> a.source_slug
       and b.published_at between a.published_at - interval '3 days' and a.published_at + interval '3 days'
       and extensions.similarity(a.title, b.title) > 0.4
  where a.id = p_id
  order by extensions.similarity(a.title, b.title) desc limit least(greatest(p_limit, 1), 12);
$$;

create or replace function public.admin_news_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'articles', (select count(*) from public.news_articles),
    'published', (select count(*) from public.news_articles where status = 'published'),
    'hidden', (select count(*) from public.news_articles where status <> 'published'),
    'new_24h', (select count(*) from public.news_articles where discovered_at > now() - interval '24 hours'),
    'sources_active', (select count(*) from public.news_sources where is_active),
    'sources_failing', (select count(*) from public.news_sources where is_active and fail_count > 0),
    'last_success', (select max(last_success_at) from public.news_sources),
    'auto_enabled', (select auto_enabled from public.news_config),
    'retention_days', (select retention_days from public.news_config),
    'cron_active', coalesce((select active from cron.job where jobname = 'news-ingest'), false),
    'runs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.news_runs order by started_at desc limit 12) x), '[]'::jsonb),
    'dup_30d', (select coalesce(sum(duplicates), 0) from public.news_runs where started_at > now() - interval '30 days')
  ) into r;
  return r;
end $$;

create or replace function public.admin_news_set_config(p_auto boolean, p_retention int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.news_config set auto_enabled = coalesce(p_auto, auto_enabled), retention_days = coalesce(p_retention, retention_days);
end $$;

create or replace function public.news_cron_tick() returns void language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select * into c from public.news_config where id;
  if c.auto_enabled then
    perform net.http_post(url := 'https://geroipkbzmbkigzwjdok.supabase.co/functions/v1/news-ingest',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ingest-key', c.ingest_key),
      body := jsonb_build_object('action', 'run', 'trigger', 'cron'), timeout_milliseconds := 120000);
  end if;
  delete from public.news_articles where published_at < now() - make_interval(days => c.retention_days) and not is_featured;
  delete from public.news_runs where started_at < now() - interval '30 days';
end $$;

revoke all on function public.news_cron_tick(), public.admin_news_overview(), public.admin_news_set_config(boolean, int), public.news_facets(), public.news_related(uuid, int) from public, anon, authenticated;
grant execute on function public.news_facets(), public.news_related(uuid, int) to anon, authenticated;
grant execute on function public.admin_news_overview(), public.admin_news_set_config(boolean, int) to authenticated;

-- ---------- seed: categories ----------
insert into public.news_categories (slug, name, scope, sort_order, show_home, description) values
 ('nasional','Nasional','id',10,true,'Berita nasional Indonesia.'),
 ('politik-pemerintahan','Politik dan Pemerintahan','id',20,true,'Politik, pemerintahan, dan kebijakan publik.'),
 ('ekonomi-bisnis','Ekonomi dan Bisnis','id',30,true,'Ekonomi, bisnis, dan industri.'),
 ('hukum-kriminal','Hukum dan Kriminal','id',40,false,'Peristiwa hukum, peradilan, dan kriminalitas.'),
 ('pendidikan','Pendidikan','id',50,false,'Pendidikan dan kebijakan pendidikan.'),
 ('kesehatan','Kesehatan','id',60,false,'Kesehatan dan layanan publik.'),
 ('teknologi','Teknologi','id',70,true,'Teknologi, gawai, dan internet.'),
 ('lingkungan-bencana','Lingkungan dan Bencana','id',80,false,'Lingkungan hidup, cuaca, dan kebencanaan.'),
 ('daerah','Daerah','id',90,false,'Kabar dari daerah.'),
 ('sosial-masyarakat','Sosial dan Masyarakat','id',100,false,'Isu sosial dan kemasyarakatan.'),
 ('diplomasi-geopolitik','Diplomasi dan Geopolitik','intl',110,true,'Hubungan antarnegara dan geopolitik.'),
 ('asia-pasifik','Asia Pasifik','intl',120,true,'Berita kawasan Asia dan Pasifik.'),
 ('amerika','Amerika','intl',130,false,'Berita dari benua Amerika.'),
 ('eropa','Eropa','intl',140,false,'Berita dari Eropa.'),
 ('timur-tengah','Timur Tengah','intl',150,false,'Berita dari Timur Tengah.'),
 ('afrika','Afrika','intl',160,false,'Berita dari Afrika.'),
 ('konflik-keamanan-global','Konflik dan Keamanan Global','intl',170,false,'Konflik bersenjata dan keamanan internasional.'),
 ('sains-inovasi','Sains dan Inovasi','topic',200,true,'Sains, riset, dan inovasi.'),
 ('artificial-intelligence','Artificial Intelligence','topic',210,false,'Perkembangan kecerdasan buatan.'),
 ('keuangan-pasar','Keuangan dan Pasar','topic',220,false,'Pasar keuangan, saham, dan mata uang.'),
 ('energi','Energi','topic',230,false,'Energi dan sumber daya.'),
 ('olahraga','Olahraga','topic',240,true,'Olahraga.'),
 ('hiburan-budaya','Hiburan dan Budaya','topic',250,false,'Hiburan, film, musik, dan budaya.'),
 ('gaya-hidup','Gaya Hidup','topic',260,false,'Gaya hidup.'),
 ('opini-analisis','Opini dan Analisis','topic',270,false,'Opini dan analisis.')
on conflict (slug) do nothing;

-- ---------- seed: sources (public RSS feeds; errors are shown in admin, failing ones can be disabled) ----------
insert into public.news_sources (slug, name, site_url, feed_url, language, scope, default_category_id, priority, attribution)
select v.slug, v.name, v.site, v.feed, v.lang, v.scope, c.id, v.prio, v.name
from (values
 ('antara-terkini','ANTARA','https://www.antaranews.com','https://www.antaranews.com/rss/terkini.xml','id','id','nasional',100),
 ('antara-politik','ANTARA Politik','https://www.antaranews.com','https://www.antaranews.com/rss/politik.xml','id','id','politik-pemerintahan',100),
 ('antara-ekonomi','ANTARA Ekonomi','https://www.antaranews.com','https://www.antaranews.com/rss/ekonomi.xml','id','id','ekonomi-bisnis',100),
 ('antara-tekno','ANTARA Tekno','https://www.antaranews.com','https://www.antaranews.com/rss/tekno.xml','id','id','teknologi',100),
 ('antara-olahraga','ANTARA Olahraga','https://www.antaranews.com','https://www.antaranews.com/rss/olahraga.xml','id','id','olahraga',100),
 ('cnn-indonesia-nasional','CNN Indonesia','https://www.cnnindonesia.com','https://www.cnnindonesia.com/nasional/rss','id','id','nasional',90),
 ('cnn-indonesia-ekonomi','CNN Indonesia Ekonomi','https://www.cnnindonesia.com','https://www.cnnindonesia.com/ekonomi/rss','id','id','ekonomi-bisnis',90),
 ('cnn-indonesia-teknologi','CNN Indonesia Teknologi','https://www.cnnindonesia.com','https://www.cnnindonesia.com/teknologi/rss','id','id','teknologi',90),
 ('cnn-indonesia-internasional','CNN Indonesia Internasional','https://www.cnnindonesia.com','https://www.cnnindonesia.com/internasional/rss','id','intl','diplomasi-geopolitik',90),
 ('tempo-nasional','Tempo','https://www.tempo.co','https://rss.tempo.co/nasional','id','id','nasional',90),
 ('tempo-dunia','Tempo Dunia','https://www.tempo.co','https://rss.tempo.co/dunia','id','intl','diplomasi-geopolitik',90),
 ('cnbc-indonesia','CNBC Indonesia','https://www.cnbcindonesia.com','https://www.cnbcindonesia.com/news/rss','id','id','ekonomi-bisnis',80),
 ('bbc-world','BBC News World','https://www.bbc.com/news','https://feeds.bbci.co.uk/news/world/rss.xml','en','intl','diplomasi-geopolitik',100),
 ('bbc-asia','BBC News Asia','https://www.bbc.com/news','https://feeds.bbci.co.uk/news/world/asia/rss.xml','en','intl','asia-pasifik',100),
 ('bbc-business','BBC News Business','https://www.bbc.com/news','https://feeds.bbci.co.uk/news/business/rss.xml','en','intl','keuangan-pasar',90),
 ('bbc-technology','BBC News Technology','https://www.bbc.com/news','https://feeds.bbci.co.uk/news/technology/rss.xml','en','intl','sains-inovasi',90),
 ('bbc-science','BBC News Science','https://www.bbc.com/news','https://feeds.bbci.co.uk/news/science_and_environment/rss.xml','en','intl','sains-inovasi',90),
 ('aljazeera','Al Jazeera','https://www.aljazeera.com','https://www.aljazeera.com/xml/rss/all.xml','en','intl','timur-tengah',90),
 ('guardian-world','The Guardian World','https://www.theguardian.com/world','https://www.theguardian.com/world/rss','en','intl','diplomasi-geopolitik',90),
 ('npr-news','NPR News','https://www.npr.org','https://feeds.npr.org/1001/rss.xml','en','intl','amerika',80),
 ('dw-english','DW','https://www.dw.com/en','https://rss.dw.com/rdf/rss-en-all','en','intl','eropa',80),
 ('france24','France 24','https://www.france24.com/en','https://www.france24.com/en/rss','en','intl','eropa',80)
) as v(slug, name, site, feed, lang, scope, cat, prio)
join public.news_categories c on c.slug = v.cat
on conflict (slug) do nothing;

-- ---------- nav + home section (only when the owner has not already added them) ----------
update public.site_settings set value = (select jsonb_agg(x order by o) from (
    select x, o from jsonb_array_elements(value) with ordinality t(x, o)
    union all select '{"href":"#/news","label":"News"}'::jsonb, 5.5) s)
 where key = 'nav' and value::text not like '%#/news%';
update public.site_settings_draft set value = (select jsonb_agg(x order by o) from (
    select x, o from jsonb_array_elements(value) with ordinality t(x, o)
    union all select '{"href":"#/news","label":"News"}'::jsonb, 5.5) s)
 where key = 'nav' and value::text not like '%#/news%';
update public.site_settings set value = (select jsonb_agg(x order by o) from (
    select x, o from jsonb_array_elements(value) with ordinality t(x, o)
    union all select '{"id":"news","layout":"list","visible":true}'::jsonb, 5.5) s)
 where key = 'sections' and value::text not like '%"news"%';
update public.site_settings_draft set value = (select jsonb_agg(x order by o) from (
    select x, o from jsonb_array_elements(value) with ordinality t(x, o)
    union all select '{"id":"news","layout":"list","visible":true}'::jsonb, 5.5) s)
 where key = 'sections' and value::text not like '%"news"%';
