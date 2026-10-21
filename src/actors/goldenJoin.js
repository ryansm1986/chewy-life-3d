// Foosy the dragoon arrives in Blossom Hollow (docs/GOLDEN.md §5; ROADMAP Z-H3): his old Onsen scene, moved to the island.
// The arrivals (actors/arrivals.js) start it once the Onsen opens and Captain Kaizo has brought the Tide Pool's news, on a
// calm moment in town; HeroManager owns it (heroes.gldJoin) and Arrivals calls update(dt) every frame.
//   wait   — his rig is made hidden; the scenery round the fountain is gathered a few milliseconds a frame for his staging
//   march  — he marches in across the plaza to his post by the fountain, very straight, the lance upright
//   guard  — at his post he turns to the camera, plants the lance and stands at attention. Shadow notices ("…Is he a
//            statue?"); the pointer and the maps show where. Walk up to him
//   vow    — you walk to your mark beside him, he turns, salutes and begins a solemn knightly vow ("…to guard this fountain
//            against all—"); a tennis ball comes bouncing in from Rosie's Treats. His ears go up, the lance drops, and he
//            bounds after it, brings it back in his mouth, sits, very pleased, and finishes: "—against all comers. …Is this
//            yours?"
//   talk   — the dialogue; the gift: he has been guarding a dragon whelp costume for Shadow (Whelp.forced: a poof, a wobbly
//            first flap, a squeak of a roar, a loop); his plea for Yukimi Spa (or, saved before he came, a thank-you);
//            prepareJoin; he asks to join; he picks up his lance, bows, trots off, a poof, HeroManager.joinGolden; Shadow's
//            outfit comes off (kept for when Foosy is played); Arrivals.finished starts his quest ("The Siege of Yukimi")
// Leaving town, a hero switch or a knock-out before the vow drops it: the arrival comes again a little later.
// The rumour: in town, once Stella has joined (she comes before him since H-6) and before the Onsen opens, Shadow passes it on (once).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Player } from './player.js';
import { Events } from '../core/events.js';
import { regionUnlocked, REGIONS } from '../regions/index.js';
import { installGoldenGear, lanceObject, setLanceLook } from './goldenGear.js';
import { makeToon } from '../gfx/materials.js';
import { LANDMARKS } from '../world/layout.js';
import { SceneView, frameGroup, frameFor, frameClear, camAt, keepOut, camAxes, paved, villagersNear, shadowOnMark, BODY, PUP } from './sceneStage.js';
import { dist } from '../core/util.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
// the plaza's fountain (its basin's rim) and Rosie's Treats, whose door the ball comes out of (the village's own records
// when they're there: world/layout.js LANDMARKS)
const FOUNTAIN = { x: LANDMARKS.fountain.x, z: LANDMARKS.fountain.z, r: 2.6 }, ROSIE_DOOR = { x: 130.95, z: 116.7 };

/** the scene's Foosy: a rig that walks and poses, his lance in his paw (no villager life) */
class SceneGolden extends Actor {
  constructor(world, G) {
    super(world, Player.buildRig(undefined, 'golden'), { radius: 0.3, speed: 3.8, name: 'Foosy' });
    this.G = G; this.height = this.rig.height || 1.2;
    this.weaponType = 'lance'; this._lanceT = 1e9; this.lanceThrown = false;
    this.holdLance({ colors: null });
  }
  update(dt) { super.update(dt); this.carryLance(dt); }
}
installGoldenGear(SceneGolden.prototype);

// the tennis ball and the costume bundle (procedural: a ball with its seam; a folded emerald felt bundle, brass horns)
let BALL_GEO = null, BUNDLE_GEO = null, PROP_MAT = null;
const propMat = () => PROP_MAT || (PROP_MAT = makeToon({ vertexColors: true, objectBrush: true, brush: 0.03, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 }));
function colored(g, c) { const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }
function ballGeo() {
  if (BALL_GEO) return BALL_GEO;
  const b = colored(new THREE.SphereGeometry(0.075, 18, 12), '#d4e84a'), seam = colored(new THREE.TorusGeometry(0.0755, 0.006, 6, 30), '#f6f6ee');
  seam.rotateX(1.2);
  return (BALL_GEO = mergeTwo([b, seam]));
}
function bundleGeo() {
  if (BUNDLE_GEO) return BUNDLE_GEO;
  const box = colored(new THREE.BoxGeometry(0.34, 0.12, 0.24, 2, 1, 2), '#3a9a6a');
  const tie = colored(new THREE.BoxGeometry(0.36, 0.13, 0.04), '#c8a050');
  const parts = [box, tie];
  for (const s of [1, -1]) { const h = colored(new THREE.ConeGeometry(0.025, 0.08, 8), '#c8a050'); h.rotateZ(-s * 0.4); h.translate(s * 0.08, 0.1, -0.04); parts.push(h); }
  const wing = colored(new THREE.ConeGeometry(0.05, 0.14, 4), '#f0a060'); wing.rotateZ(Math.PI / 2); wing.translate(0.2, 0.02, 0.04); parts.push(wing);
  return (BUNDLE_GEO = mergeTwo(parts));
}
function mergeTwo(gs) {
  const pos = [], nrm = [], col = [], idx = []; let off = 0;
  for (const g of gs) {
    const gi = g.index ? g : g.toNonIndexed(); const p = gi.attributes.position, n = gi.attributes.normal, c = gi.attributes.color;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.getX(i), c.getY(i), c.getZ(i)); }
    if (gi.index) for (let i = 0; i < gi.index.count; i++) idx.push(gi.index.getX(i) + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx); out.computeBoundingSphere(); out.userData.shared = true;
  return out;
}

export class GoldenJoin {
  constructor(G, heroes) {
    this.G = G; this.H = heroes;
    this.state = 'off'; this.t = 0; this.knight = null; this.waits = []; this.ball = null; this.bundle = null; this.groundLance = null; this.spot = null; this.plan = 'start';
    Events.on('mode:changed', () => this.reset());
    Events.on('hero:switching', () => this.reset());
  }
  get joined() { return !!this.G.state.flags.goldenJoined; }
  get busy() { return this.state === 'vow' || this.state === 'talk'; }
  get active() { return this.state !== 'off' && this.state !== 'done'; }
  /** the arrival begins (actors/arrivals.js): plan 'start' (he asks for help), 'saved' (Yukimi saved before he came) */
  start(a, plan = 'start') {
    if (this.busy) return;
    this.reset(true);
    this.plan = plan; this.state = 'wait'; this.t = 0;
  }
  reset(force = false) {
    if (this.busy && !force) return; // (the scene finishes what it started)
    const G = this.G;
    this.knight?.dispose(); this.knight = null;
    this.dropProps();
    const sh = G.companion; if (sh?.whelp && sh.whelp.forced != null) { sh.whelp.forced = null; sh.whelp.act = null; } if (sh?.hold?.gld) sh.hold = null;
    if (force && this.busy) { const P = G.player; if (P) { P.controlLocked = false; P.moveTarget = null; } G.introFocus = null; }
    if (G.sceneKeepOut?.by === 'golden') keepOut(G, null);
    this.view?.dispose(); this.view = null;
    this.waits.length = 0; this.state = 'off'; this.t = 0; this.spot = null; this.stg = null; this.beat = null; this.loop = null; this.noticed = false;
  }
  dropProps() {
    for (const k of ['ball', 'bundle']) { const m = this[k]; if (m) { m.parent?.remove(m); this[k] = null; } }
    if (this.groundLance) { this.groundLance.holder.parent?.remove(this.groundLance.holder); this.groundLance = null; }
  }
  /** resolves once fn() is true (checked every frame in update), or after max seconds */
  until(fn, max = 4) { return new Promise(res => this.waits.push({ fn, res, t: max })); }
  wait(s) { return this.until(() => false, s); }
  /** nothing else going on in town: a moment for a scene (actors/arrivals.js why) */
  calm() { return !this.H.arrivals?.why?.(); }
  update(dt) {
    const G = this.G;
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; w.t -= dt; if (w.t <= 0 || w.fn()) { this.waits.splice(i, 1); w.res(); } }
    if (G.mode === 'village' && this.state === 'off') return this.townHint(dt);
    if (this.knight && this.state !== 'wait') this.knight.update(dt);
    this.tickBall(dt);
    if (this.busy && this.beat) this.frameTick();
    if (this.busy || this.state === 'off' || this.state === 'done') return; // (done: he trots off, then reset() clears it)
    if (G.mode !== 'village') { this.reset(); return; }
    const P = G.player; if (!P || G.playerDead) { this.reset(); return; }
    this.t += dt;
    if (this.state === 'wait') {
      if (!this.knight) { this.knight = new SceneGolden(G.world, G); this.knight.visible = false; this.knight.setPos(FOUNTAIN.x + FOUNTAIN.r + 1.2, FOUNTAIN.z); this.knight.update(0); }
      this.view ||= new SceneView(G, FOUNTAIN, { w: 16, back: 10, front: 20 }); // (the plaza's scenery, a few ms a frame: for his staging)
      if (this.view.prepStep(3) && this.t > 2 && this.calm()) this.standGuard(P);
      return;
    }
    if (this.state === 'march') this.tickMarch(dt);
    if (this.state === 'guard') this.tickGuard(dt, P);
  }
  /** room for him: walkable, clear, level-ish, dry */
  free(x, z) {
    const W = this.G.world, h0 = W.heightAt(x, z);
    for (const [dx, dz] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
      const px = x + dx, pz = z + dz;
      if (W.walkable?.(px, pz) === false || W.collision?.solidAt?.(px, pz, 0.35) || Math.abs(W.heightAt(px, pz) - h0) > 0.45 || (W.waterAt?.(px, pz) || 0) > 0.05) return false;
    }
    return true;
  }
  /** nothing solid between two marks (a bench, a planter: low, so the rays don't see them, but right in the shot) */
  between(a, b) { const C = this.G.world.collision; for (const t of [0.25, 0.5, 0.75]) if (C?.solidAt?.(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.45)) return false; return true; }
  /** the camera's ground axes: toward it (T) and the screen's right (R) */
  axes() { return camAxes(this.G); }
  /** the scene's staging, worked out once when he takes his post: his post on the fountain's rim; where you stand for the
   *  vow (beside him on screen, 2.7 m across, a step toward the camera); where Shadow sits for the gift (behind you both,
   *  between you, his face to the camera); where the ball lands (his other side, or behind him: he runs off and back).
   *  Every spot free, on the plaza's paving, clear of the villagers and in plain view of where the scene's camera will be
   *  (actors/sceneStage.js); the fountain beside the pair on screen rather than in front of them */
  stage(P) {
    const G = this.G, V = this.view?.occ ? this.view : null, { T, R } = this.axes(), at = (o, side, t) => ({ x: o.x + R[0] * side + T[0] * t, z: o.z + R[1] * side + T[1] * t });
    const combos = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      for (const r of [FOUNTAIN.r + 1.1, FOUNTAIN.r + 1.7]) {
        const post = { x: FOUNTAIN.x + Math.cos(a) * r, z: FOUNTAIN.z + Math.sin(a) * r }; if (!this.free(post.x, post.z)) continue;
        for (const side of [1, -1]) for (const t of [0.6, 1.1, 0.1]) {
          const aud = at(post, side * 2.7, t); if (!this.free(aud.x, aud.z) || !this.between(post, aud)) continue;
          const mid = { x: (post.x + aud.x) / 2, z: (post.z + aud.z) / 2 }, shd = at(mid, 0, -1.1);
          const balls = [at(post, -side * 2.6, 0.3), at(post, -side * 2.2, -1.2), at(post, -side * 0.6, -2.6), at(post, side * 0.6, -2.6)].filter(p => this.free(p.x, p.z) && this.between(post, p));
          // the fountain's offset from the pair's middle: across the screen (sx) and toward the camera (su)
          const dx = FOUNTAIN.x - mid.x, dz = FOUNTAIN.z - mid.z, sx = dx * R[0] + dz * R[1], su = dx * T[0] + dz * T[1];
          const front = Math.max(0, FOUNTAIN.r + 3.2 - Math.abs(sx)) * Math.max(0, Math.min(1, (su + 2.5) / 3));
          const s = front * 1.5 + (balls.length ? 0 : 5) + (this.free(shd.x, shd.z) ? 0 : 5) + Math.abs(t - 0.6) + (Math.abs(sx) < FOUNTAIN.r + 6.5 ? 0 : 2) + Math.max(0, 7 - dist(post.x, post.z, P.pos.x, P.pos.z)) * 0.8 // (a post a little way off from you: you walk up to him)
            + (paved(G, post.x, post.z) ? 0 : 2.6) + (paved(G, aud.x, aud.z) ? 0 : 2.6) + villagersNear(G, mid.x, mid.z, 3) * 1.5;
          combos.push({ post, aud, shd, mid, balls, side, s });
        }
      }
    }
    combos.sort((a, b) => a.s - b.s);
    const cam = new THREE.Vector3();
    const clear = c => {
      if (!V) return true;
      camAt(G, frameFor(G, [[c.post.x, c.post.z, 0, 1.55], [c.aud.x, c.aud.z, 0, 1.45], [c.shd.x, c.shd.z, 0, 0.8]], { min: 13, max: 22 }), cam);
      if (V.screened(c.post.x, c.post.z, BODY, 0.32, cam) || V.screened(c.aud.x, c.aud.z, BODY, 0.32, cam) || V.screened(c.shd.x, c.shd.z, PUP, 0.2, cam)) return false;
      c.ball = c.balls.find(p => !V.screened(p.x, p.z, [0.3, 0.6], 0.15, cam)) || null; return !!c.ball;
    };
    // (the ball comes from Rosie's Treats and bounces on past him: its landing spots on his far side from her door first)
    const rd = this.rosieDoor();
    for (const c of combos) { const ax = c.post.x - rd.x, az = c.post.z - rd.z, L = Math.hypot(ax, az) || 1; c.balls.sort((p, q) => ((q.x - c.post.x) * ax + (q.z - c.post.z) * az) / L - ((p.x - c.post.x) * ax + (p.z - c.post.z) * az) / L); }
    let best = combos.slice(0, 80).find(clear) || null;
    if (best) best.clear = true; else if ((best = combos[0] || null)) { best.clear = false; best.ball = best.balls[0] || null; }
    return best;
  }
  /** where he marches in from: a clear straight line to his post across the plaza, ~12 m long, from up-screen if it can be
   *  (he comes toward the camera, very straight, the lance upright) */
  entry(post) {
    const G = this.G, W = G.world, { T } = this.axes(), clear = (x, z) => W.walkable?.(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.3);
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      for (const r of [12, 10, 14, 8]) {
        let ok = true; for (let d = 1.2; d <= r; d += 0.5) if (!clear(post.x + dx * d, post.z + dz * d)) { ok = false; break; }
        if (!ok) continue;
        const x = post.x + dx * r, z = post.z + dz * r, s = (1 + dx * T[0] + dz * T[1]) * 1.5 + (paved(G, x, z) ? 0 : 1) + Math.abs(r - 12) * 0.15 + villagersNear(G, x, z, 3);
        if (!best || s < best.s) best = { x, z, s };
        break;
      }
    }
    return best;
  }
  standGuard(P) {
    const G = this.G, st = this.stage(P); if (!st) return;
    const k = this.knight, W = G.world;
    this.stg = st; this.spot = new THREE.Vector3(st.post.x, W.heightAt(st.post.x, st.post.z), st.post.z);
    // he marches in across the plaza to his post (or, nowhere clear to march from, he's there)
    const e = this.entry(st.post);
    if (e) { k.setPos(e.x, e.z); k.faceTo(st.post.x, st.post.z); k.facing = k.faceTarget; k.visible = true; k.update(0); this.state = 'march'; this.t = 0; Events.emit('golden:joinScene', { phase: 'march' }); return; }
    this.atPost();
  }
  tickMarch(dt) {
    const k = this.knight, p = this.spot;
    if (k.moveTo(p.x, p.z, dt, 0.72, 0.12) || this.t > 14) { if (this.t > 14) k.setPos(p.x, p.z); this.atPost(); }
  }
  /** at his post: he turns to the camera, plants the lance and stands at attention */
  atPost() {
    const G = this.G, k = this.knight, { T } = this.axes();
    k.faceTarget = Math.atan2(T[0], T[1]); k.visible = true; k.update(0); // (to the camera)
    k.anim.play('gldAttention'); sfx('jav_stick', { pos: k.pos, pitch: 0.7, vol: 0.5 });
    this.state = 'guard'; this.t = 0; this.far = false;
    Events.emit('golden:joinScene', { phase: 'guard' });
  }
  /** Shadow notices, wherever you are (his tip, once it can show: never over a dialogue or another tip, never after the
   *  scene has moved on) */
  notice() {
    const G = this.G, F = G.state.flags; if (F.hints?.gldGuardTown || this.t < 1.5 || !this.calm()) return;
    G.hint?.('gldGuardTown', "*Sniff…* Someone in shiny green armour is standing guard by the fountain. Very, very still. …Is he a statue?", false);
    if (F.hints?.gldGuardTown && G.companion) G.vfx?.emote?.(G.companion, '?', 1.4);
  }
  /** the scene's camera: everyone in the beat (him, you, Shadow, the ball when it matters, the loop) in frame with a margin,
   *  the group in the middle of the band above the dialogue box (actors/sceneStage.js frameFor) */
  frameTick() {
    const G = this.G, k = this.knight, P = G.player; if (!k || !P) return;
    const pts = [[P.pos.x, P.pos.z, 0, 1.4]];
    if (k.visible) pts.push([k.pos.x, k.pos.z, 0, 1.55]);
    const sh = G.companion, b = this.beat;
    if (sh && (sh.hold?.gld || sh.whelp?.forced)) pts.push([sh.pos.x, sh.pos.z, 0, (sh.whelp?.lift || 0) + 0.9]);
    if (b === 'fetch' && this.ball && dist(this.ball.position.x, this.ball.position.z, k.pos.x, k.pos.z) < 7) pts.push([this.ball.position.x, this.ball.position.z, 0, 0.4]); // (once it's close: it flies in)
    if (b === 'loop' && this.loop) for (let i = 0; i < 4; i++) pts.push([this.loop.x + Math.sin(i * 1.571) * this.loop.r, this.loop.z + Math.cos(i * 1.571) * this.loop.r, 1.3, 2.3]);
    // (the talk beat close, 18 m at most, so you two read on a phone; wider only for the ball's arc and the whelp's loop)
    const TALK_MAX = 18, wide = b === 'fetch' || b === 'loop';
    frameGroup(G, pts, { min: 13, max: wide ? 24 : TALK_MAX });
    const fx = this.camFix; if (fx && b === 'pair') { G.introFocus.x += fx.x; G.introFocus.z += fx.z; G.engine.rig.distTarget += fx.d; } // (a garland or a lantern post would cross you from the plain framing)
    if (!wide) G.engine.rig.distTarget = Math.min(TALK_MAX, G.engine.rig.distTarget);
  }
  tickGuard(dt, P) {
    const k = this.knight, d = dist(P.pos.x, P.pos.z, k.pos.x, k.pos.z);
    this.notice();
    if (d > 6) this.far = true; // (you walk up to him: from further off, or, standing beside him all along, after a while)
    if (d < 5 && this.t > 1.2 && (this.far || this.t > 12) && this.calm()) this.vow(P);
  }
  // ------------------------------------------------------------------ the tennis ball (thrown out of Rosie's Treats)
  tickBall(dt) {
    const b = this.ballState; if (!b || !this.ball) return;
    const G = this.G, m = this.ball;
    if (b.held) { // in his mouth: just in front of his muzzle
      const k = this.knight; if (!k) return;
      const jaw = k.rig.parts?.jaw; // (in his jaw: it follows the head through the trot and the sit)
      if (jaw) { jaw.getWorldPosition(m.position); m.position.x += Math.sin(k.facing) * 0.07; m.position.y -= 0.03; m.position.z += Math.cos(k.facing) * 0.07; }
      else m.position.set(k.pos.x + Math.sin(k.facing) * 0.3, k.pos.y + (k.rig.offsetY || 0) + 0.82, k.pos.z + Math.cos(k.facing) * 0.3);
      return;
    }
    if (b.rest) return;
    b.v.y -= 14 * dt; m.position.addScaledVector(b.v, dt); m.rotation.x += dt * 9; m.rotation.z += dt * 5;
    const gy = G.world.heightAt(m.position.x, m.position.z) + 0.075;
    if (m.position.y <= gy) {
      m.position.y = gy;
      // (the first bounce takes most of its run out of it: it skips on a step or two past him and stops near its spot)
      if (Math.abs(b.v.y) > 1.2) { const k = b.bounces ? 0.5 : 0.15; b.v.y = -b.v.y * (b.bounces ? 0.6 : 0.45); b.v.x *= k; b.v.z *= k; sfx('ball_bounce', { pos: m.position, pitch: 1.2, vol: 0.7 }); b.bounces++; }
      else { const f = Math.max(0, 1 - dt * 5); b.v.set(b.v.x * f, 0, b.v.z * f); if (Math.hypot(b.v.x, b.v.z) < 0.15) b.rest = true; }
    }
  }
  /** Rosie's Treats' door (the village's own record when it's there) */
  rosieDoor() { const r = this.G.sim?.list?.find(x => x.data.type === 'rosieShop'); return r?.door ? { x: r.door.x, z: r.door.z } : ROSIE_DOOR; }
  throwBall(to) {
    const G = this.G, W = G.world, d = this.rosieDoor(), p = this.spot || to;
    // (from Rosie's Treats' way: in at the frame's edge, already on its way, when her door is further off than that)
    let fx = d.x, fz = d.z + 0.6; const L = Math.hypot(fx - p.x, fz - p.z); if (L > 8.5) { fx = p.x + (fx - p.x) / L * 8.5; fz = p.z + (fz - p.z) / L * 8.5; }
    const from = new THREE.Vector3(fx, W.heightAt(fx, fz) + (L > 8.5 ? 2.2 : 1.3), fz);
    const m = this.ball = new THREE.Mesh(ballGeo(), propMat()); m.castShadow = true; m.position.copy(from); m.userData.sceneActor = true; G.world.scene.add(m);
    // (a long lob down Market Street: the further, the higher and slower, and it bounces in past him)
    const T = Math.max(0.85, Math.min(2.2, Math.hypot(to.x - from.x, to.z - from.z) / 8)), v = new THREE.Vector3((to.x - from.x) / T, 0, (to.z - from.z) / T); v.y = (to.y + 0.1 - from.y + 0.5 * 14 * T * T) / T;
    this.ballState = { v, bounces: 0, rest: false, held: false };
    sfx('throw', { pos: from, pitch: 1.3, vol: 0.6 });
    G.ui?.float?.(from.clone().setY(from.y + 0.6), 'Fetch!', { kind: 'status', color: '#ffe6a0' });
  }
  // ------------------------------------------------------------------ the vow, and the ball
  async vow(P) {
    const G = this.G, k = this.knight, rig = G.engine.rig, sh = G.companion;
    this.state = 'vow';
    P.controlLocked = true; P.moveTarget = null; G.skills?.charge?.cancel?.('scene', true);
    G.ui?.toasts?.retire?.(0); // (Shadow's "is he a statue?" steps aside)
    Events.emit('golden:joinScene', { phase: 'vow' });
    const prevDist = rig.distTarget;
    try {
      // you walk to your mark beside him (the staging: in plain view, the fountain beside you both), he turns to you
      const st = this.stg, W = G.world;
      keepOut(G, st ? st.mid : k.pos, 4); G.sceneKeepOut.by = 'golden';
      this.beat = 'pair';
      if (sh && st) { sh.hold = { x: st.shd.x, z: st.shd.z, face: Math.atan2(st.mid.x - st.shd.x, st.mid.z - st.shd.z), gld: true }; sh.anim?.stop?.('sit'); } // (Shadow sits on his mark and watches)
      if (st) {
        P.moveTarget = new THREE.Vector3(st.aud.x, W.heightAt(st.aud.x, st.aud.z), st.aud.z);
        await this.until(() => { k.faceTo(P.pos.x, P.pos.z); return dist(P.pos.x, P.pos.z, st.aud.x, st.aud.z) < 0.3; }, 4);
        if (dist(P.pos.x, P.pos.z, st.aud.x, st.aud.z) > 0.6) P.setPos(st.aud.x, st.aud.z); // (blocked on the way: on the mark)
        P.moveTarget = null;
        if (sh?.hold?.gld) { await this.until(() => dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) < 0.4, 3); shadowOnMark(sh); }
      }
      k.faceTo(P.pos.x, P.pos.z); P.faceTo(k.pos.x, k.pos.z);
      // (the pair's framing in the clear from the camera's real place: frameClear's step closer, further or aside, kept by frameTick)
      const pts = [[P.pos.x, P.pos.z, 0, 1.4], [k.pos.x, k.pos.z, 0, 1.55]]; if (sh?.hold?.gld) pts.push([sh.hold.x, sh.hold.z, 0, 0.9]);
      const base = frameFor(G, pts, { min: 13, max: 18 }), pick = this.view?.occ ? frameClear(G, this.view, pts, [P.pos, k.pos], sh?.hold?.gld ? [sh.pos] : [], { min: 13, max: 18 }) : null;
      this.camFix = base && pick?.moved ? { x: pick.focus.x - base.focus.x, z: pick.focus.z - base.focus.z, d: pick.dist - base.dist } : null; this.framed = pick?.moved ? 'moved' : 'base';
      await this.until(() => Math.abs(Math.atan2(Math.sin(k.faceTarget - k.facing), Math.cos(k.faceTarget - k.facing))) < 0.15, 0.8);
      k.anim.play('gldSalute'); sfx('lance_whoosh', { pitch: 0.8, vol: 0.5 });
      const name = this.H.name('golden'), portrait = G.portrait?.('golden');
      await G.ui?.dialogue?.({ speaker: name, portrait, lines: ['Halt! Who approaches the fountain of Blossom Hollow?', '…A local. Then bear witness:', `I, ${name} of the Emberleaf Guard, do solemnly swear upon my lance to guard this fountain against all—`] });
      // a tennis ball bounces out of Rosie's Treats, past him
      const f = k.facing, past = this.stg?.ball ? new THREE.Vector3(this.stg.ball.x, 0, this.stg.ball.z) : new THREE.Vector3(k.pos.x - Math.cos(f) * 2.6 - Math.sin(f) * 1.2, 0, k.pos.z + Math.sin(f) * 2.6 - Math.cos(f) * 1.2);
      if (!this.free(past.x, past.z)) past.set(k.pos.x + Math.cos(f) * 2.6, 0, k.pos.z - Math.sin(f) * 2.6);
      this.beat = 'fetch';
      past.y = G.world.heightAt(past.x, past.z);
      this.throwBall(past);
      await this.until(() => this.ballState?.bounces >= 1, 2.6);
      // his ears go up, his tail goes, the vow is forgotten: the lance drops and he's off after it
      k.anim.play('gldStartle'); G.vfx?.emote?.(k, '!', 1.1); sfx('golden_boof', { pos: k.pos, pitch: 1.15 });
      await this.wait(0.45);
      const gl = this.groundLance = lanceObject(); setLanceLook(gl, null); gl.holder.position.set(k.pos.x + Math.cos(k.facing) * 0.45, k.pos.y + 0.05, k.pos.z - Math.sin(k.facing) * 0.45);
      gl.holder.rotation.set(0, k.facing, Math.PI / 2 - 0.05); G.world.scene.add(gl.holder);
      k.lanceThrown = true; sfx('jav_stick', { pos: k.pos, pitch: 0.8 });
      if (sh) G.vfx?.emote?.(sh, '!', 1);
      await this.until(() => this.ballState?.rest || this.ballState?.bounces >= 3, 1.6);
      const bp = this.ball.position.clone();
      await this.until(() => k.moveTo(bp.x, bp.z, 1 / 60, 1.9, 0.35), 3);
      k.anim.play('pickup'); await this.wait(0.38);
      this.ballState.held = true; sfx('lance_catch', { pos: k.pos, pitch: 1.3 });
      await this.wait(0.2);
      // back to his post, very pleased, and he sits with it
      await this.until(() => k.moveTo(this.spot.x, this.spot.z, 1 / 60, 1.2, 0.3), 3);
      k.faceTo(P.pos.x, P.pos.z);
      await this.until(() => Math.abs(Math.atan2(Math.sin(k.faceTarget - k.facing), Math.cos(k.faceTarget - k.facing))) < 0.2, 0.7);
      k.anim.play('gldSitProud'); G.vfx?.emote?.(k, 'heart', 1.4);
      await this.wait(0.7);
      this.ballState.held = false; this.ballState.rest = false; this.ballState.v.set(Math.sin(k.facing) * 1.2, 1.5, Math.cos(k.facing) * 1.2); // (he drops it at your feet)
      this.beat = 'pair';
      await G.ui?.dialogue?.({ speaker: name, portrait, lines: ['—against all comers.', '…', 'Is this yours? It was very well thrown.'] });
      this.state = 'talk';
      await this.talk(P);
    } finally {
      G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false; P.moveTarget = null; this.beat = null; this.loop = null; this.camFix = null;
      if (G.sceneKeepOut?.by === 'golden') keepOut(G, null);
      if (!this.joined) { this.reset(true); } else { this.state = 'done'; this.H.arrivals?.finished?.('golden'); } // (the arrival recorded; his quest and its card)
    }
  }
  // ------------------------------------------------------------------ the talk, the gift, the join
  async talk(P) {
    const G = this.G, ui = G.ui, k = this.knight, me = this.H.name(), name = this.H.name('golden'), sh = G.companion;
    const portrait = G.portrait?.('golden'), say = (lines, choices) => ui.dialogue({ speaker: name, portrait, lines, choices });
    k.anim.talk = 0.8;
    const a = await say([`Ahem. ${name} of the Emberleaf Guard. I guard the springs of Yukimi.`, 'Mostly from snow monkeys. They do not respect the vow either.'],
      [{ text: "That ball is Rosie's." }, { text: 'Good catch!' }]);
    await say(a === 0 ? ['Then I shall return it. Later. With honour. …After one more throw.'] : ['Thank you! It is my best skill. After the lance. And the javelins. Mostly the ball.']);
    await say([`And you must be ${me}. Rosie's notice reached even Yukimi. The Burrow, the yokai, the very good dog.`, 'I have been guarding your fountain while I waited for you. It seemed the polite thing to do.', 'Which brings me to my second duty.']);
    // the gift: he has been guarding a dragon whelp costume for Shadow
    if (sh) {
      const m = this.stg?.shd || { x: k.pos.x + Math.sin(k.facing) * 1.1, z: k.pos.z + Math.cos(k.facing) * 1.1 };
      sh.hold = { x: m.x, z: m.z, face: Math.atan2(k.pos.x - m.x, k.pos.z - m.z), gld: true }; sh.anim?.stop?.('sit');
    }
    k.anim.talk = 0; k.anim.play('gldOffer');
    const bundle = this.bundle = new THREE.Mesh(bundleGeo(), propMat()); bundle.castShadow = true; bundle.userData.sceneActor = true; G.world.scene.add(bundle);
    const placeBundle = () => { bundle.position.set(k.pos.x + Math.sin(k.facing) * 0.34, k.pos.y + 0.62, k.pos.z + Math.cos(k.facing) * 0.34); bundle.rotation.y = k.facing; };
    placeBundle();
    await this.until(() => !sh || dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) < 0.3, 3);
    k.anim.talk = 0.8;
    await say(['I have been guarding this for a very good little dog.', 'Every dragoon needs a dragon. Would you like to be mine?']);
    k.anim.talk = 0;
    if (sh) {
      sh.anim.play('bark'); sfx('bark_small', { pos: sh.pos }); await this.wait(0.45);
      bundle.visible = false;
      sh.whelp.forced = true; // (a poof: the outfit goes on, actors/whelp.js swap)
      await this.wait(0.7);
      sh.hold = null;
      const W = sh.whelp, hx = sh.pos.x, hz = sh.pos.z;
      // a wobbly first flap: up a little, down with a bump, then up for real
      W.act = { to: new THREE.Vector3(hx, 0, hz), speed: 2, lift: 0.4, rate: 2.5, pitch: -0.2, wings: 'beat', face: sh.facing };
      await this.wait(0.55);
      W.act.lift = 0; W.act.rate = 4; W.act.pitch = 0.25; await this.wait(0.35); sfx('jav_bonk', { pos: sh.pos, pitch: 0.7, vol: 0.4 });
      W.act.lift = 0.9; W.act.rate = 3; W.act.pitch = -0.3; await this.wait(0.6);
      // a tiny roar (a squeak), then a happy loop round them both
      sh.anim.play('whelpRoar', { force: true }); await this.wait(0.45); sfx('whelp_roar', { pos: sh.pos }); G.vfx?.emote?.(k, 'heart', 1.2);
      await this.wait(0.7);
      const cx = (k.pos.x + P.pos.x) / 2, cz = (k.pos.z + P.pos.z) / 2, R = Math.max(2.2, dist(k.pos.x, k.pos.z, P.pos.x, P.pos.z) / 2 + 1.1);
      const a0 = Math.atan2(hx - cx, hz - cz);
      this.loop = { x: cx, z: cz, r: R }; this.beat = 'loop';
      for (let i = 1; i <= 12; i++) { const a = a0 + i / 12 * Math.PI * 2; W.act = { to: new THREE.Vector3(cx + Math.sin(a) * R, 0, cz + Math.cos(a) * R), speed: 7, lift: 1.3, rate: 3, wings: 'beat', face: a + Math.PI / 2 }; await this.wait(0.22); }
      W.act = null; this.beat = 'pair';
      if (G.companion) G.vfx?.sparkle?.(new THREE.Vector3(sh.pos.x, sh.pos.y + 1.2, sh.pos.z), { n: 10, color: '#7ae0a8' });
    }
    k.anim.play('gldAttention'); k.anim.talk = 0.8;
    await say(['…Magnificent.', 'He is a natural. A little squeaky. So am I, when I am excited.']);
    G.actions.prepareJoin?.('golden');
    // his first duty: the plea for Yukimi (or, saved before he came, a thank-you)
    const saved = this.plan === 'saved', crew = this.H.arrivals?.savedBy?.('onsen') === 'crew';
    const c = await say(saved
      ? ['And my first duty. I came to fetch help: the springs of Yukimi were besieged.', crew ? 'But the snow monkeys tell me your crew has already broken the siege. …I am told they bowed. I approve.' : 'But the snow monkeys tell me someone has already broken the siege. …You. Of course it was you.', 'So I came to say thank you, and to offer my lance.', 'May I join your pack? I promise to guard it with my whole heart.']
      : ['And my first duty. The springs of Yukimi are besieged.', 'Snow yokai sit in the hot springs, and a snowman general, Captain Frostbelly, holds the square.', 'I guarded them alone as long as I could. A knight knows when to fetch help. …And balls.', 'May I join your pack? And will you come to Yukimi? I promise to guard you with my whole heart.'],
      [{ text: 'Welcome to the pack! ♡' }, { text: 'Only if you bring the ball.' }]);
    const then = saved ? 'I shall meet you at the cottage. Shadow will keep his wings for when we fight side by side.' : 'I shall meet you at the cottage, and then: Yukimi! Shadow will keep his wings for when we fight side by side.';
    await say(c === 1 ? ['…I was always going to bring the ball.', then] : ['A knight does not wag. …It is the wind.', then]);
    k.anim.talk = 0;
    // he picks up his lance, bows, and trots off; Shadow's outfit comes off (kept for when Foosy is played)
    if (this.groundLance) { this.groundLance.holder.parent?.remove(this.groundLance.holder); this.groundLance = null; }
    k.lanceThrown = false; sfx('lance_catch', { pos: k.pos });
    k.anim.play('gldBow'); await this.until(() => k.anim.action?.name !== 'gldBow', 1.4);
    const away = new THREE.Vector3(k.pos.x - Math.sin(k.facing) * 6, 0, k.pos.z - Math.cos(k.facing) * 6);
    Events.emit('golden:joinScene', { phase: 'leave' });
    this.until(() => k.moveTo(away.x, away.z, 1 / 60, 1.2, 0.4), 2.2);
    await this.wait(1.6);
    const k0 = k; G.vfx?.poof?.(new THREE.Vector3(k.pos.x, k.pos.y + 0.4, k.pos.z), { color: '#fff6e0', n: 12, size: 0.6 }); k0.visible = false;
    if (this.ball) { this.ball.parent?.remove(this.ball); this.ball = null; this.ballState = null; } // (he took the ball: he was always going to)
    await this.H.joinGolden();
    if (sh?.whelp) sh.whelp.forced = null; // (the outfit swaps back with a poof unless Foosy is the one you play)
    G.hint?.('gldWings', `*Flap flap!* I get to wear my dragon wings whenever you play ${name}. Rawr! (a very small rawr)`, false);
    Events.emit('golden:joinScene', { phase: 'done' });
    this.until(() => false, 0.6).then(() => { if (this.knight === k0 && this.state === 'done') { this.knight?.dispose(); this.knight = null; this.dropProps(); this.view?.dispose(); this.view = null; } });
  }
  // ------------------------------------------------------------------ the maps and the pointer (actors/arrivals.js)
  person() {
    const k = this.knight; if (!k?.visible || !this.active || this.G.mode !== 'village') return null;
    return { key: 'p:arrival:golden', kind: 'person', group: 'quest', id: 'golden', name: '???', role: this.state === 'march' ? 'Marching to the fountain' : 'Standing guard by the fountain', color: '#2f9a6a', initial: '?', npc: k, pos: k.pos, visible: true, badge: '!', prio: 7, named: true, area: 'village', arrival: true };
  }
  target() { const k = this.knight; return (this.state === 'guard' || this.state === 'march') && k?.visible ? { pos: k.pos, label: 'A guard by the fountain', kind: 'npc', arrival: 'golden' } : null; }
  // ------------------------------------------------------------------ the rumour in town
  townHint(dt) {
    const G = this.G, F = G.state.flags;
    if (this.joined || !this.H.joined('stella') || F.hints?.gldRumour) return; // (after Stella: her arrival comes before his, ROADMAP H-6)
    const u = regionUnlocked(G.state, 'onsen'); if (u.ok) return; // (the Onsen is open: he comes to town himself, actors/arrivals.js)
    if ((this.hintT = (this.hintT || 0) + dt) < 12 || G.ui?.dlg?.active || G.tutorials?.busy || G.tutorials?.cur || G.titleActive || this.H.arrivals?.active || G.player?.controlLocked) return; // (never over an arrival's scene)
    const where = REGIONS.onsen?.name || 'Yukimi Onsen';
    G.hint?.('gldRumour', `*Sniff sniff…* Rosie says a very polite dog in emerald armour is guarding the hot springs at ${where}, and won't let anyone in without the password. …Is the password "ball"? Once the Wayfarer's Post opens it (${u.why.toLowerCase()}), I bet he'll come to us!`);
  }
}
