// The rest of Poe's effects (docs/POE.md §3, phase 2): kunai and their thunks, the stitched shadows, bone shuriken
// falling as rain and spiralling out as a galaxy, the bouncing Puff Ball and its burst, the substitution log, Thunder
// Paw's bolt and paw prints, the Smoke Dragon, the zone rings of her traps, the Bullseye mark. They extend PoeFX
// (gfx/poeFx.js) and follow its budget rules: pooled meshes, module-level geometry / canvas textures, two particle
// layers, normal blend for anything big (only small glints are additive), sizes capped so foes stay readable.
// combat/poeArts.js, poeJutsu.js and poeShadow.js are the callers (they import this module for its side effect).
import * as THREE from 'three';
import { PoeFX, PF, POE_COL, G_PLANE, newCanvas, canvasTex, TEX, bandTex, streakFn } from './poeFx.js';
import { glowTexture } from './textures.js';
import { rand, TAU, clamp, ease } from '../core/util.js';
import { kunaiGeo, starGeo, logGeo, caltropGeo, propMat, prewarmCopies } from '../actors/poeProps.js';

const P = POE_COL, _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Vector3();
const BOLT_PTS = Array.from({ length: 8 }, () => new THREE.Vector3());
const DRAGON_LINKS = 10, DRAGON_PATH = 40;
const C = h => new THREE.Color(h);
const COL = { fire: C('#ff8a3a'), fire2: C('#ffd060'), ember: C('#ff5a3a'), zap: C('#fff27a'), zap2: C('#bfe0ff'), paint: C('#e8503a'), paint2: C('#fff6e8'), bark: C('#a8743e'), leaf: C('#8fd068'), stink: C('#c8e0a0'), dragon: C('#e8e0f4'), dragon2: C('#b8a8d8') };
export const ARTS_COL = COL;
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------------ textures
// a stitched shadow: an ink pool with a ring of cross-stitches round it
function stitchTex() {
  if (TEX.stitch) return TEX.stitch;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  const gr = g.createRadialGradient(0, 0, 10, 0, 0, 120); gr.addColorStop(0, 'rgba(26,18,36,0.85)'); gr.addColorStop(0.68, 'rgba(34,24,48,0.75)'); gr.addColorStop(0.86, 'rgba(70,52,100,0.4)'); gr.addColorStop(1, 'rgba(90,70,130,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 120, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(240,232,255,0.92)'; g.lineWidth = 6;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, x = Math.cos(a) * 92, y = Math.sin(a) * 92, s = 11; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(-s, -s); g.lineTo(s, s); g.moveTo(s, -s); g.lineTo(-s, s); g.stroke(); g.restore(); }
  g.setLineDash([10, 9]); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 72, 0, TAU); g.stroke();
  return (TEX.stitch = canvasTex(c));
}
// a dotted ring for the edge of a trap's reach (caltrops, the buzz-saw's pull, the stitch): dashes and four tick marks
function dashRingTex() {
  if (TEX.dash) return TEX.dash;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7;
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; g.beginPath(); g.arc(0, 0, 118, a + 0.05, a + TAU / 24 - 0.07); g.stroke(); }
  const gr = g.createRadialGradient(0, 0, 60, 0, 0, 122); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.18)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 122, 0, TAU); g.fill();
  return (TEX.dash = canvasTex(c));
}
// the Puff Ball: a round cartoon fireball (orange body, yellow heart, a darker rim and a shine), drawn flat as a sprite
function fireTex() {
  if (TEX.fire) return TEX.fire;
  const { c, g } = newCanvas(128); g.translate(64, 64);
  g.beginPath(); for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU, r = 50 + 5 * Math.sin(a * 6) + 3 * Math.sin(a * 11 + 1); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
  const gr = g.createRadialGradient(-8, -10, 4, 0, 0, 56); gr.addColorStop(0, '#fff6c0'); gr.addColorStop(0.35, '#ffd060'); gr.addColorStop(0.72, '#ff8a3a'); gr.addColorStop(1, '#e8503a');
  g.fillStyle = gr; g.fill(); g.strokeStyle = '#8a2a2a'; g.lineWidth = 5; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-18, -20, 11, 7, -0.6, 0, TAU); g.fill();
  return (TEX.fire = canvasTex(c));
}
// a paw print burned into the floor by Thunder Paw (white art: tinted per use)
function pawTex() {
  if (TEX.paw) return TEX.paw;
  const { c, g } = newCanvas(256); g.translate(128, 140);
  const blob = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); g.stroke(); };
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 10;
  blob(0, 22, 52, 42); for (const [x, y, r] of [[-56, -26, 20], [-22, -62, 21], [22, -62, 21], [56, -26, 20]]) blob(x, y, r, r * 1.2);
  return (TEX.paw = canvasTex(c));
}
// the smoke dragon's head: a round lilac cloud head with a curly mane, two dark eyes, whiskers and a little grin
function dragonTex() {
  if (TEX.dragon) return TEX.dragon;
  const { c, g } = newCanvas(256); g.translate(128, 136);
  const INKD = '#2e2440';
  // a cloud-dragon head seen from the front: a puffy lilac crown of five smoke balls round a big round face, two swept
  // horns, long curling whiskers, determined eyes and a toothy grin — a heavy ink outline so it reads on grass and sand
  const balls = [[-62, -44, 38], [0, -66, 42], [62, -44, 38], [-80, 10, 32], [80, 10, 32]];
  g.strokeStyle = INKD; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 36, -78); g.quadraticCurveTo(s * 64, -124, s * 104, -118); g.stroke(); }
  g.strokeStyle = '#fff6dc'; g.lineWidth = 4; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 38, -80); g.quadraticCurveTo(s * 64, -120, s * 100, -116); g.stroke(); }
  g.fillStyle = INKD; for (const [x, y, r] of [...balls, [0, 8, 74]]) { g.beginPath(); g.arc(x, y, r + 8, 0, TAU); g.fill(); }
  for (const [x, y, r] of balls) { const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, 4, x, y, r); gr.addColorStop(0, '#f4efff'); gr.addColorStop(0.65, '#c8b8ec'); gr.addColorStop(1, '#8a76c0'); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = gr; g.fill(); }
  const fg = g.createRadialGradient(-22, -18, 8, 0, 8, 76); fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.55, '#e8e0fa'); fg.addColorStop(1, '#a898d8');
  g.beginPath(); g.arc(0, 8, 74, 0, TAU); g.fillStyle = fg; g.fill();
  // whiskers
  g.strokeStyle = INKD; g.lineWidth = 7;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 46, 38); g.bezierCurveTo(s * 96, 40, s * 104, 82, s * 124, 92); g.stroke(); }
  // eyes: big and fierce, a shine each, and slanted brows
  for (const s of [-1, 1]) {
    g.fillStyle = INKD; g.beginPath(); g.ellipse(s * 28, -2, 15, 19, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffd860'; g.beginPath(); g.ellipse(s * 28, 1, 9, 12, 0, 0, TAU); g.fill();
    g.fillStyle = INKD; g.beginPath(); g.ellipse(s * 28, 2, 4, 9, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(s * 28 - 4, -7, 4.5, 0, TAU); g.fill();
    g.strokeStyle = INKD; g.lineWidth = 8; g.beginPath(); g.moveTo(s * 10, -30); g.lineTo(s * 46, -38); g.stroke();
  }
  // a toothy grin
  g.beginPath(); g.moveTo(-30, 30); g.quadraticCurveTo(0, 62, 30, 30); g.closePath(); g.fillStyle = '#5a3a6a'; g.fill(); g.strokeStyle = INKD; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#ffffff'; for (const x of [-18, 12]) { g.beginPath(); g.moveTo(x, 31); g.lineTo(x + 6, 31); g.lineTo(x + 3, 40); g.closePath(); g.fill(); }
  return (TEX.dragon = canvasTex(c));
}
// a link of the dragon's body: a lumpy smoke ball, shaded lilac to violet, in a heavy ink outline with a highlight
function segTex() {
  if (TEX.seg) return TEX.seg;
  const { c, g } = newCanvas(128); g.translate(64, 64);
  const lump = (r, n = 48) => { g.beginPath(); for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, rr = r + 4 * Math.sin(a * 5 + 0.4) + 2 * Math.sin(a * 9); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
  lump(52); g.fillStyle = '#2e2440'; g.fill();
  lump(45); const gr = g.createRadialGradient(-14, -16, 4, 0, 0, 50); gr.addColorStop(0, '#f6f2ff'); gr.addColorStop(0.55, '#c8b8ec'); gr.addColorStop(1, '#7a66b0'); g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-15, -18, 12, 7, -0.6, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(90,70,140,0.5)'; g.lineWidth = 4; g.beginPath(); g.arc(4, 6, 24, 0.3, 2.3); g.stroke();
  return (TEX.seg = canvasTex(c));
}
// the Bullseye mark: concentric red / cream rings (the floor marker) …
function bullTex() {
  if (TEX.bull) return TEX.bull;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  for (const [r, col] of [[120, 'rgba(232,80,58,0.85)'], [96, 'rgba(255,246,232,0.8)'], [72, 'rgba(232,80,58,0.85)'], [48, 'rgba(255,246,232,0.8)'], [24, 'rgba(232,80,58,0.95)']]) { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, 60, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill(); g.globalCompositeOperation = 'source-over';
  return (TEX.bull = canvasTex(c));
}
// … and the badge over its head: a small target with one pip lit per stack (drawn once per count)
const BADGE = [];
function badgeTex(n) {
  if (BADGE[n]) return BADGE[n];
  const { c, g } = newCanvas(128); g.translate(64, 64);
  g.fillStyle = '#4a2c2a'; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.fill();
  for (const [r, col] of [[34, '#e8503a'], [24, '#fff6e8'], [14, '#e8503a']]) { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); }
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, x = Math.cos(a) * 52, y = Math.sin(a) * 52; g.fillStyle = '#4a2c2a'; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill(); g.fillStyle = i < n ? '#ffd860' : '#8a6a6a'; g.beginPath(); g.arc(x, y, 5.5, 0, TAU); g.fill(); }
  return (BADGE[n] = canvasTex(c));
}

// ------------------------------------------------------------------ the extension
const X = {
  /** a pooled prop mesh ('kunai' | 'star' | 'log' | 'caltrop'): give it back with this.give(kind, m) */
  prop(kind) {
    return this.take(kind, () => {
      const geo = kind === 'kunai' ? kunaiGeo() : kind === 'star' ? starGeo() : kind === 'log' ? logGeo() : caltropGeo();
      const m = new THREE.Mesh(geo, propMat()); m.castShadow = kind === 'log'; return m;
    });
  },
  /** point a kunai mesh along dir (flat flight, a slight nose-down) */
  aimProp(m, dir, pitch = 0) { m.quaternion.setFromUnitVectors(FWD, _a.set(dir.x, pitch, dir.z).normalize()); },
  /** a kunai's wake: a thin cream streak and, now and then, a glint */
  kunaiTrail(pos, dir, dt) {
    for (let i = this.emit('kt', 34, dt); i > 0; i--) this.pn.spawn({ frame: PF.STREAK, x: pos.x - dir.x * 0.18, y: pos.y, z: pos.z - dir.z * 0.18, vx: -dir.x * 2, vz: -dir.z * 2, life: 0.12, size: 0.42, size1: 0.12, color: P.cream, alpha: 0.6, alpha1: 0, fn: streakFn });
  },
  /** thunk: a kunai stuck slanting in the floor; it holds a moment, then sinks away */
  kunaiStick(pos, dir, life = 0.7) {
    const m = this.prop('kunai'); this.aimProp(m, dir, -0.9);
    m.position.set(pos.x, (pos.y || 0) + 0.08, pos.z); m.scale.setScalar(1.2);
    this.pn.spawn({ frame: PF.DOT, x: pos.x, y: (pos.y || 0) + 0.05, z: pos.z, life: 0.3, size: 0.25, size1: 0.45, color: C('#d8c8a8'), alpha: 0.6, alpha1: 0 });
    const y0 = m.position.y;
    this.run((dt, t) => { const k = clamp((t - life * 0.6) / (life * 0.4)); m.position.y = y0 - 0.15 * k; m.scale.setScalar(1.2 * (1 - 0.6 * k)); return t < life; }, () => this.give('kunai', m));
  },
  /** a thread of ink from a to b (Shadow Stitch pins its foes): dots along the line, quickly gone */
  thread(a, b, life = 0.45) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), n = Math.min(12, Math.ceil(d * 3));
    for (let i = 0; i <= n; i++) { const u = i / n; this.pn.spawn({ frame: PF.DOT, x: a.x + dx * u, y: (a.y || 0) + 0.12 + Math.sin(u * Math.PI) * 0.15, z: a.z + dz * u, life: life * (0.6 + 0.4 * u), size: 0.12, size1: 0.06, color: i % 2 ? P.ink : P.ink2, alpha: 0.9, alpha1: 0, fadeIn: 0.03 }); }
  },
  /** a stitched shadow under a rooted foe: follows it for dur, then frays away. → handle { end() } */
  stitchMark(e, dur) {
    const m = this.take('stitch', () => { const o = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: stitchTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })); o.renderOrder = 6; return o; });
    const r = Math.max(0.55, (e.bodyR || e.radius || 0.4) * 1.5);
    let cut = dur; // (its foe fell: fray away now)
    const H = this.run((dt, t) => {
      if (!e.alive && cut === dur) cut = Math.min(dur, t + 0.25);
      const k = clamp(t / 0.15), out = clamp((t - (cut - 0.25)) / 0.25);
      m.position.set(e.pos.x, (e.pos.y || 0) + 0.035, e.pos.z); m.scale.setScalar(r * (0.4 + 0.6 * ease.outBack(k)) * (1 + 0.25 * out)); m.rotation.y = t * 0.6;
      m.material.opacity = 0.95 * (1 - out);
      return t < cut;
    }, () => this.give('stitch', m));
    return H;
  },
  /** a flat dashed ring on the floor marking a trap's reach (caltrops, the buzz-saw): grows in, holds, fades. → handle */
  zoneRing(pos, r, life, color = P.cream, alpha = 0.55, follow = null) {
    const m = this.take('zring', () => { const o = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: dashRingTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })); o.renderOrder = 6; return o; });
    m.material.color.copy(color);
    const x0 = pos.x, z0 = pos.z, y0 = (pos.y || 0) + 0.04;
    return this.run((dt, t) => {
      const k = ease.outBack(clamp(t / 0.22)), out = clamp((t - (life - 0.3)) / 0.3);
      if (follow) m.position.set(follow.x, (follow.y || 0) + 0.04, follow.z); else m.position.set(x0, y0, z0);
      m.scale.setScalar(r * k); m.rotation.y = t * 0.35; m.material.opacity = alpha * (1 - out);
      return t < life;
    }, () => this.give('zring', m));
  },
  /** a falling shuriken's streak (it drops almost straight down: a few cream motes left behind it) */
  starTrail(pos, dt) { for (let i = this.emit('st', 40, dt); i > 0; i--) this.pn.spawn({ frame: PF.DOT, x: pos.x + rand(-0.04, 0.04), y: pos.y + 0.12, z: pos.z + rand(-0.04, 0.04), vy: 0.6, life: 0.16, size: 0.12, size1: 0.02, color: P.cream, alpha: 0.8, alpha1: 0 }); },
  /** a tiny shuriken lands: bone flecks, a puff of dust, a glint */
  starImpact(pos, big = 1) {
    this.flecks(_a.set(pos.x, (pos.y || 0) + 0.1, pos.z), Math.round(3 * big));
    this.pn.spawn({ frame: PF.PUFF, x: pos.x, y: (pos.y || 0) + 0.12, z: pos.z, vy: 0.3, life: 0.35, size: 0.22 * big, size1: 0.5 * big, color: C('#e8dcc8'), alpha: 0.55, alpha1: 0 });
    this.pa.spawn({ frame: PF.SPARK, x: pos.x, y: (pos.y || 0) + 0.2, z: pos.z, life: 0.18, size: 0.32 * big, size1: 0.06, color: P.cream, alpha: 0.8, alpha1: 0, spin: 6 });
  },
  /** Thousand Star Flurry: three spiral arms of tiny bone shuriken streaming out round her (center is read each frame:
   *  it follows her). r = reach. → handle (run record; .stop() ends it early) */
  flurry(center, r, dur) {
    const H = this.run((dt, t) => {
      const fade = 1 - clamp((t - (dur - 0.25)) / 0.25), cx = center.x, cz = center.z, cy = (center.y || 0) + 0.55, spin = t * 7;
      for (let i = this.emit('fl', 120 * fade, dt); i > 0; i--) {
        const arm = (i % 3) * (TAU / 3), a = spin + arm + rand(-0.15, 0.15), s = r * rand(1.6, 2.4);
        // each one flies out along its arm and curls with the spin (tangential velocity): a spiral galaxy
        this.pn.spawn({ frame: PF.SHURI, x: cx + Math.cos(a) * 0.4, y: cy + rand(-0.1, 0.25), z: cz + Math.sin(a) * 0.4, vx: Math.cos(a) * s - Math.sin(a) * s * 0.7, vz: Math.sin(a) * s + Math.cos(a) * s * 0.7, life: r / s * 1.05, size: rand(0.22, 0.3), size1: 0.16, color: P.bone, alpha: 1, alpha1: 0.4, spin: rand(14, 22) });
      }
      if (Math.random() < dt * 30 * fade) { const a = rand(0, TAU), d = rand(0.3, 1) * r; this.pa.spawn({ frame: PF.SPARK, x: cx + Math.cos(a) * d, y: cy, z: cz + Math.sin(a) * d, life: 0.2, size: 0.28, size1: 0.05, color: P.mustard, alpha: 0.7, alpha1: 0 }); }
      return t < dur && !H.stopped;
    });
    H.stop = () => { H.stopped = true; };
    return H;
  },
  /** the Puff Ball mesh: a round cartoon fireball sprite with a small warm glow (pooled). → Group with .userData.{ball, glow} */
  fireball(size = 1) {
    const g = this.take('fireball', () => {
      const root = new THREE.Group();
      const ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: COL.fire, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      ball.renderOrder = 12; glow.renderOrder = 11; root.add(glow, ball); root.userData = { ball, glow };
      return root;
    });
    g.userData.ball.scale.setScalar(0.85 * Math.min(size, 1.6)); g.userData.glow.scale.setScalar(Math.min(1.1, 0.9 * size)); g.userData.glow.material.opacity = 0.3; g.userData.size = size; // (a bigger charged ball, the same small warm glow: it never tints the floor round it)
    return g;
  },
  /** its wake: little flames licking back off it and a curl of smoke */
  fireTrail(pos, dir, dt, size = 1) {
    const k = Math.min(size, 1.3);
    for (let i = this.emit('ff', 34 * k, dt); i > 0; i--) this.pn.spawn({ frame: PF.PUFF, x: pos.x + rand(-0.08, 0.08), y: pos.y + rand(-0.05, 0.1), z: pos.z + rand(-0.08, 0.08), vx: -dir.x * 1.5, vy: rand(0.6, 1.2), vz: -dir.z * 1.5, life: rand(0.16, 0.26), size: 0.24 * k, size1: 0.06, color: Math.random() < 0.5 ? COL.fire : COL.fire2, alpha: 0.85, alpha1: 0 });
    if (Math.random() < dt * 8) this.pn.spawn({ frame: PF.CURL, x: pos.x, y: pos.y + 0.15, z: pos.z, vy: 0.6, life: 0.5, size: 0.2, size1: 0.3, color: P.smoke2, alpha: 0.6, alpha1: 0, spin: 3 });
  },
  /** a bounce on the floor: a scorch puff */
  fireHop(pos) { this.pn.spawn({ frame: PF.PUFF, x: pos.x, y: (pos.y || 0) + 0.1, z: pos.z, life: 0.3, size: 0.25, size1: 0.55, color: C('#d8c8b8'), alpha: 0.5, alpha1: 0 }); this.vfx.decal(pos, { r: 0.35, color: '#3a2418', life: 1.2, opacity: 0.3 }); },
  /** FWOOMPH: a round ball of flame puffs and embers (normal blend, capped), a scorch, a short warm light */
  fireBurst(pos, r = 1.4) {
    r = Math.min(r, 2.6); // (a charged ball's burst grows, its look is capped: it must never flood the screen)
    const x0 = pos.x, y0 = (pos.y || 0) + 0.5, z0 = pos.z, k = Math.min(1.4, r / 1.4);
    for (let i = 0; i < 14; i++) { const a = rand(0, TAU), up = rand(-0.2, 1), s = rand(1.6, 3.2) * k; this.pn.spawn({ frame: PF.PUFF, x: x0, y: y0, z: z0, vx: Math.cos(a) * s, vy: up * s * 0.7, vz: Math.sin(a) * s, life: rand(0.3, 0.5), size: rand(0.3, 0.42) * k, size1: 0.1, color: i % 3 ? COL.fire : COL.fire2, alpha: 0.95, alpha1: 0, drag: 4 }); }
    for (let i = 0; i < 10; i++) { const a = rand(0, TAU), s = rand(2, 4) * k; this.pa.spawn({ frame: PF.DOT, x: x0, y: y0, z: z0, vx: Math.cos(a) * s, vy: rand(1, 3.5), vz: Math.sin(a) * s, life: rand(0.35, 0.6), size: 0.1, size1: 0.03, color: COL.ember, alpha: 1, alpha1: 0, grav: 6 }); }
    for (let i = 0; i < 4; i++) this.pn.spawn({ frame: PF.PUFF, x: x0 + rand(-0.3, 0.3), y: y0 + 0.2, z: z0 + rand(-0.3, 0.3), vy: 0.7, life: rand(0.7, 1), size: 0.35 * k, size1: 0.7 * k, color: P.smoke2, alpha: 0.45, alpha1: 0, fadeIn: 0.1 });
    this.vfx.decal(pos, { r: r * 0.6, color: '#3a2418', life: 2.4, opacity: 0.4 });
    this.ring(pos, Math.min(r * 0.8, 1.8), 0.3, COL.fire2, 0.3);
    this.vfx.light(_a.set(x0, y0, z0), '#ff9a4a', 1.1, Math.min(2, r), 0.14); // (only the fire and its scorch read: no glow over the floor)
  },
  /** the log pops: a smoke poof, wood chips and a leaf, and a cartoon POP! */
  logPop(pos, r = 2.2) {
    this.puff(pos, { r: Math.min(r, 2.4) * 0.6, n: 12 });
    for (let i = 0; i < 9; i++) { const a = rand(0, TAU), s = rand(2, 4); this.pn.spawn({ frame: PF.BONE, x: pos.x, y: (pos.y || 0) + 0.3, z: pos.z, vx: Math.cos(a) * s, vy: rand(2, 4), vz: Math.sin(a) * s, life: rand(0.4, 0.6), size: rand(0.12, 0.18), size1: 0.08, color: COL.bark, alpha: 1, alpha1: 0.3, grav: 9, spin: rand(-10, 10) }); }
    this.pn.spawn({ frame: PF.LEAF, x: pos.x, y: (pos.y || 0) + 0.4, z: pos.z, vx: rand(-1, 1), vy: 2.5, vz: rand(-1, 1), life: 0.9, size: 0.3, size1: 0.26, color: COL.leaf, alpha: 1, alpha1: 0, grav: 4, spin: 4 });
    this.word('POP!', _a.set(pos.x, (pos.y || 0) + 1.4, pos.z), { a: '#fff6e0', b: '#c8e0a0', size: 0.95, life: 0.6 });
  },
  /** Thunder Paw: a crackling bolt from the sky onto pos, a paw print burned glowing into the floor, sparks */
  thunderStrike(pos, k = 1) {
    const top = _b.set(pos.x + rand(-0.6, 0.6), (pos.y || 0) + 9, pos.z + rand(-0.6, 0.6));
    this.bolt(top, _a.set(pos.x, (pos.y || 0) + 0.2, pos.z), { size: 0.26 + 0.06 * k, jag: 0.55, life: 0.24 });
    this.pawPrint(pos, 0.42 + 0.06 * k, 1.1);
    for (let i = 0; i < 8; i++) { const a = rand(0, TAU), s = rand(2, 4); this.pa.spawn({ frame: PF.SPARK, x: pos.x, y: (pos.y || 0) + 0.3, z: pos.z, vx: Math.cos(a) * s, vy: rand(1, 3), vz: Math.sin(a) * s, life: rand(0.2, 0.35), size: 0.2, size1: 0.04, color: COL.zap, alpha: 1, alpha1: 0, grav: 4 }); }
    this.vfx.light(_a.set(pos.x, (pos.y || 0) + 1, pos.z), '#fff2a0', 2, 2.2, 0.12); // (one small blink where it lands)
  },
  /** the arc that leaps between two chained foes */
  chainArc(a, b) { this.bolt(a, b, { size: 0.2, jag: 0.35, life: 0.2 }); },
  /** a cartoon bolt from a to b drawn as a zig-zag of additive motes (no tube geometry, no flood light: vfx.lightning
   *  lights 7 m round each end, which a chain of ten turned into a wash over the whole fight) */
  bolt(a, b, { size = 0.22, jag = 0.45, life = 0.22 } = {}) {
    const n = 7, pts = BOLT_PTS;
    for (let i = 0; i <= n; i++) { const t = i / n; pts[i].lerpVectors(a, b, t); if (i > 0 && i < n) pts[i].add(_q2.set(rand(-jag, jag), rand(-jag, jag) * 0.5, rand(-jag, jag))); }
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[i + 1], L = p0.distanceTo(p1), m = Math.max(2, Math.ceil(L / 0.2));
      for (let j = 0; j < m; j++) {
        const u = j / m, x = p0.x + (p1.x - p0.x) * u, y = p0.y + (p1.y - p0.y) * u, z = p0.z + (p1.z - p0.z) * u;
        this.pa.spawn({ frame: PF.DOT, x, y, z, life: life * rand(0.7, 1), size: size * 0.8, size1: size * 0.25, color: COL.zap2, alpha: 0.9, alpha1: 0 });
        if (j % 3 === 0) this.pn.spawn({ frame: PF.DOT, x, y, z, life: life * 0.8, size: size * 1.5, size1: size * 0.6, color: COL.zap, alpha: 0.4, alpha1: 0 }); // (the glow in normal blend: stacked additive glows bloomed the whole fight yellow)
      }
    }
  },
  /** a glowing paw print on the floor that cools from gold to nothing */
  pawPrint(pos, r = 0.8, life = 1.4) {
    const m = this.take('paw', () => { const o = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: pawTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })); o.renderOrder = 6; return o; });
    m.position.set(pos.x, (pos.y || 0) + 0.04, pos.z); m.rotation.y = rand(0, TAU); m.scale.setScalar(r);
    this.run((dt, t) => { const k = t / life; m.material.color.copy(COL.zap).lerp(C('#4a3c62'), clamp(k * 3)); m.material.opacity = 0.6 * (1 - ease.inQuad(clamp(k))); return k < 1; }, () => this.give('paw', m));
  },
  /** the crackle round her raised paw while it charges / just before the slap */
  crackle(pos, dt, rate = 30) {
    for (let i = this.emit('ck', rate, dt); i > 0; i--) { const a = rand(0, TAU), d = rand(0.08, 0.25); this.pa.spawn({ frame: PF.SPARK, x: pos.x + Math.cos(a) * d, y: pos.y + rand(-0.1, 0.15), z: pos.z + Math.sin(a) * d, life: rand(0.08, 0.16), size: rand(0.14, 0.24), size1: 0.03, color: Math.random() < 0.3 ? COL.zap2 : COL.zap, alpha: 1, alpha1: 0, spin: rand(-20, 20) }); }
  },
  /** the Smoke Dragon: a puffy cloud head (eyes, horns, whiskers, a grin) leading a body of ten ink-outlined smoke
   *  links that follow its weaving path like a kite tail, a lingering smoke trail and a shadow on the floor where it
   *  passed. All normal blend (it reads by its outline, not by glowing). → handle { set(pos, dir, dt, width), end() } */
  dragon(scale = 1) {
    const D = this.take('dragon', () => {
      const root = new THREE.Group(), head = new THREE.Sprite(new THREE.SpriteMaterial({ map: dragonTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      const segMat = new THREE.SpriteMaterial({ map: segTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false }), segs = [];
      for (let i = 0; i < DRAGON_LINKS; i++) { const sp = new THREE.Sprite(segMat); sp.renderOrder = 12; segs.push(sp); root.add(sp); }
      head.renderOrder = 13; root.add(head);
      root.userData = { head, segs, segMat, path: Array.from({ length: DRAGON_PATH }, () => new THREE.Vector3()) };
      return root;
    });
    const { head, segs, segMat, path } = D.userData;
    let t = 0, n = 0, fade = 1;
    const sc = Math.min(1.6, scale);
    head.scale.setScalar(1.45 * sc); head.material.opacity = 1; segMat.opacity = 0.9; // (the links a touch see-through: the foes behind it still read)
    for (const s of segs) s.visible = false;
    const H = { alive: true, end: () => {
      if (!H.alive) return; H.alive = false;
      // it unravels into smoke: the links puff away from the tail first, then the head
      this.run((dt, tt) => {
        fade = 1 - tt / 0.45; head.material.opacity = Math.max(0, fade); segMat.opacity = Math.max(0, fade) * 0.9;
        if (Math.random() < dt * 30) { const s = segs[(Math.random() * segs.length) | 0]; if (s.visible) this.pn.spawn({ frame: PF.PUFF, x: s.position.x, y: s.position.y, z: s.position.z, vy: 0.5, life: 0.6, size: 0.5 * sc, size1: 0.9 * sc, color: COL.dragon, alpha: 0.6, alpha1: 0 }); }
        return tt < 0.45;
      }, () => this.give('dragon', D));
    }, set: (pos, dir, dt, width) => {
      t += dt;
      const side = Math.sin(t * 5) * 0.55 * sc;
      head.position.set(pos.x - dir.z * side, (pos.y || 0) + 1.05 * sc + Math.sin(t * 7) * 0.1, pos.z + dir.x * side);
      head.material.rotation = Math.sin(t * 5) * 0.14;
      // the path its head has taken (a point every 0.16 m), the links strung along it, tapering to a wispy tail
      if (n === 0 || head.position.distanceTo(path[0]) > 0.16 * sc) { const last = path[DRAGON_PATH - 1]; for (let i = DRAGON_PATH - 1; i > 0; i--) path[i] = path[i - 1]; path[0] = last.copy(head.position); n = Math.min(DRAGON_PATH, n + 1); }
      for (let i = 0; i < segs.length; i++) {
        const j = Math.min(n - 1, (i + 1) * 3), sp = segs[i];
        sp.visible = n > (i + 1) * 3;
        if (!sp.visible) continue;
        const k = 1 - i / segs.length, p = path[j];
        sp.position.set(p.x, p.y - 0.12 * (1 - k) * sc + Math.sin(t * 7 - i * 0.7) * 0.06, p.z);
        sp.scale.setScalar((0.4 + 0.62 * k) * sc);
        sp.material.rotation = i * 0.9 + t * 2;
      }
      // a smoke trail that lingers where it passed, and its shadow on the floor
      for (let i = this.emit('dg', 34 * sc, dt); i > 0; i--) {
        const p = path[Math.min(n - 1, 8 + ((Math.random() * 20) | 0))] || head.position;
        this.pn.spawn({ frame: PF.PUFF, x: p.x + rand(-0.25, 0.25), y: (pos.y || 0) + rand(0.3, 0.9) * sc, z: p.z + rand(-0.25, 0.25), vy: rand(0.05, 0.25), life: rand(1, 1.5), size: rand(0.35, 0.5) * sc, size1: rand(0.8, 1.1) * sc, color: Math.random() < 0.5 ? COL.dragon : COL.dragon2, alpha: 0.5, alpha1: 0, fadeIn: 0.15, drag: 1, spin: rand(-0.6, 0.6) });
      }
      if (Math.random() < dt * 12) this.pn.spawn({ frame: PF.CURL, x: head.position.x, y: head.position.y + 0.4 * sc, z: head.position.z, vy: 0.5, life: 0.55, size: 0.3, size1: 0.45, color: P.white, alpha: 0.9, alpha1: 0, spin: 3 });
      for (let i = this.emit('dgs', 22, dt); i > 0; i--) this.pn.spawn({ frame: PF.INK, x: pos.x + rand(-0.35, 0.35) * width, y: (pos.y || 0) + 0.06, z: pos.z + rand(-0.35, 0.35) * width, life: 1.1, size: 0.7, size1: 1.1, color: P.ink2, alpha: 0.32, alpha1: 0, fadeIn: 0.1 });
    } };
    return H;
  },
  /** an afterimage bursting into blinding smoke */
  imageBurst(pos, r = 1.5) {
    this.puff(pos, { r: r * 0.7, n: 10, low: true });
    for (let i = 0; i < 5; i++) { const a = rand(0, TAU); this.pa.spawn({ frame: PF.SPARK, x: pos.x + Math.cos(a) * 0.3, y: (pos.y || 0) + rand(0.4, 1.1), z: pos.z + Math.sin(a) * 0.3, vy: 0.8, life: 0.3, size: 0.22, size1: 0.05, color: P.violet, alpha: 0.9, alpha1: 0 }); }
  },
  /** a ninja's backflip: a ring of dust where she took off */
  flipDust(pos) { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; this.pn.spawn({ frame: PF.PUFF, x: pos.x + Math.cos(a) * 0.2, y: (pos.y || 0) + 0.1, z: pos.z + Math.sin(a) * 0.2, vx: Math.cos(a) * 2, vy: 0.3, vz: Math.sin(a) * 2, life: 0.35, size: 0.2, size1: 0.45, color: C('#e8dcc8'), alpha: 0.55, alpha1: 0, drag: 4 }); } },
  /** Bullseye: the target on the floor under a foe and the stack badge over its head; set(n) shows n stacks.
   *  → handle { set(n), end() } (follows e) */
  bullseye(e) {
    const floor = this.take('bull', () => { const o = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: bullTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })); o.renderOrder = 6; return o; });
    const badge = this.take('badge', () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false })); s.renderOrder = 29; return s; });
    const r = Math.max(0.6, (e.bodyR || e.radius || 0.4) * 1.6), h = (e.height || 1) * (e.scale || 1) + 0.55;
    let n = -1, pop = 0;
    const H = { alive: true, n: 0 };
    const f = this.run((dt, t) => {
      pop = Math.max(0, pop - dt * 5);
      const k = ease.outBack(clamp(t / 0.2));
      floor.position.set(e.pos.x, (e.pos.y || 0) + 0.04, e.pos.z); floor.scale.setScalar(r * k * (1 + 0.15 * pop)); floor.rotation.y = t * 1.2; floor.material.opacity = 0.75;
      badge.position.set(e.pos.x, (e.pos.y || 0) + h + Math.sin(t * 4) * 0.05, e.pos.z); badge.scale.setScalar(0.5 * k * (1 + 0.3 * pop));
      return H.alive && e.alive;
    }, () => { H.alive = false; this.give('bull', floor); this.give('badge', badge); });
    H.set = v => { if (v === n) return; n = v; pop = 1; badge.material.map = badgeTex(Math.min(10, v)); badge.material.needsUpdate = true; };
    H.end = () => { H.alive = false; };
    H.set(0);
    return H;
  },
  /** the little brush's paint flick from her paw to the foe */
  paintFlick(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, n = 8;
    for (let i = 0; i <= n; i++) { const u = i / n; this.pn.spawn({ frame: PF.DOT, x: a.x + dx * u, y: (a.y || 0) + (b.y - a.y) * u + Math.sin(u * Math.PI) * 0.5, z: a.z + dz * u, life: 0.18 + 0.15 * u, size: 0.14, size1: 0.05, color: i % 2 ? COL.paint : COL.paint2, alpha: 1, alpha1: 0, fadeIn: 0.03 * u }); }
  },
  /** BULLSEYE!: a splash of paint, a ring, the word */
  paintBurst(pos, r = 2.2, big = false) {
    for (let i = 0; i < 16; i++) { const a = rand(0, TAU), s = rand(1.5, 3.5) * Math.min(1.4, r / 2); this.pn.spawn({ frame: i % 3 ? PF.DOT : PF.PUFF, x: pos.x, y: (pos.y || 0) + 0.6, z: pos.z, vx: Math.cos(a) * s, vy: rand(0.5, 2.5), vz: Math.sin(a) * s, life: rand(0.3, 0.5), size: rand(0.14, 0.28), size1: 0.05, color: i % 2 ? COL.paint : COL.paint2, alpha: 1, alpha1: 0, grav: 6 }); }
    this.ring(pos, r * 0.9, 0.35, COL.paint, 0.55);
    this.word(big ? 'JACKPOT!' : 'BULLSEYE!', _a.set(pos.x, (pos.y || 0) + 1.7, pos.z), { a: '#fff6e8', b: '#ff8a7a', size: big ? 1.3 : 1.1, life: 0.75 });
  },
  /** a hand-seal sigil at her paws (violet for smoke, gold for fire and thunder) */
  seal(pos, color = P.violet, size = 0.5) { this.pa.spawn({ frame: PF.SEAL, x: pos.x, y: pos.y, z: pos.z, life: 0.32, size: size * 0.7, size1: size * 1.2, color, alpha: 0.9, alpha1: 0, spin: 3 }); },
  /** charging: the motes that gather on her for each kind of wind-up (called per frame by poeSkills.updatePoe) */
  gather(pos, style, dt, k) {
    style = (style || '').replace(/^poe/, '').toLowerCase(); // (the wind-up families: actors/poePoses.js POE_CHARGE_POSES)
    const col = style === 'puff' || style === 'thunder' ? COL.fire2 : style === 'seal' || style === 'dragon' ? P.violet : style === 'kunai' || style === 'fuma' || style === 'stars' ? P.cream : style === 'brush' ? COL.paint : P.ink2;
    for (let i = this.emit('ga', 16 + 30 * k, dt); i > 0; i--) {
      const a = rand(0, TAU), d = rand(0.5, 0.9);
      const smoky = style === 'seal' || style === 'dragon' || style === 'crouch';
      this.pn.spawn({ frame: smoky ? PF.PUFF : PF.DOT, x: pos.x + Math.cos(a) * d, y: pos.y + rand(-0.3, 0.3), z: pos.z + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.4, vy: rand(-0.2, 0.3), vz: -Math.sin(a) * d * 2.4, life: 0.4, size: smoky ? 0.18 : 0.08, size1: 0.04, color: col, alpha: style === 'crouch' ? 0.6 : 0.85, alpha1: 0 });
    }
    if (style === 'thunder') this.crackle(pos, dt, 5 + 12 * k); // (a crackle, not a glow over her)
  },
};
for (const k in X) if (!PoeFX.prototype[k]) PoeFX.prototype[k] = X[k];

// ------------------------------------------------------------------ prewarm (behind a floor load: no first-cast hitch)
// Every pooled mesh of hers is made once below the floor and its program compiled; the canvas textures are uploaded
// now (renderer.initTexture), and the smoke-copy materials compiled (actors/poeProps.js prewarmCopies).
const basePrewarm = PoeFX.prototype.prewarm;
PoeFX.prototype.prewarm = function (renderer, camera) {
  basePrewarm.call(this, renderer, camera);
  try {
    const p = new THREE.Vector3(0, -50, 0), e = { pos: p, alive: true, radius: 0.4, height: 1 };
    const props = ['kunai', 'star', 'log', 'caltrop'].map(k => { const m = this.prop(k); m.position.copy(p); return [k, m]; });
    const fb = this.fireball(1); fb.position.copy(p);
    const dr = this.dragon(1); dr.set(p, new THREE.Vector3(0, 0, 1), 0.016, 3);
    const st = this.stitchMark(e, 0.1), zr = this.zoneRing(p, 1, 0.1), bl = this.bullseye(e);
    this.pawPrint(p, 0.5, 0.1); this.ring(p, 1, 0.1);
    for (const t of [stitchTex(), dashRingTex(), fireTex(), pawTex(), dragonTex(), segTex(), bullTex(), badgeTex(0), bandTex()]) renderer.initTexture?.(t);
    renderer.compile(this.scene, camera);
    prewarmCopies(renderer, camera, this.scene);
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const [k, m] of props) this.give(k, m); this.give('fireball', fb); dr.end(); bl.end(); st.t = zr.t = 1e9; }));
  } catch (err) { console.warn('[poeFx] prewarm', err); }
};
