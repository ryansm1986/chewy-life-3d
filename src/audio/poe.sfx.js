// Poe's sounds (docs/POE.md), sfx.js format: { fn(voice, opts), vary, max, gap, trim }, merged into the sfx table by
// src/audio/sfx.js. Light and quick to match her: airy fūma swishes and a woody bone "tock", a whirring flight, a soft
// POOF of pepper smoke, a glassy seal chime, the shadow step's low "vwoomp", and a tiny pug sneeze.
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // a one-paw fūma slash: an airy swish with a bony tock in it
  fuma_slash: { vary: 0.06, max: 3, gap: 0.04, trim: 1.5, fn(s) {
    s.noise({ f: 1700, f2: 3400, glide: 0.1, q: 1.1, a: 0.006, d: 0.13, v: 0.22, color: 'pink' });
    s.tone({ at: 0.03, pts: [[0, 560], [0.05, 380]], type: 'triangle', a: 0.002, d: 0.06, v: 0.1 });
  } },
  // the throw: a rising whoosh off the paw
  fuma_throw: { vary: 0.05, max: 2, gap: 0.08, trim: 1.5, fn(s) {
    s.noise({ f: 600, f2: 2800, glide: 0.2, q: 0.9, a: 0.01, d: 0.26, v: 0.24, color: 'pink' });
    s.tone({ pts: [[0, 210], [0.18, 320]], type: 'triangle', a: 0.01, d: 0.2, v: 0.08, am: [34, 0.6] });
  } },
  // the flying fūma's whirr (re-triggered a few times a second; the pitch follows its speed)
  fuma_whirr: { vary: 0.03, max: 2, gap: 0.08, trim: 1.3, fn(s) {
    s.tone({ f: 170, type: 'sawtooth', a: 0.02, h: 0.05, d: 0.09, v: 0.06, lp: 900, am: [38, 0.75] });
    s.noise({ f: 1300, q: 4, a: 0.02, h: 0.04, d: 0.08, v: 0.03 });
  } },
  // the fūma hits a foe: a woody bone thunk
  fuma_hit: { vary: 0.08, max: 4, gap: 0.03, trim: 1.5, fn(s) {
    s.tone({ pts: [[0, 320], [0.07, 170]], a: 0.002, d: 0.09, v: 0.26 });
    s.noise({ ft: 'lowpass', f: 1500, a: 0.002, d: 0.05, v: 0.22, color: 'pink' });
    s.tone({ at: 0.004, f: 1250, type: 'triangle', a: 0.001, d: 0.02, v: 0.05 });
  } },
  // caught: tock-clack and a glint
  fuma_catch: { vary: 0.04, max: 2, gap: 0.08, trim: 1.4, fn(s) {
    s.tone({ f: 660, type: 'triangle', a: 0.002, d: 0.045, v: 0.14 });
    s.tone({ at: 0.055, f: 860, type: 'triangle', a: 0.002, d: 0.05, v: 0.12 });
    s.bell({ at: 0.06, f: 1760, d: 0.3, v: 0.03, rev: 0.4 });
  } },
  // bonk: it hit a wall and turned for home
  fuma_clank: { vary: 0.06, max: 2, gap: 0.08, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 250], [0.1, 140]], a: 0.002, d: 0.13, v: 0.24 });
    s.noise({ f: 2100, q: 2, a: 0.002, d: 0.06, v: 0.14 });
  } },
  // POOF: a round thump of pepper smoke and a fizz
  smoke_bomb: { vary: 0.05, max: 2, gap: 0.08, trim: 1.25, duck: [0.85, 0.4], fn(s) {
    s.noise({ ft: 'lowpass', f: 900, a: 0.005, d: 0.34, v: 0.42, color: 'brown' });
    s.noise({ f: 3000, f2: 800, glide: 0.28, q: 0.8, a: 0.008, d: 0.32, v: 0.18, color: 'pink' });
    s.tone({ pts: [[0, 150], [0.16, 72]], a: 0.004, d: 0.2, v: 0.24 });
    for (let i = 0; i < 3; i++) s.noise({ at: R(0.08, 0.3), f: R(4000, 7000), q: 5, a: 0.002, d: R(0.03, 0.06), v: R(0.02, 0.04) });
  } },
  // the hand seal: a glassy little shing
  poe_seal: { vary: 0.03, max: 2, gap: 0.08, trim: 1.4, fn(s) {
    s.bell({ f: 1568, d: 0.32, v: 0.06, rev: 0.45 });
    s.noise({ f: 5200, q: 6, a: 0.002, d: 0.08, v: 0.05 });
  } },
  // gone: a soft descending fwoo and a sparkle
  poe_vanish: { vary: 0.04, max: 1, gap: 0.12, trim: 1.4, fn(s) {
    s.noise({ f: 2600, f2: 700, glide: 0.28, q: 1.2, a: 0.01, d: 0.3, v: 0.12, color: 'pink' });
    s.tone({ pts: [[0, 880], [0.24, 440]], type: 'triangle', a: 0.01, d: 0.25, v: 0.05 });
    s.sparkle({ at: 0.04, n: 3, base: 2093, v: 0.025, spread: 0.2 });
  } },
  // ah… ah… CHOO! (a tiny pug sneeze)
  poe_sneeze: { vary: 0.04, max: 1, gap: 0.3, trim: 1.35, fn(s) {
    s.tone({ pts: [[0, 560], [0.08, 640]], type: 'triangle', a: 0.01, d: 0.09, v: 0.08, vib: [9, 30] });
    s.tone({ at: 0.17, pts: [[0, 600], [0.08, 700]], type: 'triangle', a: 0.01, d: 0.1, v: 0.09, vib: [9, 30] });
    s.noise({ at: 0.36, ft: 'highpass', f: 1600, a: 0.004, d: 0.17, v: 0.32 });
    s.tone({ at: 0.38, pts: [[0, 760], [0.16, 430]], type: 'triangle', a: 0.006, d: 0.18, v: 0.12 });
  } },
  // a dodge: a quick whoosh
  poe_dodge: { vary: 0.07, max: 2, gap: 0.08, trim: 1.4, fn(s) {
    s.noise({ f: 1400, f2: 3600, glide: 0.08, q: 1, a: 0.004, d: 0.1, v: 0.16, color: 'pink' });
  } },
  // into the shadow: a low vwoomp and a zip
  shadow_step: { vary: 0.05, max: 2, gap: 0.08, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 190], [0.17, 62]], a: 0.004, d: 0.19, v: 0.24 });
    s.noise({ f: 400, f2: 2400, glide: 0.12, q: 1, a: 0.01, d: 0.15, v: 0.13, color: 'pink' });
  } },
  // out of the shadow behind them
  shadow_pop: { vary: 0.05, max: 2, gap: 0.08, trim: 1.4, fn(s) {
    s.noise({ f: 2400, f2: 600, glide: 0.1, q: 1, a: 0.004, d: 0.12, v: 0.13, color: 'pink' });
    s.tone({ pts: [[0, 90], [0.1, 210]], a: 0.004, d: 0.13, v: 0.18 });
    s.bell({ at: 0.03, f: 1318.5, d: 0.25, v: 0.025, rev: 0.4 });
  } },

  // ================================================================== phase 2
  // Kunai Fan: a quick fan of thin metal whistles flung out
  kunai_fan: { vary: 0.05, max: 2, gap: 0.06, trim: 1.4, fn(s) {
    for (let i = 0; i < 4; i++) s.noise({ at: i * 0.022, f: 2600 + i * 400, f2: 5200, glide: 0.08, q: 3, a: 0.003, d: 0.09, v: 0.08, color: 'pink' });
    s.tone({ at: 0.01, pts: [[0, 1900], [0.08, 1200]], type: 'triangle', a: 0.002, d: 0.08, v: 0.03 });
  } },
  // a kunai finds a foe: a short bright tick and a thud
  kunai_hit: { vary: 0.08, max: 4, gap: 0.025, trim: 1.5, fn(s) {
    s.tone({ f: 2400, type: 'triangle', a: 0.001, d: 0.025, v: 0.06 });
    s.tone({ at: 0.004, pts: [[0, 260], [0.05, 150]], a: 0.002, d: 0.06, v: 0.16 });
  } },
  // thunk: a kunai sticks in the floor
  kunai_thunk: { vary: 0.08, max: 3, gap: 0.04, trim: 1.5, fn(s) {
    s.tone({ pts: [[0, 420], [0.06, 220]], type: 'triangle', a: 0.001, d: 0.07, v: 0.12 });
    s.noise({ ft: 'lowpass', f: 900, a: 0.001, d: 0.04, v: 0.12 });
  } },
  // an exploding tag: a paper rustle then a small pop
  tag_pop: { vary: 0.07, max: 3, gap: 0.05, trim: 1.4, fn(s) {
    s.noise({ f: 3800, q: 2, a: 0.002, d: 0.05, v: 0.05 });
    s.noise({ at: 0.04, ft: 'lowpass', f: 1300, a: 0.002, d: 0.14, v: 0.24, color: 'pink' });
    s.tone({ at: 0.04, pts: [[0, 160], [0.1, 70]], a: 0.002, d: 0.12, v: 0.16 });
  } },
  // Shadow Stitch: a thread zipped tight
  stitch_zip: { vary: 0.04, max: 1, gap: 0.1, trim: 1.4, fn(s) {
    s.noise({ f: 900, f2: 4200, glide: 0.14, q: 6, a: 0.004, d: 0.16, v: 0.12 });
    s.tone({ at: 0.12, f: 1568, type: 'triangle', a: 0.002, d: 0.08, v: 0.05 });
  } },
  // the spare fūma bites into the floor
  saw_plant: { vary: 0.05, max: 2, gap: 0.1, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 300], [0.1, 120]], a: 0.002, d: 0.12, v: 0.22 });
    s.noise({ ft: 'lowpass', f: 1400, a: 0.002, d: 0.08, v: 0.2, color: 'pink' });
    s.tone({ at: 0.02, f: 140, type: 'sawtooth', a: 0.02, d: 0.2, v: 0.05, lp: 700, am: [40, 0.8] });
  } },
  // the buzz-saw whirr (re-triggered while it spins)
  saw_whirr: { vary: 0.03, max: 2, gap: 0.1, trim: 1.3, fn(s) {
    s.tone({ f: 150, type: 'sawtooth', a: 0.03, h: 0.12, d: 0.12, v: 0.05, lp: 800, am: [46, 0.8] });
    s.noise({ f: 1600, q: 3, a: 0.03, h: 0.1, d: 0.1, v: 0.025 });
  } },
  // up she goes (Shuriken Rain's leap, the flip): a springy hup
  poe_leap: { vary: 0.05, max: 1, gap: 0.15, trim: 1.4, fn(s) {
    s.noise({ f: 500, f2: 1800, glide: 0.18, q: 1, a: 0.01, d: 0.2, v: 0.14, color: 'pink' });
    s.tone({ pts: [[0, 330], [0.12, 520]], type: 'triangle', a: 0.005, d: 0.13, v: 0.07 });
  } },
  // …and down: a soft paw pat
  poe_land: { vary: 0.06, max: 1, gap: 0.12, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 180], [0.06, 110]], a: 0.002, d: 0.08, v: 0.18 });
    s.noise({ ft: 'lowpass', f: 700, a: 0.002, d: 0.06, v: 0.12, color: 'pink' });
  } },
  // a tiny bone shuriken lands: a woody tink
  star_tink: { vary: 0.1, max: 4, gap: 0.03, trim: 1.5, fn(s) {
    s.tone({ f: 1350, type: 'triangle', a: 0.001, d: 0.04, v: 0.07 });
    s.tone({ at: 0.006, pts: [[0, 520], [0.04, 340]], a: 0.001, d: 0.05, v: 0.08 });
  } },
  // Thousand Star Flurry: a whirling hiss of a hundred little stars
  star_whirl: { vary: 0.04, max: 2, gap: 0.12, trim: 1.3, fn(s) {
    s.noise({ f: 2200, f2: 3400, glide: 0.2, q: 2, a: 0.04, h: 0.12, d: 0.18, v: 0.07, am: [26, 0.7] });
    s.sparkle({ at: 0.02, n: 3, base: 2637, v: 0.02, spread: 0.2 });
  } },
  // Puff Ball: a puffed-cheek "pfff" and a soft fiery pop
  puff_spit: { vary: 0.05, max: 2, gap: 0.08, trim: 1.4, fn(s) {
    s.noise({ ft: 'lowpass', f: 1100, a: 0.01, d: 0.12, v: 0.2, color: 'pink' });
    s.tone({ at: 0.03, pts: [[0, 260], [0.08, 480]], type: 'triangle', a: 0.004, d: 0.09, v: 0.09 });
    s.noise({ at: 0.06, f: 900, f2: 2600, glide: 0.15, q: 1, a: 0.01, d: 0.18, v: 0.1, color: 'pink' });
  } },
  // the fireball bursts: a round whoomph with a crackle
  fire_burst: { vary: 0.06, max: 3, gap: 0.05, trim: 1.3, duck: [0.9, 0.3], fn(s) {
    s.noise({ ft: 'lowpass', f: 700, f2: 300, glide: 0.25, a: 0.004, d: 0.3, v: 0.3, color: 'brown' });
    s.tone({ pts: [[0, 120], [0.2, 55]], a: 0.004, d: 0.24, v: 0.2 });
    for (let i = 0; i < 3; i++) s.noise({ at: 0.06 + i * 0.05 + R(0, 0.02), f: 3000, q: 3, a: 0.001, d: 0.03, v: 0.06 });
  } },
  // the paw raised for Thunder Paw: a rising electric buzz
  zap_charge: { vary: 0.03, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 180], [0.4, 420]], type: 'sawtooth', a: 0.05, d: 0.42, v: 0.05, lp: 1800, am: [60, 0.6] });
    s.noise({ f: 3200, q: 4, a: 0.05, d: 0.35, v: 0.03 });
  } },
  // the slap and the bolt: a sharp crack and a short roll of thunder
  thunder_crack: { vary: 0.05, max: 2, gap: 0.1, trim: 1.2, duck: [0.85, 0.4], fn(s) {
    s.noise({ ft: 'highpass', f: 2000, a: 0.001, d: 0.06, v: 0.3 });
    s.noise({ at: 0.03, ft: 'lowpass', f: 380, f2: 160, glide: 0.5, a: 0.02, d: 0.6, v: 0.32, color: 'brown', am: [9, 0.5] });
    s.tone({ at: 0.01, pts: [[0, 90], [0.4, 40]], a: 0.01, d: 0.45, v: 0.16 });
  } },
  // the Smoke Dragon: a breathy, rumbling cartoon roar
  dragon_roar: { vary: 0.04, max: 1, gap: 0.3, trim: 1.2, duck: [0.85, 0.6], fn(s) {
    s.tone({ pts: [[0, 160], [0.15, 230], [0.6, 120]], type: 'sawtooth', a: 0.04, d: 0.62, v: 0.09, lp: 900, vib: [7, 40] });
    s.noise({ ft: 'lowpass', f: 900, f2: 400, glide: 0.6, a: 0.05, d: 0.7, v: 0.22, color: 'pink' });
    s.tone({ at: 0.05, pts: [[0, 80], [0.5, 55]], a: 0.04, d: 0.55, v: 0.12 });
  } },
  // its body sweeping past: a soft whoosh
  dragon_whoosh: { vary: 0.06, max: 2, gap: 0.12, trim: 1.4, fn(s) {
    s.noise({ f: 500, f2: 1400, glide: 0.25, q: 0.9, a: 0.05, d: 0.25, v: 0.1, color: 'pink' });
  } },
  // caltrops scattered: a pawful of little bony clicks
  caltrop_scatter: { vary: 0.06, max: 1, gap: 0.15, trim: 1.4, fn(s) {
    for (let i = 0; i < 7; i++) s.tone({ at: 0.04 + i * 0.03 + R(0, 0.02), f: R(900, 1500), type: 'triangle', a: 0.001, d: 0.03, v: 0.05 });
  } },
  // a foe steps on one: a tiny "ow" yelp
  caltrop_ow: { vary: 0.12, max: 2, gap: 0.12, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 700], [0.06, 950], [0.14, 600]], type: 'triangle', a: 0.005, d: 0.14, v: 0.06, vib: [12, 30] });
  } },
  // Bullseye Mark: a flick of a very small brush
  brush_flick: { vary: 0.06, max: 1, gap: 0.1, trim: 1.4, fn(s) {
    s.noise({ f: 2800, f2: 5000, glide: 0.06, q: 2, a: 0.002, d: 0.07, v: 0.08 });
    s.pluck({ at: 0.05, f: 1318.5, v: 0.12 });
  } },
  // a little pug snort (her joining scene: she is VERY stealthy)
  poe_snort: { vary: 0.08, max: 1, gap: 0.3, trim: 1.4, fn(s) {
    s.noise({ ft: 'lowpass', f: 700, a: 0.01, d: 0.09, v: 0.22, color: 'brown', am: [28, 0.8] });
    s.noise({ at: 0.12, ft: 'lowpass', f: 900, a: 0.01, d: 0.07, v: 0.16, color: 'brown', am: [32, 0.8] });
  } },
  // the mark bursts: a wet paint splat and a carnival ding
  paint_burst: { vary: 0.05, max: 2, gap: 0.1, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 1600, a: 0.002, d: 0.14, v: 0.22, color: 'pink' });
    s.tone({ pts: [[0, 200], [0.1, 90]], a: 0.002, d: 0.12, v: 0.14 });
    s.bell({ at: 0.05, f: 1046.5, d: 0.45, v: 0.06, rev: 0.4 }); s.bell({ at: 0.12, f: 1568, d: 0.4, v: 0.05, rev: 0.4 });
  } },
};
