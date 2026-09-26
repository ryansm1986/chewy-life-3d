// High-level visual effects: particle presets, slash arcs, shockwaves, light pillars, lightning, telegraphs, emotes.
import * as THREE from 'three';
import { ParticleLayer } from './particles.js';
import { glowTexture, sparkleTexture, smokeTexture, softDotTexture, petalTexture, ringTexture, slashTexture, shaftTexture, leafParticleTexture } from './textures.js';
import { rand, TAU, clamp, ease } from '../core/util.js';

const _v = new THREE.Vector3();
const C = h => new THREE.Color(h);

function emoteTexture(kind) {
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
    this.emoteTex = new Map();
    this.lightPool = null;
  }
  setLightPool(lp) { this.lightPool = lp; }
  light(pos, color, intensity = 6, radius = 6, life = 0.3) { this.lightPool?.flash(pos, color, intensity, radius, life); }
  update(dt) {
    const cam = this.engine.camera;
    for (const l of this.layers) l.update(dt, cam);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.update(dt, f.t) === false || (f.life && f.t >= f.life)) { if (f.obj) { f.obj.parent?.remove(f.obj); f.obj.traverse?.(o => { o.geometry?.dispose?.(); }); } this.fx.splice(i, 1); }
    }
  }
  clear() { for (const l of this.layers) l.clear(); for (const f of this.fx) f.obj?.parent?.remove(f.obj); this.fx.length = 0; }
  add(obj, update, life = 0) { if (obj) this.scene.add(obj); const f = { obj, update, t: 0, life }; this.fx.push(f); return f; }

  // compile every effect's shader up front (call behind a loading transition) so first use doesn't hitch
  prewarm(renderer, camera) {
    const p = new THREE.Vector3(0, -50, 0);
    this.ring(p); this.slash(p, 0); this.pillar(p); this.telegraph(p, 1, 1);
    this.lightning(p, p.clone().setY(-49)); this.emote({ pos: p, rig: { height: 1 } }, 'heart', 0.1); this.emote({ pos: p, rig: { height: 1 } }, '!', 0.1);
    this.sparks(p); this.poof(p); this.fire(p); this.petals(p); this.stink(p);
    for (const l of this.layers) l.update(0.016, camera);
    try { renderer.compile(this.scene, camera); } catch (e) { /* ignore */ }
    this.clear();
  }
  // ------------------------------------------------------------------ particle presets
  sparks(p, { n = 10, color = '#fff2a0', speed = 5, size = 0.35, life = 0.35, up = 1.5, grav = 6 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.4, 1) * speed;
      this.spark.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: rand(0.2, 1) * up * s * 0.4, vz: Math.sin(a) * s, life: rand(0.6, 1) * life, size: size * rand(0.6, 1.2), size1: 0.02, color, alpha: 1, alpha1: 0.2, drag: 3, grav, spin: rand(-8, 8) });
    }
  }
  flash(p, color = '#ffffff', size = 1.4, life = 0.18) { this.glow.spawn({ x: p.x, y: p.y, z: p.z, life, size, size1: size * 1.6, color, alpha: 0.9, alpha1: 0 }); }
  hit(p, { color = '#fff4c0', crit = false, element = 'phys' } = {}) {
    const ec = { fire: '#ffa040', frost: '#9fe0ff', zap: '#fff27a', stink: '#a8e070', holy: '#fff6c0', phys: color }[element] || color;
    this.flash(p, ec, crit ? 2.2 : 1.1, crit ? 0.26 : 0.16);
    this.sparks(p, { n: crit ? 18 : 8, color: ec, speed: crit ? 7 : 4.5, size: crit ? 0.5 : 0.32 });
    if (crit) { this.ring(p, { color: '#ffd84a', r0: 0.2, r1: 1.6, life: 0.3, flat: false }); this.light(p, '#ffd070', 10, 6, 0.2); }
    if (element === 'fire') this.fire(p, 6);
    if (element === 'frost') this.frost(p, 6);
    if (element === 'zap') this.sparks(p, { n: 8, color: '#fff7a0', speed: 8, size: 0.25 });
    if (element === 'stink') this.stink(p, 4);
  }
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
  levelUp(p) {
    this.pillar(p, { color: '#ffe070', life: 1.6, r: 0.7, h: 7 });
    this.ring(p, { color: '#ffe070', r0: 0.2, r1: 3.2, life: 0.8 });
    for (let i = 0; i < 40; i++) { const a = rand(0, TAU), r = rand(0.2, 0.9); this.spark.spawn({ x: p.x + Math.cos(a) * r, y: p.y + rand(0, 0.5), z: p.z + Math.sin(a) * r, vy: rand(1.5, 4.5), life: rand(0.8, 1.6), size: rand(0.2, 0.45), size1: 0.02, color: i % 3 ? '#ffe070' : '#ffffff', alpha: 1, alpha1: 0, spin: rand(-4, 4) }); }
    this.petals(p.clone().setY(p.y + 1), 24, 1);
    this.light(p, '#ffe070', 14, 9, 1.2);
  }

  // ------------------------------------------------------------------ mesh effects
  ring(p, { color = '#ffffff', r0 = 0.2, r1 = 2, life = 0.4, flat = true, opacity = 0.9, y = 0.06 } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: ringTexture(), color: C(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    if (flat) m.rotation.x = -Math.PI / 2; else m.lookAt(this.engine.camera.position);
    m.position.set(p.x, p.y + y, p.z); m.renderOrder = 12;
    return this.add(m, (dt, t) => { const k = clamp(t / life); const r = r0 + (r1 - r0) * ease.outCubic(k); m.scale.setScalar(r); m.material.opacity = opacity * (1 - k); if (!flat) m.lookAt(this.engine.camera.position); }, life);
  }
  shockwave(p, r = 3, color = '#fff0c0') { this.ring(p, { color, r0: 0.3, r1: r, life: 0.45, opacity: 1 }); this.ring(p, { color: '#ffffff', r0: 0.1, r1: r * 0.7, life: 0.3 }); this.dustRing(p, r * 0.8); }
  dustRing(p, r = 2, n = 18) {
    for (let i = 0; i < n; i++) { const a = i / n * TAU; this.smoke.spawn({ x: p.x + Math.cos(a) * 0.4, y: p.y + 0.1, z: p.z + Math.sin(a) * 0.4, vx: Math.cos(a) * r * 2.2, vy: rand(0.3, 1), vz: Math.sin(a) * r * 2.2, life: rand(0.5, 0.8), size: 0.45, size1: 1.1, color: '#e8dcc8', alpha: 0.7, alpha1: 0, drag: 5 }); }
  }
  // horizontal crescent slash around an actor. dir = facing angle (radians, atan2(x,z)), arc in radians
  slash(p, dir, { color = '#fffaf0', arc = 2.6, r = 1.3, life = 0.22, y = 0.55, reverse = false, width = 0.55, tilt = 0 } = {}) {
    const g = new THREE.RingGeometry(r - width, r, 32, 1, 0, arc);
    // remap uv: u along arc, v across
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), yy = pos.getY(i); const a = Math.atan2(yy, x); const rr = Math.hypot(x, yy);
      uv.setXY(i, reverse ? 1 - a / arc : a / arc, (r - rr) / width);
    }
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: slashTexture(), color: C(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const grp = new THREE.Group(); grp.add(m);
    m.rotation.x = -Math.PI / 2; // lie flat
    grp.position.set(p.x, p.y + y, p.z);
    grp.rotation.set(tilt, dir + Math.PI / 2 + arc / 2, 0, 'YXZ');
    grp.renderOrder = 13; m.renderOrder = 13;
    return this.add(grp, (dt, t) => { const k = clamp(t / life); m.material.opacity = 1 - ease.inQuad(k); grp.scale.setScalar(0.85 + 0.3 * ease.outCubic(k)); }, life);
  }
  // vertical light beam
  pillar(p, { color = '#ffe070', r = 0.5, h = 6, life = 1, persistent = false, opacity = 0.8 } = {}) {
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
    return this.add(grp, (dt, t) => { const k = clamp(t / life); m.material.opacity = (1 - k) * (0.6 + 0.4 * Math.random()); m2.material.opacity = 0.25 * (1 - k); }, life);
  }
  // ground AoE telegraph (enemy windups): fills from center to edge over `time`
  telegraph(p, r, time, color = '#ff5a5a') {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { uK: { value: 0 }, uC: { value: C(color) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uK; uniform vec3 uC; varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.0; if (d>1.0) discard; float edge = smoothstep(0.88,0.95,d)*(1.0-smoothstep(0.97,1.0,d)); float fill = step(d, uK)*0.28 + smoothstep(uK-0.06, uK, d)*step(d,uK)*0.4; gl_FragColor = vec4(uC, edge*0.9 + fill); }',
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat); m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.07, p.z); m.renderOrder = 9;
    return this.add(m, (dt, t) => { mat.uniforms.uK.value = clamp(t / time); }, time + 0.05);
  }
  // speech-bubble emote that follows an actor
  emote(actor, kind = 'heart', life = 1.8) {
    if (!this.emoteTex.has(kind)) this.emoteTex.set(kind, emoteTexture(kind));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.emoteTex.get(kind), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    s.renderOrder = 20;
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
