"""Iwa-bozu (Bamboo Depths tank enemy, EN-1): deterministic build of Option A "Mossy Monk".

Blender 4.3:
  blender --background --factory-startup --python build_iwabozu.py [-- --variant base|lantern|elder]

Builds every variant from an empty scene and exports public/models/iwabozu.glb, iwabozu_lantern.glb and
iwabozu_elder.glb, then saves iwabozu.blend (the base variant). Units: metres, front = -Y, ground z = 0.

Parts (enemy contract): body (origin 0,0,0), lids (origin 0,0,0), armL (+X shoulder), armR (-X shoulder).
Vertex colour only (face-corner FLOAT_COLOR attribute `Col`), material `toon` (+ `glow` on the lantern window), no
UVs, no rig.

Technique (as the approved takenoko / kodama builds)
- The boulder is an analytic surface (a superellipse-like profile of revolution with an elliptic, depth-squashed
  cross-section). Its 2-D parameter domain is triangulated with a constrained Delaunay (delaunay_2d_cdt) where every
  face border (eye socket, iris, warm lower iris, catchlights, lash line, mouth, blush) is a constraint loop, so each
  colour border runs along modelled edges. Normals are analytic (finite differences of the map), set as custom normals.
- Moss cap, brows, shide, lids: single-skin thick shells laid on the boulder with a rounded (quarter-circle) lip that
  dips into the stone; the elder's beard is a closed shell. Rope: a twisted 3-strand tube. Shoots: stacked husk tiers.
"""
import bpy, bmesh, math, os, sys, json
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
RNG_SEED = 11

# ================================================================== palette (sRGB hex from the brief / sheet)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def mix(a, b, t): return lin(a) * (1 - t) + lin(b) * t
COMMON = dict(iris='#292125', iris_low='#4e3529', sclera='#fff6ea', catch='#ffffff', lash='#292125', mouth='#292125',
              blush='#e98c91', shide='#fffaf0', straw='#c7a15a', straw_dk='#a4803e', closed='#292125',
              lantern='#c2b9ab', lantern_dk='#9e9588', glow='#ffd27a', beard='#f0efe6', beard_dk='#d9d6c8')
VARIANTS = {
    'base':    dict(COMMON, stone='#a0968a', stone_hi='#cbbfae', under='#6e665c', moss='#6a9a3c', moss_hi='#a6c860',
                    file='iwabozu'),
    'lantern': dict(COMMON, stone='#a89c8e', stone_hi='#d2c6b2', under='#766c60', moss='#729e42', moss_hi='#b0cc68',
                    file='iwabozu_lantern', lantern_on=True),
    'elder':   dict(COMMON, stone='#968e86', stone_hi='#c4bab0', under='#665e56', moss='#5a8a3a', moss_hi='#98c05c',
                    file='iwabozu_elder', elder=True, brow='#e4ddd2'),
}

# ================================================================== small math (from the takenoko toolkit)
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
def chaikin(P, it=2):
    for _ in range(it):
        Q = np.roll(P, -1, 0); P = np.stack([0.75 * P + 0.25 * Q, 0.25 * P + 0.75 * Q], 1).reshape(-1, P.shape[1])
    return P
def signed_area(P):
    x, y = P[:, 0], P[:, 1]; return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
def ccw(P): return P if signed_area(P) > 0 else P[::-1].copy()
def inside(poly, pts):
    pts = np.atleast_2d(pts); x, y = pts[:, 0], pts[:, 1]; res = np.zeros(len(pts), bool)
    xi, yi = poly[:, 0], poly[:, 1]; xj, yj = np.roll(xi, 1), np.roll(yi, 1)
    for a, b, c, d in zip(xi, yi, xj, yj):
        res ^= ((b > y) != (d > y)) & (x < (c - a) * (y - b) / ((d - b) + 1e-300) + a)
    return res
def seg_nearest(poly, pts):
    A = poly; B = np.roll(poly, -1, 0); AB = B - A
    AP = pts[:, None, :] - A[None]; t = np.clip(np.einsum('nki,ki->nk', AP, AB) / np.maximum(np.einsum('ki,ki->k', AB, AB), 1e-12), 0, 1)
    Q = A[None] + t[..., None] * AB[None]; D = np.linalg.norm(pts[:, None, :] - Q, axis=2)
    k = np.argmin(D, axis=1); idx = np.arange(len(pts))
    segn = nz(np.stack([AB[:, 1], -AB[:, 0]], -1))
    return D[idx, k], Q[idx, k], segn[k]
def vertex_normals_2d(P):
    a = P - np.roll(P, 1, 0); b = np.roll(P, -1, 0) - P
    na = nz(np.stack([a[:, 1], -a[:, 0]], -1)); nb = nz(np.stack([b[:, 1], -b[:, 0]], -1)); return nz(na + nb)
def offset_loop(P, d, n=None):
    Q = P - vertex_normals_2d(P) * d
    return resample_loop(Q, n) if n else Q
def cdt(points, loops, open_paths=()):
    edges = []
    for lp in loops:
        for i in range(len(lp)): edges.append((int(lp[i]), int(lp[(i + 1) % len(lp)])))
    for pth in open_paths:
        for i in range(len(pth) - 1): edges.append((int(pth[i]), int(pth[i + 1])))
    res = delaunay_2d_cdt([Vector((float(p[0]), float(p[1]))) for p in points], edges, [], 0, 1e-9, True)
    V = np.array([(v[0], v[1]) for v in res[0]], float); F = np.array([f for f in res[2] if len(f) == 3], int)
    return V, F
def ellipse(cx, cz, a, b, n, rot=0.0, t0=0.0):
    t = np.linspace(0, TAU, n, endpoint=False) + t0; x, y = a * np.cos(t), b * np.sin(t)
    c, s = math.cos(rot), math.sin(rot); return np.stack([cx + c * x - s * y, cz + s * x + c * y], -1)
def superellipse(cx, cz, A, Blo, Bup, elo, eup, n, rot=0.0):
    t = np.linspace(0, TAU, n, endpoint=False); c, s = np.cos(t), np.sin(t)
    e = np.where(s > 0, eup, elo); B = np.where(s > 0, Bup, Blo)
    x, y = A * np.sign(c) * np.abs(c) ** (2 / e), B * np.sign(s) * np.abs(s) ** (2 / e)
    cr, sr = math.cos(rot), math.sin(rot)
    return np.stack([cx + cr * x - sr * y, cz + sr * x + cr * y], -1)
def stroke(path, hw):
    path = np.asarray(path, float); hw = np.broadcast_to(np.asarray(hw, float), (len(path),))
    d = np.gradient(path, axis=0); nrm = nz(np.stack([-d[:, 1], d[:, 0]], -1))
    L = path + nrm * hw[:, None]; R = path - nrm * hw[:, None]
    def cap(p, dirv, r, n=5):
        base = math.atan2(dirv[1], dirv[0]); return [p + r * np.array([math.cos(base + a), math.sin(base + a)]) for a in np.linspace(-PI / 2, PI / 2, n)[1:-1]]
    e1 = nz(path[-1] - path[-2]); e0 = nz(path[0] - path[1])
    pts = list(L) + cap(path[-1], e1, hw[-1])[::-1] + list(R[::-1]) + cap(path[0], e0, hw[0])[::-1]
    return ccw(np.array(pts))
def rounded_poly(P, r, long_edge=1.0, n_arc=3):
    """round every corner of a polygon by radius r (arc of n_arc points)"""
    out = []; n = len(P)
    for i in range(n):
        a, c, b = P[i - 1], P[i], P[(i + 1) % n]
        ra = min(r, 0.45 * np.linalg.norm(a - c)); rb = min(r, 0.45 * np.linalg.norm(b - c))
        p1 = c + nz(a - c) * ra; p2 = c + nz(b - c) * rb
        for k in range(n_arc):   # quadratic Bezier p1 -> c -> p2
            t = k / (n_arc - 1); out.append((1 - t) ** 2 * p1 + 2 * (1 - t) * t * c + t * t * p2)
        nxt = P[(i + 1) % n]
        if np.linalg.norm(nxt - c) > long_edge: out.append(0.5 * (c + nxt))
    return ccw(np.array(out))
def frame_from(z_axis, x_hint):
    z = nz(np.asarray(z_axis, float)); x = nz(np.asarray(x_hint, float) - z * np.dot(x_hint, z)); y = np.cross(z, x)
    return np.stack([x, y, z], 1)
def rot_x(a):
    c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def rot_y(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def rot_z(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
def vnormals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); Nn = np.zeros_like(V)
    for k in range(3): np.add.at(Nn, F[:, k], fn)
    return nz(Nn)

# ================================================================== mesh accumulator (per-face material index)
class Acc:
    def __init__(self): self.V = []; self.N = []; self.F = []; self.C = []; self.M = []; self.n = 0; self.log = {}
    def add(self, V, N, F, FC, tag='part', shade=None, mat=0):
        """V (n,3), N (n,3), F (m,3), FC per-face (m,3) or per-corner (m,3,3) linear colours. Welds coincident vertices,
        orients faces by the normals, drops degenerate and doubled faces. shade(V)->(n,) multiplies corner colours."""
        V = np.asarray(V, float); N = nz(np.asarray(N, float)); F = np.asarray(F, int); FC = np.asarray(FC, float)
        kd = KDTree(len(V))
        for i, co in enumerate(V): kd.insert(co, i)
        kd.balance(); rep = np.arange(len(V))
        for i, co in enumerate(V):
            for (_, j, _) in kd.find_range(co, 1e-5):
                if j < i: rep[i] = min(rep[i], rep[j])
        first, inv = np.unique(rep, return_inverse=True); inv = inv.reshape(-1); V = V[first]; N = N[first]; F = inv[F]
        ok = (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2]); F, FC = F[ok], FC[ok]
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
        self.M.append(np.full(len(F), mat, int))
        self.log[tag] = self.log.get(tag, 0) + len(F)
    def tris(self): return sum(len(f) for f in self.F)
    def to_object(self, name, mats, origin=(0, 0, 0)):
        V = np.vstack(self.V) - np.asarray(origin, float); N = np.vstack(self.N); F = np.vstack(self.F)
        C = np.vstack(self.C); M = np.concatenate(self.M)
        me = bpy.data.meshes.new(name)
        me.from_pydata(V.tolist(), [], F.tolist()); me.update()
        assert len(me.polygons) == len(F), 'from_pydata dropped faces'
        me.polygons.foreach_set('use_smooth', [True] * len(F))
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        rgba = np.concatenate([np.clip(C.reshape(-1, 3), 0, 1), np.ones((len(F) * 3, 1))], 1)
        attr.data.foreach_set('color', rgba.astype(np.float32).ravel())
        me.color_attributes.active_color = attr; me.color_attributes.render_color_index = 0
        me.normals_split_custom_set_from_vertices(N.tolist())
        used = sorted(set(M.tolist()))
        for m in mats: me.materials.append(m)
        me.polygons.foreach_set('material_index', M.tolist())
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        ob.location = origin
        return ob

# ================================================================== the boulder core
# front-view half width r against height z (stone surface; the moss adds ~3.4 cm on top). Measured on the sheet's front
# view (ground y 398, shoot tips y 89 = 0.96 m: 3.107 mm/px): widest ~0.42 at z 0.25-0.42, 0.385 at 0.09, 0.32 at 0.056.
CORE_CP = [(0.0, 0.028), (0.16, 0.030), (0.255, 0.040), (0.318, 0.056), (0.362, 0.080), (0.391, 0.115), (0.409, 0.170),
           (0.419, 0.250), (0.421, 0.330), (0.418, 0.420), (0.410, 0.500), (0.397, 0.550), (0.371, 0.600),
           (0.333, 0.645), (0.283, 0.683), (0.222, 0.714), (0.155, 0.739), (0.080, 0.754), (0.0, 0.759)]
_P = catmull(CORE_CP, 60); _P[:, 0] = np.maximum(_P[:, 0], 0)
_W = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(_P, axis=0), axis=1))]); WMAX = _W[-1]
def prof(w):
    w = np.asarray(w, float); return np.interp(w, _W, _P[:, 0]), np.interp(w, _W, _P[:, 1])
def w_of_z(z): return np.interp(z, _P[:, 1], _W)
def depth_a(z):   # depth / width of the cross-section (side view: half depth 0.345 at z 0.3, rounder for the roll)
    return 0.835 - 0.075 * sstep(0.45, 0.75, z) - 0.07 * (1 - sstep(0.04, 0.2, z))
def wobble(phi, z):  # a little hand-made irregularity, kept off the face
    face = sstep(0.55, 1.2, np.abs(np.angle(np.exp(1j * phi))))
    return 1 + face * (0.010 * np.sin(3 * phi + 0.7) * np.sin(z * 9 + 0.4) + 0.007 * np.sin(5 * phi + 2.1))
def core_pt(phi, w):
    phi = np.asarray(phi, float); R, z = prof(w); R = R * wobble(phi, z)
    return np.stack([R * np.sin(phi), -depth_a(z) * R * np.cos(phi), z], -1)
def core_nrm(phi, w):
    phi = np.asarray(phi, float); w = np.asarray(w, float)
    e = 1e-4
    dp = core_pt(phi + e, w) - core_pt(phi - e, w)
    dw = core_pt(phi, np.clip(w + e, 0, WMAX)) - core_pt(phi, np.clip(w - e, 0, WMAX))
    n = np.cross(dp, dw); ln = np.linalg.norm(n, axis=-1, keepdims=True)
    P = core_pt(phi, w); ref = P - np.array([0, 0, 0.39])
    n = n / np.maximum(ln, 1e-12); n = n * np.sign(np.sum(n * ref, -1, keepdims=True) + 1e-12)
    pole = np.where(prof(w)[1][..., None] > 0.39, np.array([0, 0, 1.0]), np.array([0, 0, -1.0]))
    return np.where(ln > 1e-10, n, pole)
def front_to_core(X, Z):
    w = w_of_z(Z); R = prof(w)[0]; return np.arcsin(np.clip(X / np.maximum(R, 1e-6), -1, 1)), w
def surf_front(X, Z, off=0.0):
    """the boulder point under front-view coordinates (X, Z), pushed off along the normal"""
    ph, w = front_to_core(np.asarray(X, float), np.asarray(Z, float))
    return core_pt(ph, w) + core_nrm(ph, w) * np.asarray(off, float)[..., None], core_nrm(ph, w)

# ---------------------------------------------------------------- face features (front-view coordinates, metres)
EYE_SC, EYE_SZ, EYE_SA, EYE_SB = 0.169, 0.427, 0.078, 0.077      # the eye socket (white)
EYE_IC, EYE_IA, EYE_IB = 0.153, 0.060, 0.073                     # the iris, set toward the nose
BROW_C, BROW_Z = 0.180, 0.553
def face_features():
    F = {}
    for side, sx in (('L', -1), ('R', 1)):
        inner = -sx
        sock = ellipse(sx * EYE_SC, EYE_SZ, EYE_SA, EYE_SB, 26)
        F['sock' + side] = ccw(sock)
        iris = ellipse(sx * EYE_IC, EYE_SZ, EYE_IA, EYE_IB, 18)
        # keep the iris inside the socket (it touches the inner and top/bottom edges on the sheet)
        q = (iris - [sx * EYE_SC, EYE_SZ]) / [EYE_SA, EYE_SB]; r = np.linalg.norm(q, axis=1)
        k = np.minimum(1, 0.975 / np.maximum(r, 1e-9))
        iris = np.array([sx * EYE_SC, EYE_SZ]) + q * k[:, None] * [EYE_SA, EYE_SB]
        F['iris' + side] = ccw(iris)
        F['irislow' + side] = ccw(ellipse(sx * EYE_IC, EYE_SZ - 0.046, 0.042, 0.026, 14))
        F['catch' + side] = ccw(ellipse(sx * EYE_IC + inner * 0.009, EYE_SZ + 0.031, 0.0165, 0.0170, 10))
        F['catchs' + side] = ccw(ellipse(sx * EYE_IC - inner * 0.024, EYE_SZ - 0.031, 0.0078, 0.0078, 7))
        # the lash line: a dark band along the socket's top, heavier toward the outer corner
        t = np.linspace(0.12 * PI, 0.88 * PI, 10)
        path = np.stack([sx * EYE_SC + (EYE_SA + 0.002) * np.cos(t), EYE_SZ + (EYE_SB + 0.002) * np.sin(t)], -1)
        u = (np.cos(t) * sx + 1) / 2          # 1 at the outer corner, 0 at the inner
        hw = 0.0042 + 0.0034 * np.sin(np.linspace(0, PI, 10)) ** 0.5 + 0.0018 * u
        F['lash' + side] = stroke(path, hw)
        F['blush' + side] = ccw(ellipse(sx * 0.250, 0.352, 0.047, 0.031, 14))
    tt = np.linspace(-1, 1, 7); path = np.stack([tt * 0.028, 0.345 + 0.009 * tt ** 2], -1)
    F['mouth'] = stroke(path, 0.0058)
    return F
PAINT_ORDER = ['blush', 'sock', 'iris', 'irislow', 'catch', 'catchs', 'lash', 'mouth']

def build_core(acc, pal):
    F = face_features()
    K = 0.38   # domain x scale: x = phi*K, y = w
    pts, loops, opens = [], [], []
    def add_loop(P2):
        i0 = len(pts); pts.extend(P2.tolist()); loops.append(list(range(i0, i0 + len(P2))))
    w_lo, w_hi = 0.03, WMAX - 0.03
    ws = [w_lo]
    while ws[-1] < w_hi:
        z = prof(ws[-1])[1]
        ws.append(ws[-1] + (0.09 if z < 0.06 else 0.063 if z < 0.62 else 0.11))
    ws[-1] = w_hi; ws = np.array(ws)
    feat_pts = np.vstack(list(F.values()))
    ring_idx = []
    for i, w in enumerate(ws):
        R, z = prof(w)
        h = 0.085 if 0.06 < z < 0.62 else 0.13
        nr = max(8, int(round(TAU * R / h)))
        phis = np.linspace(-PI, PI, nr + 1)
        if 0 < i < len(ws) - 1 and i % 2: phis[1:-1] += 0.5 * (phis[1] - phis[0])
        keep = np.ones(len(phis), bool)
        X = R * np.sin(phis); fr = np.abs(phis) < 1.3
        d = np.min(np.linalg.norm(np.stack([X, np.full_like(X, z)], -1)[:, None] - feat_pts[None], axis=2), axis=1)
        keep &= ~(fr & (d < 0.011))
        keep[0] = keep[-1] = True
        P2 = np.stack([phis * K, np.full_like(phis, w)], -1)[keep]
        i0 = len(pts); pts.extend(P2.tolist()); ring_idx.append(list(range(i0, i0 + len(P2))))
    # interior points for the eye domes
    for sx in (-1, 1):
        e = np.vstack([[[sx * EYE_SC, EYE_SZ]], ellipse(sx * EYE_SC, EYE_SZ, EYE_SA * 0.5, EYE_SB * 0.5, 6, t0=0.3)])
        keep = np.min(np.linalg.norm(e[:, None] - feat_pts[None], axis=2), axis=1) > 0.008
        ph, ww = front_to_core(e[keep, 0], e[keep, 1]); pts.extend(np.stack([ph * K, ww], -1).tolist())
    for name, P in F.items():
        ph, ww = front_to_core(P[:, 0], P[:, 1]); add_loop(np.stack([ph * K, ww], -1))
    border = ring_idx[0] + [r[-1] for r in ring_idx[1:]] + ring_idx[-1][::-1][1:] + [r[0] for r in ring_idx[::-1][1:-1]]
    loops.append(border)
    V2, T = cdt(np.array(pts), loops)
    phi, w = V2[:, 0] / K, V2[:, 1]
    R, z = prof(w); X = R * np.sin(phi)
    def dome(ph_, w_):
        R_, z_ = prof(w_); X_ = R_ * np.sin(ph_); d_ = np.zeros(np.shape(ph_))
        for sx in (-1, 1):
            r2 = ((X_ - sx * EYE_SC) / EYE_SA) ** 2 + ((z_ - EYE_SZ) / EYE_SB) ** 2
            d_ += np.where((r2 < 1) & (np.abs(ph_) < 1.2), 0.0055 * np.clip(1 - r2, 0, 1) ** 1.5, 0)
        return d_
    def mapped(ph_, w_): return core_pt(ph_, w_) + core_nrm(ph_, w_) * dome(ph_, w_)[..., None]
    P = mapped(phi, w); N = core_nrm(phi, w)
    sel = dome(phi, w) > 0
    if sel.any():
        e = 1e-4; a, b = phi[sel], w[sel]
        nn = nz(np.cross(mapped(a + e, b) - mapped(a - e, b), mapped(a, b + e) - mapped(a, b - e)))
        nn *= np.sign(np.einsum('ij,ij->i', nn, N[sel]))[:, None]; N[sel] = nn
    cen = (V2[T[:, 0]] + V2[T[:, 1]] + V2[T[:, 2]]) / 3; cphi, cw = cen[:, 0] / K, cen[:, 1]
    cR, cz = prof(cw); q = np.stack([cR * np.sin(cphi), cz], -1); fr = np.abs(cphi) < 1.25
    stone = lin(pal['stone'])
    FC = np.tile(stone, (len(T), 1))
    for key in PAINT_ORDER:
        for s in ('L', 'R', ''):
            if key + s not in F or (s == '' and key != 'mouth'): continue
            m = inside(F[key + s], q) & fr
            if key in ('iris', 'irislow', 'catch', 'catchs'): m &= inside(F['sock' + s], q)
            if key in ('irislow', 'catch', 'catchs'): m &= inside(F['iris' + s], q)
            col = {'sock': 'sclera', 'iris': 'iris', 'irislow': 'iris_low', 'catch': 'catch', 'catchs': 'catch',
                   'lash': 'lash', 'blush': 'blush', 'mouth': 'mouth'}[key]
            FC[m] = lin(pal[col])
    # soft painted shading: darker toward the underside (the sheet's #6e665c underside), stone elsewhere
    PA = np.array(pts); Vs, Ns, Fs = [P], [N], [T]; n0 = len(P)
    Vb = core_pt(np.array([0.0]), np.array([0.0])); Vt = core_pt(np.array([0.0]), np.array([WMAX]))
    for ri, pole, pn in ((ring_idx[0], Vb, np.array([[0, 0, -1.0]])), (ring_idx[-1], Vt, np.array([[0, 0, 1.0]]))):
        qq = PA[ri]; ring = core_pt(qq[:, 0] / K, qq[:, 1]); rn = core_nrm(qq[:, 0] / K, qq[:, 1])
        Vs += [pole, ring]; Ns += [pn, rn]
        Fs.append(np.array([[n0, n0 + i + 1, n0 + i + 2] for i in range(len(ring) - 1)])); n0 += 1 + len(ring)
        FC = np.vstack([FC, np.tile(stone, (len(ring) - 1, 1))])
    Vall = np.vstack(Vs); Fall = np.vstack(Fs)
    # per-corner colours: stone faces ramp into the underside colour below z 0.2 (painted features stay flat)
    CC = np.repeat(FC[:, None, :], 3, axis=1)
    is_stone = np.all(np.abs(FC - stone) < 1e-6, axis=1)
    zc = Vall[Fall][:, :, 2]
    t = (1 - sstep(0.035, 0.23, zc)) * 0.85
    ramp = stone[None, None] * (1 - t[..., None]) + lin(pal['under'])[None, None] * t[..., None]
    CC[is_stone] = ramp[is_stone]
    acc.add(Vall, np.vstack(Ns), Fall, CC, 'core')
    return F

# ================================================================== thick shells (moss, brows, shide, lids, beard)
def shell(acc, mid, outline, t0, bulge, regions, base_col, under_col=None, n_ring1=None, n_ring2=None, interior=0.055,
          taper=None, tag='shell', shade=None, bottom=True, sink=0.0, colf=None, mat=0, bulge_w=0.05):
    """A thick shell over a 2-D outline on a mid-surface mid(s, t) -> (n,3) (its normal side is the top).
    t0: edge radius, bulge: extra centre thickness. bottom=False: a single top skin whose rounded lip dips `sink`
    into the surface below (pads and caps lying on the boulder). colf(P, N, T, cen2) -> per-face/corner colours."""
    B = ccw(outline); nb = len(B)
    r1 = offset_loop(B, t0 * 0.33, n_ring1 or nb); r2 = offset_loop(B, t0, n_ring2 or max(8, int(nb * 0.75)))
    lo, hi = B.min(0), B.max(0); gx = np.arange(lo[0] + interior / 2, hi[0], interior); gy = np.arange(lo[1] + interior / 2, hi[1], interior)
    G = np.array([(x + 1.3e-4, y + 0.7e-4) for j, y in enumerate(gy) for x in (gx + (interior / 2 if j % 2 else 0))]) if len(gx) and len(gy) else np.zeros((0, 2))
    if len(G):
        d, _, _ = seg_nearest(B, G); G = G[inside(B, G) & (d > t0 * 1.6)]
        for poly, _ in regions:
            if len(G): dd, _, _ = seg_nearest(poly, G); G = G[dd > 0.008]
    if not len(G): G = B.mean(0, keepdims=True)
    def skin(top):
        rings = (B, r1, r2) if top else (B, r2)
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
        if onB.any():
            vn = vertex_normals_2d(B); k = np.argmin(np.linalg.norm(V2[onB][:, None] - B[None], axis=2), axis=1)
            near = np.linalg.norm(V2[onB] - B[k], axis=1) < 1e-6; tmp = b2[onB]; tmp[near] = vn[k][near]; b2[onB] = tmp
        b3 = nz(Ms * b2[:, :1] + Mt * b2[:, 1:]); b3 = nz(b3 - nM * np.einsum('ij,ij->i', b3, nM)[:, None])
        x = (t0 - np.minimum(d, t0)) / t0; y = np.sqrt(np.clip(1 - x * x, 0, 1))
        h = t0 * y + bulge * sstep(t0, t0 + bulge_w, d)
        if taper is not None: h = h * taper(s, t)
        sg = 1 if top else -1
        P = M + sg * nM * h[:, None] - (0 if bottom else 1) * nM * (sink * (1 - y))[:, None]
        N = nz(b3 * x[:, None] + sg * nM * y[:, None])
        if top:
            if colf is not None: FC = colf(P, N, T, cen)
            else:
                FC = np.tile(base_col, (len(T), 1))
                for poly, col in regions: FC[inside(poly, cen)] = col
        else:
            FC = np.tile(under_col, (len(T), 1))
        return P, N, T, FC
    Pa, Na, Ta, Ca = skin(True)
    if bottom:
        Pb, Nb, Tb, Cb = skin(False)
        Ca = Ca if Ca.ndim == 2 else Ca; Cb = Cb if Ca.ndim == 2 else np.repeat(Cb[:, None, :], 3, axis=1)
        acc.add(np.vstack([Pa, Pb]), np.vstack([Na, Nb]), np.vstack([Ta, Tb + len(Pa)]), np.vstack([Ca, Cb]), tag, shade, mat)
    else:
        acc.add(Pa, Na, Ta, Ca, tag, shade, mat)

# ================================================================== primitives
def ellipsoid(acc, c, R, abc, col, nu=10, nv=6, squash_low=1.0, tag='blob', colf=None, mat=0):
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
    FC = np.tile(col, (len(F), 1)) if colf is None else colf(V, N, F)
    acc.add(V, N, F, FC, tag, mat=mat)

def revolve(acc, rows, cols, frame, origin, colf, tag, close_top=True, phase=0.0):
    """surface of revolution about frame's z axis: rows [(h, r, dh(theta)->h offset or None)], `cols` around."""
    th = phase + TAU * np.arange(cols) / cols
    V = []
    for (h, r, dh) in rows:
        hh = h + (dh(th) if dh is not None else np.zeros(cols))
        V.append(np.stack([r * np.cos(th), r * np.sin(th), hh], -1))
    V = np.vstack(V); nr = len(rows); F = []
    for j in range(nr - 1):
        for i in range(cols):
            a0 = j * cols + i; a1 = j * cols + (i + 1) % cols; F += [[a0, a1, a1 + cols], [a0, a1 + cols, a0 + cols]]
    if close_top:
        top = len(V); V = np.vstack([V, [[0, 0, rows[-1][0] + 0.6 * rows[-1][1]]]])
        for i in range(cols): F.append([(nr - 1) * cols + i, (nr - 1) * cols + (i + 1) % cols, top])
    F = np.array(F); Vw = np.asarray(origin) + V @ frame.T
    N = vnormals(Vw, F)
    ref = nz(Vw - (np.asarray(origin) + frame[:, 2] * 0.5 * rows[-1][0]))
    if np.sum(np.einsum('ij,ij->i', N, ref)) < 0: F = F[:, [0, 2, 1]]; N = vnormals(Vw, F)
    acc.add(Vw, N, F, colf(Vw, F, V), tag)

# ================================================================== moss cap
def moss_edge_z(phi, pal, rng):
    """the scalloped lower edge of the moss: high over the face, lower down the back, 16 rounded tongues"""
    elder = pal.get('elder')
    zb = 0.575 + 0.07 * np.cos(phi) - (0.035 * (1 - sstep(0.55, 0.95, np.cos(phi))) if elder else 0)
    jit = 1 + 0.28 * np.sin(5 * phi + 1.3) * np.cos(3 * phi + 0.4)
    d = (0.050 - 0.028 * sstep(0.5, 0.98, np.cos(phi)) + 0.012 * sstep(-0.3, -0.9, np.cos(phi))) * jit * (1.12 if elder else 1)
    lobes = np.abs(np.cos(6 * phi + PI / 2 + 0.25 * np.sin(3 * phi))) ** 0.6
    return np.minimum(zb - d * lobes, 0.70)

def build_moss(acc, pal, rng):
    elder = bool(pal.get('elder'))
    nb = 112
    phi = np.linspace(-PI, PI, nb, endpoint=False) + 1e-3
    ze = moss_edge_z(phi, pal, rng)
    rho = WMAX - w_of_z(ze)
    B = np.stack([rho * np.sin(phi), -rho * np.cos(phi)], -1)
    def mid(s, t):
        s = np.asarray(s, float); t = np.asarray(t, float)
        rh = np.hypot(s, t); ph = np.arctan2(s, -t)
        w = np.clip(WMAX - rh, 0.0, WMAX)
        lump = 0.004 * np.sin(s * 23 + 1.1) * np.cos(t * 19 + 0.3) + 0.003 * np.sin(s * 41 - t * 37)
        return core_pt(ph, w) + core_nrm(ph, w) * (lump)[..., None]
    t0, bulge = (0.027, 0.014) if elder else (0.025, 0.011)
    mo, mh = lin(pal['moss']), lin(pal['moss_hi'])
    def colf(P, N, T, cen):
        k = sstep(0.5, 0.98, N[:, 2]) * 0.32 + 0.08
        c = mo[None] * (1 - k[:, None]) + mh[None] * k[:, None]
        c = c * (0.86 + 0.14 * sstep(-0.2, 0.5, N[:, 2]))[:, None]
        return c[T]
    shell(acc, mid, B, t0, bulge, [], mo, n_ring1=80, n_ring2=56, interior=0.10, tag='moss', bottom=False,
          sink=0.006, colf=colf, bulge_w=0.06)

def moss_top_z(x, y):
    """height of the boulder surface (under the moss) at plan position (x, y)"""
    ph = math.atan2(x, -y); best = None
    ws = np.linspace(WMAX * 0.6, WMAX, 400); P = core_pt(np.full(400, ph), ws)
    r = np.hypot(P[:, 0], P[:, 1]); i = int(np.argmin(np.abs(r - math.hypot(x, y))))
    return float(P[i, 2]), core_nrm(np.array([ph]), np.array([ws[i]]))[0]

# ================================================================== brows, nose, mouth
def build_brows(acc, pal):
    col = lin(pal.get('brow', pal['stone_hi']))
    for sx in (-1, 1):
        B = superellipse(sx * BROW_C, BROW_Z, 0.112, 0.048, 0.062, 4.2, 2.0, 28, rot=-sx * 0.09)
        B = ccw(B)
        def mid(s, t): return surf_front(s, t, 0.0)[0]
        def colf(P, N, T, cen, col=col):
            k = 0.90 + 0.12 * sstep(-0.3, 0.6, N[:, 2]); return (col[None] * k[:, None])[T]
        shell(acc, mid, B, 0.015, 0.011, [], col, n_ring1=24, n_ring2=14, interior=0.07, tag='brows', bottom=False,
              sink=0.004, colf=colf, bulge_w=0.05)

def build_nose(acc, pal):
    P, n = surf_front(np.array([0.0]), np.array([0.398]), np.array([0.010]))
    R = frame_from(n[0], [1, 0, 0])
    ellipsoid(acc, P[0], R, (0.037, 0.027, 0.022), lin(pal['under']) * 1.08, nu=10, nv=5, tag='nose',
              colf=lambda V, N, F: (lin(pal['under'])[None] * (0.95 + 0.14 * sstep(-0.4, 0.8, nz(N)[:, 2]))[:, None])[F])

# ================================================================== the shimenawa rope, knot and tassel
ROPE_Z, ROPE_R = 0.255, 0.045
def rope_center(phi):
    w = w_of_z(ROPE_Z); P = core_pt(phi, np.full_like(phi, w)); n = core_nrm(phi, np.full_like(phi, w))
    n[:, 2] = 0; n = nz(n)
    return P + n * (ROPE_R - 0.019), n

def build_rope(acc, pal):
    nseg, sides = 42, 6   # (a multiple of 6: the twisted strands close on themselves)
    phi = np.linspace(0, TAU, nseg, endpoint=False)
    C, n = rope_center(phi)
    T = nz(np.roll(C, -1, 0) - np.roll(C, 1, 0))
    N0 = nz(n - T * np.einsum('ij,ij->i', n, T)[:, None]); Bv = np.cross(T, N0)
    V, Fc, crest = [], [], []
    for k in range(nseg):
        for i in range(sides):
            a = (i + k) * TAU / sides
            r = ROPE_R * (1.12 if i % 2 == 0 else 0.76)
            V.append(C[k] + r * (math.cos(a) * N0[k] + math.sin(a) * Bv[k])); crest.append(i % 2 == 0)
    V = np.array(V); crest = np.array(crest)
    F = []
    for k in range(nseg):
        k1 = (k + 1) % nseg
        for i in range(sides):
            i1 = (i + 1) % sides
            a, b, c, d = k * sides + i, k * sides + i1, k1 * sides + i1, k1 * sides + i
            F += [[a, b, d], [b, c, d]]
    F = np.array(F); N = vnormals(V, F)
    ref = nz(V - np.repeat(C, sides, axis=0))
    if np.sum(np.einsum('ij,ij->i', N, ref)) < 0: F = F[:, [0, 2, 1]]; N = vnormals(V, F)
    st, sd = lin(pal['straw']), lin(pal['straw_dk'])
    vc = np.where(crest[:, None], st[None] * 1.04, sd[None])
    acc.add(V, N, F, vc[F], 'rope')

def build_knot(acc, pal):
    C, n = rope_center(np.array([0.0])); c = C[0]; n0 = n[0]
    st, sd = lin(pal['straw']), lin(pal['straw_dk'])
    def cf(V, N, F): return (st[None] * (0.82 + 0.24 * sstep(-0.5, 0.8, nz(N)[:, 2]))[:, None])[F]
    for sx in (-1, 1):   # two fat crossed lumps (the sheet's knot: ~0.11 wide, 0.115 tall)
        R = frame_from(n0, [0, 0, 1])
        Rl = R @ rot_z(sx * 0.6)
        ellipsoid(acc, c + n0 * 0.030 + np.array([sx * 0.020, 0, 0.004]), Rl, (0.034, 0.062, 0.036), st, nu=8, nv=5, tag='knot', colf=cf)
    ellipsoid(acc, c + n0 * 0.052 + np.array([0, 0, -0.004]), frame_from(n0, [1, 0, 0]), (0.030, 0.034, 0.024), st, nu=8, nv=4, tag='knot', colf=cf)
    # the tassel: two short fat straw strands with rounded ends
    for sx in (-1, 1):
        top = c + n0 * 0.034 + np.array([sx * 0.0135, 0, -0.03])
        path = np.array([top, top + np.array([sx * 0.002, -0.004, -0.035]), top + np.array([sx * 0.005, -0.008, -0.064])])
        tube(acc, path, np.array([0.019, 0.019, 0.020]), st, sides=6, tag='tassel',
             colf=lambda V, F: (st[None] * (0.85 + 0.18 * sstep(0.1, 0.24, V[:, 2]))[:, None])[F])

def tube(acc, path, radii, col, sides=9, tag='tube', colf=None):
    path = np.asarray(path, float); radii = np.asarray(radii, float)
    T = nz(np.gradient(path, axis=0)); up = np.array([0, 0, 1.0]) if abs(T[0, 2]) < 0.9 else np.array([1.0, 0, 0])
    Nf = [nz(np.cross(np.cross(T[0], up), T[0]))]
    for k in range(1, len(path)):
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
    base = (len(path) - 1) * sides; rE = radii[-1]
    for j, ang in enumerate((0.55, 1.05), start=1):
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

# ================================================================== shide (zigzag paper streamers)
def convex_union(A, B):
    """outline of the union of two overlapping convex polygons (star-sorted about their overlap)"""
    def seg_x(p, q, r, s_):
        d = (q[0] - p[0]) * (s_[1] - r[1]) - (q[1] - p[1]) * (s_[0] - r[0])
        if abs(d) < 1e-12: return None
        t = ((r[0] - p[0]) * (s_[1] - r[1]) - (r[1] - p[1]) * (s_[0] - r[0])) / d
        u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d
        return p + t * (q - p) if 0 <= t <= 1 and 0 <= u <= 1 else None
    pts = [v for v in A if not inside(B, v[None])[0]] + [v for v in B if not inside(A, v[None])[0]]
    X = []
    for i in range(len(A)):
        for j in range(len(B)):
            x = seg_x(A[i], A[(i + 1) % len(A)], B[j], B[(j + 1) % len(B)])
            if x is not None: X.append(x); pts.append(x)
    c = np.mean(X, axis=0) * 0.5 + 0.25 * (A.mean(0) + B.mean(0))
    P = np.array(pts); a = np.arctan2(P[:, 1] - c[1], P[:, 0] - c[0])
    return ccw(P[np.argsort(a)])

def shide_outline(scale=1.0):
    # the sheet's zigzag: two diamonds (~0.13 wide, 0.11 tall) stacked, the lower one 2.5 cm to the side
    def diamond(cx, cy, a, b): return np.array([(cx, cy + b), (cx - a, cy), (cx, cy - b), (cx + a, cy)])
    P = convex_union(diamond(0.012, -0.054, 0.064, 0.054), diamond(-0.014, -0.140, 0.064, 0.054)) * scale
    return rounded_poly(P, 0.0075, long_edge=0.2, n_arc=2)

def build_shide(acc, pal):
    col = lin(pal['shide'])
    for ph0 in (-0.56, 0.56, -2.62, 2.62):   # the front pair beside the knot, the back pair (sheet front/back views)
        top_z = ROPE_Z - 0.040; sc = 0.92; ZH = 0.17
        B = shide_outline(sc)
        def mid(s, t, ph0=ph0, top_z=top_z):
            # paper cards: on the body under the rope, then hanging straight down past the boulder's round bottom
            s = np.asarray(s, float); t = np.asarray(t, float)
            z = top_z + t; zc = np.maximum(z, ZH); w = w_of_z(zc); R = prof(w)[0]
            k = math.sqrt(math.sin(ph0) ** 2 + (depth_a(0.2) * math.cos(ph0)) ** 2)
            ph = ph0 + s / np.maximum(R * k, 0.05)
            P_ = core_pt(ph, w) + core_nrm(ph, w) * 0.012
            P_[..., 2] -= np.maximum(ZH - z, 0)
            return P_
        def colf(P, N, T, cen):
            k = 0.93 + 0.07 * sstep(-0.4, 0.4, N[:, 2]); return (col[None] * k[:, None])[T]
        shell(acc, mid, B, 0.0095, 0.002, [], col, col * 0.9, n_ring1=9, n_ring2=6, interior=0.2, tag='shide',
              bottom=True, colf=colf, bulge_w=0.02)

# ================================================================== feet
def build_feet(acc, pal):
    col = lin(pal['under'])
    for sx in (-1, 1):
        R = frame_from([0, 0, 1], [1, 0.0, 0]) @ rot_z(sx * 0.12)
        ellipsoid(acc, (sx * 0.215, -0.085, 0.039), R, (0.100, 0.122, 0.050), col, nu=10, nv=4, squash_low=0.78, tag='feet',
                  colf=lambda V, N, F: (col[None] * (0.9 + 0.2 * sstep(-0.3, 0.9, nz(N)[:, 2]))[:, None])[F])

# ================================================================== takenoko shoots
def build_shoot(acc, pal, base, tilt_x, tilt_y, scale, phase):
    st, sd = lin(pal['straw']), lin(pal['straw_dk']); tip, tipd = lin(pal['moss_hi']), lin(pal['moss'])
    frame = rot_y(tilt_y) @ rot_x(tilt_x)
    s = scale
    def petals(n, amp, ph):
        return lambda th: amp * s * np.clip(np.cos(n * (th - ph)), 0, 1) ** 1.6
    # tier A (lower husk ring), tier B (upper husk ring), the green tip
    tierA = [(0.000 * s, 0.056 * s, None), (0.030 * s, 0.076 * s, None), (0.066 * s, 0.072 * s, None),
             (0.090 * s, 0.058 * s, petals(3, 0.030, phase)), (0.096 * s, 0.047 * s, petals(3, 0.034, phase))]
    tierB = [(0.064 * s, 0.044 * s, None), (0.068 * s, 0.064 * s, None), (0.100 * s, 0.060 * s, None),
             (0.126 * s, 0.047 * s, petals(3, 0.028, phase + PI / 3)), (0.132 * s, 0.037 * s, petals(3, 0.031, phase + PI / 3))]
    tipr = [(0.100 * s, 0.036 * s, None), (0.140 * s, 0.037 * s, None), (0.170 * s, 0.029 * s, None),
            (0.192 * s, 0.016 * s, None)]
    def husk_col(Vw, F, Vl):
        h = Vl[:, 2]; c = np.where((h < Vl[:, 2].min() + 0.012 * s)[:, None], sd[None], st[None])
        k = 0.9 + 0.12 * sstep(0.0, 0.13 * s, h); return (c * k[:, None])[F]
    def tip_col(Vw, F, Vl):
        k = sstep(0.12 * s, 0.16 * s, Vl[:, 2]); c = tipd[None] * (1 - k[:, None]) + tip[None] * k[:, None]
        return c[F]
    revolve(acc, tierA, 10, frame, base, husk_col, 'shoots', close_top=False, phase=phase)
    revolve(acc, tierB, 10, frame, base, husk_col, 'shoots', close_top=False, phase=phase)
    revolve(acc, tipr, 9, frame, base, tip_col, 'shoots', close_top=True, phase=phase)

def shoot_base(x, y, sink=0.014):
    z, n = moss_top_z(x, y); return np.array([x, y, z + 0.03 - sink])

def build_shoots(acc, pal):
    if pal.get('lantern_on'):
        spots = [(-0.165, 0.01, 0.02, -0.30, 0.95, 0.4), (0.170, 0.03, -0.02, 0.30, 1.0, 1.1)]
    else:
        spots = [(-0.055, -0.045, 0.06, -0.17, 0.95, 0.4), (0.105, 0.055, -0.10, 0.17, 1.04, 1.1)]
    for x, y, tx, ty, sc, ph in spots:
        build_shoot(acc, pal, shoot_base(x, y), tx, ty, sc * 1.05, ph)

# ================================================================== the lantern (variant)
def bevel_box(acc, c, size, col_fn, bev=0.012, segs=2, tag='lantern', mat=0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bev, segments=segs, affect='EDGES', profile=0.5)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.normal_update()
    V = np.array([v.co[:] for v in bm.verts]) + np.asarray(c); N = np.array([v.normal[:] for v in bm.verts])
    F = np.array([[l.vert.index for l in f.loops] for f in bm.faces]); bm.free()
    acc.add(V, N, F, col_fn(V, N, F), tag, mat=mat)

def build_lantern(acc, pal):
    ls, ld = lin(pal['lantern']), lin(pal['lantern_dk']); glow = lin(pal['glow'])
    z0, _ = moss_top_z(0.0, 0.0); z0 += 0.026
    def sc(V, N, F, base=ls):
        k = 0.86 + 0.18 * sstep(-0.5, 0.9, nz(N)[:, 2]); return (base[None] * k[:, None])[F]
    # foot in the moss, post, platform
    revolve(acc, [(0.0, 0.070, None), (0.030, 0.075, None), (0.048, 0.064, None)], 8, np.eye(3), (0, 0, z0 - 0.02),
            lambda Vw, F, Vl: np.tile(ld, (len(F), 1)), 'lantern', close_top=True, phase=PI / 8)
    revolve(acc, [(0.0, 0.034, None), (0.085, 0.030, None)], 8, np.eye(3), (0, 0, z0 + 0.02),
            lambda Vw, F, Vl: np.tile(ls * 0.95, (len(F), 1)), 'lantern', close_top=False, phase=PI / 8)
    zp = z0 + 0.10
    bevel_box(acc, (0, 0, zp), (0.150, 0.150, 0.034), sc, bev=0.011, segs=1)
    # the fire box with a glowing window on the front and the back (cross mullions in stone)
    zf = zp + 0.017 + 0.058
    bevel_box(acc, (0, 0, zf), (0.118, 0.118, 0.112), sc, bev=0.014, segs=2)
    for ang in (0, PI / 2, PI, 3 * PI / 2):   # a flat four-pane window on each face: glowing panes, a stone cross
        xs = np.array([-0.038, -0.006, 0.006, 0.038]); zs = np.array([-0.046, -0.012, 0.0, 0.034])
        ca, sa = math.cos(ang), math.sin(ang)
        G = np.array([(x * ca + 0.0605 * sa, -x * sa + 0.0605 * ca, zf + zz) for zz in zs for x in xs])
        F, M = [], []
        for j in range(3):
            for i in range(3):
                a, b, c, d = j * 4 + i, j * 4 + i + 1, (j + 1) * 4 + i + 1, (j + 1) * 4 + i
                F += [[a, b, c], [a, c, d]]; M += [1 if (i != 1 and j != 1) else 0] * 2
        F = np.array(F); M = np.array(M); N = np.tile([sa, ca, 0.0], (len(G), 1))
        for mm in (0, 1):
            sel = F[M == mm]
            acc.add(G, N, sel, np.tile(glow if mm else ls * 0.9, (len(sel), 1)), 'window', mat=mm)
    # the wide roof: a low square pyramid with soft upturned eaves, and the jewel knob
    zr = zf + 0.056
    rows = [(0.0, 0.010, None), (0.004, 0.132, None), (0.022, 0.140, None), (0.040, 0.100, None), (0.068, 0.036, None)]
    def roof_col(Vw, F, Vl):
        return np.tile(ld, (len(F), 1)) * (0.9 + 0.12 * sstep(0.0, 0.06, Vl[F].mean(1)[:, 2]))[:, None]
    revolve(acc, rows, 4, np.eye(3), (0, 0, zr), roof_col, 'lantern', close_top=True, phase=PI / 4)
    ellipsoid(acc, (0, 0, zr + 0.088), np.eye(3), (0.028, 0.028, 0.032), ls, nu=8, nv=4, tag='lantern',
              colf=lambda V, N, F: sc(V, N, F))

# ================================================================== elder beard (variant)
def build_beard(acc, pal):
    bc, bd = lin(pal['beard']), lin(pal['beard_dk'])
    # cloud outline in front-view coordinates: a moustache under the nose, three fat lobes at the bottom
    top = [(-0.215, 0.300), (-0.160, 0.352), (-0.085, 0.358), (-0.030, 0.336), (0.0, 0.330), (0.030, 0.336),
           (0.085, 0.358), (0.160, 0.352), (0.215, 0.300), (0.236, 0.215)]
    xb = np.linspace(0.226, -0.226, 25)   # four round lobes under a centre parting
    bot = list(zip(xb, 0.142 - 0.052 * np.abs(np.sin(PI * xb / 0.113)) ** 0.55))
    P = np.array(top + bot + [(-0.236, 0.215)])
    B = ccw(resample_loop(chaikin(ccw(P), 2), 64))
    def mid(s, t_):
        s = np.asarray(s, float); t_ = np.asarray(t_, float)
        zc = np.clip(t_, 0.06, 0.40)
        off = 0.012 + 0.058 * sstep(0.345, 0.27, zc) * (0.6 + 0.4 * (1 - sstep(0.15, 0.08, zc)))
        off = off + 0.012 * np.abs(np.cos(PI * s / 0.113)) ** 1.5 * sstep(0.30, 0.20, zc)   # clumps over the lobes
        P_, n_ = surf_front(np.clip(s, -0.36, 0.36), zc, off)
        return P_
    def colf(P, N, T, cen):
        k = 0.88 + 0.14 * sstep(-0.5, 0.7, N[:, 2]); return (bc[None] * k[:, None])[T]
    shell(acc, mid, B, 0.022, 0.022, [], bc, bd, n_ring1=48, n_ring2=34, interior=0.075,
          tag='beard', bottom=True, colf=colf, bulge_w=0.05)

# ================================================================== lids (separate part)
def build_lids(acc, pal):
    lc = mix(pal['stone'], pal['stone_hi'], 0.55)
    for sx in (-1, 1):
        B = ccw(ellipse(sx * EYE_SC, EYE_SZ, EYE_SA + 0.008, EYE_SB + 0.008, 22))
        t = np.linspace(-1, 1, 7)
        path = np.stack([sx * EYE_SC + t * 0.050, EYE_SZ - 0.004 - 0.016 * (1 - t ** 2)], -1)
        line = stroke(path, 0.0062)
        def mid(s, t_): return surf_front(s, t_, 0.004)[0]
        def colf(P, N, T, cen, line=line):
            k = 0.92 + 0.10 * sstep(-0.3, 0.6, N[:, 2]); c = (lc[None] * k[:, None])[T]
            c[inside(line, cen)] = lin(pal['closed']); return c
        shell(acc, mid, B, 0.008, 0.006, [(line, lin(pal['closed']))], lc, n_ring1=16, n_ring2=10, interior=0.07,
              tag='lids', bottom=False, sink=0.006, colf=colf, bulge_w=0.04)

# ================================================================== arms (separate parts)
ARM_PIVOT = np.array([0.415, -0.02, 0.425])
def build_arm(acc, pal, sx):
    piv = ARM_PIVOT * [sx, 1, 1]
    stone, under = lin(pal['stone']), lin(pal['under'])
    armc = stone * 0.70 + under * 0.30
    # the egg-shaped stone mitt, hanging out and down from the ball joint (front view: 0.17 wide, z 0.135-0.445;
    # side view: 0.21 deep), its foot leaning out a little
    c = piv + np.array([sx * 0.062, 0.0, -0.125])
    R = rot_y(-sx * 0.13)
    def egg_col(V, N, F):
        n = nz(N); k = 0.86 + 0.20 * sstep(-0.6, 0.8, n[:, 2] * 0.7 + n[:, 0] * sx * 0.3)
        return (armc[None] * k[:, None])[F]
    ellipsoid(acc, c, R, (0.086, 0.106, 0.160), armc, nu=12, nv=8, tag='arm', colf=egg_col)
    def ball_col(V, N, F):
        k = 0.9 + 0.16 * sstep(-0.4, 0.8, nz(N)[:, 2]); return (under[None] * k[:, None])[F]
    ellipsoid(acc, piv + np.array([sx * 0.004, 0, 0.0]), np.eye(3), (0.054, 0.058, 0.054), under, nu=9, nv=5, tag='ball', colf=ball_col)

# ================================================================== scene + export
def make_materials():
    m = bpy.data.materials.new('toon'); m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    g = bpy.data.materials.new('glow'); g.use_nodes = True
    nt = g.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0; bsdf.inputs['Roughness'].default_value = 0.8
    return m, g

def build_variant(key):
    pal = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    toon, glow = make_materials()
    rng = np.random.default_rng(RNG_SEED)
    body = Acc()
    build_core(body, pal); build_moss(body, pal, rng); build_brows(body, pal); build_nose(body, pal)
    build_rope(body, pal); build_knot(body, pal); build_shide(body, pal); build_feet(body, pal); build_shoots(body, pal)
    if pal.get('lantern_on'): build_lantern(body, pal)
    if pal.get('elder'): build_beard(body, pal)
    lids = Acc(); build_lids(lids, pal)
    arms = {}
    for name, sx in (('armL', 1), ('armR', -1)):
        a = Acc(); build_arm(a, pal, sx); arms[name] = (a, ARM_PIVOT * [sx, 1, 1])
    obs = [body.to_object('body', [toon, glow] if pal.get('lantern_on') else [toon]), lids.to_object('lids', [toon])]
    for name, (a, piv) in arms.items(): obs.append(a.to_object(name, [toon], origin=tuple(piv)))
    stats = {'variant': key, 'body': body.tris(), 'lids': lids.tris(), 'armL': arms['armL'][0].tris(),
             'armR': arms['armR'][0].tris()}
    stats['total'] = stats['body'] + stats['lids'] + stats['armL'] + stats['armR']
    stats['body_parts'] = body.log
    allv = np.vstack([np.vstack(body.V), np.vstack(arms['armL'][0].V), np.vstack(arms['armR'][0].V)])
    stats['bounds_min'] = allv.min(0).round(4).tolist(); stats['bounds_max'] = allv.max(0).round(4).tolist()
    return obs, stats

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_normals=True,
                              export_lights=False, export_cameras=False, export_animations=False, export_materials='EXPORT',
                              export_texcoords=False, export_tangents=False)

def main():
    only = arg('--variant')
    keys = [only] if only else ['lantern', 'elder', 'base']   # base last: its scene is the one saved
    allstats = []
    for key in keys:
        obs, st = build_variant(key)
        out = os.path.join(MODELS, VARIANTS[key]['file'] + '.glb')
        export(out); st['glb'] = out; allstats.append(st)
        print('BUILT', json.dumps(st))
        if key == 'base':
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'iwabozu.blend'), compress=True)
    with open(os.path.join(TASK_DIR, 'build_stats.json' if not only else f'build_stats_{only}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=2)

main()
