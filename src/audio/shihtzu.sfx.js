// The Shih Tzu's sounds (docs/SHIHTZU.md), sfx.js format: { fn(voice, opts), vary, max, gap, trim }, merged into the sfx
// table by src/audio/sfx.js. Heavy and soft to match him: the flail's low whoosh and a rubber ball's "thup", a squeaky-toy
// bonk on a good hit, the ground thud of a slam, the curse's glassy drip and splat, and a gloomy little "awoo".
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // the flail swung: a low, heavy whoosh (the rope's hum in it)
  flail_whoosh: { vary: 0.06, max: 3, gap: 0.05, trim: 1.4, fn(s) {
    s.noise({ f: 420, f2: 1500, glide: 0.16, q: 0.9, a: 0.02, d: 0.24, v: 0.26, color: 'pink' });
    s.tone({ pts: [[0, 120], [0.14, 190], [0.26, 110]], type: 'triangle', a: 0.02, d: 0.22, v: 0.07, am: [22, 0.5] });
  } },
  // the rubber ball lands on a foe: a fat "thup" with a squeak in it (the toy squeaker inside)
  flail_hit: { vary: 0.08, max: 4, gap: 0.035, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 210], [0.08, 95]], a: 0.002, d: 0.11, v: 0.3 });
    s.noise({ ft: 'lowpass', f: 900, a: 0.002, d: 0.07, v: 0.24, color: 'brown' });
    if (Math.random() < 0.55) s.tone({ at: 0.02, pts: [[0, 1300], [0.05, 1750], [0.1, 1400]], type: 'triangle', a: 0.004, d: 0.09, v: 0.05, vib: [26, 40] });
  } },
  // a big hit (the slam, the wallop): the thup, the squeak and a bounce
  flail_bonk: { vary: 0.06, max: 2, gap: 0.06, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 180], [0.1, 70]], a: 0.002, d: 0.16, v: 0.36 });
    s.noise({ ft: 'lowpass', f: 700, a: 0.002, d: 0.12, v: 0.3, color: 'brown' });
    s.tone({ at: 0.03, pts: [[0, 1150], [0.06, 1650], [0.14, 1250]], type: 'triangle', a: 0.004, d: 0.14, v: 0.07, vib: [24, 50] });
    s.tone({ at: 0.16, pts: [[0, 240], [0.05, 160]], a: 0.002, d: 0.06, v: 0.1 });
  } },
  // the ball hits the floor: a dull thud and grit
  flail_thud: { vary: 0.07, max: 2, gap: 0.06, trim: 1.3, duck: [0.9, 0.3], fn(s) {
    s.tone({ pts: [[0, 110], [0.14, 52]], a: 0.003, d: 0.2, v: 0.4 });
    s.noise({ ft: 'lowpass', f: 520, a: 0.003, d: 0.22, v: 0.3, color: 'brown' });
    for (let i = 0; i < 3; i++) s.noise({ at: R(0.04, 0.16), f: R(1800, 3200), q: 3, a: 0.002, d: R(0.03, 0.05), v: R(0.02, 0.04) });
  } },
  // the deep sigh before a wallop (a soft exhale)
  stz_sigh: { vary: 0.04, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ f: 900, f2: 500, glide: 0.4, q: 0.7, a: 0.08, d: 0.42, v: 0.08, color: 'pink' });
    s.tone({ pts: [[0, 330], [0.35, 250]], type: 'triangle', a: 0.06, d: 0.36, v: 0.025 });
  } },
  // a hex flicked off the paw: a glassy, slightly mournful "plink" and a hiss of ghostlight
  hex_cast: { vary: 0.04, max: 2, gap: 0.06, trim: 1.35, fn(s) {
    s.bell({ f: 988, d: 0.35, v: 0.06, rev: 0.5, partials: [[1, 1, 1], [2.4, 0.4, 0.5], [4.1, 0.15, 0.3]] });
    s.bell({ at: 0.07, f: 740, d: 0.4, v: 0.05, rev: 0.5, partials: [[1, 1, 1], [2.4, 0.4, 0.5]] });
    s.noise({ f: 3000, f2: 1600, glide: 0.2, q: 1.4, a: 0.01, d: 0.18, v: 0.05, color: 'pink' });
  } },
  // the curse lands: a wet "splut" and a drip
  hex_splat: { vary: 0.06, max: 2, gap: 0.05, trim: 1.35, fn(s) {
    s.noise({ ft: 'lowpass', f: 1200, f2: 400, glide: 0.1, a: 0.003, d: 0.14, v: 0.26, color: 'pink' });
    s.tone({ pts: [[0, 420], [0.06, 260]], a: 0.002, d: 0.08, v: 0.12 });
    s.tone({ at: 0.14, pts: [[0, 900], [0.05, 1400]], a: 0.002, d: 0.06, v: 0.05 });
  } },
  // a hex ticks: a tiny glassy drip (quiet: it repeats)
  hex_tick: { vary: 0.1, max: 3, gap: 0.05, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 1100], [0.04, 1600]], a: 0.002, d: 0.05, v: 0.035 });
  } },
  // a gloomy little awoo (his solemn howl, short and a bit wobbly)
  stz_awoo: { vary: 0.04, max: 1, gap: 0.4, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 430], [0.18, 610], [0.55, 590], [0.9, 470]], vib: [5.5, 26, 0.25],
      form: [[0, [720, 1250, 2550]], [0.3, [540, 940, 2350]], [0.9, [420, 780, 2250]]],
      amp: [[0, 0], [0.1, 0.7], [0.3, 1], [0.7, 0.8], [0.95, 0]], q: [6, 9, 10], breath: 0.18, body: 0.45, v: 0.4, rev: 0.6 });
  } },

  // ---------------------------------------------------------------- the rest of his kit (checkpoint 2)
  // Tug of Woe: the rope paying out (a zipping whirr), then the heave (a strained "hnnf" and a rope creak)
  tug_fling: { vary: 0.05, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ f: 900, f2: 2400, glide: 0.25, q: 2.2, a: 0.01, d: 0.3, v: 0.12, color: 'pink', am: [34, 0.6] });
    s.tone({ pts: [[0, 260], [0.25, 420]], type: 'triangle', a: 0.01, d: 0.26, v: 0.04 });
  } },
  tug_haul: { vary: 0.05, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 260], [0.12, 230], [0.3, 200]], form: [[0, [500, 1100, 2400]], [0.3, [420, 950, 2300]]], amp: [[0, 0], [0.05, 1], [0.25, 0.7], [0.32, 0]], q: [5, 8, 9], breath: 0.4, body: 0.5, v: 0.22 });
    s.noise({ at: 0.05, f: 1500, q: 6, a: 0.01, d: 0.18, v: 0.05, am: [60, 0.8] }); // (the rope's creak)
  } },
  // Steadfast Sulk: a small, offended "hmph" (each blow bounced off gets one, rising)
  sulk_hmph: { vary: 0.05, max: 2, gap: 0.12, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 330], [0.06, 300], [0.14, 250]], form: [[0, [380, 900, 2300]], [0.14, [320, 800, 2200]]], amp: [[0, 0], [0.02, 1], [0.1, 0.6], [0.16, 0]], q: [6, 9, 10], breath: 0.5, body: 0.4, v: 0.2 });
  } },
  // The Heaviest Sigh: the crack of the floor (a woody split and grit) under the thud
  sigh_crack: { vary: 0.04, max: 1, gap: 0.3, trim: 1.3, duck: [0.85, 0.35], fn(s) {
    s.noise({ ft: 'highpass', f: 1800, a: 0.001, d: 0.05, v: 0.22 });
    for (let i = 0; i < 4; i++) s.noise({ at: 0.02 + i * R(0.025, 0.045), f: R(900, 2200), q: 4, a: 0.001, d: R(0.03, 0.06), v: R(0.05, 0.09) });
    s.tone({ at: 0.05, pts: [[0, 90], [0.3, 45]], a: 0.01, d: 0.35, v: 0.25 });
  } },
  // Grumble Cloud: a low, grumpy rumble (thunder that can't be bothered)
  grumble: { vary: 0.08, max: 2, gap: 0.25, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 260, f2: 160, glide: 0.5, a: 0.05, d: 0.55, v: 0.32, color: 'brown', am: [9, 0.6] });
    s.tone({ pts: [[0, 70], [0.3, 62], [0.6, 55]], a: 0.04, d: 0.55, v: 0.12, am: [7, 0.5] });
  } },
  // its rain on a foe: a soft patter (quiet: it repeats)
  rain_tick: { vary: 0.15, max: 2, gap: 0.12, trim: 1.2, fn(s) {
    for (let i = 0; i < 3; i++) s.tone({ at: i * R(0.02, 0.05), pts: [[0, R(1400, 2000)], [0.03, R(900, 1200)]], a: 0.001, d: 0.035, v: 0.025 });
  } },
  // Case of the Mopes: a descending, droopy "womp-womp" on a muted horn
  mopes: { vary: 0.03, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 330], [0.18, 311]], type: 'triangle', a: 0.02, d: 0.2, v: 0.09, lp: 1200, vib: [5, 8] });
    s.tone({ at: 0.24, pts: [[0, 294], [0.4, 247]], type: 'triangle', a: 0.02, d: 0.45, v: 0.1, lp: 1100, vib: [4.5, 10] });
  } },
  // the tome opens: a soft leathery thump, pages riffling, and a ghostly chime
  tome_open: { vary: 0.04, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 180], [0.05, 120]], a: 0.002, d: 0.08, v: 0.14 });
    for (let i = 0; i < 6; i++) s.noise({ at: 0.04 + i * 0.03, f: R(2500, 4500), q: 1.5, a: 0.002, d: 0.025, v: 0.05 });
    s.bell({ at: 0.12, f: 1175, d: 0.6, v: 0.05, rev: 0.6, partials: [[1, 1, 1], [2.4, 0.35, 0.5], [3.9, 0.12, 0.3]] });
  } },
  // a ghost pup's yip: tiny, breathy and a little echoey
  pup_yip: { vary: 0.08, max: 3, gap: 0.08, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 900], [0.04, 1150], [0.1, 820]], form: [[0, [1300, 2500, 3600]], [0.1, [1100, 2200, 3400]]], amp: [[0, 0], [0.015, 1], [0.08, 0.5], [0.12, 0]], q: [6, 8, 9], breath: 0.3, body: 0.3, v: 0.18, rev: 0.5 });
  } },
  // Borrowed Warmth: a warm, rising shimmer (the thread taking hold)
  warmth: { vary: 0.04, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 520], [0.3, 780]], type: 'triangle', a: 0.05, d: 0.35, v: 0.06, vib: [6, 10] });
    s.bell({ at: 0.18, f: 1319, d: 0.5, v: 0.045, rev: 0.5 });
  } },
  // Bone Ward: hollow bone knocks circling up (and, pitched up, flying off)
  bone_ward: { vary: 0.04, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    for (let i = 0; i < 4; i++) s.tone({ at: i * 0.06, pts: [[0, 700 + i * 120], [0.03, 520 + i * 100]], a: 0.001, d: 0.06, v: 0.1 });
    s.noise({ f: 600, f2: 1800, glide: 0.3, q: 1.2, a: 0.03, d: 0.3, v: 0.06, color: 'pink' });
  } },
  // a blow caught on the ward (or a bone landing): a woody "tok"
  bone_tink: { vary: 0.1, max: 3, gap: 0.05, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 880], [0.02, 620]], a: 0.001, d: 0.05, v: 0.12 });
    s.noise({ f: 2400, q: 3, a: 0.001, d: 0.02, v: 0.05 });
  } },
  // the Wayhome Lantern set down: a soft clink and a warm hum swelling in
  lantern_set: { vary: 0.03, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.bell({ f: 1760, d: 0.4, v: 0.05, rev: 0.4, partials: [[1, 1, 1], [2.7, 0.3, 0.4]] });
    s.tone({ at: 0.05, f: 220, type: 'triangle', a: 0.2, d: 0.6, v: 0.05, vib: [3, 4] });
    s.tone({ at: 0.05, f: 330, type: 'sine', a: 0.25, d: 0.55, v: 0.035 });
  } },
  // it lights him home: a rising chord of bells
  lantern_rekindle: { vary: 0.02, max: 1, gap: 1, trim: 1.3, duck: [0.8, 0.6], fn(s) {
    for (const [i, m] of [[0, 72], [1, 76], [2, 79], [3, 84]]) s.bell({ at: i * 0.08, f: 440 * Math.pow(2, (m - 69) / 12), d: 0.9, v: 0.06, rev: 0.6 });
    s.noise({ f: 1500, f2: 5000, glide: 0.5, q: 0.8, a: 0.1, d: 0.6, v: 0.04, color: 'pink' });
  } },
  // Grandpaw rises from the tome: a deep, kindly "hrrumph" under a swell of ghostlight
  gp_rise: { vary: 0.03, max: 1, gap: 0.5, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 150], [0.2, 135], [0.5, 120]], form: [[0, [450, 900, 2300]], [0.5, [380, 820, 2200]]], amp: [[0, 0], [0.08, 1], [0.4, 0.7], [0.55, 0]], q: [5, 8, 9], breath: 0.3, body: 0.6, v: 0.26, rev: 0.6 });
    s.noise({ f: 400, f2: 2000, glide: 0.6, q: 0.8, a: 0.2, d: 0.5, v: 0.05, color: 'pink' });
  } },
  // Grandpaw licks the hero's face: a wet "slurp"
  gp_lick: { vary: 0.06, max: 1, gap: 0.4, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 900, f2: 2200, glide: 0.18, q: 3, a: 0.01, d: 0.2, v: 0.14, color: 'pink' });
    s.tone({ at: 0.04, pts: [[0, 500], [0.12, 800]], a: 0.01, d: 0.14, v: 0.05 });
  } },
  // Grandpaw's howl: an old, deep, wavering awoo
  gp_howl: { vary: 0.03, max: 1, gap: 0.6, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 260], [0.2, 380], [0.7, 360], [1.1, 280]], vib: [4.5, 18, 0.2],
      form: [[0, [600, 1100, 2400]], [0.4, [480, 860, 2250]], [1.1, [380, 720, 2150]]],
      amp: [[0, 0], [0.12, 0.7], [0.35, 1], [0.85, 0.75], [1.15, 0]], q: [6, 9, 10], breath: 0.2, body: 0.55, v: 0.32, rev: 0.7 });
  } },
};
