// Bamboo Depths' own monster sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// The Iwa-bōzu (rock monk): stony grumbles and knocks, a deep hollow thump, gravel rolling, a sleepy "hm?".
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // woken: a sleepy rising "hm?!" and a pebble skitter
  iwabozu_wake: { vary: 0.08, max: 2, gap: 0.3, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 150], [0.18, 190], [0.32, 260]], form: [[0, [500, 1000, 2400]], [0.32, [650, 1200, 2600]]], amp: [[0, 0], [0.03, 0.8], [0.25, 0.9], [0.36, 0]], q: [6, 7, 9], breath: 0.3, body: 0.6, v: 0.28 });
    for (let i = 0; i < 5; i++) s.noise({ at: R(0.05, 0.3), f: R(1800, 3000), q: 5, a: 0.001, d: 0.015, v: 0.07 });
  } },
  // the slam's wind-up: a heavy grunt with grinding stone
  iwabozu_wind: { vary: 0.08, max: 3, gap: 0.1, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 420, f2: 900, a: 0.25, h: 0.2, d: 0.15, v: 0.32, am: [14, 0.5], color: 'brown' });
    s.voice({ at: 0.1, f: [[0, 120], [0.3, 140]], form: [[0, [450, 900, 2200]], [0.3, [500, 950, 2300]]], amp: [[0, 0], [0.05, 0.7], [0.32, 0.6], [0.42, 0]], q: [5, 6, 8], breath: 0.35, body: 0.6, v: 0.24 });
  } },
  // the slam / a rolling hit: a deep hollow thump, rattling gravel
  iwabozu_slam: { vary: 0.06, max: 3, gap: 0.08, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 110], [0.12, 48]], a: 0.002, d: 0.32, v: 0.75 });
    s.noise({ ft: 'lowpass', f: 900, f2: 240, a: 0.002, d: 0.3, v: 0.55, color: 'brown' });
    for (let i = 0; i < 8; i++) s.noise({ at: R(0.03, 0.3), f: R(1400, 3200), q: 4, a: 0.001, d: 0.02, v: 0.1 });
  } },
  // tucking in: a scrape and a little "hup"
  iwabozu_tuck: { vary: 0.08, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 700, f2: 1200, q: 2, a: 0.04, d: 0.25, v: 0.25, color: 'pink' });
    s.voice({ at: 0.2, f: [[0, 180], [0.08, 230]], form: [[0, [600, 1100, 2500]], [0.1, [700, 1250, 2700]]], amp: [[0, 0], [0.02, 0.8], [0.09, 0.6], [0.13, 0]], q: [6, 7, 9], breath: 0.25, body: 0.5, v: 0.2 });
  } },
  // rolling: a long gravelly rumble
  iwabozu_roll: { vary: 0.05, max: 2, gap: 0.4, trim: 1.2, fn(s) {
    s.noise({ ft: 'lowpass', f: 300, f2: 520, a: 0.08, h: 0.6, d: 0.25, v: 0.5, am: [9, 0.7], color: 'brown' });
    for (let i = 0; i < 10; i++) s.noise({ at: R(0.05, 0.85), f: R(1200, 2600), q: 4, a: 0.001, d: 0.02, v: 0.09 });
  } },
  // into a wall: a dull clonk and a dazed "uuh"
  iwabozu_thud: { vary: 0.06, max: 2, gap: 0.2, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 160], [0.08, 70]], a: 0.002, d: 0.2, v: 0.55 });
    s.voice({ at: 0.12, f: [[0, 170], [0.3, 120]], form: [[0, [500, 950, 2300]], [0.3, [450, 900, 2200]]], amp: [[0, 0], [0.04, 0.6], [0.3, 0.5], [0.4, 0]], q: [5, 6, 8], breath: 0.3, body: 0.5, v: 0.18, vib: [6, 20] });
  } },
  iwabozu_hurt: { vary: 0.1, max: 3, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 1800, q: 3, a: 0.001, d: 0.04, v: 0.25 });
    s.voice({ f: [[0, 200], [0.07, 240], [0.14, 180]], form: [[0, [600, 1100, 2500]], [0.14, [550, 1050, 2400]]], amp: [[0, 0], [0.01, 0.8], [0.1, 0.5], [0.15, 0]], q: [6, 7, 9], breath: 0.3, body: 0.5, v: 0.16 });
  } },
  // crumbles: stones tumbling apart and a soft "oof…"
  iwabozu_die: { vary: 0.06, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    for (let i = 0; i < 7; i++) s.tone({ at: i * 0.06 + R(0, 0.03), pts: [[0, R(140, 220)], [0.08, R(60, 90)]], a: 0.002, d: 0.12, v: 0.3 - i * 0.03 });
    s.noise({ ft: 'lowpass', f: 1200, f2: 300, a: 0.01, d: 0.5, v: 0.35, color: 'brown' });
    s.voice({ at: 0.15, f: [[0, 180], [0.4, 110]], form: [[0, [500, 950, 2300]], [0.4, [420, 850, 2100]]], amp: [[0, 0], [0.05, 0.6], [0.35, 0.4], [0.5, 0]], q: [5, 6, 8], breath: 0.35, body: 0.5, v: 0.18 });
  } },
};
