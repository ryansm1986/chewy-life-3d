// Moka's charged releases (docs/CHARGE.md §7) beyond the phase-1 showcase (chargedSkills.js has Splash Bolt; the
// Moonbeam channel lives in mokaSpells.js). Same contract as chargedChewy.js: R.params are the charged numbers,
// R.charge = { stage, perks, color, base }; fromFrame() replays a cast from its wound-back frame with event hooks.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, dist, clamp } from '../core/util.js';
import { chargeFx } from '../gfx/chargeFx.js';
import { perkAt } from '../rpg/charge.js';
import { PAL } from '../gfx/spellFx.js';
import { DuckDecoy, SpiritRetriever } from './allies.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const C = h => new THREE.Color(h);
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const by = (arr, s) => (Array.isArray(arr) ? arr[Math.max(0, Math.min(arr.length - 1, s - 1))] : arr);
const perkOf = perkAt; // (its pct scaled to the release's stage)

const M = {
  // ================================================================== Tidewater
  /** Bubble Barrier → Mega Bubble: a much bigger bubble that soaks far more (+ Bubble Wrap, Bounce House) */
  charged_bubble(R) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, wrap = perkOf(R, 'wrap'), bounce = perkOf(R, 'bounce');
    this.fromFrame(0.45, () => this.cast_bubble(R), ev => {
      if (ev !== 'cast') return;
      const B = this.bubbleShield; if (!B) return;
      B.h.scale = 1.18 + 0.12 * s;
      chargeFx(G).burst(P.pos, { r: 1.5 + 0.3 * s, life: 0.45, color: C(R.charge.color), w: 0.12, a: 0.8 });
      if (wrap) for (const a of [G.companion, this.retriever, this.retrieverPup]) if (a?.pos && a.takeDamage && a.alive !== false && !a.fainted) this.wrapAlly(a, Math.round(p.absorb * wrap.k), p.duration);
      if (bounce) {
        const z = this.combat.addZone({ pos: P.pos, life: p.duration, update: (dt, zz) => {
          if (this.bubbleShield !== B) { zz.t = zz.life; return; }
          const reach = 0.92 * B.h.scale + 0.5;
          for (const e of this.foesNear(P.pos.x, P.pos.z, reach)) {
            if ((e._boingT || 0) > zz.t) continue;
            e._boingT = zz.t + 1;
            _v.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z); if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0); _v.normalize();
            if (!e.def?.boss) e.knock?.addScaledVector(_v, 18);
            e.applyStatus?.('slow', 1.5, 0.35); this.fx().chill(e); B.h.hit(); sfx('slime_bounce', { pitch: 1.7, vol: 0.6 });
          }
        } });
        (this.mokaZones ||= []).push(z);
      }
    });
  },
  /** Bubble Wrap: a smaller bubble that soaks hits for an ally (Shadow, the Spirit Retriever) */
  wrapAlly(a, amount, dur) {
    if (a._wrap) return;
    const h = this.fx().bubble(out => out.copy(a.pos)); h.scale = 0.72;
    const raw = a.takeDamage; let left = amount;
    const W = a._wrap = { h };
    const end = pop => { if (a._wrap !== W) return; a._wrap = null; a.takeDamage = raw; if (pop) { h.pop(); sfx('bubble_pop', { pitch: 1.3 }); } else h.end(); };
    a.takeDamage = (dmg, o) => { if (left > 0) { const t = Math.min(left, dmg); left -= t; dmg -= t; h.hit(); if (left <= 0.5) end(true); } if (dmg > 0) return raw.call(a, dmg, o); };
    this.after(dur, () => end(false));
    (this.wraps ||= []).push(end);
  },
  /** Wet Dog Shake → Big Shake: a bigger, colder shake; Stage Ⅲ freezes (+ Second Shake, Puddle Party) */
  charged_shake(R) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, echo = perkOf(R, 'echo'), party = perkOf(R, 'puddles');
    this.fromFrame(0.15, () => this.cast_shake(R), ev => {
      if (ev !== 'shake') return;
      const at = P.pos.clone();
      chargeFx(G).burst(at, { r: p.radius, life: 0.45, color: C(R.charge.color), w: 0.1, a: 0.75 });
      if (p.freeze) this.nova2(at.x, at.z, p.radius, e => { if (!isFoe(e)) return; e.applyStatus?.('freeze', p.freeze); G.vfx.frost(_v.set(e.pos.x, e.pos.y + 0.6, e.pos.z), 10); this.fx().chill(e); });
      if (echo) this.after(echo.delay, () => {
        this.fx().shakeSpray(P.pos, p.radius * 0.8); sfx('shake_spray', { pitch: 1.2 });
        this.nova2(P.pos.x, P.pos.z, p.radius * 0.8, e => this.mokaHit(e, { dmgPct: p.dmgPct * echo.pct / 100, element: 'frost', knock: p.knockback * 0.5, from: P.pos, chill: p.chill, chillDur: p.chillDur * 0.5 }));
      });
      if (party) {
        const n = by(party.n, s), pts = [];
        for (let i = 0; i < n; i++) { const a = i / n * TAU + rand(-0.3, 0.3), r = rand(1.7, 2.6); const q = this.ground(at.clone().add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r))); if (G.world.collision?.solidAt?.(q.x, q.z, 0.4)) continue; pts.push(q); this.fx().puddle(q, { r: 1.0, life: party.dur }); }
        const z = this.combat.addZone({ pos: at, life: party.dur, tick: 0.3, onTick: () => { for (const q of pts) for (const e of this.foesNear(q.x, q.z, 1.05)) { e.applyStatus?.('slow', 0.6, 0.4); if (Math.random() < 0.25) this.fx().droplets(_v.set(e.pos.x, e.pos.y + 0.1, e.pos.z), { n: 3, speed: 1.5, up: 2.5, size: 0.12 }); } } });
        (this.mokaZones ||= []).push(z);
      }
    });
  },
  /** Puddle Hop → Cannonball: a longer hop and a much bigger arrival splash (+ Return Trip, Hopscotch) */
  charged_puddleHop(R, aim) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, ret = perkOf(R, 'returnTrip'), hop = perkOf(R, 'hopscotch');
    const start = P.pos.clone();
    this.fromFrame(0.16, () => this.cast_puddleHop(R, aim), ev => {
      if (ev === 'dive' && ret) { this.fx().puddle(start, { r: 0.95, life: ret.t }); this.returnTrip = { pos: start.clone(), until: (this.charge?.clock || 0) + ret.t }; }
      if (ev !== 'pop') return;
      const end = P.pos.clone(), fx = this.fx();
      fx.ripple(end, { r: p.radius * 1.1, life: 0.9, color: PAL.sea, alpha: 0.8 }); // (the hop's own crown is enough: tame() keeps it low and see-through)
      chargeFx(G).burst(end, { r: p.radius, life: 0.45, color: C(R.charge.color), w: 0.12, a: 0.8 });
      fx.droplets(_v.set(end.x, end.y + 0.2, end.z), { n: 16 + 6 * s, speed: 2.2 * p.radius, up: 5, size: 0.18, spread: 0.4 });
      if (hop) this.hopscotch(p, hop, new Set(), hop.n);
    });
  },
  /** Hopscotch: Moka pops out of puddle after puddle, splashing the next foe each time */
  hopscotch(p, hop, hit, n) {
    const G = this.G, P = G.player;
    if (n <= 0 || G.playerDead) return;
    let best = null, bd = 1e9;
    for (const e of this.foesNear(P.pos.x, P.pos.z, hop.r)) { if (hit.has(e)) continue; const d = dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z); if (d < bd && d > 0.8) { bd = d; best = e; } }
    if (!best) return;
    hit.add(best);
    _v.set(P.pos.x - best.pos.x, 0, P.pos.z - best.pos.z).normalize().multiplyScalar((best.radius || 0.3) + 0.55);
    const dest = this.ground(best.pos.clone().add(_v)), from = P.pos.clone();
    if (G.world.collision?.solidAt?.(dest.x, dest.z, P.radius * 0.8) || !this.lineClear(P.pos, dest, P.radius * 0.6)) return; // (never through a wall or a closed door to a foe in the next room)
    this.after(0.12, () => {
      if (G.playerDead) return;
      P.invuln = true; this.faceTo(best.pos);
      P.anim.play('puddleHop', { speed: 1.9, onEvent: ev => {
        const fx = this.fx();
        if (ev === 'dive') { fx.puddle(from, { r: 0.7, life: 0.7 }); fx.splash(from, { r: 0.6, alpha: 0.6 }); sfx('puddle_dive', { pitch: 1.3 }); }
        else if (ev === 'under') { fx.puddle(dest, { r: 0.8, life: 0.9 }); P.pos.copy(dest); P.sync?.(); }
        else if (ev === 'pop') {
          P.invuln = false; fx.splash(dest, { r: 0.9, big: true, maxH: 1.3, alpha: 0.6 }); sfx('puddle_pop', { pitch: 1.25 }); G.engine.rig.shake(0.15);
          this.nova2(dest.x, dest.z, Math.max(1.6, p.radius * 0.55), e => this.mokaHit(e, { dmgPct: p.dmgPct * hop.pct / 100, element: 'frost', knock: 0.8, from: dest, chill: p.chill, chillDur: p.chillDur }));
          this.hopscotch(p, hop, hit, n - 1);
        } else if (ev === 'end') P.invuln = false;
      } });
    });
  },
  /** Whirlpool → Maelstrom: bigger, longer, stronger pull (+ Riptide, Geyser) */
  charged_whirlpool(R, aim) {
    const G = this.G, p = R.params, rip = perkOf(R, 'riptide'), gey = perkOf(R, 'geyser');
    this.fromFrame(0.45, () => this.cast_whirlpool(R, aim), ev => {
      if (ev !== 'cast') return;
      const z = this.mokaZones?.[this.mokaZones.length - 1]; if (!z) return;
      chargeFx(G).burst(z.pos, { r: p.radius * 1.1, life: 0.5, color: C(R.charge.color), w: 0.1, a: 0.75 });
      if (rip) { const up = z.update; z.update = (dt, zz) => { up(dt, zz); const a = this.charge.cursorGround(_u); if (!a) return; const dx = a.x - zz.pos.x, dz = a.z - zz.pos.z, d = Math.hypot(dx, dz); if (d < 0.2) return; const st = Math.min(d, rip.speed * dt); _w.copy(zz.pos); zz.pos.x += dx / d * st; zz.pos.z += dz / d * st; G.world.collision?.resolve(zz.pos, 0.6, _w); zz.mokaFx.pos.copy(zz.pos); }; }
      if (gey) { const disp = z.dispose; z.dispose = () => { disp?.(); this.geyser(z.pos.clone(), p, gey); }; }
    });
  },
  geyser(at, p, gey) {
    const G = this.G, fx = this.fx();
    fx.splash(at, { r: 1.25, big: true, maxH: 2.8, alpha: 0.72 }); G.vfx.pillar(at, { color: '#8ff0ff', r: 0.9, h: 5, life: 0.6, opacity: 0.55 });
    fx.droplets(_v.set(at.x, at.y + 0.4, at.z), { n: 40, speed: 3, up: 11, size: 0.22, spread: 0.5 });
    chargeFx(G).burst(at, { r: p.radius, life: 0.45, color: PAL.aqua, w: 0.12 });
    sfx('puddle_pop', { pitch: 0.7 }); sfx('water_splash', { pos: at, pitch: 0.8 }); G.engine.rig.shake(0.5);
    this.nova2(at.x, at.z, p.radius, e => this.mokaHit(e, { dmgPct: p.dmgPct * gey.pct / 100, element: 'frost', stun: gey.stun, knock: 0.4, from: at }));
  },
  /** Great Wave → Rogue Wave: wider and harder; Tsunami's Stage Ⅲ wave rolls twice as far, carrying foes */
  charged_greatWave(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    this.fromFrame(0.08, () => this.cast_greatWave(R, aim), ev => { if (ev === 'wave') chargeFx(G).burst(P.pos, { r: p.width * 0.5, life: 0.5, color: C(R.charge.color), w: 0.1, a: 0.75 }); });
  },

  // ================================================================== Starlight Kibble
  /** Kibble Missiles → Kibble Swarm: a bigger handful that homes in harder (+ Encore, Twinkle Twinkle) */
  charged_kibble(R, aim, target) {
    const G = this.G, P = G.player, p = R.params, echo = perkOf(R, 'echo'), tw = perkOf(R, 'twinkle');
    const volley = k => {
      const from = this.launchPoint(), foes = [];
      if (target && isFoe(target)) foes.push(target);
      const near = this.foesNear(P.pos.x, P.pos.z, p.range * 0.85).filter(e => e !== target);
      near.sort((a, b) => dist(a.pos.x, a.pos.z, aim.x, aim.z) - dist(b.pos.x, b.pos.z, aim.x, aim.z));
      for (const e of near) { if (foes.length >= p.count) break; foes.push(e); }
      const base = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);
      this.tipFlash(PAL.gold, 1.2); sfx('kibble_toss', { pitch: k < 1 ? 1.2 : 0.95 });
      for (let i = 0; i < p.count; i++) {
        const tgt = foes.length ? foes[i % foes.length] : null, a = base + (p.count > 1 ? (i / (p.count - 1) - 0.5) * 2.0 : 0);
        this.after(i * 0.035, () => {
          const pr = this.combat.spawn({ team: 'ally', kind: 'kibble', pos: from.clone(), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), speed: p.speed * 1.05, range: p.range, radius: 0.28, homing: tgt ? p.homing : 0,
            onHit: e => {
              this.mokaHit(e, { dmgPct: p.dmgPct * k, element: 'zap', knock: 0.15, from: P.pos }); this.fx().starBurst(_u.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z), { r: 0.7, n: 7 }); sfx('kibble_hit', { pos: e.pos });
              if (tw) { const at = e.pos.clone(); this.after(tw.delay, () => { this.fx().starBurst(_u.set(at.x, at.y + 0.6, at.z), { r: tw.r, n: 10, color: PAL.star, color2: PAL.gold }); chargeFx(G).burst(at, { r: tw.r, life: 0.3, color: PAL.gold, w: 0.14, a: 0.8 }); sfx('rune_chime', { pos: at, vol: 0.4, pitch: 1.4 }); this.nova2(at.x, at.z, tw.r, x => this.mokaHit(x, { dmgPct: p.dmgPct * tw.pct / 100, element: 'zap', from: at })); }); }
            },
            onEnd: (pr2, hit) => { if (!hit) this.fx().starBurst(pr2.pos, { r: 0.45, n: 4 }); } });
          pr.homeTarget = tgt;
          pr.mesh.scale.setScalar(1.25);
        });
      }
    };
    this.playFrom('staffBolt', { speed: this.castRate(), onEvent: ev => { if (ev !== 'release') return; volley(1); if (echo) this.after(echo.delay, () => volley(echo.pct / 100)); } }, 0.38);
  },
  /** Squeaky Nova → Mega Squeak: a bigger, louder squeak with a much longer stun (+ Squeak Squeak, Seeing Stars) */
  charged_squeak(R) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, sq = perkOf(R, 'squeakSqueak'), stars = perkOf(R, 'stars');
    this.fromFrame(0.5, () => this.cast_squeak(R), ev => {
      if (ev !== 'cast') return;
      const at = P.pos.clone();
      this.after(0.16, () => chargeFx(G).burst(at, { r: p.radius, life: 0.45, color: C(R.charge.color), w: 0.1, a: 0.75 }));
      if (sq) for (let i = 0; i < by(sq.n, s); i++) this.after(0.45 + i * 0.38, () => {
        this.fx().squeak(at, p.radius * 0.72, 2.1); sfx('squeak_big', { pitch: 1.2 + 0.1 * i, vol: 0.7 });
        this.after(0.16, () => this.nova2(at.x, at.z, p.radius * 0.72, e => this.mokaHit(e, { dmgPct: p.dmgPct * sq.pct / 100, element: 'zap', knock: 0.6, from: at })));
      });
      if (stars) this.after(0.3, () => {
        const dazed = this.foesNear(at.x, at.z, p.radius).slice();
        const z = this.combat.addZone({ pos: at, life: p.stun, tick: 0.5, onTick: () => {
          for (const e of dazed) {
            if (!e.alive || !(e.status?.stun > 0)) continue;
            const n = this.combat.nearest(e.pos, 'ally', 2.2, x => x !== e && isFoe(x));
            if (!n) continue;
            chargeFx(G).arc(_v.set(e.pos.x, e.pos.y + (e.height || 1) + 0.2, e.pos.z), _w.set(n.pos.x, n.pos.y + 0.6, n.pos.z), PAL.pink);
            this.mokaHit(n, { dmgPct: p.dmgPct * stars.pct / 100, element: 'zap', from: e.pos });
          }
        } });
        (this.mokaZones ||= []).push(z);
      });
    });
  },
  /** Paw Rune → Grand Paw: a bigger rune that arms at once and tugs foes in (+ Paw Prints, Paw Parade) */
  charged_pawRune(R, aim) {
    const G = this.G, p = R.params, split = perkOf(R, 'split'), parade = perkOf(R, 'parade');
    this.fromFrame(0.45, () => this.cast_pawRune(R, aim), ev => {
      if (ev !== 'cast') return;
      const main = this.runes?.[this.runes.length - 1]; if (!main) return;
      const at = main.pos;
      chargeFx(G).burst(at, { r: p.radius, life: 0.5, color: C(R.charge.color), w: 0.1, a: 0.75 });
      // Paw Prints: extra runes stamped round the target
      for (let i = 0; i < (split ? R.charge.perks.split : 0); i++) {
        const a = i / (R.charge.perks.split) * TAU + 0.6, q = this.ground(at.clone().add(_v.set(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9)));
        if (G.world.collision?.solidAt?.(q.x, q.z, 0.3)) continue;
        this.runes.push({ pos: q, h: this.fx().pawRune(q, 0.9), t: 0, p: { ...p, dmgPct: p.dmgPct * split.pct / 100, radius: p.radius * 0.75 }, alive: true, soft: true });
      }
      // the Grand Paw tugs foes toward it until it erupts
      const z = this.combat.addZone({ pos: at, life: p.life, update: (dt, zz) => {
        if (!main.alive) { zz.t = zz.life; return; }
        for (const e of this.foesNear(at.x, at.z, p.lure)) this.pullFoe(e, at.x, at.z, 1.3 * dt, 0.3);
        if (Math.random() < dt * 8) { const a = rand(0, TAU), r = p.lure * rand(0.6, 1); this.fx().pa.spawn({ frame: 1, x: at.x + Math.cos(a) * r, y: 0.3, z: at.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.2, vz: -Math.sin(a) * r * 1.2, life: 0.8, size: 0.2, size1: 0.05, color: PAL.violet, alpha: 0.9, alpha1: 0 }); }
      } });
      (this.mokaZones ||= []).push(z);
      if (parade) main.onErupt = r => {
        const hit = this.foesNear(r.pos.x, r.pos.z, r.p.radius + 1).slice(0, parade.n);
        hit.forEach((e, i) => this.after(0.35 + i * 0.12, () => { const q = this.ground(e.pos.clone()); this.runes.push({ pos: q, h: this.fx().pawRune(q, 0.75), t: r.p.arm, p: { ...r.p, dmgPct: r.p.dmgPct * parade.pct / 100, radius: r.p.radius * 0.6 }, alive: true, soft: true }); sfx('rune_stamp', { pos: q, pitch: 1.3 }); }));
      };
    });
  },
  /** Constellation Link → Great Constellation: more stars, longer links, a brighter twinkle (+ Star Chart, Big Dipper) */
  charged_constellation(R, aim, target) {
    const G = this.G, P = G.player, p = R.params, chart = perkOf(R, 'chart'), dip = perkOf(R, 'dipper');
    const first = this.pickFoe(aim, target, p.range);
    if (!first) return this.cast_constellation(R, aim, target); // (no stars: refunds, as normal)
    this.faceTo(first.pos);
    this.playFrom('staffCast', { speed: this.castRate(), onEvent: ev => {
      if (ev !== 'cast') return;
      const fx = this.fx(), K = fx.constellation(), tip = { pos: this.staffTip(new THREE.Vector3()).clone(), alive: true, height: 0 };
      K.node(tip);
      const chain = [first], seen = new Set([first]);
      let cur = first;
      for (let i = 1; i < p.links; i++) {
        let best = null, bd = p.linkRange;
        for (const e of this.combat.entities) { if (!isFoe(e) || seen.has(e)) continue; const d = dist(e.pos.x, e.pos.z, cur.pos.x, cur.pos.z); if (d < bd) { bd = d; best = e; } }
        if (!best) break; chain.push(best); seen.add(best); cur = best;
      }
      let prev = tip;
      chain.forEach((e, i) => this.after(i * 0.075, () => { const n = K.node(e); K.link(prev, n); prev = n; sfx('star_chain', { pos: e.pos, pitch: 1 + i * 0.07 }); this.mokaHit(e, { dmgPct: p.dmgPct, element: 'zap', from: P.pos, slow: p.slow, slowDur: 1.2 }); }));
      const tw = chain.length * 0.075 + 0.4, keep = chart ? chart.t : 0.35;
      this.after(tw, () => { K.twinkle(); sfx('constellation_twinkle'); for (const e of chain) if (e.alive) this.mokaHit(e, { dmgPct: p.dmgPct * p.twinklePct / 100, element: 'zap', from: P.pos }); });
      this.after(tw + keep, () => K.end());
      (this.mokaFx ||= []).push(K);
      // Star Chart: the lines stay as starlight threads that zap foes touching them
      if (chart) this.after(tw, () => {
        const z = this.combat.addZone({ pos: first.pos.clone(), life: chart.t, tick: 0.5, onTick: () => {
          for (let i = 0; i < chain.length - 1; i++) {
            const a = chain[i].pos, b = chain[i + 1].pos, abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz || 1;
            for (const e of this.combat.entities) { if (!isFoe(e)) continue; const t = clamp(((e.pos.x - a.x) * abx + (e.pos.z - a.z) * abz) / L2), px = a.x + abx * t, pz = a.z + abz * t; if (Math.hypot(e.pos.x - px, e.pos.z - pz) < 0.5 + (e.radius || 0.3)) this.mokaHit(e, { dmgPct: p.dmgPct * chart.pct / 100, element: 'zap', from: e.pos, silent: false }); }
          }
        } });
        (this.mokaZones ||= []).push(z);
      });
      // Big Dipper: seven stars or more → a ladle of starlight scoops down on the middle
      if (dip && chain.length + 1 >= dip.min) this.after(tw + 0.15, () => {
        const c = new THREE.Vector3(); for (const e of chain) c.add(e.pos); c.multiplyScalar(1 / chain.length); this.ground(c);
        const H = chargeFx(G).dipper(c, { onLand: () => {
          chargeFx(G).burst(c, { r: dip.r * 1.1, life: 0.5, color: PAL.gold, w: 0.14 }); fx.starBurst(_u.set(c.x, c.y + 0.6, c.z), { r: 2, n: 22 });
          sfx('meteor_boom', { pitch: 1.5, vol: 0.7 }); G.engine.rig.shake(0.5);
          this.nova2(c.x, c.z, dip.r, e => this.mokaHit(e, { dmgPct: p.dmgPct * dip.pct / 100, element: 'zap', knock: 1, from: c }));
        } });
        (this.mokaFx ||= []).push(H);
      });
    } }, 0.45);
  },
  /** Treat Meteor → Mega Meteor: bigger biscuit, bigger crater (+ Meteor Shower at Stage Ⅲ) */
  charged_meteor(R, aim) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, shower = perkOf(R, 'shower');
    const to = this.clampAim(aim, p.range);
    this.fromFrame(0.5, () => this.cast_meteor(R, aim), ev => {
      if (ev !== 'cast') return;
      this.after(p.delay + 0.02, () => chargeFx(G).burst(to, { r: p.radius * 1.1, life: 0.55, color: C(R.charge.color), w: 0.12, a: 0.8 }));
      if (shower && s >= 3) for (let i = 0; i < shower.n; i++) this.after(p.delay + 0.2 + i * 0.16, () => {
        const a = i / shower.n * TAU + rand(-0.4, 0.4), r = p.radius * rand(0.7, 1.1), at = this.ground(to.clone().add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r)));
        const from = at.clone().add(_w.set(-2.5, 8, -2.5));
        const h = this.fx().meteor(from, at, { time: 0.5, r: 1.6, scale: 0.5, onImpact: q => { sfx('meteor_boom', { pitch: 1.5, vol: 0.5 }); G.engine.rig.shake(0.25); this.nova2(q.x, q.z, 1.6, e => { const d = this.mokaHit(e, { dmgPct: p.dmgPct * shower.pct / 100, element: 'zap', knock: 0.8, from: q }); if (e.alive && d) e.applyStatus?.('burn', 2, d * 0.1); }); } });
        (this.mokaFx ||= []).push(h);
      });
    });
  },

  // ================================================================== Duck Hunt
  /** Decoy Duck → Mother Duck: bigger, tougher, wider lure, bigger pop (+ Ducklings, Quack Attack) */
  charged_duckDecoy(R, aim) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, kids = perkOf(R, 'ducklings'), qa = perkOf(R, 'quackAttack');
    this.fromFrame(0.5, () => this.cast_duckDecoy(R, aim), ev => {
      if (ev !== 'summon') return;
      const mom = this.ducks?.[this.ducks.length - 1]; if (!mom) return;
      chargeFx(G).burst(mom.pos, { r: 1.6, life: 0.4, color: C(R.charge.color), w: 0.14 });
      if (qa) { const pop = mom.pop.bind(mom); mom.pop = () => { const at = mom.pos.clone(), was = mom.alive; pop(); if (!was) return; this.fx().quack(at, { r: qa.r, big: true }); this.fx().text('QUACK!', _v.set(at.x, at.y + 1.5, at.z), { a: '#fff4a0', b: '#ffb04a', size: 1.6 }); chargeFx(G).burst(at, { r: qa.r, life: 0.45, color: C('#ffd84a'), w: 0.12 }); sfx('quack', { pitch: 0.7 }); this.nova2(at.x, at.z, qa.r, e => { if (!isFoe(e)) return; this.mokaHit(e, { dmgPct: 1, stun: qa.stun, from: at, silent: true }); }); }; }
      if (kids) {
        const n = by(kids.n, s), list = (this.ducklings ||= []);
        for (let i = 0; i < n; i++) {
          const d = new DuckDecoy(G, mom.pos.clone(), mom.to.clone(), { ...p, life: 1, lureRadius: 0, quack: 99, slow: 0, dmgPct: p.dmgPct * kids.pct / 100, popRadius: 1.2, size: 0.5, duration: p.duration });
          d.duckling = true; d.mom = mom; d.slot = i; list.push(d);
        }
      }
    });
  },
  /** ducklings waddle in a line behind their Mother Duck (updateMoka runs this) */
  updateDucklings(dt) {
    const L = this.ducklings; if (!L?.length) return;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      if (!d.alive) { L.splice(i, 1); continue; }
      const m = d.mom;
      if (m?.alive) { const b = m.yaw + Math.PI, r = 0.55 * (d.slot + 1); d.to.set(m.pos.x + Math.sin(b) * r, m.pos.y, m.pos.z + Math.cos(b) * r); }
      d.update(dt);
    }
  },
  /** Fetch! → Long Leash: a much longer leash; the yank slams foes down at Moka's paws (+ Double Leash, Fling) */
  charged_fetchLeash(R, aim, target) {
    const G = this.G, P = G.player, p = R.params, fling = perkOf(R, 'fling');
    const first = this.pickFoe(aim, target, p.range);
    if (!first) return this.cast_fetchLeash(R, aim, target); // (loot / nothing: as normal)
    const foes = [first];
    if (p.grabs > 1) { const near = this.foesNear(first.pos.x, first.pos.z, 4.5).filter(e => e !== first).sort((a, b) => dist(a.pos.x, a.pos.z, first.pos.x, first.pos.z) - dist(b.pos.x, b.pos.z, first.pos.x, first.pos.z)); for (const e of near) { if (foes.length >= p.grabs) break; foes.push(e); } }
    this.faceTo(first.pos);
    const legs = [];
    this.playFrom('yank', { speed: this.castRate(), onEvent: ev => {
      const fx = this.fx();
      if (ev === 'lash') {
        for (const e of foes) { if (!e.alive) continue; legs.push({ e, h: fx.leash(out => this.staffTip(out), out => out.set(e.pos.x, e.pos.y + (e.height || 1) * 0.62, e.pos.z)) }); fx.collar(e, 1.0); }
        sfx('leash_throw'); if (legs.length > 1) sfx('leash_throw', { pitch: 1.2 });
      } else if (ev === 'yank') {
        sfx('leash_snap'); G.engine.rig.shake(0.25);
        const fwd = this.forward(), side = _v.set(fwd.z, 0, -fwd.x).clone();
        legs.forEach((L, i) => {
          const e = L.e;
          if (!e.alive) { L.h.snap(); return; }
          if (e.def?.boss) { this.mokaHit(e, { dmgPct: p.dmgPct, from: P.pos, stun: p.stun }); this.after(0.25, () => L.h.snap()); return; }
          const off = (i - (legs.length - 1) / 2) * 1.2;
          let dest = this.ground(P.pos.clone().addScaledVector(fwd, fling ? -(2.6 + Math.abs(off) * 0.2) : 1.1 + (e.radius || 0.3)).addScaledVector(side, off));
          if (G.world.collision?.solidAt?.(dest.x, dest.z, (e.radius || 0.3) * 0.8)) dest = this.ground(P.pos.clone().addScaledVector(fwd, 1.1 + (e.radius || 0.3)).addScaledVector(side, off));
          const from = e.pos.clone(), T = fling ? 0.42 : 0.26, y0 = e.pos.y;
          const z = this.combat.addZone({ pos: from, life: T + 0.02,
            update: (dt, zz) => {
              if (!e.alive) return;
              const k = Math.min(1, zz.t / T), ek = k * k * (3 - 2 * k);
              _w.copy(e.pos); e.pos.x = from.x + (dest.x - from.x) * ek; e.pos.z = from.z + (dest.z - from.z) * ek;
              if (fling) e.pos.y = y0 + Math.sin(k * Math.PI) * 2.2;
              (e.world || G.world).collision?.resolve(e.pos, (e.radius || 0.3) * 0.8, _w);
              L.h.frac = 1; L.h.sag = 0.05;
              if (Math.random() < 0.5) G.vfx.dust(e.pos, { n: 1 });
            },
            dispose: () => {
              L.h.snap();
              if (!e.alive) return;
              e.pos.y = G.world.heightAt(e.pos.x, e.pos.z);
              const at = e.pos.clone();
              this.mokaHit(e, { dmgPct: p.dmgPct, stun: p.stun, from: P.pos, knock: 0 });
              fx.splash(at, { r: 0.6, maxH: 0.7, alpha: 0.5 }); G.vfx.dustRing(at, 1.2, 10); fx.starBurst(_u.set(at.x, at.y + 0.8, at.z), { r: 0.8, n: 8, color: PAL.orange, color2: PAL.duck });
              this.nova2(at.x, at.z, 1.5, x => { if (x !== e) this.mokaHit(x, { dmgPct: p.dmgPct * p.slamPct / 100, from: at, knock: 0.6 }); });
              if (fling) { chargeFx(G).burst(at, { r: 2, life: 0.4, color: C(R.charge.color), w: 0.14 }); G.vfx.dustRing(at, 1.8, 14); G.engine.rig.shake(0.35); sfx('dig', { pitch: 1.2 }); this.nova2(at.x, at.z, 2, x => { if (x !== e) this.mokaHit(x, { dmgPct: p.dmgPct * fling.pct / 100, from: at, knock: 1 }); }); }
              sfx('bark_small', { pitch: 1.5 });
            } });
          (this.mokaZones ||= []).push(z);
        });
      }
    } }, 0.22);
  },
  /** Feather Flurry → Feather Storm: a huge fan that pierces deeper (+ Second Flurry, Pillow Fight) */
  charged_feathers(R, aim) {
    const G = this.G, P = G.player, p = R.params, echo = perkOf(R, 'echo'), pillow = perkOf(R, 'pillow');
    const fan = k => {
      const from = this.launchPoint(), base = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z), spread = p.spread * Math.PI / 180;
      this.fx().featherBurst(this.staffTip(_w), 10); sfx('feather_flutter', { pitch: k < 1 ? 1.2 : 0.95 });
      for (let i = 0; i < p.count; i++) {
        const a = base + (p.count > 1 ? (i / (p.count - 1) - 0.5) * spread : 0) + rand(-0.04, 0.04);
        this.combat.spawn({ team: 'ally', kind: 'feather', pos: from.clone(), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), speed: p.speed * rand(0.92, 1.1), range: p.range * rand(0.9, 1.05), radius: 0.26, pierce: p.pierce,
          onHit: e => {
            this.mokaHit(e, { dmgPct: p.dmgPct * k, from: P.pos, knock: 0.25 }); this.fx().featherBurst(_u.set(e.pos.x, e.pos.y + (e.height || 1) * 0.5, e.pos.z), 4);
            if (pillow && isFoe(e)) { const now = this.charge?.clock || 0; e._fluff = (e._fluffT > now ? e._fluff : 0) + 1; e._fluffT = now + 3; if (e._fluff >= pillow.n) { e._fluff = 0; const at = e.pos.clone(); this.fx().featherBurst(_u.set(at.x, at.y + 0.6, at.z), 24); this.fx().text('POOF!', _v.set(at.x, at.y + 1.6, at.z), { a: '#fff6e0', b: '#ffb04a', size: 1.3 }); sfx('confetti_pop', { pos: at, pitch: 1.3 }); this.mokaHit(e, { dmgPct: p.dmgPct * pillow.pct / 100, stun: pillow.stun, from: at }); } }
          } });
      }
    };
    this.playFrom('staffBolt', { speed: this.castRate(), onEvent: ev => { if (ev !== 'release') return; fan(1); if (echo) this.after(echo.delay, () => fan(echo.pct / 100)); } }, 0.38);
  },
  /** Duck Call → Big Honk: a louder call, a wider pull, a much longer daze (+ Bread Crumbs, Goose!) */
  charged_duckCall(R, aim) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, crumbs = perkOf(R, 'crumbs'), goose = perkOf(R, 'goose');
    const at = this.clampAim(aim, p.range);
    this.fromFrame(0.3, () => this.cast_duckCall(R, aim), ev => {
      if (ev !== 'cast') return;
      chargeFx(G).burst(at, { r: p.radius, life: 0.5, color: C(R.charge.color), w: 0.1, a: 0.75 });
      if (crumbs) this.after(p.pullTime + 0.05, () => {
        chargeFx(G).crumbs(at, 1.6, crumbs.t);
        const z = this.combat.addZone({ pos: at, life: crumbs.t, tick: 0.3, onTick: () => { for (const e of this.foesNear(at.x, at.z, 2)) e.applyStatus?.('slow', 0.5, crumbs.slow); } });
        (this.mokaZones ||= []).push(z);
      });
      if (goose && s >= 3) for (let j = 0; j < goose.n; j++) this.after(p.pullTime + 0.25 + j * 0.55, () => {
        const h = this.fx().mallards({ from: P.pos.clone(), center: at, n: 1, area: 0.5, points: [at.clone()], onImpact: q => {
          this.fx().text('HONK!', _v.set(q.x, q.y + 1.4, q.z), { a: '#ffffff', b: '#ffb04a', size: 1.4 }); sfx('quack', { pitch: 0.6 }); G.engine.rig.shake(0.2);
          this.nova2(q.x, q.z, 1.8, e => this.mokaHit(e, { dmgPct: p.dmgPct * goose.pct / 100, knock: 0.6, from: q }));
        } });
        (this.mokaFx ||= []).push(h);
      });
    });
  },
  /** Spirit Retriever → Golden Retriever: bigger, tougher, harder-biting, golden (+ Good Girl!, Puppy Pal) */
  charged_spiritRetriever(R) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, gg = perkOf(R, 'goodGirl'), pal = perkOf(R, 'puppy');
    this.fromFrame(0.5, () => this.cast_spiritRetriever(R), ev => {
      if (ev !== 'summon') return;
      const r = this.retriever; if (!r) return;
      chargeFx(G).burst(r.pos, { r: 1.8, life: 0.45, color: C(R.charge.color), w: 0.14 });
      if (gg) { r.life = r.lifeMax; r.frenzyT = gg.t; G.vfx.emote(r, 'heart', 1.6); }
      if (pal && s >= 3) {
        const q = { ...p, life: Math.round(p.life * pal.k), dmgPct: p.dmgPct * pal.k, size: (p.size || 1) * 0.6 };
        if (this.retrieverPup?.alive) this.retrieverPup.refresh(q);
        else this.retrieverPup = new SpiritRetriever(G, this.ground(P.pos.clone().addScaledVector(this.forward(), 0.8).add(_v.set(0.8, 0, 0))), q);
      }
    });
  },
  /** Mallard Squadron → Great V: a bigger squadron over a wider area (+ Loop-de-Loop at Stage Ⅲ) */
  charged_mallards(R, aim) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, loop = perkOf(R, 'loop'), center = this.clampAim(aim, p.range), n = Math.min(12, p.count);
    this.fromFrame(0.5, () => this.cast_mallards(R, aim), ev => {
      if (ev !== 'cast') return;
      chargeFx(G).burst(center, { r: p.area, life: 0.6, color: C(R.charge.color), w: 0.08, a: 0.7 });
      if (loop && s >= 3) this.after(0.72 + n * 0.085 + 0.55, () => {
        const pts = this.foesNear(center.x, center.z, p.area).slice(0, n).map(e => this.ground(e.pos.clone()));
        sfx('mallard_wings', { pitch: 1.1 });
        const h = this.fx().mallards({ from: center.clone().add(_v.set(4, 0, 4)), center, n, area: p.area, points: pts, soft: true, onImpact: (q, i) => { sfx('water_splash', { pos: q, vol: 0.45, pitch: 1.3 }); if (i % 2 === 0) G.engine.rig.shake(0.12); this.nova2(q.x, q.z, p.impactRadius, e => this.mokaHit(e, { dmgPct: p.dmgPct * loop.pct / 100, from: q, knock: 0.5, stun: p.stun })); } });
        (this.mokaFx ||= []).push(h);
      });
    });
  },
};

/** Mix Moka's charged releases into SkillRunner.prototype (chargedSkills.js installs this). */
export function installChargedMoka(proto) { Object.assign(proto, M); }
