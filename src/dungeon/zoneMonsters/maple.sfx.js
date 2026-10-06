// Maple Roots' own monster sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// The Tesso (the iron-rat yokai): bright squeaks and chitters, claws scrabbling in earth, a muffled rumble under the
// floor, a thump and a shower of clods when it bursts up, the iron clack-clack-clack of its teeth.
const R = (a, b) => a + Math.random() * (b - a);
// a squeak: a quick high pitched glide through a small, nasal mouth
const squeak = (s, at, f0, f1, d, v) => s.voice({ at, f: [[0, f0], [d * 0.5, f1], [d, f0 * 0.95]], form: [[0, [1400, 2800, 4200]], [d, [1600, 3100, 4500]]], amp: [[0, 0], [d * 0.12, 0.9], [d * 0.7, 0.7], [d, 0]], q: [7, 8, 9], breath: 0.15, body: 0.3, v });

export const SFX = {
  // alerted: two bright squeaks, ears up
  tesso_squeak: { vary: 0.1, max: 3, gap: 0.2, trim: 1.3, fn(s) {
    squeak(s, 0, 820, 1250, 0.09, 0.26); squeak(s, 0.13, 900, 1400, 0.11, 0.24);
  } },
  // the dig: claws scrabbling into earth, a chitter
  tesso_dig: { vary: 0.08, max: 3, gap: 0.15, trim: 1.3, fn(s) {
    for (let i = 0; i < 9; i++) s.noise({ at: i * 0.05 + R(0, 0.02), ft: 'bandpass', f: R(900, 1700), q: 2.5, a: 0.002, d: 0.035, v: 0.2, color: 'pink' });
    s.noise({ at: 0.05, ft: 'lowpass', f: 500, f2: 300, a: 0.04, h: 0.2, d: 0.15, v: 0.25, color: 'brown' });
    squeak(s, 0.18, 760, 980, 0.07, 0.15);
  } },
  // into the earth: a soft whump and a scatter of grit
  tesso_burrow: { vary: 0.06, max: 3, gap: 0.2, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 140], [0.1, 70]], a: 0.004, d: 0.18, v: 0.35 });
    s.noise({ ft: 'lowpass', f: 700, f2: 250, a: 0.01, d: 0.25, v: 0.3, color: 'brown' });
    for (let i = 0; i < 5; i++) s.noise({ at: R(0.05, 0.25), f: R(1800, 3000), q: 5, a: 0.001, d: 0.015, v: 0.06 });
  } },
  // the mound swells over the ring: a muffled rumble rising under the floor
  tesso_rumble: { vary: 0.05, max: 3, gap: 0.3, trim: 1.2, fn(s) {
    s.noise({ ft: 'lowpass', f: 220, f2: 520, a: 0.15, h: 0.45, d: 0.2, v: 0.5, am: [16, 0.6], color: 'brown' });
    for (let i = 0; i < 7; i++) s.noise({ at: R(0.1, 0.7), f: R(1200, 2400), q: 4, a: 0.001, d: 0.02, v: 0.07 });
  } },
  // the burst: a deep thump, a shower of clods and a triumphant squeak
  tesso_burst: { vary: 0.06, max: 3, gap: 0.1, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 120], [0.12, 50]], a: 0.002, d: 0.3, v: 0.7 });
    s.noise({ ft: 'lowpass', f: 1100, f2: 260, a: 0.002, d: 0.32, v: 0.5, color: 'brown' });
    for (let i = 0; i < 10; i++) s.noise({ at: R(0.04, 0.4), f: R(1200, 3000), q: 4, a: 0.001, d: 0.02, v: 0.1 });
    squeak(s, 0.1, 950, 1500, 0.12, 0.22);
  } },
  // rearing up to bite: a hiss through the teeth
  tesso_hiss: { vary: 0.08, max: 3, gap: 0.15, trim: 1.3, fn(s) {
    s.noise({ ft: 'highpass', f: 3200, a: 0.03, h: 0.18, d: 0.12, v: 0.18, color: 'white' });
    squeak(s, 0.05, 620, 720, 0.12, 0.12);
  } },
  // the gnaw: iron teeth chattering, clack-clack-clack
  tesso_gnaw: { vary: 0.06, max: 4, gap: 0.08, trim: 1.2, fn(s) {
    for (let i = 0; i < 5; i++) {
      const t = i * 0.065;
      s.tone({ at: t, pts: [[0, 2600], [0.01, 1900]], a: 0.0005, d: 0.03, v: 0.22 });
      s.noise({ at: t, ft: 'bandpass', f: 4200, q: 6, a: 0.0005, d: 0.02, v: 0.14 });
    }
  } },
  tesso_hurt: { vary: 0.1, max: 3, gap: 0.2, trim: 1.3, fn(s) {
    squeak(s, 0, 1050, 1350, 0.1, 0.24);
  } },
  // falls: a squeak sliding down, the juzu beads clattering apart
  tesso_die: { vary: 0.06, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 1300], [0.35, 600]], form: [[0, [1500, 2900, 4300]], [0.35, [1200, 2400, 3800]]], amp: [[0, 0], [0.03, 0.9], [0.25, 0.5], [0.4, 0]], q: [7, 8, 9], breath: 0.2, body: 0.3, v: 0.22, vib: [9, 40] });
    for (let i = 0; i < 8; i++) s.tone({ at: 0.15 + i * 0.045 + R(0, 0.02), pts: [[0, R(1800, 2600)], [0.02, R(1400, 1800)]], a: 0.001, d: 0.05, v: 0.12 - i * 0.01 });
  } },
};
