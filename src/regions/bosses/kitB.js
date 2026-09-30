// Shared helpers for the Bosses B pair (Umibōzu, Yuki-onna): pooled scene objects, a frame-driven task runner (no
// setTimeout: everything dies with the fight), player / ally hit helpers, boss-add summoning, a cone telegraph that
// matches vfx.telegraph's look, and a few tiny canvas textures. Everything created here lives in the boss's world scene,
// so disposeScene() frees it with the region; module-level geometries are re-uploaded on the next visit.
import * as THREE from 'three';
import { MONSTERS } from '../../dungeon/monsters.js';
import { Events } from '../../core/events.js';
import { TAU, clamp, rand } from '../../core/util.js';

export const C = h => new THREE.Color(h);
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ pools
/** Objects made once per world, parked hidden in the scene between uses. warm(n) pre-builds them (drawn for a few frames
 *  far below the ground so their programs finish compiling behind the region's iris). */
export class Pool {
  constructor(B, make) { this.B = B; this.make = make; this.free = []; this.all = []; }
  add() {
    const o = this.make(); o.frustumCulled = false; o.traverse?.(c => { c.frustumCulled = false; });
    this.B.scene.add(o); this.all.push(o); return o;
  }
  take() { const o = this.free.pop() || this.add(); o.visible = true; return o; }
  give(o) { if (!o) return; o.visible = false; this.free.push(o); }
  warm(n = 1) { for (let i = 0; i < n; i++) { const o = this.add(); this.B.warmUp(o); this.free.push(o); } return this; }
}

// ------------------------------------------------------------------ per-boss runtime ("B")
/** Boss state shared by the fx: scene, task list, pools, prewarm. Created in onSpawn, cleared in onDeath. */
export class BossRuntime {
  constructor(m) {
    this.m = m; this.G = m.G; this.scene = m.world.scene; this.world = m.world; this.mode = m.mode;
    this.tasks = []; this.pools = {}; this.warm = []; this.warmFrames = 0; this.t = 0; this.dead = false;
    this.uT = { value: 0 };
  }
  pool(key, make) { return this.pools[key] ||= new Pool(this, make); }
  /** draw an object for a few frames far below the ground, then hide it (shader + upload prewarm) */
  warmUp(o) { o.visible = true; o.position.set(0, -80, 0); this.warm.push(o); }
  /** run fn(dt, t) every frame until it returns false (end() once when it stops or the fight is cleared) */
  run(fn, end) { const k = { fn, end, t: 0 }; this.tasks.push(k); return k; }
  /** fn() after `sec` seconds of fight time */
  after(sec, fn) { return this.run((dt, t) => { if (t < sec) return true; fn(); return false; }); }
  update(dt) {
    this.t += dt; this.uT.value = this.t;
    if (this.warm.length && ++this.warmFrames > 3) { for (const o of this.warm) { o.visible = false; o.position.set(0, 0, 0); } this.warm.length = 0; }
    const T = this.tasks;
    for (let i = 0; i < T.length; i++) {
      const k = T[i]; k.t += dt;
      let keep = false;
      try { keep = k.fn(dt, k.t) !== false; } catch (e) { console.warn('[boss fx]', e); }
      if (!keep) { try { k.end?.(); } catch (e) { console.warn('[boss fx]', e); } T[i] = T[T.length - 1]; T.pop(); i--; }
    }
  }
  clear() { for (const k of this.tasks) { try { k.end?.(); } catch (e) { /* ignore */ } } this.tasks.length = 0; }
}

// ------------------------------------------------------------------ combat helpers
const _h = V();
/** is the player inside a circle (x, z, r)? (counts his body radius) */
export function playerIn(G, x, z, r) { const P = G.player; return !!P && !G.playerDead && (P.pos.x - x) ** 2 + (P.pos.z - z) ** 2 < (r + (P.radius || 0.3)) ** 2; }
/** hit the player (i-frames / blocks / Moka's bubble are handled by Combat.hitPlayer) and allies in the same circle */
export function hitCircle(m, x, z, r, raw, { element = 'phys', knock = 0.6, player = true, allies = true } = {}) {
  const G = m.G, C = m.mode.combat; let hit = false;
  _h.set(x, m.pos.y, z);
  if (player && playerIn(G, x, z, r)) { C.hitPlayer(raw, { element, level: m.level, from: _h.clone(), knock, src: m }); hit = true; }
  if (allies) for (const e of C.entities) if (e.alive && e.team === 'ally' && e !== G.player && e.pos && (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 < (r + (e.radius || 0.3)) ** 2) C.hitAlly(e, Math.round(raw * 0.8), { element, from: _h });
  return hit;
}
/** a damage roll from the boss's stats, scaled */
export function roll(m, k = 1) { const d = m.stats.dmg; return Math.max(1, Math.round((d[0] + Math.random() * (d[1] - d[0])) * k)); }
export const sfx = (name, pos, o = {}) => Events.emit('sfx', name, pos ? { pos, ...o } : o);

/** first registered monster id of `ids`, else the fallback */
export function pickId(ids, fallback) { for (const id of ids) if (MONSTERS[id]) return id; return MONSTERS[fallback] ? fallback : null; }
/** boss adds at walkable spots around (cx, cz): same rules as DungeonMode.summonAround (they vanish with the boss) */
export function summonAt(m, id, n, cx, cz, r0 = 2.5, r1 = 5) {
  if (!id) return [];
  const W = m.world, mode = m.mode, out = [];
  for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
    const a = rand(0, TAU), r = rand(r0, r1), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!W.walkable(x, z) || W.collision?.solidAt?.(x, z, 0.4)) continue;
    const s = new m.constructor(mode, id, { level: mode.layout.mlvl, x, z, rng: () => mode.rng.next() });
    s.aggro = true; s.bossAdd = true;
    mode.monsters.push(s); mode.combat.add(s); out.push(s); i++;
  }
  return out;
}

// ------------------------------------------------------------------ cone telegraph (vfx.telegraph's look, as a sector)
// Same recipe as the circular one: dark veil + ink contour for bright floors, a hot rim and sweeping front for dark
// ones, crawling hatch stripes; the fill sweeps from the apex outward over the wind-up.
const CONE_FS = /* glsl */`uniform float uK, uT, uHalf, uA; uniform vec3 uC; varying vec2 vUv;
  void main() {
    vec2 q = (vUv - 0.5) * 2.0; float d = length(q); if (d > 1.0 || q.y < -0.02) discard;
    float ang = abs(atan(q.x, q.y)); if (ang > uHalf) discard;
    float aa = fwidth(d) * 1.3, ea = (uHalf - ang) * d, eaa = fwidth(ea) * 1.3 + 1e-4;
    float edge = min(1.0 - d, ea * 1.2);
    float inside = step(d, uK);
    float ink = smoothstep(0.1 + eaa, 0.1, edge) * step(0.035, edge);
    float rim = smoothstep(0.06 + eaa, 0.06, edge) * (1.0 - smoothstep(0.018, 0.018 - eaa, edge));
    float lead = smoothstep(uK - 0.12, uK, d) * inside;
    float hatch = smoothstep(0.42, 0.5, abs(fract((q.x - q.y) * 6.0 + uT * 1.4) - 0.5) * 2.0 - 0.1);
    float urg = 0.72 + 0.28 * sin(uT * (9.0 + 22.0 * uK));
    vec3 hot = mix(uC, vec3(1.0), 0.36), ink3 = vec3(0.13, 0.05, 0.1);
    vec3 col = ink3; float a = 0.24;
    col = mix(col, uC, inside * (0.6 + 0.3 * hatch)); a = mix(a, 0.36 + 0.18 * hatch, inside);
    col = mix(col, hot, lead); a = max(a, lead * 0.82);
    col = mix(col, ink3, ink); a = max(a, ink * 0.72);
    col = mix(col, hot, rim); a = max(a, rim * (0.7 + 0.3 * urg));
    gl_FragColor = vec4(col, a * uA);
  }`;
const VS_UV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
let CONE_GEO = null;
export function coneTelegraphMesh() {
  CONE_GEO ||= new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_UV, fragmentShader: CONE_FS, transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uK: { value: 0 }, uT: { value: 0 }, uHalf: { value: 0.5 }, uA: { value: 1 }, uC: { value: C('#9ad8ff') } } });
  mat.extensions = { derivatives: true };
  const o = new THREE.Mesh(CONE_GEO, mat); o.renderOrder = 9; return o;
}

// ------------------------------------------------------------------ canvas textures (drawn once per session)
const TEX = {};
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** a cartoon splat (white with alpha: tint it), with lobes and flung droplets */
export function splatTexture() {
  return TEX.splat ||= canvasTex(256, 256, (g, w) => {
    g.translate(w / 2, w / 2); g.fillStyle = '#fff';
    g.beginPath();
    const n = 11;
    for (let i = 0; i <= n * 4; i++) { const a = i / (n * 4) * TAU, r = 78 + Math.sin(a * n) * 14 + Math.sin(a * 3 + 1) * 8; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.3, r = 96 + (i % 3) * 10, s = 7 + (i % 4) * 3; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, s, 0, TAU); g.fill(); }
  });
}
/** soft radial dot (white → transparent) */
export function dotTexture() {
  return TEX.dot ||= canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
}
/** a six-armed snowflake crystal (white with alpha) */
export function flakeTexture() {
  return TEX.flake ||= canvasTex(128, 128, (g, w) => {
    g.translate(w / 2, w / 2); g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      g.save(); g.rotate(i / 6 * TAU); g.lineWidth = 7; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -52); g.stroke();
      g.lineWidth = 5; for (const [y, l] of [[-24, 14], [-38, 11]]) { g.beginPath(); g.moveTo(0, y); g.lineTo(-l, y - l); g.moveTo(0, y); g.lineTo(l, y - l); g.stroke(); }
      g.restore();
    }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill();
  });
}
/** crackled ice: pale sheet with a white rim, fracture lines and glints (tinted by the material colour) */
export function iceTexture() {
  return TEX.ice ||= canvasTex(256, 256, (g, w) => {
    const c = w / 2; g.translate(c, c);
    const gr = g.createRadialGradient(0, 0, 10, 0, 0, 124); gr.addColorStop(0, 'rgba(210,240,255,0.78)'); gr.addColorStop(0.82, 'rgba(190,230,255,0.72)'); gr.addColorStop(0.93, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU, r = 118 + Math.sin(a * 7) * 4 + Math.sin(a * 13 + 2) * 3; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.2; g.lineCap = 'round';
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) { let a = i / 9 * TAU + rnd() * 0.4, r = 6, x = 0, y = 0; g.beginPath(); g.moveTo(0, 0); while (r < 112) { r += 14 + rnd() * 16; a += (rnd() - 0.5) * 0.5; x = Math.cos(a) * r; y = Math.sin(a) * r; g.lineTo(x, y); if (rnd() < 0.3) { g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 30); g.moveTo(x, y); } } g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 14; i++) { const a = rnd() * TAU, r = rnd() * 100; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5 + rnd() * 2.5, 0, TAU); g.fill(); }
  });
}
export { clamp };
