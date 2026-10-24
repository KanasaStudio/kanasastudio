-- Real price list (IDR) from the studio's price-list poster, plus coming-soon services and pricing page settings.
-- Only UPDATE/INSERT; existing orders keep their own price snapshots.

with t(slug, ord, name, descr, pmin, pmax) as (values
 ('model-humanoid',1,'Low Poly',null,200000,300000),
 ('model-humanoid',2,'Mid Poly',null,350000,550000),
 ('model-humanoid',3,'Custom / kompleks','Mulai Rp600.000, dikonfirmasi lewat quotation',null::numeric,null::numeric),
 ('model-creature',1,'Low Poly / sederhana',null,250000,350000),
 ('model-creature',2,'Mid Poly / detail menengah',null,400000,700000),
 ('model-creature',3,'Custom / kompleks','Mulai Rp750.000, dikonfirmasi lewat quotation',null,null),
 ('model-props',1,'Small prop',null,50000,100000),
 ('model-props',2,'Medium prop',null,100000,200000),
 ('model-props',3,'Large / complex prop','Rp200K - Rp350K+, prop sangat kompleks bisa lebih',200000,350000),
 ('pose-animation',1,'Humanoid: simple pose / gesture',null,50000,80000),
 ('pose-animation',2,'Humanoid: idle / walk / run',null,80000,150000),
 ('pose-animation',3,'Humanoid: custom action',null,150000,200000),
 ('pose-animation',4,'Animal/Creature: simple pose / gesture',null,75000,100000),
 ('pose-animation',5,'Animal/Creature: idle / walk / run',null,100000,175000),
 ('pose-animation',6,'Animal/Creature: custom action',null,175000,250000),
 ('texturing-pbr',1,'Basic material / simple texture',null,75000,100000),
 ('texturing-pbr',2,'PBR texturing standar',null,100000,150000),
 ('texturing-pbr',3,'Detail lebih tinggi',null,150000,200000),
 ('rigging',1,'Basic rig',null,75000,125000),
 ('rigging',2,'Standard rig',null,125000,200000),
 ('rigging',3,'Advanced rig','Rp200K - Rp300K+, facial rig / IK-FK khusus bisa dikenakan biaya custom',200000,300000),
 ('ugc-validation',1,'Simple accessory',null,200000,300000),
 ('ugc-validation',2,'Medium complexity',null,300000,450000),
 ('ugc-validation',3,'Complex accessory','Rp450K - Rp600K+',450000,600000)),
upd as (
  update public.service_tiers st
     set name = t.name, description = t.descr, price_min = t.pmin, price_max = t.pmax, is_active = true
    from t join public.services s on s.slug = t.slug
   where st.service_id = s.id and st.sort_order = t.ord
  returning s.slug, st.sort_order)
insert into public.service_tiers (service_id, name, description, price_min, price_max, sort_order)
select s.id, t.name, t.descr, t.pmin, t.pmax, t.ord
  from t join public.services s on s.slug = t.slug
 where not exists (select 1 from upd u where u.slug = t.slug and u.sort_order = t.ord);

update public.services s set custom_quote = false, price_min = v.pmin, price_max = v.pmax, summary = v.summ
  from (values
   ('model-humanoid',200000,550000,'Karakter manusia, chibi, fantasy character, dan avatar custom (Low-Mid Poly).'),
   ('model-creature',250000,700000,'Hewan, monster, pet, dragon, dan fantasy creature (Low-Mid Poly).'),
   ('model-props',50000,350000,'Pedang, potion, pet accessory, furniture, rumah, dan environment props (Small-Big).'),
   ('pose-animation',50000,250000,'Animasi pose dasar 1-10 detik untuk humanoid dan animal/creature. Harga mengasumsikan rig siap digunakan; rig baru, gerakan kompleks, dan banyak variasi dihitung terpisah.'),
   ('texturing-pbr',75000,200000,'Texture maps, resolusi, UV unwrapping, dan baking disepakati berdasarkan kebutuhan proyek.'),
   ('rigging',75000,300000,'Basic sampai advanced rig. Facial rig, IK/FK khusus, creature rig kompleks, dan kontrol tambahan dapat dikenakan biaya custom.'),
   ('ugc-validation',200000,600000,'Modeling aksesori, pemeriksaan teknis, optimasi mesh, dan fitting sesuai ruang lingkup yang disepakati.')
  ) as v(slug, pmin, pmax, summ)
 where s.slug = v.slug;

update public.services set excludes = array['Jaminan persetujuan atau publikasi oleh Roblox'] where slug = 'ugc-validation' and excludes = '{}';
update public.services set excludes = array['Pembuatan rig baru, gerakan kompleks, dan banyak variasi gerakan (dihitung terpisah)'] where slug = 'pose-animation' and excludes = '{}';

insert into public.services (slug, name, category, summary, custom_quote, status, publish_state, sort_order) values
 ('cinematic-scene',  'Cinematic Scene',            'Animation', 'Environment, composition, lighting, dan cinematic rendering.', true, 'coming_soon', 'published', 80),
 ('pbr-texture-hd',   'PBR Texture High Definition','Texturing', 'Material beresolusi tinggi dengan detail tekstur dan maps sesuai kebutuhan.', true, 'coming_soon', 'published', 90),
 ('smooth-blender-animation', 'Smooth Blender Animation', 'Animation', 'Animasi dengan gerakan lebih halus, transisi, timing, dan secondary motion.', true, 'coming_soon', 'published', 100)
on conflict (slug) do nothing;

-- pricing page content (editable in Site editor), published + draft
insert into public.site_settings (key, value) values
 ('pricing', '{"price_image_url":"assets/price-list.webp","price_image_alt":"Kanasa Studio x Dhandang Studio price list: 3D model and Roblox services","illustration_image_url":"assets/service-illustration.webp","illustration_alt":"Service illustration: examples of each 3D model and Roblox service"}'),
 ('pricing_notes', '[{"text":"Final price depends on complexity, details, revisions, and deadline."},{"text":"Modeling, texturing, rigging, and animation are priced separately unless included in a package."},{"text":"Major revisions or changes to the approved concept may incur additional charges."},{"text":"Currently accepting UGC Accessories commissions only."}]')
on conflict (key) do nothing;

-- add "pricing" home section (after services) and "Pricing" nav item (after Services), once
do $$ declare tbl text; begin
 foreach tbl in array array['site_settings','site_settings_draft'] loop
  execute format($f$
   update public.%1$I set value = (select jsonb_agg(e order by o) from (
        select e, o::numeric as o from jsonb_array_elements(value) with ordinality as t(e, o)
        union all select '{"id":"pricing","visible":true,"layout":"table"}'::jsonb,
          (select o from jsonb_array_elements(value) with ordinality as t(e, o) where e->>'id' = 'services') + 0.5) x)
    where key = 'sections' and not exists (select 1 from jsonb_array_elements(value) e where e->>'id' = 'pricing')
      and exists (select 1 from jsonb_array_elements(value) e where e->>'id' = 'services')$f$, tbl);
  execute format($f$
   update public.%1$I set value = (select jsonb_agg(e order by o) from (
        select e, o::numeric as o from jsonb_array_elements(value) with ordinality as t(e, o)
        union all select '{"label":"Pricing","href":"#/pricing"}'::jsonb,
          (select o from jsonb_array_elements(value) with ordinality as t(e, o) where e->>'href' = '#/services') + 0.5) x)
    where key = 'nav' and not exists (select 1 from jsonb_array_elements(value) e where e->>'href' = '#/pricing')
      and exists (select 1 from jsonb_array_elements(value) e where e->>'href' = '#/services')$f$, tbl);
 end loop;
end $$;
insert into public.site_settings_draft (key, value) select key, value from public.site_settings where key in ('pricing','pricing_notes') on conflict (key) do nothing;
