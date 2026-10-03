// The player's homestead tools (docs/HOMESTEAD.md §5): a prop in rig.parts.handR (the hoe, the watering can, the
// seed pouch; the rod joins in phase 2) and a short posed action. While a tool is out the sword stays sheathed
// (player.toolOut, see Player.carrySword) and the ball / Moka's staff hide. Moving, rolling or any other action
// cancels it; the effect lands at `at` seconds (cancelled before that, nothing happens).
import * as THREE from 'three';
import { Input } from '../core/input.js';
import { propGeo, CAN_SPOUT } from '../actors/villageLife.js';
import { hoeGeo, seedBagGeo } from './gardenModels.js';
import { rodGeo } from './fishModels.js';
import { ladleGeo } from './kitchenModels.js';
import { clamp } from '../core/util.js';

const GEO = { hoe: () => hoeGeo(), can: () => propGeo('can'), bag: () => seedBagGeo(), rod1: () => rodGeo(1), rod2: () => rodGeo(2), ladle: () => ladleGeo() };
const _w = new THREE.Vector3();
const MOVE_KEYS = ['w', 'a', 's', 'd', 'up', 'down', 'left', 'right', 'space'];

export class Tools {
  constructor(G) { this.G = G; this.cur = null; this.meshes = new WeakMap(); }
  get busy() { return !!this.cur; }
  get P() { return this.G.player; }
  mesh(kind) {
    const rig = this.P.rig;
    let m = this.meshes.get(rig); if (!m) this.meshes.set(rig, m = {});
    if (!m[kind]) { m[kind] = new THREE.Mesh(GEO[kind](), rig.propMat || rig.mat); m[kind].castShadow = true; }
    return m[kind];
  }
  /** Start a tool action. o: { prop: 'hoe'|'can'|'bag'|null, pose, dur, at, face: {x,z}, onAct(), onEvent(name), onEnd(done) } */
  run(o) {
    const P = this.P; if (!P || this.cur) return false;
    P.moveTarget = null; P.interactTarget = null; P.route?.clear?.();
    if (o.face) { P.faceTo(o.face.x, o.face.z); P.facing = P.faceTarget; }
    const c = this.cur = { ...o, t: 0, acted: false, pose: o.pose };
    if (o.prop) this.show(o.prop);
    P.toolOut = o.prop || 'hands';
    P.anim.play(o.pose, { onEvent: ev => c.onEvent?.(ev) });
    return true;
  }
  show(kind) {
    const P = this.P, m = this.mesh(kind), h = P.rig.parts.handR;
    m.position.set(0, -0.02, 0.02); m.rotation.set(0, 0, 0);
    if (m.parent !== h) h.add(m);
    this.prop = m; this.propKind = kind;
    if (P.ball) P.ball.visible = false;
    if (P.staff) P.staff.visible = false;
  }
  hide() {
    const P = this.P;
    if (this.prop) this.prop.parent?.remove(this.prop);
    this.prop = null; this.propKind = null;
    if (P.ball) P.ball.visible = true;
    if (P.staff) P.staff.visible = true;
  }
  cancel() { if (this.cur) this.end(false); }
  /** A long-held tool (the fishing rod): out until release(); its owner poses it (life/fishing.js). */
  hold(kind) { if (this.cur) this.end(false); this.show(kind); this.P.toolOut = kind; return this.prop; }
  release() { if (this.cur) return; this.hide(); if (this.P) this.P.toolOut = null; }
  end(done) {
    const c = this.cur; if (!c) return;
    this.cur = null;
    const P = this.P;
    if (P.anim.action?.name === c.pose) P.anim.stop(c.pose);
    this.hide();
    P.toolOut = null;
    c.onEnd?.(done);
  }
  update(dt) {
    const c = this.cur; if (!c) return;
    const P = this.P, G = this.G;
    // anything else the player does cancels the chore
    const moved = MOVE_KEYS.some(k => Input.down(k)) || P.moveTarget || P.rollT > 0 || G.mode !== 'village' || G.playerDead;
    const other = P.anim.action && P.anim.action.name !== c.pose;
    if (moved || other) { this.end(false); return; }
    c.t += dt;
    if (!c.acted && c.t >= c.at) { c.acted = true; try { c.onAct?.(); } catch (e) { console.error('[life] tool action failed', e); } }
    this.poseProp(dt, c);
    if (c.t >= c.dur) this.end(true);
  }
  // keep the prop at a designed world pitch whatever the arm does (as villagers' props do, npc.js poseProp)
  poseProp(dt, c) {
    const m = this.prop; if (!m) return;
    const P = this.P, parts = P.rig.parts, pitch = parts.body.rotation.x + parts.armR.rotation.x;
    if (this.propKind === 'can') {
      const k = clamp(c.t / c.dur), pour = Math.sin(clamp((k - 0.1) / 0.8) * Math.PI);
      m.rotation.x = 0.15 + 0.75 * pour - pitch;
      c.fx = (c.fx || 0) - dt;
      if (pour > 0.45 && c.fx <= 0 && this.G.vfx?.dot) {
        c.fx = 0.035; m.updateWorldMatrix(true, false); _w.copy(CAN_SPOUT).applyMatrix4(m.matrixWorld);
        const f = P.facing;
        this.G.vfx.dot.spawn({ x: _w.x + (Math.random() - 0.5) * 0.04, y: _w.y, z: _w.z + (Math.random() - 0.5) * 0.04, vx: Math.sin(f) * 0.6, vz: Math.cos(f) * 0.6, vy: -0.3, grav: 8, life: 0.42, size: 0.075, color: '#9fdcff', alpha: 0.95, alpha1: 0.3 });
      }
    } else if (this.propKind === 'hoe') {
      m.rotation.x = 1.35; // blade down: raised high it points at the sky, on the strike it bites the soil
    } else if (this.propKind === 'bag') {
      m.rotation.x = -pitch * 0.5;
    }
  }
}
