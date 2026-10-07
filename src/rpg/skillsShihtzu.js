// The Shih Tzu dark knight's skill trees (docs/SHIHTZU.md): the same Diablo-2 framework as skills.js / skillsMoka.js /
// skillsPoe.js: rows 0-5 gated by ROW_REQ, prerequisites, hard-point synergies (inside each tree), r5 ultimates.
// skills.js merges SHIHTZU_SKILLS into SKILLS (ids must not clash) and SHIHTZU_TREES into TREES; stats.js calls
// shihtzuPassives().
//
// Units as in skills.js: metres, m/s, seconds, dmgPct = % of his rolled flail damage with synergies ALREADY folded in.
// His damage stats (stats.js + shihtzuPassives):
//  - the toy flail scales with Strength (+1% per point, classes.js dmgStat): Flail Arts and his swings;
//  - the dark arts (Gloom Hexes and the Ghostlight Tome) swap Strength's share for Energy's: every hex and tome spell
//    multiplies by derived.hexMul = (100 + %dmg + Energy) / (100 + %dmg + Strength), like Poe's jutsuMul;
//  - Weight of the World and Lingering Gloom add a per-tree bonus (derived.treeDmgPct.flail / .hex); Very Good Ghosts
//    makes the summons hit harder (derived.treeDmgPct.tome counts for the pups and Grandpaw);
//  - hexes are damage over time in the new 'gloom' element (stats.js ELEMENTS): stacks on a foe, each stack ticking
//    its own dps (combat/shihtzuSkills.js hexes), capped at derived.hexStacks (3, Grudge Ledger raises it).
// Tanky: the most life of the four (classes.js), a class damage reduction (derived.dmgReduce, %; Iron Topknot adds more),
// the Gloom Blanket (each hexed foe near him takes a little more off every hit: combat/shihtzuSkills.js shihtzuGuard),
// Steadfast Sulk's guard, Bone Ward's barrier and the Wayhome Lantern's rekindle. A little slow on his paws.
// No `this` is used below, so the defs also work when destructured (they are bound here and again by skills.js).

export const SHIHTZU_TREES = [
  { id: 'flail', cls: 'shihtzu', name: 'Flail Arts', sub: 'Toy Flail', color: '#e8dcec', accent: '#7a4a7a', desc: 'Heavy swings, the overhead whirl, the tug and the slam. Strength makes them hit harder.' },
  { id: 'hex', cls: 'shihtzu', name: 'Gloom Hexes', sub: 'Any weapon', color: '#dcf6ee', accent: '#2f9a86', desc: 'Dripping paw curses, grumpy clouds and the mopes: gloom that lingers. Energy makes them hit harder.' },
  { id: 'tome', cls: 'shihtzu', name: 'Ghostlight Tome', sub: 'Any weapon', color: '#eaf2f6', accent: '#5a7a9a', desc: 'His spell-tome: friendly ghost pups, borrowed warmth, a ward of bones and a lantern home.' },
];

const ROW_REQ = [1, 6, 12, 18, 24, 30]; // (same gates as skills.js)
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const pct = v => Math.round(v) + '%';
const dim = (lvl, max, half) => (lvl <= 0 ? 0 : (max * lvl) / (lvl + half));
const lin = (a, b) => l => a + b * (l - 1);
const syn = (id, d) => (d && d.synergy && d.synergy[id]) || 1;
/** per-tree mastery multiplier (Weight of the World / Lingering Gloom / Very Good Ghosts) */
const tree = (t, d) => 1 + ((d && d.treeDmgPct && d.treeDmgPct[t]) || 0) / 100;
/** the dark arts: Energy instead of Strength (see the header) */
const hmul = d => (d && d.hexMul) || 1;
const F = (id, d) => syn(id, d) * tree('flail', d);
const H = (id, d) => syn(id, d) * tree('hex', d) * hmul(d);
const T = (id, d) => syn(id, d) * tree('tome', d) * hmul(d);
/** hex durations: Lingering Gloom stretches them (derived.hexDur, %) */
const hdur = (s, d) => r1(s * (1 + ((d && d.hexDur) || 0) / 100));
function dmgRange(pctV, d) {
  if (!d || d.dmgMin == null) return '';
  const a = Math.max(1, Math.round((d.dmgMin * pctV) / 100)), b = Math.max(a, Math.round((d.dmgMax * pctV) / 100));
  return ` (${a}–${b})`;
}
function synLine(id, d) { const m = syn(id, d); return m > 1.001 ? [`Synergy bonus: +${Math.round((m - 1) * 100)}%`] : []; }
function mastLine(t, d) { const v = d && d.treeDmgPct && d.treeDmgPct[t]; return v > 0 ? [`Mastery bonus: +${Math.round(v)}%`] : []; }
function enerLine(d) { const m = hmul(d); return Math.abs(m - 1) > 0.005 ? [`Energy instead of Strength: ×${r2(m)}`] : []; }
const cut = (def, l, d) => { const c = def.cost(l), k = d && d.treeCostCut && d.treeCostCut[def.tree]; return k ? r1(c * (1 - k / 100)) : c; };
const costLine = (def, l, d, per = '') => `Zoom cost: ${cut(def, l, d)}${per}${def.cd(l) ? ` · Cooldown: ${def.cd(l)}s` : ''}`;
const stackCap = d => (d && d.hexStacks) || 3;

const DEFS = {
  // =================================================================== FLAIL ARTS (Strength)
  woefulWallop: {
    tree: 'flail', name: 'Woeful Wallop', row: 0, col: 1, pre: [], wep: 'flail', kind: 'active', element: 'phys',
    cost: l => r1(3.5 + 0.17 * (l - 1)), cd: () => 0,
    desc: 'Wind the toy flail all the way back, sigh deeply, and wallop. The ball sweeps a wide arc in front of you and sends everything in it tumbling. He means every one.',
    syn: [{ id: 'weightOfWorld', p: 3 }, { id: 'maelstrom', p: 3 }],
    params(l, d) {
      return { dmgPct: lin(140, 15)(l) * F('woefulWallop', d), arc: Math.min(220, 160 + 3 * l), radius: 2.3, knockback: 0.9 };
    },
    info(l, d) {
      const p = DEFS.woefulWallop.params(l, d);
      return [`Damage: ${pct(p.dmgPct)} weapon damage${dmgRange(p.dmgPct, d)}`, `Arc: ${p.arc}° · reach ${p.radius} m`, 'Knocks foes back', costLine(DEFS.woefulWallop, l, d), ...synLine('woefulWallop', d), ...mastLine('flail', d)];
    },
  },
  weightOfWorld: {
    tree: 'flail', name: 'Weight of the World', row: 1, col: 0, pre: [], wep: 'flail', kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'He carries the weight of the world on his shoulders. Also a very heavy chew toy. Passive — Flail Arts and your flail swings hit harder and crit more.',
    syn: [],
    params(l) { return { dmgPct: 25 + 9 * (l - 1), crit: r1(1.5 + 0.4 * (l - 1)) }; },
    info(l) { const p = DEFS.weightOfWorld.params(l); return [`+${p.dmgPct}% Flail Arts and flail swing damage`, `+${p.crit}% critical chance`]; },
  },
  tugOfWoe: {
    tree: 'flail', name: 'Tug of Woe', row: 1, col: 2, pre: ['woefulWallop'], wep: 'flail', kind: 'active', element: 'phys',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: l => r1(Math.max(1, 3 - 0.08 * l)),
    desc: 'Every dog loves a game of tug. Fling the ball out on its rope: it wraps round the first foe it meets and hauls it (and its friends) right up to you, a little dizzy.',
    syn: [{ id: 'woefulWallop', p: 5 }, { id: 'steadfastSulk', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(90, 11)(l) * F('tugOfWoe', d), range: r1(8 + 0.15 * l), grabRadius: 1.6, extra: Math.min(5, 2 + Math.floor(l / 5)), daze: r2(0.6 + 0.03 * l), speed: 18 };
    },
    info(l, d) {
      const p = DEFS.tugOfWoe.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Reaches ${p.range} m · hauls in the foe and up to ${p.extra} more beside it`, `Dazed for ${p.daze}s (bosses only flinch)`, costLine(DEFS.tugOfWoe, l, d), ...synLine('tugOfWoe', d), ...mastLine('flail', d)];
    },
  },
  maelstrom: {
    tree: 'flail', name: 'Melancholy Maelstrom', row: 2, col: 1, pre: ['woefulWallop'], wep: 'flail', kind: 'channel', element: 'phys',
    cost: l => r1(7 + 0.35 * (l - 1)), cd: () => 0,
    desc: 'Hold to whirl the flail round and round over your head, very solemnly. The ball hums, the gloom swirls, and every foe nearby is dragged in to be bonked.',
    syn: [{ id: 'woefulWallop', p: 5 }, { id: 'heaviestSigh', p: 5 }],
    params(l, d) {
      return { dmgPct: lin(48, 6)(l) * F('maelstrom', d), hitsPerSec: 3, radius: r2(2.2 + 0.03 * l), pull: r1(1.3 + 0.03 * l), moveMul: 0.6, knockback: 0.15 };
    },
    info(l, d) {
      const p = DEFS.maelstrom.params(l, d);
      return [`Damage per hit: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Hits ${p.hitsPerSec}× per second in ${p.radius} m and pulls foes in`, 'You can walk (slowly) while it whirls', costLine(DEFS.maelstrom, l, d, ' per second'), ...synLine('maelstrom', d), ...mastLine('flail', d)];
    },
  },
  ironTopknot: {
    tree: 'flail', name: 'Iron Topknot', row: 3, col: 0, pre: ['weightOfWorld'], wep: null, kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'Nothing disturbs the topknot. Not wind, not yokai, not bath time. Passive — more life, and every hit you take is a little softer.',
    syn: [],
    params(l) { return { lifePct: Math.round(8 + dim(l, 32, 10)), dmgReduce: r1(3 + dim(l, 12, 10)) }; },
    info(l) { const p = DEFS.ironTopknot.params(l); return [`+${p.lifePct}% maximum life`, `Takes ${p.dmgReduce}% less damage`]; },
  },
  steadfastSulk: {
    tree: 'flail', name: 'Steadfast Sulk', row: 4, col: 2, pre: ['tugOfWoe'], wep: 'flail', kind: 'active', element: 'phys',
    cost: l => r1(8 + 0.35 * (l - 1)), cd: l => r1(Math.max(2, 5 - 0.12 * l)),
    desc: 'Plant your paws and sulk behind the flail. Blows mostly bounce off the gloom. When the sulk is over, the flail comes round in a great spin — harder for every blow you took.',
    syn: [{ id: 'woefulWallop', p: 4 }, { id: 'ironTopknot', p: 6 }],
    params(l, d) {
      return { guard: r2(1 + 0.02 * l), block: Math.round(55 + dim(l, 25, 10)), dmgPct: lin(150, 16)(l) * F('steadfastSulk', d), perBlow: 25, maxBlows: 4, radius: 2.5, knockback: 1.1 };
    },
    info(l, d) {
      const p = DEFS.steadfastSulk.params(l, d);
      return [`Guard for ${p.guard}s: hits are ${p.block}% softer`, `Then a spin: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m, +${p.perBlow}% per blow taken (up to ${p.maxBlows})`, costLine(DEFS.steadfastSulk, l, d), ...synLine('steadfastSulk', d), ...mastLine('flail', d)];
    },
  },
  heaviestSigh: {
    tree: 'flail', name: 'The Heaviest Sigh', row: 5, col: 1, pre: ['maelstrom', 'steadfastSulk'], wep: 'flail', kind: 'active', element: 'phys',
    cost: l => r1(30 + 1 * (l - 1)), cd: () => 7,
    desc: 'The heaviest sigh in the world, and the flail comes down with it. The ground cracks in the shape of a bone, and three shockwaves roll out, stunning everything they pass.',
    syn: [{ id: 'woefulWallop', p: 5 }, { id: 'maelstrom', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(170, 18)(l) * F('heaviestSigh', d), rings: 3, radius: r2(5 + 0.05 * l), stun: r2(0.9 + 0.03 * l), knockback: 1.4, leap: 3 };
    },
    info(l, d) {
      const p = DEFS.heaviestSigh.params(l, d);
      return [`Damage per shockwave: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `${p.rings} shockwaves out to ${p.radius} m · stun ${p.stun}s`, costLine(DEFS.heaviestSigh, l, d), ...synLine('heaviestSigh', d), ...mastLine('flail', d)];
    },
  },

  // =================================================================== GLOOM HEXES (Energy; damage over time)
  drippingPaw: {
    tree: 'hex', name: 'Dripping Paw', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'gloom',
    cost: l => r1(4 + 0.2 * (l - 1)), cd: () => 0,
    desc: 'Flick a paw print of ghostlight at a foe. It splats, and it drips gloom on everyone it splashed: a hex that stings every half second. Hex the same foe again and it stings harder.',
    syn: [{ id: 'grumbleCloud', p: 4 }, { id: 'mournfulAwoo', p: 4 }],
    params(l, d) {
      const m = H('drippingPaw', d);
      return { dmgPct: lin(35, 4)(l) * m, dotPct: lin(27, 3)(l) * m, duration: hdur(5, d), radius: 1.6, stacks: stackCap(d), speed: 14, range: 11 };
    },
    info(l, d) {
      const p = DEFS.drippingPaw.params(l, d);
      return [`Splat: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} gloom in ${p.radius} m`, `Hex: ${pct(p.dotPct)} gloom per second for ${p.duration}s`, `Stacks up to ${p.stacks}× on a foe`, costLine(DEFS.drippingPaw, l, d), ...synLine('drippingPaw', d), ...mastLine('hex', d), ...enerLine(d)];
    },
  },
  lingeringGloom: {
    tree: 'hex', name: 'Lingering Gloom', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'gloom',
    cost: () => 0, cd: () => 0,
    desc: 'Gloom, once spread, likes to stay a while. Possibly for tea. Passive — Gloom Hexes hit harder and last longer.',
    syn: [],
    params(l) { return { dmgPct: Math.round(28 + 9.5 * (l - 1)), duration: Math.round(dim(l, 60, 10)) }; },
    info(l) { const p = DEFS.lingeringGloom.params(l); return [`+${p.dmgPct}% Gloom Hexes damage`, `Hexes last ${p.duration}% longer`]; },
  },
  grumbleCloud: {
    tree: 'hex', name: 'Grumble Cloud', row: 1, col: 2, pre: ['drippingPaw'], wep: null, kind: 'active', element: 'gloom',
    cost: l => r1(9 + 0.4 * (l - 1)), cd: () => 1.5,
    desc: 'A small, very grumpy storm cloud drifts over and parks itself on the spot. It rains gloom on everyone underneath, who all slow down to sulk about it.',
    syn: [{ id: 'drippingPaw', p: 4 }, { id: 'everlastingGloom', p: 3 }],
    params(l, d) {
      return { dmgPct: lin(26, 3.3)(l) * H('grumbleCloud', d), tick: 0.5, radius: r2(2 + 0.03 * l), duration: r1(6 + 0.1 * l), slow: r2(0.25 + dim(l, 0.15, 10)), maxClouds: 1 + Math.floor(l / 10), range: 12 };
    },
    info(l, d) {
      const p = DEFS.grumbleCloud.params(l, d);
      return [`Gloom rain: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} every ${p.tick}s in ${p.radius} m`, `Slows ${Math.round(p.slow * 100)}% · lasts ${p.duration}s · up to ${p.maxClouds} at once`, costLine(DEFS.grumbleCloud, l, d), ...synLine('grumbleCloud', d), ...mastLine('hex', d), ...enerLine(d)];
    },
  },
  caseOfMopes: {
    tree: 'hex', name: 'Case of the Mopes', row: 2, col: 1, pre: ['drippingPaw'], wep: null, kind: 'active', element: 'gloom',
    cost: l => r1(10 + 0.4 * (l - 1)), cd: () => 2,
    desc: 'A sigh of gloom settles over a crowd and gives every foe in it a terrible case of the mopes: they slump, shuffle, hit softer and take more from everyone.',
    syn: [],
    params(l) { return { radius: r2(3 + 0.05 * l), duration: r1(6 + 0.15 * l), weaken: Math.round(25 + dim(l, 20, 10)), slow: 0.3, vuln: r1(10 + 0.6 * l), range: 12 }; },
    info(l, d) {
      const p = DEFS.caseOfMopes.params(l, d);
      return [`Foes within ${p.radius} m mope for ${p.duration}s:`, `they deal ${p.weaken}% less damage and move ${Math.round(p.slow * 100)}% slower`, `and take ${p.vuln}% more damage`, costLine(DEFS.caseOfMopes, l, d)];
    },
  },
  grudgeLedger: {
    tree: 'hex', name: 'Grudge Ledger', row: 3, col: 0, pre: ['lingeringGloom'], wep: null, kind: 'passive', element: 'gloom',
    cost: () => 0, cd: () => 0,
    desc: 'He writes every slight down in the tome. Alphabetically. Passive — hexes stack higher on a foe, and each stack stings a little more.',
    syn: [],
    params(l) { return { stacks: 1 + Math.floor(l / 10), stackPct: Math.round(dim(l, 40, 10)) }; },
    info(l) { const p = DEFS.grudgeLedger.params(l); return [`Hexes stack ${p.stacks} higher`, `+${p.stackPct}% hex damage`]; },
  },
  mournfulAwoo: {
    tree: 'hex', name: 'Mournful Awoo', row: 4, col: 2, pre: ['grumbleCloud'], wep: null, kind: 'active', element: 'gloom',
    cost: l => r1(14 + 0.6 * (l - 1)), cd: () => 3,
    desc: 'Throw back your head and let out a long, mournful awoo. It stings every foe who hears it, and every hex nearby spreads to everyone in earshot.',
    syn: [{ id: 'drippingPaw', p: 5 }, { id: 'grumbleCloud', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(50, 6)(l) * H('mournfulAwoo', d), radius: r1(6 + 0.1 * l), spread: 1 + Math.floor(l / 8), fear: 0.6 };
    },
    info(l, d) {
      const p = DEFS.mournfulAwoo.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} gloom in ${p.radius} m`, `Spreads ${p.spread} stack${p.spread > 1 ? 's' : ''} of every hex to every foe in earshot`, costLine(DEFS.mournfulAwoo, l, d), ...synLine('mournfulAwoo', d), ...mastLine('hex', d), ...enerLine(d)];
    },
  },
  everlastingGloom: {
    tree: 'hex', name: 'Everlasting Gloom', row: 5, col: 1, pre: ['caseOfMopes', 'mournfulAwoo'], wep: null, kind: 'active', element: 'gloom',
    cost: l => r1(32 + 1 * (l - 1)), cd: () => 6,
    desc: 'The gloom goes on. A great ghostlight hex falls over the crowd; when a hexed foe drops, it bursts in a puff of gloom and the hex jumps to the next.',
    syn: [{ id: 'drippingPaw', p: 3 }, { id: 'caseOfMopes', p: 4 }],
    params(l, d) {
      const m = H('everlastingGloom', d);
      return { dotPct: lin(45, 5)(l) * m, duration: hdur(8, d), radius: 3.5, burstPct: lin(120, 12)(l) * m, burstRadius: 2.4, jumps: 3 + Math.floor(l / 4), jumpRange: 7, range: 12 };
    },
    info(l, d) {
      const p = DEFS.everlastingGloom.params(l, d);
      return [`Hex: ${pct(p.dotPct)}${dmgRange(p.dotPct, d)} gloom per second for ${p.duration}s in ${p.radius} m`, `A hexed foe bursts when it drops: ${pct(p.burstPct)} in ${p.burstRadius} m`, `The hex jumps on up to ${p.jumps} times`, costLine(DEFS.everlastingGloom, l, d), ...synLine('everlastingGloom', d), ...mastLine('hex', d), ...enerLine(d)];
    },
  },

  // =================================================================== GHOSTLIGHT TOME (Energy; summons and sustain)
  ghostPups: {
    tree: 'tome', name: 'Ghost Pups', row: 0, col: 1, pre: [], wep: null, kind: 'summon', element: 'gloom',
    cost: l => r1(10 + 0.5 * (l - 1)), cd: () => 1,
    desc: 'Read a page aloud and friendly ghost pups tumble out of the tome, ears flopping. They follow you about and nip at foes; a nip on a hexed foe keeps its hex going.',
    syn: [{ id: 'borrowedWarmth', p: 4 }, { id: 'grandpawsGhost', p: 4 }],
    params(l, d) {
      const v = (d && d.pupBonus) || {};
      return { pups: Math.min(6, 2 + Math.floor(l / 6) + (v.extra || 0)), nipPct: lin(26, 3)(l) * T('ghostPups', d), nipEvery: 0.8, lifePct: Math.round((20 + 2 * l) * (1 + (v.life || 0) / 100)), duration: r1(30 + l) };
    },
    info(l, d) {
      const p = DEFS.ghostPups.params(l, d);
      return [`Ghost pups: ${p.pups} · last ${p.duration}s`, `Nips: ${pct(p.nipPct)}${dmgRange(p.nipPct, d)} gloom every ${p.nipEvery}s`, `Pup life: ${p.lifePct}% of yours`, costLine(DEFS.ghostPups, l, d), ...synLine('ghostPups', d), ...mastLine('tome', d), ...enerLine(d)];
    },
  },
  veryGoodGhosts: {
    tree: 'tome', name: 'Very Good Ghosts', row: 1, col: 0, pre: [], wep: null, kind: 'passive', element: 'gloom',
    cost: () => 0, cd: () => 0,
    desc: 'They are all very good ghosts. Yes they are. Passive — your ghost pups and Grandpaw hit harder and are tougher, and more pups come when called.',
    syn: [],
    params(l) { return { dmgPct: 25 + 8 * (l - 1), lifePct: 20 + 6 * (l - 1), extra: Math.floor(l / 10) }; },
    info(l) { const p = DEFS.veryGoodGhosts.params(l); return [`+${p.dmgPct}% Ghostlight Tome damage`, `+${p.lifePct}% ghost life`, ...(p.extra ? [`+${p.extra} ghost pup${p.extra > 1 ? 's' : ''}`] : [])]; },
  },
  borrowedWarmth: {
    tree: 'tome', name: 'Borrowed Warmth', row: 1, col: 2, pre: ['ghostPups'], wep: null, kind: 'active', element: 'gloom',
    cost: l => r1(8 + 0.35 * (l - 1)), cd: () => 2.5,
    desc: 'A thread of ghostlight ties a foe to you, and you borrow a little of its warmth. You do not intend to give it back.',
    syn: [{ id: 'ghostPups', p: 4 }, { id: 'wayhomeLantern', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(22, 3)(l) * T('borrowedWarmth', d), tick: 0.5, duration: 4, tethers: Math.min(4, 1 + Math.floor(l / 6)), heal: 35, range: 8, snap: 10 };
    },
    info(l, d) {
      const p = DEFS.borrowedWarmth.params(l, d);
      return [`Tethers ${p.tethers} foe${p.tethers > 1 ? 's' : ''} within ${p.range} m for ${p.duration}s`, `Drains ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} gloom every ${p.tick}s; heals you ${p.heal}% of it`, costLine(DEFS.borrowedWarmth, l, d), ...synLine('borrowedWarmth', d), ...mastLine('tome', d), ...enerLine(d)];
    },
  },
  boneWard: {
    tree: 'tome', name: 'Bone Ward', row: 2, col: 1, pre: ['ghostPups'], wep: null, kind: 'active', element: 'gloom',
    cost: l => r1(12 + 0.5 * (l - 1)), cd: () => 6,
    desc: 'Six spectral chew-bones rise from the tome and circle you, catching blows. When the ward breaks they fly off at the nearest foes. (They are dog bones. Very good ones.)',
    syn: [{ id: 'ghostPups', p: 3 }, { id: 'veryGoodGhosts', p: 4 }],
    params(l, d) {
      return { absorbPct: r1(12 + 1.2 * l), duration: 10, bones: 6, dmgPct: lin(70, 8)(l) * T('boneWard', d), radius: 1.1 };
    },
    info(l, d) {
      const p = DEFS.boneWard.params(l, d);
      const life = d && d.lifeMax ? ` (${Math.round(d.lifeMax * p.absorbPct / 100)})` : '';
      return [`Absorbs ${p.absorbPct}% of your life${life} in damage for ${p.duration}s`, `When it breaks: ${p.bones} bones fly at foes, ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} each`, costLine(DEFS.boneWard, l, d), ...synLine('boneWard', d), ...mastLine('tome', d), ...enerLine(d)];
    },
  },
  midnightReading: {
    tree: 'tome', name: 'Midnight Reading', row: 3, col: 0, pre: ['veryGoodGhosts'], wep: null, kind: 'passive', element: 'gloom',
    cost: () => 0, cd: () => 0,
    desc: 'He reads by ghostlight until very late, and remembers all of it. Passive — zoom comes back faster, and the dark arts cost less.',
    syn: [],
    params(l) { return { zoomRegen: Math.round(15 + dim(l, 60, 10)), costCut: Math.round(dim(l, 30, 8)) }; },
    info(l) { const p = DEFS.midnightReading.params(l); return [`+${p.zoomRegen}% zoom regeneration`, `Gloom Hexes and Ghostlight Tome cost ${p.costCut}% less zoom`]; },
  },
  wayhomeLantern: {
    tree: 'tome', name: 'Wayhome Lantern', row: 4, col: 2, pre: ['borrowedWarmth'], wep: null, kind: 'active', element: 'gloom',
    cost: l => r1(16 + 0.6 * (l - 1)), cd: l => r1(Math.max(10, 20 - 0.4 * l)),
    desc: 'Set down a ghostlight lantern, the kind he tends for lost pups. In its light you and your ghosts mend; foes in it feel gloomy. And if you fall while it burns, it lights you home again.',
    syn: [{ id: 'borrowedWarmth', p: 4 }, { id: 'boneWard', p: 3 }],
    params(l, d) {
      return { duration: 12, radius: 5, regen: r1(2 + 0.1 * l), dmgPct: lin(20, 2.5)(l) * T('wayhomeLantern', d), rekindle: Math.min(70, 35 + l), range: 6 };
    },
    info(l, d) {
      const p = DEFS.wayhomeLantern.params(l, d);
      return [`Lasts ${p.duration}s · ${p.radius} m of light`, `You and your ghosts regenerate ${p.regen}% life per second in it`, `Foes in it take ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} gloom per second`, `A fatal blow while it burns: you're rekindled at ${p.rekindle}% life (once)`, costLine(DEFS.wayhomeLantern, l, d), ...synLine('wayhomeLantern', d), ...mastLine('tome', d), ...enerLine(d)];
    },
  },
  grandpawsGhost: {
    tree: 'tome', name: "Grandpaw's Ghost", row: 5, col: 1, pre: ['boneWard', 'wayhomeLantern'], wep: null, kind: 'summon', element: 'gloom',
    cost: l => r1(35 + 1 * (l - 1)), cd: () => 20,
    desc: 'Open the tome to the very last page. Grandpaw rises out of it: an enormous, ancient, extremely fluffy ghost Shih Tzu, who stomps, howls hexes over the crowd, and licks your face.',
    syn: [{ id: 'ghostPups', p: 5 }, { id: 'veryGoodGhosts', p: 4 }],
    params(l, d) {
      const m = T('grandpawsGhost', d);
      return { duration: r1(15 + 0.25 * l), dmgPct: lin(130, 14)(l) * m, stompEvery: 1.5, radius: 2.8, howlEvery: 5, howlRadius: 6, hexPct: lin(40, 5)(l) * m, hexDur: hdur(5, d), lifePct: 150 + 10 * l };
    },
    info(l, d) {
      const p = DEFS.grandpawsGhost.params(l, d);
      return [`Grandpaw stays ${p.duration}s`, `Stomps every ${p.stompEvery}s: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} gloom in ${p.radius} m`, `Howls every ${p.howlEvery}s: a hex on every foe in ${p.howlRadius} m (${pct(p.hexPct)} gloom per second, ${p.hexDur}s)`, costLine(DEFS.grandpawsGhost, l, d), ...synLine('grandpawsGhost', d), ...mastLine('tome', d), ...enerLine(d)];
    },
  },
};

/** Skills whose real cast isn't built yet: greyed in the K panel ("In training"), can't be learned (skills.js canLearn)
 *  or cast (usable). Each one leaves this list as its move, effects and sound land (docs/SHIHTZU.md §3). */
export const SHIHTZU_TRAINING = new Set(); // (all 21 are built: H-4 checkpoint 2)

for (const id in DEFS) {
  const d = DEFS[id];
  for (const k of ['info', 'params', 'cost', 'cd']) { const fn = d[k]; d[k] = (...a) => fn.apply(d, a); }
  d.id = id; d.cls = 'shihtzu'; d.req = ROW_REQ[d.row]; d.pre = d.pre || []; d.syn = d.syn || [];
  Object.defineProperty(d, 'training', { get: () => SHIHTZU_TRAINING.has(id), enumerable: true });
}

/** Skill definitions. Format: see skills.js DEFS. */
export const SHIHTZU_SKILLS = DEFS;

/** The class's own damage reduction (classes.js `dr`, %) plus Iron Topknot's, capped. */
export const DR_CAP = 40;
/** The Gloom Blanket: each hexed foe within BLANKET.r m takes BLANKET.per % off his damage taken, up to BLANKET.max foes. */
export const BLANKET = { r: 5, per: 2, max: 5 };

const diminish = (v, k) => (v > 0 ? (k * v) / (k + v) : v);
/**
 * Passive / mastery effects for the Shih Tzu's trees, applied at the end of computeStats() (after the life, zoom, crit
 * and the weapon damage are known). d = derived (mutable), L = id => effective skill level, CL = his class (classes.js).
 * Sets: d.treeDmgPct = {flail, hex, tome}, d.treeCostCut = {hex, tome}, d.hexMul (Energy for the dark arts), d.hexDur
 * (%), d.hexStacks, d.dmgReduce (%), d.pupBonus = {life, extra}, d.crit, d.lifeMax (Iron Topknot), d.zoomRegen
 * (Midnight Reading), d.moveSpeed / d.moveMul (a little slow).
 */
export function shihtzuPassives(d, L, CL) {
  const lv = id => (L && L(id)) || 0;
  d.treeDmgPct = { flail: 0, hex: 0, tome: 0 };
  d.treeCostCut = { hex: 0, tome: 0 };
  // the dark arts: Energy's +1% per point instead of Strength's (the weapon damage already carries Str)
  d.hexMul = r2((100 + (d.dmgPct || 0) + (d.ene || 0)) / Math.max(1, 100 + (d.dmgPct || 0) + (d.statDmgPct || 0)));
  d.hexDur = 0; d.hexStacks = 3; d.pupBonus = { life: 0, extra: 0 };
  let dr = (CL && CL.dr) || 0;
  if (lv('weightOfWorld') > 0) {
    const p = DEFS.weightOfWorld.params(lv('weightOfWorld'));
    d.treeDmgPct.flail += p.dmgPct;
    d.crit = r1(Math.min(75, (d.crit || 0) + p.crit));
  }
  if (lv('ironTopknot') > 0) {
    const p = DEFS.ironTopknot.params(lv('ironTopknot'));
    d.lifeMax = Math.round(d.lifeMax * (1 + p.lifePct / 100));
    dr += p.dmgReduce;
  }
  if (lv('lingeringGloom') > 0) {
    const p = DEFS.lingeringGloom.params(lv('lingeringGloom'));
    d.treeDmgPct.hex += p.dmgPct; d.hexDur += p.duration;
  }
  if (lv('grudgeLedger') > 0) {
    const p = DEFS.grudgeLedger.params(lv('grudgeLedger'));
    d.hexStacks += p.stacks; d.treeDmgPct.hex += p.stackPct;
  }
  if (lv('veryGoodGhosts') > 0) {
    const p = DEFS.veryGoodGhosts.params(lv('veryGoodGhosts'));
    d.treeDmgPct.tome += p.dmgPct; d.pupBonus.life += p.lifePct; d.pupBonus.extra += p.extra;
  }
  if (lv('midnightReading') > 0) {
    const p = DEFS.midnightReading.params(lv('midnightReading'));
    d.zoomRegen = r2(d.zoomRegen * (1 + p.zoomRegen / 100));
    d.treeCostCut.hex = p.costCut; d.treeCostCut.tome = p.costCut;
  }
  d.dmgReduce = r1(Math.min(DR_CAP, dr));
  // a little slow on his paws (the class's speed, % on the move speed: classes.js), before any boots
  if (CL && CL.speed) { d.moveSpeed = (d.moveSpeed || 0) + CL.speed; d.moveMul = r2(Math.min(2, Math.max(0.5, 1 + diminish(d.moveSpeed, 150) / 100))); }
}
