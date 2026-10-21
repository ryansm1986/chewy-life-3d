"""Master Tengu (Whispering Bamboo Grove boss, EN-1) + his Crow Disciple (karasu-kozo): deterministic build.
Option A "Wind Master" (refs/sheet.png).

Blender 4.3:
  blender --background --factory-startup --python build_tengu-master.py [-- --what master|kozo|all]

Builds from an empty scene, saves tengu-master.blend and exports public/models/tengu-master.glb,
karasu-kozo.glb (robe #ece2ca) and karasu-kozo_blue.glb (robe #dfe8f4).
Units: model units (the game scales the tengu x2.3, the disciple x1). Front = -Y, ground z = 0, L = -X, R = +X.

Boss contract (tools/blender/work/codex/boss-contract.md): flat rigid named parts (origin = pivot, rotation 0,
scale 1), vertex colours only (face-corner `Col`), one `toon` material, markers as empties.
  tengu-master: body (0,0,0) | head (0,-0.02,0.72) | jaw (0,-0.192,0.805) | lids (head pivot)
                fanArm (0.19,0,0.645) | wingL (-0.1,0.14,0.63) | wingR (0.1,0.14,0.63) | empty fanTip
  karasu-kozo:  body (0,0,0) | wingL (-0.16,0.08,0.36) | wingR (0.16,0.08,0.36)

Technique: the approved enemies' framework (build_kappa.py): implicit surfaces (smooth unions of ellipsoids /
capsules) sampled as star-shaped grids, parametric sweeps, colour borders cut into the mesh as level-set contours,
face features as decal shells on the head, buried faces culled per part.
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/tengu-master'
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
WANT = arg('--what', 'all')
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


# =========================================================================================== tengu helpers
def sd_rcone(p, a, b, r1, r2):
    """a tapered capsule a -> b (radius r1 -> r2): a sleeve, a limb"""
    a = np.asarray(a, float); ba = np.asarray(b, float) - a; pa = p - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return L(pa - h[..., None] * ba) - (r1 + (r2 - r1) * h)

def frame_from(n, up):
    """orthonormal (U, V, N): N = n, V = up made normal to n, U = V x N"""
    n = nrm(n); v = np.asarray(up, float); v = nrm(v - (v @ n) * n); u = np.cross(v, n)
    return u, v, n

def star_piece(name, f, centre, axis, ref, thetas_deg, nseg, tmax, key=None, fields=None, paint=None, lenses=(), refine=()):
    rows = star_rows(f, np.asarray(centre, float), axis, ref, np.radians(thetas_deg), nseg, tmax, lenses=lenses)
    V, F = rows_mesh(rows)
    return Piece(name, V, F, sdf=f, fields=fields, paint=paint or keyed(key), refine=refine)

def sweep_piece(name, ctrl, nr, nseg, prof, side, key, cap_rings=2, expo=2.0):
    V, F, A, _ = sweep([np.asarray(c, float) for c in ctrl], nr, nseg, prof, side, expo=expo, caps=(True, True), cap_rings=cap_rings)
    return Piece(name, V, F, A=A, paint=keyed(key), occluder=False)

def rbox(name, c, h, r, key, fields=None, paint=None, ninner=2):
    """rounded box (half sizes h, corner radius r) as a cube-sphere grid: flat faces, rounded edges"""
    c = np.asarray(c, float); h = np.asarray(h, float)
    def axis_pos(hh):
        if ninner < 0: return np.array([-hh, -(hh - r), hh - r, hh])
        inner = list(np.linspace(-(hh - r), hh - r, ninner + 2))
        return np.array([-hh, -hh + r * 0.38] + inner + [hh - r * 0.38, hh])
    V, F = [], []
    for ax in range(3):
        for sgn in (-1, 1):
            a1, a2 = [i for i in range(3) if i != ax]
            P1, P2 = axis_pos(h[a1]), axis_pos(h[a2]); base = len(V)
            for x1 in P1:
                for x2 in P2:
                    q = np.zeros(3); q[ax] = sgn * h[ax]; q[a1] = x1; q[a2] = x2
                    inn = np.clip(q, -(h - r), h - r); d = q - inn; ln = np.linalg.norm(d)
                    V.append(c + inn + (d / ln * r if ln > 1e-12 else 0))
            n2 = len(P2)
            for i in range(len(P1) - 1):
                for j in range(n2 - 1):
                    a, b, cc, dd = base + i * n2 + j, base + (i + 1) * n2 + j, base + (i + 1) * n2 + j + 1, base + i * n2 + j + 1
                    F.append((a, b, cc, dd) if sgn > 0 else (a, dd, cc, b))
    return Piece(name, np.array(V), F, fields=fields, paint=paint or keyed(key), occluder=False)

def hexcap(name, c, R, h, key, nc=4):
    """the tokin: a rounded hexagonal prism (a corner to the front) with a low pyramid top"""
    c = np.asarray(c, float)
    def ring(rad, z, rr=0.18):
        pts = []
        for i in range(6):
            a0 = -PI / 2 + i * PI / 3                       # corner i (i = 0: the front, -Y)
            cn = np.array([math.cos(a0), math.sin(a0)]) * rad
            nx = np.array([math.cos(a0 + PI / 3), math.sin(a0 + PI / 3)]) * rad
            pv = np.array([math.cos(a0 - PI / 3), math.sin(a0 - PI / 3)]) * rad
            A_ = cn + (pv - cn) * rr; B_ = cn + (nx - cn) * rr
            for s in np.linspace(0, 1, nc):                 # the rounded corner: a quadratic Bezier
                q = (1 - s) ** 2 * A_ + 2 * (1 - s) * s * cn + s * s * B_
                pts.append([q[0], q[1], z])
        return np.array(pts) + c
    rows = [c[None] + 0.0, ring(R * 0.80, 0.0), ring(R * 0.97, 0.006), ring(R, 0.016), ring(R, h * 0.55), ring(R, h - 0.010),
            ring(R * 0.96, h - 0.002), ring(R * 0.62, h + 0.020), ring(R * 0.26, h + 0.036), c[None] + np.array([[0, 0, h + 0.043]])]
    V, F = rows_mesh(rows)
    return Piece(name, V, F, paint=keyed(key), occluder=False)

def rope_ring(name, c, R, r, key, n=60, m=8, twists=13, amp=0.22):
    """a twisted rope ring (the tokin's cord): a torus whose tube radius rides a helix"""
    c = np.asarray(c, float); V = []
    for i in range(n):
        t = 2 * PI * i / n; e = np.array([math.cos(t), math.sin(t), 0.0])
        for j in range(m):
            ph = 2 * PI * j / m; rr = r * (1 + amp * math.cos(2 * ph - twists * t))
            V.append(e * (R + rr * math.cos(ph)) + np.array([0, 0, rr * math.sin(ph)]))
    V = np.array(V) + c; F = []
    for i in range(n):
        for j in range(m):
            a = i * m + j; b = ((i + 1) % n) * m + j; cc = ((i + 1) % n) * m + (j + 1) % m; d = i * m + (j + 1) % m
            F.append((a, b, cc, d))
    return Piece(name, V, F, paint=keyed(key), occluder=False)

# ------------------------------------------------------------------ faces (generic: one face dict per character)
SKIRT = (0.0045, -0.0022)
def face_setup(hsdf, xs, z, fwd=0.12):
    eyes = {}
    for k in (-1, 1):
        pe = hit_front(hsdf, k * xs, z); n = unit_normals(hsdf, pe[None])[0]
        A_ = nrm(n * (1 - fwd) + np.array([0, -1.0, 0]) * fwd)
        U_ = nrm(np.cross([0, 0, 1], A_)); V_ = np.cross(A_, U_)
        eyes[k] = (pe, A_, U_, V_)
    return eyes

def on_surf(sdf, pe, U_, V_, u, v, off):
    P = pe + u[:, None] * U_ + v[:, None] * V_
    P = project(sdf, P, 4); n = unit_normals(sdf, P)
    return P + n * off

def exit2(f, c, ang, tmax=0.2):
    d = np.stack([np.cos(ang), np.sin(ang)], -1); lo = np.zeros(len(ang)); hi = np.full(len(ang), tmax)
    assert (f(c[0] + d[:, 0] * tmax, c[1] + d[:, 1] * tmax) > 0).all()
    for _ in range(40):
        m = .5 * (lo + hi); ins = f(c[0] + d[:, 0] * m, c[1] + d[:, 1] * m) < 0
        lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return .5 * (lo + hi)

def build_eye(Fc, k, name):
    """big glossy eye: cream white, brown iris (dark top, warm bottom), dark pupil, two catchlights, a dark rim"""
    sdf = Fc['sdf']; pe, A_, U_, V_ = Fc['eyes'][k]; EX, EY = Fc['EX'], Fc['EY']; I = Fc['iris']
    cu, cv = I['du'] * k, I['dv']; c2 = np.array([cu, cv])
    nseg = Fc.get('nseg', 14); ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    dark2 = lambda u, v: smin(ell2(u, v, EX + 0.0055, EY + 0.0055), np.maximum(ell2(u, v - 0.004, EX + 0.0065, EY + 0.0095), -(v + 0.012)), 0.004)
    open2 = lambda u, v: ell2(u, v, EX, EY)
    iris2 = lambda u, v: ell2(u - cu, v - cv, I['ru'], I['rv'])
    r_dark = exit2(dark2, c2, ang); r_open = np.minimum(exit2(open2, c2, ang), r_dark - 0.004)
    r_iris_t = exit2(iris2, c2, ang); white = r_open - r_iris_t > 0.003
    r_iris = np.where(white, r_iris_t, r_open - 0.0015)
    rows, att = [], []
    def row(rad, off, band, w):
        u = c2[0] + rad * np.cos(ang); v = c2[1] + rad * np.sin(ang)
        rows.append(on_surf(sdf, pe, U_, V_, u, v, off))
        att.append(np.stack([np.full(nseg, band), np.asarray(w, float) * np.ones(nseg), u, v], -1))
    rows.append(on_surf(sdf, pe, U_, V_, np.array([c2[0]]), np.array([c2[1]]), 0.0016)); att.append(np.array([[0.0, 0.0, c2[0], c2[1]]]))
    row(np.full(nseg, I['pr'] * 0.55), 0.0016, 0.25, 0)
    row(np.full(nseg, I['pr'] * 1.15), 0.0016, 0.5, 0)
    row(r_iris * 0.82, 0.0016, 1.5, 0)
    row(r_iris, 0.0016, 2, white)
    row(r_open, 0.0016, 3, white)
    row(r_dark, 0.0016, 4, 0)
    row(r_dark + SKIRT[0], SKIRT[1], 5, 0)
    V, F = rows_mesh(rows); A = np.concatenate(att)
    ck = I['catch']
    def f_low(P): u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (I['low'] + 2.2 * u * u)
    def f_pup(P): return np.hypot(P[:, 5] - cu, P[:, 6] - cv) - I['pr']
    def f_cl(P): return np.hypot(P[:, 5] - cu - ck[0] * k, P[:, 6] - cv - ck[1]) - ck[2]
    def f_cs(P): return np.hypot(P[:, 5] - cu - ck[3] * k, P[:, 6] - cv - ck[4]) - ck[5]
    def paint(ins, Ac):
        b, w = Ac[:, 3], Ac[:, 4]
        o = np.full(len(Ac), 'eye', dtype=object)
        o[(b > 2) & (b < 3) & (w > 0.999)] = 'eyewhite'
        ir = b < 2.0001
        o[ir] = 'iristop'; o[ir & ins['low']] = 'iris'; o[ir & ins['pup']] = 'pupil'
        o[ir & (ins['cl'] | ins['cs'])] = 'catch'
        o[b > 4.0001] = Fc['skin']
        return o
    return Piece(name, V, F, A=A, fields={'pup': f_pup, 'low': f_low, 'cl': f_cl, 'cs': f_cs}, paint=paint,
                 nsdf=sdf, orient=lambda P: unit_normals(sdf, P[:, :3]))

def build_patch(Fc, centre, ru, rv, key, name, rings=(0.5, 1.0), off=0.0012, nseg=10, up=(0, 0, 1)):
    """an oval decal lying on the face (blush), its skirt sinking under the surface"""
    sdf = Fc['sdf']; pc_ = project(sdf, np.asarray(centre, float)[None], 4)[0]
    n0 = unit_normals(sdf, pc_[None])[0]; U_, V_, _ = frame_from(n0, up)
    ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [pc_[None] + n0 * off], [np.array([[0.0]])]
    for x in list(rings) + [1.0 + SKIRT[0] / min(ru, rv)]:
        h = off if x <= 1.0 else SKIRT[1]
        P = pc_ + (ru * x * np.cos(ang))[:, None] * U_ + (rv * x * np.sin(ang))[:, None] * V_
        P = project(sdf, P, 3); rows.append(P + unit_normals(sdf, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), key, dtype=object); o[Ac[:, 3] > 1.0001] = Fc['skin']; return o
    return Piece(name, V, F, A=A, paint=paint, nsdf=sdf, orient=lambda P: unit_normals(sdf, P[:, :3]))

def build_lid(Fc, k, name):
    """closed eyelid (meditation): a crow-dark shell just over the eye with a cream closed-eye arc"""
    sdf = Fc['sdf']; pe, A_, U_, V_ = Fc['eyes'][k]; EX, EY = Fc['EX'] + 0.010, Fc['EY'] + 0.012
    nseg = 16; ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    rows, att = [on_surf(sdf, pe, U_, V_, np.array([0.0]), np.array([0.0]), 0.0070)], [np.array([[0.0, 0.0, 0.0]])]
    for x, off in ((0.35, 0.0070), (0.7, 0.0066), (0.88, 0.0057), (1.0, 0.0040), (1.0 + SKIRT[0] / EX, SKIRT[1])):
        u = EX * x * np.cos(ang); v = EY * x * np.sin(ang)
        rows.append(on_surf(sdf, pe, U_, V_, u, v, off)); att.append(np.stack([np.full(nseg, x), u, v], -1))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    s = Fc['EX'] / 0.055
    pts = np.array([(-0.042, 0.004), (-0.021, -0.010), (0.0, -0.015), (0.021, -0.010), (0.042, 0.004)]) * s
    def f_arc(P): return stroke(P[:, 4], P[:, 5], pts, 0.0040 * s, 0.0072 * s)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'lid', dtype=object); o[ins['arc']] = 'lidline'; o[Ac[:, 3] > 1.0001] = Fc['skin']; return o
    return Piece(name, V, F, A=A, fields={'arc': f_arc}, paint=paint, refine=[(('arc',), 0.006, 0.006)],
                 nsdf=sdf, orient=lambda P: unit_normals(sdf, P[:, :3]))

# =========================================================================================== MASTER TENGU
# palette (sRGB hex): the sheet's swatches, a few derived shades
PAL_T = {
    'crow': '#222838', 'ruff': '#222838', 'cap': '#1d202c', 'rope': '#3b4583',
    'robe': '#f6f0df', 'lapel': '#d8ccb0', 'cuff': '#cbb994', 'fold': '#e4d9c1', 'sleevein': '#a5967a',
    'vest': '#3a4479', 'hakama': '#353e73', 'bow': '#414b88', 'pom': '#f8f2e2',
    'beak': '#e4b63b', 'beaklo': '#d9a531', 'mouth': '#8e3c4c', 'tongue': '#e5848e',
    'eye': '#1d1f2b', 'pupil': '#1a1c28', 'iristop': '#4a2e1f', 'iris': '#7a4c2c', 'eyewhite': '#fbf3e4', 'catch': '#ffffff',
    'blush': '#e98c91', 'brow': '#f6f0df', 'lid': '#262c3e', 'lidline': '#f6f0df',
    'geta': '#8c5e3c', 'getatop': '#a77548', 'getadk': '#6e4529', 'strap': '#353e73', 'hand': '#222838',
    'wingcov': '#2f3e62', 'wing': '#405a80', 'wing2': '#39507a', 'tailf': '#2f3e62',
    'handle': '#8c5e3c', 'hub': '#e4b63b', 'hubdk': '#c9962b', 'petal': '#f6f0df', 'fan': '#3d547d', 'fan2': '#34496f',
}
def pal_t():
    p = dict(PAL_T)
    for k in ('robe', 'hakama', 'vest', 'cuff', 'pom', 'bow', 'beak'):
        p[k + '_sh'] = mulhex(p[k], 0.84)
    p['crow_sh'] = mulhex(p['crow'], 0.9)
    return p

HEAD_P = np.array([0.0, -0.02, 0.72]); JAW_P = np.array([0.0, -0.192, 0.805])
FAN_P = np.array([0.19, 0.0, 0.645]); WING_P = {-1: np.array([-0.1, 0.14, 0.63]), 1: np.array([0.1, 0.14, 0.63])}

# ------------------------------------------------------------------ head
HC = np.array([0.0, -0.005, 0.885]); HR = (0.205, 0.192, 0.172)
def head_base(p):
    d = sd_ell(p, HC, HR)
    d = smin(d, sd_ell(p, (0.0, -0.07, 0.785), (0.165, 0.13, 0.07)), 0.05)        # full lower face (jowls)
    for k in (-1, 1):                                                              # fluffy cheek scallops
        for c, r in (((k * 0.196, -0.035, 0.835), 0.034), ((k * 0.172, 0.035, 0.79), 0.034),
                     ((k * 0.15, -0.10, 0.772), 0.030), ((k * 0.20, 0.06, 0.88), 0.030)):
            d = smin(d, sd_sph(p, c, r), 0.012)
    for c, r in (((0.0, 0.16, 0.99), 0.040), ((0.07, 0.165, 0.95), 0.035), ((-0.07, 0.165, 0.95), 0.035),
                 ((0.0, 0.18, 0.90), 0.035)):                                      # feather tufts at the back
        d = smin(d, sd_sph(p, c, r), 0.012)
    return d

T_EX, T_EY = 0.060, 0.064
_EY0 = face_setup(head_base, 0.096, 0.905)
def head_sdf(p):
    d = head_base(p)
    for k in (-1, 1):
        pe, A_, U_, V_ = _EY0[k]
        d = smin(d, sd_ell(p, pe - A_ * 0.020, (T_EX * 1.04, T_EY * 1.04, 0.027), np.stack([U_, V_, A_], 1)), 0.014)
    return d
FACE_T = dict(sdf=head_sdf, eyes=face_setup(head_sdf, 0.096, 0.905), EX=T_EX, EY=T_EY, skin='crow',
              iris=dict(du=-0.006, dv=-0.002, ru=0.047, rv=0.052, pr=0.025, low=-0.007,
                        catch=(-0.015, 0.021, 0.0135, 0.019, -0.025, 0.0062)))

def head_surf(x, z, off=0.0):
    p = hit_front(head_base, x, z); return p + unit_normals(head_base, p[None])[0] * off

def build_brows_t():
    P = []
    for k in (-1, 1):
        S = [head_surf(k * 0.036, 0.966, 0.010), head_surf(k * 0.090, 0.984, 0.012), head_surf(k * 0.140, 0.998, 0.010)]
        side = unit_normals(head_base, S[1][None])[0]
        P.append(sweep_piece(f'brow{k}', S, 7, 10, lambda s: (0.024 + 0.008 * math.sin(PI * min(1, s * 1.3)), 0.020), side, 'brow'))
        base = head_surf(k * 0.125, 0.990, 0.004)
        tip = np.array([k * 0.208, -0.060, 1.028]); mid = base * 0.45 + tip * 0.55 + np.array([0, 0, -0.004])
        P.append(sweep_piece(f'tuft{k}', [base, mid, tip], 6, 10, lambda s: (0.036 - 0.012 * s, 0.025 - 0.006 * s), [0, -1, 0], 'brow'))
        for j, (x, z) in enumerate(((0.062, 0.957), (0.112, 0.973), (0.160, 0.985))):   # feathery scallops under the brow
            c = head_surf(k * x, z, 0.010)
            f = (lambda c_: (lambda p: sd_sph(p, c_, 0.019)))(c)
            P.append(star_piece(f'browf{k}{j}', f, c, unit_normals(head_base, c[None])[0], [0, 0, 1], [0, 45, 90, 135, 180], 10, 0.1, key='brow'))
    return P

def beak_up_f(p):
    d = sd_ell(p, (0.0, -0.195, 0.875), (0.046, 0.06, 0.054))
    d = smin(d, sd_cap(p, (0.0, -0.212, 0.912), (0.0, -0.298, 0.850), 0.026), 0.035)
    d = smin(d, sd_ell(p, (0.0, -0.238, 0.862), (0.078, 0.062, 0.030)), 0.03)
    d = smin(d, sd_sph(p, (0.0, -0.312, 0.820), 0.017), 0.03)
    zc = 0.808 + 0.62 * np.abs(p[..., 0])                              # the gape: a V under the hooked tip
    return smax(d, zc - p[..., 2], 0.008)
def mouth_f(p): return sd_ell(p, (0.0, -0.222, 0.826), (0.064, 0.056, 0.040))
def jaw_f(p):
    return smax(sd_ell(p, (0.0, -0.250, 0.788), (0.066, 0.074, 0.030)), p[..., 2] - 0.801, 0.006)

def build_head_items_t():
    P = [star_piece('skull', head_sdf, (0, -0.01, 0.88), [0, -1, 0], [0, 0, 1],
                    [0, 9, 18, 27, 37, 47, 58, 70, 82, 95, 109, 124, 140, 158, 180], 44, 0.6, key='crow',
                    lenses=[(nrm(FACE_T['eyes'][k][0] - np.array([0, -0.01, 0.88])), 0.32, 0.6) for k in (-1, 1)])]
    P += [build_eye(FACE_T, k, f'eye{k}') for k in (-1, 1)]
    P += [build_patch(FACE_T, (k * 0.150, -0.15, 0.857), 0.030, 0.019, 'blush', f'blush{k}') for k in (-1, 1)]
    P += build_brows_t()
    P.append(star_piece('beak', beak_up_f, (0, -0.245, 0.868), [0, -1, 0], [0, 0, 1], [0, 20, 40, 60, 80, 100, 122, 146, 180], 20, 0.3, key='beak'))
    P.append(star_piece('mouth', mouth_f, (0, -0.222, 0.832), [0, 0, 1], [0, -1, 0], [0, 40, 80, 120, 180], 12, 0.2, key='mouth'))
    P.append(hexcap('tokin', (0.0, 0.0, 1.040), 0.052, 0.068, 'cap', nc=3))
    P.append(rope_ring('rope', (0.0, 0.0, 1.050), 0.064, 0.0155, 'rope', n=44, m=6, twists=11))
    items = [process(p) for p in P]
    cull_buried(items)
    return items

def build_jaw_items_t():
    tg = lambda P: ell2(P[:, 0], P[:, 1] + 0.252, 0.046, 0.054)
    top = lambda P: 0.795 - P[:, 2]
    def paint(ins, Ac):
        o = np.full(len(Ac), 'beaklo', dtype=object); o[ins['tg'] & ins['top']] = 'tongue'; return o
    P = [star_piece('jaw', jaw_f, (0, -0.250, 0.785), [0, 0, 1], [0, -1, 0], [0, 25, 50, 70, 90, 110, 135, 160, 180], 18, 0.2,
                    fields={'tg': tg, 'top': top}, paint=paint)]
    return [process(p) for p in P]

def build_lid_items_t():
    return [process(build_lid(FACE_T, k, f'lid{k}')) for k in (-1, 1)]

# ------------------------------------------------------------------ body
TC = np.array([0.0, -0.04, 0.615]); TRD = (0.245, 0.215, 0.19)
def torso_f(p): return sd_ell(p, TC, TRD)
def hak_f(p):
    d = sd_ell(p, (0.0, -0.035, 0.43), (0.285, 0.265, 0.15))
    for k in (-1, 1): d = smin(d, sd_ell(p, (k * 0.14, -0.035, 0.315), (0.162, 0.24, 0.125)), 0.06)
    return d
def body_f(p): return smin(torso_f(p), hak_f(p), 0.05)
WAIST = 0.565

def vest_field(P):
    x, y = np.abs(P[:, 0]), P[:, 1] - TC[1]
    a = np.arctan2(x, -y)
    f1 = np.maximum(0.86 - a, a - 1.45); f2 = np.maximum(2.10 - a, a - 2.55)          # front: cream to |a| 0.86 (the pompom sashes sit on the edge)
    return np.minimum(f1, f2) * 0.2
LAPEL = [np.array([(-0.120, 0.785), (0.0, 0.585)]), np.array([(0.120, 0.785), (0.025, 0.630)])]
def lapel_field(P):
    d = np.minimum(stroke(P[:, 0], P[:, 2], LAPEL[0], 0.008, 0.010), stroke(P[:, 0], P[:, 2], LAPEL[1], 0.008, 0.010))
    return np.maximum(d, P[:, 1] + 0.10)

def build_torso():
    fields = {'waist': lambda P: P[:, 2] - WAIST, 'vest': vest_field, 'lapel': lapel_field}
    def paint(ins, Ac):
        o = np.full(len(Ac), 'robe', dtype=object)
        o[ins['lapel']] = 'lapel'; o[ins['vest']] = 'vest'; o[ins['waist']] = 'hakama'
        return o
    return star_piece('torso', body_f, (0, -0.03, 0.47), [0, 0, 1], [0, -1, 0],
                      [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180], 36, 0.8,
                      fields=fields, paint=paint, refine=[(('vest', 'lapel'), 0.02, 0.03)])

def surf_pt(f, x, z, off=0.0):
    p = hit_front(f, x, z); return p + unit_normals(f, p[None])[0] * off, unit_normals(f, p[None])[0]

def build_pompoms():
    P = []
    for k in (-1, 1):
        for j, z in enumerate((0.715, 0.612, 0.505)):
            c, n = surf_pt(body_f, k * 0.196, z, 0.032)
            f = (lambda c_: (lambda p: sd_sph(p, c_, 0.053)))(c)
            P.append(star_piece(f'pom{k}{j}', f, c, n, [0, 0, 1], [0, 36, 72, 108, 144, 180], 12, 0.15, key='pom'))
    return P

def build_bow():
    P = []
    kc, kn = surf_pt(body_f, 0.0, 0.560, 0.016)
    f = lambda p: sd_ell(p, kc, (0.030, 0.022, 0.028))
    P.append(star_piece('knot', f, kc, [0, -1, 0], [0, 0, 1], [0, 35, 70, 110, 145, 180], 12, 0.1, key='bow'))
    for k in (-1, 1):
        lc, ln = surf_pt(body_f, k * 0.062, 0.566, 0.014)
        Rm = rot([0, -1, 0], k * 0.22)
        fl = (lambda c_, R_: (lambda p: sd_ell(p, c_, (0.054, 0.020, 0.032), R_)))(lc, Rm)
        P.append(star_piece(f'loop{k}', fl, lc, [0, -1, 0], [0, 0, 1], [0, 30, 60, 90, 120, 150, 180], 14, 0.12, key='bow'))
        t0, _ = surf_pt(body_f, k * 0.012, 0.548, 0.010); t1, _ = surf_pt(body_f, k * 0.038, 0.470, 0.012)
        t2, _ = surf_pt(body_f, k * 0.058, 0.395, 0.012)
        P.append(sweep_piece(f'tail{k}', [t0, t1, t2], 7, 10, lambda s: (0.022 + 0.004 * s, 0.011), [0, -1, 0], 'bow'))
    return P

def build_ruff():
    f = lambda p: sd_sph(p, (0.0, -0.02, 0.755), 0.13)
    return star_piece('ruff', f, (0.0, -0.02, 0.755), [0, 0, 1], [0, -1, 0], [0, 25, 50, 75, 100, 125, 150, 180], 20, 0.3, key='ruff')

def build_tailfeathers():
    P = []
    for i, dx in enumerate((-0.05, 0.0, 0.05)):
        a = np.array([dx * 0.8, 0.17, 0.49]); b = np.array([dx * 1.6, 0.30, 0.42 - abs(dx) * 0.3])
        P.append(sweep_piece(f'tailf{i}', [a, (a + b) / 2 + np.array([0, 0, 0.01]), b], 6, 10, lambda s: (0.030 - 0.006 * s, 0.012), [0, 0, 1], 'tailf'))
    return P

def sleeve_f(a):
    """a wide hanging kimono sleeve: tapered from the shoulder, its sleeve-bag hanging in a round bottom close to the body,
    the opening at the outer end (facing a['n'])"""
    S = np.asarray(a['S'], float); c = np.asarray(a['c'], float); O = np.asarray(a['C'], float); nc = nrm(a['n'])
    R = rot([0, 1, 0], a['tilt'])
    def f(p):
        q = (p - c) @ R
        d = sd_ell(q, (0, 0, 0), a['h'])                                   # the round-bottomed sleeve bag
        d = smin(d, sd_rcone(p, S, O, 0.070, 0.092), 0.05)                  # tapering out from the shoulder to the cuff
        return smax(d, (p - O) @ nc, 0.020)
    return f, nc

def build_sleeve(name, a):
    f, nc = sleeve_f(a)
    O = np.asarray(a['C'], float)
    trim = lambda P: -((P[:, :3] - O) @ nc + 0.040)                     # the cuff trim: a band round the opening
    def hole(P):
        q = P[:, :3] - (O + np.array([0, 0, -0.010])); t = q @ nc; rr = L(q - t[:, None] * nc); return np.maximum(rr - 0.060, -(t + 0.010))
    fa, fb = np.asarray(a['fold'][0], float), np.asarray(a['fold'][1], float)
    def fold(P):                                                           # one soft fold line down the sleeve front
        q = P[:, :3]; ab = fb - fa; t = np.clip(((q - fa) @ ab) / (ab @ ab), 0, 1)
        return L(q - (fa + t[:, None] * ab)) - (0.006 + 0.004 * np.sin(PI * t))
    def paint(ins, Ac):
        o = np.full(len(Ac), 'robe', dtype=object); o[ins['fold']] = 'fold'; o[ins['trim']] = 'cuff'; o[ins['hole']] = 'sleevein'; return o
    return star_piece(name, f, a['c'], nc, [0, 0, 1], [0, 16, 32, 48, 64, 80, 96, 112, 128, 146, 163, 180], 22, 0.5,
                      fields={'trim': trim, 'hole': hole, 'fold': fold}, paint=paint, lenses=[(nc, 0.7, 0.6)])

def hand_open_f(k, W, d, palm_n):
    """an open crow hand hanging from the cuff: palm + 3 sausage fingers + thumb, ball tips"""
    d = nrm(d); n = nrm(palm_n - (palm_n @ d) * d); s = np.cross(n, d)
    cp = W + d * 0.060
    def f(p):
        dd = sd_ell(p, cp, (0.042, 0.050, 0.028), np.stack([s, d, n], 1))
        dd = smin(dd, sd_cap(p, W - d * 0.05, cp, 0.030), 0.02)
        for a, ln in ((-0.42, 0.090), (0.0, 0.100), (0.42, 0.088)):
            fd = math.cos(a) * d + math.sin(a) * s
            dd = smin(dd, sd_cap(p, cp + fd * 0.030, cp + fd * ln + n * 0.012, 0.0185), 0.016)
        dd = smin(dd, sd_cap(p, cp - s * 0.02, cp - s * 0.050 + d * 0.035 - n * 0.025, 0.018), 0.016)
        return dd
    return f, cp

SLV_R = dict(S=(-0.200, -0.02, 0.655), c=(-0.292, 0.035, 0.548), h=(0.085, 0.140, 0.100), tilt=0.10,
             C=(-0.378, -0.040, 0.560), n=(-0.90, -0.20, -0.38),
             fold=((-0.268, -0.118, 0.640), (-0.300, -0.090, 0.470)))
def build_right_arm():
    a = SLV_R
    P = [build_sleeve('sleeveR', a)]
    C = np.array(a['C']); W = C + np.array([0.020, -0.004, -0.030])
    f, cp = hand_open_f(-1, W, [-0.22, -0.12, -1.0], np.array([1.0, -0.2, 0.0]))
    P.append(star_piece('handR', f, cp, [0, 0, -1], [0, -1, 0], [0, 16, 32, 48, 64, 80, 96, 112, 130, 150, 180], 22, 0.3, key='hand',
                        lenses=[(np.array([0, 0, -1.0]), 0.9, 0.5)]))
    return P

def build_feet():
    P = []
    for k in (-1, 1):
        x = k * 0.20
        P.append(sweep_piece(f'leg{k}', [(k * 0.165, -0.045, 0.235), (k * 0.185, -0.055, 0.175), (x, -0.065, 0.125)], 5, 12,
                             lambda s: (0.043, 0.043), [1, 0, 0], 'crow'))
        fc = np.array([x, -0.095, 0.124])
        def ff(p, fc=fc, x=x):
            d = sd_ell(p, fc, (0.056, 0.075, 0.030))
            for o in (-0.030, 0.0, 0.030):
                d = smin(d, sd_cap(p, (x + o, -0.125, 0.122), (x + o * 1.35, -0.182, 0.118), 0.0195), 0.015)
            return d
        P.append(star_piece(f'foot{k}', ff, fc, [0, -1, 0], [0, 0, 1], [0, 20, 40, 60, 80, 100, 120, 145, 180], 16, 0.2, key='crow',
                            lenses=[(np.array([0, -1.0, 0]), 0.9, 0.5)]))
        P.append(sweep_piece(f'strap{k}', [(x - 0.064, -0.070, 0.098), (x - 0.040, -0.082, 0.150), (x, -0.090, 0.163),
                                           (x + 0.040, -0.082, 0.150), (x + 0.064, -0.070, 0.098)], 7, 6, lambda s: (0.0135, 0.0135), [0, -1, 0], 'strap'))
        top = lambda P_: 0.0995 - P_[:, 2]
        def gpaint(ins, Ac):
            o = np.full(len(Ac), 'geta', dtype=object); o[ins['top']] = 'getatop'; return o
        P.append(rbox(f'geta{k}', (k * 0.205, -0.05, 0.083), (0.11, 0.152, 0.0175), 0.011, 'geta', fields={'top': top}, paint=gpaint, ninner=0))
        for j, yy in enumerate((-0.14, 0.045)):
            P.append(rbox(f'tooth{k}{j}', (k * 0.205, yy, 0.0345), (0.066, 0.018, 0.0345), 0.008, 'getadk', ninner=-1))
    return P

def build_body_items_t():
    P = [build_torso(), build_ruff()] + build_pompoms() + build_bow() + build_tailfeathers() + build_right_arm() + build_feet()
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# ------------------------------------------------------------------ fan arm (sleeve, claw hand gripping, the whole fan)
FAN = {}
def fan_frame():
    hd = nrm([0.42, 0.26, 1.0])                                    # the handle's axis: leaning out (the fan opens beside him) and back (its face tips up)
    hub = np.array([0.405, -0.192, 0.452]) + hd * 0.088                                    # the handle's axis: leaning out and back (the face tips up)
    n0 = np.array([0.25, -1.0, 0.30]); nf = nrm(n0 - (n0 @ hd) * hd)   # the fan faces front-out, tipped up to the camera
    sf = np.cross(hd, nf)
    fist = hub - hd * 0.088
    FAN.update(hub=hub, hd=hd, nf=nf, sf=sf, fist=fist, tip=hub + hd * 0.060 + nf * 0.020)
fan_frame()

def build_fan_pieces():
    hub, hd, nf, sf = FAN['hub'], FAN['hd'], FAN['nf'], FAN['sf']
    P = []
    R = np.stack([sf, hd, nf], 1)
    for i in range(9):                                             # paddle feathers fanned round the hub
        th = -2.26 + i * 4.52 / 8; dr = math.cos(th) * hd + math.sin(th) * sf
        Rf = np.stack([np.cross(dr, nf), dr, nf], 1); back = -nf * (0.010 + 0.006 * (i % 2))
        c1 = hub + dr * 0.150 + back; c2 = hub + dr * 0.232 + back
        f = (lambda c1_, c2_, R_: (lambda p: smin(sd_ell(p, c1_, (0.034, 0.105, 0.011), R_), sd_ell(p, c2_, (0.066, 0.064, 0.013), R_), 0.035)))(c1, c2, Rf)
        P.append(star_piece(f'feather{i}', f, hub + dr * 0.19 + back, nf, dr, [0, 60, 80, 87, 90, 93, 100, 120, 180], 12, 0.3,
                            key='fan' if i % 2 else 'fan2', lenses=[(dr, 0.9, 0.55), (-dr, 0.9, 0.55)]))
    for i in range(10):                                            # the daisy of cream petals
        th = i * 2 * PI / 10 + 0.13; dr = math.cos(th) * hd + math.sin(th) * sf
        Rp = np.stack([np.cross(dr, nf), dr, nf], 1); c = hub + dr * 0.084 + nf * 0.004
        f = (lambda c_, R_: (lambda p: sd_ell(p, c_, (0.020, 0.050, 0.009), R_)))(c, Rp)
        P.append(star_piece(f'petal{i}', f, c, nf, dr, [0, 45, 90, 135, 180], 10, 0.1, key='petal'))
    fh = lambda p: sd_ell(p, hub + nf * 0.012, (0.049, 0.049, 0.017), R)
    ring = lambda P_: L(P_[:, :3] - hub) - 0.030
    def hp(ins, Ac):
        o = np.full(len(Ac), 'hub', dtype=object); o[~ins['ring']] = 'hub'; return o
    P.append(star_piece('hub', fh, hub + nf * 0.012, nf, hd, [0, 25, 50, 75, 90, 105, 130, 155, 180], 16, 0.1, key='hub'))
    fb = lambda p: sd_ell(p, hub + nf * 0.028, (0.022, 0.022, 0.012), R)
    P.append(star_piece('boss', fb, hub + nf * 0.028, nf, hd, [0, 45, 90, 135, 180], 12, 0.1, key='hubdk'))
    tail = FAN['fist'] - hd * 0.105
    P.append(sweep_piece('handle', [tail, (tail + hub) / 2, hub - hd * 0.02], 6, 10, lambda s: (0.0175, 0.0175), sf, 'handle'))
    fk = lambda p: sd_sph(p, tail, 0.023)
    P.append(star_piece('knob', fk, tail, -hd, sf, [0, 45, 90, 135, 180], 10, 0.1, key='handle'))
    return P

def fist_f():
    fist, hd, nf, sf = FAN['fist'], FAN['hd'], FAN['nf'], FAN['sf']
    R = np.stack([sf, hd, nf], 1)
    def f(p):
        d = sd_ell(p, fist + nf * 0.006, (0.045, 0.048, 0.040), R)
        for j, t in enumerate((-0.030, -0.010, 0.010, 0.030)):      # knuckles curled round the handle (front)
            d = smin(d, sd_sph(p, fist + hd * t + nf * 0.030 - sf * 0.018, 0.0185), 0.012)
        d = smin(d, sd_cap(p, fist + hd * 0.020 - sf * 0.030 + nf * 0.010, fist + hd * 0.034 + nf * 0.034, 0.017), 0.012)  # thumb
        d = smin(d, sd_cap(p, np.array(SLV_F['C']) - np.array([0.01, -0.01, 0.0]), fist, 0.030), 0.02)              # wrist into the cuff
        return d
    return f

SLV_F = dict(S=(0.190, 0.0, 0.645), c=(0.292, 0.020, 0.548), h=(0.085, 0.140, 0.100), tilt=-0.10,
             C=(0.380, -0.090, 0.525), n=(0.62, -0.52, -0.58),
             fold=((0.262, -0.112, 0.640), (0.292, -0.090, 0.470)))
def build_fanarm_items_t():
    a = SLV_F
    P = [build_sleeve('sleeveF', a)]
    fs = lambda p: sd_sph(p, FAN_P, 0.070)
    P.append(star_piece('shoulderF', fs, FAN_P, [1, 0, 0], [0, 0, 1], [0, 30, 60, 90, 120, 150, 180], 14, 0.2, key='robe'))
    P.append(star_piece('fist', fist_f(), FAN['fist'], FAN['nf'], FAN['hd'], [0, 15, 30, 45, 60, 75, 90, 105, 120, 140, 160, 180], 18, 0.3, key='hand'))
    P += build_fan_pieces()
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# ------------------------------------------------------------------ wings (built pointing along k*X from the shoulder)
def build_wing_items_t(k):
    W0 = WING_P[k]
    def w(x, y, z): return W0 + np.array([k * x, y, z])
    P = []
    # the arm + coverts: one soft mass with a scalloped lower edge
    def cov(p):
        q = p
        d = sd_cap(q, w(0.0, 0.0, 0.0), w(0.17, 0.0, 0.13), 0.050)
        d = smin(d, sd_cap(q, w(0.17, 0.0, 0.13), w(0.35, 0.0, 0.15), 0.044), 0.03)
        d = smin(d, sd_ell(q, w(0.19, 0.0, 0.05), (0.18, 0.036, 0.10), rot([0, 1, 0], -k * 0.30)), 0.04)
        for x, z, r in ((0.07, -0.055, 0.050), (0.15, -0.060, 0.052), (0.235, -0.040, 0.050), (0.315, -0.005, 0.046), (0.375, 0.07, 0.04)):
            d = smin(d, sd_ell(q, w(x, -0.004, z), (r, 0.034, r * 1.15)), 0.02)
        return d
    P.append(star_piece(f'cov{k}', cov, w(0.19, 0.0, 0.06), [0, -1, 0], [0, 0, 1], [0, 20, 40, 60, 75, 90, 105, 120, 140, 160, 180], 30, 0.5,
                        key='wingcov', lenses=[(np.array([k * 1.0, 0, 0]), 0.8, 0.6), (np.array([-k * 1.0, 0, 0]), 0.8, 0.6)]))
    feathers = []
    for i, (x, z, a, ln) in enumerate(((0.09, 0.03, 0.06, 0.33), (0.18, 0.08, 0.14, 0.42), (0.27, 0.11, 0.22, 0.48))):
        feathers.append((x, z, a, ln, 0.010 + 0.004 * i, 'wing2' if i % 2 else 'wing'))       # secondaries hang from the arm
    for i, (a, ln) in enumerate(((0.28, 0.52), (0.40, 0.50), (0.53, 0.45), (0.68, 0.38))):
        feathers.append((0.355, 0.13, a, ln, -0.004 - 0.005 * i, 'wing' if i % 2 else 'wing2'))  # primaries fan from the wrist
    for i, (x, z, a, ln, yo, key) in enumerate(feathers):
        dr = np.array([k * math.sin(a), 0.0, -math.cos(a)])
        base = w(x, yo, z); Rf = np.stack([np.cross([0, 1.0, 0], dr), dr, np.array([0, 1.0, 0])], 1)
        c1 = base + dr * ln * 0.42; c2 = base + dr * ln * 0.74
        c2 = base + dr * ln * 0.78
        f = (lambda c1_, c2_, R_, ln_: (lambda p: smin(sd_ell(p, c1_, (0.038, ln_ * 0.42, 0.0145), R_), sd_ell(p, c2_, (0.054, ln_ * 0.20, 0.015), R_), 0.035)))(c1, c2, Rf, ln)
        P.append(star_piece(f'feat{k}{i}', f, base + dr * ln * 0.55, [0, 1, 0], dr, [0, 60, 80, 87, 90, 93, 100, 120, 180], 12, 0.5, key=key,
                            lenses=[(dr, 0.9, 0.55), (-dr, 0.9, 0.55)]))
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# ------------------------------------------------------------------ assemble the master
def add_empty(name, loc):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.location = Vector(loc); e.empty_display_size = 0.04
    return e

def build_master():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pal = pal_t()
    parts = {'body': (build_body_items_t(), np.zeros(3)), 'head': (build_head_items_t(), HEAD_P), 'jaw': (build_jaw_items_t(), JAW_P),
             'lids': (build_lid_items_t(), HEAD_P), 'fanArm': (build_fanarm_items_t(), FAN_P),
             'wingL': (build_wing_items_t(-1), WING_P[-1]), 'wingR': (build_wing_items_t(1), WING_P[1])}
    obs = [make_object(n, its, pal, o) for n, (its, o) in parts.items()]
    add_empty('fanTip', FAN['tip'])
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['pieces'] = {n + '/' + it['name']: len(it['T']) for n, (its, _) in parts.items() for it in its}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    stats['fanTip'] = [round(float(x), 4) for x in FAN['tip']]
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'tengu-master.blend'))
    export('tengu-master')
    print('TENGU', 'master', json.dumps({k: v for k, v in stats.items() if k != 'pieces'}))
    return stats

# =========================================================================================== CROW DISCIPLE (karasu-kozo)
KOZO_ROBES = {'base': '#ece2ca', 'blue': '#dfe8f4'}
def pal_k(robe):
    p = dict(PAL_T); p['robe'] = robe; p['cuff'] = mulhex(robe, 0.92); p['lapel'] = mulhex(robe, 0.86)
    for k in ('robe', 'hakama', 'pom', 'beak'):
        p[k + '_sh'] = mulhex(p[k], 0.84)
    return p
K_WING = {-1: np.array([-0.16, 0.08, 0.36]), 1: np.array([0.16, 0.08, 0.36])}
KC = np.array([0.0, -0.005, 0.575]); KR = (0.19, 0.18, 0.165)
def k_head_base(p):
    d = sd_ell(p, KC, KR)
    d = smin(d, sd_ell(p, (0.0, -0.06, 0.49), (0.150, 0.12, 0.060)), 0.045)
    for k in (-1, 1):
        for c, r in (((k * 0.180, -0.03, 0.52), 0.028), ((k * 0.165, 0.04, 0.49), 0.028), ((k * 0.19, 0.05, 0.575), 0.026)):
            d = smin(d, sd_sph(p, c, r), 0.010)
    for c, r in (((0.0, 0.155, 0.67), 0.035), ((0.0, 0.17, 0.60), 0.032)):
        d = smin(d, sd_sph(p, c, r), 0.010)
    return d
K_EX, K_EY = 0.054, 0.060
_KE0 = face_setup(k_head_base, 0.086, 0.592)
def k_head_sdf(p):
    d = k_head_base(p)
    for k in (-1, 1):
        pe, A_, U_, V_ = _KE0[k]
        d = smin(d, sd_ell(p, pe - A_ * 0.020, (K_EX * 1.04, K_EY * 1.04, 0.027), np.stack([U_, V_, A_], 1)), 0.014)
    return d
FACE_K = dict(sdf=k_head_sdf, eyes=face_setup(k_head_sdf, 0.086, 0.592), EX=K_EX, EY=K_EY, skin='crow', nseg=9,
              iris=dict(du=-0.005, dv=-0.002, ru=0.043, rv=0.049, pr=0.023, low=-0.006,
                        catch=(-0.012, 0.020, 0.0125, 0.017, -0.023, 0.0058)))
def k_beak_f(p):
    d = sd_ell(p, (0.0, -0.172, 0.555), (0.054, 0.06, 0.052))
    d = smin(d, sd_cap(p, (0.0, -0.185, 0.592), (0.0, -0.255, 0.532), 0.023), 0.035)
    d = smin(d, sd_ell(p, (0.0, -0.21, 0.540), (0.060, 0.052, 0.026)), 0.025)
    d = smin(d, sd_sph(p, (0.0, -0.268, 0.508), 0.015), 0.025)
    return smax(d, (0.496 + 0.62 * np.abs(p[..., 0])) - p[..., 2], 0.007)
def k_jaw_f(p): return smax(sd_ell(p, (0.0, -0.212, 0.488), (0.050, 0.060, 0.024)), p[..., 2] - 0.500, 0.005)
def k_mouth_f(p): return sd_ell(p, (0.0, -0.19, 0.518), (0.047, 0.045, 0.030))
def k_body_f(p):
    d = sd_ell(p, (0.0, -0.01, 0.315), (0.172, 0.158, 0.150))
    for k in (-1, 1): d = smin(d, sd_ell(p, (k * 0.072, -0.01, 0.158), (0.102, 0.135, 0.068)), 0.04)
    return d

def build_kozo_body_items():
    P = [star_piece('khead', k_head_sdf, (0, -0.01, 0.57), [0, -1, 0], [0, 0, 1], [0, 12, 25, 38, 52, 67, 83, 100, 119, 140, 180], 24, 0.5,
                    key='crow', lenses=[(nrm(FACE_K['eyes'][k][0] - np.array([0, -0.01, 0.57])), 0.34, 0.6) for k in (-1, 1)])]
    P += [build_eye(FACE_K, k, f'keye{k}') for k in (-1, 1)]
    P += [build_patch(FACE_K, (k * 0.135, -0.14, 0.528), 0.026, 0.017, 'blush', f'kblush{k}', rings=(1.0,), nseg=8) for k in (-1, 1)]
    for k in (-1, 1):                                                        # low soft brow tufts, lying back along the head
        C_ = [hit_front(k_head_base, k * x, z) for x, z in ((0.038, 0.662), (0.080, 0.678), (0.112, 0.690))]
        C_ = [c_ + unit_normals(k_head_base, c_[None])[0] * 0.007 for c_ in C_]
        back = C_[2] + np.array([k * 0.022, 0.050, 0.010]); back = project(k_head_base, back[None], 4)[0]
        back = back + unit_normals(k_head_base, back[None])[0] * 0.007
        side = unit_normals(k_head_base, C_[1][None])[0]
        P.append(sweep_piece(f'kbrow{k}', C_ + [back], 6, 6, lambda s: (0.017 + 0.005 * math.sin(PI * s), 0.012), side, 'brow', cap_rings=1))
    P.append(star_piece('kbeak', k_beak_f, (0, -0.21, 0.542), [0, -1, 0], [0, 0, 1], [0, 25, 50, 75, 100, 130, 180], 14, 0.3, key='beak'))
    tg = lambda P_: ell2(P_[:, 0], P_[:, 1] + 0.212, 0.036, 0.044)
    top = lambda P_: 0.4955 - P_[:, 2]
    def jp(ins, Ac):
        o = np.full(len(Ac), 'beaklo', dtype=object); o[ins['tg'] & ins['top']] = 'tongue'; return o
    P.append(star_piece('kjaw', k_jaw_f, (0, -0.212, 0.486), [0, 0, 1], [0, -1, 0], [0, 35, 70, 100, 140, 180], 10, 0.2,
                        fields={'tg': tg, 'top': top}, paint=jp))
    P.append(star_piece('kmouth', k_mouth_f, (0, -0.19, 0.518), [0, 0, 1], [0, -1, 0], [0, 60, 120, 180], 10, 0.2, key='mouth'))
    P.append(hexcap('ktokin', (0.0, 0.0, 0.728), 0.042, 0.052, 'cap', nc=2))
    P.append(rope_ring('krope', (0.0, 0.0, 0.737), 0.052, 0.0125, 'rope', n=18, m=4, twists=6, amp=0.28))
    # body: round robe, short hakama
    fields = {'waist': lambda P_: P_[:, 2] - 0.218}
    def bp(ins, Ac):
        o = np.full(len(Ac), 'robe', dtype=object); o[ins['waist']] = 'hakama'; return o
    P.append(star_piece('kbody', k_body_f, (0, -0.01, 0.27), [0, 0, 1], [0, -1, 0], [0, 18, 36, 54, 72, 90, 108, 126, 148, 180], 20, 0.5,
                        fields=fields, paint=bp))
    for k in (-1, 1):
        c, n = surf_pt(k_body_f, k * 0.072, 0.360, 0.014)                    # two small pompoms
        f = (lambda c_: (lambda p: sd_sph(p, c_, 0.028)))(c)
        P.append(star_piece(f'kpom{k}', f, c, n, [0, 0, 1], [0, 45, 90, 135, 180], 10, 0.1, key='pom'))
        fh = (lambda k_: (lambda p: smin(sd_sph(p, (k_ * 0.176, -0.045, 0.250), 0.032), sd_cap(p, (k_ * 0.18, -0.05, 0.24), (k_ * 0.19, -0.075, 0.215), 0.016), 0.012)))(k)
        P.append(star_piece(f'khand{k}', fh, (k * 0.176, -0.045, 0.250), [0, 0, -1], [0, -1, 0], [0, 40, 80, 120, 180], 10, 0.2, key='hand'))
        x = k * 0.078
        P.append(sweep_piece(f'kleg{k}', [(k * 0.07, -0.03, 0.12), (x, -0.04, 0.072)], 3, 6, lambda s: (0.027, 0.027), [1, 0, 0], 'crow', cap_rings=1))
        fc = np.array([x, -0.062, 0.071])
        def ff(p, fc=fc, x=x):
            d = sd_ell(p, fc, (0.036, 0.048, 0.019))
            for o in (-0.019, 0.019):
                d = smin(d, sd_cap(p, (x + o, -0.08, 0.069), (x + o * 1.3, -0.118, 0.067), 0.013), 0.01)
            return d
        P.append(star_piece(f'kfoot{k}', ff, fc, [0, -1, 0], [0, 0, 1], [0, 40, 80, 120, 180], 10, 0.12, key='crow'))
        P.append(sweep_piece(f'kstrap{k}', [(x - 0.042, -0.046, 0.062), (x, -0.058, 0.094), (x + 0.042, -0.046, 0.062)], 3, 4,
                             lambda s: (0.0095, 0.0095), [0, -1, 0], 'strap', cap_rings=1))
        top = lambda P_: 0.0635 - P_[:, 2]
        def gp(ins, Ac):
            o = np.full(len(Ac), 'geta', dtype=object); o[ins['top']] = 'getatop'; return o
        P.append(rbox(f'kgeta{k}', (k * 0.082, -0.035, 0.0535), (0.066, 0.098, 0.0115), 0.0075, 'geta', fields={'top': top}, paint=gp, ninner=-1))
        for j, yy in enumerate((-0.095, 0.025)):
            ft = (lambda c_: (lambda p: superq(p, c_, (0.052, 0.013, 0.022), 6.0, 6.0)))(np.array([k * 0.082, yy, 0.022]))
            P.append(star_piece(f'ktooth{k}{j}', ft, (k * 0.082, yy, 0.022), [0, -1, 0], [0, 0, 1], [0, 60, 90, 120, 180], 6, 0.1, key='getadk'))
    items = [process(p) for p in P]
    cull_buried(items)
    return items

def build_kozo_wing_items(k):
    W0 = K_WING[k]
    def w(x, y, z): return W0 + np.array([k * x, y, z])
    feats = [(0.10, 0.02, 0.36, 0.20), (0.145, 0.03, 0.60, 0.21), (0.17, 0.05, 0.84, 0.18)]
    def f(p):
        d = sd_cap(p, w(0.0, 0.0, 0.0), w(0.15, 0.0, 0.04), 0.036)
        d = smin(d, sd_ell(p, w(0.10, 0.0, -0.01), (0.10, 0.028, 0.07), rot([0, 1, 0], -k * 0.3)), 0.03)
        for x, z, a, ln in feats:
            dr = np.array([k * math.sin(a), 0.0, -math.cos(a)]); Rf = np.stack([np.cross([0, 1.0, 0], dr), dr, np.array([0, 1.0, 0])], 1)
            d = smin(d, sd_ell(p, w(x, 0.004, z) + dr * ln * 0.55, (0.046, ln * 0.5, 0.0145), Rf), 0.045)
        return d
    P = [star_piece(f'kwing{k}', f, w(0.13, 0.0, -0.03), [0, -1, 0], [0, 0, 1], [0, 60, 82, 87, 90, 93, 98, 120, 180], 12, 0.4,
                    key='wing', lenses=[(np.array([k * 0.5, 0, -1.0]), 0.9, 0.6)])]
    return [process(p) for p in P]

def build_kozo(vname):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pal = pal_k(KOZO_ROBES[vname])
    parts = {'body': (build_kozo_body_items(), np.zeros(3)), 'wingL': (build_kozo_wing_items(-1), K_WING[-1]),
             'wingR': (build_kozo_wing_items(1), K_WING[1])}
    obs = [make_object(n, its, pal, o) for n, (its, o) in parts.items()]
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['pieces'] = {n + '/' + it['name']: len(it['T']) for n, (its, _) in parts.items() for it in its}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    fn = 'karasu-kozo' + ('' if vname == 'base' else '_' + vname)
    export(fn)
    print('TENGU', fn, json.dumps({k: v for k, v in stats.items() if k != 'pieces'}))
    return stats

# =========================================================================================== export / main
def export(fn):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, fn + '.glb'), export_format='GLB', export_apply=True,
                              export_yup=True, export_attributes=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_texcoords=False,
                              export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_materials='EXPORT')

if __name__ == '__main__':
    np.random.seed(7)
    allstats = {}
    if WANT in ('all', 'master'): allstats['master'] = build_master()
    if WANT in ('all', 'kozo'):
        for v in KOZO_ROBES: allstats['kozo_' + v] = build_kozo(v)
    os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
    with open(os.path.join(TASK_DIR, 'work', f'build_stats_{WANT}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=1)
