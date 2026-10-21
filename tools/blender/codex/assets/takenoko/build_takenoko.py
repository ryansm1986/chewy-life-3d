"""Takenoko (Whispering Bamboo Grove fodder enemy, EN-1): deterministic build of the 'Husk Helmet' design.

Blender 4.3:
  blender --background --factory-startup --python build_takenoko.py [-- --variant base|aotake|golden]

Builds every variant from an empty scene and exports public/models/takenoko.glb, takenoko_aotake.glb and
takenoko_golden.glb, then saves takenoko.blend (the base variant). Units: metres, front = -Y, ground z = 0.

Parts (the enemy contract): two mesh objects, `body` and `mound`, both with their origin at (0, 0, 0), vertex colour
only (a face-corner FLOAT_COLOR attribute `Col`), one material `toon`, no UVs, no rig.

Technique
- Every surface is an analytic map from a 2-D parameter domain to 3-D. The 2-D domain is triangulated with
  mathutils' constrained Delaunay (delaunay_2d_cdt), with every colour border (face patch, eyes, lids, brows, mouth,
  blush, husk marks, leaf midribs, gem glints) given as a constraint loop. So each colour border runs exactly along
  modelled edges, and the colour is assigned per face (face-corner domain).
- Normals are analytic (the core is an elliptic-section surface of revolution), set as custom normals, so nothing
  crumples however irregular the triangulation is.
- Husks and leaves are closed thick shells: a mid-surface offset from the core, with a top and a bottom skin that
  meet on the outline with a round (quarter-circle) edge profile, so edges are thick and rounded, never paper.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.kdtree import KDTree

TASK_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
PI, TAU = math.pi, 2 * math.pi
RNG_SEED = 7

# ================================================================== palette (sRGB hex from the brief)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
COMMON = dict(toe='#ecd6a8', iris='#292125', iris_low='#4a2e24', sclera='#fff6ea', catch='#ffffff', lid='#252333',
              blush='#e98c91', brow='#3a2620', mouth='#3a2620', soil='#7a5a38', soil_dark='#5a4029',
              soil_top='#93714a', soil_rim='#5e452e', hole='#4a3424',
              clod='#a88459', pebble='#b8b0a4')
VARIANTS = {
    'base':   dict(COMMON, husk='#a8743c', mark='#6a4424', face='#fff0c8', curl='#b8cc5a', arm='#9ac050',
                   rib='#b8dc6a', file='takenoko'),
    'aotake': dict(COMMON, husk='#86b04a', mark='#557a2a', face='#f8f6d4', curl='#dcec7a', arm='#b8dc6a',
                   rib='#d8f096', file='takenoko_aotake'),
    'golden': dict(COMMON, husk='#e0a830', mark='#a8601c', face='#fff6d8', curl='#ff7a4a', arm='#ffc04a',
                   rib='#ffe08e', gem='#5ad8e0', glint='#ffffff', file='takenoko_golden', gems=True),
}

# ================================================================== small math
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
    """closed polyline -> n points evenly spaced by arc length"""
    Q = np.vstack([P, P[:1]]); seg = np.linalg.norm(np.diff(Q, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], n, endpoint=False)
    return np.stack([np.interp(s, cum, Q[:, k]) for k in range(Q.shape[1])], -1)
def chaikin(P, it=2):
    for _ in range(it):
        Q = np.roll(P, -1, 0); P = np.stack([0.75 * P + 0.25 * Q, 0.25 * P + 0.75 * Q], 1).reshape(-1, P.shape[1])
    return P
def signed_area(P):
    x, y = P[:, 0], P[:, 1]; return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
def ccw(P): return P if signed_area(P) > 0 else P[::-1].copy()
def inside(poly, pts):
    """even-odd point-in-polygon, vectorised"""
    pts = np.atleast_2d(pts); x, y = pts[:, 0], pts[:, 1]; res = np.zeros(len(pts), bool)
    xi, yi = poly[:, 0], poly[:, 1]; xj, yj = np.roll(xi, 1), np.roll(yi, 1)
    for a, b, c, d in zip(xi, yi, xj, yj):
        cond = ((b > y) != (d > y)) & (x < (c - a) * (y - b) / ((d - b) + 1e-300) + a)
        res ^= cond
    return res
def seg_nearest(poly, pts):
    """distance from pts to a closed polygon, the nearest point and that segment's outward normal (poly is CCW)"""
    A = poly; B = np.roll(poly, -1, 0); AB = B - A
    AP = pts[:, None, :] - A[None]; t = np.clip(np.einsum('nki,ki->nk', AP, AB) / np.maximum(np.einsum('ki,ki->k', AB, AB), 1e-12), 0, 1)
    Q = A[None] + t[..., None] * AB[None]; D = np.linalg.norm(pts[:, None, :] - Q, axis=2)
    k = np.argmin(D, axis=1); idx = np.arange(len(pts))
    segn = nz(np.stack([AB[:, 1], -AB[:, 0]], -1))
    return D[idx, k], Q[idx, k], segn[k]
def vertex_normals_2d(P):
    """outward vertex normals of a CCW closed polygon"""
    a = P - np.roll(P, 1, 0); b = np.roll(P, -1, 0) - P
    na = nz(np.stack([a[:, 1], -a[:, 0]], -1)); nb = nz(np.stack([b[:, 1], -b[:, 0]], -1)); return nz(na + nb)
def offset_loop(P, d, n=None):
    """inward offset of a smooth CCW loop (vertex-normal offset), optionally resampled"""
    Q = P - vertex_normals_2d(P) * d
    return resample_loop(Q, n) if n else Q

def cdt(points, loops):
    """constrained Delaunay of 2-D points with closed constraint loops (lists of indices) -> (V2, F)"""
    edges = []
    for lp in loops:
        for i in range(len(lp)): edges.append((int(lp[i]), int(lp[(i + 1) % len(lp)])))
    res = delaunay_2d_cdt([Vector((float(p[0]), float(p[1]))) for p in points], edges, [], 0, 1e-9, True)
    V = np.array([(v[0], v[1]) for v in res[0]], float); F = np.array([f for f in res[2] if len(f) == 3], int)
    return V, F

# ================================================================== mesh accumulator
class Acc:
    def __init__(self): self.V = []; self.N = []; self.F = []; self.C = []; self.n = 0; self.log = {}
    def add(self, V, N, F, FC, tag='part', shade=None):
        """V (n,3), N (n,3), F (m,3), FC: per-face colour (m,3) linear. Welds coincident vertices, orients faces
        by the normals, drops degenerate and doubled faces. shade(V)->(n,) multiplies the corner colours."""
        V = np.asarray(V, float); N = nz(np.asarray(N, float)); F = np.asarray(F, int); FC = np.asarray(FC, float)
        kd = KDTree(len(V))
        for i, co in enumerate(V): kd.insert(co, i)
        kd.balance(); rep = np.arange(len(V))
        for i, co in enumerate(V):
            for (_, j, _) in kd.find_range(co, 1e-5):
                if j < i: rep[i] = min(rep[i], rep[j])
        first, inv = np.unique(rep, return_inverse=True); inv = inv.reshape(-1); V = V[first]; N = N[first]; F = inv[F]
        ok = (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])
        F, FC = F[ok], FC[ok]
        if FC.ndim == 3: pass
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; fn = np.cross(b - a, c - a); area = np.linalg.norm(fn, axis=1)
        ok = area > 1e-11; F, FC, fn = F[ok], FC[ok], fn[ok]
        flip = np.einsum('ij,ij->i', fn, N[F[:, 0]] + N[F[:, 1]] + N[F[:, 2]]) < 0
        F[flip] = F[flip][:, [0, 2, 1]]
        if FC.ndim == 3: FC = FC.copy(); FC[flip] = FC[flip][:, [0, 2, 1]]
        srt = np.sort(F, axis=1); _, ui, cnt = np.unique(srt, axis=0, return_inverse=True, return_counts=True)
        ok = cnt[ui.reshape(-1)] == 1; F, FC = F[ok], FC[ok]
        sh = shade(V) if shade else np.ones(len(V))
        CC = (FC if FC.ndim == 3 else FC[:, None, :]) * sh[F][..., None]
        self.V.append(V); self.N.append(N); self.F.append(F + self.n); self.C.append(CC); self.n += len(V)
        self.log[tag] = self.log.get(tag, 0) + len(F)
    def tris(self): return sum(len(f) for f in self.F)
    def to_object(self, name, mat):
        V = np.vstack(self.V); N = np.vstack(self.N); F = np.vstack(self.F); C = np.vstack(self.C)
        me = bpy.data.meshes.new(name)
        me.from_pydata(V.tolist(), [], F.tolist()); me.update()
        assert len(me.polygons) == len(F), 'from_pydata dropped faces'
        me.polygons.foreach_set('use_smooth', [True] * len(F))
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        rgba = np.concatenate([C.reshape(-1, 3), np.ones((len(F) * 3, 1))], 1)
        attr.data.foreach_set('color', rgba.astype(np.float32).ravel())
        me.color_attributes.active_color = attr; me.color_attributes.render_color_index = 0
        me.normals_split_custom_set_from_vertices(N.tolist())
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        return ob

# ================================================================== the core (inner body): elliptic-section surface of revolution
AY = 0.86                       # depth / width of the cross-section
CORE_CP = [(0.0, 0.030), (0.13, 0.034), (0.23, 0.052), (0.295, 0.088), (0.330, 0.14), (0.340, 0.20), (0.332, 0.27),
           (0.310, 0.34), (0.288, 0.41), (0.272, 0.48), (0.255, 0.55), (0.232, 0.62), (0.200, 0.69), (0.165, 0.76),
           (0.130, 0.82), (0.090, 0.87), (0.040, 0.905), (0.0, 0.915)]
_P = catmull(CORE_CP, 60); _P[:, 0] = np.maximum(_P[:, 0], 0)
_W = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(_P, axis=0), axis=1))]); WMAX = _W[-1]
_Rw = np.gradient(_P[:, 0], _W); _Zw = np.gradient(_P[:, 1], _W)
def prof(w):
    w = np.asarray(w, float)
    return np.interp(w, _W, _P[:, 0]), np.interp(w, _W, _P[:, 1]), np.interp(w, _W, _Rw), np.interp(w, _W, _Zw)
def w_of_z(z): return np.interp(z, _P[:, 1], _W)
BELLY_BACK = 0.13
BELLY = 0.135   # extra depth factor at the front, z 0.1-0.6 (round 2: the sheet's rounder belly)
def depth_a(phi, z):
    bz = sstep(0.06, 0.24, z) * (1 - sstep(0.44, 0.66, z)); c = np.maximum(np.cos(phi), 0)
    bb = sstep(0.04, 0.22, z) * (1 - sstep(0.46, 0.72, z)); cb = np.minimum(np.cos(phi), 0)   # and a rounder back
    return AY + BELLY * bz * c * c + BELLY_BACK * bb * cb * cb
def core_pt(phi, w):
    phi = np.asarray(phi, float); R, z, _, _ = prof(w)
    return np.stack([R * np.sin(phi), -depth_a(phi, z) * R * np.cos(phi), z], -1)
def core_nrm(phi, w):
    phi = np.asarray(phi, float); w = np.asarray(w, float); R, z, Rw, Zw = prof(w)
    ana = nz(np.stack([np.sin(phi) * Zw, -np.cos(phi) / AY * Zw, -Rw], -1))
    e = 1e-4
    dp = core_pt(phi + e, w) - core_pt(phi - e, w)
    dw = core_pt(phi, np.clip(w + e, 0, WMAX)) - core_pt(phi, np.clip(w - e, 0, WMAX))
    n = np.cross(dp, dw); ln = np.linalg.norm(n, axis=-1, keepdims=True)
    n = n / np.maximum(ln, 1e-12); n = n * np.sign(np.sum(n * ana, -1, keepdims=True) + 1e-12)
    return np.where(ln > 1e-10, n, ana)
def front_to_core(X, Z):
    """front-view coordinates (x, z) on the face -> (phi, w)"""
    w = w_of_z(Z); R = prof(w)[0]; return np.arcsin(np.clip(X / np.maximum(R, 1e-6), -1, 1)), w

# ---------------------------------------------------------------- face features (front-view coordinates, metres)
EYE_CX, EYE_CZ, EYE_A, EYE_B = 0.136, 0.278, 0.060, 0.066
def ellipse(cx, cz, a, b, n, rot=0.0):
    t = np.linspace(0, TAU, n, endpoint=False); x, y = a * np.cos(t), b * np.sin(t)
    c, s = math.cos(rot), math.sin(rot); return np.stack([cx + c * x - s * y, cz + s * x + c * y], -1)
def superellipse(cx, cz, A, Blo, Bup, elo, eup, n):
    t = np.linspace(0, TAU, n, endpoint=False); c, s = np.cos(t), np.sin(t)
    e = np.where(s > 0, eup, elo); B = np.where(s > 0, Bup, Blo)
    return np.stack([cx + A * np.sign(c) * np.abs(c) ** (2 / e), cz + B * np.sign(s) * np.abs(s) ** (2 / e)], -1)
def stroke(path, hw):
    """closed outline of a stroke along an open path with per-point half widths (round ends)"""
    path = np.asarray(path, float); hw = np.broadcast_to(np.asarray(hw, float), (len(path),))
    d = np.gradient(path, axis=0); nrm = nz(np.stack([-d[:, 1], d[:, 0]], -1))
    L = path + nrm * hw[:, None]; R = path - nrm * hw[:, None]
    def cap(p, dirv, r, n=5):
        base = math.atan2(dirv[1], dirv[0]); return [p + r * np.array([math.cos(base + a), math.sin(base + a)]) for a in np.linspace(-PI / 2, PI / 2, n)[1:-1]]
    e1 = nz(path[-1] - path[-2]); e0 = nz(path[0] - path[1])
    pts = list(L) + cap(path[-1], e1, hw[-1])[::-1] + list(R[::-1]) + cap(path[0], e0, hw[0])[::-1]
    return ccw(np.array(pts))

def face_features():
    F = {}
    F['face'] = ccw(superellipse(0, 0.29, 0.25, 0.165, 0.24, 2.4, 2.5, 38))
    for side, sx in (('L', -1), ('R', 1)):
        cx, cz = sx * EYE_CX, EYE_CZ; inner = -sx          # the inner side (toward the nose) is -sx
        def lid_line(X): return cz + 0.047 - 0.30 * (X - cx) * inner   # descends toward the inner corner
        E = ellipse(cx, cz, EYE_A, EYE_B, 28)
        E[:, 1] = np.minimum(E[:, 1], lid_line(E[:, 0]))
        F['eye' + side] = ccw(E)
        F['iris' + side] = ccw(ellipse(cx + 0.006 * inner, cz + 0.004, 0.0525, 0.061, 18))
        F['irislow' + side] = ccw(ellipse(cx + 0.006 * inner, cz - 0.047, 0.036, 0.024, 12))
        F['catch' + side] = ccw(ellipse(cx + 0.014 * inner, cz + 0.020, 0.0175, 0.0185, 10))
        F['catchs' + side] = ccw(ellipse(cx - 0.020 * inner, cz - 0.024, 0.0085, 0.0085, 7))
        # lid band: along the eye's clipped top contour, from the outer corner to the inner, with a small outer flick
        xs = np.linspace(cx - sx * -1 * EYE_A * 1.0, cx - sx * EYE_A * -1.0, 2)  # (placeholder, rebuilt below)
        xo, xi = cx + sx * EYE_A * 0.98, cx - sx * EYE_A * 0.92                  # outer / inner x
        X = np.linspace(xo, xi, 11)
        top = np.minimum(cz + EYE_B * np.sqrt(np.clip(1 - ((X - cx) / EYE_A) ** 2, 0, 1)), lid_line(X))
        u = np.linspace(0, 1, 11); thick = 0.019 * np.sin(np.clip(u, 0.0, 1) * PI) ** 0.4 + 0.005
        up = np.stack([X, top + thick], -1); dn = np.stack([X, top - 0.008], -1)
        F['lid' + side] = ccw(np.vstack([up, dn[::-1]]))
        # brow: a thick bar, inner end low (angry)
        bi = np.array([cx + inner * 0.046, cz + 0.060]); bo = np.array([cx - inner * 0.050, cz + 0.099])
        tt = np.linspace(0, 1, 6)[:, None]; path = bi * (1 - tt) + bo * tt
        path[:, 1] += 0.006 * np.sin(tt[:, 0] * PI)
        F['brow' + side] = stroke(path, 0.0175 - 0.006 * tt[:, 0])
        F['blush' + side] = ccw(ellipse(sx * 0.196, 0.194, 0.038, 0.023, 12))
    tt = np.linspace(-1, 1, 7); path = np.stack([tt * 0.033, 0.216 + 0.013 * (1 - tt ** 2) ** 0.8], -1)
    F['mouth'] = stroke(path, 0.0068)
    return F

# ---------------------------------------------------------------- the core mesh
def build_core(acc, pal):
    F = face_features()
    K = 0.30  # domain x scale: x = phi*K (metre-ish), y = w
    pts, loops = [], []
    def add_loop(P2):
        i0 = len(pts); pts.extend(P2.tolist()); loops.append(list(range(i0, i0 + len(P2))))
    # rings
    w_lo, w_hi = 0.035, WMAX - 0.03
    ws = [w_lo]
    while ws[-1] < w_hi:
        z = prof(ws[-1])[1]; ws.append(ws[-1] + (0.068 if z < 0.47 else 0.10))
    ws[-1] = w_hi; ws = np.array(ws)
    feat_pts = np.vstack([v for v in F.values()])
    ring_idx = []
    for i, w in enumerate(ws):
        R, z, _, _ = prof(w)
        h = 0.085 if z < 0.47 else 0.11
        hb = h if z < 0.26 else 0.14           # behind |phi| > 1.3 the husks cover the core from z 0.26 up
        Rr = max(R * 0.93, 1e-3)
        nf = max(2, int(round(2 * 1.3 * Rr / h))); nbk = max(2, int(round(2 * (PI - 1.3) * Rr / hb)))
        if TAU * Rr / h < 10: nf, nbk = 4, 4
        front = np.linspace(-1.3, 1.3, nf + 1)
        back = np.linspace(1.3, TAU - 1.3, nbk + 1)[1:-1]; back = np.where(back > PI, back - TAU, back)
        phis = np.sort(np.concatenate([[-PI], front, back, [PI]]))
        phis = np.unique(np.round(phis, 9))
        if 0 < i < len(ws) - 1 and i % 2: phis[1:-1] += 0.5 * np.diff(phis)[:-1] * 0.999   # stagger the rings
        P2 = np.stack([phis * K, np.full_like(phis, w)], -1)
        keep = np.ones(len(phis), bool)
        if z < 0.6:   # drop grid points that crowd the feature borders
            X = R * np.sin(phis); Zf = np.full_like(phis, z); front = np.abs(phis) < 1.3
            d = np.min(np.linalg.norm(np.stack([X, Zf], -1)[:, None] - feat_pts[None], axis=2), axis=1)
            keep &= ~(front & (d < 0.0085))
        keep[0] = keep[-1] = True
        i0 = len(pts); pts.extend(P2[keep].tolist()); ring_idx.append(list(range(i0, i0 + int(keep.sum()))))
    # eye interior points (for the dome)
    extra = []
    for sx in (-1, 1):
        for rho, n in ((0.0, 1), (0.55, 6)):
            e = ellipse(sx * EYE_CX, EYE_CZ, EYE_A * rho, EYE_B * rho, n) if rho else np.array([[sx * EYE_CX, EYE_CZ]])
            extra.append(e)
    extra = np.vstack(extra); ph, ww = front_to_core(extra[:, 0], extra[:, 1]); pts.extend(np.stack([ph * K, ww], -1).tolist())
    # feature loops
    for name, P in F.items():
        ph, ww = front_to_core(P[:, 0], P[:, 1]); add_loop(np.stack([ph * K, ww], -1))
    # domain border constraints: bottom ring, top ring, seams
    border = ring_idx[0] + [r[-1] for r in ring_idx[1:]] + ring_idx[-1][::-1][1:] + [r[0] for r in ring_idx[::-1][1:-1]]
    loops.append(border)
    V2, T = cdt(np.array(pts), loops)
    phi, w = V2[:, 0] / K, V2[:, 1]
    # map + eye dome
    P = core_pt(phi, w); N = core_nrm(phi, w)
    R, z, _, _ = prof(w); X = R * np.sin(phi)
    disp = np.zeros(len(P))
    for sx in (-1, 1):
        rho2 = ((X - sx * EYE_CX) / EYE_A) ** 2 + ((z - EYE_CZ) / EYE_B) ** 2
        disp += np.where((rho2 < 1) & (np.abs(phi) < 1.2), 0.0065 * np.clip(1 - rho2, 0, 1) ** 2, 0)
    def mapped(ph_, w_):
        R_, z_, _, _ = prof(w_); X_ = R_ * np.sin(ph_); d_ = np.zeros(np.shape(ph_))
        for sx in (-1, 1):
            r2 = ((X_ - sx * EYE_CX) / EYE_A) ** 2 + ((z_ - EYE_CZ) / EYE_B) ** 2
            d_ += np.where((r2 < 1) & (np.abs(ph_) < 1.2), 0.0065 * np.clip(1 - r2, 0, 1) ** 2, 0)
        return core_pt(ph_, w_) + core_nrm(ph_, w_) * d_[..., None]
    sel = disp > 0
    if sel.any():
        e = 1e-4; a, b = phi[sel], w[sel]
        dphi = mapped(a + e, b) - mapped(a - e, b); dw = mapped(a, b + e) - mapped(a, b - e)
        nn = nz(np.cross(dphi, dw)); nn *= np.sign(np.einsum('ij,ij->i', nn, N[sel]))[:, None]; N[sel] = nn
    P = P + N * disp[:, None] * 0 + core_nrm(phi, w) * disp[:, None]
    # pole fans
    Vb = core_pt(np.array([0.0]), np.array([0.0])); Vt = core_pt(np.array([0.0]), np.array([WMAX]))
    nb = np.array([[0, 0, -1.0]]); ntp = np.array([[0, 0, 1.0]])
    def ring_pts(ri):
        q = np.array(pts)[ri]; return core_pt(q[:, 0] / K, q[:, 1])
    # classify faces
    cen = (V2[T[:, 0]] + V2[T[:, 1]] + V2[T[:, 2]]) / 3; cphi, cw = cen[:, 0] / K, cen[:, 1]
    cR, cz, _, _ = prof(cw); cX = cR * np.sin(cphi); fr = np.abs(cphi) < 1.25
    q = np.stack([cX, cz], -1)
    body = lin(pal['husk']) * 0.9
    FC = np.tile(body, (len(T), 1))
    def paint(mask, colour): FC[mask & fr] = lin(colour) if isinstance(colour, str) else colour
    paint(inside(F['face'], q), pal['face'])
    for s in 'LR':
        paint(inside(F['blush' + s], q), pal['blush'])
        paint(inside(F['brow' + s], q), pal['brow'])
        eye = inside(F['eye' + s], q)
        paint(eye, pal['sclera'])
        iris = eye & inside(F['iris' + s], q); paint(iris, pal['iris'])
        paint(iris & inside(F['irislow' + s], q), pal['iris_low'])
        paint(eye & (inside(F['catch' + s], q) | inside(F['catchs' + s], q)), pal['catch'])
        paint(inside(F['lid' + s], q), pal['lid'])
    paint(inside(F['mouth'], q), pal['mouth'])
    shade = lambda V: 0.86 + 0.14 * sstep(0.02, 0.2, V[:, 2])
    # the two pole caps (fans), in the same mesh so they weld
    PA = np.array(pts); Vs, Ns, Fs = [P], [N], [T]; n0 = len(P)
    for ri, pole, pn in ((ring_idx[0], Vb, nb), (ring_idx[-1], Vt, ntp)):
        q = PA[ri]; ring = core_pt(q[:, 0] / K, q[:, 1]); rn = core_nrm(q[:, 0] / K, q[:, 1])
        Vs += [pole, ring]; Ns += [pn, rn]
        Fs.append(np.array([[n0, n0 + i + 1, n0 + i + 2] for i in range(len(ring) - 1)])); n0 += 1 + len(ring)
        FC = np.vstack([FC, np.tile(body, (len(ring) - 1, 1))])
    acc.add(np.vstack(Vs), np.vstack(Ns), np.vstack(Fs), FC, 'core', shade)
    return F

# ================================================================== thick shells (husk plates, leaves)
def shell(acc, mid, outline, t0, bulge, regions, base_col, under_col, n_ring1=None, n_ring2=None, interior=0.055,
          taper=None, tag='shell', shade=None, bottom_ring1=True):
    """A closed thick shell over a 2-D outline (CCW, metres) on a mid-surface mid(s, t) -> (n,3), whose normal side
    (the 'top') is chosen by the caller's mid(). t0: edge radius = half thickness, bulge: extra centre thickness.
    regions: [(polygon, colour)] painted on the top (later wins). taper(s,t) -> thickness factor (hidden bases)."""
    B = ccw(outline); nb = len(B)
    r1 = offset_loop(B, t0 * 0.33, n_ring1 or nb); r2 = offset_loop(B, t0, n_ring2 or max(8, int(nb * 0.75)))
    r1 = resample_loop(r1, n_ring1) if n_ring1 else r1
    lo, hi = B.min(0), B.max(0); gx = np.arange(lo[0] + interior / 2, hi[0], interior); gy = np.arange(lo[1] + interior / 2, hi[1], interior)
    G = np.array([(x, y) for y in gy for x in (gx + (interior / 2 if int(round((y - gy[0]) / interior)) % 2 else 0))]) if len(gx) and len(gy) else np.zeros((0, 2))
    if len(G):
        d, _, _ = seg_nearest(B, G); G = G[inside(B, G) & (d > t0 * 1.9)]
        for poly, _ in regions:
            if len(G): dd, _, _ = seg_nearest(poly, G); G = G[dd > 0.012]
    if not len(G): G = B.mean(0, keepdims=True)
    def skin(top):
        rings = (B, r1, r2) if (top or bottom_ring1) else (B, r2)
        pts = list(rings) + [G]; loops = []; i = 0
        for L in rings:
            loops.append(list(range(i, i + len(L)))); i += len(L)
        i += len(G)
        if top:
            for poly, _ in regions:
                pts.append(poly); loops.append(list(range(i, i + len(poly)))); i += len(poly)
        P2 = np.vstack(pts); V2, T = cdt(P2, loops)
        cen = (V2[T[:, 0]] + V2[T[:, 1]] + V2[T[:, 2]]) / 3; T = T[inside(B, cen)]
        cen = (V2[T[:, 0]] + V2[T[:, 1]] + V2[T[:, 2]]) / 3
        s, t = V2[:, 0], V2[:, 1]
        M = mid(s, t); e = 1e-4
        Ms = (mid(s + e, t) - mid(s - e, t)) / (2 * e); Mt = (mid(s, t + e) - mid(s, t - e)) / (2 * e)
        nM = nz(np.cross(Ms, Mt))
        d, Q, segn = seg_nearest(B, V2)
        b2 = nz(np.where((d > 1e-6)[:, None], Q - V2, segn))
        onB = d < 1e-6
        if onB.any():   # boundary vertices: the polygon's vertex normal (smooth across corners)
            vn = vertex_normals_2d(B); k = np.argmin(np.linalg.norm(V2[onB][:, None] - B[None], axis=2), axis=1)
            near = np.linalg.norm(V2[onB] - B[k], axis=1) < 1e-6; tmp = b2[onB]; tmp[near] = vn[k][near]; b2[onB] = tmp
        b3 = nz(Ms * b2[:, :1] + Mt * b2[:, 1:]); b3 = nz(b3 - nM * np.einsum('ij,ij->i', b3, nM)[:, None])
        x = (t0 - np.minimum(d, t0)) / t0; y = np.sqrt(np.clip(1 - x * x, 0, 1))
        h = t0 * y + bulge * sstep(t0, t0 + 0.05, d)
        if taper is not None: h = h * taper(s, t)
        sg = 1 if top else -1
        P = M + sg * nM * h[:, None]
        N = nz(b3 * x[:, None] + sg * nM * y[:, None])
        if top:
            FC = np.tile(base_col, (len(T), 1))
            for poly, col in regions: FC[inside(poly, cen)] = col
        else:
            FC = np.tile(under_col, (len(T), 1))
        return P, N, T, FC
    Pa, Na, Ta, Ca = skin(True); Pb, Nb, Tb, Cb = skin(False)
    if os.environ.get('TK_DEBUG'): print('SHELL', tag, len(Ta), len(Tb), len(B), len(r1), len(r2), len(G), [len(p_) for p_, _ in regions])
    acc.add(np.vstack([Pa, Pb]), np.vstack([Na, Nb]), np.vstack([Ta, Tb + len(Pa)]), np.vstack([Ca, Cb]), tag, shade)

def teardrop(cx, cy, h, w, n=12):
    th = np.linspace(0, TAU, n, endpoint=False)
    x = np.sin(th) * np.abs(np.sin(th / 2)) ** 0.9; y = np.cos(th)
    x = x / np.max(np.abs(x)) * w / 2
    return ccw(np.stack([cx + x, cy + y * h / 2], -1))

# ---------------------------------------------------------------- husk plates
# phi (deg, 0 = front, + toward +X), zb (bottom of the centre line), L (length along the body), W (half width),
# off (mid-surface offset from the core at the base), lift (extra at the tip), flare (extra at the bottom edge),
# tilt (the bottom edge rises by this toward the front), dip (bottom corners above the centre: a V), tf (base
# thickness factor for bases tucked under the row below)
SH_D = 0.066   # shingles: the bottom edge stands this much prouder than the tucked tip
def plates_def():
    P = []
    def add(row, phi, zb, L, W, off, lift=0.035, flare=0.0, tilt=0.0, dip=0.0, tf=1.0, mark=1.0, lean=0.0,
            shingle=False, gem=False):
        P.append(dict(row=row, phi=math.radians(phi), zb=zb, L=L, W=W, off=off, lift=lift, flare=flare, tilt=tilt,
                      dip=dip, tf=tf, mark=mark, lean=math.radians(lean), shingle=shingle, gem=gem))
    # FRONT (locked in round 1): the two helmet corners, the diamond over the face, the upper pair, the top front
    # husk; pine-cone layered (lower rows outside), tips lifted
    for s in (-1, 1): add(1, s * 55, 0.320, 0.305, 0.200, 0.040, lift=0.05, flare=0.020, tilt=0.13, lean=s * 6)
    add(2, 0, 0.420, 0.315, 0.175, 0.034, lift=0.045, flare=0.012, dip=0.040, gem=True)
    for s in (-1, 1): add(3, s * 42, 0.555, 0.275, 0.170, 0.018, lift=0.04, tf=0.6)
    add(4, 0, 0.660, 0.265, 0.225, 0.008, lift=0.03, tf=0.6, mark=0.9)
    # SIDES + BACK (round 2): roof-tile shingles, each row's lower edge lying on the row below, tips tucked under
    # the row above; a clear column of four husks down the back, one teardrop each
    # (each lower edge dips to a soft V in the middle, like the front diamond, so the tiers read as husks, not bands;
    # the bottom row only hugs the body: there is nothing below it to lie on)
    for s in (-1, 1): add(1, s * 122, 0.100, 0.360, 0.250, 0.004, shingle=True, dip=0.05, flare=-0.032)
    add(1, 180, 0.075, 0.365, 0.285, -0.002, shingle=True, dip=0.06, flare=-0.032)
    for s in (-1, 1): add(2, s * 125, 0.280, 0.350, 0.205, 0.004, shingle=True, gem=True, dip=0.06)
    add(2, 180, 0.270, 0.360, 0.255, -0.002, shingle=True, dip=0.07)
    for s in (-1, 1): add(3, s * 116, 0.470, 0.300, 0.175, 0.004, shingle=True, dip=0.05)
    add(3, 180, 0.460, 0.310, 0.225, -0.002, shingle=True, dip=0.06)
    add(4, 180, 0.630, 0.280, 0.205, -0.002, shingle=True, mark=0.9, dip=0.04)
    return P

def plate_outline(pl, nb=16):
    W, L, dip, tilt = pl['W'], pl['L'], pl['dip'], pl['tilt']
    inner = -1 if pl['phi'] > 0 else 1   # s-direction toward the front
    def bt(s):  # bottom-edge t at lateral position s
        return dip * (abs(s) / W) ** 1.3 + (tilt * (0.5 + 0.5 * inner * s / W) if tilt else 0)
    # a pentagon panel (the sheet's husks: straight edges, a soft point), corners rounded by a small radius
    poly = ccw(np.array([(0, bt(0)), (W, bt(W)), (0.86 * W, 0.46 * L), (0, L), (-0.86 * W, 0.46 * L), (-W, bt(-W))]))
    return rounded_poly(poly, [0.03, 0.03, 0.045, 0.028, 0.045, 0.03])

def rounded_poly(P, radii, long_edge=0.21):
    out = []; n = len(P)
    for i in range(n):
        a, c, b = P[i - 1], P[i], P[(i + 1) % n]; r = radii[i % len(radii)]
        ra = min(r, 0.4 * np.linalg.norm(a - c)); rb = min(r, 0.4 * np.linalg.norm(b - c))
        p1 = c + nz(a - c) * ra; p2 = c + nz(b - c) * rb
        out += [p1, p2]
        nxt = P[(i + 1) % n]
        if np.linalg.norm(nxt - c) > long_edge: out.append(0.5 * (c + nxt))
    return ccw(np.array(out))

def plate_mid_fn(pl):
    k = math.sqrt(math.sin(pl['phi']) ** 2 + (AY * math.cos(pl['phi'])) ** 2)
    wb = float(w_of_z(pl['zb'])); L = pl['L']; inner = -1 if pl['phi'] > 0 else 1
    def mid(s, t):
        s = np.asarray(s, float); t = np.asarray(t, float)
        w = np.clip(wb + t, 0.01, WMAX - 0.004)
        R = prof(w)[0]
        u = np.clip(t / L, 0, 1)
        fw = 0.35 + 0.65 * (0.5 + 0.5 * np.clip(inner * s / pl['W'], -1, 1)) if pl['tilt'] else 1.0   # the brim: flare most at the front corner
        if pl['shingle']:   # the lower edge proud, the tip tucked in, a slight lift only at the very end
            off = pl['off'] + (SH_D + pl['flare']) * (1 - u) + 0.008 * sstep(0.86, 1.0, u)
        else:
            off = pl['off'] + pl['lift'] * u ** 1.6 + pl['flare'] * fw * np.clip(1 - t / (0.32 * L), 0, 1) ** 2
        off = off + 0.010 * (s / pl['W']) ** 2 * (1 - u)          # the side edges lift a little (cupped)
        phi = pl['phi'] + pl['lean'] * u + s / np.maximum((R + off) * k, 0.04)
        return core_pt(phi, w) + core_nrm(phi, w) * off[..., None]
    return mid

def build_plates(acc, pal, gem_plates=()):
    husk = lin(pal['husk']); mark = lin(pal['mark'])
    rng = np.random.default_rng(RNG_SEED)
    gems = []
    for i, pl in enumerate(plates_def()):
        B = plate_outline(pl)
        L = pl['L']; tmin = B[:, 1].min()
        regions = []
        has_gem = gem_plates and pl['gem']
        mc = 0.47 if not pl['shingle'] else 0.37    # shingles: the mark sits on the part the row above leaves bare
        if pl['mark'] and not has_gem:
            mh = (min(0.47 * (L - tmin), 0.15) if not pl['shingle'] else min(0.42 * (L - tmin), 0.145)) * pl['mark']; mw = mh * 0.52
            regions.append((teardrop(0, tmin + (L - tmin) * mc, mh, mw, 7), mark))
        tint = 1 + rng.uniform(-0.035, 0.035)
        tf = pl['tf']
        if pl['shingle']:   # full thickness at the visible lower edge, thin where the row above covers it
            taper = lambda s, t, L=L: 1 - 0.6 * sstep(0.35 * L, L, t)
        else:
            taper = (lambda s, t, tf=tf, L=L: tf + (1 - tf) * sstep(0.0, 0.42 * L, t)) if tf < 1 else None
        shade = lambda V: 0.9 + 0.1 * sstep(0.15, 0.8, V[:, 2])
        mid = plate_mid_fn(pl)
        shell(acc, mid, B, 0.017, 0.004, regions, husk * tint, husk * 0.78, n_ring1=10, n_ring2=7, interior=0.09, taper=taper, tag='plates', shade=shade, bottom_ring1=False)
        if has_gem: gems.append((mid, (0.0, tmin + (L - tmin) * mc), pl))
    return gems

# ---------------------------------------------------------------- golden: cabochon gems on three plates
def build_gem(acc, pal, mid, c2, pl):
    s0, t0_ = c2; e = 1e-4
    M0 = mid(np.array([s0]), np.array([t0_]))[0]
    Ms = (mid(np.array([s0 + e]), np.array([t0_]))[0] - mid(np.array([s0 - e]), np.array([t0_]))[0]) / (2 * e)
    Mt = (mid(np.array([s0]), np.array([t0_ + e]))[0] - mid(np.array([s0]), np.array([t0_ - e]))[0]) / (2 * e)
    n0 = nz(np.cross(Ms, Mt)); es = nz(Ms); et = nz(np.cross(n0, es))
    base = M0 + n0 * 0.019   # the plate's top surface (t0 + bulge)
    a, b = 0.034, 0.046
    th = np.linspace(0, TAU, 10, endpoint=False)
    def rhomb(r):
        c, s = np.cos(th), np.sin(th); return np.stack([a * r * np.sign(c) * np.abs(c) ** 1.4, b * r * np.sign(s) * np.abs(s) ** 1.4], -1)
    B = ccw(rhomb(1.0)); rings = [rhomb(rr) for rr in (0.88, 0.5)]
    glint = ccw(ellipse(-0.010, 0.014, 0.0085, 0.012, 7, rot=0.5))
    pts = np.vstack([B] + rings + [np.zeros((1, 2)), glint]); loops = [list(range(len(B)))]
    gi = len(pts) - len(glint); loops.append(list(range(gi, len(pts))))
    V2, T = cdt(pts, loops)
    def height(q):
        rho = np.clip(np.maximum(np.abs(q[:, 0] / a) ** (2 / 1.4) + np.abs(q[:, 1] / b) ** (2 / 1.4), 0) ** (1.4 / 2), 0, 1.2)
        return np.where(rho < 0.9, 0.016 * (1 - (rho / 0.9) ** 2) ** 0.55 + 0.002, 0.002 - 0.008 * (rho - 0.9) / 0.1)
    h = height(V2)
    P = base + es * V2[:, :1] + et * V2[:, 1:] + n0 * h[:, None]
    e2 = 1e-4
    hx = (height(V2 + [e2, 0]) - height(V2 - [e2, 0])) / (2 * e2); hy = (height(V2 + [0, e2]) - height(V2 - [0, e2])) / (2 * e2)
    N = nz(n0[None] - hx[:, None] * es[None] - hy[:, None] * et[None])
    cen = (V2[T[:, 0]] + V2[T[:, 1]] + V2[T[:, 2]]) / 3
    FC = np.tile(lin(pal['gem']), (len(T), 1)); FC[inside(glint, cen)] = lin(pal['glint'])
    FC[np.linalg.norm(cen / [a, b], axis=1) > 0.93] = lin(pal['gem']) * 0.8
    # close it underneath (a flat back inside the plate)
    back = np.vstack([base - n0 * 0.006]); nbk = len(V2)
    ring_ids = [i for i in range(len(V2)) if np.min(np.linalg.norm(B - V2[i], axis=1)) < 1e-7]
    ring_ids.sort(key=lambda i: math.atan2(V2[i, 1], V2[i, 0]))
    Fb = [[nbk, ring_ids[(k + 1) % len(ring_ids)], ring_ids[k]] for k in range(len(ring_ids))]
    acc.add(np.vstack([P, back]), np.vstack([N, -n0[None]]), np.vstack([T, Fb]),
            np.vstack([FC, np.tile(lin(pal['gem']) * 0.6, (len(Fb), 1))]), 'gems')

# ================================================================== generic smooth primitives
def ellipsoid(acc, c, R, abc, col, nu=10, nv=6, squash_low=1.0, tag='blob', colf=None):
    """ellipsoid at c with local axes R (3x3 columns) and semi-axes abc; lower half squashed by squash_low."""
    a, b, cc = abc; V, N = [], []
    for j in range(nv + 1):
        th = -PI / 2 + PI * j / nv
        for i in range(nu):
            ph = TAU * i / nu
            x, y, z = math.cos(th) * math.cos(ph), math.cos(th) * math.sin(ph), math.sin(th)
            cz_ = cc if z >= 0 else cc * squash_low
            p = np.array([a * x, b * y, cz_ * z]); n = np.array([x / a, y / b, z / cz_])
            V.append(np.asarray(c) + R @ p); N.append(R @ n)
    F = []
    for j in range(nv):
        for i in range(nu):
            a0 = j * nu + i; a1 = j * nu + (i + 1) % nu; b0 = a0 + nu; b1 = a1 + nu
            F += [[a0, a1, b1], [a0, b1, b0]]
    V, N, F = np.array(V), np.array(N), np.array(F)
    FC = np.tile(col, (len(F), 1)) if colf is None else colf(V, F)
    acc.add(V, N, F, FC, tag)

def tube(acc, path, radii, col, sides=9, tag='tube', cap_end=True, colf=None):
    """a smooth tube along a polyline with per-point radii; rounded end (hemisphere) and a closed start"""
    path = np.asarray(path, float); radii = np.asarray(radii, float)
    T = nz(np.gradient(path, axis=0)); up = np.array([0, 0, 1.0]) if abs(T[0, 2]) < 0.9 else np.array([1.0, 0, 0])
    Nf = [nz(np.cross(np.cross(T[0], up), T[0]))]
    for k in range(1, len(path)):   # parallel transport
        n = Nf[-1] - T[k] * np.dot(Nf[-1], T[k]); Nf.append(nz(n))
    Nf = np.array(Nf); Bf = np.cross(T, Nf)
    V, N = [], []
    for k in range(len(path)):
        for i in range(sides):
            a = TAU * i / sides; d = math.cos(a) * Nf[k] + math.sin(a) * Bf[k]
            V.append(path[k] + d * radii[k]); N.append(d)
    F = []
    for k in range(len(path) - 1):
        for i in range(sides):
            a0 = k * sides + i; a1 = k * sides + (i + 1) % sides; F += [[a0, a1, a1 + sides], [a0, a1 + sides, a0 + sides]]
    # end cap: hemisphere rings
    base = (len(path) - 1) * sides; rE = radii[-1]
    for j, ang in enumerate((0.5, 1.0), start=1):
        for i in range(sides):
            a = TAU * i / sides; d = math.cos(a) * Nf[-1] + math.sin(a) * Bf[-1]
            dd = nz(d * math.cos(ang) + T[-1] * math.sin(ang))
            V.append(path[-1] + dd * rE); N.append(dd)
        r0 = base + (j - 1) * sides; r1 = base + j * sides
        for i in range(sides):
            a0 = r0 + i; a1 = r0 + (i + 1) % sides; F += [[a0, a1, r1 + (i + 1) % sides], [a0, r1 + (i + 1) % sides, r1 + i]]
    tip = len(V); V.append(path[-1] + T[-1] * rE); N.append(T[-1])
    r1 = base + 2 * sides
    for i in range(sides): F.append([r1 + i, r1 + (i + 1) % sides, tip])
    st = len(V); V.append(path[0] - T[0] * radii[0] * 0.3); N.append(-T[0])
    for i in range(sides): F.append([st, (i + 1) % sides, i])
    V, N, F = np.array(V), np.array(N), np.array(F)
    FC = np.tile(col, (len(F), 1)) if colf is None else colf(V, F)
    acc.add(V, N, F, FC, tag)

def frame_from(z_axis, x_hint):
    z = nz(np.asarray(z_axis, float)); x = nz(np.asarray(x_hint, float) - z * np.dot(x_hint, z)); y = np.cross(z, x)
    return np.stack([x, y, z], 1)

# ================================================================== arms, toes, curl
ARM_ANGLE = math.radians(31)   # from vertical, down and out
def build_arms(acc, pal):
    arm, rib = lin(pal['arm']), lin(pal['rib'])
    for sx in (-1, 1):
        phi = sx * math.radians(88); zk = 0.295; wk = float(w_of_z(zk))
        cp = core_pt(np.array([phi]), np.array([wk]))[0]; cn = core_nrm(np.array([phi]), np.array([wk]))[0]
        knob_c = cp + cn * 0.012
        ellipsoid(acc, knob_c, frame_from(cn, [0, 0, 1]), (0.058, 0.058, 0.036), arm * 0.84, nu=9, nv=3, tag='arms')
        # the leaf: along d (down and out, a touch forward), its broad face turned 45 deg toward the front
        d = nz(np.array([sx * math.sin(ARM_ANGLE), -0.06, -math.cos(ARM_ANGLE)]))
        face_n = nz(np.array([sx * 0.55, -0.83, 0.0])); face_n = nz(face_n - d * np.dot(face_n, d))
        wv = np.cross(d, face_n)
        o = knob_c + cn * 0.026 + d * 0.0
        L, W = 0.33, 0.064
        def mid(s, t, o=o, d=d, wv=wv, fn=face_n):
            s = np.asarray(s, float); t = np.asarray(t, float); u = np.clip(t / L, 0, 1)
            bend = 0.035 * u ** 2 - 0.9 * s ** 2             # the tip bends forward-out, the blade cups a little
            return o[None] + d[None] * t[..., None] + wv[None] * s[..., None] + fn[None] * bend[..., None]
        t = np.linspace(0, 1, 40)
        u = t ** 0.85; hw = W * np.sin(PI * u) ** 0.8
        hw[0] = 0; right = np.stack([hw, t * L], -1); left = np.stack([-hw, t * L], -1)[::-1]
        B = np.vstack([right[1:-1], [[0, L]], left[1:-1], [[0, 0.0]]])
        B = ccw(resample_loop(chaikin(ccw(B), 2), 12))
        tr = np.linspace(0.06, 0.84, 6)
        ribw = 0.0125 * (1 - tr) + 0.004
        ribpoly = ccw(np.vstack([np.stack([ribw, tr * L], -1), np.stack([-ribw, tr * L], -1)[::-1]]))
        shell(acc, mid, B, 0.015, 0.005, [(ribpoly, rib)], arm, arm * 0.8, n_ring2=10, interior=0.06, tag='arms', bottom_ring1=False)

def build_toes(acc, pal):
    toe = lin(pal['toe'])
    for ang, r, size in ((-24, 0.205, 1.0), (24, 0.205, 1.0), (-100, 0.235, 0.84), (100, 0.235, 0.84)):
        a = math.radians(ang); dirv = np.array([math.sin(a), -AY * math.cos(a), 0]); dirv = nz(dirv)
        c = dirv * r
        sa, sb, sc = 0.088 * size, 0.074 * size, 0.056 * size
        c = np.array([c[0], c[1], sc * 0.62])
        R = frame_from([0, 0, 1], dirv)   # x along the radial direction
        ellipsoid(acc, c, R, (sa, sb, sc), toe, nu=8, nv=4, squash_low=0.62, tag='toes')

def curl_path(base, top_dir, scale=1.0, n_per=2):
    """the curled tip: up, then hooking over toward +X and a little to the front (the sheet's front + side views)"""
    hd = nz(np.array([1.0, -0.62, 0]))
    cp = np.array([[0, 0, 0], [0.0, 0, 0.07], [0.008, 0, 0.125], [0.04, 0, 0.165], [0.085, 0, 0.17], [0.112, 0, 0.14], [0.116, 0, 0.11]])
    out = np.zeros_like(cp); out[:, 2] = cp[:, 2]; out[:, 0] = cp[:, 0] * hd[0]; out[:, 1] = cp[:, 0] * hd[1]
    P = catmull(out * scale, n_per)
    return P + np.asarray(base)

def build_curl(acc, pal):
    P = curl_path([0, 0, 0.84], None, 1.1)
    P = np.vstack([P[:1], P[1:]])
    r = np.interp(np.linspace(0, 1, len(P)), [0, 0.3, 0.7, 1], [0.056, 0.048, 0.036, 0.027])
    curl = lin(pal['curl'])
    tube(acc, P, r, curl, sides=7, tag='curl', colf=lambda V, F: np.tile(curl, (len(F), 1)) * (0.92 + 0.08 * sstep(0.85, 1.0, V[F].mean(1)[:, 2]))[:, None])

# ================================================================== mound
def vnormals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); Nn = np.zeros_like(V)
    for k in range(3): np.add.at(Nn, F[:, k], fn)
    return nz(Nn)

MOUND_PROF = np.array([(0.450, 0.000), (0.418, 0.070), (0.345, 0.148), (0.262, 0.205), (0.188, 0.240),
                       (0.132, 0.246), (0.100, 0.215), (0.082, 0.150)])
MOUND_LIP = 6   # profile rows from here on are inside the hole
def mound_noise(ph):
    nr = 1 + 0.040 * np.sin(3 * ph + 1.0) + 0.026 * np.sin(5 * ph + 2.3) + 0.012 * np.sin(7 * ph + 0.4)
    nzz = 0.014 * np.sin(4 * ph + 0.7) + 0.008 * np.sin(6 * ph + 1.9)
    return nr, nzz
def mound_surface(x, y):
    """height of the soil dome at (x, y) (for sinking the clods)"""
    r = math.hypot(x, y); ph = math.atan2(y, x); nr, nzz = mound_noise(np.array([ph]))
    r0 = r / float(nr[0]); z = float(np.interp(-r0, -MOUND_PROF[:MOUND_LIP, 0], MOUND_PROF[:MOUND_LIP, 1]))
    return z + float(nzz[0]) * z / 0.25

def build_mound(acc, pal, rng):
    """a soft lumpy soil dome (24 around), a warm lighter top, a darker rim at the ground, a soft dark hole"""
    soil, top, rim, hole = lin(pal['soil']), lin(pal['soil_top']), lin(pal['soil_rim']), lin(pal['hole'])
    clod, peb = lin(pal['clod']), lin(pal['pebble'])
    seg = 24
    ph = TAU * (np.arange(seg) + 0.5) / seg
    nr, nzz = mound_noise(ph)
    rows = []
    for j, (r, z) in enumerate(MOUND_PROF):
        k = 1.0 if j < MOUND_LIP else 0.5
        rr = r * (1 + (nr - 1) * k); zz = z + nzz * (z / 0.25) * (1.0 if j < MOUND_LIP else 0.6)
        rows.append(np.stack([rr * np.cos(ph), rr * np.sin(ph), zz], -1))
    V = np.vstack(rows); F = []; nr_ = len(rows)
    for j in range(nr_ - 1):
        for i in range(seg):
            a0 = j * seg + i; a1 = j * seg + (i + 1) % seg; F += [[a0, a1 + seg, a1], [a0, a0 + seg, a1 + seg]]
    c_top = len(V); V = np.vstack([V, [[0, 0, 0.13]]])
    for i in range(seg): F.append([(nr_ - 1) * seg + i, c_top, (nr_ - 1) * seg + (i + 1) % seg])
    c_bot = len(V); V = np.vstack([V, [[0, 0, 0.0]]])
    for i in range(seg): F.append([i, (i + 1) % seg, c_bot])
    F = np.array(F)
    N = vnormals(V, F)
    ref = nz(V * [1, 1, 0] + [0, 0, 0.12])
    if np.sum(np.einsum('ij,ij->i', N[:seg * 3], ref[:seg * 3])) < 0: F = F[:, [0, 2, 1]]; N = vnormals(V, F)
    N[c_bot] = [0, 0, -1]
    # corner colours: rim -> soil -> lighter top (a soft painted ramp); the hole a crisp soft-dark region past the lip
    z = V[:, 2]
    ramp = (rim[None] * (1 - sstep(0.0, 0.08, z))[:, None] + soil[None] * sstep(0.0, 0.08, z)[:, None])
    ramp = ramp * (1 - sstep(0.10, 0.22, z))[:, None] + top[None] * sstep(0.10, 0.22, z)[:, None]
    CC = ramp[F].copy()
    inner = np.zeros(len(F), bool); inner[:] = False
    lip_row = MOUND_LIP * seg
    in_hole = (F >= lip_row).all(1) & (F != c_bot).all(1) | (F == c_top).any(1)
    CC[in_hole] = hole
    acc.add(V, N, F, CC, 'soil')
    # clods: rounded lumps, partly sunk in, lighter on top
    for k in range(5):
        a = TAU * k / 5 + 0.35 + rng.uniform(-0.25, 0.25); r = rng.uniform(0.21, 0.36)
        x, y = r * math.cos(a), r * math.sin(a); zc = mound_surface(x, y); sc = rng.uniform(0.85, 1.15)
        abc = (0.066 * sc, 0.06 * sc, 0.056 * sc)
        Rm = frame_from([math.cos(a) * 0.5, math.sin(a) * 0.5, 1], [math.cos(a), math.sin(a), 0])
        ellipsoid(acc, (x, y, zc - abc[2] * 0.3), Rm, abc, clod, nu=8, nv=4, tag='clods',
                  colf=lambda V_, F_, c=clod: (c[None, None] * (0.84 + 0.22 * sstep(-0.6, 0.9, nz(V_ - V_.mean(0))[:, 2]))[F_][..., None]))
    for k in range(3):
        a = TAU * k / 3 + 1.1 + rng.uniform(-0.3, 0.3); r = rng.uniform(0.32, 0.40)
        x, y = r * math.cos(a), r * math.sin(a); zc = mound_surface(x, y)
        ellipsoid(acc, (x, y, zc - 0.008), frame_from([0, 0, 1], [math.cos(a), math.sin(a), 0]), (0.04, 0.036, 0.031), peb,
                  nu=6, nv=3, tag='pebbles')

def build_mound_tip(acc, pal):
    """the stub poking out of the hole: the tip of the bamboo shoot (a husk-coloured cone) wrapped by one husk
    with its teardrop mark facing the front, and the green curl"""
    husk, mark = lin(pal['husk']), lin(pal['mark'])
    prof_s = np.array([(0.072, 0.10), (0.071, 0.20), (0.066, 0.27), (0.050, 0.33), (0.024, 0.37)])
    seg = 10; rows = []
    ph = TAU * np.arange(seg) / seg
    for r, z in prof_s: rows.append(np.stack([r * np.sin(ph), -r * np.cos(ph), np.full(seg, z)], -1))
    V = np.vstack(rows + [np.array([[0, 0, 0.38]])]); F = []
    for j in range(len(rows) - 1):
        for i in range(seg):
            a0 = j * seg + i; a1 = j * seg + (i + 1) % seg; F += [[a0, a1, a1 + seg], [a0, a1 + seg, a0 + seg]]
    top = len(V) - 1; lastr = (len(rows) - 1) * seg
    for i in range(seg): F.append([lastr + i, lastr + (i + 1) % seg, top])
    F = np.array(F)
    def cone_r(z): return np.interp(z, prof_s[:, 1], prof_s[:, 0])
    def cone_dr(z): return np.gradient(prof_s[:, 0], prof_s[:, 1])
    N = vnormals(V, F)
    if np.sum(np.einsum('ij,ij->i', N, nz(V * [1, 1, 0] + [0, 0, 0.05]))) < 0: F = F[:, [0, 2, 1]]; N = vnormals(V, F)
    acc.add(V, N, F, np.tile(husk * 0.86, (len(F), 1)), 'stub')
    # one husk wrapped round the front of the stub (the shape of the body's husks, a teardrop mark)
    L, W = 0.25, 0.115; z0 = 0.13
    def mid(s_, t_):
        s_ = np.asarray(s_, float); t_ = np.asarray(t_, float); u = np.clip(t_ / L, 0, 1)
        z = z0 + t_ * 0.97; r = cone_r(np.minimum(z, 0.37)) + 0.004 + 0.022 * (1 - u) + 0.006 * sstep(0.8, 1, u)
        a = s_ / np.maximum(r, 0.02)
        return np.stack([r * np.sin(a), -r * np.cos(a), z], -1)
    B = rounded_poly(ccw(np.array([(0, 0.0), (W, 0.02), (0.84 * W, 0.46 * L), (0, L), (-0.84 * W, 0.46 * L), (-W, 0.02)])),
                     [0.025, 0.025, 0.035, 0.02, 0.035, 0.025], long_edge=0.3)
    mk = teardrop(0, 0.168, 0.08, 0.046, 7)
    shell(acc, mid, B, 0.014, 0.003, [(mk, mark)], husk, husk * 0.78, n_ring1=9, n_ring2=6, interior=0.2, tag='stub',
          bottom_ring1=False)
    P = curl_path([0, 0, 0.33], None, 0.82, n_per=1)
    r = np.interp(np.linspace(0, 1, len(P)), [0, 0.4, 1], [0.045, 0.038, 0.024])
    tube(acc, P, r, lin(pal['curl']), sides=6, tag='stub')

# ================================================================== scene + export
def make_material():
    m = bpy.data.materials.new('toon'); m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Metallic'].default_value = 0.0
    return m

def build_variant(key):
    pal = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    body = Acc()
    face = build_core(body, pal)
    gem_plates = bool(pal.get('gems'))   # the front diamond and the two row-2 side husks (plates_def gem=True)
    gems = build_plates(body, pal, gem_plates)
    for g in gems: build_gem(body, pal, *g)
    build_arms(body, pal)
    build_toes(body, pal)
    build_curl(body, pal)
    mound = Acc(); rng = np.random.default_rng(RNG_SEED + 1)
    build_mound(mound, pal, rng); build_mound_tip(mound, pal)
    ob = body.to_object('body', mat); om = mound.to_object('mound', mat)
    stats = {'variant': key, 'body_tris': body.tris(), 'mound_tris': mound.tris(), 'total': body.tris() + mound.tris(),
             'body_parts': body.log, 'mound_parts': mound.log}
    return ob, om, stats

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_normals=True,
                              export_lights=False, export_cameras=False, export_animations=False, export_materials='EXPORT',
                              export_texcoords=False, export_tangents=False)

def main():
    only = arg('--variant')
    keys = [only] if only else ['aotake', 'golden', 'base']   # base last: its scene is the one saved
    allstats = []
    for key in keys:
        ob, om, st = build_variant(key)
        out = os.path.join(MODELS, VARIANTS[key]['file'] + '.glb')
        export(out); st['glb'] = out; allstats.append(st)
        print('BUILT', json.dumps(st))
        if key == 'base':
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'takenoko.blend'), compress=True)
    with open(os.path.join(TASK_DIR, 'build_stats.json' if not only else f'build_stats_{only}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=2)

main()
