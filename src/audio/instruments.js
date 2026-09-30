// Musical instruments for the generative music engine. Signature:
//   INST[name](ctx, dest, t, midi, vel 0..1, dur seconds, opts) → end time
// Levels are balanced so vel≈0.8 on any melodic instrument sits around the same loudness.
import { Voice, mtof, clamp, hitBuffer, HIT_BASE } from './core.js';

const V = (ctx, dest, t) => new Voice(ctx, { dry: dest, wet: null }, t, 1);
// Cached one-shot buffer (core.js hitBuffer) → 2 nodes per hit. m (midi) re-pitches it via playbackRate.
function oneShot(ctx, dest, t, kind, m, v) {
  const b = hitBuffer(ctx.sampleRate, kind), src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = b; if (m) src.playbackRate.value = mtof(m) / HIT_BASE[kind];
  g.gain.value = v; src.connect(g); g.connect(dest); src.start(t);
  return t + b.duration / src.playbackRate.value;
}

export const INST = {
  // Koto: bright KS pluck + nail (tsume) click. opts.yuri = gentle pitch waver on long notes.
  koto(ctx, dest, t, m, vel, dur, o = {}) {
    const s = V(ctx, dest, t);
    const bend = o.yuri ? [[0.22, 0], [0.34, 0.3], [0.48, 0], [0.62, 0.25], [0.78, 0]] : o.bend;
    s.pluck({ m, kind: 'koto', v: 0.7 * vel, lp: 1800 + 3200 * vel, lq: 0, bend, dur: o.damp ? dur : undefined });
    s.noise({ f: 3800, q: 1.4, a: 0.001, d: 0.014, v: 0.05 * vel, fixed: true });
    return s.end;
  },
  // Harp-like soft koto for accompaniment arpeggios.
  harp(ctx, dest, t, m, vel, dur, o = {}) {
    const s = V(ctx, dest, t);
    s.pluck({ m, kind: 'harp', v: 0.5 * vel, lp: 1400 + 1800 * vel, lq: 0, dur: o.damp ? dur : undefined });
    return s.end;
  },
  // Shamisen: twangy bright KS + bachi hitting the skin.
  shamisen(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t);
    s.pluck({ m, kind: 'shamisen', v: 0.6 * vel, lp: 2600 + 1400 * vel, lq: 1, dur: Math.max(0.12, dur * 1.3) });
    s.noise({ f: 1700, q: 1.3, a: 0.001, d: 0.035, v: 0.16 * vel, fixed: true });
    s.tone({ f: 200, f2: 150, a: 0.001, d: 0.05, v: 0.1 * vel, fixed: true });
    return s.end;
  },
  marimba(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), f = mtof(m), d = clamp(0.9 * Math.pow(440 / f, 0.5), 0.25, 1.3);
    s.tone({ f, a: 0.002, d, v: 0.42 * vel });
    s.tone({ f: f * 3.98, a: 0.001, d: d * 0.16, v: 0.1 * vel });
    s.tone({ f: f * 9.2, a: 0.001, d: 0.025, v: 0.025 * vel });
    s.noise({ ft: 'lowpass', f: 2200, a: 0.001, d: 0.012, v: 0.06 * vel });
    return s.end;
  },
  kalimba(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), f = mtof(m), d = clamp(1.3 * Math.pow(440 / f, 0.4), 0.4, 1.8);
    s.fm({ f, ratio: 1, index: 1.1, id: 0.05, a: 0.002, d, v: 0.4 * vel });
    s.tone({ f: f * 3.01, a: 0.001, d: 0.1, v: 0.05 * vel });
    s.noise({ f: 2400, q: 2, a: 0.001, d: 0.01, v: 0.05 * vel });
    return s.end;
  },
  // Celesta / music box.
  glock(ctx, dest, t, m, vel, dur, o = {}) {
    const s = V(ctx, dest, t);
    s.bell({ f: mtof(m), d: o.d ?? 1.4, v: 0.2 * vel, partials: [[1, 1, 1], [2, 0.28, 0.4], [3, 0.1, 0.22], [5.4, 0.05, 0.1]] });
    return s.end;
  },
  // Shakuhachi-ish flute: sine+triangle body, breath noise, scoop into the note, delayed vibrato, chiff.
  flute(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), f = mtof(m), a = 0.07, hold = Math.max(0.04, dur - a), rel = 0.22;
    const pts = [[0, f * 0.97], [0.09, f]];
    s.tone({ pts, stack: [['sine', 0, 1], ['triangle', 3, 0.28]], a, h: hold, d: rel, lin: true, v: 0.15 * vel, vib: [5.2, 16, 0.28], lp: 2600, lq: 0 });
    s.noise({ f: f * 2, q: 5, a: 0.05, h: hold, d: rel, lin: true, v: 0.35 * vel });
    s.noise({ ft: 'highpass', f: 3500, a: 0.008, d: 0.07, v: 0.06 * vel });
    return s.end;
  },
  // Warm pad voice (one note of a chord).
  pad(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), a = Math.min(0.9, dur * 0.35);
    s.tone({ f: mtof(m), stack: [['triangle', -7, 0.5], ['triangle', 7, 0.5], ['sine', 0, 0.6]], a, h: Math.max(0, dur - a), d: 1.3, lin: true, v: 0.07 * vel, lp: 1100, lq: -3 });
    return s.end;
  },
  // Darker pad for the dungeon.
  darkpad(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), a = Math.min(1.4, dur * 0.4);
    s.tone({ f: mtof(m), stack: [['sawtooth', -9, 0.35], ['sawtooth', 9, 0.35], ['sine', 0, 0.8]], a, h: Math.max(0, dur - a), d: 1.6, lin: true, v: 0.06 * vel, lp: 650, lq: 2 });
    return s.end;
  },
  bass(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t);
    s.tone({ f: mtof(m), stack: [['sine', 0, 1], ['triangle', 0, 0.3]], a: 0.01, h: dur * 0.4, d: dur * 0.6 + 0.25, v: 0.19 * vel, lp: 650, lq: 0 });
    return s.end;
  },
  pizz(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t);
    s.pluck({ m, kind: 'pizz', v: 0.7 * vel, lp: 1400, lq: 0, dur: Math.max(0.12, dur) });
    s.tone({ f: mtof(m), a: 0.004, d: 0.18, v: 0.25 * vel });
    return s.end;
  },
  synthbass(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t);
    s.tone({ f: mtof(m), stack: [['sawtooth', -4, 0.5], ['square', 4, 0.25], ['sine', 0, 0.9, 0.5]], a: 0.004, h: dur * 0.5, d: dur * 0.5 + 0.08,
      v: 0.14 * vel, lp: 1500, lp2: 380, lt: 0.14, lq: 3 });
    return s.end;
  },
  // ---- percussion (midi ignored unless noted)
  taiko(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.tone({ pts: [[0, 96], [0.12, 60]], a: 0.002, d: 0.7, v: 0.48 * vel });
    s.tone({ pts: [[0, 190], [0.05, 115]], type: 'triangle', a: 0.001, d: 0.12, v: 0.16 * vel });
    s.noise({ ft: 'lowpass', f: 700, a: 0.001, d: 0.12, v: 0.4 * vel });
    s.noise({ f: 1300, q: 1, a: 0.001, d: 0.02, v: 0.14 * vel });
    return s.end;
  },
  ka(ctx, dest, t, m, vel) { // rim / wood
    const s = V(ctx, dest, t);
    s.tone({ f: 1850, type: 'triangle', a: 0.001, d: 0.03, v: 0.16 * vel });
    s.noise({ f: 2900, q: 3, a: 0.001, d: 0.025, v: 0.3 * vel });
    return s.end;
  },
  shime(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.tone({ pts: [[0, 470], [0.04, 385]], a: 0.001, d: 0.13, v: 0.3 * vel });
    s.noise({ f: 2100, q: 1.4, a: 0.001, d: 0.035, v: 0.3 * vel });
    return s.end;
  },
  pon(ctx, dest, t, m, vel) { // kotsuzumi — the cute rising "pon~"
    const s = V(ctx, dest, t);
    s.tone({ pts: [[0, 300], [0.1, 430]], a: 0.003, d: 0.38, v: 0.34 * vel });
    s.noise({ f: 1300, q: 2, a: 0.001, d: 0.02, v: 0.12 * vel });
    return s.end;
  },
  kane(ctx, dest, t, m, vel) { // atarigane "chan"
    const s = V(ctx, dest, t);
    s.fm({ f: 1760, ratio: 1.47, index: 2.2, id: 0.04, index2: 0.3, a: 0.001, d: 0.28, v: 0.08 * vel, hp: 900 });
    return s.end;
  },
  rin(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.bell({ f: mtof(m || 84), d: 2.8, v: 0.1 * vel, partials: [[1, 1, 1], [2.71, 0.45, 0.55], [5.2, 0.18, 0.3], [8.3, 0.05, 0.15]] });
    return s.end;
  },
  chime(ctx, dest, t, m, vel) { // furin glass bell
    const s = V(ctx, dest, t);
    s.bell({ f: mtof(m), d: 1.8, v: 0.1 * vel });
    return s.end;
  },
  shaker(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.noise({ ft: 'highpass', f: 5000, a: 0.008, d: 0.055, v: 0.32 * vel, lp: 10000 });
    return s.end;
  },
  woodblock(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.tone({ f: m ? mtof(m) : 1050, a: 0.001, d: 0.06, v: 0.28 * vel });
    s.tone({ f: (m ? mtof(m) : 1050) * 2.41, a: 0.001, d: 0.02, v: 0.07 * vel });
    return s.end;
  },
  kick(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.tone({ pts: [[0, 120], [0.08, 48]], a: 0.002, d: 0.3, v: 0.6 * vel });
    s.noise({ ft: 'lowpass', f: 900, a: 0.001, d: 0.02, v: 0.12 * vel });
    return s.end;
  },
  snap(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.noise({ f: 2300, q: 2.2, a: 0.001, d: 0.045, v: 0.6 * vel });
    s.tone({ f: 1500, a: 0.001, d: 0.015, v: 0.06 * vel });
    return s.end;
  },
  tick(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.tone({ f: m ? mtof(m) : 2600, a: 0.001, d: 0.022, v: 0.25 * vel });
    return s.end;
  },
  drip(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), f = mtof(m);
    s.tone({ pts: [[0, f], [0.02, f * 1.5]], a: 0.001, d: 0.12, v: 0.32 * vel });
    return s.end;
  },
  heartbeat(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.tone({ pts: [[0, 92], [0.1, 56]], a: 0.004, d: 0.3, v: 0.5 * vel, lp: 240 });
    s.tone({ pts: [[0, 184], [0.08, 112]], type: 'triangle', a: 0.003, d: 0.14, v: 0.16 * vel, lp: 420 });
    return s.end;
  },

  // ---- biome / boss instruments
  // Shakuhachi: breathier & rounder than the flute — "meri" scoop from below, strong breath band, slow wide vibrato,
  // a puff of air ("muraiki") on accented notes (opts.puff).
  shakuhachi(ctx, dest, t, m, vel, dur, o = {}) {
    const s = V(ctx, dest, t), f = mtof(m), a = 0.11, hold = Math.max(0.05, dur - a), rel = 0.3;
    s.tone({ pts: [[0, f * 0.94], [0.16, f * 1.004], [0.3, f]], stack: [['sine', 0, 1], ['triangle', 4, 0.2]], a, h: hold, d: rel, lin: true, v: 0.15 * vel, vib: [4.3, 22, 0.42], lp: 1900, lq: 0 });
    s.noise({ f: f * 1.02, q: 3.5, a: 0.06, h: hold, d: rel, lin: true, v: 0.5 * vel, am: [4.3, 0.25] });
    s.noise({ ft: 'bandpass', f: 1400, q: 0.8, a: 0.02, d: o.puff ? 0.22 : 0.09, v: (o.puff ? 0.1 : 0.04) * vel });
    return s.end;
  },
  // Tuned soup pot / steel-pan lead: harmonic partials with a quick bright blush and a soft mallet tick.
  steelpan(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), f = mtof(m), d = clamp(0.95 * Math.pow(440 / f, 0.35), 0.35, 1.2);
    s.tone({ f, a: 0.003, d, v: 0.3 * vel });
    s.tone({ f: f * 2.0, detune: 6, a: 0.002, d: d * 0.45, v: 0.13 * vel });
    s.tone({ f: f * 3.0, detune: -8, a: 0.002, d: d * 0.2, v: 0.05 * vel });
    s.noise({ ft: 'lowpass', f: 2600, a: 0.001, d: 0.012, v: 0.05 * vel });
    return s.end;
  },
  // Kitchenware percussion (cached buffers). m re-pitches (default = the buffer's own pitch).
  pot(ctx, dest, t, m, vel) { return oneShot(ctx, dest, t, 'pot', m, 0.34 * vel); },
  pan(ctx, dest, t, m, vel) { return oneShot(ctx, dest, t, 'pan', m, 0.2 * vel); },
  lid(ctx, dest, t, m, vel) { return oneShot(ctx, dest, t, 'lid', m, 0.11 * vel); },
  spoon(ctx, dest, t, m, vel) { return oneShot(ctx, dest, t, 'spoon', m, 0.22 * vel); },
  bowl(ctx, dest, t, m, vel) { return oneShot(ctx, dest, t, 'bowl', m, 0.12 * vel); },
  // Stew bubble: a round rising blip.
  bubble(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), f = m ? mtof(m) : 420;
    s.tone({ pts: [[0, f], [0.05, f * 1.9]], a: 0.004, d: 0.07, v: 0.22 * vel, lp: 2400 });
    return s.end;
  },
  // Glass harmonica: pure partials, slow bloom, gentle tremolo. Crystal Grotto pads & leads.
  glass(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), f = mtof(m), a = Math.min(0.35, 0.1 + dur * 0.12);
    s.tone({ f, stack: [['sine', 0, 1], ['sine', 4, 0.22, 2], ['sine', -3, 0.08, 3]], a, h: Math.max(0.02, dur - a), d: 1.1, lin: true, v: 0.12 * vel, am: [5.2, 0.14] });
    return s.end;
  },
  // Soft "ooh" choir pad (Moonlit Sanctum): detuned triangles through a vowel-ish resonant lowpass.
  ooh(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), a = Math.min(1.1, dur * 0.4);
    s.tone({ f: mtof(m), stack: [['triangle', -6, 0.5], ['triangle', 6, 0.5], ['sine', 0, 0.5]], a, h: Math.max(0, dur - a), d: 1.5, lin: true, v: 0.085 * vel, lp: 820, lq: 5, vib: [4.6, 9, 0.3] });
    return s.end;
  },
  // Round brassy stab for fanfares ("bwah").
  brass(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), f = mtof(m), h = Math.max(0.02, dur * 0.7);
    s.tone({ f, stack: [['sawtooth', -5, 0.5], ['sawtooth', 5, 0.5], ['triangle', 0, 0.6]], a: 0.025, h, d: 0.22, v: 0.085 * vel, lp: 700, lp2: 2300, lt: 0.07, lq: 2, vib: [5.5, 8, 0.25] });
    return s.end;
  },
  // Temple gong / big hit for phase changes.
  gong(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), f = m ? mtof(m) : 98;
    s.fm({ f, ratio: 1.41, index: 2.6, id: 0.5, index2: 0.4, a: 0.004, d: 3.2, v: 0.2 * vel, lp: 1600 });
    s.tone({ f: f * 0.5, a: 0.01, d: 1.6, v: 0.18 * vel });
    s.noise({ ft: 'lowpass', f: 900, a: 0.002, d: 0.25, v: 0.18 * vel, color: 'pink' });
    return s.end;
  },
  // Squishy mochi "boing" (King Mochi).
  boing(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), f = m ? mtof(m) : 220;
    s.tone({ pts: [[0, f * 0.8], [0.05, f * 1.7], [0.16, f * 1.25]], a: 0.004, d: 0.2, v: 0.2 * vel, lp: 1400, lq: 6 });
    return s.end;
  },
  // Slide whistle (kitchen mischief). opts.down = falling.
  slide(ctx, dest, t, m, vel, dur, o = {}) {
    const s = V(ctx, dest, t), f = mtof(m), up = !o.down;
    s.tone({ pts: [[0, up ? f * 0.5 : f], [dur, up ? f : f * 0.5]], a: 0.03, h: dur * 0.8, d: 0.08, lin: true, v: 0.08 * vel, vib: [6, 14, 0.05], lp: 2200 });
    return s.end;
  },
  // Deep sine drone.
  sub(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), a = Math.min(1.2, dur * 0.3);
    s.tone({ f: mtof(m), a, h: Math.max(0, dur - a), d: 1.2, lin: true, v: 0.2 * vel });
    return s.end;
  },
  // Round "oomp" bass (kitchen oom-pah).
  tuba(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t);
    s.tone({ f: mtof(m), stack: [['sine', 0, 1], ['triangle', 0, 0.45], ['sawtooth', 0, 0.08]], a: 0.018, h: dur * 0.35, d: dur * 0.5 + 0.12, v: 0.2 * vel, lp: 520, lp2: 380, lt: 0.12, lq: 1 });
    return s.end;
  },
  // Noise riser into a phrase (enraged boss); dur = sweep length.
  riser(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t);
    s.noise({ pts: [[0, 420], [dur, 3000]], q: 2.2, a: dur * 0.92, d: 0.06, lin: true, v: 0.2 * vel, color: 'pink' });
    return s.end;
  },
  // Rolled shime burst (crescendo lead-in); dur = roll length.
  roll(ctx, dest, t, m, vel, dur) {
    const n = Math.max(3, Math.round(dur / 0.045));
    let e = t;
    for (let i = 0; i < n; i++) e = INST.shime(ctx, dest, t + (i / n) * dur, 0, vel * (0.35 + 0.65 * (i / n)));
    return e;
  },
  // ---- region instruments (docs/REGIONS.md)
  // Shinobue / nohkan: a bright bamboo transverse flute. Quicker speech than the flute, a reedy upper partial, strong
  // edge noise (festival flute, Tengu). opts.hishigi = the Noh flute's piercing overblown shriek (a fast scoop up).
  fue(ctx, dest, t, m, vel, dur, o = {}) {
    const s = V(ctx, dest, t), f = mtof(m), a = o.hishigi ? 0.06 : 0.035, hold = Math.max(0.03, dur - a), rel = 0.14;
    const pts = o.hishigi ? [[0, f * 0.72], [0.07, f * 1.015], [0.14, f]] : [[0, f * 0.985], [0.05, f]];
    s.tone({ pts, stack: [['sine', 0, 1], ['triangle', 2, 0.42], ['sine', 0, 0.1, 2]], a, h: hold, d: rel, lin: true, v: 0.13 * vel, vib: [5.8, 14, 0.22], lp: 3800, lq: 0 });
    s.noise({ f: f * 2, q: 4, a: 0.03, h: hold, d: rel, lin: true, v: 0.26 * vel });
    s.noise({ ft: 'highpass', f: 3800, a: 0.004, d: 0.045, v: 0.06 * vel });
    return s.end;
  },
  // Tuned bamboo tube knock (kokiriko / shishi-odoshi "tok"): a hollow tone with the odd harmonic of a closed tube.
  bamboo(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), f = m ? mtof(m) : 620;
    s.tone({ pts: [[0, f * 1.06], [0.012, f]], a: 0.001, d: 0.16, v: 0.3 * vel });
    s.tone({ f: f * 3.01, a: 0.001, d: 0.035, v: 0.06 * vel });
    s.noise({ f: Math.min(f * 4, 5000), q: 2.5, a: 0.001, d: 0.012, v: 0.13 * vel });
    return s.end;
  },
  // Tanuki belly drum (Danzaburō): a huge round "pon~" that bends up like a kotsuzumi, and the palm slap. m re-pitches.
  belly(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t), k = m ? mtof(m) / 92 : 1;
    s.tone({ pts: [[0, 92 * k], [0.05, 132 * k], [0.35, 118 * k]], a: 0.004, d: 0.55, v: 0.5 * vel });
    s.tone({ pts: [[0, 185 * k], [0.05, 262 * k]], type: 'triangle', a: 0.002, d: 0.12, v: 0.1 * vel, lp: 900 });
    s.noise({ ft: 'lowpass', f: 650, a: 0.002, d: 0.06, v: 0.35 * vel, color: 'pink' });
    return s.end;
  },
  // Ōdaiko: the huge festival drum (Umibōzu, the storms) — a slow, deep boom with a long body.
  odaiko(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.tone({ pts: [[0, 74], [0.25, 45]], a: 0.003, d: 1.4, v: 0.5 * vel });
    s.tone({ pts: [[0, 150], [0.08, 88]], type: 'triangle', a: 0.002, d: 0.28, v: 0.13 * vel, lp: 700 });
    s.noise({ ft: 'lowpass', f: 420, a: 0.002, d: 0.3, v: 0.36 * vel, color: 'brown' });
    s.noise({ f: 1100, q: 1, a: 0.001, d: 0.03, v: 0.11 * vel });
    return s.end;
  },
  // Warm "steam" pad (Yukimi Onsen): the pad's triangles breathing slowly, with a soft breath band above each note.
  steam(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), f = mtof(m), a = Math.min(1.6, dur * 0.45), h = Math.max(0, dur - a);
    s.tone({ f, stack: [['triangle', -8, 0.5], ['triangle', 8, 0.5], ['sine', 0, 0.7]], a, h, d: 1.8, lin: true, v: 0.07 * vel, lp: 950, lq: -2, am: [0.3, 0.12] });
    s.noise({ f: f * 3, q: 7, a: a * 1.2, h, d: 1.6, lin: true, v: 0.1 * vel, color: 'pink' });
    return s.end;
  },
  // A gust of wind as an instrument (Tengu): a band of noise swelling up and away; m = the peak frequency, dur = length.
  gust(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), f = m ? mtof(m) : 1200, d = Math.max(0.4, dur);
    s.noise({ pts: [[0, f * 0.35], [d * 0.55, f], [d, f * 0.5]], q: 2.2, a: d * 0.5, h: d * 0.1, d: d * 0.4, lin: true, v: 0.22 * vel, color: 'pink' });
    s.noise({ pts: [[0, f * 0.8], [d * 0.55, f * 2], [d, f]], q: 7, a: d * 0.5, h: d * 0.1, d: d * 0.4, lin: true, v: 0.05 * vel });
    return s.end;
  },
  // An ocean surge (Umibōzu): brown noise opening up as the swell rises, a fizz of foam as it crests; dur = swell length.
  surge(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), d = Math.max(0.8, dur);
    s.noise({ ft: 'lowpass', pts: [[0, 180], [d * 0.6, 900], [d, 260]], q: 0.8, a: d * 0.6, d: d * 0.4 + 0.5, lin: true, v: 0.35 * vel, color: 'brown' });
    s.noise({ ft: 'highpass', f: 2500, a: d * 0.62, d: d * 0.35 + 0.8, v: 0.03 * vel, lp: 6000 });
    return s.end;
  },
  // Blizzard swirl (Yuki-onna): a whirling band of icy noise; dur = length.
  blizzard(ctx, dest, t, m, vel, dur) {
    const s = V(ctx, dest, t), d = Math.max(0.5, dur);
    s.noise({ pts: [[0, 1800], [d * 0.5, 4200], [d, 2200]], q: 1.4, a: d * 0.45, h: d * 0.1, d: d * 0.45, lin: true, v: 0.1 * vel, am: [6.5, 0.45] });
    s.noise({ pts: [[0, 650], [d * 0.5, 1300], [d, 750]], q: 3, a: d * 0.5, d: d * 0.5, lin: true, v: 0.09 * vel, color: 'pink', am: [4.1, 0.3] });
    return s.end;
  },
  // Ice bell: an eerie glassy bell whose partials come in slowly beating pairs (Yuki-onna, snowflake glints).
  icebell(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.bell({ f: mtof(m), d: 2.2, v: 0.085 * vel, partials: [[1, 1, 1], [1.0035, 0.7, 0.9], [2.41, 0.3, 0.45], [2.418, 0.2, 0.4], [4.9, 0.08, 0.2], [7.2, 0.03, 0.12]] });
    return s.end;
  },
  // Icicle metallophone (Yuki-onna's ostinato): a struck glassy bar with a free bar's inharmonic partials (1, 2.76, 5.4,
  // 8.93) that dies fast, and a tiny tick of ice on the strike. Cold where the marimba is warm.
  icicle(ctx, dest, t, m, vel) {
    const s = V(ctx, dest, t);
    s.bell({ f: mtof(m), d: 0.55, v: 0.2 * vel, partials: [[1, 1, 1], [2.76, 0.55, 0.45], [5.4, 0.26, 0.22], [8.93, 0.09, 0.12]] });
    s.noise({ ft: 'highpass', f: 5200, a: 0.001, d: 0.01, v: 0.04 * vel });
    return s.end;
  },
};

// ------------------------------------------------------------------------------------------ pre-render cache
// Mallets and percussion scale linearly with velocity and ignore `dur`, so one rendering per (instrument, midi) is exact:
// the first request queues a background OfflineAudioContext render (audio thread, no main-thread synthesis) and plays
// the live synth version meanwhile; afterwards every note is a 2-node buffer playback instead of 6–16 live nodes.
// Noisy percussion keeps 3 round-robin takes so 16th patterns don't machine-gun. Notes are rendered at half the context
// rate (the music bus low-passes at 7.5 kHz anyway), tails past ≈ -45 dB are faded off, and the cache is LRU-capped at
// 2.5 M samples (≈ 10 MB).
const CACHE = { // instrument → [buffer seconds, takes]
  marimba: [1.1, 1], kalimba: [1.4, 1], glock: [1.2, 1], steelpan: [1.1, 1], chime: [1.5, 1], rin: [2.2, 1], drip: [0.15, 1],
  taiko: [0.7, 2], shime: [0.2, 3], ka: [0.07, 3], kane: [0.36, 2], pon: [0.45, 2], shaker: [0.09, 3], tick: [0.05, 1],
  woodblock: [0.1, 2], heartbeat: [0.36, 1], snap: [0.07, 3], kick: [0.34, 1], bubble: [0.1, 1], boing: [0.24, 1],
  bamboo: [0.2, 2], belly: [0.62, 2], odaiko: [1.6, 2], icebell: [2.4, 1], icicle: [0.6, 1],
};
const RAW = {}, pre = new Map(), queue = [], MAX_SAMPLES = 2.5e6;
let cachedSamples = 0, pumping = false, rr = 0;
async function pump() {
  if (pumping) return; pumping = true;
  while (queue.length) {
    const [sr, inst, m, key] = queue.shift();
    try {
      const rsr = Math.max(22050, Math.round(sr / 2)), len = Math.ceil(rsr * CACHE[inst][0]);
      const o = new OfflineAudioContext(1, len, rsr);
      RAW[inst](o, o.destination, 0, m, 1, 0.3);
      const b = await o.startRendering(), d = b.getChannelData(0), f = Math.min(len, Math.floor(rsr * 0.06));
      for (let i = 0; i < f; i++) d[len - f + i] *= 1 - i / f;
      pre.set(key, b); cachedSamples += b.length;
      for (const [kk, v] of pre) { if (cachedSamples <= MAX_SAMPLES) break; if (v !== 1) { cachedSamples -= v.length; pre.delete(kk); } }
    } catch { pre.delete(key); }
  }
  pumping = false;
}
export const cacheOpts = { offline: false }; // offline: also serve cached notes to OfflineAudioContexts (cost profiling)
function cachedNote(ctx, inst, m) {
  if (typeof OfflineAudioContext === 'undefined' || (ctx instanceof OfflineAudioContext && !cacheOpts.offline)) return null; // render checks stay exact & synchronous
  const takes = CACHE[inst][1], k = takes > 1 ? rr++ % takes : 0, key = `${ctx.sampleRate}|${inst}|${m | 0}|${k}`;
  const b = pre.get(key);
  if (b && b !== 1) { pre.delete(key); pre.set(key, b); return b; } // LRU touch
  if (!b) { pre.set(key, 1); queue.push([ctx.sampleRate, inst, m | 0, key]); pump(); }
  return null;
}
for (const inst of Object.keys(CACHE)) {
  const raw = (RAW[inst] = INST[inst]);
  INST[inst] = (ctx, dest, t, m, vel, dur, o) => {
    if (m && m !== (m | 0)) return raw(ctx, dest, t, m, vel, dur, o); // microtonal → live
    const b = cachedNote(ctx, inst, m);
    if (!b) return raw(ctx, dest, t, m, vel, dur, o);
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b; g.gain.value = vel; src.connect(g); g.connect(dest); src.start(t);
    return t + b.duration;
  };
}
export const cacheStats = () => ({ buffers: [...pre.values()].filter(v => v !== 1).length, samples: cachedSamples, queued: queue.length });
