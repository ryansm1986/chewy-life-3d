// The Golden Retriever dragoon's skill trees (docs/GOLDEN.md): the same Diablo-2 framework as skills.js / skillsMoka.js /
// skillsPoe.js / skillsShihtzu.js: rows 0-5 gated by ROW_REQ, prerequisites, hard-point synergies (inside each tree), r5
// ultimates. skills.js merges GOLDEN_SKILLS into SKILLS (ids must not clash) and GOLDEN_TREES into TREES; stats.js calls
// goldenPassives().
//
// Units as in skills.js: metres, m/s, seconds, dmgPct = % of his rolled lance damage with synergies ALREADY folded in.
// His damage stats (stats.js + goldenPassives):
//  - the toy lance scales with Strength (+1% per point, classes.js dmgStat): Lance Arts and his reach combo;
//  - the Javelins swap Strength's share for Dexterity's: every javelin multiplies by derived.javMul =
//    (100 + %dmg + Dexterity) / (100 + %dmg + Strength), like Poe's jutsuMul;
//  - the Whelp Bond (Shadow the dragon whelp's ember breath, swoops and roar) swaps it for Energy's: derived.whelpMul;
//  - A Knight's Vow, Keen Nose and Best Friends add a per-tree bonus (derived.treeDmgPct.lance / .javelin / .whelp);
//  - ember damage is the game's fire element (stats.js ELEMENTS): ember breath and the Emberleaf Javelin burn (a fire
//    damage over time on the foe, combat/goldenSkills.js burns).
// The pet hero: Shadow fights beside him as a little dragon whelp (actors/whelp.js) and the class's own bond makes him
// sturdier and fiercer (classes.js `shadow`, %: derived.shadowLife / shadowDmg), Best Friends and Warm Heart more so.
// No `this` is used below, so the defs also work when destructured (they are bound here and again by skills.js).

export const GOLDEN_TREES = [
  { id: 'lance', cls: 'golden', name: 'Lance Arts', sub: 'Toy Lance', color: '#dff2e6', accent: '#2f8a5c', desc: 'Long-reach thrusts, a sweeping pinwheel, a gallant charge and the dragoon\'s Jump. Strength makes them hit harder.' },
  { id: 'javelin', cls: 'golden', name: 'Javelins', sub: 'Any weapon', color: '#f8ecd2', accent: '#b8862e', desc: 'Toy javelins from the quiver on his back: quick tosses, volleys, ember darts and a sunshower. Dexterity makes them hit harder.' },
  { id: 'whelp', cls: 'golden', name: 'Whelp Bond', sub: 'Shadow, a dragon whelp', color: '#fde6d6', accent: '#d8603a', desc: 'Shadow the dragon whelp: ember breath, swoops, a wing shield and a very small, very mighty roar. Energy makes them hit harder.' },
];

const ROW_REQ = [1, 6, 12, 18, 24, 30]; // (same gates as skills.js)
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const pct = v => Math.round(v) + '%';
const dim = (lvl, max, half) => (lvl <= 0 ? 0 : (max * lvl) / (lvl + half));
const lin = (a, b) => l => a + b * (l - 1);
const syn = (id, d) => (d && d.synergy && d.synergy[id]) || 1;
/** per-tree mastery multiplier (A Knight's Vow / Keen Nose / Best Friends) */
const tree = (t, d) => 1 + ((d && d.treeDmgPct && d.treeDmgPct[t]) || 0) / 100;
const jmul = d => (d && d.javMul) || 1;   // Dexterity instead of Strength (see the header)
const wmul = d => (d && d.whelpMul) || 1; // Energy instead of Strength
const Lm = (id, d) => syn(id, d) * tree('lance', d);
const J = (id, d) => syn(id, d) * tree('javelin', d) * jmul(d);
const W = (id, d) => syn(id, d) * tree('whelp', d) * wmul(d);
/** burn durations: Warm Heart stretches the whelp's embers (derived.burnDur, %) */
const bdur = (s, d) => r1(s * (1 + ((d && d.burnDur) || 0) / 100));
function dmgRange(pctV, d) {
  if (!d || d.dmgMin == null) return '';
  const a = Math.max(1, Math.round((d.dmgMin * pctV) / 100)), b = Math.max(a, Math.round((d.dmgMax * pctV) / 100));
  return ` (${a}–${b})`;
}
function synLine(id, d) { const m = syn(id, d); return m > 1.001 ? [`Synergy bonus: +${Math.round((m - 1) * 100)}%`] : []; }
function mastLine(t, d) { const v = d && d.treeDmgPct && d.treeDmgPct[t]; return v > 0 ? [`Mastery bonus: +${Math.round(v)}%`] : []; }
function dexLine(d) { const m = jmul(d); return Math.abs(m - 1) > 0.005 ? [`Dexterity instead of Strength: ×${r2(m)}`] : []; }
function eneLine(d) { const m = wmul(d); return Math.abs(m - 1) > 0.005 ? [`Energy instead of Strength: ×${r2(m)}`] : []; }
const cut = (def, l, d) => { const c = def.cost(l), k = d && d.treeCostCut && d.treeCostCut[def.tree]; return k ? r1(c * (1 - k / 100)) : c; };
const costLine = (def, l, d, per = '') => `Zoom cost: ${cut(def, l, d)}${per}${def.cd(l) ? ` · Cooldown: ${def.cd(l)}s` : ''}`;
const SHADOW_LINE = 'Shadow must be awake (not knocked out)';

const DEFS = {
  // =================================================================== LANCE ARTS (Strength; long reach, narrow and deep)
  sunbeamThrust: {
    tree: 'lance', name: 'Sunbeam Thrust', row: 0, col: 1, pre: [], wep: 'lance', kind: 'active', element: 'phys',
    cost: l => r1(3.5 + 0.17 * (l - 1)), cd: () => 0,
    desc: 'Both paws on the lance, one big earnest step, and a lunge with his whole heart behind it. The thrust flashes down a long line like a sunbeam and pokes everything along it.',
    syn: [{ id: 'knightsVow', p: 2 }, { id: 'pinwheelSweep', p: 3 }],
    params(l, d) {
      return { dmgPct: lin(155, 16)(l) * Lm('sunbeamThrust', d), length: r2(3.8 + 0.04 * l), width: 0.6, knockback: 0.6 };
    },
    info(l, d) {
      const p = DEFS.sunbeamThrust.params(l, d);
      return [`Damage: ${pct(p.dmgPct)} weapon damage${dmgRange(p.dmgPct, d)}`, `Pierces everything in a line ${p.length} m long`, costLine(DEFS.sunbeamThrust, l, d), ...synLine('sunbeamThrust', d), ...mastLine('lance', d)];
    },
  },
  knightsVow: {
    tree: 'lance', name: "A Knight's Vow", row: 1, col: 0, pre: [], wep: 'lance', kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'He promised to guard the pack with his whole heart. Very solemnly. With a tail wag. Passive — Lance Arts and your lance pokes hit harder and crit more.',
    syn: [],
    params(l) { return { dmgPct: 25 + 9 * (l - 1), crit: r1(1.5 + 0.4 * (l - 1)) }; },
    info(l) { const p = DEFS.knightsVow.params(l); return [`+${p.dmgPct}% Lance Arts and lance attack damage`, `+${p.crit}% critical chance`]; },
  },
  sunfallJump: {
    tree: 'lance', name: 'Sunfall Jump', row: 1, col: 2, pre: ['sunbeamThrust'], wep: 'lance', kind: 'active', element: 'phys',
    cost: l => r1(9 + 0.45 * (l - 1)), cd: l => r1(Math.max(1.5, 4 - 0.1 * l)),
    desc: 'The dragoon\'s Jump! He leaps so high he\'s a speck against the sun, hangs there for one happy moment, then dives lance-first onto the spot. The landing shakes the ground and stuns everything round it.',
    syn: [{ id: 'sunbeamThrust', p: 5 }, { id: 'starfallLance', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(200, 22)(l) * Lm('sunfallJump', d), radius: r2(2.4 + 0.04 * l), leap: 7, stun: r2(0.5 + 0.03 * l), knockback: 1.2 };
    },
    info(l, d) {
      const p = DEFS.sunfallJump.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, `Leaps up to ${p.leap} m · stun ${p.stun}s`, 'Untouchable in the air', costLine(DEFS.sunfallJump, l, d), ...synLine('sunfallJump', d), ...mastLine('lance', d)];
    },
  },
  pinwheelSweep: {
    tree: 'lance', name: 'Pinwheel Sweep', row: 2, col: 1, pre: ['sunbeamThrust'], wep: 'lance', kind: 'active', element: 'phys',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: () => 0,
    desc: 'Plant a paw and swing the lance all the way round at full reach, like a big happy pinwheel. Everything in the circle gets bonked and sent tumbling.',
    syn: [{ id: 'sunbeamThrust', p: 4 }, { id: 'gallantCharge', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(120, 13)(l) * Lm('pinwheelSweep', d), radius: r2(2.9 + 0.03 * l), arc: 360, knockback: 1.1 };
    },
    info(l, d) {
      const p = DEFS.pinwheelSweep.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} all round you, reach ${p.radius} m`, 'Knocks foes back', costLine(DEFS.pinwheelSweep, l, d), ...synLine('pinwheelSweep', d), ...mastLine('lance', d)];
    },
  },
  steadyPaws: {
    tree: 'lance', name: 'Steady Paws', row: 3, col: 0, pre: ['knightsVow'], wep: 'lance', kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'A good guard braces. When a foe runs at him, he plants the pommel and lowers the point, and very often it runs right onto the lance. Passive — a chance to impale a foe that hits you up close, and more defense.',
    syn: [],
    params(l, d) { return { chance: Math.round(15 + dim(l, 25, 10)), dmgPct: lin(120, 14)(l) * tree('lance', d), every: 0.6, defPct: 15 + 6 * (l - 1) }; },
    info(l, d) {
      const p = DEFS.steadyPaws.params(l, d);
      return [`${p.chance}% chance to impale a foe that hits you up close: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `+${p.defPct}% defense`];
    },
  },
  gallantCharge: {
    tree: 'lance', name: 'Gallant Charge', row: 4, col: 2, pre: ['sunfallJump'], wep: 'lance', kind: 'active', element: 'phys',
    cost: l => r1(10 + 0.4 * (l - 1)), cd: l => r1(Math.max(1.5, 4 - 0.1 * l)),
    desc: 'Lance levelled, ears streaming, he charges straight down the line at full gallop. Everything in the way is poked and flung aside, and nothing can touch him until he skids to a stop.',
    syn: [{ id: 'sunfallJump', p: 5 }, { id: 'pinwheelSweep', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(160, 17)(l) * Lm('gallantCharge', d), distance: r1(6 + 0.15 * l), width: 1.2, speed: 16, knockback: 1.4 };
    },
    info(l, d) {
      const p = DEFS.gallantCharge.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} to everything in the path`, `Charges ${p.distance} m · untouchable while charging`, costLine(DEFS.gallantCharge, l, d), ...synLine('gallantCharge', d), ...mastLine('lance', d)];
    },
  },
  starfallLance: {
    tree: 'lance', name: 'Starfall Lance', row: 5, col: 1, pre: ['pinwheelSweep', 'gallantCharge'], wep: 'lance', kind: 'active', element: 'phys',
    cost: l => r1(32 + 1 * (l - 1)), cd: () => 8,
    desc: 'He throws his lance as high as he possibly can. It comes back down as a falling star wreathed in embers and leaves, and the crash scatters everything. Then he catches it on the bounce. Good boy.',
    syn: [{ id: 'sunfallJump', p: 5 }, { id: 'knightsVow', p: 3 }],
    params(l, d) {
      return { dmgPct: lin(320, 34)(l) * Lm('starfallLance', d), radius: r2(3.2 + 0.04 * l), stun: 1, burnPct: lin(30, 3)(l) * Lm('starfallLance', d), burnDur: 4, delay: 0.9, range: 12 };
    },
    info(l, d) {
      const p = DEFS.starfallLance.params(l, d);
      return [`Impact: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m · stun ${p.stun}s`, `Then embers: ${pct(p.burnPct)} fire per second for ${p.burnDur}s`, costLine(DEFS.starfallLance, l, d), ...synLine('starfallLance', d), ...mastLine('lance', d)];
    },
  },

  // =================================================================== JAVELINS (Dexterity; toy javelins from the quiver)
  bonkDart: {
    tree: 'javelin', name: 'Bonk Dart', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(2.5 + 0.13 * (l - 1)), cd: () => 0,
    desc: 'A toy javelin from the quiver, tossed in a cheerful arc. The gold rubber tip lands with a very satisfying bonk, and whoever stands beside the target gets a little bonk too.',
    syn: [{ id: 'keenNose', p: 3 }, { id: 'tailwagVolley', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(140, 15)(l) * J('bonkDart', d), splash: 50, splashRadius: 1.3, speed: 19, range: 13 };
    },
    info(l, d) {
      const p = DEFS.bonkDart.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Bonks foes within ${p.splashRadius} m of it for ${p.splash}%`, costLine(DEFS.bonkDart, l, d), ...synLine('bonkDart', d), ...mastLine('javelin', d), ...dexLine(d)];
    },
  },
  keenNose: {
    tree: 'javelin', name: 'Keen Nose', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'He can smell a yokai at fifty paces, and a biscuit at a hundred. Passive — javelins hit harder and crit more.',
    syn: [],
    params(l) { return { dmgPct: 25 + 9 * (l - 1), crit: r1(1.5 + 0.4 * (l - 1)) }; },
    info(l) { const p = DEFS.keenNose.params(l); return [`+${p.dmgPct}% Javelins damage`, `+${p.crit}% critical chance`]; },
  },
  tailwagVolley: {
    tree: 'javelin', name: 'Tailwag Volley', row: 1, col: 2, pre: ['bonkDart'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(4.2 + 0.33 * (l - 1)), cd: () => 0,
    desc: 'A whole pawful of javelins at once, fanned out as wide as a happy wag. Nobody in front of him is left out.',
    syn: [{ id: 'bonkDart', p: 3 }, { id: 'sunshower', p: 4 }],
    params(l, d) {
      return { count: Math.min(9, 3 + Math.floor(l / 3)), spread: Math.min(80, 40 + 2 * l), dmgPct: lin(96, 9)(l) * J('tailwagVolley', d), speed: 19, range: 12 };
    },
    info(l, d) {
      const p = DEFS.tailwagVolley.params(l, d);
      return [`Javelins: ${p.count} in a ${p.spread}° fan`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, costLine(DEFS.tailwagVolley, l, d), ...synLine('tailwagVolley', d), ...mastLine('javelin', d), ...dexLine(d)];
    },
  },
  trueFlight: {
    tree: 'javelin', name: 'True Flight', row: 2, col: 1, pre: ['bonkDart'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(8 + 0.4 * (l - 1)), cd: () => 0,
    desc: 'One long, honest throw, as straight as he is. It flies flat and fast and bonks straight through every foe in the line.',
    syn: [{ id: 'bonkDart', p: 5 }, { id: 'emberleafJavelin', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(150, 16)(l) * J('trueFlight', d), range: r1(15 + 0.1 * l), speed: 30, width: 0.55 };
    },
    info(l, d) {
      const p = DEFS.trueFlight.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} to every foe in a ${p.range} m line`, costLine(DEFS.trueFlight, l, d), ...synLine('trueFlight', d), ...mastLine('javelin', d), ...dexLine(d)];
    },
  },
  goodRetriever: {
    tree: 'javelin', name: 'Good Retriever', row: 3, col: 0, pre: ['keenNose'], wep: null, kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'He always brings it back. A javelin that lands sticks where it fell for a while; trot over it to scoop it up for a burst of zoom and pep. And a foe with a javelin stuck in it is marked: your lance finds it easily.',
    syn: [],
    params(l) { return { stick: 5, zoom: r1(2 + 0.2 * l), aspd: 15, aspdDur: 3, markPct: Math.round(10 + dim(l, 20, 10)), markDur: 4 }; },
    info(l) {
      const p = DEFS.goodRetriever.params(l);
      return [`Landed javelins stay ${p.stick}s · scoop one up: +${p.zoom} zoom and +${p.aspd}% attack speed for ${p.aspdDur}s`, `Marked foes take +${p.markPct}% damage from your lance (${p.markDur}s)`];
    },
  },
  emberleafJavelin: {
    tree: 'javelin', name: 'Emberleaf Javelin', row: 4, col: 2, pre: ['tailwagVolley'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(12 + 0.5 * (l - 1)), cd: () => 1,
    desc: 'A javelin wrapped in warm emberleaf. It sticks in the first foe it meets, glows brighter and brighter, then bursts in a shower of embers and leaves that sets everyone near it smouldering.',
    syn: [{ id: 'tailwagVolley', p: 4 }, { id: 'trueFlight', p: 4 }],
    params(l, d) {
      const m = J('emberleafJavelin', d);
      return { dmgPct: lin(220, 24)(l) * m, radius: r2(2.2 + 0.04 * l), fuse: 1.2, burnPct: lin(28, 3)(l) * m, burnDur: bdur(3, d), speed: 18, range: 12 };
    },
    info(l, d) {
      const p = DEFS.emberleafJavelin.params(l, d);
      return [`Burst: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire in ${p.radius} m after ${p.fuse}s`, `Smoulder: ${pct(p.burnPct)} fire per second for ${p.burnDur}s`, costLine(DEFS.emberleafJavelin, l, d), ...synLine('emberleafJavelin', d), ...mastLine('javelin', d), ...dexLine(d)];
    },
  },
  sunshower: {
    tree: 'javelin', name: 'Sunshower', row: 5, col: 1, pre: ['trueFlight', 'emberleafJavelin'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(30 + 1 * (l - 1)), cd: () => 8,
    desc: 'He empties the whole quiver straight up into the sky. A moment later it rains javelins on the spot, glittering in the sun like a sunshower. (The quiver is somehow full again afterwards. Nobody asks.)',
    syn: [{ id: 'tailwagVolley', p: 5 }, { id: 'bonkDart', p: 3 }],
    params(l, d) {
      return { count: 14 + l, duration: 2, radius: r2(3.5 + 0.05 * l), impactRadius: 1.0, dmgPct: lin(110, 12)(l) * J('sunshower', d), range: 14 };
    },
    info(l, d) {
      const p = DEFS.sunshower.params(l, d);
      return [`Javelins: ${p.count} over ${p.duration}s in ${p.radius} m`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, costLine(DEFS.sunshower, l, d), ...synLine('sunshower', d), ...mastLine('javelin', d), ...dexLine(d)];
    },
  },

  // =================================================================== WHELP BOND (Energy; Shadow the dragon whelp)
  emberBreath: {
    tree: 'whelp', name: 'Ember Breath', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(5 + 0.25 * (l - 1)), cd: () => 0.6,
    desc: '"Shadow, breathe!" Shadow flutters to your side, takes a big breath and puffs a cone of warm embers at the foes. It\'s more of a hiccup than a roar, but they smoulder all the same.',
    syn: [{ id: 'bestFriends', p: 3 }, { id: 'divebombSwoop', p: 4 }],
    params(l, d) {
      const m = W('emberBreath', d);
      return { dmgPct: lin(44, 2.8)(l) * m, ticks: 3, range: r1(4 + 0.05 * l), arc: 50, burnPct: lin(18, 1.3)(l) * m, burnDur: bdur(3, d) };
    },
    info(l, d) {
      const p = DEFS.emberBreath.params(l, d);
      return [`Breath: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire, ${p.ticks} times, in a ${p.arc}° cone ${p.range} m long`, `Smoulder: ${pct(p.burnPct)} fire per second for ${p.burnDur}s`, SHADOW_LINE, costLine(DEFS.emberBreath, l, d), ...synLine('emberBreath', d), ...mastLine('whelp', d), ...eneLine(d)];
    },
  },
  bestFriends: {
    tree: 'whelp', name: 'Best Friends', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'fire',
    cost: () => 0, cd: () => 0,
    desc: 'A dragoon and his dragon. Or a retriever and his Boston terrier in a dragon costume. Either way: best friends. Passive — the Whelp Bond hits harder, and Shadow is tougher and fiercer.',
    syn: [],
    params(l) { return { dmgPct: 25 + 8 * (l - 1), shadowLife: 20 + 6 * (l - 1), shadowDmg: 15 + 5 * (l - 1) }; },
    info(l) { const p = DEFS.bestFriends.params(l); return [`+${p.dmgPct}% Whelp Bond damage`, `Shadow: +${p.shadowLife}% life and +${p.shadowDmg}% damage`]; },
  },
  divebombSwoop: {
    tree: 'whelp', name: 'Divebomb Swoop', row: 1, col: 2, pre: ['emberBreath'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(8 + 0.4 * (l - 1)), cd: l => r1(Math.max(1.5, 3.5 - 0.08 * l)),
    desc: '"Swoop, Shadow!" Shadow climbs as high as his little wings allow, tucks them in, and divebombs the spot in a splash of embers.',
    syn: [{ id: 'emberBreath', p: 5 }, { id: 'mightyRoar', p: 3 }],
    params(l, d) {
      const m = W('divebombSwoop', d);
      return { dmgPct: lin(170, 18)(l) * m, radius: r2(1.8 + 0.03 * l), knockback: 0.8, burnPct: lin(20, 2.2)(l) * m, burnDur: bdur(3, d), range: 11 };
    },
    info(l, d) {
      const p = DEFS.divebombSwoop.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} fire in ${p.radius} m`, `Sets them smouldering (${pct(p.burnPct)} per second, ${p.burnDur}s)`, SHADOW_LINE, costLine(DEFS.divebombSwoop, l, d), ...synLine('divebombSwoop', d), ...mastLine('whelp', d), ...eneLine(d)];
    },
  },
  wingShield: {
    tree: 'whelp', name: 'Wing Shield', row: 2, col: 1, pre: ['emberBreath'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(12 + 0.5 * (l - 1)), cd: () => 8,
    desc: 'Shadow hovers in front of you and spreads his wings as wide as they go. Blows and spit are caught on the felt; when the shield gives way, one big flap blows the foes back.',
    syn: [{ id: 'bestFriends', p: 4 }, { id: 'warmHeart', p: 3 }],
    params(l, d) {
      return { absorbPct: r1(14 + 1.3 * l), duration: 6, gustPct: lin(80, 9)(l) * W('wingShield', d), gustRadius: 2.5, knockback: 1.6 };
    },
    info(l, d) {
      const p = DEFS.wingShield.params(l, d);
      const life = d && d.lifeMax ? ` (${Math.round(d.lifeMax * p.absorbPct / 100)})` : '';
      return [`Absorbs ${p.absorbPct}% of your life${life} in damage for ${p.duration}s`, `Then a gust: ${pct(p.gustPct)}${dmgRange(p.gustPct, d)} in ${p.gustRadius} m`, SHADOW_LINE, costLine(DEFS.wingShield, l, d), ...synLine('wingShield', d), ...mastLine('whelp', d), ...eneLine(d)];
    },
  },
  warmHeart: {
    tree: 'whelp', name: 'Warm Heart', row: 3, col: 0, pre: ['bestFriends'], wep: null, kind: 'passive', element: 'fire',
    cost: () => 0, cd: () => 0,
    desc: 'There\'s a little ember in Shadow that never goes out. Passive — Shadow mends faster and is back on his paws sooner, his embers smoulder longer, and the Whelp Bond costs less.',
    syn: [],
    params(l) { return { revive: r1(Math.max(3, 10 - dim(l, 7, 8))), regen: r1(1 + dim(l, 3, 10)), burn: Math.round(dim(l, 60, 10)), costCut: Math.round(dim(l, 25, 8)) }; },
    info(l) { const p = DEFS.warmHeart.params(l); return [`Shadow wakes up after ${p.revive}s (10s untrained) and mends ${p.regen}% life per second`, `Embers smoulder ${p.burn}% longer`, `Whelp Bond costs ${p.costCut}% less zoom`]; },
  },
  mightyRoar: {
    tree: 'whelp', name: 'Mighty Little Roar', row: 4, col: 2, pre: ['divebombSwoop'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(14 + 0.6 * (l - 1)), cd: () => 12,
    desc: 'Shadow puffs out his chest and roars. It comes out as a squeak. Nobody laughs: the whole pack feels braver, and the foes nearby flinch anyway.',
    syn: [],
    params(l) { return { duration: 8, dmgBuff: Math.round(15 + dim(l, 35, 10)), aspd: 15, radius: 6, flinch: 0.4 }; },
    info(l) { const p = DEFS.mightyRoar.params(l); return [`The pack: +${p.dmgBuff}% damage and +${p.aspd}% attack speed for ${p.duration}s`, `Foes within ${p.radius} m flinch`, SHADOW_LINE, `Zoom cost: ${DEFS.mightyRoar.cost(l)} · Cooldown: ${DEFS.mightyRoar.cd(l)}s`]; },
  },
  dragonHeart: {
    tree: 'whelp', name: 'Dragon Heart', row: 5, col: 1, pre: ['wingShield', 'mightyRoar'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(35 + 1 * (l - 1)), cd: () => 25,
    desc: 'For a few seconds Shadow\'s heart is as big as a real dragon\'s, and so is the rest of him. He grows huge, sweeps ember breath over the crowd and stomps about very proudly. Then, poof, he\'s small again and wants a nap.',
    syn: [{ id: 'emberBreath', p: 5 }, { id: 'bestFriends', p: 4 }],
    params(l, d) {
      const m = W('dragonHeart', d);
      return { duration: r1(10 + 0.2 * l), scale: 2.4, dmgPct: lin(150, 16)(l) * m, every: 1, radius: 2.8, burnPct: lin(25, 2.5)(l) * m, burnDur: bdur(3, d), heartLife: 100 };
    },
    info(l, d) {
      const p = DEFS.dragonHeart.params(l, d);
      return [`Shadow grows for ${p.duration}s, with +${p.heartLife}% life (and heals fully)`, `Ember sweeps every ${p.every}s: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m, smouldering`, 'Nearby foes go for him instead of you', SHADOW_LINE, costLine(DEFS.dragonHeart, l, d), ...synLine('dragonHeart', d), ...mastLine('whelp', d), ...eneLine(d)];
    },
  },
};

/** Skills whose real cast isn't built yet: greyed in the K panel ("In training"), can't be learned (skills.js canLearn)
 *  or cast (usable). Empty since checkpoint 2: all 21 are built (docs/GOLDEN.md §3). */
export const GOLDEN_TRAINING = new Set();

for (const id in DEFS) {
  const d = DEFS[id];
  for (const k of ['info', 'params', 'cost', 'cd']) { const fn = d[k]; d[k] = (...a) => fn.apply(d, a); }
  d.id = id; d.cls = 'golden'; d.req = ROW_REQ[d.row]; d.pre = d.pre || []; d.syn = d.syn || [];
  Object.defineProperty(d, 'training', { get: () => GOLDEN_TRAINING.has(id), enumerable: true });
}

/** Skill definitions. Format: see skills.js DEFS. */
export const GOLDEN_SKILLS = DEFS;
/** the Whelp Bond's actives drive Shadow: they wait while he's knocked out (combat/goldenWhelp.js gldWhelpBlocked) */
export const WHELP_ACTIVES = new Set(['emberBreath', 'divebombSwoop', 'wingShield', 'mightyRoar', 'dragonHeart']);

/**
 * Passive / mastery effects for the dragoon's trees, applied at the end of computeStats() (after the life, zoom, crit and
 * the weapon damage are known). d = derived (mutable), L = id => effective skill level, CL = his class (classes.js).
 * Sets: d.treeDmgPct = {lance, javelin, whelp}, d.treeCostCut = {whelp}, d.javMul (Dexterity for the javelins), d.whelpMul
 * (Energy for the whelp), d.crit, d.def (Steady Paws), d.brace (Steady Paws' impale: {chance, dmgPct, every} | null),
 * d.retrieve (Good Retriever | null), d.shadowLife / d.shadowDmg (the class's bond, Best Friends), d.shadowRevive /
 * d.shadowRegen (Warm Heart), d.burnDur (%).
 */
export function goldenPassives(d, L, CL) {
  const lv = id => (L && L(id)) || 0;
  d.treeDmgPct = { lance: 0, javelin: 0, whelp: 0 };
  d.treeCostCut = { whelp: 0 };
  const base = Math.max(1, 100 + (d.dmgPct || 0) + (d.statDmgPct || 0));
  d.javMul = r2((100 + (d.dmgPct || 0) + (d.dex || 0)) / base);
  d.whelpMul = r2((100 + (d.dmgPct || 0) + (d.ene || 0)) / base);
  d.burnDur = 0; d.brace = null; d.retrieve = null; d.shadowRevive = 10; d.shadowRegen = 1;
  // the bond: Shadow fights at his best beside the dragoon (classes.js `shadow`, %)
  const sb = (CL && CL.shadow) || 0;
  d.shadowLife = (d.shadowLife || 0) + sb; d.shadowDmg = (d.shadowDmg || 0) + sb;
  if (lv('knightsVow') > 0) {
    const p = DEFS.knightsVow.params(lv('knightsVow'));
    d.treeDmgPct.lance += p.dmgPct;
    d.crit = r1(Math.min(75, (d.crit || 0) + p.crit));
  }
  if (lv('steadyPaws') > 0) {
    const p = DEFS.steadyPaws.params(lv('steadyPaws'), d);
    d.def = Math.round((d.def || 0) * (1 + p.defPct / 100));
    d.brace = { chance: p.chance, dmgPct: p.dmgPct, every: p.every };
  }
  if (lv('keenNose') > 0) {
    const p = DEFS.keenNose.params(lv('keenNose'));
    d.treeDmgPct.javelin += p.dmgPct; d.crit = r1(Math.min(75, (d.crit || 0) + p.crit));
  }
  if (lv('goodRetriever') > 0) d.retrieve = DEFS.goodRetriever.params(lv('goodRetriever'));
  if (lv('bestFriends') > 0) {
    const p = DEFS.bestFriends.params(lv('bestFriends'));
    d.treeDmgPct.whelp += p.dmgPct; d.shadowLife += p.shadowLife; d.shadowDmg += p.shadowDmg;
  }
  if (lv('warmHeart') > 0) {
    const p = DEFS.warmHeart.params(lv('warmHeart'));
    d.shadowRevive = p.revive; d.shadowRegen = p.regen; d.burnDur += p.burn; d.treeCostCut.whelp = p.costCut;
  }
}
