"""Kappa (Shiokaze Tidepools, enemy series EN-1) -- deterministic build, Option A "Pond Rascal" (refs/sheet.png).

Blender 4.3:
  blender --background --factory-startup --python build_kappa.py [-- --variant base|umi|kyuri|all]

Builds every variant from an empty scene, saves kappa.blend (the base) and exports
public/models/kappa.glb, kappa_umi.glb and kappa_kyuri.glb.
Units: metres, front = -Y, ground z = 0, character left = +X.

Enemy contract (.claude/skills/codex-blender/templates/enemy-model-contract.md):
  rigid parts, no rig, no UVs, no textures; one face-corner colour attribute `Col`; one material `toon`.
  body  : origin (0, 0, 0)            torso, belly, shell + rim, legs, feet (umi: the starfish)
  head  : origin NECK  (the neck ball's centre)   head, neck ball, face, beak, dish, hair
  arms  : origin AXLE  (the shoulder axle: both shoulder balls' centres)   both arms + hands (kyuri: the cucumber)
  water : origin WATER_O (the centre of the water surface)   the water disc + its glint
  The neck and shoulder joints are spheres centred on the pivots, so they turn in place: no gap at any angle.
  The pivots are the same in every variant.

Technique (the framework of the approved bamboo / maple enemies, build_kamaitachi.py / build_kakashi.py):
- Head, torso, shell, hands, feet, beak, hair lobes are implicit surfaces (smooth unions of ellipsoids /
  superquadrics) sampled as star-shaped grids (rays from a centre, root-found onto the surface).
- Arms, legs, cucumber are parametric sweeps; the dish and the water are lathes; the shell rim is a closed tube.
- Colour borders are cut into the mesh as level-set contours of feature fields (belly, scutes, seams, rim band,
  water glint, cucumber stripes) so every border runs along an edge loop; face features are decal shells lying on
  the head (eyes, brows, blush) so the ink hull never rings them.
- Faces buried more than 3.5 cm inside another shell of the same part are culled (never across parts: the parts turn).
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/kappa'
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

# =========================================================================================== palettes (sRGB hex)
COMMON = {
    'eye': '#292125', 'iristop': '#292125', 'iris': '#4a3029', 'eyewhite': '#fff6ea', 'catch': '#ffffff',
    'floor': '#dcecee', 'glint': '#ffffff', 'star': '#ff8a4a', 'starc': '#ffa25a',
    'cuke': '#3e8a2a', 'cukest': '#6ab83a', 'nub': '#ffd84a', 'blush': '#e98c91',
}
VARIANTS = {
    'base':  dict(skin='#6ec452', belly='#f6e6a0', shell='#4e7a3c', scute='#94b858', rim='#e6d69c', beak='#ffc53a',
                  hands='#a8d86a', hair='#2e5a3a', dish='#f6f1e2', water='#5fe0ee'),
    'umi':   dict(skin='#5ab8c4', belly='#f0f4e0', shell='#35598a', scute='#6c9cc8', rim='#ece2c8', beak='#ffb14a',
                  hands='#8ad8e0', hair='#1f3f66', dish='#fff8ee', water='#a8f4ff', starfish=True),
    'kyuri': dict(skin='#a2cc48', belly='#fff0b8', shell='#7a6434', scute='#bca060', rim='#f2e2aa', beak='#ffd24a',
                  hands='#c8e070', hair='#5a4428', dish='#f6f1e2', water='#62e6d8', cucumber=True),
}

# =========================================================================================== pivots (all variants)
NECK = np.array([0.0, 0.02, 0.45])           # head pivot: the neck ball's centre (the sheet's dark neck ring)
AXLE = np.array([0.0, 0.02, 0.365])         # arms pivot: the shoulder axle through both shoulder balls
DISH_C = np.array([0.0, 0.02])              # the dish axis (x, y), a touch behind the head centre as on the sheet
WATER_Z = 0.866
WATER_O = np.array([DISH_C[0], DISH_C[1], WATER_Z])
NECK_R = 0.105
SHOULDER_X, SHOULDER_R = 0.152, 0.055

# =========================================================================================== head
HC = np.array([0.0, -0.01, 0.630]); HR = (0.292, 0.282, 0.250)
CROWN_Z = 0.806                              # the crown is flattened under the dish (hidden inside it)
def head_base(p):
    d = smax(sd_ell(p, HC, HR), 0.452 - p[..., 2], 0.07)        # a soft ball (the sheet): widest at the cheeks, curving in to the top
    d = smax(d, 0.6 * p[..., 1] - 0.8 * (p[..., 2] - 0.47) - 0.085, 0.05)   # the lower back tucked in (the sheet's side view; clears the shell)
    return smin(d, superq(p, (0.0, -0.100, 0.545), (0.252, 0.190, 0.085), 2.0, 3.0), 0.05)   # the full cheeks: a wide, flat-bottomed bun

EYE_X, EYE_Z = 0.136, 0.600
EX, EY = 0.059, 0.070                        # eye half-sizes (the sheet: 0.12 x 0.15 m with the outline)
EYES = {}
for _k in (-1, 1):
    _pe = hit_front(head_base, _k * EYE_X, EYE_Z)
    _n = unit_normals(head_base, _pe[None])[0]
    _A = nrm(_n * 0.85 + np.array([0, -1, 0]) * 0.15)
    _U = nrm(np.cross([0, 0, 1], _A)); _V = np.cross(_A, _U)
    EYES[_k] = (_pe, _A, _U, _V)

def head_sdf0(p):
    d = head_base(p)
    for k in (-1, 1):
        pe, A_, U_, V_ = EYES[k]
        R = np.stack([U_, V_, A_], 1)
        d = smin(d, sd_ell(p, pe - A_ * 0.020, (EX * 1.03, EY * 1.03, 0.027), R), 0.014)   # domed eye lens
    return d
def head_sdf(p):
    return smax(head_sdf0(p), p[..., 2] - CROWN_Z, 0.02)

IRIS = dict(du=-0.010, dv=0.004, ru=0.052, rv=0.067)   # the irises sit toward the beak: white shows on the outer side
def iris_c(k): return IRIS['du'] * k, IRIS['dv']
def eye_dark2(u, v, k):
    rim = ell2(u, v, EX + 0.0050, EY + 0.0050)
    lash = np.maximum(ell2(u, v - 0.004, EX + 0.0060, EY + 0.0085), -(v + 0.010))
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
SKIRT = (0.0045, -0.0022)
PUPIL_R = 0.020
def skin_key(P): return np.full(len(P), 'skin', dtype=object)

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
        u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (-0.030 + 2.4 * u * u)
    def f_cl(P):
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu + 0.016, v - cv - 0.022) - 0.0135
    def f_cs(P):
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu - 0.019, v - cv + 0.027) - 0.0062
    def paint(ins, Ac):
        b, w = Ac[:, 3], Ac[:, 4]
        o = np.full(len(Ac), 'eye', dtype=object)
        o[(b > 2) & (b < 3) & (w > 0.999)] = 'eyewhite'
        iris = (b > 0.5) & (b < 2.0001)
        o[(b < 2.0001)] = 'iristop'; o[(b < 2.0001) & ins['low']] = 'iris'
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

def build_brow(k):
    """a short thick cross brow: high at the outer end, dipping toward the beak (cheeky-determined)"""
    C = np.array([hit_front(head_sdf, k * x, z) for x, z in ((0.160, 0.730), (0.130, 0.716), (0.102, 0.702), (0.076, 0.689))])
    return decal_strip(C, lambda s: 0.0075 + 0.0030 * math.sin(PI * s) ** 0.8, 0.0035, 5, 'brow', f'brow{k}', ncol=5)

CHEEK = {}
for _k in (-1, 1):
    _pc = hit_front(head_base, _k * 0.182, 0.540)
    _n = unit_normals(head_base, _pc[None])[0]; _U = nrm(np.cross([0, 0, 1], _n)); _V = np.cross(_n, _U)
    CHEEK[_k] = (_pc, _n, _U, _V)
def build_blush(k):
    pc_, n0, U_, V_ = CHEEK[k]
    nseg = 8; ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [project(head_sdf, pc_[None], 3) + n0 * 0.0012], [np.array([[0.0]])]
    for x, h in ((1.0, 0.0012), (1.0 + SKIRT[0] / 0.03, SKIRT[1])):
        P = pc_ + (0.034 * x * np.cos(ang))[:, None] * U_ + (0.023 * x * np.sin(ang))[:, None] * V_
        P = project(head_sdf, P, 3); rows.append(P + unit_normals(head_sdf, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'blush', dtype=object); skm = Ac[:, 3] > 1.0001
        o[skm] = 'skin'; return o
    return Piece(f'blush{k}', V, F, A=A, paint=paint, nsdf=head_sdf, orient=head_up)

def build_head():
    th = np.radians([0, 12, 24, 37, 51, 65, 80, 95, 111, 129, 152, 180])
    ctr = np.array([0, -0.02, 0.65])
    lenses = [(nrm(EYES[k][0] - ctr), 0.30, 0.6) for k in (-1, 1)]
    rows = star_rows(head_sdf, ctr, [0, -1, 0], [0, 0, 1], th, 24, 0.6, lenses=lenses)
    V, F = rows_mesh(rows)
    return Piece('headball', V, F, sdf=head_sdf, paint=keyed('skin'))

def neck_f(p): return sd_sph(p, NECK, NECK_R)
def build_neck():
    th = np.radians([0, 50, 72, 86, 98, 112, 135, 180])
    rows = star_rows(neck_f, NECK, [0, 0, 1], [0, -1, 0], th, 12, 0.3)
    V, F = rows_mesh(rows)
    return Piece('neck', V, F, sdf=neck_f, paint=keyed('neck'))

# ----------------------------------------------------------------------- the duck beak: upper bill over a lower bill
def beak_up_f(p):
    d = sd_ell(p, (0.0, -0.290, 0.574), (0.094, 0.074, 0.052))
    return smin(d, sd_ell(p, (0.0, -0.300, 0.530), (0.124, 0.078, 0.033)), 0.03)
def beak_lo_f(p): return sd_ell(p, (0.0, -0.284, 0.502), (0.080, 0.059, 0.024))
def build_beak():
    th = np.radians([0, 22, 45, 68, 90, 115, 145, 180])
    rows = star_rows(beak_up_f, np.array([0, -0.30, 0.545]), [0, -1, 0], [0, 0, 1], th, 15, 0.3)
    V, F = rows_mesh(rows)
    up = Piece('beak_up', V, F, sdf=beak_up_f, paint=keyed('beak'))
    th = np.radians([0, 30, 60, 90, 125, 180])
    rows = star_rows(beak_lo_f, np.array([0, -0.29, 0.502]), [0, -1, 0], [0, 0, 1], th, 12, 0.3)
    V, F = rows_mesh(rows)
    lo = Piece('beak_lo', V, F, sdf=beak_lo_f, paint=keyed('beaklo'))
    return [up, lo]

# ----------------------------------------------------------------------- the dish (sara) and the water
# (r, z) from the buried underside, up the outer wall, over the thick rounded rim, down the inner wall to the floor
# The inside is a gentle saucer (slopes under 35 deg): a concave bowl's inverted-hull ink would otherwise show as a
# dark ring inside the dish from the 45-degree camera once the water drains.
# round 2: a thin rounded rim (a ring ~4.5 cm tube) sunk into the hair, not a wall
DISH_PROF = [(0.0, 0.800), (0.150, 0.804), (0.180, 0.822), (0.196, 0.840), (0.204, 0.859), (0.198, 0.874),
             (0.185, 0.880), (0.170, 0.875), (0.150, 0.858), (0.100, 0.836), (0.0, 0.830)]
DISH_FLOOR_ROW = 8                            # faces whose corners are all on rows >= this: the pale floor
def build_dish():
    V, F, A = lathe(DISH_PROF, 18)
    V[:, 0] += DISH_C[0]; V[:, 1] += DISH_C[1]
    def paint(ins, Ac):
        o = np.full(len(Ac), 'dish', dtype=object); o[Ac[:, 3] > DISH_FLOOR_ROW - 0.01] = 'floor'; return o
    return Piece('dish', V, F, A=A, paint=paint)

WATER_PROF = [(0.0, WATER_Z), (0.128, WATER_Z), (0.150, WATER_Z - 0.0008),
              (0.160, WATER_Z - 0.004), (0.146, WATER_Z - 0.008), (0.0, WATER_Z - 0.008)]
def build_water():
    V, F, A = lathe(WATER_PROF, 14)
    V[:, 0] += DISH_C[0]; V[:, 1] += DISH_C[1]
    def f_glint(P):
        x = P[:, 0] - DISH_C[0] + 0.058; y = P[:, 1] - DISH_C[1] - 0.060
        a = -0.55; u = math.cos(a) * x + math.sin(a) * y; v = -math.sin(a) * x + math.cos(a) * y
        return np.maximum(ell2(u, v, 0.046, 0.017), (WATER_Z - 0.002) - P[:, 2])
    def f_edge(P):
        r = np.hypot(P[:, 0] - DISH_C[0], P[:, 1] - DISH_C[1]); return 0.124 - r
    def paint(ins, Ac):
        o = np.full(len(Ac), 'water', dtype=object); o[ins['edge']] = 'waterlt'; o[ins['glint']] = 'glint'; return o
    return Piece('water', V, F, A=A, fields={'glint': f_glint, 'edge': f_edge}, paint=paint,
                 )

# ----------------------------------------------------------------------- the hair: chunky rounded lobes round the dish
HAIR_NL, HAIR_PHIMAX = 7, math.radians(150)    # seven 40-degree lobes round the back, sides and front corners; the mid forehead clear
HAIR_ZB, HAIR_NOTCH, HAIR_TOP, HAIR_IN = 0.700, 0.078, 0.828, -0.012
def build_hair():
    """the okappa mop: one thick cap hugging the head under the dish, its lower edge scalloped into nine rounded
    lobes that puff out (thick in the middle of each lobe and toward its rounded bottom, creased between).
    A parametric sheet: one profile ring per azimuth column (outer face top->bottom, a rounded lip, the buried inner
    face), so the scalloped edge runs exactly along the mesh"""
    per = 7; M = per * HAIR_NL
    phis = np.linspace(-HAIR_PHIMAX, HAIR_PHIMAX, M + 1)
    TZ = [0.0, 0.22, 0.55, 0.86, 1.0]
    def surf(z, e):
        S = ray_exit(head_base, np.array([DISH_C[0], DISH_C[1], z]), e[None], 0.5)[0]
        return S, unit_normals(head_base, S[None])[0]
    rows = []
    for i, ph in enumerate(phis):
        f = (ph + HAIR_PHIMAX) / (2 * HAIR_PHIMAX) * HAIR_NL
        u = (f % 1.0) - 0.5 if i < M else 0.5
        lobe = min(int(f), HAIR_NL - 1)
        w = math.sqrt(max(0.0, 1 - (2 * u) ** 2))
        zb = HAIR_ZB + HAIR_NOTCH * (1 - w)
        e = np.array([math.sin(ph), math.cos(ph), 0.0]); td = np.array([math.cos(ph), -math.sin(ph), 0.0])
        aph = abs(ph); prof = 0.85 + 0.45 * math.cos(min(aph, PI / 2)) ** 2 + 0.55 * min(1.0, max(0.0, (aph - 1.6) / 0.5))
        th0 = 0.018 + (0.032 + 0.006 * (lobe % 2)) * w ** 0.6 * prof
        ring = []
        for t in TZ:
            S, n = surf(HAIR_TOP + (zb - HAIR_TOP) * t, e)
            ring.append(S + n * th0 * (0.45 if t == 0 else 0.75 + 0.45 * math.sin(PI * (0.2 + 0.6 * t))))   # tucked under the rim, puffed in the middle
        Sb, nb = surf(zb, e)
        g = nrm(np.cross(nb, td)); g = g if g[2] < 0 else -g
        c = Sb + nb * (th0 + HAIR_IN) / 2; rad = (th0 - HAIR_IN) / 2
        for a in (math.radians(55), math.radians(115)):
            ring.append(c + nb * rad * math.cos(a) + g * rad * math.sin(a) * 0.9)
        ring.append(Sb + nb * HAIR_IN)
        rows.append(np.array(ring))
    rows[0] = rows[0].mean(0)[None]; rows[-1] = rows[-1].mean(0)[None]
    V, F = rows_mesh(rows)
    return [Piece('hair', V, F, paint=keyed('hair'))]

def build_head_items(v):
    P = [build_head(), build_neck(), build_eye(-1), build_eye(1), build_brow(-1), build_brow(1),
         build_blush(-1), build_blush(1), build_dish()] + build_beak() + build_hair()
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== body
def torso_f(p):
    d = sd_ell(p, (0.0, -0.045, 0.215), (0.208, 0.168, 0.152))
    return smin(d, sd_ell(p, (0.0, -0.042, 0.318), (0.142, 0.134, 0.080)), 0.05)
def build_torso():
    th = np.radians([0, 18, 36, 54, 72, 90, 108, 126, 150, 180])
    rows = star_rows(torso_f, np.array([0, -0.04, 0.25]), [0, 0, 1], [0, -1, 0], th, 18, 0.5)
    V, F = rows_mesh(rows)
    fields = {'belly': lambda P: np.maximum(ell2(P[:, 0], P[:, 2] - 0.243, 0.164, 0.158), P[:, 1] + 0.06)}
    def paint(ins, Ac):
        o = np.full(len(Ac), 'skin', dtype=object); o[ins['belly']] = 'belly'; return o
    return Piece('torso', V, F, sdf=torso_f, fields=fields, paint=paint)

SH_C = np.array([0.0, 0.080, 0.245]); SH_R = (0.209, 0.215, 0.186); SH_TILT = 0.20   # the top tilted back ~11 deg, a touch lower (the head tips back over it)
SH_RW = rot([1, 0, 0], -SH_TILT)             # local -> world
def shell_local(p): return (np.asarray(p, float) - SH_C) @ SH_RW
def shell_f(p):
    q = shell_local(p)
    return smax(sd_ell(q, (0, 0, 0), SH_R), 0.006 - q[..., 1], 0.02)
PENT = [np.array([math.cos(PI / 2 + 2 * PI * i / 5), math.sin(PI / 2 + 2 * PI * i / 5)]) * 0.40 for i in range(5)]
def seam_dist_uv(u, v):
    segs = [(PENT[i], PENT[(i + 1) % 5]) for i in range(5)] + [(p, p * 3.2) for p in PENT]
    best = np.full(np.shape(u), 9.0)
    for a, b in segs:
        ab = b - a; t = clamp01(((u - a[0]) * ab[0] + (v - a[1]) * ab[1]) / (ab @ ab))
        best = np.minimum(best, np.hypot(u - a[0] - t * ab[0], v - a[1] - t * ab[1]))
    return best
def build_shell():
    th = np.radians([0, 15, 30, 45, 60, 75, 90, 120, 160, 180])
    rows = star_rows(shell_f, SH_C + SH_RW @ np.array([0, 0.03, 0]), SH_RW @ np.array([0, 1.0, 0]), SH_RW @ np.array([0, 0, 1.0]),
                     th, 14, 0.5)
    V, F = rows_mesh(rows)
    def uv(P):
        # azimuthal map of the dome: rho 0 at the back pole, 1 at the base edge (so the side wall carries scutes too)
        q = shell_local(P[:, :3]); dn = q / np.asarray(SH_R); dn = dn / np.maximum(L(dn), 1e-9)[:, None]
        rho = np.arccos(np.clip(dn[:, 1], -1, 1)) / (PI / 2); al = np.arctan2(dn[:, 2], dn[:, 0])
        return rho * np.cos(al), rho * np.sin(al), q[:, 1]
    def f_seam(P):
        u, v, _ = uv(P); return seam_dist_uv(u, v) * 0.2 - 0.0135
    def f_rim(P):
        u, v, y = uv(P); return np.minimum((0.86 - np.hypot(u, v)) * 0.25, y - 0.012)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'scute', dtype=object); o[ins['seam']] = 'shell'; o[ins['rim']] = 'rim'; return o
    return Piece('shell', V, F, sdf=shell_f, fields={'seam': f_seam, 'rim': f_rim}, paint=paint,
                 refine=[(('seam',), 0.011, 0.045)])
def build_shell_rim():
    n = 18; t = 2 * PI * np.arange(n) / n
    Cl = np.stack([SH_R[0] * 1.005 * np.cos(t), np.full(n, 0.014), SH_R[2] * 1.005 * np.sin(t)], -1)
    C = Cl @ SH_RW.T + SH_C
    Nl = np.stack([np.cos(t) / SH_R[0], np.zeros(n), np.sin(t) / SH_R[2]], -1); Nl /= L(Nl)[:, None]
    Nw = Nl @ SH_RW.T; Bw = SH_RW @ np.array([0, 1.0, 0])
    def frame(i, T): return Nw[i], Bw
    top = np.clip(np.sin(t), 0, 1) ** 2                       # slimmer at the top, behind the neck (the head tips back over it)
    V, F, A = loop_tube(C, 5, lambda i: (0.021 * (1 - 0.50 * top[i]), 0.026 * (1 - 0.50 * top[i])), frame=frame, expo=2.2)
    return Piece('shellrim', V, F, A=A, paint=keyed('rim'))

def build_leg(k):
    a = np.array([k * 0.105, -0.025, 0.17]); b = np.array([k * 0.135, -0.03, 0.035])
    V, F, A, _ = sweep([a, .5 * (a + b), b], 3, 8, lambda s: (0.056, 0.056), [1, 0, 0], caps=(False, False))
    return Piece(f'leg{k}', V, F, A=A, paint=keyed('skin'), orient=seg_orient(a, b), occluder=False)

def foot_f_k(k):
    fc = np.array([k * 0.156, 0.000, 0.034]); yaw = k * 0.14
    def f(p):
        d = sd_ell(p, fc, (0.088, 0.108, 0.036))
        for a, ln in ((-0.52, 0.114), (0.0, 0.132), (0.52, 0.114)):      # round 3: sausage toes with ball tips (5 cm)
            dr = np.array([math.sin(a + yaw), -math.cos(a + yaw), 0.0])
            z0 = np.array([0, 0, -0.008])
            d = smin(d, sd_cap(p, fc + dr * 0.045 + z0, fc + dr * ln + z0, 0.025), 0.024)
        return smax(d, -p[..., 2] - 0.005, 0.020)            # (a softly rounded sole edge; its lowest point on z = 0)
    return f, fc
def build_foot(k):
    f, fc = foot_f_k(k)
    th = np.radians([0, 45, 82, 110, 180])
    rows = star_rows(f, fc + np.array([0, -0.02, 0.0]), [0, 0, 1], [0, -1, 0], th, 24, 0.4,
                     lenses=[(np.array([math.sin(k * 0.14), -math.cos(k * 0.14), 0]), 1.1, 0.4)])
    V, F = rows_mesh(rows)
    return Piece(f'foot{k}', V, F, sdf=f, paint=keyed('hands'))

STAR_UV = (0.78, 0.42)
def build_starfish():
    u, v = STAR_UV; ql = np.array([u * SH_R[0], SH_R[1] * math.sqrt(max(0.0, 1 - u * u - v * v)), v * SH_R[2]])
    S = project(shell_f, (ql @ SH_RW.T + SH_C)[None], 4)[0]; n = unit_normals(shell_f, S[None])[0]
    t0 = nrm(np.cross(n, [1.0, 0, 0])); t1 = np.cross(n, t0)
    c = S + n * 0.008
    def f(p):
        d = sd_ell(p, c, (0.034, 0.034, 0.020), np.stack([t0, t1, n], 1))
        for i in range(5):
            a = 2 * PI * i / 5 + 0.3; dr = math.cos(a) * t0 + math.sin(a) * t1; sd = np.cross(n, dr)
            d = smin(d, sd_ell(p, c + dr * 0.046, (0.052, 0.023, 0.016), np.stack([dr, sd, n], 1)), 0.016)
        return d
    rows = star_rows(f, c, n, t0, np.radians([0, 40, 70, 90, 110, 150, 180]), 20, 0.2)
    V, F = rows_mesh(rows)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'star', dtype=object); o[ins['c']] = 'starc'; return o
    return Piece('starfish', V, F, sdf=f, fields={'c': lambda P: L(P[:, :3] - c) - 0.024}, paint=paint)

def build_body_items(v):
    P = [build_torso(), build_shell(), build_shell_rim(), build_leg(-1), build_leg(1), build_foot(-1), build_foot(1)]
    if v.get('starfish'): P.append(build_starfish())
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== arms
def arm_ctrl(k):
    s = np.array([k * SHOULDER_X, AXLE[1], AXLE[2]])
    return [s, np.array([k * 0.228, 0.002, 0.318]), np.array([k * 0.264, -0.010, 0.260])]
def hand_frame(k):
    C = arm_ctrl(k); d = nrm(C[2] - C[1])
    npal = np.array([-k * 0.35, -1.0, 0.45]); npal = nrm(npal - (npal @ d) * d)    # the broad face toward the 45-deg camera
    s = np.cross(npal, d)
    return C[2] + d * 0.046, d, s, npal
def hand_f_k(k):
    cp, d, s, npal = hand_frame(k)
    R0 = np.stack([s, d, npal], 1)
    def f(p):
        dd = sd_ell(p, cp, (0.070, 0.064, 0.028), R0)
        for a, ln in ((-0.50, 0.098), (0.0, 0.108), (0.50, 0.098)):      # round 3: sausage fingers with ball tips (4.6 cm)
            fd = math.cos(a) * d + math.sin(a) * s
            dd = smin(dd, sd_cap(p, cp + fd * 0.040, cp + fd * ln, 0.023), 0.022)
        return dd
    return f, cp, d, s, npal
def build_arm(k):
    C = arm_ctrl(k)
    V, F, A, _ = sweep(C, 5, 9, lambda s: (0.046 - 0.006 * s, 0.046 - 0.006 * s), [0, -1, 0], caps=(False, False))
    arm = Piece(f'arm{k}', V, F, A=A, paint=keyed('skin'), orient=seg_orient(C[0], C[2]), occluder=False)
    sc = C[0]; fsh = lambda p, c_=sc: sd_sph(p, c_, SHOULDER_R)
    rows = star_rows(fsh, sc, [k, 0, 0], [0, 0, 1], np.radians([0, 45, 90, 135, 180]), 10, 0.2)
    V, F = rows_mesh(rows)
    sh = Piece(f'shoulder{k}', V, F, sdf=fsh, paint=keyed('skin'))
    f, cp, d, s, npal = hand_f_k(k)
    rows = star_rows(f, cp, npal, d, np.radians([0, 45, 80, 100, 135, 180]), 30, 0.3,
                     lenses=[(d, 1.25, 0.45)])
    V, F = rows_mesh(rows)
    hand = Piece(f'hand{k}', V, F, sdf=f, paint=keyed('hands'))
    return [arm, sh, hand]

def build_cucumber():
    """kyuri: a chunky striped cucumber held upright in front of the right (-X) hand, a yellow flower nub on top"""
    cp, d, s, npal = hand_frame(-1)
    base = cp + npal * 0.064 + np.array([0.030, -0.020, 0.040])
    a = base + np.array([0.004, 0.0, -0.140]); m = base + np.array([-0.014, -0.010, 0.0]); b = base + np.array([0.012, -0.024, 0.150])
    V, F, A, info = sweep([a, m, b], 4, 8, lambda s_: (0.041 - 0.008 * (2 * s_ - 1) ** 2, 0.041 - 0.008 * (2 * s_ - 1) ** 2),
                          [1, 0, 0], caps=(True, True), cap_rings=1)
    def f_st(P):
        c, sn = P[:, 4], P[:, 5]; c4 = 8 * c ** 4 - 8 * c ** 2 + 1
        return np.maximum((0.30 - c4) * 0.02, np.maximum(0.07 - P[:, 3], P[:, 3] - 0.93) * 0.2)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'cuke', dtype=object); o[ins['st']] = 'cukest'; return o
    cuke = Piece('cucumber', V, F, A=A, fields={'st': f_st}, paint=paint, orient=seg_orient(a, b), occluder=False)
    T = info['T'][-1]; nc = b + T * 0.030
    fn = lambda p, c_=nc: sd_ell(p, c_, (0.024, 0.024, 0.020))
    rows = star_rows(fn, nc, T, [1, 0, 0], np.radians([0, 45, 90, 135, 180]), 8, 0.1)
    V, F = rows_mesh(rows)
    return [cuke, Piece('nub', V, F, sdf=fn, paint=keyed('nub'))]

def build_arm_items(v):
    P = build_arm(-1) + build_arm(1)
    if v.get('cucumber'): P += build_cucumber()
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== assemble
def palette(v):
    pal = dict(COMMON); pal.update({k: x for k, x in v.items() if isinstance(x, str)})
    pal['skin_sh'] = mulhex(pal['skin'], 0.80)
    pal['neck'] = mulhex(pal['skin'], 0.80)
    pal['hands_sh'] = mulhex(pal['hands'], 0.84)
    pal['belly_sh'] = mulhex(pal['belly'], 0.90)
    pal['beak_sh'] = mulhex(pal['beak'], 0.86)
    pal['beaklo'] = mulhex(pal['beak'], 0.88)
    pal['brow'] = pal['hair']
    pal['hair_sh'] = mulhex(pal['hair'], 0.82)
    pal['waterlt'] = lighten(pal['water'], 0.35)
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
             'arms': (build_arm_items(v), AXLE), 'water': ([process(build_water())], WATER_O)}
    obs = [make_object(n, its, pal, o) for n, (its, o) in parts.items()]
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['pieces'] = {it['name']: len(it['T']) for its, _ in parts.values() for it in its}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    fn = 'kappa' + ('' if vname == 'base' else '_' + vname)
    if vname == 'base':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'kappa.blend'))
    export(fn)
    print('KAPPA', vname, json.dumps(stats))
    return stats

if __name__ == '__main__':
    names = list(VARIANTS) if WANT == 'all' else [WANT]
    allstats = {}
    for n in names:
        allstats[n] = build_variant(n)
    os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
    with open(os.path.join(TASK_DIR, 'work', 'build_stats.json' if WANT == 'all' else f'build_stats_{WANT}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=1)
