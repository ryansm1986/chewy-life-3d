// Monster entity: stats (rpg/stats), model + animation, and a small state-machine AI with telegraphed attacks.
import * as THREE from 'three';
import { MONSTERS, buildMonster, MonsterAnim } from './monsters.js';
import { monsterStats, applyRandomMods, MONSTER_MODS } from '../rpg/stats.js';
import { Animator } from '../actors/animator.js';
import { contactShadow } from '../actors/charKit.js';
import { makeOutline } from '../gfx/materials.js';
import { Events } from '../core/events.js';
import { rand, randInt, clamp, TAU, dist, dampAngle, pick, chance } from '../core/util.js';

export const KIND_MAP = { mochi: 'mochi', dustbunny: 'dust', kinoko: 'kinoko', lantern: 'lantern', kasa: 'kasa', wisp: 'kitsune', oni: 'oni', tanuki: 'tanuki', mochiKing: 'mochi', kasaLord: 'kasa', oniChef: 'oni', nineTails: 'kitsune' };
const UNIQUE_A = ['Squishy', 'Grumpy', 'Sneaky', 'Wobbly', 'Fluffmaw', 'Bitter', 'Sticky', 'Gloomy', 'Crunchy', 'Soggy', 'Rascal', 'Snoot'];
const UNIQUE_B = ['the Sticky', 'Nibblebane', 'the Crumb-Snatcher', 'Toebiter', 'the Loud', 'Crumbclaw', 'the Sleepy', 'Sockthief', 'the Unpettable', 'Pillowhog', 'the Snack Bandit', 'Grumblepaw'];
const _p = new THREE.Vector3();

export class Monster {
  constructor(mode, id, { level = 1, rank = 'normal', variant = 0, x, z, leader = null, rng = Math.random } = {}) {
    const G = this.G = mode.G; this.mode = mode; this.world = mode.world; this.id = id;
    const def = this.def = MONSTERS[id];
    const v = def.variants?.[variant % (def.variants?.length || 1)] || {};
    const statRank = def.boss ? 'boss' : rank;
    this.stats = monsterStats(level, statRank, KIND_MAP[id]);
    if (v.element) this.stats.element = v.element;
    if (rank === 'champion' || rank === 'unique') applyRandomMods(this.stats, rng);
    this.rank = def.boss ? 'boss' : rank;
    this.team = 'enemy'; this.alive = true;
    this.lifeMax = this.stats.life; this.life = this.lifeMax;
    this.name = def.boss ? def.name : rank === 'unique' ? `${pick(UNIQUE_A)} ${pick(UNIQUE_B)}` : rank === 'champion' ? `Champion ${v.name || def.name}` : (v.name || def.name);
    const scale = (def.scale || 1) * (rank === 'champion' ? 1.15 : rank === 'unique' ? 1.3 : 1);
    this.scale = scale;
    this.model = buildMonster(id, variant);
    if (!this.model.rig) this.def = { ...def, scale }; else this.model.root.scale.setScalar(scale);
    this.anim = new MonsterAnim(this.model, { ...def, scale });
    this.kit = this.model.rig ? new Animator(this.model.rig) : null;
    if (this.model.rig) { this.model.rig.spec.scale = scale; }
    this.radius = def.radius * (scale / (def.scale || 1)) * (def.boss ? 1 : 1);
    if (def.boss) this.radius = def.radius;
    this.height = (this.model.rig ? 1.15 : 1.0) * scale;
    this.pos = new THREE.Vector3(x, 0, z);
    this.facing = rand(0, TAU);
    this.speed = def.speed * this.stats.speedMul;
    this.status = {};
    this.state = 'idle'; this.stateT = 0; this.cd = rand(0.6, 2.4); this.aggro = false;
    this.leader = leader; this.wander = null; this.knock = new THREE.Vector3();
    this.shadow = contactShadow(this.radius * 1.2);
    this.world.scene.add(this.model.root, this.shadow);
    // elite visuals
    if (rank === 'champion' || rank === 'unique' || def.boss) {
      const col = def.boss ? '#ff4a6a' : rank === 'unique' ? '#ffb030' : '#6aa8ff';
      if (this.model.outline) { this.model.outline.material = makeOutline(col, 0.02); }
      this.eliteColor = col;
    }
    this.summoned = 0;
    this.telegraph = null;
    this.sync();
  }
  get level() { return this.stats.level; }
  sync() {
    const r = this.model.root;
    r.position.set(this.pos.x, this.world.heightAt(this.pos.x, this.pos.z) + (this.kit ? (this.model.rig.offsetY || 0) : 0), this.pos.z);
    r.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.03, this.pos.z);
  }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  takeDamage(dmg, { element = 'phys', crit = false, knock = 0, stun = 0, from = null } = {}) {
    if (!this.alive) return;
    this.life -= dmg;
    this.anim.hit(crit ? '#ffe070' : '#ffffff');
    if (this.kit) this.kit.hit('#ffffff');
    if (!this.aggro) this.alert();
    const src = from || this.G.player.pos;
    if (knock > 0 && !this.def.boss) { const d = this.pos.clone().sub(src).setY(0); if (d.lengthSq() > 1e-4) this.knock.add(d.normalize().multiplyScalar(knock * 7 / Math.max(1, this.scale))); }
    if (stun > 0 && !this.def.boss) { this.status.stun = Math.max(this.status.stun || 0, stun); this.cancelAttack(); }
    // hit recovery: big hits stagger (not bosses)
    if (!this.def.boss && dmg > this.lifeMax * 0.18 && this.state === 'windup' && chance(0.6)) this.cancelAttack();
    if (this.life <= 0) this.die();
  }
  applyStatus(kind, dur, power = 0) {
    if (kind === 'burn') this.status.burn = { t: dur, dps: power };
    else if (kind === 'poison') this.status.poison = { t: dur, dps: power };
    else if (kind === 'slow' || kind === 'chill') this.status.slow = { t: dur, amt: power || 0.4 };
    else this.status[kind] = Math.max(this.status[kind] || 0, dur * (this.def.boss ? 0.35 : 1));
  }
  alert() {
    if (this.def.boss && !this.introDone) { this.introDone = true; this.mode.bossIntro?.(this); }
    this.aggro = true;
    if (this.state === 'idle') { this.G.vfx.emote(this, '!', 0.9); }
    for (const m of this.mode.monsters) if (m !== this && m.alive && !m.aggro && dist(m.pos.x, m.pos.z, this.pos.x, this.pos.z) < 7) { m.aggro = true; }
  }
  cancelAttack() { this.state = 'chase'; this.anim.wind = 0; this.anim.spin = 0; if (this.telegraph) { this.telegraph.t = 999; this.telegraph = null; } }
  die() {
    if (!this.alive) return;
    this.alive = false; this.life = 0;
    this.cancelAttack();
    const G = this.G;
    this.anim.deathT = 0;
    G.vfx.poof(this.pos.clone().setY(0.4 * this.scale), { color: this.def.boss ? '#ffe0f0' : '#fff4fa', size: 0.6 * this.scale, n: this.def.boss ? 40 : 14 });
    G.vfx.petals(this.pos.clone().setY(0.5), this.def.boss ? 40 : 6);
    Events.emit('sfx', 'monster_die', { pos: this.pos });
    if (this.stats.onDeath === 'fireNova') this.mode.fireNova(this);
    this.mode.onMonsterDeath(this);
    setTimeout(() => this.dispose(), 480);
  }
  dispose() {
    this.world.scene.remove(this.model.root, this.shadow);
    this.model.root.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); } });
    this.shadow.geometry?.dispose();
    this.disposed = true;
  }
  // ------------------------------------------------------------------ AI
  update(dt) {
    if (!this.alive) { this.anim.update(dt, false, 0); return; }
    this.separate(dt);
    const G = this.G, P = G.player, st = this.status;
    this.stateT += dt; this.cd -= dt * (this.stats.atkMul || 1) * (this.enraged ? 1.4 : 1);
    let moving = false;
    // knockback slide
    if (this.knock.lengthSq() > 0.001) {
      _p.copy(this.pos); this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.exp(-9 * dt));
      this.world.collision.resolve(this.pos, this.radius, _p);
    }
    const stunned = st.stun > 0 || st.freeze > 0;
    const target = this.pickTarget();
    const slowMul = (st.slow?.t > 0 ? 1 - st.slow.amt : 1) * (this.enraged ? 1.25 : 1);
    if (!stunned && target) {
      const tx = target.pos.x, tz = target.pos.z;
      const d = dist(tx, tz, this.pos.x, this.pos.z);
      if (!this.aggro && d < 9 && this.mode.los(this.pos, target.pos)) this.alert();
      if (st.fear > 0) { // run away
        const away = this.pos.clone().sub(target.pos).setY(0).normalize();
        this.move(away, dt, 1.1 * slowMul); moving = true;
      } else if (this.aggro) {
        const A = this.def.attack;
        if (this.state === 'windup' || this.state === 'attack') moving = this.runAttack(dt, target, d);
        else {
          const want = A.type === 'ranged' || A.type === 'barrage' ? A.range * 0.7 : A.range * 0.85;
          const inRange = d < (A.type === 'ranged' || A.type === 'barrage' ? A.range : A.range + target.radius);
          if (inRange && this.cd <= 0 && this.mode.los(this.pos, target.pos)) this.startAttack(target, d);
          else if (d > want || !this.mode.los(this.pos, target.pos)) { this.chase(target, dt, slowMul); moving = true; }
          else if ((A.type === 'ranged' || A.type === 'barrage') && d < A.range * 0.4) { this.move(this.pos.clone().sub(target.pos).setY(0).normalize(), dt, 0.7 * slowMul); moving = true; }
          else this.faceTo(tx, tz, dt);
          // teleporting elites
          if (this.stats.teleport && this.stateT > this.stats.teleport && d > 3) { this.blink(target); }
        }
        // boss phases: summon minions at 66% / 33%
        if (this.def.boss && this.def.summon) {
          const frac = this.life / this.lifeMax;
          if ((frac < 0.66 && this.summoned === 0) || (frac < 0.33 && this.summoned === 1)) { this.summoned++; this.mode.summonAround(this, this.def.summon, 3 + this.summoned); G.ui?.toast?.(`${this.name} ${this.summoned === 1 ? 'calls for backup!' : 'is getting really mad!'}`, { color: '#ff8a9a', icon: 'oni' }); G.vfx.emote(this, this.summoned === 1 ? '!' : 'anger', 1.6); G.engine.rig.shake(0.4); if (this.summoned === 2) this.enraged = true; }
        }
      } else if (!this.leader) { // idle wander
        if (!this.wander || this.stateT > 4) { this.wander = this.pos.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3))); this.stateT = 0; }
        if (dist(this.wander.x, this.wander.z, this.pos.x, this.pos.z) > 0.3 && this.stateT < 2.5) { this.move(this.wander.clone().sub(this.pos).setY(0).normalize(), dt, 0.35); moving = true; }
      } else if (this.leader.alive && dist(this.leader.pos.x, this.leader.pos.z, this.pos.x, this.pos.z) > 2.5) {
        this.move(this.leader.pos.clone().sub(this.pos).setY(0).normalize(), dt, 0.5); moving = true;
      }
    }
    // frost aura
    if (this.stats.aura && P && !G.playerDead) {
      const a = this.stats.aura;
      if (dist(P.pos.x, P.pos.z, this.pos.x, this.pos.z) < a.radius) { P.slowT = 0.3; P.slowAmt = a.slow; this.auraAcc = (this.auraAcc || 0) + dt; if (this.auraAcc > 1) { this.auraAcc = 0; this.mode.combat.hitPlayer(a.dps, { element: a.element, level: this.level, src: this }); } }
      if (Math.random() < dt * 8) G.vfx.spark.spawn({ x: this.pos.x + rand(-a.radius, a.radius) * 0.6, y: 0.3, z: this.pos.z + rand(-a.radius, a.radius) * 0.6, vy: 0.5, life: 0.8, size: 0.2, color: '#bfe8ff', alpha: 0.8, alpha1: 0 });
    }
    // elite shimmer
    if (this.eliteColor && Math.random() < dt * 6) G.vfx.spark.spawn({ x: this.pos.x + rand(-0.4, 0.4) * this.scale, y: rand(0.2, 1.1) * this.scale, z: this.pos.z + rand(-0.4, 0.4) * this.scale, vy: 0.6, life: 0.7, size: 0.22, color: this.eliteColor, alpha: 0.9, alpha1: 0 });
    this.anim.update(dt, moving, this.speed);
    if (this.kit) this.kit.update(dt, this.pos);
    this.sync();
  }
  // keep packs from merging into one blob: push apart using the visual radius, every frame
  separate(dt) {
    for (const m of this.mode.monsters) {
      if (m === this || !m.alive) continue;
      const dx = this.pos.x - m.pos.x, dz = this.pos.z - m.pos.z, d2 = dx * dx + dz * dz, mn = (this.radius + m.radius) * 1.15;
      if (d2 < mn * mn && d2 > 1e-6) { const d = Math.sqrt(d2), k = (mn - d) * Math.min(1, dt * 8) * 0.5; this.pos.x += dx / d * k; this.pos.z += dz / d * k; }
    }
  }
  pickTarget() {
    const G = this.G; let best = G.playerDead ? null : G.player, bd = best ? dist(best.pos.x, best.pos.z, this.pos.x, this.pos.z) : 1e9;
    for (const e of this.mode.combat.entities) {
      if (!e.alive || e.team !== 'ally' || e.untargetable) continue;
      const d = dist(e.pos.x, e.pos.z, this.pos.x, this.pos.z) - (e.taunt ? 6 : 0);
      if (d < bd - 1) { bd = d; best = e; }
    }
    return best;
  }
  faceTo(x, z, dt) { this.facing = dampAngle(this.facing, Math.atan2(x - this.pos.x, z - this.pos.z), 10, dt); }
  move(dir, dt, mul = 1) {
    _p.copy(this.pos);
    this.pos.x += dir.x * this.speed * mul * dt; this.pos.z += dir.z * this.speed * mul * dt;
    // separation
    for (const m of this.mode.monsters) {
      if (m === this || !m.alive) continue;
      const dx = this.pos.x - m.pos.x, dz = this.pos.z - m.pos.z, d = Math.hypot(dx, dz), mn = this.radius + m.radius;
      if (d < mn && d > 1e-4) { this.pos.x += dx / d * (mn - d) * 0.5; this.pos.z += dz / d * (mn - d) * 0.5; }
    }
    this.world.collision.resolve(this.pos, this.radius * 0.8, _p);
    this.facing = dampAngle(this.facing, Math.atan2(dir.x, dir.z), 10, dt);
  }
  chase(target, dt, mul) {
    let dir;
    if (this.mode.los(this.pos, target.pos)) dir = target.pos.clone().sub(this.pos).setY(0).normalize();
    else dir = this.mode.flowDir(this.pos) || target.pos.clone().sub(this.pos).setY(0).normalize();
    this.move(dir, dt, mul);
  }
  blink(target) {
    const a = rand(0, TAU); const x = target.pos.x + Math.cos(a) * 2.5, z = target.pos.z + Math.sin(a) * 2.5;
    if (!this.world.walkable(x, z)) return;
    this.G.vfx.poof(this.pos.clone().setY(0.4), { color: '#c9b8ff', n: 8 });
    this.pos.set(x, 0, z); this.stateT = 0;
    this.G.vfx.poof(this.pos.clone().setY(0.4), { color: '#c9b8ff', n: 8 });
    Events.emit('sfx', 'portal');
  }
  startAttack(target, d) {
    const A = this.def.attack;
    this.state = 'windup'; this.stateT = 0; this.atkTarget = target;
    this.atkPoint = target.pos.clone();
    this.anim.wind = 1;
    this.kit?.play(A.type === 'ranged' ? 'throw' : 'swing', { speed: 0.9 / A.windup * 0.4 });
    const vfx = this.G.vfx;
    if (A.type === 'aoe') this.telegraph = vfx.telegraph(this.pos, A.radius, A.windup, '#c8e070');
    else if (A.type === 'slam') { this.telegraph = vfx.telegraph(this.atkPoint, A.radius, A.windup, '#ff5a6a'); }
    else if (A.type === 'spin') this.telegraph = vfx.telegraph(this.pos, A.radius, A.windup, '#ff5a6a');
    else if (A.type === 'charge') { this.chargeDir = target.pos.clone().sub(this.pos).setY(0).normalize(); }
    if (this.def.boss) Events.emit('sfx', 'boss_roar');
  }
  runAttack(dt, target, d) {
    const A = this.def.attack, G = this.G, C = this.mode.combat;
    const roll = () => randInt(this.stats.dmg[0], this.stats.dmg[1]) + (this.stats.dmgFire ? randInt(...this.stats.dmgFire) : 0);
    if (this.state === 'windup') {
      if (A.type !== 'charge' && A.type !== 'slam') this.faceTo(target.pos.x, target.pos.z, dt);
      if (A.type === 'charge') this.facing = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      if (this.stateT < A.windup) return false;
      this.state = 'attack'; this.stateT = 0; this.anim.wind = 0; this.anim.lunge = 1;
      const el = this.stats.element;
      switch (A.type) {
        case 'melee': {
          const hitD = dist(target.pos.x, target.pos.z, this.pos.x, this.pos.z);
          G.vfx.slash(this.pos, this.facing, { color: '#ffd0d0', arc: 1.6, r: 1.0 * this.scale, life: 0.18 });
          Events.emit('sfx', A.heavy ? 'swing_heavy' : 'swing');
          if (hitD < A.range + (target.radius || 0.3) + 0.3) this.dealTo(target, roll(), el);
          break;
        }
        case 'ranged': case 'barrage': {
          const n = A.type === 'barrage' ? (this.enraged ? 9 : 6) : (this.stats.multishot || 1);
          const base = target.pos.clone().sub(this.pos).setY(0).normalize();
          const spread = A.type === 'barrage' ? 1.3 : 0.35;
          for (let i = 0; i < n; i++) {
            const a = n > 1 ? (i / (n - 1) - 0.5) * spread : 0;
            const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
            if (A.proj === 'firepot') {
              const to = target.pos.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2)));
              C.spawn({ team: 'enemy', kind: 'firepot', pos: this.pos.clone().setY(1.2 * this.scale), lob: { to, h: 3.5, time: 0.9 }, onEnd: (p) => this.mode.explodeAt(p.pos, 1.8, roll(), 'fire', this) });
              G.vfx.telegraph(to, 1.8, 0.9, '#ff7a3a');
            } else {
              C.spawn({ team: 'enemy', kind: A.proj, pos: this.pos.clone().setY(0.6 * this.scale + 0.2), dir, speed: A.speed, range: A.range * 1.4, radius: 0.3, homing: A.proj === 'foxfire' ? 1.2 : 0, onHit: (e) => this.dealTo(e, roll(), el) }).homeTarget = target;
            }
          }
          Events.emit('sfx', A.proj === 'acorn' ? 'throw' : A.proj === 'foxfire' ? 'ghost_wail' : 'fire_whoosh', { pos: this.pos });
          break;
        }
        case 'aoe': {
          this.mode.sporeCloud(this.pos, A.radius, roll(), this);
          break;
        }
        case 'slam': {
          this.mode.explodeAt(this.atkPoint, A.radius, Math.round(roll() * 1.4), el, this, true);
          G.engine.rig.shake(0.8);
          break;
        }
        case 'spin': this.anim.spin = 1; this.spinT = 1.8; break;
        case 'charge': this.chargeT = 0.45; Events.emit('sfx', 'dash'); break;
      }
      this.telegraph = null;
      return false;
    }
    // attack follow-through
    if (A.type === 'charge' && this.chargeT > 0) {
      this.chargeT -= dt;
      this.move(this.chargeDir, dt, (A.dash || 8) / this.speed);
      if (!this.chargeHit && dist(target.pos.x, target.pos.z, this.pos.x, this.pos.z) < this.radius + (target.radius || 0.3) + 0.2) { this.chargeHit = true; this.dealTo(target, roll(), this.stats.element, 1.5); }
      if (Math.random() < 0.5) G.vfx.dust(this.pos, { n: 1 });
      return true;
    }
    if (A.type === 'spin' && this.spinT > 0) {
      this.spinT -= dt;
      this.move(target.pos.clone().sub(this.pos).setY(0).normalize(), dt, 0.6);
      this.spinAcc = (this.spinAcc || 0) + dt;
      if (this.spinAcc > 0.3) { this.spinAcc = 0; G.vfx.slash(this.pos, this.facing + rand(0, TAU), { color: '#ffd0e0', arc: 3, r: A.radius * 0.8, life: 0.25 }); if (dist(target.pos.x, target.pos.z, this.pos.x, this.pos.z) < A.radius) this.dealTo(target, Math.round(roll() * 0.5), this.stats.element); }
      if (this.spinT <= 0) this.anim.spin = 0;
      return true;
    }
    if (this.stateT > 0.35) { this.state = 'chase'; this.chargeHit = false; this.cd = A.cd * rand(0.85, 1.2); }
    return false;
  }
  dealTo(target, raw, element, knockMul = 1) {
    const C = this.mode.combat;
    if (target === this.G.player) C.hitPlayer(raw, { element, level: this.level, from: this.pos, knock: (this.stats.knockback || 0.4) * knockMul, onHit: this.stats.onHit, src: this });
    else C.hitAlly(target, raw, { element, from: this.pos });
  }
}
