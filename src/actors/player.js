// The player's body: whichever hero is being played (Chewy, Moka — see heroes.js; setHero swaps rig and weapons).
// WASD / click-to-move (routed round walls, buildings, trees and water by core/nav.js), dodge roll, interaction,
// weapon visuals and grass bending.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildHumanoid, CAST, katanaGeo, katanaMaterial, KATANA, tennisBall, enableXray } from './charKit.js';
import { buildHeroModel, heroModelReady } from './heroModels.js';
import { makeStaff, attachStaff, tickStaff, disposeStaff, STAFF_GRIP } from './heroGear.js';
import { Animator } from './animator.js';
import { SAMURAI_ROOTED } from './samuraiPoses.js';
import { POE_ROOTED } from './poePoses.js';
import { installPoeGear, dressPoe } from './poeGear.js';
import { reach } from './armIK.js';
import { Sprint } from './sprint.js';
import { Input } from '../core/input.js';
import { navFor, PathFollow } from '../core/nav.js';
import { Events } from '../core/events.js';
import { U } from '../gfx/materials.js';
import { clamp } from '../core/util.js';
import { CLASSES } from '../rpg/classes.js';

const STAFF_UP = STAFF_GRIP.rotation[0];
const STAFF_CASTS = new Set(['staffBolt', 'staffCast', 'skyCast', 'wetShake', 'summon', 'yank', 'puddleHop', 'surf', 'beam', 'duckCall', 'cast', 'swing', 'swing2', 'throw']);
// actions that root the player (WASD won't walk out of them); Moka's staff casts included (animator.js ACTIONS)
const BUSY = new Set(['swing', 'swing2', 'throw', 'cast', 'bark', 'slam', 'pickup', 'drink', 'staffBolt', 'staffCast', 'skyCast', 'wetShake', 'summon', 'yank', 'puddleHop', 'surf', 'beam', 'duckCall', ...SAMURAI_ROOTED, ...POE_ROOTED]);
// the Bone Katana's geometry per item tint (charKit.js katanaGeo): shared by every rig the player ever gets
const KATANAS = new Map();
const katanaFor = (colors, hilt = false) => { const k = `${(colors || []).join(',')}|${hilt ? 'h' : 'b'}`; let g = KATANAS.get(k); if (!g) KATANAS.set(k, g = katanaGeo({ colors, hilt })); return g; };
const _grip = new THREE.Vector3(), _bd = new THREE.Vector3(), _be = new THREE.Vector3(), _bx = new THREE.Vector3(), _bz = new THREE.Vector3();
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bp = new THREE.Quaternion();
const _np = new THREE.Vector3(), _nq = new THREE.Quaternion(), _ns = new THREE.Vector3(), _cp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3();
const _nm = new THREE.Matrix4(), _ni = new THREE.Matrix4();
const smooth01 = x => { x = clamp(x); return x * x * (3 - 2 * x); };

export class Player extends Actor {
  constructor(world, G, hero = 'chewy') {
    const rig = Player.buildRig(undefined, hero);
    super(world, rig, { radius: 0.3, speed: 4.4, name: CLASSES[hero]?.name || 'Chewy' });
    this.G = G; this.hero = hero;
    enableXray(rig, '#ffc890', 0.6);
    this.moveTarget = null; this.interactTarget = null;
    // click-to-move route toward moveTarget (the melee assist and loot pickup steer through moveTarget too)
    this.route = new PathFollow({ replan: 0.12, far: 0.6 });
    this.navDir = new THREE.Vector3(); this.navOn = false;
    this.rollT = 0; this.rollDir = new THREE.Vector3(); this.rollCd = 0;
    this.stepAcc = 0;
    this.inputDir = new THREE.Vector3();
    this.controlLocked = false;
    // weapons
    this.ball = tennisBall(0.1);
    this.makeSwords(rig);
    this.weaponType = 'sword';
    this.setWeapon('sword');
    this.speedMul = 1;
    this.sprint = new Sprint(this); // hold Shift: +40% (sprint.js, docs/ZONES.md §9)
  }
  /** the speed the hero walks at right now (m/s, every multiplier in, the sprint included) */
  get moveSpeed() { return this.speed * this.speedMul; }
  /** A hero's rig: the baked film model (heroModels.js: public/rigs/<hero>_disney.*) when loaded, else the kit spec. */
  static buildRig(style, hero = 'chewy') {
    const baked = (style ?? (heroModelReady(hero) ? 'disney' : 'classic')) === 'disney' && heroModelReady(hero);
    const rig = baked ? buildHeroModel(hero) : buildHumanoid(CAST[hero] || CAST.chewy);
    if (hero === 'poe') dressPoe(rig); // (her fūma rides on her back: poeGear.js — the villager Poe too)
    return rig;
  }
  /** Become another hero (heroes.js): new rig, animator, weapons, name — same position, facing and nav state. */
  setHero(id) {
    if (!CLASSES[id] || id === this.hero) return false;
    this.hero = id; this.name = CLASSES[id].name;
    this.replaceRig(Player.buildRig(undefined, id));
    return true;
  }
  replaceRig(rig) {
    const old = this.rig;
    this.dropStaff(); this.dropFuma();
    this.world.scene.remove(old.root); old.dispose?.();
    this.rig = rig; this.anim = new Animator(rig);
    enableXray(rig, '#ffc890', 0.6);
    this.world.scene.add(rig.root);
    this.makeSwords(rig); this.setWeapon(this.weaponType);
    this.rollT = 0; this.invuln = !!this.G?.heroSwitching; // (a hero hand-off swaps the rig mid-switch: stay invulnerable through it)
    this.sprint?.reset();
    this.sync();
  }
  // The Bone Katana (charKit.js katanaGeo), tinted like the equipped sword item: one in the paw, and the sheathed one —
  // its hilt in the saya mouth at the left hip on a model with a scabbard (HERO_MODELS sayaMount → rig.parts.saya),
  // else the whole katana riding on his back as before
  makeSwords(rig) {
    const mat = katanaMaterial(); // (its own toon: the bone stays bone-white under the warm grade; charKit.js)
    const cols = this.swordColors();
    this.saya = !!rig.parts.saya;
    this.sword = new THREE.Mesh(katanaFor(cols), mat); this.sword.castShadow = true;
    this.swordBack = new THREE.Mesh(katanaFor(cols, this.saya), mat); this.swordBack.castShadow = true;
    if (this.saya) { this.swordBack.position.set(0, -(0.064 + (rig.parts.saya.userData.out ?? 0.012)), 0); rig.parts.saya.add(this.swordBack); } // (the tsuba's blade face at the mouth: the hilt stands out of it)
    else { this.swordBack.scale.setScalar(0.8); this.swordBack.position.set(0.02, 0.06, -0.02); this.swordBack.rotation.set(0.1, 0, 2.5); rig.parts.back.add(this.swordBack); }
    this.swordKey = cols.join(',');
    this._noto = false;
  }
  /** the equipped sword item's [blade, wrap, accent] (its icon colours: items.js), whichever hand it's in */
  swordColors() {
    const E = this.G?.state?.equipment, it = E?.weapon?.wtype === 'sword' ? E.weapon : E?.weaponAlt?.wtype === 'sword' ? E.weaponAlt : null;
    return it?.icon?.colors?.length ? it.icon.colors : ['#f4e8cf', '#c23b3b', '#f2e4c6'];
  }
  tintSword() {
    const cols = this.swordColors(), key = cols.join(',');
    if (key === this.swordKey) return;
    this.swordKey = key; this.sword.geometry = katanaFor(cols); this.swordBack.geometry = katanaFor(cols, this.saya);
  }
  /** the katana goes into the saya (the end of a sheathing flourish; only a model with a scabbard) / comes out */
  sheathe() { if (this.saya) { this._noto = true; this._sheathed = undefined; } }
  draw() { if (this._noto) { this._noto = false; this._sheathed = undefined; } }
  get sheathedNow() { return !!this._sheathed; }
  // Settings > Disney Chewy: rebuild the model in place (same position, facing, weapon)
  swapModel(style) {
    const old = this.rig, rig = Player.buildRig(style, this.hero);
    if (rig.disney === !!old.disney) { rig.dispose?.(); return; }
    this.replaceRig(rig);
  }
  /** The staff for the equipped staff item's look (variant + colours from its icon). */
  equippedLook() {
    const st = this.G.state, it = st?.equipment?.[st.player?.activeWeapon === 1 ? 'weaponAlt' : 'weapon'];
    return it?.icon || {};
  }
  dropStaff() {
    const s = this.staff; if (!s) return;
    s.parent?.remove(s); disposeStaff(s);
    this.staff = null; this.staffKey = null;
  }
  // the staff for the equipped item (heroGear.js: six designs by icon variant, tinted by its colours), upright at her side
  showStaff(look) {
    const key = `${look.variant || ''}|${(look.colors || []).join(',')}`;
    if (this.staff && this.staffKey === key && this.staff.parent === this.rig.parts.handR) return;
    this.dropStaff();
    const s = this.staff = makeStaff(look); this.staffKey = key;
    attachStaff(s, this.rig.parts.handR);
  }
  setWeapon(type, look = {}) {
    this.weaponType = type;
    if (type === 'fuma') { this.holdFuma(look.colors ? look : this.equippedLook()); return; } // Poe: her fūma on her back / in her paw (poeGear.js)
    this.dropFuma();
    if (type === 'staff') { // Moka: the staff in hand; the (Chewy-only) sword and ball stay parked and hidden
      this.showStaff(look.colors ? look : this.equippedLook());
      this.sword.scale.setScalar(0.0001); this.sword.castShadow = false;
      this.ball.scale.setScalar(0.0001); this.ball.castShadow = false;
      this.swordBack.visible = false;
      return;
    }
    this.dropStaff();
    this.tintSword();
    const h = this.rig.parts.handR;
    // both stay attached (the idle one shrunk to nothing) so each shader is compiled up front — no hitch on the first swap
    if (this.sword.parent !== h) h.add(this.sword);
    if (this.ball.parent !== h) h.add(this.ball);
    this.sword.rotation.set(Math.PI * 0.78, 0, -0.25); this.sword.position.set(0, -0.02, 0.02);
    this.ball.position.set(0, -0.06, 0.03);
    const sword = type === 'sword';
    this.sword.scale.setScalar(sword ? 1 : 0.0001); this.sword.castShadow = sword;
    this.ball.scale.setScalar(sword ? 0.0001 : 1); this.ball.castShadow = !sword;
    this.swordBack.visible = !sword;
    this._sheathed = undefined; // re-evaluated by carrySword next frame
  }

  // camera-relative WASD
  readMoveInput() {
    const d = this.inputDir.set(0, 0, 0);
    if (this.controlLocked || this.G.ui?.anyModal?.()) return d;
    const { f, r } = this.G.engine.rig.groundAxes();
    if (Input.down('w') || Input.down('up')) d.add(f);
    if (Input.down('s') || Input.down('down')) d.sub(f);
    if (Input.down('d') || Input.down('right')) d.add(r);
    if (Input.down('a') || Input.down('left')) d.sub(r);
    if (d.lengthSq() > 0) d.normalize();
    return d;
  }
  roll(dir) {
    if (this.rollCd > 0 || this.rollT > 0) return false;
    this.rollDir.copy(dir.lengthSq() > 0 ? dir : new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing))).normalize();
    this.rollT = 0.42; this.rollCd = 0.75;
    this.anim.play('roll');
    this.faceTarget = Math.atan2(this.rollDir.x, this.rollDir.z);
    Events.emit('sfx', 'dash');
    Events.emit('player:roll');
    return true;
  }
  update(dt) {
    this.rollCd = Math.max(0, this.rollCd - dt);
    const G = this.G;
    let moved = 0;
    // external speed modifiers (buffs, chill auras)
    this.slowT = Math.max(0, (this.slowT || 0) - dt);
    this.speedMul = (G.combat?.moveMul?.() || 1) * (G.derived?.moveMul || 1) * (this.slowT > 0 ? 1 - (this.slowAmt || 0.3) : 1) * (G.combat?.buffs?.shrineZoom ? 1.35 : 1) * (this.chargeSlow || 1) * (this.poeSpeed || 1); // (chargeSlow: winding up a charged skill, docs/CHARGE.md; poeSpeed: Poe's Vanish)
    if (this.navWorld !== this.world) { this.navWorld = this.world; const nav = navFor(this.world); if (nav && !nav.built) nav.build(); } // ~5-8 ms, once per world (behind the load / iris)
    if (G.playerDead) { this.sprint.reset(false); this.anim.sprint = 0; super.update(dt); return; }
    if (this.knock && this.knock.lengthSq() > 0.01) { const b = this.pos.clone(); this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.exp(-10 * dt)); this.world.collision?.resolve(this.pos, this.radius, b); }
    if (this.leap || this.dash) { this.sprint.update(dt, false); this.anim.sprint = this.sprint.k; this.pos.y = this.world.heightAt(this.pos.x, this.pos.z); super.update(dt); return; }
    if (this.rollT > 0) {
      this.rollT -= dt;
      this.sprint.update(dt, true); // (a roll drops the sprint: it picks up again after, Shift still held)
      moved = this.step(this.rollDir, dt, 2.1);
      this.invuln = true;
    } else {
      this.invuln = !!G.heroSwitching; // (nothing lands during a hero hand-off)
      const dir = this.readMoveInput();
      if (dir.lengthSq() > 0) { this.moveTarget = null; this.interactTarget = null; }
      this.speedMul *= this.sprint.update(dt, dir.lengthSq() > 0 || !!this.moveTarget); // Shift: the sprint (sprint.js)
      if (Input.hit('space') && !this.controlLocked && !G.ui?.anyModal?.()) {
        if (this.roll(dir.lengthSq() ? dir : new THREE.Vector3())) Input.consume('space');
      }
      const navWas = this.navOn; this.navOn = false;
      if (dir.lengthSq() > 0 && !this.busyAction()) moved = this.step(dir, dt, this.speedMul * (this.canMoveWhileActing ? 0.75 : 1));
      else if (this.moveTarget && !this.busyAction()) {
        const it = this.interactTarget, mt = this.moveTarget;
        if (it?.pos) { mt.x = it.pos.x; mt.z = it.pos.z; } // a villager walks on while Chewy heads over
        const stop = it ? (it.radius || 1.2) : 0.12;
        const r = this.walkTo(mt.x, mt.z, dt, stop, navWas);
        moved = 1;
        if (r) {
          this.moveTarget = null; this.interactTarget = null; this.route.clear();
          // interact on arrival (or from the closest spot the map allows, if that's still near enough)
          if (it && (r === 1 || Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) < stop + 0.8)) { this.faceTo(it.pos.x, it.pos.z); it.onInteract?.(); }
        }
      }
      if (!this.moveTarget && this.route.pts) this.route.clear();
    }
    // winding up a charge: face the cursor while walking (combat/charge.js points aimLock at its aim)
    if (this.aimLock && !(this.rollT > 0)) this.faceTarget = Math.atan2(this.aimLock.x - this.pos.x, this.aimLock.z - this.pos.z);
    // footsteps (a sprint's longer stride lands them a little further apart: animator.js poseBiped)
    this.stepAcc += this.anim.speed * dt;
    if (this.stepAcc > 0.62 * (1 + 0.3 * this.sprint.k)) { this.stepAcc = 0; Events.emit('footstep', this.pos); this.sprint.step(); }
    this.anim.sprint = this.sprint.k; // the sprint run pose: lean, stride, arm pump
    // grass bending around Chewy
    U.uBenders.value[0].set(this.pos.x, this.pos.y, this.pos.z, 0.55);
    super.update(dt);
    this.carrySword(dt);
    this.carryStaff(dt);
    this.carryFuma(dt);
    if (this.staff) tickStaff(this.staff, dt);
  }
  /** the right forearm's bend off its rest (the sprint pumps the elbows: animator.js), for the carry angles below */
  elbowBend() { const f = this.rig.parts.foreR, r = f && this.anim.rest.get(f); return r ? f.rotation.x - r.r.x : 0; }
  // Moka's staff stays upright while she walks (the arm swing would wave it like a baton); casts pose it freely
  carryStaff(dt) {
    const s = this.staff; if (!s || this.weaponType !== 'staff') return;
    const arm = this.rig.parts.armR, body = this.rig.parts.body, R = this.anim.rest;
    const ra = R.get(arm), rb = R.get(body); if (!ra || !rb) return;
    const a = this.anim.action, want = a && STAFF_CASTS.has(a.name) ? 0 : 1; // casts aim the staff themselves (mokaSpells); waves, cheers, rolls keep it upright
    this._scarry = (this._scarry ?? 1) + (want - (this._scarry ?? 1)) * Math.min(1, dt * 14);
    const tilt = (arm.rotation.x - ra.r.x) + (body.rotation.x - rb.r.x) + this.elbowBend();
    s.rotation.x = STAFF_UP - tilt * this._scarry;
  }
  // Keep the bone sword at its relaxed carry angle while walking: the walk cycle's arm swing and forward lean used to
  // tip it level like a lance. Attacks and skills (any animator action) pose it freely.
  carrySword(dt) {
    if (this.weaponType !== 'sword' || this.hero !== 'chewy') return;
    // In the village the sword rides on his back (he was leaning on it like a cane); it comes out for any attack or
    // skill and goes back a few seconds later. In the Burrow it stays in hand.
    // (a model with a saya also sheathes at the end of a combo, samuraiPoses.js 'noto', until the next draw)
    if (this.anim.action && !this.toolOut) this._drawnT = 3;
    this._drawnT = Math.max(0, (this._drawnT || 0) - dt);
    const sheathed = ((this.G.mode === 'village' || this.G.mode === 'interior') && this._drawnT <= 0) || !!this.toolOut || (this.saya && this._noto); // (a homestead tool is in the paw: life/tools.js; indoors it stays on his back)
    if (sheathed !== this._sheathed) {
      this._sheathed = sheathed;
      this.sword.scale.setScalar(sheathed ? 0.0001 : 1); this.sword.castShadow = !sheathed;
      this.swordBack.visible = sheathed;
    }
    if (sheathed) return;
    const arm = this.rig.parts.armR, body = this.rig.parts.body, R = this.anim.rest;
    const ra = R.get(arm), rb = R.get(body); if (!ra || !rb) return;
    const want = this.anim.action ? 0 : 1;
    this._carry = (this._carry ?? 1) + (want - (this._carry ?? 1)) * Math.min(1, dt * 14);
    const tilt = (arm.rotation.x - ra.r.x) + (body.rotation.x - rb.r.x) + this.elbowBend(), b = this.anim.A?.blade;
    // the cut poses turn the blade in the paw (A.blade) on top of the carry angle
    this.sword.rotation.set(Math.PI * 0.78 - tilt * this._carry + (b?.x || 0), b?.y || 0, -0.25 + (b?.z || 0));
    const A = this.anim.A, bw = A?.bladeW || 0, w = this.anim.twoHand || 0;
    if (bw > 0.01 || w > 0.01) this.rig.root.updateMatrixWorld(true);
    if (bw > 0.01) this.aimSword(A, Math.min(1, bw));
    // the noto into a saya: his paw can't reach his left hip, so over the flourish's last stretch the katana slides out of
    // it into the saya (blended from the paw to where the sheathed hilt sits) and the paw follows as far as it reaches;
    // at the click (samuraiPoses.js noto) the sheathed hilt takes over exactly there
    const act = this.anim.action, ns = this.saya && act?.name === 'noto' ? smooth01((act.t / act.dur - 0.4) / 0.3) : 0;
    this.sword.position.set(0, -0.02, 0.02);
    if (ns > 0) {
      const P = this.rig.parts;
      this.rig.root.updateMatrixWorld(true);
      this.swordBack.matrixWorld.decompose(_np, _nq, _ns); this.sword.matrixWorld.decompose(_cp, _cq, _cs);
      _cp.lerp(_np, ns); _cq.slerp(_nq, ns);
      reach(P.armR, P.foreR, P.handR, _grip.copy(_cp), ns * 0.8);
      this.sword.parent.updateWorldMatrix(true, false);
      _nm.compose(_cp, _cq, _cs).premultiply(_ni.copy(this.sword.parent.matrixWorld).invert());
      _nm.decompose(this.sword.position, this.sword.quaternion, _ns);
      this.sword.updateMatrixWorld(true);
    }
    // two-handed: the free paw takes the hilt below the sword paw (armIK.js)
    if (w > 0.01) { const P = this.rig.parts; reach(P.armL, P.foreL, P.handL, this.sword.localToWorld(_grip.set(0, KATANA.leftGrip, 0)), Math.min(1, w)); }
  }
  /** samurai poses point the katana in the hero's frame (A.bladeDir: x forward, y up, z his left), its edge toward
   *  A.bladeEdge (default: down and ahead), blended over the carry by w */
  aimSword(A, w) {
    const f = this.facing, sf = Math.sin(f), cf = Math.cos(f), d = A.bladeDir, e = A.bladeEdge;
    _bd.set(d.x * sf + d.z * cf, d.y, d.x * cf - d.z * sf); if (_bd.lengthSq() < 1e-6) return; _bd.normalize();
    if (e.x || e.y || e.z) _be.set(e.x * sf + e.z * cf, e.y, e.x * cf - e.z * sf); else _be.set(sf * 0.4, -1, cf * 0.4);
    _be.addScaledVector(_bd, -_be.dot(_bd)); if (_be.lengthSq() < 1e-6) _be.set(-cf, 0, sf).addScaledVector(_bd, -_bd.z * sf); _be.normalize();
    // local axes: +Y the blade, −X the edge, +Z = X × Y
    _bx.copy(_be).negate(); _bz.crossVectors(_bx, _bd);
    _bm.makeBasis(_bx, _bd, _bz); _bq.setFromRotationMatrix(_bm);
    this.sword.parent.getWorldQuaternion(_bp); _bq.premultiply(_bp.invert());
    this.sword.quaternion.slerp(_bq, w);
    this.sword.updateMatrixWorld(true);
  }
  get nav() { return navFor(this.world); } // this world's clearance grid (debug / tests)
  // walk toward (tx, tz) along a route round obstacles: 0 walking, 1 arrived within stop, 2 got as close as the map
  // allows (target walled off / inside something), -1 no route (walled in, or wedged for a while)
  walkTo(tx, tz, dt, stop, smooth = true) {
    const px = this.pos.x, pz = this.pos.z;
    if (Math.hypot(tx - px, tz - pz) < stop) return 1;
    const nav = navFor(this.world);
    if (!nav) return this.moveTo(tx, tz, dt, this.speedMul, stop) ? 1 : 0;
    const f = this.route, w = f.steer(nav, px, pz, tx, tz, dt);
    if (!w) { // no route at all (standing somewhere the grid calls solid): the old straight walk, still watched
      if (this.moveTo(tx, tz, dt, this.speedMul, stop)) return 1;
      this.navOn = true;
      return f.watch(nav, this.pos.x, this.pos.z, this.speed * this.speedMul * dt, dt) ? -1 : 0;
    }
    const dx = w.x - px, dz = w.z - pz, d = Math.hypot(dx, dz);
    if (f.last && (d < (f.exact ? 0.02 : 0.2))) return f.exact ? 1 : 2;
    // ease the heading into each new leg instead of snapping (not on the final approach: no orbiting the goal)
    const nd = this.navDir, k = smooth && !(f.last && d < 0.8) ? 1 - Math.exp(-dt * 16) : 1;
    nd.x += (dx / d - nd.x) * k; nd.z += (dz / d - nd.z) * k; nd.y = 0;
    const l = Math.hypot(nd.x, nd.z); if (l < 1e-4) nd.set(dx / d, 0, dz / d); else nd.multiplyScalar(1 / l);
    const slow = f.last ? Math.min(1, d / (this.speed * this.speedMul * dt + 1e-6)) : 1;
    this.step(nd, dt, this.speedMul * slow);
    this.navOn = true;
    const gaveUp = f.watch(nav, this.pos.x, this.pos.z, this.speed * this.speedMul * slow * dt, dt);
    if (f.stuck && f.last && Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.5) return f.exact ? 1 : 2; // pressed against it: close enough
    return gaveUp ? -1 : 0;
  }
  busyAction() { const a = this.anim.action; return a && BUSY.has(a.name) && !this.canMoveWhileActing; }
}
installPoeGear(Player.prototype); // holdFuma / dropFuma / carryFuma / setFumaOut (poeGear.js)
