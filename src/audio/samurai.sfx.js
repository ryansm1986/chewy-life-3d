// Chewy the samurai's sounds (docs/HEROES.md §8), sfx.js format: { fn(voice, opts), vary, max, gap, trim }, merged
// into the sfx table by src/audio/sfx.js. All synthesized (WebAudio, no files), soft and round like the rest:
//   katana_draw   the "shing" of a draw: a bright metallic ring sliding up, a quick swish of air under it
//   katana_sheath the sheath's "click": a wooden tap and a tiny bright tick as the habaki seats in the saya mouth
//   katana_slice  Swallow Return's quick cuts: a thin bright tear of air and the edge's zing
//   katana_clang  a blade meeting something hard (a parry, Helmet Splitter, a moon blade landing): a short bell clang
const R = (a, b) => a + Math.random() * (b - a);
// inharmonic metal partials (a blade, not a glass bell)
const BLADE = [[1, 1, 1], [2.31, 0.55, 0.62], [3.97, 0.32, 0.4], [6.12, 0.16, 0.26], [8.7, 0.08, 0.16]];

export const SFX = {
  katana_draw: { vary: 0.05, max: 2, gap: 0.08, trim: 1.3, fn(s) {
    s.noise({ pts: [[0, 2600], [0.16, 7200]], q: 6, a: 0.02, h: 0.06, d: 0.14, v: 0.16 }); // (the blade sliding out of the mouth)
    s.bell({ at: 0.05, f: 1480, d: 0.55, v: 0.05, partials: BLADE, rev: 0.35 });
    s.tone({ at: 0.04, pts: [[0, 2900], [0.18, 3600]], type: 'sine', a: 0.004, d: 0.3, v: 0.03 });
    s.noise({ at: 0.03, pts: [[0, 600], [0.1, 1800], [0.2, 700]], q: 1.2, a: 0.03, d: 0.14, v: 0.12, color: 'pink' }); // (the swish)
  } },
  katana_sheath: { vary: 0.04, max: 1, gap: 0.15, trim: 1.5, fn(s) {
    s.noise({ pts: [[0, 3800], [0.14, 1800]], q: 5, a: 0.03, d: 0.1, v: 0.06 }); // (sliding home)
    s.noise({ at: 0.15, ft: 'bandpass', f: 1400, q: 3, a: 0.001, d: 0.035, v: 0.5 }); // the click
    s.tone({ at: 0.15, f: 820, f2: 620, a: 0.001, d: 0.05, v: 0.12, type: 'triangle' });
    s.bell({ at: 0.152, f: 3150, d: 0.12, v: 0.03, partials: BLADE });
  } },
  // Swallow Return's cuts: a fast, thin "shhk" of torn air (quicker and brighter than a swing) with the edge's zing on top
  katana_slice: { vary: 0.06, max: 3, gap: 0.04, trim: 1.2, fn(s) {
    s.noise({ pts: [[0, 1400], [0.04, 5200], [0.11, 1900]], q: 2.6, a: 0.008, d: 0.09, v: 0.75 });
    s.noise({ at: 0.005, pts: [[0, 700], [0.05, 1700], [0.12, 600]], q: 1.2, a: 0.015, d: 0.08, v: 0.35, color: 'pink' }); // (its body)
    s.bell({ at: 0.03, f: 2350, d: 0.2, v: 0.035, partials: BLADE, rev: 0.25 });
  } },
  katana_clang: { vary: 0.06, max: 3, gap: 0.05, trim: 1.1, fn(s) {
    s.bell({ f: R(820, 900), d: 0.42, v: 0.1, partials: BLADE, rev: 0.3 });
    s.noise({ f: 3400, q: 2, a: 0.001, d: 0.06, v: 0.25 });
    s.tone({ f: 260, f2: 150, a: 0.002, d: 0.08, v: 0.1 });
  } },
};
