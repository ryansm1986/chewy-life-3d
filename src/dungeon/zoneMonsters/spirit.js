// The Haunted modifier's ghost (docs/ZONES.md §5.1; ROADMAP Z-E2): the YŪREI, a little sheet ghost that rises from a
// fallen monster in a Haunted run (dungeon/tierRun.js). Built with the region monster kit (src/regions/monsters/bamboo.js:
// assemble / mdef / tele / hitArea…), registered with the region monsters (src/regions/monsters/index.js) so it batches,
// pools and tests like them. Sounds: ./spirit.sfx.js (pure data).
//
// A soft white sheet with a scalloped hem, floating a hand above the floor: big round eyes, a small "oh" mouth, pink
// cheeks, the white paper triangle (hitaikakushi) of the departed on its brow, two drooping sleeves held out in front in
// the old "urameshiya" pose, and a blue hitodama spirit flame circling it. It RISES out of the fallen monster (a swirl
// of motes, a sigh), drifts after you, and close up it BOOS: it rears back (a small ring telegraph), then lunges with a
// chilling "boo!" (frost; you're chilled). Fragile and quick: fodder that keeps a fight going, not a wall.
// Variants: the plain Yūrei and the Sleepy Yūrei (a floppy blue nightcap with a pompom, sleepy eyes).
import * as THREE from 'three';
import { assemble, mdef, act, tele, hitArea, roll, sfx, puff, playerIn, chill, ell, tubeC, blob, cheeks, paint, V, col, INK } from '../../regions/monsters/bamboo.js';
import { rand, clamp, TAU, ease } from '../../core/util.js';

const YR = { RISE: 0.95, WIND: 0.55, R: 1.35, BOO: 0.45, FLOAT: 0.3 };
const R0 = 0.3, CY = 0.56; // the head dome's radius and centre height (model space, before the float)
function yureiSpec(v) {
  const white = col(v.sheet), shade = col(v.shade), hem = col(v.hem);
  const B = [];
  // the sheet: a dome that flares into a skirt with a six-scallop hem, the hem trailing back a little; its underside
  // tucked up (a shallow hollow), pale blue in the folds
  B.push(blob(28, 22, q => {
    const a = Math.atan2(q.x, q.z);
    if (q.y >= 0) return q.set(q.x * R0, CY + q.y * R0 * 1.06, q.z * R0 * 0.97);
    const t = -q.y, hemY = 0.12 + 0.045 * Math.cos(a * 6) - 0.03 * Math.cos(a), k = clamp(t / 0.82);
    if (t <= 0.82) { const rr = R0 * (1 + 0.36 * ease.inCubic(k)) * (1 - 0.06 * Math.sin(k * Math.PI)); const s = Math.hypot(q.x, q.z) || 1; return q.set(q.x / s * rr, CY - (CY - hemY) * ease.inQuad(k) * 0.98, q.z / s * rr * 0.97 - 0.07 * k * k); } // (a bell: the waist drawn in a touch, the hem flared)
    const u = (t - 0.82) / 0.18, rr = R0 * 1.36 * (1 - u * 0.78), s = Math.hypot(q.x, q.z) || 1; // (the underside: tucked up into the skirt)
    return q.set(q.x / s * rr, hemY + u * 0.1, q.z / s * rr * 0.97 - 0.07);
  }, (p, n, o) => {
    o.copy(white);
    const low = clamp((CY - p.y) / (CY - 0.12));
    o.lerp(shade, clamp(low * 0.55 + clamp(-n.y) * 0.5));
    if (p.y < 0.2) o.lerp(hem, clamp((0.2 - p.y) / 0.08) * 0.6);
  }));
  // the face: big round eyes (sleepy lids on the Sleepy one), a little "oh" mouth, blush
  if (v.sleepy) for (const k of [-1, 1]) B.push(tubeC([[k * 0.035, 0.6, 0.285, 0.011], [k * 0.085, 0.585, 0.29, 0.012], [k * 0.135, 0.6, 0.272, 0.011]], INK, 4));
  else for (const k of [-1, 1]) {
    B.push(ell(0.046, 0.058, 0.026, INK, [k * 0.088, 0.6, 0.268], [0, k * 0.3, 0], 12));
    B.push(ell(0.018, 0.02, 0.012, '#ffffff', [k * 0.088 - 0.014, 0.62, 0.29], [0, 0, 0], 8), ell(0.008, 0.008, 0.008, '#ffffff', [k * 0.088 + 0.014, 0.583, 0.29], [0, 0, 0], 6));
  }
  B.push(ell(0.03, 0.034, 0.016, INK, [0, 0.5, 0.288], [-0.25, 0, 0], 10), ell(0.018, 0.014, 0.01, '#ff8aa0', [0, 0.49, 0.295], [-0.25, 0, 0], 8));
  B.push(...cheeks(0.535, 0.265, 0.155, 0.9, '#ffb0c4'));
  // the hitaikakushi: a paper triangle on the brow, point up, ink-edged so it reads on the white sheet; (the Sleepy one
  // wears its nightcap instead)
  if (!v.sleepy) {
    // (it sits on the dome's upper front, tilted back to lie on it: the game camera looks down on it)
    const tri = (w, h, d, c, z) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 }); g.translate(0, -h * 0.4, z); g.rotateX(-0.62); g.translate(0, 0.735, 0.245); g.deleteAttribute('uv'); return paint(g, (p, n, o) => o.set(c)); };
    B.push(tri(0.158, 0.138, 0.01, '#8e94b8', -0.004), tri(0.136, 0.118, 0.014, '#fffcf2', 0.006));
    // its tie: a thin paper cord round the head from the triangle's corners
    const band = []; for (let i = 0; i <= 16; i++) { const a = -2.35 + i / 16 * 4.7, yy = 0.712 + Math.cos(a) * 0.012; band.push([Math.sin(a + Math.PI) * 0.262, yy, Math.cos(a + Math.PI) * 0.256 - 0.004, 0.011]); }
    B.push(tubeC(band, '#c4c8e0', 5));
  } else {
    // a floppy nightcap, blue with white stripes, its tip flopped over to one side with a pompom
    const cap = []; for (let i = 0; i <= 9; i++) { const t = i / 9, a = t * 1.9; cap.push([Math.sin(a) * 0.22 * t, CY + R0 * 0.62 + Math.sin(Math.min(a, 1.4)) * 0.28 - t * t * 0.14, -0.02 - t * 0.04, 0.2 * (1 - t) + 0.03]); }
    B.push(paint(tubeC(cap, v.cap, 10), (p, n, o) => { o.set(v.cap); if (Math.sin((p.y - p.x * 0.6) * 42) > 0.55) o.set('#f4f8ff'); }));
    B.push(ell(0.215, 0.05, 0.215, '#f4f8ff', [0, CY + R0 * 0.6, -0.01], [-0.12, 0, 0], 16));
    B.push(ell(0.055, 0.055, 0.055, '#ffffff', [cap[9][0] + 0.02, cap[9][1] - 0.04, cap[9][2]], [0, 0, 0], 10));
  }
  // the sleeves: limp, held out in front, the paws drooping (separate parts: they lift for the boo)
  const arm = k => [tubeC([[0, 0, 0, 0.065], [k * 0.02, -0.04, 0.12, 0.06], [k * 0.025, -0.07, 0.2, 0.055]], v.sheet, 8), ell(0.055, 0.05, 0.06, v.shade, [k * 0.025, -0.1, 0.235], [0.7, 0, 0], 10)];
  // the hitodama: a ball of spirit fire, cyan and glowing (the material's fragOut lights the cyan vertices); its wispy tail
  // is a trail of glow motes the def's update() leaves behind it round the orbit
  const flame = [ell(0.06, 0.066, 0.06, '#9ff4ff', [0, 0, 0], [0, 0, 0], 12), ell(0.035, 0.038, 0.035, '#d8ffff', [0, 0.008, 0.012], [0, 0, 0], 10)];
  const glow = 'outgoingLight += diffuseColor.rgb * 1.15 * step(0.85, diffuseColor.g) * step(0.85, diffuseColor.b) * step(diffuseColor.r, 0.9);';
  return { mat: { fragOut: glow, rim: 0.9 }, outline: 0.02, parts: [
    { name: 'body', geo: B },
    { name: 'armL', geo: arm(1), at: [0.22, 0.47, 0.06] }, { name: 'armR', geo: arm(-1), at: [-0.22, 0.47, 0.06] },
    { name: 'flame', geo: flame, outline: 0, shadow: false, parent: 'pivot' },
  ] };
}
function buildYurei(v) {
  const M = assemble('yurei:' + v.key, () => yureiSpec(v));
  const I = M.inner, aL = M.g.armL, aR = M.g.armR, fl = M.g.flame;
  M.variant = v;
  const ph = rand(0, TAU);
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = YR.FLOAT + Math.sin(t * 2.3 + ph) * 0.05, s = 1, rx = moving ? 0.16 : 0.04, rz = Math.sin(t * 1.5 + ph) * 0.07, ax = -0.15 + Math.sin(t * 2.3 + ph + 0.8) * 0.12, az = 0.1;
    if (a === 'rise') { const p = clamp(k / YR.RISE); s = ease.outBack(p) * 0.92 + 0.08 * p; y = -0.55 + (YR.FLOAT + 0.55) * ease.outCubic(p); rz = Math.sin(p * 9) * 0.15 * (1 - p); ax = -1.1 * (1 - p); }
    else if (a === 'booWind') { const p = ease.outCubic(clamp(k / YR.WIND)); rx = -0.3 * p; s = 1 + 0.12 * p; ax = -1.9 * p; az = 0.45 * p; y += 0.1 * p; }
    else if (a === 'boo') { const p = clamp(k / 0.16); rx = -0.3 + 0.7 * ease.outQuad(p) - 0.4 * clamp((k - 0.16) / 0.3); s = 1.12 - 0.12 * clamp(k / YR.BOO); ax = -1.9 + 1.5 * p; az = 0.45; }
    I.position.y = y; I.scale.setScalar(s); I.rotation.set(rx, 0, rz);
    aL.rotation.set(ax, 0, az); aR.rotation.set(ax, 0, -az);
    // the hitodama circles at the shoulder, bobbing
    const fa = t * 1.9 + ph;
    fl.position.set(Math.cos(fa) * 0.42 * s, y + 0.72 * s + Math.sin(t * 3.1 + ph) * 0.05, Math.sin(fa) * 0.42 * s);
    M.flameAt = M.flameAt || new THREE.Vector3(); M.flameAt.copy(fl.position); // (the tail's motes start here: model space)
    fl.scale.setScalar((a === 'rise' ? clamp(k / YR.RISE) : 1) * (1 + Math.sin(t * 9 + ph) * 0.08));
  };
  M.animate(0, 0, false);
  return M;
}
function yureiAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G;
  rs.t += dt;
  const go = st => { rs.st = st; rs.t = 0; act(m, st === 'float' ? 'idle' : st); };
  if (rs.st === 'booWind' && m.state !== 'windup') go('float'); // (staggered out of the wind-up)
  switch (rs.st) {
    case 'rise': if (rs.t >= YR.RISE) go('float'); return false;
    case 'booWind':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.5);
      if (rs.t >= YR.WIND) {
        go('boo'); m.state = 'attack'; m.telegraph = null;
        const fx = m.pos.x + Math.sin(m.facing) * 0.55, fz = m.pos.z + Math.cos(m.facing) * 0.55;
        if (hitArea(m, fx, fz, YR.R, roll(m), 'frost', 0.6)) chill(m, 1.1, 0.3);
        G.vfx.ring(V(fx, m.pos.y + 0.05, fz), { color: '#bfeaff', r0: 0.25, r1: YR.R * 1.05, life: 0.4, opacity: 0.7 });
        for (let i = 0; i < 10; i++) { const a = rand(0, TAU), sp = rand(1.4, 3); puff(G.vfx.spark, fx, m.pos.y + 0.6, fz, { vx: Math.cos(a) * sp, vy: rand(0.2, 1.2), vz: Math.sin(a) * sp, life: rand(0.4, 0.7), size: rand(0.14, 0.24), size1: 0.03, color: i % 2 ? '#dff6ff' : '#9fdcff', alpha: 0.95, alpha1: 0, drag: 2.5 }); }
        sfx('yurei_boo', m.pos);
      }
      return false;
    case 'boo': if (rs.t >= YR.BOO) { go('float'); m.state = 'chase'; m.cd = rand(1.5, 2.3); } return false;
    default: {
      if (rs.st !== 'float') go('float');
      if (d < YR.R + 0.25 + (target.radius || 0.3) && m.cd <= 0) {
        go('booWind'); m.state = 'windup';
        m.telegraph = tele(G, { x: m.pos.x + Math.sin(m.facing) * 0.55, z: m.pos.z + Math.cos(m.facing) * 0.55, r: YR.R, time: YR.WIND, color: '#6ac8ff' });
        sfx('yurei_wind', m.pos);
        return false;
      }
      if (d > 0.9 + (target.radius || 0.3)) { m.chase(target, dt, slow); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
const hurt = (name, gap = 0.5) => (m, dmg) => { const t = m.G.engine.time || 0; if (t - (m._hurtT || -9) > gap) { m._hurtT = t; sfx(name, m.pos); } return dmg; };

export const MONSTERS = {
  yurei: mdef({
    name: 'Yūrei', build: 'yurei', scale: 0.95, radius: 0.3, vr: 0.38, speed: 3.0, pack: 1, material: 'silk',
    attack: { type: 'melee', range: 1.4, cd: 1.8, windup: YR.WIND },
    stats: { name: 'Yūrei', life: 0.5, dmg: 0.85, def: 0.45, speed: 1.0, xp: 0.5, element: 'frost', res: { frost: 40, gloom: 40, holy: -40, phys: 15 } },
    variants: [
      { key: 0, sheet: '#fbfaff', shade: '#c9d4f2', hem: '#9fb0e0' },
      { key: 1, name: 'Sleepy Yūrei', sheet: '#f8f8ff', shade: '#c4cdf0', hem: '#98a8dc', sleepy: true, cap: '#6a8ee0' },
    ],
    ai: yureiAI,
    update: (m, dt) => {
      if (!playerIn(m.G, m.pos.x, m.pos.z, 20)) return;
      if (Math.random() < dt * 1.6) puff(m.G.vfx.spark, m.pos.x + rand(-0.25, 0.25), m.pos.y + rand(0.3, 0.8), m.pos.z + rand(-0.25, 0.25), { vy: rand(0.2, 0.5), life: 0.9, size: 0.14, size1: 0.02, color: '#cfeeff', alpha: 0.8, alpha1: 0 });
      // the hitodama's tail: glow motes shed where the flame is, drifting up as it circles on (a wispy comet trail)
      const f = m.model.flameAt; if (!f || Math.random() > dt * 26) return;
      const c = Math.cos(m.facing), s = Math.sin(m.facing), k = m.scale || 1, x = (f.x * c + f.z * s) * k, z = (-f.x * s + f.z * c) * k;
      puff(m.G.vfx.glow, m.pos.x + x, m.pos.y + f.y * k, m.pos.z + z, { vx: rand(-0.1, 0.1), vy: rand(0.25, 0.55), vz: rand(-0.1, 0.1), life: rand(0.35, 0.55), size: 0.17, size1: 0.03, color: Math.random() < 0.5 ? '#8fe8ff' : '#c8f8ff', alpha: 0.85, alpha1: 0 });
    },
    onSpawn: m => { m.rs.st = 'rise'; act(m, 'rise'); m.model.animate?.(0, 0, false); sfx('yurei_rise', m.pos); },
    onDeath: m => { sfx('yurei_fade', m.pos); m.G.vfx.sparkle(m.lift(0.7), { n: 14, color: '#dff4ff', r: 0.35, rise: 1.8 }); },
    damageTaken: hurt('yurei_hurt'),
  }),
};
export const BUILD = { yurei: buildYurei };
