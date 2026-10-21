// Stella the Sun Oracle's charge tables (docs/CHARGE.md §7, docs/STELLA.md §3a): every active skill of her three trees
// charges like the others'. rpg/charge.js calls stellaCharge(kit) with its perk-family builders and merges the result into
// its table (this module imports nothing from charge.js: no import cycle). Same contract as charge.js' entries: { ready,
// base, color, pose, title, blurb, apply(p, s, k) → p, lines(p) → [..], perks, tune?, channel?, summon? }; apply gets a
// COPY of the skill's params at its level, the stage s (1..3) and the perk ranks k. The releases are
// combat/chargedStella.js; the wind-up poses (pose: 'stlAim' …) are actors/stellaPoses.js STELLA_CHARGE_POSES. A table's
// tune is solved by tools/charge-sim.mjs --solve (her models: tools/charge-sim-stella.mjs); its dmg also scales the damage
// keys charge.js' retune doesn't know (rayPct, flarePct, searPct: `dm` below). The heals and shields aren't tuned: their
// value per zoom is reported by the sim, as the summons' and buffs' are.
// Her charged light reads by its edge, like everything of hers (gold and white, never orange; docs/STELLA.md §4.1).
export function stellaCharge({ STAGES, QUICK, FOCUS, SPLIT, WIDE, ECHO, UNIQUE, set, STAGE_MULT, by, r1, r2, pct, x }) {
  const C = {};
  const dm = (c, s) => (c.tune?.dmg ? by(c.tune.dmg, s) : 1); // (the balance layer for her own damage keys)

  // =================================================================== RADIANCE
  C.goldenRay = {
    ready: true, tune: { dmg: [0.89, 0.8, 0.61], shape: [1, 1, 1] }, base: 0.75, color: '#ffd36a', pose: 'stlAim', title: 'Searing Ray',
    blurb: 'Hold the finial on them while the light gathers: the ray reaches further, burns much harder, and from Stage Ⅱ each foe it touches is gilded twice.',
    length: [1.2, 1.4, 1.6], width: [1.15, 1.3, 1.45], gild: [1, 2, 2],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.length = r1(p.length * by(this.length, s)); p.width = r2(p.width * by(this.width, s)); p.gild = by(this.gild, s); return p; },
    lines(p) { return [`Ray: ${pct(p.dmgPct)} fire through a ${p.length} m line, ${r2(p.width * 2)} m wide`, `Gilds ${p.gild > 1 ? 'twice' : 'once'} a foe`]; },
    perks: set(STAGES(), QUICK(), SPLIT({ what: 'ray', pct: 50, spread: 14 }),
      UNIQUE('afterglow', 'Afterglow', 8, 'The charged ray\'s line stays lit for 1.5s: 30% fire a second to foes in it.', { extra: { pct: 30, t: 1.5 } })),
  };
  C.glint = {
    ready: true, tune: { dmg: [0.67, 0.58, 0.5], shape: [0.85, 1, 1] }, base: 0.8, color: '#fff6dc', pose: 'stlAim', title: 'Blinding Glint',
    blurb: 'Tilt the finial until it catches the sun just so: a wider, longer flash that dazzles for much longer.',
    arc: [15, 30, 45], range: [1.15, 1.3, 1.45], dazzle: [1.3, 1.6, 2],
    apply(p, s, k) { p.dmgPct *= by(STAGE_MULT, s); p.arc = Math.min(140, Math.round((p.arc + by(this.arc, s)) * (1 + (k.wide || 0) * 0.15))); p.range = r1(p.range * by(this.range, s)); p.dazzle = r2(p.dazzle * by(this.dazzle, s)); return p; },
    lines(p) { return [`Glint: ${pct(p.dmgPct)} fire in a ${p.arc}° cone ${p.range} m long`, `Dazzled ${p.dazzle}s: they miss ${p.miss}%`]; },
    perks: set(STAGES(), QUICK(), WIDE({ what: 'flash', pct: 15 }),
      UNIQUE('mirror', 'Mirror Flash', 8, 'Foes dazzled by a charged glint take +20% from you for 3s.', { extra: { take: 20, t: 3 } })),
  };
  C.prism = {
    ready: true, tune: { dmg: [1.07, 1.15, 1.03], shape: [1, 1, 1] }, base: 0.8, color: '#fff1b8', pose: 'stlAim', title: 'Grand Prism',
    blurb: 'Turn the sun-glass slowly to the light: more rays fan out, wider, each one burning harder.',
    count: [2, 3, 4], spread: [10, 20, 30],
    apply(p, s) { p.count = Math.min(11, p.count + by(this.count, s)); p.spread = Math.min(120, Math.round(p.spread + by(this.spread, s))); p.dmgPct *= by(STAGE_MULT, s); return p; },
    lines(p) { return [`Rays: ${p.count} in a ${p.spread}° fan`, `Damage each: ${pct(p.dmgPct)} fire`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('refraction', 'Refraction', 6, 'A charged ray that downs its foe splits in two on through the crowd: 50% each.', { extra: { pct: 50 } }),
      UNIQUE('focal', 'Focal Point', 10, 'Charged rays that cross the same foe gild it once for each ray.', {})),
  };
  C.solarRay = {
    ready: true, tune: { dmg: [1, 1, 1.02], shape: [0, 0, 1] }, base: 0.9, color: '#fffaf0', pose: 'stlAim', title: 'Burning Glass', channel: true,
    blurb: 'Hold to focus the glass: at Stage Ⅰ a thicker beam starts by itself, already warm, and ramps faster while held, from Stage Ⅲ much hotter from the start.',
    width: [1.3, 1.6, 1.9], ramp: [1.02, 1.03, 1.04], linger: [0.05, 0.05, 0.05], heat: [0.02, 0.03, 0.25],
    apply(p, s, k) { p.width = r2(p.width * by(this.width, s)); p.ramp = Math.round(p.ramp * by(this.ramp, s)); p.rampMax = r2(Math.max(p.rampMax, k.magnifier ? 2.5 : p.rampMax)); p.linger = by(this.linger, s); p.heat0 = by(this.heat, s); return p; }, // (heat0: a charged beam starts hotter)
    lines(p) { return [`Beam: ${pct(p.dmgPct)} fire a second, +${p.ramp}% a second to ×${p.rampMax}`, `Starts ${Math.round((p.heat0 || 0) * 100)}% hotter`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('magnifier', 'Magnifier', 4, 'A charged beam ramps to ×2.5.', {}),
      UNIQUE('lensFlare', 'Lens Flare', 10, 'Let a charged beam go and its end bursts: 120% fire in 2.5 m.', { extra: { pct: 120, r: 2.5 } })),
  };
  C.sundial = {
    ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0, 0, 0] }, base: 1.1, color: '#ffd36a', pose: 'stlGnomon', title: 'Midsummer',
    blurb: 'Let the shadow lengthen: more hours fall round you, further out, and each column burns harder.',
    count: [1, 2, 3], rMax: [1.1, 1.2, 1.3],
    apply(p, s) { p.count = p.count + by(this.count, s); p.rMax = r1(p.rMax * by(this.rMax, s)); p.duration = r1(p.duration * (1 + 0.08 * s)); p.dmgPct *= by(STAGE_MULT, s); return p; },
    lines(p) { return [`Columns: ${p.count} over ${p.duration}s, out to ${p.rMax} m`, `Damage each: ${pct(p.dmgPct)} fire in ${p.radius} m`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('longest', 'Longest Day', 12, 'A Stage Ⅲ sundial goes round twice (the second time at 50%).', { needs: { stages: 2 }, extra: { second: 50 } })),
  };

  // =================================================================== CORONA
  C.solarFlare = {
    ready: true, tune: { dmg: [1.01, 0.95, 0.83], shape: [1, 1, 1] }, base: 0.8, color: '#ffe0b0', pose: 'stlSunUp', title: 'Great Flare',
    blurb: 'Let the flare swell before you loose it: a bigger, harder burst and a longer sunburn.',
    radius: [1.15, 1.3, 1.45], burn: [1.2, 1.4, 1.6],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.burnPct *= by(STAGE_MULT, s); p.burnDur = r1(p.burnDur * by(this.burn, s)); return p; },
    lines(p) { return [`Flare: ${pct(p.dmgPct)} fire in ${p.radius} m`, `Sunburn: ${pct(p.burnPct)} a second for ${p.burnDur}s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('prominence', 'Prominence', 6, 'A loop of sunlight arcs from a charged flare to the nearest foe within 5 m: 60%.', { extra: { pct: 60, r: 5 } }),
      UNIQUE('coronal', 'Coronal Wave', 10, 'A charged flare rings outward and pushes foes 1.5 m.', { extra: { push: 1.5 } })),
  };
  C.skippingSun = {
    ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0, 0.5, 0.5] }, base: 0.8, color: '#ffd36a', pose: 'stlSkim', title: 'Ducks and Drakes',
    blurb: 'Crouch lower and skim it flatter: the disc skips more times, flaring bigger at every skip.',
    skips: [1, 1, 2], radius: [1.1, 1.2, 1.3],
    apply(p, s) { p.skips = Math.min(11, p.skips + by(this.skips, s)); p.radius = r2(p.radius * by(this.radius, s)); p.length = r1(p.length + 2 * by(this.skips, s) * 0.6); p.dmgPct *= by(STAGE_MULT, s); return p; },
    lines(p) { return [`Skips: ${p.skips} along ${p.length} m`, `Damage at each: ${pct(p.dmgPct)} fire in ${p.radius} m`]; },
    perks: set(STAGES(), QUICK(), SPLIT({ what: 'disc', pct: 50, spread: 16 }),
      UNIQUE('skimmer', 'Sea Skimmer', 8, 'Each charged skip leaves a little sunspot for 2s: 25% fire every 0.5s.', { extra: { pct: 25, t: 2 } })),
  };
  C.sunspot = {
    ready: true, tune: { dmg: [0.67, 0.5, 0.37], shape: [0.6, 0.9, 0.95] }, base: 0.85, color: '#ffc890', pose: 'stlSunUp', title: 'Solar Maximum',
    blurb: 'Gather the light into one spot: a bigger, hotter sunspot that lasts longer.',
    radius: [1.15, 1.3, 1.45], dur: [1.2, 1.4, 1.6],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.duration = r1(p.duration * by(this.dur, s)); return p; },
    lines(p) { return [`Sunspot: ${p.radius} m for ${p.duration}s`, `${pct(p.dmgPct)} fire every ${p.tick}s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('wander', 'Wandering Spot', 4, 'A charged sunspot drifts after your target at 1.2 m/s.', { extra: { speed: 1.2 } }),
      UNIQUE('cycle', 'Sunspot Cycle', 10, 'Every 2s a charged sunspot flares: 120% fire in its radius.', { extra: { pct: 120, every: 2 } })),
  };
  C.littleSun = {
    ready: true, base: 0.9, color: '#ffd36a', pose: 'stlSunUp', title: 'Bright Little Sun', summon: true,
    blurb: 'Let Hinata soak up a bit more light first: a bigger, sturdier little sun with faster sunbolts, who stays out longer.',
    every: [0.95, 0.9, 0.85], life: [1.2, 1.4, 1.6], size: [1.1, 1.2, 1.3], dmg: [1.12, 1.22, 1.32],
    apply(p, s) { p.every = r2(p.every * by(this.every, s)); p.lifePct = Math.round(p.lifePct * by(this.life, s)); p.size = by(this.size, s); p.dmgPct *= by(this.dmg, s); p.duration = r1(p.duration * (1 + 0.08 * s)); return p; },
    lines(p) { return [`Hinata: a sunbolt every ${p.every}s, ${pct(p.dmgPct)} fire`, `Life ${p.lifePct}% of yours · stays ${p.duration}s`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('sunny', 'Sunny Spell', 6, 'A charged Hinata warms the pack twice as often (every 1.5s, 1.5% life).', { extra: { every: 1.5, heal: 1.5 } }),
      UNIQUE('twin', 'Twin Suns', 12, 'A Stage Ⅲ call brings a second little sun, Hikari (her sunbolts at 50%).', { needs: { stages: 2 }, extra: { share: 50 } })),
  };
  C.risingSun = {
    ready: true, tune: { dmg: [0.73, 0.71, 0.55], shape: [1, 1, 1] }, base: 1.1, color: '#ffc070', pose: 'stlSunUp', title: 'Great Sunrise',
    blurb: 'Let it rise slowly: a bigger sun, a wider crown of rays and a deeper sunburn.',
    radius: [1.15, 1.3, 1.45],
    apply(p, s) { p.dmgPct *= by(STAGE_MULT, s); p.radius = r2(p.radius * by(this.radius, s)); p.burnPct *= by(STAGE_MULT, s); p.knockback = r2(p.knockback * (1 + 0.25 * s)); return p; },
    lines(p) { return [`Burst: ${pct(p.dmgPct)} fire in ${p.radius} m`, `Sunburn: ${pct(p.burnPct)} a second for ${p.burnDur}s`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('redSky', 'Red Sky', 12, 'A Stage Ⅲ sun hangs for 4s, scorching everything round it for 40% a second, before it bursts.', { needs: { stages: 2 }, extra: { pct: 40, t: 4 } })),
  };

  // =================================================================== DAWN (heals and shields: not tuned, their value per zoom reported)
  C.morningLight = {
    ready: true, base: 0.8, color: '#ffc8b8', pose: 'stlSunUp', title: 'First Light',
    blurb: 'Wait for the light to spread: much more healing, further out, and from Stage Ⅱ it lingers as a warm patch that keeps mending.',
    heal: [1.5, 2, 2.75], radius: [1.15, 1.3, 1.45], linger: [0, 3, 4],
    apply(p, s) { p.healPct = r1(p.healPct * by(this.heal, s)); p.radius = r1(p.radius * by(this.radius, s)); p.linger = by(this.linger, s); return p; },
    lines(p) { return [`Heals ${p.healPct}% of each ally's life within ${p.radius} m`, ...(p.linger ? [`The light lingers ${p.linger}s, still mending`] : [])]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('chorus', 'Dawn Chorus', 4, 'Birdsong: a charged light gives the pack +10% move speed for 4s.', { extra: { speed: 10, t: 4 } }),
      UNIQUE('clear', 'Clear Morning', 10, 'A Stage Ⅲ light cleanses every ally in it (slows, curses, burns) and fills their sun shells.', { needs: { stages: 2 } })),
  };
  C.kindLight = {
    ready: true, base: 0.75, color: '#ffd8c8', pose: 'stlAim', title: 'Gentle Rays',
    blurb: 'Let the light gather on the finial: more gentle rays, each one to the next ally who needs it (or the next foe who deserves it).',
    rays: [2, 2, 3], heal: [0.82, 0.95, 0.95],
    apply(p, s) { p.rays = by(this.rays, s); p.healPct = r1(p.healPct * by(this.heal, s)); p.rayPct *= dm(this, s) * by(this.heal, s); return p; },
    lines(p) { return [`Rays: ${p.rays}, each to the next ally who needs it: ${p.healPct}%`, `Or at a foe: ${pct(p.rayPct)} fire`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('coat', 'Golden Coat', 6, 'Each charged ray leaves a sun shell of 6% life, even on a full ally.', { extra: { shell: 6 } }),
      UNIQUE('bright', 'Bright Side', 10, 'A charged ray that lands on a foe bounces to the ally who needs it most with half its heal.', {})),
  };
  C.halo = {
    ready: true, base: 0.85, color: '#ffe6a0', pose: 'stlSunUp', title: 'Great Halo',
    blurb: 'Polish the halo before it settles: a much sturdier ring that holds longer and flares wider and harder.',
    absorb: [1.5, 2, 2.75], flare: [1.3, 1.6, 2], radius: [1.1, 1.2, 1.3], dur: [1, 2, 3],
    apply(p, s) { p.absorbPct = r1(p.absorbPct * by(this.absorb, s)); p.flarePct *= by(this.flare, s); p.radius = r2(p.radius * by(this.radius, s)); p.duration += by(this.dur, s); return p; },
    lines(p) { return [`Absorbs ${p.absorbPct}% of the ally's life for ${p.duration}s`, `Its flare: ${pct(p.flarePct)} fire in ${p.radius} m`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('ring', 'Halo Ring', 6, 'From Stage Ⅱ every ally within 6 m gets a halo at 50%.', { needs: { stages: 1 }, extra: { share: 50, r: 6 } }),
      UNIQUE('solar', 'Solar Halo', 10, 'A foe that strikes a charged halo is seared: 40% fire.', { extra: { pct: 40 } })),
  };
  C.sunDog = {
    ready: true, base: 0.85, color: '#fff1b8', pose: 'stlSunUp', title: 'Parhelion',
    blurb: 'Let the halo spots gather round him: Shadow glows for longer, bites harder, and his catch heals more.',
    dur: [1.3, 1.6, 2], buff: [8, 14, 20], catchP: [10, 20, 30],
    apply(p, s) { p.duration = r1(p.duration * by(this.dur, s)); p.dmgBuff += by(this.buff, s); p.searPct *= 1 + 0.15 * s; p.catchPct += by(this.catchP, s); return p; },
    lines(p) { return [`Shadow for ${p.duration}s: +${p.dmgBuff}% damage, bites sear ${pct(p.searPct)}`, `His catch mends ${p.catchPct}%`]; },
    perks: set(STAGES(), QUICK(),
      UNIQUE('heel', 'Heel!', 5, 'A charged sun dog\'s bites draw the foe off you: it goes for Shadow for 1s.', { extra: { t: 1 } }),
      UNIQUE('twinDogs', 'Twin Sun Dogs', 10, 'At Stage Ⅲ two bright mock suns orbit Shadow and ping his foes: 35% fire.', { needs: { stages: 2 }, extra: { pct: 35, every: 0.8 } })),
  };
  C.daybreak = {
    ready: true, base: 1.1, color: '#ffd0b0', pose: 'stlSunUp', title: 'New Day',
    blurb: 'Let the whole sky lighten first: dawn breaks wider and lasts longer, and the pack is braver for it.',
    radius: [1.1, 1.2, 1.3], dur: [1.2, 1.4, 1.6], buff: [5, 10, 15],
    apply(p, s) { p.radius = r1(p.radius * by(this.radius, s)); p.duration = r1(p.duration * by(this.dur, s)); p.dmgBuff += by(this.buff, s); p.healPct = r1(p.healPct * (1 + 0.2 * s)); return p; },
    lines(p) { return [`Within ${p.radius} m: the pack mends ${p.healPct}%`, `For ${p.duration}s: +${p.dmgBuff}% damage, +${p.speed}% speed`]; },
    perks: set(STAGES(), QUICK(), FOCUS(),
      UNIQUE('hope', 'Hope Springs', 12, 'At Stage Ⅲ anyone in the light who would fall is caught once at 30%.', { needs: { stages: 2 }, extra: { pct: 30 } })),
  };
  return C;
}
