// Master Tengu (Whispering Bamboo Grove) sounds (sfx.js format). Pure data: no imports from game code.
// A big karasu-tengu: a crow's hoarse "KAA!" and a cackling "KA-KA-KA!", huge feathered wing beats, the feather fan's
// wind (gathered, then released as a gust), whirling leaf tornadoes, a whistling dive that ends in a thunderous slam, the
// phase-2 bamboo-leaf storm, and a long falling caw as he's beaten. Timings follow tengu.js: the fan gathers for
// 0.8-1.0 s before the gust, the dive whistle plays over the 0.52-0.62 s lock before impact.
const R = (a, b) => a + Math.random() * (b - a);

// one huge wing beat: the downstroke's "whump", the feathers' rustle, a little body
function wingBeat(s, at, v = 1) {
  s.noise({ at, ft: 'lowpass', pts: [[0, 320], [0.06, 950], [0.2, 300]], a: 0.035, d: 0.17, v: 0.5 * v, color: 'pink' });
  s.noise({ at: at + 0.02, f: R(1900, 2700), q: 1.1, a: 0.02, d: 0.11, v: 0.09 * v });
  s.tone({ at, pts: [[0, 95], [0.12, 58]], a: 0.012, d: 0.15, v: 0.16 * v });
}
// a hoarse crow syllable (a rough saw through an open "aa" vowel), f = fundamental, len = seconds
function ka(s, at, f, len, v, fall = 0.86) {
  s.voice({ at, f: [[0, f * 0.9], [0.035, f * 1.12], [len, f * fall]], form: [[0, [820, 1350, 2700]], [len, [720, 1200, 2500]]],
    amp: [[0, 0], [0.015, 1], [len * 0.55, 0.75], [len, 0]], q: [5, 7, 9], breath: 0.45, rough: 0.5, roughF: 55, body: 0.35, bodyF: 700, v, rev: 0.2 });
}
// a scatter of bamboo leaves rattling in the wind
function leaves(s, at, n, span, v = 1) {
  for (let i = 0; i < n; i++) s.noise({ at: at + R(0, span), f: R(2200, 3800), q: 2.5, a: 0.001, d: R(0.008, 0.02), v: R(0.08, 0.16) * v });
}

export const SFX = {
  // the intro: the great wings unfurl (three beats) and the air rushes out around him
  tengu_wings: { vary: 0.05, max: 2, gap: 0.3, trim: 2.3, fn(s) {
    for (let i = 0; i < 3; i++) wingBeat(s, i * 0.22, 1 - i * 0.12);
    s.noise({ at: 0.1, pts: [[0, 500], [0.45, 1400], [0.9, 600]], q: 0.9, a: 0.3, h: 0.1, d: 0.5, lin: true, v: 0.12, color: 'pink', rev: 0.3 });
    leaves(s, 0.15, 8, 0.6, 0.7);
  } },
  // "KA-KA-KA-KAAA!" (the intro, and the storm's opening)
  tengu_laugh: { vary: 0.04, max: 1, gap: 0.6, trim: 1.1, fn(s) {
    [[0, 250, 0.15], [0.18, 268, 0.14], [0.35, 290, 0.14], [0.53, 322, 0.32]].forEach(([at, f, len], i) => ka(s, at, f, len, 0.3 + i * 0.02, i === 3 ? 0.78 : 0.88));
    s.tone({ at: 0.53, pts: [[0, 160], [0.3, 120]], a: 0.02, d: 0.3, v: 0.08 }); // chest
  } },
  // a single big "KAAAH!" (dive start, summons; the crow disciples use it pitched up)
  tengu_caw: { vary: 0.06, max: 3, gap: 0.12, trim: 0.95, fn(s) {
    ka(s, 0, 390, 0.42, 0.34, 0.8);
    s.voice({ at: 0.005, f: [[0, 780], [0.04, 900], [0.4, 640]], form: [[0, [1600, 2600, 3400]], [0.4, [1400, 2300, 3100]]], amp: [[0, 0], [0.02, 0.6], [0.3, 0.4], [0.42, 0]], q: [6, 8, 9], breath: 0.3, rough: 0.4, roughF: 55, v: 0.07 });
  } },
  // the fan gathers the wind (0.8-1.0 s): air drawn in, rising, the fan's feathers trembling
  tengu_fan_wind: { vary: 0.04, max: 1, gap: 0.4, trim: 1.4, fn(s) {
    s.noise({ pts: [[0, 320], [0.85, 1700]], q: 1.4, a: 0.8, h: 0.06, d: 0.1, lin: true, v: 0.22, color: 'pink', am: [17, 0.35], rev: 0.25 });
    s.noise({ ft: 'lowpass', pts: [[0, 200], [0.85, 700]], a: 0.75, d: 0.12, lin: true, v: 0.18, color: 'brown' });
    s.tone({ pts: [[0, 520], [0.85, 1150]], a: 0.6, h: 0.1, d: 0.1, lin: true, v: 0.025, vib: [9, 30] }); // the air whistling through the fan
    wingBeat(s, 0, 0.45);
  } },
  // the fan's release: a massive whoosh rolling away, a deep push of air, leaves rattling
  tengu_gust: { vary: 0.05, max: 2, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 2300], [0.55, 450]], q: 0.8, a: 0.012, h: 0.08, d: 0.55, v: 0.4, color: 'pink', rev: 0.3 });
    s.noise({ ft: 'lowpass', pts: [[0, 900], [0.3, 250]], a: 0.008, d: 0.35, v: 0.4, color: 'brown' });
    s.tone({ pts: [[0, 120], [0.25, 55]], a: 0.005, d: 0.3, v: 0.22 });
    leaves(s, 0.05, 12, 0.45);
  } },
  // leaf-blade tornadoes spin up (the 0.95 s cast): whirling bands of wind speeding up, leaves caught in them
  tengu_tornado: { vary: 0.05, max: 1, gap: 0.5, trim: 2.8, fn(s) {
    s.noise({ pts: [[0, 380], [1.0, 1500], [1.35, 900]], q: 2.2, a: 0.9, h: 0.1, d: 0.35, lin: true, v: 0.24, color: 'pink', am: [11, 0.55], rev: 0.3 });
    s.noise({ pts: [[0, 900], [1.0, 2600], [1.35, 1700]], q: 4, a: 0.9, h: 0.1, d: 0.35, lin: true, v: 0.07, am: [15, 0.6] });
    s.noise({ ft: 'lowpass', pts: [[0, 150], [1.0, 450]], a: 0.9, d: 0.4, lin: true, v: 0.2, color: 'brown' });
    leaves(s, 0.3, 14, 1.0, 0.8);
  } },
  // the dive's takeoff: two hard wing beats and a rushing climb
  tengu_dive_up: { vary: 0.05, max: 1, gap: 0.3, trim: 2.1, fn(s) {
    wingBeat(s, 0, 1.1); wingBeat(s, 0.17, 0.9);
    s.noise({ at: 0.12, pts: [[0, 450], [0.5, 2600]], q: 1.2, a: 0.32, h: 0.05, d: 0.25, lin: true, v: 0.2, color: 'pink', rev: 0.35 });
  } },
  // plummeting out of the sky (the 0.52-0.62 s lock before impact): a falling whistle and the rushing air
  tengu_dive_whistle: { vary: 0.03, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 2000], [0.56, 680]], stack: [['sine', 0, 1], ['triangle', 6, 0.2]], a: 0.05, h: 0.42, d: 0.08, lin: true, v: 0.055, vib: [11, 18] });
    s.noise({ pts: [[0, 1500], [0.56, 600]], q: 3, a: 0.4, h: 0.1, d: 0.08, lin: true, v: 0.2, color: 'pink' });
  } },
  // the dive lands: a thunderous boom, the ground thumped, the blast of air outwards, gravel and leaves
  tengu_slam: { vary: 0.05, max: 2, gap: 0.2, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 115], [0.3, 40]], a: 0.003, d: 0.6, v: 0.32 });
    s.noise({ ft: 'lowpass', pts: [[0, 1400], [0.2, 300]], a: 0.002, d: 0.3, v: 0.42, color: 'brown' });
    s.noise({ ft: 'bandpass', f: 1800, q: 1, a: 0.001, d: 0.05, v: 0.34 });
    s.noise({ at: 0.02, pts: [[0, 1600], [0.6, 380]], q: 0.8, a: 0.03, d: 0.6, v: 0.3, color: 'pink', rev: 0.35 });
    for (let i = 0; i < 7; i++) s.noise({ at: R(0.03, 0.3), f: R(1500, 3200), q: 3, a: 0.001, d: R(0.01, 0.025), v: R(0.08, 0.16) });
    leaves(s, 0.15, 8, 0.5, 0.6);
  } },
  // phase 2: the bamboo-leaf storm whips up (a gale swelling, a howl through the stalks, leaves everywhere)
  tengu_storm: { vary: 0.03, max: 1, gap: 2, trim: 1.4, fn(s) {
    s.noise({ pts: [[0, 350], [0.8, 1200], [2.8, 500]], q: 0.9, a: 0.8, h: 0.4, d: 1.8, lin: true, v: 0.26, color: 'pink', am: [3.2, 0.35], rev: 0.35 });
    s.noise({ ft: 'lowpass', pts: [[0, 180], [0.8, 600], [2.8, 250]], a: 0.7, h: 0.5, d: 1.7, lin: true, v: 0.26, color: 'brown' });
    s.noise({ pts: [[0, 480], [0.9, 880], [2.2, 620]], q: 9, a: 0.7, h: 0.3, d: 1.2, lin: true, v: 0.12, color: 'pink', rev: 0.4 }); // the howl
    leaves(s, 0.3, 26, 2.2, 0.9);
  } },
  // beaten: a long falling caw, two weak wing beats, the wind dying away
  tengu_defeat: { vary: 0.03, max: 1, gap: 1, trim: 1.05, fn(s) {
    ka(s, 0, 430, 0.95, 0.34, 0.5);
    wingBeat(s, 0.95, 0.5); wingBeat(s, 1.25, 0.32);
    s.noise({ at: 0.3, pts: [[0, 1300], [1.8, 280]], q: 0.9, a: 0.2, h: 0.3, d: 1.3, lin: true, v: 0.13, color: 'pink', rev: 0.4 });
    leaves(s, 0.9, 10, 0.9, 0.5);
  } },
};
