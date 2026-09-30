// Umibōzu (Shiokaze Tidepools) sounds (sfx.js format). Pure data: no imports from game code.
// A giant, sleepy sea-monk: a deep friendly "bwoooh", the sea pouring off him as he rises, huge wet hand slaps, rolling
// wave rings, cheeks puffing and an ink "ptoo!" with gooey splats, a conch-shell (horagai) call for his friends, the tide
// rising, the sea drawing back before each surge crashes up the beach, and a contented sigh as he sinks home.
// Timings follow umibozu.js: the rise takes 1.5 s, a hand is raised for 0.85-1.15 s before the slam, the cheeks puff
// for ~0.85 s, the surge warning comes 1.3 s before the crash, the tide rises over ~3 s.
const R = (a, b) => a + Math.random() * (b - a);

// a big splash: a broad wet burst, spray, and droplets pattering back
function splash(s, at, v = 1, dur = 0.5) {
  s.noise({ at, f: R(1000, 1400), q: 0.6, a: 0.006, d: dur, v: 0.32 * v, color: 'pink', rev: 0.3 });
  s.noise({ at, ft: 'highpass', f: 3000, a: 0.01, d: dur * 1.1, v: 0.03 * v, lp: 8000 });
  drips(s, at + 0.08, 6, dur * 1.2, 0.8 * v);
}
// droplets falling back into water
function drips(s, at, n, span, v = 1) {
  for (let i = 0; i < n; i++) { const f = R(700, 1900); s.tone({ at: at + R(0, span), pts: [[0, f], [0.02, f * 1.7]], a: 0.001, d: 0.045, v: R(0.025, 0.05) * v }); }
}
// a deep boom (the giant body behind a hit)
function boom(s, at, f0, f1, d, v) {
  s.tone({ at, pts: [[0, f0], [d * 0.5, f1]], a: 0.004, d, v });
  s.noise({ at, ft: 'lowpass', pts: [[0, 700], [d * 0.5, 180]], a: 0.004, d: d * 0.6, v: v * 0.9, color: 'brown' });
}
// the monk's voice: a low "oh" vowel with a sub underneath; f = fundamental, len = seconds, fall = pitch at the end
function hum(s, at, f, len, v, fall = 0.85) {
  s.voice({ at, type: 'sawtooth', f: [[0, f * 0.92], [len * 0.25, f * 1.06], [len, f * fall]], form: [[0, [380, 780, 2300]], [len, [430, 720, 2200]]],
    amp: [[0, 0], [len * 0.2, 1], [len * 0.7, 0.8], [len, 0]], q: [5, 7, 9], breath: 0.25, rough: 0.12, roughF: 30, body: 0.7, bodyF: 380, v, rev: 0.3 });
  s.tone({ at, pts: [[0, f * 0.46], [len, f * 0.46 * fall]], a: len * 0.25, h: len * 0.45, d: len * 0.3, lin: true, v: v * 0.3 });
}

export const SFX = {
  // rising from the sea (1.5 s): the swell heaving up, a huge splash as he breaks the surface, the sea pouring off him
  umi_rise: { vary: 0.03, max: 1, gap: 1, trim: 1.1, fn(s) {
    s.noise({ ft: 'lowpass', pts: [[0, 180], [0.9, 1300], [2.0, 400]], q: 0.7, a: 0.85, h: 0.2, d: 1.0, lin: true, v: 0.34, color: 'brown', rev: 0.3 });
    s.tone({ pts: [[0, 38], [1.2, 55]], a: 0.5, h: 0.5, d: 0.6, lin: true, v: 0.26 });
    splash(s, 0.75, 1.2, 0.7);
    s.noise({ at: 0.9, f: 1100, q: 1, a: 0.1, h: 0.6, d: 0.5, lin: true, v: 0.1, color: 'pink', am: [7, 0.4] }); // pouring off him
  } },
  // "bwoooh": the sleepy, friendly giant (after rising, now and then while fighting)
  umi_voice: { vary: 0.05, max: 1, gap: 1.5, trim: 1.05, fn(s) { hum(s, 0, 92, 1.05, 0.34); } },
  // a giant hand lifts out of the water: a heavy rising swoosh, the water streaming off it, drips
  umi_raise: { vary: 0.05, max: 2, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', pts: [[0, 250], [0.7, 950]], a: 0.55, h: 0.1, d: 0.35, lin: true, v: 0.26, color: 'brown' });
    s.noise({ f: 1300, q: 1, a: 0.25, h: 0.35, d: 0.3, lin: true, v: 0.08, color: 'pink', am: [8, 0.45] });
    drips(s, 0.2, 9, 0.9);
  } },
  // the hand slaps down on the beach: SPLOOSH-THUD (the wave rings' double slap plays it pitched up)
  umi_slam: { vary: 0.05, max: 2, gap: 0.15, trim: 1.45, fn(s) {
    boom(s, 0, 100, 38, 0.55, 0.34);
    s.noise({ ft: 'bandpass', f: 1600, q: 0.9, a: 0.001, d: 0.06, v: 0.4 }); // the wet slap
    splash(s, 0.01, 1.5, 0.6);
  } },
  // a wave ring rolls out from him: a rising roll of water, the foam crest churning, washing away
  umi_wave: { vary: 0.05, max: 2, gap: 0.5, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', pts: [[0, 300], [0.5, 900], [2.4, 350]], q: 0.7, a: 0.35, h: 0.5, d: 1.7, lin: true, v: 0.3, color: 'brown', rev: 0.3 });
    s.noise({ at: 0.1, f: 1500, q: 0.8, a: 0.3, h: 0.9, d: 1.1, lin: true, v: 0.1, color: 'pink', am: [6, 0.3], rev: 0.3 });
  } },
  // puffing his cheeks (~0.85 s): a long breath in through the nose, a rubbery stretch
  umi_puff: { vary: 0.05, max: 1, gap: 0.4, trim: 1.4, fn(s) {
    s.noise({ pts: [[0, 600], [0.75, 1500]], q: 1.2, a: 0.6, h: 0.1, d: 0.1, lin: true, v: 0.16, color: 'pink' });
    s.tone({ pts: [[0, 70], [0.8, 150]], stack: [['triangle', 0, 1], ['sine', 0, 0.6, 2]], a: 0.2, h: 0.5, d: 0.12, lin: true, v: 0.09, vib: [6, 40, 0.2], lp: 900 });
  } },
  // "PTOO!": the ink spat out, the blobs gulping into the air
  umi_ink: { vary: 0.05, max: 1, gap: 0.4, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 1600, a: 0.002, d: 0.06, v: 0.4, color: 'pink' }); // the plosive
    s.tone({ pts: [[0, 420], [0.12, 170]], a: 0.004, d: 0.14, v: 0.16, bp: 700, bq: 2 });
    for (let i = 0; i < 5; i++) { const f = R(260, 420); s.tone({ at: 0.05 + i * R(0.04, 0.07), pts: [[0, f], [0.06, f * 1.9]], a: 0.004, d: 0.08, v: 0.1, lp: 1800 }); }
  } },
  // an ink blob lands: a gooey splorch
  umi_splat: { vary: 0.1, max: 4, gap: 0.05, trim: 2.3, fn(s) {
    s.noise({ ft: 'bandpass', f: R(800, 1100), q: 1, a: 0.002, d: 0.13, v: 0.3, color: 'pink' });
    s.noise({ ft: 'lowpass', f: 500, a: 0.002, d: 0.08, v: 0.3, color: 'brown' });
    s.tone({ pts: [[0, 260], [0.16, 130]], type: 'triangle', a: 0.003, d: 0.17, v: 0.12, am: [38, 0.5], lp: 1200 });
  } },
  // calling his friends from the surf: a conch-shell trumpet (horagai), a long scooped "bwoooo" and a short high answer
  umi_call: { vary: 0.03, max: 1, gap: 1, trim: 1.2, fn(s) {
    const horn = (at, f, h, v) => {
      s.tone({ at, pts: [[0, f * 0.86], [0.18, f], [h + 0.25, f * 0.97]], stack: [['sawtooth', 0, 0.55], ['triangle', 6, 0.5], ['sine', 0, 0.35, 2]], a: 0.18, h, d: 0.3, v, lp: 900, lp2: 1700, lt: 0.35, lq: 3, vib: [5, 18, 0.3], rev: 0.45 });
      s.noise({ at, f: f * 2, q: 5, a: 0.15, h, d: 0.3, lin: true, v: v * 0.9, rev: 0.4 });
    };
    horn(0, 220, 0.75, 0.13); horn(1.1, 294, 0.25, 0.11);
  } },
  // phase 2, the tide rises (~3 s): a long, swelling roar of water, a deep rumble, foam hissing, gurgles
  umi_tide: { vary: 0.02, max: 1, gap: 2, trim: 1.2, fn(s) {
    s.noise({ ft: 'lowpass', pts: [[0, 160], [2.6, 800], [3.3, 400]], q: 0.8, a: 2.4, h: 0.2, d: 0.8, lin: true, v: 0.36, color: 'brown', rev: 0.3 });
    s.tone({ pts: [[0, 36], [2.6, 50]], a: 1.2, h: 1.2, d: 0.8, lin: true, v: 0.22 });
    s.noise({ ft: 'highpass', f: 2800, a: 2.3, h: 0.3, d: 0.8, lin: true, v: 0.025, lp: 8000 });
    for (let i = 0; i < 9; i++) { const f = R(140, 300); s.tone({ at: R(0.4, 2.8), pts: [[0, f], [0.07, f * 2.2]], a: 0.004, d: 0.09, v: 0.12, lp: 1500 }); }
  } },
  // 1.3 s before a surge: the sea draws back (a hiss pulling away, a low swell gathering)
  umi_surge_warn: { vary: 0.03, max: 1, gap: 1, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 1800], [1.25, 600]], q: 0.8, a: 0.3, h: 0.7, d: 0.3, lin: true, v: 0.14, color: 'pink' });
    s.noise({ ft: 'lowpass', pts: [[0, 150], [1.25, 700]], a: 1.1, h: 0.1, d: 0.1, lin: true, v: 0.3, color: 'brown' });
    for (let i = 0; i < 6; i++) { const f = R(180, 320); s.tone({ at: R(0.1, 1.0), pts: [[0, f * 2], [0.06, f]], a: 0.004, d: 0.07, v: 0.07, lp: 1400 }); } // sucked-back gurgles
  } },
  // the surge crashes up the beach: a big break, a heavy thump, the foam fizzing back
  umi_surge: { vary: 0.04, max: 1, gap: 1, trim: 1.5, fn(s) {
    s.noise({ f: 1200, q: 0.5, a: 0.02, h: 0.15, d: 1.0, v: 0.36, color: 'pink', rev: 0.3 });
    boom(s, 0, 80, 40, 0.6, 0.24);
    s.noise({ at: 0.35, ft: 'highpass', f: 3200, a: 0.3, h: 0.3, d: 1.1, lin: true, v: 0.035, lp: 8500 });
    drips(s, 0.2, 8, 1.0);
  } },
  // beaten: a big contented sigh ("hmmmm~"), bubbling as he sinks back into the sea, a gentle wash over him
  umi_defeat: { vary: 0.02, max: 1, gap: 2, trim: 1.05, fn(s) {
    hum(s, 0, 110, 1.6, 0.32, 0.62);
    s.noise({ at: 0.1, f: 900, q: 1.5, a: 0.4, h: 0.5, d: 0.7, lin: true, v: 0.06, color: 'pink' }); // the breath of the sigh
    for (let i = 0; i < 12; i++) { const f = R(120, 280); s.tone({ at: R(1.1, 2.6), pts: [[0, f], [0.08, f * 2.3]], a: 0.004, d: 0.1, v: 0.1, lp: 1400 }); }
    s.noise({ at: 1.2, ft: 'lowpass', pts: [[0, 250], [0.8, 700], [1.8, 300]], a: 0.8, h: 0.2, d: 0.9, lin: true, v: 0.22, color: 'brown', rev: 0.3 });
  } },
};
