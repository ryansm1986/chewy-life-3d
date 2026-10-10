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
//  - Touch (CT-5) aims the same way: its drag-to-aim is the right stick (Actions.aim), its stick the left one, and a tap
//    on a foe locks it on purpose (target(): kept while it lives and stays within reach, whatever the cone).
//  - Targeting (CT-8, docs/CONTROLS.md §13: Settings › Controls › Targeting, per device): Off (the pad: no lock; touch:
//    Drag, the drag's cone only), Assist (the cone soft lock above) or Auto: the best foe ALL ROUND the hero
//    (combat/autoTarget.js AutoAim.pickLock: distance, sticky, threat, elite, sight), re-picked 10× a second. In Auto a
//    held right stick (or a touch drag) aims by hand in the cone and its foe becomes the manual pick when it lets go;
//    R3 cycles to the next foe; a touch flick of the stick picks the foe that way; a manual pick holds MANUAL_HOLD s
//    (each cast at it keeps it MANUAL_CAST s more), or until it dies or is left behind.
// One per game (G.padAim); game.js calls update(dt) from handleInput while the pad or touch is the active device, and
// with the mouse in Auto (the ring then shows for the mouse too).
import * as THREE from 'three';
import { Actions } from '../core/actions.js';
import { Events } from '../core/events.js';
import { TARGETING, targetingOf, LOCK_RANGE, MANUAL_HOLD, MANUAL_CAST, REPICK, AIM } from './autoTarget.js';

const RANGE = 11, CONE = 0.62, CONE_FULL = 0.24, STICKY = 1.45; // m; cone half-angles (rad) at full assist, and with the right stick at full tilt
const _d = new THREE.Vector3(), _v = new THREE.Vector3();

export class PadAim {
  constructor(G) {
    this.G = G;
    this.dir = new THREE.Vector3(0, 0, 1); this.point = new THREE.Vector3();
    this.lock = null; this.stick = false; this.t = 0; this.pulse = 0;
    this.ring = null; this.ringWorld = null;
    this.mode = TARGETING.AUTO; this.manual = null; this.manualUntil = 0; this.handAim = false; this.autoT = 0; this.r3 = null; this.flick = null; // (CT-8)
    Events.on('touch:flick', f => { this.flick = f; }); // (a quick flick of the touch stick: ui/touch.js; read in pickAuto)
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
  /** Settings › Controls › Targeting for the device playing now (0 Off · 1 Assist · 2 Auto) */
  targeting() { return targetingOf(this.G.ui?.settings, Actions.device); }
  /** per frame while the pad plays (game.js handleInput): direction, lock, aim point, ring */
  update(dt) {
    const G = this.G, P = G.player; if (!P) return;
    this.t += dt;
    const mode = this.mode = this.targeting();
    const { f, r } = G.engine.rig.groundAxes();
    const rs = Actions.aim(), ls = Actions.move();
    if (rs.mag > 0) { this.dir.set(0, 0, 0).addScaledVector(r, rs.x).addScaledVector(f, rs.y).normalize(); this.stick = true; }
    else if (ls.mag > 0 && !(P.aimLock && G.skills?.charge?.charging)) { this.dir.set(0, 0, 0).addScaledVector(r, ls.x).addScaledVector(f, ls.y).normalize(); this.stick = false; } // (while charging the hero faces the aim: the left stick only walks)
    else if (!this.lock) { this.dir.set(Math.sin(P.facing), 0, Math.cos(P.facing)); this.stick = false; }
    const prev = this.lock;
    this.lock = G.mode === 'interior' ? null : mode === TARGETING.AUTO ? this.pickAuto(rs) : mode === TARGETING.OFF ? this.pickOff(rs) : this.pick(rs.mag);
    this.flick = null; // (a touch flick only picks in Auto, and only the frame it lands)
    if (this.lock && this.lock !== prev) { this.pulse = 1; if (mode === TARGETING.AUTO) this.tip(); }
    this.pulse = Math.max(0, this.pulse - dt * 4);
    const ch = G.skills?.channel, chAim = mode === TARGETING.AUTO && ch && AIM[ch.id]?.kind === 'ground' && G.autoAim; // (Moonbeam follows the best cluster)
    if (chAim) this.point.copy(G.autoAim.aimFor(ch.id)[0]);
    else if (this.lock) this.point.copy(this.lock.pos);
    else {
      const dist = rs.mag > 0 ? 2.5 + 6.5 * rs.mag : 6;
      this.point.copy(P.pos).addScaledVector(this.dir, dist);
      this.point.y = G.world?.heightAt ? G.world.heightAt(this.point.x, this.point.z) : P.pos.y;
    }
    Actions.padAim = this.point;
    this.drawRing(dt);
  }
  // ---------------------------------------------------------------- Auto (CT-8, docs/CONTROLS.md §13)
  /** the Auto lock: a manual pick while it holds; the right stick (or a touch drag) aiming by hand; else the best foe all
   *  round (re-picked every REPICK s, the current one checked every frame) */
  pickAuto(rs) {
    const G = this.G, P = G.player, AA = G.autoAim; if (!AA) return this.pick(rs.mag);
    const fresh = e => e && this.ok(e) && e.team === 'enemy';
    // R3 (nextTarget): the next foe in score order; its press only counts when it wasn't the L3 + R3 swap chord
    if (Actions.pressed('nextTarget')) this.r3 = { t: this.t, chord: Actions.padDown('L3') };
    if (this.r3) {
      if (Actions.padDown('L3')) this.r3.chord = true;
      if (!Actions.held('nextTarget')) { const r = this.r3; this.r3 = null; if (!r.chord && this.t - r.t < 0.6) { const n = AA.nextAfter(fresh(this.lock) ? this.lock : null); if (n) { this.setManual(n); return n; } } }
    }
    // a flick of the touch stick: the best foe within 45° of it, all round
    const fl = this.flick; this.flick = null;
    if (fl) {
      const { f, r } = G.engine.rig.groundAxes(), d = new THREE.Vector3().addScaledVector(r, fl.x).addScaledVector(f, fl.y).setY(0);
      if (d.lengthSq() > 1e-6) { const e = AA.pickLock(null, { range: LOCK_RANGE * 1.3, dir: d.normalize(), cone: Math.cos(Math.PI / 4) }); if (e) { this.setManual(e); return e; } }
    }
    if (rs.mag > 0) { this.handAim = true; this.manual = null; return this.pick(rs.mag); } // (aiming by hand: the cone round the stick, over any pick)
    if (this.handAim) { this.handAim = false; if (fresh(this.lock)) { this.setManual(this.lock, true); return this.lock; } } // (let go on a foe: that's the pick)
    const M = this.manual;
    if (M) { if (fresh(M) && this.t < this.manualUntil && Math.hypot(M.pos.x - P.pos.x, M.pos.z - P.pos.z) < LOCK_RANGE * 1.6 + (M.radius || 0)) return M; this.manual = null; }
    const L = fresh(this.lock) ? this.lock : null;
    if (L && this.t < this.autoT && Math.hypot(L.pos.x - P.pos.x, L.pos.z - P.pos.z) < LOCK_RANGE + 2 + (L.radius || 0)) return L;
    this.autoT = this.t + REPICK;
    return AA.pickLock(L);
  }
  /** Off: no lock on the pad; touch's Drag snaps in its drag's cone (as CT-5); a foe tapped on purpose still locks */
  pickOff(rs) {
    const M = this.manual, P = this.G.player;
    if (M) { if (this.ok(M) && Math.hypot(M.pos.x - P.pos.x, M.pos.z - P.pos.z) < RANGE * 1.6 + (M.radius || 0)) return M; this.manual = null; }
    return Actions.device === 'touch' && rs.mag > 0 ? this.pick(rs.mag) : null;
  }
  /** a manual pick (a tap, a flick, R3, the right stick let go, the mouse's foe): held MANUAL_HOLD s in Auto */
  setManual(e, quiet = false) {
    if (!e || !this.ok(e)) return false;
    if (this.manual !== e) this.manualUntil = this.t + MANUAL_HOLD; else this.manualUntil = Math.max(this.manualUntil, this.t + MANUAL_HOLD * (quiet ? 0.5 : 1));
    this.manual = e;
    if (this.lock !== e) { this.lock = e; this.pulse = quiet ? 0.5 : 1; }
    return true;
  }
  /** a cast went at the manual pick: it stays picked a while longer */
  extendManual() { if (this.manual) this.manualUntil = Math.max(this.manualUntil, this.t + MANUAL_CAST); }
  /** Shadow's one-time tip at the first auto lock in a fight (QA sessions with every tip seen skip it) */
  tip() {
    const G = this.G, H = G.state?.flags?.hints;
    if (G.mode !== 'dungeon' || !G.hint || H?.all || H?.autoLock || this.lock?.breakable) return;
    const dev = Actions.device;
    G.hint('autoLock', dev === 'touch' ? "*Yip!* See the ring? That's your target: skills go at it by themselves. Tap a monster or flick the stick to pick another." : dev === 'pad' ? "*Yip!* See the ring? That's your target: skills go at it by themselves. Flick the right stick or click R3 to pick another." : '*Yip!* See the ring? Skills go at it by themselves. Point at a monster to pick it instead.');
  }
  /** the best foe in the cone (sticky: the current lock is kept while it stays roughly in the cone and range) */
  pick(stickMag) {
    const G = this.G, P = G.player, C = G.combat, k = this.strength;
    const M = this.manual; // (a foe tapped on: kept while it lives and stays within 1.6× the range, whatever the cone)
    if (M) { if (this.ok(M) && Math.hypot(M.pos.x - P.pos.x, M.pos.z - P.pos.z) < RANGE * 1.6 + (M.radius || 0)) return M; this.manual = null; }
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
  /** lock a foe on purpose (a touch tap on it): the ring pulses and the lock holds until it dies or is left behind */
  target(e) { if (!e || !this.ok(e)) return false; this.manual = e; this.manualUntil = this.t + MANUAL_HOLD; if (this.lock !== e) { this.lock = e; this.pulse = 1; } return true; }
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
    if (!L || (Actions.device === 'kbm' && this.mode !== TARGETING.AUTO)) { this.hideRing(); return; } // (the mouse sees it in Auto only)
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
  clear() { this.lock = null; this.manual = null; this.handAim = false; this.r3 = null; this.flick = null; this.hideRing(); if (Actions.device === 'kbm') Actions.padAim = null; }
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
