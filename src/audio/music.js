// Generative music. Each track is a small "band": a form (intro / A / B / break sections), chord progressions,
// themes that are generated as 8-bar periods (antecedent + consequent built from a 2-bar motif), re-voiced with
// variations when they recur, and regenerated every few cycles so the music keeps evolving without losing identity.
// A theme can also be written by hand (themes.X.fixed = tune('F#5/1 A5/1 …')): it recurs note for note (with a few
// grace notes when the section sets `vary`) — the village's signature song and the biome intros use that.
// A MusicPlayer schedules one bar at a time against the audio clock; scheduleUntil(t) is deterministic for a
// given seed, which lets the render check drive it synchronously inside an OfflineAudioContext.
//
// Intensity: a player has an intensity level (0..def.maxIntensity) that track bar() functions read as p.intensity to
// add layers (combat drive in the Burrow themes, phase-2 / enrage layers in boss tracks). Changes land on the next bar
// line (b.rise marks the first bar of a higher level) and may lift the tempo (def.tempoUp[level]).
// Stings (STINGS) are one-shot cues on the music bus: def.play(p, t) schedules everything at once.
import { mulberry32, clamp } from './core.js';
import { INST } from './instruments.js';

// ------------------------------------------------------------------------------------------ theory helpers
const IV = {
  M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], d7: [0, 4, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], M9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], s7sus4: [0, 5, 7, 10], p5: [0, 7, 12], M6: [0, 4, 7, 9],
  M7s11: [0, 4, 7, 11, 18], sus4b9: [0, 5, 7, 13], m7b5: [0, 3, 6, 10],
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

// Hand-written melodies: bars split by '|', notes "NAME[#|b]OCTAVE/len" (len in eighth notes, C4 = midi 60),
// "r/len" = rest. → the same bar format genPeriod makes ([{ pos, len, m }] per bar).
const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function tune(str) {
  return str.split('|').map(bar => {
    let pos = 0; const out = [];
    for (const tok of bar.trim().split(/\s+/)) {
      if (!tok) continue;
      const [nm, l] = tok.split('/'), len = +l || 1;
      if (nm !== 'r') {
        const x = /^([A-G])([#b]?)(-?\d)$/.exec(nm);
        if (!x) throw new Error('[audio] bad note ' + tok);
        out.push({ pos, len, m: 12 * (+x[3] + 1) + NOTE_PC[x[1]] + (x[2] === '#' ? 1 : x[2] === 'b' ? -1 : 0) });
      }
      pos += len;
    }
    return out;
  });
}
// A written theme recurring: same notes, a few grace-note ornaments (never on a phrase's last note).
function ornament(rng, bars, amt, notes) {
  return bars.map((bar, b) => bar.map((n, j) => {
    const i = notes.indexOf(n.m), last = b % 4 === 3 && j === bar.length - 1;
    return { ...n, grace: !last && n.len >= 2 && rng() < amt, g: i >= 0 && i < notes.length - 1 ? notes[i + 1] : n.m + 2 };
  }));
}
// A second voice `steps` diatonic (major-scale) steps away — parallel thirds (-2) under a written tune.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
function harmonize(bar, key, steps) {
  return bar.map(n => {
    const sc = scaleNotes(key, MAJOR, n.m - 14, n.m + 14), i = sc.indexOf(n.m);
    return { pos: n.pos, len: n.len, m: i >= 0 ? sc[clamp(i + steps, 0, sc.length - 1)] : n.m - 5 };
  });
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
  // name: a TRACKS / STINGS key (or a track def object). intensity: starting intensity level.
  constructor(graph, name, { seed, start, intensity = 0 } = {}) {
    const def = typeof name === 'string' ? TRACKS[name] || STINGS[name] : name;
    if (!def) throw new Error('[audio] unknown track ' + name);
    const c = (this.ctx = graph.ctx);
    this.graph = graph; this.def = def; this.name = typeof name === 'string' ? name : def.name || 'custom';
    this.rng = mulberry32(seed ?? ((Math.random() * 2 ** 31) | 0));
    this.key = def.key; this.tempo = 1; this.beat = 60 / def.bpm; this.s16 = this.beat / 4; this.barDur = this.beat * 4; this.swing = def.swing || 0;
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(graph.musicIn);
    this.revOut = c.createGain(); this.revOut.gain.value = 0; this.revOut.connect(graph.musicRev);
    // tempo-synced, darkened echo
    this.echoIn = c.createGain();
    const dl = (this.dl = c.createDelay(3)); dl.delayTime.value = this.beat * (def.echo ?? 0.75);
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
    this.nextBar = def.play ? null : start ?? c.currentTime + 0.1; // stings have no bar clock
    this.bars = 0; this.si = -1; this.sb = 0; this.cycle = 0; this.sec = null; this.themes = {}; this.st = {};
    this.stopAt = Infinity; this.disposed = false;
    this.intensity = this.wantIntensity = 0; this.rise = 0;
    if (intensity) { this.setIntensity(intensity); this.intensity = this.wantIntensity; this.setTempo(def.tempoUp?.[this.intensity] ?? 1); }
  }
  // ---- intensity / tempo (applied on the next bar line)
  setIntensity(n) { this.wantIntensity = clamp(Math.round(n) || 0, 0, this.def.maxIntensity ?? 1); }
  setTempo(mul) {
    if (mul === this.tempo) return;
    this.tempo = mul; this.beat = 60 / (this.def.bpm * mul); this.s16 = this.beat / 4; this.barDur = this.beat * 4;
    this.dl.delayTime.setTargetAtTime(this.beat * (this.def.echo ?? 0.75), this.ctx.currentTime, 0.3);
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
  // 16-step drum pattern: 'X' accent, 'x' normal, 'o' ghost, '.' rest. prob thins non-accented hits.
  pat(t, str, inst, ch, vel = 1, m = 0, prob = 1) {
    for (let i = 0; i < str.length && i < 16; i++) {
      const c = str[i], v = c === 'X' ? 1 : c === 'x' ? 0.7 : c === 'o' ? 0.36 : 0;
      if (v && (c === 'X' || prob >= 1 || this.rng() < prob)) this.hit(inst, ch, this.pos(t, i), vel * v, m);
    }
  }
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
      if (n.grace && !SUSTAINED.has(inst)) this.note(inst, ch, tt - 0.055, (n.g ?? n.m + 2) + oct, v * 0.55, 0.05);
      const o = inst === 'koto' && n.len >= 4 && this.rng() < 0.45 ? { yuri: true } : inst === 'shakuhachi' && n.len >= 3 && this.rng() < 0.5 ? { puff: true } : undefined;
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
    if (!th.notes) th.notes = scaleNotes(this.key, th.scale || this.def.scale, th.lo ?? 48, th.hi ?? 96);
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
      if (th.fixed) this.secMel = this.themes[sec.theme] = sec.vary ? ornament(this.rng, th.fixed, sec.vary, th.notes) : th.fixed; // written
      else if (!base) this.secMel = this.themes[sec.theme] = genPeriod(this.rng, th, this.key, chordAt);
      else this.secMel = vary(this.rng, base, sec.vary ?? 0.25, th, this.key, chordAt);
    }
    def.section?.(this, sec);
  }
  _bar(t) {
    this.rise = 0;
    if (this.wantIntensity !== this.intensity) {
      if (this.wantIntensity > this.intensity) this.rise = this.wantIntensity;
      this.intensity = this.wantIntensity;
      this.setTempo(this.def.tempoUp?.[this.intensity] ?? 1);
    }
    if (!this.sec || this.sb >= this.sec.bars) this._nextSection();
    const sec = this.sec, prog = this.def.progs[sec.prog];
    const info = { t, sec, i: this.sb, n: this.bars, chord: prog[this.sb % prog.length], next: prog[(this.sb + 1) % prog.length],
      mel: this.secMel ? this.secMel[this.sb % this.secMel.length] : null, last: this.sb === sec.bars - 1, rise: this.rise };
    this.def.bar(this, info);
    this.sb++; this.bars++;
  }
  scheduleUntil(until) {
    if (this.disposed || this.nextBar == null) return;
    let guard = 0;
    while (this.nextBar < until && guard++ < 8) { this._bar(this.nextBar); this.nextBar += this.barDur; }
  }
  resync(now) { if (this.nextBar != null) this.nextBar = now + 0.08; }
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
// breathy / bowed instruments get no grace notes
const SUSTAINED = new Set(['flute', 'shakuhachi', 'glass', 'ooh', 'brass']);

// ------------------------------------------------------------------------------------------ boss engine
// cfg: bpm, key, scale, kit ('taiko' | 'kitchen'), riff (instrument of the 16th ostinato), lead [B-section, A2-section]
// instruments, counter (counter-lead instrument), pad, progs {A, B, D}, gain, gong (midi), lo/hi (theme range),
// extra(p, b, intensity) for flavour hits. Optional: riffOct (semitones added to the riff, for voices that speak
// higher, e.g. bamboo tubes), leadVol (lead channel level, default 0.82).
// Intensity 1 (boss under 66% / first summon): every 16th on the shime (or spoon), off-beat accents, bass octave
// pops on every off-beat, a counter-lead an octave above the melody (or answering the riff in the A section).
// Intensity 2 (enraged): +6% tempo, double-time taiko, kane / pan 8ths, an extra pad stab, the lead doubled an
// octave down, a riser into every 4th bar. The first bar of a higher level lands on a gong + taiko hit.
const RIFF_ACC = [0, 3, 6, 8, 11, 14];
const MINOR_PROG = { A: [C(0, 'm'), C(0, 'm'), C(8, 'M'), C(10, 'M')], B: [C(8, 'M'), C(10, 'M'), C(0, 'm'), C(0, 'sus4')], D: [C(0, 'p5')] };
const IN_PROG = { A: [C(0, 'p5'), C(1, 'M7'), C(5, 'm'), C(0, 'sus4')], B: [C(5, 'm7'), C(1, 'M7'), C(5, 'm'), C(0, 'p5')], D: [C(0, 'p5')] };
function bossTrack(cfg) {
  return {
    boss: true, maxIntensity: 2, tempoUp: [1, 1, 1.06], cfg,
    bpm: cfg.bpm, swing: 0, key: cfg.key, scale: cfg.scale, echo: 0.5, echoFb: 0.25, gain: cfg.gain ?? 1.1,
    mix: {
      taiko: { vol: 0.9, rev: 0.18 }, shime: { vol: 0.72, rev: 0.1, pan: 0.2 }, kane: { vol: 0.8, rev: 0.2, pan: -0.25 },
      riff: { vol: cfg.riffVol ?? 1, rev: 0.18, echo: 0.08, pan: -0.1 }, bass: { vol: 0.75, rev: 0.05 }, pad: { vol: 0.55, rev: 0.4 },
      lead: { vol: cfg.leadVol ?? 0.82, rev: 0.4, echo: 0.15, pan: 0.1 }, lead2: { vol: 0.5, rev: 0.45, echo: 0.2, pan: -0.22 },
      fx: { vol: 0.6, rev: 0.45, echo: 0.15, pan: 0.25 }, drive: { vol: 0.58, rev: 0.12, pan: -0.05 },
    },
    progs: cfg.progs,
    themes: { A: { lo: cfg.lo ?? 71, hi: cfg.hi ?? 88, cells: 'sparse', ends: 'endSparse', leap: 0.15 } },
    form: [
      { n: 'intro', bars: 2, prog: 'D' },
      { n: 'A', bars: 8, prog: 'A' },
      { n: 'B', bars: 8, prog: 'B', theme: 'A', lead: 0 },
      { n: 'drums', bars: 4, prog: 'D' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 1, vary: 0.3 },
    ],
    section(p, sec) {
      if (!p.st.riff || sec.n === 'A') {
        // one-bar 16th ostinato in scale steps from the root: accents on the 3-3-2 grid
        const r = [];
        for (let i = 0; i < 16; i++) {
          const acc = RIFF_ACC.includes(i);
          r.push(acc ? (p.rng() < 0.6 ? 0 : pickR(p.rng, [5, 3, 2])) : p.rng() < 0.55 ? pickR(p.rng, [1, 2, 3, 4, 5]) : null);
        }
        p.st.riff = r;
      }
    },
    bar(p, b) { bossBar(p, b, cfg); },
  };
}
function bossBar(p, b, cfg) {
  const { t, sec, chord } = b, n = sec.n, I = p.intensity, intro = n === 'intro', drums = n === 'drums', kitchen = cfg.kit === 'kitchen';
  const sn = (p.st.sn ||= scaleNotes(p.key, p.def.scale, 45, 91)), root = p.key + chord.root;
  if (b.rise) { p.hit('gong', 'fx', t, b.rise > 1 ? 1 : 0.75, cfg.gong ?? p.key - 24); p.hit('taiko', 'taiko', t + 0.035, 0.85); }
  // ---- drums
  if (kitchen) {
    p.hit('taiko', 'taiko', t, intro ? 0.8 : 0.65);
    p.pat(t, intro ? 'X.......X.......' : 'X..x..x.X..x..x.', 'pot', 'taiko', 0.95);
    if (!intro) p.pat(t, '....X.......X...', 'pan', 'shime', 0.8, 76);
    p.pat(t, I ? 'xoxoxoxoxoxoxoxo' : 'x.x.x.x.x.x.x.x.', 'spoon', 'shime', intro ? 0.4 + b.i * 0.3 : 0.62);
    if (!intro && b.i % 4 === 0) p.hit('lid', 'kane', t, 0.9);
    if (!intro) p.pat(t, '..x...x...x...X.', 'pan', 'kane', 0.32, 88);
  } else {
    const don = intro ? [0, 8] : [0, 6, 8, 11];
    for (const i of don) p.hit('taiko', 'taiko', p.pos(t, i), i === 0 ? 1 : 0.7);
    if (!intro) { p.hit('ka', 'taiko', p.pos(t, 4), 0.6); p.hit('ka', 'taiko', p.pos(t, 12), 0.6); }
    for (let i = 0; i < 16; i++) {
      const v = intro ? 0.12 + (b.i * 16 + i) / 32 * 0.4 : i % 4 === 2 ? 0.45 : i % 2 ? 0.16 : 0.28;
      if (intro || drums || I || i % 2 === 0 || p.rng() < 0.5) p.hit('shime', 'shime', p.pos(t, i), v);
    }
    if (!intro) for (const i of [2, 6, 10, 14]) p.hit('kane', 'kane', p.pos(t, i), i === 14 ? 0.7 : 0.45);
  }
  if (!intro && I >= 1) p.pat(t, '...o...o...o..oo', kitchen ? 'spoon' : 'ka', 'drive', 0.5);
  if (!intro && I >= 2) {
    p.pat(t, 'X.x.x.x.X.x.x.xx', 'taiko', 'drive', 0.5);
    p.pat(t, 'x.x.x.x.x.x.x.x.', kitchen ? 'pan' : 'kane', 'drive', 0.26, kitchen ? 91 : 0);
    if (b.i % 4 === 3) p.note('riser', 'fx', p.pos(t, 8), 0, 0.8, p.beat * 2);
  }
  cfg.extra?.(p, b, I);
  if (intro || drums) {
    if (drums && b.i % 2 === 1) for (const i of [0, 3, 6, 8, 10, 12]) p.note(cfg.riff, 'riff', p.pos(t, i), p.key + (i === 0 ? 0 : 12) + (cfg.riffOct || 0), 0.6, p.s16 * 2);
    return;
  }
  // ---- bass: driving 8ths with octave pops (every off-beat once the fight heats up)
  for (let i = 0; i < 8; i++) p.note('synthbass', 'bass', p.pos(t, i * 2), fold(root, 40) + ((I ? i % 2 === 1 : i % 4 === 3) ? 12 : 0), i % 2 ? 0.55 : 0.8, p.s16 * 1.6);
  p.padChord(chord, t, p.beat * 1.5, 0.6, 55, cfg.pad || 'pad');
  if (I >= 2) for (const at of [6, 14]) for (const x of chord.iv.slice(0, 3)) p.note('marimba', 'drive', p.pos(t, at), fold(root + x, 64), 0.4, 0.2); // off-beat stabs
  // ---- riff, transposed diatonically to the chord root
  const base = sn.findIndex(m => m >= fold(root, 48)), vel = n === 'B' || n === 'A2' ? 0.4 : 0.6;
  p.st.riff.forEach((d, i) => {
    if (d == null) return;
    const dd = b.i % 4 === 3 && i >= 12 ? d + 2 : d; // small fill at the end of each 4 bars
    p.note(cfg.riff, 'riff', p.pos(t, i), sn[clamp(base + dd, 0, sn.length - 1)] + (cfg.riffOct || 0), vel * (RIFF_ACC.includes(i) ? 1 : 0.7), p.s16 * 1.5);
  });
  // ---- melody + counter-lead
  const lead = cfg.lead[sec.lead ?? 0] || cfg.lead[0], counter = cfg.counter || 'koto';
  if (b.mel) {
    p.melody(b.mel, t, lead, 'lead', 0.85);
    if (I >= 1) p.melody(b.mel, t, counter, 'lead2', 0.42, { oct: 12, legato: 0.6 });
    if (I >= 2) p.melody(b.mel, t, 'harp', 'lead2', 0.55, { oct: -12 }); // plucked doubling underneath (cheap KS buffer)
  } else if (I >= 1) { // the A section has no theme: the counter-instrument answers the riff on the 3-3-2 accents
    const lad = p.ladder(chord, 72, 6);
    for (const [i, k] of [[0, 2], [3, 1], [6, 0], [8, 3], [11, 2], [14, 1]]) p.note(counter, 'lead2', p.pos(t, i), lad[k], I >= 2 ? 0.55 : 0.45, p.s16 * 2);
  }
}
function mochiExtra(p, b, I) {
  if (b.sec.n === 'intro') return;
  p.pat(b.t, I ? '..x...x...x...x.' : '......x.......x.', 'boing', 'fx', 0.65, p.key + 12 + b.chord.root);
}
function kitchenExtra(p, b, I) {
  const { t, chord, sec } = b;
  if (sec.n === 'intro') return;
  if (b.i % 2 === 0) for (const at of I ? [0, 6] : [0]) p.padChord(chord, p.pos(t, at), p.beat * 0.45, 0.5, 57, 'brass', 'fx');
  if (p.rng() < 0.4) { const at = (p.rng() * 12) | 0; for (let i = 0; i < 3; i++) p.hit('bubble', 'fx', p.pos(t, at + i), 0.45 - i * 0.1, p.key + 12 + pickR(p.rng, [0, 3, 7])); }
  if (b.last) p.note('slide', 'fx', p.pos(t, 12), p.key + 24, 0.8, p.beat * 0.9, { down: sec.n === 'drums' });
}
function moonExtra(p, b, I) {
  const { t, sec } = b;
  if (b.i === 0 && sec.n !== 'intro' && !b.rise) p.hit('gong', 'fx', t, 0.5, 38);
  if (p.rng() < 0.5 + 0.2 * I) p.note('glass', 'fx', p.pos(t, ((p.rng() * 14) | 0) + 1), pickR(p.rng, scaleNotes(p.key, p.def.scale, 86, 98)), 0.4, p.beat);
}

// "Blossom Hollow" — the village's signature song, hand-written in D major pentatonic (do = D; solfège below).
// A (main theme, 8 bars, a question and its answer over IV–Vsus–vi–ii | IV–ii–Vsus–I):
//   mi sol la~ sol mi | re~ mi re do~~ | la, do re~ do la, | sol,~ la,~ do~~ |
//   mi sol la~ sol mi | re~ mi sol la~ sol~ | mi~~ re do~ la,~ | do~~ · do re →
// B (bridge, 8 bars, bouncier and lower, vi–iii–IV–I | vi–iii–ii–Vsus back into A).
const VILLAGE_A = tune(`F#5/1 A5/1 B5/3 A5/1 F#5/2 | E5/2 F#5/1 E5/1 D5/4 | B4/1 D5/1 E5/3 D5/1 B4/2 | A4/2 B4/2 D5/4 |
  F#5/1 A5/1 B5/3 A5/1 F#5/2 | E5/2 F#5/1 A5/1 B5/2 A5/2 | F#5/3 E5/1 D5/2 B4/2 | D5/4 r/2 D5/1 E5/1`);
const VILLAGE_B = tune(`D5/1 B4/1 D5/1 E5/1 F#5/2 E5/2 | E5/1 C#5/1 B4/2 A4/4 | B4/1 D5/1 E5/1 F#5/1 A5/2 F#5/2 | E5/2 F#5/1 E5/1 D5/4 |
  D5/1 B4/1 D5/1 E5/1 F#5/2 A5/2 | A5/3 F#5/1 E5/4 | D5/1 E5/1 F#5/2 E5/2 D5/2 | B4/2 A4/3 r/1 D5/1 E5/1`);
const BASS_BOUNCE = [[0, 3, 0.8], [6, 2, 0.5, 7], [8, 3, 0.7, 12], [12, 2, 0.5, 7]];
const FILLS = [[3, 2, 1], [1, 2, 3], [2, 3, 4], [4, 3, 2]];

// ------------------------------------------------------------------------------------------ regions (docs/REGIONS.md)
// The four outdoor regions. Each theme has a hand-written main tune (it recurs note for note, so it sticks), generative
// sections around it that regrow every loop, a combat drive layer (intensity 1, like the Burrow themes) and its own
// flavour of the boss engine.
//
// "Morning in the Bamboo" (Whispering Bamboo Grove): E yo scale (E F# A B C#) on the shakuhachi. The hook is a rising
// call, ti-do-mi~ (B C# E), answered by a falling line; the second half climbs to the high B and comes home.
const BAMBOO_A = tune(`B4/3 C#5/1 E5/4 | F#5/2 E5/1 C#5/1 B4/2 A4/2 | A4/2 B4/1 C#5/1 E5/2 C#5/2 | B4/6 r/2 |
  B4/3 C#5/1 E5/4 | F#5/2 A5/2 B5/3 A5/1 | F#5/3 E5/1 C#5/2 B4/2 | E5/6 r/2`);
// "Momiji Hollow": Bb major pentatonic, swung like a bon-odori. The hook, la do' la sol mi (G Bb G F D), opens both
// phrases; the answer climbs to the high C and settles on a folk cadence (re~ mi do~).
const MAPLE_A = tune(`G5/2 Bb5/1 G5/1 F5/2 D5/2 | F5/3 G5/1 F5/2 C5/2 | D5/2 F5/1 G5/1 F5/1 D5/1 C5/2 | D5/6 r/2 |
  G5/2 Bb5/1 G5/1 F5/2 D5/2 | F5/2 G5/1 Bb5/1 C6/4 | Bb5/2 G5/1 F5/1 G5/2 F5/1 D5/1 | C5/3 D5/1 Bb4/4`);
const MAPLE_FEST = tune('G5/1 Bb5/1 C6/1 Bb5/1 G5/1 F5/1 G5/2 | Bb5/1 C6/1 D6/1 C6/1 Bb5/2 r/1 F5/1'); // festival flute call back into A
// "Shiokaze" (Tidepools): A major, a lilting calypso. The hook skips mi-sol-do' with a hiccup of a rest, the third bar
// rolls up on a 3+3+2 tresillo, and the answer reaches the high C# before stepping home.
const TIDE_A = tune(`C#5/1 E5/1 A5/2 r/1 F#5/1 E5/2 | F#5/1 A5/1 B5/2 A5/1 F#5/1 D5/2 | D5/3 E5/3 F#5/2 | E5/3 C#5/1 B4/4 |
  C#5/1 E5/1 A5/2 r/1 F#5/1 E5/2 | F#5/1 A5/1 C#6/2 B5/1 A5/1 F#5/2 | E5/3 F#5/3 D5/2 | C#5/3 B4/1 A4/4`);
// "Yukimi" (Onsen): an Eb lullaby for a music box. mi sol ti~ la | sol~ mi~, a sigh down to the tonic, a high turn
// (ti do' ti sol~) and a plagal "amen" (IV → I) to close.
const ONSEN_A = tune(`G5/2 Bb5/2 D6/3 C6/1 | Bb5/4 G5/4 | C6/2 Bb5/1 G5/1 Eb5/4 | F5/6 r/2 |
  G5/2 Bb5/2 D6/3 C6/1 | D6/2 Eb6/1 D6/1 Bb5/4 | C6/2 Bb5/2 G5/2 F5/2 | Eb5/6 r/2`);
// 16th-note arpeggio shapes (ladder indices, -1 = rest) for the regions' harp / kalimba accompaniment.
const REGION_ARPS = [[0, 2, 4, 2, 1, 3, 5, 3], [0, -1, 2, 4, -1, 3, -1, 5], [0, 1, 2, 4, 3, 2, 1, -1], [0, 2, 1, 3, 2, 4, 3, 5]];
// A soft counter-line note under a written tune: the chord's colour tone (sus2's 2nd, add9's / m7's 3rd, 7sus4's 4th).
const colour = (p, chord, lo) => fold(p.key + chord.root + chord.iv[1], lo);
// An answer in the gaps: when a bar of the tune ends on a note struck by beat 3, `inst` fills beats 3-4 (p.st.fill).
function answer(p, b, inst, ch, lo, vel = 0.4) {
  const last = b.mel && b.mel[b.mel.length - 1];
  if (!last || last.pos > 4 || last.pos + last.len < 6) return;
  const lad = p.ladder(b.chord, lo, 6);
  p.st.fill.forEach((k, i) => p.note(inst, ch, p.pos(b.t, 10 + i * 2), lad[k], vel - i * 0.05, 0.3));
}

// Region bosses. Master Tengu (Bamboo Grove): F# hirajoshi, a kokiriko ostinato on tuned bamboo tubes, fue (with the
// Noh flute's piercing hishigi on every entrance) and shakuhachi leads, gusts off his feather fan, kotsuzumi calls.
const HIRA_PROG = { A: [C(0, 'm'), C(0, 'm'), C(8, 'M7'), C(7, 'sus4')], B: [C(8, 'M7'), C(7, 'sus4'), C(0, 'madd9'), C(0, 'm')], D: [C(0, 'p5')] };
function tenguExtra(p, b, I) {
  const { t, sec } = b, n = sec.n;
  if (n === 'intro') {
    if (b.i === 0) { p.note('gust', 'fx', t, 88, 0.9, p.barDur * 1.5); p.note('fue', 'fx', p.pos(t, 8), p.key + 36, 0.7, p.beat * 2, { hishigi: true }); }
    return;
  }
  if (b.rise || (b.i === 0 && (n === 'B' || n === 'A2'))) p.note('fue', 'fx', p.pos(t, b.rise ? 2 : 0), p.key + 36, 0.62, p.beat * 1.5, { hishigi: true });
  if (b.i % 4 === 2 || (I >= 2 && b.i % 2 === 0)) p.note('gust', 'fx', p.pos(t, 4), 84 + ((p.rng() * 8) | 0), 0.45 + 0.15 * I, p.barDur * 0.8);
  p.pat(t, I ? '..o...x...o..x.x' : '......x.......x.', 'pon', 'fx', 0.45);
}
// Danzaburo the Leaf-Shifter (Momiji Hollow): a shuffling D minyo matsuri. Tsugaru shamisen ostinato, the tanuki's
// belly drum ("pon-poko", busier with every phase), fue and koto leads, a puff of magic leaves ("doron!") whenever he
// changes shape, and the teakettle (Bunbuku chagama) whistling at the end of the drum break.
const TANUKI_PROG = { A: [C(0, 'm'), C(10, 'M'), C(3, 'M'), C(7, 'm7')], B: [C(3, 'M'), C(10, 'M'), C(0, 'm'), C(0, 'sus4')], D: [C(0, 'p5')] };
const PONPOKO = ['X.......X...x.x.', 'X...x.x.X...x.x.', 'X..xX...X..xX.x.', 'X..xX.x.X..xX.xx']; // intro, calm, phase 2, enraged
function tanukiExtra(p, b, I) {
  const { t, sec } = b, n = sec.n, pat = PONPOKO[n === 'intro' ? 0 : I + 1];
  for (let i = 0; i < 16; i++) { const c = pat[i]; if (c !== '.') p.hit('belly', 'taiko', p.pos(t, i), c === 'X' ? (i ? 0.55 : 0.42) : c === 'x' ? 0.4 : 0.26, c === 'X' ? 45 : 50); }
  if (b.rise || (b.i === 0 && n === 'A2')) {
    p.note('gust', 'fx', t, 92, 0.55, p.beat * 1.2);
    [0, 3, 7, 12, 15].forEach((x, j) => p.note('glock', 'fx', p.pos(t, j), p.key + 24 + x, 0.5 - j * 0.05, 0.4));
  }
  if (n === 'drums' && b.last) p.note('slide', 'fx', p.pos(t, 8), p.key + 24, 0.7, p.beat * 1.6);
}
// Umibozu (Shiokaze Tidepools): the sea rises. A minor hexatonic, a staccato pizzicato ostinato (a storm of cellos),
// odaiko booms, surging swells, the monk's "ooh" choir, brass calls in B, shakuhachi (a komuso's flute) in A2, steel-pan
// glints above, bubbles.
const SEA_PROG = { A: [C(0, 'm'), C(0, 'm'), C(10, 'M'), C(8, 'M7')], B: [C(8, 'M7'), C(10, 'M'), C(0, 'm'), C(7, 'sus4')], D: [C(0, 'p5')] };
function umiExtra(p, b, I) {
  const { t, sec } = b, n = sec.n;
  if (n === 'intro') { if (b.i === 0) p.note('surge', 'fx', t, 0, 0.8, p.barDur * 1.8); p.hit('odaiko', 'taiko', p.pos(t, b.i ? 8 : 0), 0.6); return; }
  if (b.i % 2 === 0) p.hit('odaiko', 'taiko', t, 0.5);
  if (I >= 1 && b.i % 2 === 1) p.hit('odaiko', 'taiko', p.pos(t, 10), 0.38);
  if (n === 'B' && b.mel) p.melody(b.mel, t, 'brass', 'lead', 0.55, { oct: -12 });
  if (b.i % 4 === 0 || (I >= 2 && b.i % 2 === 0)) p.note('surge', 'fx', p.pos(t, 2), 0, 0.5 + 0.15 * I, p.barDur * (I >= 2 ? 0.9 : 1.6));
  if (p.rng() < 0.35) { const at = (p.rng() * 12) | 0; for (let i = 0; i < 3; i++) p.hit('bubble', 'fx', p.pos(t, at + i), 0.38 - i * 0.1, p.key + 12 + pickR(p.rng, [0, 3, 7])); }
}
// Yuki-onna, the Frost Princess (Yukimi Onsen): Eb in-scale (the ghost scale), an icicle-metallophone ostinato,
// glass-harmonica and koto leads over a music-box counter-line (the inn's music box, gone cold), a steam pad, blizzard
// swirls and ice-bell glints; enraged, the whiteout howls every other bar.
const YUKI_PROG = { A: [C(0, 'p5'), C(5, 'm'), C(1, 'M7'), C(0, 'sus4')], B: [C(1, 'M7'), C(0, 'sus4'), C(5, 'm7'), C(7, 'sus4b9')], D: [C(0, 'p5')] };
function yukiExtra(p, b, I) {
  const { t, sec } = b, n = sec.n;
  if (n === 'intro') { if (b.i === 0) p.note('blizzard', 'fx', t, 0, 0.8, p.barDur * 1.8); }
  else if (b.i % 4 === 0 || (I >= 2 && b.i % 2 === 0)) p.note('blizzard', 'fx', p.pos(t, 4), 0, 0.5 + 0.2 * I, p.barDur * (I >= 2 ? 1.1 : 0.9));
  if (p.rng() < 0.45 + 0.2 * I) p.hit('icebell', 'fx', p.pos(t, ((p.rng() * 14) | 0) + 1), 0.4, pickR(p.rng, (p.st.ice ||= scaleNotes(p.key, p.def.scale, 86, 99))));
}

export const TRACKS = {
  // The village by day: "Blossom Hollow" (see above). Koto states the theme, the flute sings it back, marimba takes
  // the bridge, koto (a few grace notes) + flute + kalimba thirds bring it home; then a C section improvises a new kalimba
  // tune every loop (generative period) before a short music-box break. Around the written tunes everything stays
  // generative: harp/koto arpeggios, kalimba answers in the long notes, percussion, bells.
  village_day: {
    bpm: 92, swing: 0.12, key: 62, scale: [0, 2, 4, 7, 9], echo: 0.75, gain: 1.3,
    mix: {
      koto: { vol: 0.85, rev: 0.3, echo: 0.14, pan: -0.12 }, harp: { vol: 0.5, rev: 0.35, pan: 0.25 }, flute: { vol: 0.75, rev: 0.45, echo: 0.12, pan: 0.05 },
      kal: { vol: 0.7, rev: 0.35, echo: 0.18, pan: 0.15 }, mar: { vol: 0.6, rev: 0.3, echo: 0.1, pan: -0.05 }, harm: { vol: 0.55, rev: 0.4, echo: 0.1, pan: 0.28 },
      pad: { vol: 0.55, rev: 0.5 }, bass: { vol: 0.7, rev: 0.06 },
      perc: { vol: 0.9, rev: 0.15, pan: 0.18 }, bell: { vol: 0.5, rev: 0.6, echo: 0.2, pan: -0.25 },
    },
    progs: {
      I: [C(7, 'sus4'), C(0, 'add9')],
      A: [C(5, 'M7'), C(7, 'sus4'), C(9, 'm7'), C(2, 'm7'), C(5, 'M7'), C(2, 'm7'), C(7, 'sus4'), C(0, 'add9')],
      B: [C(9, 'm7'), C(4, 'm7'), C(5, 'M7'), C(0, 'add9'), C(9, 'm7'), C(4, 'm7'), C(2, 'm7'), C(7, 'sus4')],
      C: [C(0, 'add9'), C(7, 'sus4'), C(9, 'm7'), C(5, 'M7')],
      brk: [C(5, 'M7'), C(7, 'sus4')],
    },
    themes: {
      I: { fixed: VILLAGE_A.slice(6) }, // the intro is the theme's last line: a cadence with a pickup into A
      A: { fixed: VILLAGE_A }, B: { fixed: VILLAGE_B },
      C: { lo: 69, hi: 86, cells: 'flow', leap: 0.15 },
      M: { fixed: VILLAGE_A.slice(0, 2) }, // music-box reminder of the motif in the break
    },
    form: [
      { n: 'intro', bars: 2, prog: 'I', theme: 'I', lead: 'kalimba' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'koto' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'flute', vary: 0.35 },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'marimba' },
      { n: 'A3', bars: 8, prog: 'A', theme: 'A', lead: 'koto', vary: 0.15 },
      { n: 'C', bars: 8, prog: 'C', theme: 'C', lead: 'kalimba' },
      { n: 'break', bars: 2, prog: 'brk', theme: 'M', lead: 'glock' },
    ],
    section(p) { p.st.arp = pickR(p.rng, ARPS); p.st.fill = pickR(p.rng, FILLS); },
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, intro = n === 'intro', calm = n === 'break';
      p.padChord(chord, t, p.barDur * 1.02, intro || calm ? 0.58 : 0.45, 57);
      p.bassLine(chord, t, n === 'B' ? BASS_BOUNCE : BASS_12, 38);
      const arpInst = sec.lead === 'koto' ? 'harp' : 'koto';
      p.arp(chord, t, p.st.arp, { inst: arpInst, ch: arpInst === 'koto' ? 'koto' : 'harp', lo: 55, vel: arpInst === 'koto' ? 0.3 : 0.42 });
      if (!calm) {
        for (let i = 0; i < 8; i++) p.hit('shaker', 'perc', p.pos(t, i * 2), (i % 2 ? 0.32 : 0.2) * (intro ? 0.75 : 1));
        if (!intro && b.i % 2 === 0) p.hit('pon', 'perc', t, 0.55);
        if (n === 'B' && b.i % 2 === 1) p.hit('pon', 'perc', p.pos(t, 10), 0.4);
        if (p.rng() < (intro && b.i === 1 ? 1 : 0.35)) p.hit('woodblock', 'perc', p.pos(t, 14), 0.3, 84);
      }
      if (b.i === 0 && n !== 'C') p.hit('rin', 'bell', t, 0.5, 86);
      if (calm || n === 'C') p.sprinkle(t, 'glock', 'bell', 81, 93, calm ? 0.12 : 0.06, 0.35);
      if (!b.mel) return;
      const lead = sec.lead, ch = lead === 'kalimba' ? 'kal' : lead === 'marimba' ? 'mar' : lead === 'glock' ? 'bell' : lead;
      p.melody(b.mel, t, lead, ch, lead === 'glock' ? 0.55 : 0.85, lead === 'marimba' ? { legato: 0.7 } : undefined);
      if (intro) p.melody(b.mel, t, 'glock', 'bell', 0.3, { oct: 12 }); // music-box sparkle on the lead-in
      if (n === 'A3') { p.melody(b.mel, t, 'flute', 'flute', 0.4); p.melody(harmonize(b.mel, p.key, -2), t, 'kalimba', 'harm', 0.5); } // full-voiced return
      if (n === 'B') p.melody(harmonize(b.mel, p.key, -2), t, 'kalimba', 'harm', 0.36, { legato: 0.7 });
      if (n === 'C' && b.i % 2 === 0) p.note('flute', 'flute', t, fold(p.key + chord.root + chord.iv[1], 67), 0.32, p.barDur * 1.8);
      // kalimba answers in the gaps of the written tune (a note held from beat 3)
      const last = b.mel[b.mel.length - 1];
      if ((n === 'A' || n === 'A2') && last && last.pos <= 4 && last.pos + last.len >= 8) {
        const lad = p.ladder(chord, 71, 6);
        p.st.fill.forEach((k, i) => p.note('kalimba', 'kal', p.pos(t, 10 + i * 2), lad[k], 0.42 - i * 0.05, 0.3));
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

  // Mossy Burrow (floors 1-5). Mysterious-but-cute: in-scale (D Eb G A Bb), tiptoe pizzicato bass, heartbeat pulse,
  // kalimba melody with echo. Combat layer (intensity 1): soft taiko/woodblock drive + marimba off-beat pulse.
  dungeon: {
    bpm: 80, swing: 0.08, key: 62, scale: [0, 1, 5, 7, 8], echo: 0.75, echoFb: 0.38, gain: 1.45, maxIntensity: 1,
    mix: {
      kal: { vol: 0.75, rev: 0.45, echo: 0.28, pan: 0.12 }, koto: { vol: 0.75, rev: 0.45, echo: 0.2, pan: -0.15 }, pad: { vol: 0.6, rev: 0.6 },
      bass: { vol: 0.8, rev: 0.12 }, pulse: { vol: 0.8, rev: 0.1 }, perc: { vol: 0.6, rev: 0.4, pan: -0.2 }, bell: { vol: 0.7, rev: 0.8, echo: 0.35, pan: 0.3 },
      drive: { vol: 0.5, rev: 0.2, pan: 0.15 },
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
      if (p.intensity) { // a scuffle nearby: the burrow picks up its feet
        p.pat(t, 'X.....x.x.......', 'taiko', 'drive', 0.5);
        p.pat(t, '....x.......x..o', 'woodblock', 'drive', 0.5, 79);
        p.pat(t, '..x...x...x...x.', 'shaker', 'drive', 0.7);
        for (const s of [2, 6, 10, 14]) for (const x of chord.iv.slice(0, 2)) p.note('marimba', 'drive', p.pos(t, s), fold(p.key + chord.root + x, 62), 0.3, 0.2);
      }
      if (b.mel) p.melody(b.mel, t, sec.lead, sec.lead === 'kalimba' ? 'kal' : 'koto', 0.8);
    },
  },

  // Fox Shrine Tunnels (6-10). A hirajoshi (A B C E F): koto lead + sukui arpeggios, shakuhachi B section, temple
  // percussion (soft taiko, kotsuzumi pon, shime ticks), furin glints. Combat: taiko don-don-ka, shime 16ths, shamisen pulse.
  dungeon_shrine: {
    bpm: 84, swing: 0, key: 57, scale: [0, 2, 3, 7, 8], echo: 0.75, echoFb: 0.3, gain: 1.4, maxIntensity: 1,
    mix: {
      koto: { vol: 1.0, rev: 0.35, echo: 0.16, pan: -0.15 }, arp: { vol: 0.6, rev: 0.4, pan: 0.22 }, shaku: { vol: 0.95, rev: 0.5, echo: 0.14, pan: 0.06 },
      pad: { vol: 0.5, rev: 0.55 }, bass: { vol: 0.58, rev: 0.08 }, taiko: { vol: 0.55, rev: 0.3 }, perc: { vol: 0.55, rev: 0.25, pan: -0.2 },
      bell: { vol: 0.5, rev: 0.7, echo: 0.25, pan: 0.3 }, drive: { vol: 0.55, rev: 0.15, pan: 0.1 },
    },
    progs: {
      I: [C(0, 'p5'), C(8, 'M7')],
      A: [C(0, 'madd9'), C(8, 'M7'), C(7, 'sus4'), C(0, 'm')],
      B: [C(8, 'M7s11'), C(7, 'sus4b9'), C(0, 'madd9'), C(3, 'M7')],
    },
    themes: {
      A: { lo: 64, hi: 84, cells: 'flow', leap: 0.12 }, B: { lo: 62, hi: 81, cells: 'sparse', ends: 'endSparse', leap: 0.1 },
      I: { fixed: tune('r/1 E5/1 F5/1 E5/1 C5/2 B4/2 | A4/3 B4/1 C5/2 E5/2') }, // opening koto phrase after a "sararin" sweep
    },
    form: [
      { n: 'intro', bars: 2, prog: 'I', theme: 'I', lead: 'koto' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'koto' },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'shakuhachi' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'koto', vary: 0.3 },
      { n: 'break', bars: 4, prog: 'I' },
    ],
    section(p) { p.st.arp = pickR(p.rng, [[0, 2, 1, 3, 2, 4, 3, 5], [0, -1, 2, 3, -1, 4, 3, 2], [0, 3, 1, 4, 2, 5, 3, 6]]); },
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, calm = n === 'intro' || n === 'break';
      p.padChord(chord, t, p.barDur * 1.04, calm ? 0.55 : 0.42, 55);
      p.arp(chord, t, p.st.arp, { inst: 'harp', ch: 'arp', lo: 57, vel: calm ? 0.46 : 0.38 });
      p.bassLine(chord, t, [[0, 10, 0.7], [12, 4, 0.45, 7]], 38);
      if (n === 'intro' && b.i === 0) { // the shrine opens: a koto sweep down the scale, a soft taiko, the temple bell
        [81, 77, 76, 72, 71, 69, 64].forEach((m, j) => p.note('koto', 'koto', t + j * 0.04, m, 0.62 - j * 0.04, 0.8));
        p.hit('taiko', 'taiko', t, 0.5); p.hit('rin', 'bell', t, 0.5, p.key + 36);
      }
      if (!calm) {
        p.hit('taiko', 'taiko', t, 0.42);
        p.hit('pon', 'perc', p.pos(t, 8), 0.4);
        if (b.i % 2) p.hit('ka', 'perc', p.pos(t, 14), 0.3);
        for (let i = 1; i < 8; i += 2) if (p.rng() < 0.45) p.hit('tick', 'perc', p.pos(t, i * 2), 0.22, 95);
      }
      if (b.i === 0 && !calm) p.hit('rin', 'bell', t, 0.45, p.key + 36);
      if (calm || p.rng() < 0.25) p.sprinkle(t, 'chime', 'bell', 81, 93, calm ? 0.14 : 0.08, 0.45);
      if (p.intensity) {
        p.pat(t, 'X.....x.X..x....', 'taiko', 'drive', 0.4);
        p.pat(t, 'x.o.x.o.x.o.x.oo', 'shime', 'drive', 0.35);
        p.pat(t, '....x.......x...', 'ka', 'drive', 0.5);
        for (const i of [0, 3, 6, 10]) p.note('shamisen', 'drive', p.pos(t, i), fold(p.key + chord.root, 45) + (i === 10 ? 7 : 0), 0.4, p.s16 * 1.5);
      }
      if (b.mel) {
        const sh = sec.lead === 'shakuhachi';
        p.melody(b.mel, t, sec.lead, sh ? 'shaku' : 'koto', sh ? 0.85 : 0.82);
        if (n === 'A2' && b.i >= 4) p.melody(b.mel, t, 'shakuhachi', 'shaku', 0.4, { oct: -12 });
      }
    },
  },

  // Oni's Kitchen (11-15). Playful & bouncy: steel-pot lead, marimba, tuba oom-pah, a pots-and-pans kit (pot = kick,
  // frying pan = backbeat, wooden spoon hats, lid crashes), stew bubbles, a slide whistle at phrase ends. G major
  // pentatonic + b7. Combat: pan flams, double pot kicks, lid on the one, marimba 16ths.
  dungeon_kitchen: {
    bpm: 118, swing: 0.22, key: 55, scale: [0, 2, 4, 7, 9, 10], echo: 0.75, echoFb: 0.2, gain: 1.0, maxIntensity: 1,
    mix: {
      lead: { vol: 0.85, rev: 0.25, echo: 0.1, pan: 0.12 }, mar: { vol: 0.8, rev: 0.25, pan: -0.15 }, bass: { vol: 0.85, rev: 0.05 },
      kit: { vol: 0.8, rev: 0.18 }, spoon: { vol: 0.6, rev: 0.1, pan: -0.25 }, stab: { vol: 0.5, rev: 0.2, pan: 0.2 },
      fx: { vol: 0.55, rev: 0.35, echo: 0.2, pan: -0.3 }, pad: { vol: 0.3, rev: 0.4 }, drive: { vol: 0.55, rev: 0.15, pan: 0.1 },
    },
    progs: {
      I: [C(0, 'M6'), C(7, 'd7')],
      A: [C(0, 'M6'), C(5, 'M6'), C(0, 'M6'), C(7, 'd7')],
      B: [C(5, 'M'), C(10, 'M'), C(0, 'M6'), C(7, 'd7')],
    },
    themes: { A: { lo: 67, hi: 88, cells: 'busy', leap: 0.18 }, B: { lo: 62, hi: 83, cells: 'flow', leap: 0.15 } },
    form: [
      { n: 'intro', bars: 2, prog: 'I' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'steelpan' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'marimba', vary: 0.3 },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'steelpan' },
      { n: 'A3', bars: 8, prog: 'A', theme: 'A', lead: 'steelpan', vary: 0.25 },
    ],
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, intro = n === 'intro';
      p.bassLine(chord, t, [[0, 3, 0.9], [8, 3, 0.7, 7]], 38, 'tuba');
      if (p.rng() < 0.35) p.bassLine(chord, t, [[14, 2, 0.5, 5]], 38, 'tuba');
      for (const s of [4, 12]) for (const x of chord.iv.slice(0, 3)) p.note('marimba', 'stab', p.pos(t, s), fold(p.key + chord.root + x, 60), 0.3, 0.2);
      p.pat(t, 'X.......x.....o.', 'pot', 'kit', 0.85);
      if (!intro) p.pat(t, '....X.......X...', 'pan', 'kit', 0.75);
      p.pat(t, 'x.x.x.x.x.x.x.x.', 'spoon', 'spoon', 0.55, 0, 0.9);
      if (b.i === 0 && !intro) p.hit('lid', 'kit', t, 0.75);
      if (b.i === 0) p.padChord(chord, t, p.barDur * 2, 0.45, 60);
      // the stew bubbles away
      if (p.rng() < 0.55) { const k = 1 + ((p.rng() * 3) | 0), at = (p.rng() * 12) | 0; for (let i = 0; i < k; i++) p.hit('bubble', 'fx', p.pos(t, at + i), 0.5 - i * 0.1, p.key + 12 + pickR(p.rng, [0, 4, 7, 9])); }
      if (b.last && !intro) p.note('slide', 'fx', p.pos(t, 12), p.key + 24, 0.8, p.beat * 0.9, { down: b.n % 16 > 8 });
      if (p.intensity) {
        p.pat(t, '..x...x...x..xx.', 'pan', 'drive', 0.4, p.key + 24 + chord.root);
        p.pat(t, 'X.x.....X.x.....', 'pot', 'drive', 0.5);
        if (b.i % 2 === 0) p.hit('lid', 'drive', t, 0.5);
        const lad = p.ladder(chord, 67);
        for (let i = 0; i < 16; i += 2) p.note('marimba', 'drive', p.pos(t, i), lad[[0, 1, 2, 1, 3, 2, 1, 2][i / 2]], 0.25, 0.15);
      }
      if (b.mel) {
        const pan = sec.lead === 'steelpan';
        p.melody(b.mel, t, sec.lead, pan ? 'lead' : 'mar', 0.85, { legato: 0.6 });
        if (n === 'A2') p.melody(b.mel, t, 'steelpan', 'lead', 0.3, { oct: 12, legato: 0.6 });
      }
    },
  },

  // Crystal Grotto (16-19). Glassy, shimmering, spacious: glass-harmonica chords over an E sub drone, celesta 16ths
  // drowned in echo, kalimba / glass leads, singing bowl at section starts, crystal drips. E lydian colours.
  // Combat: soft heartbeat kick, high ticks, a low kalimba ostinato.
  dungeon_crystal: {
    bpm: 66, swing: 0, key: 52, scale: [0, 2, 4, 6, 7, 11], echo: 1.5, echoFb: 0.42, gain: 1.35, maxIntensity: 1,
    mix: {
      glass: { vol: 0.75, rev: 0.7, pan: -0.1 }, lead: { vol: 0.85, rev: 0.6, echo: 0.3, pan: 0.15 }, cel: { vol: 0.58, rev: 0.6, echo: 0.35, pan: 0.3 },
      sub: { vol: 0.42, rev: 0.05 }, bell: { vol: 0.6, rev: 0.85, echo: 0.3, pan: -0.3 }, drip: { vol: 0.5, rev: 0.8, echo: 0.2, pan: 0.2 },
      drive: { vol: 0.5, rev: 0.4, pan: -0.1 },
    },
    progs: {
      I: [C(0, 'M9'), C(2, 'add9')],
      A: [C(0, 'M9'), C(2, 'add9'), C(9, 'm9'), C(5, 'M7s11')],
      B: [C(9, 'm7'), C(7, 'M7'), C(4, 'm7'), C(2, 'sus2')],
    },
    themes: { A: { lo: 71, hi: 91, cells: 'sparse', ends: 'endSparse', leap: 0.2 }, B: { lo: 64, hi: 83, cells: 'sparse', ends: 'endSparse', leap: 0.12 } },
    form: [
      { n: 'intro', bars: 4, prog: 'I' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'kalimba' },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'glass' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'kalimba', vary: 0.3 },
      { n: 'break', bars: 4, prog: 'I' },
    ],
    section(p) { p.st.arp = pickR(p.rng, [[0, 2, 4, 6, 7, 6, 4, 2, 1, 3, 5, 7, 8, 7, 5, 3], [0, 4, 2, 6, 4, 8, 6, 4, 1, 5, 3, 7, 5, 9, 7, 5]]); },
    bar(p, b) {
      const { t, sec, chord } = b, calm = sec.n === 'intro' || sec.n === 'break';
      p.padChord(chord, t, p.barDur * 1.02, calm ? 0.55 : 0.46, 59, 'glass', 'glass');
      p.note('sub', 'sub', t, fold(p.key + chord.root, 40), 0.6, p.barDur * 1.02);
      const arp = calm ? p.st.arp.map((k, i) => (i % 2 ? -1 : k)) : p.st.arp;
      p.arp(chord, t, arp, { inst: 'glock', ch: 'cel', lo: 76, vel: 0.3, step: 1, len: 3 });
      if (b.i === 0) p.hit('bowl', 'bell', t, 0.8, p.key + 12);
      if (p.rng() < 0.6) p.sprinkle(t, 'drip', 'drip', 86, 98, 0.1, 0.32);
      if (p.rng() < 0.3) p.note('glass', 'bell', p.pos(t, 4 + ((p.rng() * 8) | 0)), pickR(p.rng, p.ladder(chord, 83, 4)), 0.35, p.beat * 2);
      if (p.intensity) {
        p.pat(t, 'X.......x.......', 'heartbeat', 'drive', 0.7);
        p.pat(t, '..x...x...x...xo', 'tick', 'drive', 0.35, 98);
        const lad = p.ladder(chord, 52, 4);
        for (const [i, k] of [[0, 0], [3, 1], [6, 2], [8, 0], [11, 1], [14, 3]]) p.note('kalimba', 'drive', p.pos(t, i), lad[k], 0.4, 0.3);
      }
      if (b.mel) {
        const gl = sec.lead === 'glass';
        p.melody(b.mel, t, sec.lead, 'lead', gl ? 0.8 : 0.85, { legato: gl ? 1 : 0.95 });
        if (sec.n === 'A2' && b.i >= 4) p.melody(b.mel, t, 'glass', 'glass', 0.35, { oct: -12 });
      }
    },
  },

  // Moonlit Fox Sanctum (20). Mysterious night: B kumoi (B C# D F# G#), low shakuhachi, sparse koto, choir "ooh",
  // dark pad, temple bell every 4 bars, bell-cricket glints, foxfire chimes, a slow heartbeat.
  // Combat: taiko + shime 8ths + koto tremolo on the root.
  dungeon_moon: {
    bpm: 60, swing: 0, key: 59, scale: [0, 2, 3, 7, 9], echo: 1.5, echoFb: 0.38, gain: 1.1, maxIntensity: 1,
    mix: {
      shaku: { vol: 0.9, rev: 0.6, echo: 0.2, pan: -0.05 }, koto: { vol: 0.75, rev: 0.5, echo: 0.22, pan: -0.2 }, choir: { vol: 0.55, rev: 0.7 },
      pad: { vol: 0.48, rev: 0.6 }, bass: { vol: 0.5, rev: 0.1 }, pulse: { vol: 0.7, rev: 0.2 }, bell: { vol: 0.5, rev: 0.8, echo: 0.3, pan: 0.3 },
      fox: { vol: 0.42, rev: 0.8, echo: 0.3, pan: 0.25 }, drive: { vol: 0.5, rev: 0.25, pan: -0.1 },
    },
    progs: {
      I: [C(0, 'madd9'), C(9, 'm7b5')],
      A: [C(0, 'madd9'), C(9, 'm7b5'), C(2, 'sus4'), C(0, 'm')],
      B: [C(3, 'M7'), C(2, 'sus4'), C(0, 'madd9'), C(7, 'sus4')],
    },
    themes: {
      A: { lo: 62, hi: 81, cells: 'sparse', ends: 'endSparse', leap: 0.12 }, B: { lo: 66, hi: 86, cells: 'sparse', ends: 'endSparse' },
      I: { fixed: tune('F#5/3 G#5/1 F#5/2 D5/2 | C#5/4 B4/4') }, // the fox's call on the shakuhachi
    },
    form: [
      { n: 'intro', bars: 2, prog: 'I', theme: 'I', lead: 'shakuhachi' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'shakuhachi' },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'koto' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'shakuhachi', vary: 0.3 },
      { n: 'rest', bars: 4, prog: 'I' },
    ],
    bar(p, b) {
      const { t, sec, chord } = b, calm = sec.n === 'intro' || sec.n === 'rest';
      p.padChord(chord, t, p.barDur * 1.05, 0.5, 50, 'darkpad');
      if ((sec.n === 'A2' || sec.n === 'B' || sec.n === 'intro') && b.i % 2 === 0) p.padChord(chord, t, p.barDur * 2, 0.45, 62, 'ooh', 'choir');
      if (sec.n === 'intro' && b.i === 0) p.hit('gong', 'bell', t, 0.45, 38);
      p.bassLine(chord, t, [[0, 14, 0.45]], 35);
      p.hit('heartbeat', 'pulse', t, 0.45);
      if (!calm && b.i % 2 === 1) p.hit('taiko', 'pulse', p.pos(t, 8), 0.3);
      if (b.i % 4 === 0) p.hit('rin', 'bell', t, 0.5, p.key + 12);
      p.arp(chord, t, p.rng() < 0.5 ? [0, -1, 2, -1, 3, -1, 2, -1] : [-1, 0, -1, 2, -1, 4, -1, -1], { inst: 'harp', ch: 'koto', lo: 59, vel: 0.36 });
      if (p.rng() < 0.4) { const tt = p.pos(t, ((p.rng() * 14) | 0) + 1); p.hit('glock', 'bell', tt, 0.2, 95); p.hit('glock', 'bell', tt + 0.09, 0.14, 95); }
      if (p.rng() < 0.45) p.note('glass', 'fox', p.pos(t, ((p.rng() * 12) | 0) + 2), pickR(p.rng, scaleNotes(p.key, p.def.scale, 83, 95)), 0.4, p.beat * 1.5);
      if (p.intensity) {
        p.pat(t, 'X.....x.X.......', 'taiko', 'drive', 0.5);
        p.pat(t, 'x.x.x.x.x.x.x.x.', 'shime', 'drive', 0.28);
        const r = fold(p.key + chord.root, 47);
        for (let i = 8; i < 16; i++) p.note('koto', 'drive', p.pos(t, i), r + (i >= 12 ? 12 : 0), 0.22 + (i - 8) * 0.03, p.s16);
      }
      if (b.mel) {
        const sh = sec.lead === 'shakuhachi';
        p.melody(b.mel, t, sec.lead, sh ? 'shaku' : 'koto', sh ? 0.85 : 0.8);
      }
    },
  },

  // Boss themes (see bossTrack): one engine, a flavour per biome. 'boss' = Lord Karakasa's taiko + tsugaru shamisen
  // (also the fallback for any boss floor without its own variant).
  boss: bossTrack({ bpm: 144, key: 64, scale: [0, 3, 5, 7, 10], kit: 'taiko', riff: 'shamisen', lead: ['flute', 'flute'], counter: 'koto', progs: MINOR_PROG, gain: 1.1 }),
  // King Mochi the Squishy: bouncy G minyo, marimba riff, kalimba → flute leads, mochi boings.
  boss_burrow: bossTrack({ bpm: 132, key: 55, scale: [0, 3, 5, 7, 10], kit: 'taiko', riff: 'marimba', riffVol: 1.15, lead: ['kalimba', 'flute'], counter: 'glock', progs: MINOR_PROG, gain: 1.1, extra: mochiExtra }),
  // Oni Chef Gorobei: A blues-minor, pots & pans kit, steel-pot riff, brass stabs, slide whistle — a kitchen brawl.
  boss_kitchen: bossTrack({ bpm: 150, key: 57, scale: [0, 3, 5, 6, 7, 10], kit: 'kitchen', riff: 'steelpan', riffVol: 0.95, lead: ['flute', 'shakuhachi'], counter: 'marimba', progs: MINOR_PROG, gain: 1.05, extra: kitchenExtra }),
  // Tamamo, the Nine-Tailed: D in-scale, koto riff, shakuhachi lead, choir pad, deep gong, foxfire chimes.
  boss_moon: bossTrack({ bpm: 138, key: 62, scale: [0, 1, 5, 7, 8], kit: 'taiko', riff: 'koto', riffVol: 0.9, lead: ['shakuhachi', 'shakuhachi'], counter: 'chime', pad: 'ooh', progs: IN_PROG, gain: 1.15, gong: 38, lo: 69, hi: 86, extra: moonExtra }),

  // Bouncy & cheerful: marimba + kalimba over oom-pah pizzicato, swung shakers. F Ryukyu scale (Okinawan charm).
  shop: {
    bpm: 116, swing: 0.3, key: 65, scale: [0, 4, 5, 7, 11], echo: 0.75, echoFb: 0.22, gain: 0.8,
    mix: {
      mar: { vol: 0.85, rev: 0.25, echo: 0.1, pan: -0.1 }, kal: { vol: 0.7, rev: 0.3, echo: 0.15, pan: 0.2 }, bass: { vol: 0.8, rev: 0.05 },
      stab: { vol: 0.55, rev: 0.25, pan: 0.15 }, perc: { vol: 0.95, rev: 0.12, pan: -0.15 }, pad: { vol: 0.35, rev: 0.45 }, bell: { vol: 0.45, rev: 0.5, echo: 0.2 },
    },
    progs: { A: [C(0, 'M'), C(5, 'M'), C(0, 'M'), C(7, 'd7')], B: [C(5, 'M'), C(7, 'M'), C(4, 'm7'), C(9, 'm')], I: [C(0, 'M'), C(7, 'd7')] },
    themes: {
      A: { lo: 69, hi: 88, cells: 'busy', leap: 0.15 }, B: { lo: 65, hi: 84, cells: 'flow' },
      I: { fixed: tune('r/2 C5/1 F5/1 A5/1 C6/1 E6/2 | C6/2 Bb5/1 A5/1 F5/1 E5/1 C5/2') }, // welcome jingle after the doorbell
    },
    form: [
      { n: 'intro', bars: 2, prog: 'I', theme: 'I', lead: 'marimba' },
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
      if (b.i === 0) p.padChord(chord, t, p.barDur * 2, 0.5, 60);
      if (sec.n === 'intro' && b.i === 0) { p.hit('glock', 'bell', t, 0.75, p.key + 28); p.hit('glock', 'bell', p.pos(t, 3), 0.65, p.key + 24); } // shop doorbell: ding-dong
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

  // ---------------------------------------------------------------------------------------- regions (see above)
  // Whispering Bamboo Grove, a misty morning. A distant koto previews the hook, then the shakuhachi sings the whole tune
  // (A); the koto improvises in the B section as the sun breaks through (major pentatonic: G# appears); the koto takes
  // the tune over a held shakuhachi line (A2); then the grove breathes (rest). Around it: harp arpeggios, tuned bamboo
  // tubes on a lazy 3+3+2, leaves (shaker), gusts of wind, dew-drop chimes, and a shishi-odoshi "tok" as each phrase
  // lets go. Combat: taiko, rattling kokiriko, a damped koto pulse.
  region_bamboo: {
    bpm: 76, swing: 0, key: 52, scale: [0, 2, 5, 7, 9], echo: 1.5, echoFb: 0.34, gain: 1.35, maxIntensity: 1,
    mix: {
      shaku: { vol: 0.68, rev: 0.55, echo: 0.18, pan: 0.05 }, koto: { vol: 0.88, rev: 0.4, echo: 0.18, pan: -0.18 }, harp: { vol: 0.5, rev: 0.45, pan: 0.24 },
      pad: { vol: 0.5, rev: 0.6 }, bass: { vol: 0.55, rev: 0.1 }, perc: { vol: 0.62, rev: 0.3, pan: -0.12 }, wind: { vol: 0.9, rev: 0.7, pan: 0.2 },
      bell: { vol: 0.45, rev: 0.75, echo: 0.25, pan: 0.3 }, drive: { vol: 0.52, rev: 0.2, pan: 0.1 },
    },
    progs: {
      I: [C(5, 'add9'), C(7, 's7sus4')],
      A: [C(0, 'sus2'), C(5, 'add9'), C(2, 'm7'), C(7, 's7sus4'), C(0, 'sus2'), C(5, 'add9'), C(7, 's7sus4'), C(0, 'sus2')],
      B: [C(2, 'm7'), C(9, 'm7'), C(5, 'add9'), C(7, 's7sus4')],
      R: [C(5, 'add9'), C(0, 'sus2')],
    },
    themes: {
      I: { fixed: tune('r/4 B5/1 C#6/1 E6/2 | r/8') },
      A: { fixed: BAMBOO_A },
      B: { lo: 64, hi: 83, cells: 'flow', leap: 0.12, scale: [0, 2, 4, 7, 9] },
    },
    form: [
      { n: 'intro', bars: 2, prog: 'I', theme: 'I', lead: 'koto' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'shakuhachi' },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'koto' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'koto', vary: 0.3 },
      { n: 'rest', bars: 4, prog: 'R' },
    ],
    section(p) { p.st.arp = pickR(p.rng, REGION_ARPS); },
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, calm = n === 'intro' || n === 'rest', root = p.key + chord.root;
      p.padChord(chord, t, p.barDur * 1.04, calm ? 0.55 : 0.44, 55);
      p.bassLine(chord, t, calm ? [[0, 14, 0.5]] : [[0, 10, 0.62], [12, 4, 0.4, 7]], 40);
      p.arp(chord, t, calm ? p.st.arp.map((k, i) => (i % 2 ? -1 : k)) : p.st.arp, { lo: 59, vel: calm ? 0.42 : 0.34 });
      if (!calm) {
        p.hit('bamboo', 'perc', t, 0.4, p.key + 24);
        p.hit('bamboo', 'perc', p.pos(t, 6), 0.26, p.key + 31);
        if (b.i % 2) p.hit('bamboo', 'perc', p.pos(t, 12), 0.3, p.key + 29);
        for (let i = 1; i < 8; i += 2) if (p.rng() < 0.55) p.hit('shaker', 'perc', p.pos(t, i * 2), 0.15);
      }
      if (b.i === 0 || (b.i % 4 === 2 && p.rng() < 0.5)) p.note('gust', 'wind', p.pos(t, 2 + ((p.rng() * 4) | 0)), 84 + ((p.rng() * 6) | 0), calm ? 0.5 : 0.36, p.barDur * 0.9);
      if (calm || p.rng() < 0.3) p.sprinkle(t, 'chime', 'bell', 83, 95, calm ? 0.12 : 0.06, 0.4);
      if (b.i === 0 && !calm) p.hit('rin', 'bell', t, 0.4, p.key + 36);
      if (b.last) { p.hit('bamboo', 'perc', p.pos(t, 12), 0.7, p.key + 12); p.hit('drip', 'bell', p.pos(t, 13), 0.35, 86); } // shishi-odoshi
      if (p.intensity) {
        p.pat(t, 'X.....x.X.....x.', 'taiko', 'drive', 0.42);
        p.pat(t, 'x.ox.ox.x.ox.oxo', 'bamboo', 'drive', 0.3, p.key + 31);
        p.pat(t, '....x.......x...', 'ka', 'drive', 0.45);
        const r = fold(root, 45);
        for (const [i, d] of [[0, 0], [3, 7], [6, 12], [8, 0], [11, 7], [14, 12]]) p.note('koto', 'drive', p.pos(t, i), r + d, 0.3, p.s16 * 1.5, { damp: true });
      }
      if (!b.mel) return;
      const sh = sec.lead === 'shakuhachi';
      p.melody(b.mel, t, sec.lead, sh ? 'shaku' : 'koto', sh ? 0.85 : n === 'intro' ? 0.6 : 0.82);
      if (n === 'A2' && b.i % 2 === 0) p.note('shakuhachi', 'shaku', t, colour(p, chord, 62), 0.36, p.barDur * 1.85);
    },
  },

  // Momiji Hollow, golden hour. A harvest song: the koto states the tune (A), the festival flute sings it back with
  // koto thirds underneath (A2), the shamisen dances in G minyo (B, the same notes as the relative minor) over taiko
  // don-don-ka and the kane's chan-chiki, the koto brings the tune home at dusk (A3: no drums, falling-leaf glock, a far
  // fue), and a 2-bar festival break (flute call + drums) swings back into A. Swung like a bon-odori.
  // Combat: the festival drums get serious (taiko, shime 8ths, kane) under a tsugaru-shamisen octave pulse.
  region_maple: {
    bpm: 96, swing: 0.2, key: 58, scale: [0, 2, 4, 7, 9], echo: 0.75, echoFb: 0.25, gain: 1.25, maxIntensity: 1,
    mix: {
      koto: { vol: 0.9, rev: 0.32, echo: 0.14, pan: -0.14 }, sham: { vol: 1.25, rev: 0.25, echo: 0.1, pan: 0.18 }, fue: { vol: 0.66, rev: 0.45, echo: 0.14, pan: 0.06 },
      harm: { vol: 0.5, rev: 0.4, echo: 0.1, pan: -0.26 }, harp: { vol: 0.46, rev: 0.4, pan: 0.25 }, pad: { vol: 0.5, rev: 0.5 }, bass: { vol: 0.7, rev: 0.06 },
      taiko: { vol: 0.6, rev: 0.25 }, perc: { vol: 0.68, rev: 0.2, pan: -0.2 }, bell: { vol: 0.42, rev: 0.6, echo: 0.2, pan: -0.28 }, drive: { vol: 0.52, rev: 0.15, pan: 0.1 },
    },
    progs: {
      I: [C(0, 'add9'), C(7, 'sus4')],
      A: [C(5, 'M7'), C(7, 'M'), C(4, 'm7'), C(9, 'm7'), C(5, 'M7'), C(7, 'sus4'), C(2, 'm7'), C(0, 'add9')],
      B: [C(9, 'm7'), C(2, 'm7'), C(5, 'M7'), C(7, 'sus4')],
      F: [C(9, 'm7'), C(7, 'sus4')],
    },
    themes: {
      I: { fixed: tune('r/4 C5/1 D5/1 F5/2 | G5/4 r/2 D5/1 F5/1') }, // a koto pickup into the hook
      A: { fixed: MAPLE_A }, F: { fixed: MAPLE_FEST },
      B: { lo: 67, hi: 86, cells: 'busy', leap: 0.15 },
    },
    form: [
      { n: 'intro', bars: 2, prog: 'I', theme: 'I', lead: 'koto' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'koto' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'fue', vary: 0.3 },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'shamisen' },
      { n: 'A3', bars: 8, prog: 'A', theme: 'A', lead: 'koto', vary: 0.15 },
      { n: 'fest', bars: 2, prog: 'F', theme: 'F', lead: 'fue' },
    ],
    section(p) { p.st.arp = pickR(p.rng, ARPS); p.st.fill = pickR(p.rng, FILLS); },
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, intro = n === 'intro', fest = n === 'fest', dusk = n === 'A3', matsuri = n === 'B' || fest, root = p.key + chord.root;
      p.padChord(chord, t, p.barDur * 1.02, intro || dusk ? 0.55 : 0.44, 57);
      p.bassLine(chord, t, matsuri ? BASS_BOUNCE : BASS_12, 38);
      if (!fest) p.arp(chord, t, p.st.arp, { lo: 55, vel: dusk ? 0.44 : 0.34 });
      if (!dusk) {
        for (let i = 0; i < 8; i++) p.hit('shaker', 'perc', p.pos(t, i * 2), (i % 2 ? 0.3 : 0.18) * (intro ? 0.7 : 1));
        if (!intro && !matsuri && b.i % 2 === 0) p.hit('taiko', 'taiko', t, 0.42);
        if (!intro && !fest) p.hit('pon', 'perc', p.pos(t, 8), 0.34);
      }
      if (matsuri) {
        p.pat(t, fest ? 'X..x..x.X.x.x.xx' : 'X.....x.X.....x.', 'taiko', 'taiko', fest ? 0.6 : 0.5);
        p.pat(t, fest ? 'x.xox.xox.xox.xo' : '..x...x...x...x.', 'kane', 'perc', fest ? 0.45 : 0.28);
        if (!fest) p.pat(t, '....x.......x...', 'ka', 'taiko', 0.35);
      }
      if (dusk || intro) p.sprinkle(t, 'glock', 'bell', 82, 94, 0.08, 0.3);
      if (b.i === 0 && !fest) p.hit('rin', 'bell', t, 0.4, p.key + 36);
      if (p.intensity) {
        p.pat(t, 'X..x..x.X.....x.', 'taiko', 'drive', 0.48);
        p.pat(t, 'x.x.x.x.x.x.x.x.', 'shime', 'drive', 0.26);
        p.pat(t, '....x.......x...', 'kane', 'drive', 0.38);
        const r = fold(root, 45);
        for (const [i, d] of [[0, 0], [2, 12], [4, 7], [6, 12], [8, 0], [10, 12], [12, 7], [14, 12]]) p.note('shamisen', 'drive', p.pos(t, i), r + d, i % 4 ? 0.26 : 0.38, p.s16 * 1.4);
      }
      if (!b.mel) return;
      const lead = sec.lead;
      p.melody(b.mel, t, lead, lead === 'shamisen' ? 'sham' : lead, lead === 'fue' ? 0.8 : 0.85, lead === 'shamisen' ? { legato: 0.9 } : undefined);
      if (n === 'A2') p.melody(harmonize(b.mel, p.key, -2), t, 'koto', 'harm', 0.5); // koto thirds under the festival flute
      if (fest) p.melody(b.mel, t, 'shamisen', 'sham', 0.36, { oct: -12 });
      if (dusk && b.i % 2 === 0) p.note('fue', 'fue', t, colour(p, chord, 67), 0.26, p.barDur * 1.8);
      if (n === 'A') answer(p, b, 'shamisen', 'sham', 70, 0.26);
    },
  },

  // Shiokaze Tidepools, a bright coastal day. A lilting calypso: the steel pan calls over the first swell, the marimba
  // plays the tune (A) with kalimba answers, the steel pan takes it over marimba thirds (A2), a breezy flute improvises
  // (B) over kalimba arpeggios, marimba + steel pan an octave up + a far flute bring it home (A3), then low tide: surges,
  // tide-pool bubbles, steel-pan sparkles. Off-beat harp strums (a little ukulele), swung shaker, soft kick, 3-2 clave.
  // Combat: kick and conga, busy shaker, marimba off-beats.
  region_tidepool: {
    bpm: 104, swing: 0.24, key: 57, scale: [0, 2, 4, 5, 7, 9], echo: 0.75, echoFb: 0.24, gain: 1.1, maxIntensity: 1,
    mix: {
      mar: { vol: 0.85, rev: 0.25, echo: 0.12, pan: -0.1 }, pan: { vol: 0.75, rev: 0.3, echo: 0.14, pan: 0.16 }, flute: { vol: 0.72, rev: 0.45, echo: 0.14, pan: 0.05 },
      kal: { vol: 0.58, rev: 0.35, echo: 0.18, pan: 0.26 }, strum: { vol: 0.48, rev: 0.3, pan: -0.24 }, pad: { vol: 0.42, rev: 0.5 }, bass: { vol: 0.8, rev: 0.05 },
      perc: { vol: 0.85, rev: 0.15, pan: 0.18 }, sea: { vol: 0.9, rev: 0.55 }, bell: { vol: 0.42, rev: 0.6, echo: 0.2, pan: -0.3 }, drive: { vol: 0.55, rev: 0.12, pan: -0.05 },
    },
    progs: {
      I: [C(0, 'add9'), C(7, 's7sus4')],
      A: [C(0, 'add9'), C(5, 'M7'), C(2, 'm7'), C(7, 'sus4'), C(0, 'add9'), C(9, 'm7'), C(7, 's7sus4'), C(0, 'add9')],
      B: [C(5, 'M7'), C(4, 'm7'), C(2, 'm7'), C(7, 'sus4')],
      L: [C(5, 'M7'), C(7, 'sus4'), C(5, 'M7'), C(7, 's7sus4')],
    },
    themes: {
      I: { fixed: tune('r/4 E5/1 F#5/1 A5/2 | B5/3 A5/1 E5/2 r/2') }, // the steel pan's call
      A: { fixed: TIDE_A },
      B: { lo: 69, hi: 88, cells: 'sparse', ends: 'endSparse', leap: 0.14 },
    },
    form: [
      { n: 'intro', bars: 2, prog: 'I', theme: 'I', lead: 'steelpan' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'marimba' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'steelpan', vary: 0.3 },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'flute' },
      { n: 'A3', bars: 8, prog: 'A', theme: 'A', lead: 'marimba', vary: 0.2 },
      { n: 'low', bars: 4, prog: 'L' },
    ],
    section(p) { p.st.arp = pickR(p.rng, REGION_ARPS); p.st.fill = pickR(p.rng, FILLS); },
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, intro = n === 'intro', low = n === 'low', root = p.key + chord.root;
      p.padChord(chord, t, p.barDur * 1.02, intro || low ? 0.5 : 0.38, 57);
      p.bassLine(chord, t, low || intro ? [[0, 6, 0.6], [8, 6, 0.45, 7]] : [[0, 3, 0.8], [6, 2, 0.5, 7], [8, 3, 0.65], [12, 2, 0.45, 7], [14, 2, 0.4, 12]], 40);
      if (n === 'A' || n === 'A2' || n === 'A3') {
        const lad = p.ladder(chord, 64, 3);
        for (const s of [2, 6, 10, 14]) lad.forEach((m, j) => p.note('harp', 'strum', p.pos(t, s) + j * 0.012, m, s === 6 || s === 14 ? 0.38 : 0.3, 0.25));
      } else p.arp(chord, t, low || intro ? p.st.arp.map((k, i) => (i % 2 ? -1 : k)) : p.st.arp, { inst: 'kalimba', ch: 'kal', lo: 69, vel: 0.3 });
      if (!low) {
        for (let i = 0; i < 8; i++) p.hit('shaker', 'perc', p.pos(t, i * 2), (i % 2 ? 0.3 : 0.16) * (intro ? 0.7 : 1));
        if (!intro) {
          p.hit('kick', 'perc', t, 0.4); p.hit('kick', 'perc', p.pos(t, 8), 0.3);
          p.pat(t, b.i % 2 ? '....x...x.......' : 'x.....x.....x...', 'woodblock', 'perc', 0.3, 86);
        }
      }
      if (b.i % 4 === 0 || low) p.note('surge', 'sea', p.pos(t, low ? 0 : 4), 0, low || intro ? 0.45 : 0.3, p.barDur * 1.3);
      if (p.rng() < 0.3) { const at = (p.rng() * 12) | 0, k = 1 + ((p.rng() * 3) | 0); for (let i = 0; i < k; i++) p.hit('bubble', 'bell', p.pos(t, at + i), 0.35 - i * 0.08, p.key + 24 + pickR(p.rng, [0, 4, 7])); }
      if (low) p.sprinkle(t, 'steelpan', 'pan', 81, 93, 0.12, 0.3);
      if (b.i === 0 && !low) p.hit('glock', 'bell', t, 0.4, p.key + 28);
      if (p.intensity) {
        p.pat(t, 'X.....x.X.....x.', 'kick', 'drive', 0.5);
        p.pat(t, '..x..x....x..x.x', 'pon', 'drive', 0.42);
        p.pat(t, '.x.x.x.x.x.x.x.x', 'shaker', 'drive', 0.3, 0, 0.85);
        for (const s of [2, 6, 10, 14]) for (const x of chord.iv.slice(0, 2)) p.note('marimba', 'drive', p.pos(t, s), fold(root + x, 64), 0.28, 0.2);
      }
      if (!b.mel) return;
      const lead = sec.lead, ch = lead === 'marimba' ? 'mar' : lead === 'steelpan' ? 'pan' : lead;
      p.melody(b.mel, t, lead, ch, 0.85, lead === 'flute' ? undefined : { legato: 0.7 });
      if (n === 'A2') p.melody(harmonize(b.mel, p.key, -2), t, 'marimba', 'mar', 0.42, { legato: 0.7 });
      if (n === 'A3') {
        p.melody(b.mel, t, 'steelpan', 'pan', 0.36, { oct: 12, legato: 0.6 });
        if (b.i % 2 === 0) p.note('flute', 'flute', t, colour(p, chord, 69), 0.28, p.barDur * 1.8);
      }
      if (n === 'A' || n === 'A2') answer(p, b, 'kalimba', 'kal', 76, 0.4);
    },
  },

  // Yukimi Onsen, a snowy blue dusk at a ruined inn. A lullaby for a music box (glock tines over a kalimba body) with
  // the koto answering in its long notes (A); the koto wanders sparsely while a glass harmonica frosts the chords (B);
  // the koto sings the lullaby with the music box an octave above (A2); then the music box runs down (rest). A warm
  // steam pad, slow harp, ice-bell snowflakes, hot-spring bubbles, a hush of snowy wind, the temple bell.
  // Combat: taiko and shime, the music box turned urgent, a damped koto pulse.
  region_onsen: {
    bpm: 66, swing: 0, key: 51, scale: [0, 2, 4, 7, 9, 11], echo: 1.5, echoFb: 0.38, gain: 1.4, maxIntensity: 1,
    mix: {
      box: { vol: 0.8, rev: 0.55, echo: 0.25, pan: 0.12 }, koto: { vol: 1.1, rev: 0.5, echo: 0.2, pan: -0.2 }, glass: { vol: 0.5, rev: 0.7, pan: -0.05 },
      steam: { vol: 0.58, rev: 0.6 }, bass: { vol: 0.5, rev: 0.12 }, harp: { vol: 0.42, rev: 0.55, pan: 0.25 }, bell: { vol: 0.45, rev: 0.8, echo: 0.3, pan: -0.3 },
      perc: { vol: 0.45, rev: 0.4, pan: 0.15 }, wind: { vol: 0.4, rev: 0.7, pan: -0.2 }, drive: { vol: 0.5, rev: 0.25, pan: 0.1 },
    },
    progs: {
      I: [C(0, 'M9'), C(7, 's7sus4')],
      A: [C(0, 'M9'), C(9, 'm9'), C(5, 'M7'), C(7, 's7sus4'), C(0, 'M9'), C(4, 'm7'), C(5, 'M7'), C(0, 'add9')],
      B: [C(5, 'M7'), C(4, 'm7'), C(2, 'm7'), C(7, 's7sus4')],
      R: [C(5, 'M7'), C(0, 'M9'), C(5, 'M7'), C(7, 's7sus4')],
    },
    themes: {
      I: { fixed: tune('r/8 | r/6 Eb5/1 F5/1') }, // the music box is wound: a two-note pickup into the lullaby
      A: { fixed: ONSEN_A },
      M: { fixed: [...ONSEN_A.slice(0, 2), [], []] }, // …and it runs down in the rest
      B: { lo: 67, hi: 84, cells: 'sparse', ends: 'endSparse', leap: 0.1 },
    },
    form: [
      { n: 'intro', bars: 2, prog: 'I', theme: 'I', lead: 'glock' },
      { n: 'A', bars: 8, prog: 'A', theme: 'A', lead: 'glock' },
      { n: 'B', bars: 8, prog: 'B', theme: 'B', lead: 'koto' },
      { n: 'A2', bars: 8, prog: 'A', theme: 'A', lead: 'koto', vary: 0.2 },
      { n: 'rest', bars: 4, prog: 'R', theme: 'M', lead: 'glock' },
    ],
    section(p) { p.st.arp = pickR(p.rng, REGION_ARPS); p.st.fill = pickR(p.rng, FILLS); },
    bar(p, b) {
      const { t, sec, chord } = b, n = sec.n, calm = n === 'intro' || n === 'rest', root = p.key + chord.root;
      p.padChord(chord, t, p.barDur * 1.05, calm ? 0.62 : 0.5, 53, 'steam', 'steam');
      p.bassLine(chord, t, calm ? [[0, 14, 0.45]] : [[0, 12, 0.5], [12, 4, 0.32, 7]], 39);
      p.arp(chord, t, calm ? [0, -1, -1, 2, -1, 4, -1, -1] : p.st.arp.map((k, i) => (i % 4 === 3 ? -1 : k)), { lo: 55, vel: 0.34 });
      if (b.i === 0) p.hit('rin', 'bell', t, n === 'intro' ? 0.5 : 0.34, p.key + 36);
      if (p.rng() < (calm ? 0.5 : 0.3)) p.hit('icebell', 'bell', p.pos(t, ((p.rng() * 14) | 0) + 1), 0.3, pickR(p.rng, (p.st.ice ||= scaleNotes(p.key, p.def.scale, 87, 99))));
      if (p.rng() < 0.3) { const at = (p.rng() * 12) | 0, k = 1 + ((p.rng() * 2) | 0); for (let i = 0; i < k; i++) p.hit('bubble', 'perc', p.pos(t, at + i * 2), 0.3 - i * 0.08, p.key + 12 + pickR(p.rng, [0, 7])); }
      if (!calm && b.i % 2 === 1) p.hit('pon', 'perc', p.pos(t, 8), 0.26);
      if (calm && b.i % 2 === 0) p.note('gust', 'wind', p.pos(t, 4), 78, 0.3, p.barDur * 1.2);
      if (n === 'B' && b.i % 2 === 0) p.note('glass', 'glass', p.pos(t, 4), colour(p, chord, 70), 0.4, p.barDur * 1.4);
      if (p.intensity) {
        p.pat(t, 'X.....x.X.......', 'taiko', 'drive', 0.45);
        p.pat(t, 'x.x.x.x.x.x.x.x.', 'shime', 'drive', 0.24);
        const lad = p.ladder(chord, 63, 5);
        for (let i = 0; i < 8; i++) p.note('glock', 'drive', p.pos(t, i * 2), lad[[0, 2, 1, 3, 0, 2, 4, 3][i]], 0.3, 0.3);
        const r = fold(root, 46);
        for (const i of [0, 3, 6, 10]) p.note('koto', 'drive', p.pos(t, i), r + (i === 6 ? 7 : 0), 0.28, p.s16 * 1.5, { damp: true });
      }
      if (!b.mel) return;
      if (sec.lead === 'glock') {
        const v = n === 'rest' ? 0.6 - b.i * 0.12 : 0.8;
        p.melody(b.mel, t, 'glock', 'box', v);
        p.melody(b.mel, t, 'kalimba', 'box', v * 0.4); // the comb's body under the tine
      } else {
        p.melody(b.mel, t, 'koto', 'koto', 0.8);
        if (n === 'A2') p.melody(b.mel, t, 'glock', 'box', 0.34, { oct: 12 });
      }
      if (n === 'A' && b.i % 4 !== 1) answer(p, b, 'koto', 'koto', 67, 0.34);
    },
  },

  // Region bosses (bossTrack flavours, see the helpers above the track list).
  boss_bamboo: bossTrack({ bpm: 150, key: 54, scale: [0, 2, 3, 7, 8], kit: 'taiko', riff: 'bamboo', riffVol: 1.2, riffOct: 12, lead: ['fue', 'shakuhachi'], counter: 'koto', progs: HIRA_PROG, gain: 1.1, gong: 42, lo: 71, hi: 88, extra: tenguExtra }),
  boss_maple: { ...bossTrack({ bpm: 140, key: 62, scale: [0, 3, 5, 7, 10], kit: 'taiko', riff: 'shamisen', riffVol: 0.95, lead: ['fue', 'koto'], leadVol: 1.15, counter: 'marimba', progs: TANUKI_PROG, gain: 0.9, gong: 38, lo: 69, hi: 86, extra: tanukiExtra }), swing: 0.14 },
  boss_tidepool: bossTrack({ bpm: 128, key: 57, scale: [0, 2, 3, 5, 7, 10], kit: 'taiko', riff: 'pizz', riffVol: 0.9, lead: ['brass', 'shakuhachi'], counter: 'steelpan', pad: 'ooh', progs: SEA_PROG, gain: 0.93, gong: 33, lo: 69, hi: 86, extra: umiExtra }),
  boss_onsen: bossTrack({ bpm: 132, key: 63, scale: [0, 1, 5, 7, 8], kit: 'taiko', riff: 'icicle', riffVol: 1.05, riffOct: 12, lead: ['glass', 'koto'], leadVol: 1.1, counter: 'glock', pad: 'steam', progs: YUKI_PROG, gain: 1.0, gong: 39, lo: 70, hi: 87, extra: yukiExtra }),
};

export const TRACK_NAMES = Object.keys(TRACKS);

// Which theme plays where. The Burrow's floor theme comes from gen.js THEMES keys (layout.theme).
export const BIOME_TRACKS = { burrow: 'dungeon', shrine: 'dungeon_shrine', kitchen: 'dungeon_kitchen', crystal: 'dungeon_crystal', moon: 'dungeon_moon',
  bamboo: 'region_bamboo', maple: 'region_maple', tidepool: 'region_tidepool', onsen: 'region_onsen', // + the outdoor regions (layout.theme = region id)
  bambooCave: 'region_bamboo', mapleHalls: 'region_maple', seaCave: 'region_tidepool', iceCavern: 'region_onsen' }; // + the zone dungeons (their kit's theme key): the zone's own theme underground
export const BOSS_TRACKS = { burrow: 'boss_burrow', shrine: 'boss', kitchen: 'boss_kitchen', crystal: 'boss', moon: 'boss_moon',
  bamboo: 'boss_bamboo', maple: 'boss_maple', tidepool: 'boss_tidepool', onsen: 'boss_onsen', bambooCave: 'boss_bamboo', mapleHalls: 'boss_maple', seaCave: 'boss_tidepool', iceCavern: 'boss_onsen' };

// ------------------------------------------------------------------------------------------ stings
// One-shot cues on the music bus (so they follow the music volume and sit in the music reverb).
// def.play(p, t) schedules everything; def.len = seconds until the cue has musically finished (tail rings on).
export const STINGS = {
  // Boss defeated: shime roll → "ta-da!" (brass + koto strum + taiko + kane) → flute fanfare over I–IV–V–I,
  // harp glissando, bells and celesta sparkles on the last chord. C major.
  victory: {
    bpm: 120, key: 60, len: 4.1, gain: 1.05,
    mix: {
      brass: { vol: 0.7, rev: 0.35, pan: 0.12 }, flute: { vol: 0.9, rev: 0.45, echo: 0.1, pan: 0.05 }, koto: { vol: 0.75, rev: 0.4, pan: -0.2 },
      mar: { vol: 0.6, rev: 0.3, pan: 0.25 }, perc: { vol: 0.8, rev: 0.25 }, bell: { vol: 0.5, rev: 0.7, pan: -0.2 }, pad: { vol: 0.5, rev: 0.6 },
      bass: { vol: 0.7, rev: 0.1 }, harp: { vol: 0.5, rev: 0.6, pan: 0.3 },
    },
    play(p, t) {
      const k = p.key, S = p.s16, T = i => t + p.beat + i * S;
      p.note('roll', 'perc', t + 0.02, 0, 0.75, p.beat * 0.9);
      const stab = (at, root, len, v = 0.75) => { for (const x of [0, 4, 7]) p.note('brass', 'brass', T(at), fold(k + root + x, 60), v, len * S); };
      stab(0, 0, 3); stab(8, 5, 2, 0.6); stab(12, 7, 2, 0.65); stab(16, 0, 10, 0.8);
      for (const [at, r, len] of [[0, 0, 8], [8, 5, 4], [12, 7, 4], [16, 0, 12]]) p.note('bass', 'bass', T(at), fold(k + r, 36), 0.85, len * S);
      for (const at of [0, 16]) [0, 4, 7, 12].forEach((x, j) => p.note('koto', 'koto', T(at) + j * 0.022, k + x, 0.7, 1));
      for (const [at, v] of [[0, 1], [8, 0.6], [12, 0.6], [14, 0.7], [16, 1]]) p.hit('taiko', 'perc', T(at), v);
      p.hit('kane', 'perc', T(0), 0.6); p.hit('kane', 'perc', T(16), 0.8);
      const mel = [[0, 67, 2], [2, 72, 2], [4, 76, 2], [6, 79, 2], [8, 81, 3], [11, 79, 1], [12, 83, 2], [14, 86, 2], [16, 84, 12]];
      for (const [at, m, len] of mel) { p.note('flute', 'flute', T(at), m, 0.9, len * S * 0.95); p.note('marimba', 'mar', T(at), m - 12, 0.55, 0.3); }
      p.padChord({ root: 0, iv: [0, 4, 7, 14] }, T(16), 12 * S, 0.7, 60);
      [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96].forEach((m, i) => p.note('harp', 'harp', T(16) + i * 0.035, m, 0.5, 1));
      p.hit('rin', 'bell', T(16), 0.6, 96); p.hit('glock', 'bell', T(16) + 0.05, 0.4, 91);
      for (let i = 0; i < 6; i++) p.hit('glock', 'bell', T(18) + i * 0.16 + p.rng() * 0.05, 0.28 - i * 0.03, pickR(p.rng, [96, 98, 100, 103]));
    },
  },
};
export const STING_NAMES = Object.keys(STINGS);
