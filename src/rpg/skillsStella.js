// Stella the Sun Oracle's skill trees (docs/STELLA.md §3): the same Diablo-2 framework as skills.js and the other heroes'
// files: rows 0-5 gated by ROW_REQ, prerequisites, hard-point synergies (inside each tree), r5 ultimates. skills.js merges
// STELLA_SKILLS into SKILLS (ids must not clash) and STELLA_TREES into TREES; stats.js calls stellaPassives().
//
// Units as in skills.js: metres, m/s, seconds, dmgPct = % of her rolled wagasa damage with synergies ALREADY folded in.
// Her damage: the sun wagasa scales with Energy (+1% per point, classes.js dmgStat) and so does every tree. Her fire is
// sunlight: the game's fire element (stats.js ELEMENTS), drawn gold and white (gfx/stellaFx.js); her burns are "sunburn",
// the game's fire damage over time (monster status 'burn').
//  - Radiance (`ray`): rays that pierce lines, a glint, a prism, a focused solar ray, the Sundial; its passive Sunlit gilds
//    foes (stacks: they take more of her fire, and a full gilding flares);
//  - Corona (`flare`): bursts, a skipping sun disc, a sunspot on the ground, Hinata the little sun, the Rising Sun; its
//    passive Sunburn burns a little with every hit and makes sunburnt foes softer for the Corona;
//  - Dawn (`dawn`): the support tree. Heals and shields are a SHARE OF THE TARGET'S OWN LIFE (healPct / absorbPct), × her
//    healing / shield bonus (derived.healMul / shieldMul: Sunny Disposition), so a heal is worth the same on any ally (her,
//    Shadow, Hinata; co-op heroes later: docs/MULTIPLAYER.md). Overheal becomes a sun shell (the class trait: classes.js
//    `sun`). Its damage parts (Kind Light's fallback ray, Halo's flare) take the Dawn mastery.
// Masteries add a per-tree bonus (derived.treeDmgPct.ray / .flare / .dawn). No `this` is used below, so the defs also work
// when destructured (they are bound here and again by skills.js).

export const STELLA_TREES = [
  { id: 'ray', cls: 'stella', name: 'Radiance', sub: 'Sun Wagasa', color: '#fff3c8', accent: '#c88a1a', desc: 'Rays of golden light that pierce whole lines, a glint, a prism, a focused solar ray and the Sundial. Energy makes them shine brighter.' },
  { id: 'flare', cls: 'stella', name: 'Corona', sub: 'Any weapon', color: '#ffe2d2', accent: '#d0603a', desc: 'Flares of sunlight, a skipping sun disc, a sunspot, Hinata the little sun and the Rising Sun. Energy makes them burn brighter.' },
  { id: 'dawn', cls: 'stella', name: 'Dawn', sub: 'Support', color: '#ffe4e0', accent: '#c8687a', desc: 'The warmth of morning: heals and halos for her and Shadow, a sun dog, and the break of day. Heals and shields are a share of the target\'s own life.' },
];

const ROW_REQ = [1, 6, 12, 18, 24, 30]; // (same gates as skills.js)
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const pct = v => Math.round(v) + '%';
const dim = (lvl, max, half) => (lvl <= 0 ? 0 : (max * lvl) / (lvl + half));
const lin = (a, b) => l => a + b * (l - 1);
const syn = (id, d) => (d && d.synergy && d.synergy[id]) || 1;
/** per-tree mastery multiplier (Inner Light / Sun-Kissed / Sunny Disposition) */
const tree = (t, d) => 1 + ((d && d.treeDmgPct && d.treeDmgPct[t]) || 0) / 100;
const Ra = (id, d) => syn(id, d) * tree('ray', d);
const Co = (id, d) => syn(id, d) * tree('flare', d);
const Dw = (id, d) => syn(id, d) * tree('dawn', d);
/** heals and shields: the synergy and her healing / shield bonus (derived.healMul / shieldMul) */
const H = (id, d) => syn(id, d) * ((d && d.healMul) || 1);
const SH = (id, d) => syn(id, d) * ((d && d.shieldMul) || 1);
/** sunburn durations: Sun-Kissed stretches them (derived.burnDur, %) */
const bdur = (s, d) => r1(s * (1 + ((d && d.burnDur) || 0) / 100));
function dmgRange(pctV, d) {
  if (!d || d.dmgMin == null) return '';
  const a = Math.max(1, Math.round((d.dmgMin * pctV) / 100)), b = Math.max(a, Math.round((d.dmgMax * pctV) / 100));
  return ` (${a}–${b})`;
}
function synLine(id, d) { const m = syn(id, d); return m > 1.001 ? [`Synergy bonus: +${Math.round((m - 1) * 100)}%`] : []; }
function mastLine(t, d) { const v = d && d.treeDmgPct && d.treeDmgPct[t]; return v > 0 ? [`Mastery bonus: +${Math.round(v)}%`] : []; }
function healLine(d) { const m = (d && d.healMul) || 1; return m > 1.005 ? [`Healing bonus: +${Math.round((m - 1) * 100)}%`] : []; }
function shieldLine(d) { const m = (d && d.shieldMul) || 1; return m > 1.005 ? [`Shield bonus: +${Math.round((m - 1) * 100)}%`] : []; }
const cut = (def, l, d) => { const c = def.cost(l), k = d && d.treeCostCut && d.treeCostCut[def.tree]; return k ? r1(c * (1 - k / 100)) : c; };
const costLine = (def, l, d, per = '') => `Zoom cost: ${cut(def, l, d)}${per}${def.cd(l) ? ` · Cooldown: ${def.cd(l)}s` : ''}`;
const lifeOf = (d, p) => (d && d.lifeMax ? ` (${Math.round(d.lifeMax * p / 100)} for you)` : '');

const DEFS = {
  // =================================================================== RADIANCE (rays: lines, a cone, a fan, a channel)
  goldenRay: {
    tree: 'ray', name: 'Golden Ray', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(3.2 + 0.12 * (l - 1)), cd: () => 0,
    desc: 'She points the wagasa\'s sun-disc finial and a ray of golden light lances out through every foe in its line.',
    syn: [{ id: 'innerLight', p: 3 }, { id: 'prism', p: 4 }],
    params(l, d) { return { dmgPct: lin(82, 7)(l) * Ra('goldenRay', d), length: 10, width: 0.35, gild: 1 }; },
    info(l, d) {
      const p = DEFS.goldenRay.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire to every foe in a ${p.length} m line`, 'Gilds each foe it hits (Sunlit)', costLine(DEFS.goldenRay, l, d), ...synLine('goldenRay', d), ...mastLine('ray', d)];
    },
  },
  innerLight: {
    tree: 'ray', name: 'Inner Light', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'fire',
    cost: () => 0, cd: () => 0,
    desc: 'The sun rises inside her a little earlier every morning. Passive — Radiance hits harder and crits more.',
    syn: [],
    params(l) { return { dmgPct: 18 + 5.5 * (l - 1), crit: r1(1.5 + 0.4 * (l - 1)) }; }, // (gentler than the others' masteries: her rays pierce whole lines)
    info(l) { const p = DEFS.innerLight.params(l); return [`+${p.dmgPct}% Radiance damage`, `+${p.crit}% critical chance`]; },
  },
  glint: {
    tree: 'ray', name: 'Glint', row: 1, col: 2, pre: ['goldenRay'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: l => r1(Math.max(1.5, 3 - 0.06 * l)),
    desc: 'The finial catches the sun like a mirror and flashes it into the foes\' eyes. Dazzled foes miss their swings.',
    syn: [{ id: 'goldenRay', p: 4 }, { id: 'sunlit', p: 3 }],
    params(l, d) { return { dmgPct: lin(60, 6.5)(l) * Ra('glint', d), arc: 70, range: 6, dazzle: r2(1.5 + 0.03 * l), miss: 35, gild: 1 }; },
    info(l, d) {
      const p = DEFS.glint.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire in a ${p.arc}° cone ${p.range} m long`, `Dazzled for ${p.dazzle}s: they miss ${p.miss}% of their attacks`, costLine(DEFS.glint, l, d), ...synLine('glint', d), ...mastLine('ray', d)];
    },
  },
  prism: {
    tree: 'ray', name: 'Prism', row: 2, col: 1, pre: ['goldenRay'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(5 + 0.28 * (l - 1)), cd: () => 0,
    desc: 'She lifts a little sun-glass to the light and the ray splits into a fan, each part piercing on through the crowd.',
    syn: [{ id: 'goldenRay', p: 4 }, { id: 'solarRay', p: 3 }],
    params(l, d) { return { count: Math.min(7, 3 + Math.floor(l / 5)), spread: Math.min(70, 40 + 1.5 * l), dmgPct: lin(58, 6)(l) * Ra('prism', d), length: 9, width: 0.3, gild: 1 }; },
    info(l, d) {
      const p = DEFS.prism.params(l, d);
      return [`Rays: ${p.count} in a ${Math.round(p.spread)}° fan, ${p.length} m, each piercing`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire`, costLine(DEFS.prism, l, d), ...synLine('prism', d), ...mastLine('ray', d)];
    },
  },
  sunlit: {
    tree: 'ray', name: 'Sunlit', row: 3, col: 0, pre: ['innerLight'], wep: null, kind: 'passive', element: 'fire',
    cost: () => 0, cd: () => 0,
    desc: 'Her light gilds what it touches, and gilded foes burn easily. Passive — each Sunlit stack makes a foe take more of her fire; a full gilding flares on her next hit.',
    syn: [],
    params(l, d) { return { per: r1(4 + dim(l, 6, 10)), stacks: 3, dur: 6, flarePct: lin(60, 7)(l) * tree('ray', d), flareR: 1.8, every: 2 }; },
    info(l, d) {
      const p = DEFS.sunlit.params(l, d);
      return [`Each Sunlit stack (up to ${p.stacks}, ${p.dur}s): +${p.per}% fire damage taken from you and your little sun`, `A full gilding flares on your next fire hit: ${pct(p.flarePct)}${dmgRange(p.flarePct, d)} in ${p.flareR} m`];
    },
  },
  solarRay: {
    tree: 'ray', name: 'Solar Ray', row: 4, col: 2, pre: ['prism'], wep: null, kind: 'channel', element: 'fire',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: () => 0,
    desc: 'A focused solar ray, like sunlight through a burning glass: a thin white-gold beam from the finial to her target that grows hotter the longer it holds. She can walk slowly while she holds it.',
    syn: [{ id: 'goldenRay', p: 4 }, { id: 'innerLight', p: 3 }],
    params(l, d) { return { dmgPct: lin(120, 12)(l) * Ra('solarRay', d), tick: 0.25, ramp: 25, rampMax: 2, range: 12, width: 0.25, walk: 0.5, gild: 1 }; },
    info(l, d) {
      const p = DEFS.solarRay.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire a second to your target (and the first foe in the way)`, `+${p.ramp}% a second while it holds, ×${p.rampMax} at most · ${p.range} m`, costLine(DEFS.solarRay, l, d, ' per second'), ...synLine('solarRay', d), ...mastLine('ray', d)];
    },
  },
  sundial: {
    tree: 'ray', name: 'Sundial', row: 5, col: 1, pre: ['prism', 'solarRay'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(32 + 1 * (l - 1)), cd: () => 10,
    desc: 'She plants the wagasa like a sundial\'s gnomon and the hours go round: twelve columns of sunlight fall round her in a clockwise sweep, and everything they touch is gilded through.',
    syn: [{ id: 'goldenRay', p: 4 }, { id: 'sunlit', p: 3 }],
    params(l, d) { return { count: 12, duration: 2.4, rMin: 3, rMax: 5, radius: 1.5, dmgPct: lin(160, 17)(l) * Ra('sundial', d), gild: 3 }; },
    info(l, d) {
      const p = DEFS.sundial.params(l, d);
      return [`Columns: ${p.count} over ${p.duration}s, ${p.rMin}–${p.rMax} m round you`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire in ${p.radius} m · gilds to full`, costLine(DEFS.sundial, l, d), ...synLine('sundial', d), ...mastLine('ray', d)];
    },
  },

  // =================================================================== CORONA (bursts, a disc, a spot, a little sun)
  solarFlare: {
    tree: 'flare', name: 'Solar Flare', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(4 + 0.12 * (l - 1)), cd: () => 0,
    desc: 'A flare of sunlight bursts on the spot: a white core and a ring of soft rays, and everything in it is a little sunburnt.',
    syn: [{ id: 'sunKissed', p: 3 }, { id: 'sunspot', p: 4 }],
    params(l, d) { const m = Co('solarFlare', d); return { dmgPct: lin(120, 5)(l) * m, radius: r2(2.1 + 0.03 * l), burnPct: lin(20, 0.85)(l) * m, burnDur: bdur(2, d), range: 12 }; },
    info(l, d) {
      const p = DEFS.solarFlare.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire in ${p.radius} m`, `Sunburn: ${pct(p.burnPct)} fire a second for ${p.burnDur}s`, costLine(DEFS.solarFlare, l, d), ...synLine('solarFlare', d), ...mastLine('flare', d)];
    },
  },
  sunKissed: {
    tree: 'flare', name: 'Sun-Kissed', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'fire',
    cost: () => 0, cd: () => 0,
    desc: 'The sun kissed her nose when she was a puppy, and it never really stopped. Passive — the Corona hits harder and its sunburns last longer.',
    syn: [],
    params(l) { return { dmgPct: Math.round(18 + 5.5 * (l - 1)), burn: Math.round(dim(l, 60, 10)) }; }, // (gentler than the others' masteries: her flares are wide)
    info(l) { const p = DEFS.sunKissed.params(l); return [`+${p.dmgPct}% Corona damage`, `Sunburns last ${p.burn}% longer`]; },
  },
  skippingSun: {
    tree: 'flare', name: 'Skipping Sun', row: 1, col: 2, pre: ['solarFlare'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: () => 0,
    desc: 'A golden sun disc, skimmed low and side-on like a stone across the sea at dawn. It skips along the ground and flares at every skip.',
    syn: [{ id: 'solarFlare', p: 4 }, { id: 'littleSun', p: 3 }],
    params(l, d) { return { skips: Math.min(6, 3 + Math.floor(l / 5)), gap: 2, length: 12, radius: 1.3, speed: 14, dmgPct: lin(55, 6)(l) * Co('skippingSun', d) }; },
    info(l, d) {
      const p = DEFS.skippingSun.params(l, d);
      return [`Skips: ${p.skips} along a ${p.length} m line, ~${p.gap} m apart`, `Damage at each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire in ${p.radius} m`, costLine(DEFS.skippingSun, l, d), ...synLine('skippingSun', d), ...mastLine('flare', d)];
    },
  },
  sunspot: {
    tree: 'flare', name: 'Sunspot', row: 2, col: 1, pre: ['solarFlare'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(9 + 0.4 * (l - 1)), cd: () => 1.5,
    desc: 'A spot of fierce sunlight lands on the ground and stays. Everything standing in it is sunburnt.',
    syn: [{ id: 'solarFlare', p: 4 }, { id: 'risingSun', p: 3 }],
    params(l, d) { return { radius: r2(2.4 + 0.03 * l), duration: 5, tick: 0.5, dmgPct: lin(26, 3)(l) * Co('sunspot', d), burnDur: bdur(1.5, d), max: 1 + Math.floor(l / 10), range: 12 }; },
    info(l, d) {
      const p = DEFS.sunspot.params(l, d);
      return [`${p.radius} m for ${p.duration}s · up to ${p.max} at once`, `Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire every ${p.tick}s, sunburnt`, costLine(DEFS.sunspot, l, d), ...synLine('sunspot', d), ...mastLine('flare', d)];
    },
  },
  sunburn: {
    tree: 'flare', name: 'Sunburn', row: 3, col: 0, pre: ['sunKissed'], wep: null, kind: 'passive', element: 'fire',
    cost: () => 0, cd: () => 0,
    desc: 'Nobody stands in the sun next to her for long without getting a little pink. Passive — every hit of her fire sunburns, and sunburnt foes take more from the Corona.',
    syn: [],
    params(l) { return { pct: Math.round(20 + dim(l, 30, 10)), dur: 3, take: Math.round(8 + dim(l, 17, 10)) }; },
    info(l) { const p = DEFS.sunburn.params(l); return [`Every hit of your fire sunburns: ${p.pct}% of it over ${p.dur}s`, `Sunburnt foes take +${p.take}% from the Corona`]; },
  },
  littleSun: {
    tree: 'flare', name: 'Little Sun', row: 4, col: 2, pre: ['skippingSun'], wep: null, kind: 'summon', element: 'fire',
    cost: l => r1(16 + 0.6 * (l - 1)), cd: () => 2,
    desc: 'Hinata, a cheerful little sun with a smile, floats at her shoulder, pinging sunbolts at anything rude and warming the pack every few seconds.',
    syn: [{ id: 'sunKissed', p: 3 }, { id: 'risingSun', p: 4 }],
    params(l, d) { return { duration: 30 + l, every: 0.9, dmgPct: lin(48, 5.5)(l) * Co('littleSun', d), range: 9, healPct: r1(1 * ((d && d.healMul) || 1)), healEvery: 3, healR: 4, lifePct: 40 + 3 * l, burnDur: bdur(1.5, d), count: 1 }; },
    info(l, d) {
      const p = DEFS.littleSun.params(l, d);
      return [`Hinata stays ${p.duration}s · life ${p.lifePct}% of yours`, `A sunbolt every ${p.every}s: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire, sunburns (${p.range} m)`, `Every ${p.healEvery}s the pack within ${p.healR} m mends ${p.healPct}% life`, costLine(DEFS.littleSun, l, d), ...synLine('littleSun', d), ...mastLine('flare', d)];
    },
  },
  risingSun: {
    tree: 'flare', name: 'Rising Sun', row: 5, col: 1, pre: ['sunspot', 'littleSun'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(34 + 1 * (l - 1)), cd: () => 9,
    desc: 'A great sun rises out of the ground on the spot, swells for a breath, then bursts in a crown of rays that throws everything back, sunburnt.',
    syn: [{ id: 'solarFlare', p: 5 }, { id: 'sunspot', p: 4 }],
    params(l, d) { const m = Co('risingSun', d); return { dmgPct: lin(320, 34)(l) * m, radius: r2(3.5 + 0.04 * l), knockback: 1.4, burnPct: lin(40, 4)(l) * m, burnDur: bdur(4, d), range: 12, rise: 1 }; },
    info(l, d) {
      const p = DEFS.risingSun.params(l, d);
      return [`Burst: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire in ${p.radius} m after ${p.rise}s · knockback`, `Sunburn: ${pct(p.burnPct)} a second for ${p.burnDur}s`, costLine(DEFS.risingSun, l, d), ...synLine('risingSun', d), ...mastLine('flare', d)];
    },
  },

  // =================================================================== DAWN (the support: heals, halos, a sun dog, the break of day)
  morningLight: {
    tree: 'dawn', name: 'Morning Light', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(8 + 0.4 * (l - 1)), cd: l => r2(Math.max(2, 3 - 0.05 * l)),
    desc: 'She lifts the wagasa and the first light of morning washes over the pack: she, Shadow and Hinata mend. Healing past full becomes a sun shell.',
    syn: [{ id: 'sunnyDisposition', p: 3 }, { id: 'halo', p: 3 }],
    params(l, d) { return { healPct: r1(lin(12, 0.8)(l) * H('morningLight', d)), now: 0.4, over: 2, radius: 6 }; },
    info(l, d) {
      const p = DEFS.morningLight.params(l, d);
      return [`Heals ${p.healPct}% of each ally's life${lifeOf(d, p.healPct)}: ${Math.round(p.now * 100)}% at once, the rest over ${p.over}s`, `You, Shadow and Hinata within ${p.radius} m · overheal: a sun shell`, costLine(DEFS.morningLight, l, d), ...synLine('morningLight', d), ...healLine(d)];
    },
  },
  sunnyDisposition: {
    tree: 'dawn', name: 'Sunny Disposition', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'fire',
    cost: () => 0, cd: () => 0,
    desc: 'It is very hard to stay grumpy around her. Passive — your heals and shields are stronger, the Dawn hits harder and your zoom comes back faster.',
    syn: [],
    params(l) { return { heal: 20 + 7 * (l - 1), dmgPct: 20 + 7 * (l - 1), regen: Math.round(5 + dim(l, 25, 10)) }; },
    info(l) { const p = DEFS.sunnyDisposition.params(l); return [`+${p.heal}% healing and shielding`, `+${p.dmgPct}% Dawn damage`, `+${p.regen}% zoom regeneration`]; },
  },
  kindLight: {
    tree: 'dawn', name: 'Kind Light', row: 1, col: 2, pre: ['morningLight'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(4 + 0.2 * (l - 1)), cd: () => 0,
    desc: 'A soft ray of sunlight finds whoever needs it most and mends them. If nobody does, it finds a foe who deserves it instead, as a Golden Ray.',
    syn: [{ id: 'sunnyDisposition', p: 3 }, { id: 'daybreak', p: 4 }],
    params(l, d) { return { healPct: r1(lin(16, 1.1)(l) * H('kindLight', d)), rayPct: lin(75, 7.5)(l) * Dw('kindLight', d), length: 10, width: 0.35, range: 12, full: 90, gild: 1 }; },
    info(l, d) {
      const p = DEFS.kindLight.params(l, d);
      return [`Heals the ally who needs it most: ${p.healPct}% of their life${lifeOf(d, p.healPct)} (overheal: a sun shell)`, `With every ally over ${p.full}%: a ray at your target instead, ${pct(p.rayPct)}${dmgRange(p.rayPct, d)} fire down a ${p.length} m line`, costLine(DEFS.kindLight, l, d), ...synLine('kindLight', d), ...healLine(d)];
    },
  },
  halo: {
    tree: 'dawn', name: 'Halo', row: 2, col: 1, pre: ['morningLight'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: () => 1,
    desc: 'A ring of golden light settles over an ally like a halo and soaks the blows aimed at them. When it gives way, it flares.',
    syn: [{ id: 'sunnyDisposition', p: 3 }, { id: 'sunDog', p: 3 }],
    params(l, d) { return { absorbPct: r1((12 + 1.1 * l) * SH('halo', d)), duration: 8, flarePct: lin(100, 10)(l) * Dw('halo', d), radius: 2.2, burnDur: bdur(1.5, d), range: 12 }; },
    info(l, d) {
      const p = DEFS.halo.params(l, d);
      return [`Absorbs ${p.absorbPct}% of the ally's life${lifeOf(d, p.absorbPct)} for ${p.duration}s`, `When it breaks or ends it flares: ${pct(p.flarePct)}${dmgRange(p.flarePct, d)} fire in ${p.radius} m`, costLine(DEFS.halo, l, d), ...synLine('halo', d), ...shieldLine(d)];
    },
  },
  stlZoomies: {
    tree: 'dawn', name: 'Zoomies!', row: 3, col: 0, pre: ['sunnyDisposition'], wep: null, kind: 'passive', element: 'fire',
    cost: () => 0, cd: () => 0,
    desc: 'A rescue gives her the zoomies. Passive — heals on an ally under 35% life land harder, and then she bounds about at full speed for a moment, very hard to hit.',
    syn: [],
    params(l) { return { low: 35, heal: Math.round(25 + dim(l, 50, 10)), speed: 35, dodge: Math.round(15 + dim(l, 20, 10)), dur: 2.5, every: r1(Math.max(5, 10 - 0.25 * l)) }; },
    info(l) { const p = DEFS.stlZoomies.params(l); return [`Heals on an ally under ${p.low}% life: +${p.heal}%`, `Then the zoomies: +${p.speed}% speed and +${p.dodge}% dodge for ${p.dur}s (once every ${p.every}s)`]; },
  },
  sunDog: {
    tree: 'dawn', name: 'Sun Dog', row: 4, col: 2, pre: ['kindLight'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(12 + 0.5 * (l - 1)), cd: l => r1(Math.max(10, 20 - 0.4 * l)),
    desc: 'Shadow becomes a sun dog, like the bright halo spots that sit beside the sun: he glows, his bites sear, and while it lasts the blow that would knock him out is caught. On a fainted Shadow, he wakes at once.',
    syn: [],
    params(l, d) { return { duration: 12, dmgBuff: Math.round(25 + dim(l, 35, 10)), searPct: lin(30, 3)(l) * Dw('sunDog', d), catchPct: 30, wakePct: 50 }; },
    info(l, d) {
      const p = DEFS.sunDog.params(l, d);
      return [`Shadow for ${p.duration}s: +${p.dmgBuff}% damage, his bites sear for ${pct(p.searPct)}${dmgRange(p.searPct, d)} fire`, `The blow that would knock him out: he holds at 1 and mends ${p.catchPct}% instead (once)`, `On a fainted Shadow: he wakes at once at ${p.wakePct}%`, costLine(DEFS.sunDog, l, d)];
    },
  },
  daybreak: {
    tree: 'dawn', name: 'Daybreak', row: 5, col: 1, pre: ['halo', 'sunDog'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(30 + 1 * (l - 1)), cd: () => 30,
    desc: 'Dawn breaks over the pack: everyone mends, their sun shells fill, slows and curses lift, and for a while the whole pack is braver and quicker while the foes squint.',
    syn: [{ id: 'morningLight', p: 4 }, { id: 'kindLight', p: 3 }],
    params(l, d) { return { radius: 7, healPct: r1(25 * H('daybreak', d)), duration: 8, dmgBuff: Math.round(20 + dim(l, 20, 10)), speed: 10, miss: 25 }; },
    info(l, d) {
      const p = DEFS.daybreak.params(l, d);
      return [`The pack within ${p.radius} m mends ${p.healPct}%, their shells fill, slows and curses lift`, `For ${p.duration}s: +${p.dmgBuff}% damage and +${p.speed}% speed · foes in it miss ${p.miss}%`, costLine(DEFS.daybreak, l, d), ...synLine('daybreak', d), ...healLine(d)];
    },
  },
};

/** Skills whose real cast isn't built yet: greyed in the K panel ("In training"), can't be learned (skills.js canLearn)
 *  or cast (usable). Empty: all 21 are built (docs/STELLA.md §3). */
export const STELLA_TRAINING = new Set();

for (const id in DEFS) {
  const d = DEFS[id];
  for (const k of ['info', 'params', 'cost', 'cd']) { const fn = d[k]; d[k] = (...a) => fn.apply(d, a); }
  d.id = id; d.cls = 'stella'; d.req = ROW_REQ[d.row]; d.pre = d.pre || []; d.syn = d.syn || [];
  Object.defineProperty(d, 'training', { get: () => STELLA_TRAINING.has(id), enumerable: true });
}

/** Skill definitions. Format: see skills.js DEFS. */
export const STELLA_SKILLS = DEFS;
/** the rays that gild (Sunlit) and the skills whose heals land on allies (the `ally` aim: combat/autoTarget.js) */
export const STELLA_RAYS = new Set(['goldenRay', 'glint', 'prism', 'solarRay', 'sundial', 'kindLight']);

/**
 * Passive / mastery effects for her trees, applied at the end of computeStats() (after the life, zoom, crit and the
 * weapon damage are known). d = derived (mutable), L = id => effective skill level, CL = her class (classes.js).
 * Sets: d.treeDmgPct = {ray, flare, dawn}, d.crit (Inner Light), d.burnDur (%: Sun-Kissed), d.healMul / d.shieldMul
 * (Sunny Disposition), d.zoomRegen (Sunny Disposition), d.sunlit ({ per, stacks, dur, flarePct, flareR, every } | null),
 * d.sunburn ({ pct, dur, take } | null), d.zoomies (Zoomies! | null), d.sunTrait (the class trait: { shell, shellT,
 * shadowRevive }), d.shadowRevive (s).
 */
export function stellaPassives(d, L, CL) {
  const lv = id => (L && L(id)) || 0;
  d.treeDmgPct = { ray: 0, flare: 0, dawn: 0 };
  d.burnDur = 0; d.healMul = 1; d.shieldMul = 1;
  d.sunlit = null; d.sunburn = null; d.zoomies = null;
  const sun = (CL && CL.sun) || { shell: 20, shellT: 8, shadowRevive: 6 };
  d.sunTrait = { ...sun };
  d.shadowRevive = sun.shadowRevive ?? 10;
  if (lv('innerLight') > 0) {
    const p = DEFS.innerLight.params(lv('innerLight'));
    d.treeDmgPct.ray += p.dmgPct; d.crit = r1(Math.min(75, (d.crit || 0) + p.crit));
  }
  if (lv('sunlit') > 0) d.sunlit = DEFS.sunlit.params(lv('sunlit'), d);
  if (lv('sunKissed') > 0) {
    const p = DEFS.sunKissed.params(lv('sunKissed'));
    d.treeDmgPct.flare += p.dmgPct; d.burnDur += p.burn;
  }
  if (lv('sunburn') > 0) d.sunburn = DEFS.sunburn.params(lv('sunburn'));
  if (lv('sunnyDisposition') > 0) {
    const p = DEFS.sunnyDisposition.params(lv('sunnyDisposition'));
    d.healMul = r2(1 + p.heal / 100); d.shieldMul = r2(1 + p.heal / 100); d.treeDmgPct.dawn += p.dmgPct;
    d.zoomRegen = r2((d.zoomRegen || 0) * (1 + p.regen / 100));
  }
  if (lv('stlZoomies') > 0) d.zoomies = DEFS.stlZoomies.params(lv('stlZoomies'));
}
