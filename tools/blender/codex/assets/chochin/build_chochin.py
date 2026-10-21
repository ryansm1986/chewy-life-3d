# Chochin Ghost (Pawhaven enemy EN-1, the Burrow) -- Option A "Paper Lantern".
# Deterministic build, from an empty scene, of the two variant GLBs:
#   blender --background --factory-startup --python build_chochin.py -- [--only base|pink]
# One rigid part (the brief's one-piece note): a single mesh object `body`, origin (0, 0, 0) = the ground centre.
# The lantern floats: its bottom cap is 0.147 m above the origin, its top cap 1.40 m (the sheet: 1.25 m physical
# height + 0.15 m clearance).
#   paper      a ribbed surface of revolution: 7 puffy rolls between 6 darker grooves
#   caps       lacquer top and bottom caps (rounded pucks)
#   eye        a domed sclera lens standing out of the front; iris, warm lower crescent, pupil and two catchlights
#              as thin shells 4-7 mm over it; a thick lash tube along its top rim with an outward flick (+X)
#   face       the mouth split (a dark capsule shell on the paper), blush ovals, the long lolling tongue (a creased
#              tube out of the split, hanging forward and a little to +X, rounded tip)
# Vertex colours only (attribute `Col`, face-corner domain); one material `toon`. No rig, no textures, no UVs.
import bpy, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('CHOCHIN build pid', os.getpid())

# ------------------------------------------------------------------ colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    if isinstance(h, tuple): return h
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t):
    a, b = hexc(a), hexc(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

VARIANTS = {
    'base': dict(paper='#ff8a4a', groove_to='#c8502c'),
    'pink': dict(paper='#ff6a8a', groove_to='#c43a62', tongue='#e8507e', crease='#b8345f'),   # (a deeper tongue: it parts from the pink paper)
}
COMMON = dict(cap='#2c2430', cap_hi='#3c3242', sclera='#fff4db', iris='#503023', iris_low='#76472c',
              pupil='#2e1e1c', catch='#ffffff', tongue='#f46b91', crease='#d4507a', blush='#e98c91')

# ------------------------------------------------------------------ math
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def radial(th): return Vector((math.sin(th), -math.cos(th), 0))      # azimuth 0 = the front (-Y), + toward +X

def catmull(pts, n):
    P = [pts[0] + (pts[0] - pts[1])] + list(pts) + [pts[-1] + (pts[-1] - pts[-2])]; segs = len(pts) - 1
    out = []
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

def resample(poly, n):
    """n points evenly spaced by arc length along a dense polyline"""
    L = [0.0]
    for i in range(1, len(poly)): L.append(L[-1] + (poly[i] - poly[i - 1]).length)
    tot = L[-1]; out = []; j = 0
    for k in range(n):
        s = tot * k / (n - 1)
        while j < len(L) - 2 and L[j + 1] < s: j += 1
        t = (s - L[j]) / max(1e-12, L[j + 1] - L[j]); out.append(poly[j].lerp(poly[j + 1], t))
    return out

# ------------------------------------------------------------------ mesh accumulator
class Part:
    def __init__(self, name):
        self.name = name; self.v = []; self.n = []; self.f = []; self.fc = []
    def vert(self, p, n=None):
        self.v.append(Vector(p)); self.n.append(None if n is None else Vector(n).normalized()); return len(self.v) - 1
    def face(self, idx, col, hint):
        P = [self.v[i] for i in idx]
        nn = Vector((0, 0, 0))
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        if nn.dot(hint) < 0: idx = list(reversed(idx))
        self.f.append(list(idx)); self.fc.append(hexc(col))
    def finish_normals(self):
        acc = [Vector((0, 0, 0)) for _ in self.v]
        for f in self.f:
            P = [self.v[i] for i in f]
            nn = (P[1] - P[0]).cross(P[2] - P[0])
            if len(P) == 4: nn += (P[2] - P[0]).cross(P[3] - P[0])
            for i in f: acc[i] += nn
        for i, n in enumerate(self.n):
            if n is None: self.n[i] = acc[i].normalized() if acc[i].length > 1e-12 else Vector((0, 0, 1))
    def absorb(self, o):
        b = len(self.v); self.v += o.v; self.n += o.n
        self.f += [[i + b for i in f] for f in o.f]; self.fc += o.fc
    def tris(self): return sum(len(f) - 2 for f in self.f)

def ring_surface(m, rings, centres, colfn, pole0=None, pole1=None, closed=False):
    """quads between consecutive rings (closed loops of K verts), oriented away from the centres; optional poles"""
    ids = [[m.vert(p) for p in ring] for ring in rings]
    K = len(rings[0]); R = len(rings)
    for j in range(R - 1 + (1 if closed else 0)):
        j1 = (j + 1) % R
        c = (centres[j] + centres[j1]) / 2
        for k in range(K):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j1][(k + 1) % K], ids[j1][k]]
            fc = sum((m.v[i] for i in q), Vector()) / 4
            m.face(q, colfn(j, k), fc - c)
    for pole, j, ring, c in ((pole0, -1, 0, centres[0]), (pole1, R - 1, -1, centres[-1])):
        if pole is None: continue
        pi = m.vert(pole)
        for k in range(K):
            q = [pi, ids[ring][k], ids[ring][(k + 1) % K]]
            fc = sum((m.v[i] for i in q), Vector()) / 3
            m.face(q, colfn(j, k), fc - c)
    return ids

def lathe(m, prof, K, colfn, th0=0.0, rfn=None):
    """surface of revolution about Z: prof = [(r, z)...] bottom -> top; r = 0 ends become poles.
    rfn(r, z, th) may wobble the radius."""
    rings, cs = [], []
    body = list(prof); p0 = p1 = None
    if body[0][0] < 1e-6: p0 = Vector((0, 0, body[0][1])); body = body[1:]
    if body[-1][0] < 1e-6: p1 = Vector((0, 0, body[-1][1])); body = body[:-1]
    for r, z in body:
        ring = []
        for k in range(K):
            th = th0 + 2 * math.pi * k / K
            rr = rfn(r, z, th) if rfn else r
            ring.append(radial(th) * rr + Z * z)
        rings.append(ring); cs.append(Vector((0, 0, z)))
    return ring_surface(m, rings, cs, colfn, p0, p1)

# ------------------------------------------------------------------ surface ray casts (decals sit on these)
class Surf:
    def __init__(self, part):
        part.finish_normals()
        tv = [v.copy() for v in part.v]; tf = []
        for f in part.f:
            if len(f) == 3: tf.append(f)
            else: tf.append([f[0], f[1], f[2]]); tf.append([f[0], f[2], f[3]])
        self.v, self.f, self.n = tv, tf, list(part.n)
        self.bvh = BVHTree.FromPolygons(tv, tf)
    def cast(self, o, d):
        hit = self.bvh.ray_cast(o, d, 3.0)
        if hit[0] is None: return None, None
        p, _, fi, _ = hit; a, b, c = (self.v[i] for i in self.f[fi]); na, nb, nc = (self.n[i] for i in self.f[fi])
        v0, v1, v2 = b - a, c - a, p - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-14: return p, na
        wv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den; wu = 1 - wv - ww
        return p, (na * wu + nb * wv + nc * ww).normalized()
    def front(self, x, z): return self.cast(Vector((x, -1.5, z)), Y)

class Decal:
    """a local (u, v) frame on the surface at the front point (x, z): u along +X, v up"""
    def __init__(self, S, x, z):
        self.S = S; self.C, self.N = S.front(x, z)
        self.T = (X - self.N * X.dot(self.N)).normalized(); self.B = self.N.cross(self.T)
        if self.B.z < 0: self.B = -self.B
    def at(self, u, v, h):
        P0 = self.C + self.T * u + self.B * v
        p, n = self.S.cast(P0 + self.N * 0.25, -self.N)
        if p is None: p, n = P0, self.N
        return p + n * h, n

def poly_decal(m, D, c2, B, rings, h, col):
    """a flat colour shell h above the surface: boundary B [(du, dv)] about the centre c2, fanned, with inner rings
    (fractions of the boundary) so it follows the curvature"""
    S = len(B)
    def mk(u, v):
        p, n = D.at(u, v, h); return m.vert(p, n)
    ci = mk(*c2); cn = D.N
    ids = []
    for f in rings:
        ids.append([mk(c2[0] + f * du, c2[1] + f * dv) for du, dv in B])
    cf = col if callable(col) else (lambda j, k: col)
    for k in range(S):
        m.face([ci, ids[0][k], ids[0][(k + 1) % S]], cf(0, k), cn)
    for j in range(len(rings) - 1):
        for k in range(S):
            m.face([ids[j][k], ids[j][(k + 1) % S], ids[j + 1][(k + 1) % S], ids[j + 1][k]], cf(j + 1, k), cn)

def star_decal(m, D, inside, c2, S, rings, h, col):
    """the region inside(u, v) (star-shaped about c2), its boundary found by bisection along S rays"""
    def bnd(th):
        du, dv = math.cos(th), math.sin(th); lo, hi = 0.0, 0.4
        for _ in range(40):
            mid = (lo + hi) / 2
            if inside(c2[0] + du * mid, c2[1] + dv * mid): lo = mid
            else: hi = mid
        return du * lo, dv * lo
    poly_decal(m, D, c2, [bnd(2 * math.pi * k / S + math.pi / S) for k in range(S)], rings, h, col)

def tube(m, path, rad_w, rad_t, Wfn, K, colfn, cap0=True, cap1=True, crease=None, angles=None):
    """an elliptical tube along path (half-width rad_w(s) along W, half-thickness rad_t(s) along N = T x W),
    rounded ends (quarter-ellipse caps). Wfn(p, T) gives the width direction. crease(s) = an inward dent of the
    +N side's centre line (the tongue's groove). colfn(s, k)."""
    n = len(path)
    Ts = [(path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized() for i in range(n)]
    def section(p, T, w, t, s):
        W = Wfn(p, T); W = (W - T * W.dot(T)).normalized(); Nn = T.cross(W)
        out = []
        for k in range(K):
            a = angles[k] if angles else 2 * math.pi * k / K
            ca, sa = math.cos(a), math.sin(a)
            tt = t * sa
            if crease and sa > 0: tt -= crease(s) * max(0.0, 1 - abs(ca) * 3.6) ** 1.6
            out.append(p + W * (w * ca) + Nn * tt)
        return out
    rings, cs, ss = [], [], []
    if cap0:
        p, T = path[0], Ts[0]
        for a in (0.88, 0.55):
            ang = a * math.pi / 2
            q = p - T * (rad_t(0) * math.sin(ang))
            rings.append(section(q, T, rad_w(0) * math.cos(ang), rad_t(0) * math.cos(ang), 0.0)); cs.append(q); ss.append(0.0)
    for i, (p, T) in enumerate(zip(path, Ts)):
        s = i / (n - 1); rings.append(section(p, T, rad_w(s), rad_t(s), s)); cs.append(p); ss.append(s)
    if cap1:
        p, T = path[-1], Ts[-1]
        for a in (0.45, 0.8):
            ang = a * math.pi / 2
            q = p + T * (rad_w(1) * 0.9 * math.sin(ang))
            rings.append(section(q, T, rad_w(1) * math.cos(ang), rad_t(1) * math.cos(ang) ** 0.7, 1.0)); cs.append(q); ss.append(1.0)
    p0 = (path[0] - Ts[0] * rad_t(0)) if cap0 else None
    p1 = (path[-1] + Ts[-1] * rad_w(1) * 0.9) if cap1 else None
    ring_surface(m, rings, cs, lambda j, k: colfn(ss[max(0, min(j, len(ss) - 1))], k), p0, p1)

# ------------------------------------------------------------------ the paper
ZTOP, ZBOT = 1.322, 0.207            # where the envelope closes (hidden inside the caps)
ZC, HH, RMAX, PEXP = 0.764, 0.557, 0.471, 2.8
GROOVES = [1.185, 1.020, 0.850, 0.671, 0.496, 0.332]
GD, GW = 0.021, 0.050                # groove depth, groove rounding width
def env(z):
    o = abs(z - ZC) / HH
    return RMAX * max(0.0, 1 - o ** PEXP) ** (1 / PEXP)
def dip(z):
    d = min(abs(z - g) for g in GROOVES)
    if d >= GW: return 0.0
    x = d / GW
    return GD * (1 - math.sqrt(max(0.0, 1 - (1 - x) ** 2)))
def paper_r(z): return env(z) - dip(z)
def paper_rows():
    zs = [0.214, 0.245, 0.285, 0.318]
    G = GROOVES[::-1]
    for i, g in enumerate(G):
        zs.append(g)
        if i + 1 < len(G):
            g2 = G[i + 1]
            for d in (0.014, 0.05): zs.append(g + d)
            for d in (0.05, 0.014): zs.append(g2 - d)
    zs += [1.199, 1.235, 1.272, 1.304]
    return sorted(zs)
def wobble(r, z, th):
    """hand-made: each roll a touch out of round"""
    band = sum(1 for g in GROOVES if z < g)
    # the groove under the blush ovals is filled (on the sheet the blush covers it), so its ink line ends there
    if abs(z - BLUSH_G) < GW:
        a = math.atan2(math.sin(th), math.cos(th))
        r += dip(z) * math.exp(-((abs(a) - BLUSH_TH) / 0.20) ** 2)
    return r * (1 + 0.006 * math.sin(3 * th + band * 1.9) + 0.004 * math.sin(2 * th - band * 0.7))
BLUSH_X, BLUSH_Z, BLUSH_G = 0.284, 0.690, 0.671
BLUSH_TH = math.asin(BLUSH_X / 0.445)

def build_paper(m, V, K):
    zs = paper_rows()
    prof = [(0.0, ZBOT)] + [(paper_r(z), z) for z in zs] + [(0.0, ZTOP - 0.004)]
    paper = hexc(V['paper'])
    groove = mixc(paper, V['groove_to'], 0.30)
    near = mixc(paper, V['groove_to'], 0.08)
    low = mixc(paper, V['groove_to'], 0.10)
    zm = [None] + [(prof[j][1] + prof[j + 1][1]) / 2 for j in range(len(prof) - 1)]
    def col(j, k):
        # strip j lies between prof[j+1] and prof[j+2] (prof[0] is the bottom pole)
        if j < 0 or j + 2 >= len(prof): return mixc(paper, V['groove_to'], 0.2)
        za, zb = prof[j + 1][1], prof[j + 2][1]; zmid = (za + zb) / 2
        d = min(abs(zmid - g) for g in GROOVES)
        if d < 0.009: return groove
        if d < 0.034: return near
        if zmid < 0.30: return low
        return paper
    lathe(m, prof, K, col, th0=math.pi / K, rfn=wobble)

def build_caps(m, K):
    cap, hi = COMMON['cap'], COMMON['cap_hi']
    top = [(0.170, 1.283), (0.205, 1.300), (0.208, 1.370), (0.196, 1.394), (0.160, 1.403), (0.0, 1.407)]
    lathe(m, top, K, lambda j, k: hi if j == 2 else cap, th0=math.pi / K)
    bot = [(0.0, 0.143), (0.176, 0.147), (0.210, 0.154), (0.222, 0.169), (0.219, 0.231), (0.170, 0.246)]
    lathe(m, bot, K, lambda j, k: hi if j == 2 else cap, th0=math.pi / K)

# ------------------------------------------------------------------ the eye lens
EYE_Z, ES = 0.893, 0.936          # the eye's centre height; its size (a scale on the lens rings, 0.238 m rim)
def build_lens(m, K):
    # a deep dome (the sheet's side view shows the eye standing out like half a ball, the iris seen from the side),
    # a rounded rim, then a wall into the paper. rho before the ES scale; the lens is 3 % taller than wide.
    # Every ring keeps clear of the paper's crest envelope (ys: the rolls' outer surface, grooves ignored), so the
    # lens never sinks behind a roll: where the paper bulges forward (the eye's lower half) the lens rides forward
    # too, which tilts the eye up a little toward the 45-degree camera.
    #   (rho, dome y, clearance over the envelope: the ring's y is min(dome, ys - clear); clear None = ys + offset)
    rings_def = [(0.150, -0.484, 0.036), (0.214, -0.457, 0.032), (0.239, -0.444, 0.028), (0.252, None, -0.013),
                 (0.256, None, 0.004), (0.256, None, 0.085)]
    ys = lambda x, z: -math.sqrt(max(env(z) ** 2 - x * x, 0.01))
    front = Vector((0, min(-0.510, ys(0, EYE_Z) - 0.04), EYE_Z))
    rings, cs = [], []
    for rho, yd, cl in rings_def:
        rho *= ES
        ring = []
        for k in range(K):
            a = 2 * math.pi * k / K + math.pi / K
            x, z = rho * math.sin(a), EYE_Z + 1.03 * rho * math.cos(a)
            y = min(yd, ys(x, z) - cl) if yd is not None else ys(x, z) - cl
            ring.append(Vector((x, y, z)))
        rings.append(ring)
        cs.append(Vector((0, -0.2, EYE_Z)))
    ring_surface(m, rings, cs, lambda j, k: COMMON['sclera'], pole0=front)

def build_eye_features(m, SL):
    D = Decal(SL, 0.0, EYE_Z)
    ic = (0.0, -0.012)                                   # the iris sits a touch low (the sheet: 1.8 cm)
    IR = 0.157
    poly_decal(m, D, ic, [(IR * math.cos(2 * math.pi * k / 28), IR * math.sin(2 * math.pi * k / 28)) for k in range(28)],
               [0.55, 1.0], 0.0040, COMMON['iris'])
    # the warm lower crescent: inside the iris, outside a circle pushed up
    # (a strip between the two circles' lower arcs, tip to tip)
    r1, c2, r2 = IR * 0.86, 0.075, 0.150
    vo = lambda x: ic[1] - math.sqrt(max(r1 * r1 - x * x, 0))
    vi = lambda x: ic[1] + c2 - math.sqrt(max(r2 * r2 - x * x, 0))
    lo, hi = 0.0, r1
    for _ in range(50):
        mid = (lo + hi) / 2
        if vi(mid) > vo(mid): lo = mid
        else: hi = mid
    xt = lo; h = 0.0050; col = COMMON['iris_low']
    mk = lambda u, v: m.vert(*D.at(u, v, h))
    tl, tr = mk(-xt, vo(-xt)), mk(xt, vo(xt))
    N = 11
    cols = []
    for i in range(1, N):
        x = -xt * math.cos(math.pi * i / N)
        cols.append((mk(x, vo(x)), mk(x, vi(x))))
    m.face([tl, cols[0][0], cols[0][1]], col, D.N)
    for (a0, a1), (b0, b1) in zip(cols, cols[1:]): m.face([a0, b0, b1, a1], col, D.N)
    m.face([cols[-1][0], tr, cols[-1][1]], col, D.N)
    PR = 0.085
    poly_decal(m, D, (0.0, ic[1] - 0.006), [(PR * math.cos(2 * math.pi * k / 20), PR * math.sin(2 * math.pi * k / 20)) for k in range(20)],
               [0.5, 1.0], 0.0058, COMMON['pupil'])
    for c, r, S in (((-0.053, 0.078), 0.044, 14), ((0.087, -0.032), 0.026, 10)):
        poly_decal(m, D, c, [(r * math.cos(2 * math.pi * k / S), r * math.sin(2 * math.pi * k / S)) for k in range(S)],
                   [1.0], 0.0068, COMMON['catch'])

def build_lash(m, SL, SB):
    """a thick lacquer lash along the lens's top rim (from the left, over the top, to the right) with an outward flick
    curling up at +X; a tube sunk a little into the rim"""
    ctrl = []
    for deg, rho in ((160, 0.236), (140, 0.246), (115, 0.251), (90, 0.253), (65, 0.252), (44, 0.250), (28, 0.251),
                     (25, 0.270), (32, 0.300), (42, 0.326), (50, 0.338)):
        a = math.radians(deg)
        rho *= ES
        ctrl.append(Vector((rho * math.cos(a), 0, EYE_Z + 1.03 * rho * math.sin(a))))
    # depth: on the lens front rim, then lifting off it toward the paper for the flick (it stands proud like a horn)
    dense = catmull(ctrl, 60)
    pts = []
    for i, p in enumerate(dense):
        rho = math.hypot(p.x, p.z - EYE_Z)
        if rho < 0.249 * ES:
            hp, hn = SL.cast(Vector((p.x, -1.5, p.z)), Y)
            y = hp.y + 0.002 if hp is not None else -0.432
        else:
            hp, hn = SB.cast(Vector((p.x, -1.5, p.z)), Y)
            yb = hp.y if hp is not None else -0.4
            t = clamp((rho - 0.249 * ES) / 0.09)
            y = (-0.432) * (1 - t) + (yb - 0.022) * t
        pts.append(Vector((p.x, y, p.z)))
    # smooth the depth jumps
    for _ in range(6):
        pts = [pts[0]] + [(pts[i - 1] + pts[i] * 2 + pts[i + 1]) / 4 for i in range(1, len(pts) - 1)] + [pts[-1]]
    path = resample(pts, 12)
    cen = Vector((0, 0, EYE_Z))
    def Wfn(p, T):
        # the width lies across the face (radial in the face plane), so the lash shows its broad side to the front
        rd = Vector((p.x, 0, p.z - EYE_Z)).normalized()
        return rd
    rw = lambda s: 0.029 + 0.003 * math.sin(math.pi * clamp(s / 0.75)) - 0.004 * clamp((s - 0.75) / 0.25)
    rt = lambda s: 0.019
    tube(m, path, rw, rt, Wfn, 8, lambda s, k: COMMON['cap'])

# ------------------------------------------------------------------ mouth, blush, tongue
MOUTH_Z = 0.535
def build_face(m, V, SB):
    D = Decal(SB, 0.0, MOUTH_Z)
    hw, hh = 0.152, 0.031
    pts = []
    n_arc = 9
    for k in range(n_arc):                               # right end (round), then left end
        a = -math.pi / 2 + math.pi * k / (n_arc - 1)
        pts.append((hw - hh + hh * math.cos(a), hh * math.sin(a)))
    for k in range(n_arc):
        a = math.pi / 2 + math.pi * k / (n_arc - 1)
        pts.append((-(hw - hh) + hh * math.cos(a), hh * math.sin(a)))
    # densify the long straight edges
    B = []
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        B.append(a)
        if abs(a[0] - b[0]) > 0.1:
            for t in (0.2, 0.4, 0.6, 0.8): B.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    poly_decal(m, D, (0.0, 0.0), B, [0.5, 1.0], 0.0045, COMMON['cap'])
    for side in (-1, 1):
        Db = Decal(SB, side * BLUSH_X, BLUSH_Z)
        star_decal(m, Db, lambda u, v: (u / 0.068) ** 2 + (v / 0.060) ** 2 < 1, (0, 0), S=14, rings=[0.5, 1.0], h=0.0050,
                   col=COMMON['blush'])

def build_tongue(m, V):
    ctrl = [Vector((0.012, -0.385, 0.527)), Vector((0.014, -0.465, 0.524)), Vector((0.026, -0.508, 0.495)),
            Vector((0.046, -0.516, 0.435)), Vector((0.068, -0.506, 0.365)), Vector((0.088, -0.488, 0.305)),
            Vector((0.100, -0.470, 0.272))]
    path = resample(catmull(ctrl, 50), 9)
    def Wfn(p, T):
        return Vector((1.0, 0.0, 0.0)) + Vector((0, 0, 1)) * 0.0
    # spoon: narrow at the split, widest low, a rounded tip
    rw = lambda s: 0.076 + 0.056 * math.sin(math.pi / 2 * clamp(s / 0.82)) ** 1.1
    rt = lambda s: 0.027 + 0.012 * math.sin(math.pi / 2 * clamp(s / 0.3)) - 0.005 * s
    crease = lambda s: 0.019 * math.sin(math.pi * clamp((s - 0.05) / 1.0)) if s > 0.05 else 0.0
    # the section: 12 even steps plus two vertices hugging the crease, so the groove stays narrow
    ang = [math.radians(d) for d in (0, 30, 60, 81, 90, 99, 120, 150, 180, 210, 240, 270, 300, 330)]
    tcol, ccol = V.get('tongue', COMMON['tongue']), V.get('crease', COMMON['crease'])
    def col(s, k):
        if k in (3, 4) and 0.08 < s < 0.98:
            return mixc(tcol, ccol, 0.5 * math.sin(math.pi * clamp((s - 0.08) / 0.9)) ** 0.5)
        return tcol
    tube(m, path, rw, rt, Wfn, len(ang), col, cap0=True, cap1=True, crease=crease, angles=ang)

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
    for f, c in zip(me.polygons, part.fc): cols.extend([c] * f.loop_total)
    attr.data.foreach_set('color', [x for c in cols for x in c])
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    me.materials.append(mat)
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in part.n])
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = (0, 0, 0)
    return ob

def build_variant(key):
    V = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    paper = Part('paper'); build_paper(paper, V, 26)
    lens = Part('lens'); build_lens(lens, 28)
    SB, SL = Surf(paper), Surf(lens)
    body = Part('body')
    cnt = {}
    def add(name, p):
        cnt[name] = p.tris(); body.absorb(p)
    add('paper', paper); add('lens', lens)
    caps = Part('caps'); build_caps(caps, 22); add('caps', caps)
    eye = Part('eye'); build_eye_features(eye, SL); add('eye', eye)
    lash = Part('lash'); build_lash(lash, SL, SB); add('lash', lash)
    face = Part('face'); build_face(face, V, SB); add('face', face)
    tg = Part('tongue'); build_tongue(tg, V); add('tongue', tg)
    # normals: the absorbed parts already carry theirs (paper, lens); the rest are computed per part on absorb
    ob = to_object(body, mat)
    tot = body.tris()
    lo = Vector((min(v.x for v in body.v), min(v.y for v in body.v), min(v.z for v in body.v)))
    hi = Vector((max(v.x for v in body.v), max(v.y for v in body.v), max(v.z for v in body.v)))
    print('CHOCHIN %s tris %s total %d | W%.3f D%.3f H%.3f | x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (
        key, cnt, tot, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    name = 'chochin' if key == 'base' else 'chochin_' + key
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('CHOCHIN export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('CHOCHIN wrote', out)

for key in VARIANTS:
    if ONLY and key != ONLY: continue
    build_variant(key)
