-- Custom GIF stickers in letters: content.gifs = [{url, place: intro|letter|both}] (own uploads only, 3 free / 6 with the gallery add-on).
create or replace function public.letter_clean(c jsonb, addons text[]) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  prefix constant text := 'https://geroipkbzmbkigzwjdok.supabase.co/storage/v1/object/public/letter-media/';
  fonts constant text[] := array['serif','script','hand','sans','classic'];
  fxs constant text[] := array['opening','typing','hearts','confetti','petals','sparkles','gallery','closing'];
  decs constant text[] := array['tape','seal','ribbon','stars','border'];
  out jsonb := '{}'; th jsonb := '{}'; ph jsonb := '[]'; p jsonb; gf jsonb := '[]'; gn int := 0; k text; v text; maxp int; n int := 0; arr jsonb;
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
  if jsonb_typeof(c->'gifs') = 'array' then
    for p in select * from jsonb_array_elements(c->'gifs') loop
      exit when gn >= case when 'gallery' = any(addons) then 6 else 3 end; v := p->>'url';
      if v is not null and left(v, char_length(prefix)) = prefix and char_length(v) <= 300 and v !~ '[\s"''<>]' and v ~* '\.(gif|webp|png)$' then
        gf := gf || jsonb_build_object('url', v, 'place', case when p->>'place' in ('intro','letter','both') then p->>'place' else 'both' end); gn := gn + 1; end if;
    end loop; end if;
  out := out || jsonb_build_object('gifs', gf);
  v := c->'music'->>'url';
  if 'music' = any(addons) and v is not null and left(v, char_length(prefix)) = prefix and char_length(v) <= 300 and v !~ '[\s"''<>]' then
    out := out || jsonb_build_object('music', jsonb_build_object('url', v, 'title', left(btrim(coalesce(c->'music'->>'title','')), 60))); end if;
  return out;
end $$;
