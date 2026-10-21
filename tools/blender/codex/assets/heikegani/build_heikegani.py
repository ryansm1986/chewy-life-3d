"""Heikegani (Shiokaze Tidepools armoured crab, EN-1): deterministic build of Option A "Samurai Shell".

Blender 4.3:
  blender --background --factory-startup --python build_heikegani.py [-- --variant base|genji|shogun]

Builds every variant from an empty scene and exports public/models/heikegani.glb, heikegani_genji.glb and
heikegani_shogun.glb, then saves heikegani.blend (the base variant). Units: metres, front = -Y, ground z = 0.

Parts (the enemy contract + the brief; the same pivots in every variant):
  body              shell, cream lip, belly, samurai face, crest, mon, stalk eyes, blush   origin (0, 0, 0)
  claws             both claws, arms, gold cuffs and studs (one object)                   origin = the shoulder axle AXLE
  leg_L1 .. leg_L4  the +X legs, front to back                                            origin = each leg's hip
  leg_R1 .. leg_R4  the -X legs (mirror images)                                           origin = each leg's hip
Vertex colour only (face-corner FLOAT_COLOR `Col`), one material `toon`, no UVs, no rig.

The claws are modelled turned +CLAW_PRE about the axle, so at the game's resting pitch (-0.2) they stand exactly as
the sheet's front view draws them.

Technique
- Every piece is a closed lofted grid (rows of loops between poles): smooth area-weighted normals per piece.
- The shell is a direction-dependent bell (fuller toward the front, so the face sits on a broad forehead), with a
  rolled cream lip whose colour border runs along its own edge loop.
- Face features are single-sided decals 2.5-4 mm above the shell (the moustache and brows domed up to ~1.6 cm),
  triangulated with a constrained Delaunay in design coordinates where every colour border is a constraint loop,
  then ray-projected onto the shell along a 15-degree-down view.
- Stalk eyes are spheres whose pole points at the viewer: the pupil is the polar rows (a crisp ring border).
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

print('HEIKEGANI build pid', os.getpid(), flush=True)
TASK_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
PI, TAU = math.pi, 2 * math.pi

# ================================================================== dimensions (m)
AXLE = np.array([0.0, -0.20, 0.40])    # the claws' shared shoulder axle (along X)
CLAW_LEAN = 0.15                       # each claw leans this far forward about its own wrist (a shield held out front)
CLAW_PRE = 0.20                        # modelled turned +0.2 about the axle: the game's rest pitch -0.2 = the sheet pose
ZR = 0.27                              # shell rim height
SH_H = 0.275                           # dome height above the rim -> top 0.545 (sheet: back ~0.53, forehead ~0.55)
SH_A, SH_B = 0.39, 0.305               # shell half width / half depth at the rim
SH_N = 2.6                             # footprint superellipse exponent

# ================================================================== palette (sRGB hex)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
VARIANTS = {
    'base':   dict(file='heikegani', shell='#c4473a', belly='#f2d6b0', leg='#b2402f', claw='#d44a3a', tip='#3a1c1c',
                   trim='#ffd257', face='#2a1418', eyew='#fff6e6', crest='#ffc83a', mon='#e8403a', pupil='#2a1418',
                   catch='#ffffff', blush='#f29a8c'),
    'genji':  dict(file='heikegani_genji', shell='#aebfd6', belly='#f4f0e8', leg='#8c9cb8', claw='#c4d2e6', tip='#232a4a',
                   trim='#e8f0ff', face='#232a5a', eyew='#ffffff', crest='#e2e8f2', mon='#3a5ab8', pupil='#232a5a',
                   catch='#ffffff', blush='#f2a8b8'),
    'shogun': dict(file='heikegani_shogun', shell='#3e3548', belly='#8a7a8a', leg='#4a3c54', claw='#352c40', tip='#ff5a3a',
                   trim='#ffcf4a', face='#ffcf4a', eyew='#fff0c0', crest='#ff5a3a', mon='#ffcf4a', pupil='#2a1e30',
                   catch='#ffffff', blush='#e8806e'),
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
def rot_x(V, ang, piv):
    c, s = math.cos(ang), math.sin(ang); Q = np.asarray(V, float) - piv
    return np.stack([Q[:, 0], c * Q[:, 1] - s * Q[:, 2], s * Q[:, 1] + c * Q[:, 2]], -1) + piv
def rmat(ax, ang):
    ax = nz(np.asarray(ax, float)); x, y, z = ax; c, s = math.cos(ang), math.sin(ang); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])
def frame(axis):
    a = nz(np.asarray(axis, float)); ref = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
    u = nz(np.cross(a, ref)); v = np.cross(a, u); return u, v, a

# ================================================================== mesh accumulator
class Acc:
    def __init__(self): self.V = []; self.N = []; self.F = []; self.C = []; self.n = 0; self.log = {}; self.tags = []
    def add(self, V, F, FC, N=None, tag='part', orient=True):
        """V (n,3), F (m,3), FC per-face (m,3) or per-corner (m,3,3) LINEAR colour, N vertex normals (None: computed,
        area-weighted, after orienting the closed piece outward)."""
        V = np.asarray(V, float); F = np.asarray(F, int).copy(); FC = np.asarray(FC, float)
        if FC.ndim == 2: FC = np.repeat(FC[:, None, :], 3, 1)
        FC = FC.copy()
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
        ok = (area > 1e-12) & (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])
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
    def transform(self, fn_v, fn_n):
        self.V = [fn_v(V) for V in self.V]; self.N = [nz(fn_n(N)) for N in self.N]
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

# ================================================================== loft: rows of loops (or poles) -> closed grid
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

def corner_colours(V, F, fn):
    """per-corner colours from fn(points (k,3)) -> (k,3)"""
    P = V[F.reshape(-1)]; return fn(P).reshape(len(F), 3, 3)

def tube(P, R, sides, cap0=True, cap1=True, roll=0.0):
    """closed tube along points P (n,3) with radii R (n): parallel-transport frames, rounded caps.
    returns V, F, band (ring index of each face's lower ring; cap faces -1 / n-1)"""
    P = np.asarray(P, float); R = np.asarray(R, float); n = len(P)
    T = np.zeros_like(P); T[1:-1] = P[2:] - P[:-2]; T[0] = P[1] - P[0]; T[-1] = P[-1] - P[-2]; T = nz(T)
    u, v, _ = frame(T[0]); c, s = math.cos(roll), math.sin(roll); u, v = c * u + s * v, -s * u + c * v
    rows = []; ang = np.arange(sides) / sides * TAU
    for i in range(n):
        u = nz(u - T[i] * (u @ T[i])); v = np.cross(T[i], u)
        rows.append(P[i] + R[i] * (np.outer(np.cos(ang), u) + np.outer(np.sin(ang), v)))
    pre, post = [], []
    if cap0 == 'pole':                      # a flat-ish pole (buried ends)
        pre = [(P[0] - T[0] * R[0] * 0.5)[None]]
    elif cap0:
        r0 = rows[0] - P[0]
        pre = [P[0] + r0 * 0.72 - T[0] * R[0] * 0.62, (P[0] - T[0] * R[0] * 0.92)[None]]
        pre = pre[::-1]
    if cap1:
        r1 = rows[-1] - P[-1]
        post = [P[-1] + r1 * 0.72 + T[-1] * R[-1] * 0.62, (P[-1] + T[-1] * R[-1] * 0.92)[None]]
    allrows = pre + rows + post
    V, F, band, colm = loft(allrows)
    band = band - len(pre)
    return V, F, band, colm

def ellipsoid(C, radii, Rm, segs, rings, pole_axis=2):
    """closed ellipsoid: centre C, radii (3), rotation Rm (3x3, columns = local axes), poles along local z"""
    rows = [np.array([[0, 0, -1.0]])]
    for k in range(1, rings):
        th = -PI / 2 + k / rings * PI
        a = np.arange(segs) / segs * TAU
        rows.append(np.stack([math.cos(th) * np.cos(a), math.cos(th) * np.sin(a), np.full(segs, math.sin(th))], -1))
    rows.append(np.array([[0, 0, 1.0]]))
    rows = [(r * np.asarray(radii)) @ Rm.T + C for r in rows]
    return loft(rows)

# ================================================================== the shell
def shell_profile(rho, front):
    # fitted to the sheet's back-view outline (p 2.8, q 0.55); the front a touch fuller under the face
    p = 2.8 + 1.0 * front; q = 0.55 - 0.18 * front
    return np.clip(1 - rho ** p, 0, 1) ** q
def shell_point(rho, t):
    c, s = math.cos(t), math.sin(t)
    fx = math.copysign(abs(c) ** (2 / SH_N), c); fy = math.copysign(abs(s) ** (2 / SH_N), s)
    front = float(sstep(0.0, 0.85, -s))                       # 1 toward the face (-Y), 0 at the sides and back
    wide = 1 + 0.05 * front                                   # a little broader across the front corners
    yoff = 0.045 * (1 - rho * rho)                            # the peak sits a little behind the centre
    x = rho * SH_A * fx * wide; y = rho * SH_B * fy + yoff
    z = ZR + SH_H * (1 + 0.07 * front) * shell_profile(rho, front)
    return np.array([x, y, z])
SH_COLS = 28
SH_RHO = [0.17, 0.34, 0.5, 0.64, 0.76, 0.86, 0.94, 1.0]
def build_shell(acc, pal):
    T = np.arange(SH_COLS) / SH_COLS * TAU - PI / 2 + PI / SH_COLS   # column 0 straddles the front centre
    top = shell_point(0.0, 0.0)
    rows = [top[None]]
    for r in SH_RHO: rows.append(np.array([shell_point(r, t) for t in T]))
    rim = rows[-1]; cen = np.array([0, 0, 0])
    def scaled(sc, dz):
        R = rim.copy(); R[:, 0] *= sc; R[:, 1] *= sc; R[:, 2] = ZR + dz; return R
    rows.append(scaled(1.014, -0.003))            # the cream lip: a plate edge just under the red ...
    rows.append(scaled(1.04, -0.011))             # ... out ...
    rows.append(scaled(1.022, -0.019))            # ... under (kept high: the lifted legs pass below it) ...
    rows.append(np.array([[0, 0.0, ZR - 0.022]]))  # ... and in (hidden by the belly)
    V, F, band, colm = loft(rows)
    sh, light, dark, cream = lin(pal['shell']), lin('#fff0dc'), lin(pal['shell']) * 0.78, lin(pal['belly'])
    def col_red(P):
        h = (P[:, 2] - ZR) / SH_H
        c = sh[None] * (0.86 + 0.14 * sstep(0.0, 0.55, h))[:, None]
        c = c + (light - c) * (0.10 * sstep(0.75, 1.0, h))[:, None]
        return c
    FC = corner_colours(V, F, col_red)
    lip = band >= len(SH_RHO) + 0                 # bands from the rim row down: rim->out is red edge, out->under cream
    lipc = band >= len(SH_RHO)
    FC[lipc] = cream * 0.97
    acc.add(V, F, FC, tag='shell')
    return V, F

def build_belly(acc, pal):
    A, B, Yc = 0.305, 0.255, -0.01
    cols = 16; T = np.arange(cols) / cols * TAU + PI / cols
    def ring(sc, z, bulge=1.0):
        out = []
        for t in T:
            c, s = math.cos(t), math.sin(t)
            fx = math.copysign(abs(c) ** (2 / 2.4), c); fy = math.copysign(abs(s) ** (2 / 2.4), s)
            yy = fy * B * (1.08 if s < 0 else 1.0)
            out.append([fx * A * sc, Yc + yy * sc * bulge, z])
        return np.array(out)
    rows = [np.array([[0, Yc, 0.118]]), ring(0.78, 0.13), ring(0.95, 0.163), ring(1.0, 0.2),
            ring(0.96, 0.24), np.array([[0, Yc, 0.27]])]
    V, F, band, colm = loft(rows)
    be = lin(pal['belly'])
    FC = corner_colours(V, F, lambda P: be[None] * (0.84 + 0.16 * sstep(0.12, 0.22, P[:, 2]))[:, None])
    acc.add(V, F, FC, tag='belly')

# ================================================================== surface projection (decals)
class Surface:
    def __init__(self, V, F):
        self.V, self.F = V, F; self.N = vnormals(V, F)
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in V], [tuple(f) for f in F])
    def project(self, pts, tilt=0.0, yref=-0.25):
        """design coordinates (x, z) -> surface points and interpolated normals. The ray runs 'tilt' below the
        horizontal toward +Y and passes through (x, yref, z): the front view shows the design about where drawn."""
        d = np.array([0.0, math.cos(tilt), -math.sin(tilt)]); P, N = [], []
        for x, z in pts:
            o = np.array([x, yref, z]) - d * 1.5
            loc, fn, fi, dist = self.bvh.ray_cast(Vector(o), Vector(d))
            if loc is None:                       # past the silhouette: wrap onto the nearest surface point
                loc, fn, fi, dist = self.bvh.find_nearest(Vector((x, -0.12, z)))
                if loc is None or dist > 0.05: raise RuntimeError(f'decal point off the surface: {(x, z)}')
            tri = self.F[fi]; a, b, c = (self.V[t] for t in tri); p = np.array(loc)
            v0, v1, v2 = b - a, c - a, p - a
            d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
            den = d00 * d11 - d01 * d01; w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
            n = w0 * self.N[tri[0]] + w1 * self.N[tri[1]] + w2 * self.N[tri[2]]
            P.append(p); N.append(n / np.linalg.norm(n))
        return np.array(P), np.array(N)

def decal(acc, surf, layers, spacing, offset, tag, dome=None, dome_d=0.02, own_normals=0.0, **proj):
    """layers: [(poly (k,2) CCW, colour)] in priority order (first match wins); triangles outside every layer are
    dropped. offset: metres above the surface; dome: extra height in the interior (ramps in over dome_d from the edge)"""
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
    P, N = surf.project(V2, **proj)
    off = np.full(len(V2), offset)
    if dome:
        dd = dist_to_poly(layers[-1][0], V2)          # the outermost layer is last (eye white, or the only one)
        t = np.clip(dd / dome_d, 0, 1); off = off + dome * np.sqrt(t * (2 - t))
    Q = P + N * off[:, None]
    if own_normals > 0:
        fn = np.cross(Q[F[:, 1]] - Q[F[:, 0]], Q[F[:, 2]] - Q[F[:, 0]])
        flip = np.einsum('ij,ij->i', fn, N[F].sum(1)) < 0; F[flip] = F[flip][:, [0, 2, 1]]; FC = FC  # (per-face colour)
        G_ = vnormals(Q, F); Nn = nz(N + (G_ - N) * own_normals)
    else:
        Nn = N
    acc.add(Q, F, FC, N=Nn, tag=tag)

# ================================================================== the samurai face
def eye_outline(k):
    """one samurai eye (k = +1 viewer's right): a rounded almond whose top is cut by the brow line sloping down
    toward the middle (the angry glare)"""
    cx, cz, a, b = k * 0.09, 0.446, 0.068, 0.054
    t = np.linspace(0, TAU, 64, endpoint=False); lx = a * np.cos(t); lz = b * np.sin(t)
    lidl = 0.03 + 0.25 * (lx * k)                              # higher at the outer end
    lz = np.where(lz > -0.01, smin(lz, lidl, 0.022), lz)
    P = resample_loop(np.stack([cx + lx, cz + lz], -1), 30)
    return ccw(P)
def build_face(acc, surf, pal):
    F_, W_, P_, C_ = lin(pal['face']), lin(pal['eyew']), lin(pal['pupil']), lin(pal['catch'])
    for k in (-1, 1):
        eye = eye_outline(k)
        pc = np.array([k * 0.068, 0.452])
        pup = ellipse(pc[0], pc[1], 0.031, 0.031, 14)
        pup = ccw(np.array([p for p in pup]))
        c1 = ellipse(pc[0] - 0.009, pc[1] + 0.009, 0.0085, 0.0085, 8)
        # pupil clipped to the eye: points of the pupil outside the eye pulled in
        inn = inside(eye, pup)
        if not inn.all():
            # move outside points toward the eye centre until inside
            for i in np.where(~inn)[0]:
                p = pup[i]
                for s in np.linspace(1, 0, 21):
                    q = pc + (p - pc) * s
                    if inside(eye, q[None])[0] and dist_to_poly(eye, q[None])[0] > 0.0025: pup[i] = q; break
        decal(acc, surf, [(c1, C_), (pup, P_), (eye, W_)], 0.024, 0.003, 'eyes', dome=0.004, dome_d=0.02)
        # the heavy brow: inner end low, outer end high, chunky, round ends
        bp = np.array([[k * 0.02, 0.494], [k * 0.065, 0.518], [k * 0.113, 0.537], [k * 0.158, 0.545]])
        bpc = catmull(bp, 3)
        brow = stroke(bpc, np.interp(np.linspace(0, 1, len(bpc)), [0, 0.45, 1], [0.02, 0.024, 0.018]), ncap=5)
        decal(acc, surf, [(brow, F_)], 0.018, 0.004, 'brows', dome=0.012, dome_d=0.018, own_normals=0.7)
    # the big curly moustache: one stroke from the left curl, dipping out and down, through the middle, to the right
    half = np.array([[0.0, 0.403], [0.045, 0.39], [0.095, 0.362], [0.145, 0.35], [0.183, 0.362], [0.2, 0.39], [0.19, 0.414]])
    path = np.vstack([half[::-1] * [-1, 1], half[1:]])
    path = catmull(path, 3)
    s = np.linspace(-1, 1, len(path)); hw = 0.024 + 0.011 * np.exp(-((np.abs(s) - 0.42) / 0.3) ** 2) - 0.004 * np.exp(-(s / 0.08) ** 2)
    hw = np.where(np.abs(s) > 0.85, hw * (1 - (np.abs(s) - 0.85) * 1.2), hw)
    mou = stroke(path, hw, ncap=5)
    decal(acc, surf, [(mou, F_)], 0.027, 0.0045, 'moustache', dome=0.016, dome_d=0.022, own_normals=0.7)
    # the frown under it
    fp = np.array([[-0.036, 0.344], [-0.018, 0.352], [0.0, 0.355], [0.018, 0.352], [0.036, 0.344]])
    fr = stroke(catmull(fp, 3), 0.0085, ncap=4)
    decal(acc, surf, [(fr, F_)], 0.012, 0.003, 'frown', dome=0.003, dome_d=0.008)

# ================================================================== stalk eyes
def build_stalk_eyes(acc, pal, belly_surf):
    W_, P_, C_, sh, bl = lin(pal['eyew']), lin(pal['pupil']), lin(pal['catch']), lin(pal['shell']), lin(pal['blush'])
    R = 0.045
    for k in (-1, 1):
        E = np.array([k * 0.076, -0.318, 0.272])
        look = nz(np.array([k * 0.16, -1.0, 0.42]))           # a little outward and up, toward the game camera
        u, v, a = frame(look)
        # sphere with its pole along 'look': the polar rows are the pupil (a crisp ring border); the back is buried
        segs = 10; th = [0.0, 0.36, 0.66, 1.05, 1.6, PI]
        rows = []
        for t in th:
            if t in (0.0, PI): rows.append((E + a * R * math.cos(t))[None]); continue
            ang = np.arange(segs) / segs * TAU
            rows.append(E + a * R * math.cos(t) + R * math.sin(t) * (np.outer(np.cos(ang), u) + np.outer(np.sin(ang), v)))
        V, F, band, colm = loft(rows)
        FC = np.zeros((len(F), 3)); FC[:] = W_
        FC[band <= 1] = P_
        acc.add(V, F, FC, tag='stalk_eyes')
        # catchlight: a little white lens on the pupil, up and toward the outside
        up_ = nz(np.array([0, 0, 1.0]) - a * a[2]); cd = nz(a + 0.36 * up_ - 0.12 * k * np.array([1.0, 0, 0]))
        cu, cv, _ = frame(cd); cc = E + cd * (R + 0.0012)
        ring = cc + 0.011 * (np.outer(np.cos(np.arange(7) / 7 * TAU), cu) + np.outer(np.sin(np.arange(7) / 7 * TAU), cv))
        ring = E + nz(ring - E) * (R + 0.0012)
        Vc = np.vstack([cc[None] + cd * 0.0008, ring]); Fc = np.array([[0, 1 + i, 1 + (i + 1) % 7] for i in range(7)])
        acc.add(Vc, Fc, np.tile(C_, (7, 1)), N=np.tile(cd, (8, 1)), tag='stalk_eyes')
        # the cross little lid: a thick cap over the top of the ball, its rim sloping down toward the middle
        lid_ax = nz(np.array([0.0, 0.10, 1.0]) @ rmat([0, 1, 0], k * 0.42).T)
        lu, lv, la = frame(lid_ax)
        RL = R * 1.13; segs = 8; ang = np.arange(segs) / segs * TAU
        rows = [(E + la * RL)[None]]
        for t in (0.5, 0.86):
            rows.append(E + la * RL * math.cos(t) + RL * math.sin(t) * (np.outer(np.cos(ang), lu) + np.outer(np.sin(ang), lv)))
        t = 0.9; rows.append(E + la * R * 0.97 * math.cos(t) + R * 0.97 * math.sin(t) * (np.outer(np.cos(ang), lu) + np.outer(np.sin(ang), lv)))
        rows.append((E + la * R * 0.4)[None])
        V, F, band, colm = loft(rows)
        lidc = sh * 1.0
        FC = corner_colours(V, F, lambda P: lidc[None] * (0.9 + 0.1 * sstep(0.3, 0.335, P[:, 2]))[:, None])
        acc.add(V, F, FC, tag='stalk_lids')
        # blush on the belly under the eye, toward the outside
        bl_poly = ellipse(k * 0.118, 0.2, 0.031, 0.02, 14)
        decal(acc, belly_surf, [(bl_poly, bl)], 0.02, 0.0045, 'blush', tilt=math.radians(10), yref=-0.27)

# ================================================================== the crest (crescent kuwagata) + the mon
CREST_Y = 0.035
CREST_C = np.array([0.0, CREST_Y, 0.724])
CR_RX, CR_RZ = 0.158, 0.128
CREST_LEAN = -0.14                          # top leans back (+Y)
def build_crest(acc, pal):
    gold = lin(pal['crest']); goldD = gold * 0.74; goldL = gold + (lin('#fff6e0') - gold) * 0.25
    AMAX = 142
    al = np.radians(np.sign(np.linspace(-1, 1, 19)) * np.abs(np.linspace(-1, 1, 19)) ** 0.9 * AMAX)
    P = np.stack([CR_RX * np.sin(al), np.zeros_like(al), -CR_RZ * np.cos(al)], -1) + CREST_C
    f = np.abs(al) / np.radians(AMAX)
    w = 0.032 + 0.024 * np.cos(f * PI / 2) ** 0.8                     # crescent: fat at the foot and sides, 6.4 cm at the tips
    dpt = 0.03 - 0.005 * f                                            # fore-aft half depth
    # ellipse cross sections in the plane (radial in XZ, Y)
    rows = []; segs = 8; ang = np.arange(segs) / segs * TAU
    tang = np.stack([CR_RX * np.cos(al), np.zeros_like(al), CR_RZ * np.sin(al)], -1); tang = nz(tang)
    yv = np.array([0, 1.0, 0])
    for i in range(len(al)):
        rad = nz(np.cross(tang[i], yv))
        rad = rad if (rad @ (P[i] - CREST_C)) > 0 else -rad
        rows.append(P[i] + np.outer(np.cos(ang) * w[i], rad) + np.outer(np.sin(ang) * dpt[i], yv))
    # rounded tips: one shrunken ring + a pole past each end
    for end, sgn in ((0, -1), (-1, 1)):
        c = P[end]; t = tang[end] * sgn; r = rows[end] - c
        ring = c + r * 0.66 + t * w[end] * 0.7; pole = (c + t * w[end] * 1.0)[None]
        if end == 0: rows = [pole, ring] + rows
        else: rows = rows + [ring, pole]
    V, F, band, colm = loft(rows)
    def cc(Pp):
        n = (Pp - CREST_C); front = sstep(0.0, -0.03, Pp[:, 1] - CREST_Y)
        c = goldD[None] + (gold - goldD)[None] * (0.35 + 0.65 * front)[:, None]
        hi = sstep(0.06, 0.13, Pp[:, 2] - CREST_C[2])
        return c + (goldL - c) * (0.5 * hi * front)[:, None]
    FC = corner_colours(V, F, cc)
    V = rot_x(V, CREST_LEAN, np.array([0, CREST_Y, 0.55]))
    acc.add(V, F, FC, tag='crest')
    # the knob behind the crest's foot (the back view's red dome)
    sh = lin(pal['shell'])
    V, F, b_, c_ = ellipsoid(np.array([0, CREST_Y + 0.035, 0.548]), (0.05, 0.044, 0.05), np.eye(3), 7, 5)
    acc.add(V, F, np.tile(sh * 1.02, (len(F), 1)), tag='crest')

MON_C = np.array([0.0, CREST_Y - 0.042, 0.585])
MON_AX = nz(np.array([0.0, -1.0, 0.42]))
def build_mon(acc, pal):
    gold = lin(pal['crest']); goldD = gold * 0.8; red = lin(pal['mon'])
    u, v, a = frame(MON_AX)
    u = np.array([1.0, 0, 0]); v = np.cross(a, u)
    segs = 10; ang = np.arange(segs) / segs * TAU
    prof = [(0.0, 0.019), (0.044, 0.017), (0.049, 0.023), (0.062, 0.024), (0.071, 0.008), (0.0, -0.016)]
    rows = []
    for r, h in prof:
        if r == 0: rows.append((MON_C + a * h)[None]); continue
        rows.append(MON_C + a * h + r * (np.outer(np.cos(ang), u) + np.outer(np.sin(ang), v)))
    V, F, band, colm = loft(rows)
    FC = np.zeros((len(F), 3)); FC[:] = gold
    FC[band <= 0] = red
    FC[band >= 4] = goldD
    acc.add(V, F, FC, tag='mon')
    # the gold three-comma mon (mitsudomoe) as a decal on the red face
    tri = []
    for i in range(3):
        th = PI / 2 + i * TAU / 3
        head = np.array([math.cos(th), math.sin(th)]) * 0.016
        arc = [np.array([math.cos(th + s), math.sin(th + s)]) * (0.016 + 0.012 * s / 1.6) for s in np.linspace(0, 1.6, 6)]
        path = np.array(arc)
        hw = np.linspace(0.0075, 0.0025, len(path))
        tri.append(stroke(path, hw, ncap=5))
    face_h = 0.0185
    for poly in tri:
        V2, F2 = cdt(poly, [list(range(len(poly)))])
        cen = V2[F2].mean(1); F2 = F2[inside(poly, cen)]
        V3 = MON_C + a * (face_h + 0.0015) + np.outer(V2[:, 0], u) + np.outer(V2[:, 1], v)
        acc.add(V3, F2, np.tile(gold, (len(F2), 1)), N=np.tile(a, (len(V3), 1)), tag='mon')

# ================================================================== legs
# per leg: hip (x, y), fan angle (forward +), length scale
LEGS = [('1', 0.245, -0.095, math.radians(16), 1.04), ('2', 0.262, 0.01, math.radians(2), 0.98),
        ('3', 0.262, 0.102, math.radians(-20), 0.98), ('4', 0.222, 0.18, math.radians(-50), 1.04)]
HIP_Z = 0.13
LEG_RINGS = [  # (reach r, z, radius, kind)  kind: 0 leg, 1 joint pinch, 2 dark tip
    (-0.02, 0.118, 0.040, 0), (0.03, 0.126, 0.050, 0), (0.085, 0.142, 0.054, 0), (0.127, 0.157, 0.039, 1),
    (0.168, 0.180, 0.058, 0), (0.204, 0.187, 0.055, 0), (0.233, 0.162, 0.039, 1), (0.250, 0.118, 0.052, 0),
    (0.258, 0.066, 0.046, 2), (0.262, 0.036, 0.035, 2)]
LEG_SIDES = 8
def leg_geometry(side, hx, hy, fan, L):
    u = np.array([side * math.cos(fan), -math.sin(fan), 0.0])
    hip = np.array([side * hx, hy, HIP_Z])
    P = np.array([hip + u * (r * L) + np.array([0, 0, z - HIP_Z]) for r, z, _, _ in LEG_RINGS])
    # the tip sits on the ground: the last ring's centre a little above z=0, the rounded cap reaches 0
    R = np.array([rr for _, _, rr, _ in LEG_RINGS]) * (0.96 + 0.04 * L)
    kinds = [kd for _, _, _, kd in LEG_RINGS]
    V, F, band, colm = tube(P, R, LEG_SIDES, cap0='pole', cap1=True, roll=PI / LEG_SIDES)
    # put the tip on the ground exactly
    V[:, 2] -= V[:, 2].min()
    return hip, V, F, band, kinds
def build_leg(pal, side, spec):
    name, hx, hy, fan, L = spec
    hip, V, F, band, kinds = leg_geometry(side, hx, hy, fan, L)
    legc, tip = lin(pal['leg']), lin(pal['tip'])
    nr = len(kinds)
    def cls(b):  # band b spans ring b..b+1 (caps: -2,-1 before ring 0; nr-1, nr after the last)
        if b >= nr - 2: return 2
        if b >= 0 and kinds[b] == 2: return 2
        if b >= 0 and (kinds[b] == 1 or kinds[b + 1] == 1): return 1
        return 0
    C = np.array([cls(b) for b in band])
    Nn = vnormals(V, F)
    def shade(Pp, base):
        z = Pp[:, 2]; return base[None] * (0.84 + 0.16 * sstep(0.05, 0.24, z))[:, None]
    FC = corner_colours(V, F, lambda Pp: shade(Pp, legc))
    FC[C == 1] *= 0.86
    FC[C == 2] = tip
    acc = Acc(); acc.add(V, F, FC, tag='leg')
    return acc, hip

# ================================================================== claws
CUFF_C = {1: np.array([0.35, -0.345, 0.352])}
CUFF_H, CUFF_R = 0.056, 0.123
def claw_pieces(acc, pal, k):
    cl, clD, trim, tip = lin(pal['claw']), lin(pal['claw']) * 0.7, lin(pal['trim']), lin(pal['tip'])
    trimD = trim * 0.8
    C0 = CUFF_C[1] * np.array([k, 1, 1])
    ax = nz(np.array([k * 0.20, -0.10, 1.0]))                  # the cuff's axis: up, leaning out a little
    u, v, a = frame(ax)
    xo = nz(np.array([k, 0, 0.0]) - a * (a @ np.array([k, 0, 0.0]))); yo = np.cross(a, xo)   # out / back across the wrist
    # arm: from the axle (inside the shell, so no gap opens when the claws turn) into the wrist
    S = np.array([k * 0.21, AXLE[1], AXLE[2]])
    V, F, band, colm = tube(np.array([S, (S + C0) / 2 + np.array([0, 0, -0.015]), C0]), [0.045, 0.047, 0.048], 6, cap0='pole', cap1='pole')
    acc.add(V, F, np.tile(cl * 0.8, (len(F), 1)), tag='arm')
    # the gold cuff: a thick rolled ring (a closed torus-like grid)
    segs = 12; ang = np.arange(segs) / segs * TAU
    h = CUFF_H; r = CUFF_R
    prof = [(r - 0.04, -h * 0.9), (r - 0.018, -h), (r - 0.002, -h * 0.72), (r, 0.0), (r - 0.002, h * 0.72), (r - 0.018, h),
            (r - 0.04, h * 0.9)]
    rows = [C0 + a * hh + rr * (np.outer(np.cos(ang), xo) + np.outer(np.sin(ang), yo)) for rr, hh in prof]
    nP = len(rows); Vc = np.vstack(rows); Fc = []
    for i in range(nP):
        i2 = (i + 1) % nP
        for j in range(segs):
            j2 = (j + 1) % segs
            a0, a1, b0, b1 = i * segs + j, i * segs + j2, i2 * segs + j, i2 * segs + j2
            Fc += [(a0, b0, b1), (a0, b1, a1)]
    Fc = np.array(Fc)
    FCc = corner_colours(Vc, Fc, lambda Pp: trimD[None] + (trim - trimD)[None] * (0.5 + 0.5 * sstep(-h, h * 0.7, (Pp - C0) @ a))[:, None])
    cen = Vc[Fc].mean(1); fn = np.cross(Vc[Fc[:, 1]] - Vc[Fc[:, 0]], Vc[Fc[:, 2]] - Vc[Fc[:, 0]])
    rc = cen - C0; radial = rc - np.outer(rc @ a, a); rr_ = np.linalg.norm(radial, axis=1)
    tc = C0 + radial / rr_[:, None] * (r - 0.022)
    flip = np.einsum('ij,ij->i', fn, cen - tc) < 0
    Fc[flip] = Fc[flip][:, [0, 2, 1]]; FCc[flip] = FCc[flip][:, [0, 2, 1]]
    acc.add(Vc, Fc, FCc, N=None, tag='cuff', orient=False)
    # studs round the cuff's middle, over the outside and the front (the inner side faces the shell)
    for i in range(5):
        th = (-0.55 + i * 0.3) * PI                          # from the back-outer round the front to the front-inner
        dirv = math.cos(th) * xo + math.sin(th) * (-yo if (yo @ np.array([0, -1.0, 0])) < 0 else yo)
        base = C0 + dirv * (r - 0.004)
        su, sv, sa = frame(dirv); rS = 0.022; segs_s = 5; an = np.arange(segs_s) / segs_s * TAU
        rws = [(base - sa * 0.012)[None],
               base - sa * 0.004 + rS * (np.outer(np.cos(an), su) + np.outer(np.sin(an), sv)),
               base + sa * 0.012 + rS * 0.78 * (np.outer(np.cos(an), su) + np.outer(np.sin(an), sv)),
               (base + sa * 0.022)[None]]
        V, F, b_, c_ = loft(rws)
        # normals lean on the cuff's outward direction, so the ink hull rides on the cuff's (no spikes at the silhouette)
        g = V - (base - sa * 0.03); g = nz(g); Ns = nz(g * 0.45 + sa * 0.55)
        Ns[0] = sa
        acc.add(V, F, np.tile(trim, (len(F), 1)), N=Ns, tag='studs')
    # the claw's hand (propodus): a big rounded mitt rising out of the cuff
    # the hand leans forward from the cuff top (a bent wrist): from here on a / xo / yo are the hand's own axes
    Ct = C0 + a * CUFF_H
    a = nz(rot_x(np.array([k * 0.16, -0.06, 1.0])[None], CLAW_LEAN, np.zeros(3))[0])
    xo = nz(np.array([k, 0, 0.0]) - a * (a @ np.array([k, 0, 0.0]))); yo = np.cross(a, xo)
    Hc = Ct + a * 0.05                                        # (its base narrows inside the cuff: no ink poking through)
    Rm = np.stack([xo, yo, a], 1)
    V, F, hb, c_ = ellipsoid(Hc, (0.132, 0.114, 0.094), Rm, 14, 8)
    hl = (V - Hc) @ a; shrink = 1 - 0.5 * sstep(-0.004, -0.046, hl)       # egg: bulges over the cuff, narrow inside it
    V = Hc + (V - Hc - np.outer(hl, a)) * shrink[:, None] + np.outer(hl, a)
    palm = cl + (lin(pal['belly']) - cl) * 0.55                # the inside of the pincer: a lighter, belly-ish shade
    FCh = corner_colours(V, F, lambda Pp: clD[None] + (cl - clD)[None] * (0.4 + 0.6 * sstep(-0.09, 0.03, (Pp - Hc) @ a))[:, None])
    FCh[hb >= 7] = palm                                        # the top cap (a ring loop border), between the fingers
    acc.add(V, F, FCh, tag='hand')
    def finger(pts, r0, r1, dark_frac=0.28, rings=7):
        D = catmull(np.asarray(pts), 6)
        seg = np.linalg.norm(np.diff(D, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]); L = cum[-1]
        Lt = L + 0.92 * r1                                     # (the rounded cap adds this much)
        sd = Lt * (1 - dark_frac)
        nd = 2
        sv = np.concatenate([np.linspace(0, sd, rings - nd)[:-1], np.linspace(sd, L, nd + 1)])
        P = np.stack([np.interp(sv, cum, D[:, j]) for j in range(3)], -1); n = len(P)
        u = sv / L; R = (r0 + (r1 - r0) * u) * (1 + 0.1 * np.sin(u * PI))
        V, F, band, colm = tube(P, R, 9, cap0='pole', cap1=True)
        kd = rings - nd - 1                                     # the ring at sd: a crisp border loop
        dark = band >= kd
        FCf = corner_colours(V, F, lambda Pp: cl[None] * (0.92 + 0.08 * sstep(-0.02, 0.06, (Pp - Hc) @ a))[:, None])
        FCf[dark] = tip
        acc.add(V, F, FCf, tag='fingers')
    # the pincer: two long fingers splayed sideways round a C-shaped opening (the light palm shows inside it)
    o0 = Hc + a * 0.035 + xo * 0.07                           # the big outer finger: up the outside, curling in at the end
    finger([o0 - a * 0.03, o0 + a * 0.06 + xo * 0.014, o0 + a * 0.128 - xo * 0.0, o0 + a * 0.166 - xo * 0.034], 0.064, 0.033)
    i0 = Hc + a * 0.03 - xo * 0.074                           # the inner finger: a little smaller, up the inside, tip leaning out
    finger([i0 - a * 0.03, i0 + a * 0.05 - xo * 0.004, i0 + a * 0.108 + xo * 0.0, i0 + a * 0.134 + xo * 0.012], 0.055, 0.029)

def build_claws(pal):
    acc = Acc()
    for k in (-1, 1): claw_pieces(acc, pal, k)
    # modelled turned +CLAW_PRE about the axle (see the header)
    acc.transform(lambda V: rot_x(V, CLAW_PRE, AXLE), lambda N: rot_x(N, CLAW_PRE, np.zeros(3)))
    return acc

# ================================================================== scene + export
def make_material():
    m = bpy.data.materials.new('toon'); m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    return m

def build_variant(key):
    pal = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    body = Acc()
    SV, SF = build_shell(body, pal)
    surf = Surface(SV, SF)
    bel = Acc(); build_belly(bel, pal)
    BV, _, BF = bel.arrays(); belly_surf = Surface(BV, BF)
    for V, N, F, C, tg in zip(bel.V, bel.N, bel.F, bel.C, bel.tags): body.add(V, F - 0, C, N=N, tag=tg)
    build_face(body, surf, pal)
    build_stalk_eyes(body, pal, belly_surf)
    build_crest(body, pal)
    build_mon(body, pal)
    claws = build_claws(pal)
    objs = {'body': body.to_object('body', mat, np.zeros(3)), 'claws': claws.to_object('claws', mat, AXLE)}
    legs = {}
    for side, tag in ((1, 'L'), (-1, 'R')):
        for spec in LEGS:
            acc, hip = build_leg(pal, side, spec)
            nm = f'leg_{tag}{spec[0]}'; legs[nm] = (acc, hip); objs[nm] = acc.to_object(nm, mat, hip)
    stats = {'variant': key, 'body': body.tris(), 'claws': claws.tris(), 'legs': {k: a.tris() for k, (a, h) in legs.items()},
             'body_parts': body.log, 'claw_parts': claws.log}
    stats['total'] = stats['body'] + stats['claws'] + sum(stats['legs'].values())
    stats['pivots'] = {'body': [0, 0, 0], 'claws': AXLE.round(4).tolist(), **{k: np.round(h, 4).tolist() for k, (a, h) in legs.items()}}
    return objs, (body, claws, legs), stats

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_normals=True,
                              export_lights=False, export_cameras=False, export_animations=False, export_materials='EXPORT',
                              export_texcoords=False, export_tangents=False)

# ------------------------------------------------------------------ checks: overlaps at the game's poses
def bvh(V, F): return BVHTree.FromPolygons([tuple(v) for v in V], [tuple(f) for f in F])
def leg_walk(V, hip, side, lift=0.12, reach=0.045, fore=0.035, ph=0.0):
    d = np.linalg.norm(V - hip, axis=1); w = np.clip(d / d.max(), 0, 1)
    out = V.copy(); out[:, 2] += lift * w * max(0, math.sin(ph))
    out[:, 0] += math.cos(ph) * side * reach * w; out[:, 1] += math.sin(ph + 1.3) * fore * w
    return out
def depth_inside(tree, P):
    """how far each point lies inside the closed mesh of 'tree' (0 when outside): ray parity, then the nearest distance"""
    d = np.zeros(len(P)); dirs = [Vector(v).normalized() for v in ((0.0123, 0.0071, 1.0), (0.61, -0.37, 0.7), (-0.53, 0.66, 0.53))]
    for i, p in enumerate(P):
        votes = 0
        for up in dirs:
            o = Vector(p); n = 0
            for _ in range(12):
                loc, nn, fi, dist = tree.ray_cast(o, up)
                if loc is None: break
                n += 1; o = loc + up * 1e-5
            votes += n % 2
        if votes >= 2:
            loc, nn, fi, dist = tree.find_nearest(Vector(p)); d[i] = dist
    return d
def where(P, d):
    i = int(np.argmax(d)); return [round(float(d[i]), 3), np.round(P[i], 3).tolist()]
def checks(accs):
    """penetration depths (m) between parts at the game's poses; overlaps hidden inside the body are ignored"""
    body, claws, legs = accs
    bV, _, bF = body.arrays(); cV, _, cF = claws.arrays()
    tb = bvh(bV, bF); out = {}
    def body_part(tag):
        V = np.vstack([v for v, t in zip(body.V, body.tags) if t == tag]); F = np.vstack([f - f.min() + 0 for f, t in zip(body.F, body.tags) if t == tag][:1])
        return V
    # the shell alone (closed) for leg/claw clearance: rebuilt from its own piece
    i0 = body.tags.index('shell'); sV = body.V[i0]; sF = body.F[i0] - body.F[i0].min(); ts = bvh(sV, sF)
    i1 = body.tags.index('belly'); eV = body.V[i1]; eF = body.F[i1] - body.F[i1].min(); te = bvh(eV, eF)
    def hidden(P):   # inside the shell or the belly
        return (depth_inside(ts, P) > 0.004) | (depth_inside(te, P) > 0.004)
    far = np.linalg.norm(cV[:, 1:] - AXLE[1:], axis=1) > 0.10
    far &= np.concatenate([np.full(len(v), t != 'arm') for v, t in zip(claws.V, claws.tags)])
    leg_trees = {}
    for nm, (acc, hip) in legs.items():
        lV, _, lF = acc.arrays(); leg_trees[nm] = (bvh(lV, lF), lV, lF, hip)
    for ang in (-0.2, -1.45, 0.6):
        cR = rot_x(cV, ang, AXLE)
        d = depth_inside(ts, cR) * far
        out[f'claws_in_shell@{ang}'] = where(cR, d)
        out[f'claws_min_z@{ang}'] = round(float(cR[:, 2].min()), 3)
        tc = bvh(cR, cF)
        for nm in ('leg_L1', 'leg_L2'):
            t_, lV, lF, hip = leg_trees[nm]
            dl = depth_inside(tc, lV); dl[hidden(lV)] = 0
            if dl.max() > 0: out[f'{nm}_in_claws@{ang}'] = where(lV, dl)
    names = list(legs)
    for phase in (None, 0.0, PI / 2, PI, 1.5 * PI):
        T = {}
        for nm in names:
            acc, hip = legs[nm]; lV, _, lF = acc.arrays(); side = 1 if 'L' in nm else -1
            i = int(nm[-1]) - 1; ph = None if phase is None else phase + ((i + (side > 0)) % 2) * PI + i * 0.35
            V = lV if ph is None else leg_walk(lV, hip, side, ph=ph)
            T[nm] = (bvh(V, lF), V, lF, hip)
        key = 'rest' if phase is None else f'walk{phase:.2f}'
        for nm in names:
            if not nm.startswith('leg_L'): continue      # (mirror images: the right side is the same up to phase)
        for a_ in range(len(names)):
            for b_ in range(a_ + 1, len(names)):
                A, B = names[a_], names[b_]
                if A[4] != B[4] or abs(int(A[5]) - int(B[5])) != 1: continue
                V = T[A][1]; d = depth_inside(T[B][0], V); d[hidden(V)] = 0
                if d.max() > 0.002: out.setdefault(f'legs_x_legs@{key}', {})[A + '/' + B] = where(V, d)
        for nm in names:
            tl, V, lF, hip = T[nm]
            d = depth_inside(ts, V) * (np.linalg.norm(V - hip, axis=1) > 0.10)
            if d.max() > 0.002: out.setdefault(f'legs_in_shell@{key}', {})[nm] = where(V, d)
    return out

def main():
    only = arg('--variant')
    keys = [only] if only else ['genji', 'shogun', 'base']   # base last: its scene is the one saved
    allstats = []
    for key in keys:
        objs, accs, st = build_variant(key)
        out = os.path.join(MODELS, VARIANTS[key]['file'] + '.glb')
        export(out); st['glb'] = out
        if key == 'base' or only: st['checks'] = checks(accs)
        allstats.append(st)
        print('BUILT', json.dumps(st), flush=True)
        if key == 'base':
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'heikegani.blend'), compress=True)
    with open(os.path.join(TASK_DIR, 'build_stats.json' if not only else f'build_stats_{only}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=2)

main()
