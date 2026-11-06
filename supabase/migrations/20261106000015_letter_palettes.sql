-- Distinct palettes per template (references: burgundy/blush botanical, pastel hand-drawn party, kraft scrapbook, aurora night).
update public.letter_templates t set defaults = jsonb_set(t.defaults,'{theme}', v.th::jsonb)
from (values
 ('midnight-rose','{"primary":"#6b1d2a","accent":"#f4b8c0","bg":"#2a0b13","paper":"#fdf1ee"}'),
 ('love-in-lines','{"primary":"#b4234f","accent":"#ffc2d1","bg":"#0d0614","paper":"#fbf3ea"}'),
 ('make-a-wish','{"primary":"#ee6c9a","accent":"#f6c744","bg":"#fff4e3","paper":"#fffaf0"}'),
 ('surprise-box','{"primary":"#6fc3a9","accent":"#f28ab2","bg":"#fdf3e4","paper":"#fffaf1"}'),
 ('warm-thanks','{"primary":"#b8791f","accent":"#f2d08a","bg":"#2b1a0a","paper":"#fdf4e1"}'),
 ('thank-you-scrapbook','{"primary":"#c9573b","accent":"#f3d27a","bg":"#e9dcc3","paper":"#fffaf0"}'),
 ('for-mom-and-dad','{"primary":"#4d6b4a","accent":"#e9c9a0","bg":"#1c2a1b","paper":"#fbf5ea"}'),
 ('family-album','{"primary":"#3f6f8f","accent":"#f0c987","bg":"#e8e2d3","paper":"#fffaf0"}'),
 ('best-friends','{"primary":"#7a5be0","accent":"#ffd166","bg":"#f1e9ff","paper":"#ffffff"}'),
 ('friend-box','{"primary":"#f0883e","accent":"#7bd0c1","bg":"#fff0dc","paper":"#fffaf1"}'),
 ('im-sorry','{"primary":"#4b5d7a","accent":"#b9c7de","bg":"#0a0e17","paper":"#f1f3f7"}'),
 ('graduation-gift','{"primary":"#1f3a8a","accent":"#f5c542","bg":"#e9eefb","paper":"#ffffff"}'),
 ('cap-and-gown','{"primary":"#14213d","accent":"#fca311","bg":"#ece7da","paper":"#fffaf0"}'),
 ('just-because','{"primary":"#6d4bb5","accent":"#9be7d8","bg":"#07101f","paper":"#f6f2ff"}'),
 ('little-note','{"primary":"#d56a8a","accent":"#ffe0a8","bg":"#fff1ee","paper":"#fffaf5"}')
) as v(slug,th) where t.slug=v.slug;
