// The Shih Tzu's charge tables (docs/CHARGE.md §7, docs/SHIHTZU.md §3): every active skill of his three trees charges
// like the others'. rpg/charge.js calls shihtzuCharge(kit) with its perk-family builders and merges the result into its
// table (this module imports nothing from charge.js: no import cycle). Same contract as charge.js' entries: { ready,
// base, color, pose, title, blurb, apply(p, s, k) → p, lines(p) → [..], perks, tune?, channel?, summon? }; apply gets a
// COPY of the skill's params at its level, the stage s (1..3) and the perk ranks k. The releases are
// combat/chargedShihtzu.js; the wind-up poses (pose: 'stzWallop' …) are actors/shihtzuPoses.js SHIHTZU_CHARGE_POSES. A
// table's tune is solved by tools/charge-sim.mjs --solve; its dmg also scales the damage keys charge.js' retune doesn't
// know (dotPct, burstPct, nipPct, hexPct: `dm` below).
export function shihtzuCharge({ STAGES, QUICK, FOCUS, SPLIT, WIDE, ECHO, UNIQUE, set, STAGE_MULT, by, r1, r2, pct, x }) {
  const C = {};
  const dm = (c, s) => (c.tune?.dmg ? by(c.tune.dmg, s) : 1); // (the balance layer for his own damage keys)

  // =================================================================== FLAIL ARTS
  C.woefulWallop = {
    ready: true, tune: { dmg: [0.87, 0.77, 0.68], shape: [1, 1, 1] }, base: 0.85, color: '#c8a0d8', pose: 'stzWallop', title: 'Grand Wallop',
    blurb: 'Wind the flail round and round behind you, sighing ever more deeply: the wallop sweeps wider and further, hits much harder, and knocks the wind out of everything it catches.',
    arc: [40, 80, 140], radius: [1.15, 1.3, 1.45], stun: [0, 0.3, 0.6],
    apply(p, s, k) {
      p.dmgPct *= by(STAGE_MULT, s); p.arc = Math.min(360, p.arc + by(this.arc, s)); p.radius = r2(p.radius * by(this.radius, s));
      p.knockback = r2(p.knockback * (1 + 0.5 * s)); p.stun = by(this.stun, s); return p;
    },
    lines(p) { return [`Wallop: ${pct(p.dmgPct)} in a ${p.arc}° sweep (${p.radius} m)`, `Knocks back hard${p.stun ? ` · winds them ${p.stun}s` : ''}`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('aftershock', 'Aftershock', 6, 'At the end of a charged sweep the ball slams the floor: 60% in 2 m.', { extra: { pct: 60, r: 2 } }),
      UNIQUE('woe', 'Wallop of Woe', 10, 'Everything a charged wallop hits is hexed: one Dripping Paw stack (60% gloom a second for 5s).', { extra: { dps: 60, dur: 5 } })),
  };
  C.tugOfWoe = {
    ready: true, tune: { dmg: [0.73, 0.63, 0.51], shape: [1, 1, 1] }, base: 0.8, color: '#a873a8', pose: 'stzWhirlUp', title: 'The Big Haul',
    blurb: 'Whirl the ball up overhead first: it flies further, wraps more foes at once, and hauls them in harder.',
    range: [1.2, 1.35, 1.5], extra: [1, 2, 3],
    apply(p, s) { p.range = r1(p.range * by(this.range, s)); p.extra = Math.min(8, p.extra + by(this.extra, s)); p.grabRadius = r2(p.grabRadius * 1.25); p.dmgPct *= by(STAGE_MULT, s); p.daze = r2(p.daze * 1.5); return p; },
    lines(p) { return [`Tug: ${pct(p.dmgPct)} · reaches ${p.range} m`, `Hauls in the foe and up to ${p.extra} beside it (${p.grabRadius} m) · dazed ${p.daze}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('slam', 'Bonk Together', 8, 'The charged haul knocks the foes’ heads together where they land: 70% in 1.8 m.', { extra: { pct: 70, r: 1.8 } })),
  };
  C.maelstrom = {
    ready: true, tune: { dmg: [1, 1, 1.11], shape: [0, 0, 1] }, base: 0.9, color: '#5ce0c0', pose: 'stzWhirlUp', title: 'Gloom Maelstrom', channel: true,
    blurb: 'Hold to work up the whirl: at Stage Ⅰ a wider maelstrom that drags much harder starts by itself and grows while held; let go and it keeps whirling on its own for a moment.',
    radius: [1.15, 1.3, 1.45], pull: [1.4, 1.8, 2.3], spinOut: [0.5, 1, 1.6],
    apply(p, s) { p.radius = r2(p.radius * by(this.radius, s)); p.pull = r1(p.pull * by(this.pull, s)); p.spinOut = by(this.spinOut, s); return p; },
    lines(p) { return [`Whirl radius ${p.radius} m, dragging foes in at ${p.pull} m/s`, `${pct(p.dmgPct)} per hit, ${p.hitsPerSec}× a second · whirls on ${p.spinOut}s after you let go`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('drift', 'Drifting Gloom', 4, 'The whirl-out drifts after your cursor at 2.5 m/s.', { extra: { speed: 2.5 } }),
      UNIQUE('finale', 'Last Bonk', 10, 'The whirl-out ends with the ball slammed down all round you: 120% and a 1s daze.', { extra: { pct: 120, dizzy: 1 } })),
  };
  C.steadfastSulk = {
    ready: true, tune: { dmg: [0.67, 0.51, 0.38], shape: [0.1, 0.1, 0.1] }, base: 0.8, color: '#9a86b8', pose: 'stzSulk', title: 'The Grand Sulk',
    blurb: 'Sulk in advance. The guard is sturdier and lasts longer, the sulk starts already offended (the blows count from the stage), and the spin that ends it is much bigger.',
    radius: [1.15, 1.3, 1.45], guard: [1.1, 1.2, 1.3],
    apply(p, s, k) {
      p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s) * (1 + (k.wide || 0) * 0.15)); p.guard = r2(p.guard * by(this.guard, s));
      p.block = Math.min(90, p.block + 5 * s); p.preBlows = s; p.maxBlows += (k.stubborn ? 2 : 0); return p;
    },
    lines(p) { return [`Guard ${p.guard}s: hits ${p.block}% softer · starts ${p.preBlows} blow${p.preBlows > 1 ? 's' : ''} up`, `Spin: ${pct(p.dmgPct)} in ${p.radius} m, +${p.perBlow}% per blow (up to ${p.maxBlows})`]; },
    perks: set(STAGES(), QUICK(), WIDE({ what: 'spin', pct: 15 }),
      UNIQUE('stubborn', 'Stubborn', 8, 'A charged sulk counts up to 2 more blows.')),
  };
  C.heaviestSigh = {
    ready: true, tune: { dmg: [0.85, 0.71, 0.52], shape: [1, 1, 1] }, base: 1.1, color: '#e6dcef', pose: 'stzSigh', title: 'The Deepest Sigh',
    blurb: 'Hold that breath. The sigh comes out even heavier: the shockwaves roll further, hit much harder and stun longer.',
    radius: [1.15, 1.3, 1.45],
    apply(p, s, k) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.stun = r2(p.stun * 1.3); p.extraRings = s >= 3 && k.rolling ? 2 : 0; return p; },
    lines(p) { return [`Shockwaves: ${pct(p.dmgPct)} each, ${p.rings + (p.extraRings || 0)} out to ${r1(p.radius * (p.rings + (p.extraRings || 0)) / p.rings)} m`, `Stuns ${p.stun}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('rolling', 'Rolling Thunder', 12, 'A Stage Ⅲ sigh rolls 2 more shockwaves out past the last, each 25% harder than the one before.', { needs: { stages: 2 }, extra: { rings: 2, pct: 25 } })),
  };

  // =================================================================== GLOOM HEXES
  C.drippingPaw = {
    ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0.1, 0.25, 0.25] }, base: 0.75, color: '#5ce0c0', pose: 'stzHex', title: 'Great Dripping Paw',
    blurb: 'Let the ghostlight pool in your paw: a bigger splat that lands harder and leaves a deeper hex: two stacks in one go, three at Stage Ⅲ.',
    radius: [1.25, 1.45, 1.7],
    stacks: [2, 2, 3],
    apply(p, s, k) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.stacksAt = Math.min(p.stacks, by(this.stacks, s)); return p; }, // (the hex itself as a tap's: the charge pays in stacks at once)
    lines(p) { return [`Splat: ${pct(p.dmgPct)} gloom in ${p.radius} m`, `Hex: ${pct(p.dotPct)} a second for ${p.duration}s · ${p.stacksAt} stack${p.stacksAt > 1 ? 's' : ''} at once`]; },
    perks: set(STAGES(), QUICK(), SPLIT({ name: 'Paw Prints', what: 'paw print', pct: 50 }),
      UNIQUE('puddle', 'Gloom Puddle', 8, 'The charged splat leaves a puddle of gloom for 3s: foes standing in it are hexed again every second.', { extra: { t: 3 } })),
  };
  C.grumbleCloud = {
    ready: true, tune: { dmg: [0.91, 0.84, 0.75], shape: [0.45, 0.45, 0.45] }, base: 0.9, color: '#a8a0bc', pose: 'stzHexUp', title: 'Great Grumble',
    blurb: 'Work up a proper mood first: a bigger, crosser cloud that rains harder and sulks over the spot for much longer.',
    radius: [1.2, 1.35, 1.5], dur: [1.2, 1.4, 1.6], dmg: [1.1, 1.2, 1.35],
    apply(p, s) { p.radius = r2(p.radius * by(this.radius, s)); p.duration = r1(p.duration * by(this.dur, s)); p.dmgPct *= by(this.dmg, s); p.slow = r2(Math.min(0.7, p.slow + 0.05 * s)); return p; },
    lines(p) { return [`Gloom rain: ${pct(p.dmgPct)} every ${p.tick}s in ${p.radius} m`, `Slows ${Math.round(p.slow * 100)}% · lasts ${p.duration}s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('follow', 'Brooding Drift', 6, 'The charged cloud drifts after the nearest foe at 2 m/s.', { extra: { speed: 2 } }),
      UNIQUE('thunder', 'Grumble Grumble', 10, 'Every 1.5s the charged cloud grumbles a bolt onto one foe beneath it: 150% gloom and a 0.5s stun.', { extra: { every: 1.5, pct: 150, stun: 0.5 } })),
  };
  C.caseOfMopes = {
    ready: true, base: 0.8, color: '#b8b0c8', pose: 'stzHex', title: 'A Terrible Case of the Mopes',
    blurb: 'A longer, heavier sigh: the mopes spread wider, last longer, and sap even more of their will to fight.',
    radius: [1.2, 1.35, 1.5], dur: [1.2, 1.4, 1.6],
    apply(p, s, k) { p.radius = r2(p.radius * by(this.radius, s) * (1 + (k.wide || 0) * 0.15)); p.duration = r1(p.duration * by(this.dur, s)); p.weaken = Math.min(70, p.weaken + 5 * s); p.vuln = r1(p.vuln + 5 * s); return p; },
    lines(p) { return [`Foes within ${p.radius} m mope for ${p.duration}s`, `They deal ${p.weaken}% less and take ${p.vuln}% more`]; },
    perks: set(STAGES(), QUICK(), WIDE({ what: 'gloom', pct: 15 }),
      UNIQUE('spread', 'Contagious Mopes', 8, 'A moping foe that drops passes the mopes on to the nearest foe within 5 m.', { extra: { r: 5 } })),
  };
  C.mournfulAwoo = {
    ready: true, tune: { dmg: [0.67, 0.52, 0.4], shape: [0, 1, 1] }, base: 0.9, color: '#bff6e6', pose: 'stzAwoo', title: 'The Grand Awoo',
    blurb: 'A long breath for a longer howl: it carries further, stings harder and spreads more hex stacks.',
    radius: [1.15, 1.3, 1.45], spread: [0, 1, 2],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r1(p.radius * by(this.radius, s)); p.spread += by(this.spread, s); p.fear = r2(p.fear * 1.5); return p; },
    lines(p) { return [`Howl: ${pct(p.dmgPct)} gloom in ${p.radius} m · scares ${p.fear}s`, `Spreads ${p.spread} stack${p.spread > 1 ? 's' : ''} of the strongest hex nearby`]; },
    perks: set(STAGES(), QUICK(), ECHO({ name: 'Encore', pct: 50, delay: 0.6 }),
      UNIQUE('chorus', 'Chorus', 10, 'Your ghost pups and Grandpaw howl along: each one’s howl stings everything within 2.5 m (30%).', { extra: { pct: 30, r: 2.5 } })),
  };
  C.everlastingGloom = {
    ready: true, tune: { dmg: [1.1, 1.12, 0.88], shape: [1, 1, 1] }, base: 1.1, color: '#5ce0c0', pose: 'stzHexUp', title: 'Endless Gloom',
    blurb: 'Raise the gloom higher: the great hex falls wider and deeper, its bursts are bigger, and it jumps on many more times.',
    radius: [1.15, 1.3, 1.45], dot: [1.1, 1.2, 1.3], burst: [1.2, 1.4, 1.6], jumps: [1, 2, 3],
    apply(p, s) { p.radius = r2(p.radius * by(this.radius, s)); p.dotPct *= Math.max(1, by(this.dot, s) * dm(this, s)); p.burstPct *= Math.max(1, by(this.burst, s) * dm(this, s)); p.jumps += by(this.jumps, s); p.burstRadius = r2(p.burstRadius * 1.15); return p; }, // (never weaker than a tap's)
    lines(p) { return [`Hex: ${pct(p.dotPct)} gloom a second for ${p.duration}s in ${p.radius} m`, `Bursts for ${pct(p.burstPct)} in ${p.burstRadius} m · jumps on up to ${p.jumps} times`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('deep', 'Deep Gloom', 12, 'A Stage Ⅲ hex lands with 2 stacks at once.', { needs: { stages: 2 }, extra: { stacks: 2 } })),
  };

  // =================================================================== GHOSTLIGHT TOME
  C.ghostPups = {
    ready: true, base: 0.9, color: '#bff6e6', pose: 'stzTome', title: 'A Whole Litter', summon: true,
    blurb: 'Read a longer page: more pups tumble out, sturdier and nippier, and they stay out longer.',
    extra: [1, 1, 2], nip: [1.05, 1.1, 1.15], life: [1.3, 1.5, 1.7],
    apply(p, s) { p.pups = Math.min(8, p.pups + by(this.extra, s)); p.nipPct *= by(this.nip, s) * dm(this, s); p.lifePct = Math.round(p.lifePct * by(this.life, s)); p.duration = r1(p.duration * 1.2); return p; },
    lines(p) { return [`Ghost pups: ${p.pups} · nips ${pct(p.nipPct)} every ${p.nipEvery}s`, `Pup life ${p.lifePct}% of yours · last ${p.duration}s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('haunt', 'Haunting Nips', 6, 'Charged pups’ nips hex too: one Dripping Paw stack (50% gloom a second for 4s).', { extra: { dps: 50, dur: 4 } }),
      UNIQUE('runt', 'The Runt', 10, 'A Stage Ⅲ litter has one extra-big pup that nips twice as hard.', { needs: { stages: 2 } })),
  };
  C.borrowedWarmth = {
    ready: true, tune: { dmg: [0.87, 0.77, 0.67], shape: [0, 0, 0.45] }, base: 0.8, color: '#ffc8a0', pose: 'stzHex', title: 'A Warm Embrace',
    blurb: 'Reach out further: more threads, each draining harder, and more of the warmth comes back to you.',
    tethers: [1, 2, 3], dmg: [1.15, 1.3, 1.5], heal: [5, 10, 15],
    apply(p, s) { p.tethers = Math.min(6, p.tethers + by(this.tethers, s)); p.dmgPct *= by(this.dmg, s); p.heal += by(this.heal, s); p.duration = r1(p.duration * 1.25); p.range = r1(p.range * 1.2); return p; },
    lines(p) { return [`Threads: ${p.tethers} foes within ${p.range} m for ${p.duration}s`, `Drains ${pct(p.dmgPct)} every ${p.tick}s · heals you ${p.heal}% of it`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('share', 'Shared Warmth', 8, 'Your ghosts are warmed too: they heal 50% of what the threads drain.', { extra: { pct: 50 } })),
  };
  C.boneWard = {
    ready: true, base: 0.85, color: '#f2ece0', pose: 'stzTome', title: 'Bone Fortress',
    blurb: 'Read the whole chapter: a much sturdier ward of more bones, and they fly harder when it breaks.',
    absorb: [1.2, 1.4, 1.6], bones: [2, 3, 4], dmg: [1.1, 1.2, 1.35],
    apply(p, s) { p.absorbPct = r1(p.absorbPct * by(this.absorb, s)); p.bones = Math.min(10, p.bones + by(this.bones, s)); p.dmgPct *= by(this.dmg, s); return p; },
    lines(p) { return [`Absorbs ${p.absorbPct}% of your life for ${p.duration}s`, `${p.bones} bones fly at foes when it breaks: ${pct(p.dmgPct)} each`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('broth', 'Bone Broth', 4, 'While a charged ward holds you mend 1% of your life a second.', { extra: { regen: 1 } }),
      UNIQUE('marrow', 'Marrow Shards', 8, 'Charged bones fly 50% harder when the ward breaks.', { extra: { k: 1.5 } })),
  };
  C.wayhomeLantern = {
    ready: true, base: 0.9, color: '#7af0d0', pose: 'stzTome', title: 'Beacon Home',
    blurb: 'Trim the wick first: a brighter lantern with a wider pool of light that mends faster and burns longer.',
    radius: [1.15, 1.3, 1.45], dur: [1.2, 1.4, 1.6], regen: [1.2, 1.4, 1.6], dmg: [1.1, 1.2, 1.35],
    apply(p, s) { p.radius = r1(p.radius * by(this.radius, s)); p.duration = r1(p.duration * by(this.dur, s)); p.regen = r1(p.regen * by(this.regen, s)); p.dmgPct *= by(this.dmg, s); p.rekindle = Math.min(85, p.rekindle + 5 * s); return p; },
    lines(p) { return [`${p.radius} m of light for ${p.duration}s: ${p.regen}% life a second`, `Foes in it take ${pct(p.dmgPct)} a second · rekindles you at ${p.rekindle}%`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('calm', 'Calming Light', 8, 'Foes in the charged lantern’s light are slowed 30%.', { extra: { slow: 0.3 } })),
  };
  C.grandpawsGhost = {
    ready: true, base: 1.1, color: '#bff6e6', pose: 'stzTome', title: 'Great-Grandpaw', summon: true,
    blurb: 'Read the very last page slowly: a bigger, sturdier Grandpaw who stays longer and stomps harder.',
    dur: [1.2, 1.4, 1.6], dmg: [1.1, 1.2, 1.35], life: [1.3, 1.6, 2], size: [1.08, 1.16, 1.25],
    apply(p, s) {
      const m = by(this.dmg, s) * dm(this, s);
      p.duration = r1(p.duration * by(this.dur, s)); p.dmgPct *= m; p.hexPct *= m; p.lifePct = Math.round(p.lifePct * by(this.life, s)); p.radius = r2(p.radius * by(this.size, s)); p.size = by(this.size, s); return p;
    },
    lines(p) { return [`Grandpaw stays ${p.duration}s · ${x(p.size)} size, life ${p.lifePct}% of yours`, `Stomps ${pct(p.dmgPct)} in ${p.radius} m · howls a ${pct(p.hexPct)} hex`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('stories', 'Old Stories', 6, 'A charged Grandpaw howls twice as often.', { extra: { k: 0.5 } }),
      UNIQUE('lantern', 'Grandpaw’s Lantern', 10, 'A charged Grandpaw’s lantern mends you: 1% life a second while you’re within 5 m of him.', { extra: { regen: 1, r: 5 } })),
  };
  return C;
}
