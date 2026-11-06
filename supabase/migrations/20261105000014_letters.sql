-- Interactive Digital Letter & Gift: categories, templates, plans, add-ons, letters, storage, RPCs.
-- Visitors never touch the tables directly: they use SECURITY DEFINER functions with a private edit token (stored hashed).

create table if not exists public.letter_categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 240),
  icon text check (char_length(icon) <= 4),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now());

create table if not exists public.letter_templates (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,60}$'),
  category_slug text not null references public.letter_categories(slug) on update cascade on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  tagline text check (char_length(tagline) <= 200),
  engine text not null check (engine ~ '^[a-z0-9-]{1,30}$'),   -- key of a module in js/letter/engines.js
  tier text not null default 'free' check (tier in ('free','premium')),
  price_idr int not null default 0 check (price_idr between 0 and 10000000),
  tags text[] not null default '{}',
  defaults jsonb not null default '{}',                          -- starting content (title, text, theme, font, effects, decor)
  options jsonb not null default '{}',                           -- which effects/decor this template offers
  thumbnail_url text check (thumbnail_url is null or thumbnail_url ~ '^https?://'),
  sort_order int not null default 100,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.letter_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 160),
  days int check (days is null or days between 1 and 3650),      -- null = never expires
  price_idr int not null default 0 check (price_idr between 0 and 10000000),
  sort_order int not null default 100,
  is_active boolean not null default true);

create table if not exists public.letter_addons (
  key text primary key check (key in ('gallery','music')),
  name text not null, description text,
  price_idr int not null default 0 check (price_idr between 0 and 10000000),
  is_active boolean not null default true);

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  edit_hash text not null,
  template_slug text references public.letter_templates(slug) on delete set null,
  template_name text, engine text not null,
  content jsonb not null,
  status text not null default 'published' check (status in ('draft','published')),
  visibility text not null default 'public' check (visibility in ('public','private')),
  plan_id uuid references public.letter_plans(id) on delete set null,
  plan_name text, plan_days int,
  addons text[] not null default '{}',
  price_idr int not null default 0,
  order_status text not null check (order_status in ('free','pending_payment','paid','cancelled')),
  order_ref text unique,
  contact text check (contact is null or char_length(contact) <= 120),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  views int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists letters_created_idx on public.letters (created_at desc);
create index if not exists letters_order_idx on public.letters (order_status);

-- ---------- access ----------
alter table public.letter_categories enable row level security;
alter table public.letter_templates enable row level security;
alter table public.letter_plans enable row level security;
alter table public.letter_addons enable row level security;
alter table public.letters enable row level security;
revoke all on public.letter_categories, public.letter_templates, public.letter_plans, public.letter_addons, public.letters from anon, authenticated;
grant select on public.letter_categories, public.letter_templates, public.letter_plans, public.letter_addons to anon, authenticated;
grant insert, update, delete on public.letter_categories, public.letter_templates, public.letter_plans, public.letter_addons to authenticated;
grant select, update, delete on public.letters to authenticated;
create policy lc_read on public.letter_categories for select to anon, authenticated using (is_active or public.is_admin());
create policy lc_write on public.letter_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lt_read on public.letter_templates for select to anon, authenticated using (is_active or public.is_admin());
create policy lt_write on public.letter_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lp_read on public.letter_plans for select to anon, authenticated using (is_active or public.is_admin());
create policy lp_write on public.letter_plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy la_read on public.letter_addons for select to anon, authenticated using (is_active or public.is_admin());
create policy la_write on public.letter_addons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy l_admin on public.letters for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- storage: visitors may drop images/audio under u/<uuid>/ ; files are public-read, never listable ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('letter-media', 'letter-media', true, 6291456, array['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/ogg','audio/wav'])
on conflict (id) do nothing;
create policy "letter-media visitor upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'letter-media' and name ~ '^u/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,80}$');
create policy "letter-media admin read" on storage.objects for select to authenticated using (bucket_id = 'letter-media' and public.is_admin());
create policy "letter-media admin delete" on storage.objects for delete to authenticated using (bucket_id = 'letter-media' and public.is_admin());

-- ---------- content validation (the only way content reaches the table) ----------
create or replace function public.letter_clean(c jsonb, addons text[]) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  prefix constant text := 'https://geroipkbzmbkigzwjdok.supabase.co/storage/v1/object/public/letter-media/';
  fonts constant text[] := array['serif','script','hand','sans','classic'];
  fxs constant text[] := array['opening','typing','hearts','confetti','petals','sparkles','gallery','closing'];
  decs constant text[] := array['tape','seal','ribbon','stars','border'];
  out jsonb := '{}'; th jsonb := '{}'; ph jsonb := '[]'; p jsonb; k text; v text; maxp int; n int := 0; arr jsonb;
begin
  if c is null or jsonb_typeof(c) <> 'object' then raise exception 'Invalid letter content'; end if;
  if char_length(c::text) > 40000 then raise exception 'Letter is too large'; end if;
  out := jsonb_build_object(
    'from', left(btrim(coalesce(c->>'from','')), 60), 'to', left(btrim(coalesce(c->>'to','')), 60),
    'title', left(btrim(coalesce(c->>'title','')), 120), 'message', left(coalesce(c->>'message',''), 4000),
    'date', case when (c->>'date') ~ '^\d{4}-\d{2}-\d{2}$' then c->>'date' else '' end,
    'lang', case when c->>'lang' = 'en' then 'en' else 'id' end,
    'font', case when c->>'font' = any(fonts) then c->>'font' else 'serif' end);
  foreach k in array array['primary','accent','bg','paper'] loop
    v := c->'theme'->>k; if v ~ '^#[0-9a-fA-F]{6}$' then th := th || jsonb_build_object(k, lower(v)); end if;
  end loop;
  out := out || jsonb_build_object('theme', th);
  foreach k in array array['effects','decor'] loop
    arr := '[]'; if jsonb_typeof(c->k) = 'array' then
      for v in select distinct x from jsonb_array_elements_text(c->k) x loop
        if (k = 'effects' and v = any(fxs)) or (k = 'decor' and v = any(decs)) then arr := arr || to_jsonb(v); end if;
      end loop; end if;
    out := out || jsonb_build_object(k, arr);
  end loop;
  maxp := case when 'gallery' = any(addons) then 12 else 3 end;
  if jsonb_typeof(c->'photos') = 'array' then
    for p in select * from jsonb_array_elements(c->'photos') loop
      exit when n >= maxp; v := p->>'url';
      if v is not null and left(v, char_length(prefix)) = prefix and char_length(v) <= 300 and v !~ '[\s"''<>]' then
        ph := ph || jsonb_build_object('url', v, 'caption', left(btrim(coalesce(p->>'caption','')), 80)); n := n + 1; end if;
    end loop; end if;
  out := out || jsonb_build_object('photos', ph);
  v := c->'music'->>'url';
  if 'music' = any(addons) and v is not null and left(v, char_length(prefix)) = prefix and char_length(v) <= 300 and v !~ '[\s"''<>]' then
    out := out || jsonb_build_object('music', jsonb_build_object('url', v, 'title', left(btrim(coalesce(c->'music'->>'title','')), 60))); end if;
  return out;
end $$;

-- ---------- visitor RPCs ----------
create or replace function public.letter_create(p_template text, p_content jsonb, p_plan uuid, p_addons text[], p_contact text default null, p_visibility text default 'public')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.letter_templates; pl public.letter_plans; ad text[]; total int; pid text; tok text; oref text; ord text; exp timestamptz; i int := 0;
begin
  select * into t from public.letter_templates where slug = p_template and is_active; if not found then raise exception 'This template is not available'; end if;
  select * into pl from public.letter_plans where id = p_plan and is_active; if not found then raise exception 'Choose a duration plan'; end if;
  ad := coalesce((select array_agg(key) from public.letter_addons where key = any(coalesce(p_addons, '{}')) and is_active), '{}');
  total := (case when t.tier = 'premium' then t.price_idr else 0 end) + pl.price_idr + coalesce((select sum(price_idr) from public.letter_addons where key = any(ad)), 0);
  loop
    pid := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    exit when not exists (select 1 from public.letters where public_id = pid); i := i + 1;
    if i > 5 then raise exception 'Try again'; end if;
  end loop;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  ord := case when total = 0 then 'free' else 'pending_payment' end;
  oref := 'LT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  exp := case when total = 0 and pl.days is not null then now() + make_interval(days => pl.days) else null end;
  insert into public.letters (public_id, edit_hash, template_slug, template_name, engine, content, visibility, plan_id, plan_name, plan_days, addons, price_idr, order_status, order_ref, contact, expires_at)
  values (pid, encode(sha256(convert_to(tok, 'utf8')), 'hex'), t.slug, t.name, t.engine, public.letter_clean(p_content, ad), case when p_visibility = 'private' then 'private' else 'public' end,
          pl.id, pl.name, pl.days, ad, total, ord, oref, nullif(left(btrim(coalesce(p_contact, '')), 120), ''), exp);
  return jsonb_build_object('public_id', pid, 'edit_token', tok, 'order_status', ord, 'order_ref', oref, 'price_idr', total, 'expires_at', exp);
end $$;

create or replace function public.letter_get(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.letters;
begin
  select * into r from public.letters where public_id = p_id; if not found then return jsonb_build_object('state', 'missing'); end if;
  if r.visibility <> 'public' or r.status <> 'published' then return jsonb_build_object('state', 'private'); end if;
  if r.order_status in ('pending_payment', 'cancelled') then return jsonb_build_object('state', 'unavailable'); end if;
  if r.expires_at is not null and r.expires_at < now() then return jsonb_build_object('state', 'expired'); end if;
  update public.letters set views = views + 1 where id = r.id;
  return jsonb_build_object('state', 'ok', 'engine', r.engine, 'content', r.content);
end $$;

create or replace function public.letter_get_edit(p_id text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.letters;
begin
  select * into r from public.letters where public_id = p_id and edit_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then return null; end if;
  return jsonb_build_object('public_id', r.public_id, 'template_slug', r.template_slug, 'template_name', r.template_name, 'engine', r.engine, 'content', r.content,
    'visibility', r.visibility, 'order_status', r.order_status, 'order_ref', r.order_ref, 'price_idr', r.price_idr, 'plan_name', r.plan_name, 'addons', r.addons,
    'views', r.views, 'expires_at', r.expires_at, 'created_at', r.created_at, 'contact', r.contact);
end $$;

create or replace function public.letter_update(p_id text, p_token text, p_content jsonb, p_visibility text, p_contact text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.letters;
begin
  select * into r from public.letters where public_id = p_id and edit_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then raise exception 'Not allowed'; end if;
  update public.letters set content = case when p_content is null then content else public.letter_clean(p_content, r.addons) end,
    visibility = case when p_visibility in ('public', 'private') then p_visibility else visibility end,
    contact = coalesce(nullif(left(btrim(coalesce(p_contact, '')), 120), ''), contact), updated_at = now()
  where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.letter_delete(p_id text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.letters where public_id = p_id and edit_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then raise exception 'Not allowed'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- admin ----------
create or replace function public.admin_letter_set_order(p_id uuid, p_order text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.letters;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_order not in ('free', 'pending_payment', 'paid', 'cancelled') then raise exception 'bad status'; end if;
  select * into r from public.letters where id = p_id; if not found then raise exception 'not found'; end if;
  update public.letters set order_status = p_order, admin_note = coalesce(p_note, admin_note), updated_at = now(),
    expires_at = case when p_order = 'paid' and r.order_status <> 'paid' then (case when r.plan_days is null then null else now() + make_interval(days => r.plan_days) end) else expires_at end
  where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_letter_extend(p_id uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_days is null or p_days not between 1 and 3650 then raise exception 'bad days'; end if;
  update public.letters set expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(days => p_days), updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.letter_clean(jsonb, text[]), public.letter_create(text, jsonb, uuid, text[], text, text), public.letter_get(text), public.letter_get_edit(text, text),
  public.letter_update(text, text, jsonb, text, text), public.letter_delete(text, text), public.admin_letter_set_order(uuid, text, text), public.admin_letter_extend(uuid, int) from public, anon, authenticated;
grant execute on function public.letter_create(text, jsonb, uuid, text[], text, text), public.letter_get(text), public.letter_get_edit(text, text),
  public.letter_update(text, text, jsonb, text, text), public.letter_delete(text, text) to anon, authenticated;
grant execute on function public.admin_letter_set_order(uuid, text, text), public.admin_letter_extend(uuid, int) to authenticated;

insert into public.letter_plans (name, description, days, price_idr, sort_order) values
  ('Free · 7 days', 'The link stays active for 7 days.', 7, 0, 10),
  ('30 days', 'The link stays active for 30 days.', 30, 10000, 20),
  ('1 year', 'The link stays active for a year.', 365, 35000, 30),
  ('Forever', 'The link never expires.', null, 75000, 40)
on conflict do nothing;
insert into public.letter_addons (key, name, description, price_idr) values
  ('gallery', 'Photo gallery (up to 12 photos)', 'Without it, a letter can hold up to 3 photos.', 5000),
  ('music', 'Background music', 'Upload one audio file that plays when the gift is opened.', 5000)
on conflict (key) do nothing;
-- seed (generated)
insert into public.letter_categories (slug,name,description,icon,sort_order) values
('love','Love & Romance','Romantic letters, anniversaries, Valentine''s Day and declarations of love.','♥',10),
('birthday','Birthday Surprise','Birthday wishes with a cake, candles and confetti.','✦',20),
('appreciation','Appreciation','Say thank you and show someone they matter.','★',30),
('family','Family Letter','Letters for parents, relatives and siblings.','⌂',40),
('friendship','Friendship','Notes for best friends and good friends.','☺',50),
('apology','Apology','A sincere letter to say sorry.','☾',60),
('graduation','Graduation','Congratulations on a big milestone.','✎',70),
('just-because','Just Because','A special message that needs no occasion.','✿',80)
on conflict (slug) do nothing;
insert into public.letter_templates (slug,category_slug,name,tagline,engine,tier,price_idr,tags,defaults,options,sort_order,is_featured) values
('midnight-rose','love','Midnight Rose','A wax-sealed envelope that opens to a typed love letter.','envelope','free',0,'{romantic,elegant}'::text[],'{"title": "Untuk Kamu yang Spesial", "message": "Untukmu,\n\nAda banyak hal yang sulit kukatakan langsung, jadi kutulis di sini. Terima kasih sudah hadir dan membuat hari-hariku terasa lebih hangat.\n\nAku bersyukur bisa mengenalmu, dan aku ingin terus ada di sisimu.", "from": "", "to": "", "theme": {"primary": "#8b1e3f", "accent": "#e8b4b8", "bg": "#1a0d12", "paper": "#fbf3ea"}, "font": "script", "effects": ["opening", "typing", "petals", "hearts", "gallery", "closing"], "decor": ["seal", "border"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "petals", "hearts", "gallery", "closing"], "decor": ["seal", "border"]}'::jsonb,10,true),
('love-in-lines','love','Love in Lines','A cinematic, line-by-line confession under a night sky.','cinematic','premium',15000,'{romantic,dark,elegant}'::text[],'{"title": "Untuk Kamu yang Spesial", "message": "Untukmu,\n\nAda banyak hal yang sulit kukatakan langsung, jadi kutulis di sini. Terima kasih sudah hadir dan membuat hari-hariku terasa lebih hangat.\n\nAku bersyukur bisa mengenalmu, dan aku ingin terus ada di sisimu.", "from": "", "to": "", "theme": {"primary": "#e5738f", "accent": "#ffd1dc", "bg": "#0b0710", "paper": "#fff7f5"}, "font": "serif", "effects": ["opening", "typing", "hearts", "sparkles", "gallery", "closing"], "decor": ["stars"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "hearts", "sparkles", "gallery", "closing"], "decor": ["stars"]}'::jsonb,20,true),
('make-a-wish','birthday','Make a Wish','Light the candles, make a wish, and let the confetti fly.','cake','free',0,'{playful,cute}'::text[],'{"title": "Selamat Ulang Tahun!", "message": "Selamat ulang tahun!\n\nSemoga hari ini penuh tawa, kue yang enak, dan semua hal baik yang kamu inginkan. Terima kasih sudah menjadi bagian dari ceritaku.\n\nTiup lilinnya dan buat satu permohonan!", "from": "", "to": "", "theme": {"primary": "#f06a8d", "accent": "#ffd166", "bg": "#fff1f5", "paper": "#ffffff"}, "font": "hand", "effects": ["opening", "typing", "confetti", "sparkles", "gallery", "closing"], "decor": ["ribbon"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "confetti", "sparkles", "gallery", "closing"], "decor": ["ribbon"]}'::jsonb,30,true),
('surprise-box','birthday','Surprise Box','A gift box that pops open with confetti and a card.','giftbox','premium',15000,'{playful,cute}'::text[],'{"title": "Selamat Ulang Tahun!", "message": "Selamat ulang tahun!\n\nSemoga hari ini penuh tawa, kue yang enak, dan semua hal baik yang kamu inginkan. Terima kasih sudah menjadi bagian dari ceritaku.\n\nTiup lilinnya dan buat satu permohonan!", "from": "", "to": "", "theme": {"primary": "#6c5ce7", "accent": "#ffd166", "bg": "#141226", "paper": "#ffffff"}, "font": "hand", "effects": ["opening", "typing", "confetti", "sparkles", "gallery", "closing"], "decor": ["ribbon", "stars"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "confetti", "sparkles", "gallery", "closing"], "decor": ["ribbon", "stars"]}'::jsonb,40,true),
('warm-thanks','appreciation','Warm Thanks','A golden envelope with a heartfelt thank-you.','envelope','free',0,'{elegant,minimal}'::text[],'{"title": "Terima Kasih dari Hati", "message": "Terima kasih.\n\nKadang kita lupa mengatakannya, tetapi bantuan dan kebaikanmu sangat berarti. Aku ingin kamu tahu bahwa semuanya dihargai.\n\nSemoga kebaikanmu kembali berlipat.", "from": "", "to": "", "theme": {"primary": "#b8860b", "accent": "#f3d28b", "bg": "#17130a", "paper": "#fffaf0"}, "font": "classic", "effects": ["opening", "typing", "sparkles", "gallery", "closing"], "decor": ["seal"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "sparkles", "gallery", "closing"], "decor": ["seal"]}'::jsonb,50,true),
('thank-you-scrapbook','appreciation','Thank-You Scrapbook','Taped polaroids and handwritten notes.','scrapbook','premium',15000,'{cute,playful}'::text[],'{"title": "Terima Kasih dari Hati", "message": "Terima kasih.\n\nKadang kita lupa mengatakannya, tetapi bantuan dan kebaikanmu sangat berarti. Aku ingin kamu tahu bahwa semuanya dihargai.\n\nSemoga kebaikanmu kembali berlipat.", "from": "", "to": "", "theme": {"primary": "#2f7d6d", "accent": "#f4b942", "bg": "#efe6d6", "paper": "#fffdf7"}, "font": "hand", "effects": ["opening", "typing", "sparkles", "gallery", "closing"], "decor": ["tape", "stars"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "sparkles", "gallery", "closing"], "decor": ["tape", "stars"]}'::jsonb,60,true),
('for-mom-and-dad','family','For Mom & Dad','A warm, simple envelope for the people who raised you.','envelope','free',0,'{elegant,minimal}'::text[],'{"title": "Surat untuk Keluarga", "message": "Untuk keluargaku,\n\nTerima kasih atas doa, kesabaran, dan kasih sayang yang tidak pernah berhenti. Aku mungkin jarang mengatakannya, tetapi kalian adalah rumahku.\n\nSehat dan bahagia selalu.", "from": "", "to": "", "theme": {"primary": "#a0522d", "accent": "#f0c987", "bg": "#1b120c", "paper": "#fff8ee"}, "font": "serif", "effects": ["opening", "typing", "petals", "gallery", "closing"], "decor": ["seal", "border"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "petals", "gallery", "closing"], "decor": ["seal", "border"]}'::jsonb,70,false),
('family-album','family','Family Album','A scrapbook of family photos with a letter at the end.','scrapbook','premium',15000,'{cute,elegant}'::text[],'{"title": "Surat untuk Keluarga", "message": "Untuk keluargaku,\n\nTerima kasih atas doa, kesabaran, dan kasih sayang yang tidak pernah berhenti. Aku mungkin jarang mengatakannya, tetapi kalian adalah rumahku.\n\nSehat dan bahagia selalu.", "from": "", "to": "", "theme": {"primary": "#7a5c3e", "accent": "#e9b872", "bg": "#efe3d0", "paper": "#fffcf5"}, "font": "serif", "effects": ["opening", "typing", "gallery", "closing"], "decor": ["tape", "border"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "gallery", "closing"], "decor": ["tape", "border"]}'::jsonb,80,false),
('best-friends','friendship','Best Friends','Polaroids pinned to a board, then a note from the heart.','scrapbook','free',0,'{playful,cute}'::text[],'{"title": "Untuk Sahabatku", "message": "Hei sahabat,\n\nTerima kasih sudah menemani dari hari-hari biasa sampai hari-hari terburuk. Tidak banyak orang yang mau tinggal, dan kamu salah satunya.\n\nSemoga pertemanan kita awet.", "from": "", "to": "", "theme": {"primary": "#e76f51", "accent": "#2a9d8f", "bg": "#f6e9dc", "paper": "#fffdf8"}, "font": "hand", "effects": ["opening", "typing", "confetti", "gallery", "closing"], "decor": ["tape", "stars"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "confetti", "gallery", "closing"], "decor": ["tape", "stars"]}'::jsonb,90,false),
('friend-box','friendship','Friend Box','A little gift box with a message inside.','giftbox','free',0,'{playful,minimal}'::text[],'{"title": "Untuk Sahabatku", "message": "Hei sahabat,\n\nTerima kasih sudah menemani dari hari-hari biasa sampai hari-hari terburuk. Tidak banyak orang yang mau tinggal, dan kamu salah satunya.\n\nSemoga pertemanan kita awet.", "from": "", "to": "", "theme": {"primary": "#0ea5a4", "accent": "#ffd166", "bg": "#0d1b1e", "paper": "#ffffff"}, "font": "sans", "effects": ["opening", "typing", "confetti", "gallery", "closing"], "decor": ["ribbon"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "confetti", "gallery", "closing"], "decor": ["ribbon"]}'::jsonb,100,false),
('im-sorry','apology','I''m Sorry','Quiet, slow, and sincere. One line at a time.','cinematic','free',0,'{minimal,dark}'::text[],'{"title": "Maafkan Aku", "message": "Aku minta maaf.\n\nAku sadar sikapku melukaimu, dan tidak ada alasan yang cukup untuk membenarkannya. Aku sedang belajar menjadi lebih baik.\n\nTerima kasih sudah mau membaca ini.", "from": "", "to": "", "theme": {"primary": "#7aa7d9", "accent": "#cfe3f7", "bg": "#0a1018", "paper": "#f4f8fc"}, "font": "serif", "effects": ["opening", "typing", "sparkles", "closing"], "decor": ["stars"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "sparkles", "closing"], "decor": ["stars"]}'::jsonb,110,false),
('graduation-gift','graduation','Graduation Gift','A gift box with confetti and a proud message.','giftbox','free',0,'{playful,elegant}'::text[],'{"title": "Selamat Lulus!", "message": "Selamat atas kelulusanmu!\n\nPerjalanan panjang, begadang, dan kerja kerasmu akhirnya terbayar. Aku bangga padamu.\n\nSelamat membuka bab baru, semoga lancar dan penuh kejutan baik.", "from": "", "to": "", "theme": {"primary": "#1d4ed8", "accent": "#fbbf24", "bg": "#0b1220", "paper": "#ffffff"}, "font": "classic", "effects": ["opening", "typing", "confetti", "sparkles", "gallery", "closing"], "decor": ["ribbon", "stars"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "confetti", "sparkles", "gallery", "closing"], "decor": ["ribbon", "stars"]}'::jsonb,120,false),
('cap-and-gown','graduation','Cap & Gown Album','A scrapbook of your years, ending in a letter.','scrapbook','premium',15000,'{elegant,cute}'::text[],'{"title": "Selamat Lulus!", "message": "Selamat atas kelulusanmu!\n\nPerjalanan panjang, begadang, dan kerja kerasmu akhirnya terbayar. Aku bangga padamu.\n\nSelamat membuka bab baru, semoga lancar dan penuh kejutan baik.", "from": "", "to": "", "theme": {"primary": "#1e3a8a", "accent": "#fbbf24", "bg": "#ece7dc", "paper": "#fffefa"}, "font": "classic", "effects": ["opening", "typing", "confetti", "gallery", "closing"], "decor": ["tape", "stars"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "confetti", "gallery", "closing"], "decor": ["tape", "stars"]}'::jsonb,130,false),
('just-because','just-because','Just Because','A starlit scene that says what you feel, line by line.','cinematic','free',0,'{minimal,dark,romantic}'::text[],'{"title": "Hanya Ingin Menyapa", "message": "Tidak ada alasan khusus.\n\nAku hanya ingin kamu tahu bahwa kamu dipikirkan hari ini. Semoga harimu menyenangkan.", "from": "", "to": "", "theme": {"primary": "#b794f6", "accent": "#f6d6ff", "bg": "#0d0a1a", "paper": "#faf5ff"}, "font": "script", "effects": ["opening", "typing", "hearts", "sparkles", "gallery", "closing"], "decor": ["stars"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "hearts", "sparkles", "gallery", "closing"], "decor": ["stars"]}'::jsonb,140,false),
('little-note','just-because','Little Note','A simple envelope for a small but meaningful message.','envelope','free',0,'{minimal,cute}'::text[],'{"title": "Hanya Ingin Menyapa", "message": "Tidak ada alasan khusus.\n\nAku hanya ingin kamu tahu bahwa kamu dipikirkan hari ini. Semoga harimu menyenangkan.", "from": "", "to": "", "theme": {"primary": "#3b82a0", "accent": "#bde0ee", "bg": "#0e1a20", "paper": "#f8fcfd"}, "font": "hand", "effects": ["opening", "typing", "petals", "gallery", "closing"], "decor": ["seal"], "lang": "id"}'::jsonb,'{"effects": ["opening", "typing", "petals", "gallery", "closing"], "decor": ["seal"]}'::jsonb,150,false)
on conflict (slug) do nothing;

create index if not exists letters_template_idx on public.letters (template_slug);
create index if not exists letters_plan_idx on public.letters (plan_id);
create index if not exists letter_templates_cat_idx on public.letter_templates (category_slug);
