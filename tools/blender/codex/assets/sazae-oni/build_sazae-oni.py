"""Sazae-oni (Tide Caves zone tank, EN-1): deterministic build of Option A "Turban Oni".

Blender 4.3:
  blender --background --factory-startup --python build_sazae-oni.py [-- --variant base|hotaru|elder]

Builds every variant from an empty scene and exports public/models/sazae-oni.glb, sazae-oni_hotaru.glb and
sazae-oni_elder.glb, then saves sazae-oni.blend (the base variant). Units: metres, front = -Y, ground z = 0.

Parts (the enemy contract + the brief; the same pivots in every variant):
  body    the turban shell (no spines), its rolled lip, the dark throat, the frilly snail foot      origin (0, 0, 0)
  spines  all 16 spines with their root collars, one object                                        origin (0, 0, 0)
  head    the oni face, horns, seaweed tuft, both paws (Elder: the beard)                           origin HEAD_PIVOT
  lid     the operculum with its spiral, closing the mouth                                          origin (0, 0, 0)
Vertex colour only (face-corner FLOAT_COLOR `Col`), one material `toon`, no UVs, no rig. The Hotaru's plankton
spots and spine tips glow by colour (#bff4ff, the brief's glow note), so there is no `glow` material.

Technique
- The shell is a helical grid: its rows are the whorl helices themselves (w = W(z) - a / 2pi = const), so every
  band border is an edge loop, and the whorls swell between their sutures row by row. The mouth is a plane cut
  (tilted 29 deg, top forward, like the sheet's hood): everything in front of the plane is folded back into a
  dark cavity, and the rolled two-tone lip sits on the rim, hiding the fold.
- The face features are single-sided decals 2.5-4 mm above the head, triangulated with a constrained Delaunay in
  design coordinates where every colour border is a constraint loop, then ray-projected onto the head.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

print('SAZAE build pid', os.getpid(), flush=True)
TASK_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
PI, TAU = math.pi, 2 * math.pi

# ================================================================== dimensions (m)
HEAD_PIVOT = np.array([0.0, -0.32, 0.30])
# the mouth plane: through MP0 (the rim's top), tilted BETA from vertical (top forward)
BETA = math.radians(14)
MN = np.array([0.0, -math.cos(BETA), -math.sin(BETA)])     # its normal, out of the mouth (forward and down)
MV = np.array([0.0, -math.sin(BETA), math.cos(BETA)])      # up along the plane
MU = np.array([1.0, 0.0, 0.0])
MP0 = np.array([0.0, -0.352, 0.420])
CAV_D = 0.09                                                 # cavity depth behind the plane

# the shell profile (from the sheet's front and side views; centre cx, cy; half width Wx; front / back half depth)
#            z      cx      cy      Wx     Yf     Yb
PROF = np.array([
    [0.030, 0.000, 0.000, 0.270, 0.280, 0.280],
    [0.060, 0.000, 0.000, 0.300, 0.318, 0.312],
    [0.110, 0.000, 0.000, 0.322, 0.345, 0.338],
    [0.200, 0.000, 0.000, 0.333, 0.358, 0.352],
    [0.300, 0.000, 0.000, 0.336, 0.362, 0.362],
    [0.430, -0.004, -0.010, 0.325, 0.358, 0.336],
    [0.520, -0.007, -0.015, 0.305, 0.308, 0.305],
    [0.650, -0.010, -0.012, 0.256, 0.258, 0.262],
    [0.757, -0.028, -0.045, 0.184, 0.178, 0.185],
    [0.800, -0.045, -0.085, 0.140, 0.130, 0.135],
])
ZCAP0, ZAPEX = 0.800, 0.878                                  # the rounded apex cap
APEX_C = (-0.085, -0.160)
ZB, ZT = 0.035, 0.862                                        # helical grid z range (bottom ring, top ring)
NCOL, MROW = 24, 5                                           # helical grid: columns, rows per whorl
WQ, WC, WZ0, WPH = 0.50, 0.10, 0.06, -0.22                   # whorl pitch ratio per turn, offset, w = 0 height, phase
                                                             # (phase: a green crest crosses the front at z 0.57, the sheet's big front spine)

# ================================================================== palette (sRGB hex)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
COMMON = dict(eye='#292125', iris='#6e3e2c', catch='#ffffff', mouth='#292125', fang='#f6eedc', throat='#3a2a2e',
              throat2='#2e2226', lip='#f2e8d2')
VARIANTS = {
    'base':   dict(file='sazae-oni', shell='#5e7a66', band='#c8c09a', spine='#6e8270', tip='#ece4cc', skin='#e8705e',
                   horn='#f6eedc', hair='#4a8a4a', foot='#8a7e72', footEdge='#c8a898', lid='#d8c4a4', lidLine='#b69c78',
                   blush='#f2928a', brow='#292125', claw='#c85a4a'),
    'hotaru': dict(file='sazae-oni_hotaru', shell='#34548a', band='#7ab8d8', spine='#4a64a0', tip='#bff4ff', cone='#4a64a0', skin='#6aa0d8',
                   horn='#f8f2e4', hair='#3a8a8a', foot='#6a7288', footEdge='#a8b8d8', lid='#c8d0e0', lidLine='#98a4bc',
                   blush='#e8a0bc', brow='#292125', claw='#4e82bc', glow='#bff4ff', lip='#e8e4dc'),
    'elder':  dict(file='sazae-oni_elder', shell='#7a6a80', band='#d8c8d4', spine='#887a8a', tip='#f2eaee', skin='#7ab070',
                   horn='#ece4cc', hair='#5a8a3a', foot='#7a7268', footEdge='#b8aaa0', lid='#d4c8b8', lidLine='#ae9e8c',
                   blush='#e8a090', brow='#3a3236', claw='#5e9456', beard='#f4f0e4', barnacle='#e8e2d2',
                   barnHole='#4a4048', weed='#4e7a34', weed2='#6a9a44', elder=True, skip_spines=((82, 1), (100, 0))),
}

# ================================================================== small math
def nz(v, axis=-1):
    return v / np.maximum(np.linalg.norm(v, axis=axis, keepdims=True), 1e-12)
def sstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def catmull(cp, n_per=8):
    cp = np.asarray(cp, float); P = np.vstack([cp[0] * 2 - cp[1], cp, cp[-1] * 2 - cp[-2]]); out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n_per):
            t = k / n_per; t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(cp[-1]); return np.array(out)
def catmull_loop(cp, n_per=6):
    cp = np.asarray(cp, float); n = len(cp); out = []
    for i in range(n):
        p0, p1, p2, p3 = cp[(i - 1) % n], cp[i], cp[(i + 1) % n], cp[(i + 2) % n]
        for k in range(n_per):
            t = k / n_per; t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(out)
def resample_open(P, n):
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], n)
    return np.stack([np.interp(s, cum, P[:, k]) for k in range(P.shape[1])], -1)
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
    c, s = math.cos(rot), math.sin(rot); return ccw(np.stack([cx + c * x - s * y, cz + s * x + c * y], -1))
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
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)
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
def rmat(ax, ang):
    ax = nz(np.asarray(ax, float)); x, y, z = ax; c, s = math.cos(ang), math.sin(ang); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])
def frame(axis):
    a = nz(np.asarray(axis, float)); ref = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
    u = nz(np.cross(a, ref)); v = np.cross(a, u); return u, v, a
def weld(V, F, tol=1e-6):
    key = np.round(V / tol).astype(np.int64); _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel(); return V[first], inv[F]

# ================================================================== mesh accumulator
class Acc:
    def __init__(self): self.V = []; self.N = []; self.F = []; self.C = []; self.n = 0; self.log = {}; self.tags = []
    def add(self, V, F, FC, N=None, tag='part', orient=True):
        """V (n,3), F (m,3), FC per-face (m,3) or per-corner (m,3,3) LINEAR colour, N vertex normals (None: computed,
        area-weighted, after orienting the closed piece outward)."""
        V = np.asarray(V, float); F = np.asarray(F, int).copy(); FC = np.asarray(FC, float)
        if FC.ndim == 1: FC = np.tile(FC, (len(F), 1))
        if FC.ndim == 2: FC = np.repeat(FC[:, None, :], 3, 1)
        FC = FC.copy()
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
        ok = (area > 1e-10) & (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])
        F, FC = F[ok], FC[ok]
        if N is None:
            if orient and signed_volume(V, F) < 0: F = F[:, [0, 2, 1]]; FC = FC[:, [0, 2, 1]]
            N = vnormals(V, F)
        else:
            N = nz(np.asarray(N, float))
            fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
            flip = np.einsum('ij,ij->i', fn, N[F[:, 0]] + N[F[:, 1]] + N[F[:, 2]]) < 0
            F[flip] = F[flip][:, [0, 2, 1]]; FC[flip] = FC[flip][:, [0, 2, 1]]
        self.V.append(V); self.N.append(N); self.F.append(F + self.n); self.C.append(FC); self.n += len(V)
        self.log[tag] = self.log.get(tag, 0) + len(F); self.tags.append(tag)
    def tris(self): return sum(len(f) for f in self.F)
    def arrays(self): return np.vstack(self.V), np.vstack(self.N), np.vstack(self.F)
    def to_object(self, name, mat, origin):
        V = np.vstack(self.V) - np.asarray(origin); N = np.vstack(self.N); F = np.vstack(self.F); Cc = np.vstack(self.C)
        me = bpy.data.meshes.new(name)
        me.from_pydata(V.tolist(), [], F.tolist()); me.update()
        assert len(me.polygons) == len(F), 'from_pydata dropped faces'
        me.polygons.foreach_set('use_smooth', [True] * len(F))
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        rgba = np.concatenate([Cc.reshape(-1, 3), np.ones((len(F) * 3, 1))], 1)
        attr.data.foreach_set('color', rgba.astype(np.float32).ravel())
        me.color_attributes.active_color = attr; me.color_attributes.render_color_index = 0
        me.materials.append(mat)
        me.normals_split_custom_set_from_vertices(N.tolist())
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        ob.location = tuple(float(v) for v in origin)
        return ob

# ================================================================== loft helpers
def loft(rows):
    """rows: list of (n,3) loops (all the same n) or (1,3) poles. Returns V, F, band index per face, column per face."""
    V, idx = [], []
    for r in rows:
        r = np.atleast_2d(r); idx.append(list(range(len(V), len(V) + len(r)))); V.extend(r.tolist())
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

def axis_loft(base, axis, prof, sides, roll=0.0, lobes=None, bend=None):
    """a closed body of revolution about `axis` from `base`: prof = [(h, r), ...] rings, first/last r = 0 -> poles.
    lobes(theta, k) -> radial factor (k = ring index); bend(h) -> sideways offset vector (curved horns)."""
    u, v, a = frame(axis); c, s = math.cos(roll), math.sin(roll); u, v = c * u + s * v, -s * u + c * v
    th = np.arange(sides) / sides * TAU; rows = []
    for k, (h, r) in enumerate(prof):
        off = bend(h) if bend else 0.0
        if r <= 0: rows.append((base + a * h + off)[None]); continue
        rf = lobes(th, k) if lobes else 1.0
        rows.append(base + a * h + off + (r * rf * np.cos(th))[:, None] * u + (r * rf * np.sin(th))[:, None] * v)
    return loft(rows)

def ellipsoid(C, radii, Rm, segs, rings):
    rows = [np.array([[0, 0, -1.0]])]
    for k in range(1, rings):
        th = -PI / 2 + k / rings * PI
        a = np.arange(segs) / segs * TAU
        rows.append(np.stack([math.cos(th) * np.cos(a), math.cos(th) * np.sin(a), np.full(segs, math.sin(th))], -1))
    rows.append(np.array([[0, 0, 1.0]]))
    rows = [(r * np.asarray(radii)) @ Rm.T + C for r in rows]
    return loft(rows)

# ================================================================== surface projection (decals)
class Surface:
    def __init__(self, V, F, N=None):
        self.V, self.F = V, F; self.N = vnormals(V, F) if N is None else N
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in V], [tuple(f) for f in F])
    def project(self, pts, base, ex, ey, d, back=1.0):
        """design coordinates (u, v) -> surface points + interpolated normals: rays along d through base + u ex + v ey"""
        d = nz(np.asarray(d, float)); P, N = [], []
        for x, y in pts:
            o = base + ex * x + ey * y - d * back
            loc, fn, fi, dist = self.bvh.ray_cast(Vector(o), Vector(d))
            if loc is None:
                loc, fn, fi, dist = self.bvh.find_nearest(Vector(base + ex * x + ey * y))
                if loc is None: raise RuntimeError(f'decal point off the surface: {(x, y)}')
            tri = self.F[fi]; a, b, c = (self.V[t] for t in tri); p = np.array(loc)
            v0, v1, v2 = b - a, c - a, p - a
            d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
            den = d00 * d11 - d01 * d01; w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
            n = w0 * self.N[tri[0]] + w1 * self.N[tri[1]] + w2 * self.N[tri[2]]
            P.append(p); N.append(n / np.linalg.norm(n))
        return np.array(P), np.array(N)

def decal(acc, surf, layers, spacing, offset, tag, proj, dome=None, dome_d=0.02, own_normals=0.0):
    """layers: [(poly (k,2) CCW, colour)] in priority order (first match wins); triangles outside every layer are
    dropped. offset: metres above the surface; dome: extra height inside (ramps in over dome_d from the outer edge)"""
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
        m = inside(poly, cen) & ~taken; FC[m] = col; keep |= m; taken |= m
    F = F[keep]; FC = FC[keep]
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used)); V2 = V2[used]; F = remap[F]
    P, N = surf.project(V2, *proj)
    off = np.full(len(V2), offset)
    if dome:
        dd = dist_to_poly(layers[-1][0], V2)
        t = np.clip(dd / dome_d, 0, 1); off = off + dome * np.sqrt(t * (2 - t))
    Q = P + N * off[:, None]
    if own_normals > 0:
        fn = np.cross(Q[F[:, 1]] - Q[F[:, 0]], Q[F[:, 2]] - Q[F[:, 0]])
        flip = np.einsum('ij,ij->i', fn, N[F].sum(1)) < 0; F[flip] = F[flip][:, [0, 2, 1]]
        G_ = vnormals(Q, F); Nn = nz(N + (G_ - N) * own_normals)
    else:
        Nn = N
    acc.add(Q, F, FC, N=Nn, tag=tag)

def front_proj():
    """design (x, z) -> rays along +Y (the front view)"""
    return (np.zeros(3), np.array([1.0, 0, 0]), np.array([0, 0, 1.0]), np.array([0, 1.0, 0]))
def local_proj(P, n):
    """design (u, v) in the tangent frame at P -> rays along -n"""
    u, v, a = frame(n); return (np.asarray(P, float), u, v, -a)

# ================================================================== the shell
def _smooth_table():
    zf = np.linspace(-0.1, 1.0, 1101); cols = []
    for k in range(1, 6):
        y = np.interp(zf, PROF[:, 0], PROF[:, k])
        g = np.exp(-0.5 * (np.arange(-60, 61) / 22.0) ** 2); g /= g.sum()
        yp = np.pad(y, 60, mode='edge'); cols.append(np.convolve(yp, g, mode='valid'))
    return zf, np.stack(cols, -1)
ZF, PF = _smooth_table()

def profile(z):
    """smoothed (cx, cy, Wx, Yf, Yb) at heights z; above ZCAP0 the apex cap rounds the widths to 0 at ZAPEX"""
    z = np.atleast_1d(np.asarray(z, float))
    P = np.stack([np.interp(np.minimum(z, ZCAP0), ZF, PF[:, k]) for k in range(5)], -1)
    over = z > ZCAP0
    if over.any():
        t = np.clip((z[over] - ZCAP0) / (ZAPEX - ZCAP0), 0, 1)
        f = np.sqrt(np.maximum(1 - t * t, 0)) * (1 - 0.35 * t)
        P[over, 2:] *= f[:, None]
        P[over, 0] = P[over, 0] + (APEX_C[0] - P[over, 0]) * t ** 1.5
        P[over, 1] = P[over, 1] + (APEX_C[1] - P[over, 1]) * t ** 1.5
    return P

def W_of_z(z): return np.log((ZAPEX + WC - WZ0) / (ZAPEX + WC - np.asarray(z, float))) / math.log(1 / WQ) + WPH
def z_of_W(w): return ZAPEX + WC - (ZAPEX + WC - WZ0) * WQ ** (np.asarray(w, float) - WPH)

def ring_pt(a, z, swell=0.0):
    """the superellipse ring point at angle a (direction (cos a, sin a)), height z; swell = radial factor - 1"""
    a = np.asarray(a, float); z = np.asarray(z, float)
    P = profile(z.ravel()).reshape(z.shape + (5,))
    c, s = np.cos(a), np.sin(a)
    pf, pb = 2.1, 2.3
    ex = np.where(True, 2 / pf, 2 / pf)
    x = P[..., 2] * np.sign(c) * np.abs(c) ** ex
    ys = np.where(s < 0, P[..., 3] * np.sign(s) * np.abs(s) ** (2 / pf), P[..., 4] * np.sign(s) * np.abs(s) ** (2 / pb))
    k = 1 + swell
    return np.stack([P[..., 0] + x * k, P[..., 1] + ys * k, z], -1)

def swell_of(f, z):
    """the whorl relief: dips at the suture (f = 0), swells over the whorl"""
    A = 0.070 * (1 - 0.45 * np.clip((z - 0.1) / 0.75, 0, 1)) * sstep(0.05, 0.12, z) * (1 - sstep(0.80, 0.86, z))
    g = np.where(f > 0.38, np.sin(PI * np.clip((f - 0.38) / 0.62, 0, 1)) ** 0.7, 0.0)      # the green whorl bulges, the cream band lies in the groove
    return A * (g - 0.40)

KAPPA = 1.2                                                  # the hood's sideways sweep back (m^-1)
def mouth_s(P):
    """signed distance in front of the (curved) mouth cut along MN (> 0: inside the cut)"""
    P = np.asarray(P); u = (P - MP0) @ MU
    return (P - MP0) @ MN + KAPPA * u * u
def cut_normal(P):
    """the cut surface's normal at P (forward, tipping out sideways)"""
    u = (np.asarray(P) - MP0) @ MU; return nz(MN + 2 * KAPPA * np.multiply.outer(u, MU) if np.ndim(u) else MN + 2 * KAPPA * u * MU)
def on_cut(C, q, off=0.0):
    """in-cut design coords (u, v) round C -> the point on the cut surface (plus off along MN)"""
    q = np.atleast_2d(q)
    return C + np.outer(q[:, 0], MU) + np.outer(q[:, 1], MV) + np.outer(off - KAPPA * q[:, 0] ** 2, MN)

def shell_eval(a, z):
    """an on-surface point (helix-consistent swelling) for placing spines and dots"""
    f = np.mod(W_of_z(z) + a / TAU, 1.0)               # (the grid runs clockwise: the sheet's spiral rises to the right)
    return ring_pt(a, z, swell_of(f, z))

def crest_z(a, z, f0=0.70):
    """the height near z where the whorl at angle a crests (the green bulge: spines and spots sit there)"""
    w = W_of_z(z) + a / TAU; wt = math.floor(w - f0 + 0.5) + f0
    return float(np.clip(z_of_W(wt - a / TAU), 0.16, 0.83))

def shell_normal(a, z, e=0.004):
    p = shell_eval(a, z); pa = shell_eval(a + e / 0.3, z) - shell_eval(a - e / 0.3, z)
    pz = shell_eval(a, z + e) - shell_eval(a, z - e)
    n = nz(np.cross(pa, pz)); c = p - np.array([*profile(z)[0][:2], z])
    if n @ c < 0: n = -n
    return p, n

def build_shell(acc, pal):
    """the helical grid shell, cut by the mouth plane; returns the pre-cut surface (for the rim) and the cut mesh"""
    N, M = NCOL, MROW
    i0 = int(math.floor((W_of_z(ZB) - 1) * M)) - 1; i1 = int(math.ceil(W_of_z(ZT) * M)) + 1
    I = np.arange(i0, i1 + 1); J = np.arange(N)
    aj = J / N * TAU
    wv = I[:, None] / M + aj[None, :] / TAU                    # the whorl height of each vertex (row i, column j)
    zraw = z_of_W(wv)
    z = np.clip(zraw, ZB, ZT)
    f = np.mod(I / M, 1.0)[:, None] * np.ones((1, N))
    sw = swell_of(f, z)
    P = ring_pt(np.broadcast_to(-aj, z.shape), z, sw)
    idx = np.arange(P.shape[0] * N).reshape(P.shape[0], N)
    V = P.reshape(-1, 3)
    F, rowk, zc = [], [], []
    for ii in range(len(I) - 1):
        for j in range(N):
            a0 = idx[ii, j]; b0 = idx[ii + 1, j]
            if j + 1 < N: a1 = idx[ii, j + 1]; b1 = idx[ii + 1, j + 1]
            else:
                if ii + M + 1 >= len(I): continue
                a1 = idx[ii + M, 0]; b1 = idx[ii + M + 1, 0]
            F.append((a0, a1, b1)); F.append((a0, b1, b0)); rowk += [I[ii] % M] * 2; zc += [I[ii] / M + j / N] * 2
    F = np.array(F); rowk = np.array(rowk); wf = np.array(zc)
    # the top cap (rings up to the apex) and the bottom cap, from the clamped rows
    V, F = weld(V, F)
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; ok = np.linalg.norm(np.cross(b - a, c - a), axis=1) > 1e-10
    F, rowk, wf = F[ok], rowk[ok], wf[ok]
    # the ring vertices at ZT and ZB (one per column after the weld)
    top = np.where(np.abs(V[:, 2] - ZT) < 1e-7)[0]; bot = np.where(np.abs(V[:, 2] - ZB) < 1e-7)[0]
    def ang(ids):
        pr = profile(V[ids, 2]); return np.arctan2(V[ids, 1] - pr[:, 1], V[ids, 0] - pr[:, 0])
    top = top[np.argsort(ang(top))]; bot = bot[np.argsort(ang(bot))]
    capF, capC = [], []
    nv = len(V); extra = []
    # top: one more ring then the pole
    at = ang(top); zt2 = 0.872
    pole = ring_pt(np.array([0.0]), np.array([ZAPEX])); r2 = pole + (V[top] - pole) * 0.55; r2[:, 2] = V[top, 2] + (ZAPEX - V[top, 2]) * 0.62
    extra += list(r2) + list(pole)
    t2 = nv + np.arange(len(top)); tp = nv + len(top)
    for k in range(len(top)):
        k1 = (k + 1) % len(top)
        capF += [(top[k], top[k1], t2[k1]), (top[k], t2[k1], t2[k]), (t2[k], t2[k1], tp)]
    nv2 = nv + len(top) + 1
    ab = ang(bot); bring = []
    for kk, (kf, zz) in enumerate(((0.55, ZB - 0.010),)):                  # (hidden in the foot: one ring + a pole)
        pr = profile(np.full(len(ab), ZB))
        rp = ring_pt(ab, np.full(len(ab), ZB)); cc = np.stack([pr[:, 0], pr[:, 1], np.full(len(ab), zz)], -1)
        rp = cc + (rp - np.stack([pr[:, 0], pr[:, 1], np.full(len(ab), ZB)], -1)) * kf
        rp[:, 2] = zz; extra += list(rp); bring.append(nv2 + kk * len(bot) + np.arange(len(bot)))
    bpole = nv2 + 1 * len(bot); prb = profile(np.array([ZB]))[0]; extra.append(np.array([prb[0], prb[1], ZB - 0.013]))
    rings = [bot] + bring
    for r0, r1 in zip(rings[:-1], rings[1:]):
        for k in range(len(bot)):
            k1 = (k + 1) % len(bot)
            capF += [(r0[k], r1[k1], r0[k1]), (r0[k], r1[k], r1[k1])]
    for k in range(len(bot)):
        k1 = (k + 1) % len(bot); capF.append((bring[-1][k], bpole, bring[-1][k1]))
    V = np.vstack([V, np.array(extra)]); capF = np.array(capF)
    # orient every face outward on its own (grid, top cap, bottom cap): the normal against the axis-outward direction
    def orient(FF, out):
        fn = np.cross(V[FF[:, 1]] - V[FF[:, 0]], V[FF[:, 2]] - V[FF[:, 0]])
        bad = np.einsum('ij,ij->i', fn, out) < 0; FF = FF.copy(); FF[bad] = FF[bad][:, [0, 2, 1]]; return FF
    cg = V[F].mean(1); pr = profile(cg[:, 2])
    F = orient(F, cg - np.stack([pr[:, 0], pr[:, 1], np.full(len(cg), 0.45)], -1))
    cc = V[capF].mean(1)
    capF = orient(capF, np.where((cc[:, 2] > 0.5)[:, None], cc - np.array([APEX_C[0], APEX_C[1], 0.80]), np.array([0, 0, -1.0])))
    F = np.vstack([F, capF]); rowk = np.concatenate([rowk, np.full(len(capF), -1)]); wf = np.concatenate([wf, np.full(len(capF), 99.0)])
    if signed_volume(V, F) < 0: F = F[:, [0, 2, 1]]
    V0 = V.copy()
    # the colours: the cream band on rows 0-1 of every whorl (stopping near the apex), the shell green elsewhere
    sh, bd = lin(pal['shell']), lin(pal['band'])
    zc = V[F].mean(1)[:, 2]
    band = (rowk >= 0) & (rowk <= 1) & (wf < W_of_z(0.79) - 0.07 * rowk)          # (the upper row ends first: a tapered stripe end)
    FC = np.where(band[:, None], bd, sh)
    # a gentle painted shading: a slightly darker underside and lower half
    shade = 0.86 + 0.14 * sstep(0.05, 0.4, zc)
    FC = FC * shade[:, None]
    # the mouth cut: the cap in front of the plane is flattened onto it (a graph over the plane: no folds), then
    # sunk into a bowl by its in-plane distance from the rim, so the rim is the only crease (under the lip)
    C, rim = rim_loop(V0, F)
    ruv = np.stack([(rim - C) @ MU, (rim - C) @ MV], -1)
    s = mouth_s(V); fr = s > 0
    V[fr] -= MN[None, :] * s[fr, None]
    uv = np.stack([(V[fr] - C) @ MU, (V[fr] - C) @ MV], -1)
    din = dist_to_poly(ruv, uv) * np.where(inside(ruv, uv), 1, 0)
    rr = np.linalg.norm(uv / np.array([0.30, 0.24]), axis=1)
    depth = CAV_D * sstep(0.0, 0.07, din) + 0.03 * np.clip(1 - rr ** 2, 0, 1) * sstep(0.0, 0.07, din)
    V[fr] -= MN[None, :] * depth[:, None]
    dall = np.zeros(len(V)); dall[fr] = din
    thr = lin(pal.get('throat', COMMON['throat'])); thr2 = lin(COMMON['throat2'])
    allf = fr[F].all(1)
    FC = np.where((allf & (dall[F].min(1) > 0.0))[:, None], thr, FC)
    FC = np.where((allf & (dall[F].min(1) > 0.06))[:, None], thr2, FC)
    acc.add(V, F, FC, tag='shell')
    return V0, F, V, C, rim

def rim_loop(V0, F0, n=72):
    """the mouth rim: the pre-cut shell met by the plane, as a loop round the mouth centre (in-plane rays)"""
    bvh = BVHTree.FromPolygons([tuple(v) for v in V0], [tuple(f) for f in F0])
    C = MP0 + MV * -0.20; P = []
    def ins(q):
        loc, nn, fi, dist = bvh.find_nearest(Vector(q))
        return (np.array(loc) - q) @ np.array(nn) > 0
    for k in range(n):
        th = k / n * TAU; d = np.array([math.cos(th), math.sin(th)])
        lo, hi = 0.0, 0.7
        for _ in range(30):                                     # bisection along the curved cut, out from C
            mid = (lo + hi) / 2
            if ins(on_cut(C, d * mid)[0]): lo = mid
            else: hi = mid
        P.append(on_cut(C, d * lo)[0])
    return C, np.array(P)

def build_lip(acc, pal, C, rim):
    """the rolled two-tone lip on the rim: pale pearl on the inner half, the band cream outside"""
    uv = np.stack([(rim - C) @ MU, (rim - C) @ MV], -1)
    th = np.arctan2(uv[:, 1], uv[:, 0])
    # keep the arch above the foot: from the bottom-right, over the top, to the bottom-left
    keep = rim[:, 2] > 0.075
    ids = np.where(keep)[0]
    # order the kept points by angle from -90 deg going round through the top
    tt = np.mod(th[ids] + PI / 2, TAU); ids = ids[np.argsort(tt)]
    path = rim[ids]
    # extend both ends down into the foot
    e0 = path[0] + (path[0] - path[1]) * 0 + np.array([0, 0, -0.05]); e1 = path[-1] + np.array([0, 0, -0.05])
    path = np.vstack([e0, path, e1])
    path = resample_open(catmull(path, 3), 22)
    path = path + MN * 0.016
    sides = 8; T = np.gradient(path, axis=0); T = nz(T)
    rows, cols = [], []
    for i in range(len(path)):
        cn = cut_normal(path[i]); nrm = cn - T[i] * (cn @ T[i]); nrm = nz(nrm)
        b = nz(np.cross(T[i], nrm))
        rad = (path[i] - C); rad = rad - MN * (rad @ MN); rad = nz(rad)
        if b @ rad < 0: b = -b                                  # b points out of the mouth (in-plane)
        w, t = 0.050, 0.044                                     # half width in the plane, half thickness along MN
        ang = np.arange(sides) / sides * TAU
        rows.append(path[i] + np.outer(np.cos(ang) * w, b) + np.outer(np.sin(ang) * t, nrm))
    # caps: poles slightly past the ends
    rows = [path[0] - T[0] * 0.02] + rows + [path[-1] + T[-1] * 0.02]
    rows = [np.atleast_2d(r) for r in rows]
    V, F, band, colm = loft(rows)
    ang_c = (colm + 0.5) / sides * TAU                         # the face's mid angle round the section
    inner = np.cos(ang_c) < 0.0                                # toward the mouth: pearl
    FC = np.where(inner[:, None], lin(pal.get('lip', COMMON['lip'])), lin(pal['band']))
    acc.add(V, F, FC, tag='lip')

def build_foot(acc, pal):
    seg = 28; th = np.arange(seg) / seg * TAU
    cx, cy, A, B = 0.0, 0.02, 0.385, 0.378
    def ring(k, z, wave_r=0.0, wave_z=0.0):
        r = k * (1 + wave_r * np.sin(th * 7 + 0.4))
        zz = z + wave_z * np.sin(th * 7 + 0.4 + 0.6)
        return np.stack([cx + A * r * np.cos(th), cy + B * r * np.sin(th), zz], -1)
    rows = [np.array([[cx, cy, 0.0]]), ring(0.955, 0.008, 0.015), ring(1.0, 0.036, 0.05, 0.008),
            ring(0.975, 0.068, 0.07, 0.022), ring(0.885, 0.092, 0.06, 0.022), ring(0.72, 0.100), np.array([[cx, cy, 0.104]])]
    V, F, band, colm = loft(rows)
    dark, edge = lin(pal['foot']), lin(pal['footEdge'])
    FC = np.where((band >= 2)[:, None], edge, dark)
    FC = np.where((band == 2)[:, None], edge * 0.94, FC)
    acc.add(V, F, FC, tag='foot')

# ================================================================== spines
#  (compass phi deg: 0 = front (-Y), 90 = +X), z, size class, elevation deg
#  (compass phi deg: 0 = front (-Y), 90 = +X), whorl k, size class, elevation deg: each sits on its whorl's green crest
SPINES = [
    (0, 0, 'L', 24), (52, 0, 'L', 20), (100, 0, 'L', 16), (145, 0, 'L', 14), (190, 0, 'L', 12), (236, 0, 'L', 12), (282, 0, 'L', 12),
    (22, 1, 'M', 40), (82, 1, 'M', 38), (142, 1, 'M', 36), (202, 1, 'M', 36), (262, 1, 'M', 36), (322, 1, 'S', 38),
    (195, 2, 'S', 58),
]
SIZES = {'L': (0.054, 0.112, 0.076), 'M': (0.050, 0.102, 0.070), 'S': (0.044, 0.090, 0.062), 'A': (0.042, 0.086, 0.058)}

def spine_piece(acc, pal, B, d, size, sides=8):
    rc, L, Rc = size
    # one smooth 14-sided loft: a deep buried root (no gap when they bristle x1.12), a round collar, a fat cone, and a
    # rounded tip cap (the last 30 %: the only part the Hotaru's glow colour goes on)
    prof = [(-0.080, 0.0), (0.006, Rc), (0.028, Rc * 0.84), (0.036, rc),
            (0.034 + L * 0.70, rc * 0.46), (0.034 + L * 0.97, 0.0)]
    V, F, band, colm = axis_loft(B, d, prof, sides)
    cone = lin(pal.get('cone', pal['tip']))
    FC = np.where((band >= 3)[:, None], cone, lin(pal['spine']))
    FC = np.where((band >= 4)[:, None], lin(pal['tip']), FC)
    acc.add(V, F, FC, tag='spine')

def build_spines(acc, pal):
    out = []
    for phi, k, cls, el in SPINES:
        if (phi, k) in pal.get('skip_spines', ()): continue      # (the Elder: the two its weed and barnacles grow over)
        a = math.radians(phi) - PI / 2
        p, n = shell_normal(a, float(z_of_W(k + 0.70 - a / TAU)))
        hr = nz(np.array([n[0], n[1], 0.0])); e = math.radians(el)
        d = nz(0.45 * n + 0.55 * (hr * math.cos(e) + np.array([0, 0, 1.0]) * math.sin(e)))
        spine_piece(acc, pal, p, d, SIZES[cls], 14); out.append((p, d))
    # the apex spine, up and a little forward
    apex = ring_pt(np.array([0.0]), np.array([ZAPEX]))[0]
    d = nz(np.array([-0.15, -0.38, 0.91]))
    spine_piece(acc, pal, apex - d * 0.012, d, SIZES['A'], 14)
    return out

# ================================================================== the head
HX, HYC, HYF, HYB = 0.230, -0.318, 0.135, 0.13
HEAD_RINGS = [(0.070, 0.0), (0.072, 0.70), (0.090, 0.90), (0.130, 0.985), (0.185, 1.0), (0.235, 0.962), (0.280, 0.855),
              (0.322, 0.70), (0.348, 0.52), (0.362, 0.28), (0.368, 0.0)]
def head_body(seg=20):
    th = np.arange(seg) / seg * TAU - PI / 2              # (a vertex column straight at the front)
    c, s = np.cos(th), np.sin(th); p = 2.5
    rows = []
    for z, k in HEAD_RINGS:
        if k == 0: rows.append(np.array([[0.0, HYC - 0.01, z]])); continue
        x = HX * k * np.sign(c) * np.abs(c) ** (2 / p)
        y = HYC + np.where(s < 0, HYF, HYB) * k * np.sign(s) * np.abs(s) ** (2 / p)
        # the face sags a touch forward low down (a mochi), the top tips back
        y = y - 0.012 * sstep(0.25, 0.07, z) * (s < 0)
        rows.append(np.stack([x, y, np.full(seg, z)], -1))
    return loft(rows)

def eye_outline(k):
    """the angry eye (k = +1 the creature's left = +X): a round eye whose top is cut by the brow slope (inner low)"""
    cx, cz, a, b = k * 0.097, 0.188, 0.045, 0.048
    t = np.linspace(0, TAU, 64, endpoint=False); lx = a * np.cos(t); lz = b * np.sin(t)
    lid = 0.034 + 0.28 * (lx * k)                         # the lid line: low at the inner end, high at the outer
    lz = np.where(lz > -0.01, smin(lz, lid, 0.012), lz)
    return ccw(resample_loop(np.stack([cx + lx, cz + lz], -1), 28))

def build_face(acc, surf, pal):
    P = front_proj()
    E, I_, Cc = lin(COMMON['eye']), lin(COMMON['iris']), lin(COMMON['catch'])
    for k in (-1, 1):
        eye = eye_outline(k)
        cx, cz = k * 0.097, 0.188
        # the warm-brown lower half of the iris: a crescent inside the eye
        iris = ellipse(cx, cz - 0.016, 0.034, 0.024, 18)
        iris = np.array([q for q in iris])
        c1 = ellipse(cx - k * 0.014, cz + 0.011, 0.0135, 0.0135, 10)       # the big catchlight (inner, high)
        c2 = ellipse(cx + k * 0.019, cz - 0.021, 0.0062, 0.0062, 7)        # the small one (outer, low)
        decal(acc, surf, [(c1, Cc), (c2, Cc), (iris, I_), (eye, E)], 0.026, 0.003, 'eyes', P, dome=0.005, dome_d=0.02)
        # the brow: a chunky stroke over the lid, inner end low
        bp = np.array([[k * 0.054, 0.218], [k * 0.090, 0.234], [k * 0.122, 0.250], [k * 0.136, 0.255]])
        bpc = catmull(bp, 3)
        brow = stroke(bpc, np.interp(np.linspace(0, 1, len(bpc)), [0, 0.5, 1], [0.0115, 0.0125, 0.010]), ncap=5)
        decal(acc, surf, [(brow, lin(pal['brow']))], 0.02, 0.0035, 'brows', P, dome=0.004, dome_d=0.01)
        # the blush
        bl = ellipse(k * 0.158, 0.140, 0.034, 0.020, 12)
        decal(acc, surf, [(bl, lin(pal['blush']))], 0.03, 0.0025, 'blush', P)
        # the fang: a little rounded triangle pointing up from the mouth line
        fx = k * 0.060
        fang = catmull_loop(np.array([[fx - 0.015, 0.127], [fx + 0.015, 0.127], [fx + 0.009, 0.148], [fx, 0.157], [fx - 0.009, 0.148]]), 3)
        fang = ccw(resample_loop(fang, 14))
        decal(acc, surf, [(fang, lin(COMMON['fang']))], 0.02, 0.003, 'fangs', P, dome=0.009, dome_d=0.012, own_normals=0.6)
    # the small smile (a soft cat-mouth w)
    mp = np.array([[-0.036, 0.142], [-0.020, 0.133], [-0.006, 0.131], [0.0, 0.135], [0.006, 0.131], [0.020, 0.133], [0.036, 0.142]])
    mo = stroke(catmull(mp, 2), 0.0062, ncap=3)
    decal(acc, surf, [(mo, lin(COMMON['mouth']))], 0.02, 0.003, 'mouth', P, dome=0.002, dome_d=0.006)

def build_horns(acc, surf, pal):
    for k in (-1, 1):
        P, N = surf.project(np.array([[k * 0.124, 0.292]]), *front_proj())
        base = P[0]; d = nz(np.array([k * 0.30, -0.18, 1.0]))
        prof = [(-0.03, 0.0), (-0.022, 0.034), (0.004, 0.036), (0.040, 0.028), (0.066, 0.018), (0.082, 0.0)]
        bend = lambda h, k=k: np.array([k * 0.10, 0, 0]) * (max(h, 0) / 0.097) ** 2 * 0.12
        V, F, band, colm = axis_loft(base, d, prof, 8, bend=bend)
        FC = np.full((len(F), 3), lin(pal['horn']))
        acc.add(V, F, FC, tag='horns')

def build_tuft(acc, pal):
    """the seaweed tuft: a lobed rosette on the head's top-front, leaning forward"""
    base = np.array([0.0, -0.372, 0.340]); d = nz(np.array([0.0, -0.75, 1.0]))
    lob = 7
    def lobes(th, k):
        depth = [0.0, 0.12, 0.30, 0.34, 0.36, 0.0][k] if k < 6 else 0.0
        return 1 - depth * (0.5 - 0.5 * np.cos(th * lob)) ** 1.2
    prof = [(-0.03, 0.0), (-0.015, 0.05), (0.014, 0.080), (0.050, 0.090), (0.080, 0.062), (0.100, 0.0)]
    V, F, band, colm = axis_loft(base, d, prof, 28, roll=PI / 2, lobes=lobes)
    hc = lin(pal['hair'])
    FC = np.where((band >= 3)[:, None], hc * 1.08, hc * 0.92)
    acc.add(V, F, FC, tag='tuft')

def build_paws(acc, surf, pal):
    sk = lin(pal['skin']); seam = lin(pal['claw'])
    for k in (-1, 1):
        C = np.array([k * 0.232, -0.338, 0.108]); R = np.array([0.058, 0.056, 0.047])
        Rm = rmat((0, 0, 1), k * -0.25) @ rmat((1, 0, 0), PI / 2)      # (poles along y: the front pole faces forward)
        V, F, band, colm = ellipsoid(C, R, Rm, 10, 6)
        V[:, 2] = np.maximum(V[:, 2], 0.072)                            # resting flat on the foot
        acc.add(V, F, sk, tag='paws')
        # the finger grooves: two short darker strokes on the paw's front
        ps = Surface(acc.V[-1], acc.F[-1] - (acc.n - len(acc.V[-1])), acc.N[-1])
        for gx in (-0.017, 0.017):
            path = np.array([[C[0] + gx, C[2] + 0.034], [C[0] + gx * 1.05, C[2] + 0.008], [C[0] + gx * 1.1, C[2] - 0.016]])
            g = stroke(catmull(path, 2), 0.0045, ncap=3)
            decal(acc, ps, [(g, seam)], 0.02, 0.0025, 'paws', front_proj())

def build_beard(acc, surf, pal):
    """the Elder's white beard: a puffy lobed cushion over the chin, under the smile"""
    C = np.array([0.0, -0.428, 0.098]); R = np.array([0.15, 0.05, 0.058])
    V, F, band, colm = ellipsoid(C, R, np.eye(3), 10, 5)
    # scallops round its lower edge
    ang = np.arctan2(V[:, 2] - C[2], V[:, 0] - C[0])
    V[:, 2] = np.maximum(V[:, 2], 0.074)
    V[:, 1] += 0.01 * np.cos(np.arctan2(V[:, 0], 0.05) * 0)              # (keep)
    acc.add(V, F, lin(pal['beard']), tag='beard')

def build_lid(acc, pal, C, rim):
    """the operculum: a domed disc inside the lip, with a raised-looking spiral painted on its face"""
    uv = np.stack([(rim - C) @ MU, (rim - C) @ MV], -1)
    ctr = uv.mean(0) * 0
    K = 24
    th = np.arctan2(uv[:, 1], uv[:, 0]); o = np.argsort(th); uvl = uv[o]
    uvl = resample_loop(uvl, K)
    uvl = uvl * 0.93                                           # inset under the lip
    rows = []
    def at(scale, off):
        q = uvl * scale
        return on_cut(C, q, off)
    rows = [(C + MN * -0.040)[None], at(1.0, -0.012), at(1.0, 0.014), at(0.78, 0.044), at(0.42, 0.062),
            (C + MN * 0.068)[None]]
    V, F, band, colm = loft(rows)
    lc = lin(pal['lid'])
    FC = np.where((band <= 1)[:, None], lc * 0.82, lc)
    acc.add(V, F, FC, tag='lid')
    # the spiral: one stroke painted 3 mm above the face
    surf = Surface(acc.V[-1], acc.F[-1] - (acc.n - len(acc.V[-1])), acc.N[-1])
    t = np.linspace(0.35, 2.55 * TAU, 120)
    rmax = np.min(np.linalg.norm(uvl, axis=1)) * 0.9
    r = rmax * (t / t[-1]); sp = np.stack([r * np.cos(-t + 1.2), r * np.sin(-t + 1.2)], -1)
    sp = resample_open(sp, 32)
    hw = np.interp(np.linspace(0, 1, len(sp)), [0, 0.15, 1], [0.008, 0.0125, 0.0125])
    st = stroke(sp, hw, ncap=4)
    decal(acc, surf, [(st, lin(pal['lidLine']))], 0.04, 0.003, 'lid_spiral', (C, MU, MV, -MN))

# ================================================================== variant extras on the shell
#  (phi, whorl k, radius): the plankton sit on the green whorls between the spines
GLOW_SPOTS = [(26, 0, 0.032), (76, 0, 0.034), (122, 0, 0.030), (168, 0, 0.034), (213, 0, 0.030), (259, 0, 0.032),
              (52, 1, 0.028), (112, 1, 0.030), (172, 1, 0.028), (232, 1, 0.030), (292, 1, 0.028)]
def build_glow_spots(acc, surf, pal):
    g = lin(pal['glow'])
    for phi, k, r in GLOW_SPOTS:
        a = math.radians(phi) - PI / 2
        z = float(z_of_W(k + 0.62 - a / TAU))
        p, n = shell_normal(a, z)
        if mouth_s(p) > -0.04: continue
        dot = ellipse(0, 0, r, r, 10)
        decal(acc, surf, [(dot, g)], 0.02, 0.003, 'glow_spots', local_proj(p, n), dome=0.006, dome_d=0.015)

def build_barnacles(acc, pal):
    for phi, z, r in ((52, 0.700, 0.030), (70, 0.735, 0.026), (40, 0.760, 0.024)):
        a = math.radians(phi) - PI / 2
        p, n = shell_normal(a, crest_z(a, z, 0.66))
        prof = [(-0.03, 0.0), (0.006, r * 1.08), (0.024, r * 0.80), (0.028, r * 0.50), (0.014, r * 0.36), (0.010, 0.0)]
        V, F, band, colm = axis_loft(p, n, prof, 6)
        FC = np.where((band >= 3)[:, None], lin(pal['barnHole']), lin(pal['barnacle']))
        acc.add(V, F, FC, tag='barnacles', orient=False)

def build_weed(acc, pal):
    """the Elder's hanging weed: three lobed clumps down the shell's +X flank, broad faces out and up"""
    for phi, z, R in ((76, 0.640, 0.062), (86, 0.535, 0.058), (80, 0.430, 0.050)):
        a = math.radians(phi) - PI / 2
        p, n = shell_normal(a, z)
        def lobes(th, k):
            depth = [0.0, 0.12, 0.24, 0.26, 0.0][k] if k < 5 else 0.0
            return 1 - depth * (0.5 - 0.5 * np.cos(th * 4)) ** 1.5
        prof = [(-0.03, 0.0), (-0.01, R * 0.8), (0.022, R), (0.045, R * 0.7), (0.058, 0.0)]
        d = nz(n + np.array([0, 0, 0.25]))
        V, F, band, colm = axis_loft(p, d, prof, 12, lobes=lobes)
        FC = np.where((band >= 2)[:, None], lin(pal['weed2']), lin(pal['weed']))
        acc.add(V, F, FC, tag='weed')

# ================================================================== scene + export
def make_material():
    m = bpy.data.materials.new('toon'); m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    return m

def build_variant(key):
    pal = dict(COMMON); pal.update(VARIANTS[key])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    body = Acc()
    V0, F0, Vcut, C, rim = build_shell(body, pal)
    build_lip(body, pal, C, rim)
    build_foot(body, pal)
    shell_surf = Surface(*body.arrays()[::2]) if False else Surface(np.vstack(body.V[:1]), np.vstack(body.F[:1]))
    if 'glow' in pal: build_glow_spots(body, shell_surf, pal)
    if pal.get('elder'): build_barnacles(body, pal); build_weed(body, pal)
    spines = Acc(); spine_info = build_spines(spines, pal)
    head = Acc()
    HV, HF, _, _ = head_body()
    head.add(HV, HF, lin(pal['skin']), tag='head')
    hs = Surface(head.V[0], head.F[0] - 0, head.N[0])
    build_face(head, hs, pal)
    build_horns(head, hs, pal)
    build_tuft(head, pal)
    build_paws(head, hs, pal)
    if pal.get('elder'): build_beard(head, hs, pal)
    lid = Acc(); build_lid(lid, pal, C, rim)
    objs = {'body': body.to_object('body', mat, np.zeros(3)), 'spines': spines.to_object('spines', mat, np.zeros(3)),
            'head': head.to_object('head', mat, HEAD_PIVOT), 'lid': lid.to_object('lid', mat, np.zeros(3))}
    stats = {'variant': key, 'body': body.tris(), 'spines': spines.tris(), 'head': head.tris(), 'lid': lid.tris(),
             'body_parts': body.log, 'head_parts': head.log, 'lid_parts': lid.log}
    stats['total'] = stats['body'] + stats['spines'] + stats['head'] + stats['lid']
    stats['pivots'] = {'body': [0, 0, 0], 'spines': [0, 0, 0], 'head': HEAD_PIVOT.tolist(), 'lid': [0, 0, 0]}
    allV = np.vstack([np.vstack(a.V) for a in (body, spines, head, lid)])
    stats['bounds'] = [allV.min(0).round(4).tolist(), allV.max(0).round(4).tolist()]
    stats['zmin'] = {nm: {t: round(float(np.vstack([v for v, tg in zip(a.V, a.tags) if tg == t])[:, 2].min()), 4) for t in set(a.tags)} for nm, a in (('body', body), ('spines', spines), ('head', head), ('lid', lid))}
    stats['rim'] = {'top_z': float(rim[:, 2].max()), 'half_width_at_z.25': float(np.abs(rim[np.abs(rim[:, 2] - 0.25) < 0.04][:, 0]).max())}
    return objs, dict(body=body, spines=spines, head=head, lid=lid, rim=rim, C=C), stats

def checks(accs):
    """the head pulled in (scale 0.12 about its pivot) must sit behind the lid's face and inside the shell"""
    out = {}
    HV = np.vstack(accs['head'].V)
    small = HEAD_PIVOT + (HV - HEAD_PIVOT) * 0.12
    s = mouth_s(small); out['head_small_max_s'] = round(float(s.max()), 4)
    LV = np.vstack(accs['lid'].V); out['lid_front_s_min_centre'] = round(float(mouth_s(LV).max()), 4)
    # does the full-size head poke out through the shell's outside (vertices inside the head but outside the cavity)?
    BV = accs['body'].V[0]; BF = accs['body'].F[0]
    bvh = BVHTree.FromPolygons([tuple(v) for v in BV], [tuple(f) for f in BF])
    hv = accs['head'].V[0]; hb = BVHTree.FromPolygons([tuple(v) for v in hv], [tuple(f) for f in accs['head'].F[0]])
    # shell vertices of the outer (non-cavity) surface that are inside the head volume
    inside_n = 0
    for v in BV[::3]:
        if mouth_s(v) > 0: continue
        loc, n, fi, d = hb.find_nearest(Vector(v))
        if loc is not None and (np.array(loc) - v) @ np.array(n) > 0 and d < 0.03: inside_n += 1
    out['outer_shell_verts_inside_head'] = inside_n
    return out

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_normals=True,
                              export_lights=False, export_cameras=False, export_animations=False, export_materials='EXPORT',
                              export_texcoords=False, export_tangents=False)

def main():
    only = arg('--variant')
    keys = [only] if only else ['hotaru', 'elder', 'base']   # base last: its scene is the one saved
    allstats = []
    for key in keys:
        objs, accs, st = build_variant(key)
        out = os.path.join(MODELS, VARIANTS[key]['file'] + '.glb')
        export(out); st['glb'] = out
        st['checks'] = checks(accs)
        allstats.append(st)
        print('BUILT', json.dumps(st), flush=True)
        if key == 'base':
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'sazae-oni.blend'), compress=True)
    with open(os.path.join(TASK_DIR, 'build_stats.json' if not only else f'build_stats_{only}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=2)

main()
