/* Light canvas particle layer: confetti, floating hearts, falling petals, sparkles.
   One canvas, one rAF loop that sleeps when nothing is alive or the tab is hidden. */
const TAU = Math.PI * 2;
function heart(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * .35); c.bezierCurveTo(x - s, y - s * .35, x - s * .55, y - s * 1.05, x, y - s * .5); c.bezierCurveTo(x + s * .55, y - s * 1.05, x + s, y - s * .35, x, y + s * .35); c.fill(); }
function star(c, x, y, s) { c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .25 : s; c.lineTo(x + Math.cos(i * Math.PI / 4) * r, y + Math.sin(i * Math.PI / 4) * r); } c.closePath(); c.fill(); }

export function createFx(host, colors, reduced, { lite = false } = {}) {
  const SPEED = .55; // global slow-down: particles drift gently instead of racing across the screen
  const cv = document.createElement("canvas"); cv.className = "lt-fx"; cv.setAttribute("aria-hidden", "true"); host.append(cv);
  const g = cv.getContext("2d"); let W = 0, H = 0, parts = [], raf = 0, last = 0, dead = false; const amb = {};
  const MAX = reduced ? 30 : lite ? 70 : 140, rnd = (a, b) => a + Math.random() * (b - a), pick = () => colors()[(Math.random() * colors().length) | 0];
  const size = () => { const d = lite ? 1 : Math.min(1.5, devicePixelRatio || 1); W = host.clientWidth || 1; H = host.clientHeight || 1; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); };
  const ro = new ResizeObserver(size); ro.observe(host); size();
  const add = (p) => { if (parts.length < MAX) parts.push(p); start(); };
  const spawn = {
    confetti: (x = .5, y = .45) => add({ k: "c", x: W * x, y: H * y, vx: rnd(-240, 240), vy: rnd(-480, -160), s: rnd(5, 10), r: rnd(0, TAU), vr: rnd(-5, 5), col: pick(), life: rnd(2.4, 3.6), t: 0, g: 700 }),
    hearts: () => add({ k: "h", x: rnd(0, W), y: H + 20, vx: rnd(-14, 14), vy: rnd(-70, -140), s: rnd(7, 15), col: pick(), life: rnd(5, 8), t: 0, g: 0, ph: rnd(0, TAU) }),
    petals: () => add({ k: "p", x: rnd(0, W), y: -20, vx: rnd(-20, 20), vy: rnd(40, 90), s: rnd(5, 9), r: rnd(0, TAU), vr: rnd(-2, 2), col: pick(), life: rnd(7, 11), t: 0, g: 0, ph: rnd(0, TAU) }),
    sparkles: () => add({ k: "s", x: rnd(0, W), y: rnd(0, H), vx: 0, vy: 0, s: rnd(3, 8), col: pick(), life: rnd(1.2, 2.2), t: 0, g: 0 }),
  };
  function tick(now) {
    raf = 0; if (dead) return; const rdt = Math.min(.05, (now - last) / 1000 || .016), dt = rdt * SPEED; last = now;
    if (!document.hidden) {
      for (const k in amb) { amb[k].acc += rdt * amb[k].rate * (lite ? .6 : 1); while (amb[k].acc >= 1) { amb[k].acc--; spawn[k](); } }
      g.clearRect(0, 0, W, H);
      parts = parts.filter((p) => (p.t += dt) < p.life && p.y < H + 40);
      for (const p of parts) {
        p.vy += p.g * dt; p.x += (p.vx + (p.ph !== undefined ? Math.sin(p.t * 2 + p.ph) * 24 : 0)) * dt; p.y += p.vy * dt;
        const f = p.t / p.life; g.globalAlpha = p.k === "s" ? Math.sin(f * Math.PI) : f > .75 ? (1 - f) * 4 : 1; g.fillStyle = p.col;
        if (p.k === "c") { p.r += p.vr * dt; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
        else if (p.k === "h") heart(g, p.x, p.y, p.s);
        else if (p.k === "p") { p.r += p.vr * dt; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.beginPath(); g.ellipse(0, 0, p.s, p.s * .55, 0, 0, TAU); g.fill(); g.restore(); }
        else star(g, p.x, p.y, p.s);
      }
      g.globalAlpha = 1;
    }
    if (parts.length || Object.keys(amb).length) raf = requestAnimationFrame(tick); else g.clearRect(0, 0, W, H);
  }
  function start() { if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  return {
    confetti(n = 90, x, y) { const c = reduced ? Math.min(n, 18) : n; for (let i = 0; i < c; i++) spawn.confetti(x, y); },
    ambient(kind, rate) { if (reduced) { if (kind === "sparkles") for (let i = 0; i < 6; i++) spawn.sparkles(); return; } if (rate) { amb[kind] = { rate, acc: 0 }; start(); } else delete amb[kind]; },
    stop() { for (const k in amb) delete amb[k]; },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); cv.remove(); },
  };
}
