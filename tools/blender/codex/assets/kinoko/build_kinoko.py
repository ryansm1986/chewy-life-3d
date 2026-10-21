"""Kinoko (the Burrow's spore-caster, EN-1): deterministic build of Option A "Toadstool Tot".

Blender 4.3:
  blender --background --factory-startup --python build_kinoko.py [-- --variant base|dream|orange]

Builds every variant from an empty scene and exports public/models/kinoko.glb, kinoko_dream.glb and kinoko_orange.glb,
then saves kinoko.blend (the base variant). Units: metres, front = -Y, ground z = 0.

One rigid part (the brief's one-piece note): `body` = cap + stem body + face + feet, origin (0, 0, 0) = the ground centre
under the middle of the stem. Vertex colour only (face-corner FLOAT_COLOR `Col`), one material `toon`, no UVs, no rig.

Technique
- The cap is a surface of revolution about its own axis, tilted back 20.5 deg (the sheet's side view: the front rim
  is raised so the face shows from 45 deg above). Its outer dome (pole down to just above the rim) is triangulated with a
  constrained Delaunay in a CONFORMAL disk domain of the surface (radius exp(int ds/r)), so the cream spots' round
  outlines are edge loops of the cap itself (crisp borders, nothing floating, the ink hull untouched). The rim lip and
  the underside below it are lofted rings that share the dome's boundary loop (one closed watertight shell).
- Every cap vertex gets its analytic normal from the profile, so the irregular triangulation shades perfectly smooth.
- The stem body is a superellipse loft (a soft marshmallow, rounder at the front so the eyes sit in its curve).
- Face features are single-sided decals 2-7 mm above the body (eyes domed), triangulated with a constrained Delaunay
  in front-view coordinates where every colour border is a constraint loop, then projected onto the body by ray
  casting and given the body's interpolated normals.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

print('KINOKO build pid', os.getpid(), flush=True)
TASK_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
PI, TAU = math.pi, 2 * math.pi

# ================================================================== palette (sRGB hex)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
COMMON = dict(stem='#f6ecd8', under='#e4ceb0', eye='#292125', iris_low='#654126', sclera='#fff6ea', catch='#ffffff',
              lid='#292125', brow='#292125', nose='#3a2624', mouth='#292125', blush='#e98c91')
VARIANTS = {
    'base':   dict(COMMON, cap='#ff5a5a', spot='#fff7e8', file='kinoko'),
    'dream':  dict(COMMON, cap='#8a6aff', spot='#e8deff', file='kinoko_dream'),
    'orange': dict(COMMON, cap='#ffae3a', spot='#fff7e8', file='kinoko_orange'),
}

# ================================================================== small math (shared with the series' builds)
def nz(v, axis=-1):
    return v / np.maximum(np.linalg.norm(v, axis=axis, keepdims=True), 1e-12)
def sstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def catmull(cp, n_per=40):
    cp = np.asarray(cp, float); P = np.vstack([cp[0] * 2 - cp[1], cp, cp[-1] * 2 - cp[-2]]); out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n_per):
            t = k / n_per; t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(cp[-1]); return np.array(out)
def resample_loop(P, n):
    Q = np.vstack([P, P[:1]]); seg = np.linalg.norm(np.diff(Q, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], n, endpoint=False)
    return np.stack([np.interp(s, cum, Q[:, k]) for k in range(Q.shape[1])], -1)
def signed_area(P):
    x, y = P[:, 0], P[:, 1]; return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
def ccw(P): return P if signed_area(P) > 0 else P[::-1].copy()
def inside(poly, pts):
    pts = np.atleast_2d(pts); x, y = pts[:, 0], pts[:, 1]; res = np.zeros(len(pts), bool)
    xi, yi = poly[:, 0], poly[:, 1]; xj, yj = np.roll(xi, 1), np.roll(yi, 1)
    for a, b, c, d in zip(xi, yi, xj, yj):
        res ^= ((b > y) != (d > y)) & (x < (c - a) * (y - b) / ((d - b) + 1e-300) + a)
    return res
def dist_to_poly(poly, pts):
    A = poly; B = np.roll(poly, -1, 0); AB = B - A
    AP = pts[:, None, :] - A[None]; t = np.clip(np.einsum('nki,ki->nk', AP, AB) / np.maximum(np.einsum('ki,ki->k', AB, AB), 1e-12), 0, 1)
    Q = A[None] + t[..., None] * AB[None]; return np.linalg.norm(pts[:, None, :] - Q, axis=2).min(1)
def ellipse(cx, cz, a, b, n, rot=0.0):
    t = np.linspace(0, TAU, n, endpoint=False); x, y = a * np.cos(t), b * np.sin(t)
    c, s = math.cos(rot), math.sin(rot); return np.stack([cx + c * x - s * y, cz + s * x + c * y], -1)
def stroke(path, hw, ncap=5):
    """closed CCW outline of a stroke along an open 2-D path with per-point half widths (round ends)"""
    path = np.asarray(path, float); hw = np.broadcast_to(np.asarray(hw, float), (len(path),))
    d = np.gradient(path, axis=0); nrm = nz(np.stack([-d[:, 1], d[:, 0]], -1))
    L = path + nrm * hw[:, None]; R = path - nrm * hw[:, None]
    def cap(p, dirv, r):
        base = math.atan2(dirv[1], dirv[0]); return [p + r * np.array([math.cos(base + a), math.sin(base + a)]) for a in np.linspace(-PI / 2, PI / 2, ncap)[1:-1]]
    e1 = nz(path[-1] - path[-2]); e0 = nz(path[0] - path[1])
    pts = list(L) + cap(path[-1], e1, hw[-1])[::-1] + list(R[::-1]) + cap(path[0], e0, hw[0])[::-1]
    return ccw(np.array(pts))

def cdt(points, loops):
    edges = []
    for lp in loops:
        for i in range(len(lp)): edges.append((int(lp[i]), int(lp[(i + 1) % len(lp)])))
    res = delaunay_2d_cdt([Vector((float(p[0]), float(p[1]))) for p in points], edges, [], 0, 1e-9, True)
    V = np.array([(v[0], v[1]) for v in res[0]], float); F = np.array([f for f in res[2] if len(f) == 3], int)
    return V, F

def vnormals(V, F):
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; fn = np.cross(b - a, c - a)
    N = np.zeros_like(V)
    for k in range(3): np.add.at(N, F[:, k], fn)
    return nz(N)
def signed_volume(V, F):
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; return np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6

# ================================================================== mesh accumulator
class Acc:
    def __init__(self): self.V = []; self.N = []; self.F = []; self.C = []; self.M = []; self.n = 0; self.log = {}; self.tags = []
    def add(self, V, F, FC, N=None, mat=None, tag='part', orient=True):
        """V (n,3), F (m,3), FC per-face (m,3) or per-corner (m,3,3) linear colour, N vertex normals (None: computed,
        area-weighted, after orienting the closed sub-mesh outward)."""
        V = np.asarray(V, float); F = np.asarray(F, int).copy(); FC = np.asarray(FC, float)
        if FC.ndim == 2: FC = np.repeat(FC[:, None, :], 3, 1)
        FC = FC.copy()
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
        ok = (area > 1e-12) & (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])
        F, FC = F[ok], FC[ok]
        mat = np.zeros(len(ok), int) if mat is None else np.asarray(mat, int)
        mat = mat[ok]
        if N is None:
            if orient and signed_volume(V, F) < 0: F = F[:, [0, 2, 1]]; FC = FC[:, [0, 2, 1]]
            N = vnormals(V, F)
        else:
            N = nz(np.asarray(N, float))
            fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
            flip = np.einsum('ij,ij->i', fn, N[F[:, 0]] + N[F[:, 1]] + N[F[:, 2]]) < 0
            F[flip] = F[flip][:, [0, 2, 1]]; FC[flip] = FC[flip][:, [0, 2, 1]]
        self.V.append(V); self.N.append(N); self.F.append(F + self.n); self.C.append(FC); self.M.append(mat); self.n += len(V)
        self.log[tag] = self.log.get(tag, 0) + len(F); self.tags.append(tag)
    def tris(self): return sum(len(f) for f in self.F)
    def arrays(self): return np.vstack(self.V), np.vstack(self.N), np.vstack(self.F)
    def to_object(self, name, mats, origin):
        V = np.vstack(self.V) - np.asarray(origin); N = np.vstack(self.N); F = np.vstack(self.F); Cc = np.vstack(self.C)
        me = bpy.data.meshes.new(name)
        me.from_pydata(V.tolist(), [], F.tolist()); me.update()
        assert len(me.polygons) == len(F), 'from_pydata dropped faces'
        me.polygons.foreach_set('use_smooth', [True] * len(F))
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        rgba = np.concatenate([Cc.reshape(-1, 3), np.ones((len(F) * 3, 1))], 1)
        attr.data.foreach_set('color', rgba.astype(np.float32).ravel())
        me.color_attributes.active_color = attr; me.color_attributes.render_color_index = 0
        for m in mats: me.materials.append(m)
        me.normals_split_custom_set_from_vertices(N.tolist())
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        ob.location = tuple(origin)
        return ob

def loft(rows):
    """rows: list of (n,3) loops (all the same n) or (1,3) poles. Returns V, F, band index per face, column per face."""
    V, idx = [], []
    for r in rows:
        idx.append(list(range(len(V), len(V) + len(r)))); V.extend(r.tolist())
    F, band, colm = [], [], []
    for k in range(len(rows) - 1):
        A, B = idx[k], idx[k + 1]
        if len(A) == 1 and len(B) > 1:
            n = len(B)
            for i in range(n): F.append((A[0], B[i], B[(i + 1) % n])); band.append(k); colm.append(i)
        elif len(B) == 1 and len(A) > 1:
            n = len(A)
            for i in range(n): F.append((A[i], B[0], A[(i + 1) % n])); band.append(k); colm.append(i)
        else:
            n = len(A)
            for i in range(n):
                j = (i + 1) % n
                F.append((A[i], B[i], B[j])); F.append((A[i], B[j], A[j])); band += [k, k]; colm += [i, i]
    return np.array(V, float), np.array(F, int), np.array(band), np.array(colm)

# ================================================================== the cap
# An upright dome (elliptic plan: depth 0.89 x width, centred CAP_YC behind the stem) whose lower part is SHEARED
# (z += -SHEAR (y - CAP_YC) w(h)): the rim plane leans, front raised / back lowered (the sheet's side view: a straight
# sloping rim line), while the crown stays upright and centred (a rotation would push the crown and the back out).
CAP_Z0, CAP_YC, CAP_DEPTH = 0.300, 0.062, 0.91
SHEAR = 0.40                           # rim slope (dz/dy): front lip ~0.13 m higher than the sides, back as much lower
W_LO, W_HI = 0.08, 0.40                # the shear fades out between these profile heights (fully on in the lip)
CROWN_FWD = 0.022                      # the crown sits a little forward of the rim's centre (the sheet's side view)
# profile (r, h): h above the lip's lowest ring; from the sheet's front view (where the shear is zero)
CAP_CP = [(0.0, 0.453), (0.06, 0.449), (0.095, 0.440), (0.135, 0.425), (0.180, 0.400), (0.215, 0.375), (0.248, 0.350),
          (0.275, 0.325), (0.297, 0.300), (0.320, 0.270), (0.338, 0.245), (0.355, 0.220), (0.369, 0.195), (0.381, 0.170),
          (0.391, 0.145), (0.398, 0.120), (0.402, 0.095), (0.405, 0.070), (0.405, 0.050), (0.400, 0.031), (0.389, 0.015),
          (0.372, 0.004), (0.354, 0.0), (0.337, 0.004), (0.324, 0.014), (0.316, 0.028),
          (0.296, 0.041), (0.245, 0.055), (0.170, 0.068), (0.090, 0.077), (0.0, 0.080)]
_CP = catmull(CAP_CP, 60); _CP[:, 0] = np.maximum(_CP[:, 0], 0)
_CS = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(_CP, axis=0), axis=1))]); CAP_S = _CS[-1]
_imax = int(np.argmax(_CP[:, 0]))
S_LIP = float(_CS[np.argmin(np.where(_CP[:, 0] > 0.3, _CP[:, 1], 9))])      # arc length of the lip's lowest ring
_ilip = int(np.argmin(np.where(_CP[:, 0] > 0.3, _CP[:, 1], 9)))
S_B = float(np.interp(0.022, _CP[_imax:_ilip + 1, 1][::-1], _CS[_imax:_ilip + 1][::-1]))   # the dome's boundary: on the lip's outer curl, below the widest ring
_iB = int(np.searchsorted(_CS, S_B)) + 1
def s_at_r_under(r): return float(np.interp(r, _CP[_imax:, 0][::-1], _CS[_imax:][::-1]))
def cap_map(s, phi):
    """(arc length from the pole, azimuth: 0 = front -Y, toward +X) -> world point"""
    s = np.asarray(s, float); phi = np.asarray(phi, float)
    r = np.interp(s, _CS, _CP[:, 0]); h = np.interp(s, _CS, _CP[:, 1])
    x = r * np.sin(phi); y = CAP_YC - CAP_DEPTH * r * np.cos(phi) - CROWN_FWD * sstep(0.15, 0.45, h)
    w = 1 - sstep(W_LO, W_HI, h)
    z = CAP_Z0 + h - SHEAR * (y - CAP_YC) * w
    return np.stack([x, y, z], -1)
def cap_point(s, phi):
    """world point and normal (finite differences of the map; the poles straight up / down)"""
    s = np.asarray(s, float); phi = np.asarray(phi, float)
    P = cap_map(s, phi); e = 1e-4
    Ps = cap_map(np.clip(s + e, 0, CAP_S), phi) - cap_map(np.clip(s - e, 0, CAP_S), phi)
    rr = np.maximum(np.interp(s, _CS, _CP[:, 0]), 1e-3)
    Pp = cap_map(s, phi + e / rr) - cap_map(s, phi - e / rr)
    N = nz(np.cross(Ps, Pp))
    pole_top = s < 2e-4; pole_bot = s > CAP_S - 2e-4
    if np.ndim(N) == 1:
        if pole_top: N = np.array([0, 0, 1.0])
        if pole_bot: N = np.array([0, 0, -1.0])
    else:
        N[pole_top] = [0, 0, 1.0]; N[pole_bot] = [0, 0, -1.0]
    return P, N

# conformal radius of the (undeformed) dome: rho(s) = exp(int ds / r); rho ~ s at the pole
_s1 = 0.01
_lr = np.concatenate([[0], np.cumsum(np.diff(_CS) / np.maximum((_CP[1:, 0] + _CP[:-1, 0]) / 2, 1e-4))])
_lr += np.log(_s1) - np.interp(_s1, _CS, _lr)
_RHO = np.where(_CS < _s1, _CS, np.exp(_lr))
def s_of_rho(rho): return np.interp(rho, _RHO[:_iB + 1], _CS[:_iB + 1])
def rho_of_s(s): return np.interp(s, _CS[:_iB + 1], _RHO[:_iB + 1])
def dom_to_cap(W):
    W = np.atleast_2d(W); rho = np.hypot(W[:, 0], W[:, 1]); phi = np.arctan2(W[:, 0], -W[:, 1])
    return cap_point(s_of_rho(rho), phi)
def cap_dom(s, phi):
    rho = rho_of_s(s); return np.stack([rho * np.sin(phi), -rho * np.cos(phi)], -1)

# the cream spots: (phi deg, world z of the centre (None: the crown), radius (m), wobble phase). From the sheet: one on
# the crown (a touch forward), two front-side, two back-side, one big on the back; the front above the face stays red.
# A spot is (x, z, hemisphere, radius, wobble phase): its centre lands where the sheet's front (back) view shows it at
# (x, z); hemisphere 0 = the crown (x ignored), +1 = front half, -1 = back half, 2 = straight at the back (x = 0).
SPOTS = [(0.0, None, 0, 0.152, 0.3),
         (0.300, 0.515, 1, 0.114, 1.1), (-0.294, 0.502, 1, 0.111, 2.3),
         (0.300, 0.475, -1, 0.102, 0.7), (-0.305, 0.462, -1, 0.100, 1.9),
         (0.0, 0.420, 2, 0.130, 2.8)]
TOP_SPOT = (0.0, 0.048)                # the crown spot: azimuth, arc length from the pole (a touch forward)
def s_at_z(phi, zt):
    lo, hi = 0.02, S_B - 0.005
    for _ in range(50):
        mid = (lo + hi) / 2
        if cap_map(np.array(mid), np.array(phi))[2] > zt: lo = mid
        else: hi = mid
    return (lo + hi) / 2
def spot_centre(xt, zt, hemi):
    if hemi == 0: return TOP_SPOT
    if hemi == 2: return PI, s_at_z(PI, zt)
    best = None
    for pd in np.arange(2.0, 90.0, 0.25):
        phi = math.radians(pd) if hemi == 1 else math.radians(180 - pd)
        phi = phi if xt >= 0 else -phi
        s_ = s_at_z(phi, zt); x = float(cap_map(np.array(s_), np.array(phi))[0])
        err = abs(x - xt)
        if best is None or err < best[0]: best = (err, phi, s_)
    return best[1], best[2]
def _spot_ring(phi, sc, R, ph, n):
    wc = cap_dom(np.array(sc), np.array(phi)); Pc = cap_map(np.array(sc), np.array(phi))
    out = []
    for k in range(n):
        a = k / n * TAU
        Rk = R * (1 + 0.025 * math.sin(3 * a + ph) + 0.012 * math.sin(5 * a + 2 * ph))
        d = np.array([math.cos(a), math.sin(a)])
        lo, hi = 0.0, 0.8
        for _ in range(40):
            mid = (lo + hi) / 2
            P = dom_to_cap(wc + d * mid)[0][0]
            if np.linalg.norm(P - Pc) < Rk: lo = mid
            else: hi = mid
        out.append(wc + d * lo)
    return ccw(np.array(out))
def spot_loop(spot, n=None):
    """a round spot on the surface (3-D distance R from its centre, a gentle hand-made wobble), as a domain loop. Its
    centre moves up the cap until the whole spot stays >= 2.5 cm (arc length) above the dome's boundary on the lip."""
    xt, zt, hemi, R, ph = spot
    phi, sc = spot_centre(xt, zt, hemi)
    n = n or max(22, int(round(TAU * R / 0.019)))
    for _ in range(6):
        lp = _spot_ring(phi, sc, R, ph, n)
        over = float(s_of_rho(np.hypot(lp[:, 0], lp[:, 1])).max()) - (S_B - 0.025)
        if over <= 0: break
        sc -= over + 0.002
    return lp

CAP_INFO = {}
NC_CAP = 56                            # columns at the dome's boundary and in the lofted rim / underside
D_CAP = 0.054                          # target edge length on the dome (m)
def build_cap(acc, pal):
    cap, spot, under = lin(pal['cap']), lin(pal['spot']), lin(pal['under'])
    phis = np.arange(NC_CAP) / NC_CAP * TAU
    bnd = cap_dom(np.full(NC_CAP, S_B), phis)
    loops = [spot_loop(sp) for sp in SPOTS]
    CAP_INFO['spot_clearance_to_lip_m'] = [round(float(S_B - s_of_rho(np.hypot(lp[:, 0], lp[:, 1])).max()), 4) for lp in loops]
    pts = [bnd] + loops
    # interior points: rings at even arc-length steps, ~D_CAP apart along each ring (staggered)
    G = [np.zeros((1, 2))]
    k = 1
    while k * D_CAP < _CS[_imax] - 0.5 * D_CAP:
        s = k * D_CAP; r = float(np.interp(s, _CS, _CP[:, 0])); n = max(6, int(round(TAU * r / D_CAP)))
        ph = (np.arange(n) + 0.5 * (k % 2)) / n * TAU
        G.append(cap_dom(np.full(n, s), ph)); k += 1
    G.append(cap_dom(np.full(NC_CAP, _CS[_imax]), phis + PI / NC_CAP))   # the widest ring: the front view's silhouette
    G = np.vstack(G)
    rhoG = np.hypot(G[:, 0], G[:, 1]); sG = s_of_rho(rhoG)
    scale = np.where(rhoG > 1e-6, np.interp(sG, _CS, _CP[:, 0]) / np.maximum(rhoG, 1e-9), 1.0)
    dmin = np.min([dist_to_poly(lp, G) for lp in pts], axis=0) * scale
    G = G[dmin > 0.42 * D_CAP]
    allp = np.vstack(pts + [G]); off = [0]
    for p in pts: off.append(off[-1] + len(p))
    lp_idx = [list(range(off[i], off[i + 1])) for i in range(len(pts))]
    V2, F = cdt(allp, lp_idx)
    cen = V2[F].mean(1); keep = inside(bnd, cen); F = F[keep]
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used)); V2 = V2[used]; F = remap[F]
    cen = V2[F].mean(1)
    in_spot = np.zeros(len(F), bool)
    for lp in loops: in_spot |= inside(lp, cen)
    PL, NL = dom_to_cap(V2)
    hh_dome = np.interp(s_of_rho(np.hypot(V2[:, 0], V2[:, 1])), _CS, _CP[:, 1])
    bidx = np.array([int(np.argmin(np.linalg.norm(V2 - b, axis=1))) for b in bnd])
    assert np.allclose(V2[bidx], bnd, atol=1e-7), 'dome boundary lost in the CDT'
    # lofted rows below the dome: the widest ring, round the lip to its lowest ring, in under the cap
    s_rows = list(np.linspace(S_B, S_LIP, 4)[1:])
    lip_row = len(s_rows)                                              # rows_idx[lip_row] is the S_LIP ring
    s_rows += list(np.linspace(S_LIP, s_at_r_under(0.316), 4)[1:])
    s_rows += [s_at_r_under(r_) for r_ in (0.262, 0.20)]
    nV = len(V2)
    LV, LN, LH = [PL], [NL], [hh_dome]; rows_idx = [bidx]
    for s in s_rows:
        P, N = cap_point(np.full(NC_CAP, s), phis)
        rows_idx.append(np.arange(nV, nV + NC_CAP)); LV.append(P); LN.append(N); nV += NC_CAP
        LH.append(np.full(NC_CAP, np.interp(s, _CS, _CP[:, 1])))
    Pp, Np = cap_point(np.array([CAP_S]), np.array([0.0]))
    LV.append(Pp.reshape(1, 3)); LN.append(Np.reshape(1, 3)); LH.append(np.array([_CP[-1, 1]])); pole = nV; nV += 1
    Fl, band = [], []
    for k in range(len(rows_idx) - 1):
        A, B = rows_idx[k], rows_idx[k + 1]
        for i in range(NC_CAP):
            j = (i + 1) % NC_CAP
            Fl.append((A[i], B[i], B[j])); Fl.append((A[i], B[j], A[j])); band += [k, k]
    last = rows_idx[-1]
    for i in range(NC_CAP): Fl.append((last[i], pole, last[(i + 1) % NC_CAP])); band.append(len(rows_idx) - 1)
    Vl = np.vstack(LV); Nl = np.vstack(LN); hh = np.concatenate(LH)
    Fall = np.vstack([F, np.array(Fl)])
    # colours, soft painted shading baked gently: a touch lighter on the crown, darker toward the rim; the underside
    # darker deeper in. The red / underside border runs along the lip's lowest ring.
    FC = np.zeros((len(Fall), 3, 3))
    shade = 0.92 + 0.10 * sstep(0.03, 0.42, hh)
    rad = np.hypot(Vl[:, 0], (Vl[:, 1] - CAP_YC) / CAP_DEPTH)
    for f in range(len(Fall)):
        for k in range(3):
            v = Fall[f, k]
            if f < len(F):
                FC[f, k] = spot * (0.96 + 0.04 * sstep(0.05, 0.42, hh[v])) if in_spot[f] else cap * shade[v]
            elif band[f - len(F)] < lip_row: FC[f, k] = cap * shade[v]
            else: FC[f, k] = under * (0.82 + 0.18 * sstep(0.20, 0.33, rad[v]))
    acc.add(Vl, Fall, FC, N=Nl, tag='cap')
    return Vl, Fall, len(F)

# ================================================================== the stem body: a superellipse loft
BODY_A, BODY_B, BODY_N, BODY_Y = 0.228, 0.200, 2.4, -0.010
BODY_SHEAR = (0.30, 0.46)              # the stem's top leans with the cap's rim (same slope), so it meets the underside all round
BODY_CP = [(0.0, 0.044), (0.40, 0.045), (0.63, 0.052), (0.79, 0.068), (0.90, 0.095), (0.965, 0.130), (0.993, 0.175),
           (1.0, 0.225), (0.995, 0.28), (0.978, 0.335), (0.945, 0.385), (0.88, 0.43), (0.74, 0.47), (0.42, 0.495), (0.0, 0.50)]
_BP = catmull(BODY_CP, 40); _BP[:, 0] = np.clip(_BP[:, 0], 0, 1.0)
_BS = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(_BP * [0.21, 1], axis=0), axis=1))])
def superell(phi, a, b, n):
    """point on the superellipse |x/a|^n + |y/b|^n = 1 in direction phi (0 = front -Y, toward +X)"""
    s, c = np.sin(phi), -np.cos(phi)
    rr = (np.abs(s / a) ** n + np.abs(c / b) ** n) ** (-1 / n)
    return rr * s, rr * c
def build_body(acc, pal):
    NC = 36
    tt = np.arange(NC) / NC * TAU; phis = tt - 0.32 * np.sin(tt)        # 0 = front; front columns denser
    ex, ey = superell(phis, BODY_A, BODY_B, BODY_N)
    s_rows = np.concatenate([np.linspace(0, _BS[-1] * 0.62, 11)[1:], np.linspace(_BS[-1] * 0.62, _BS[-1], 5)[1:-1]])
    rows = [np.array([[0.0, BODY_Y, _BP[0, 1]]])]
    for s in s_rows:
        rho = np.interp(s, _BS, _BP[:, 0]); z = np.interp(s, _BS, _BP[:, 1])
        rows.append(np.stack([ex * rho, BODY_Y + ey * rho, np.full(NC, z)], -1))
    rows.append(np.array([[0.0, BODY_Y, _BP[-1, 1]]]))
    V, F, band, colm = loft(rows)
    V[:, 2] += -SHEAR * (V[:, 1] - CAP_YC) * sstep(BODY_SHEAR[0], BODY_SHEAR[1], V[:, 2])
    stem = lin(pal['stem'])
    FC = np.zeros((len(F), 3, 3))
    for f in range(len(F)):
        for k in range(3):
            z = V[F[f, k], 2]
            FC[f, k] = stem * (0.90 + 0.10 * sstep(0.03, 0.12, z)) * (1.0 - 0.07 * sstep(0.32, 0.42, z))
    acc.add(V, F, FC, tag='body')
    return V, F

# ================================================================== feet: two soft little pads
FOOT_X, FOOT_Y, FOOT_A, FOOT_B, FOOT_H = 0.110, -0.066, 0.063, 0.084, 0.078
def build_feet(acc, pal):
    stem = lin(pal['stem'])
    for side in (-1, 1):
        cx = side * FOOT_X; NA, NR = 12, 6
        rows = [np.array([[cx, FOOT_Y, 0.0]])]
        for la in np.linspace(-PI / 2, PI / 2, NR + 1)[1:-1]:
            pts = []
            for i in range(NA):
                a = i / NA * TAU
                rr = math.cos(la) ** 0.75                                    # flat-soled, plump pad
                x = cx + FOOT_A * rr * math.sin(a) * (1 + 0.06 * side * math.sin(a))
                y = FOOT_Y - FOOT_B * rr * math.cos(a)
                zc = FOOT_H * 0.42
                z = zc + (FOOT_H * 0.58 if la > 0 else zc) * math.copysign(abs(math.sin(la)) ** (1.0 if la > 0 else 0.55), la)
                pts.append((x, y, max(z, 0.0)))
            rows.append(np.array(pts))
        rows.append(np.array([[cx, FOOT_Y + 0.01, FOOT_H]]))
        V, F, band, colm = loft(rows)
        FC = np.zeros((len(F), 3, 3))
        for f in range(len(F)):
            for k in range(3): FC[f, k] = stem * (0.86 + 0.12 * sstep(0.0, 0.05, V[F[f, k], 2]))
        acc.add(V, F, FC, tag='feet')

# ================================================================== decals (front-projected onto the body)
class Surface:
    def __init__(self, V, F):
        self.V, self.F = V, F; self.N = vnormals(V, F)
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in V], [tuple(f) for f in F])
    def project(self, xz, start=-3.0):
        P, N = [], []
        for x, z in xz:
            loc, fn, fi, dist = self.bvh.ray_cast(Vector((x, start, z)), Vector((0, 1, 0)))
            if loc is None: raise RuntimeError(f'decal point off the surface: {(x, z)}')
            tri = self.F[fi]; a, b, c = (self.V[t] for t in tri); p = np.array(loc)
            v0, v1, v2 = b - a, c - a, p - a
            d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
            den = d00 * d11 - d01 * d01; w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
            n = w0 * self.N[tri[0]] + w1 * self.N[tri[1]] + w2 * self.N[tri[2]]
            P.append(p); N.append(n / np.linalg.norm(n))
        return np.array(P), np.array(N)

def decal(acc, surf, layers, spacing, offset, tag, dome=None, keep_all_inside=None):
    """layers: [(poly (k,2) CCW, colour)] in priority order (first match wins); triangles whose centroid is in no
    layer are dropped. offset: metres above the surface; dome(xz) -> extra offset."""
    pts, loops = [], []
    for poly, _ in layers:
        loops.append(list(range(len(pts), len(pts) + len(poly)))); pts.extend(poly.tolist())
    allp = np.vstack([p for p, _ in layers]); lo, hi = allp.min(0), allp.max(0)
    gx = np.arange(lo[0] + spacing / 2, hi[0], spacing); gz = np.arange(lo[1] + spacing / 2, hi[1], spacing)
    G = np.array([(x, z) for x in gx for z in gz]) if len(gx) and len(gz) else np.zeros((0, 2))
    if len(G):
        keep = np.zeros(len(G), bool)
        for poly, col in layers: keep |= inside(poly, G)
        dmin = np.min([dist_to_poly(p, G) for p, _ in layers], axis=0)
        G = G[keep & (dmin > spacing * 0.45)]
        pts.extend(G.tolist())
    V2, F = cdt(np.array(pts), loops)
    cen = V2[F].mean(1); FC = np.zeros((len(F), 3)); keep = np.zeros(len(F), bool); taken = np.zeros(len(F), bool)
    for poly, col in layers:
        m = inside(poly, cen) & ~taken
        FC[m] = col; keep |= m; taken |= m
    F = F[keep]; FC = FC[keep]
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used)); V2 = V2[used]; F = remap[F]
    P, N = surf.project(V2)
    off = offset + (dome(V2) if dome else 0)
    acc.add(P + N * (np.asarray(off)[:, None] if np.ndim(off) else off), F, FC, N=N, tag=tag)

# the face, in front-view coordinates (x, z), from the sheet (377 px/m, ground at sheet row 384)
EYE_X, EYE_Z, EYE_A, EYE_B = 0.104, 0.245, 0.046, 0.055
def build_face(acc, surf, pal):
    L = {k: lin(pal[k]) for k in ('eye', 'iris_low', 'sclera', 'catch', 'lid', 'brow', 'nose', 'mouth', 'blush')}
    for side in (-1, 1):
        cx = side * EYE_X
        def W(P): return np.stack([cx + side * P[:, 0], EYE_Z + P[:, 1]], -1)   # local (outward, up) -> world (x, z)
        t = np.linspace(0, TAU, 32, endpoint=False)
        eye = ccw(W(np.stack([EYE_A * np.cos(t), EYE_B * np.sin(t) * np.where(np.sin(t) > 0, 0.97, 1.0)], -1)))
        # the white: inside the dark rim, the iris shifted toward the nose so a crescent of white shows outside
        wt = ccw(W(np.stack([(EYE_A - 0.0055) * np.cos(t), (EYE_B - 0.0065) * np.sin(t)], -1)))
        # the iris: shifted toward the nose and up, so it meets the lid and the inner rim and a crescent of white shows
        # on the outer side and under it (the sheet); dark top, warm brown lower ~60 %
        ic = np.array([cx - side * 0.0100, EYE_Z + 0.0030])
        iris = ccw(ellipse(ic[0], ic[1], 0.0390, 0.0510, 24))
        low = ccw(ellipse(ic[0], ic[1] - 0.030, 0.041, 0.042, 18))
        c1 = ccw(ellipse(ic[0] - side * 0.009, ic[1] + 0.017, 0.0128, 0.0128, 12))      # big: upper, toward the nose
        c2 = ccw(ellipse(ic[0] + side * 0.012, ic[1] + 0.010, 0.0060, 0.0060, 8))        # small: beside it, outward
        # the thick upper lash line ON the rim (outer corner -> over -> the inner top), tapering; two little outer lashes
        ang = np.linspace(math.radians(-12), math.radians(125), 11)                     # local angles (0 = outward)
        lp = np.stack([(EYE_A - 0.0010) * np.cos(ang), (EYE_B * 0.97 - 0.0010) * np.sin(ang)], -1)
        u = np.linspace(0, 1, 11); hw = 0.0030 + 0.0042 * np.sin(PI * np.clip(u * 1.2, 0, 1)) ** 0.6 * (1 - 0.45 * u)
        lash = ccw(W(stroke(lp, hw, ncap=4)))
        flicks = []
        for a0, a1 in ((math.radians(14), 0.56), (math.radians(36), 0.95)):
            p0 = np.array([EYE_A * math.cos(a0), EYE_B * 0.97 * math.sin(a0)])
            dv = np.array([math.cos(a1), math.sin(a1)])
            fl = np.array([p0 - dv * 0.002, p0 + dv * 0.008, p0 + dv * 0.0155 + np.array([0.0, 0.0025])])
            flicks.append(ccw(W(stroke(fl, np.array([0.0036, 0.0030, 0.0019]), ncap=4))))
        layers = [(c1, L['catch']), (c2, L['catch']), (lash, L['lid'])] + [(f_, L['lid']) for f_ in flicks]
        _eye_decal(acc, surf, layers, eye, wt, iris, low, L, ic)
        # brows: short, thick, the inner end lower (determined)
        bp = np.array([[0.129, 0.3255], [0.115, 0.3215], [0.101, 0.3165], [0.087, 0.3110], [0.075, 0.3058]])
        bp[:, 0] *= side
        brow = ccw(stroke(bp, np.array([0.0055, 0.0074, 0.0080, 0.0078, 0.0064]), ncap=5))
        decal(acc, surf, [(brow, L['brow'])], 0.02, 0.003, 'brows')
        bl = ccw(ellipse(side * 0.149, 0.190, 0.032, 0.023, 20))
        decal(acc, surf, [(bl, L['blush'])], 0.02, 0.0022, 'blush')
    nose = ccw(ellipse(0.0, 0.216, 0.0165, 0.0098, 16))
    mp = np.array([[-0.034, 0.1975], [-0.024, 0.1885], [-0.012, 0.1830], [0.0, 0.1815], [0.012, 0.1830], [0.024, 0.1885], [0.034, 0.1975]])
    mouth = ccw(stroke(mp, np.array([0.0036, 0.0050, 0.0056, 0.0057, 0.0056, 0.0050, 0.0036]), ncap=4))
    decal(acc, surf, [(nose, L['nose'])], 0.02, 0.0032, 'nose', dome=lambda V2: 0.003 * np.clip(1 - ((V2[:, 0] / 0.0165) ** 2 + ((V2[:, 1] - 0.216) / 0.0098) ** 2), 0, 1))
    decal(acc, surf, [(mouth, L['mouth'])], 0.02, 0.003, 'mouth')

def _eye_decal(acc, surf, layers, eye, wt, iris, low, L, ic):
    """catchlights, lash and flick first; inside the eye outline: the dark rim / white / warm lower iris / iris"""
    pts, loops = [], []
    polys = [p for p, _ in layers] + [eye, wt, iris, low]
    for poly in polys:
        loops.append(list(range(len(pts), len(pts) + len(poly)))); pts.extend(poly.tolist())
    sp = 0.022
    lo, hi = eye.min(0) - 0.02, eye.max(0) + 0.02
    G = np.array([(x, z) for x in np.arange(lo[0], hi[0], sp) for z in np.arange(lo[1], hi[1], sp)])
    G = G[inside(eye, G)]
    dmin = np.min([dist_to_poly(p, G) for p in polys], axis=0); G = G[dmin > sp * 0.45]
    pts.extend(G.tolist())
    V2, F = cdt(np.array(pts), loops)
    cen = V2[F].mean(1); FC = np.zeros((len(F), 3)); keep = np.zeros(len(F), bool); taken = np.zeros(len(F), bool)
    for poly, col in layers:
        m = inside(poly, cen) & ~taken; FC[m] = col; keep |= m; taken |= m
    ine = inside(eye, cen) & ~taken; inw = inside(wt, cen)
    ini = inside(iris, cen); inl = inside(low, cen)
    FC[ine] = L['eye']
    FC[ine & inw & ~ini] = L['sclera']
    FC[ine & inw & ini & inl] = L['iris_low']
    keep |= ine
    F = F[keep]; FC = FC[keep]
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used)); V2 = V2[used]; F = remap[F]
    P, N = surf.project(V2)
    cx = eye[:, 0].mean()
    rr = np.hypot((V2[:, 0] - cx) / (EYE_A + 0.008), (V2[:, 1] - EYE_Z) / (EYE_B + 0.008))
    off = 0.0028 + 0.0036 * np.clip(1 - rr * rr, 0, 1)             # a gently domed lens
    acc.add(P + N * off[:, None], F, FC, N=N, tag='eyes')

# ================================================================== scene + export
def make_materials():
    m = bpy.data.materials.new('toon'); m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    return [m]

def build_variant(key):
    pal = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    acc = Acc()
    CV, CF, ndome = build_cap(acc, pal)
    BV, BF = build_body(acc, pal)
    surf = Surface(BV, BF if signed_volume(BV, BF) > 0 else BF[:, [0, 2, 1]])
    build_face(acc, surf, pal)
    build_feet(acc, pal)
    ob = acc.to_object('body', mats, (0.0, 0.0, 0.0))
    V, _, F = acc.arrays()
    stats = {'variant': key, 'tris': acc.tris(), 'parts': acc.log, 'dome_tris': ndome, 'cap': dict(CAP_INFO),
             'bbox_min': V.min(0).round(4).tolist(), 'bbox_max': V.max(0).round(4).tolist()}
    return ob, acc, (CV, CF), (BV, BF), stats

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_normals=True,
                              export_lights=False, export_cameras=False, export_animations=False, export_materials='EXPORT',
                              export_texcoords=False, export_tangents=False)

def checks(cap, body):
    """the stem must stay hidden inside the cap above the underside (no stem poking out of the dome), and the cap's
    front lip height (for the 45-deg face read)"""
    CV, CF = cap; BV, BF = body
    t = BVHTree.FromPolygons([tuple(v) for v in CV], [tuple(f) for f in CF])
    out = {}
    hi = BV[BV[:, 2] > 0.30]; outside = 0
    for p in hi:
        # parity of hits along +Z: odd = inside the cap shell, 0 = below the underside (visible stem, fine)
        o = Vector(p); n = 0; d = Vector((0, 0, 1))
        while True:
            loc, nrm, fi, dist = t.ray_cast(o, d)
            if loc is None: break
            n += 1; o = loc + d * 1e-5
        if n == 0: outside += 1                                         # above the cap entirely: exposed
    out['stem_verts_above_cap'] = outside
    # every stem vertex between the rim and the top must be either under the underside or inside the cap: count the
    # stem's upper-ring columns whose highest vertex is NOT inside the cap (a gap would show between stem and cap)
    gaps = 0
    ang = np.arctan2(BV[:, 0], -(BV[:, 1] - BODY_Y))
    for a in np.linspace(-PI, PI, 36, endpoint=False):
        col = BV[np.abs(((ang - a + PI) % TAU) - PI) < 0.09]
        if not len(col): continue
        p = col[np.argmax(col[:, 2])]; o = Vector(p); n = 0; d = Vector((0, 0, 1))
        while True:
            loc, nrm, fi, dist = t.ray_cast(o, d)
            if loc is None: break
            n += 1; o = loc + d * 1e-5
        if n % 2 == 0: gaps += 1
    out['stem_top_columns_not_inside_cap'] = gaps
    front = CV[(np.abs(CV[:, 0]) < 0.02) & (CV[:, 1] < 0)]
    out['cap_front_lowest_z'] = round(float(front[:, 2].min()), 4)
    out['cap_front_most_y'] = round(float(CV[:, 1].min()), 4)
    out['cap_back_lowest_z'] = round(float(CV[(np.abs(CV[:, 0]) < 0.02) & (CV[:, 1] > 0)][:, 2].min()), 4)
    return out

def main():
    only = arg('--variant')
    keys = [only] if only else ['dream', 'orange', 'base']   # base last: its scene is the one saved
    allstats = []
    for key in keys:
        ob, acc, cap, body, st = build_variant(key)
        out = os.path.join(MODELS, VARIANTS[key]['file'] + '.glb')
        export(out); st['glb'] = out
        st['checks'] = checks(cap, body)
        allstats.append(st)
        print('BUILT', json.dumps(st), flush=True)
        if key == 'base':
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'kinoko.blend'), compress=True)
    with open(os.path.join(TASK_DIR, 'build_stats.json' if not only else f'build_stats_{only}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=2)

main()
