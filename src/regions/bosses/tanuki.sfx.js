// Danzaburō the Leaf-Shifter (Momiji Hollow) sounds (sfx.js format). Pure data: no imports from game code.
// A jolly, boomy trickster: taiko-ish belly "PON!"s, a low "ho-ho-ho", DORON! transformation poofs, a rumbling boulder,
// a clanking iron kettle with a rising whistle and a steam hiss, a leaf-whistle tune for his gang, a giant's DOSUN!.
const R = (a, b) => a + Math.random() * (b - a);
const laughNote = (s, at, f, v = 0.3) => s.voice({ at, f: [[0, f], [0.05, f * 1.12], [0.16, f * 0.92]], form: [[0, [520, 900, 2400]], [0.16, [600, 1000, 2500]]], amp: [[0, 0], [0.02, 1], [0.1, 0.7], [0.17, 0]], q: [5, 7, 9], breath: 0.3, rough: 0.25, roughF: 38, body: 0.5, bodyF: 500, v });

export const SFX = {
  // the belly drum: a round, deep "PON" (skin thump + pitched body + a slap on top)
  danza_pon: { vary: 0.04, max: 3, gap: 0.08, trim: 1.0, fn(s) {
    s.tone({ pts: [[0, 150], [0.05, 92], [0.4, 70]], a: 0.002, d: 0.42, v: 0.62 });
    s.tone({ pts: [[0, 300], [0.08, 180]], type: 'triangle', a: 0.002, d: 0.16, v: 0.2 });
    s.noise({ ft: 'lowpass', f: 900, a: 0.001, d: 0.07, v: 0.45 });
    s.noise({ ft: 'bandpass', f: 2200, q: 1, a: 0.001, d: 0.03, v: 0.18 });
    s.tone({ at: 0.005, pts: [[0, 70], [0.3, 48]], a: 0.004, d: 0.35, v: 0.35, rev: 0.25 });
  } },
  // drawing breath and puffing the belly before the drumming
  danza_drumwind: { vary: 0.05, max: 1, gap: 0.3, trim: 1.2, fn(s) {
    s.noise({ ft: 'bandpass', f: 700, f2: 1500, q: 1, a: 0.4, h: 0.1, d: 0.15, v: 0.18, color: 'pink' });
    s.tone({ pts: [[0, 90], [0.6, 130]], type: 'triangle', a: 0.3, h: 0.1, d: 0.2, v: 0.12, vib: [5, 30] });
    laughNote(s, 0.55, 130, 0.22);
  } },
  // "ho-ho-HO!"
  danza_laugh: { vary: 0.04, max: 1, gap: 0.6, trim: 1.1, fn(s) {
    laughNote(s, 0, 150, 0.3); laughNote(s, 0.2, 140, 0.3); laughNote(s, 0.4, 170, 0.34);
    s.tone({ at: 0.4, pts: [[0, 85], [0.2, 70]], a: 0.01, d: 0.25, v: 0.15 });
  } },
  // a tipsy "hic!"
  danza_hic: { vary: 0.08, max: 2, gap: 0.3, trim: 1.2, fn(s) {
    s.voice({ f: [[0, 260], [0.04, 420], [0.1, 300]], form: [[0, [400, 1800, 2600]], [0.1, [500, 2000, 2800]]], amp: [[0, 0], [0.01, 1], [0.05, 0.4], [0.1, 0]], q: [6, 8, 10], breath: 0.4, body: 0.3, v: 0.26 });
    s.tone({ at: 0.02, pts: [[0, 700], [0.08, 1100]], a: 0.002, d: 0.08, v: 0.05 });
  } },
  // a heavy landing on his feet
  danza_land: { vary: 0.05, max: 2, gap: 0.1, trim: 1.0, fn(s) {
    s.tone({ pts: [[0, 110], [0.15, 50]], a: 0.002, d: 0.24, v: 0.55 });
    s.noise({ ft: 'lowpass', f: 700, a: 0.002, d: 0.2, v: 0.45 });
  } },
  // slapping the leaf on his head: a papery pat + a magical shimmer rising
  danza_leaf: { vary: 0.05, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 2600, q: 1.2, a: 0.002, d: 0.06, v: 0.3 });
    s.noise({ at: 0.05, pts: [[0, 900], [0.5, 3200]], q: 2, a: 0.4, h: 0.05, d: 0.1, v: 0.12, color: 'pink' });
    [784, 988, 1175, 1568].forEach((f, i) => s.bell({ at: 0.08 + i * 0.1, f, d: 0.5, v: 0.04, rev: 0.4 }));
  } },
  // DORON! a cartoon transformation poof: boom + reverse swish + a woody "don"
  danza_doron: { vary: 0.05, max: 2, gap: 0.12, trim: 1.0, fn(s) {
    s.noise({ ft: 'lowpass', f: 1600, f2: 300, a: 0.003, d: 0.45, v: 0.6 });
    s.tone({ pts: [[0, 130], [0.3, 55]], a: 0.003, d: 0.4, v: 0.45 });
    s.noise({ at: 0.02, ft: 'highpass', f: 3000, a: 0.005, d: 0.25, v: 0.1 });
    s.tone({ at: 0.08, pts: [[0, 420], [0.1, 330]], type: 'triangle', a: 0.002, d: 0.18, v: 0.16 });
    s.sparkle({ at: 0.12, n: 4, base: 1568, v: 0.045, spread: 0.3 });
  } },
  // the boulder rocking on the spot: gravel grinding and a revving rumble
  danza_rev: { vary: 0.05, max: 2, gap: 0.2, trim: 1.1, fn(s) {
    s.noise({ ft: 'lowpass', f: 420, f2: 900, a: 0.1, h: 0.4, d: 0.25, v: 0.45, am: [18, 0.7], color: 'brown' });
    for (let i = 0; i < 10; i++) s.noise({ at: R(0.05, 0.7), f: R(1500, 3000), q: 4, a: 0.001, d: 0.02, v: 0.08 });
  } },
  // rolling: a big stony rumble
  danza_roll: { vary: 0.05, max: 2, gap: 0.2, trim: 1.0, fn(s) {
    s.noise({ ft: 'lowpass', f: 320, a: 0.04, h: 0.6, d: 0.5, v: 0.6, am: [10, 0.6], color: 'brown' });
    s.tone({ pts: [[0, 60], [1.1, 45]], a: 0.05, h: 0.5, d: 0.5, v: 0.2, am: [10, 0.5] });
    for (let i = 0; i < 10; i++) s.noise({ at: R(0.05, 1.0), f: R(900, 2200), q: 3, a: 0.002, d: 0.03, v: 0.07 });
  } },
  // crashing to a stop (or through you)
  danza_crash: { vary: 0.06, max: 2, gap: 0.1, trim: 1.0, fn(s) {
    s.noise({ ft: 'lowpass', f: 1200, a: 0.002, d: 0.4, v: 0.7 });
    s.tone({ pts: [[0, 95], [0.25, 40]], a: 0.002, d: 0.4, v: 0.55 });
    for (let i = 0; i < 10; i++) s.noise({ at: R(0.02, 0.35), f: R(1400, 3600), q: 4, a: 0.001, d: 0.03, v: 0.1 });
  } },
  // hitting stone: "clunk"
  danza_clunk: { vary: 0.08, max: 2, gap: 0.25, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 420], [0.05, 260]], type: 'triangle', a: 0.001, d: 0.09, v: 0.3 });
    s.noise({ ft: 'bandpass', f: 1800, q: 2, a: 0.001, d: 0.05, v: 0.25 });
  } },
  // the kettle hops: a springy iron "boing" and a rattle of the lid
  danza_hop: { vary: 0.08, max: 2, gap: 0.15, trim: 1.1, fn(s) {
    s.tone({ pts: [[0, 160], [0.06, 320], [0.25, 260]], a: 0.004, d: 0.26, v: 0.28, vib: [18, 80] });
    s.noise({ ft: 'bandpass', f: 1400, q: 1, a: 0.01, d: 0.15, v: 0.12 });
  } },
  danza_clank: { vary: 0.08, max: 2, gap: 0.12, trim: 1.1, fn(s) {
    s.fm({ f: 420, ratio: 2.76, index: 3, index2: 0.3, id: 0.1, a: 0.001, d: 0.35, v: 0.14 });
    s.tone({ pts: [[0, 120], [0.1, 70]], a: 0.002, d: 0.15, v: 0.35 });
    s.noise({ ft: 'lowpass', f: 900, a: 0.002, d: 0.1, v: 0.3 });
  } },
  // the spout whistling up to the boil
  danza_whistle: { vary: 0.03, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 1100], [0.75, 2300]], a: 0.2, h: 0.4, d: 0.15, v: 0.09, vib: [7, 25] });
    s.tone({ pts: [[0, 1650], [0.75, 3450]], a: 0.25, h: 0.35, d: 0.15, v: 0.03 });
    s.noise({ ft: 'highpass', f: 3500, a: 0.3, h: 0.35, d: 0.1, v: 0.06 });
    for (let i = 0; i < 8; i++) s.noise({ at: i * 0.09, ft: 'bandpass', f: 1600, q: 3, a: 0.001, d: 0.02, v: 0.1 }); // lid rattle
  } },
  // steam blast: a soft, warm "pshhh" (band-limited pink noise over a low rush; gentle attack and release)
  danza_steam: { vary: 0.04, max: 2, gap: 0.2, trim: 1.0, fn(s) {
    s.noise({ ft: 'bandpass', f: 1500, f2: 2300, q: 0.8, a: 0.08, h: 0.65, d: 0.4, v: 0.3, lp: 3600, color: 'pink' });
    s.noise({ ft: 'lowpass', f: 850, a: 0.06, h: 0.6, d: 0.4, v: 0.28, color: 'brown' });
    s.noise({ ft: 'bandpass', f: 3800, q: 1.6, a: 0.1, h: 0.45, d: 0.35, v: 0.04 });
  } },
  // winding back for the bump / the flop: a big inhale
  danza_inhale: { vary: 0.05, max: 1, gap: 0.3, trim: 1.2, fn(s) {
    s.noise({ ft: 'bandpass', f: 600, f2: 1400, q: 1.2, a: 0.4, d: 0.12, v: 0.22, color: 'pink' });
    s.tone({ pts: [[0, 100], [0.45, 150]], type: 'triangle', a: 0.3, d: 0.15, v: 0.08 });
  } },
  // BOING! the belly bump
  danza_bump: { vary: 0.05, max: 2, gap: 0.15, trim: 1.0, fn(s) {
    s.tone({ pts: [[0, 110], [0.06, 220], [0.4, 150]], a: 0.003, d: 0.45, v: 0.45, vib: [14, 120] });
    s.noise({ ft: 'lowpass', f: 800, a: 0.002, d: 0.1, v: 0.4 });
    s.tone({ pts: [[0, 150], [0.05, 92]], a: 0.002, d: 0.2, v: 0.35 });
  } },
  // a leaf whistle (kusabue): a bright little call-up tune
  danza_whistleleaf: { vary: 0.02, max: 1, gap: 0.5, trim: 1.2, fn(s) {
    [[0, 1175], [0.14, 1397], [0.28, 1568], [0.46, 1760], [0.62, 1568]].forEach(([at, f], i) => s.tone({ at, f, a: 0.02, h: i === 4 ? 0.2 : 0.08, d: 0.08, v: 0.1, vib: [9, 30], lp: 5000 }));
    s.noise({ ft: 'bandpass', f: 1500, q: 2, a: 0.05, h: 0.6, d: 0.1, v: 0.04 });
  } },
  // chugging the sake
  danza_gulp: { vary: 0.03, max: 1, gap: 0.5, trim: 1.1, fn(s) {
    for (let i = 0; i < 4; i++) { s.tone({ at: i * 0.18, pts: [[0, 180], [0.06, 110]], a: 0.005, d: 0.1, v: 0.3 }); s.noise({ at: i * 0.18, ft: 'lowpass', f: 600, a: 0.005, d: 0.08, v: 0.2 }); }
    s.voice({ at: 0.75, f: [[0, 140], [0.2, 110]], form: [[0, [500, 900, 2400]], [0.2, [450, 800, 2300]]], amp: [[0, 0], [0.03, 1], [0.15, 0.6], [0.22, 0]], q: [5, 7, 9], breath: 0.4, body: 0.4, v: 0.25 });
  } },
  // growing into a giant: a swelling rumble and a boom
  danza_grow: { vary: 0.02, max: 1, gap: 1, trim: 0.95, fn(s) {
    s.noise({ ft: 'lowpass', f: 200, f2: 900, a: 0.5, h: 0.2, d: 0.4, v: 0.5, color: 'brown' });
    s.tone({ pts: [[0, 50], [0.8, 110]], a: 0.5, h: 0.2, d: 0.4, v: 0.3, vib: [6, 40] });
    s.tone({ at: 0.85, pts: [[0, 90], [0.4, 40]], a: 0.003, d: 0.5, v: 0.55 });
    s.noise({ at: 0.85, ft: 'lowpass', f: 1400, a: 0.003, d: 0.4, v: 0.5 });
  } },
  // the giant coming down: a falling whistle
  danza_fall: { vary: 0.03, max: 1, gap: 0.5, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 1400], [0.45, 500]], a: 0.02, d: 0.45, v: 0.08, lp: 5000 });
    s.noise({ ft: 'bandpass', f: 1200, f2: 500, q: 1.5, a: 0.1, d: 0.35, v: 0.12 });
  } },
  // DOSUN! the belly-flop landing
  danza_slam: { vary: 0.03, max: 1, gap: 0.3, trim: 0.9, fn(s) {
    s.tone({ pts: [[0, 80], [0.4, 32]], a: 0.002, d: 0.6, v: 0.7 });
    s.noise({ ft: 'lowpass', f: 1500, f2: 250, a: 0.002, d: 0.6, v: 0.7 });
    s.tone({ pts: [[0, 150], [0.05, 92]], a: 0.002, d: 0.3, v: 0.4 });
    for (let i = 0; i < 10; i++) s.noise({ at: R(0.05, 0.5), f: R(1200, 3000), q: 4, a: 0.001, d: 0.03, v: 0.08 });
  } },
  // defeated: a deflating "pon… pon…", a poof and a sleepy sigh
  danza_defeat: { vary: 0, max: 1, trim: 1.0, fn(s) {
    [0, 0.3, 0.55].forEach((at, i) => s.tone({ at, pts: [[0, 140 - i * 20], [0.1, 80 - i * 10]], a: 0.002, d: 0.3, v: 0.45 - i * 0.1 }));
    s.noise({ at: 0.7, ft: 'lowpass', f: 1600, f2: 300, a: 0.003, d: 0.45, v: 0.45 });
    s.voice({ at: 0.9, f: [[0, 220], [0.5, 120]], form: [[0, [500, 1100, 2500]], [0.5, [400, 900, 2300]]], amp: [[0, 0], [0.05, 0.8], [0.4, 0.5], [0.6, 0]], q: [5, 7, 9], breath: 0.5, body: 0.4, v: 0.2 });
    s.sparkle({ at: 0.8, n: 5, base: 1175, v: 0.05, spread: 0.5 });
  } },
};
