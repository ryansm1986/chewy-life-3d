// Charged-ability sounds (docs/CHARGE.md §4), sfx.js format: { fn(voice, opts), vary, max, gap, trim }, merged into the
// sfx table by src/audio/sfx.js. Soft and round like the rest: a gathering hum that rises with the charge, a bell
// "ting!" per stage (combat/charge.js raises the pitch per stage), a whooshy release and a little fizzle on cancel.
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // the wind-up begins: a soft upward "fwip" and one glint
  charge_start: { vary: 0.04, max: 1, gap: 0.12, trim: 1.4, fn(s) {
    s.noise({ f: 700, f2: 2400, glide: 0.18, q: 1.2, a: 0.03, d: 0.16, v: 0.16, color: 'pink' });
    s.tone({ pts: [[0, 420], [0.16, 720]], type: 'triangle', a: 0.02, d: 0.16, v: 0.12 });
    s.bell({ at: 0.08, f: 1760, d: 0.35, v: 0.035, rev: 0.4 });
  } },
  // the gathering hum (re-triggered every ~0.3 s at a rising pitch while charging)
  charge_hum: { vary: 0.01, max: 2, gap: 0.12, trim: 1.1, fn(s) {
    s.tone({ f: 330, stack: [['sine', 0, 1], ['triangle', 7, 0.35, 2]], a: 0.06, h: 0.16, d: 0.18, v: 0.07, lp: 1600, vib: [6.5, 14] });
    s.noise({ f: 2600, q: 3, a: 0.05, h: 0.1, d: 0.15, v: 0.025 });
  } },
  // a stage is reached: a glassy bell "ting!" and a pentatonic sparkle
  charge_stage: { vary: 0, max: 3, gap: 0.05, trim: 1.5, fn(s) {
    s.bell({ f: 1046.5, d: 0.9, v: 0.12, rev: 0.45 });
    s.bell({ at: 0.012, f: 1568, d: 0.6, v: 0.05, rev: 0.45 });
    s.tone({ pts: [[0, 523], [0.05, 1046]], type: 'triangle', a: 0.002, d: 0.12, v: 0.08 });
    s.sparkle({ at: 0.04, n: 4, base: 2093, v: 0.03, spread: 0.22 });
  } },
  // the charged release: a round whomp, a whoosh and a sparkle (louder at higher stages via vol)
  charge_release: { vary: 0.03, max: 2, gap: 0.06, trim: 1.3, duck: [0.85, 0.5], fn(s) {
    s.tone({ pts: [[0, 180], [0.12, 90]], a: 0.004, d: 0.22, v: 0.3 });
    s.noise({ f: 1800, f2: 500, glide: 0.25, q: 0.9, a: 0.008, d: 0.28, v: 0.22, color: 'pink' });
    s.tone({ at: 0.02, pts: [[0, 660], [0.08, 990]], type: 'triangle', a: 0.003, d: 0.14, v: 0.08 });
    s.sparkle({ at: 0.05, n: 5, base: 1568, v: 0.035, spread: 0.3 });
  } },
  // the charge fizzled (a roll, a menu): a soft descending "pfff"
  charge_cancel: { vary: 0.05, max: 1, gap: 0.15, trim: 1.4, fn(s) {
    s.noise({ f: 2200, f2: 600, glide: 0.2, q: 1.4, a: 0.01, d: 0.2, v: 0.14, color: 'pink' });
    s.tone({ pts: [[0, 600], [0.18, 300]], type: 'triangle', a: 0.005, d: 0.18, v: 0.07 });
  } },
  // Grand Crescent: a deep earthy thoom under the draw-cut
  charge_slam: { vary: 0.06, max: 2, gap: 0.08, trim: 1.6, fn(s) {
    s.tone({ f: 120, f2: 55, glide: 0.16, a: 0.003, d: 0.3, v: 0.42 });
    s.noise({ ft: 'lowpass', f: 900, a: 0.003, d: 0.22, v: 0.4, color: 'brown' });
    for (let i = 0; i < 4; i++) s.noise({ at: R(0.03, 0.16), f: R(700, 1500), q: 1.3, a: 0.002, d: R(0.04, 0.08), v: R(0.08, 0.14) });
  } },
  // Fastball / Big Splash: a rush of air off the paw or the staff
  charge_whoosh: { vary: 0.06, max: 3, gap: 0.05, trim: 1.5, fn(s) {
    s.noise({ f: 900, f2: 3200, glide: 0.12, q: 0.8, a: 0.01, d: 0.2, v: 0.22, color: 'pink' });
    s.tone({ pts: [[0, 300], [0.12, 160]], a: 0.004, d: 0.16, v: 0.12 });
  } },
};
