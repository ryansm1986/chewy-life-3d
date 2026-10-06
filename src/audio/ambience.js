// Ambience beds: continuous filtered-noise layers (wind, stream, rumble) + randomly scheduled events
// (birds, furin wind chimes, crickets, frogs, owl, bubbles, drips...). Deterministic for a given seed so the
// offline render check can drive it synchronously.
import { Voice, noiseBuffer, mulberry32, hitBuffer, HIT_BASE } from './core.js';
import { AMB } from '../regions/sfx/ambient.js'; // the regions' distinctive voices (shared with their env_* sfx)

export class AmbiencePlayer {
  constructor(graph, name, { seed, start } = {}) {
    const setup = AMBIENCES[name]; if (!setup) throw new Error('[audio] unknown ambience ' + name);
    const c = (this.ctx = graph.ctx);
    this.name = name; this.graph = graph;
    this.rng = mulberry32(seed ?? ((Math.random() * 2 ** 31) | 0));
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(graph.ambIn);
    this.rev = c.createGain(); this.rev.gain.value = 0; this.rev.connect(graph.ambRev);
    this.srcs = []; this.events = []; this.st = {};
    this.t0 = start ?? c.currentTime + 0.05;
    this.stopAt = Infinity; this.disposed = false;
    setup(this, this.t0);
  }
  r(a, b) { return a + this.rng() * (b - a); }
  // Continuous noise bed → filters → gain → pan → out (+ reverb send). Returns { g, f: [filters] }.
  bed({ color = 'pink', filters = [], gain = 0.1, pan = 0, rev = 0, rate = 1 }) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = noiseBuffer(c.sampleRate, color); src.loop = true; src.playbackRate.value = rate;
    let n = src; const fs = [];
    for (const [type, freq, q] of filters) { const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q != null) f.Q.value = q; n.connect(f); n = f; fs.push(f); }
    const g = c.createGain(); g.gain.value = 0; g.gain.setValueAtTime(gain, this.t0); n.connect(g); n = g;
    if (pan) { const p = c.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
    n.connect(this.out);
    if (rev) { const s = c.createGain(); s.gain.value = rev; n.connect(s); s.connect(this.rev); }
    src.start(this.t0, this.rng() * 3); this.srcs.push(src);
    return { g, f: fs };
  }
  every(min, max, fn, first) { this.events.push({ min, max, fn, next: this.t0 + (first ?? this.r(min, max)) }); }
  voice(t) { return new Voice(this.ctx, { dry: this.out, wet: this.rev }, t, 1); }
  scheduleUntil(until, now) {
    if (this.disposed) return;
    for (const e of this.events) {
      if (now != null && e.next < now) e.next = now + this.rng() * e.min; // skip what we slept through
      let guard = 0;
      while (e.next < until && guard++ < 80) { e.fn(e.next); e.next += this.r(e.min, e.max); }
    }
  }
  setLevel(v, now, tc = 0.35) { for (const g of [this.out, this.rev]) g.gain.setTargetAtTime(v * (AMB_GAIN[this.name] ?? 1), now, tc); }
  fadeIn(now, dur, level = 1) {
    level *= AMB_GAIN[this.name] ?? 1;
    for (const g of [this.out, this.rev]) { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(level, now + Math.max(0.02, dur)); }
  }
  fadeOut(now, dur) {
    for (const g of [this.out, this.rev]) { const v = g.gain.value; g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(v, now); g.gain.linearRampToValueAtTime(0, now + Math.max(0.02, dur)); }
    this.stopAt = now + dur + 0.1;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const s of this.srcs) { try { s.stop(); } catch { /* not started */ } }
    try { this.out.disconnect(); this.rev.disconnect(); } catch { /* already */ }
  }
}

// ------------------------------------------------------------------------------------------ critters
function sparrow(A, t) {
  const s = A.voice(t), d = A.r(0.35, 1), pan = A.r(-0.8, 0.8), n = 2 + ((A.rng() * 3) | 0), base = A.r(3600, 4600);
  for (let i = 0; i < n; i++) s.tone({ at: i * A.r(0.1, 0.16), pts: [[0, base * 1.2], [0.022, base * 0.78], [0.045, base * 0.9]], a: 0.003, d: 0.045, v: 0.035 * d, pan, rev: 0.25, lp: 3000 + 6000 * d, ffix: true });
}
function warble(A, t) {
  const s = A.voice(t), d = A.r(0.35, 1), pan = A.r(-0.7, 0.7), sc = [0, 2, 4, 7, 9, 12], base = A.r(2000, 2800);
  let at = 0; const n = 3 + ((A.rng() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const f = base * Math.pow(2, sc[(A.rng() * sc.length) | 0] / 12), len = A.r(0.07, 0.16);
    s.tone({ at, pts: [[0, f * 0.92], [len * 0.4, f * 1.06], [len, f]], a: 0.01, h: len * 0.4, d: len * 0.6, v: 0.03 * d, pan, rev: 0.3, vib: [30, 30] });
    at += len + A.r(0.02, 0.09);
  }
}
// Japanese bush warbler: "hoooo... ho-ke-kyo!"
function uguisu(A, t) {
  const s = A.voice(t), pan = A.r(-0.6, 0.6), k = A.r(0.95, 1.08), v = 0.04;
  s.tone({ pts: [[0, 1100 * k], [0.15, 1180 * k], [0.8, 1230 * k]], a: 0.12, h: 0.55, d: 0.14, lin: true, v: v * 0.8, pan, rev: 0.35, vib: [6, 10] });
  s.tone({ at: 1.05, pts: [[0, 2350 * k], [0.1, 2250 * k]], a: 0.02, h: 0.08, d: 0.05, v, pan, rev: 0.35 });
  s.tone({ at: 1.24, pts: [[0, 2750 * k], [0.05, 2600 * k]], a: 0.01, h: 0.03, d: 0.04, v: v * 0.9, pan, rev: 0.35 });
  s.tone({ at: 1.34, pts: [[0, 3300 * k], [0.05, 2900 * k], [0.2, 2500 * k]], a: 0.01, h: 0.1, d: 0.12, v, pan, rev: 0.35 });
}
function furin(A, t) {
  const s = A.voice(t), notes = [2093, 2349, 2637, 3136, 3520], n = 1 + ((A.rng() * 3) | 0);
  let at = 0;
  for (let i = 0; i < n; i++) {
    s.tone({ at, f: 4200, a: 0.001, d: 0.006, v: 0.01, pan: 0.35 }); // clapper tick
    s.bell({ at: at + 0.002, f: notes[(A.rng() * notes.length) | 0], d: A.r(1.4, 2.4), v: 0.035, pan: 0.35, rev: 0.4 });
    at += A.r(0.09, 0.3);
  }
}
function cricketChirp(A, t, c) {
  if (A.rng() < 0.12) return; // little pauses
  const s = A.voice(t), T = 1 / c.rate, amp = [[0, 0]];
  for (let p = 0; p < c.pulses; p++) { amp.push([p * T + T * 0.25, 1], [p * T + T * 0.75, 0]); }
  s.tone({ f: c.f, amp, v: c.v, pan: c.pan, rev: 0.15, fixed: true });
}
function frog(A, t, fr) {
  const s = A.voice(t), n = 2 + ((A.rng() * 2) | 0);
  for (let i = 0; i < n; i++) s.tone({ at: i * A.r(0.18, 0.24), pts: [[0, fr.f], [0.09, fr.f * 0.88]], type: 'sawtooth', am: [fr.am, 0.5], a: 0.008, h: 0.06, d: 0.05, v: fr.v, bp: 750, bq: 2.5, ffix: true, pan: fr.pan, rev: 0.3 });
}
function drip(A, t, v = 0.09) {
  const s = A.voice(t), f = A.r(1200, 2600), pan = A.r(-0.7, 0.7);
  s.tone({ pts: [[0, f], [0.016, f * 1.7]], a: 0.001, d: 0.07, v, pan, rev: 0.8 });
  if (A.rng() < 0.3) s.tone({ at: A.r(0.15, 0.3), pts: [[0, f * 1.1], [0.014, f * 1.8]], a: 0.001, d: 0.05, v: v * 0.5, pan, rev: 0.8 });
}

// ------------------------------------------------------------------------------------------ ambiences
function wind(A, { gain, lp, gust = [1.5, 4], rustle = 0.05, chimes = true }) {
  const wl = A.bed({ color: 'pink', filters: [['lowpass', lp, 0], ['highpass', 110, 0]], gain: gain * 0.5, pan: -0.6 });
  const wr = A.bed({ color: 'pink', filters: [['lowpass', lp, 0], ['highpass', 110, 0]], gain: gain * 0.5, pan: 0.6 });
  const ru = A.bed({ color: 'white', filters: [['bandpass', 3800, 0.7]], gain: 0 });
  A.every(gust[0], gust[1], t => {
    const lvl = A.r(0.3, 1), tc = A.r(0.6, 1.5);
    wl.g.gain.setTargetAtTime(gain * lvl, t, tc); wr.g.gain.setTargetAtTime(gain * lvl * A.r(0.7, 1), t, tc);
    for (const w of [wl, wr]) w.f[0].frequency.setTargetAtTime(lp * (0.55 + 0.7 * lvl), t, tc);
    ru.g.gain.setTargetAtTime(rustle * lvl * lvl, t, tc);
    if (chimes && lvl > 0.75 && A.rng() < 0.5) furin(A, t + A.r(0.3, 1.2));
  }, 0.01);
}

// Distant kitchenware (cached one-shot buffer, re-pitched), panned and sent to the reverb.
function clank(A, t, kind, v, pan) {
  const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), p = c.createStereoPanner(), s = c.createGain();
  src.buffer = hitBuffer(c.sampleRate, kind); src.playbackRate.value = A.r(0.8, 1.25);
  g.gain.value = v; p.pan.value = pan; s.gain.value = 0.9;
  src.connect(g); g.connect(p); p.connect(A.out); p.connect(s); s.connect(A.rev);
  src.start(t);
}
// A breathy swell of air through a narrow band (shrine torii, fox whispers, glass resonance).
function swell(A, t, { f0, f1, q = 7, len = 4, v = 0.2, color = 'pink', rev = 0.6 }) {
  const s = A.voice(t);
  s.noise({ pts: [[0, f0], [len * 0.5, f1], [len, f0 * 0.9]], q, a: len * 0.4, h: len * 0.2, d: len * 0.4, lin: true, v, color, rev, pan: A.r(-0.6, 0.6) });
}

// ---- regions (docs/REGIONS.md). The distinctive voices (shishi-odoshi, gulls, crows, waves, the temple bell…) live in
// src/regions/sfx/ambient.js; `amb` plays one with the ambience's seeded randomness.
const amb = (A, voice, t, o) => AMB[voice](A.voice(t), (a, b) => A.r(a, b), o);
// A creaking culm: a slow, hollow groan (a buzzy saw through a narrow band, sagging in pitch).
function culmCreak(A, t) {
  const s = A.voice(t), f = A.r(170, 290), len = A.r(0.4, 0.9);
  s.tone({ pts: [[0, f], [len, f * A.r(0.82, 0.93)]], type: 'sawtooth', a: 0.08, h: len * 0.5, d: len * 0.4, lin: true, v: 0.02, bp: A.r(550, 850), bq: 6, am: [A.r(14, 24), 0.55], rev: 0.45, pan: A.r(-0.8, 0.8) });
}
// Culms knocking together in a gust: a few hollow "tok"s (a closed tube's odd harmonic).
function culmKnock(A, t) {
  const s = A.voice(t), n = 2 + ((A.rng() * 4) | 0), pan = A.r(-0.8, 0.8); let at = 0;
  for (let i = 0; i < n; i++) {
    const f = A.r(420, 760), v = A.r(0.025, 0.05);
    s.tone({ at, pts: [[0, f * 1.06], [0.012, f]], a: 0.001, d: 0.12, v, pan, rev: 0.5 });
    s.tone({ at, f: f * 3.01, a: 0.001, d: 0.03, v: v * 0.2, pan, rev: 0.5 });
    at += A.r(0.07, 0.3);
  }
}
// Dry leaves skittering along the ground on a gust: a scatter of tiny crackles over a soft brush.
function leafSkitter(A, t) {
  const s = A.voice(t), n = 5 + ((A.rng() * 8) | 0), pan = A.r(-0.8, 0.8), len = A.r(0.3, 0.8);
  for (let i = 0; i < n; i++) s.noise({ at: A.r(0, len), f: A.r(2400, 5200), q: 3, a: 0.001, d: A.r(0.006, 0.016), v: A.r(0.02, 0.05), pan, rev: 0.2 });
  s.noise({ f: A.r(2500, 3500), q: 0.9, a: len * 0.3, h: len * 0.3, d: len * 0.4, lin: true, v: 0.012, pan, rev: 0.2 });
}
// A brook or river: a moving band of water noise and its babble (a sparser, quieter cousin of the village stream).
function brook(A, { gain = 0.05, pan = 0, rate = [0.08, 0.3], bub = 0.016 }) {
  const b = A.bed({ color: 'white', filters: [['bandpass', 1000, 0.7]], gain, pan });
  A.every(0.6, 1.6, t => { b.f[0].frequency.setTargetAtTime(A.r(750, 1400), t, 0.4); b.g.gain.setTargetAtTime(gain * A.r(0.65, 1.25), t, 0.4); }, 0.01);
  A.every(rate[0], rate[1], t => {
    const s = A.voice(t), f = 360 * Math.pow(2, A.rng() * 2);
    s.tone({ pts: [[0, f], [A.r(0.02, 0.05), f * A.r(1.3, 1.8)]], a: 0.002, d: A.r(0.03, 0.06), v: A.r(0.3, 1) * bub, pan: pan + A.r(-0.3, 0.3) });
  }, 0.05);
}

// Output trims so the beds sit at similar perceived loudness (calibrated with the render check).
const AMB_GAIN = { village: 1.2, night: 1.8, water: 1, dungeon: 1.4, dungeon_shrine: 1.4, dungeon_kitchen: 1.3, dungeon_crystal: 1.5, dungeon_moon: 1.7, dungeon_bamboo: 1.5, dungeon_maple: 1.5, dungeon_tidepool: 1.4, dungeon_onsen: 1.8,
  region_bamboo: 1.3, region_maple: 1.3, region_tidepool: 1.1, region_onsen: 2.4 };

export const AMBIENCES = {
  village(A) {
    wind(A, { gain: 0.17, lp: 800, rustle: 0.06 });
    A.every(1.2, 5, t => {
      const r = A.rng();
      if (r < 0.55) sparrow(A, t);
      else if (r < 0.88) warble(A, t);
      else if (t - (A.st.ug ?? -99) > 25) { uguisu(A, t); A.st.ug = t; }
      else sparrow(A, t);
    }, 0.4);
    A.every(7, 16, t => furin(A, t), 2.5);
  },
  night(A) {
    wind(A, { gain: 0.1, lp: 480, gust: [3, 7], rustle: 0.02, chimes: false });
    for (let k = 0; k < 3; k++) {
      const c = { f: A.r(3900, 5200), pan: A.r(-0.8, 0.8), pulses: 2 + (k % 3), rate: A.r(24, 38), v: A.r(0.015, 0.028) };
      const gap = A.r(0.4, 0.75);
      A.every(gap * 0.92, gap * 1.08, t => cricketChirp(A, t, c), A.r(0, 0.5));
    }
    A.every(3, 8, t => { const s = A.voice(t); s.tone({ f: A.r(4100, 4500), am: [42, 0.9], a: 0.03, h: A.r(0.25, 0.5), d: 0.1, v: 0.012, pan: A.r(-0.5, 0.5), rev: 0.3, fixed: true }); }, 1.5);
    const frogs = [{ f: 190, am: 28, v: 0.085, pan: -0.45 }, { f: 240, am: 34, v: 0.06, pan: 0.5 }];
    for (const fr of frogs) A.every(2.5, 7, t => frog(A, t, fr), A.r(0.5, 3));
    A.every(25, 45, t => { // owl
      const s = A.voice(t), pan = A.r(-0.6, 0.6);
      for (const [at, f, h] of [[0, 390, 0.18], [0.5, 375, 0.1], [0.72, 360, 0.25]]) s.tone({ at, pts: [[0, f * 0.96], [0.06, f]], a: 0.05, h, d: 0.18, lin: true, v: 0.035, lp: 900, pan, rev: 0.5 });
    }, 9);
  },
  water(A) {
    const b1 = A.bed({ color: 'white', filters: [['bandpass', 900, 0.6]], gain: 0.2 });
    const b2 = A.bed({ color: 'white', filters: [['highpass', 2600, 0], ['lowpass', 7000, 0]], gain: 0.045, pan: 0.2 });
    A.bed({ color: 'brown', filters: [['lowpass', 350, 0]], gain: 0.2 });
    A.every(0.5, 1.4, t => {
      b1.f[0].frequency.setTargetAtTime(A.r(650, 1350), t, 0.4); b1.g.gain.setTargetAtTime(A.r(0.13, 0.24), t, 0.4);
      b2.g.gain.setTargetAtTime(A.r(0.03, 0.06), t, 0.3);
    }, 0.01);
    A.every(0.025, 0.08, t => { // babbling bubbles
      const s = A.voice(t), f = 300 * Math.pow(2, A.rng() * 2.3);
      s.tone({ pts: [[0, f], [A.r(0.02, 0.05), f * A.r(1.3, 1.9)]], a: 0.002, d: A.r(0.03, 0.07), v: A.r(0.008, 0.03), pan: A.r(-0.5, 0.5) });
    }, 0.01);
    A.every(2, 5, t => {
      const s = A.voice(t), f = A.r(250, 450);
      s.tone({ pts: [[0, f], [0.04, f * 2]], a: 0.002, d: 0.1, v: 0.05, pan: A.r(-0.4, 0.4), rev: 0.2 });
      s.noise({ f: 1200, q: 1.5, a: 0.002, d: 0.05, v: 0.06 });
    }, 1);
  },
  dungeon(A) {
    const rum = A.bed({ color: 'brown', filters: [['lowpass', 120, 0]], gain: 0.3 });
    const air = A.bed({ color: 'pink', filters: [['bandpass', 380, 3]], gain: 0.05, rev: 0.4 });
    A.every(3, 6, t => { rum.g.gain.setTargetAtTime(A.r(0.2, 0.38), t, 1.5); air.f[0].frequency.setTargetAtTime(A.r(250, 520), t, 2.5); }, 0.01);
    A.every(1, 4, t => drip(A, t), 0.5);
    A.every(9, 20, t => { // pebbles trickling
      const s = A.voice(t), n = 3 + ((A.rng() * 3) | 0), pan = A.r(-0.8, 0.8); let at = 0;
      for (let i = 0; i < n; i++) { s.noise({ at, f: A.r(2000, 4000), q: 4, a: 0.001, d: 0.015, v: 0.14 * (1 - i / n), pan, rev: 0.6 }); at += A.r(0.06, 0.15); }
    }, 4);
    A.every(14, 28, t => { // distant soft moan of air through the burrow
      const s = A.voice(t);
      s.noise({ pts: [[0, 260], [2, 420], [4, 230]], q: 7, a: 1.5, h: 1, d: 1.5, lin: true, v: 0.26, color: 'pink', rev: 0.6, pan: A.r(-0.5, 0.5) });
    }, 6);
  },
  // Fox Shrine Tunnels: a breeze through the torii, far-off furin, a deep temple bell now and then, creaking wood.
  dungeon_shrine(A) {
    A.bed({ color: 'brown', filters: [['lowpass', 140, 0]], gain: 0.22 });
    wind(A, { gain: 0.07, lp: 650, gust: [3, 7], rustle: 0.015, chimes: false });
    A.every(7, 16, t => furin(A, t), 3);
    A.every(2.5, 6, t => drip(A, t, 0.06), 1.5);
    A.every(22, 40, t => { const s = A.voice(t); s.bell({ f: A.r(146, 165), d: 5, v: 0.05, partials: [[1, 1, 1], [2.71, 0.4, 0.5], [5.2, 0.12, 0.25]], rev: 0.7, pan: A.r(-0.5, 0.5) }); }, 8);
    A.every(12, 26, t => { const s = A.voice(t), f = A.r(260, 380); s.tone({ pts: [[0, f], [0.35, f * 0.8]], type: 'sawtooth', a: 0.05, h: 0.25, d: 0.1, v: 0.018, bp: 700, bq: 5, am: [22, 0.6], rev: 0.4, pan: A.r(-0.7, 0.7) }); }, 5);
    A.every(15, 30, t => swell(A, t, { f0: 500, f1: 760, q: 8, len: 3.5, v: 0.16 }), 9);
  },
  // Oni's Kitchen: warm hearth rumble, crackling fire, a bubbling stew pot, sizzle, far-off pot clanks.
  dungeon_kitchen(A) {
    const rum = A.bed({ color: 'brown', filters: [['lowpass', 170, 0]], gain: 0.26 });
    const siz = A.bed({ color: 'white', filters: [['highpass', 3800, 0], ['lowpass', 8000, 0]], gain: 0.006, pan: -0.3 });
    A.every(2, 5, t => { rum.g.gain.setTargetAtTime(A.r(0.2, 0.32), t, 1.2); siz.g.gain.setTargetAtTime(A.r(0.002, 0.009), t, 0.8); }, 0.01);
    A.every(0.06, 0.5, t => { const s = A.voice(t); s.noise({ f: A.r(1800, 4200), q: 3, a: 0.001, d: A.r(0.006, 0.02), v: A.r(0.03, 0.09), pan: A.r(-0.4, 0.1) }); }, 0.2);
    A.every(1.5, 4, t => { // the stew: a cluster of round bubbles
      const s = A.voice(t), n = 3 + ((A.rng() * 5) | 0), pan = A.r(0.1, 0.6); let at = 0;
      for (let i = 0; i < n; i++) { const f = A.r(200, 480); s.tone({ at, pts: [[0, f], [0.05, f * A.r(1.5, 2.1)]], a: 0.004, d: 0.07, v: A.r(0.05, 0.1), pan, rev: 0.2, lp: 2000 }); at += A.r(0.05, 0.22); }
    }, 0.6);
    A.every(8, 18, t => clank(A, t, A.rng() < 0.6 ? 'pot' : 'pan', A.r(0.035, 0.06), A.r(-0.8, 0.8)), 4);
    A.every(18, 35, t => swell(A, t, { f0: 180, f1: 320, q: 5, len: 3, v: 0.14, color: 'brown' }), 10);
  },
  // Crystal Grotto: thin cold air, glassy drips in a huge space, shimmering chime clusters, resonant glass swells.
  dungeon_crystal(A) {
    A.bed({ color: 'brown', filters: [['lowpass', 100, 0]], gain: 0.2 });
    const air = A.bed({ color: 'pink', filters: [['bandpass', 1100, 1.5]], gain: 0.018, rev: 0.6 });
    A.every(3, 7, t => air.f[0].frequency.setTargetAtTime(A.r(800, 1600), t, 2), 0.01);
    A.every(0.8, 3, t => drip(A, t, 0.07), 0.3);
    const E = [1319, 1480, 1661, 1865, 1976, 2489, 2637, 2960];
    A.every(5, 12, t => {
      const s = A.voice(t), n = 2 + ((A.rng() * 4) | 0), pan = A.r(-0.7, 0.7); let at = 0;
      for (let i = 0; i < n; i++) { s.bell({ at, f: E[(A.rng() * E.length) | 0], d: A.r(1.5, 2.8), v: 0.022, pan, rev: 0.8, partials: [[1, 1, 1], [2.32, 0.3, 0.5], [4.25, 0.1, 0.3]] }); at += A.r(0.08, 0.35); }
    }, 2);
    A.every(12, 24, t => swell(A, t, { f0: A.r(1200, 1700), f1: A.r(1800, 2400), q: 18, len: 5, v: 0.12, color: 'white', rev: 0.8 }), 6);
  },
  // Moonlit Fox Sanctum: night breeze, bell crickets, an owl, whispering foxfire, a lone furin.
  dungeon_moon(A) {
    A.bed({ color: 'brown', filters: [['lowpass', 110, 0]], gain: 0.16 });
    wind(A, { gain: 0.08, lp: 520, gust: [3, 8], rustle: 0.015, chimes: false });
    for (let k = 0; k < 2; k++) {
      const c = { f: A.r(4200, 5200), pan: A.r(-0.8, 0.8), pulses: 2 + k, rate: A.r(26, 36), v: A.r(0.012, 0.02) };
      const gap = A.r(0.5, 0.9);
      A.every(gap * 0.9, gap * 1.1, t => cricketChirp(A, t, c), A.r(0, 0.5));
    }
    A.every(10, 22, t => furin(A, t), 5);
    A.every(9, 18, t => swell(A, t, { f0: A.r(700, 1000), f1: A.r(1100, 1600), q: 9, len: 3, v: 0.1, rev: 0.7 }), 4);
    A.every(30, 55, t => { // owl
      const s = A.voice(t), pan = A.r(-0.6, 0.6);
      for (const [at, f, h] of [[0, 390, 0.18], [0.5, 375, 0.1], [0.72, 360, 0.25]]) s.tone({ at, pts: [[0, f * 0.96], [0.06, f]], a: 0.05, h, d: 0.18, lin: true, v: 0.03, lp: 900, pan, rev: 0.6 });
    }, 12);
  },

  // ---- regions (docs/REGIONS.md)
  // Whispering Bamboo Grove: the grove's breath with a bright rustle of bamboo leaves on the gusts, culms creaking and
  // knocking together, a little stream, distant sparrows and warblers (the bush warbler now and then), the shishi-odoshi.
  region_bamboo(A) {
    wind(A, { gain: 0.13, lp: 900, gust: [2, 5], rustle: 0.08, chimes: false });
    brook(A, { gain: 0.04, pan: 0.4 });
    A.every(4, 11, t => culmCreak(A, t), 2);
    A.every(6, 15, t => culmKnock(A, t), 4);
    A.every(2.5, 7, t => {
      const r = A.rng();
      if (r > 0.88 && t - (A.st.ug ?? -99) > 30) { uguisu(A, t); A.st.ug = t; }
      else if (r < 0.5) sparrow(A, t); else warble(A, t);
    }, 1);
    A.every(16, 30, t => amb(A, 'shishiOdoshi', t, { v: 0.7, pan: A.r(0.1, 0.6), rev: 0.6 }), 7);
  },
  // Bamboo Depths (the shrine caves under the grove): a hollow cave bed, the grove's breeze far above through the cracks,
  // culms creaking and knocking, drips into still pools, a brook, a far-off shishi-odoshi and furin (docs/ZONES.md §8.2)
  dungeon_bamboo(A) {
    A.bed({ color: 'brown', filters: [['lowpass', 130, 0]], gain: 0.22 });
    wind(A, { gain: 0.06, lp: 620, gust: [3, 7], rustle: 0.03, chimes: false });
    brook(A, { gain: 0.025, pan: -0.3 });
    A.every(5, 12, t => culmCreak(A, t), 2);
    A.every(8, 18, t => culmKnock(A, t), 5);
    A.every(1.6, 4.5, t => drip(A, t, 0.07), 0.8);
    A.every(9, 20, t => furin(A, t), 6);
    A.every(18, 34, t => amb(A, 'shishiOdoshi', t, { v: 0.45, pan: A.r(-0.6, 0.6), rev: 0.8 }), 9);
    A.every(16, 30, t => swell(A, t, { f0: 300, f1: 520, q: 6, len: 3.5, v: 0.12 }), 11);
  },
  // Maple Roots (the halls under the great maple): a deep earthy cave bed, the wind in the maples far above through the
  // root cracks, dry leaves skittering down, the roots creaking with the tree's sway, drips, a far temple bell, a cricket
  dungeon_maple(A) {
    A.bed({ color: 'brown', filters: [['lowpass', 120, 0]], gain: 0.24 });
    wind(A, { gain: 0.05, lp: 560, gust: [3, 8], rustle: 0.025, chimes: false });
    A.every(2.5, 7, t => leafSkitter(A, t), 2);
    A.every(5, 13, t => culmCreak(A, t), 3);
    A.every(1.8, 5, t => drip(A, t, 0.06), 0.8);
    A.every(50, 90, t => amb(A, 'templeBell', t, { v: 0.32, pan: A.r(-0.6, 0.6), rev: 0.9 }), 25);
    const c = { f: A.r(3800, 4400), pan: A.r(-0.7, 0.7), pulses: 3, rate: A.r(22, 28), v: 0.006 }, gap = A.r(0.8, 1.3);
    A.every(gap * 0.9, gap * 1.1, t => cricketChirp(A, t, c), A.r(0, 0.5));
    A.every(16, 30, t => swell(A, t, { f0: 260, f1: 460, q: 6, len: 3.5, v: 0.12 }), 11);
  },
  // Tide Caves: the sea booming in the cave mouth, the wash sucking back through the rocks, drips everywhere into the
  // pools, little bubbles and crab clicks, a far gull through a blowhole, the cave's long echo
  dungeon_tidepool(A) {
    A.bed({ color: 'brown', filters: [['lowpass', 160, 0]], gain: 0.24 });
    A.bed({ color: 'brown', filters: [['lowpass', 320, 0]], gain: 0.06, rev: 0.6 });
    A.every(6, 11, t => amb(A, 'wave', t, { v: A.r(0.3, 0.55), pan: A.r(-0.6, 0.6), rev: 0.85 }), 1);
    A.every(1, 3, t => drip(A, t, 0.08), 0.4);
    A.every(0.6, 2, t => {
      const s = A.voice(t), n = 1 + ((A.rng() * 3) | 0), pan = A.r(-0.6, 0.6); let at = 0;
      for (let i = 0; i < n; i++) { const f = A.r(450, 1000); s.tone({ at, pts: [[0, f], [0.03, f * A.r(1.4, 2)]], a: 0.002, d: 0.04, v: A.r(0.008, 0.02), pan, rev: 0.5 }); at += A.r(0.03, 0.12); }
    }, 0.3);
    A.every(7, 16, t => {
      const s = A.voice(t), n = 3 + ((A.rng() * 4) | 0), pan = A.r(-0.8, 0.8); let at = 0;
      for (let i = 0; i < n; i++) { s.noise({ at, f: A.r(3000, 5000), q: 5, a: 0.001, d: 0.008, v: A.r(0.025, 0.05), pan, rev: 0.4 }); at += A.r(0.04, 0.1); }
    }, 3);
    A.every(20, 45, t => amb(A, 'gull', t, { v: A.r(0.15, 0.3), pan: A.r(-0.8, 0.8), rev: 0.9 }), 10);
    A.every(14, 26, t => swell(A, t, { f0: 180, f1: 340, q: 5, len: 4, v: 0.14 }), 8);
  },
  // Onsen Caverns: a cold hollow hum with a thin whistle of wind through the ice, ice ticking and creaking, the hot
  // pockets hissing and bubbling, the odd crystalline chime of an icicle letting go
  dungeon_onsen(A) {
    A.bed({ color: 'brown', filters: [['lowpass', 110, 0]], gain: 0.2 });
    A.bed({ color: 'white', filters: [['bandpass', 1400, 6]], gain: 0.008, rev: 0.7 });
    A.every(10, 20, t => swell(A, t, { f0: A.r(900, 1200), f1: A.r(1500, 2000), q: 14, len: 4, v: 0.05, color: 'white', rev: 0.8 }), 5);
    A.every(0.4, 1.6, t => {
      const s = A.voice(t), n = 1 + ((A.rng() * 2) | 0), pan = A.r(-0.5, 0.5), r = (a, b) => A.r(a, b); let at = 0;
      for (let i = 0; i < n; i++) { AMB.blup(s, r, { v: A.r(0.2, 0.5), pan, at }); at += A.r(0.05, 0.2); }
    }, 0.4);
    A.every(2.5, 7, t => { const s = A.voice(t); s.noise({ f: A.r(2500, 4500), q: 4, a: 0.001, d: A.r(0.004, 0.01), v: A.r(0.02, 0.04), pan: A.r(-0.7, 0.7), rev: 0.6 }); }, 1);
    A.every(6, 14, t => { const s = A.voice(t); s.noise({ ft: 'lowpass', f: A.r(260, 420), a: 0.3, h: 0.2, d: 0.5, lin: true, v: 0.04, color: 'brown', pan: A.r(-0.3, 0.3) }); }, 3);
    const E = [1568, 1760, 2093, 2349, 2637];
    A.every(9, 20, t => { const s = A.voice(t); s.bell({ f: E[(A.rng() * E.length) | 0], d: A.r(1.2, 2.2), v: 0.016, pan: A.r(-0.7, 0.7), rev: 0.85, partials: [[1, 1, 1], [2.32, 0.3, 0.5], [4.25, 0.1, 0.3]] }); }, 4);
    A.every(1.4, 4, t => drip(A, t, 0.05), 1);
  },
  // Momiji Hollow: wind in the maples, dry leaves skittering, the river nearby and the waterfall's low roar far off,
  // crows, warblers, a sika deer calling, an evening temple bell, a couple of autumn crickets as the sun goes down.
  region_maple(A) {
    wind(A, { gain: 0.11, lp: 720, gust: [2, 6], rustle: 0.05, chimes: false });
    A.every(1.5, 5, t => leafSkitter(A, t), 1);
    brook(A, { gain: 0.06, pan: -0.35, rate: [0.1, 0.35], bub: 0.014 });
    A.bed({ color: 'pink', filters: [['lowpass', 520, 0], ['highpass', 90, 0]], gain: 0.07, pan: 0.5, rev: 0.3 });
    A.every(9, 22, t => amb(A, 'crow', t, { v: A.r(0.35, 0.75), pan: A.r(-0.8, 0.8), rev: 0.55 }), 3);
    A.every(4, 10, t => (A.rng() < 0.6 ? warble(A, t) : sparrow(A, t)), 2);
    A.every(26, 48, t => amb(A, 'deer', t, { v: A.r(0.4, 0.7), pan: A.r(-0.7, 0.7), rev: 0.75 }), 11);
    A.every(45, 80, t => amb(A, 'templeBell', t, { v: 0.45, pan: A.r(-0.6, 0.6), rev: 0.85 }), 20);
    for (let k = 0; k < 2; k++) {
      const c = { f: A.r(3800, 4600), pan: A.r(-0.8, 0.8), pulses: 3 + k, rate: A.r(22, 30), v: A.r(0.006, 0.01) };
      const gap = A.r(0.7, 1.2);
      A.every(gap * 0.9, gap * 1.1, t => cricketChirp(A, t, c), A.r(0, 0.5));
    }
  },
  // Shiokaze Tidepools: the salty breeze, the sea's low wash, waves rolling in and breaking, gulls, the tide pools'
  // little bubbles and drips, crabs clicking on the rocks.
  region_tidepool(A) {
    wind(A, { gain: 0.09, lp: 1100, gust: [2, 5], rustle: 0.02, chimes: false });
    A.bed({ color: 'brown', filters: [['lowpass', 380, 0]], gain: 0.14 });
    A.every(4.5, 8.5, t => amb(A, 'wave', t, { v: A.r(0.55, 1), pan: A.r(-0.5, 0.5), rev: 0.3 }), 0.4);
    A.every(5, 13, t => amb(A, 'gull', t, { v: A.r(0.35, 0.85), pan: A.r(-0.85, 0.85), rev: 0.4 }), 2);
    A.every(0.4, 1.6, t => {
      const s = A.voice(t), n = 1 + ((A.rng() * 3) | 0), pan = A.r(-0.6, 0.6); let at = 0;
      for (let i = 0; i < n; i++) { const f = A.r(500, 1200); s.tone({ at, pts: [[0, f], [0.03, f * A.r(1.4, 2)]], a: 0.002, d: 0.04, v: A.r(0.01, 0.025), pan, rev: 0.2 }); at += A.r(0.03, 0.12); }
    }, 0.3);
    A.every(2.5, 6, t => drip(A, t, 0.045), 1);
    A.every(6, 14, t => {
      const s = A.voice(t), n = 3 + ((A.rng() * 5) | 0), pan = A.r(-0.8, 0.8); let at = 0;
      for (let i = 0; i < n; i++) { s.noise({ at, f: A.r(3000, 5000), q: 5, a: 0.001, d: 0.008, v: A.r(0.03, 0.06), pan }); at += A.r(0.04, 0.1); }
    }, 3);
  },
  // Yukimi Onsen: a soft snowy wind (the snow eats the highs) with a thin whistle at the eaves, steam hissing off the
  // springs and their low bubbling, the lanterns' flames crackling and fluttering, a distant temple bell, snow sliding
  // off laden branches.
  region_onsen(A) {
    wind(A, { gain: 0.1, lp: 460, gust: [3, 7], rustle: 0.008, chimes: false });
    A.every(10, 20, t => swell(A, t, { f0: A.r(900, 1200), f1: A.r(1500, 2100), q: 12, len: 3.5, v: 0.05, color: 'white', rev: 0.6 }), 5);
    A.bed({ color: 'white', filters: [['highpass', 3000, 0], ['lowpass', 7000, 0]], gain: 0.007, pan: -0.2 });
    A.every(0.25, 1, t => {
      const s = A.voice(t), n = 1 + ((A.rng() * 3) | 0), pan = A.r(-0.5, 0.2), r = (a, b) => A.r(a, b); let at = 0;
      for (let i = 0; i < n; i++) { AMB.blup(s, r, { v: A.r(0.3, 0.8), pan, at }); at += A.r(0.05, 0.2); }
    }, 0.2);
    A.every(0.12, 0.8, t => { const s = A.voice(t); s.noise({ f: A.r(1500, 3800), q: 3, a: 0.001, d: A.r(0.005, 0.016), v: A.r(0.012, 0.04), pan: A.r(-0.3, 0.4) }); }, 0.3);
    A.every(5, 11, t => { const s = A.voice(t); s.noise({ ft: 'lowpass', f: A.r(260, 420), a: 0.3, h: 0.2, d: 0.5, lin: true, v: 0.05, color: 'brown', pan: A.r(-0.3, 0.3) }); }, 3);
    A.every(28, 50, t => amb(A, 'templeBell', t, { v: 0.6, pan: A.r(-0.6, 0.6), rev: 0.85 }), 6);
    A.every(14, 30, t => amb(A, 'snowfall', t, { v: A.r(0.5, 1), pan: A.r(-0.7, 0.7), rev: 0.35 }), 8);
  },
};

// Biome ambience per Burrow theme (gen.js THEMES keys) and per outdoor region (layout.theme = region id).
export const BIOME_AMBIENCES = { burrow: 'dungeon', shrine: 'dungeon_shrine', kitchen: 'dungeon_kitchen', crystal: 'dungeon_crystal', moon: 'dungeon_moon',
  bambooCave: 'dungeon_bamboo', mapleHalls: 'dungeon_maple', seaCave: 'dungeon_tidepool', iceCavern: 'dungeon_onsen', // (the zone dungeons' kits: gen.js THEMES keys)
  bamboo: 'region_bamboo', maple: 'region_maple', tidepool: 'region_tidepool', onsen: 'region_onsen' };

export const AMBIENCE_NAMES = Object.keys(AMBIENCES);
