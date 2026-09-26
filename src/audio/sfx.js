// Procedural SFX library. Each entry: { fn(voice, opts), vary, max, gap, trim }
//   fn    builds the sound on a Voice (core.js) — times are relative, frequencies are scaled by the voice pitch P
//   vary  random pitch variation per call (±fraction)      max  max simultaneous voices of this sound
//   gap   min seconds between retriggers                   trim level trim (calibrated with the ?test=audio render check)
// Aesthetic: soft, round and cute — sine/triangle bodies, low-passed noise, pentatonic sparkles, bonks & boings.
import { babble, gibberish } from './babble.js';

const R = (a, b) => a + Math.random() * (b - a);
const PON = { pts: [[0, 300], [0.1, 430]], a: 0.003, d: 0.38 }; // kotsuzumi "pon~"

export const SFX = {
  // ------------------------------------------------------------------------------------------ UI
  ui_hover: { vary: 0.03, max: 2, gap: 0.035, fn(s) {
    s.tone({ f: 2200, a: 0.002, d: 0.035, v: 0.12 });
    s.tone({ f: 3300, a: 0.001, d: 0.015, v: 0.03 });
  } },
  ui_click: { vary: 0.04, max: 3, gap: 0.03, fn(s) {
    s.tone({ f: 1250, f2: 820, glide: 0.03, a: 0.001, d: 0.06, v: 0.34 });
    s.tone({ f: 2600, type: 'triangle', a: 0.001, d: 0.012, v: 0.06 });
    s.noise({ f: 3200, q: 2, a: 0.001, d: 0.012, v: 0.2 });
  } },
  ui_open: { vary: 0.02, fn(s) {
    s.tone({ f: 420, f2: 900, glide: 0.09, a: 0.004, d: 0.14, v: 0.3 });
    s.noise({ f: 1500, f2: 4200, q: 1.2, a: 0.03, d: 0.12, v: 0.2 });
    s.bell({ at: 0.06, f: 1318, d: 0.55, v: 0.12, rev: 0.3 });
    s.bell({ at: 0.11, f: 1976, d: 0.45, v: 0.07, rev: 0.3 });
  } },
  ui_close: { vary: 0.02, fn(s) {
    s.tone({ f: 900, f2: 420, glide: 0.1, a: 0.004, d: 0.13, v: 0.28 });
    s.noise({ f: 3800, f2: 1300, q: 1.2, a: 0.02, d: 0.1, v: 0.16 });
    s.bell({ at: 0.05, f: 988, d: 0.35, v: 0.08, rev: 0.25 });
  } },
  ui_tab: { vary: 0.05, max: 2, fn(s) {
    s.noise({ f: 2600, q: 0.9, a: 0.004, d: 0.05, v: 0.22 });
    s.tone({ f: 1500, a: 0.001, d: 0.035, v: 0.14 });
    s.tone({ at: 0.03, f: 2000, a: 0.001, d: 0.04, v: 0.08 });
  } },
  ui_error: { vary: 0.01, max: 1, gap: 0.2, fn(s) {
    s.tone({ f: 311, type: 'triangle', a: 0.006, h: 0.05, d: 0.08, v: 0.3, lp: 1400, vib: [18, 30] });
    s.tone({ at: 0.13, f: 233, type: 'triangle', a: 0.006, h: 0.07, d: 0.12, v: 0.3, lp: 1200, vib: [18, 30] });
  } },
  ui_coin: { vary: 0.02, max: 3, fn(s) {
    s.fm({ f: 1976, ratio: 2, index: 1, id: 0.05, a: 0.001, d: 0.09, v: 0.16 });
    s.fm({ at: 0.075, f: 2637, ratio: 2, index: 0.9, id: 0.08, a: 0.001, d: 0.4, v: 0.16, rev: 0.2 });
  } },
  ui_buy: { vary: 0.02, max: 2, fn(s) {
    s.noise({ f: 1800, q: 1.5, a: 0.002, d: 0.05, v: 0.3 });
    s.tone({ f: 700, f2: 500, a: 0.001, d: 0.06, v: 0.15 });
    s.fm({ at: 0.06, f: 2093, ratio: 2, index: 0.9, id: 0.06, a: 0.001, d: 0.12, v: 0.12 });
    s.fm({ at: 0.12, f: 2637, ratio: 2, index: 0.9, id: 0.08, a: 0.001, d: 0.5, v: 0.14, rev: 0.25 });
    s.fm({ at: 0.12, f: 3136, ratio: 2, index: 0.7, id: 0.08, a: 0.001, d: 0.45, v: 0.09, rev: 0.25 });
    s.sparkle({ at: 0.15, n: 3, base: 2637, v: 0.035 });
  } },
  ui_levelup: { vary: 0, max: 1, fn(s) {
    [523, 659, 784, 1046, 1318].forEach((f, i) => s.pluck({ at: i * 0.07, f, kind: 'koto', v: 0.3, rev: 0.3, lp: 5000 }));
    [1046, 1318, 1568, 2093].forEach((f, i) => s.bell({ at: 0.36 + i * 0.012, f, d: 1.4, v: 0.08, rev: 0.45 }));
    s.tone({ at: 0.34, f: 262, stack: [['sine', 0, 1], ['triangle', 5, 0.3]], a: 0.1, h: 0.3, d: 0.9, v: 0.12, rev: 0.4 });
    s.tone({ at: 0.34, f: 392, a: 0.1, h: 0.3, d: 0.9, v: 0.08, rev: 0.4 });
    s.tone({ at: 0.35, ...PON, v: 0.28 });
    s.noise({ at: 0.3, ft: 'highpass', f: 6000, a: 0.25, d: 0.9, v: 0.12, rev: 0.4 });
    s.sparkle({ at: 0.4, n: 7, base: 2093, spread: 0.8, v: 0.045 });
  } },
  ui_learn: { vary: 0.01, max: 1, fn(s) {
    s.tone({ f: 500, f2: 1600, glide: 0.35, type: 'triangle', a: 0.02, h: 0.1, d: 0.35, v: 0.12, vib: [9, 25], lp: 3000, rev: 0.4 });
    [1568, 2093, 2637, 3136].forEach((f, i) => s.bell({ at: 0.15 + i * 0.07, f, d: 0.8, v: 0.08, rev: 0.5 }));
    s.noise({ at: 0.1, f: 1000, f2: 6000, q: 3, a: 0.2, d: 0.5, v: 0.12, rev: 0.4 });
    s.sparkle({ at: 0.45, n: 5, base: 2637, v: 0.04 });
  } },
  ui_equip: { vary: 0.05, max: 2, fn(s) {
    s.noise({ ft: 'lowpass', f: 1400, a: 0.01, d: 0.09, v: 0.35, color: 'pink' });
    s.tone({ f: 330, f2: 230, a: 0.002, d: 0.08, v: 0.22 });
    s.tone({ at: 0.05, f: 1700, a: 0.001, d: 0.03, v: 0.1 });
    s.tone({ at: 0.07, f: 2550, a: 0.001, d: 0.05, v: 0.06 });
  } },
  ui_quest: { vary: 0, max: 1, fn(s) {
    [[0, 67], [0.11, 72], [0.22, 76], [0.33, 79]].forEach(([at, m]) => s.pluck({ at, m, kind: 'koto', v: 0.32, rev: 0.3, lp: 4500 }));
    s.bell({ at: 0.33, f: 1568, d: 1.2, v: 0.08, rev: 0.4 });
    s.bell({ at: 0.35, f: 2093, d: 1.1, v: 0.06, rev: 0.4 });
    s.tone({ ...PON, v: 0.25 });
  } },
  ui_toast: { vary: 0.01, max: 2, fn(s) {
    s.tone({ f: 660, a: 0.005, d: 0.12, v: 0.1 });
    s.bell({ f: 1318, d: 0.5, v: 0.13, rev: 0.25 });
    s.bell({ at: 0.09, f: 1760, d: 0.7, v: 0.13, rev: 0.3 });
  } },

  // ------------------------------------------------------------------------------------------ pickups
  pickup_item: { vary: 0.04, max: 3, fn(s) {
    s.tone({ f: 480, f2: 950, glide: 0.05, a: 0.002, d: 0.07, v: 0.26 });
    s.fm({ at: 0.03, f: 1318, ratio: 1, index: 0.8, id: 0.04, a: 0.001, d: 0.18, v: 0.14 });
    s.fm({ at: 0.09, f: 1760, ratio: 1, index: 0.8, id: 0.04, a: 0.001, d: 0.3, v: 0.14, rev: 0.2 });
  } },
  pickup_gold: { vary: 0.04, max: 4, gap: 0.04, fn(s) {
    const n = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) s.fm({ at: i * 0.05 + Math.random() * 0.015, f: R(2300, 3000), ratio: 2.41, index: 1.3, id: 0.03, a: 0.001, d: R(0.12, 0.2), v: 0.13, pan: R(-0.3, 0.3) });
    s.fm({ at: n * 0.05, f: 3136, ratio: 2, index: 0.7, id: 0.05, a: 0.001, d: 0.3, v: 0.1, rev: 0.25 });
  } },
  pickup_rare: { vary: 0.01, max: 1, fn(s) {
    [1046, 1175, 1318, 1568, 1760, 2093].forEach((f, i) => s.bell({ at: i * 0.045, f, d: 0.6, v: 0.1, rev: 0.45 }));
    s.tone({ at: 0.25, f: 523, stack: [['sine', 0, 1], ['triangle', 6, 0.3]], a: 0.15, h: 0.2, d: 0.9, v: 0.12, rev: 0.4 });
    s.tone({ at: 0.25, f: 784, a: 0.15, h: 0.2, d: 0.9, v: 0.08, rev: 0.4 });
    s.noise({ at: 0.15, ft: 'highpass', f: 7000, a: 0.3, d: 0.8, v: 0.14, am: [14, 0.5], rev: 0.5 });
    s.sparkle({ at: 0.3, n: 8, base: 2093, spread: 1.0, v: 0.05 });
  } },
  drop_item: { vary: 0.08, max: 3, fn(s) {
    s.tone({ f: 190, f2: 95, glide: 0.08, a: 0.002, d: 0.13, v: 0.4 });
    s.noise({ ft: 'lowpass', f: 700, a: 0.001, d: 0.06, v: 0.35, color: 'pink' });
    s.tone({ at: 0.11, f: 170, f2: 110, glide: 0.05, a: 0.002, d: 0.08, v: 0.15 });
  } },

  // ------------------------------------------------------------------------------------------ footsteps
  footstep_grass: { vary: 0.12, max: 3, gap: 0.05, fn(s) {
    s.noise({ f: R(1800, 2800), q: 0.8, a: 0.012, d: 0.07, v: 0.26 });
    s.noise({ ft: 'lowpass', f: 700, a: 0.004, d: 0.05, v: 0.16, color: 'pink' });
  } },
  footstep_stone: { vary: 0.1, max: 3, gap: 0.05, fn(s) {
    s.noise({ f: R(2800, 3800), q: 1.6, a: 0.001, d: 0.03, v: 0.28 });
    s.tone({ f: 230, f2: 170, a: 0.001, d: 0.04, v: 0.16 });
    s.noise({ ft: 'lowpass', f: 500, a: 0.001, d: 0.03, v: 0.15 });
  } },
  footstep_wood: { vary: 0.1, max: 3, gap: 0.05, fn(s) {
    s.tone({ f: 190, f2: 150, type: 'triangle', a: 0.002, d: 0.09, v: 0.3, lp: 900 });
    s.tone({ f: 410, a: 0.001, d: 0.045, v: 0.1 });
    s.noise({ f: 950, q: 3, a: 0.001, d: 0.04, v: 0.3 });
  } },

  // ------------------------------------------------------------------------------------------ combat
  swing: { vary: 0.1, max: 4, gap: 0.04, fn(s) {
    s.noise({ pts: [[0, 500], [0.07, 2300], [0.19, 700]], q: 1.6, a: 0.05, d: 0.14, v: 0.9 });
    s.tone({ pts: [[0, 700], [0.07, 1100], [0.18, 600]], a: 0.04, d: 0.12, v: 0.03 });
  } },
  swing_heavy: { vary: 0.08, max: 3, fn(s) {
    s.noise({ pts: [[0, 300], [0.12, 1500], [0.32, 350]], q: 1.4, a: 0.09, d: 0.24, v: 1.1, color: 'pink' });
    s.tone({ pts: [[0, 110], [0.12, 150], [0.3, 80]], a: 0.08, d: 0.2, v: 0.15 });
  } },
  throw: { vary: 0.1, max: 4, fn(s) {
    s.noise({ pts: [[0, 1100], [0.05, 3200], [0.13, 1500]], q: 2, a: 0.025, d: 0.1, v: 0.7 });
    s.tone({ f: 600, f2: 1300, glide: 0.06, a: 0.005, d: 0.06, v: 0.07 });
  } },
  ball_bounce: { vary: 0.08, max: 4, gap: 0.04, fn(s) {
    s.noise({ f: 1500, q: 2, a: 0.001, d: 0.02, v: 0.5 });
    s.tone({ f: 540, f2: 300, glide: 0.05, a: 0.001, d: 0.07, v: 0.32 });
    s.tone({ at: 0.01, f: 380, f2: 640, glide: 0.12, a: 0.004, d: 0.18, v: 0.07, vib: [22, 40] });
  } },
  hit_flesh: { vary: 0.1, max: 5, gap: 0.03, fn(s) {
    s.tone({ f: 620, f2: 240, glide: 0.08, a: 0.001, d: 0.12, v: 0.45 });
    s.tone({ f: 1240, f2: 480, glide: 0.05, a: 0.001, d: 0.05, v: 0.1 });
    s.noise({ ft: 'lowpass', f: 1500, a: 0.001, d: 0.04, v: 0.45, color: 'pink' });
    s.tone({ at: 0.03, f: 300, f2: 520, glide: 0.14, a: 0.004, d: 0.2, v: 0.08, vib: [16, 60] });
  } },
  hit_crit: { vary: 0.06, max: 3, fn(s) {
    s.tone({ f: 440, f2: 150, glide: 0.12, a: 0.001, d: 0.2, v: 0.5 });
    s.noise({ ft: 'lowpass', f: 2600, f2: 400, a: 0.001, d: 0.12, v: 0.55, color: 'pink' });
    s.tone({ f: 95, f2: 45, glide: 0.2, a: 0.002, d: 0.26, v: 0.22 });
    s.bell({ at: 0.02, f: 2093, d: 0.6, v: 0.12, rev: 0.35 });
    s.bell({ at: 0.07, f: 3136, d: 0.45, v: 0.07, rev: 0.35 });
    s.sparkle({ at: 0.06, n: 3, base: 2637, v: 0.035, spread: 0.2 });
  } },
  monster_hit: { vary: 0.12, max: 5, gap: 0.03, fn(s) {
    s.tone({ f: 340, f2: 170, glide: 0.1, a: 0.002, d: 0.12, v: 0.42 });
    s.noise({ f: 750, f2: 300, q: 2.5, a: 0.002, d: 0.1, v: 0.7 });
    s.tone({ at: 0.015, f: 900, f2: 1250, glide: 0.05, a: 0.002, d: 0.05, v: 0.05 });
  } },
  monster_die: { vary: 0.1, max: 4, fn(s) {
    s.noise({ pts: [[0, 1600], [0.28, 280]], q: 0.9, a: 0.015, d: 0.3, v: 0.8, color: 'pink', rev: 0.2 });
    s.tone({ at: 0.02, f: 1400, f2: 2300, glide: 0.08, type: 'triangle', a: 0.004, d: 0.12, v: 0.13, lp: 4000, vib: [25, 50] });
    s.sparkle({ at: 0.12, n: 3, base: 1568, v: 0.05, spread: 0.25 });
  } },
  slime_bounce: { vary: 0.12, max: 3, gap: 0.05, fn(s) {
    s.tone({ pts: [[0, 200], [0.05, 470], [0.17, 320]], a: 0.004, d: 0.18, v: 0.4, lp: 1400, lq: 6 });
    s.noise({ f: 500, q: 3, a: 0.002, d: 0.05, v: 0.3 });
  } },
  ghost_wail: { vary: 0.08, max: 2, fn(s) {
    s.tone({ pts: [[0, 420], [0.35, 640], [0.9, 520], [1.3, 380]], stack: [['sine', 0, 1], ['triangle', 8, 0.35]], vib: [5.5, 30, 0.15], a: 0.25, h: 0.6, d: 0.55, lin: true, v: 0.2, lp: 1100, rev: 0.6 });
    s.tone({ pts: [[0, 630], [0.35, 960], [0.9, 780], [1.3, 570]], vib: [5.1, 25, 0.2], a: 0.35, h: 0.45, d: 0.55, lin: true, v: 0.06, rev: 0.6 });
    s.noise({ f: 700, q: 4, a: 0.4, h: 0.3, d: 0.6, lin: true, v: 0.15, rev: 0.5 });
  } },
  boss_roar: { vary: 0.04, max: 1, fn(s) {
    s.voice({ f: [[0, 150], [0.15, 215], [0.7, 170], [1.1, 115]],
      form: [[0, [500, 1000, 2200]], [0.2, [760, 1180, 2400]], [0.8, [620, 1000, 2200]], [1.1, [450, 800, 2000]]],
      amp: [[0, 0], [0.06, 0.9], [0.2, 1], [0.8, 0.8], [1.15, 0]], q: [5, 7, 8], breath: 0.4, rough: 0.35, roughF: 32, body: 0.4, v: 0.6, rev: 0.35 });
    s.tone({ pts: [[0, 75], [0.2, 90], [1.1, 55]], a: 0.08, h: 0.6, d: 0.45, v: 0.3 });
    s.noise({ ft: 'lowpass', f: 900, f2: 300, a: 0.05, h: 0.5, d: 0.5, v: 0.3, color: 'brown' });
    s.voice({ at: 0.03, f: [[0, 360], [0.15, 500], [0.7, 420], [1.05, 300]], form: [[0, [800, 1400, 2800]], [1.05, [600, 1100, 2400]]],
      amp: [[0, 0], [0.08, 0.6], [0.8, 0.5], [1.05, 0]], breath: 0.1, v: 0.18, rev: 0.4 });
  } },
  player_hurt: { vary: 0.06, max: 2, gap: 0.1, fn(s) {
    s.voice({ f: [[0, 820], [0.03, 1180], [0.13, 720]], form: [[0, [520, 2100, 3000]], [0.12, [680, 1700, 2800]]],
      amp: [[0, 0], [0.01, 1], [0.08, 0.6], [0.15, 0]], q: [6, 8, 9], breath: 0.2, body: 0.3, v: 0.45 });
    s.noise({ ft: 'lowpass', f: 800, a: 0.002, d: 0.06, v: 0.3, color: 'pink' });
  } },
  player_die: { vary: 0, max: 1, fn(s) {
    s.voice({ f: [[0, 900], [0.2, 1020], [0.75, 520]], type: 'triangle', vib: [6, 30, 0.1], form: [[0, [900, 2200, 3100]], [0.75, [600, 1500, 2600]]],
      amp: [[0, 0], [0.06, 0.8], [0.5, 0.7], [0.8, 0]], breath: 0.1, body: 0.6, bodyF: 1300, v: 0.3, rev: 0.3 });
    // muted sad trombone: wah wah wah waaah
    [[0.85, 392, 0.26], [1.15, 370, 0.26], [1.45, 349, 0.26], [1.75, 330, 0.9]].forEach(([at, f, d], i) =>
      s.tone({ at, f, stack: [['sawtooth', 0, 0.6], ['triangle', 4, 0.6]], a: 0.03, h: d * 0.7, d: d * 0.3 + 0.1, lin: true, v: 0.14,
        lp: 500, lp2: 1300, lt: 0.12, lq: 4, vib: i === 3 ? [5, 35, 0.2] : undefined, rev: 0.25 }));
  } },

  // ------------------------------------------------------------------------------------------ dogs
  bark: { vary: 0.06, max: 2, gap: 0.08, fn(s) {
    s.voice({ f: [[0, 400], [0.025, 580], [0.07, 520], [0.19, 310]],
      form: [[0, [450, 1100, 2500]], [0.035, [880, 1450, 2700]], [0.12, [620, 1150, 2400]], [0.2, [420, 900, 2200]]],
      amp: [[0, 0], [0.012, 1], [0.07, 0.75], [0.2, 0]], q: [5, 7, 9], fg: [1, 0.65, 0.3], breath: 0.35, rough: 0.22, roughF: 55, body: 0.35, v: 0.55, rev: 0.12 });
    s.noise({ ft: 'lowpass', f: 450, a: 0.004, d: 0.07, v: 0.25, color: 'pink' });
  } },
  bark_small: { vary: 0.07, max: 2, gap: 0.07, fn(s) {
    s.voice({ f: [[0, 700], [0.02, 1060], [0.1, 660]], form: [[0, [620, 1700, 2900]], [0.03, [1050, 1950, 3100]], [0.12, [700, 1500, 2700]]],
      amp: [[0, 0], [0.008, 1], [0.05, 0.7], [0.13, 0]], q: [5, 7, 9], breath: 0.25, rough: 0.12, roughF: 70, body: 0.25, v: 0.5, rev: 0.12 });
  } },
  howl: { vary: 0.05, max: 1, fn(s) {
    s.voice({ f: [[0, 380], [0.25, 560], [0.5, 625], [1.2, 600], [1.75, 430]], vib: [5, 22, 0.45],
      form: [[0, [700, 1200, 2500]], [0.45, [520, 900, 2300]], [1.75, [380, 740, 2200]]],
      amp: [[0, 0], [0.15, 0.75], [0.45, 1], [1.4, 0.85], [1.8, 0]], q: [6, 9, 10], breath: 0.15, body: 0.4, v: 0.45, rev: 0.55 });
  } },
  whine: { vary: 0.05, max: 1, fn(s) {
    for (const [at, k] of [[0, 1], [0.38, 0.9]]) s.voice({ at, f: [[0, 950 * k], [0.12, 1180 * k], [0.28, 880 * k]], type: 'triangle', vib: [7, 35],
      form: [[0, [950, 2300, 3200]], [0.28, [800, 2000, 3000]]], amp: [[0, 0], [0.05, 1], [0.2, 0.8], [0.3, 0]], q: [7, 9, 9],
      breath: 0.1, body: 0.6, bodyF: 1400, v: 0.3, rev: 0.2 });
  } },
  dig: { vary: 0.1, max: 2, fn(s) {
    for (let i = 0; i < 4; i++) {
      const at = i * 0.12 + Math.random() * 0.02;
      s.noise({ at, f: R(1400, 2400), q: 0.8, a: 0.004, d: 0.06, v: 0.45 });
      s.noise({ at, ft: 'lowpass', f: 450, a: 0.003, d: 0.08, v: 0.3, color: 'brown' });
      if (Math.random() < 0.6) s.noise({ at: at + 0.05, f: R(3000, 5000), q: 4, a: 0.001, d: 0.015, v: 0.25 });
    }
  } },

  // ------------------------------------------------------------------------------------------ skills / magic
  explosion_small: { vary: 0.08, max: 3, fn(s) {
    s.tone({ f: 900, f2: 300, glide: 0.03, a: 0.001, d: 0.035, v: 0.2 });
    s.noise({ ft: 'lowpass', f: 3000, f2: 280, q: 4, a: 0.004, d: 0.4, v: 0.75, color: 'pink', rev: 0.25 });
    s.tone({ f: 160, f2: 55, glide: 0.18, a: 0.002, d: 0.3, v: 0.45 });
    s.sparkle({ at: 0.15, n: 3, base: 1760, v: 0.04 });
  } },
  fire_whoosh: { vary: 0.08, max: 3, fn(s) {
    s.noise({ pts: [[0, 300], [0.15, 1900], [0.55, 450]], ft: 'lowpass', q: 3, a: 0.08, d: 0.45, v: 0.8, color: 'pink', rev: 0.15 });
    s.tone({ pts: [[0, 80], [0.15, 120], [0.5, 70]], a: 0.08, d: 0.4, v: 0.12 });
    for (let i = 0; i < 7; i++) s.noise({ at: R(0.05, 0.5), f: R(2500, 5000), q: 3, a: 0.001, d: 0.012, v: 0.2 });
  } },
  frost: { vary: 0.05, max: 3, fn(s) {
    s.noise({ f: 2200, q: 2, a: 0.001, d: 0.02, v: 0.3 });
    s.tone({ f: 1400, f2: 900, a: 0.001, d: 0.1, v: 0.08 });
    [1760, 1319, 1568, 2093].forEach((f, i) => s.bell({ at: 0.03 + i * 0.06, f, d: 0.7, v: 0.08, rev: 0.45, partials: [[1, 1, 1], [2.32, 0.35, 0.5], [4.25, 0.12, 0.3]] }));
    s.tone({ f: 330, f2: 262, a: 0.05, d: 0.5, v: 0.08, rev: 0.3 });
    s.noise({ ft: 'bandpass', f: 3200, q: 1.2, a: 0.1, d: 0.6, v: 0.18, am: [20, 0.5], rev: 0.4 });
  } },
  zap: { vary: 0.08, max: 3, fn(s) {
    s.tone({ f: 120, type: 'sawtooth', fmod: [37, 60, 'square'], a: 0.003, h: 0.12, d: 0.12, v: 0.4, bp: 1100, bq: 1.2, lp: 2600 });
    s.noise({ f: 2400, q: 0.9, a: 0.002, h: 0.1, d: 0.1, v: 0.3, am: [60, 0.8, 'square'], lp: 5000 });
    s.tone({ f: 700, f2: 1800, glide: 0.06, a: 0.002, d: 0.07, v: 0.08 });
    s.tone({ at: 0.02, f: 180, f2: 90, a: 0.002, d: 0.12, v: 0.15 });
  } },
  stink: { vary: 0.1, max: 2, fn(s) {
    s.tone({ pts: [[0, 115], [0.1, 98], [0.3, 82], [0.42, 125]], type: 'sawtooth', am: [26, 0.45], a: 0.01, h: 0.3, d: 0.14, v: 0.5, lp: 650, lq: 5 });
    s.noise({ ft: 'lowpass', f: 900, am: [26, 0.45], a: 0.01, h: 0.25, d: 0.15, v: 0.25, color: 'pink' });
    s.noise({ at: 0.35, ft: 'highpass', f: 2200, a: 0.08, d: 0.4, v: 0.06, lin: true });
  } },
  heal: { vary: 0.02, max: 2, fn(s) {
    [1046, 1318, 1568, 2093, 2637].forEach((f, i) => s.bell({ at: i * 0.07, f, d: 0.9, v: 0.09, rev: 0.5, pan: (i - 2) * 0.15 }));
    s.tone({ f: 523, stack: [['sine', 0, 1], ['sine', 7, 0.5, 1.5]], a: 0.2, h: 0.2, d: 0.8, v: 0.1, rev: 0.4 });
    s.noise({ ft: 'highpass', f: 6500, a: 0.3, d: 0.7, v: 0.1, am: [11, 0.5], rev: 0.4 });
  } },
  buff: { vary: 0.03, max: 2, fn(s) {
    s.tone({ f: 220, f2: 660, glide: 0.35, stack: [['sine', 0, 1], ['triangle', 5, 0.35, 1.5]], a: 0.08, h: 0.25, d: 0.4, v: 0.2, vib: [7, 15], rev: 0.35 });
    s.noise({ f: 700, f2: 3200, q: 2.5, a: 0.3, d: 0.3, v: 0.25, rev: 0.3 });
    s.bell({ at: 0.3, f: 1568, d: 0.8, v: 0.1, rev: 0.4 });
    s.bell({ at: 0.36, f: 2349, d: 0.7, v: 0.08, rev: 0.4 });
  } },
  dash: { vary: 0.08, max: 3, fn(s) {
    s.noise({ f: 800, f2: 4000, glide: 0.12, q: 2, a: 0.01, d: 0.13, v: 0.7 });
    s.tone({ f: 500, f2: 1500, glide: 0.1, a: 0.004, d: 0.09, v: 0.06 });
  } },

  // ------------------------------------------------------------------------------------------ world / items
  potion_drink: { vary: 0.05, max: 1, fn(s) {
    for (let i = 0; i < 3; i++) {
      const at = i * 0.17;
      s.tone({ at, pts: [[0, 210], [0.06, 520]], a: 0.004, d: 0.08, v: 0.3, lp: 1500 });
      s.noise({ at, f: 420, q: 2, a: 0.004, d: 0.05, v: 0.3 });
    }
    s.bell({ at: 0.55, f: 1568, d: 0.6, v: 0.09, rev: 0.4 });
    s.sparkle({ at: 0.6, n: 3, base: 2093, v: 0.035 });
  } },
  door_open: { vary: 0.05, max: 2, fn(s) {
    s.noise({ pts: [[0, 850], [0.35, 1350]], q: 1.2, a: 0.05, h: 0.2, d: 0.14, v: 0.35, color: 'pink' });
    s.tone({ at: 0.36, f: 420, f2: 330, a: 0.001, d: 0.08, v: 0.25 });
    s.noise({ at: 0.36, f: 1100, q: 3, a: 0.001, d: 0.04, v: 0.3 });
  } },
  portal: { vary: 0.03, max: 1, fn(s) {
    s.noise({ pts: [[0, 400], [0.6, 2800], [1.4, 700]], q: 4, a: 0.3, h: 0.5, d: 0.7, lin: true, v: 0.5, am: [7, 0.4], rev: 0.5 });
    s.tone({ pts: [[0, 300], [1.0, 900]], stack: [['sine', -8, 0.6], ['sine', 8, 0.6]], a: 0.3, h: 0.5, d: 0.7, lin: true, v: 0.12, rev: 0.5 });
    s.tone({ f: 110, a: 0.3, h: 0.5, d: 0.8, lin: true, v: 0.15 });
    [1175, 1568, 1760, 2349, 2637, 3136].forEach((f, i) => s.bell({ at: 0.2 + i * 0.12, f, d: 0.7, v: 0.05, rev: 0.6, pan: Math.sin(i * 2) * 0.6 }));
  } },
  build_place: { vary: 0.06, max: 3, fn(s) {
    s.tone({ f: 150, f2: 95, glide: 0.06, a: 0.001, d: 0.16, v: 0.5 });
    s.tone({ f: 300, type: 'triangle', a: 0.001, d: 0.06, v: 0.15 });
    s.noise({ ft: 'lowpass', f: 1200, a: 0.001, d: 0.05, v: 0.45, color: 'pink' });
    s.noise({ f: 720, q: 4, a: 0.001, d: 0.09, v: 0.3 });
    s.bell({ at: 0.09, f: 2093, d: 0.4, v: 0.07, rev: 0.4 });
    s.bell({ at: 0.14, f: 3136, d: 0.35, v: 0.05, rev: 0.4 });
  } },
  build_complete: { vary: 0, max: 1, fn(s) {
    [67, 69, 72, 74, 76, 79].forEach((m, i) => s.pluck({ at: i * 0.065, m, kind: 'koto', v: 0.28, rev: 0.3, lp: 5000 }));
    [1046, 1318, 1568].forEach((f, i) => s.bell({ at: 0.42 + i * 0.015, f, d: 1.6, v: 0.08, rev: 0.45 }));
    s.tone({ at: 0.4, ...PON, v: 0.3 });
    s.sparkle({ at: 0.45, n: 6, base: 2093, spread: 0.7, v: 0.04 });
  } },
  bulldoze: { vary: 0.06, max: 2, fn(s) {
    s.noise({ ft: 'lowpass', f: 1300, f2: 200, a: 0.01, d: 0.85, v: 0.7, color: 'brown', rev: 0.2 });
    s.tone({ f: 85, f2: 40, glide: 0.4, a: 0.003, d: 0.45, v: 0.4 });
    for (let i = 0; i < 10; i++) s.noise({ at: R(0, 0.6), f: R(500, 2200), q: 3, a: 0.001, d: R(0.02, 0.06), v: 0.35 });
    for (let i = 0; i < 3; i++) s.tone({ at: R(0.02, 0.4), f: R(250, 400), f2: 150, a: 0.001, d: 0.05, v: 0.12 });
    s.noise({ at: 0.3, f: 800, f2: 300, q: 0.8, a: 0.1, d: 0.5, v: 0.3, color: 'pink' });
  } },
  chest_open: { vary: 0.02, max: 1, fn(s) {
    s.tone({ pts: [[0, 90], [0.25, 135]], type: 'sawtooth', fmod: [23, 6], bp: 900, bq: 6, a: 0.02, h: 0.18, d: 0.08, v: 0.35 });
    s.tone({ at: 0.28, f: 260, f2: 180, a: 0.001, d: 0.08, v: 0.25 });
    [1046, 1318, 1568, 2093].forEach((f, i) => s.bell({ at: 0.33 + i * 0.07, f, d: 0.9, v: 0.09, rev: 0.45 }));
    s.noise({ at: 0.35, ft: 'highpass', f: 6500, a: 0.2, d: 0.7, v: 0.1, am: [13, 0.5], rev: 0.45 });
  } },
  waypoint: { vary: 0, max: 1, fn(s) {
    for (const [f, dt] of [[587, 0], [880, 4], [1319, -4]]) s.tone({ f, detune: dt, a: 0.35, h: 0.35, d: 1.0, lin: true, v: 0.08, vib: [4.5, 8], rev: 0.5 });
    s.noise({ f: 300, f2: 2400, q: 2, a: 0.4, d: 0.6, v: 0.25, rev: 0.4 });
    s.bell({ at: 0.35, f: 1760, d: 1.4, v: 0.08, rev: 0.5 });
    s.bell({ at: 0.45, f: 2637, d: 1.2, v: 0.06, rev: 0.5 });
    s.tone({ ...PON, v: 0.25 });
  } },
  splash: { vary: 0.08, max: 3, fn(s) {
    s.noise({ f: 1600, f2: 600, q: 0.8, a: 0.004, d: 0.3, v: 0.7, rev: 0.2 });
    s.noise({ ft: 'highpass', f: 4000, a: 0.002, d: 0.12, v: 0.2 });
    for (let i = 0; i < 6; i++) { const f = R(700, 1800); s.tone({ at: R(0.03, 0.32), f, f2: f * 1.8, glide: 0.03, a: 0.001, d: 0.05, v: 0.08 }); }
  } },

  // ------------------------------------------------------------------------------------------ critters
  bird_chirp: { vary: 0.12, max: 3, fn(s) {
    const n = 2 + ((Math.random() * 3) | 0), base = R(2500, 3400);
    for (let i = 0; i < n; i++) s.tone({ at: i * R(0.08, 0.11), pts: [[0, base * 1.15], [0.025, base * 0.8], [0.05, base]], a: 0.004, d: 0.05, v: 0.12 });
  } },
  cat_meow: { vary: 0.08, max: 1, fn(s) {
    s.voice({ f: [[0, 520], [0.12, 730], [0.35, 660], [0.55, 470]], vib: [5, 18, 0.2],
      form: [[0, [380, 2200, 3000]], [0.15, [820, 1700, 2800]], [0.45, [620, 1100, 2600]], [0.58, [450, 900, 2400]]],
      amp: [[0, 0], [0.05, 0.9], [0.4, 1], [0.6, 0]], q: [6, 9, 10], breath: 0.12, body: 0.25, v: 0.4, rev: 0.15 });
  } },
  villager_chatter: { vary: 0.15, max: 2, gap: 0.3, fn(s, o) {
    const dur = babble(s.ctx, s.out, o.text || gibberish(), { t: s.t0, pitch: s.P, speed: o.speed ?? 1, voice: o.voice || 'cute' });
    s.mark(s.t0 + dur);
  } },
};

// Level trims, calibrated with the offline render check (targets: UI ≈0.25–0.35 peak, combat ≈0.45–0.6, big moments ≈0.5–0.65).
const TRIM = {
  ui_hover: 0.75, ui_click: 0.6, ui_tab: 1.4, ui_coin: 1.8, ui_buy: 1.5, ui_learn: 1.7, ui_equip: 1.3, ui_toast: 1.2,
  pickup_item: 1.3, pickup_gold: 2.5, pickup_rare: 1.6, drop_item: 0.95,
  footstep_grass: 2.2, footstep_stone: 1.1, footstep_wood: 0.7,
  swing: 2.6, swing_heavy: 1.45, throw: 3.3, dash: 3.3, hit_crit: 1.15, player_hurt: 0.6, monster_die: 1.5, ghost_wail: 0.7, boss_roar: 0.55, player_die: 0.5,
  bark: 0.9, bark_small: 0.4, howl: 0.37, whine: 0.3, dig: 2,
  fire_whoosh: 1.15, stink: 0.75, heal: 1.4, potion_drink: 1.6, door_open: 1.5, portal: 1.2, build_place: 1.1, bulldoze: 0.95,
  chest_open: 1.7, waypoint: 1.2, splash: 1.8, bird_chirp: 1.6, cat_meow: 0.3,
};
for (const [k, v] of Object.entries(TRIM)) SFX[k].trim = v;

export const SFX_NAMES = Object.keys(SFX);

export const SFX_GROUPS = {
  UI: ['ui_click', 'ui_hover', 'ui_open', 'ui_close', 'ui_tab', 'ui_error', 'ui_coin', 'ui_levelup', 'ui_learn', 'ui_equip', 'ui_buy', 'ui_quest', 'ui_toast'],
  Pickups: ['pickup_item', 'pickup_gold', 'pickup_rare', 'drop_item'],
  Footsteps: ['footstep_grass', 'footstep_stone', 'footstep_wood'],
  Combat: ['swing', 'swing_heavy', 'throw', 'ball_bounce', 'hit_flesh', 'hit_crit', 'monster_hit', 'monster_die', 'slime_bounce', 'ghost_wail', 'boss_roar', 'player_hurt', 'player_die'],
  Dogs: ['bark', 'bark_small', 'howl', 'whine', 'dig'],
  Skills: ['explosion_small', 'fire_whoosh', 'frost', 'zap', 'stink', 'heal', 'buff', 'dash'],
  World: ['potion_drink', 'door_open', 'portal', 'build_place', 'build_complete', 'bulldoze', 'chest_open', 'waypoint', 'splash'],
  Critters: ['bird_chirp', 'cat_meow', 'villager_chatter'],
};
