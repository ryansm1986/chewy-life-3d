// Shadow the Boston terrier — follows Chewy, sniffs around, sits, barks, and fights in the Burrow.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildBoston, enableXray } from './charKit.js';
import { Events } from '../core/events.js';
import { U } from '../gfx/materials.js';
import { rand, chance } from '../core/util.js';

export class Companion extends Actor {
  constructor(world, G) {
    super(world, buildBoston(), { radius: 0.22, speed: 4.2, name: 'Shadow' });
    this.G = G;
    enableXray(this.rig, '#9fc8ff', 0.55);
    this.state = 'follow'; this.stateT = 0;
    this.wanderTarget = null;
    this.idleT = 0;
    this.target = null; // combat target (set by combat AI)
    this.barkT = rand(6, 14);
    // combat entity fields (registered with Combat while in the Burrow)
    this.team = 'ally'; this.height = 0.6; this.res = {}; this.status = {};
    this.lifeMax = 80; this.life = 80; this.fainted = 0; this.biteCd = 0;
  }
  recalc() {
    const G = this.G, lvl = G.state?.player?.lvl || 1;
    const pw = G.combat?.buffs?.shadowPower;
    const mult = 1 + ((G.derived?.shadowLife || 0) + (pw?.life || 0)) / 100;
    const frac = this.life / this.lifeMax;
    this.lifeMax = Math.round((70 + lvl * 16) * mult); this.life = Math.max(1, Math.round(this.lifeMax * frac));
  }
  empower(p) { this.recalc(); this.G.vfx.pillar(this.pos, { color: '#8ab8ff', life: 1, r: 0.5, h: 3 }); this.anim.play('happy'); }
  heal(n) { if (this.fainted > 0) return; this.life = Math.min(this.lifeMax, this.life + n); }
  takeDamage(dmg) {
    if (this.fainted > 0) return;
    this.life -= dmg; this.anim.hit('#ff8a8a');
    if (this.life <= 0) {
      this.life = 0; this.fainted = 10; this.untargetable = true; this.anim.play('die');
      this.G.ui?.toast?.('Shadow fainted! He will be back in a moment.', { color: '#9fd0ff' });
      Events.emit('sfx', 'whine');
    }
  }
  combatUpdate(dt) {
    const G = this.G;
    if (G.mode !== 'dungeon' || !G.combat) return false;
    if (this.fainted > 0) {
      this.fainted -= dt;
      if (this.fainted <= 0) { this.untargetable = false; this.life = Math.round(this.lifeMax * 0.5); this.anim.stop('die'); this.anim.play('happy'); G.vfx.heal(this.pos); }
      return true;
    }
    this.life = Math.min(this.lifeMax, this.life + this.lifeMax * 0.01 * dt);
    this.biteCd -= dt;
    const p = G.player;
    const tgt = G.combat.nearest(p.pos, 'ally', 7.5, e => !e.breakable);
    if (!tgt) return false;
    const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
    if (d > tgt.radius + 0.45) { this.moveTo(tgt.pos.x, tgt.pos.z, dt, 1.25, tgt.radius + 0.4); }
    else {
      this.faceTo(tgt.pos.x, tgt.pos.z);
      if (this.biteCd <= 0) {
        this.biteCd = 0.9;
        this.anim.play('bark', { force: true });
        const pw = G.combat.buffs.shadowPower;
        G.combat.hitMonster(tgt, { dmgPct: 55 * (1 + ((G.derived?.shadowDmg || 0) + (pw?.dmg || 0)) / 100), source: 'shadow', from: this.pos, knock: 0.2 });
        Events.emit('sfx', 'bark_small', { pos: this.pos });
      }
    }
    this.anim.mood = 1;
    return true;
  }
  update(dt) {
    const p = this.G.player;
    if (!p) return super.update(dt);
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    this.stateT += dt;
    if (d > 18) { // teleport-catch-up if lost
      const back = new THREE.Vector3(-Math.sin(p.facing), 0, -Math.cos(p.facing));
      this.setPos(p.pos.x + back.x * 1.2, p.pos.z + back.z * 1.2);
    }
    if (this.hold) { // scripted staging (intro): stay on the mark, face the given way, sit once there
      if (this.moveTo(this.hold.x, this.hold.z, dt, 0.8, 0.15)) { this.faceTarget = this.hold.face; if (!this.anim.action) this.anim.play('sit'); }
      super.update(dt); return;
    }
    if (this.combatUpdate?.(dt)) { super.update(dt); return; }
    if (d > 2.6) {
      // run to a spot beside/behind Chewy
      const side = new THREE.Vector3(Math.cos(p.facing), 0, -Math.sin(p.facing));
      const tx = p.pos.x - Math.sin(p.facing) * 1.1 + side.x * 0.7, tz = p.pos.z - Math.cos(p.facing) * 1.1 + side.z * 0.7;
      this.moveTo(tx, tz, dt, d > 5 ? 1.5 : 1.05, 0.3);
      this.idleT = 0; this.wanderTarget = null; this.anim.mood = 0.5;
      if (this.anim.action?.name === 'sit') this.anim.stop('sit');
    } else {
      this.idleT += dt;
      if (this.wanderTarget) {
        if (this.moveTo(this.wanderTarget.x, this.wanderTarget.z, dt, 0.5, 0.2)) this.wanderTarget = null;
      } else if (this.idleT > 2 && chance(dt * 0.25)) {
        const a = rand(0, Math.PI * 2);
        this.wanderTarget = new THREE.Vector3(p.pos.x + Math.cos(a) * 1.8, 0, p.pos.z + Math.sin(a) * 1.8);
      } else {
        this.faceTo(p.pos.x, p.pos.z);
        if (this.idleT > 5 && !this.anim.action) this.anim.play('sit');
      }
      this.anim.mood = p.anim.speed > 0.5 ? 0.6 : 0.2;
    }
    this.barkT -= dt;
    if (this.barkT < 0) { this.barkT = rand(10, 25); this.bark(); }
    U.uBenders.value[1].set(this.pos.x, this.pos.y, this.pos.z, 0.4);
    super.update(dt);
  }
  bark() { this.anim.play('bark', { force: false }); Events.emit('sfx', 'bark_small', { pos: this.pos }); }
}
