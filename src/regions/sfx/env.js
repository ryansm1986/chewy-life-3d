// Region environment sounds (sfx.js format: { fn(voice, opts), vary, max, gap, trim, duck }). Owned by the audio agent.
// Pure data: only audio-core imports. Levels are calibrated with the offline render check (?test=audio) against the
// village sounds: footsteps against footstep_grass / stone / wood at the game's step volume (0.35), one-shots against
// splash / chest_open / waypoint.
const R = (a, b) => a + Math.random() * (b - a);
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
// a free stone bar's inharmonic partials (the Wayfarer's Stone, stone chimes)
const STONE = [[1, 1, 1], [2.76, 0.5, 0.45], [5.4, 0.22, 0.25], [8.93, 0.07, 0.12]];
const GLASS = [[1, 1, 1], [2.32, 0.35, 0.5], [4.25, 0.12, 0.3]];

export const SFX = {
  // ------------------------------------------------------------------------------------------ footsteps
  // Paw steps on the region grounds. Same recipe as the village steps (a 1-3 kHz texture that reads at a low level, a
  // soft low thump for weight), each with its own grain.
  // dry fallen leaves: a crisp rustle and a handful of tiny crackles
  footstep_leaves: { vary: 0.12, max: 3, gap: 0.05, trim: 4.0, fn(s) {
    s.noise({ f: R(2300, 3100), q: 0.8, a: 0.006, d: 0.085, v: 0.32 });
    const n = 4 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) s.noise({ at: R(0, 0.075), f: R(2600, 4800), q: 3, a: 0.001, d: R(0.006, 0.014), v: R(0.22, 0.42) });
    s.noise({ ft: 'lowpass', f: 650, a: 0.003, d: 0.05, v: 0.3, color: 'pink' });
    s.tone({ f: 150, f2: 110, a: 0.002, d: 0.05, v: 0.1 });
  } },
  // packed snow: a soft, grainy "krmp" (square-wave AM on a mid band = the crunch), a muffled low thump
  footstep_snow: { vary: 0.1, max: 3, gap: 0.05, trim: 3.1, fn(s) {
    s.noise({ f: R(1150, 1500), q: 1.1, am: [R(65, 95), 0.75, 'square'], a: 0.012, h: 0.03, d: 0.07, v: 0.5 });
    for (let i = 0; i < 3; i++) s.noise({ at: R(0.005, 0.07), f: R(1700, 2800), q: 3.5, a: 0.001, d: R(0.008, 0.016), v: R(0.15, 0.28) });
    s.noise({ ft: 'lowpass', f: 480, a: 0.008, d: 0.07, v: 0.35, color: 'pink' });
    s.tone({ f: 125, f2: 90, a: 0.004, d: 0.06, v: 0.12 });
  } },
  // beach sand: a slow-attack "shff" with a little grit
  footstep_sand: { vary: 0.12, max: 3, gap: 0.05, trim: 2.7, fn(s) {
    s.noise({ f: R(1500, 2100), q: 0.7, a: 0.02, d: 0.085, v: 0.45, color: 'pink' });
    s.noise({ ft: 'highpass', f: 3200, am: [R(120, 170), 0.6, 'square'], a: 0.012, d: 0.05, v: 0.05 });
    s.noise({ ft: 'lowpass', f: 450, a: 0.006, d: 0.06, v: 0.3, color: 'brown' });
    s.tone({ f: 130, f2: 95, a: 0.003, d: 0.05, v: 0.1 });
  } },
  // shallow water (tide pools, the stream): a small splash, two or three droplets, a round plop
  footstep_water: { vary: 0.1, max: 3, gap: 0.05, trim: 2.7, fn(s) {
    s.noise({ f: R(1300, 1750), f2: 650, glide: 0.12, q: 0.9, a: 0.004, d: 0.15, v: 0.42 });
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) { const f = R(800, 1700); s.tone({ at: R(0.03, 0.14), f, f2: f * 1.7, glide: 0.025, a: 0.001, d: 0.04, v: 0.06 }); }
    s.tone({ pts: [[0, 230], [0.05, 420]], a: 0.003, d: 0.07, v: 0.12, lp: 1400 });
    s.noise({ ft: 'lowpass', f: 520, a: 0.004, d: 0.06, v: 0.25, color: 'pink' });
  } },

  // ------------------------------------------------------------------------------------------ travel
  // The Travel Map unrolls (plays under the UI's ui_open): paper unfurling with crinkles, a soft "thwap" as it lays
  // flat, then a little harp flourish — somewhere new to go.
  travel_map_open: { vary: 0.02, max: 1, gap: 0.3, trim: 1, fn(s) {
    s.noise({ pts: [[0, 700], [0.22, 2300], [0.38, 1300]], q: 1.2, a: 0.08, h: 0.1, d: 0.2, v: 0.2, color: 'pink' });
    for (let i = 0; i < 9; i++) s.noise({ at: R(0.02, 0.36), f: R(2200, 4000), q: 2.5, a: 0.001, d: R(0.008, 0.02), v: R(0.07, 0.15) });
    s.noise({ at: 0.39, ft: 'lowpass', f: 900, a: 0.002, d: 0.06, v: 0.28, color: 'pink' });
    s.tone({ at: 0.39, f: 185, f2: 120, a: 0.002, d: 0.08, v: 0.14 });
    [67, 69, 72, 74, 79].forEach((m, i) => s.pluck({ at: 0.43 + i * 0.05, m, kind: 'harp', v: 0.2 - i * 0.012, rev: 0.35, lp: 4200 }));
    s.bell({ at: 0.66, f: mf(86), d: 0.9, v: 0.045, rev: 0.45 });
  } },
  // Setting off (a destination picked, or the Wayfarer's Stone touched): the stone rings (two inharmonic stone-bar
  // strikes a fifth apart), a rising breeze carries you off, a warm swell and a scatter of sparkles.
  travel_chime: { vary: 0, max: 1, gap: 0.5, trim: 2.0, duck: [0.65, 1.8], fn(s) {
    s.noise({ f: 2600, q: 2, a: 0.001, d: 0.02, v: 0.22 });
    s.bell({ f: mf(79), d: 1.9, v: 0.09, partials: STONE, rev: 0.5 });
    s.bell({ at: 0.15, f: mf(86), d: 1.7, v: 0.075, partials: STONE, rev: 0.5 });
    s.tone({ pts: [[0, 300], [0.1, 430]], a: 0.003, d: 0.38, v: 0.18 });
    s.noise({ at: 0.12, pts: [[0, 420], [0.8, 3000], [1.3, 900]], q: 2.5, a: 0.5, h: 0.2, d: 0.6, lin: true, v: 0.2, rev: 0.4 });
    s.tone({ at: 0.12, pts: [[0, mf(67)], [0.9, mf(74)]], stack: [['sine', -6, 0.6], ['sine', 6, 0.6], ['sine', 0, 0.25, 2]], a: 0.35, h: 0.4, d: 0.8, lin: true, v: 0.085, rev: 0.5 });
    s.sparkle({ at: 0.5, n: 7, base: 2349, spread: 0.8, v: 0.032 });
  } },
};
