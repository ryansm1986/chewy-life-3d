// Ambience beds: continuous filtered-noise layers (wind, stream, rumble) + randomly scheduled events
// (birds, furin wind chimes, crickets, frogs, owl, bubbles, drips...). Deterministic for a given seed so the
// offline render check can drive it synchronously.
import { Voice, noiseBuffer, mulberry32 } from './core.js';

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

// Output trims so the beds sit at similar perceived loudness (calibrated with the render check).
const AMB_GAIN = { village: 1.2, night: 1.8, water: 1, dungeon: 1.4 };

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
};

export const AMBIENCE_NAMES = Object.keys(AMBIENCES);
