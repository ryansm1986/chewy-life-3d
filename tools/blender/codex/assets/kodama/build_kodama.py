# Kodama (Pawhaven enemy EN-1, Whispering Bamboo Grove) -- Option B "Birch Bud".
# Deterministic build, from an empty scene, of the three variant GLBs:
#   blender --background --factory-startup --python build_kodama.py -- [--only base|moss|elder]
# Parts (enemy contract): `body` (origin 0,0,0) and `head` (origin = neck joint). Vertex colours only (attribute `Col`,
# face-corner domain), materials `toon` (+ `glow` for the elder's gold eyes). No rig, no textures, no UVs.
# Face features are thin shells (0.5-4 mm) projected onto the head along their own normal, with the head's normals.
import bpy, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('KODAMA build pid', os.getpid())

# ------------------------------------------------------------------ colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

VARIANTS = {
    'base':  dict(skin='#f3f6ec', body='#efe8d8', crown='leaves', swirls=True, moss=False, gold=False),
    'moss':  dict(skin='#e6f0da', body='#e4e8d2', crown='leaves', swirls=False, moss=True, gold=False),
    'elder': dict(skin='#f6eedc', body='#f2e6d2', crown='blossoms', swirls=True, moss=False, gold=True),
}
COMMON = dict(ring_out='#d8bca8', ring_in='#e6d2c0', leaf='#7ab04a', leaf_under='#699c3f', midrib='#a8d85a',
              twig='#8a5a3a', twig_top='#9c6c48', peg='#e8e0d0', root_tip='#e6d2c0', root_end='#d8bca8', dark='#252333',
              iris='#4a2a1c', iris_low='#a8662e', white='#fff6ea', catch='#ffffff', blush='#f0a0ad',
              mouth_in='#e47a8c', brow='#cfae96', nose='#2a2532')

# ------------------------------------------------------------------ math
def spow(x, p): return math.copysign(abs(x) ** p, x)
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# ------------------------------------------------------------------ dimensions (m, Blender: front -Y, ground z=0)
HA, HCF, HCB = 0.32, 0.285, 0.285      # head half-width, half-depth front/back
HBT, HBB, ZC = 0.28, 0.24, 0.525       # head half-height above/below its widest line, widest line z
HNF, HNB = 2.05, 2.4                   # horizontal superellipse exponents: front half (rounder face), back half
HMT, HMB = 2.7, 3.2                    # vertical exponents: domed top, flatter bottom
PIVOT = Vector((0, 0, 0.3025))          # neck joint (head origin), 2.5 cm up inside the head

def head_P(eta, om):
    ce, se = math.cos(eta), math.sin(eta)
    so = math.sin(om)
    n = HNF if so < 0 else HNB; m = HMT if se > 0 else HMB
    x = HA * spow(ce, 2 / m) * spow(math.cos(om), 2 / n)
    y = (HCF if so < 0 else HCB) * spow(ce, 2 / m) * spow(so, 2 / n)
    z = ZC + (HBT if se > 0 else HBB) * spow(se, 2 / m)
    return Vector((x, y, z))

def head_n(p):
    x, y, z = p; zc = z - ZC
    c = HCF if y < 0 else HCB; b = HBT if zc > 0 else HBB
    n = HNF if y < 0 else HNB; m = HMT if zc > 0 else HMB
    ax, ay, az = abs(x) / HA, abs(y) / c, abs(zc) / b
    A = ax ** n + ay ** n
    g = m * A ** (m / n - 1) if A > 1e-12 else 0.0
    v = Vector((g * ax ** (n - 1) * math.copysign(1, x) / HA, g * ay ** (n - 1) * math.copysign(1, y) / c,
                m * az ** (m - 1) * math.copysign(1, zc) / b))
    return v.normalized() if v.length > 1e-9 else Vector((0, 0, 1 if zc > 0 else -1))

def eta_at_z(z):
    t = (z - ZC) / (HBT if z > ZC else HBB)
    return math.asin(max(-1, min(1, spow(t, (HMT if z > ZC else HMB) / 2))))

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
    """rings: lists of K points (closed loops); centres: one per ring. colfn(j, k): j = band (-1 = pole0 fan,
    len(rings)-1 = pole1 fan). normals: optional fn(point)->normal (else smoothed from faces)."""
    nf = normals or (lambda p: None)
    ids = [[m.vert(p, nf(p)) for p in ring] for ring in rings]
    K = len(rings[0])
    for j in range(len(rings) - 1):
        c = (centres[j] + centres[j + 1]) / 2
        for k in range(K):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]]
            fc = sum((m.v[i] for i in q), Vector()) / 4
            m.face(q, colfn(j, k), fc - c, mat if not callable(mat) else mat(j, k))
    for pole, j, ring, c in ((pole0, -1, 0, centres[0]), (pole1, len(rings) - 1, -1, centres[-1])):
        if pole is None: continue
        pi = m.vert(pole, nf(pole))
        for k in range(K):
            q = [pi, ids[ring][k], ids[ring][(k + 1) % K]]
            fc = sum((m.v[i] for i in q), Vector()) / 3
            m.face(q, colfn(j, k), fc - c, mat if not callable(mat) else mat(j, k))
    return ids

def frames_along(path):
    T = [(path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized() for i in range(len(path))]
    ref = Z if abs(T[0].dot(Z)) < 0.9 else X
    N0 = (ref - T[0] * ref.dot(T[0])).normalized(); out = []
    Nv = N0
    for t in T:
        Nv = (Nv - t * Nv.dot(t)).normalized(); out.append((t, Nv, t.cross(Nv)))
    return out

def tube(m, path, radii, K, colfn, cap0=True, cap1=True):
    fr = frames_along(path); rings = []
    for p, r, (t, nv, bv) in zip(path, radii, fr):
        rings.append([p + (nv * math.cos(2 * math.pi * k / K) + bv * math.sin(2 * math.pi * k / K)) * r for k in range(K)])
    p0 = path[0] - fr[0][0] * radii[0] * 0.9 if cap0 else None
    p1 = path[-1] + fr[-1][0] * radii[-1] * 0.95 if cap1 else None
    ring_surface(m, rings, path, colfn, p0, p1)

def catmull(pts, n):
    out = []
    P = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    segs = len(pts) - 1
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

def ellipsoid(m, c, ax, ay, az, K, R, colfn):
    """axes are vectors (direction * semi-length); R interior rings"""
    rings, cs = [], []
    for j in range(1, R + 1):
        eta = -math.pi / 2 + math.pi * j / (R + 1)
        ring = [c + ax * (math.cos(eta) * math.cos(2 * math.pi * k / K)) + ay * (math.cos(eta) * math.sin(2 * math.pi * k / K)) + az * math.sin(eta) for k in range(K)]
        rings.append(ring); cs.append(c + az * math.sin(eta))
    ring_surface(m, rings, cs, colfn, c - az, c + az)

def lathe(m, profile, K, colfn, origin=Vector((0, 0, 0)), axis=Z, ref=X, ysc=1.0):
    """profile: (r, h) with r=0 at both ends (poles); revolved about axis through origin"""
    axis = axis.normalized(); u = (ref - axis * ref.dot(axis)).normalized(); w = axis.cross(u)
    rings, cs = [], []
    for r, h in profile[1:-1]:
        rings.append([origin + axis * h + (u * math.cos(2 * math.pi * k / K) + w * (ysc * math.sin(2 * math.pi * k / K))) * r for k in range(K)])
        cs.append(origin + axis * h)
    ring_surface(m, rings, cs, colfn, origin + axis * profile[0][1], origin + axis * profile[-1][1])

def leaf(m, base, az, pitch, L, W, T, top, under, midrib=None, arch=0.08, curl=0.0, stations=None,
         angles=None, inner=None, roll=0.0, wexp=0.75):
    """thick lens-section leaf from base along (az, pitch). Top colour `top` (+ `midrib` band, `inner` near base)"""
    f = Vector((math.cos(pitch) * math.cos(az), math.cos(pitch) * math.sin(az), math.sin(pitch)))
    sd = Vector((-math.sin(az), math.cos(az), 0)); up = f.cross(sd)
    if roll:
        sd, up = sd * math.cos(roll) + up * math.sin(roll), up * math.cos(roll) - sd * math.sin(roll)
    S = stations or [0.07, 0.2, 0.36, 0.52, 0.68, 0.83, 0.94]
    A = angles or ([0, 40, 76, 104, 140, 180, 225, 270, 315] if midrib else [0, 45, 90, 135, 180, 225, 270, 315])
    def cl(s): return base + f * (L * s) + up * (L * (arch * math.sin(math.pi * s) + curl * s * s))
    rings, cs = [], []
    for s in S:
        e = math.sin(math.pi * s ** 0.8)
        w = W / 2 * math.sin(math.pi * s ** wexp) ** 0.45; th = T / 2 * e ** 0.5 + 0.002
        c = cl(s); cs.append(c)
        rings.append([c + sd * (w * math.cos(math.radians(a))) + up * (th * math.sin(math.radians(a))) for a in A])
    def col(j, k):
        a0 = A[k]; a1 = A[(k + 1) % len(A)] or 360
        is_top = a1 <= 180 + 1e-6
        if not is_top: return under
        if midrib and a0 >= 76 and a1 <= 104 and 0 <= j < len(S) - 2: return midrib
        if inner and j < 2: return inner
        return top
    ring_surface(m, rings, cs, col, cl(0.0), cl(1.0))

# ------------------------------------------------------------------ the head surface (lat-long superellipsoid)
OMS, ETS = 32, 15            # columns, latitude intervals
def head_rings(max_eta=None):
    rings, cs = [], []
    for j in range(1, ETS):
        eta = -math.pi / 2 + math.pi * j / ETS
        if max_eta is not None and eta > max_eta + 1e-6: break
        rings.append([head_P(eta, -math.pi + 2 * math.pi * k / OMS) for k in range(OMS)])
        cs.append(Vector((0, 0, rings[-1][0].z)))
    return rings, cs

def build_head_base(m, skin, open_above=None):
    """the head shell; open_above (rad): leave out the rows above that latitude (they sit under the moss cap,
    which closes the head there). The projection BVH is always the full head."""
    full = Part('tmp'); rings, cs = head_rings()
    ring_surface(full, rings, cs, lambda j, k: skin, head_P(-math.pi / 2, 0), head_P(math.pi / 2, 0), normals=head_n)
    bvh = BVHTree.FromPolygons([v.copy() for v in full.v], [list(f) for f in full.f])
    if open_above is None:
        ring_surface(m, rings, cs, lambda j, k: skin, head_P(-math.pi / 2, 0), head_P(math.pi / 2, 0), normals=head_n)
    else:
        rings, cs = head_rings(open_above)
        ring_surface(m, rings, cs, lambda j, k: skin, head_P(-math.pi / 2, 0), None, normals=head_n)
    return bvh

class Decal:
    """2-D feature coordinates (u along the head's X tangent, v up the surface) projected onto the head"""
    def __init__(self, bvh, C, N=None, extra=0.0):
        self.bvh = bvh; self.C = C; self.N = (N or head_n(C)).normalized(); self.extra = extra
        self.T = (X - self.N * X.dot(self.N)).normalized(); self.B = self.N.cross(self.T)
        if abs(self.N.z) > 0.9:   # on the top: u = x, v = +y (toward the back)
            self.T = (X - self.N * X.dot(self.N)).normalized(); self.B = self.N.cross(self.T)
    def at(self, u, v, h):
        P0 = self.C + self.T * u + self.B * v
        hit = self.bvh.ray_cast(P0 + self.N * 0.25, -self.N, 1.0)
        p = hit[0] if hit[0] is not None else P0
        n = head_n(p)
        return p + n * (h + self.extra), n

def front_point(bvh, x, z):
    hit = bvh.ray_cast(Vector((x, -1.0, z)), Y, 3.0); return hit[0]
def back_point(bvh, x, z):
    hit = bvh.ray_cast(Vector((x, 1.0, z)), -Y, 3.0); return hit[0]
def top_point(bvh, x, y):
    hit = bvh.ray_cast(Vector((x, y, 2.0)), -Z, 3.0); return hit[0]

def polar_decal(m, D, c2, bnd, rings, S, hfn, colfn, mat=0, own_normals=False, th0=0.0):
    """disc: centre c2 (u,v), boundary bnd(theta)->(du,dv); rings: fractions; hfn(u,v,f)->height (m)"""
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
        m.face([ci, ids[0][k], ids[0][(k + 1) % S]], colfn(0, k), ns[0][k], mat if not callable(mat) else mat(0, k))
    for j in range(len(rings) - 1):
        for k in range(S):
            q = [ids[j][k], ids[j][(k + 1) % S], ids[j + 1][(k + 1) % S], ids[j + 1][k]]
            m.face(q, colfn(j + 1, k), ns[j][k], mat if not callable(mat) else mat(j + 1, k))

def band_decal(m, D, A, B, hfn, colfn, mat=0):
    """strip between 2-D polylines A and B (same length)"""
    ia, ib, na = [], [], []
    for (ua, va), (ub, vb) in zip(A, B):
        p, n = D.at(ua, va, hfn(ua, va)); ia.append(m.vert(p, n)); na.append(n)
        p, n = D.at(ub, vb, hfn(ub, vb)); ib.append(m.vert(p, n))
    for i in range(len(A) - 1):
        m.face([ia[i], ia[i + 1], ib[i + 1], ib[i]], colfn(i), na[i], mat if not callable(mat) else mat(i))

def ell(a, b, rot=0.0):
    cr, sr = math.cos(rot), math.sin(rot)
    return lambda th: (a * math.cos(th) * cr - b * math.sin(th) * sr, a * math.cos(th) * sr + b * math.sin(th) * cr)

# ------------------------------------------------------------------ face
EYE_X, EYE_Z = 0.149, 0.484
def build_eye(m, bvh, side, P, gold):
    C = front_point(bvh, side * EYE_X, EYE_Z); D = Decal(bvh, C)
    so = side   # outward sign in u
    sc_c, sc_a, sc_b = (0.0, 0.0), 0.079, 0.081
    def q_of(u, v): return ((u - sc_c[0]) / sc_a) ** 2 + ((v - sc_c[1]) / sc_b) ** 2
    def dome(u, v): return 0.0030 * max(0.0, 1 - q_of(u, v))
    lay = lambda base: (lambda u, v, f=None: base + dome(u, v))
    c = lambda h: hexc(h)
    # sclera
    polar_decal(m, D, sc_c, ell(sc_a, sc_b), [0.5, 1.0], 28, lay(0.0015), lambda j, k: c(P['white']))
    # iris
    ic = (so * 0.0045, 0.0045); ia, ib = 0.0735, 0.0765
    iris_col = c('#ffd870') if gold else c(P['iris'])
    low_col = c('#ffeaa6') if gold else c(P['iris_low'])
    top_col = c('#d8a040') if gold else c(P['dark'])
    gm = 1 if gold else 0
    polar_decal(m, D, ic, ell(ia, ib), [0.5, 1.0], 28, lay(0.0034), lambda j, k: iris_col, mat=gm)
    def crescent(th0, th1, tmax, n, h, col):
        A, B = [], []
        for i in range(n + 1):
            th = math.radians(th0 + (th1 - th0) * i / n)
            ox, oy = ia * math.cos(th), ib * math.sin(th)
            t = tmax * math.sin(math.pi * i / n) ** 0.8
            A.append((ic[0] + ox * 1.0, ic[1] + oy * 1.0)); B.append((ic[0] + ox * (1 - t), ic[1] + oy * (1 - t)))
        band_decal(m, D, A, B, lambda u, v: h + dome(u, v), lambda i: col, mat=gm)
    if gold: crescent(198, 342, 0.36, 16, 0.0043, low_col)     # the elder's gold eyes: unchanged since round 2
    else: crescent(190, 350, 0.8, 16, 0.0043, low_col)    # warm lower crescent, about the lower 40 % of the iris
    crescent(12, 168, 0.30, 16, 0.0043, top_col)      # dark top
    # pupil + catchlights (absolute u: the light is from the viewer's upper left on both eyes)
    pc = (ic[0], ic[1] - 0.002)
    polar_decal(m, D, pc, ell(0.036, 0.043), [0.6, 1.0], 20, lay(0.0051), lambda j, k: c(P['dark']))
    polar_decal(m, D, (ic[0] - 0.023, ic[1] + 0.027), ell(0.0205, 0.0235), [0.6, 1.0], 14, lay(0.0059), lambda j, k: c(P['catch']))
    polar_decal(m, D, (ic[0] + 0.025, ic[1] - 0.028), ell(0.0098, 0.0098), [1.0], 10, lay(0.0059), lambda j, k: c(P['catch']))
    # lash line: over the sclera's top rim, thicker toward the outer corner, plus two flicks
    def lash_h(u, v):
        inside = max(0.0, min(1.0, (1.12 - math.sqrt(q_of(u, v))) / 0.22))
        return 0.0018 + 0.0050 * inside + dome(u, v)
    A, B = [], []
    n = 18
    for i in range(n + 1):
        t = i / n; th = math.radians(166 - 150 * t)      # inner (166 deg) -> outer (16 deg), in outward terms
        cu, sv = math.cos(th), math.sin(th)
        px, py = sc_c[0] + so * sc_a * cu, sc_c[1] + sc_b * sv
        nx, ny = so * cu / sc_a, sv / sc_b; ln = math.hypot(nx, ny); nx, ny = nx / ln, ny / ln
        w = 0.0045 + 0.0115 * smooth(0.0, 0.7, t) - 0.0045 * smooth(0.88, 1.0, t)
        if t < 0.06: w *= t / 0.06 * 0.7 + 0.3
        ins = 0.013 * (0.4 + 0.6 * math.sin(math.pi * min(1, t * 1.1)))
        A.append((px - nx * ins, py - ny * ins)); B.append((px + nx * w, py + ny * w))
    band_decal(m, D, A, B, lash_h, lambda i: c(P['dark']))
    for th_deg, ang, Lf, wf in ((30, 62, 0.027, 0.0135), (17, 30, 0.024, 0.0125)):
        th = math.radians(th_deg)
        px, py = sc_c[0] + so * sc_a * math.cos(th), sc_c[1] + sc_b * math.sin(th)
        d = (so * math.cos(math.radians(ang)), math.sin(math.radians(ang))); pn = (-d[1], d[0])
        A, B = [], []
        for i in range(6):
            t = i / 5; cx, cy = px - d[0] * 0.006 + d[0] * Lf * t, py - d[1] * 0.006 + d[1] * Lf * t + 0.004 * t * t
            hw = wf / 2 * (1 - t) ** 0.7 + 0.0012
            A.append((cx + pn[0] * hw, cy + pn[1] * hw)); B.append((cx - pn[0] * hw, cy - pn[1] * hw))
        band_decal(m, D, A, B, lash_h, lambda i: c(P['dark']))
    return C, D

def spiral_decal(m, D, cu, cv, R0, R1, turns, width, phi0, direction, segs, split, cols, sx=1.0, sy=1.0, h=0.0028):
    A, B = [], []
    for i in range(segs + 1):
        t = i / segs; r = R0 + (R1 - R0) * t; ph = phi0 + direction * 2 * math.pi * turns * t
        wd = width[0] + (width[1] - width[0]) * t if isinstance(width, tuple) else width
        w = wd / 2 * (0.4 + 0.6 * math.sin(math.pi / 2 * smooth(0.0, 0.07, min(t, 1 - t))))
        ux, vy = math.cos(ph), math.sin(ph)
        A.append((cu + (r + w) * ux * sx, cv + (r + w) * vy * sy)); B.append((cu + (r - w) * ux * sx, cv + (r - w) * vy * sy))
    band_decal(m, D, A, B, lambda u, v: h, lambda i: cols[0] if i < split * segs else cols[1])

def build_face(m, bvh, P, V):
    gold = V['gold']
    for side in (-1, 1): build_eye(m, bvh, side, P, gold)
    # brows: small soft tan dashes above the eyes
    for side in (-1, 1):
        D = Decal(bvh, front_point(bvh, side * 0.128, 0.6))
        polar_decal(m, D, (0, 0), ell(0.02, 0.0098, side * -0.12), [0.5, 1.0], 12, lambda u, v, f: 0.0015, lambda j, k: hexc(P['brow']))
    # nose: a small dark dome
    D = Decal(bvh, front_point(bvh, 0.0, 0.44))
    polar_decal(m, D, (0, 0), ell(0.022, 0.0155), [0.45, 0.8, 1.0], 12,
                lambda u, v, f: 0.0012 + 0.0090 * math.sqrt(max(0.0, 1 - f * f)), lambda j, k: hexc(P['nose']), own_normals=True)
    # mouth: a small open "o"
    D = Decal(bvh, front_point(bvh, 0.0, 0.392))
    polar_decal(m, D, (0, 0), ell(0.0135, 0.0165), [0.55, 1.0], 14, lambda u, v, f: 0.0015,
                lambda j, k: hexc(P['mouth_in']) if j == 0 else hexc(P['dark']))
    # blush ovals
    for side in (-1, 1):
        D = Decal(bvh, front_point(bvh, side * 0.19, 0.381))
        polar_decal(m, D, (0, 0), ell(0.039, 0.027, side * 0.1), [0.5, 1.0], 18, lambda u, v, f: 0.0015, lambda j, k: hexc(P['blush']))

def build_swirls(m, bvh, P):
    cols = (hexc(P['ring_out']), hexc(P['ring_in']))
    for side in (-1, 1):   # the two upper front corners (the sheet's front view)
        D = Decal(bvh, front_point(bvh, side * 0.21, 0.70))
        spiral_decal(m, D, 0, 0, 0.09, 0.033, 1.05, (0.05, 0.028), math.radians(90 - side * 125), side, 40, 0.55, cols, sx=1.1, sy=0.92)
    for side in (-1, 1):   # and the back corners (the sheet's back view)
        D = Decal(bvh, back_point(bvh, side * 0.22, 0.68))
        spiral_decal(m, D, 0, 0, 0.084, 0.033, 1.0, (0.046, 0.028), math.radians(90 + side * 140), -side, 32, 0.55, cols, sx=1.1, sy=0.92)
    D = Decal(bvh, top_point(bvh, 0.0, 0.06), N=Z)
    spiral_decal(m, D, 0.0, 0.0, 0.185, 0.05, 1.4, (0.05, 0.032), math.radians(250), 1, 72, 0.45, cols)

# ------------------------------------------------------------------ crown variants
TWIG_TOP = Vector((0, 0.012, 0.866))
def build_twig(m, P, top=TWIG_TOP):
    path = [Vector((0, 0.008, 0.77)), Vector((0, 0.010, 0.81)), Vector((0.002, 0.011, 0.842)), top]
    tube(m, path, [0.028, 0.026, 0.022, 0.019], 8, lambda j, k: hexc(P['twig_top']) if j >= len(path) - 1 else hexc(P['twig']))

def build_leaf_crown(m, P):
    build_twig(m, P)
    twig = hexc(P['twig'])
    # (azimuth, pitch, length, width, on a side branch?): two big low leaves out to the sides on short forked
    # branches, two upper leaves over the face, one low leaf to the back
    spec = [(174, 9, 0.235, 0.13, True, -0.9), (6, 9, 0.235, 0.13, True, 0.9), (214, 33, 0.19, 0.118, False, -0.3),
            (326, 34, 0.19, 0.118, False, 0.3), (90, 12, 0.17, 0.11, False, 0.0)]
    for az, pit, L, W, br, rl in spec:
        a = math.radians(az); hd = Vector((math.cos(a), math.sin(a), 0))
        if br:
            b0 = TWIG_TOP + Vector((0, 0, -0.022)); b1 = b0 + hd * 0.03 + Z * 0.014; b2 = b0 + hd * 0.058 + Z * 0.02
            tube(m, [b0, b1, b2], [0.015, 0.013, 0.012], 6, lambda j, k: twig, cap0=False)
            base = b2 - hd * 0.004
        else:
            base = TWIG_TOP + hd * 0.006 + Vector((0, 0, -0.01))
        leaf(m, base, a, math.radians(pit), L, W, 0.027, hexc(P['leaf']), hexc(P['leaf_under']), hexc(P['midrib']),
             arch=0.05, curl=0.06, stations=[0.05, 0.16, 0.31, 0.47, 0.63, 0.78, 0.9, 0.97], wexp=0.9, roll=rl)

def blossom(m, c, nrm, size, rot):
    nrm = nrm.normalized(); ref = X if abs(nrm.dot(X)) < 0.9 else Y
    u = (ref - nrm * ref.dot(nrm)).normalized(); w = nrm.cross(u)
    for i in range(5):
        a = rot + 2 * math.pi * i / 5
        d = u * math.cos(a) + w * math.sin(a)
        # leaf() takes az/pitch; express d tilted 18 deg up off the blossom plane
        f = (d * math.cos(math.radians(18)) + nrm * math.sin(math.radians(18))).normalized()
        az = math.atan2(f.y, f.x); pit = math.asin(max(-1, min(1, f.z)))
        # roll so the petal's flat side faces along the blossom normal
        sd = Vector((-math.sin(az), math.cos(az), 0)); up = Vector((math.cos(pit) * math.cos(az), math.cos(pit) * math.sin(az), math.sin(pit))).cross(sd)
        wantup = (nrm - f * nrm.dot(f)).normalized()
        roll = math.atan2(wantup.dot(-sd), wantup.dot(up)) if wantup.length > 0 else 0.0
        leaf(m, c + f * 0.004, az, pit, 0.052 * size, 0.05 * size, 0.019 * size, hexc('#ffb8d8'), hexc('#f7a8c8'),
             None, arch=0.04, curl=0.06, stations=[0.12, 0.38, 0.66, 0.88], angles=[0, 60, 120, 180, 240, 300],
             inner=hexc('#ff9ac4'), roll=roll)
    ellipsoid(m, c + nrm * 0.008 * size, u * 0.019 * size, w * 0.019 * size, nrm * 0.014 * size, 8, 2, lambda j, k: hexc('#fff0a0'))

def build_blossom_crown(m, P, bvh):
    # three big blossoms in a row across the top, facing forward and up (the sheet's elder)
    build_twig(m, P, top=Vector((0, 0.004, 0.85)))
    blossom(m, Vector((0, -0.006, 0.878)), Vector((0, -1, 0.62)), 1.72, 0.3)
    for side in (-1, 1):
        p = top_point(bvh, side * 0.175, 0.0)
        blossom(m, p + Vector((0, -0.01, 0.045)), Vector((side * 0.38, -1, 0.75)), 1.6, 0.9 + side * 0.5)

def build_moss(m, P, bvh):
    moss, lump = hexc('#7ab04a'), hexc('#a8d85a')
    cols = 48; G = [0.0, 0.45, 0.74, 0.9, 1.0]; Hh = [0.023, 0.022, 0.017, 0.0085, 0.0008]   # the lip ends just above the head: a clean curve, no facet zigzag
    drips = [(-90, 0.03, 0.36), (-24, 0.066, 0.42), (-156, 0.066, 0.42), (42, 0.055, 0.4), (138, 0.055, 0.4), (90, 0.035, 0.46)]
    def edge_z(om):
        z = 0.633 - 0.034 * (math.sin(om) + 1) / 2
        for d, dep, wd in drips:
            x = (math.atan2(math.sin(om - math.radians(d)), math.cos(om - math.radians(d)))) / wd
            z -= dep * max(0.0, 1 - x * x) ** 0.5 * (1 - 0.25 * x * x)   # round-bottomed lobes
        return z
    rings, cs = [], []
    for g, h in list(zip(G, Hh))[1:]:
        ring = []
        for k in range(cols):
            om = -math.pi + 2 * math.pi * k / cols
            e1 = eta_at_z(edge_z(om)); eta = math.pi / 2 + (e1 - math.pi / 2) * g
            p = head_P(eta, om); ring.append(p + head_n(p) * h)
        rings.append(ring); cs.append(Vector((0, 0, sum(p.z for p in ring) / cols)))
    rings.reverse(); cs.reverse()   # bottom (edge) first
    top = head_P(math.pi / 2, 0) + Z * Hh[0]
    ring_surface(m, rings, cs, lambda j, k: moss, None, top, normals=None)
    # lighter lumps
    for eta_d, om_d, a, b in ((62, -115, 0.047, 0.038), (48, -42, 0.043, 0.036), (58, 70, 0.05, 0.04), (40, 160, 0.045, 0.036)):
        p = head_P(math.radians(eta_d), math.radians(om_d))
        D = Decal(bvh, p, extra=Hh[0])
        polar_decal(m, D, (0, 0), ell(a, b, 0.4), [0.55, 1.0], 9, lambda u, v, f: -0.004 + 0.017 * max(0, 1 - f * f) ** 0.6,
                    lambda j, k: lump, own_normals=True)
    # the red mushroom, beside the crown (viewer's right, a little forward)
    p = head_P(math.radians(60), math.radians(-38)); n = head_n(p)
    ax = (n + Z * 1.2).normalized()
    base = p + n * 0.012
    tube(m, [base - ax * 0.012, base + ax * 0.04, base + ax * 0.08], [0.025, 0.022, 0.021], 8, lambda j, k: hexc('#fff4e4'))
    cc = base + ax * 0.078
    prof = [(0, -0.008), (0.034, -0.008), (0.058, 0.003), (0.061, 0.016), (0.049, 0.034), (0.027, 0.045), (0, 0.049)]
    lathe(m, prof, 12, lambda j, k: hexc('#fff0e2') if j <= 0 else hexc('#e8503a'), origin=cc, axis=ax, ref=X)
    u = (X - ax * X.dot(ax)).normalized(); w = ax.cross(u)
    for i, (ang, s) in enumerate(((0.4, 0.55), (2.5, 0.5), (4.4, 0.62))):
        r = 0.061 * (1 - s * 0.55); hh = 0.016 + 0.031 * s
        dd = u * math.cos(ang) + w * math.sin(ang)
        pc = cc + ax * hh + dd * r
        nn = (dd * 0.8 + ax * 0.9).normalized()
        su = (dd - nn * dd.dot(nn)).normalized(); sw = nn.cross(su)
        ell_c = [pc + (su * math.cos(2 * math.pi * k / 7) + sw * math.sin(2 * math.pi * k / 7)) * 0.0145 + nn * 0.001 for k in range(7)]
        ci = m.vert(pc + nn * 0.004, nn); ids = [m.vert(q, nn) for q in ell_c]
        for k in range(7): m.face([ci, ids[k], ids[(k + 1) % 7]], hexc('#fff6ee'), nn)

# ------------------------------------------------------------------ body
def build_body(m, P, V):
    """small cream pear (a touch warmer than the head, darker underside), round mitts hugging its sides, two short
    root tendrils that curl outward and up at the tan tips, the neck peg and the leaf collar (the sheet's front view)"""
    skin = hexc(V['body']); shade = mixc(skin, hexc('#bdb3a0'), 0.38)
    prof = [(0, 0.05), (0.06, 0.056), (0.1, 0.08), (0.123, 0.115), (0.122, 0.152), (0.106, 0.19), (0.084, 0.225), (0.064, 0.25), (0, 0.265)]
    lathe(m, prof, 16, lambda j, k: mixc(skin, shade, [0.9, 0.6, 0.28, 0.08, 0, 0, 0, 0, 0][j + 1]), ysc=0.92)
    tip, end = hexc(P['root_tip']), hexc(P['root_end'])
    for s in (-1, 1):
        d = Vector((s * 0.55, -0.15, -0.82)).normalized()
        o1 = Vector((0, 1, 0)).cross(d).normalized(); o2 = d.cross(o1)
        ellipsoid(m, Vector((s * 0.128, -0.014, 0.168)), o1 * 0.043, o2 * 0.043, d * 0.05, 10, 5, lambda j, k: skin)
        pts = [Vector((s * 0.04, 0.0, 0.085)), Vector((s * 0.047, -0.006, 0.048)), Vector((s * 0.058, -0.012, 0.022)),
               Vector((s * 0.083, -0.018, 0.012)), Vector((s * 0.108, -0.022, 0.02)), Vector((s * 0.12, -0.024, 0.04)),
               Vector((s * 0.11, -0.022, 0.056))]
        path = catmull(pts, 9)
        radii = [0.031 + (0.0125 - 0.031) * (i / 8) ** 0.9 for i in range(9)]
        tube(m, path, radii, 8, lambda j, k: end if j >= 6 else (tip if j >= 4 else skin))
    peg = hexc(P['peg'])
    lathe(m, [(0, 0.225), (0.05, 0.225), (0.05, 0.36), (0, 0.36)], 12, lambda j, k: peg)
    for k in range(6):
        az = math.radians(-90 + 60 * k)
        front = abs(math.sin(az) + 1) < 0.3
        base = Vector((0.03 * math.cos(az), 0.03 * 0.92 * math.sin(az), 0.258))
        leaf(m, base, az, math.radians(-50 if front else -33), 0.14 if front else 0.13, 0.106, 0.026,
             hexc(P['leaf']), hexc(P['leaf_under']), None, arch=0.05, curl=0.2, stations=[0.08, 0.3, 0.55, 0.78, 0.94],
             wexp=0.9, angles=[0, 50, 100, 150, 205, 260, 310])

# ------------------------------------------------------------------ assemble one variant
def make_materials():
    def mat(name, glow):
        mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
        mt.use_backface_culling = True   # closed volumes + outward shells: single-sided in the glTF
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        if glow:
            # the glTF exporter can't carry a vertex-colour emission (a linked Emission Color exports as a white
            # emissiveFactor), so the emission is the gold iris colour as a constant; Base Color still reads `Col`
            bsdf.inputs['Emission Color'].default_value = hexc('#ffd870')
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
    flat = [x for c in cols for x in c]
    attr.data.foreach_set('color', flat)
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    me.materials.append(mats[0])
    if any(part.fm): me.materials.append(mats[1])
    me.polygons.foreach_set('material_index', part.fm)
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in part.n])
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = origin
    return ob

def build_variant(key):
    V = VARIANTS[key]; P = COMMON
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    head, body = Part('head'), Part('body')
    bvh = build_head_base(head, hexc(V['skin']), math.radians(42) if V['moss'] else None)
    build_face(head, bvh, P, V)
    if V['swirls']: build_swirls(head, bvh, P)
    if V['moss']: build_moss(head, P, bvh)
    if V['crown'] == 'leaves': build_leaf_crown(head, P)
    else: build_blossom_crown(head, P, bvh)
    build_body(body, P, V)
    # feet exactly on the ground
    minz = min(v.z for v in body.v + head.v)
    for prt in (head, body):
        for v in prt.v: v.z -= minz
    pivot = PIVOT - Vector((0, 0, minz))
    ob_b = to_object(body, Vector((0, 0, 0)), mats)
    ob_h = to_object(head, pivot, mats)
    tb, th = body.tris(), head.tris()
    allv = [v for v in body.v + head.v]
    lo = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
    hi = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
    C = front_point(bvh, EYE_X, EYE_Z)
    print('KODAMA %s tris body %d head %d total %d size W%.3f D%.3f H%.3f pivot %s minz %.4f eyeN %s' % (
        key, tb, th, tb + th, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, tuple(round(c, 4) for c in pivot), minz,
        tuple(round(c, 3) for c in head_n(C))))
    name = 'kodama' if key == 'base' else 'kodama_' + key
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('KODAMA export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('KODAMA wrote', out)

for key in VARIANTS:
    if ONLY and key != ONLY: continue
    build_variant(key)
