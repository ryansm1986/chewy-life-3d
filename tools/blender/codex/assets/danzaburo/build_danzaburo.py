"""Danzaburo (Momiji Hollow boss, ROADMAP EN-1) -- deterministic build of Option A "Drum Belly" (refs/sheet.png).

Blender 4.3:
  blender --background --factory-startup --python build_danzaburo.py

Builds every part from an empty scene, saves danzaburo.blend and exports public/models/danzaburo.glb (all parts of
all three forms, flat hierarchy, origins = pivots, rotation 0 / scale 1) plus review-only GLBs of each form in work/.
Model units (the game scales x2.4, x3.3 as the giant): ~1.3 to the hat leaf's stem tip. Front = -Y, up = +Z, L = -X.

Boss contract (tools/blender/work/codex/boss-contract.md over the enemy contract): rigid named parts, no rig, no UVs,
no textures; one face-corner colour attribute `Col`; one material `toon` (Principled, base colour = Col, rough 0.8).

Technique: the framework of the approved tesso / kappa builds (copied below): implicit surfaces (smooth unions of
ellipsoids) sampled as star-shaped grids, lathes and sweeps; colour borders cut into the mesh along level-set contours
of feature fields (muzzle, mask patches, tail rings, rope strands, hat weave, stone seams), so every border runs along an
edge loop; face features are decal shells on the head; faces buried inside another shell of the same part are culled.
"""
import bpy, bmesh, math, os, sys, json, copy
import numpy as np
from mathutils import Vector, Matrix

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/danzaburo'
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
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


# =========================================================================================== extra helpers (danzaburo)
def xform_items(items, M=None, t=(0.0, 0.0, 0.0), s=1.0):
    """move processed items: P' = s * M P + t (M orthonormal); their inside tests follow"""
    M = np.eye(3) if M is None else np.asarray(M, float); t = np.asarray(t, float)
    for it in items:
        it['P'] = (it['P'] @ M.T) * s + t
        it['N'] = it['N'] @ M.T
        f = it.get('inside')
        if f is not None:
            it['inside'] = (lambda f_, M_, t_, s_: (lambda Q: s_ * f_(((Q - t_) / s_) @ M_)))(f, M, t, s)
    return items

def rest_on(P, f, up, clr, maxd=0.4):
    """push points along 'up' until f >= clr (f ~ a signed distance, positive outside)"""
    up = nrm(up); P = np.array(P, float); v = f(P); bad = v < clr
    if not bad.any(): return P
    Q = P[bad]; lo = np.zeros(len(Q)); hi = np.full(len(Q), maxd)
    for _ in range(30):
        m = .5 * (lo + hi); ok = f(Q + up * m[:, None]) >= clr
        hi = np.where(ok, m, hi); lo = np.where(ok, lo, m)
    P[bad] = Q + up * hi[:, None]; return P

def sdf_piece(name, f, ctr, axis, ref, th_deg, nseg, tmax, key=None, paint=None, fields=None, refine=(), lenses=(), phase=0.0):
    rows = star_rows(f, np.asarray(ctr, float), axis, ref, np.radians(th_deg), nseg, tmax, phase=phase, lenses=lenses)
    V, F = rows_mesh(rows)
    return Piece(name, V, F, sdf=f, fields=fields or {}, paint=paint or keyed(key), refine=refine)

def tag_clip(pc, host):
    pc.fields = dict(pc.fields); pc.fields['clip'] = (lambda h: (lambda P: h(P[:, :3])))(host); return pc

# =========================================================================================== palette (sRGB hex)
PAL = dict(
    fur='#955b34', fur_hi='#b27a4c', fur_sh='#74431f',
    mask='#493329', mask_sh='#3a2820',
    cream='#f5dfb4', cream_sh='#e0bf8c', cream_hi='#fbeccc',
    earin='#c58a68', earout='#5e3c2a',
    eye='#292125', iristop='#3a2216', iris='#5c3620', eyewhite='#fff6ea', catch='#ffffff',
    nose='#292125', nosehi='#9a8a8e', smile='#3a2228',
    mouthin='#8e3238', tongue='#e8838a',
    blush='#e98c91', blushred='#e2576b',
    straw='#d5a044', straw_hi='#e8bd62', strawdk='#b8862e', strawin='#c8973f',
    rope='#d5a044', ropedk='#a87428',
    leaf='#78a840', leafdk='#5b8a30', leafvein='#a4cf6a', stem='#6c9c38',
    flask='#f5dfb4', flask_sh='#dcc08e', flaskin='#5a3a28',
    stone='#79786c', stone_sh='#605f55', stone2='#86857a', stone2_sh='#6a695f', stonedk='#55544b', moss='#78a840', moss_sh='#5c8a32',
    kettle='#628b79', kettle_sh='#4b6f5f', kettle_hi='#74a08c', kettledk='#4a6e5e', kettlehi='#9cc4b2', kettlein='#2c3f38',
    paw='#493329',
)

# =========================================================================================== the head (model units)
HEAD_PIV = np.array([0.0, -0.03, 0.74])      # the brief's neck pivot
HEAD_C = np.array([0.0, -0.02, 0.90])        # the head's middle (scaled copies for the kettle and boulder map from it)

def head_base(p):
    d = sd_ell(p, (0.0, 0.0, 0.935), (0.315, 0.215, 0.185))                  # the cranium
    d = smin(d, sd_ell(p, (0.0, -0.03, 0.835), (0.370, 0.200, 0.135)), 0.07)  # the wide jowls (the bun's base)
    d = smin(d, sd_ell(p, (0.0, -0.180, 0.832), (0.130, 0.090, 0.078)), 0.05) # the muzzle
    d = smin(d, sd_sph(p, HEAD_PIV, 0.165), 0.05)                             # the neck plug (turns in place)
    return d

EYE_X, EYE_Z = 0.122, 0.918
EX, EY = 0.042, 0.048
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
        d = smin(d, sd_ell(p, pe - A_ * 0.016, (EX * 1.03, EY * 1.03, 0.020), R), 0.012)
    return d

def mask_f(P):
    """the dark bandit patches round the eyes: drooping ovals, lower and wider on the outside"""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; d = np.full(len(P), 1.0)
    for k in (-1, 1):
        u = x - k * 0.140; v = z - 0.902; th = -k * 0.36
        uu = u * math.cos(th) + v * math.sin(th); vv = -u * math.sin(th) + v * math.cos(th)
        d = np.minimum(d, ell2(uu, vv, 0.094, 0.074))
    return np.maximum(d, y + 0.06)
def muz_f(P):
    """the cream muzzle and lower cheeks (up between the eyes in a narrow bridge)"""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    zb = 0.872 + 0.085 * np.exp(-(x / 0.075) ** 2) - 0.06 * np.clip(np.abs(x) - 0.22, 0, None)
    return np.maximum(z - zb, y + 0.075 - 0.30 * np.clip(0.80 - z, 0, None))
def skin_key(P):
    o = np.full(len(P), 'fur', dtype=object); o[muz_f(P[:, :3]) < 0] = 'cream'; o[mask_f(P[:, :3]) < 0] = 'mask'; return o

IRIS = dict(du=-0.005, dv=-0.002, ru=0.039, rv=0.045)   # (as the sheet: both irises a touch to his left, white on the left)
def iris_c(k): return IRIS['du'] * k, IRIS['dv']
def eye_dark2(u, v, k):
    rim = ell2(u, v, EX + 0.0045, EY + 0.0045)
    lash = np.maximum(ell2(u, v - 0.004, EX + 0.0065, EY + 0.0095), -(v + 0.004))
    return smin(rim, lash, 0.004)
def eye_open2(u, v, k): return ell2(u, v, EX, EY)
def eye_iris2(u, v, k):
    cu, cv = iris_c(k); return ell2(u - cu, v - cv, IRIS['ru'], IRIS['rv'])
def exit2(f, c, ang, k, tmax=0.25):
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
SKIRT = (0.0075, -0.0015)
PUPIL_R = 0.021

def build_eye(k, nseg=14):
    pe, A_, U_, V_ = EYES[k]; cu, cv = iris_c(k); c2 = np.array([cu, cv])
    ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
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
        u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (-0.010 + 3.0 * u * u)
    def f_cl(P):   # the big catchlight, upper right (as seen) on both eyes
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu - 0.012, v - cv - 0.017) - 0.0135
    def f_cs(P):   # the small one, lower left
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu + 0.017, v - cv + 0.021) - 0.0062
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

def decal_strip(C, width, H, nrows, key, name, relief=True, ncol=7):
    Cd, _ = catmull(C, 80); Cd = project(head_sdf, Cd, 3)
    idx = np.round(np.linspace(0, len(Cd) - 1, nrows)).astype(int); Cr = Cd[idx]
    n = unit_normals(head_sdf, Cr); T = np.gradient(Cr, axis=0); T -= np.einsum('ij,ij->i', T, n)[:, None] * n
    T /= L(T)[:, None]; S = np.cross(n, T)
    sk = 1.0 + SKIRT[0] / 0.006
    cols = np.array([-sk, -1.0, -0.45, 0.0, 0.45, 1.0, sk] if ncol == 7 else [-sk, -1.0, 0.0, 1.0, sk])
    s = np.linspace(0, 1, nrows); rows, att = [], []
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

NOSE_C = hit_front(head_base, 0.0, 0.884) + np.array([0, 0.012, 0.0])
def nose_f(p):
    d = sd_ell(p, NOSE_C, (0.047, 0.029, 0.031))
    return smin(d, sd_ell(p, NOSE_C + np.array([0, 0.003, -0.014]), (0.019, 0.020, 0.015)), 0.012)
def build_nose():
    def f_hi(P): return np.hypot(P[:, 0] + 0.012, P[:, 2] - NOSE_C[2] - 0.011) - 0.008
    def paint(ins, Ac):
        o = np.full(len(Ac), 'nose', dtype=object); o[ins['hi'] & (Ac[:, 1] < NOSE_C[1] - 0.012)] = 'nosehi'; return o
    return sdf_piece('nose', nose_f, NOSE_C, [0, -1, 0], [0, 0, 1], [0, 35, 70, 105, 180], 12, 0.2, fields={'hi': f_hi}, paint=paint)

def build_smile():
    """the closed idle smile: a soft 'w' under the nose and the short line down to it (under the open jaw's footprint)"""
    W = [(-0.066, 0.826), (-0.048, 0.811), (-0.024, 0.807), (0.0, 0.819), (0.024, 0.807), (0.048, 0.811), (0.066, 0.826)]
    C = np.array([hit_front(head_sdf, x, z) for x, z in W])
    out = [decal_strip(C, lambda s: 0.0055 + 0.0012 * math.sin(PI * s), 0.0018, 9, 'smile', 'smile', relief=False, ncol=5)]
    C = np.array([hit_front(head_sdf, 0.0, z) for z in (0.858, 0.838, 0.820)])
    out.append(decal_strip(C, lambda s: 0.0048, 0.0015, 3, 'smile', 'philtrum', relief=False, ncol=5))
    return out

CHEEK = {}
for _k in (-1, 1):
    _pc = hit_front(head_base, _k * 0.236, 0.826)
    _n = unit_normals(head_base, _pc[None])[0]; _U = nrm(np.cross([0, 0, 1], _n)); _V = np.cross(_n, _U)
    CHEEK[_k] = (_pc, _n, _U, _V)
def build_blush(k, ru=0.036, rv=0.023, off=0.0012, key='blush', name='blush'):
    pc_, n0, U_, V_ = CHEEK[k]
    nseg = 10; ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [project(head_sdf, pc_[None], 3) + n0 * off], [np.array([[0.0]])]
    for x, h in ((1.0, off), (1.0 + SKIRT[0] / 0.025, SKIRT[1])):
        P = pc_ + (ru * x * np.cos(ang))[:, None] * U_ + (rv * x * np.sin(ang))[:, None] * V_
        P = project(head_sdf, P, 3); rows.append(P + unit_normals(head_sdf, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), key, dtype=object); skm = Ac[:, 3] > 1.0001
        o[skm] = skin_key(Ac[skm, :3]); return o
    return Piece(f'{name}{k}', V, F, A=A, paint=paint, nsdf=head_sdf, orient=head_up)

def build_headball(nseg=34, th=(0, 11, 22, 33, 45, 57, 69, 81, 94, 108, 124, 142, 160, 180)):
    ctr = np.array([0, -0.05, 0.88])
    lenses = [(nrm(EYES[k][0] - ctr), 0.30, 0.62) for k in (-1, 1)]
    rows = star_rows(head_sdf, ctr, [0, -1, 0], [0, 0, 1], np.radians(th), nseg, 0.7, lenses=lenses)
    V, F = rows_mesh(rows)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'fur', dtype=object); o[ins['muz']] = 'cream'; o[ins['mask']] = 'mask'; return o
    return Piece('headball', V, F, sdf=head_sdf, fields={'muz': muz_f, 'mask': mask_f}, paint=paint,
                 refine=[(('muz', 'mask'), 0.010, 0.045)])

EAR_PROF = [(0.0, 0.026), (0.056, 0.022), (0.072, 0.016), (0.084, 0.008), (0.090, -0.004), (0.083, -0.018), (0.060, -0.026), (0.0, -0.026)]
EAR_XYZ, EAR_UP = (0.228, -0.066, 1.022), 0
def ear_frame(k):
    c = np.array([k * EAR_XYZ[0], EAR_XYZ[1], EAR_XYZ[2]])
    n = nrm(np.array([k * math.sin(math.radians(22)), -math.cos(math.radians(22)) * math.cos(math.radians(EAR_UP)), math.sin(math.radians(EAR_UP))]))
    w = np.array([0, 0, 1.0]); w = nrm(w - (w @ n) * n); u = np.cross(w, n)
    return c, u, w, n
def build_ear(k, nseg=20):
    c, u, w, n = ear_frame(k)
    V, F, A = lathe(EAR_PROF, nseg)
    V = c + V[:, 0][:, None] * u + V[:, 1][:, None] * w + V[:, 2][:, None] * n
    def paint(ins, Ac):
        o = np.full(len(Ac), 'earout', dtype=object); o[Ac[:, 3] < 1.001] = 'earin'; return o
    return Piece(f'ear{k}', V, F, A=A, paint=paint, orient=point_orient(c), occluder=False)

def head_items(lod=1):
    """the head part's pieces (canonical, model units): skull + muzzle + mask, eyes, nose, ears, smile, pink blush"""
    if lod == 1:
        P = [build_headball(), build_eye(-1), build_eye(1), build_nose(), tag_clip(build_ear(-1), head_sdf), tag_clip(build_ear(1), head_sdf),
             build_blush(-1), build_blush(1)] + build_smile()
    else:
        P = [build_headball(26, (0, 13, 27, 41, 56, 71, 86, 102, 120, 145, 180)), build_eye(-1, 12), build_eye(1, 12), build_nose(),
             tag_clip(build_ear(-1, 14), head_sdf), tag_clip(build_ear(1, 14), head_sdf), build_blush(-1), build_blush(1)]
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# ---- the open laughing mouth (the jaw part): a dark dish with a tongue, ringed by a sculpted cream lip
MOUTH_Z = 0.797
_pm = hit_front(head_sdf, 0.0, MOUTH_Z); _nm = unit_normals(head_sdf, _pm[None])[0]
_Um = nrm(np.cross([0, 0, 1], _nm)); _Vm = np.cross(_nm, _Um)
MOUTH = (_pm, _nm, _Um, _Vm)
JAW_PIV = _pm.copy()
def mouth2(u, v, k=0):
    return np.maximum(ell2(u, v - 0.040, 0.094, 0.090), v - (0.040 - 1.2 * u * u))
def build_jaw(nseg=20):
    pm, n0, U_, V_ = MOUTH; c2 = np.array([0.0, 0.0])
    ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    r_o = exit2(mouth2, c2, ang, 0)
    rows, att = [], []
    def row(rad, off, band):
        u = rad * np.cos(ang); v = rad * np.sin(ang)
        rows.append(on_head(pm, n0, U_, V_, u, v, off)); att.append(np.stack([np.full(nseg, band), u, v], -1))
    rows.append(on_head(pm, n0, U_, V_, np.array([0.0]), np.array([0.0]), 0.0034)); att.append(np.array([[0.0, 0.0, 0.0]]))
    row(r_o * 0.5, 0.0036, 0.5)
    row(r_o, 0.0040, 1)
    row(r_o + 0.005, 0.0062, 2)
    row(r_o + 0.010, 0.0072, 3)
    row(r_o + 0.016, 0.0045, 4)
    row(r_o + 0.023, -0.0040, 5)
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def f_t(P): return ell2(P[:, 4], P[:, 5] + 0.030, 0.058, 0.034)
    def paint(ins, Ac):
        b = Ac[:, 3]; o = np.full(len(Ac), 'cream', dtype=object)
        o[b < 2.0001] = 'smile'
        o[b < 1.0001] = 'mouthin'; o[(b < 1.0001) & ins['t']] = 'tongue'
        return o
    return Piece('mouth', V, F, A=A, fields={'t': f_t}, paint=paint, nsdf=head_sdf, orient=head_up)
def jaw_items():
    return [process(build_jaw())]
def blush_items():
    return [process(build_blush(k, 0.045, 0.029, 0.0030, 'blushred', 'red')) for k in (-1, 1)]

def scaled_head(items, s, c):
    """the canonical head pieces, scaled about HEAD_C by s and moved so HEAD_C lands on c"""
    return xform_items(items, None, np.asarray(c, float) - HEAD_C * s, s)

# =========================================================================================== the body
def torso_f(p):
    d = sd_ell(p, (0.0, 0.05, 0.415), (0.392, 0.352, 0.365))                  # the big round barrel
    d = smin(d, sd_ell(p, (0.0, 0.07, 0.585), (0.30, 0.25, 0.18)), 0.08)      # full shoulders under the head (set back: the chin shows)
    for k in (-1, 1):
        d = smin(d, sd_ell(p, (k * 0.20, -0.03, 0.16), (0.17, 0.19, 0.15)), 0.06)   # the haunches over the feet
    return smax(d, -p[..., 2], 0.02)
def build_torso():
    return sdf_piece('torso', torso_f, (0, 0.02, 0.40), [0, 0, 1], [0, -1, 0],
                     [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 133, 147, 163, 180], 34, 0.8, key='fur')

def foot_f_k(k):
    fc = np.array([k * 0.235, -0.035, 0.058]); yaw = k * 0.18
    def f(p):
        d = sd_ell(p, fc, (0.148, 0.155, 0.064))
        for a in (-0.48, 0.0, 0.48):
            dr = np.array([math.sin(a + yaw), -math.cos(a + yaw), 0.0])
            d = smin(d, sd_sph(p, fc + dr * 0.115 + np.array([0, 0, -0.014]), 0.048), 0.022)
        return smax(d, -p[..., 2], 0.012)
    return f, fc
def build_foot(k):
    f, fc = foot_f_k(k)
    return sdf_piece(f'foot{k}', f, fc + np.array([0, -0.01, 0.0]), [0, 0, 1], [0, -1, 0], [0, 30, 60, 85, 105, 135, 180], 18, 0.4,
                     key='fur', lenses=[(np.array([math.sin(k * 0.18), -math.cos(k * 0.18), 0]), 1.0, 0.5)])

BELLY_PIV = np.array([0.0, -0.165, 0.36]); BELLY_C = np.array([0.0, -0.115, 0.42]); BELLY_R = (0.318, 0.285, 0.272)
def belly_f(p): return sd_ell(p, BELLY_C, BELLY_R)
def build_belly():
    return sdf_piece('belly', belly_f, BELLY_C, [0, -1, 0], [0, 0, 1], [0, 10, 20, 30, 41, 52, 64, 77, 92, 115, 145, 180], 32, 0.6, key='cream')

def union_body(p): return np.minimum(torso_f(p), belly_f(p))
ROPE_R = 0.029
def rope_curve(n):
    th = 2 * PI * np.arange(n) / n
    E = np.stack([np.sin(th), -np.cos(th), np.zeros(n)], -1)
    Z = 0.300 - 0.108 * np.cos(th)
    O = np.stack([np.zeros(n), np.full(n, -0.03), Z], -1)
    S = ray_exit(union_body, O, E, 0.8)
    Nn = unit_normals(union_body, S)
    # smooth the normals along the loop (the torso / belly crease)
    for _ in range(3): Nn = (np.roll(Nn, 1, 0) + 2 * Nn + np.roll(Nn, -1, 0)); Nn /= L(Nn)[:, None]
    return S + Nn * (ROPE_R * 0.50), Nn
def loop_orient(C):
    def f(X):
        d = X[:, None, :] - C[None]; i = np.argmin(np.einsum('ijk,ijk->ij', d, d), 1); return X - C[i]
    return f
def build_rope(n=96, nseg=8):
    """the straw rope sash: a two-strand twisted rope (the ring frame turns one segment per ring, so the strands
    run along the edges: light and dark straw bands, a slight bulge on each strand)"""
    C, Nn = rope_curve(n)
    T = np.roll(C, -1, 0) - np.roll(C, 1, 0); T /= L(T)[:, None]
    ph0 = 2 * PI * np.arange(nseg) / nseg
    rows, att = [], []
    for i in range(n):
        N_ = nrm(Nn[i] - (Nn[i] @ T[i]) * T[i]); B_ = np.cross(T[i], N_)
        ph = ph0 + 2 * PI * i / nseg            # one segment of twist per ring
        r = ROPE_R * (1 + 0.10 * np.cos(4 * (ph0 + PI / nseg)))
        rows.append(C[i] + r[:, None] * (np.cos(ph)[:, None] * N_ + np.sin(ph)[:, None] * B_))
        att.append(np.stack([np.cos(ph0), np.sin(ph0)], -1))
    V = np.concatenate(rows); A = np.concatenate(att); F = []
    for i in range(n):
        a = i * nseg; b = ((i + 1) % n) * nseg
        F += [(a + j, a + (j + 1) % nseg, b + (j + 1) % nseg, b + j) for j in range(nseg)]
    def paint(ins, Ac):
        a = np.mod(np.arctan2(Ac[:, 4], Ac[:, 3]), 2 * PI); j = np.floor(a / (2 * PI / nseg)).astype(int)
        o = np.full(len(Ac), 'rope', dtype=object); o[(j // 2) % 2 == 1] = 'ropedk'; return o
    return Piece('rope', V, F, A=A, paint=paint, orient=loop_orient(C), occluder=False)

C0, N0 = rope_curve(96)
KNOT_C = C0[0] + N0[0] * 0.022
def knot_f(p):
    d = sd_ell(p, KNOT_C, (0.052, 0.040, 0.048))
    for k in (-1, 1):
        R = rot([0, 1, 0], k * 0.35)
        d = smin(d, sd_ell(p, KNOT_C + np.array([k * 0.064, 0.008, 0.014]), (0.052, 0.034, 0.036), R), 0.016)
        a = KNOT_C + np.array([k * 0.022, 0.006, -0.030]); b = KNOT_C + np.array([k * 0.048, 0.022, -0.105])
        d = smin(d, sd_cap(p, a, b, 0.026), 0.014)
    return d
def build_knot():
    def f_g(P):   # the dark crease where the loops meet the middle
        return np.maximum(np.abs(np.abs(P[:, 0]) - 0.040) - 0.006, P[:, 2] - KNOT_C[2] - 0.04)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'rope', dtype=object); o[ins['g']] = 'ropedk'; return o
    return sdf_piece('knot', knot_f, KNOT_C + np.array([0, 0, -0.01]), [0, -1, 0], [0, 0, 1], [0, 20, 40, 60, 80, 100, 125, 150, 180], 22, 0.3,
                     fields={'g': f_g}, paint=paint)

def body_items():
    P = [build_torso(), build_foot(-1), build_foot(1), build_rope(), build_knot()]
    items = [process(p) for p in P]; cull_buried(items); return items
def belly_items():
    return [process(build_belly())]

# =========================================================================================== arms (the -X one with the sake tokkuri)
SHOULDER = {k: np.array([k * 0.32, -0.02, 0.60]) for k in (-1, 1)}
ARM_DIR = {1: nrm([0.47, -0.20, -0.88]), -1: nrm([-0.86, -0.15, -0.47])}
ARM_LEN = {1: 0.30, -1: 0.285}
def paw_c(k): return SHOULDER[k] + ARM_DIR[k] * ARM_LEN[k]
FLASK_C = np.array([-0.468, -0.140, 0.425])          # the bulb's middle
FLASK_PROF = [(0.0, 0.0), (0.060, 0.0), (0.095, 0.018), (0.115, 0.070), (0.118, 0.120), (0.105, 0.175), (0.075, 0.225),
              (0.046, 0.262), (0.038, 0.290), (0.040, 0.330), (0.052, 0.362), (0.062, 0.385), (0.058, 0.398), (0.044, 0.396),
              (0.034, 0.372), (0.0, 0.366)]
def build_arm(k):
    sh, d = SHOULDER[k], ARM_DIR[k]; Lr = ARM_LEN[k]
    side = nrm(np.cross(d, [0, -1, 0])) if k > 0 else nrm(np.cross([0, -1, 0], d))
    out = []
    fsh = (lambda c_: (lambda p: sd_sph(p, c_, 0.105)))(sh)
    out.append(sdf_piece(f'shoulder{k}', fsh, sh, [0, 0, 1], [0, -1, 0], [0, 40, 80, 120, 160, 180], 14, 0.3, key='fur'))
    a = sh + d * 0.02; m = sh + d * Lr * 0.5 + np.array([0, -0.012, 0]); b = sh + d * (Lr - 0.03)
    V, F, A, _ = sweep([a, m, b], 8, 16, lambda s: (0.103 - 0.018 * s,) * 2, [0, -1, 0], caps=(True, True), cap_rings=2)
    out.append(Piece(f'arm{k}', V, F, A=A, paint=keyed('fur'), orient=seg_orient(a, b), occluder=False))
    pc = paw_c(k)
    fwd = nrm(np.array([0, -1.0, -0.25]))
    def fpaw(p, pc=pc, d=d, side=side):
        q = sd_ell(p, pc, (0.090, 0.086, 0.094))
        for j in (-1, 0, 1):
            c = pc + d * 0.058 + fwd * 0.036 + side * (0.036 * j)
            q = smin(q, sd_sph(p, c, 0.034), 0.016)
        return q
    if k > 0:
        out.append(sdf_piece(f'paw{k}', fpaw, pc, d, [0, -1, 0], [0, 25, 50, 75, 100, 130, 155, 180], 16, 0.3, key='fur'))
    else:   # the tokkuri hand: the paw grips the flask's shoulder from the outside, three fingers wrap its front
        def fgrip(p, pc=pc):
            q = sd_ell(p, pc, (0.088, 0.084, 0.092))
            for j, (az, dz) in enumerate(((198, 0.075), (222, 0.058), (246, 0.040))):
                a_ = math.radians(az); c = FLASK_C + np.array([math.cos(a_) * 0.122, math.sin(a_) * 0.122, dz])
                q = smin(q, sd_ell(p, c, (0.034, 0.034, 0.030)), 0.02)
            return q
        out.append(sdf_piece('paw-1', fgrip, pc + np.array([0.02, -0.03, 0.0]), [0, 0, 1], [0, -1, 0],
                             [0, 25, 50, 75, 100, 125, 150, 180], 20, 0.4, key='fur'))
        V, F, A = lathe(FLASK_PROF, 18)
        V = V + FLASK_C - np.array([0, 0, 0.120])
        def paint(ins, Ac):
            o = np.full(len(Ac), 'flask', dtype=object); o[Ac[:, 3] > 12.5] = 'flaskin'; return o
        out.append(Piece('flask', V, F, A=A, paint=paint, orient=seg_orient(FLASK_C - [0, 0, 0.2], FLASK_C + [0, 0, 0.3]), occluder=False))
        # the straw cord round its neck, with a knot at the front
        zc = FLASK_C[2] - 0.120 + 0.282; n = 24; th = 2 * PI * np.arange(n) / n
        Cc = np.stack([FLASK_C[0] + 0.047 * np.cos(th), FLASK_C[1] + 0.047 * np.sin(th), np.full(n, zc)], -1)
        V, F, A = loop_tube(Cc, 7, lambda i: (0.017, 0.017))
        out.append(Piece('cord', V, F, A=A, paint=keyed('rope'), orient=loop_orient(Cc), occluder=False))
        kc = np.array([FLASK_C[0] - 0.005, FLASK_C[1] - 0.064, zc - 0.006])
        fk = (lambda c_: (lambda p: sd_ell(p, c_, (0.026, 0.022, 0.026))))(kc)
        out.append(sdf_piece('cordknot', fk, kc, [0, -1, 0], [0, 0, 1], [0, 45, 90, 135, 180], 10, 0.1, key='rope'))
    return out
def arm_items(k):
    items = [process(p) for p in build_arm(k)]; cull_buried(items); return items

# =========================================================================================== the tail
TAIL_PIV = np.array([0.0, 0.26, 0.20])
TAIL_CTRL = [(0.0, 0.24, 0.21), (0.10, 0.40, 0.19), (0.27, 0.56, 0.25), (0.40, 0.63, 0.40), (0.42, 0.58, 0.56), (0.36, 0.49, 0.65)]
def tail_prof(s): r = 0.075 + 0.145 * math.sin(PI * (0.80 * s + 0.03)); return (r, r)
def build_tail(ctrl=TAIL_CTRL, sc=1.0, name='tail', nr=18, nseg=16):
    V, F, A, info = sweep(ctrl, nr, nseg, lambda s: tuple(x * sc for x in tail_prof(s)), [0, 0, 1], caps=(True, True), cap_rings=3)
    def f_ring(P):
        s = P[:, 3]; d = np.full(len(P), 1.0)
        for m in (0.37, 0.56, 0.75): d = np.minimum(d, np.abs(s - m) - 0.055)
        return np.minimum(d, 0.915 - s)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'fur', dtype=object); o[ins['ring']] = 'mask'; return o
    return Piece(name, V, F, A=A, fields={'ring': f_ring}, paint=paint, orient=curve_orient(ctrl), occluder=False)
def tail_items():
    return [process(build_tail())]

# =========================================================================================== the hat (straw sugegasa, pushed back) and the leaf
HAT_TILT = 0.92
R_HAT = rot([1, 0, 0], -HAT_TILT)
HAT_LIFT = -0.032
HAT_C = np.array([0.0, 0.165, 0.915]) + R_HAT @ np.array([0, 0, HAT_LIFT])       # the brim's middle
HAT_OUT = [(0.0, 0.165), (0.04, 0.162), (0.08, 0.152), (0.12, 0.135), (0.17, 0.112), (0.22, 0.088), (0.27, 0.064),
           (0.32, 0.040), (0.36, 0.022), (0.39, 0.010), (0.405, 0.003)]
HAT_LIP = [(0.413, -0.008), (0.405, -0.018)]
HAT_IN = [(0.38, -0.012), (0.33, 0.012), (0.27, 0.036), (0.22, 0.059), (0.17, 0.082), (0.12, 0.103), (0.06, 0.120), (0.0, 0.126)]
HAT_RS, HAT_HS = 1.10, 1.20
HAT_OUT = [(r * HAT_RS, h * HAT_HS) for r, h in HAT_OUT]; HAT_LIP = [(r * HAT_RS, h) for r, h in HAT_LIP]; HAT_IN = [(r * HAT_RS, h * HAT_HS) for r, h in HAT_IN]
NOUT = len(HAT_OUT)
def hat_h(r): return np.interp(r, [a for a, _ in HAT_OUT], [b for _, b in HAT_OUT])
def to_hat(P): return (np.asarray(P, float) - HAT_C) @ R_HAT
def from_hat(Q): return np.asarray(Q, float) @ R_HAT.T + HAT_C
def hat_out_f(P):
    """+ above the hat's outer surface (model coords), ~ a distance near the crown"""
    q = to_hat(np.reshape(P, (-1, 3))); r = np.hypot(q[:, 0], q[:, 1])
    return q[:, 2] - hat_h(np.minimum(r, 0.405 * HAT_RS)) + np.maximum(r - 0.405 * HAT_RS, 0) * 3
def build_hat(nseg=40):
    V, F, A = lathe(HAT_OUT + HAT_LIP + HAT_IN, nseg, 0.5)
    def rr(P): return np.hypot(P[:, 0], P[:, 1])
    def f_sp(P):
        r = rr(P); ph = np.arctan2(P[:, 1], P[:, 0]); n = 16
        fr = np.mod(ph / (2 * PI / n) + 0.5, 1.0) - 0.5
        return np.maximum.reduce([r * np.abs(fr) * (2 * PI / n) - 0.0068, 0.138 * HAT_RS - r, r - 0.392 * HAT_RS, P[:, 3] - (NOUT - 1.5)])
    def f_rg(P):
        r = rr(P)
        return np.maximum(np.minimum(np.abs(r - 0.135 * HAT_RS) - 0.0085, np.abs(r - 0.268 * HAT_RS) - 0.0085), P[:, 3] - (NOUT - 1.5))
    def paint(ins, Ac):
        row = Ac[:, 3]; o = np.full(len(Ac), 'straw', dtype=object)
        o[ins['sp'] | ins['rg']] = 'strawdk'
        o[(row > NOUT - 1.5) & (row < NOUT + 1.5)] = 'strawdk'
        o[row >= NOUT + 1.5] = 'strawin'
        return o
    return Piece('hat', V, F, A=A, fields={'sp': f_sp, 'rg': f_rg}, paint=paint, orient=None,
                 nsdf=None, occluder=False)
def hat_items():
    its = [process(build_hat())]
    return xform_items(its, R_HAT, HAT_C)

def leaf_outline(t, Lh, W):
    u = W * np.sin(t) * (0.84 + 0.26 * np.cos(t)) * (1 - 0.42 * np.exp(-((t - PI) / 0.75) ** 2))
    v = Lh * (1 - np.cos(t)) / 2 + 0.11 * Lh * np.exp(-(np.sin(t / 2) / 0.17) ** 2)
    return u, v
def build_leaf_blade(name, base, n_l, t_l, Lh, W, thick, rest_f, nseg=30, clr=0.004, cup=0.22, droop=0.12, veins=True):
    """a broad heart leaf (a closed slab, broad face up): stem notch at 'base', tip along t_l, face along n_l;
    draped on rest_f (pushed along n_l until it clears the surface)"""
    n_l = nrm(n_l); t_l = nrm(t_l - (t_l @ n_l) * n_l); x_l = np.cross(t_l, n_l)
    t = 2 * PI * np.arange(nseg) / nseg; ou, ov = leaf_outline(t, Lh, W)
    cu, cv = 0.0, 0.45 * Lh
    def mid(u, v):
        h = cup * u * u / W - droop * (v / Lh) ** 2 * Lh
        return base + np.outer(u, x_l) + np.outer(v, t_l) + np.outer(h, n_l)
    rows, att = [], []
    spec = [(0.0, 1), (0.40, 1), (0.75, 1), (0.93, 1), (1.0, 0), (0.93, -1), (0.55, -1), (0.0, -1)]
    mids = []
    for f, sd in spec:
        u = cu + f * (ou - cu) if f > 0 else np.array([cu]); v = cv + f * (ov - cv) if f > 0 else np.array([cv])
        mids.append((u, v, sd))
    allU = np.concatenate([m[0] for m in mids]); allV = np.concatenate([m[1] for m in mids])
    M = mid(allU, allV); M = rest_on(M, rest_f, n_l, clr + thick / 2)
    off = 0
    for (u, v, sd) in mids:
        k = len(u); P = M[off:off + k] + n_l * (sd * thick / 2 * (1.0 if sd != 0 else 0)); off += k
        rows.append(P); att.append(np.stack([u, v, np.full(k, float(sd))], -1))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def f_vein(P):
        u, v, sd = P[:, 3], P[:, 4], P[:, 5]
        d = np.maximum(np.maximum(np.abs(u) - 0.0075, v - 0.86 * Lh), 0.03 * Lh - v)
        for v0 in (0.22, 0.45, 0.66):
            for s_ in (-1, 1):
                dd, tt = poly_dist(u, v, [(0.0, v0 * Lh), (s_ * 0.50 * W * (1.1 - v0 * 0.6), (v0 + 0.20) * Lh)])
                d = np.minimum(d, dd - 0.0055 * (1 - 0.5 * tt))
        return np.maximum(d, 0.5 - sd)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'leaf', dtype=object); o[Ac[:, 5] < -0.3] = 'leafdk'
        if veins: o[ins['vein']] = 'leafvein'
        return o
    fields = {'vein': f_vein} if veins else {}
    ctr = M[0]
    return Piece(name, V, F, A=A, fields=fields, paint=paint, orient=point_orient(ctr - n_l * 0.05), occluder=False), M

def build_stem(name, base, n_l, t_l, x_l, r=0.020, scale=1.0):
    s = scale
    ctrl = [base - n_l * 0.006 * s + t_l * 0.016 * s, base + n_l * 0.032 * s + x_l * 0.006 * s, base + n_l * 0.062 * s + x_l * 0.022 * s - t_l * 0.006 * s,
            base + n_l * 0.084 * s + x_l * 0.046 * s - t_l * 0.010 * s]
    V, F, A, _ = sweep(ctrl, 7, 8, lambda q: (r * (1.0 - 0.15 * q), r * (1.0 - 0.15 * q)), x_l, caps=(True, True), cap_rings=2)
    return Piece(name, V, F, A=A, paint=keyed('stem'), orient=curve_orient(ctrl), occluder=False)

LEAF_YAW, LEAF_LIFT = 0.16, 0.90
LEAF_B_LOCAL = np.array([0.0, -0.30, 0.0])
def leaf_frame():
    """the leaf lies on the front slope of the crown (stem toward the front brim, tip toward the apex), lifted a little
    so its broad face turns up to the 45-deg camera"""
    bl = LEAF_B_LOCAL.copy(); bl[2] = hat_h(abs(bl[1])) + 0.006
    ml = np.array([0.0, -0.08, hat_h(0.08)])
    base = from_hat(bl[None])[0]; t_l = nrm(from_hat(ml[None])[0] - base)
    n_l = nrm(np.cross([1.0, 0, 0], t_l))
    Rl = rot([1.0, 0, 0], LEAF_LIFT); t_l = Rl @ t_l; n_l = Rl @ n_l
    Ry = rot(n_l, LEAF_YAW); t_l = Ry @ t_l; x_l = np.cross(t_l, n_l)
    return base, n_l, t_l, x_l
LEAF_BASE = leaf_frame()[0]
def leaf_items():
    base, n_l, t_l, x_l = leaf_frame()
    blade, M = build_leaf_blade('blade', base, n_l, t_l, 0.47, 0.195, 0.026, hat_out_f, droop=0.0)
    stem = build_stem('stem', base + n_l * 0.004, n_l, t_l, x_l, scale=1.25)
    return [process(blade), process(stem)]

# =========================================================================================== the boulder form (DORON!)
ROCK_C = np.array([0.0, 0.0, 0.47]); ROCK_R = 0.47
def _fib(n, seed):
    rng = np.random.default_rng(seed); i = np.arange(n) + 0.5
    ph = np.arccos(1 - 2 * i / n); th = PI * (1 + 5 ** 0.5) * i
    S = np.stack([np.cos(th) * np.sin(ph), np.sin(th) * np.sin(ph), np.cos(ph)], -1) + rng.normal(0, 0.10, (n, 3))
    return S / L(S)[:, None]
SEEDS = _fib(28, 5)
RK_S, RK_HC = 0.80, np.array([0.0, -0.335, 0.745])
def rk_head(p): return RK_S * head_base((p - RK_HC) / RK_S + HEAD_C)
EARS_RK = [RK_HC + (ear_frame(k)[0] - HEAD_C) * RK_S for k in (-1, 1)]
def stone_terms(D):
    dots = D @ SEEDS.T; srt = np.sort(dots, 1); c1, c2 = np.clip(srt[:, -1], -1, 1), np.clip(srt[:, -2], -1, 1)
    seam = (np.arccos(c2) - np.arccos(c1)) * 0.5 * ROCK_R
    return seam, np.argmax(dots, 1)
def lowf(D): return 0.020 * np.sin(3.1 * D[:, 0] + 1.3 * D[:, 1] + 0.4) + 0.016 * np.sin(2.7 * D[:, 2] - 2.2 * D[:, 0] + 0.5) + 0.012 * np.sin(5.1 * D[:, 1] + 3.3 * D[:, 2])
def rock_shell(p):
    sh = np.shape(p); q = np.reshape(p, (-1, 3)) - ROCK_C; r = L(q); D = q / np.maximum(r, 1e-9)[:, None]
    seam, _ = stone_terms(D)
    Re = ROCK_R * (1 + lowf(D)) + 0.011 * (1 - np.exp(-(seam / 0.045) ** 2)) - 0.012 * np.exp(-(seam / 0.013) ** 2) - 0.006
    return np.reshape((r - Re) * 0.92, sh[:-1])
def rock_f(p):
    sock = rk_head(p) - 0.010
    for e in EARS_RK: sock = smin(sock, sd_sph(p, e, 0.072), 0.02)
    return smax(rock_shell(p), -sock, 0.018)
MOSS = [((0.0, 0.10, 1.0), 0.62), ((0.62, -0.70, 0.05), 0.30), ((-0.85, -0.35, 0.25), 0.30), ((0.70, 0.45, -0.20), 0.26),
        ((-0.40, 0.75, 0.10), 0.24)]
MOSS = [(nrm(d), r) for d, r in MOSS]
def moss_f(P):
    q = P[:, :3] - ROCK_C; D = q / np.maximum(L(q), 1e-9)[:, None]; d = np.full(len(P), 1.0)
    wob = 0.14 * np.sin(7 * D[:, 0] + 5 * D[:, 1] + 1.0) + 0.10 * np.sin(9 * D[:, 2] - 6 * D[:, 0]) + 0.07 * np.sin(13 * D[:, 1] + 5 * D[:, 2])
    for m, r in MOSS: d = np.minimum(d, np.arccos(np.clip(D @ m, -1, 1)) - r * (1 + wob))
    return d * ROCK_R
def seam_f(P):
    q = P[:, :3] - ROCK_C; D = q / np.maximum(L(q), 1e-9)[:, None]; return stone_terms(D)[0] - 0.0105
def build_rockball():
    th = list(np.linspace(0, 180, 27))
    rows = star_rows(rock_f, ROCK_C, [0, 0, 1], [0, -1, 0], np.radians(th), 52, 0.8)
    V, F = rows_mesh(rows)
    def paint(ins, Ac):
        q = Ac[:, :3] - ROCK_C; D = q / L(q)[:, None]; _, ids = stone_terms(D)
        o = np.where(ids % 3 == 0, 'stone2', 'stone').astype(object)
        o[ins['seam']] = 'stonedk'; o[ins['moss'] & ~ins['seam']] = 'moss'
        return o
    return Piece('rockball', V, F, sdf=rock_f, fields={'seam': seam_f, 'moss': moss_f}, paint=paint)
RK_TAIL = [tuple(np.array(c) + ROCK_C) for c in ((0.22, 0.16, 0.06), (0.40, 0.24, 0.10), (0.53, 0.22, 0.22), (0.56, 0.15, 0.35), (0.50, 0.08, 0.43))]
RKLEAF_PIV = np.array([0.0, 0.05, 0.917])
def rock_items():
    rb = process(build_rockball())
    hd = scaled_head(head_items(2) + jaw_items(), RK_S, RK_HC)
    tl = process(build_tail(RK_TAIL, 0.60, 'rocktail', 14, 12))
    items = [rb] + hd + [tl]
    cull_buried(items)
    return items
def rockleaf_items():
    top = ray_exit(rock_f, ROCK_C, np.array([[0.0, 0.05, 0.47]]) / L(np.array([0.0, 0.05, 0.47])), 0.8)[0]
    n_l = nrm(unit_normals(rock_f, top[None])[0] * 0.5 + np.array([0, -0.25, 1.0])); t_l = nrm(np.array([0.25, 1.0, 0.0])); x_l = np.cross(nrm(t_l - (t_l @ n_l) * n_l), n_l)
    blade, M = build_leaf_blade('rblade', top + np.array([0, -0.03, 0.0]), n_l, t_l, 0.26, 0.145, 0.022, rock_f, clr=0.003)
    stem = build_stem('rstem', top + np.array([0, -0.03, 0.006]), n_l, nrm(t_l - (t_l @ n_l) * n_l), x_l, r=0.017, scale=0.85)
    return [process(blade), process(stem)]

# =========================================================================================== the teakettle form (bunbuku chagama)
KET_PROF = [(0.0, 0.055), (0.15, 0.055), (0.25, 0.075), (0.315, 0.115), (0.35, 0.17), (0.362, 0.23), (0.356, 0.29), (0.338, 0.330),
            (0.346, 0.342), (0.338, 0.354), (0.310, 0.385), (0.278, 0.413), (0.258, 0.430), (0.261, 0.442), (0.265, 0.462),
            (0.256, 0.478), (0.236, 0.482), (0.222, 0.470), (0.212, 0.432), (0.0, 0.420)]
KH_S, KH_C = 0.78, np.array([0.0, -0.030, 0.712])
def build_kettle_body():
    V, F, A = lathe(KET_PROF, 40, 0.5)
    def f_hi(P):
        ph = np.arctan2(P[:, 1], P[:, 0]); a0 = math.radians(232)
        da = np.mod(ph - a0 + PI, 2 * PI) - PI; r = np.hypot(P[:, 0], P[:, 1])
        return np.maximum(ell2(da * 0.35, P[:, 2] - 0.300, 0.050, 0.032), 0.30 - r)
    def paint(ins, Ac):
        row = Ac[:, 3]; o = np.full(len(Ac), 'kettle', dtype=object)
        o[(row > 7.0) & (row < 10.0)] = 'kettledk'
        o[row > 17.0] = 'kettlein'
        o[ins['hi'] & (row < 7.0)] = 'kettlehi'
        return o
    return Piece('kettlebody', V, F, A=A, fields={'hi': f_hi}, paint=paint, orient=None, occluder=False)
def kettle_inside(P):   # (for culling the paws / tail / spout roots buried in the iron)
    r = np.hypot(P[:, 0], P[:, 1]); rm = np.interp(P[:, 2], [b for _, b in KET_PROF[:13]], [a for a, _ in KET_PROF[:13]])
    return np.where((P[:, 2] > 0.06) & (P[:, 2] < 0.42), rm - r, -1.0)
def kleg_f_k(x, y):
    c = np.array([x, y, 0.052])
    def f(p):
        d = sd_ell(p, c, (0.072, 0.082, 0.062))
        for j in (-1, 1):
            d = smin(d, sd_sph(p, c + np.array([j * 0.03, -0.065 if y < 0 else 0.065, -0.02]), 0.032), 0.016)
        return smax(d, -p[..., 2], 0.01)
    return f, c
SPOUT_CTRL = [(0.0, -0.270, 0.22), (0.0, -0.400, 0.26), (0.0, -0.500, 0.33), (0.0, -0.545, 0.41)]
def build_spout():
    def prof(s):
        r = 0.088 - 0.030 * s + 0.016 * max(0.0, (s - 0.80) / 0.20) ** 2; return (r, r)
    V, F, A, info = sweep(SPOUT_CTRL, 9, 14, prof, [0, 0, 1], caps=(True, True), cap_rings=2)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'kettle', dtype=object); o[Ac[:, 3] > 1.0005] = 'kettlein'; return o
    return Piece('spout', V, F, A=A, paint=paint, orient=curve_orient(SPOUT_CTRL), occluder=False), info
KT_TAIL = [(-0.22, 0.10, 0.20), (-0.40, 0.16, 0.18), (-0.56, 0.13, 0.28), (-0.62, 0.06, 0.42), (-0.57, 0.0, 0.53)]
def kettle_items():
    P = [build_kettle_body()]
    for x in (-0.19, 0.19):
        for y in (-0.14, 0.15):
            f, c = kleg_f_k(x, y)
            P.append(sdf_piece(f'kleg{x}{y}', f, c + np.array([0, 0, 0.01]), [0, 0, 1], [0, -1, 0], [0, 35, 70, 100, 140, 180], 14, 0.3, key='paw'))
    sp, info = build_spout(); P.append(sp)
    P.append(build_tail(KT_TAIL, 0.70, 'ktail', 14, 12))
    items = [process(p) for p in P]
    items[0]['inside'] = kettle_inside
    cull_buried(items)
    C, T = info['C'], info['T']
    tip = C[-1] + T[-1] * 0.040
    return items, tip

LID_PROF = [(0.0, 0.978), (0.028, 0.974), (0.044, 0.958), (0.040, 0.938), (0.030, 0.928), (0.060, 0.922), (0.140, 0.906),
            (0.210, 0.882), (0.255, 0.858), (0.276, 0.838), (0.272, 0.822), (0.250, 0.818), (0.180, 0.836), (0.0, 0.848)]
LID_TILT = rot([0, 1, 0], 0.09) @ rot([1, 0, 0], -0.24)
LID_C0 = np.array([0.0, 0.0, 0.85]); LID_UP = 0.040; LID_RS = 0.88; LID_BACK = 0.045
def lid_items():
    V, F, A = lathe([(r * LID_RS, h) for r, h in LID_PROF], 32, 0.5)
    V = (V - LID_C0) @ LID_TILT.T + LID_C0 + np.array([0.012, LID_BACK, LID_UP])
    def paint(ins, Ac):
        row = Ac[:, 3]; o = np.full(len(Ac), 'kettle', dtype=object)
        o[row < 4.5] = 'kettledk'; o[row > 10.5] = 'kettle_sh'
        return o
    return [process(Piece('lid', V, F, A=A, paint=paint, orient=None, occluder=False))]
SPROUT_BASE = (np.array([0.0, 0.0, 0.975]) - LID_C0) @ LID_TILT.T + LID_C0 + np.array([0.012, LID_BACK, LID_UP - 0.004])
def kleaf_items():
    out = []
    up = LID_TILT @ np.array([0, 0, 1.0])
    ctrl = [SPROUT_BASE - up * 0.01, SPROUT_BASE + up * 0.03, SPROUT_BASE + up * 0.055]
    V, F, A, _ = sweep(ctrl, 4, 8, lambda s: (0.016, 0.016), [1, 0, 0], caps=(True, True), cap_rings=2)
    out.append(process(Piece('sstem', V, F, A=A, paint=keyed('stem'), orient=curve_orient(ctrl), occluder=False)))
    top = SPROUT_BASE + up * 0.05
    for k in (-1, 1):
        t_l = nrm(np.array([k * 0.85, 0.12 * k, 0.55])); n_l = nrm(np.cross(t_l, [0, 1.0, 0]))
        if n_l[2] < 0: n_l = -n_l
        b, _ = build_leaf_blade(f'sprout{k}', top, n_l, t_l, 0.10, 0.055, 0.020, lambda P: np.full(len(P), 1.0), nseg=18,
                                cup=0.15, droop=0.05, veins=False)
        out.append(process(b))
    return out

# =========================================================================================== assemble + export
PIVOTS = dict(
    body=(0.0, 0.0, 0.0), belly=tuple(BELLY_PIV), tail=tuple(TAIL_PIV),
    armL=tuple(SHOULDER[-1]), armR=tuple(SHOULDER[1]), head=tuple(HEAD_PIV), jaw=tuple(JAW_PIV),
    blush=(0.0, -0.03, 0.825), hat=(0.0, 0.03, 1.01), leaf=tuple(LEAF_BASE),
    rock=tuple(ROCK_C), rockLeaf=tuple(RKLEAF_PIV),
    kettle=(0.0, 0.0, 0.0), lid=(0.0, 0.0, 0.48), khead=(0.0, -0.2, 0.52), kLeaf=tuple(SPROUT_BASE),
)
FORMS = dict(tanuki=['body', 'belly', 'tail', 'armL', 'armR', 'head', 'jaw', 'blush', 'hat', 'leaf', 'bellyTip'],
             rock=['rock', 'rockLeaf'], kettle=['kettle', 'lid', 'khead', 'kLeaf', 'spout'])

def make_empty(name, loc):
    ob = bpy.data.objects.new(name, None); ob.empty_display_size = 0.05
    bpy.context.scene.collection.objects.link(ob); ob.location = Vector(loc); return ob

def export(path, names=None):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in bpy.context.scene.objects:
        if names is None or ob.name in names: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_attributes=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_texcoords=False,
                              export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_materials='EXPORT')

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    np.random.seed(7)
    kettle_its, spout_tip = kettle_items()
    parts = dict(
        body=body_items(), belly=belly_items(), tail=tail_items(), armL=arm_items(-1), armR=arm_items(1),
        head=head_items(1), jaw=jaw_items(), blush=blush_items(), hat=hat_items(), leaf=leaf_items(),
        rock=rock_items(), rockLeaf=rockleaf_items(),
        kettle=kettle_its, lid=lid_items(), khead=scaled_head(head_items(2) + jaw_items(), KH_S, KH_C), kLeaf=kleaf_items(),
    )
    obs = {n: make_object(n, its, PAL, np.asarray(PIVOTS[n], float)) for n, its in parts.items()}
    make_empty('bellyTip', (0.0, -0.405, 0.36)); make_empty('spout', tuple(spout_tip))
    stats = {n: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for n, ob in obs.items()}
    stats['pieces'] = {f'{n}.{it["name"]}': len(it['T']) for n, its in parts.items() for it in its}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs.values())
    stats['forms'] = {f: sum(stats[n]['tris'] for n in ns if n in stats) for f, ns in FORMS.items()}
    stats['markers'] = {'bellyTip': [0.0, -0.405, 0.36], 'spout': [round(float(x), 4) for x in spout_tip]}
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'danzaburo.blend'))
    export(os.path.join(MODELS, 'danzaburo.glb'))
    os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
    for f, ns in FORMS.items():
        export(os.path.join(TASK_DIR, 'work', f'form_{f}.glb'), set(ns))
    print('DANZA', json.dumps({k: v for k, v in stats.items() if k != 'pieces'}))
    with open(os.path.join(TASK_DIR, 'work', 'build_stats.json'), 'w', encoding='utf-8') as fh:
        json.dump(stats, fh, indent=1)
    return stats

if __name__ == '__main__':
    build()
