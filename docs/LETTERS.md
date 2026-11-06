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
