# King Mochi the Squishy (Pawhaven enemy EN-1, the Mossy Burrow's boss) -- from the King Mochi callout of the
# approved mochi-slime sheet (Option A "Daifuku Drop"), on top of the approved slime (same dome, same face style).
# Deterministic build, from an empty scene:
#   blender --background --factory-startup --python build_mochi-king.py
# One rigid mesh: a single object `body`, origin (0, 0, 0) = the ground centre; the game scales it x3 (about 2.5 m).
#   dome     the slime's measured surface of revolution at 0.95 m wide (same H/W), #ffe8f0, light top, base band
#   face     the slime's shells: big eyes, stern brows, blush; a grand two-lobe moustache with curled tips and a gold
#            brooch with a ruby (raised shells with bent normals, so they shade plump); no mouth (as the callout)
#   crown    a flared gold band with 8 rounded points (front tallest), gold balls on the tips, a darker rim bead,
#            jewels as domed shells on the wall (ruby front, emeralds +-45 deg, sapphires +-90 deg); a red velvet cap
#   mantle   an ermine fur roll round the shoulders and back, its ends tucked by the crown, dark tail-tip spots
#   cape     a closed 3.5 cm shell round the back half, tucked under the fur, flaring to the floor with soft folds
# Vertex colours only (attribute `Col`, face-corner domain); one material `toon`. No rig, no textures, no UVs.
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('KING build pid', os.getpid())

# ------------------------------------------------------------------ colour
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

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(a, b, x):
    t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t

def catmull(pts, n):
    P = [pts[0] + (pts[0] - pts[1])] + list(pts) + [pts[-1] + (pts[-1] - pts[-2])]
    segs = len(pts) - 1; out = []
    for i in range(n):
        u = i / (n - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

# ------------------------------------------------------------------ mesh accumulator
class Part:
    """vertices with explicit normals (None = computed), faces with one colour per corner"""
    def __init__(self, name):
        self.name = name; self.v = []; self.n = []; self.f = []; self.fc = []
    def vert(self, p, n=None):
        self.v.append(Vector(p)); self.n.append(None if n is None else Vector(n).normalized()); return len(self.v) - 1
    def face(self, idx, cols, hint=None):
        """cols: one colour, or one per corner; hint: the outward direction (default: the mean vertex normal)"""
        P = [self.v[i] for i in idx]
        nn = Vector((0, 0, 0))
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nn += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        if hint is None: hint = sum((self.n[i] for i in idx if self.n[i] is not None), Vector())
        if not isinstance(cols, list): cols = [cols] * len(idx)
        if nn.dot(hint) < 0: idx = list(reversed(idx)); cols = list(reversed(cols))
        self.f.append(list(idx)); self.fc.append(cols)
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

def grid(m, P, N, colfn, closed=True, pole0=None, pole1=None, hint=None):
    """quads over a grid of rows P[j][k] (normals N[j][k], None = computed); closed joins k back to 0. Poles are
    (point, normal). colfn(j, k, verts) -> colour or a per-corner list; j = the lower row of the quad (-1 / R-1 for
    the pole fans)."""
    R = len(P); K = len(P[0])
    ids = [[m.vert(P[j][k], N[j][k] if N else None) for k in range(K)] for j in range(R)]
    kk = K if closed else K - 1
    for j in range(R - 1):
        for k in range(kk):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]]
            m.face(q, colfn(j, k, q), hint(j, k) if hint else None)
    for pole, ring, j in ((pole0, 0, -1), (pole1, R - 1, R - 1)):
        if pole is None: continue
        pi = m.vert(pole[0], pole[1])
        for k in range(kk):
            q = [pi, ids[ring][k], ids[ring][(k + 1) % K]]
            m.face(q, colfn(j, k, q), hint(j, k) if hint else None)
    return ids

# ------------------------------------------------------------------ the dome (measured on the sheet)
# Front view of the sheet: the body 181 px wide (= 0.85 m) and 104 px tall (berry base to ground): H/W = 0.575, so the
# body is 0.49 m tall (the brief says ~0.55; the sheet's drawing wins, the width bar agrees with it). Half-widths
# (fraction of R) per height (fraction of H) read row by row; the widest at 0.25-0.34 H, a soft tuck under the base.
R0, H0 = 0.475, 0.546          # King Mochi: the slime's measured dome, 0.95 m wide (the brief), same H/W
CTRL = [(0.0, 0.0), (0.40, 0.0), (0.775, 0.0), (0.862, 0.013), (0.912, 0.044), (0.944, 0.106), (0.967, 0.150),
        (0.990, 0.205), (1.0, 0.27), (0.996, 0.34), (0.985, 0.41), (0.968, 0.475), (0.945, 0.538), (0.915, 0.596),
        (0.882, 0.654), (0.842, 0.712), (0.790, 0.769), (0.728, 0.827), (0.646, 0.885), (0.556, 0.938),
        (0.450, 0.968), (0.300, 0.988), (0.150, 0.997), (0.0, 1.0)]
BAND_Z = 0.106 * H0           # the base band's top border
CAP_Z = 0.82 * H0             # the light top's border (King r2: a little higher, so he reads pink from 45 deg)
def cap_wave(th): return CAP_Z + H0 * (0.008 * math.sin(3 * th + 0.6) + 0.004 * math.sin(5 * th + 2.1))   # (r2: softer)

def make_profile():
    dense = catmull([Vector((r * R0, 0, z * H0)) for r, z in CTRL], 3000)
    # even arc-length resample, then a Gaussian smoothing (sigma 3 cm, mirrored at the two poles) so the curvature
    # has no kinks at the measured control points (the ink outline shows every one)
    raw = np.array([(p.x, p.z) for p in dense]); seg = np.hypot(*np.diff(raw, axis=0).T); cum = np.r_[0, np.cumsum(seg)]
    n = 1600; ss = np.linspace(0, cum[-1], n); ds = ss[1]
    rr = np.interp(ss, cum, raw[:, 0]); zz = np.interp(ss, cum, raw[:, 1])
    sig = 0.03 / ds; w = int(3 * sig); ker = np.exp(-0.5 * (np.arange(-w, w + 1) / sig) ** 2); ker /= ker.sum()
    rp = np.r_[-rr[w:0:-1], rr, -rr[-2:-w - 2:-1]]; zp = np.r_[zz[w:0:-1], zz, zz[-2:-w - 2:-1]]
    rr = np.convolve(rp, ker, 'valid'); zz = np.convolve(zp, ker, 'valid')
    rr *= R0 / rr.max(); zz = (zz - zz.min()) * H0 / (zz.max() - zz.min())
    pts = [(max(0.0, float(r)), max(0.0, float(z))) for r, z in zip(rr, zz)]
    pts[0] = (0.0, 0.0); pts[-1] = (0.0, H0)
    S = [0.0]
    for i in range(1, len(pts)): S.append(S[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    NR = []
    for i in range(len(pts)):
        a, b = pts[max(0, i - 2)], pts[min(len(pts) - 1, i + 2)]
        dr, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dr, dz) or 1
        NR.append((dz / L, -dr / L))         # outward: (n_r, n_z)
    NR[0] = (0.0, -1.0); NR[-1] = (0.0, 1.0)
    return pts, S, NR
PROF, PS, PN = make_profile()
PLEN = PS[-1]
I_FLAT = next(i for i, p in enumerate(PROF) if p[0] >= 0.775 * R0 - 1e-4)       # where the flat bottom ends
I_WIDE = max(range(len(PROF)), key=lambda i: PROF[i][0])

def at_s(s):
    """profile (r, z, n_r, n_z) at arc length s"""
    s = clamp(s, 0, PLEN)
    lo, hi = 0, len(PS) - 1
    while hi - lo > 1:
        md = (lo + hi) // 2
        if PS[md] <= s: lo = md
        else: hi = md
    t = (s - PS[lo]) / max(1e-12, PS[hi] - PS[lo])
    r = lerp(PROF[lo][0], PROF[hi][0], t); z = lerp(PROF[lo][1], PROF[hi][1], t)
    nr = lerp(PN[lo][0], PN[hi][0], t); nz = lerp(PN[lo][1], PN[hi][1], t); L = math.hypot(nr, nz) or 1
    return r, z, nr / L, nz / L
def s_at_z(z):
    """arc length where the outer surface (past the flat bottom) is at height z (z rises monotonically there)"""
    lo, hi = I_FLAT, len(PROF) - 1
    if z <= PROF[lo][1]: return PS[lo]
    while hi - lo > 1:
        md = (lo + hi) // 2
        if PROF[md][1] <= z: lo = md
        else: hi = md
    t = (z - PROF[lo][1]) / max(1e-12, PROF[hi][1] - PROF[lo][1]); return lerp(PS[lo], PS[hi], t)
def s_at_r_top(r):
    """arc length on the upper dome (past the widest point) where the radius is r"""
    lo, hi = I_WIDE, len(PROF) - 1
    if r >= PROF[lo][0]: return PS[lo]
    while hi - lo > 1:
        md = (lo + hi) // 2
        if PROF[md][0] >= r: lo = md
        else: hi = md
    t = (PROF[lo][0] - r) / max(1e-12, PROF[lo][0] - PROF[hi][0]); return lerp(PS[lo], PS[hi], t)
# rows are spaced evenly in u = arc length / total + turning angle / pi: dense where the profile bends (the base tuck,
# the shoulders), so the ink outline stays smooth there
def _make_u():
    U = [0.0]
    for i in range(1, len(PROF)):
        a0 = math.atan2(PN[i - 1][1], PN[i - 1][0]); a1 = math.atan2(PN[i][1], PN[i][0])
        U.append(U[-1] + (PS[i] - PS[i - 1]) / PLEN + 2.0 * abs(a1 - a0) / math.pi)
    return U
PU = _make_u()
def u_at_s(s):
    s = clamp(s, 0, PLEN); i = max(1, min(len(PS) - 1, next((k for k in range(1, len(PS)) if PS[k] >= s), len(PS) - 1)))
    t = (s - PS[i - 1]) / max(1e-12, PS[i] - PS[i - 1]); return lerp(PU[i - 1], PU[i], t)
def s_at_u(u):
    lo, hi = 0, len(PU) - 1
    while hi - lo > 1:
        md = (lo + hi) // 2
        if PU[md] <= u: lo = md
        else: hi = md
    t = (u - PU[lo]) / max(1e-12, PU[hi] - PU[lo]); return lerp(PS[lo], PS[hi], clamp(t))
def s_between(sa, sb, f): return s_at_u(lerp(u_at_s(sa), u_at_s(sb), f))

def radial(th): return Vector((math.sin(th), -math.cos(th), 0))      # azimuth 0 = the front (-Y), + toward +X
def dome_pt(th, s):
    r, z, nr, nz = at_s(s); d = radial(th)
    return Vector((d.x * r, d.y * r, z)), Vector((d.x * nr, d.y * nr, nz))
def front_map(x, z):
    """the sheet's front view -> the dome: the point with this x and z on the front (-Y) side, and its normal"""
    s = s_at_z(z); r, zz, nr, nz = at_s(s)
    th = math.asin(clamp(x / r, -0.999, 0.999))
    d = radial(th)
    return Vector((d.x * r, d.y * r, zz)), Vector((d.x * nr, d.y * nr, nz))
def top_map(a, b):
    """top view (x, y) -> the dome below it (upper dome) and its normal"""
    r = math.hypot(a, b); th = math.atan2(a, -b) if r > 1e-9 else 0.0
    return dome_pt(th, s_at_r_top(r))

K_DOME = 36
def build_dome(m, V):
    s_flat = PS[I_FLAT]; s_band = s_at_z(BAND_Z)
    cols_body, cols_top, cols_band = hexc(V['body']), hexc(V['top']), hexc(V['band'])
    cool = V['cool']
    def shade(c, p, region):
        z = p.z
        if region == 'band': return mulc(c, lerp(0.94, 1.0, smooth(0.0, BAND_Z, z)))
        if region == 'body':
            k = lerp(0.965, 1.0, smooth(BAND_Z, 0.26, z))
            cc = c if cool is None else mixc(cool, c, smooth(BAND_Z, 0.30, z))
            return mulc(cc, k)
        return c
    rows_s = []                     # per row: a function of the column's azimuth -> s
    rows_reg = []                   # region of the faces above each row
    def add(fn, reg): rows_s.append(fn); rows_reg.append(reg)
    s_in = [f * R0 for f in (0.36, 0.66)]            # (on the flat bottom, arc length = radius)
    for s in s_in: add(lambda th, s=s: s, 'band')
    for t in (0.0, 0.25, 0.5, 0.75):
        add(lambda th, t=t: s_between(s_flat, s_band, t), 'band')
    NB = 8
    for i in range(NB):
        add(lambda th, i=i: s_between(s_band, s_at_z(cap_wave(th)), i / NB), 'body')
    s_top = PLEN
    for f in (0.0, 0.15, 0.30, 0.45, 0.60, 0.74):           # (King: the crown and cap cover the top)
        add(lambda th, f=f: s_between(s_at_z(cap_wave(th)), s_top, f), 'top')
    print('KING rows (r, z) at the side:', [tuple(round(c, 3) for c in at_s(fn(math.pi / 2))[:2]) for fn in rows_s])
    P, N = [], []
    for j, fn in enumerate(rows_s):
        rp, rn = [], []
        for k in range(K_DOME):
            th = 2 * math.pi * k / K_DOME
            p, n = dome_pt(th, fn(th)); rp.append(p); rn.append(n)
        P.append(rp); N.append(rn)
    regcol = {'band': cols_band, 'body': cols_body, 'top': cols_top}
    def colfn(j, k, q):
        reg = 'band' if j < 0 else rows_reg[min(j, len(rows_reg) - 1)]
        return [shade(regcol[reg], m.v[i], reg) for i in q]
    grid(m, P, N, colfn, pole0=(Vector((0, 0, 0)), Vector((0, 0, -1))), pole1=(Vector((0, 0, H0)), Vector((0, 0, 1))))

# ------------------------------------------------------------------ face shells (front-view 2D -> the dome)
def shell_place(x, z, h):
    p, n = front_map(x, z); return p + n * h, n

def oval_shell(m, cx, cz, a, b, rot, K, rings, h_edge, h_top, colfn, mapper=shell_place):
    """an oval (semi-axes a, b, rotated rot rad) as a shell: rings at the fractions in `rings` (1 = the edge),
    height h_edge at the edge rising to h_top inside. colfn(local x, local z) -> colour"""
    cr, sr = math.cos(rot), math.sin(rot)
    def loc(f, k):
        ang = 2 * math.pi * k / K
        u, v = a * f * math.cos(ang), b * f * math.sin(ang)
        return cx + u * cr - v * sr, cz + u * sr + v * cr, u, v
    def hgt(f): return lerp(h_top, h_edge, smooth(0.55, 1.0, f))
    P, N, L = [], [], []
    for f in rings:
        rp, rn, rl = [], [], []
        for k in range(K):
            x, z, u, v = loc(f, k); p, n = mapper(x, z, hgt(f)); rp.append(p); rn.append(n); rl.append((u, v))
        P.append(rp); N.append(rn); L.append(rl)
    pc, nc = mapper(cx, cz, hgt(0.0))
    flat = [q for r_ in L for q in r_] + [(0.0, 0.0)]
    def cf(j, k, q):
        out = []
        for i in q:
            idx = i - base
            u, v = flat[idx] if idx < len(flat) - 1 else (0.0, 0.0)
            out.append(colfn(u, v))
        return out
    base = len(m.v)
    grid(m, P, N, cf, pole1=(pc, nc))

def stroke_shell(m, spine, rad, M, h_edge, h_top, col, A=5, mapper=shell_place, radfn=None):
    """a thick round-capped stroke along a 2D spine [(x, z)], half-width rad (radfn(t) scales it), as a shell"""
    pts = catmull([Vector((x, z, 0)) for x, z in spine], M)
    T = []
    for i in range(M):
        d = pts[min(i + 1, M - 1)] - pts[max(i - 1, 0)]; d.normalize(); T.append(d)
    Q = (-1.0, -0.5, 0.0, 0.5, 1.0)
    def hgt(q): return lerp(h_top, h_edge, smooth(0.35, 1.0, abs(q)))
    rr = [rad * (radfn(i / (M - 1)) if radfn else 1.0) for i in range(M)]
    P, N = [], []
    for i in range(M):
        nrm = Vector((-T[i].y, T[i].x, 0))
        rp, rn = [], []
        for q in Q:
            c = pts[i] + nrm * (q * rr[i]); p, n = mapper(c.x, c.y, hgt(q)); rp.append(p); rn.append(n)
        P.append(rp); N.append(rn)
    ids = grid(m, P, N, lambda j, k, q: col, closed=False)
    # caps: half-discs past both ends (arcs at |q| = 1 and 0.5, the spine end as the centre)
    for end, sgn in ((0, -1.0), (M - 1, 1.0)):
        c0 = pts[end]; t = T[end] * sgn; nrm = Vector((-T[end].y, T[end].x, 0)); r_ = rr[end]
        arcs = {}
        for f in (1.0, 0.5):
            row = []
            for a in range(A + 1):
                ang = math.pi * a / A                     # 0: the +nrm side, pi: the -nrm side, through the tip
                d = nrm * math.cos(ang) + t * math.sin(ang)
                if a == 0: row.append(ids[end][Q.index(f)])
                elif a == A: row.append(ids[end][Q.index(-f)])
                else:
                    c = c0 + d * (f * r_); p, n = mapper(c.x, c.y, hgt(f)); row.append(m.vert(p, n))
            arcs[f] = row
        ci = ids[end][2]
        for a in range(A):
            m.face([arcs[1.0][a], arcs[1.0][a + 1], arcs[0.5][a + 1], arcs[0.5][a]], col)
            m.face([arcs[0.5][a], arcs[0.5][a + 1], ci], col)

def lathe_solid(m, prof, K, colfn, M=Matrix.Identity(4), th0=0.0):
    """closed surface of revolution about local Z: prof [(r, z)] bottom pole -> top pole; colfn(j, p_local, k)"""
    rows = prof[1:-1]
    P, Lp = [], []
    for r, z in rows:
        rp = [];
        for k in range(K):
            th = th0 + 2 * math.pi * k / K
            rp.append(Vector((r * math.sin(th), -r * math.cos(th), z)))
        Lp.append(rp); P.append([M @ p for p in rp])
    c = M @ Vector((0, 0, (prof[0][1] + prof[-1][1]) / 2))
    allp = {}
    def cf(j, k, q):
        return [colfn(m.v[i], Minv @ m.v[i]) for i in q]
    Minv = M.inverted()
    grid(m, P, None, cf, pole0=(M @ Vector((0, 0, prof[0][1])), None), pole1=(M @ Vector((0, 0, prof[-1][1])), None),
         hint=lambda j, k: None)
    return c

def fix_hints_from_centre(m, f0, centre_fn):
    """re-orient faces f0.. so they face away from centre_fn(face centre)"""
    for fi in range(f0, len(m.f)):
        idx = m.f[fi]; P = [m.v[i] for i in idx]
        fc = sum(P, Vector()) / len(P)
        nn = (P[1] - P[0]).cross(P[2] - P[0])
        if len(P) == 4: nn += (P[2] - P[0]).cross(P[3] - P[0])
        if nn.dot(fc - centre_fn(fc)) < 0:
            m.f[fi] = list(reversed(idx)); m.fc[fi] = list(reversed(m.fc[fi]))

def oval_solid(m, c, ax, ay, az, col, K=10, R=5, colfn=None):
    P = []
    for j in range(1, R + 1):
        eta = -math.pi / 2 + math.pi * j / (R + 1)
        P.append([c + Vector((ax * math.cos(eta) * math.sin(2 * math.pi * k / K), -ay * math.cos(eta) * math.cos(2 * math.pi * k / K), az * math.sin(eta))) for k in range(K)])
    f0 = len(m.f)
    grid(m, P, None, (lambda j, k, q: col) if colfn is None else (lambda j, k, q: [colfn(m.v[i]) for i in q]),
         pole0=(c - Vector((0, 0, az)), None), pole1=(c + Vector((0, 0, az)), None), hint=lambda j, k: None)
    fix_hints_from_centre(m, f0, lambda p: c)

def capsule(m, a, b, r, col, up, K=8, R=3):
    """a rounded arm from a to b (an ellipsoid along a-b, radius r): ball-like ends, no needle tips"""
    d = (b - a); L = d.length; d.normalize()
    u = (up - d * up.dot(d)).normalized(); w = d.cross(u)
    c = (a + b) / 2; hl = L / 2 + r * 0.6
    P = []
    for j in range(1, R + 1):
        eta = -math.pi / 2 + math.pi * j / (R + 1)
        P.append([c + d * (hl * math.sin(eta)) + (u * math.cos(2 * math.pi * k / K) + w * math.sin(2 * math.pi * k / K)) * (r * math.cos(eta)) for k in range(K)])
    f0 = len(m.f)
    grid(m, P, None, lambda j, k, q: col, closed=True, pole0=(c - d * hl, None), pole1=(c + d * hl, None), hint=lambda j, k: None)
    fix_hints_from_centre(m, f0, lambda p: c + d * clamp((p - c).dot(d), -hl * 0.7, hl * 0.7))

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
    flat = []
    for f, cols in zip(me.polygons, part.fc):
        assert f.loop_total == len(cols)
        for c in cols: flat.extend(c)
    attr.data.foreach_set('color', flat)
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    me.materials.append(mat)
    bad = me.validate(verbose=False)
    assert len(me.polygons) == len(part.f), 'validate removed faces'
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in part.n])
    ob = bpy.data.objects.new(part.name, me); bpy.context.scene.collection.objects.link(ob)
    ob.location = (0, 0, 0)
    return ob, bad

# ================================================================== King Mochi
KING = dict(body='#ffdbe8', top='#fff0f3', band='#f2b6cc', blush='#f0959c', cool=None)
COMMON = dict(eye='#292125', eye_low='#4a3330', catch='#ffffff')
KC = dict(gold='#f2c24a', gold_dk='#c8952a', ruby='#d94351', ruby_hi='#f07a84', sapph='#4a8ee0', emer='#3fae5a',
          velvet='#c8283a', cape='#c8283a', cape_in='#8e1b2c', fur='#fbf8f4', fur_dk='#e6dfe2', spot='#2a2430',
          stache='#6a3e2a')

def tilt_shell(m, v0, centres, rad, tilt):
    """bend a shell's normals (from vertex v0 on) away from its centre line, so a raised decal shades like a plump
    dome; they all still lean outward, so the ink hull stays behind it"""
    for i in range(v0, len(m.v)):
        p, n = m.v[i], m.n[i]
        c = min(centres, key=lambda q: (q - p).length_squared)
        d = p - c; d = d - n * d.dot(n)
        if d.length < 1e-6: continue
        m.n[i] = (n + d.normalized() * (tilt * min(1.0, d.length / rad))).normalized()

def face_king(m):
    eye, low, catch = hexc(COMMON['eye']), hexc(COMMON['eye_low']), hexc(COMMON['catch'])
    EX, EZ, EA, EB = 0.158, 0.290, 0.058, 0.072        # the callout: eyes ~0.11 x 0.13 m at z 0.29 (the slime's style)
    fe = EA / 0.050
    for s in (-1, 1):
        cx = s * EX
        oval_shell(m, cx, EZ, EA, EB, 0.0, 18, (1.0, 0.72, 0.4), 0.0012, 0.0035,
                   lambda u, v: mixc(eye, low, 0.85 * smooth(-0.005, -0.06, v)))
        oval_shell(m, cx - 0.013 * fe, EZ + 0.031 * fe, 0.0195 * fe, 0.0170 * fe, -0.5, 14, (1.0, 0.5), 0.0046, 0.0060, lambda u, v: catch)
        oval_shell(m, cx + 0.019 * fe, EZ - 0.028 * fe, 0.0085 * fe, 0.0080 * fe, 0.0, 10, (1.0,), 0.0046, 0.0058, lambda u, v: catch)
        # stern brows: steeper and thicker than the slime's, the inner end low over the eye
        sp = [(-0.030, 0.094), (0.0, 0.084), (0.024, 0.070), (0.042, 0.054), (0.050, 0.040)]
        stroke_shell(m, [(cx - s * x * fe, EZ + z * fe) for x, z in sp], 0.0155, 9, 0.0012, 0.0045, eye,
                     radfn=lambda t: lerp(0.85, 1.12, t))
        oval_shell(m, s * 0.300, 0.215, 0.048, 0.031, s * -0.05, 14, (1.0,), 0.0010, 0.0025, lambda u, v: hexc(KING['blush']))
    # the grand curly moustache: two plump lobes (raised 1.6 cm, normals bent so they shade round), tips curled up
    st = hexc(KC['stache'])
    for s in (-1, 1):
        sp = [(0.012, 0.205), (0.060, 0.186), (0.120, 0.166), (0.178, 0.168), (0.218, 0.190), (0.234, 0.222), (0.218, 0.246)]
        sp = [(s * x, z) for x, z in sp]
        v0 = len(m.v)
        stroke_shell(m, sp, 0.046, 12, 0.0015, 0.016, st, A=5,
                     radfn=lambda t: 0.74 + 0.30 * smooth(0.0, 0.25, t) - 0.70 * smooth(0.35, 1.0, t))
        spine3 = [front_map(q.x, q.y)[0] for q in catmull([Vector((x, z, 0)) for x, z in sp], 24)]
        tilt_shell(m, v0, spine3, 0.045, 0.55)
    # the brooch under it: a gold setting and a ruby (the callout's jewel where the mouth would be)
    v0 = len(m.v)
    oval_shell(m, 0.0, 0.088, 0.048, 0.048, 0.0, 16, (1.0, 0.6), 0.0012, 0.008, lambda u, v: hexc(KC['gold']))
    tilt_shell(m, v0, [front_map(0.0, 0.088)[0]], 0.048, 0.5)
    v0 = len(m.v)
    ruby, rhi = hexc(KC['ruby']), hexc(KC['ruby_hi'])
    oval_shell(m, 0.0, 0.090, 0.031, 0.033, 0.0, 14, (1.0, 0.55), 0.0085, 0.017,
               lambda u, v: mixc(ruby, rhi, 0.8 * (1 - smooth(0.004, 0.016, math.hypot(u + 0.010, v - 0.012)))))
    tilt_shell(m, v0, [front_map(0.0, 0.090)[0]], 0.031, 0.7)

# ------------------------------------------------------------------ the crown
CR_Z0, CR_R0, CR_SL = 0.500, 0.195, 0.25          # bottom height, bottom radius, flare (dr/dz)
CR_T = 0.030                                        # wall thickness
CR_VALLEY = 0.645
CR_N = 8                                            # points: front, +-45, +-90, +-135, back
def cr_peak(i):                                     # tip heights (under the balls): the front point tallest, as drawn
    c = math.cos(2 * math.pi * i / CR_N)
    return 0.735 + 0.050 * max(0.0, c) ** 1.5
def cr_top(th):
    w = math.pi / CR_N                              # half the spacing
    k = round(th / (2 * w)); d = abs(th - 2 * w * k)
    b = math.cos(math.pi / 2 * min(1.0, d / w)) ** 1.2
    return CR_VALLEY + (cr_peak(k % CR_N) - CR_VALLEY) * b
def cr_r(z): return CR_R0 + CR_SL * (z - CR_Z0)
def crown_wall_pt(th, z, h=0.0):
    r = cr_r(z); d = radial(th)
    n = Vector((d.x, d.y, -CR_SL)).normalized()
    return Vector((d.x * r, d.y * r, z)) + n * h, n

def crown(m):
    gold, gdk = hexc(KC['gold']), hexc(KC['gold_dk'])
    K = 40
    BAND = 0.548
    def bead(z): return 0.012 * math.sin(math.pi * clamp((z - CR_Z0 + 0.004) / (BAND - CR_Z0 + 0.004)))
    P = []
    for k in range(K):
        th = 2 * math.pi * k / K; top = cr_top(th); d = radial(th)
        sec = [(cr_r(z) + bead(z), z) for z in (CR_Z0, 0.524, BAND, top - 0.006)]
        sec.append((cr_r(top) - CR_T * 0.5, top + 0.010))                     # the rounded lip
        sec += [(cr_r(z) - CR_T, z) for z in (top - 0.006, CR_Z0)]
        P.append([Vector((d.x * r, d.y * r, z)) for r, z in sec])
    NS = len(P[0])
    ids = [[m.vert(p) for p in col] for col in P]
    f0 = len(m.f)
    for k in range(K):
        k1 = (k + 1) % K
        for j in range(NS):
            j1 = (j + 1) % NS
            q = [ids[k][j], ids[k1][j], ids[k1][j1], ids[k][j1]]
            m.face(q, gdk if (j < 2 or j == NS - 1) else gold, Vector((0, 0, 0)))
    def centre(p):
        th = math.atan2(p.x, -p.y); d = radial(th); z = clamp(p.z, CR_Z0, 0.8)
        r = cr_r(z) - CR_T * 0.5; return Vector((d.x * r, d.y * r, z))
    fix_hints_from_centre(m, f0, centre)
    # gold balls on the tips (rounded, 6.4 cm)
    for i in range(CR_N):
        th = 2 * math.pi * i / CR_N; z = cr_peak(i) + 0.022; d = radial(th); r = cr_r(z) - CR_T * 0.5
        oval_solid(m, Vector((d.x * r, d.y * r, z)), 0.032, 0.032, 0.032, gold, 8, 3)
    # jewels: domed shells on the wall (ruby in front, emeralds at +-45, sapphires at +-90)
    def mapper_for(th0):
        def mp(x, z, h): return crown_wall_pt(th0 + x / cr_r(z), z, h)
        return mp
    for th0, (a, b), col, zc in ((0.0, (0.050, 0.060), KC['ruby'], 0.672),
                                 (math.radians(45), (0.027, 0.040), KC['emer'], 0.650),
                                 (math.radians(-45), (0.027, 0.040), KC['emer'], 0.650),
                                 (math.radians(90), (0.026, 0.036), KC['sapph'], 0.640),
                                 (math.radians(-90), (0.026, 0.036), KC['sapph'], 0.640)):
        v0 = len(m.v); c = hexc(col); hi = mixc(c, '#ffffff', 0.45)
        oval_shell(m, 0.0, zc, a, b, 0.0, 12, (1.0, 0.55), 0.0015, 0.010,
                   lambda u, v, c=c, hi=hi, a=a: mixc(c, hi, 0.9 * (1 - smooth(0.15 * a, 0.5 * a, math.hypot(u + 0.3 * a, v - 0.35 * a)))),
                   mapper=mapper_for(th0))
        tilt_shell(m, v0, [crown_wall_pt(th0, zc)[0]], a, 0.7)

def velvet_cap(m):
    """the red velvet cap filling the crown: a soft dome, its rim just inside the crown's inner wall"""
    vel = hexc(KC['velvet']); vdk = mulc(vel, 0.82)
    prof = [(0.0, CR_Z0 - 0.01), (cr_r(CR_Z0) - CR_T - 0.004, CR_Z0 - 0.01), (cr_r(0.58) - CR_T - 0.004, 0.58),
            (cr_r(0.63) - CR_T - 0.012, 0.632), (0.13, 0.664), (0.07, 0.684), (0.0, 0.690)]
    f0 = len(m.f)
    lathe_solid(m, prof, 16, lambda p, pl: mixc(vdk, vel, smooth(0.60, 0.68, p.z)))
    fix_hints_from_centre(m, f0, lambda p: Vector((0, 0, min(p.z, 0.6))))

# ------------------------------------------------------------------ the ermine mantle (a fur roll on the shoulders)
FUR_A0, FUR_SPAN = 40, 280
def fur_path(u):
    """u 0..1: from the front-right end (azimuth +40 deg) round the back to the front-left end (-40 deg). Round 2:
    the callout's broad collar band: lowest on the upper sides (its lower edge ~0.31 m), a little higher at the back,
    rising onto the shoulders toward its front ends, which lie flat on the dome"""
    th = math.radians(FUR_A0 + FUR_SPAN * u)
    d = min(abs(th), abs(2 * math.pi - th))          # angular distance from the front
    z = 0.360 + 0.085 * smooth(math.radians(100), math.radians(40), d) + 0.040 * smooth(math.radians(100), math.pi, d)
    return th, z
def fur_frame(u):
    th, z = fur_path(u); s = s_at_z(z); p, n = dome_pt(th, s)
    p2, _ = dome_pt(th, s + 0.01); tm = (p2 - p).normalized()          # up the meridian
    return p, n, tm
FUR_W, FUR_T, FUR_OUT, FUR_P = 0.062, 0.030, 0.012, 3.0   # half-width (12.4 cm band), half-thickness, lift, squareness
def sqe(c, p): return math.copysign(abs(c) ** (2 / p), c)
def fur_taper(u):
    t = smooth(0.0, 0.11, u) * smooth(1.0, 0.89, u)
    return 0.45 + 0.55 * math.sqrt(t), 0.30 + 0.70 * math.sqrt(t)
def fur_pt(u, ph):
    """a flat-ish band: a rounded-rectangle (superellipse) section, 1.2 cm lifted, its underside sunk into the dome"""
    p, n, tm = fur_frame(u); tw, tt = fur_taper(u)
    c = p + n * FUR_OUT
    return c + tm * (FUR_W * tw * sqe(math.cos(ph), FUR_P)) + n * (FUR_T * tt * sqe(math.sin(ph), FUR_P)), c
def fur_top(u, y, h=0.0):
    """the band's top face at an across offset y (m, up the meridian): for the tail-tip dots"""
    p, n, tm = fur_frame(u); tw, tt = fur_taper(u)
    a = clamp(y / (FUR_W * tw), -0.95, 0.95)
    top = FUR_T * tt * (1 - abs(a) ** FUR_P) ** (1 / FUR_P)
    nn = (n - tm * (a * 0.6)).normalized()
    return p + n * (FUR_OUT + top) + tm * y + nn * h, nn
def fur(m):
    fu, fd, spot = hexc(KC['fur']), hexc(KC['fur_dk']), hexc(KC['spot'])
    NU, NP = 22, 8
    us = [0.012 + 0.976 * (i / (NU - 1)) for i in range(NU)]
    P = [[fur_pt(u, 2 * math.pi * k / NP + math.pi / NP)[0] for k in range(NP)] for u in us]
    def endpole(u, du):
        p, n, tm = fur_frame(u); c = fur_pt(u, 0)[1]; nxt = fur_pt(u + du, 0)[1]
        return c + (c - nxt).normalized() * 0.026 - n * 0.006
    f0 = len(m.f)
    def col(p):                                       # a soft grey-lilac shade on its underside
        u = min(us, key=lambda u: (fur_pt(u, 0)[1] - p).length_squared)
        n = fur_frame(u)[1]; return mixc(fd, fu, smooth(-0.015, 0.02, (p - fur_pt(u, 0)[1]).dot(n)))
    grid(m, P, None, lambda j, k, q: [col(m.v[i]) for i in q], pole0=(endpole(us[0], 0.02), None),
         pole1=(endpole(us[-1], -0.02), None), hint=lambda j, k: None)
    def centre(p):
        u = min(us, key=lambda u: (fur_pt(u, 0)[1] - p).length_squared); return fur_pt(u, 0)[1]
    fix_hints_from_centre(m, f0, centre)
    # round dark tail-tip dots, two staggered rows on the top face
    L = sum((fur_pt(b, 0)[1] - fur_pt(a, 0)[1]).length for a, b in zip(us, us[1:]))
    for i in range(14):
        u = 0.05 + 0.90 * i / 13; y = 0.026 if i % 2 else -0.024
        def mp(x, z, h, u=u, y=y): return fur_top(clamp(u + x / L), y + z, h)
        oval_shell(m, 0.0, 0.0, 0.0145, 0.0145, 0.0, 8, (1.0,), 0.0015, 0.0035, lambda x, z: spot, mapper=mp)

# ------------------------------------------------------------------ the royal cape
def dome_env(z):
    """the dome's outermost radius at or above height z"""
    r = at_s(s_at_z(max(z, 0.0)))[0]
    return max(r, R0 * 0.999) if z <= PROF[I_WIDE][1] else r
def cape(m):
    """a closed shell 3.5 cm thick round the back half, from under the fur roll to the floor, flaring out a little,
    with soft folds; red outside, darker inside, the front edges and the hem rounded"""
    red, dk = hexc(KC['cape']), hexc(KC['cape_in'])
    NT = 16
    def edges(j):                                     # round 2: the front edge sweeps back a little toward the hem
        t = 1 - FR[j] if j < len(FR) else 1.0
        e = math.radians(94 + 13 * t ** 1.4 + 3 * math.sin(math.pi * t))
        return e, 2 * math.pi - e
    TA, TB = math.radians(94), math.radians(266)
    T = 0.035
    def ztop(th):
        return fur_path(clamp((math.degrees(th) - FUR_A0) / FUR_SPAN))[1] - 0.035
    def r_mid(th, z):
        zt = ztop(th); t = clamp((zt - z) / zt)
        r_top = at_s(s_at_z(zt))[0] - 0.006                                  # tucked in at the top, under the fur
        r_lin = lerp(r_top, 0.560, t ** 0.9)                                 # an A-line down to a flared hem
        base = max(r_lin, dome_env(z) + 0.022) if z < zt - 0.05 else r_lin
        return base + 0.014 * math.sin(7 * th + 0.5) * t ** 1.2           # soft folds, growing toward the floor
    FR = (1.0, 0.78, 0.56, 0.36, 0.18)
    NR = len(FR) + 2
    def zrow(th, j): return ztop(th) * FR[j] if j < len(FR) else (0.024 if j == len(FR) else 0.0)
    loops = []
    for j in range(NR):
        hw = T / 2 if j < NR - 1 else 0.006
        TA, TB = edges(j); ths = [lerp(TA, TB, i / (NT - 1)) for i in range(NT)]
        loop = []
        for th in ths:
            z = zrow(th, j); r = r_mid(th, z) + hw; d = radial(th); loop.append((Vector((d.x * r, d.y * r, z)), 'o'))
        z = zrow(TB, j); r = r_mid(TB, z); d = radial(TB + hw / r * 1.2); loop.append((Vector((d.x * r, d.y * r, z)), 'e'))
        for th in reversed(ths):
            z = zrow(th, j); r = r_mid(th, z) - hw; d = radial(th); loop.append((Vector((d.x * r, d.y * r, z)), 'i'))
        z = zrow(TA, j); r = r_mid(TA, z); d = radial(TA - hw / r * 1.2); loop.append((Vector((d.x * r, d.y * r, z)), 'e'))
        loops.append(loop)
    ids = [[m.vert(p) for p, t in lp] for lp in loops]
    tags = [t for p, t in loops[0]]
    NL = len(tags)
    f0 = len(m.f)
    for j in range(NR - 1):
        for k in range(NL):
            k1 = (k + 1) % NL
            q = [ids[j][k], ids[j][k1], ids[j + 1][k1], ids[j + 1][k]]
            tg = {tags[k], tags[k1]}
            m.face(q, dk if 'i' in tg and 'o' not in tg else red, Vector((0, 0, 0)))
    # the hem: close the bottom loop (outer and inner 1.2 cm apart there)
    last = ids[NR - 1]
    for k in range(NT - 1):
        m.face([last[k], last[k + 1], last[2 * NT - k - 1], last[2 * NT - k]], dk, Vector((0, 0, -1)))
    m.face([last[NT - 1], last[NT], last[NT + 1]], dk, Vector((0, 0, -1)))
    m.face([last[2 * NT], last[2 * NT + 1], last[0]], dk, Vector((0, 0, -1)))
    def centre(p):
        th = math.atan2(p.x, -p.y) % (2 * math.pi); th = clamp(th, math.radians(94), math.radians(266)); z = clamp(p.z, 0.0, 0.6)
        r = r_mid(th, z); d = radial(th); return Vector((d.x * r, d.y * r, z))
    fix_hints_from_centre(m, f0, centre)
    # (the top loop is tucked inside the dome, under the fur roll: never seen)

def build_king():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    m = Part('body')
    counts = {}
    def mark(n, f):
        f(); counts[n] = m.tris() - sum(counts.values())
    mark('dome', lambda: build_dome(m, KING))
    mark('face', lambda: face_king(m))
    mark('crown', lambda: crown(m))
    mark('cap', lambda: velvet_cap(m))
    mark('fur', lambda: fur(m))
    mark('cape', lambda: cape(m))
    ob, bad = to_object(m, mat)
    lo = Vector((min(v.x for v in m.v), min(v.y for v in m.v), min(v.z for v in m.v)))
    hi = Vector((max(v.x for v in m.v), max(v.y for v in m.v), max(v.z for v in m.v)))
    print('KING tris %d %s | W%.3f D%.3f H%.3f | z %.4f..%.3f x %.3f..%.3f y %.3f..%.3f | validate-fixed %s' % (
        m.tris(), counts, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.z, hi.z, lo.x, hi.x, lo.y, hi.y, bad))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'mochi-king.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, 'mochi-king.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('KING export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('KING wrote', out)

build_king()
