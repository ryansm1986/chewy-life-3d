"""Kamaitachi (Whispering Bamboo Grove, enemy series EN-1) -- deterministic build, Option A "Wind Ronin".

Blender 4.3:
  blender --background --factory-startup --python build_kamaitachi.py [-- --variant base|yuki|storm|all]

Builds every variant from an empty scene, saves kamaitachi.blend (the base) and exports
public/models/kamaitachi.glb, kamaitachi_yuki.glb, kamaitachi_storm.glb.
Units: metres, front = -Y, ground z = 0, character left = +X.

Enemy contract (tools/blender/work/codex/enemy-model-contract.md):
  two rigid parts, no rig, no UVs, no textures; one face-corner colour attribute `Col`; one material `toon`.
  body : origin (0, 0, 0)      head, body, legs, paws, wraps, sickles, grips, scarf (ring, knot, two tails)
  tail : origin TAIL_PIVOT     the S tail, its brush tufts (+ the Storm tail blade)

Technique
- Head, body, paws, ears and nose are implicit surfaces (smooth unions of ellipsoids), sampled as star-shaped
  grids (rays from a centre or from a spine, root-found onto the surface): every vertex lies on a smooth surface.
- Legs, sickles, grips, scarf and tail are parametric sweeps (rotation-minimising frames, superellipse sections,
  round caps).
- Colour borders are cut into the mesh as level-set contours of 2D/3D feature fields (eyes, lashes, brows, blush,
  mouth, the cream face patch, the belly...): each crossing edge is split at the root, the new vertex is projected
  back onto the implicit surface and the faces are split along it. Small features first get a local 1->4 refinement
  near their contour, and vertices close to a contour are snapped onto it (no slivers). So every colour border
  runs along an edge loop and the face-corner colours are crisp.
- Normals of the implicit parts are the exact surface gradients (custom normals): no faceting at the cuts.
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector

TASK_DIR = 'D:/projects/chewy-life-3d/tools/blender/work/codex/kamaitachi'
MODELS = 'D:/projects/chewy-life-3d/public/models'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default
WANT = arg('--variant', 'all')
PI = math.pi

# =========================================================================================== palettes (sRGB hex)
COMMON = {
    'eye': '#2f2834', 'eyewhite': '#fff6ea', 'iris': '#a66c32', 'iristop': '#3a2418', 'irismid': '#6a4224', 'catch': '#ffffff', 'blush': '#e89191',
    'earin': '#e89191', 'nose': '#2f2834', 'nosehi': '#5e5468', 'grip': '#8a5a34', 'wrap': '#fff4e2',
    'wrapline': '#e8dcc6',
}
VARIANTS = {
    'base':  dict(fur='#e0a45c', belly='#fff4e2', paw='#8a5a34', tip='#8a5a34', scarf='#5ab87a', blade='#d6e2f0', edge='#f2f6fb'),
    # (the brief's Yuki belly is #ffffff; the contract keeps whites near #fff6ea so bloom never glares: #fbf9f4)
    'yuki':  dict(fur='#f2f0ec', belly='#fbf9f4', paw='#2e2834', tip='#2e2834', scarf='#6aa8e8', blade='#d0e8ff', edge='#eef6ff'),
    'storm': dict(fur='#8c7aa6', belly='#ece4f6', paw='#3a2a4a', tip='#3a2a4a', scarf='#e8503a', blade='#ffd870', edge='#fff2c4',
                  bolt='#e8902c', tailblade=True),
}

def srgb_lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

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

def sweep(ctrl, nr, nseg, prof, side, expo=2.0, twist=None, caps=(True, True), cap_rings=3, phase=0.0, dense=None, rmod=None):
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
        rn, rb = prof(s[i]); rc = min(rn, rb) * 0.95; out_r, out_a = [], []
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
    return dict(P=P, N=Nv, T=tris, keys=np.asarray(keys), part=pc.part, name=pc.name, occ=pc.occluder)

# =========================================================================================== the design
HC = np.array([0.0, -0.265, 0.545])          # head (skull) centre
TAIL_PIVOT = np.array([0.0, 0.42, 0.262])    # tail root, buried ~4 cm in the rump

# ----------------------------------------------------------------------- head
def head_base(p):
    d = sd_ell(p, HC, (0.208, 0.178, 0.178))
    d = smin(d, sd_ell(p, (0.0, -0.352, 0.468), (0.15, 0.105, 0.08)), 0.06)              # jaw / chin mass
    for k in (-1, 1):
        d = smin(d, sd_ell(p, (k * 0.13, -0.338, 0.488), (0.10, 0.09, 0.082)), 0.06)     # cheeks
        d = smin(d, sd_ell(p, (k * 0.178, -0.318, 0.462), (0.058, 0.06, 0.05)), 0.045)   # cheek puff, low
        d = smin(d, sd_ell(p, (k * 0.182, -0.288, 0.515), (0.052, 0.058, 0.048)), 0.045) # cheek puff, high
    d = smin(d, sd_ell(p, (0.0, -0.418, 0.472), (0.07, 0.07, 0.056)), 0.045)              # snout
    for c in ((0.022, -0.29, 0.69), (-0.024, -0.262, 0.688)):
        d = smin(d, sd_ell(p, c, (0.05, 0.05, 0.035)), 0.04)                               # soft crown tuft
    return d

EYE_X, EYE_Z = 0.112, 0.497
EYES = {}
for k in (-1, 1):
    pe = hit_front(head_base, k * EYE_X, EYE_Z)
    n = unit_normals(head_base, pe[None])[0]
    A_ = nrm(n * 0.85 + np.array([0, -1, 0]) * 0.15)          # (the eye looks a touch more forward than the normal)
    U_ = nrm(np.cross([0, 0, 1], A_)); V_ = np.cross(A_, U_)
    EYES[k] = (pe, A_, U_, V_)
EX, EY = 0.047, 0.052                                          # eye opening half-sizes (eye plane)

def head_sdf(p):
    d = head_base(p)
    for k in (-1, 1):
        pe, A_, U_, V_ = EYES[k]
        R = np.stack([U_, V_, A_], 1)
        d = smin(d, sd_ell(p, pe - A_ * 0.016, (EX * 1.02, EY * 1.02, 0.021), R), 0.012)  # domed eye lens
    return d

def eye_uvw(P, k):
    pe, A_, U_, V_ = EYES[k]; d = P[:, :3] - pe
    return d @ U_, d @ V_, d @ A_

IRIS = dict(du=0.0, dv=0.0045, ru=0.0495, rv=0.0505)
def iris_c(k): return IRIS['du'], IRIS['dv']
# 2D eye shapes in the eye plane (u = screen right, v = up; uo = k*u = outward), negative inside. Symmetric and level.
def eye_dark2(u, v, k):
    """the dark eye shape: a thin rim, the thick upper lash line and its upward flick at the outer corner"""
    uo = k * u
    rim = ell2(u, v, EX + 0.0050, EY + 0.0050)
    lash = np.maximum(ell2(u, v - 0.0085, EX + 0.0068, EY + 0.0135), -(v + 0.012))
    flick = stroke(uo, v, [(EX - 0.002, 0.024), (EX + 0.011, 0.033), (EX + 0.020, 0.044)], 0.0052, 0.0080)
    return smin(smin(rim, lash, 0.004), flick, 0.004)
def eye_open2(u, v, k): return ell2(u, v, EX, EY)
def eye_iris2(u, v, k):
    cu, cv = iris_c(k); return ell2(u - cu, v - cv, IRIS['ru'], IRIS['rv'])
def exit2(f, c, ang, k, tmax=0.12):
    d = np.stack([np.cos(ang), np.sin(ang)], -1); lo = np.zeros(len(ang)); hi = np.full(len(ang), tmax)
    assert (f(c[0] + d[:, 0] * tmax, c[1] + d[:, 1] * tmax, k) > 0).all()
    for _ in range(40):
        m = .5 * (lo + hi); ins = f(c[0] + d[:, 0] * m, c[1] + d[:, 1] * m, k) < 0
        lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return .5 * (lo + hi)

def on_head(pe, A_, U_, V_, u, v, off):
    """eye-plane points -> onto the head surface (+ off along its normal)"""
    P = pe + u[:, None] * U_ + v[:, None] * V_
    P = project(head_sdf, P, 4); n = unit_normals(head_sdf, P)
    return P + n * off
def head_up(P): return unit_normals(head_sdf, P[:, :3])

# Face features are DECALS: open shells lying on the head (a few mm proud), their rim sloping gently under the skin.
# The game's ink is an inverted hull pushed 2.1 cm along the normals: an open cap pushed out stays front-facing and
# is culled, so the features get crisp borders without ink rings floating round them (a closed shell would show its
# pushed-out back as a dark blob).
SKIRT = (0.0045, -0.0022)     # the rim skirt: this far beyond the shape, this deep under the surface

PUPIL_R = 0.0175
def build_eye(k):
    """the eye: a lens decal on a polar grid centred on the iris. Rings fall exactly on the pupil, iris and opening
    borders (the white is only a thin sliver along the lower edge); the iris shading bands and catchlights are cut"""
    pe, A_, U_, V_ = EYES[k]; cu, cv = iris_c(k); c2 = np.array([cu, cv])
    nseg = 16; ang = 2 * PI * (np.arange(nseg) + 0.5) / nseg
    r_dark = exit2(eye_dark2, c2, ang, k); r_open = np.minimum(exit2(eye_open2, c2, ang, k), r_dark - 0.004)
    r_iris_true = exit2(eye_iris2, c2, ang, k)
    white = r_open - r_iris_true > 0.002                   # the white sliver's angular range (the lower edge)
    r_iris = np.where(white, r_iris_true, r_open - 0.0015)
    rows, att = [], []
    def row(rad, off, band, w):
        u = c2[0] + rad * np.cos(ang); v = c2[1] + rad * np.sin(ang)
        rows.append(on_head(pe, A_, U_, V_, u, v, off))
        att.append(np.stack([np.full(nseg, band), np.asarray(w, float) * np.ones(nseg), u, v], -1))
    rows.append(on_head(pe, A_, U_, V_, np.array([c2[0]]), np.array([c2[1]]), 0.0016)); att.append(np.array([[0.0, 0.0, c2[0], c2[1]]]))
    row(np.full(nseg, PUPIL_R), 0.0016, 0.5, 0)
    row(PUPIL_R + (r_iris - PUPIL_R) * 0.55, 0.0016, 1, 0)
    row(r_iris, 0.0016, 2, white)
    row(r_open, 0.0016, 3, white)
    row(r_dark, 0.0016, 4, 0)
    row(r_dark + SKIRT[0], SKIRT[1], 5, 0)
    V, F = rows_mesh(rows)
    A = np.concatenate(att)
    def f_low(P):      # the warm lower third (a soft smile-shaped border)
        u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (-0.014 + 2.6 * u * u)
    def f_mid(P):
        u, v = P[:, 5] - cu, P[:, 6] - cv; return v - (-0.004 + 2.2 * u * u)
    def f_cl(P):       # big catchlight upper-left, small lower-right (screen)
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu + 0.0155, v - cv - 0.0185) - 0.0145
    def f_cs(P):
        u, v = P[:, 5], P[:, 6]; return np.hypot(u - cu - 0.0185, v - cv + 0.0185) - 0.0078
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

def skin_key(P):
    """the head's own colour under a decal's skirt (so its sliver above the skin is invisible)"""
    o = np.full(len(P), 'fur', dtype=object)
    if len(P): o[f_cream(P) < 0] = 'belly'
    return o

def decal_strip(C, width, H, nrows, key, name, relief=True, ncol=7):
    """a brush stroke decal along the 3D surface curve C: half-width width(s), a soft ridge H high, tapered ends"""
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
    # rounded ends: a fan to a tip just past each end, under the skin
    for end, sign in ((0, -1), (nrows - 1, 1)):
        tip = Cr[end] + sign * T[end] * (width(s[end]) + SKIRT[0])
        tip = project(head_sdf, tip[None], 3)[0]; tip = tip + unit_normals(head_sdf, tip[None])[0] * SKIRT[1]
        ti = len(V); V = np.vstack([V, tip]); A = np.vstack([A, [[s[end], 0.0]]])
        base = end * nc
        F += [(base + j, base + j + 1, ti) for j in range(nc - 1)]
    def paint(ins, Ac):
        o = np.full(len(Ac), key, dtype=object); sk = np.abs(Ac[:, 4]) > 1.0001
        o[sk] = skin_key(Ac[sk, :3]); return o
    return Piece(name, V, F, A=A, paint=paint, nsdf=None if relief else head_sdf, orient=head_up)

def surface_curve(k, pts2, off=0.0):
    pe, A_, U_, V_ = EYES[k]; p = np.asarray(pts2, float)
    return on_head(pe, A_, U_, V_, k * p[:, 0], p[:, 1], off)
def build_brow(k):
    """an angry brow: a thick brush stroke, inner end low, raised a few mm (sculpted)"""
    C = surface_curve(k, [(-0.023, 0.080), (-0.006, 0.0925), (0.011, 0.105), (0.028, 0.1175)])
    return decal_strip(C, lambda s: 0.0085 + 0.0045 * math.sin(PI * s) ** 0.8, 0.0034, 6, 'eye', f'brow{k}', ncol=5)

NOSE_P = hit_front(head_base, 0.0, 0.488)
MOUTH = [(-0.033, 0.4695), (-0.025, 0.4625), (-0.015, 0.4585), (-0.006, 0.4615), (0.0, 0.4685),
         (0.006, 0.4615), (0.015, 0.4585), (0.025, 0.4625), (0.033, 0.4695)]
def build_mouth():
    C = np.array([hit_front(head_base, x, z) for x, z in MOUTH])
    return decal_strip(C, lambda s: 0.0034 + 0.0014 * math.sin(PI * s), 0.0012, 9, 'eye', 'mouth', relief=False, ncol=5)

def build_nose():
    """the nose: a soft rounded-triangle dome decal (1.1 cm high) on the snout, with a small highlight"""
    n0 = unit_normals(head_sdf, NOSE_P[None])[0]; U_ = nrm(np.cross([0, 0, 1], n0)); V_ = np.cross(n0, U_)
    nseg = 9; ang = 2 * PI * np.arange(nseg) / nseg
    R = 0.021 * (1 + 0.16 * np.sin(ang)) * (1 - 0.10 * np.cos(3 * ang + PI / 2) )   # wider on top: a soft triangle
    rows, att = [NOSE_P[None] + n0 * 0.0118], [np.array([[0.0, 0, 0]])]
    for x in (0.4, 0.72, 1.0, 1.0 + SKIRT[0] / 0.02):
        u = R * x * np.cos(ang); v = R * x * np.sin(ang) - 0.002
        P = project(head_sdf, NOSE_P + u[:, None] * U_ + v[:, None] * V_, 3); nn = unit_normals(head_sdf, P)
        h = SKIRT[1] if x > 1 else 0.0108 * (1 - x * x) ** 1.4 + 0.001
        rows.append(P + nn * h); att.append(np.stack([np.full(nseg, x), u, v], -1))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def f_hi(P):
        return ell2(P[:, 4] - 0.005, P[:, 5] - 0.007, 0.0065, 0.0042)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'nose', dtype=object); o[ins['hi']] = 'nosehi'
        sk = Ac[:, 3] > 1.0001; o[sk] = skin_key(Ac[sk, :3]); return o
    return Piece('nose', V, F, A=A, fields={'hi': f_hi}, paint=paint, orient=head_up)

CHEEK = {}
for k in (-1, 1):
    pc_ = hit_front(head_base, k * 0.162, 0.452)
    n = unit_normals(head_base, pc_[None])[0]; U_ = nrm(np.cross([0, 0, 1], n)); V_ = np.cross(n, U_)
    CHEEK[k] = (pc_, n, U_, V_)
def f_blush(k):
    def f(P):
        pc_, n, U_, V_ = CHEEK[k]; d = P[:, :3] - pc_
        return np.maximum(ell2(d @ U_, d @ V_, 0.034, 0.021), -(d @ n + 0.03))
    return f
def f_cream(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    zc = 0.480 - 0.30 * x * x + 0.0035 * np.sin(x * 70) + 0.012 * np.exp(-(x / 0.035) ** 2)
    return np.maximum(z - zc, y - (HC[1] + 0.04))

def head_paint(ins, Ac):
    out = np.full(len(Ac), 'fur', dtype=object)
    out[ins['cream']] = 'belly'
    return out

def build_head():
    th = np.radians([0, 8, 16, 25, 34, 44, 54, 64, 74, 84, 94, 105, 117, 130, 145, 162, 180])
    axis = nrm([0, -1, -0.10])
    sc = HC + np.array([0, -0.02, -0.03])
    rows = star_rows(head_sdf, sc, axis, [0, 0, 1], th, 42, 0.5)
    V, F = rows_mesh(rows)
    fields = {'cream': f_cream}
    return Piece('head', V, F, sdf=head_sdf, fields=fields, paint=head_paint)

def build_blush(k):
    pc_, n0, U_, V_ = CHEEK[k]
    nseg = 8; ang = 2 * PI * np.arange(nseg) / nseg
    rows, att = [project(head_sdf, pc_[None], 3) + n0 * 0.0012], [np.array([[0.0]])]
    for x, h in ((0.55, 0.0012), (1.0, 0.0012), (1.0 + SKIRT[0] / 0.022, SKIRT[1])):
        P = pc_ + (0.036 * x * np.cos(ang))[:, None] * U_ + (0.023 * x * np.sin(ang))[:, None] * V_
        P = project(head_sdf, P, 3); rows.append(P + unit_normals(head_sdf, P) * h); att.append(np.full((nseg, 1), x))
    V, F = rows_mesh(rows); A = np.concatenate(att)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'blush', dtype=object); sk = Ac[:, 3] > 1.0001
        q = skin_key(Ac[sk, :3]); q[q == 'blush'] = 'fur'; o[sk] = q; return o
    return Piece(f'blush{k}', V, F, A=A, paint=paint, nsdf=head_sdf, orient=head_up)

def build_ear(k):
    E = np.array([k * 0.180, -0.192, 0.668])
    F_ = nrm([k * 0.32, -1.0, 0.18])                                # the cup faces forward, a little out and up
    Yl = -F_; Xl = nrm(np.cross(Yl, [0, 0, 1])); Zl = np.cross(Xl, Yl)
    Rr = rot(Yl, k * 0.40); Xl = Rr @ Xl; Zl = Rr @ Zl              # (roll: the top tilts outward)
    R = np.stack([Xl, Yl, Zl], 1)
    def sdf(p):
        d = sd_ell(p, E, (0.082, 0.037, 0.082), R)
        dent = sd_ell(p, E + Yl * -0.049 + Zl * 0.004, (0.054, 0.028, 0.056), R)
        return smax(d, -dent, 0.012)
    th = np.radians([0, 30, 60, 90, 125, 180])
    rows = star_rows(sdf, E, -Yl, Zl, th, 9, 0.2)
    V, F = rows_mesh(rows)
    def f_pink(P):
        q = P[:, :3] - E; x, y, z = q @ Xl, q @ Yl, q @ Zl
        return np.maximum(ell2(x, z - 0.004, 0.051, 0.054), y - 0.004)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'fur', dtype=object); o[ins['pink']] = 'earin'; return o
    return Piece(f'ear{k}', V, F, sdf=sdf, fields={'pink': f_pink}, paint=paint)

# ----------------------------------------------------------------------- body
def body_sdf(p):
    d = sd_ell(p, (0, 0.12, 0.226), (0.132, 0.36, 0.136))                      # long torso
    d = smin(d, sd_ell(p, (0, -0.15, 0.305), (0.13, 0.135, 0.138)), 0.07)        # chest, rising to the neck
    d = smin(d, sd_ell(p, (0, -0.21, 0.39), (0.092, 0.088, 0.075)), 0.05)        # neck root (under the scarf)
    for k in (-1, 1):
        d = smin(d, sd_ell(p, (k * 0.064, 0.355, 0.222), (0.086, 0.122, 0.118)), 0.05)   # haunches
    return d
def f_belly(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    under = z - (0.158 + 0.012 * np.sin(y * 9))
    chest = np.maximum(ell2(x, z - 0.27, 0.078, 0.2), y + 0.12)
    return smin(under, chest, 0.03)
def body_paint(ins, Ac):
    o = np.full(len(Ac), 'fur', dtype=object); o[ins['belly']] = 'belly'; return o
def build_body():
    ys = np.linspace(-0.25, 0.465, 12)
    zs = np.interp(ys, [-0.26, -0.15, 0.0, 0.47], [0.33, 0.29, 0.235, 0.226])
    C = np.stack([np.zeros_like(ys), ys, zs], -1)
    T = np.gradient(C, axis=0); T /= L(T)[:, None]
    rows = []
    nseg = 12
    def ring_dirs(t):
        n = nrm(np.array([0, 0, 1.0]) - t[2] * t); b = np.cross(t, n)
        ph = 2 * PI * np.arange(nseg) / nseg
        return np.cos(ph)[:, None] * n + np.sin(ph)[:, None] * b
    # front cap (rays from the first spine point, tilted forward) ... rear cap
    for a in (90, 50):
        t = T[0]; D = ring_dirs(t) * math.cos(math.radians(a)) - t * math.sin(math.radians(a))
        rows.append(ray_exit(body_sdf, C[0], D[:1] if a == 90 else D, 0.5))
    for i in range(len(C)):
        rows.append(ray_exit(body_sdf, C[i], ring_dirs(T[i]), 0.5))
    for a in (50, 90):
        t = T[-1]; D = ring_dirs(t) * math.cos(math.radians(a)) + t * math.sin(math.radians(a))
        rows.append(ray_exit(body_sdf, C[-1], D[:1] if a == 90 else D, 0.5))
    V, F = rows_mesh(rows)
    return Piece('body', V, F, sdf=body_sdf, fields={'belly': f_belly}, paint=body_paint)

def build_paw(k, front):
    if front: c = np.array([k * 0.138, -0.300, 0.040]); r = (0.054, 0.066, 0.042); toe_y = -0.352; tr = 0.021
    else:     c = np.array([k * 0.114, 0.405, 0.036]); r = (0.049, 0.061, 0.038); toe_y = 0.360; tr = 0.019
    def sdf(p):
        d = sd_ell(p, c, r)
        for dx in (-0.029, 0.0, 0.029):
            d = smin(d, sd_sph(p, (c[0] + dx * (r[0] / 0.054), toe_y, 0.026), tr), 0.016)
        return smax(d, -p[:, 2], 0.012)       # flat sole on the ground
    th = np.radians([0, 36, 72, 108, 144, 180])
    rows = star_rows(sdf, c + np.array([0, -0.01, 0.0]), [0, -1, 0.0], [0, 0, 1], th, 7, 0.2)
    V, F = rows_mesh(rows)
    return Piece(f'paw{k}{"f" if front else "h"}', V, F, sdf=sdf, paint=lambda ins, Ac: np.full(len(Ac), 'paw', dtype=object))

def build_leg(k, front):
    if front:
        ctrl = [(k * 0.080, -0.165, 0.265), (k * 0.106, -0.215, 0.180), (k * 0.128, -0.268, 0.105), (k * 0.136, -0.292, 0.050)]
        def prof(s):
            r = float(np.interp(s, [0, 0.3, 1.0], [0.058, 0.046, 0.05]))
            if 0.37 < s < 0.51: r += 0.009                                                    # brown cuff
            if s > 0.55: r += 0.0075 * abs(math.sin((s - 0.5) / 0.5 * 2 * PI + 0.4)) ** 0.6   # wrap bands
            return r, r
        nr = 9
    else:
        ctrl = [(k * 0.074, 0.360, 0.225), (k * 0.098, 0.385, 0.140), (k * 0.112, 0.398, 0.060)]
        def prof(s):
            r = float(np.interp(s, [0, 0.5, 1.0], [0.064, 0.052, 0.046])); return r, r
        nr = 4
    V, F, A, info = sweep(ctrl, nr, 7, prof, [1, 0, 0], caps=(True, True), cap_rings=1)
    if front:
        def paint(ins, Ac):
            s = Ac[:, 3]; o = np.full(len(Ac), 'fur', dtype=object)
            o[(s > 0.37) & (s <= 0.51)] = 'grip'; o[s > 0.51] = 'wrap'; return o
    else:
        paint = lambda ins, Ac: np.full(len(Ac), 'fur', dtype=object)
    return Piece(f'leg{k}{"f" if front else "h"}', V, F, A=A, paint=paint)

# ----------------------------------------------------------------------- sickles
BL_R = 0.182                                                   # mid-line radius: ~0.36 m tip to tip
BL_SPAN = math.radians(78)                                     # half the arc (from the belly to each tip)
def blade_frame(k):
    """the crescent's plane faces up, out and a little forward (seen full from the 45 deg camera and the front);
    P1 runs front->back in the plane, P2 points out from the arc centre to the belly (the convex cutting edge)"""
    n = nrm([k * 0.56, -0.40, 0.72])
    P1 = nrm(np.array([0, 1.0, 0]) - n[1] * n)
    P2 = np.cross(n, P1); P2 = P2 if P2[0] * k > 0 else -P2
    Q = np.array([k * 0.196, -0.300, 0.118])                    # the concave inner edge rests against the paw here
    O = Q - (BL_R - 0.034) * P2                                 # arc centre
    return O, P1, P2, n
def build_blade(k):
    O, P1, P2, n = blade_frame(k)
    ang = np.linspace(-BL_SPAN, BL_SPAN, 9)
    ctrl = [O + BL_R * (math.sin(a) * P1 + math.cos(a) * P2) for a in ang]
    def prof(s):
        w = 0.0125 + 0.0225 * math.sin(PI * s) ** 0.8         # half-width in the crescent plane: 7 cm at the belly
        t = 0.0135 + 0.0020 * math.sin(PI * s)                 # half-thickness: ~3 cm
        return w, t
    V, F, A, info = sweep(ctrl, 8, 8, prof, n, expo=2.6, caps=(True, True), cap_rings=1, dense=200)
    Nm = info['N'][len(info['N']) // 2]; Cm = info['C'][len(info['C']) // 2]
    sgn = 1.0 if (Cm - O) @ Nm > 0 else -1.0                 # the outer (convex) edge: lighter
    def paint(ins, Ac):
        o = np.full(len(Ac), 'blade', dtype=object)
        o[sgn * Ac[:, 4] > 0.70] = 'edge'; return o
    return Piece(f'blade{k}', V, F, A=A, paint=paint, occluder=False)
def build_grip(k):
    O, P1, P2, n = blade_frame(k)
    inner = O + (BL_R - 0.02) * P2
    p0 = np.array([k * 0.140, inner[1] + 0.012, 0.085])         # held in the paw
    ctrl = [p0, .5 * (p0 + inner), inner]
    V, F, A, info = sweep(ctrl, 2, 5, lambda s: (0.0185, 0.0185), [0, 1, 0], caps=(True, True), cap_rings=1)
    return Piece(f'grip{k}', V, F, A=A, paint=lambda ins, Ac: np.full(len(Ac), 'grip', dtype=object), occluder=False)

# ----------------------------------------------------------------------- scarf
SC_C = np.array([0.0, -0.205, 0.392]); SC_AX = nrm([0, -0.42, 1.0])
def neck_sdf(p): return np.minimum(body_sdf(p), head_base(p))
def build_scarf_ring():
    n = 15
    X_ = np.array([1.0, 0, 0]); Y_ = np.cross(SC_AX, X_)            # Y_: points to the back-ish in the ring plane
    th = 2 * PI * np.arange(n) / n
    D = np.cos(th)[:, None] * X_ + np.sin(th)[:, None] * Y_
    front = np.clip(-np.sin(th), 0, 1) ** 2                         # (sin<0 -> the front: Y_ points back)
    pts = []
    for i in range(n):
        c = SC_C - np.array([0, 0, 0.034]) * front[i] + np.array([0, -0.006, 0]) * front[i]
        hit = ray_exit(neck_sdf, c, D[i:i + 1], 0.4)[0]
        pts.append(hit + D[i] * 0.016)
    pts = np.array(pts)
    # closed tube: rings around the loop, section = flat band (tall along the neck axis)
    nseg = 6; rows = []; att = []
    for i in range(n):
        t = nrm(pts[(i + 1) % n] - pts[i - 1]); out = nrm(D[i] - (D[i] @ t) * t); up = np.cross(t, out)
        if up @ SC_AX < 0: up = -up
        ph = 2 * PI * np.arange(nseg) / nseg
        hh = 0.042 + 0.014 * front[i]                                 # the front drape is taller
        ring = pts[i] + spow(np.cos(ph), 0.8)[:, None] * out * 0.025 + spow(np.sin(ph), 0.8)[:, None] * up * hh
        rows.append(ring); att.append(np.stack([np.full(nseg, i / n), np.cos(ph), np.sin(ph)], -1))
    V = np.concatenate(rows); F = []
    for i in range(n):
        a, b = i * nseg, ((i + 1) % n) * nseg
        F += [(a + j, a + (j + 1) % nseg, b + (j + 1) % nseg, b + j) for j in range(nseg)]
    return Piece('scarf_ring', V, F, A=np.concatenate(att), paint=lambda ins, Ac: np.full(len(Ac), 'scarf', dtype=object))
KNOT = np.array([0.012, -0.118, 0.452])
def build_knot():
    def sdf(p):
        return smin(sd_ell(p, KNOT, (0.056, 0.042, 0.040), rot([0, 1, 0], 0.4)),
                    sd_ell(p, KNOT + np.array([0.035, 0.012, -0.006]), (0.036, 0.034, 0.032)), 0.024)
    th = np.radians([0, 45, 90, 135, 180])
    rows = star_rows(sdf, KNOT, [0, 1, 0.3], [0, 0, 1], th, 7, 0.15)
    V, F = rows_mesh(rows)
    return Piece('knot', V, F, sdf=sdf, paint=lambda ins, Ac: np.full(len(Ac), 'scarf', dtype=object))
def build_scarf_tail(which):
    """a broad flat ribbon (10 cm wide, 2.8 cm thick, rounded ends) streaming back and up in a soft S-wave"""
    if which == 0:   # the upper ribbon
        ctrl = [KNOT + (0.012, 0.0, 0.004), (0.06, -0.06, 0.50), (0.11, 0.035, 0.575), (0.15, 0.145, 0.585),
                (0.185, 0.255, 0.630), (0.215, 0.355, 0.665)]
        wave = lambda s: 0.22 * math.sin(s * 2.0 * PI)
    else:            # the lower one, below it
        ctrl = [KNOT + (0.02, 0.0, -0.012), (0.08, -0.045, 0.438), (0.13, 0.065, 0.468), (0.17, 0.185, 0.452),
                (0.20, 0.305, 0.488), (0.228, 0.415, 0.522)]
        wave = lambda s: 0.22 * math.sin(s * 2.0 * PI + 1.2)
    def prof(s):
        w = 0.030 + 0.020 * min(1.0, s * 2.5)               # half-width: gathered at the knot, 10 cm after
        return 0.014, w                                     # half-thickness 1.4 cm (2.8 cm full)
    V, F, A, info = sweep(ctrl, 8, 6, prof, [0.72, 0, -0.69], expo=3.0, twist=wave, caps=(True, True), cap_rings=1, dense=200, phase=0.5)
    Nm = info['N'][len(info['N']) // 2]
    up = 1.0 if Nm[2] > 0 else -1.0                         # which side of N is the top face
    def paint(ins, Ac):
        o = np.full(len(Ac), 'scarf', dtype=object); o[up * Ac[:, 4] > 0.75] = 'scarfhi'; return o
    return Piece(f'scarf_tail{which}', V, F, A=A, paint=paint, occluder=False)

# ----------------------------------------------------------------------- tail (own part)
# Round 4: one continuous big fluffy fox/squirrel tail. From the rump it runs back, then curves up in a gentle J,
# leaning 0.1 m to +X so it peeks out beside the head from the front; it swells to ~0.30 m at 60-70 % of its length
# and tapers to a soft rounded point. The last third is the dark-brown tip, behind three big round scallops; near the
# tip three gentle lengthwise lobes ruffle the silhouette.
TAIL_CTRL = [(0.0, 0.392, 0.262), (0.01, 0.500, 0.236), (0.035, 0.605, 0.268), (0.062, 0.688, 0.368),
             (0.082, 0.748, 0.498), (0.094, 0.795, 0.640), (0.100, 0.850, 0.800)]
TAIL_PROF = ([0.0, 0.12, 0.30, 0.50, 0.65, 0.78, 0.88, 0.95, 1.0],
             [0.078, 0.088, 0.110, 0.138, 0.150, 0.142, 0.118, 0.085, 0.048])
TIP_S = 0.655          # the brown tip: the last ~34 %
def tail_rmod(s, ph):
    g = float(np.clip((s - 0.60) / 0.12, 0, 1)) * float(np.clip((1.02 - s) / 0.10, 0, 1))
    return 1.0 + 0.065 * g * np.cos(3 * ph + 0.4)
def build_tail():
    def prof(s):
        r = float(np.interp(s, *TAIL_PROF)); return r * 0.94, r     # (a touch flatter front-to-back)
    V, F, A, info = sweep(TAIL_CTRL, 17, 14, prof, [1, 0, 0], caps=(True, True), cap_rings=2, dense=400, phase=0.5,
                          rmod=tail_rmod)
    def paint(ins, Ac):
        s, c = Ac[:, 3], Ac[:, 4]
        o = np.full(len(Ac), 'fur', dtype=object)
        o[(c < -0.75) & (s > 0.20) & (s < 0.50)] = 'belly'  # a narrow cream strip, only on the lower inner curve
        o[ins['tip']] = 'tip'
        return o
    def f_tip(P):     # the orange-to-brown border: three big soft round scallops
        c, sn = P[:, 4], P[:, 5]; c3 = 4 * c ** 3 - 3 * c   # cos(3 phi)
        return (TIP_S + 0.045 * (0.5 + 0.5 * c3)) - P[:, 3]
    return Piece('tail', V, F, A=A, fields={'tip': f_tip}, paint=paint, part='tail'), info

def build_tail_blade(info):
    # Storm: a third crescent lying along the top (outer curve) of the brown tip, its ends sunk into the fur, with a
    # lightning-bolt mark cut on both faces
    C, T, N, B = info['C'], info['T'], info['N'], info['B']
    n = len(C); idx = [int(round(t * (n - 1))) for t in np.linspace(0.64, 0.97, 5)]
    ctrl = []
    for j, i in enumerate(idx):
        s = i / (n - 1); r = float(np.interp(s, *TAIL_PROF))
        lift = math.sin(PI * (j + 0.5) / len(idx))                    # (a crescent: the middle stands proud)
        Nr = rot(T[i], 0.55) @ N[i]                                    # (turned toward +X: seen from the front cameras)
        ctrl.append(C[i] + Nr * (r * 0.84 + 0.055 * lift))
    i = idx[-1]; ctrl.append(C[-1] + T[-1] * 0.05 + (rot(T[-1], 0.55) @ N[-1]) * 0.0)     # over the tip end
    side = rot(T[idx[2]], 0.55) @ B[idx[2]]
    def prof(s):
        return 0.017 + 0.030 * math.sin(PI * s) ** 0.8, 0.0145 + 0.004 * math.sin(PI * s)
    V, F, A, info2 = sweep(ctrl, 7, 6, prof, side, expo=2.4, caps=(True, True), cap_rings=1, dense=200)
    Cm = info2['C'][3]; Tm = info2['T'][3]; Bm = info2['B'][3]; Nm = info2['N'][3]
    def f_bolt(P):
        q = P[:, :3] - Cm
        u, v = q @ Tm, q @ Nm
        s = stroke(u, v, [(-0.018, 0.020), (0.004, 0.004), (-0.006, -0.002), (0.016, -0.022)], 0.0055, 0.0065)
        return np.maximum(s, -np.abs(q @ Bm) + 0.004)
    def paint(ins, Ac):
        o = np.full(len(Ac), 'blade', dtype=object); o[ins['bolt']] = 'bolt'; return o
    return Piece('tailblade', V, F, A=A, fields={'bolt': f_bolt}, paint=paint, part='tail')

# =========================================================================================== assemble
def build_geometry(tailblade=False):
    pieces = [build_head(), build_nose(), build_ear(-1), build_ear(1), build_body(), build_mouth()]
    pieces += [build_eye(k) for k in (-1, 1)] + [build_brow(k) for k in (-1, 1)] + [build_blush(k) for k in (-1, 1)]
    for k in (-1, 1):
        for front in (True, False):
            pieces += [build_leg(k, front), build_paw(k, front)]
        pieces += [build_blade(k), build_grip(k)]
    pieces += [build_scarf_ring(), build_knot(), build_scarf_tail(0), build_scarf_tail(1)]
    tail, info = build_tail(); pieces.append(tail)
    if tailblade: pieces.append(build_tail_blade(info))
    items = [process(p) for p in pieces]
    for part in ('body', 'tail'):
        cull_buried([it for it in items if it['part'] == part])
    return items

def cull_buried(items, margin=0.035):
    """drop the faces buried deeper than 'margin' inside another (static) shell of the same part: they can never be
    seen, and the ink hull (~2 cm) of what remains stays inside the occluder too"""
    from mathutils.bvhtree import BVHTree
    trees = [BVHTree.FromPolygons([tuple(p) for p in it['P']], [tuple(int(i) for i in t) for t in it['T']]) for it in items]
    for i, it in enumerate(items):
        deep = np.zeros(len(it['P']), bool)
        for j, tr in enumerate(trees):
            if j == i or not items[j]['occ']: continue
            for vi, p in enumerate(it['P']):
                if deep[vi]: continue
                loc, n, fi, dist = tr.find_nearest(Vector(p))
                if loc is not None and dist > margin and (Vector(p) - loc).dot(n) < 0: deep[vi] = True
        keep = ~deep[it['T']].all(1)
        T = it['T'][keep]; used = np.unique(T); remap = -np.ones(len(it['P']), int); remap[used] = np.arange(len(used))
        it['culled'] = int((~keep).sum())
        it['P'], it['N'], it['T'], it['keys'] = it['P'][used], it['N'][used], remap[T], it['keys'][keep]

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
    rgb = shade(fc, N[li])
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

def build_variant(vname):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    np.random.seed(7)
    v = VARIANTS[vname]; pal = dict(COMMON); pal.update({k: x for k, x in v.items() if isinstance(x, str)})
    pal['scarfhi'] = lighten(pal['scarf'], 0.22)
    items = build_geometry(tailblade=v.get('tailblade', False))
    body = make_object('body', [it for it in items if it['part'] == 'body'], pal, np.zeros(3))
    tail = make_object('tail', [it for it in items if it['part'] == 'tail'], pal, TAIL_PIVOT)
    stats = {}
    for ob in (body, tail):
        stats[ob.name] = dict(tris=len(ob.data.polygons), pivot=[round(x, 4) for x in ob.location])
    for it in items:
        stats.setdefault('pieces', {})[it['name']] = len(it['T'])
    fn = 'kamaitachi' + ('' if vname == 'base' else '_' + vname)
    if vname == 'base':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK_DIR, 'kamaitachi.blend'))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, fn + '.glb'), export_format='GLB', export_apply=True,
                              export_yup=True, export_attributes=False, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_texcoords=False,
                              export_lights=False, export_cameras=False, export_animations=False,
                              export_skins=False, export_morph=False, export_materials='EXPORT')
    stats['total'] = stats['body']['tris'] + stats['tail']['tris']
    print('KAMAITACHI', vname, json.dumps(stats))
    return stats

if __name__ == '__main__':
    names = list(VARIANTS) if WANT == 'all' else [WANT]
    allstats = {n: build_variant(n) for n in names}
    with open(os.path.join(TASK_DIR, 'work', 'build_stats.json'), 'w', encoding='utf-8') as f:
        json.dump(allstats, f, indent=1)
