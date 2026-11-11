# Interactive Digital Letter & Gift

Visitors pick a template, personalise it, preview it, and get a share link (`/letter/<id>`), a QR code and a private edit link.

## Where things live
| What | Where |
| --- | --- |
| Catalog, 5-step editor, "My letters" | `js/letters.js`, `css/letters.css` (routes `#/letters`, `#/letters/new/<template>`, `#/letters/mine`, `#/letters/edit/<id>`) |
| Recipient experience | `letter/index.html` + `js/letter/viewer.js` + `js/letter/player.js` + `css/letter.css` |
| Animation engines (one story each) | `js/letter/engines.js` (`envelope`, `giftbox`, `cake`, `scrapbook`, `cinematic`) |
| Particles (confetti, hearts, petals, sparkles) | `js/letter/fx.js` |
| Admin | `js/admin-letters.js` (Admin -> Digital letters) |
| Database | `supabase/migrations/20261105000014_letters.sql` |
| `/letter/<id>` on GitHub Pages | `404.html` redirects it to `/letter/?id=<id>`; `_redirects` does a real rewrite on Netlify/Cloudflare Pages |

## Flow and security
- Tables are closed to visitors. They use SECURITY DEFINER functions: `letter_create`, `letter_get`, `letter_get_edit`, `letter_update`, `letter_delete`.
- The private edit token is returned once, only its SHA-256 hash is stored. The token also lives in this device's localStorage (`kns_letters`).
- `letter_clean` rebuilds the content server side: lengths, hex colours, allowed fonts/effects/decor, max 3 photos (12 with the gallery add-on), media only from this project's `letter-media` bucket, music only with the music add-on.
- Everything rendered in the viewer is set with `textContent` or validated URLs.
- Visitors may upload images/audio (max 6 MB) to `letter-media/u/<uuid>/` and nothing else. Files of deleted letters stay in the bucket; remove them from Supabase Storage if needed.

## Monetisation
- Price = premium template price + duration plan price + add-ons (`letter_templates`, `letter_plans`, `letter_addons`).
- Total 0 -> status `free`, active at once. Total > 0 -> `pending_payment` with an order reference `LT-XXXXXXXX`; the link is not viewable until it is `paid`.
- Today payment is confirmed by hand: Admin -> Digital letters -> *Mark paid* (starts the plan period). To add a gateway later, have its webhook (Edge Function with the service role) call `admin_letter_set_order(id, 'paid')` logic, or update `letters.order_status` and `expires_at` directly.
- Order history for a visitor = "My letters" on their device; admins see all letters and revenue in the admin tab.

## Adding a new design
1. A new look with an existing story: Admin -> Templates -> add a row (engine, colours, text, effects, price). No code needed.
2. A new story: add an async function to `ENGINES` in `js/letter/engines.js` (use `ctx.scene`, `ctx.press`, `ctx.type`, `ctx.fx`, `ctx.has(effect)`), add its mini thumbnail in `css/letters.css` (`.ltm-<engine>`), allow its key in the Templates engine list (`js/admin-letters.js`) and use it in a template.
3. Bump the `?v=` cache-busting version across files and `V` in `sw.js`.

## Sound effects per template (v2)
`js/letter/sound.js` synthesises a distinct sound set per engine with WebAudio (no files, works offline): envelope = paper + wax seal + bells, giftbox = ribbon + chimes, cake = party blower + xylophone, scrapbook = page turn + tape, cinematic = deep swell + soft bells. The template's primary colour hue transposes the scale, so templates sharing an engine still sound different. Events: `open` (first tap), `tick` (typing), `reveal` (photos / next scene), `end` (closing). Nothing plays before the first tap; the ♪ button mutes music and effects; reduced-motion starts muted.

## Visual references (v2)
Palettes and layers were inspired by Canva references: bold botanical silhouettes on burgundy/blush (envelope), hand-drawn pastel party on cream (cake/giftbox), kraft scrapbook with washi tape, aurora night sky (cinematic). Per-template palettes live in migration `20261106000015_letter_palettes.sql`.

## Motion-graphic intro (v2.1)
`js/letter/motion.js` plays a skippable ~17–30 s kinetic-type sequence after the cover opens (title → recipient → message highlights word by word → photo montage → sender), dressed per engine by `.mg-<engine>` styles. Needs the `opening` effect, is off in quick/preview-step mode and for reduced-motion users, and has a "Lewati / Skip" button.

## Custom GIF stickers
Editor step 2 → "GIF stickers": the sender uploads their own GIF / animated WebP / PNG (≤ 5 MB, stored as-is in `letter-media` so the animation survives; photos are re-encoded to JPG, GIFs are not). 3 per letter, 6 with the Gallery add-on. Each GIF has a placement: intro / letter / both. Intro GIFs pop in as a motion-graphic beat; letter GIFs appear as stickers under the message (cinematic: a slide). Stored in `content.gifs = [{url, place}]`, validated by `letter_clean` (migration `20261106000016_letter_gifs.sql`: only own-bucket URLs ending .gif/.webp/.png).

## Performance notes
Particles run at 0.55× speed (`SPEED` in fx.js). The editor preview iframe uses lite mode (`.lt-lite`, 1× canvas, fewer particles). Avoided on purpose: blend-mode overlays, animated blur/drop-shadow filters, masked rotating layers, large animated box-shadows.

## Skins & the Love variants
`content.skin` (meadow, roses, sakura, bold, gold, lineart; whitelisted in `letter_clean`) adds floral/ornament art around any engine: corner garlands, flowers floating through the motion intro, paper corner sprigs. Art is generated as inline SVG by `python3 scripts/gen-skins.py` into `css/letter-skins.css` (lazy-loaded only when a letter has a skin; references: Canva wildflower watercolor, vintage roses + gold foil, sakura). Love templates added in migration `20261106000017_love_skins.sql`: Wildflower Letter, Vintage Roses, Sakura Dream, Peony Box, Golden Night, Botanical Lines. To add a skin: add a generator block, whitelist it in `letter_clean` and `SKINS` (player.js), add layout rules in `letter.css`.

## Desktop layout
At ≥900×640 the covers (envelope, box, cake, book) are zoomed 1.55×, the paper widens to 780px, type scales up and skin art grows; the paper is vertically centred at every size.

## Motion profiles (v3) — every template moves differently
Before v3 the five engines each told one story and `motion.js` played the same kinetic-type intro for every template, so templates on the same engine only differed by colour. A **motion profile** now gives each template its own film on top of its engine. Pick one in **Admin → Digital Letters → Templates → Motion profile** (stored in `letter_templates.defaults.motion`; "Engine default" = the old behaviour). `letter_get` returns the template's current profile, so changing it in admin also changes letters already sent.

| Template | Profile | Opening | Intro type | Text reveal | Transition | Particles | Finale |
|---|---|---|---|---|---|---|---|
| midnight-rose | rose-wax | wax seal cracks, slow flap | gold mask rise | sentence fade | blur dissolve | rose petals | petal shower, gold name |
| wildflower-letter | wind-meadow | envelope sways, flap flutters, flowers grow | pencil wipe | word pencil | wind slide | dandelion fluff | meadow grows |
| vintage-roses | gold-ribbon | gold twine + bow untie, corners draw | gold foil shine | paragraph tint | iris | gold dust | ornament frame |
| warm-thanks | dusk-lamp | warm light sweep, envelope sinks into rays | light bulbs | line glow | warm brighten | fireflies | lanterns |
| for-mom-and-dad | vine-fold | tri-fold letter unfolds | typewriter + caret | typewriter | wipe down | leaves | leaf wreath |
| little-note | hop-note | mini envelope hops (squash & stretch) | bounce drop | word pop | pop | glyph stickers | sticker ring |
| love-in-lines | line-heart | single line draws a heart | outline → fill | line ink wipe | wipe right | motes | heart line |
| sakura-dream | sakura-drift | blur-to-focus title, petal gust | blur to sharp | word blur | dream | sakura (3D flip) | petal storm |
| golden-night | gold-night | stars converge into a ring, flash | stars fly into letters | gold glint | flash | shooting stars + dust | gold fireworks + rays |
| im-sorry | rain-ink | ink drop, ripples, ink fills the screen | ink bleed | word ink | slow fade | rain | rain stops, dawn (no confetti) |
| just-because | aurora-shuffle | words shuffle into place | shuffle | scatter | rise | bubbles | aurora flare |
| botanical-lines | ink-botanical | line-art branch draws on the cover | letterpress | word stamp | wipe left | line sprigs | wreath draws |
| thank-you-scrapbook | stamp-tape | stamp slams, tape peels | tape pop + highlighter | marker | shuffle | paper scraps | stamp |
| family-album | album-flip | album pages riffle | sepia caption | caption | page turn | hearts | photo collage |
| best-friends | sticker-pop | jittery book bursts open | zig-zag | word zig | snap | spinning stars | sticker boom |
| cap-and-gown | cap-toss | diploma cover, caps fly | certificate tracking | formal | precise | gold streamers | caps toss |
| peony-box | peony-bloom | bow unties, peony blooms from the box | bloom from centre | word bloom | bloom | soft peony petals | big bloom |
| surprise-box | shake-burst | box shakes harder, lid explodes | pop | burst | zoom | falling confetti | confetti cannons |
| friend-box | door-box | box doors open, items hop out | hop | word hop | side | sparkles | hopping stars |
| graduation-gift | scroll-roll | lid lifts, diploma scroll unrolls | split-flap board | flap | shutter | glitter | gold seal |
| make-a-wish | wish-smoke | candles out, smoke curls, fireworks | balloon letters bob | float | float | balloons | fireworks + balloons |

Code: `js/letter/profiles.js` (registry + atmosphere markup), `js/letter/openings.js` (covers), `js/letter/motion.js` (intro beats/tempo), `js/letter/engines.js` (`mpOpen`, `finale`), `js/letter/player.js` (profile resolve, atmosphere layer, `reveal()`), `js/letter/fx.js` (particle kinds + `burst`, `fireworks`), `css/letter-motion.css` (all motion styles, lazy-loaded), `css/letters.css` (`.ltm-<profile>` gallery thumbnail loops). Each profile also sets the sound voice and pitch (`sound.js` `shift`). Reduced motion keeps the static fallbacks; the editor preview runs in lite mode.

**Adding a profile:** add an entry to `PROFILES` (pick or write an opening, a `--kf` text keyframe, a reveal mode, a `data-tr` transition, an atmosphere, particle kinds and a finale), add its CSS in `letter-motion.css`, then choose it in admin.
