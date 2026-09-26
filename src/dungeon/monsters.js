// Cute yokai monsters: definitions + procedural models + lightweight procedural animation.
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge, tube, xf } from '../gfx/geom.js';
import { buildHumanoid } from '../actors/charKit.js';
import { clamp, TAU, rand, ease } from '../core/util.js';

const C = h => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const INK = '#3a2230';

function ell(rx, ry, rz, color, p = [0, 0, 0], r = [0, 0, 0], seg = 18) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(rx, ry, rz);
  if (r[0] || r[1] || r[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r)));
  g.translate(...p); return paint(g, (pp, n, o) => o.set(color));
}
function cone(r, h, color, p, rot = [0, 0, 0], seg = 10) { const g = new THREE.ConeGeometry(r, h, seg, 2); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))); g.translate(...p); return paint(g, (pp, n, o) => o.set(color)); }
function eyes(y, z, sep, size = 1, angry = true, col = '#2a1418') {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(ell(0.05 * size, 0.06 * size, 0.025, col, [s * sep, y, z], [0, s * 0.3, 0]));
    out.push(ell(0.018 * size, 0.018 * size, 0.012, '#ffffff', [s * sep - 0.012 * size, y + 0.022 * size, z + 0.02]));
    if (angry) out.push(tube([{ p: V(s * (sep + 0.05 * size), y + 0.09 * size, z - 0.01), r: 0.012 * size }, { p: V(s * (sep - 0.05 * size), y + 0.065 * size, z + 0.012), r: 0.012 * size }], 4, true));
  }
  out.forEach(g => { if (!g.attributes.color) paint(g, (p, n, o) => o.set(INK)); });
  return out;
}
function blush(y, z, sep, s = 1) { return [-1, 1].map(k => ell(0.04 * s, 0.022 * s, 0.012, '#ff8aa8', [k * sep, y, z], [0, k * 0.5, 0])); }

// ------------------------------------------------------------------ model builders -> {root, body, mat, parts}
function finish(parts, opts = {}) {
  const mat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.6, term: [-0.02, 0.3], ...(opts.mat || {}) });
  const geo = merge(parts);
  const body = new THREE.Mesh(geo, mat); body.castShadow = true; body.receiveShadow = true;
  const ol = new THREE.Mesh(geo, makeOutline(INK, opts.outline ?? 0.012));
  const pivot = new THREE.Group(); pivot.add(body, ol);
  const root = new THREE.Group(); root.add(pivot);
  return { root, pivot, body, mat, outline: ol };
}
const BUILD = {
  mochi(v) {
    const col = v.color || '#ffd6e4';
    const b = new THREE.SphereGeometry(0.42, 26, 18); b.scale(1, 0.72, 1); b.translate(0, 0.3, 0);
    paint(b, (p, n, o) => { o.set(col).lerp(C('#ffffff'), clamp(n.y * 0.35)); if (p.y < 0.12) o.multiplyScalar(0.9); });
    const parts = [b, ...eyes(0.36, 0.36, 0.13, 1.1, v.angry !== false), ...blush(0.28, 0.35, 0.22)];
    parts.push(tube([{ p: V(-0.04, 0.26, 0.39), r: 0.01 }, { p: V(0, 0.24, 0.4), r: 0.01 }, { p: V(0.04, 0.26, 0.39), r: 0.01 }], 4, true));
    if (v.topping === 'leaf') parts.push(ell(0.14, 0.03, 0.07, '#6ab04c', [0.05, 0.6, 0], [0, 0.4, 0.3]));
    if (v.topping === 'berry') parts.push(ell(0.08, 0.1, 0.08, '#ff4a5a', [0, 0.64, 0]), ell(0.06, 0.02, 0.04, '#5aa040', [0, 0.73, 0]));
    if (v.topping === 'snow') parts.push(ell(0.2, 0.06, 0.2, '#ffffff', [0, 0.58, 0]));
    if (v.crown) { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; parts.push(cone(0.06, 0.16, '#ffd24a', [Math.cos(a) * 0.16, 0.66, Math.sin(a) * 0.16])); } parts.push(paint(xf(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 16), { p: [0, 0.6, 0] }), (p, n, o) => o.set('#ffd24a'))); }
    return finish(parts);
  },
  dustbunny(v) {
    const parts = [];
    const col = v.color || '#b8b0c4';
    for (let i = 0; i < 26; i++) { const u = rand(-1, 1), th = rand(0, TAU); const d = V(Math.sqrt(1 - u * u) * Math.cos(th), u, Math.sqrt(1 - u * u) * Math.sin(th)); parts.push(ell(0.12, 0.12, 0.12, i % 3 ? col : '#d4cce0', [d.x * 0.24, 0.3 + d.y * 0.22, d.z * 0.24], [0, 0, 0], 8)); }
    parts.push(ell(0.3, 0.27, 0.3, col, [0, 0.3, 0]));
    parts.push(...eyes(0.34, 0.28, 0.1, 1.0, true, '#1a1020'));
    for (const s of [-1, 1]) parts.push(ell(0.05, 0.14, 0.03, col, [s * 0.12, 0.6, 0], [0, 0, -s * 0.3]));
    return finish(parts);
  },
  kinoko(v) {
    const cap = v.color || '#ff5a5a';
    const c = new THREE.SphereGeometry(0.42, 22, 14, 0, TAU, 0, Math.PI * 0.55); c.scale(1, 0.75, 1); c.translate(0, 0.42, 0);
    paint(c, (p, n, o) => { o.set(cap); const q = p.clone().normalize(); if (Math.sin(q.x * 11) * Math.sin(q.z * 11) * Math.cos(q.y * 7) > 0.35) o.set('#fff6ee'); });
    const under = new THREE.CylinderGeometry(0.4, 0.3, 0.06, 20); under.translate(0, 0.44, 0); paint(under, (p, n, o) => o.set('#f4e0c8'));
    const stem = new THREE.CylinderGeometry(0.2, 0.24, 0.42, 16); stem.translate(0, 0.22, 0); paint(stem, (p, n, o) => o.set('#fff4e4'));
    const parts = [c, under, stem, ...eyes(0.26, 0.21, 0.08, 0.9, true), ...blush(0.18, 0.2, 0.14, 0.8)];
    for (const s of [-1, 1]) parts.push(ell(0.08, 0.05, 0.1, '#f4e0c8', [s * 0.11, 0.03, 0.04]));
    return finish(parts);
  },
  lantern(v) {
    const col = v.color || '#ff8a4a';
    const b = new THREE.SphereGeometry(0.36, 22, 16); b.scale(1, 1.25, 1); b.translate(0, 0.75, 0);
    paint(b, (p, n, o) => { o.set(col); if (Math.sin((p.y - 0.75) * 34) > 0.75) o.multiplyScalar(0.8); });
    const top = new THREE.CylinderGeometry(0.2, 0.22, 0.1, 14); top.translate(0, 1.2, 0); paint(top, (p, n, o) => o.set('#3a2020'));
    const bot = new THREE.CylinderGeometry(0.22, 0.2, 0.1, 14); bot.translate(0, 0.3, 0); paint(bot, (p, n, o) => o.set('#3a2020'));
    const parts = [b, top, bot];
    parts.push(ell(0.13, 0.13, 0.06, '#fffaf0', [0, 0.88, 0.33]), ell(0.07, 0.08, 0.04, '#2a1418', [0, 0.87, 0.37]), ell(0.025, 0.025, 0.02, '#ffffff', [-0.02, 0.9, 0.4]));
    parts.push(tube([{ p: V(0, 0.62, 0.34), r: 0.07 }, { p: V(0.02, 0.5, 0.42), r: 0.06 }, { p: V(0.06, 0.4, 0.44), r: 0.04 }], 6, true));
    paint(parts[parts.length - 1], (p, n, o) => o.set('#ff6a8a'));
    const m = finish(parts, { mat: { fragOut: 'outgoingLight += diffuseColor.rgb * 0.55 * step(0.5, diffuseColor.r);' } });
    m.glow = col; return m;
  },
  kasa(v) {
    const col = v.color || '#8a5ad0';
    const u = new THREE.ConeGeometry(0.5, 0.9, 16, 3); u.translate(0, 0.95, 0);
    paint(u, (p, n, o) => { const a = Math.atan2(p.x, p.z); o.set(Math.sin(a * 8) > 0 ? col : '#fff4e8'); });
    const parts = [u, cone(0.04, 0.2, '#3a2a2a', [0, 1.48, 0])];
    parts.push(ell(0.11, 0.12, 0.05, '#fffaf0', [0, 0.95, 0.3], [-0.3, 0, 0]), ell(0.06, 0.07, 0.04, '#2a1418', [0, 0.95, 0.34], [-0.3, 0, 0]), ell(0.02, 0.02, 0.02, '#ffffff', [-0.02, 0.98, 0.37]));
    const tongue = tube([{ p: V(0, 0.72, 0.33), r: 0.06 }, { p: V(0, 0.6, 0.4), r: 0.05 }, { p: V(0, 0.5, 0.38), r: 0.03 }], 6, true); paint(tongue, (p, n, o) => o.set('#ff6a8a')); parts.push(tongue);
    const leg = new THREE.CylinderGeometry(0.035, 0.035, 0.52, 6); leg.translate(0, 0.28, 0); paint(leg, (p, n, o) => o.set('#6a4a3a')); parts.push(leg);
    const geta = new THREE.BoxGeometry(0.2, 0.05, 0.3); geta.translate(0, 0.03, 0.03); paint(geta, (p, n, o) => o.set('#c98f5e')); parts.push(geta);
    return finish(parts);
  },
  wisp(v) {
    const col = v.color || '#7ab8ff';
    const b = new THREE.SphereGeometry(0.28, 18, 12); b.scale(1, 1.1, 1); b.translate(0, 0.9, 0);
    paint(b, (p, n, o) => o.set(col).lerp(C('#ffffff'), clamp(n.y * 0.5 + 0.2)));
    const flame = cone(0.22, 0.5, col, [0, 1.2, -0.05], [-0.3, 0, 0]);
    const parts = [b, flame, ...eyes(0.94, 0.25, 0.09, 0.9, false, '#1a2a5a')];
    const m = finish(parts, { mat: { fragOut: 'outgoingLight += diffuseColor.rgb * 0.9;' }, outline: 0.006 });
    m.glow = col; return m;
  },
  oni(v) {
    const skin = v.color || '#ff6a5a';
    const body = new THREE.SphereGeometry(0.34, 20, 16); body.scale(1, 1.05, 0.95); body.translate(0, 0.52, 0); paint(body, (p, n, o) => o.set(skin));
    const head = new THREE.SphereGeometry(0.28, 20, 16); head.translate(0, 0.95, 0.02); paint(head, (p, n, o) => o.set(skin));
    const shorts = new THREE.CylinderGeometry(0.34, 0.3, 0.2, 16); shorts.translate(0, 0.3, 0); paint(shorts, (p, n, o) => o.set(Math.sin(p.x * 40 + p.y * 20) > 0.3 ? '#2a2020' : '#ffc83a'));
    const parts = [body, head, shorts, cone(0.06, 0.18, '#fff4d8', [0.12, 1.24, 0], [0, 0, -0.3]), cone(0.06, 0.18, '#fff4d8', [-0.12, 1.24, 0], [0, 0, 0.3]), ...eyes(0.98, 0.25, 0.09, 1.0, true)];
    parts.push(ell(0.1, 0.05, 0.03, '#fff4d8', [0, 0.84, 0.26]));
    for (const s of [-1, 1]) { parts.push(ell(0.08, 0.1, 0.08, skin, [s * 0.14, 0.13, 0.02])); parts.push(ell(0.07, 0.14, 0.07, skin, [s * 0.36, 0.52, 0.05], [0, 0, s * 0.4])); }
    // kanabo club
    const club = new THREE.CylinderGeometry(0.09, 0.05, 0.8, 8); club.rotateZ(-0.6); club.translate(-0.55, 0.75, 0.15); paint(club, (p, n, o) => o.set('#6a4a3a')); parts.push(club);
    for (let i = 0; i < 5; i++) parts.push(cone(0.03, 0.06, '#c8c0b8', [-0.72 + i * 0.05, 1.0 - i * 0.07, 0.24]));
    return finish(parts);
  },
  tanuki(v) {
    const rig = buildHumanoid({ name: 'Tanuki Bandit', species: 'tanuki', fur: '#8a6a58', fur2: '#e0cbb0', fur3: '#3a2c28', earColor: '#3a2c28', outfit: { top: 'gi', topColor: v.color || '#4a4a6a', bottomColor: '#2a2a3a', scarf: '#e8503a' } });
    return { root: rig.root, pivot: rig.parts.body, body: rig.meshes[0], mat: rig.mat, rig };
  },
  fox(v) {
    const rig = buildHumanoid({ name: 'Kitsune', species: 'fox', fur: v.color || '#fff4ea', fur2: '#ffffff', earColor: '#ff9ad0', earInner: '#ff5aa0', eye: '#ff3a6a', outfit: { top: 'kimono', topColor: '#e8364a', bottomColor: '#2a1a3a', sash: '#ffd24a' } });
    return { root: rig.root, pivot: rig.parts.body, body: rig.meshes[0], mat: rig.mat, rig };
  },
};

// ------------------------------------------------------------------ definitions
// life/dmg are multipliers on monsterStats(); speed m/s; attack: melee | ranged | charge | aoe | summon
export const MONSTERS = {
  mochi: { name: 'Mochi Slime', build: 'mochi', radius: 0.42, speed: 2.2, life: 1.0, dmg: 1.0, move: 'bounce', attack: { type: 'melee', range: 1.1, cd: 1.4, windup: 0.35 }, variants: [{ color: '#ffd6e4', topping: 'berry' }, { color: '#d8f0c0', topping: 'leaf' }, { color: '#fff8f4', topping: 'snow', element: 'frost', name: 'Snow Mochi' }] },
  dustbunny: { name: 'Dust Bunny', build: 'dustbunny', radius: 0.32, speed: 3.6, life: 0.55, dmg: 0.7, move: 'scurry', attack: { type: 'melee', range: 0.9, cd: 0.9, windup: 0.2 }, pack: 1.6 },
  kinoko: { name: 'Kinoko', build: 'kinoko', radius: 0.4, speed: 1.6, life: 1.3, dmg: 0.9, move: 'waddle', element: 'stink', attack: { type: 'aoe', range: 2.2, radius: 2.0, cd: 3.2, windup: 0.8 }, variants: [{ color: '#ff5a5a' }, { color: '#8a6aff', name: 'Dream Kinoko' }, { color: '#ffae3a' }] },
  lantern: { name: 'Chochin Ghost', build: 'lantern', radius: 0.38, speed: 1.8, life: 0.9, dmg: 1.1, move: 'float', element: 'fire', attack: { type: 'ranged', range: 7, cd: 2.2, windup: 0.45, proj: 'fireball', speed: 7 }, variants: [{ color: '#ff8a4a' }, { color: '#ff6a8a' }] },
  kasa: { name: 'Kasa-obake', build: 'kasa', radius: 0.42, speed: 2.6, life: 1.1, dmg: 1.1, move: 'hop', attack: { type: 'charge', range: 5, cd: 2.6, windup: 0.5, dash: 9 }, variants: [{ color: '#8a5ad0' }, { color: '#e8503a' }, { color: '#3a8ad0' }] },
  wisp: { name: 'Kitsune-bi', build: 'wisp', radius: 0.3, speed: 2.8, life: 0.6, dmg: 1.0, move: 'float', element: 'zap', attack: { type: 'ranged', range: 8, cd: 1.6, windup: 0.3, proj: 'foxfire', speed: 9 }, variants: [{ color: '#7ab8ff' }, { color: '#b88aff' }] },
  oni: { name: 'Oni Imp', build: 'oni', radius: 0.45, speed: 2.4, life: 1.8, dmg: 1.5, move: 'waddle', attack: { type: 'melee', range: 1.3, cd: 1.8, windup: 0.55, heavy: true }, variants: [{ color: '#ff6a5a' }, { color: '#5a8aff', name: 'Blue Oni Imp' }] },
  tanuki: { name: 'Tanuki Bandit', build: 'tanuki', radius: 0.32, speed: 3.0, life: 1.0, dmg: 0.9, move: 'walk', attack: { type: 'ranged', range: 6.5, cd: 1.5, windup: 0.35, proj: 'acorn', speed: 10 }, variants: [{ color: '#4a4a6a' }, { color: '#6a3a3a' }] },
  // bosses
  mochiKing: { name: 'King Mochi the Squishy', build: 'mochi', boss: true, scale: 3.0, radius: 1.3, speed: 1.8, life: 1, dmg: 1.2, move: 'bounce', attack: { type: 'slam', range: 3.5, radius: 4.2, cd: 3.4, windup: 1.0 }, variants: [{ color: '#ffe0ec', crown: true, topping: 'berry' }], summon: 'mochi' },
  kasaLord: { name: 'Lord Karakasa', build: 'kasa', boss: true, scale: 2.6, radius: 1.1, speed: 2.2, life: 1, dmg: 1.3, move: 'hop', attack: { type: 'spin', range: 3, radius: 3.4, cd: 3.0, windup: 0.7 }, variants: [{ color: '#c8364a' }], summon: 'kasa' },
  oniChef: { name: 'Oni Chef Gorobei', build: 'oni', boss: true, scale: 2.4, radius: 1.1, speed: 2.0, life: 1, dmg: 1.4, move: 'waddle', element: 'fire', attack: { type: 'barrage', range: 9, cd: 3.0, windup: 0.8, proj: 'firepot', speed: 8 }, variants: [{ color: '#ff5a4a' }], summon: 'lantern' },
  nineTails: { name: 'Tamamo, the Nine-Tailed', build: 'fox', boss: true, scale: 2.2, radius: 0.9, speed: 3.2, life: 1, dmg: 1.5, move: 'walk', element: 'zap', attack: { type: 'barrage', range: 10, cd: 2.4, windup: 0.6, proj: 'foxfire', speed: 10 }, variants: [{ color: '#fff4ea' }], summon: 'wisp' },
};

// Procedural motion for monster models
export class MonsterAnim {
  constructor(model, def) { this.m = model; this.def = def; this.t = rand(0, 10); this.flash = 0; this.flashC = new THREE.Color('#ffffff'); this.lunge = 0; this.wind = 0; this.spin = 0; this.deathT = -1; this.rig = model.rig; }
  hit(c = '#ffffff') { this.flash = 1; this.flashC.set(c); }
  update(dt, moving, speed) {
    this.t += dt; const t = this.t, p = this.m.pivot, s = this.def.scale || 1;
    let y = 0, sx = 1, sy = 1, rz = 0, rx = 0;
    const mv = moving ? 1 : 0;
    switch (this.def.move) {
      case 'bounce': { const ph = (t * (moving ? 3.2 : 1.4)) % 1; const hop = Math.sin(ph * Math.PI); y = hop * (moving ? 0.35 : 0.06); sy = 1 + (hop - 0.5) * (moving ? 0.25 : 0.08); sx = 1 / Math.sqrt(sy); break; }
      case 'scurry': y = Math.abs(Math.sin(t * 16)) * 0.08 * (0.3 + mv); rz = Math.sin(t * 30) * 0.06 * mv; break;
      case 'float': y = 0.25 + Math.sin(t * 2.2) * 0.12; rx = moving ? 0.18 : 0; rz = Math.sin(t * 1.3) * 0.08; break;
      case 'hop': { const ph = (t * (moving ? 2.8 : 1.2)) % 1; y = Math.sin(ph * Math.PI) * (moving ? 0.4 : 0.1); rz = Math.sin(t * 2) * 0.1; break; }
      case 'waddle': rz = Math.sin(t * 7) * 0.1 * mv; y = Math.abs(Math.sin(t * 7)) * 0.05 * mv; sy = 1 + Math.sin(t * 2) * 0.02; break;
      default: break;
    }
    // attack windup: squash & tremble; lunge: stretch forward
    if (this.wind > 0) { sy *= 1 - this.wind * 0.18; sx *= 1 + this.wind * 0.12; rz += Math.sin(t * 60) * 0.05 * this.wind; }
    if (this.lunge > 0) { this.lunge = Math.max(0, this.lunge - dt * 4); rx += 0.4 * this.lunge; sy *= 1 + 0.1 * this.lunge; }
    if (this.spin > 0) { p.rotation.y += dt * 18; }
    if (this.deathT >= 0) { this.deathT += dt; const k = clamp(this.deathT / 0.45); sy *= 1 - k; sx *= 1 + k * 0.6; y += k * 0.2; }
    if (this.rig) { // humanoid monsters use the kit animator externally
      this.m.root.scale.setScalar(s);
    } else {
      p.position.y = y; p.scale.set(sx * s, sy * s, sx * s); p.rotation.z = rz; p.rotation.x = rx;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    this.m.mat.emissive.copy(this.flashC).multiplyScalar(this.flash * 0.9);
  }
}

export function buildMonster(id, variantIdx = 0) {
  const def = MONSTERS[id];
  const v = (def.variants || [{}])[variantIdx % (def.variants?.length || 1)];
  const model = BUILD[def.build](v);
  model.variant = v;
  return model;
}
