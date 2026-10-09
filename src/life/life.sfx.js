// Homestead sounds (sfx.js format: { fn(voice, opts), vary, max, gap, trim }), merged into the sfx table by
// src/audio/sfx.js. Pure data: only the audio voice API. Soft and round like the village sounds; levels are set
// against dig / pickup_item / water_splash (the game plays these at vol 0.5-0.8).
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // the hoe bites the soil: a dull earthy thunk, a crumble of clods
  hoe_chop: { vary: 0.1, max: 2, gap: 0.08, trim: 2.2, fn(s) {
    s.tone({ f: 150, f2: 70, glide: 0.08, a: 0.002, d: 0.12, v: 0.35 });
    s.noise({ ft: 'lowpass', f: 700, a: 0.002, d: 0.1, v: 0.45, color: 'brown' });
    for (let i = 0; i < 4; i++) s.noise({ at: R(0.04, 0.2), f: R(900, 1700), q: 1.4, a: 0.002, d: R(0.03, 0.06), v: R(0.12, 0.22) });
  } },
  // a watering can: a soft rising trickle, a few drips on the leaves
  water_pour: { vary: 0.06, max: 1, gap: 0.3, trim: 2.0, fn(s) {
    s.noise({ f: 2600, f2: 3600, q: 0.9, a: 0.12, h: 0.45, d: 0.3, v: 0.3, color: 'pink' });
    s.noise({ ft: 'lowpass', f: 900, a: 0.1, h: 0.4, d: 0.3, v: 0.18 });
    for (let i = 0; i < 6; i++) { const f = R(900, 1900); s.tone({ at: R(0.08, 0.7), f, f2: f * 1.6, glide: 0.03, a: 0.001, d: 0.05, v: 0.06 }); }
  } },
  // seeds pattering into a little hole
  seed_sow: { vary: 0.08, max: 2, gap: 0.1, trim: 2.4, fn(s) {
    for (let i = 0; i < 5; i++) s.noise({ at: i * 0.035 + R(0, 0.01), f: R(3000, 5200), q: 3, a: 0.001, d: 0.014, v: 0.18 });
    s.tone({ at: 0.16, f: 520, f2: 760, glide: 0.04, a: 0.002, d: 0.08, v: 0.14 });
  } },
  // a crop pops out of the ground: a cork-like "pon!", a springy boing and a glint
  harvest_pop: { vary: 0.05, max: 2, gap: 0.08, trim: 1.6, fn(s) {
    s.tone({ pts: [[0, 380], [0.05, 900]], a: 0.002, d: 0.12, v: 0.32 });
    s.noise({ f: 1800, q: 0.9, a: 0.001, d: 0.04, v: 0.3 });
    s.tone({ at: 0.06, pts: [[0, 600], [0.12, 820], [0.22, 700]], type: 'triangle', a: 0.005, d: 0.25, v: 0.12 });
    s.sparkle({ at: 0.1, n: 4, base: 2349, v: 0.035, spread: 0.3 });
  } },
  // ---------------------------------------------------------------- fishing
  // a fish nibbles the float: a tiny "plip"
  nibble: { vary: 0.12, max: 2, gap: 0.1, trim: 2.2, fn(s) {
    s.tone({ f: 900, f2: 1500, glide: 0.03, a: 0.001, d: 0.06, v: 0.16 });
    s.noise({ f: 2400, q: 2, a: 0.001, d: 0.03, v: 0.1 });
  } },
  // the bite: a bright two-note "ding-ding!" over the splash
  bite_ping: { vary: 0.02, max: 1, gap: 0.2, trim: 1.4, fn(s) {
    s.bell({ f: 1568, d: 0.35, v: 0.12 }); s.bell({ at: 0.09, f: 2093, d: 0.5, v: 0.14 });
  } },
  // the reel bar opens: a springy whirr
  reel_start: { vary: 0.03, max: 1, gap: 0.3, trim: 1.5, fn(s) {
    s.tone({ pts: [[0, 300], [0.18, 700]], type: 'triangle', a: 0.005, d: 0.2, v: 0.14 });
    for (let i = 0; i < 6; i++) s.noise({ at: i * 0.03, f: 3200, q: 4, a: 0.001, d: 0.012, v: 0.14 });
  } },
  // the reel ratchet while it's wound
  reel_click: { vary: 0.05, max: 2, gap: 0.05, trim: 2.0, fn(s) {
    s.noise({ f: R(2800, 3400), q: 5, a: 0.001, d: 0.012, v: 0.2 });
    s.tone({ f: 1800, f2: 1500, glide: 0.01, type: 'triangle', a: 0.001, d: 0.015, v: 0.05 });
  } },
  // landed! a happy rising arpeggio and a splashy shimmer
  fish_catch: { vary: 0.02, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    [0, 4, 7, 12].forEach((k, i) => s.pluck({ at: i * 0.07, m: 72 + k, v: 0.32, kind: 'koto' }));
    s.sparkle({ at: 0.25, n: 5, base: 2349, v: 0.04, spread: 0.35 });
  } },
  // it got away: a soft falling "bloop"
  fish_escape: { vary: 0.04, max: 1, gap: 0.3, trim: 1.6, fn(s) {
    s.tone({ pts: [[0, 520], [0.25, 260]], a: 0.004, d: 0.3, v: 0.2 });
    s.noise({ at: 0.05, f: 1200, f2: 500, q: 0.8, a: 0.004, d: 0.2, v: 0.2 });
  } },
  // ---------------------------------------------------------------- cooking and eating
  // ingredients hit the hot pot: a soft sizzle that settles
  cook_sizzle: { vary: 0.05, max: 1, gap: 0.3, trim: 1.8, fn(s) {
    s.noise({ f: 5200, f2: 3800, q: 0.7, a: 0.01, h: 0.25, d: 0.45, v: 0.2, color: 'white' });
    s.noise({ ft: 'lowpass', f: 600, a: 0.01, d: 0.25, v: 0.12, color: 'brown' });
    for (let i = 0; i < 7; i++) s.noise({ at: R(0.05, 0.6), f: R(4000, 7000), q: 3, a: 0.001, d: 0.01, v: R(0.06, 0.12) });
  } },
  // the pot comes to the boil: round bloops
  cook_bubble: { vary: 0.08, max: 1, gap: 0.2, trim: 1.8, fn(s) {
    for (let i = 0; i < 5; i++) { const f = R(260, 520); s.tone({ at: i * 0.09 + R(0, 0.03), f, f2: f * 1.9, glide: 0.05, a: 0.003, d: 0.07, v: 0.12 }); }
  } },
  // the ladle taps the pot rim
  cook_stir: { vary: 0.08, max: 2, gap: 0.12, trim: 2.2, fn(s) {
    s.bell({ f: R(1700, 1900), d: 0.12, v: 0.035 });
    s.noise({ f: 1400, q: 1.2, a: 0.003, d: 0.06, v: 0.06 });
  } },
  // done! a kitchen-timer "ding" and a little sparkle
  cook_ding: { vary: 0.01, max: 1, gap: 0.3, trim: 1.4, fn(s) {
    s.bell({ f: 2093, d: 0.7, v: 0.16 }); s.bell({ at: 0.12, f: 2637, d: 0.8, v: 0.12 });
    s.sparkle({ at: 0.18, n: 4, base: 2349, v: 0.035, spread: 0.3 });
  } },
  // nom nom nom: three soft munches
  eat_munch: { vary: 0.06, max: 1, gap: 0.3, trim: 2.0, fn(s) {
    for (let i = 0; i < 3; i++) { s.noise({ at: 0.06 + i * 0.19, ft: 'lowpass', f: 900, a: 0.004, d: 0.07, v: 0.3, color: 'pink' }); s.tone({ at: 0.06 + i * 0.19, f: 240, f2: 180, glide: 0.04, a: 0.003, d: 0.06, v: 0.12 }); }
  } },
  // Well Fed: a warm, rising shimmer
  meal_buff: { vary: 0.02, max: 1, gap: 0.4, trim: 1.4, fn(s) {
    [0, 4, 7, 11].forEach((k, i) => s.pluck({ at: i * 0.06, m: 67 + k, v: 0.18, kind: 'koto' }));
    s.sparkle({ at: 0.2, n: 6, base: 2093, v: 0.03, spread: 0.4 });
  } },
  // a new recipe: a page flip and a bright chime
  recipe_learn: { vary: 0.01, max: 1, gap: 0.4, trim: 1.4, fn(s) {
    s.noise({ f: 2200, f2: 4200, q: 0.7, a: 0.01, d: 0.16, v: 0.16, color: 'pink' });
    [0, 7, 12, 16].forEach((k, i) => s.bell({ at: 0.1 + i * 0.08, f: 523.25 * Math.pow(2, k / 12) * 2, d: 0.5, v: 0.07 }));
  } },
  // scavenging (docs/COZY.md §7): Shadow's nose, three quick snuffles
  sniff: { vary: 0.08, max: 1, gap: 0.5, trim: 2.0, fn(s) {
    for (let i = 0; i < 3; i++) s.noise({ at: i * 0.11 + R(0, 0.02), f: R(2600, 3400), f2: R(1800, 2400), q: 1.2, a: 0.01, d: 0.06, v: 0.2, color: 'pink' });
  } },
  // a perfect dig: a springy "pon!" out of the ground, then a little rising koto run and a glint
  dig_perfect: { vary: 0.02, max: 1, gap: 0.3, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 320], [0.06, 820]], a: 0.002, d: 0.12, v: 0.3 });
    s.noise({ ft: 'lowpass', f: 600, a: 0.002, d: 0.08, v: 0.3, color: 'brown' });
    [0, 4, 7, 12].forEach((k, i) => s.pluck({ at: 0.08 + i * 0.055, m: 76 + k, v: 0.2, kind: 'koto' }));
    s.sparkle({ at: 0.28, n: 6, base: 2637, v: 0.035, spread: 0.4 });
  } },
  // a loved gift: a happy "kyaa!" sweep and hearts
  gift_loved: { vary: 0.02, max: 1, gap: 0.4, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 600], [0.14, 1300], [0.3, 1100]], type: 'triangle', a: 0.006, d: 0.32, v: 0.14 });
    [0, 4, 7, 12, 16].forEach((k, i) => s.pluck({ at: 0.08 + i * 0.06, m: 74 + k, v: 0.22, kind: 'koto' }));
    s.sparkle({ at: 0.3, n: 7, base: 2637, v: 0.035, spread: 0.4 });
  } },
};
