"""Akaname (Onsen Caverns, enemy series EN-1) -- deterministic build, Option A "Bathhouse Imp" (refs/sheet.png).

Blender 4.3:
  blender --background --factory-startup --python build_akaname.py [-- --variant base|yuzu|elder|all]

Builds every variant from an empty scene, saves akaname.blend (the base) and exports
public/models/akaname.glb, akaname_yuzu.glb and akaname_elder.glb.
Units: metres, front = -Y, ground z = 0, character left = +X.

Enemy contract (.claude/skills/codex-blender/templates/enemy-model-contract.md):
  rigid parts, no rig, no UVs, no textures; one face-corner colour attribute `Col`; one material `toon`.
  body   : origin (0, 0, 0)   head, face, ears, hair, horns, towel / hachimaki, torso, belly, tail, legs, feet, claws
  tongue : origin TONGUE_O (in the mouth, at the tongue's root)  a plain pink tube along -Y, 0.17 m, round tip
  armL   : origin SHOULDER(+1) (the +X shoulder ball's centre)   arm + hand + claws
  armR   : origin SHOULDER(-1) (the -X shoulder ball's centre)   arm + hand + claws + the tawashi brush (the sheet
           has the brush in the creature's RIGHT (-X) hand, as the game's procedural model; the brief table said +X)
  The shoulders are balls centred on the pivots, so the arms turn in place without gaps.

Technique: the framework of the approved kappa (build_kappa.py): implicit surfaces (smooth unions of ellipsoids /
superquadrics) sampled as star-shaped grids, parametric sweeps and lathes, colour borders cut into the mesh as
level-set contours, face features as decal shells lying on the head, buried faces culled.
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/akaname'
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
        if key + '_hi' in pal:                                   # (akaname) a soft top light: the sheet's light skin
            m = np.repeat(keys == key, 3); nz = N[li][m, 2]
            t = (clamp01((nz - 0.25) / 0.75) ** 1.3 * pal.get(key + '_hik', 0.45))[:, None]
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


# =========================================================================================== palettes (sRGB hex)
COMMON = {
    'eye': '#282028', 'iristop': '#282028', 'iris': '#4a2e2c', 'eyewhite': '#fff6ea', 'catch': '#ffffff',
    'horn': '#ecdcbc', 'claw': '#f3e6cc', 'tongue': '#f28da7', 'groove': '#df6f90',
    'mouth': '#341222', 'mouthin': '#c25472', 'wood': '#8a5228', 'brow': '#2e1c28',
}
VARIANTS = {
    'base':  dict(skin='#e8463e', skinhi='#ff7a64', belly='#ffb49a', hair='#24182a', hairhi='#5a4a6a',
                  towel='#fbf8f2', stripe='#3a6ec0', blush='#ffb0b8', brush='#b57a45'),
    'yuzu':  dict(skin='#f05a32', skinhi='#ff8e5a', belly='#ffc49a', hair='#2a1a1e', hairhi='#5e4448',
                  towel='#5a8ad8', stripe='#fbf8f2', blush='#ffc0a0', brush='#b57a45', yuzu=True),
    'elder': dict(skin='#b42a3a', skinhi='#dc4c56', belly='#f08e8a', hair='#d8d2d0', hairhi='#f4f0ee',
                  towel='#f8f4ec', stripe='#c83a3a', blush='#f4949e', brush='#b57a45', brow='#f6f2ec', elder=True),
}

# =========================================================================================== pivots (all variants)
SHOULDER_X, SHOULDER_Y, SHOULDER_Z, SHOULDER_R = 0.192, -0.025, 0.312, 0.052
def SHOULDER(k): return np.array([k * SHOULDER_X, SHOULDER_Y, SHOULDER_Z])

# =========================================================================================== head
HC = np.array([0.0, -0.020, 0.565]); HR = (0.245, 0.235, 0.200)
def head_base(p):
    d = sd_ell(p, HC, HR)
    d = smin(d, superq(p, (0.0, -0.045, 0.458), (0.240, 0.180, 0.104), 2.0, 3.0), 0.085)  # the full cheeks: a wide, flat-bottomed bun
    return smax(d, 0.360 - p[..., 2], 0.04)                                                # a soft, flat-ish chin

EYE_X, EYE_Z = 0.129, 0.550
EX, EY = 0.051, 0.062                         # the open eye (the sheet: 0.112 x 0.133 m with the dark rim)
EYES = {}
for _k in (-1, 1):
    _pe = hit_front(head_base, _k * EYE_X, EYE_Z)
    _n = unit_normals(head_base, _pe[None])[0]
    _A = nrm(_n * 0.85 + np.array([0, -1, 0]) * 0.15)
    _U = nrm(np.cross([0, 0, 1], _A)); _V = np.cross(_A, _U)
    EYES[_k] = (_pe, _A, _U, _V)
NOSE = hit_front(head_base, 0.0, 0.510)

def head_sdf(p):
    d = head_base(p)
    for k in (-1, 1):
        pe, A_, U_, V_ = EYES[k]
        R = np.stack([U_, V_, A_], 1)
        d = smin(d, sd_ell(p, pe - A_ * 0.0235, (EX * 1.03 + 0.004, EY * 1.03 + 0.004, 0.027), R), 0.018)   # a gently domed eye lens
    return smin(d, sd_ell(p, NOSE + np.array([0, 0.006, 0]), (0.019, 0.0085, 0.011)), 0.018)           # the little nose

IRIS = dict(du=-0.012, dv=0.000, ru=0.048, rv=0.061)   # the irises sit toward the nose: white shows on the outer side
def iris_c(k): return IRIS['du'] * k, IRIS['dv']
def eye_dark2(u, v, k):
    rim = ell2(u, v, EX + 0.0070, EY + 0.0070)
    lash = np.maximum(ell2(u, v - 0.005, EX + 0.0085, EY + 0.0125), -(v + 0.010))
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
PUPIL_R = 0.018
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
        u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (-0.026 + 2.6 * u * u)
    def f_cl(P):   # the big catchlight, upper left (the sheet's light comes from the upper left on both eyes)
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu + 0.013, v - cv - 0.019) - 0.0125
    def f_cs(P):   # the small one, lower right
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu - 0.017, v - cv + 0.024) - 0.0055
    def paint(ins, Ac):
        b, w = Ac[:, 3], Ac[:, 4]
        o = np.full(len(Ac), 'eye', dtype=object)
        o[(b > 2) & (b < 3) & (w > 0.999)] = 'eyewhite'
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

def build_brow(k, v):
    if v.get('elder'):   # big white bushy brows
        pts = ((0.074, 0.626), (0.100, 0.644), (0.128, 0.651), (0.158, 0.646), (0.180, 0.632))
        return decal_strip(np.array([hit_front(head_sdf, k * x, z) for x, z in pts]),
                           lambda s: 0.0085 + 0.0045 * math.sin(PI * s) ** 0.7, 0.0065, 6, 'brow', f'brow{k}', ncol=5)
    pts = ((0.090, 0.639), (0.112, 0.649), (0.136, 0.651), (0.158, 0.643))
    return decal_strip(np.array([hit_front(head_sdf, k * x, z) for x, z in pts]),
                       lambda s: 0.0052 + 0.0022 * math.sin(PI * s) ** 0.8, 0.0025, 5, 'brow', f'brow{k}', ncol=5)

CHEEK = {}
for _k in (-1, 1):
    _pc = hit_front(head_base, _k * 0.180, 0.458)
    _n = unit_normals(head_base, _pc[None])[0]; _U = nrm(np.cross([0, 0, 1], _n)); _V = np.cross(_n, _U)
    CHEEK[_k] = (_pc, _n, _U, _V)
def build_blush(k):
    pc_, n0, U_, V_ = CHEEK[k]
    nseg = 10; ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [project(head_sdf, pc_[None], 3) + n0 * 0.0012], [np.array([[0.0]])]
    for x, h in ((1.0, 0.0012), (1.0 + SKIRT[0] / 0.03, SKIRT[1])):
        P = pc_ + (0.034 * x * np.cos(ang))[:, None] * U_ + (0.023 * x * np.sin(ang))[:, None] * V_
        P = project(head_sdf, P, 3); rows.append(P + unit_normals(head_sdf, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'blush', dtype=object); skm = Ac[:, 3] > 1.0001
        o[skm] = 'skin'; return o
    return Piece(f'blush{k}', V, F, A=A, paint=paint, nsdf=head_sdf, orient=head_up)

# ----------------------------------------------------------------------- the wide open grin (a decal) + the tongue pivot
MOUTH_C = hit_front(head_base, 0.0, 0.444)
_mn = unit_normals(head_base, MOUTH_C[None])[0]
_ma = nrm(_mn * 0.6 + np.array([0, -1.0, 0]) * 0.4); _mu = nrm(np.cross([0, 0, 1], _ma))
MOUTH_F = (MOUTH_C, _ma, _mu, np.cross(_ma, _mu))
MW, MTOP = 0.105, 0.036                        # half-width; the top edge (its corners curl up a touch), from MOUTH_C
def mouth2(u, v, k=0):
    return smax(ell2(u, v - 0.008, MW, 0.066), v - (MTOP + 0.22 * u * u), 0.010)
TONGUE_Z = 0.421
TONGUE_O = np.array([0.0, hit_front(head_base, 0.0, TONGUE_Z)[1] + 0.017, TONGUE_Z])
def build_mouth():
    pe, A_, U_, V_ = MOUTH_F; c2 = np.array([0.0, 0.004])
    nseg = 18; ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    r_e = exit2(mouth2, c2, ang, 0)
    rows, att = [on_head(pe, A_, U_, V_, c2[:1], c2[1:], 0.0016)], [np.array([[0.0, c2[0], c2[1]]])]
    for f, off in ((0.55, 0.0016), (0.87, 0.0016), (1.0, 0.0016), (None, SKIRT[1])):
        rad = r_e * f if f is not None else r_e + SKIRT[0]
        u = c2[0] + rad * np.cos(ang); v = c2[1] + rad * np.sin(ang)
        rows.append(on_head(pe, A_, U_, V_, u, v, off)); att.append(np.stack([np.full(nseg, 9.0 if f is None else f), u, v], -1))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def f_in(P):
        u, v = P[:, 4], P[:, 5]; return v - (-0.014 + 0.9 * u * u)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'mouth', dtype=object); o[ins['in'] & (Ac[:, 3] < 0.87)] = 'mouthin'   # a dark lip line all round,
        o[Ac[:, 3] > 1.0001] = 'skin'; return o                                                       # the pink inside below
    return Piece('mouth', V, F, A=A, fields={'in': f_in}, paint=paint, nsdf=head_sdf, orient=head_up)

def build_head():
    th = np.radians([0, 12, 24, 36, 49, 62, 76, 90, 105, 121, 140, 160, 180])
    ctr = np.array([0, -0.02, 0.55])
    lenses = [(nrm(EYES[k][0] - ctr), 0.30, 0.6) for k in (-1, 1)] + [(nrm(MOUTH_C - ctr), 0.3, 0.75)]
    rows = star_rows(head_sdf, ctr, [0, -1, 0], [0, 0, 1], th, 24, 0.6, lenses=lenses)
    V, F = rows_mesh(rows)
    return Piece('headball', V, F, sdf=head_sdf, paint=keyed('skin'))

# ----------------------------------------------------------------------- the big round ears (thick cups, a shallow saucer hole)
EAR_PROF = [(0.0, -0.035), (0.066, -0.030), (0.080, 0.026), (0.076, 0.050), (0.064, 0.064),
            (0.050, 0.067), (0.040, 0.061), (0.027, 0.052), (0.0, 0.046)]
EAR_IN_ROW = 5
def ear_frame(k):
    c = np.array([k * 0.238, 0.030, 0.512])
    a = nrm(np.array([k * 0.78, -0.60, -0.04])); up = nrm(np.array([0, 0, 1.0]) - a[2] * a); sd = np.cross(up, a)
    return c, a, up, sd
def build_ear(k):
    c, a, up, sd = ear_frame(k)
    V, F, A = lathe(EAR_PROF, 10, phase=0.5)
    Vl = V.copy(); V = c + Vl[:, 0:1] * 0.98 * sd + Vl[:, 1:2] * 1.07 * up + Vl[:, 2:3] * a * 1.12
    def paint(ins, Ac):
        o = np.full(len(Ac), 'skin', dtype=object); o[Ac[:, 3] > EAR_IN_ROW + 0.6] = 'earin'; return o
    return Piece(f'ear{k}', V, F, A=A, paint=paint)

# ----------------------------------------------------------------------- the hair: a thick mop (quiff, temple locks, a lobed bob)
# Parametrised by (a, el) = (azimuth from the front, positive toward +X; elevation) of rays from the head centre HC.
# Each column runs from the crown down to its own hairline, then rolls under in a rounded lip and tucks into the head,
# so the hairline runs exactly along the mesh (a smooth edge, no stair-steps).
def _ang_to_dir(a, el):
    return np.stack([np.cos(el) * np.sin(a), -np.cos(el) * np.cos(a), np.sin(el)], -1)
def head_pts(a, el):
    D = _ang_to_dir(np.asarray(a, float), np.asarray(el, float)).reshape(-1, 3)
    S = ray_exit(head_base, HC, D, 0.6); return S, unit_normals(head_base, S)
HL_A = np.radians([0, 12, 25, 40, 50, 58, 66, 80, 92, 104, 116, 128, 140, 160, 180])
HL_Z = np.array([0.645, 0.662, 0.682, 0.676, 0.655, 0.602, 0.552, 0.548, 0.590, 0.604, 0.580, 0.530, 0.488, 0.448, 0.436])
GROOVES = np.radians([58.0, 95.0, 122.0, 152.0])          # the creases between the locks (and the lobes' scallops)
def _wrap(a): return (a + PI) % (2 * PI) - PI
def groove_w(a):
    aa = np.abs(_wrap(a)); g = np.zeros_like(aa)
    for gi in GROOVES: g = np.maximum(g, np.exp(-((aa - gi) / math.radians(7.0)) ** 2))
    return g
def lobe_scallop(a):
    """0 mid-lobe, 1 at a crease (the bob's lower edge rises between the lobes)"""
    aa = np.abs(_wrap(np.asarray(a, float))); out = np.zeros_like(aa)
    bounds = [math.radians(66), math.radians(92)] + list(GROOVES[1:]) + [PI + (PI - GROOVES[-1])]
    for lo, hi in zip(bounds[:-1], bounds[1:]):
        m = (aa >= lo) & (aa < hi); u = (aa[m] - lo) / (hi - lo)
        out[m] = 1 - np.sqrt(np.clip(1 - (2 * u - 1) ** 2, 0, 1))
    return out
def hairline_z(a):
    aa = np.abs(_wrap(np.asarray(a, float))); return np.interp(aa, HL_A, HL_Z) + 0.064 * lobe_scallop(a) * (aa > math.radians(67))
COWLICK = nrm(np.array([0.05, 0.15, 0.28]))
ELDER_TUFTS = [(nrm(_ang_to_dir(np.array(math.radians(a_)), np.array(math.radians(e_)))), amp) for a_, e_, amp in
               ((-40.0, 60.0, 0.030), (32.0, 60.0, 0.030), (100.0, 58.0, 0.028), (168.0, 60.0, 0.030), (-108.0, 58.0, 0.028),
                                (0.0, 88.0, 0.022), (-18.0, 74.0, 0.050))]
ELDER_TUFTS = [(d_, amp, 0.30 if amp > 0.04 else 0.34) for d_, amp in ELDER_TUFTS]
HAIR_STYLE = {}
def hair_thick(a, el):
    a = np.asarray(a, float); el = np.asarray(el, float); aa = np.abs(_wrap(a))
    t = 0.027 + 0.052 * clamp01((aa - math.radians(90)) / math.radians(70)) * np.exp(-((el - math.radians(-6)) / math.radians(30)) ** 2)
    t = t - 0.008 * np.exp(-(_wrap(a) / 0.7) ** 2) * clamp01((math.radians(40) - el) / math.radians(20))    # the fringe hugs the forehead
    t = t + 0.012 * clamp01((el - math.radians(35)) / math.radians(25))                                    # a full, flat-ish top
    t = t + 0.026 * np.exp(-((el - math.radians(50)) / math.radians(17)) ** 2) * np.sin(a) ** 2            # the mop's wide shoulders (at the sides)
    t = t + 0.020 * np.exp(-((el - math.radians(66)) / math.radians(14)) ** 2) * np.cos(a) ** 2            # ... and a full crown front and back
    t = t + 0.010 * clamp01((aa - math.radians(60)) / 0.2) * clamp01((math.radians(97) - aa) / 0.2)     # full temple locks
    D = _ang_to_dir(a, el); cw = np.clip(D @ COWLICK, -1, 1)
    t = t + 0.062 * np.exp(-(np.arccos(cw) / 0.27) ** 2)                                                   # the swept-up tuft at the back
    if HAIR_STYLE.get('elder'):
        t = t + 0.012 * np.clip(np.cos(9 * a + 0.4), 0, 1) ** 1.5 * clamp01((el - math.radians(30)) / math.radians(12)) * clamp01((math.radians(78) - el) / math.radians(14))
        for tdir, amp, w in ELDER_TUFTS:                                                                 # a cloud of rounded puffs and one
            t = t + amp * np.exp(-(np.arccos(np.clip(D @ tdir, -1, 1)) / w) ** 2)                      # swept tuft (tips >= 4 cm radius)
    g = groove_w(a) * clamp01((math.radians(50) - el) / math.radians(30))
    return t * (1 - 0.55 * g)
def el_for_z(a, zt):
    lo = np.full(len(a), math.radians(-85)); hi = np.full(len(a), math.radians(80))
    for _ in range(26):
        m = .5 * (lo + hi); S, _ = head_pts(a, m); up = S[:, 2] > zt
        hi = np.where(up, m, hi); lo = np.where(up, lo, m)
    return .5 * (lo + hi)

HAIR_A = np.linspace(-PI, PI, 44, endpoint=False) + PI / 44
HAIR_EL0 = el_for_z(HAIR_A, hairline_z(HAIR_A))
HAIR_IN = -0.012
# the sheen: soft separate highlight patches on the lobes' bulges (a, el, half-sizes in a and el, tilt), not a band
SHEEN = [(-32.0, 44.0, 24.0, 7.5, -0.25), (40.0, 47.0, 13.0, 5.0, 0.30), (-100.0, 22.0, 9.0, 6.0, 0.0)]
def sheen_f(P):
    q = P[:, :3] - HC; a = np.degrees(np.arctan2(q[:, 0], -q[:, 1])); el = np.degrees(np.arctan2(q[:, 2], np.hypot(q[:, 0], q[:, 1])))
    d = np.full(len(P), 9.0)
    for ac, ec, ra, re, tl in SHEEN:
        da = (a - ac + 180) % 360 - 180; de = el - ec
        u = math.cos(tl) * da / ra + math.sin(tl) * de / ra; w = -math.sin(tl) * da / re + math.cos(tl) * de / re
        wob = 1 + 0.12 * np.sin(3 * np.arctan2(w, u) + ac)           # a hand-painted, slightly irregular edge
        d = np.minimum(d, np.hypot(u, w) - wob)
    return d * 0.03
def hair_el0(a):
    order = np.argsort(HAIR_A); A_ = HAIR_A[order]; E_ = HAIR_EL0[order]
    A2 = np.concatenate([A_ - 2 * PI, A_, A_ + 2 * PI]); E2 = np.concatenate([E_, E_, E_])
    return np.interp(_wrap(np.asarray(a, float)), A2, E2)
def hair_inside(Q):
    """depth inside the hair volume (positive inside); -1 where there is no hair"""
    q = Q[:, :3] - HC; a = np.arctan2(q[:, 0], -q[:, 1]); el = np.arctan2(q[:, 2], np.hypot(q[:, 0], q[:, 1]))
    t = hair_thick(a, el); d = head_base(Q[:, :3])
    return np.where(el > hair_el0(a) + math.radians(3), t - d, -1.0)

def build_hair():
    cols = []
    TZ = [0.22, 0.46, 0.68, 0.86, 1.0]
    attr = []
    for a, e0 in zip(HAIR_A, HAIR_EL0):
        top = math.radians(89.0); tap = 0.0
        els = np.array([top, math.radians(70.0), math.radians(52.0)] + [math.radians(52.0) + (e0 - math.radians(52.0)) * t for t in TZ])
        S, n = head_pts(np.full(len(els), a), els); th = hair_thick(np.full(len(els), a), els)
        ring = list(S + n * th[:, None])
        Sb, nb = S[-1], n[-1]
        Sd, _ = head_pts(np.array([a]), np.array([e0 - math.radians(4)]))
        g = nrm(Sd[0] - Sb); g = nrm(g - (g @ nb) * nb)
        thb = th[-1]; c = Sb + nb * (thb + HAIR_IN) / 2; rad = (thb - HAIR_IN) / 2
        ring[-1] = c + nb * rad * math.cos(math.radians(30)) + g * rad * math.sin(math.radians(30)) * 0.85
        for ang in (math.radians(75), math.radians(125)):
            ring.append(c + nb * rad * math.cos(ang) + g * rad * math.sin(ang) * 0.85)
        ring.append(Sb + nb * HAIR_IN)
        Si, ni = head_pts(np.array([a]), np.array([e0 + math.radians(7)]))
        ring.append(Si[0] - ni[0] * 0.045)
        cols.append(np.array(ring)); attr.append(tap)
    R = np.array(cols)                     # (ncol, nrow, 3)
    ncol, nrow = R.shape[:2]
    V = [R[:, 0].mean(0)]; At = [[0.0, 0.0]]  # the crown pole; attributes (row, sheen taper)
    idx = -np.ones((ncol, nrow), int)
    for j in range(ncol):
        for i in range(1, nrow):
            idx[j, i] = len(V); V.append(R[j, i]); At.append([float(i), attr[j]])
    F = []
    for j in range(ncol):
        j2 = (j + 1) % ncol
        F.append((0, idx[j2, 1], idx[j, 1]))
        for i in range(1, nrow - 1):
            F.append((idx[j, i], idx[j2, i], idx[j2, i + 1], idx[j, i + 1]))
    def paint(ins, Ac):
        o = np.full(len(Ac), 'hair', dtype=object)
        o[ins['sheen']] = 'hairsheen'; return o
    pc = Piece('hair', np.array(V), F, A=np.array(At), paint=paint, fields={'sheen': sheen_f})
    pc.inside = hair_inside
    def ao(A):   # the creases between the locks and lobes read as soft darker lines
        q = A[:, :3] - HC; a = np.arctan2(q[:, 0], -q[:, 1]); el = np.arctan2(q[:, 2], np.hypot(q[:, 0], q[:, 1]))
        return 1.0 - 0.55 * groove_w(a) * clamp01((math.radians(55) - el) / math.radians(25))
    pc.ao = ao
    return pc

# ----------------------------------------------------------------------- horns (ivory nubs, tipped forward and out)
def horn_frame(k):
    root = np.array([k * 0.184, -0.085, 0.695]); a = nrm(np.array([k * 0.30, -0.42, 1.0]))
    return root, a
HORN_PROF = [(0.0, -0.03), (0.037, -0.03), (0.037, 0.04), (0.031, 0.095), (0.024, 0.122),
             (0.017, 0.140), (0.010, 0.150), (0.0, 0.153)]
def build_horn(k):
    root, a = horn_frame(k)
    V, F, A = lathe(HORN_PROF, 8)
    up = nrm(np.cross(a, [1.0, 0, 0])); sd = np.cross(up, a)
    V = root + V[:, 0:1] * sd + V[:, 1:2] * up + V[:, 2:3] * a
    return Piece(f'horn{k}', V, F, A=A, paint=keyed('horn'))

# ----------------------------------------------------------------------- the folded tenugui on top (a soft pad, bent over the crown)
TW_C = np.array([0.018, -0.008, 0.828]); TW_R = (0.128, 0.118, 0.034); TW_YAW = 0.10; TW_BEND = 2.5
TW_RW = rot([0, 0, 1], TW_YAW)
def towel_local(p):
    q = (np.asarray(p, float) - TW_C) @ TW_RW
    q = q.copy(); q[..., 2] = q[..., 2] + TW_BEND * (q[..., 1] ** 2 + 1.1 * q[..., 0] ** 2)
    return q
def towel_f(p): return superq(towel_local(p), (0, 0, 0), TW_R, 4.0, 2.6)
def build_towel(v):
    th = np.radians([0, 32, 62, 82, 98, 118, 150, 180])
    rows = star_rows(towel_f, TW_C - np.array([0, 0, 0.024]), [0, 0, 1], [0, -1, 0], th, 16, 0.3)
    V, F = rows_mesh(rows)
    def f_st(P):
        q = towel_local(P[:, :3]); return np.abs(q[:, 0] - 0.012) - 0.028
    def paint(ins, Ac):
        o = np.full(len(Ac), 'towel', dtype=object); o[ins['st']] = 'stripe'; return o
    return Piece('towel', V, F, sdf=towel_f, fields={'st': f_st}, paint=paint, refine=[(('st',), 0.012, 0.05)])

def build_yuzu():
    c = np.array([0.000, -0.030, 0.905])
    f = lambda p: sd_ell(p, c, (0.046, 0.046, 0.040))
    rows = star_rows(f, c, [0, 0, 1], [0, -1, 0], np.radians([0, 35, 70, 105, 140, 180]), 10, 0.2)
    V, F = rows_mesh(rows)
    fruit = Piece('yuzu', V, F, sdf=f, paint=keyed('yuzu'))
    lc = c + np.array([0.020, 0.004, 0.040]); la = nrm([1.0, 0.25, 0.35]); lu = nrm(np.cross([0, 1.0, 0], la))
    lu = lu if lu[2] > 0 else -lu
    R = np.stack([la, np.cross(lu, la), lu], 1)
    fl = lambda p: sd_ell(p, lc + la * 0.022, (0.034, 0.019, 0.0125), R)
    rows = star_rows(fl, lc + la * 0.022, lu, la, np.radians([0, 40, 80, 100, 140, 180]), 10, 0.1)
    V, F = rows_mesh(rows)
    leaf = Piece('leaf', V, F, sdf=fl, paint=keyed('leaf'))
    sc = c + np.array([0.004, 0.0, 0.041]); fs = lambda p: sd_ell(p, sc, (0.011, 0.011, 0.013))
    rows = star_rows(fs, sc, [0, 0, 1], [0, -1, 0], np.radians([0, 60, 120, 180]), 6, 0.1)
    V, F = rows_mesh(rows)
    return [fruit, leaf, Piece('stem', V, F, sdf=fs, paint=keyed('stem'))]

def build_hachimaki():
    """the elder's headband: a broad white band round the forehead and the hair, a red stripe along its middle, knotted
    at the back"""
    n = 30; aa = np.linspace(-PI, PI, n, endpoint=False)
    els = el_for_z(aa, np.full(n, 0.686) - 0.02 * (1 - np.cos(aa)) / 2)
    S, nn = head_pts(aa, els); th = np.where(els > hair_el0(aa), hair_thick(aa, els), 0.0)
    C = S + nn * (th + 0.006)[:, None]
    def frame(i, T):
        N = nrm(nn[i] - (nn[i] @ T) * T); B = np.cross(T, N); B = B if B[2] > 0 else -B
        return N, B
    T = np.roll(C, -1, 0) - np.roll(C, 1, 0); T /= L(T)[:, None]
    PROF = [(0.70, 1.0), (1.0, 0.36), (1.0, -0.36), (0.70, -1.0), (-1.0, -0.85), (-1.0, 0.85)]   # (out, up) x (0.017, 0.042)
    V, Aat = [], []
    for i in range(n):
        N, B = frame(i, T[i])
        for j, (u, w) in enumerate(PROF):
            V.append(C[i] + N * 0.017 * u + B * 0.042 * w); Aat.append([float(j)])
    V = np.array(V); A = np.array(Aat); m = len(PROF); F = []
    for i in range(n):
        a0, b0 = i * m, ((i + 1) % n) * m
        F += [(a0 + j, a0 + (j + 1) % m, b0 + (j + 1) % m, b0 + j) for j in range(m)]
    def paint(ins, Ac):
        o = np.full(len(Ac), 'towel', dtype=object); o[np.abs(Ac[:, 3] - 1.5) < 0.2] = 'stripe'; return o
    band = Piece('hachimaki', V, F, A=A, paint=paint)
    # the knot at the back (a little to the left), with two short stubby tails
    i0 = int(np.argmin(np.abs(_wrap(aa - math.radians(165))))); kc = C[i0] + nn[i0] * 0.018
    fk = lambda p: smin(sd_ell(p, kc, (0.036, 0.026, 0.030)),
                        smin(sd_cap(p, kc, kc + np.array([0.035, 0.035, -0.075]), 0.021),
                             sd_cap(p, kc, kc + np.array([-0.030, 0.040, -0.070]), 0.021), 0.01), 0.012)
    rows = star_rows(fk, kc + np.array([0, 0.012, -0.01]), [0, 1.0, -0.4], [0, 0, 1], np.radians([0, 35, 70, 105, 140, 180]), 10, 0.3)
    V, F = rows_mesh(rows)
    return [band, Piece('knot', V, F, sdf=fk, paint=keyed('towel'))]

def build_head_items(v):
    P = [build_head(), build_eye(-1), build_eye(1), build_brow(-1, v), build_brow(1, v), build_blush(-1), build_blush(1),
         build_mouth(), build_ear(-1), build_ear(1), build_hair(), build_horn(-1), build_horn(1)]
    if v.get('elder'): P += build_hachimaki()
    else:
        P.append(build_towel(v))
        if v.get('yuzu'): P += build_yuzu()
    return P

# =========================================================================================== body
def torso_f(p):
    d = superq(p, (0.0, 0.004, 0.198), (0.200, 0.184, 0.150), 2.0, 2.5)
    d = smin(d, sd_ell(p, (0.0, 0.000, 0.312), (0.150, 0.136, 0.110)), 0.06)
    return smin(d, sd_ell(p, (0.0, 0.172, 0.165), (0.042, 0.040, 0.043)), 0.022)   # the little round tail
def build_torso():
    th = np.radians([0, 20, 40, 58, 74, 90, 106, 122, 140, 160, 180])
    rows = star_rows(torso_f, np.array([0, 0.0, 0.22]), [0, 0, 1], [0, -1, 0], th, 18, 0.5,
                     lenses=[(nrm([0, 1.0, -0.3]), 0.35, 0.7)])
    V, F = rows_mesh(rows)
    fields = {'belly': lambda P: np.maximum(ell2(P[:, 0], P[:, 2] - 0.192, 0.158, 0.124), P[:, 1] + 0.07)}
    def paint(ins, Ac):
        o = np.full(len(Ac), 'skin', dtype=object); o[ins['belly']] = 'belly'; return o
    return Piece('torso', V, F, sdf=torso_f, fields=fields, paint=paint)

LEG_X = 0.114
def leg_f_k(k):
    fc = np.array([k * (LEG_X + 0.010), -0.008, 0.036])
    def f(p):
        d = sd_cap(p, (k * LEG_X, 0.004, 0.150), (k * LEG_X, -0.002, 0.070), 0.064)
        d = smin(d, sd_ell(p, fc, (0.098, 0.104, 0.042)), 0.035)
        return smax(d, -p[..., 2], 0.012)
    return f, fc
def build_leg(k):
    f, fc = leg_f_k(k)
    th = np.radians([0, 30, 60, 85, 105, 130, 155, 180])
    rows = star_rows(f, np.array([k * LEG_X, -0.02, 0.07]), [0, 0, 1], [0, -1, 0], th, 14, 0.4,
                     lenses=[(nrm([0, -1.0, -0.3]), 0.8, 0.6)])
    V, F = rows_mesh(rows)
    return Piece(f'leg{k}', V, F, sdf=f, paint=keyed('skin'))
def ball(name, c, r, key, nseg=7, th=(0, 55, 100, 140, 180), axis=(0, 0, 1.0), ref=(0, -1.0, 0)):
    c = np.asarray(c, float); r = np.asarray(r, float) if np.ndim(r) else np.array([r, r, r], float)
    f = lambda p, c_=c, r_=r: sd_ell(p, c_, r_)
    rows = star_rows(f, c, axis, ref, np.radians(th), nseg, 0.2)
    V, F = rows_mesh(rows)
    return Piece(name, V, F, sdf=f, paint=keyed(key))
def build_foot_claws(k):
    out = []
    for c in (-1, 0, 1):
        out.append(ball(f'toe{k}{c}', (k * (LEG_X + 0.010) + c * 0.050, -0.112 + abs(c) * 0.018, 0.024), (0.023, 0.024, 0.024), 'claw',
                        nseg=7, axis=(0, -1.0, 0), ref=(0, 0, 1.0), th=(0, 55, 110, 180)))
    return out

def build_body_items(v):
    P = [build_torso(), build_leg(-1), build_leg(1)] + build_foot_claws(-1) + build_foot_claws(1) + build_head_items(v)
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== arms (+ the tawashi)
def arm_dir(k): return nrm(np.array([k * 0.42, -0.13, -0.90]))      # ~25 deg out (the game splays it another 0.35 rad)
ARM_LEN = 0.128
def hand_frame(k):
    S = SHOULDER(k); d = arm_dir(k); H = S + d * ARM_LEN
    npal = np.array([-k * 0.25, -1.0, 0.2]); npal = nrm(npal - (npal @ d) * d)
    s = np.cross(npal, d)
    return H, d, s, npal
def build_arm(k):
    S = SHOULDER(k)
    H, d, s, npal = hand_frame(k)
    def f(p):
        dd = smin(sd_sph(p, S, SHOULDER_R), sd_cap(p, S, H - d * 0.02, 0.047), 0.03)
        hd = sd_ell(p, H, (0.056, 0.060, 0.050), np.stack([s, d, npal], 1))
        return smin(dd, hd, 0.035)
    th = np.radians([0, 25, 50, 75, 95, 115, 135, 158, 180])
    rows = star_rows(f, S + d * 0.07, -d, npal, th, 14, 0.4)
    V, F = rows_mesh(rows)
    out = [Piece(f'arm{k}', V, F, sdf=f, paint=keyed('skin'))]
    for c in (-1, 0, 1):
        cc = H + d * 0.047 + s * (c * 0.030) + npal * 0.016 - d * abs(c) * 0.010
        out.append(ball(f'claw{k}{c}', cc, (0.019, 0.019, 0.020), 'claw', nseg=7, axis=d, ref=npal, th=(0, 55, 110, 180)))
    return out

def brush_frame():
    H, d, s, npal = hand_frame(-1)
    F_ = nrm(np.array([-0.62, -0.74, 0.10])); up = np.array([0, 0.05, 1.0]); U_ = nrm(up - (up @ F_) * F_)
    W_ = np.cross(U_, F_)
    B = H + F_ * 0.050 + U_ * 0.008
    return B, F_, U_, W_
BRUSH_RIDGES = 3.5
def build_brush():
    B, F_, U_, W_ = brush_frame(); R = np.stack([W_, U_, F_], 1)
    loc = lambda p: (np.asarray(p, float) - B) @ R
    fw = lambda p: superq(loc(p), (0, 0, 0), (0.068, 0.094, 0.016), 2.0, 2.6)
    rows = star_rows(fw, B, -F_, U_, np.radians([0, 35, 70, 90, 110, 145, 180]), 14, 0.2)
    V, F = rows_mesh(rows)
    wood = Piece('brushwood', V, F, sdf=fw, paint=keyed('wood'))
    def fb(p):
        q = loc(p).copy(); q[..., 2] = q[..., 2] - 0.030
        ridge = 0.0030 * np.cos(q[..., 1] / 0.085 * PI * BRUSH_RIDGES) * clamp01(q[..., 2] / 0.012 + 0.5)
        return superq(q, (0, 0, 0), (0.059, 0.085, 0.026), 2.0, 2.4) - ridge
    rows = star_rows(fb, B + F_ * 0.030, F_, U_, np.radians([0, 20, 40, 60, 78, 94, 120, 155, 180]), 14, 0.2)
    V, F = rows_mesh(rows)
    br = Piece('bristles', V, F, sdf=fb, paint=keyed('brush'))
    def ao(A):
        q = loc(A[:, :3]); valley = clamp01(-np.cos(q[:, 1] / 0.085 * PI * BRUSH_RIDGES) * 1.2)
        return 1.0 - 0.24 * valley * clamp01((q[:, 2] - 0.035) / 0.01)
    br.ao = ao
    return [wood, br]

def build_arm_items(k, v):
    P = build_arm(k)
    if k < 0: P += build_brush()
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== the tongue (its own part: the game stretches it along -Y)
TL = 0.170; TONGUE_W, TONGUE_T, TIP = 0.058, 0.021, 0.042
def build_tongue():
    """a plain, evenly segmented tube from the pivot (y = 0, a flat closed root) along -Y; a round tip.
    Cross-section: a broad, flat oval with a soft groove along the top. Nothing behind the pivot (the game scales y)."""
    nseg = 12; ph = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    cu, su = np.cos(ph), np.sin(ph)
    def ring(y, sc):
        w = TONGUE_W * sc; t = TONGUE_T * sc
        x = w * cu; z = t * su
        z = z - 0.0045 * sc * np.exp(-(x / (0.012 * max(sc, 0.3))) ** 2) * (su > 0)   # the groove
        return np.stack([x, np.full(nseg, y), z], -1)
    rows = []                      # (the root stays open, buried in the mouth: a cap there would put normals along y,
    for y in np.linspace(0, TL - TIP, 7):   #  and the game's stretched ink hull would spike out of the back of the head)
        rows.append(ring(-y, 0.86 + 0.14 * min(1.0, y / 0.05)))
    for t in (0.35, 0.62, 0.83, 0.95):
        rows.append(ring(-(TL - TIP + TIP * t), math.sqrt(1 - t * t)))
    rows.append(np.array([[0.0, -TL, 0.0]]))
    V, F = rows_mesh(rows)
    V = V + TONGUE_O
    def paint(ins, Ac): return np.full(len(Ac), 'tongue', dtype=object)
    def ori(C):   # outward: away from the tongue's axis (the root cap: backward)
        d = C - TONGUE_O; d[:, 1] = np.where(d[:, 1] < -(TL - TIP), d[:, 1] + (TL - TIP), 0.0)
        return d
    def nsdf(p):   # normals: radial along the body (no y component, so a stretched outline stays a tube), round at the tip
        q = np.asarray(p, float) - TONGUE_O; tip = np.maximum(0.0, -q[..., 1] - (TL - TIP)) / TIP
        return (np.sqrt((q[..., 0] / TONGUE_W) ** 2 + (q[..., 2] / TONGUE_T) ** 2 + tip ** 2) - 1.0) * TONGUE_T
    pc = Piece('tongue', V, F, paint=paint, orient=ori, nsdf=nsdf)
    pc.ao = lambda A: 1.0 - 0.13 * np.exp(-((A[:, 0] - TONGUE_O[0]) / 0.02) ** 2) * (A[:, 2] > TONGUE_O[2])   # the soft groove
    return pc

# =========================================================================================== assemble
def palette(v):
    pal = dict(COMMON); pal.update({k: x for k, x in v.items() if isinstance(x, str)})
    pal['skin_sh'] = mulhex(pal['skin'], 0.80)
    pal['skin_hi'] = pal['skinhi']; pal['skin_hik'] = 0.40
    pal['earin'] = mulhex(pal['skin'], 0.80)
    pal['belly_sh'] = mulhex(pal['belly'], 0.90)
    pal['hair_sh'] = mulhex(pal['hair'], 0.80 if not v.get('elder') else 0.74)
    pal['hair_hi'] = pal['hairhi']; pal['hair_hik'] = 0.30
    pal['hairsheen'] = pal['hairhi']
    pal['towel_sh'] = mulhex(pal['towel'], 0.86)
    pal['tongue_sh'] = mulhex(pal['tongue'], 0.86)
    pal['brush'] = lighten(pal['brush'], 0.18); pal['brush_sh'] = mulhex(pal['brush'], 0.85)
    pal['horn_sh'] = mulhex(pal['horn'], 0.88)
    pal['yuzu'] = '#f2b62a'; pal['yuzu_hi'] = '#ffd866'; pal['leaf'] = '#5aa040'; pal['stem'] = '#6a5028'
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
    HAIR_STYLE.clear(); HAIR_STYLE['elder'] = bool(v.get('elder'))
    parts = {'body': (build_body_items(v), np.zeros(3)),
             'tongue': ([process(build_tongue())], TONGUE_O),
             'armL': (build_arm_items(1, v), SHOULDER(1)), 'armR': (build_arm_items(-1, v), SHOULDER(-1))}
    obs = [make_object(n, its, pal, o) for n, (its, o) in parts.items()]
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['pieces'] = {it['name']: len(it['T']) for its, _ in parts.values() for it in its}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    fn = 'akaname' + ('' if vname == 'base' else '_' + vname)
    if vname == 'base':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'akaname.blend'))
    export(fn)
    print('AKANAME', vname, json.dumps(stats))
    return stats

if __name__ == '__main__':
    names = list(VARIANTS) if WANT == 'all' else [WANT]
    allstats = {}
    for n in names:
        allstats[n] = build_variant(n)
    os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
    with open(os.path.join(TASK_DIR, 'work', 'build_stats.json' if WANT == 'all' else f'build_stats_{WANT}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=1)
