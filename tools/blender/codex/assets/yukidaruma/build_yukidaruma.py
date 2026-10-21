"""Yuki-daruma (Yukimi Onsen, enemy series EN-1) -- deterministic build, Option A "Bucket Brute" (refs/sheet.png).

Blender 4.3:
  blender --background --factory-startup --python build_yukidaruma.py [-- --variant base|dusk|grand|all]

Builds every variant from an empty scene, saves yukidaruma.blend (the base) and exports
public/models/yukidaruma.glb, yukidaruma_dusk.glb and yukidaruma_grand.glb.
Units: metres, front = -Y, ground z = 0.

Enemy contract (.claude/skills/codex-blender/templates/enemy-model-contract.md):
  rigid parts, no rig, no UVs, no textures; one face-corner colour attribute `Col`; one material `toon`.
  body : origin (0, 0, 0)        both snowballs, face, bucket + handle, scarf band + tail, buttons
  armR : origin PIV(+1)          the +X twig + mitten (the twig root is a ball buried at the pivot: no gap at any angle)
  armL : origin PIV(-1)          the mirror
  ball : origin (0, 0, 0.72)     the rolled-up snowball (r 0.72): scarf band, a mitten, a twig, the bucket's end
Technique: the framework of the approved bamboo / maple / tidepool enemies (build_kappa.py): implicit surfaces
sampled as star grids, parametric sweeps / lathes / loop tubes, colour borders cut along edge loops, face
features as low decal shells on the head, buried faces culled within a part.
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/yukidaruma'
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
          capk=(1.0, 1.0), svals=None):
    """generalised tube. prof(s) -> (rn, rb) half-sizes along N and B. Returns V, F, attr (s, cos phi, sin phi)."""
    if svals is not None:
        Cd, length = catmull(ctrl, 801); s = np.asarray(svals, float); nr = len(s)
        C = Cd[np.round(s * 800).astype(int)]
    else:
        C, length = catmull(ctrl, dense or nr)
        if dense: C = C[np.round(np.linspace(0, dense - 1, nr)).astype(int)]
        s = np.linspace(0, 1, nr)
    T, N, B = frames(C, side)
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

def make_object(name, items, pal, origin, flat=False):
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
            s0, rg, mx = pal.get(key + '_shp', (0.05, 0.75, 0.85))
            t = (clamp01((-nz - s0) / rg) ** 1.2 * mx)[:, None]
            fc[m] = fc[m] * (1 - t) + srgb_lin(pal[key + '_sh'])[None] * t
    rgb = (fc if flat else shade(fc, N[li])) * ao[li][:, None]
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
    'coal': '#2c2934', 'sheen': '#3d4256', 'catch': '#ffffff', 'carrot': '#f29232', 'carrotdk': '#d86e1e',
    'blush': '#e98c91', 'twig': '#7a5236',
}
VARIANTS = {
    'base':  dict(snow='#f6faff', shade='#c2d4ee', bucket='#d8453a', lip='#b8352c', btop='#a62f2b',
                  scarf='#44a468', stripe='#fff6e4', mitten='#44a468'),
    'dusk':  dict(snow='#f6faff', shade='#c2d4ee', bucket='#4a6ad8', lip='#3a54b0', btop='#334a9c',
                  scarf='#e8503a', stripe='#fff2d8', mitten='#e8503a'),
    'grand': dict(snow='#fbf8ff', shade='#cfc6ee', bucket='#e8b83a', lip='#c8942a', btop='#b8862a',
                  scarf='#8a4ab8', stripe='#ffe8a0', mitten='#8a4ab8'),
}

# =========================================================================================== snow shapes
def wob(p, a):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    return a * (np.sin(5.1 * x + 1.3) * np.sin(4.3 * y + 0.7) * np.sin(3.7 * z + 2.1)
                + 0.6 * np.sin(7.3 * x - 5.9 * z + 0.4) * np.cos(6.1 * y + 1.1))

BODY_C = np.array([0.0, 0.0, 0.403]); BODY_R = (0.565, 0.518, 0.519)      # measured on the sheet (193 px/m)
def body_f(p):
    d = sd_ell(p, BODY_C, BODY_R) - wob(p, 0.008)
    return smax(d, -p[..., 2], 0.06)                                         # a soft flat contact on z = 0

HEAD_C = np.array([0.0, -0.055, 1.075]); HEAD_R = (0.373, 0.350, 0.330)
def head_f(p):
    return sd_ell(p, HEAD_C, HEAD_R) - wob(p - 0.3, 0.005)

def build_ball_piece(name, f, centre, axis, ref, thetas, nseg, key, lenses=(), tmax=1.0):
    rows = star_rows(f, centre, axis, ref, np.radians(thetas), nseg, tmax, lenses=lenses)
    V, F = rows_mesh(rows)
    return Piece(name, V, F, sdf=f, paint=keyed(key))

# =========================================================================================== decals on a host surface
SKIRT = (0.004, -0.003)
def host_up(host): return lambda P: unit_normals(host, P[:, :3])

def surf_frame(host, P0):
    n = unit_normals(host, P0[None])[0]
    U = nrm(np.cross([0, 0, 1], n)); V = np.cross(n, U)
    return n, U, V

def dome_decal(host, P0, a, b, h, key, name, fields=None, paint=None, nseg=12, rings=(0.38, 0.68, 0.88, 1.0),
               own_normals=True, lift=0.0, skirt_key='snow'):
    """a domed lens lying on 'host' at P0: semi-axes a (along U, horizontal) x b (along V), dome height h, a sunk
    skirt ring. attributes: (rho, u, v)"""
    n0, U0, V0 = surf_frame(host, P0)
    ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [], []
    c = project(host, P0[None], 4)
    rows.append(c + unit_normals(host, c) * (h + 0.001 + lift)); att.append(np.array([[0.0, 0.0, 0.0]]))
    rr = list(rings) + [1.0 + SKIRT[0] / min(a, b)]
    for rho in rr:
        u = rho * a * np.cos(ang); v = rho * b * np.sin(ang)
        P = P0 + u[:, None] * U0 + v[:, None] * V0
        P = project(host, P, 4); nn = unit_normals(host, P)
        hh = SKIRT[1] if rho > 1.0001 else h * max(0.0, 1 - rho * rho) ** 0.6 + 0.001
        rows.append(P + nn * (hh + lift)); att.append(np.stack([np.full(nseg, rho), u, v], -1))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    base_paint = paint
    def pt(ins, Ac):
        o = base_paint(ins, Ac) if base_paint else np.full(len(Ac), key, dtype=object)
        o[Ac[:, 3] > 1.0001] = skirt_key; return o
    return Piece(name, V, F, A=A, fields=fields or {}, paint=pt, nsdf=None if own_normals else host, orient=host_up(host))

def decal_strip(host, C, width, H, nrows, key, name):
    """a raised sausage stroke along the surface curve C (half-width width(s), ridge H), rounded ends"""
    Cd, _ = catmull(C, 80); Cd = project(host, Cd, 3)
    idx = np.round(np.linspace(0, len(Cd) - 1, nrows)).astype(int); Cr = Cd[idx]
    n = unit_normals(host, Cr); T = np.gradient(Cr, axis=0); T -= np.einsum('ij,ij->i', T, n)[:, None] * n
    T /= L(T)[:, None]; S = np.cross(n, T)
    sk = 1.0 + SKIRT[0] / 0.012
    cols = np.array([-sk, -1.0, -0.6, 0.0, 0.6, 1.0, sk])
    t_ = np.clip(np.abs(cols), 0, 1)
    s = np.linspace(0, 1, nrows)
    rows = []
    for i in range(nrows):
        w = width(s[i]); P = Cr[i] + S[i] * (cols * w)[:, None]
        P = project(host, P, 3); nn = unit_normals(host, P)
        hh = np.where(np.abs(cols) > 1.0001, SKIRT[1], H * (1 - t_ * t_) ** 0.5 + 0.0008)
        rows.append(P + nn * hh[:, None])
    V = np.concatenate(rows); nc = len(cols); F = []
    A = np.concatenate([np.stack([np.full(nc, s[i]), cols], -1) for i in range(nrows)])
    for i in range(nrows - 1):
        a, b = i * nc, (i + 1) * nc
        F += [(a + j, a + j + 1, b + j + 1, b + j) for j in range(nc - 1)]
    for end, sign in ((0, -1), (nrows - 1, 1)):        # rounded ends: a lower, narrower row + a sunk tip
        w = width(s[end]); base = end * nc
        mid = Cr[end] + sign * T[end] * w * 0.7
        P = mid + S[end] * (cols * w * 0.72)[:, None]; P = project(host, P, 3); nn = unit_normals(host, P)
        hh = np.where(np.abs(cols) > 1.0001, SKIRT[1], 0.7 * H * (1 - t_ * t_) ** 0.5 + 0.0008)
        ri = len(V); V = np.vstack([V, P + nn * hh[:, None]]); A = np.vstack([A, np.stack([np.full(nc, s[end]), cols], -1)])
        tip = Cr[end] + sign * T[end] * (w + SKIRT[0]); tip = project(host, tip[None], 3)[0]
        tip = tip + unit_normals(host, tip[None])[0] * SKIRT[1]
        ti = len(V); V = np.vstack([V, tip]); A = np.vstack([A, [[s[end], 2.0]]])
        if sign < 0:
            F += [(ri + j + 1, ri + j, base + j, base + j + 1) for j in range(nc - 1)]
            F += [(ri + j, ri + j + 1, ti) for j in range(nc - 1)]
        else:
            F += [(base + j, base + j + 1, ri + j + 1, ri + j) for j in range(nc - 1)]
            F += [(ri + j + 1, ri + j, ti) for j in range(nc - 1)]
    def paint(ins, Ac):
        o = np.full(len(Ac), key, dtype=object); o[np.abs(Ac[:, 4]) > 1.0001] = 'snow'; return o
    return Piece(name, V, F, A=A, paint=paint, orient=host_up(host))

# =========================================================================================== the face
EYE_X, EYE_Z, EYE_A, EYE_B = 0.150, 1.140, 0.064, 0.063
def build_eye(k):
    P0 = hit_front(head_f, k * EYE_X, EYE_Z)
    # U runs toward +X on the face; catchlights: a big one upper-outer (the sheet's sparkle) and a small one lower-inner
    n0, U0, V0 = surf_frame(head_f, P0)
    eye = dome_decal(head_f, P0, EYE_A, EYE_B, 0.011, 'coal', f'eye{k}', nseg=14, rings=(0.36, 0.66, 0.88, 1.0))
    out = [eye]
    for j, (du, dv, r, seg) in enumerate(((0.024, 0.024, 0.0135, 8), (-0.022, -0.027, 0.0068, 6))):
        Pc = P0 + U0 * (k * du) + V0 * dv
        rho = math.hypot(du / EYE_A, dv / EYE_B); lift = 0.011 * max(0.0, 1 - rho * rho) ** 0.6 + 0.0016
        out.append(dome_decal(head_f, Pc, r, r, 0.0008, 'catch', f'catch{k}{j}', nseg=seg, rings=(1.0,), lift=lift,
                              skirt_key='coal'))
    return out

def build_brow(k):
    # a fat clay sausage, high at the outer end and sloping down to the nose (the sheet's angry brow, its lower edge
    # just clearing the eye)
    pts = [(0.208, 1.252), (0.162, 1.242), (0.116, 1.222), (0.074, 1.196)]
    C = np.array([hit_front(head_f, k * x, z) for x, z in pts])
    return decal_strip(head_f, C, lambda s: 0.021 + 0.006 * math.sin(PI * s) ** 0.7, 0.012, 5, 'coal', f'brow{k}')

def build_blush(k):
    P0 = hit_front(head_f, k * 0.240, 1.058)
    return dome_decal(head_f, P0, 0.064, 0.054, 0.0012, 'blush', f'blush{k}', nseg=10, rings=(0.6, 1.0), own_normals=False)

GRIN = [(-0.140, 1.016), (-0.074, 0.978), (0.0, 0.964), (0.074, 0.978), (0.140, 1.016)]
def build_grin():
    return [dome_decal(head_f, hit_front(head_f, x, z), 0.0295, 0.0295, 0.012, 'coal', f'bead{i}', nseg=8, rings=(0.6, 1.0))
            for i, (x, z) in enumerate(GRIN)]

BUTTONS = [0.632, 0.433, 0.226]
def build_buttons():
    return [dome_decal(body_f, hit_front(body_f, 0.0, z), 0.075, 0.075, 0.015, 'coal', f'button{i}', nseg=11,
                       rings=(0.5, 0.85, 1.0)) for i, z in enumerate(BUTTONS)]

NOSE_X, NOSE_Z, NOSE_LEN = 0.0, 1.100, 0.195
def build_carrot():
    S = hit_front(head_f, NOSE_X, NOSE_Z)
    a = S + np.array([0, 0.045, 0.0]); tip = S + np.array([0.004, -NOSE_LEN, 0.010])
    ctrl = [a, S + np.array([0, -0.05, 0.002]), S + np.array([0.002, -0.12, 0.006]), tip]
    prof = lambda s: ((0.064 - 0.042 * s ** 0.9),) * 2
    V, F, A, info = sweep(ctrl, 6, 8, prof, [1, 0, 0], caps=(False, True), cap_rings=2)
    return Piece('carrot', V, F, A=A, paint=keyed('carrot'), orient=seg_orient(a, tip), occluder=False)

# =========================================================================================== the bucket
BK_RX, BK_RY = math.radians(-12), math.radians(22)        # tipped toward +X and back (the sheet: rim -22 deg / -16 deg)
BK_R = rot([1, 0, 0], BK_RX) @ rot([0, 1, 0], BK_RY)      # local -> world (local +z = the bucket axis, mouth -> top)
BK_H = 0.335
BK_S = 1.06                                              # radii scale (round 2: the sheet's rim reads wider)
BK_WALL = (0.274 * BK_S, 0.052, 0.228 * BK_S, 0.302)                    # wall radius at the bottom / top heights
def bk_wall_r(h):
    r0, h0, r1, h1 = BK_WALL; return r0 + (r1 - r0) * (h - h0) / (h1 - h0)
BK_PROF = [(r * BK_S, h) for r, h in ((0.0, 0.070), (0.246, 0.060), (0.268, 0.002), (0.296, -0.007), (0.314, 0.020), (0.299, 0.048),
           (0.274, 0.052), (0.228, 0.302), (0.244, 0.316), (0.224, BK_H), (0.196, 0.340), (0.0, 0.344))]                # a closed, gently domed top (a recess drew an ink ring: an open tube)
BK_ROWS = dict(lip=(1, 6), toplip=(7, 10), top=(10, 11))
# the mouth centre: the highest spot (grid search, work/bk_search.py) where the inner mouth ring (r 0.262) still sits
# 8 mm inside the head all round -> the lip hugs the head with no gap; the top then peaks at z ~1.65 (the sheet: 1.65)
BK_O = np.array([0.080, -0.020, 1.238])                  # (round 2: re-solved for the 6 % wider bucket, inner ring r 0.278)
def bk_local(P): return (np.asarray(P, float)[..., :3] - BK_O) @ BK_R
def bk_inside(P):
    q = bk_local(P); h = q[..., 2]; rho = np.hypot(q[..., 0], q[..., 1])
    return np.minimum(np.minimum(h - 0.0, BK_H - 0.02 - h), bk_wall_r(np.clip(h, 0.05, 0.30)) - 0.01 - rho)
def build_bucket():
    V, F, A = lathe(BK_PROF, 18)
    V = V @ BK_R.T + BK_O
    def paint(ins, Ac):
        r = Ac[:, 3]; o = np.full(len(Ac), 'bucket', dtype=object)
        o[r < BK_ROWS['lip'][1] - 0.01] = 'lip'
        o[(r > BK_ROWS['toplip'][0] + 0.01) & (r < BK_ROWS['toplip'][1] - 0.01)] = 'lip'
        o[r > BK_ROWS['top'][0] - 0.01] = 'btop'
        return o
    pc = Piece('bucket', V, F, A=A, paint=paint)
    pc.inside = bk_inside
    return pc
BK_HANDLE_PHI = math.radians(55)                         # the handle hangs on the back-right diagonal (the sheet: the right edge in front, the back edge from the side)
def build_handle():
    u = np.linspace(-1, 1, 8)
    ph = BK_HANDLE_PHI + 1.10 * u
    h = 0.262 - 0.250 * (1 - u * u)
    r = bk_wall_r(np.clip(h, 0.05, 0.30)) + 0.008 + 0.075 * np.clip(1 - u * u, 0, 1) ** 0.7
    r[0] -= 0.014; r[-1] -= 0.014
    C = np.stack([r * np.cos(ph), r * np.sin(ph), h], -1) @ BK_R.T + BK_O
    side = BK_R @ np.array([0, 0, 1.0])
    V, F, A, _ = sweep(list(C), 8, 6, lambda s: (0.020, 0.020), side, caps=(True, True), cap_rings=1)
    return Piece('handle', V, F, A=A, paint=keyed('bucket'), occluder=False)

# =========================================================================================== the scarf
SC_TH = (0.072, 0.094)                        # band ring count; half-sizes (radial, vertical)
SC_STRIPES, SC_PHASE, SC_CUT = 7, 0.55, 0.60
SC_CEN = np.array([0, -0.025, 0.872])
def union_snow(p): return smin(body_f(p), head_f(p), 0.02)
def band_centre(th):
    zc = SC_CEN[2] - 0.026 * math.cos(th)
    e = np.array([math.sin(th), -math.cos(th), 0.0]); o = np.array([0.0, SC_CEN[1], zc])
    S = ray_exit(union_snow, o, e[None], 1.0)[0]
    return S + e * (SC_TH[0] * 0.68), e
def stripe_f(P, centre, axis_u, axis_v, n, phase, cut, scale):
    q = P[:, :3] - centre; ang = np.arctan2(q @ axis_v, q @ axis_u)
    return (cut - np.cos(n * ang + phase)) * scale
def up_frame(E):
    def frame(i, T):
        B = np.array([0, 0, 1.0]); B = nrm(B - (B @ T) * T); N = nrm(np.cross(T, B))
        if N @ E[i] < 0: N = -N
        return N, B
    return frame
def stripe_angles(n, phase, cut):
    """ring angles: both borders of every stripe (cos(n a + phase) = cut) and a green mid ring between stripes"""
    w = math.acos(cut) / n; out = []
    for i in range(n):
        c = (2 * PI * i - phase) / n
        out += [c - w, c + w, c + PI / n]
    return np.sort(np.mod(np.array(out), 2 * PI))
def stripe_paint(centre, au, av, n, phase, cut):
    def paint(ins, Ac):
        q = Ac[:, :3] - centre; ang = np.arctan2(q @ av, q @ au)
        o = np.full(len(Ac), 'scarf', dtype=object); o[np.cos(n * ang + phase) > cut] = 'stripe'; return o
    return paint
def build_band():
    # band_centre's angle th: e = (sin th, -cos th): measured from -Y toward +X, like stripe_paint's (au, av) below
    ths = stripe_angles(SC_STRIPES, SC_PHASE, SC_CUT)
    CE = [band_centre(t) for t in ths]
    C = np.array([c for c, _ in CE]); E = np.array([e for _, e in CE])
    V, F, A = loop_tube(C, 6, lambda i: SC_TH, frame=up_frame(E), expo=2.6)
    pc = Piece('band', V, F, A=A, paint=stripe_paint(SC_CEN, np.array([0, -1.0, 0]), np.array([1.0, 0, 0]),
                                                     SC_STRIPES, SC_PHASE, SC_CUT))
    tt = np.concatenate([ths - 2 * PI, ths, ths + 2 * PI])
    rc = np.tile(np.hypot(C[:, 0] - SC_CEN[0], C[:, 1] - SC_CEN[1]), 3); zc = np.tile(C[:, 2], 3)
    def inside(Q):
        q = Q[:, :3]; th = np.arctan2(q[:, 0] - SC_CEN[0], -(q[:, 1] - SC_CEN[1]))
        th = np.mod(th, 2 * PI); r0 = np.interp(th, tt, rc); z0 = np.interp(th, tt, zc)
        rho = np.hypot(q[:, 0] - SC_CEN[0], q[:, 1] - SC_CEN[1])
        return np.minimum(SC_TH[1] * 0.92 - np.abs(q[:, 2] - z0), r0 + SC_TH[0] * 0.92 - rho)
    pc.inside = inside
    return pc
TAIL = [(0.255, 0.905), (0.300, 0.760), (0.352, 0.590), (0.405, 0.420), (0.440, 0.290), (0.452, 0.215)]
TAIL_ST = [(0.385, 0.038), (0.590, 0.038), (0.780, 0.036)]
def build_tail():
    C = []
    for x, z in TAIL:
        S = hit_front(union_snow, x, z); n = unit_normals(union_snow, S[None])[0]
        C.append(S + n * 0.032)
    C = np.array(C)
    n0 = unit_normals(union_snow, C[2][None])[0]; T0 = nrm(C[3] - C[1])
    side = nrm(np.cross(n0, T0)); side = nrm(side + np.array([0.55, 0, 0]) * np.sign(side[0]))   # broad face to the camera
    sv = [0.0, 0.17]
    for c, w in TAIL_ST: sv += [c - w, c + w]
    sv += [0.925, 1.0]
    V, F, A, info = sweep(list(C), 0, 8, lambda s: (0.026, 0.104 + 0.008 * s), side, expo=3.5, caps=(False, True),
                          cap_rings=1, svals=sv)
    def paint(ins, Ac):
        s = Ac[:, 3]; o = np.full(len(Ac), 'scarf', dtype=object)
        for c, w in TAIL_ST: o[np.abs(s - c) < w] = 'stripe'
        o[s > 0.925] = 'fringe'; return o
    return Piece('tail', V, F, A=A, paint=paint, occluder=False)

# =========================================================================================== body assembly
def build_body_items(v):
    P = [build_ball_piece('bottom', body_f, np.array([0, 0, 0.42]), [0, 0, 1], [0, -1, 0],
                          [0, 14, 28, 42, 56, 70, 84, 98, 112, 135, 180], 20, 'snow'),
         build_ball_piece('head', head_f, HEAD_C, [0, -1, 0], [0, 0, 1],
                          [0, 13, 26, 39, 52, 66, 80, 95, 110, 128, 150, 180], 22, 'snow',
                          lenses=[(nrm(np.array([k * EYE_X, -0.33, EYE_Z - HEAD_C[2]])), 0.32, 0.75) for k in (-1, 1)]),
         *build_eye(-1), *build_eye(1), build_brow(-1), build_brow(1), build_blush(-1), build_blush(1),
         build_carrot(), build_bucket(), build_handle(), build_band(), build_tail()] + build_grin() + build_buttons()
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== arms
ARM_ZERO = math.radians(-48)      # the twig's angle below horizontal at rotation 0 (the game's rest raise 0.3 -> -31 deg)
def pivot(k):
    """1.5 cm inside the snow where the twig goes in (mirror-symmetric: the mean of both sides' surface x)"""
    z, y = 0.785, -0.02
    xs = [abs(ray_exit(body_f, np.array([0, y, z]), np.array([[j, 0, 0.0]]), 1.0)[0][0]) for j in (-1, 1)]
    return np.array([k * (np.mean(xs) - 0.015), y, z])
PIV = {k: pivot(k) for k in (-1, 1)}
def arm_frame(k):
    a = np.array([k * math.cos(ARM_ZERO), 0.0, math.sin(ARM_ZERO)])
    up = nrm(np.array([0, 0, 1.0]) - a[2] * a)
    return a, up, np.array([0, -1.0, 0])
def mitten_f_k(k, P0=None, a=None, up=None, fw=None, scale=1.0):
    """the mitten: a big round fist + a thumb lobe on the inner-lower-front side (toward the body and the camera)"""
    if P0 is None:
        a, up, fw = arm_frame(k); P0 = PIV[k]
    side = np.cross(a, up); side = side if side @ fw >= 0 else -side      # == fw for the arms
    hc = P0 + a * 0.560 * scale - up * 0.030 * scale + side * 0.012 * scale
    R = np.stack([a, up, side], 1)
    th_c = hc - a * 0.080 * scale - up * 0.112 * scale + side * 0.085 * scale
    t1 = nrm(-up * 0.35 + side * 0.75 - a * 0.55)
    t2 = nrm(np.cross(side, t1)); t3 = np.cross(t1, t2)
    Rt = np.stack([t1, t2, t3], 1)
    r = np.array([0.168, 0.170, 0.142]) * scale
    def f(p):
        d = sd_ell(p, hc, r, R)
        return smin(d, sd_ell(p, th_c, np.array([0.078, 0.060, 0.058]) * scale, Rt), 0.022 * scale)
    return f, hc
def build_cuff(cc, a, up, name, scale=1.0, n=12, ns=6):
    """the knitted cuff: a fat rolled ring round the wrist (axis a, centre cc)"""
    t = 2 * PI * np.arange(n) / n; b2 = np.cross(a, up)
    Nn = np.cos(t)[:, None] * up + np.sin(t)[:, None] * b2
    Cc = cc + 0.080 * scale * Nn
    V, F, A = loop_tube(Cc, ns, lambda i: (0.044 * scale, 0.050 * scale), frame=lambda i, T: (Nn[i], a), expo=2.2)
    pc = Piece(name, V, F, A=A, paint=keyed('cuff'))
    pc.inside = (lambda P: np.minimum(0.044 * scale - np.abs((P[:, :3] - cc) @ a),
                                      0.120 * scale - L((P[:, :3] - cc) - ((P[:, :3] - cc) @ a)[:, None] * a)))
    return pc
def build_arm_items(k, v):
    a, up, fw = arm_frame(k); P0 = PIV[k]
    root = P0 - a * 0.055; cuff = P0 + a * 0.335
    mid = P0 + a * 0.16 + up * 0.018
    V, F, A, _ = sweep([root, mid, cuff], 5, 6, lambda s: ((0.041 - 0.008 * s),) * 2, fw, caps=(True, True), cap_rings=1)
    twig = Piece(f'twig{k}', V, F, A=A, paint=keyed('twig'), orient=seg_orient(root, cuff), occluder=False)
    sp0 = P0 + a * 0.245 + up * 0.012; spd = nrm(up * 1.0 + a * 0.35 - fw * 0.05)
    V, F, A, _ = sweep([sp0 - spd * 0.02, sp0 + spd * 0.04, sp0 + spd * 0.085], 3, 7, lambda s: ((0.026 - 0.004 * s),) * 2, a,
                       caps=(False, True), cap_rings=1)
    spur = Piece(f'spur{k}', V, F, A=A, paint=keyed('twig'), orient=seg_orient(sp0, sp0 + spd), occluder=False)
    cuffp = build_cuff(cuff + a * 0.045, a, up, f'cuff{k}', n=11)
    f, hc = mitten_f_k(k)
    rows = star_rows(f, hc, -a, up, np.radians([0, 25, 50, 75, 100, 125, 150, 180]), 16, 0.5,
                     lenses=[(nrm(-up * 0.5 + fw * 0.8 - a * 0.3), 0.7, 0.6)])
    V, F = rows_mesh(rows)
    mit = Piece(f'mitten{k}', V, F, sdf=f, paint=keyed('mitten'))
    items = [process(p) for p in (twig, spur, cuffp, mit)]
    cull_buried(items)
    return items

# =========================================================================================== the rolling ball
# round 2: packed snow (a few big soft bulges, two snow clumps stuck on, coal lumps), the bucket half-buried at a
# tumbling angle on the side (rim + wall showing, packed with snow), a fat cuffed mitten and a twig stub
BALL_R = 0.72; BALL_O = np.array([0.0, 0.0, BALL_R])
BULGES = [(nrm(np.array(d)), r) for d, r in (((-0.30, -0.80, 0.35), 0.40), ((0.55, 0.25, -0.75), 0.42),
                                             ((-0.20, 0.70, 0.62), 0.38), ((0.70, -0.55, 0.30), 0.34))]
def rball_f(p):
    d = sd_sph(p, BALL_O, BALL_R) - wob(p * 0.75 + 0.5, 0.016)
    for e, r in BULGES:
        d = smin(d, sd_sph(p, BALL_O + e * (BALL_R + 0.095 - r), r), 0.16)
    return d
RB_N = nrm(np.array([0.80, 0.16, 0.58]))                 # the scarf's great circle: diagonal, so it tumbles visibly
def surf_at(f, d): return ray_exit(f, BALL_O, nrm(d)[None], 1.5)[0]
# the ball's bucket: the snowman's bucket (same lips and wall); snow packed into its mouth 17 cm deep, so a
# dark-red inner wall shows inside the lip (an empty mouth or a flush plug read as an ear / a ring from 45 deg)
BB_PROF = [(0.0, 0.170), (0.205, 0.170), (0.240, 0.150), (0.252, 0.030), (0.268, 0.002), (0.296, -0.007), (0.314, 0.020),
           (0.299, 0.048), (0.274, 0.052), (0.228, 0.302), (0.240, 0.322), (0.205, 0.340), (0.0, 0.344)]
BB_D = nrm(np.array([0.50, 0.42, 0.58]))                 # where it sits on the ball: upper back-right
BB_TILT = math.radians(58)                               # its axis 58 deg off the ball's radius: tipped, caught up in the roll
def bb_frame():
    t = nrm(np.cross(BB_D, [1.0, 0, 0])); ax = nrm(-math.cos(BB_TILT) * BB_D + math.sin(BB_TILT) * t)   # mouth -> top
    x = nrm(np.cross(ax, BB_D)); y = np.cross(ax, x)
    S = surf_at(rball_f, BB_D); M = S + BB_D * 0.065
    return np.stack([x, y, ax], 1), M - ax * 0.172
def build_rbucket():
    R, O = bb_frame()
    V, F, A = lathe(BB_PROF, 13); V = V @ R.T + O
    def paint(ins, Ac):
        r = Ac[:, 3]; o = np.full(len(Ac), 'lip', dtype=object)
        o[r < 1.99] = 'bsnow'; o[(r > 1.99) & (r < 2.99)] = 'binner'
        o[(r > 7.99) & (r < 8.99)] = 'bucket'; o[r > 10.99] = 'btop'; return o
    pc = Piece('rbucket', V, F, A=A, paint=paint)
    def inside(Q):                                       # the solid wall only: snow inside the mouth stays (packed in)
        q = (Q[:, :3] - O) @ R; h = q[:, 2]; rho = np.hypot(q[:, 0], q[:, 1])
        wr = 0.274 + (0.228 - 0.274) * (np.clip(h, 0.05, 0.30) - 0.052) / 0.25
        outer = np.minimum(np.minimum(h, 0.33 - h), wr - rho)
        return outer
    pc.inside = inside
    return pc
CLUMPS = [((0.10, -0.95, -0.30), 0.175), ((-0.62, 0.55, -0.20), 0.140)]
COAL = [((-0.15, -0.55, 0.82), 0.082), ((0.42, -0.72, -0.10), 0.070), ((-0.45, 0.20, -0.85), 0.076), ((0.05, 0.62, -0.78), 0.066)]
def build_rball_items(v):
    P = [build_ball_piece('rball', rball_f, BALL_O, [0, 0, 1], [0, -1, 0],
                          [0, 16, 33, 49, 65, 82, 98, 115, 131, 147, 164, 180], 20, 'bsnow', tmax=1.5)]
    # the scarf band round a diagonal great circle (culls the snow under it)
    u0 = nrm(np.cross(RB_N, [0, 0, 1.0])); v0 = np.cross(RB_N, u0)
    t = stripe_angles(7, 0.3, SC_CUT)
    E = np.cos(t)[:, None] * u0 + np.sin(t)[:, None] * v0
    S = ray_exit(rball_f, BALL_O, E, 1.5)
    C = S + E * 0.036
    V, F, A = loop_tube(C, 5, lambda i: (0.064, 0.122), frame=lambda i, T: (E[i], RB_N), expo=2.6)
    rb = Piece('rband', V, F, A=A, paint=stripe_paint(BALL_O, u0, v0, 7, 0.3, SC_CUT))
    rb.inside = lambda Q: np.minimum(0.122 * 0.92 - np.abs((Q[:, :3] - BALL_O) @ RB_N), L(S - BALL_O).min() + 0.036 + 0.058 - L(Q[:, :3] - BALL_O))
    P.append(rb)
    # a fat mitten poking out (cuff + twig stub), as big as the snowman's
    dm = nrm(np.array([-0.80, -0.42, 0.30]))
    upm = nrm(np.array([0, 0, 1.0]) - (dm @ np.array([0, 0, 1.0])) * dm); fwm = nrm(np.cross(upm, dm))
    if fwm[1] > 0: fwm = -fwm
    Sm = surf_at(rball_f, dm)
    tw0 = Sm - dm * 0.06; tw1 = Sm + dm * 0.10
    V, F, A, _ = sweep([tw0, .5 * (tw0 + tw1), tw1], 3, 7, lambda s: (0.044, 0.044), upm, caps=(False, False))
    P.append(Piece('rtwig', V, F, A=A, paint=keyed('twig'), orient=seg_orient(tw0, tw1), occluder=False))
    P.append(build_cuff(Sm + dm * 0.135, dm, upm, 'rcuff', scale=1.25, n=10, ns=5))
    f, hc = mitten_f_k(-1, P0=Sm - dm * 0.36, a=dm, up=upm, fw=fwm, scale=1.25)
    rows = star_rows(f, hc, -dm, upm, np.radians([0, 30, 60, 90, 120, 150, 180]), 14, 0.6)
    V, F = rows_mesh(rows)
    P.append(Piece('rmitten', V, F, sdf=f, paint=keyed('mitten')))
    # a chunky twig stub with a spur on the far side
    dt = nrm(np.array([0.62, 0.50, -0.30]))
    St = surf_at(rball_f, dt); sideT = nrm(np.cross(dt, [0, 0, 1.0]))
    a0 = St - dt * 0.05; a1 = St + dt * 0.12; a2 = St + dt * 0.22 + sideT * 0.035
    V, F, A, _ = sweep([a0, a1, a2], 3, 6, lambda s: ((0.046 - 0.010 * s),) * 2, sideT, caps=(False, True), cap_rings=1)
    P.append(Piece('rtwig2', V, F, A=A, paint=keyed('twig'), orient=seg_orient(a0, a2), occluder=False))
    P.append(build_rbucket())
    # snow clumps stuck on (their own little balls: the outline marks where they meet the ball)
    for i, (d, r) in enumerate(CLUMPS):
        d = nrm(np.array(d)); c = surf_at(rball_f, d) + d * (r * 0.05)
        ref = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0])
        Rc = np.stack([nrm(np.cross(ref, d)), np.cross(d, nrm(np.cross(ref, d))), d], 1)     # a flattened lump, squashed onto the ball
        fc = (lambda c_, r_, R_: (lambda q: sd_ell(q, c_, (r_, r_ * 0.85, r_ * 0.55), R_) - wob(q * 2.0, 0.006)))(c, r, Rc)
        rows = star_rows(fc, c, d, ref, np.radians([0, 40, 80, 120, 180]), 8, 0.5)
        V, F = rows_mesh(rows)
        P.append(Piece(f'rclump{i}', V, F, sdf=fc, paint=keyed('bsnow')))
    # coal lumps (the snowman's eyes / buttons caught in the roll)
    for i, (d, r) in enumerate(COAL):
        P.append(dome_decal(rball_f, surf_at(rball_f, np.array(d)), r, r * 0.88, 0.020, 'coal', f'rcoal{i}', nseg=7,
                            rings=(0.6, 1.0), skirt_key='bsnow'))
    items = [process(p) for p in P]
    cull_buried(items)
    return items

# =========================================================================================== assemble
def palette(v):
    pal = dict(COMMON); pal.update({k: x for k, x in v.items() if isinstance(x, str)})
    pal['snow_sh'] = pal['shade']; pal['snow_shp'] = (0.0, 0.95, 0.78)
    pal['bsnow'] = mulhex(pal['snow'], 0.985)
    pal['btop'] = mulhex(pal['bucket'], 0.92)
    pal['binner'] = mulhex(pal['bucket'], 0.62)
    pal['stripe_sh'] = mulhex(pal['stripe'], 0.86)
    pal['scarf_sh'] = mulhex(pal['scarf'], 0.80)
    pal['fringe'] = mulhex(pal['scarf'], 0.84)
    pal['cuff'] = mulhex(pal['mitten'], 0.90)
    pal['mitten_sh'] = mulhex(pal['mitten'], 0.80)
    pal['cuff_sh'] = mulhex(pal['mitten'], 0.74)
    pal['bucket_sh'] = mulhex(pal['bucket'], 0.84)
    pal['twig_sh'] = mulhex(pal['twig'], 0.80)
    return pal

def export(fn, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=fn, export_format='GLB', export_apply=True, use_selection=True,
                              export_yup=True, export_attributes=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_texcoords=False,
                              export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_materials='EXPORT')

def build_variant(vname):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    np.random.seed(7)
    v = VARIANTS[vname]; pal = palette(v)
    parts = {'body': (build_body_items(v), np.zeros(3)),
             'armR': (build_arm_items(1, v), PIV[1]), 'armL': (build_arm_items(-1, v), PIV[-1]),
             'ball': (build_rball_items(v), BALL_O)}
    obs = [make_object(n, its, pal, o, flat=(n == 'ball')) for n, (its, o) in parts.items()]
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['pieces'] = {f'{n}.{it["name"]}': len(it['T']) for n, (its, _) in parts.items() for it in its}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    stats['bucket_origin'] = [round(float(x), 4) for x in BK_O]
    fn = 'yukidaruma' + ('' if vname == 'base' else '_' + vname)
    if vname == 'base':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'yukidaruma.blend'))
        os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
        export(os.path.join(TASK_DIR, 'work', 'yukidaruma_noball.glb'), [o for o in obs if o.name != 'ball'])
    export(os.path.join(MODELS, fn + '.glb'), obs)
    print('YUKI', vname, json.dumps(stats))
    return stats

if __name__ == '__main__':
    names = list(VARIANTS) if WANT == 'all' else [WANT]
    allstats = {}
    for n in names:
        allstats[n] = build_variant(n)
    os.makedirs(os.path.join(TASK_DIR, 'work'), exist_ok=True)
    with open(os.path.join(TASK_DIR, 'work', 'build_stats.json' if WANT == 'all' else f'build_stats_{WANT}.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=1)
