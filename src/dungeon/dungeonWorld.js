// Renders a generated burrow floor: masked painterly floor, chunky rock walls, themed props & light sources.
import * as THREE from 'three';
import { CELL, THEMES } from './gen.js';
import { makeToon, makeGlow, U } from '../gfx/materials.js';
import { paint, merge, puff, xf, RoundedBox, tube, mergeVertices } from '../gfx/geom.js';
import { glowTexture, shaftTexture } from '../gfx/textures.js';
import { LightPool } from '../core/engine.js';
import { Collision } from '../world/collision.js';
import { Noise, mulberry32, clamp, rand, TAU } from '../core/util.js';

const C = h => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class DungeonWorld {
  constructor(engine, layout) {
    this.engine = engine; this.L = layout;
    const T = this.theme = THEMES[layout.theme];
    const scene = this.scene = new THREE.Scene();
    scene.background = C(T.fog);
    scene.fog = new THREE.Fog(T.fog, 38, 70);
    this.hemi = new THREE.HemisphereLight(T.ambient[0], T.ambient[1], 1.35); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight('#d8d0ff', 1.25);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sunDir = V(0.35, 1, 0.55).normalize();
    this.lightPool = new LightPool(scene, 8);
    this.collision = new Collision(4);
    this.collision.blockFn = (x, z) => !this.walkable(x, z);
    this.interactables = [];
    this.rng = mulberry32(layout.floor * 31 + 7);
    this.noise = new Noise(layout.floor + 5);
    this.buildFloor(); this.buildWalls(); this.buildProps(); this.buildLights(); this.buildShafts(); this.buildCenterpieces();
  }
  cellToWorld(x, y) { return V((x + 0.5) * CELL, 0, (y + 0.5) * CELL); }
  worldToCell(x, z) { return [Math.floor(x / CELL), Math.floor(z / CELL)]; }
  heightAt() { return 0; }
  walkable(x, z) {
    const [cx, cy] = this.worldToCell(x, z);
    if (!this.L.at(cx, cy)) return false;
    // keep a margin from wall cells so bodies don't clip into rocks
    const fx = x / CELL - cx, fy = z / CELL - cy, m = 0.22;
    if (fx < m && !this.L.at(cx - 1, cy)) return false;
    if (fx > 1 - m && !this.L.at(cx + 1, cy)) return false;
    if (fy < m && !this.L.at(cx, cy - 1)) return false;
    if (fy > 1 - m && !this.L.at(cx, cy + 1)) return false;
    return true;
  }
  buildFloor() {
    const { W, H, grid } = this.L, T = this.theme;
    // mask texture (1 = floor) with bilinear filtering -> soft organic edges
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { data[i * 4] = grid[i] ? 255 : 0; data[i * 4 + 3] = 255; }
    const mask = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); mask.magFilter = mask.minFilter = THREE.LinearFilter; mask.needsUpdate = true;
    this.mask = mask;
    const size = W * CELL;
    const g = new THREE.PlaneGeometry(size, size, 1, 1); g.rotateX(-Math.PI / 2); g.translate(size / 2, 0, size / 2);
    const themeId = { burrow: 0, crystal: 1, shrine: 2, kitchen: 3 }[this.L.theme];
    const mat = makeToon({
      brush: 0.2, brushScale: 0.25, rim: 0, shadowSat: 0.5,
      uniforms: { uMask: { value: mask }, uSize: { value: size }, uF0: { value: C(T.floor[0]) }, uF1: { value: C(T.floor[1]) }, uF2: { value: C(T.floor[2]) }, uVoid: { value: C(T.fog) }, uTheme: { value: themeId }, uAccent: { value: C(T.accent) } },
      fragPars: /* glsl */`
        uniform sampler2D uMask; uniform float uSize; uniform vec3 uF0, uF1, uF2, uVoid, uAccent; uniform float uTheme;
        vec2 dH(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
        float cellEdge(vec2 x){ vec2 n=floor(x), f=fract(x); float m1=8.0,m2=8.0; for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j); vec2 r=g+dH(n+g)*0.8+0.1-f; float d=dot(r,r); if(d<m1){m2=m1;m1=d;} else if(d<m2) m2=d; } return sqrt(m2)-sqrt(m1); }
        float fGlow;
      `,
      fragColor: /* glsl */`
        {
          vec2 p = vCWorld.xz;
          float m = texture2D(uMask, p / uSize).r;
          float n1 = texture2D(uBrush, p * 0.05).g, n2 = texture2D(uBrush, p * 0.13).r;
          vec3 c = mix(uF1, uF0, smoothstep(0.35, 0.65, n1));
          c = mix(c, uF2, smoothstep(0.55, 0.8, n2) * 0.6);
          fGlow = 0.0;
          if (uTheme < 0.5) { // earthy burrow: pebbles + grass patches
            float pe = smoothstep(0.03, 0.0, cellEdge(p * 1.6)) ;
            c = mix(c, c * 0.82, pe * 0.5);
            c = mix(c, vec3(0.45, 0.62, 0.32), smoothstep(0.62, 0.72, n1) * 0.55);
          } else if (uTheme < 1.5) { // crystal: hex-ish stone tiles
            float e = cellEdge(p * 0.7);
            c = mix(c * 0.72, c, smoothstep(0.02, 0.08, e));
            fGlow = smoothstep(0.03, 0.0, e) * smoothstep(0.6, 0.75, n1);
          } else if (uTheme < 2.5) { // shrine: wooden planks
            float pl = fract(p.x * 0.8);
            float seam = smoothstep(0.0, 0.05, pl) * smoothstep(1.0, 0.95, pl);
            float grain = sin(p.y * 3.0 + n2 * 6.0) * 0.5 + 0.5;
            c = mix(c * 0.7, c * (0.92 + grain * 0.12), seam);
          } else { // kitchen: stone with glowing cracks
            float e = cellEdge(p * 0.9);
            c = mix(c * 0.65, c, smoothstep(0.02, 0.07, e));
            fGlow = smoothstep(0.04, 0.0, e) * smoothstep(0.5, 0.7, n1);
          }
          // soft falloff into the void at floor edges
          c = mix(uVoid * 0.6, c, smoothstep(0.2, 0.62, m));
          diffuseColor.rgb = c;
        }
      `,
      fragOut: 'outgoingLight += uAccent * fGlow * 1.6;',
    });
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; this.scene.add(m);
    this.floorMesh = m;
  }
  buildWalls() {
    const { W, H, at } = this.L, T = this.theme;
    const parts = [];
    const r = this.rng, N = this.noise;
    const wc = T.wall.map(C), tc = T.top.map(C);
    const isEdge = (x, y) => !at(x, y) && (at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1) || at(x + 1, y + 1) || at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1));
    const chunk = (cx, cz, s, h, k) => {
      // an organic rock pillar: 2-3 stacked noisy lumps, mossy/crystal cap on top
      const lumps = [];
      const n = h > 3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const t = i / n, rr = s * (0.62 - t * 0.12) * (0.9 + r() * 0.2);
        let g = new THREE.IcosahedronGeometry(1, 2);
        g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
        const pos = g.attributes.position;
        for (let j = 0; j < pos.count; j++) {
          const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
          const nn = N.n2((x + cx) * 1.3 + i * 5, (z + cz) * 1.3 + y * 1.7) * 0.22 + N.n2((x - cz) * 3.1, (y + cx) * 3.1) * 0.08;
          pos.setXYZ(j, x * rr * (1 + nn), y * (h / n) * 0.62 * (1 + nn * 0.6), z * rr * (1 + nn));
        }
        g.computeVertexNormals();
        g.translate(cx + (r() - 0.5) * 0.25, (t + 0.5 / n) * h * 0.92, cz + (r() - 0.5) * 0.25);
        lumps.push(g);
      }
      const base = wc[k % 3];
      const top = tc[(k + 1) % 3];
      return paint(merge(lumps), (p, nrm, o) => {
        o.copy(base).lerp(wc[(k + 1) % 3], clamp(N.n2(p.x * 0.6, p.y * 0.9) * 0.5 + 0.5));
        const up = clamp((nrm.y - 0.35) * 2.2) * clamp((p.y - h * 0.45) / (h * 0.4));
        o.lerp(top, up);
        o.multiplyScalar(0.72 + 0.28 * clamp(p.y / h));
      });
    };
    let k = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isEdge(x, y)) continue;
      const wp = this.cellToWorld(x, y);
      const h = 2.0 + r() * 1.2 + (N.n2(x * 0.2, y * 0.2) * 0.5 + 0.5) * 1.4;
      parts.push(chunk(wp.x + (r() - 0.5) * 0.3, wp.z + (r() - 0.5) * 0.3, CELL * (0.95 + r() * 0.2), h, k++));
      this.collision.addRect(wp.x - CELL / 2, wp.z - CELL / 2, wp.x + CELL / 2, wp.z + CELL / 2, 'wall');
      if (r() < 0.3) parts.push(chunk(wp.x + (r() - 0.5) * 0.9, wp.z + (r() - 0.5) * 0.9, CELL * 0.55, h * 0.55 + r() * 0.8, k++));
    }
    // batch into a few meshes (keeps per-mesh vertex counts reasonable)
    const mat = makeToon({ vertexColors: true, brush: 0.28, brushScale: 0.6, rim: 0.3, occluder: true, term: [-0.05, 0.35] });
    for (let i = 0; i < parts.length; i += 120) {
      const m = new THREE.Mesh(merge(parts.slice(i, i + 120)), mat); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    }
  }
  buildProps() {
    const T = this.theme, th = this.L.theme, r = this.rng;
    const glowParts = [], solidParts = [];
    const glowSprites = [];
    const mushroom = (x, z, s, cap) => {
      const stem = new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.3 * s, 8); stem.translate(x, 0.15 * s, z); paint(stem, (p, n, o) => o.set('#fff4e0'));
      const c = new THREE.SphereGeometry(0.16 * s, 12, 8, 0, TAU, 0, Math.PI / 2); c.scale(1, 0.7, 1); c.translate(x, 0.28 * s, z);
      paint(c, (p, n, o) => { o.set(cap); if (Math.sin(p.x * 60) * Math.sin(p.z * 60) > 0.6) o.set('#ffffff'); });
      return [stem, c];
    };
    const crystal = (x, z, s, col) => {
      const out = [];
      for (let i = 0; i < 4; i++) {
        const g = new THREE.OctahedronGeometry(0.22 * s, 0); g.scale(0.6, 2.2 + r(), 0.6);
        g.rotateZ((r() - 0.5) * 0.8); g.rotateX((r() - 0.5) * 0.8); g.translate(x + (r() - 0.5) * 0.4 * s, 0.35 * s, z + (r() - 0.5) * 0.4 * s);
        out.push(paint(g, (p, n, o) => o.set(col).lerp(C('#ffffff'), clamp(n.y * 0.5))));
      }
      return out;
    };
    for (const p of this.L.props) {
      const wp = this.cellToWorld(p.x, p.y);
      const x = wp.x + (r() - 0.5) * 1.2, z = wp.z + (r() - 0.5) * 1.2;
      if (th === 'burrow') {
        if (p.r < 0.45) { const col = r() < 0.6 ? '#7ad0ff' : '#ff9ad0'; glowParts.push(...mushroom(x, z, 1 + r(), col), ...mushroom(x + 0.25, z + 0.1, 0.7, col)); glowSprites.push({ x, y: 0.35, z, c: col, s: 1.2 }); }
        else if (p.r < 0.75) solidParts.push(paint(puff(V(x, 0.1, z), 0.3 + r() * 0.25, { detail: 1, noise: 0.3, squash: 0.6, seed: p.x * 7 + p.y }), (q, n, o) => o.set(T.wall[1]).lerp(C(T.top[0]), clamp(n.y))));
        else for (let i = 0; i < 5; i++) { const a = r() * TAU; const g = tube([{ p: V(x, 0, z), r: 0.03 }, { p: V(x + Math.cos(a) * 0.15, 0.25, z + Math.sin(a) * 0.15), r: 0.02 }, { p: V(x + Math.cos(a) * 0.2, 0.4, z + Math.sin(a) * 0.2), r: 0.005 }], 3); solidParts.push(paint(g, (q, n, o) => o.set('#7ab45a'))); }
      } else if (th === 'crystal') {
        if (p.r < 0.5) { const col = r() < 0.5 ? '#ff8ae0' : '#7af0ff'; glowParts.push(...crystal(x, z, 1 + r() * 0.8, col)); glowSprites.push({ x, y: 0.5, z, c: col, s: 1.6 }); }
        else solidParts.push(paint(puff(V(x, 0.1, z), 0.3 + r() * 0.3, { detail: 1, noise: 0.35, squash: 0.7, seed: p.x + p.y * 3 }), (q, n, o) => o.set(T.wall[0]).lerp(C(T.top[1]), clamp(n.y))));
      } else if (th === 'shrine') {
        if (p.r < 0.3) { // paper lantern on a post
          const post = new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6); post.translate(x, 0.6, z); paint(post, (q, n, o) => o.set('#4a3030'));
          const l = new THREE.SphereGeometry(0.18, 12, 10); l.scale(1, 1.25, 1); l.translate(x, 1.2, z);
          solidParts.push(post); glowParts.push(paint(l, (q, n, o) => { o.set('#ff6a4a'); if (Math.abs(q.y - 1.2) > 0.15) o.set('#3a2020'); }));
          glowSprites.push({ x, y: 1.2, z, c: '#ff8a5a', s: 1.8 });
        } else if (p.r < 0.6) { // talisman strips
          const g = new THREE.BoxGeometry(0.12, 0.4, 0.01); g.translate(x, 0.6 + r() * 0.8, z); paint(g, (q, n, o) => o.set('#fff4d8')); solidParts.push(g);
        } else solidParts.push(paint(puff(V(x, 0.08, z), 0.25, { detail: 1, noise: 0.3, squash: 0.6, seed: p.x }), (q, n, o) => o.set('#8a8a94')));
      } else { // kitchen
        if (p.r < 0.4) { const pot = new THREE.SphereGeometry(0.3, 12, 10); pot.scale(1, 0.85, 1); pot.translate(x, 0.28, z); solidParts.push(paint(pot, (q, n, o) => { o.set(r() < 0.5 ? '#6a4a3a' : '#8a5a3a'); if (q.y > 0.42) o.set('#3a2a24'); })); }
        else if (p.r < 0.6) { glowSprites.push({ x, y: 0.2, z, c: '#ff7a2a', s: 1.4 }); const e = new THREE.SphereGeometry(0.2, 8, 6); e.scale(1.4, 0.3, 1); e.translate(x, 0.02, z); glowParts.push(paint(e, (q, n, o) => o.set('#ff8a3a'))); }
        else solidParts.push(paint(puff(V(x, 0.08, z), 0.3, { detail: 1, noise: 0.3, squash: 0.6, seed: p.y }), (q, n, o) => o.set(T.wall[1])));
      }
    }
    if (solidParts.length) { const m = new THREE.Mesh(merge(solidParts), makeToon({ vertexColors: true, brush: 0.2, rim: 0.35 })); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
    if (glowParts.length) { const m = new THREE.Mesh(merge(glowParts), makeToon({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.0, rim: 0.6, uniforms: {}, fragOut: 'outgoingLight += diffuseColor.rgb * 1.35;' })); m.castShadow = false; this.scene.add(m); }
    // soft glow billboards
    const gtex = glowTexture();
    for (const s of glowSprites) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, color: C(s.c), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      sp.position.set(s.x, s.y, s.z); sp.scale.setScalar(s.s); sp.renderOrder = 8; this.scene.add(sp);
    }
    this.glowSprites = glowSprites;
  }
  buildLights() {
    const T = this.theme;
    for (const l of this.L.lights) {
      const wp = this.cellToWorld(l.x, l.y);
      this.lightPool.addSource({ pos: V(wp.x, 1.5, wp.z), color: C(T.light), intensity: 12, radius: 11, flicker: 1 });
      // brazier / lantern visual
      const g = new THREE.CylinderGeometry(0.16, 0.22, 0.9, 8); g.translate(0, 0.45, 0);
      const bowl = new THREE.SphereGeometry(0.28, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2); bowl.translate(0, 1.0, 0);
      const mesh = new THREE.Mesh(merge([paint(g, (p, n, o) => o.set('#4a3a3a')), paint(bowl, (p, n, o) => o.set('#6a5048'))]), makeToon({ vertexColors: true, rim: 0.3 }));
      mesh.position.set(wp.x, 0, wp.z); mesh.castShadow = true; this.scene.add(mesh);
      this.collision.addCircle(wp.x, wp.z, 0.3);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: C(T.light), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      flame.position.set(wp.x, 1.25, wp.z); flame.scale.setScalar(1.4); this.scene.add(flame);
      (this.flames ||= []).push({ s: flame, p: flame.position.clone(), ph: Math.random() * 10 });
    }
  }
  buildShafts() {
    const { rooms } = this.L;
    const tex = shaftTexture();
    this.shafts = [];
    for (const r of rooms) {
      if (this.rng() < 0.45) continue;
      const wp = this.cellToWorld(r.cx + Math.floor((this.rng() - 0.5) * r.w * 0.5), r.cy + Math.floor((this.rng() - 0.5) * r.h * 0.5));
      const col = C(this.theme.accent).lerp(C('#ffffff'), 0.55);
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + this.rng() * 1.4, 11), new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
        m.geometry.translate(0, 5.5, 0);
        m.position.set(wp.x + (this.rng() - 0.5) * 1.5, 0, wp.z + (this.rng() - 0.5) * 1.5);
        m.rotation.set(0.28, this.rng() * TAU, 0.18);
        m.renderOrder = 11; this.scene.add(m);
        this.shafts.push({ m, ph: this.rng() * 10, base: 0.08 + this.rng() * 0.06 });
      }
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(wp.x, 0.04, wp.z); this.scene.add(pool);
      this.shaftSpots = (this.shaftSpots || []); this.shaftSpots.push(wp);
    }
  }
  buildCenterpieces() {
    const th = this.L.theme, r = this.rng, T = this.theme;
    const solid = [], glow = [];
    this.steam = [];
    for (const c of this.L.centers || []) {
      const p = this.cellToWorld(c.x, c.y);
      if (th === 'burrow') { // glowing spring pond with lily pads and mossy rocks
        const pond = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ad0e8').multiplyScalar(1.2), toneMapped: false, transparent: true, opacity: 0.9 }));
        pond.rotation.x = -Math.PI / 2; pond.position.set(p.x, 0.05, p.z); this.scene.add(pond);
        const inner = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#bff8ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        inner.rotation.x = -Math.PI / 2; inner.position.set(p.x, 0.07, p.z); this.scene.add(inner);
        (this.pulses ||= []).push({ m: inner, base: 0.7 });
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + r() * 0.3; solid.push(paint(puff(V(p.x + Math.cos(a) * 2.1, 0.1, p.z + Math.sin(a) * 2.1), 0.3 + r() * 0.25, { detail: 1, noise: 0.3, squash: 0.6, seed: i }), (q, n, o) => o.set(T.wall[1]).lerp(C(T.top[0]), clamp(n.y)))); }
        for (let i = 0; i < 5; i++) { const a = r() * TAU, d = r() * 1.3; const pad = new THREE.CylinderGeometry(0.22 + r() * 0.1, 0.22, 0.03, 12, 1, false, 0.4, TAU - 0.4); pad.translate(p.x + Math.cos(a) * d, 0.08, p.z + Math.sin(a) * d); solid.push(paint(pad, (q, n, o) => o.set('#6ac05a'))); }
        this.lightPool.addSource({ pos: V(p.x, 1.2, p.z), color: C('#7ae0ff'), intensity: 8, radius: 8, flicker: 0.2 });
        this.collision.addCircle(p.x, p.z, 2.0);
      } else if (th === 'crystal') { // crystal heart
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * TAU + r() * 0.4, d = i === 0 ? 0 : 0.5 + r() * 0.5, hgt = i === 0 ? 3.2 : 1.2 + r() * 1.4;
          const g = new THREE.OctahedronGeometry(0.4, 0); g.scale(0.7, hgt, 0.7); g.rotateZ(i === 0 ? 0 : (r() - 0.5) * 0.7); g.rotateX(i === 0 ? 0 : (r() - 0.5) * 0.7);
          g.translate(p.x + Math.cos(a) * d, hgt * 0.35, p.z + Math.sin(a) * d);
          const col = i % 2 ? '#ff8ae0' : '#7af0ff';
          glow.push(paint(g, (q, n, o) => o.set(col).lerp(C('#ffffff'), clamp(n.y * 0.6))));
        }
        this.lightPool.addSource({ pos: V(p.x, 2, p.z), color: C('#c8a8ff'), intensity: 10, radius: 9, flicker: 0.3 });
        this.collision.addCircle(p.x, p.z, 1.1);
      } else if (th === 'shrine') { // little fox shrine: torii, fox statues, lanterns
        const post = (x, z) => { const g = new THREE.CylinderGeometry(0.09, 0.1, 1.9, 8); g.translate(x, 0.95, z); return paint(g, (q, n, o) => o.set('#e0442e')); };
        solid.push(post(p.x - 0.9, p.z), post(p.x + 0.9, p.z));
        const beam = new THREE.BoxGeometry(2.5, 0.14, 0.2); beam.translate(p.x, 1.95, p.z); solid.push(paint(beam, (q, n, o) => o.set('#2a2020')));
        const beam2 = new THREE.BoxGeometry(2.1, 0.1, 0.14); beam2.translate(p.x, 1.62, p.z); solid.push(paint(beam2, (q, n, o) => o.set('#e0442e')));
        for (const s of [-1, 1]) {
          const base = new THREE.BoxGeometry(0.4, 0.3, 0.4); base.translate(p.x + s * 1.4, 0.15, p.z + 0.8); solid.push(paint(base, (q, n, o) => o.set('#a8a0a8')));
          const fox = puff(V(p.x + s * 1.4, 0.55, p.z + 0.8), 0.22, { detail: 1, noise: 0.1, squash: 1.2, seed: s + 5 }); solid.push(paint(fox, (q, n, o) => o.set('#fff8f0')));
          for (const e of [-1, 1]) { const ear = new THREE.ConeGeometry(0.06, 0.16, 5); ear.translate(p.x + s * 1.4 + e * 0.09, 0.85, p.z + 0.8); solid.push(paint(ear, (q, n, o) => o.set('#fff8f0'))); }
          const scarf = new THREE.TorusGeometry(0.16, 0.04, 6, 12); scarf.rotateX(Math.PI / 2); scarf.translate(p.x + s * 1.4, 0.48, p.z + 0.8); solid.push(paint(scarf, (q, n, o) => o.set('#e0442e')));
        }
        this.lightPool.addSource({ pos: V(p.x, 1.4, p.z + 0.8), color: C('#ffae6a'), intensity: 9, radius: 8, flicker: 0.8 });
        for (const [x, z, rr] of [[-0.9, 0, 0.2], [0.9, 0, 0.2], [-1.4, 0.8, 0.3], [1.4, 0.8, 0.3]]) this.collision.addCircle(p.x + x, p.z + z, rr);
      } else { // kitchen: bubbling cauldron over a fire
        const pot = new THREE.SphereGeometry(0.85, 20, 14, 0, TAU, Math.PI * 0.25, Math.PI * 0.75); pot.translate(p.x, 0.9, p.z); solid.push(paint(pot, (q, n, o) => o.set('#3a3438')));
        const rim = new THREE.TorusGeometry(0.62, 0.08, 8, 24); rim.rotateX(Math.PI / 2); rim.translate(p.x, 1.5, p.z); solid.push(paint(rim, (q, n, o) => o.set('#5a5058')));
        const soup = new THREE.CircleGeometry(0.6, 24); soup.rotateX(-Math.PI / 2); soup.translate(p.x, 1.42, p.z); glow.push(paint(soup, (q, n, o) => o.set('#ffa040')));
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const log = new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6); log.rotateZ(Math.PI / 2); log.rotateY(a); log.translate(p.x, 0.1, p.z); solid.push(paint(log, (q, n, o) => o.set('#6a4a30'))); }
        this.lightPool.addSource({ pos: V(p.x, 0.8, p.z), color: C('#ff8a3a'), intensity: 12, radius: 9, flicker: 1.5 });
        this.collision.addCircle(p.x, p.z, 1.0);
        this.steam.push(V(p.x, 1.5, p.z));
      }
    }
    if (solid.length) { const m = new THREE.Mesh(merge(solid), makeToon({ vertexColors: true, rim: 0.4, brush: 0.2 })); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
    if (glow.length) { const m = new THREE.Mesh(merge(glow), makeToon({ vertexColors: true, rim: 0.7, fragOut: 'outgoingLight += diffuseColor.rgb * 1.2;' })); m.castShadow = true; this.scene.add(m); }
  }
  onSky() {}
  updateSun(focus) {
    const s = this.sun;
    s.target.position.copy(focus); s.position.copy(focus).addScaledVector(this.sunDir, 50); s.target.updateMatrixWorld();
    U.uSunDir.value.copy(this.sunDir);
  }
  update(dt, t, vfx, focus) {
    for (const f of this.flames || []) { f.s.scale.setScalar(1.3 + Math.sin(t * 11 + f.ph) * 0.12 + Math.sin(t * 23 + f.ph) * 0.08); if (vfx && Math.random() < dt * 6) vfx.glow.spawn({ x: f.p.x + rand(-0.1, 0.1), y: f.p.y, z: f.p.z + rand(-0.1, 0.1), vy: rand(0.6, 1.2), life: 0.6, size: 0.25, size1: 0.02, color: this.theme.light, alpha: 0.9, alpha1: 0 }); }
    for (const s of this.shafts || []) s.m.material.opacity = s.base * (0.75 + 0.25 * Math.sin(t * 0.7 + s.ph));
    for (const pu of this.pulses || []) pu.m.material.opacity = pu.base * (0.75 + 0.25 * Math.sin(t * 1.6));
    if (vfx) for (const sp of this.steam || []) {
      if (focus && sp.distanceTo(focus) > 30) continue;
      if (Math.random() < dt * 6) vfx.smoke.spawn({ x: sp.x + rand(-0.3, 0.3), y: sp.y, z: sp.z + rand(-0.3, 0.3), vy: rand(0.6, 1.1), life: rand(1.5, 2.5), size: 0.4, size1: 1.3, color: '#fff0e8', alpha: 0.5, alpha1: 0, fadeIn: 0.3 });
      if (Math.random() < dt * 4) vfx.glow.spawn({ x: sp.x + rand(-0.4, 0.4), y: sp.y - 0.05, z: sp.z + rand(-0.4, 0.4), vy: 0.3, life: 0.5, size: 0.25, size1: 0.05, color: '#ffc060', alpha: 0.9, alpha1: 0 });
    }
    if (vfx && focus) { // floating dust motes / spores around the player
      this.moteAcc = (this.moteAcc || 0) + dt * 10;
      while (this.moteAcc > 1) { this.moteAcc--; const x = focus.x + rand(-12, 12), z = focus.z + rand(-10, 10); if (!this.walkable(x, z)) continue; vfx.glow.spawn({ x, y: rand(0.3, 3), z, vx: rand(-0.1, 0.1), vy: rand(0.02, 0.12), vz: rand(-0.1, 0.1), life: rand(3, 5), size: rand(0.06, 0.12), color: this.theme.accent, alpha: 0.7, alpha1: 0, fadeIn: 1, flicker: rand(2, 5) }); }
    }
  }
}
