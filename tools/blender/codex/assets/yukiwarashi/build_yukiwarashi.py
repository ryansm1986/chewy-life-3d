"""Yuki-warashi (Yukimi Onsen, enemy series EN-1) -- deterministic build, Option A "Straw Snow Child" (refs/sheet.png).

Blender 4.3:
  blender --background --factory-startup --python build_yukiwarashi.py [-- --variant base|snowdrift|camellia|all]

Builds every variant from an empty scene, saves yukiwarashi.blend (the base) and exports
public/models/yukiwarashi.glb, yukiwarashi_snowdrift.glb and yukiwarashi_camellia.glb.
Units: metres, front = -Y, ground z = 0, +X = the image right in the front view.

Enemy contract (.claude/skills/codex-blender/templates/enemy-model-contract.md):
  rigid parts, no rig, no UVs, no textures; one face-corner colour attribute `Col`; one material `toon`.
  body  : origin (0, 0, 0)   mino (3 tiers), head skin + ears, okappa bob (crown/fringe + two side locks), kasa + snow
                             heap (camellia: the flower), scarf + tail, boots
  face  : origin (0, 0, 0)   eyes, brows, nose, mouth, blush: decal shells lying on the head skin (thin outline in game)
  armR  : origin PIV[+1]     the +X shoulder ball / sleeve, cuff, mitten (+ thumb)
  armL  : origin PIV[-1]     the mirror
  ballR : origin = its centre, in the +X mitten's front-lower palm (on top of the mitten when the arm is raised)
  ballL : the mirror
  The arms are modelled hanging with a baked outward splay (SIG) at rotation 0; the game's rest pose (rx -0.4,
  splay +-0.12) swings them a little forward and out, which is the sheet's pose. The shoulder ball is a sphere
  centred on the pivot, so it turns in place: no gap at any angle.

Technique (the framework of the approved enemies, copied from build_kappa.py):
- Head, hair, ears, mittens, cuffs, boots, snowballs are implicit surfaces (smooth unions / intersections of
  ellipsoids, superquadrics, planes) sampled as star-shaped grids (rays from a centre, root-found onto the surface).
- The mino tiers are lathes with a zig-zag hem (4 columns per tooth at the hem, 2 above: pentagon transition rows);
  the kasa is a lathe; the scarf a closed tube; the scarf tail a sweep.
- Colour borders are cut into the mesh as level-set contours of feature fields (iris halves, catchlights, lash,
  soles, the snowdrift frost) so every border runs along an edge loop; face features are decal shells on the head.
- Faces buried more than CULL inside another shell of the same part are culled (never across parts).
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/yukiwarashi'
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
    tint = getattr(pc, 'tint', None)               # (weights(A) per vertex, palette key): a soft painted sheen, no border
    tw = tint[0](A) if tint else np.zeros(len(P))
    return dict(P=P, N=Nv, T=tris, keys=np.asarray(keys), part=pc.part, name=pc.name, occ=pc.occluder, ao=ao, inside=inside,
                tw=tw, tk=tint[1] if tint else None)


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
        it['ao'] = it['ao'][used]; it['tw'] = it['tw'][used]

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
    tw = np.concatenate([it['tw'] for it in items]); tcol = np.zeros((len(tw), 3))
    off = 0
    for it in items:
        if it['tk']: tcol[off:off + len(it['P'])] = srgb_lin(pal[it['tk']])
        off += len(it['P'])
    fc = fc * (1 - tw[li][:, None]) + tcol[li] * tw[li][:, None]
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

# =========================================================================================== extra mesh helpers
def rings_mesh(rows):
    """like rows_mesh, but consecutive rings may differ by a factor 2 (n -> 2n or 2n -> n): pentagons there"""
    V = []; F = []; idx = []
    for r in rows:
        idx.append(list(range(len(V), len(V) + len(r)))); V.extend(list(r))
    for a, b in zip(idx[:-1], idx[1:]):
        na, nb = len(a), len(b)
        if na == 1:
            F += [(a[0], b[(j + 1) % nb], b[j]) for j in range(nb)]
        elif nb == 1:
            F += [(a[j], a[(j + 1) % na], b[0]) for j in range(na)]
        elif na == nb:
            F += [(a[j], a[(j + 1) % na], b[(j + 1) % nb], b[j]) for j in range(na)]
        elif nb == 2 * na:
            F += [(a[j], a[(j + 1) % na], b[(2 * j + 2) % nb], b[2 * j + 1], b[2 * j]) for j in range(na)]
        elif na == 2 * nb:
            F += [(a[2 * j], a[2 * j + 1], a[(2 * j + 2) % na], b[(j + 1) % nb], b[j]) for j in range(nb)]
        else:
            raise ValueError('ring step')
    return np.array(V, float), F

def grid_rows(sdf, centre, elevs, azs, tmax, R=None):
    """rays from centre on an (elevation, azimuth) grid; azimuth 0 = front (-Y), positive toward +X; +-90 = poles.
    R: the grid's frame (local -> world rotation)"""
    rows = []; R = np.eye(3) if R is None else R
    for e in elevs:
        if abs(e) > 89.99:
            rows.append(ray_exit(sdf, centre, np.array([[0.0, 0.0, float(np.sign(e))]]) @ R.T, tmax)); continue
        er = math.radians(e)
        D = np.stack([np.sin(azs) * math.cos(er), -np.cos(azs) * math.cos(er), np.full(len(azs), math.sin(er))], -1)
        rows.append(ray_exit(sdf, centre, D @ R.T, tmax))
    return rows

def frame_R(c1, c2, c3):
    return np.stack([nrm(c1), nrm(c2), nrm(c3)], 1)
def sd_ell_R(p, c, r, R): return sd_ell(p, c, r, R)
def superq_R(p, c, r, R, n=2.0, m=3.0):
    q = (p - np.asarray(c, float)) @ R
    return superq(q, (0, 0, 0), r, n, m)

def rotz(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])
def RxB(a):
    c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def RyB(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def game_arm_R(k, rx, splay):
    """the game's arm rotation (three.js Euler XYZ: rotation.set(rx, 0, rz), rz = k * splay) in Blender axes"""
    return RxB(rx) @ RyB(-k * splay)

CULL = 0.02

# =========================================================================================== the design: head
# The whole head (skin, bob, ears, kasa) is designed upright in a head frame and tipped back TILT about NECK, so the
# face looks up a little toward the game's 45-degree camera (the bob's crown otherwise hides half of the face from there).
NECK = np.array([0.0, -0.02, 0.56]); TILT = -0.17
RT = RxB(TILT)
def untilt(p): return (np.asarray(p, float) - NECK) @ RT + NECK
def tilt(p): return (np.asarray(p, float) - NECK) @ RT.T + NECK
def tiltv(v): return np.asarray(v, float) @ RT.T
HC = np.array([0.0, 0.0, 0.722])
def head_base(p): return head_base0(untilt(p))
def head_base0(p):
    d = sd_ell(p, HC, (0.212, 0.200, 0.182))                        # the skull (its crown well under the bob)
    return smin(d, sd_ell(p, (0.0, -0.045, 0.636), (0.192, 0.165, 0.106)), 0.06)   # the full, round lower face

EYE_X, EYE_Z = 0.095, 0.676
EX, EY = 0.0330, 0.0370                     # iris half-sizes (the sheet: 0.062 x 0.067 m with the white ring)
WR = 0.0032                                 # the white ring round the iris
EYES = {}
for _k in (-1, 1):
    _pe = hit_front(head_base0, _k * EYE_X, EYE_Z)
    _n = unit_normals(head_base0, _pe[None])[0]
    _A = nrm(_n * 0.85 + np.array([0, -1, 0]) * 0.15)
    _U = nrm(np.cross([0, 0, 1], _A)); _V = np.cross(_A, _U)
    EYES[_k] = (tilt(_pe), tiltv(_A), tiltv(_U), tiltv(_V))

def head_sdf(p):
    d = head_base(p)
    for k in (-1, 1):
        pe, A_, U_, V_ = EYES[k]
        R = np.stack([U_, V_, A_], 1)
        d = smin(d, sd_ell(p, pe - A_ * 0.018, ((EX + WR) * 1.06, (EY + WR) * 1.06, 0.0235), R), 0.012)   # domed eye lens
    return d

def eye_lash2(u, v, k):
    uo = k * u
    arc = np.maximum(ell2(u, v - 0.0025, EX + WR + 0.0025, EY + WR + 0.0038), -(v - 0.011))   # the crescent over the top
    flick = stroke(uo, v, [(EX + 0.001, 0.016), (EX + 0.006, 0.020), (EX + 0.0105, 0.0250)], 0.0026, 0.0034)
    return smin(arc, flick, 0.003)
def eye_out2(u, v, k): return np.minimum(ell2(u, v, EX + WR, EY + WR), eye_lash2(u, v, k))
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
SKIRT = (0.0040, -0.0022)
def skin_key(P): return np.full(len(P), 'skin', dtype=object)

def build_eye(k):
    """iris (dark top, warm-brown bowl below, a big + a small catchlight), a white ring, the lash crescent + flick"""
    pe, A_, U_, V_ = EYES[k]
    nseg = 12; ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg; c2 = np.zeros(2)
    r_iris = exit2(lambda u, v, k_: ell2(u, v, EX, EY), c2, ang, k)
    r_white = exit2(lambda u, v, k_: ell2(u, v, EX + WR, EY + WR), c2, ang, k)
    r_out = np.maximum(exit2(eye_out2, c2, ang, k), r_white + 0.0015)
    rows, att = [], []
    def row(rad, off, band):
        u = rad * np.cos(ang); v = rad * np.sin(ang)
        rows.append(on_head(pe, A_, U_, V_, u, v, off)); att.append(np.stack([np.full(nseg, band), u, v], -1))
    rows.append(on_head(pe, A_, U_, V_, np.array([0.0]), np.array([0.0]), 0.0016)); att.append(np.array([[0.0, 0.0, 0.0]]))
    row(r_iris * 0.5, 0.0016, 1)
    row(r_iris, 0.0016, 2)
    row(r_white, 0.0016, 3)
    row(r_out, 0.0016, 4)
    row(r_out + SKIRT[0], SKIRT[1], 5)
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def f_low(P): u, v = P[:, 4], P[:, 5]; return v - (-0.0035 + 2.6 * u * u)
    def f_cl(P): u, v = P[:, 4], P[:, 5]; return np.hypot(u + 0.0095, v - 0.0125) - 0.0078
    def f_cs(P): u, v = P[:, 4], P[:, 5]; return np.hypot(u - 0.0105, v + 0.0125) - 0.0036
    def f_lash(P): u, v = P[:, 4], P[:, 5]; return np.maximum(eye_lash2(u, v, k), -ell2(u, v, EX + WR, EY + WR))
    def paint(ins, Ac):
        b = Ac[:, 3]
        o = np.full(len(Ac), 'eyewhite', dtype=object)
        iris = b < 2.0001
        o[iris] = 'iristop'; o[iris & ins['low']] = 'iris'; o[iris & (ins['cl'] | ins['cs'])] = 'catch'
        o[(b > 3) & (b < 4) & ins['lash']] = 'eye'
        sk = b > 4.0001; o[sk] = skin_key(Ac[sk, :3])
        return o
    return Piece(f'eye{k}', V, F, A=A, fields={'low': f_low, 'cl': f_cl, 'cs': f_cs, 'lash': f_lash}, paint=paint,
                 nsdf=head_sdf, orient=head_up, refine=[(('cl',), 0.0016, 0.0085)], part='face')

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
    return Piece(name, V, F, A=A, paint=paint, nsdf=None if relief else head_sdf, orient=head_up, part='face')

def surface_curve(k, pts2, off=0.0):
    pe, A_, U_, V_ = EYES[k]; p = np.asarray(pts2, float)
    return on_head(pe, A_, U_, V_, k * p[:, 0], p[:, 1], off)

def build_brow(k):
    """a small soft arc just under the fringe (the sheet's brows; lowered ~1.5 cm so the fringe's ink can't cover it)"""
    C = surface_curve(k, [(-0.016, 0.0500), (-0.004, 0.0545), (0.009, 0.0550), (0.018, 0.0525)])
    return decal_strip(C, lambda s: 0.0022 + 0.0009 * math.sin(PI * s) ** 0.8, 0.0010, 5, 'brow', f'brow{k}', ncol=5)

NOSE_P = tilt(hit_front(head_base0, 0.0, 0.654))
def build_nose():
    n0 = unit_normals(head_sdf, NOSE_P[None])[0]; U_ = nrm(np.cross([0, 0, 1], n0)); V_ = np.cross(n0, U_)
    nseg = 10; ang = 2 * PI * np.arange(nseg) / nseg
    R = 0.0118
    p0 = project(head_sdf, NOSE_P[None], 3)[0]
    rows, att = [p0[None] + n0 * 0.0055], [np.array([[0.0, 0, 0]])]
    for x in (0.55, 1.0, 1.0 + SKIRT[0] / 0.012):
        u = R * x * np.cos(ang); v = R * x * np.sin(ang) * 0.80
        P = project(head_sdf, p0 + u[:, None] * U_ + v[:, None] * V_, 3); nn = unit_normals(head_sdf, P)
        h = SKIRT[1] if x > 1 else 0.0050 * (1 - x * x) ** 1.2 + 0.0008
        rows.append(P + nn * h); att.append(np.stack([np.full(nseg, x), u, v], -1))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'nose', dtype=object)
        skm = Ac[:, 3] > 1.0001; o[skm] = skin_key(Ac[skm, :3]); return o
    return Piece('nose', V, F, A=A, paint=paint, orient=head_up, part='face')

MOUTH = [(-0.0275, 0.6300), (-0.0140, 0.6228), (0.0, 0.6203), (0.0140, 0.6228), (0.0275, 0.6300)]
def build_mouth():
    C = tilt(np.array([hit_front(head_base0, x, z) for x, z in MOUTH]))
    return decal_strip(C, lambda s: 0.0029 + 0.0007 * math.sin(PI * s), 0.0012, 7, 'mouth', 'mouth', relief=False, ncol=5)

CHEEK = {}
for _k in (-1, 1):
    _pc = tilt(hit_front(head_base0, _k * 0.126, 0.622))
    _n = unit_normals(head_base, _pc[None])[0]; _U = nrm(np.cross(tiltv([0, 0, 1]), _n)); _V = np.cross(_n, _U)
    CHEEK[_k] = (_pc, _n, _U, _V)
def build_blush(k):
    pc_, n0, U_, V_ = CHEEK[k]
    nseg = 10; ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [project(head_sdf, pc_[None], 3) + n0 * 0.0012], [np.array([[0.0]])]
    for x, h in ((1.0, 0.0012), (1.0 + SKIRT[0] / 0.03, SKIRT[1])):
        P = pc_ + (0.033 * x * np.cos(ang))[:, None] * U_ + (0.0235 * x * np.sin(ang))[:, None] * V_
        P = project(head_sdf, P, 3); rows.append(P + unit_normals(head_sdf, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'blush', dtype=object); skm = Ac[:, 3] > 1.0001
        o[skm] = 'skin'; return o
    return Piece(f'blush{k}', V, F, A=A, paint=paint, nsdf=head_sdf, orient=head_up, part='face')

def build_face_items(v):
    P = [build_eye(-1), build_eye(1), build_brow(-1), build_brow(1), build_nose(), build_mouth(), build_blush(-1), build_blush(1)]
    return [process(p) for p in P]

def build_head():
    th = np.radians([0, 14, 28, 43, 58, 74, 90, 108, 130, 180])
    ctr = tilt([0, -0.03, 0.70])
    lenses = [(nrm(EYES[k][0] - ctr), 0.30, 0.6) for k in (-1, 1)]
    rows = star_rows(head_sdf, ctr, tiltv([0, -1, 0]), tiltv([0, 0, 1]), th, 20, 0.6, lenses=lenses)
    V, F = rows_mesh(rows)
    return Piece('headball', V, F, sdf=head_sdf, paint=keyed('skin'))

# =========================================================================================== the okappa bob
ZF = 0.755                                  # the blunt fringe's lower edge
YW = 0.005                                  # where the side locks meet the back bob (the ears sit in that groove)
HAIR_BOT = 0.562
EAR_C = (0.258, -0.020, 0.646)       # the ears sit in a notch at the back of the side locks, seen from the front
def bob_f(p):
    t = np.clip((p[..., 2] - 0.66) / 0.26, 0, 1); q = p * 1.0
    q[..., 0] = p[..., 0] / (1 - 0.10 * t)            # (the crown a touch narrower: the sheet's bell)
    return sd_ell(q, (0.0, 0.028, 0.648), (0.297, 0.228, 0.288))       # the sheet's bell: round crown, widest at the cheeks
def fringe_f(p): return sd_ell(p, (0.0, -0.002, 0.762), (0.232, 0.222, 0.172))    # the fringe's thickness over the brow
def hair_full(p): return hair_full0(untilt(p))
def hair_full0(p):
    d = smin(bob_f(p), fringe_f(p), 0.04)
    d = smax(d, HAIR_BOT - p[..., 2], 0.045)
    for k in (-1, 1):                         # the notches the ears peek out of
        d = smax(d, -sd_ell(p, (k * (EAR_C[0] + 0.032), EAR_C[1] - 0.030, EAR_C[2]), (0.052, 0.058, 0.054)), 0.012)
    return d
def hair_main_f(p):
    """crown + fringe + back bob: the full bob minus the front-lower quadrant (z < ZF, y < YW)"""
    p = untilt(p); q = np.maximum(p[..., 2] - ZF_x(p[..., 0]), p[..., 1] - YW)
    return smax(hair_full0(p), -q, 0.009)
def ZF_x(x):                                  # round 2: the fringe's ends curve down a little into the side locks
    t = np.clip((np.abs(x) - 0.105) / 0.085, 0, 1); return ZF - 0.017 * t * t * (3 - 2 * t)
FACE_O = (0.665, 0.200, 0.160)               # (z centre, half-width, half-height) of the round face the locks hug
def XS(z):                                   # the side locks' inner edge (|x|): round 2 follows the cheeks' oval (was a straight 0.176)
    zc, a, b = FACE_O
    return 0.008 + a * np.sqrt(np.clip(1 - ((z - zc) / b) ** 2, 0.36, 1))
LOCK_BOT = 0.600                             # round 2: the locks end higher than the back bob (the round jaw shows below)
def lock_f_k(k):
    def f(p):
        p = untilt(p); x, y, z = p[..., 0], p[..., 1], p[..., 2]
        d = smax(hair_full0(p), XS(z) - k * x, 0.010)
        d = smax(d, y - YW, 0.012)
        d = smax(d, -0.128 - y, 0.022)          # (the locks' fronts sit behind the cheeks: the face reads wider from 3/4)
        d = smax(d, LOCK_BOT - z, 0.022)
        return smax(d, z - (ZF + 0.045), 0.015)
    return f
CH = np.array([0.0, 0.07, 0.80])
HAIR_ELEV = [90, 50, 26, 10, 1, -5, -8, -10, -13, -20, -29, -36, -41, -45, -50, -90]
def sheen_field(P):
    Q = untilt(P[:, :3]); return np.maximum(ell2(Q[:, 0] + 0.03, Q[:, 2] - 0.848, 0.180, 0.0300), Q[:, 1] + 0.02)
def build_hair(v):
    azs = 2 * PI * (np.arange(30) + 0.5) / 30
    rows = grid_rows(hair_main_f, tilt(CH), HAIR_ELEV, azs, 0.6, RT)
    V, F = rows_mesh(rows)
    hp = Piece('hair', V, F, sdf=hair_main_f, paint=keyed('hair'))
    if v.get('hairhi'):                         # snowdrift: a soft lavender sheen band across the crown (vertex-colour gradient)
        hp.tint = (lambda A: 0.55 * np.clip(-sheen_field(A) / 0.022, 0, 1) ** 0.8, 'hairhi')
    out = [hp]
    for k in (-1, 1):
        f = lock_f_k(k); c = tilt([k * 0.226, -0.060, 0.700])
        th = np.radians([0, 25, 50, 75, 100, 125, 150, 180])
        rows = star_rows(f, c, [k, 0, 0], tiltv([0, 0, 1]), th, 12, 0.4)
        V, F = rows_mesh(rows)
        out.append(Piece(f'lock{k}', V, F, sdf=f, paint=keyed('hair')))
    return out

def ear_f_k(k): return lambda p: sd_ell(untilt(p), (k * EAR_C[0], EAR_C[1], EAR_C[2]), (0.034, 0.025, 0.043))
def build_ear(k):
    f = ear_f_k(k); c = tilt([k * EAR_C[0], EAR_C[1], EAR_C[2]])
    rows = star_rows(f, c, [k, 0, 0], [0, 0, 1], np.radians([0, 45, 90, 135, 180]), 10, 0.2)
    V, F = rows_mesh(rows)
    return Piece(f'ear{k}', V, F, sdf=f, paint=keyed('skin'))

# =========================================================================================== the kasa + the snow heap
HAT_TOP = [(0.0, 0.082), (0.060, 0.066), (0.130, 0.040), (0.185, 0.016)]
HAT_RIM = [(0.199, 0.007), (0.203, -0.001), (0.195, -0.007)]
HAT_UNDER = [(0.165, -0.004), (0.090, 0.018), (0.0, 0.030)]
HAT_PROF = HAT_TOP + HAT_RIM + HAT_UNDER
HAT_TILT, HAT_ROLL = -0.26, 0.38            # tipped back ~21 deg (the front lifts, the eyes stay clear), +X side down ~17 deg
HAT_XY = np.array([0.065, 0.050])
def hat_Rh(): return RyB(HAT_ROLL) @ RxB(HAT_TILT)       # in the head frame
def hat_R(): return RT @ hat_Rh()
def _interp(pts, r):
    pts = sorted(pts); return np.interp(r, [p[0] for p in pts], [p[1] for p in pts])
def hat_origin():
    """seat the hat: the bob's crown tucked 1.2 cm into the shell's underside"""
    R = hat_Rh()
    th = np.radians(np.linspace(0, 78, 16)); ph = np.linspace(0, 2 * PI, 48, endpoint=False)
    D = np.array([[math.sin(t) * math.cos(p), math.sin(t) * math.sin(p), math.cos(t)] for t in th for p in ph])
    S = ray_exit(hair_full0, np.array([0, 0.03, 0.74]), D, 0.6)
    under = HAT_RIM[1:] + HAT_UNDER
    def worst(z0):
        o = np.array([HAT_XY[0], HAT_XY[1], z0]); q = (S - o) @ R
        r = np.hypot(q[:, 0], q[:, 1]); m = r < 0.196
        return (q[m, 2] - _interp(under, r[m])).max()
    lo, hi = 0.7, 1.2
    for _ in range(40):
        mid = .5 * (lo + hi)
        if worst(mid) > HAT_SINK: lo = mid
        else: hi = mid
    return tilt(np.array([HAT_XY[0], HAT_XY[1], hi]))
HAT_SINK = 0.014                            # the crown sits 2.6 cm up into the hat's hollow underside
HAT_O = hat_origin()
def hat_world(q): return np.asarray(q, float) @ hat_R().T + HAT_O
def build_hat():
    V, F, A = lathe(HAT_PROF, 20)
    V = hat_world(V)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'hat', dtype=object); o[Ac[:, 3] > 5.0] = 'strawdk'; return o
    return Piece('hat', V, F, A=A, paint=paint)

HEAPS = {'small': [(0.000, 0.015, 0.064), (0.080, -0.035, 0.054), (-0.066, 0.046, 0.036)],
         'big':   [(0.000, 0.012, 0.076), (0.088, -0.040, 0.062), (-0.074, 0.048, 0.050), (0.030, 0.092, 0.042)]}
def build_heap(v):
    out = []
    for i, (x, y, r) in enumerate(HEAPS[v.get('heap', 'small')]):
        c = hat_world([x, y, _interp(HAT_TOP, math.hypot(x, y)) + 0.68 * r])
        f = (lambda c_, r_: (lambda p: sd_sph(p, c_, r_)))(c, r)
        rows = star_rows(f, c, [0, 0, 1], [0, -1, 0], np.radians([0, 34, 66, 98, 135, 180]), 10, 0.2)
        V, F = rows_mesh(rows)
        out.append(Piece(f'snow{i}', V, F, sdf=f, paint=keyed('snow')))
    return out

def build_flower():
    """camellia: five round petals and a yellow centre tucked on the +X front of the brim, a leaf behind"""
    x, y = 0.105, -0.150; r = math.hypot(x, y)
    c = hat_world([x, y, _interp(HAT_TOP, r) + 0.018])
    R = hat_R(); radial = R @ nrm([x, y, 0]); up = R @ np.array([0, 0, 1.0])
    n = nrm(up * 0.45 + radial * 0.25 + np.array([0.15, -0.75, 0.35]))     # (faces the front / the game camera)
    t0 = nrm(np.cross(n, [0, 0, 1.0])); t1 = np.cross(n, t0)
    def f(p):
        d = sd_sph(p, c + n * 0.008, 0.021)
        for i in range(5):
            a = 2 * PI * i / 5 + 0.4; dr = math.cos(a) * t0 + math.sin(a) * t1; sd = np.cross(n, dr)
            d = smin(d, sd_ell(p, c + dr * 0.035, (0.037, 0.030, 0.0140), np.stack([dr, sd, n], 1)), 0.009)
        return d
    rows = star_rows(f, c + n * 0.002, n, t0, np.radians([0, 35, 70, 100, 140, 180]), 15, 0.25)
    V, F = rows_mesh(rows)
    fl = Piece('flower', V, F, sdf=f, fields={'c': lambda P: L(P[:, :3] - (c + n * 0.008)) - 0.0225},
               paint=lambda ins, Ac: np.where(ins['c'], 'petalc', 'petal').astype(object))
    dl = nrm(radial * 0.6 + up * 0.15 + np.array([0, 0.75, 0]))         # the leaf points back-out along the brim
    lc = c + dl * 0.066 - n * 0.006
    sdl = nrm(np.cross(n, dl))
    g = lambda p: sd_ell(p, lc, (0.048, 0.025, 0.0125), np.stack([dl, sdl, nrm(np.cross(dl, sdl))], 1))
    rows = star_rows(g, lc, nrm(np.cross(dl, sdl)), dl, np.radians([0, 50, 90, 130, 180]), 8, 0.2)
    V, F = rows_mesh(rows)
    return [fl, Piece('leaf', V, F, sdf=g, paint=keyed('leaf'))]

# =========================================================================================== the mino (three straw tiers)
U_TOOTH = np.array([0.0, 0.34, 0.5, 0.66])  # 0 = the notch (high), 0.5 = the rounded tip (low)
# name, teeth, phase, top pole z, upper rings (rx, ry, z), hem (rx, ry, notch z, lift), inner pole z, ao of the upper rings
TIERS = [('mino1', 12, 0.0, 0.538, [(0.150, 0.140, 0.500), (0.198, 0.186, 0.452), (0.212, 0.199, 0.400)], (0.224, 0.210, 0.360, 0.044), 0.45, 1.0),
         ('mino2', 14, 0.5, 0.430, [(0.170, 0.160, 0.412), (0.245, 0.228, 0.292)], (0.282, 0.262, 0.225, 0.046), 0.31, 0.86),
         ('mino3', 16, 0.0, 0.300, [(0.230, 0.214, 0.282), (0.287, 0.266, 0.172)], (0.306, 0.285, 0.142, 0.048), 0.21, 0.86)]
def ring_at(rx, ry, z, ph):
    return np.stack([rx * np.sin(ph), -ry * np.cos(ph), np.broadcast_to(z, ph.shape)], -1)
def tier_profile(T):
    """(z, rx, ry) from the top down, for the analytic envelope"""
    _, nt, phase, ztop, ups, (rx, ry, zN, lift), zin, _ao = T
    pr = [(ztop, 0.0, 0.0)] + [(z, a, b) for a, b, z in ups] + [(zN + 0.028 - lift * 0.5, rx, ry), (zN - lift * 0.5, rx * 0.975, ry * 0.975)]
    return pr
def tier_env(T):
    pr = tier_profile(T)[::-1]; zs = [p[0] for p in pr]; ra = [p[1] for p in pr]; rb = [p[2] for p in pr]
    zN = T[5][2]
    def inside(P):
        z = P[:, 2]; a = np.interp(z, zs, ra); b = np.interp(z, zs, rb)
        rho = np.hypot(P[:, 0] / np.maximum(a, 1e-3), P[:, 1] / np.maximum(b, 1e-3))
        return np.minimum.reduce([(1 - rho) * a, z - (zN + 0.01), T[3] - z])
    return inside
def frost_field(P):
    ph = np.arctan2(P[:, 0], -P[:, 1])
    f = np.minimum(ell2(P[:, 0] - 0.150, P[:, 1] + 0.005, 0.110, 0.150), ell2(P[:, 0] + 0.150, P[:, 1] + 0.005, 0.110, 0.150))
    return np.maximum(f + 0.010 * np.sin(9 * ph), 0.395 + 0.012 * np.sin(6 * ph + 0.5) - P[:, 2])      # two soft caps of snow on the shoulders
def build_tier(T, v):
    name, nt, phase, ztop, ups, (rx, ry, zN, lift), zin, ao_up = T
    t = np.repeat(np.arange(nt), 4); u = np.tile(U_TOOTH, nt)
    ph = 2 * PI * (t + u + phase) / nt
    tooth = np.sin(PI * u) ** 1.3
    hz = zN - lift * tooth
    rid = np.ones_like(tooth)                    # (round 2: no pinch at the notches: the tier above's ink showed through as dark Vs)
    rows = [np.array([[0.0, 0.0, ztop]])]; att = [np.array([[0.0, 0.0]])]
    for i, (a, b, z) in enumerate(ups):
        rows.append(ring_at(a, b, z, ph[0::2])); att.append(np.stack([np.full(2 * nt, 1.0 + i), tooth[0::2]], -1))
    iu = len(ups)
    rows.append(np.stack([rx * rid * np.sin(ph), -ry * rid * np.cos(ph), hz + 0.028], -1)); att.append(np.stack([np.full(4 * nt, iu + 1.0), tooth], -1))
    rows.append(np.stack([0.975 * rx * rid * np.sin(ph), -0.975 * ry * rid * np.cos(ph), hz], -1)); att.append(np.stack([np.full(4 * nt, iu + 2.0), tooth], -1))
    rows.append(np.array([[0.0, 0.0, zin]])); att.append(np.array([[iu + 3.0, 0.0]]))
    V, F = rings_mesh(rows); A = np.concatenate(att)
    fields = {'frost': frost_field} if (v.get('frost') and name == 'mino1') else {}
    lip = iu + 1.0
    def paint(ins, Ac):
        r = Ac[:, 3]; o = np.full(len(Ac), 'straw', dtype=object)
        o[r > lip + 1.0] = 'inside'
        if 'frost' in ins: o[ins['frost'] & (r < lip + 1.0)] = 'frost'
        return o
    pc = Piece(name, V, F, A=A, fields=fields, paint=paint, refine=())
    pc.ao = lambda Ax: np.where(Ax[:, 3] <= len(ups) + 0.01, ao_up, 1.0)
    pc.inside = tier_env(T)
    return pc

# =========================================================================================== scarf, boots
SC_C = np.array([0.0, -0.012, 0.517]); SC_R = (0.148, 0.138)
def build_scarf():
    n = 14; t = 2 * PI * np.arange(n) / n
    C = np.stack([SC_R[0] * np.cos(t), SC_C[1] + SC_R[1] * np.sin(t), SC_C[2] + 0.008 * np.sin(t)], -1)
    V, F, A = loop_tube(C, 5, lambda i: (0.045, 0.040), expo=2.4)
    return Piece('scarf', V, F, A=A, paint=keyed('scarf'))
def tier1_front_y(x, z):
    pr = tier_profile(TIERS[0])[::-1]; zs = [p[0] for p in pr]
    a = np.interp(z, zs, [p[1] for p in pr]); b = np.interp(z, zs, [p[2] for p in pr])
    return -b * math.sqrt(max(0.0, 1 - (x / a) ** 2))
def build_tail():
    pts = []
    for x, z in ((0.078, 0.505), (0.086, 0.430), (0.094, 0.350)):
        pts.append(np.array([x, tier1_front_y(x, z) - 0.026, z]))
    V, F, A, _ = sweep(pts, 4, 8, lambda s: (0.021, 0.045 + 0.006 * s), [1, 0, 0], expo=2.8, caps=(False, True),
                       cap_rings=1, capk=(1.0, 0.55))
    return Piece('tail', V, F, A=A, paint=keyed('scarf'), orient=seg_orient(pts[0], pts[-1]), occluder=False)

def boot_f_k(k):
    c = np.array([k * 0.105, -0.035, 0.056]); R = rotz(-k * 0.15)
    return (lambda p: superq((np.asarray(p) - c) @ R, (0, 0, 0), (0.066, 0.088, 0.056), 2.6, 2.6)), c
def build_boot(k):
    f, c = boot_f_k(k)
    rows = star_rows(f, c, [0, 0, 1], [0, -1, 0], np.radians([0, 45, 80, 110, 145, 180]), 10, 0.3)
    V, F = rows_mesh(rows); V[:, 2] = np.maximum(V[:, 2], 0.0)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'boot', dtype=object); o[ins['sole']] = 'sole'; return o
    return Piece(f'boot{k}', V, F, nsdf=f, fields={'sole': lambda P: P[:, 2] - 0.013}, paint=paint)

def build_body_items(v):
    P = [build_head(), build_ear(-1), build_ear(1)] + build_hair(v) + [build_hat()] + build_heap(v)
    if v.get('flower'): P += build_flower()
    P += [build_tier(T, v) for T in TIERS] + [build_scarf(), build_tail(), build_boot(-1), build_boot(1)]
    items = [process(p) for p in P]
    cull_buried(items, CULL)
    return items

# =========================================================================================== arms + snowballs
PIV = {k: np.array([k * 0.170, -0.060, 0.470]) for k in (-1, 1)}
SIG = 0.70                                   # the outward splay baked into the hanging arm (the game adds 0.12 at rest)
def arm_frame(k):
    d = np.array([k * math.sin(SIG), 0.0, -math.cos(SIG)])            # down the arm
    s = np.array([k * math.cos(SIG), 0.0, math.sin(SIG)])              # outward, across the arm
    t = np.array([0.0, -1.0, 0.0])                                      # forward
    return d, s, t
def mitten_c(k): d, s, t = arm_frame(k); return PIV[k] + d * 0.262
def thumb_dir(k): return nrm(np.array([-k * 0.55, -0.62, 0.30]))
def mitten_f_k(k):
    d, s, t = arm_frame(k); mc = mitten_c(k); R = np.stack([s, t, d], 1); td = thumb_dir(k)
    return lambda p: smin(sd_ell(p, mc, (0.070, 0.062, 0.080), R), sd_cap(p, mc + td * 0.030, mc + td * 0.064, 0.027), 0.018)
def ball_c(k):
    d, s, t = arm_frame(k); w = nrm(d * 0.75 + t * 0.85)
    return mitten_c(k) + w * 0.064
BALL_R = 0.080
def build_arm_items(k, v):
    d, s, t = arm_frame(k); P0 = PIV[k]
    P1 = P0 + d * 0.172
    def fs(p):                                  # a tapered sleeve: 6 cm at the shoulder ball, 5 cm inside the cuff
        ba = P1 - P0; h = np.clip(((p - P0) @ ba) / (ba @ ba), 0, 1)
        return L(p - P0 - h[..., None] * ba) - (0.060 - 0.009 * h)
    rows = star_rows(fs, .5 * (P0 + P1), d, s, np.radians([0, 35, 70, 110, 145, 180]), 10, 0.3)
    V, F = rows_mesh(rows)
    fields = {}
    if v.get('frost'):
        fields['frost'] = lambda P: (P0[2] - 0.022 + 0.008 * np.sin(7 * np.arctan2(P[:, 1] - P0[1], P[:, 0] - P0[0]))) - P[:, 2]
    def spaint(ins, Ac):
        o = np.full(len(Ac), 'straw', dtype=object)
        if 'frost' in ins: o[ins['frost']] = 'frost'
        return o
    sleeve = Piece('sleeve', V, F, sdf=fs, fields=fields, paint=spaint, refine=())
    cc = P0 + d * 0.174; Rc = np.stack([s, t, d], 1)
    fc = lambda p: superq_R(p, cc, (0.075, 0.075, 0.032), Rc, 2.0, 2.6)
    rows = star_rows(fc, cc, d, s, np.radians([0, 40, 72, 108, 140, 180]), 12, 0.3)
    V, F = rows_mesh(rows)
    cuff = Piece('cuff', V, F, sdf=fc, paint=keyed('cuff'))
    fm = mitten_f_k(k); mc = mitten_c(k)
    rows = star_rows(fm, mc, d, s, np.radians([0, 30, 60, 90, 120, 150, 180]), 12, 0.3, lenses=[(thumb_dir(k), 0.7, 0.6)])
    V, F = rows_mesh(rows)
    mit = Piece('mitten', V, F, sdf=fm, paint=keyed('mitten'))
    items = [process(p) for p in (sleeve, cuff, mit)]
    cull_buried(items, CULL)
    return items
def build_ball_items(k):
    c = ball_c(k)
    f = lambda p: L(p - c) - BALL_R * (1 + 0.035 * np.sin(17 * (p[..., 0] - c[0]) + 11 * (p[..., 2] - c[2])) * np.cos(13 * (p[..., 1] - c[1])))
    rows = star_rows(f, c, [0, 0, 1], [0, -1, 0], np.radians([0, 36, 72, 108, 144, 180]), 10, 0.2)
    V, F = rows_mesh(rows)
    return [process(Piece('ball', V, F, sdf=f, paint=keyed('snow')))]

# =========================================================================================== palettes (sRGB hex)
COMMON = {
    'skin': '#fff0d5', 'skin_sh': '#f4d2b8', 'eye': '#2a2230', 'iristop': '#2a2230', 'iris': '#4a2e28', 'eyewhite': '#fff6ea',
    'catch': '#ffffff', 'blush': '#ef9298', 'nose': '#f08a7c', 'mouth': '#4a2a2c', 'brow': '#9a6656', 'cuff': '#fff6ea',
    'cuff_sh': '#e4dee6', 'snow': '#f4f6fb', 'snow_sh': '#d6e0f0', 'frost': '#f4f6fb', 'sole': '#4a2e22',
    'petal': '#e8283a', 'petalc': '#ffd84a', 'leaf': '#4a9a3a',
}
# (hair and boots: the sheet's rendered colours, which are lighter than the brief's swatches; see report.md)
VARIANTS = {
    'base':      dict(straw='#d8b262', strawdk='#9a7434', strawlt='#f0d890', inside='#6a4c26', hair='#4a303a',
                      mitten='#e8403c', scarf='#e8403c', boot='#80553a'),
    'snowdrift': dict(straw='#cdb888', strawdk='#8c7a5a', strawlt='#ece0c0', inside='#5a4a36', hair='#4a3a36',
                      hairhi='#8a7a9a', mitten='#ff6a98', scarf='#4a86e8', boot='#7c6048', frost=True, heap='big'),
    'camellia':  dict(straw='#c89a52', strawdk='#86602c', strawlt='#e8c880', inside='#5a3e22', hair='#2e2c3e',
                      mitten='#d8303a', scarf='#8a4ab8', boot='#7a5030', flower=True),
}
def palette(v):
    pal = dict(COMMON); pal.update({k: x for k, x in v.items() if isinstance(x, str)})
    pal['hat'] = lighten(pal['straw'], 0.06)
    pal['hair_sh'] = mulhex(pal['hair'], 0.80)
    pal['mitten_sh'] = mulhex(pal['mitten'], 0.84)
    pal['scarf_sh'] = mulhex(pal['scarf'], 0.86)
    pal['boot_sh'] = mulhex(pal['boot'], 0.80)
    pal.setdefault('hairhi', pal['hair'])
    return pal

# =========================================================================================== checks
def arm_checks(arm_items, body_items):
    """penetration (m) of the mitten / cuff / sleeve into the body (mino envelopes, bob, head, scarf) at the game's poses"""
    occ = [it for it in body_items if it.get('inside') is not None and it['name'] not in ('hat',)]
    res = {}
    POSES = {'rest': (-0.4, 0.12), 'wind/throw (-2.55, 0.27)': (-2.55, 0.27), 'throw whip (-0.60, 0.27)': (-0.60, 0.27),
             'hop peak (-1.70, 0.62)': (-1.70, 0.62), 'hop mid (-1.05, 0.37)': (-1.05, 0.37),
             'scoop down (+0.88, 0.42)': (0.88, 0.42), 'walk (0.0, 0.12)': (0.0, 0.12), 'walk fwd (-0.8, 0.12)': (-0.8, 0.12), 'zero (0, 0)': (0.0, 0.0)}
    for k in (-1, 1):
        for name, (rx, sp) in POSES.items():
            R = game_arm_R(k, rx, sp)
            for it in arm_items[k]:
                if it['name'] == 'sleeve': continue           # (the shoulder ball / sleeve root is meant to sit in the mino)
                Q = (it['P'] - PIV[k]) @ R.T + PIV[k]
                worst, who = 0.0, ''
                for oc in occ:
                    dpt = float(oc['inside'](Q).max())
                    if dpt > worst: worst, who = dpt, oc['name']
                res[f'arm{k:+d} {name} {it["name"]}'] = (round(worst * 100, 1), who)
            Bc = (ball_c(k) - PIV[k]) @ R.T + PIV[k]
            res[f'arm{k:+d} {name} ball centre'] = [round(float(x), 3) for x in Bc]
    return res

# =========================================================================================== assemble
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
    body = build_body_items(v)
    face = build_face_items(v)
    arms = {k: build_arm_items(k, v) for k in (-1, 1)}
    balls = {k: build_ball_items(k) for k in (-1, 1)}
    obs = [make_object('body', body, pal, np.zeros(3)), make_object('face', face, pal, np.zeros(3)),
           make_object('armR', arms[1], pal, PIV[1]), make_object('armL', arms[-1], pal, PIV[-1]),
           make_object('ballR', balls[1], pal, ball_c(1)), make_object('ballL', balls[-1], pal, ball_c(-1))]
    stats = {ob.name: dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location]) for ob in obs}
    stats['pieces'] = {it['name']: len(it['T']) for its in (body, face, arms[1], balls[1]) for it in its}
    stats['total'] = sum(len(ob.data.polygons) for ob in obs)
    allP = np.concatenate([it['P'] for it in body])
    stats['bounds'] = dict(lo=[round(float(x), 3) for x in allP.min(0)], hi=[round(float(x), 3) for x in allP.max(0)])
    stats['hat_origin'] = [round(float(x), 4) for x in HAT_O]
    if vname == 'base':
        stats['arm_checks'] = arm_checks(arms, body)
    fn = 'yukiwarashi' + ('' if vname == 'base' else '_' + vname)
    if vname == 'base':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'yukiwarashi.blend'))
    export(fn)
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
