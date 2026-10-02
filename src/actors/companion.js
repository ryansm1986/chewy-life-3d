// Shadow the Boston terrier — follows Chewy, sniffs around, sits, barks, and fights in the Burrow.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildBoston, enableXray } from './charKit.js';
import { heroModelReady, buildHeroModel } from './heroModels.js';
import { Events } from '../core/events.js';
import { U } from '../gfx/materials.js';
import { rand, chance, TAU } from '../core/util.js';
import { navFor, PathFollow } from '../core/nav.js';

const _rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Vector3();
const FLAT = new Set(['flowerBed', 'bridge', 'fence']); // too low to hide a dog (or walk-on)
// follow slots relative to Chewy's facing: [back, side]. Behind-right first; the others when that one is hidden.
const SLOTS = [[1.1, 0.7], [1.1, -0.7], [0.2, 1.05], [0.2, -1.05], [-0.6, 1.0], [-0.6, -1.0]];

export class Companion extends Actor {
  constructor(world, G) {
    super(world, heroModelReady('shadow') ? buildHeroModel('shadow') : buildBoston(), { radius: 0.22, speed: 4.2, name: 'Shadow' }); // the baked Toybox Shadow when loaded
    this.G = G;
    enableXray(this.rig, '#9fc8ff', 0.55);
    this.state = 'follow'; this.stateT = 0;
    this.wanderTarget = null;
    this.idleT = 0;
    this.target = null; // combat target (set by combat AI)
    this.barkT = rand(6, 14);
    this.route = new PathFollow({ replan: 0.4, far: 1.2 }); this.losT = 0; this.routed = false; // detours round walls
    // staying in view: follow slot choice, idle visibility checks, one camera-side hop per idle stretch
    this.slotK = 0; this.slotT = 0; this.occT = 0; this.sidePicked = false;
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
    if (d > tgt.radius + 0.45) { this.follow(tgt.pos.x, tgt.pos.z, dt, 1.25, tgt.radius + 0.4); }
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
      // run to a spot beside/behind Chewy (the first follow slot the camera can actually see)
      if ((this.slotT -= dt) <= 0) { this.slotT = 0.35; this.pickSlot(p); }
      const [bk, sd] = SLOTS[this.slotK], fx = Math.sin(p.facing), fz = Math.cos(p.facing);
      const tx = p.pos.x - fx * bk + fz * sd, tz = p.pos.z - fz * bk - fx * sd;
      this.follow(tx, tz, dt, d > 5 ? 1.5 : 1.05, 0.3);
      this.idleT = 0; this.wanderTarget = null; this.sidePicked = false; this.anim.mood = 0.5;
      if (this.anim.action?.name === 'sit') this.anim.stop('sit');
    } else {
      this.idleT += dt;
      if (this.wanderTarget) {
        const w = this.wanderTarget; // (w.y: > 0 = hurry to get into view; also counts down as a give-up timer)
        if (this.follow(w.x, w.z, dt, w.y > 0 ? 0.85 : 0.5, 0.2) || (w.y -= dt) < -4) this.wanderTarget = null;
        if (this.anim.action?.name === 'sit') this.anim.stop('sit');
      } else if ((this.occT -= dt) <= 0 && this.idleT > 0.45 && this.G.mode === 'village') {
        // settling down: never stay tucked behind a bench / lamp / wall (or behind Chewy), and once per stop prefer
        // the camera side of Chewy so the pup is in the picture
        this.occT = 0.8;
        const far = !this.sidePicked && this.camSide(p, this.pos.x, this.pos.z) < -0.2;
        if (far || this.hiddenAt(this.pos.x, this.pos.z)) { const s = this.restSpot(p, false); if (s) this.wanderTarget = new THREE.Vector3(s.x, 1, s.z); }
        this.sidePicked = true;
      } else if (this.idleT > 2 && chance(dt * 0.25)) {
        // sniff around somewhere open and in view
        const s = this.restSpot(p, true); if (s) this.wanderTarget = new THREE.Vector3(s.x, 0, s.z);
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
  // moveTo that detours round walls when the straight line is blocked (line of sight re-checked 4x a second; a route is
  // only searched while it is blocked, at most every 0.4 s)
  follow(x, z, dt, mul, stop) {
    const nav = navFor(this.world);
    if (nav && (this.losT -= dt) <= 0) { this.losT = 0.25; this.routed = !nav.los(this.pos.x, this.pos.z, x, z); if (!this.routed) this.route.clear(); }
    if (!nav || !this.routed) return this.moveTo(x, z, dt, mul, stop);
    if (Math.hypot(x - this.pos.x, z - this.pos.z) < stop) return true;
    const w = this.route.steer(nav, this.pos.x, this.pos.z, x, z, dt);
    if (!w) return this.moveTo(x, z, dt, mul, stop); // no route (standing somewhere odd): plain walk
    if (w.last && !w.exact && Math.hypot(w.x - this.pos.x, w.z - this.pos.z) < 0.25) return true; // as close as he can get
    this.moveTo(w.x, w.z, dt, mul, 0.01);
    return false;
  }
  bark() { this.anim.play('bark', { force: false }); Events.emit('sfx', 'bark_small', { pos: this.pos }); }
  // ------------------------------------------------------------------ staying in view (village)
  // 1 = the spot is straight toward the camera from Chewy, -1 = right behind him
  camSide(p, x, z) {
    const cam = this.G.engine?.camera?.position; if (!cam) return 0;
    const cx = cam.x - p.pos.x, cz = cam.z - p.pos.z, cl = Math.hypot(cx, cz) || 1, dx = x - p.pos.x, dz = z - p.pos.z, dl = Math.hypot(dx, dz) || 1;
    return (cx * dx + cz * dz) / (cl * dl);
  }
  pickSlot(p) {
    if (this.G.mode !== 'village') { this.slotK = 0; return; }
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    const at = k => { const [bk, sd] = SLOTS[k]; return [p.pos.x - fx * bk + fz * sd, p.pos.z - fz * bk - fx * sd]; };
    const ok = k => { const [x, z] = at(k); return this.world.walkable?.(x, z) !== false && !this.world.collision?.solidAt(x, z, 0.3) && !this.hiddenAt(x, z); };
    if (ok(this.slotK)) return;
    for (let k = 0; k < SLOTS.length; k++) if (k !== this.slotK && ok(k)) { this.slotK = k; return; }
  }
  // an open, visible spot 1.2-1.7 m from Chewy, preferably a little to the side of the camera side; null if none
  restSpot(p, random) {
    const cands = [], base = rand(0, TAU);
    for (let i = 0; i < 14; i++) {
      const a = base + i / 14 * TAU, r = 1.2 + (i % 3) * 0.25, x = p.pos.x + Math.sin(a) * r, z = p.pos.z + Math.cos(a) * r;
      if (this.world.walkable?.(x, z) === false || this.world.collision?.solidAt(x, z, 0.4) || (this.G.mode === 'village' && this.G.sim?.buildingAt?.(x, z))) continue;
      const cs = this.camSide(p, x, z);
      const sc = cs - Math.abs(cs - 0.7) * 0.9 - Math.hypot(x - this.pos.x, z - this.pos.z) * 0.12 + (random ? rand(0, 1.2) : rand(0, 0.15));
      cands.push({ x, z, sc });
    }
    cands.sort((a, b) => b.sc - a.sc);
    for (let i = 0; i < cands.length && i < 8; i++) if (!this.hiddenAt(cands[i].x, cands[i].z)) return cands[i];
    return null;
  }
  // Would the camera see the pup at (x, z)? Casts the camera ray from his chest (and either side of it, and his head)
  // against nearby village buildings / props: footprint box first, the real meshes for small props. Chewy standing in
  // the way counts too. Village only (the Burrow has its own x-ray walls).
  hiddenAt(x, z) {
    const G = this.G, cam = G.engine?.camera, sim = G.sim;
    if (!cam || !sim || G.mode !== 'village') return false;
    const y = this.world.heightAt(x, z), p = G.player;
    const cx = cam.position.x - x, cz = cam.position.z - z, cl = Math.hypot(cx, cz) || 1, lx = -cz / cl * 0.17, lz = cx / cl * 0.17;
    for (const [ox, oz, h] of [[0, 0, 0.3], [lx, lz, 0.34], [-lx, -lz, 0.34], [0, 0, 0.58]]) {
      _o.set(x + ox, y + h, z + oz); _d.copy(cam.position).sub(_o);
      const L = _d.length(); _d.divideScalar(L);
      const tMax = Math.min(L - 0.3, Math.max(0, (6 - h) / Math.max(0.05, _d.y))); // nothing in the village is taller than ~6 m
      // Chewy in front of the pup
      if (p && p.visible !== false) {
        const px = p.pos.x - _o.x, pz = p.pos.z - _o.z, hl = Math.hypot(_d.x, _d.z) || 1e-3, t = (px * _d.x + pz * _d.z) / (hl * hl);
        if (t > 0 && t < tMax && Math.hypot(_o.x + _d.x * t - p.pos.x, _o.z + _d.z * t - p.pos.z) < 0.32 && _o.y + _d.y * t < p.pos.y + 1.15) return true;
      }
      if (this.rayBlocked(sim, tMax)) return true;
      // tucked right behind a solid thing (a trunk, a rock, a post): hidden in practice even if the ray squeaks past
      if (ox === 0 && h < 0.4) for (let t = 0.3; t <= 0.8; t += 0.25) if (this.world.collision?.solidAt(_o.x + _d.x * t, _o.z + _d.z * t, 0.05)) return true;
    }
    return false;
  }
  rayBlocked(sim, tMax) {
    _inv.set(1 / (_d.x || 1e-9), 1 / (_d.y || 1e-9), 1 / (_d.z || 1e-9));
    const reach = tMax * Math.hypot(_d.x, _d.z) + 3;
    for (const rec of sim.list) {
      const b = rec.data; if (FLAT.has(b.type) || !rec.group) continue;
      const B = rec._vbox || (rec._vbox = this.boxOf(sim, rec));
      if (Math.abs(B.cx - _o.x) > reach + B.r || Math.abs(B.cz - _o.z) > reach + B.r) continue;
      // slab test against the footprint box
      let t0 = 0.15, t1 = tMax;
      for (let k = 0; k < 3 && t0 <= t1; k++) {
        const o = k === 0 ? _o.x : k === 1 ? _o.y : _o.z, iv = k === 0 ? _inv.x : k === 1 ? _inv.y : _inv.z;
        const lo = k === 0 ? B.x0 : k === 1 ? B.y0 : B.z0, hi = k === 0 ? B.x1 : k === 1 ? B.y1 : B.z1;
        let a = (lo - o) * iv, c = (hi - o) * iv; if (a > c) { const s = a; a = c; c = s; }
        if (a > t0) t0 = a; if (c < t1) t1 = c;
      }
      if (t0 > t1) continue;
      if (!B.small) return true; // a house: its box is a fair stand-in
      _rc.set(_o, _d); _rc.near = 0.15; _rc.far = tMax;
      if (_rc.intersectObject(rec.group, true).length) return true;
    }
    return false;
  }
  boxOf(sim, rec) {
    const b = rec.data, [w, d] = sim.dims(b.type, b.rot, b.level), y0 = rec.group.position.y, hgt = rec.model?.height || 2;
    return { x0: b.x, x1: b.x + w, z0: b.z, z1: b.z + d, y0: y0 - 0.1, y1: y0 + hgt, cx: b.x + w / 2, cz: b.z + d / 2, r: Math.max(w, d) / 2, small: w * d <= 2 || hgt < 1.8 || b.type === 'park' };
  }
}
