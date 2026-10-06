// Skill trees — 3 trees x 7 skills, Diablo-2 style (row level gates, prerequisites, hard-point synergies).
//
// Units used by params(): distances/radii in world units (1 unit = 1 m, Chewy ~1.15 tall), speeds in m/s,
// durations/cooldowns in seconds, angles in degrees, dmgPct = percent of the player's rolled weapon damage
// (derived.dmgMin..dmgMax, already includes str/dex, +%dmg and masteries). Synergy multipliers are ALREADY
// folded into every dmgPct / healPct returned by params().
//
// Synergies use hard (base) points only, exactly like D2. computeStats() stores them on derived.synergy[id]
// so params(lvl, derived) can read them without the state. If derived is missing, synergy = 1.
//
// Channel skills ('whirl'): cost(lvl) is zoom PER SECOND while channelling.
// Passive / aura skills: cost = 0, cd = 0; their effects are applied inside computeStats() (stats.js).
//
// D2 level gate: putting the Nth point into a skill needs character level >= req + (N-1).

import { MOKA_TREES, MOKA_SKILLS } from './skillsMoka.js';
import { POE_TREES, POE_SKILLS } from './skillsPoe.js';

export const MAX_SKILL_LVL = 20;
export const ROW_REQ = [1, 6, 12, 18, 24, 30];

// every hero's trees (cls = the hero who learns them; see classes.js). The UI shows the active hero's three.
export const TREES = [
  { id: 'bone', cls: 'chewy', name: 'Bone Blade', sub: 'Bone Katana', color: '#f0d9b0', accent: '#e8475c', desc: 'Draw-cuts, stances and a ground-cracking overhead. Strength makes it hit harder.' },
  { id: 'fetch', cls: 'chewy', name: 'Fetch Mastery', sub: 'Red Tennis Ball', color: '#ffb3a0', accent: '#e8362a', desc: 'Throws, trick shots and ball storms. Dexterity makes it hit harder.' },
  { id: 'spirit', cls: 'chewy', name: 'Pack Spirit', sub: 'Any weapon', color: '#b8d0ff', accent: '#5a7ae0', desc: 'Battle cries, auras, Shadow and the ghostly spirit pups.' },
  ...MOKA_TREES,
  ...POE_TREES,
];
export const treesFor = cls => TREES.filter(t => (t.cls || 'chewy') === (cls || 'chewy'));

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const pct = v => Math.round(v) + '%';
/** Diminishing returns curve: approaches `max` as lvl grows, reaching max/2 at lvl = half. */
export const dim = (lvl, max, half) => (lvl <= 0 ? 0 : (max * lvl) / (lvl + half));
const syn = (id, d) => (d && d.synergy && d.synergy[id]) || 1;
const lin = (a, b) => l => a + b * (l - 1);

/** Actual damage range string for a dmgPct, if derived damage is known. */
function dmgRange(pctV, d) {
  if (!d || d.dmgMin == null) return '';
  const a = Math.max(1, Math.round((d.dmgMin * pctV) / 100)), b = Math.max(a, Math.round((d.dmgMax * pctV) / 100));
  return ` (${a}–${b})`;
}
function synLine(id, d) {
  const m = syn(id, d);
  return m > 1.001 ? [`Synergy bonus: +${Math.round((m - 1) * 100)}%`] : [];
}

const DEFS = {
  // =================================================================== BONE BLADE (Chewy the samurai: docs/HEROES.md)
  chomp: {
    tree: 'bone', name: 'Crescent Chomp', row: 0, col: 1, pre: [], wep: 'sword', kind: 'active', element: 'phys',
    cost: l => r1(3 + 0.15 * (l - 1)), cd: () => 0,
    desc: 'Draw from the hip in one two-pawed swoop! The cut leaves a bone-white crescent and cleaves everything in a wide arc in front of you.',
    syn: [{ id: 'boneMastery', p: 6 }, { id: 'dig', p: 5 }],
    params(l, d) {
      return { dmgPct: lin(150, 18)(l) * syn('chomp', d), arc: Math.min(240, 140 + 5 * l), radius: 2.0, knockback: 0.6, hits: 1 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Damage: ${pct(p.dmgPct)} weapon damage${dmgRange(p.dmgPct, d)}`, `Arc: ${p.arc}°`, `Zoom cost: ${this.cost(l)}`, ...synLine('chomp', d)];
    },
  },
  boneMastery: {
    tree: 'bone', name: 'Way of the Bone', row: 1, col: 0, pre: [], wep: 'sword', kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'A thousand practice cuts at the dojo (and only a few sneaky chews when sensei wasn’t looking) have made you one with the blade. Passive — Bone Katana only.',
    syn: [],
    params(l) { return { dmgPct: 25 + 9 * (l - 1), crit: r1(2 + 0.5 * (l - 1)) }; },
    info(l) { const p = this.params(l); return [`+${p.dmgPct}% Bone Katana damage`, `+${p.crit}% critical chomp chance`]; },
  },
  whirl: {
    tree: 'bone', name: 'Whirlwind Stance', row: 1, col: 2, pre: ['chomp'], wep: 'sword', kind: 'channel', element: 'phys',
    cost: l => r1(8 + 0.4 * (l - 1)), cd: () => 0,
    desc: 'Hold to plant your paws and turn into a whirlwind of two-pawed cuts, cherry petals swirling round you. You can move (slowly) while it spins.',
    syn: [{ id: 'chomp', p: 5 }, { id: 'frenzy', p: 6 }],
    params(l, d) {
      return { dmgPct: lin(70, 9)(l) * syn('whirl', d), hitsPerSec: 4, radius: r2(1.8 + 0.02 * l), moveMul: 0.75, knockback: 0.3 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Damage per hit: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Hits ${p.hitsPerSec}× per second, radius ${p.radius} m`, `Zoom: ${this.cost(l)} per second`, ...synLine('whirl', d)];
    },
  },
  dig: {
    tree: 'bone', name: 'Helmet Splitter', row: 2, col: 1, pre: ['chomp'], wep: 'sword', kind: 'active', element: 'phys',
    cost: l => r1(10 + 0.5 * (l - 1)), cd: l => r1(Math.max(1.2, 3 - 0.08 * l)),
    desc: 'Leap toward the cursor into a mighty overhead cut that cracks the ground and stuns everything nearby.',
    syn: [{ id: 'chomp', p: 6 }, { id: 'bonestorm', p: 5 }],
    params(l, d) {
      return { dmgPct: lin(220, 24)(l) * syn('dig', d), radius: r2(2.2 + 0.05 * l), leap: 6, stun: r2(0.8 + 0.05 * l), knockback: 1.2 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, `Stun: ${p.stun}s`, `Leap up to ${p.leap} m`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`, ...synLine('dig', d)];
    },
  },
  guard: {
    tree: 'bone', name: 'Unbending Stance', row: 3, col: 0, pre: ['boneMastery'], wep: null, kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'Root your paws like an old pine on a cliff. You don’t budge, and nobody takes your chew toy. Passive — any weapon.',
    syn: [],
    params(l) { return { defPct: 20 + 10 * (l - 1), block: r1(4 + dim(l, 30, 10)) }; },
    info(l) { const p = this.params(l); return [`+${p.defPct}% defense`, `+${p.block}% chance to block`]; },
  },
  frenzy: {
    tree: 'bone', name: 'Flowing Water', row: 4, col: 2, pre: ['whirl'], wep: null, kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'Be like water: every hit carries you on, stacking attack speed and move speed until your cuts and your feet run like a mountain stream. Passive.',
    syn: [],
    params(l) { return { perStack: 6 + l, maxStacks: 3 + Math.floor(l / 4), duration: 3 }; },
    info(l) { const p = this.params(l); return [`+${p.perStack}% attack & move speed per stack`, `Max stacks: ${p.maxStacks}`, `Stacks last ${p.duration}s`]; },
  },
  bonestorm: {
    tree: 'bone', name: 'Sakura Storm', row: 5, col: 1, pre: ['dig', 'frenzy'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(25 + 1 * (l - 1)), cd: () => 10,
    desc: 'Spectral bone blades and a flurry of cherry petals whirl round you, shredding anything that comes close.',
    syn: [{ id: 'boneMastery', p: 4 }, { id: 'whirl', p: 4 }],
    params(l, d) {
      return { count: 4 + Math.floor(l / 3), dmgPct: lin(60, 8)(l) * syn('bonestorm', d), radius: 2.2, duration: r1(6 + 0.3 * l), orbitSpeed: 3.5, hitInterval: 0.35 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Blades: ${p.count}`, `Damage per touch: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Duration: ${p.duration}s`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`, ...synLine('bonestorm', d)];
    },
  },

  // =================================================================== FETCH MASTERY
  throw: {
    tree: 'fetch', name: 'Power Throw', row: 0, col: 1, pre: [], wep: 'ball', kind: 'active', element: 'phys',
    cost: l => r1(2 + 0.1 * (l - 1)), cd: () => 0,
    desc: 'Hurl the ball with all your might. It pierces foes, then bounces back to your paws.',
    syn: [{ id: 'fetchMastery', p: 6 }, { id: 'multi', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(140, 16)(l) * syn('throw', d), speed: 16 * ((d && d.ballSpeed) || 1), range: 12, pierce: 1 + Math.floor(l / 5) + ((d && d.pierce) || 0), returns: true };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Pierces ${p.pierce} ${p.pierce === 1 ? 'enemy' : 'enemies'}`, `Zoom cost: ${this.cost(l)}`, ...synLine('throw', d)];
    },
  },
  fetchMastery: {
    tree: 'fetch', name: 'Fetch Mastery', row: 1, col: 0, pre: [], wep: 'ball', kind: 'passive', element: 'phys',
    cost: () => 0, cd: () => 0,
    desc: 'The ball is life. Passive — balls only.',
    syn: [],
    params(l) { return { dmgPct: 25 + 9 * (l - 1), crit: r1(2 + 0.5 * (l - 1)), ballSpeed: 10 + 3 * l, pierce: Math.floor(l / 10) }; },
    info(l) {
      const p = this.params(l);
      return [`+${p.dmgPct}% ball damage`, `+${p.crit}% critical chomp chance`, `+${p.ballSpeed}% ball speed`, ...(p.pierce ? [`Balls pierce +${p.pierce}`] : [])];
    },
  },
  ricochet: {
    tree: 'fetch', name: 'Ricochet', row: 1, col: 2, pre: ['throw'], wep: 'ball', kind: 'active', element: 'zap',
    cost: l => r1(5 + 0.25 * (l - 1)), cd: () => 0,
    desc: 'Rub the ball on the carpet for static, then trick-shot it from foe to foe. Zap damage.',
    syn: [{ id: 'throw', p: 5 }, { id: 'blaze', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(110, 12)(l) * syn('ricochet', d), bounces: 3 + Math.floor(l / 3), bounceRange: 6, speed: 18 * ((d && d.ballSpeed) || 1) };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Zap damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Bounces: ${p.bounces}`, `Zoom cost: ${this.cost(l)}`, ...synLine('ricochet', d)];
    },
  },
  multi: {
    tree: 'fetch', name: 'Multi-Fetch', row: 2, col: 1, pre: ['throw'], wep: 'ball', kind: 'active', element: 'phys',
    cost: l => r1(8 + 0.4 * (l - 1)), cd: () => 0,
    desc: 'Where did all these balls come from? Throws a fan of balls.',
    syn: [{ id: 'throw', p: 4 }, { id: 'fetchstorm', p: 4 }],
    params(l, d) {
      return { count: Math.min(11, 3 + Math.floor(l / 2)), spread: Math.min(90, 50 + 2 * l), dmgPct: lin(85, 9)(l) * syn('multi', d), speed: 15 * ((d && d.ballSpeed) || 1), range: 11, pierce: (d && d.pierce) || 0 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Balls: ${p.count} in a ${p.spread}° fan`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Zoom cost: ${this.cost(l)}`, ...synLine('multi', d)];
    },
  },
  decoy: {
    tree: 'fetch', name: 'Squeaky Decoy', row: 3, col: 0, pre: ['fetchMastery'], wep: 'ball', kind: 'summon', element: 'stink',
    cost: l => r1(14 + 0.6 * (l - 1)), cd: l => r1(Math.max(4, 8 - 0.2 * l)),
    desc: 'Toss a rubber chicken that SQUEAKS so loudly foes must attack it — and it puffs stink clouds while they do.',
    syn: [{ id: 'multi', p: 4 }, { id: 'fetchMastery', p: 3 }],
    params(l, d) {
      const life = Math.round(((d && d.lifeMax) || 60) * 0.4 + 15 * l);
      return { maxDecoys: 1 + Math.floor(l / 7), duration: r1(8 + 0.4 * l), lureRadius: r1(5 + 0.1 * l), cloudRadius: r2(2.2 + 0.04 * l), pulse: 1, dmgPct: lin(40, 6)(l) * syn('decoy', d), life, throwRange: 8 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Stink damage per pulse: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Lures foes within ${p.lureRadius} m`, `Decoy life: ${p.life} · lasts ${p.duration}s`, `Max decoys: ${p.maxDecoys}`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`, ...synLine('decoy', d)];
    },
  },
  blaze: {
    tree: 'fetch', name: 'Blazing Ball', row: 4, col: 2, pre: ['ricochet'], wep: 'ball', kind: 'active', element: 'fire',
    cost: l => r1(12 + 0.6 * (l - 1)), cd: () => 0,
    desc: 'Rub the ball on the carpet until it bursts into flame. Explodes on impact and leaves burning ground.',
    syn: [{ id: 'ricochet', p: 5 }, { id: 'fetchMastery', p: 3 }],
    params(l, d) {
      const s = syn('blaze', d);
      return { dmgPct: lin(200, 22)(l) * s, radius: r2(1.8 + 0.05 * l), burnPct: lin(25, 4)(l) * s, burnDuration: 3, speed: 14 * ((d && d.ballSpeed) || 1), range: 12 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Fire damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, `Burning ground: ${pct(p.burnPct)} per second for ${p.burnDuration}s`, `Zoom cost: ${this.cost(l)}`, ...synLine('blaze', d)];
    },
  },
  fetchstorm: {
    tree: 'fetch', name: 'Fetch Storm', row: 5, col: 1, pre: ['multi', 'blaze'], wep: 'ball', kind: 'active', element: 'phys',
    cost: l => r1(30 + 1 * (l - 1)), cd: () => 8,
    desc: 'Every ball you have ever lost under the couch rains down from the sky on the target area.',
    syn: [{ id: 'multi', p: 5 }, { id: 'throw', p: 3 }],
    params(l, d) {
      return { count: 18 + 2 * l, duration: 2.5, radius: r2(4 + 0.05 * l), impactRadius: 1.1, dmgPct: lin(90, 10)(l) * syn('fetchstorm', d), range: 14 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Balls: ${p.count} over ${p.duration}s`, `Damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Area: ${p.radius} m`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`, ...synLine('fetchstorm', d)];
    },
  },

  // =================================================================== PACK SPIRIT
  woof: {
    tree: 'spirit', name: 'Kiai!', row: 0, col: 1, pre: [], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(6 + 0.3 * (l - 1)), cd: () => 1.5,
    desc: 'A battle shout straight from the belly! It knocks foes back and leaves them stunned and a little embarrassed.',
    syn: [{ id: 'howl', p: 6 }, { id: 'moonhowl', p: 4 }],
    params(l, d) {
      return { dmgPct: lin(60, 10)(l) * syn('woof', d), radius: r2(3.5 + 0.08 * l), stun: r2(0.6 + 0.04 * l), knockback: 2.5 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)} in ${p.radius} m`, `Stun: ${p.stun}s`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`, ...synLine('woof', d)];
    },
  },
  goodboy: {
    tree: 'spirit', name: 'Code of the Good Boy', row: 1, col: 0, pre: [], wep: null, kind: 'aura', element: 'holy',
    cost: () => 0, cd: () => 0,
    desc: 'Honour, loyalty, and sitting nicely when asked. You are a very good boy, and everyone nearby can feel it. Always-on aura: regeneration and resistances for you, Shadow and your pups.',
    syn: [],
    params(l) { return { radius: 8, lifeRegen: r1(1 + 0.8 * l), resAll: Math.round(dim(l, 45, 12)) }; },
    info(l) { const p = this.params(l); return [`+${p.lifeRegen} life per second`, `+${p.resAll}% all resistances`, `Radius: ${p.radius} m (affects Shadow & pups)`]; },
  },
  zoom: {
    tree: 'spirit', name: 'Flash Draw', row: 1, col: 2, pre: ['woof'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(6 + 0.2 * (l - 1)), cd: l => r1(Math.max(0.8, 2.5 - 0.08 * l)),
    desc: 'Draw and dash through enemies in a single stroke, cutting everything you pass. Untouchable while dashing — the cut only shows once you sheathe.',
    syn: [{ id: 'frenzy', p: 4 }, { id: 'goodboy', p: 2 }],
    params(l, d) {
      return { dmgPct: lin(80, 12)(l) * syn('zoom', d), distance: r2(5 + 0.15 * l), speed: 22, width: 1.2, invuln: true };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Damage: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Distance: ${p.distance} m`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`, ...synLine('zoom', d)];
    },
  },
  packcall: {
    tree: 'spirit', name: 'Pack Call', row: 2, col: 1, pre: ['woof'], wep: null, kind: 'summon', element: 'frost',
    cost: l => r1(15 + 0.5 * (l - 1)), cd: () => 2,
    desc: 'Empowers Shadow (passively) and calls ghostly spirit pups in tiny samurai helmets, whose chilly bites slow foes.',
    syn: [{ id: 'goodboy', p: 4 }, { id: 'howl', p: 4 }],
    params(l, d) {
      return { pups: 1 + Math.floor(l / 4), pupLifePct: 30 + 5 * l, pupDmgPct: lin(40, 6)(l) * syn('packcall', d), pupSpeed: 6, chill: 0.3, duration: 60, shadowDmg: 10 + 8 * l, shadowLife: 10 + 8 * l };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Spirit pups: ${p.pups} (last ${p.duration}s)`, `Pup bite: ${pct(p.pupDmgPct)} weapon damage as frost`, `Pup life: ${p.pupLifePct}% of your life`, `Shadow: +${p.shadowDmg}% damage & +${p.shadowLife}% life (passive)`, `Zoom cost: ${this.cost(l)}`, ...synLine('packcall', d)];
    },
  },
  treat: {
    tree: 'spirit', name: 'Onigiri Toss', row: 3, col: 0, pre: ['goodboy'], wep: null, kind: 'active', element: 'holy',
    cost: l => r1(12 + 0.5 * (l - 1)), cd: l => r1(Math.max(3, 8 - 0.2 * l)),
    desc: 'Toss a glowing rice ball that bursts into healing crumbs for you and your pack. Yokai hate the smell of good cooking.',
    syn: [{ id: 'goodboy', p: 5 }],
    params(l, d) {
      const s = syn('treat', d);
      return { healPct: r1((15 + 1.5 * l) * s), healFlat: Math.round((10 + 5 * l) * s), radius: 3.2, dmgPct: lin(50, 6)(l) * s, range: 8 };
    },
    info(l, d) {
      const p = this.params(l, d);
      const heal = d && d.lifeMax ? ` (${Math.round((d.lifeMax * p.healPct) / 100 + p.healFlat)})` : '';
      return [`Heals ${p.healPct}% life + ${p.healFlat}${heal}`, `Holy crumbs: ${pct(p.dmgPct)} to foes in ${p.radius} m`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`, ...synLine('treat', d)];
    },
  },
  howl: {
    tree: 'spirit', name: 'War Banner Howl', row: 4, col: 2, pre: ['packcall'], wep: null, kind: 'active', element: 'phys',
    cost: l => r1(20 + 0.5 * (l - 1)), cd: () => 14,
    desc: 'Plant your paw-crest war banner and howl: you and your pack hit harder and run faster while it flies. Nearby yokai flee in terror.',
    syn: [],
    params(l) { return { duration: 10, dmgBuff: 30 + 6 * l, moveBuff: 20, fear: r2(1.5 + 0.05 * l), radius: 6 }; },
    info(l) { const p = this.params(l); return [`+${p.dmgBuff}% damage for ${p.duration}s`, `+${p.moveBuff}% move speed`, `Fear: ${p.fear}s in ${p.radius} m`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`]; },
  },
  moonhowl: {
    tree: 'spirit', name: 'Moonlit Blades', row: 5, col: 1, pre: ['howl'], wep: null, kind: 'active', element: 'holy',
    cost: l => r1(35 + 1 * (l - 1)), cd: () => 6,
    desc: 'Howl at the moon and it answers — blades of moonlight fall on nearby enemies.',
    syn: [{ id: 'woof', p: 6 }, { id: 'howl', p: 5 }],
    params(l, d) {
      return { strikes: 5 + Math.floor(l / 3), dmgPct: lin(280, 32)(l) * syn('moonhowl', d), radius: 7, strikeRadius: 1.4, interval: 0.15 };
    },
    info(l, d) {
      const p = this.params(l, d);
      return [`Moon blades: ${p.strikes}`, `Holy damage each: ${pct(p.dmgPct)}${dmgRange(p.dmgPct, d)}`, `Zoom cost: ${this.cost(l)} · Cooldown: ${this.cd(l)}s`, ...synLine('moonhowl', d)];
    },
  },
};

// Moka's skills live in skillsMoka.js (same format)
for (const id in MOKA_SKILLS) { if (DEFS[id]) throw new Error(`skill id clash: ${id}`); DEFS[id] = MOKA_SKILLS[id]; }
// Poe's skills live in skillsPoe.js (same format; docs/POE.md)
for (const id in POE_SKILLS) { if (DEFS[id]) throw new Error(`skill id clash: ${id}`); DEFS[id] = POE_SKILLS[id]; }

/** Bind info/params so they also work when destructured (no reliance on `this`). */
function bindDef(d) {
  for (const k of ['info', 'params', 'cost', 'cd']) { const fn = d[k]; d[k] = (...a) => fn.apply(d, a); }
  return d;
}
const TREE_CLS = {}; // tree id → hero class (filled below from TREES)
for (const id in DEFS) {
  const d = bindDef(DEFS[id]);
  d.id = id;
  d.req = ROW_REQ[d.row];
  d.pre = d.pre || [];
  d.syn = d.syn || [];
}
for (const t of TREES) TREE_CLS[t.id] = t.cls || 'chewy';
for (const id in DEFS) DEFS[id].cls = TREE_CLS[DEFS[id].tree] || 'chewy';

export const SKILLS = DEFS;
export const SKILL_IDS = Object.keys(DEFS);

/** Basic attack pseudo-skill ('attack'). Adapts to the active weapon type. */
export const ATTACK = bindDef({
  id: 'attack', tree: null, name: 'Attack', row: -1, col: -1, req: 1, pre: [], wep: null, kind: 'active', element: 'phys', syn: [],
  cost: () => 0, cd: () => 0,
  desc: 'Cut with your bone katana or throw your ball. Free, forever, and very satisfying.',
  params(l, d) {
    if (d && d.weaponType === 'ball') return { dmgPct: 100, speed: 15 * (d.ballSpeed || 1), range: 11, pierce: d.pierce || 0, returns: true, projectile: true };
    if (d && d.weaponType === 'staff') return { dmgPct: 100, speed: 15, range: 11, pierce: 0, returns: false, projectile: true, bolt: true }; // Moka: a free little sparkle bolt
    if (d && d.weaponType === 'fuma') return { dmgPct: 80 * (1 + ((d.treeDmgPct && d.treeDmgPct.shuriken) || 0) / 100), radius: 1.9, arc: 130, knockback: 0.25, projectile: false, fuma: true }; // Poe: quick one-paw fūma slashes (a three-hit combo, combat/poeSkills.js)
    return { dmgPct: 100, radius: 1.8, arc: 110, knockback: 0.25, projectile: false };
  },
  info(l, d) {
    const p = this.params(l, d);
    if (p.fuma) return [`Damage: ${pct(p.dmgPct)} weapon damage${dmgRange(p.dmgPct, d)}`, 'Quick fūma slashes: a three-hit combo'];
    return [`Damage: 100% weapon damage${dmgRange(100, d)}`, p.bolt ? 'A sparkly magic bolt from your staff' : p.projectile ? 'Thrown — bounces back to you' : 'Katana cuts: a three-cut combo, then a flourish'];
  },
});

/** Look up a skill def ('attack' included). */
export const getSkill = id => (id === 'attack' ? ATTACK : DEFS[id]);

/** Synergy multiplier from hard points: 1 + Σ base(synId) * p%. */
export function synergyMult(id, state) {
  const d = DEFS[id];
  if (!d || !d.syn.length) return 1;
  const sk = (state && state.player && state.player.skills) || {};
  let m = 1;
  for (const s of d.syn) m += ((sk[s.id] || 0) * s.p) / 100;
  return m;
}

/** Effective level = base + allSkills + treeSkills[tree] + skillBonus[id]; 0 if no hard points. */
export function effectiveLevel(id, state, derived) {
  if (id === 'attack') return 1;
  const d = DEFS[id];
  if (!d) return 0;
  const base = (state && state.player && state.player.skills && state.player.skills[id]) || 0;
  if (base <= 0) return 0;
  const dv = derived || {};
  return base + (dv.allSkills || 0) + ((dv.treeSkills && dv.treeSkills[d.tree]) || 0) + ((dv.skillBonus && dv.skillBonus[id]) || 0);
}

/** Can the player put a point into this skill right now? → { ok, why } */
export function canLearn(id, state) {
  const d = DEFS[id];
  if (!d) return { ok: false, why: 'Unknown skill' };
  const P = state.player;
  if (d.cls && d.cls !== (P.cls || 'chewy')) return { ok: false, why: "Another hero's skill" };
  if (d.training) return { ok: false, why: `${d.name} is still in training: coming soon!` }; // (Poe's skills before their cast lands: skillsPoe.js POE_TRAINING)
  const base = P.skills[id] || 0;
  if (base >= MAX_SKILL_LVL) return { ok: false, why: 'Mastered!' };
  const need = d.req + base;
  if (P.lvl < need) return { ok: false, why: `Requires level ${need}` };
  for (const p of d.pre) if (!(P.skills[p] > 0)) return { ok: false, why: `Requires ${DEFS[p].name}` };
  if ((P.skillPts || 0) <= 0) return { ok: false, why: 'No skill points' };
  return { ok: true, why: '' };
}

/** Level that the NEXT point would need (for UI). */
export const nextPointLevel = (id, state) => DEFS[id].req + ((state.player.skills[id] || 0));

/** A skill's zoom cost at a level after its tree's cost cut (Poe's Ninjutsu Mastery: derived.treeCostCut[tree] %). */
export function skillCost(d, lvl, derived) {
  const c = d.cost(lvl), k = derived && derived.treeCostCut && derived.treeCostCut[d.tree];
  return k ? r1(c * (1 - k / 100)) : c;
}

/**
 * Everything the combat executor needs for a cast: effective level, zoom cost, cooldown (after cdr),
 * cast-time multiplier and params. Returns null if the skill is unknown or not learned.
 */
export function skillRuntime(id, state, derived) {
  const d = getSkill(id);
  if (!d) return null;
  const lvl = effectiveLevel(id, state, derived);
  if (id !== 'attack' && lvl <= 0) return null;
  const cdr = Math.min(50, (derived && derived.cdr) || 0);
  return {
    id, lvl, def: d, kind: d.kind, element: d.element, wep: d.wep,
    cost: skillCost(d, lvl, derived), cd: r2(d.cd(lvl) * (1 - cdr / 100)),
    params: d.params(lvl, derived),
  };
}

/** Can this skill be cast now (weapon, zoom)? → { ok, why } (cooldowns are tracked by the game loop). */
export function usable(id, state, derived, curZoom) {
  const d = getSkill(id);
  if (!d) return { ok: false, why: 'Unknown skill' };
  if (d.kind === 'passive' || d.kind === 'aura') return { ok: false, why: 'Passive skill' };
  if (id !== 'attack' && effectiveLevel(id, state, derived) <= 0) return { ok: false, why: 'Not learned' };
  if (d.cls && state.player?.cls && d.cls !== state.player.cls) return { ok: false, why: 'Not your skill!' };
  if (d.training) return { ok: false, why: 'Still in training!' };
  if (d.wep && derived && derived.weaponType !== d.wep) return { ok: false, why: d.wep === 'sword' ? 'Needs a Bone Katana (X to swap)' : d.wep === 'staff' ? 'Needs a staff' : d.wep === 'fuma' ? 'Needs a fūma' : 'Needs a Ball (X to swap)' };
  const lvl = effectiveLevel(id, state, derived);
  const zoom = curZoom != null ? curZoom : (state.player.zoom == null ? (derived ? derived.zoomMax : 1e9) : state.player.zoom);
  if (d.kind !== 'channel' && zoom < skillCost(d, lvl, derived)) return { ok: false, why: 'Not enough zoom!' };
  return { ok: true, why: '' };
}
