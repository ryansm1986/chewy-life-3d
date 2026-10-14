// Staging a little scene in plain view of the game camera (the heroes' arrivals in Blossom Hollow: ROADMAP Z-H3; the
// first was Foosy's at the Onsen, actors/goldenJoin.js). Three helpers:
//   SceneView   the scenery that could stand between a spot and the camera near a centre: the big merged batches cut
//               down to their triangles in a box round it and up the camera's line, above knee height, sorted into
//               half-metre strips across the screen (a ray up the camera's line stays in one strip: it meets a few
//               thousand triangles, not a few hundred thousand), plus the small meshes near the box as they are. No actors
//               (rigs, the horde), no ground, nothing see-through or off the camera's layers. Built a few milliseconds a
//               frame (prepStep) while the scene waits; screened(x, z) casts rays from an actor's middle and head up the
//               camera's line against it.
//   frameGroup  the scene's camera: everyone in the beat in frame with a margin, the group in the middle of the screen
//               (the 20° lens: the distance from the group's size on screen)
//   keepOut     a circle the villagers walk round while a scene plays there (actors/npc.js steer reads G.sceneKeepOut)
//   stageTalk   a two-actor talk's marks near the hero (a generator), frameClear the camera in the clear, faceUp the pair
import * as THREE from 'three';

const SKIP_NAME = /ground|terrain|water|grass|sky/i;
export class SceneView {
  /** c: the centre { x, z }; w: half-width across the screen; back / front: how far behind it and toward the camera;
   *  floor: the ground height its knee line is taken from (the centre's by default; lower where the ground falls away) */
  constructor(G, c, { w = 10, back = 9, front = 18, top = 13, floor = null } = {}) {
    this.G = G; this.c = { x: c.x, z: c.z }; this.w = w; this.back = back; this.front = front; this.top = top; this.floor = floor;
    this.yaw = G.engine?.rig?.yaw ?? Math.PI / 4; this.occ = null; this.job = null; this.seen = new Map();
    this.strips = Math.ceil(w * 2 / 0.5);
  }
  /** across the screen (w) and toward the camera (u) from the centre */
  U(x, z) { return (x - this.c.x) * Math.sin(this.yaw) + (z - this.c.z) * Math.cos(this.yaw); }
  W(x, z) { return (x - this.c.x) * Math.cos(this.yaw) - (z - this.c.z) * Math.sin(this.yaw); }
  /** still good for the camera as it is now (it turns in build mode) */
  get fresh() { const y = this.G.engine?.rig?.yaw ?? this.yaw; return Math.abs(Math.atan2(Math.sin(y - this.yaw), Math.cos(y - this.yaw))) < 0.05; }
  /** build a few milliseconds of it (true once ready) */
  prepStep(budget = 3) {
    if (this.occ) return true;
    const job = this.job ||= this.build(), t0 = performance.now();
    let done = false;
    while (performance.now() - t0 < budget) if (job.next().done) { this.job = null; done = true; break; }
    this.ms = (this.ms || 0) + performance.now() - t0;
    return done;
  }
  /** the whole of it now (what's left of the build, at once) */
  ready() { if (!this.occ) { const t0 = performance.now(), job = this.job || this.build(); while (!job.next().done); this.job = null; this.ms = (this.ms || 0) + performance.now() - t0; } return this.occ; }
  *build() {
    const G = this.G, W = G.world, cam = G.engine.camera, S = this.strips, half = this.w;
    const skip = new Set([G.player?.rig?.root, G.companion?.rig?.root]);
    for (const n of G.npcs || []) skip.add(n.rig?.root);
    const y0 = (this.floor ?? (W.heightAt?.(this.c.x, this.c.z) || 0)) + 0.8; // (lower than that, nothing hides a standing actor from up here)
    const inBox = v => { const u = this.U(v.x, v.z), w = this.W(v.x, v.z); return v.y > y0 && v.y < this.top && Math.abs(w) < half && u > -this.back && u < this.front; };
    const occ = { rest: [], tris: Array.from({ length: S }, () => []), meshes: [] }, list = []; let work = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), sph = new THREE.Sphere();
    const walk = o => { // (not into an actor: the pack, the villagers, the horde, a skinned rig)
      if (skip.has(o) || o.name === 'horde' || o.isBone || o.isSkinnedMesh || o.visible === false || SKIP_NAME.test(o.name || '') || o.userData?.sceneActor) return;
      if (o.isInstancedMesh && (!o.instanceMatrix?.array || !o.count)) return; // (an empty pool)
      if (o.isMesh && o.layers.test(cam.layers) && (!o.material?.transparent || /^(veg:|building)/.test(o.name || '')) && !o.userData?.lookH && o.geometry?.attributes?.position) list.push(o); // (see-through effects and glass no; the scenery's soft-edged cloth and leaves yes)
      for (const ch of o.children) walk(ch);
    };
    for (const ch of W.scene.children) walk(ch);
    yield;
    const near = sp => { const u = this.U(sp.center.x, sp.center.z), w = this.W(sp.center.x, sp.center.z); return !(Math.abs(w) > half + sp.radius || u < -this.back - sp.radius || u > this.front + sp.radius || sp.center.y + sp.radius < y0 || sp.center.y - sp.radius > this.top); };
    const ctr = new THREE.Vector3();
    const tri = (pos, idx, i, M, grow = 1) => { // (one triangle into the strips it spans across the screen, if it's in the box)
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M); b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(M); c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(M);
      if (!inBox(a) && !inBox(b) && !inBox(c)) return;
      if (grow !== 1) { ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3); a.lerp(ctr, 1 - grow); b.lerp(ctr, 1 - grow); c.lerp(ctr, 1 - grow); } // (a garland's pennants hang a hand apart: grown, so a ray can't slip between them while the string still reads across the frame)
      const wa = this.W(a.x, a.z), wb = this.W(b.x, b.z), wc = this.W(c.x, c.z);
      const s0 = Math.max(0, Math.floor((Math.min(wa, wb, wc) + half) / 0.5)), s1 = Math.min(S - 1, Math.floor((Math.max(wa, wb, wc) + half) / 0.5));
      for (let k = s0; k <= s1; k++) occ.tris[k].push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    const im = new THREE.Matrix4();
    for (const o of list) {
      const g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
      o.updateWorldMatrix(true, false);
      if (!pos?.array || (idx && !idx.array)) continue; // (its arrays let go once on the GPU: core/deck.js; nothing to test against)
      if (o.isBatchedMesh) { // (the village's batches: each instance's triangles near the box, in its own place)
        const info = o._instanceInfo || [], geos = o._geometryInfo || [], grow = /cloth/.test(o.name || '') ? 1.9 : 1;
        if (!o._matricesTexture?.image?.data) continue;
        for (let k = 0; k < info.length; k++) {
          const it = info[k]; if (!it?.active || it.visible === false) continue;
          const gi = geos[it.geometryIndex]; if (!gi || !(gi.count > 0)) continue;
          o.getMatrixAt(k, im); im.premultiply(o.matrixWorld);
          if (o.getBoundingSphereAt?.(it.geometryIndex, sph)) { sph.applyMatrix4(im); if (!near(sph)) continue; }
          for (let i = gi.start, e = gi.start + gi.count; i + 2 < e; i += 3) { if (++work % 1500 === 0) yield; tri(pos, idx, i, im, grow); }
        }
        yield; continue;
      }
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!o.isInstancedMesh) { sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); if (!near(sph)) continue; } // (only what lies near the box)
      if (o.isInstancedMesh || n < 3000) { occ.rest.push(o); continue; }
      for (let i = 0; i + 2 < n; i += 3) { if (++work % 1500 === 0) yield; tri(pos, idx, i, o.matrixWorld); } // (a few ms of triangles a frame)
      yield;
    }
    occ.n = occ.tris.reduce((t, l) => t + l.length / 9, 0);
    this.occ = occ;
  }
  /** the strip's own little mesh, made on first use */
  strip(x, z) {
    const occ = this.occ, k = Math.floor((this.W(x, z) + this.w) / 0.5); if (!occ || k < 0 || k >= this.strips) return null;
    if (occ.meshes[k] === undefined) {
      const t = occ.tris[k]; occ.meshes[k] = null;
      if (t.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(t, 3)); g.computeBoundingSphere(); const m = occ.meshes[k] = new THREE.Mesh(g, this._mat ||= new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.updateMatrixWorld(); }
    }
    return occ.meshes[k];
  }
  /** is the spot inside what this view covers? */
  covers(x, z) { const u = this.U(x, z), w = this.W(x, z); return Math.abs(w) < this.w - 1 && u > -this.back + 1 && u < this.front - 4; }
  /** would something (a roof, a tree, the bunting, a lantern post) stand between (x, z) and the game camera? Rays from
   *  there up the camera's line (hs: the heights, an actor's middle and head) against the scenery near the centre */
  /** the answer screened() has already worked out for a spot (undefined: not yet) */
  known(x, z, hs = [0.3, 0.7, 1.05, 1.4], r = 0.2, cam = null) { return this.seen.get(this.key(x, z, hs, r, cam)); }
  key(x, z, hs, r, cam) { return `${Math.round(x * 4)},${Math.round(z * 4)},${hs.join()},${r}${cam ? `,${Math.round(cam.x * 2)},${Math.round(cam.y * 2)},${Math.round(cam.z * 2)}` : ''}`; }
  screened(x, z, hs = [0.3, 0.7, 1.05, 1.4], r = 0.2, cam = null) {
    const G = this.G, W = G.world, rig = G.engine?.rig; if (!rig) return false;
    const key = this.key(x, z, hs, r, cam); if (this.seen.has(key)) return this.seen.get(key);
    this.ready();
    const dir = (this._d ||= new THREE.Vector3()).set(Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch));
    const rx = Math.cos(rig.yaw), rz = -Math.sin(rig.yaw), rc = this._rc ||= new THREE.Raycaster(), o = this._o ||= new THREE.Vector3();
    let hit = false;
    // (a body is wide, and a garland's pennants hang a hand apart: rays across it, left, middle and right, at each height;
    //  toward where the camera will be (cam), else up its line; the strips either side too, for the perspective's drift)
    outer: for (const dw of r ? [0, -r, r, -r / 2, r / 2] : [0]) {
      const px = x + rx * dw, pz = z + rz * dw, y0 = W.heightAt?.(x, z) || 0, list = [...this.occ.rest];
      for (const d of [0, -0.5, 0.5]) { const m = this.strip(px + rx * d, pz + rz * d); if (m && !list.includes(m)) list.push(m); }
      for (const dy of hs) {
        o.set(px, y0 + dy, pz);
        rc.set(o, cam ? this._d2 = (this._d2 || new THREE.Vector3()).subVectors(cam, o).normalize() : dir); rc.near = 0.3; rc.far = cam ? Math.max(1, o.distanceTo(cam) - 1) : 30;
        let n = 0; try { n = rc.intersectObjects(list, false).length; } catch (e) { n = 0; } // (a pool emptied since: never a reason to fail a scene)
        if (n) { hit = true; break outer; }
      }
    }
    this.seen.set(key, hit); return hit;
  }
  dispose() { for (const m of this.occ?.meshes || []) m?.geometry.dispose(); this._mat?.dispose(); this.occ = null; this.job = null; this.seen.clear(); }
}

/** the camera's ground axes for a yaw: toward it (T) and the screen's right (R) */
export function camAxes(G) { const y = G.engine?.rig?.yaw ?? Math.PI / 4; return { T: [Math.sin(y), Math.cos(y)], R: [Math.cos(y), -Math.sin(y)] }; }

/** The scene's camera for a group: pts = [[x, z, y0, y1], …] (each actor's foot and head heights) in frame with a margin,
 *  the group in the middle of the screen; the distance from the group's size on screen (the 20° lens), min–max m →
 *  { focus: { x, y, z }, dist } */
export function frameFor(G, pts, { min = 13, max = 24, y = null, band = viewBand(G) } = {}) {
  const rig = G.engine?.rig, cam = G.engine?.camera; if (!rig || !cam || !pts.length) return null;
  const { T, R } = camAxes(G), sp = Math.sin(rig.pitch), cp = Math.cos(rig.pitch);
  const tv = Math.tan((cam.fov || 20) * Math.PI / 360), th = tv * (cam.aspect || 16 / 9);
  const bh = Math.max(0.3, band[1] - band[0]), bc = (band[0] + band[1]) / 2; // (the part of the screen the scene has: under the HUD's top, above the dialogue box)
  const ox = pts.reduce((a, p) => a + p[0], 0) / pts.length, oz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let h0 = 1e9, h1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const [x, z, y0, y1] of pts) {
    const h = (x - ox) * R[0] + (z - oz) * R[1], u = (x - ox) * T[0] + (z - oz) * T[1];
    h0 = Math.min(h0, h - 0.4); h1 = Math.max(h1, h + 0.4);
    v0 = Math.min(v0, -u * sp + (y0 - 0.6) * cp); v1 = Math.max(v1, -u * sp + (y1 - 0.6) * cp);
  }
  const ch = (h0 + h1) / 2, cv = (v0 + v1) / 2, eh = (h1 - h0) / 2, ev = (v1 - v0) / 2;
  const dist = Math.min(max, Math.max(min, (eh * 1.2 + 0.7) / th, (ev * 1.15 + 0.45) / (tv * bh)));
  const lift = (0.5 - bc) * 2 * dist * tv / sp; // (the screen's middle a little below the group: it sits in the middle of its band)
  return { focus: { x: ox + R[0] * ch - T[0] * cv / sp + T[0] * lift, y: y ?? G.player?.pos.y ?? 0, z: oz + R[1] * ch - T[1] * cv / sp + T[1] * lift }, dist };
}
/** the band of the screen (0 = top, 1 = bottom) a scene keeps its actors in: under the HUD's top row, above the dialogue
 *  box (measured when it's up, else where it will be: a phone's is taller) */
export function viewBand(G) {
  const H = innerHeight || 1, phone = !!G.ui?.root?.classList?.contains('m-phone'), box = document.querySelector('.dlg.on .dlg-box, .dlg.show .dlg-box, .dlg-box');
  const r = box?.getBoundingClientRect?.(), up = r && r.height > 20 && r.top > H * 0.3 && G.ui?.dlg?.active;
  const bottom = up ? r.top / H - 0.03 : phone ? 0.62 : 0.8, top = phone ? 0.09 : 0.1;
  return [top, Math.max(top + 0.3, bottom)];
}
/** where the game camera will sit for a framing (game.js follows G.introFocus 0.6 m up; the rig's bias and pitch) */
export function camAt(G, fr, out = new THREE.Vector3()) {
  const rig = G.engine?.rig; if (!rig || !fr) return null;
  const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch), b = rig.biasTarget || rig.bias || { x: 0, y: 0, z: 0 }, d = fr.dist + (rig.distBiasTarget ?? rig.distBias ?? 0);
  return out.set(fr.focus.x + b.x + Math.sin(rig.yaw) * cp * d, fr.focus.y + 0.6 + b.y + sp * d, fr.focus.z + b.z + Math.cos(rig.yaw) * cp * d);
}
/** frame the group now (frameFor): sets G.introFocus (game.js follows it) and the rig's distTarget */
export function frameGroup(G, pts, o = {}) {
  const fr = frameFor(G, pts, o); if (!fr) return null;
  const f = G.introFocus ||= new THREE.Vector3();
  f.set(fr.focus.x, fr.focus.y, fr.focus.z); G.engine.rig.distTarget = fr.dist;
  return fr;
}

/** paved ground (the plaza, a path, a square: where a scene's actors stand with their feet in view, not in knee-high
 *  grass); in a world without tiles, anywhere counts */
export function paved(G, x, z) { const t = G.world?.terrain?.tile?.(x, z); return t == null || t === 1 || t === 2 || t === 4; } // (layout.js T: PATH, PLAZA; SAND, the beach)
/** well onto the paving (or the sand): the spot and four around it r m off (the grass along a path's edge leans over it) */
export function onPaving(G, x, z, r = 0.6) { return paved(G, x, z) && paved(G, x + r, z) && paved(G, x - r, z) && paved(G, x, z + r) && paved(G, x, z - r); }
/** the ground cost of standing somewhere for a scene: 0 well onto the paving, a little at its edge, more in the grass */
export const groundCost = (G, x, z, w = 2.6) => (onPaving(G, x, z) ? 0 : paved(G, x, z) ? w * 0.5 : w);
/** villagers walk round a circle while a scene plays there (null clears it) */
export function keepOut(G, c = null, r = 3.5) { G.sceneKeepOut = c ? { x: c.x, z: c.z, r } : null; }
/** the villagers out and about within r of a spot */
export function villagersNear(G, x, z, r) { let n = 0; for (const v of G.npcs || []) if (v.visible !== false && v.pos && Math.hypot(v.pos.x - x, v.pos.z - z) < r) n++; return n; }

// ------------------------------------------------------------------ a two-actor talk, staged (Poe's, Floofy's, Kaizo's)
/** the heights a standing body is tested at, and a sitting pup's, and the gap between two talkers' */
export const BODY = [0.25, 0.55, 0.85, 1.15, 1.45], PUP = [0.15, 0.35, 0.55, 0.75], GAP = [0.5, 0.9, 1.3, 1.7];
/** The marks for a talk near the hero, as a search a few candidates at a time (a generator: run it while something else
 *  plays, a sneeze, a walk): yours (where you stand, or a few steps away, on paving if it can be), theirs `gap` m across
 *  the screen and `ups` toward the camera (negative: a little up-screen, so facing you they half face the camera), and
 *  Shadow's just behind you both, between you, his face to the camera. The cheap scores first (how far you'd step, their
 *  side, the villagers, the ground), then rays toward where the scene's camera will be, best first, until one is clear.
 *  o = { view, free(x, z), other: {x, z} (where they are now), gap, ups, rings, tall: [your top, theirs], frame: {min, max},
 *        near: {x, z, w} (a spot to keep close to), anchor: {x, z} (they stay there, near enough: you come to them),
 *        shadow(me, them, side, at): Shadow's mark (else behind you both, between you) }
 *  → { me, other, mid, shd, s, moved, fallback, cam } */
export function* stageTalk(G, P, o) {
  const { view, free, other } = o, gap = o.gap ?? 2.3, ups = o.ups || [-0.4, -0.1, -0.7], tall = o.tall || [1.45, 1.3], fo = o.frame || { min: 12, max: 17 };
  const { T, R } = camAxes(G), V = view?.occ && view.covers(P.pos.x, P.pos.z) ? view : null;
  const at = (p, side, t) => ({ x: p.x + R[0] * side + T[0] * t, z: p.z + R[1] * side + T[1] * t });
  const side0 = Math.sign((other.x - P.pos.x) * R[0] + (other.z - P.pos.z) * R[1]) || 1, t0 = ups[0];
  const cands = [];
  const add = (me, th, cost, side, t) => {
    const mid = { x: (me.x + th.x) / 2, z: (me.z + th.z) / 2 }, shd = o.shadow ? o.shadow(me, th, side, at) : at(mid, 0, -1.1);
    // (on paving if it can be: knee-high grass swallows feet and legs from up here)
    const s = cost + (side === side0 ? 0 : 0.6) + Math.abs(t - t0) + villagersNear(G, mid.x, mid.z, 3) * 2.5 + (free(shd.x, shd.z) ? 0 : 4)
      + groundCost(G, me.x, me.z) + groundCost(G, th.x, th.z) + groundCost(G, shd.x, shd.z, 1)
      + (o.near ? Math.hypot(mid.x - o.near.x, mid.z - o.near.z) * (o.near.w ?? 0.2) : 0); // (near a spot that matters)
    cands.push({ me, other: th, mid, shd, s, moved: Math.hypot(me.x - P.pos.x, me.z - P.pos.z) > 0.1 });
  };
  if (o.anchor) { // (they stay where they are, a step either way at most: Floofy among his lanterns; you come to your mark)
    const A = o.anchor;
    for (const [ds, dt] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
      const th = at(A, ds, dt); if (!free(th.x, th.z)) continue;
      for (const side of [side0, -side0]) for (const t of ups) {
        const me = at(th, -side * gap, -t); if (!free(me.x, me.z)) continue;
        add(me, th, Math.hypot(ds, dt) * 1.2 + Math.hypot(me.x - P.pos.x, me.z - P.pos.z) * 0.1, side, t);
      }
    }
  } else {
    const steps = [[0, 0]];
    for (const r of o.rings || [0.9, 1.8, 2.7, 3.6, 4.5]) for (let k = 0; k < 8; k++) steps.push([Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r]); // (further out: the paving nearby, when you were in the grass)
    for (const [ds, dt] of steps) {
      const me = at(P.pos, ds, dt); if (!free(me.x, me.z)) continue;
      for (const side of [side0, -side0]) for (const t of ups) {
        const th = at(me, side * gap, t); if (!free(th.x, th.z)) continue;
        add(me, th, Math.hypot(ds, dt) * 0.7 + Math.hypot(other.x - th.x, other.z - th.z) * 0.04, side, t);
      }
    }
  }
  cands.sort((a, b) => a.s - b.s);
  let best = null, n = 0;
  for (const c of cands) {
    if (best && c.s >= best.s) break; // (nothing after can beat it)
    if (V) {
      const cam = camAt(G, frameFor(G, [[c.me.x, c.me.z, 0, tall[0]], [c.other.x, c.other.z, 0, tall[1]], [c.shd.x, c.shd.z, 0, 0.8]], fo)); c.cam = cam.clone();
      // (you two must be in the clear, with a margin all round: the camera settles a little off, and you may stop a hand
      //  short of your mark; Shadow on his mark and the gap between you, a lantern rope across the frame, cost)
      if (V.screened(c.me.x, c.me.z, BODY, 0.32, cam) || V.screened(c.other.x, c.other.z, BODY, 0.32, cam)) continue;
      c.s += (V.screened(c.shd.x, c.shd.z, PUP, 0.2, cam) ? 4 : 0) + (V.screened(c.mid.x, c.mid.z, GAP, 0.3, cam) ? 3 : 0);
      if (++n % 6 === 0) yield;
    }
    if (!best || c.s < best.s) best = c;
  }
  if (best) return best;
  if (o.anchor) { const th = { x: o.anchor.x, z: o.anchor.z }, me = at(th, -side0 * gap, -t0), mid = { x: (me.x + th.x) / 2, z: (me.z + th.z) / 2 }; return { me, other: th, mid, shd: o.shadow ? o.shadow(me, th, side0, at) : at(mid, 0, -1.1), moved: true, fallback: true }; } // (you go up to them)
  const th = { x: P.pos.x + (other.x - P.pos.x) * 0.55, z: P.pos.z + (other.z - P.pos.z) * 0.55 }, mid = { x: (P.pos.x + th.x) / 2, z: (P.pos.z + th.z) / 2 }; // (nowhere better: they come up to you)
  return { me: { x: P.pos.x, z: P.pos.z }, other: th, mid, shd: at(mid, 0, -1.1), moved: false, fallback: true };
}
/** run a staging search to its end now */
export const finish = job => { let r; do r = job.next(); while (!r.done); return r.value; };
/** The scene's camera where everyone stands now, in the clear: the framing (frameFor), or, if a lantern post or a garland
 *  would cross someone from there, the nearest of a few others (a step closer or further, a little to either side) that
 *  leaves them in plain view (rays toward where each would put the camera). bodies: [{x, z}] (standing); pups: [{x, z}]
 *  (sitting, Shadow) → the framing used; G.introFocus and the rig's distTarget are set */
export function frameClear(G, V, pts, bodies, pups = [], o = { min: 12, max: 17 }) {
  const base = frameFor(G, pts, o); if (!base) return null;
  let pick = base;
  if (V?.occ && bodies[0] && V.covers(bodies[0].x, bodies[0].z)) {
    const { R } = camAxes(G), cam = new THREE.Vector3();
    const clear = fr => { camAt(G, fr, cam); return bodies.every(b => !V.screened(b.x, b.z, BODY, 0.25, cam)) && pups.every(p => !V.screened(p.x, p.z, PUP.slice(0, 3), 0.15, cam)); };
    pick = null;
    for (const dd of [0, 1.2, 2.4, -0.8, 3.6]) for (const sx of [0, 0.6, -0.6, 1.2, -1.2]) {
      const fr = { focus: { x: base.focus.x + R[0] * sx, y: base.focus.y, z: base.focus.z + R[1] * sx }, dist: Math.max(11, base.dist + dd) };
      if (clear(fr)) { pick = fr; break; }
    }
    pick ||= base; pick.moved = pick !== base;
  }
  const f = G.introFocus ||= new THREE.Vector3(); f.set(pick.focus.x, pick.focus.y, pick.focus.z); G.engine.rig.distTarget = pick.dist;
  return pick;
}
/** Shadow on his mark for a scene (sh.hold): still far from it once everyone else is on theirs (stuck behind something, or
 *  in the shallows), he squeezes through to it (as he does when he leads the way) */
export function shadowOnMark(sh) { const h = sh?.hold; if (h && Math.hypot(sh.pos.x - h.x, sh.pos.z - h.z) > 1.2) sh.setPos?.(h.x, h.z); }
/** a and b face each other, each turned a little toward the camera (so the faces read from up here): k = [a's, b's] */
export function faceUp(G, a, b, k = [0.42, 0.3]) {
  const { T } = camAxes(G), cam = Math.atan2(T[0], T[1]), turn = (x, y, w) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * w;
  a.faceTo(b.pos.x, b.pos.z); a.faceTarget = turn(a.faceTarget, cam, k[0]);
  b.faceTo(a.pos.x, a.pos.z); b.faceTarget = turn(b.faceTarget, cam, k[1]);
}
