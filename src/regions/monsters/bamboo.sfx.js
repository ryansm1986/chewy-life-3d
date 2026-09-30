// Whispering Bamboo Grove monster sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// Soft and cute: wooden rattles, leafy whooshes, dirt scuffles, a cork "pon!" for the takenoko pop, squeaky weasels.
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // ---------------------------------------------------------------- takenoko (bamboo shoot sprite)
  // wind-up before the spin: a little rising whirr + a "hup"
  takenoko_wind: { vary: 0.08, max: 3, gap: 0.08, trim: 1.4, fn(s) {
    s.noise({ pts: [[0, 500], [0.35, 1600]], q: 2.2, a: 0.12, h: 0.1, d: 0.12, v: 0.25, color: 'pink' });
    s.voice({ at: 0.02, f: [[0, 520], [0.08, 700], [0.16, 620]], form: [[0, [700, 1300, 2700]], [0.16, [800, 1500, 2900]]], amp: [[0, 0], [0.02, 0.9], [0.12, 0.7], [0.18, 0]], q: [6, 8, 10], breath: 0.25, body: 0.3, v: 0.22 });
  } },
  // spin-slash: a leafy whoosh with rustle crackle and a squeaky "hya!"
  takenoko_spin: { vary: 0.08, max: 3, gap: 0.08, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 700], [0.12, 2600], [0.32, 800]], q: 1.4, a: 0.03, d: 0.28, v: 0.7 });
    for (let i = 0; i < 6; i++) s.noise({ at: R(0.02, 0.26), f: R(3000, 5200), q: 3, a: 0.001, d: 0.015, v: 0.18 });
    s.voice({ at: 0.01, f: [[0, 820], [0.05, 1080], [0.14, 760]], form: [[0, [900, 1500, 3000]], [0.14, [700, 1250, 2700]]], amp: [[0, 0], [0.015, 1], [0.1, 0.7], [0.16, 0]], q: [6, 8, 10], breath: 0.2, body: 0.3, v: 0.2 });
  } },
  // diving into the ground: dirt scuffle + two soft thuds
  takenoko_dig: { vary: 0.08, max: 2, gap: 0.1, trim: 1.4, fn(s) {
    s.noise({ ft: 'lowpass', f: 1200, f2: 400, a: 0.02, h: 0.15, d: 0.25, v: 0.5, am: [22, 0.6], color: 'brown' });
    s.tone({ pts: [[0, 180], [0.1, 90]], a: 0.004, d: 0.12, v: 0.25 });
    s.tone({ at: 0.18, pts: [[0, 150], [0.1, 80]], a: 0.004, d: 0.12, v: 0.18 });
    s.tone({ at: 0.05, pts: [[0, 900], [0.25, 380]], type: 'triangle', a: 0.01, d: 0.2, v: 0.05 });
  } },
  // moving underground (repeats while it tunnels near you): a quiet bumpy rumble
  takenoko_burrow: { vary: 0.1, max: 2, gap: 0.4, trim: 1.2, fn(s) {
    s.noise({ ft: 'lowpass', f: 380, a: 0.08, h: 0.2, d: 0.2, v: 0.35, am: [11, 0.7], color: 'brown' });
    s.noise({ at: R(0.05, 0.3), f: R(1800, 2600), q: 4, a: 0.001, d: 0.02, v: 0.06 });
  } },
  // about to pop: the rumble swells, pebbles skitter
  takenoko_rumble: { vary: 0.05, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 260, f2: 900, a: 0.5, h: 0.2, d: 0.1, v: 0.45, am: [16, 0.6], color: 'brown' });
    for (let i = 0; i < 6; i++) s.noise({ at: R(0.2, 0.75), f: R(2000, 3400), q: 5, a: 0.001, d: 0.015, v: 0.08 });
  } },
  // the pop: a cork "PON!", dirt spray and a springy boing
  takenoko_pop: { vary: 0.06, max: 2, gap: 0.1, trim: 1.1, fn(s) {
    s.tone({ pts: [[0, 240], [0.04, 560], [0.12, 420]], a: 0.002, d: 0.14, v: 0.5 });
    s.noise({ ft: 'lowpass', f: 1500, a: 0.002, d: 0.08, v: 0.5 });
    s.noise({ at: 0.02, ft: 'highpass', f: 3500, a: 0.01, d: 0.22, v: 0.12 });
    s.tone({ at: 0.05, pts: [[0, 300], [0.06, 700], [0.25, 520]], a: 0.005, d: 0.25, v: 0.12, vib: [18, 60] });
    s.tone({ at: 0.0, pts: [[0, 110], [0.15, 60]], a: 0.003, d: 0.18, v: 0.3 });
  } },
  takenoko_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 950], [0.05, 1350], [0.13, 820]], type: 'triangle', a: 0.003, d: 0.12, v: 0.12, lp: 4000 });
    s.noise({ f: 2600, q: 2, a: 0.002, d: 0.04, v: 0.08 });
  } },
  // "pyuu~": a falling squeak and a rustle of husks
  takenoko_die: { vary: 0.08, max: 2, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 1250], [0.08, 1450], [0.4, 520]], type: 'triangle', a: 0.005, d: 0.38, v: 0.12, vib: [9, 40, 0.1], lp: 4000 });
    s.noise({ pts: [[0, 3000], [0.35, 1200]], q: 1.2, a: 0.02, d: 0.35, v: 0.18, am: [30, 0.5] });
    s.sparkle({ at: 0.2, n: 3, base: 1568, v: 0.04, spread: 0.25 });
  } },

  // ---------------------------------------------------------------- kodama (tree spirit)
  // the signature "karakara": a hollow wooden head rattle
  kodama_rattle: { vary: 0.08, max: 3, gap: 0.5, trim: 1.3, fn(s) {
    let at = 0;
    const n = 9 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const u = i / n, sp = 0.028 + 0.03 * Math.abs(u - 0.4);
      const f = R(760, 980) * (1 + (i % 2) * 0.18);
      s.tone({ at, f, type: 'triangle', a: 0.001, d: 0.035, v: 0.16 * (1 - u * 0.5) });
      s.noise({ at, f: f * 2.6, q: 7, a: 0.001, d: 0.018, v: 0.2 * (1 - u * 0.5) });
      at += sp;
    }
  } },
  // leaf darts: three quick "fwip"s
  kodama_shoot: { vary: 0.08, max: 3, gap: 0.1, trim: 1.5, fn(s) {
    for (let i = 0; i < 3; i++) s.noise({ at: i * 0.045, pts: [[0, 1200], [0.06, 3600]], q: 2, a: 0.005, d: 0.06, v: 0.35 });
    s.bell({ at: 0.02, f: 2349, d: 0.25, v: 0.035, rev: 0.3 });
  } },
  kodama_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.3, fn(s) {
    s.tone({ f: 620, f2: 470, type: 'triangle', a: 0.002, d: 0.08, v: 0.16 });
    s.noise({ f: 1700, q: 5, a: 0.001, d: 0.03, v: 0.18 });
  } },
  // fading away: a breath of air and a soft descending chime
  kodama_die: { vary: 0.04, max: 2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 1400, f2: 700, q: 1.5, a: 0.15, d: 0.4, v: 0.12, color: 'pink', rev: 0.4 });
    [1568, 1318, 1046, 784].forEach((f, i) => s.bell({ at: 0.05 + i * 0.07, f, d: 0.6, v: 0.05, rev: 0.5 }));
  } },

  // ---------------------------------------------------------------- kamaitachi (sickle weasel)
  // rearing up: a blade "shiiing" over a gathering gust
  kamaitachi_wind: { vary: 0.05, max: 2, gap: 0.12, trim: 1.3, fn(s) {
    s.fm({ f: 2900, ratio: 3.3, index: 1.4, index2: 0.2, id: 0.2, a: 0.004, d: 0.4, v: 0.06, rev: 0.3 });
    s.noise({ ft: 'highpass', f: 5200, a: 0.05, d: 0.3, v: 0.06 });
    s.noise({ pts: [[0, 350], [0.5, 1300]], q: 1.2, a: 0.35, h: 0.1, d: 0.1, v: 0.25, color: 'pink' });
  } },
  // the dash: a fast whoosh and a "kyu!"
  kamaitachi_dash: { vary: 0.08, max: 3, gap: 0.08, trim: 1.4, fn(s) {
    s.noise({ pts: [[0, 600], [0.07, 4200], [0.22, 900]], q: 2, a: 0.01, d: 0.2, v: 0.75 });
    s.tone({ pts: [[0, 1600], [0.04, 2250], [0.1, 1500]], type: 'triangle', a: 0.002, d: 0.09, v: 0.1, lp: 5000 });
  } },
  kamaitachi_nip: { vary: 0.1, max: 3, gap: 0.08, trim: 1.4, fn(s) {
    s.noise({ f: 3600, q: 3, a: 0.001, d: 0.035, v: 0.35 });
    s.tone({ f: 1900, f2: 1400, type: 'triangle', a: 0.001, d: 0.05, v: 0.08 });
  } },
  // standing in its wind trail: a tiny cutting breeze
  // the wind trail nicks you: a quick falling slice of air ("fsst"), a thin edge on top and a tiny tink of the sickle
  // (was a bare >3.8 kHz hiss, flagged HARSH by the render check)
  kamaitachi_nick: { vary: 0.12, max: 2, gap: 0.2, trim: 2.0, fn(s) {
    s.noise({ pts: [[0, 3000], [0.09, 1100]], q: 1.6, a: 0.004, d: 0.09, v: 0.3, color: 'pink' });
    s.noise({ ft: 'highpass', f: 4200, a: 0.003, d: 0.035, v: 0.05, lp: 8000 });
    s.tone({ pts: [[0, 2350], [0.05, 2250]], a: 0.001, d: 0.05, v: 0.03 });
  } },
  kamaitachi_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 1400], [0.05, 1950], [0.12, 1250]], type: 'triangle', a: 0.002, d: 0.11, v: 0.12, lp: 5000 });
  } },
  // "kyuuu~"
  kamaitachi_die: { vary: 0.06, max: 2, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 1700], [0.12, 2100], [0.5, 850]], type: 'triangle', a: 0.004, d: 0.5, v: 0.12, vib: [8, 50, 0.1], lp: 5000 });
    s.noise({ pts: [[0, 2000], [0.4, 600]], q: 1.2, a: 0.1, d: 0.3, v: 0.1, color: 'pink' });
    s.sparkle({ at: 0.25, n: 3, base: 1760, v: 0.035, spread: 0.3 });
  } },
};
