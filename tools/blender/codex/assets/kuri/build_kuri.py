"""Kuri (Momiji Hollow common melee enemy, EN-1): deterministic build of Option A "Spiky Bruiser".

Blender 4.3:
  blender --background --factory-startup --python build_kuri.py [-- --variant base|roasted|momiji]

Builds every variant from an empty scene and exports public/models/kuri.glb, kuri_roasted.glb and kuri_momiji.glb,
then saves kuri.blend (the base variant). Units: metres, front = -Y, ground z = 0.

Parts (the enemy contract + the brief's body pivot):
  body  nut, face, feet (+ the momiji leaf)   origin = the ball centre (0, 0, 0.46): the whole ball rolls about it
  br    the +X burr half (+ hinge knuckles 0, 2) origin = the hinge (0, +0.40, 0.46); +0.5 rad about Z opens it
  bl    the -X burr half (+ hinge knuckles 1, 3) origin = the same hinge;                -0.5 rad about Z opens it
Modelled SHUT (rotation 0 = a closed ball). Vertex colour only (face-corner FLOAT_COLOR `Col`), materials `toon`
(+ `glow` on the roasted variant's spike tips), no UVs, no rig.

Technique
- The nut is a surface of revolution on a structured grid; one row of every column is moved onto the wavy cream-base
  border, so that colour border runs exactly along an edge loop.
- Each burr half is ONE closed grid (a topological sphere): rings about the half's side pole (+-X) run from the outer
  pole out to the boundary (the front/back seam and the bottom opening, with rounded corners), round a half-circle rim
  (4 cm thick, fully rounded lip that just touches x = 0) and back over the inner lining to the inner pole.
- Spikes are low-poly rounded cones (7 sides, convex flanks, blunt tip), sunk 1.5 cm into the shell, area-uniform
  spiral layout per half.
- Face features are single-sided decals 2-7 mm above the nut (the eyes domed), triangulated with a constrained
  Delaunay in front-view coordinates where every colour border is a constraint loop, then projected onto the nut by
  ray casting and given the nut's own (interpolated) normals, so the shading and the game's ink hull are unchanged.
- Vertex normals: area-weighted per closed sub-mesh (smooth everywhere, nothing crumples); decals copy the base.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
from mathutils.bvhtree import BVHTree

print('KURI build pid', os.getpid(), flush=True)
TASK_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
PI, TAU = math.pi, 2 * math.pi
GA = PI * (3 - math.sqrt(5))          # the golden angle

# ================================================================== dimensions (m)
C = np.array([0.0, 0.0, 0.46])        # the ball centre = body pivot
HINGE = np.array([0.0, 0.40, 0.46])   # the hinge line between the two pivots
HINGES = {+1: np.array([0.03, 0.40, 0.46]), -1: np.array([-0.03, 0.40, 0.46])}   # br / bl pivots (round 2)
R_MID, T_SH = 0.42, 0.04              # shell mid radius and thickness -> outer 0.44, inner 0.40
R_O, R_I = R_MID + T_SH / 2, R_MID - T_SH / 2
RIM = T_SH / 2                        # rim lip radius (the lip just touches x = 0)
Z_CUT = -0.404                        # bottom opening: rim centre circle r 0.115 at z 0.056 -> clear opening ~0.19 m

# ================================================================== palette (sRGB hex)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
COMMON = dict(base='#f0dcb0', foot='#6a3418', toe='#6a3418', iris='#33201e', iris_low='#6a3a24', sclera='#fff6ea',
              catch='#ffffff', lid='#292125', brow='#292125', mouth='#292125', fang='#fff6ea', blush='#e98c91',
              lining='#fff2d2', lining_rim='#f6dca8')
VARIANTS = {
    'base':    dict(COMMON, burr='#8cc43e', tip='#eef6a8', nut='#b5622c', gloss='#e89a5c', hinge='#9a9a3c', file='kuri'),
    'roasted': dict(COMMON, burr='#6a4428', tip='#ffae3a', nut='#8c4620', gloss='#c87a48', lining='#c89a64', lining_rim='#b88650', hinge='#8a6a3a',
                    glow_tips=True, file='kuri_roasted'),
    'momiji':  dict(COMMON, burr='#c2d45a', tip='#ff6a3a', nut='#bc6a30', gloss='#eca064', hinge='#a09a40', leaf='#e8482e',
                    file='kuri_momiji'),
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

# ================================================================== mesh accumulator
class Acc:
    def __init__(self): self.V = []; self.N = []; self.F = []; self.C = []; self.M = []; self.n = 0; self.log = {}; self.tags = []
    def add(self, V, F, FC, N=None, mat=None, tag='part', orient=True):
        """V (n,3), F (m,3), FC per-face (m,3) or per-corner (m,3,3) linear colour, N vertex normals (None: computed,
        area-weighted, after orienting the closed sub-mesh outward), mat per-face material index (0 toon, 1 glow)."""
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
        M = np.concatenate(self.M)
        me = bpy.data.meshes.new(name)
        me.from_pydata(V.tolist(), [], F.tolist()); me.update()
        assert len(me.polygons) == len(F), 'from_pydata dropped faces'
        me.polygons.foreach_set('use_smooth', [True] * len(F))
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        rgba = np.concatenate([Cc.reshape(-1, 3), np.ones((len(F) * 3, 1))], 1)
        attr.data.foreach_set('color', rgba.astype(np.float32).ravel())
        me.color_attributes.active_color = attr; me.color_attributes.render_color_index = 0
        used = sorted(set(M.tolist()))
        for m in mats: me.materials.append(m)
        me.polygons.foreach_set('material_index', M.tolist())
        me.normals_split_custom_set_from_vertices(N.tolist())
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        ob.location = tuple(origin)
        if 1 not in used and len(mats) > 1: me.materials.pop(index=1)
        return ob

# ================================================================== loft: rows of loops (or poles) -> closed grid
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

# ================================================================== the nut (body): surface of revolution
# profile (r, z) from the bottom pole to the tip; fits inside the shut burr's lining (radius 0.40 about C) above the
# bottom opening (checked in the report)
NUT_CP = [(0.0, 0.074), (0.06, 0.079), (0.11, 0.091), (0.158, 0.112), (0.203, 0.139), (0.243, 0.169), (0.281, 0.204),
          (0.316, 0.249), (0.342, 0.30), (0.357, 0.35), (0.363, 0.40), (0.360, 0.47), (0.338, 0.54), (0.292, 0.61),
          (0.232, 0.672), (0.166, 0.724), (0.100, 0.766), (0.054, 0.798), (0.025, 0.825), (0.009, 0.845), (0.0, 0.857)]
_P = catmull(NUT_CP, 50); _P[:, 0] = np.maximum(_P[:, 0], 0)
_S = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(_P, axis=0), axis=1))]); S_MAX = _S[-1]
def prof(s): return np.interp(s, _S, _P[:, 0]), np.interp(s, _S, _P[:, 1])
def s_of_z(z, lo=True):
    """arc length at height z on the lower (bulge-below) side of the profile"""
    return np.interp(z, _P[:, 1], _S)
def nut_r(z): return np.interp(z, _P[:, 1], _P[:, 0])
Z_BORDER = 0.24
def border_z(phi):
    """the wavy cream-base border (height at azimuth phi; phi = 0 is the front)"""
    return Z_BORDER + 0.010 * np.cos(9 * phi + 0.5) + 0.005 * np.sin(4 * phi + 1.9)

def build_nut(acc, pal):
    NC = 34
    tt = np.arange(NC) / NC * TAU; phis = tt - 0.5 * np.sin(tt)   # 0 = front (-Y), toward +X; front columns 2x denser
    # nominal rows (arc length): denser around the face and the tip
    s_lo = np.array([0.0, 0.07, 0.15, 0.24])              # fractions of the bottom part (pole .. border)
    sb_nom = s_of_z(Z_BORDER)
    zs_hi = [0.30, 0.37, 0.44, 0.51, 0.58, 0.645, 0.70, 0.75, 0.795, 0.835]
    rows = [np.array([[0.0, 0.0, prof(0)[1]]])]
    nlo = 4
    for j in range(1, nlo + 1):                            # rows from the pole up to the border (the last = border)
        pts = []
        for phi in phis:
            sb = s_of_z(border_z(phi)); s = sb * j / nlo
            r, z = prof(s); pts.append((r * math.sin(phi), -r * math.cos(phi), z))
        rows.append(np.array(pts))
    jb = len(rows) - 1                                     # border row index
    for zz in zs_hi:
        pts = []
        for phi in phis:
            zb = border_z(phi); z = zz if zz > zb + 0.03 else zb + (zz - Z_BORDER) * 0.9
            r = nut_r(z); pts.append((r * math.sin(phi), -r * math.cos(phi), z))
        rows.append(np.array(pts))
    rows.append(np.array([[0.0, 0.0, prof(S_MAX)[1]]]))
    V, F, band, colm = loft(rows)
    nut, base, sole = lin(pal['nut']), lin(pal['base']), lin(pal['foot']) * 0.85
    FC = np.zeros((len(F), 3, 3))
    for f in range(len(F)):
        lower = band[f] < jb
        for k in range(3):
            z = V[F[f, k], 2]
            if band[f] < 2: FC[f, k] = sole                      # the underside seen through the opening: dark
            elif lower: FC[f, k] = base * (0.9 + 0.1 * sstep(0.06, 0.2, z))
            else:     FC[f, k] = nut * (1.0 - 0.13 * sstep(0.55, 0.86, z))
    acc.add(V, F, FC, tag='nut')
    return V, F

# ================================================================== decals (front-projected onto a base mesh)
class Surface:
    def __init__(self, V, F):
        self.V, self.F = V, F; self.N = vnormals(V, F)
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in V], [tuple(f) for f in F])
    def project(self, xz, direction=(0, 1, 0), start=-3.0):
        """front coordinates (x, z) -> surface points and interpolated normals (ray along +Y from y = start)"""
        P, N = [], []
        d = Vector(direction)
        for x, z in xz:
            o = Vector((x, start, z)) if direction == (0, 1, 0) else Vector((x, start, z))
            loc, fn, fi, dist = self.bvh.ray_cast(o, d)
            if loc is None: raise RuntimeError(f'decal point off the surface: {(x, z)}')
            tri = self.F[fi]; a, b, c = (self.V[t] for t in tri); p = np.array(loc)
            v0, v1, v2 = b - a, c - a, p - a
            d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
            den = d00 * d11 - d01 * d01; w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
            n = w0 * self.N[tri[0]] + w1 * self.N[tri[1]] + w2 * self.N[tri[2]]
            P.append(p); N.append(n / np.linalg.norm(n))
        return np.array(P), np.array(N)

def decal(acc, surf, layers, spacing, offset, tag, dome=None):
    """layers: [(poly (k,2) CCW, colour or None=drop)] in priority order (first match wins); triangles whose centroid
    is in no layer are dropped. offset: metres above the surface; dome(xz)->extra offset."""
    pts, loops = [], []
    for poly, _ in layers:
        loops.append(list(range(len(pts), len(pts) + len(poly)))); pts.extend(poly.tolist())
    allp = np.vstack([p for p, _ in layers]); lo, hi = allp.min(0), allp.max(0)
    gx = np.arange(lo[0] + spacing / 2, hi[0], spacing); gz = np.arange(lo[1] + spacing / 2, hi[1], spacing)
    G = np.array([(x, z) for x in gx for z in gz]) if len(gx) and len(gz) else np.zeros((0, 2))
    if len(G):
        keep = np.zeros(len(G), bool)
        for poly, col in layers:
            if col is not None: keep |= inside(poly, G)
        dmin = np.min([dist_to_poly(p, G) for p, _ in layers], axis=0)
        G = G[keep & (dmin > spacing * 0.45)]
        pts.extend(G.tolist())
    V2, F = cdt(np.array(pts), loops)
    cen = V2[F].mean(1); FC = np.zeros((len(F), 3)); keep = np.zeros(len(F), bool); taken = np.zeros(len(F), bool)
    for poly, col in layers:
        m = inside(poly, cen) & ~taken
        if col is not None: FC[m] = col; keep |= m
        taken |= m
    F = F[keep]; FC = FC[keep]
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used)); V2 = V2[used]; F = remap[F]
    P, N = surf.project(V2)
    off = offset + (dome(V2) if dome else 0)
    acc.add(P + N * np.asarray(off)[..., None] if np.ndim(off) else P + N * off, F, FC, N=N, tag=tag)

EYE_X, EYE_Z, EYE_A, EYE_B = 0.186, 0.436, 0.074, 0.084
def eye_outline(side):
    """front-view outline of one eye (side +1 = viewer's right). Angry: the top is cut by a lid line sloping down
    toward the nose."""
    t = np.linspace(0, TAU, 64, endpoint=False); lx = EYE_A * np.cos(t); lz = EYE_B * np.sin(t)
    lid = 0.060 + 0.15 * lx                                  # lx > 0 = outward
    lz = np.where(lz > 0, smin(lz, lid, 0.022), lz)
    P = resample_loop(np.stack([lx, lz], -1), 30)
    return P
def eye_top(lx):
    e = EYE_B * np.sqrt(np.clip(1 - (lx / EYE_A) ** 2, 0, 1)); return smin(e, 0.060 + 0.15 * lx, 0.022)

def build_face(acc, surf, pal):
    L = {k: lin(pal[k]) for k in ('iris', 'iris_low', 'sclera', 'catch', 'lid', 'brow', 'mouth', 'fang', 'blush')}
    for side in (-1, 1):
        cx = side * EYE_X
        def W(P): return np.stack([cx + side * P[:, 0], EYE_Z + P[:, 1]], -1)   # local (outward, up) -> world (x, z)
        eye = ccw(W(eye_outline(side)))
        ic = np.array([cx - side * 0.013, EYE_Z - 0.008])
        iris = ccw(ellipse(ic[0], ic[1], 0.063, 0.072, 20))
        low = ccw(ellipse(ic[0], ic[1] - 0.056, 0.055, 0.038, 13))
        c1 = ccw(ellipse(ic[0] - 0.019, ic[1] + 0.021, 0.0185, 0.0185, 12))
        c2 = ccw(ellipse(ic[0] + 0.021, ic[1] - 0.024, 0.0078, 0.0078, 8))
        lx = np.linspace(-0.059, 0.062, 9); lp = np.stack([lx, eye_top(lx) + 0.0035], -1)
        hw = 0.0072 + 0.0035 * sstep(-0.06, 0.04, lx)
        lid = ccw(W(stroke(lp, hw, ncap=4)))
        fl = np.array([[0.052, 0.060], [0.064, 0.067], [0.076, 0.078]])
        flick = ccw(W(stroke(fl, np.array([0.0062, 0.0052, 0.0032]), ncap=4)))
        # first match wins: catchlights, lid, flick; then inside the eye outline the iris / sclera (in _eye_decal)
        tri_layers = [(c1, L['catch']), (c2, L['catch']), (lid, L['lid']), (flick, L['lid']), (eye, 'EYE')]
        _eye_decal(acc, surf, tri_layers, iris, low, L, ic, tag='eyes')
        # brows: inner end low (angry), slightly convex, tapered
        bp = np.array([[0.112, 0.508], [0.131, 0.528], [0.150, 0.545], [0.168, 0.557], [0.183, 0.562]])
        bp[:, 0] *= side
        brow = ccw(stroke(bp, np.array([0.0085, 0.0112, 0.0112, 0.0092, 0.0062]), ncap=5))
        decal(acc, surf, [(brow, L['brow'])], 0.016, 0.0035, 'brows')
        # blush
        bl = ccw(ellipse(side * 0.236, 0.342, 0.037, 0.027, 18))
        decal(acc, surf, [(bl, L['blush'])], 0.018, 0.0022, 'blush')
    # the smirk and the fang (under the mouth's right end, viewer's right)
    mp = np.array([[-0.052, 0.350], [-0.026, 0.344], [0.002, 0.347], [0.028, 0.356], [0.047, 0.369], [0.058, 0.387]])
    mouth = ccw(stroke(mp, np.array([0.0045, 0.0062, 0.0065, 0.0065, 0.006, 0.0045]), ncap=4))
    fang_c = np.array([[0.022, 0.356], [0.040, 0.366], [0.057, 0.379], [0.051, 0.352], [0.046, 0.332], [0.041, 0.329],
                       [0.036, 0.334], [0.029, 0.346]])
    fang = ccw(resample_loop(fang_c, 16))
    decal(acc, surf, [(mouth, L['mouth']), (fang, L['fang'])], 0.012, 0.003, 'mouth')
    # the glossy shine: a curved streak following the upper-left shoulder, and a small dot under it
    gp = np.array([[-0.262, 0.488], [-0.246, 0.543], [-0.218, 0.594], [-0.178, 0.640], [-0.130, 0.680]])
    streak = ccw(stroke(gp, np.array([0.009, 0.016, 0.018, 0.014, 0.007]), ncap=4))
    dot = ccw(ellipse(-0.272, 0.445, 0.011, 0.013, 10))
    decal(acc, surf, [(streak, lin(pal['gloss'])), (dot, lin(pal['gloss']))], 0.02, 0.0025, 'gloss')

def _eye_decal(acc, surf, layers, iris, low, L, ic, tag):
    """the eye decal: catchlights, lid and flick first; inside the eye outline: warm lower iris / iris / sclera"""
    eye = layers[-1][0]
    pts, loops = [], []
    for poly in [p for p, _ in layers] + [iris, low]:
        loops.append(list(range(len(pts), len(pts) + len(poly)))); pts.extend(poly.tolist())
    sp = 0.03
    lo, hi = eye.min(0) - 0.02, eye.max(0) + 0.02
    G = np.array([(x, z) for x in np.arange(lo[0], hi[0], sp) for z in np.arange(lo[1], hi[1], sp)])
    G = G[inside(eye, G)]
    allpolys = [p for p, _ in layers] + [iris, low]
    dmin = np.min([dist_to_poly(p, G) for p in allpolys], axis=0); G = G[dmin > sp * 0.45]
    pts.extend(G.tolist())
    V2, F = cdt(np.array(pts), loops)
    cen = V2[F].mean(1); FC = np.zeros((len(F), 3)); keep = np.zeros(len(F), bool); taken = np.zeros(len(F), bool)
    for poly, col in layers[:-1]:
        m = inside(poly, cen) & ~taken; FC[m] = col; keep |= m; taken |= m
    ine = inside(eye, cen) & ~taken
    ini = inside(iris, cen); inl = inside(low, cen)
    FC[ine & ini & inl] = L['iris_low']; FC[ine & ini & ~inl] = L['iris']; FC[ine & ~ini] = L['sclera']; keep |= ine
    F = F[keep]; FC = FC[keep]
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used)); V2 = V2[used]; F = remap[F]
    P, N = surf.project(V2)
    rr = np.hypot((V2[:, 0] - (ic[0])) / 0.078, (V2[:, 1] - ic[1]) / 0.088)
    off = 0.003 + 0.0035 * np.clip(1 - rr * rr, 0, 1)            # gently domed lens
    acc.add(P + N * off[:, None], F, FC, N=N, tag=tag)

# ================================================================== feet
FOOT_X, FOOT_Y, FOOT_A, FOOT_B, FOOT_UP, FOOT_LO = 0.042, -0.022, 0.035, 0.046, 0.052, 0.040
FOOT_ZC = FOOT_LO
def build_feet(acc, pal):
    foot, toe = lin(pal['foot']), lin(pal['toe'])
    for side in (-1, 1):
        cx = side * FOOT_X; NA, NRw = 10, 6
        rows = [np.array([[cx, FOOT_Y, 0.0]])]
        lats = np.linspace(-PI / 2, PI / 2, NRw + 1)[1:-1]
        for la in lats:
            pts = []
            for i in range(NA):
                a = i / NA * TAU
                b = FOOT_UP if la > 0 else FOOT_LO
                rr = math.cos(la) ** 0.8                                # a slightly boxy, flat-soled pad
                x = cx + FOOT_A * rr * math.sin(a); y = FOOT_Y - FOOT_B * rr * math.cos(a)
                z = FOOT_ZC + b * math.copysign(abs(math.sin(la)) ** (1.0 if la > 0 else 0.7), la)   # flat-ish sole
                pts.append((x, y, max(z, 0.0)))
            rows.append(np.array(pts))
        rows.append(np.array([[cx, FOOT_Y, FOOT_ZC + FOOT_UP]]))
        V, F, band, colm = loft(rows)
        FC = np.zeros((len(F), 3, 3))
        for f in range(len(F)):
            for k in range(3): FC[f, k] = foot * (0.9 + 0.1 * sstep(0.0, 0.05, V[F[f, k], 2]))
        acc.add(V, F, FC, tag='feet')
def vnormals_fix(V, F):
    return F if signed_volume(V, F) > 0 else F[:, [0, 2, 1]]

# ================================================================== the burr halves
def d_of(side, psi, beta):
    """unit direction for the half on `side` (+1 = +X): psi from the side pole, beta about X (0 = +Y back, pi/2 = up)"""
    return np.stack([side * np.cos(psi), np.sin(psi) * np.cos(beta), np.sin(psi) * np.sin(beta)], -1)
PSI_SEAM = math.acos(RIM / R_MID)
def psi_boundary(beta):
    """the half's boundary (on the mid sphere): the seam lip and the bottom opening, corners rounded"""
    bf = np.linspace(0, TAU, 1440, endpoint=False)
    sb = np.sin(bf); K = -Z_CUT / R_MID
    with np.errstate(divide='ignore', invalid='ignore'):
        pc = np.where(-sb > K, np.arcsin(np.clip(K / np.maximum(-sb, 1e-9), 0, 1)), PI)
    pb = np.minimum(PSI_SEAM, pc)
    # round the two seam/opening corners: circular blur (never raises the boundary much past the hard min)
    sig = 0.05; kx = np.arange(-60, 61) * (TAU / 1440); w = np.exp(-0.5 * (kx / sig) ** 2); w /= w.sum()
    pbb = np.real(np.fft.ifft(np.fft.fft(pb) * np.fft.fft(np.roll(np.pad(w, (0, 1440 - len(w))), -60))))
    pbb = np.minimum(pbb, pb + 0.0)                         # stay inside the hard boundary
    return np.interp(np.mod(beta, TAU), np.append(bf, TAU), np.append(pbb, pbb[0]))

GREEN_BAND = 0.06
def build_half(acc, pal, side, spike_seed):
    NB, NO, NIr = 26, 6, 4
    # columns about the side pole, ~2.5x denser at the bottom (beta = 3pi/2) where the small opening is
    bf = np.linspace(0, TAU, 2049); dens = 1 + 1.6 * np.exp(-((((bf - 1.5 * PI) + PI) % TAU - PI) / 0.33) ** 2)
    cdf = np.concatenate([[0], np.cumsum((dens[1:] + dens[:-1]) / 2 * np.diff(bf))]); cdf /= cdf[-1]
    betas = np.interp((np.arange(NB) + 0.5) / NB, cdf, bf)
    pb = psi_boundary(betas)
    burr, burr_d, lining, tip = lin(pal['burr']), lin(pal['burr']) * 0.78, lin(pal['lining']), lin(pal['tip'])
    # boundary on the mid sphere, its normal n (radial) and the outward in-surface direction m
    B = R_MID * d_of(side, pb, betas)
    eps = 1e-4
    Bp = R_MID * d_of(side, psi_boundary(betas + eps), betas + eps); Bm = R_MID * d_of(side, psi_boundary(betas - eps), betas - eps)
    T = nz(Bp - Bm); n = nz(B)
    m = nz(np.cross(T, n)); outward = R_MID * d_of(side, pb + 0.01, betas) - B
    m *= np.sign(np.einsum('ij,ij->i', m, outward))[:, None]
    rows = [np.array([C + R_O * d_of(side, 0.0, 0.0)])]
    for k in range(1, NO + 1):
        u = k / NO; rows.append(C + R_O * d_of(side, pb * u, betas))
    NR = 3
    for j in range(1, NR):
        ph = PI * j / NR; rows.append(C + B + RIM * (n * math.cos(ph) + m * math.sin(ph)))
    # inner rows: the boundary, an edge loop 6 cm in (the green band's border at the opening), then the lining
    u_g = 1 - GREEN_BAND / (R_I * pb)
    for u in (np.ones(NB), u_g, 0.6, 0.3):
        rows.append(C + R_I * d_of(side, pb * u, betas))
    rows.append(np.array([C + R_I * d_of(side, 0.0, 0.0)]))
    V, F, band, colm = loft(rows)
    # flatten the back cap round the hinge a little, so the two halves' backs never swing into each other
    P0 = V - C; e = V[:, 1] - HINGE[1]
    emax = 0.011 + 2.2 * (V[:, 0] ** 2 + P0[:, 2] ** 2)
    hit = e > 0
    V[hit, 1] = HINGE[1] + smin(e[hit], emax[hit], 0.008)
    nb_out = NO; nb_rim = NR
    rim_in = lin(pal['lining_rim'])
    bmid = (betas + np.roll(betas, -1) + np.where(np.arange(NB) == NB - 1, TAU, 0)) / 2
    opening_col = psi_boundary(bmid) < PSI_SEAM - 0.04          # the columns whose boundary is the bottom opening
    FC = np.zeros((len(F), 3, 3))
    for f in range(len(F)):
        b = band[f]; at_open = opening_col[colm[f]] if b > 0 else False
        for k in range(3):
            p = V[F[f, k]] - C
            if b < nb_out + 1:                         # outer surface + the first rim band
                t = sstep(-0.42, 0.10, p[2]); FC[f, k] = burr_d + (burr - burr_d) * t
            elif b == nb_out + 1:                      # the lip
                FC[f, k] = lin(pal['burr']) * 0.62
            elif b in (nb_out + 2, nb_out + 3):        # inner rim, then the 6 cm band: green only at the opening
                FC[f, k] = burr_d if at_open else (rim_in if b == nb_out + 2 else lining)
            else:
                FC[f, k] = lining
    acc.add(V, F, FC, tag='shell')
    build_spikes(acc, pal, side, spike_seed)
    build_knuckles(acc, pal, side)

def build_spikes(acc, pal, side, seed):
    burr, tip = lin(pal['burr']), lin(pal['tip']); glow = bool(pal.get('glow_tips'))
    psimax = PSI_SEAM - 0.15; N = 23
    dirs, lens = [], []
    for i in range(N):
        cp = 1 - (1 - math.cos(psimax)) * (i + 0.5) / N; psi = math.acos(cp); beta = seed + i * GA
        if psi > psi_boundary(np.array([beta]))[0] - 0.17: continue
        d = d_of(side, np.array(psi), np.array(beta))
        if d[1] > 0.75 and abs(d[2]) < 0.4 and psi > 1.0: continue          # keep clear of the hinge knuckles
        dirs.append(d); lens.append(0.088 + 0.016 * (((i * 7 + int(seed * 10)) % 5) / 4))
    for d, L in zip(dirs, lens):
        d = np.asarray(d, float)
        if d[2] < 0: L = min(L, (C[2] - 0.006) / -d[2] - R_O)   # downward spikes stop above the ground at rest
        a1 = nz(np.cross(d, [0, 0, 1] if abs(d[2]) < 0.9 else [1, 0, 0])); a2 = np.cross(d, a1)
        base = C + d * R_O
        rb = 0.047; NS = 8
        rings = [(-0.016, rb * 1.05), (0.40 * L, rb * 0.76), (0.80 * L, rb * 0.37)]
        rows = []
        for h, r in rings:
            rows.append(np.array([base + d * h + r * (math.cos(a) * a1 + math.sin(a) * a2)
                                  for a in np.arange(NS) / NS * TAU]))
        rows.append(np.array([base + d * L]))
        V, F, band, colm = loft(rows)
        FC = np.zeros((len(F), 3, 3)); mat = np.zeros(len(F), int)
        for f in range(len(F)):
            for k in range(3):
                h = (V[F[f, k]] - base) @ d
                t = sstep(-0.012, 0.30 * L, h); FC[f, k] = burr + (tip - burr) * (0.45 + 0.55 * t)
            if glow and band[f] >= 1: mat[f] = 1; FC[f] = tip
        # open base ring (sunk in the shell): orient by the spike axis, normals averaged
        fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); cen = V[F].mean(1)
        outw = cen - (base + d * ((cen - base) @ d)[:, None])
        flip = np.einsum('ij,ij->i', fn, outw + d * 1e-3) < 0
        F[flip] = F[flip][:, [0, 2, 1]]; FC[flip] = FC[flip][:, [0, 2, 1]]
        acc.add(V, F, FC, N=None, mat=mat, tag='spikes', orient=False)
    return len(dirs)

PIN_LEVELS = [(0.315, 0.025), (0.327, 0.031), (0.395, 0.031), (0.405, 0.026), (0.415, 0.031), (0.495, 0.031),
              (0.505, 0.026), (0.515, 0.031), (0.593, 0.031), (0.605, 0.025)]
def build_knuckles(acc, pal, side):
    """the half's hinge pin, like the sheet's two back pins: a D-section barrel on the half's own pivot axis, round side
    out, flat side 3 mm behind the half's own lining, so turning about its own axis it never moves or shows inside"""
    col = lin(pal['hinge']); y0 = 0.003; piv = HINGES[side]
    rows = []
    for z, r in PIN_LEVELS:
        a0 = math.asin(y0 / r); arc = np.linspace(a0, PI - a0, 5)
        rows.append(np.array([(piv[0] + r * math.cos(a), piv[1] + r * math.sin(a), z) for a in arc]))
    c0 = rows[0].mean(0); c1 = rows[-1].mean(0)
    rows = [np.array([c0])] + rows + [np.array([c1])]
    V, F, band, colm = loft(rows)
    FC = np.zeros((len(F), 3)); FC[:] = col
    groove = np.isin(band, [3, 4, 6, 7]); FC[groove] = col * 0.8
    flat = (colm == len(rows[1]) - 1) & (band > 0) & (band < len(rows) - 2)
    FC[flat] = lin(pal['burr']) * 0.62
    acc.add(V, F, FC, tag='hinge')

# ================================================================== the momiji leaf (stuck on the nut's top)
LOBES = [(0, 1), (0.8, 0.93), (-0.8, 0.93), (1.58, 0.76), (-1.58, 0.76), (2.36, 0.42), (-2.36, 0.42)]
def lobeR(phi):
    r = 0.27
    for a, L in LOBES:
        x = abs((phi - a + PI) % TAU - PI)
        if x < 0.4: r += L * 0.73 * (1 - x / 0.4) ** 1.6
    return r
LEAF_TILT = 0.20
def build_leaf(acc, pal, surf):
    size, t = 0.186, 0.032
    angs = sorted(set([-PI + (i + 0.5) / 30 * TAU for i in range(30)] + [a for a, _ in LOBES]))
    P = np.array([(math.sin(p) * lobeR(p) * size, math.cos(p) * lobeR(p) * size) for p in angs])
    P = ccw(P); n0 = len(P)
    # inner offset loop for the rounded edge, plus a sparse interior lattice
    d0 = 0.010
    G = np.array([(x, y) for x in np.arange(-0.14, 0.14, 0.036) for y in np.arange(-0.06, 0.15, 0.036)])
    G = G[inside(P, G)]; G = G[dist_to_poly(P, G) > 0.016]
    cen = np.zeros(2)
    Q = P * 0.0
    for i, p in enumerate(P):
        v = p - cen; Q[i] = p - nz(v) * d0
    pts = np.vstack([P, Q[::4], G]); V2, F = cdt(pts, [list(range(n0))])
    keep = inside(P, V2[F].mean(1)); F = F[keep]
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used)); V2 = V2[used]; F = remap[F]
    dd = dist_to_poly(P, V2); h = 0.0045 + (t / 2 - 0.0045) * np.sqrt(np.clip(dd / d0, 0, 1) * (2 - np.clip(dd / d0, 0, 1)))
    # two skins (top +h, bottom -h) joined round the outline by a side strip
    nv = len(V2)
    V3 = np.vstack([np.c_[V2, h], np.c_[V2, -h]])
    Ft = F; Fb = (F + nv)[:, [0, 2, 1]]
    bi = [int(np.argmin(np.linalg.norm(V2 - p, axis=1))) for p in P]
    side = []
    for i in range(len(bi)):
        a, b = bi[i], bi[(i + 1) % len(bi)]
        side += [(a, b, b + nv), (a, b + nv, a + nv)]
    FF = np.vstack([Ft, Fb, np.array(side)])
    # place: on the nut's upper front-right slope, tip pointing up and to the right, sunk a little
    anchor_xz = (0.06, 0.665)
    Pn, Nn = surf.project([anchor_xz]); p0, n0v = Pn[0], Nn[0]
    up = nz(np.array([0.35, 0.0, 1.0]) - n0v * (np.array([0.35, 0.0, 1.0]) @ n0v))
    rt = np.cross(up, n0v)
    # tilt about the leaf's side axis so the tip lifts off the nut (pivot just above the stem), cup it sideways
    tl = LEAF_TILT; up2 = math.cos(tl) * up + math.sin(tl) * n0v; n2 = math.cos(tl) * n0v - math.sin(tl) * up
    yy = V3[:, 1] - 0.02
    W = p0 + n0v * (t * 0.3) + np.outer(V3[:, 0], rt) + np.outer(yy, up2) + np.outer(V3[:, 2], n2)
    W -= np.outer(V3[:, 0] ** 2 * 2.2, n2)
    leaf = lin(pal['leaf']); light = leaf + (lin('#ffb08a') - leaf) * 0.4
    FC = np.zeros((len(FF), 3, 3))
    for f in range(len(FF)):
        for k in range(3):
            q = V3[FF[f, k]]; r = math.hypot(q[0], q[1] - 0.0) / size
            FC[f, k] = light + (leaf * 0.9 - light) * min(1, max(0, (r - 0.08) * 2.2))
    acc.add(W, FF, FC, tag='leaf')

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
    return [m, g]

def build_variant(key):
    pal = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    body = Acc()
    NV, NF = build_nut(body, pal)
    surf = Surface(NV, vnormals_fix(NV, NF))
    build_face(body, surf, pal)
    build_feet(body, pal)
    if pal.get('leaf'): build_leaf(body, pal, surf)
    br, bl = Acc(), Acc()
    build_half(br, pal, +1, 0.35)
    build_half(bl, pal, -1, 1.9)
    ob = body.to_object('body', mats, C); obr = br.to_object('br', mats, HINGES[+1]); obl = bl.to_object('bl', mats, HINGES[-1])
    stats = {'variant': key, 'body': body.tris(), 'br': br.tris(), 'bl': bl.tris(), 'total': body.tris() + br.tris() + bl.tris(),
             'body_parts': body.log, 'br_parts': br.log}
    return (ob, obr, obl), (body, br, bl), stats

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_normals=True,
                              export_lights=False, export_cameras=False, export_animations=False, export_materials='EXPORT',
                              export_texcoords=False, export_tangents=False)

# ------------------------------------------------------------------ checks: clearance at the game's hinge angles
def rotz(V, ang, piv):
    c, s = math.cos(ang), math.sin(ang); Q = V - piv
    return np.stack([c * Q[:, 0] - s * Q[:, 1], s * Q[:, 0] + c * Q[:, 1], Q[:, 2]], -1) + piv
def bvh(V, F): return BVHTree.FromPolygons([tuple(v) for v in V], [tuple(f) for f in F])
def tag_of(acc, fi):
    n = 0
    for (tag, F) in zip(acc.tags, acc.F):
        if fi < n + len(F): return tag
        n += len(F)
    return '?'
def checks(accs):
    body, br, bl = accs
    bV, _, bF = body.arrays(); rV, _, rF = br.arrays(); lV, _, lF = bl.arrays()
    out = {}
    tb = bvh(bV, bF)
    for ang in (0.0, 1.0, 1.5):
        tr = bvh(rotz(rV, ang, HINGES[1]), rF); tl = bvh(rotz(lV, -ang, HINGES[-1]), lF)
        out[f'body_x_br@{ang}'] = len(tb.overlap(tr)); out[f'body_x_bl@{ang}'] = len(tb.overlap(tl))
        ov = tr.overlap(tl); rc = rotz(rV, ang, HINGES[1])[rF].mean(1)
        far = [i for i, j in ov if np.hypot(rc[i][0] - HINGE[0], rc[i][1] - HINGE[1]) > 0.075]
        out[f'br_x_bl@{ang}'] = len(ov); out[f'br_x_bl_away_from_hinge@{ang}'] = len(far)
        rs = np.vstack([V for V, tg in zip(br.V, br.tags) if tg == 'shell']); ls = np.vstack([V for V, tg in zip(bl.V, bl.tags) if tg == 'shell'])
        rs = rotz(rs, ang, HINGES[1]); ls = rotz(ls, -ang, HINGES[-1])
        rb_ = rs[rs[:, 1] > 0.36]; lb_ = ls[ls[:, 1] > 0.36]
        out[f'shell_cross_depth_m@{ang}'] = round(float(max(0.0, lb_[:, 0].max() - rb_[:, 0].min())), 4)
        if ang == 0.0:
            ob_ = tb.overlap(tr) + tb.overlap(tl); bc = bV[bF].mean(1)
            if ob_:
                zz = np.array([bc[i][2] for i, _ in ob_]); rr = np.array([np.linalg.norm(bc[i] - C) for i, _ in ob_])
                out['shut_overlap_body_z_range'] = [round(float(zz.min()), 3), round(float(zz.max()), 3)]
                out['shut_overlap_body_tags'] = sorted(set(tag_of(body, i) for i, _ in ob_))
    # how far the nut (+feet, leaf) reaches past the lining / the outer shell when shut (radius about C)
    rad = np.linalg.norm(bV - C, axis=1); hi = bV[:, 2] > 0.15
    out['body_max_radius_above_z0.15'] = round(float(rad[hi].max()), 4)
    lv = [V for V, tg in zip(body.V, body.tags) if tg == 'leaf']
    if lv: out['leaf_max_radius'] = round(float(np.linalg.norm(np.vstack(lv) - C, axis=1).max()), 4)
    return out

def main():
    only = arg('--variant')
    keys = [only] if only else ['roasted', 'momiji', 'base']   # base last: its scene is the one saved
    allstats = []
    for key in keys:
        obs, accs, st = build_variant(key)
        out = os.path.join(MODELS, VARIANTS[key]['file'] + '.glb')
        export(out); st['glb'] = out
        st['checks'] = checks(accs)
        allstats.append(st)
        print('BUILT', json.dumps(st), flush=True)
        if key == 'base':
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'kuri.blend'), compress=True)
    with open(os.path.join(TASK_DIR, 'build_stats.json' if not only else f'build_stats_{only}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=2)

main()
