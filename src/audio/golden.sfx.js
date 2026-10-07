// The Golden Retriever dragoon's sounds (docs/GOLDEN.md), sfx.js format: { fn(voice, opts), vary, max, gap, trim }, merged
// into the sfx table by src/audio/sfx.js. Bright and bouncy to match him: the braided-rope shaft's airy whoosh, the
// tennis-ball pommel's fat "thok" on a good poke, a sunbeam's shimmer, a javelin's "fwip" and the rubber tip's "bonk",
// a happy "boof"; and Shadow the whelp's poof and soft felt wing-flaps.
const R = (a, b) => a + Math.random() * (b - a);

export const SFX = {
  // the lance swung or thrust: an airy rope-and-felt whoosh, a little brighter than the flail's
  lance_whoosh: { vary: 0.06, max: 3, gap: 0.05, trim: 1.4, fn(s) {
    s.noise({ f: 700, f2: 2400, glide: 0.12, q: 1.1, a: 0.015, d: 0.17, v: 0.24, color: 'pink' });
    s.tone({ pts: [[0, 240], [0.1, 360], [0.18, 220]], type: 'triangle', a: 0.01, d: 0.16, v: 0.045 });
  } },
  // a poke lands: the tennis-ball pommel's fat rubbery "thok" and a tiny squeak
  lance_poke: { vary: 0.07, max: 4, gap: 0.035, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 260], [0.07, 120]], a: 0.002, d: 0.1, v: 0.3 });
    s.noise({ ft: 'lowpass', f: 1300, a: 0.002, d: 0.05, v: 0.2, color: 'brown' });
    if (Math.random() < 0.5) s.tone({ at: 0.02, pts: [[0, 1500], [0.04, 1950], [0.08, 1650]], type: 'triangle', a: 0.003, d: 0.07, v: 0.045, vib: [24, 40] });
  } },
  // Sunbeam Thrust: a long bright swish with a rising shimmer (the sunbeam) and a warm chord on top
  sunbeam_thrust: { vary: 0.03, max: 2, gap: 0.08, trim: 1.35, fn(s) {
    s.noise({ f: 900, f2: 3800, glide: 0.18, q: 1.2, a: 0.01, d: 0.26, v: 0.24, color: 'pink' });
    s.tone({ pts: [[0, 520], [0.18, 1040]], type: 'triangle', a: 0.02, d: 0.3, v: 0.05 });
    s.bell({ at: 0.06, f: 1318, d: 0.5, v: 0.05, rev: 0.4 });
    s.bell({ at: 0.09, f: 1976, d: 0.45, v: 0.035, rev: 0.4 });
  } },
  // a javelin drawn from the quiver: a soft felt rustle and a wooden tick
  jav_draw: { vary: 0.05, max: 2, gap: 0.08, trim: 1.3, fn(s) {
    s.noise({ f: 2600, f2: 1800, glide: 0.1, q: 1.5, a: 0.01, d: 0.09, v: 0.07, color: 'pink' });
    s.tone({ at: 0.06, pts: [[0, 1100], [0.02, 820]], a: 0.001, d: 0.03, v: 0.06 });
  } },
  // a javelin thrown: a quick "fwip" (felt fletching through the air)
  jav_fwip: { vary: 0.08, max: 4, gap: 0.03, trim: 1.35, fn(s) {
    s.noise({ f: 1200, f2: 4200, glide: 0.08, q: 2.2, a: 0.004, d: 0.1, v: 0.2, color: 'pink' });
    s.tone({ pts: [[0, 700], [0.08, 1400]], type: 'triangle', a: 0.003, d: 0.08, v: 0.035 });
  } },
  // the gold rubber tip lands on a foe: a cartoon "bonk" (a hollow knock, a boing after it)
  jav_bonk: { vary: 0.08, max: 4, gap: 0.03, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 620], [0.05, 300]], a: 0.001, d: 0.08, v: 0.28 });
    s.tone({ pts: [[0, 1250], [0.04, 700]], type: 'triangle', a: 0.001, d: 0.05, v: 0.08 });
    s.tone({ at: 0.05, pts: [[0, 330], [0.06, 470], [0.14, 300]], a: 0.004, d: 0.13, v: 0.07, vib: [18, 30] });
  } },
  // a javelin sticks in the ground: a dull "thock" and grit
  jav_stick: { vary: 0.08, max: 3, gap: 0.04, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 220], [0.06, 120]], a: 0.002, d: 0.08, v: 0.2 });
    s.noise({ ft: 'lowpass', f: 900, a: 0.002, d: 0.06, v: 0.12, color: 'brown' });
    for (let i = 0; i < 2; i++) s.noise({ at: R(0.02, 0.07), f: R(2000, 3400), q: 3, a: 0.002, d: 0.03, v: R(0.015, 0.03) });
  } },
  // a happy golden "boof" (one soft, deep, delighted bark)
  golden_boof: { vary: 0.05, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 260], [0.05, 330], [0.16, 250]], form: [[0, [620, 1100, 2400]], [0.12, [520, 980, 2300]]],
      amp: [[0, 0], [0.03, 1], [0.12, 0.7], [0.2, 0]], q: [6, 8, 9], breath: 0.25, body: 0.6, v: 0.45, rev: 0.3 });
  } },
  // Shadow puts the whelp outfit on / takes it off: a soft cloth poof and a twinkle
  whelp_poof: { vary: 0.04, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 1600, f2: 500, glide: 0.2, a: 0.01, d: 0.28, v: 0.22, color: 'pink' });
    s.tone({ pts: [[0, 300], [0.08, 600]], a: 0.004, d: 0.1, v: 0.08 });
    s.bell({ at: 0.1, f: 1568, d: 0.4, v: 0.05, rev: 0.4 });
    s.bell({ at: 0.15, f: 2093, d: 0.35, v: 0.035, rev: 0.4 });
  } },
  // a felt wing's downstroke: a soft, low "fwump" (quiet: it repeats)
  whelp_flap: { vary: 0.1, max: 2, gap: 0.12, trim: 1.2, fn(s) {
    s.noise({ ft: 'lowpass', f: 700, f2: 300, glide: 0.08, a: 0.01, d: 0.09, v: 0.07, color: 'brown' });
  } },

  // ---- Lance Arts (checkpoint 2)
  // Sunfall Jump's spring: a springy "boing" under a rising whoosh
  gld_jump: { vary: 0.04, max: 1, gap: 0.2, trim: 1.35, fn(s) {
    s.tone({ pts: [[0, 180], [0.05, 260], [0.16, 520]], type: 'triangle', a: 0.004, d: 0.2, v: 0.14, vib: [14, 30] });
    s.noise({ f: 500, f2: 2600, glide: 0.25, q: 1.1, a: 0.02, d: 0.3, v: 0.16, color: 'pink' });
  } },
  // the dive: a cartoon falling whistle, high to low
  gld_dive: { vary: 0.03, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 2100], [0.22, 900]], type: 'sine', a: 0.02, d: 0.24, v: 0.06, vib: [6, 12] });
    s.noise({ f: 1800, f2: 700, glide: 0.2, q: 1.4, a: 0.04, d: 0.22, v: 0.1, color: 'pink' });
  } },
  // the landing: a deep soft thump, grit, a bright little chord (the sun on the lance)
  gld_crash: { vary: 0.04, max: 2, gap: 0.12, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 140], [0.12, 55]], a: 0.002, d: 0.22, v: 0.42 });
    s.noise({ ft: 'lowpass', f: 1100, f2: 300, glide: 0.2, a: 0.002, d: 0.26, v: 0.3, color: 'brown' });
    for (let i = 0; i < 3; i++) s.noise({ at: R(0.03, 0.12), f: R(1800, 3200), q: 3, a: 0.002, d: 0.04, v: R(0.02, 0.04) });
    s.bell({ at: 0.04, f: 1047, d: 0.5, v: 0.05, rev: 0.4 }); s.bell({ at: 0.07, f: 1568, d: 0.45, v: 0.04, rev: 0.4 });
  } },
  // Pinwheel Sweep: a big round whoosh, two passes of it
  gld_spin: { vary: 0.05, max: 2, gap: 0.08, trim: 1.35, fn(s) {
    s.noise({ f: 500, f2: 1900, glide: 0.18, q: 1, a: 0.02, d: 0.24, v: 0.22, color: 'pink' });
    s.noise({ at: 0.12, f: 1500, f2: 600, glide: 0.16, q: 1, a: 0.02, d: 0.2, v: 0.14, color: 'pink' });
  } },
  // Gallant Charge: three quick paw-thuds and the rush of air
  gld_charge: { vary: 0.04, max: 1, gap: 0.2, trim: 1.35, fn(s) {
    for (let i = 0; i < 3; i++) s.tone({ at: i * 0.07, pts: [[0, 150], [0.04, 80]], a: 0.002, d: 0.06, v: 0.2 });
    s.noise({ f: 800, f2: 2400, glide: 0.3, q: 1, a: 0.03, d: 0.36, v: 0.16, color: 'pink' });
    s.voice({ at: 0.02, f: [[0, 300], [0.06, 380], [0.12, 320]], form: [[0, [650, 1150, 2450]]], amp: [[0, 0], [0.02, 1], [0.1, 0.6], [0.14, 0]], q: [6, 8, 9], breath: 0.3, body: 0.5, v: 0.3, rev: 0.25 });
  } },
  // the skid at the end of the charge: a scuffing scrape
  gld_skid: { vary: 0.06, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'bandpass', f: 1400, f2: 700, glide: 0.25, q: 0.8, a: 0.01, d: 0.28, v: 0.14, color: 'brown' });
  } },
  // Starfall Lance: the heave up (a big rising whoosh and a bell), the fall (a long descending shimmer), the crash
  star_throw: { vary: 0.03, max: 1, gap: 0.3, trim: 1.35, fn(s) {
    s.noise({ f: 400, f2: 3200, glide: 0.35, q: 1.1, a: 0.02, d: 0.4, v: 0.2, color: 'pink' });
    s.bell({ at: 0.1, f: 1318, d: 0.6, v: 0.04, rev: 0.5 });
  } },
  star_fall: { vary: 0.02, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 2600], [0.34, 1100]], type: 'sine', a: 0.03, d: 0.36, v: 0.06, vib: [7, 16] });
    for (let i = 0; i < 4; i++) s.bell({ at: i * 0.07, f: 2637 - i * 300, d: 0.25, v: 0.025, rev: 0.4 });
  } },
  star_crash: { vary: 0.03, max: 1, gap: 0.2, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 120], [0.18, 42]], a: 0.002, d: 0.32, v: 0.48 });
    s.noise({ ft: 'lowpass', f: 1500, f2: 250, glide: 0.3, a: 0.003, d: 0.4, v: 0.32, color: 'brown' });
    for (let i = 0; i < 5; i++) s.noise({ at: R(0.05, 0.3), f: R(2200, 4200), q: 4, a: 0.002, d: 0.05, v: R(0.02, 0.035) }); // (the embers' crackle)
    s.bell({ at: 0.05, f: 784, d: 0.7, v: 0.05, rev: 0.5 }); s.bell({ at: 0.08, f: 1175, d: 0.6, v: 0.04, rev: 0.5 }); s.bell({ at: 0.11, f: 1568, d: 0.5, v: 0.03, rev: 0.5 });
  } },
  // the lance caught on the bounce: a slap of rope in the paw
  lance_catch: { vary: 0.05, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 330], [0.05, 180]], a: 0.001, d: 0.07, v: 0.2 });
    s.noise({ ft: 'lowpass', f: 1800, a: 0.001, d: 0.05, v: 0.15, color: 'pink' });
  } },
  // ---- Javelins (checkpoint 2)
  // Tailwag Volley: a rattle of fwips fanned out
  jav_volley: { vary: 0.05, max: 2, gap: 0.08, trim: 1.35, fn(s) {
    for (let i = 0; i < 5; i++) s.noise({ at: i * 0.022, f: R(1100, 1500), f2: R(3600, 4400), glide: 0.07, q: 2.2, a: 0.003, d: 0.08, v: 0.12, color: 'pink' });
  } },
  // True Flight: one long, honest whistle
  jav_true: { vary: 0.03, max: 2, gap: 0.12, trim: 1.35, fn(s) {
    s.noise({ f: 1600, f2: 5200, glide: 0.1, q: 2.6, a: 0.004, d: 0.22, v: 0.2, color: 'pink' });
    s.tone({ pts: [[0, 1400], [0.2, 2100]], type: 'sine', a: 0.01, d: 0.26, v: 0.05 });
  } },
  // the Emberleaf javelin catching / fizzing in a foe: a soft sizzle
  ember_fizz: { vary: 0.08, max: 2, gap: 0.1, trim: 1.25, fn(s) {
    for (let i = 0; i < 6; i++) s.noise({ at: R(0, 0.3), f: R(2500, 5000), q: 5, a: 0.002, d: R(0.02, 0.05), v: R(0.015, 0.03) });
    s.noise({ ft: 'highpass', f: 3000, a: 0.03, d: 0.3, v: 0.04 });
  } },
  // its burst: a warm pop and a shower of crackles
  ember_burst: { vary: 0.05, max: 2, gap: 0.08, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 240], [0.08, 90]], a: 0.002, d: 0.14, v: 0.32 });
    s.noise({ ft: 'lowpass', f: 2000, f2: 600, glide: 0.15, a: 0.002, d: 0.2, v: 0.22, color: 'pink' });
    for (let i = 0; i < 7; i++) s.noise({ at: R(0.03, 0.35), f: R(2400, 4800), q: 4, a: 0.002, d: 0.04, v: R(0.02, 0.04) });
  } },
  // Sunshower: the quiver flung up, a glittering rise
  sun_fling: { vary: 0.03, max: 1, gap: 0.3, trim: 1.35, fn(s) {
    s.noise({ f: 600, f2: 3600, glide: 0.3, q: 1.2, a: 0.02, d: 0.34, v: 0.18, color: 'pink' });
    for (let i = 0; i < 5; i++) s.bell({ at: 0.05 + i * 0.06, f: 1568 + i * 220, d: 0.3, v: 0.025, rev: 0.4 });
  } },
  // Good Retriever: a javelin scooped up, a cheerful blip
  jav_scoop: { vary: 0.04, max: 2, gap: 0.08, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 660], [0.06, 990]], type: 'triangle', a: 0.003, d: 0.08, v: 0.08 });
    s.bell({ at: 0.04, f: 1976, d: 0.25, v: 0.035, rev: 0.3 });
  } },
  // ---- the Whelp Bond (checkpoint 2)
  // Foosy's command: a bright little two-note "hup-hup!"
  whelp_call: { vary: 0.04, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    for (let i = 0; i < 2; i++) s.voice({ at: i * 0.11, f: [[0, 300 + i * 60], [0.05, 360 + i * 70]], form: [[0, [700, 1200, 2500]]], amp: [[0, 0], [0.02, 1], [0.06, 0.5], [0.08, 0]], q: [6, 8, 9], breath: 0.25, body: 0.5, v: 0.32, rev: 0.25 });
  } },
  // Shadow takes a big breath
  whelp_inhale: { vary: 0.05, max: 1, gap: 0.2, trim: 1.2, fn(s) {
    s.noise({ ft: 'bandpass', f: 900, f2: 1600, glide: 0.25, q: 1.2, a: 0.12, d: 0.12, v: 0.06, color: 'pink' });
  } },
  // a puff of ember breath: a breathy "fwoof" and a crackle
  whelp_breath: { vary: 0.07, max: 3, gap: 0.06, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 1400, f2: 500, glide: 0.12, a: 0.01, d: 0.16, v: 0.18, color: 'pink' });
    for (let i = 0; i < 3; i++) s.noise({ at: R(0.02, 0.14), f: R(2500, 4500), q: 4, a: 0.002, d: 0.03, v: R(0.015, 0.03) });
  } },
  // Divebomb Swoop: a little whistle down, then a soft fiery thump
  whelp_swoop: { vary: 0.04, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 1800], [0.24, 700]], type: 'sine', a: 0.02, d: 0.26, v: 0.05 });
    s.noise({ f: 1500, f2: 600, glide: 0.22, q: 1.2, a: 0.05, d: 0.2, v: 0.08, color: 'pink' });
  } },
  whelp_thump: { vary: 0.05, max: 2, gap: 0.1, trim: 1.35, fn(s) {
    s.tone({ pts: [[0, 200], [0.08, 80]], a: 0.002, d: 0.14, v: 0.3 });
    s.noise({ ft: 'lowpass', f: 1600, f2: 500, glide: 0.15, a: 0.002, d: 0.16, v: 0.18, color: 'pink' });
    for (let i = 0; i < 4; i++) s.noise({ at: R(0.03, 0.2), f: R(2500, 4500), q: 4, a: 0.002, d: 0.03, v: R(0.015, 0.03) });
  } },
  // Wing Shield: the wings spread with a felt "fwump" and a twinkle; its gust
  whelp_shield: { vary: 0.04, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 900, f2: 400, glide: 0.1, a: 0.01, d: 0.14, v: 0.14, color: 'brown' });
    s.bell({ at: 0.06, f: 1318, d: 0.35, v: 0.04, rev: 0.4 }); s.bell({ at: 0.1, f: 1760, d: 0.3, v: 0.03, rev: 0.4 });
  } },
  whelp_gust: { vary: 0.04, max: 1, gap: 0.2, trim: 1.35, fn(s) {
    s.noise({ f: 400, f2: 1600, glide: 0.25, q: 0.9, a: 0.02, d: 0.36, v: 0.22, color: 'pink' });
    s.noise({ ft: 'lowpass', f: 600, a: 0.005, d: 0.1, v: 0.12, color: 'brown' });
  } },
  // Mighty Little Roar: a would-be roar that comes out as a squeak
  whelp_roar: { vary: 0.03, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.voice({ f: [[0, 420], [0.1, 520], [0.22, 1300], [0.32, 1500]], form: [[0, [800, 1400, 2800]], [0.2, [1100, 2200, 3400]]], amp: [[0, 0], [0.04, 0.8], [0.2, 1], [0.34, 0]], q: [6, 8, 10], breath: 0.3, body: 0.4, v: 0.36, rev: 0.3 });
  } },
  // Dragon Heart: a low swell and a bright chord (grow), a deep stomp, a poof back down (shrink)
  dragon_grow: { vary: 0.02, max: 1, gap: 0.5, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 70], [0.5, 140]], a: 0.1, d: 0.5, v: 0.3 });
    s.noise({ ft: 'lowpass', f: 400, f2: 1400, glide: 0.4, a: 0.1, d: 0.45, v: 0.18, color: 'brown' });
    s.bell({ at: 0.3, f: 523, d: 0.8, v: 0.05, rev: 0.5 }); s.bell({ at: 0.34, f: 784, d: 0.7, v: 0.045, rev: 0.5 }); s.bell({ at: 0.38, f: 1047, d: 0.6, v: 0.04, rev: 0.5 });
  } },
  dragon_stomp: { vary: 0.05, max: 1, gap: 0.3, trim: 1.4, fn(s) {
    s.tone({ pts: [[0, 110], [0.12, 45]], a: 0.002, d: 0.2, v: 0.36 });
    s.noise({ ft: 'lowpass', f: 700, a: 0.002, d: 0.14, v: 0.18, color: 'brown' });
  } },
  dragon_shrink: { vary: 0.03, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.noise({ ft: 'lowpass', f: 1600, f2: 500, glide: 0.2, a: 0.01, d: 0.26, v: 0.18, color: 'pink' });
    s.tone({ pts: [[0, 700], [0.2, 300]], type: 'triangle', a: 0.004, d: 0.22, v: 0.08 });
  } },
};
