// Maple Roots' own monster (docs/ZONES.md §8.2; ROADMAP Z-C2): the TESSO, the iron-rat yokai that gnaws the great
// maple's roots (the monk Raigō, the legend goes, turned into a rat with teeth of iron). Built with the region monster
// kit (src/regions/monsters/bamboo.js: assemble / mdef / act / tele / hitArea…), registered with the region monsters
// (src/regions/monsters/index.js) so it batches, pools and tests like them. Sounds: ./maple.sfx.js (pure data).
//
// A round, chubby grey rat sat on its haunches: huge round ears, a pink nose and whiskers, two big IRON buck teeth that
// catch the light, a long curling tail, a monk's juzu of wooden beads round its neck. The burrowing ambusher among the
// hollow's yokai (kuri roll lanes, kakashi's crows swoop, the momiji wisps fling flurries from afar):
//   BURROW  (mid range) it scrabbles into the earth and a mound of dirt races along under the floor after you (it can't
//           be hit down there); the mound stops, swells and shakes over a ring telegraph, and it BURSTS up out of it in
//           a spray of earth and leaves, knocking you back, then sits dazed, shaking the dirt off (hit it then);
//   GNAW    (close) it rears back, iron teeth bared over a short cone telegraph, then lunges in a chattering flurry of bites.
// Variants: the plain iron-grey Tesso, the Sutra Tesso (brown, a gnawed scroll in its paws) and the Elder Tesso (Raigō
// himself: white fur, a saffron kesa, bushy white brows, a bigger juzu with a red tassel). 4 parts (body, head, paws, the
// dirt mound): 8 instanced batches a variant, as the Iwa-bōzu.
import * as THREE from 'three';
import { assemble, mdef, act, tele, hitArea, roll, sfx, puff, playerIn, ell, cyl, tubeC, blob, cheeks, eyesCute, paint, V, col, INK } from '../../regions/monsters/bamboo.js';
import { rand, clamp, TAU, ease } from '../../core/util.js';

const TS = { DIG: 0.5, UNDER_MAX: 1.7, UNDER_V: 2.7, SURF: 0.8, BURST_R: 1.6, DAZE: 1.1, GNAW_WIND: 0.42, GNAW_T: 0.42, GNAW_R: 1.5, GNAW_ARC: 0.7 };
const TELE = '#ff3a7a'; // (the hollow's telegraph colour: maple.js)
const nzs = (x, y, z) => Math.sin(x * 9.1 + y * 3.7) * Math.cos(z * 7.3 - x * 2.1) * 0.5 + Math.sin(x * 23 + z * 19) * 0.25;
const DIRT = ['#7a5a40', '#5e4432', '#9a7a5a'];

function tessoSpec(v) {
  const fur = col(v.fur), furHi = col(v.furHi), belly = col(v.belly), furDk = col(v.fur).multiplyScalar(0.72);
  // ---- the body: a round pear sat on its haunches, a pale belly, fur tufts in the paint, darker underneath
  const body = [blob(26, 18, q => {
    const k = 1 + 0.05 * Math.sin(q.x * 5 + 1) * Math.cos(q.z * 4), lo = q.y < 0 ? 1.12 : 1 - 0.1 * q.y;
    let y = q.y * 0.27 + 0.3; if (y < 0.05) y = 0.05 - (0.05 - y) * 0.2;
    return q.set(q.x * 0.31 * k * lo, y, q.z * 0.29 * k * lo);
  }, (p, n, o) => {
    o.copy(fur).lerp(furHi, clamp(n.y * 0.5 + 0.35 + nzs(p.x * 3, p.y * 3, p.z * 3) * 0.2));
    if (n.z > 0.35 && p.y < 0.46) o.lerp(belly, clamp((n.z - 0.35) * 2.6));
    if (n.y < -0.3) o.multiplyScalar(0.78);
    if (Math.sin(p.x * 70 + p.y * 40) * Math.sin(p.z * 66 - p.y * 30) > 0.8) o.multiplyScalar(0.88); // (fur tufts)
  })];
  // feet with pink toes, a long curling tail
  for (const k of [-1, 1]) { body.push(ell(0.09, 0.045, 0.12, v.fur, [k * 0.15, 0.04, 0.13], [0, k * 0.25, 0], 10)); for (let t = 0; t < 3; t++) body.push(ell(0.018, 0.016, 0.02, v.pink, [k * 0.15 + (t - 1) * 0.035, 0.03, 0.24], [0, 0, 0], 6)); }
  { // a long tail curling round behind it (a smooth spline), ringed with faint scales
    const C = new THREE.CatmullRomCurve3([V(0, 0.12, -0.24), V(0.03, 0.06, -0.42), V(0.1, 0.1, -0.6), V(0.2, 0.26, -0.68), V(0.24, 0.42, -0.62), V(0.19, 0.53, -0.5), V(0.11, 0.55, -0.44)]), pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, q = C.getPoint(t); pts.push([q.x, q.y, q.z, 0.05 * (1 - t * 0.85)]); }
    body.push(tubeC(pts, (p, n, o) => o.set(v.tail).multiplyScalar(0.86 + 0.18 * clamp(n.y + 0.4) - (Math.sin((p.z + p.y) * 60) > 0.8 ? 0.1 : 0)), 7));
  }
  // the juzu: a string of wooden prayer beads round the neck (a beaded rope), big beads and a tassel at the front
  { const R = 0.222, y = 0.5, ring = [];
    for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU; ring.push([Math.sin(a) * R, y - Math.cos(a) * 0.035, Math.cos(a) * R * 0.95, 0.024 * (0.8 + 0.35 * Math.abs(Math.sin(a * 9)))]); }
    body.push(tubeC(ring, (p, n, o) => o.set(v.bead).multiplyScalar(0.8 + 0.3 * clamp(n.y + 0.4)), 6, false));
    for (const k of [-2, -1, 1, 2]) { const a = k * 0.32; body.push(ell(0.034, 0.034, 0.034, v.bead, [Math.sin(a) * R, y - Math.cos(a) * 0.035, Math.cos(a) * R * 0.97], [0, 0, 0], 9)); }
    body.push(ell(0.046, 0.046, 0.046, v.elder ? '#e8c050' : v.bead, [0, y - 0.068, R * 0.99], [0, 0, 0], 10));
    body.push(cyl(0.012, 0.036, 0.1, v.tassel, [0, y - 0.14, R * 1.0], [0, 0, 0], 8)); }
  if (v.elder) { // a saffron kesa slung over one shoulder, its border stitched in squares
    const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = -1.2 + t * 2.6; pts.push([Math.sin(a) * 0.3 * (1.02 - 0.15 * Math.abs(t - 0.5)), 0.52 - t * 0.32, Math.cos(a) * 0.29, 0.045]); }
    body.push(tubeC(pts, (p, n, o) => o.set('#e8902a').multiplyScalar(0.85 + 0.2 * clamp(n.y + 0.5)).lerp(col('#b85a1e'), Math.sin(p.y * 80 + p.x * 40) > 0.85 ? 0.6 : 0), 6));
  }
  // ---- the head (its own part: it sniffs, nods and chatters): a big round chibi head, a pointed snout, iron teeth
  const head = [blob(22, 16, q => q.set(q.x * 0.22, q.y * 0.2 + 0.12, q.z * 0.21), (p, n, o) => { o.copy(fur).lerp(furHi, clamp(n.y * 0.6 + 0.4)); if (n.z > 0.5 && p.y < 0.1) o.lerp(belly, 0.5); })];
  head.push(ell(0.115, 0.085, 0.13, v.furHi, [0, 0.07, 0.15], [-0.1, 0, 0], 12), ell(0.06, 0.045, 0.06, v.belly, [0, 0.035, 0.23], [0, 0, 0], 10));
  head.push(ell(0.038, 0.032, 0.03, v.pink, [0, 0.095, 0.285], [0, 0, 0], 10)); // the nose
  for (const k of [-1, 1]) { // the iron teeth: two big shiny buck teeth, a dark gap between
    head.push(paint(new THREE.BoxGeometry(0.042, 0.08, 0.02).translate(k * 0.023, -0.03, 0.272), (p, n, o) => o.set('#d4dce8').lerp(col('#ffffff'), clamp(n.z * 0.7) * 0.6).multiplyScalar(p.y < -0.055 ? 0.8 : 1))); // (iron: a cool steel shine)
    for (let w = 0; w < 2; w++) head.push(tubeC([[k * 0.07, 0.075 + (w - 0.5) * 0.02, 0.255, 0.004], [k * 0.155, 0.08 + (w - 0.5) * 0.045, 0.27, 0.0025]], '#f4ece4', 3)); // whiskers
    // big round ears with pink insides, tipped back so they read round from above
    head.push(ell(0.14, 0.14, 0.032, v.fur, [k * 0.17, 0.29, -0.04], [-0.75, k * 0.4, k * 0.3], 14), ell(0.098, 0.098, 0.02, v.pink, [k * 0.168, 0.296, -0.022], [-0.75, k * 0.4, k * 0.3], 12));
  }
  head.push(...eyesCute(0.165, 0.19, 0.085, 0.92, { brow: v.elder ? 0 : 0 }), ...cheeks(0.105, 0.2, 0.13, 0.9));
  if (v.elder) { // bushy white brows and a wisp of beard
    for (const k of [-1, 1]) head.push(tubeC([[k * 0.04, 0.245, 0.19, 0.022], [k * 0.1, 0.262, 0.18, 0.026], [k * 0.165, 0.236, 0.15, 0.016]], '#ffffff', 6));
    head.push(tubeC([[0, -0.02, 0.21, 0.035], [0.005, -0.08, 0.2, 0.025], [0.02, -0.13, 0.17, 0.008]], '#f4f0ec', 6));
  }
  // ---- the paws (their own part: they dig and drum), a sutra scroll for the Sutra Tesso
  const paws = [];
  for (const k of [-1, 1]) { paws.push(tubeC([[k * 0.16, 0.05, -0.08, 0.05], [k * 0.12, 0.0, 0.0, 0.045], [k * 0.09, -0.02, 0.05, 0.04]], v.fur, 6), ell(0.045, 0.04, 0.05, v.pink, [k * 0.085, -0.03, 0.07], [0, 0, 0], 8)); }
  if (v.scroll) {
    paws.push(cyl(0.038, 0.038, 0.3, '#f2e6c8', [0, -0.01, 0.1], [0, 0, Math.PI / 2], 10), cyl(0.042, 0.042, 0.06, '#c8402e', [0, -0.01, 0.1], [0, 0, Math.PI / 2], 10));
    for (const k of [-1, 1]) paws.push(ell(0.025, 0.025, 0.025, '#3a2a22', [k * 0.165, -0.01, 0.1], [0, 0, 0], 6));
  }
  // ---- the dirt mound it travels under (shown while burrowed): lumpy turned earth, clods, red leaves, and the tips of its
  // ears poking out of the top (it reads as a rat digging along, not a moving rock)
  const lump = q => { const a = Math.atan2(q.z, q.x), k = 1 + 0.16 * Math.sin(a * 5 + 1) * Math.max(0, q.y) + 0.08 * Math.sin(a * 11 + q.y * 6); return q.set(q.x * 0.42 * k, Math.max(q.y, -0.25) * 0.2 * k + 0.03, q.z * 0.42 * k); };
  const mound = [blob(18, 10, lump, (p, n, o) => { o.set(DIRT[0]).lerp(col(DIRT[2]), clamp(n.y * 0.4 + nzs(p.x * 6, p.y * 4, p.z * 6) * 0.5)); if (n.y < 0.25) o.lerp(col(DIRT[1]), 0.6); if (Math.sin(p.x * 50) * Math.sin(p.z * 47) > 0.75) o.multiplyScalar(0.8); })];
  for (let i = 0; i < 9; i++) { // clods tumbling off it
    const a = i / 9 * TAU + 0.4 + (i % 2) * 0.2, d = 0.36 + (i % 3) * 0.08, g = new THREE.IcosahedronGeometry(0.045 + (i % 3) * 0.015, 0);
    g.scale(1.2, 0.75, 1); g.rotateY(i); g.translate(Math.cos(a) * d, 0.035, Math.sin(a) * d);
    mound.push(paint(g, (p, n, o) => o.set(DIRT[(i + 1) % 3]).multiplyScalar(0.8 + 0.3 * clamp(n.y))));
  }
  for (const [x, z, c, a] of [[0.14, -0.1, '#d8482e', 0.6], [-0.18, 0.08, '#f08a34', 2.1], [0.05, 0.2, '#c43a28', 4.0]]) mound.push(ell(0.07, 0.008, 0.05, c, [x, 0.215 - Math.hypot(x, z) * 0.42, z], [0.2, a, 0.15], 7));
  for (const k of [-1, 1]) mound.push(ell(0.075, 0.07, 0.022, v.fur, [k * 0.085, 0.25, 0.02], [-0.35, k * 0.4, k * 0.35], 10), ell(0.05, 0.045, 0.012, v.pink, [k * 0.085, 0.252, 0.034], [-0.35, k * 0.4, k * 0.35], 8));
  return { outline: 0.02, parts: [
    { name: 'body', geo: body },
    { name: 'head', geo: head, at: [0, 0.5, 0.05] },
    { name: 'paws', geo: paws, at: [0, 0.44, 0.21] },
    { name: 'mound', geo: mound, parent: 'root', outline: 0.012 },
  ] };
}
function buildTesso(v) {
  const M = assemble('tesso:' + v.key, () => tessoSpec(v));
  const I = M.inner, H = M.g.head, Pw = M.g.paws, Md = M.g.mound;
  let hop = 0;
  M.variant = v;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sy = 1, rx = 0, rz = 0, hx = 0, hy = 0, hz = 0, px = 0, show = true, mound = 0, wob = 0;
    switch (a) {
      case 'dig': { const p = clamp(k / TS.DIG); rx = 0.75 * ease.outCubic(clamp(p * 2)); y = -0.62 * ease.inQuad(p); px = -0.7 + Math.sin(t * 42) * 0.7; hx = 0.4; mound = ease.outCubic(p); wob = 0.12; break; }
      case 'under': show = false; mound = 1; wob = 0.1; break;
      case 'surface': show = false; mound = 1.12 + 0.08 * Math.sin(t * 34); wob = 0.22; break;
      case 'burst': { const p = clamp(k / 0.42); y = -0.45 + Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.7 + p * 0.45; sy = 1 + Math.sin(p * Math.PI) * 0.18; mound = 1 - ease.inQuad(p); hx = -0.4 * Math.sin(p * Math.PI); px = -1.4 * Math.sin(p * Math.PI); break; }
      case 'dazed': rz = Math.sin(t * 6) * 0.14; hz = Math.sin(t * 6 + 1) * 0.3; hy = Math.sin(t * 3.2) * 0.35; sy = 0.95; px = 0.3; break;
      case 'gnawWind': { const p = ease.outCubic(clamp(k / TS.GNAW_WIND)); rx = -0.28 * p; hx = -0.4 * p; px = -1.4 * p; sy = 1 + 0.08 * p; break; }
      case 'gnaw': { const p = clamp(k / TS.GNAW_T); rx = 0.38 * Math.sin(Math.min(1, p * 3) * Math.PI * 0.5); hx = 0.28 + Math.sin(t * 48) * 0.24; px = -0.6 + Math.sin(t * 48 + 1) * 0.45; break; }
      default: {
        hop = (hop + dt * (moving ? 4.6 : 0.6)) % 1;
        y = moving ? Math.abs(Math.sin(hop * Math.PI)) * 0.07 : 0; rz = moving ? Math.sin(hop * TAU) * 0.08 : Math.sin(t * 1.2) * 0.02;
        sy = moving ? 1 + Math.sin(hop * TAU * 2) * 0.05 : 1 + Math.sin(t * 2.4) * 0.025;
        hx = moving ? 0.12 : Math.sin(t * 1.1) * 0.07 + (Math.sin(t * 7) > 0.6 ? Math.sin(t * 40) * 0.04 : 0); // (sniffing)
        hy = moving ? 0 : Math.sin(t * 0.7) * 0.3; px = moving ? Math.sin(hop * TAU) * 0.6 : -0.35 + Math.sin(t * 2) * 0.1;
      }
    }
    I.visible = show;
    const sx = 1 / Math.sqrt(sy); I.scale.set(sx, sy, sx); I.rotation.set(rx, 0, rz); I.position.set(0, y, 0);
    H.rotation.set(hx, hy, hz); Pw.rotation.set(px, 0, 0);
    Md.visible = mound > 0.02;
    if (Md.visible) Md.scale.set(mound * (1 + wob * Math.sin(t * 23)), mound * (1 + wob * Math.sin(t * 31 + 1)), mound * (1 + wob * Math.sin(t * 27 + 2)));
  };
  M.animate(0, 0, false);
  return M;
}
// dirt flying: a spray of earth clods and a few leaves (the burrow, the burst)
function dirt(G, x, y, z, n, s = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(1, 3) * s;
    puff(G.vfx.dot, x + Math.cos(a) * 0.2, y + 0.1, z + Math.sin(a) * 0.2, { vx: Math.cos(a) * sp, vy: rand(2, 4.5) * s, vz: Math.sin(a) * sp, life: rand(0.5, 0.8), size: rand(0.07, 0.13), size1: 0.05, color: i % 5 === 4 ? '#d8482e' : DIRT[i % 3], alpha: 1, alpha1: 0.8, grav: 13, drag: 0.6 });
  }
}
function tessoAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G;
  rs.t += dt; rs.bcd = (rs.bcd ?? rand(1.2, 3)) - dt;
  const go = st => { rs.st = st; rs.t = 0; act(m, st === 'up' ? 'idle' : st); };
  if ((rs.st === 'gnawWind' || rs.st === 'dig') && m.state !== 'windup') { go('up'); m.shadow && (m.shadow.visible = true); } // staggered out of the wind-up
  switch (rs.st) {
    case 'idle': // just alerted ("!" from Monster.alert): a squeak, ears up
      go('up'); sfx('tesso_squeak', m.pos); return false;
    case 'dig':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.5);
      if (Math.random() < dt * 16) dirt(G, m.pos.x + Math.sin(m.facing) * 0.25, m.pos.y, m.pos.z + Math.cos(m.facing) * 0.25, 1, 0.8);
      if (rs.t >= TS.DIG) { go('under'); m.state = 'attack'; m.telegraph = null; if (m.shadow) m.shadow.visible = false; sfx('tesso_burrow', m.pos); }
      return false;
    case 'under': { // a mound racing along under the floor after its prey
      m.chase(target, dt, slow * TS.UNDER_V);
      if (Math.random() < dt * 10) puff(G.vfx.smoke, m.pos.x + rand(-0.3, 0.3), m.pos.y + 0.1, m.pos.z + rand(-0.3, 0.3), { vx: rand(-0.3, 0.3), vy: rand(0.2, 0.5), vz: rand(-0.3, 0.3), life: 0.6, size: 0.35, size1: 0.8, color: '#a88a6a', alpha: 0.4, alpha1: 0, drag: 2 });
      if (Math.random() < dt * 6) dirt(G, m.pos.x, m.pos.y, m.pos.z, 1, 0.6);
      const dd = Math.hypot(target.pos.x - m.pos.x, target.pos.z - m.pos.z);
      if (dd < 0.7 || rs.t >= TS.UNDER_MAX) {
        go('surface'); rs.sx = m.pos.x; rs.sz = m.pos.z;
        m.telegraph = tele(G, { x: m.pos.x, z: m.pos.z, r: TS.BURST_R, time: TS.SURF, color: TELE });
        sfx('tesso_rumble', m.pos);
      }
      return true;
    }
    case 'surface': // the mound swells and shakes over the ring
      if (Math.random() < dt * 14) dirt(G, rs.sx, m.pos.y, rs.sz, 1, 0.7);
      if (rs.t >= TS.SURF) {
        go('burst'); m.telegraph = null; if (m.shadow) m.shadow.visible = true;
        hitArea(m, rs.sx, rs.sz, TS.BURST_R, Math.round(roll(m) * 1.35), 'phys', 1.8);
        G.vfx.dustRing(V(rs.sx, m.pos.y, rs.sz), TS.BURST_R, 18); G.vfx.ring(V(rs.sx, m.pos.y, rs.sz), { color: '#e8c8a0', r0: 0.3, r1: TS.BURST_R * 1.1, life: 0.4 });
        dirt(G, rs.sx, m.pos.y, rs.sz, 16, 1.2);
        if (playerIn(G, rs.sx, rs.sz, 6)) G.engine.rig.shake(0.3);
        sfx('tesso_burst', m.pos);
      }
      return false;
    case 'burst': if (rs.t >= 0.42) { go('dazed'); m.state = 'rest'; m.restDur = TS.DAZE; m.emote?.('sweat', TS.DAZE); } return false;
    case 'dazed': if (rs.t >= TS.DAZE) { go('up'); m.state = 'chase'; m.cd = rand(0.5, 0.9); rs.bcd = rand(5.5, 8); } return false;
    case 'gnawWind':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.5);
      if (rs.t >= TS.GNAW_WIND) {
        go('gnaw'); m.state = 'attack'; m.telegraph = null; rs.bites = 0;
        sfx('tesso_gnaw', m.pos);
      }
      return false;
    case 'gnaw': { // a lunge and a chattering flurry of bites (two hits in the cone)
      if (rs.t < 0.18) { const f = m.facing; m.move((rs._d ||= new THREE.Vector3()).set(Math.sin(f), 0, Math.cos(f)), dt, 2.2); m.facing = f; }
      if ((rs.bites || 0) < 2 && rs.t >= 0.1 + rs.bites * 0.16) {
        rs.bites = (rs.bites || 0) + 1;
        const fx = m.pos.x + Math.sin(m.facing) * 0.55, fz = m.pos.z + Math.cos(m.facing) * 0.55;
        hitArea(m, fx, fz, 0.85, Math.round(roll(m) * 0.6), 'phys', 0.5);
        for (let i = 0; i < 3; i++) puff(G.vfx.spark, fx, m.pos.y + 0.45, fz, { vx: rand(-1.5, 1.5), vy: rand(1, 2.5), vz: rand(-1.5, 1.5), life: 0.25, size: 0.12, size1: 0.02, color: '#e8f0ff', alpha: 1, alpha1: 0 });
      }
      if (rs.t >= TS.GNAW_T) { go('up'); m.state = 'chase'; m.cd = rand(1.4, 2.0); }
      return true;
    }
    default: {
      if (rs.st !== 'up') go('up');
      if (rs.bcd <= 0 && d > 3.6 && d < 13 && m.mode.los(m.pos, target.pos)) { // dig in and come up under them
        rs.bcd = rand(6, 8);
        go('dig'); m.state = 'windup';
        sfx('tesso_dig', m.pos);
        return false;
      }
      if (d < TS.GNAW_R + (target.radius || 0.3) - 0.2 && m.cd <= 0) {
        go('gnawWind'); m.state = 'windup';
        m.telegraph = tele(G, { shape: 'cone', x: m.pos.x, z: m.pos.z, r: TS.GNAW_R, dir: m.facing, arc: TS.GNAW_ARC, time: TS.GNAW_WIND, color: TELE });
        sfx('tesso_hiss', m.pos);
        return false;
      }
      if (d > 1.0 + (target.radius || 0.3)) { m.chase(target, dt, slow); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
const UNDER = new Set(['under', 'surface']);
export const MONSTERS = {
  tesso: mdef({
    name: 'Tesso', build: 'tesso', scale: 1.15, radius: 0.36, vr: 0.5, speed: 2.7, pack: 0.6, material: 'bone',
    attack: { type: 'melee', range: 1.5, cd: 1.8, windup: TS.GNAW_WIND },
    stats: { name: 'Tesso', life: 1.05, dmg: 1.15, def: 1.0, speed: 1.1, xp: 1.25, element: 'phys', res: { frost: 15, fire: -15 } },
    variants: [
      { key: 0, fur: '#7c808e', furHi: '#a8aebc', belly: '#dcd4cc', pink: '#f2a0aa', tail: '#d8a8a8', bead: '#6a4030', tassel: '#d8402e' },
      { key: 1, name: 'Sutra Tesso', fur: '#8a6e5c', furHi: '#b89c86', belly: '#ecdcc8', pink: '#f4a4a8', tail: '#d4a4a0', bead: '#3e2a20', tassel: '#e8a03a', scroll: true },
      { key: 2, name: 'Elder Tesso', fur: '#cfc8c4', furHi: '#f4f0ec', belly: '#fffaf4', pink: '#f6b0b4', tail: '#e8c0bc', bead: '#7a4a2e', tassel: '#d8302e', elder: true },
    ],
    ai: tessoAI,
    update: (m, dt) => {
      if (!m.aggro && m.rs.st !== 'idle') { m.rs.st = 'idle'; act(m, 'idle'); }
      if (!m.aggro && Math.random() < dt * 0.08 && playerIn(m.G, m.pos.x, m.pos.z, 14)) m.emote('?', 1.0);
    },
    onSpawn: m => { m.facing = rand(0, TAU); act(m, 'idle'); m.model.animate?.(0, 0, false); },
    onDeath: m => {
      sfx('tesso_die', m.pos); m.G.vfx.dustRing(m.pos, 1.1, 12); if (m.shadow) m.shadow.visible = true;
      for (let i = 0; i < 10; i++) { const a = rand(0, TAU); puff(m.G.vfx.dot, m.pos.x, m.pos.y + 0.5, m.pos.z, { vx: Math.cos(a) * rand(1, 2.6), vy: rand(2, 4), vz: Math.sin(a) * rand(1, 2.6), life: rand(0.6, 0.9), size: rand(0.06, 0.1), size1: 0.04, color: i % 2 ? m.model.variant?.bead || '#6a4030' : '#a8aebc', alpha: 1, alpha1: 0.8, grav: 13, drag: 0.6 }); } // (the juzu scatters)
    },
    damageTaken: (m, dmg) => {
      if (UNDER.has(m.rs?.st)) return 0; // (under the earth: out of reach)
      const t = m.G.engine.time || 0; if (t - (m._hurtT || -9) > 0.45) { m._hurtT = t; sfx('tesso_hurt', m.pos); }
      return dmg;
    },
  }),
};
export const BUILD = { tesso: buildTesso };
