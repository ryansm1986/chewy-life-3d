// Combat core: entity registry, damage routing (player <-> monsters), statuses, buffs, projectiles and ground zones.
import * as THREE from 'three';
import { rollHit, playerDamageTaken, rollBlock, ELEMENT_COLORS } from '../rpg/stats.js';
import { Events } from '../core/events.js';
import { rand, clamp, TAU } from '../core/util.js';
import { Projectile, projectileLooks } from './projectile.js';

const _v = new THREE.Vector3();
// damage-number weight: hits below this size (5% of a monster's life, 1.5% of a boss's much larger pool) float up
// smaller and fainter, so the big hits in a dense fight stand out (ui/fx.js Floats)
const minorHit = m => (m.lifeMax || 0) * (m.def?.boss ? 0.015 : 0.05);

export class Combat {
  constructor(G, world) {
    this.G = G; this.world = world;
    this.entities = new Set();
    this.projectiles = [];
    this.zones = [];
    this.buffs = {}; // player buffs: howl {t, dmg, move}, frenzy {stacks, t}, cursed {t, pct}
    this.shake = 0;
  }
  add(e) { this.entities.add(e); return e; }
  remove(e) { this.entities.delete(e); }
  clear() { for (const p of this.projectiles) p.dispose(); this.projectiles.length = 0; for (const z of this.zones) z.dispose?.(); this.zones.length = 0; this.entities.clear(); }
  *hostile(team) { for (const e of this.entities) if (e.alive && e.team !== team) yield e; }
  inRadius(x, z, r, team, fn) {
    for (const e of this.entities) {
      if (!e.alive || e.team === team) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < r + e.radius) fn(e, d);
    }
  }
  nearest(pos, team, maxR = 99, filter) {
    let best = null, bd = maxR;
    for (const e of this.entities) {
      if (!e.alive || e.team === team || (filter && !filter(e))) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) - e.radius;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // entities under the cursor (screen-space pick)
  pickAtScreen(mx, my, cam, maxPx = 46) {
    let best = null, bd = maxPx;
    for (const e of this.entities) {
      if (!e.alive || e.team !== 'enemy') continue;
      _v.copy(e.pos).setY(e.pos.y + (e.height || 0.6) * 0.5).project(cam);
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(sx - mx, sy - my) - (e.radius * 30);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  playerBonusPct() { let b = 0; if (this.buffs.howl?.t > 0) b += this.buffs.howl.dmg; return b; }
  // Player (or ally) hits a monster with a skill-scaled hit
  hitMonster(m, { dmgPct = 100, element = 'phys', knock = 0, stun = 0, from = null, noCrit = false, flat = 0, source = 'player', mult = 1, silent = false } = {}) {
    if (!m.alive) return 0;
    const G = this.G, D = G.derived;
    const r = rollHit({ derived: D, skillDmgPct: dmgPct, element, target: { def: m.stats.def, res: m.stats.res, level: m.stats.level }, bonusPct: this.playerBonusPct(), noCrit });
    let dmg = Math.max(1, Math.round((r.dmg + flat) * mult * (m.cursedMul || 1)));
    if (source === 'player') {
      if (r.heal > 0) G.actions.heal(r.heal);
      if (r.zoom > 0) G.actions.restoreZoom(r.zoom);
      // frenzy stacks on hit
      const fr = G.state.player.skills.frenzy;
      if (fr) { const p = G.skillParams?.('frenzy'); if (p) { const b = this.buffs.frenzy ||= { stacks: 0, t: 0 }; b.stacks = Math.min(p.maxStacks, b.stacks + 1); b.t = p.duration; b.per = p.perStack; } }
    }
    this.applyDamageToMonster(m, dmg, { element: r.element || element, crit: r.crit, knock, stun, from, silent });
    return dmg;
  }
  applyDamageToMonster(m, dmg, { element = 'phys', crit = false, knock = 0, stun = 0, from = null, silent = false } = {}) {
    const G = this.G;
    // per-monster damage filter (region monsters: Heike-gani's armoured front) — docs/REGIONS.md §3.4
    // (m.def?: pots and other breakables are hit through here too and have no def)
    if (m.def?.damageTaken) { dmg = m.def.damageTaken(m, dmg, { element, crit, from }); if (!(dmg > 0)) return; dmg = Math.max(1, Math.round(dmg)); }
    m.takeDamage(dmg, { element, crit, knock, stun, from });
    if (!silent) {
      G.ui?.float?.(m.pos.clone().setY(m.pos.y + (m.height || 1) + 0.2), crit ? `${dmg}!` : `${dmg}`, { kind: crit ? 'crit' : 'dmg', color: element !== 'phys' ? ELEMENT_COLORS[element] : undefined, ref: minorHit(m) });
      if (m.big) {
        // big bodies: burst on the side facing the attacker at chest height (not over the face), small flash, rate-limited
        const t = G.engine.time || 0;
        if (crit || t - (m._hitFxT || -9) > 0.09) {
          m._hitFxT = t;
          const src = from || G.player?.pos || m.pos;
          _v.set(src.x - m.pos.x, 0, src.z - m.pos.z); if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1); _v.normalize().multiplyScalar((m.bodyR || m.radius || 1) * 0.85);
          G.vfx.hit(new THREE.Vector3(m.pos.x + _v.x, m.pos.y + Math.min((m.height || 1) * 0.4, 1.1), m.pos.z + _v.z), { crit, element, soft: true });
        }
      } else {
        // rapid repeat hits on one foe (barrages, ricochets, ticks) get the soft burst, so the stacked flashes don't white it out
        const t = G.engine.time || 0, rapid = !crit && t - (m._hitFxT || -9) < 0.09; m._hitFxT = t;
        G.vfx.hit(m.pos.clone().setY(m.pos.y + (m.height || 1) * 0.5), { crit, element, soft: rapid });
      }
      Events.emit('sfx', crit ? 'hit_crit' : 'hit_flesh', { pos: m.pos });
      if (crit) { G.engine.rig.shake(0.35); G.engine.hitStop = Math.max(G.engine.hitStop, 0.05); }
      else G.engine.hitStop = Math.max(G.engine.hitStop, 0.018);
    }
    if (m.stats.onHit === 'zapBurst' && Math.random() < 0.6) this.zapBurst(m);
  }
  // Monster hits the player (rawDmg already rolled from monster dmg range)
  hitPlayer(raw, { element = 'phys', level = 1, from = null, knock = 0, onHit = null, src = null } = {}) {
    const G = this.G, p = G.player;
    if (!p || p.invuln || G.playerDead) return 0;
    if (rollBlock(G.derived)) { G.ui?.float?.(p.pos.clone().setY(p.pos.y + 1.4), 'Block!', { kind: 'status', color: '#9fd0ff' }); G.vfx.sparks(p.pos.clone().setY(1), { n: 6, color: '#bfe6ff' }); Events.emit('sfx', 'block'); return 0; }
    let dmg = playerDamageTaken(G.derived, raw, element, level);
    if (this.buffs.cursed?.t > 0) dmg *= 1 + this.buffs.cursed.pct / 100;
    // a charged Bone Storm's Bone Wall: a bone pops instead (docs/CHARGE.md)
    if (G.skills?.boneBlock?.()) { G.ui?.float?.(p.pos.clone().setY(p.pos.y + 1.4), 'Bonk!', { kind: 'status', color: '#fff0c8' }); return 0; }
    // Moka's Bubble Barrier soaks the hit first (mokaSpells.absorb → what gets through)
    if (G.skills?.bubbleShield) {
      dmg = G.skills.absorb(dmg);
      if (dmg < 0.5) { G.ui?.float?.(p.pos.clone().setY(p.pos.y + 1.4), 'Bloop!', { kind: 'status', color: '#9ff6ff' }); return 0; }
    }
    dmg = Math.max(1, Math.round(dmg));
    const r = G.actions.damage(dmg);
    p.anim.hit('#ff6a6a'); if (!p.anim.action || p.anim.action.name === 'hurt') p.anim.play('hurt');
    G.ui?.float?.(p.pos.clone().setY(p.pos.y + 1.4), `-${dmg}`, { kind: 'dmg', color: '#ff5a6a' });
    G.engine.post.hitAberration(0.8); G.engine.rig.shake(0.25);
    Events.emit('sfx', 'player_hurt');
    if (knock && from) { const d = p.pos.clone().sub(from).setY(0).normalize(); p.knock = d.multiplyScalar(knock * 3); }
    if (onHit === 'curse' && src?.stats?.curse) { this.buffs.cursed = { t: src.stats.curse.duration, pct: src.stats.curse.dmgTakenPct }; G.ui?.toast?.('Cursed! You take more damage.', { color: '#b88aff' }); }
    if (src?.stats?.lifeSteal) src.heal?.(dmg * src.stats.lifeSteal / 100);
    // thorns
    if (G.derived.thorns && src?.alive) this.applyDamageToMonster(src, Math.round(G.derived.thorns), { element: 'phys', silent: false });
    return r?.dead ? -1 : dmg;
  }
  hitAlly(a, raw, { element = 'phys', from = null } = {}) {
    if (!a.alive) return;
    const dmg = Math.max(1, Math.round(raw * (1 - (a.res?.[element] || 0) / 100)));
    a.takeDamage(dmg, { element, from });
    this.G.ui?.float?.(a.pos.clone().setY(a.pos.y + 0.9), `-${dmg}`, { kind: 'dmg', color: '#ffb0b0' });
  }
  zapBurst(m) {
    const n = m.stats.zapBurst?.count || 4;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      this.spawn({ team: 'enemy', kind: 'spark', pos: m.pos.clone().setY(0.6), dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), speed: 6, range: 5, radius: 0.25, dmg: m.stats.zapBurst?.dmg || [1, 5], element: 'zap', level: m.stats.level });
    }
  }
  spawn(opts) { const p = new Projectile(this, opts); this.projectiles.push(p); return p; }
  /** a fresh mesh of every projectile look (for the floor prewarm in game.js) */
  projectileLooks() { return projectileLooks(); }
  // ground zones: {pos, radius, t, life, tick, onTick(zone), team, visual}
  addZone(z) { z.t = 0; z.acc = 0; this.zones.push(z); return z; }
  update(dt) {
    const G = this.G;
    // statuses
    for (const e of this.entities) {
      if (!e.alive || !e.status) continue;
      const s = e.status;
      for (const k of ['stun', 'fear', 'freeze']) if (s[k] > 0) s[k] -= dt;
      if (s.slow?.t > 0) s.slow.t -= dt;
      if (s.burn?.t > 0) { s.burn.t -= dt; s.burn.acc = (s.burn.acc || 0) + dt; if (s.burn.acc > 0.5) { s.burn.acc = 0; this.applyDamageToMonster(e, Math.max(1, Math.round(s.burn.dps * 0.5)), { element: 'fire', silent: true }); G.vfx.fire(e.pos.clone().setY(e.pos.y + 0.5), 2); G.ui?.float?.(e.pos.clone().setY(e.pos.y + 1.2), `${Math.round(s.burn.dps * 0.5)}`, { kind: 'dmg', color: '#ff9a3c', ref: minorHit(e) }); } }
      if (s.poison?.t > 0) { s.poison.t -= dt; s.poison.acc = (s.poison.acc || 0) + dt; if (s.poison.acc > 0.5) { s.poison.acc = 0; this.applyDamageToMonster(e, Math.max(1, Math.round(s.poison.dps * 0.5)), { element: 'stink', silent: true }); G.vfx.stink(e.pos.clone().setY(e.pos.y + 0.4), 1); } }
    }
    // player buffs
    for (const k of Object.keys(this.buffs)) { const b = this.buffs[k]; if (b.t !== undefined) { b.t -= dt; if (b.t <= 0) { if (k === 'frenzy') b.stacks = 0; delete this.buffs[k]; } } }
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) { const p = this.projectiles[i]; if (!p.update(dt)) { p.dispose(); this.projectiles.splice(i, 1); } }
    // zones
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.t += dt; z.acc += dt;
      if (z.update) z.update(dt, z);
      if (z.tick && z.acc >= z.tick) { z.acc = 0; z.onTick?.(z); }
      if (z.t >= z.life) { z.dispose?.(); this.zones.splice(i, 1); }
    }
  }
  moveMul() { let m = 1; if (this.buffs.howl?.t > 0) m += this.buffs.howl.move / 100; if (this.buffs.frenzy?.stacks) m += (this.buffs.frenzy.stacks * (this.buffs.frenzy.per || 6)) / 100; return m; }
  atkMul() { let m = 1; if (this.buffs.frenzy?.stacks) m += (this.buffs.frenzy.stacks * (this.buffs.frenzy.per || 6)) / 100; return m; }
}
