// Gamepad aiming (docs/CONTROLS.md §2): where the pad's attacks and skills go, and the soft lock.
//  - The aim direction: the right stick when it's pushed (it nudges or overrides), else the left stick (you attack where
//    you're walking, as on a console ARPG), else the hero's facing.
//  - Soft lock: the best foe in a cone round that direction (the combat grid's inRadius, combat/grid.js), sticky so it
//    doesn't flicker between two close foes; Settings › Controls › Aim assist scales the cone (0 = off). A small target
//    ring sits under the locked foe.
//  - The aim point (Actions.padAim): the locked foe, else a point along the aim direction (the right stick's tilt sets
//    how far: 2.5–9 m; with no stick, 6 m). Skills, charges, channels and Poe's throws and blinks all read it
//    (game.js feeds it; combat/charge.js cursorGround and mokaSpells read Actions.padAim between feeds).
//  - Interactables: the nearest one in front gets the A prompt (pickInteract).
// One per game (G.padAim); game.js calls update(dt) from handleInput while the pad is the active device.
import * as THREE from 'three';
import { Actions } from '../core/actions.js';
import { Events } from '../core/events.js';

const RANGE = 11, CONE = 0.62, CONE_FULL = 0.24, STICKY = 1.45; // m; cone half-angles (rad) at full assist, and with the right stick at full tilt
const _d = new THREE.Vector3(), _v = new THREE.Vector3();

export class PadAim {
  constructor(G) {
    this.G = G;
    this.dir = new THREE.Vector3(0, 0, 1); this.point = new THREE.Vector3();
    this.lock = null; this.stick = false; this.t = 0; this.pulse = 0;
    this.ring = null; this.ringWorld = null;
    // rumble (Settings › Controls › Rumble; Actions.rumble only pulses the active pad): light ticks on hits, a bump when
    // the hero is hurt, a pulse per charge stage and a bigger one on a charged release
    let tickT = 0;
    Events.on('sfx', n => {
      if (n === 'player_hurt') Actions.rumble(0.35, 0.55, 110);
      else if (n === 'player_die') Actions.rumble(0.7, 0.8, 380);
      else if ((n === 'hit_flesh' || n === 'hit_crit') && performance.now() > tickT) { tickT = performance.now() + 110; Actions.rumble(n === 'hit_crit' ? 0.12 : 0, n === 'hit_crit' ? 0.32 : 0.16, n === 'hit_crit' ? 60 : 35); }
    });
    Events.on('charge:stage', () => Actions.rumble(0.04, 0.24, 50));
    Events.on('charge:release', p => { if (p?.ok && p.stage > 0) Actions.rumble(0.16 + 0.14 * p.stage, 0.3 + 0.15 * p.stage, 80 + 30 * p.stage); });
  }
  get strength() { const s = this.G.ui?.settings?.aimAssist; return s == null ? 0.7 : Math.max(0, Math.min(1, s)); }
  /** per frame while the pad plays (game.js handleInput): direction, lock, aim point, ring */
  update(dt) {
    const G = this.G, P = G.player; if (!P) return;
    this.t += dt;
    const { f, r } = G.engine.rig.groundAxes();
    const rs = Actions.aim(), ls = Actions.move();
    if (rs.mag > 0) { this.dir.set(0, 0, 0).addScaledVector(r, rs.x).addScaledVector(f, rs.y).normalize(); this.stick = true; }
    else if (ls.mag > 0 && !(P.aimLock && G.skills?.charge?.charging)) { this.dir.set(0, 0, 0).addScaledVector(r, ls.x).addScaledVector(f, ls.y).normalize(); this.stick = false; } // (while charging the hero faces the aim: the left stick only walks)
    else if (!this.lock) { this.dir.set(Math.sin(P.facing), 0, Math.cos(P.facing)); this.stick = false; }
    const prev = this.lock;
    this.lock = G.mode === 'interior' ? null : this.pick(rs.mag);
    if (this.lock && this.lock !== prev) { this.pulse = 1; }
    this.pulse = Math.max(0, this.pulse - dt * 4);
    if (this.lock) this.point.copy(this.lock.pos);
    else {
      const dist = rs.mag > 0 ? 2.5 + 6.5 * rs.mag : 6;
      this.point.copy(P.pos).addScaledVector(this.dir, dist);
      this.point.y = G.world?.heightAt ? G.world.heightAt(this.point.x, this.point.z) : P.pos.y;
    }
    Actions.padAim = this.point;
    this.drawRing(dt);
  }
  /** the best foe in the cone (sticky: the current lock is kept while it stays roughly in the cone and range) */
  pick(stickMag) {
    const G = this.G, P = G.player, C = G.combat, k = this.strength;
    if (!C?.inRadius || k <= 0) return null;
    const cone = (stickMag > 0 ? CONE + (CONE_FULL - CONE) * stickMag : CONE) * (0.35 + 0.65 * k), cosC = Math.cos(cone);
    const cur = this.lock;
    if (cur && this.ok(cur)) {
      _d.set(cur.pos.x - P.pos.x, 0, cur.pos.z - P.pos.z); const d = _d.length();
      if (d < RANGE * 1.15 + (cur.radius || 0) && (d < 1.2 || _d.dot(this.dir) / d > Math.cos(Math.min(1.4, cone * STICKY)))) return cur;
    }
    let best = null, bs = 1e9, pot = null, ps = 1e9;
    C.inRadius(P.pos.x, P.pos.z, RANGE, 'ally', (e, d) => {
      if (e.team !== 'enemy' || !this.ok(e)) return;
      _d.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z);
      const c = d < 0.9 ? 1 : _d.dot(this.dir) / Math.max(1e-4, _d.length());
      if (c < cosC) return;
      const s = d * (1 + 2.6 * (1 - c)) * (e.warded ? 3 : 1);
      if (e.breakable) { if (s < ps) { ps = s; pot = e; } } else if (s < bs) { bs = s; best = e; }
    });
    return best || (pot && ps < 5 ? pot : null); // (a pot only when no monster is in the cone, and close)
  }
  ok(e) { return e.alive && !e.untargetable && e.life > 0 && e.pos && Number.isFinite(e.pos.x); }
  /** any foe (not a pot) within r: A attacks instead of interacting (CONTROLS §2) */
  foeNear(r = 5) {
    const G = this.G, P = G.player, C = G.combat; if (!C?.inRadius || G.mode !== 'dungeon') return false;
    let near = false;
    C.inRadius(P.pos.x, P.pos.z, r, 'ally', e => { if (!near && e.team === 'enemy' && !e.breakable && this.ok(e)) near = true; });
    return near;
  }
  /** the interactable the A / D-pad prompt is on: the nearest within reach, those in front preferred */
  pickInteract(list) {
    const P = this.G.player; let best = null, bs = 1e9;
    const fx = Math.sin(P.facing), fz = Math.cos(P.facing);
    for (const it of list) {
      const dx = it.pos.x - P.pos.x, dz = it.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d >= (it.radius || 1.4) + 0.4) continue;
      const c = d < 0.3 ? 1 : (dx * fx + dz * fz) / d, s = d * (1 + 0.8 * (1 - c));
      if (s < bs) { bs = s; best = it; }
    }
    return best;
  }
  // ---------------------------------------------------------------- the target ring
  drawRing(dt) {
    const G = this.G, L = this.lock, W = G.world;
    if (!L || Actions.device !== 'pad') { this.hideRing(); return; }
    const ring = this.ring ||= makeRing();
    if (this.ringWorld !== W || ring.parent !== W.scene) { ring.removeFromParent(); W.scene.add(ring); this.ringWorld = W; }
    ring.visible = true;
    const s = Math.max(1.7, (L.radius || 0.4) * 3 + 1) * (1 + 0.22 * this.pulse) * (1 + 0.04 * Math.sin(this.t * 6)); // (wider than the foe: its body hides the inside)
    ring.position.set(L.pos.x, (L.pos.y || 0) + 0.06, L.pos.z);
    ring.scale.set(s, s, s);
    ring.rotation.z += dt * 0.9;
    ring.material.opacity = 0.9 - 0.25 * this.pulse;
  }
  hideRing() { if (this.ring?.parent) this.ring.removeFromParent(); this.ringWorld = null; }
  /** the mouse took over, a mode change, a hero switch: nothing locked, nothing drawn */
  clear() { this.lock = null; this.hideRing(); if (Actions.device !== 'pad') Actions.padAim = null; }
}

// the ring: chunky cream band with an ink edge and four gold chevrons pointing in, drawn once on a canvas (one draw call;
// normal blending so it never washes the screen out)
function makeRing() {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), c = N / 2, INK = '#4a2c2a';
  g.lineCap = 'round'; g.lineJoin = 'round';
  // a broken ring: four arcs between the chevrons
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2 + 0.32, a1 = (i + 1) * Math.PI / 2 - 0.32;
    for (const [w, col] of [[20, INK], [11, '#fff6e8'], [4, '#ffcf4a']]) { g.beginPath(); g.arc(c, c, 100, a0, a1); g.lineWidth = w; g.strokeStyle = col; g.stroke(); }
  }
  for (let i = 0; i < 4; i++) { // chevrons pointing at the foe
    g.save(); g.translate(c, c); g.rotate(i * Math.PI / 2 + Math.PI / 4);
    g.beginPath(); g.moveTo(-14, -122); g.lineTo(0, -104); g.lineTo(14, -122);
    g.lineWidth = 17; g.strokeStyle = INK; g.stroke(); g.lineWidth = 8; g.strokeStyle = '#ff8fb0'; g.stroke();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 8; m.frustumCulled = false; m.name = 'padAimRing';
  // (the ring lies flat: its own z spin turns it on the ground)
  m.rotation.order = 'XYZ';
  return m;
}
