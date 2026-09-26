// Musical instruments for the generative music engine. Signature:
//   INST[name](ctx, dest, t, midi, vel 0..1, dur seconds, opts) → end time
// Levels are balanced so vel≈0.8 on any melodic instrument sits around the same loudness.
import { Voice, mtof, clamp } from './core.js';

const V = (ctx, dest, t) => new Voice(ctx, { dry: dest, wet: null }, t, 1);

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
};
