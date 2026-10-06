// Poe's charge tables (docs/CHARGE.md §7, docs/POE.md §3): every active skill of her three trees charges like Chewy's
// and Moka's. rpg/charge.js calls poeCharge(kit) with its perk-family builders and merges the result into its table
// (so this module imports nothing from charge.js: no import cycle). Same contract as charge.js' entries: { ready, base,
// color, pose, title, blurb, apply(p, s, k) → p, lines(p) → [..], perks, tune? }; apply gets a COPY of the skill's params
// at its level, the stage s (1..3) and the perk ranks k. The releases are combat/chargedPoe.js; the wind-up poses
// (pose: 'poeFuma' …) are actors/poePoses.js POE_CHARGE_POSES. A table's tune is solved by tools/charge-sim.mjs --solve;
// its dmg also scales the damage keys charge.js' retune doesn't know (stackPct, burstPct, clonePct: `dm` below).
export function poeCharge({ STAGES, QUICK, FOCUS, SPLIT, WIDE, ECHO, UNIQUE, set, STAGE_MULT, by, r1, r2, pct, x }) {
  const C = {};
  const dm = (c, s) => (c.tune?.dmg ? by(c.tune.dmg, s) : 1); // (the balance layer for Poe's own damage keys)

  // =================================================================== SHURIKEN ARTS
  C.fumaThrow = {
    ready: true, tune: { dmg: [0.79, 0.64, 0.47], shape: [1, 1, 1] }, base: 0.8, color: '#ffd860', pose: 'poeFuma', title: 'Great Fūma',
    blurb: 'Coil the giant fūma back in both paws: it flies out bigger and further, hits harder on both passes, and spins up so fast it whistles.',
    range: [1.25, 1.4, 1.6], radius: [1.25, 1.4, 1.6],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.range = r1(p.range * by(this.range, s)); p.speed = r1(p.speed * by(this.range, s)); p.radius = r2(p.radius * by(this.radius, s)); p.size = by([1.2, 1.32, 1.45], s); p.knockback = r2(p.knockback * 1.6); return p; },
    lines(p) { return [`Fūma: ${pct(p.dmgPct)} per pass, ${p.range} m out and back`, `Cuts ${p.radius} m wide · ${x(p.size)} size`]; },
    perks: set(STAGES(), QUICK(), SPLIT({ name: 'Twin Fūma', what: 'smoky fūma', pct: 50 }),
      UNIQUE('orbit', 'Orbiting Fūma', 10, 'At the end of its flight the charged fūma circles there for 0.6 / 0.9 / 1.2s by stage, cutting everything within 1.6 m every 0.3s (50%).', { extra: { t: [0.6, 0.9, 1.2], r: 1.6, every: 0.3, pct: 50 } })),
  };
  C.kunaiFan = {
    ready: true, base: 0.75, color: '#f6ecd0', pose: 'poeKunai', title: 'Kunai Storm',
    blurb: 'A much bigger pawful of kunai, fanned tighter and flung harder: up to twice as many at Stage Ⅲ.',
    // (the extra kunai ride on p.extra, not p.count, so a balance tune's growth trim could never take them back: the charge
    // pays in kunai you can see; the curve lands in the band as it is, with no tune)
    more: [2, 4, 6],
    apply(p, s, k) { p.extra = by(this.more, s) + (k.pawful || 0) * s; p.spread = Math.round(p.spread * 0.85); p.speed = r1(p.speed * 1.2); return p; },
    lines(p) { return [`Kunai: ${p.count + (p.extra || 0)} (${p.count} + ${p.extra}) in a ${p.spread}° fan`, `${pct(p.dmgPct)} each, flung at ${p.speed} m/s`]; },
    perks: set(STAGES(), QUICK(), { id: 'pawful', name: 'Bigger Pawful', kind: 'common', icon: 'split', ranks: 2, req: [2, 6], desc: 'More kunai in every charged fan.', info(r) { return `+${r} kunai per stage reached (+${3 * r} at Stage Ⅲ)`; } },
      UNIQUE('tags', 'Exploding Tags', 10, 'Every charged kunai carries a paper tag that pops 0.5s after it lands: 25% fire in 1.2 m.', { extra: { pct: 25, r: 1.2, delay: 0.5 } })),
  };
  C.shadowStitch = {
    ready: true, tune: { dmg: [0.69, 0.68, 0.64], shape: [1, 1, 1] }, base: 0.85, color: '#9a86d8', pose: 'poeKunai', title: 'Grand Stitch',
    blurb: 'The kunai go in deeper: a wider patch of shadows is stitched down, and for much longer.',
    root: [1.5, 2, 2.75], radius: [1.3, 1.5, 1.75],
    apply(p, s, k) { p.root = r2(p.root * by(this.root, s)); p.radius = r2(p.radius * by(this.radius, s) * (1 + (k.wide || 0) * 0.15)); p.dmgPct *= by(STAGE_MULT, s); return p; },
    lines(p) { return [`Stitch: ${pct(p.dmgPct)} (half to its neighbours)`, `Roots foes within ${p.radius} m for ${p.root}s`]; },
    perks: set(STAGES(), QUICK(), WIDE({ what: 'stitch', pct: 15 }),
      UNIQUE('needle', 'Needle and Thread', 8, 'The thread pulls the stitched foes together toward the middle while they’re pinned (1.5 m/s).', { extra: { speed: 1.5 } })),
  };
  C.whirlingFuma = {
    ready: true, tune: { dmg: [0.91, 0.84, 0.75], shape: [0.5, 0.55, 0.6] }, base: 0.9, color: '#ffd860', pose: 'poeFuma', title: 'Buzz-saw Fūma',
    blurb: 'A bigger spare fūma, planted with a flourish: it spins longer, reaches wider and tugs much harder.',
    radius: [1.2, 1.35, 1.5], dur: [1.2, 1.4, 1.6], pull: [1.5, 2, 2.6],
    apply(p, s) { p.radius = r2(p.radius * by(this.radius, s)); p.duration = r1(p.duration * by(this.dur, s)); p.pull = r2(p.pull * by(this.pull, s)); p.dmgPct *= by([1.1, 1.2, 1.35], s); p.size = by([1.15, 1.25, 1.35], s); return p; },
    lines(p) { return [`Buzz-saw: ${pct(p.dmgPct)} every ${p.tick}s in ${p.radius} m`, `Spins ${p.duration}s, tugging foes in at ${p.pull} m/s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('drift', 'Wandering Saw', 6, 'The charged saw drifts toward the nearest foe at 1.5 m/s.', { extra: { speed: 1.5 } }),
      UNIQUE('shrapnel', 'Bone Shrapnel', 10, 'When the charged saw stops it bursts into 8 bone shards that fly out and pierce one foe each (120% of a bite).', { extra: { n: 8, pct: 120 } })),
  };
  C.shurikenRain = {
    ready: true, tune: { dmg: [1.14, 1.18, 1.05], shape: [1, 1, 1] }, base: 1.0, color: '#ffd860', pose: 'poeCrouch', title: 'Shuriken Monsoon',
    blurb: 'Crouch low for a bigger leap: far more shuriken hail down over a wider patch.',
    count: [1.3, 1.6, 2], radius: [1.15, 1.3, 1.5], dmg: [1.1, 1.2, 1.35],
    apply(p, s) { p.count = Math.round(p.count * by(this.count, s)); p.radius = r2(p.radius * by(this.radius, s)); p.dmgPct *= by(this.dmg, s); return p; },
    lines(p) { return [`Shuriken: ${p.count} over ${p.duration}s in ${p.radius} m`, `Damage each: ${pct(p.dmgPct)}`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('bigStar', 'Falling Star', 12, 'A Stage Ⅲ rain ends with one giant bone shuriken slamming the middle: 80% in 2.5 m, and a big knockback.', { needs: { stages: 2 }, extra: { pct: 80, r: 2.5 } })),
  };
  C.thousandStars = {
    ready: true, tune: { dmg: [0.91, 0.84, 0.75], shape: [0.65, 0.65, 0.65] }, base: 1.1, color: '#ffe8a0', pose: 'poeStars', title: 'Galaxy Flurry',
    blurb: 'Wind up the spin: the galaxy of shuriken spreads wider and whirls longer.',
    radius: [1.15, 1.3, 1.45], dur: [1.2, 1.4, 1.6], dmg: [1.1, 1.2, 1.35],
    apply(p, s) { p.radius = r2(p.radius * by(this.radius, s)); p.duration = r1(p.duration * by(this.dur, s)); p.dmgPct *= by(this.dmg, s); p.pull = r2(p.pull * 1.4); return p; },
    lines(p) { return [`Flurry: ${pct(p.dmgPct)} every ${p.tick}s to every foe in ${p.radius} m`, `Lasts ${p.duration}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('supernova', 'Supernova', 12, 'A Stage Ⅲ flurry ends with every star going off at once: 150% of a tick to every foe in reach.', { needs: { stages: 2 }, extra: { pct: 150 } })),
  };

  // =================================================================== NINJUTSU
  C.smokeBomb = {
    ready: true, tune: { dmg: [0.74, 0.62, 0.49], shape: [1, 1, 1] }, base: 0.8, color: '#c8b8f0', pose: 'poeSeal', title: 'Smoke Screen',
    blurb: 'Hold the seal for a much bigger pepper cloud: it blinds longer and hides her for longer.',
    radius: [1.3, 1.5, 1.75], hide: [1.4, 1.8, 2.4],
    apply(p, s) { const m = by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.blind = r1(p.blind * m); p.vanish = r1(p.vanish * by(this.hide, s)); p.dmgPct *= m; p.miss = Math.min(90, p.miss + 5 * s); return p; },
    lines(p) { return [`Bang: ${pct(p.dmgPct)} in ${p.radius} m`, `Blind ${p.blind}s (${p.miss}% miss) · hidden ${p.vanish}s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('pepper', 'Extra Pepper', 4, 'Foes inside a charged cloud cough and sneeze: 30% every second while they’re in it (3s).', { extra: { pct: 30, t: 3 } }),
      UNIQUE('perfect', 'Perfect Stealth', 10, 'A charged smoke bomb never makes her sneeze, and her first hit out of it is a double crit.', { extra: { critX: 2 } })),
  };
  C.puffBall = {
    ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0, 0.4, 0.5] }, base: 0.75, color: '#ff9a4a', pose: 'poePuff', title: 'Great Fireball',
    blurb: 'Puff those cheeks right out: a much bigger fireball with a wider, hotter burst.',
    radius: [1.4, 1.7, 2], burn: [1.2, 1.4, 1.6], size: [1.35, 1.6, 1.9],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.burnPct *= by(this.burn, s); p.splashPct = 75; p.size = by(this.size, s); return p; },
    lines(p) { return [`Fire: ${pct(p.dmgPct)} · ${p.splashPct}% burst in ${p.radius} m`, `Burns ${pct(p.burnPct)} per second for ${p.burnDuration}s`]; },
    perks: set(STAGES(), QUICK(), SPLIT({ name: 'Ember Spit', what: 'fireball', pct: 50 }),
      UNIQUE('bounce', 'Bouncing Ember', 8, 'After its burst the charged fireball hops on to 2 more foes nearby, bursting on each (50%).', { extra: { n: 2, pct: 50 } })),
  };
  C.shadowClone = {
    ready: true, base: 0.9, color: '#9a86d8', pose: 'poeSeal', title: 'Clone Army', summon: true,
    blurb: 'A longer seal for more copies: tougher clones that copy her harder, and a third one from Stage Ⅱ.',
    extra: [0, 1, 1], pctM: [1.1, 1.2, 1.3], life: [1.5, 2, 2.75],
    apply(p, s) { p.clones = Math.min(4, p.clones + by(this.extra, s)); p.clonePct = Math.round(p.clonePct * by(this.pctM, s) * dm(this, s)); p.lifeMul = by(this.life, s); p.duration = r1(p.duration * 1.2); return p; },
    lines(p) { return [`Clones: ${p.clones} · ${Math.round(p.clonePct)}% of your damage`, `Life ${x(p.lifeMul)} · last ${p.duration}s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('lure', 'Look Over Here!', 4, 'Charged clones wave their arms: foes within 5 m go for them first.', { extra: { r: 5 } }),
      UNIQUE('boom', 'Clone Pop', 10, 'Charged clones burst in pepper smoke when they go: 80% stink in 2 m and a 2s blind.', { extra: { pct: 80, r: 2, blind: 2 } })),
  };
  C.substitution = {
    ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0, 0, 0.1] }, base: 0.75, color: '#c8e0a0', pose: 'poeSeal', title: 'Log Fort',
    blurb: 'A longer blink, and a sturdier log that lures for longer and goes off bigger.',
    range: [1.3, 1.5, 1.75], life: [1.3, 1.6, 2], pop: [1.25, 1.4, 1.6],
    apply(p, s) { p.range = r1(p.range * by(this.range, s)); p.logLife = r1(p.logLife * by(this.life, s)); p.popRadius = r2(p.popRadius * by(this.pop, s)); p.dmgPct *= by(STAGE_MULT, s); p.blind = r1(p.blind * 1.5); return p; },
    lines(p) { return [`Blink ${p.range} m · the log lures ${p.logLife}s`, `Pop: ${pct(p.dmgPct)} in ${p.popRadius} m, blind ${p.blind}s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('twoLogs', 'Two Logs', 6, 'A charged substitution leaves a second log beside the first.'),
      UNIQUE('splinters', 'Splinters', 10, 'The charged log pops into 6 splinters that fly out (40% each).', { extra: { n: 6, pct: 40 } })),
  };
  C.thunderPaw = {
    ready: true, tune: { dmg: [0.94, 1.05, 0.99], shape: [1, 1, 1] }, base: 0.85, color: '#fff27a', pose: 'poeThunder', title: 'Thunder God Paw',
    blurb: 'Hold the crackling paw high: the bolt leaps to far more foes and loses less on every jump.',
    chains: [2, 3, 5], dmg: [1.15, 1.3, 1.5],
    apply(p, s) { p.chains += by(this.chains, s); p.falloff = Math.max(2, p.falloff - 2 * s); p.dmgPct *= by(this.dmg, s); p.chainRange = r1(p.chainRange * 1.2); p.stun = r2(p.stun * 1.5); return p; },
    lines(p) { return [`Bolt: ${pct(p.dmgPct)} · ${p.chains} chains (−${p.falloff}% a jump, ${p.chainRange} m)`, `Stuns ${p.stun}s`]; },
    perks: set(STAGES(), QUICK(), ECHO({ name: 'Rolling Thunder' }),
      UNIQUE('storm', 'Thunderhead', 10, 'A charged bolt leaves a little storm cloud over the target for 3s: it zaps a foe beneath it every 0.5s (30%).', { extra: { t: 3, pct: 30 } })),
  };
  C.smokeDragon = {
    ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0.3, 0.3, 0.3] }, base: 1.1, color: '#c8b8f0', pose: 'poeDragon', title: 'Great Smoke Dragon',
    blurb: 'Three slow seals instead of a quick one: a bigger, longer dragon that sweeps a wider path.',
    length: [1.2, 1.35, 1.5], width: [1.2, 1.35, 1.5],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.length = r1(p.length * by(this.length, s)); p.width = r1(p.width * by(this.width, s)); p.blind = r1(p.blind * 1.3); return p; },
    lines(p) { return [`Dragon: ${pct(p.dmgPct)} · sweeps ${p.length} m, ${p.width} m wide`, `Blinds ${p.blind}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('twin', 'Twin Dragons', 12, 'A Stage Ⅲ seal sends a second dragon sweeping back the other way (30%).', { needs: { stages: 2 }, extra: { pct: 30 } })),
  };

  // =================================================================== SHADOW STEP
  C.shadowStep = {
    ready: true, tune: { dmg: [0.68, 0.6, 0.46], shape: [1, 1, 1] }, base: 0.7, color: '#9a86d8', pose: 'poeCrouch', title: 'Shadow Ambush',
    blurb: 'Crouch into the dark: a longer step, and she comes out of it in a much harder, surer cut.',
    range: [1.3, 1.5, 1.75], // (a single-target opener: the charge buys a harder, surer cut, not a wider one)
    apply(p, s) { p.range = r1(p.range * by(this.range, s)); p.dmgPct *= by(STAGE_MULT, s); p.critBonus = Math.min(100, p.critBonus + 10 * s); return p; },
    lines(p) { return [`Strike: ${pct(p.dmgPct)} in a ${p.arc}° cut (${p.radius} m)`, `Steps up to ${p.range} m · +${p.critBonus}% crit from behind`]; },
    perks: set(STAGES(), QUICK(), ECHO({ name: 'Second Shadow' }),
      UNIQUE('sure', 'Sure Kill', 8, 'The strike out of a charged step is always a critical hit.')),
  };
  C.afterimageDash = {
    ready: true, tune: { dmg: [0.87, 0.81, 0.79], shape: [0, 1, 1] }, base: 0.75, color: '#9a86d8', pose: 'poeCrouch', title: 'Mirage Dash',
    blurb: 'Crouch for a much longer dash that leaves more afterimages — and they burst bigger.',
    images: [1, 2, 3], burst: [1.2, 1.35, 1.5],
    apply(p, s) { p.distance = r2(p.distance * by(STAGE_MULT, s)); p.images += by(this.images, s); p.burstRadius = r2(p.burstRadius * by(this.burst, s)); p.dmgPct *= by([1.15, 1.3, 1.5], s); p.burstPct = Math.round(p.burstPct * by([1.15, 1.3, 1.5], s) * dm(this, s)); return p; },
    lines(p) { return [`Dash ${p.distance} m: ${pct(p.dmgPct)}`, `${p.images} afterimages burst for ${pct(p.burstPct)} in ${p.burstRadius} m`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('rewind', 'Rewind', 4, 'At the end of a charged dash she dashes straight back through the line, hitting everything again.'),
      UNIQUE('mirage', 'Mirage', 10, 'The charged afterimages linger 2s as decoys (foes within 5 m go for them) before they burst.', { extra: { t: 2 } })),
  };
  C.vanish = {
    ready: true, base: 0.9, color: '#d8ccff', pose: 'poeSeal', title: 'Deep Vanish',
    blurb: 'Think very, very invisible thoughts: she stays gone longer and the strike that ends it lands much harder.',
    dur: [1.3, 1.6, 2], bonus: [1.5, 2, 2.75],
    apply(p, s) { p.duration = r1(p.duration * by(this.dur, s)); p.bonusPct = Math.round(p.bonusPct * by(this.bonus, s)); p.moveBuff = p.moveBuff + 5 * s; return p; },
    lines(p) { return [`Invisible up to ${p.duration}s (+${p.moveBuff}% speed)`, `The next hit: ×${p.critX} crit, +${pct(p.bonusPct)} damage`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('smokeExit', 'Smoke Exit', 6, 'Leaving a charged Vanish (with that first strike) puffs a pepper cloud at her feet: foes within 2.5 m are blinded for 2s.', { extra: { r: 2.5, blind: 2 } }),
      UNIQUE('triple', 'Assassin', 10, 'The strike out of a charged Vanish is a TRIPLE crit, and it hits everything within 1.8 m of its target too.', { extra: { r: 1.8 } })),
  };
  C.caltropFlip = {
    ready: true, tune: { dmg: [0.94, 0.94, 0.84], shape: [1, 1, 1] }, base: 0.75, color: '#f6ecd0', pose: 'poeCrouch', title: 'Caltrop Carpet',
    blurb: 'A bigger flip and a whole carpet of caltrops that lasts longer and slows harder.',
    radius: [1.3, 1.5, 1.75], dur: [1.2, 1.4, 1.6],
    apply(p, s, k) { p.radius = r2(p.radius * by(this.radius, s) * (1 + (k.wide || 0) * 0.15)); p.duration = r1(p.duration * by(this.dur, s)); p.slow = r2(Math.min(0.8, p.slow + 0.05 * s)); p.flip = r1(p.flip * 1.25); p.dmgPct *= by([1.1, 1.2, 1.35], s); return p; },
    lines(p) { return [`Caltrops: ${pct(p.dmgPct)} every ${p.tick}s in ${p.radius} m for ${p.duration}s`, `Slows ${Math.round(p.slow * 100)}% · flips ${p.flip} m`]; },
    perks: set(STAGES(), QUICK(), WIDE({ what: 'carpet', pct: 15 }),
      UNIQUE('spiky', 'Extra Spiky', 8, 'Charged caltrops trip foes up the first time they step on them: a 0.6s stun.', { extra: { stun: 0.6 } })),
  };
  C.bullseyeMark = {
    ready: true, base: 0.8, color: '#e8503a', pose: 'poeBrush', title: 'Big Target',
    blurb: 'Take careful aim: paint more foes at once, each a juicier target that bursts harder.',
    marks: [1, 2, 2], vuln: [1.2, 1.25, 1.45],
    apply(p, s) { p.marks = by(this.marks, s); p.vuln = r1(p.vuln * by(this.vuln, s)); p.stackPct = Math.round(p.stackPct * by([1.15, 1.2, 1.4], s) * dm(this, s)); p.burstRadius = r2(p.burstRadius * 1.2); return p; },
    lines(p) { return [`Marks ${p.marks} foe${p.marks > 1 ? 's' : ''}: +${p.vuln}% damage from you`, `Bursts for ${pct(p.stackPct)} per stack in ${p.burstRadius} m`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('spread', 'Spreading Paint', 6, 'A bursting mark paints the nearest unmarked foe, starting it at 3 stacks.', { extra: { stacks: 3 } }),
      UNIQUE('jackpot', 'Jackpot', 10, 'A charged mark that bursts at 10 stacks bursts for double.', { extra: { k: 2 } })),
  };
  C.phantomBarrage = {
    ready: true, tune: { dmg: [1.05, 0.91, 0.75], shape: [1, 1, 1] }, base: 1.1, color: '#9a86d8', pose: 'poeCrouch', title: 'Phantom Storm',
    blurb: 'A deeper breath before the barrage: she blinks to more foes, faster, and every strike lands harder.',
    targets: [2, 3, 5], dmg: [1.2, 1.4, 1.7],
    apply(p, s) { p.targets = Math.min(14, p.targets + by(this.targets, s)); p.dmgPct *= by(this.dmg, s); p.interval = r2(p.interval * 0.85); p.range = r1(p.range * 1.2); return p; },
    lines(p) { return [`Strikes up to ${p.targets} foes within ${p.range} m`, `${pct(p.dmgPct)} each, a strike every ${p.interval}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('finale', 'Grand Finale', 12, 'A Stage Ⅲ barrage ends with one last cut on every foe she struck, all at once (25%) — and no sneeze.', { needs: { stages: 2 }, extra: { pct: 25 } })),
  };
  return C;
}
