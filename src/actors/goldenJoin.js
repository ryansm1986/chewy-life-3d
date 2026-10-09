// Foosy the dragoon joins the pack (docs/GOLDEN.md §5): his scene at the hot springs of Yukimi Onsen, and the rumour in
// town that sends you there. HeroManager (heroes.js) owns one GoldenJoin and calls update(dt) every frame.
//
// The scene runs on any Onsen visit while he hasn't joined, so a new game and an old save meet him the same way:
//   wait   — his rig is made hidden as you arrive (no hitch later); once you've been there a moment and nothing is chasing
//            you, he stands guard by the big hot spring, very straight, the lance upright, the little dragon on his helm
//   guard  — he holds it. Shadow notices once you're near ("is he a statue?"); walk up to him
//   vow    — he turns, raises the lance in salute and begins a solemn knightly vow ("I, Foosy of the Emberleaf Guard, do
//            solemnly swear upon my lance to guard these springs against all—"); a tennis ball bounces out of the
//            bathhouse. His ears go up, the lance drops, and he bounds after it, brings it back in his mouth, sits, very
//            pleased, and finishes: "—against all comers. …Is this yours? It was very well thrown."
//   talk   — the dialogue; the gift: he has been guarding a dragon whelp costume for Shadow. Shadow tries it on (a poof,
//            Whelp.forced), a wobbly first flap, a tiny roar that comes out as a squeak, a happy loop round them both;
//            prepareJoin; he asks to join; HeroManager.joinGolden (the banner, flags.goldenJoined, the save); he picks
//            up his lance, bows, and trots off "to meet you at the cottage"; Shadow's outfit comes off (it's kept for when
//            Foosy is played)
// Leaving the zone, dying or a hero switch before he speaks resets it: the next Onsen visit starts over.
// The rumour: in town, once Floofy (the Shih Tzu) has joined and Foosy hasn't, Shadow passes it on (once).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Player } from './player.js';
import { Events } from '../core/events.js';
import { regionUnlocked, REGIONS } from '../regions/index.js';
import { installGoldenGear, lanceObject, setLanceLook } from './goldenGear.js';
import { gldFx } from '../gfx/goldenFx.js';
import { makeToon } from '../gfx/materials.js';
import { dist } from '../core/util.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
// the big hot spring in front of the ruined ryokan (regions/biomes/onsen.js SPRINGS[0]) and, if the plan has none, a
// stand-in for the bathhouse (its `feature` POI)
const SPRING = { x: 55.5, z: 64.5, r: 2.5 }, BATHHOUSE = { x: 45, z: 67 };

/** the scene's Foosy: a rig that walks and poses, his lance in his paw (no villager life, no combat: monsters can't see
 *  him) */
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
    this.state = 'off'; this.t = 0; this.knight = null; this.waits = []; this.ball = null; this.bundle = null; this.groundLance = null; this.spot = null;
    Events.on('mode:changed', () => this.reset());
    Events.on('hero:switching', () => this.reset());
  }
  get joined() { return !!this.G.state.flags.goldenJoined; }
  get busy() { return this.state === 'vow' || this.state === 'talk'; }
  /** at the Onsen, on a visit where he can still meet you */
  inOnsen() { const G = this.G; return G.mode === 'dungeon' && G.dungeon?.isRegion && G.dungeon.regionId === 'onsen' && !this.joined; }
  reset() {
    if (this.busy) return; // (the scene finishes what it started)
    this.knight?.dispose(); this.knight = null;
    this.dropProps();
    const sh = this.G.companion; if (sh?.whelp && sh.whelp.forced != null) { sh.whelp.forced = null; sh.whelp.act = null; } if (sh?.hold?.gld) sh.hold = null;
    this.waits.length = 0; this.state = 'off'; this.t = 0; this.spot = null; this.stg = null; this.beat = null; this.loop = null; this.noticed = false; this.dropOcc();
  }
  dropProps() {
    for (const k of ['ball', 'bundle']) { const m = this[k]; if (m) { m.parent?.remove(m); this[k] = null; } }
    if (this.groundLance) { this.groundLance.holder.parent?.remove(this.groundLance.holder); this.groundLance = null; }
  }
  /** resolves once fn() is true (checked every frame in update), or after max seconds */
  until(fn, max = 4) { return new Promise(res => this.waits.push({ fn, res, t: max })); }
  wait(s) { return this.until(() => false, s); }
  /** nothing chasing the hero, no dialogue, no boss fight: a moment for a scene */
  calm() {
    const G = this.G, P = G.player;
    if (!P || G.playerDead || G.ui?.dlg?.active || G.heroSwitching || G.ui?.anyModal?.() || P.controlLocked || G.ui?.iris?.active) return false;
    if (G.dungeon?.boss?.introDone && G.dungeon.boss.alive && G.dungeon.boss.aggro) return false;
    if (G.dungeon?.village?.celebrate) return false; // (a crew's relief being celebrated in the square: docs/COZY.md §3.2)
    for (const m of G.dungeon?.monsters || []) if (m.alive && m.aggro && dist(m.pos.x, m.pos.z, P.pos.x, P.pos.z) < 13) return false;
    return true;
  }
  update(dt) {
    const G = this.G;
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; w.t -= dt; if (w.t <= 0 || w.fn()) { this.waits.splice(i, 1); w.res(); } }
    if (G.mode === 'village') return this.townHint(dt);
    if (this.knight && this.state !== 'wait') this.knight.update(dt);
    this.tickBall(dt);
    if (this.busy && this.beat) this.frameTick();
    if (this.busy || this.state === 'done') return; // (done: he trots off, then reset() clears it)
    if (!this.inOnsen()) { if (this.state !== 'off') this.reset(); return; }
    const P = G.player; if (!P || G.playerDead) return;
    this.t += dt;
    if (this.state === 'off') { this.state = 'wait'; this.t = 0; return; }
    if (this.state === 'wait') {
      if (!this.knight) { this.knight = new SceneGolden(G.world, G); this.knight.visible = false; this.knight.setPos(SPRING.x + SPRING.r + 1.2, SPRING.z); this.knight.update(0); }
      const ready = this.t > 1.5 && this.prepStep(); // (the scenery round the spring once the zone has settled, a little a frame: for his staging)
      if (ready && this.t > 2 && this.calm()) this.standGuard(P);
      return;
    }
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
  /** the scenery that could stand between the scene and the camera, near the big spring: the big merged batches cut down
   *  to their triangles in a box round it and up the camera's line, above knee height, sorted into half-metre strips
   *  across the screen (a ray up the camera's line stays in one strip: it meets a few thousand triangles, not a few
   *  hundred thousand), plus the small and the instanced meshes near the box as they are. No actors (rigs, the horde),
   *  no ground, nothing see-through or off the camera's layers. Built when he takes his post, dropped once he's staged. */
  occluders() { if (!this._occ) { const job = this._occJob || this.occBuild(); while (!job.next().done); this._occJob = null; } return this._occ; }
  /** build the occluders a few milliseconds a frame while he waits to take his post (true once they're ready) */
  prepStep(budget = 3) {
    if (this._occ) return true;
    const job = this._occJob ||= this.occBuild(), t0 = performance.now();
    while (performance.now() - t0 < budget) if (job.next().done) { this._occJob = null; return true; }
    return false;
  }
  *occBuild() {
    const G = this.G, W = G.world, cam = G.engine.camera, yaw = G.engine.rig.yaw, tx = Math.sin(yaw), tz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const skip = new Set([this.knight?.rig.root, G.player?.rig?.root, G.companion?.rig?.root]);
    const y0 = W.heightAt(SPRING.x + SPRING.r + 2, SPRING.z) + 0.8; // (lower than that, nothing hides a standing actor from up here)
    const U = (x, z) => (x - SPRING.x) * tx + (z - SPRING.z) * tz, Wd = (x, z) => (x - SPRING.x) * rx + (z - SPRING.z) * rz;
    const inBox = v => { const u = U(v.x, v.z), w = Wd(v.x, v.z); return v.y > y0 && v.y < 13 && Math.abs(w) < 10 && u > -9 && u < 18; };
    const occ = { rest: [], tris: Array.from({ length: 40 }, () => []), meshes: [] }, list = []; let work = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), sph = new THREE.Sphere();
    for (const m of G.dungeon?.monsters || []) skip.add(m.rig?.root);
    const walk = o => { // (not into an actor: the pack, him, the monsters, the horde, a skinned rig)
      if (skip.has(o) || o.name === 'horde' || o.isBone || o.isSkinnedMesh || o.visible === false || /ground/i.test(o.name)) return;
      if (o.isMesh && o.layers.test(cam.layers) && !o.material?.transparent && !o.userData?.lookH && o.geometry?.attributes?.position) list.push(o);
      for (const c of o.children) walk(c);
    };
    for (const ch of W.scene.children) walk(ch);
    yield;
    for (const o of list) {
      const g = o.geometry, pos = g.attributes.position;
      const idx = g.index, n = idx ? idx.count : pos.count;
      o.updateWorldMatrix(true, false);
      if (o.isInstancedMesh || o.isBatchedMesh || n < 3000) { // (only what lies near the box; the instanced and the batched (trees) as they are)
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (!o.isInstancedMesh && !o.isBatchedMesh) { sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); const u = U(sph.center.x, sph.center.z), w = Wd(sph.center.x, sph.center.z); if (Math.abs(w) > 10 + sph.radius || u < -9 - sph.radius || u > 18 + sph.radius || sph.center.y + sph.radius < y0) continue; }
        occ.rest.push(o); continue;
      }
      const M = o.matrixWorld;
      for (let i = 0; i + 2 < n; i += 3) {
        if (++work % 1000 === 0) yield; // (a few ms of triangles a frame)
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M); b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(M); c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(M);
        if (!inBox(a) && !inBox(b) && !inBox(c)) continue;
        const wa = Wd(a.x, a.z), wb = Wd(b.x, b.z), wc = Wd(c.x, c.z);
        const s0 = Math.max(0, Math.floor((Math.min(wa, wb, wc) + 10) / 0.5)), s1 = Math.min(39, Math.floor((Math.max(wa, wb, wc) + 10) / 0.5));
        for (let k = s0; k <= s1; k++) occ.tris[k].push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
      yield;
    }
    occ.strip = (x, z) => { // the strip's own little mesh, made on first use
      const k = Math.floor((Wd(x, z) + 10) / 0.5); if (k < 0 || k > 39) return null;
      if (occ.meshes[k] === undefined) {
        const t = occ.tris[k]; occ.meshes[k] = null;
        if (t.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(t, 3)); g.computeBoundingSphere(); const m = occ.meshes[k] = new THREE.Mesh(g, this._occMat ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.updateMatrixWorld(); }
      }
      return occ.meshes[k];
    };
    this._occ = occ;
  }
  dropOcc() { for (const m of this._occ?.meshes || []) m?.geometry.dispose(); this._occ = null; this._occJob = null; this._seen = null; }
  /** would something (a pine, a village roof, a lantern) stand between (x, z) and the game camera? Rays from there up the
   *  camera's line (`hs`: the heights, an actor's middle and head) against the scenery near the spring */
  screened(x, z, hs = [0.55, 1.3]) {
    const G = this.G, W = G.world, rig = G.engine?.rig; if (!rig) return false;
    const key = `${Math.round(x * 4)},${Math.round(z * 4)},${hs.join()}`, seen = this._seen ||= new Map(); if (seen.has(key)) return seen.get(key);
    const dir = new THREE.Vector3(Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch));
    const rc = this._rc ||= new THREE.Raycaster(), occ = this.occluders(), strip = occ.strip(x, z), list = strip ? [strip, ...occ.rest] : occ.rest;
    let hit = false;
    for (const dy of hs) { rc.set(new THREE.Vector3(x, W.heightAt(x, z) + dy, z), dir); rc.near = 0.3; rc.far = 30; if (rc.intersectObjects(list, false).length) { hit = true; break; } }
    seen.set(key, hit); return hit;
  }
  /** the camera's ground axes: toward it (T) and the screen's right (R) */
  axes() { const y = this.G.engine?.rig?.yaw ?? Math.PI / 4; return { T: [Math.sin(y), Math.cos(y)], R: [Math.cos(y), -Math.sin(y)] }; }
  /** the scene's staging, worked out once when he takes his post: his post on the big spring's rim; where you stand for
   *  the vow (beside him on screen, a step toward the camera); where Shadow sits for the gift (between you, in front);
   *  where the ball lands (his other side, or behind him: he runs off and back). Every spot dry, level and in plain view
   *  of the game camera; the spring and its steam beside the pair on screen rather than in front of them. */
  stage(P) {
    const { T, R } = this.axes(), at = (o, side, t) => ({ x: o.x + R[0] * side + T[0] * t, z: o.z + R[1] * side + T[1] * t });
    const combos = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      for (const r of [SPRING.r + 1.1, SPRING.r + 1.7]) {
        const post = { x: SPRING.x + Math.cos(a) * r, z: SPRING.z + Math.sin(a) * r }; if (!this.free(post.x, post.z)) continue;
        for (const side of [1, -1]) for (const t of [0.6, 1.1, 0.1]) {
          const aud = at(post, side * 2.7, t); if (!this.free(aud.x, aud.z)) continue;
          const mid = { x: (post.x + aud.x) / 2, z: (post.z + aud.z) / 2 }, shd = at(mid, 0, 0.9);
          const balls = [at(post, -side * 2.6, 0.3), at(post, -side * 2.2, -1.2), at(post, -side * 0.6, -2.6), at(post, side * 0.6, -2.6)].filter(p => this.free(p.x, p.z));
          // the spring's offset from the pair's middle: across the screen (sx) and toward the camera (su)
          const dx = SPRING.x - mid.x, dz = SPRING.z - mid.z, sx = dx * R[0] + dz * R[1], su = dx * T[0] + dz * T[1];
          const front = Math.max(0, SPRING.r + 3.2 - Math.abs(sx)) * Math.max(0, Math.min(1, (su + 2.5) / 3));
          const s = front * 1.5 + (balls.length ? 0 : 5) + (this.free(shd.x, shd.z) ? 0 : 5) + Math.abs(t - 0.6) + (Math.abs(sx) < SPRING.r + 6.5 ? 0 : 2) + dist(post.x, post.z, P.pos.x, P.pos.z) * 0.03;
          combos.push({ post, aud, shd, balls, side, s });
        }
      }
    }
    combos.sort((a, b) => a.s - b.s);
    const clear = c => {
      if (this.screened(c.post.x, c.post.z) || this.screened(c.aud.x, c.aud.z) || this.screened(c.shd.x, c.shd.z, [0.45])) return false;
      c.ball = c.balls.find(p => !this.screened(p.x, p.z, [0.5])) || null; return !!c.ball;
    };
    let best = combos.slice(0, 60).find(clear) || null;
    if (best) best.clear = true; else if ((best = combos[0] || null)) { best.clear = false; best.ball = best.balls[0] || null; }
    this.dropOcc();
    return best;
  }
  standGuard(P) {
    const G = this.G, st = this.stage(P); if (!st) return;
    const k = this.knight, W = G.world;
    this.stg = st; this.spot = new THREE.Vector3(st.post.x, W.heightAt(st.post.x, st.post.z), st.post.z);
    const { T } = this.axes();
    k.setPos(st.post.x, st.post.z); k.facing = k.faceTarget = Math.atan2(T[0], T[1]); k.visible = true; k.update(0); // (to the camera)
    k.anim.play('gldAttention');
    this.state = 'guard'; this.t = 0;
    Events.emit('golden:joinScene', { phase: 'guard' });
  }
  /** the scene's camera: everyone in the beat (him, you, Shadow, the ball when it matters, the loop) in frame with a
   *  margin, the group in the middle of the screen (the 20° lens: the distance from the group's size on screen) */
  frameTick() {
    const G = this.G, rig = G.engine?.rig, k = this.knight, P = G.player; if (!rig || !k || !P) return;
    const { T, R } = this.axes(), sp = Math.sin(rig.pitch), cp = Math.cos(rig.pitch), cam = G.engine.camera;
    const tv = Math.tan((cam.fov || 20) * Math.PI / 360), th = tv * (cam.aspect || 16 / 9);
    const pts = [[P.pos.x, P.pos.z, 0, 1.4]];
    if (k.visible) pts.push([k.pos.x, k.pos.z, 0, 1.55]);
    const sh = G.companion, b = this.beat;
    if (sh && (sh.hold?.gld || sh.whelp?.forced)) pts.push([sh.pos.x, sh.pos.z, 0, (sh.whelp?.lift || 0) + 0.9]);
    if (b === 'fetch' && this.ball) pts.push([this.ball.position.x, this.ball.position.z, 0, 0.4]);
    if (b === 'loop' && this.loop) for (let i = 0; i < 4; i++) pts.push([this.loop.x + Math.sin(i * 1.571) * this.loop.r, this.loop.z + Math.cos(i * 1.571) * this.loop.r, 1.3, 2.3]);
    const ox = pts.reduce((a, p) => a + p[0], 0) / pts.length, oz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    let h0 = 1e9, h1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z, y0, y1] of pts) {
      const h = (x - ox) * R[0] + (z - oz) * R[1], u = (x - ox) * T[0] + (z - oz) * T[1];
      h0 = Math.min(h0, h - 0.4); h1 = Math.max(h1, h + 0.4);
      v0 = Math.min(v0, -u * sp + (y0 - 0.6) * cp); v1 = Math.max(v1, -u * sp + (y1 - 0.6) * cp);
    }
    const ch = (h0 + h1) / 2, cv = (v0 + v1) / 2, eh = (h1 - h0) / 2, ev = (v1 - v0) / 2;
    const f = G.introFocus ||= new THREE.Vector3();
    f.set(ox + R[0] * ch - T[0] * cv / sp, P.pos.y, oz + R[1] * ch - T[1] * cv / sp);
    rig.distTarget = Math.min(26, Math.max(14, (eh * 1.3 + 0.9) / th, (ev * 1.3 + 0.8) / tv));
  }
  tickGuard(dt, P) {
    const G = this.G, k = this.knight, d = dist(P.pos.x, P.pos.z, k.pos.x, k.pos.z);
    if (!this.noticed && d < 16) {
      this.noticed = true;
      if (G.companion) G.vfx?.emote?.(G.companion, '?', 1.4);
      G.hint?.('gldGuard', "*Sniff…* Someone in shiny green armour is standing guard by the hot springs. Very, very still. …Is he a statue?", false);
    }
    if (d < 5 && this.calm()) this.vow(P);
  }
  // ------------------------------------------------------------------ the tennis ball (thrown from the bathhouse)
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
      if (Math.abs(b.v.y) > 1.2) { b.v.y = -b.v.y * 0.62; b.v.x *= 0.8; b.v.z *= 0.8; sfx('ball_bounce', { pos: m.position, pitch: 1.2, vol: 0.7 }); b.bounces++; }
      else { b.v.set(b.v.x * (1 - dt * 3), 0, b.v.z * (1 - dt * 3)); if (Math.hypot(b.v.x, b.v.z) < 0.15) b.rest = true; }
    }
  }
  throwBall(to) {
    const G = this.G, W = G.world, poi = G.world.plan?.pois?.find(p => p.kind === 'feature') || BATHHOUSE;
    const from = new THREE.Vector3(poi.x + 0.6, W.heightAt(poi.x, poi.z) + 1.4, poi.z + 1.4);
    const m = this.ball = new THREE.Mesh(ballGeo(), propMat()); m.castShadow = true; m.position.copy(from); G.world.scene.add(m);
    const T = 0.85, v = new THREE.Vector3((to.x - from.x) / T, 0, (to.z - from.z) / T); v.y = (to.y + 0.1 - from.y + 0.5 * 14 * T * T) / T;
    this.ballState = { v, bounces: 0, rest: false, held: false };
    sfx('throw', { pos: from, pitch: 1.3, vol: 0.6 });
    G.ui?.float?.(from.clone().setY(from.y + 0.6), 'Fetch!', { kind: 'status', color: '#ffe6a0' });
  }
  // ------------------------------------------------------------------ the vow, and the ball
  async vow(P) {
    const G = this.G, k = this.knight, rig = G.engine.rig, sh = G.companion;
    this.state = 'vow';
    P.controlLocked = true; P.moveTarget = null; G.skills?.charge?.cancel?.('scene', true);
    Events.emit('golden:joinScene', { phase: 'vow' });
    const prevDist = rig.distTarget;
    try {
      // you walk to your mark beside him (the staging: in plain view, the spring beside you both), he turns to you
      const st = this.stg, W = G.world;
      this.beat = 'pair';
      if (sh && st) { sh.hold = { x: st.shd.x, z: st.shd.z, face: Math.atan2(k.pos.x - st.shd.x, k.pos.z - st.shd.z), gld: true }; sh.anim?.stop?.('sit'); } // (Shadow sits on his mark and watches)
      if (st) {
        P.moveTarget = new THREE.Vector3(st.aud.x, W.heightAt(st.aud.x, st.aud.z), st.aud.z);
        await this.until(() => { k.faceTo(P.pos.x, P.pos.z); return dist(P.pos.x, P.pos.z, st.aud.x, st.aud.z) < 0.3; }, 4);
        if (dist(P.pos.x, P.pos.z, st.aud.x, st.aud.z) > 0.6) P.setPos(st.aud.x, st.aud.z); // (blocked on the way: on the mark)
        P.moveTarget = null;
        if (sh?.hold?.gld) { await this.until(() => dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) < 0.4, 3); if (dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) > 1.2) sh.setPos?.(sh.hold.x, sh.hold.z); }
      }
      k.faceTo(P.pos.x, P.pos.z); P.faceTo(k.pos.x, k.pos.z);
      await this.until(() => Math.abs(Math.atan2(Math.sin(k.faceTarget - k.facing), Math.cos(k.faceTarget - k.facing))) < 0.15, 0.8);
      k.anim.play('gldSalute'); sfx('lance_whoosh', { pitch: 0.8, vol: 0.5 });
      const name = this.H.name('golden'), portrait = G.portrait?.('golden');
      await G.ui?.dialogue?.({ speaker: name, portrait, lines: ['Halt! Who approaches the springs of Yukimi?', '…A traveller. Then bear witness:', `I, ${name} of the Emberleaf Guard, do solemnly swear upon my lance to guard these springs against all—`] });
      // a tennis ball bounces out of the bathhouse, past him
      const f = k.facing, past = this.stg?.ball ? new THREE.Vector3(this.stg.ball.x, 0, this.stg.ball.z) : new THREE.Vector3(k.pos.x - Math.cos(f) * 2.6 - Math.sin(f) * 1.2, 0, k.pos.z + Math.sin(f) * 2.6 - Math.cos(f) * 1.2);
      if (!this.free(past.x, past.z)) past.set(k.pos.x + Math.cos(f) * 2.6, 0, k.pos.z - Math.sin(f) * 2.6);
      this.beat = 'fetch';
      past.y = G.world.heightAt(past.x, past.z);
      this.throwBall(past);
      await this.until(() => this.ballState?.bounces >= 1, 1.6);
      // his ears go up, his tail goes, the vow is forgotten: the lance drops and he's off after it
      k.anim.play('gldStartle'); G.vfx?.emote?.(k, '!', 1.1); sfx('golden_boof', { pos: k.pos, pitch: 1.15 });
      await this.wait(0.45);
      const gl = this.groundLance = lanceObject(); setLanceLook(gl, null); gl.holder.position.set(k.pos.x + Math.cos(k.facing) * 0.45, k.pos.y + 0.05, k.pos.z - Math.sin(k.facing) * 0.45);
      gl.holder.rotation.set(0, k.facing, Math.PI / 2 - 0.05); G.world.scene.add(gl.holder);
      k.lanceThrown = true; sfx('jav_stick', { pos: k.pos, pitch: 0.8 });
      if (sh) G.vfx?.emote?.(sh, '!', 1);
      await this.until(() => this.ballState?.rest || this.ballState?.bounces >= 3, 1.4);
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
      G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false; P.moveTarget = null; this.beat = null; this.loop = null;
      if (!this.joined) { this.state = 'off'; this.reset(); } else this.state = 'done';
    }
  }
  // ------------------------------------------------------------------ the talk, the gift, the join
  async talk(P) {
    const G = this.G, ui = G.ui, k = this.knight, me = this.H.name(), name = this.H.name('golden'), sh = G.companion;
    const portrait = G.portrait?.('golden'), say = (lines, choices) => ui.dialogue({ speaker: name, portrait, lines, choices });
    k.anim.talk = 0.8;
    const a = await say([`Ahem. ${name} of the Emberleaf Guard. I guard the springs.`, 'Mostly from snow monkeys. They do not respect the vow either.'],
      [{ text: "That ball is the bathhouse's." }, { text: 'Good catch!' }]);
    await say(a === 0 ? ['Then I shall return it. Later. With honour. …After one more throw.'] : ['Thank you! It is my best skill. After the lance. And the javelins. Mostly the ball.']);
    await say([`And you must be ${me}. Rosie's notice reached even Yukimi. The Burrow, the yokai, the very good dog.`, 'Which brings me to my second duty.']);
    // the gift: he has been guarding a dragon whelp costume for Shadow
    if (sh) {
      const m = this.stg?.shd || { x: k.pos.x + Math.sin(k.facing) * 1.1, z: k.pos.z + Math.cos(k.facing) * 1.1 };
      sh.hold = { x: m.x, z: m.z, face: Math.atan2(k.pos.x - m.x, k.pos.z - m.z), gld: true }; sh.anim?.stop?.('sit');
    }
    k.anim.talk = 0; k.anim.play('gldOffer');
    const bundle = this.bundle = new THREE.Mesh(bundleGeo(), propMat()); bundle.castShadow = true; G.world.scene.add(bundle);
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
    const c = await say(['The springs are safe. The snow monkeys and I have an understanding.', 'May I join your pack? I promise to guard it with my whole heart.'],
      [{ text: 'Welcome to the pack! ♡' }, { text: 'Only if you bring the ball.' }]);
    await say(c === 1 ? ['…I was always going to bring the ball.', 'I shall meet you at the cottage. Shadow will keep his wings for when we fight side by side.']
      : ['A knight does not wag. …It is the wind.', 'I shall meet you at the cottage. Shadow will keep his wings for when we fight side by side.']);
    k.anim.talk = 0;
    // he picks up his lance, bows, and trots off down the trail; Shadow's outfit comes off (kept for when Foosy is played)
    if (this.groundLance) { this.groundLance.holder.parent?.remove(this.groundLance.holder); this.groundLance = null; }
    k.lanceThrown = false; sfx('lance_catch', { pos: k.pos });
    k.anim.play('gldBow'); await this.until(() => k.anim.action?.name !== 'gldBow', 1.4);
    const away = new THREE.Vector3(k.pos.x - Math.sin(k.facing) * 6, 0, k.pos.z - Math.cos(k.facing) * 6);
    Events.emit('golden:joinScene', { phase: 'leave' });
    this.until(() => k.moveTo(away.x, away.z, 1 / 60, 1.2, 0.4), 2.2);
    await this.wait(1.6);
    const k0 = k; G.vfx?.poof?.(new THREE.Vector3(k.pos.x, k.pos.y + 0.4, k.pos.z), { color: '#fff6e0', n: 12, size: 0.6 }); k0.visible = false;
    await this.H.joinGolden();
    if (sh?.whelp) sh.whelp.forced = null; // (the outfit swaps back with a poof unless Foosy is the one you play)
    G.hint?.('gldWings', `*Flap flap!* I get to wear my dragon wings whenever you play ${name}. Rawr! (a very small rawr)`, false);
    Events.emit('golden:joinScene', { phase: 'done' });
    this.until(() => false, 0.6).then(() => { if (this.knight === k0) { this.state = 'off'; this.reset(); } });
  }
  // ------------------------------------------------------------------ the rumour in town
  townHint(dt) {
    const G = this.G, F = G.state.flags;
    if (this.joined || !this.H.joined('shihtzu') || F.hints?.gldRumour) return;
    if ((this.hintT = (this.hintT || 0) + dt) < 12 || G.ui?.dlg?.active || G.tutorials?.busy || G.tutorials?.cur || G.titleActive) return;
    const u = regionUnlocked(G.state, 'onsen'), where = REGIONS.onsen?.name || 'Yukimi Onsen';
    G.hint?.('gldRumour', u.ok
      ? `*Sniff sniff…* Rosie says a very polite dog in emerald armour is guarding the hot springs at ${where}, and won't let anyone in without the password. …Is the password "ball"? Let's take the Wayfarer's Post and see!`
      : `*Sniff sniff…* Rosie says a very polite dog in emerald armour is guarding the hot springs at ${where}, and won't let anyone in without the password. The Wayfarer's Post opens it: ${u.why.toLowerCase()}.`);
  }
}
