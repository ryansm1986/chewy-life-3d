// High-level visual effects: particle presets, slash arcs, shockwaves, light pillars, lightning, telegraphs, emotes.
import * as THREE from 'three';
import { adoptSortedSprite } from './spriteBatch.js';
import { ParticleLayer } from './particles.js';
import { glowTexture, sparkleTexture, smokeTexture, softDotTexture, petalTexture, ringTexture, slashTexture, shaftTexture, leafParticleTexture } from './textures.js';
import { rand, TAU, clamp, ease } from '../core/util.js';

const _v = new THREE.Vector3();
const C = h => new THREE.Color(h);
// Extensions (e.g. Moka's SpellFX in spellFx.js): make(vfx) → { update(dt), clear(), prewarm?(renderer, camera) }, one per
// VFX instance (the village's and each floor's), so their meshes live in that world's scene and go with it.
const EXTENSIONS = [];
export function registerVfxExtension(make) { EXTENSIONS.push(make); }
const DAMP_MIN = 0.25; // additive effects sitting right on a boss keep 25% of their brightness
const HIT_BUDGET = 4; // hit flashes per frame (the rest are sparks only: a sweep through a crowd doesn't stack glows)
const HIT_FX_BUDGET = 32; // (past this many hits in one frame, plain hits spawn a quarter of the sparks and no element extras: ROADMAP Z-B4)
const singlePass = o => o.traverse(c => { const m = c.material; if (m && !Array.isArray(m) && m.side === THREE.DoubleSide && m.transparent && m.blending === THREE.AdditiveBlending && !m.depthWrite) m.forceSinglePass = true; });
// (perf, ROADMAP Z-B4) a monster swing / hit ring / decal no longer builds and uploads its own geometry: rings and
// decals share one plane (sized by the mesh scale), slashes one ring per shape (radius, width, arc, direction).
// userData.shared keeps them out of the per-effect geometry disposal.
let PLANE = null; const sharedPlane = () => { if (!PLANE) { PLANE = new THREE.PlaneGeometry(2, 2); PLANE.userData.shared = true; } return PLANE; };
const SLASHES = new Map();
function slashGeo(r, width, arc, reverse) {
  const key = `${r.toFixed(4)}|${width.toFixed(4)}|${arc.toFixed(4)}|${reverse ? 1 : 0}`;
  let g = SLASHES.get(key);
  if (g) return g;
  g = new THREE.RingGeometry(r - width, r, 32, 1, 0, arc);
  // remap uv: u along arc, v across
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), yy = pos.getY(i); const a = Math.atan2(yy, x); const rr = Math.hypot(x, yy);
    uv.setXY(i, reverse ? 1 - a / arc : a / arc, (r - rr) / width);
  }
  g.userData.shared = true;
  if (SLASHES.size > 256) SLASHES.clear(); // (odd one-off shapes: never an unbounded cache)
  SLASHES.set(key, g);
  return g;
}

// speech-bubble textures are shared by every VFX instance (the village one and each dungeon floor's): one canvas per
// kind for the whole session, so floors don't leave a fresh set of uploaded textures behind on every visit
const EMOTE_TEX = new Map();
function emoteTexture(kind) {
  let t = EMOTE_TEX.get(kind);
  if (!t) EMOTE_TEX.set(kind, t = drawEmote(kind));
  return t;
}
function drawEmote(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  // bubble
  g.fillStyle = '#fffaf0'; g.strokeStyle = '#4a2c2a'; g.lineWidth = 6;
  g.beginPath(); g.arc(64, 56, 44, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(52, 96); g.lineTo(64, 118); g.lineTo(74, 94); g.fill(); g.stroke();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(64, 56, 41, 0, TAU); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const draw = {
    heart: () => { g.fillStyle = '#ff5a7a'; g.beginPath(); g.moveTo(64, 80); g.bezierCurveTo(20, 50, 40, 20, 64, 42); g.bezierCurveTo(88, 20, 108, 50, 64, 80); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(50, 45, 6, 0, TAU); g.fill(); },
    note: () => { g.fillStyle = '#6a8aff'; g.beginPath(); g.ellipse(52, 72, 12, 9, -0.4, 0, TAU); g.fill(); g.fillRect(60, 30, 6, 42); g.beginPath(); g.moveTo(66, 30); g.quadraticCurveTo(86, 40, 80, 56); g.quadraticCurveTo(80, 44, 66, 42); g.fill(); },
    '!': () => { g.fillStyle = '#ff7a3a'; g.font = 'bold 64px Fredoka, sans-serif'; g.fillText('!', 64, 60); },
    '?': () => { g.fillStyle = '#5aa0ff'; g.font = 'bold 60px Fredoka, sans-serif'; g.fillText('?', 64, 60); },
    zzz: () => { g.fillStyle = '#8a7aff'; g.font = 'bold 36px Fredoka, sans-serif'; g.fillText('z', 50, 66); g.font = 'bold 28px Fredoka, sans-serif'; g.fillText('z', 72, 48); },
    sparkle: () => { g.fillStyle = '#ffc83a'; for (const [x, y, s] of [[64, 56, 26], [40, 40, 10], [88, 76, 12]]) { g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s); g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill(); } },
    anger: () => { g.strokeStyle = '#ff3a4a'; g.lineWidth = 8; for (const [a, b] of [[[46, 38], [58, 50]], [[82, 38], [70, 50]], [[46, 74], [58, 62]], [[82, 74], [70, 62]]]) { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); } },
    sweat: () => { g.fillStyle = '#6ac8ff'; g.beginPath(); g.moveTo(64, 28); g.quadraticCurveTo(88, 62, 64, 80); g.quadraticCurveTo(40, 62, 64, 28); g.fill(); },
    gift: () => { g.fillStyle = '#ff7aa8'; g.fillRect(40, 44, 48, 36); g.fillStyle = '#ffd24a'; g.fillRect(60, 44, 8, 36); g.fillRect(36, 38, 56, 10); g.beginPath(); g.ellipse(54, 34, 10, 7, -0.5, 0, TAU); g.ellipse(74, 34, 10, 7, 0.5, 0, TAU); g.fill(); },
    paw: () => { g.fillStyle = '#c98f5e'; g.beginPath(); g.ellipse(64, 68, 16, 13, 0, 0, TAU); g.fill(); for (const [x, y] of [[44, 50], [56, 38], [72, 38], [84, 50]]) { g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill(); } },
  };
  (draw[kind] || draw.heart)();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class VFX {
  constructor(engine, scene) {
    this.engine = engine; this.scene = scene;
    this.glow = new ParticleLayer(scene, glowTexture(), { additive: true, max: 2500, order: 12 });
    this.spark = new ParticleLayer(scene, sparkleTexture(), { additive: true, max: 2000, order: 13 });
    this.smoke = new ParticleLayer(scene, smokeTexture(), { additive: false, max: 1500, order: 11 });
    this.dot = new ParticleLayer(scene, softDotTexture(), { additive: false, max: 1500, order: 11 });
    this.petal = new ParticleLayer(scene, petalTexture(), { additive: false, max: 600, order: 11 });
    this.leaf = new ParticleLayer(scene, leafParticleTexture(), { additive: false, max: 400, order: 11 });
    this.layers = [this.glow, this.spark, this.smoke, this.dot, this.petal, this.leaf];
    this.fx = []; // mesh effects {update(dt)->bool, obj}
    this.emoteTex = EMOTE_TEX;
    this.lightPool = null;
    // Readability near big bodies: live bosses registered here ({pos, bodyR|radius, height, alive}) tone down every
    // additive glow / spark / flash / flash-light that lands on them, so a storm of skill effects can't turn the boss
    // into a white blob — its silhouette and face stay readable (the dungeon keeps this list in sync each frame).
    this._hitN = 0; this._critLight = 0;
    this.dampers = [];
    for (const L of [this.glow, this.spark]) {
      const raw = L.spawn.bind(L);
      L.spawn = o => {
        if (this.dampers.length && !this._undamped) {
          const k = this.dampAt(o.x, o.y, o.z);
          if (k < 1) { o.alpha = (o.alpha ?? 1) * k; if (o.alpha1) o.alpha1 *= k; const s = 0.55 + 0.45 * k; if (o.size != null) o.size *= s; if (o.size1 != null) o.size1 *= s; }
        }
        return raw(o);
      };
    }
    this.ext = [];
    for (const make of EXTENSIONS) { try { const e = make(this); if (e) this.ext.push(e); } catch (err) { console.warn('[vfx] extension failed', err); } }
  }
  setLightPool(lp) { this.lightPool = lp; }
  // the boss's own telegraphs (wind-up swirls etc.) must stay loud: spawn them inside undamped(() => …)
  undamped(fn) { this._undamped = true; try { return fn(); } finally { this._undamped = false; } }
  // 1 = untouched … DAMP_MIN right on a registered boss (horizontal falloff from its body radius; effects well above its head are left alone)
  dampAt(x, y, z) {
    let k = 1;
    for (const d of this.dampers) {
      if (!d || d.alive === false) continue;
      const R = d.bodyR || d.radius || 1, H = (d.height || 2) + 0.8;
      if (y != null && y > (d.pos.y || 0) + H) continue;
      const dist = Math.hypot(x - d.pos.x, z - d.pos.z);
      const a = R * 0.9, b = R * 1.7 + 0.6;
      const t = clamp((dist - a) / (b - a));
      k = Math.min(k, DAMP_MIN + (1 - DAMP_MIN) * t * t * (3 - 2 * t));
    }
    return k;
  }
  light(pos, color, intensity = 6, radius = 6, life = 0.3) {
    if (!pos.isVector3) pos = new THREE.Vector3(pos.x, pos.y, pos.z); // (the pool clones it: plain { x, y, z } points are fine too)
    if (this.dampers.length) intensity *= this.dampAt(pos.x, pos.y, pos.z) ** 1.5; this.lightPool?.flash(pos, color, intensity, radius, life);
  }
  update(dt) {
    const cam = this.engine.camera;
    this._hitN = 0; this._critLight = 0; // (the per-frame hit-flash budget: hit())
    for (const l of this.layers) l.update(dt, cam);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.update(dt, f.t) === false || (f.life && f.t >= f.life)) { if (f.obj) { f.obj.parent?.remove(f.obj); f.obj.traverse?.(o => { if (o.isMesh && !o.geometry?.userData?.shared) o.geometry?.dispose?.(); }); } this.fx.splice(i, 1); }
    }
    for (const e of this.ext) e.update(dt);
  }
  // (effect geometries are per effect: freed here too, or a floor left mid-effect would keep them uploaded — shared
  // sprite geometry is left alone)
  clear() { for (const l of this.layers) l.clear(); for (const f of this.fx) { f.obj?.parent?.remove(f.obj); f.obj?.traverse?.(o => { if (o.isMesh && !o.geometry?.userData?.shared) o.geometry?.dispose?.(); }); } this.fx.length = 0; for (const e of this.ext) e.clear?.(); }
  // (additive, non-depth-writing double-sided effects blend commutatively: one pass draws them exactly as three's back-
  // then-front double pass does, without re-evaluating their program twice a frame and twice the draws: ROADMAP Z-B5)
  add(obj, update, life = 0) { if (obj) { this.scene.add(obj); singlePass(obj); } const f = { obj, update, t: 0, life }; this.fx.push(f); return f; }

  // Compile every effect's shader up front (call behind a loading transition) so first use doesn't hitch. compile()
  // only links programs: the effect meshes are also DRAWN for a few real frames (culling off, far below the floor,
  // behind the transition) so the driver finishes each program and the vertex layouts at a real draw, and every
  // effect texture is uploaded now — otherwise that work lands on the first Chomp / Blaze of the floor.
  prewarm(renderer, camera) {
    const p = new THREE.Vector3(0, -50, 0), n0 = this.fx.length;
    this.ring(p); this.ring(p, { flat: false }); this.slash(p, 0); this.pillar(p); this.telegraph(p, 1, 1);
    this.decal(p); this.decal(p, { additive: true }); this.decal(p, { additive: true, tex: ringTexture() });
    this.lightning(p, p.clone().setY(-49)); this.emote({ pos: p, rig: { height: 1 } }, 'heart', 0.1); this.emote({ pos: p, rig: { height: 1 } }, '!', 0.1);
    this.sparks(p); this.poof(p); this.fire(p); this.petals(p); this.stink(p);
    for (const e of this.ext) { try { e.prewarm?.(renderer, camera); } catch (err) { console.warn('[vfx] extension prewarm failed', err); } }
    for (const l of this.layers) l.update(0.016, camera);
    for (const t of [glowTexture(), sparkleTexture(), smokeTexture(), softDotTexture(), petalTexture(), ringTexture(), slashTexture(), shaftTexture(), leafParticleTexture()]) { try { renderer.initTexture(t); } catch (e) { /* ignore */ } }
    try { renderer.compile(this.scene, camera); } catch (e) { /* ignore */ }
    const warm = this.fx.slice(n0); // (the particles simply live out their short lives down there)
    for (const f of warm) { f.obj?.traverse?.(o => { o.frustumCulled = false; }); f.update = () => true; f.life = 0; }
    let frames = 0;
    const done = () => { if (++frames < 3) return requestAnimationFrame(done); for (const f of warm) { const i = this.fx.indexOf(f); if (i >= 0) this.fx.splice(i, 1); f.obj?.parent?.remove(f.obj); f.obj?.traverse?.(o => { if (o.isMesh && !o.geometry?.userData?.shared) o.geometry?.dispose?.(); }); } };
    requestAnimationFrame(done);
  }
  // ------------------------------------------------------------------ particle presets
  sparks(p, { n = 10, color = '#fff2a0', speed = 5, size = 0.35, life = 0.35, up = 1.5, grav = 6 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.4, 1) * speed;
      this.spark.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: rand(0.2, 1) * up * s * 0.4, vz: Math.sin(a) * s, life: rand(0.6, 1) * life, size: size * rand(0.6, 1.2), size1: 0.02, color, alpha: 1, alpha1: 0.2, drag: 3, grav, spin: rand(-8, 8) });
    }
  }
  flash(p, color = '#ffffff', size = 1.4, life = 0.18, alpha = 0.9) { this.glow.spawn({ x: p.x, y: p.y, z: p.z, life, size, size1: size * 1.6, color, alpha, alpha1: 0 }); }
  // soft: hits on a big body (boss) — sparks still read, but the flash sprite / crit light stay small so they don't wash it out
  // r: the foe's body radius (m). A hit's glow stays about the size of the foe (≤ ~1.5 m, half alpha) and only the first
  // few hits in a frame flash at all (HIT_BUDGET; one crit light per frame): a burst of hits never washes the view out
  hit(p, { color = '#fff4c0', crit = false, element = 'phys', soft = false, r = 0.45 } = {}) {
    const ec = { fire: '#ffa040', frost: '#9fe0ff', zap: '#fff27a', stink: '#a8e070', holy: '#fff6c0', phys: color }[element] || color;
    const s = soft ? 0.55 : 1, lit = this._hitN++ < HIT_BUDGET, crowd = !crit && this._hitN > HIT_FX_BUDGET; // (crowd: a frame of very many hits)
    if (soft) { // big bodies: a tiny flash + opaque confetti chips (normal blend, so they read without adding light)
      if (lit) this.flash(p, ec, crit ? 0.8 : 0.45, 0.1, 0.5);
      for (let i = 0, n = crit ? 9 : 5; i < n; i++) { const a = rand(0, TAU), v = rand(2, 4.5); this.dot.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * v, vy: rand(1.5, 4), vz: Math.sin(a) * v, life: rand(0.35, 0.55), size: rand(0.1, 0.17), size1: 0.04, color: i % 2 ? ec : crit ? '#ffcf4a' : '#ffa870', alpha: 1, alpha1: 0.6, grav: 12, drag: 1.5 }); }
    } else if (lit) this.flash(p, ec, Math.min(crit ? 1.2 : 0.85, 0.5 + r * 1.5), crit ? 0.22 : 0.15, 0.5);
    this.sparks(p, { n: Math.round((crit ? 14 : 8) * s * (lit ? 1 : 0.5) * (crowd ? 0.25 : 1)), color: ec, speed: crit ? 6.5 : 4.5, size: crit ? 0.42 : 0.32 });
    if (crit && lit) {
      this.ring(p, { color: '#ffd84a', r0: 0.2, r1: Math.min(1.25, 0.5 + r * 1.6) * s, life: 0.28, flat: false, opacity: soft ? 0.45 : 0.6 });
      if (this._critLight++ < 1) this.light(p, '#ffd070', soft ? 2.5 : 4, soft ? 3 : 3.5, 0.18);
    }
    if (!crowd && element === 'fire') this.fire(p, soft ? 3 : 6);
    if (!crowd && element === 'frost') this.frost(p, soft ? 3 : 6);
    if (!crowd && element === 'zap') this.sparks(p, { n: soft ? 4 : 8, color: '#fff7a0', speed: 8, size: 0.25 });
    if (!crowd && element === 'stink') this.stink(p, soft ? 2 : 4);
  }
  dk(p) { return this.dampers.length ? this.dampAt(p.x, p.y, p.z) : 1; }
  poof(p, { color = '#fff0f6', n = 14, size = 0.7, hearts = false } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.8, 2.4);
      this.smoke.spawn({ x: p.x, y: p.y + rand(0, 0.4), z: p.z, vx: Math.cos(a) * s, vy: rand(0.5, 1.8), vz: Math.sin(a) * s, life: rand(0.5, 0.9), size: size * rand(0.6, 1), size1: size * 1.8, color, alpha: 0.95, alpha1: 0, drag: 4, spin: rand(-2, 2) });
    }
    this.sparks(p, { n: 10, color: '#ffffff', speed: 4, size: 0.3 });
    this.flash(p, color, 1.6, 0.2);
  }
  dust(p, { n = 3, color = '#e8d8c0', size = 0.25 } = {}) {
    for (let i = 0; i < n; i++) this.smoke.spawn({ x: p.x + rand(-0.1, 0.1), y: p.y + 0.05, z: p.z + rand(-0.1, 0.1), vx: rand(-0.6, 0.6), vy: rand(0.2, 0.6), vz: rand(-0.6, 0.6), life: rand(0.4, 0.7), size, size1: size * 2.2, color, alpha: 0.55, alpha1: 0, drag: 3 });
  }
  sparkle(p, { n = 8, color = '#fff6c0', r = 0.6, life = 1, size = 0.28, rise = 0.8 } = {}) {
    for (let i = 0; i < n; i++) this.spark.spawn({ x: p.x + rand(-r, r), y: p.y + rand(0, r), z: p.z + rand(-r, r), vy: rand(0.2, 1) * rise, life: rand(0.5, 1) * life, size: size * rand(0.5, 1.2), size1: 0.01, color, alpha: 1, alpha1: 0, spin: rand(-3, 3), fadeIn: 0.1 });
  }
  heal(p) {
    for (let i = 0; i < 16; i++) { const a = rand(0, TAU), r = rand(0.1, 0.5); this.spark.spawn({ x: p.x + Math.cos(a) * r, y: p.y + rand(0, 0.8), z: p.z + Math.sin(a) * r, vy: rand(0.8, 1.8), life: rand(0.6, 1.1), size: rand(0.18, 0.34), size1: 0.02, color: i % 2 ? '#8affb0' : '#ffb0d0', alpha: 1, alpha1: 0 }); }
    this.ring(p, { color: '#8affb0', r0: 0.3, r1: 1.2, life: 0.5 });
  }
  fire(p, n = 10, { spread = 0.3, size = 0.45 } = {}) {
    for (let i = 0; i < n; i++) this.glow.spawn({ x: p.x + rand(-spread, spread), y: p.y + rand(0, 0.3), z: p.z + rand(-spread, spread), vx: rand(-0.4, 0.4), vy: rand(1, 2.4), vz: rand(-0.4, 0.4), life: rand(0.35, 0.7), size: size * rand(0.6, 1.1), size1: 0.05, color: '#ffc040', color1: '#ff3a1a', alpha: 0.95, alpha1: 0, drag: 1.5 });
  }
  frost(p, n = 10) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(1, 3); this.spark.spawn({ x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * s, vy: rand(0.5, 2), vz: Math.sin(a) * s, life: rand(0.4, 0.8), size: rand(0.2, 0.4), size1: 0.02, color: '#c8f0ff', alpha: 1, alpha1: 0, drag: 3, grav: 4, spin: rand(-6, 6) }); }
    for (let i = 0; i < n / 2; i++) this.smoke.spawn({ x: p.x + rand(-0.3, 0.3), y: p.y + 0.2, z: p.z + rand(-0.3, 0.3), vy: rand(0.2, 0.6), life: 0.8, size: 0.5, size1: 1.1, color: '#dff6ff', alpha: 0.5, alpha1: 0 });
  }
  stink(p, n = 8) {
    for (let i = 0; i < n; i++) this.smoke.spawn({ x: p.x + rand(-0.3, 0.3), y: p.y + rand(0, 0.5), z: p.z + rand(-0.3, 0.3), vx: rand(-0.3, 0.3), vy: rand(0.3, 0.9), vz: rand(-0.3, 0.3), life: rand(0.7, 1.3), size: rand(0.3, 0.5), size1: 1.0, color: '#a8e070', color1: '#6aa040', alpha: 0.7, alpha1: 0, spin: rand(-1, 1) });
  }
  coins(p, n = 8) { this.sparks(p, { n, color: '#ffd84a', speed: 3, size: 0.3, up: 3, grav: 9, life: 0.6 }); }
  petals(p, n = 12, spread = 0.6) {
    for (let i = 0; i < n; i++) this.petal.spawn({ x: p.x + rand(-spread, spread), y: p.y + rand(0, 0.6), z: p.z + rand(-spread, spread), vx: rand(-1, 1), vy: rand(0.5, 2), vz: rand(-1, 1), life: rand(1, 1.8), size: rand(0.12, 0.2), color: '#ffffff', alpha: 1, alpha1: 0, drag: 2, grav: 1.5, spin: rand(-6, 6), stretch: 0.8 });
  }
  /** Keep the next few seconds' celebrations modest (a boss Victory already fills the screen; a level-up on top of it
   *  would bleach it with a second pillar + flash light). */
  calm(sec = 2) { this.calmUntil = performance.now() + sec * 1000; }
  levelUp(p) {
    const calm = performance.now() < (this.calmUntil || 0);
    this.pillar(p, { color: '#ffe070', life: 1.6, r: 0.7, h: 7, opacity: calm ? 0.35 : 0.8 });
    this.ring(p, { color: '#ffe070', r0: 0.2, r1: 3.2, life: 0.8, opacity: calm ? 0.4 : 0.9 });
    for (let i = 0, n = calm ? 16 : 40; i < n; i++) { const a = rand(0, TAU), r = rand(0.2, 0.9); this.spark.spawn({ x: p.x + Math.cos(a) * r, y: p.y + rand(0, 0.5), z: p.z + Math.sin(a) * r, vy: rand(1.5, 4.5), life: rand(0.8, 1.6), size: rand(0.2, 0.45), size1: 0.02, color: i % 3 ? '#ffe070' : '#ffffff', alpha: 1, alpha1: 0, spin: rand(-4, 4) }); }
    this.petals(p.clone().setY(p.y + 1), calm ? 12 : 24, 1);
    this.light(p, '#ffe070', calm ? 4 : 14, calm ? 5 : 9, 1.2);
  }
  /** Boss defeated: a golden shockwave, a soft light column, petal rain and staggered sparkle bursts — celebratory
   *  without a bloom-bleaching flash light. */
  // pal (optional): { ring, ring2, pillar, light, sparkle:[3], k } — warm arenas (the Oni's Kitchen) pass a cool palette and
  // k < 1 so the celebration contrasts with the floor instead of adding more orange to an already orange frame
  victory(p, pal = {}) {
    const k = pal.k ?? 1;
    this.ring(p, { color: pal.ring || '#ffe070', r0: 0.5, r1: 6.5, life: 0.9, opacity: 0.9 * k });
    this.ring(p, { color: pal.ring2 || '#ffc8e0', r0: 0.3, r1: 4, life: 0.7, opacity: 0.9 * k });
    this.pillar(p, { color: pal.pillar || '#ffe8a0', life: 1.6, r: 1.1, h: 9, opacity: 0.4 * k });
    this.petals(p.clone().setY(p.y + 1.6), 40, 1.8);
    this.light(p, pal.light || '#ffe070', 5 * k, 8, 1.0);
    (pal.sparkle || ['#fff2a0', '#ffc8e0', '#c8e8ff']).forEach((c, i) => setTimeout(() => this.sparkle(p.clone().setY(p.y + 1 + i * 0.5), { n: 18, color: c, r: 1.8, rise: 2, size: 0.34 }), i * 220));
  }

  /** Hero hand-off (heroes.js): a starlight column + paw glyph that flashes the outgoing hero's colour, then blooms in
   *  the incoming one's (~0.65 s, pooled in SpellFX, lit via light()). */
  heroSwap(pos, { from = '#e8475c', to = '#2fb8a8' } = {}) {
    if (this.spell?.heroSwap) return this.spell.heroSwap(pos, { from, to });
    this.pillar(pos, { color: to, r: 0.8, h: 7, life: 0.7 }); this.ring(pos, { color: to, r0: 0.3, r1: 3, life: 0.5 }); this.sparkle(pos.clone().setY(pos.y + 0.8), { n: 16, color: to, r: 0.8 });
  }
  // ------------------------------------------------------------------ mesh effects
  ring(p, { color = '#ffffff', r0 = 0.2, r1 = 2, life = 0.4, flat = true, opacity = 0.9, y = 0.06 } = {}) {
    opacity *= flat ? 1 : this.dk(p); // camera-facing rings sit over whatever they're centred on
    const m = new THREE.Mesh(sharedPlane(), new THREE.MeshBasicMaterial({ map: ringTexture(), color: C(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    if (flat) m.rotation.x = -Math.PI / 2; else m.lookAt(this.engine.camera.position);
    m.position.set(p.x, p.y + y, p.z); m.renderOrder = 12;
    return this.add(m, (dt, t) => { const k = clamp(t / life); const r = r0 + (r1 - r0) * ease.outCubic(k); m.scale.setScalar(r); m.material.opacity = opacity * (1 - k); if (!flat) m.lookAt(this.engine.camera.position); }, life);
  }
  // flat ground decal (scorch marks, magic circles, impact glows). additive=false → darkening multiply-ish decal
  decal(p, { r = 1.5, color = '#2a1a14', life = 3, opacity = 0.55, additive = false, tex = null, spin = 0, grow = 0 } = {}) {
    if (additive) opacity *= 0.5 + 0.5 * this.dk(p);
    const m = new THREE.Mesh(sharedPlane(), new THREE.MeshBasicMaterial({ map: tex || glowTexture(), color: C(color), transparent: true, opacity, depthWrite: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, (p.y || 0) + 0.04, p.z); m.renderOrder = 8; m.scale.setScalar(r);
    return this.add(m, (dt, t) => { const k = clamp(t / life); m.material.opacity = opacity * (1 - ease.inQuad(k)); m.rotation.z += spin * dt; if (grow) m.scale.setScalar(r * (1 + grow * ease.outCubic(k))); }, life);
  }
  // big stylised impact: flash star + ring + sparks + optional decal
  impact(p, { color = '#fff4c0', r = 1.6, decal = null } = {}) {
    this.flash(p.clone().setY(p.y + 0.4), color, r * 1.4, 0.2);
    this.ring(p, { color, r0: 0.2, r1: r * 1.2, life: 0.35, opacity: 1 });
    this.sparks(p.clone().setY(p.y + 0.3), { n: 14, color, speed: 6, size: 0.45 });
    if (decal) this.decal(p, { r: r * 0.9, color: decal, life: 2.5, opacity: 0.45 });
  }
  shockwave(p, r = 3, color = '#fff0c0') { this.ring(p, { color, r0: 0.3, r1: r, life: 0.45, opacity: 1 }); this.ring(p, { color: '#ffffff', r0: 0.1, r1: r * 0.7, life: 0.3 }); this.dustRing(p, r * 0.8); }
  dustRing(p, r = 2, n = 18) {
    for (let i = 0; i < n; i++) { const a = i / n * TAU; this.smoke.spawn({ x: p.x + Math.cos(a) * 0.4, y: p.y + 0.1, z: p.z + Math.sin(a) * 0.4, vx: Math.cos(a) * r * 2.2, vy: rand(0.3, 1), vz: Math.sin(a) * r * 2.2, life: rand(0.5, 0.8), size: 0.45, size1: 1.1, color: '#e8dcc8', alpha: 0.7, alpha1: 0, drag: 5 }); }
  }
  // horizontal crescent slash around an actor. dir = facing angle (radians, atan2(x,z)), arc in radians
  slash(p, dir, { color = '#fffaf0', arc = 2.6, r = 1.4, life = 0.26, y = 0.55, reverse = false, width = 0.8, tilt = 0, glow = true } = {}) {
    const g = slashGeo(r, width, arc, reverse); // (cached per shape: a crowd's swings reuse it)
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: slashTexture(), color: C(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const grp = new THREE.Group(); grp.add(m);
    m.rotation.x = -Math.PI / 2; // lie flat
    grp.position.set(p.x, p.y + y, p.z);
    grp.rotation.set(tilt, dir + Math.PI / 2 + arc / 2, 0, 'YXZ');
    grp.renderOrder = 13; m.renderOrder = 13;
    let m2 = null;
    if (glow) { // wider soft coloured underlay makes the arc read as a chunky swoosh
      m2 = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: slashTexture(), color: C(color).lerp(C('#ffb070'), 0.35), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m2.rotation.x = -Math.PI / 2; m2.scale.set(1.15, 1.15, 1); m2.position.y = -0.05; grp.add(m2);
    }
    return this.add(grp, (dt, t) => { const k = clamp(t / life); m.material.opacity = 1 - ease.inQuad(k); if (m2) m2.material.opacity = 0.5 * (1 - k); grp.scale.setScalar(0.85 + 0.3 * ease.outCubic(k)); }, life);
  }
  // vertical light beam
  pillar(p, { color = '#ffe070', r = 0.5, h = 6, life = 1, persistent = false, opacity = 0.8 } = {}) {
    if (!persistent) opacity *= this.dk(p);
    const g = new THREE.CylinderGeometry(r, r * 1.05, h, 20, 1, true); g.translate(0, h / 2, 0);
    const tex = shaftTexture();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: C(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    // flip uv so the bright end is at the bottom
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i));
    m.position.copy(p); m.renderOrder = 12;
    const f = this.add(m, (dt, t) => {
      m.rotation.y += dt * 0.6;
      if (!persistent) { const k = clamp(t / life); m.material.opacity = opacity * Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - ease.inQuad(k)); m.scale.set(1 - k * 0.5, 1, 1 - k * 0.5); }
      else m.material.opacity = opacity * (0.75 + 0.25 * Math.sin(t * 3));
      return f.alive !== false;
    }, persistent ? 0 : life);
    return f;
  }
  // jagged lightning between two points
  lightning(a, b, { color = '#fff6a0', width = 0.12, life = 0.25, jag = 0.5 } = {}) {
    const pts = []; const n = 10;
    for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); if (i > 0 && i < n) p.add(new THREE.Vector3(rand(-jag, jag), rand(-jag, jag) * 0.6, rand(-jag, jag))); pts.push(p); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 30, width, 5, false);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: C(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const g2 = new THREE.TubeGeometry(curve, 30, width * 3.5, 5, false);
    const m2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color: C(color), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const grp = new THREE.Group(); grp.add(m, m2);
    this.light(b, color, 12, 7, life);
    this.sparks(b, { n: 10, color, speed: 6, size: 0.3 });
    const dk = this.dk(b);
    return this.add(grp, (dt, t) => { const k = clamp(t / life); m.material.opacity = dk * (1 - k) * (0.6 + 0.4 * Math.random()); m2.material.opacity = dk * 0.25 * (1 - k); }, life);
  }
  // ground AoE telegraph (enemy windups): fills from center to edge over `time`.
  // Built to read on ANY floor (incl. a same-hued boss sigil): a dark translucent veil + ink contour give contrast on bright
  // floors, a hot near-white rim line and sweeping front give it on dark ones; crawling hatch stripes mark the danger area
  // and the rim pulses faster as the fill nears the edge.
  telegraph(p, r, time, color = '#ff5a5a') {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { uK: { value: 0 }, uT: { value: 0 }, uC: { value: C(color) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`uniform float uK, uT; uniform vec3 uC; varying vec2 vUv;
        void main() {
          vec2 q = vUv - 0.5; float d = length(q) * 2.0; if (d > 1.0) discard;
          float aa = fwidth(d) * 1.3, inside = step(d, uK);
          float ink = smoothstep(0.84 - aa, 0.84, d) * (1.0 - smoothstep(1.0 - aa, 1.0, d));
          float rim = smoothstep(0.875 - aa, 0.875, d) * (1.0 - smoothstep(0.95, 0.95 + aa, d));
          float lead = smoothstep(uK - 0.14, uK, d) * inside;
          float hatch = smoothstep(0.42, 0.5, abs(fract((q.x - q.y) * 6.0 + uT * 1.4) - 0.5) * 2.0 - 0.1);
          float urg = 0.72 + 0.28 * sin(uT * (9.0 + 22.0 * uK));
          vec3 hot = mix(uC, vec3(1.0), 0.36), ink3 = vec3(0.13, 0.05, 0.1);
          vec3 col = ink3; float a = 0.24;
          col = mix(col, uC, inside * (0.6 + 0.3 * hatch)); a = mix(a, 0.36 + 0.18 * hatch, inside);
          col = mix(col, hot, lead); a = max(a, lead * 0.82);
          col = mix(col, ink3, ink); a = max(a, ink * 0.72);
          col = mix(col, hot, rim); a = max(a, rim * (0.7 + 0.3 * urg));
          gl_FragColor = vec4(col, a);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat); m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.07, p.z); m.renderOrder = 9;
    return this.add(m, (dt, t) => { mat.uniforms.uK.value = clamp(t / time); mat.uniforms.uT.value = t; }, time + 0.05);
  }
  emoteTexture(kind) { return emoteTexture(kind); }
  // speech-bubble emote that follows an actor
  emote(actor, kind = 'heart', life = 1.8) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoteTexture(kind), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    s.renderOrder = 20; adoptSortedSprite(s, this.scene); // (drawn in the scene's depth-sorted bubble runs: gfx/spriteBatch.js)
    const h = (actor.rig?.height || 1.2) + 0.55;
    return this.add(s, (dt, t) => {
      const k = t / life;
      const pop = t < 0.25 ? ease.outBack(t / 0.25) : 1;
      const out = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      s.scale.setScalar(0.62 * pop * out);
      s.position.set(actor.pos.x, actor.pos.y + h + Math.sin(t * 5) * 0.04, actor.pos.z);
    }, life);
  }
}
