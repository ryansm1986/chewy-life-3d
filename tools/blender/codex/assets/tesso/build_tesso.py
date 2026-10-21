"""Tesso (Maple Roots, enemy series EN-1) -- deterministic build, Option A "Iron-Tooth Rat" (refs/sheet.png).

Blender 4.3:
  blender --background --factory-startup --python build_tesso.py [-- --variant base|sutra|elder|all]

Builds every variant from an empty scene, saves tesso.blend (the base) and exports
public/models/tesso.glb, tesso_sutra.glb and tesso_elder.glb.
Units: metres, front = -Y, ground z = 0, character left = +X.

Enemy contract (.claude/skills/codex-blender/templates/enemy-model-contract.md):
  rigid parts, no rig, no UVs, no textures; one face-corner colour attribute `Col`; one material `toon`.
  body  : origin (0, 0, 0)        torso, belly, haunches, feet, tail, upper arms, the juzu + tassel (elder: the kesa)
  head  : origin NECK (0, -0.05, 0.50), the neck ball's centre   head, neck ball, ears, face, iron teeth, whiskers
  paws  : origin PAWP (0, -0.20, 0.39), the elbow axle (both elbow balls' centres)   elbows, forearms, fists (sutra: scroll)
  mound : origin (0, 0, 0)        the dirt mound, clods and maple leaves
  The neck and elbow joints are spheres centred on the pivots, so they turn in place: no gap at any angle.
  The pivots are the same in every variant.

Scale: the sheet's ear tops (290 px over the ground line) = the brief's 0.87 m -> 333 px per Blender metre.

Technique (the framework of the approved kappa / kakashi / kamaitachi builds):
- Head, torso, feet, fists, nose, teeth, clods, the mound are implicit surfaces (smooth unions of ellipsoids /
  superquadrics / rounded boxes) sampled as star-shaped grids (rays from a centre, root-found onto the surface).
- Ears, tassel are lathes; tail, whiskers, arms, cord, scroll, brows are sweeps; the kesa is a closed band on the body.
- Colour borders are cut into the mesh as level-set contours of feature fields (muzzle, belly, highlights) so every
  border runs along an edge loop; face features are decal shells lying on the head (eyes, lashes, brows, smile, blush)
  so the ink hull never rings them.
- Faces buried more than 3.5 cm inside another shell of the same part are culled (never across parts: the parts turn).
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/tesso'
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
WANT = arg('--variant', 'all')
PI = math.pi

# =========================================================================================== framework (helpers)
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
def sd_cap(p, a, b, r):
    """capsule a-b, radius r: a sausage with ball ends"""
    a = np.asarray(a, float); ba = np.asarray(b, float) - a; pa = p - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return L(pa - h[..., None] * ba) - r

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
    assert (v < 0).any(), f'hit_front: no surface at x={x}, z={z}'
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
    ori = pc.orient if pc.orient is not None else ((lambda f_: (lambda C: grad(f_, C)))(pc.sdf) if pc.sdf is not None else None)
    if ori is not None:   # open decals: face along the host surface's outward normal (closed implicits: along the gradient)
        bm.normal_update(); fl = list(bm.faces)
        C = np.array([f.calc_center_median() for f in fl]); Nf = np.array([f.normal for f in fl])
        bad = np.einsum('ij,ij->i', Nf, ori(C)) < 0
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
    if 'clip' in inside:                    # joined-in pieces cut off exactly at their host's surface (no buried part,
        keep = ~inside['clip']              # so their 2 cm ink hull can't show through the host as thin dark lines)
        tris = tris[keep]; keys = np.asarray(keys)[keep]
        used = np.unique(tris); remap = -np.ones(len(P), int); remap[used] = np.arange(len(used))
        A = A[used]; P = A[:, :3]; Nv = Nv[used]; tris = remap[tris]
    ao = pc.ao(A) if getattr(pc, 'ao', None) is not None else np.ones(len(P))
    inside = getattr(pc, 'inside', None)
    if inside is None and pc.occluder:
        f = pc.sdf if pc.sdf is not None else (pc.nsdf if pc.orient is None else None)
        if f is not None: inside = (lambda f_: (lambda Q: -f_(Q)))(f)
    return dict(P=P, N=Nv, T=tris, keys=np.asarray(keys), part=pc.part, name=pc.name, occ=pc.occluder, ao=ao, inside=inside,
                cull=getattr(pc, 'cull', None))


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


def cull_buried(items, margin=0.024):

    """drop the faces buried deeper than 'margin' inside another shell of the same part (exact inside tests: the
    implicit surfaces, or the analytic insides of the sleeves and mino tiers): they can never be seen, and the ink
    hull (~2 cm) of what remains stays inside the occluder too"""
    for i, it in enumerate(items):
        deep = np.zeros(len(it['P']), bool)
        for j, oc in enumerate(items):
            if j == i or oc.get('inside') is None or not len(it['P']): continue
            deep |= oc['inside'](it['P']) > margin
        if it.get('cull') is not None:     # joined-in pieces (ears, teeth, whiskers, tail...): drop everything inside, so
            deep = np.zeros(len(it['P']), bool)   # their 2 cm ink hull can't show through the host as thin dark lines
            for j, oc in enumerate(items):
                if j == i or oc.get('inside') is None: continue
                deep |= oc['inside'](it['P']) > it['cull']
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
    for key in set(keys):                                        # a soft lighter top tone (the head and back catch the light)
        if key + '_hi' in pal:
            m = np.repeat(keys == key, 3); nz = N[li][m, 2]
            t = (clamp01((nz - 0.30) / 0.70) ** 1.3 * 0.30)[:, None]
            fc[m] = fc[m] * (1 - t) + srgb_lin(pal[key + '_hi'])[None] * t
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


def curve_orient(ctrl):
    """outward direction for open sweeps along a curve: away from the nearest point of the (dense) centreline"""
    C, _ = catmull(ctrl, 200)
    def f(X):
        d = X[:, None, :] - C[None]; i = np.argmin(np.einsum('ijk,ijk->ij', d, d), 1)
        return X - C[i]
    return f

# =========================================================================================== palettes (sRGB hex)
COMMON = {
    'eye': '#292125', 'iristop': '#2e1f1c', 'iris': '#6a3e2c', 'eyewhite': '#fff6ea', 'catch': '#ffffff',
    'mouth': '#3a2228', 'tooth': '#a8aebc', 'toothhi': '#e2e6ee', 'toothgap': '#4a4e5c', 'nosehi': '#fbd0d4',
    'soil': '#7a5a38', 'soildk': '#5a4028', 'clod': '#6a4c2e', 'clod2': '#8e6c46',
    'leafA': '#ec7a30', 'leafB': '#f2c040', 'leafC': '#e0602a', 'scroll': '#f2e6c8', 'roller': '#5a3a26',
    'scrollband': '#c8402e', 'kesa': '#e8a02a', 'elderbrow': '#fbf6f0',
}
VARIANTS = {
    'base':  dict(fur='#7c808e', furhi='#a8aebc', belly='#dcd4cc', pink='#f2a0aa', tail='#d8a8a8', bead='#6a4030',
                  tassel='#d8402e', brow='#565a68'),
    'sutra': dict(fur='#8a6e5c', furhi='#b89c86', belly='#ecdcc8', pink='#f4a4a8', tail='#d4a4a0', bead='#3e2a20',
                  tassel='#e8a03a', brow='#5a4234', scroll=True),
    'elder': dict(fur='#cfc8c4', furhi='#f4f0ec', belly='#fffaf4', pink='#f6b0b4', tail='#e8c0bc', bead='#7a4a2e',
                  tassel='#d8302e', brow='#a8a09c', elder=True, bead_r=0.034),
}

# =========================================================================================== pivots (all variants)
NECK = np.array([0.0, -0.05, 0.50])          # head pivot: the neck ball's centre (the brief)
PAWP = np.array([0.0, -0.20, 0.380])          # paws pivot: the elbow axle through both elbow balls (in front of the chest)
NECK_R = 0.105

# =========================================================================================== head
def head_base(p):
    d = sd_ell(p, (0.0, -0.030, 0.600), (0.198, 0.186, 0.152))              # the cranium ball
    d = smin(d, sd_ell(p, (0.0, -0.078, 0.512), (0.226, 0.165, 0.094)), 0.06)  # full round cheeks / jowls
    d = smin(d, sd_ell(p, (0.0, -0.205, 0.530), (0.104, 0.118, 0.074)), 0.08)  # the snout, nose forward
    return smax(d, 0.414 - p[..., 2], 0.04)                                  # a soft flat chin

EYE_X, EYE_Z = 0.100, 0.603
EX, EY = 0.054, 0.049                         # eye half-sizes (the sheet: 0.086 x 0.080 with the lash rim)
EYES = {}
for _k in (-1, 1):
    _pe = hit_front(head_base, _k * EYE_X, EYE_Z)
    _n = unit_normals(head_base, _pe[None])[0]
    _A = nrm(_n * 0.72 + np.array([0, -1, 0]) * 0.28)
    _U = nrm(np.cross([0, 0, 1], _A)); _V = np.cross(_A, _U)
    EYES[_k] = (_pe, _A, _U, _V)

def head_sdf(p):
    d = head_base(p)
    for k in (-1, 1):
        pe, A_, U_, V_ = EYES[k]
        R = np.stack([U_, V_, A_], 1)
        d = smin(d, sd_ell(p, pe - A_ * 0.016, (EX * 1.03, EY * 1.03, 0.020), R), 0.012)   # a gently domed eye lens
    return d

def muzzle_zb(x):
    ax = np.abs(x)
    return 0.556 + 0.036 * np.exp(-(ax / 0.042) ** 2) - 0.9 * np.maximum(0, ax - 0.13) ** 2
def muzzle_f(P):
    """the pale muzzle / cheeks: the lower front of the face (negative inside)"""
    return np.maximum(P[:, 2] - muzzle_zb(P[:, 0]), (P[:, 1] + 0.035 + np.clip(P[:, 2] - 0.47, 0, None) * 1.6) * 0.6)
def skin_key(P):
    o = np.full(len(P), 'fur', dtype=object); o[muzzle_f(P[:, :3]) < 0] = 'belly'; return o

IRIS = dict(du=-0.004, dv=0.000, ru=0.046, rv=0.048)   # the irises sit toward the nose: white shows on the outer side
def iris_c(k): return IRIS['du'] * k, IRIS['dv']
def eye_dark2(u, v, k):
    rim = ell2(u, v, EX + 0.0045, EY + 0.0045)
    lash = np.maximum(ell2(u, v - 0.004, EX + 0.0060, EY + 0.0090), -(v + 0.006))
    return smin(rim, lash, 0.004)
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
SKIRT = (0.0075, -0.0015)          # a wide, shallow skirt: its ink hull stays under the head's
PUPIL_R = 0.016

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
        u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (-0.012 + 3.0 * u * u)
    def f_cl(P):   # the big catchlight, upper left (viewer's) on both eyes
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu + 0.013, v - cv - 0.018) - 0.0135
    def f_cs(P):   # the small one, lower right
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu - 0.019, v - cv + 0.022) - 0.0062
    def paint(ins, Ac):
        b, w = Ac[:, 3], Ac[:, 4]
        o = np.full(len(Ac), 'eye', dtype=object)
        o[(b > 2) & (b < 3) & (w > 0.999)] = 'eyewhite'
        o[(b < 2.0001)] = 'iristop'; o[(b < 2.0001) & ins['low']] = 'iris'
        o[(b < 0.5001)] = 'eye'
        o[(b < 2.0001) & (ins['cl'] | ins['cs'])] = 'catch'
        sk = b > 4.0001; o[sk] = skin_key(Ac[sk, :3])
        return o
    return Piece(f'eye{k}', V, F, A=A, fields={'low': f_low, 'cl': f_cl, 'cs': f_cs}, paint=paint,
                 nsdf=head_sdf, orient=head_up)

def decal_strip(C, width, H, nrows, key, name, relief=True, ncol=7, tip=True):
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
        tp = Cr[end] + sign * T[end] * (width(s[end]) + SKIRT[0])
        tp = project(head_sdf, tp[None], 3)[0]; tp = tp + unit_normals(head_sdf, tp[None])[0] * SKIRT[1]
        ti = len(V); V = np.vstack([V, tp]); A = np.vstack([A, [[s[end], 0.0]]])
        base = end * nc
        F += [(base + j, base + j + 1, ti) for j in range(nc - 1)]
    def paint(ins, Ac):
        o = np.full(len(Ac), key, dtype=object); skm = np.abs(Ac[:, 4]) > 1.0001
        o[skm] = skin_key(Ac[skm, :3]); return o
    return Piece(name, V, F, A=A, paint=paint, nsdf=None if relief else head_sdf, orient=head_up)

def eye_pt(k, u, v):
    pe, A_, U_, V_ = EYES[k]
    return on_head(pe, A_, U_, V_, np.array([u]), np.array([v]), 0.0)[0]
def build_lashes(k):
    """two short lash flicks off the outer end of the upper lash line"""
    out = []
    for j, (u0, v0, u1, v1, w) in enumerate(((0.80, 0.70, 1.30, 1.18, 0.0050), (0.45, 0.98, 0.72, 1.45, 0.0045))):
        C = np.array([eye_pt(k, k * EX * u0, EY * v0), eye_pt(k, k * EX * (u0 + u1) / 2 * 1.02, EY * (v0 + v1) / 2),
                      eye_pt(k, k * EX * u1, EY * v1)])
        out.append(decal_strip(C, (lambda w_: (lambda s: w_ * (1.0 - 0.45 * s)))(w), 0.0022, 3, 'eye', f'lash{k}{j}', ncol=5))
    return out

def build_brow(k):
    """a short soft arc above the eye"""
    C = np.array([hit_front(head_sdf, k * x, z) for x, z in ((0.070, 0.690), (0.099, 0.704), (0.130, 0.698))])
    return decal_strip(C, lambda s: 0.0052 + 0.0018 * math.sin(PI * s), 0.0025, 5, 'brow', f'brow{k}', ncol=5)

def build_mouth():
    """the smile: a 'w' from cheek to cheek under the nose, and the short line down from the nose"""
    W = [(-0.086, 0.532), (-0.064, 0.508), (-0.036, 0.496), (-0.012, 0.501), (0.0, 0.508), (0.012, 0.501),
         (0.036, 0.496), (0.064, 0.508), (0.086, 0.532)]
    C = np.array([hit_front(head_sdf, x, z) for x, z in W])
    out = [decal_strip(C, lambda s: 0.0052 + 0.0012 * math.sin(PI * s), 0.0018, 9, 'mouth', 'mouth', relief=False, ncol=5)]
    C = np.array([hit_front(head_sdf, 0.0, z) for z in (0.534, 0.520, 0.508)])
    out.append(decal_strip(C, lambda s: 0.0045, 0.0015, 3, 'mouth', 'philtrum', relief=False, ncol=5))
    return out

CHEEK = {}
for _k in (-1, 1):
    _pc = hit_front(head_base, _k * 0.165, 0.532)
    _n = unit_normals(head_base, _pc[None])[0]; _U = nrm(np.cross([0, 0, 1], _n)); _V = np.cross(_n, _U)
    CHEEK[_k] = (_pc, _n, _U, _V)
def build_blush(k):
    pc_, n0, U_, V_ = CHEEK[k]
    nseg = 8; ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [project(head_sdf, pc_[None], 3) + n0 * 0.0012], [np.array([[0.0]])]
    for x, h in ((1.0, 0.0012), (1.0 + SKIRT[0] / 0.025, SKIRT[1])):
        P = pc_ + (0.032 * x * np.cos(ang))[:, None] * U_ + (0.024 * x * np.sin(ang))[:, None] * V_
        P = project(head_sdf, P, 3); rows.append(P + unit_normals(head_sdf, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'pink', dtype=object); skm = Ac[:, 3] > 1.0001
        o[skm] = skin_key(Ac[skm, :3]); return o
    return Piece(f'blush{k}', V, F, A=A, paint=paint, nsdf=head_sdf, orient=head_up)

def build_headball():
    th = np.radians([0, 12, 24, 37, 51, 65, 80, 95, 111, 128, 150, 180])
    ctr = np.array([0, -0.06, 0.58])
    lenses = [(nrm(EYES[k][0] - ctr), 0.30, 0.65) for k in (-1, 1)]
    rows = star_rows(head_sdf, ctr, [0, -1, 0], [0, 0, 1], th, 24, 0.6, lenses=lenses)
    V, F = rows_mesh(rows)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'fur', dtype=object); o[ins['muz']] = 'belly'; return o
    return Piece('headball', V, F, sdf=head_sdf, fields={'muz': muzzle_f}, paint=paint,
                 refine=[(('muz',), 0.010, 0.040)])

def neck_f(p): return sd_sph(p, NECK, NECK_R)
def build_neck():
    th = np.radians([0, 50, 72, 90, 110, 135, 180])
    rows = star_rows(neck_f, NECK, [0, 0, 1], [0, -1, 0], th, 12, 0.3)
    V, F = rows_mesh(rows)
    return Piece('neck', V, F, sdf=neck_f, paint=keyed('fur'))

NOSE_C = hit_front(head_base, 0.0, 0.556) + np.array([0, 0.010, 0.0])
def nose_f(p):
    d = sd_ell(p, NOSE_C, (0.037, 0.027, 0.025))
    return smin(d, sd_ell(p, NOSE_C + np.array([0, 0.002, -0.014]), (0.017, 0.020, 0.014)), 0.012)
def build_nose():
    rows = star_rows(nose_f, NOSE_C, [0, -1, 0], [0, 0, 1], np.radians([0, 35, 70, 105, 180]), 10, 0.2)
    V, F = rows_mesh(rows)
    def f_hi(P): return np.hypot(P[:, 0] + 0.010, P[:, 2] - NOSE_C[2] - 0.010) - 0.008
    def paint(ins, Ac):
        o = np.full(len(Ac), 'pink', dtype=object); o[ins['hi'] & (Ac[:, 1] < NOSE_C[1] - 0.01)] = 'nosehi'; return o
    return Piece('nose', V, F, sdf=nose_f, fields={'hi': f_hi}, paint=paint)

def sd_rbox(p, c, half, r, R=None):
    d = p - np.asarray(c, float)
    if R is not None: d = d @ R
    q = np.abs(d) - (np.asarray(half, float) - r)
    return L(np.maximum(q, 0)) + np.minimum(q.max(-1), 0) - r
_s = hit_front(head_base, 0.0, 0.502)
TOOTH_C = np.array([0.0, _s[1] + 0.012, 0.466])
def teeth_f(p):
    return sd_rbox(p, TOOTH_C, (0.0345, 0.0150, 0.038), 0.012)
def build_teeth():
    """the two iron buck teeth as one chunky piece (one ink outline, no dark blob between), a dark groove down the middle"""
    f = teeth_f; c = TOOTH_C
    rows = star_rows(f, c, [0, -1, 0], [0, 0, 1], np.radians([0, 33, 66, 100, 180]), 12, 0.2, phase=0.5)
    V, F = rows_mesh(rows)
    def f_hi(P):   # the iron shine: a soft vertical highlight band on the front, viewer's left of each tooth
        return np.maximum(np.abs(np.abs(P[:, 0]) - 0.0165 + 0.0050 * np.sign(P[:, 0])) - 0.0048, P[:, 1] - (c[1] - 0.006))
    def f_gap(P):
        return np.maximum(np.abs(P[:, 0]) - 0.0022, P[:, 1] - (c[1] - 0.004))
    def paint(ins, Ac):
        o = np.full(len(Ac), 'tooth', dtype=object); o[ins['hi']] = 'toothhi'; o[ins['gap']] = 'toothgap'; return o
    return Piece('teeth', V, F, sdf=f, fields={'hi': f_hi, 'gap': f_gap}, paint=paint)

def build_whiskers(k):
    out = []
    for j, (z, dz, ln) in enumerate(((0.548, 0.024, 0.094), (0.528, 0.002, 0.100), (0.508, -0.022, 0.090))):
        s = hit_front(head_base, k * 0.172, z); n = unit_normals(head_base, s[None])[0]
        a = s - n * 0.012
        d = nrm(np.array([k * 1.0, -0.30, dz / ln * 1.6]))
        b = a + d * ln; m = a + d * ln * 0.5 + np.array([0, -0.006, 0.006 if dz >= 0 else -0.004])
        V, F, A, _ = sweep([a, m, b], 3, 5, lambda s_: (0.0095 - 0.0015 * s_, 0.0095 - 0.0015 * s_), [0, 0, 1],
                           caps=(False, True), cap_rings=1)
        out.append(Piece(f'whisker{k}{j}', V, F, A=A, paint=keyed('tail'), orient=seg_orient(a, b), occluder=False))
    return out

# ---- the ears: thick round discs (a lathe round the ear's normal), the pink inside a shallow dish
EAR_RW, EAR_RH = 0.160, 0.156
EAR_PROF = [(0.0, 0.024), (0.118, 0.021), (0.140, 0.018), (0.154, 0.010), (0.161, -0.003),
            (0.150, -0.018), (0.110, -0.026), (0.0, -0.026)]
EAR_PINK_ROW = 1                              # faces on the profile rows <= this: the pink inside (r < 0.118); a convex
                                              # front (a concave dish rings the pink with ink from the 45-deg camera)
def ear_frame(k):
    c = np.array([k * 0.207, 0.035, 0.716])
    n = nrm(np.array([k * math.sin(math.radians(24)), -math.cos(math.radians(24)) * math.cos(math.radians(16)),
                      math.sin(math.radians(16))]))
    w = np.array([0, 0, 1.0]); w = nrm(w - (w @ n) * n); u = np.cross(w, n)
    return c, u, w, n
def build_ear(k):
    c, u, w, n = ear_frame(k)
    V, F, A = lathe(EAR_PROF, 20)
    V = c + (V[:, 0] * EAR_RW / 0.158)[:, None] * u + (V[:, 1] * EAR_RH / 0.158)[:, None] * w + V[:, 2][:, None] * n
    def paint(ins, Ac):
        o = np.full(len(Ac), 'fur', dtype=object); o[Ac[:, 3] < EAR_PINK_ROW + 0.001] = 'pink'; return o
    return Piece(f'ear{k}', V, F, A=A, paint=paint, orient=point_orient(c), occluder=False)

def build_elder_brows(k):
    pts = [hit_front(head_sdf, k * x, z) for x, z in ((0.048, 0.688), (0.090, 0.704), (0.130, 0.696), (0.166, 0.664))]
    pts = [p + unit_normals(head_sdf, p[None])[0] * 0.008 for p in pts]
    V, F, A, _ = sweep(pts, 5, 6, lambda s: (0.017 + 0.012 * math.sin(PI * min(1, s * 1.15)) ** 0.8,) * 2, [0, 0, 1],
                       caps=(True, True), cap_rings=1, rmod=lambda s, ph: 1 + 0.10 * np.cos(3 * ph))
    return Piece(f'ebrow{k}', V, F, A=A, paint=keyed('elderbrow'), orient=seg_orient(pts[0], pts[-1]), occluder=False)

def tag(pc, host=None):
    host = host or head_sdf
    pc.fields = dict(pc.fields); pc.fields['clip'] = (lambda h: (lambda P: h(P[:, :3])))(host); return pc

def build_head_items(v):
    P = [build_headball(), build_neck(), build_eye(-1), build_eye(1), build_blush(-1), build_blush(1), build_nose(),
         tag(build_teeth()), tag(build_ear(-1)), tag(build_ear(1))] + build_mouth()
    P += build_lashes(-1) + build_lashes(1) + [tag(w) for w in build_whiskers(-1) + build_whiskers(1)]
    if v.get('elder'): P += [tag(build_elder_brows(-1)), tag(build_elder_brows(1))]
    else: P += [build_brow(-1), build_brow(1)]
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== body
def torso_f(p):
    d = superq(p, (0.0, 0.012, 0.150), (0.276, 0.216, 0.188), 2.0, 2.3)          # the sat pear: a wide, flat-bottomed base
    d = smin(d, sd_ell(p, (0.0, -0.012, 0.320), (0.178, 0.165, 0.132)), 0.08)       # chest and shoulders, narrowing
    d = smin(d, sd_ell(p, (0.0, -0.040, 0.430), (0.118, 0.108, 0.070)), 0.05)       # the neck, under the head
    for k in (-1, 1):
        d = smin(d, sd_ell(p, (k * 0.175, -0.050, 0.095), (0.105, 0.135, 0.090)), 0.05)  # the haunches over the feet
    return smax(d, -p[..., 2], 0.02)
def belly_f(P): return np.maximum(ell2(P[:, 0], P[:, 2] - 0.172, 0.170, 0.160), (P[:, 1] + 0.035) * 0.5)
def build_torso():
    th = np.radians([0, 13, 26, 39, 52, 65, 78, 91, 104, 117, 132, 152, 180])
    rows = star_rows(torso_f, np.array([0, 0.0, 0.22]), [0, 0, 1], [0, -1, 0], th, 20, 0.6)
    V, F = rows_mesh(rows)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'fur', dtype=object); o[ins['belly']] = 'belly'; return o
    return Piece('torso', V, F, sdf=torso_f, fields={'belly': belly_f}, paint=paint, refine=[(('belly',), 0.012, 0.045)])

def foot_f_k(k):
    fc = np.array([k * 0.200, -0.158, 0.032]); yaw = k * 0.16
    def f(p):
        d = sd_ell(p, fc, (0.060, 0.090, 0.034))
        for a in (-0.42, 0.0, 0.42):
            dr = np.array([math.sin(a + yaw), -math.cos(a + yaw), 0.0])
            d = smin(d, sd_cap(p, fc + dr * 0.042 + np.array([0, 0, -0.006]), fc + dr * 0.071 + np.array([0, 0, -0.006]), 0.023), 0.016)
        return smax(d, -p[..., 2], 0.012)
    return f, fc
def build_foot(k):
    f, fc = foot_f_k(k)
    rows = star_rows(f, fc + np.array([0, -0.01, 0.0]), [0, 0, 1], [0, -1, 0], np.radians([0, 40, 75, 100, 180]), 14, 0.3,

                     lenses=[(np.array([math.sin(k * 0.16), -math.cos(k * 0.16), 0]), 1.1, 0.45)])
    V, F = rows_mesh(rows)
    return Piece(f'foot{k}', V, F, sdf=f, paint=keyed('pink'))

TAIL = [(0.03, 0.15, 0.12), (0.06, 0.27, 0.058), (0.15, 0.335, 0.036), (0.27, 0.335, 0.036), (0.37, 0.275, 0.058),
        (0.405, 0.19, 0.13), (0.385, 0.140, 0.212), (0.330, 0.140, 0.256), (0.280, 0.175, 0.240)]
def build_tail():
    V, F, A, _ = sweep(TAIL, 12, 7, lambda s: (0.038 - 0.015 * s, 0.038 - 0.015 * s), [0, 0, 1], caps=(False, True), cap_rings=2)
    return Piece('tail', V, F, A=A, paint=keyed('tail'), orient=curve_orient(TAIL), occluder=False)

def build_upper_arm(k):
    a = np.array([k * 0.138, -0.075, 0.335]); m = np.array([k * 0.128, -0.150, 0.360]); b = np.array([k * 0.100, -0.200, 0.380])
    V, F, A, _ = sweep([a, m, b], 3, 8, lambda s: (0.043, 0.043), [0, 0, 1], caps=(False, False))
    return Piece(f'uarm{k}', V, F, A=A, paint=keyed('fur'), orient=seg_orient(a, b), occluder=False)

def bead_ring(v):
    """bead centres round the neck: the ring tilts (front lower, as the sheet's side view), each bead half sunk in the fur"""
    rb = v.get('bead_r', 0.030)
    th = np.linspace(0, 2 * PI, 200, endpoint=False)
    E = np.stack([np.sin(th), -np.cos(th), np.zeros_like(th)], -1)
    Z = 0.408 - 0.030 * np.cos(th)
    O = np.stack([np.zeros_like(th), np.full_like(th, -0.035), Z], -1)
    S = ray_exit(torso_f, O, E, 0.5)
    C = S + E * rb * 0.50
    seg = L(np.roll(C, -1, 0) - C); per = seg.sum(); nb = int(per // (rb * 2.04))
    cum = np.concatenate([[0], np.cumsum(seg)])[:-1]
    s = np.arange(nb) * per / nb
    return np.stack([np.interp(s, cum, C[:, i], period=per) for i in range(3)], -1), rb
def build_beads(v):
    C, rb = bead_ring(v); out = []
    for i, c in enumerate(C):
        r = rb * (1.22 if i == 0 else 1.0)
        f = (lambda c_, r_: (lambda p: sd_sph(p, c_, r_)))(c, r)
        rows = star_rows(f, c, nrm(c - np.array([0, -0.035, c[2]])), [0, 0, 1], np.radians([0, 60, 120, 180]), 7 if i else 9, 0.1, phase=0.5)
        V, F = rows_mesh(rows)
        out.append(Piece(f'bead{i}', V, F, sdf=f, paint=keyed('bead')))
    return out, C[0], rb

KNOT_C = np.array([0.0, -0.252, 0.268])
def build_tassel(front_bead):
    out = []
    a = front_bead + np.array([0, -0.004, -0.02]); b = KNOT_C
    V, F, A, _ = sweep([a, .5 * (a + b) + np.array([0, -0.006, 0]), b], 4, 6, lambda s: (0.011, 0.011), [1, 0, 0], caps=(False, False))
    out.append(Piece('cord', V, F, A=A, paint=keyed('tassel'), orient=seg_orient(a, b), occluder=False))
    f = lambda p: sd_sph(p, KNOT_C, 0.019)
    rows = star_rows(f, KNOT_C, [0, 0, 1], [0, -1, 0], np.radians([0, 60, 120, 180]), 8, 0.1)
    V, F = rows_mesh(rows); out.append(Piece('knot', V, F, sdf=f, paint=keyed('tassel')))
    z0 = KNOT_C[2] - 0.010
    prof = [(0.0, z0), (0.013, z0), (0.020, z0 - 0.030), (0.029, z0 - 0.068), (0.029, z0 - 0.082),
            (0.0, z0 - 0.088)]
    V, F, A = lathe(prof, 9, 0.5); V[:, 0] += KNOT_C[0]; V[:, 1] += KNOT_C[1]
    def paint(ins, Ac):
        o = np.full(len(Ac), 'tassel', dtype=object); o[(Ac[:, 3] > 1.0) & (Ac[:, 3] < 2.0)] = 'tasseldk'; return o
    out.append(Piece('tassel', V, F, A=A, paint=paint, orient=point_orient(KNOT_C + np.array([0, 0, -0.05]))))
    return out

def build_kesa():
    """elder: a saffron kesa band slung diagonally round the body (high over the left shoulder, low at the right hip)"""
    n = 20; ph = 2 * PI * np.arange(n) / n
    E = np.stack([np.cos(ph), np.sin(ph), np.zeros(n)], -1)
    ph0 = math.radians(-28)
    Z = 0.222 + 0.158 * np.cos(ph - ph0)
    O = np.stack([np.zeros(n), np.full(n, -0.01), Z], -1)
    S = ray_exit(torso_f, O, E, 0.5)
    Nn = unit_normals(torso_f, S)
    C = S + Nn * 0.006
    T = np.roll(C, -1, 0) - np.roll(C, 1, 0); T /= L(T)[:, None]
    def frame(i, T_):
        N_ = Nn[i] - (Nn[i] @ T_) * T_; N_ = nrm(N_); return N_, np.cross(T_, N_)
    V, F, A = loop_tube(C, 6, lambda i: (0.015, 0.050), frame=frame, expo=3.0)
    return Piece('kesa', V, F, A=A, paint=keyed('kesa'), orient=None, nsdf=None, occluder=False)

def build_body_items(v):
    beads, front, rb = build_beads(v)
    P = [build_torso(), build_foot(-1), build_foot(1), tag(build_tail(), torso_f), tag(build_upper_arm(-1), torso_f), tag(build_upper_arm(1), torso_f)] + beads + build_tassel(front)
    if v.get('elder'): P.append(build_kesa())
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== paws
ELBOW_X, ELBOW_R = 0.100, 0.046
def fist_c(k): return np.array([k * 0.049, -0.242, 0.328])
def fist_f_k(k):
    c = fist_c(k)
    def f(p):
        d = sd_ell(p, c, (0.050, 0.045, 0.047))
        for j in range(3):   # three curled knuckles across the top front
            q = c + np.array([k * (-0.025 + 0.022 * j), -0.031, 0.022 - 0.003 * j])
            d = smin(d, sd_sph(p, q, 0.019), 0.010)
        return d
    return f, c
def build_paw(k):
    e = np.array([k * ELBOW_X, PAWP[1], PAWP[2]])
    fe = (lambda c_: (lambda p: sd_sph(p, c_, ELBOW_R)))(e)
    rows = star_rows(fe, e, [k, 0, 0], [0, 0, 1], np.radians([0, 50, 90, 130, 180]), 8, 0.2)
    V, F = rows_mesh(rows); elbow = Piece(f'elbow{k}', V, F, sdf=fe, paint=keyed('fur'))
    w = np.array([k * 0.062, -0.232, 0.346])

    V, F, A, _ = sweep([e, .5 * (e + w) + np.array([k * 0.004, -0.004, 0]), w], 3, 8, lambda s: (0.042 - 0.004 * s,) * 2,
                       [1, 0, 0], caps=(False, False))
    fore = Piece(f'fore{k}', V, F, A=A, paint=keyed('fur'), orient=seg_orient(e, w), occluder=False)
    f, c = fist_f_k(k)
    rows = star_rows(f, c, [0, -0.6, 0.8], [0, 0, 1], np.radians([0, 34, 68, 104, 180]), 12, 0.2)
    V, F = rows_mesh(rows); fist = Piece(f'fist{k}', V, F, sdf=f, paint=keyed('pink'))
    return [elbow, fore, fist]

SCROLL_Y, SCROLL_Z = -0.246, 0.290
SCROLL_PROF = [(0.0, -0.150), (0.017, -0.148), (0.022, -0.138), (0.040, -0.130), (0.040, -0.112), (0.034, -0.106),
               (0.034, 0.106), (0.040, 0.112), (0.040, 0.130), (0.022, 0.138), (0.017, 0.148), (0.0, 0.150)]
def build_scroll():
    """sutra: a rolled sutra scroll held across the paws (a lathe along X): cream paper, dark wooden rollers and knobs"""
    V, F, A = lathe(SCROLL_PROF, 10, 0.5)
    V = np.stack([V[:, 2], SCROLL_Y + V[:, 1], SCROLL_Z + V[:, 0]], -1)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'roller', dtype=object); o[(Ac[:, 3] > 5.0) & (Ac[:, 3] < 6.0)] = 'scroll'; return o
    return [Piece('scroll', V, F, A=A, paint=paint, orient=seg_orient((-0.15, SCROLL_Y, SCROLL_Z), (0.15, SCROLL_Y, SCROLL_Z)))]

def build_paw_items(v):
    P = build_paw(-1) + build_paw(1)
    if v.get('scroll'): P += build_scroll()
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== the dirt mound
MLUMPS = [(0.00, 0.20, 0.20, 0.13), (1.20, 0.22, 0.16, 0.11), (2.40, 0.22, 0.14, 0.12), (3.50, 0.20, 0.17, 0.11),
          (4.60, 0.24, 0.13, 0.11), (5.60, 0.20, 0.16, 0.12)]
def mound_f(p):
    d = sd_ell(p, (0.0, 0.0, 0.0), (0.330, 0.315, 0.262))
    d = smin(d, sd_ell(p, (0.0, 0.0, 0.0), (0.445, 0.430, 0.075)), 0.09)
    for a, r, z, s in MLUMPS:
        d = smin(d, sd_ell(p, (r * math.cos(a), r * math.sin(a), z), (s * 1.05, s, s * 0.85)), 0.04)
    return smax(d, -p[..., 2], 0.012)
def build_mound_dome():
    th = np.radians([0, 16, 32, 47, 61, 73, 83, 88.5, 180])
    rows = star_rows(mound_f, np.array([0, 0, 0.03]), [0, 0, 1], [1, 0, 0], th, 20, 0.8)
    V, F = rows_mesh(rows)
    def f_rim(P): return P[:, 2] - 0.030
    def paint(ins, Ac):
        o = np.full(len(Ac), 'soil', dtype=object); o[ins['rim']] = 'soildk'; return o
    return Piece('dome', V, F, sdf=mound_f, fields={'rim': f_rim}, paint=paint)
def hit_down(x, y):
    O = np.array([[x, y, 0.6]]); D = np.array([[0, 0, -1.0]])
    ts = np.linspace(0, 0.7, 700); v = mound_f(O + D * ts[:, None]); k = int(np.argmax(v < 0))
    lo, hi = ts[k - 1], ts[k]
    for _ in range(40):
        m = .5 * (lo + hi)
        if mound_f(O + D * m)[0] < 0: hi = m
        else: lo = m
    return (O + D * lo)[0]
CLODS = [(0.35, 0.44, 0.064, 'clod'), (1.75, 0.46, 0.056, 'clod2'), (3.05, 0.44, 0.068, 'clod'),
         (4.40, 0.45, 0.060, 'clod2')]
def build_clods():
    out = []
    for i, (a, r, s, key) in enumerate(CLODS):
        x, y = r * math.cos(a), r * math.sin(a)
        z = hit_down(x, y)[2] if r < 0.40 else 0.0
        c = np.array([x, y, z + s * 0.35])
        R = rot([0, 0, 1], a * 1.7 + i)
        f = (lambda c_, s_, R_: (lambda p: smax(smin(sd_ell(p, c_, (s_ * 1.15, s_ * 0.95, s_ * 0.78), R_),
                                                     sd_ell(p, c_ + R_ @ np.array([s_ * 0.45, s_ * 0.2, s_ * 0.25]), (s_ * 0.6, s_ * 0.55, s_ * 0.5), R_), 0.02),
                                                -p[..., 2], 0.006)))(c, s, R)
        rows = star_rows(f, c, [0, 0, 1], [1, 0, 0], np.radians([0, 50, 100, 180]), 9, 0.2)
        V, F = rows_mesh(rows)
        out.append(Piece(f'clod{i}', V, F, sdf=f, paint=keyed(key)))
    return out
LEAVES = [(0.55, 0.160, 0.100, 'leafA', 0.4), (2.55, 0.245, 0.092, 'leafB', 1.9), (4.35, 0.215, 0.098, 'leafC', 3.3)]
def build_leaves():
    """maple leaves lying on the soil, broad face up: a five-lobed (rounded lobes) slab, its rim tucked into the soil"""
    out = []
    for i, (a, r, R0, key, spin) in enumerate(LEAVES):
        x, y = r * math.cos(a), r * math.sin(a); s = hit_down(x, y)
        n = unit_normals(mound_f, s[None])[0]
        t0 = nrm(np.cross(n, [math.cos(spin), math.sin(spin), 0])); t1 = np.cross(n, t0)
        nseg = 15; ph = 2 * PI * np.arange(nseg) / nseg + spin
        Rf = R0 * (0.70 + 0.30 * np.cos(5 * ph)) * (1 - 0.12 * np.cos(ph))
        rows = [(s + n * 0.016)[None]]
        for f, h in ((0.80, 0.015), (1.02, -0.010)):

            P = s + (f * Rf * np.cos(ph))[:, None] * t0 + (f * Rf * np.sin(ph))[:, None] * t1
            Q = np.array([hit_down(q[0], q[1]) for q in P]); nn = unit_normals(mound_f, Q)
            rows.append(Q + nn * h)
        rows.append((s - n * 0.02)[None])
        V, F = rows_mesh(rows)
        out.append(Piece(f'leaf{i}', V, F, paint=keyed(key), occluder=False))
    return out
def build_mound_items(v):
    items = [process(p) for p in [build_mound_dome()] + build_clods() + build_leaves()]
    cull_buried(items)
    return items

# =========================================================================================== assemble
def palette(v):
    pal = dict(COMMON); pal.update({k: x for k, x in v.items() if isinstance(x, str)})
    pal['fur_sh'] = mulhex(pal['fur'], 0.80)
    pal['fur_hi'] = pal['furhi']
    pal['belly_sh'] = mulhex(pal['belly'], 0.90)
    pal['pink_sh'] = mulhex(pal['pink'], 0.86)
    pal['tail_sh'] = mulhex(pal['tail'], 0.86)
    pal['bead_hi'] = lighten(pal['bead'], 0.22)
    pal['bead_sh'] = mulhex(pal['bead'], 0.80)
    pal['tasseldk'] = mulhex(pal['tassel'], 0.80)
    pal['tooth_sh'] = mulhex(pal['tooth'], 0.80)
    pal['soil_hi'] = '#93714a'
    pal['soil_sh'] = mulhex(pal['soil'], 0.85)
    pal['kesa_sh'] = mulhex(pal['kesa'], 0.85)
    pal['elderbrow_sh'] = mulhex(pal['elderbrow'], 0.80)
    return pal

def export(fn):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, fn + '.glb'), export_format='GLB', export_apply=True,
                              export_yup=True, export_attributes=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_texcoords=False,
                              export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_materials='EXPORT')

def build_variant(vname):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    np.random.seed(7)
    v = VARIANTS[vname]; pal = palette(v)
    parts = {'body': (build_body_items(v), np.zeros(3)), 'head': (build_head_items(v), NECK),
             'paws': (build_paw_items(v), PAWP), 'mound': (build_mound_items(v), np.zeros(3))}
    obs = [make_object(n, its, pal, o) for n, (its, o) in parts.items()]
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['pieces'] = {it['name']: len(it['T']) for its, _ in parts.values() for it in its}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    fn = 'tesso' + ('' if vname == 'base' else '_' + vname)
    if vname == 'base':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'tesso.blend'))
    export(fn)
    print('TESSO', vname, json.dumps(stats))
    return stats

if __name__ == '__main__':
    names = list(VARIANTS) if WANT == 'all' else [WANT]
    allstats = {}
    for n in names:
        allstats[n] = build_variant(n)
    os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
    with open(os.path.join(TASK_DIR, 'work', 'build_stats.json' if WANT == 'all' else f'build_stats_{WANT}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=1)
