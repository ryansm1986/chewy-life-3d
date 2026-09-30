// Yukimi Onsen monster sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// Soft and wintry: snow crunches and pats, straw rustles, little child voices for the warashi, a grumbly snowman with
// a wooden bucket "konk", and glassy chimes / tinkles / shatters for the icicle wraith.
const R = (a, b) => a + Math.random() * (b - a);
const crunch = (s, at, n, v, f = 2200) => { for (let i = 0; i < n; i++) s.noise({ at: at + R(0, 0.12), f: R(f * 0.7, f * 1.4), q: 2.5, a: 0.001, d: R(0.01, 0.03), v: v * R(0.6, 1) }); };

export const SFX = {
  // ---------------------------------------------------------------- yuki-warashi (snow child)
  // winding up a volley: a little "ei!" and snow patted into a ball
  warashi_wind: { vary: 0.08, max: 3, gap: 0.1, trim: 1.3, fn(s) {
    s.voice({ at: 0.02, f: [[0, 760], [0.06, 980], [0.15, 900]], form: [[0, [620, 2100, 2900]], [0.15, [520, 2300, 3100]]], amp: [[0, 0], [0.02, 0.9], [0.11, 0.7], [0.17, 0]], q: [6, 9, 11], breath: 0.3, body: 0.3, v: 0.2 });
    for (let i = 0; i < 3; i++) s.noise({ at: 0.14 + i * 0.09, ft: 'lowpass', f: 1400, a: 0.004, d: 0.05, v: 0.22, color: 'pink' });
    crunch(s, 0.14, 4, 0.05);
  } },
  // a snowball thrown: a soft "fwip"
  warashi_throw: { vary: 0.1, max: 4, gap: 0.05, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 700], [0.07, 2600], [0.16, 900]], q: 1.6, a: 0.008, d: 0.13, v: 0.45 });
    s.tone({ at: 0.01, pts: [[0, 900], [0.06, 1300]], type: 'triangle', a: 0.003, d: 0.06, v: 0.05 });
  } },
  // splat: a padded thud, a crunchy spray and a puff
  warashi_splat: { vary: 0.1, max: 4, gap: 0.05, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 190], [0.08, 90]], a: 0.002, d: 0.1, v: 0.35 });
    s.noise({ ft: 'lowpass', f: 1800, f2: 600, a: 0.002, d: 0.14, v: 0.45, color: 'pink' });
    crunch(s, 0.01, 7, 0.1, 2600);
    s.noise({ at: 0.03, ft: 'highpass', f: 4200, a: 0.02, d: 0.18, v: 0.06 });
  } },
  // hopping back: a springy boing and a "hup"
  warashi_hop: { vary: 0.08, max: 2, gap: 0.2, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 320], [0.08, 700], [0.2, 560]], a: 0.004, d: 0.2, v: 0.14, vib: [16, 50] });
    s.voice({ f: [[0, 820], [0.07, 1040]], form: [[0, [700, 1400, 2900]], [0.1, [800, 1600, 3000]]], amp: [[0, 0], [0.015, 0.8], [0.08, 0]], q: [6, 8, 10], breath: 0.3, body: 0.3, v: 0.15 });
  } },
  // idle: a giggle while scooping snow
  warashi_giggle: { vary: 0.08, max: 2, gap: 1.5, trim: 1.1, fn(s) {
    for (let i = 0; i < 4; i++) s.voice({ at: i * 0.09, f: [[0, 1100 - i * 40], [0.05, 1280 - i * 50]], form: [[0, [800, 1700, 3100]], [0.06, [750, 1600, 3000]]], amp: [[0, 0], [0.012, 0.8], [0.05, 0.3], [0.07, 0]], q: [6, 8, 10], breath: 0.35, body: 0.2, v: 0.1 });
  } },
  warashi_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.2, fn(s) {
    s.voice({ f: [[0, 1150], [0.04, 1450], [0.14, 980]], form: [[0, [900, 1800, 3200]], [0.14, [700, 1500, 2900]]], amp: [[0, 0], [0.01, 1], [0.08, 0.6], [0.15, 0]], q: [6, 8, 10], breath: 0.3, body: 0.3, v: 0.14 });
    crunch(s, 0, 3, 0.05);
  } },
  // "pyuu~": a falling squeak, straw rustle, a soft snow crumble, a little chime
  warashi_die: { vary: 0.06, max: 2, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 1300], [0.08, 1500], [0.45, 560]], type: 'triangle', a: 0.005, d: 0.42, v: 0.12, vib: [9, 40, 0.1], lp: 4200 });
    s.noise({ pts: [[0, 2800], [0.3, 1100]], q: 1.2, a: 0.02, d: 0.3, v: 0.12, am: [26, 0.5] });
    s.noise({ at: 0.1, ft: 'lowpass', f: 1200, f2: 400, a: 0.02, d: 0.35, v: 0.25, color: 'pink' });
    s.sparkle({ at: 0.25, n: 3, base: 1760, v: 0.035, spread: 0.3 });
  } },

  // ---------------------------------------------------------------- yuki-daruma (snowman brute)
  // curling up to roll: a deep "hmph" and snow gathering round him
  daruma_curl: { vary: 0.05, max: 2, gap: 0.2, trim: 1.4, fn(s) {
    s.voice({ f: [[0, 150], [0.12, 125], [0.3, 110]], form: [[0, [450, 900, 2300]], [0.3, [380, 800, 2200]]], amp: [[0, 0], [0.03, 0.9], [0.22, 0.6], [0.32, 0]], q: [5, 7, 9], breath: 0.2, body: 0.6, rough: 0.3, roughF: 34, v: 0.3 });
    s.noise({ at: 0.1, ft: 'lowpass', f: 700, f2: 2400, a: 0.6, h: 0.1, d: 0.12, v: 0.22, am: [18, 0.5], color: 'pink' });
    crunch(s, 0.2, 8, 0.05, 1800);
  } },
  // rolling: a heavy snowball rumble with crunchy ticks
  daruma_roll: { vary: 0.05, max: 2, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 420, f2: 260, a: 0.06, h: 0.9, d: 0.35, v: 0.5, am: [9, 0.55], color: 'brown' });
    s.noise({ ft: 'bandpass', f: 1500, q: 1, a: 0.05, h: 0.8, d: 0.3, v: 0.1, am: [13, 0.8], color: 'pink' });
    crunch(s, 0.05, 14, 0.05, 2000); crunch(s, 0.6, 10, 0.04, 2000);
  } },
  // bowling into Chewy: a big padded whump
  daruma_hit: { vary: 0.06, max: 2, gap: 0.1, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 130], [0.14, 55]], a: 0.002, d: 0.2, v: 0.5 });
    s.noise({ ft: 'lowpass', f: 1600, f2: 500, a: 0.002, d: 0.22, v: 0.5, color: 'pink' });
    crunch(s, 0.01, 8, 0.1, 2400);
  } },
  // popping back out of the snowball
  daruma_pop: { vary: 0.06, max: 2, gap: 0.2, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 220], [0.05, 460], [0.14, 380]], a: 0.002, d: 0.14, v: 0.3 });
    s.noise({ ft: 'lowpass', f: 2000, f2: 700, a: 0.002, d: 0.2, v: 0.4, color: 'pink' });
    crunch(s, 0.02, 8, 0.07);
    s.tone({ at: 0.12, pts: [[0, 700], [0.25, 500]], type: 'triangle', a: 0.01, d: 0.3, v: 0.05, vib: [7, 60] });
  } },
  // rolling into a wall: the bucket goes "konk", a boing, stars
  daruma_bonk: { vary: 0.05, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 140], [0.12, 60]], a: 0.002, d: 0.16, v: 0.45 });
    s.tone({ f: 520, type: 'triangle', a: 0.001, d: 0.18, v: 0.22 }); s.tone({ f: 790, type: 'triangle', a: 0.001, d: 0.12, v: 0.12 });
    s.noise({ ft: 'lowpass', f: 1800, a: 0.002, d: 0.12, v: 0.35, color: 'pink' });
    s.tone({ at: 0.08, pts: [[0, 300], [0.1, 620], [0.4, 480]], a: 0.005, d: 0.4, v: 0.08, vib: [14, 80] });
    s.sparkle({ at: 0.18, n: 4, base: 1568, v: 0.035, spread: 0.3 });
  } },
  // raising both fists: a rising grunt and creaking ice
  daruma_slam_wind: { vary: 0.05, max: 2, gap: 0.2, trim: 1.4, fn(s) {
    s.voice({ f: [[0, 120], [0.4, 175], [0.7, 190]], form: [[0, [420, 850, 2200]], [0.7, [520, 1000, 2400]]], amp: [[0, 0], [0.08, 0.7], [0.6, 0.9], [0.75, 0]], q: [5, 7, 9], breath: 0.2, body: 0.6, rough: 0.35, roughF: 30, v: 0.26 });
    for (let i = 0; i < 5; i++) s.noise({ at: R(0.1, 0.7), f: R(2500, 4200), q: 6, a: 0.001, d: 0.02, v: 0.06 });
  } },
  // the frost slam: a deep thud, an ice crack, a burst of snow
  daruma_slam: { vary: 0.05, max: 2, gap: 0.15, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 95], [0.2, 42]], a: 0.002, d: 0.32, v: 0.6 });
    s.noise({ ft: 'lowpass', f: 1400, f2: 300, a: 0.002, d: 0.3, v: 0.55, color: 'brown' });
    for (let i = 0; i < 16; i++) s.noise({ at: R(0, 0.18), f: R(3000, 6500), q: 5, a: 0.001, d: R(0.008, 0.025), v: 0.12 });
    s.fm({ at: 0.01, f: 1900, ratio: 3.7, index: 2, index2: 0.2, id: 0.1, a: 0.001, d: 0.3, v: 0.05, rev: 0.3 });
    crunch(s, 0.02, 8, 0.08);
  } },
  daruma_grumble: { vary: 0.08, max: 1, gap: 2, trim: 1.1, fn(s) {
    s.voice({ f: [[0, 130], [0.2, 118], [0.45, 105]], form: [[0, [400, 850, 2200]], [0.45, [360, 760, 2100]]], amp: [[0, 0], [0.05, 0.6], [0.35, 0.5], [0.5, 0]], q: [5, 7, 9], breath: 0.2, body: 0.6, rough: 0.4, roughF: 28, v: 0.18 });
  } },
  daruma_hurt: { vary: 0.08, max: 2, gap: 0.45, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 190], [0.05, 230], [0.2, 150]], form: [[0, [500, 950, 2300]], [0.2, [420, 850, 2200]]], amp: [[0, 0], [0.02, 1], [0.12, 0.6], [0.22, 0]], q: [5, 7, 9], breath: 0.2, body: 0.6, v: 0.24 });
    crunch(s, 0, 4, 0.06);
  } },
  // crumbling into a snow pile: a sad "ohh", the bucket clanks down
  daruma_die: { vary: 0.05, max: 2, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 170], [0.2, 150], [0.7, 95]], form: [[0, [480, 900, 2300]], [0.7, [360, 700, 2000]]], amp: [[0, 0], [0.05, 0.8], [0.5, 0.5], [0.75, 0]], q: [5, 7, 9], breath: 0.25, body: 0.6, v: 0.24 });
    s.noise({ at: 0.1, ft: 'lowpass', f: 900, f2: 250, a: 0.05, d: 0.7, v: 0.4, am: [14, 0.5], color: 'brown' });
    crunch(s, 0.1, 14, 0.06, 1800);
    s.tone({ at: 0.45, f: 520, type: 'triangle', a: 0.001, d: 0.2, v: 0.12 }); s.tone({ at: 0.58, f: 560, type: 'triangle', a: 0.001, d: 0.15, v: 0.07 });
  } },

  // ---------------------------------------------------------------- tsurara (icicle wraith)
  // calling the rain: an icy rising arpeggio over a shimmer
  tsurara_cast: { vary: 0.05, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    [1318, 1760, 2349, 2637].forEach((f, i) => s.bell({ at: i * 0.05, f, d: 0.6, v: 0.06, rev: 0.45 }));
    s.noise({ ft: 'highpass', f: 5200, a: 0.1, d: 0.4, v: 0.06, rev: 0.4 });
    s.tone({ pts: [[0, 600], [0.3, 1200]], a: 0.08, d: 0.2, v: 0.04, vib: [6, 30], rev: 0.4 });
  } },
  // an icicle whistling down
  tsurara_fall: { vary: 0.08, max: 4, gap: 0.05, trim: 1.1, fn(s) {
    s.tone({ pts: [[0, 2600], [0.3, 900]], a: 0.02, d: 0.28, v: 0.04 });
    s.noise({ pts: [[0, 3000], [0.3, 1200]], q: 3, a: 0.05, d: 0.25, v: 0.08 });
  } },
  // the shatter: a glassy crash of tinkles over a small thud
  tsurara_shatter: { vary: 0.1, max: 5, gap: 0.04, trim: 1.1, fn(s) {
    s.tone({ pts: [[0, 160], [0.06, 80]], a: 0.001, d: 0.08, v: 0.25 });
    for (let i = 0; i < 14; i++) s.noise({ at: R(0, 0.14), f: R(3500, 8000), q: 6, a: 0.001, d: R(0.01, 0.04), v: 0.12 });
    s.fm({ f: R(2200, 2800), ratio: 3.71, index: 2.2, index2: 0.3, id: 0.08, a: 0.001, d: 0.35, v: 0.06, rev: 0.35 });
    s.bell({ at: 0.02, f: R(3000, 3600), d: 0.3, v: 0.04, rev: 0.3 });
  } },
  // blinking out: glints swirling down
  tsurara_blink_out: { vary: 0.05, max: 2, gap: 0.15, trim: 1.2, fn(s) {
    [2637, 2093, 1568, 1318].forEach((f, i) => s.bell({ at: i * 0.045, f, d: 0.35, v: 0.05, rev: 0.4 }));
    s.noise({ pts: [[0, 6000], [0.3, 1800]], q: 1.5, a: 0.02, d: 0.3, v: 0.08 });
  } },
  // reappearing: glints swirling up, a bright "tink"
  tsurara_blink_in: { vary: 0.05, max: 2, gap: 0.15, trim: 1.2, fn(s) {
    s.noise({ pts: [[0, 1800], [0.2, 6000]], q: 1.5, a: 0.1, d: 0.1, v: 0.08 });
    [1318, 1760, 2637].forEach((f, i) => s.bell({ at: 0.1 + i * 0.04, f, d: 0.4, v: 0.05, rev: 0.4 }));
    s.fm({ at: 0.2, f: 3136, ratio: 2, index: 0.9, id: 0.06, a: 0.001, d: 0.3, v: 0.06, rev: 0.3 });
  } },
  // idle: a soft, cold, ghostly "ooo"
  tsurara_wail: { vary: 0.08, max: 1, gap: 3, trim: 1.1, fn(s) {
    s.voice({ type: 'triangle', f: [[0, 520], [0.4, 600], [1.0, 470]], form: [[0, [320, 800, 2500]], [1, [350, 760, 2400]]], amp: [[0, 0], [0.3, 0.6], [0.8, 0.4], [1.1, 0]], q: [7, 9, 11], breath: 0.5, body: 0.2, vib: [5, 40, 0.2], v: 0.07, rev: 0.5 });
    s.noise({ ft: 'highpass', f: 5000, a: 0.3, d: 0.6, v: 0.025, rev: 0.4 });
  } },
  tsurara_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.2, fn(s) {
    s.fm({ f: 2400, ratio: 3.3, index: 1.5, index2: 0.2, id: 0.05, a: 0.001, d: 0.14, v: 0.08 });
    s.voice({ type: 'triangle', f: [[0, 820], [0.1, 640]], form: [[0, [350, 850, 2600]], [0.12, [320, 800, 2500]]], amp: [[0, 0], [0.02, 0.8], [0.12, 0]], q: [7, 9, 11], breath: 0.4, body: 0.2, v: 0.08 });
  } },
  // shattering for good: a cascade of tinkles and a fading wail
  tsurara_die: { vary: 0.05, max: 2, trim: 1.2, fn(s) {
    for (let i = 0; i < 20; i++) s.noise({ at: R(0, 0.3), f: R(3000, 8000), q: 6, a: 0.001, d: R(0.01, 0.05), v: 0.1 });
    [2637, 2349, 1976, 1760, 1318].forEach((f, i) => s.bell({ at: 0.05 + i * 0.06, f, d: 0.6, v: 0.05, rev: 0.5 }));
    s.voice({ at: 0.05, type: 'triangle', f: [[0, 700], [0.6, 380]], form: [[0, [340, 820, 2500]], [0.6, [300, 700, 2300]]], amp: [[0, 0], [0.08, 0.6], [0.5, 0.3], [0.7, 0]], q: [7, 9, 11], breath: 0.5, body: 0.2, vib: [6, 50], v: 0.07, rev: 0.5 });
  } },
};
