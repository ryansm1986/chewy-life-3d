// Combo-chain sounds (docs/COMBO.md §1), sfx.js format: { fn(voice, opts), vary, max, gap, trim }, merged into the sfx
// table by src/audio/sfx.js. Small and bright, under the skill's own swing: a soft tick as a chain step lands in time
// (combat/combo.js raises its pitch per step), and a two-note "ta-da" chime for the finisher.
export const SFX = {
  // a chained step: a tiny wooden tick and a glint (pitch rises with the step)
  combo_step: { vary: 0, max: 2, gap: 0.05, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 880], [0.04, 1320]], type: 'triangle', a: 0.002, d: 0.08, v: 0.06 });
    s.noise({ f: 3200, q: 4, a: 0.001, d: 0.04, v: 0.03 });
  } },
  // the finisher: a bright rising two-bell chime with a sparkle tail
  combo_finish: { vary: 0, max: 2, gap: 0.08, trim: 1.5, fn(s) {
    s.bell({ f: 1318.5, d: 0.5, v: 0.09, rev: 0.4 });
    s.bell({ at: 0.07, f: 1975.5, d: 0.7, v: 0.08, rev: 0.45 });
    s.tone({ pts: [[0, 660], [0.06, 1320]], type: 'triangle', a: 0.002, d: 0.1, v: 0.06 });
    s.sparkle({ at: 0.08, n: 4, base: 2637, v: 0.025, spread: 0.2 });
  } },
};
