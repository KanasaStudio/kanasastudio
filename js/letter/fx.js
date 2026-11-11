/* Light canvas particle layer. One canvas, one rAF loop that sleeps when nothing is alive or the tab is hidden.
   Original kinds: confetti, hearts, petals, sparkles. Motion-profile kinds: fluff, dust, fireflies, leaves, glyphs, motes, sakura,
   shooting, rain, bubbles, sprigs, scraps, stars, streamers, peonyp, confall, balloons, glitter, lanterns (+ fireworks / cannon bursts). */
const TAU = Math.PI * 2;
function heart(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * .35); c.bezierCurveTo(x - s, y - s * .35, x - s * .55, y - s * 1.05, x, y - s * .5); c.bezierCurveTo(x + s * .55, y - s * 1.05, x + s, y - s * .35, x, y + s * .35); c.fill(); }
function star(c, x, y, s, pts = 4, inner = .25) { c.beginPath(); for (let i = 0; i < pts * 2; i++) { const r = i % 2 ? s * inner : s, a = (i * Math.PI) / pts - Math.PI / 2; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); }
const leaf = (c, s) => { c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * .8, 0, 0, s); c.quadraticCurveTo(-s * .8, 0, 0, -s); };
const GLYPHS = ["♥", "★", "✿", "●", "✦"];

export function createFx(host, colors, reduced, { lite = false } = {}) {
  const SPEED = .55; // global slow-down for the original kinds
  const cv = document.createElement("canvas"); cv.className = "lt-fx"; cv.setAttribute("aria-hidden", "true"); host.append(cv);
  const g = cv.getContext("2d"); let W = 0, H = 0, parts = [], raf = 0, last = 0, dead = false; const amb = {};
  const MAX = reduced ? 30 : lite ? 90 : 220, rnd = (a, b) => a + Math.random() * (b - a), pick = () => colors()[(Math.random() * colors().length) | 0];
  const GOLD = ["#f3d98a", "#d9b45a", "#fff3c4"], WARM = ["#ffd27a", "#ffe6a3", "#ffb85c"];
  const size = () => { const d = lite ? 1 : Math.min(1.5, devicePixelRatio || 1); W = host.clientWidth || 1; H = host.clientHeight || 1; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); };
  const ro = new ResizeObserver(size); ro.observe(host); size();
  const add = (p) => { if (parts.length < MAX) parts.push(Object.assign({ t: 0, g: 0, r: 0, vr: 0, sp: SPEED }, p)); start(); };
  const top = () => ({ x: rnd(0, W), y: -20 }), bottom = () => ({ x: rnd(0, W), y: H + 20 });
  const spawn = {
    confetti: (x = .5, y = .45) => add({ k: "c", x: W * x, y: H * y, vx: rnd(-240, 240), vy: rnd(-480, -160), s: rnd(5, 10), r: rnd(0, TAU), vr: rnd(-5, 5), col: pick(), life: rnd(2.4, 3.6), g: 700 }),
    cannon: (x, y, dir) => add({ k: "c", x: W * x, y: H * y, vx: dir * rnd(140, 460), vy: rnd(-760, -380), s: rnd(5, 10), r: rnd(0, TAU), vr: rnd(-6, 6), col: pick(), life: rnd(2.6, 3.8), g: 560, sp: .8 }),
    hearts: () => add({ k: "h", ...bottom(), vx: rnd(-14, 14), vy: rnd(-70, -140), s: rnd(7, 15), col: pick(), life: rnd(5, 8), ph: rnd(0, TAU) }),
    petals: () => add({ k: "p", ...top(), vx: rnd(-20, 20), vy: rnd(40, 90), s: rnd(5, 9), r: rnd(0, TAU), vr: rnd(-2, 2), col: pick(), life: rnd(7, 11), ph: rnd(0, TAU) }),
    sparkles: () => add({ k: "s", x: rnd(0, W), y: rnd(0, H), vx: 0, vy: 0, s: rnd(3, 8), col: pick(), life: rnd(1.2, 2.2) }),
    fluff: () => add({ k: "fluff", x: rnd(-40, W * .6), y: rnd(H * .3, H + 10), vx: rnd(25, 55), vy: rnd(-12, -32), s: rnd(5, 9), col: "#ffffff", life: rnd(8, 12), ph: rnd(0, TAU), sw: 16, sp: 1 }),
    dust: () => add({ k: "dust", x: rnd(0, W), y: rnd(-10, H * .7), vx: rnd(-6, 6), vy: rnd(6, 18), s: rnd(.8, 2.4), col: GOLD[(Math.random() * 3) | 0], life: rnd(4, 7), ph: rnd(0, TAU), sw: 8, sp: 1 }),
    fireflies: () => add({ k: "ff", x: rnd(0, W), y: rnd(H * .25, H), vx: rnd(-12, 12), vy: rnd(-16, 4), s: rnd(2, 3.6), col: WARM[(Math.random() * 3) | 0], life: rnd(5, 9), ph: rnd(0, TAU), sw: 22, sp: 1 }),
    leaves: () => add({ k: "leaf", ...top(), vx: rnd(-10, 25), vy: rnd(28, 55), s: rnd(6, 11), r: rnd(0, TAU), vr: rnd(-1.6, 1.6), col: pick(), life: rnd(9, 13), ph: rnd(0, TAU), sw: 38, sp: 1 }),
    glyphs: () => add({ k: "gly", ...bottom(), vx: rnd(-10, 10), vy: rnd(-55, -95), s: rnd(13, 22), r: rnd(-.4, .4), col: pick(), ch: GLYPHS[(Math.random() * GLYPHS.length) | 0], life: rnd(5, 8), ph: rnd(0, TAU), sw: 10, sp: 1 }),
    motes: () => add({ k: "mote", x: rnd(0, W), y: rnd(H * .4, H + 10), vx: rnd(-4, 4), vy: rnd(-8, -20), s: rnd(.8, 1.8), col: pick(), life: rnd(7, 11), ph: rnd(0, TAU), sw: 6, sp: 1 }),
    sakura: () => add({ k: "sak", x: rnd(-W * .2, W), y: -20, vx: rnd(18, 48), vy: rnd(30, 60), s: rnd(6, 10), r: rnd(0, TAU), vr: rnd(-1.4, 1.4), col: pick(), life: rnd(9, 14), ph: rnd(0, TAU), sw: 30, sp: 1 }),
    shooting: () => add({ k: "shoot", x: rnd(W * .1, W), y: rnd(0, H * .4), vx: rnd(-520, -380), vy: rnd(160, 240), s: rnd(50, 90), col: "#fff6d8", life: rnd(.7, 1.1), sp: 1 }),
    rain: () => add({ k: "rain", x: rnd(-20, W + 60), y: rnd(-40, -10), vx: -70, vy: rnd(620, 820), s: rnd(12, 22), col: "#dfe9ff", life: 2, sp: 1 }),
    bubbles: () => add({ k: "bub", ...bottom(), vx: rnd(-8, 8), vy: rnd(-35, -70), s: rnd(5, 14), col: pick(), life: rnd(6, 10), ph: rnd(0, TAU), sw: 18, sp: 1 }),
    sprigs: () => add({ k: "sprig", ...top(), vx: rnd(-8, 8), vy: rnd(18, 34), s: rnd(8, 13), r: rnd(0, TAU), vr: rnd(-.8, .8), col: pick(), life: rnd(10, 15), ph: rnd(0, TAU), sw: 26, sp: 1 }),
    scraps: () => add({ k: "scrap", ...top(), vx: rnd(-14, 14), vy: rnd(34, 60), s: rnd(10, 16), r: rnd(0, TAU), vr: rnd(-1.2, 1.2), col: pick(), life: rnd(9, 13), ph: rnd(0, TAU), sw: 20, sp: 1 }),
    stars: () => add({ k: "star5", ...bottom(), vx: rnd(-20, 20), vy: rnd(-80, -140), s: rnd(6, 12), r: rnd(0, TAU), vr: rnd(-3, 3), col: pick(), life: rnd(4, 7), sp: 1 }),
    streamers: () => add({ k: "strm", ...top(), vx: rnd(-20, 20), vy: rnd(50, 90), s: rnd(14, 22), r: rnd(0, TAU), vr: rnd(-3, 3), col: GOLD[(Math.random() * 3) | 0], life: rnd(7, 10), ph: rnd(0, TAU), sw: 28, sp: 1 }),
    peonyp: () => add({ k: "peony", x: rnd(0, W), y: -30, vx: rnd(-12, 12), vy: rnd(22, 40), s: rnd(10, 16), r: rnd(0, TAU), vr: rnd(-.7, .7), col: pick(), life: rnd(11, 16), ph: rnd(0, TAU), sw: 34, sp: 1 }),
    confall: () => add({ k: "c", ...top(), vx: rnd(-20, 20), vy: rnd(50, 95), s: rnd(5, 9), r: rnd(0, TAU), vr: rnd(-4, 4), col: pick(), life: rnd(8, 12), ph: rnd(0, TAU), sw: 20, sp: 1 }),
    balloons: () => add({ k: "bal", x: rnd(W * .05, W * .95), y: H + 40, vx: rnd(-6, 6), vy: rnd(-55, -95), s: rnd(14, 22), col: pick(), life: rnd(9, 13), ph: rnd(0, TAU), sw: 14, sp: 1 }),
    glitter: () => add({ k: "glit", ...top(), vx: rnd(-10, 10), vy: rnd(70, 130), s: rnd(2, 4), r: rnd(0, TAU), vr: rnd(-6, 6), col: GOLD[(Math.random() * 3) | 0], life: rnd(5, 8), sp: 1 }),
    lanterns: () => add({ k: "lan", x: rnd(W * .05, W * .95), y: H + rnd(20, 160), vx: rnd(-6, 6), vy: rnd(-40, -70), s: rnd(10, 16), col: "#ffb85c", life: rnd(11, 15), ph: rnd(0, TAU), sw: 12, sp: 1 }),
    spark: (x, y, col) => { const a = rnd(0, TAU), v = rnd(90, 260); add({ k: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: rnd(1.4, 2.6), col, life: rnd(1.1, 1.8), g: 140, drag: 1.4, sp: 1 }); },
  };
  function draw(p, f) {
    g.globalAlpha = p.k === "s" || p.k === "dust" || p.k === "ff" || p.k === "glit" ? Math.sin(f * Math.PI) * (p.k === "ff" ? .5 + .5 * Math.sin(p.t * 3 + p.ph) : 1)
      : p.k === "rain" ? .35 : p.k === "mote" ? .55 * Math.sin(f * Math.PI) : p.k === "spark" ? 1 - f : f > .75 ? (1 - f) * 4 : 1;
    g.fillStyle = p.col; g.strokeStyle = p.col;
    switch (p.k) {
      case "c": case "scrap": { g.save(); g.translate(p.x, p.y); g.rotate(p.r); if (p.k === "scrap") { g.scale(1, Math.cos(p.t * 2 + p.ph)); g.fillRect(-p.s / 2, -p.s * .32, p.s, p.s * .64); } else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); break; }
      case "h": heart(g, p.x, p.y, p.s); break;
      case "p": case "peony": { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.beginPath(); g.ellipse(0, 0, p.s, p.s * (p.k === "peony" ? .75 : .55), 0, 0, TAU); if (p.k === "peony") g.globalAlpha *= .75; g.fill(); g.restore(); break; }
      case "s": star(g, p.x, p.y, p.s); break;
      case "fluff": { g.globalAlpha *= .8; g.beginPath(); g.arc(p.x, p.y, 1.6, 0, TAU); g.fill(); g.lineWidth = .7; g.beginPath(); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + p.t * .3; g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * p.s, p.y + Math.sin(a) * p.s); } g.stroke(); break; }
      case "dust": case "mote": g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); break;
      case "ff": { const a = g.globalAlpha; g.globalAlpha = a * .22; g.beginPath(); g.arc(p.x, p.y, p.s * 4, 0, TAU); g.fill(); g.globalAlpha = a; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); break; }
      case "leaf": case "sprig": { g.save(); g.translate(p.x, p.y); g.rotate(p.r); leaf(g, p.s); if (p.k === "leaf") g.fill(); else { g.lineWidth = 1.2; g.stroke(); g.beginPath(); g.moveTo(0, -p.s); g.lineTo(0, p.s * 1.5); g.stroke(); } g.restore(); break; }
      case "gly": { g.save(); g.translate(p.x, p.y); g.rotate(p.r); const sc = 1 + .12 * Math.sin(p.t * 6); g.scale(sc, sc); g.font = `${p.s}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(p.ch, 0, 0); g.restore(); break; }
      case "sak": { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(Math.cos(p.t * 2.4 + p.ph), 1); g.beginPath(); g.moveTo(0, p.s); g.bezierCurveTo(p.s, p.s * .3, p.s * .7, -p.s * .8, p.s * .18, -p.s * .7); g.lineTo(0, -p.s * .35); g.lineTo(-p.s * .18, -p.s * .7); g.bezierCurveTo(-p.s * .7, -p.s * .8, -p.s, p.s * .3, 0, p.s); g.fill(); g.restore(); break; }
      case "shoot": { const k = Math.hypot(p.vx, p.vy), ux = p.vx / k, uy = p.vy / k, gr = g.createLinearGradient(p.x, p.y, p.x - ux * p.s, p.y - uy * p.s); gr.addColorStop(0, p.col); gr.addColorStop(1, "rgba(255,255,255,0)"); g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - ux * p.s, p.y - uy * p.s); g.stroke(); break; }
      case "rain": g.lineWidth = 1; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.vx * .02, p.y - p.s); g.stroke(); break;
      case "bub": { g.lineWidth = 1.2; g.globalAlpha *= .7; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.stroke(); g.globalAlpha *= .6; g.beginPath(); g.arc(p.x - p.s * .35, p.y - p.s * .35, p.s * .22, 0, TAU); g.fill(); break; }
      case "star5": { g.save(); g.translate(p.x, p.y); g.rotate(p.r); star(g, 0, 0, p.s, 5, .45); g.restore(); break; }
      case "strm": { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.lineWidth = 2.4; g.beginPath(); for (let i = 0; i <= 8; i++) { const y = -p.s / 2 + (i / 8) * p.s, x = Math.sin(i * 1.3 + p.t * 5) * 3.5; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.restore(); break; }
      case "bal": { g.beginPath(); g.ellipse(p.x, p.y, p.s * .78, p.s, 0, 0, TAU); g.fill(); g.globalAlpha *= .35; g.fillStyle = "#fff"; g.beginPath(); g.ellipse(p.x - p.s * .3, p.y - p.s * .4, p.s * .16, p.s * .26, -.5, 0, TAU); g.fill(); g.strokeStyle = p.col; g.globalAlpha = .45; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x, p.y + p.s); g.quadraticCurveTo(p.x + 6 * Math.sin(p.t * 2), p.y + p.s * 2, p.x, p.y + p.s * 3); g.stroke(); break; }
      case "glit": { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); g.restore(); break; }
      case "lan": { const a = g.globalAlpha; g.globalAlpha = a * .25; g.beginPath(); g.arc(p.x, p.y, p.s * 2.2, 0, TAU); g.fill(); g.globalAlpha = a; g.beginPath(); g.roundRect ? g.roundRect(p.x - p.s * .6, p.y - p.s * .8, p.s * 1.2, p.s * 1.6, p.s * .35) : g.rect(p.x - p.s * .6, p.y - p.s * .8, p.s * 1.2, p.s * 1.6); g.fill(); break; }
      case "spark": g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); break;
    }
  }
  function tick(now) {
    raf = 0; if (dead) return; const rdt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    if (!document.hidden) {
      for (const k in amb) { amb[k].acc += rdt * amb[k].rate * (lite ? .6 : 1); while (amb[k].acc >= 1) { amb[k].acc--; spawn[k](); } }
      g.clearRect(0, 0, W, H);
      parts = parts.filter((p) => (p.t += rdt * p.sp) < p.life && p.y < H + 60 && p.y > -260);
      for (const p of parts) {
        const dt = rdt * p.sp; p.vy += p.g * dt; if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt * .5; }
        p.x += (p.vx + (p.ph !== undefined ? Math.sin(p.t * 2 + p.ph) * (p.sw ?? 24) : 0)) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        draw(p, p.t / p.life);
      }
      g.globalAlpha = 1;
    }
    if (parts.length || Object.keys(amb).length) raf = requestAnimationFrame(tick); else g.clearRect(0, 0, W, H);
  }
  function start() { if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  const cap = (n) => (reduced ? Math.min(n, 18) : lite ? Math.ceil(n * .6) : n);
  return {
    confetti(n = 90, x, y) { for (let i = 0, c = cap(n); i < c; i++) spawn.confetti(x, y); },
    /* one-shot burst of any ambient kind (spread across the screen) or a corner cannon (kind "cannon", dir -1/1) */
    burst(kind, n = 30, x = .5, y = .9, dir = 1) { const c = cap(n); if (kind === "cannon") { for (let i = 0; i < c; i++) spawn.cannon(x, y, dir); return; } if (!spawn[kind]) return; for (let i = 0; i < c; i++) spawn[kind](); },
    fireworks(n = 5, cols) { if (reduced) return this.burst("sparkles", 8); for (let k = 0; k < n; k++) setTimeout(() => { if (dead) return; const x = rnd(W * .15, W * .85), y = rnd(H * .12, H * .45), pal = cols || colors(); const col = pal[(Math.random() * pal.length) | 0]; for (let i = 0, c = lite ? 22 : 38; i < c; i++) spawn.spark(x, y, i % 3 ? col : "#ffffff"); }, k * 520); },
    ambient(kind, rate) { if (!spawn[kind]) return; if (reduced) { if (rate && kind !== "rain") for (let i = 0; i < 6; i++) spawn[kind](); return; } if (rate) { amb[kind] = { rate, acc: 0 }; start(); } else delete amb[kind]; },
    stop() { for (const k in amb) delete amb[k]; },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); cv.remove(); },
  };
}
