"""Dust bunny (the Burrow's swarm fodder, EN-1): deterministic build of Option A "Fluff Ball".

Blender 4.3:
  blender --background --factory-startup --python build_dust-bunny.py [-- --variant base|blue|warm]

Builds every variant from an empty scene and exports public/models/dust-bunny.glb, dust-bunny_blue.glb and
dust-bunny_warm.glb, then saves dust-bunny.blend (the base variant). Units: metres, front = -Y, ground z = 0.

One rigid part (the brief's one-piece note): a single mesh object `body`, origin (0, 0, 0) = the ground centre.
Vertex colour only (face-corner FLOAT_COLOR `Col`), one material `toon`, no UVs, no rig.

Technique
- Fur: ~30 ellipsoid puffs, smooth-unioned as a signed distance field (polynomial smin, k = 2.2 cm, so every crease
  between puffs is a tight soft groove). Meshed by voxel-remeshing the overlapping puff spheres, every vertex pulled
  onto the smooth-union isosurface (Newton steps), decimated (collapse, X-symmetric) to the budget, pulled onto the
  isosurface again. Normals are the field's gradient, so the surface is perfectly smooth under the ink hull.
  Colours: the crease factor (how close the second-nearest puff is) blends fur -> recess, a whisper of top light and
  a darker underside.
- Face: a forward ellipsoid "muzzle ball" sunk into the fur (its border with the fur is the geometric intersection).
  Its front half is a constrained Delaunay triangulation in front-view coordinates in which every feature outline
  (eye, iris, catchlights, lash line + flicks, nose, mouth, blush) is a constraint loop, so each colour border runs
  along an edge loop; vertices are lifted onto the ellipsoid (the eyes and nose domed a few mm). Back half: a fan.
- Ears: closed lofts along a bent spline (up, then flopping out and back), a fat rounded lobe at the tip, the inner
  ear a cupped pale panel whose border runs along the loft's rings and columns.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

print('DUSTBUNNY build pid', os.getpid(), flush=True)
TASK_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TASK_DIR)
from db_shape import *          # puffs, the fur field, the face ellipsoid, feature anchors
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
PI, TAU = math.pi, 2 * math.pi

# ================================================================== palette (sRGB hex)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
COMMON = dict(skin='#f3dfd7', iris='#292125', iris_low='#5c3b33', sclera='#fff8f2', sclera_top='#e9e2ea', catch='#ffffff',
              lash='#292125', nose='#786375', mouth='#292125', blush='#e98c91')
VARIANTS = {
    'base': dict(COMMON, fur='#d0c8dc', recess='#aaa0b8', inner='#eee7f2', file='dust-bunny'),
    'blue': dict(COMMON, fur='#c4ccd8', recess='#9ea7b6', inner='#e8edf4', file='dust-bunny_blue'),
    'warm': dict(COMMON, fur='#dccabc', recess='#b5a293', inner='#f5e9e1', file='dust-bunny_warm'),
}

# ================================================================== small math (shared with the kuri build)
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
def catmull_closed(cp, n_per=20):
    cp = np.asarray(cp, float); n = len(cp); out = []
    for i in range(n):
        p0, p1, p2, p3 = cp[(i - 1) % n], cp[i], cp[(i + 1) % n], cp[(i + 2) % n]
        for k in range(n_per):
            t = k / n_per; t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(out)
def resample_loop(P, n):
    Q = np.vstack([P, P[:1]]); seg = np.linalg.norm(np.diff(Q, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], n, endpoint=False)
    return np.stack([np.interp(s, cum, Q[:, k]) for k in range(Q.shape[1])], -1)
def resample_path(P, n):
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], n)
    return np.stack([np.interp(s, cum, P[:, k]) for k in range(P.shape[1])], -1), cum[-1]
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
    def __init__(self): self.V = []; self.N = []; self.F = []; self.C = []; self.n = 0; self.log = {}; self.tags = []
    def add(self, V, F, FC, N=None, tag='part', orient=True):
        """V (n,3), F (m,3), FC per-face (m,3) or per-corner (m,3,3) linear colour, N vertex normals (None: computed)"""
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
        assert np.isfinite(V).all() and np.isfinite(N).all(), tag + ': NaN'
        self.V.append(V); self.N.append(N); self.F.append(F + self.n); self.C.append(FC); self.n += len(V)
        self.log[tag] = self.log.get(tag, 0) + len(F); self.tags.append(tag)
    def tris(self): return sum(len(f) for f in self.F)
    def arrays(self): return np.vstack(self.V), np.vstack(self.N), np.vstack(self.F)
    def to_object(self, name, mats):
        V = np.vstack(self.V); N = np.vstack(self.N); F = np.vstack(self.F); Cc = np.vstack(self.C)
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
        return ob

HIDE = 0.025     # triangles buried deeper than this inside another volume are dropped (the 2.1 cm ink hull can't reach out)
def cull(V, F, FC, N, depth):
    """drop the faces whose three corners are all buried deeper than HIDE (depth: per-vertex signed distance to the
    covering volume, negative inside); returns compacted V, F, FC, N and the number dropped"""
    keep = ~(depth[F] < -HIDE).all(1)
    F, FC = F[keep], FC[keep]
    used = np.unique(F); remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
    return V[used], remap[F], FC, N[used], int((~keep).sum())
def orient_closed(V, F, FC):
    if signed_volume(V, F) < 0: F = F[:, [0, 2, 1]]; FC = FC[:, [0, 2, 1]]
    return F, FC, vnormals(V, F)

def loft(rows):
    """rows: list of (n,3) loops (all the same n) or (1,3) poles -> V, F, band per face, column per face."""
    V, idx = [], []
    for r in rows:
        idx.append(list(range(len(V), len(V) + len(r)))); V.extend(np.asarray(r).tolist())
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

# ================================================================== the fur (shape in db_shape.py)
def fur_grad(P, puffs, e=1e-4):
    g = np.zeros_like(P)
    for k in range(3):
        d = np.zeros(3); d[k] = e
        g[:, k] = (fur_sdf(P + d, puffs) - fur_sdf(P - d, puffs)) / (2 * e)
    return g
def project_fur(P, puffs, it=5):
    for _ in range(it):
        f = fur_sdf(P, puffs); g = fur_grad(P, puffs)
        P = P - (f / np.maximum((g * g).sum(1), 1e-9))[:, None] * g
    return P

def ell_mesh(c, r, nu=24, nv=14):
    V = [(c[0], c[1], c[2] - r[2])]
    for j in range(1, nv):
        th = -PI / 2 + PI * j / nv
        for i in range(nu):
            ph = TAU * i / nu
            V.append((c[0] + r[0] * math.cos(th) * math.cos(ph), c[1] + r[1] * math.cos(th) * math.sin(ph), c[2] + r[2] * math.sin(th)))
    V.append((c[0], c[1], c[2] + r[2])); F = []
    top = len(V) - 1
    for i in range(nu): F.append((0, 1 + (i + 1) % nu, 1 + i))
    for j in range(nv - 2):
        a0 = 1 + j * nu; b0 = a0 + nu
        for i in range(nu):
            i1 = (i + 1) % nu; F.append((a0 + i, a0 + i1, b0 + i1, b0 + i))
    a0 = 1 + (nv - 2) * nu
    for i in range(nu): F.append((a0 + i, a0 + (i + 1) % nu, top))
    return V, F

CULL = {}
FUR_TRIS = int(os.environ.get("DB_FUR", "1790"))   # (the decimate target before the buried faces are culled)
def build_fur(acc, pal, face_d, ear_d):
    puffs = puff_list()
    V, F = [], []
    for c, r in puffs:
        v, f = ell_mesh(c, r); off = len(V); V += v; F += [tuple(i + off for i in q) for q in f]
    me = bpy.data.meshes.new('fur_src'); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new('fur_src', me); bpy.context.scene.collection.objects.link(ob)
    rm = ob.modifiers.new('remesh', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.0065; rm.use_smooth_shade = True
    dg = bpy.context.evaluated_depsgraph_get()
    m2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    P = np.empty(len(m2.vertices) * 3); m2.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    P = project_fur(P, puffs); m2.vertices.foreach_set('co', P.ravel()); m2.update()
    ntri = sum(len(p.vertices) - 2 for p in m2.polygons)
    ob = bpy.data.objects.new('fur_dec', m2); bpy.context.scene.collection.objects.link(ob)
    dm = ob.modifiers.new('dec', 'DECIMATE'); dm.decimate_type = 'COLLAPSE'; dm.ratio = FUR_TRIS / ntri
    dm.use_symmetry = True; dm.symmetry_axis = 'X'; dm.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    m3 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); bpy.data.objects.remove(ob); bpy.data.meshes.remove(m2)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(m3); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(m3); bm.free()
    P = np.empty(len(m3.vertices) * 3); m3.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    Fi = np.array([tuple(p.vertices) for p in m3.polygons], int); bpy.data.meshes.remove(m3)
    # the collapse can leave a few back-to-back twin triangles (a zero-volume fin): drop both copies
    key = np.sort(Fi, 1); _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    CULL['fur_twins'] = int((cnt[inv.ravel()] > 1).sum()); Fi = Fi[cnt[inv.ravel()] == 1]
    E = np.sort(np.vstack([Fi[:, [0, 1]], Fi[:, [1, 2]], Fi[:, [2, 0]]]), 1)
    _, ec = np.unique(E, axis=0, return_counts=True); CULL['fur_open_edges'] = int((ec != 2).sum())
    P = project_fur(P, puffs, 6)
    N = nz(fur_grad(P, puffs))
    # colours: the crease factor (second-nearest puff close) + near the face / ear roots, top light, darker underside
    f, D = fur_sdf(P, puffs, True); Ds = np.sort(D, 1)
    crease = 1 - sstep(0.0, 0.028, Ds[:, 1] - Ds[:, 0])
    crease = np.maximum(crease, 1 - sstep(0.0, 0.026, face_d(P)))
    crease = np.maximum(crease, 1 - sstep(0.0, 0.026, ear_d(P)))
    fur, rec = lin(pal['fur']), lin(pal['recess'])
    t = (crease ** 1.25 * 0.92)[:, None]
    col = fur * (1 - t) + rec * t
    shade = 1.0 + 0.045 * np.clip(N[:, 2], 0, 1) - 0.10 * np.clip(-N[:, 2], 0, 1) - 0.05 * (1 - sstep(0.02, 0.14, P[:, 2]))
    col = col * shade[:, None]
    FC = col[Fi]
    dep = np.minimum(face_d(P), ear_d(P))
    P, Fi, FC, N, CULL['fur'] = cull(P, Fi, FC, N, dep)
    acc.add(P, Fi, FC, N=N, tag='fur')
    return puffs

# ================================================================== the face (shape in db_shape.py)
def eye_layers(s, L):
    """the eye on side s (+1 = +X = the viewer's right in the front view); local lx points outward"""
    cx = s * EYE_X
    def W(P): P = np.atleast_2d(P); return np.stack([cx + s * P[:, 0], EYE_Z + P[:, 1]], -1)
    O = ccw(W(ellipse(0, 0, EYE_A, EYE_B, 26)))
    I = ccw(W(ellipse(-0.014, -0.001, 0.0375, 0.0440, 18)))
    I_in = ccw(W(ellipse(-0.014, -0.004, 0.022, 0.026, 8)))
    c1 = ccw(W(ellipse(-0.024, 0.016, 0.0105, 0.0105, 10)))
    c2 = ccw(W(ellipse(0.004, -0.024, 0.0055, 0.0055, 7)))
    angs = np.radians([122, 104, 86, 68, 50, 32, 14, -4, -24, -46])
    lp = np.stack([EYE_A * 1.0 * np.cos(angs), EYE_B * 1.0 * np.sin(angs) + 0.001], -1)
    hw = np.array([0.0026, 0.0045, 0.0056, 0.0064, 0.0070, 0.0072, 0.0066, 0.0052, 0.0038, 0.0026])
    lash = ccw(W(stroke(lp, hw, ncap=4)))
    flicks = []
    for a0, ang, ln in ((58, 74, 0.017), (30, 42, 0.016)):
        a0 = math.radians(a0); d = np.array([math.cos(math.radians(ang)), math.sin(math.radians(ang))])
        p0 = np.array([EYE_A * 1.02 * math.cos(a0), EYE_B * 1.04 * math.sin(a0)])
        path = np.array([p0, p0 + d * ln * 0.55 + np.array([0.0, 0.0]), p0 + d * ln + np.array([0.003, -0.001])])
        flicks.append(ccw(W(stroke(path, np.array([0.0040, 0.0031, 0.0024]), ncap=4))))
    return dict(O=O, I=I, I_in=I_in, c1=c1, c2=c2, lash=lash, flicks=flicks, W=W)

def nose_poly():
    cp = [(-0.0205, 0.1955), (-0.012, 0.1985), (0.0, 0.1995), (0.012, 0.1985), (0.0205, 0.1955), (0.0175, 0.1885),
          (0.008, 0.1790), (0.0, 0.1755), (-0.008, 0.1790), (-0.0175, 0.1885)]
    return ccw(resample_loop(catmull_closed(cp, 8), 20))
def mouth_polys():
    out = []
    for s in (-1, 1):
        p = np.array([(0.0, 0.1735), (0.0055, 0.1650), (0.0145, 0.1605), (0.0235, 0.1635), (0.0295, 0.1712)]) * np.array([s, 1])
        out.append(stroke(p, np.array([0.0036, 0.0042, 0.0044, 0.0040, 0.0032]), ncap=4))
    out.append(stroke(np.array([(0.0, 0.1790), (0.0, 0.1762), (0.0, 0.1735)]), np.array([0.0036, 0.0038, 0.0036]), ncap=4))
    return out

def dome(xz):
    """mm-scale lifts: the eyes (lens domes) and the nose button"""
    x, z = xz[:, 0], xz[:, 1]; h = np.zeros(len(xz))
    for s in (-1, 1):
        u = ((x - s * EYE_X) / EYE_A) ** 2 + ((z - EYE_Z) / EYE_B) ** 2
        h += 0.0035 * np.sqrt(np.clip(1 - u, 0, 1))
    u = (x / 0.026) ** 2 + ((z - NOSE_C[1]) / 0.019) ** 2
    h += 0.0075 * np.clip(1 - u, 0, 1) ** 1.3
    return h

def to_design(xz):
    """front-view world (x, z) -> the face frame's design (x, z) whose surface point is seen there"""
    xz = np.array(xz, float); zd = xz[:, 1].copy()
    for _ in range(8):
        P, _ = face_point(xz[:, 0], zd); zd += xz[:, 1] - P[:, 2]
    return np.stack([xz[:, 0], zd], -1)

def build_face(acc, pal):
    L = {k: lin(pal[k]) for k in ('skin', 'iris', 'iris_low', 'sclera', 'sclera_top', 'catch', 'lash', 'nose', 'mouth', 'blush')}
    # features are drawn in the front view (world x, z, measured on the sheet) and mapped to the tilted face's own
    # coordinates, so the front view keeps the sheet's heights
    eyes = [eye_layers(s, L) for s in (-1, 1)]
    for e in eyes:
        for k in ('O', 'I', 'I_in', 'c1', 'c2', 'lash'): e[k] = to_design(e[k])
        e['flicks'] = [to_design(f) for f in e['flicks']]
    nose = to_design(nose_poly()); mouths = [to_design(m) for m in mouth_polys()]
    blush = [to_design(ccw(ellipse(s * 0.130, 0.162, 0.0245, 0.0175, 13))) for s in (-1, 1)]
    feature_loops = []
    for e in eyes: feature_loops += [e['c1'], e['c2'], e['lash'], *e['flicks'], e['I'], e['I_in'], e['O']]
    feature_loops += [nose, *mouths, *blush]
    # the face's own rings (ellipse of the muzzle ball in front view, u = sin^2 theta)
    NR = 32
    rim = np.stack([FA * np.cos(np.linspace(0, TAU, NR, endpoint=False)), FCEN[2] + FCz * np.sin(np.linspace(0, TAU, NR, endpoint=False))], -1)
    rings = [rim]
    for th, n in ((74, 30), (62, 28)):
        k = math.sin(math.radians(th)); t = np.linspace(0, TAU, n, endpoint=False) + 0.07
        rings.append(np.stack([FA * k * np.cos(t), FCEN[2] + FCz * k * np.sin(t)], -1))
    pts, loops = [], []
    for lp in [rim] + feature_loops:
        loops.append(list(range(len(pts), len(pts) + len(lp)))); pts.extend(np.asarray(lp).tolist())
    for r in rings[1:]:
        Pr, _ = face_point(r[:, 0], r[:, 1]); vis = fur_sdf(Pr, puff_list()) > -0.03
        pts.extend(r[vis | np.roll(vis, 1) | np.roll(vis, -1)].tolist())
    # interior fill: finer where the face shows (between the fringe and the chin), coarse where the fur covers it
    G = []
    for x in np.arange(-0.17, 0.171, 0.024):
        for z in np.arange(0.06, 0.36, 0.024):
            u = (x / FA) ** 2 + ((z - FCEN[2]) / FCz) ** 2
            if u > 0.70: continue
            if (z > 0.33 or z < 0.08) and (round(x / 0.024) + round(z / 0.024)) % 2: continue
            G.append((x + 0.0045 * math.sin(z * 90), z))
    G = np.array(G)
    Pg, _ = face_point(G[:, 0], G[:, 1])
    G = G[fur_sdf(Pg, puff_list()) > -0.008]           # grid points the fur covers: none (the rings carry the shape there)
    allF = np.vstack(feature_loops)
    keep = np.ones(len(G), bool)
    for lp in feature_loops: keep &= dist_to_poly(lp, G) > 0.0075
    for lp in feature_loops: keep &= ~inside(lp, G) | (dist_to_poly(lp, G) > 0.011)
    pts.extend(G[keep].tolist())
    pts = np.array(pts)
    V2, F = cdt(pts, loops)
    cen = V2[F].mean(1)
    u_c = (cen[:, 0] / FA) ** 2 + ((cen[:, 1] - FCEN[2]) / FCz) ** 2
    F = F[u_c < 1.0]; cen = V2[F].mean(1)
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used)); V2 = V2[used]; F = remap[F]
    # classify (first match wins)
    nF = len(F); cls = np.full(nF, 'skin', dtype=object)
    taken = np.zeros(nF, bool)
    def claim(poly, name, extra=None):
        m = inside(poly, cen) & ~taken
        if extra is not None: m &= extra
        cls[m] = name; taken[m] = True
    for e in eyes:
        claim(e['c1'], 'catch'); claim(e['c2'], 'catch')
    for e in eyes:
        claim(e['lash'], 'lash')
        for fl in e['flicks']: claim(fl, 'lash')
    for e in eyes:
        claim(e['I'], 'iris', inside(e['O'], cen)); claim(e['O'], 'sclera')
    claim(nose, 'nose')
    for mp in mouths: claim(mp, 'mouth')
    for b in blush: claim(b, 'blush')
    # 3-D: lift onto the ellipsoid (+ domes)
    P, Lc = face_point(V2[:, 0], V2[:, 1])
    N = face_rot(face_n_local(Lc))
    P = P + N * dome(P[:, [0, 2]])[:, None]
    # per-corner colours
    FC = np.zeros((nF, 3, 3))
    for f in range(nF):
        c = cls[f]
        for k in range(3):
            q = V2[F[f, k]]
            if c == 'iris':
                lz = P[F[f, k], 2] - EYE_Z; t = sstep(0.004, -0.036, lz); FC[f, k] = L['iris'] * (1 - t) + L['iris_low'] * t
            elif c == 'sclera':
                lz = P[F[f, k], 2] - EYE_Z; t = sstep(0.0, 0.04, lz) * 0.55; FC[f, k] = L['sclera'] * (1 - t) + L['sclera_top'] * t
            elif c == 'skin':
                t = 1 - sstep(0.07, 0.17, P[F[f, k], 2]); FC[f, k] = L['skin'] * (1 - 0.07 * t)
            else:
                FC[f, k] = L[c]
    # nose / dome normals: the mesh's own normals where lifted, the ellipsoid's elsewhere
    # orient check: front faces must point -Y
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    if (fn[:, 1] < 0).mean() < 0.5: F = F[:, [0, 2, 1]]; FC = FC[:, [0, 2, 1]]
    Nm = vnormals(P, F)
    w = sstep(0.0, 0.002, dome(V2))[:, None]
    N = nz(N * (1 - w) + Nm * w)
    dep = fur_sdf(P, puff_list())
    P, F, FC, N, CULL['face'] = cull(P, F, FC, N, dep)
    acc.add(P, F, FC, N=N, tag='face')
    # back half: the rim loop fanned to a pole behind (all inside the fur)
    rim_idx = np.arange(NR)                       # the rim was the first loop -> the first NR CDT vertices (kept)
    RP, _ = face_point(rim[:, 0], rim[:, 1])
    pole = FCEN + face_rot(np.array([0, 0.09, 0]))[0]
    BV = np.vstack([RP, [pole]]); BF = np.array([(i, (i + 1) % NR, NR) for i in range(NR)])
    # (the back half is buried in the fur: nothing to draw)
    return dict(cls_counts={k: int((cls == k).sum()) for k in set(cls)})

# ================================================================== the ears
EAR_CP = [(0.082, -0.036, 0.385), (0.094, -0.040, 0.455), (0.110, -0.036, 0.516), (0.136, -0.022, 0.558),
          (0.176, 0.005, 0.580), (0.214, 0.036, 0.570), (0.244, 0.066, 0.545), (0.260, 0.090, 0.516)]
NSEG, NRING = 14, 13
def ear_frame_dir(s):
    return nz(np.array([s * 0.55, -0.83, 0.08]))
def ear_profile(t):
    """(half width, half thickness) along the ear (t 0 base .. 1 tip centre)"""
    w = np.interp(t, [0, 0.25, 0.45, 0.60, 0.75, 1.0], [0.072, 0.072, 0.073, 0.076, 0.086, 0.092])
    h = np.interp(t, [0, 0.25, 0.45, 0.60, 0.75, 1.0], [0.058, 0.058, 0.059, 0.064, 0.074, 0.080])
    return w, h
PANEL = (0.08, 0.50)       # the inner ear runs along this part of the stem (t)
def ear_axis(s):
    cp = np.array(EAR_CP) * np.array([s, 1, 1])
    P = catmull(cp, 30); Q, Ltot = resample_path(P, NRING)
    return Q
def ear_d(P):
    """distance to the nearest ear's surface (for the fur's crease shading at the roots), approximate"""
    best = np.full(len(P), 9.0)
    for s in (-1, 1):
        Q = ear_axis(s)[:6]
        for i in range(len(Q) - 1):
            a, b = Q[i], Q[i + 1]; ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
            d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1) - 0.043
            best = np.minimum(best, d)
    return best
def build_ear(acc, pal, s, puffs):
    Q = ear_axis(s); n = len(Q)
    T = nz(np.gradient(Q, axis=0))
    F0 = ear_frame_dir(s)
    tt = np.linspace(0, 1, n)
    rows, meta = [], []
    Fprev = None
    angs = np.arange(NSEG) / NSEG * TAU + PI / 2          # column 0 at a = +90 deg (the panel side, F)
    for i in range(n):
        Fd = F0 - T[i] * (F0 @ T[i]) if Fprev is None else Fprev - T[i] * (Fprev @ T[i])
        Fd = nz(Fd); Fprev = Fd; Wd = np.cross(T[i], Fd)
        w, h = ear_profile(tt[i])
        ring = np.array([Q[i] + w * math.cos(a) * Wd * s + h * math.sin(a) * Fd for a in angs])
        rows.append(ring); meta.append((Fd, Wd, w, h))
    # cup the inner ear: push the panel's interior vertices back along -F
    pan_rows = [i for i in range(n) if PANEL[0] < tt[i] < PANEL[1]]
    for i in pan_rows:
        Fd = meta[i][0]; depth = 0.013 * math.sin(PI * (tt[i] - PANEL[0]) / (PANEL[1] - PANEL[0])) ** 0.6
        for j, a in enumerate(angs):
            da = abs(((a - PI / 2) + PI) % TAU - PI)
            if da < math.radians(60):
                rows[i][j] = rows[i][j] - Fd * depth * math.cos(da / math.radians(64) * PI / 2) ** 0.5
    # caps: base pole (sunk in the fur) and the rounded tip
    base = Q[0] - T[0] * 0.02
    tip_rows = []
    Fd, Wd, w, h = meta[-1]
    capL = max(w, h) * 0.85                                # the bulb's rounded end
    for k, ph in enumerate((0.45, 0.85, 1.22)):
        c = Q[-1] + T[-1] * (math.sin(ph) * capL)
        sc_ = math.cos(ph)
        tip_rows.append(np.array([c + w * sc_ * math.cos(a) * Wd * s + h * sc_ * math.sin(a) * Fd for a in angs]))
    tipp = Q[-1] + T[-1] * capL
    allrows = [np.array([base])] + rows + tip_rows + [np.array([tipp])]
    V, F, band, colm = loft(allrows)
    # band index b: band 0 = base fan; band k (1..n-1) between rows[k-1] and rows[k]
    fur, inner, rec = lin(pal['fur']), lin(pal['inner']), lin(pal['recess'])
    FC = np.zeros((len(F), 3, 3))
    panel_band = set(k + 1 for k in range(n - 1) if PANEL[0] <= tt[k] and tt[k + 1] <= PANEL[1] + 1e-9)
    panel_cols = set(j for j in range(NSEG) if abs(((angs[j] + PI / NSEG - PI / 2) + PI) % TAU - PI) < math.radians(70))
    fs = fur_sdf(V, puffs)
    for f in range(len(F)):
        is_panel = band[f] in panel_band and colm[f] in panel_cols
        for k in range(3):
            p = V[F[f, k]]
            if is_panel:
                t = 0.45 * (1 - sstep(0.43, 0.56, p[2]))       # a soft pink blush deep in the cup, palest at the top
                FC[f, k] = (inner * (1 - t) + lin('#e7c9d3') * t) * 0.97
            else:
                t = (1 - sstep(0.0, 0.03, fs[F[f, k]])) * 0.85
                FC[f, k] = (fur * (1 - t) + rec * t) * (1.0 + 0.04 * sstep(0.5, 0.62, p[2]))
    F, FC, N = orient_closed(V, F, FC)
    V, F, FC, N, CULL['ears'] = cull(V, F, FC, N, fs)
    acc.add(V, F, FC, N=N, tag='ears')
    return len(F)

# ================================================================== materials, build, export
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
    puffs = build_fur(acc, pal, face_d, ear_d)
    info = build_face(acc, pal)
    for s in (-1, 1): build_ear(acc, pal, s, puffs)
    zmin = min(float(v[:, 2].min()) for v in acc.V)          # stand exactly on the ground (the smooth union bulges a hair)
    acc.V = [v - np.array([0.0, 0.0, zmin]) for v in acc.V]
    ob = acc.to_object('body', mats)
    bad = ob.data.validate(verbose=False, clean_customdata=False)
    print('VALIDATE changed:', bad, flush=True)
    V, N, F = acc.arrays()
    stats = {'variant': key, 'total': acc.tris(), 'parts': acc.log, 'culled_buried': dict(CULL), 'face_classes': info['cls_counts'],
             'bbox_min': np.round(V.min(0), 4).tolist(), 'bbox_max': np.round(V.max(0), 4).tolist(),
             'size_WxDxH': np.round(V.max(0) - V.min(0), 4).tolist(),
             'nan_normals': int((~np.isfinite(N)).sum()), 'min_z': round(float(V[:, 2].min()), 4)}
    return ob, acc, stats

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_normals=True,
                              export_lights=False, export_cameras=False, export_animations=False, export_materials='EXPORT',
                              export_texcoords=False, export_tangents=False)

def main():
    only = arg('--variant')
    keys = [only] if only else ['blue', 'warm', 'base']   # base last: its scene is the one saved
    allstats = []
    for key in keys:
        ob, acc, st = build_variant(key)
        out = os.path.join(MODELS, VARIANTS[key]['file'] + '.glb')
        export(out); st['glb'] = out
        allstats.append(st)
        print('BUILT', json.dumps(st), flush=True)
        if key == 'base':
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'dust-bunny.blend'), compress=True)
    with open(os.path.join(TASK_DIR, 'build_stats.json' if not only else f'build_stats_{only}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=2)

main()
