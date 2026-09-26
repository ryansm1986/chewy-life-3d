// Villagers: wander around their anchor, greet Chewy, go home at night, talk.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildHumanoid } from './charKit.js';
import { rand, chance, dist } from '../core/util.js';
import { Events } from '../core/events.js';

export class Villager extends Actor {
  constructor(world, G, spec, { id, anchor, home = null, wander = 5, role = 'villager' } = {}) {
    super(world, buildHumanoid(spec), { radius: 0.28, speed: 1.6, name: spec.name });
    this.G = G; this.id = id || spec.name.toLowerCase(); this.spec = spec;
    this.anchor = new THREE.Vector3(anchor.x, 0, anchor.z);
    this.home = home; this.wanderR = wander; this.role = role;
    this.state = 'idle'; this.t = rand(0, 3); this.target = null;
    this.talking = false; this.greeted = 0;
    this.setPos(anchor.x + rand(-1, 1), anchor.z + rand(-1, 1));
    this.faceTarget = rand(0, Math.PI * 2);
    this.interact = { pos: this.pos, radius: 1.3, label: `Talk to ${spec.name}`, onInteract: () => this.G.talkTo?.(this), actor: this };
  }
  update(dt) {
    const G = this.G, p = G.player;
    const night = G.day?.isNight?.() && this.home;
    const pd = p ? dist(p.pos.x, p.pos.z, this.pos.x, this.pos.z) : 99;
    if (this.talking) {
      if (p) this.faceTo(p.pos.x, p.pos.z);
    } else if (night) {
      // walk home then hide inside
      if (this.visible) {
        if (this.moveTo(this.home.x, this.home.z, dt, 1.2, 0.35)) this.visible = false;
      }
    } else {
      if (!this.visible) { this.visible = true; if (this.home) this.setPos(this.home.x, this.home.z); }
      this.t -= dt;
      if (pd < 3.2 && this.greeted <= 0 && p.anim.speed > 0.2) {
        this.greeted = 25; this.state = 'idle'; this.t = 2.2; this.target = null;
        this.faceTo(p.pos.x, p.pos.z);
        this.anim.play(chance(0.5) ? 'wave' : 'happy');
        Events.emit('emote', { actor: this, kind: chance(0.5) ? 'heart' : 'note' });
        Events.emit('sfx', 'villager_greet', { pos: this.pos, pitch: this.spec.voice || 1 });
      }
      this.greeted -= dt;
      if (this.state === 'idle') {
        if (pd < 2.2) this.faceTo(p.pos.x, p.pos.z);
        if (this.t <= 0) {
          const a = rand(0, Math.PI * 2), r = rand(1, this.wanderR);
          const x = this.anchor.x + Math.cos(a) * r, z = this.anchor.z + Math.sin(a) * r;
          if (this.world.walkable?.(x, z) !== false) { this.target = new THREE.Vector3(x, 0, z); this.state = 'walk'; this.t = 8; }
          else this.t = 0.5;
        }
      } else if (this.state === 'walk') {
        const arrived = this.moveTo(this.target.x, this.target.z, dt, 1, 0.2);
        if (arrived || this.t <= 0) { this.state = 'idle'; this.t = rand(2, 6); }
      }
    }
    this.interact.pos = this.pos;
    this.anim.talk = this.talking ? 0.8 : 0;
    super.update(dt);
  }
}
