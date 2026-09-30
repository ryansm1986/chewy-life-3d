// Region ambient voices (docs/REGIONS.md): the sounds of the four regions' worlds. Owned by the audio agent.
// Each voice is written once and used twice:
//  - by the region ambiences (src/audio/ambience.js): seeded randomness, placed at a distance, into the ambience reverb;
//  - as sfx (the env_* entries below, sfx.js format), for a prop or critter that makes the sound where it stands, e.g.
//    Events.emit('sfx', 'env_shishi_odoshi', { pos }) on the frame bambooProps.shishiCycle() reports its clack.
// A voice is fn(s, r, o): s = a core.js Voice, r(a, b) = a random number in [a, b), o = { v: level, pan, rev, ... }.
// Pure data: no imports (the audio chunk must not pull in model / game code). Levels are calibrated with the offline
// render check (?test=audio) against splash / chest_open / waypoint.
const R = (a, b) => a + Math.random() * (b - a);

export const AMB = {
  // Shishi-odoshi, the bamboo water clapper: water spills from the tipped tube (o.spill), then it swings back and its
  // end strikes the stone: a hollow "KOK" (the tube's mouth with a closed tube's odd harmonic) over the stone's low
  // knock, a tick of wood, and the tube ringing on for a moment.
  shishiOdoshi(s, r, { v = 1, pan = 0, rev = 0.5, spill = true } = {}) {
    let at = 0;
    if (spill) {
      s.noise({ f: r(1100, 1500), q: 1.3, a: 0.05, h: 0.12, d: 0.25, v: 0.07 * v, pan, rev });
      for (let i = 0; i < 3; i++) { const g = r(900, 1700); s.tone({ at: r(0.05, 0.32), pts: [[0, g], [0.02, g * 1.6]], a: 0.001, d: 0.05, v: 0.025 * v, pan, rev }); }
      at = r(0.55, 0.7);
    }
    const f = r(880, 1020);
    s.tone({ at, pts: [[0, f * 1.08], [0.015, f]], a: 0.001, d: 0.24, v: 0.2 * v, pan, rev });
    s.tone({ at, f: f * 3.01, a: 0.001, d: 0.05, v: 0.035 * v, pan, rev });
    s.tone({ at, pts: [[0, 330], [0.04, 245]], type: 'triangle', a: 0.001, d: 0.1, v: 0.13 * v, pan, rev });
    s.noise({ at, f: 2800, q: 2, a: 0.001, d: 0.014, v: 0.16 * v, pan, rev });
    s.tone({ at: at + r(0.16, 0.2), pts: [[0, f * 1.05], [0.012, f]], a: 0.001, d: 0.08, v: 0.035 * v, pan, rev }); // a small bounce
  },
  // A temple bell far off (bonsho): the log striker's thud, beating partial pairs and a long low hum. o.d = ring length.
  templeBell(s, r, { v = 1, pan = 0, rev = 0.8, d = 6, lp = 1600 } = {}) {
    const f = r(96, 116);
    s.noise({ ft: 'lowpass', f: 420, a: 0.003, d: 0.08, v: 0.08 * v, color: 'pink', pan, rev });
    s.bell({ f, d, v: 0.06 * v, lp, partials: [[1, 1, 1], [1.004, 0.8, 1], [2.01, 0.55, 0.6], [2.72, 0.45, 0.45], [2.735, 0.3, 0.45], [4.1, 0.16, 0.25], [5.4, 0.08, 0.15]], pan, rev });
    s.tone({ f: f * 0.5, a: 0.06, d: d * 0.7, v: 0.03 * v, pan, rev });
  },
  // A gull: 2-4 nasal "kyow"s, each a quick scoop up and a long fall (a saw through a nasal band, a rough edge), the
  // last one longest.
  gull(s, r, { v = 1, pan = 0, rev = 0.4 } = {}) {
    const k = r(0.85, 1.18), n = 2 + ((r(0, 1) * 3) | 0);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const len = r(0.2, 0.34) * (i === n - 1 ? 1.45 : 1), vv = v * (0.8 + 0.2 * (i % 2));
      s.tone({ at, pts: [[0, 1050 * k], [0.045, 1720 * k], [len, 960 * k]], type: 'sawtooth', a: 0.012, h: len * 0.35, d: len * 0.6, v: 0.15 * vv, bp: 2300 * k, bq: 2.2, ffix: true, am: [38, 0.25], pan, rev });
      s.tone({ at, pts: [[0, 2100 * k], [0.045, 3440 * k], [len, 1920 * k]], a: 0.012, h: len * 0.3, d: len * 0.5, v: 0.035 * vv, pan, rev });
      at += len + r(0.06, 0.16);
    }
  },
  // A wave: the swell rising (brown noise opening up), the break (a broad pink burst) and the foam fizzing back.
  wave(s, r, { v = 1, pan = 0, rev = 0.3 } = {}) {
    const len = r(1.4, 2.3), crest = len * 0.55;
    s.noise({ ft: 'lowpass', pts: [[0, 200], [crest, r(900, 1300)], [len, 320]], q: 0.7, a: crest, h: 0.1, d: len - crest + 0.6, lin: true, v: 0.3 * v, color: 'brown', pan, rev });
    s.noise({ at: crest - 0.05, f: r(1700, 2500), q: 0.6, a: 0.05, d: 0.9, v: 0.09 * v, color: 'pink', pan, rev });
    s.noise({ at: crest + 0.2, ft: 'highpass', f: 3400, a: 0.3, h: 0.3, d: r(1.1, 1.8), lin: true, v: 0.03 * v, lp: 9000, pan, rev });
  },
  // A crow: 2-4 hoarse "kaa"s (a rough saw through open-vowel formants, sagging in pitch).
  crow(s, r, { v = 1, pan = 0, rev = 0.5 } = {}) {
    const k = r(0.88, 1.12), n = 2 + ((r(0, 1) * 3) | 0);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const len = r(0.2, 0.3);
      s.voice({ at, f: [[0, 520 * k], [0.04, 610 * k], [len, 460 * k]], form: [[0, [950, 1500, 2700]], [len, [800, 1300, 2500]]],
        amp: [[0, 0], [0.02, 1], [len * 0.6, 0.8], [len, 0]], q: [5, 6, 8], breath: 0.5, rough: 0.55, roughF: 65, v: 0.17 * v, pan, rev });
      at += len + r(0.12, 0.28);
    }
  },
  // A sika deer calling in autumn: a thin whistle that rises, breaks and falls away ("pyuu-i").
  deer(s, r, { v = 1, pan = 0, rev = 0.7 } = {}) {
    const f = r(1500, 1900);
    s.tone({ pts: [[0, f * 0.8], [0.25, f * 1.12], [0.7, f], [1.0, f * 0.7]], stack: [['sine', 0, 1], ['triangle', 5, 0.25]], a: 0.08, h: 0.5, d: 0.42, lin: true, v: 0.045 * v, vib: [7, 25, 0.2], pan, rev });
    s.noise({ f: f * 1.1, q: 5, a: 0.1, h: 0.4, d: 0.4, lin: true, v: 0.06 * v, pan, rev });
  },
  // Snow sliding off a laden branch: a powdery hiss and a soft "fwump" as it lands.
  snowfall(s, r, { v = 1, pan = 0, rev = 0.4 } = {}) {
    s.noise({ f: r(1300, 2000), q: 0.8, a: 0.06, h: 0.1, d: 0.35, v: 0.11 * v, color: 'pink', pan, rev });
    s.noise({ at: 0.16, ft: 'lowpass', f: r(420, 600), a: 0.01, d: 0.22, v: 0.36 * v, color: 'pink', pan, rev });
  },
  // A hot spring's bubble: a round, low "blup" rising as it breaks the surface.
  blup(s, r, { v = 1, pan = 0, rev = 0.2, at = 0 } = {}) {
    const f = r(130, 280);
    s.tone({ at, pts: [[0, f], [r(0.04, 0.08), f * r(1.8, 2.6)]], a: 0.004, d: r(0.06, 0.1), v: 0.09 * v, lp: 1500, pan, rev });
  },
};

// The same voices as one-shot sfx (merged into the sfx table by ./index.js). Distances and panning come from the
// caller's pos; the reverb sends are drier than the ambience's far-off versions.
export const SFX = {
  env_shishi_odoshi: { vary: 0.03, max: 1, gap: 0.5, trim: 1.6, fn(s) { AMB.shishiOdoshi(s, R, { spill: false, rev: 0.35 }); } },
  env_temple_bell: { vary: 0.02, max: 1, gap: 2, trim: 3.0, fn(s) { AMB.templeBell(s, R, { rev: 0.5, d: 2.6, lp: 2600 }); } },
  env_gull: { vary: 0.06, max: 2, gap: 0.4, trim: 2.2, fn(s) { AMB.gull(s, R, { rev: 0.25 }); } },
  env_wave: { vary: 0.05, max: 2, gap: 0.8, trim: 2.0, fn(s) { AMB.wave(s, R, { rev: 0.2 }); } },
  env_crow: { vary: 0.05, max: 2, gap: 0.4, trim: 1.2, fn(s) { AMB.crow(s, R, { rev: 0.3 }); } },
  env_deer: { vary: 0.04, max: 1, gap: 1, trim: 1.4, fn(s) { AMB.deer(s, R, { rev: 0.4 }); } },
  env_snowfall: { vary: 0.08, max: 2, gap: 0.3, trim: 3.2, fn(s) { AMB.snowfall(s, R, { rev: 0.25 }); } },
};
