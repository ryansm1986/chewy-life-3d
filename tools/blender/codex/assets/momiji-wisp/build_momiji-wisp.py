# Momiji Wisp (Pawhaven enemy EN-1, Momiji Hollow) -- Option A "Leaf Lantern".
# Deterministic build, from an empty scene, of the three variant GLBs:
#   blender --background --factory-startup --python build_momiji-wisp.py -- [--only base|ginkgo|ember]
# Parts (enemy contract): `body` (origin 0,0,0: core, face, mane, ears, collar, tail) and `orbit` (origin = the core
# centre, 0,0,CY: the 7 ring leaves). Vertex colours only (attribute `Col`, face-corner domain); materials `toon` and
# `glow` (the core, the tail, the ember specks). No rig, no textures, no UVs.
# Leaves are thick lens-section slabs built as polar meshes round a star centre (maple: 5 lobes with soft points;
# ginkgo: a scalloped fan), bent and cupped, with lighter vein strips as thin shells on the faces.
# Face features are thin shells (1.5-6 mm) projected onto the core along its normal (the kodama's technique).
import bpy, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('WISP build pid', os.getpid())

# ------------------------------------------------------------------ colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

VARIANTS = {
    'base':   dict(leaf=('#e2482e', '#f47034'), vein=('#f47a52', '#ff9a5e'), core='#ffe07a', core2='#ffb050',
                   tail=('#ffb050', '#f47034'), kind='maple', embers=False),
    'ginkgo': dict(leaf=('#ffd23a', '#eeb028'), vein=('#ffe680', '#ffd25a'), core='#ffe48a', core2='#ffc860',
                   tail=('#ffd070', '#eeb028'), kind='ginkgo', embers=False),
    'ember':  dict(leaf=('#b81e2a', '#ff6a2a'), vein=('#e04a3a', '#ff9a5a'), core='#ffb24a', core2='#ff6a2a',
                   tail=('#ffb24a', '#ff6a2a'), kind='maple', embers=True),
}
COMMON = dict(dark='#292125', iris='#8a582f', iris_top='#4a2a1c', white='#fff6ea', catch='#ffffff',
              blush='#f2a0a0', mouth_in='#5a2430', tongue='#ec7a88', ember='#ffd870')

# ------------------------------------------------------------------ math
def spow(x, p): return math.copysign(abs(x) ** p, x)
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# ------------------------------------------------------------------ dimensions (m, Blender: front -Y, ground z=0)
CY = 0.36                              # core centre height (the orbit pivot)
RX, RY, RZ = 0.206, 0.198, 0.194       # core semi-axes (a ball, a touch wider than tall, as the sheet)
CC = Vector((0, 0, CY))
RING_R, RING_Z = 0.52, -0.17           # orbit radius, ring plane relative to the core centre (the sheet: core-bottom level)

def core_P(eta, om):
    return Vector((RX * math.cos(eta) * math.cos(om), RY * math.cos(eta) * math.sin(om), CY + RZ * math.sin(eta)))
def core_n(p):
    v = Vector(((p.x) / RX ** 2, (p.y) / RY ** 2, (p.z - CY) / RZ ** 2))
    return v.normalized() if v.length > 1e-9 else Z.copy()

# ------------------------------------------------------------------ mesh accumulator
class Part:
    def __init__(self, name):
        self.name = name; self.v = []; self.n = []; self.f = []; self.fc = []; self.fm = []
    def vert(self, p, n=None):
        self.v.append(Vector(p)); self.n.append(None if n is None else Vector(n).normalized()); return len(self.v) - 1
    def face(self, idx, col, hint, mat=0):
        P = [self.v[i] for i in idx]
        nn = Vector((0, 0, 0))
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        if nn.dot(hint) < 0: idx = list(reversed(idx))
        self.f.append(list(idx)); self.fc.append(col); self.fm.append(mat)
    def finish_normals(self):
        acc = [Vector((0, 0, 0)) for _ in self.v]
        for f in self.f:
            P = [self.v[i] for i in f]
            nn = (P[1] - P[0]).cross(P[2] - P[0])
            if len(P) == 4: nn += (P[2] - P[0]).cross(P[3] - P[0])
            for i in f: acc[i] += nn
        for i, n in enumerate(self.n):
            if n is None: self.n[i] = acc[i].normalized() if acc[i].length > 1e-12 else Vector((0, 0, 1))
    def tris(self): return sum(len(f) - 2 for f in self.f)

def ring_surface(m, rings, centres, colfn, pole0=None, pole1=None, normals=None, mat=0):
    nf = normals or (lambda p: None)
    ids = [[m.vert(p, nf(p)) for p in ring] for ring in rings]
    K = len(rings[0])
    mf = mat if callable(mat) else (lambda j, k: mat)
    for j in range(len(rings) - 1):
        c = (centres[j] + centres[j + 1]) / 2
        for k in range(K):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]]
            fc = sum((m.v[i] for i in q), Vector()) / 4
            m.face(q, colfn(j, k), fc - c, mf(j, k))
    for pole, j, ring, c in ((pole0, -1, 0, centres[0]), (pole1, len(rings) - 1, -1, centres[-1])):
        if pole is None: continue
        pi = m.vert(pole, nf(pole))
        for k in range(K):
            q = [pi, ids[ring][k], ids[ring][(k + 1) % K]]
            fc = sum((m.v[i] for i in q), Vector()) / 3
            m.face(q, colfn(j, k), fc - c, mf(j, k))
    return ids

def frames_along(path):
    T = [(path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized() for i in range(len(path))]
    ref = Y if abs(T[0].dot(Y)) < 0.9 else X
    Nv = (ref - T[0] * ref.dot(T[0])).normalized(); out = []
    for t in T:
        Nv = (Nv - t * Nv.dot(t)).normalized(); out.append((t, Nv, t.cross(Nv)))
    return out

def tube(m, path, radii, K, colfn, cap0=True, cap1=True, mat=0):
    fr = frames_along(path); rings = []
    for p, r, (t, nv, bv) in zip(path, radii, fr):
        rings.append([p + (nv * math.cos(2 * math.pi * k / K) + bv * math.sin(2 * math.pi * k / K)) * r for k in range(K)])
    p0 = path[0] - fr[0][0] * radii[0] * 0.9 if cap0 else None
    p1 = path[-1] + fr[-1][0] * radii[-1] * 0.95 if cap1 else None
    ring_surface(m, rings, path, colfn, p0, p1, mat=mat)

def catmull(pts, n):
    out = []
    P = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    segs = len(pts) - 1
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

def ellipsoid(m, c, ax, ay, az, K, R, colfn, mat=0):
    rings, cs = [], []
    for j in range(1, R + 1):
        eta = -math.pi / 2 + math.pi * j / (R + 1)
        ring = [c + ax * (math.cos(eta) * math.cos(2 * math.pi * k / K)) + ay * (math.cos(eta) * math.sin(2 * math.pi * k / K)) + az * math.sin(eta) for k in range(K)]
        rings.append(ring); cs.append(c + az * math.sin(eta))
    ring_surface(m, rings, cs, colfn, c - az, c + az, mat=mat)

# ------------------------------------------------------------------ leaves
def maple_outline(small, puffy=False):
    """2-D outline (u across, v along the leaf from the stem notch), in units of the leaf length; star centre C.
    puffy: the mane's big leaves -- fat rounded lobes with only a small soft point, shallow valleys (the sheet)"""
    C = (0.0, 0.40)
    if puffy:
        lobes = [(-114, 0.43, 27), (-56, 0.58, 30), (0, 0.62, 31), (56, 0.58, 30), (114, 0.43, 27)]
        rv = [0.365, 0.36, 0.36, 0.365]
    else:
        lobes = [(-112, 0.42, 24), (-55, 0.57, 26), (0, 0.62, 27), (55, 0.57, 26), (112, 0.42, 24)]
        rv = [0.34, 0.335, 0.335, 0.34]          # valleys between consecutive lobes (distance from C): chunky, not lacy
    pts = [(180.0, 0.30)]                  # the stem notch
    for i, (a, R, hw) in enumerate(lobes):
        if small or abs(a) > 90: seq = [(a - 0.62 * hw, 0.80), (a, 1.0), (a + 0.62 * hw, 0.80)]
        elif puffy: seq = [(a - 0.78 * hw, 0.74), (a - 0.45 * hw, 0.90), (a - 0.17 * hw, 0.955), (a, 1.0),
                           (a + 0.17 * hw, 0.955), (a + 0.45 * hw, 0.90), (a + 0.78 * hw, 0.74)]
        else: seq = [(a - 0.72 * hw, 0.76), (a - 0.28 * hw, 0.94), (a, 1.0), (a + 0.28 * hw, 0.94), (a + 0.72 * hw, 0.76)]
        pts += [(aa, R * rr) for aa, rr in seq]
        if i < len(lobes) - 1: pts.append(((a + lobes[i + 1][0]) / 2, rv[i]))
    # angles from +v toward +u; start at the notch (180) and go round increasing: rebase into (-180, 180]
    out = [(aa if aa <= 180 else aa - 360, r) for aa, r in pts]
    out[0] = (-180.0, out[0][1])
    out.sort(key=lambda t: t[0])
    return C, out

def ginkgo_outline(small):
    C = (0.0, 0.34)
    # a fan: narrow at the stem, broad scalloped top edge with a central notch
    if small:
        pts = [(-180, 0.30), (-118, 0.24), (-86, 0.46), (-64, 0.64), (-40, 0.68), (-16, 0.66), (0, 0.50),
               (16, 0.66), (40, 0.68), (64, 0.64), (86, 0.46), (118, 0.24)]
    else:
        pts = [(-180, 0.30), (-130, 0.22), (-102, 0.33), (-82, 0.50), (-68, 0.63), (-54, 0.68), (-40, 0.665), (-27, 0.69),
               (-14, 0.67), (-5, 0.58), (0, 0.50), (5, 0.58), (14, 0.67), (27, 0.69), (40, 0.665), (54, 0.68), (68, 0.63),
               (82, 0.50), (102, 0.33), (130, 0.22)]
    return C, [(float(a), r) for a, r in pts]

def outline_R(ol, a):
    """outline radius at angle a (deg), linear in angle between samples (wraps)"""
    n = len(ol)
    for i in range(n):
        a0, r0 = ol[i]; a1, r1 = ol[(i + 1) % n]
        if i == n - 1: a1 += 360
        aa = a if a >= a0 else a + 360
        if a0 <= aa <= a1: return r0 + (r1 - r0) * (aa - a0) / (a1 - a0)
    return ol[0][1]

def leaf(m, B, D, N, L, T, col, vein, under, kind='maple', small=False, curl=0.0, cup=0.0, twist=0.0,
         vein_back=False, mat=0, shade=None, veins='all', puffy=False):
    """a thick lens-section leaf: stem notch at B, axis D (unit), top face normal N (unit, made orthogonal to D);
    length L, thickness T. Top colour `col` (rim lighter, centre darker), lighter `vein` strips, `under` underside."""
    D = D.normalized(); N = (N - D * N.dot(D)).normalized(); U = D.cross(N)
    C2, ol = maple_outline(small, puffy) if kind == 'maple' else ginkgo_outline(small)
    cu, cv = C2[0] * L, C2[1] * L
    def h_top(f): return T * 0.5 * math.sqrt(max(0.0, 1 - f * f)) * (1 - 0.18 * f)
    def h_bot(f): return -T * 0.5 * math.sqrt(max(0.0, 1 - f * f)) * 0.85
    def place(u, v, w):
        s = v / L; w = w + L * (curl * s * s + cup * (u / L) ** 2)
        tw = twist * s                     # a gentle twist along the leaf
        uu = u * math.cos(tw) - w * math.sin(tw); ww = u * math.sin(tw) + w * math.cos(tw)
        return B + U * uu + D * v + N * ww
    def pt(a, f): R = outline_R(ol, a) * L; return (cu + f * R * math.sin(math.radians(a)), cv + f * R * math.cos(math.radians(a)))
    FT = [0.6, 1.0] if small else ([0.55, 0.86, 1.0] if puffy else [0.64, 1.0])
    FB = [1.0]
    lite = mixc(col, hexc('#ffe8c0'), 0.12); deep = mixc(col, hexc('#5a1020'), 0.05) if shade is None else shade
    # rim ring (shared)
    rim = [m.vert(place(*pt(a, 1.0), 0.0)) for a, _ in ol]
    K = len(ol)
    def surface(F, hfn, sign, colfn):
        ids = []
        for f in F[:-1]:
            ids.append([m.vert(place(*pt(a, f), hfn(f))) for a, _ in ol])
        ids.append(rim)
        ci = m.vert(place(cu, cv, hfn(0.0)))
        hint = N * sign
        for k in range(K):
            m.face([ci, ids[0][k], ids[0][(k + 1) % K]], colfn(0), hint, mat)
        for j in range(len(ids) - 1):
            for k in range(K):
                m.face([ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]], colfn(j + 1), hint, mat)
    surface(FT, h_top, 1, lambda j: col if j == 0 else mixc(col, hexc('#8a1a20'), 0.06))   # rim a touch deeper, no pale halo
    surface(FB, h_bot, -1, lambda j: under)
    # vein strips (shells 2.5 mm off the face), from the stem toward each lobe tip
    def hf(u, v, top):
        du, dv = u - cu, v - cv; r = math.hypot(du, dv)
        a = math.degrees(math.atan2(du, dv)); R = outline_R(ol, a) * L
        f = r / R if R > 1e-9 else 0.0
        def lin(F, hfn):   # the mesh is piecewise linear between its rings: follow that, not the analytic lens
            nodes = [0.0] + F
            for i in range(len(nodes) - 1):
                if f <= nodes[i + 1] or i == len(nodes) - 2:
                    t = (f - nodes[i]) / (nodes[i + 1] - nodes[i]); return hfn(nodes[i]) + (hfn(nodes[i + 1]) - hfn(nodes[i])) * t
        return (lin(FT, h_top) + 0.0022) if top else (lin(FB, h_bot) - 0.0022)
    if kind == 'maple':
        tips = [(a, rr) for a, rr in ol if rr >= max(r2 for a2, r2 in ol if abs(a2 - a) < 12) - 1e-9 and rr > 0.38]
        tips = [t for t in tips if any(abs(t[0] - la) < 1 for la in (-112, -55, 0, 55, 112))]
        starts = (0.0, 0.17 * L)
        ends = 0.80
    else:
        tips = [(a, outline_R(ol, a)) for a in (-50, -25, 0, 25, 50)]
        starts = (0.0, 0.10 * L)
        ends = 0.70
    if veins == 'mid': tips = [t for t in tips if abs(t[0]) < 1]
    elif veins == 'three': tips = [t for t in tips if abs(t[0]) < 60]
    for top in ((True, False) if vein_back else (True,)):
        for a, rr in (tips if top else [t for t in tips if abs(t[0]) < (1 if puffy else 60)]):
            tu, tv = cu + rr * L * math.sin(math.radians(a)) * 0.98, cv + rr * L * math.cos(math.radians(a)) * 0.98
            S = [0.0, 0.3, 0.56, ends] if top else [0.0, 0.45, ends]
            A, Bs = [], []
            for s in S:
                pu, pv = starts[0] + (tu - starts[0]) * s, starts[1] + (tv - starts[1]) * s
                du, dv = tu - starts[0], tv - starts[1]; ln = math.hypot(du, dv); nu, nv = -dv / ln, du / ln
                wd = (0.0075 - 0.0045 * s / ends) * (L / 0.30) ** 0.5 * (1.0 if a == 0 else 0.85)
                A.append(place(pu + nu * wd, pv + nv * wd, hf(pu + nu * wd, pv + nv * wd, top)))
                Bs.append(place(pu - nu * wd, pv - nv * wd, hf(pu - nu * wd, pv - nv * wd, top)))
            ia = [m.vert(p) for p in A]; ib = [m.vert(p) for p in Bs]
            for i in range(len(S) - 1):
                m.face([ia[i], ia[i + 1], ib[i + 1], ib[i]], vein, N if top else -N, mat)
    return place(cu, cv, 0.0)

# ------------------------------------------------------------------ the core + face
OMS, ETS = 24, 12
def build_core(m, V):
    c0, c1 = hexc(V['core']), hexc(V['core2'])
    rings, cs = [], []
    for j in range(1, ETS):
        eta = -math.pi / 2 + math.pi * j / ETS
        rings.append([core_P(eta, -math.pi / 2 + 2 * math.pi * k / OMS + math.pi / OMS) for k in range(OMS)])
        cs.append(Vector((0, 0, rings[-1][0].z)))
    def colf(j, k):
        jj = min(max(j, 0), len(rings) - 1); kk = k
        p = (rings[jj][kk] + rings[jj][(kk + 1) % OMS] + rings[min(jj + 1, len(rings) - 1)][kk]) / 3
        if j < 0: p = rings[0][kk]
        if j >= len(rings) - 1: p = rings[-1][kk]
        n = core_n(p)
        t = clamp(0.30 - 0.62 * (-n.y) - 0.30 * n.z) ** 0.9
        cc = mixc(c0, c1, t)
        return mixc(cc, hexc(V['leaf'][0]), 0.75 * smooth(0.25, 0.6, n.y))
    tmp = Part('tmp')
    ring_surface(tmp, rings, cs, colf, core_P(-math.pi / 2, 0), core_P(math.pi / 2, 0), normals=core_n)
    bvh = BVHTree.FromPolygons([v.copy() for v in tmp.v], [list(f) for f in tmp.f])
    ring_surface(m, rings, cs, colf, core_P(-math.pi / 2, 0), core_P(math.pi / 2, 0), normals=core_n, mat=1)
    return bvh

class Decal:
    def __init__(self, bvh, C, extra=0.0):
        self.bvh = bvh; self.C = C; self.N = core_n(C); self.extra = extra
        self.T = (X - self.N * X.dot(self.N)).normalized(); self.B = self.N.cross(self.T)
    def at(self, u, v, h):
        P0 = self.C + self.T * u + self.B * v
        hit = self.bvh.ray_cast(P0 + self.N * 0.25, -self.N, 1.0)
        p = hit[0] if hit[0] is not None else P0
        n = core_n(p)
        return p + n * (h + self.extra), n

def front_point(bvh, x, z):
    hit = bvh.ray_cast(Vector((x, -1.0, z)), Y, 3.0); return hit[0]

def polar_decal(m, D, c2, bnd, rings, S, hfn, colfn, mat=0, own_normals=False, th0=0.0):
    def mk(u, v, f):
        p, n = D.at(u, v, hfn(u, v, f)); return m.vert(p, None if own_normals else n), n
    ci, cn = mk(c2[0], c2[1], 0.0)
    ids, ns = [], []
    for f in rings:
        row, rn = [], []
        for k in range(S):
            th = th0 + 2 * math.pi * k / S; du, dv = bnd(th)
            i, n = mk(c2[0] + f * du, c2[1] + f * dv, f); row.append(i); rn.append(n)
        ids.append(row); ns.append(rn)
    for k in range(S):
        m.face([ci, ids[0][k], ids[0][(k + 1) % S]], colfn(0, k), ns[0][k], mat)
    for j in range(len(rings) - 1):
        for k in range(S):
            q = [ids[j][k], ids[j][(k + 1) % S], ids[j + 1][(k + 1) % S], ids[j + 1][k]]
            m.face(q, colfn(j + 1, k), ns[j][k], mat)

def band_decal(m, D, A, B, hfn, colfn, mat=0):
    ia, ib, na = [], [], []
    for (ua, va), (ub, vb) in zip(A, B):
        p, n = D.at(ua, va, hfn(ua, va)); ia.append(m.vert(p, n)); na.append(n)
        p, n = D.at(ub, vb, hfn(ub, vb)); ib.append(m.vert(p, n))
    for i in range(len(A) - 1):
        m.face([ia[i], ia[i + 1], ib[i + 1], ib[i]], colfn(i), na[i], mat)

def ell(a, b, rot=0.0):
    cr, sr = math.cos(rot), math.sin(rot)
    return lambda th: (a * math.cos(th) * cr - b * math.sin(th) * sr, a * math.cos(th) * sr + b * math.sin(th) * cr)

EYE_X, EYE_Z = 0.110, CY + 0.036
def build_eye(m, bvh, side, P):
    C = front_point(bvh, side * EYE_X, EYE_Z); D = Decal(bvh, C)
    so = side
    sa, sb = 0.0600, 0.0650                 # the eye (sclera) semi-axes
    def q_of(u, v): return (u / sa) ** 2 + (v / sb) ** 2
    def dome(u, v): return 0.0026 * max(0.0, 1 - q_of(u, v))
    lay = lambda base: (lambda u, v, f=None: base + dome(u, v))
    c = hexc
    polar_decal(m, D, (0, 0), ell(sa, sb), [1.0], 20, lay(0.0015), lambda j, k: c(P['dark']))   # a dark rim, no white ring
    # iris: almost the whole eye (a thin white sliver at the lower inner edge)
    ic = (so * 0.0024, 0.0024); ia, ib = 0.0583, 0.0630
    polar_decal(m, D, ic, ell(ia, ib), [0.55, 1.0], 20, lay(0.0032), lambda j, k: c(P['iris']))
    def crescent(th0, th1, tmax, n, h, col):
        A, B = [], []
        for i in range(n + 1):
            th = math.radians(th0 + (th1 - th0) * i / n)
            ox, oy = ia * math.cos(th), ib * math.sin(th)
            t = tmax * math.sin(math.pi * i / n) ** 0.8
            A.append((ic[0] + ox, ic[1] + oy)); B.append((ic[0] + ox * (1 - t), ic[1] + oy * (1 - t)))
        band_decal(m, D, A, B, lambda u, v: h + dome(u, v), lambda i: col)
    crescent(4, 176, 0.75, 12, 0.0040, c(P['iris_top']))       # the dark top half of the iris
    pc = (ic[0], ic[1] + 0.003)
    polar_decal(m, D, pc, ell(0.0368, 0.0412), [1.0], 16, lay(0.0049), lambda j, k: c(P['dark']))
    # catchlights: big upper-left (viewer's), small lower-right, the same on both eyes
    polar_decal(m, D, (ic[0] - 0.0165, ic[1] + 0.0209), ell(0.0174, 0.0187), [1.0], 12, lay(0.0057), lambda j, k: c(P['catch']))
    polar_decal(m, D, (ic[0] + 0.0209, ic[1] - 0.0225), ell(0.0083, 0.0083), [1.0], 8, lay(0.0057), lambda j, k: c(P['catch']))
    # lash line over the top rim, thicker toward the outer corner
    def lash_h(u, v):
        inside = max(0.0, min(1.0, (1.12 - math.sqrt(q_of(u, v))) / 0.22))
        return 0.0018 + 0.0044 * inside + dome(u, v)
    A, B = [], []; n = 12
    for i in range(n + 1):
        t = i / n; th = math.radians(160 - 140 * t)
        cu_, sv = math.cos(th), math.sin(th)
        px, py = so * sa * cu_, sb * sv
        nx, ny = so * cu_ / sa, sv / sb; ln = math.hypot(nx, ny); nx, ny = nx / ln, ny / ln
        w = 0.0035 + 0.0060 * smooth(0.0, 0.75, t) - 0.0030 * smooth(0.9, 1.0, t)
        if t < 0.08: w *= t / 0.08 * 0.6 + 0.4
        ins = 0.0065 * (0.4 + 0.6 * math.sin(math.pi * min(1, t * 1.1)))
        A.append((px - nx * ins, py - ny * ins)); B.append((px + nx * w, py + ny * w))
    band_decal(m, D, A, B, lash_h, lambda i: c(P['dark']))
    # one small outer flick
    th = math.radians(22); px, py = so * sa * math.cos(th), sb * math.sin(th)
    d = (so * math.cos(math.radians(40)), math.sin(math.radians(40))); pn = (-d[1], d[0])
    A, B = [], []
    for i in range(4):
        t = i / 3; cx, cy = px - d[0] * 0.004 + d[0] * 0.016 * t, py - d[1] * 0.004 + d[1] * 0.016 * t + 0.002 * t * t
        hw = 0.0045 * (1 - t) ** 0.7 + 0.001
        A.append((cx + pn[0] * hw, cy + pn[1] * hw)); B.append((cx - pn[0] * hw, cy - pn[1] * hw))
    band_decal(m, D, A, B, lash_h, lambda i: c(P['dark']))

def build_face(m, bvh, P, V):
    for side in (-1, 1): build_eye(m, bvh, side, P)
    # brows: small soft warm dashes, high above the eyes
    brow = mixc(hexc(V['core2']), hexc('#e06a28'), 0.45)
    for side in (-1, 1):
        D = Decal(bvh, front_point(bvh, side * 0.104, CY + 0.124))
        polar_decal(m, D, (0, 0), ell(0.0155, 0.0062, side * -0.28), [1.0], 10, lambda u, v, f: 0.0016, lambda j, k: brow)
    # nose: a tiny dark rounded dot
    D = Decal(bvh, front_point(bvh, 0.0, CY + 0.002))
    polar_decal(m, D, (0, 0), ell(0.0105, 0.0072), [1.0], 8, lambda u, v, f: 0.0016 + 0.0025 * (1 - f), lambda j, k: hexc(P['dark']))
    # mouth: a small open happy "D" (flat-ish top, round bottom), dark rim, pink tongue
    D = Decal(bvh, front_point(bvh, 0.0, CY - 0.030))
    def mouth_b(th):
        s, cth = math.sin(th), math.cos(th)
        return (0.0360 * cth * (1 - 0.10 * max(0, -s)), (0.0060 * s if s > 0 else 0.0320 * s) + 0.0)
    polar_decal(m, D, (0, 0.0005), mouth_b, [0.5, 1.0], 16, lambda u, v, f: 0.0016,
                lambda j, k: hexc(P['mouth_in']) if j <= 1 else hexc(P['dark']), th0=0.0)
    # the dark rim: a thin band just outside the mouth
    A, Bb = [], []
    for i in range(17):
        th = 2 * math.pi * i / 16; du, dv = mouth_b(th)
        A.append((du, dv + 0.0005)); r = 1.0 + 0.0034 / max(0.006, math.hypot(du, dv))
        Bb.append((du * r, dv * r + 0.0005))
    band_decal(m, D, A, Bb, lambda u, v: 0.0017, lambda i: hexc(P['dark']))
    polar_decal(m, D, (0.0, -0.0195), ell(0.0215, 0.0100), [1.0], 10, lambda u, v, f: 0.0026, lambda j, k: hexc(P['tongue']))
    # blush ovals
    for side in (-1, 1):
        D = Decal(bvh, front_point(bvh, side * 0.146, CY - 0.026))
        polar_decal(m, D, (0, 0), ell(0.0370, 0.0270, side * 0.06), [0.6, 1.0], 14, lambda u, v, f: 0.0020, lambda j, k: hexc(P['blush']))

# ------------------------------------------------------------------ mane, ears, collar, tail
def radial(phi): return Vector((math.sin(phi), 0, math.cos(phi)))
def mane_leaf(m, V, phi_d, beta_d, L, ci, rb, yb, roll_d=0.0, curl=0.06, cup=0.05, twist=0.0, T=0.040, base_dz=0.0, puffy=False):
    """a mane leaf rooted inside the core: phi = angle round the front view (0 up, + to the viewer's right = +X),
    beta = sweep back (0 = radial in the frontal plane, 90 = straight back). The top face looks front-outward."""
    phi, beta = math.radians(phi_d), math.radians(beta_d)
    R = radial(phi)
    D = R * math.cos(beta) + Y * math.sin(beta)
    N = R * math.sin(beta) - Y * math.cos(beta)
    if roll_d:
        r = math.radians(roll_d); Ud = D.cross(N)
        N = N * math.cos(r) + Ud * math.sin(r)
    B = CC + R * rb + Y * yb + Z * base_dz
    col = hexc(V['leaf'][ci]); vein = hexc(V['vein'][ci]); under = mixc(col, hexc('#7a1822'), 0.08)
    leaf(m, B, D, N, L, T, col, vein, under, kind=V['kind'], curl=curl, cup=cup, twist=twist, vein_back=True, puffy=puffy)
    return B, D, N

def build_mane(m, V):
    """the sunburst: about 7 big puffy leaves fanned round the core, tilted back only 20-35 deg from the face plane
    so the mane faces the 45-deg game camera as a round frame; two fat cupped ears standing clearly above; a back
    plate closing the back. Every leaf is rooted behind the core's centre plane, so nothing covers the face."""
    g = V['kind'] == 'ginkgo'
    k = 0.94 if g else 1.0          # ginkgo fans are broader than maple leaves of the same length
    # (phi, beta, L, colour index, rb, yb, roll, T, cup) -- 0 = deep red #e2482e, 1 = orange #f47034
    spec = [
        (-88, 24, 0.41 * k, 1, 0.10, 0.05, -6, 0.058, 0.07), (88, 24, 0.41 * k, 1, 0.10, 0.05, 6, 0.058, 0.07),     # big sides
        # the lower pair tips a little forward (below the face) so the 45-deg camera sees them close the ring
        (-128, 8, 0.34 * k, 0, 0.10, 0.06, 0, 0.056, 0.07), (128, 8, 0.34 * k, 0, 0.10, 0.06, 0, 0.056, 0.07),
    ]
    if not g: spec.append((0, 36, 0.27, 0, 0.06, 0.10, 0, 0.054, 0.06))      # top centre, low behind the ears
    for phi, beta, L, ci, rb, yb, roll, T, cup in spec:
        mane_leaf(m, V, phi, beta, L, ci, rb, yb, roll_d=roll, curl=0.05, cup=cup, T=T, puffy=True)
    # the back plate: a big leaf standing behind the core, its face to the back, tip up (the sheet's back view)
    col = hexc(V['leaf'][1]); vein = hexc(V['vein'][1]); under = mixc(col, hexc('#7a1822'), 0.12)
    B = CC + Vector((0, 0.17, -0.20)); D = Vector((0, 0.30, 1.0)).normalized(); N = Vector((0, 1, -0.3))
    leaf(m, B, D, N, 0.44 * k, 0.05, col, vein, under, kind=V['kind'], curl=0.04, cup=0.07, vein_back=True, puffy=True)
    # the ears: two fat, cupped leaves standing on top, splayed outward, leaning back a little
    for s in (-1, 1):
        mane_leaf(m, V, s * 27, 18, 0.35 * k, 1, 0.10, 0.055, roll_d=s * 4, curl=0.03, cup=0.20, T=0.07, puffy=True)

def build_collar(m, V):
    """the little scalloped ring of petals under the core where the tail starts"""
    c0 = mixc(hexc(V['core2']), hexc(V['tail'][1]), 0.35); c1 = mixc(c0, hexc('#ffffff'), 0.0)
    K = 12; prof = [(0.0, 0.02), (0.050, 0.018), (0.072, 0.0), (0.060, -0.022), (0.030, -0.034), (0.0, -0.036)]
    z0 = CY - RZ + 0.03
    rings, cs = [], []
    for r, h in prof[1:-1]:
        ring = []
        for k in range(K):
            th = 2 * math.pi * k / K; sc = 1 + 0.14 * math.cos(6 * th)
            ring.append(Vector((math.cos(th) * r * sc, 0.02 + math.sin(th) * r * sc * 0.95, z0 + h)))
        rings.append(ring); cs.append(Vector((0, 0.02, z0 + h)))
    ring_surface(m, rings, cs, lambda j, k: c0 if j < 2 else c1, Vector((0, 0.02, z0 + prof[0][1])), Vector((0, 0.02, z0 + prof[-1][1])))

def tail_path():
    """a stalk out of the core's bottom, then a snail-curl in the frontal plane (viewed from the front: down the
    left, round the bottom, up the right and in, the inner turns a touch forward), its lowest point at z = 0"""
    cx, cz = 0.004, 0.0655
    pts = [Vector((-0.012, 0.035, CY - RZ + 0.06)), Vector((-0.011, 0.035, CY - RZ + 0.012))]
    n = 22; a0, a1 = math.radians(100), math.radians(100 + 470)
    for i in range(n + 1):
        t = i / n; a = a0 + (a1 - a0) * t
        r = 0.068 * math.exp(-1.25 * t)
        y = 0.035 - 0.045 * t
        pts.append(Vector((cx + r * math.cos(a), y, cz + r * math.sin(a))))
    return pts

def build_tail(m, V):
    path = tail_path()
    # resample smoothly
    path = catmull(path, 26)
    radii = []
    for i in range(len(path)):
        t = i / (len(path) - 1)
        radii.append(0.036 - 0.025 * t ** 0.8)
    c0, c1 = hexc(V['tail'][0]), hexc(V['tail'][1])
    tube(m, path, radii, 7, lambda j, k: mixc(c0, c1, smooth(0.2, 0.95, max(0, j) / (len(path) - 1))), cap0=True, cap1=True, mat=1)
    # two little leaves riding the curl
    col0, col1 = hexc(V['leaf'][0]), hexc(V['leaf'][1])
    for ci, B, D, N, L in (
        (0, Vector((0.075, 0.020, 0.075)), Vector((0.9, -0.1, -0.35)), Vector((0.15, -1.0, 0.1)), 0.095),
        (1, Vector((-0.07, 0.065, 0.085)), Vector((-0.85, 0.3, -0.2)), Vector((-0.2, 1.0, 0.1)), 0.085)):
        col = hexc(V['leaf'][ci]); vein = hexc(V['vein'][ci]); under = mixc(col, hexc('#7a1822'), 0.12)
        leaf(m, B, D.normalized(), N, L, 0.028, col, vein, under, kind=V['kind'], small=True, curl=0.08, cup=0.06, veins='mid')

def build_embers(m, V):
    col = hexc(COMMON['ember'])
    for p, r in ((Vector((-0.30, 0.10, CY + 0.13)), 0.022), (Vector((0.31, 0.11, CY + 0.10)), 0.021),
                 (Vector((-0.22, 0.10, CY - 0.17)), 0.019), (Vector((0.25, 0.10, CY - 0.15)), 0.02),
                 (Vector((0.05, 0.10, CY + 0.30)), 0.018)):
        ellipsoid(m, p, X * r, Y * r, Z * r, 8, 3, lambda j, k: col, mat=1)

def build_orbit(m, V):
    for i in range(7):
        a = 2 * math.pi * i / 7 + math.radians(90)    # no leaf dead in front of the face
        ci = i % 2
        col = hexc(V['leaf'][ci]); vein = hexc(V['vein'][ci]); under = mixc(col, hexc('#7a1822'), 0.14)
        Lr = 0.17
        tang = Vector((-math.sin(a), math.cos(a), 0))        # CCW from above = the game's spin direction
        rad = Vector((math.cos(a), math.sin(a), 0))
        bank = math.radians(8)                                  # outer edge a touch up: the face toward the camera
        N = (Z * math.cos(bank) - rad * math.sin(bank)).normalized()
        zc = CY + RING_Z + 0.022 * math.sin(i * 2.1)
        centre = Vector((0, 0, zc)) + rad * RING_R
        B = centre - tang * (0.42 * Lr)                         # the stem trails, the tip leads
        leaf(m, B, tang, N, Lr, 0.030, col, vein, under, kind=V['kind'], small=True, curl=0.10, cup=0.10, veins='three')

# ------------------------------------------------------------------ assemble one variant
def make_materials(V):
    def mat(name, glow):
        mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
        mt.use_backface_culling = True
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        if glow:
            # the glTF exporter can't carry a vertex-colour emission (a linked Emission Color exports as a white
            # emissiveFactor), so the emission is the core's front colour as a constant; Base Color still reads `Col`
            bsdf.inputs['Emission Color'].default_value = hexc(V['core'])
            bsdf.inputs['Emission Strength'].default_value = 1.0
        return mt
    return mat('toon', False), mat('glow', True)

def to_object(part, origin, mats):
    part.finish_normals()
    me = bpy.data.meshes.new(part.name)
    me.from_pydata([v - origin for v in part.v], [], part.f)
    me.update()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cols = []
    for f, c in zip(me.polygons, part.fc):
        cols.extend([c] * f.loop_total)
    attr.data.foreach_set('color', [x for c in cols for x in c])
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    me.materials.append(mats[0]); me.materials.append(mats[1])
    me.polygons.foreach_set('material_index', part.fm)
    if not any(part.fm):
        me.materials.pop(index=1)
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in part.n])
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = origin
    return ob

def build_variant(key):
    V = VARIANTS[key]; P = COMMON
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials(V)
    body, orbit = Part('body'), Part('orbit')
    counts = {}
    def step(nm, fn, prt):
        t0 = prt.tris(); r = fn(); counts[nm] = prt.tris() - t0; return r
    bvh = step('core', lambda: build_core(body, V), body)
    step('face', lambda: build_face(body, bvh, P, V), body)
    step('mane', lambda: build_mane(body, V), body)
    step('collar', lambda: build_collar(body, V), body)
    step('tail', lambda: build_tail(body, V), body)
    if V['embers']: step('embers', lambda: build_embers(body, V), body)
    step('orbit', lambda: build_orbit(orbit, V), orbit)
    print('WISP %s parts tris %s' % (key, counts))
    # the tail tip exactly on the ground
    minz = min(v.z for v in body.v)
    for prt in (body, orbit):
        for v in prt.v: v.z -= minz
    pivot = Vector((0, 0, CY - minz))
    ob_b = to_object(body, Vector((0, 0, 0)), mats)
    ob_o = to_object(orbit, pivot, mats)
    tb, to = body.tris(), orbit.tris()
    allv = body.v + orbit.v
    lo = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
    hi = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
    lob = Vector((min(v.x for v in body.v), min(v.y for v in body.v), min(v.z for v in body.v)))
    hib = Vector((max(v.x for v in body.v), max(v.y for v in body.v), max(v.z for v in body.v)))
    print('WISP %s tris body %d orbit %d total %d | all W%.3f D%.3f H%.3f | body W%.3f D%.3f H%.3f y%.3f..%.3f | orbit pivot %s minz %.4f' % (
        key, tb, to, tb + to, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, hib.x - lob.x, hib.y - lob.y, hib.z - lob.z, lob.y, hib.y,
        tuple(round(c, 4) for c in pivot), minz))
    name = 'momiji-wisp' if key == 'base' else 'momiji-wisp_' + key
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('WISP export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('WISP wrote', out)

for key in VARIANTS:
    if ONLY and key != ONLY: continue
    build_variant(key)
