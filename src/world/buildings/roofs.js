// Japanese roofs: concave slopes, upturned eaves, kawara tile ribs + courses, thick painted eave edges,
// ridge caps with onigawara end tiles, hip ridges, irimoya (hip-and-gable) and round / polygonal roofs.
import * as THREE from 'three';
import { clamp, lerp, Noise } from '../../core/util.js';
import { tube, puff } from '../../gfx/geom.js';
import { G, V, C, col, shade, mixc, PI } from './kit.js';

const _noise = new Noise(913);
const prof = (t, c) => (1 - c) * t + c * t * t;
const ribShape = ph => { const f = ph - Math.floor(ph); return Math.pow(Math.sin(f * PI), 0.6); };
// integer hash → 0..1 (per-tile colour variety, lichen spots)
const hash3 = (a, b, c) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const LICHEN = [new THREE.Color('#c8cca0'), new THREE.Color('#d6ceb0'), new THREE.Color('#b4c49c')];
const _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();

// Build a geometry from positions/colours/indices
function mkGeo(pos, cols, idx, smooth = true) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  if (idx) g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Band (edge strip) between two polylines, triangles oriented to face `out`
function band(top, bot, colr, out) {
  const pos = [], cols = [];
  const c = col(colr), cDark = c.clone().multiplyScalar(0.82);
  const push = (p, cc) => { pos.push(p.x, p.y, p.z); cols.push(cc.r, cc.g, cc.b); };
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < top.length - 1; i++) {
    const A = top[i], Bp = bot[i], Cc = bot[i + 1], D = top[i + 1];
    for (const tri of [[A, Bp, Cc], [A, Cc, D]]) {
      e1.subVectors(tri[1], tri[0]); e2.subVectors(tri[2], tri[0]); n.crossVectors(e1, e2);
      const ord = n.dot(out) >= 0 ? tri : [tri[0], tri[2], tri[1]];
      for (const p of ord) push(p, p === Bp || p === Cc ? cDark : c);
    }
  }
  return mkGeo(pos, cols, null);
}

/**
 * roof(B, opts) — Japanese roof over a w×d wall block centred at the origin, wall top at y0.
 *  type: 'hip' | 'gable' | 'irimoya' | 'shed'      ridge runs along the longer axis (gable: along x unless ridge:'z')
 *  over (eave overhang), gOver (gable-end overhang), H (rise), curve (concavity), lift (corner upturn), thick
 *  color, edge (tile-end band), under (soffit), cap (ridge tiles), ribW (0 = smooth), ribAmp, course, courseAmp
 *  tg (irimoya split 0..1), oni (onigawara), finial, moss (0..1), gable ('plaster'|'wood'|'ornate'), vent (round window in gable)
 *  gableColor (plaster gable fill), gableWood (wood gable fill), timber (the gable's beam / post / vent frame)
 * returns { ridgeY, yb, H, A, Bz, yAt(x,z) } in the caller's frame
 */
export function roof(B, o) {
  const type = o.type || 'hip';
  const rotate = (type === 'gable' || type === 'shed') ? o.ridge === 'z' : o.d > o.w + 1e-3;
  if (rotate) {
    B.push([0, 0, 0], PI / 2);
    const info = roofCore(B, { ...o, w: o.d, d: o.w });
    B.pop();
    const yAt = info.yAt, underAt = info.underAt;
    return { ...info, yAt: (x, z) => yAt(-z, x), underAt: underAt && ((x, z) => underAt(-z, x)) };
  }
  return roofCore(B, o);
}

// underside height of the eave at (x, z) including the corner upturn (for hanging charms / rain chains)
function addUnderAt(out, R, type, o, A, Bz) {
  const X = o.w / 2 + (o.gOver ?? 0.35);
  const liftAt = (dc, t, eL) => { const W = Math.min(R.liftW, eL * 0.28); return R.lift * Math.exp(-(dc * dc) / (W * W)) * (1 - t) * (1 - t); };
  const tOf = (x, z) => (type === 'gable' ? clamp((Bz - Math.abs(z)) / Bz) : type === 'shed' ? clamp((Bz - z) / (2 * Bz)) : clamp(Math.min(A - Math.abs(x), Bz - Math.abs(z)) / Bz));
  out.underAt = (x, z) => {
    const t = tOf(x, z);
    let dc, eL;
    if (type === 'gable' || type === 'shed') { dc = X - Math.abs(x); eL = 2 * X; } else if (A - Math.abs(x) < Bz - Math.abs(z)) { dc = Bz - Math.abs(z); eL = 2 * Bz; } else { dc = A - Math.abs(x); eL = 2 * A; }
    return out.yAt(x, z) + liftAt(Math.max(0, dc), t, eL) - R.thick;
  };
}

function roofCore(B, o) {
  const type = o.type || 'hip';
  const over = o.over ?? 0.5, gOver = o.gOver ?? 0.35;
  const A = o.w / 2 + over, Bz = o.d / 2 + over;
  const R = {
    H: o.H ?? Bz * 0.62, curve: o.curve ?? 0.4, lift: o.lift ?? 0.26, liftW: o.liftW ?? 1.0, thick: o.thick ?? 0.16,
    ribW: o.ribW ?? 0.3, ribAmp: o.ribAmp ?? 0.045, course: o.course ?? 0.34, courseAmp: o.courseAmp ?? 0.035,
    color: col(o.color || '#5d6f9e').lerp(col('#f6eef4'), o.pastel ?? 0.12), edge: o.edge || mixc(o.color || '#5d6f9e', '#fff6ea', 0.42), under: o.under || '#9a6a52',
    moss: o.moss ?? 0, mossCol: col(o.mossColor || '#7cae5a'),
  };
  R.k = o.k ?? clamp((o.d / 2 + over) / 1.35, 0.22, 1.25); // ornament scale
  // trim: rich = 0 humble .. 2 rich (defaults to the model's), seed for per-tile variety,
  // ends = round tile-end discs (nokigawara) along the eaves, lichen = pale spots on a few tiles
  R.rich = o.rich ?? B.richness; R.seed = (B.seed * 31 + (o.seedOff ?? 0) + Math.round(o.w * 97 + o.d * 13)) | 0;
  R.ends = o.ends ?? (R.ribW >= 0.19 && R.k >= 0.3);
  R.lichen = o.lichen ?? (R.rich === 0 ? 0.06 : R.rich === 1 ? 0.03 : 0.01);
  R.mossClumps = o.mossClumps ?? (R.moss >= 0.2 && R.rich < 2 && R.k >= 0.45 ? (R.rich === 0 ? 2 : 1) : 0);
  R.oniRich = o.oniRich ?? R.rich;
  if (type === 'shed') R.H = o.H ?? Bz * 0.5;
  const tw = over / (type === 'shed' ? 2 * Bz : Bz);
  R.yb = o.y0 - R.H * prof(tw, R.curve) + R.thick;
  const capCol = o.cap || mixc(shade(o.color || '#5d6f9e', 0.78), '#f6eef4', 0.1);
  const out = { yb: R.yb, H: R.H, A, Bz, ridgeY: R.yb + R.H, thick: R.thick };

  if (type === 'hip') {
    const hipAll = { c0: true, c1: true, eave: true, hip1: true };
    const fs = [
      { E0: [-A, Bz], E1: [A, Bz], R0: [-(A - Bz), 0], R1: [A - Bz, 0], d0: [-1, 1], d1: [1, 1] },
      { E0: [A, Bz], E1: [A, -Bz], R0: [A - Bz, 0], R1: [A - Bz, 0], d0: [1, 1], d1: [1, -1] },
      { E0: [A, -Bz], E1: [-A, -Bz], R0: [A - Bz, 0], R1: [-(A - Bz), 0], d0: [1, -1], d1: [-1, -1] },
      { E0: [-A, -Bz], E1: [-A, Bz], R0: [-(A - Bz), 0], R1: [-(A - Bz), 0], d0: [-1, -1], d1: [-1, 1] },
    ];
    fs.forEach((f, i) => { if (!o.skip?.includes('frbl'[i])) face(B, R, { ...hipAll, ...f, t0: 0, t1: 1 }); });
    const L = A - Bz;
    if (L > 0.3 * R.k) ridge(B, R, -L, L, R.yb + R.H, capCol, o.oni !== false, o);
    else finial(B, R.yb + R.H, capCol, o.finial, R.k);
    out.yAt = (x, z) => R.yb + R.H * prof(clamp(Math.min(A - Math.abs(x), Bz - Math.abs(z)) / Bz), R.curve);
  } else if (type === 'gable') {
    const X = o.w / 2 + gOver;
    face(B, R, { E0: [-X, Bz], E1: [X, Bz], R0: [-X, 0], R1: [X, 0], t0: 0, t1: 1, c0: true, c1: true, d0: [-1, 0.4], d1: [1, 0.4], eave: true, open0: true, open1: true, barge: true });
    face(B, R, { E0: [X, -Bz], E1: [-X, -Bz], R0: [X, 0], R1: [-X, 0], t0: 0, t1: 1, c0: true, c1: true, d0: [1, -0.4], d1: [-1, -0.4], eave: true, open0: true, open1: true, barge: true });
    for (const sx of [-1, 1]) gableTri(B, R, o, sx * o.w / 2, sx, 0, Bz, o.y0);
    ridge(B, R, -X - 0.05, X + 0.05, R.yb + R.H, capCol, o.oni !== false, o);
    out.yAt = (x, z) => R.yb + R.H * prof(clamp((Bz - Math.abs(z)) / Bz), R.curve);
  } else if (type === 'irimoya') {
    const tg = o.tg ?? 0.5;
    const xg = A - Bz * tg;
    const fs = [
      { E0: [-A, Bz], E1: [A, Bz], R0: [-(A - Bz), 0], R1: [A - Bz, 0], d0: [-1, 1], d1: [1, 1] },
      { E0: [A, Bz], E1: [A, -Bz], R0: [A - Bz, 0], R1: [A - Bz, 0], d0: [1, 1], d1: [1, -1] },
      { E0: [A, -Bz], E1: [-A, -Bz], R0: [A - Bz, 0], R1: [-(A - Bz), 0], d0: [1, -1], d1: [-1, -1] },
      { E0: [-A, -Bz], E1: [-A, Bz], R0: [-(A - Bz), 0], R1: [-(A - Bz), 0], d0: [-1, -1], d1: [-1, 1] },
    ];
    for (const f of fs) face(B, R, { ...f, t0: 0, t1: tg, c0: true, c1: true, eave: true, hip1: true, hipT: tg });
    const X = xg + (o.gOver ?? 0.22);
    const t0 = tg - 0.06;
    const up = { lift: R.lift * 0.9 };
    face(B, R, { E0: [-X, Bz], E1: [X, Bz], R0: [-X, 0], R1: [X, 0], t0, t1: 1, c0: true, c1: true, d0: [-1, 0.5], d1: [1, 0.5], eave: true, open0: true, open1: true, barge: true, ...up });
    face(B, R, { E0: [X, -Bz], E1: [-X, -Bz], R0: [X, 0], R1: [-X, 0], t0, t1: 1, c0: true, c1: true, d0: [1, -0.5], d1: [-1, -0.5], eave: true, open0: true, open1: true, barge: true, ...up });
    const yTop = R.yb + R.H * prof(tg, R.curve) + R.ribAmp * 0.5;
    for (const sx of [-1, 1]) gableTri(B, R, o, sx * xg, sx, tg, Bz, yTop);
    ridge(B, R, -X - 0.05, X + 0.05, R.yb + R.H, capCol, o.oni !== false, o);
    out.yAt = (x, z) => R.yb + R.H * prof(clamp(Math.min(A - Math.abs(x), Bz - Math.abs(z)) / Bz), R.curve);
  } else if (type === 'skirt') {
    // pent roof ring (lower tier of a two-storey house); upper storey sits on the plate at topY
    const tt = o.tTop ?? 0.45;
    const fs = [
      { E0: [-A, Bz], E1: [A, Bz], R0: [-(A - Bz), 0], R1: [A - Bz, 0], d0: [-1, 1], d1: [1, 1] },
      { E0: [A, Bz], E1: [A, -Bz], R0: [A - Bz, 0], R1: [A - Bz, 0], d0: [1, 1], d1: [1, -1] },
      { E0: [A, -Bz], E1: [-A, -Bz], R0: [A - Bz, 0], R1: [-(A - Bz), 0], d0: [1, -1], d1: [-1, -1] },
      { E0: [-A, -Bz], E1: [-A, Bz], R0: [-(A - Bz), 0], R1: [-(A - Bz), 0], d0: [-1, -1], d1: [-1, 1] },
    ];
    fs.forEach((f, i) => { if (!o.skip?.includes('frbl'[i])) face(B, R, { ...f, t0: 0, t1: tt, c0: true, c1: true, eave: true, hip1: true, hipT: tt }); });
    const Y1 = R.yb + R.H * prof(tt, R.curve);
    const pw = 2 * (A - Bz * tt), pd = 2 * Bz * (1 - tt);
    const plate = G.box(pw + 0.08, 0.1, pd + 0.08, 0.03); plate.translate(0, Y1 + 0.01, 0); B.add(plate, R.under);
    out.topY = Y1 + 0.06; out.openW = pw; out.openD = pd;
    out.yAt = (x, z) => R.yb + R.H * prof(clamp(Math.min(A - Math.abs(x), Bz - Math.abs(z)) / Bz), R.curve);
  } else if (type === 'shed') {
    // single slope rising from the front eave (+z) to the back (-z)
    const X = o.w / 2 + gOver;
    const Rs = { ...R };
    face(B, Rs, { E0: [-X, Bz], E1: [X, Bz], R0: [-X, -Bz], R1: [X, -Bz], t0: 0, t1: 1, c0: true, c1: true, d0: [-1, 0.6], d1: [1, 0.6], eave: true, open0: true, open1: true, topBand: true, barge: true });
    out.ridgeY = R.yb + R.H;
    out.yAt = (x, z) => R.yb + R.H * prof(clamp((Bz - z) / (2 * Bz)), R.curve);
  }
  addUnderAt(out, R, type, o, A, Bz);
  return out;
}

// One roof plane: E0→E1 eave, R0→R1 ridge (xz), param s along eave, t eave→ridge.
function face(B, R, f) {
  const [E0, E1, R0, R1] = [f.E0, f.E1, f.R0, f.R1];
  const ex = E1[0] - E0[0], ez = E1[1] - E0[1], eL = Math.hypot(ex, ez), dir = [ex / eL, ez / eL];
  const lift = f.lift ?? R.lift;
  const ns = R.ribW > 0 ? Math.max(3, Math.ceil(eL / R.ribW * 3)) : Math.max(2, Math.ceil(eL / 0.3));
  const mx = (E0[0] + E1[0]) / 2 - (R0[0] + R1[0]) / 2, mz = (E0[1] + E1[1]) / 2 - (R0[1] + R1[1]) / 2;
  const slopeLen = Math.hypot(Math.hypot(mx, mz), R.H);
  // rows: course lips + curve samples
  const ts = new Set([f.t0, f.t1]);
  const step = R.course > 0 ? R.course / slopeLen : 0;
  if (step > 0) for (let k = 0; k * step < f.t1; k++) {
    for (const tt of [k * step, (k + 0.86) * step]) if (tt > f.t0 + 1e-3 && tt < f.t1 - 1e-3) ts.add(tt);
  } else for (let t = f.t0 + 0.12; t < f.t1 - 0.03; t += 0.12) ts.add(t);
  const fi = R.fi = (R.fi ?? 0) + 1;
  const rows = [...ts].sort((a, b) => a - b);
  const W = Math.min(R.liftW, eL * 0.28);
  const P = (s, t, mode) => { // mode 0 top ribbed, 1 underside, 2 top smooth
    let x = lerp(lerp(E0[0], E1[0], s), lerp(R0[0], R1[0], s), t);
    let z = lerp(lerp(E0[1], E1[1], s), lerp(R0[1], R1[1], s), t);
    const x0 = x, z0 = z;
    const near0 = s < 0.5, dc = near0 ? s * eL : (1 - s) * eL, on = near0 ? f.c0 : f.c1;
    let up = 0;
    if (on && lift > 0) {
      up = lift * Math.exp(-(dc * dc) / (W * W)) * (1 - t) * (1 - t);
      const d = near0 ? f.d0 : f.d1, dl = Math.hypot(d[0], d[1]);
      x += d[0] / dl * up * 0.45; z += d[1] / dl * up * 0.45;
    }
    let y = R.yb + R.H * prof(t, R.curve) + up, rib = 0, fr = 0, ci = 0, ri = 0;
    if (mode === 0) {
      if (R.ribW > 0) { const u = (x0 * dir[0] + z0 * dir[1]) / R.ribW; rib = ribShape(u + 0.5); ci = Math.round(u); y += rib * R.ribAmp; }
      if (step > 0) { const u = t / step + 1e-4; ri = Math.floor(u); fr = u - ri; y += (1 - fr) * R.courseAmp; }
    } else if (mode === 1) y -= R.thick;
    else y += R.ribAmp * 0.6 + R.courseAmp * 0.5;
    return { p: V(x, y, z), rib, fr, up, ci, ri };
  };
  // top surface: tile columns with dark valleys, course lips with a shadow line under each butt edge,
  // a little per-tile colour variety (hand-laid kawara) and a few lichen-spotted tiles
  const pos = [], cols = [], idx = [];
  const cb = R.color, tmp = new THREE.Color();
  const hs = R.seed + fi * 101;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i <= ns; i++) {
    const q = P(i / ns, rows[j], 0);
    pos.push(q.p.x, q.p.y, q.p.z);
    const shadowLine = step > 0 ? 1.08 - 0.3 * Math.pow(q.fr, 1.5) : 1;
    tmp.copy(cb).multiplyScalar((0.75 + 0.31 * q.rib) * shadowLine * (1 + q.up * 0.25));
    if (R.ribW > 0) {
      const hj = hash3(q.ci, q.ri, hs);
      const kk = 0.955 + 0.09 * hj, ww = (hash3(q.ri, q.ci, hs + 3) - 0.5) * 0.05;
      tmp.r *= kk * (1 + ww); tmp.g *= kk; tmp.b *= kk * (1 - ww);
      if (R.lichen > 0 && q.rib > 0.8 && q.fr > 0.05 && hash3(q.ci * 3 + 1, q.ri, hs + 11) < R.lichen) tmp.lerp(LICHEN[(hj * 3) | 0], 0.32);
    }
    if (R.moss > 0) {
      const m = clamp((_noise.n2(q.p.x * 0.9 + 3, q.p.z * 0.9) * 0.5 + 0.5 - 0.55) * 4) * R.moss * (1 - rows[j] * 0.6);
      tmp.lerp(R.mossCol, m * 0.85);
    }
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  const rw = ns + 1;
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < ns; i++) {
    const a = j * rw + i, b = a + 1, c = a + rw + 1, d = a + rw;
    idx.push(a, b, c, a, c, d);
  }
  B.add(mkGeo(pos, cols, idx), null);
  // soft moss cushions tucked on a few lower courses (older, humbler roofs)
  if (R.mossClumps && !f.topBand) for (let m = 0; m < R.mossClumps; m++) {
    if (B.dchance(0.35)) continue;
    const s = B.drand(0.18, 0.82), t = lerp(f.t0 + 0.03, f.t0 + (f.t1 - f.t0) * 0.3, B.dr());
    const kk = clamp(R.k, 0.6, 1.1), mc = mixc('#' + R.color.getHexString(), B.dpick(['#6f9c50', '#7aa458', '#668f4a']), 0.5);
    for (let c = 0; c < 3; c++) {
      const q = P(clamp(s + (c ? B.dwob(0.045) : 0), 0.05, 0.95), t + (c ? B.dwob(0.025) : 0), 0), r = B.drand(0.055, 0.085) * kk * (c ? 0.8 : 1);
      const g = puff(V(0, 0, 0), r, { detail: 0, noise: 0.3, squash: 0.36, seed: R.seed + m * 7 + c });
      g.rotateY(B.drand(0, PI)); g.translate(q.p.x, q.p.y - r * 0.1, q.p.z);
      B.add(g, c ? shade(mc, 0.94 + c * 0.08) : mc);
    }
  }
  // underside (soffit)
  const upos = [], ucol = [], uidx = [];
  const urows = [f.t0, lerp(f.t0, f.t1, 0.25), f.t1];
  const cu = col(R.under);
  const nu = Math.max(2, Math.ceil(eL / 0.28)), urw = nu + 1;
  for (let j = 0; j < urows.length; j++) for (let i = 0; i <= nu; i++) {
    const q = P(i / nu, urows[j], 1);
    upos.push(q.p.x, q.p.y, q.p.z);
    tmp.copy(cu).multiplyScalar(0.8 + 0.2 * j / 2); ucol.push(tmp.r, tmp.g, tmp.b);
  }
  for (let j = 0; j < urows.length - 1; j++) for (let i = 0; i < nu; i++) {
    const a = j * urw + i, b = a + 1, c = a + urw + 1, d = a + urw;
    uidx.push(a, c, b, a, d, c);
  }
  B.add(mkGeo(upos, ucol, uidx), null);
  // edges
  const outE = V(-dir[1], 0, dir[0]);
  if (f.eave) {
    const T = [], U = [];
    for (let i = 0; i <= ns; i++) { T.push(P(i / ns, f.t0, 0).p); U.push(P(i / ns, f.t0, 1).p); }
    B.add(band(T, U, R.edge, outE), null);
    if (R.ends && R.ribW > 0) tileEnds(B, R, P, f, dir, eL);
  }
  if (f.topBand) {
    const T = [], U = [];
    for (let i = 0; i <= ns; i++) { T.push(P(i / ns, f.t1, 0).p); U.push(P(i / ns, f.t1, 1).p); }
    B.add(band(T, U, R.edge, outE.clone().negate()), null);
  }
  for (const [s, on, sgn] of [[0, f.open0, -1], [1, f.open1, 1]]) {
    if (!on) continue;
    const T = [], U = [];
    for (const t of rows) { T.push(P(s, t, 0).p); U.push(P(s, t, 1).p); }
    B.add(band(T, U, R.edge, V(dir[0] * sgn, 0, dir[1] * sgn)), null);
    if (f.barge && R.k >= 0.4) { // descending ridge along the barge edge
      const pts = []; for (let k = 0; k <= 8; k++) { const t = lerp(f.t1, f.t0, k / 8); const q = P(s, t, 2).p; q.x -= dir[0] * sgn * 0.05 * R.k; q.z -= dir[1] * sgn * 0.05 * R.k; q.y += 0.02; pts.push({ p: q, r: 0.068 * R.k }); }
      capTube(B, pts, R);
    }
  }
  if (f.hip1 && R.k >= 0.4) {
    const tTop = f.hipT ?? f.t1, pts = [];
    for (let k = 0; k <= 10; k++) { const t = lerp(tTop, f.t0, k / 10); const q = P(1, t, 2).p; q.y += 0.02; pts.push({ p: q, r: 0.075 * R.k }); }
    capTube(B, pts, R);
  }
}

// A coin facing +y: front fan (centre vertex painted `mid`) + side band, no hidden back cap (3·seg triangles)
function discGeo(r, dep, seg, body, mid) {
  const pos = [], cols = [], h = dep / 2;
  const put = (x, y, z, c) => { pos.push(x, y, z); cols.push(c.r, c.g, c.b); };
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * PI * 2, a1 = (k + 1) / seg * PI * 2;
    const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    put(0, h, 0, mid); put(x1, h, z1, body); put(x0, h, z0, body);
    put(x0, h, z0, body); put(x1, h, z1, body); put(x1 * 0.94, -h, z1 * 0.94, body);
    put(x0, h, z0, body); put(x1 * 0.94, -h, z1 * 0.94, body); put(x0 * 0.94, -h, z0 * 0.94, body);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

// Round tile-end discs (nokigawara) at every tile column along an eave, tipped a little upward so they read from
// the high game camera. Humble roofs: plain discs; richer roofs get a painted mon (a soft dot) on each disc.
function tileEnds(B, R, P, f, dir, eL) {
  const t0 = f.t0;
  const X0 = s => lerp(lerp(f.E0[0], f.E1[0], s), lerp(f.R0[0], f.R1[0], s), t0);
  const Z0 = s => lerp(lerp(f.E0[1], f.E1[1], s), lerp(f.R0[1], f.R1[1], s), t0);
  const a0 = X0(0) * dir[0] + Z0(0) * dir[1], a1 = X0(1) * dir[0] + Z0(1) * dir[1];
  if (a1 - a0 < 1e-3) return;
  const r = clamp(Math.min(R.ribW * 0.31, R.thick * 0.44), 0.035, 0.1), dep = 0.04;
  const margin = R.ribW * 0.7;
  const body = col(mixc('#' + R.color.getHexString(), R.edge, 0.16)).multiplyScalar(0.9);
  const mon = R.rich >= 2 ? body.clone().lerp(col('#a8742a'), 0.6) : body.clone().multiplyScalar(0.72);
  const tA = Math.min(t0 + 0.05, f.t1);
  for (let k = Math.ceil(a0 / R.ribW); k * R.ribW <= a1; k++) {
    const s = (k * R.ribW - a0) / (a1 - a0);
    if (s * eL < margin || (1 - s) * eL < margin) continue;
    const top = P(s, t0, 0).p, inn = P(s, tA, 0).p;
    const D = top.clone().sub(inn); D.y = 0; if (D.lengthSq() < 1e-8) continue;
    D.normalize(); D.y = 0.42; D.normalize();
    const g = discGeo(r, dep, 9, body, R.rich >= 1 ? mon : body);
    g.applyQuaternion(_q.setFromUnitVectors(_up, D));
    g.translate(top.x + D.x * 0.01, top.y - r * 1.05, top.z + D.z * 0.01);
    B.add(g, null);
  }
}

function capTube(B, pts, R) {
  const g = tube(pts, 6, false);
  const cc = col(shade('#' + R.color.getHexString(), 0.74)), hi = col(R.edge);
  const n = pts.length;
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) {
    const row = Math.floor(i / 7);
    const c = row >= n - 2 ? hi : cc;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  B.add(g, null);
  // curled tip
  const last = pts[n - 1].p, prev = pts[n - 3].p;
  const d = last.clone().sub(prev).normalize();
  const k = (R.k ?? 1), rr = pts[n - 1].r;
  const tip = G.torus(rr * 1.1, rr * 0.7, 5, 10, PI * 1.25);
  const yaw = Math.atan2(d.x, d.z);
  tip.rotateY(PI / 2); tip.rotateY(yaw); tip.translate(last.x, last.y + rr * 1.1, last.z);
  B.add(tip, R.edge);
  void k;
}

// Ridge cap along x at height y with onigawara end tiles
function ridge(B, R, x0, x1, y, capCol, oni, o) {
  const len = x1 - x0, k = R.k;
  const cap = G.box(len + 0.1, 0.18 * k, 0.3 * k, 0.07 * k);
  cap.translate((x0 + x1) / 2, y + 0.06 * k, 0);
  B.add(cap, capCol);
  const band2 = G.box(len + 0.12, 0.06 * k, 0.22 * k, 0.025 * k); band2.translate((x0 + x1) / 2, y + 0.17 * k, 0);
  B.add(band2, shade(capCol, 1.18));
  // stacked noshi tiles: two dark courses along both sides of the cap
  if (k >= 0.35) for (const yy of [0.02, 0.085]) {
    const ln = G.box(len + 0.05, 0.02 * k, 0.3 * k + 0.014, 0); ln.translate((x0 + x1) / 2, y + yy * k, 0); B.add(ln, shade(capCol, 0.72));
  }
  if (!oni) return;
  const rich = R.oniRich ?? 1;
  for (const [x, s] of [[x0, -1], [x1, 1]]) {
    if (o.shachi) { shachihoko(B, x - s * 0.02, y + 0.12, s); continue; }
    B.push([x + s * 0.02, y, 0], 0, k);
    const g = G.box(0.13, 0.3, 0.36, 0.06); g.translate(0, 0.15, 0);
    B.add(g, capCol);
    for (const sz of [-1, 1]) { const horn = G.sph(0.07, 8, 6); horn.scale(0.8, 1.2, 0.8); horn.translate(0, 0.3, sz * 0.13); B.add(horn, capCol); }
    const face = G.cyl(0.09, 0.09, 0.04, 12); face.rotateZ(PI / 2); face.translate(s * 0.07, 0.15, 0);
    B.add(face, o.oniFace || shade(capCol, 1.35));
    const dot = G.sph(0.035, 6, 4); dot.translate(s * 0.095, 0.15, 0); B.add(dot, o.oniFace ? capCol : shade(capCol, 0.8));
    if (rich >= 1) { // toribusuma: the little round tile poking out over the oni
      const tb = G.cyl(0.05, 0.055, 0.2, 6); tb.rotateZ(PI / 2); tb.translate(s * 0.08, 0.33, 0); B.add(tb, shade(capCol, 1.1));
      const tbe = G.cyl(0.056, 0.056, 0.02, 6); tbe.rotateZ(PI / 2); tbe.translate(s * 0.185, 0.33, 0); B.add(tbe, rich >= 2 ? C.gold : shade(capCol, 1.3));
    }
    if (rich >= 2) { const rim = G.torus(0.1, 0.018, 4, 12); rim.rotateY(PI / 2); rim.translate(s * 0.09, 0.15, 0); B.add(rim, C.gold); }
    B.pop();
  }
}

// golden fish ridge ornament (castle / town hall)
function shachihoko(B, x, y, s) {
  const pts = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push({ p: V(x - s * (0.18 - t * 0.2) - s * Math.sin(t * PI) * 0.05, y + t * 0.52, 0), r: 0.03 + Math.sin(Math.min(1, t * 1.25) * PI) * 0.12 }); }
  B.add(tube(pts, 8, true), C.gold);
  const tail = G.cone(0.16, 0.24, 6); tail.scale(1, 1, 0.35); tail.rotateZ(s * 0.9); tail.translate(x - s * 0.02, y + 0.22, 0);
  // head down, tail up: flip whole thing
  const fins = G.box(0.08, 0.2, 0.28, 0.03); fins.translate(x - s * 0.1, y + 0.62, 0);
  B.add(fins, '#ffd870');
  const eye = G.sph(0.03, 6, 4); eye.translate(x - s * 0.13, y + 0.12, 0.08); B.add(eye, C.ink);
  const eye2 = G.sph(0.03, 6, 4); eye2.translate(x - s * 0.13, y + 0.12, -0.08); B.add(eye2, C.ink);
}

// Hoju (flaming jewel) finial for pyramid and round roofs
export function finial(B, y, capCol, kind, k = 1) {
  B.push([0, y, 0], 0, k);
  const base = G.cyl(0.14, 0.2, 0.14, 8); base.translate(0, 0.05, 0); B.add(base, capCol);
  const ring = G.torus(0.11, 0.035, 5, 10); ring.rotateX(PI / 2); ring.translate(0, 0.15, 0); B.add(ring, kind === 'stone' ? capCol : C.gold);
  const jewel = G.lathe([[0, 0], [0.1, 0.05], [0.12, 0.13], [0.07, 0.22], [0, 0.32]], 8); jewel.translate(0, 0.16, 0);
  B.add(jewel, kind === 'red' ? C.red : kind === 'stone' ? capCol : C.gold);
  B.pop();
}

// Gable-end triangle at plane x = X (facing sx), under the roof from t0..1, bottom at yBase
function gableTri(B, R, o, X, sx, t0, Bz, yBase) {
  const top = [], bot = [], N = 16;
  const yUnder = t => R.yb + R.H * prof(t, R.curve) - R.thick - 0.01;
  // find where the underside rises above the base line
  let tStart = t0;
  while (tStart < 0.999 && yUnder(tStart) < yBase + 0.02) tStart += 0.005;
  const zMax = Bz * (1 - tStart);
  for (let i = 0; i <= N; i++) {
    const z = lerp(-zMax, zMax, i / N), t = 1 - Math.abs(z) / Bz;
    top.push(V(X - sx * 0.02, Math.max(yBase, yUnder(t)), z)); bot.push(V(X - sx * 0.02, yBase, z));
  }
  const fill = o.gable || 'plaster', tim = o.timber || C.woodDark; // timber: the gable's beam, post and vent frame
  const cFill = fill === 'wood' ? (o.gableWood || C.woodMid) : fill === 'ornate' ? '#8a4a3a' : (o.gableColor || C.plaster);
  B.add(band(top, bot, cFill, V(sx, 0, 0)), null);
  const hTri = yUnder(1) - yBase;
  if (hTri < 0.25) return;
  // timber details
  const wx = X + sx * 0.02;
  const beam = G.box(0.08, 0.09, zMax * 1.9, 0.02); beam.translate(wx, yBase + 0.05, 0); B.add(beam, tim);
  const post = G.box(0.08, hTri * 0.9, 0.09, 0.02); post.translate(wx, yBase + hTri * 0.45, 0);
  if (fill === 'ornate') {
    // gold gegyo crest
    const disc = G.cyl(0.16, 0.16, 0.06, 12); disc.rotateZ(PI / 2); disc.translate(wx + sx * 0.02, yBase + hTri * 0.62, 0); B.add(disc, C.gold);
    const drop = G.cone(0.1, 0.22, 8); drop.rotateZ(PI); drop.translate(wx + sx * 0.02, yBase + hTri * 0.62 - 0.18, 0); B.add(drop, C.gold);
    for (const s of [-1, 1]) { const w = G.torus(0.1, 0.03, 4, 8, PI); w.rotateY(PI / 2); w.translate(wx + sx * 0.03, yBase + hTri * 0.62, s * 0.2); B.add(w, C.gold); }
  } else if (o.vent !== false && hTri > 0.5) {
    const vr = Math.min(0.2, hTri * 0.28);
    const ring = G.torus(vr, 0.045, 5, 14); ring.rotateY(PI / 2); ring.translate(wx + sx * 0.01, yBase + hTri * 0.42, 0); B.add(ring, tim);
    const pane = G.disc(vr * 0.95, 14); pane.rotateY(sx * PI / 2); pane.translate(wx, yBase + hTri * 0.42, 0);
    B.glow(pane, C.paper);
    const cross = G.box(0.03, vr * 1.8, 0.03, 0); cross.translate(wx + sx * 0.02, yBase + hTri * 0.42, 0); B.add(cross, tim);
  } else B.add(post, tim);
}

/**
 * roundRoof(B, opts): polygonal (sides>=3) or round (sides=0) roof with concave slope, apex finial.
 *  r (eave radius), y0 (underside at wall radius rw), rw, H, curve, lift, color, ribW, sides, rot
 */
export function roundRoof(B, o) {
  const sides = o.sides ?? 0, r = o.r, H = o.H ?? r * 0.8, curve = o.curve ?? 0.45, lift = o.lift ?? (sides ? 0.22 : 0.08);
  const thick = o.thick ?? 0.14, ribW = o.ribW ?? 0.3, ribAmp = o.ribAmp ?? 0.04, rot = o.rot ?? 0;
  const cb = col(o.color || '#5d6f9e'), edge = o.edge || mixc(o.color || '#5d6f9e', '#fff6ea', 0.42), under = col(o.under || '#9a6a52');
  const rw = o.rw ?? r * 0.7;
  const tw = 1 - rw / r;
  const yb = o.y0 - H * prof(tw, curve) + thick;
  const nA = sides ? sides * Math.max(4, Math.ceil(2 * PI * r / sides / (ribW || 0.3) * 1.5)) : Math.max(16, Math.ceil(2 * PI * r / (ribW || 0.3) * 3));
  const rowsT = [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92, 1];
  const seg = sides ? 2 * PI / sides : 1;
  const P = (a, t, mode) => {
    let rr = r;
    let up = 0;
    if (sides) {
      const la = ((a - rot) % seg + seg) % seg - seg / 2;
      rr = r * Math.cos(seg / 2) / Math.cos(la);
      const dc = Math.abs(Math.abs(la) - seg / 2) * r;
      up = lift * Math.exp(-dc * dc / 0.25) * (1 - t) * (1 - t);
    } else up = lift * (1 - t) * (1 - t);
    const rad = rr * (1 - t) + up * 0.3;
    let y = yb + H * prof(t, curve) + up;
    let rib = 0;
    if (mode === 0 && ribW > 0) { rib = ribShape(a * r / ribW); y += rib * ribAmp * (1 - t * 0.6); }
    if (mode === 1) y -= thick;
    return { p: V(Math.cos(a) * rad, y, Math.sin(a) * rad), rib };
  };
  const pos = [], cols = [], idx = [], upos = [], ucol = [], uidx = [];
  const tmp = new THREE.Color();
  for (let j = 0; j < rowsT.length; j++) for (let i = 0; i <= nA; i++) {
    const a = i / nA * 2 * PI, q = P(a, rowsT[j], 0);
    pos.push(q.p.x, q.p.y, q.p.z);
    tmp.copy(cb).multiplyScalar((0.84 + 0.22 * q.rib) * (0.94 + 0.08 * Math.sin(rowsT[j] * 30))); cols.push(tmp.r, tmp.g, tmp.b);
    const u = P(a, rowsT[j], 1); upos.push(u.p.x, u.p.y, u.p.z); tmp.copy(under).multiplyScalar(0.85); ucol.push(tmp.r, tmp.g, tmp.b);
  }
  const rw2 = nA + 1;
  for (let j = 0; j < rowsT.length - 1; j++) for (let i = 0; i < nA; i++) {
    const a = j * rw2 + i, b = a + 1, c = a + rw2 + 1, d = a + rw2;
    idx.push(a, c, b, a, d, c); uidx.push(a, b, c, a, c, d);
  }
  B.add(mkGeo(pos, cols, idx), null);
  B.add(mkGeo(upos, ucol, uidx), null);
  const T = [], U = [];
  for (let i = 0; i <= nA; i++) { const a = i / nA * 2 * PI; T.push(P(a, 0, 0).p); U.push(P(a, 0, 1).p); }
  // band outward: build per segment with radial hint
  const bpos = [], bcol = [];
  const ce = col(edge), cd = ce.clone().multiplyScalar(0.82);
  for (let i = 0; i < nA; i++) {
    const quad = [T[i], U[i], U[i + 1], T[i], U[i + 1], T[i + 1]];
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(U[i], T[i]), new THREE.Vector3().subVectors(U[i + 1], T[i]));
    const mid = T[i].clone().add(T[i + 1]).multiplyScalar(0.5); mid.y = 0;
    const flip = n.dot(mid) < 0;
    const tris = flip ? [T[i], U[i + 1], U[i], T[i], T[i + 1], U[i + 1]] : quad;
    for (const p of tris) { bpos.push(p.x, p.y, p.z); const c = (p === U[i] || p === U[i + 1]) ? cd : ce; bcol.push(c.r, c.g, c.b); }
  }
  B.add(mkGeo(bpos, bcol, null), null);
  if (sides) for (let k = 0; k < sides; k++) { // hip caps
    const a = rot + k * seg + seg / 2 + (sides ? 0 : 0);
    const ac = rot + k * seg;
    const pts = [];
    for (let m = 0; m <= 8; m++) { const t = 1 - m / 8; const q = P(ac + 1e-4, t, 2).p; q.y += ribAmp * 0.8 + 0.03; pts.push({ p: q, r: 0.07 }); }
    capTube(B, pts, { color: cb, edge, k: clamp(r / 1.4, 0.4, 1.2) });
    void a;
  }
  if (o.finial !== false) finial(B, yb + H - 0.02, shade(o.color || '#5d6f9e', 0.72), o.finial, clamp(r / 1.4, 0.45, 1.2));
  return { yb, H, ridgeY: yb + H };
}
