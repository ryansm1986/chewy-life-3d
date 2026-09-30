// Yuki-onna, the Frost Princess (Yukimi Onsen) sounds (sfx.js format). Pure data: no imports from game code.
// Breathy, glassy and cold: a soft "fufufu" laugh, an in-breath and a howling blizzard, crystal chimes for her magic,
// glass for the mirrors, a whistling whiteout gust, and a sigh of wind chimes when she melts away.
const R = (a, b) => a + Math.random() * (b - a);
const glass = (s, at, n, v) => { for (let i = 0; i < n; i++) s.noise({ at: at + R(0, 0.16), f: R(3500, 8500), q: 7, a: 0.001, d: R(0.01, 0.05), v: v * R(0.5, 1) }); };
const breathV = (s, at, f0, f1, dur, v) => s.voice({ at, type: 'triangle', f: [[0, f0], [dur, f1]], form: [[0, [700, 1300, 2800]], [dur, [600, 1150, 2700]]], amp: [[0, 0], [0.02, 0.8], [dur * 0.6, 0.5], [dur, 0]], q: [7, 9, 11], breath: 0.7, body: 0.15, v });

export const SFX = {
  // waking on the lake: a low, cold hum rising
  yuki_hum: { vary: 0.03, max: 1, gap: 1, trim: 1.2, fn(s) {
    s.voice({ type: 'triangle', f: [[0, 392], [0.6, 440], [1.2, 523]], form: [[0, [400, 900, 2600]], [1.2, [500, 1100, 2800]]], amp: [[0, 0], [0.3, 0.5], [1.0, 0.6], [1.4, 0]], q: [8, 10, 12], breath: 0.5, body: 0.2, vib: [5, 30, 0.3], v: 0.1, rev: 0.6 });
    s.noise({ ft: 'highpass', f: 4500, a: 0.6, d: 0.8, v: 0.04, rev: 0.5 });
  } },
  // "fufufu~": three breathy little laughs
  yuki_laugh: { vary: 0.04, max: 1, gap: 0.8, trim: 1.3, fn(s) {
    for (let i = 0; i < 3; i++) breathV(s, i * 0.14, 820 - i * 30, 700 - i * 40, 0.1, 0.12);
    s.sparkle({ at: 0.35, n: 4, base: 2093, v: 0.035, spread: 0.4 });
  } },
  // drawing breath for the blizzard
  yuki_inhale: { vary: 0.04, max: 1, gap: 0.3, trim: 1.4, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 700], [0.8, 2200]], q: 1.2, a: 0.7, d: 0.08, v: 0.22, color: 'pink' });
    s.noise({ ft: 'highpass', f: 5000, a: 0.6, d: 0.1, v: 0.05 });
    s.tone({ pts: [[0, 330], [0.8, 520]], a: 0.5, d: 0.2, v: 0.03, vib: [5, 25], rev: 0.4 });
  } },
  // the blizzard: a howling gust with whistles and ice crackle
  yuki_blizzard: { vary: 0.04, max: 1, gap: 0.3, trim: 1.4, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 900], [0.3, 1800], [1.3, 700]], q: 0.8, a: 0.08, h: 0.8, d: 0.45, v: 0.5, am: [7, 0.35], color: 'pink' });
    s.noise({ ft: 'lowpass', f: 600, a: 0.1, h: 0.8, d: 0.4, v: 0.3, color: 'brown' });
    for (let i = 0; i < 3; i++) s.tone({ at: 0.1 + i * 0.3, pts: [[0, R(1200, 1500)], [0.4, R(900, 1100)]], a: 0.08, d: 0.3, v: 0.03, vib: [6, 60] });
    glass(s, 0.1, 14, 0.05); glass(s, 0.7, 10, 0.04);
  } },
  // raising a sleeve for the icicles: a rising crystal arpeggio
  yuki_cast: { vary: 0.04, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    [1175, 1568, 1976, 2349, 3136].forEach((f, i) => s.bell({ at: i * 0.05, f, d: 0.7, v: 0.055, rev: 0.5 }));
    s.noise({ ft: 'highpass', f: 5500, a: 0.2, d: 0.4, v: 0.06, rev: 0.4 });
  } },
  // the twirl before the glare ice
  yuki_twirl: { vary: 0.05, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 600], [0.45, 2400], [0.9, 1200]], q: 1.6, a: 0.2, d: 0.6, v: 0.25, am: [9, 0.5], color: 'pink' });
    s.sparkle({ at: 0.2, n: 5, base: 1760, v: 0.035, spread: 0.6 });
  } },
  // freezing the floor: a crackle racing outward, a glassy settle
  yuki_freeze: { vary: 0.04, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    for (let i = 0; i < 26; i++) s.noise({ at: i * 0.018 + R(0, 0.01), f: R(2500, 7000), q: 6, a: 0.001, d: R(0.01, 0.03), v: 0.12 * (1 - i / 30) });
    s.fm({ f: 1480, ratio: 3.7, index: 2, index2: 0.2, id: 0.15, a: 0.001, d: 0.8, v: 0.05, rev: 0.5 });
    s.tone({ pts: [[0, 140], [0.2, 70]], a: 0.002, d: 0.25, v: 0.25 });
  } },
  // sliding on the glare ice: a little skating hiss
  yuki_slide: { vary: 0.1, max: 1, gap: 0.5, trim: 1.1, fn(s) {
    // a soft skid across ice: a falling band of hiss (kept under ~2.4 kHz) and a faint glassy squeak
    s.noise({ ft: 'bandpass', pts: [[0, 2400], [0.4, 1200]], q: 2.4, a: 0.06, d: 0.36, v: 0.11 });
    s.noise({ ft: 'lowpass', f: 900, a: 0.04, d: 0.3, v: 0.05 });
  } },
  // mirrors rising: a shimmering chord that swells
  yuki_mirror: { vary: 0.03, max: 1, gap: 0.5, trim: 1.3, fn(s) {
    [784, 988, 1175, 1568].forEach((f, i) => s.fm({ at: i * 0.03, f, ratio: 2.01, index: 0.8, index2: 0.1, id: 0.4, a: 0.25, d: 0.8, v: 0.05, rev: 0.6 }));
    s.noise({ ft: 'highpass', f: 5000, a: 0.5, d: 0.4, v: 0.05, rev: 0.4 });
  } },
  // mirrors shattering
  yuki_mirror_shatter: { vary: 0.08, max: 3, gap: 0.08, trim: 1.1, fn(s) {
    s.tone({ pts: [[0, 200], [0.06, 90]], a: 0.001, d: 0.1, v: 0.2 });
    glass(s, 0, 22, 0.13);
    s.fm({ f: R(2600, 3200), ratio: 3.71, index: 2.4, index2: 0.3, id: 0.08, a: 0.001, d: 0.45, v: 0.06, rev: 0.4 });
    [2637, 3136, 3520].forEach((f, i) => s.bell({ at: 0.03 + i * 0.03, f: f * R(0.97, 1.03), d: 0.4, v: 0.035, rev: 0.4 }));
  } },
  // she dissolves into snow / reappears
  yuki_vanish: { vary: 0.04, max: 1, gap: 0.3, trim: 1.2, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 3000], [0.5, 900]], q: 1.2, a: 0.02, d: 0.5, v: 0.2, color: 'pink' });
    [2349, 1976, 1568].forEach((f, i) => s.bell({ at: i * 0.06, f, d: 0.5, v: 0.04, rev: 0.5 }));
  } },
  // the copies take aim
  yuki_aim: { vary: 0.04, max: 1, gap: 0.3, trim: 1.2, fn(s) {
    s.fm({ f: 1760, ratio: 2, index: 1.2, index2: 0.2, id: 0.2, a: 0.1, d: 0.6, v: 0.05, vib: [9, 30], rev: 0.4 });
    s.noise({ ft: 'highpass', pts: [[0, 3000], [0.8, 7000]], a: 0.6, d: 0.2, v: 0.05 });
  } },
  // ice darts loosed
  yuki_dart: { vary: 0.06, max: 2, gap: 0.1, trim: 1.2, fn(s) {
    for (let i = 0; i < 3; i++) s.noise({ at: i * 0.03, pts: [[0, 1500], [0.08, 5200]], q: 2, a: 0.004, d: 0.1, v: 0.3 });
    s.bell({ at: 0.02, f: 3136, d: 0.3, v: 0.04, rev: 0.3 });
  } },
  // phase 2: the whiteout rolls in (a huge swell of wind)
  yuki_whiteout: { vary: 0.02, max: 1, gap: 2, trim: 1.4, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 400], [1.0, 1400], [2.2, 600]], q: 0.7, a: 0.9, h: 0.5, d: 0.8, v: 0.55, am: [5, 0.3], color: 'pink' });
    s.noise({ ft: 'lowpass', f: 300, a: 0.6, h: 0.6, d: 0.8, v: 0.4, color: 'brown' });
    for (let i = 0; i < 4; i++) s.tone({ at: 0.3 + i * 0.35, pts: [[0, R(900, 1300)], [0.6, R(600, 800)]], a: 0.15, d: 0.4, v: 0.035, vib: [5, 80] });
    breathV(s, 0.2, 620, 520, 0.6, 0.08);
  } },
  // each new wave of the whiteout: a shorter gust
  yuki_wind: { vary: 0.05, max: 1, gap: 2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', pts: [[0, 500], [0.6, 1200], [1.3, 600]], q: 0.8, a: 0.5, h: 0.2, d: 0.6, v: 0.35, am: [6, 0.35], color: 'pink' });
  } },
  // frostbite away from the lanterns: a tiny icy nip
  yuki_frostbite: { vary: 0.1, max: 1, gap: 0.6, trim: 1.1, fn(s) {
    s.fm({ f: 2900, ratio: 3.3, index: 1.4, index2: 0.2, id: 0.05, a: 0.001, d: 0.12, v: 0.05 });
    s.noise({ ft: 'highpass', f: 5200, a: 0.005, d: 0.08, v: 0.06 });
  } },
  // calling her snow children
  yuki_call: { vary: 0.03, max: 1, gap: 1, trim: 1.3, fn(s) {
    [659, 784, 988].forEach((f, i) => s.voice({ at: i * 0.16, type: 'triangle', f: [[0, f], [0.14, f * 1.02]], form: [[0, [500, 1100, 2800]], [0.14, [550, 1200, 2900]]], amp: [[0, 0], [0.03, 0.7], [0.12, 0.5], [0.18, 0]], q: [8, 10, 12], breath: 0.4, body: 0.2, v: 0.09, rev: 0.5 }));
    s.sparkle({ at: 0.4, n: 4, base: 1760, v: 0.035 });
  } },
  yuki_hurt: { vary: 0.08, max: 1, gap: 0.6, trim: 1.2, fn(s) {
    breathV(s, 0, 900, 700, 0.14, 0.11);
    s.bell({ at: 0.01, f: R(2600, 3000), d: 0.25, v: 0.03, rev: 0.3 });
  } },
  // melting away: a long sigh and falling wind chimes
  yuki_defeat: { vary: 0.02, max: 1, trim: 1.3, fn(s) {
    breathV(s, 0, 700, 380, 1.2, 0.12);
    [2637, 2349, 1976, 1760, 1568, 1318, 1175].forEach((f, i) => s.bell({ at: 0.15 + i * 0.13, f, d: 1.2, v: 0.05, rev: 0.6 }));
    s.noise({ ft: 'bandpass', pts: [[0, 1500], [1.6, 500]], q: 0.8, a: 0.4, d: 1.4, v: 0.18, color: 'pink', rev: 0.5 });
  } },
};
