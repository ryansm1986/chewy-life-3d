"""Oni Chef Gorobei (the Oni Kitchen's boss, enemy series EN-1) -- deterministic build from the boss callout on the
approved oni-imp sheet (refs/sheet.png), on top of the approved oni-imp build (build_oni-imp.py: same framework,
head, face and build style).

Blender 4.3:  blender --background --factory-startup --python build_oni-chef.py
Exports public/models/oni-chef.glb (one object `body`, origin (0, 0, 0) at the ground centre, front -Y, vertex
colour `Col` only, material `toon`) and saves oni-chef.blend. Built ~1.81 units to the top of the toque: the game
draws the boss x2.4 (~4.3 m).
Parts: head (the imp's bun, lower on the shoulders) with the imp's eyes, bushy brows, a ball nose, a grand handlebar
moustache (two thick swept volumes), short horns bursting out under a pleated lathe toque; a big round belly; a
waist apron (a thick sheet hanging straight from the belly, waistband, strings and a bow at the back); the tiger
loincloth showing at the back and sides; a cleaver (a rounded slab: spine, edge bevel, hole; wooden handle) and an
upright soup ladle (round handle, shallow round bowl).
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/oni-imp'
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

def split_hidden_crossings(bm, lay, pc, fn):
    """split the edges whose two ends lie on the same side of fn's contour while part of the edge lies on the
    other (a thin feature passing between two vertices): the cut would miss it and leave a gap"""
    E = list(bm.edges)
    if not E: return
    Aa = get_A(bm, lay, [e.verts[0] for e in E]); Ab = get_A(bm, lay, [e.verts[1] for e in E])
    fa, fb = fn(Aa), fn(Ab); same = np.sign(fa) == np.sign(fb); hit = np.zeros(len(E), bool)
    for t in (0.2, 0.35, 0.5, 0.65, 0.8):
        hit |= same & (np.sign(fn(Aa + (Ab - Aa) * t)) != np.sign(fa))
    sel = [e for e, m in zip(E, hit) if m]
    if not sel: return
    STAT['hidden'] = STAT.get('hidden', 0) + len(sel)
    bmesh.ops.subdivide_edges(bm, edges=sel, cuts=1, use_grid_fill=False)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')
STAT = {}
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
        if abs(fn((Aa + (Ab - Aa) * t)[None])[0]) > 1e-5:   # (kinked fields stall regula falsi: finish by bisection)
            for _ in range(28):
                tm = .5 * (lo + hi); fm = fn((Aa + (Ab - Aa) * tm)[None])[0]
                if (fm < 0) == (flo < 0): lo, flo = tm, fm
                else: hi, fhi = tm, fm
            t = .5 * (lo + hi)
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
        try:
            r = bmesh.ops.connect_verts(bm, verts=[loop[i], loop[j]])
            if not r['edges']: bmesh.utils.face_split(f, loop[i], loop[j]); STAT['split'] = STAT.get('split', 0) + 1
        except Exception: STAT['fail'] = STAT.get('fail', 0) + 1
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')

def process(pc):
    bm, lay = to_bm(pc.V, pc.F, pc.A)
    for fns, band, maxlen in pc.refine:
        piece_refine(bm, lay, pc, [pc.fields[k] for k in fns], band, maxlen)
    for k, fn in pc.fields.items():
        for _ in range(3): split_hidden_crossings(bm, lay, pc, fn)
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
        fc = fn(Ac); wrong = ((fc < -0.004) & ~inside[k]) | ((fc > 0.004) & inside[k])
        if wrong.any(): print('ONI wrong-class', pc.name, k, int(wrong.sum()), np.round(Ac[wrong][:4], 3).tolist(), np.round(m[wrong][:4], 4).tolist())
        mixed = (m.min(1) < -1e-4) & (m.max(1) > 1e-4)
        if mixed.any(): print("ONI mixed-sign faces", pc.name, k, int(mixed.sum()), np.round(m[mixed][:6], 4).tolist(), np.round(Ac[mixed][:3, :3], 3).tolist())
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
            deep |= oc['inside'](it['P']) > oc.get('margin', margin)
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

def iris_c(k): return IRIS['du'] * k, IRIS['dv']
def lid(u, v, k): return (v - (LID0 + LIDK * k * u)) / math.hypot(1, LIDK)
def eye_open2(u, v, k): return np.maximum(ell2(u, v, EX, EY), lid(u, v, k))
def eye_dark2(u, v, k): return np.maximum(ell2(u, v, EX + 0.0055, EY + 0.0055), lid(u, v, k) - 0.012)
def eye_iris2(u, v, k):
    cu, cv = iris_c(k); return ell2(u - cu, v - cv, IRIS['ru'], IRIS['rv'])
def exit2(f, c, ang, k, tmax=0.2):
    d = np.stack([np.cos(ang), np.sin(ang)], -1); lo = np.zeros(len(ang)); hi = np.full(len(ang), tmax)
    assert (f(c[0] + d[:, 0] * tmax, c[1] + d[:, 1] * tmax, k) > 0).all()
    for _ in range(40):
        m = .5 * (lo + hi); ins = f(c[0] + d[:, 0] * m, c[1] + d[:, 1] * m, k) < 0
        lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return .5 * (lo + hi)

def on_host(host, pe, U_, V_, u, v, off):
    P = pe + u[:, None] * U_ + v[:, None] * V_
    P = project(host, P, 4); n = unit_normals(host, P)
    return P + n * off
SKIRT = (0.0045, -0.0022)

def decal_strip(C, width, H, nrows, key, name, host, relief=True, ncol=7, skin='skin', lift=0.0008):
    """a brush-stroke decal along the surface curve C on 'host': half-width width(s), a soft ridge H high, rounded ends"""
    up = lambda P: unit_normals(host, P[:, :3])
    Cd, _ = catmull(C, 80); Cd = project(host, Cd, 3)
    idx = np.round(np.linspace(0, len(Cd) - 1, nrows)).astype(int); Cr = Cd[idx]
    n = unit_normals(host, Cr); T = np.gradient(Cr, axis=0); T -= np.einsum('ij,ij->i', T, n)[:, None] * n
    T /= L(T)[:, None]; S = np.cross(n, T)
    sk = 1.0 + SKIRT[0] / 0.006
    cols = np.array([-sk, -1.0, -0.45, 0.0, 0.45, 1.0, sk] if ncol == 7 else [-sk, -1.0, 0.0, 1.0, sk])
    s = np.linspace(0, 1, nrows)
    rows, att = [], []
    for i in range(nrows):
        w = width(s[i]); off = np.where(np.abs(cols) > 1.0001, np.sign(cols) * (w + SKIRT[0]), cols * w)
        P = Cr[i] + S[i] * off[:, None]
        P = project(host, P, 3); nn = unit_normals(host, P)
        t = np.clip(np.abs(cols), 0, 1); h = np.where(np.abs(cols) > 1.0001, SKIRT[1], H * (1 - t * t) ** 2 + lift)
        rows.append(P + nn * h[:, None]); att.append(np.stack([np.full(len(cols), s[i]), cols], -1))
    V = np.concatenate(rows); A = np.concatenate(att); nc = len(cols); F = []
    for i in range(nrows - 1):
        a, b = i * nc, (i + 1) * nc
        F += [(a + j, a + j + 1, b + j + 1, b + j) for j in range(nc - 1)]
    for end, sign in ((0, -1), (nrows - 1, 1)):
        # rounded end: an inner tip at the stroke's surface height, an outer tip sunk like the skirt
        w = width(s[end])
        t1 = Cr[end] + sign * T[end] * (w * 0.75)
        t1 = project(host, t1[None], 3)[0]; t1 = t1 + unit_normals(host, t1[None])[0] * lift
        t2 = Cr[end] + sign * T[end] * (w * 0.75 + SKIRT[0])
        t2 = project(host, t2[None], 3)[0]; t2 = t2 + unit_normals(host, t2[None])[0] * SKIRT[1]
        i1 = len(V); i2 = i1 + 1; V = np.vstack([V, t1, t2]); A = np.vstack([A, [[s[end], 0.0], [s[end], 9.0]]])
        base = end * nc; e0 = int(np.argmin(np.abs(cols + 1))); e1 = int(np.argmin(np.abs(cols - 1)))
        F += [(base + j, base + j + 1, i1) for j in range(e0, e1)]
        F += [(base + j, base + j + 1, i2) for j in list(range(0, e0)) + list(range(e1, nc - 1))]
        F += [(base + e0, i1, i2), (i1, base + e1, i2)]
    def paint(ins, Ac):
        o = np.full(len(Ac), key, dtype=object); skm = np.abs(Ac[:, 4]) > 1.0001
        o[skm] = skin; return o
    return Piece(name, V, F, A=A, paint=paint, nsdf=None if relief else host, orient=up)

def decal_disc(host, c, a, b, H, key, name, nseg=10, skin='skin', tilt=0.0):
    """a domed (H > 0) or flat oval decal on 'host' centred at the surface point c: half-sizes a (across), b (up)"""
    n0 = unit_normals(host, c[None])[0]; U_ = nrm(np.cross([0, 0, 1], n0)); V_ = np.cross(n0, U_)
    if tilt: U_, V_ = math.cos(tilt) * U_ + math.sin(tilt) * V_, -math.sin(tilt) * U_ + math.cos(tilt) * V_
    ang = 2 * PI * np.arange(nseg) / nseg
    up = lambda P: unit_normals(host, P[:, :3])
    rows = [project(host, c[None], 3) + n0 * (H + 0.0012)]; att = [np.array([[0.0]])]
    for x in ((0.5, 0.85, 1.0) if H > 0.004 else (1.0,)) + (1.0 + SKIRT[0] / max(a, b),):
        P = c + (a * x * np.cos(ang))[:, None] * U_ + (b * x * np.sin(ang))[:, None] * V_
        P = project(host, P, 3)
        h = SKIRT[1] if x > 1.0001 else H * (1 - x * x) ** 0.8 + 0.0012
        rows.append(P + unit_normals(host, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), key, dtype=object); o[Ac[:, 3] > 1.0001] = skin; return o
    return Piece(name, V, F, A=A, paint=paint, nsdf=None if H > 0.004 else host, orient=up)

def poly_orient(C):
    """outward direction for open sweeps: away from the nearest point of the dense centreline C"""
    C = np.asarray(C, float)
    def f(P):
        d = L(P[:, None, :] - C[None]); i = np.argmin(d, 1); return P - C[i]
    return f
def cloth_s(P):
    ph = np.arctan2(P[:, 0], -(P[:, 1] - CLOTH_YC)); return ph * RS
def wedge(u, v, a, ra, b, rb):
    a = np.asarray(a, float); b = np.asarray(b, float); ab = b - a
    t = clamp01(((u - a[0]) * ab[0] + (v - a[1]) * ab[1]) / (ab @ ab))
    return np.hypot(u - a[0] - t * ab[0], v - a[1] - t * ab[1]) - (ra + (rb - ra) * t)

# =========================================================================================== palette (sRGB hex)
PAL0 = {
    'skin': '#ff5a4a', 'eye': '#30232b', 'iristop': '#30232b', 'iris': '#553128', 'eyewhite': '#fff9ef', 'catch': '#ffffff',
    'brow': '#30232b', 'mous': '#30232b', 'horn': '#ffe8b0', 'nose': '#e8382e',
    'toque': '#fff9ef', 'band': '#eee5d8', 'apron': '#fff9ef', 'apband': '#efe6d9', 'string': '#efe6d9',
    'cloth': '#f4c542', 'stripe': '#30232b',
    'steel': '#b8bcc8', 'spine': '#878c9b', 'edge': '#dcdfe6', 'hole': '#4a4552', 'wood': '#8a5a3a', 'woodr': '#5e3c28',
    'ladle': '#b8bcc8', 'ladin': '#878d9c',
}
def palette():
    pal = dict(PAL0)
    pal['skin_sh'] = mulhex(pal['skin'], 0.80)
    pal['navel'] = mulhex(pal['skin'], 0.72)
    pal['horn_sh'] = mulhex(pal['horn'], 0.88)
    pal['cloth_sh'] = mulhex(pal['cloth'], 0.86)
    pal['apron_sh'] = mulhex(pal['apron'], 0.90)
    pal['toque_sh'] = mulhex(pal['toque'], 0.90)
    pal['steel_sh'] = mulhex(pal['steel'], 0.86)
    pal['mous_sh'] = mulhex(pal['mous'], 0.9)
    return pal

# =========================================================================================== head (the imp's, bigger and lower on the shoulders)
HC = np.array([0.0, 0.0, 1.150]); HR = (0.385, 0.350, 0.262)
BUN_C = (0.0, -0.050, 0.980); BUN_R = (0.415, 0.320, 0.170)
def head_base(p):
    return smin(superq(p, HC, HR, 2.0, 2.15), superq(p, BUN_C, BUN_R, 2.0, 4.0), 0.08)

EYE_X, EYE_Z = 0.178, 1.135
EX, EY = 0.080, 0.074                        # the callout's big eyes, under a stronger lid
LID0, LIDK = 0.046, 0.45                     # a stronger angry lid
ES = EX / 0.092                              # (the imp's eye constants scaled to this eye)
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
        d = smin(d, sd_ell(p, pe - A_ * 0.019, (EX * 1.10, EY * 1.10, 0.024), R), 0.016)
    return d
def head_up(P): return unit_normals(head_sdf, P[:, :3])
IRIS = dict(du=-0.018, dv=-0.006, ru=0.065, rv=0.065)

def build_eye(k):
    pe, A_, U_, V_ = EYES[k]; cu, cv = iris_c(k); c2 = np.array([cu, cv])
    nseg = 14; ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    r_dark = exit2(eye_dark2, c2, ang, k); r_open = np.minimum(exit2(eye_open2, c2, ang, k), r_dark - 0.004)
    r_iris_true = exit2(eye_iris2, c2, ang, k)
    white = r_open - r_iris_true > 0.003
    r_iris = np.where(white, r_iris_true, r_open - 0.0015)
    rows, att = [], []
    def row(rad, off, band, w):
        u = c2[0] + rad * np.cos(ang); v = c2[1] + rad * np.sin(ang)
        rows.append(on_host(head_sdf, pe, U_, V_, u, v, off))
        att.append(np.stack([np.full(nseg, band), np.asarray(w, float) * np.ones(nseg), u, v], -1))
    rows.append(on_host(head_sdf, pe, U_, V_, np.array([c2[0]]), np.array([c2[1]]), 0.0016)); att.append(np.array([[0.0, 0.0, c2[0], c2[1]]]))
    row(np.full(nseg, 0.034 * ES), 0.0016, 0.5, 0)
    row(r_iris, 0.0016, 2, white)
    row(r_open, 0.0016, 3, white)
    row(r_dark, 0.0016, 4, 0)
    row(r_dark + SKIRT[0], SKIRT[1], 5, 0)
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def f_low(P):
        u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (-0.044 * ES + 1.8 / ES * u * u)
    def f_cl(P):
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu + k * 0.024 * ES, v - cv - 0.022 * ES) - 0.0220 * ES
    def f_cs(P):
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu - k * 0.029 * ES, v - cv + 0.034 * ES) - 0.0090
    def paint(ins, Ac):
        b, w = Ac[:, 3], Ac[:, 4]
        o = np.full(len(Ac), 'eye', dtype=object)
        o[(b > 2) & (b < 3) & (w > 0.999)] = 'eyewhite'
        o[(b < 2.0001)] = 'iristop'; o[(b < 2.0001) & ins['low']] = 'iris'
        o[(b < 2.0001) & (ins['cl'] | ins['cs'])] = 'catch'
        o[b > 4.0001] = 'skin'
        return o
    return Piece(f'eye{k}', V, F, A=A, fields={'low': f_low, 'cl': f_cl, 'cs': f_cs}, paint=paint,
                 nsdf=head_sdf, orient=head_up)

def build_brow(k):
    """big bushy slanted slabs: high at the outer end, low toward the nose (the callout's stern frown)"""
    C = np.array([hit_front(head_sdf, k * x, z) for x, z in ((0.076, 1.200), (0.128, 1.216), (0.180, 1.232), (0.232, 1.248), (0.284, 1.264))])
    w = lambda s: (0.0330 + 0.0040 * s) * (0.45 + 0.55 * max(0.0, 1 - abs(2 * s - 1) ** 5) ** 0.5)
    return decal_strip(C, w, 0.0100, 6, 'brow', f'brow{k}', head_sdf, ncol=5)

def build_moustache(k):
    """one lobe of the handlebar (round 2: two separate lobes, a parting under the nose, ~60 % of the old depth):
    a soft volume lying on the upper lip, sweeping out and curling up and out to a ball tip"""
    pts = []
    for x, z, off in ((0.042, 1.010, 0.018), (0.105, 0.994, 0.020), (0.178, 0.988, 0.020), (0.248, 1.002, 0.018),
                      (0.292, 1.036, 0.016), (0.304, 1.078, 0.014)):
        S = hit_front(head_base, k * x, z) if abs(x) < 0.3 else None
        if S is None:   # (out at the cheek side: project a point in front of it)
            S = project(head_base, np.array([[k * x, -0.20, z]]), 6)[0]
        S = S + unit_normals(head_base, S[None])[0] * off
        pts.append(S)
    prof = lambda s: (0.032 - 0.010 * s, 0.022 + 0.044 * (1 - s) ** 0.85 * min(1.0, 0.70 + 3 * s))
    V, F, A, info = sweep(pts, 8, 10, prof, [0, 0, 1], caps=(True, True), cap_rings=2, dense=300)
    return Piece(f'mous{k}', V, F, A=A, paint=keyed('mous'), orient=poly_orient(info['C']), occluder=False)

def build_nose():
    c = hit_front(head_base, 0.0, 1.066); n = unit_normals(head_base, c[None])[0]
    cc = c + n * 0.030
    fn = lambda p: sd_ell(p, cc, (0.046, 0.034, 0.034))
    rows = star_rows(fn, cc, n, [0, 0, 1], np.radians([0, 40, 80, 120, 180]), 12, 0.2)
    V, F = rows_mesh(rows)
    return Piece('nose', V, F, sdf=fn, paint=keyed('nose'))

def build_head():
    th = np.radians([0, 10, 20, 31, 43, 56, 70, 85, 100, 116, 133, 153, 180])
    ctr = np.array([0, -0.02, 1.12])
    lenses = [(nrm(EYES[k][0] - ctr), 0.30, 0.6) for k in (-1, 1)]
    rows = star_rows(head_sdf, ctr, [0, -1, 0], [0, 0, 1], th, 26, 0.8, lenses=lenses)
    V, F = rows_mesh(rows)
    return Piece('headball', V, F, sdf=head_sdf, paint=keyed('skin'))

def build_horn(k):
    """short chunky horns bursting out under the toque band, curving outward (the callout)"""
    ctrl = [np.array([k * 0.200, -0.050, 1.240]), np.array([k * 0.258, -0.055, 1.330]),
            np.array([k * 0.312, -0.060, 1.398]), np.array([k * 0.352, -0.062, 1.440])]
    prof = lambda s: ((0.068 - 0.042 * s ** 1.1),) * 2
    V, F, A, info = sweep(ctrl, 6, 10, prof, [1, 0, 0], caps=(False, True), cap_rings=2, dense=200)
    return Piece(f'horn{k}', V, F, A=A, paint=keyed('horn'), orient=poly_orient(info['C']), occluder=False)

def build_ear(k):
    root = np.array([k * 0.330, 0.010, 1.100]); tip = np.array([k * 0.460, 0.060, 1.150])
    ctrl = [root, np.array([k * 0.376, 0.024, 1.112]), np.array([k * 0.422, 0.042, 1.132]), tip]
    prof = lambda s: (0.036 - 0.010 * s, 0.062 * (1 - s) ** 0.9 + 0.022)
    V, F, A, info = sweep(ctrl, 6, 9, prof, [0, 0, 1], caps=(False, True), cap_rings=3, dense=200)
    return Piece(f'ear{k}', V, F, A=A, paint=keyed('skin'), orient=poly_orient(info['C']), occluder=False)

# ----------------------------------------------------------------------- the toque
TQ_C = np.array([0.0, 0.010])
TQ_PROF = [(0.0, 1.300), (0.230, 1.310), (0.252, 1.360), (0.252, 1.375), (0.246, 1.430), (0.242, 1.478),   # band (rows 1..5)
           (0.256, 1.500), (0.278, 1.545), (0.288, 1.615), (0.282, 1.695), (0.258, 1.755), (0.195, 1.794),
           (0.100, 1.809), (0.0, 1.812)]
TQ_BAND_TOP = 5
def build_toque():
    """a towering puffy chef's hat: a straight band, then the pleated puff (8 soft pleats round the silhouette)"""
    V, F, A = lathe(TQ_PROF, 24)
    row = A[:, 0]; ph = A[:, 1]
    puff = np.clip((row - TQ_BAND_TOP) / 2.0, 0, 1) * np.clip((len(TQ_PROF) - 1.5 - row) / 2.0, 0, 1)
    rad = np.hypot(V[:, 0], V[:, 1]); scale = 1 + 0.060 * puff * np.cos(8 * ph)
    V[:, 0] *= scale; V[:, 1] *= scale
    V[:, 0] += TQ_C[0]; V[:, 1] += TQ_C[1]
    def paint(ins, Ac):
        o = np.full(len(Ac), 'toque', dtype=object); o[Ac[:, 3] < TQ_BAND_TOP + 0.01] = 'band'; return o
    return Piece('toque', V, F, A=A, paint=paint)
def toque_inside(P):
    r = np.hypot(P[:, 0] - TQ_C[0], P[:, 1] - TQ_C[1]); z = P[:, 2]
    rr = np.interp(z, [p[1] for p in TQ_PROF[1:-1]], [p[0] for p in TQ_PROF[1:-1]])
    return np.where((z > 1.33) & (z < 1.80), np.minimum(rr * 0.94 - r, z - 1.33), -1.0)

def build_head_items():
    return [build_head(), build_eye(-1), build_eye(1), build_brow(-1), build_brow(1), build_nose(),
            build_moustache(-1), build_moustache(1), build_horn(-1), build_horn(1), build_ear(-1), build_ear(1), build_toque()]

# =========================================================================================== body
def torso_f(p):
    d = sd_ell(p, (0.0, -0.080, 0.620), (0.600, 0.500, 0.400))       # the grand round belly
    d = smin(d, sd_ell(p, (0.0, -0.020, 0.900), (0.430, 0.360, 0.170)), 0.08)   # chest under the head (sloping shoulders)
    d = smin(d, sd_ell(p, (0.0, 0.040, 0.380), (0.560, 0.450, 0.220)), 0.08)    # hips and seat
    for k in (-1, 1): d = smin(d, sd_sph(p, (k * 0.460, -0.030, 0.875), 0.140), 0.07)   # round shoulders (round 2: higher)
    return d
def build_torso():
    th = np.radians([0, 20, 38, 55, 70, 84, 98, 112, 128, 148, 180])
    rows = star_rows(torso_f, np.array([0, -0.05, 0.62]), [0, 0, 1], [0, -1, 0], th, 22, 1.2)
    V, F = rows_mesh(rows)
    return Piece('torso', V, F, sdf=torso_f, paint=keyed('skin'))
def build_navel():
    c = hit_front(torso_f, 0.0, 0.665)
    return decal_disc(torso_f, c, 0.024, 0.017, 0.0, 'navel', 'navel', nseg=8)

def leg_f_k(k):
    lc = np.array([k * 0.290, -0.020, 0.200]); fc = np.array([k * 0.330, -0.085, 0.072])
    Rf = rot([0, 0, 1], k * 0.22)
    toes = [fc + Rf @ np.array([dx, -0.215 + abs(dx) * 0.40, -0.010]) for dx in (-0.130, 0.0, 0.130)]
    def f(p):
        d = sd_ell(p, lc, (0.215, 0.210, 0.185))
        q = (p - fc) @ Rf
        d = smin(d, superq(q, (0, 0, 0), (0.250, 0.260, 0.078), 2.2, 2.4), 0.08)
        for t in toes: d = smin(d, sd_ell(p, t, (0.072, 0.075, 0.062), Rf), 0.022)
        return smax(d, -p[..., 2], 0.016)
    return f, lc, fc
def build_leg(k):
    f, lc, fc = leg_f_k(k)
    th = np.radians([0, 36, 66, 88, 108, 130, 155, 180])
    rows = star_rows(f, np.array([k * 0.300, -0.05, 0.12]), [0, 0, 1], [0, -1, 0], th, 16, 0.8,
                     lenses=[(np.array([k * 0.2, -1, -0.15]), 1.0, 0.55)])
    V, F = rows_mesh(rows)
    return Piece(f'leg{k}', V, F, sdf=f, paint=keyed('skin'))
def body_lo(p):
    fl, _, _ = leg_f_k(-1); fr, _, _ = leg_f_k(1)
    return smin(torso_f(p), smin(fl(p), fr(p), 0.03), 0.05)

# ----------------------------------------------------------------------- the tiger loincloth (shows at the back and sides)
CLOTH_YC = 0.000; CLOTH_TH = 0.034; CLOTH_M = 24; CLOTH_NZ = 5; CLOTH_ZMIN = 0.20
def ztop(ph): return 0.500 + 0.025 * np.cos(ph) * 0 + 0.020 * (1 - np.cos(ph)) / 2
def zhem(ph): return 0.235 + 0.020 * (1 - np.cos(ph)) / 2
RS = 0.560
def _stripes():
    out = []; n = 8; step = 2 * PI * RS / n
    for i in range(n):
        sc = -0.5 * step + (i - 3) * step
        zc = 0.372 + (0.012 if i % 2 else -0.012)
        a = (sc - 0.110, zc - 0.074); b = (sc + 0.110, zc + 0.074)
        R0, R1 = 0.058, 0.016
        out.append((a, R1, b, R0) if i % 2 == 0 else (a, R0, b, R1))
    return out
STRIPES = _stripes()
def f_stripes(P):
    s = cloth_s(P); z = P[:, 2]; d = np.full(len(P), 9.0)
    for a, ra, b, rb in STRIPES:
        d = np.minimum(d, wedge(s, z, a, ra, b, rb))
        d = np.minimum(d, wedge(s + 2 * PI * RS, z, a, ra, b, rb)); d = np.minimum(d, wedge(s - 2 * PI * RS, z, a, ra, b, rb))
    return d + (1.0 - P[:, 3]) * 0.2
CLOTH = {}
def build_cloth():
    M, NZ = CLOTH_M, CLOTH_NZ
    phis = 2 * PI * (np.arange(M) + 0.5) / M - PI
    cols = []; outer = []; ROUT = np.zeros((M, NZ)); ZS = np.zeros((M, NZ))
    for i, ph in enumerate(phis):
        e = np.array([math.sin(ph), -math.cos(ph), 0.0]); zt, zh = ztop(ph), zhem(ph)
        zs = np.linspace(zt - 0.026, zh + 0.014, NZ)
        def rb(z):
            S = ray_exit(body_lo, np.array([0.0, CLOTH_YC, max(z, CLOTH_ZMIN)]), e[None], 1.2)[0]
            return math.hypot(S[0], S[1] - CLOTH_YC)
        rbs = np.array([rb(z) for z in zs]); rtop = rb(zt); rhem = rb(zh)
        tt = np.linspace(0, 1, NZ)
        rout = np.maximum(rbs, np.maximum.accumulate(np.maximum(rbs, rtop - 0.004)) - 0.05 * tt ** 1.3) + CLOTH_TH
        ROUT[i] = rout; ZS[i] = zs
        ax = np.array([0.0, CLOTH_YC, 0.0])
        def pt(r, z): return ax + e * r + np.array([0, 0, z])
        ring = [pt(rtop - 0.016, zt - 0.012), pt(rtop + CLOTH_TH * 0.55, zt + 0.007)]
        ring += [pt(r, z) for r, z in zip(rout, zs)]
        ring += [pt(rout[-1] - CLOTH_TH * 0.40, zh - 0.002), pt(max(rhem, rbs[-1]) - 0.016, zh + 0.014)]
        cols.append(np.array(ring))
        outer.append([0.0, 0.0] + [1.0] * NZ + [0.0, 0.0])
    R = len(cols[0]); V = np.concatenate(cols); F = []; OUT = np.concatenate(outer)[:, None]
    for i in range(M):
        a, b = i * R, ((i + 1) % M) * R
        F += [(a + j, a + (j + 1) % R, b + (j + 1) % R, b + j) for j in range(R)]
    CLOTH.update(phis=phis, ROUT=ROUT, ZS=ZS)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'cloth', dtype=object); o[ins['st']] = 'stripe'; return o
    pc = Piece('cloth', V, F, A=OUT, fields={'st': f_stripes}, paint=paint)
    pc.orient = None; pc.occluder = False
    return pc
def cloth_inside(P):
    ph = np.arctan2(P[:, 0], -(P[:, 1] - CLOTH_YC)); r = np.hypot(P[:, 0], P[:, 1] - CLOTH_YC)
    phis, ROUT = CLOTH['phis'], CLOTH['ROUT']
    M = len(phis); f = (ph - phis[0]) / (2 * PI / M); i0 = np.floor(f).astype(int); w = f - i0
    zt = ztop(ph); zh = zhem(ph)
    t = clamp01((zt - 0.026 - P[:, 2]) / np.maximum((zt - 0.026) - (zh + 0.014), 1e-6)) * (CLOTH_NZ - 1)
    j0 = np.clip(np.floor(t).astype(int), 0, CLOTH_NZ - 2); wt = t - j0
    def Rat(i):
        i = i % M; return ROUT[i, j0] * (1 - wt) + ROUT[i, j0 + 1] * wt
    rr = Rat(i0) * (1 - w) + Rat(i0 + 1) * w
    rr = rr * math.cos(PI / M) / np.cos((w - 0.5) * 2 * PI / M)
    return np.minimum(np.minimum(rr - r, P[:, 2] - zh), zt - P[:, 2])

# ----------------------------------------------------------------------- the apron (front and sides; tied at the back)
AP_YC = -0.040; AP_TH = 0.034; AP_M = 18; AP_NZ = 4; AP_HALF = math.radians(60)
AP_TOP, AP_BAND, AP_HEM = 0.600, 0.560, 0.200
def build_apron():
    """a waist apron hanging straight from the belly: per azimuth a closed profile ring (a waistband lip, the
    outer face, a rounded hem, the buried back face); the two side ends pinched closed"""
    M, NZ = AP_M, AP_NZ
    phis = np.linspace(-AP_HALF, AP_HALF, M)
    cols = []
    for i, ph in enumerate(phis):
        e = np.array([math.sin(ph), -math.cos(ph), 0.0])
        side = abs(ph) / AP_HALF
        zt = AP_TOP - 0.012 * side; zh = AP_HEM + 0.010 * side ** 2      # (a straight hem, as the callout)
        zs = np.concatenate([[AP_BAND], np.linspace(AP_BAND - 0.030, zh + 0.016, NZ)])
        def rb(z):
            S = ray_exit(body_lo, np.array([0.0, AP_YC, max(z, 0.20)]), e[None], 1.2)[0]
            return math.hypot(S[0], S[1] - AP_YC)
        rtop = rb(zt); rbs = np.array([rb(z) for z in zs])
        # (the loincloth under the apron: never poke through it, the pinched side ends included)
        def rcl(z):
            Q = np.array([[0.0, AP_YC, z]]) + e[None] * 0.3
            ph_c = math.atan2(Q[0, 0], -(Q[0, 1] - CLOTH_YC))
            if not CLOTH or not (zhem(ph_c) - 0.01 < z < ztop(ph_c) + 0.015): return 0.0
            S = np.array([[0.0, AP_YC, z]]) + e[None] * 1.2
            lo, hi = 0.0, 1.2                                   # (bisect the cloth's outer radius along this ray)
            for _ in range(30):
                m = .5 * (lo + hi); q = np.array([[0.0, AP_YC, z]]) + e[None] * m
                if cloth_inside(q)[0] > -1e-4 or math.hypot(q[0, 0], q[0, 1] - CLOTH_YC) < 0.2: lo = m
                else: hi = m
            return lo + 0.010
        rtop = max(rtop, rcl(zt)); rbs = np.maximum(rbs, np.array([rcl(z) for z in zs]))
        tt = np.linspace(0, 1, len(zs))
        rout = np.maximum(rbs, np.maximum.accumulate(np.maximum(rbs, rtop)) - 0.030 * tt ** 1.4) + AP_TH
        rout[0] += 0.010                                                # (the waistband stands proud)
        tk = 1.0 - 0.30 * side ** 3                                     # (thinner toward the pinched ends)
        ax = np.array([0.0, AP_YC, 0.0])
        def pt(r, z): return ax + e * r + np.array([0, 0, z])
        rf = rbs + (rout - rbs) * tk                                     # the front face
        rk = np.maximum(rf - AP_TH * tk, rbs - 0.012)                    # the back face: a sheet, not a block
        ring = [pt(rtop - 0.018, zt - 0.012), pt(rtop + AP_TH * 0.6 * tk + 0.008, zt + 0.006)]
        ring += [pt(r, z) for r, z in zip(rf, zs)]
        ring += [pt(.5 * (rf[-1] + rk[-1]), zh - 0.004)]
        ring += [pt(r, z) for r, z in zip(rk[:0:-1], zs[:0:-1])]
        cols.append(np.array(ring))
    R = len(cols[0])
    V = np.concatenate(cols + [cols[0].mean(0)[None], cols[-1].mean(0)[None]]); F = []
    for i in range(M - 1):
        a, b = i * R, (i + 1) * R
        F += [(a + j, a + (j + 1) % R, b + (j + 1) % R, b + j) for j in range(R)]
    p0, p1 = M * R, M * R + 1                                            # the two side ends: fans to a pole
    F += [(p0, (j + 1) % R, j) for j in range(R)]
    b = (M - 1) * R; F += [(p1, b + j, b + (j + 1) % R) for j in range(R)]
    def paint(ins, Ac):
        o = np.full(len(Ac), 'apron', dtype=object); o[Ac[:, 2] > AP_BAND - 0.004] = 'apband'; return o
    pc = Piece('apron', V, F, paint=paint); pc.orient = None; pc.occluder = False
    APRON.update(phis=phis)
    return pc
APRON = {}
BIB = dict(x_top=0.235, x_bot=0.335, z_top=0.860, z_bot=0.560, rc=0.045, mid=0.008, h=0.018)
def build_bib():
    """the apron's bib: a thick soft panel lying on the chest and belly from the waistband up to just under the
    chin (a rounded trapezoid in the front view, conformed to the body), and the neck strap"""
    b = BIB; n_c = 3
    # outline in (x, z): a trapezoid with rounded corners
    def lerp_x(z): return b['x_bot'] + (b['x_top'] - b['x_bot']) * (z - b['z_bot']) / (b['z_top'] - b['z_bot'])
    corners = [(lerp_x(b['z_bot']) - b['rc'], b['z_bot'] + b['rc'], -PI / 2), (lerp_x(b['z_top']) - b['rc'], b['z_top'] - b['rc'], 0.0),
               (-lerp_x(b['z_top']) + b['rc'], b['z_top'] - b['rc'], PI / 2), (-lerp_x(b['z_bot']) + b['rc'], b['z_bot'] + b['rc'], PI)]
    O = []
    for cx, cz, a0 in corners:
        for j in range(n_c + 1):
            a = a0 + (PI / 2) * j / n_c; O.append((cx + b['rc'] * math.cos(a), cz + b['rc'] * math.sin(a)))
    O = np.array(O); dense = []
    for i in range(len(O)):
        a_, b_ = O[i], O[(i + 1) % len(O)]; dense.append(a_)
        n = int(np.linalg.norm(b_ - a_) / 0.09)
        for t in np.linspace(0, 1, n + 2)[1:-1]: dense.append(a_ + (b_ - a_) * t)
    O = np.array(dense); c = O.mean(0)
    rows2 = [np.array([[c[0], c[1], 1.0]])]
    def ring(inset, wsgn):
        d = O - c; L_ = np.linalg.norm(d, axis=1, keepdims=True); Q = c + d * np.maximum(L_ - inset, 0) / L_
        rows2.append(np.column_stack([Q, np.full(len(Q), wsgn)]))
    rmin = np.linalg.norm(O - c, axis=1).min()
    ring(0.6 * rmin, 1.0); ring(0.3 * rmin, 1.0)
    for a in np.radians([0, 60, 120, 180]): ring(b['h'] * (1 - math.sin(a)) * 1.5, math.cos(a))
    ring(0.5 * rmin, -1.0); rows2.append(np.array([[c[0], c[1], -1.0]]))
    rows = []
    for r in rows2:
        S = np.array([hit_front(torso_f, x, z) for x, z in r[:, :2]])
        n = unit_normals(torso_f, S)
        rows.append(S + n * (b['mid'] + b['h'] * r[:, 2:3]))
    V, F = rows_mesh(rows)
    bib = Piece('bib', V, F, paint=keyed('apron')); bib.orient = None; bib.occluder = False
    out = [bib]
    for k in (-1, 1):   # the neck strap: from the bib's top corners up behind the chin into the neck
        S0 = hit_front(torso_f, k * (b['x_top'] - 0.050), b['z_top'] - 0.020); n0 = unit_normals(torso_f, S0[None])[0]
        a_ = S0 + n0 * 0.012; m_ = np.array([k * 0.200, -0.300, 0.930]); e_ = np.array([k * 0.200, -0.120, 0.980])
        V, F, A, info = sweep([a_, m_, e_], 6, 7, lambda s: (0.020, 0.026), [1, 0, 0], caps=(True, True), cap_rings=1, dense=200)
        out.append(Piece(f'strap{k}', V, F, A=A, paint=keyed('string'), orient=poly_orient(info['C']), occluder=False))
    return out
def build_ties():
    """the apron strings round the back and a chunky bow at the back centre"""
    out = []
    z = 0.572; pts = []
    for ph in np.linspace(AP_HALF - 0.25, 2 * PI - AP_HALF + 0.25, 9):
        e = np.array([math.sin(ph), -math.cos(ph), 0.0])
        S = ray_exit(torso_f, np.array([0.0, AP_YC, z]), e[None], 1.2)[0]
        pts.append(S + e * 0.012)
    V, F, A, info = sweep(pts, 9, 7, lambda s: (0.022, 0.030), [0, 0, 1], caps=(True, True), cap_rings=1, dense=300)
    out.append(Piece('string', V, F, A=A, paint=keyed('string'), orient=poly_orient(info['C']), occluder=False))
    e = np.array([0.0, 1.0, 0.0]); S = ray_exit(torso_f, np.array([0.0, AP_YC, z]), e[None], 1.2)[0]
    kc = S + e * 0.040
    def f(p):
        d = sd_ell(p, kc, (0.050, 0.040, 0.045))
        for s in (-1, 1):
            R = rot([0, 1, 0], s * 0.45)
            d = smin(d, sd_ell(p, kc + np.array([s * 0.105, 0.005, 0.040]), (0.090, 0.034, 0.055), R), 0.03)
            d = smin(d, sd_cap(p, kc + np.array([s * 0.020, 0.008, -0.030]), kc + np.array([s * 0.070, 0.004, -0.150]), 0.028), 0.03)
        return d
    rows = star_rows(f, kc, [0, 1, 0], [0, 0, 1], np.radians([0, 30, 60, 90, 120, 150, 180]), 22, 0.5)
    V, F = rows_mesh(rows)
    out.append(Piece('bow', V, F, sdf=f, paint=keyed('string')))
    return out

# ----------------------------------------------------------------------- arms, fists, cleaver, ladle
SH = {-1: np.array([-0.450, -0.030, 0.875]), 1: np.array([0.450, -0.030, 0.875])}
FIST = {-1: np.array([-0.720, -0.270, 0.660]), 1: np.array([0.740, -0.255, 0.620])}
def arm_ctrl(k):
    F0 = FIST[k]
    return [SH[k], np.array([k * 0.650, -0.020, 0.770]), np.array([k * 0.720, -0.080, 0.640]), F0 + np.array([-k * 0.004, 0.085, -0.010])]
def build_arm(k):
    C = arm_ctrl(k)
    V, F, A, info = sweep(C, 7, 11, lambda s: ((0.122 - 0.024 * s),) * 2, [0, 0, 1], caps=(False, False), dense=300)
    return Piece(f'arm{k}', V, F, A=A, paint=keyed('skin'), orient=poly_orient(info['C']), occluder=False)
def fist_f_k(k):
    F0 = FIST[k]
    knuck = [F0 + np.array([k * 0.030, -0.085, dz]) for dz in (0.052, 0.0, -0.052)]
    th = (F0 + np.array([-k * 0.035, -0.055, 0.075]), F0 + np.array([-k * 0.010, -0.100, 0.085]))
    def f(p):
        d = sd_ell(p, F0, (0.112, 0.105, 0.115))
        for c in knuck: d = smin(d, sd_sph(p, c, 0.045), 0.020)
        return smin(d, sd_cap(p, th[0], th[1], 0.038), 0.022)
    return f, F0
def build_fist(k):
    f, F0 = fist_f_k(k)
    th = np.radians([0, 30, 58, 86, 116, 148, 180])
    rows = star_rows(f, F0, [0, -1, 0.2], [0, 0, 1], th, 18, 0.5)
    V, F = rows_mesh(rows)
    return Piece(f'fist{k}', V, F, sdf=f, paint=keyed('skin'))

# the cleaver: a rounded slab in its own frame (u: across the blade, + toward the edge; v: up; w: thickness)
CL_O = FIST[-1] + np.array([0.000, -0.010, 0.000])                 # the grip (the handle's axis through the fist)
CL_R = rot([0, 1, 0], 0.14) @ rot([1, 0, 0], -0.20)               # top leaning out, broad face tipped up to the camera
CL_U, CL_V, CL_W = CL_R @ np.array([-1.0, 0, 0]), CL_R @ np.array([0, 0, 1.0]), CL_R @ np.array([0, -1.0, 0])
BL = dict(u0=-0.035, u1=0.310, v0=0.200, v1=0.800, rc=0.060, h=0.026)   # blade box in (u, v), corner radius, half-thickness
def rrect_outline(u0, u1, v0, v1, rc, n_side=1, n_corner=3):
    pts = []
    corners = [(u1 - rc, v0 + rc, -PI / 2), (u1 - rc, v1 - rc, 0.0), (u0 + rc, v1 - rc, PI / 2), (u0 + rc, v0 + rc, PI)]
    for cu, cv, a0 in corners:
        for j in range(n_corner + 1):
            a = a0 + (PI / 2) * j / n_corner; pts.append((cu + rc * math.cos(a), cv + rc * math.sin(a)))
    P = np.array(pts); out = []
    for i in range(len(P)):     # densify the straight sides
        a, b = P[i], P[(i + 1) % len(P)]; out.append(a)
        if np.linalg.norm(b - a) > 0.08:
            for t in np.linspace(0, 1, n_side + 2)[1:-1]: out.append(a + (b - a) * t)
    return np.array(out)
def build_cleaver():
    O = rrect_outline(BL['u0'], BL['u1'], BL['v0'], BL['v1'], BL['rc'])
    c = O.mean(0); h = BL['h']
    rows2, att = [], []
    def ring(inset, w):
        d = O - c; L_ = np.linalg.norm(d, axis=1, keepdims=True); Q = c + d * np.maximum(L_ - inset, 0) / L_
        rows2.append(np.column_stack([Q, np.full(len(Q), w)]))
    rows2.append(np.array([[c[0], c[1], -h]]))
    ring(0.5 * np.linalg.norm(O - c, axis=1).min(), -h)
    for a in np.radians([0, 45, 90, 135, 180]):
        ring(h * (1 - math.sin(a)), -h * math.cos(a))
    ring(0.5 * np.linalg.norm(O - c, axis=1).min(), h)
    rows2.append(np.array([[c[0], c[1], h]]))
    rows = []
    for r in rows2:
        rows.append(CL_O + r[:, 0:1] * CL_U + r[:, 1:2] * CL_V + r[:, 2:3] * CL_W)
    V, F = rows_mesh(rows)
    A = np.concatenate([r[:, :2] for r in rows2])
    def f_spine(P):   # the darker spine along the inner (handle) side
        return (BL['u0'] + 0.042) - P[:, 3]
    def f_edge(P):    # a pale bevel along the cutting edge
        return P[:, 3] - (BL['u1'] - 0.034)
    def f_hole(P):
        return np.hypot(P[:, 3] - 0.050, P[:, 4] - (BL['v1'] - 0.085)) - 0.030
    def paint(ins, Ac):
        o = np.full(len(Ac), 'steel', dtype=object); o[ins['spine']] = 'spine'; o[ins['edge']] = 'edge'; o[ins['hole']] = 'hole'; return o
    blade = Piece('blade', V, F, A=A, fields={'spine': f_spine, 'edge': f_edge, 'hole': f_hole}, paint=paint,
                  orient=None)
    blade.occluder = False
    a = CL_O - CL_V * 0.200; b = CL_O + CL_V * 0.230
    Vh, Fh, Ah, info = sweep([a, .5 * (a + b), b], 6, 10, lambda s: (0.040, 0.040), CL_U, caps=(True, False), cap_rings=2)
    def paint_h(ins, Ac):
        o = np.full(len(Ac), 'wood', dtype=object); o[ins['ring']] = 'woodr'; return o
    handle = Piece('handle', Vh, Fh, A=Ah, paint=keyed('wood'),
                   orient=poly_orient(info['C']), occluder=False)
    return [blade, handle]

LD_BOWL = np.array([0.860, -0.330, 1.100]); LD_AX = nrm([0.05, -0.95, 0.30])
def build_ladle():
    """a soup ladle held upright: a long round handle and a round shallow bowl opening toward the front-up"""
    F0 = FIST[1]
    a = F0 + np.array([-0.006, -0.010, -0.150]); m = F0 + np.array([0.040, -0.030, 0.200]); b = LD_BOWL - LD_AX * 0.040 + np.array([0.0, 0.0, -0.140])
    V, F, A, info = sweep([a, m, b], 7, 9, lambda s: (0.026, 0.026), [1, 0, 0], caps=(True, True), cap_rings=2, dense=200)
    handle = Piece('ladle_h', V, F, A=A, paint=keyed('ladle'), orient=poly_orient(info['C']), occluder=False)
    prof = [(0.0, -0.075), (0.075, -0.066), (0.122, -0.042), (0.150, -0.012), (0.156, 0.006), (0.146, 0.018),
            (0.128, 0.014), (0.080, -0.006), (0.0, -0.016)]
    prof = [(r * 1.10, h * 1.10) for r, h in prof]
    Vb, Fb, Ab = lathe(prof, 18)
    u = nrm(np.cross(LD_AX, [0, 0, 1])); w = np.cross(LD_AX, u)
    Wb = LD_BOWL + Vb[:, 0:1] * u + Vb[:, 1:2] * w + Vb[:, 2:3] * LD_AX
    def paint(ins, Ac):
        o = np.full(len(Ac), 'ladle', dtype=object); o[Ac[:, 3] > 6.0 - 0.01] = 'ladin'; return o
    bowl = Piece('ladle_b', Wb, Fb, A=Ab, paint=paint)
    return [handle, bowl]

def build_body_items():
    return ([build_torso(), build_leg(-1), build_leg(1), build_apron()] + build_bib() + build_ties() +
            [build_arm(-1), build_arm(1), build_fist(-1), build_fist(1)] + build_cleaver() + build_ladle())

# =========================================================================================== assemble
def export(fn):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, fn + '.glb'), export_format='GLB', export_apply=True,
                              export_yup=True, export_attributes=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_texcoords=False,
                              export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_materials='EXPORT')

def build_items():
    np.random.seed(7)
    pieces = build_head_items() + build_body_items()
    items = [process(p) for p in pieces]
    for it in items:
        if it['name'] == 'cloth': it['inside'] = cloth_inside; it['margin'] = 0.018
        if it['name'] == 'toque': it['inside'] = toque_inside; it['margin'] = 0.02
    cull_buried(items)
    print('ONI cut stats', STAT)
    z0 = min(it['P'][:, 2].min() for it in items)
    for it in items: it['P'] = it['P'] - np.array([0, 0, z0])
    return items, z0

if __name__ == '__main__':
    items, z0 = build_items()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ob = make_object('body', items, palette(), np.zeros(3))
    P = np.array([v.co for v in ob.data.vertices])
    stats = dict(tris=len(ob.data.polygons), verts=len(ob.data.vertices), z_shift=z0,
                 pieces={it['name']: len(it['T']) for it in items},
                 bbox=[[round(float(x), 4) for x in P.min(0)], [round(float(x), 4) for x in P.max(0)]])
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'oni-chef.blend'))
    export('oni-chef')
    print('ONI chef', json.dumps(stats))
    with open(os.path.join(TASK_DIR, 'work', 'build_stats_chef.json'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=1)
