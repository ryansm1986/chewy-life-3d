# Kasa-obake (Pawhaven enemy EN-1, the Burrow) -- Option A "One-Eyed Umbrella".
# Deterministic build, from an empty scene, of the three variant GLBs (one rigid `body` object each):
#   blender --background --factory-startup --python build_kasa-obake.py -- [--only base|red|blue]
# Contract: vertex colours only (attribute `Col`, face-corner domain), one material `toon`, no rig / UVs / textures.
# `body` origin = (0, 0, 0), the ground centre; front -Y; 1 unit = 1 m; 1.60 m to the finial top (the brief).
# Pieces (all joined into `body`):
#   canopy   12 puffy pleated panels on a measured cone profile, the hem rolled under into scalloped lobes, a real
#            underside (closed shell); the front gently flattened (the sheet's side view)
#   eye      one big domed eyeball proud of the canopy: cream white, dark iris with a warm lower half, pupil,
#            two catchlights (shells), a thick lash line with curled tips
#   face     the mouth shadow, two blush ovals (shells), the long lolling tongue with its groove
#   wood     the collar + finial, the handle leg, an ankle knob, the geta (platform + 4 teeth) and its dark strap
import bpy, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('KASA build pid', os.getpid())

# ------------------------------------------------------------------ colour (sRGB hex -> linear)
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t):
    if isinstance(a, str): a = hexc(a)
    if isinstance(b, str): b = hexc(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))
def mulc(a, k):
    if isinstance(a, str): a = hexc(a)
    return (a[0] * k, a[1] * k, a[2] * k, 1.0)

VARIANTS = {
    'base': dict(file='kasa-obake',      canopy='#8a5ad0', valley='#5b3485', under='#432663'),
    'red':  dict(file='kasa-obake_red',  canopy='#e8503a', valley='#a3301f', under='#6e2219'),
    'blue': dict(file='kasa-obake_blue', canopy='#3a8ad0', valley='#22568e', under='#1b3f69'),
}
# (the game self-lights linear colours with r > 0.8, b > 0.16, g < 0.3 -- meant for the tongue #ef719d only. The
#  sheet's blush #e98c91 passes that test too, so it is nudged to #e48b90 (r 0.776 linear): same look, no glow.)
COMMON = dict(white='#f5edd8', white_rim='#e6d8bd', iris='#3b2723', pupil='#292125', iris_warm='#714737',
              catch='#ffffff', lash='#292125', mouth='#2e2129', tongue='#ef719d', groove='#e8407a',
              blush='#e48b90', wood='#95603b', wood_lo='#7b4c2d', wood_hi='#a96f45', strap='#292125')

# ------------------------------------------------------------------ math
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(a, b, x):
    t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t)
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def radial(th): return Vector((math.sin(th), -math.cos(th), 0))      # azimuth 0 = the front (-Y), + toward +X

def catmull1(tab, x):
    """smooth 1-D interpolation through [(x, y)] (x descending or ascending), Catmull-Rom"""
    xs = [p[0] for p in tab]; ys = [p[1] for p in tab]
    asc = xs[0] < xs[-1]
    if not asc: xs = xs[::-1]; ys = ys[::-1]
    if x <= xs[0]: return ys[0] + (ys[1] - ys[0]) / (xs[1] - xs[0]) * (x - xs[0])
    if x >= xs[-1]: return ys[-1] + (ys[-1] - ys[-2]) / (xs[-1] - xs[-2]) * (x - xs[-1])
    i = max(j for j in range(len(xs) - 1) if xs[j] <= x)
    t = (x - xs[i]) / (xs[i + 1] - xs[i])
    def m(k):
        k0, k1 = max(0, k - 1), min(len(xs) - 1, k + 1)
        return (ys[k1] - ys[k0]) / (xs[k1] - xs[k0]) * (xs[i + 1] - xs[i])
    h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t; h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
    return h00 * ys[i] + h10 * m(i) + h01 * ys[i + 1] + h11 * m(i + 1)

# ------------------------------------------------------------------ mesh accumulator
class Part:
    def __init__(self, name):
        self.name = name; self.v = []; self.n = []; self.f = []; self.fc = []
    def vert(self, p, n=None):
        self.v.append(Vector(p)); self.n.append(None if n is None else Vector(n).normalized()); return len(self.v) - 1
    def fnormal(self, idx):
        P = [self.v[i] for i in idx]; nn = Vector((0, 0, 0))
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        return nn
    def face(self, idx, cols, hint=None):
        """cols: one colour or a list per corner (same order as idx); hint: the outward direction (or None: as given)"""
        idx = list(idx)
        cl = list(cols) if isinstance(cols, list) else [cols] * len(idx)
        if hint is not None and self.fnormal(idx).dot(hint) < 0: idx.reverse(); cl.reverse()
        self.f.append(idx); self.fc.append(cl)
    def finish_normals(self):
        acc = [Vector((0, 0, 0)) for _ in self.v]
        for f in self.f:
            nn = self.fnormal(f)
            for i in f: acc[i] += nn
        for i, n in enumerate(self.n):
            if n is None: self.n[i] = acc[i].normalized() if acc[i].length > 1e-12 else Vector((0, 0, 1))
    def tris(self): return sum(len(f) - 2 for f in self.f)

def grid(m, P, colfn, ref_hint, normals=None, pole0=None, pole1=None, h0=None, h1=None):
    """quads over a grid P[j][k] (rows j, closed loop in k); the winding is chosen ONCE from face (0, 0) against
    ref_hint, so a continuous sheet (outer surface -> lip -> underside) stays consistent. colfn(j, k, jj, kk) gives the
    colour of the corner at vertex (jj, kk) of face band (j, k); pole faces use j = -1 / R - 1."""
    R, K = len(P), len(P[0])
    ids = [[m.vert(P[j][k], None if normals is None else normals[j][k]) for k in range(K)] for j in range(R)]
    q0 = [ids[0][0], ids[0][1 % K], ids[1][1 % K], ids[1][0]]
    flip = m.fnormal(q0).dot(ref_hint) < 0
    for j in range(R - 1):
        for k in range(K):
            k1 = (k + 1) % K
            vv = [(j, k), (j, k1), (j + 1, k1), (j + 1, k)]
            if flip: vv.reverse()
            m.face([ids[a][b] for a, b in vv], [colfn(j, k, a, b) for a, b in vv])
    for pole, row, hint, jb in ((pole0, 0, h0, -1), (pole1, R - 1, h1, R - 1)):
        if pole is None: continue
        pi = m.vert(pole)
        for k in range(K):
            k1 = (k + 1) % K
            m.face([pi, ids[row][k], ids[row][k1]], [colfn(jb, k, row, k), colfn(jb, k, row, k), colfn(jb, k, row, k1)], hint)
    return ids

def lathe(m, prof, K, colfn, th0=0.0, centre=(0, 0)):
    """surface of revolution about the vertical axis through `centre`: prof [(r, z)] bottom -> top, r = 0 ends are
    poles. colfn(j, k) per face band (j = profile segment)."""
    c = Vector((centre[0], centre[1], 0))
    body = list(prof); p0 = p1 = None; off = 0
    if body[0][0] < 1e-6: p0 = c + Z * body[0][1]; body = body[1:]; off = 1
    if body[-1][0] < 1e-6: p1 = c + Z * body[-1][1]; body = body[:-1]
    P = [[c + radial(th0 + 2 * math.pi * k / K) * r + Z * z for k in range(K)] for r, z in body]
    seg = lambda j: j + off
    r0, z0 = body[0]; r1, z1 = body[1]
    ref = radial(th0) * (z1 - z0) - Z * (r1 - r0)     # the outward normal of the first profile segment
    grid(m, P, lambda j, k, jj, kk: colfn(seg(j) if j >= 0 else 0, k), ref, pole0=p0, pole1=p1, h0=-Z, h1=Z)

def sweep(m, path, Ws, wfn, tfn, K, colfn, sup=2.0, cap_tip=0.6, cap_root=0.5, angles=None, dip=None, colv=None):
    """a tube: superellipse section (half-width w along W, half-thickness t along N = T x W) swept along path, with a
    rounded tip and root. Ws: the width direction per path point. colfn(s, ang_index) per face (s = path fraction of
    the band's start row). angles: the section angles (deg) if not uniform; dip(s, ang) pushes a vertex inward (m)."""
    n = len(path)
    Ts = [(path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized() for i in range(n)]
    A = angles or [360.0 * k / K for k in range(K)]
    K = len(A)
    def section(p, T, W, w, t, s):
        W = (W - T * W.dot(T)).normalized(); Nn = T.cross(W)
        out = []
        for k, ad in enumerate(A):
            a = math.radians(ad); ca, sa = math.cos(a), math.sin(a)
            d = 0.0 if dip is None else dip(s, k)
            out.append(p + W * (w * math.copysign(abs(ca) ** (2 / sup), ca)) + Nn * ((t - d) * math.copysign(abs(sa) ** (2 / sup), sa)))
        return out
    rings, ss, cs = [], [], []
    def add(p, T, W, w, t, s): rings.append(section(p, T, W, w, t, s)); ss.append(s); cs.append(p)
    # root cap
    for a in (0.8, 0.45):
        ang = a * math.pi / 2
        add(path[0] - Ts[0] * (cap_root * tfn(0.0) * math.sin(ang)), Ts[0], Ws[0], wfn(0.0) * math.cos(ang) ** 0.6, tfn(0.0) * math.cos(ang), 0.0)
    for i in range(n):
        s = i / (n - 1); add(path[i], Ts[i], Ws[i], wfn(s), tfn(s), s)
    pe, Te, we, te = path[-1], Ts[-1], wfn(1.0), tfn(1.0)
    for a in (0.45, 0.8):
        ang = a * math.pi / 2
        add(pe + Te * (cap_tip * we * math.sin(ang)), Te, Ws[-1], we * math.cos(ang), te * math.cos(ang) ** 0.6, 1.0)
    root = path[0] - Ts[0] * (cap_root * tfn(0.0)); tip = pe + Te * (cap_tip * we)
    ids = [[m.vert(p) for p in r] for r in rings]
    for j in range(len(rings) - 1):
        c = (cs[j] + cs[j + 1]) / 2
        for k in range(K):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]]
            fc = sum((m.v[i] for i in q), Vector()) / 4
            cl = colfn(ss[j], k) if colv is None else [colv(ss[a], b) for a, b in ((j, k), (j, (k + 1) % K), (j + 1, (k + 1) % K), (j + 1, k))]
            m.face(q, cl, fc - c)
    for pole, row, c in ((root, 0, path[0]), (tip, len(rings) - 1, pe)):
        pi = m.vert(pole)
        for k in range(K):
            q = [pi, ids[row][k], ids[row][(k + 1) % K]]
            cl = colfn(ss[row], k) if colv is None else [colv(ss[row], k), colv(ss[row], k), colv(ss[row], (k + 1) % K)]
            m.face(q, cl, pole - c)

# ------------------------------------------------------------------ surface ray casting (decals, the lash)
class Surf:
    """a BVH over some of a Part's faces, with smooth (vertex-interpolated) normals at the hits"""
    def __init__(self, m, face_range):
        self.m = m; self.tris = []
        for fi in range(*face_range):
            f = m.f[fi]
            for t in range(1, len(f) - 1): self.tris.append((f[0], f[t], f[t + 1]))
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in m.v], self.tris)
    def nrm(self, p, ti):
        a, b, c = (self.m.v[i] for i in self.tris[ti]); na, nb, nc = (self.m.n[i] for i in self.tris[ti])
        v0, v1, v2 = b - a, c - a, p - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-18: return na.copy()
        w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
        return (na * w0 + nb * w1 + nc * w2).normalized()
    def cast(self, origin, direction):
        loc, fn, ti, dist = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized(), 5.0)
        if loc is None: return None, None
        return loc, self.nrm(loc, ti)
    def nearest(self, p):
        loc, fn, ti, dist = self.bvh.find_nearest(Vector(p))
        return loc, self.nrm(loc, ti)

def decal(m, surf, centre, d, t1, A, B, S, rings, h, colfn, shape=None):
    """a thin colour shell (h above the surface) over the region f * (A cos a, B sin a) around `centre`, found by
    casting along d (into the surface) from points in the plane (t1, t2 = d x t1). colfn(ring_index) per face."""
    d = Vector(d).normalized(); t1 = (Vector(t1) - d * Vector(t1).dot(d)).normalized(); t2 = d.cross(t1)
    def at(u, v):
        loc, n = surf.cast(Vector(centre) + t1 * u + t2 * v - d * 0.4, d)
        if loc is None: raise RuntimeError('decal ray missed at %s' % (Vector(centre) + t1 * u + t2 * v))
        return m.vert(loc + n * h, n), n
    ci, cn = at(0, 0)
    ids, ns = [], []
    for f in rings:
        row, rn = [], []
        for k in range(S):
            a = 2 * math.pi * k / S
            r = 1.0 if shape is None else shape(a)
            i, n = at(f * A * r * math.cos(a), f * B * r * math.sin(a)); row.append(i); rn.append(n)
        ids.append(row); ns.append(rn)
    for k in range(S):
        m.face([ci, ids[0][k], ids[0][(k + 1) % S]], colfn(0), cn)
    for j in range(len(rings) - 1):
        for k in range(S):
            m.face([ids[j][k], ids[j][(k + 1) % S], ids[j + 1][(k + 1) % S], ids[j + 1][k]], colfn(j + 1), ns[j][k])

# ------------------------------------------------------------------ dimensions (m), measured on refs/sheet.png
# front view: 195 px/m (finial top y 72 .. ground y 384 = 1.60 m), axis x = 388
PROFILE = [  # (z, r): the canopy's outer silhouette at the panel centres (front view)
    (1.415, 0.092), (1.385, 0.145), (1.323, 0.195), (1.200, 0.277), (1.077, 0.341), (0.954, 0.395),
    (0.831, 0.451), (0.708, 0.497), (0.585, 0.545), (0.520, 0.572), (0.462, 0.600)]
# the canopy as a parameter set (build_kasa-lord.py builds its two tiers from the same builder)
CANOPY = dict(
    profile=PROFILE,
    np=12,                                   # pleated panels (a panel centred at the front)
    phis=[0.0, 0.09, 0.27, 0.5, 0.73, 0.91],  # columns per panel (0 = the crease)
    z_top=1.415, z_m=0.520,                  # body rows from the collar to the start of the rolled hem
    s_rows=[0.0, 0.06, 0.16, 0.30, 0.46, 0.63, 0.81, 1.0],
    hem_crease=0.430, hem_lobe=0.350,        # the hem's bottom at the creases / at the middle of a lobe
    flat=0.30, flat_z=(1.22, 0.90),          # front flattening (the sheet's side view: depth 1.03 m vs width 1.20 m)
    crease=(0.012, 0.052), rho=(0.030, 0.025), jit=0.007,
    under=[('lip', 0.045, 0.03), (0.34, 0.53), (0.075, 0.60)], pole0=1.419, pole1=0.62, top_hi=True)
FLAT = CANOPY['flat']

def flat(th, z, T=CANOPY):
    return 1 - T['flat'] * max(0.0, math.cos(th)) ** 2 * smooth(T['flat_z'][0], T['flat_z'][1], z)
def bump(phi): return math.sin(math.pi * clamp(phi)) ** 0.45
def lobe(phi): return math.sin(math.pi * clamp(phi)) ** 0.7

def canopy_point(th, phi, pan, s, T=CANOPY):
    """the outer body surface at (azimuth th, panel fraction phi, panel index pan), row s (0 top .. 1 = z_m)"""
    z = T['z_top'] + (T['z_m'] - T['z_top']) * s
    cd = T['crease'][0] + T['crease'][1] * s ** 0.8
    r = catmull1(T['profile'], z) * (1 - cd * (1 - bump(phi))) * (1 + T['jit'] * math.sin(pan * 2.31 + 0.7))
    return radial(th) * (r * flat(th, z, T)) + Z * z, r, z

def build_canopy(m, V, T=CANOPY):
    """one pleated canopy tier; returns the hem's crease points [(th, r, z)] (where a tassel can hang)"""
    base, valley, under = hexc(V['canopy']), hexc(V['valley']), hexc(V['under'])
    hi = mixc(base, '#fff6ea', 0.07)
    NP, PHIS, S_ROWS, Z_M = T['np'], T['phis'], T['s_rows'], T['z_m']
    cols = []
    for i in range(NP):
        for phi in PHIS: cols.append((i, phi, (i - 0.5 + phi) * 2 * math.pi / NP))
    K = len(cols)
    rows = []
    # body rows
    for s in S_ROWS:
        rows.append([canopy_point(th, phi, i, s, T)[0] for i, phi, th in cols])
    # the rolled hem: a quadratic Bezier from the last body row, along its tangent, under to the lobe bottom
    slope = -(catmull1(T['profile'], Z_M - 0.01) - catmull1(T['profile'], Z_M + 0.01)) / 0.02   # dr/dz (r grows downward)
    CURL_T = [0.4, 0.75, 1.0]
    curl = [[None] * K for _ in CURL_T]; lip = []; creases = []
    for k, (i, phi, th) in enumerate(cols):
        _, r0, _ = canopy_point(th, phi, i, 1.0, T)
        lb = lobe(phi); zb = T['hem_crease'] + (T['hem_lobe'] - T['hem_crease']) * lb
        rho = T['rho'][0] + T['rho'][1] * lb
        P0 = (r0, Z_M); Pc = (r0 - slope * (Z_M - zb) * 0.85, zb); P2 = (r0 - rho, zb)
        for q, t in enumerate(CURL_T):
            r = (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * Pc[0] + t * t * P2[0]
            z = (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * Pc[1] + t * t * P2[1]
            curl[q][k] = radial(th) * (r * flat(th, z, T)) + Z * z
        lip.append((P2[0], zb, th))
        if phi == 0.0: creases.append((th, P2[0] * flat(th, zb, T), zb))
    rows += curl
    # the underside: in from the lip, up to the leg (a shallow inverted cone: the canopy is a solid toy shell)
    for u in T['under']:
        if u[0] == 'lip': rows.append([radial(th) * ((r - u[1]) * flat(th, zb + u[2], T)) + Z * (zb + u[2]) for r, zb, th in lip])
        else: rows.append([radial(th) * (u[0] * flat(th, u[1], T)) + Z * u[1] for r, zb, th in lip])
    nb = len(S_ROWS); p1, pl = PHIS[1], PHIS[-1]
    def colv(jj, kk):
        i, phi, th = cols[kk]
        if jj < nb:                                    # body: panel colour, the crease darker, lit top
            s = S_ROWS[jj]
            c = base
            if phi == 0.0: c = valley
            elif phi in (p1, pl): c = mixc(valley, base, 0.62)
            if T['top_hi'] and s < 0.2: c = mixc(c, hi, (0.2 - s) / 0.2 * 0.8)
            elif s > 0.6: c = mulc(c, 1 - 0.05 * (s - 0.6) / 0.4)
            return c
        q = jj - nb
        if q < len(CURL_T):                            # the rolled hem darkens as it turns under
            c = valley if phi == 0.0 else (mixc(valley, base, 0.62) if phi in (p1, pl) else mulc(base, 0.95))
            return mixc(c, valley, (0.0, 0.35, 0.75)[q])
        return under
    def colfn(j, k, jj, kk):
        if j < 0: return hi
        if j >= len(rows) - 1: return under
        return colv(jj, kk)
    grid(m, rows, colfn, ref_hint=radial(cols[0][2]) + Z, pole0=Vector((0, 0, T['pole0'])), pole1=Vector((0, 0, T['pole1'])), h0=Z, h1=-Z)
    return creases

# ------------------------------------------------------------------ the eye
EYE = dict(cz=0.785, a=0.220, b=0.215, c=0.190, tilt=math.radians(8), apex_y=-0.52, iris=0.58, pupil=0.35, lift=0.032)
def eye_frame():
    t = EYE['tilt']
    F = Vector((0, -math.cos(t), math.sin(t))); Rr = X.copy(); U = Vector((0, math.sin(t), math.cos(t)))
    C = Vector((0, EYE['apex_y'], EYE['cz'])) - F * EYE['c']
    C.z = EYE['cz']                         # (the white's centre stays at the measured height)
    return C, Rr, U, F
def eye_pt(u, v, h=0.0):
    C, Rr, U, F = eye_frame(); a, b, c = EYE['a'], EYE['b'], EYE['c']
    rho2 = (u / a) ** 2 + (v / b) ** 2; d = c * math.sqrt(max(0.0, 1 - rho2))
    p = C + Rr * u + U * v + F * d
    n = (Rr * (u / a ** 2) + U * (v / b ** 2) + F * (d / c ** 2)).normalized()
    return p + n * h, n

def build_eye(m):
    C, Rr, U, F = eye_frame(); a, b, c = EYE['a'], EYE['b'], EYE['c']
    KE = 24
    RHO = [0.16, EYE['pupil'], 0.47, EYE['iris'], 0.69, 0.80, 0.89, 0.95, 1.0]
    BACK = [math.radians(118), math.radians(152)]
    rows, nrows = [], []
    for rho in RHO:
        sh = EYE['lift'] * (1 - smooth(0.55, 0.97, rho))          # the iris sits a touch above the white's centre
        row, nr = [], []
        for k in range(KE):
            ps = 2 * math.pi * k / KE + math.pi / KE
            u = rho * a * math.cos(ps); v = rho * b * math.sin(ps) + sh
            if rho == 1.0: p = C + Rr * u + U * v; n = (Rr * (u / a ** 2) + U * (v / b ** 2)).normalized()
            else: p, n = eye_pt(u, v)
            row.append(p); nr.append(n)
        rows.append(row); nrows.append(nr)
    for be in BACK:
        row, nr = [], []
        for k in range(KE):
            ps = 2 * math.pi * k / KE + math.pi / KE
            e = Rr * (a * math.sin(be) * math.cos(ps)) + U * (b * math.sin(be) * math.sin(ps)) + F * (c * math.cos(be))
            row.append(C + e); nr.append((Rr * (e.dot(Rr) / a ** 2) + U * (e.dot(U) / b ** 2) + F * (e.dot(F) / c ** 2)).normalized())
        rows.append(row); nrows.append(nr)
    W, RIM, IRIS, PUP, WARM = (hexc(COMMON[k]) for k in ('white', 'white_rim', 'iris', 'pupil', 'iris_warm'))
    def colfn(j, k, jj, kk):
        band = 0 if j < 0 else j + 1          # band 0 = the apex fan, band b = between RHO[b-1] and RHO[b]
        if band <= 1: return PUP
        if band <= 3:                          # the iris: dark, warm in the lower half toward the pupil
            ps = 2 * math.pi * kk / KE + math.pi / KE; low = smooth(-0.1, -0.75, math.sin(ps))
            r_ = RHO[jj] if jj < len(RHO) else 1
            w = low * (1 - smooth(0.38, 0.56, r_)) * 0.85
            return mixc(IRIS, WARM, w)
        if band >= 8: return RIM
        return W
    apex, _ = eye_pt(0, EYE['lift'])
    back = C - F * c
    ids = grid(m, rows, colfn, ref_hint=F, normals=nrows, pole0=apex, pole1=back, h0=F, h1=-F)
    m.n[len(m.v) - 2] = F.copy(); m.n[len(m.v) - 1] = -F
    # catchlights: a big one up-right, a small one low-left (shells 4 mm proud)
    CAT = hexc(COMMON['catch'])
    for (cu, cv, r, S) in ((0.050, EYE['lift'] + 0.064, 0.030, 14), (-0.046, EYE['lift'] - 0.044, 0.0135, 8)):
        cp, cn = eye_pt(cu, cv, 0.004)
        ci = m.vert(cp, cn); ring = []
        for k in range(S):
            a_ = 2 * math.pi * k / S
            p, n = eye_pt(cu + r * math.cos(a_), cv + r * math.sin(a_), 0.004); ring.append(m.vert(p, n))
        for k in range(S): m.face([ci, ring[k], ring[(k + 1) % S]], CAT, cn)

def build_lash(m, surf, canopy):
    """the thick lash line: a dark band laid along the seam where the eyeball meets the paper over its top (so the
    eye's whole white shows from the front AND from the 45 deg game camera, with the lash as its top edge, like the
    sheet), running a little past the eye at both ends, the tips flicked up"""
    C, Rr, U, F = eye_frame(); a, b, c = EYE['a'], EYE['b'], EYE['c']
    def ball(be, ps):
        e = Rr * (a * math.sin(be) * math.cos(ps)) + U * (b * math.sin(be) * math.sin(ps)) + F * (c * math.cos(be))
        n = (Rr * (e.dot(Rr) / a ** 2) + U * (e.dot(U) / b ** 2) + F * (e.dot(F) / c ** 2)).normalized()
        return C + e, n
    def outside(p):
        q, n = canopy.nearest(p); return (p - q).dot(n) > 0
    wf = lambda s: 0.016 + 0.010 * math.sin(math.pi * clamp(s)) ** 0.6
    tf = lambda s: 0.015 + 0.010 * math.sin(math.pi * clamp(s)) ** 0.6
    path, Ns = [], []
    for kind, x0, y0 in [('f', -0.262, 0.100), ('f', -0.246, 0.068)]:
        loc, n = surf.cast(C + Rr * x0 + U * y0 + F * 0.6, -F); path.append(loc + n * 0.018); Ns.append(n)
    for i in range(11):
        ps = math.radians(170 - 160 * i / 10)
        lo, hi = math.radians(40), math.radians(150)          # (lo: proud of the paper, hi: buried)
        for _ in range(30):
            mid = (lo + hi) / 2
            if outside(ball(mid, ps)[0]): lo = mid
            else: hi = mid
        j, ne = ball(lo - 0.07, ps); _, nc = canopy.nearest(j)
        nb = (ne + nc).normalized()
        path.append(j + nb * (tf(0.5) * 1.05)); Ns.append(nb)
    for kind, x0, y0 in [('f', 0.248, 0.070), ('f', 0.265, 0.103)]:
        loc, n = surf.cast(C + Rr * x0 + U * y0 + F * 0.6, -F); path.append(loc + n * 0.018); Ns.append(n)
    n_ = len(path)
    Ts = [(path[min(i + 1, n_ - 1)] - path[max(i - 1, 0)]).normalized() for i in range(n_)]
    Ws = [n.cross(T).normalized() for n, T in zip(Ns, Ts)]
    LASH = hexc(COMMON['lash'])
    sweep(m, path, Ws, wf, tf, 8, lambda s, k: LASH, sup=2.6, cap_tip=0.9, cap_root=0.9)

def build_tongue(m):
    """the long lolling tongue: out from under the eye, forward and down, broad side up, a groove down its middle"""
    path = [Vector(p) for p in ((0.0, -0.32, 0.625), (0.004, -0.415, 0.582), (0.010, -0.495, 0.520),
                                (0.016, -0.548, 0.458), (0.021, -0.574, 0.410), (0.025, -0.584, 0.378))]
    Ws = [X.copy() for _ in path]
    wf = lambda s: 0.108 + 0.016 * smooth(0.0, 0.55, s)
    tf = lambda s: 0.040 - 0.008 * s
    ANG = [0, 28, 55, 74, 87, 90, 93, 106, 125, 152, 180, 210, 245, 270, 295, 330]
    TG, GR = hexc(COMMON['tongue']), hexc(COMMON['groove'])
    # (N = T x W points forward-up / out of the face for a path going forward and down)
    # the groove: a soft crease, per-vertex colour (darkest on the centre line, fading to the sides and down the
    # tongue, so both ends are soft and rounded); the groove pink still passes the game's tongue-light test
    def groove(s, k):
        along = 1 - smooth(0.12, 0.62, s)
        a = ANG[k]
        across = 1.0 if a == 90 else (0.5 * (1 - smooth(0.0, 0.45, s)) if a in (87, 93) else 0.0)
        return along * across
    colv = lambda s, k: mixc(TG, GR, groove(s, k))
    def dip(s, k):
        return 0.007 * (1 - smooth(0.3, 0.7, s)) if ANG[k] == 90 else (0.003 * (1 - smooth(0.2, 0.6, s)) if ANG[k] in (87, 93) else 0.0)
    sweep(m, path, Ws, wf, tf, 0, None, sup=3.0, cap_tip=0.85, cap_root=0.6, angles=ANG, dip=dip, colv=colv)

# ------------------------------------------------------------------ wood: collar + finial, leg, geta, strap
def build_wood(m):
    WD, LO, HI, ST = (hexc(COMMON[k]) for k in ('wood', 'wood_lo', 'wood_hi', 'strap'))
    prof = [(0, 1.392), (0.085, 1.396), (0.112, 1.405), (0.124, 1.422), (0.120, 1.442), (0.098, 1.454), (0.056, 1.459),
            (0.051, 1.474), (0.051, 1.520), (0.048, 1.560), (0.040, 1.586), (0.024, 1.599), (0, 1.603)]
    lathe(m, prof, 14, lambda j, k: LO if j <= 1 else (WD if j <= 5 else (HI if j >= 10 else WD)), th0=math.pi / 14)
    # the handle leg (top buried in the canopy's solid shell, foot in the ankle knob)
    lathe(m, [(0, 0.17), (0.046, 0.17), (0.047, 0.32), (0.050, 0.52), (0.050, 0.70), (0, 0.70)], 10, lambda j, k: WD)
    # the ankle knob the strap hugs
    lathe(m, [(0, 0.128), (0.050, 0.136), (0.066, 0.160), (0.068, 0.190), (0.060, 0.220), (0.046, 0.240), (0, 0.248)],
          12, lambda j, k: WD if j < 4 else HI)
    # the geta platform: a rounded superellipse slab
    def sup_ring(hx, hy, z, n, e=4.0, off=(0, 0)):
        out = []
        for k in range(n):
            a = 2 * math.pi * k / n + math.pi / n; ca, sa = math.cos(a), math.sin(a)
            out.append(Vector((off[0] + hx * math.copysign(abs(ca) ** (2 / e), ca), off[1] + hy * math.copysign(abs(sa) ** (2 / e), sa), z)))
        return out
    HX, HY = 0.145, 0.162
    rows = [sup_ring(HX * 0.9, HY * 0.92, 0.066, 20), sup_ring(HX, HY, 0.078, 20), sup_ring(HX, HY, 0.124, 20),
            sup_ring(HX * 0.9, HY * 0.92, 0.136, 20)]
    # (grid passes j = -1 for the bottom fan, j = 3 for the top fan): dark underside, wood sides, a lighter top
    grid(m, rows, lambda j, k, jj, kk: LO if j <= 0 else (WD if j == 1 else HI),
         ref_hint=Vector((0.6, 0, -1)), pole0=Vector((0, 0, 0.066)), pole1=Vector((0, 0, 0.137)), h0=-Z, h1=Z)
    # the four teeth
    for sx in (-1, 1):
        for sy in (-1, 1):
            o = (sx * 0.088, sy * 0.098)
            rows = [sup_ring(0.034, 0.040, 0.0, 8, 3.0, o), sup_ring(0.040, 0.046, 0.010, 8, 3.0, o), sup_ring(0.040, 0.046, 0.072, 8, 3.0, o)]
            grid(m, rows, lambda j, k, jj, kk: LO, ref_hint=Vector((0.3, 0, -1)), pole0=Vector((o[0], o[1], 0.0)), pole1=Vector((o[0], o[1], 0.074)), h0=-Z, h1=Z)
    # the hanao strap: from the platform's sides, arching over the front of the ankle knob
    pts = [(-0.126, 0.010, 0.130), (-0.116, -0.030, 0.152), (-0.090, -0.064, 0.176), (-0.048, -0.080, 0.190),
           (0.0, -0.085, 0.193), (0.048, -0.080, 0.190), (0.090, -0.064, 0.176), (0.116, -0.030, 0.152), (0.126, 0.010, 0.130)]
    path = [Vector(p) for p in pts]
    n_ = len(path); Ts = [(path[min(i + 1, n_ - 1)] - path[max(i - 1, 0)]).normalized() for i in range(n_)]
    Ws = [Z - T * Z.dot(T) for T in Ts]
    sweep(m, path, Ws, lambda s: 0.021, lambda s: 0.019, 8, lambda s, k: ST, sup=2.0, cap_tip=0.5, cap_root=0.5)

# ------------------------------------------------------------------ face shells on the canopy
def build_face(m, surf_canopy):
    BL, MO = hexc(COMMON['blush']), hexc(COMMON['mouth'])
    # the mouth shadow under the eye (the tongue comes out of it); cast straight from the front
    decal(m, surf_canopy, (0.0, -0.3, 0.590), Y, X, 0.105, 0.052, 16, [0.6, 1.0], 0.004, lambda j: MO)
    for side in (-1, 1):
        c = Vector((side * 0.272, -0.3, 0.655))
        loc, n = surf_canopy.cast(c - Y * 0.5, Y)
        d = (-n + Y).normalized()                     # halfway between the front view and the surface normal
        decal(m, surf_canopy, loc, d, X, 0.068, 0.044, 18, [0.4, 0.75, 1.0], 0.008, lambda j: BL)

# ------------------------------------------------------------------ assemble one variant
def make_material():
    mt = bpy.data.materials.new('toon'); mt.use_nodes = True; nt = mt.node_tree
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
    flat_cols = []
    for poly, cl in zip(me.polygons, part.fc):
        assert poly.loop_total == len(cl)
        flat_cols.extend(cl)
    attr.data.foreach_set('color', [x for c in flat_cols for x in c])
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
    m = Part('body')
    f0 = len(m.f); build_canopy(m, V); f1 = len(m.f)
    build_eye(m); f2 = len(m.f)
    m.finish_normals()
    s_canopy = Surf(m, (f0, f1)); s_face = Surf(m, (f0, f2))
    counts = {'canopy': f1 - f0}
    t0 = m.tris(); build_lash(m, s_face, s_canopy); counts['lash'] = m.tris() - t0
    t0 = m.tris(); build_face(m, s_canopy); counts['mouth+blush'] = m.tris() - t0
    t0 = m.tris(); build_tongue(m); counts['tongue'] = m.tris() - t0
    t0 = m.tris(); build_wood(m); counts['wood+geta'] = m.tris() - t0
    counts['canopy'] = sum(len(f) - 2 for f in m.f[f0:f1]); counts['eye'] = sum(len(f) - 2 for f in m.f[f1:f2])
    ob = to_object(m, mat)
    lo = Vector((min(v.x for v in m.v), min(v.y for v in m.v), min(v.z for v in m.v)))
    hi = Vector((max(v.x for v in m.v), max(v.y for v in m.v), max(v.z for v in m.v)))
    print('KASA %s tris %d %s | W%.3f D%.3f H%.3f | x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (
        key, m.tris(), counts, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    # sanity: degenerate faces, NaN
    bad = sum(1 for p in ob.data.polygons if p.area < 1e-9)
    nan = any(any(math.isnan(c) for c in v) for v in m.v)
    print('KASA %s degenerate faces %d nan %s' % (key, bad, nan))
    name = V['file']
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('KASA export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('KASA wrote', out)

if __name__ == '__main__':
    for key in VARIANTS:
        if ONLY and key != ONLY: continue
        build_variant(key)
