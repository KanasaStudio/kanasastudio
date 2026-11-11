/* Motion profiles: each template gets its own "motion identity" on top of its engine.
   A profile picks, independently: the cover/opening (openings.js), the kinetic-type style of the intro (motion.js),
   how the letter text is revealed (player.js ctx.type), the scene transition (data-tr), a moving atmosphere layer,
   ambient particles (fx.js), the photo montage, the closing climax, tempo, and the sound voice/pitch (sound.js).
   Templates store the key in letter_templates.defaults.motion (Admin -> Letters -> Templates -> Motion profile).
   Letters without a key fall back to BY_SLUG, and letters of unknown templates keep the original engine animation. */

const B = ["title", "to", "words", "gif", "photos", "from"];
export const PROFILES = {
  "rose-wax":      { label: "Rose & wax seal — dramatis",          slug: "midnight-rose",       open: "waxseal",      text: "mask",        reveal: "line",    tr: "blur",    atmo: "velvet",   amb: [["petals", .7]],               strip: "fade", close: "petals",      beats: B, tempo: 1.15, voice: "cinematic", shift: -3 },
  "wind-meadow":   { label: "Wind meadow — ringan ceria",          slug: "wildflower-letter",   open: "windflap",     text: "pencil",      reveal: "pencil",  tr: "wind",    atmo: "meadow",   amb: [["fluff", 1.2]],               strip: "drop", close: "meadow",      beats: ["to", "title", "words", "gif", "photos", "from"], tempo: .95, voice: "giftbox", shift: 5, font: "hand" },
  "gold-ribbon":   { label: "Gold ribbon & foil — klasik elegan",  slug: "vintage-roses",       open: "ribbon",       text: "foil",        reveal: "para",    tr: "iris",    atmo: "ornament", amb: [["dust", 1.4]],                strip: "flip", close: "frame",       beats: B, tempo: 1.1, voice: "envelope", shift: 0, font: "classic" },
  "dusk-lamp":     { label: "Dusk lamp — hangat tenang",           slug: "warm-thanks",         open: "lightsweep",   text: "bulbs",       reveal: "glow",    tr: "warm",    atmo: "rays",     amb: [["fireflies", 1]],             strip: "fade", close: "lanterns",    beats: B, tempo: 1.05, voice: "scrapbook", shift: -2 },
  "vine-fold":     { label: "Tri-fold & vines — lembut tulus",     slug: "for-mom-and-dad",     open: "trifold",      text: "typewriter",  reveal: "typewriter", tr: "wipe", atmo: "vines",    amb: [["leaves", .7]],               strip: "slide", close: "wreath",     beats: B, tempo: 1, voice: "cinematic", shift: 2 },
  "hop-note":      { label: "Hopping note — imut bouncy",          slug: "little-note",         open: "hop",          text: "bounce",      reveal: "pop",     tr: "pop",     atmo: "dots",     amb: [["glyphs", .8]],               strip: "pop",  close: "stickers",    beats: B, tempo: .85, voice: "cake", shift: 7, font: "hand" },
  "line-heart":    { label: "Single line heart — puisi minimalis", slug: "love-in-lines",       open: "linedraw",     text: "stroke",      reveal: "mask",    tr: "wiperight", atmo: "lines",  amb: [["motes", 1.2]],               strip: "fade", close: "heartline",   beats: B, tempo: 1, voice: "cinematic", shift: 3, font: "script" },
  "sakura-drift":  { label: "Sakura drift — puitis melayang",      slug: "sakura-dream",        open: "blurfocus",    text: "blur",        reveal: "blur",    tr: "dream",   atmo: "bokeh",    amb: [["sakura", 1.6]],              strip: "fade", close: "petalstorm",  beats: B, tempo: 1.2, voice: "cinematic", shift: 5 },
  "gold-night":    { label: "Golden constellation — mewah",        slug: "golden-night",        open: "constellation", text: "constellation", reveal: "glint", tr: "flash", atmo: "starfield", amb: [["shooting", .35], ["dust", .5]], strip: "flip", close: "fireworks-gold", beats: ["title", "words", "gif", "photos", "to", "from"], tempo: 1, voice: "cinematic", shift: 0, font: "classic" },
  "rain-ink":      { label: "Rain & ink — sendu jujur",            slug: "im-sorry",            open: "inkdrop",      text: "ink",         reveal: "ink",     tr: "slow",    atmo: "rain",     amb: [["rain", 9]],                  strip: "fade", close: "dawn",        beats: ["to", "words", "title", "gif", "photos", "from"], tempo: 1.35, voice: "cinematic", shift: -5 },
  "aurora-shuffle": { label: "Aurora shuffle — santai playful",    slug: "just-because",        open: "shuffle",      text: "shuffle",     reveal: "scatter", tr: "rise",    atmo: "aurora",   amb: [["bubbles", .9]],              strip: "slide", close: "aurora",     beats: ["words", "title", "to", "gif", "photos", "from"], tempo: .9, voice: "giftbox", shift: 2, font: "sans" },
  "ink-botanical": { label: "Ink botanical — lineart",             slug: "botanical-lines",     open: "sketch",       text: "print",       reveal: "stamp",   tr: "wipeleft", atmo: "sketch",  amb: [["sprigs", .6]],               strip: "drop", close: "wreathdraw",  beats: B, tempo: 1.1, voice: "scrapbook", shift: 0, font: "classic" },
  "stamp-tape":    { label: "Stamp & washi tape — tempel hangat",  slug: "thank-you-scrapbook", open: "stamp",        text: "marker",      reveal: "marker",  tr: "shuffle", atmo: "scraps",   amb: [["scraps", .5]],               strip: "drop", close: "stamp",       beats: B, tempo: .95, voice: "scrapbook", shift: 4, font: "hand" },
  "album-flip":    { label: "Album page flip — keluarga",          slug: "family-album",        open: "riffle",       text: "caption",     reveal: "caption", tr: "page",    atmo: "album",    amb: [["hearts", .35]],              strip: "drop", close: "collage",     beats: B, tempo: 1.05, voice: "envelope", shift: 2, font: "hand" },
  "sticker-pop":   { label: "Sticker pop — energik ceria",         slug: "best-friends",        open: "burst",        text: "zigzag",      reveal: "zig",     tr: "snap",    atmo: "doodles",  amb: [["stars", .9]],                strip: "pop",  close: "stickerboom", beats: B, tempo: .75, voice: "cake", shift: 4, font: "sans" },
  "cap-toss":      { label: "Cap toss — formal megah",             slug: "cap-and-gown",        open: "captoss",      text: "certificate", reveal: "formal",  tr: "precise", atmo: "laurel",   amb: [["streamers", .5]],            strip: "flip", close: "caps",        beats: B, tempo: 1, voice: "cinematic", shift: -2, font: "classic" },
  "peony-bloom":   { label: "Peony bloom — mekar lembut",          slug: "peony-box",           open: "untie",        text: "bloom",       reveal: "bloom",   tr: "bloom",   atmo: "peony",    amb: [["peonyp", .7]],               strip: "pop",  close: "bigbloom",    beats: B, tempo: 1.05, voice: "giftbox", shift: -2 },
  "shake-burst":   { label: "Shake & burst — kejutan",             slug: "surprise-box",        open: "crescendo",    text: "pop",         reveal: "burst",   tr: "zoom",    atmo: "spot",     amb: [["confall", .9]],              strip: "pop",  close: "cannons",     beats: B, tempo: .8, voice: "cake", shift: 0, font: "sans" },
  "door-box":      { label: "Door box — persahabatan",             slug: "friend-box",          open: "doors",        text: "hop",         reveal: "hop",     tr: "side",    atmo: "bob",      amb: [["sparkles", 1.4]],            strip: "slide", close: "hopstars",   beats: B, tempo: .9, voice: "giftbox", shift: 4, font: "hand" },
  "scroll-roll":   { label: "Diploma scroll — wisuda",             slug: "graduation-gift",     open: "diploma",      text: "flap",        reveal: "flap",    tr: "shutter", atmo: "shimmer",  amb: [["glitter", 1.2]],             strip: "flip", close: "seal",        beats: B, tempo: 1, voice: "giftbox", shift: -4, font: "sans" },
  "wish-smoke":    { label: "Wish & smoke — ulang tahun",          slug: "make-a-wish",         open: "blowsmoke",    text: "balloon",     reveal: "float",   tr: "float",   atmo: "bunting",  amb: [["balloons", .45]],            strip: "pop",  close: "fireworks",   beats: B, tempo: .95, voice: "cake", shift: 2, font: "hand" },
};
export const MOTION_KEYS = Object.keys(PROFILES);
export const BY_SLUG = Object.fromEntries(Object.entries(PROFILES).map(([k, v]) => [v.slug, k]));
export function resolveProfile(letter) {
  const k = letter && PROFILES[letter.motion] ? letter.motion : BY_SLUG[letter?.template];
  return k ? { key: k, ...PROFILES[k] } : null;
}

/* static atmosphere layers (no user content) */
const n = (k, cls = "") => Array.from({ length: k }, (_, i) => `<i class="${cls}" style="--i:${i}"></i>`).join("");
const BRANCH = `<svg viewBox="0 0 200 200" aria-hidden="true"><path pathLength="1" d="M14 196C46 150 70 110 128 62M52 146C30 140 18 124 16 104 40 110 50 124 52 146M74 118C96 106 108 90 112 66 88 76 76 94 74 118M96 94C78 78 70 58 74 36 92 54 98 72 96 94M128 62C150 58 168 46 178 28 156 30 138 42 128 62"/></svg>`;
export const ATMO = {
  velvet: n(3), meadow: n(9), ornament: n(5), rays: n(3), vines: n(10), dots: n(8), lines: n(6), bokeh: n(8),
  starfield: n(3), rain: n(3), aurora: n(3), scraps: n(4), album: n(5), doodles: n(8), laurel: n(4), peony: n(4), spot: n(3), bob: n(6), shimmer: n(2), bunting: n(11),
  sketch: `<b class="br b1">${BRANCH}</b><b class="br b2">${BRANCH}</b>`,
};
export const SVG = {
  branch: BRANCH,
  heart: `<svg viewBox="0 0 200 180" aria-hidden="true"><path pathLength="1" d="M100 165C30 115 8 70 30 40 50 14 88 18 100 52 112 18 150 14 170 40 192 70 170 115 100 165Z"/></svg>`,
  wreath: `<svg viewBox="0 0 200 200" aria-hidden="true"><circle pathLength="1" cx="100" cy="100" r="84"/>${Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2, x = 100 + Math.cos(a) * 84, y = 100 + Math.sin(a) * 84, d = (a * 180) / Math.PI + 90; return `<path pathLength="1" style="--i:${i}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${d.toFixed(0)})" d="M0 0C-8-6-8-16 0-22 8-16 8-6 0 0Z"/>`; }).join("")}</svg>`,
  corner: `<svg viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M4 96V30C4 14 14 4 30 4H96M14 96V36C14 22 22 14 36 14H96M30 30c10-12 26-12 30 0-12 6-22 6-30 0Z"/></svg>`,
};
