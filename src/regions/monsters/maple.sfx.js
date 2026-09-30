// Momiji Hollow monster sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// Autumn and cute: prickly burr rattles, a rolling chestnut, crackly roasted pops, straw rustles, wooden clacks and cawing
// crows for the scarecrow, papery leaf whooshes and warm little chimes for the wisps.
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // ---------------------------------------------------------------- kuri (chestnut-burr imp)
  // curling up: the burr clacks shut (a prickly crunch), a squeaky "hmph!" and a rising wind-up whirr
  kuri_curl: { vary: 0.08, max: 3, gap: 0.1, trim: 1.3, fn(s) {
    s.noise({ ft: 'highpass', f: 2600, a: 0.002, d: 0.06, v: 0.35 });
    for (let i = 0; i < 5; i++) s.noise({ at: 0.01 + i * 0.012, f: R(3200, 5200), q: 5, a: 0.001, d: 0.02, v: 0.14 });
    s.tone({ at: 0.02, pts: [[0, 180], [0.08, 110]], a: 0.003, d: 0.1, v: 0.22 });
    s.voice({ at: 0.06, f: [[0, 720], [0.07, 560], [0.14, 640]], form: [[0, [800, 1400, 2800]], [0.14, [650, 1200, 2600]]], amp: [[0, 0], [0.02, 0.8], [0.1, 0.6], [0.16, 0]], q: [6, 8, 10], breath: 0.25, body: 0.3, v: 0.18 });
    s.noise({ at: 0.25, pts: [[0, 300], [0.45, 1100]], q: 2, a: 0.3, h: 0.05, d: 0.1, v: 0.18, am: [18, 0.5], color: 'pink' });
  } },
  // the roll: a bumpy wooden rumble with prickle ticks, fading as it goes
  kuri_roll: { vary: 0.06, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 520, a: 0.03, h: 0.5, d: 0.45, v: 0.5, am: [14, 0.7], color: 'brown' });
    s.tone({ pts: [[0, 95], [1.0, 70]], type: 'triangle', a: 0.02, h: 0.4, d: 0.5, v: 0.12, am: [14, 0.6] });
    for (let i = 0; i < 12; i++) s.noise({ at: R(0.02, 0.9), f: R(2600, 4400), q: 6, a: 0.001, d: 0.015, v: 0.08 * (1 - i / 14) });
  } },
  // bonk: a hollow wooden knock + a burr rattle (hitting you, or a wall)
  kuri_bonk: { vary: 0.08, max: 3, gap: 0.08, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 320], [0.06, 150]], type: 'triangle', a: 0.002, d: 0.12, v: 0.42 });
    s.noise({ ft: 'lowpass', f: 1400, a: 0.002, d: 0.08, v: 0.4 });
    for (let i = 0; i < 6; i++) s.noise({ at: 0.02 + i * R(0.012, 0.02), f: R(3000, 5000), q: 5, a: 0.001, d: 0.02, v: 0.12 });
    s.tone({ at: 0.04, pts: [[0, 900], [0.3, 600]], a: 0.004, d: 0.3, v: 0.05, vib: [16, 70] });
  } },
  // spikes bristling before the snap: a prickly rising shiver
  kuri_snapwind: { vary: 0.08, max: 3, gap: 0.1, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 1800], [0.4, 4200]], q: 3, a: 0.3, h: 0.05, d: 0.06, v: 0.14, am: [34, 0.7] });
    s.tone({ pts: [[0, 600], [0.4, 900]], type: 'triangle', a: 0.05, h: 0.25, d: 0.1, v: 0.05, vib: [22, 40] });
  } },
  // the snap: a sharp prickly crunch and a squeaky "ha!"
  kuri_snap: { vary: 0.08, max: 3, gap: 0.08, trim: 1.3, fn(s) {
    s.noise({ ft: 'highpass', f: 1800, a: 0.001, d: 0.09, v: 0.5 });
    for (let i = 0; i < 8; i++) s.noise({ at: R(0, 0.06), f: R(2800, 5600), q: 6, a: 0.001, d: 0.02, v: 0.16 });
    s.tone({ pts: [[0, 240], [0.05, 120]], a: 0.002, d: 0.08, v: 0.25 });
    s.voice({ at: 0.03, f: [[0, 820], [0.05, 1020], [0.12, 780]], form: [[0, [900, 1500, 3000]], [0.12, [760, 1300, 2800]]], amp: [[0, 0], [0.015, 1], [0.08, 0.6], [0.13, 0]], q: [6, 8, 10], breath: 0.2, body: 0.3, v: 0.17 });
  } },
  kuri_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 880], [0.05, 1250], [0.13, 760]], type: 'triangle', a: 0.003, d: 0.12, v: 0.12, lp: 4000 });
    s.noise({ f: 3400, q: 3, a: 0.001, d: 0.03, v: 0.1 });
  } },
  // a roasted-chestnut "POP!", a falling squeak and a spill of prickles
  kuri_die: { vary: 0.08, max: 2, trim: 1.2, fn(s) {
    s.noise({ ft: 'lowpass', f: 2200, a: 0.001, d: 0.05, v: 0.55 });
    s.tone({ pts: [[0, 420], [0.03, 900], [0.1, 520]], a: 0.002, d: 0.1, v: 0.3 });
    s.tone({ at: 0.06, pts: [[0, 1300], [0.07, 1500], [0.4, 540]], type: 'triangle', a: 0.005, d: 0.38, v: 0.11, vib: [9, 40, 0.1], lp: 4000 });
    for (let i = 0; i < 7; i++) s.noise({ at: R(0.08, 0.35), f: R(2800, 5000), q: 5, a: 0.001, d: 0.02, v: 0.09 });
    s.sparkle({ at: 0.22, n: 3, base: 1397, v: 0.04, spread: 0.25 });
  } },

  // ---------------------------------------------------------------- kakashi (hopping scarecrow)
  // winding up: a dry straw rattle over wooden clacks, and the crows ruffling
  kakashi_rattle: { vary: 0.06, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 3200, q: 0.9, a: 0.05, h: 0.45, d: 0.2, v: 0.22, am: [26, 0.8], color: 'pink' });
    for (let i = 0; i < 9; i++) { const at = i * R(0.07, 0.09); s.tone({ at, f: R(620, 760), type: 'triangle', a: 0.001, d: 0.035, v: 0.12 }); s.noise({ at, f: R(1800, 2300), q: 6, a: 0.001, d: 0.02, v: 0.12 }); }
    s.noise({ at: 0.3, pts: [[0, 900], [0.3, 1800]], q: 1.2, a: 0.02, d: 0.3, v: 0.12, am: [30, 0.9] });
  } },
  // the crows take off: "KAA! KAA!"
  kakashi_caw: { vary: 0.07, max: 2, gap: 0.15, trim: 1.25, fn(s) {
    for (let i = 0; i < 2; i++) {
      const at = i * 0.21, p = i ? 0.94 : 1;
      s.voice({ at, f: [[0, 560 * p], [0.05, 720 * p], [0.18, 520 * p]], form: [[0, [1100, 1700, 3000]], [0.08, [1300, 1900, 3200]], [0.18, [900, 1500, 2800]]], amp: [[0, 0], [0.02, 1], [0.12, 0.8], [0.19, 0]], q: [5, 7, 9], breath: 0.35, rough: 0.5, roughF: 70, body: 0.25, v: 0.2 });
    }
    s.noise({ at: 0.05, ft: 'bandpass', f: 1400, q: 0.8, a: 0.01, d: 0.25, v: 0.16, am: [16, 0.9] });
  } },
  // a crow clips you: a flap and a peck
  kakashi_peck: { vary: 0.1, max: 3, gap: 0.08, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 1200, q: 1, a: 0.005, d: 0.12, v: 0.3, am: [22, 0.9] });
    s.tone({ at: 0.03, f: 1900, f2: 1200, type: 'triangle', a: 0.001, d: 0.04, v: 0.15 });
    s.noise({ at: 0.03, f: 3800, q: 4, a: 0.001, d: 0.02, v: 0.2 });
  } },
  // the springy hop up: a wooden "boing"
  kakashi_hop: { vary: 0.1, max: 3, gap: 0.12, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 180], [0.05, 360], [0.22, 300]], a: 0.004, d: 0.24, v: 0.2, vib: [20, 90] });
    s.noise({ ft: 'bandpass', f: 2800, q: 1, a: 0.01, d: 0.12, v: 0.08, color: 'pink' });
  } },
  // landing on you: a heavy wooden thump, a straw whoomph
  kakashi_stomp: { vary: 0.06, max: 2, gap: 0.1, trim: 1.1, fn(s) {
    s.tone({ pts: [[0, 150], [0.12, 60]], a: 0.002, d: 0.2, v: 0.5 });
    s.noise({ ft: 'lowpass', f: 900, a: 0.002, d: 0.16, v: 0.5 });
    s.noise({ at: 0.02, ft: 'bandpass', f: 2600, q: 0.8, a: 0.01, d: 0.3, v: 0.2, am: [24, 0.8], color: 'pink' });
    s.tone({ at: 0.01, f: 520, f2: 400, type: 'triangle', a: 0.001, d: 0.06, v: 0.12 });
  } },
  kakashi_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.25, fn(s) {
    s.noise({ ft: 'bandpass', f: 2800, q: 1, a: 0.002, d: 0.1, v: 0.25, color: 'pink' });
    s.tone({ f: 540, f2: 380, type: 'triangle', a: 0.002, d: 0.07, v: 0.12 });
  } },
  // collapsing into a heap of straw while the crows scatter
  kakashi_die: { vary: 0.05, max: 2, trim: 1.2, fn(s) {
    s.noise({ ft: 'bandpass', f: 2400, q: 0.8, a: 0.02, d: 0.5, v: 0.28, am: [20, 0.8], color: 'pink' });
    for (let i = 0; i < 4; i++) s.tone({ at: 0.05 + i * 0.08, f: R(500, 700) * (1 - i * 0.12), type: 'triangle', a: 0.001, d: 0.05, v: 0.12 });
    s.voice({ at: 0.18, f: [[0, 600], [0.06, 740], [0.2, 520]], form: [[0, [1100, 1700, 3000]], [0.2, [900, 1500, 2800]]], amp: [[0, 0], [0.02, 0.8], [0.14, 0.6], [0.2, 0]], q: [5, 7, 9], breath: 0.35, rough: 0.5, roughF: 70, v: 0.12 });
    s.noise({ at: 0.2, ft: 'bandpass', f: 1300, q: 0.8, a: 0.01, d: 0.4, v: 0.14, am: [14, 0.9] });
  } },

  // ---------------------------------------------------------------- momiji wisp (leaf-swarm sprite)
  // leaves gathering: a papery swirl rising into a warm little chord
  wisp_gather: { vary: 0.05, max: 3, gap: 0.15, trim: 1.4, fn(s) {
    s.noise({ pts: [[0, 700], [0.6, 2600]], q: 1.6, a: 0.45, h: 0.1, d: 0.12, v: 0.2, am: [20, 0.6], color: 'pink' });
    for (let i = 0; i < 8; i++) s.noise({ at: R(0.05, 0.6), f: R(3000, 5200), q: 4, a: 0.004, d: 0.03, v: 0.05 });
    [784, 988, 1175].forEach((f, i) => s.bell({ at: 0.35 + i * 0.07, f, d: 0.5, v: 0.03, rev: 0.4 }));
  } },
  // the flurry: a spray of leafy "fwip"s
  wisp_flurry: { vary: 0.07, max: 3, gap: 0.1, trim: 1.4, fn(s) {
    for (let i = 0; i < 6; i++) s.noise({ at: i * 0.045, pts: [[0, 1100], [0.06, 3400]], q: 2, a: 0.004, d: 0.07, v: 0.28 });
    s.noise({ ft: 'bandpass', f: 2600, q: 0.7, a: 0.02, d: 0.3, v: 0.1, color: 'pink' });
    s.bell({ at: 0.02, f: 1568, d: 0.3, v: 0.03, rev: 0.3 });
  } },
  // spinning up to whirl
  wisp_whirl: { vary: 0.06, max: 3, gap: 0.1, trim: 1.4, fn(s) {
    s.noise({ pts: [[0, 500], [0.5, 2400]], q: 2.5, a: 0.35, h: 0.1, d: 0.08, v: 0.26, color: 'pink' });
    s.noise({ ft: 'bandpass', f: 1800, q: 1.2, a: 0.3, h: 0.1, d: 0.1, v: 0.12, am: [24, 0.8] });
  } },
  // the whirl bursts outward
  wisp_burst: { vary: 0.07, max: 3, gap: 0.1, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 3000], [0.25, 700]], q: 1.3, a: 0.004, d: 0.3, v: 0.5 });
    for (let i = 0; i < 8; i++) s.noise({ at: R(0, 0.2), f: R(2500, 5000), q: 4, a: 0.002, d: 0.03, v: 0.1 });
    s.tone({ pts: [[0, 200], [0.1, 110]], a: 0.003, d: 0.12, v: 0.18 });
  } },
  // scattering into leaves: a soft sparkly puff
  wisp_blink: { vary: 0.05, max: 2, gap: 0.2, trim: 1.4, fn(s) {
    s.noise({ ft: 'bandpass', f: 2200, f2: 900, q: 1, a: 0.01, d: 0.3, v: 0.18, color: 'pink' });
    s.sparkle({ at: 0.03, n: 4, base: 1760, v: 0.04, spread: 0.3 });
  } },
  wisp_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 1250], [0.04, 1600], [0.1, 1050]], type: 'triangle', a: 0.002, d: 0.1, v: 0.11, lp: 5000 });
    s.noise({ f: 3000, q: 2, a: 0.002, d: 0.05, v: 0.08, color: 'pink' });
  } },
  // fading out: a leafy exhale and a falling chime
  wisp_die: { vary: 0.04, max: 2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 1800, f2: 700, q: 1.3, a: 0.1, d: 0.5, v: 0.14, color: 'pink', rev: 0.4 });
    [1318, 1175, 988, 784, 659].forEach((f, i) => s.bell({ at: 0.04 + i * 0.07, f, d: 0.6, v: 0.045, rev: 0.5 }));
  } },
};
