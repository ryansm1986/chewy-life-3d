// Moka's skill trees (Boykin Spaniel mage) — same Diablo-2 framework as Chewy's trees in skills.js (rows 0-5 gated by
// ROW_REQ, prerequisites, hard-point synergies). See docs/HEROES.md §3 for the design.
// skills.js merges MOKA_SKILLS into SKILLS (ids must not clash with Chewy's) and MOKA_TREES into TREES.
// Spell damage: dmgPct of the staff's rolled damage (derived.dmgMin..dmgMax already include Energy, +%dmg, masteries).
// Elements: water → 'frost', starlight → 'zap', duck hunt → 'phys'.
//
// Units as in skills.js: metres, m/s, seconds, dmgPct = % of weapon damage with synergies ALREADY folded in.
// Moka's masteries don't raise weapon damage (Chewy's do); they add a per-tree bonus instead: mokaPassives() writes
// derived.treeDmgPct = {tide, star, duck} and every Tidewater / Starlight params() multiplies by (1 + bonus/100).
// Summons (Decoy Duck, Spirit Retriever, Mallard Squadron) scale with derived.summonDmg / summonLife (Retriever's
// Instinct). Glass cannon: strong AoE and crowd control, but her life pool is small (classes.js) and her only
// defence is the Bubble Barrier.
// No `this` is used below, so the defs also work when destructured (they are bound here and again by skills.js).

export const MOKA_TREES = [
  { id: 'tide', cls: 'moka', name: 'Tidewater', sub: 'Staff', color: '#bdf4ec', accent: '#2fb8a8', desc: 'Splashes, bubbles and waves. Boykins were born to swim.' },
  { id: 'star', cls: 'moka', name: 'Starlight Kibble', sub: 'Staff', color: '#fff0b8', accent: '#9a7ae8', desc: 'Homing kibble, moonbeams and a very large biscuit from the sky.' },
  { id: 'duck', cls: 'moka', name: 'Duck Hunt', sub: 'Any weapon', color: '#ffe0b0', accent: '#e8902a', desc: 'Retriever tricks: decoys, leashes, feathers and spectral mallards.' },
];

const ROW_REQ = [1, 6, 12, 18, 24, 30]; // (same gates as skills.js)
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const pct = v => Math.round(v) + '%';
const dim = (lvl, max, half) => (lvl <= 0 ? 0 : (max * lvl) / (lvl + half));
const lin = (a, b) => l => a + b * (l - 1);
const syn = (id, d) => (d && d.synergy && d.synergy[id]) || 1;
/** per-tree mastery multiplier (Tidewater / Starlight Mastery) */
const tree = (t, d) => 1 + ((d && d.treeDmgPct && d.treeDmgPct[t]) || 0) / 100;
/** summon damage / life multipliers (Retriever's Instinct) */
const sDmg = d => 1 + ((d && d.summonDmg) || 0) / 100;
const sLife = d => 1 + ((d && d.summonLife) || 0) / 100;
const M = (id, t, d) => syn(id, d) * tree(t, d);
function dmgRange(pctV, d) {
  if (!d || d.dmgMin == null) return '';
  const a = Math.max(1, Math.round((d.dmgMin * pctV) / 100)), b = Math.max(a, Math.round((d.dmgMax * pctV) / 100));
  return ` (${a}–${b})`;
}
function synLine(id, d) { const m = syn(id, d); return m > 1.001 ? [`Synergy bonus: +${Math.round((m - 1) * 100)}%`] : []; }
function mastLine(t, d) { const v = d && d.treeDmgPct && d.treeDmgPct[t]; return v > 0 ? [`Mastery bonus: +${Math.round(v)}%`] : []; }
const costLine = (def, l) => `Zoom cost: ${def.cost(l)}${def.cd(l) ? ` · Cooldown: ${def.cd(l)}s` : ''}`;

const DEFS = {
  // =================================================================== TIDEWATER
  splash: {
    tree: 'tide', name: 'Splash Bolt', row: 0, col: 1, pre: [], wep: 'staff', kind: 'active', element: 'frost',
    cost: l => r1(2.5 + 0.12 * (l - 1)), cd: () => 0,
    desc: 'Fling a wobbly orb of pond water. It bursts in a very satisfying splash that chills everyone nearby. Bread, butter and bathwater.',
    syn: [{ id: 'shake', p: 6 }, { id: 'greatWave', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(150, 17)(l) * M('splash', 'tide', d), splashPct: 55, splashRadius: r2(1.2 + 0.03 * l), chill: 0.3, chillDur: r1(1.2 + 0.05 * l), speed: 17, range: 12 };
    },
    info(l, d) {
      const p = DEFS.splash.params(l, d);
      return [`Water damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Splash: ${p.splashPct}% to foes within ${p.splashRadius} m`, `Chills (−${Math.round(p.chill * 100)}% speed) for ${p.chillDur}s`, costLine(DEFS.splash, l), ...synLine('splash', d), ...mastLine('tide', d)];
    },
  },
  tideMastery: {
    tree: 'tide', name: 'Tidewater Mastery', row: 1, col: 0, pre: [], wep: 'staff', kind: 'passive', element: 'frost',
    cost: () => 0, cd: () => 0,
    desc: 'Every puddle is a swimming pool if you believe hard enough. Passive — all Tidewater spells hit harder and your zoom refills faster.',
    syn: [],
    params(l) { return { dmgPct: 30 + 10 * (l - 1), zoomRegen: 10 + 5 * (l - 1) }; },
    info(l) { const p = DEFS.tideMastery.params(l); return [`+${p.dmgPct}% Tidewater damage`, `+${p.zoomRegen}% zoom regeneration`]; },
  },
  bubble: {
    tree: 'tide', name: 'Bubble Barrier', row: 1, col: 2, pre: ['splash'], wep: 'staff', kind: 'active', element: 'frost',
    cost: l => r1(10 + 0.5 * (l - 1)), cd: l => r1(Math.max(5, 12 - 0.35 * l)),
    desc: 'Blow a big shimmery bubble around yourself. It soaks up hits until it pops — and the pop splashes foes away. Please do not poke the bubble.',
    syn: [{ id: 'splash', p: 4 }, { id: 'tideMastery', p: 3 }],
    params(l, d) {
      const absorbPct = r1(25 + 2.5 * l), absorbFlat = 8 * l;
      return { absorbPct, absorbFlat, absorb: Math.round((((d && d.lifeMax) || 60) * absorbPct) / 100 + absorbFlat), duration: r1(10 + 0.5 * l), dmgPct: lin(90, 11)(l) * M('bubble', 'tide', d), radius: r2(2.8 + 0.04 * l), knockback: 2.2, chill: 0.3, chillDur: 1.5 };
    },
    info(l, d) {
      const p = DEFS.bubble.params(l, d);
      return [`Absorbs ${p.absorbPct}% life + ${p.absorbFlat}${d && d.lifeMax ? ` (${p.absorb})` : ''} damage`, `Lasts ${p.duration}s`, `Pop: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m + knockback`, costLine(DEFS.bubble, l), ...synLine('bubble', d), ...mastLine('tide', d)];
    },
  },
  shake: {
    tree: 'tide', name: 'Wet Dog Shake', row: 2, col: 1, pre: ['splash'], wep: 'staff', kind: 'active', element: 'frost',
    cost: l => r1(9 + 0.45 * (l - 1)), cd: () => 0,
    desc: 'The iconic post-bath shake! A spinning spray of cold water drenches everything around you and leaves it shivering.',
    syn: [{ id: 'splash', p: 5 }, { id: 'whirlpool', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(120, 14)(l) * M('shake', 'tide', d), radius: r2(3.2 + 0.06 * l), chill: r2(0.35 + dim(l, 0.2, 10)), chillDur: r1(2 + 0.08 * l), knockback: 1.2 };
    },
    info(l, d) {
      const p = DEFS.shake.params(l, d);
      return [`Water damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, `Chills (−${Math.round(p.chill * 100)}% speed) for ${p.chillDur}s`, costLine(DEFS.shake, l), ...synLine('shake', d), ...mastLine('tide', d)];
    },
  },
  puddleHop: {
    tree: 'tide', name: 'Puddle Hop', row: 3, col: 0, pre: ['tideMastery'], wep: 'staff', kind: 'active', element: 'frost',
    cost: l => r1(8 + 0.25 * (l - 1)), cd: l => r1(Math.max(1, 4 - 0.15 * l)),
    desc: 'Dive into a puddle and pop out of another one at the cursor with a splash. Spaniel physics: do not question it.',
    syn: [{ id: 'bubble', p: 4 }, { id: 'shake', p: 3 }],
    params(l, d) {
      return { range: r1(7 + 0.2 * l), dmgPct: lin(80, 10)(l) * M('puddleHop', 'tide', d), radius: 2.2, chill: 0.3, chillDur: 1.5, knockback: 1.4 };
    },
    info(l, d) {
      const p = DEFS.puddleHop.params(l, d);
      return [`Hop up to ${p.range} m`, `Arrival splash: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, costLine(DEFS.puddleHop, l), ...synLine('puddleHop', d), ...mastLine('tide', d)];
    },
  },
  whirlpool: {
    tree: 'tide', name: 'Whirlpool', row: 4, col: 2, pre: ['shake'], wep: 'staff', kind: 'active', element: 'frost',
    cost: l => r1(16 + 0.6 * (l - 1)), cd: l => r1(Math.max(2.5, 5 - 0.12 * l)),
    desc: 'Open a swirling whirlpool that drags foes into its middle and churns them round and round like a load of laundry.',
    syn: [{ id: 'shake', p: 5 }, { id: 'bubble', p: 3 }],
    params(l, d) {
      return { radius: r2(3 + 0.05 * l), duration: r1(3 + 0.1 * l), pull: 3.2, dmgPct: lin(40, 5)(l) * M('whirlpool', 'tide', d), tick: 0.35, chill: 0.3, range: 12 };
    },
    info(l, d) {
      const p = DEFS.whirlpool.params(l, d);
      return [`Churn damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} every ${p.tick}s`, `Radius ${p.radius} m · lasts ${p.duration}s`, 'Drags foes to its centre (bosses resist)', costLine(DEFS.whirlpool, l), ...synLine('whirlpool', d), ...mastLine('tide', d)];
    },
  },
  greatWave: {
    tree: 'tide', name: 'Great Wave', row: 5, col: 1, pre: ['puddleHop', 'whirlpool'], wep: 'staff', kind: 'active', element: 'frost',
    cost: l => r1(38 + 1 * (l - 1)), cd: () => 8,
    desc: 'Call up a towering wave, surf its crest for one glorious moment, and send it rolling forward to sweep every foe away.',
    syn: [{ id: 'splash', p: 5 }, { id: 'shake', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(300, 32)(l) * M('greatWave', 'tide', d), length: r1(13 + 0.1 * l), width: r1(5.5 + 0.05 * l), speed: 11, knockback: 3, chill: 0.45, chillDur: 3, surf: 2.4 };
    },
    info(l, d) {
      const p = DEFS.greatWave.params(l, d);
      return [`Water damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Rolls ${p.length} m · ${p.width} m wide, sweeping foes back`, `Chills (−${Math.round(p.chill * 100)}% speed) for ${p.chillDur}s`, costLine(DEFS.greatWave, l), ...synLine('greatWave', d), ...mastLine('tide', d)];
    },
  },

  // =================================================================== STARLIGHT KIBBLE
  kibble: {
    tree: 'star', name: 'Kibble Missiles', row: 0, col: 1, pre: [], wep: 'staff', kind: 'active', element: 'zap',
    cost: l => r1(3 + 0.15 * (l - 1)), cd: () => 0,
    desc: 'Toss a handful of star-kibble that sniffs out the nearest foes all by itself. Crunchy, homing, and just a little bit magic.',
    syn: [{ id: 'constellation', p: 5 }, { id: 'meteor', p: 3 }],
    params(l, d) {
      return { count: Math.min(6, 3 + Math.floor(l / 6)), dmgPct: lin(45, 4)(l) * M('kibble', 'star', d), speed: 13, range: 13, homing: 5 };
    },
    info(l, d) {
      const p = DEFS.kibble.params(l, d);
      return [`Missiles: ${p.count}`, `Starlight damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, 'Homes in on nearby foes', costLine(DEFS.kibble, l), ...synLine('kibble', d), ...mastLine('star', d)];
    },
  },
  starMastery: {
    tree: 'star', name: 'Starlight Mastery', row: 1, col: 0, pre: [], wep: 'staff', kind: 'passive', element: 'zap',
    cost: () => 0, cd: () => 0,
    desc: 'You have read every star chart in the library. Twice. Passive — all Starlight spells hit harder and crit more often.',
    syn: [],
    params(l) { return { dmgPct: 30 + 10 * (l - 1), crit: r1(2 + 0.5 * (l - 1)) }; },
    info(l) { const p = DEFS.starMastery.params(l); return [`+${p.dmgPct}% Starlight damage`, `+${p.crit}% critical chance`]; },
  },
  squeak: {
    tree: 'star', name: 'Squeaky Nova', row: 1, col: 2, pre: ['kibble'], wep: 'staff', kind: 'active', element: 'zap',
    cost: l => r1(8 + 0.35 * (l - 1)), cd: l => r1(Math.max(1.5, 3 - 0.06 * l)),
    desc: 'Squeeze a giant squeaky toy. The SQUEAK! is so loud it bowls foes over and leaves them seeing stars.',
    syn: [{ id: 'kibble', p: 4 }, { id: 'constellation', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(70, 9)(l) * M('squeak', 'star', d), radius: r2(3.8 + 0.08 * l), stun: r2(0.9 + 0.05 * l), knockback: 1.8 };
    },
    info(l, d) {
      const p = DEFS.squeak.params(l, d);
      return [`Starlight damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, `Stun: ${p.stun}s`, costLine(DEFS.squeak, l), ...synLine('squeak', d), ...mastLine('star', d)];
    },
  },
  pawRune: {
    tree: 'star', name: 'Paw Rune', row: 2, col: 1, pre: ['kibble'], wep: 'staff', kind: 'active', element: 'zap',
    cost: l => r1(10 + 0.5 * (l - 1)), cd: () => 0.4,
    desc: 'Stamp a glowing paw print on the floor. The first foe to step on it gets a faceful of erupting starlight. Good paws only.',
    syn: [{ id: 'kibble', p: 4 }, { id: 'squeak', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(190, 22)(l) * M('pawRune', 'star', d), radius: r2(2.3 + 0.04 * l), trigger: 1.2, maxRunes: 2 + Math.floor(l / 6), life: 25, arm: 0.6, stun: 0.4, range: 10 };
    },
    info(l, d) {
      const p = DEFS.pawRune.params(l, d);
      return [`Eruption: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, `Up to ${p.maxRunes} runes · each waits ${p.life}s`, costLine(DEFS.pawRune, l), ...synLine('pawRune', d), ...mastLine('star', d)];
    },
  },
  moonbeam: {
    tree: 'star', name: 'Moonbeam', row: 3, col: 0, pre: ['starMastery'], wep: 'staff', kind: 'channel', element: 'zap',
    cost: l => r1(7 + 0.35 * (l - 1)), cd: () => 0,
    desc: 'Hold to call a beam of moonlight down from the sky. It glides after your cursor and scorches whatever it touches.',
    syn: [{ id: 'pawRune', p: 4 }, { id: 'kibble', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(60, 7)(l) * M('moonbeam', 'star', d), ticksPerSec: 4, radius: r2(1.3 + 0.02 * l), follow: 7, range: 12, slow: 0.25 };
    },
    info(l, d) {
      const p = DEFS.moonbeam.params(l, d);
      return [`Damage per tick: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `${p.ticksPerSec} ticks per second, radius ${p.radius} m`, `Zoom: ${DEFS.moonbeam.cost(l)} per second`, ...synLine('moonbeam', d), ...mastLine('star', d)];
    },
  },
  constellation: {
    tree: 'star', name: 'Constellation Link', row: 4, col: 2, pre: ['squeak'], wep: 'staff', kind: 'active', element: 'zap',
    cost: l => r1(14 + 0.6 * (l - 1)), cd: () => 0.8,
    desc: 'Point at a foe and star-chains leap between everyone nearby, drawing a constellation — which then twinkles for a second helping.',
    syn: [{ id: 'kibble', p: 5 }, { id: 'squeak', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(140, 15)(l) * M('constellation', 'star', d), links: 3 + Math.floor(l / 3), linkRange: r1(6 + 0.1 * l), twinklePct: 40, range: 11, slow: 0.3 };
    },
    info(l, d) {
      const p = DEFS.constellation.params(l, d);
      return [`Starlight damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} per star`, `Links up to ${p.links} foes`, `Twinkle: +${p.twinklePct}% a moment later`, costLine(DEFS.constellation, l), ...synLine('constellation', d), ...mastLine('star', d)];
    },
  },
  meteor: {
    tree: 'star', name: 'Treat Meteor', row: 5, col: 1, pre: ['moonbeam', 'constellation'], wep: 'staff', kind: 'active', element: 'zap',
    cost: l => r1(40 + 1 * (l - 1)), cd: () => 7,
    desc: 'Whistle at the sky. A colossal bone-biscuit meteor answers, trailing fire and crumbs, and leaves a very large crater.',
    syn: [{ id: 'kibble', p: 5 }, { id: 'moonbeam', p: 4 }],
    params(l, d) {
      const m = M('meteor', 'star', d);
      return { dmgPct: lin(420, 44)(l) * m, radius: r2(3.4 + 0.05 * l), delay: 1.0, stun: 1.0, knockback: 2.2, burnPct: lin(30, 4)(l) * m, burnDuration: 3, range: 14 };
    },
    info(l, d) {
      const p = DEFS.meteor.params(l, d);
      return [`Impact: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m + stun`, `Toasty crumbs: ${pct(p.burnPct)} fire per second for ${p.burnDuration}s`, costLine(DEFS.meteor, l), ...synLine('meteor', d), ...mastLine('star', d)];
    },
  },

  // =================================================================== DUCK HUNT
  duckDecoy: {
    tree: 'duck', name: 'Decoy Duck', row: 0, col: 1, pre: [], wep: null, kind: 'summon', element: 'phys',
    cost: l => r1(10 + 0.5 * (l - 1)), cd: l => r1(Math.max(3, 7 - 0.2 * l)),
    desc: 'Wind up a rubber duck and let it waddle off. Every foe nearby simply MUST bite it. When it pops: confetti, and ouch.',
    syn: [{ id: 'duckCall', p: 5 }, { id: 'mallards', p: 3 }],
    params(l, d) {
      return { life: Math.round((((d && d.lifeMax) || 60) * 0.5 + 12 * l) * sLife(d)), duration: r1(8 + 0.4 * l), lureRadius: r1(6 + 0.1 * l), quack: 1.6, slow: 0.25, dmgPct: lin(90, 12)(l) * syn('duckDecoy', d) * sDmg(d), popRadius: 2.4, maxDecoys: 1 + Math.floor(l / 8), range: 9 };
    },
    info(l, d) {
      const p = DEFS.duckDecoy.params(l, d);
      return [`Lures foes within ${p.lureRadius} m`, `Duck life: ${p.life} · lasts ${p.duration}s`, `Pop: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.popRadius} m`, `Max ducks: ${p.maxDecoys}`, costLine(DEFS.duckDecoy, l), ...synLine('duckDecoy', d)];
    },
  },
  retriever: {
    tree: 'duck', name: "Retriever's Instinct", row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'A retriever never loses anything — not a duck, not a sock, not a single coin. Passive — stronger summons and better loot.',
    syn: [],
    params(l) { return { summonDmg: 15 + 6 * (l - 1), summonLife: 15 + 6 * (l - 1), mf: Math.round(dim(l, 90, 10)) }; },
    info(l) { const p = DEFS.retriever.params(l); return [`+${p.summonDmg}% summon damage`, `+${p.summonLife}% summon life`, `+${p.mf}% magic find`]; },
  },
  fetchLeash: {
    tree: 'duck', name: 'Fetch!', row: 1, col: 2, pre: ['duckDecoy'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: l => r1(Math.max(1, 4 - 0.12 * l)),
    desc: 'Lasso a foe with a glowing leash and yank it right to your paws, dizzy. Also fetches loot that is too far away. Good girl!',
    syn: [{ id: 'duckDecoy', p: 4 }, { id: 'duckCall', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(90, 11)(l) * syn('fetchLeash', d), range: r1(9 + 0.2 * l), stun: r2(1 + 0.05 * l), lootRange: 14 };
    },
    info(l, d) {
      const p = DEFS.fetchLeash.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Range ${p.range} m · stun ${p.stun}s`, 'Bosses are too heavy to yank (they are only stunned)', costLine(DEFS.fetchLeash, l), ...synLine('fetchLeash', d)];
    },
  },
  feathers: {
    tree: 'duck', name: 'Feather Flurry', row: 2, col: 1, pre: ['duckDecoy'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(7 + 0.35 * (l - 1)), cd: () => 0,
    desc: 'A fan of glowing duck feathers bursts from your staff and pierces the front row. Much fluffier than it has any right to be.',
    syn: [{ id: 'fetchLeash', p: 4 }, { id: 'mallards', p: 4 }],
    params(l, d) {
      return { count: Math.min(12, 5 + Math.floor(l / 2)), spread: Math.min(80, 50 + 1.5 * l), dmgPct: lin(55, 6)(l) * syn('feathers', d), speed: 17, range: r1(7 + 0.1 * l), pierce: 1 };
    },
    info(l, d) {
      const p = DEFS.feathers.params(l, d);
      return [`Feathers: ${p.count} in a ${Math.round(p.spread)}° fan`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Each pierces ${p.pierce} foe`, costLine(DEFS.feathers, l), ...synLine('feathers', d)];
    },
  },
  duckCall: {
    tree: 'duck', name: 'Duck Call', row: 3, col: 0, pre: ['retriever'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(14 + 0.5 * (l - 1)), cd: l => r1(Math.max(3.5, 8 - 0.2 * l)),
    desc: 'Toot a duck call. Every foe in range hears "free snacks!", gets dragged to the lure and stands there, dazed and confused.',
    syn: [{ id: 'duckDecoy', p: 5 }, { id: 'fetchLeash', p: 3 }],
    params(l, d) {
      return { radius: r1(5 + 0.1 * l), pullTime: 0.55, stun: r2(1.1 + 0.05 * l), dmgPct: lin(60, 8)(l) * syn('duckCall', d), range: 12 };
    },
    info(l, d) {
      const p = DEFS.duckCall.params(l, d);
      return [`Drags foes within ${p.radius} m to the lure`, `Daze: ${p.stun}s · damage ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, costLine(DEFS.duckCall, l), ...synLine('duckCall', d)];
    },
  },
  spiritRetriever: {
    tree: 'duck', name: 'Spirit Retriever', row: 4, col: 2, pre: ['feathers'], wep: null, kind: 'summon', element: 'phys',
    cost: l => r1(22 + 1 * (l - 1)), cd: () => 3,
    desc: 'A spectral golden retriever bounds down from the stars to fight beside you. Unbelievably good. Stays until it is knocked out.',
    syn: [{ id: 'duckDecoy', p: 3 }, { id: 'fetchLeash', p: 3 }],
    params(l, d) {
      return { life: Math.round(((d && d.lifeMax) || 60) * (0.7 + 0.07 * l) * sLife(d)), dmgPct: lin(90, 11)(l) * syn('spiritRetriever', d) * sDmg(d), speed: 6.5, biteCd: 0.75, barkEvery: 5, barkStun: 0.6, barkRadius: 2.6 };
    },
    info(l, d) {
      const p = DEFS.spiritRetriever.params(l, d);
      return [`Bite: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Life: ${p.life}`, `A dazing bark every ${p.barkEvery}s`, costLine(DEFS.spiritRetriever, l), ...synLine('spiritRetriever', d)];
    },
  },
  mallards: {
    tree: 'duck', name: 'Mallard Squadron', row: 5, col: 1, pre: ['duckCall', 'spiritRetriever'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(36 + 1 * (l - 1)), cd: () => 8,
    desc: 'Whistle up a V of spectral mallards. They swoop in over your head, then dive-bomb the target area in a glorious feathery barrage.',
    syn: [{ id: 'feathers', p: 5 }, { id: 'duckDecoy', p: 4 }],
    params(l, d) {
      return { count: 5 + Math.floor(l / 4), dmgPct: lin(170, 19)(l) * syn('mallards', d) * sDmg(d), impactRadius: r2(1.6 + 0.02 * l), area: r2(3.8 + 0.05 * l), range: 14, stun: 0.3 };
    },
    info(l, d) {
      const p = DEFS.mallards.params(l, d);
      return [`Mallards: ${p.count}`, `Dive damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.impactRadius} m`, `Area: ${p.area} m`, costLine(DEFS.mallards, l), ...synLine('mallards', d)];
    },
  },
};

for (const id in DEFS) {
  const d = DEFS[id];
  for (const k of ['info', 'params', 'cost', 'cd']) { const fn = d[k]; d[k] = (...a) => fn.apply(d, a); }
  d.id = id; d.cls = 'moka'; d.req = ROW_REQ[d.row]; d.pre = d.pre || []; d.syn = d.syn || [];
}

/** Skill definitions. Format: see skills.js DEFS. */
export const MOKA_SKILLS = DEFS;

/**
 * Passive / mastery effects for Moka's trees, applied inside computeStats() after the base derived stats are known
 * (call it after zoomRegen / crit / mf are set, i.e. just before computeStats returns).
 * d = derived (mutable), L = id => effective skill level.
 * Sets: d.treeDmgPct = {tide, star, duck} (% bonus the tree's params() read), d.zoomRegen (×), d.crit (+, cap 75),
 * d.summonDmg / d.summonLife (%, read by the summon params()), d.mf (+).
 */
export function mokaPassives(d, L) {
  const lv = id => (L && L(id)) || 0;
  d.treeDmgPct = { tide: 0, star: 0, duck: 0 };
  d.summonDmg = d.summonDmg || 0; d.summonLife = d.summonLife || 0;
  if (lv('tideMastery') > 0) {
    const p = DEFS.tideMastery.params(lv('tideMastery'));
    d.treeDmgPct.tide += p.dmgPct;
    d.zoomRegen = r2((d.zoomRegen || 0) * (1 + p.zoomRegen / 100));
  }
  if (lv('starMastery') > 0) {
    const p = DEFS.starMastery.params(lv('starMastery'));
    d.treeDmgPct.star += p.dmgPct;
    d.crit = r1(Math.min(75, (d.crit || 0) + p.crit));
  }
  if (lv('retriever') > 0) {
    const p = DEFS.retriever.params(lv('retriever'));
    d.summonDmg += p.summonDmg; d.summonLife += p.summonLife;
    d.mf = (d.mf || 0) + p.mf;
  }
}
