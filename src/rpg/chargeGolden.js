// Foosy the dragoon's charge tables (docs/CHARGE.md §7, docs/GOLDEN.md §3b): every active skill of his three trees charges
// like the others'. rpg/charge.js calls goldenCharge(kit) with its perk-family builders and merges the result into its
// table (this module imports nothing from charge.js: no import cycle). Same contract as charge.js' entries: { ready,
// base, color, pose, title, blurb, apply(p, s, k) → p, lines(p) → [..], perks, tune?, channel?, summon? }; apply gets a
// COPY of the skill's params at its level, the stage s (1..3) and the perk ranks k. The releases are
// combat/chargedGolden.js; the wind-up poses (pose: 'gldThrust' …) are actors/goldenPoses.js GOLDEN_CHARGE_POSES. A
// table's tune is solved by tools/charge-sim.mjs --solve (its models: tools/charge-sim-golden.mjs).
// Every charged area reads by its edge (a ring rolling out round a clear middle, the breath's embers weighted to the
// cone's rims): the readability rule of docs/POE.md §3d, as the Shih Tzu's charged Wallop.
export function goldenCharge({ STAGES, QUICK, FOCUS, SPLIT, WIDE, ECHO, UNIQUE, set, STAGE_MULT, by, r1, r2, pct, x }) {
  const C = {};

  // =================================================================== LANCE ARTS
  C.sunbeamThrust = {
    ready: true, tune: { dmg: [0.72, 0.6, 0.5], shape: [1, 1, 1] }, base: 0.8, color: '#fff2c8', pose: 'gldThrust', title: 'Noonday Thrust',
    blurb: 'Crouch lower and draw the lance further back while the sunbeam gathers: the thrust flashes further and wider down its line, hits much harder and staggers what it pokes.',
    length: [1.2, 1.35, 1.5], width: [1.2, 1.35, 1.5], stun: [0, 0.2, 0.4],
    apply(p, s, k) { p.dmgPct *= by(STAGE_MULT, s); p.length = r2(p.length * by(this.length, s)); p.width = r2(p.width * by(this.width, s) * (1 + (k.wide || 0) * 0.15)); p.knockback = r2(p.knockback * (1 + 0.4 * s)); p.stun = by(this.stun, s); return p; },
    lines(p) { return [`Thrust: ${pct(p.dmgPct)} down a line ${p.length} m long, ${r2(p.width * 2)} m wide`, ...(p.stun ? [`Staggers for ${p.stun}s`] : [])]; },
    perks: set(STAGES(), QUICK(), WIDE({ name: 'Wide Beam', what: 'sunbeam', pct: 15 }),
      UNIQUE('secondSun', 'Second Sun', 8, 'A second sunbeam flashes down the same line 0.25s later: 50%.', { extra: { pct: 50, delay: 0.25 } })),
  };
  C.sunfallJump = {
    ready: true, tune: { dmg: [0.79, 0.72, 0.61], shape: [1, 1, 1] }, base: 0.9, color: '#ffd27a', pose: 'gldJump', title: 'High Noon',
    blurb: 'Coil up like a spring: the Jump goes higher, hangs longer against the sun, and the crash is wider, harder and stuns for longer.',
    radius: [1.15, 1.3, 1.45], stun: [0.2, 0.4, 0.6], high: [1.1, 1.2, 1.3],
    apply(p, s, k) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s) * (1 + (k.wide || 0) * 0.15)); p.stun = r2(p.stun + by(this.stun, s)); p.high = by(this.high, s); p.knockback = r2(p.knockback * (1 + 0.3 * s)); return p; },
    lines(p) { return [`Crash: ${pct(p.dmgPct)} in ${p.radius} m · stun ${p.stun}s`, `A ${x(p.high)} higher leap`]; },
    perks: set(STAGES(), QUICK(), WIDE({ what: 'crash', pct: 15 }),
      UNIQUE('embers', 'Embers Below', 8, 'The crater of a charged Jump smoulders for 3s: foes in it burn for 40% a second.', { extra: { pct: 40, t: 3 } })),
  };
  C.pinwheelSweep = {
    ready: true, tune: { dmg: [0.8, 0.6, 0.53], shape: [1, 1, 1] }, base: 0.8, color: '#dff2e6', pose: 'gldPinwheel', title: 'Whirling Pinwheel',
    blurb: 'Wind the lance further round behind you: it sweeps further and harder, and from Stage Ⅱ it comes round a second time (60%).',
    turns: [1, 2, 2], radius: [1.1, 1.18, 1.25], turnPct: 60,
    apply(p, s) { p.turns = by(this.turns, s); p.turnPct = this.turnPct; p.radius = r2(p.radius * by(this.radius, s)); p.dmgPct *= by(STAGE_MULT, s); p.knockback = r2(p.knockback * (1 + 0.25 * s)); return p; },
    lines(p) { return [`Sweep: ${pct(p.dmgPct)} all round you (${p.radius} m)`, ...(p.turns > 1 ? [`Comes round again: ${p.turnPct}%`] : [])]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('gust', 'Leaf Gust', 8, 'The last turn throws out a ring of leaves that blows foes away: 40% in 1.5 m past the lance.', { extra: { pct: 40, r: 1.5 } })),
  };
  C.gallantCharge = {
    ready: true, tune: { dmg: [0.72, 0.56, 0.43], shape: [1, 1, 1] }, base: 0.85, color: '#ffe6a0', pose: 'gldCharge', title: 'Thundering Charge',
    blurb: 'Paw the ground and lower the lance: the charge runs further and wider and hits much harder; from Stage Ⅱ it carries the foes it catches along on the lance and drops them, dizzy, where it stops.',
    distance: [1.2, 1.4, 1.6], width: [1.1, 1.2, 1.3],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.distance = r1(p.distance * by(this.distance, s)); p.width = r2(p.width * by(this.width, s)); p.speed = r1(p.speed * (1 + 0.1 * s)); p.carry = s >= 2; return p; },
    lines(p) { return [`Charge: ${pct(p.dmgPct)} along ${p.distance} m, ${p.width} m wide`, ...(p.carry ? ['Carries the foes it catches along'] : [])]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('skid', 'Grand Skid', 8, 'A charged charge ends in a skidding stop that bonks everything round him: 60% in 2 m.', { extra: { pct: 60, r: 2 } })),
  };
  C.starfallLance = {
    ready: true, tune: { dmg: [0.84, 0.64, 0.47], shape: [1, 1, 1] }, base: 1.1, color: '#ffb060', pose: 'gldStarfall', title: 'Shooting Star',
    blurb: 'Rise up onto your toes and throw with everything: the star falls wider and harder, stuns longer, and its crater smoulders hotter.',
    radius: [1.15, 1.3, 1.45], stun: [0.2, 0.4, 0.6],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.burnPct *= by(STAGE_MULT, s); p.stun = r2(p.stun + by(this.stun, s)); return p; }, // (the burn grows as the hit does: the tune scales both)
    lines(p) { return [`Impact: ${pct(p.dmgPct)} in ${p.radius} m · stun ${p.stun}s`, `Embers: ${pct(p.burnPct)} fire a second for ${p.burnDur}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('constellation', 'Constellation', 12, 'A Stage Ⅲ throw brings two small stars down first, either side of the spot: 50% each in 1.6 m.', { needs: { stages: 2 }, extra: { pct: 50, n: 2, r: 1.6 } })),
  };

  // =================================================================== JAVELINS
  C.bonkDart = {
    ready: true, tune: { dmg: [0.79, 0.6, 0.44], shape: [1, 1, 1] }, base: 0.75, color: '#ffd27a', pose: 'gldJav', title: 'Big Bonk',
    blurb: 'Pick a heavier javelin: it bonks much harder, splashes wider round its foe and leaves everyone it bonks seeing stars.',
    splashR: [1.15, 1.3, 1.45], splash: [10, 15, 20], daze: [0.3, 0.5, 0.7],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.splashRadius = r2(p.splashRadius * by(this.splashR, s)); p.splash += by(this.splash, s); p.daze = by(this.daze, s); return p; },
    lines(p) { return [`Bonk: ${pct(p.dmgPct)} · ${p.splash}% to foes within ${p.splashRadius} m`, `Dazes ${p.daze}s`]; },
    perks: set(STAGES(), QUICK(), SPLIT({ name: 'Twin Darts', what: 'javelin', pct: 50, spread: 12 }),
      UNIQUE('wobble', 'Wobbly Bonk', 6, 'A charged dart bonks off its foe onto the nearest other foe within 4 m: 50%.', { extra: { pct: 50, r: 4 } })),
  };
  C.tailwagVolley = {
    ready: true, tune: { dmg: [0.89, 0.93, 0.89], shape: [1, 1, 1] }, base: 0.8, color: '#f8ecd2', pose: 'gldVolley', title: 'Full Wag',
    blurb: 'A proper wind-up wag: more javelins in a wider fan, each one thrown harder.',
    count: [2, 3, 4], spread: [10, 20, 30], dmg: [1.2, 1.35, 1.5],
    apply(p, s) { p.count = Math.min(13, p.count + by(this.count, s)); p.spread = Math.min(120, p.spread + by(this.spread, s)); p.dmgPct *= by(this.dmg, s); return p; },
    lines(p) { return [`Javelins: ${p.count} in a ${p.spread}° fan`, `Damage each: ${pct(p.dmgPct)}`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      ECHO({ name: 'Second Wag', pct: 50, delay: 0.45 })),
  };
  C.trueFlight = {
    ready: true, tune: { dmg: [0.69, 0.54, 0.43], shape: [1, 1, 1] }, base: 0.85, color: '#fff2c8', pose: 'gldTrue', title: 'Truest Flight',
    blurb: 'Take a longer breath and a deeper turn: the javelin flies further and wider and bonks much harder all along the line.',
    range: [1.15, 1.3, 1.45], width: [1.2, 1.4, 1.6],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.range = r1(p.range * by(this.range, s)); p.width = r2(p.width * by(this.width, s)); return p; },
    lines(p) { return [`Javelin: ${pct(p.dmgPct)} to every foe in a ${p.range} m line, ${r2(p.width * 2)} m wide`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('twin', 'Twin Flight', 8, 'A second javelin follows the first 0.25s later: 50%.', { extra: { pct: 50, delay: 0.25 } })),
  };
  C.emberleafJavelin = {
    ready: true, tune: { dmg: [0.69, 0.64, 0.56], shape: [1, 1, 1] }, base: 0.9, color: '#ff9a4a', pose: 'gldJav', title: 'Bonfire Javelin',
    blurb: 'Let the emberleaf catch properly before you throw: a bigger burst, hotter embers, and a smoulder that lasts longer.',
    radius: [1.15, 1.3, 1.45],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.burnPct *= by(STAGE_MULT, s); p.burnDur = r1(p.burnDur * 1.3); return p; },
    lines(p) { return [`Burst: ${pct(p.dmgPct)} fire in ${p.radius} m`, `Smoulder: ${pct(p.burnPct)} a second for ${p.burnDur}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('kindling', 'Kindling', 8, 'The burst throws two little embers onto foes nearby: 40% fire in 1.2 m each.', { extra: { pct: 40, n: 2, r: 1.2 } })),
  };
  C.sunshower = {
    ready: true, tune: { dmg: [1.28, 1.2, 1.11], shape: [1, 1, 1] }, base: 1.1, color: '#ffe6a0', pose: 'gldShower', title: 'Cloudburst',
    blurb: 'Reach right down to the bottom of the quiver: many more javelins, a wider rain, and they fall harder.',
    count: [4, 7, 10], radius: [1.1, 1.2, 1.3], dmg: [1.1, 1.2, 1.3],
    apply(p, s) { p.count += by(this.count, s); p.radius = r2(p.radius * by(this.radius, s)); p.dmgPct *= by(this.dmg, s); return p; },
    lines(p) { return [`Javelins: ${p.count} over ${p.duration}s in ${p.radius} m`, `Damage each: ${pct(p.dmgPct)} in ${p.impactRadius} m`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('rainbow', 'Rainbow', 12, 'A Stage Ⅲ sunshower ends with 6 javelins landing together on the middle: 60% each in 1.5 m.', { needs: { stages: 2 }, extra: { pct: 60, n: 6, r: 1.5 } })),
  };

  // =================================================================== WHELP BOND (Shadow does the work: the hero calls)
  C.emberBreath = {
    ready: true, tune: { dmg: [0.87, 0.82, 0.74], shape: [0.75, 1, 1] }, base: 0.75, color: '#ff9a4a', pose: 'gldCall', title: 'Big Breath',
    blurb: 'Let Shadow take a really big breath: a longer, wider cone of embers, more puffs of it, and hotter smoulders.',
    range: [1.15, 1.3, 1.45], arc: [10, 15, 20], ticks: [1, 1, 2], dmg: [1.15, 1.35, 1.5],
    apply(p, s, k) { p.range = r1(p.range * by(this.range, s)); p.arc = Math.min(120, Math.round((p.arc + by(this.arc, s)) * (1 + (k.wide || 0) * 0.15))); p.ticks += by(this.ticks, s); p.dmgPct *= by(this.dmg, s); p.burnPct *= by(this.dmg, s); return p; },
    lines(p) { return [`Breath: ${pct(p.dmgPct)} fire, ${p.ticks} times, in a ${p.arc}° cone ${p.range} m long`, `Smoulder: ${pct(p.burnPct)} a second for ${p.burnDur}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(), WIDE({ what: 'cone', pct: 15 })),
  };
  C.divebombSwoop = {
    ready: true, tune: { dmg: [0.67, 0.51, 0.38], shape: [0.8, 0.8, 0.8] }, base: 0.8, color: '#ff8a4a', pose: 'gldCall', title: 'Loop-the-Loop',
    blurb: 'Shadow climbs even higher first: a harder, wider splash, and at Stage Ⅲ he loops round and divebombs a second time (25%).',
    radius: [1.2, 1.3, 1.3], loops: [0, 0, 1], loopPct: 25,
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.burnPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.loops = by(this.loops, s); p.loopPct = this.loopPct; return p; },
    lines(p) { return [`Swoop: ${pct(p.dmgPct)} fire in ${p.radius} m`, ...(p.loops ? [`Loops round for another: ${p.loopPct}%`] : [])]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('scorch', 'Scorched Earth', 8, 'Each charged swoop leaves a scorch: foes standing in it burn for 30% a second for 2s.', { extra: { pct: 30, t: 2 } })),
  };
  C.wingShield = {
    ready: true, base: 0.85, color: '#7ae0a8', pose: 'gldCall', title: 'Great Wings',
    blurb: 'Shadow stretches his wings out further than ever: a much sturdier shield that holds longer, and a bigger gust when it goes.',
    absorb: [1.5, 2.0, 2.6], gust: [1.3, 1.6, 2.0], gustR: [1.1, 1.2, 1.3], dur: [1, 2, 3],
    apply(p, s) { p.absorbPct = r1(p.absorbPct * by(this.absorb, s)); p.gustPct *= by(this.gust, s); p.gustRadius = r2(p.gustRadius * by(this.gustR, s)); p.duration += by(this.dur, s); return p; },
    lines(p) { return [`Absorbs ${p.absorbPct}% of your life for ${p.duration}s`, `Then a gust: ${pct(p.gustPct)} in ${p.gustRadius} m`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('regen', 'Warm Felt', 6, 'While a charged shield holds you mend 1% of your life a second.', { extra: { regen: 1 } }),
      UNIQUE('singe', 'Ember Felt', 10, 'A foe that strikes a charged shield is singed: 40% fire.', { extra: { pct: 40 } })),
  };
  C.mightyRoar = {
    ready: true, base: 0.8, color: '#ffd8a0', pose: 'gldCall', title: 'Mightier Roar',
    blurb: 'A deeper breath for a bigger squeak: the pack stays brave for longer, and it carries further.',
    dur: [1.15, 1.3, 1.5], radius: [1.15, 1.3, 1.45], buff: [3, 6, 9],
    apply(p, s) { p.duration = r1(p.duration * by(this.dur, s)); p.radius = r1(p.radius * by(this.radius, s)); p.dmgBuff += by(this.buff, s); return p; },
    lines(p) { return [`The pack: +${p.dmgBuff}% damage and +${p.aspd}% attack speed for ${p.duration}s`, `Foes within ${p.radius} m flinch`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('pep', 'Pep Talk', 5, 'A charged roar also puts a spring in the pack\u2019s step: +15% move speed while it lasts.', { extra: { move: 15 } }),
      UNIQUE('fear', 'Echoing Squeak', 8, 'Foes in a charged roar are scared off for 1s instead of flinching.', { extra: { fear: 1 } })),
  };
  C.dragonHeart = {
    ready: true, base: 1.1, color: '#ff7a4a', pose: 'gldCall', title: 'Elder Heart', summon: true,
    blurb: 'Let Shadow\'s heart swell for longer: an even bigger, sturdier dragon who stays longer and sweeps harder.',
    dur: [1.2, 1.45, 1.7], size: [1.05, 1.1, 1.15], dmg: [1.15, 1.35, 1.55], life: [25, 50, 75],
    apply(p, s) { const m = by(this.dmg, s); p.duration = r1(p.duration * by(this.dur, s)); p.size = by(this.size, s); p.dmgPct *= m; p.burnPct *= m; p.heartLife += by(this.life, s); return p; },
    lines(p) { return [`Shadow grows ${x(p.scale * p.size)} for ${p.duration}s with +${p.heartLife}% life`, `Ember sweeps: ${pct(p.dmgPct)} every ${p.every}s in ${p.radius} m`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('hearth', 'Hearth Heart', 6, 'While Shadow is dragon-sized, you and he mend 1% of your life a second.', { extra: { regen: 1 } }),
      UNIQUE('dragonJump', 'Dragon\'s Jump', 12, 'A Stage Ⅲ Dragon Heart ends with the two of you coming down on the nearest foe together: 250% fire in 3 m.', { needs: { stages: 2 }, extra: { pct: 250, r: 3 } })),
  };
  return C;
}
