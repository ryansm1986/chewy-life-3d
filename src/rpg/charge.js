// Charged abilities (docs/CHARGE.md): hold an active skill's button to charge it, release for a boosted version.
// This module is pure data + helpers (node-testable, no THREE / DOM): the charge table for every active skill of both
// heroes, the perk rules and chargeRuntime(), which turns a skill's normal runtime into its charged one. The input
// state machine lives in combat/charge.js, the charged casts in combat/chargedSkills.js, the looks in gfx/chargeFx.js.
//
// Rules (CHARGE.md §1):
//   • a press shorter than GRACE is a tap (the normal cast); holding past it charges, aimed at the cursor;
//   • every skill starts with ONE stage (Ⅰ) at `base` seconds; the Deeper Charge perk adds Ⅱ and Ⅲ, each taking
//     NEXT_K × the previous stage's time on top; Quick Wind-up trims every stage by 15% per rank;
//   • the release costs the normal zoom + SURCHARGE per stage reached (Efficient Focus lowers the surcharge);
//   • a stage the hero can't afford is not reached (the ring caps at the highest affordable stage).
// Each entry: { ready, base, color, pose, title, blurb, apply(p, s, k, d, p0) → p, lines(p, s, k, p0) → [..], perks }
//   ready: the charged release is implemented (combat/chargedSkills.js) — only then does holding the key charge it.
//   apply() receives a COPY of the skill's params at its level (p0 = the originals), the stage s (1..3) and the
//   perk ranks k ({ perkId: rank }), and returns the charged params (extra fields are read by chargedSkills.js).
//   lines() are the tooltip lines for a stage, with exact numbers. Perk info(rank, C) describes one rank.
import { SKILLS, skillRuntime } from './skills.js';

export const GRACE = 0.18;
export const SLOW = 0.45;
export const NEXT_K = 0.7;
export const SURCHARGE = 0.5;
export const MAX_STAGE = 3;
export const STAGE_MULT = [1.5, 2.0, 2.75];
export const NUMERAL = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'];
export const QUICK_PER_RANK = 0.15;
export const FOCUS_PER_RANK = 0.15;

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const pct = v => Math.round(v) + '%';
const x = v => '×' + r2(v);
const by = (arr, s) => arr[Math.max(0, Math.min(arr.length - 1, s - 1))];
const three = (arr, f = v => v) => arr.map(f).join(' / ');

// ------------------------------------------------------------------ common perk families (CHARGE.md §3)
const STAGES = () => ({
  id: 'stages', name: 'Deeper Charge', kind: 'stage', icon: 'stages', ranks: 2, req: [5, 10],
  desc: 'Keep holding for more: rank 1 adds Stage Ⅱ, rank 2 adds Stage Ⅲ.',
  info(r, C) { const t = stageTimes(C, { quick: 0 }); return r <= 1 ? `Adds Stage Ⅱ (reached after ${r2(t[1])}s)` : `Adds Stage Ⅲ (reached after ${r2(t[2])}s)`; },
});
const QUICK = () => ({
  id: 'quick', name: 'Quick Wind-up', kind: 'common', icon: 'quick', ranks: 3, req: [1, 3, 6],
  desc: 'Charges faster.',
  info(r, C) { const t = stageTimes(C, { quick: r }); return `Charges ${Math.round(QUICK_PER_RANK * 100 * r)}% faster (Stage Ⅰ in ${r2(t[0])}s)`; },
});
const FOCUS = () => ({
  id: 'focus', name: 'Efficient Focus', kind: 'common', icon: 'focus', ranks: 2, req: [3, 8],
  desc: 'Charged releases cost less zoom.',
  info(r) { return `Each stage costs +${Math.round((SURCHARGE - FOCUS_PER_RANK * r) * 100)}% zoom instead of +${Math.round(SURCHARGE * 100)}%`; },
});
const SPLIT = ({ name = 'Split Shot', what = 'projectile', pct: P = 50, spread = 9 } = {}) => ({
  id: 'split', name, kind: 'common', icon: 'split', ranks: 2, req: [2, 6], pct: P, spread,
  desc: `Extra ${what}s on a charged release, fanned out.`,
  info(r) { return `+${r} extra ${what}${r > 1 ? 's' : ''} on a charged release (${P}% damage each)`; },
});
const WIDE = ({ name = 'Wide Arc', pct: P = 20, what = 'area' } = {}) => ({
  id: 'wide', name, kind: 'common', icon: 'wide', ranks: 2, req: [2, 6], pct: P,
  desc: `A bigger charged ${what}.`,
  info(r) { return `+${P * r}% charged ${what}`; },
});
const ECHO = ({ name = 'Echo', pct: P = 50, delay = 0.45 } = {}) => ({
  id: 'echo', name, kind: 'common', icon: 'echo', ranks: 1, req: [8], pct: P, delay,
  desc: 'The charged release happens again a moment later.',
  info() { return `The charged release repeats once ${delay}s later at ${P}% power`; },
});
const UNIQUE = (id, name, req, desc, o = {}) => ({ id, name, kind: 'unique', icon: o.icon || 'unique', ranks: 1, req: [req], needs: o.needs || null, desc, info: o.info || (() => desc), ...o.extra });
const set = (...ps) => Object.fromEntries(ps.map(p => [p.id, p]));

// ------------------------------------------------------------------ the charge table
// Stage payoff numbers are per stage [Ⅰ, Ⅱ, Ⅲ]. The skill's main number scales with STAGE_MULT (×1.5 / ×2 / ×2.75)
// unless the skill names its own curve; the signature payoff grows with the stage too.
const C = {};

// =================================================================== CHEWY · BONE ARTS
C.chomp = {
  ready: true, tune: { dmg: [0.67, 0.51, 0.47], shape: [0.15, 1, 1] }, base: 0.8, color: '#ffc24a', pose: 'sword', title: 'Heavy Cleave',
  blurb: 'A wider, heavier cleave, and a shockwave crescent that rolls on ahead.',
  arc: [40, 60, 90], radius: [1.1, 1.2, 1.3], wave: [3, 3.6, 4.2], wavePct: 60, stun: [0, 0.25, 0.5],
  apply(p, s, k) {
    const w = 1 + (k.wide || 0) * 0.15;
    p.dmgPct *= by(STAGE_MULT, s); p.arc = Math.min(300, p.arc + by(this.arc, s)); p.radius = r2(p.radius * by(this.radius, s) * w);
    p.knockback = r2(p.knockback * (1 + 0.5 * s)); p.stun = by(this.stun, s);
    p.wave = r1(by(this.wave, s) * (1 + (k.wide || 0) * 0.1)); p.wavePct = this.wavePct; p.waveWidth = r2(0.75 * w);
    return p;
  },
  lines(p) { return [`Cleave: ${pct(p.dmgPct)} in a ${p.arc}° arc (${p.radius} m)`, `Shockwave crescent rolls ${r1(p.wave)} m: ${p.wavePct}% of the cleave`, ...(p.stun ? [`Staggers for ${p.stun}s`] : [])]; },
  perks: set(STAGES(), QUICK(), WIDE({ what: 'cleave reach', pct: 15 }),
    UNIQUE('seconds', 'Second Helping', 8, 'After a charged Chomp, your next Chomp within 2s is a Stage Ⅰ Heavy Cleave without holding (normal zoom cost).', { extra: { window: 2 } })),
};
C.whirl = {
  ready: true, tune: { dmg: [1, 1, 1.01], shape: [0, 0.15, 0.55] }, base: 0.9, color: '#ffd98a', pose: 'spin', title: 'Rev-up Spin', channel: true,
  blurb: 'Hold to wind up: at Stage Ⅰ a bigger spin that pulls foes in starts by itself and revs up while held; let go and it spins on alone, then a dizzy burst.',
  radius: [1.2, 1.3, 1.45], pull: [1.5, 2, 2.6], spinOut: [0.5, 1, 1.6],
  apply(p, s) { p.radius = r2(p.radius * by(this.radius, s)); p.pull = by(this.pull, s); p.spinOut = by(this.spinOut, s); p.dizzy = 0.4; return p; },
  lines(p) { return [`Spin radius ${p.radius} m, pulling foes in at ${p.pull} m/s`, `Keeps spinning ${p.spinOut}s after you let go, then a dizzy burst (${p.dizzy}s)`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('twister', 'Twister', 4, 'The spin-out drifts after your cursor at 2.5 m/s: a tiny tornado.', { extra: { speed: 2.5 } }),
    UNIQUE('finale', 'Dizzy Finale', 10, 'The spin-out ends by flinging everything nearby away: 120% damage and 1.2s dizzy.', { extra: { pct: 120, dizzy: 1.2 } })),
};
C.dig = {
  ready: true, tune: { dmg: [0.69, 0.53, 0.44], shape: [0, 1, 1] }, base: 0.9, color: '#e8b07a', pose: 'crouch', title: 'Crater Slam',
  blurb: 'A longer leap and a bigger, stunning crater.',
  radius: [1.3, 1.5, 1.75], leap: [2, 3, 4], stun: [0.3, 0.5, 0.8],
  apply(p, s, k) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s) * (1 + (k.wide || 0) * 0.2)); p.leap += by(this.leap, s); p.stun = r2(p.stun + by(this.stun, s)); p.knockback = r2(p.knockback * 1.5); return p; },
  lines(p) { return [`Slam: ${pct(p.dmgPct)} in ${p.radius} m`, `Leap up to ${p.leap} m · stun ${p.stun}s`]; },
  perks: set(STAGES(), QUICK(), WIDE({ what: 'crater' }),
    UNIQUE('aftershock', 'Aftershock', 8, 'A second slam ring erupts 0.6s later: 60% damage in a 40% wider ring.', { extra: { delay: 0.6, pct: 60, r: 1.4 } })),
};
C.bonestorm = {
  ready: true, tune: { dmg: [0.87, 0.77, 0.67], shape: [0.1, 0.2, 0.2] }, base: 1.0, color: '#fff0c8', pose: 'sky', title: 'Bone Cyclone',
  blurb: 'More bones in a wider storm.',
  count: [2, 3, 5], radius: [1.15, 1.3, 1.45], dur: [1, 1.05, 1.1], dmg: [1.15, 1.3, 1.5], // (it already lasts about its cooldown: the charge buys bones and reach, not time)
  apply(p, s) { p.count += by(this.count, s); p.radius = r2(p.radius * by(this.radius, s)); p.duration = r1(p.duration * by(this.dur, s)); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Bones: ${p.count} · ${pct(p.dmgPct)} per touch`, `Orbit ${p.radius} m · lasts ${p.duration}s`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('volley', 'Bone Volley', 6, 'When a charged storm ends, every bone shoots at the nearest foe within 8 m for 50%.', { extra: { pct: 50, range: 8 } }),
    UNIQUE('wall', 'Bone Wall', 12, 'While a charged storm spins, each bone blocks one hit aimed at Chewy (the bone pops).')),
};

// =================================================================== CHEWY · FETCH MASTERY
C.throw = {
  ready: true, tune: { dmg: [0.67, 0.53, 0.43], shape: [0, 1, 1] }, base: 0.75, color: '#d8f25a', pose: 'ball', title: 'Fastball',
  blurb: 'A piercing fastball that passes through every foe in its path, with a streak trail.',
  range: [4, 6, 8], knock: [0.5, 0.7, 1.0], size: [1.3, 1.5, 1.7],
  apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.speed = r2(p.speed * 1.35); p.range += by(this.range, s); p.pierce = 99; p.knock = by(this.knock, s); p.size = by(this.size, s); return p; },
  lines(p) { return [`Fastball: ${pct(p.dmgPct)}, pierces every foe`, `Range ${p.range} m · ${p.speed} m/s`]; },
  perks: set(STAGES(), QUICK(), SPLIT({ what: 'fastball', pct: 50, spread: 8 }),
    UNIQUE('boomerang', 'Boomerang Fetch', 8, 'The charged ball flies back to Chewy, hitting everything again on the way (60% damage).', { extra: { pct: 60 } })),
};
C.ricochet = {
  ready: true, tune: { dmg: [0.77, 0.63, 0.51], shape: [0, 0.35, 0.45] }, base: 0.85, color: '#fff27a', pose: 'ball', title: 'Static Overload',
  blurb: 'Extra bounces, and every bounce arcs a spark to one more foe nearby.',
  bounces: [2, 4, 6], dmg: [1.3, 1.6, 2.0], range: [1, 1.5, 2], arcPct: 35,
  apply(p, s, k) { p.bounces += by(this.bounces, s) + (k.pinball ? 3 : 0); p.dmgPct *= by(this.dmg, s); p.bounceRange += by(this.range, s); p.arcPct = this.arcPct; return p; },
  lines(p) { return [`Zap: ${pct(p.dmgPct)} · ${p.bounces} bounces (${p.bounceRange} m)`, `Each bounce arcs a spark to a nearby foe: ${p.arcPct}%`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('cling', 'Static Cling', 4, 'Every foe the charged ball hits is zapped again 1s later for 30%.', { extra: { pct: 30, delay: 1 } }),
    UNIQUE('pinball', 'Pinball Wizard', 8, 'A charged ricochet chains to +3 more foes and speeds up with each bounce: +12% speed and +10% damage per bounce.', { extra: { speed: 0.12, dmg: 0.1 } })),
};
C.multi = {
  ready: true, tune: { dmg: [0.87, 0.77, 0.69], shape: [0, 0.45, 0.55] }, base: 0.9, color: '#ff9a7a', pose: 'ball', title: 'Ball Pit Barrage',
  blurb: 'A much bigger, tighter fan of balls.',
  count: [3, 5, 8], dmg: [1.15, 1.3, 1.5],
  apply(p, s) { p.count = Math.min(19, p.count + by(this.count, s)); p.spread = Math.round(p.spread * 0.8); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Balls: ${p.count} in a ${p.spread}° fan`, `Damage each: ${pct(p.dmgPct)}`]; },
  perks: set(STAGES(), QUICK(), ECHO({ name: 'Encore' }),
    UNIQUE('bouncy', 'Bouncy Castle', 10, 'Charged balls bounce off walls twice and hop on to one more foe after a hit.')),
};
C.decoy = {
  ready: true, tune: { dmg: [0.77, 0.63, 0.57], shape: [0, 0.55, 1] }, base: 0.9, color: '#b8e880', pose: 'ball', title: 'Giant Squeaker', summon: true,
  blurb: 'An empowered rubber chicken: bigger, tougher, louder and stinkier.',
  lure: [2, 3, 4], cloud: [1.25, 1.4, 1.6], dmg: [1.3, 1.6, 2], dur: [2, 3, 4], size: [1.6, 2, 2.4],
  apply(p, s) { p.life = Math.round(p.life * by(STAGE_MULT, s)); p.lureRadius = r1(p.lureRadius + by(this.lure, s)); p.cloudRadius = r2(p.cloudRadius * by(this.cloud, s)); p.dmgPct *= by(this.dmg, s); p.duration = r1(p.duration + by(this.dur, s)); p.size = by(this.size, s); return p; },
  lines(p) { return [`Decoy life ${p.life} · lasts ${p.duration}s`, `Lures foes within ${p.lureRadius} m · stink ${pct(p.dmgPct)} in ${p.cloudRadius} m`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('double', 'Double Trouble', 6, 'A charged toss throws a second decoy beside the first (60% life).', { extra: { life: 0.6 } }),
    UNIQUE('finale', 'Big Squeak Finale', 10, 'A charged decoy bursts in a stink nova when it pops: 150% in 3 m and a 1s stun.', { extra: { pct: 150, r: 3, stun: 1 } })),
};
C.blaze = {
  ready: true, tune: { dmg: [0.67, 0.52, 0.45], shape: [0.5, 1, 1] }, base: 0.9, color: '#ff9a3c', pose: 'ball', title: 'Bonfire Ball',
  blurb: 'A bigger blast and a larger, longer-burning fire.',
  radius: [1.3, 1.5, 1.75], burn: [1.5, 2.5, 4], burnPct: [1.2, 1.4, 1.6],
  apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.burnDuration = r1(p.burnDuration + by(this.burn, s)); p.burnPct *= by(this.burnPct, s); return p; },
  lines(p) { return [`Fire blast: ${pct(p.dmgPct)} in ${p.radius} m`, `Burning ground: ${pct(p.burnPct)} per second for ${p.burnDuration}s`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('hotPotato', 'Hot Potato', 4, 'The charged ball skips twice along the ground before the big blast; each skip is a small 50% blast.', { extra: { hops: 2, pct: 50 } }),
    UNIQUE('campfire', 'Campfire', 10, 'The charged fire warms the pack: you, Shadow and the pups heal 3% life per second while standing in it.', { extra: { heal: 3 } })),
};
C.fetchstorm = {
  ready: true, tune: { dmg: [1.01, 1.02, 0.99], shape: [1, 1, 1] }, base: 1.1, color: '#ffe08a', pose: 'sky', title: 'Monsoon of Balls',
  blurb: 'Far more balls over a wider area.',
  count: [1.3, 1.6, 2.0], radius: [1.15, 1.3, 1.5], dmg: [1.1, 1.2, 1.35],
  apply(p, s) { p.count = Math.round(p.count * by(this.count, s)); p.radius = r2(p.radius * by(this.radius, s)); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Balls: ${p.count} over ${p.duration}s in ${p.radius} m`, `Damage each: ${pct(p.dmgPct)}`]; },
  perks: set(STAGES(), QUICK(), FOCUS(),
    UNIQUE('bigOne', 'The Big One', 12, 'The storm ends with a giant beach ball crashing into the middle: 80% in 3.5 m and a big knockback.', { extra: { pct: 80, r: 3.5 } })),
};

// =================================================================== CHEWY · PACK SPIRIT
C.woof = {
  ready: true, tune: { dmg: [0.67, 0.51, 0.42], shape: [0, 1, 1] }, base: 0.9, color: '#bfe6ff', pose: 'breath', title: 'Sonic Bark',
  blurb: 'A forward bark cone that reaches twice as far, knocks back further and stuns longer.',
  cone: [90, 100, 110], knock: [1.6, 2, 2.5],
  apply(p, s, k) { p.cone = by(this.cone, s); p.reach = r2(p.radius * 2); p.dmgPct *= by(STAGE_MULT, s); p.stun = r2(p.stun * by(STAGE_MULT, s)); p.knockback = r2(p.knockback * by(this.knock, s)); return p; },
  lines(p) { return [`Bark cone: ${p.cone}° reaching ${p.reach} m`, `${pct(p.dmgPct)} · stun ${p.stun}s · knockback ${x(p.knockback / 2.5)}`]; },
  perks: set(STAGES(), QUICK(), ECHO({ name: 'Echo Bark' }),
    UNIQUE('bigBad', 'Big Bad Woof', 10, 'Foes hit by a charged bark are scared stiff for 2.5s: they flee and take +25% damage.', { extra: { fear: 2.5, vuln: 25 } })),
};
C.zoom = {
  ready: true, tune: { dmg: [0.8, 0.71, 0.58], shape: [0, 1, 1] }, base: 0.85, color: '#ffd8a0', pose: 'crouch', title: 'Turbo Zoomies',
  blurb: 'A much longer dash that leaves a damaging zoom trail behind.',
  dmg: [1.25, 1.5, 2], trailPct: [6, 10, 15], trail: [1, 1.5, 2],
  apply(p, s) { p.distance = r2(p.distance * by(STAGE_MULT, s)); p.dmgPct *= by(this.dmg, s); p.trailPct = by(this.trailPct, s); p.trail = by(this.trail, s); return p; },
  lines(p) { return [`Dash ${p.distance} m: ${pct(p.dmgPct)}`, `Zoom trail: ${p.trailPct}% every 0.5s for ${p.trail}s`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('pingpong', 'Ping-Pong', 4, 'At the end of a charged dash Chewy rebounds halfway back, hitting everything again.'),
    UNIQUE('afterimage', 'Afterimage', 10, 'A charged dash leaves a ghostly Chewy at the start that taunts foes for 3s, then pops for 40%.', { extra: { taunt: 3, pct: 40 } })),
};
C.packcall = {
  ready: true, base: 0.9, color: '#9fd8ff', pose: 'breath', title: 'Alpha Pup', summon: true,
  blurb: 'Calls an empowered alpha pup: bigger and tougher, with more pups at higher stages.',
  alpha: [1.6, 2.2, 3], extra: [0, 1, 2],
  apply(p, s) { p.alpha = by(this.alpha, s); p.pups += by(this.extra, s); p.alphaHowl = s >= 3; return p; },
  lines(p) { return [`Alpha pup: ${x(p.alpha)} life and bite`, `Spirit pups: ${p.pups}`, ...(p.alphaHowl ? ['The alpha howls on arrival: foes in 3 m are chilled (−40% speed, 2s)'] : [])]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('packLeader', 'Pack Leader', 4, 'A charged call sends Shadow into a 6s frenzy: +30% attack speed.', { extra: { t: 6, aspd: 30 } }),
    UNIQUE('spiritWolf', 'Spirit Wolf', 10, 'At Stage Ⅲ the alpha arrives as a Spirit Wolf: much bigger, with a pouncing leap.', { needs: { stages: 2 } })),
};
C.treat = {
  ready: true, base: 0.9, color: '#fff0b0', pose: 'ball', title: 'Big Biscuit',
  blurb: 'A huge glowing biscuit: much more healing in a wider burst.',
  radius: [1.25, 1.4, 1.6],
  apply(p, s) { const m = by(STAGE_MULT, s); p.healPct = r1(p.healPct * m); p.healFlat = Math.round(p.healFlat * m); p.radius = r2(p.radius * by(this.radius, s)); p.dmgPct *= m; return p; },
  lines(p) { return [`Heals ${p.healPct}% life + ${p.healFlat} in ${p.radius} m`, `Holy crumbs: ${pct(p.dmgPct)}`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('picnic', 'Picnic', 6, 'A charged toss lays a picnic blanket (3 m) for 4 / 5 / 6s by stage: allies heal 3% life per second, foes on it take 25% holy per second.', { extra: { r: 3, dur: [4, 5, 6], heal: 3, pct: 25 } }),
    UNIQUE('shower', 'Treat Shower', 10, 'The big biscuit bursts into 6 mini treats that scatter 3 m; each heals or zaps where it lands (25%).', { extra: { n: 6, pct: 25 } })),
};
C.howl = {
  ready: true, base: 1.0, color: '#ffb080', pose: 'breath', title: 'Rallying Howl',
  blurb: 'A longer, stronger rally with a wider fear.',
  buff: [1.15, 1.3, 1.5], dur: [1.3, 1.6, 2], radius: [2, 3, 4], fear: [1.3, 1.6, 2],
  apply(p, s) { p.duration = r1(p.duration * by(this.dur, s)); p.dmgBuff = Math.round(p.dmgBuff * by(this.buff, s)); p.radius += by(this.radius, s); p.fear = r2(p.fear * by(this.fear, s)); return p; },
  lines(p) { return [`+${p.dmgBuff}% damage for ${p.duration}s`, `Fear: ${p.fear}s in ${p.radius} m`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('secondWind', 'Second Wind', 4, 'A charged howl heals you, Shadow and the pups for 10 / 15 / 20% life by stage.', { extra: { heal: [10, 15, 20] } }),
    UNIQUE('moonlit', 'Moonlit Rally', 10, 'While a charged howl lasts, all your charges fill 25% faster.', { extra: { speed: 1.25 } })),
};
C.moonhowl = {
  ready: true, tune: { dmg: [0.84, 0.72, 0.59], shape: [0.05, 0.05, 0.05] }, base: 1.1, color: '#dfe8ff', pose: 'breath', title: 'Moonfall',
  blurb: 'More moonbeams with wider strikes.',
  strikes: [3, 5, 8], strikeR: [1.2, 1.35, 1.5], dmg: [1.2, 1.4, 1.7],
  apply(p, s) { p.strikes += by(this.strikes, s); p.strikeRadius = r2(p.strikeRadius * by(this.strikeR, s)); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Moonbeams: ${p.strikes}`, `Holy damage each: ${pct(p.dmgPct)} in ${p.strikeRadius} m`]; },
  perks: set(STAGES(), QUICK(), FOCUS(),
    UNIQUE('eclipse', 'Lunar Eclipse', 12, 'At Stage Ⅲ the area turns to night for 4s: 8% holy every 0.5s, and foes are blinded (they can’t attack and stumble about, −40% speed).', { needs: { stages: 2 }, extra: { dur: 4, pct: 8 } })),
};

// =================================================================== MOKA · TIDEWATER
C.splash = {
  ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0, 0.1, 0.2] }, base: 0.75, color: '#5ce0d0', pose: 'staff', title: 'Big Splash',
  blurb: 'A bigger orb with a much larger splash ring that slows.',
  radius: [1.5, 1.8, 2.2], chill: [0.45, 0.5, 0.55], chillDur: [1.6, 2, 2.4], size: [1.6, 1.9, 2.2], splashPct: 75,
  apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.splashRadius = r2(p.splashRadius * by(this.radius, s)); p.splashPct = this.splashPct; p.chill = by(this.chill, s); p.chillDur = r1(p.chillDur * by(this.chillDur, s)); p.size = by(this.size, s); p.speed = r1(p.speed * 0.9); return p; },
  lines(p) { return [`Water damage: ${pct(p.dmgPct)}`, `Splash: ${p.splashPct}% within ${p.splashRadius} m`, `Slows by ${Math.round(p.chill * 100)}% for ${p.chillDur}s`]; },
  perks: set(STAGES(), QUICK(), SPLIT({ what: 'orb', pct: 50, spread: 10 }),
    UNIQUE('rain', 'Rain Shower', 8, 'A charged bolt bursts into a rain of mini bolts over 2.5 m: 5 / 7 / 9 by stage, 12% each with a little splash.', { extra: { n: [5, 7, 9], pct: 12, r: 2.5 } })),
};
C.bubble = {
  ready: true, base: 0.9, color: '#9ff6ff', pose: 'bubble', title: 'Mega Bubble',
  blurb: 'A much bigger bubble that soaks far more and pops harder.',
  radius: [1.3, 1.5, 1.75],
  apply(p, s) { const m = by(STAGE_MULT, s); p.absorb = Math.round(p.absorb * m); p.radius = r2(p.radius * by(this.radius, s)); p.dmgPct *= m; p.knockback = r2(p.knockback * 1.4); return p; },
  lines(p) { return [`Absorbs ${p.absorb} damage`, `Pop: ${pct(p.dmgPct)} in ${p.radius} m`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('wrap', 'Bubble Wrap', 4, 'A charged bubble also wraps Shadow and the Spirit Retriever (40% as strong).', { extra: { k: 0.4 } }),
    UNIQUE('bounce', 'Bounce House', 10, 'Foes that touch a charged bubble boing back 2 m and are chilled (once per second each).')),
};
C.shake = {
  ready: true, tune: { dmg: [0.91, 0.91, 0.79], shape: [1, 1, 1] }, base: 0.9, color: '#8ff0ff', pose: 'shake', title: 'Big Shake',
  blurb: 'A bigger, colder shake; at Stage Ⅲ it freezes foes solid for a moment.',
  radius: [1.3, 1.5, 1.75],
  apply(p, s) { const m = by(STAGE_MULT, s); p.dmgPct *= m; p.radius = r2(p.radius * by(this.radius, s)); p.chillDur = r1(p.chillDur * m); p.freeze = s >= 3 ? 0.8 : 0; return p; },
  lines(p) { return [`Water damage: ${pct(p.dmgPct)} in ${p.radius} m`, `Chills for ${p.chillDur}s`, ...(p.freeze ? [`Freezes for ${p.freeze}s`] : [])]; },
  perks: set(STAGES(), QUICK(), ECHO({ name: 'Second Shake' }),
    UNIQUE('puddles', 'Puddle Party', 10, 'A charged shake leaves 3 / 4 / 5 chilly puddles around Moka for 5s (−40% speed to foes in them).', { extra: { n: [3, 4, 5], dur: 5 } })),
};
C.puddleHop = {
  ready: true, tune: { dmg: [0.67, 0.52, 0.43], shape: [0.5, 1, 1] }, base: 0.85, color: '#7ee8f0', pose: 'crouch', title: 'Cannonball',
  blurb: 'A longer hop and a much bigger arrival splash.',
  range: [1.3, 1.5, 1.75], radius: [1.4, 1.7, 2],
  apply(p, s) { p.range = r1(p.range * by(this.range, s)); p.radius = r2(p.radius * by(this.radius, s)); p.dmgPct *= by(STAGE_MULT, s); p.knockback = r2(p.knockback * 1.5); return p; },
  lines(p) { return [`Hop up to ${p.range} m`, `Arrival splash: ${pct(p.dmgPct)} in ${p.radius} m`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('returnTrip', 'Return Trip', 4, 'The dive puddle stays for 4s: Puddle Hop again in that time to hop back to it for free.', { extra: { t: 4 } }),
    UNIQUE('hopscotch', 'Hopscotch', 10, 'A charged hop bounces on to 2 more foes within 5 m, splashing each for 60%.', { extra: { n: 2, r: 5, pct: 60 } })),
};
C.whirlpool = {
  ready: true, tune: { dmg: [0.91, 0.84, 0.75], shape: [0, 0.1, 0.15] }, base: 1.0, color: '#4fd8e0', pose: 'staff', title: 'Maelstrom',
  blurb: 'A bigger, longer whirlpool with a much stronger pull.',
  radius: [1.25, 1.45, 1.7], pull: [1.4, 1.7, 2], dmg: [1.1, 1.2, 1.35],
  apply(p, s) { p.radius = r2(p.radius * by(this.radius, s)); p.duration = r1(p.duration * by(STAGE_MULT, s)); p.pull = r2(p.pull * by(this.pull, s)); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Radius ${p.radius} m · lasts ${p.duration}s`, `Churn: ${pct(p.dmgPct)} every ${p.tick}s · pull ${p.pull} m/s`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('riptide', 'Riptide', 6, 'A charged whirlpool drifts after your cursor at 1.5 m/s.', { extra: { speed: 1.5 } }),
    UNIQUE('geyser', 'Geyser', 10, 'A charged whirlpool ends in a geyser: 250% in its radius, and foes are launched (1s stun).', { extra: { pct: 250, stun: 1 } })),
};
C.greatWave = {
  ready: true, tune: { dmg: [0.84, 0.67, 0.49], shape: [1, 1, 1] }, base: 1.1, color: '#35c4d6', pose: 'staff', title: 'Rogue Wave',
  blurb: 'A wider, harder-hitting wave with a longer chill and a longer surf.',
  width: [1.25, 1.45, 1.7], chill: [1.3, 1.6, 2],
  apply(p, s, k) { p.dmgPct *= by(STAGE_MULT, s); p.width = r1(p.width * by(this.width, s)); p.chillDur = r1(p.chillDur * by(this.chill, s)); p.surf = r1(p.surf * 1.3); if (k.tsunami && s >= 3) { p.length = r1(p.length * 2); p.carry = true; } return p; },
  lines(p) { return [`Water damage: ${pct(p.dmgPct)}`, `Rolls ${p.length} m · ${p.width} m wide${p.carry ? ', carrying foes to the end' : ''}`, `Chills for ${p.chillDur}s`]; },
  perks: set(STAGES(), QUICK(), FOCUS(),
    UNIQUE('tsunami', 'Tsunami', 12, 'Stage Ⅲ waves travel twice as far and carry foes all the way (even bosses, a little).', { needs: { stages: 2 } })),
};

// =================================================================== MOKA · STARLIGHT KIBBLE
C.kibble = {
  ready: true, tune: { dmg: [0.96, 0.85, 0.74], shape: [0.55, 0.55, 0.55] }, base: 0.75, color: '#ffd36a', pose: 'staff', title: 'Kibble Swarm',
  blurb: 'A bigger handful of kibble that homes in harder.',
  count: [2, 4, 6], dmg: [1.15, 1.3, 1.5],
  apply(p, s) { p.count += by(this.count, s); p.homing = r1(p.homing * 1.6); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Missiles: ${p.count} · ${pct(p.dmgPct)} each`, 'Homes in much harder'] },
  perks: set(STAGES(), QUICK(), ECHO({ name: 'Encore' }),
    UNIQUE('twinkle', 'Twinkle Twinkle', 8, 'Each charged kibble that hits leaves a twinkle that bursts 0.8s later: 30% in 1.2 m.', { extra: { pct: 30, r: 1.2, delay: 0.8 } })),
};
C.squeak = {
  ready: true, tune: { dmg: [0.68, 0.58, 0.44], shape: [1, 1, 1] }, base: 0.9, color: '#ffb0dc', pose: 'sky', title: 'Mega Squeak',
  blurb: 'A bigger, louder squeak that stuns far longer.',
  radius: [1.3, 1.5, 1.75],
  apply(p, s) { const m = by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.stun = r2(p.stun * m); p.dmgPct *= m; return p; },
  lines(p) { return [`Starlight damage: ${pct(p.dmgPct)} in ${p.radius} m`, `Stun: ${p.stun}s`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('squeakSqueak', 'Squeak Squeak', 4, 'The charged nova squeaks again 1 / 2 / 3 more times by stage (25% each).', { extra: { n: [1, 2, 3], pct: 25 } }),
    UNIQUE('stars', 'Seeing Stars', 10, 'Foes stunned by a charged squeak shower their neighbours with stars: 12% every 0.5s while stunned.', { extra: { pct: 12 } })),
};
C.pawRune = {
  ready: true, tune: { dmg: [0.67, 0.58, 0.47], shape: [0.85, 1, 1] }, base: 0.9, color: '#c8b0ff', pose: 'staff', title: 'Grand Paw',
  blurb: 'A bigger rune that arms instantly and tugs nearby foes toward it.',
  radius: [1.3, 1.5, 1.75], lure: 4,
  apply(p, s) { p.radius = r2(p.radius * by(this.radius, s)); p.dmgPct *= by(STAGE_MULT, s); p.arm = 0; p.lure = this.lure; p.stun = r2(p.stun * 1.5); return p; },
  lines(p) { return [`Eruption: ${pct(p.dmgPct)} in ${p.radius} m`, `Arms at once and tugs foes within ${p.lure} m toward it`]; },
  perks: set(STAGES(), QUICK(), SPLIT({ name: 'Paw Prints', what: 'rune', pct: 50 }),
    UNIQUE('parade', 'Paw Parade', 10, 'A charged rune’s eruption stamps 2 small runes (50%) where it flung foes.', { extra: { n: 2, pct: 50 } })),
};
C.moonbeam = {
  ready: true, tune: { dmg: [0.8, 0.67, 0.59], shape: [0, 0, 0.05] }, base: 0.9, color: '#e8ecff', pose: 'sky', title: 'Full Moon', channel: true,
  blurb: 'Hold to gather the moon: at Stage Ⅰ a bigger beam comes down and keeps growing while held; let go and it lingers on its own, then bursts.',
  grow: [1.25, 1.5, 1.75], linger: [0.6, 0.9, 1.2], burstPct: 70,
  apply(p, s) { const g = by(this.grow, s); p.radius = r2(p.radius * g); p.dmgPct *= g; p.linger = by(this.linger, s); p.burstPct = this.burstPct; return p; },
  lines(p) { return [`Beam radius ${p.radius} m · ${pct(p.dmgPct)} per tick`, `Lingers ${p.linger}s after you let go, then bursts: ${p.burstPct}% in 2 m`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('twin', 'Twin Moons', 6, 'From Stage Ⅱ a second, smaller beam (30%) circles the first.', { needs: { stages: 1 }, extra: { pct: 30 } }),
    UNIQUE('crescent', 'Crescent Cut', 10, 'The lingering beam ends in a crescent wave that sweeps 5 m: 70%.', { extra: { pct: 70, r: 5 } })),
};
C.constellation = {
  ready: true, tune: { dmg: [1.15, 1.23, 1.28], shape: [1, 1, 1] }, base: 0.9, color: '#b89aff', pose: 'staff', title: 'Great Constellation',
  blurb: 'More stars over longer links, and a brighter second twinkle.',
  links: [2, 3, 5], twinkle: [60, 80, 100], dmg: [1.15, 1.3, 1.5],
  apply(p, s) { p.links += by(this.links, s); p.linkRange = r1(p.linkRange * 1.3); p.twinklePct = by(this.twinkle, s); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Links up to ${p.links} foes (${p.linkRange} m)`, `${pct(p.dmgPct)} per star · twinkle +${p.twinklePct}%`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('chart', 'Star Chart', 4, 'The lines stay for 3s as starlight threads: 30% zap every 0.5s to foes touching them.', { extra: { t: 3, pct: 30 } }),
    UNIQUE('dipper', 'Big Dipper', 10, 'When 7 or more stars link, a giant ladle of starlight scoops down on the middle: 250% in 3 m.', { extra: { min: 7, pct: 250, r: 3 } })),
};
C.meteor = {
  ready: true, tune: { dmg: [0.81, 0.63, 0.46], shape: [1, 1, 1] }, base: 1.1, color: '#ffb04a', pose: 'sky', title: 'Mega Meteor',
  blurb: 'A bigger biscuit, a bigger crater, more crumbs.',
  radius: [1.3, 1.5, 1.75],
  size: [1.1, 1.2, 1.3],
  apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.burnPct *= 1.5; p.stun = r2(p.stun * 1.5); p.size = by(this.size, s); return p; },
  lines(p) { return [`Impact: ${pct(p.dmgPct)} in ${p.radius} m + ${p.stun}s stun`, `Toasty crumbs: ${pct(p.burnPct)} per second`]; },
  perks: set(STAGES(), QUICK(), FOCUS(),
    UNIQUE('shower', 'Meteor Shower', 12, 'A Stage Ⅲ meteor is followed by 4 smaller biscuits around the crater (25% each).', { needs: { stages: 2 }, extra: { n: 4, pct: 25 } })),
};

// =================================================================== MOKA · DUCK HUNT
C.duckDecoy = {
  ready: true, tune: { dmg: [0.67, 0.59, 0.53], shape: [0.65, 1, 1] }, base: 0.9, color: '#ffd84a', pose: 'twirl', title: 'Mother Duck', summon: true,
  blurb: 'An empowered rubber duck: bigger, tougher, with a wider lure and a bigger pop.',
  lure: [2, 3, 4], pop: [1.25, 1.4, 1.6], size: [1.3, 1.5, 1.7],
  apply(p, s) { const m = by(STAGE_MULT, s); p.life = Math.round(p.life * m); p.lureRadius = r1(p.lureRadius + by(this.lure, s)); p.dmgPct *= m; p.popRadius = r2(p.popRadius * by(this.pop, s)); p.size = by(this.size, s); return p; },
  lines(p) { return [`Duck life ${p.life} · lures within ${p.lureRadius} m`, `Pop: ${pct(p.dmgPct)} in ${p.popRadius} m`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('ducklings', 'Ducklings', 4, 'The Mother Duck brings 2 / 3 / 4 ducklings by stage; each pops for 30% when bitten.', { extra: { n: [2, 3, 4], pct: 30 } }),
    UNIQUE('quackAttack', 'Quack Attack', 10, 'The Mother Duck’s pop is a quack shockwave: everything within 4 m is dazed for 1.5s.', { extra: { r: 4, stun: 1.5 } })),
};
C.fetchLeash = {
  ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0, 0, 0] }, base: 0.85, color: '#ffb04a', pose: 'staff', title: 'Long Leash',
  blurb: 'A much longer leash, and the yank slams the foe down at Moka’s paws with a splash.',
  range: [1.4, 1.7, 2], slamPct: [10, 18, 25],
  apply(p, s, k) { const m = by(STAGE_MULT, s); p.range = r1(p.range * by(this.range, s)); p.stun = r2(p.stun * m); p.dmgPct *= m; p.slamPct = by(this.slamPct, s); p.grabs = k.double && s >= 2 ? 2 : 1; return p; },
  lines(p) { return [`Range ${p.range} m · ${pct(p.dmgPct)} · stun ${p.stun}s`, `The slam splashes ${p.slamPct}% around Moka${p.grabs > 1 ? ` · grabs ${p.grabs} foes` : ''}`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('double', 'Double Leash', 6, 'From Stage Ⅱ a charged leash grabs two foes.'),
    UNIQUE('fling', 'Fling', 10, 'Yanked foes sail over Moka and land behind her: 50% to every foe where they land.', { extra: { pct: 50 } })),
};
C.feathers = {
  ready: true, tune: { dmg: [0.91, 0.84, 0.75], shape: [0, 0.45, 0.65] }, base: 0.8, color: '#ffc070', pose: 'staff', title: 'Feather Storm',
  blurb: 'A huge fan of feathers that pierce deeper and fly further.',
  count: [3, 5, 8], pierce: [1, 2, 3], dmg: [1.1, 1.2, 1.35],
  apply(p, s) { p.count = Math.min(20, p.count + by(this.count, s)); p.pierce += by(this.pierce, s); p.range = r1(p.range * 1.2); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Feathers: ${p.count} · ${pct(p.dmgPct)} each`, `Each pierces ${p.pierce} foes · range ${p.range} m`]; },
  perks: set(STAGES(), QUICK(), ECHO({ name: 'Second Flurry' }),
    UNIQUE('pillow', 'Pillow Fight', 8, 'Charged feathers stick; a foe with 3 in it puffs into fluff: 60% damage and a 1s stun.', { extra: { n: 3, pct: 60, stun: 1 } })),
};
C.duckCall = {
  ready: true, tune: { dmg: [0.85, 0.64, 0.47], shape: [1, 1, 1] }, base: 0.9, color: '#8fd068', pose: 'call', title: 'Big Honk',
  blurb: 'A louder call over a wider area, with a much longer daze.',
  radius: [1.3, 1.5, 1.75],
  apply(p, s) { const m = by(STAGE_MULT, s); p.radius = r1(p.radius * by(this.radius, s)); p.stun = r2(p.stun * m); p.dmgPct *= m; return p; },
  lines(p) { return [`Drags foes within ${p.radius} m to the lure`, `Daze: ${p.stun}s · damage ${pct(p.dmgPct)}`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('crumbs', 'Bread Crumbs', 4, 'Gathered foes linger at the lure 2s longer, slowed by 50%.', { extra: { t: 2, slow: 0.5 } }),
    UNIQUE('goose', 'Goose!', 10, 'A Stage Ⅲ call brings an angry spectral goose that honks and bites the crowd 3 times (60% each).', { needs: { stages: 2 }, extra: { n: 3, pct: 60 } })),
};
C.spiritRetriever = {
  ready: true, tune: { dmg: [0.8, 0.9, 0.73], shape: [0, 1, 1] }, base: 1.0, color: '#ffe08a', pose: 'twirl', title: 'Golden Retriever', summon: true,
  blurb: 'An empowered, golden spirit retriever: bigger, tougher and harder-biting.',
  dmg: [1.25, 1.5, 1.85], size: [1.15, 1.3, 1.45],
  apply(p, s) { p.life = Math.round(p.life * by(STAGE_MULT, s)); p.dmgPct *= by(this.dmg, s); p.size = by(this.size, s); p.barkStun = r2(p.barkStun * 1.5); p.golden = true; return p; },
  lines(p) { return [`Life ${p.life} · bite ${pct(p.dmgPct)}`, `Bigger (${x(p.size)}) · dazing bark ${p.barkStun}s`]; },
  perks: set(STAGES(), QUICK(),
    UNIQUE('goodGirl', 'Good Girl!', 6, 'A charged summon heals the retriever fully and sends it into a 6s frenzy (+40% bite speed), even if it is already out.', { extra: { t: 6, aspd: 40 } }),
    UNIQUE('puppy', 'Puppy Pal', 12, 'At Stage Ⅲ a spirit puppy comes along too (40% of the retriever).', { needs: { stages: 2 }, extra: { k: 0.4 } })),
};
C.mallards = {
  ready: true, tune: { dmg: [0.84, 0.72, 0.66], shape: [0, 0, 1] }, base: 1.1, color: '#c8fff4', pose: 'sky', title: 'Great V',
  blurb: 'A bigger squadron over a wider area.',
  count: [2, 4, 6], area: [1.15, 1.3, 1.5], dmg: [1.2, 1.4, 1.7],
  apply(p, s) { p.count += by(this.count, s); p.area = r2(p.area * by(this.area, s)); p.dmgPct *= by(this.dmg, s); return p; },
  lines(p) { return [`Mallards: ${p.count} over ${p.area} m`, `Dive damage each: ${pct(p.dmgPct)}`]; },
  perks: set(STAGES(), QUICK(), FOCUS(),
    UNIQUE('loop', 'Loop-de-Loop', 12, 'After diving, the squadron loops round and dives again at 50%.', { needs: { stages: 2 }, extra: { pct: 50 } })),
};

for (const id in C) {
  const c = C[id]; c.id = id;
  for (const pid in c.perks) c.perks[pid].id = pid;
  if (SKILLS[id]) SKILLS[id].charge = c; // (the skill def carries its charge table too: SKILLS.chomp.charge)
}
export const CHARGE = C;
export const CHARGE_IDS = Object.keys(C);

// ------------------------------------------------------------------ helpers (all pure)
const P = st => st?.player || {};
/** Perk ranks the active hero bought for a skill → { perkId: rank } (never null). */
export const perksOf = (state, id) => P(state).chargePerks?.[id] || EMPTY;
const EMPTY = Object.freeze({});
/** Is this skill chargeable in play? (its charge table is marked ready once its charged release exists — CHARGE.md §8:
 *  every active skill of both heroes has one since phase 2) */
export const chargeable = id => !!C[id]?.ready;
/** Stages the hero can reach on a skill: 1 + Deeper Charge ranks. */
export const maxStage = (id, state) => (C[id] ? 1 + Math.min(2, perksOf(state, id).stages || 0) : 0);
/** Cumulative stage times [Ⅰ, Ⅱ, Ⅲ] (s) for a charge table + perk ranks; speed > 1 charges faster (Moonlit Rally). */
export function stageTimes(c, k = EMPTY, speed = 1) {
  const q = Math.max(0, 1 - QUICK_PER_RANK * (k.quick || 0)) / Math.max(0.1, speed);
  const a = (c?.base || 0.9) * q, b = a * NEXT_K, cc = b * NEXT_K;
  return [a, a + b, a + b + cc];
}
/** The release cost at a stage: base × (1 + surcharge × stage); Efficient Focus lowers the surcharge. */
export const surcharge = (k = EMPTY) => Math.max(0, SURCHARGE - FOCUS_PER_RANK * (k.focus || 0));
export const chargeCost = (cost, stage, k = EMPTY) => r1((cost || 0) * (1 + surcharge(k) * Math.max(0, stage)));
/** Highest stage reached after holding t seconds (0 = not yet Ⅰ), capped at max. */
export function stageAt(t, times, max = 3) { let s = 0; for (let i = 0; i < Math.min(max, 3); i++) if (t >= times[i] - 1e-9) s = i + 1; return s; }

/**
 * The charged runtime of a skill at `stage` (CHARGE.md §5): skillRuntime() with the charged params, the stage cost and
 * a `charge` record { stage, perks, color, title, base } the casts read. stage ≤ 0 (or a skill with no charge table)
 * returns the normal runtime. o.free → the normal cost (Second Helping's follow-up).
 */
export function chargeRuntime(id, state, derived, stage, o = {}) {
  const R = skillRuntime(id, state, derived);
  const c = C[id];
  if (!R || !c || !(stage > 0)) return R;
  const k = perksOf(state, id);
  const s = Math.max(1, Math.min(stage, o.preview ? 3 : maxStage(id, state))); // (preview: a locked stage's numbers, for the tooltips)
  const p0 = R.params;
  R.params = c.apply({ ...p0 }, s, k, derived, p0) || R.params;
  if (c.tune && !o.raw) retune(R.params, p0, c.tune, s);
  if (!o.free) R.cost = chargeCost(R.cost, s, k);
  R.charge = { stage: s, perks: k, color: c.color, title: c.title, base: p0, free: !!o.free };
  return R;
}
// ------------------------------------------------------------------ the balance layer (docs/CHARGE.md §9, tools/charge-sim.mjs)
// A table's curves give a charged release its shape and feel; its `tune` keeps the sustained DPS gain in the band
// (+10–30% over tapping). tune.dmg[s-1] scales the damage numbers at stage s; tune.shape[s-1] (0..1) keeps that share of
// the table's growth in area, count and length (the rest of the way back to the tap's value). Solved by
// `node tools/charge-sim.mjs --solve`; the tooltips and the §7 table show the tuned numbers.
const DMG_KEYS = ['dmgPct', 'burnPct', 'pupDmgPct'];
const SHAPE_KEYS = ['radius', 'splashRadius', 'cloudRadius', 'popRadius', 'strikeRadius', 'area', 'width', 'arc', 'wave', 'reach', 'distance', 'duration', 'burnDuration', 'count', 'bounces', 'strikes', 'links'];
const INT_KEYS = new Set(['count', 'bounces', 'strikes', 'links']);
export function retune(p, p0, t, s) {
  const m = t.dmg ? by(t.dmg, s) : 1;
  if (m !== 1) for (const key of DMG_KEYS) if (typeof p[key] === 'number') p[key] *= m;
  const g = Array.isArray(t.shape) ? by(t.shape, s) : t.shape ?? 1; // (per stage, non-decreasing: sizes still grow stage by stage)
  if (g !== 1) for (const key of SHAPE_KEYS) {
    const a = p0[key], b = p[key];
    if (typeof a !== 'number' || typeof b !== 'number' || b <= a) continue;
    const v = a + (b - a) * g;
    p[key] = INT_KEYS.has(key) ? Math.max(a + (b > a ? 1 : 0), Math.round(v)) : r2(v);
  }
  return p;
}
/** perk bonus damage grows with the charge: its pct is PERK_STAGE of the listed value at Stage Ⅰ / Ⅱ / Ⅲ (docs/CHARGE.md §9;
 *  the balance pass: a fully perked Stage Ⅰ mustn't out-damage a full charge) */
export const PERK_STAGE = [0.5, 0.75, 1];
/** a charged release's perk (null if not taken), with its pct scaled to the release's stage */
export function perkAt(R, id) {
  const k = R?.charge?.perks; if (!k?.[id]) return null;
  const p = (R.def?.charge || C[R.id])?.perks?.[id]; if (!p) return null;
  return p.pct == null ? p : { ...p, pct: p.pct * PERK_STAGE[Math.max(0, Math.min(2, (R.charge.stage || 1) - 1))] };
}
/** Tooltip lines for a skill's charged stages: [{ stage, lines, cost, t }] at the hero's current level and perks. */
export function chargeInfo(id, state, derived) {
  const c = C[id]; if (!c) return [];
  const out = [], k = perksOf(state, id), times = stageTimes(c, k);
  for (let s = 1; s <= 3; s++) {
    const R = chargeRuntime(id, state, derived, s, { preview: true }); if (!R?.charge) break;
    out.push({ stage: s, lines: c.lines(R.params, s, k, R.charge.base), cost: R.cost, t: r2(times[s - 1]), locked: s > maxStage(id, state) });
  }
  return out;
}

// ------------------------------------------------------------------ perks: rules + spending
/** Can the active hero buy the next rank of a perk right now? → { ok, why, rank, need } */
export function canLearnPerk(id, perkId, state) {
  const def = SKILLS[id], c = C[id], perk = c?.perks?.[perkId];
  if (!def || !perk) return { ok: false, why: 'Unknown perk' };
  const pl = P(state);
  if (def.cls && def.cls !== (pl.cls || 'chewy')) return { ok: false, why: "Another hero's skill" };
  const base = pl.skills?.[id] || 0, k = perksOf(state, id), rank = k[perkId] || 0;
  if (rank >= perk.ranks) return { ok: false, why: 'Mastered!', rank };
  if (base <= 0) return { ok: false, why: `Learn ${def.name} first`, rank, need: perk.req[0] };
  const need = perk.req[Math.min(rank, perk.req.length - 1)];
  if (base < need) return { ok: false, why: `Requires ${def.name} level ${need}`, rank, need };
  for (const q in perk.needs || {}) if ((k[q] || 0) < perk.needs[q]) return { ok: false, why: `Requires ${q === 'stages' ? `Stage ${NUMERAL[1 + perk.needs[q]]}` : c.perks[q]?.name || q}`, rank, need };
  if ((pl.skillPts || 0) <= 0) return { ok: false, why: 'No skill points', rank, need };
  return { ok: true, why: '', rank, need };
}
/** Spend a skill point on a perk (mutates the active hero). → { ok, why, rank } */
export function learnPerk(state, id, perkId) {
  const c = canLearnPerk(id, perkId, state);
  if (!c.ok) return c;
  const pl = state.player, all = pl.chargePerks || (pl.chargePerks = {}), k = all[id] || (all[id] = {});
  k[perkId] = (k[perkId] || 0) + 1;
  pl.skillPts--;
  return { ok: true, why: '', rank: k[perkId] };
}
/** Skill points the active hero has in charge perks (respec refunds them). */
export function perkPoints(state) { let n = 0; const all = P(state).chargePerks || {}; for (const id in all) for (const q in all[id]) n += all[id][q] || 0; return n; }
/** Has the hero bought any charge perk on this skill? (the hotbar's ⚡ badge) */
export const hasPerks = (state, id) => { const k = perksOf(state, id); for (const q in k) if (k[q] > 0) return true; return false; };
