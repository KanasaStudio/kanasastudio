#!/usr/bin/env python3
"""Generates css/letter-skins.css: floral / ornament SVG elements (inline data URIs) for the Love template skins.
Run: python3 scripts/gen-skins.py   (references: Canva wildflower watercolor, vintage roses + gold foil, sakura cards)"""
import math, urllib.parse, random
random.seed(7)
def f(x): return f"{x:.1f}".rstrip("0").rstrip(".")
def svg(body, w=320, h=320, defs=""): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><defs>{defs}</defs>{body}</svg>'
def uri(s): return 'url("data:image/svg+xml,' + s.replace('"', "'").replace('%', '%25').replace('#', '%23').replace('<', '%3C').replace('>', '%3E') + '")'
def g(tx, ty, rot=0, sc=1, inner=""): return f'<g transform="translate({f(tx)} {f(ty)}) rotate({f(rot)}) scale({f(sc)})">{inner}</g>'

# ---------- single flowers (centred on 0,0, radius ~ 30) ----------
def daisy(n=13, r=30):
    pet = "".join(f'<ellipse cx="0" cy="{-r*.62}" rx="{r*.17}" ry="{r*.42}" transform="rotate({i*360/n})" fill="#fffdf6" stroke="#e5dcc6" stroke-width=".8"/>' for i in range(n))
    return pet + f'<circle r="{r*.2}" fill="#f2a516"/><circle r="{r*.1}" cx="{-r*.04}" cy="{-r*.04}" fill="#d9780f"/>'
def blossom(col="#f4a59a", col2="#f9cfc4", r=28):
    pet = "".join(f'<ellipse cx="0" cy="{-r*.55}" rx="{r*.42}" ry="{r*.5}" transform="rotate({i*72})" fill="{col2}" stroke="{col}" stroke-width="1.2"/>' for i in range(5))
    return pet + f'<circle r="{r*.18}" fill="#f2b33d"/>' + "".join(f'<circle cx="{math.cos(a)*r*.3:.1f}" cy="{math.sin(a)*r*.3:.1f}" r="1.6" fill="#b6532e"/>' for a in [i*math.pi/3 for i in range(6)])
def sakura(col="#ffc4d4", edge="#f08aa8", r=30):
    p = f'M0 0 C{-r*.55} {-r*.35} {-r*.6} {-r*1.05} {-r*.2} {-r*1.18} L0 {-r*.98} L{r*.2} {-r*1.18} C{r*.6} {-r*1.05} {r*.55} {-r*.35} 0 0Z'
    pet = "".join(f'<path d="{p}" transform="rotate({i*72})" fill="{col}" stroke="{edge}" stroke-width="1"/>' for i in range(5))
    st = "".join(f'<path d="M0 0 L{math.cos(a)*r*.5:.1f} {math.sin(a)*r*.5:.1f}" stroke="{edge}" stroke-width="1"/><circle cx="{math.cos(a)*r*.5:.1f}" cy="{math.sin(a)*r*.5:.1f}" r="1.7" fill="#c2456d"/>' for a in [i*math.pi/4.5 for i in range(9)])
    return pet + st + f'<circle r="3" fill="#fff0a8"/>'
def rose(r=34, cols=("#c1334d", "#a3203a", "#7d1228", "#5b0a1b")):
    out = ""
    for k, (n, rr) in enumerate([(9, r*.72), (7, r*.55), (6, r*.38), (4, r*.22)]):
        for i in range(n):
            a = i*360/n + k*23
            out += f'<ellipse cx="0" cy="{-rr*.6}" rx="{rr*.5}" ry="{rr*.62}" transform="rotate({f(a)})" fill="{cols[k]}" stroke="#4a0816" stroke-opacity=".45" stroke-width=".9"/>'
    out += f'<path d="M-{r*.1} 0 q{r*.1} -{r*.14} {r*.18} 0 q-{r*.08} {r*.1} -{r*.18} 0" fill="none" stroke="#e8758a" stroke-opacity=".7" stroke-width="1.2"/>'
    return out
def peony(col="#ff8fb1", col2="#ffc2d6", r=36):
    out = ""
    for k, (n, rr, c) in enumerate([(10, r, col), (8, r*.74, col2), (6, r*.5, col), (5, r*.3, col2)]):
        for i in range(n):
            out += f'<circle cx="0" cy="{-rr*.55}" r="{rr*.48}" transform="rotate({f(i*360/n + k*17)})" fill="{c}" fill-opacity=".92" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>'
    return out + '<circle r="4" fill="#ffd966"/>'
def bold_flower(col="#d9718d", r=34, n=8):  # flat, chunky shape (Canva sakura-card style)
    return "".join(f'<ellipse cx="0" cy="{-r*.55}" rx="{r*.2}" ry="{r*.5}" transform="rotate({f(i*360/n)})" fill="{col}"/>' for i in range(n)) + f'<circle r="{r*.3}" fill="{col}"/>'
def lineflower(col="#2b2320", r=30, n=6):
    return "".join(f'<ellipse cx="0" cy="{-r*.6}" rx="{r*.22}" ry="{r*.45}" transform="rotate({f(i*360/n)})" fill="none" stroke="{col}" stroke-width="1.3"/>' for i in range(n)) + f'<circle r="{r*.14}" fill="none" stroke="{col}" stroke-width="1.3"/>'

# ---------- stems / leaves ----------
def leaf(col, l=40, w=11): return f'<path d="M0 0 C{w} {-l*.3} {w} {-l*.75} 0 {-l} C{-w} {-l*.75} {-w} {-l*.3} 0 0Z" fill="{col}"/>'
def leaf_line(col, l=40, w=11): return f'<path d="M0 0 C{w} {-l*.3} {w} {-l*.75} 0 {-l} C{-w} {-l*.75} {-w} {-l*.3} 0 0Z M0 0 V{-l*.85}" fill="none" stroke="{col}" stroke-width="1.2"/>'
def lavender(h=150, col="#7a63b3", col2="#a591d6", stem="#78945a"):
    out = f'<path d="M0 0 Q4 {-h*.5} 0 {-h}" stroke="{stem}" stroke-width="2.4" fill="none"/>'
    n = 11
    for i in range(n):
        y = -h*.42 - i*(h*.52/n); s = 1 - i*.045
        for sx in (-1, 1):
            out += f'<ellipse cx="{sx*4*s:.1f}" cy="{y:.1f}" rx="{3.6*s:.1f}" ry="{6.2*s:.1f}" transform="rotate({sx*22} {sx*4*s:.1f} {y:.1f})" fill="{col if (i+(sx>0))%2 else col2}"/>'
    return out + f'<ellipse cx="0" cy="{-h}" rx="3" ry="6" fill="{col2}"/>'
def sprig(col="#6f9166", h=120, n=6, line=False):
    out = f'<path d="M0 0 Q6 {-h*.5} 0 {-h}" stroke="{col}" stroke-width="2" fill="none"/>'
    for i in range(n):
        y = -h*.18 - i*(h*.7/n); s = 1 if i % 2 == 0 else -1
        out += g(0, y, s*58, 1 - i*.08, (leaf_line if line else leaf)(col, 34, 9))
    return out
def branch(col="#6b4a3a", pink="#ffb7c9", edge="#ee86a5"):  # sakura branch with blossoms and buds
    d = "M0 0 C40 -20 70 -30 120 -70 S190 -110 230 -100"
    out = f'<path d="{d}" fill="none" stroke="{col}" stroke-width="4" stroke-linecap="round"/><path d="M70 -30 C90 -50 95 -70 110 -95" fill="none" stroke="{col}" stroke-width="2.5" stroke-linecap="round"/><path d="M150 -88 C165 -70 190 -62 205 -45" fill="none" stroke="{col}" stroke-width="2.5" stroke-linecap="round"/>'
    for (x, y, rr, rot) in [(45, -22, .5, 0), (90, -52, .62, 20), (112, -98, .5, 10), (150, -90, .66, 40), (205, -46, .5, 0), (228, -102, .6, 25), (180, -100, .42, 5)]:
        out += g(x, y, rot, rr, sakura(pink, edge))
    return out

# ---------- ornaments ----------
def flourish(col="#d8b055", sw=1.6):
    p = (f'<g fill="none" stroke="{col}" stroke-width="{sw}" stroke-linecap="round">'
         '<path d="M8 8 H170 M8 8 V170"/><path d="M8 20 H120 M20 8 V120" stroke-opacity=".6"/>'
         '<path d="M34 34 C70 30 92 48 88 76 C85 98 58 100 56 80 C55 66 74 62 78 74"/>'
         '<path d="M34 34 C30 70 48 92 76 88 C98 85 100 58 80 56 C66 55 62 74 74 78"/>'
         '<path d="M100 20 C118 14 134 24 130 38 C127 50 112 48 112 40"/><path d="M20 100 C14 118 24 134 38 130 C50 127 48 112 40 112"/>'
         '</g>'
         f'<circle cx="34" cy="34" r="4" fill="{col}"/><circle cx="150" cy="8" r="2.6" fill="{col}"/><circle cx="8" cy="150" r="2.6" fill="{col}"/>'
         f'<path d="M58 58 l5 -9 l5 9 l-5 9z" fill="{col}"/>')
    return p
def sparkle4(col, s=10): return f'<path d="M0 {-s} Q0 0 {s} 0 Q0 0 0 {s} Q0 0 {-s} 0 Q0 0 0 {-s}Z" fill="{col}"/>'

skins = {}
# 1 wildflower meadow (Canva watercolor wildflowers)
body = ""
for (x, rot, h, c1, c2) in [(60, -22, 190, "#7a63b3", "#a591d6"), (95, -7, 215, "#6f58a8", "#9d89d0"), (130, 9, 175, "#7a63b3", "#b3a1de"), (30, -36, 150, "#8a73c0", "#a591d6")]:
    body += g(x, 318, rot, 1, lavender(h, c1, c2))
for (x, rot, h) in [(45, -30, 120), (115, 18, 105)]: body += g(x, 318, rot, 1, sprig("#7d9a63", h, 6))
for (x, y, s) in [(70, 190, 1.0), (135, 255, .85), (30, 262, .8)]: body += g(x, y, random.randint(0, 30), s, daisy())
for (x, y, s) in [(155, 292, .8), (92, 270, .62), (18, 205, .55)]: body += g(x, y, random.randint(0, 60), s, blossom())
meadow_c = svg(body); meadow_f = svg(g(160, 160, 0, 3.4, daisy()))
meadow_f2 = svg(g(160, 160, 0, 3.4, blossom()))
skins["meadow"] = dict(c=meadow_c, f=meadow_f, f2=meadow_f2, leaf=svg(g(160, 300, 0, 2.6, sprig("#7d9a63", 120, 6))))
# 2 vintage roses + gold foil
body = g(80, 240, 0, 1.15, leaf("#3b5a34", 50, 13)) + g(150, 262, 70, 1, leaf("#4a6b3d", 46, 12)) + g(46, 200, -60, 1, leaf("#3b5a34", 46, 12))
body += g(112, 200, 0, 1.55, rose()) + g(52, 262, 20, 1.1, rose()) + g(158, 268, -15, 1.0, rose())
roses_c = svg(body); roses_f = svg(g(160, 160, 0, 3.8, rose()))
skins["roses"] = dict(c=roses_c, f=roses_f, f2=svg(g(160, 160, 0, 2.9, rose())), leaf=svg(g(160, 300, 0, 2.6, leaf("#3b5a34", 100, 26))), fl=svg(flourish(), 180, 180))
# 3 sakura
body = g(8, 316, -6, 1.15, branch())
sk_c = svg(body); sk_f = svg(g(160, 160, 0, 3.8, sakura()))
skins["sakura"] = dict(c=sk_c, f=sk_f, f2=svg(g(160, 160, 0, 3.8, sakura("#fff0f4", "#f4a3bb"))), leaf=svg(g(40, 250, 0, 1, branch())))
# 4 bold peony (flat shapes like the Canva sakura card)
body = g(80, 240, 0, 1.6, bold_flower("#d9718d", 44, 8)) + g(170, 296, 20, 1.2, bold_flower("#a85870", 44, 7)) + g(30, 150, -10, .9, bold_flower("#e98aa5", 44, 9))
bold_c = svg(body); skins["bold"] = dict(c=bold_c, f=svg(g(160, 160, 0, 3.6, bold_flower("#e98aa5", 44, 8))), f2=svg(g(160, 160, 0, 3.6, peony())), leaf=svg(g(160, 160, 0, 3.6, bold_flower("#a85870", 44, 7))))
# 5 golden night (gold flourishes + sparkles)
body = flourish("#d9b45a") + g(206, 208, 0, 1, sparkle4("#f3d98a", 18)) + g(250, 140, 0, 1, sparkle4("#f3d98a", 9)) + g(140, 250, 0, 1, sparkle4("#f3d98a", 9))
gold_c = svg(body, 320, 320); skins["gold"] = dict(c=gold_c, f=svg(g(160, 160, 0, 6, sparkle4("#f3d98a", 18))), f2=svg(g(160, 160, 0, 6, sparkle4("#fff3c4", 14))), leaf=svg(g(160, 160, 0, 2.2, rose(34, ("#d9b45a", "#c29a3c", "#a07a24", "#7a5a14")))) , fl=svg(flourish("#d9b45a"), 180, 180))
# 6 line-art botanical
body = g(60, 318, -14, 1, sprig("#2b2320", 230, 8, True)) + g(120, 318, 10, 1, sprig("#2b2320", 170, 6, True)) + g(160, 232, 0, 1.1, lineflower()) + g(66, 120, 0, .8, lineflower())
line_c = svg(body); skins["lineart"] = dict(c=line_c, f=svg(g(160, 160, 0, 3.6, lineflower())), f2=svg(g(160, 160, 0, 3.6, lineflower("#8a7a6a", 30, 8))), leaf=svg(g(160, 300, 0, 2.6, sprig("#2b2320", 120, 6, True))))

css = ["/* GENERATED by scripts/gen-skins.py — do not edit by hand. Floral / ornament skins for the Love templates (content.skin). */"]
for k, v in skins.items():
    css.append(f'.lt[data-skin="{k}"] {{ --sk-c: {uri(v["c"])}; --sk-f: {uri(v["f"])}; --sk-f2: {uri(v["f2"])}; --sk-leaf: {uri(v["leaf"])};' + (f' --sk-fl: {uri(v["fl"])};' if "fl" in v else "") + " }")
open("css/letter-skins.css", "w").write("\n".join(css) + "\n")
print({k: sum(len(x) for x in v.values()) for k, v in skins.items()})
