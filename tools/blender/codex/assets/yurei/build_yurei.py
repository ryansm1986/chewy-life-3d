# Yurei (Pawhaven enemy EN-1, the Haunted modifier) -- Option A "Sheet Ghost".
# Deterministic build, from an empty scene, of the two variant GLBs:
#   blender --background --factory-startup --python build_yurei.py -- [--only base|sleepy]
# Parts (enemy contract): one mesh object per part, origin = pivot, rotation 0, scale 1, vertex colours only.
#   body   the sheet (dome + flared skirt + six-scallop rolled hem + tucked underside), the face (shallow shells
#          3-5 mm off the surface), the paper triangle (hitaikakushi), [sleepy: the nightcap + pompom]
#   armL   the +X sleeve: shoulder ball, flared tube, rolled cuff, blind hole        origin = the +X shoulder pivot
#   armR   the mirror                                                                 origin = the -X shoulder pivot
#   flame  the hitodama: a teardrop spirit flame with a curled wisp tip, all `glow`  origin = the flame's centre
# Colour attribute `Col` (face-corner domain); materials `toon` and `glow`. No rig, no textures, no UVs.
import bpy, math, os, sys
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('YUREI build pid', os.getpid())

# ------------------------------------------------------------------ colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t):
    if isinstance(a, str): a = hexc(a)
    if isinstance(b, str): b = hexc(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

# the sheet's palette (sRGB as seen). The game lights a vertex as glow when its LINEAR g > .85, b > .85 and r < .9:
# only the flame is in that range (the pompom is #eae9fa, not the brief's #e8eefc, which would glow).
PAL = dict(sheet='#e4e2ef', shade='#b0b8de', hem='#8e9cd2', hem_lo='#7f8dc8', under='#a3acd6',
           eye='#292135', eye_lo='#5b3d7d', catch='#ffffff', white='#fbfaff', lash='#292135',
           cheek='#e98c91', mouth='#292135', mouth_lo='#5a3a6a',
           tri='#ffffff', tri_edge='#b8bce0',
           ball='#b0b8de', hole='#7482c2', hole_deep='#5e68a8',
           flame='#8af4ff', flame_core='#d8fcff',
           cap='#6a8ee0', cap_lo='#5677cc', brim='#6386dc', pom='#eae9fa', pom_lo='#d4d5f0')
VARIANTS = {'base': dict(sleepy=False), 'sleepy': dict(sleepy=True)}

# ------------------------------------------------------------------ math
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(a, b, x):
    t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t)
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

def catmull(pts, n):
    """n points on an open Catmull-Rom curve through pts"""
    P = [pts[0] + (pts[0] - pts[1])] + list(pts) + [pts[-1] + (pts[-1] - pts[-2])]; segs = len(pts) - 1
    out = []
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

def resample(poly, n):
    L = [0.0]
    for i in range(1, len(poly)): L.append(L[-1] + (poly[i] - poly[i - 1]).length)
    tot = L[-1]; out = []; j = 0
    for k in range(n):
        s = tot * k / (n - 1)
        while j < len(L) - 2 and L[j + 1] < s: j += 1
        t = (s - L[j]) / max(1e-12, L[j + 1] - L[j]); out.append(poly[j].lerp(poly[j + 1], t))
    return out

def frames(path):
    """parallel-transport frames along a polyline: [(T, N, B)]"""
    n = len(path)
    Ts = [(path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = Z if abs(Ts[0].dot(Z)) < 0.9 else X
    N = (ref - Ts[0] * ref.dot(Ts[0])).normalized()
    out = []
    for i, T in enumerate(Ts):
        if i:
            N = (N - T * N.dot(T)).normalized()
        out.append((T, N, T.cross(N)))
    return out

# ------------------------------------------------------------------ mesh accumulator
class Part:
    def __init__(self, name):
        self.name = name; self.v = []; self.n = []; self.f = []; self.fc = []; self.fm = []
    def vert(self, p, n=None):
        self.v.append(Vector(p)); self.n.append(None if n is None else Vector(n).normalized()); return len(self.v) - 1
    def add(self, idx, col, mat=0):
        cols = col if isinstance(col, list) else [col] * len(idx)
        self.f.append(list(idx)); self.fc.append(cols); self.fm.append(mat)
    def face(self, idx, col, hint, mat=0):
        """a face whose orientation is chosen to point along `hint` (open decal shells)"""
        P = [self.v[i] for i in idx]
        nn = Vector((0, 0, 0))
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        if nn.dot(hint) < 0:
            idx = list(reversed(idx))
            if isinstance(col, list): col = list(reversed(col))
        self.add(idx, col, mat)
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

def grid(m, rings, pole0=None, pole1=None, colf=None, vcol=None, mat=0, wrap=False):
    """a closed surface: quads between consecutive rings (closed loops of K verts), optional poles at both ends,
    `wrap` joins the last ring to the first (a torus). Winding is consistent; the whole piece is flipped if its
    signed volume is negative, so every face points out. colf(j, k) -> a colour (flat face) or None (then the
    corners take vcol(p), a smooth painted gradient)."""
    f0 = len(m.f)
    ids = [[m.vert(p) for p in ring] for ring in rings]
    K = len(rings[0]); R = len(rings)
    def put(q, j, k):
        c = colf(j, k) if colf else None
        if c is None: c = [vcol(m.v[i]) for i in q]
        m.add(q, c, mat(j, k) if callable(mat) else mat)
    for j in range(R - 1 + (1 if wrap else 0)):
        j1 = (j + 1) % R
        for k in range(K):
            put([ids[j][k], ids[j][(k + 1) % K], ids[j1][(k + 1) % K], ids[j1][k]], j, k)
    if pole0 is not None:
        pi = m.vert(pole0)
        for k in range(K): put([pi, ids[0][(k + 1) % K], ids[0][k]], -1, k)
    if pole1 is not None:
        pi = m.vert(pole1)
        for k in range(K): put([pi, ids[-1][k], ids[-1][(k + 1) % K]], R - 1, k)
    vol = 0.0
    for f in m.f[f0:]:
        P = [m.v[i] for i in f]
        for i in range(1, len(P) - 1): vol += P[0].dot(P[i].cross(P[i + 1]))
    if vol < 0:
        for i in range(f0, len(m.f)): m.f[i].reverse(); m.fc[i].reverse()
    return ids

def ellipsoid(m, c, ax, ay, az, K, R, colf=None, vcol=None, mat=0):
    rings = []
    for j in range(1, R + 1):
        eta = -math.pi / 2 + math.pi * j / (R + 1)
        rings.append([c + ax * (math.cos(eta) * math.cos(2 * math.pi * k / K)) + ay * (math.cos(eta) * math.sin(2 * math.pi * k / K)) + az * math.sin(eta) for k in range(K)])
    return grid(m, rings, c - az, c + az, colf, vcol, mat)

# ------------------------------------------------------------------ the sheet (body surface)
H_TOP = 0.835                       # the dome's top (the sheet: 0.84 m overall, the triangle tip at the dome top)
DOME_C, DOME_R, DOME_B = 0.500, 0.285, 0.335   # the head dome: an egg (half-ellipse 0.285 wide, 0.335 tall), round shoulders
CAP_C = 0.555                        # (the nightcap's brim plane is set about this centre)
HEM_R = 0.390                       # the skirt's half-width at the hem (sheet front 0.39, back 0.385)
RHO = 0.027                         # the rolled hem's radius
KB = 48                             # segments round the body (divisible by 12: lobes and cusps on vertices)

def zb(th): return 0.0225 * (1 - math.cos(6 * th))            # the hem's bottom: six scallops, a lobe at the front
def r_wall(z):
    if z >= DOME_C: return DOME_R * math.sqrt(max(0.0, 1 - ((z - DOME_C) / DOME_B) ** 2))
    t = clamp((DOME_C - z) / (DOME_C - 0.04)); return DOME_R + (HEM_R - DOME_R) * t ** 1.25
def skirt(z): return smooth(0.52, 0.06, z)                     # 0 on the dome .. 1 at the hem
def fold(th, z): return 1 + 0.028 * math.cos(6 * th) * smooth(0.45, 0.05, z)   # the lobes swell into soft folds
def depth(th, z):
    s = skirt(z); return 1 + s * (0.09 - 0.05 * math.cos(th))  # the hem trails back (front x1.04, back x1.14)
def place(rad, z, th, s_override=None):
    zz = z if s_override is None else s_override
    r = rad * fold(th, zz)
    return Vector((r * math.sin(th), -r * math.cos(th) * depth(th, zz), z))

def body_rings():
    """the body's rings top -> bottom (without the poles), and a per-ring tag"""
    rings, tags = [], []
    TH = [2 * math.pi * k / KB for k in range(KB)]
    for a in range(1, 9):                                       # the dome: 11.25 deg steps from the top
        ang = math.radians(90 * a / 8)
        z = DOME_C + DOME_B * math.cos(ang); rad = DOME_R * math.sin(ang)
        rings.append([place(rad, z, th) for th in TH]); tags.append('dome')
    zt0 = 0.0225 + RHO + RHO * math.sin(math.radians(60))
    for i in range(1, 7):                                       # the skirt: down to the roll's top (60 deg on the roll)
        f = i / 6
        ring = []
        for th in TH:
            zt = zb(th) + RHO + RHO * math.sin(math.radians(60))
            z = DOME_C + (zt0 - DOME_C) * f + (zt - zt0) * f ** 2.5
            ring.append(place(r_wall(z), z, th))
        rings.append(ring); tags.append('skirt' if i < 6 else 'rolltop')
    for phi in (15, -30, -75, -120, -165):                       # the rolled hem (a torus-like lip)
        ring = []
        for th in TH:
            zc = zb(th) + RHO; zt = zc + RHO * math.sin(math.radians(60))
            rc = r_wall(zt) - RHO * math.cos(math.radians(60))
            p = math.radians(phi)
            ring.append(place(rc + RHO * math.cos(p), zc + RHO * math.sin(p), th, s_override=0.0))
        rings.append(ring); tags.append('roll')
    return rings, tags

def build_body_surface(m):
    rings, tags = body_rings()
    sheet, shade = hexc(PAL['sheet']), hexc(PAL['shade'])
    def vcol(p):
        th = math.atan2(p.x, -p.y)
        low = smooth(0.50, 0.06, p.z)
        crease = 0.5 * (1 - math.cos(6 * th)) * smooth(0.40, 0.08, p.z)      # the folds between the lobes
        back = 0.5 * (1 + math.cos(th + math.pi))                            # (the back a touch cooler)
        return mixc(sheet, shade, clamp(0.36 * low + 0.22 * crease + 0.06 * back * low))
    hem, hem_lo, under = hexc(PAL['hem']), hexc(PAL['hem_lo']), hexc(PAL['under'])
    nr = len(rings)
    def colf(j, k):
        if j < 0: return None                                   # the top pole: painted
        if j >= nr - 1: return under                             # the underside fan
        if tags[j] in ('rolltop', 'roll'): return hem_lo if j >= nr - 3 else hem
        return None
    top = Vector((0, 0, H_TOP))
    bot = Vector((0, 0.02, 0.17))                                # the tucked-up underside (a shallow hollow)
    grid(m, rings, top, bot, colf, vcol)
    # the outer surface only (no underside) for decal ray casts
    return rings

class Surface:
    def __init__(self, rings):
        V, F = [], []
        K = len(rings[0])
        for ring in rings: V.extend(ring)
        for j in range(len(rings) - 1):
            for k in range(K):
                F.append((j * K + k, j * K + (k + 1) % K, (j + 1) * K + (k + 1) % K, (j + 1) * K + k))
        V.append(Vector((0, 0, H_TOP)))
        for k in range(K): F.append((len(V) - 1, (k + 1) % K, k))
        self.bvh = BVHTree.FromPolygons(V, F)
    def cast(self, o, d):
        hit = self.bvh.ray_cast(o, d)
        if hit[0] is None: return None, None
        n = hit[1]
        if n.dot(d) > 0: n = -n
        return hit[0], n
    def front(self, x, z):
        p, n = self.cast(Vector((x, -1.0, z)), Y)
        return p, n

class Scaled:
    """a decal frame whose (u, v) are scaled about its centre (the eyes, 13 % bigger)"""
    def __init__(self, D, k): self.D, self.k = D, k
    def at(self, u, v, h): return self.D.at(u * self.k, v * self.k, h)

class Decal:
    """a local (u, v) frame on the body surface round the point seen at (x, z) from the front; u ~ +X, v ~ up"""
    def __init__(self, S, x, z):
        self.S = S; self.C, self.N = S.front(x, z)
        self.T = (X - self.N * X.dot(self.N)).normalized(); self.B = self.N.cross(self.T)
    def at(self, u, v, h):
        P0 = self.C + self.T * u + self.B * v
        p, n = self.S.cast(P0 + self.N * 0.2, -self.N)
        if p is None: p, n = P0, self.N
        return p + n * h, n

def star_decal(m, D, inside, c2, S, h, col, rings=(1.0,), mat=0):
    """a flat colour patch: the region inside(u, v) (star-shaped about c2); boundary by bisection along S rays"""
    def bnd(th):
        du, dv = math.cos(th), math.sin(th); lo, hi = 0.0, 0.3
        for _ in range(40):
            mid = (lo + hi) / 2
            if inside(c2[0] + du * mid, c2[1] + dv * mid): lo = mid
            else: hi = mid
        return du * lo, dv * lo
    B = [bnd(2 * math.pi * k / S + 0.5 * math.pi / S) for k in range(S)]
    def mk(u, v):
        p, n = D.at(u, v, h); return m.vert(p, n), n
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

def stroke(m, D, pts, hw, h, col, caps=True, cap_n=6):
    """a stroke of half-width hw (number or hw(i)) along pts [(u, v)], with round end caps"""
    n = len(pts); hwf = hw if callable(hw) else (lambda i: hw)
    A, Bs, N0 = [], [], []
    for i in range(n):
        w = hwf(i)
        a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]
        du, dv = b[0] - a[0], b[1] - a[1]; ln = math.hypot(du, dv); nu, nv = -dv / ln, du / ln
        u, v = pts[i]
        p, nn = D.at(u + nu * w, v + nv * w, h); A.append(m.vert(p, nn)); N0.append(nn)
        p, nn = D.at(u - nu * w, v - nv * w, h); Bs.append(m.vert(p, nn))
    for i in range(n - 1):
        m.face([A[i], A[i + 1], Bs[i + 1], Bs[i]], col, N0[i])
    if caps:
        for end, i0, i1 in ((0, 0, 1), (n - 1, n - 1, n - 2)):
            w = hwf(end); u, v = pts[end]
            du, dv = pts[i0][0] - pts[i1][0], pts[i0][1] - pts[i1][1]; ln = math.hypot(du, dv); du, dv = du / ln, dv / ln
            nu, nv = -dv, du
            c, cn = D.at(u, v, h); ci = m.vert(c, cn)
            prev = None
            # half-disc from one side to the other through the tip
            arc = []
            for s in range(cap_n + 1):
                a = math.pi * s / cap_n
                arc.append(m.vert(*D.at(u + (nu * math.cos(a) + du * math.sin(a)) * w, v + (nv * math.cos(a) + dv * math.sin(a)) * w, h)))
            for s in range(cap_n):
                m.face([ci, arc[s], arc[s + 1]], col, cn)

def ell_in(cu, cv, a, b, rot=0.0):
    ca, sa = math.cos(rot), math.sin(rot)
    def f(u, v):
        du, dv = u - cu, v - cv
        x, y = du * ca + dv * sa, -du * sa + dv * ca
        return (x / a) ** 2 + (y / b) ** 2 < 1
    return f

# ------------------------------------------------------------------ the face
EYE_X, EYE_Z = 0.117, 0.553          # sheet front: the eyes' centres (incl. lashes) at x +-0.122, z 0.553
EYE_SCALE = 1.13
def build_eye(m, S, side, sleepy):
    D0 = Decal(S, side * EYE_X, EYE_Z)
    D = Scaled(D0, EYE_SCALE)
    s = side
    # the eye white: a tall oval shifted outward; the iris covers all but an outer crescent
    wa, wb, wc = 0.056, 0.067, (s * 0.009, 0.0)
    ia, ib, ic = 0.046, 0.064, (-s * 0.002, -0.002)
    lid = (lambda u: 0.006 - 0.10 * s * u) if sleepy else (lambda u: 1.0)
    white = lambda u, v: ell_in(*wc, wa, wb)(u, v) and v < lid(u)
    iris = lambda u, v: ell_in(*ic, ia, ib)(u, v) and v < lid(u) - 0.001
    c_w = (wc[0], -0.022 if sleepy else 0.0)
    c_i = (ic[0], -0.026 if sleepy else -0.004)
    star_decal(m, D, white, c_w, 20, 0.0026, hexc(PAL['white']))
    star_decal(m, D, iris, c_i, 20, 0.0032, hexc(PAL['eye_lo']))
    dark = lambda u, v: iris(u, v) and ((u - ic[0]) / 0.052) ** 2 + ((v - 0.024) / 0.076) ** 2 < 1
    star_decal(m, D, dark, (ic[0], 0.004 if not sleepy else -0.016), 20, 0.0037, hexc(PAL['eye']))
    # catchlights: a big one upper-left and a small one lower-right (both eyes lit from the upper left, like the sheet)
    cb = (-0.012 + ic[0], 0.022) if not sleepy else (-0.012 + ic[0], -0.012)
    rb = 0.0155 if not sleepy else 0.010
    star_decal(m, D, lambda u, v: (u - cb[0]) ** 2 + ((v - cb[1]) / 1.15) ** 2 < rb ** 2, cb, 12, 0.0043, hexc(PAL['catch']))
    if not sleepy:
        cs_ = (0.014 + ic[0], -0.030)
        star_decal(m, D, lambda u, v: (u - cs_[0]) ** 2 + (v - cs_[1]) ** 2 < 0.0068 ** 2, cs_, 8, 0.0043, hexc(PAL['catch']))
    lash = hexc(PAL['lash'])
    if not sleepy:
        # the upper lash line hugging the white's top, thickening to the outer corner, and three lash ticks
        pts = []
        for i in range(11):
            a = math.radians(118 - 113 * i / 10) if s > 0 else math.radians(62 + 113 * i / 10)
            pts.append((wc[0] + (wa + 0.002) * math.cos(a), (wb + 0.002) * math.sin(a)))
        stroke(m, D, pts, lambda i: 0.0050 + 0.0042 * i / 10, 0.0046, lash)
        for a_deg, L in ((8, 0.020), (30, 0.022), (52, 0.018)):
            a = math.radians(a_deg) if s > 0 else math.radians(180 - a_deg)
            ex, ey = math.cos(a), math.sin(a)
            p0 = (wc[0] + (wa + 0.004) * ex, (wb + 0.004) * ey)
            d = (ex * 1.0 + 0.0, ey * 1.0 + 0.35); dl = math.hypot(*d); d = (d[0] / dl, d[1] / dl)
            p1 = (p0[0] + d[0] * L, p0[1] + d[1] * L)
            stroke(m, D, [p0, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2), p1], 0.0050, 0.0045, lash, cap_n=4)
    else:
        # the heavy half-closed lid: a straight stroke along the lid line, a little flick at the outer corner
        ui, uo = wc[0] - s * (wa + 0.004), wc[0] + s * (wa + 0.006)
        pts = [(ui + (uo - ui) * i / 8, lid(ui + (uo - ui) * i / 8) + 0.004) for i in range(9)]
        pts.append((uo + s * 0.010, lid(uo) + 0.010))
        stroke(m, D, pts, lambda i: 0.0062 + 0.0022 * min(i, 8) / 8, 0.0046, lash)
    # the brow: a worried arc, the inner end raised
    D = D0
    bi, bo = (-s * 0.020, 0.127), (s * 0.030, 0.095)
    pts = []
    for i in range(9):
        t = i / 8
        u = bi[0] + (bo[0] - bi[0]) * t; v = bi[1] + (bo[1] - bi[1]) * t + 0.0035 * math.sin(math.pi * t)
        pts.append((u, v))
    stroke(m, D, pts, lambda i: 0.0078 + 0.0012 * math.sin(math.pi * i / 8), 0.0040, lash)

def build_face(m, S, sleepy):
    for side in (-1, 1): build_eye(m, S, side, sleepy)
    # the little "oh" mouth: a tall dark oval, lighter at the bottom
    D = Decal(S, 0.0, 0.467)
    star_decal(m, D, ell_in(0, 0, 0.0175, 0.0265), (0, 0), 16, 0.0032, hexc(PAL['mouth']))
    star_decal(m, D, lambda u, v: ell_in(0, -0.004, 0.0175, 0.0265)(u, v) and ell_in(0, -0.024, 0.014, 0.014)(u, v) and ell_in(0, 0, 0.0175, 0.0265)(u, v),
               (0, -0.016), 10, 0.0038, hexc(PAL['mouth_lo']))
    # the cheeks: pink ovals under the outer half of the eyes
    for side in (-1, 1):
        D = Decal(S, side * 0.165, 0.458)
        star_decal(m, D, ell_in(0, 0, 0.040, 0.0255), (0, 0), 16, 0.0028, hexc(PAL['cheek']))

# ------------------------------------------------------------------ the paper triangle (hitaikakushi)
def rounded_triangle(base, height, rc, n_corner):
    """a closed outline (u across, v up) of a triangle with rounded corners; base on v = 0, apex up"""
    A = Vector((-base / 2, 0, 0)); B = Vector((base / 2, 0, 0)); C = Vector((0, height, 0))
    P = [A, B, C]
    pts = []
    for i in range(3):
        p, a, b = P[i], P[i - 1], P[(i + 1) % 3]
        da = (a - p).normalized(); db = (b - p).normalized()
        half = math.acos(clamp(da.dot(db), -1, 1)) / 2
        dist = rc / math.sin(half)
        bis = (da + db).normalized(); c = p + bis * dist
        t1 = p + da * (rc / math.tan(half)); t2 = p + db * (rc / math.tan(half))
        a1 = math.atan2(t1.y - c.y, t1.x - c.x); a2 = math.atan2(t2.y - c.y, t2.x - c.x)
        # go the short way round from t1 to t2 (clockwise or ccw consistently, outline is ccw: A -> B -> C)
        while a2 > a1: a2 -= 2 * math.pi
        if a1 - a2 > math.pi: a2 += 2 * math.pi
        for k in range(n_corner + 1):
            a = a1 + (a2 - a1) * k / n_corner
            pts.append(Vector((c.x + rc * math.cos(a), c.y + rc * math.sin(a), 0)))
    # make sure it runs ccw
    ar = sum(pts[i].x * pts[(i + 1) % len(pts)].y - pts[(i + 1) % len(pts)].x * pts[i].y for i in range(len(pts)))
    if ar < 0: pts.reverse()
    # densify the straight edges so the bend round the forehead stays smooth
    dense = []
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        L = (b - a).length; nseg = max(1, int(L / 0.035))
        for k in range(nseg): dense.append(a.lerp(b, k / nseg))
    return dense

def rounded_tri_inside(base, height, rc, v0):
    """inside-test of a triangle (base on v = v0, apex up, centred on u = 0) with corners rounded to radius rc"""
    A = Vector((-base / 2, v0)); B = Vector((base / 2, v0)); C = Vector((0, v0 + height))
    la, lb, lc = (B - C).length, (C - A).length, (A - B).length
    I = (A * la + B * lb + C * lc) / (la + lb + lc)              # the incentre
    r_in = abs((B - A).x * (C - A).y - (B - A).y * (C - A).x) / (la + lb + lc)
    k = (r_in - rc) / r_in                                       # shrink toward the incentre, then grow by rc
    T = [I + (P - I) * k for P in (A, B, C)]
    def seg_d(p, a, b):
        ab = b - a; t = clamp((p - a).dot(ab) / ab.dot(ab)); return (p - (a + ab * t)).length
    def in_tri(p):
        def sd(a, b): return (b - a).x * (p - a).y - (b - a).y * (p - a).x
        d1, d2, d3 = sd(T[0], T[1]), sd(T[1], T[2]), sd(T[2], T[0])
        return (d1 >= 0 and d2 >= 0 and d3 >= 0) or (d1 <= 0 and d2 <= 0 and d3 <= 0)
    def f(u, v):
        p = Vector((u, v))
        return in_tri(p) or min(seg_d(p, T[0], T[1]), seg_d(p, T[1], T[2]), seg_d(p, T[2], T[0])) <= rc
    return f, (I.x, I.y)

def build_triangle(m, S, sleepy=False):
    """the hitaikakushi: a flat paper triangle painted on the brow, 3 mm proud, following the dome's curve (round
    r2: no longer a standing card), with a 4 mm soft lavender edge under it so it reads on the white sheet"""
    base, height = 0.200, 0.172
    D = Decal(S, 0.0, 0.752)
    v0 = -0.062
    paper, cen = rounded_tri_inside(base, height, 0.020, v0)
    edge, _ = rounded_tri_inside(base + 0.018, height + 0.015, 0.025, v0 - 0.005)
    star_decal(m, D, edge, cen, 40, 0.0022, hexc(PAL['tri_edge']), rings=(1.0,))
    star_decal(m, D, paper, cen, 40, 0.0032, hexc(PAL['tri']), rings=(0.35, 0.7, 1.0))

# ------------------------------------------------------------------ the nightcap (Sleepy)
def build_cap(m, S):
    cap, cap_lo, brim = hexc(PAL['cap']), hexc(PAL['cap_lo']), hexc(PAL['brim'])
    alpha = math.radians(31); d = 0.150
    n = Vector((0, math.sin(alpha), math.cos(alpha)))          # the brim's plane leans back: front high, back low
    c = Vector((0, 0, CAP_C)) + n * d
    rc = math.sqrt(0.280 ** 2 - d * d)
    e1 = X; e2 = n.cross(e1)                                    # e2 points to the front-up
    if e2.y > 0: e2 = -e2
    KC = 24
    # the brim: a soft rolled band (flattened tube) round the dome
    rings = []
    for i in range(KC):
        a = 2 * math.pi * i / KC
        rd = (e1 * math.sin(a) + e2 * math.cos(a)).normalized()
        hp, hn = S.cast(c, rd)                                   # (from inside the head out to the sheet)
        cc = (hp if hp is not None else c + rd * rc) + rd * 0.012
        out = (cc - Vector((0, 0, CAP_C))).normalized()
        ring = []
        for k in range(6):
            b = 2 * math.pi * k / 6
            ring.append(cc + out * (0.018 * math.cos(b)) + n * (0.028 * math.sin(b)))
        rings.append(ring)
    grid(m, rings, colf=lambda j, k: brim, wrap=True)
    # the crown: a cone hugging the dome from the brim, up and over to the +X side, flopping down to the pompom
    ctrl = [(c, rc + 0.010), (c + n * 0.070, 0.212), (c + n * 0.140, 0.150), (Vector((0.075, 0.040, 0.925)), 0.088),
            (Vector((0.200, 0.020, 0.940)), 0.058), (Vector((0.300, 0.000, 0.880)), 0.040), (Vector((0.335, -0.015, 0.790)), 0.026)]
    dense = catmull([p for p, r in ctrl], 80)
    spine = resample(dense, 13)
    # the radius by the nearest control point's arc position (piecewise linear in arc length)
    def arclen(pts):
        L = [0.0]
        for i in range(1, len(pts)): L.append(L[-1] + (pts[i] - pts[i - 1]).length)
        return L
    Ld = arclen(dense)
    cl = [min(range(len(dense)), key=lambda i: (dense[i] - p).length) for p, r in ctrl]
    cL = [Ld[i] for i in cl]; cR = [r for p, r in ctrl]
    Ls = arclen(spine)
    def rad_at(L):
        for i in range(len(cL) - 1):
            if L <= cL[i + 1] or i == len(cL) - 2:
                t = clamp((L - cL[i]) / max(1e-9, cL[i + 1] - cL[i])); return cR[i] + (cR[i + 1] - cR[i]) * t
    F = frames(spine)
    rings = []
    KC2 = 16
    for i, (p, (T, N, B)) in enumerate(zip(spine, F)):
        r = rad_at(Ls[i])
        rings.append([p + (N * math.cos(2 * math.pi * k / KC2) + B * math.sin(2 * math.pi * k / KC2)) * r for k in range(KC2)])
    tip = spine[-1] + F[-1][0] * 0.018
    def vcol(p):
        q = (p - c); up = clamp(q.dot(n) / 0.3)
        return mixc(cap_lo, cap, 0.45 + 0.55 * up)
    grid(m, rings, c - n * 0.03, tip, None, vcol)
    # the pompom at the tip
    pc = spine[-1] + F[-1][0] * 0.032
    pom, pom_lo = hexc(PAL['pom']), hexc(PAL['pom_lo'])
    ellipsoid(m, pc, X * 0.056, Y * 0.056, Z * 0.054, 12, 6, vcol=lambda p: mixc(pom_lo, pom, smooth(-0.05, 0.03, p.z - pc.z)))
    return pc

# ------------------------------------------------------------------ the sleeves
PIVOT = Vector((0.262, -0.045, 0.465))      # the +X shoulder (the brief: about (+0.22, -0.06, 0.47))
SPINE = [Vector((0, 0, 0)), Vector((0.034, -0.010, -0.055)), Vector((0.075, -0.030, -0.138)),
         Vector((0.115, -0.052, -0.208)), Vector((0.150, -0.070, -0.266))]
def build_arm(m, side):
    sx = side
    piv = Vector((PIVOT.x * sx, PIVOT.y, PIVOT.z))
    mir = lambda v: Vector((v.x * sx, v.y, v.z)) + piv        # (built in model space; to_object moves the origin)
    path = resample(catmull([mir(p) for p in SPINE], 40), 7)
    F = frames(path)
    sheet, shade = hexc(PAL['sheet']), hexc(PAL['shade'])
    hem, hole, deep = hexc(PAL['hem']), hexc(PAL['hole']), hexc(PAL['hole_deep'])
    K = 16
    T1 = (F[-1][0] + Vector((0.84 * sx, -0.54, 0.0)) * 1.15).normalized()   # the cuff turns out and forward (seen from the front and the side)
    N1 = (F[-1][1] - T1 * F[-1][1].dot(T1)).normalized(); B1 = T1.cross(N1); E = path[-1]
    def ring_at(c, N, B, r):
        return [c + (N * math.cos(2 * math.pi * k / K) + B * math.sin(2 * math.pi * k / K)) * r for k in range(K)]
    rings, tags = [], []
    rad = [0.056, 0.068, 0.073, 0.078, 0.083, 0.089, 0.094]
    for i, (p, (T, N, B)) in enumerate(zip(path, F)):
        rings.append(ring_at(p, N, B, rad[i])); tags.append('wall')
    # the rolled cuff: a torus-like lip from the outer wall round into the hole
    Rc, rho = 0.097, 0.023
    for phi in (-50, 0, 50, 100, 150):
        a = math.radians(phi)
        c = E + T1 * (0.004 + rho * math.sin(a))
        rings.append(ring_at(c, N1, B1, Rc + rho * math.cos(a))); tags.append('cuff')
    # the hole: the inner wall going back up the sleeve, a dark blind bottom
    for dz, r in ((-0.022, 0.073), (-0.055, 0.066)):
        rings.append(ring_at(E + T1 * dz, N1, B1, r)); tags.append('hole')
    root = path[0] - F[0][0] * 0.040
    inner = E + T1 * -0.068
    def vcol(p):
        # soft painted shade on the sleeve's underside and toward the cuff
        t = clamp((p - path[0]).dot(T1) / 0.30)
        under = clamp(-(p - path[min(6, int(t * 6))]).normalized().z)
        return mixc(sheet, shade, clamp(0.12 + 0.30 * under * t + 0.10 * t))
    nr = len(rings)
    def colf(j, k):
        # bands: 0-5 the wall (painted), 6-10 the cuff roll, 11-12 the hole's wall, the end fan its dark bottom
        if j < 0: return sheet
        if 6 <= j <= 10: return hem
        if 11 <= j <= 12: return hole
        if j >= nr - 1: return deep
        return None
    grid(m, rings, root, inner, colf, vcol)
    # the shoulder ball (the joint the sleeve swings on)
    bc = mir(Vector((0.018, 0.004, 0.022)))
    ball, ball_lo = hexc(PAL['ball']), mixc(PAL['ball'], PAL['hem'], 0.35)
    ellipsoid(m, bc, X * 0.054, Y * 0.054, Z * 0.054, 14, 7, vcol=lambda p: mixc(ball_lo, ball, smooth(-0.045, 0.03, p.z - bc.z)))
    return path, F

# ------------------------------------------------------------------ the flame
def build_flame(m):
    core, outer = hexc(PAL['flame_core']), hexc(PAL['flame'])
    FS = 1.2
    path = [Vector((0, 0, -0.050)) * FS, Vector((0, 0, -0.020)) * FS, Vector((0, 0, 0.010)) * FS, Vector((0.004, 0, 0.040)) * FS,
            Vector((0.016, 0, 0.066)) * FS, Vector((0.032, 0, 0.082)) * FS, Vector((0.046, 0, 0.088)) * FS]
    path = resample(catmull(path, 50), 13)
    F = frames(path)
    K = 14
    rings = []
    for i, (p, (T, N, B)) in enumerate(zip(path, F)):
        s = i / (len(path) - 1)
        # a round bulb (r 0.055 at s 0.3) tapering to a rounded wisp tip (r 0.012)
        if s <= 0.32: r = 0.056 * FS * math.sin(min(1.0, s / 0.32) * math.pi / 2) ** 0.75
        else: r = 0.013 + (0.056 * FS - 0.013) * (1 - (s - 0.32) / 0.68) ** 1.5
        if i == 0: continue
        if s < 0.32:
            # the lower half of the bulb: a sphere-ish bottom (sections placed on a circle, not along the spine)
            pass
        rings.append([p + (N * math.cos(2 * math.pi * k / K) + B * math.sin(2 * math.pi * k / K)) * r for k in range(K)])
    tip = path[-1] + F[-1][0] * 0.011
    cpt = Vector((0, -0.028, -0.008))
    def vcol(p):
        d = (p - cpt).length
        return mixc(core, outer, smooth(0.020, 0.052, d))
    grid(m, rings, path[0], tip, None, vcol, mat=1)

# ------------------------------------------------------------------ assemble one variant
def make_materials():
    def mat(name, glow):
        mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
        mt.use_backface_culling = True
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        if glow:
            # (the glTF exporter can't carry a vertex-colour emission: the emission is the flame colour as a constant)
            bsdf.inputs['Emission Color'].default_value = hexc(PAL['flame'])
            bsdf.inputs['Emission Strength'].default_value = 1.0
        return mt
    return mat('toon', False), mat('glow', True)

def to_object(part, mats, loc):
    part.finish_normals()
    me = bpy.data.meshes.new(part.name)
    me.from_pydata([v - loc for v in part.v], [], part.f)
    me.update()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cols = []
    for f, c in zip(me.polygons, part.fc):
        assert f.loop_total == len(c)
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
    me.normals_split_custom_set_from_vertices([tuple(n) for n in part.n])
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    return ob

def inside_count(bvh, pts):
    """how many points are inside the closed body (odd ray-crossing count along +X... approximated by 3 rays)"""
    cnt = 0
    for p in pts:
        votes = 0
        for d in (Vector((1, 0.01, 0.02)).normalized(), Vector((-0.02, 1, 0.01)).normalized(), Vector((0.01, -0.03, 1)).normalized()):
            o = p.copy(); hits = 0
            for _ in range(12):
                h = bvh.ray_cast(o + d * 1e-5, d)
                if h[0] is None: break
                hits += 1; o = h[0] + d * 1e-4
            votes += hits % 2
        cnt += votes >= 2
    return cnt

def clearance_report(P, S_rings):
    """the sleeve vs the body: count sleeve vertices (outside the first 6 cm from the pivot) that end up inside the
    body sheet over the game's motion range"""
    allr = S_rings
    V, F = [], []
    K = len(allr[0])
    for ring in allr: V.extend(ring)
    for j in range(len(allr) - 1):
        for k in range(K):
            F.append((j * K + k, j * K + (k + 1) % K, (j + 1) * K + (k + 1) % K, (j + 1) * K + k))
    V.append(Vector((0, 0, H_TOP))); tp = len(V) - 1
    for k in range(K): F.append((tp, (k + 1) % K, k))
    V.append(Vector((0, 0.02, 0.17))); bp = len(V) - 1
    for k in range(K): F.append((bp, (len(allr) - 1) * K + k, (len(allr) - 1) * K + (k + 1) % K))
    bvh = BVHTree.FromPolygons(V, F)
    out = []
    for nm, side in (('armL', 1), ('armR', -1)):
        piv = Vector((PIVOT.x * side, PIVOT.y, PIVOT.z))
        loc = [v - piv for v in P[nm].v if (v - piv).length > 0.12]
        for ax in (0.3, 0.0, -0.15, -0.6, -1.1, -1.5, -1.9, -2.2):
            for az in (-0.5, 0.0, 0.1, 0.45, 0.5):
                R = Matrix.Rotation(ax, 3, 'X') @ Matrix.Rotation(-az * side, 3, 'Y')
                pts = [piv + R @ q for q in loc[::2]]
                c = inside_count(bvh, pts)
                if c: out.append((nm, ax, az, c))
    return out

def build_variant(key):
    Vr = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    P = {n: Part(n) for n in ('body', 'armL', 'armR', 'flame')}
    rings = build_body_surface(P['body'])
    S = Surface(rings)
    build_face(P['body'], S, Vr['sleepy'])
    build_triangle(P['body'], S, Vr['sleepy'])
    if Vr['sleepy']: build_cap(P['body'], S)
    build_arm(P['armL'], 1); build_arm(P['armR'], -1)
    build_flame(P['flame'])
    if key == 'base' or ONLY:
        clr = clearance_report(P, rings)
        print('YUREI sleeve-in-body (part, ax, az, verts inside):', clr if clr else 'none')
    locs = {'body': Vector((0, 0, 0)), 'armL': PIVOT.copy(), 'armR': Vector((-PIVOT.x, PIVOT.y, PIVOT.z)), 'flame': Vector((0, 0, 0))}
    obs = [to_object(P[n], mats, locs[n]) for n in P]
    tot = sum(p.tris() for p in P.values())
    allv = [v for n in ('body', 'armL', 'armR') for v in P[n].v]
    lo = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
    hi = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
    fv = P['flame'].v
    print('YUREI %s tris %s total %d | W%.3f D%.3f H%.3f | z %.3f..%.3f y %.3f..%.3f | flame z %.3f..%.3f' % (
        key, {n: p.tris() for n, p in P.items()}, tot, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.z, hi.z, lo.y, hi.y,
        min(v.z for v in fv), max(v.z for v in fv)))
    name = 'yurei' if key == 'base' else 'yurei_' + key
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('YUREI export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('YUREI wrote', out)

for key in VARIANTS:
    if ONLY and key != ONLY: continue
    build_variant(key)
