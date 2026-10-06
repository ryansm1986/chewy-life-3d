// Boss: Yuki-onna, the Frost Princess (Yukimi Onsen) — docs/REGIONS.md §2 / §3.4. Owned by the Bosses B agent.
// An elegant, cute snow spirit: a pale furisode kimono that melts into icy blue at the hem (snowflakes, a wave band, a
// trailing train), an ice-blue obi with a crystal brooch and a big bow, long black hime-cut hair, big calm blue eyes, an
// ice tiara and a snowflake kanzashi. She floats a little above the ice with an icy glow round her.
// Fight (state in m.Y, frame tasks on m.B = kitB BossRuntime, frost effects from ./fx_yukionna.js):
//   BLIZZARD     she breathes in (cheeks puffed, sleeves up) and blows a cone of snow: ticking frost damage, a chill and
//                a shove. Cone telegraph that tracks you for most of the wind-up, then locks. Phase 2: a second breath.
//   ICICLES      a sleeve raised: 6 (9) icicles fall into staggered red circles round you; each one chills.
//   FROZEN FLOOR she twirls and glazes 3 (4) patches of glare ice (cyan circles first); on them you slide: the grip of
//                your steps halves and your momentum carries on (implemented with Player.slowT/slowAmt + Player.knock).
//   ICE MIRRORS  mirrors rise round you; she vanishes and steps out of one, glass copies of her out of the others. All
//                of them aim ice darts at you (lane telegraphs). The copies shatter when hit (a puff of chill) or burst
//                after a few seconds (small lilac circles). She rests meanwhile: find her and hit her.
//   children     at 70% she calls two yuki-warashi.
//   IN HER HALL  (the Onsen Caverns' round arena, r ≥ 15 m: docs/ZONES.md §8.2) the fight is retuned for the bigger ring
//                and a hero fresh from two dense floors: two waves of snow children (70%: three yuki-warashi; 40%: two
//                more and two tsurara), spawned toward the middle of the hall; more icicles and glare-ice patches to cover
//                the ring; the mirrors stand a little wider; her whiteout's lantern refuges are the hall's own yukimi
//                lanterns (world.arenaLanterns), and its haze is a touch thinner down here, so the dark cave never goes
//                flat white.
//   PHASE 2      below 50% a WHITEOUT blows in, in waves (13 s on, 8 s off): a snow-haze overlay with clear ellipses round
//                Chewy and each lantern (world.arenaLanterns, or four spirit lanterns she lights if the map has none), the
//                fog pulled in behind him, the lanterns flaring warm. Away from a lantern's warmth, frostbite nips and
//                chills you every second. Every attack comes faster. Fog / background are restored when each wave ends,
//                on her death and when the world changes (world.moodHold is set while she holds them).
// Exports MONSTERS (yukiOnna + yukiMirror, her glass copies) and BUILD. Sounds in ./yukionna.sfx.js (pure data).
import * as THREE from 'three';
import { MONSTERS as ALL_MONSTERS, ell, cone } from '../../dungeon/monsters.js';
import { paint, merge, tube, xf, mergeVertices } from '../../gfx/geom.js';
import { makeToon, makeOutline } from '../../gfx/materials.js';
import { glowTexture } from '../../gfx/textures.js';
import { Events } from '../../core/events.js';
import { TAU, clamp, rand, ease, dampAngle, angleDiff, smoothstep } from '../../core/util.js';
import { BossRuntime, V, C, hitCircle, roll, sfx, pickId, summonAt, playerIn } from './kitB.js';
import { frostFx, whiteoutMesh, FR, ICE, PAL_SNOW, PAL_ICE, alignFn } from './fx_yukionna.js';
import { icicleDrop } from '../monsters/onsen.js';
import { chill, bolt } from '../monsters/bamboo.js';

const S = 2.4;            // model scale (unit model ≈ 1.2 tall → ≈ 2.9 m)
const COL = { blizzard: '#3446ff', icicle: '#ff3d6b', floor: '#00b0ff', mirror: '#a24cff', dart: '#ff3f86', burst: '#a24cff' };
const TUNE = {
  cd: { blizzard: [6, 4.4], icicles: [7, 5.2], floor: [16, 12], mirror: [17, 12.5] },
  blizzard: { wind: [1.1, 0.85], R: 8.6, arc: 0.5, dur: 1.25, tick: 0.25, dmg: 0.3, push: 4.2 },
  icicles: { n: [6, 9], r: 1.25, dmg: 0.75 },
  floor: { n: [3, 4], r: [3.1, 3.9], life: [11, 14] },
  mirror: { n: [3, 4], R: 5.3, life: 5.6 },
  keep: [6, 5.5],
  whiteout: { on: 13, off: 8 },
};
// the arena retune (an authored round hall of r ≥ 15 m instead of the 11 m outdoor lake)
const ARENA_TUNE = { summonAt: [0.7, 0.4], waves: [['yukiwarashi', 'yukiwarashi', 'yukiwarashi'], ['yukiwarashi', 'yukiwarashi', 'tsurara', 'tsurara']], icicleN: [7, 10], floorN: [4, 5], mirrorR: 6.0, rim: 4.6, woA: 0.6, woFog: 0.72 };
const inHall = Y => (Y.arena?.r || 0) >= 15;
const _v = V(), _w = V(), _p = V(), _q = V(), _cr = V(), _cu = V(), _cf = V();
const ph = Y => (Y.phase > 1 ? 1 : 0);

// ================================================================== the kimono texture (drawn once per session)
// v runs up the kimono lathe (0 = hem, 1 = collar), u round it (0.5 = front). White body melting into icy blue at the
// hem, a wave band, snowflakes, the crossed collar in front. A plain white patch at KUV is where every other part of her
// samples (so one material serves the whole model and the hit flash reaches all of it).
const KUV = [0.75, 0.55];
let KTEX = null;
function kimonoTex() {
  if (KTEX) return KTEX;
  const W = 512, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  const Y = v => (1 - v) * H, X = u => u * W;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#f7faff'); gr.addColorStop(0.62, '#e4f0ff'); gr.addColorStop(0.76, '#aed2f8'); gr.addColorStop(0.9, '#78a8ee'); gr.addColorStop(1, '#5a8ae0');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // seigaiha wave band near the hem
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.2;
  for (let row = 0; row < 2; row++) for (let i = -1; i < 34; i++) { const x = i * 16 + row * 8, y = Y(0.035 + row * 0.028); for (const r of [9, 5]) { g.beginPath(); g.arc(x, y, r, Math.PI, TAU); g.stroke(); } }
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, Y(0.1), W, 3);
  // snowflakes: denser and bigger toward the hem, white on blue, soft blue on white
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const flake = (x, y, r, col) => { g.strokeStyle = col; g.lineWidth = Math.max(1.6, r * 0.16); for (let i = 0; i < 6; i++) { const a = i * TAU / 6, ca = Math.cos(a), sa = Math.sin(a); g.beginPath(); g.moveTo(x, y); g.lineTo(x + ca * r, y + sa * r); const bx = x + ca * r * 0.55, by = y + sa * r * 0.55; for (const k of [-1, 1]) { const b = a + k * 0.7; g.moveTo(bx, by); g.lineTo(bx + Math.cos(b) * r * 0.32, by + Math.sin(b) * r * 0.32); } g.stroke(); } };
  for (let i = 0; i < 90; i++) {
    const v = 0.05 + Math.pow(rnd(), 1.7) * 0.8, u = rnd(), r = 5 + (1 - v) * 13 * (0.6 + rnd() * 0.5);
    if (Math.abs(u - KUV[0]) < 0.08 && Math.abs(v - KUV[1]) < 0.09) continue;
    if (Math.abs(u - 0.5) < 0.16 && v > 0.6) continue; // (the collar)
    const col = v < 0.28 ? 'rgba(255,255,255,0.95)' : 'rgba(150,190,238,0.85)';
    for (const dx of [0, -W, W]) flake(X(u) + dx, Y(v), r, col);
  }
  // crossed collar (left over right) with a pink under-collar, and the neckband round the back
  const lap = (u0, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(X(u0), Y(1.0)); g.lineTo(X(0.5), Y(0.6)); g.stroke(); };
  lap(0.36, '#f3c4d8', 26); lap(0.64, '#f3c4d8', 26);
  lap(0.345, '#b6d6f6', 16); lap(0.655, '#b6d6f6', 16);
  g.fillStyle = '#b6d6f6'; g.fillRect(0, 0, W, Y(0.975));
  g.fillStyle = '#ffffff'; g.fillRect(X(KUV[0] - 0.05), Y(KUV[1] + 0.06), X(0.1), Y(0.88)); // (the plain patch: 0.1 x 0.12 of pure white)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (KTEX = t);
}

// ================================================================== model
const PAL = { skin: '#fdf3f4', skinD: '#e8d4e4', hair: '#1f1c30', hairHi: '#5a6aa8', iris: '#3a66c8', irisL: '#8fd4ff', pupil: '#141838', lash: '#1a1628', lip: '#d8789a', blush: '#ffb0c8', obi: '#4f7ae0', obiD: '#3a5cc0', silver: '#e2ecfa', cord: '#ffd2e2', crystal: '#c6f2ff', inner: '#b6d6f6' };
const KP = [[0.385, 0.0], [0.37, 0.05], [0.335, 0.13], [0.29, 0.23], [0.24, 0.33], [0.212, 0.42], [0.192, 0.49], [0.186, 0.54], [0.19, 0.6], [0.196, 0.655], [0.186, 0.7], [0.16, 0.742], [0.118, 0.778], [0.08, 0.808], [0.058, 0.835], [0.05, 0.87]];
const ZS = 0.9;               // kimono front-back squash
const HC = [0, 0.99, 0.01], HR = 0.14; // head centre / radius
const faceZ = (x, y) => HR * 0.95 * Math.sqrt(Math.max(0, 1 - (x / HR) ** 2 - ((y - HC[1]) / (HR * 0.97)) ** 2)) + HC[2];
/** every non-kimono vertex samples the texture's plain white patch */
const plainUV = g => { const n = g.attributes.position.count, uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = KUV[0]; uv[i * 2 + 1] = KUV[1]; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
const col = h => new THREE.Color(h);
function tubeP(pts, color, radial = 7, cap = true) { return paint(tube(pts.map(([x, y, z, r]) => ({ p: V(x, y, z), r })), radial, cap), typeof color === 'function' ? color : (p, n, o) => o.set(color)); }
function kimonoGeo() {
  const pts = new THREE.SplineCurve(KP.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(30);
  const g = new THREE.LatheGeometry(pts, 44, Math.PI, TAU);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const a = Math.atan2(x, z), back = Math.max(0, -Math.cos(a)), low = clamp((0.26 - y) / 0.26);
    z *= ZS;
    z -= back * back * low * low * 0.2; y -= back * low * low * 0.02;   // the train
    y += Math.sin(a * 5 + 0.6) * 0.012 * low * low;                      // a softly wavy hem
    P.setXYZ(i, x, Math.max(0, y), z);
  }
  g.computeVertexNormals();
  return paint(g, (p, n, o) => { o.set('#ffffff'); if (n.y < -0.2) o.lerp(col('#d8e6f8'), 0.4); });
}
function obiGeo() {
  const parts = [];
  const band = new THREE.CylinderGeometry(0.198, 0.197, 0.1, 44, 2, true); band.scale(1, 1, ZS); band.translate(0, 0.55, 0);
  parts.push(paint(band, (p, n, o) => { o.set(PAL.obi); const e = Math.abs(p.y - 0.55); if (e > 0.036) o.set(PAL.silver); else if (e < 0.008) o.set(PAL.obiD); }));
  const cord = new THREE.TorusGeometry(0.2, 0.009, 5, 44); cord.rotateX(Math.PI / 2); cord.scale(1, 1, ZS); cord.translate(0, 0.55, 0);
  parts.push(paint(cord, (p, n, o) => o.set(PAL.cord)));
  const br = new THREE.OctahedronGeometry(0.028, 0); br.scale(1, 1.2, 0.6); br.translate(0, 0.552, 0.2 * ZS + 0.012); br.computeVertexNormals();
  parts.push(paint(br, (p, n, o) => o.set(PAL.crystal)));
  // the bow behind: a plump knot, two loops, two tails
  parts.push(ell(0.08, 0.07, 0.05, PAL.obi, [0, 0.575, -0.19], [0, 0, 0], 12));
  for (const k of [-1, 1]) {
    parts.push(ell(0.1, 0.06, 0.035, PAL.obi, [k * 0.1, 0.6, -0.18], [0.1, k * 0.3, k * 0.35], 12), ell(0.05, 0.03, 0.02, PAL.silver, [k * 0.155, 0.62, -0.165], [0, k * 0.3, k * 0.35], 8));
    parts.push(ell(0.045, 0.11, 0.018, PAL.obiD, [k * 0.05, 0.46, -0.18], [0.15, 0, k * 0.2], 10));
  }
  return parts.map(plainUV);
}
function headGeo() {
  const H = [];
  const skull = new THREE.SphereGeometry(HR, 24, 18); skull.scale(1, 0.97, 0.95); skull.translate(...HC);
  H.push(paint(skull, (p, n, o) => { o.set(PAL.skin); if (n.y < -0.4) o.lerp(col(PAL.skinD), 0.4); }));
  // neck
  H.push(paint(xf(new THREE.CylinderGeometry(0.038, 0.045, 0.1, 10), { p: [0, 0.87, 0] }), (p, n, o) => o.set(PAL.skin)));
  // eyes: dark lash line over a deep blue iris with a pale lower glow, pupil, two glints; brows; a small smile, blush
  // (the face is its own mesh with a hairline contour: the head's ink hull ringed the eyes like goggles)
  const F = [];
  const EY = 0.972, EX = 0.052;
  for (const k of [-1, 1]) {
    const x = k * EX, z = faceZ(x, EY), yaw = k * 0.36;
    F.push(ell(0.036, 0.044, 0.014, PAL.iris, [x, EY, z - 0.004], [0, yaw, 0], 12));
    F.push(ell(0.025, 0.02, 0.01, PAL.irisL, [x, EY - 0.016, z + 0.002], [0, yaw, 0], 10));
    F.push(ell(0.015, 0.019, 0.008, PAL.pupil, [x, EY + 0.002, z + 0.005], [0, yaw, 0], 8));
    F.push(ell(0.011, 0.012, 0.006, '#ffffff', [x - k * 0.006 - 0.008, EY + 0.018, z + 0.01], [0, 0, 0], 6), ell(0.006, 0.006, 0.004, '#ffffff', [x + 0.012, EY - 0.012, z + 0.009], [0, 0, 0], 5));
    const lz = (xx, yy) => faceZ(xx, yy) + 0.004;
    F.push(tubeP([[k * 0.018, EY + 0.03, lz(k * 0.018, EY + 0.03), 0.0055], [x, EY + 0.047, lz(x, EY + 0.047), 0.007], [k * 0.085, EY + 0.032, lz(k * 0.085, EY + 0.032), 0.0065], [k * 0.098, EY + 0.042, lz(k * 0.098, EY + 0.042) - 0.004, 0.003]], PAL.lash, 5));
    F.push(tubeP([[k * 0.03, EY + 0.075, lz(k * 0.03, EY + 0.075), 0.004], [k * 0.06, EY + 0.082, lz(k * 0.06, EY + 0.082), 0.0045], [k * 0.085, EY + 0.075, lz(k * 0.085, EY + 0.075), 0.0035]], PAL.hair, 4));
    F.push(ell(0.026, 0.014, 0.008, PAL.blush, [k * 0.084, EY - 0.05, faceZ(k * 0.084, EY - 0.05) - 0.002], [0, k * 0.6, 0], 8));
  }
  const MY = 0.905;
  F.push(tubeP([[-0.016, MY + 0.004, faceZ(-0.016, MY) + 0.002, 0.004], [0, MY - 0.002, faceZ(0, MY) + 0.003, 0.0045], [0.016, MY + 0.004, faceZ(0.016, MY) + 0.002, 0.004]], PAL.lip, 4));
  // hair: a hime-cut cap (blunt bangs across the brow, straight side locks to the jaw), long side locks, tiara, kanzashi
  const cap = new THREE.SphereGeometry(HR * 1.085, 30, 20); cap.translate(HC[0], HC[1] + 0.006, HC[2] - 0.004);
  const CP = cap.attributes.position;
  for (let i = 0; i < CP.count; i++) {
    const x = CP.getX(i), y = CP.getY(i) - HC[1], z = CP.getZ(i) - HC[2], a = Math.atan2(x, z);
    const fw = smoothstep(0.36, 0.62, Math.cos(a)), bw = smoothstep(0.1, 0.6, -Math.cos(a));
    const cut = fw * 0.044 + (1 - fw) * (-0.12 * (1 - bw) - 0.02 * bw);
    if (y < cut) CP.setY(i, HC[1] + cut);
  }
  cap.computeVertexNormals();
  H.push(paint(cap, (p, n, o) => { o.set(PAL.hair); const y = p.y - HC[1]; if (n.y > 0 && Math.abs(y - 0.1 + Math.abs(p.x) * 0.25) < 0.016) o.lerp(col(PAL.hairHi), 0.7); }));
  for (const k of [-1, 1]) H.push(tubeP([[k * 0.128, 0.99, 0.03, 0.028], [k * 0.14, 0.9, 0.05, 0.03], [k * 0.142, 0.8, 0.07, 0.028], [k * 0.14, 0.73, 0.08, 0.02]], (p, n, o) => { o.set(PAL.hair); if (n.z > 0.5 && n.x * k > 0) o.lerp(col(PAL.hairHi), 0.35); }, 7));
  const crystal = (r, h, p, rz) => paint(xf(new THREE.ConeGeometry(r, h, 6), { p, r: [-0.25, 0, rz] }), (q, n, o) => o.set(PAL.crystal).lerp(col('#ffffff'), clamp((q.y - p[1]) / h + 0.5) * 0.5));
  const tb = new THREE.TorusGeometry(0.105, 0.008, 4, 24, Math.PI); tb.rotateY(Math.PI / 2 + Math.PI / 2); tb.rotateX(-0.25); tb.translate(0, 1.075, 0.0);
  H.push(paint(tb, (p, n, o) => o.set(PAL.silver)));
  H.push(crystal(0.022, 0.1, [0, 1.16, 0.03], 0), crystal(0.017, 0.07, [0.048, 1.145, 0.022], -0.35), crystal(0.017, 0.07, [-0.048, 1.145, 0.022], 0.35), crystal(0.012, 0.05, [0.085, 1.12, 0.01], -0.7), crystal(0.012, 0.05, [-0.085, 1.12, 0.01], 0.7));
  // a snowflake kanzashi over the left ear with two dangling ice beads
  const kx = 0.135, ky = 1.05, kz = 0.02;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; H.push(ell(0.026, 0.006, 0.006, PAL.crystal, [kx + 0.004, ky + Math.sin(a) * 0.022, kz + Math.cos(a) * 0.022], [a, 0, 0], 5)); }
  H.push(ell(0.01, 0.012, 0.012, '#ffffff', [kx + 0.01, ky, kz], [0, 0, 0], 6), ell(0.012, 0.012, 0.012, PAL.crystal, [kx + 0.004, ky - 0.07, kz + 0.01], [0, 0, 0], 6), ell(0.009, 0.009, 0.009, PAL.crystal, [kx + 0.004, ky - 0.1, kz + 0.012], [0, 0, 0], 6));
  // head group pivots at the neck
  return [H.map(g => plainUV(g.translate(0, -0.87, 0))), F.map(g => plainUV(g.translate(0, -0.87, 0)))];
}
function hairBackGeo() { // the long curtain down her back to the thighs (its own part: it flows)
  const pts = [[0.15, 1.06], [0.158, 0.98], [0.165, 0.9], [0.2, 0.8], [0.228, 0.7], [0.228, 0.6], [0.232, 0.5], [0.255, 0.4], [0.285, 0.3]].map(([r, y]) => new THREE.Vector2(r, y));
  const SEG = 18, g = new THREE.LatheGeometry(pts, SEG, Math.PI - 1.2, 2.4);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < 0.301) { const a = Math.atan2(P.getX(i), P.getZ(i)); P.setY(i, 0.3 - 0.04 * Math.abs(Math.sin(a * SEG * 0.5 / 1.2 * Math.PI / 2 + 0.3))); } }
  g.computeVertexNormals();
  paint(g, (p, n, o) => { o.set(PAL.hair); const a = Math.atan2(p.x, p.z); if (Math.sin(a * 11) > 0.6) o.lerp(col(PAL.hairHi), 0.28); if (p.y > 0.88 && p.y < 0.95) o.lerp(col(PAL.hairHi), 0.35); });
  const a = g.toNonIndexed();
  const inner = a.clone(); inner.scale(0.965, 1, 0.965);
  const ip = inner.attributes.position, inN = inner.attributes.normal;
  for (let i = 0; i < ip.count; i += 3) for (const at of [ip, inN, inner.attributes.color, inner.attributes.uv]) { if (!at) continue; for (let c = 0; c < at.itemSize; c++) { const t = at.getComponent(i + 1, c); at.setComponent(i + 1, c, at.getComponent(i + 2, c)); at.setComponent(i + 2, c, t); } }
  for (let i = 0; i < inN.count; i++) inN.setXYZ(i, -inN.getX(i), -inN.getY(i), -inN.getZ(i));
  return [a, inner].map(q => plainUV(q.translate(0, -1.0, 0.05)));
}
function sleeveGeo(k) { // pivot at the shoulder; at rest the forearms meet in front of the obi, the long sleeve bags hang below
  const G = [];
  const arm = tubeP([[0, 0.02, 0, 0.05], [k * 0.035, -0.08, 0.03, 0.062], [k * 0.02, -0.16, 0.1, 0.07], [-k * 0.04, -0.19, 0.175, 0.078], [-k * 0.1, -0.195, 0.2, 0.084], [-k * 0.128, -0.196, 0.205, 0.086]], '#ffffff', 12, false);
  G.push(arm);
  const bag = new THREE.SphereGeometry(1, 16, 12); bag.scale(0.05, 0.215, 0.13);
  { const P = bag.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < 0) P.setZ(i, P.getZ(i) * (1 + 0.25 * (-y / 0.215))); } bag.computeVertexNormals(); }
  bag.rotateY(k * 0.15); bag.rotateX(-0.1); bag.translate(k * 0.02, -0.32, 0.1);
  G.push(paint(bag, (p, n, o) => o.set('#ffffff')));
  // kimono texture on the sleeve (snowflakes, the blue hem gradient at the bottom); the hand and the opening stay plain
  for (const g of G) {
    const P = g.attributes.position, uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { uv[i * 2] = 0.12 + (P.getZ(i) + 0.05) * 1.6 + (k > 0 ? 0 : 0.36); uv[i * 2 + 1] = clamp(0.03 + (P.getY(i) + 0.54) / 0.55 * 0.52, 0.02, 0.6); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const op = new THREE.CircleGeometry(0.072, 14); op.rotateY(-k * Math.PI / 2); op.translate(-k * 0.126, -0.196, 0.205); // (the openings meet in front: hands tucked in)
  G.push(plainUV(paint(op, (p, n, o) => o.set(PAL.inner))));
  G.push(plainUV(ell(0.03, 0.026, 0.028, PAL.skin, [-k * 0.13, -0.2, 0.215], [0, 0, 0], 8)));
  return G;
}
function shawlGeo() { // the hagoromo: a floating lilac-to-ice ribbon from one trailing end, over the elbow, behind her back, to the other
  const pts = [[0.5, -0.62, -0.2], [0.44, -0.4, -0.08], [0.33, -0.12, 0.02], [0.27, 0.0, -0.1], [0.2, 0.08, -0.24], [0, 0.12, -0.3], [-0.2, 0.08, -0.24], [-0.27, 0.0, -0.1], [-0.33, -0.12, 0.02], [-0.44, -0.4, -0.08], [-0.5, -0.62, -0.2]];
  const cv = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => V(x, y, z))), N = 44, q = [];
  for (let i = 0; i <= N; i++) { const u = i / N, p = cv.getPoint(u), e = Math.abs(u - 0.5) * 2; q.push({ p, r: 0.02 + 0.006 * Math.sin(u * Math.PI) - 0.008 * e * e }); }
  const lil = col('#dccbff'), ice = col('#bfe8ff');
  return plainUV(paint(tube(q, 6, true), (p, n, o) => o.copy(lil).lerp(ice, clamp((Math.abs(p.x) - 0.28) * 4.5))));
}
function lidGeo() { // closed eyes (blinks, meditation): skin lids with a downward lash arc
  const L = [], EY = 0.972, EX = 0.052;
  for (const k of [-1, 1]) {
    const x = k * EX, z = faceZ(x, EY);
    L.push(ell(0.04, 0.048, 0.016, PAL.skin, [x, EY + 0.002, z - 0.001], [0, k * 0.36, 0], 10));
    L.push(tubeP([[k * 0.018, EY - 0.002, faceZ(k * 0.018, EY) + 0.012, 0.005], [x, EY - 0.012, faceZ(x, EY - 0.012) + 0.013, 0.0065], [k * 0.088, EY + 0.004, faceZ(k * 0.088, EY) + 0.008, 0.005]], PAL.lash, 5));
  }
  return L.map(g => plainUV(g.translate(0, -0.87, 0)));
}
let MASTER = null;
function masters() {
  if (MASTER) return MASTER;
  MASTER = {
    body: merge([kimonoGeo(), ...obiGeo()]),
    ...(() => { const [h, f] = headGeo(); return { head: merge(h), face: merge(f) }; })(),
    hairB: merge(hairBackGeo()),
    slR: merge(sleeveGeo(1)), slL: merge(sleeveGeo(-1)), shawl: merge([shawlGeo()]),
    lids: merge(lidGeo()),
    mouthO: merge([plainUV(ell(0.017, 0.021, 0.01, '#5a2444', [0, 0.906 - 0.87, faceZ(0, 0.906) - 0.004], [0, 0, 0], 8))]),
    puff: merge([-1, 1].map(k => plainUV(ell(0.04, 0.034, 0.03, PAL.skin, [k * 0.078, 0.925 - 0.87, faceZ(k * 0.078, 0.925) - 0.02], [0, k * 0.5, 0], 10)))),
  };
  return MASTER;
}
// fresnel ice rim, a glow on the crystals, the mirror copies' glassy sheen, and a soft luminance knee (the white kimono
// under onsen bloom stays a crisp shape, with only a whisper of glow)
const YUKI_PARS = 'uniform float uMirror;';
const YUKI_OUT = /* glsl */`{
  float frY = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
  outgoingLight += vec3(0.62, 0.84, 1.0) * frY * 0.32;
  float cyY = step(0.7, diffuseColor.g) * step(0.85, diffuseColor.b) * step(diffuseColor.r, 0.82) * step(0.18, diffuseColor.b - diffuseColor.r);
  outgoingLight += diffuseColor.rgb * 0.75 * cyY;
  if (uMirror > 0.5) {
    float bandY = smoothstep(0.1, 0.0, abs(fract(vCObj.y * 1.4 - vCObj.x * 0.8 + uTime * 0.45) - 0.5) - 0.32);
    outgoingLight = mix(outgoingLight, vec3(0.6, 0.78, 1.0) * (0.72 + 0.5 * frY), 0.26) + vec3(0.9, 0.97, 1.0) * bandY * 0.36 + vec3(0.5, 0.75, 1.0) * frY * 0.42;
  }
  float lmY = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  if (lmY > 0.56) { float nlY = 0.56 + 0.16 * (1.0 - exp(-(lmY - 0.56) / 0.16)); outgoingLight *= nlY / lmY; }
}`;
function yukiMat(mirror) { return makeToon({ vertexColors: true, map: kimonoTex(), objectBrush: true, brush: 0.035, brushScale: 0.9, rim: 0.6, term: [-0.02, 0.3], fragPars: YUKI_PARS, fragOut: YUKI_OUT, uniforms: { uMirror: { value: mirror ? 1 : 0 } } }); }

function buildYuki(v) {
  const M = masters(), mirror = !!v.mirror;
  const mat = yukiMat(mirror), ol = makeOutline(mirror ? '#3a4a8a' : '#2a1622', 0.012), olThin = makeOutline(mirror ? '#3a4a8a' : '#2a1622', 0.0035);
  const root = new THREE.Group(), pivot = new THREE.Group(), hover = new THREE.Group();
  root.add(pivot); pivot.add(hover);
  const add = (parent, geo, { shadow = true, outline = true } = {}) => { const g = geo.clone(); const m = new THREE.Mesh(g, mat); m.castShadow = shadow && !mirror; m.receiveShadow = true; parent.add(m); if (outline) { const o = new THREE.Mesh(g, ol); parent.add(o); m.userData.ol = o; } return m; };
  const body = add(hover, M.body);
  const head = new THREE.Group(); head.position.set(0, 0.87, 0); hover.add(head);
  add(head, M.head);
  { const g = M.face.clone(), fm = new THREE.Mesh(g, mat); fm.receiveShadow = true; head.add(fm, new THREE.Mesh(g, olThin)); }
  const lids = new THREE.Group(); head.add(lids); add(lids, M.lids, { shadow: false, outline: false });
  const mouthO = new THREE.Group(); head.add(mouthO); add(mouthO, M.mouthO, { shadow: false, outline: false });
  const puff = new THREE.Group(); head.add(puff); add(puff, M.puff, { shadow: false });
  const hairB = new THREE.Group(); hairB.position.set(0, 1.0, -0.05); hover.add(hairB); add(hairB, M.hairB);
  const slR = new THREE.Group(); slR.position.set(0.172, 0.725, 0); hover.add(slR); add(slR, M.slR, { shadow: false }); // (sleeves cast no shadow: they striped the skirt)
  const slL = new THREE.Group(); slL.position.set(-0.172, 0.725, 0); hover.add(slL); add(slL, M.slL, { shadow: false });
  const shawl = new THREE.Group(); shawl.position.set(0, 0.7, 0); hover.add(shawl); add(shawl, M.shawl, { shadow: false });
  lids.visible = false; mouthO.scale.setScalar(0.001); puff.scale.setScalar(0.001);
  const pose = { hover: 0.3, bob: 0.06, lean: 0, roll: 0, spin: 0, hX: 0, hY: 0, hZ: 0, rX: -0.22, rY: 0, rZ: 0.06, lX: -0.22, lY: 0, lZ: -0.06, hair: 0, mouth: 0, puff: 0, lids: 0, rate: 7, fan: 0 };
  const cur = { ...pose, spinA: 0, blinkT: 2, blink: 0 };
  const NUM = ['hover', 'lean', 'roll', 'hX', 'hY', 'hZ', 'rX', 'rY', 'rZ', 'lX', 'lY', 'lZ', 'hair', 'mouth', 'puff'];
  const animate = (dt, t, moving) => {
    const k = 1 - Math.exp(-pose.rate * dt);
    for (const n of NUM) cur[n] += (pose[n] - cur[n]) * k;
    hover.position.y = (cur.hover + Math.sin(t * 1.9) * pose.bob) / S;
    if (pose.spin) cur.spinA += pose.spin * dt;
    else { cur.spinA = ((cur.spinA % TAU) + TAU) % TAU; if (cur.spinA > Math.PI) cur.spinA -= TAU; cur.spinA *= Math.exp(-9 * dt); }
    hover.rotation.set(cur.lean + (moving ? 0.08 : 0), cur.spinA, cur.roll + Math.sin(t * 0.8) * 0.02);
    head.rotation.set(cur.hX + Math.sin(t * 0.9) * 0.025, cur.hY, cur.hZ + Math.sin(t * 0.7) * 0.03);
    const fan = pose.fan ? Math.sin(t * 8) * 0.3 * pose.fan : 0, sw = Math.sin(t * 1.3) * 0.04;
    slR.rotation.set(cur.rX + sw + fan, cur.rY, cur.rZ); slL.rotation.set(cur.lX - sw, cur.lY, cur.lZ);
    hairB.rotation.set(0.05 + cur.hair + (moving ? 0.1 : 0) + Math.sin(t * 1.2) * 0.03, 0, Math.sin(t * 0.9) * 0.03);
    shawl.rotation.set(0.08 + cur.hair * 0.6 + (moving ? 0.14 : 0) + Math.sin(t * 1.1) * 0.06, Math.sin(t * 0.7) * 0.08, Math.sin(t * 0.9 + 1) * 0.05);
    shawl.position.y = 0.7 + Math.sin(t * 1.6) * 0.012;
    // blinks (unless her eyes are closed anyway)
    cur.blinkT -= dt; if (cur.blinkT < 0) cur.blinkT = rand(2.6, 5.2);
    lids.visible = pose.lids > 0.5 || cur.blinkT < 0.12;
    mouthO.scale.setScalar(Math.max(0.001, cur.mouth)); puff.scale.setScalar(Math.max(0.001, cur.puff));
  };
  animate(0, 0, false);
  return { root, pivot, body, mat, outline: body.userData.ol, animate, pose, cur, parts: { hover, head, lids, mouthO, puff, hairB, slR, slL, shawl }, mirror };
}
export const BUILD = { yukiOnna: v => buildYuki(v || {}), yukiMirror: v => buildYuki({ ...(v || {}), mirror: true }) };

// ================================================================== poses
const REST = { hover: 0.3, bob: 0.06, lean: 0, roll: 0, spin: 0, hX: 0, hY: 0, hZ: 0, rX: -0.22, rY: 0, rZ: 0.06, lX: -0.22, lY: 0, lZ: -0.06, hair: 0, mouth: 0, puff: 0, lids: 0, rate: 7, fan: 0 };
const poseTo = (m, o) => Object.assign(m.model.pose, REST, o);

// ================================================================== small helpers
function pushPlayer(G, dx, dz, speed) { // raise Player.knock's component along (dx, dz) to `speed` (walls still stop him)
  const P = G.player; if (!P || G.playerDead || P.leap || P.dash) return;
  const k = P.knock ||= new THREE.Vector3();
  const L = Math.hypot(dx, dz); if (L < 1e-4) return;
  const ux = dx / L, uz = dz / L, along = k.x * ux + k.z * uz;
  if (along < speed) { k.x += ux * (speed - along); k.z += uz * (speed - along); }
}
const lerp = (a, b, k) => a + (b - a) * k;
function inArena(Y, x, z, pad = 1.2) { const A = Y.arena; return Math.hypot(x - A.x, z - A.z) < A.r - pad; }
function openSpot(m, x, z, r = 0.6) { const W = m.world; return W.walkable(x, z) && !W.collision?.solidAt?.(x, z, r); }
function mouthPos(m, out) { const f = m.facing; return out.set(m.pos.x + Math.sin(f) * 0.3, m.pos.y + (0.9 * S) + m.model.cur.hover, m.pos.z + Math.cos(f) * 0.3); }

// ================================================================== spawn
function onSpawn(m) {
  const G = m.G, W = m.world, L = m.mode.layout, fx = frostFx(G);
  const home = { x: m.pos.x, z: m.pos.z };
  const A0 = L?.arena;
  const arena = A0 ? { x: A0.x, z: A0.z, r: A0.r } : { x: home.x, z: home.z, r: 11 };
  const B = m.B = new BossRuntime(m);
  m.height = 3.15; m.shadow.scale.setScalar(1.05);
  const Y = m.Y = { st: 'dormant', t: 0, phase: 1, home, arena, fx, busy: false, restT: 0, gcd: 0.6, cds: { blizzard: 1.5, icicles: 3.5, floor: 9, mirror: 14 }, fightT: 0,
    sheets: [], clones: [], summoned: 0, canAct: false, tgt: null, strafe: 1, strafeT: 2, hidden: false, last: [],
    slide: { mx: 0, mz: 0, lx: 0, lz: 0, ax: 0, az: 0, was: false, told: false, sfxT: 0 }, moving: false,
    wo: { on: false, k: 0, cycleT: 0, active: false, saved: false, save: { near: 0, far: 0, color: new THREE.Color(), bg: new THREE.Color() }, lights: [], glows: [], spirits: [], biteT: 1, told: false, mesh: null } };
  m.facing = Math.atan2(arena.x - home.x + 0.01, arena.z - home.z + 6);
  poseTo(m, { lids: 1, rX: -0.3, lX: -0.3, hX: 0.12, bob: 0.08 });
  // an icy glow that follows her (a pool light, no flicker)
  Y.light = W.lightPool?.addSource({ pos: V(m.pos.x, m.pos.y + 2.4, m.pos.z), color: C('#9fd8ff'), intensity: 2.6, radius: 7, priority: 6 }) || null;
  // the lanterns that matter in the whiteout: the map's own round the arena, or four spirit lanterns she lights herself
  const lan = (W.arenaLanterns || []).filter(p => Math.hypot(p.x - arena.x, p.z - arena.z) < arena.r + 6);
  Y.lanterns = lan.map(p => ({ x: p.x, z: p.z, y: W.heightAt(p.x, p.z), top: p.y }));
  if (!Y.lanterns.length) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4, x = arena.x + Math.cos(a) * arena.r * 0.72, z = arena.z + Math.sin(a) * arena.r * 0.72, y = W.heightAt(x, z); Y.lanterns.push({ x, z, y, top: y + 1.6, spirit: true }); }
  // whiteout overlay + lantern glows, built now (drawn for a few frames under the ground behind the iris)
  const wo = Y.wo;
  wo.mesh = whiteoutMesh(); B.scene.add(wo.mesh);
  const gm = new THREE.SpriteMaterial({ map: glowTexture(), color: C('#ffc27a'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
  for (const l of Y.lanterns) {
    const s = new THREE.Sprite(gm); s.position.set(l.x, l.top + 0.1, l.z); s.scale.setScalar(2.6); s.renderOrder = 14; s.visible = false; B.scene.add(s); wo.glows.push(s);
    if (l.spirit) { const sp = spiritLantern(); sp.position.set(l.x, l.y - 2, l.z); sp.visible = false; B.scene.add(sp); wo.spirits.push(sp); }
  }
  wo.gm = gm;
  const warm = new THREE.Mesh(wo.mesh.geometry, wo.mesh.material); warm.frustumCulled = false; warm.renderOrder = 5; B.scene.add(warm); B.warmUp(warm); B.after(0.3, () => B.scene.remove(warm));
  for (const k of [['icicle', f => f.mkIcicle(), 6], ['sheet', f => f.mkSheet(), 3], ['mirror', f => f.mkMirror(), 3], ['dart', f => f.mkDart(), 3]]) fx.want(...k);
}
function spiritLantern() { // a floating paper chōchin with a warm glow (for maps without arena lanterns)
  const P = [];
  const body = new THREE.LatheGeometry([[0.001, -0.26], [0.12, -0.24], [0.2, -0.14], [0.225, 0], [0.2, 0.14], [0.12, 0.24], [0.001, 0.26]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  P.push(paint(body, (p, n, o) => { o.set('#fff0d0'); if (Math.abs(Math.sin(p.y * 38)) > 0.93) o.set('#e8c898'); }));
  P.push(paint(xf(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12), { p: [0, 0.27, 0] }), (p, n, o) => o.set('#2a2230')), paint(xf(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), { p: [0, -0.27, 0] }), (p, n, o) => o.set('#2a2230')));
  P.push(paint(xf(new THREE.TorusGeometry(0.05, 0.01, 4, 10), { p: [0, 0.33, 0] }), (p, n, o) => o.set('#2a2230')));
  const g = merge(P);
  const mat = makeToon({ vertexColors: true, objectBrush: true, rim: 0.5, fragOut: 'outgoingLight += diffuseColor.rgb * 0.9 * step(0.8, diffuseColor.r) * step(0.6, diffuseColor.g);' });
  const m = new THREE.Mesh(g, mat); m.add(new THREE.Mesh(g, makeOutline('#2a1622', 0.018)));
  const grp = new THREE.Group(); grp.add(m); grp.scale.setScalar(1.6); return grp;
}

// ================================================================== per frame
function update(m, dt) {
  const Y = m.Y, B = m.B; if (!Y || B.dead) return;
  const G = m.G, P = G.player;
  m.anim.lunge = 0; m.anim.wind = 0; // (her own motion only; the kit's pivot squash would bend a 2.7 m princess)
  B.update(dt);
  const act = Y.canAct; Y.canAct = false;
  if (Y.light) Y.light.pos.set(m.pos.x, m.pos.y + 2.4, m.pos.z);
  updateSheets(m, dt); updateClones(m, dt); updateWhiteout(m, dt);
  aura(m, dt);
  if (!m.aggro) { // floating over the lake with her eyes closed; the default idle wander is undone
    m.pos.x = Y.home.x; m.pos.z = Y.home.z;
    if (Math.random() < dt * 3) Y.fx.p('n', FR.FLAKE, m.pos.x + rand(-2, 2), m.pos.y + rand(2, 3.2), m.pos.z + rand(-2, 2), { vx: rand(-0.2, 0.2), vy: -0.4, vz: rand(-0.2, 0.2), life: 3, size: 0.22, size1: 0.12, color: ICE.white, alpha: 1, alpha1: 0, spin: 1 });
    return;
  }
  if (Y.st === 'dormant') { startIntro(m); return; }
  Y.fightT += dt;
  for (const k in Y.cds) Y.cds[k] -= dt * (Y.phase > 1 ? 1.15 : 1);
  Y.moving = false;
  if (Y.st === 'intro' || Y.hidden) return;
  Y.restT -= dt;
  const tgt = Y.tgt?.alive !== false && Y.tgt?.pos ? Y.tgt : P;
  if (!tgt) return;
  const d = Math.hypot(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z);
  const frac = m.life / m.lifeMax;
  if (!Y.busy && act) {
    if (Y.phase === 1 && frac < 0.5) { startStorm(m); return; }
    const sAt = inHall(Y) ? ARENA_TUNE.summonAt : [0.7];
    if (Y.summoned < sAt.length && frac < sAt[Y.summoned]) { callChildren(m); return; }
    Y.gcd -= dt;
    if (Y.restT <= 0 && Y.gcd <= 0 && think(m, tgt, d)) return;
  }
  if (!Y.busy && act) reposition(m, dt, tgt, d);
}
function ai(m, dt, target) { const Y = m.Y; if (!Y) return false; Y.canAct = true; Y.tgt = target; return Y.moving || false; }

function aura(m, dt) {
  const Y = m.Y, fx = Y.fx, n = fx.emit('yA', m.aggro ? 7 : 3, dt);
  for (let i = 0; i < n; i++) { // snowflakes drifting round her, mist off the hem
    const a = rand(0, TAU), r = rand(0.7, 1.2);
    fx.p(i % 2 ? 'a' : 'n', i % 2 ? FR.STAR : FR.FLAKE, m.pos.x + Math.cos(a) * r, m.pos.y + rand(0.5, 2.6), m.pos.z + Math.sin(a) * r, { vx: -Math.sin(a) * 0.4, vy: rand(-0.2, 0.3), vz: Math.cos(a) * 0.4, life: 1.4, size: i % 2 ? 0.22 : 0.2, size1: 0.05, color: i % 2 ? ICE.glow : ICE.white, alpha: 0.9, alpha1: 0, spin: 2 });
  }
  if (!Y.hidden && fx.emit('yM', 6, dt)) { const a = rand(0, TAU); fx.p('n', FR.PUFF, m.pos.x + Math.cos(a) * 0.5 - Math.sin(m.facing) * 0.4, m.pos.y + 0.12, m.pos.z + Math.sin(a) * 0.5 - Math.cos(m.facing) * 0.4, { vx: Math.cos(a) * 0.3, vy: 0.15, vz: Math.sin(a) * 0.3, life: 1.4, size: 0.5, size1: 1.1, color: ICE.mist, alpha: 0.45, alpha1: 0, spin: 0.5 }); }
}

// ------------------------------------------------------------------ intro
function startIntro(m) {
  const Y = m.Y, B = m.B, fx = Y.fx; Y.st = 'intro';
  sfx('yuki_hum', m.pos);
  m.mode.bossEngaged?.(m);
  B.run((dt, t) => {
    if (t > 0.35 && !Y.i1) { Y.i1 = true; poseTo(m, { lids: 0, hX: -0.05, rX: -0.4, lX: -0.4 }); }
    if (t > 0.75 && !Y.i2) {
      Y.i2 = true; poseTo(m, { hover: 0.55, rX: -0.5, rZ: 1.2, lX: -0.5, lZ: -1.2, hX: -0.12, spin: 5, rate: 5 });
      fx.burst(m.pos.x, m.pos.y + 1.4, m.pos.z, { frame: FR.FLAKE, n: 28, colors: PAL_SNOW, speed: 6, up: 2.5, size: 0.34, grav: 0.5, drag: 1.4, life: 1.6 });
      fx.burst(m.pos.x, m.pos.y + 1.4, m.pos.z, { frame: FR.BLOSSOM, n: 12, colors: PAL_SNOW, speed: 4, up: 3, size: 0.3, grav: 0.4, drag: 1.2, life: 1.8 });
      fx.p('a', FR.RING, m.pos.x, m.pos.y + 0.15, m.pos.z, { life: 0.7, size: 1, size1: 14, color: ICE.glow, alpha: 0.9, alpha1: 0, rot: 0 });
      sfx('yuki_laugh', m.pos); m.G.engine.rig.shake(0.3);
    }
    if (t > 1.5 && !Y.i3) { Y.i3 = true; poseTo(m, {}); }
    if (t < 1.8) return true;
    Y.st = 'fight'; Y.gcd = 0.4; m._prof = null; // (the framing re-measures her in her fighting pose)
    return false;
  });
}

// ------------------------------------------------------------------ moving: hold a distance, drift round, stay on the lake
function reposition(m, dt, tgt, d) {
  const Y = m.Y, want = TUNE.keep[ph(Y)], slow = (m.status.slow?.t > 0 ? 1 - m.status.slow.amt : 1);
  Y.moving = false;
  if (d > 12 || !m.mode.los(m.pos, tgt.pos)) { m.chase(tgt, dt, slow); Y.moving = true; return; }
  Y.strafeT -= dt; if (Y.strafeT <= 0) { Y.strafe = -Y.strafe; Y.strafeT = rand(1.8, 3.4); }
  let dx = tgt.pos.x - m.pos.x, dz = tgt.pos.z - m.pos.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const radial = clamp((d - want) / 2, -1, 1);
  let mx = dx * radial - dz * Y.strafe * 0.7, mz = dz * radial + dx * Y.strafe * 0.7;
  const A = Y.arena, ox = m.pos.x - A.x, oz = m.pos.z - A.z, od = Math.hypot(ox, oz) || 1;
  const rim = A.r - (inHall(Y) ? ARENA_TUNE.rim : 2.2); // (in the hall she keeps off the lantern ring and the rock: the fight stays in the open)
  if (od > rim) { const k = clamp((od - rim) / 1.5) * 1.6; mx -= ox / od * k; mz -= oz / od * k; }
  const ml = Math.hypot(mx, mz);
  if (ml < 0.15) { m.faceTo(tgt.pos.x, tgt.pos.z, dt); return; }
  _v.set(mx / ml, 0, mz / ml);
  m.move(_v, dt, slow * (d > want + 3 ? 1.2 : 0.75));
  m.facing = dampAngle(m.facing, Math.atan2(dx, dz), 8, dt);
  Y.moving = true;
}
function think(m, tgt, d) {
  const Y = m.Y, C = Y.cds, opts = [];
  if (C.blizzard <= 0 && d < TUNE.blizzard.R + 0.5) opts.push(['blizzard', d < 7 ? 3 : 1.6]);
  if (C.icicles <= 0) opts.push(['icicles', 2.4]);
  if (C.floor <= 0 && Y.sheets.length < 2) opts.push(['floor', 2.2]);
  if (C.mirror <= 0 && Y.fightT > 10 && ALL_MONSTERS.yukiMirror) opts.push(['mirror', Y.phase > 1 ? 3 : 2.2]);
  if (!opts.length) return false;
  let tot = 0; for (const o of opts) { if (Y.last[0] === o[0]) o[1] *= 0.35; tot += o[1]; }
  let r = Math.random() * tot, pick = opts[0][0];
  for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
  Y.last.unshift(pick); Y.last.length = 2;
  C[pick] = TUNE.cd[pick][ph(Y)] * rand(0.9, 1.12);
  m.mode.bossEngaged?.(m);
  if (pick === 'blizzard') doBlizzard(m, tgt);
  else if (pick === 'icicles') doIcicles(m, tgt);
  else if (pick === 'floor') doFloor(m, tgt);
  else doMirror(m, tgt);
  return true;
}
/** an attack is over: a breather ("hit me now"): a sleeve fanning, a soft circle under her */
function rest(m, sec) {
  const Y = m.Y; Y.busy = false; Y.restT = sec * (Y.phase > 1 ? 0.78 : 1); Y.gcd = 0.3;
  poseTo(m, { fan: 1, rX: -1.25, rZ: 0.25, hZ: 0.14, hX: 0.08, lids: 0 });
  m.B.after(Math.max(0.3, Y.restT - 0.1), () => { if (!Y.busy) poseTo(m, {}); });
  if (Y.restT > 0.9) { m.emote('sweat', Y.restT); m.G.vfx.decal(m.pos, { r: m.bodyR * 1.5, color: '#c8e8ff', additive: true, opacity: 0.32, life: Y.restT, spin: -0.8 }); }
}

// ------------------------------------------------------------------ BLIZZARD
function inCone(m, aim, x, z, r) { const T = TUNE.blizzard, dx = x - m.pos.x, dz = z - m.pos.z, dd = Math.hypot(dx, dz); if (dd > T.R + r || dd < 0.2) return false; return Math.abs(angleDiff(aim, Math.atan2(dx, dz))) < T.arc + Math.atan2(r, dd); }
function doBlizzard(m, tgt, second = false) {
  const Y = m.Y, B = m.B, G = m.G, fx = Y.fx, T = TUNE.blizzard, wind = second ? 0.6 : T.wind[ph(Y)];
  Y.busy = true;
  let aim = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z);
  const tl = fx.tele({ shape: 'cone', x: m.pos.x, z: m.pos.z, r: T.R, dir: aim, arc: T.arc, time: wind, hold: T.dur, color: COL.blizzard });
  m.mode.bossTelegraph?.(wind + T.dur);
  poseTo(m, { puff: 1, hX: -0.25, rX: -0.7, rZ: 0.95, lX: -0.7, lZ: -0.95, lean: -0.1, rate: 6 });
  sfx('yuki_inhale', m.pos);
  let blowing = false, tick = 0;
  const hit = new Set();
  B.run((dt, t) => {
    if (t < wind) {
      if (t < wind * 0.62) { const want = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z); aim += clamp(angleDiff(aim, want), -2.4 * dt, 2.4 * dt); tl.place(m.pos.x, m.pos.z, aim); }
      m.facing = dampAngle(m.facing, aim, 12, dt);
      if (fx.emit('yI', 30, dt)) { const q = mouthPos(m, _p), a = aim + rand(-1, 1), r = rand(1.2, 2); fx.p('n', FR.FLAKE, q.x + Math.sin(a) * r, q.y + rand(-0.4, 0.4), q.z + Math.cos(a) * r, { vx: -Math.sin(a) * r * 2.4, vy: 0, vz: -Math.cos(a) * r * 2.4, life: 0.4, size: 0.2, size1: 0.06, color: ICE.white, alpha: 0.3, alpha1: 1, spin: 4 }); }
      return true;
    }
    const s = t - wind;
    if (!blowing) { blowing = true; poseTo(m, { puff: 0, mouth: 1, hX: 0.16, rX: -1.35, rZ: 0.4, lX: -0.9, lZ: -0.7, lean: 0.14, hair: -0.25, rate: 9 }); sfx('yuki_blizzard', m.pos); G.engine.rig.shake(0.25); }
    m.facing = dampAngle(m.facing, aim, 12, dt);
    // the stream: flakes, streaks and puffs racing out along the cone
    const q = mouthPos(m, _p), n = fx.emit('yB', 110, dt), gy = m.pos.y;
    for (let i = 0, g = fx.emit('yBg', 45, dt); i < g; i++) { // snow rolling across the ground inside the cone
      const a = aim + rand(-T.arc, T.arc) * 0.85, r = rand(0.8, T.R * 0.8), x = m.pos.x + Math.sin(a) * r, z = m.pos.z + Math.cos(a) * r;
      fx.p('n', FR.PUFF, x, gy + rand(0.15, 0.7), z, { vx: Math.sin(a) * rand(6, 10), vy: rand(0, 0.6), vz: Math.cos(a) * rand(6, 10), life: 0.55, size: rand(0.5, 0.9), size1: 1.6, color: ICE.snow, alpha: 0.6, alpha1: 0, drag: 1.2, spin: 2 });
    }
    for (let i = 0; i < n; i++) {
      const a = aim + rand(-T.arc, T.arc) * 0.9, sp = rand(9, 15), vx = Math.sin(a) * sp, vz = Math.cos(a) * sp, vy = rand(-3.4, -0.8), k = i % 4;
      if (k === 0) fx.p('a', FR.STREAK, q.x, q.y, q.z, { vx, vy, vz, life: 0.55, size: 0.9, size1: 1.4, color: ICE.glow, alpha: 0.75, alpha1: 0, drag: 0.4, fn: alignFn, stretch: 0.3 });
      else if (k === 1) fx.p('n', FR.PUFF, q.x, q.y - 0.3, q.z, { vx: vx * 0.75, vy: vy * 0.5, vz: vz * 0.75, life: 0.7, size: 0.5, size1: 1.6, color: ICE.snow, alpha: 0.55, alpha1: 0, drag: 0.7, spin: 2 });
      else fx.p('n', k === 2 ? FR.FLAKE : FR.BLOSSOM, q.x, q.y, q.z, { vx, vy, vz, life: 0.62, size: 0.24, size1: 0.18, color: ICE.white, alpha: 1, alpha1: 0.2, drag: 0.5, spin: 9 });
    }
    // damage ticks, a chill and a shove for everyone in the cone
    tick -= dt;
    if (tick <= 0) {
      tick = T.tick; hit.clear();
      const P = G.player;
      if (P && !G.playerDead && inCone(m, aim, P.pos.x, P.pos.z, P.radius || 0.3)) {
        const r0 = m.mode.combat.hitPlayer(roll(m, T.dmg), { element: 'frost', level: m.level, src: m });
        if (r0) chill(m, 1.6, 0.45);
      }
      for (const e of m.mode.combat.entities) if (e.alive && e.team === 'ally' && e !== P && !e.untargetable && e.pos && inCone(m, aim, e.pos.x, e.pos.z, e.radius || 0.3)) m.mode.combat.hitAlly(e, roll(m, T.dmg * 0.8), { element: 'frost' });
    }
    { const P = G.player; if (P && !G.playerDead && !P.invuln) { const dx = P.pos.x - m.pos.x, dz = P.pos.z - m.pos.z, dd = Math.hypot(dx, dz); if (dd < T.R && Math.abs(angleDiff(aim, Math.atan2(dx, dz))) < T.arc + 0.1) pushPlayer(G, Math.sin(aim), Math.cos(aim), T.push * (1 - dd / T.R * 0.5)); } }
    if (s < T.dur) return true;
    poseTo(m, {});
    if (Y.phase > 1 && !second && !B.dead) { B.after(0.25, () => { if (!B.dead && m.alive) doBlizzard(m, G.player?.alive !== false ? G.player : tgt, true); }); Y.busy = true; return false; }
    rest(m, 1.1);
    return false;
  }, () => { if (m.model?.pose) { m.model.pose.puff = 0; m.model.pose.mouth = 0; } });
}

// ------------------------------------------------------------------ ICICLE RAIN
function doIcicles(m, tgt) {
  const Y = m.Y, B = m.B, G = m.G, fx = Y.fx, T = TUNE.icicles, W = m.world, n = (inHall(Y) ? ARENA_TUNE.icicleN : T.n)[ph(Y)];
  Y.busy = true;
  poseTo(m, { rX: -2.7, rZ: 0.25, hX: -0.22, lX: -0.35, lZ: -0.35, hover: 0.45, rate: 6 });
  sfx('yuki_cast', m.pos);
  const wind = Y.phase > 1 ? 0.5 : 0.62;
  m.mode.bossTelegraph?.(wind + 1.6);
  let cast = false;
  B.run((dt, t) => {
    m.faceTo(tgt.pos.x, tgt.pos.z, dt);
    if (fx.emit('yC', 40, dt)) { const f = m.facing, hx = m.pos.x + Math.cos(f) * 0.5, hz = m.pos.z - Math.sin(f) * 0.5, hy = m.pos.y + 3.2, a = rand(0, TAU), r = rand(0.4, 1); fx.p('a', t < wind ? FR.STAR : FR.GLINT, hx + Math.cos(a) * r, hy + rand(-0.3, 0.3), hz + Math.sin(a) * r, { vx: -Math.cos(a) * r * 2.5, vz: -Math.sin(a) * r * 2.5, life: 0.35, size: 0.34, size1: 0.06, color: ICE.glow, alpha: 0.4, alpha1: 1 }); }
    if (t < wind) return true;
    if (!cast) {
      cast = true;
      const px = tgt.pos.x, pz = tgt.pos.z, spots = [[px, pz]];
      for (let k = 0; k < 80 && spots.length < n; k++) {
        const far = spots.length > 5, a = rand(0, TAU), r = far ? rand(3.5, 6.5) : rand(1.9, 4.2), x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
        if (!openSpot(m, x, z, 0.3) || !inArena(Y, x, z, -1) || spots.some(q => (q[0] - x) ** 2 + (q[1] - z) ** 2 < 3.6)) continue;
        spots.push([x, z]);
      }
      const raw = roll(m, T.dmg);
      spots.forEach(([x, z], i) => icicleDrop(m, x, z, { r: T.r, time: (Y.phase > 1 ? 0.85 : 1.0) + i * (Y.phase > 1 ? 0.1 : 0.13), raw, color: COL.icicle, scale: 1.35, chillS: 1.5, chillA: 0.32, knock: 0.6 }));
      fx.twinkle(m.pos.x, m.pos.y + 3.2, m.pos.z, { n: 12, r: 0.8, frame: FR.GLINT, size: 0.6, life: 0.6 });
      poseTo(m, { rX: -1.9, rZ: 0.6, hX: 0.05, lX: -0.35, lZ: -0.35, rate: 8 });
    }
    if (t < wind + 0.5) return true;
    poseTo(m, {});
    rest(m, 0.9);
    return false;
  });
}

// ------------------------------------------------------------------ FROZEN FLOOR (glare-ice patches you slide on)
function doFloor(m, tgt) {
  const Y = m.Y, B = m.B, G = m.G, fx = Y.fx, T = TUNE.floor, n = (inHall(Y) ? ARENA_TUNE.floorN : T.n)[ph(Y)], A = Y.arena, wind = 0.95;
  Y.busy = true;
  poseTo(m, { spin: 9, rX: -0.4, rZ: 1.35, lX: -0.4, lZ: -1.35, hover: 0.2, hX: 0.1, rate: 6 });
  sfx('yuki_twirl', m.pos);
  // one patch just in front of Chewy (between him and her), the rest spread over the lake
  const spots = [];
  { const dx = m.pos.x - tgt.pos.x, dz = m.pos.z - tgt.pos.z, L = Math.hypot(dx, dz) || 1, r = rand(T.r[0], T.r[1]); spots.push([tgt.pos.x + dx / L * rand(0.4, 1.4), tgt.pos.z + dz / L * rand(0.4, 1.4), r]); }
  for (let k = 0; k < 60 && spots.length < n; k++) {
    const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * (A.r - 3), x = A.x + Math.cos(a) * rr, z = A.z + Math.sin(a) * rr, r = rand(T.r[0], T.r[1]);
    if (!openSpot(m, x, z, 0.5) || spots.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2] + r + 0.6)) continue;
    spots.push([x, z, r]);
  }
  for (const [x, z, r] of spots) fx.tele({ shape: 'circle', x, z, r, time: wind, color: COL.floor, hold: 0.1 });
  m.mode.bossTelegraph?.(wind + 0.2);
  let done = false;
  B.run((dt, t) => {
    if (fx.emit('yF', 50, dt)) { const q = spots[(Math.random() * spots.length) | 0], a = rand(0, TAU), rr = q[2] * rand(0.2, 1); fx.p('n', FR.FLAKE, q[0] + Math.cos(a) * rr, m.world.heightAt(q[0], q[1]) + rand(0.1, 0.6), q[1] + Math.sin(a) * rr, { vy: -0.6, life: 0.5, size: 0.2, size1: 0.06, color: ICE.pale, alpha: 0.2, alpha1: 1, spin: 5 }); }
    if (t < wind) return true;
    if (!done) {
      done = true;
      poseTo(m, { spin: 0, hover: 0.12, lean: 0.2, rX: -0.9, rZ: 0.5, lX: -0.9, lZ: -0.5, rate: 12 });
      sfx('yuki_freeze', m.pos); G.engine.rig.shake(0.3);
      const life = T.life[ph(Y)] * rand(0.92, 1.08);
      for (const [x, z, r] of spots) {
        freezePatch(m, x, z, r, life);
        if (G.dungeon === m.mode && hitCircle(m, x, z, r * 0.95, roll(m, 0.3), { element: 'frost', knock: 0.2 })) chill(m, 1, 0.35);
      }
      if (!Y.slide.told) { Y.slide.told = true; G.ui?.toast?.('Glare ice! You slide on the glazed patches.', { color: '#9fe6ff', icon: 'oni' }); }
    }
    if (t < wind + 0.4) return true;
    poseTo(m, {});
    rest(m, 0.8);
    return false;
  });
}
function freezePatch(m, x, z, r, life) {
  const Y = m.Y, fx = Y.fx, W = m.world, sh = fx.take('sheet', f => f.mkSheet()), rot = rand(0, TAU), gy = W.heightAt(x, z);
  const rec = { x, z, r, k: 0, t: 0, life, mesh: sh, end: false };
  Y.sheets.push(rec);
  fx.laySheet(sh, x, z, r * 0.2, rot); sh.material.opacity = 0;
  fx.shatter(x, gy + 0.2, z, { n: 10, r: r * 0.6, speed: 3 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; fx.p('n', FR.PUFF, x + Math.cos(a) * r, gy + 0.1, z + Math.sin(a) * r, { vx: Math.cos(a) * 1.2, vy: 0.4, vz: Math.sin(a) * 1.2, life: 0.8, size: 0.5, size1: 1.1, color: ICE.pale, alpha: 0.6, alpha1: 0 }); }
  fx.run((dt, t) => {
    rec.t = t;
    if (rec.end) rec.life = Math.min(rec.life, t + 0.6), rec.end = false;
    if (t < 0.35) fx.laySheet(sh, x, z, r * (0.2 + 0.8 * ease.outBack(t / 0.35)), rot); else if (rec.k < 1) { fx.laySheet(sh, x, z, r, rot); rec.k = 1; }
    const fade = Math.min(1, t / 0.25) * clamp((rec.life - t) / 0.8);
    sh.material.opacity = 0.9 * fade;
    if (fx.emit('yG', 5, dt) && fade > 0.5) { const a = rand(0, TAU), rr = r * Math.sqrt(Math.random()) * 0.9; fx.p('a', FR.GLINT, x + Math.cos(a) * rr, gy + 0.08, z + Math.sin(a) * rr, { life: 0.5, size: 0.05, size1: 0.5, color: ICE.white, alpha: 1, alpha1: 0, rot: 0.3 }); }
    return t < rec.life;
  }, () => { const i = Y.sheets.indexOf(rec); if (i >= 0) Y.sheets.splice(i, 1); fx.give('sheet', sh); });
}
// The slide: on glare ice the player's steps only get half the grip (Player.slowAmt) and a glide velocity that trails
// his own movement (0.6 s to pick up, 1.05 s to lose) carries him on (fed through Player.knock, so walls still stop him). Standing
// still you coast to a halt; turning, you drift wide. Steady walking keeps its normal speed.
function updateSheets(m, dt) {
  const Y = m.Y, G = m.G, P = G.player, sl = Y.slide;
  if (!P || dt <= 0) return;
  let on = false;
  if (!G.playerDead && !P.leap && !P.dash) for (const s of Y.sheets) if (s.k > 0 && (P.pos.x - s.x) ** 2 + (P.pos.z - s.z) ** 2 < (s.r * 0.95) ** 2) { on = true; break; }
  if (on && sl.was && Math.hypot(P.pos.x - sl.lx, P.pos.z - sl.lz) > 12 * dt + 0.4) { sl.was = false; sl.mx = sl.mz = 0; } // (a teleport, not a step)
  if (on) {
    if (sl.was) {
      const vx = (P.pos.x - sl.lx) / dt - sl.ax, vz = (P.pos.z - sl.lz) / dt - sl.az;
      const k = 1 - Math.exp(-dt / (vx * vx + vz * vz < sl.mx * sl.mx + sl.mz * sl.mz ? 1.05 : 0.6)); // (quick-ish to pick up speed, slow to lose it)
      sl.mx += (vx - sl.mx) * k; sl.mz += (vz - sl.mz) * k;
      const L = Math.hypot(sl.mx, sl.mz); if (L > 7) { sl.mx *= 7 / L; sl.mz *= 7 / L; }
    }
    if (!(P.slowT > 0.12) || (P.slowAmt || 0) < 0.5) P.slowAmt = 0.5;
    P.slowT = Math.max(P.slowT || 0, 0.12);
  } else { const k = Math.exp(-dt * 5); sl.mx *= k; sl.mz *= k; }
  const L = Math.hypot(sl.mx, sl.mz);
  sl.ax = 0; sl.az = 0;
  if (L > 0.15 && !G.playerDead) {
    pushPlayer(G, sl.mx, sl.mz, L); sl.ax = sl.mx; sl.az = sl.mz;
    if (on && L > 1.6 && Y.fx.emit('yS', 20, dt)) Y.fx.p('n', FR.FLAKE, P.pos.x + rand(-0.2, 0.2), P.pos.y + 0.08, P.pos.z + rand(-0.2, 0.2), { vx: -sl.mx * 0.3 + rand(-0.5, 0.5), vy: rand(0.6, 1.4), vz: -sl.mz * 0.3 + rand(-0.5, 0.5), life: 0.4, size: 0.16, size1: 0.05, color: ICE.white, alpha: 1, alpha1: 0, grav: 4 });
    if (on && L > 3) { sl.sfxT -= dt; if (sl.sfxT <= 0) { sl.sfxT = 0.7; sfx('yuki_slide', P.pos); } }
  }
  sl.was = on; sl.lx = P.pos.x; sl.lz = P.pos.z;
}

// ------------------------------------------------------------------ ICE MIRRORS
function doMirror(m, tgt) {
  const Y = m.Y, B = m.B, G = m.G, fx = Y.fx, T = TUNE.mirror, n = T.n[ph(Y)], W = m.world, mode = m.mode, Cb = mode.combat;
  const P = tgt, spots = [], base = rand(0, TAU);
  for (let i = 0; i < n; i++) for (let k = 0; k < 12; k++) {
    const a = base + i / n * TAU + (k ? rand(-0.45, 0.45) : 0), r = (inHall(Y) ? ARENA_TUNE.mirrorR : T.R) + (k ? rand(-1, 0.8) : 0), x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    if (openSpot(m, x, z, 0.8) && inArena(Y, x, z, 0.8) && !spots.some(q => Math.hypot(q.x - x, q.z - z) < 2.4)) { spots.push({ x, z, y: W.heightAt(x, z) }); break; }
  }
  if (spots.length < 2) { doIcicles(m, tgt); return; }
  Y.busy = true;
  poseTo(m, { spin: 11, rX: -0.3, rZ: 1.45, lX: -0.3, lZ: -1.45, hover: 0.5, hX: -0.1, rate: 6 });
  sfx('yuki_mirror', m.pos);
  m.mode.bossTelegraph?.(2.3);
  const mirrors = spots.map(s => { const o = fx.take('mirror', f => f.mkMirror()); o.position.set(s.x, s.y, s.z); o.rotation.set(0, Math.atan2(P.pos.x - s.x, P.pos.z - s.z), 0); o.scale.set(1, 0.01, 1); fx.tele({ shape: 'circle', x: s.x, z: s.z, r: 1.1, time: 0.9, color: COL.mirror, hold: 0.05 }); return o; });
  let phase = 0; const figs = [];
  B.run((dt, t) => {
    for (const o of mirrors) if (o.visible) { const k = clamp(t / 0.5); o.scale.set(1, Math.max(0.01, ease.outBack(k)), 1); o.userData.pane.material.uniforms.uK.value = k; }
    if (phase === 0 && t > 0.7) { // she dissolves into snow
      phase = 1; hideBoss(m, true);
      fx.burst(m.pos.x, m.pos.y + 1.4, m.pos.z, { frame: FR.FLAKE, n: 22, colors: PAL_SNOW, speed: 4, up: 2, size: 0.3, grav: 0.5, drag: 1.5, life: 1 });
      fx.puffs(m.pos.x, m.pos.y + 0.8, m.pos.z, { n: 8, size: 0.8, speed: 1.5, up: 1, life: 0.9, alpha: 0.7 });
      sfx('yuki_vanish', m.pos);
    }
    if (phase === 1 && t > 0.95) { // …and steps out of one mirror; glass copies of her out of the others
      phase = 2;
      const real = (Math.random() * spots.length) | 0, lvl = mode.layout?.mlvl ?? m.level;
      spots.forEach((s, i) => {
        const face = Math.atan2(P.pos.x - s.x, P.pos.z - s.z);
        if (i === real) { m.pos.set(s.x, s.y, s.z); m.facing = face; hideBoss(m, false); figs.push(m); }
        else {
          const c = new m.constructor(mode, 'yukiMirror', { level: lvl, x: s.x, z: s.z });
          c.aggro = true; c.bossAdd = true; c.facing = face; c.boss = m; c.shadow.material = m.shadow.material; c.height = m.height;
          mode.monsters.push(c); Cb.add(c); Y.clones.push({ c, t: 0, life: T.life, warned: false }); figs.push(c);
        }
        fx.shatter(s.x, s.y + 1.6, s.z, { n: 14, r: 0.6, speed: 4 });
        fx.burst(s.x, s.y + 1.6, s.z, { frame: FR.MIRROR, n: 10, colors: PAL_ICE, speed: 5, up: 3, size: 0.36, grav: 9, drag: 1, life: 0.8 });
      });
      for (const o of mirrors) fx.give('mirror', o);
      mirrors.length = 0;
      sfx('yuki_mirror_shatter', m.pos);
      for (const f of figs) poseTo(f, { rX: -1.5, rZ: 0.2, hX: -0.05 });
    }
    if (phase === 2 && t > 1.05) { // every figure takes aim: lanes onto Chewy
      phase = 3;
      for (const f of figs) {
        if (!f.alive) continue;
        const dx = P.pos.x - f.pos.x, dz = P.pos.z - f.pos.z, L = Math.hypot(dx, dz) || 1;
        f._aim = { dx: dx / L, dz: dz / L, len: Math.min(L + 2, 11) };
        f.facing = Math.atan2(dx, dz);
        fx.tele({ shape: 'lane', x: f.pos.x + f._aim.dx * 0.5, z: f.pos.z + f._aim.dz * 0.5, r: 0.36, dir: f.facing, len: f._aim.len, time: 1.05, color: COL.dart, hold: 0.05 });
      }
      sfx('yuki_aim', m.pos);
    }
    if (phase === 3 && t > 2.1) { // ice darts
      phase = 4;
      for (const f of figs) {
        if (!f.alive || !f._aim) continue;
        const A = f._aim, real = f === m;
        bolt(f, { look: DART_LOOK, from: { x: f.pos.x + A.dx * 0.6, z: f.pos.z + A.dz * 0.6 }, dir: { x: A.dx, z: A.dz }, speed: 17, range: A.len, radius: 0.34, h: 1.35, onHit: e => {
          if (e === G.player) { if (m.mode.combat.hitPlayer(roll(m, real ? 0.7 : 0.45), { element: 'frost', level: m.level, from: f.pos, knock: 0.5, src: m })) chill(m, 1.2, 0.35); }
          else m.mode.combat.hitAlly(e, roll(m, 0.4), { element: 'frost' });
        } });
        poseTo(f, { rX: -0.6, rZ: 0.35, lean: 0.12, hX: 0.1, rate: 12 });
      }
      sfx('yuki_dart', m.pos);
    }
    if (phase === 4 && t > 2.35) { rest(m, 2.1); return false; }
    return true;
  }, () => { for (const o of mirrors) fx.give('mirror', o); if (Y.hidden && !B.dead) hideBoss(m, false); });
}
function hideBoss(m, hide) {
  const Y = m.Y, Cb = m.mode.combat;
  Y.hidden = hide; m.model.root.visible = !hide; m.shadow.visible = !hide; m.untargetable = hide;
  if (hide) Cb.remove(m); else if (m.alive && m.G.dungeon === m.mode) Cb.add(m);
}
const DART_LOOK = {
  start(G, s) {
    const fx = frostFx(G), o = fx.take('dart', f => f.mkDart());
    o.position.set(s.x, s.y, s.z); o.rotation.set(0, Math.atan2(s.dx, s.dz), 0); o.scale.setScalar(1.3);
    return {
      update(dt) { o.position.set(s.x, s.y, s.z); o.rotation.set(0, Math.atan2(s.dx, s.dz), 0); if (fx.emit('yD', 45, dt)) fx.p('a', FR.STAR, s.x, s.y, s.z, { life: 0.3, size: 0.3, size1: 0.05, color: ICE.glow, alpha: 0.9, alpha1: 0 }); },
      end(s2, hit) { fx.give('dart', o); fx.shatter(s.x, s.y, s.z, { n: hit ? 10 : 6, r: 0.1, speed: 3, size: 0.24 }); if (hit) sfx('tsurara_shatter', o.position); },
    };
  },
};
function updateClones(m, dt) {
  const Y = m.Y, fx = Y.fx;
  for (let i = Y.clones.length - 1; i >= 0; i--) {
    const q = Y.clones[i], c = q.c;
    if (!c.alive || c.shattered) { Y.clones.splice(i, 1); continue; }
    q.t += dt;
    if (!q.warned && q.t > q.life - 0.75) { q.warned = true; fx.tele({ shape: 'circle', x: c.pos.x, z: c.pos.z, r: 1.7, time: 0.75, color: COL.burst }); poseTo(c, { rZ: 1.2, lZ: -1.2, rX: -0.4, lX: -0.4, hX: -0.15, spin: 4 }); }
    if (q.t >= q.life) { shatterClone(c, false); Y.clones.splice(i, 1); }
  }
}
/** a glass copy breaks: struck (a puff of chill, no damage) or at the end of its time (a small frost burst) */
function shatterClone(c, struck) {
  if (c.shattered || !c.alive) return;
  c.shattered = true;
  const b = c.boss, G = c.G, fx = frostFx(G), x = c.pos.x, y = c.pos.y, z = c.pos.z;
  fx.shatter(x, y + 1.5, z, { n: 18, r: 0.6, speed: 5, size: 0.34 });
  fx.burst(x, y + 1.5, z, { frame: FR.MIRROR, n: 12, colors: PAL_ICE, speed: 5.5, up: 3.5, size: 0.4, grav: 9, drag: 1, life: 0.9 });
  fx.p('a', FR.RING, x, y + 0.12, z, { life: 0.35, size: 0.4, size1: 4, color: ICE.lilac, alpha: 0.9, alpha1: 0, rot: 0 });
  sfx('yuki_mirror_shatter', c.pos, { vol: 0.8 });
  if (b && b.alive && G.dungeon === c.mode) {
    if (struck) { if (playerIn(G, x, z, 1.9)) chill(b, 1.2, 0.3); }
    else if (hitCircle(b, x, z, 1.7, roll(b, 0.35), { element: 'frost', knock: 0.5 })) chill(b, 1.4, 0.35);
  }
  c.vanish(0);
  // its own materials go once Monster.dispose has freed its geometry (the kimono texture and the ring stay: shared)
  fx.after(0.7, () => c.model.root.traverse(o => { if (o.isMesh) o.material?.dispose?.(); }));
}
function mirrorUpdate(c, dt) {
  const P = c.G.player;
  if (P && !c.shattered) c.facing = dampAngle(c.facing, Math.atan2(P.pos.x - c.pos.x, P.pos.z - c.pos.z), 4, dt);
  c.anim.lunge = 0; c.anim.wind = 0;
  if (Math.random() < dt * 4) frostFx(c.G).p('a', FR.GLINT, c.pos.x + rand(-0.5, 0.5), c.pos.y + rand(0.4, 2.6), c.pos.z + rand(-0.5, 0.5), { life: 0.5, size: 0.05, size1: 0.45, color: ICE.lilac, alpha: 1, alpha1: 0 });
}

// ------------------------------------------------------------------ her snow children (70%)
function callChildren(m) {
  const Y = m.Y, G = m.G, fx = Y.fx, A = Y.arena;
  Y.summoned++;
  let adds;
  if (inHall(Y)) { // a wave from ARENA_TUNE, spawned between her and the hall's middle (never out by the rim or in the mouth)
    const cx = A.x + (m.pos.x - A.x) * 0.55, cz = A.z + (m.pos.z - A.z) * 0.55, wave = ARENA_TUNE.waves[Y.summoned - 1] || ARENA_TUNE.waves[0], cnt = {};
    for (const id of wave) cnt[id] = (cnt[id] || 0) + 1;
    adds = [];
    for (const [id, k] of Object.entries(cnt)) adds.push(...summonAt(m, pickId([id], 'mochi'), k, cx, cz, 2.0, 4.5)); // (≤ 0.55 (r − 2.2) + 4.5 m from the middle: inside the ring)
  } else adds = summonAt(m, pickId(['yukiwarashi'], 'mochi'), 2, m.pos.x, m.pos.z, 2.2, 4.2);
  for (const a of adds) { fx.puffs(a.pos.x, a.pos.y + 0.3, a.pos.z, { n: 10, size: 0.6, speed: 2, up: 1.4 }); fx.burst(a.pos.x, a.pos.y + 0.6, a.pos.z, { frame: FR.FLAKE, n: 10, colors: PAL_SNOW, speed: 3, up: 3, size: 0.26, grav: 2, life: 1 }); }
  G.ui?.toast?.(Y.summoned > 1 ? 'Yuki-onna calls the whole hall to her side!' : 'Yuki-onna calls her snow children!', { color: '#bfe6ff', icon: 'oni' });
  sfx('yuki_call', m.pos); m.emote('!', 1.2);
  Y.busy = true; poseTo(m, { rX: -1.6, rZ: 0.9, lX: -1.6, lZ: -0.9, hX: -0.15 });
  m.B.after(0.9, () => { poseTo(m, {}); rest(m, 0.6); });
}

// ------------------------------------------------------------------ PHASE 2: the whiteout
function startStorm(m) {
  const Y = m.Y, B = m.B, G = m.G, fx = Y.fx;
  Y.phase = 2; m.enraged = true; Y.busy = true;
  poseTo(m, { hover: 1.3, rX: -0.3, rZ: 2.1, lX: -0.3, lZ: -2.1, hX: -0.3, spin: 7, hair: -0.3, rate: 4 });
  sfx('yuki_whiteout', m.pos); G.engine.rig.shake(0.5);
  G.ui?.toast?.('A whiteout! Keep to the lanterns\' warmth.', { color: '#ffd8a0', icon: 'oni' });
  m.emote('anger', 1.4);
  B.run((dt, t) => {
    const n = fx.emit('yW', 90, dt);
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), r = rand(0.5, 3); fx.p('n', i % 3 ? FR.FLAKE : FR.PUFF, m.pos.x + Math.cos(a) * r, m.pos.y + rand(0.2, 3.5), m.pos.z + Math.sin(a) * r, { vx: -Math.sin(a) * 7, vy: rand(0.5, 2), vz: Math.cos(a) * 7, life: 0.9, size: i % 3 ? 0.3 : 0.9, size1: i % 3 ? 0.1 : 2, color: ICE.snow, alpha: 0.9, alpha1: 0, drag: 0.8, spin: 5 }); }
    if (t > 0.6 && !Y.s1) { Y.s1 = true; fx.p('a', FR.RING, m.pos.x, m.pos.y + 0.2, m.pos.z, { life: 0.9, size: 1, size1: 24, color: ICE.glow, alpha: 1, alpha1: 0, rot: 0 }); setWhiteout(m, true); }
    if (t < 2.2) return true;
    poseTo(m, {}); rest(m, 0.5); Y.cds.icicles = Math.min(Y.cds.icicles, 0.6);
    return false;
  });
}
function setWhiteout(m, on) {
  const Y = m.Y, wo = Y.wo, W = m.world, sc = W.scene;
  wo.on = on; wo.cycleT = on ? TUNE.whiteout.on : TUNE.whiteout.off;
  if (on && !wo.saved) { // take over the fog / background (restored when the wave passes, on death, on leaving)
    wo.saved = true; W.moodHold = true;
    Y.offMode ||= Events.on('mode:changed', () => restoreMood(m)); // (leaving mid-whiteout: hand the fog back)
    if (sc.fog) { wo.save.near = sc.fog.near; wo.save.far = sc.fog.far; wo.save.color.copy(sc.fog.color); }
    if (sc.background?.isColor) wo.save.bg.copy(sc.background);
    for (const l of Y.lanterns) wo.lights.push(W.lightPool?.addSource({ pos: V(l.x, l.top + 0.2, l.z), color: C('#ffc070'), intensity: 0, radius: 5.5, priority: 7 }));
    for (const s of wo.glows) s.visible = true;
    for (const s of wo.spirits) s.visible = true;
    wo.mesh.visible = true;
  }
  if (on) sfx('yuki_wind', m.pos);
}
const WO_FOG = C('#e2eaf6');
const WB = { rx: 1, rz: 0, fx: 0, fz: 1 }; // camera ground axes for the overlay ellipses
/** write one clear ellipse (a ground circle of radius R at x, y, z projected to NDC) into the overlay → next slot */
function woPool(U, slot, cam, x, y, z, R, warm) {
  const E = U.uPool.value[slot];
  if (!E) return slot;
  const c = _p.set(x, y, z).project(cam);
  if (c.z > 1 || Math.abs(c.x) > 2.5 || Math.abs(c.y) > 2.5) { E.set(0, 0, 0, 0); U.uWarm.value[slot] = 0; return slot + 1; }
  const cx = c.x, cy = c.y;
  const a = _q.set(x + WB.rx * R, y, z + WB.rz * R).project(cam), ex = Math.abs(a.x - cx);
  const b = _w.set(x + WB.fx * R, y, z + WB.fz * R).project(cam), ey = Math.abs(b.y - cy);
  E.set(cx, cy, Math.max(0.01, ex), Math.max(0.01, ey)); U.uWarm.value[slot] = warm;
  return slot + 1;
}
function updateWhiteout(m, dt) {
  const Y = m.Y, wo = Y.wo, G = m.G;
  if (!wo.saved) return;
  if (Y.phase > 1 && m.alive) { wo.cycleT -= dt; if (wo.cycleT <= 0) setWhiteout(m, !wo.on); }
  wo.k = wo.on ? Math.min(1, wo.k + dt * 0.55) : Math.max(0, wo.k - dt * 0.75);
  if (!wo.on && wo.k <= 0) { restoreMood(m); return; }
  const k = ease.inOutQuad(wo.k), W = m.world, sc = W.scene, cam = G.engine.camera, P = G.player;
  // fog pulled in just behind Chewy (the haze overlay does the close-up whiteout), background to snow
  const camD = cam.position.distanceTo(G.engine.rig.target || P.pos);
  const fk = inHall(Y) ? ARENA_TUNE.woFog : 1; // (down in the hall the fog reaches only part way to snow-white: the cave stays a cave)
  if (sc.fog) { sc.fog.near = lerp(wo.save.near, camD + 3, k); sc.fog.far = lerp(wo.save.far, camD + 24, k); sc.fog.color.copy(wo.save.color).lerp(WO_FOG, k * fk); }
  if (sc.background?.isColor) sc.background.copy(wo.save.bg).lerp(WO_FOG, k * fk);
  // overlay: Chewy's small clear circle, the lanterns' big warm ones (screen-space ellipses of ground circles)
  const U = wo.mesh.material.uniforms; U.uA.value = (inHall(Y) ? ARENA_TUNE.woA : 0.82) * k; U.uT.value = m.B.t; U.uAsp.value = cam.aspect;
  cam.matrixWorld.extractBasis(_cr, _cu, _cf);
  const rx = _cr.x, rz = _cr.z, rl = Math.hypot(rx, rz) || 1, fx = -_cf.x, fz = -_cf.z, fl = Math.hypot(fx, fz) || 1;
  WB.rx = rx / rl; WB.rz = rz / rl; WB.fx = fx / fl; WB.fz = fz / fl;
  let slot = 0;
  if (P) slot = woPool(U, slot, cam, P.pos.x, P.pos.y, P.pos.z, 3.8, 0);
  for (const l of Y.lanterns) slot = woPool(U, slot, cam, l.x, l.y, l.z, 4.4, 1);
  for (const n = U.uPool.value.length; slot < n; slot++) { U.uPool.value[slot].set(0, 0, 0, 0); U.uWarm.value[slot] = 0; }
  // lanterns flare warm (lights + glows over the haze); spirit lanterns rise out of the snow
  for (let i = 0; i < Y.lanterns.length; i++) {
    const l = Y.lanterns[i], L = wo.lights[i]; if (L) L.intensity = 6 * k;
    const s = l.spirit ? wo.spirits[i] : null; // (spirit lanterns are all-or-none, in lantern order)
    if (s) { s.position.set(l.x, l.y + lerp(-2, 1.4 + Math.sin(m.B.t * 1.4 + i) * 0.12, ease.outCubic(k)), l.z); s.rotation.y += dt * 0.4; }
  }
  if (wo.gm) wo.gm.opacity = 0.85 * k;
  // wind-driven snow across the view
  const f = Y.fx, tx = G.engine.rig.target?.x ?? P.pos.x, tz = G.engine.rig.target?.z ?? P.pos.z, n = f.emit('yWs', 70 * k, dt);
  for (let i = 0; i < n; i++) f.p(i % 2 ? 'a' : 'n', i % 2 ? FR.STREAK : FR.FLAKE, tx + rand(-14, 10), (P?.pos.y || 0) + rand(0.3, 5), tz + rand(-10, 10), { vx: rand(9, 13), vy: rand(-2, -0.5), vz: rand(2, 4), life: 1.1, size: i % 2 ? 1.2 : 0.2, size1: i % 2 ? 1.6 : 0.14, color: ICE.white, alpha: 0.75 * k, alpha1: 0, fn: i % 2 ? alignFn : null, spin: 4 });
  // frostbite away from the lanterns' warmth
  if (P && !G.playerDead && wo.on && wo.k > 0.6 && m.alive) {
    let warm = false; for (const l of Y.lanterns) if ((P.pos.x - l.x) ** 2 + (P.pos.z - l.z) ** 2 < 3.6 * 3.6) { warm = true; break; }
    wo.biteT -= dt;
    if (wo.biteT <= 0) {
      wo.biteT = warm ? 0.5 : 1.0;
      if (warm) f.twinkle(P.pos.x, P.pos.y + 0.3, P.pos.z, { n: 3, color: ICE.warm, r: 0.4, size: 0.3, life: 0.6, rise: 1 });
      else {
        if (!wo.bitTold) { wo.bitTold = true; G.ui?.float?.(V(P.pos.x, P.pos.y + 1.9, P.pos.z), 'Frostbite!', { kind: 'status', color: '#9fe0ff' }); }
        if (m.mode.combat.hitPlayer(roll(m, 0.1), { element: 'frost', level: m.level, src: m })) chill(m, 1.2, 0.25);
        sfx('yuki_frostbite', P.pos);
      }
    }
  }
}
function restoreMood(m) {
  const Y = m.Y; if (!Y) return;
  const wo = Y.wo, W = m.world, sc = W?.scene;
  Y.offMode?.(); Y.offMode = null;
  if (!wo.saved) return;
  wo.saved = false; wo.on = false; wo.k = 0;
  if (sc?.fog) { sc.fog.near = wo.save.near; sc.fog.far = wo.save.far; sc.fog.color.copy(wo.save.color); }
  if (sc?.background?.isColor) sc.background.copy(wo.save.bg);
  if (W) W.moodHold = false;
  for (const L of wo.lights) if (L) W.lightPool?.removeSource(L);
  wo.lights.length = 0;
  for (const s of wo.glows) s.visible = false;
  for (const s of wo.spirits) s.visible = false;
  if (wo.mesh) wo.mesh.visible = false;
  if (wo.gm) wo.gm.opacity = 0;
}

// ================================================================== the end
function onDeath(m) {
  const Y = m.Y, B = m.B; if (!Y || B.dead) return;
  B.dead = true; B.clear();
  const G = m.G, fx = Y.fx;
  if (Y.hidden) hideBoss(m, false);
  m.model.root.visible = true; m.shadow.visible = true;
  restoreMood(m);
  if (Y.light) { m.world.lightPool?.removeSource(Y.light); Y.light = null; }
  for (const s of Y.sheets) s.end = true;
  for (const q of Y.clones) shatterClone(q.c, true);
  Y.clones.length = 0;
  const x = m.pos.x, y = m.pos.y, z = m.pos.z;
  // she melts into a flurry of snowflakes spiralling up
  fx.burst(x, y + 1.5, z, { frame: FR.FLAKE, n: 36, colors: PAL_SNOW, speed: 5, up: 4, size: 0.36, grav: -0.6, drag: 1.4, life: 2.2 });
  fx.burst(x, y + 1.5, z, { frame: FR.BLOSSOM, n: 18, colors: PAL_SNOW, speed: 3, up: 5, size: 0.34, grav: -0.8, drag: 1.2, life: 2.4 });
  fx.twinkle(x, y + 1.4, z, { n: 20, r: 1.2, frame: FR.GLINT, size: 0.7, life: 1.2, rise: 2 });
  sfx('yuki_defeat', m.pos);
}

// ================================================================== definitions
const hurtT = { t: -9 };
export const MONSTERS = {
  yukiOnna: {
    adds: ['yukiMirror', 'yukiwarashi', 'tsurara'], // (her glass copies and her children: dungeon/zoneRun.js warms them with the floor)
    name: 'Yuki-onna', build: 'yukiOnna', boss: true, subtitle: 'The Frost Princess breathes, and the world turns to snow.',
    scale: S, radius: 0.72, vr: 0.82, speed: 2.4, life: 1, dmg: 1, move: 'none', element: 'frost',
    stats: { name: 'Yuki-onna', life: 1.0, dmg: 1.0, def: 1.0, speed: 1.05, xp: 1.5, element: 'frost', res: { frost: 60, fire: -20, holy: 10 } },
    material: 'silk',
    attack: { type: 'ranged', range: 9, cd: 3, windup: 1 }, // (read by generic code paths only; the fight is scripted above)
    variants: [{}],
    ai, update, onSpawn, onDeath,
    /** idempotent: the fight runs its own intro on first aggro (a caller may also trigger it) */
    intro(m) { if (m.Y?.st === 'dormant') startIntro(m); },
    damageTaken: (m, dmg) => { if (m.Y?.hidden) return 0; const t = m.G.engine.time || 0; if (t - hurtT.t > 0.8) { hurtT.t = t; sfx('yuki_hurt', m.pos); } return dmg; },
    // test hooks (?test=regionMonsters&id=yukiOnna&fight=1; window.mons[0].def.debug.blizzard(mons[0]))
    debug: {
      blizzard: m => { m.Y.busy = false; doBlizzard(m, m.G.player); },
      icicles: m => { m.Y.busy = false; doIcicles(m, m.G.player); },
      floor: m => { m.Y.busy = false; doFloor(m, m.G.player); },
      mirror: m => { m.Y.busy = false; doMirror(m, m.G.player); },
      phase2: m => { m.life = Math.min(m.life, m.lifeMax * 0.49); m.Y.summoned = 1; m.Y.busy = false; startStorm(m); },
      whiteout: (m, on = true) => setWhiteout(m, on),
      state: m => ({ st: m.Y.st, phase: m.Y.phase, busy: m.Y.busy, hidden: m.Y.hidden, sheets: m.Y.sheets.length, clones: m.Y.clones.length, wo: { on: m.Y.wo.on, k: +m.Y.wo.k.toFixed(2) }, slide: +Math.hypot(m.Y.slide.mx, m.Y.slide.mz).toFixed(2), life: Math.round(m.life), lifeMax: m.lifeMax }),
    },
  },
  yukiMirror: {
    name: 'Yuki-onna', build: 'yukiMirror', scale: S, radius: 0.72, vr: 0.82, speed: 0.1, move: 'none', pack: 1, material: 'crystal',
    stats: { name: 'Ice Mirror', life: 0.2, dmg: 0.5, def: 0.2, speed: 0.1, xp: 0.01, element: 'frost', res: {} },
    attack: { type: 'melee', range: 1, cd: 99, windup: 1 },
    variants: [{}],
    ai: () => false,
    update: mirrorUpdate,
    damageTaken: (c) => { shatterClone(c, true); return 0; },
  },
};
