-- Seed: starting content only. No prices, testimonials, stats or invented clients.
-- Services start as published "quotation only" so admin sets real prices; portfolio starts as DRAFT.

insert into public.services (slug, name, category, summary, custom_quote, status, publish_state, is_featured, sort_order) values
 ('model-humanoid',  'Model Humanoid',            'Model', 'Humanoid character models for Roblox.', true, 'available', 'published', true, 10),
 ('model-creature',  'Model Animal / Creature',   'Model', 'Animal and creature models.',           true, 'available', 'published', true, 20),
 ('model-props',     'Model Props',               'Model', 'Props and environment objects.',        true, 'available', 'published', false, 30),
 ('pose-animation',  'Basic Pose Animation',      'Animation', 'Basic pose animation for characters.', true, 'available', 'published', false, 40),
 ('texturing-pbr',   'Texturing Basic PBR',       'Texturing', 'Basic PBR texturing.',              true, 'available', 'published', false, 50),
 ('rigging',         'Rigging Model',             'Rigging', 'Rigging for models.',                 true, 'available', 'published', false, 60),
 ('ugc-validation',  'UGC Model + Validation',    'UGC', 'UGC accessory models prepared for Roblox validation.', true, 'available', 'published', true, 70)
on conflict (slug) do nothing;

insert into public.service_tiers (service_id, name, sort_order)
select s.id, t.name, t.ord from public.services s
cross join (values ('Low',1),('Mid',2),('Advanced',3)) as t(name, ord)
where not exists (select 1 from public.service_tiers x where x.service_id = s.id);

-- extra brief fields per service type (form adapts to the service)
update public.services set brief_fields = '[
  {"key":"accessory_type","label":"Accessory type","type":"text","required":true},
  {"key":"target_avatar","label":"Target avatar (R6 / R15 / Rthro / other)","type":"text","required":true},
  {"key":"fitting","label":"Fitting requirements","type":"textarea","required":false}]'::jsonb
 where slug = 'ugc-validation';
update public.services set brief_fields = '[
  {"key":"character_type","label":"Character type","type":"text","required":true},
  {"key":"motion","label":"Motion / pose needed","type":"textarea","required":true},
  {"key":"duration","label":"Duration","type":"text","required":false},
  {"key":"rig","label":"Rig available? (yes / no / need rigging)","type":"text","required":true}]'::jsonb
 where slug = 'pose-animation';

-- real projects from the old site, kept as DRAFT until the admin attaches final artwork
insert into public.portfolio_projects (slug, title, category, summary, status, sort_order) values
 ('tebak-music-with-miya', 'Tebak Music with Miya', 'Game',  'Mini game tebak lagu buat hangout bareng teman.', 'draft', 10),
 ('the-last-vacation',     'The Last Vacation',     'Game',  'Game horror Roblox tentang bus misterius dengan karakter Aru dan beberapa chapter.', 'draft', 20),
 ('expedition-libra',      'Expedition Libra',      'Model', 'Model patung, kapal custom, monster rigging + animasi, dan mount model.', 'draft', 30),
 ('hollow-forest',         'Hollow Forest',         'Model', '4 model low poly: Clown Killer, Crocs, Wolf, Police, plus sistem jumpscare.', 'draft', 40),
 ('noni-belanda-props',    'Noni Belanda & Props Pack', 'Model', 'Booth low poly, Noni Belanda & anak, teddy bear, parasol, BR, dan celurit.', 'draft', 50),
 ('ugc-nekomata-tails',    'UGC Nekomata Tails',    'UGC',   'Aksesori UGC Nekomata Tails.', 'draft', 60)
on conflict (slug) do nothing;

-- site settings (published + draft start identical)
insert into public.site_settings (key, value) values
 ('brand', '{"name":"Kanasa Studio","partner":"Dhandang Studio","logo_url":"assets/kanasa-logo.png","favicon_url":"assets/kanasa-logo.png"}'),
 ('theme', '{"bg":"#0b0b0c","surface":"#141415","surface2":"#1c1c1e","text":"#f2efe9","muted":"#8d8a85","accent":"#d6322d","border":"#2a2a2c","font":"inter","body_size":16,"heading_scale":1,"container":1240,"radius":2,"button_style":"solid"}'),
 ('hero', '{"headline":"3D models, rigs and animation for Roblox.","description":"Kanasa Studio, in collaboration with Dhandang Studio, builds humanoids, creatures, props, textures, rigs and UGC items on commission.","artwork_url":"assets/hero-mascot.png","artwork_alt":"Kanasa Studio robot mascot","cta_primary":{"label":"Explore Services","href":"#/services"},"cta_secondary":{"label":"Start a Commission","href":"#/order"}}'),
 ('sections', '[{"id":"hero","visible":true,"layout":"split"},{"id":"services","visible":true,"layout":"list"},{"id":"portfolio","visible":true,"layout":"grid"},{"id":"workflow","visible":true,"layout":"steps"},{"id":"availability","visible":true,"layout":"banner"},{"id":"faq","visible":true,"layout":"list"},{"id":"contact","visible":true,"layout":"split"}]'),
 ('nav', '[{"label":"Services","href":"#/services"},{"label":"Portfolio","href":"#/portfolio"},{"label":"About","href":"#/about"},{"label":"Track","href":"#/track"},{"label":"Order","href":"#/order"}]'),
 ('availability', '{"status":"open","note":""}'),
 ('contact', '{"email":"wiwaha12345@gmail.com","discord_url":"https://discord.gg/kxCjtQyYq","whatsapp":"","hours":"Senin-Minggu, 08:00-20:00 WIB","location":"Indonesia (remote)"}'),
 ('socials', '[{"label":"Instagram","url":"https://www.instagram.com/kanasa_studio/"},{"label":"Discord","url":"https://discord.gg/kxCjtQyYq"},{"label":"YouTube","url":"https://www.youtube.com/@kanasastudio"},{"label":"TikTok","url":"https://www.tiktok.com/@kanasa_studio"}]'),
 ('workflow', '[{"title":"Choose a service","text":"Pick a service and tier, or ask for a custom quotation."},{"title":"Send your brief","text":"Describe the project and attach references."},{"title":"Review & quotation","text":"We review the request and confirm scope, price and timeline."},{"title":"Production","text":"Work starts after the quotation is agreed. Revisions follow the service terms."},{"title":"Delivery","text":"Final files are delivered and the order is marked completed."}]'),
 ('faq', '[]'),
 ('about', '{"title":"About","body":"Kanasa Studio is a small indie studio working on Roblox games, 3D models and animation. We often collaborate with Dhandang Studio."}'),
 ('footer', '{"text":"© Kanasa Studio. Supported by Dhandang Studio."}'),
 ('order', '{"currency":"IDR","min_budget":null,"max_files":5,"max_file_mb":10,"terms":"","revision_info":"","confirm_whatsapp":false,"confirm_discord":true}'),
 ('maintenance', '{"enabled":false,"message":"We will be back shortly."}'),
 ('seo', '{"title":"Kanasa Studio — Roblox 3D models, rigging & animation","description":"Commission 3D models, rigging, texturing and animation for Roblox.","og_image":"assets/hero-mascot.png"}')
on conflict (key) do nothing;

insert into public.site_settings_draft (key, value) select key, value from public.site_settings on conflict (key) do nothing;
