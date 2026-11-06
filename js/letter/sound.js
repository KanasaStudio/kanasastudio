/* Per-template sound effects for the letter player, synthesised with WebAudio (no files, works offline).
   Each engine has its own "voice" (envelope = paper + wax, giftbox = ribbon + chime, cake = party + xylophone,
   scrapbook = page + tape, cinematic = deep swell + bells). The theme colour hue transposes the scale, so
   templates that share an engine still sound different. Silent until the first user gesture; honours reduced motion + mute. */
const SCALES = [[0, 4, 7, 12], [0, 3, 7, 10], [0, 2, 7, 9], [0, 5, 7, 12], [0, 4, 9, 11], [0, 3, 5, 10]];
const hue = (hex) => { const n = parseInt(String(hex).replace("#", ""), 16) || 0, r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, m = Math.max(r, g, b), d = m - Math.min(r, g, b); if (!d) return 0; const h = m === r ? ((g - b) / d) % 6 : m === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };

export function createSound(engine, primary, { off = false } = {}) {
  let c = null, out = null, muted = off, nb = null;
  const h = hue(primary), root = 220 * 2 ** ((Math.round(h / 30) % 7) / 12), sc = SCALES[Math.floor(h / 60) % SCALES.length];
  const note = (i, oct = 0) => root * 2 ** ((sc[i % sc.length] + 12 * (Math.floor(i / sc.length) + oct)) / 12);
  const ac = () => {
    if (c) return c; const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
    c = new A(); out = c.createGain(); out.gain.value = .5; out.connect(c.destination); return c;
  };
  const noise = () => { if (nb) return nb; nb = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nb; };
  const tone = (t, f, dur, type = "sine", g = .2, f1) => {
    const o = c.createOscillator(), a = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(g, t + .008); a.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(a).connect(out); o.start(t); o.stop(t + dur + .03);
  };
  const hiss = (t, f0, f1, dur, g = .15, q = 1, type = "bandpass") => {
    const s = c.createBufferSource(); s.buffer = noise(); s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const a = c.createGain(); a.gain.setValueAtTime(.0001, t); a.gain.exponentialRampToValueAtTime(g, t + dur * .3); a.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(f).connect(a).connect(out); s.start(t); s.stop(t + dur + .05);
  };
  const bell = (t, f, dur = .9, g = .12) => { tone(t, f, dur, "sine", g); tone(t, f * 2.76, dur * .5, "sine", g * .35); tone(t, f * 5.4, dur * .25, "sine", g * .12); };
  const pop = (t, g = .25) => { hiss(t, 3000, 600, .09, g, .7, "highpass"); tone(t, 220, .08, "sine", g * .6, 70); };

  const V = {
    envelope: {
      open: (t) => { hiss(t, 1800, 700, .12, .2, 3); tone(t + .1, 140, .09, "triangle", .3, 70); hiss(t + .25, 500, 2400, .5, .13, .9); bell(t + .7, note(4, 1), 1.1, .07); },
      tick: (t) => hiss(t, 4200 + Math.random() * 1500, 3000, .02, .05, 4),
      reveal: (t) => { [0, 1, 2, 3].forEach((i) => bell(t + i * .12, note(i, 1), .8, .08)); },
      end: (t) => { bell(t, note(0, 1), 1.6, .1); bell(t + .3, note(2, 1), 1.8, .08); },
    },
    giftbox: {
      open: (t) => { hiss(t, 900, 3200, .35, .16, 1.2); tone(t + .1, 170, .1, "triangle", .3, 90); [0, 1, 2, 3, 4].forEach((i) => bell(t + .25 + i * .07, note(i, 2), .7, .07)); },
      tick: (t) => tone(t, note(Math.floor(Math.random() * 4), 2), .05, "triangle", .035),
      reveal: (t) => { hiss(t, 6000, 2000, .5, .07, 2, "highpass"); [0, 2, 3].forEach((i) => bell(t + i * .09, note(i, 2), .9, .08)); },
      end: (t) => { [0, 1, 2, 3].forEach((i) => bell(t + i * .1, note(3 - i, 1), 1.2, .08)); },
    },
    cake: {
      open: (t) => { hiss(t, 700, 200, .22, .22, .6, "lowpass"); tone(t + .05, 420, .25, "sine", .12, 120); pop(t + .3, .22); [0, 1, 2, 3, 4, 5].forEach((i) => tone(t + .35 + i * .06, note(i, 1), .22, "triangle", .09)); },
      tick: (t) => tone(t, note(Math.floor(Math.random() * 4), 1), .06, "square", .025),
      reveal: (t) => { pop(t, .2); pop(t + .12, .15); pop(t + .26, .2); },
      end: (t) => { [0, 2, 1, 3, 4].forEach((i, k) => tone(t + k * .08, note(i, 1), .3, "triangle", .1)); },
    },
    scrapbook: {
      open: (t) => { hiss(t, 400, 1800, .45, .2, .7); tone(t + .25, 110, .12, "sine", .2, 60); hiss(t + .5, 2500, 900, .12, .1, 2); },
      tick: (t) => { hiss(t, 2600, 1800, .025, .045, 5); },
      reveal: (t) => { hiss(t, 3500, 1200, .1, .1, 3); hiss(t + .1, 500, 1500, .3, .09, .8); },
      end: (t) => { tone(t, note(0, 1), .5, "sine", .09); tone(t + .15, note(2, 1), .7, "sine", .08); hiss(t + .3, 400, 1200, .3, .06, .8); },
    },
    cinematic: {
      open: (t) => { hiss(t, 120, 1200, 1.3, .2, .6, "lowpass"); tone(t + 1.3, note(0, -1), 2.4, "sine", .22); tone(t + 1.3, note(0, 0), 2, "triangle", .06); bell(t + 1.4, note(3, 1), 2, .06); },
      tick: (t) => tone(t, note(0, 3), .03, "sine", .018),
      reveal: (t) => { bell(t, note(Math.floor(Math.random() * 4), 1), 1.8, .07); },
      end: (t) => { tone(t, note(0, -1), 3.2, "sine", .2); tone(t + .1, note(2, 0), 3, "sine", .07); bell(t + .6, note(3, 1), 2.4, .06); },
    },
  };
  const v = V[engine] || V.envelope;
  let lastTick = 0;
  return {
    set muted(m) { muted = !!m; }, get muted() { return muted; },
    play(name) {
      if (muted || !v[name]) return;
      if (name === "tick") { const n = performance.now(); if (n - lastTick < 70) return; lastTick = n; }
      const a = ac(); if (!a) return; if (a.state === "suspended") a.resume().catch(() => {});
      try { v[name](a.currentTime + .01); } catch {}
    },
    destroy() { try { c?.close(); } catch {} c = null; },
  };
}
