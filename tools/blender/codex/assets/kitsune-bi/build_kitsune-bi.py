# Kitsune-bi (Pawhaven enemy EN-1, the Burrow) -- Option A "Foxfire Drop".
# Deterministic build, from an empty scene, of the two variant GLBs:
#   blender --background --factory-startup --python build_kitsune-bi.py -- [--only base|violet]
# One rigid part (the Burrow's one-piece rule): a single mesh object `body`, origin (0, 0, 0) = the ground centre.
# The figure floats in model space (bottom of the drop ~0.65 m, curl top 1.45 m; the game bobs the whole model).
# Vertex colours only (attribute `Col`, face-corner domain), one material `toon`. No rig, no textures, no UVs.
#
# Build:
#   - the drop: one closed tube. Horizontal elliptical rings follow the sheet's measured front profile (a round
#     bottom, a teardrop taper), then the rings ride an exact circular arc (the curl, radius > tube radius, so it
#     can't fold), with a 24 -> 12 ring reduction at the neck and a ball cap on the curl's tip.
#   - ears and tail: flattened tubes (flames) along smoothed spines, ball tips, bases sunk into the drop.
#   - painted blocks (the pale mask, eyes, lashes, catchlights, nose, mouth, blush, inner ears, the tail's pale
#     flame): thin shells 1.5-4.5 mm off the surface, ray-cast onto the part they sit on, smooth normals taken
#     from that part, so every colour border is a modelled edge loop.
import bpy, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('KBI build pid', os.getpid())

# ------------------------------------------------------------------ colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

VARIANTS = {
    'base':   dict(body='#7ab8ff', lite='#a6d3ff', deep='#5f9df0', accent='#4f8ee0', accent_lite='#6ea6f2',
                   core='#dceeff', core_deep='#c9e2fb'),
    'violet': dict(body='#b88aff', lite='#d2b2ff', deep='#9e72ec', accent='#8e66d8', accent_lite='#a986ea',
                   core='#efe4ff', core_deep='#e0d0fa'),
}
COMMON = dict(eye='#292b46', catch='#ffffff', catch2='#e4eeff', blush='#e98c91', tongue='#e8838e')

# ------------------------------------------------------------------ math
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

def catmull(pts, n):
    out = []
    P = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    segs = len(pts) - 1
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

def resample(pts, n, closed=False):
    """n points evenly spaced by arc length along a polyline (closed: n points round the loop)"""
    P = list(pts) + ([pts[0]] if closed else [])
    L = [0.0]
    for i in range(1, len(P)): L.append(L[-1] + (P[i] - P[i - 1]).length)
    tot = L[-1]; out = []; j = 0
    cnt = n if closed else n - 1
    for k in range(n):
        s = tot * k / cnt
        while j < len(P) - 2 and L[j + 1] < s: j += 1
        t = (s - L[j]) / max(1e-12, L[j + 1] - L[j]); out.append(P[j].lerp(P[j + 1], min(1.0, t)))
    return out

# ------------------------------------------------------------------ mesh accumulator
class Part:
    """vertices, optional fixed normals, faces with per-corner colours (a colour or a function of the vertex)"""
    def __init__(self, name):
        self.name = name; self.v = []; self.n = []; self.f = []; self.fc = []
    def vert(self, p, n=None):
        self.v.append(Vector(p)); self.n.append(None if n is None else Vector(n).normalized()); return len(self.v) - 1
    def face(self, idx, col, hint=None):
        if hint is not None:
            P = [self.v[i] for i in idx]
            nn = (P[1] - P[0]).cross(P[2] - P[0])
            if len(P) == 4: nn += (P[2] - P[0]).cross(P[3] - P[0])
            if nn.dot(hint) < 0: idx = list(reversed(idx))
        cs = [col(self.v[i]) for i in idx] if callable(col) else [col] * len(idx)
        self.f.append(list(idx)); self.fc.append(cs)
    def finish_normals(self):
        acc = [Vector((0, 0, 0)) for _ in self.v]
        for f in self.f:
            P = [self.v[i] for i in f]
            nn = (P[1] - P[0]).cross(P[2] - P[0])
            if len(P) == 4: nn += (P[2] - P[0]).cross(P[3] - P[0])
            for i in f: acc[i] += nn
        for i, n in enumerate(self.n):
            if n is None: self.n[i] = acc[i].normalized() if acc[i].length > 1e-12 else Vector((0, 0, 1))
    def merge(self, o):
        off = len(self.v); self.v += o.v; self.n += o.n
        self.f += [[i + off for i in f] for f in o.f]; self.fc += o.fc
    def tris(self): return sum(len(f) - 2 for f in self.f)

class Surf:
    """a finished part as a ray-cast target: hit -> (point, smooth normal)"""
    def __init__(self, part):
        tris = []
        for f in part.f:
            for k in range(1, len(f) - 1): tris.append((f[0], f[k], f[k + 1]))
        self.tris = tris; self.v = part.v; self.n = part.n
        self.bvh = BVHTree.FromPolygons([v.copy() for v in part.v], [list(t) for t in tris])
    def cast(self, origin, d):
        loc, nrm, idx, dist = self.bvh.ray_cast(origin, d, 5.0)
        if loc is None: return None, None
        a, b, c = (self.v[i] for i in self.tris[idx])
        v0, v1, v2 = b - a, c - a, loc - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-18: return loc, nrm
        wv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den; wu = 1 - wv - ww
        na, nb, nc = (self.n[i] for i in self.tris[idx])
        n = (na * wu + nb * wv + nc * ww)
        # Phong tessellation: the smooth surface through the vertices (outside the flat facets), so a shell lifted
        # off it never dips under a facet ridge
        ph = Vector((0, 0, 0))
        for w_, vi, ni in ((wu, a, na), (wv, b, nb), (ww, c, nc)):
            ph += (loc - ni * (loc - vi).dot(ni)) * w_
        return ph, (n.normalized() if n.length > 1e-9 else nrm)

class Decal:
    """2-D coordinates (u, v) in a plane (origin O, axes U, V) projected along D onto a surface; h lifts the shell
    off the surface along its normal"""
    def __init__(self, surf, O, U, V, D):
        self.s = surf; self.O = Vector(O); self.U = Vector(U).normalized(); self.V = Vector(V).normalized(); self.D = Vector(D).normalized()
    def at(self, u, v, h):
        P0 = self.O + self.U * u + self.V * v
        p, n = self.s.cast(P0 - self.D * 1.0, self.D)
        if p is None: p, n = P0, -self.D
        return p + n * h, n

def fill(m, D, c, bnd, rings, hfn, colfn):
    """polar shell: centre c (u, v), boundary list bnd [(u, v)] (star-shaped about c), rings at fractions"""
    S = len(bnd)
    p, n = D.at(c[0], c[1], hfn(c[0], c[1], 0.0)); ci = m.vert(p, n)
    ids = []; ns = []
    for f in rings:
        row, rn = [], []
        for (bu, bv) in bnd:
            u, v = c[0] + (bu - c[0]) * f, c[1] + (bv - c[1]) * f
            p, n = D.at(u, v, hfn(u, v, f)); row.append(m.vert(p, n)); rn.append(n)
        ids.append(row); ns.append(rn)
    for k in range(S):
        m.face([ci, ids[0][k], ids[0][(k + 1) % S]], colfn(0, k), ns[0][k])
    for j in range(len(rings) - 1):
        for k in range(S):
            m.face([ids[j][k], ids[j][(k + 1) % S], ids[j + 1][(k + 1) % S], ids[j + 1][k]], colfn(j + 1, k), ns[j][k])

def band(m, D, A, B, hfn, col):
    ia, ib, na = [], [], []
    for (ua, va), (ub, vb) in zip(A, B):
        p, n = D.at(ua, va, hfn(ua, va)); ia.append(m.vert(p, n)); na.append(n)
        p, n = D.at(ub, vb, hfn(ub, vb)); ib.append(m.vert(p, n))
    for i in range(len(A) - 1):
        m.face([ia[i], ia[i + 1], ib[i + 1], ib[i]], col, na[i])

def stroke(m, D, path, half_w, hfn, col):
    """a band of half width half_w (a function of t in 0..1 or a number) along a 2-D path"""
    A, B = [], []
    n = len(path)
    for i in range(n):
        a = path[max(0, i - 1)]; b = path[min(n - 1, i + 1)]
        tu, tv = b[0] - a[0], b[1] - a[1]; ln = math.hypot(tu, tv); nu, nv = -tv / ln, tu / ln
        w = half_w(i / (n - 1)) if callable(half_w) else half_w
        A.append((path[i][0] + nu * w, path[i][1] + nv * w)); B.append((path[i][0] - nu * w, path[i][1] - nv * w))
    band(m, D, A, B, lambda u, v: hfn(u, v), col)

def ellipse_pts(cu, cv, a, b, n, rot=0.0):
    cr, sr = math.cos(rot), math.sin(rot); out = []
    for k in range(n):
        t = 2 * math.pi * k / n; x, y = a * math.cos(t), b * math.sin(t)
        out.append((cu + x * cr - y * sr, cv + x * sr + y * cr))
    return out

def hull2(c0, r0, c1, r1, n):
    """the rounded cone round two circles (a teardrop / flame), n points by arc length, counter-clockwise"""
    pts = []
    for c, r in ((c0, r0), (c1, r1)):
        for k in range(96):
            t = 2 * math.pi * k / 96; pts.append((c[0] + r * math.cos(t), c[1] + r * math.sin(t)))
    pts = sorted(set(pts))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    h = lo[:-1] + hi[:-1]
    return [(p.x, p.y) for p in resample([Vector((a, b, 0)) for a, b in h], n, closed=True)]

# ------------------------------------------------------------------ the drop (body tube)
# Front profile measured on the sheet (0.00231 m/px, the figure 0.80 m from the drop's bottom to the curl top):
# a round bottom (an ellipse: centre 0.86, semi-height 0.21, half-width 0.284), then the teardrop taper.
ZB, ZC, A0, HB = 0.65, 0.86, 0.284, 0.21
UPPER = [(0.86, 0.284), (0.895, 0.2835), (0.918, 0.280), (0.941, 0.275), (0.964, 0.268), (0.987, 0.260), (1.010, 0.252),
         (1.033, 0.243), (1.056, 0.232), (1.103, 0.207), (1.149, 0.178), (1.195, 0.149), (1.241, 0.123), (1.264, 0.111),
         (1.288, 0.097), (1.311, 0.081), (1.330, 0.064)]
def cx_of(z): return -0.012 * smooth(1.10, 1.30, z)
def cy_of(z): return 0.026 * smooth(1.00, 1.28, z)
def dep_of(z): return 0.90 + 0.09 * smooth(1.05, 1.32, z)
K = 24                      # ring vertices round the drop
KH = 12                     # round the curl (after the 24 -> 12 reduction at the neck)
H_DIR = Vector((0.97, -0.24, 0)).normalized()   # the curl hooks to the viewer's right (+X), a little forward
W_DIR = H_DIR.cross(Z).normalized()
R_C = 0.066                 # the curl's spine arc radius (> the tube radius everywhere: no fold)
ARC0, ARC1 = 180.0, -5.0   # degrees: the arc from the stem (left of the curl centre) over the top to the tip

def profile_pts():
    pts = []
    for i in range(0, 25):            # the round bottom
        th = -math.pi / 2 + (math.pi / 2) * i / 24
        pts.append(Vector((A0 * math.cos(th), 0, ZC + HB * math.sin(th))))
    up = [Vector((a, 0, z)) for z, a in UPPER]
    pts += catmull(up, 60)[1:]
    return pts

def body_col(V):
    c, lite, deep = hexc(V['body']), hexc(V['lite']), hexc(V['deep'])
    def f(p):
        col = mixc(c, lite, 0.55 * smooth(0.98, 1.42, p.z))
        col = mixc(col, deep, 0.55 * smooth(0.84, 0.66, p.z))
        col = mixc(col, deep, 0.18 * smooth(0.02, 0.26, p.y))
        return col
    return f

def build_drop(V):
    m = Part('drop')
    col = body_col(V)
    prof = profile_pts()
    # rings by arc length along the profile (the round bottom gets its share)
    NR = 19
    ring_pts = resample(prof, NR + 1)[1:]          # skip the bottom pole (a = 0)
    rings = []
    for q in ring_pts:
        z, a = q.z, q.x; cx, cy, d = cx_of(z), cy_of(z), dep_of(z)
        rings.append([Vector((cx + a * math.cos(t), cy + d * a * math.sin(t), z))
                      for t in (-math.pi / 2 + 2 * math.pi * k / K for k in range(K))])
    ids = [[m.vert(p) for p in r] for r in rings]
    for j in range(len(rings) - 1):
        for k in range(K):
            m.face([ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]], col)
    pole = m.vert(Vector((0, 0, ZB)))
    for k in range(K): m.face([pole, ids[0][(k + 1) % K], ids[0][k]], col)
    # ---- the curl: rings ride a circular arc in the plane (H_DIR, Z), starting at the last (horizontal) ring
    zs = ring_pts[-1].z; a_s = ring_pts[-1].x
    S0 = Vector((cx_of(zs), cy_of(zs), zs)); C = S0 + H_DIR * R_C
    d_s = dep_of(zs)
    def basis(vec):     # a horizontal vector in (-h, w) coordinates
        return vec.dot(-H_DIR), vec.dot(W_DIR)
    NA = 10
    arc_rings = []
    for i in range(1, NA + 1):
        al = math.radians(ARC0 + (ARC1 - ARC0) * i / NA)
        E = H_DIR * math.cos(al) + Z * math.sin(al)
        P = C + E * R_C
        tt = i / NA
        r = lerp(a_s, 0.030, tt ** 1.6)
        d = lerp(d_s, 1.0, min(1.0, tt * 2))
        ring = []
        for k in range(KH):
            t = -math.pi / 2 + 2 * math.pi * k / KH
            hx, wx = basis(X); hy, wy = basis(Y)
            vx = E * hx + W_DIR * wx; vy = E * hy + W_DIR * wy     # X and Y carried round the arc (RMF of a plane arc)
            ring.append(P + vx * r * math.cos(t) + vy * r * d * math.sin(t))
        arc_rings.append((ring, P, E, r))
    # 24 -> 12 reduction between the last horizontal ring and the first arc ring
    A = ids[-1]; B = [m.vert(p) for p in arc_rings[0][0]]
    for k in range(KH):
        a0, a1, a2 = A[2 * k], A[2 * k + 1], A[(2 * k + 2) % K]; b0, b1 = B[k], B[(k + 1) % KH]
        m.face([a0, a1, b0], col); m.face([a1, a2, b1], col); m.face([a1, b1, b0], col)
    prev = B
    for ring, P, E, r in arc_rings[1:]:
        cur = [m.vert(p) for p in ring]
        for k in range(KH):
            m.face([prev[k], prev[(k + 1) % KH], cur[(k + 1) % KH], cur[k]], col)
        prev = cur
    # ball cap on the tip: along the arc's tangent
    ring, P, E, r = arc_rings[-1]
    al = math.radians(ARC1); T = (H_DIR * math.sin(al) - Z * math.cos(al)).normalized()
    for beta in (32, 62):
        b = math.radians(beta)
        cur = [m.vert(P + (p - P) * math.cos(b) + T * r * math.sin(b)) for p in ring]
        for k in range(KH):
            m.face([prev[k], prev[(k + 1) % KH], cur[(k + 1) % KH], cur[k]], col)
        prev = cur
    tip = m.vert(P + T * r)
    for k in range(KH): m.face([prev[k], prev[(k + 1) % KH], tip], col)
    m.finish_normals()
    return m

# ------------------------------------------------------------------ flames (ears, tail)
def flame_tube(name, path, ra, rb, N0, K, colfn, win=2, cap1=(30, 58, 80), cap0=None):
    """an elliptical tube (half axes ra along N, rb along B) on a smoothed spine with rotation-minimising frames;
    a ball cap on the end; the start closed by a small cap (buried in the drop)"""
    m = Part(name); n = len(path)
    T = [(path[min(n - 1, i + win)] - path[max(0, i - win)]).normalized() for i in range(n)]
    N = (N0 - T[0] * N0.dot(T[0])).normalized(); fr = []
    for t in T:
        N = (N - t * N.dot(t)).normalized(); fr.append((t, N, t.cross(N)))
    rings = []
    for p, a, b, (t, nv, bv) in zip(path, ra, rb, fr):
        rings.append([p + nv * a * math.cos(2 * math.pi * k / K) + bv * b * math.sin(2 * math.pi * k / K) for k in range(K)])
    ids = [[m.vert(q) for q in r] for r in rings]
    def quad_strip(r0, r1):
        for k in range(K): m.face([r0[k], r0[(k + 1) % K], r1[(k + 1) % K], r1[k]], colfn)
    for j in range(n - 1): quad_strip(ids[j], ids[j + 1])
    # end cap: an ellipsoidal ball
    t, nv, bv = fr[-1]; p = path[-1]; a, b = ra[-1], rb[-1]; c = (a + b) * 0.5
    prev = ids[-1]
    for beta in cap1:
        bb = math.radians(beta)
        cur = [m.vert(p + (nv * a * math.cos(2 * math.pi * k / K) + bv * b * math.sin(2 * math.pi * k / K)) * math.cos(bb) + t * c * math.sin(bb)) for k in range(K)]
        quad_strip(prev, cur); prev = cur
    tip = m.vert(p + t * c)
    for k in range(K): m.face([prev[k], prev[(k + 1) % K], tip], colfn)
    # start cap (inside the drop): a flat-ish fan
    t0 = fr[0][0]; base = m.vert(path[0] - t0 * min(ra[0], rb[0]) * 0.6)
    for k in range(K): m.face([base, ids[0][(k + 1) % K], ids[0][k]], colfn)
    m.finish_normals()
    return m, fr

EAR_F_DEG = 16.0   # the ear's broad face looks this far round from the front toward the side
def ear_frame(s):
    F = Vector((s * math.sin(math.radians(EAR_F_DEG)), -math.cos(math.radians(EAR_F_DEG)), 0.10)).normalized()
    Wb = Vector((-s * math.cos(math.radians(EAR_F_DEG)), -math.sin(math.radians(EAR_F_DEG)), 0)).normalized()  # broad axis: toward the inner front
    return F, Wb

def ear_path(s):
    # spine (s = -1: the viewer's left ear): base buried in the drop's shoulder, bowing outward, tip back in a touch
    P = [(0.174, -0.052, 1.010), (0.197, -0.062, 1.080), (0.207, -0.068, 1.142), (0.199, -0.070, 1.198), (0.170, -0.068, 1.252)]
    return [Vector((s * x, y, z)) for x, y, z in P]

def build_ear(V, s):
    pts = catmull(ear_path(s), 8)
    ra = [0.058, 0.072, 0.080, 0.078, 0.066, 0.048, 0.031, 0.018]
    rb = [0.034, 0.036, 0.037, 0.035, 0.031, 0.026, 0.020, 0.016]
    F, Wb = ear_frame(s)
    acc, lite = hexc(V['accent']), hexc(V['accent_lite'])
    zmin, zmax = pts[0].z, pts[-1].z
    def col(p): return mixc(acc, lite, 0.45 * smooth(zmin + 0.10, zmax + 0.02, p.z))
    m, fr = flame_tube('ear', pts, ra, rb, Wb, 10, col, win=2)
    return m, pts, F, Wb

def tail_path():
    P = [(-0.020, 0.090, 0.825), (-0.028, 0.200, 0.800), (-0.036, 0.292, 0.812), (-0.040, 0.345, 0.862),
         (-0.036, 0.354, 0.930), (-0.024, 0.328, 0.985), (-0.008, 0.290, 1.018)]
    return [Vector(p) for p in P]

def build_tail(V):
    pts = catmull(tail_path(), 10)
    ra = [0.066, 0.094, 0.116, 0.126, 0.123, 0.108, 0.088, 0.066, 0.045, 0.027]   # across (X)
    rb = [0.058, 0.082, 0.100, 0.108, 0.104, 0.092, 0.075, 0.057, 0.040, 0.025]
    acc, body = hexc(V['accent']), hexc(V['body'])
    def col(p): return mixc(mixc(body, acc, 0.72), acc, smooth(0.86, 1.02, p.z))
    m, fr = flame_tube('tail', pts, ra, rb, X.copy(), 12, col, win=2)
    return m

# ------------------------------------------------------------------ face
PATCH_R = [(0.0, 0.934), (0.016, 0.958), (0.033, 0.988), (0.060, 1.022), (0.090, 1.041), (0.118, 1.047), (0.150, 1.044),
           (0.179, 1.034), (0.206, 1.016), (0.226, 0.995), (0.240, 0.968), (0.246, 0.940), (0.247, 0.900), (0.245, 0.865),
           (0.240, 0.830), (0.233, 0.796), (0.214, 0.768), (0.180, 0.745), (0.130, 0.729), (0.064, 0.721), (0.0, 0.719)]
def patch_outline(n_half):
    """the pale fox mask (front view): two round lobes over the eyes, a V notch between them, the sides wrapping
    to ~86 % of the silhouette, a round chin. Returned counter-clockwise from the V notch."""
    right = [Vector((x, z, 0)) for x, z in PATCH_R]
    # keep the notch sharp: the first segment straight, the rest smoothed
    sm = catmull(right, 60)
    half = resample(sm, n_half + 1)            # notch .. chin centre, inclusive
    left = [Vector((-p.x, p.y, 0)) for p in reversed(half[1:-1])]
    loop = half + left                          # notch -> right side -> chin -> left side
    return [(p.x, p.y) for p in reversed(loop)]  # counter-clockwise in (x, z) seen from the front

EYE = (0.143, 0.888)         # eye centre (front view x, z)
EA, EB = 0.0665, 0.0540      # the eye's ellipse (half width, half height below the lid)
def eye_lid(q):  return 0.038 + 0.0030 * (q / EA) - 0.004 * (q / EA) ** 2            # the sleepy lid line (q = outward): a touch lower inside
def eye_corner(sg):
    """q where the lid line meets the ellipse, sg = -1 inner / +1 outer"""
    lo, hi = 0.0, EA
    for _ in range(40):
        mid = (lo + hi) / 2; q = sg * mid
        if EB * math.sqrt(max(0.0, 1 - (q / EA) ** 2)) > eye_lid(q): lo = mid
        else: hi = mid
    return sg * lo

def build_eye(m, D, s, P):
    """s = +1: the viewer's right eye (+X). u = s * q, q outward."""
    ex, ez = s * EYE[0], EYE[1]
    def dome(u, v):
        q = (u - ex) * s; vv = v - ez
        return 0.0018 * max(0.0, 1 - (q / 0.068) ** 2 - (vv / 0.056) ** 2)
    # the dark eye: the ellipse's lower arc from corner to corner, closed by the lid line (sharp corners kept)
    qi, qo = eye_corner(-1), eye_corner(1)
    ti, to = math.atan2(eye_lid(qi) / EB, qi / EA), math.atan2(eye_lid(qo) / EB, qo / EA)   # param angles
    loop = []
    for i in range(18):                                  # outer corner -> down round the bottom -> inner corner
        t = to - (to - (ti - 2 * math.pi)) * i / 17
        loop.append((EA * math.cos(t), EB * math.sin(t)))
    for i in range(1, 7):                                # the lid back from the inner corner to the outer
        q = qi + (qo - qi) * i / 7; loop.append((q, eye_lid(q)))
    bnd = [(ex + s * q, ez + v) for q, v in loop]
    dark = hexc(P['eye'])
    fill(m, D, (ex, ez - 0.004), bnd, [0.55, 1.0], lambda u, v, f: 0.0030 + dome(u, v), lambda j, k: dark)
    # the lash: a thick band riding the lid (overlapping the eye's top edge), curving down a little past the inner
    # corner, thickening outward into an upturned flick with a rounded end
    path = [(qi + 0.003, eye_lid(qi) - 0.006), (qi + 0.001, eye_lid(qi) - 0.001)]
    for i in range(1, 10):
        q = qi + (qo - qi) * i / 9; path.append((q, eye_lid(q) + 0.002))
    path += [(qo + 0.010, eye_lid(qo) + 0.004), (qo + 0.018, eye_lid(qo) + 0.009), (qo + 0.023, eye_lid(qo) + 0.015)]
    path = [(p.x, p.y) for p in catmull([Vector((q, v, 0)) for q, v in path], 22)]
    def hw(t):
        if t < 0.70: return 0.0045 + 0.0040 * smooth(0.05, 0.70, t)
        return 0.0090 - 0.0042 * smooth(0.70, 1.0, t)
    pts = [(ex + s * q, ez + v) for q, v in path]
    stroke(m, D, pts, hw, lambda u, v: 0.0036 + dome(u, v), dark)
    fill(m, D, pts[-1], ellipse_pts(pts[-1][0], pts[-1][1], 0.0046, 0.0046, 8), [1.0],
         lambda u, v, f: 0.0036 + dome(u, v), lambda j, k: dark)       # the flick's round end
    # catchlights: a big one up-inner, a small pale bar low-outer (mirrored on the two eyes, as the sheet)
    cl = hexc(P['catch']); c2 = hexc(P['catch2'])
    cx_, cz_ = ex - s * 0.028, ez + 0.012
    fill(m, D, (cx_, cz_), ellipse_pts(cx_, cz_, 0.0150, 0.0150, 12), [1.0], lambda u, v, f: 0.0044 + dome(u, v), lambda j, k: cl)
    cx_, cz_ = ex + s * 0.043, ez - 0.024
    fill(m, D, (cx_, cz_), ellipse_pts(cx_, cz_, 0.0065, 0.0105, 8, s * 0.30), [1.0], lambda u, v, f: 0.0044 + dome(u, v), lambda j, k: c2)

def build_face(m, surf, V, P):
    D = Decal(surf, (0, 0, 0), X, Z, Y)       # front projection
    core, core_deep = hexc(V['core']), hexc(V['core_deep'])
    bnd = patch_outline(26)
    c = (0.0, 0.862)
    def pcol(j, k):
        u, v = bnd[k]
        return mixc(core, core_deep, 0.5 * smooth(0.80, 0.72, v) * (0.6 + 0.4 * (j >= 3)))
    fill(m, D, c, bnd, [0.30, 0.62, 0.86, 1.0], lambda u, v, f: 0.0015, pcol)
    for s in (-1, 1): build_eye(m, D, s, P)
    dark = hexc(P['eye'])
    # nose: a small rounded triangle
    tri = [Vector((-0.0235, 0.8735, 0)), Vector((0.0235, 0.8735, 0)), Vector((0.0, 0.8475, 0))]
    loop = []
    for i in range(3):
        a, b, cc = tri[i - 1], tri[i], tri[(i + 1) % 3]
        for t in (0.25, 0.5, 0.75):
            # a rounded corner at b: a quadratic from a-b midpoint to b-c midpoint
            p0, p2 = (a + b) / 2, (b + cc) / 2
            loop.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p2)
    loop = [(p.x, p.y) for p in resample(loop, 12, closed=True)]
    fill(m, D, (0.0, 0.8645), loop, [1.0], lambda u, v, f: 0.0030 + 0.0015 * (1 - f), lambda j, k: dark)
    # mouth: the cat's "w" under the nose, a tiny pink tongue between its humps
    tongue = hexc(P['tongue'])
    fill(m, D, (0.0, 0.8300), ellipse_pts(0.0, 0.8300, 0.0115, 0.0080, 10), [1.0], lambda u, v, f: 0.0024, lambda j, k: tongue)
    stroke(m, D, [(0.0, 0.851), (0.0, 0.8385)], 0.0042, lambda u, v: 0.0030, dark)
    for s in (-1, 1):
        arc = [Vector((s * x, z, 0)) for x, z in ((0.0, 0.8390), (0.0085, 0.8280), (0.0225, 0.8235), (0.0365, 0.8285), (0.0455, 0.8405))]
        arc = [(p.x, p.y) for p in catmull(arc, 10)]
        stroke(m, D, arc, lambda t: 0.0044 - 0.0008 * t, lambda u, v: 0.0030, dark)
    # blush
    bl = hexc(P['blush'])
    for s in (-1, 1):
        bx, bz = s * 0.184, 0.831
        fill(m, D, (bx, bz), ellipse_pts(bx, bz, 0.0320, 0.0185, 14, -s * 0.10), [0.6, 1.0], lambda u, v, f: 0.0024, lambda j, k: bl)

def build_ear_inner(m, ear, pts, F, Wb, V, s):
    surf = Surf(ear)
    Up = (pts[-1] - pts[0]).normalized()
    Wp = (Wb - Up * Wb.dot(Up)).normalized()
    O = pts[0]
    D = Decal(surf, O, Wp, Up, -F)
    shape = hull2((0.012, 0.100), 0.048, (-0.010, 0.188), 0.011, 26)
    if Wp.cross(Up).dot(-F) < 0: shape.reverse()
    core = hexc(V['core'])
    fill(m, D, (0.008, 0.115), shape, [0.6, 1.0], lambda u, v, f: 0.0016, lambda j, k: core)

def build_tail_inner(m, tail, V):
    surf = Surf(tail)
    Dd = Vector((-0.74, -0.67, 0.0)).normalized()         # seen from the +X side, a little from the back
    U = Vector((-Dd.y, Dd.x, 0)).normalized()               # horizontal across the view
    D = Decal(surf, Vector((0.0, 0.29, 0.0)), U, Z, Dd)
    shape = hull2((-0.012, 0.792), 0.056, (0.000, 0.922), 0.012, 26)
    if U.cross(Z).dot(Dd) < 0: shape.reverse()
    core = hexc(V['core'])
    fill(m, D, (-0.010, 0.82), shape, [0.6, 1.0], lambda u, v, f: 0.0016, lambda j, k: core)

# ------------------------------------------------------------------ assemble one variant
def make_material():
    mt = bpy.data.materials.new('toon'); mt.use_nodes = True; nt = mt.node_tree
    mt.use_backface_culling = True
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    return mt

def to_object(part, mat):
    part.finish_normals()
    me = bpy.data.meshes.new(part.name)
    me.from_pydata([v.copy() for v in part.v], [], part.f)
    me.update()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cols = []
    for poly, cs in zip(me.polygons, part.fc):
        assert poly.loop_total == len(cs)
        cols.extend(cs)
    attr.data.foreach_set('color', [x for c in cols for x in c])
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    me.materials.append(mat)
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in part.n])
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def build_variant(key):
    V = VARIANTS[key]; P = COMMON
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    body = Part('body'); counts = {}
    drop = build_drop(V); counts['drop'] = drop.tris()
    surf = Surf(drop)
    body.merge(drop)
    t0 = body.tris(); build_face(body, surf, V, P); counts['face'] = body.tris() - t0
    for s in (-1, 1):
        ear, pts, F, Wb = build_ear(V, s); counts['ear%+d' % s] = ear.tris()
        body.merge(ear)
        t0 = body.tris(); build_ear_inner(body, ear, pts, F, Wb, V, s); counts['ear_inner%+d' % s] = body.tris() - t0
    tail = build_tail(V); counts['tail'] = tail.tris(); body.merge(tail)
    t0 = body.tris(); build_tail_inner(body, tail, V); counts['tail_inner'] = body.tris() - t0
    print('KBI %s parts tris %s' % (key, counts))
    ob = to_object(body, mat)
    lo = Vector((min(v.x for v in body.v), min(v.y for v in body.v), min(v.z for v in body.v)))
    hi = Vector((max(v.x for v in body.v), max(v.y for v in body.v), max(v.z for v in body.v)))
    print('KBI %s tris %d | W%.3f D%.3f H%.3f | x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (
        key, body.tris(), hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    name = 'kitsune-bi' if key == 'base' else 'kitsune-bi_' + key
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('KBI export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('KBI wrote', out)

for key in VARIANTS:
    if ONLY and key != ONLY: continue
    build_variant(key)
