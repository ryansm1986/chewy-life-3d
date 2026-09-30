// Ambient critters for outdoor regions (docs/REGIONS.md §3.6): non-combat wildlife that wanders, hops, flies, perches,
// swims or bathes, and flees from the hero. One InstancedMesh per kind (toon material, casts a little shadow);
// behaviour runs on the CPU for a few dozen animals and freezes beyond `active` metres from the focus.
//   world.critters.add({
//     name: 'sparrow', geo,                 // merged vertex-coloured geometry: faces +z, feet at y = 0, 1 unit = 1 m
//     count: 8, habitat: 'ground' | 'air' | 'perch' | 'water' | 'bath',
//     homes: [{ x, z, r }],                 // areas they keep to (or home: { x, z, r })
//     speed: 1.2, flee: 4 (0 = friendly), hop: 0.12 (hop height while moving), size: [0.9, 1.1], idle: [1, 4],
//     side: false (crabs walk sideways), alt: [3, 6] (air), perches: [{ x, y, z }] (perch; y absolute),
//     depth: [0.15, 0.4] (water: how deep they swim), sink: 0.25 (bath: how deep they sit),
//     flap: { from: 0.05, speed: 18, amp: 0.9 } (wings: vertices with |x| > from rotate about the body axis),
//     material: { brush, rim } })
import * as THREE from 'three';
import { makeToon } from '../gfx/materials.js';
import { paint, merge, xf } from '../gfx/geom.js';
import { rand, TAU, clamp, angleDiff } from '../core/util.js';

const FLAP_PARS = /* glsl */`
attribute vec2 aFlap;   // phase, amount (0 = wings folded)
uniform vec3 uFlapK;    // from, speed, amplitude
`;
// wing flap in object space (re-derives the instanced world position, like vegToon does for batching)
const FLAP_WORLD = /* glsl */`
#ifdef USE_INSTANCING
{
  vec3 tp = transformed;
  float ax = abs(tp.x);
  float w = smoothstep(uFlapK.x, uFlapK.x + 0.12, ax) * aFlap.y;
  float ang = sin(uTime * uFlapK.y + aFlap.x) * uFlapK.z * w;
  float r = ax - uFlapK.x;
  if (r > 0.0) { tp.x = sign(tp.x) * (uFlapK.x + r * cos(ang)); tp.y += r * sin(ang); }
  cWorld = modelMatrix * instanceMatrix * vec4(tp, 1.0);
}
#endif
`;

export class Critters {
  constructor(world) { this.world = world; this.kinds = []; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); }
  add(spec) {
    const W = this.world, n = Math.max(1, spec.count ?? 6);
    const homes = spec.homes || (spec.home ? [spec.home] : [{ x: 56, z: 56, r: 30 }]);
    const flap = spec.flap;
    const geo = spec.geo.clone();
    if (flap) {
      const a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = Math.random() * TAU; a[i * 2 + 1] = spec.habitat === 'perch' ? 0 : 1; }
      geo.setAttribute('aFlap', new THREE.InstancedBufferAttribute(a, 2));
    }
    const mo = spec.material || {};
    const mat = makeToon({
      vertexColors: true, brush: mo.brush ?? 0.12, rim: mo.rim ?? 0.45, objectBrush: true, term: mo.term,
      ...(flap ? { uniforms: { uFlapK: { value: new THREE.Vector3(flap.from ?? 0.05, flap.speed ?? 18, flap.amp ?? 0.9) } }, vertexPars: FLAP_PARS, vertexWorld: FLAP_WORLD } : {}),
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = 'critter:' + (spec.name || 'x'); mesh.castShadow = spec.shadow ?? true; mesh.receiveShadow = true;
    if (mat.userData.depthMat) mesh.customDepthMaterial = mat.userData.depthMat;
    mesh.frustumCulled = false; // (they move: bounds would go stale)
    W.scene.add(mesh);
    const K = { spec, mesh, flapAttr: geo.attributes.aFlap || null, list: [], homes };
    for (let i = 0; i < n; i++) {
      const home = homes[i % homes.length];
      const c = { i, home, x: 0, z: 0, y: 0, yaw: rand(0, TAU), s: rand(...(spec.size || [0.9, 1.1])), state: 'idle', t: rand(0.2, 3), tx: 0, tz: 0, hop: rand(0, TAU), ang: rand(0, TAU), alt: rand(...(spec.alt || [3, 6])), perch: null, speed: (spec.speed ?? 1.2) * rand(0.85, 1.15), fly: 0 };
      this.spot(K, c, true);
      if (spec.habitat === 'perch' && spec.perches?.length) { c.perch = spec.perches[i % spec.perches.length]; c.x = c.perch.x; c.z = c.perch.z; c.y = c.perch.y; c.state = 'perched'; }
      K.list.push(c);
    }
    this.kinds.push(K);
    this.write(K);
    return K;
  }
  // a random spot for a critter inside its home that suits its habitat
  spot(K, c, place = false) {
    const W = this.world, sp = K.spec, h = c.home;
    for (let k = 0; k < 24; k++) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * (h.r ?? 8), x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
      const dep = W.waterAt(x, z);
      if (sp.habitat === 'water') { const [d0] = sp.depth || [0.15, 0.4]; if (dep < d0 + 0.05) continue; }
      else if (sp.habitat === 'bath') { if (dep < 0.2) continue; }
      else if (sp.habitat === 'ground' && (dep > 0.05 || !W.walkable(x, z))) continue;
      c.tx = x; c.tz = z;
      if (place) { c.x = x; c.z = z; c.y = this.yFor(K, c, x, z); }
      return true;
    }
    c.tx = h.x; c.tz = h.z; if (place) { c.x = h.x; c.z = h.z; c.y = this.yFor(K, c, h.x, h.z); }
    return false;
  }
  yFor(K, c, x, z) {
    const W = this.world, sp = K.spec, g = W.heightAt(x, z);
    if (sp.habitat === 'water') { const lvl = g + W.waterAt(x, z); const [d0, d1] = sp.depth || [0.15, 0.4]; return Math.max(g + 0.05, lvl - (d0 + (d1 - d0) * ((c.i * 0.37) % 1))); }
    if (sp.habitat === 'bath') return g + W.waterAt(x, z) - (sp.sink ?? 0.25);
    if (sp.habitat === 'air') return g + c.alt;
    return g;
  }
  update(dt, t, focus, player) {
    const act = 34 * 34;
    for (const K of this.kinds) {
      const sp = K.spec; let any = false;
      for (const c of K.list) {
        if (focus && (c.x - focus.x) ** 2 + (c.z - focus.z) ** 2 > act) continue;
        any = true; this.step(K, c, dt, t, player);
      }
      if (any) this.write(K);
    }
  }
  step(K, c, dt, t, player) {
    const W = this.world, sp = K.spec, hab = sp.habitat;
    const flee = sp.flee ?? 4;
    let px = 99999, pz = 99999, pd = 1e9;
    if (player) { px = player.x; pz = player.z; pd = Math.hypot(c.x - px, c.z - pz); }
    if (hab === 'air') { // circle the home at altitude, bobbing; bank into the turn
      const h = c.home, R = Math.max(3, (h.r ?? 8) * 0.6);
      c.ang += dt * c.speed / R * (c.i % 2 ? 1 : -1);
      const x = h.x + Math.cos(c.ang) * R * (0.8 + 0.2 * Math.sin(t * 0.3 + c.i)), z = h.z + Math.sin(c.ang) * R;
      c.yaw = Math.atan2(x - c.x, z - c.z) || c.yaw; c.x = x; c.z = z;
      c.y = W.heightAt(h.x, h.z) + c.alt + Math.sin(t * 0.8 + c.i * 1.7) * 0.4;
      c.bank = (c.i % 2 ? -1 : 1) * 0.35;
      return;
    }
    if (hab === 'perch') {
      if (c.state === 'perched') {
        c.y = c.perch.y; c.flapK = 0; c.t -= dt;
        if (c.t < 0) { c.t = rand(0.6, 2.5); c.yaw += rand(-1.2, 1.2); }
        if (pd < flee && flee > 0) { c.state = 'fly'; c.fly = rand(5, 9); c.ang = Math.atan2(c.z - pz, c.x - px); c.cx = c.x; c.cz = c.z; }
        return;
      }
      // flying off: spiral up and out, then land on another perch
      c.flapK = 1; c.fly -= dt;
      const tgt = c.fly > 0 ? null : c.perch;
      if (!tgt) { c.ang += dt * 0.9; const R = 5; const x = c.cx + Math.cos(c.ang) * R, z = c.cz + Math.sin(c.ang) * R; c.yaw = Math.atan2(x - c.x, z - c.z); c.x += (x - c.x) * Math.min(1, dt * 2); c.z += (z - c.z) * Math.min(1, dt * 2); c.y += (W.heightAt(c.x, c.z) + 4 - c.y) * Math.min(1, dt * 1.5); if (c.fly <= 0) c.perch = sp.perches[Math.floor(Math.random() * sp.perches.length)]; return; }
      const dx = tgt.x - c.x, dz = tgt.z - c.z, dy = tgt.y - c.y, d = Math.hypot(dx, dz, dy);
      if (d < 0.15) { c.x = tgt.x; c.z = tgt.z; c.y = tgt.y; c.state = 'perched'; c.t = rand(1, 3); return; }
      const v = Math.min(d, dt * 4.5); c.x += dx / d * v; c.z += dz / d * v; c.y += dy / d * v; c.yaw = Math.atan2(dx, dz);
      return;
    }
    // ground / water / bath walkers
    if (flee > 0 && pd < flee && c.state !== 'flee') { const a = Math.atan2(c.z - pz, c.x - px) + rand(-0.5, 0.5); c.tx = c.x + Math.cos(a) * rand(4, 7); c.tz = c.z + Math.sin(a) * rand(4, 7); c.state = 'flee'; c.t = 2.5; }
    if (c.state === 'idle') {
      c.t -= dt;
      if (hab === 'bath') { c.yaw += Math.sin(t * 0.3 + c.i) * dt * 0.2; c.y = this.yFor(K, c, c.x, c.z) + Math.sin(t * 1.2 + c.i) * 0.02; return; }
      if (c.t <= 0) { if (this.spot(K, c)) c.state = 'walk'; c.t = rand(...(sp.idle || [1, 4])); }
    }
    if (c.state === 'walk' || c.state === 'flee') {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      const v = c.speed * (c.state === 'flee' ? 2.4 : 1);
      if (d < 0.2 || (c.state === 'flee' && (c.t -= dt) < 0)) { c.state = 'idle'; c.t = rand(...(sp.idle || [1, 4])); }
      else {
        const nx = c.x + dx / d * Math.min(d, v * dt), nz = c.z + dz / d * Math.min(d, v * dt);
        const ok = hab === 'water' ? W.waterAt(nx, nz) > 0.1 : hab === 'bath' ? W.waterAt(nx, nz) > 0.15 : (W.walkable(nx, nz) && W.waterAt(nx, nz) < 0.05);
        if (ok) { c.x = nx; c.z = nz; } else { c.state = 'idle'; c.t = 0.3; }
        const want = Math.atan2(dx, dz) + (sp.side ? Math.PI / 2 : 0);
        c.yaw += angleDiff(c.yaw, want) * Math.min(1, dt * 8);
        c.hop += dt * v * 9;
      }
    }
    c.y = this.yFor(K, c, c.x, c.z);
    if (sp.hop && (c.state === 'walk' || c.state === 'flee')) c.y += Math.abs(Math.sin(c.hop)) * sp.hop;
    if (hab === 'water') c.y += Math.sin(t * 2 + c.i) * 0.03;
  }
  write(K) {
    const m = this._m, q = this._q, e = this._e, s = this._s, p = this._p;
    for (const c of K.list) {
      e.set(0, c.yaw, c.bank || 0); q.setFromEuler(e); s.setScalar(c.s); p.set(c.x, c.y, c.z);
      m.compose(p, q, s); K.mesh.setMatrixAt(c.i, m);
      if (K.flapAttr) K.flapAttr.array[c.i * 2 + 1] = K.spec.habitat === 'perch' ? (c.flapK ?? 0) : 1;
    }
    K.mesh.instanceMatrix.needsUpdate = true;
    if (K.flapAttr) K.flapAttr.needsUpdate = true;
  }
  dispose() { for (const K of this.kinds) { K.mesh.parent?.remove(K.mesh); K.mesh.geometry.dispose(); K.mesh.material.dispose(); K.mesh.dispose?.(); } this.kinds.length = 0; }
}

// ------------------------------------------------------------------ starter models (merged, vertex coloured, +z forward)
const sph = (r, c, p = [0, 0, 0], s = [1, 1, 1]) => { const g = new THREE.SphereGeometry(r, 8, 6); xf(g, { p, s }); return paint(g, (q, n, o) => o.set(c)); };
export const CRITTER_MODELS = {
  /** a round little songbird (sparrow / tit): body, head, beak, tail, wings (|x| > 0.05 flap) */
  bird({ body = '#a07850', belly = '#f0e2c8', head = '#8a5a3a', beak = '#f0b040', s = 1 } = {}) {
    const P = [sph(0.085, body, [0, 0.1, 0], [1, 0.9, 1.25]), sph(0.06, belly, [0, 0.085, 0.03], [0.9, 0.8, 1]), sph(0.058, head, [0, 0.17, 0.07]),
      sph(0.012, '#1a1418', [0.035, 0.18, 0.115]), sph(0.012, '#1a1418', [-0.035, 0.18, 0.115])];
    const bk = new THREE.ConeGeometry(0.018, 0.05, 5); xf(bk, { p: [0, 0.165, 0.135], r: [Math.PI / 2, 0, 0] }); P.push(paint(bk, (q, n, o) => o.set(beak)));
    const tail = new THREE.BoxGeometry(0.06, 0.012, 0.09); xf(tail, { p: [0, 0.12, -0.12], r: [-0.4, 0, 0] }); P.push(paint(tail, (q, n, o) => o.set(head)));
    for (const sx of [1, -1]) { const w = new THREE.BoxGeometry(0.16, 0.014, 0.1); xf(w, { p: [sx * 0.12, 0.12, -0.01], r: [0, 0, sx * 0.15] }); P.push(paint(w, (q, n, o) => o.set(head))); }
    const g = merge(P); if (s !== 1) g.scale(s, s, s); return g;
  },
  /** a chubby frog */
  frog({ body = '#6aba4a', belly = '#e8f0b0', s = 1 } = {}) {
    const P = [sph(0.11, body, [0, 0.08, 0], [1.1, 0.7, 1.1]), sph(0.08, belly, [0, 0.06, 0.03], [1, 0.55, 1])];
    for (const sx of [1, -1]) { P.push(sph(0.04, body, [sx * 0.06, 0.15, 0.06]), sph(0.022, '#1a1418', [sx * 0.065, 0.165, 0.09]), sph(0.045, body, [sx * 0.1, 0.03, -0.04], [1, 0.5, 1.4])); }
    const g = merge(P); if (s !== 1) g.scale(s, s, s); return g;
  },
  /** a little fish (koi / tidepool fish) */
  fish({ body = '#ff8a4a', fin = '#ffd0a0', s = 1 } = {}) {
    const b = sph(0.08, body, [0, 0, 0], [0.55, 0.6, 1.4]);
    const t = new THREE.ConeGeometry(0.06, 0.09, 4); xf(t, { p: [0, 0, -0.14], r: [-Math.PI / 2, 0, 0], s: [0.3, 1, 1] });
    const g = merge([b, paint(t, (q, n, o) => o.set(fin))]); if (s !== 1) g.scale(s, s, s); return g;
  },
  /** a crab: flat body, claws, legs (walks sideways: side: true) */
  crab({ body = '#e8583a', s = 1 } = {}) {
    const P = [sph(0.1, body, [0, 0.07, 0], [1.3, 0.55, 1])];
    for (const sx of [1, -1]) { P.push(sph(0.045, body, [sx * 0.14, 0.08, 0.08], [1.2, 0.8, 1]), sph(0.016, '#1a1418', [sx * 0.035, 0.13, 0.08])); for (let k = 0; k < 3; k++) { const l = new THREE.BoxGeometry(0.1, 0.015, 0.015); xf(l, { p: [sx * 0.14, 0.04, -0.04 + k * 0.035], r: [0, 0, sx * -0.5] }); P.push(paint(l, (q, n, o) => o.set(body))); } }
    const g = merge(P); if (s !== 1) g.scale(s, s, s); return g;
  },
  /** a butterfly / dragonfly: thin body, four wings (|x| > 0.01 flap) */
  butterfly({ body = '#3a2a30', wing = '#ffd84a', s = 1 } = {}) {
    const bd = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4); xf(bd, { p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0] });
    const P = [paint(bd, (q, n, o) => o.set(body))];
    for (const sx of [1, -1]) for (const sz of [1, -1]) { const w = new THREE.CircleGeometry(0.05, 6); xf(w, { p: [sx * 0.05, 0.3, sz * 0.02], r: [-Math.PI / 2, 0, 0], s: [1, sz > 0 ? 1 : 0.75, 1] }); P.push(paint(w, (q, n, o) => o.set(wing))); }
    const g = merge(P); if (s !== 1) g.scale(s, s, s); return g;
  },
};
