// Generative music. Each track is a small "band": a form (intro / A / B / break sections), chord progressions,
// themes that are generated as 8-bar periods (antecedent + consequent built from a 2-bar motif), re-voiced with
// variations when they recur, and regenerated every few cycles so the music keeps evolving without losing identity.
// A MusicPlayer schedules one bar at a time against the audio clock; scheduleUntil(t) is deterministic for a
// given seed, which lets the render check drive it synchronously inside an OfflineAudioContext.
import { mulberry32, clamp } from './core.js';
import { INST } from './instruments.js';

// ------------------------------------------------------------------------------------------ theory helpers
const IV = {
  M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], d7: [0, 4, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], M9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], s7sus4: [0, 5, 7, 10], p5: [0, 7, 12], M6: [0, 4, 7, 9],
};
const C = (root, q) => ({ root, iv: IV[q], pcs: IV[q].map(x => (root + x) % 12) });
const pcOf = (m, key) => (((m - key) % 12) + 12) % 12;
const fold = (m, lo) => { while (m < lo) m += 12; while (m >= lo + 12) m -= 12; return m; };
const pickR = (rng, a) => a[Math.floor(rng() * a.length)];
function scaleNotes(key, scale, lo, hi) { const out = []; for (let m = lo; m <= hi; m++) if (scale.includes(pcOf(m, key))) out.push(m); return out; }
// Closest scale index whose pitch class is a chord tone; prefers the melodic direction and avoids
// snapping straight back onto `avoid` (the previous note) so lines keep moving.
function nearest(notes, idx, key, pcs, range = 3, dir = 1, avoid = -1) {
  for (let pass = 0; pass < 2; pass++) for (let r = 0; r <= range; r++) for (const s of r ? [r * dir, -r * dir] : [0]) {
    const j = idx + s;
    if (j < 0 || j >= notes.length || (pass === 0 && j === avoid)) continue;
    if (pcs.includes(pcOf(notes[j], key))) return j;
  }
  return idx;
}
function stepRand(rng, leap) {
  const r = rng();
  if (r < 0.1) return 0;
  if (r < 0.62) return rng() < 0.5 ? 1 : -1;
  if (r < 1 - leap) return rng() < 0.5 ? 2 : -2;
  return (rng() < 0.5 ? 1 : -1) * (3 + ((rng() * 2) | 0));
}

// Rhythm cells: [pos, len] in eighth notes within a 4/4 bar.
const CELLS = {
  flow: [
    [[0, 2], [2, 2], [4, 2], [6, 2]], [[0, 3], [3, 1], [4, 4]], [[0, 2], [2, 1], [3, 1], [4, 4]], [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2]],
    [[0, 2], [2, 2], [4, 3], [7, 1]], [[0, 4], [4, 2], [6, 2]], [[0, 3], [3, 3], [6, 2]], [[1, 1], [2, 2], [4, 2], [6, 2]], [[0, 2], [3, 1], [4, 2], [6, 1], [7, 1]],
  ],
  busy: [
    [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2]], [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 2]],
    [[0, 1], [1, 2], [3, 1], [4, 1], [5, 2], [7, 1]], [[0, 2], [2, 2], [4, 1], [5, 1], [6, 1], [7, 1]],
  ],
  sparse: [[[0, 4], [4, 4]], [[0, 6], [6, 2]], [[0, 3], [3, 5]], [[2, 2], [4, 4]], [[0, 2], [2, 6]], [[0, 4], [5, 3]]],
  end: [[[0, 8]], [[0, 2], [2, 6]], [[0, 4], [4, 4]], [[0, 1], [1, 1], [2, 6]], [[0, 3], [3, 5]]],
  endSparse: [[[0, 8]], [[0, 2], [2, 6]]],
};

// One bar of melody. mode: 'free' | 'seq' (replay recorded contour) | 'end' (land on target pcs).
function genBar(rng, th, key, ch, cell, mode, st, endPcs) {
  const N = th.notes.length, out = [], rec = [];
  cell.forEach(([pos, len], j) => {
    const prev = st.idx;
    if (mode === 'seq' && st.contour) {
      st.idx = j === 0 ? nearest(th.notes, st.idx + (rng() < 0.5 ? 1 : -1), key, ch.pcs, 2) : clamp(st.idx + (st.contour[j] ?? 0), 0, N - 1);
      if (len >= 4) st.idx = nearest(th.notes, st.idx, key, ch.pcs, 1);
    } else if (!st.fresh) {
      let s = stepRand(rng, th.leap ?? 0.12);
      if ((st.idx > N - 3 && s > 0) || (st.idx < 2 && s < 0)) s = -s;
      st.idx = clamp(st.idx + s, 0, N - 1);
      if (pos % 4 === 0 || len >= 3) st.idx = nearest(th.notes, st.idx, key, ch.pcs, 2, s < 0 ? -1 : 1, s === 0 ? -1 : prev);
    } else { st.idx = nearest(th.notes, st.idx, key, ch.pcs, 2); st.fresh = false; }
    if (mode === 'end' && j === cell.length - 1) st.idx = nearest(th.notes, st.idx, key, endPcs, 4);
    rec.push(st.idx - prev);
    out.push({ pos, len, m: th.notes[st.idx], idx: st.idx });
  });
  return { notes: out, rec };
}

// 8-bar period: phrase 1 ends "open" (re / sol), phrase 2 restates the opening and resolves to the tonic.
function genPeriod(rng, th, key, chordAt) {
  const cells = CELLS[th.cells || 'flow'], ends = CELLS[th.ends || 'end'];
  const N = th.notes.length, start = Math.floor(N * (0.3 + rng() * 0.3));
  const m0 = pickR(rng, cells), m1 = pickR(rng, cells);
  const st = { idx: start, fresh: true };
  const b0 = genBar(rng, th, key, chordAt(0), m0, 'free', st); st.contour = b0.rec;
  const b1 = genBar(rng, th, key, chordAt(1), m1, 'free', st);
  const mid = st.idx;
  const b2 = genBar(rng, th, key, chordAt(2), m0, 'seq', st);
  const b3 = genBar(rng, th, key, chordAt(3), pickR(rng, ends), 'end', st, [2, 7, 4]);
  st.idx = mid; st.fresh = false;
  const c2 = genBar(rng, th, key, chordAt(6), rng() < 0.5 ? m0 : pickR(rng, cells), rng() < 0.6 ? 'seq' : 'free', st);
  const c3 = genBar(rng, th, key, chordAt(7), pickR(rng, ends), 'end', st, [0]);
  return [b0.notes, b1.notes, b2.notes, b3.notes, b0.notes.map(n => ({ ...n })), b1.notes.map(n => ({ ...n })), c2.notes, c3.notes];
}

// Variation for a recurring theme: re-snap strong beats to the (possibly new) chords, split some long notes,
// nudge some weak-beat notes, add grace notes.
function vary(rng, bars, amt, th, key, chordAt) {
  const N = th.notes.length;
  return bars.map((bar, b) => {
    const ch = chordAt(b), last = b % 4 === 3, out = [];
    bar.forEach((n, j) => {
      let idx = n.idx;
      if (n.pos % 4 === 0) idx = nearest(th.notes, idx, key, ch.pcs, 1);
      const isLast = last && j === bar.length - 1;
      if (!isLast && rng() < amt) {
        if (n.len >= 2 && rng() < 0.45) {
          const h = n.len >= 4 ? 2 : 1, idx2 = clamp(idx + (rng() < 0.5 ? 1 : -1), 0, N - 1);
          out.push({ pos: n.pos, len: h, m: th.notes[idx], idx }, { pos: n.pos + h, len: n.len - h, m: th.notes[idx2], idx: idx2 });
          return;
        }
        if (n.pos % 4 !== 0) idx = clamp(idx + (rng() < 0.5 ? 1 : -1), 0, N - 1);
      }
      out.push({ pos: n.pos, len: n.len, m: th.notes[idx], idx, grace: !isLast && n.len >= 2 && rng() < amt * 0.35, g: th.notes[Math.min(N - 1, idx + 1)] });
    });
    return out;
  });
}

// ------------------------------------------------------------------------------------------ player
export class MusicPlayer {
  constructor(graph, name, { seed, start } = {}) {
    const def = TRACKS[name]; if (!def) throw new Error('[audio] unknown track ' + name);
    const c = (this.ctx = graph.ctx);
    this.graph = graph; this.def = def; this.name = name;
    this.rng = mulberry32(seed ?? ((Math.random() * 2 ** 31) | 0));
    this.key = def.key; this.beat = 60 / def.bpm; this.s16 = this.beat / 4; this.barDur = this.beat * 4; this.swing = def.swing || 0;
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(graph.musicIn);
    this.revOut = c.createGain(); this.revOut.gain.value = 0; this.revOut.connect(graph.musicRev);
    // tempo-synced, darkened echo
    this.echoIn = c.createGain();
    const dl = c.createDelay(3); dl.delayTime.value = this.beat * (def.echo ?? 0.75);
    const fb = c.createGain(); fb.gain.value = def.echoFb ?? 0.3;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2300;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const er = c.createGain(); er.gain.value = 0.35;
    this.echoIn.connect(dl); dl.connect(lp); lp.connect(hp); hp.connect(fb); fb.connect(dl); hp.connect(this.out); hp.connect(er); er.connect(this.revOut);
    this.ch = {};
    for (const [k, m] of Object.entries(def.mix)) {
      const inp = c.createGain(); inp.gain.value = m.vol ?? 0.5;
      let n = inp;
      if (m.pan) { const p = c.createStereoPanner(); p.pan.value = m.pan; inp.connect(p); n = p; }
      n.connect(this.out);
      if (m.rev) { const g = c.createGain(); g.gain.value = m.rev; n.connect(g); g.connect(this.revOut); }
      if (m.echo) { const g = c.createGain(); g.gain.value = m.echo; n.connect(g); g.connect(this.echoIn); }
      this.ch[k] = inp;
    }
    this.nextBar = start ?? c.currentTime + 0.1;
    this.bars = 0; this.si = -1; this.sb = 0; this.cycle = 0; this.sec = null; this.themes = {}; this.st = {};
    this.stopAt = Infinity; this.disposed = false;
  }
  // ---- helpers used by track definitions
  pos(t, p16) { return t + p16 * this.s16 + (p16 % 4 === 2 ? this.swing * this.s16 : 0); }
  note(inst, ch, t, m, vel, dur, o) {
    const h = (this.rng() - 0.5) * 0.012, v = clamp(vel * (0.92 + this.rng() * 0.16), 0.05, 1.2);
    if (!this.ch[ch]) return;
    if (this.log) this.log.push({ inst, ch, t: t + h, m, v, dur, sec: this.sec && this.sec.n });
    INST[inst](this.ctx, this.ch[ch], Math.max(this.ctx.currentTime, t + h), m, v, dur, o);
  }
  hit(inst, ch, t, vel, m) { this.note(inst, ch, t, m || 0, vel, 0.1); }
  padChord(chord, t, dur, vel, lo = 55, inst = 'pad', ch = 'pad') {
    for (const x of chord.iv) this.note(inst, ch, t, fold(this.key + chord.root + x, lo), vel, dur);
  }
  ladder(chord, lo, n = 8) {
    const pcs = chord.iv.map(x => (chord.root + x) % 12), out = [];
    for (let m = lo; out.length < n && m < lo + 48; m++) if (pcs.includes(pcOf(m, this.key))) out.push(m);
    return out;
  }
  arp(chord, t, pat, { inst = 'harp', ch = 'harp', lo = 55, vel = 0.4, step = 2, len = 3 } = {}) {
    const lad = this.ladder(chord, lo);
    pat.forEach((k, i) => { if (k >= 0) this.note(inst, ch, this.pos(t, i * step), lad[k % lad.length], vel * (i % 2 ? 0.85 : 1), len * this.s16); });
  }
  bassLine(chord, t, hits, lo = 38, inst = 'bass', ch = 'bass') {
    for (const [p16, l16, vel, iv = 0] of hits) this.note(inst, ch, this.pos(t, p16), fold(this.key + chord.root + iv, lo), vel, l16 * this.s16);
  }
  melody(bar, t, inst, ch, vel = 0.8, { oct = 0, legato = 0.95 } = {}) {
    if (!bar) return;
    const E = this.s16 * 2;
    for (const n of bar) {
      const tt = this.pos(t, n.pos * 2), dur = n.len * E * legato, v = vel * (n.pos % 4 === 0 ? 1 : 0.85);
      if (n.grace && inst !== 'flute') this.note(inst, ch, tt - 0.055, (n.g ?? n.m + 2) + oct, v * 0.55, 0.05);
      const o = inst === 'koto' && n.len >= 4 && this.rng() < 0.45 ? { yuri: true } : undefined;
      this.note(inst, ch, tt, n.m + oct, v, dur, o);
    }
  }
  sprinkle(t, inst, ch, lo, hi, prob, vel = 0.4, scale = this.def.scale) {
    const notes = scaleNotes(this.key, scale, lo, hi);
    for (let i = 0; i < 8; i++) if (this.rng() < prob) this.note(inst, ch, this.pos(t, i * 2), pickR(this.rng, notes), vel, 0.4);
  }
  // ---- form / scheduling
  themeDef(name) {
    const th = this.def.themes[name];
    if (!th.notes) th.notes = scaleNotes(this.key, th.scale || this.def.scale, th.lo, th.hi);
    return th;
  }
  _nextSection() {
    const def = this.def;
    this.si++;
    if (this.si >= def.form.length) {
      this.si = def.loopFrom ?? 1; this.cycle++;
      delete this.themes.B; delete this.themes.C;
      if (this.cycle % 2 === 0) delete this.themes.A; // the main theme returns once varied, then a new one grows
    }
    const sec = (this.sec = def.form[this.si]); this.sb = 0;
    const prog = def.progs[sec.prog], chordAt = i => prog[i % prog.length];
    this.secMel = null;
    if (sec.theme) {
      const th = this.themeDef(sec.theme);
      const base = this.themes[sec.theme];
      if (!base) this.secMel = this.themes[sec.theme] = genPeriod(this.rng, th, this.key, chordAt);
      else this.secMel = vary(this.rng, base, sec.vary ?? 0.25, th, this.key, chordAt);
    }
    def.section?.(this, sec);
  }
  _bar(t) {
    if (!this.sec || this.sb >= this.sec.bars) this._nextSection();
    const sec = this.sec, prog = this.def.progs[sec.prog];
    const info = { t, sec, i: this.sb, n: this.bars, chord: prog[this.sb % prog.length], next: prog[(this.sb + 1) % prog.length],
      mel: this.secMel ? this.secMel[this.sb % this.secMel.length] : null, last: this.sb === sec.bars - 1 };
    this.def.bar(this, info);
    this.sb++; this.bars++;
  }
  scheduleUntil(until) {
    if (this.disposed) return;
    let guard = 0;
    while (this.nextBar < until && guard++ < 8) { this._bar(this.nextBar); this.nextBar += this.barDur; }
  }
  resync(now) { this.nextBar = now + 0.08; }
  // Advance the form by n bars without producing sound (render-check / debugging).
  skip(n) { for (let i = 0; i < n; i++) { if (!this.sec || this.sb >= this.sec.bars) this._nextSection(); this.sb++; this.bars++; } }
  solo(names) { for (const [k, g] of Object.entries(this.ch)) if (!names.includes(k)) g.gain.value = 0; }
  fadeIn(now, dur) {
    const lvl = this.def.gain ?? 1;
    for (const g of [this.out, this.revOut]) { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(lvl, now + Math.max(0.02, dur)); }
  }
  fadeOut(now, dur) {
    for (const g of [this.out, this.revOut]) {
      const v = g.gain.value; g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(v, now); g.gain.linearRampToValueAtTime(0, now + Math.max(0.02, dur));
    }
    this.stopAt = now + dur + 0.1;
  }
  dispose() { if (this.disposed) return; this.disposed = true; try { this.out.disconnect(); this.revOut.disconnect(); } catch { /* already */ } }
}

// ------------------------------------------------------------------------------------------ tracks
const ARPS = [
  [0, 2, 4, 2, 1, 3, 5, 3], [0, -1, 2, 4, -1, 3, -1, 5], [0, 1, 2, 3, 4, 3, 2, 1], [0, -1, 3, -1, 2, -1, 4, -1],
  [0, 2, 1, 3, 2, 4, 3, 5], [-1, 1, 2, -1, -1, 3, 4, -1],
];
const BASS_12 = [[0, 6, 0.8], [8, 6, 0.55, 7]];

export const TRACKS = {
  // Gentle koto + pad + light percussion over the J-pop "royal road" progression, D major pentatonic.
  village_day: {
    bpm: 92, swing: 0.12, key: 62, scale: [0, 2, 4, 7, 9], echo: 0.75, gain: 1.3,
    mix: {
      koto: { vol: 0.85, rev: 0.3, echo: 0.14, pan: -0.12 }, harp: { vol: 0.5, rev: 0.35, pan: 0.25 }, flute: { vol: 0.75, rev: 0.45, echo: 0.12, pan: 0.05 },
      kal: { vol: 0.7, rev: 0.35, echo: 0.18, pan: 0.15 }, pad: { vol: 0.55, rev: 0.5 }, bass: { vol: 0.7, rev: 0.06 },
      perc: { vol: 0.9, rev: 0.15, pan: 0.18 }, bell: { vol: 0.5, rev: 0.6, echo: 0.2, pan: -0.25 },
    },
    progs: {
      main: [C(5, 'M7'), C(7, 'M'), C(4, 'm7'), C(9, 'm7')],
      alt: [C(0, 'add9'), C(7, 'sus4'), C(9, 'm7'), C(5, 'M7')],
      B: [C(2, 'm7'), C(7, 's7sus4'), C(0, 'M7'), C(9, 'm7')],
    },
    themes: { A: { lo: 64, hi: 83 }, B: { lo: 69, hi: 86, cells: 'flow', leap: 0.18 } },
    form: [
      { n: 'intro', bars: 4, prog: 'main' },
      { n: 'A', bars: 8, prog: 'main', theme: 'A', lead: 'koto' },
      { n: 'A2', bars: 8, prog: 'main', theme: 'A', lead: 'flute', vary: 0.3 },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'kalimba' },
      { n: 'A3', bars: 8, prog: 'alt', theme: 'A', lead: 'koto', vary: 0.2 },
      { n: 'break', bars: 4, prog: 'main' },
    ],
    section(p) { p.st.arp = pickR(p.rng, ARPS); },
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, calm = n === 'intro' || n === 'break';
      p.padChord(chord, t, p.barDur * 1.02, calm ? 0.6 : 0.45, 57);
      if (n !== 'intro') p.bassLine(chord, t, BASS_12, 38);
      const arpInst = sec.lead === 'koto' ? 'harp' : 'koto';
      p.arp(chord, t, p.st.arp, { inst: arpInst, ch: arpInst === 'koto' ? 'koto' : 'harp', lo: 55, vel: arpInst === 'koto' ? 0.3 : 0.42 });
      if (!calm) {
        for (let i = 0; i < 8; i++) p.hit('shaker', 'perc', p.pos(t, i * 2), i % 2 ? 0.32 : 0.2);
        if (b.i % 2 === 0) p.hit('pon', 'perc', t, 0.55);
        if (p.rng() < 0.35) p.hit('woodblock', 'perc', p.pos(t, 14), 0.3, 84);
      }
      if (b.i === 0 && n !== 'intro') p.hit('rin', 'bell', t, 0.5, 86);
      if (calm) p.sprinkle(t, 'glock', 'bell', 81, 93, 0.12, 0.35);
      if (b.mel) {
        const lead = sec.lead, ch = lead === 'kalimba' ? 'kal' : lead;
        p.melody(b.mel, t, lead, ch, 0.85);
        if (n === 'A3' && b.i >= 4) p.melody(b.mel, t, 'flute', 'flute', 0.4, { oct: 12 });
      }
    },
  },

  // Calm & sparse: slow harp, sparse koto phrases, shakuhachi in the B section, bell-cricket glints. A yo scale.
  village_night: {
    bpm: 62, swing: 0, key: 57, scale: [0, 2, 5, 7, 9], echo: 1.5, echoFb: 0.35, gain: 1.2,
    mix: {
      koto: { vol: 0.8, rev: 0.45, echo: 0.22, pan: -0.15 }, harp: { vol: 0.45, rev: 0.5, pan: 0.2 }, flute: { vol: 0.7, rev: 0.55, echo: 0.18 },
      pad: { vol: 0.6, rev: 0.6 }, bass: { vol: 0.6, rev: 0.1 }, bell: { vol: 0.45, rev: 0.7, echo: 0.3, pan: 0.3 }, perc: { vol: 0.4, rev: 0.4 },
    },
    progs: {
      A: [C(0, 'sus2'), C(5, 'M7'), C(9, 'm7'), C(7, 'sus4')],
      B: [C(2, 'm7'), C(5, 'M9'), C(0, 'sus2'), C(7, 's7sus4')],
    },
    themes: { A: { lo: 64, hi: 81, cells: 'sparse', ends: 'endSparse', leap: 0.1 }, B: { lo: 69, hi: 86, cells: 'sparse', ends: 'endSparse' } },
    form: [
      { n: 'intro', bars: 4, prog: 'A' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'koto' },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'flute' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'koto', vary: 0.3 },
      { n: 'rest', bars: 4, prog: 'B' },
    ],
    bar(p, b) {
      const { t, sec, chord } = b;
      p.padChord(chord, t, p.barDur * 1.05, 0.5, 55);
      p.bassLine(chord, t, [[0, 14, 0.45]], 40);
      p.arp(chord, t, p.rng() < 0.5 ? [0, -1, 2, -1, 3, -1, 2, -1] : [0, -1, -1, 2, -1, 4, -1, -1], { lo: 52, vel: 0.46 });
      // suzumushi (bell cricket) glints
      if (p.rng() < 0.4) { const tt = p.pos(t, ((p.rng() * 14) | 0) + 1); p.hit('glock', 'bell', tt, 0.22, 93); p.hit('glock', 'bell', tt + 0.09, 0.16, 93); }
      if (b.i === 0 && sec.n !== 'intro') p.hit('rin', 'bell', t, 0.4, 81);
      if (b.i % 4 === 2 && sec.n !== 'rest') p.hit('pon', 'perc', p.pos(t, 8), 0.35);
      if (b.mel) p.melody(b.mel, t, sec.lead, sec.lead, sec.lead === 'koto' ? 0.8 : 0.75);
    },
  },

  // Mysterious-but-cute: in-scale (D Eb G A Bb), tiptoe pizzicato bass, heartbeat pulse, kalimba melody with echo.
  dungeon: {
    bpm: 80, swing: 0.08, key: 62, scale: [0, 1, 5, 7, 8], echo: 0.75, echoFb: 0.38, gain: 1.0,
    mix: {
      kal: { vol: 0.75, rev: 0.45, echo: 0.28, pan: 0.12 }, koto: { vol: 0.75, rev: 0.45, echo: 0.2, pan: -0.15 }, pad: { vol: 0.6, rev: 0.6 },
      bass: { vol: 0.8, rev: 0.12 }, pulse: { vol: 0.8, rev: 0.1 }, perc: { vol: 0.6, rev: 0.4, pan: -0.2 }, bell: { vol: 0.7, rev: 0.8, echo: 0.35, pan: 0.3 },
    },
    progs: {
      A: [C(0, 'p5'), C(1, 'M7'), C(5, 'm'), C(0, 'sus4')],
      B: [C(5, 'm7'), C(1, 'M7'), C(5, 'm'), C(0, 'p5')],
    },
    themes: { A: { lo: 67, hi: 86, cells: 'flow', leap: 0.1 }, B: { lo: 57, hi: 74, cells: 'sparse', ends: 'endSparse' } },
    form: [
      { n: 'intro', bars: 4, prog: 'A' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'kalimba' },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'koto' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'kalimba', vary: 0.35 },
      { n: 'break', bars: 4, prog: 'B' },
    ],
    bar(p, b) {
      const { t, sec, chord } = b, calm = sec.n === 'intro' || sec.n === 'break';
      p.padChord(chord, t, p.barDur * 1.05, 0.6, 50, 'darkpad');
      p.hit('heartbeat', 'pulse', t, 0.55); p.hit('heartbeat', 'pulse', p.pos(t, 3), 0.35);
      if (!calm) {
        const r = p.key + chord.root, tip = [[0, 0], [2, 7], [4, 12], [6, 7], [8, 0], [10, 7], [12, 13], [14, 7]];
        for (const [p16, iv] of tip) if (p16 % 8 === 0 || p.rng() < 0.7) p.note('pizz', 'bass', p.pos(t, p16), fold(r, 38) + iv, p16 % 8 === 0 ? 0.6 : 0.4, p.s16 * 1.2);
        for (let i = 1; i < 8; i += 2) if (p.rng() < 0.55) p.hit('tick', 'perc', p.pos(t, i * 2), 0.35, 96);
      }
      if (p.rng() < (calm ? 0.7 : 0.3)) p.sprinkle(t, 'drip', 'bell', 79, 91, 0.1, 0.4);
      if (b.last && !calm) for (let i = 0; i < 4; i++) p.hit('shime', 'perc', p.pos(t, 12 + i), 0.15 + i * 0.06);
      if (b.mel) p.melody(b.mel, t, sec.lead, sec.lead === 'kalimba' ? 'kal' : 'koto', 0.8);
    },
  },

  // Energetic: taiko ensemble + tsugaru-style shamisen ostinato + synth bass, E minyo (minor pentatonic) scale.
  boss: {
    bpm: 144, swing: 0, key: 64, scale: [0, 3, 5, 7, 10], echo: 0.5, echoFb: 0.25, gain: 1.1,
    mix: {
      taiko: { vol: 0.9, rev: 0.18 }, shime: { vol: 0.75, rev: 0.1, pan: 0.2 }, kane: { vol: 0.85, rev: 0.2, pan: -0.25 }, sham: { vol: 1.0, rev: 0.18, echo: 0.08, pan: -0.1 },
      bass: { vol: 0.75, rev: 0.05 }, pad: { vol: 0.55, rev: 0.4 }, flute: { vol: 0.8, rev: 0.4, echo: 0.15, pan: 0.1 },
    },
    progs: { A: [C(0, 'm'), C(0, 'm'), C(8, 'M'), C(10, 'M')], B: [C(8, 'M'), C(10, 'M'), C(0, 'm'), C(0, 'sus4')], D: [C(0, 'p5')] },
    themes: { A: { lo: 71, hi: 88, cells: 'sparse', ends: 'endSparse', leap: 0.15 } },
    form: [
      { n: 'intro', bars: 2, prog: 'D' },
      { n: 'A', bars: 8, prog: 'A' },
      { n: 'B', bars: 8, prog: 'B', theme: 'A', lead: 'flute' },
      { n: 'drums', bars: 4, prog: 'D' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'flute', vary: 0.3 },
    ],
    section(p, sec) {
      if (!p.st.riff || sec.n === 'A') {
        // one-bar 16th ostinato in scale steps from the root: accents on the 3-3-2 grid
        const r = [];
        for (let i = 0; i < 16; i++) {
          const acc = [0, 3, 6, 8, 11, 14].includes(i);
          r.push(acc ? (p.rng() < 0.6 ? 0 : pickR(p.rng, [5, 3, 2])) : p.rng() < 0.55 ? pickR(p.rng, [1, 2, 3, 4, 5]) : null);
        }
        p.st.riff = r;
      }
    },
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, sn = scaleNotes(p.key, p.def.scale, 48, 88);
      // taiko
      const intro = n === 'intro', drums = n === 'drums';
      const don = intro ? [0, 8] : [0, 6, 8, 11];
      for (const i of don) p.hit('taiko', 'taiko', p.pos(t, i), i === 0 ? 1 : 0.7);
      if (!intro) { p.hit('ka', 'taiko', p.pos(t, 4), 0.6); p.hit('ka', 'taiko', p.pos(t, 12), 0.6); }
      for (let i = 0; i < 16; i++) {
        const v = intro ? 0.12 + (b.i * 16 + i) / 32 * 0.4 : i % 4 === 2 ? 0.45 : i % 2 ? 0.16 : 0.28;
        if (intro || drums || i % 2 === 0 || p.rng() < 0.5) p.hit('shime', 'shime', p.pos(t, i), v);
      }
      if (!intro) for (const i of [2, 6, 10, 14]) p.hit('kane', 'kane', p.pos(t, i), i === 14 ? 0.7 : 0.45);
      if (intro || drums) { if (drums && b.i % 2 === 1) for (const i of [0, 3, 6, 8, 10, 12]) p.note('shamisen', 'sham', p.pos(t, i), p.key + (i === 0 ? 0 : 12), 0.6, p.s16 * 2); return; }
      // bass: driving 8ths with octave pops
      for (let i = 0; i < 8; i++) p.note('synthbass', 'bass', p.pos(t, i * 2), fold(p.key + chord.root, 40) + (i % 4 === 3 ? 12 : 0), i % 2 ? 0.55 : 0.8, p.s16 * 1.6);
      p.padChord(chord, t, p.beat * 1.5, 0.6, 55);
      // shamisen riff, transposed diatonically to the chord root
      const base = sn.findIndex(m => m >= fold(p.key + chord.root, 48));
      const vel = n === 'B' || n === 'A2' ? 0.4 : 0.6;
      p.st.riff.forEach((d, i) => {
        if (d == null) return;
        let dd = d; if (b.i % 4 === 3 && i >= 12) dd = d + 2; // small fill at the end of each 4 bars
        const m = sn[clamp(base + dd, 0, sn.length - 1)];
        p.note('shamisen', 'sham', p.pos(t, i), m, vel * ([0, 3, 6, 8, 11, 14].includes(i) ? 1 : 0.7), p.s16 * 1.5);
      });
      if (b.mel) p.melody(b.mel, t, 'flute', 'flute', 0.85);
    },
  },

  // Bouncy & cheerful: marimba + kalimba over oom-pah pizzicato, swung shakers. F Ryukyu scale (Okinawan charm).
  shop: {
    bpm: 116, swing: 0.3, key: 65, scale: [0, 4, 5, 7, 11], echo: 0.75, echoFb: 0.22, gain: 0.8,
    mix: {
      mar: { vol: 0.85, rev: 0.25, echo: 0.1, pan: -0.1 }, kal: { vol: 0.7, rev: 0.3, echo: 0.15, pan: 0.2 }, bass: { vol: 0.8, rev: 0.05 },
      stab: { vol: 0.55, rev: 0.25, pan: 0.15 }, perc: { vol: 0.95, rev: 0.12, pan: -0.15 }, pad: { vol: 0.35, rev: 0.45 }, bell: { vol: 0.45, rev: 0.5, echo: 0.2 },
    },
    progs: { A: [C(0, 'M'), C(5, 'M'), C(0, 'M'), C(7, 'd7')], B: [C(5, 'M'), C(7, 'M'), C(4, 'm7'), C(9, 'm')], I: [C(0, 'M'), C(7, 'd7')] },
    themes: { A: { lo: 69, hi: 88, cells: 'busy', leap: 0.15 }, B: { lo: 65, hi: 84, cells: 'flow' } },
    form: [
      { n: 'intro', bars: 2, prog: 'I' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'marimba' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'kalimba', vary: 0.3 },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'marimba' },
      { n: 'A3', bars: 8, prog: 'A', theme: 'A', lead: 'marimba', vary: 0.25 },
    ],
    bar(p, b) {
      const { t, sec, chord } = b;
      // oom-pah
      p.bassLine(chord, t, [[0, 3, 0.85], [8, 3, 0.65, 7]], 40, 'pizz');
      if (p.rng() < 0.3) p.bassLine(chord, t, [[14, 2, 0.45, 5]], 40, 'pizz');
      for (const s of [4, 12]) for (const x of chord.iv.slice(0, 3)) p.note('marimba', 'stab', p.pos(t, s), fold(p.key + chord.root + x, 60), 0.32, 0.2);
      for (let i = 0; i < 8; i++) p.hit('shaker', 'perc', p.pos(t, i * 2), i % 2 ? 0.34 : 0.2);
      p.hit('kick', 'perc', t, 0.45); p.hit('kick', 'perc', p.pos(t, 8), 0.35);
      p.hit('snap', 'perc', p.pos(t, 4), 0.35); p.hit('snap', 'perc', p.pos(t, 12), 0.35);
      if (p.rng() < 0.3) p.hit('woodblock', 'perc', p.pos(t, 14), 0.35, 86);
      if (b.i === 0 && sec.n !== 'intro') p.padChord(chord, t, p.barDur * 2, 0.5, 60);
      if (b.last) p.hit('glock', 'bell', p.pos(t, 14), 0.35, p.key + 24);
      if (b.mel) {
        p.melody(b.mel, t, sec.lead, sec.lead === 'marimba' ? 'mar' : 'kal', 0.85, { legato: 0.6 });
        if (sec.n === 'A2') p.melody(b.mel, t, 'marimba', 'mar', 0.35, { oct: -12, legato: 0.6 });
      }
    },
  },

  // Title: wide & gentle. Rolling harp 16ths, flute melody, lush pad, soft taiko swells. G major pentatonic.
  title: {
    bpm: 70, swing: 0, key: 55, scale: [0, 2, 4, 7, 9], echo: 0.75, echoFb: 0.3, gain: 0.8,
    mix: {
      harp: { vol: 0.55, rev: 0.45, pan: 0.2 }, flute: { vol: 0.8, rev: 0.5, echo: 0.15 }, koto: { vol: 0.8, rev: 0.4, echo: 0.16, pan: -0.15 },
      pad: { vol: 0.65, rev: 0.6 }, bass: { vol: 0.65, rev: 0.1 }, taiko: { vol: 0.5, rev: 0.5 }, bell: { vol: 0.45, rev: 0.7, echo: 0.25, pan: -0.25 },
    },
    progs: {
      I: [C(0, 'M9'), C(5, 'M9')],
      A: [C(5, 'M7'), C(7, 'M'), C(4, 'm7'), C(9, 'm7')],
      B: [C(2, 'm7'), C(7, 's7sus4'), C(0, 'M9'), C(9, 'm7')],
    },
    themes: { A: { lo: 67, hi: 86, cells: 'flow', leap: 0.12 }, B: { lo: 67, hi: 84, cells: 'flow' } },
    form: [
      { n: 'intro', bars: 4, prog: 'I' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'flute' },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'koto' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'flute', vary: 0.25 },
      { n: 'break', bars: 4, prog: 'I' },
    ],
    section(p) { p.st.arp = pickR(p.rng, [[0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 2, 3], [0, 2, 4, 6, 7, 5, 3, 1, 0, 2, 4, 6, 7, 6, 4, 2]]); },
    bar(p, b) {
      const { t, sec, chord } = b, calm = sec.n === 'intro' || sec.n === 'break';
      p.padChord(chord, t, p.barDur * 1.05, calm ? 0.7 : 0.55, 55);
      p.bassLine(chord, t, [[0, 12, 0.45], [12, 4, 0.32, 7]], 43);
      p.arp(chord, t, p.st.arp, { lo: 55, vel: 0.45, step: 1, len: 4 });
      if (b.i === 0) p.hit('taiko', 'taiko', t, 0.45);
      if (calm) p.sprinkle(t, 'chime', 'bell', 84, 96, 0.14, 0.5);
      if (b.i === 0 && !calm) p.hit('rin', 'bell', t, 0.5, 91);
      if (b.mel) {
        p.melody(b.mel, t, sec.lead, sec.lead, 0.85);
        if (sec.n === 'B' && b.i % 2 === 0) p.note('flute', 'flute', t, fold(p.key + chord.root + chord.iv[1], 67), 0.35, p.barDur * 1.8);
      }
    },
  },
};

export const TRACK_NAMES = Object.keys(TRACKS);
