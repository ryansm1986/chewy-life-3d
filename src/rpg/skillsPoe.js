// Poe's skill trees (the black pug ninja, docs/POE.md) — the same Diablo-2 framework as skills.js / skillsMoka.js: rows
// 0-5 gated by ROW_REQ, prerequisites, hard-point synergies (inside each tree), r5 ultimates.
// skills.js merges POE_SKILLS into SKILLS (ids must not clash) and POE_TREES into TREES; stats.js calls poePassives().
//
// Units as in skills.js: metres, m/s, seconds, dmgPct = % of her rolled fūma damage with synergies ALREADY folded in.
// Her damage stats (stats.js + poePassives):
//  - the fūma scales with Dexterity (+1% per point, classes.js dmgStat) — Shuriken Arts, Shadow Step and her slashes;
//  - Ninjutsu swaps Dexterity's share for Energy's: every jutsu multiplies by derived.jutsuMul
//    = (100 + %dmg + Energy) / (100 + %dmg + Dexterity), so an Energy build casts big jutsu and a Dex build throws hard;
//  - Shuriken Mastery and Ninjutsu Mastery add a per-tree bonus (derived.treeDmgPct.shuriken / .jutsu, like Moka's);
//    Ninjutsu Mastery also cuts jutsu zoom costs (derived.treeCostCut.jutsu, read by skills.js skillRuntime / usable);
//  - Shadow Step has no damage mastery: it hits through crits (Shadow Step's backstab, Vanish's double crit, the
//    Barrage's bonus) and Swift as Wind keeps her alive (move speed + dodge: derived.dodge, rolled in combat.js).
// Fragile but evasive: a smaller life pool than Chewy (classes.js), a class dodge of 5%, smoke that blinds (monsters
// miss), Vanish / Smoke Bomb that make monsters lose her, and blinks with brief invulnerability.
// No `this` is used below, so the defs also work when destructured (they are bound here and again by skills.js).

export const POE_TREES = [
  { id: 'shuriken', cls: 'poe', name: 'Shuriken Arts', sub: 'Fūma', color: '#f6ecd0', accent: '#d8b040', desc: 'The giant bone fūma, kunai and star-storms. Dexterity makes them hit harder.' },
  { id: 'jutsu', cls: 'poe', name: 'Ninjutsu', sub: 'Any weapon', color: '#e8e2f2', accent: '#7a6aa8', desc: 'Hand seals: smoke, clones, fire and lightning. Energy makes them hit harder.' },
  { id: 'shadow', cls: 'poe', name: 'Shadow Step', sub: 'Any weapon', color: '#dfe8d8', accent: '#3d6038', desc: 'Blinks, dashes, invisibility and crits from behind. Very stealthy. Mostly.' },
];

const ROW_REQ = [1, 6, 12, 18, 24, 30]; // (same gates as skills.js)
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const pct = v => Math.round(v) + '%';
const dim = (lvl, max, half) => (lvl <= 0 ? 0 : (max * lvl) / (lvl + half));
const lin = (a, b) => l => a + b * (l - 1);
const syn = (id, d) => (d && d.synergy && d.synergy[id]) || 1;
/** per-tree mastery multiplier (Shuriken Mastery / Ninjutsu Mastery) */
const tree = (t, d) => 1 + ((d && d.treeDmgPct && d.treeDmgPct[t]) || 0) / 100;
/** Ninjutsu: Energy instead of Dexterity (see the header) */
const jmul = d => (d && d.jutsuMul) || 1;
const S = (id, d) => syn(id, d) * tree('shuriken', d);
const J = (id, d) => syn(id, d) * tree('jutsu', d) * jmul(d);
function dmgRange(pctV, d) {
  if (!d || d.dmgMin == null) return '';
  const a = Math.max(1, Math.round((d.dmgMin * pctV) / 100)), b = Math.max(a, Math.round((d.dmgMax * pctV) / 100));
  return ` (${a}–${b})`;
}
function synLine(id, d) { const m = syn(id, d); return m > 1.001 ? [`Synergy bonus: +${Math.round((m - 1) * 100)}%`] : []; }
function mastLine(t, d) { const v = d && d.treeDmgPct && d.treeDmgPct[t]; return v > 0 ? [`Mastery bonus: +${Math.round(v)}%`] : []; }
function enerLine(d) { const m = jmul(d); return Math.abs(m - 1) > 0.005 ? [`Energy instead of Dexterity: ×${r2(m)}`] : []; }
const cut = (def, l, d) => { const c = def.cost(l), k = d && d.treeCostCut && d.treeCostCut[def.tree]; return k ? r1(c * (1 - k / 100)) : c; };
const costLine = (def, l, d) => `Zoom cost: ${cut(def, l, d)}${def.cd(l) ? ` · Cooldown: ${def.cd(l)}s` : ''}`;

const DEFS = {
  // =================================================================== SHURIKEN ARTS
  fumaThrow: {
    tree: 'shuriken', name: 'Fūma Throw', row: 0, col: 1, pre: [], wep: 'fuma', kind: 'active', element: 'phys',
    cost: l => r1(3 + 0.15 * (l - 1)), cd: () => 0,
    desc: 'Unfold the giant bone fūma and fling it. It whirls out, swings round and comes home again — slicing everything on the way out AND on the way back. Catching it is the tricky part.',
    syn: [{ id: 'kunaiFan', p: 5 }, { id: 'whirlingFuma', p: 4 }],
    params(l, d) {
      // (speed grows with range, so a throw's round trip stays ~0.95 s at every level: tools/hero-balance.mjs)
      return { dmgPct: lin(75, 13)(l) * S('fumaThrow', d), range: r1(6.5 + 0.12 * l), speed: r1(19 * (6.5 + 0.12 * l) / 6.62), radius: 0.62, curve: 0.55, knockback: 0.35, backPct: 100 };
    },
    info(l, d) {
      const p = DEFS.fumaThrow.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} per pass`, `Flies ${p.range} m out and back: hits on the way out AND back`, 'Passes through every foe', costLine(DEFS.fumaThrow, l, d), ...synLine('fumaThrow', d), ...mastLine('shuriken', d)];
    },
  },
  shurikenMastery: {
    tree: 'shuriken', name: 'Shuriken Mastery', row: 1, col: 0, pre: [], wep: 'fuma', kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'A thousand practice throws at the training post. Nine hundred and ninety hit. (The other ten hit Kuma.) Passive — Shuriken Arts and your fūma slashes hit harder and crit more.',
    syn: [],
    params(l) { return { dmgPct: 30 + 12 * (l - 1), crit: r1(2 + 0.5 * (l - 1)) }; },
    info(l) { const p = DEFS.shurikenMastery.params(l); return [`+${p.dmgPct}% Shuriken Arts and fūma slash damage`, `+${p.crit}% critical chance`]; },
  },
  kunaiFan: {
    tree: 'shuriken', name: 'Kunai Fan', row: 1, col: 2, pre: ['fumaThrow'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: () => 0,
    desc: 'Fan a pawful of kunai out of the pouch in one flick. Each one goes thunk. Very satisfying thunks.',
    syn: [{ id: 'fumaThrow', p: 4 }, { id: 'shadowStitch', p: 4 }],
    params(l, d) {
      return { count: Math.min(11, 4 + Math.floor(l / 2)), spread: Math.min(75, 45 + 1.5 * l), dmgPct: lin(55, 6)(l) * S('kunaiFan', d), speed: 20, range: r1(8 + 0.1 * l), pierce: 0 };
    },
    info(l, d) {
      const p = DEFS.kunaiFan.params(l, d);
      return [`Kunai: ${p.count} in a ${Math.round(p.spread)}° fan`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, costLine(DEFS.kunaiFan, l, d), ...synLine('kunaiFan', d), ...mastLine('shuriken', d)];
    },
  },
  shadowStitch: {
    tree: 'shuriken', name: 'Shadow Stitch', row: 2, col: 1, pre: ['fumaThrow'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(8 + 0.4 * (l - 1)), cd: l => r1(Math.max(0.6, 1.6 - 0.04 * l)),
    desc: 'Three kunai pin a foe\'s shadow to the floor. Its shadow stays put, so it does too. Nearby shadows get stitched as well.',
    syn: [{ id: 'kunaiFan', p: 5 }, { id: 'shurikenRain', p: 3 }],
    params(l, d) {
      return { dmgPct: lin(120, 13)(l) * S('shadowStitch', d), root: r2(1.4 + 0.06 * l), radius: r2(1.6 + 0.04 * l), range: 11, kunai: 3 };
    },
    info(l, d) {
      const p = DEFS.shadowStitch.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Roots foes within ${p.radius} m of the target for ${p.root}s (bosses resist)`, costLine(DEFS.shadowStitch, l, d), ...synLine('shadowStitch', d), ...mastLine('shuriken', d)];
    },
  },
  whirlingFuma: {
    tree: 'shuriken', name: 'Whirling Fūma', row: 3, col: 0, pre: ['shurikenMastery'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(12 + 0.5 * (l - 1)), cd: l => r1(Math.max(1.2, 3 - 0.08 * l)),
    desc: 'Plant a spare fūma in the ground, spinning like a buzz-saw. Foes nearby are tugged in and trimmed. (Keep your tail clear.)',
    syn: [{ id: 'fumaThrow', p: 5 }, { id: 'thousandStars', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(42, 5)(l) * S('whirlingFuma', d), tick: 0.3, radius: r2(1.7 + 0.03 * l), duration: r1(4 + 0.15 * l), pull: 1.2, maxTraps: 1 + Math.floor(l / 8), range: 10 };
    },
    info(l, d) {
      const p = DEFS.whirlingFuma.params(l, d);
      return [`Buzz-saw damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} every ${p.tick}s`, `Radius ${p.radius} m · spins ${p.duration}s`, `Up to ${p.maxTraps} at once`, costLine(DEFS.whirlingFuma, l, d), ...synLine('whirlingFuma', d), ...mastLine('shuriken', d)];
    },
  },
  shurikenRain: {
    tree: 'shuriken', name: 'Shuriken Rain', row: 4, col: 2, pre: ['kunaiFan'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(18 + 0.8 * (l - 1)), cd: () => 4,
    desc: 'Leap high into the air and let the bone shuriken fall like hail over the target area. Land with a pose.',
    syn: [{ id: 'kunaiFan', p: 5 }, { id: 'fumaThrow', p: 3 }],
    params(l, d) {
      return { count: 10 + l, dmgPct: lin(72, 8)(l) * S('shurikenRain', d), radius: r2(3 + 0.05 * l), impactRadius: 0.9, duration: 1.2, range: 12 };
    },
    info(l, d) {
      const p = DEFS.shurikenRain.params(l, d);
      return [`Shuriken: ${p.count} over ${p.duration}s`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Area: ${p.radius} m`, costLine(DEFS.shurikenRain, l, d), ...synLine('shurikenRain', d), ...mastLine('shuriken', d)];
    },
  },
  thousandStars: {
    tree: 'shuriken', name: 'Thousand Star Flurry', row: 5, col: 1, pre: ['whirlingFuma', 'shurikenRain'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(34 + 1 * (l - 1)), cd: () => 9,
    desc: 'Spin on the spot and empty every pouch at once: a spiral galaxy of tiny bone shuriken whirls out around you and shreds everything in it.',
    syn: [{ id: 'fumaThrow', p: 5 }, { id: 'whirlingFuma', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(38, 4)(l) * S('thousandStars', d), tick: 0.3, radius: r2(4.5 + 0.05 * l), duration: 2.1, pull: 0.8, arms: 3 };
    },
    info(l, d) {
      const p = DEFS.thousandStars.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} every ${p.tick}s to every foe in ${p.radius} m`, `Lasts ${p.duration}s`, costLine(DEFS.thousandStars, l, d), ...synLine('thousandStars', d), ...mastLine('shuriken', d)];
    },
  },

  // =================================================================== NINJUTSU
  smokeBomb: {
    tree: 'jutsu', name: 'Smoke Bomb', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(7 + 0.3 * (l - 1)), cd: l => r1(Math.max(2, 4.5 - 0.12 * l)),
    desc: 'Make a hand seal and — POOF! A cloud of pepper smoke. Foes inside cough, squint and miss; and you simply vanish. (Please do not sneeze.)',
    syn: [{ id: 'substitution', p: 6 }, { id: 'smokeDragon', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(45, 6)(l) * J('smokeBomb', d), radius: r2(2.6 + 0.05 * l), blind: r1(3 + 0.1 * l), miss: Math.round(35 + dim(l, 30, 10)), vanish: r1(1.2 + 0.05 * l) };
    },
    info(l, d) {
      const p = DEFS.smokeBomb.params(l, d);
      return [`Bang: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, `Blinds for ${p.blind}s: their attacks miss ${p.miss}% of the time`, `You vanish for ${p.vanish}s: foes lose you`, costLine(DEFS.smokeBomb, l, d), ...synLine('smokeBomb', d), ...mastLine('jutsu', d), ...enerLine(d)];
    },
  },
  ninjutsuMastery: {
    tree: 'jutsu', name: 'Ninjutsu Mastery', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'Rat, ox, tiger, hare… treat. You have practised every hand seal (the last one is your own invention). Passive — jutsu hit harder and cost less zoom.',
    syn: [],
    params(l) { return { dmgPct: 30 + 10 * (l - 1), costCut: Math.round(dim(l, 30, 8)) }; },
    info(l) { const p = DEFS.ninjutsuMastery.params(l); return [`+${p.dmgPct}% Ninjutsu damage`, `Ninjutsu costs ${p.costCut}% less zoom`]; },
  },
  puffBall: {
    tree: 'jutsu', name: 'Fire Release: Puff Ball', row: 1, col: 2, pre: ['smokeBomb'], wep: null, kind: 'active', element: 'fire',
    cost: l => r1(5 + 0.25 * (l - 1)), cd: () => 0,
    desc: 'Puff out your cheeks — very round cheeks — and spit a bouncing ball of fire. It bursts on the first foe and leaves them toasty.',
    syn: [{ id: 'smokeBomb', p: 4 }, { id: 'thunderPaw', p: 5 }],
    params(l, d) {
      const m = J('puffBall', d);
      return { dmgPct: lin(110, 13)(l) * m, splashPct: 60, radius: r2(1.4 + 0.04 * l), burnPct: lin(18, 2.5)(l) * m, burnDuration: 2.5, speed: 13, range: 11 };
    },
    info(l, d) {
      const p = DEFS.puffBall.params(l, d);
      return [`Fire damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Burst: ${p.splashPct}% to foes within ${p.radius} m`, `Burns: ${pct(p.burnPct)} per second for ${p.burnDuration}s`, costLine(DEFS.puffBall, l, d), ...synLine('puffBall', d), ...mastLine('jutsu', d), ...enerLine(d)];
    },
  },
  shadowClone: {
    tree: 'jutsu', name: 'Shadow Clone', row: 2, col: 1, pre: ['smokeBomb'], wep: null, kind: 'summon', element: 'phys',
    cost: l => r1(14 + 0.5 * (l - 1)), cd: () => 2,
    desc: 'Two smoky copies of you pop out of a hand seal. They copy every slash and throw you make. They are almost as cute as you.',
    syn: [{ id: 'substitution', p: 4 }, { id: 'smokeBomb', p: 3 }],
    params(l, d) {
      return { clones: 2, clonePct: Math.min(100, Math.min(80, 30 + 3 * (l - 1)) * syn('shadowClone', d)), duration: r1(12 + 0.5 * l), life: Math.round((((d && d.lifeMax) || 80) * (30 + 3 * l)) / 100), taunt: 0 };
    },
    info(l, d) {
      const p = DEFS.shadowClone.params(l, d);
      return [`Clones: ${p.clones} · last ${p.duration}s`, `They copy your attacks at ${Math.round(p.clonePct)}% damage`, `Clone life: ${p.life}`, costLine(DEFS.shadowClone, l, d), ...synLine('shadowClone', d)];
    },
  },
  substitution: {
    tree: 'jutsu', name: 'Substitution', row: 3, col: 0, pre: ['ninjutsuMastery'], wep: null, kind: 'active', element: 'stink',
    cost: l => r1(8 + 0.3 * (l - 1)), cd: l => r1(Math.max(1.5, 4 - 0.12 * l)),
    desc: 'The classic! Leave a chew-toy log where you stood and blink to the cursor. Foes bite the log. The log bites back (it explodes into smoke).',
    syn: [{ id: 'smokeBomb', p: 5 }, { id: 'shadowClone', p: 4 }],
    params(l, d) {
      return { range: r1(7 + 0.2 * l), logLife: 2.5, taunt: 6, dmgPct: lin(70, 9)(l) * J('substitution', d), popRadius: 2.2, blind: 1.5 };
    },
    info(l, d) {
      const p = DEFS.substitution.params(l, d);
      return [`Blink up to ${p.range} m`, `The log lures foes for ${p.logLife}s, then pops: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.popRadius} m`, costLine(DEFS.substitution, l, d), ...synLine('substitution', d), ...mastLine('jutsu', d), ...enerLine(d)];
    },
  },
  thunderPaw: {
    tree: 'jutsu', name: 'Lightning Release: Thunder Paw', row: 4, col: 2, pre: ['puffBall'], wep: null, kind: 'active', element: 'zap',
    cost: l => r1(16 + 0.6 * (l - 1)), cd: () => 0.8,
    desc: 'Slap the ground with a crackling paw. A bolt drops on the target and leaps from foe to foe, a paw-print of light left on each.',
    syn: [{ id: 'puffBall', p: 5 }, { id: 'smokeBomb', p: 3 }],
    params(l, d) {
      return { dmgPct: lin(150, 16)(l) * J('thunderPaw', d), chains: 2 + Math.floor(l / 3), chainRange: r1(5 + 0.1 * l), falloff: 10, stun: 0.35, range: 12 };
    },
    info(l, d) {
      const p = DEFS.thunderPaw.params(l, d);
      return [`Zap damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Chains to ${p.chains} more foes within ${p.chainRange} m (−${p.falloff}% per jump)`, costLine(DEFS.thunderPaw, l, d), ...synLine('thunderPaw', d), ...mastLine('jutsu', d), ...enerLine(d)];
    },
  },
  smokeDragon: {
    tree: 'jutsu', name: 'Smoke Dragon', row: 5, col: 1, pre: ['substitution', 'thunderPaw'], wep: null, kind: 'active', element: 'stink',
    cost: l => r1(38 + 1 * (l - 1)), cd: () => 8,
    desc: 'The forbidden seal! A great dragon of smoke uncoils from your paws and sweeps across the field, bowling foes over and leaving them blind.',
    syn: [{ id: 'smokeBomb', p: 5 }, { id: 'puffBall', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(300, 32)(l) * J('smokeDragon', d), length: r1(14 + 0.1 * l), width: r1(3.2 + 0.04 * l), speed: 6.5, blind: 3, knockback: 1.6 }; // (6.5 m/s: an ultimate you get to watch sweep by)
    },
    info(l, d) {
      const p = DEFS.smokeDragon.params(l, d);
      return [`Smoke damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Sweeps ${p.length} m · ${p.width} m wide, blinding for ${p.blind}s`, costLine(DEFS.smokeDragon, l, d), ...synLine('smokeDragon', d), ...mastLine('jutsu', d), ...enerLine(d)];
    },
  },

  // =================================================================== SHADOW STEP
  shadowStep: {
    tree: 'shadow', name: 'Shadow Step', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(3 + 0.12 * (l - 1)), cd: l => r1(Math.max(0.4, 0.9 - 0.02 * l)),
    desc: 'Melt into your own shadow and pop out right behind a foe — then strike. From behind, it is very hard not to crit.',
    // (no damage mastery in this tree: its synergies are bigger, so a Shadow Step build scales with them — hero-balance.mjs)
    syn: [{ id: 'afterimageDash', p: 10 }, { id: 'vanish', p: 8 }],
    params(l, d) {
      return { dmgPct: lin(250, 32)(l) * syn('shadowStep', d), range: r1(8 + 0.2 * l), critBonus: Math.round(25 + dim(l, 25, 10)), radius: 1.6, arc: 150, knockback: 0.4 };
    },
    info(l, d) {
      const p = DEFS.shadowStep.params(l, d);
      return [`Strike: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Blinks behind a foe up to ${p.range} m away`, `+${p.critBonus}% critical chance from behind`, costLine(DEFS.shadowStep, l, d), ...synLine('shadowStep', d)];
    },
  },
  swiftWind: {
    tree: 'shadow', name: 'Swift as Wind', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'Light paws, quick feet, and an uncanny knack for being somewhere else when the club comes down. Passive — faster running and a chance to dodge hits.',
    syn: [],
    params(l) { return { moveSpeed: Math.round(10 + dim(l, 30, 10)), dodge: r1(3 + dim(l, 22, 10)) }; },
    info(l) { const p = DEFS.swiftWind.params(l); return [`+${p.moveSpeed}% movement speed`, `+${p.dodge}% chance to dodge a hit`]; },
  },
  afterimageDash: {
    tree: 'shadow', name: 'Afterimage Dash', row: 1, col: 2, pre: ['shadowStep'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(6 + 0.2 * (l - 1)), cd: l => r1(Math.max(0.8, 2.5 - 0.08 * l)),
    desc: 'Dash through the crowd so fast you leave copies of yourself behind. A moment later the copies burst into blinding smoke.',
    syn: [{ id: 'shadowStep', p: 4 }, { id: 'caltropFlip', p: 3 }],
    params(l, d) {
      const s = syn('afterimageDash', d);
      return { dmgPct: lin(75, 10)(l) * s, distance: r2(6 + 0.15 * l), speed: 24, width: 1.2, images: 3, burstPct: lin(35, 4)(l) * s, burstRadius: 1.5, blind: 1.5, invuln: true };
    },
    info(l, d) {
      const p = DEFS.afterimageDash.params(l, d);
      return [`Dash damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} · ${p.distance} m`, `${p.images} afterimages burst for ${pct(p.burstPct)} in ${p.burstRadius} m and blind`, 'Untouchable while dashing', costLine(DEFS.afterimageDash, l, d), ...synLine('afterimageDash', d)];
    },
  },
  vanish: {
    tree: 'shadow', name: 'Vanish', row: 2, col: 1, pre: ['shadowStep'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(10 + 0.4 * (l - 1)), cd: l => r1(Math.max(4, 10 - 0.25 * l)),
    desc: 'Hold perfectly still, think invisible thoughts… and you are. Foes lose you completely. Your next hit is a double crit and breaks the spell.',
    syn: [],
    params(l) { return { duration: r1(4 + 0.2 * l), moveBuff: 20, critX: 2, bonusPct: lin(40, 6)(l) }; },
    info(l, d) {
      const p = DEFS.vanish.params(l, d);
      return [`Invisible for up to ${p.duration}s (+${p.moveBuff}% speed)`, `Your next hit: a double crit, +${pct(p.bonusPct)} damage`, costLine(DEFS.vanish, l, d)];
    },
  },
  caltropFlip: {
    tree: 'shadow', name: 'Caltrop Flip', row: 3, col: 0, pre: ['swiftWind'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(8 + 0.35 * (l - 1)), cd: l => r1(Math.max(1.2, 3 - 0.08 * l)),
    desc: 'A neat back-flip away from trouble, scattering a pawful of bone caltrops where you stood. Ow, ow, ow (them, not you).',
    syn: [{ id: 'afterimageDash', p: 5 }, { id: 'swiftWind', p: 3 }],
    params(l, d) {
      return { dmgPct: lin(28, 3.5)(l) * syn('caltropFlip', d), tick: 0.5, radius: r2(2.4 + 0.04 * l), duration: r1(4 + 0.15 * l), slow: r2(0.4 + dim(l, 0.2, 10)), flip: 3.2 };
    },
    info(l, d) {
      const p = DEFS.caltropFlip.params(l, d);
      return [`Caltrops: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} every ${p.tick}s in ${p.radius} m`, `Slows foes ${Math.round(p.slow * 100)}% · lasts ${p.duration}s`, `Flips you ${p.flip} m back`, costLine(DEFS.caltropFlip, l, d), ...synLine('caltropFlip', d)];
    },
  },
  bullseyeMark: {
    tree: 'shadow', name: 'Bullseye Mark', row: 4, col: 2, pre: ['afterimageDash'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(10 + 0.4 * (l - 1)), cd: () => 1,
    desc: 'Paint a target on a foe (with a very small brush). Every hit you land on it adds to the mark; at ten — or when it runs out — it bursts.',
    syn: [{ id: 'shadowStep', p: 4 }, { id: 'phantomBarrage', p: 4 }],
    params(l, d) {
      return { duration: 8, maxStacks: 10, stackPct: lin(34, 4)(l) * syn('bullseyeMark', d), burstRadius: 2.2, vuln: r1(10 + 0.5 * l), range: 12 };
    },
    info(l, d) {
      const p = DEFS.bullseyeMark.params(l, d);
      return [`Marks a foe for ${p.duration}s: it takes +${p.vuln}% damage from you`, `Bursts for ${pct(p.stackPct)}${dmgRange(p.stackPct, d)} per hit (up to ${p.maxStacks}) in ${p.burstRadius} m`, costLine(DEFS.bullseyeMark, l, d), ...synLine('bullseyeMark', d)];
    },
  },
  phantomBarrage: {
    tree: 'shadow', name: 'Phantom Barrage', row: 5, col: 1, pre: ['caltropFlip', 'bullseyeMark'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(32 + 1 * (l - 1)), cd: () => 8,
    desc: 'Blink from foe to foe faster than the eye can follow, striking each from behind — then reappear where you started, and sneeze. Achoo.',
    syn: [{ id: 'shadowStep', p: 6 }, { id: 'bullseyeMark', p: 4 }],
    params(l, d) {
      return { targets: Math.min(8, 4 + Math.floor(l / 4)), dmgPct: lin(230, 25)(l) * syn('phantomBarrage', d), range: r1(9 + 0.1 * l), interval: 0.13, critBonus: 30 };
    },
    info(l, d) {
      const p = DEFS.phantomBarrage.params(l, d);
      return [`Strikes up to ${p.targets} foes within ${p.range} m`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} (+${p.critBonus}% crit chance)`, 'Untouchable throughout', costLine(DEFS.phantomBarrage, l, d), ...synLine('phantomBarrage', d)];
    },
  },
};

/** Skills whose real cast isn't built yet: greyed in the K panel ("In training"), can't be learned (skills.js canLearn)
 *  or cast (usable). Each one leaves this list as its move, effects and sound land (docs/POE.md §3). */
export const POE_TRAINING = new Set([]); // (phase 2: all 21 are built; the lock stays for any skill added later)

for (const id in DEFS) {
  const d = DEFS[id];
  for (const k of ['info', 'params', 'cost', 'cd']) { const fn = d[k]; d[k] = (...a) => fn.apply(d, a); }
  d.id = id; d.cls = 'poe'; d.req = ROW_REQ[d.row]; d.pre = d.pre || []; d.syn = d.syn || [];
  Object.defineProperty(d, 'training', { get: () => POE_TRAINING.has(id), enumerable: true });
}

/** Skill definitions. Format: see skills.js DEFS. */
export const POE_SKILLS = DEFS;

const diminish = (v, k) => (v > 0 ? (k * v) / (k + v) : v);
/**
 * Passive / mastery effects for Poe's trees, applied at the end of computeStats() (after moveMul, crit and the weapon
 * damage are known). d = derived (mutable), L = id => effective skill level, CL = her class (classes.js).
 * Sets: d.treeDmgPct = {shuriken, jutsu, shadow}, d.treeCostCut = {jutsu}, d.jutsuMul (Energy for Ninjutsu), d.crit,
 * d.moveSpeed / d.moveMul (Swift as Wind), d.dodge (%, cap 40).
 */
export function poePassives(d, L, CL) {
  const lv = id => (L && L(id)) || 0;
  d.treeDmgPct = { shuriken: 0, jutsu: 0, shadow: 0 };
  d.treeCostCut = { jutsu: 0 };
  // Ninjutsu: Energy's +1% per point instead of Dexterity's (the weapon damage already carries Dex)
  d.jutsuMul = r2((100 + (d.dmgPct || 0) + (d.ene || 0)) / Math.max(1, 100 + (d.dmgPct || 0) + (d.statDmgPct || 0)));
  if (lv('shurikenMastery') > 0) {
    const p = DEFS.shurikenMastery.params(lv('shurikenMastery'));
    d.treeDmgPct.shuriken += p.dmgPct;
    d.crit = r1(Math.min(75, (d.crit || 0) + p.crit));
  }
  if (lv('ninjutsuMastery') > 0) {
    const p = DEFS.ninjutsuMastery.params(lv('ninjutsuMastery'));
    d.treeDmgPct.jutsu += p.dmgPct; d.treeCostCut.jutsu = p.costCut;
  }
  let dodge = (CL && CL.dodge) || 0;
  if (lv('swiftWind') > 0) {
    const p = DEFS.swiftWind.params(lv('swiftWind'));
    d.moveSpeed = (d.moveSpeed || 0) + p.moveSpeed;
    d.moveMul = r2(Math.min(2, Math.max(0.5, 1 + diminish(d.moveSpeed, 150) / 100)));
    dodge += p.dodge;
  }
  d.dodge = r1(Math.min(40, dodge));
}
