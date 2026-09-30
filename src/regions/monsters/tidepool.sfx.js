// Shiokaze Tidepools monster sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// Wet and salty: kappa quacks and splashes, clanking crab armour and sand thuds, buzzing glassy jellyfish zaps.
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // ---------------------------------------------------------------- kappa (water imp)
  // winding up the grab: a mischievous little "kekeke" giggle
  kappa_wind: { vary: 0.08, max: 3, gap: 0.1, trim: 1.3, fn(s) {
    for (let i = 0; i < 3; i++) {
      const at = i * 0.075, f = 760 + i * 40;
      s.voice({ at, f: [[0, f], [0.03, f * 1.12], [0.06, f * 0.95]], form: [[0, [620, 1150, 2600]], [0.06, [700, 1250, 2700]]], amp: [[0, 0], [0.01, 0.9], [0.05, 0.5], [0.065, 0]], q: [7, 9, 11], breath: 0.3, body: 0.2, v: 0.16 });
    }
  } },
  // the lunge: a quick whoosh and a duck-ish "kwah!"
  kappa_lunge: { vary: 0.08, max: 3, gap: 0.08, trim: 1.4, fn(s) {
    s.noise({ pts: [[0, 500], [0.08, 2400], [0.2, 700]], q: 1.6, a: 0.01, d: 0.18, v: 0.45, color: 'pink' });
    s.voice({ at: 0.02, f: [[0, 520], [0.04, 690], [0.14, 470]], form: [[0, [800, 1200, 2500]], [0.14, [650, 1050, 2300]]], amp: [[0, 0], [0.015, 1], [0.1, 0.7], [0.16, 0]], q: [5, 7, 9], breath: 0.15, body: 0.35, rough: 0.25, roughF: 60, v: 0.2 });
  } },
  // got you: a wet slap and a squishy squeeze
  kappa_grab: { vary: 0.08, max: 2, gap: 0.1, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 1800, f2: 500, a: 0.002, d: 0.09, v: 0.55 });
    s.noise({ at: 0.03, f: 900, q: 3, a: 0.02, d: 0.18, v: 0.25, am: [28, 0.6] });
    s.tone({ at: 0.02, pts: [[0, 260], [0.12, 180]], type: 'triangle', a: 0.005, d: 0.14, v: 0.14 });
  } },
  // a stumble after a missed lunge: belly flop on the sand
  kappa_flop: { vary: 0.1, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 900, a: 0.003, d: 0.14, v: 0.5, color: 'brown' });
    s.tone({ pts: [[0, 160], [0.1, 90]], a: 0.003, d: 0.12, v: 0.28 });
    s.voice({ at: 0.05, f: [[0, 600], [0.12, 420]], form: [[0, [700, 1100, 2400]], [0.12, [600, 1000, 2300]]], amp: [[0, 0], [0.02, 0.7], [0.14, 0]], q: [5, 7, 9], breath: 0.3, body: 0.3, v: 0.13 });
  } },
  // tipping its head back: water sloshing in the dish
  kappa_splash_wind: { vary: 0.08, max: 3, gap: 0.1, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 600], [0.15, 1400], [0.35, 800]], q: 3, a: 0.05, h: 0.1, d: 0.2, v: 0.3, am: [9, 0.7] });
    for (let i = 0; i < 3; i++) s.tone({ at: 0.06 + i * 0.1, pts: [[0, R(500, 700)], [0.05, R(900, 1200)]], a: 0.004, d: 0.06, v: 0.06 });
  } },
  // the splash: a burst of water (pink noise band-passed round 600–2500 Hz, sweeping down, soft release) and bubbly drops
  kappa_splash: { vary: 0.07, max: 3, gap: 0.08, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 2300], [0.28, 650]], q: 0.8, a: 0.01, h: 0.03, d: 0.3, v: 0.62, color: 'pink', lp: 3000 });
    s.noise({ ft: 'lowpass', f: 900, f2: 300, a: 0.004, d: 0.2, v: 0.3 });
    for (let i = 0; i < 7; i++) { const f = R(700, 1600); s.tone({ at: R(0.03, 0.35), pts: [[0, f], [0.04, f * 1.9]], a: 0.002, d: 0.05, v: 0.06 }); }
  } },
  // panicking off to the water: "kwa kwa kwa!"
  kappa_flee: { vary: 0.08, max: 2, gap: 0.5, trim: 1.3, fn(s) {
    for (let i = 0; i < 3; i++) s.voice({ at: i * 0.13, f: [[0, 640 + i * 30], [0.05, 820 + i * 30], [0.1, 600]], form: [[0, [780, 1200, 2500]], [0.1, [700, 1100, 2400]]], amp: [[0, 0], [0.012, 0.9], [0.08, 0.5], [0.11, 0]], q: [5, 7, 9], breath: 0.2, body: 0.3, rough: 0.2, roughF: 55, v: 0.16 });
  } },
  // bath time: bubbly gurgle and a happy chime
  kappa_heal: { vary: 0.05, max: 2, gap: 0.4, trim: 1.3, fn(s) {
    for (let i = 0; i < 9; i++) { const f = R(300, 700); s.tone({ at: i * 0.06 + R(0, 0.03), pts: [[0, f], [0.05, f * 2.2]], a: 0.003, d: 0.05, v: 0.08 }); }
    s.noise({ ft: 'lowpass', f: 700, a: 0.05, h: 0.2, d: 0.3, v: 0.15, am: [14, 0.6] });
    [1318, 1568, 2093].forEach((f, i) => s.bell({ at: 0.25 + i * 0.09, f, d: 0.5, v: 0.05, rev: 0.4 }));
  } },
  kappa_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.2, fn(s) {
    s.voice({ f: [[0, 820], [0.04, 1000], [0.1, 640]], form: [[0, [850, 1300, 2700]], [0.1, [700, 1150, 2500]]], amp: [[0, 0], [0.01, 1], [0.07, 0.5], [0.11, 0]], q: [5, 7, 9], breath: 0.2, body: 0.25, v: 0.15 });
    s.noise({ f: 2200, q: 3, a: 0.001, d: 0.03, v: 0.08 });
  } },
  // "kwaaa~": a falling quack, a spill and a porcelain dish clink
  kappa_die: { vary: 0.06, max: 2, trim: 1.2, fn(s) {
    s.voice({ f: [[0, 780], [0.1, 900], [0.45, 380]], form: [[0, [800, 1250, 2600]], [0.45, [600, 1000, 2300]]], amp: [[0, 0], [0.02, 1], [0.3, 0.6], [0.48, 0]], q: [5, 7, 9], breath: 0.25, body: 0.3, vib: [8, 40, 0.1], v: 0.15 });
    s.noise({ at: 0.1, ft: 'highpass', f: 1500, a: 0.01, d: 0.3, v: 0.25 });
    s.fm({ at: 0.35, f: 2400, ratio: 2.76, index: 1.2, id: 0.1, a: 0.001, d: 0.3, v: 0.05, rev: 0.3 });
  } },

  // ---------------------------------------------------------------- heike-gani (samurai crab)
  // a hit on the claw shield: a bright armour clank
  heikegani_clank: { vary: 0.07, max: 4, gap: 0.06, trim: 1.4, fn(s) {
    s.fm({ f: R(1650, 1900), ratio: 2.41, index: 2.4, index2: 0.3, id: 0.06, a: 0.001, d: 0.28, v: 0.11, rev: 0.2 });
    s.fm({ f: R(2700, 3100), ratio: 1.53, index: 1.5, id: 0.04, a: 0.001, d: 0.14, v: 0.06 });
    s.noise({ ft: 'highpass', f: 3000, a: 0.001, d: 0.05, v: 0.3 });
  } },
  // both claws up: shell creak and a gruff "hmmph!"
  heikegani_slam_wind: { vary: 0.05, max: 2, gap: 0.15, trim: 1.3, fn(s) {
    for (let i = 0; i < 5; i++) s.noise({ at: i * 0.07, f: R(1400, 2200), q: 6, a: 0.002, d: 0.03, v: 0.18 });
    s.voice({ at: 0.05, f: [[0, 150], [0.3, 190], [0.5, 175]], form: [[0, [500, 1000, 2300]], [0.5, [550, 1050, 2400]]], amp: [[0, 0], [0.08, 0.8], [0.45, 0.9], [0.55, 0]], q: [5, 7, 9], breath: 0.1, body: 0.5, rough: 0.35, roughF: 38, v: 0.2 });
  } },
  // the slam: a heavy sand thud with a claw clack
  heikegani_slam: { vary: 0.06, max: 2, gap: 0.1, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 120], [0.18, 48]], a: 0.002, d: 0.24, v: 0.45 });
    s.noise({ ft: 'lowpass', f: 1100, f2: 250, a: 0.002, d: 0.35, v: 0.42, color: 'brown' });
    s.noise({ at: 0.02, ft: 'highpass', f: 2500, a: 0.004, d: 0.25, v: 0.12 });
    s.fm({ f: 1300, ratio: 2.1, index: 1.4, id: 0.05, a: 0.001, d: 0.12, v: 0.06 });
  } },
  // prying its claws back out of the sand
  heikegani_unstick: { vary: 0.08, max: 2, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 1400, a: 0.02, d: 0.2, v: 0.35, color: 'brown', am: [18, 0.6] });
    s.noise({ at: 0.12, f: 2000, q: 5, a: 0.002, d: 0.03, v: 0.15 });
    s.noise({ at: 0.18, f: 1700, q: 5, a: 0.002, d: 0.03, v: 0.12 });
  } },
  // crouching for the sideways dash: legs clicking faster and faster
  heikegani_dash_wind: { vary: 0.06, max: 2, gap: 0.12, trim: 1.3, fn(s) {
    let at = 0;
    for (let i = 0; i < 9; i++) { s.noise({ at, f: R(1800, 2800), q: 3, a: 0.001, d: 0.02, v: 0.55 }); at += 0.07 - i * 0.005; }
  } },
  // the dash: clattering legs and a sandy whoosh
  heikegani_dash: { vary: 0.07, max: 3, gap: 0.08, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 500], [0.1, 1800], [0.3, 600]], q: 1.2, a: 0.01, d: 0.3, v: 0.5, color: 'pink' });
    for (let i = 0; i < 10; i++) s.noise({ at: i * 0.03, f: R(2000, 3200), q: 6, a: 0.001, d: 0.015, v: 0.14 });
  } },
  heikegani_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.2, fn(s) {
    s.noise({ f: 1800, q: 4, a: 0.001, d: 0.04, v: 0.25 });
    s.voice({ f: [[0, 260], [0.08, 210]], form: [[0, [550, 1050, 2300]], [0.1, [500, 950, 2200]]], amp: [[0, 0], [0.01, 0.8], [0.1, 0]], q: [5, 7, 9], breath: 0.1, body: 0.4, rough: 0.3, roughF: 40, v: 0.13 });
  } },
  // a clattering collapse of armour
  heikegani_die: { vary: 0.05, max: 2, trim: 1.2, fn(s) {
    for (let i = 0; i < 6; i++) s.fm({ at: i * 0.06 + R(0, 0.02), f: R(900, 1700), ratio: 2.3, index: 1.6, id: 0.05, a: 0.001, d: 0.12, v: 0.06 });
    s.tone({ at: 0.28, pts: [[0, 110], [0.15, 60]], a: 0.003, d: 0.2, v: 0.4 });
    s.noise({ at: 0.28, ft: 'lowpass', f: 800, a: 0.004, d: 0.25, v: 0.35, color: 'brown' });
  } },

  // ---------------------------------------------------------------- kurage (lantern jellyfish)
  // charging up: a rising electric hum with glassy shimmer
  kurage_charge: { vary: 0.05, max: 3, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 180], [0.85, 520]], stack: [['sawtooth', -6, 0.5], ['square', 6, 0.3]], a: 0.1, h: 0.6, d: 0.15, v: 0.08, lp: 1400, lp2: 3800, lt: 0.85, am: [30, 0.5] });
    s.noise({ ft: 'highpass', f: 4000, a: 0.4, h: 0.3, d: 0.1, v: 0.05, am: [45, 0.8] });
    [1568, 2093, 2637].forEach((f, i) => s.bell({ at: 0.2 + i * 0.2, f, d: 0.35, v: 0.03, rev: 0.4 }));
  } },
  // the pulse: an electric crackle burst, a "bzzt" and a glassy ping
  kurage_zap: { vary: 0.06, max: 3, gap: 0.1, trim: 1.3, fn(s) {
    s.noise({ f: 2100, q: 1.1, a: 0.002, d: 0.22, v: 0.36, am: [70, 0.8, 'square'], lp: 4200 });
    s.tone({ pts: [[0, 900], [0.2, 140]], stack: [['sawtooth', 0, 0.6], ['square', 12, 0.3]], a: 0.002, d: 0.24, v: 0.12, lp: 3000 });
    s.fm({ at: 0.01, f: 2349, ratio: 3.5, index: 1.1, id: 0.08, a: 0.001, d: 0.4, v: 0.05, rev: 0.4 });
    for (let i = 0; i < 6; i++) s.noise({ at: R(0.02, 0.25), f: R(2600, 4200), q: 4, a: 0.001, d: 0.012, v: 0.14 });
  } },
  // squishy "blub"
  kurage_hurt: { vary: 0.1, max: 2, gap: 0.35, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 420], [0.05, 780], [0.12, 520]], a: 0.004, d: 0.12, v: 0.16 });
    s.noise({ ft: 'lowpass', f: 1100, a: 0.004, d: 0.06, v: 0.12 });
  } },
  // popping into light: a bubbly pop and a dreamy falling chime
  kurage_die: { vary: 0.04, max: 2, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 300], [0.04, 900], [0.1, 700]], a: 0.002, d: 0.12, v: 0.3 });
    s.noise({ ft: 'highpass', f: 3000, a: 0.002, d: 0.08, v: 0.15 });
    [2093, 1760, 1568, 1318, 1046].forEach((f, i) => s.bell({ at: 0.08 + i * 0.07, f, d: 0.6, v: 0.045, rev: 0.5 }));
  } },
};
