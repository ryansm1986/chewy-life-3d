// The Haunted ghost's sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// The Yūrei (a little sheet ghost): a soft rising "oooo~" as it rises, a breathy inhale, a cute "boo!", a squeak when
// hit, a fading sigh with a chime when it goes back to rest.
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // rising from the fallen: a soft wavering "ooo~" and a few cold chimes
  yurei_rise: { vary: 0.1, max: 2, gap: 0.25, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 330], [0.3, 470], [0.75, 420]], stack: [['sine', 0, 1], ['triangle', 6, 0.3]], vib: [5.5, 22, 0.1], a: 0.18, h: 0.3, d: 0.35, lin: true, v: 0.12, lp: 1300, rev: 0.6 });
    s.noise({ f: 900, q: 5, a: 0.2, h: 0.2, d: 0.4, lin: true, v: 0.07, rev: 0.5 });
    s.sparkle({ at: 0.25, n: 3, base: 1760, v: 0.035, spread: 0.3 });
  } },
  // rearing back for the boo: a breathy inhale
  yurei_wind: { vary: 0.08, max: 3, gap: 0.12, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 1200, f2: 2400, q: 2, a: 0.25, d: 0.12, v: 0.16, color: 'pink' });
    s.tone({ pts: [[0, 280], [0.45, 360]], a: 0.3, d: 0.12, v: 0.05, lp: 900 });
  } },
  // "BOO!": a quick hooting vowel with a frosty swish
  yurei_boo: { vary: 0.08, max: 3, gap: 0.08, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 260], [0.06, 330], [0.22, 240]], form: [[0, [350, 800, 2300]], [0.22, [330, 700, 2200]]], amp: [[0, 0], [0.02, 1], [0.16, 0.7], [0.26, 0]], q: [6, 7, 9], breath: 0.4, body: 0.5, v: 0.26 });
    s.noise({ at: 0.02, pts: [[0, 3200], [0.25, 900]], q: 1, a: 0.01, d: 0.25, v: 0.16, color: 'pink', rev: 0.25 });
  } },
  // hit: a small startled "eep"
  yurei_hurt: { vary: 0.1, max: 3, gap: 0.12, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 520], [0.07, 680]], form: [[0, [600, 1700, 2900]], [0.08, [700, 1900, 3100]]], amp: [[0, 0], [0.01, 0.8], [0.07, 0.5], [0.1, 0]], q: [7, 8, 10], breath: 0.3, body: 0.4, v: 0.14 });
  } },
  // back to rest: a falling sigh and a chime
  yurei_fade: { vary: 0.08, max: 3, gap: 0.1, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 520], [0.5, 300]], stack: [['sine', 0, 1], ['triangle', 5, 0.25]], vib: [5, 18, 0.05], a: 0.03, h: 0.15, d: 0.4, v: 0.11, lp: 1500, rev: 0.6 });
    s.sparkle({ at: 0.1, n: 4, base: 1568 + R(-60, 60), v: 0.045, spread: 0.35 });
  } },
};
