# Mochi slime (Pawhaven enemy EN-1, the Burrow) -- Option A "Daifuku Drop".
# Deterministic build, from an empty scene, of the three variant GLBs:
#   blender --background --factory-startup --python build_mochi-slime.py -- [--only base|leaf|snow]
# One rigid mesh per variant (the brief's one-piece note): a single object `body`, origin (0, 0, 0) = the ground
# centre. The game bobs / squashes / tilts / spins the whole model about that origin.
#   dome       a surface of revolution measured on the sheet's front view (0.85 m wide); colour rings run along
#              modelled edge loops: the darker base band, the body, the lighter dusted top (a gently wavy border)
#   face       shells 1-6 mm proud of the dome, mapped onto it from the sheet's front view (so the eyes face about
#              20 deg outward, set into the curve), sharing the dome's normals (smooth shading, clean ink hull):
#              eyes (dark iris, warm-brown lower half, big + small catchlight), thick grumpy brows, a "^" mouth, blush
#   topping    base: a strawberry (sunk 3 cm into the top) with one plump leaf;
#              leaf: a sakura leaf draped over the top (a closed lens sunk into the dome, a darker centre vein);
#              snow: a little snow heap (soft lumps) with a chunky six-arm snowflake tilted toward the camera
# Vertex colours only (attribute `Col`, face-corner domain); one material `toon`. No rig, no textures, no UVs.
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('MOCHI build pid', os.getpid())

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

VARIANTS = {
    'base': dict(body='#ffd6e4', top='#fdf0ec', band='#efadc4', blush='#e98c91', cool=None, topping='berry'),
    'leaf': dict(body='#d8f0c0', top='#eff6e0', band='#b9d9a0', blush='#e98c91', cool=None, topping='sakura'),
    'snow': dict(body='#fff8f4', top='#fffcfa', band='#dfe8f6', blush='#9ec4ee', cool='#eaeff8', topping='snow'),
}
COMMON = dict(eye='#292125', eye_low='#4a3330', catch='#ffffff', mouth='#292125',
              berry='#d94351', berry_dk='#b5323f', berry_hi='#f0848d', leaf='#73a452', leaf_dk='#5a8a3d',
              snow='#f8fbff', snow_dk='#d6e2f3', flake='#8cb9ee', flake_dk='#76a6e0')

# ------------------------------------------------------------------ math
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
R0, H0 = 0.425, 0.49
CTRL = [(0.0, 0.0), (0.40, 0.0), (0.775, 0.0), (0.862, 0.013), (0.912, 0.044), (0.944, 0.106), (0.967, 0.150),
        (0.990, 0.205), (1.0, 0.27), (0.996, 0.34), (0.985, 0.41), (0.968, 0.475), (0.945, 0.538), (0.915, 0.596),
        (0.882, 0.654), (0.842, 0.712), (0.790, 0.769), (0.728, 0.827), (0.646, 0.885), (0.556, 0.938),
        (0.450, 0.968), (0.300, 0.988), (0.150, 0.997), (0.0, 1.0)]
BAND_Z = 0.106 * H0           # the base band's top border
CAP_Z = 0.77 * H0             # the dusted top's border (plus a gentle wave)
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
    for f in (0.0, 0.13, 0.26, 0.385, 0.505, 0.62, 0.73, 0.83, 0.92):
        add(lambda th, f=f: s_between(s_at_z(cap_wave(th)), s_top, f), 'top')
    print('MOCHI rows (r, z) at the side:', [tuple(round(c, 3) for c in at_s(fn(math.pi / 2))[:2]) for fn in rows_s])
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

# round 2 (director): the face 3 cm higher and the eye group 15 % bigger about each eye centre (spacing ratio kept:
# the eye centres move out by the same 15 %), so it reads from 45 deg at 16 m
FS, FUP = 1.15, 0.030
EYE_X, EYE_Z, EYE_A, EYE_B = 0.148 * FS, 0.203 + FUP, 0.050 * FS, 0.063 * FS
def build_face(m, V):
    eye, low, catch = hexc(COMMON['eye']), hexc(COMMON['eye_low']), hexc(COMMON['catch'])
    for s in (-1, 1):
        cx = s * EYE_X
        # the eye: dark iris, a warm-brown glow in its lower half (soft, per corner)
        oval_shell(m, cx, EYE_Z, EYE_A, EYE_B, 0.0, 18, (1.0, 0.72, 0.4), 0.0012, 0.0035,
                   lambda u, v: mixc(eye, low, 0.85 * smooth(-0.005, -0.055, v)))
        # catchlights (the same light from the upper left on both eyes, like the sheet)
        oval_shell(m, cx - 0.013 * FS, EYE_Z + 0.031 * FS, 0.0195 * FS, 0.0170 * FS, -0.5, 14, (1.0, 0.5), 0.0046, 0.0060, lambda u, v: catch)
        oval_shell(m, cx + 0.019 * FS, EYE_Z - 0.028 * FS, 0.0085 * FS, 0.0080 * FS, 0.0, 10, (1.0,), 0.0046, 0.0058, lambda u, v: catch)
        # brow: outer end high, inner end low with a little hook down toward the eye
        sp = [(-0.027, 0.088), (0.0, 0.081), (0.024, 0.071), (0.043, 0.057), (0.051, 0.041)]
        sp = [(cx - s * x * FS, EYE_Z + z * FS) for x, z in sp]
        stroke_shell(m, sp, 0.0135 * 1.07, 9, 0.0012, 0.0045, eye, radfn=lambda t: lerp(0.85, 1.12, t))
        # blush
        oval_shell(m, s * 0.268, 0.134 + FUP, 0.044, 0.028, s * -0.05, 14, (1.0,), 0.0010, 0.0025, lambda u, v: hexc(V['blush']))
    # the "^" mouth
    stroke_shell(m, [(x, z + FUP) for x, z in ((-0.037, 0.141), (-0.012, 0.160), (0.0, 0.165), (0.012, 0.160), (0.037, 0.141))], 0.0105, 9,
                 0.0012, 0.0040, hexc(COMMON['mouth']))

# ------------------------------------------------------------------ toppings
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

def berry(m):
    """a plump strawberry (sheet: 0.20 m wide, 0.13 m above the dome), calyx side up, sunk 3 cm into the top"""
    prof = [(0.0, -0.034), (0.070, -0.032), (0.098, -0.012), (0.105, 0.018), (0.101, 0.050), (0.088, 0.080),
            (0.064, 0.104), (0.034, 0.118), (0.0, 0.122)]
    dense = catmull([Vector((r, 0, z)) for r, z in prof], 10)
    prof = [(max(0.0, p.x), p.z) for p in dense]; prof[0] = (0.0, prof[0][1]); prof[-1] = (0.0, prof[-1][1])
    base_z = H0 - 0.002
    M = Matrix.Translation((0.008, 0.004, base_z)) @ Matrix.Rotation(math.radians(5), 4, 'Y') @ Matrix.Rotation(math.radians(-3), 4, 'X')
    red, dk, hi = hexc(COMMON['berry']), hexc(COMMON['berry_dk']), hexc(COMMON['berry_hi'])
    def col(p, pl):
        c = mixc(dk, red, smooth(-0.01, 0.07, pl.z))
        # a soft highlight on the upper front-left (the sheet's painted gloss), as a gentle per-corner blend
        d = (Vector((pl.x, pl.y, pl.z)) - Vector((-0.045, -0.060, 0.095))).length
        return mixc(c, hi, 0.75 * (1 - smooth(0.012, 0.045, d)))
    f0 = len(m.f)
    lathe_solid(m, prof, 18, col, M)
    fix_hints_from_centre(m, f0, lambda p: M @ Vector((0, 0, (M.inverted() @ p).z)))
    return M

def lens_leaf(m, root, d, nrm, L, W, T, col, col_dk, nu=9, nv=10, curl=0.25):
    """a plump leaf: a lens-section solid from root along d, broad face toward nrm; length L, width W, thickness T;
    a rounded tip and root (ball ends, so the ink outline can't turn them into needles); curls toward nrm"""
    d = d.normalized(); nrm = (nrm - d * nrm.dot(d)).normalized(); w = d.cross(nrm)
    rings, cs = [], []
    us = [0.06 + 0.88 * i / (nu - 1) for i in range(nu)]
    def hw(u): return W / 2 * (math.sin(math.pi * u) ** 0.75) * (1 - 0.25 * u)
    def ht(u): return T / 2 * (math.sin(math.pi * u) ** 0.6)
    def spine(u): return root + d * (L * u) + nrm * (curl * L * u * u)
    P = []
    for u in us:
        c = spine(u); ring = []
        for k in range(nv):
            a = 2 * math.pi * k / nv
            ring.append(c + w * (hw(u) * math.cos(a)) + nrm * (ht(u) * math.sin(a)))
        P.append(ring); cs.append(c)
    f0 = len(m.f)
    def cf(j, k, q):                         # the underside a shade darker (one colour per face)
        p = sum((m.v[i] for i in q), Vector()) / len(q)
        rel = p - spine(clamp((p - root).dot(d) / L, 0, 1))
        return col if rel.dot(nrm) > -0.004 else col_dk
    grid(m, P, None, cf, pole0=(spine(0.0) - d * 0.004, None), pole1=(spine(1.0) + d * 0.004, None), hint=lambda j, k: None)
    def centre(p):
        u = clamp((p - root).dot(d) / L, 0, 1); return spine(u)
    fix_hints_from_centre(m, f0, centre)

def berry_leaf(m, M):
    top = M @ Vector((-0.006, 0.004, 0.108))
    d = Vector((0.86, 0.34, 0.40)); cam = Vector((0, -0.7, 0.72))
    lens_leaf(m, top, d, cam, 0.135, 0.090, 0.034, hexc(COMMON['leaf']), hexc(COMMON['leaf_dk']), nu=8, nv=10, curl=0.16)

def oval_solid(m, c, ax, ay, az, col, K=10, R=5, colfn=None):
    P = []
    for j in range(1, R + 1):
        eta = -math.pi / 2 + math.pi * j / (R + 1)
        P.append([c + Vector((ax * math.cos(eta) * math.sin(2 * math.pi * k / K), -ay * math.cos(eta) * math.cos(2 * math.pi * k / K), az * math.sin(eta))) for k in range(K)])
    f0 = len(m.f)
    grid(m, P, None, (lambda j, k, q: col) if colfn is None else (lambda j, k, q: [colfn(m.v[i]) for i in q]),
         pole0=(c - Vector((0, 0, az)), None), pole1=(c + Vector((0, 0, az)), None), hint=lambda j, k: None)
    fix_hints_from_centre(m, f0, lambda p: c)

def sakura_leaf(m):
    """the sakura-mochi leaf draped over the top: a closed lens (top skin 0.4-2.6 cm proud of the dome, the bottom
    skin sunk 6 mm inside it), its long axis from the stem (back right) to the tip (front, a little left)"""
    col, dk = hexc(COMMON['leaf']), hexc(COMMON['leaf_dk'])
    ang = math.radians(-14)                 # the tip direction: toward the front (-Y), turned a little to the left
    D = Vector((math.sin(ang), -math.cos(ang), 0)); Wv = Vector((-D.y, D.x, 0))
    C = Vector((0.02, 0.03, 0))
    L0, L1, HWm = 0.22, 0.30, 0.20          # behind / ahead of the centre, max half-width
    NU, NV = 12, 9
    def hw(u):                               # u in -1 (stem) .. 1 (tip)
        t = (u + 1) / 2
        return HWm * (math.sin(math.pi * clamp(t, 0, 1)) ** 0.7) * (1 - 0.18 * t) * (1 + 0.04 * math.sin(9 * t * math.pi))
    def place(u, v, h):
        a = C + D * (u * (L1 if u > 0 else L0)) + Wv * (v * hw(u))
        p, n = top_map(a.x, a.y)
        return p + n * h, n
    def lift(u, v): return 0.016 * abs(v) ** 2.5 * (1 - 0.5 * max(0.0, u) ** 2)   # the sides curl up a little
    def thick(u, v): return lift(u, v) + 0.007 + 0.020 * (1 - v * v) * (1 - 0.6 * abs(u) ** 2)
    us = [-0.97 + 1.94 * i / (NU - 1) for i in range(NU)]
    vs = [-1.0, -0.72, -0.45, -0.2, -0.06, 0.06, 0.2, 0.45, 0.72, 1.0]; NV = len(vs)
    top, bot = [], []
    for u in us:
        rt, rb = [], []
        for v in vs:
            rt.append(place(u, v, thick(u, v))); rb.append(place(u, v, lift(u, v) - 0.012 * (1 - v * v) - 0.001))
        top.append(rt); bot.append(rb)
    # the vein: the centre column (|v| small) on the top skin; colour per corner by |v|
    def colfn_top(j, k, q):                  # the vein: the centre column, one colour per face (a crisp border)
        return dk if k == 4 and -0.9 < us[j] < 0.75 else col
    # build: top skin, bottom skin, and close the rim (the two v = +-1 sides and the two ends) through a rim ring
    Pt = [[p for p, n in r_] for r_ in top]; Nt = [[n for p, n in r_] for r_ in top]
    Pb = [[p for p, n in r_] for r_ in bot]; Nb = [[-n for p, n in r_] for r_ in bot]
    f0 = len(m.f)
    it = grid(m, Pt, Nt, colfn_top, closed=False)
    ib = grid(m, Pb, Nb, lambda j, k, q: col, closed=False)
    # stitch the outline: rim ring = top skin edge -> bottom skin edge
    ring_t, ring_b = [], []
    for j in range(NU): ring_t.append(it[j][0]); ring_b.append(ib[j][0])
    for k in range(1, NV): ring_t.append(it[NU - 1][k]); ring_b.append(ib[NU - 1][k])
    for j in range(NU - 2, -1, -1): ring_t.append(it[j][NV - 1]); ring_b.append(ib[j][NV - 1])
    for k in range(NV - 2, 0, -1): ring_t.append(it[0][k]); ring_b.append(ib[0][k])
    n = len(ring_t)
    for i in range(n):
        a, b = i, (i + 1) % n
        q = [ring_t[a], ring_t[b], ring_b[b], ring_b[a]]
        P = [m.v[x] for x in q]; fc = sum(P, Vector()) / 4
        p0, n0 = top_map(C.x, C.y)
        out = fc - p0; out = out - n0 * out.dot(n0)
        m.face(q, col, out)
    # top skin faces outward along the dome normal, the bottom skin inward (grid used the given normals as hints)
    return

def heap_h(x, y):
    """one smooth convex mound (no creases: a fold would show the ink hull inside it), its footprint gently
    three-lobed (lobes front-left, front-right and back) and its top a little off-centre toward the back"""
    rho = math.hypot(x, y); th = math.atan2(x, -y)
    R = 0.150 * (1 + 0.06 * math.cos(3 * th + math.pi))
    t = rho / R
    if t >= 1: return 0.0
    H = 0.050 * (1 - t * t) ** 0.8                         # the soft base mound
    # round 2: three soft lumps added on top (bell bumps, smooth to second order at their edges, summed: the
    # valleys between them are gentle saddles, never creases)
    for (cx, cy), r, h in (((0.0, 0.018), 0.082, 0.064), ((-0.084, -0.006), 0.070, 0.052), ((0.086, 0.000), 0.068, 0.050)):
        q = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r)
        if q < 1: H += h * (1 - q) ** 2.2
    return H
def heap_z(x, y): return top_map(x, y)[0].z + heap_h(x, y) - 0.004
def heap_n(x, y, e=0.003):
    dx = (heap_z(x + e, y) - heap_z(x - e, y)) / (2 * e); dy = (heap_z(x, y + e) - heap_z(x, y - e)) / (2 * e)
    return Vector((-dx, -dy, 1)).normalized()

def snow_heap(m):
    """a little snow heap on the top (the sheet: ~0.3 m wide, a soft cloud of lumps) as ONE height-field shell over
    the dome (no intersecting pieces, so the ink hull draws no stray lines inside it), and a chunky six-arm snowflake
    as a raised shell on its front slope, drawn in the plane facing the 45 deg camera"""
    sn, sd = hexc(COMMON['snow']), hexc(COMMON['snow_dk'])
    K = 24
    rims = []
    for k in range(K):
        th = 2 * math.pi * k / K; d = radial(th); rho = 0.0
        for i in range(1, 160):
            q = i * 0.0016
            if heap_h(d.x * q, d.y * q) > 0.0004: rho = q
        rims.append(rho)
    F = (0.14, 0.29, 0.43, 0.56, 0.68, 0.79, 0.88, 0.95, 1.0)
    P = []
    for f in F:
        row = []
        for k in range(K):
            th = 2 * math.pi * k / K; d = radial(th); x, y = d.x * rims[k] * f, d.y * rims[k] * f
            row.append(Vector((x, y, heap_z(x, y))))
        P.append(row)
    def col(p): return mixc(sd, sn, smooth(0.0, 0.07, heap_h(p.x, p.y)))
    grid(m, P, None, lambda j, k, q: [col(m.v[i]) for i in q], pole0=(Vector((0, 0, heap_z(0, 0))), None),
         hint=lambda j, k: Vector((0, 0, 1)))
    # the snowflake
    v = Vector((0, -0.62, 0.78)).normalized(); ex = Vector((1, 0, 0)); ey = -ex.cross(v)
    c0 = Vector((0.0, -0.076, heap_z(0.0, -0.076)))
    def mapper(a, b, h):
        o = c0 + v * 0.4 + ex * a + ey * b
        lo, hi = 0.0, 0.8
        for _ in range(40):
            t = (lo + hi) / 2; p = o - v * t
            if p.z > heap_z(p.x, p.y): lo = t
            else: hi = t
        p = o - v * hi; n = heap_n(p.x, p.y)
        return p + n * h, n
    fc = hexc(COMMON['flake'])
    oval_shell(m, 0.0, 0.0, 0.027, 0.027, 0.0, 12, (1.0, 0.5), 0.0015, 0.0065, lambda u, w: fc, mapper=mapper)
    for i in range(6):
        a = math.radians(90 + 60 * i); ca, sa = math.cos(a), math.sin(a)
        stroke_shell(m, [(ca * 0.016, sa * 0.016), (ca * 0.037, sa * 0.037), (ca * 0.058, sa * 0.058)], 0.0135, 3,
                     0.0015, 0.0060, fc, A=4, mapper=mapper, radfn=lambda t: lerp(1.0, 1.12, t))

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

def build_variant(key):
    V = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    m = Part('body')
    counts = {}
    def mark(n, f):
        f(); counts[n] = m.tris() - sum(counts.values())
    mark('dome', lambda: build_dome(m, V))
    mark('face', lambda: build_face(m, V))
    if V['topping'] == 'berry':
        Mb = [None]
        mark('berry', lambda: Mb.__setitem__(0, berry(m)))
        mark('leaf', lambda: berry_leaf(m, Mb[0]))
    elif V['topping'] == 'sakura':
        mark('sakura_leaf', lambda: sakura_leaf(m))
    else:
        mark('snow', lambda: snow_heap(m))
    ob, bad = to_object(m, mat)
    lo = Vector((min(v.x for v in m.v), min(v.y for v in m.v), min(v.z for v in m.v)))
    hi = Vector((max(v.x for v in m.v), max(v.y for v in m.v), max(v.z for v in m.v)))
    print('MOCHI %s tris %d %s | W%.3f D%.3f H%.3f | z %.4f..%.3f x %.3f..%.3f y %.3f..%.3f | validate-fixed %s' % (
        key, m.tris(), counts, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.z, hi.z, lo.x, hi.x, lo.y, hi.y, bad))
    name = 'mochi-slime' if key == 'base' else 'mochi-slime_' + key
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('MOCHI export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('MOCHI wrote', out)

for key in VARIANTS:
    if ONLY and key != ONLY: continue
    build_variant(key)
