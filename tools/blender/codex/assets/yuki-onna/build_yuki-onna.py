# Yuki-onna (Pawhaven boss, ROADMAP EN-1) -- Option A "Frost Princess" (refs/sheet.png).
# Deterministic build, from an empty scene, of public/models/yuki-onna.glb:
#   blender --background --factory-startup --python build_yuki-onna.py
# Boss contract: flat rigid named parts, origin = pivot (model units, Blender coords, front -Y), rotation 0, scale 1,
# vertex colours only (attribute `Col`, face corners), materials `toon` + `glow`. No rig, no textures, no UVs.
#   body    kimono (+ train), obi + cord, crystal brooch, the big back bow, tabi feet, snowflake patches   (0, 0, 0)
#   head    skull, neck, ears, hair cap + blunt bangs, hime side locks, ice tiara, snowflake kanzashi   (0, 0, 0.87)
#   face    eyes, lashes, nose, smile, blush (shallow shells over the skull)                             (0, 0, 0.87)
#   lids    closed eyelids (blink / meditation)                                                        (0, 0, 0.87)
#   mouthO  the breath's "o" mouth (scaled 0 -> 1)                                                     (0, 0, 0.87)
#   puff    the breath's puffed cheeks (scaled 0 -> 1)                                                 (0, 0, 0.87)
#   hairB   the long back hair curtain (sways about X)                                                 (0, 0.05, 1.0)
#   slR/slL each furisode sleeve + hand                                                                (+-0.172, 0, 0.725)
#   shawl   the floating hagoromo ribbon                                                               (0, 0, 0.7)
# Parts the game turns at idle (sleeves (-0.22, 0, +-0.06), hairB x 0.05, shawl x 0.08) are built in the sheet's pose
# and then rotated back by that idle amount about their pivot, so the game's idle reproduces the sheet.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
print('YUKI build pid', os.getpid())

# ------------------------------------------------------------------ colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t):
    if isinstance(a, str): a = hexc(a)
    if isinstance(b, str): b = hexc(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))
def lit_glow(c):   # the game's crystal test (YUKI_OUT, on linear vertex colours)
    return c[1] > 0.7 and c[2] > 0.85 and c[0] < 0.82 and c[2] - c[0] > 0.18

# The sheet's palette (sRGB). Pale blues are nudged out of the glow box (g > .7, b > .85, r < .82, b - r > .18):
# the sheet's #DBF1F8 pale ice -> #e4eff8, #BCEBF4 shawl -> #a9d6f0, the light band keeps g <= 0xd8.
PAL = dict(ivory='#fff6ea', pale='#e4eff8', light='#b6d8f2', main='#8ccaee', deep='#6db4e2', stripe='#f7faff',
           flake='#f8fbff', collar='#b9d9f1', inner='#94c4e8',
           obi='#86c8ee', obi_e='#a6d6f2', cord='#5eaee2', bow='#7fc2ee', bow_d='#5fa8dc', knot='#68b4e6',
           crys='#9be3fb', crys_l='#c6f2ff', crys_d='#6edcf9',
           skin='#f8e4da', skin_d='#eed0c4', ear_in='#efc3b6', blush='#f2a3ae', nose='#e8b0a2',
           hair='#22233a', hair_p='#2d3250',
           white='#fff6ea', eye_rim='#16476f', iris='#2466ac', iris_d='#1b4b8c', iris_l='#4d92dc', pupil='#1a2348',
           catch='#ffffff', lash='#232235', mouth='#b85a5c', mouth_o='#6a2a46', tongue='#e07a8a',
           tabi='#f4f1f6', shawl='#a9d6f0', shawl_d='#93c3e6')
C = {k: hexc(v) for k, v in PAL.items()}

# ------------------------------------------------------------------ math
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(a, b, x):
    t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def sgnpow(v, e): return math.copysign(abs(v) ** e, v)
def rad(d): return math.radians(d)
def three_rot(rx, ry, rz):
    """a three.js Euler XYZ rotation as a Blender-space matrix (three x = X, three y = Z, three z = -Y)"""
    return Matrix.Rotation(rx, 3, 'X') @ Matrix.Rotation(ry, 3, 'Z') @ Matrix.Rotation(-rz, 3, 'Y')

def catmull(pts, n):
    P = [pts[0] + (pts[0] - pts[1])] + list(pts) + [pts[-1] + (pts[-1] - pts[-2])]; segs = len(pts) - 1
    out = []
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out
def resample(poly, n, closed=False):
    pts = list(poly) + ([poly[0]] if closed else [])
    L = [0.0]
    for i in range(1, len(pts)): L.append(L[-1] + (pts[i] - pts[i - 1]).length)
    tot = L[-1]; out = []; j = 0
    for k in range(n):
        s = tot * k / (n if closed else n - 1)
        while j < len(L) - 2 and L[j + 1] < s: j += 1
        t = (s - L[j]) / max(1e-12, L[j + 1] - L[j]); out.append(pts[j].lerp(pts[j + 1], t))
    return out
def chaikin(poly, it):
    for _ in range(it):
        q = []
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            q += [a.lerp(b, 0.25), a.lerp(b, 0.75)]
        poly = q
    return poly

# ------------------------------------------------------------------ mesh accumulator
class Part:
    def __init__(self, name, pivot):
        self.name = name; self.pivot = Vector(pivot); self.v = []; self.f = []; self.fc = []; self.fm = []
    def vert(self, p): self.v.append(Vector(p)); return len(self.v) - 1
    def add(self, idx, col, mat=0):
        cols = col if isinstance(col, list) else [col] * len(idx)
        self.f.append(list(idx)); self.fc.append(cols); self.fm.append(mat)
    def face(self, idx, col, hint, mat=0):
        P = [self.v[i] for i in idx]
        nn = Vector((0, 0, 0))
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        if nn.dot(hint) < 0: idx = list(reversed(idx))
        self.add(idx, col, mat)
    def tris(self): return sum(len(f) - 2 for f in self.f)

def grid(rings, pole0=None, pole1=None, wrap=False):
    V, F = [], []
    K = len(rings[0]); R = len(rings)
    for ring in rings: V.extend(Vector(p) for p in ring)
    for j in range(R - 1 + (1 if wrap else 0)):
        j1 = (j + 1) % R
        for k in range(K):
            F.append([j * K + k, j * K + (k + 1) % K, j1 * K + (k + 1) % K, j1 * K + k])
    if pole0 is not None:
        V.append(Vector(pole0)); p = len(V) - 1
        for k in range(K): F.append([p, (k + 1) % K, k])
    if pole1 is not None:
        V.append(Vector(pole1)); p = len(V) - 1; b = (R - 1) * K
        for k in range(K): F.append([p, b + k, b + (k + 1) % K])
    return V, F

def ellipsoid(c, ax, ay, az, K, R, deform=None):
    rings = []
    for j in range(1, R + 1):
        eta = -math.pi / 2 + math.pi * j / (R + 1)
        rings.append([c + ax * (math.cos(eta) * math.cos(2 * math.pi * k / K)) + ay * (math.cos(eta) * math.sin(2 * math.pi * k / K)) + az * math.sin(eta) for k in range(K)])
    V, F = grid(rings, c - az, c + az)
    if deform: V = [deform(v) for v in V]
    return V, F

def levelcut(bm, fn):
    """cut the mesh along fn = 0 (new verts on the crossing edges, faces split between them): colour borders on edges"""
    lv = bm.verts.layers.float.get('lsv') or bm.verts.layers.float.new('lsv')
    lz = bm.verts.layers.int.get('lsz') or bm.verts.layers.int.new('lsz')
    for v in bm.verts:
        a = fn(v.co)
        if abs(a) < 1e-9: a = 1e-9
        v[lv] = a; v[lz] = 0
    for e in list(bm.edges):
        v0, v1 = e.verts; a, b = v0[lv], v1[lv]
        if a * b < 0:
            t = a / (a - b); p = v0.co.lerp(v1.co, t)
            ne, nv = bmesh.utils.edge_split(e, v0, t)
            nv.co = p; nv[lv] = 0.0; nv[lz] = 1
    changed = True; guard = 0
    while changed and guard < 8:
        changed = False; guard += 1
        for f in list(bm.faces):
            if not f.is_valid: continue
            vs = [l.vert for l in f.loops]; n = len(vs)
            zs = [i for i, v in enumerate(vs) if v[lz]]
            if len(zs) < 2: continue
            for k in range(len(zs)):
                i, j = zs[k], zs[(k + 1) % len(zs)]
                if (j - i) % n >= 2 and (i - j) % n >= 2:
                    try:
                        bmesh.utils.face_split(f, vs[i], vs[j]); changed = True
                    except Exception: pass
                    break

def emit(part, V, F, colfn, cuts=(), glowfn=None, orient=True):
    bm = bmesh.new()
    bv = [bm.verts.new(p) for p in V]
    for f in F:
        try: bm.faces.new([bv[i] for i in f])
        except ValueError: pass
    if orient:
        vol = 0.0
        for f in bm.faces:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1): vol += vs[0].dot(vs[i].cross(vs[i + 1]))
        if vol < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    for cut in cuts: levelcut(bm, cut)
    bm.normal_update()
    bm.verts.index_update()
    base = len(part.v)
    for v in bm.verts: part.v.append(v.co.copy())
    for f in bm.faces:
        c = f.calc_center_median(); n = f.normal.copy()
        col = colfn(c, n)
        cols = [col(l.vert.co) for l in f.loops] if callable(col) else col
        part.add([base + l.vert.index for l in f.loops], cols, 1 if (glowfn and glowfn(c, n)) else 0)
    bm.free()

def mirror_part_geom(src, name, pivot):
    """the -X twin of a part (faces reversed)"""
    m = Part(name, pivot)
    m.v = [Vector((-v.x, v.y, v.z)) for v in src.v]
    m.f = [list(reversed(f)) for f in src.f]; m.fc = [list(reversed(c)) for c in src.fc]; m.fm = list(src.fm)
    return m

def rotate_part(part, R, about):
    part.v = [about + R @ (v - about) for v in part.v]

# ------------------------------------------------------------------ surfaces and decals
class Surface:
    def __init__(self, V, F):
        tri = []
        for f in F:
            for i in range(1, len(f) - 1): tri.append((f[0], f[i], f[i + 1]))
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in V], tri)
    def cast(self, o, d):
        hit = self.bvh.ray_cast(o, d)
        if hit[0] is None: return None, None
        n = hit[1]
        if n.dot(d) > 0: n = -n
        return hit[0], n

class Decal:
    """a local (u, v) frame on a surface round the point a ray hits; u ~ +X (or the given axis), v ~ N x u"""
    def __init__(self, S, origin, direction, uaxis=X):
        self.S = S; self.C, self.N = S.cast(Vector(origin), Vector(direction).normalized())
        assert self.C is not None, ('decal ray missed', origin, direction)
        self.T = (uaxis - self.N * uaxis.dot(self.N)).normalized(); self.B = self.N.cross(self.T)
    def at(self, u, v, h):
        P0 = self.C + self.T * u + self.B * v
        p, n = self.S.cast(P0 + self.N * 0.2, -self.N)
        if p is None: p, n = P0, self.N
        hh = h(u, v) if callable(h) else h
        return p + n * hh, n

def star_decal(m, D, inside, c2, S, h, col, rings=(1.0,), mat=0, rmax=0.3):
    def bnd(th):
        du, dv = math.cos(th), math.sin(th); lo, hi = 0.0, rmax
        for _ in range(36):
            mid = (lo + hi) / 2
            if inside(c2[0] + du * mid, c2[1] + dv * mid): lo = mid
            else: hi = mid
        return du * lo, dv * lo
    B = [bnd(2 * math.pi * k / S + 0.5 * math.pi / S) for k in range(S)]
    def mk(u, v):
        p, n = D.at(u, v, h); return m.vert(p), n
    ci, cn = mk(*c2)
    ids, ns = [], []
    for f in rings:
        row, rn = [], []
        for du, dv in B:
            i, n = mk(c2[0] + f * du, c2[1] + f * dv); row.append(i); rn.append(n)
        ids.append(row); ns.append(rn)
    cf = col if callable(col) else (lambda j, k: col)
    for k in range(S):
        m.face([ci, ids[0][k], ids[0][(k + 1) % S]], cf(0, k), ns[0][k], mat)
    for j in range(len(rings) - 1):
        for k in range(S):
            m.face([ids[j][k], ids[j][(k + 1) % S], ids[j + 1][(k + 1) % S], ids[j + 1][k]], cf(j + 1, k), ns[j][k], mat)

def stroke(m, D, pts, hw, h, col, caps=True, cap_n=4, mat=0):
    n = len(pts); hwf = hw if callable(hw) else (lambda i: hw)
    A, Bs, N0 = [], [], []
    for i in range(n):
        w = hwf(i)
        a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]
        du, dv = b[0] - a[0], b[1] - a[1]; ln = math.hypot(du, dv); nu, nv = -dv / ln, du / ln
        u, v = pts[i]
        p, nn = D.at(u + nu * w, v + nv * w, h); A.append(m.vert(p)); N0.append(nn)
        p, nn = D.at(u - nu * w, v - nv * w, h); Bs.append(m.vert(p))
    for i in range(n - 1):
        m.face([A[i], A[i + 1], Bs[i + 1], Bs[i]], col, N0[i], mat)
    if caps:
        for end, i0, i1 in ((0, 0, 1), (n - 1, n - 1, n - 2)):
            w = hwf(end); u, v = pts[end]
            du, dv = pts[i0][0] - pts[i1][0], pts[i0][1] - pts[i1][1]; ln = math.hypot(du, dv); du, dv = du / ln, dv / ln
            nu, nv = -dv, du
            c, cn = D.at(u, v, h); ci = m.vert(c)
            arc = []
            for s in range(cap_n + 1):
                a = math.pi * s / cap_n
                arc.append(m.vert(D.at(u + (nu * math.cos(a) + du * math.sin(a)) * w, v + (nv * math.cos(a) + dv * math.sin(a)) * w, h)[0]))
            for s in range(cap_n):
                m.face([ci, arc[s], arc[s + 1]], col, cn, mat)

def ell_in(cu, cv, a, b, rot=0.0):
    ca, sa = math.cos(rot), math.sin(rot)
    def f(u, v):
        du, dv = u - cu, v - cv
        x, y = du * ca + dv * sa, -du * sa + dv * ca
        return (x / a) ** 2 + (y / b) ** 2 < 1
    return f

def snowflake_decal(m, D, size, h, col, rot=0.0):
    """a six-armed snowflake (arms with a V of side branches, rounded ends, a hexagon heart) as flat strokes"""
    L = size / 2; hw = size * 0.066
    for k in range(6):
        a = rot + k * math.pi / 3; ca, sa = math.cos(a), math.sin(a)
        seg = [(ca * L * t, sa * L * t) for t in (0.0, 0.4, 0.72, 1.0 - hw / L)]
        stroke(m, D, seg, hw, h, col, cap_n=3)
        for sg in (-1, 1):
            b = a + sg * rad(52); r0 = 0.52 * L; lb = 0.34 * L
            p0 = (ca * r0, sa * r0)
            stroke(m, D, [p0, (p0[0] + math.cos(b) * lb * 0.5, p0[1] + math.sin(b) * lb * 0.5), (p0[0] + math.cos(b) * lb, p0[1] + math.sin(b) * lb)],
                   hw * 0.8, h + 0.0002, col, cap_n=3)
    star_decal(m, D, lambda u, v: math.hypot(u, v) < hw * 1.9, (0.0, 0.0), 8, h + 0.0004, col, rmax=0.05)

# ------------------------------------------------------------------ the kimono profile (z, half-width, front depth, back depth)
KP = [(0.795, 0.08, 0.07, 0.082), (0.786, 0.098, 0.086, 0.098), (0.772, 0.12, 0.102, 0.11), (0.752, 0.142, 0.115, 0.120),
      (0.735, 0.156, 0.123, 0.126), (0.700, 0.160, 0.127, 0.127), (0.660, 0.156, 0.126, 0.124), (0.620, 0.154, 0.126, 0.122),
      (0.585, 0.156, 0.128, 0.124), (0.550, 0.166, 0.133, 0.131), (0.510, 0.186, 0.142, 0.145), (0.470, 0.207, 0.153, 0.162),
      (0.420, 0.232, 0.167, 0.176), (0.360, 0.262, 0.184, 0.192), (0.300, 0.290, 0.200, 0.212), (0.240, 0.316, 0.216, 0.236),
      (0.180, 0.341, 0.231, 0.266), (0.130, 0.361, 0.243, 0.300), (0.090, 0.376, 0.253, 0.336), (0.060, 0.387, 0.260, 0.372),
      (0.038, 0.394, 0.265, 0.400), (0.024, 0.397, 0.268, 0.414)]
KB = 48
def prof(z):
    if z >= KP[0][0]: return KP[0][1:]
    for i in range(len(KP) - 1):
        z0, z1 = KP[i][0], KP[i + 1][0]
        if z1 <= z <= z0:
            t = (z0 - z) / (z0 - z1); return tuple(lerp(KP[i][j], KP[i + 1][j], t) for j in (1, 2, 3))
    return KP[-1][1:]
def kim_xy(th, W, Df, Db, s=1.0):
    D = (Df + Db) / 2 + (Df - Db) / 2 * math.cos(th)
    return Vector((W * math.sin(th) * s, -D * math.cos(th) * s, 0))
def hem_lift(th, z): return 0.024 * (1 + math.cos(th)) / 2 * smooth(0.13, 0.02, z)
def kim_pt(th, z):
    W, Df, Db = prof(z); p = kim_xy(th, W, Df, Db); p.z = z + hem_lift(th, z); return p
def kim_normal_h(th, z):
    W, Df, Db = prof(z); e = 1e-3
    t = kim_xy(th + e, W, Df, Db) - kim_xy(th - e, W, Df, Db)
    return Vector((t.y, -t.x, 0)).normalized()          # (outward for a counter-clockwise-in-th loop: checked below)
def theta_of(p): return math.atan2(p.x, -p.y)

ZW = lambda th: 0.123 + 0.017 * math.sin(4 * th + 0.3)          # the white wave stripe's centre line
def v_angle(z): return rad(44) * clamp((z - 0.698) / 0.115) ** 0.8

def kimono_colour(c, n):
    th = theta_of(c)
    if c.z > 0.79: return C['collar']
    if c.z > 0.698 and abs(th) < v_angle(c.z): return C['collar']
    if c.z > 0.465: return C['ivory']
    if c.z > 0.425: return C['pale']
    if c.z > 0.385: return C['light']
    w = c.z - ZW(th)
    if abs(w) < 0.0135: return C['stripe']
    return C['main'] if w > 0 else C['deep']

def build_kimono(m):
    TH = [2 * math.pi * k / KB for k in range(KB)]
    rings = []
    for z, W, Df, Db in KP:
        rings.append([kim_xy(th, W, Df, Db) + Vector((0, 0, z + hem_lift(th, z))) for th in TH])
    zl, Wl, Dfl, Dbl = KP[-1]
    for z, s in ((0.012, 1.008), (0.004, 0.99), (0.007, 0.92), (0.02, 0.7), (0.032, 0.4)):
        rings.append([kim_xy(th, Wl, Dfl, Dbl, s) + Vector((0, 0, z + hem_lift(th, z))) for th in TH])
    V, F = grid(rings, Vector((0, 0.006, 0.80)), Vector((0, 0.05, 0.045)))
    S = Surface(V, F)
    cuts = [lambda p: p.z - 0.465, lambda p: p.z - 0.425, lambda p: p.z - 0.385,
            lambda p: p.z - (ZW(theta_of(p)) + 0.0135), lambda p: p.z - (ZW(theta_of(p)) - 0.0135),
            lambda p: (abs(theta_of(p)) - v_angle(p.z)) if p.z > 0.66 else 1.0]
    emit(m, V, F, kimono_colour, cuts + [lambda p: p.z - 0.79])
    return S

def build_collar(m):
    """the crossed kimono collar: a white band from the V round the back of the neck, a pale under-collar inside it"""
    half = [(0.0, -0.131, 0.703), (0.03, -0.122, 0.733), (0.056, -0.102, 0.762), (0.078, -0.064, 0.782), (0.088, -0.012, 0.792),
            (0.08, 0.04, 0.80), (0.046, 0.075, 0.806), (0.0, 0.086, 0.808)]
    for lay, (dn, din, w, t, col) in enumerate(((0.0, 0.0, 0.021, 0.0085, C['ivory']), (0.012, 0.016, 0.012, 0.007, C['collar']))):
        ctrl = [Vector((x, y, z)) for x, y, z in half] + [Vector((-x, y, z)) for x, y, z in reversed(half[:-1])]
        ctrl[0].x += 0.012; ctrl[-1].x -= 0.012
        path = resample(catmull(ctrl, 120), 26)
        normals = []
        for p in path:
            r = Vector((p.x, p.y - 0.0, 0)).normalized(); normals.append((r + Z * 0.55).normalized())
        path = [p - Vector((p.x, p.y, 0)).normalized() * din - Z * dn for p in path]
        V, F = sweep(path, normals, [w] * len(path), [t] * len(path), S=6, e=0.6, cap_len=0.012)
        emit(m, V, F, lambda c, n, col=col: col)

def build_obi(m):
    TH = [2 * math.pi * k / KB for k in range(KB)]
    # (the profile loop runs clockwise seen from above for increasing th: flip the tangent normal if it points inward)
    sgn = 1.0 if kim_normal_h(0.0, 0.62).dot(Vector((0, -1, 0))) > 0 else -1.0
    def band(zc, hb, rc, a, S, e, col):
        rings = []
        for th in TH:
            n = kim_normal_h(th, zc) * sgn; ring = []
            for k in range(S):
                ps = 2 * math.pi * k / S
                o = rc + a * sgnpow(math.cos(ps), e); z = zc + hb * sgnpow(math.sin(ps), e)
                ring.append(kim_pt(th, z) + n * o)
            rings.append(ring)
        V, F = grid(rings, wrap=True)
        emit(m, V, F, col)
    def obi_col(c, n):
        return C['obi_e'] if abs(c.z - 0.62) > 0.047 else C['obi']
    band(0.620, 0.056, 0.004, 0.014, 8, 0.4, obi_col)
    band(0.621, 0.021, 0.019, 0.0085, 6, 0.45, lambda c, n: C['cord'])
    return sgn

def gem(m, top, bot, half_w, front, back, cols):
    """a diamond (octahedron): top/bottom points, left/right girdle, a front ridge point, a flat-ish back"""
    zc = (top.z + bot.z) / 2 + 0.003
    T, Bt = top, bot
    L = Vector((-half_w, front.y + (back.y - front.y) * 0.55, zc)); R = Vector((half_w, L.y, zc))
    V = [T, Bt, L, R, front, back]
    F = [[0, 2, 4], [0, 4, 3], [1, 4, 2], [1, 3, 4], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 3]]
    fc = [cols[0], cols[1], cols[1], cols[2], cols[2], cols[2], cols[2], cols[2]]
    k = [0]
    def colfn(c, n):
        # by facet: front-upper-left light, front-upper-right mid, front-lower mid / deep, back deep
        if n.y < -0.2:
            if c.z > zc: return cols[0] if c.x < 0 else cols[1]
            return cols[1] if c.x < 0 else cols[2]
        return cols[2]
    emit(m, V, F, colfn, glowfn=lambda c, n: True)

def build_bow(m, sgn):
    _, Dfb, Dbb = prof(0.615)
    yb = Dbb
    # the knot
    V, F = ellipsoid(Vector((0, yb + 0.036, 0.617)), X * 0.05, Y * 0.04, Z * 0.058, 14, 8)
    emit(m, V, F, lambda c, n: C['knot'])
    # the two loops: puffy, pinched into the knot, the outer ends tilted up a little; a darker fold round the middle
    for s in (-1, 1):
        c0 = Vector((s * 0.122, yb + 0.05, 0.632)); ang = rad(12)
        ax = Vector((s * math.cos(ang), 0, math.sin(ang))) * 0.1
        az = Vector((-s * math.sin(ang), 0, math.cos(ang))) * 0.082
        ay = Y * 0.05
        axn, azn = ax.normalized(), az.normalized()
        def deform(v, c0=c0, axn=axn, azn=azn):
            d = v - c0; t = d.dot(axn) / 0.1
            k = 0.58 + 0.42 * smooth(-1.0, 0.25, t)
            along = axn * d.dot(axn); rest = d - along
            return c0 + along + rest * k
        V, F = ellipsoid(c0, ax, ay, az, 18, 9, deform)
        def colfn(c, n, c0=c0, azn=azn):
            lz = (c - c0).dot(azn)
            return C['bow_d'] if abs(lz) < 0.011 else C['bow']
        emit(m, V, F, colfn, cuts=[lambda p, c0=c0, azn=azn: (p - c0).dot(azn) - 0.011, lambda p, c0=c0, azn=azn: (p - c0).dot(azn) + 0.011])
    # the tails: thick ribbons down the back of the skirt
    for s in (-1, 1):
        zs = [0.595, 0.55, 0.5, 0.45, 0.405, 0.375]
        xs = [0.02, 0.042, 0.066, 0.09, 0.11, 0.12]
        path = []
        for zz, xx in zip(zs, xs):
            _, _, Db = prof(zz)
            path.append(Vector((s * xx, Db + 0.024, zz)))
        path = catmull(path, 12)
        widths = [lerp(0.03, 0.042, i / 11) for i in range(12)]
        V, F = sweep(path, [Vector((0, 1, 0.25))] * 12, widths, [0.012] * 12, S=10, e=0.5, end0=False, end1=True)
        emit(m, V, F, lambda c, n: C['bow'])

def sweep(path, normals, widths, thicks, S=12, e=0.5, end0=True, end1=True, cap_len=None):
    """a closed tube with a rounded-rectangle section (broad face along `normals`), rounded ends (poles)"""
    n = len(path)
    # end rounding: extra shrinking rows
    Ls = [0.0]
    for i in range(1, n): Ls.append(Ls[-1] + (path[i] - path[i - 1]).length)
    rows = []
    def frame(i):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        nn = (normals[i] - t * normals[i].dot(t)).normalized(); b = t.cross(nn)
        return t, nn, b
    def ring(c, nn, b, w, th):
        out = []
        for k in range(S):
            ang = 2 * math.pi * k / S
            out.append(c + b * (sgnpow(math.cos(ang), e) * w) + nn * (sgnpow(math.sin(ang), e) * th))
        return out
    rings = []
    t0, n0, b0 = frame(0); t1, n1, b1 = frame(n - 1)
    if end0:
        r = cap_len or min(widths[0], thicks[0] * 2.5)
        for a in (30, 60):
            f = math.sin(rad(a)); back = r * math.cos(rad(a))
            rings.append(ring(path[0] - t0 * back, n0, b0, widths[0] * f, thicks[0] * f))
    for i in range(n):
        t, nn, b = frame(i); rings.append(ring(path[i], nn, b, widths[i], thicks[i]))
    if end1:
        r = cap_len or min(widths[-1], thicks[-1] * 2.5)
        for a in (60, 30):
            f = math.sin(rad(a)); fwd = r * math.cos(rad(a))
            rings.append(ring(path[-1] + t1 * fwd, n1, b1, widths[-1] * f, thicks[-1] * f))
    p0 = path[0] - t0 * (cap_len or min(widths[0], thicks[0] * 2.5)) if end0 else path[0]
    p1 = path[-1] + t1 * (cap_len or min(widths[-1], thicks[-1] * 2.5)) if end1 else path[-1]
    return grid(rings, p0, p1)

def build_feet(m):
    for s in (-1, 1):
        V, F = ellipsoid(Vector((s * 0.062, -0.212, 0.026)), X * 0.037, Y * 0.06, Z * 0.026, 12, 6)
        emit(m, V, F, lambda c, n: C['tabi'])

FLAKES = [(0, 0.228, 0.135, 0.0), (-42, 0.262, 0.105, 0.17), (40, 0.318, 0.10, -0.14), (-95, 0.30, 0.10, 0.09),
          (92, 0.232, 0.105, 0.2), (142, 0.258, 0.11, 0.0), (-145, 0.278, 0.105, 0.26)]
def build_body():
    m = Part('body', (0, 0, 0))
    S = build_kimono(m)
    build_collar(m)
    sgn = build_obi(m)
    _, Df, _ = prof(0.627)
    y0 = -(Df + 0.028)
    gem(m, Vector((0, y0 + 0.004, 0.712)), Vector((0, y0 + 0.004, 0.545)), 0.04, Vector((0, y0 - 0.032, 0.632)), Vector((0, y0 + 0.016, 0.627)),
        (C['crys_l'], C['crys'], C['crys_d']))
    build_bow(m, sgn)
    build_feet(m)
    for deg, z, size, rot in FLAKES:
        th = rad(deg)
        o = Vector((math.sin(th) * 1.5, -math.cos(th) * 1.5, z)); d = Vector((-math.sin(th), math.cos(th), 0))
        D = Decal(S, o, d, uaxis=Vector((math.cos(th), math.sin(th), 0)))
        snowflake_decal(m, D, size, 0.0028, C['flake'], rot)
    return m

# ------------------------------------------------------------------ the head
HP = Vector((0, 0, 0.87))
HC = Vector((0, 0.035, 0.965)); HRX, HRYF, HRYB, HRZU, HRZD = 0.208, 0.19, 0.195, 0.19, 0.148
def skull_pt(eta, om):
    ce, se = math.cos(eta), math.sin(eta)
    if eta < 0: ce, se = abs(ce) ** (2 / 3.0), sgnpow(se, 2 / 3.0)     # (a fuller, mochi-like jaw and cheeks)
    d = Vector((ce * math.sin(om), -ce * math.cos(om), se))
    ryf = HRYF + (0.012 if eta < 0 else 0.0) * math.sin(-eta * 2) if eta < 0 else HRYF
    return HC + Vector((d.x * HRX, d.y * (ryf if d.y < 0 else HRYB), d.z * (HRZU if d.z > 0 else HRZD)))
def build_skull(m):
    K, R = 34, 20
    rings = [[skull_pt(-math.pi / 2 + math.pi * j / (R + 1), 2 * math.pi * k / K) for k in range(K)] for j in range(1, R + 1)]
    V, F = grid(rings, HC - Z * HRZD, HC + Z * HRZU)
    S = Surface(V, F)
    emit(m, V, F, lambda c, n: C['skin_d'] if n.z < -0.8 else C['skin'])
    return S

CAP_C = Vector((0, 0.037, 0.975)); CAP_RX, CAP_RYF, CAP_RYB, CAP_RZ, CAP_P = 0.262, 0.207, 0.262, 0.23, 2.8
def wrapd(om): return (math.degrees(om) + 180) % 360 - 180
def cap_pt(om, phi, scale=1.0):
    sx = abs(math.sin(phi)) ** (2 / CAP_P); cz = sgnpow(math.cos(phi), 2 / CAP_P)
    ry = (CAP_RYF + CAP_RYB) / 2 + (CAP_RYF - CAP_RYB) / 2 * math.cos(om)
    return CAP_C + Vector((CAP_RX * sx * math.sin(om), -ry * sx * math.cos(om), CAP_RZ * cz)) * scale
def cap_zb(om): return 1.018 - (1.018 - 0.945) * smooth(50, 64, abs(wrapd(om)))
def cap_phib(om):
    q = (cap_zb(om) - CAP_C.z) / CAP_RZ
    return math.acos(clamp(sgnpow(q, CAP_P / 2), -1, 1))
def cap_oms():
    out = []; d = 0.0
    while d < 360 - 1e-6:
        out.append(rad(d))
        dd = min(abs(d - 57), abs(d - 303))
        d += 2.5 if dd < 16 else 7.5
    return out
def build_cap(m):
    OM = cap_oms()
    FR = [0.14, 0.3, 0.45, 0.59, 0.71, 0.81, 0.89, 0.95, 1.0]
    rings = []
    for f in FR: rings.append([cap_pt(om, cap_phib(om) * f) for om in OM])
    ob = rings[-1]
    inner = lambda om, f: CAP_C + (cap_pt(om, cap_phib(om) * f) - CAP_C) * 0.72
    l1 = []
    for om, p in zip(OM, ob):
        h = Vector((p.x - CAP_C.x, p.y - CAP_C.y, 0)).normalized()
        l1.append(p - h * 0.007 - Z * 0.009)
    l2 = [p.lerp(inner(om, 1.0), 0.5) - Z * 0.012 for om, p in zip(OM, ob)]
    rings += [l1, l2]
    for f in (1.0, 0.55): rings.append([inner(om, f) for om in OM])
    V, F = grid(rings, CAP_C + Z * CAP_RZ, CAP_C + Z * CAP_RZ * 0.72)
    S = Surface(V, F)
    def colfn(c, n):
        om = math.degrees(math.atan2(c.x, -(c.y - CAP_C.y)))
        if c.z > 1.075 and n.dot(c - CAP_C) > 0 and (om + 4) % 36 < 6: return C['hair_p']
        return C['hair']
    emit(m, V, F, colfn)
    return S

def build_sidelocks(m):
    for s in (-1, 1):
        zs = [1.07, 1.02, 0.97, 0.92, 0.87, 0.83, 0.80, 0.78]
        # hugging the cheek, a little fuller at the cheek, the blunt end curling in under the jaw
        xo = lambda z: 0.209 + 0.008 * math.sin(math.pi * clamp((1.0 - z) / 0.2)) - 0.012 * smooth(0.83, 0.775, z)
        path = [Vector((s * xo(z), -0.054 - 0.024 * smooth(0.9, 0.775, z), z)) for z in zs]
        path = catmull(path, 14)
        widths = [lerp(0.05, 0.046, i / 13) for i in range(14)]
        thick = [lerp(0.022, 0.017, i / 13) for i in range(14)]
        normals = [Vector((s, -0.35, 0)).normalized()] * 14
        V, F = sweep(path, normals, widths, thick, S=14, e=0.8, end0=False, end1=True, cap_len=0.018)
        emit(m, V, F, lambda c, n: C['hair'])

def build_ears(m):
    for s in (-1, 1):
        c = Vector((s * 0.216, 0.044, 0.893))
        ne = Vector((s, -0.42, 0.0)).normalized(); side = Z.cross(ne).normalized()
        V, F = ellipsoid(c, Z * 0.041, side * 0.033, ne * 0.025, 14, 7)
        emit(m, V, F, lambda cc, n, c=c, ne=ne: C['ear_in'] if (cc - c).dot(ne) > 0.019 else C['skin'])

def build_neck(m):
    rings = []
    for z, r in ((0.845, 0.056), (0.80, 0.058), (0.75, 0.058), (0.70, 0.056)):
        rings.append([Vector((r * math.sin(2 * math.pi * k / 12), 0.02 - r * math.cos(2 * math.pi * k / 12), z)) for k in range(12)])
    V, F = grid(rings, Vector((0, 0.02, 0.85)), Vector((0, 0.02, 0.695)))
    emit(m, V, F, lambda c, n: C['skin'])

def crystal(m, base, up, H, R, twist=0.0):
    up = up.normalized(); a = (X - up * X.dot(up)).normalized(); b = up.cross(a)
    def ring(h, r): return [base + up * h + (a * math.cos(2 * math.pi * k / 6 + twist) + b * math.sin(2 * math.pi * k / 6 + twist)) * r for k in range(6)]
    rows = [ring(-0.025, R * 0.8), ring(0.32 * H, R), ring(0.66 * H, R), ring(0.94 * H, R * 0.16)]
    V, F = grid(rows, base + up * (-0.03), base + up * H)
    def colfn(c, n):
        lat = n - up * n.dot(up)
        k = (math.degrees(math.atan2(lat.dot(b), lat.dot(a)) - twist) % 360) // 60
        if (c - base).dot(up) > 0.66 * H: return C['crys_l'] if k in (3, 4) else C['crys']
        return (C['crys_l'], C['crys'], C['crys_d'], C['crys'], C['crys_l'], C['crys_d'])[int(k)]
    emit(m, V, F, colfn, glowfn=lambda c, n: True)

def build_tiara(m, capS):
    def on_cap(x, y):
        p, n = capS.cast(Vector((x, y, 1.6)), Vector((0, 0, -1))); return p
    spec = [(0.0, -0.07, 0.12, 0.031, (0, -0.12, 1), 0.0), (0.075, -0.058, 0.088, 0.025, (0.25, -0.06, 1), 0.2),
            (-0.075, -0.058, 0.088, 0.025, (-0.25, -0.06, 1), -0.2), (0.14, -0.026, 0.068, 0.021, (0.52, 0.0, 1), 0.4),
            (-0.14, -0.026, 0.068, 0.021, (-0.52, 0.0, 1), -0.4), (0.168, 0.06, 0.048, 0.016, (0.62, 0.3, 1), 0.1),
            (-0.168, 0.06, 0.048, 0.016, (-0.62, 0.3, 1), -0.1)]
    for x, y, H, R, up, tw in spec:
        base = on_cap(x, y)
        crystal(m, base - Vector(up).normalized() * 0.004, Vector(up), H, R, tw)

def snowflake_outline(L, w, xb, lb, wb, ang):
    """the outline (counter-clockwise, 2D) of a solid six-armed snowflake: arms of half-width w and length L, each with
    a V of side branches (root xb on the arm, length lb, half-width wb, at `ang` from the arm), all ends rounded"""
    sa, ca = math.sin(ang), math.cos(ang)
    tc = Vector((L - w, 0))
    root = Vector((xb, 0)); d = Vector((ca, sa)); p = Vector((-sa, ca)); tip = root + d * lb
    left = [tc + Vector((w * math.cos(rad(45)), w * math.sin(rad(45)))), tc + Vector((0, w))]
    t_out = (w + wb * ca) / sa
    left.append(Vector((xb + wb * sa + t_out * ca, w)))
    for be in (0, 60, 120, 180):
        left.append(tip + (-p * math.cos(rad(be)) + d * math.sin(rad(be))) * wb)
    t_in = (w - wb * ca) / sa
    left.append(Vector((xb - wb * sa + t_in * ca, w)))
    left.append(Vector((2 * w * math.cos(rad(30)), 2 * w * math.sin(rad(30)))))      # the valley (+30 deg)
    right = [Vector((q.x, -q.y)) for q in reversed(left[:-1])]                   # (its valley is the previous arm's)
    out = []
    for k in range(6):
        R = Matrix.Rotation(k * math.pi / 3, 2)
        for q in right + [Vector((L, 0))] + left: out.append(R @ q)
    return out

def build_kanzashi(m, capS):
    om = rad(78); z = 1.08
    p, n = capS.cast(Vector((math.sin(om) * 1.0, CAP_C.y - math.cos(om) * 1.0, z)), Vector((-math.sin(om), math.cos(om), 0)))
    nrm = Vector((0.5, -0.82, 0.28)).normalized()
    c = p + n * 0.026
    a = (Z - nrm * Z.dot(nrm)).normalized(); b = nrm.cross(a)    # a: up in the flake's plane
    outline = snowflake_outline(0.068, 0.0098, 0.038, 0.024, 0.0078, rad(55))
    # remove near-duplicate consecutive points
    o2 = []
    for q in outline:
        if not o2 or (q - o2[-1]).length > 1e-5: o2.append(q)
    if (o2[0] - o2[-1]).length < 1e-5: o2.pop()
    N = len(o2)
    def nrm2(i):
        a0, a1 = o2[i - 1], o2[(i + 1) % N]; t = (a1 - a0).normalized(); return Vector((t.y, -t.x))
    # orientation: make the outline counter-clockwise
    area = sum(o2[i].x * o2[(i + 1) % N].y - o2[(i + 1) % N].x * o2[i].y for i in range(N))
    if area < 0: o2.reverse()
    T = 0.0075; bev = 0.0032
    inset = [o2[i] - nrm2(i) * bev for i in range(N)]
    P3 = lambda q, h: c + a * q.y + b * q.x + nrm * h
    from mathutils.geometry import tessellate_polygon
    tri = tessellate_polygon([[Vector((q.x, q.y, 0)) for q in inset]])
    V = []; F = []
    top = [len(V) + i for i in range(N)]; V += [P3(q, T) for q in inset]
    mid = [len(V) + i for i in range(N)]; V += [P3(q, 0.0) for q in o2]
    bot = [len(V) + i for i in range(N)]; V += [P3(q, -T) for q in inset]
    for t in tri: F.append([top[t[0]], top[t[1]], top[t[2]]]); F.append([bot[t[2]], bot[t[1]], bot[t[0]]])
    for i in range(N):
        j = (i + 1) % N
        F.append([top[i], mid[i], mid[j], top[j]]); F.append([mid[i], bot[i], bot[j], mid[j]])
    def colfn(cc, nn):
        return C['crys_l'] if nn.dot(nrm) > 0.7 else (C['crys'] if nn.dot(nrm) > -0.3 else C['crys_d'])
    emit(m, V, F, colfn, glowfn=lambda cc, nn: True)

def build_head():
    m = Part('head', HP)
    S = build_skull(m)
    build_neck(m)
    build_ears(m)
    capS = build_cap(m)
    build_sidelocks(m)
    build_tiara(m, capS)
    build_kanzashi(m, capS)
    return m, S

# ------------------------------------------------------------------ the face (shells over the skull)
EYE_X, EYE_Z, EYE_K = 0.095, 0.932, 1.08
class Scaled:
    def __init__(self, D, k): self.D, self.k = D, k
    def at(self, u, v, h):
        return self.D.at(u * self.k, v * self.k, (lambda uu, vv: h(uu / self.k, vv / self.k)) if callable(h) else h)
def eye_frame(S, s): return Scaled(Decal(S, (s * EYE_X, -1.0, EYE_Z), Y), EYE_K)
def dome(cu):
    return lambda u, v: 0.0036 * max(0.0, 1 - ((u - cu) / 0.045) ** 2 - (v / 0.043) ** 2)
def build_eye(m, S, s):
    D = eye_frame(S, s)
    dm = dome(s * 0.003)
    H = lambda h: (lambda u, v: h + dm(u, v))
    wc = (s * 0.003, 0.0); ic = (-s * 0.001, -0.002)
    star_decal(m, D, ell_in(*wc, 0.043, 0.041), wc, 22, H(0.0016), C['white'])
    star_decal(m, D, ell_in(*ic, 0.0355, 0.0405), ic, 22, H(0.0022), C['eye_rim'])
    iris = ell_in(*ic, 0.031, 0.036)
    star_decal(m, D, iris, ic, 22, H(0.0028), C['iris'])
    top = lambda u, v: iris(u, v) and ell_in(ic[0], ic[1] + 0.03, 0.042, 0.032)(u, v)
    star_decal(m, D, top, (ic[0], ic[1] + 0.02), 16, H(0.0033), C['iris_d'])
    low = lambda u, v: iris(u, v) and ell_in(ic[0], ic[1] - 0.03, 0.027, 0.02)(u, v)
    star_decal(m, D, low, (ic[0], ic[1] - 0.02), 16, H(0.0033), C['iris_l'])
    star_decal(m, D, ell_in(ic[0], ic[1] + 0.001, 0.0135, 0.0165), (ic[0], ic[1] + 0.001), 14, H(0.0039), C['pupil'])
    cb = (ic[0] - 0.011, ic[1] + 0.015)
    star_decal(m, D, lambda u, v: (u - cb[0]) ** 2 + ((v - cb[1]) / 1.1) ** 2 < 0.0118 ** 2, cb, 12, H(0.0046), C['catch'])
    cs = (ic[0] + 0.0125, ic[1] - 0.017)
    star_decal(m, D, lambda u, v: (u - cs[0]) ** 2 + (v - cs[1]) ** 2 < 0.0058 ** 2, cs, 8, H(0.0046), C['catch'])
    # the upper lash line: hugging the white's top, thickening outward, a flick past the outer corner, two ticks
    pts = []
    for i in range(11):
        a = rad(160 - 150 * i / 10) if s > 0 else rad(20 + 150 * i / 10)
        pts.append((wc[0] + 0.045 * math.cos(a), 0.043 * math.sin(a) + 0.0015))
    seq = list(pts)                                   # inner corner -> outer corner (both eyes)
    oc = seq[-1]
    seq += [(oc[0] + s * 0.006, oc[1] + 0.006), (oc[0] + s * 0.011, oc[1] + 0.012)]
    nseq = len(seq)
    stroke(m, D, seq, lambda i: 0.0034 + 0.0036 * min(1.0, i / (nseq - 3)) - (0.0022 if i == nseq - 1 else 0.0), H(0.0049), C['lash'], cap_n=3)
    for a_deg, Ln in ((52, 0.012), (30, 0.013)):
        a = rad(a_deg) if s > 0 else rad(180 - a_deg)
        p0 = (wc[0] + 0.046 * math.cos(a), 0.044 * math.sin(a))
        dx, dy = math.cos(a) * 0.8 + s * 0.35, math.sin(a) * 0.8 + 0.45; dl = math.hypot(dx, dy)
        p1 = (p0[0] + dx / dl * Ln, p0[1] + dy / dl * Ln)
        stroke(m, D, [p0, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2), p1], lambda i: 0.0033 - 0.0008 * i, H(0.0049), C['lash'], cap_n=3)

def build_face(S):
    m = Part('face', HP)
    for s in (-1, 1): build_eye(m, S, s)
    D = Decal(S, (0, -1, 0.897), Y)
    star_decal(m, D, ell_in(0, 0, 0.0075, 0.0055), (0, 0), 10, 0.0016, C['nose'])
    D = Decal(S, (0, -1, 0.868), Y)
    pts = [(u, -0.0035 + 0.0075 * (u / 0.016) ** 2) for u in (-0.016, -0.009, -0.003, 0.003, 0.009, 0.016)]
    stroke(m, D, pts, 0.0033, 0.0018, C['mouth'], cap_n=3)
    for s in (-1, 1):
        D = Decal(S, (s * 0.13, -1, 0.874), Y)
        star_decal(m, D, ell_in(0, 0, 0.030, 0.017), (0, 0), 16, 0.0012, C['blush'])
    return m

def build_lids(S):
    m = Part('lids', HP)
    for s in (-1, 1):
        D = eye_frame(S, s); dm = dome(s * 0.003)
        H = lambda h: (lambda u, v: h + dm(u, v))
        lc = (s * 0.006, 0.005)
        region = lambda u, v: ell_in(lc[0], lc[1], 0.059, 0.054)(u, v) and v > -0.045
        star_decal(m, D, region, (lc[0], 0.0), 22, H(0.0068), C['skin'], rings=(0.4, 0.72, 1.0))
        pts = []
        for i in range(9):
            t = i / 8; u = lerp(-0.038, 0.045, t) * s
            pts.append((u + s * 0.003, -0.006 - 0.011 * math.sin(math.pi * t)))
        if s < 0: pass
        stroke(m, D, pts, lambda i: 0.0036 + 0.0018 * i / 8, H(0.0076), C['lash'], cap_n=3)
        oc = pts[-1]
        stroke(m, D, [oc, (oc[0] + s * 0.007, oc[1] - 0.006), (oc[0] + s * 0.012, oc[1] - 0.011)], lambda i: 0.003 - 0.0007 * i, H(0.0076), C['lash'], cap_n=3)
    return m

def build_mouthO(S):
    m = Part('mouthO', HP)
    D = Decal(S, (0, -1, 0.866), Y)
    oval = ell_in(0, 0, 0.0195, 0.0215)
    star_decal(m, D, oval, (0, 0), 18, 0.0032, C['mouth_o'])
    star_decal(m, D, lambda u, v: oval(u, v) and ell_in(0, -0.016, 0.014, 0.01)(u, v), (0, -0.013), 12, 0.0037, C['tongue'])
    return m

def build_puff(S):
    m = Part('puff', HP)
    for s in (-1, 1):
        p, n = S.cast(Vector((s * 0.118, -1, 0.878)), Y)
        t = (X - n * X.dot(n)).normalized(); b = n.cross(t)
        c = p + n * 0.004
        V, F = ellipsoid(c, t * 0.044, b * 0.035, n * 0.024, 14, 7)
        emit(m, V, F, lambda cc, nn, c=c, n=n: C['blush'] if (cc - c).dot(n) > 0.016 else C['skin'])
    return m

# ------------------------------------------------------------------ the long back hair
HB_P = Vector((0, 0.05, 1.0))
HBT = [(1.14, 0.17, 0.17, 0.022), (1.08, 0.225, 0.225, 0.032), (1.00, 0.246, 0.25, 0.038), (0.92, 0.258, 0.262, 0.042),
       (0.84, 0.262, 0.266, 0.043), (0.76, 0.265, 0.268, 0.04), (0.68, 0.27, 0.27, 0.034)]
def hb_prof(z):
    if z >= HBT[0][0]: return HBT[0][1:]
    for i in range(len(HBT) - 1):
        z0, z1 = HBT[i][0], HBT[i + 1][0]
        if z1 <= z <= z0:
            t = (z0 - z) / (z0 - z1); return tuple(lerp(HBT[i][j], HBT[i + 1][j], t) for j in (1, 2, 3))
    return HBT[-1][1:]
def hb_omf(z): return rad(lerp(84, 97, smooth(0.83, 0.87, z)) - 6 * smooth(0.95, 1.0, z))
def build_hairB():
    m = Part('hairB', HB_P)
    K, RR, Q, PSQ = 56, 6, 3.0, 5.0
    def sq(w):
        c, s = math.cos(w), math.sin(w); r = (abs(c) ** PSQ + abs(s) ** PSQ) ** (1 / PSQ); return c / r, s / r
    def surf(a, b, off):
        zb = 0.69 + 0.04 * a * a; zt = 1.14
        z = lerp(zb, zt, (b + 1) / 2)
        om = math.pi + a * (math.pi - hb_omf(z))
        Rx, Ry, T = hb_prof(z)
        Rx += 0.012 * smooth(0.8, 0.69, z)
        p = Vector((Rx * math.sin(om), 0.05 - Ry * math.cos(om), z))
        n = Vector((Ry * math.sin(om), -Rx * math.cos(om), 0)).normalized()
        return p + n * (T * off)
    rings = []
    for j in range(1, 2 * RR + 2):
        phi = math.pi * j / (2 * RR + 2)
        rho = abs(math.sin(phi)) ** (2 / Q); off = sgnpow(math.cos(phi), 2 / Q)
        ring = []
        for k in range(K):
            ca, sb = sq(2 * math.pi * k / K)
            ring.append(surf(ca * rho * 0.999, sb * rho * 0.999, off))
        rings.append(ring)
    V, F = grid(rings, surf(0, 0, 1.0), surf(0, 0, -1.0))
    def colfn(c, n):
        om = math.degrees(math.atan2(c.x, -(c.y - 0.05)))
        if n.dot(Vector((c.x, c.y - 0.05, 0))) > 0 and c.z > 0.74 and (om + 2) % 30 < 4.5: return C['hair_p']
        return C['hair']
    emit(m, V, F, colfn)
    rotate_part(m, three_rot(0.05, 0, 0).inverted(), HB_P)
    return m

# ------------------------------------------------------------------ sleeves
SL_P = Vector((0.172, 0, 0.725))
SL_OUT = [(0.150, 0.748), (0.300, 0.668), (0.452, 0.582), (0.492, 0.548), (0.498, 0.40), (0.494, 0.225), (0.470, 0.172),
          (0.380, 0.158), (0.290, 0.170), (0.272, 0.21), (0.262, 0.40), (0.240, 0.575), (0.190, 0.625), (0.150, 0.655)]
SL_C = (0.355, 0.42)
def sl_D(x, z): return 0.066 + 0.056 * smooth(0.58, 0.22, z)
def sl_yc(x, z): return 0.04 * smooth(0.58, 0.22, z)
def sl_bands(c):
    if c.z > 0.462: return C['ivory']
    if c.z > 0.425: return C['pale']
    if c.z > 0.385: return C['light']
    w = c.z - sl_wave(c)
    if abs(w) < 0.013: return C['stripe']
    return C['main'] if w > 0 else C['deep']
def sl_wave(p): return 0.238 + 0.011 * math.sin(p.x * 38 + p.y * 20 + 0.5)
def build_sleeve():
    m = Part('slR', SL_P)
    poly = chaikin([Vector((x, z)) for x, z in SL_OUT], 3)
    K = 36
    c = Vector(SL_C)
    # outline points by angle round the centre (star-shaped)
    def bnd(w):
        d = Vector((math.cos(w), math.sin(w))); best = None
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            e = b - a; den = d.x * (-e.y) - d.y * (-e.x)
            if abs(den) < 1e-12: continue
            r0 = a - c
            t = (r0.x * (-e.y) - r0.y * (-e.x)) / den; s = (d.x * r0.y - d.y * r0.x) / den
            if t > 0 and 0 <= s <= 1 and (best is None or t > best): best = t
        return c + d * best
    W = [2 * math.pi * k / K for k in range(K)]
    B = [bnd(w) for w in W]
    Nn = []
    for k in range(K):
        t = (B[(k + 1) % K] - B[k - 1]).normalized(); nn = Vector((t.y, -t.x))
        if nn.dot(B[k] - c) < 0: nn = -nn
        Nn.append(nn)
    def P3(q, y): return Vector((q.x, y, q.y))
    rings_front, rim, rings_back = [], [], []
    Rr = [min(0.05, sl_D(b.x, b.y) * 0.8) for b in B]
    Bin = [B[k] - Nn[k] * Rr[k] for k in range(K)]
    for f in (0.33, 0.67, 1.0):
        ring = []
        for k in range(K):
            q = c.lerp(Bin[k], f); D = sl_D(q.x, q.y) * (1 + 0.07 * (1 - f * f))
            ring.append(P3(q, sl_yc(q.x, q.y) - D))
        rings_front.append(ring)
    for ps in (30, 60, 90):
        ring = []
        for k in range(K):
            q = Bin[k] + Nn[k] * (Rr[k] * math.sin(rad(ps))); D = sl_D(Bin[k].x, Bin[k].y); yc = sl_yc(Bin[k].x, Bin[k].y)
            ring.append(P3(q, yc - (D - Rr[k]) - Rr[k] * math.cos(rad(ps))))
        rim.append(ring)
    ring = []
    for k in range(K):
        D = sl_D(Bin[k].x, Bin[k].y); yc = sl_yc(Bin[k].x, Bin[k].y)
        ring.append(P3(B[k], yc + (D - Rr[k])))
    rim.append(ring)
    for ps in (120, 150, 180):
        ring = []
        for k in range(K):
            q = Bin[k] + Nn[k] * (Rr[k] * math.sin(rad(ps))); D = sl_D(Bin[k].x, Bin[k].y); yc = sl_yc(Bin[k].x, Bin[k].y)
            ring.append(P3(q, yc + (D - Rr[k]) - Rr[k] * math.cos(rad(ps))))
        rim.append(ring)
    for f in (0.67, 0.33):
        ring = []
        for k in range(K):
            q = c.lerp(Bin[k], f); D = sl_D(q.x, q.y) * (1 + 0.07 * (1 - f * f))
            ring.append(P3(q, sl_yc(q.x, q.y) + D))
        rings_back.append(ring)
    rings = rings_front + rim + rings_back
    D0 = sl_D(c.x, c.y) * 1.07; yc0 = sl_yc(c.x, c.y)
    V, F = grid(rings, P3(c, yc0 - D0), P3(c, yc0 + D0))
    S = Surface(V, F)
    # the cuff: the hand comes out of the sleeve's outer top corner, pointing out, forward and down
    kc = min(range(K), key=lambda k: (B[k] - Vector((0.49, 0.552))).length)
    q = Bin[kc] + Nn[kc] * (Rr[kc] * math.sin(rad(70))); D = sl_D(Bin[kc].x, Bin[kc].y); yc = sl_yc(Bin[kc].x, Bin[kc].y)
    cuff = P3(q, yc - (D - Rr[kc]) - Rr[kc] * math.cos(rad(70)))
    dh = (Vector((Nn[kc].x, 0, Nn[kc].y)) + Vector((0, -0.55, -0.25))).normalized()
    ho = cuff - dh * 0.004
    def colfn(cc, n):
        if (cc - ho).length < 0.05: return C['inner']
        return sl_bands(cc)
    cuts = [lambda p: p.z - 0.462, lambda p: p.z - 0.425, lambda p: p.z - 0.385,
            lambda p: p.z - (sl_wave(p) + 0.013), lambda p: p.z - (sl_wave(p) - 0.013),
            lambda p: (p - ho).length - 0.05]
    emit(m, V, F, colfn, cuts)
    hc = cuff + dh * 0.016
    a1 = dh; a2 = (Z - dh * Z.dot(dh)).normalized(); a3 = a1.cross(a2)
    V, F = ellipsoid(hc, a2 * 0.031, a3 * 0.034, a1 * 0.04, 14, 7)
    emit(m, V, F, lambda cc, n: C['skin'])
    for side in (-1, 1):
        D = Decal(S, (0.385, side * -1.0, 0.31), Vector((0, side * 1.0, 0)))
        snowflake_decal(m, D, 0.108, 0.0028, C['flake'], 0.12 * side)
    return m

def build_sleeves():
    r = build_sleeve()
    rotate_part(r, three_rot(-0.22, 0, 0.06).inverted(), SL_P)
    l = mirror_part_geom(r, 'slL', Vector((-SL_P.x, SL_P.y, SL_P.z)))
    return r, l

# ------------------------------------------------------------------ the hagoromo shawl
SH_P = Vector((0, 0, 0.7))
# (round 2: draped at shoulder height behind her, looping down behind the upper arms to the elbows, tails out at the hips)
SH_HALF = [(0.00, 0.435, 0.775), (0.16, 0.425, 0.79), (0.30, 0.385, 0.775), (0.42, 0.33, 0.705), (0.515, 0.285, 0.61),
           (0.565, 0.22, 0.525), (0.585, 0.2, 0.455), (0.615, 0.25, 0.405), (0.655, 0.31, 0.415)]
def build_shawl():
    m = Part('shawl', SH_P)
    ctrl = [Vector((-x, y, z)) for x, y, z in reversed(SH_HALF)] + [Vector(p) for p in SH_HALF[1:]]
    dense = catmull(ctrl, 200)
    path = resample(dense, 64)
    n = len(path)
    ref = Vector((0, 1, 0.12)).normalized()
    normals = []
    for i in range(n):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        nn = ref - t * ref.dot(t)
        if nn.length < 1e-4: nn = Z - t * Z.dot(t)
        normals.append(nn.normalized())
    widths = []
    for i in range(n):
        e = abs(i / (n - 1) - 0.5) * 2
        widths.append(0.041 - 0.009 * e * e)
    V, F = sweep(path, normals, widths, [0.0135] * n, S=10, e=0.45, cap_len=0.022)
    look = Vector((0, -0.7, 0.7)).normalized()
    emit(m, V, F, lambda c, nn: C['shawl'] if nn.dot(look) > -0.1 else C['shawl_d'])
    rotate_part(m, three_rot(0.08, 0, 0).inverted(), SH_P)
    return m

# ------------------------------------------------------------------ assemble
def make_materials():
    def mat(name, glow):
        mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
        mt.use_backface_culling = True
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        if glow:
            # (the glTF exporter can't carry a vertex-colour emission: the emission is the crystal colour as a constant)
            bsdf.inputs['Emission Color'].default_value = C['crys']
            bsdf.inputs['Emission Strength'].default_value = 1.0
        return mt
    return mat('toon', False), mat('glow', True)

def to_object(part, mats):
    me = bpy.data.meshes.new(part.name)
    loc = part.pivot
    me.from_pydata([v - loc for v in part.v], [], part.f)
    me.update()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cols = []
    for f, c in zip(me.polygons, part.fc):
        assert f.loop_total == len(c), (part.name, f.loop_total, len(c))
        cols.extend(c)
    attr.data.foreach_set('color', [x for c in cols for x in c])
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    used = sorted(set(part.fm))
    if used == [1]:
        me.materials.append(mats[1]); me.polygons.foreach_set('material_index', [0] * len(part.fm))
    else:
        me.materials.append(mats[0])
        if 1 in used: me.materials.append(mats[1])
        me.polygons.foreach_set('material_index', part.fm)
    me.shade_smooth()
    me.validate()
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    return ob

def glow_audit(P):
    bad = []
    for p in P:
        for cols, mt in zip(p.fc, p.fm):
            g = lit_glow(cols[0])
            if g != (mt == 1): bad.append((p.name, mt, tuple(round(x, 3) for x in cols[0][:3])))
    return bad

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    body = build_body()
    head, S = build_head()
    face = build_face(S); lids = build_lids(S); mouthO = build_mouthO(S); puff = build_puff(S)
    hairB = build_hairB()
    slR, slL = build_sleeves()
    shawl = build_shawl()
    P = [body, head, face, lids, mouthO, puff, hairB, slR, slL, shawl]
    bad = glow_audit(P)
    print('YUKI glow audit (faces whose colour and material disagree):', len(bad), bad[:6])
    for p in P: to_object(p, mats)
    tot = sum(p.tris() for p in P)
    allv = [v for p in P if p.name not in ('lids', 'mouthO', 'puff') for v in p.v]
    lo = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
    hi = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
    print('YUKI tris', {p.name: p.tris() for p in P}, 'total', tot)
    print('YUKI bounds W%.3f D%.3f H%.3f | x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    for p in P:
        vs = p.v
        print('YUKI part %-6s pivot %s  x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (p.name, tuple(round(c, 3) for c in p.pivot),
              min(v.x for v in vs), max(v.x for v in vs), min(v.y for v in vs), max(v.y for v in vs), min(v.z for v in vs), max(v.z for v in vs)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'yuki-onna.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, 'yuki-onna.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('YUKI export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('YUKI wrote', out, os.path.getsize(out))

main()
