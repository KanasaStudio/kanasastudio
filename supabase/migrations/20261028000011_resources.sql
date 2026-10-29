-- Creator resources directory: curated links to tools, filterable, managed in admin.
create table if not exists public.resource_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 60),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  url text not null check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  description text check (char_length(description) <= 300),
  category_id uuid not null references public.resource_categories(id) on delete restrict,
  pricing text not null default 'free' check (pricing in ('free','freemium','paid')),
  tags text[] not null default '{}',
  icon_url text check (icon_url is null or icon_url ~ '^https://'),
  is_featured boolean not null default false,
  status text not null default 'published' check (status in ('draft','published','archived')),
  sort_order int not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists resources_cat_idx on public.resources(category_id);

alter table public.resource_categories enable row level security;
alter table public.resources enable row level security;
revoke all on public.resource_categories, public.resources from anon, authenticated;
grant select on public.resource_categories, public.resources to anon, authenticated;
grant insert, update, delete on public.resource_categories, public.resources to authenticated;
create policy rc_read on public.resource_categories for select to anon, authenticated using (is_active or public.is_admin());
create policy rc_write on public.resource_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy rs_read on public.resources for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy rs_write on public.resources for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger resource_categories_set_updated_at before update on public.resource_categories for each row execute function public.set_updated_at();
create trigger resources_set_updated_at before update on public.resources for each row execute function public.set_updated_at();
create trigger resource_categories_audit after insert or update or delete on public.resource_categories for each row execute function public.audit_row();
create trigger resources_audit after insert or update or delete on public.resources for each row execute function public.audit_row();

insert into public.resource_categories (slug, name, sort_order) values
 ('video-editing','Video Editing',10),
 ('design','Design & Graphics',20),
 ('3d-animation','3D & Animation',30),
 ('audio-sfx','Audio & SFX',40),
 ('roblox-dev','Roblox Dev',50),
 ('stock-assets','Stock & Free Assets',60),
 ('fonts','Fonts',70),
 ('utilities','Utilities',80)
on conflict (slug) do nothing;

insert into public.resources (title, url, description, category_id, pricing, tags, is_featured, sort_order)
select v.title, v.url, v.descr, c.id, v.pricing, v.tags, v.feat, v.ord
from (values
 ('CapCut','https://www.capcut.com','Editor video simpel untuk short-form: template, caption otomatis, efek.','video-editing','freemium',array['video','shorts','caption']::text[],true,10),
 ('DaVinci Resolve','https://www.blackmagicdesign.com/products/davinciresolve','Editor video + color grading kelas profesional, versi gratisnya sudah sangat lengkap.','video-editing','freemium',array['video','color','pro']::text[],false,20),
 ('Kdenlive','https://kdenlive.org','Editor video open-source, gratis tanpa watermark.','video-editing','free',array['video','open-source']::text[],false,30),
 ('Shotcut','https://shotcut.org','Editor video ringan dan gratis untuk PC spek rendah.','video-editing','free',array['video','open-source']::text[],false,40),
 ('Canva','https://www.canva.com','Desain thumbnail, poster, dan konten sosmed dengan template siap pakai.','design','freemium',array['thumbnail','poster','template']::text[],true,50),
 ('Figma','https://www.figma.com','Desain UI dan kolaborasi tim langsung di browser.','design','freemium',array['ui','design']::text[],false,60),
 ('Photopea','https://www.photopea.com','Editor ala Photoshop yang jalan di browser, bisa buka PSD.','design','free',array['photo','psd','browser']::text[],true,70),
 ('Krita','https://krita.org','Aplikasi menggambar dan painting digital gratis.','design','free',array['drawing','open-source']::text[],false,80),
 ('GIMP','https://www.gimp.org','Editor gambar open-source untuk retouch dan komposisi.','design','free',array['photo','open-source']::text[],false,90),
 ('Blender','https://www.blender.org','Software 3D gratis: modeling, rigging, animasi, render.','3d-animation','free',array['3d','modeling','animation']::text[],true,100),
 ('Mixamo','https://www.mixamo.com','Rig otomatis dan ribuan animasi karakter siap pakai (butuh akun Adobe gratis).','3d-animation','free',array['rig','animation']::text[],true,110),
 ('Sketchfab','https://sketchfab.com','Tempat melihat, menyimpan, dan mencari model 3D.','3d-animation','freemium',array['3d','models']::text[],false,120),
 ('Poly Haven','https://polyhaven.com','HDRI, tekstur, dan model 3D berlisensi CC0, gratis tanpa akun.','3d-animation','free',array['hdri','texture','cc0']::text[],true,130),
 ('ambientCG','https://ambientcg.com','Library tekstur PBR berlisensi CC0.','3d-animation','free',array['texture','pbr','cc0']::text[],false,140),
 ('Freesound','https://freesound.org','Ribuan sound effect dari komunitas. Cek lisensi tiap file.','audio-sfx','free',array['sfx','audio']::text[],true,150),
 ('Mixkit','https://mixkit.co','Sound effect, musik, dan video gratis dengan lisensi sederhana.','audio-sfx','free',array['sfx','music']::text[],false,160),
 ('ElevenLabs','https://elevenlabs.io','Buat voice-over dan sound effect dari teks dengan AI.','audio-sfx','freemium',array['ai','sfx','voice']::text[],true,170),
 ('Audacity','https://www.audacityteam.org','Editor audio gratis untuk rekam, potong, dan bersihkan suara.','audio-sfx','free',array['audio','open-source']::text[],false,180),
 ('Roblox Creator Hub','https://create.roblox.com','Pusat resmi untuk dokumentasi, asset, dan publikasi pengalaman Roblox.','roblox-dev','free',array['roblox','docs']::text[],true,190),
 ('Roblox DevForum','https://devforum.roblox.com','Forum developer Roblox: tanya jawab, update, dan resource.','roblox-dev','free',array['roblox','community']::text[],false,200),
 ('Rojo','https://rojo.space','Sinkronkan kode ke Roblox Studio dan pakai Git serta editor favoritmu.','roblox-dev','free',array['roblox','tooling','git']::text[],false,210),
 ('Unsplash','https://unsplash.com','Foto stock gratis berkualitas tinggi.','stock-assets','free',array['photo','stock']::text[],false,220),
 ('Pexels','https://www.pexels.com','Foto dan video stock gratis untuk konten.','stock-assets','free',array['photo','video','stock']::text[],true,230),
 ('Pixabay','https://pixabay.com','Gambar, video, musik, dan sound effect gratis.','stock-assets','free',array['stock','music','sfx']::text[],false,240),
 ('Google Fonts','https://fonts.google.com','Ribuan font gratis untuk web dan desain.','fonts','free',array['font']::text[],true,250),
 ('dafont','https://www.dafont.com','Font gratis yang unik. Cek lisensi untuk pemakaian komersial.','fonts','free',array['font']::text[],false,260),
 ('remove.bg','https://www.remove.bg','Hapus background gambar otomatis dalam hitungan detik.','utilities','freemium',array['background','photo']::text[],true,270),
 ('TinyPNG','https://tinypng.com','Kompres PNG dan JPG tanpa kehilangan kualitas yang terlihat.','utilities','freemium',array['compress','image']::text[],false,280),
 ('Squoosh','https://squoosh.app','Kompres dan konversi gambar (WebP, AVIF) langsung di browser.','utilities','free',array['compress','webp']::text[],false,290),
 ('CloudConvert','https://cloudconvert.com','Konversi hampir semua format file: video, audio, gambar, dokumen.','utilities','freemium',array['convert','files']::text[],false,300)
) as v(title, url, descr, cat, pricing, tags, feat, ord)
join public.resource_categories c on c.slug = v.cat
where not exists (select 1 from public.resources);

insert into public.site_settings (key, value) values
 ('nav', '[{"href":"#/services","label":"Services"},{"href":"#/pricing","label":"Pricing"},{"href":"#/portfolio","label":"Portfolio"},{"href":"#/store","label":"Store"},{"href":"#/resources","label":"Tools"},{"href":"#/about","label":"About"},{"href":"#/track","label":"Track"},{"href":"#/order","label":"Order"}]'::jsonb),
 ('sections', '[{"id":"hero","layout":"split","visible":true},{"id":"services","layout":"list","visible":true},{"id":"pricing","layout":"table","visible":true},{"id":"portfolio","layout":"grid","visible":true},{"id":"store","layout":"grid","visible":true},{"id":"resources","layout":"grid","visible":true},{"id":"testimonials","layout":"grid","visible":true},{"id":"workflow","layout":"steps","visible":true},{"id":"availability","layout":"banner","visible":true},{"id":"faq","layout":"list","visible":true},{"id":"contact","layout":"split","visible":true}]'::jsonb)
on conflict (key) do update set value = excluded.value where public.site_settings.value::text not like '%#/resources%' and public.site_settings.value::text not like '%"resources"%';
insert into public.site_settings_draft (key, value) select key, value from public.site_settings where key in ('nav','sections')
on conflict (key) do update set value = excluded.value where public.site_settings_draft.value::text not like '%#/resources%' and public.site_settings_draft.value::text not like '%"resources"%';
