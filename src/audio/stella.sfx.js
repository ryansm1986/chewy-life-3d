// Stella the Sun Oracle's sounds (docs/STELLA.md §4.3), sfx.js format: { fn(voice, opts), vary, max, gap, trim }, merged
// into the sfx table by src/audio/sfx.js. Warm and gentle to match her: the paper wagasa's soft whoosh and "fwump", glassy
// chimes for her light, a soft choir "aah" for her rays, a warm hum for the held beam, shrine suzu bells for her heals and
// a low warm "thoom" for her flares. Sunlight, not fire: no crackle anywhere. Everything tuned sits in C major pentatonic
// (the key of the game's heal and chimes), so overlapping heals, hours and gildings harmonise.
const R = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
const PENT = [0, 2, 4, 7, 9]; // C D E G A
const pent = (i, base = 72) => mf(base + 12 * Math.floor(i / 5) + PENT[((i % 5) + 5) % 5]); // step i up from C5
const GLASS = [[1, 1, 1], [2.32, 0.35, 0.5], [4.25, 0.12, 0.3]]; // a glassy chime (as sfx.js's)
const SUZU = [[1, 1, 1], [1.59, 0.42, 0.55], [2.42, 0.26, 0.35], [3.3, 0.12, 0.22]]; // a small round shrine bell
const GONG = [[1, 1, 1], [1.47, 0.55, 0.75], [2.01, 0.45, 0.6], [2.53, 0.3, 0.45], [3.07, 0.2, 0.35], [3.9, 0.1, 0.25]];
const TEMPLE = [[1, 1, 1], [1.004, 0.8, 1], [2.01, 0.55, 0.6], [2.72, 0.45, 0.45], [2.735, 0.3, 0.45], [4.1, 0.16, 0.25]];
// the held beam's chunk: a quick quarter-sine in (0.03 s), a long plateau, a quarter-cosine out (0.15 s). stl_beam has
// max 1, so each re-trigger (~0.3 s) steals the chunk before it with audio.js's 30 ms fade while the new one fades in: one
// short crossfade wherever the re-trigger lands, so the hum holds steady (overlapping long fades of the same tone beat
// and dip by 5-8 dB; this holds within 1-2 dB). The plateau covers a re-trigger that comes late; the last chunk fades itself.
const LOOP = (() => {
  const p = [[0, 0]];
  for (let i = 1; i <= 3; i++) p.push([0.01 * i, Math.sin((i / 3) * Math.PI / 2)]);
  p.push([0.5, 1]);
  for (let i = 1; i <= 5; i++) p.push([0.5 + 0.03 * i, i === 5 ? 0 : Math.cos((i / 5) * Math.PI / 2)]);
  return p;
})();
// a soft choir "aah": one formant voice on note f (Hz), len seconds long
const aah = (s, at, f, len, v, { a = 0.05, pan = 0, rev = 0.55 } = {}) => s.voice({ at, f: [[0, f * 0.985], [0.06, f]], vib: [5.2, 14, 0.08],
  form: [[0, [780, 1180, 2850]], [len, [740, 1120, 2800]]], amp: [[0, 0], [a, 1], [len * 0.6, 0.75], [len, 0]],
  q: [7, 9, 12], fg: [1, 0.55, 0.22], breath: 0.12, body: 0.15, bodyF: 900, v, pan, rev });
// a gentle shake of suzu: a few little bells together and the pellet's soft rattle
const suzu = (s, at, lv) => {
  for (let j = 0; j < 3; j++) s.bell({ at: at + j * R(0.006, 0.018), f: pick([1568, 1760, 2093, 2349, 2637]), detune: R(-8, 8), d: 0.4, v: 0.03 * lv, rev: 0.45, partials: SUZU, lp: 7000, pan: R(-0.4, 0.4) });
  s.noise({ at, f: 4800, q: 2, a: 0.002, d: 0.05, v: 0.022 * lv, am: [46, 0.7] });
};

export const SFX = {
  // ---- the wagasa
  // the basic attack's sweep: a soft paper-parasol whoosh, a little shimmer of light on top (frequent: kept light)
  stl_sweep: { vary: 0.06, max: 3, gap: 0.06, trim: 1.6, fn(s) {
    s.noise({ f: 520, f2: 1900, glide: 0.14, q: 0.9, a: 0.02, d: 0.18, v: 0.2, color: 'pink' });
    s.noise({ ft: 'lowpass', f: 900, a: 0.01, d: 0.1, v: 0.06, color: 'brown' }); // (the canopy's soft push of air)
    s.noise({ at: 0.05, ft: 'highpass', f: 6500, a: 0.04, d: 0.16, v: 0.025, am: [16, 0.6] });
    s.bell({ at: 0.07, f: pick([1568, 1760, 2093]), d: 0.3, v: 0.02, rev: 0.4, partials: GLASS });
  } },
  // the combo's third move: the wagasa spun open, a brighter swirl (up and round) and a bell sparkle
  stl_twirl: { vary: 0.04, max: 2, gap: 0.1, trim: 1.35, fn(s) {
    s.noise({ f: 600, f2: 2600, glide: 0.16, q: 1, a: 0.02, d: 0.2, v: 0.2, color: 'pink', am: [18, 0.45] });
    s.noise({ at: 0.14, f: 2200, f2: 800, glide: 0.18, q: 1, a: 0.02, d: 0.2, v: 0.13, color: 'pink', am: [14, 0.4] });
    s.tone({ pts: [[0, 392], [0.16, 784], [0.3, 659]], type: 'triangle', a: 0.02, d: 0.28, v: 0.04 });
    s.noise({ at: 0.06, ft: 'highpass', f: 6000, a: 0.06, d: 0.25, v: 0.03, am: [12, 0.5], rev: 0.3 });
    [1568, 2093, 2637].forEach((f, i) => s.bell({ at: 0.12 + i * 0.05, f, d: 0.4, v: 0.035 - i * 0.006, rev: 0.45, pan: (i - 1) * 0.25 }));
  } },
  // the canopy opening: a paper "fwump", the bamboo ribs clicking home
  stl_parasol: { vary: 0.04, max: 1, gap: 0.25, trim: 1.35, fn(s) {
    s.noise({ ft: 'lowpass', f: 1400, f2: 380, glide: 0.16, a: 0.012, d: 0.2, v: 0.26, color: 'pink' });
    s.tone({ pts: [[0, 150], [0.1, 85]], a: 0.004, d: 0.14, v: 0.14 });
    s.noise({ f: 2600, q: 1.4, a: 0.004, d: 0.06, v: 0.05 }); // (the paper's crinkle)
    for (let i = 0; i < 2; i++) s.tone({ at: 0.03 + i * 0.035, pts: [[0, 1300 - i * 150], [0.015, 950 - i * 100]], a: 0.001, d: 0.02, v: 0.04 });
  } },

  // ---- Sunbeam Arts
  // Golden Ray: a quick bright ray: a soft choir "aah" on a pentatonic chord, a glassy shimmer (an air, never a zap)
  stl_ray: { vary: 0.03, max: 2, gap: 0.1, trim: 1.3, fn(s) {
    aah(s, 0, 659, 0.42, 0.06, { a: 0.04, pan: -0.15 }); aah(s, 0.01, 784, 0.4, 0.05, { a: 0.04, pan: 0.15 }); aah(s, 0.02, 1046, 0.36, 0.032, { a: 0.04 });
    s.noise({ f: 1800, f2: 4200, glide: 0.12, q: 1.6, a: 0.01, d: 0.12, v: 0.05, color: 'pink' });
    s.noise({ ft: 'highpass', f: 5200, a: 0.03, d: 0.3, v: 0.04, am: [13, 0.5], rev: 0.4 });
    s.bell({ at: 0.03, f: 2093, d: 0.45, v: 0.035, rev: 0.45, partials: GLASS }); s.bell({ at: 0.07, f: 2637, d: 0.4, v: 0.025, rev: 0.45, partials: GLASS });
  } },
  // Glint: a bright "ting" of light off a mirror, a breath of glare
  stl_glint: { vary: 0.04, max: 2, gap: 0.08, trim: 1.35, fn(s) {
    s.fm({ f: 2637, ratio: 3.01, index: 0.6, id: 0.04, a: 0.001, d: 0.35, v: 0.055, rev: 0.35 });
    s.bell({ at: 0.01, f: 3520, d: 0.28, v: 0.025, rev: 0.4, partials: GLASS });
    s.tone({ pts: [[0, 1318], [0.03, 2637]], type: 'triangle', a: 0.002, d: 0.05, v: 0.03 });
    s.noise({ ft: 'highpass', f: 7000, a: 0.003, d: 0.07, v: 0.035 });
  } },
  // Prism: the ray splitting: a glassy chime arpeggio fanned across the stereo field
  stl_prism: { vary: 0.03, max: 2, gap: 0.1, trim: 1.3, fn(s) {
    [1318, 1568, 1760, 2093, 2637].forEach((f, i) => s.bell({ at: i * 0.045, f, d: 0.55, v: 0.045 - i * 0.004, rev: 0.5, partials: GLASS, pan: (i - 2) * 0.22 }));
    s.tone({ pts: [[0, 1046], [0.04, 2093]], type: 'triangle', a: 0.002, d: 0.06, v: 0.03 });
    s.noise({ ft: 'highpass', f: 5500, a: 0.02, d: 0.3, v: 0.03, am: [11, 0.5], rev: 0.4 });
  } },
  // Solar Ray's held beam: a loopable chunk of warm hum, re-triggered every ~0.3 s while the beam holds, opts.pitch rising
  // 1 → 1.4 as it ramps (max 1: see LOOP). Optional opts.pitchTo (the next chunk's pitch) glides this chunk there over
  // 0.3 s, so the ramp rises smoothly instead of in small steps.
  stl_beam: { vary: 0.004, max: 1, gap: 0.18, trim: 1.2, fn(s, o) {
    const g = o && o.pitchTo && o.pitch ? o.pitchTo / o.pitch : 1, hz = f => (g === 1 ? { f } : { pts: [[0, f], [0.3, f * g], [0.65, f * g]] });
    s.tone({ ...hz(262), stack: [['triangle', 0, 1], ['sine', 6, 0.7, 1.5], ['sine', -4, 0.6, 2], ['sine', 3, 0.3, 3]], vib: [4.5, 7], amp: LOOP, v: 0.075, lp: 1800, rev: 0.45 });
    s.tone({ ...hz(1046.5), amp: LOOP, v: 0.01, vib: [6, 8] }); // (a faint high overtone: the light singing)
    s.noise({ ft: 'highpass', f: 6000, amp: LOOP, v: 0.018, am: [9, 0.5] });
  } },
  // the beam let go: the hum sighing down under a soft fading shimmer
  stl_beamEnd: { vary: 0.03, max: 1, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ f: 262, f2: 220, glide: 0.5, stack: [['triangle', 0, 1], ['sine', 6, 0.5, 1.5]], a: 0.01, d: 0.55, v: 0.06, lp: 1600, lp2: 500, lt: 0.5, rev: 0.5 });
    s.noise({ ft: 'highpass', f: 5000, a: 0.01, d: 0.6, v: 0.035, am: [10, 0.5], rev: 0.5 });
    [2637, 2093, 1568].forEach((f, i) => s.bell({ at: 0.04 + i * 0.09, f, d: 0.5, v: 0.03 - i * 0.006, rev: 0.5, partials: GLASS }));
  } },
  // Sundial: one hour striking, a tick and a small bell (12 in 2.4 s). opts.hour (0-11) climbs C pentatonic from C5;
  // without it the bell rings C6 and opts.pitch sets the note as usual.
  stl_hour: { vary: 0, max: 4, gap: 0.08, trim: 1.35, fn(s, o) {
    const f = o && o.hour != null ? pent(((o.hour | 0) % 12 + 12) % 12) : 1046.5;
    s.tone({ pts: [[0, 2400], [0.012, 1800]], a: 0.001, d: 0.025, v: 0.05 });
    s.noise({ f: 3800, q: 3, a: 0.001, d: 0.015, v: 0.04 });
    s.bell({ at: 0.012, f, d: 0.55, v: 0.05, rev: 0.45, partials: SUZU });
  } },
  // Solar Flare: a low warm "thoom" with a bright top (no fire crackle)
  stl_flare: { vary: 0.04, max: 2, gap: 0.15, trim: 1.4, duck: [0.85, 0.5], fn(s) {
    s.tone({ pts: [[0, 130], [0.2, 52]], a: 0.006, d: 0.42, v: 0.4 });
    s.tone({ pts: [[0, 196], [0.25, 98]], type: 'triangle', a: 0.01, d: 0.35, v: 0.08, lp: 700 });
    s.noise({ ft: 'lowpass', f: 900, f2: 260, glide: 0.35, a: 0.008, d: 0.4, v: 0.24, color: 'brown' }); // (its soft rolling air)
    s.noise({ at: 0.02, ft: 'highpass', f: 5200, a: 0.03, d: 0.55, v: 0.045, am: [11, 0.5], rev: 0.5 });
    [1046, 1568, 2093].forEach((f, i) => s.bell({ at: 0.04 + i * 0.03, f, d: 0.7, v: 0.045 - i * 0.008, rev: 0.5 }));
  } },
  // Skipping Sun: a "plip" like a stone skipping on water (a drop's upward chirp, a tiny splash) and a tiny chime
  stl_skip: { vary: 0.06, max: 3, gap: 0.06, trim: 1.35, fn(s) {
    s.tone({ pts: [[0, 520], [0.035, 1300]], a: 0.002, d: 0.06, v: 0.15 });
    s.noise({ at: 0.005, ft: 'highpass', f: 2800, a: 0.002, d: 0.05, v: 0.05 });
    s.noise({ at: 0.01, f: 1200, q: 1.2, a: 0.004, d: 0.08, v: 0.05, color: 'pink' });
    s.bell({ at: 0.03, f: pick([1568, 1760, 2093]), d: 0.35, v: 0.035, rev: 0.4, partials: GLASS });
  } },
  // Sunspot landing: a warm soft drone swell (G and D under a high E)
  stl_spot: { vary: 0.03, max: 2, gap: 0.3, trim: 1.3, fn(s) {
    s.tone({ f: 196, stack: [['triangle', 0, 1], ['sine', 5, 0.6, 1.5], ['sine', -4, 0.4, 2]], vib: [4, 8], a: 0.35, h: 0.15, d: 0.5, v: 0.08, lp: 1100, lp2: 1800, lt: 0.4, rev: 0.5 });
    s.tone({ f: 523, a: 0.4, h: 0.1, d: 0.45, v: 0.022, vib: [5, 10] });
    s.noise({ ft: 'lowpass', f: 500, f2: 1200, glide: 0.4, a: 0.3, d: 0.5, v: 0.05, color: 'brown' });
    s.bell({ at: 0.32, f: 1318.5, d: 0.6, v: 0.025, rev: 0.5 });
  } },
  // Hinata's sunbolt: a cheerful little "pew" (quiet: it repeats often)
  stl_hinata: { vary: 0.07, max: 2, gap: 0.09, trim: 1.05, fn(s) {
    s.tone({ pts: [[0, 2093], [0.08, 1046]], type: 'triangle', a: 0.003, d: 0.09, v: 0.04 });
    s.tone({ pts: [[0, 1046], [0.08, 523]], a: 0.003, d: 0.08, v: 0.03 });
    s.noise({ ft: 'highpass', f: 5000, a: 0.002, d: 0.035, v: 0.012 });
  } },
  // Hinata appearing: a happy little rising chirp-chime
  stl_hinataHi: { vary: 0.03, max: 1, gap: 0.3, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 880], [0.06, 1318.5], [0.12, 1174.7], [0.2, 1760]], type: 'triangle', a: 0.005, d: 0.24, v: 0.055, vib: [22, 30] });
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => s.bell({ at: 0.06 + i * 0.05, f, d: 0.5, v: 0.04, rev: 0.45 }));
    s.sparkle({ at: 0.2, n: 3, base: 2093, v: 0.022, spread: 0.25 });
  } },
  // Rising Sun: a swelling drone (about 1 s, the filter opening as it climbs) into ...
  stl_rise: { vary: 0.02, max: 1, gap: 0.5, trim: 1.3, fn(s) {
    s.tone({ f: 131, stack: [['triangle', 0, 1], ['sine', 5, 0.6, 1.5], ['sine', -5, 0.45, 2], ['sine', 3, 0.2, 3]], vib: [4.5, 8, 0.3], a: 0.95, h: 0.05, d: 0.18, v: 0.12, lp: 400, lp2: 2600, lt: 1, rev: 0.4 });
    s.tone({ f: 523, f2: 1046, glide: 1, a: 0.9, d: 0.15, v: 0.022 });
    s.noise({ ft: 'lowpass', f: 300, f2: 1500, glide: 1, a: 0.9, d: 0.2, v: 0.07, color: 'brown' });
    s.noise({ ft: 'highpass', f: 3000, f2: 7000, glide: 1, a: 0.9, d: 0.2, v: 0.03, am: [8, 0.4] });
  } },
  // ... a gong-like bright bloom
  stl_riseBurst: { vary: 0.02, max: 1, gap: 0.5, trim: 1.35, duck: [0.7, 1.2], fn(s) {
    s.bell({ f: 131, a: 0.02, d: 1.5, v: 0.12, partials: GONG, lp: 2400, rev: 0.5 });
    s.tone({ pts: [[0, 110], [0.25, 55]], a: 0.004, d: 0.4, v: 0.3 });
    s.noise({ ft: 'lowpass', f: 1200, f2: 300, glide: 0.4, a: 0.006, d: 0.45, v: 0.18, color: 'brown' });
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => s.bell({ at: 0.03 + i * 0.025, f, d: 1.1, v: 0.05, rev: 0.55, pan: (i - 1.5) * 0.2 }));
    s.noise({ at: 0.02, ft: 'highpass', f: 5500, a: 0.06, d: 0.9, v: 0.05, am: [10, 0.5], rev: 0.5 });
    s.sparkle({ at: 0.2, n: 5, base: 2093, spread: 0.5, v: 0.03 });
  } },

  // ---- Morning Light
  // her heals: shrine suzu bells, three gentle shakes over a warm C-and-G breath
  stl_bell: { vary: 0.02, max: 2, gap: 0.15, trim: 1.35, fn(s) {
    for (let k = 0; k < 3; k++) suzu(s, k * 0.12 + R(0, 0.012), 1 - k * 0.22);
    s.tone({ f: 523.25, stack: [['sine', 0, 1], ['sine', 6, 0.45, 1.5]], a: 0.12, h: 0.15, d: 0.5, v: 0.04, rev: 0.45 });
  } },
  // Kind Light: a soft two-note chime (E up to A)
  stl_kind: { vary: 0.02, max: 2, gap: 0.12, trim: 1.35, fn(s) {
    s.bell({ f: 1318.5, d: 0.7, v: 0.055, rev: 0.5 });
    s.bell({ at: 0.14, f: 1760, d: 0.9, v: 0.055, rev: 0.55 });
    s.tone({ f: 659.3, stack: [['sine', 0, 1], ['sine', 5, 0.4, 1.5]], a: 0.06, h: 0.1, d: 0.4, v: 0.03, rev: 0.4 });
  } },
  // a sun shell gained: a thin glassy shimmer
  stl_shell: { vary: 0.04, max: 2, gap: 0.12, trim: 1.3, fn(s) {
    s.noise({ ft: 'highpass', f: 5000, a: 0.08, d: 0.4, v: 0.03, am: [13, 0.55], rev: 0.4 });
    [2093, 2637, 3136].forEach((f, i) => s.bell({ at: 0.03 + i * 0.05, f, d: 0.45, v: 0.025, rev: 0.45, partials: GLASS, pan: (i - 1) * 0.3 }));
    s.tone({ pts: [[0, 1046.5], [0.25, 1568]], a: 0.08, d: 0.25, v: 0.02, vib: [7, 12] });
  } },
  // a shell popping: a soft glassy pop
  stl_shellPop: { vary: 0.06, max: 3, gap: 0.06, trim: 1.3, fn(s) {
    s.tone({ pts: [[0, 500], [0.025, 1500]], a: 0.001, d: 0.035, v: 0.09 });
    s.noise({ f: 3000, q: 1.5, a: 0.001, d: 0.03, v: 0.04 });
    s.bell({ at: 0.012, f: pick([1568, 1760, 2093]), d: 0.3, v: 0.035, rev: 0.4, partials: GLASS });
  } },
  // a halo settling: a soft ring (two sines a few cents apart, so it shimmers like a rubbed glass)
  stl_halo: { vary: 0.03, max: 2, gap: 0.2, trim: 1.3, fn(s) {
    s.tone({ f: 1318.5, stack: [['sine', 0, 1], ['sine', 6, 0.7], ['sine', 0, 0.15, 2]], a: 0.06, h: 0.1, d: 0.8, v: 0.035, rev: 0.55 });
    s.bell({ f: 659.3, d: 0.8, v: 0.03, rev: 0.5 });
    s.noise({ ft: 'highpass', f: 6000, a: 0.1, d: 0.5, v: 0.015, am: [7, 0.5] });
  } },
  // a halo flaring as it breaks: a bright ring and a soft whoomp
  stl_haloFlare: { vary: 0.03, max: 2, gap: 0.15, trim: 1.35, fn(s) {
    s.noise({ ft: 'lowpass', f: 900, f2: 300, glide: 0.25, a: 0.006, d: 0.28, v: 0.2, color: 'brown' });
    s.tone({ pts: [[0, 160], [0.15, 70]], a: 0.004, d: 0.25, v: 0.2 });
    s.bell({ at: 0.01, f: 1568, d: 0.8, v: 0.05, rev: 0.5 }); s.bell({ at: 0.02, f: 2093, d: 0.7, v: 0.04, rev: 0.5 }); s.bell({ at: 0.035, f: 2637, d: 0.6, v: 0.028, rev: 0.5 });
    s.tone({ at: 0.01, f: 1568, stack: [['sine', 0, 1], ['sine', 7, 0.6]], a: 0.01, d: 0.6, v: 0.022, rev: 0.5 });
    s.noise({ ft: 'highpass', f: 5500, a: 0.01, d: 0.4, v: 0.035, am: [12, 0.5], rev: 0.4 });
  } },
  // Daybreak: a short sunrise chord: two soft taiko beats under a warm C chord and rolling bells
  stl_daybreak: { vary: 0.01, max: 1, gap: 1, trim: 1.35, duck: [0.7, 1.4], fn(s) {
    s.tone({ pts: [[0, 92], [0.14, 56]], a: 0.003, d: 0.5, v: 0.34 });
    s.noise({ ft: 'lowpass', f: 600, a: 0.003, d: 0.16, v: 0.16, color: 'brown' });
    s.tone({ at: 0.36, pts: [[0, 104], [0.12, 62]], a: 0.003, d: 0.4, v: 0.22 });
    s.noise({ at: 0.36, ft: 'lowpass', f: 600, a: 0.003, d: 0.14, v: 0.1, color: 'brown' });
    s.tone({ at: 0.05, f: 262, stack: [['sine', 0, 1], ['triangle', 5, 0.35], ['sine', 0, 0.5, 1.5], ['sine', -4, 0.35, 2]], a: 0.35, h: 0.25, d: 0.6, v: 0.07, lp: 1400, rev: 0.5 });
    [523.25, 659.3, 784, 1046.5, 1318.5, 1568].forEach((f, i) => s.bell({ at: 0.1 + i * 0.07, f, d: 1, v: 0.05, rev: 0.55, pan: (i - 2.5) * 0.15 }));
    s.noise({ at: 0.2, ft: 'highpass', f: 5500, a: 0.3, d: 0.6, v: 0.035, am: [10, 0.5], rev: 0.5 });
  } },

  // ---- the gilding (Sunlit)
  // a foe gilded (a Sunlit stack): a tiny high "ting" (quiet, frequent)
  stl_gild: { vary: 0.08, max: 3, gap: 0.05, trim: 1.2, fn(s) {
    s.bell({ f: pick([2093, 2349.3, 2637]), d: 0.25, v: 0.028, rev: 0.35, partials: GLASS });
  } },
  // a full gilding flaring: a brighter "ting-whoomp"
  stl_gildFlare: { vary: 0.04, max: 2, gap: 0.1, trim: 1.3, fn(s) {
    s.bell({ f: 2093, d: 0.5, v: 0.05, rev: 0.45, partials: GLASS }); s.bell({ at: 0.012, f: 2637, d: 0.45, v: 0.035, rev: 0.45, partials: GLASS });
    s.noise({ at: 0.04, ft: 'lowpass', f: 1000, f2: 300, glide: 0.2, a: 0.01, d: 0.24, v: 0.15, color: 'brown' });
    s.tone({ at: 0.04, pts: [[0, 180], [0.14, 80]], a: 0.004, d: 0.2, v: 0.15 });
    s.noise({ ft: 'highpass', f: 5500, a: 0.005, d: 0.25, v: 0.025, am: [13, 0.5] });
  } },

  // ---- Shadow, the zoomies, the scenes
  // Sun Dog on Shadow: a bright shimmer with a happy rising sparkle
  stl_sundog: { vary: 0.03, max: 1, gap: 0.4, trim: 1.3, fn(s) {
    s.noise({ ft: 'highpass', f: 4800, a: 0.06, d: 0.6, v: 0.04, am: [12, 0.5], rev: 0.45 });
    s.tone({ pts: [[0, 523.25], [0.3, 1046.5]], type: 'triangle', a: 0.04, d: 0.35, v: 0.05, vib: [8, 14] });
    [1046.5, 1174.7, 1318.5, 1568, 1760, 2093].forEach((f, i) => s.bell({ at: 0.04 + i * 0.05, f, d: 0.5, v: 0.04 - i * 0.003, rev: 0.45, pan: (i - 2.5) * 0.12 }));
  } },
  // the zoomies: a quick pitter-patter of paws (a gallop's pairs) and a happy yip
  stl_zoomies: { vary: 0.04, max: 1, gap: 0.4, trim: 1.3, fn(s) {
    for (let i = 0; i < 8; i++) {
      const at = Math.floor(i / 2) * 0.1 + (i % 2) * 0.04 + R(0, 0.008);
      s.tone({ at, pts: [[0, R(260, 320)], [0.03, 150]], a: 0.002, d: 0.04, v: 0.07 });
      s.noise({ at, ft: 'lowpass', f: 1400, a: 0.002, d: 0.03, v: 0.05, color: 'pink' });
    }
    s.voice({ at: 0.44, f: [[0, 820], [0.05, 1180], [0.13, 900]], form: [[0, [1250, 2400, 3500]], [0.13, [1050, 2150, 3300]]],
      amp: [[0, 0], [0.015, 1], [0.09, 0.5], [0.14, 0]], q: [6, 8, 9], breath: 0.25, body: 0.35, v: 0.12, rev: 0.35 });
  } },
  // the dawn greeting in her arrival scene: a soft temple bell (a small one, G, a felt-wrapped striker)
  stl_greet: { vary: 0.01, max: 1, gap: 1, trim: 1.8, fn(s) {
    s.noise({ ft: 'lowpass', f: 500, a: 0.003, d: 0.07, v: 0.06, color: 'pink', rev: 0.5 });
    s.bell({ f: 196, a: 0.004, d: 1.6, v: 0.06, lp: 2600, partials: TEMPLE, rev: 0.55 });
    s.tone({ f: 98, a: 0.06, d: 1.1, v: 0.025, rev: 0.5 });
  } },
  // a fatal blow caught (Sun Dog's catch, Hope Springs): a warm swelling chime
  stl_catch: { vary: 0.02, max: 1, gap: 0.5, trim: 1.35, duck: [0.8, 0.8], fn(s) {
    s.tone({ f: 262, stack: [['sine', 0, 1], ['sine', 5, 0.5, 1.5], ['triangle', -4, 0.3, 2]], a: 0.28, h: 0.1, d: 0.6, v: 0.08, lp: 900, lp2: 2200, lt: 0.3, rev: 0.5 });
    s.noise({ ft: 'highpass', f: 4500, f2: 6500, glide: 0.3, a: 0.28, d: 0.4, v: 0.03, am: [9, 0.5], rev: 0.4 });
    [784, 1046.5, 1318.5, 1568].forEach((f, i) => s.bell({ at: 0.24 + i * 0.04, f, d: 1, v: 0.05, rev: 0.55, pan: (i - 1.5) * 0.18 }));
  } },
};
