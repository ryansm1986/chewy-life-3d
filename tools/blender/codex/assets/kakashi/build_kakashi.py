"""Kakashi (Momiji Hollow, enemy series EN-1) -- deterministic build, Option C "Ronin Scarecrow".

Blender 4.3:
  blender --background --factory-startup --python build_kakashi.py [-- --variant base|hoshigaki|oni|crow|all]

Builds every variant from an empty scene, saves kakashi.blend (the base) and exports
public/models/kakashi.glb, kakashi_hoshigaki.glb, kakashi_oni.glb and the flying crow kakashi_crow.glb.
Units: metres, front = -Y, ground z = 0, character left = +X.

Enemy contract (.claude/skills/codex-blender/templates/enemy-model-contract.md):
  rigid parts, no rig, no UVs, no textures; one face-corner colour attribute `Col`; one material `toon`.
  body  : origin (0, 0, 0)        everything but the crows (leg, foot, mino, kimono, sleeves, tufts, belt, scarf,
                                  sword, head + face, hat / horns + headband, persimmons)
  crowA : its feet on the right (-X) sleeve top     crowB : its feet on the hat crown (oni: the head top)
  crowC : (oni) its feet on the left (+X) sleeve top
  kakashi_crow.glb: body (origin = the crow's centre), wing_L (+X, origin at its shoulder), wing_R (-X, ditto)

Technique (the framework of the approved bamboo-grove enemies, build_kamaitachi.py)
- Head, torso, foot block, crows and persimmons are implicit surfaces (smooth unions of ellipsoids /
  superquadrics) sampled as star-shaped grids (rays from a centre, root-found onto the surface).
- Sleeves, tufts, leg, sword, cords, scarf tail, horns, wings are parametric sweeps (superellipse sections,
  rounded caps); the belt, scarf ring and headband are closed tubes; the hat and mino tiers are lathes.
- Colour borders are cut into the mesh as level-set contours of feature fields (patches, collar piping, sleeve
  mouths, the crow wings, the persimmon calyx) so every border runs along an edge loop; face features are open
  decal shells lying on the head (eyes, brows, nose, stitched smile, blush) so the ink hull never rings them.
- Faces buried more than 3.5 cm inside another shell of the same part are culled.
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/kakashi'
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
WANT = arg('--variant', 'all')
PI = math.pi

# =========================================================================================== palettes (sRGB hex)
COMMON = {
    'eye': '#22202e', 'iristop': '#262741', 'iris': '#30365c', 'eyewhite': '#fff6ea', 'catch': '#ffffff',
    'blush': '#f2909a', 'nose': '#2e2a3a', 'nosehi': '#5a5468', 'stitch': '#33282e',
    'head': '#e2c99a', 'head_sh': '#c9ab78', 'seam': '#b8945e',      # (round 2: warmer burlap)
    'wood': '#8a5a3a', 'foot': '#74492f', 'hilt': '#5e3c2a', 'rope': '#8a5a3a',
    'straw': '#e8c060', 'strawdk': '#c89a40', 'strawlt': '#f0cc72',
    'hatband': '#d84a3a', 'scarf': '#f08a3a', 'piping': '#e8c060',
    'crow': '#2e3048', 'crowhi': '#454a78', 'beak': '#f0a040', 'crowfoot': '#e8963a',
    'persim': '#f07a2a', 'calyx': '#3a5a2c', 'cord': '#e8d8b0',
    'horn': '#fff4d8', 'band': '#fff6ea', 'bandred': '#d84a3a',
}
VARIANTS = {
    'base':      dict(kimono='#3c4c90', patch='#f08a3a', hat=True, crows=2),
    'hoshigaki': dict(kimono='#3f8058', patch='#f4e2b0', hat=True, crows=2, persimmons=True),
    'oni':       dict(kimono='#5a3470', patch='#e8503a', hat=False, crows=3, head='#ff8a66', head_sh='#e2694a', seam='#d0573c', blush='#f2686a',
                      horns=True, headband=True),
}

def srgb_lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def mulhex(h, t):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) * t
    return '#' + ''.join(f'{int(round(min(255, x))):02x}' for x in c)

# =========================================================================================== math
def nrm(v):
    v = np.asarray(v, float); return v / np.linalg.norm(v)
def L(q): return np.sqrt(np.einsum('...i,...i->...', q, q))
def clamp01(x): return np.clip(x, 0, 1)
def smin(a, b, k):
    h = clamp01(.5 + .5 * (b - a) / k); return b * (1 - h) + a * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)
def spow(x, p): return np.sign(x) * np.abs(x) ** p
def rot(axis, ang):
    axis = nrm(axis); x, y, z = axis; c, s = math.cos(ang), math.sin(ang); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])

def sd_ell(p, c, r, R=None):
    """ellipsoid (iq's bound; exact sign). R: 3x3, columns = the local axes in world."""
    d = p - np.asarray(c, float)
    if R is not None: d = d @ R
    r = np.asarray(r, float)
    k0 = L(d / r); k1 = L(d / (r * r))
    return np.where(k1 < 1e-7, -r.min(), k0 * (k0 - 1) / np.maximum(k1, 1e-9))
def sd_sph(p, c, r): return L(p - np.asarray(c, float)) - r

def grad(f, P, h=1e-4):
    e = np.eye(3) * h
    return np.stack([f(P + e[i]) - f(P - e[i]) for i in range(3)], -1) / (2 * h)
def project(sdf, P, iters=3):
    P = np.array(P, float)
    for _ in range(iters):
        g = grad(sdf, P); P = P - (sdf(P) / np.maximum(np.einsum('ij,ij->i', g, g), 1e-12))[:, None] * g
    return P
def unit_normals(sdf, P):
    g = grad(sdf, P); return g / np.maximum(L(g), 1e-12)[:, None]

def ray_exit(sdf, O, D, tmax, K=120, iters=32):
    """first inside->outside crossing of sdf along O + t*D, t in (0, tmax]. O: (N,3) or (3,), D: (N,3)"""
    D = np.asarray(D, float); N = len(D); O = np.broadcast_to(np.asarray(O, float), D.shape)
    ts = np.linspace(0, tmax, K)
    assert (sdf(O) < 0).all(), 'ray_exit: origin outside the surface'
    lo = np.zeros(N); hi = np.full(N, tmax); found = np.zeros(N, bool)
    for k in range(1, K):
        v = sdf(O + D * ts[k]); newly = (~found) & (v >= 0)
        lo[newly] = ts[k - 1]; hi[newly] = ts[k]; found |= newly
        if found.all(): break
    assert found.all(), 'ray_exit: ray without exit'
    for _ in range(iters):
        mid = .5 * (lo + hi); inside = sdf(O + D * mid[:, None]) < 0
        lo = np.where(inside, mid, lo); hi = np.where(inside, hi, mid)
    return O + D * (.5 * (lo + hi))[:, None]

def hit_front(sdf, x, z, y0=-1.5):
    """first surface point met by a ray travelling +Y at (x, z)"""
    D = np.array([[0, 1., 0]]); O = np.array([[x, y0, z]])
    ts = np.linspace(0, 3, 3000); v = sdf(O + D * ts[:, None])
    k = int(np.argmax(v < 0)); lo, hi = ts[k - 1], ts[k]
    for _ in range(40):
        m = .5 * (lo + hi)
        if sdf(O + D * m)[0] < 0: hi = m
        else: lo = m
    return (O + D * lo)[0]

# 2D shape fields (negative inside; ~metres near the border)
def ell2(u, v, a, b):
    return (np.sqrt((u / a) ** 2 + (v / b) ** 2) - 1) * min(a, b)
def poly_dist(u, v, pts):
    """distance from (u, v) to a 2D polyline; also returns the arc parameter (0..1) of the closest point"""
    pts = np.asarray(pts, float); best = np.full(np.shape(u), 1e9); bt = np.zeros(np.shape(u))
    seg = L(pts[1:] - pts[:-1]); cum = np.concatenate([[0], np.cumsum(seg)]); tot = cum[-1]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ab = b - a
        t = clamp01(((u - a[0]) * ab[0] + (v - a[1]) * ab[1]) / max(ab @ ab, 1e-12))
        d = np.hypot(u - a[0] - t * ab[0], v - a[1] - t * ab[1])
        m = d < best; best = np.where(m, d, best); bt = np.where(m, (cum[i] + t * seg[i]) / tot, bt)
    return best, bt
def stroke(u, v, pts, r0, r1):
    """a brush stroke along a polyline, radius r0 at the ends -> r1 in the middle"""
    d, t = poly_dist(u, v, pts)
    return d - (r0 + (r1 - r0) * np.sin(np.pi * t) ** 0.7)

# =========================================================================================== mesh helpers
def rows_mesh(rows, closed=True):
    """rows: list of arrays, each (nseg, 3) ring or (1, 3) pole -> verts, faces (consistent winding)"""
    V = []; F = []; idx = []
    for r in rows:
        idx.append(list(range(len(V), len(V) + len(r)))); V.extend(list(r))
    for a, b in zip(idx[:-1], idx[1:]):
        if len(a) == 1:
            n = len(b); F += [(a[0], b[(j + 1) % n], b[j]) for j in range(n)]
        elif len(b) == 1:
            n = len(a); F += [(a[j], a[(j + 1) % n], b[0]) for j in range(n)]
        else:
            n = len(a); F += [(a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]) for j in range(n)]
    return np.array(V, float), F

def magnify(D, e, R, m):
    """pull grid directions toward the direction e inside the cone R (radians): density x 1/m^2 at e, smooth and
    monotone (f(x) = m x + 2(1-m) x^2 - (1-m) x^3: f(1) = 1, f'(1) = 1), no folds"""
    e = nrm(e); c = np.clip(D @ e, -1, 1); r = np.arccos(c); x = r / R
    inside = (x < 1) & (r > 1e-9)
    f = m * x + 2 * (1 - m) * x ** 2 - (1 - m) * x ** 3
    t = D - c[:, None] * e; t /= np.maximum(L(t), 1e-12)[:, None]
    r2 = np.where(inside, R * f, r)
    out = np.cos(r2)[:, None] * e + np.sin(r2)[:, None] * t
    return np.where(inside[:, None], out, D)

def star_rows(sdf, centre, axis, ref, thetas, nseg, tmax, phase=0.0, lenses=()):
    """star-shaped grid around 'axis' from 'centre': thetas (radians, from +axis) incl. 0 and pi = poles.
    lenses: (direction, cone, m) magnifiers that concentrate the grid (e.g. on the eyes)"""
    a = nrm(axis); r = nrm(np.asarray(ref, float) - np.dot(ref, a) * a); b = np.cross(a, r)
    rows = []
    for th in thetas:
        if th < 1e-6 or th > PI - 1e-6:
            D = np.array([a if th < 1 else -a])
        else:
            ph = 2 * PI * (np.arange(nseg) + phase) / nseg
            D = (math.cos(th) * a + math.sin(th) * (np.cos(ph)[:, None] * r + np.sin(ph)[:, None] * b))
        for e, cone, m in lenses: D = magnify(D, e, cone, m)
        rows.append(ray_exit(sdf, centre, D, tmax))
    return rows

def catmull(ctrl, n):
    """dense Catmull-Rom samples through ctrl points (centripetal-ish uniform), resampled by arc length to n"""
    P = np.asarray(ctrl, float); P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    pts = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, 40, endpoint=False):
            t2, t3 = t * t, t * t * t
            pts.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    pts.append(P[-2]); pts = np.array(pts)
    seg = L(pts[1:] - pts[:-1]); cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], n)
    out = np.stack([np.interp(s, cum, pts[:, k]) for k in range(3)], -1)
    return out, cum[-1]

def frames(C, side):
    """tangents + (N, B) frames along a polyline; B starts along 'side' and is parallel-transported"""
    T = np.gradient(C, axis=0); T /= L(T)[:, None]
    B0 = np.asarray(side, float); B0 = nrm(B0 - (B0 @ T[0]) * T[0])
    Bs = [B0]
    for i in range(1, len(C)):
        b = Bs[-1] - (Bs[-1] @ T[i]) * T[i]; Bs.append(nrm(b))
    B = np.array(Bs); N = np.cross(T, B)
    return T, N, B

def sweep(ctrl, nr, nseg, prof, side, expo=2.0, twist=None, caps=(True, True), cap_rings=3, phase=0.0, dense=None, rmod=None,
          capk=(1.0, 1.0)):
    """generalised tube. prof(s) -> (rn, rb) half-sizes along N and B. Returns V, F, attr (s, cos phi, sin phi)."""
    C, length = catmull(ctrl, dense or nr)
    if dense: C = C[np.round(np.linspace(0, dense - 1, nr)).astype(int)]
    T, N, B = frames(C, side)
    s = np.linspace(0, 1, nr)
    if twist is not None:
        for i in range(nr):
            R = rot(T[i], twist(s[i])); N[i] = R @ N[i]; B[i] = R @ B[i]
    ph = 2 * PI * (np.arange(nseg) + phase) / nseg; cph, sph = np.cos(ph), np.sin(ph)
    ex = 2.0 / expo; cu, su = spow(cph, ex), spow(sph, ex)
    rows, att = [], []
    def ring(c, n, b, rn, rb, sc=1.0, si=None):
        m = rmod(si, ph)[:, None] if (rmod is not None and si is not None) else 1.0
        return c + sc * m * (rn * cu[:, None] * n + rb * su[:, None] * b)
    def cap(i, sign):
        rn, rb = prof(s[i]); rc = min(rn, rb) * 0.95 * (capk[0] if sign < 0 else capk[1]); out_r, out_a = [], []
        al = np.linspace(0, PI / 2, cap_rings + 2)[1:-1]
        for a in al:
            out_r.append(ring(C[i] + sign * T[i] * rc * math.sin(a), N[i], B[i], rn, rb, math.cos(a), s[i]))
            out_a.append(np.stack([np.full(nseg, s[i] + sign * 0.02 * math.sin(a)), cph, sph], -1))
        out_r.append((C[i] + sign * T[i] * rc)[None]); out_a.append(np.array([[s[i] + sign * 0.02, 1.0, 0.0]]))
        return out_r, out_a
    if caps[0]:
        r_, a_ = cap(0, -1); rows += r_[::-1]; att += a_[::-1]
    for i in range(nr):
        rn, rb = prof(s[i]); rows.append(ring(C[i], N[i], B[i], rn, rb, 1.0, s[i])); att.append(np.stack([np.full(nseg, s[i]), cph, sph], -1))
    if caps[1]:
        r_, a_ = cap(nr - 1, +1); rows += r_; att += a_
    V, F = rows_mesh(rows)
    A = np.concatenate(att, 0)
    return V, F, A, dict(C=C, T=T, N=N, B=B, length=length)

# =========================================================================================== cutting
class Piece:
    """one closed shell: verts, faces, per-vertex attributes (x, y, z, extra...), optional sdf (projection +
    normals), feature fields (functions of the attribute array, negative inside), refine fields, paint()"""
    def __init__(self, name, V, F, A=None, sdf=None, fields=None, refine=(), paint=None, part='body', nsdf=None,
                 orient=None, occluder=None):
        self.name, self.part, self.sdf, self.nsdf, self.orient = name, part, sdf, nsdf, orient
        self.occluder = (orient is None) if occluder is None else occluder   # (decals never hide anything)
        self.V = np.asarray(V, float); self.F = F
        self.A = np.hstack([self.V, A]) if A is not None else self.V.copy()
        self.fields = fields or {}; self.refine = list(refine); self.paint = paint

def to_bm(V, F, A):
    """bmesh with the extra attributes (beyond xyz) in float vertex layers 'a0'.. (interpolated by splits)"""
    bm = bmesh.new(); nx = A.shape[1] - 3
    lay = [bm.verts.layers.float.new(f'a{i}') for i in range(nx)]
    bm.verts.layers.int.new('lock'); bm.verts.layers.int.new('zero')
    vs = []
    for i, v in enumerate(V):
        bv = bm.verts.new(Vector(v))
        for j, l in enumerate(lay): bv[l] = float(A[i, 3 + j])
        vs.append(bv)
    for f in F:
        try: bm.faces.new([vs[i] for i in f])
        except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    return bm, lay

def get_A(bm, lay, verts=None):
    verts = list(bm.verts) if verts is None else verts
    P = np.array([v.co for v in verts], float).reshape(-1, 3)
    if not lay: return P
    X = np.array([[v[l] for l in lay] for v in verts], float).reshape(-1, len(lay))
    return np.hstack([P, X])

def fgrad(fn, A):
    """gradient of a field wrt position (the extra attributes held fixed)"""
    if A.shape[1] == 3: return grad(fn, A)
    ex = A[:, 3:]; return grad(lambda q: fn(np.hstack([q, ex])), A[:, :3])

def piece_refine(bm, lay, pc, fns, band, maxlen):
    """1->4 split the triangles near the contours of fns (distance < band) whose edges are longer than maxlen"""
    E = [e for e in bm.edges if e.calc_length() > maxlen]
    if not E: return
    Aa = get_A(bm, lay, [e.verts[0] for e in E]); Ab = get_A(bm, lay, [e.verts[1] for e in E])
    near = np.zeros(len(E), bool)
    for fn in fns:
        for A in (Aa, Ab, .5 * (Aa + Ab)):
            near |= np.abs(fn(A)) / np.maximum(L(fgrad(fn, A)), 1e-6) < band
    sel = [e for e, m in zip(E, near) if m]
    if not sel: return
    res = bmesh.ops.subdivide_edges(bm, edges=sel, cuts=1, use_grid_fill=True)
    new = [g for g in res['geom_inner'] + res['geom_split'] if isinstance(g, bmesh.types.BMVert)]
    new = list({id(v): v for v in new}.values())
    if pc.sdf is not None and new:
        P = project(pc.sdf, np.array([v.co for v in new]))
        for v, p in zip(new, P): v.co = Vector(p)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')

def piece_cut(bm, lay, pc, fn, snap=0.5):
    """split the mesh along fn's zero contour"""
    LK = bm.verts.layers.int['lock']; ZR = bm.verts.layers.int['zero']
    bm.verts.index_update(); verts = list(bm.verts)
    for v in verts: v[ZR] = 0
    A = get_A(bm, lay, verts); F = fn(A)
    # snap vertices close to the contour onto it (sdf pieces only) -> no slivers
    if pc.sdf is not None and snap:
        h = np.array([min(e.calc_length() for e in v.link_edges) if v.link_edges else 1 for v in verts])
        d = np.abs(F) / np.maximum(L(fgrad(fn, A)), 1e-9)
        cand = [i for i in np.nonzero((d < snap * h) & (F != 0))[0] if not verts[i][LK]]
        if cand:
            P = A[cand, :3].copy(); ex = A[cand, 3:]
            ff = (lambda q: fn(np.hstack([q, ex]))) if A.shape[1] > 3 else fn
            for _ in range(4):
                n = unit_normals(pc.sdf, P); g = grad(ff, P); g = g - np.einsum('ij,ij->i', g, n)[:, None] * n
                P = P - (ff(P) / np.maximum(np.einsum('ij,ij->i', g, g), 1e-12))[:, None] * g
                P = project(pc.sdf, P, 2)
            ok = np.abs(ff(P)) < 1e-4
            for k, i in enumerate(cand):
                if ok[k] and np.linalg.norm(P[k] - A[i, :3]) < 0.65 * h[i]:
                    v = verts[i]; v.co = Vector(P[k]); F[i] = 0.0; v[ZR] = 1; v[LK] = 1
    sgn = {v: (0 if F[i] == 0 else (1 if F[i] > 0 else -1)) for i, v in enumerate(verts)}
    Fv = {v: F[i] for i, v in enumerate(verts)}
    # split crossing edges at the root
    cross = [e for e in bm.edges if sgn[e.verts[0]] * sgn[e.verts[1]] < 0]
    newv = []
    for e in cross:
        a, b = e.verts; fa, fb = Fv[a], Fv[b]
        Aa, Ab = get_A(bm, lay, [a])[0], get_A(bm, lay, [b])[0]
        lo, hi, flo, fhi = 0.0, 1.0, fa, fb
        t = fa / (fa - fb)
        for _ in range(4):  # regula falsi on the true field along the edge
            ft = fn((Aa + (Ab - Aa) * t)[None])[0]
            if ft == 0: break
            if (ft < 0) == (flo < 0): lo, flo = t, ft
            else: hi, fhi = t, ft
            t = lo + (hi - lo) * flo / (flo - fhi)
        ne, nv = bmesh.utils.edge_split(e, a, t)
        At = Aa + (Ab - Aa) * t
        nv.co = Vector(At[:3])
        for j, l in enumerate(lay): nv[l] = float(At[3 + j])
        nv[ZR] = 1; nv[LK] = 1; sgn[nv] = 0; newv.append(nv)
    if pc.sdf is not None and newv:
        P = project(pc.sdf, np.array([v.co for v in newv]))
        for v, p in zip(newv, P): v.co = Vector(p)
    # connect the two contour vertices of every face that changes sign
    for f in list(bm.faces):
        loop = list(f.verts); s = [sgn[v] for v in loop]
        z = [i for i, x in enumerate(s) if x == 0]
        if len(z) != 2 or not (1 in s and -1 in s): continue
        i, j = z; n = len(loop)
        if (j - i) % n in (1, n - 1): continue
        try: bmesh.ops.connect_verts(bm, verts=[loop[i], loop[j]])
        except Exception: pass
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')

def process(pc):
    bm, lay = to_bm(pc.V, pc.F, pc.A)
    for fns, band, maxlen in pc.refine:
        piece_refine(bm, lay, pc, [pc.fields[k] for k in fns], band, maxlen)
    for k, fn in pc.fields.items():
        piece_cut(bm, lay, pc, fn)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if pc.orient is not None:   # open decals: face along the host surface's outward normal
        bm.normal_update(); fl = list(bm.faces)
        C = np.array([f.calc_center_median() for f in fl]); Nf = np.array([f.normal for f in fl])
        bad = np.einsum('ij,ij->i', Nf, pc.orient(C)) < 0
        if bad.any(): bmesh.ops.reverse_faces(bm, faces=[f for f, m in zip(fl, bad) if m])
    bm.verts.index_update(); bm.normal_update()
    verts = list(bm.verts)
    A = get_A(bm, lay, verts); P = A[:, :3]
    if pc.sdf is not None: Nv = unit_normals(pc.sdf, P)
    elif pc.nsdf is not None: Nv = unit_normals(pc.nsdf, P)
    else: Nv = np.array([v.normal for v in verts])
    tris = np.array([[v.index for v in f.verts] for f in bm.faces])
    bm.free()
    # classify faces per field: mean of the vertex values (contour verts are ~0); centroid when undecided
    inside = {}
    Ac = A[tris].mean(1)
    for k, fn in pc.fields.items():
        Fv = fn(A); m = Fv[tris]; mean = m.mean(1)
        und = np.abs(m).max(1) < 2e-5
        if und.any(): mean[und] = fn(Ac[und])
        inside[k] = mean < 0
    keys = pc.paint(inside, Ac) if pc.paint else np.array(['fur'] * len(tris))
    ao = pc.ao(A) if getattr(pc, 'ao', None) is not None else np.ones(len(P))
    inside = getattr(pc, 'inside', None)
    if inside is None and pc.occluder:
        f = pc.sdf if pc.sdf is not None else (pc.nsdf if pc.orient is None else None)
        if f is not None: inside = (lambda f_: (lambda Q: -f_(Q)))(f)
    return dict(P=P, N=Nv, T=tris, keys=np.asarray(keys), part=pc.part, name=pc.name, occ=pc.occluder, ao=ao, inside=inside)


# =========================================================================================== extra mesh helpers
def lathe(prof, nseg, phase=0.0):
    """prof: list of (r, h) (r == 0 -> a pole). Returns V, F, A (A = profile row index, phi)"""
    ph = 2 * PI * (np.arange(nseg) + phase) / nseg
    rows, att = [], []
    for i, (r, h) in enumerate(prof):
        if r < 1e-9:
            rows.append(np.array([[0.0, 0.0, h]])); att.append(np.array([[float(i), 0.0]]))
        else:
            rows.append(np.stack([r * np.cos(ph), r * np.sin(ph), np.full(nseg, h)], -1))
            att.append(np.stack([np.full(nseg, float(i)), ph], -1))
    V, F = rows_mesh(rows)
    return V, F, np.concatenate(att)

def loop_tube(C, nseg, prof, frame=None, expo=2.0):
    """closed tube along the closed polyline C (n, 3). prof(i) -> (rn, rb) half-sizes along N (out) and B (up).
    frame(i, T) -> (N, B) overrides the default (B = world up made normal to T)."""
    n = len(C); T = np.roll(C, -1, 0) - np.roll(C, 1, 0); T /= L(T)[:, None]
    ph = 2 * PI * np.arange(nseg) / nseg; ex = 2.0 / expo; cu, su = spow(np.cos(ph), ex), spow(np.sin(ph), ex)
    rows, att = [], []
    for i in range(n):
        if frame is not None: N, B = frame(i, T[i])
        else:
            up = np.array([0, 0, 1.0]); B = nrm(up - (up @ T[i]) * T[i]); N = np.cross(T[i], B)
        rn, rb = prof(i)
        rows.append(C[i] + rn * cu[:, None] * N + rb * su[:, None] * B)
        att.append(np.stack([np.full(nseg, i / n), np.cos(ph), np.sin(ph)], -1))
    V = np.concatenate(rows); F = []
    for i in range(n):
        a = i * nseg; b = ((i + 1) % n) * nseg
        F += [(a + j, a + (j + 1) % nseg, b + (j + 1) % nseg, b + j) for j in range(nseg)]
    return V, F, np.concatenate(att)

def rrect(u, v, hu, hv, r):
    qu = np.abs(u) - (hu - r); qv = np.abs(v) - (hv - r)
    return np.hypot(np.maximum(qu, 0), np.maximum(qv, 0)) + np.minimum(np.maximum(qu, qv), 0) - r

def seg_orient(a, b):
    """outward direction for open sweeps: away from the segment a-b"""
    a = np.asarray(a, float); b = np.asarray(b, float); ab = b - a
    def f(C):
        t = np.clip(((C - a) @ ab) / (ab @ ab), 0, 1); return C - (a + t[:, None] * ab)
    return f
def point_orient(c):
    c = np.asarray(c, float); return lambda C: C - c

def keyed(key):
    return lambda ins, Ac: np.full(len(Ac), key, dtype=object)

def superq(p, c, r, n=3.0, m=3.0):
    """superquadric implicit (not a distance, but smooth and signed): exponent n in xy, m in z"""
    d = np.abs(p - np.asarray(c, float)) / np.asarray(r, float)
    q = (d[..., 0] ** n + d[..., 1] ** n) ** (m / n) + d[..., 2] ** m
    return (q ** (1.0 / m) - 1.0) * min(r)

# =========================================================================================== the design: head
HC = np.array([0.0, -0.05, 1.30])           # skull centre: the head is 0.75 m wide (the sheet), 1.025 .. 1.565 m
def head_base(p):
    d = sd_ell(p, HC, (0.368, 0.285, 0.265))
    d = smin(d, sd_ell(p, (0.0, -0.085, 1.19), (0.36, 0.245, 0.165)), 0.08)   # the soft, wider lower bun
    return d

EYE_X, EYE_Z = 0.170, 1.266
EX, EY = 0.074, 0.082                       # eye opening half-sizes (the sheet: 0.15 x 0.165 m)
SC = EX / 0.047                             # (scale of the toy-line eye recipe, made for a 0.047 eye)
EYES = {}
for _k in (-1, 1):
    _pe = hit_front(head_base, _k * EYE_X, EYE_Z)
    _n = unit_normals(head_base, _pe[None])[0]
    _A = nrm(_n * 0.85 + np.array([0, -1, 0]) * 0.15)
    _U = nrm(np.cross([0, 0, 1], _A)); _V = np.cross(_A, _U)
    EYES[_k] = (_pe, _A, _U, _V)

def head_sdf(p):
    d = head_base(p)
    for k in (-1, 1):
        pe, A_, U_, V_ = EYES[k]
        R = np.stack([U_, V_, A_], 1)
        d = smin(d, sd_ell(p, pe - A_ * 0.020, (EX * 1.03, EY * 1.03, 0.027), R), 0.014)   # domed eye lens
    return d

IRIS = dict(du=0.009, dv=-0.002, ru=0.067, rv=0.081)   # both irises glance a touch to +X (the sheet's front view)
def iris_c(k): return IRIS['du'], IRIS['dv']
def eye_dark2(u, v, k):
    uo = k * u
    rim = ell2(u, v, EX + 0.0055, EY + 0.0055)
    lash = np.maximum(ell2(u, v - 0.0085 * SC, EX + 0.0068 * SC, EY + 0.0135 * SC), -(v + 0.012 * SC))
    flick = stroke(uo, v, [(EX - 0.002 * SC, 0.024 * SC), (EX + 0.011 * SC, 0.033 * SC), (EX + 0.020 * SC, 0.044 * SC)],
                   0.0052 * SC, 0.0080 * SC)
    return smin(smin(rim, lash, 0.004), flick, 0.004)
def eye_open2(u, v, k): return ell2(u, v, EX, EY)
def eye_iris2(u, v, k):
    cu, cv = iris_c(k); return ell2(u - cu, v - cv, IRIS['ru'], IRIS['rv'])
def exit2(f, c, ang, k, tmax=0.2):
    d = np.stack([np.cos(ang), np.sin(ang)], -1); lo = np.zeros(len(ang)); hi = np.full(len(ang), tmax)
    assert (f(c[0] + d[:, 0] * tmax, c[1] + d[:, 1] * tmax, k) > 0).all()
    for _ in range(40):
        m = .5 * (lo + hi); ins = f(c[0] + d[:, 0] * m, c[1] + d[:, 1] * m, k) < 0
        lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return .5 * (lo + hi)

def on_head(pe, A_, U_, V_, u, v, off):
    P = pe + u[:, None] * U_ + v[:, None] * V_
    P = project(head_sdf, P, 4); n = unit_normals(head_sdf, P)
    return P + n * off
def head_up(P): return unit_normals(head_sdf, P[:, :3])
SKIRT = (0.0045, -0.0022)
PUPIL_R = 0.027
def skin_key(P): return np.full(len(P), 'head', dtype=object)

def build_eye(k):
    pe, A_, U_, V_ = EYES[k]; cu, cv = iris_c(k); c2 = np.array([cu, cv])
    nseg = 12; ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    r_dark = exit2(eye_dark2, c2, ang, k); r_open = np.minimum(exit2(eye_open2, c2, ang, k), r_dark - 0.004)
    r_iris_true = exit2(eye_iris2, c2, ang, k)
    white = r_open - r_iris_true > 0.003
    r_iris = np.where(white, r_iris_true, r_open - 0.0015)
    rows, att = [], []
    def row(rad, off, band, w):
        u = c2[0] + rad * np.cos(ang); v = c2[1] + rad * np.sin(ang)
        rows.append(on_head(pe, A_, U_, V_, u, v, off))
        att.append(np.stack([np.full(nseg, band), np.asarray(w, float) * np.ones(nseg), u, v], -1))
    rows.append(on_head(pe, A_, U_, V_, np.array([c2[0]]), np.array([c2[1]]), 0.0016)); att.append(np.array([[0.0, 0.0, c2[0], c2[1]]]))
    row(np.full(nseg, PUPIL_R), 0.0016, 0.5, 0)
    row(r_iris, 0.0016, 2, white)
    row(r_open, 0.0016, 3, white)
    row(r_dark, 0.0016, 4, 0)
    row(r_dark + SKIRT[0], SKIRT[1], 5, 0)
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def f_low(P):
        u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (-0.046 + 1.8 * u * u)
    def f_cl(P):
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu - 0.022, v - cv - 0.030) - 0.021
    def f_cs(P):
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu + 0.025, v - cv + 0.034) - 0.0095
    def paint(ins, Ac):
        b, w = Ac[:, 3], Ac[:, 4]
        o = np.full(len(Ac), 'eye', dtype=object)
        o[(b > 2) & (b < 3) & (w > 0.999)] = 'eyewhite'
        iris = (b > 0.5) & (b < 2.0001)
        o[iris] = 'iristop'; o[iris & ins['low']] = 'iris'
        o[(b < 2.0001) & (ins['cl'] | ins['cs'])] = 'catch'
        sk = b > 4.0001; o[sk] = skin_key(Ac[sk, :3])
        return o
    return Piece(f'eye{k}', V, F, A=A, fields={'low': f_low, 'cl': f_cl, 'cs': f_cs}, paint=paint,
                 nsdf=head_sdf, orient=head_up)

def decal_strip(C, width, H, nrows, key, name, relief=True, ncol=7):
    """a brush-stroke decal along the 3D surface curve C: half-width width(s), a soft ridge H high, rounded ends"""
    Cd, _ = catmull(C, 80); Cd = project(head_sdf, Cd, 3)
    idx = np.round(np.linspace(0, len(Cd) - 1, nrows)).astype(int); Cr = Cd[idx]
    n = unit_normals(head_sdf, Cr); T = np.gradient(Cr, axis=0); T -= np.einsum('ij,ij->i', T, n)[:, None] * n
    T /= L(T)[:, None]; S = np.cross(n, T)
    sk = 1.0 + SKIRT[0] / 0.006
    cols = np.array([-sk, -1.0, -0.45, 0.0, 0.45, 1.0, sk] if ncol == 7 else [-sk, -1.0, 0.0, 1.0, sk])
    s = np.linspace(0, 1, nrows)
    rows, att = [], []
    for i in range(nrows):
        w = width(s[i]); P = Cr[i] + S[i] * (cols * w)[:, None]
        P = project(head_sdf, P, 3); nn = unit_normals(head_sdf, P)
        t = np.clip(np.abs(cols), 0, 1); h = np.where(np.abs(cols) > 1.0001, SKIRT[1], H * (1 - t * t) ** 2 + 0.0008)
        rows.append(P + nn * h[:, None]); att.append(np.stack([np.full(len(cols), s[i]), cols], -1))
    V = np.concatenate(rows); A = np.concatenate(att); nc = len(cols); F = []
    for i in range(nrows - 1):
        a, b = i * nc, (i + 1) * nc
        F += [(a + j, a + j + 1, b + j + 1, b + j) for j in range(nc - 1)]
    for end, sign in ((0, -1), (nrows - 1, 1)):
        tip = Cr[end] + sign * T[end] * (width(s[end]) + SKIRT[0])
        tip = project(head_sdf, tip[None], 3)[0]; tip = tip + unit_normals(head_sdf, tip[None])[0] * SKIRT[1]
        ti = len(V); V = np.vstack([V, tip]); A = np.vstack([A, [[s[end], 0.0]]])
        base = end * nc
        F += [(base + j, base + j + 1, ti) for j in range(nc - 1)]
    def paint(ins, Ac):
        o = np.full(len(Ac), key, dtype=object); skm = np.abs(Ac[:, 4]) > 1.0001
        o[skm] = skin_key(Ac[skm, :3]); return o
    return Piece(name, V, F, A=A, paint=paint, nsdf=None if relief else head_sdf, orient=head_up)

def surface_curve(k, pts2, off=0.0):
    pe, A_, U_, V_ = EYES[k]; p = np.asarray(pts2, float)
    return on_head(pe, A_, U_, V_, k * p[:, 0], p[:, 1], off)

def build_brow(k):
    """a short thick brow, the inner end a touch lower (cheeky-determined)"""
    C = surface_curve(k, [(-0.040, 0.106), (-0.014, 0.119), (0.013, 0.125), (0.038, 0.122)])
    return decal_strip(C, lambda s: 0.0085 + 0.0045 * math.sin(PI * s) ** 0.8, 0.0032, 5, 'eye', f'brow{k}', ncol=5)

NOSE_P = hit_front(head_base, 0.0, 1.205)
def build_nose():
    """a small dark rounded triangle (point down), a soft dome with a highlight"""
    n0 = unit_normals(head_sdf, NOSE_P[None])[0]; U_ = nrm(np.cross([0, 0, 1], n0)); V_ = np.cross(n0, U_)
    nseg = 9; ang = 2 * PI * np.arange(nseg) / nseg
    R = 0.036 * (1 + 0.15 * np.sin(3 * ang))
    rows, att = [NOSE_P[None] + n0 * 0.0125], [np.array([[0.0, 0, 0]])]
    for x in (0.5, 1.0, 1.0 + SKIRT[0] / 0.025):
        u = R * x * np.cos(ang); v = R * x * np.sin(ang) * 0.82 + 0.002
        P = project(head_sdf, NOSE_P + u[:, None] * U_ + v[:, None] * V_, 3); nn = unit_normals(head_sdf, P)
        h = SKIRT[1] if x > 1 else 0.0115 * (1 - x * x) ** 1.3 + 0.001
        rows.append(P + nn * h); att.append(np.stack([np.full(nseg, x), u, v], -1))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def f_hi(P): return ell2(P[:, 4] + 0.007, P[:, 5] - 0.009, 0.0075, 0.0048)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'nose', dtype=object); o[ins['hi']] = 'nosehi'
        skm = Ac[:, 3] > 1.0001; o[skm] = skin_key(Ac[skm, :3]); return o
    return Piece('nose', V, F, A=A, fields={'hi': f_hi}, paint=paint, orient=head_up)

MOUTH = [(-0.100, 1.164), (-0.050, 1.139), (0.0, 1.129), (0.050, 1.139), (0.100, 1.164)]
def build_mouth():
    """the stitched smile: one chunky line (1.5 cm) and five cross stitches (1.5 cm thick, 5 cm long)"""
    C = np.array([hit_front(head_base, x, z) for x, z in MOUTH])
    out = [decal_strip(C, lambda s: 0.0074 + 0.0008 * math.sin(PI * s), 0.0016, 9, 'stitch', 'mouth', relief=False, ncol=5)]
    Cd, _ = catmull(C, 81)
    for j, s in enumerate((0.06, 0.28, 0.5, 0.72, 0.94)):
        i = int(round(s * 80)); p = Cd[i]; t = Cd[min(i + 1, 80)] - Cd[max(i - 1, 0)]
        n = unit_normals(head_sdf, p[None])[0]; t = nrm(t - (t @ n) * n); q = np.cross(n, t)   # q: across the line
        lean = (s - 0.5) * 0.15                                  # (the end stitches lean a touch with the curve)
        q = nrm(q + t * lean)
        pts = np.array([p - q * 0.016, p, p + q * 0.016])
        out.append(decal_strip(pts, lambda s_: 0.0075, 0.0018, 3, 'stitch', f'stitch{j}', relief=False, ncol=5))
    return out

CHEEK = {}
for _k in (-1, 1):
    _pc = hit_front(head_base, _k * 0.24, 1.163)
    _n = unit_normals(head_base, _pc[None])[0]; _U = nrm(np.cross([0, 0, 1], _n)); _V = np.cross(_n, _U)
    CHEEK[_k] = (_pc, _n, _U, _V)
def build_blush(k):
    pc_, n0, U_, V_ = CHEEK[k]
    nseg = 8; ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [project(head_sdf, pc_[None], 3) + n0 * 0.0012], [np.array([[0.0]])]
    for x, h in ((1.0, 0.0012), (1.0 + SKIRT[0] / 0.03, SKIRT[1])):
        P = pc_ + (0.056 * x * np.cos(ang))[:, None] * U_ + (0.035 * x * np.sin(ang))[:, None] * V_
        P = project(head_sdf, P, 3); rows.append(P + unit_normals(head_sdf, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'blush', dtype=object); skm = Ac[:, 3] > 1.0001
        o[skm] = 'head'; return o
    return Piece(f'blush{k}', V, F, A=A, paint=paint, nsdf=head_sdf, orient=head_up)

def build_head():
    th = np.radians([0, 10, 20, 30, 41, 53, 66, 79, 92, 106, 122, 140, 160, 180])
    lenses = [(nrm(EYES[k][0] - np.array([0, -0.06, 1.28])), 0.30, 0.6) for k in (-1, 1)]
    rows = star_rows(head_sdf, np.array([0, -0.06, 1.28]), [0, -1, 0], [0, 0, 1], th, 24, 0.6, lenses=lenses)
    V, F = rows_mesh(rows)
    return Piece('head', V, F, sdf=head_sdf, paint=keyed('head'))

def build_seam(k):
    """one soft burlap seam running up the head's side from beside the chin (1.5 cm, clear of the blush)"""
    O = np.array([0.0, -0.07, 1.25]); E = np.radians([-62, -46, -28, -10, 8, 26])
    AZ = np.radians(50 + 7 * (E + np.radians(62)) / np.radians(88))
    D = np.stack([k * np.sin(AZ) * np.cos(E), -np.cos(AZ) * np.cos(E), np.sin(E)], -1)
    C = ray_exit(head_base, O, D, 0.7)
    return decal_strip(C, lambda s: 0.0062 + 0.0013 * math.sin(PI * s), 0.0010, 5, 'seam', f'seam{k}', relief=False, ncol=5)

def build_face():
    P = [build_eye(-1), build_eye(1), build_brow(-1), build_brow(1), build_nose(), build_blush(-1), build_blush(1)]
    return P + build_mouth() + [build_seam(-1), build_seam(1)]

# ----------------------------------------------------------------------- oni: horns and the headband
def build_horn(k):
    base = np.array([k * 0.20, -0.06, 1.45]); d = nrm([k * 0.55, 0.05, 1.0])
    tip = base + d * 0.17 + np.array([k * 0.012, 0, 0])
    V, F, A, _ = sweep([base, base + d * 0.09, tip], 3, 8, lambda s: (0.048 - 0.02 * s, 0.048 - 0.02 * s), [0, 1, 0],
                       caps=(False, True), cap_rings=2)
    return Piece(f'horn{k}', V, F, A=A, paint=keyed('horn'), orient=seg_orient(base, tip), occluder=False)

def build_headband():
    zb = 1.47; n = 17; ph = 2 * PI * np.arange(n) / n - PI / 2        # starts at the front (-Y)
    O = np.array([0, -0.05, zb]); D = np.stack([np.cos(ph), np.sin(ph), np.zeros(n)], -1)
    S = ray_exit(head_base, O, D, 0.6); Nn = unit_normals(head_base, S)
    C = S + Nn * 0.008
    def frame(i, T):
        N = Nn[i]; B = nrm(np.cross(N, T)) if np.cross(N, T)[2] > 0 else -nrm(np.cross(N, T))
        return N, B
    V, F, A = loop_tube(C, 5, lambda i: (0.016, 0.034), frame=frame, expo=3.0)
    def paint(ins, Ac):
        a = (Ac[:, 3] * n) % n; front = np.minimum(a, n - a) < 2.6
        o = np.full(len(Ac), 'band', dtype=object); o[front] = 'bandred'; return o
    return Piece('headband', V, F, A=A, paint=paint)

# =========================================================================================== hat (sugegasa)
# a shallow sugegasa (round 2): 1.10 m across, 0.20 m tall with a softly rounded crown, a thin shell whose hollow
# underside takes the head's crown (the head sits 1.2 cm into the shell: no gap from any angle)
HAT_TOP = [(0.0, 0.200), (0.08, 0.192), (0.16, 0.167), (0.20, 0.150), (0.30, 0.110), (0.40, 0.074), (0.49, 0.048),
           (0.535, 0.034)]                                    # rows 3..4: the red band; the outer brim a touch flatter
HAT_RIM = [(0.552, 0.018), (0.543, 0.001)]
HAT_UNDER = [(0.50, 0.006), (0.36, 0.048), (0.18, 0.118), (0.0, 0.170)]
HAT_PROF = HAT_TOP + HAT_RIM + HAT_UNDER
HAT_TILT, HAT_ROLL = -0.262, -0.08           # pushed back 15 deg, the +X side up ~5 deg
HAT_XY = np.array([0.0, 0.12])               # seated 12 cm back on the head: check_hat.py ray-tests that both eyes stay fully
                                             # visible from the 45-degree cameras (front, front-left, front-right)
def hat_R():
    cx, sx = math.cos(HAT_TILT), math.sin(HAT_TILT); cy, sy = math.cos(HAT_ROLL), math.sin(HAT_ROLL)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    return Ry @ Rx
def _interp_prof(pts, r):
    pts = sorted(pts); rs = np.array([p[0] for p in pts]); hs = np.array([p[1] for p in pts])
    return np.interp(r, rs, hs)
def hat_origin():
    """seat the hat: the head's crown tucked 1.2 cm into the shell's underside, nothing poking through the top"""
    R = hat_R()
    th = np.radians(np.linspace(0, 80, 18)); ph = np.linspace(0, 2 * PI, 48, endpoint=False)
    D = np.array([[math.sin(t) * math.cos(p), math.sin(t) * math.sin(p), math.cos(t)] for t in th for p in ph])
    S = ray_exit(head_base, HC, D, 0.6)
    under = HAT_RIM[1:] + HAT_UNDER; top = HAT_TOP
    def worst(z0):
        o = np.array([HAT_XY[0], HAT_XY[1], z0]); q = (S - o) @ R      # into hat-local
        r = np.hypot(q[:, 0], q[:, 1]); m = r < 0.5
        return (q[m, 2] - _interp_prof(under, r[m])).max(), (q[m, 2] - _interp_prof(top, r[m])).max()
    lo, hi = 1.0, 1.8
    for _ in range(40):
        mid = .5 * (lo + hi); w, _t = worst(mid)
        if w > 0.012: lo = mid
        else: hi = mid
    w, t = worst(hi)
    print('KAKASHI hat seat z0 %.4f  head into hat solid %.3f  margin to the hat top %.3f' % (hi, w, -t))
    return np.array([HAT_XY[0], HAT_XY[1], hi])
def build_hat():
    V, F, A = lathe(HAT_PROF, 22)
    R = hat_R(); o = hat_origin(); V = V @ R.T + o
    def paint(ins, Ac):
        i = Ac[:, 3]; o_ = np.full(len(Ac), 'straw', dtype=object)
        o_[(i > 3) & (i < 4)] = 'hatband'; o_[i > 9.0] = 'strawdk'
        return o_
    apex = R @ np.array([0, 0, HAT_PROF[0][1]]) + o
    return Piece('hat', V, F, A=A, paint=paint), apex

# =========================================================================================== kimono
def torso_f(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    # the front +X panel hangs a little lower (the overlapped kimono front)
    drop = 0.065 * np.clip((x + 0.02) / 0.25, 0, 1) * np.clip((-y - 0.04) / 0.12, 0, 1)
    zb = 0.47 - drop; zt = 1.055; zc = .5 * (zt + zb); c = .5 * (zt - zb)
    t = np.clip((z - 0.5) / 0.55, 0, 1)
    a = 0.372 - 0.08 * t; b = 0.248 - 0.048 * t
    dx = np.abs(x) / a; dy = np.abs(y + 0.0) / b; dz = np.abs(z - zc) / c
    q = (dx ** 2.6 + dy ** 2.6) ** (4.0 / 2.6) + dz ** 4.0          # (boxy kimono: full width down to the hem)
    return (q ** (1 / 4.0) - 1.0) * 0.24

PIPE = [(-0.012, 1.02), (-0.075, 0.86), (-0.15, 0.68), (-0.205, 0.535)]     # (all on the torso: checked in build_piping)
def patch_field(cx, cz, hu, hv, ang, r=0.024, ymax=-0.03):
    ca, sa = math.cos(ang), math.sin(ang)
    def f(P):
        x = P[:, 0] - cx; z = P[:, 2] - cz
        u = ca * x + sa * z; v = -sa * x + ca * z
        return np.maximum(rrect(u, v, hu, hv, r), P[:, 1] - ymax)
    return f

def build_torso():
    th = np.radians([0, 18, 36, 54, 70, 86, 102, 120, 145, 180])
    rows = star_rows(torso_f, np.array([0, 0, 0.76]), [0, 0, 1], [0, -1, 0], th, 18, 0.8)
    V, F = rows_mesh(rows)
    fields = {'patch': patch_field(0.19, 0.592, 0.075, 0.07, -0.12)}
    def paint(ins, Ac):
        o = np.full(len(Ac), 'kimono', dtype=object)
        o[ins['patch']] = 'patch'; return o
    return Piece('torso', V, F, sdf=torso_f, fields=fields, paint=paint,
                 )

def build_piping():
    """the yellow collar piping down the overlapping front: a thin cord half sunk into the kimono"""
    C = np.array([hit_front(torso_f, x, z) for x, z in PIPE])
    assert (C[:, 1] > -0.4).all(), 'piping point off the torso'
    n = unit_normals(torso_f, C); C = C + n * 0.004
    V, F, A, _ = sweep(list(C), 6, 5, lambda s: (0.0135, 0.0135), [0, -1, 0], caps=(True, True), cap_rings=1)
    return Piece('piping', V, F, A=A, paint=keyed('piping'))

SLV_ROOT, SLV_END = 0.14, 0.595
def sleeve_geom(k):
    ctrl = [np.array([k * SLV_ROOT, 0.0, 0.925]), np.array([k * (SLV_ROOT + SLV_END) / 2, 0.0, 0.90]),
            np.array([k * SLV_END, 0.0, 0.875])]
    prof = lambda s: (0.112 + 0.032 * s, 0.096 + 0.07 * s)
    return ctrl, prof
def sleeve_top(k, x):
    s = (abs(x) - SLV_ROOT) / (SLV_END - SLV_ROOT)
    return 0.925 - 0.05 * s + 0.096 + 0.07 * s
def build_sleeve(k):
    ctrl, prof = sleeve_geom(k)
    V, F, A, info = sweep(ctrl, 4, 12, prof, [0, 0, 1], expo=3.2, caps=(False, True), cap_rings=2, capk=(0.6, 0.38))
    C = info['C'][-1]; rn, rb = prof(1.0)
    def f_mouth(P):
        return np.maximum(ell2(P[:, 1] - C[1], P[:, 2] - C[2] + 0.004, rn * 0.66, rb * 0.72), (abs(C[0]) - 0.012) - k * P[:, 0])
    fields = {'mouth': f_mouth}
    if k < 0: fields['patch'] = patch_field(-0.47, 0.82, 0.08, 0.085, 0.10, ymax=-0.06)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'kimono', dtype=object); o[ins['mouth']] = 'kimonodk'
        if 'patch' in ins: o[ins['patch']] = 'patch'
        return o
    def inside(P):
        x = k * P[:, 0]; s_ = (x - SLV_ROOT) / (SLV_END - SLV_ROOT); zc = 0.925 - 0.05 * s_
        rn_, rb_ = prof(np.clip(s_, 0, 1))
        q = ((np.abs(P[:, 1]) / rn_) ** 3.2 + (np.abs(P[:, 2] - zc) / rb_) ** 3.2) ** (1 / 3.2)
        return np.minimum.reduce([(1 - q) * np.minimum(rn_, rb_), x - SLV_ROOT, SLV_END - x])
    pc = Piece(f'sleeve{k}', V, F, A=A, fields=fields, paint=paint, orient=seg_orient(ctrl[0], ctrl[-1]), occluder=False,
                 )
    pc.inside = inside
    return pc

def build_tufts(k):
    """the straw bursting out of the sleeve end: four chunky rounded fingers fanned in the arm's vertical plane"""
    base = np.array([k * 0.555, 0.0, 0.874])
    out = []
    for j, (a, ln, dy) in enumerate(((-0.56, 0.132, 0.040), (-0.19, 0.172, -0.034), (0.17, 0.170, 0.034), (0.53, 0.132, -0.039))):   # (round 2: +15 %)
        d = np.array([k * math.cos(a), 0.0, math.sin(a)])
        p0 = base + np.array([0, dy * 0.4, 0]); p2 = base + d * (0.08 + ln) + np.array([0, dy, 0])
        p1 = .5 * (p0 + p2) + np.array([0, 0, 0.012])
        V, F, A, _ = sweep([p0, p1, p2], 3, 6, lambda s: (0.064 - 0.0115 * s, 0.064 - 0.0115 * s), [0, 1, 0],
                           caps=(False, True), cap_rings=1)
        def ao(Ax): return 0.84 + 0.16 * np.clip(Ax[:, 3] / 0.6, 0, 1)
        pc = Piece(f'tuft{k}{j}', V, F, A=A, paint=keyed('straw' if j % 2 == 0 else 'strawlt'), orient=seg_orient(p0, p2), occluder=False)
        pc.ao = ao; out.append(pc)
    return out

def build_belt():
    n = 16; ph = 2 * PI * np.arange(n) / n
    O = np.array([0, 0, 0.735]); D = np.stack([np.cos(ph), np.sin(ph), np.zeros(n)], -1)
    S = ray_exit(torso_f, O, D, 0.8); Nn = unit_normals(torso_f, S)
    C = S + Nn * 0.012
    V, F, A = loop_tube(C, 5, lambda i: (0.026, 0.026))
    return Piece('belt', V, F, A=A, paint=keyed('rope'))

def torso_front(x, z):
    return hit_front(torso_f, x, z)
def build_knot():
    p = torso_front(0.09, 0.735) + np.array([0, -0.03, 0])
    c = p
    f = lambda q: sd_ell(q, c, (0.05, 0.034, 0.042))
    rows = star_rows(f, c, [0, -1, 0], [0, 0, 1], np.radians([0, 45, 90, 135, 180]), 9, 0.2)
    V, F = rows_mesh(rows)
    out = [Piece('knot', V, F, sdf=f, paint=keyed('rope'))]
    for j, (dx, dz) in enumerate(((-0.022, -0.17), (0.03, -0.155))):
        p0 = c + np.array([dx * 0.5, 0.0, -0.01]); p1 = c + np.array([dx, -0.012, dz * 0.55]); p2 = c + np.array([dx * 1.5, -0.004, dz])
        V, F, A, _ = sweep([p0, p1, p2], 3, 6, lambda s: (0.018, 0.018), [1, 0, 0], caps=(False, True), cap_rings=1)
        out.append(Piece(f'cord{j}', V, F, A=A, paint=keyed('rope'), orient=seg_orient(p0, p2), occluder=False))
    return out

def build_scarf():
    n = 18; ph = 2 * PI * np.arange(n) / n
    rx, ry, cy, cz = 0.212, 0.178, -0.05, 1.05
    C = np.stack([rx * np.cos(ph), cy + ry * np.sin(ph), cz + 0.018 * np.sin(ph)], -1)    # (dips at the front)
    V, F, A = loop_tube(C, 5, lambda i: (0.042, 0.048), expo=2.4)
    out = [Piece('scarf', V, F, A=A, paint=keyed('scarf'))]
    kc = np.array([0.085, cy - ry - 0.018, 1.015])
    f = lambda q: sd_ell(q, kc, (0.052, 0.035, 0.045))
    rows = star_rows(f, kc, [0, -1, 0], [0, 0, 1], np.radians([0, 45, 90, 135, 180]), 9, 0.2)
    V, F = rows_mesh(rows); out.append(Piece('scarfknot', V, F, sdf=f, paint=keyed('scarf')))
    t0 = kc + np.array([0.01, 0.0, -0.01]); t1 = kc + np.array([0.05, -0.012, -0.085]); t2 = kc + np.array([0.075, -0.004, -0.165])
    V, F, A, _ = sweep([t0, t1, t2], 4, 8, lambda s: (0.015, 0.046 + 0.012 * s), [1, 0, 0.25], expo=2.6,
                       caps=(False, True), cap_rings=1, capk=(1.0, 0.5))
    out.append(Piece('scarftail', V, F, A=A, paint=keyed('scarf'), orient=seg_orient(t0, t2), occluder=False))
    return out

def build_sword():
    H = np.array([0.215, -0.385, 0.815]); T = np.array([0.50, 0.12, 0.375])
    M = .5 * (H + T) + np.array([0.035, -0.02, 0.01])
    V, F, A, info = sweep([H, M, T], 5, 7, lambda s: (0.033, 0.033), [1, 0, 0], caps=(True, True), cap_rings=1)
    fields = {'hilt': lambda P: P[:, 3] - 0.24}
    def paint(ins, Ac):
        o = np.full(len(Ac), 'wood', dtype=object); o[ins['hilt']] = 'hilt'; return o
    out = [Piece('sword', V, F, A=A, fields=fields, paint=paint)]
    Cc = info['C']; i = int(round(0.24 * (len(Cc) - 1)))
    t = nrm(Cc[min(i + 1, len(Cc) - 1)] - Cc[max(i - 1, 0)])
    g0 = Cc[i] - t * 0.014; g1 = Cc[i] + t * 0.014
    V, F, A, _ = sweep([g0, .5 * (g0 + g1), g1], 2, 7, lambda s: (0.062, 0.058), [1, 0, 0], caps=(True, True),
                       cap_rings=1, capk=(0.25, 0.25))
    out.append(Piece('tsuba', V, F, A=A, paint=keyed('strawdk')))
    return out

# =========================================================================================== leg, foot, mino
def build_leg():
    V, F, A, _ = sweep([np.array([0, 0, 0.05]), np.array([0, 0, 0.25]), np.array([0, 0, 0.45])], 3, 8,
                       lambda s: (0.052, 0.052), [1, 0, 0], caps=(False, False), cap_rings=1)
    return Piece('leg', V, F, A=A, paint=keyed('wood'), orient=seg_orient([0, 0, 0], [0, 0, 1]), occluder=False)
def foot_f(p): return superq(p, (0, 0.0, 0.0435), (0.15, 0.13, 0.0435), 4.0, 4.0)
def build_foot():
    th = np.radians([0, 40, 70, 90, 110, 140, 180])
    rows = star_rows(foot_f, np.array([0, 0, 0.0435]), [0, 0, 1], [1, 0, 0], th, 8, 0.4)
    V, F = rows_mesh(rows)
    V[:, 2] = np.maximum(V[:, 2], 0.0)
    return Piece('foot', V, F, sdf=None, nsdf=foot_f, paint=keyed('foot'))

def mino_tier(name, nt, ztop, zhem, rtop, rhem, lift, phase, mid=True, under=True):
    S = 5; nseg = nt * S; j = np.arange(nseg)                    # 5 columns per blade: a slit, then a rounded end
    ph = 2 * PI * (j + phase * S) / nseg
    u = (j % S) / S; w = np.sin(PI * u)
    rid = 1 - 0.11 * (1 - w) ** 2                                # (the crease pinches in only at the slit)
    hz = zhem + lift * (1 - np.sqrt(np.clip(1 - (2 * u - 1) ** 2, 0, 1)))   # (round blade ends, lift ~ half a blade)
    def ring(z, s, f=1.0):
        rx = rtop[0] + (rhem[0] - rtop[0]) * s; ry = rtop[1] + (rhem[1] - rtop[1]) * s
        return np.stack([rx * rid * f * np.cos(ph), ry * rid * f * np.sin(ph), np.broadcast_to(z, (nseg,))], -1)
    rows = [ring(np.full(nseg, ztop), 0.0)]                      # (open top: tucked inside the kimono / the tier above)
    att = [np.stack([np.full(nseg, 1.0), w], -1)]
    if mid:
        rows.append(ring(ztop + (hz - ztop) * 0.5, 0.62)); att.append(np.stack([np.full(nseg, 2.0), w], -1))
    rows.append(ring(hz + 0.03, 0.97)); att.append(np.stack([np.full(nseg, 3.0), w], -1))
    rows.append(ring(hz + 0.003, 1.0, 0.985)); att.append(np.stack([np.full(nseg, 4.0), w], -1))
    if under: rows.append(ring(hz + 0.03, 1.0, 0.86)); att.append(np.stack([np.full(nseg, 5.0), w], -1))
    if under: rows.append(np.array([[0, 0, zhem + 0.12]])); att.append(np.array([[6.0, 1.0]]))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'straw', dtype=object); o[Ac[:, 3] > 4.0] = 'strawdk'; return o
    pc = Piece(name, V, F, A=A, paint=paint, orient=point_orient([0, 0, zhem + 0.11]), occluder=False)
    pc.ao = lambda Ax: np.where(Ax[:, 3] > 4.0, 1.0, 0.80 + 0.20 * np.clip(Ax[:, 4], 0, 1) ** 0.6)
    def inside(P):
        z = P[:, 2]; s_ = np.clip((ztop - z) / (ztop - zhem), 0, 1)
        rx = rtop[0] + (rhem[0] - rtop[0]) * s_; ry = rtop[1] + (rhem[1] - rtop[1]) * s_
        rho = np.hypot(P[:, 0] / rx, P[:, 1] / ry)
        return np.minimum.reduce([(0.90 - rho) * rx, z - (zhem + 0.12), ztop - z])
    pc.inside = inside
    return pc

def build_mino():
    return [mino_tier('mino_hi', 12, 0.54, 0.372, (0.27, 0.20), (0.378, 0.322), 0.075, 0.5, mid=False, under=False),
            mino_tier('mino_lo', 14, 0.47, 0.255, (0.30, 0.255), (0.402, 0.342), 0.08, 0.0, mid=False)]

# =========================================================================================== persimmons (hoshigaki)
def build_persimmons():
    top = np.array([0.505, -0.065, 0.745]); zs = (0.665, 0.565, 0.465, 0.365)
    V, F, A, _ = sweep([top, top + np.array([0.004, -0.004, -0.15]), np.array([0.51, -0.072, zs[-1]])], 3, 6,
                       lambda s: (0.0125, 0.0125), [1, 0, 0], caps=(False, True), cap_rings=1)
    out = [Piece('pcord', V, F, A=A, paint=keyed('cord'), orient=seg_orient(top, [0.51, -0.072, zs[-1]]), occluder=False)]
    for j, z in enumerate(zs):
        c = np.array([0.508 + 0.006 * (-1) ** j, -0.07, z]); rr = (0.054, 0.054, 0.045)
        f = (lambda c_, r_: (lambda q: sd_ell(q, c_, r_)))(c, rr)
        rows = star_rows(f, c, [0, 0, 1], [1, 0, 0], np.radians([0, 40, 90, 140, 180]), 6, 0.2)
        V, F = rows_mesh(rows)
        def paint(ins, Ac, c_=c, rz=rr[2]):                    # the calyx cap: the top fan (above 40 deg), no cuts
            o = np.full(len(Ac), 'persim', dtype=object); o[(Ac[:, 2] - c_[2]) > 0.62 * rz] = 'calyx'; return o
        out.append(Piece(f'persim{j}', V, F, sdf=f, paint=paint))
    return out

# =========================================================================================== crows
CB_C = np.array([0.0, 0.014, 0.084]); CB_R = (0.058, 0.076, 0.060)
CH_C = np.array([0.0, -0.046, 0.134]); CH_R = 0.050
CROW_CTR = np.array([0.0, -0.005, 0.098])
def crow_f(p):
    return smin(sd_ell(p, CB_C, CB_R), sd_sph(p, CH_C, CH_R), 0.032)
def f_wing(P):
    d = (P[:, :3] - np.array([0, 0.038, 0.108])) / np.array([0.085, 0.066, 0.042])
    return np.maximum((L(d) - 1.0) * 0.05, 0.011 - np.abs(P[:, 0]))
def crow_eye(k):
    e = nrm([k * 0.78, -0.58, 0.24]); pw = project(crow_f, (CH_C + e * CH_R)[None], 4)[0]
    n0 = unit_normals(crow_f, pw[None])[0]; U_ = nrm(np.cross([0, 0, 1], n0)); V_ = np.cross(n0, U_)
    fwd = -k * U_ if (-k * U_)[1] < 0 else k * U_                      # the tangent pointing to the beak
    nseg = 8; ang = 2 * PI * np.arange(nseg) / nseg; ca, sa = np.cos(ang), np.sin(ang)
    def ring(c, r, h):
        P = c + (r * ca)[:, None] * U_ + (r * sa)[:, None] * V_
        P = project(crow_f, P, 3); return P + unit_normals(crow_f, P) * h
    cp = pw + fwd * 0.0065 + V_ * 0.002
    rows = [project(crow_f, cp[None], 3) + n0 * 0.0014, ring(cp, 0.0125, 0.0014), ring(pw, 0.0235, 0.0014),
            ring(pw, 0.0235 + SKIRT[0], SKIRT[1])]
    att = [np.array([[0.0]]), np.full((nseg, 1), 1.0), np.full((nseg, 1), 2.0), np.full((nseg, 1), 3.0)]
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        b = Ac[:, 3]; o = np.full(len(Ac), 'eyewhite', dtype=object); o[b < 1.0001] = 'eye'; o[b > 2.0001] = 'crow'
        return o
    return Piece(f'ceye{k}', V, F, A=A, paint=paint, nsdf=crow_f, orient=lambda P: unit_normals(crow_f, P[:, :3]))

def crow_pieces(flying=False):
    th = np.radians([0, 30, 60, 90, 120, 150, 180])
    ax = nrm([0, -1, 0.3])
    rows = star_rows(crow_f, CROW_CTR, ax, [0, 0, 1], th, 14, 0.3)
    V, F = rows_mesh(rows)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'crow', dtype=object); o[ins['wing']] = 'crowhi'; return o
    P = [Piece('cbody', V, F, sdf=crow_f, fields={'wing': f_wing}, paint=paint)]
    b0 = CH_C + np.array([0, -0.03, -0.004]); b2 = CH_C + np.array([0, -0.086, -0.016])
    V, F, A, _ = sweep([b0, .5 * (b0 + b2) + np.array([0, 0, 0.003]), b2], 3, 6,
                       lambda s: (0.023 - 0.012 * s, 0.026 - 0.012 * s), [1, 0, 0], caps=(False, True), cap_rings=1)
    P.append(Piece('beak', V, F, A=A, paint=keyed('beak'), orient=seg_orient(b0, b2), occluder=False))
    t0 = CB_C + np.array([0, 0.045, 0.012]); t2 = CB_C + np.array([0, 0.100, 0.006 if not flying else 0.0])
    V, F, A, _ = sweep([t0, .5 * (t0 + t2), t2], 3, 6, lambda s: (0.0135, 0.026 + 0.016 * s), [1, 0, 0], expo=2.4,
                       caps=(False, True), cap_rings=1, capk=(1, 0.7))
    P.append(Piece('ctail', V, F, A=A, paint=keyed('crow'), orient=seg_orient(t0, t2), occluder=False))
    P += [crow_eye(-1), crow_eye(1)]
    if not flying:
        a0 = np.array([-0.034, -0.012, 0.0125]); a2 = np.array([0.034, -0.012, 0.0125])     # the feet, gripping the perch
        V, F, A, _ = sweep([a0, .5 * (a0 + a2) + np.array([0, -0.008, 0]), a2], 3, 5, lambda s: (0.0125, 0.0135), [0, 0, 1],
                           caps=(True, True), cap_rings=1)
        P.append(Piece('feet', V, F, A=A, paint=keyed('crowfoot')))
    return P

WING_Z = 0.115
WING_FINGERS = ((0.192, 0.026, 0.22), (0.172, 0.052, 0.62), (0.143, 0.068, 1.02))   # (x, y, angle toward the back)
def wing_f(p, k):
    q = np.array(p, float); q[..., 0] = q[..., 0] * k                 # (mirror: build the +X wing)
    d = sd_ell(q, (0.112, 0.010, WING_Z), (0.088, 0.052, 0.016))
    for x, y, a in WING_FINGERS:
        R = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1.0]])
        d = smin(d, sd_ell(q, (x, y, WING_Z), (0.046, 0.021, 0.0135), R), 0.016)
    return d
def crow_wing(k):
    """a broad spread wing: a flat rounded paddle with three rounded feather fingers at its trailing tip"""
    sh = np.array([k * 0.035, 0.008, 0.112]); c = np.array([k * 0.115, 0.022, WING_Z])
    f = lambda p: wing_f(p, k)
    rows = star_rows(f, c, [0, 0, 1], [k, 0, 0], np.radians([0, 60, 90, 120, 180]), 16, 0.3)
    V, F = rows_mesh(rows)
    fields = {'top': lambda P: np.maximum(0.085 - k * P[:, 0], WING_Z + 0.0035 - P[:, 2])}
    def paint(ins, Ac):
        o = np.full(len(Ac), 'crow', dtype=object); o[ins['top']] = 'crowhi'; return o
    return Piece(f'wing{k}', V, F, sdf=f, fields=fields, paint=paint), sh
def cull_buried(items, margin=0.035):
    """drop the faces buried deeper than 'margin' inside another shell of the same part (exact inside tests: the
    implicit surfaces, or the analytic insides of the sleeves and mino tiers): they can never be seen, and the ink
    hull (~2 cm) of what remains stays inside the occluder too"""
    for i, it in enumerate(items):
        deep = np.zeros(len(it['P']), bool)
        for j, oc in enumerate(items):
            if j == i or oc.get('inside') is None or not len(it['P']): continue
            deep |= oc['inside'](it['P']) > margin
        keep = ~deep[it['T']].all(1)
        T = it['T'][keep]; used = np.unique(T); remap = -np.ones(len(it['P']), int); remap[used] = np.arange(len(used))
        it['culled'] = int((~keep).sum())
        it['P'], it['N'], it['T'], it['keys'] = it['P'][used], it['N'][used], remap[T], it['keys'][keep]
        it['ao'] = it['ao'][used]

def shade(keys_rgb, N):
    """gentle painted shading baked into the corner colours: undersides a touch darker, tops a touch warmer"""
    nz = N[:, 2]
    k = 1.0 - 0.10 * clamp01(-nz) ** 1.2 + 0.03 * clamp01(nz)
    return keys_rgb * k[:, None]

def make_material():
    m = bpy.data.materials.get('toon') or bpy.data.materials.new('toon')
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], bs.inputs['Base Color']); nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    bs.inputs['Roughness'].default_value = 0.8; bs.inputs['Metallic'].default_value = 0.0
    return m

def make_object(name, items, pal, origin):
    P = np.concatenate([it['P'] for it in items]) - origin
    N = np.concatenate([it['N'] for it in items])
    tris, cols, off = [], [], 0
    for it in items:
        tris.append(it['T'] + off); off += len(it['P'])
    T = np.concatenate(tris)
    keys = np.concatenate([it['keys'] for it in items])
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in P], [], [tuple(int(i) for i in t) for t in T]); me.update()
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    # corner colours: face key colour, shaded by the vertex normal
    base = np.array([srgb_lin(pal[k]) for k in keys])           # per face
    li = T.ravel(); fc = np.repeat(base, 3, 0)
    ao = np.concatenate([it['ao'] for it in items])
    for key in set(keys):                                        # soft painted shadow tone (the head: toward the chin)
        if key + '_sh' in pal:
            m = np.repeat(keys == key, 3); nz = N[li][m, 2]
            t = (clamp01((-nz - 0.05) / 0.75) ** 1.2 * 0.85)[:, None]
            fc[m] = fc[m] * (1 - t) + srgb_lin(pal[key + '_sh'])[None] * t
    rgb = shade(fc, N[li]) * ao[li][:, None]
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    ca.data.foreach_set('color', np.hstack([rgb, np.ones((len(rgb), 1))]).astype(np.float32).ravel())
    me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0
    me.normals_split_custom_set_from_vertices([tuple(n) for n in N])
    me.materials.append(make_material())
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = Vector(origin)
    return ob

def lighten(h, t):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)
    c = c + (255 - c) * t; return '#' + ''.join(f'{int(round(x)):02x}' for x in c)


# =========================================================================================== assemble
def build_body_items(v):
    P = [build_head()] + build_face()
    apex = None
    if v.get('hat'):
        hat, apex = build_hat(); P.append(hat)
    if v.get('horns'): P += [build_horn(-1), build_horn(1)]
    if v.get('headband'): P.append(build_headband())
    P += [build_torso(), build_piping(), build_sleeve(-1), build_sleeve(1)] + build_tufts(-1) + build_tufts(1)
    P += [build_belt()] + build_knot() + build_scarf() + build_sword()
    P += [build_leg(), build_foot()] + build_mino()
    if v.get('persimmons'): P += build_persimmons()
    items = [process(p) for p in P]
    cull_buried(items)
    return items, apex

CROW_S = 1.15                                # (the sheet's crows: ~0.26 m beak to tail; the brief said ~0.22)
def crow_items(flying=False):
    items = [process(p) for p in crow_pieces(flying)]
    cull_buried(items)
    for it in items: it['P'] = it['P'] * CROW_S
    return items

def shifted(items, d):
    out = []
    for it in items:
        c = dict(it); c['P'] = it['P'] + np.asarray(d, float); out.append(c)
    return out

def palette(v):
    pal = dict(COMMON); pal.update({k: x for k, x in v.items() if isinstance(x, str)})
    pal['kimonodk'] = mulhex(pal['kimono'], 0.55)
    return pal

def export(fn):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, fn + '.glb'), export_format='GLB', export_apply=True,
                              export_yup=True, export_attributes=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_texcoords=False,
                              export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_materials='EXPORT')

PERCH_X = 0.535
def build_variant(vname):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    np.random.seed(7)
    v = VARIANTS[vname]; pal = palette(v)
    items, apex = build_body_items(v)
    obs = [make_object('body', items, pal, np.zeros(3))]
    citems = crow_items()
    perches = {'crowA': np.array([-PERCH_X, 0.0, sleeve_top(-1, -PERCH_X) - 0.004])}
    if apex is not None: perches['crowB'] = apex + np.array([0, 0, -0.008])
    else:
        top = ray_exit(head_base, HC, np.array([[0, 0, 1.0]]), 0.6)[0]; perches['crowB'] = top + np.array([0, 0, -0.006])
    if v.get('crows', 2) >= 3: perches['crowC'] = np.array([PERCH_X, 0.0, sleeve_top(1, PERCH_X) - 0.004])
    for name, p in perches.items():
        obs.append(make_object(name, shifted(citems, p), pal, p))
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['pieces'] = {it['name']: len(it['T']) for it in items}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    fn = 'kakashi' + ('' if vname == 'base' else '_' + vname)
    if vname == 'base':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'kakashi.blend'))
    export(fn)
    print('KAKASHI', vname, json.dumps(stats))
    return stats

def build_crow():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pal = palette(VARIANTS['base'])
    body = shifted(crow_items(flying=True), -CROW_CTR * CROW_S)
    obs = [make_object('body', body, pal, np.zeros(3))]
    for k, name in ((1, 'wing_L'), (-1, 'wing_R')):
        pc, sh = crow_wing(k)
        it = [process(pc)]; it[0]['P'] = it[0]['P'] * CROW_S
        it = shifted(it, -CROW_CTR * CROW_S)
        obs.append(make_object(name, it, pal, (sh - CROW_CTR) * CROW_S))
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'kakashi_crow.blend'))
    export('kakashi_crow')
    print('KAKASHI crow', json.dumps(stats))
    return stats

if __name__ == '__main__':
    names = list(VARIANTS) + ['crow'] if WANT == 'all' else [WANT]
    allstats = {}
    for n in names:
        allstats[n] = build_crow() if n == 'crow' else build_variant(n)
    os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
    with open(os.path.join(TASK_DIR, 'work', 'build_stats.json' if WANT == 'all' else f'build_stats_{WANT}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=1)
