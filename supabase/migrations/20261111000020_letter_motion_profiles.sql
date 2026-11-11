-- Motion profiles: every letter template gets its own motion identity (cover, kinetic type, text reveal, transition,
-- atmosphere, particles, finale). Key stored in letter_templates.defaults.motion (Admin -> Letters -> Templates -> Motion profile);
-- the player code lives in js/letter/profiles.js, openings.js, motion.js and css/letter-motion.css.
update public.letter_templates t set defaults = coalesce(t.defaults, '{}'::jsonb) || jsonb_build_object('motion', m.motion), updated_at = now()
from (values
  ('midnight-rose', 'rose-wax'),
  ('wildflower-letter', 'wind-meadow'),
  ('vintage-roses', 'gold-ribbon'),
  ('warm-thanks', 'dusk-lamp'),
  ('for-mom-and-dad', 'vine-fold'),
  ('little-note', 'hop-note'),
  ('love-in-lines', 'line-heart'),
  ('sakura-dream', 'sakura-drift'),
  ('golden-night', 'gold-night'),
  ('im-sorry', 'rain-ink'),
  ('just-because', 'aurora-shuffle'),
  ('botanical-lines', 'ink-botanical'),
  ('thank-you-scrapbook', 'stamp-tape'),
  ('family-album', 'album-flip'),
  ('best-friends', 'sticker-pop'),
  ('cap-and-gown', 'cap-toss'),
  ('peony-box', 'peony-bloom'),
  ('surprise-box', 'shake-burst'),
  ('friend-box', 'door-box'),
  ('graduation-gift', 'scroll-roll'),
  ('make-a-wish', 'wish-smoke')
) as m(slug, motion)
where t.slug = m.slug and coalesce(t.defaults->>'motion', '') = '';

-- the public viewer now also receives the template slug and its motion profile (looked up live, so admins can change it later)
create or replace function public.letter_get(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.letters; mo text;
begin
  select * into r from public.letters where public_id = p_id; if not found then return jsonb_build_object('state', 'missing'); end if;
  if r.visibility <> 'public' or r.status <> 'published' then return jsonb_build_object('state', 'private'); end if;
  if r.order_status in ('pending_payment', 'cancelled') then return jsonb_build_object('state', 'unavailable'); end if;
  if r.expires_at is not null and r.expires_at < now() then return jsonb_build_object('state', 'expired'); end if;
  update public.letters set views = views + 1 where id = r.id;
  select coalesce(t.defaults->>'motion', '') into mo from public.letter_templates t where t.slug = r.template_slug;
  return jsonb_build_object('state', 'ok', 'engine', r.engine, 'content', r.content, 'template', r.template_slug, 'motion', coalesce(mo, ''));
end $$;
