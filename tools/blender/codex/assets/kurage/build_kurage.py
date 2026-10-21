# Kurage (Pawhaven enemy EN-1, Shiokaze Tidepools) -- Option B "Wind Chime".
# Deterministic build, from an empty scene, of the three variant GLBs:
#   blender --background --factory-startup --python build_kurage.py -- [--only base|ao|sakura]
# Parts (enemy contract + the brief's origin exception): every part's origin is (0, 0, 0) = the centre of the bell's
# rim; the bell sits above z = 0, the frill / arms / tentacles hang below it.
#   body       cap, knob, carry loop, core stem, rim band, face (thin shells 3-5 mm outside the bell), [sakura blossom]
#   bell       the glass shell only: a lobed surface of revolution, 1.8 cm thick, open underneath, rounded lip
#   core       the glowing clapper bulb (all `glow`)
#   frill      12 chunky rounded petals under the rim band
#   arms       the hub under the bell and the four frilly oral arms
#   tentacles  four short ribbons + the long tanzaku, glowing tips on `glow`
# Vertex colours only (attribute `Col`, face-corner domain); materials `toon` and `glow`. No rig, no textures, no UVs.
import bpy, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else None
print('KURAGE build pid', os.getpid())

# ------------------------------------------------------------------ colour
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t):
    if isinstance(a, str): a = hexc(a)
    if isinstance(b, str): b = hexc(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

VARIANTS = {
    'base':   dict(bell='#ffbf78', core='#fff0a0', frill='#ff9a68', arm='#ffc8a0', tent='#ffe6cc', cap='#4a2630',
                   iris='#3a1d26', iris_low='#73403a', blossom=False),
    'ao':     dict(bell='#86d0ff', core='#e6fcff', frill='#6aaeff', arm='#b4defc', tent='#e8f8ff', cap='#233a5e',
                   iris='#1d2440', iris_low='#3d5480', blossom=False),
    'sakura': dict(bell='#ffa6d2', core='#fff2fa', frill='#ff78b6', arm='#ffbcdc', tent='#ffe8f6', cap='#5a2448',
                   iris='#381830', iris_low='#743a5c', blossom=True),
}
COMMON = dict(blush='#e98c91', catch='#ffffff', petal='#ffd0e6', petal_c='#ff78b6')

# ------------------------------------------------------------------ math
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(a, b, x):
    t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t)
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def radial(th): return Vector((math.sin(th), -math.cos(th), 0))      # azimuth 0 = the front (-Y), + toward +X
def tangential(th): return Vector((math.cos(th), math.sin(th), 0))

def catmull(pts, n, closed=False):
    P = list(pts)
    if closed: P = [P[-1]] + P + [P[0], P[1]]; segs = len(pts)
    else: P = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]; segs = len(pts) - 1
    out = []
    cnt = n if closed else n
    for i in range(cnt):
        u = i / (cnt if closed else cnt - 1) * segs; s = min(int(u), segs - 1); t = u - s
        p0, p1, p2, p3 = P[s], P[s + 1], P[s + 2], P[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out

def resample(poly, n, closed=False):
    """n points evenly spaced by arc length along a dense polyline"""
    pts = list(poly) + ([poly[0]] if closed else [])
    L = [0.0]
    for i in range(1, len(pts)): L.append(L[-1] + (pts[i] - pts[i - 1]).length)
    tot = L[-1]; out = []; j = 0
    for k in range(n):
        s = tot * k / (n if closed else n - 1)
        while j < len(L) - 2 and L[j + 1] < s: j += 1
        t = (s - L[j]) / max(1e-12, L[j + 1] - L[j]); out.append(pts[j].lerp(pts[j + 1], t))
    return out

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

def ring_surface(m, rings, centres, colfn, pole0=None, pole1=None, normals=None, mat=0, closed=False):
    """quads between consecutive rings (each a closed loop of K verts); `closed` also joins the last ring to the
    first (a torus / a closed lathe profile). The face orientation is chosen to point away from the centres."""
    nf = normals or (lambda p: None)
    ids = [[m.vert(p, nf(p)) for p in ring] for ring in rings]
    K = len(rings[0]); R = len(rings)
    mf = mat if callable(mat) else (lambda j, k: mat)
    for j in range(R - 1 + (1 if closed else 0)):
        j1 = (j + 1) % R
        c = (centres[j] + centres[j1]) / 2
        for k in range(K):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j1][(k + 1) % K], ids[j1][k]]
            fc = sum((m.v[i] for i in q), Vector()) / 4
            m.face(q, colfn(j, k), fc - c, mf(j, k))
    for pole, j, ring, c in ((pole0, -1, 0, centres[0]), (pole1, R - 1, -1, centres[-1])):
        if pole is None: continue
        pi = m.vert(pole, nf(pole))
        for k in range(K):
            q = [pi, ids[ring][k], ids[ring][(k + 1) % K]]
            fc = sum((m.v[i] for i in q), Vector()) / 3
            m.face(q, colfn(j, k), fc - c, mf(j, k))
    return ids

def ellipsoid(m, c, ax, ay, az, K, R, colfn, mat=0):
    rings, cs = [], []
    for j in range(1, R + 1):
        eta = -math.pi / 2 + math.pi * j / (R + 1)
        ring = [c + ax * (math.cos(eta) * math.cos(2 * math.pi * k / K)) + ay * (math.cos(eta) * math.sin(2 * math.pi * k / K)) + az * math.sin(eta) for k in range(K)]
        rings.append(ring); cs.append(c + az * math.sin(eta))
    ring_surface(m, rings, cs, colfn, c - az, c + az, mat=mat)

def lathe(m, prof, K, colfn, th0=0.0, mat=0, pole_bot=True, pole_top=True):
    """surface of revolution about Z: prof = [(r, z)...] bottom -> top; r = 0 ends become poles"""
    rings, cs = [], []
    body = [(r, z) for r, z in prof]
    p0 = p1 = None
    if body[0][0] < 1e-6: p0 = Vector((0, 0, body[0][1])); body = body[1:]
    if body[-1][0] < 1e-6: p1 = Vector((0, 0, body[-1][1])); body = body[:-1]
    for r, z in body:
        rings.append([Vector((r * math.sin(th0 + 2 * math.pi * k / K), -r * math.cos(th0 + 2 * math.pi * k / K), z)) for k in range(K)])
        cs.append(Vector((0, 0, z)))
    ring_surface(m, rings, cs, colfn, p0, p1, mat=mat)

def tube(m, path, wfn, tfn, Wref, K, colfn, sup=2.0, cap_tip=0.5, cap_root=True, mat=None, smooth_frames=0, log=None):
    """a ribbon: superellipse cross-section (half-width w along W, half-thickness t along N = T x W) swept along
    path; a rounded drop tip (extends cap_tip * w past the end), a small root cap. colfn(s, ring) with s = the path
    fraction; mat(s) gives the material per ring (glow tips)."""
    n = len(path)
    Ts = [(path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized() for i in range(n)]
    rings, cs, ss = [], [], []
    # the width direction per ring, then (optionally) smoothed along the path so any twist spreads over a long span
    Ws = []
    for p, T in zip(path, Ts):
        Wr = Wref(p, T); Ws.append((Wr - T * Wr.dot(T)).normalized())
    for _ in range(smooth_frames):
        Ws = [(Ws[max(0, i - 1)] + Ws[i] * 2 + Ws[min(n - 1, i + 1)]) for i in range(n)]
        Ws = [(w - T * w.dot(T)).normalized() for w, T in zip(Ws, Ts)]
    WMAP = {i: w for i, w in enumerate(Ws)}
    def section(p, T, w, t, W=None):
        if W is None: Wr = Wref(p, T); W = (Wr - T * Wr.dot(T)).normalized()
        W = (W - T * W.dot(T)).normalized(); Nn = T.cross(W)
        out = []
        for k in range(K):
            a = 2 * math.pi * k / K
            ca, sa = math.cos(a), math.sin(a)
            out.append(p + W * (w * math.copysign(abs(ca) ** (2 / sup), ca)) + Nn * (t * math.copysign(abs(sa) ** (2 / sup), sa)))
        return out
    for i, (p, T) in enumerate(zip(path, Ts)):
        s = i / (n - 1); rings.append(section(p, T, wfn(s), tfn(s), WMAP[i])); cs.append(p); ss.append(s)
    # rounded tip: shrink the section as a quarter-ellipse past the end
    pe, Te, we, te = path[-1], Ts[-1], wfn(1.0), tfn(1.0)
    for a in (0.5, 0.85):
        ang = a * math.pi / 2
        p = pe + Te * (cap_tip * we * math.sin(ang))
        rings.append(section(p, Te, we * math.cos(ang), te * math.cos(ang) ** 0.6, Ws[-1])); cs.append(p); ss.append(1.0 + a * 0.1)
    tip = pe + Te * (cap_tip * we)
    root = path[0] - Ts[0] * (tfn(0.0) * 0.8) if cap_root else None
    mf = (lambda j, k: 0) if mat is None else (lambda j, k: mat(ss[max(0, min(j, len(ss) - 1))]))
    if log is not None: log.append([q for r_ in rings for q in r_])
    ring_surface(m, rings, cs, lambda j, k: colfn(ss[max(0, min(j, len(ss) - 1))], j), root, tip, mat=mf)

# ------------------------------------------------------------------ star-shaped slab (petals, arms, blossom)
def outline_pts(ctrl, n):
    """a closed smooth outline through ctrl [(u, v)] resampled to n points"""
    dense = catmull([Vector((u, v, 0)) for u, v in ctrl], 12 * len(ctrl), closed=True)
    return [(p.x, p.y) for p in resample(dense, n, closed=True)]

def slab(m, B, D, N, ol, C2, T, col_top, col_bot, mat=0, curl=0.0, cup=0.0, FT=(0.62, 1.0), bot_k=0.85, colfn=None):
    """a thick lens-section slab: outline ol [(u, v)] (u across, v along D from B), star-shaped about C2; the top
    face looks along N. curl bends it along v (toward -N... + = toward N), cup bends the sides."""
    D = D.normalized(); N = (N - D * N.dot(D)).normalized(); U = D.cross(N)
    cu, cv = C2
    Lv = max(v for u, v in ol) - min(v for u, v in ol); Lu = max(abs(u) for u, v in ol) or 1
    def h_top(f): return T * 0.5 * math.sqrt(max(0.0, 1 - f * f))
    def h_bot(f): return -T * 0.5 * math.sqrt(max(0.0, 1 - f * f)) * bot_k
    def place(u, v, w):
        s = v / Lv; w = w + Lv * curl * s * s + cup * (u / Lu) ** 2
        return B + U * u + D * v + N * w
    def pt(k, f): u, v = ol[k]; return (cu + f * (u - cu), cv + f * (v - cv))
    K = len(ol)
    rim = [m.vert(place(*pt(k, 1.0), 0.0)) for k in range(K)]
    def surface(F, hfn, sign, cf):
        ids = [[m.vert(place(*pt(k, f), hfn(f))) for k in range(K)] for f in F[:-1]] + [rim]
        ci = m.vert(place(cu, cv, hfn(0.0)))
        hint = N * sign
        for k in range(K):
            m.face([ci, ids[0][k], ids[0][(k + 1) % K]], cf(0, k), hint, mat)
        for j in range(len(ids) - 1):
            for k in range(K):
                m.face([ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]], cf(j + 1, k), hint, mat)
    surface(list(FT), h_top, 1, colfn or (lambda j, k: col_top))
    surface([1.0], h_bot, -1, lambda j, k: col_bot)
    return place

# ------------------------------------------------------------------ dimensions (m; front -Y; origin = rim centre)
# The bell's outer profile, measured on the sheet's front view (222 px/m: the bell 189 px = 0.85 m; the rim at y 228)
BELL_PROF = [(0.103, 0.552), (0.144, 0.536), (0.187, 0.516), (0.226, 0.496), (0.262, 0.474), (0.302, 0.443),
             (0.338, 0.405), (0.374, 0.352), (0.401, 0.297), (0.418, 0.243), (0.425, 0.192), (0.423, 0.150),
             (0.413, 0.112), (0.397, 0.076), (0.373, 0.043), (0.344, 0.019), (0.316, 0.006), (0.298, 0.0)]
BELL_T = 0.018            # shell thickness
LOBES = 9                 # wind-chime lobes (a crease dead in front, lobe centres at +-20 deg: the eyes sit on them)
LOBE_D = 0.012            # lobe depth (fraction of the radius)
BAND_W = 0.036            # the light crease bands, m
N_OUT, N_IN = 10, 3       # outer / inner profile samples

def bell_profile():
    dense = catmull([Vector((r, 0, z)) for r, z in BELL_PROF], 240)
    return [(p.x, p.z) for p in dense]

def bell_z_at(r, dense):
    """the outer surface height at radius r (on the top dome: r decreasing toward the top)"""
    best = None
    for (r0, z0), (r1, z1) in zip(dense, dense[1:]):
        if z0 < 0.3: break
        if (r0 - r) * (r1 - r) <= 0 and abs(r1 - r0) > 1e-9:
            return z0 + (z1 - z0) * (r - r0) / (r1 - r0)
    return dense[0][1]

def lobe_r(u):
    """radius factor across a lobe, u in [0, 1) from crease to crease"""
    return 1.0 - LOBE_D * (1.0 - math.sin(math.pi * clamp(u)) ** 0.7)

def build_bell(m, V):
    dense = bell_profile()
    poly = [Vector((r, 0, z)) for r, z in dense]
    outer = resample(poly, N_OUT)                       # top -> rim
    # resample denser near the rim curl: blend uniform arc length with a few extra low samples
    outer = [Vector((p.x, 0, p.z)) for p in outer]
    def nrm2(i, pts):
        a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
        t = (b - a).normalized()                        # top -> bottom along the outside
        n = Vector((-t.z, 0, t.x))                      # rotate: outward for this direction
        if n.x < 0 and i > 2: n = -n
        return n
    dense_v = [Vector((r, 0, z)) for r, z in dense]
    nrm_d = [nrm2(i, dense_v) for i in range(len(dense_v))]
    # make sure the normals point away from the bell's inside (from the axis point at mid height)
    for i, n in enumerate(nrm_d):
        if (dense_v[i] - Vector((0, 0, 0.25))).dot(n) < 0: nrm_d[i] = -n
    inner_d = [p - n * BELL_T for p, n in zip(dense_v, nrm_d)]
    inner = resample(inner_d, N_IN)                    # top -> rim
    po, pi_ = outer[-1], inner[-1]
    # bottom lip: a half circle from the outer rim to the inner rim, bulging along the outer surface's direction
    M = (po + pi_) / 2; rho = (po - pi_).length / 2; e1 = (po - M).normalized()
    tdir = (outer[-1] - outer[-2]).normalized(); e2 = (tdir - e1 * tdir.dot(e1)).normalized()
    lipb = [M + (e1 * math.cos(a) + e2 * math.sin(a)) * rho for a in (math.pi / 2,)]
    to, ti = outer[0], inner[0]
    M2 = (to + ti) / 2; rho2 = (to - ti).length / 2; f1 = (to - M2).normalized()
    tdir2 = (outer[0] - outer[1]).normalized(); f2 = (tdir2 - f1 * tdir2.dot(f1)).normalized()
    lipt = [M2 + (f1 * math.cos(math.pi / 2) + f2 * math.sin(math.pi / 2)) * rho2]
    # profile loop: outer (top->rim), bottom lip, inner (rim->top), top lip
    prof = [('o', p) for p in outer] + [('lb', p) for p in lipb] + [('i', p) for p in reversed(inner)] + [('lt', p) for p in lipt]
    bell = hexc(V['bell']); band = mixc(bell, '#fff6ea', 0.34); inside = mixc(bell, V['core'], 0.22)
    top_c = mixc(bell, '#fff6ea', 0.10); low_c = mixc(bell, V['frill'], 0.16)
    rings, cents, kinds = [], [], []
    for kind, p in prof:
        r, z = p.x, p.z
        lobe_w = 2 * math.pi * max(r, 0.05) / LOBES
        hw = clamp(BAND_W / 2 / lobe_w, 0.05, 0.24)
        us = []
        for L in range(LOBES):
            for u in (hw, 0.36, 0.64, 1 - hw): us.append(L + u)
        ring = []
        for uu in us:
            th = 2 * math.pi * uu / LOBES
            rr = r * lobe_r(uu - math.floor(uu))
            ring.append(Vector((rr * math.sin(th), -rr * math.cos(th), z)))
        rings.append(ring); cents.append(Vector((0, 0, z))); kinds.append(kind)
    R = len(rings)
    def colf(j, k):
        kind = kinds[j]; kind2 = kinds[(j + 1) % R]
        if kind == 'i' and kind2 in ('i', 'lt'): return inside
        if kind in ('lb', 'lt') or kind2 in ('lb',): return mixc(bell, inside, 0.5) if kind != 'o' else low_c
        if kind == 'i': return inside
        zmid = (rings[j][0].z + rings[(j + 1) % R][0].z) / 2
        base = mixc(low_c, bell, smooth(0.02, 0.16, zmid))
        base = mixc(base, top_c, smooth(0.36, 0.52, zmid))
        if k % 4 == 3: return mixc(base, band, 0.85)      # the face spanning the crease (1-hw -> next lobe's hw)
        return base
    # face orientation: each quad's outward hint. For the shell: outer faces point away from the axis/up; inner
    # faces point toward the inside. Use the profile normal per band.
    ids = [[m.vert(p) for p in ring] for ring in rings]
    K = len(rings[0])
    for j in range(R):
        j1 = (j + 1) % R
        a = (rings[j][0] + rings[j1][0]) / 2
        # outward normal of this profile segment (2D in the x-z plane at k = 0), then rotated per k
        t = rings[j1][0] - rings[j][0]
        n0 = Vector((-t.z, 0, t.x))          # for the loop direction outer(top->rim)->lip->inner(rim->top)
        for k in range(K):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j1][(k + 1) % K], ids[j1][k]]
            fc = sum((m.v[i] for i in q), Vector()) / 4
            th = math.atan2(fc.x, -fc.y)
            hint = Vector((n0.x * math.sin(th), -n0.x * math.cos(th), n0.z))
            m.face(q, colf(j, k), hint, 0)
    m.finish_normals()
    # the outer surface as a BVH (with smooth normals) for the face decals
    n_outer_bands = N_OUT - 1
    tri_v, tri_f = [], []
    vmap = {}
    for j in range(n_outer_bands):
        for k in range(K):
            q = [ids[j][k], ids[j][(k + 1) % K], ids[j + 1][(k + 1) % K], ids[j + 1][k]]
            for i in q:
                if i not in vmap: vmap[i] = len(tri_v); tri_v.append(m.v[i].copy())
            tri_f.append([vmap[q[0]], vmap[q[1]], vmap[q[2]]]); tri_f.append([vmap[q[0]], vmap[q[2]], vmap[q[3]]])
    inv = {b: a for a, b in vmap.items()}
    bvh = BVHTree.FromPolygons(tri_v, tri_f)
    return Surf(bvh, tri_v, tri_f, [m.n[inv[i]] for i in range(len(tri_v))])

class Surf:
    """ray casts onto the bell's outer surface with interpolated smooth normals"""
    def __init__(self, bvh, v, f, n): self.bvh, self.v, self.f, self.n = bvh, v, f, n
    def cast(self, o, d):
        hit = self.bvh.ray_cast(o, d, 3.0)
        if hit[0] is None: return None, None
        p, _, fi, _ = hit; a, b, c = (self.v[i] for i in self.f[fi]); na, nb, nc = (self.n[i] for i in self.f[fi])
        # barycentric
        v0, v1, v2 = b - a, c - a, p - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-14: return p, na
        wv = (d11 * d20 - d01 * d21) / den; ww = (d00 * d21 - d01 * d20) / den; wu = 1 - wv - ww
        return p, (na * wu + nb * wv + nc * ww).normalized()
    def front(self, x, z):
        return self.cast(Vector((x, -1.5, z)), Y)

class Decal:
    def __init__(self, S, x, z, extra=0.0):
        self.S = S; self.C, self.N = S.front(x, z)
        self.T = (X - self.N * X.dot(self.N)).normalized(); self.B = self.N.cross(self.T)
    def at(self, u, v, h):
        P0 = self.C + self.T * u + self.B * v
        p, n = self.S.cast(P0 + self.N * 0.2, -self.N)
        if p is None: p, n = P0, self.N
        return p + n * h, n

def star_decal(m, D, inside, c2, S, rings, h, col, mat=0, flip=False):
    """a flat colour patch: the region inside(u, v) (star-shaped about c2), its boundary found by bisection along S
    rays; rings = fractions of the boundary radius"""
    def bnd(th):
        du, dv = math.cos(th), math.sin(th); lo, hi = 0.0, 0.3
        for _ in range(40):
            mid = (lo + hi) / 2
            if inside(c2[0] + du * mid, c2[1] + dv * mid): lo = mid
            else: hi = mid
        return du * lo, dv * lo
    B = [bnd(2 * math.pi * k / S) for k in range(S)]
    sg = -1 if flip else 1
    def mk(u, v):
        p, n = D.at(u, v, h); return m.vert(p, n * sg), n * sg
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

def band_decal(m, D, pts, hw, h, col, flip=False):
    """a stroke of half-width hw (a number or hw(i)) along pts [(u, v)] (a line: the mouth, the lids)"""
    A, Bs, N0 = [], [], []
    n = len(pts)
    hwf = hw if callable(hw) else (lambda i: hw)
    for i in range(n):
        hw = hwf(i)
        a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]
        du, dv = b[0] - a[0], b[1] - a[1]; ln = math.hypot(du, dv); nu, nv = -dv / ln, du / ln
        u, v = pts[i]
        sg = -1 if flip else 1
        p, nn = D.at(u + nu * hw, v + nv * hw, h); A.append(m.vert(p, nn * sg)); N0.append(nn * sg)
        p, nn = D.at(u - nu * hw, v - nv * hw, h); Bs.append(m.vert(p, nn * sg))
    for i in range(n - 1):
        m.face([A[i], A[i + 1], Bs[i + 1], Bs[i]], col, N0[i])

# ------------------------------------------------------------------ body: cap, loop, stem, rim band, face, blossom
def build_body(m, V, S):
    cap = hexc(V['cap']); cap_lo = mixc(cap, '#251a24', 0.25); cap_hi = mixc(cap, '#fff6ea', 0.06)
    dense = bell_profile()
    zb = lambda r: bell_z_at(r, dense)
    # the lid: a flared lacquer disc hugging the bell's dome, a soft dome on it and a knob
    z0 = zb(0.14)
    prof = [(0.0, zb(0.02) - 0.03), (0.128, zb(0.128) - 0.006), (0.140, z0 + 0.004), (0.145, z0 + 0.019),
            (0.137, z0 + 0.031), (0.108, z0 + 0.041), (0.070, z0 + 0.053), (0.044, z0 + 0.058), (0.046, z0 + 0.071),
            (0.035, z0 + 0.083), (0.0, z0 + 0.086)]
    lathe(m, prof, 16, lambda j, k: cap_lo if j <= 0 else (cap_hi if 3 <= j <= 5 else cap), th0=math.pi / 16)
    # the carry loop: a chunky oval ring standing in the x-z plane (the hole seen from the front)
    K, R_ = 12, 6; ax, az, tr = 0.031, 0.040, 0.0130; zc = z0 + 0.120
    rings, cs = [], []
    for i in range(K):
        a = 2 * math.pi * i / K
        c = Vector((ax * math.cos(a), 0, zc + az * math.sin(a)))
        t = Vector((-ax * math.sin(a), 0, az * math.cos(a))).normalized(); nrm = Vector((t.z, 0, -t.x))
        if nrm.dot(c - Vector((0, 0, zc))) < 0: nrm = -nrm
        rings.append([c + (nrm * math.cos(2 * math.pi * k / R_) + Y * math.sin(2 * math.pi * k / R_)) * tr for k in range(R_)])
        cs.append(c)
    ring_surface(m, rings, cs, lambda j, k: cap, closed=True)
    # the membrane closing the bell's mouth: an opaque, gently up-domed disc just inside the rim band, so through
    # the glass the inside reads clean (just the core on its stem); the arms and tentacles hang from under it
    mem = mixc(V['bell'], V['core'], 0.5); mem_lo = mixc(mem, V['frill'], 0.25)
    lathe(m, [(0.0, -0.014), (0.17, -0.013), (0.262, -0.008), (0.284, 0.004), (0.250, 0.024), (0.150, 0.040), (0.0, 0.046)],
          16, lambda j, k: mem_lo if j <= 1 else mem, th0=math.pi / 16)
    # the rim band: a lacquer torus round the bell's mouth (taller than deep)
    K, R_ = 24, 6; Rc, zr, hr, hz = 0.297, -0.012, 0.024, 0.026
    rings, cs = [], []
    for i in range(K):
        th = 2 * math.pi * i / K + math.pi / K; rd = radial(th)
        c = rd * Rc + Z * zr
        rings.append([c + rd * (hr * math.cos(2 * math.pi * k / R_)) + Z * (hz * math.sin(2 * math.pi * k / R_)) for k in range(R_)])
        cs.append(c)
    ring_surface(m, rings, cs, lambda j, k: cap_lo if k in (4, 5) else cap, closed=True)
    build_face(m, V, S)
    if V['blossom']: build_blossom(m, V, zb)

EYE_X, EYE_Z = 0.178, 0.198
EYE_A, EYE_B = 0.074, 0.072
def build_eye(m, V, S, side):
    D = Decal(S, side * EYE_X, EYE_Z)
    s = side
    lid = lambda u: 0.030 - 0.10 * (s * u)                            # the lid line (outer corner lower: sleepy)
    eye = lambda u, v: (u / EYE_A) ** 2 + (v / EYE_B) ** 2 < 1 and v < lid(u)
    c2 = (0.0, -0.022)
    star_decal(m, D, eye, c2, S=18, rings=[1.0], h=0.0030, col=hexc(V['iris_low']))
    # the back cover: a bell-coloured sheet just under the eye, facing into the bell, so from behind (through the
    # glass) the face's ink hull is hidden and you see glass colour, not dark eye shapes
    cover = mixc(V['bell'], V['core'], 0.22)
    shrink = lambda u, v: eye(c2[0] + (u - c2[0]) / 0.96, c2[1] + (v - c2[1]) / 0.96)
    star_decal(m, D, shrink, c2, S=12, rings=[1.0], h=0.0016, col=cover, flip=True)
    dark = lambda u, v: eye(u, v) and (u / 0.083) ** 2 + ((v - 0.028) / 0.090) ** 2 < 1
    star_decal(m, D, dark, (0.0, -0.012), S=18, rings=[1.0], h=0.0036, col=hexc(V['iris']))
    cb = (0.026, 0.000); cs_ = (-0.028, -0.040)
    star_decal(m, D, lambda u, v: (u - cb[0]) ** 2 + (v - cb[1]) ** 2 < 0.0180 ** 2, cb, S=12, rings=[1.0], h=0.0042, col=hexc(COMMON['catch']))
    star_decal(m, D, lambda u, v: (u - cs_[0]) ** 2 + (v - cs_[1]) ** 2 < 0.0075 ** 2, cs_, S=8, rings=[1.0], h=0.0042, col=hexc(COMMON['catch']))
    # the heavy upper lid: a tapered stroke along the lid line, a little past the eye at both ends
    ui, uo = -s * 0.077, s * 0.082
    p1 = (ui, lid(ui) + 0.007); p2 = (uo, lid(uo) + 0.004); r1, r2 = 0.0115, 0.0135
    def lidshape(u, v):
        du, dv = p2[0] - p1[0], p2[1] - p1[1]; L2 = du * du + dv * dv
        t = clamp(((u - p1[0]) * du + (v - p1[1]) * dv) / L2)
        cx, cy = p1[0] + du * t, p1[1] + dv * t; r = r1 + (r2 - r1) * t
        return (u - cx) ** 2 + (v - cy) ** 2 < r * r
    # a stroke with round ends (a fan from the middle gives pointed ends)
    n = 8; pts = [(p1[0] + (p2[0] - p1[0]) * i / (n - 1), p1[1] + (p2[1] - p1[1]) * i / (n - 1)) for i in range(n)]
    band_decal(m, D, pts, lambda i: r1 + (r2 - r1) * i / (n - 1), 0.0048, hexc(V['cap']))
    band_decal(m, D, pts, lambda i: 0.92 * (r1 + (r2 - r1) * i / (n - 1)), 0.0016, cover, flip=True)
    for e, r in ((p1, r1), (p2, r2)):
        star_decal(m, D, lambda u, v, e=e, r=r: (u - e[0]) ** 2 + (v - e[1]) ** 2 < r * r, e, S=10, rings=[1.0], h=0.0047, col=hexc(V['cap']))
        star_decal(m, D, lambda u, v, e=e, r=r: (u - e[0]) ** 2 + (v - e[1]) ** 2 < (0.85 * r) ** 2, e, S=6, rings=[1.0], h=0.0016, col=cover, flip=True)

def build_face(m, V, S):
    for side in (-1, 1): build_eye(m, V, S, side)
    # the little "w" mouth: two bowls meeting in a cusp
    D = Decal(S, 0.0, 0.180)
    hw = 0.0078
    for sgn in (-1, 1):
        pts = []
        for i in range(9):
            u = sgn * (0.0035 + 0.0465 * i / 8)
            v = -0.018 + 54.0 * (abs(u) - 0.0265) ** 2
            pts.append((u, v))
        band_decal(m, D, pts, hw, 0.0036, hexc(V['cap']))
        band_decal(m, D, pts, hw * 0.85, 0.0016, mixc(V['bell'], V['core'], 0.22), flip=True)
        e = pts[-1]
        star_decal(m, D, lambda u, v, e=e: (u - e[0]) ** 2 + (v - e[1]) ** 2 < hw ** 2, e, S=8, rings=[1.0], h=0.0034, col=hexc(V['cap']))
    star_decal(m, D, lambda u, v: u * u + (v - 0.0112) ** 2 < (hw * 1.05) ** 2, (0.0, 0.0112), S=8, rings=[1.0], h=0.0034, col=hexc(V['cap']))
    for side in (-1, 1):
        D = Decal(S, side * 0.272, 0.122)
        star_decal(m, D, lambda u, v: (u / 0.054) ** 2 + (v / 0.031) ** 2 < 1, (0, 0), S=14, rings=[1.0], h=0.0030, col=hexc(COMMON['blush']))
        star_decal(m, D, lambda u, v: (u / 0.051) ** 2 + (v / 0.029) ** 2 < 1, (0, 0), S=10, rings=[1.0], h=0.0016, col=mixc(V['bell'], V['core'], 0.22), flip=True)

def build_blossom(m, V, zb):
    """a chunky little five-petal sakura blossom on the lid, beside the loop"""
    c = Vector((0.068, -0.052, zb(0.14) + 0.050))
    nrm = Vector((0.45, -0.55, 1.0)).normalized()
    t1 = (X - nrm * X.dot(nrm)).normalized(); t2 = nrm.cross(t1)
    petal = hexc(COMMON['petal']); under = mixc(petal, COMMON['petal_c'], 0.25)
    ol = outline_pts([(0.0, 0.005), (0.017, 0.011), (0.027, 0.029), (0.023, 0.047), (0.010, 0.053), (0.0, 0.044),
                      (-0.010, 0.053), (-0.023, 0.047), (-0.027, 0.029), (-0.017, 0.011)], 12)
    ol = [(u * 1.15, v * 1.15) for u, v in ol]
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        D = t1 * math.cos(a) + t2 * math.sin(a)
        slab(m, c + nrm * 0.004, D, nrm, ol, (0.0, 0.030), 0.022, petal, under, cup=0.005, FT=(1.0,))
    ellipsoid(m, c + nrm * 0.014, t1 * 0.017, t2 * 0.017, nrm * 0.011, 6, 2, lambda j, k: hexc(COMMON['petal_c']))

# ------------------------------------------------------------------ core
def build_core(m, V):
    prof = [(0.0, 0.070), (0.046, 0.078), (0.076, 0.098), (0.093, 0.126), (0.097, 0.154), (0.091, 0.188),
            (0.076, 0.226), (0.058, 0.265), (0.041, 0.303), (0.029, 0.334), (0.0225, 0.352), (0.0, 0.364)]
    core = hexc(V['core']); hot = mixc(core, '#fffbe6', 0.35)
    lathe(m, prof, 12, lambda j, k: hot if j <= 2 else core, mat=1)
    # the stem (from inside the lid to the bulb's neck), on `toon`: a lighter lacquer so it reads through the glass
    zb = lambda r: bell_z_at(r, bell_profile())
    stem = mixc(V['cap'], V['bell'], 0.42)
    lathe(m, [(0.0185, 0.348), (0.0185, 0.44), (0.0185, zb(0.0) - 0.02)], 8, lambda j, k: stem, pole_bot=False, pole_top=False, mat=0)

# ------------------------------------------------------------------ frill
def build_frill(m, V):
    """a ruffled skirt: a lower ring of 10 broad hanging petals and an upper ring of 10 between them, flaring a bit
    more, all overlapping (no gaps); rounded tips with soft scallops, thick round-edged lenses (no hooks)"""
    fr = hexc(V['frill']); lite = mixc(fr, '#fff0dc', 0.18); deep = mixc(fr, '#c04a30', 0.06); under = mixc(fr, '#a03828', 0.14)
    ol_base = [(0.10, 0.0), (0.30, 0.13), (0.43, 0.36), (0.47, 0.62), (0.41, 0.84), (0.25, 0.97), (0.0, 1.0),
               (-0.25, 0.97), (-0.41, 0.84), (-0.47, 0.62), (-0.43, 0.36), (-0.30, 0.13), (-0.10, 0.0)]
    ol_ruff = [(0.10, 0.0), (0.30, 0.13), (0.43, 0.36), (0.47, 0.62), (0.42, 0.83), (0.30, 0.95), (0.20, 0.90),
               (0.10, 1.00), (0.0, 0.95), (-0.10, 1.00), (-0.20, 0.90), (-0.30, 0.95), (-0.42, 0.83), (-0.47, 0.62),
               (-0.43, 0.36), (-0.30, 0.13), (-0.10, 0.0)]
    NP = 9
    for layer in (0, 1):
        for i in range(NP):
            th = 2 * math.pi * (i + 0.5 * layer) / NP
            if layer == 0: L, wk, drop, rb, zb_, col = (0.215 if i == 0 else 0.200), 1.42, 0.94, 0.300, -0.040, deep
            else: L, wk, drop, rb, zb_, col = 0.165, 1.40, 0.87, 0.314, -0.024, (fr if i % 2 else lite)
            ol = outline_pts([(u * L * wk, v * L) for u, v in (ol_ruff if layer == 0 else ol_base)], 18)
            rd = radial(th)
            D = (rd * math.sqrt(1 - drop * drop) - Z * drop).normalized()
            N = (rd * drop + Z * math.sqrt(1 - drop * drop)).normalized()
            B = rd * rb + Z * zb_
            slab(m, B, D, N, ol, (0.0, 0.50 * L), 0.046, col, under, curl=0.0, cup=0.016, bot_k=1.0, FT=(1.0,))

# ------------------------------------------------------------------ oral arms
# the arms hang inside the ribbons' cone, between them (clear of the ribbons, so no ink hull pokes through)
ARM_TH = (math.radians(30), math.radians(-30), math.radians(146), math.radians(-146))
def build_arms(m, V):
    arm = hexc(V['arm']); lite = mixc(arm, '#fff6ea', 0.25); deep = mixc(arm, V['frill'], 0.22)
    # a ruffled cluster: deep round scallops down both sides and three round lobes at the bottom
    ol = outline_pts([(0.024, 0.0), (0.040, 0.034), (0.066, 0.064), (0.056, 0.094), (0.074, 0.126), (0.060, 0.158),
                      (0.076, 0.192), (0.060, 0.224), (0.062, 0.252), (0.040, 0.276), (0.020, 0.268), (0.0, 0.290),
                      (-0.020, 0.268), (-0.040, 0.276), (-0.062, 0.252), (-0.060, 0.224), (-0.076, 0.192),
                      (-0.060, 0.158), (-0.074, 0.126), (-0.056, 0.094), (-0.066, 0.064), (-0.040, 0.034),
                      (-0.024, 0.0), (0.0, -0.012)], 20)
    ol2 = [(u * 0.62, v) for u, v in outline_pts([(0.024, 0.0), (0.050, 0.060), (0.040, 0.100), (0.062, 0.150),
                      (0.046, 0.196), (0.056, 0.240), (0.030, 0.272), (0.0, 0.262), (-0.030, 0.272), (-0.056, 0.240),
                      (-0.046, 0.196), (-0.062, 0.150), (-0.040, 0.100), (-0.050, 0.060), (-0.024, 0.0),
                      (0.0, -0.012)], 12)]
    for i, th in enumerate(ARM_TH):
        rd = radial(th); tg = tangential(th)
        back = abs(th) > math.pi / 2
        B = rd * (0.095 if back else 0.115) + Z * (-0.016)
        Bot = rd * (0.150 if back else 0.185) + Z * (-0.350 if back else -0.360)
        D = (Bot - B).normalized()
        N = (rd + Z * 0.25).normalized()
        slab(m, B, D, N, ol, (0.0, 0.15), 0.080, arm, deep, curl=-0.05, cup=-0.014,
             colfn=lambda j, k: lite if j == 0 else arm)
        # the crossing ruffle (its faces to the sides), so the cluster is lumpy from every side
        N2 = (tg - D * tg.dot(D)).normalized()
        slab(m, B + D * 0.02, D, N2, ol2, (0.0, 0.14), 0.060, deep, deep, curl=0.0, cup=0.0, FT=(1.0,))

# ------------------------------------------------------------------ tentacles
# (azimuth, path (r, z) control points, length scale): every ribbon flows out, waves, and its last third swings out
# sideways and a little up (nothing ends pointing at the ground). Lengths staggered: front pair shortest, back pair
# longer, the back-centre ribbon longer still, the tanzaku longest.
def arc(r0, z0, L, phis, n=24):
    """a smooth flowing curve in the radial plane: its direction (from straight down toward outward, deg) eases
    phi0 -> phi_mid (steeper in the middle) -> phi_end (the last third swings out and a little up); returns (r, z)"""
    p0, pm, pe = (math.radians(a) for a in phis)
    r, z, out = r0, z0, [(r0, z0)]
    for i in range(n):
        t = (i + 0.5) / n
        ph = p0 + (pm - p0) * smooth(0.0, 0.45, t) + (pe - pm) * smooth(0.50, 1.0, t)
        r += math.sin(ph) * L / n; z -= math.cos(ph) * L / n; out.append((r, z))
    return out[::4] + ([out[-1]] if n % 4 else [])
FRONT_T = arc(0.150, -0.010, 0.64, (58, 34, 88))
BACK_T = arc(0.150, -0.010, 0.74, (44, 24, 96))
REAR_T = arc(0.165, -0.010, 0.78, (30, 12, 72))
SHORT = [(math.radians(66), FRONT_T, 1.00, 0.0), (math.radians(-66), FRONT_T, 0.96, 0.6),
         (math.radians(128), BACK_T, 1.03, 0.3), (math.radians(-128), BACK_T, 0.98, 0.9),
         (math.radians(180), REAR_T, 1.00, 1.4)]
CAM = Vector((0, -1, 0.8)).normalized()      # toward the 45-deg front camera

def face_cam(rd, k=0.62):
    """a width direction that turns the ribbon's broad face toward the camera (k) and outward (1 - k)"""
    Nd = (CAM * k + rd * (1 - k)).normalized()
    def f(p, T):
        n = (Nd - T * Nd.dot(T)).normalized()
        return T.cross(n)
    return f

def taper(w0, wmid, wtip, s_mid=0.74, s_bulb=0.93):
    """broad root -> narrow (wmid) -> a round bulb at the tip (wtip)"""
    def f(s):
        if s <= s_mid: return w0 + (wmid - w0) * smooth(0.12, s_mid, s)
        return wmid + (wtip - wmid) * math.sin(0.5 * math.pi * clamp((s - s_mid) / (s_bulb - s_mid)))
    return f

def prof(keys):
    """a smooth piecewise profile through [(s, value)]"""
    def f(s):
        for (s0, v0), (s1, v1) in zip(keys, keys[1:]):
            if s <= s1: return v0 + (v1 - v0) * smooth(s0, s1, s)
        return keys[-1][1]
    return f

def wave_dir(rd, k=0.62):
    """the side-to-side direction as the camera sees the ribbon (in its broad face, horizontal)"""
    Nd = (CAM * k + rd * (1 - k)); h = Vector((Nd.x, Nd.y, 0)).normalized()
    return Z.cross(h)

def build_tentacles(m, V):
    tent = hexc(V['tent']); root = mixc(tent, V['arm'], 0.14); core = hexc(V['core']); pre = mixc(tent, core, 0.55)
    def colf(GL):
        def f(s, j):
            if s >= GL: return core
            if s >= GL - 0.07: return pre
            return mixc(root, tent, smooth(0.0, 0.45, s))
        return f
    # broad at the root, narrowing, a slight neck, then a small round glowing ball (not a pad)
    # (>= 4.7 cm thick everywhere, the neck included: no flat paddle the 2 cm ink hull could poke through)
    W_S = prof([(0.0, 0.058), (0.18, 0.072), (0.62, 0.045), (0.84, 0.036), (0.95, 0.040), (1.0, 0.040)])
    T_S = prof([(0.0, 0.025), (0.60, 0.0236), (0.84, 0.0236), (0.95, 0.035), (1.0, 0.035)])
    LOG = []
    for th, ctrl, ks, ph in SHORT:
        rd = radial(th); wd = wave_dir(rd)
        pts = []
        for k, (r, z) in enumerate(ctrl):
            t = k / (len(ctrl) - 1)
            # a visible S along the length (about 7 cm side to side as the camera sees it)
            wob = 0.036 * math.sin(t * math.pi * 2.2 + ph) * smooth(0.0, 0.3, t)
            pts.append(rd * (ctrl[0][0] + (r - ctrl[0][0]) * ks) + wd * wob + Z * (z * ks) + Y * (0.03 * t * t))
        path = catmull(pts, 10)
        GL = 0.82
        # (the back-centre ribbon, never seen face-on from the front, keeps its broad face to the sides: thin in x,
        # clear of the back arms)
        wref = (lambda p, T: Y) if abs(th) > 3.0 else face_cam(rd)
        tube(m, path, W_S, T_S, wref, 8, colf(GL), sup=2.0, cap_tip=0.92,
             mat=lambda s, GL=GL: 1 if s >= GL else 0, smooth_frames=4, log=LOG)
    # the tanzaku: the longest, broad, waving gently, its end swinging forward and up under the face
    # (it hangs in its own plane, broad face to the front, waving; the end flips aside and lifts a little)
    pts = [Vector((0.0, -0.004, -0.010)), Vector((0.012, -0.004, -0.200)), Vector((-0.010, -0.006, -0.390)),
           Vector((0.022, -0.014, -0.555)), Vector((0.085, -0.026, -0.680)), Vector((0.185, -0.036, -0.740))]
    path = catmull(pts, 10)
    GL = 0.86
    tube(m, path, prof([(0.0, 0.088), (0.2, 0.084), (0.70, 0.060), (0.86, 0.045), (0.96, 0.050), (1.0, 0.050)]),
         prof([(0.0, 0.025), (0.86, 0.0245), (0.96, 0.034), (1.0, 0.034)]), face_cam(Vector((0, -1, 0)), 0.85), 8,
         colf(GL), sup=2.5, cap_tip=0.85, mat=lambda s, GL=GL: 1 if s >= GL else 0, smooth_frames=4, log=LOG)
    # clearance between ribbons below the membrane / frill zone (z < -0.12): surface-to-surface, approximated by the
    # nearest ring vertices of different ribbons
    names = ['front+', 'front-', 'back+', 'back-', 'rear', 'tanzaku']
    worst = []
    for i in range(len(LOG)):
        for j in range(i + 1, len(LOG)):
            A = [v for v in LOG[i] if v.z < -0.12]; B = [v for v in LOG[j] if v.z < -0.12]
            if not A or not B: continue
            d = min((a - b).length for a in A[::2] for b in B[::2])
            worst.append((d, names[i], names[j]))
    worst.sort()
    print('KURAGE ribbon clearance at rest (closest pairs, m):', [(round(d, 3), a, b) for d, a, b in worst[:4]])
    # and under the game's sway (JELLY_HOOK, weight by depth below the rim), over a cycle of phases, idle and drifting
    def sway(v, sw, drag):
        gx, gy, gz = v.x, v.z, -v.y; w = clamp(-gy / 0.8)
        dy = max(0.0, -gy); ph = sw * 2.1 - dy * 3.6 + math.atan2(gx, gz) * 2.0
        gx += (math.sin(ph) * 0.07 + math.sin(ph * 0.53 + 1.7) * 0.03) * w
        gz += math.cos(ph * 0.87) * 0.06 * w - drag * w * w * 0.32
        gy += drag * w * w * 0.12
        return Vector((gx, -gz, gy))
    worst2 = []
    subs = [[v for v in L_[::3] if v.z < -0.12] for L_ in LOG]
    for sw in [k * 0.5 for k in range(12)]:
        for drag in (0.0, 1.0):
            moved = [[sway(v, sw, drag) for v in S_] for S_ in subs]
            for i in range(len(moved)):
                for j in range(i + 1, len(moved)):
                    if not moved[i] or not moved[j]: continue
                    d = min((a_ - b_).length for a_ in moved[i] for b_ in moved[j])
                    worst2.append((d, names[i], names[j], sw, drag))
    worst2.sort()
    print('KURAGE ribbon clearance under sway (closest, m):', [(round(d, 3), a, b, sw, dr) for d, a, b, sw, dr in worst2[:4]])
    return LOG, names

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
            # emissiveFactor), so the emission is the core colour as a constant; Base Color still reads `Col`
            bsdf.inputs['Emission Color'].default_value = hexc(V['core'])
            bsdf.inputs['Emission Strength'].default_value = 1.0
        return mt
    return mat('toon', False), mat('glow', True)

def to_object(part, mats):
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
    ob.location = (0, 0, 0)
    return ob

def build_variant(key):
    V = VARIANTS[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials(V)
    P = {n: Part(n) for n in ('body', 'bell', 'core', 'frill', 'arms', 'tentacles')}
    S = build_bell(P['bell'], V)
    build_body(P['body'], V, S)
    build_core(P['core'], V)
    build_frill(P['frill'], V)
    build_arms(P['arms'], V)
    LOG, names = build_tentacles(P['tentacles'], V)
    for zc in (-0.05, -0.15):
        arms_v = [v for v in P['arms'].v if v.z < zc]
        print('KURAGE arm-ribbon clearance below z %.2f (m):' % zc, sorted((round(min((a - b).length for a in arms_v[::2] for b in L_ if b.z < zc), 3), nm) for L_, nm in zip(LOG, names))[:4])
    obs = [to_object(P[n], mats) for n in P]
    tot = sum(p.tris() for p in P.values())
    allv = [v for p in P.values() for v in p.v]
    lo = Vector((min(v.x for v in allv), min(v.y for v in allv), min(v.z for v in allv)))
    hi = Vector((max(v.x for v in allv), max(v.y for v in allv), max(v.z for v in allv)))
    print('KURAGE %s tris %s total %d | W%.3f D%.3f H%.3f | z %.3f..%.3f y %.3f..%.3f' % (
        key, {n: p.tris() for n, p in P.items()}, tot, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.z, hi.z, lo.y, hi.y))
    name = 'kurage' if key == 'base' else 'kurage_' + key
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('KURAGE export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('KURAGE wrote', out)

for key in VARIANTS:
    if ONLY and key != ONLY: continue
    build_variant(key)
