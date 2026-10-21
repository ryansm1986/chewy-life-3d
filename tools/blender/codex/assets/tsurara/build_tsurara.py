# Tsurara (Pawhaven enemy EN-1, Yukimi Onsen) -- Option A "Icicle Wisp".
# Deterministic build, from an empty scene, of the three variant GLBs:
#   blender --background --factory-startup --python build_tsurara.py -- [--only base|aurora|blackice]
# Parts (enemy contract; rigid, no rig):
#   body   origin (0,0,0)          the head ball, the face, the ghost body down to its bottom tip
#   crown  origin = head centre    the hair cap, 13 thick petal icicle locks, the 5-crystal crown
#   arms   origin = shoulder line  both stubby icicle arms + their joint caps (caps are round about X: no gap when pitched)
#   tail   origin = the curl root  the curling wisp tail, out of the body's bottom tip
# Vertex colours only (attribute `Col`, face-corner domain), one material `toon`. No textures, no UVs.
# The game makes this kind glow by colour (linear r <= 0.55, g >= 0.62, b >= 0.8): the body's shading is kept out of
# that box (safe_mix); cyan stays on the eyes, the crystals and the icicle hair.
import bpy, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
DEBUG = '--debug' in argv
print('TSU build pid', os.getpid())

# ------------------------------------------------------------------ colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))
def glows(c): return c[0] <= 0.55 and c[1] >= 0.62 and c[2] >= 0.8
def safe_mix(a, b, t):
    """mix a -> b, backing t off until the colour is out of the game's glow box (the body must not glow)"""
    while t > 0:
        c = mixc(a, b, t)
        if not glows(c): return c
        t -= 0.02
    return a

VARIANTS = {
    # shade: the sheet's #a6d8f6 sits inside the glow box (linear g 0.69), so its green is lowered to #a6ccf4
    'base': dict(body='#e6f6ff', shade='#a6ccf4', joint='#5689b2', dark='#183a60', eye='#7ae6ff', eye_top='#3a96e6',
                 blush='#f2b8d2', sclera='#f4faff', tongue='#f29ab4', catch='#ffffff',
                 crystal=('#9fe6ff', '#84d4fa', '#62b8f0'), hair='#a2cdfa', hair2='#96c6f6', under='#78b4e8',
                 root=None, tip='#e8f6ff', cap='#96c6f6'),
    'aurora': dict(body='#e8fff4', shade='#9ee0d0', joint='#5c9c94', dark='#1c3a5a', eye='#7affd8', eye_top='#2aa894',
                   blush='#d8b8ff', sclera='#f4fffa', tongue='#e8a0c8', catch='#ffffff',
                   crystal=('#c8a8ff', '#dcc8ff', '#b294f6'), hair='#b4f0dc', hair2='#a6e8d4', under='#8ccfc0',
                   root='#c8b4fa', tip='#e8f6ff', cap='#c8b4fa'),
    'blackice': dict(body='#5a6ca8', shade='#2a3464', joint='#34407a', dark='#0e1430', eye='#6ef6ff', eye_top='#2a7ad8',
                     blush='#7a9ae8', sclera='#e8f0fa', tongue='#c88ab8', catch='#ffffff',
                     crystal=('#7ad8ff', '#a8e8ff', '#5cc4f8'), hair='#6fa4e6', hair2='#6496d8', under='#3e5a9a',
                     root='#84c4f4', tip='#e8f6ff', cap='#84c4f4'),
}

# ------------------------------------------------------------------ math
def spow(x, p): return math.copysign(abs(x) ** p, x)
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
rad = math.radians

# ------------------------------------------------------------------ dimensions (m; Blender: front -Y, ground z = 0 after the shift)
HC = Vector((0.0, 0.025, 0.470))           # head centre (= the crown pivot: the cap slides on the ball, never sinks)
HA, HB, HCZ = 0.280, 0.240, 0.255          # head semi-axes: a wide mochi ball (0.56 m across the cheeks, before GS)
HCZ_LO = 0.18                              # the lower half is flatter: a broad chin that sits on the body
BY = -0.02                                 # the torso / tail axis sits a touch in front of the head centre (the sheet's side)
ARM_P = Vector((0.0, BY, 0.262))            # the shoulder line (arms pivot)
TAIL_P = Vector((0.0, BY, 0.084))          # the curl root, inside the body's bottom tip (tail pivot)
GS = 1.020                                 # final uniform scale: 0.92 m crown tip to tail bottom (the brief / the sheet's 0.40 m bar)

def hdir(th, ph):
    """unit direction from the head centre: th elevation, ph azimuth (0 = front -Y, +90 = +X, 180 = back)"""
    return Vector((math.cos(th) * math.sin(ph), -math.cos(th) * math.cos(ph), math.sin(th)))
def head_k(zr):
    """the mochi taper: the head's top is a little narrower than its cheeks (zr = height over the centre / HCZ)"""
    return 1.0 - 0.26 * smooth(-0.2, 1.0, zr)
def head_F(p):
    d = p - HC; cz = HCZ if d.z > 0 else HCZ_LO; k = head_k(d.z / cz)
    return (d.x / (HA * k)) ** 2 + (d.y / (HB * k)) ** 2 + (d.z / cz) ** 2
def head_r(d):
    lo, hi = 0.05, 0.6
    for _ in range(40):
        mid = (lo + hi) / 2
        if head_F(HC + d * mid) < 1: lo = mid
        else: hi = mid
    return (lo + hi) / 2
def head_n(p):
    e = 1e-4
    v = Vector(((head_F(p + X * e) - head_F(p - X * e)), (head_F(p + Y * e) - head_F(p - Y * e)), (head_F(p + Z * e) - head_F(p - Z * e))))
    return v.normalized() if v.length > 1e-12 else Z.copy()
def head_P(eta, om):
    k = head_k(math.sin(eta)); cz = HCZ if eta > 0 else HCZ_LO
    return HC + Vector((HA * k * math.cos(eta) * math.cos(om), HB * k * math.cos(eta) * math.sin(om), cz * math.sin(eta)))

# ------------------------------------------------------------------ mesh accumulator
class Part:
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
        self.f.append(list(idx)); self.fc.append(col)
    def close_piece(self, f0):
        """orient a closed piece outward: flip it if its signed volume is negative"""
        vol = 0.0
        for f in self.f[f0:]:
            p0 = self.v[f[0]]
            for i in range(1, len(f) - 1):
                vol += p0.dot(self.v[f[i]].cross(self.v[f[i + 1]]))
        if vol < 0:
            for i in range(f0, len(self.f)): self.f[i] = list(reversed(self.f[i]))
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

def closed_grid(m, rows, pole0, pole1, colf):
    """a closed surface from rings (each K points, consistently ordered) + two poles; colf(j, k): j = -1 pole0 fan,
    0..n-2 the bands, n-1 the pole1 fan. Oriented outward by volume."""
    f0 = len(m.f)
    ids = [[m.vert(p) for p in r] for r in rows]
    K = len(rows[0]); n = len(rows)
    if pole0 is not None:
        pi = m.vert(pole0)
        for k in range(K): m.face([pi, ids[0][(k + 1) % K], ids[0][k]], colf(-1, k))
    for j in range(n - 1):
        for k in range(K):
            m.face([ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]], colf(j, k))
    if pole1 is not None:
        pi = m.vert(pole1)
        for k in range(K): m.face([pi, ids[-1][k], ids[-1][(k + 1) % K]], colf(n - 1, k))
    m.close_piece(f0)
    return ids

def lathe(m, axis_xy, prof, K, colf, phase=0.0):
    """prof: [(r, z)] top to bottom; r == 0 at an end = a pole"""
    ax, ay = axis_xy
    rows, p0, p1 = [], None, None
    for i, (r, z) in enumerate(prof):
        if r <= 1e-6:
            if i == 0: p0 = Vector((ax, ay, z))
            else: p1 = Vector((ax, ay, z))
            continue
        rows.append([Vector((ax + r * math.cos(2 * math.pi * k / K + phase), ay + r * math.sin(2 * math.pi * k / K + phase), z)) for k in range(K)])
    return closed_grid(m, rows, p0, p1, colf)

def frames_along(path):
    T = [(path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized() for i in range(len(path))]
    ref = Y if abs(T[0].dot(Y)) < 0.9 else X
    Nv = (ref - T[0] * ref.dot(T[0])).normalized(); out = []
    for t in T:
        Nv = (Nv - t * Nv.dot(t)).normalized(); out.append((t, Nv, t.cross(Nv)))
    return out

def tube(m, path, radii, K, colf):
    fr = frames_along(path); rows = []
    for p, r, (t, nv, bv) in zip(path, radii, fr):
        rows.append([p + (nv * math.cos(2 * math.pi * k / K) + bv * math.sin(2 * math.pi * k / K)) * r for k in range(K)])
    p0 = path[0] - fr[0][0] * radii[0] * 0.9
    p1 = path[-1] + fr[-1][0] * radii[-1] * 0.95
    closed_grid(m, rows, p0, p1, colf)

def catmull(pts, n):
    out = []
    P = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    segs = len(pts) - 1
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

def ellipsoid(m, c, ax, ay, az, K, R, colf):
    rows = []
    for j in range(1, R + 1):
        eta = math.pi / 2 - math.pi * j / (R + 1)
        rows.append([c + ax * (math.cos(eta) * math.cos(2 * math.pi * k / K)) + ay * (math.cos(eta) * math.sin(2 * math.pi * k / K)) + az * math.sin(eta) for k in range(K)])
    closed_grid(m, rows, c + az, c - az, colf)

# ------------------------------------------------------------------ the petal: a thick lens slab along a spine, rounded tip,
# white tip patch whose zigzag border runs along its own ring (crisp vertex-colour border)
def zig(c, amp):
    """the white patch's border, as an offset toward the root: a tall centre point and two small side points"""
    a = abs(c)
    return -amp * (0.62 * max(0.0, 1 - a / 0.40) + 0.40 * max(0.0, 1 - abs(a - 0.80) / 0.22))

def petal(m, S, frame, wfn, tofn, tifn, ringfns, colf, K=12, ex=0.92, tip_ext=0.85, root_ext=0.5):
    rows = []
    for rf in ringfns:
        row = []
        for k in range(K):
            a = 2 * math.pi * k / K; c, sn = math.cos(a), math.sin(a)
            s = rf(c); P0 = S(s); T, L, N = frame(s)
            row.append(P0 + L * (wfn(s) * spow(c, ex)) + N * ((tofn(s) if sn >= 0 else tifn(s)) * spow(sn, ex)))
        rows.append(row)
    s0, s1 = ringfns[0](0.0), ringfns[-1](0.0)
    T0 = frame(s0)[0]; T1 = frame(s1)[0]
    p0 = S(s0) - T0 * (root_ext * min(wfn(s0), tofn(s0)))
    p1 = S(s1) + T1 * (tip_ext * 0.5 * (wfn(s1) + tofn(s1)))
    closed_grid(m, rows, p0, p1, colf)

def outer_k(k, K=12): return math.sin(2 * math.pi * (k + 0.5) / K) > 0

# ------------------------------------------------------------------ body: head ball, torso, face
OMS, ETS = 22, 13
def build_head(m, V):
    body, shade = hexc(V['body']), hexc(V['shade'])
    capc = hexc(V['cap'])
    oms = [2 * math.pi * k / OMS + math.pi / OMS for k in range(OMS)]
    JH = 3                                   # the head row that runs along the hairline (just under the cap's edge)
    def eta_of(j, k):
        eh = cap_edge(oms[k] + math.pi / 2) - HAIR_UNDER
        if j < JH: return math.pi / 2 - (math.pi / 2 - eh) * j / JH
        if j == JH: return eh
        return math.pi / 2 - math.pi * j / ETS
    rows = []
    for j in range(1, ETS):
        rows.append([head_P(eta_of(j, k), oms[k]) for k in range(OMS)])
    def colf(j, k):
        if j < JH - 1: return capc           # (rows[0] is row j = 1: bands -1..JH-2 lie above the hairline row)
        jj = clamp(j, 0, len(rows) - 1)
        p = (rows[int(jj)][k] + rows[int(jj)][(k + 1) % OMS]) / 2
        n = head_n(p)
        return safe_mix(body, shade, 0.30 * smooth(-0.25, -0.95, n.z) + 0.10 * smooth(0.2, 0.9, n.y))
    tmp = Part('tmp')
    closed_grid(tmp, rows, HC + Z * HCZ, HC - Z * HCZ_LO, colf)
    bvh = BVHTree.FromPolygons([v.copy() for v in tmp.v], [list(f) for f in tmp.f])
    f0 = len(m.v)
    closed_grid(m, rows, HC + Z * HCZ, HC - Z * HCZ_LO, colf)
    for i in range(f0, len(m.v)): m.n[i] = head_n(m.v[i])     # analytic normals: a perfectly smooth ball
    return bvh

def build_torso(m, V):
    body, shade = hexc(V['body']), hexc(V['shade'])
    prof = [(0.0, 0.40), (0.096, 0.37), (0.110, 0.32), (0.118, 0.275), (0.128, 0.225), (0.134, 0.180), (0.130, 0.140),
            (0.112, 0.106), (0.086, 0.082), (0.058, 0.066), (0.036, 0.058), (0.018, 0.054), (0.0, 0.052)]
    tones = [0.0, 0.0, 0.0, 0.03, 0.07, 0.12, 0.18, 0.26, 0.36, 0.46, 0.55, 0.55, 0.55]
    lathe(m, (0.0, BY), prof, 16, lambda j, k: safe_mix(body, shade, tones[max(0, j)] + (0.05 if k >= 8 else 0.0)))

class Decal:
    def __init__(self, bvh, C):
        self.bvh = bvh; self.C = C; self.N = head_n(C)
        self.T = (X - self.N * X.dot(self.N)).normalized(); self.B = self.N.cross(self.T)
    def at(self, u, v, h):
        P0 = self.C + self.T * u + self.B * v
        hit = self.bvh.ray_cast(P0 + self.N * 0.25, -self.N, 1.0)
        p = hit[0] if hit[0] is not None else P0
        n = head_n(p)
        return p + n * h, n

def front_point(bvh, x, z):
    return bvh.ray_cast(Vector((x, -1.0, z)), Y, 3.0)[0]

def polar_decal(m, D, c2, bnd, rings, S, hfn, colf, th0=0.0):
    def mk(u, v, f):
        p, n = D.at(u, v, hfn(u, v, f)); return m.vert(p, n), n
    ci, cn = mk(c2[0], c2[1], 0.0)
    ids, ns = [], []
    for f in rings:
        row, rn = [], []
        for k in range(S):
            th = th0 + 2 * math.pi * k / S; du, dv = bnd(th)
            i, n = mk(c2[0] + f * du, c2[1] + f * dv, f); row.append(i); rn.append(n)
        ids.append(row); ns.append(rn)
    for k in range(S):
        m.face([ci, ids[0][k], ids[0][(k + 1) % S]], colf(0, k), ns[0][k])
    for j in range(len(rings) - 1):
        for k in range(S):
            m.face([ids[j][k], ids[j][(k + 1) % S], ids[j + 1][(k + 1) % S], ids[j + 1][k]], colf(j + 1, k), ns[j][k])

def band_decal(m, D, A, B, hfn, colf):
    ia, ib, na = [], [], []
    for (ua, va), (ub, vb) in zip(A, B):
        p, n = D.at(ua, va, hfn(ua, va)); ia.append(m.vert(p, n)); na.append(n)
        p, n = D.at(ub, vb, hfn(ub, vb)); ib.append(m.vert(p, n))
    for i in range(len(A) - 1):
        m.face([ia[i], ia[i + 1], ib[i + 1], ib[i]], colf(i), na[i])

def ell(a, b, rot=0.0):
    cr, sr = math.cos(rot), math.sin(rot)
    return lambda th: (a * math.cos(th) * cr - b * math.sin(th) * sr, a * math.cos(th) * sr + b * math.sin(th) * cr)

EYE_X, EYE_Z = 0.138, 0.484
def build_eye(m, bvh, side, V):
    C = front_point(bvh, side * EYE_X, EYE_Z); D = Decal(bvh, C)
    so = side; c = hexc
    sa, sb = 0.064, 0.073                      # the eye (sclera) semi-axes
    def q_of(u, v): return (u / sa) ** 2 + (v / sb) ** 2
    def dome(u, v): return 0.0025 * max(0.0, 1 - q_of(u, v))
    lay = lambda base: (lambda u, v, f=None: base + dome(u, v))
    polar_decal(m, D, (0, 0), ell(sa, sb), [1.0], 20, lay(0.0012), lambda j, k: c(V['sclera']))
    # iris: shifted toward the nose (a white crescent shows on the outer side), cyan, a deeper blue top
    ic = (-so * 0.0090, -0.001); ia, ib = 0.0528, 0.0672
    polar_decal(m, D, ic, ell(ia, ib), [0.55, 1.0], 20, lay(0.0026), lambda j, k: c(V['eye']))
    def crescent(th0, th1, tmax, n, h, col):
        A, B = [], []
        for i in range(n + 1):
            th = math.radians(th0 + (th1 - th0) * i / n)
            ox, oy = ia * math.cos(th), ib * math.sin(th)
            t = tmax * math.sin(math.pi * i / n) ** 0.8
            A.append((ic[0] + ox, ic[1] + oy)); B.append((ic[0] + ox * (1 - t), ic[1] + oy * (1 - t)))
        band_decal(m, D, A, B, lambda u, v: h + dome(u, v), lambda i: col)
    crescent(6, 174, 0.34, 12, 0.0034, c(V['eye_top']))
    # the dark pupil (reads at distance), then the catchlights: big upper-left, small lower-right (the same on both eyes)
    pc = (ic[0], ic[1] + 0.006)
    polar_decal(m, D, pc, ell(0.0235, 0.0310), [1.0], 14, lay(0.0042), lambda j, k: c(V['dark']))
    polar_decal(m, D, (ic[0] - 0.0175, ic[1] + 0.0230), ell(0.0150, 0.0172), [1.0], 12, lay(0.0050), lambda j, k: c(V['catch']))
    polar_decal(m, D, (ic[0] + 0.0190, ic[1] - 0.0255), ell(0.0076, 0.0076), [1.0], 8, lay(0.0050), lambda j, k: c(V['catch']))
    # the thick upper lash line: inner top, over the top, down the outer side
    def lash_h(u, v):
        inside = max(0.0, min(1.0, (1.12 - math.sqrt(q_of(u, v))) / 0.22))
        return 0.0020 + 0.0040 * inside + dome(u, v)
    A, B = [], []; n = 14
    for i in range(n + 1):
        t = i / n; th = math.radians(128 - 140 * t)
        cu_, sv = math.cos(th), math.sin(th)
        px, py = so * sa * cu_, sb * sv
        nx, ny = so * cu_ / sa, sv / sb; ln = math.hypot(nx, ny); nx, ny = nx / ln, ny / ln
        w = 0.0030 + 0.0062 * smooth(0.0, 0.62, t) - 0.0058 * smooth(0.80, 1.0, t)
        ins = 0.0050 * (0.5 + 0.5 * math.sin(math.pi * min(1, t)))
        A.append((px - nx * ins, py - ny * ins)); B.append((px + nx * w, py + ny * w))
    band_decal(m, D, A, B, lash_h, lambda i: c(V['dark']))
    # two outer flicks
    for th_d, ang_d, ln_, w0 in ((42, 62, 0.017, 0.0046), (14, 28, 0.015, 0.0042)):
        th = math.radians(th_d); px, py = so * sa * math.cos(th), sb * math.sin(th)
        d = (so * math.cos(math.radians(ang_d)), math.sin(math.radians(ang_d))); pn = (-d[1], d[0])
        A, B = [], []
        for i in range(4):
            t = i / 3; cx, cy = px - d[0] * 0.004 + d[0] * ln_ * t, py - d[1] * 0.004 + d[1] * ln_ * t + 0.002 * t * t
            hw = w0 * (1 - t) ** 0.7 + 0.0012
            A.append((cx + pn[0] * hw, cy + pn[1] * hw)); B.append((cx - pn[0] * hw, cy - pn[1] * hw))
        band_decal(m, D, A, B, lash_h, lambda i: c(V['dark']))

def build_face(m, bvh, V):
    for side in (-1, 1): build_eye(m, bvh, side, V)
    # the little "o" mouth: a dark oval, a pink tongue in its lower half
    D = Decal(bvh, front_point(bvh, 0.0, 0.414))
    polar_decal(m, D, (0, 0), ell(0.0160, 0.0210), [0.6, 1.0], 12, lambda u, v, f: 0.0016, lambda j, k: hexc(V['dark']))
    polar_decal(m, D, (0.0, -0.0090), ell(0.0095, 0.0068), [1.0], 10, lambda u, v, f: 0.0026, lambda j, k: hexc(V['tongue']))
    for side in (-1, 1):
        D = Decal(bvh, front_point(bvh, side * 0.182, 0.410))
        polar_decal(m, D, (0, 0), ell(0.031, 0.021, side * 0.05), [1.0], 12, lambda u, v, f: 0.0018, lambda j, k: hexc(V['blush']))

# ------------------------------------------------------------------ crown: cap, locks, crystals
def cap_edge(ph):
    """the hairline (parametric latitude on the head) round the head: 52 deg over the forehead, lower toward the back"""
    return rad(52) - rad(24) * (1 - math.cos(ph)) / 2
HAIR_UNDER = rad(2.5)                      # the head itself is hair-coloured down to this far below the cap's crossing

def build_cap(m, V):
    """a shell over the head top; its edge doesn't roll under (a back-facing rim draws an ink line in the game): the
    outer surface runs on down and sinks smoothly into the head, so no part of it ever faces away from the camera"""
    capc = hexc(V['cap'])
    K = 20
    def P(eta, ph, off): q = head_P(eta, ph - math.pi / 2); return q + head_n(q) * off
    ce = lambda k: cap_edge(2 * math.pi * k / K)
    rows = []
    for f in (0.22, 0.5, 0.78):
        rows.append([P(rad(90) - f * (rad(90) - ce(k)), 2 * math.pi * k / K, 0.024) for k in range(K)])
    rows.append([P(ce(k) + rad(3), 2 * math.pi * k / K, 0.016) for k in range(K)])
    rows.append([P(ce(k) - rad(3), 2 * math.pi * k / K, -0.012) for k in range(K)])
    rows.append([P(ce(k) - rad(8), 2 * math.pi * k / K, -0.040) for k in range(K)])
    rows.append([P(ce(k) + rad(4), 2 * math.pi * k / K, -0.060) for k in range(K)])
    top = HC + Z * (HCZ + 0.024); inner = HC + Z * (HCZ - 0.07)
    closed_grid(m, rows, top, inner, lambda j, k: capc)

LOCKS = [
    # (phi0, phi1, th0, th1, R (max lobe radius), flare, lift (extra offset), tip border s, layer)
    # phi: 0 front, +90 = +X; th: elevation from the head centre. Round "chunky icicle" lobes: thin at the root,
    # swelling to R at 60 %, tapering to a blunt round tip; a pale-ice tip patch on one straight ring.
    (64, 60, 68, 24, 0.042, 0.008, 0.000, 0.76, 1),      # temple locks (frame the face, tips by the outer eye corners)
    (74, 84, 52, -22, 0.060, 0.000, 0.000, 0.82, 1),     # the long side locks
    (102, 114, 54, -14, 0.060, 0.020, 0.000, 0.82, 1),   # side-back
    (136, 146, 54, -8, 0.062, 0.040, 0.000, 0.80, 1),    # upper back (the sheet's top tier)
    (88, 94, 40, -24, 0.056, 0.040, -0.016, 0.84, 2),    # lower tier (under the upper one, longer)
    (120, 126, 40, -24, 0.060, 0.060, -0.016, 0.84, 2),
    (158, 162, 36, -24, 0.060, 0.070, -0.016, 0.84, 2),
]
def build_lock(m, V, ph0, ph1, th0, th1, R, flare, lift, sb, layer):
    ph0, ph1, th0, th1 = rad(ph0), rad(ph1), rad(th0), rad(th1)
    def prof(s):
        # slim while it runs over the sloping top (a fat lobe there widens the dome), swelling where it hangs
        if s < 0.78: return 0.36 + 0.64 * smooth(0.22, 0.78, s)
        u = (s - 0.78) / 0.22; return 0.46 + 0.54 * max(0.0, 1 - u * u) ** 0.6
    def S(s):
        s = clamp(s, -0.05, 1.05)
        # the spine runs down the head on its parametric latitude (an even, steady descent; a direction-based
        # elevation ran the locks out sideways over the mochi head's flat top), offset along the surface normal
        P = head_P(th0 + (th1 - th0) * s, ph0 + (ph1 - ph0) * s - math.pi / 2)
        sink = 0.036 * (1 - smooth(0.0, 0.45, s))     # the root emerges from under the cap, so the dome stays round
        return P + head_n(P) * (0.80 * R * prof(clamp(s)) + 0.006 + lift - sink + flare * max(0.0, s) ** 1.7)
    def frame(s):
        e = 0.01; T = (S(s + e) - S(s - e)).normalized()
        ph = ph0 + (ph1 - ph0) * s; E = Vector((math.cos(ph), math.sin(ph), 0))
        L = (E - T * E.dot(T)).normalized(); N = T.cross(L)
        return T, L, N
    wfn = lambda s: R * prof(s) * 1.22            # plump: a round lobe, a little wider than deep
    tofn = lambda s: R * prof(s)
    tifn = lambda s: R * prof(s) * 0.80
    rings = [lambda c: 0.04, lambda c: 0.30, lambda c: 0.60, lambda c: sb, lambda c: (sb + 0.965) / 2, lambda c: 0.965]
    JB = 3                                        # the tip border ring
    hair = hexc(V['hair'] if layer == 1 else V['hair2']); under = hexc(V['under']); tip = hexc(V['tip'])
    root = hexc(V['root']) if V['root'] else None
    def colf(j, k):
        if j >= JB: return tip
        if not outer_k(k, 12): return under
        if root is not None and j <= 1: return root
        return hair
    if DEBUG and abs(ph0 - rad(74)) < 1e-6:
        for ss in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
            q = S(ss); print('TSU spine s %.1f  x %.3f y %.3f z %.3f  w %.3f to %.3f' % (ss, q.x, q.y, q.z, wfn(ss), tofn(ss)))
    petal(m, S, frame, wfn, tofn, tifn, rings, colf, K=12, ex=1.0, tip_ext=1.0)

def build_locks(m, V):
    for ph0, ph1, th0, th1, R, fl, lift, sb, layer in LOCKS:
        for s in (-1, 1):
            v0 = len(m.v)
            build_lock(m, V, s * ph0, s * ph1, th0, th1, R, fl, lift, sb, layer)
            if DEBUG and s == 1:
                for z0 in (0.56, 0.61, 0.66):
                    xs = [v.x for v in m.v[v0:] if abs(v.z - z0) < 0.012]
                    print('TSU lock', ph0, 'z', z0, 'max x %.3f' % max(xs) if xs else '-')
    build_lock(m, V, 180, 180, 56, -6, 0.066, 0.045, 0.000, 0.80, 1)     # the back centre lock (the sheet's back view)

def crystal(m, base, up, H, R, cols, twist=0.0):
    up = up.normalized(); a = (X - up * X.dot(up)).normalized(); b = up.cross(a)
    def ring(h, r): return [base + up * h + (a * math.cos(2 * math.pi * k / 6 + twist) + b * math.sin(2 * math.pi * k / 6 + twist)) * r for k in range(6)]
    rows = [ring(-0.02, R * 0.80), ring(0.30 * H, R), ring(0.64 * H, R), ring(0.975 * H, R * 0.10)]
    light, mid, deep = (hexc(c) for c in cols)
    side = [light, mid, deep, mid, light, deep]
    def colf(j, k):
        if j == 2: return light if k in (0, 4) else (mid if k in (1, 3) else mixc(mid, light, 0.5))   # the point: lighter facets
        if j >= 3: return light
        return side[k]
    closed_grid(m, rows, base + up * (-0.03), base + up * H, colf)

def build_crystals(m, V):
    top = HC.z + HCZ + 0.020
    cols = V['crystal']
    crystal(m, Vector((0.0, 0.020, top)), Vector((0, 0.05, 1)), 0.140, 0.054, cols, twist=rad(8))
    for s in (-1, 1):
        crystal(m, Vector((s * 0.076, 0.028, top - 0.012)), Vector((s * 0.50, 0.06, 1)), 0.104, 0.043, cols, twist=rad(-s * 10))
    crystal(m, Vector((0.0, 0.090, top - 0.016)), Vector((0, 0.55, 1)), 0.095, 0.036, cols, twist=rad(20))
    crystal(m, Vector((0.0, -0.050, top - 0.010)), Vector((0, -0.45, 1)), 0.078, 0.030, cols, twist=rad(0))

# ------------------------------------------------------------------ arms (joint caps + stubby icicle petals)
def build_arms(m, V):
    """stubby round icicle arms (round cross-section, 7-8 cm thick, a blunt round tip), down and a little forward;
    each rooted in a joint cap that is round about the X axis (no gap when the game pitches them)"""
    hair = hexc(V['hair']); tip = hexc(V['tip']); joint = hexc(V['joint'])
    pale = safe_mix(hexc(V['body']), hair, 0.40)
    for s in (-1, 1):
        ellipsoid(m, ARM_P + Vector((s * 0.112, 0, 0)), Z * 0.043, Y * 0.043, X * 0.028, 10, 3, lambda j, k: joint)
        root = ARM_P + Vector((s * 0.100, 0, 0))
        d = Vector((s * 0.62, -0.36, -0.70)).normalized(); L = 0.132
        def S(t, root=root, d=d): return root + d * (L * t) + Vector((0, 0, -0.010 * t * t))
        def frame(t, S=S):
            e = 0.01; T = (S(t + e) - S(t - e)).normalized()
            Lv = Y.cross(T).normalized(); N = -T.cross(Lv)
            return T, Lv, N
        def rfn(t):                       # swelling a little, then a blunt round end (no point)
            if t < 0.5: return 0.034 + 0.008 * smooth(0.0, 0.5, t)
            u = (t - 0.5) / 0.5; return 0.026 + 0.016 * max(0.0, 1 - u * u) ** 0.5
        sb = 0.64
        rings = [lambda c: 0.04, lambda c: 0.22, lambda c: 0.46, lambda c: sb, lambda c: (sb + 0.965) / 2, lambda c: 0.965]
        def colf(j, k):
            if j >= 3: return tip
            if j >= 1: return hair
            return pale
        petal(m, S, frame, rfn, rfn, rfn, rings, colf, K=10, ex=1.0, tip_ext=1.0)

# ------------------------------------------------------------------ tail: lower ghost body + the curl
CURL_D = Vector((math.cos(rad(16)), math.sin(rad(16)), 0.0))   # the curl's plane: to the right (+X) and a little back
def build_tail(m, V):
    shade = hexc(V['shade'])
    uc, zc = 0.150, 0.098                          # the spiral: round, about 1 turn, closing in on its centre
    uz = [(0.0, TAIL_P.z), (0.030, 0.046)]
    for i in range(9):
        a = math.radians(-112 + 272 * i / 8); r = 0.080 - 0.040 * (i / 8)
        uz.append((uc + r * math.cos(a), zc + r * math.sin(a)))
    pts = [Vector((0.0, BY, 0.0)) + CURL_D * u + Z * z for u, z in uz]
    path = catmull(pts, 17)
    radii = [0.046 - 0.022 * (i / (len(path) - 1)) ** 0.85 for i in range(len(path))]
    tube(m, path, radii, 8, lambda j, k: shade)

# ------------------------------------------------------------------ assemble one variant
def make_material():
    mt = bpy.data.materials.new('toon'); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    return mt

def to_object(part, origin, mat):
    part.finish_normals()
    me = bpy.data.meshes.new(part.name)
    me.from_pydata([v - origin for v in part.v], [], part.f)
    me.update()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cols = []
    for f, c in zip(me.polygons, part.fc): cols.extend([c] * f.loop_total)
    attr.data.foreach_set('color', [x for c in cols for x in c])
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    me.materials.append(mat)
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in part.n])
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = origin
    return ob

def build_variant(key):
    V = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    P = {n: Part(n) for n in ('body', 'crown', 'arms', 'tail')}
    counts = {}
    def step(nm, fn, prt):
        t0 = P[prt].tris(); r = fn(); counts[nm] = P[prt].tris() - t0; return r
    bvh = step('head', lambda: build_head(P['body'], V), 'body')
    step('torso', lambda: build_torso(P['body'], V), 'body')
    step('face', lambda: build_face(P['body'], bvh, V), 'body')
    step('cap', lambda: build_cap(P['crown'], V), 'crown')
    step('locks', lambda: build_locks(P['crown'], V), 'crown')
    step('crystals', lambda: build_crystals(P['crown'], V), 'crown')
    step('arms', lambda: build_arms(P['arms'], V), 'arms')
    step('tail', lambda: build_tail(P['tail'], V), 'tail')
    print('TSU %s piece tris %s' % (key, counts))
    minz = min(v.z for p in P.values() for v in p.v)
    for p in P.values():
        for v in p.v: v.z -= minz
    sh = Vector((0, 0, minz))
    for p in P.values():
        for v in p.v: v *= GS
    piv = {'body': Vector((0, 0, 0)), 'crown': (HC - sh) * GS, 'arms': (ARM_P - sh) * GS, 'tail': (TAIL_P - sh) * GS}
    for n, p in P.items(): to_object(p, piv[n], mat)
    allv = [v for p in P.values() for v in p.v]
    lo = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
    hi = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
    tot = sum(p.tris() for p in P.values())
    print('TSU %s tris %s total %d | W%.3f D%.3f H%.3f (x %.3f..%.3f y %.3f..%.3f) | minz shift %.4f' % (
        key, {n: p.tris() for n, p in P.items()}, tot, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.x, hi.x, lo.y, hi.y, minz))
    print('TSU %s pivots %s' % (key, {n: tuple(round(c, 4) for c in v) for n, v in piv.items()}))
    name = 'tsurara' if key == 'base' else 'tsurara_' + key
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('TSU export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('TSU wrote', out)

for key in VARIANTS:
    if ONLY and key != ONLY: continue
    build_variant(key)
