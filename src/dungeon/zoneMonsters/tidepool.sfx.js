// Tide Caves's own monster sounds (sfx.js format: { fn(s), vary, max, gap, trim }). Pure data: no imports from game code.
// The Sazae-oni (turban-shell oni): shell clacks and chalky clinks, a wet "pop!" as it comes out, a gravelly little oni
// chuckle, spines bristling and whooshing out, the shell whirring like a top, a dizzy "uwaa".
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // woken: a wet pop out of the shell and a little rising oni "hah!"
  sazae_wake: { vary: 0.08, max: 2, gap: 0.3, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 240], [0.05, 520]], a: 0.002, d: 0.07, v: 0.35 });
    s.noise({ ft: 'bandpass', f: 1400, q: 3, a: 0.002, d: 0.06, v: 0.18 });
    s.voice({ at: 0.08, f: [[0, 210], [0.12, 300], [0.22, 260]], form: [[0, [650, 1150, 2600]], [0.22, [750, 1300, 2800]]], amp: [[0, 0], [0.02, 0.8], [0.16, 0.8], [0.26, 0]], q: [6, 7, 9], breath: 0.3, body: 0.55, v: 0.24 });
  } },
  // shutting itself in: a hollow chalky clack (the lid)
  sazae_tuck: { vary: 0.08, max: 3, gap: 0.12, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 900], [0.03, 620]], a: 0.001, d: 0.05, v: 0.3 });
    s.noise({ ft: 'bandpass', f: 2600, q: 4, a: 0.001, d: 0.035, v: 0.22 });
    s.tone({ at: 0.02, pts: [[0, 320], [0.06, 180]], a: 0.002, d: 0.08, v: 0.25 });
  } },
  // the spines bristling: a rising scrape and creak
  sazae_bristle: { vary: 0.06, max: 2, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 900, f2: 2600, q: 3, a: 0.1, h: 0.4, d: 0.12, v: 0.22, am: [26, 0.6], color: 'pink' });
    for (let i = 0; i < 6; i++) s.noise({ at: R(0.05, 0.6), f: R(2400, 4200), q: 6, a: 0.001, d: 0.02, v: 0.08 });
  } },
  // the star of spines flying out: a spread of whooshes
  sazae_fire: { vary: 0.06, max: 3, gap: 0.1, trim: 1.2, fn(s) {
    for (let i = 0; i < 5; i++) s.noise({ at: i * 0.012, ft: 'bandpass', f: R(1400, 2400), f2: R(500, 800), q: 2, a: 0.004, d: 0.18, v: 0.16 });
    s.tone({ pts: [[0, 160], [0.08, 90]], a: 0.002, d: 0.12, v: 0.3 });
  } },
  // spinning like a top: a gritty whirr that rises and wobbles
  sazae_spin: { vary: 0.05, max: 2, gap: 0.4, trim: 1.2, fn(s) {
    s.noise({ ft: 'bandpass', f: 500, f2: 1200, q: 3, a: 0.06, h: 0.7, d: 0.2, v: 0.32, am: [32, 0.7], color: 'pink' });
    s.tone({ pts: [[0, 180], [0.5, 320], [0.9, 260]], a: 0.05, d: 0.25, v: 0.12, vib: [18, 30] });
  } },
  // a spinning hit / a blow on the shut shell: a bright clink and a dull knock
  sazae_clank: { vary: 0.08, max: 3, gap: 0.08, trim: 1.2, fn(s) {
    s.tone({ pts: [[0, 1800], [0.04, 1500]], a: 0.001, d: 0.09, v: 0.22 });
    s.tone({ pts: [[0, 2700], [0.03, 2400]], a: 0.001, d: 0.06, v: 0.12 });
    s.tone({ pts: [[0, 200], [0.05, 120]], a: 0.002, d: 0.08, v: 0.3 });
  } },
  // dizzy after the spin: a wobbling "uwaa~"
  sazae_dizzy: { vary: 0.08, max: 2, gap: 0.4, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 260], [0.2, 200], [0.45, 230], [0.7, 170]], form: [[0, [700, 1200, 2600]], [0.7, [600, 1050, 2400]]], amp: [[0, 0], [0.04, 0.6], [0.55, 0.5], [0.75, 0]], q: [6, 7, 9], breath: 0.35, body: 0.5, v: 0.18, vib: [7, 30] });
  } },
  // hit with its face out: a little gruff "gah!"
  sazae_hurt: { vary: 0.1, max: 3, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 1600, q: 3, a: 0.001, d: 0.04, v: 0.2 });
    s.voice({ f: [[0, 240], [0.06, 290], [0.14, 210]], form: [[0, [700, 1200, 2600]], [0.14, [650, 1100, 2500]]], amp: [[0, 0], [0.01, 0.8], [0.1, 0.5], [0.15, 0]], q: [6, 7, 9], breath: 0.3, body: 0.5, v: 0.16 });
  } },
  // beaten: the shell cracks, bits clatter down, a sighing "fuwaa…"
  sazae_die: { vary: 0.06, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'highpass', f: 1800, a: 0.001, d: 0.12, v: 0.3 });
    for (let i = 0; i < 6; i++) s.tone({ at: 0.05 + i * 0.05 + R(0, 0.03), pts: [[0, R(900, 1600)], [0.05, R(600, 900)]], a: 0.001, d: 0.06, v: 0.14 - i * 0.015 });
    s.voice({ at: 0.15, f: [[0, 230], [0.45, 140]], form: [[0, [650, 1100, 2500]], [0.45, [500, 950, 2200]]], amp: [[0, 0], [0.05, 0.6], [0.4, 0.4], [0.55, 0]], q: [5, 6, 8], breath: 0.4, body: 0.5, v: 0.17 });
  } },
};
