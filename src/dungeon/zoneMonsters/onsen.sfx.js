// Onsen Caverns' own monster sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// The Akaname (bath-licking imp): a squeaky giggle, a wet slurp sucked in, the tongue's whippy "thwip", a sloppy lick, a
// kettle whistle rising, a burst of hissing steam, a squeak when hit, and a pop into steam with a little "aww".
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // noticed you: a squeaky, mischievous "hee-hee-hee"
  akaname_giggle: { vary: 0.08, max: 2, gap: 0.6, trim: 1.3, fn(s) {
    for (let i = 0; i < 3; i++) s.voice({ at: i * 0.11, f: [[0, 620 - i * 30], [0.05, 760 - i * 40], [0.09, 640 - i * 30]], form: [[0, [700, 2300, 3200]], [0.09, [650, 2200, 3100]]], amp: [[0, 0], [0.012, 0.8], [0.07, 0.6], [0.095, 0]], q: [6, 9, 11], breath: 0.35, body: 0.3, v: 0.16 });
  } },
  // the lick's wind-up: a wet slurp sucked in, rising
  akaname_wind: { vary: 0.08, max: 3, gap: 0.15, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 600], [0.4, 1800]], q: 3, a: 0.05, h: 0.3, d: 0.12, v: 0.22, am: [26, 0.6], color: 'pink' });
    s.voice({ at: 0.05, f: [[0, 300], [0.35, 520]], form: [[0, [400, 900, 2400]], [0.35, [380, 1900, 2800]]], amp: [[0, 0], [0.04, 0.5], [0.34, 0.55], [0.42, 0]], q: [5, 8, 10], breath: 0.5, body: 0.2, v: 0.12 });
  } },
  // the tongue lashing out: a whippy "thwip" with a wet flutter
  akaname_lash: { vary: 0.07, max: 3, gap: 0.08, trim: 1.2, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 2600], [0.12, 700]], q: 2.5, a: 0.003, d: 0.14, v: 0.32, color: 'white' });
    s.tone({ pts: [[0, 900], [0.1, 260]], a: 0.002, d: 0.1, v: 0.18, type: 'triangle' });
    s.noise({ at: 0.06, ft: 'bandpass', f: 1200, q: 4, a: 0.005, d: 0.12, v: 0.14, am: [42, 0.8], color: 'pink' });
  } },
  // caught you: a big sloppy lick and a happy "mm!"
  akaname_slurp: { vary: 0.08, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 900], [0.18, 2200], [0.3, 1300]], q: 3.5, a: 0.01, h: 0.12, d: 0.14, v: 0.3, am: [30, 0.7], color: 'pink' });
    s.voice({ at: 0.22, f: [[0, 420], [0.1, 520], [0.18, 470]], form: [[0, [350, 1000, 2500]], [0.18, [330, 950, 2400]]], amp: [[0, 0], [0.02, 0.7], [0.15, 0.6], [0.2, 0]], q: [6, 8, 10], breath: 0.2, body: 0.5, v: 0.14, type: 'triangle' });
  } },
  // the steam wind-up: a kettle whistle rising, a bubbling under it
  akaname_whistle: { vary: 0.06, max: 3, gap: 0.15, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 1400], [0.6, 2300]], a: 0.12, h: 0.42, d: 0.1, v: 0.09, vib: [9, 30, 0.2] });
    s.noise({ ft: 'bandpass', pts: [[0, 2400], [0.6, 3800]], q: 6, a: 0.15, h: 0.4, d: 0.1, v: 0.12 });
    for (let i = 0; i < 6; i++) s.tone({ at: R(0.05, 0.55), pts: [[0, R(500, 800)], [0.04, R(900, 1300)]], a: 0.002, d: 0.04, v: 0.05 });
  } },
  // the burst: a broad hiss of scalding steam, a soft whump under it
  akaname_steam: { vary: 0.06, max: 3, gap: 0.1, trim: 1.2, fn(s) {
    s.noise({ ft: 'highpass', pts: [[0, 1800], [0.5, 3200]], a: 0.004, h: 0.08, d: 0.45, v: 0.36, color: 'white' });
    s.noise({ ft: 'lowpass', f: 420, a: 0.003, d: 0.22, v: 0.4, color: 'brown' });
    s.tone({ pts: [[0, 140], [0.12, 70]], a: 0.002, d: 0.16, v: 0.3 });
  } },
  akaname_hurt: { vary: 0.1, max: 3, gap: 0.2, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 700], [0.05, 880], [0.12, 600]], form: [[0, [800, 2200, 3200]], [0.12, [700, 2000, 3000]]], amp: [[0, 0], [0.008, 0.85], [0.09, 0.5], [0.13, 0]], q: [6, 9, 11], breath: 0.3, body: 0.3, v: 0.15 });
  } },
  // popped: a soft "aww…" sinking, then a puff of steam
  akaname_die: { vary: 0.07, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 640], [0.12, 560], [0.42, 300]], form: [[0, [750, 1300, 2700]], [0.42, [600, 1000, 2400]]], amp: [[0, 0], [0.03, 0.7], [0.32, 0.45], [0.45, 0]], q: [6, 8, 10], breath: 0.35, body: 0.4, v: 0.15, vib: [7, 25, 0.1] });
    s.noise({ at: 0.35, ft: 'highpass', f: 2200, a: 0.01, h: 0.05, d: 0.35, v: 0.2 });
    s.tone({ at: 0.33, pts: [[0, 420], [0.06, 180]], a: 0.002, d: 0.08, v: 0.18 });
  } },
};
