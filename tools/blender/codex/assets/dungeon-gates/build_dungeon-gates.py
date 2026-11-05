# PAWHAVEN dungeon gates (ROADMAP Z-D6): the four zone gates as chunky toy-diorama Blender models.
#   blender --background --factory-startup --python build_dungeon-gates.py -- --gate bamboo|maple|tidepool|onsen|all
# Deterministic (fixed seeds, no wall-clock input): a rebuild from an empty scene reproduces each GLB exactly.
#
# Frame (the brief overrides the contract's "ground at z = 0"): the origin is the gate origin, Blender z = 0 is the rim
# height, gate-local +z (out of the mouth, toward the camera) is Blender -Y, gate-local x is Blender +X. Grounded masses
# carry a buried skirt down to z = -0.6.
#
# The shared kit (so the four read as one set):
#   Boulder      a superellipsoid pebble (rounded-box), low-frequency lumps, taper, flat buried skirt
#   moss cap     icing on a boulder top: an offset shell over the stone with rounded drips and a rolled bead edge
#   strip moss   the same icing over a strip of any swept surface (the arch lip's crown, the kasagi)
#   Lip          the thick rounded stone rim of the mouth, swept along a superellipse arch that frames the seal
#   Throat       the dark inside-out tunnel behind the mouth, graded to near-black; boulders are carved clear of it
#   Beam         rounded-section sweeps with domed caps (torii posts and beams), Rope (twisted shimenawa), shide
#   rbox         rounded slabs (steps, the gaku), flowers
# Vertex colours only (attribute `Col`, corner domain): soft painted gradients, lacquer highlights painted in, a
# ray-cast AO pass darkens crevices, the ground line and the stone under the moss. Material `stone` (+ `glow` parts).
import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
PREVIEW = os.path.join(HERE, 'preview')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None): return argv[argv.index(name) + 1] if name in argv else default
GATE = arg('--gate', 'bamboo')
NO_EXPORT = '--no-export' in argv
print('GATES build pid', os.getpid(), 'gate', GATE)

GROUND = -0.6          # the buried skirt
PI, TAU = math.pi, 2 * math.pi

# ------------------------------------------------------------------ colour + math
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h):
    if isinstance(h, tuple): return h
    h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def mixc(a, b, t):
    a, b = hexc(a), hexc(b); t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3)) + (1.0,)
def mulc(a, k): a = hexc(a); return (a[0] * k, a[1] * k, a[2] * k, 1.0)
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(t): t = clamp(t); return t * t * (3 - 2 * t)
def sstep(a, b, x): return smooth((x - a) / (b - a)) if b != a else (1.0 if x >= a else 0.0)
def spow(x, e): return math.copysign(abs(x) ** e, x)
def L(x, h, z): return Vector((x, -z, h))      # gate-local (x, height, z out of the mouth) -> Blender
UP = Vector((0, 0, 1)); FRONT = Vector((0, -1, 0))

def _h(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h &= 0xffffffff; h = (((h >> 13) ^ h) * 1274126177) & 0xffffffff; h ^= h >> 16
    return (h & 0xffff) / 65535.0
def vnoise(p, f=1.0, seed=0):
    """smooth value noise in [0, 1]"""
    x, y, z = p.x * f, p.y * f, p.z * f
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = smooth(x - ix), smooth(y - iy), smooth(z - iz)
    def l(a, b, t): return a + (b - a) * t
    c = [[[_h(ix + i, iy + j, iz + k, seed) for k in (0, 1)] for j in (0, 1)] for i in (0, 1)]
    return l(l(l(c[0][0][0], c[0][0][1], fz), l(c[0][1][0], c[0][1][1], fz), fy),
             l(l(c[1][0][0], c[1][0][1], fz), l(c[1][1][0], c[1][1][1], fz), fy), fx)
def fbm(p, f=1.0, seed=0): return 0.65 * vnoise(p, f, seed) + 0.35 * vnoise(p, f * 2.3, seed + 7)

# painted light: the game re-shades with its toon ramp, so this is only soft modelling + lacquer streaks
LDIR = Vector((-0.45, -0.55, 0.7)).normalized()
VDIR = Vector((0, -0.7, 0.7)).normalized()
HDIR = (LDIR + VDIR).normalized()

# ------------------------------------------------------------------ mesh accumulator
class Part:
    """vertices + faces of one piece; `kind` drives the checks (stone, moss, lip, throat, step, torii, rope, shide,
    flower); `paint(p, n, meta)` colours it after its normals are known; `ao` scales the ray-cast darkening"""
    def __init__(self, name, kind, paint=None, ao=1.0, mat=0, closed=False, carve=None):
        self.name, self.kind, self.paint, self.ao, self.mat, self.closed, self.carve = name, kind, paint, ao, mat, closed, carve
        self.glowc = '#ffffff'
        self.v, self.meta, self.f = [], [], []
    def add_v(self, p, meta=None):
        self.v.append(Vector(p)); self.meta.append(meta); return len(self.v) - 1
    def add_f(self, idx, hint):
        P = [self.v[i] for i in idx]; n = Vector((0, 0, 0))
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        if hint is not None and n.dot(hint) < 0: idx = list(reversed(idx))
        self.f.append(list(idx))
    def normals(self):
        acc = [Vector((0, 0, 0)) for _ in self.v]
        for f in self.f:
            P = [self.v[i] for i in f]
            nn = (P[1] - P[0]).cross(P[2] - P[0])
            if len(P) == 4: nn += (P[2] - P[0]).cross(P[3] - P[0])
            for i in f: acc[i] += nn
        return [a.normalized() if a.length > 1e-12 else Vector((0, 0, 1)) for a in acc]
    def tris(self): return sum(len(f) - 2 for f in self.f)

def surf(part, F, us, vs, wrap, hint, pole0=None, pole1=None, meta=None):
    """a grid surface F(u, v) (u across, optionally wrapped; v along), optional poles before vs[0] / after vs[-1];
    faces oriented by hint(centre, u, v)"""
    U, Vn = len(us), len(vs)
    ids = [[part.add_v(F(u, v), meta(u, v) if meta else (u, v)) for v in vs] for u in us]
    rng = range(U if wrap else U - 1)
    for i in rng:
        i1 = (i + 1) % U
        for j in range(Vn - 1):
            q = [ids[i][j], ids[i1][j], ids[i1][j + 1], ids[i][j + 1]]
            c = sum((part.v[k] for k in q), Vector()) / 4
            part.add_f(q, hint(c, us[i], vs[j]))
    for pole, j in ((pole0, 0), (pole1, Vn - 1)):
        if pole is None: continue
        k = part.add_v(pole, meta(None, vs[j]) if meta else (None, vs[j]))
        for i in rng:
            i1 = (i + 1) % U; q = [k, ids[i][j], ids[i1][j]]
            c = sum((part.v[m] for m in q), Vector()) / 3
            part.add_f(q, hint(c, us[i], vs[j]))
    return ids

def resample_periodic(pts, n):
    """n params evenly spaced by arc length round a closed dense loop of (param, Vector) pairs"""
    L = [0.0]
    for i in range(1, len(pts) + 1):
        L.append(L[-1] + (pts[i % len(pts)][1] - pts[i - 1][1]).length)
    tot = L[-1]; out = []; j = 0
    for k in range(n):
        s = tot * k / n
        while L[j + 1] < s: j += 1
        t = (s - L[j]) / max(1e-12, L[j + 1] - L[j])
        a0 = pts[j][0]; a1 = pts[(j + 1) % len(pts)][0]
        if j + 1 >= len(pts): a1 += TAU
        out.append(a0 + (a1 - a0) * t)
    return out

def resample_weighted(params, pts, weights, n):
    """n interior params (excluding both ends) evenly spaced by weighted arc length along an open dense polyline"""
    L = [0.0]
    for i in range(1, len(pts)): L.append(L[-1] + (pts[i] - pts[i - 1]).length * weights[i - 1])
    tot = L[-1]; out = []; j = 0
    for k in range(1, n + 1):
        s = tot * k / (n + 1)
        while L[j + 1] < s: j += 1
        t = (s - L[j]) / max(1e-12, L[j + 1] - L[j]); out.append(params[j] + (params[j + 1] - params[j]) * t)
    return out

# ------------------------------------------------------------------ the boulder
class Boulder:
    """a superellipsoid pebble centred at gate-local (x, hc, z): semi-axes ax (x), az (depth), hup (up), hdn (down;
    grounded ones reach below the skirt and are flattened onto it). exy / ez < 1 round the box; lumps are
    low-frequency; taper narrows the top."""
    def __init__(self, name, x, z, hc, ax, az, hup, hdn=None, yaw=0.0, exy=0.8, ez=0.7, lump=0.05, taper=0.1,
                 seed=1, tilt=(0.0, 0.0), res=0.22, moss=None, tone=0.0, ground=True, carve='side', flat=0.0):
        self.name, self.c = name, L(x, hc, z)
        self.ax, self.az, self.hup, self.yaw_ = ax, az, hup, yaw
        self.ground = ground
        self.hdn = hdn if hdn is not None else (hc - GROUND + 0.2)
        self.exy, self.ez, self.taper, self.flat = exy, ez, taper, flat
        self.moss, self.tone, self.res, self.seed, self.carve = moss, tone, res, seed, carve
        rnd = random.Random(seed * 7919 + 13)
        self.lumps = []
        for _ in range(4):
            w = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.6, 0.6)))
            if w.length < 1e-3: w = Vector((1, 0, 0))
            self.lumps.append((w.normalized() * rnd.uniform(1.7, 2.9), rnd.uniform(0, TAU), lump * rnd.uniform(0.55, 1.0)))
        self.R = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(tilt[0], 3, 'X') @ Matrix.Rotation(tilt[1], 3, 'Y')
        self._cross = {}
    def P(self, th, ph):
        q = self._P(th, ph)
        if self.ground and ph < 0 and q.z < 0.05:
            # the buried skirt drops straight down from where the stone meets the ground (no cone under the rim)
            k = round(th, 7)
            if k not in self._cross:
                lo, hi = -PI / 2, 0.0
                for _ in range(40):
                    mid = (lo + hi) / 2
                    if self._P(th, mid).z < 0.05: lo = mid
                    else: hi = mid
                self._cross[k] = self._P(th, hi)
            c = self._cross[k]
            fl = 1.0 + 0.04 * clamp((0.05 - q.z) / 0.65)
            q = Vector((self.c.x + (c.x - self.c.x) * fl, self.c.y + (c.y - self.c.y) * fl, q.z))
        return q
    def _P(self, th, ph):
        cp, sp = math.cos(ph), math.sin(ph)
        xn = spow(cp, self.ez) * spow(math.cos(th), self.exy)
        yn = spow(cp, self.ez) * spow(math.sin(th), self.exy)
        zn = spow(sp, self.ez)
        tp = 1 - self.taper * max(zn, 0) + 0.05 * max(-zn, 0)
        zz = zn * (self.hup if zn >= 0 else self.hdn)
        if zn > 0 and self.flat: zz *= 1 - self.flat * (1 - zn) * zn     # a flatter crown
        d = Vector((xn * self.ax * tp, yn * self.az * tp, zz))
        u = Vector((xn, yn, zn))
        m = 1 + sum(a * math.sin(w.dot(u) + p) for w, p, a in self.lumps)
        q = self.c + self.R @ (d * m)
        if self.ground and q.z < GROUND: q.z = GROUND
        return q
    def N(self, th, ph):
        e = 1e-3
        a = self.P(th + e, ph) - self.P(th - e, ph)
        b = self.P(th, min(ph + e, PI / 2)) - self.P(th, max(ph - e, -PI / 2))
        n = a.cross(b)
        out = self.P(th, ph) - self.c
        if n.length < 1e-9: return out.normalized()
        n.normalize()
        return n if n.dot(out) >= 0 else -n
    def grids(self, res=None):
        res = res or self.res
        eq = [(th, Vector((self.ax * spow(math.cos(th), self.exy), self.az * spow(math.sin(th), self.exy), 0)))
              for th in [TAU * k / 240 for k in range(240)]]
        per = sum((eq[(k + 1) % 240][1] - eq[k][1]).length for k in range(240))
        nu = int(clamp(round(per / res), 10, 30))
        ths = resample_periodic(eq, nu)
        phs = [-PI / 2 + PI * k / 200 for k in range(201)]
        pts = [self.P(0.3, ph) for ph in phs]
        wts = []
        for k in range(200):
            z = (pts[k].z + pts[k + 1].z) / 2
            wts.append(0.04 if z <= GROUND + 0.01 else (0.3 if z < -0.05 else 1.0))
        mlen = sum((pts[k + 1] - pts[k]).length * wts[k] for k in range(200))
        nv = int(clamp(round(mlen / res), 5, 16))
        rows = resample_weighted(phs, pts, wts, nv)
        if self.ground:
            # an explicit skirt ring at the skirt depth (straight walls down from the ground line, a flat bottom)
            rows = [-PI / 2 + 0.02] + [r for r in rows if self.P(0.3, r).z > GROUND + 0.05]
        return ths, rows
    def build(self, paint):
        ths, phs = self.grids()
        self.ths, self.phs = ths, phs
        p = Part(self.name, 'stone', paint=paint, closed=True, carve=self.carve)
        p.boulder = self
        surf(p, self.P, ths, phs, True, lambda c, u, v: c - self.c,
             pole0=(Vector((self.c.x, self.c.y, GROUND)) if self.ground else self.P(0, -PI / 2)), pole1=self.P(0, PI / 2))
        return p

def boulder_moss(b, paint, stone=None):
    """icing on the boulder's crown, as a patch seen from above: its edge sits at a fraction rho(θ) of the crown's
    radius (offset toward the back), and 4-7 rounded drips of varied length pour over the shoulder (more toward the
    camera). The edge is measured in arc length along each meridian, so drips keep their length on any shape. A
    pillowy shell offset along the stone normal, rolled into a bead that tucks into the stone."""
    M = b.moss
    rnd = random.Random(b.seed * 31 + 5)
    t = M.get('t', 0.07)
    cover, nd, drop, fb = M.get('cover', 0.7), M.get('drips', 5), M.get('drop', 1.0), M.get('front', 0.6)
    full = M.get('full', False)                  # moss beds: everything above the ground
    drips = []
    for k in range(nd):
        c = rnd.uniform(0, TAU) if k % 2 else (-PI / 2 - b.yaw_ + rnd.uniform(-1.2, 1.2))     # half of them face the camera
        drips.append((c % TAU, rnd.uniform(0.12, 0.45) * drop, rnd.uniform(0.22, 0.34), 0.0))
    wob = (rnd.uniform(0, TAU), rnd.uniform(0, TAU), rnd.uniform(0.04, 0.08))
    tables = {}
    def table(th):
        k = round(th, 7)
        if k not in tables:
            n = 90; lo = -PI / 2 + 0.02
            phs = [PI / 2 - (PI / 2 - lo) * j / n for j in range(n + 1)]
            pts = [b.P(th, ph) for ph in phs]
            d = [0.0]
            for j in range(1, n + 1): d.append(d[-1] + (pts[j] - pts[j - 1]).length)
            rh = [math.hypot(q.x - b.c.x, q.y - b.c.y) for q in pts]
            jm = max(range(n + 1), key=lambda j: rh[j])
            # the lowest the moss may reach: a little above the ground for grounded stones
            jl = n
            for j in range(n + 1):
                if b.ground and pts[j].z < 0.06: jl = max(1, j - 1); break
            tables[k] = (phs, d, [r / max(1e-6, rh[jm]) for r in rh], jm, jl)
        return tables[k]
    def d_at_rho(tb, rho):
        phs, d, rh, jm, jl = tb
        for j in range(1, jm + 1):
            if rh[j] >= rho:
                f = (rho - rh[j - 1]) / max(1e-9, rh[j] - rh[j - 1]); return d[j - 1] + (d[j] - d[j - 1]) * f
        return d[jm]
    def phi_at(tb, dd):
        phs, d, rh, jm, jl = tb
        dd = clamp(dd, 0.0, d[jl])
        for j in range(1, len(d)):
            if d[j] >= dd:
                f = (dd - d[j - 1]) / max(1e-9, d[j] - d[j - 1]); return phs[j - 1] + (phs[j] - phs[j - 1]) * f
        return phs[-1]
    def edge(th):
        tb = table(th)
        if full: return tb[1][tb[4]]
        dirw = b.R @ Vector((math.cos(th), math.sin(th), 0))
        rho = cover + 0.1 * dirw.y - 0.05 * fb * max(0.0, -dirw.y) + wob[2] * math.sin(2 * th + wob[0]) + 0.04 * math.sin(3 * th + wob[1])
        db = d_at_rho(tb, clamp(rho, 0.2, 0.97))
        dsh = tb[1][tb[3]]
        de = db
        ext = 0.0
        for c, ln, w, reach in drips:
            dd = math.atan2(math.sin(th - c), math.cos(th - c))
            if abs(dd) < w:     # a rounded tongue: its tip round, its root flaring smoothly into the cap edge
                ext = max(ext, ln * (1 - (dd / w) ** 2) ** 0.75)
        return min(de + ext, tb[1][tb[4]])
    bead = {-2: (0.95, -0.02), -1: (0.5, 0.62)}          # row: (arc fraction of t beyond the edge, thickness fraction)
    def off(v): return t * (1 + 0.3 * math.sin(PI / 2 * clamp(v)))
    def F(th, v):
        tb = table(th); de = edge(th)
        if v < 0:
            fr, tk = bead[v]; ph = phi_at(tb, de + fr * t)
            return b.P(th, ph) + b.N(th, ph) * (t * tk)
        ph = phi_at(tb, de * (1 - v))
        return b.P(th, ph) + b.N(th, ph) * off(v)
    vs = M.get('rows', [-2, -1, 0.0, 0.42])
    nu = int(M.get('nu', 12))
    base = resample_periodic([(th, Vector((b.ax * spow(math.cos(th), b.exy), b.az * spow(math.sin(th), b.exy), 0)))
                              for th in [TAU * k / 240 for k in range(240)]], nu)
    # the angular samples go where the drips are: five across each tongue, the plain edge sparse
    near = lambda th: any(abs(math.atan2(math.sin(th - c), math.cos(th - c))) < w * 1.1 for c, ln, w, _ in drips)
    ths = [th % TAU for th in base if not near(th)]
    for c, ln, w, _ in drips: ths += [(c + w * f) % TAU for f in (-1.05, -0.5, 0.0, 0.5, 1.05)]
    ths.sort()
    keep = []
    for th in ths:
        if keep and th - keep[-1] < 0.05: continue
        keep.append(th)
    if len(keep) > 1 and keep[0] + TAU - keep[-1] < 0.05: keep.pop()
    ths = keep
    p = Part(b.name + '_moss', 'moss', paint=paint, ao=0.55, carve=b.carve)
    p.boulder = b
    surf(p, F, ths, vs, True, lambda c, u, v: c - b.c, pole1=b.P(0, PI / 2) + b.N(0, PI / 2) * off(1.0))
    nt = M.get('tufts', 0)
    if nt:
        tp = Part(b.name + '_tufts', 'flower', paint=M['tuft_paint'], ao=0.3)
        rt = random.Random(b.seed * 53 + 7)
        for k in range(nt):
            th = TAU * (k + rt.uniform(0.15, 0.85)) / nt
            tb = table(th); pe = phi_at(tb, edge(th)); q = b.P(th, pe); nrm = b.N(th, pe)
            outw = Vector((q.x - b.c.x, q.y - b.c.y, 0)); outw = outw.normalized() if outw.length > 1e-6 else Vector((1, 0, 0))
            grass_clump(tp, q + nrm * (t * 0.6), nrm, outw, rt)
        p.tufts = tp
    if stone is not None:
        # sink the stone under the cap's interior a little, so the coarser shell never shows stone through it
        def d_of(tb, ph):
            phs, d, rh, jm, jl = tb
            for j in range(1, len(phs)):
                if phs[j] <= ph:
                    f = (phs[j - 1] - ph) / max(1e-9, phs[j - 1] - phs[j]); return d[j - 1] + (d[j] - d[j - 1]) * f
            return d[-1]
        sunk = 0
        for i, mt in enumerate(stone.meta):
            if not mt: continue
            th, ph = mt
            if th is None:
                if ph > 0: stone.v[i] = stone.v[i] - Vector((0, 0, 0.05)); sunk += 1
                continue
            tb = table(th); de = edge(th); dd = d_of(tb, ph)
            k = smooth((de - 0.1 - dd) / 0.18)
            if k > 0: stone.v[i] = stone.v[i] - b.N(th, ph) * (0.05 * k); sunk += 1
    return p

def grass_clump(p, base, n, outw, rnd, nb=None):
    """a chunky clump of 3-4 rounded grass blades leaning out from `base`"""
    nb = nb or rnd.choice((3, 3, 3, 4))
    xa = (Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))).cross(n).normalized(); ya = n.cross(xa)
    for j in range(nb):
        a = rnd.uniform(0, TAU)
        c = base + (xa * math.cos(a) + ya * math.sin(a)) * rnd.uniform(0.0, 0.06)
        d = (n * 0.45 + UP * 0.75 + outw * rnd.uniform(0.2, 0.55) + (xa * math.cos(a) + ya * math.sin(a)) * 0.25).normalized()
        ln = rnd.uniform(0.17, 0.3); rb = rnd.uniform(0.035, 0.05)
        u = (Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))).cross(d).normalized(); w = d.cross(u)
        ring = [p.add_v(c + (u * math.cos(TAU * i / 4) + w * math.sin(TAU * i / 4)) * rb - d * 0.02, ('g', 0.0)) for i in range(4)]
        mid = [p.add_v(c + d * (ln * 0.55) + (u * math.cos(TAU * i / 4) + w * math.sin(TAU * i / 4)) * rb * 0.75 + outw * ln * 0.08, ('g', 0.55)) for i in range(4)]
        tip = p.add_v(c + d * ln + outw * ln * 0.2, ('g', 1.0))
        for i in range(4):
            i1 = (i + 1) % 4
            q = [ring[i], ring[i1], mid[i1], mid[i]]; cc = sum((p.v[k] for k in q), Vector()) / 4
            p.add_f(q, cc - (c + d * ln * 0.3))
            p.add_f([tip, mid[i], mid[i1]], d)

def strip_moss(name, Sf, s0, s1, ns, lo, hi, t, paint, ncross=5, carve=None):
    """icing over a strip of a swept surface Sf(s, a) -> (point, normal): a in [lo(s), hi(s)], s in [s0, s1]; both a
    edges roll into beads, the s ends close in poles"""
    def dA(s, a):
        e = 1e-3; return max(1e-4, (Sf(s, a + e)[0] - Sf(s, a - e)[0]).length / (2 * e))
    rows = [(-1, -2, 0.9, -0.02), (-1, -1, 0.5, 0.62)] + \
           [(0, k, 0, 0) for k in range(ncross)] + [(1, -1, 0.5, 0.62), (1, -2, 0.9, -0.02)]
    def F(u, s):
        side, k, fr, tk = rows[u]
        a0, a1 = lo(s), hi(s)
        if side == 0:
            w = k / (ncross - 1)
            a = a0 + (a1 - a0) * w
            pt, n = Sf(s, a)
            return pt + n * t * (1 + 0.3 * math.sin(PI * w))
        ae = a0 if side < 0 else a1
        d = t / dA(s, ae)
        a = ae - side * fr * d
        pt, n = Sf(s, a)
        return pt + n * t * tk
    ss = [s0 + (s1 - s0) * k / (ns + 1) for k in range(1, ns + 1)]
    def pole(s):
        a = (lo(s) + hi(s)) / 2; pt, n = Sf(s, a); return pt + n * (t * 0.2)
    p = Part(name, 'moss', paint=paint, ao=0.55, carve=carve)
    p.mossmeta = rows
    surf(p, F, list(range(len(rows))), ss, False, lambda c, u, v: Sf(v, (lo(v) + hi(v)) / 2)[1],
         pole0=pole(s0), pole1=pole(s1), meta=lambda u, v: ('strip', rows[u] if u is not None else None, v))
    return p

# ------------------------------------------------------------------ the arch (lip, throat)
class Arch:
    """the mouth's inner edge: straight jambs at x = ±a up to the spring line ys, a superellipse cap (exponent n)
    of height b on top. Curve param s by arc length, from the left foot (buried) to the right foot."""
    def __init__(self, a, ys, b, n=4.0):
        self.a, self.ys, self.b, self.n = a, ys, b, n
        pts = []
        for k in range(12): pts.append((-a, GROUND + (ys - GROUND) * k / 12))
        for k in range(181):
            t = PI - PI * k / 180
            pts.append((a * spow(math.cos(t), 2 / n), ys + b * abs(math.sin(t)) ** (2 / n)))
        for k in range(1, 13): pts.append((a, ys - (ys - GROUND) * k / 12))
        self.pts = [Vector((x, y)) for x, y in pts]
        self.S = [0.0]
        for i in range(1, len(self.pts)): self.S.append(self.S[-1] + (self.pts[i] - self.pts[i - 1]).length)
        self.len = self.S[-1]
    def C(self, s):
        s = clamp(s, 0, self.len); S = self.S
        lo, hi = 0, len(S) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if S[m] <= s: lo = m
            else: hi = m
        t = (s - S[lo]) / max(1e-12, S[hi] - S[lo])
        return self.pts[lo].lerp(self.pts[hi], t)
    def N(self, s):
        """outward (away from the opening) unit normal in the (x, height) plane"""
        e = 0.01; d = self.C(s + e) - self.C(s - e)
        n = Vector((-d.y, d.x))       # left of the travel direction (travel: up the left jamb, over, down)
        if n.length < 1e-9: return Vector((0, 1))
        n.normalize()
        c = self.C(s)
        ctr = Vector((0, min(c.y, self.ys)))
        return n if n.dot(c - ctr) >= 0 else -n
    def inside(self, x, y, m=0.0):
        if y <= self.ys: return abs(x) < self.a + m
        return (abs(x) / (self.a + m)) ** self.n + (abs(y - self.ys) / (self.b + m)) ** self.n < 1

class Lip:
    """the thick rounded rim: section centred outside the inner edge, half-width w/2 radially, depth D along z"""
    def __init__(self, arch, zc, w, D, e=0.7, seed=3, zfoot=0.0):
        self.A, self.zc, self.w0, self.D0, self.e, self.zfoot = arch, zc, w, D, e, zfoot
        r = random.Random(seed)
        self.bumps = [(r.uniform(0, arch.len), r.uniform(0.35, 0.8), r.uniform(-0.18, 0.28)) for _ in range(7)]
        self.dbumps = [(r.uniform(0, arch.len), r.uniform(0.5, 1.0), r.uniform(-0.1, 0.14)) for _ in range(5)]
    def w(self, s):
        n = self.A.N(s); crown = max(0.0, n.y) ** 2
        k = 1 + 0.18 * crown + sum(a * math.exp(-((s - c) / wd) ** 2) for c, wd, a in self.bumps)
        return self.w0 * k
    def D(self, s): return self.D0 * (1 + sum(a * math.exp(-((s - c) / wd) ** 2) for c, wd, a in self.dbumps))
    def z(self, s):
        crown = max(0.0, self.A.N(s).y)
        return self.zc + self.zfoot * (1 - crown)
    def Sf(self, s, a):
        c, n = self.A.C(s), self.A.N(s)
        w, D = self.w(s), self.D(s)
        r = (w / 2) * (1 + spow(math.cos(a), self.e))
        d = (D / 2) * spow(math.sin(a), self.e)
        p = L(c.x + n.x * r, c.y + n.y * r, self.z(s) + d)
        # normal: finite differences across the section and along s
        return p
    def F(self, a, s): return self.Sf(s, a)
    def centre(self, s):
        c, n = self.A.C(s), self.A.N(s); w = self.w(s)
        return L(c.x + n.x * w / 2, c.y + n.y * w / 2, self.z(s))
    def Sfn(self, s, a):
        p = self.Sf(s, a); e = 1e-3
        da = self.Sf(s, a + e) - self.Sf(s, a - e); ds = self.Sf(s + e, a) - self.Sf(s - e, a)
        n = da.cross(ds)
        if n.length < 1e-9: n = p - self.centre(s)
        n.normalize()
        if n.dot(p - self.centre(s)) < 0: n = -n
        return p, n
    def build(self, paint, step=0.15, K=12):
        A = self.A
        ss = []
        # the buried feet sparse, the visible arch every `step`
        s_vis0 = next(s for s in [A.len * k / 2000 for k in range(2001)] if A.C(s).y >= -0.05)
        ss = [0.0, s_vis0 * 0.5]
        nvis = int(round((A.len - 2 * s_vis0) / step))
        ss += [s_vis0 + (A.len - 2 * s_vis0) * k / nvis for k in range(nvis + 1)]
        ss += [A.len - s_vis0 * 0.5, A.len]
        als = [TAU * k / K + PI / K for k in range(K)]
        p = Part('lip', 'lip', paint=paint, closed=True)
        p.lip = self
        surf(p, self.F, als, ss, True, lambda c, u, v: c - self.centre(v),
             pole0=self.centre(0.0), pole1=self.centre(A.len))
        return p

class Throat:
    """the dark tunnel: the arch profile (plus the floor) swept back through shrinking rings, closed by a pole"""
    def __init__(self, arch, rings, back, fl0):
        # rings: [(z, sx, sy, floor)] front -> back; back: (z, height) of the closing pole
        self.A, self.rings, self.back, self.fl0 = arch, rings, back, fl0
    def section(self, lz):
        R = self.rings
        if R[-1][0] > lz >= self.back[0]:      # the domed end: the last ring shrinks to the closing pole
            t = (R[-1][0] - lz) / (R[-1][0] - self.back[0]); k = math.sqrt(max(0.0, 1 - t * t))
            return (R[-1][1] * k + 0.02, R[-1][2] * k + 0.02, R[-1][3])
        if lz > R[0][0] or lz < R[-1][0]: return None
        for k in range(len(R) - 1):
            if R[k][0] >= lz >= R[k + 1][0]:
                t = (R[k][0] - lz) / max(1e-9, R[k][0] - R[k + 1][0])
                return tuple(R[k][i] + (R[k + 1][i] - R[k][i]) * t for i in (1, 2, 3))
        return None
    def inside(self, p, m=0.05):
        lx, h, lz = p.x, p.z, -p.y
        sec = self.section(lz)
        if sec is None: return False
        sx, sy, fl = sec
        if h < fl: return False
        xn = lx / sx; yn = self.fl0 + (h - fl) / sy
        return self.A.inside(xn, yn, m)
    def build(self, paint):
        A = self.A
        prof = []
        # the arch curve above the floor (left jamb up, over, right jamb down) + the floor back across
        s_floor = next(s for s in [A.len * k / 4000 for k in range(4001)] if A.C(s).y >= self.fl0)
        n_arch = 26
        for k in range(n_arch + 1):
            c = A.C(s_floor + (A.len - 2 * s_floor) * k / n_arch); prof.append((c.x, c.y))
        for k in range(1, 5): prof.append((A.a - 2 * A.a * k / 5, self.fl0))
        def F(u, v):
            x, y = prof[u]; z, sx, sy, fl = self.rings[v]
            return L(x * sx, fl + (y - self.fl0) * sy, z)
        def axis(v):
            z, sx, sy, fl = self.rings[v]
            return L(0, fl + (A.ys * 0.75 - self.fl0) * sy, z)
        p = Part('throat', 'throat', paint=paint, ao=0.0)
        surf(p, F, list(range(len(prof))), list(range(len(self.rings))), True,
             lambda c, u, v: axis(v) - c, pole1=L(0, self.back[1], self.back[0]))
        return p

def carve(part, throat, mode, m=0.07):
    """push a boulder's vertices out of the throat volume (sideways, up or back), so no stone shows inside it"""
    moved = 0
    for i, v in enumerate(part.v):
        if not throat.inside(v, 0.0): continue
        if mode == 'side': d = Vector((1 if v.x >= 0 else -1, 0, 0))
        elif mode == 'up': d = UP
        else: d = Vector((0, 1, 0))       # back (local -z)
        lo, hi = 0.0, 4.0
        for _ in range(30):
            mid = (lo + hi) / 2
            if throat.inside(v + d * mid, m): lo = mid
            else: hi = mid
        part.v[i] = v + d * hi; moved += 1
    return moved

# ------------------------------------------------------------------ sweeps: beams, posts, rope
class Beam:
    """a rounded-section sweep along path(s) for s in [0, 1]: section half-extents hw(s) (side) x hh(s) (up hint),
    superellipse exponent e, domed caps of length cap at both ends; twist: rope strands (amp, pitch m)"""
    def __init__(self, path, up, hw, hh, e=0.6, cap=None, twist=None, furrow=None):
        self.path, self.up, self.hw, self.hh, self.e, self.twist, self.furrow = path, up, hw, hh, e, twist, furrow
        self.len = sum((path((k + 1) / 200) - path(k / 200)).length for k in range(200))
        self.cap = cap if cap is not None else min(hw(0), hh(0))
    def frame(self, s):
        e = 1e-3; T = self.path(min(1, s + e)) - self.path(max(0, s - e)); T.normalize()
        B = self.up - T * self.up.dot(T); B.normalize(); S = T.cross(B)
        return T, S, B
    def F(self, a, v):
        # v in [-cap, len + cap] (metres along the beam); the caps are domes
        ca = self.cap
        if v < 0:
            s = 0.0; beta = clamp(-v / ca) * PI / 2; k = math.cos(beta); ext = -math.sin(beta) * ca
        elif v > self.len:
            s = 1.0; beta = clamp((v - self.len) / ca) * PI / 2; k = math.cos(beta); ext = math.sin(beta) * ca
        else:
            s = v / self.len; k = 1.0; ext = 0.0
        T, S, B = self.frame(s)
        c = self.path(s) + T * ext
        hw, hh = self.hw(s) * k, self.hh(s) * k
        tw = 1.0
        if self.twist:
            amp, pitch = self.twist; tw = 1 + amp * math.cos(3 * a + TAU * v / pitch) * k
        elif self.furrow:
            n_, amp = self.furrow; tw = 1 + amp * math.cos(n_ * a + 0.6 * math.sin(v * 1.3)) * k
        return c + S * (hw * spow(math.cos(a), self.e) * tw) + B * (hh * spow(math.sin(a), self.e) * tw)
    def Sfn(self, v, a):
        p = self.F(a, v); e = 1e-3
        n = (self.F(a + e, v) - self.F(a - e, v)).cross(self.F(a, v + e) - self.F(a, v - e))
        s = clamp(v / self.len)
        c = self.path(s)
        if n.length < 1e-9: n = p - c
        n.normalize()
        if n.dot(p - c) < 0: n = -n
        return p, n
    def build(self, name, kind, paint, K=12, step=0.12, capn=3, ao=1.0, cap0=True, cap1=True):
        n = max(2, int(round(self.len / step)))
        vs = [self.len * k / n for k in range(n + 1)]
        c0 = [-self.cap * math.sin(PI / 2 * j / capn) for j in range(capn, 0, -1)] if cap0 else []
        c1 = [self.len + self.cap * math.sin(PI / 2 * j / capn) for j in range(1, capn + 1)] if cap1 else []
        vs = c0 + vs + c1
        vs = sorted(set(round(v, 6) for v in vs))
        # the pole sits at the dome tip; drop the tip rows themselves
        tip0 = vs[0] if cap0 else None; tip1 = vs[-1] if cap1 else None
        if cap0: vs = vs[1:]
        if cap1: vs = vs[:-1]
        als = [TAU * k / K for k in range(K)]
        p = Part(name, kind, paint=paint, ao=ao, closed=cap0 and cap1)
        p.beam = self
        def hint(c, u, v):
            s = clamp(v / self.len); return c - self.path(s)
        surf(p, self.F, als, vs, True, hint,
             pole0=self.F(0, tip0) if cap0 else None, pole1=self.F(0, tip1) if cap1 else None,
             meta=lambda u, v: ('beam', u, v))
        return p

def spline(ctrl, per=24):
    """a Catmull-Rom curve through ctrl = [(Vector, r)] -> (path(s) by arc length, radius(s)), s in [0, 1]"""
    P = [c[0] for c in ctrl]; R = [c[1] for c in ctrl]
    E = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    dense, key = [], []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = E[i], E[i + 1], E[i + 2], E[i + 3]
        for j in range(per):
            t = j / per
            if j == 0: key.append(len(dense))
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    key.append(len(dense)); dense.append(P[-1].copy())
    S = [0.0]
    for i in range(1, len(dense)): S.append(S[-1] + (dense[i] - dense[i - 1]).length)
    tot = S[-1]; sk = [S[k] / tot for k in key]
    def find(s):
        s = clamp(s) * tot; lo, hi = 0, len(S) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if S[m] <= s: lo = m
            else: hi = m
        return lo, (s - S[lo]) / max(1e-12, S[hi] - S[lo])
    def path(s):
        i, t = find(s); return dense[i].lerp(dense[min(i + 1, len(dense) - 1)], t)
    def radius(s):
        s = clamp(s)
        for i in range(len(sk) - 1):
            if sk[i] <= s <= sk[i + 1]:
                t = smooth((s - sk[i]) / max(1e-9, sk[i + 1] - sk[i])); return R[i] + (R[i + 1] - R[i]) * t
        return R[-1]
    return path, radius

def rbox(name, kind, c, hx, hz, hy, paint, e=0.3, res=0.12, lump=0.0, seed=1, yaw=0.0, ground=False, hdn=None):
    """a rounded slab (gate-local half extents hx, hz depth, hy height) as a boxy superellipsoid"""
    lc = Vector((c.x, -c.y, c.z))     # back to gate-local for Boulder's signature
    b = Boulder(name, lc.x, lc.y, lc.z, hx, hz, hy, hdn=hdn if hdn is not None else hy, yaw=yaw, exy=e, ez=e,
                lump=lump, taper=0.0, seed=seed, res=res, ground=ground)
    part = b.build(paint); part.kind = kind
    return part, b

def slab(name, kind, paint, hx, hz, top, bottom=GROUND, rc=0.12, rb=0.05, nc=3, dish=0.012, wob=0.012, seed=1,
         xf=None, ao=1.0):
    """a rounded-rectangle slab: half extents hx, hz, corner radius rc, a rounded top edge rb, a dished top, sides down
    to `bottom`. Built in its own frame (x, z depth, height) and mapped by xf(Vector(x, z, h)) -> Blender."""
    rnd = random.Random(seed)
    xf = xf or (lambda q: L(q.x, q.z, q.y))
    outl = []
    for k, (sx, sz) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        a0 = k * PI / 2
        cx, cz = sx * (hx - rc), sz * (hz - rc)
        for j in range(nc + 1):
            a = a0 + PI / 2 * j / nc
            outl.append((cx + math.cos(a) * rc, cz + math.sin(a) * rc))
    jit = [1 + rnd.uniform(-1, 1) * wob for _ in outl]
    def ring(inset, h, flare=0.0):
        out = []
        for (x, z), j in zip(outl, jit):
            r = math.hypot(x, z); k = max(0.0, (r - inset) / r) * j + flare / max(r, 1e-6)
            out.append(xf(Vector((x * k, z * k, h + (j - 1) * 0.3 * rb))))
        return out
    rings = [ring(rb * 1.1, top), ring(rb * 0.32, top - rb * 0.3), ring(0.0, top - rb), ring(-0.03, bottom, 0.03)]
    p = Part(name, kind, paint=paint, closed=True, ao=ao)
    centre = xf(Vector((0, 0, top - dish)))
    ids = [[p.add_v(q) for q in r] for r in rings]
    cid = p.add_v(centre); bid = p.add_v(xf(Vector((0, 0, bottom))))
    mid = xf(Vector((0, 0, (top + bottom) / 2)))
    n = len(outl)
    for i in range(n):
        i1 = (i + 1) % n
        p.add_f([cid, ids[0][i], ids[0][i1]], centre - mid)
        for r in range(3):
            q = [ids[r][i], ids[r][i1], ids[r + 1][i1], ids[r + 1][i]]
            cc = sum((p.v[k] for k in q), Vector()) / 4
            p.add_f(q, cc - mid)
        p.add_f([bid, ids[3][i1], ids[3][i]], xf(Vector((0, 0, bottom))) - mid)
    return p

def lathe(name, kind, paint, base, prof, K=12, ao=1.0):
    """a surface of revolution round a vertical axis through `base` (Blender): prof = [(r, dz)] bottom -> top,
    closed by poles"""
    p = Part(name, kind, paint=paint, closed=True, ao=ao)
    rings = [[p.add_v(base + Vector((math.cos(TAU * k / K) * r, math.sin(TAU * k / K) * r, dz))) for k in range(K)] for r, dz in prof]
    b0 = p.add_v(base + Vector((0, 0, prof[0][1]))); b1 = p.add_v(base + Vector((0, 0, prof[-1][1])))
    for k in range(K):
        k1 = (k + 1) % K
        for j in range(len(prof) - 1):
            q = [rings[j][k], rings[j][k1], rings[j + 1][k1], rings[j + 1][k]]
            cc = sum((p.v[i] for i in q), Vector()) / 4
            p.add_f(q, cc - (base + Vector((0, 0, cc.z - base.z))))
        p.add_f([b0, rings[0][k1], rings[0][k]], Vector((0, 0, -1)))
        p.add_f([b1, rings[-1][k], rings[-1][k1]], Vector((0, 0, 1)))
    return p

def box_flat(p, c, hx, hy, hz, rot=0.0):
    """a hard-edged box (separate verts per face) in part p: centre c (Blender), half extents along x / y / z,
    turned by rot round z"""
    R = Matrix.Rotation(rot, 3, 'Z')
    corners = lambda sx, sy, sz: c + R @ Vector((sx * hx, sy * hy, sz * hz))
    for ax in range(3):
        for s in (-1, 1):
            n = R @ Vector([s if i == ax else 0 for i in range(3)])
            o = [i for i in range(3) if i != ax]
            quad = []
            for (u, v) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                sv = [0, 0, 0]; sv[ax] = s; sv[o[0]] = u; sv[o[1]] = v
                quad.append(p.add_v(corners(*sv)))
            p.add_f(quad, n)

# ------------------------------------------------------------------ painters
def stone_painter(lo='#7d7584', mid='#a39aa6', hi='#cfc5c8', warm='#d9c6b8', tone=0.0, seed=0, wet=None):
    def paint(part, p, n, meta):
        z0, z1 = part.zr
        t = clamp((p.z - max(0.0, z0)) / max(0.3, z1 - max(0.0, z0)))
        c = mixc(lo, mid, smooth(t * 1.5))
        c = mixc(c, hi, smooth((t - 0.45) / 0.55) * 0.85)
        up = clamp(n.z)
        c = mixc(c, hi, up ** 2 * 0.35)
        lam = n.dot(LDIR)
        c = mixc(c, warm, clamp(lam) ** 2 * 0.22)
        c = mulc(c, 0.84 + 0.18 * clamp(lam * 0.5 + 0.5))
        g = fbm(p, 0.9, seed + part.seed_off)
        c = mulc(c, 0.92 + 0.14 * g + tone)
        if p.z < 0.15: c = mulc(c, 0.82 + 0.18 * clamp((p.z + 0.2) / 0.35))
        return c
    return paint

def moss_painter(lo='#557f36', mid='#79a446', hi='#a3c866', seed=0, warm='#b8b244', cool='#4c9a70', hue=0.06, speck=None):
    """icing: base `mid`, tops lighten to `hi`, drip edges and drip undersides darken to `lo`; soft light and shade;
    each part tinted a little toward `warm` or `cool` (±hue); optional speck colours (leaf litter)"""
    import zlib
    def paint(part, p, n, meta):
        if not hasattr(part, 'tint'):
            r = random.Random(zlib.crc32(part.name.encode()) + seed)
            k = r.uniform(-1, 1); part.tint = (warm if k > 0 else cool, abs(k) * hue)
        bead = 0
        if meta and isinstance(meta, tuple):
            if meta[0] == 'strip':
                r = meta[1]; bead = (-r[1] if r and r[0] != 0 else 0)
            elif isinstance(meta[1], (int, float)) and meta[1] < 0: bead = -meta[1]
        c = mixc(lo, mid, smooth((n.z + 0.15) / 0.6))
        c = mixc(c, hi, smooth((n.z - 0.55) / 0.4) * 0.85)
        lam = n.dot(LDIR)
        c = mulc(c, 0.84 + 0.2 * clamp(lam * 0.5 + 0.5))
        g = fbm(p, 2.6, seed + 11)
        c = mixc(c, hi, clamp((g - 0.55) * 2.0) * 0.35)
        c = mixc(c, lo, clamp((0.4 - g) * 2.2) * 0.3)
        if speck:
            for j, (sc, th) in enumerate(speck):
                if vnoise(p, 7.0 + j * 2.3, seed + 31 + j) > th: c = mixc(c, sc, 0.75)
        if bead: c = mixc(c, lo, 0.45 if bead == 1 else 0.7)
        c = mixc(c, part.tint[0], part.tint[1])
        return c
    return paint

def lacquer_painter(base, dark, hi, spec='#ffd2b8', moss_below=None, mossc='#6a9448', seed=0, sheen=0.75):
    def paint(part, p, n, meta):
        lam = n.dot(LDIR)
        c = mixc(dark, base, smooth(lam * 0.6 + 0.55))
        c = mixc(c, hi, smooth((lam - 0.35) / 0.5) * 0.6)
        h = n.dot(HDIR)
        c = mixc(c, spec, sstep(0.9, 0.975, h) * sheen)
        if n.z < -0.3: c = mulc(c, 0.86)
        if moss_below is not None:
            lim = moss_below + (vnoise(p, 6.0, seed) - 0.5) * 0.3
            if p.z < lim: c = mixc(c, mossc, 0.6 * clamp((lim - p.z) / 0.15 + 0.4))
        return c
    return paint

def flat_painter(c0, c1=None, f=3.0, seed=0, shade=0.12):
    def paint(part, p, n, meta):
        c = c0 if c1 is None else mixc(c0, c1, vnoise(p, f, seed))
        return mulc(c, 1 - shade + shade * clamp(n.dot(LDIR) * 0.5 + 0.5) * 2 * 0.5 + shade * 0.5 * clamp(n.z))
    return paint

def rope_painter(lo='#b49650', hi='#f2dfa4', seed=0):
    def paint(part, p, n, meta):
        b = part.beam; a, v = (meta[1], meta[2]) if meta and meta[0] == 'beam' and meta[1] is not None else (0, 0)
        if not b.twist: return mulc(mixc(lo, hi, 0.72), 0.85 + 0.15 * clamp(n.z * 0.5 + 0.5))
        amp, pitch = b.twist
        tw = math.cos(3 * a + TAU * v / pitch)
        c = mixc(lo, hi, 0.25 + 0.75 * (0.5 + 0.5 * tw))
        return mulc(c, 0.85 + 0.15 * clamp(n.z * 0.5 + 0.5))
    return paint

def step_painter(top='#cdc6b6', side='#a69e92', mossc='#7aae4e', seed=0):
    def paint(part, p, n, meta):
        c = mixc(side, top, smooth((n.z - 0.2) / 0.6))
        g = fbm(p, 1.6, seed)
        c = mulc(c, 0.92 + 0.14 * g)
        # moss creeping in from the edges and corners of the tread
        edge = 1 - smooth((n.z - 0.55) / 0.4)
        mm = clamp((vnoise(p, 3.2, seed + 9) - 0.48) * 3.2) * (0.35 + 0.65 * edge)
        if p.z > -0.1: c = mixc(c, mossc, mm * 0.8)
        if p.z < 0.0: c = mulc(c, 0.8)
        return c
    return paint

# ------------------------------------------------------------------ shared props
def zigzag_shide(name, top, paint, scale=1.0):
    """paper shide: four flat tabs stepping down in a zigzag (each overlaps the last), hanging from `top`, facing +z"""
    p = Part(name, 'shide', paint=paint, ao=0.25)
    w, h, th = 0.13 * scale, 0.118 * scale, 0.03
    for k in range(4):
        x = (0.036 if k % 2 else -0.036) * scale
        box_flat(p, top + Vector((x, -0.004 * k, -h * (k + 0.5) + 0.012 * k)), w / 2, th / 2, h / 2 + 0.006)
    return [p]

def flower(name, at, n, r, petal, centre, seed=0, leaf=False):
    """a five-petal flower: a domed, round-lobed blossom sitting on the surface (at, normal n), a gold centre"""
    p = Part(name, 'flower', ao=0.3)
    rnd = random.Random(seed)
    z = n.normalized(); xa = (Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))).cross(z).normalized(); ya = z.cross(xa)
    rot = rnd.uniform(0, TAU)
    M = 20
    ids = []
    for k in range(M):
        a = rot + TAU * k / M
        rr = r * ((0.32 + 0.68 * abs(math.cos(2.5 * (a - rot))) ** 2.2) if leaf else (0.42 + 0.58 * abs(math.cos(2.5 * (a - rot))) ** 0.7))
        ids.append(p.add_v(at + (xa * math.cos(a) + ya * math.sin(a)) * rr + z * (0.02 if leaf else 0.03), ('p',)))
    top = p.add_v(at + z * (0.045 if leaf else 0.075), ('c',)); bot = p.add_v(at - z * 0.03, ('b',))
    for k in range(M):
        p.add_f([top, ids[k], ids[(k + 1) % M]], z)
        p.add_f([bot, ids[(k + 1) % M], ids[k]], -z)
    pc, cc = hexc(petal), hexc(centre)
    def paint(part, pp, nn, meta):
        if meta and meta[0] == 'c': return cc
        return mulc(pc, 0.9 + 0.1 * clamp(nn.z))
    p.paint = paint
    return p

# ------------------------------------------------------------------ the torii (shared)
def torii(z=1.75, w=3.0, h=3.1, red='#d6573b', moss_top=True, seed=4, snow=False):
    """a myojin torii at gate-local z: posts (lean in), stone drum plinths, black bands, nuki, gakuzuka + gaku, red
    shimaki under a black kasagi with upswept ends (moss on top); a shimenawa with three shide between the posts"""
    parts = []
    REDP = lacquer_painter(red, '#a53a28', '#f08a66', spec='#ffd0b4', moss_below=0.62, seed=seed)
    REDB = lacquer_painter(red, '#a53a28', '#f08a66', spec='#ffd0b4', seed=seed)
    BLK = lacquer_painter('#3a3040', '#241e2a', '#5a4c62', spec='#a898b4', sheen=0.6)
    GOLD = lacquer_painter('#d8a440', '#9a6a26', '#f6cf72', spec='#fff0c0', sheen=0.8)
    STONE = stone_painter('#5c5560', '#7a7280', '#9c94a0', seed=seed)
    zl = z
    lean = 0.03
    for sx in (-1, 1):
        xb, xt = sx * (w / 2 + lean * h / 2), sx * (w / 2 - lean * h / 2)
        xat = lambda y, xb=xb, xt=xt: xb + (xt - xb) * y / h
        post = Beam(lambda s, xat=xat: L(xat(-0.25 + 3.45 * s), -0.25 + 3.45 * s, zl),
                    Vector((1, 0, 0)), lambda s: 0.152 - 0.022 * s, lambda s: 0.152 - 0.022 * s, e=1.0, cap=0.06)
        parts.append(post.build(f'post_{sx}', 'torii', REDP, K=14, step=0.9, capn=1))
        # plinth: a rounded stone drum, buried to the skirt
        parts.append(lathe(f'plinth_{sx}', 'torii', STONE, L(xat(0), 0, zl),
                           [(0.27, GROUND), (0.265, 0.0), (0.255, 0.17), (0.225, 0.26), (0.17, 0.3)], K=14))
        # black nemaki band above the plinth and a daiwa ring under the shimaki
        for (y0, r0, hh) in ((0.37, 0.168, 0.075), (2.97, 0.15, 0.06)):
            parts.append(lathe(f'band_{sx}_{y0}', 'torii', BLK, L(xat(y0), y0, zl),
                               [(r0 * 0.92, -hh), (r0, -hh * 0.5), (r0, hh * 0.5), (r0 * 0.92, hh)], K=12))
    # nuki (tie beam), its ends through the posts
    nk = Beam(lambda s: L(-1.83 + 3.66 * s, h * 0.76, zl), UP, lambda s: 0.085, lambda s: 0.1, e=0.55, cap=0.05)
    parts.append(nk.build('nuki', 'torii', REDB, K=12, step=1.0, capn=2))
    # gakuzuka strut + gaku plaque (black frame, gold plate)
    gz = Beam(lambda s: L(0, h * 0.76 + 0.08 + (h - h * 0.76 - 0.08) * s, zl), Vector((1, 0, 0)),
              lambda s: 0.075, lambda s: 0.065, e=0.55, cap=0.02)
    parts.append(gz.build('gakuzuka', 'torii', REDB, K=8, step=0.5, capn=1))
    gy = h * 0.885
    plaque = lambda dz: (lambda q: L(q.x, gy + q.z, zl + dz + q.y))       # slab frame: (x, depth, up) -> upright plaque
    parts.append(slab('gaku', 'torii', BLK, 0.2, 0.25, 0.05, bottom=-0.05, rc=0.07, rb=0.025, nc=2, dish=0.0, wob=0.0,
                      xf=lambda q: L(q.x, gy + q.y, zl + 0.08 + q.z)))
    parts.append(slab('gaku_plate', 'torii', GOLD, 0.145, 0.19, 0.03, bottom=-0.01, rc=0.05, rb=0.015, nc=2, dish=-0.006, wob=0.0,
                      xf=lambda q: L(q.x, gy + q.y, zl + 0.125 + q.z)))
    # shimaki (red) under the kasagi (black), both swept up at the ends
    def sweep(Lh, y0, rise, p=2.6):
        return lambda s: L((s * 2 - 1) * Lh, y0 + abs(s * 2 - 1) ** p * rise, zl)
    sm = Beam(sweep(2.0, h + 0.03, 0.2), UP, lambda s: 0.15, lambda s: 0.105, e=0.55, cap=0.08)
    parts.append(sm.build('shimaki', 'torii', REDB, K=10, step=0.3, capn=2))
    ks = Beam(sweep(2.16, h + 0.24, 0.3), UP, lambda s: 0.2 - 0.02 * abs(s * 2 - 1), lambda s: 0.11, e=0.5, cap=0.1)
    parts.append(ks.build('kasagi', 'torii', BLK, K=12, step=0.32, capn=2))
    if moss_top:
        MP = moss_painter(seed=seed + 2)
        a0, a1 = 0.55, 2.35
        r = random.Random(77)
        dl = [(r.uniform(a0 + 0.2, a1 - 0.2), r.uniform(0.12, 0.2), r.uniform(0.25, 0.45)) for _ in range(3)]
        def lo(v):
            u = clamp((v - a0) / (a1 - a0)); taper = math.sqrt(max(0.0, math.sin(PI * u)))
            return PI / 2 - (0.55 + sum(d * math.exp(-((v - c) / wd) ** 2) for c, wd, d in dl)) * taper - 0.02
        def hi(v):
            u = clamp((v - a0) / (a1 - a0)); taper = math.sqrt(max(0.0, math.sin(PI * u)))
            return PI / 2 + 0.6 * taper + 0.02
        parts.append(strip_moss('kasagi_moss', ks.Sfn, a0, a1, int((a1 - a0) / 0.13), lo, hi, 0.035, MP, ncross=3))
    if snow:
        SN = moss_painter(lo='#c4d2ee', mid='#e4ecfa', hi='#f4f8ff', warm='#fbf8f2', cool='#d2def4', hue=0.03, seed=seed + 9)
        rs = random.Random(seed * 3 + 1)
        for bm, nm, a0, a1, t, wide in ((ks, 'kasagi_snow', 0.25, ks.len - 0.25, 0.14, 0.62), (nk, 'nuki_snow', 0.15, nk.len - 0.15, 0.1, 0.6)):
            dls = [(rs.uniform(a0 + 0.3, a1 - 0.3), rs.uniform(0.12, 0.2), rs.uniform(0.2, 0.4)) for _ in range(4)]
            def lo(v, a0=a0, a1=a1, dls=dls, wide=wide):
                u = clamp((v - a0) / (a1 - a0)); tp = math.sqrt(max(0.0, math.sin(PI * u)))
                return PI / 2 - (wide + sum(d * math.exp(-((v - c) / wd) ** 2) for c, wd, d in dls)) * tp - 0.02
            def hi(v, a0=a0, a1=a1, wide=wide):
                u = clamp((v - a0) / (a1 - a0)); tp = math.sqrt(max(0.0, math.sin(PI * u))); return PI / 2 + wide * tp + 0.02
            sp_ = strip_moss(nm, bm.Sfn, a0, a1, int((a1 - a0) / 0.16), lo, hi, t, SN, ncross=3); sp_.kind = 'torii'; parts.append(sp_)
    # the torii's own shimenawa (thinner than the cave's) + three shide
    ROPE = rope_painter()
    def rp(s, x0=-(w / 2 - 0.02), x1=(w / 2 - 0.02), y=h * 0.7, sag=0.16):
        return L(x0 + (x1 - x0) * s, y - math.sin(PI * s) * sag, zl + 0.02)
    rope = Beam(rp, UP, lambda s: 0.064 * (0.75 + 0.45 * math.sin(PI * s)), lambda s: 0.064 * (0.75 + 0.45 * math.sin(PI * s)),
                e=1.0, cap=0.04)
    parts.append(rope.build('torii_rope', 'rope', ROPE, K=8, step=0.2, capn=1))
    PAPER = flat_painter('#fff6ea', '#f3eadc', shade=0.1)
    for k, t in enumerate((0.25, 0.5, 0.75)):
        top = rp(t) + Vector((0, -0.075, -0.055))
        parts += zigzag_shide(f'torii_shide_{k}', top, PAPER, scale=0.95)
    return parts

# ------------------------------------------------------------------ kit, round 3: litter caps, leaves, icicles, flows, glass, glow
def _meridian_tools(b):
    """per-θ meridian tables of a boulder: arc length from the crown pole, horizontal radius fraction"""
    tables = {}
    def table(th):
        k = round(th, 7)
        if k not in tables:
            n = 90; lo = -PI / 2 + 0.02
            phs = [PI / 2 - (PI / 2 - lo) * j / n for j in range(n + 1)]
            pts = [b.P(th, ph) for ph in phs]
            d = [0.0]
            for j in range(1, n + 1): d.append(d[-1] + (pts[j] - pts[j - 1]).length)
            rh = [math.hypot(q.x - b.c.x, q.y - b.c.y) for q in pts]
            jm = max(range(n + 1), key=lambda j: rh[j])
            jl = n
            for j in range(n + 1):
                if b.ground and pts[j].z < 0.06: jl = max(1, j - 1); break
            tables[k] = (phs, d, [r / max(1e-6, rh[jm]) for r in rh], jm, jl)
        return tables[k]
    def d_at_rho(tb, rho):
        phs, d, rh, jm, jl = tb
        for j in range(1, jm + 1):
            if rh[j] >= rho:
                f = (rho - rh[j - 1]) / max(1e-9, rh[j] - rh[j - 1]); return d[j - 1] + (d[j] - d[j - 1]) * f
        return d[jm]
    def phi_at(tb, dd):
        phs, d, rh, jm, jl = tb
        dd = clamp(dd, 0.0, d[jl])
        for j in range(1, len(d)):
            if d[j] >= dd:
                f = (dd - d[j - 1]) / max(1e-9, d[j] - d[j - 1]); return phs[j - 1] + (phs[j] - phs[j - 1]) * f
        return phs[-1]
    def d_of(tb, ph):
        phs, d, rh, jm, jl = tb
        for j in range(1, len(phs)):
            if phs[j] <= ph:
                f = (phs[j - 1] - ph) / max(1e-9, phs[j - 1] - phs[j]); return d[j - 1] + (d[j] - d[j - 1]) * f
        return d[-1]
    return table, d_at_rho, phi_at, d_of

def litter_cap(b, paint, stone=None):
    """drifted leaves on a boulder's crown: a low lumpy layer (1-3 cm relief) over about `cover` of the crown radius,
    its edge a strip of overlapping maple-leaf scallops (8-14 cm, five-point lobes) lying on the stone; no rolled rim"""
    M = b.moss
    rnd = random.Random(b.seed * 37 + 11)
    cover = M.get('cover', 0.63)
    table, d_at_rho, phi_at, d_of = _meridian_tools(b)
    wob = (rnd.uniform(0, TAU), rnd.uniform(0, TAU), rnd.uniform(0.05, 0.1), rnd.uniform(0, TAU))
    def edge(th):
        tb = table(th)
        dirw = b.R @ Vector((math.cos(th), math.sin(th), 0))
        rho = cover + 0.08 * dirw.y + wob[2] * math.sin(2 * th + wob[0]) + 0.05 * math.sin(3 * th + wob[1]) + 0.04 * math.sin(5 * th + wob[3])
        return min(d_at_rho(tb, clamp(rho, 0.2, 0.97)), tb[1][tb[4]])
    def lump(p): return 0.012 + 0.022 * vnoise(p, 5.5, b.seed + 3)
    def F(th, v):
        tb = table(th); de = edge(th)
        ph = phi_at(tb, de * (1 - v))
        q = b.P(th, ph)
        return q + b.N(th, ph) * (0.01 if v == 0 else lump(q))
    nu = int(M.get('nu', 13))
    ths = resample_periodic([(th, Vector((b.ax * spow(math.cos(th), b.exy), b.az * spow(math.sin(th), b.exy), 0)))
                             for th in [TAU * k / 240 for k in range(240)]], nu)
    p = Part(b.name + '_litter', 'moss', paint=paint, ao=0.45, carve=b.carve)
    top = b.P(0, PI / 2)
    surf(p, F, ths, [0.0, 0.3, 0.62], True, lambda c, u, v: c - b.c, pole1=top + b.N(0, PI / 2) * lump(top))
    # the scalloped edge strip: lobes of varied size, each notch / shoulder / tip / shoulder
    E = [edge(TAU * k / 96) for k in range(96)]
    per = 0.0
    for k in range(96):
        a0, a1 = TAU * k / 96, TAU * (k + 1) / 96
        per += (b.P(a0, phi_at(table(a0), E[k])) - b.P(a1, phi_at(table(a1), E[(k + 1) % 96]))).length
    ns = max(8, int(round(per / 0.14)))
    sths, ext = [], []
    for j in range(ns):
        sz = rnd.uniform(0.75, 1.3)
        for f, e in ((0.0, 0.0), (0.38, 0.07), (0.7, 0.05)):
            sths.append(TAU * (j + f) / ns); ext.append(e * sz)
    if not M.get('lobes', True): sths, ext = [], []
    sp = Part(b.name + '_lobes', 'moss', paint=paint, ao=0.45, carve=b.carve)
    ids = []
    for th, ex in zip(sths, ext):
        tb = table(th); de = edge(th)
        pi = phi_at(tb, max(0.0, de - 0.07)); po = phi_at(tb, de + ex)
        qi, qo = b.P(th, pi), b.P(th, po)
        ids.append((sp.add_v(qi + b.N(th, pi) * 0.024, ('in',)), sp.add_v(qo + b.N(th, po) * 0.007, ('out', ex))))
    for k in range(len(ids)):
        a, c = ids[k], ids[(k + 1) % len(ids)]
        q = [a[0], c[0], c[1], a[1]]
        cc = sum((sp.v[i] for i in q), Vector()) / 4
        sp.add_f(q, cc - b.c)
    if stone is not None:
        for i, mt in enumerate(stone.meta):
            if not mt: continue
            th, ph = mt
            if th is None:
                if ph > 0: stone.v[i] = stone.v[i] - Vector((0, 0, 0.03))
                continue
            tb = table(th); de = edge(th); dd = d_of(tb, ph)
            k = smooth((de - 0.12 - dd) / 0.15)
            if k > 0: stone.v[i] = stone.v[i] - b.N(th, ph) * (0.03 * k)
    return [p, sp] if sp.f else [p]

def litter_painter(pal=(('#b8302a', 0.34), ('#e0702a', 0.3), ('#e8a83a', 0.22), ('#8a4a2a', 0.14)), cell=0.2, seed=0):
    """leaf litter mottled in patches of ~`cell` m: each patch one of the palette colours (weighted), soft light and shade"""
    cols = [hexc(c) for c, w in pal]; cum = []; s = 0.0
    for c, w in pal: s += w; cum.append(s)
    def pick(h):
        h *= s
        for i, cv in enumerate(cum):
            if h <= cv: return i
        return len(cum) - 1
    def paint(part, p, n, meta):
        x, y, z = p.x / cell, p.y / cell, p.z / cell
        ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
        best = (9e9, 0); second = (9e9, 0)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    cx, cy, cz = ix + dx, iy + dy, iz + dz
                    jx = cx + _h(cx, cy, cz, seed + 1); jy = cy + _h(cx, cy, cz, seed + 2); jz = cz + _h(cx, cy, cz, seed + 3)
                    d = (x - jx) ** 2 + (y - jy) ** 2 + (z - jz) ** 2
                    ci = pick(_h(cx, cy, cz, seed + 4))
                    if d < best[0]: second = best; best = (d, ci)
                    elif d < second[0]: second = (d, ci)
        c = cols[best[1]]
        edge_ = clamp((second[0] - best[0]) * 2.5)
        c = mixc(cols[second[1]], c, 0.5 + 0.5 * edge_)
        lam = n.dot(LDIR)
        c = mulc(c, 0.8 + 0.24 * clamp(lam * 0.5 + 0.5))
        if meta and meta[0] == 'out': c = mulc(c, 0.86)
        return c
    return paint

def maple_leaf(name, at, n, size, col, seed=0):
    """a small 3D maple leaf lying on a surface: five pointed lobes, curled up at the tips, two-sided"""
    p = Part(name, 'flower', ao=0.25)
    rnd = random.Random(seed)
    z = n.normalized(); xa = (Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))).cross(z).normalized(); ya = z.cross(xa)
    rot = rnd.uniform(0, TAU); curl = rnd.uniform(0.02, 0.04)
    rim = []
    for k in range(15):
        a = rot + TAU * k / 15
        lobe = k % 3
        rr = size * (1.0 if lobe == 0 else (0.62 if lobe == 1 else 0.42)) / 2
        q = at + (xa * math.cos(a) + ya * math.sin(a)) * rr
        rim.append(q + z * (0.012 + curl * (rr / (size / 2)) ** 2))
    c0, c1 = at + z * 0.016, at + z * 0.008
    ti = [p.add_v(q, ('t',)) for q in rim]; tc = p.add_v(c0, ('t',))
    bi = [p.add_v(q - z * 0.006, ('b',)) for q in rim]; bc = p.add_v(c1, ('b',))
    for k in range(15):
        p.add_f([tc, ti[k], ti[(k + 1) % 15]], z)
        p.add_f([bc, bi[(k + 1) % 15], bi[k]], -z)
    cc = hexc(col)
    def paint(part, pp, nn, meta):
        return mulc(cc, (0.95 if meta and meta[0] == 't' else 0.78) * (0.9 + 0.1 * clamp(nn.z)))
    p.paint = paint
    return p

def icicle(name, top, L, r0, paint, lean=Vector((0, 0, 0))):
    """a chunky icicle: a rounded cone hanging from `top`"""
    path = lambda s: top + Vector((lean.x * s * L, lean.y * s * L, -L * s))
    rad = lambda s: max(0.022, r0 * (1 - s) ** 0.85)
    bm = Beam(path, Vector((0, -1, 0)), rad, rad, e=1.0, cap=0.03)
    return bm.build(name, 'ice', paint, K=6, step=max(0.1, L / 2.5), capn=1)

def ice_painter(deep='#6a9ed8', hi='#d8eeff', seed=0):
    def paint(part, p, n, meta):
        c = mixc(deep, hi, clamp(n.z * 0.4 + 0.45) * 0.8 + clamp(n.dot(LDIR)) * 0.25)
        h = n.dot(HDIR)
        c = mixc(c, '#f4fbff', sstep(0.88, 0.97, h) * 0.6)
        return c
    return paint

def glow_painter(c0, c1=None, f=3.0, seed=0):
    def paint(part, p, n, meta):
        return hexc(c0) if c1 is None else mixc(c0, c1, vnoise(p, f, seed))
    return paint

def crystal(name, base, h, r, col, tilt=(0.0, 0.0)):
    """a small glowing crystal: a six-sided pointed prism (material glow)"""
    R = Matrix.Rotation(tilt[0], 3, 'X') @ Matrix.Rotation(tilt[1], 3, 'Y')
    p = Part(name, 'glow', paint=glow_painter(col), ao=0.0, mat=1); p.glowc = col
    ring0 = [p.add_v(base + R @ Vector((math.cos(TAU * k / 6) * r, math.sin(TAU * k / 6) * r, -0.05))) for k in range(6)]
    ring1 = [p.add_v(base + R @ Vector((math.cos(TAU * k / 6) * r * 0.9, math.sin(TAU * k / 6) * r * 0.9, h * 0.7))) for k in range(6)]
    tip = p.add_v(base + R @ Vector((0, 0, h)))
    ax = R @ Vector((0, 0, 1))
    for k in range(6):
        k1 = (k + 1) % 6
        q = [ring0[k], ring0[k1], ring1[k1], ring1[k]]
        cc = sum((p.v[i] for i in q), Vector()) / 4
        p.add_f(q, cc - (base + ax * (cc - base).dot(ax)))
        p.add_f([tip, ring1[k], ring1[k1]], ax)
    return p

def glass_float(name, c, r, col, net='#d8c8a0'):
    """a glass fishing float in a rope net: a sphere (painted gloss) and two net rings"""
    parts = []
    G = lacquer_painter(col, mulc(col, 0.62), mixc(col, '#ffffff', 0.45), spec='#ffffff', sheen=0.9)
    prof = [(max(0.001, r * math.sin(PI * j / 8)), -r * math.cos(PI * j / 8)) for j in range(1, 8)]
    sp = Part(name, 'torii', paint=G, closed=True)
    K = 12
    rings = [[sp.add_v(c + Vector((math.cos(TAU * k / K) * rr, math.sin(TAU * k / K) * rr, dz))) for k in range(K)] for rr, dz in prof]
    b0 = sp.add_v(c + Vector((0, 0, -r))); b1 = sp.add_v(c + Vector((0, 0, r)))
    for k in range(K):
        k1 = (k + 1) % K
        for j in range(len(prof) - 1):
            q = [rings[j][k], rings[j][k1], rings[j + 1][k1], rings[j + 1][k]]
            cc = sum((sp.v[i] for i in q), Vector()) / 4
            sp.add_f(q, cc - c)
        sp.add_f([b0, rings[0][k1], rings[0][k]], Vector((0, 0, -1)))
        sp.add_f([b1, rings[-1][k], rings[-1][k1]], Vector((0, 0, 1)))
    parts.append(sp)
    NP = flat_painter(net, shade=0.15)
    for k, (ax, tilt) in enumerate(((Vector((0, 0, 1)), 0.0), (Vector((1, 0, 0)), PI / 2))):
        R = Matrix.Rotation(tilt, 3, 'Y')
        ring = Beam(lambda s, R=R: c + R @ Vector((math.cos(TAU * s) * (r + 0.012), math.sin(TAU * s) * (r + 0.012), 0)),
                    R @ Vector((0, 0, 1)), lambda s: 0.022, lambda s: 0.022, e=1.0, cap=0.01)
        parts.append(ring.build(f'{name}_net{k}', 'rope', NP, K=4, step=0.16, capn=1))
    return parts

# ------------------------------------------------------------------ assembly, AO, export
def finish(parts, name, throat=None, ground_ao=True):
    # carve boulders (and their moss) clear of the throat
    if throat is not None:
        for p in parts:
            if p.carve and p.kind in ('stone', 'moss'):
                mv = carve(p, throat, p.carve)
                if mv: print(f'GATES carve {p.name}: {mv} verts ({p.carve})')
    # normals, z ranges, painting
    for k, p in enumerate(parts):
        p.n = p.normals()
        zs = [v.z for v in p.v]; p.zr = (min(zs), max(zs)); p.seed_off = k * 3
        p.col = [hexc(p.paint(p, v, n, m)) if p.paint else (0.8, 0.8, 0.8, 1.0) for v, n, m in zip(p.v, p.n, p.meta)]
    # AO: cosine-weighted ray casts against everything (+ a ground plane at the rim height)
    allv, allf = [], []
    for p in parts:
        b = len(allv); allv += p.v
        for f in p.f:
            if len(f) == 3: allf.append([i + b for i in f])
            else: allf += [[f[0] + b, f[1] + b, f[2] + b], [f[0] + b, f[2] + b, f[3] + b]]
    if ground_ao:
        b = len(allv); allv += [Vector((-14, -14, 0)), Vector((14, -14, 0)), Vector((14, 14, 0)), Vector((-14, 14, 0))]
        allf += [[b, b + 1, b + 2], [b, b + 2, b + 3]]
    bvh = BVHTree.FromPolygons(allv, allf)
    NR, DMAX = 28, 1.1
    dirs = []
    ga = PI * (3 - math.sqrt(5))
    for k in range(NR):
        r = math.sqrt((k + 0.5) / NR); a = k * ga
        x, y = r * math.cos(a), r * math.sin(a); dirs.append(Vector((x, y, math.sqrt(max(0.0, 1 - x * x - y * y)))))
    for p in parts:
        if p.ao <= 0: continue
        for i, (v, n) in enumerate(zip(p.v, p.n)):
            if v.z < -0.3: continue
            q = n.to_track_quat('Z', 'Y')
            occ = 0.0
            o = v + n * 0.012
            for d in dirs:
                hit = bvh.ray_cast(o, q @ d, DMAX)
                if hit[0] is not None: occ += 1 - hit[3] / DMAX
            occ /= NR
            k = 1 - p.ao * clamp(occ * 1.25) * 0.62
            c = p.col[i]; p.col[i] = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    for p in sorted(parts, key=lambda q: -q.tris())[:18]: print(f'GATES part {p.name:18s} {p.tris():5d}')
    # one mesh
    verts, faces, cols, mats = [], [], [], []
    tri_by_kind = {}
    for p in parts:
        b = len(verts); verts += p.v
        for f in p.f:
            P = [p.v[i] for i in f]
            ar = (P[1] - P[0]).cross(P[2] - P[0]).length + ((P[2] - P[0]).cross(P[3] - P[0]).length if len(P) == 4 else 0)
            if ar < 1e-9: continue
            faces.append([i + b for i in f]); mats.append(p.glowc if p.mat == 1 else 0)
            cols.append([p.col[i] for i in f])
        tri_by_kind[p.kind] = tri_by_kind.get(p.kind, 0) + p.tris()
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    flat = []
    for poly, fc in zip(me.polygons, cols):
        for c in fc: flat.extend(c)
    attr.data.foreach_set('color', flat)
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass
    stone = bpy.data.materials.new('stone'); stone.use_nodes = True
    nt = stone.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
    stone.use_backface_culling = True
    me.materials.append(stone)
    # glow parts: one material per colour (the game's glow material is unlit, one colour, additive: it ignores vertex
    # colours), named glow_<hex>, Emission = that colour
    gcols = []
    for m in mats:
        if m != 0 and m not in gcols: gcols.append(m)
    for gc in gcols:
        glow = bpy.data.materials.new('glow_' + gc.lstrip('#')); glow.use_nodes = True
        b2 = next(n for n in glow.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b2.inputs['Base Color'].default_value = hexc(gc); b2.inputs['Emission Color'].default_value = hexc(gc)
        b2.inputs['Emission Strength'].default_value = 1.0; b2.inputs['Roughness'].default_value = 0.8
        me.materials.append(glow)
    for poly, m in zip(me.polygons, mats): poly.material_index = 0 if m == 0 else 1 + gcols.index(m)
    me.shade_smooth()
    me.validate(verbose=False)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob, tri_by_kind

def export(ob, zone):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, f'gate-{zone}.blend'))
    if NO_EXPORT: return None
    for o in bpy.context.scene.objects: o.select_set(o == ob)
    out = os.path.join(MODELS, f'gate-{zone}.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('GATES export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('GATES wrote', out)
    return out

# ------------------------------------------------------------------ checks (the report table)
def checks(zone, parts, arch, mouth, colliders, spots, throat, out_json, mouth_collider=None):
    R = {}
    # 1. the opening against the seal rectangle (half-width w/2, height h, at z = lz)
    hw, hh = mouth['w'] / 2, mouth['h']
    side = arch.a - hw; top = arch.ys + arch.b - hh
    cd = min((arch.C(arch.len * k / 4000) - Vector((hw, hh))).length for k in range(4001)
             if arch.C(arch.len * k / 4000).x > 0 and arch.C(arch.len * k / 4000).y > arch.ys)
    R['mouth'] = {'seal_rect': [mouth['w'], mouth['h']], 'opening_inner_w': round(2 * arch.a, 3), 'opening_inner_h': round(arch.ys + arch.b, 3),
                  'side_margin': round(side, 3), 'top_margin': round(top, 3), 'corner_clearance': round(cd, 3),
                  'rect_inside_opening': all(arch.inside(x * hw, y * hh) for x in (-0.999, 0.999) for y in (0.001, 0.999))}
    # 2. occlusion of the seal rectangle by the mass (stone/moss/lip/steps) from the game cameras, and by torii/rope
    def bvh_of(kinds):
        V, Fc = [], []
        for p in parts:
            if p.kind not in kinds: continue
            b = len(V); V += p.v
            for f in p.f:
                if len(f) == 3: Fc.append([i + b for i in f])
                else: Fc += [[f[0] + b, f[1] + b, f[2] + b], [f[0] + b, f[2] + b, f[3] + b]]
        return BVHTree.FromPolygons(V, Fc) if Fc else None
    mass = bvh_of({'stone', 'moss', 'lip', 'step', 'root', 'ice'}); dress = bvh_of({'torii', 'rope', 'shide', 'flower'})
    owner = []
    for p in parts:
        if p.kind in ('stone', 'moss', 'lip', 'step', 'root', 'ice'):
            owner += [p.name] * sum(1 if len(f) == 3 else 2 for f in p.f)
    blockers = {}
    cams = {'front_level': (0, 0), 'yaw0_pitch45': (0, 45), 'yaw+45_pitch45': (45, 45), 'yaw-45_pitch45': (-45, 45)}
    occl = {}
    for nm, (yw, pt) in cams.items():
        d = Vector((math.sin(math.radians(yw)) * math.cos(math.radians(pt)), -math.cos(math.radians(yw)) * math.cos(math.radians(pt)), math.sin(math.radians(pt))))
        tot = om = od = 0
        for ix in range(25):
            for iy in range(27):
                x = -hw + (ix + 0.5) * (2 * hw) / 25; y = (iy + 0.5) * hh / 27
                if y < 0.18: continue           # (the threshold step covers the curtain's foot by design)
                o = L(x, y, mouth['lz']) + d * 0.02
                tot += 1
                hm = mass.ray_cast(o, d, 60)
                if hm[0] is not None:
                    om += 1; blockers[owner[hm[2]]] = blockers.get(owner[hm[2]], 0) + 1
                elif dress and dress.ray_cast(o, d, 60)[0] is not None: od += 1
        occl[nm] = {'by_mass_pct': round(100 * om / tot, 1), 'by_torii_rope_pct': round(100 * od / tot, 1)}
    R['seal_occlusion'] = occl; R['seal_blockers'] = blockers
    # 3. stone inside the throat after carving
    bad = 0; intr = {}
    for p in parts:
        if p.kind in ('stone', 'moss', 'lip', 'step', 'torii', 'rope', 'shide'):
            nb = sum(1 for v in p.v if throat.inside(v, -0.02) and -v.y < 0.0)
            for f in p.f:
                c = sum((p.v[i] for i in f), Vector()) / len(f)
                if -c.y < 0.0 and throat.inside(c, -0.02): nb += 1
            if nb: intr[p.name] = nb; bad += nb
    R['throat_intrusions'] = bad; R['throat_intruders'] = intr
    # what the eye sees through the opening (from the close camera and the game cameras): should be throat (+ lip rim)
    V, Fc, own = [], [], []
    for p in parts:
        if p.kind in ('torii', 'rope', 'shide', 'flower', 'glow'): continue
        b0 = len(V); V += p.v
        for f in p.f:
            tri = [[f[0], f[1], f[2]]] if len(f) == 3 else [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]
            for t in tri: Fc.append([i + b0 for i in t]); own.append(p.name)
    allm = BVHTree.FromPolygons(V, Fc)
    seen = {}
    mz = mouth['lz']
    for (yw, pt, dist, tgt) in ((20, 30, 11.0, L(0, 1.8, mz - 0.2)), (0, 45, 20.0, L(0, 1.5, mz + 0.2)), (45, 45, 20.0, L(0, 1.5, mz + 0.2)), (-45, 45, 20.0, L(0, 1.5, mz + 0.2))):
        d = Vector((math.sin(math.radians(yw)) * math.cos(math.radians(pt)), -math.cos(math.radians(yw)) * math.cos(math.radians(pt)), math.sin(math.radians(pt))))
        eye = tgt + d * dist
        for ix in range(24):
            for iy in range(24):
                q = L(-hw + (ix + 0.5) * 2 * hw / 24, 0.2 + (iy + 0.5) * (hh - 0.2) / 24, mouth['lz'])
                ray = (q - eye).normalized()
                h = allm.ray_cast(eye, ray, 80)
                if h[0] is not None and -h[0].y < mouth['lz'] + 0.02:
                    seen[own[h[2]]] = seen.get(own[h[2]], 0) + 1
    R['seen_through_mouth'] = dict(sorted(seen.items(), key=lambda kv: -kv[1]))
    # 4. footprint (solid cross-section 0.25 m above the rim) against the colliders
    solids = [p for p in parts if p.closed and p.kind in ('stone', 'lip', 'root')]
    trees = []
    for p in solids:
        Fc = []
        for f in p.f:
            if len(f) == 3: Fc.append(f)
            else: Fc += [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]
        xs = [v.x for v in p.v]; ys = [v.y for v in p.v]; zs = [v.z for v in p.v]
        trees.append((BVHTree.FromPolygons(p.v, Fc), (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))))
    dray = Vector((1, 0.0013, 0.0007)).normalized()
    def inside(pt):
        for t, bb in trees:
            if not (bb[0] <= pt.x <= bb[1] and bb[2] <= pt.y <= bb[3] and bb[4] <= pt.z <= bb[5]): continue
            n = 0; o = pt.copy()
            for _ in range(40):
                h = t.ray_cast(o, dray, 50)
                if h[0] is None: break
                n += 1; o = h[0] + dray * 1e-5
            if n % 2 == 1: return True
        return False
    step = 0.1
    xs = [-5.5 + step * i for i in range(111)]; zs = [-6.0 + step * j for j in range(91)]
    F, U, Uall = [], [], []
    def in_coll(x, z, lst):
        return any((x - cx) ** 2 + (z - cz) ** 2 <= r * r for cx, cz, r in lst)
    body = [c for c in colliders if c != mouth_collider]
    def mouthish(x, z):
        if mouth_collider and (x - mouth_collider[0]) ** 2 + (z - mouth_collider[1]) ** 2 <= mouth_collider[2] ** 2: return True
        sec = throat.section(z)
        return sec is not None and abs(x) < throat.A.a * sec[0] + 0.1
    for x in xs:
        for z in zs:
            if inside(L(x, 0.25, z)): F.append((x, z))
            if in_coll(x, z, colliders): Uall.append((x, z))
            if in_coll(x, z, body) and not mouthish(x, z): U.append((x, z))
    import numpy as np
    Fa, Ua, Uaa = np.array(F), np.array(U), np.array(Uall)
    def dist(a, b):
        out = np.empty(len(a))
        for i in range(0, len(a), 512):
            d = np.sqrt(((a[i:i + 512, None, :] - b[None, :, :]) ** 2).sum(-1)); out[i:i + 512] = d.min(1)
        return out
    rock_out = dist(Fa, Uaa)       # rock cells: how far outside the colliders' union
    air = dist(Ua, Fa)             # collider cells: how far from rock
    wi = int(rock_out.argmax())
    R['footprint'] = {'rock_cells': len(F), 'rock_outside_union_max_m': round(float(rock_out.max()), 2),
                      'rock_outside_worst_at_lxlz': [round(float(Fa[wi][0]), 2), round(float(Fa[wi][1]), 2)],
                      'rock_cells_outside_by_0.3_pct': round(100 * float((rock_out > 0.3).mean()), 1),
                      'collider_air_max_m': round(float(air.max()), 2),
                      'collider_cells_air_beyond_0.3_pct': round(100 * float((air > 0.3).mean()), 1)}
    per = []
    for c in colliders:
        cells = np.array([(x, z) for x, z in U if (x - c[0]) ** 2 + (z - c[1]) ** 2 <= c[2] ** 2]) if c != mouth_collider else None
        if cells is None or not len(cells): per.append({'collider': c, 'note': 'mouth block (no rock by design)'}); continue
        dd = dist(cells, Fa)
        per.append({'collider': c, 'air_max_m': round(float(dd.max()), 2), 'air_beyond_0.3_pct': round(100 * float((dd > 0.3).mean()), 1)})
    R['footprint']['per_collider'] = per
    # 5. the dress spots: the highest model surface over each (a disc of radius r) and whether it's clear
    allbvh = bvh_of({'stone', 'moss', 'lip', 'step', 'torii', 'root'})
    sp = []
    for nm, x, z, r, want in spots:
        if want == 'on':
            hit = allbvh.find_nearest(L(x, r, z))
            dd = round(hit[3], 2) if hit[0] is not None else None
            sp.append({'spot': nm, 'lx': x, 'lz': z, 'h': r, 'gap_to_rock_m': dd, 'ok': dd is not None and dd < 0.3, 'note': 'on'}); continue
        hmax = -9.0; low = -9.0
        for k in range(9):
            a = TAU * k / 8; rr = 0 if k == 8 else r
            h = allbvh.ray_cast(L(x + math.cos(a) * rr, 12, z + math.sin(a) * rr), Vector((0, 0, -1)), 30)
            if h[0] is not None: hmax = max(hmax, h[0].z)
            h2 = allbvh.ray_cast(L(x + math.cos(a) * rr, 1.5, z + math.sin(a) * rr), Vector((0, 0, -1)), 10)
            if h2[0] is not None: low = max(low, h2[0].z)
        sp.append({'spot': nm, 'lx': x, 'lz': z, 'r': r, 'top_of_model_m': round(hmax, 2) if hmax > -9 else None,
                   'ground_level_top_m': round(low, 2) if low > -9 else None,
                   'clear': low < 0.08 if want == 'clear' else None, 'overhead': hmax > 1.5, 'note': want})
    R['dress_spots'] = sp
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, 'w', encoding='utf-8') as f: json.dump(R, f, indent=2)
    print('GATES checks', json.dumps(R))
    return R

# ================================================================== the bamboo gate
def build_bamboo():
    parts = []
    ST = stone_painter('#7a7480', '#a29ba9', '#c8c2cc', seed=1)
    STW = stone_painter('#757080', '#9e97a6', '#c4bec8', warm='#dccab8', seed=2)
    MOSS = moss_painter(seed=1)
    # ---- the mouth: superellipse arch framing the 2.5 x 2.7 seal at lz 0.2
    arch = Arch(a=1.48, ys=1.9, b=1.02, n=4.0)
    mouth = {'lz': 0.2, 'w': 2.5, 'h': 2.7}
    lip = Lip(arch, zc=0.1, w=0.46, D=0.5, e=0.62, seed=7, zfoot=0.04)
    LIPP = stone_painter('#6f6a78', '#958e9c', '#c6bdc2', seed=5)
    def lip_paint(part, p, n, meta):
        c = LIPP(part, p, n, meta)
        # the inner face darkens toward the throat (wet stone)
        if meta and meta[0] is not None:
            a = meta[0]; inner = clamp(-math.cos(a)) ** 1.5
            c = mixc(c, '#3c4440', inner * 0.55)
        return c
    lp = lip.build(lip_paint, step=0.25, K=10); parts.append(lp)
    # moss icing over the lip's crown, just tipping over its front edge
    rl = random.Random(21)
    sA, sB = arch.len * 0.3, arch.len * 0.7
    dl = [(rl.uniform(sA, sB), rl.uniform(0.25, 0.4), rl.uniform(0.15, 0.3)) for _ in range(4)]
    def lo_l(s):
        u = clamp((s - sA) / (sB - sA)); tp = math.sqrt(max(0.0, math.sin(PI * u))); return -0.5 * tp - 0.03
    def hi_l(s):
        u = clamp((s - sA) / (sB - sA)); tp = math.sqrt(max(0.0, math.sin(PI * u)))
        return (0.55 + sum(d * math.exp(-((s - c) / w) ** 2) for c, w, d in dl)) * tp + 0.03
    parts.append(strip_moss('lip_moss', lip.Sfn, sA, sB, int((sB - sA) / 0.16), lo_l, hi_l, 0.05, MOSS, ncross=3))
    # ---- the throat, going down and back into the dark
    throat = Throat(arch, rings=[(0.25, 1.03, 1.02, 0.10), (-0.2, 1.07, 1.04, 0.09), (-0.7, 1.02, 0.97, 0.08),
                                 (-1.3, 0.88, 0.84, 0.07), (-1.8, 0.64, 0.62, 0.07), (-2.15, 0.36, 0.38, 0.08)],
                    back=(-2.35, 0.75), fl0=0.10)
    def throat_paint(part, p, n, meta):
        lz = -p.y; t = clamp((0.25 - lz) / 2.4)
        c = mixc('#3a4740', '#18221e', smooth(t * 2.2))
        c = mixc(c, '#0c1210', smooth((t - 0.35) / 0.65))
        if n.z > 0.6: c = mixc(c, '#2a3430', 0.4 * (1 - t))      # the floor catches a little light at the front
        return c
    parts.append(throat.build(throat_paint))
    # ---- boulders (gate-local x, z; centre height; semi-axes). Colliders: jambs (-2.35,-0.55,1.3) (2.3,-0.5,1.25),
    #      hill (0,-2.2,2.6), small (-3.3,0.6,.55) (3.2,0.7,.5), the mouth block (0,-0.6,1.0)
    B = []
    m = lambda **k: dict(dict(cover=0.7, drips=5, drop=1.0, t=0.07, front=0.6), **k)
    B.append(Boulder('jamb_l', -2.45, -0.45, 0.95, 1.0, 1.1, 1.55, yaw=0.12, exy=0.78, ez=0.66, seed=11,
                     moss=m(cover=0.7, drips=5, t=0.075), carve='side', res=0.38))
    B.append(Boulder('jamb_r', 2.36, -0.5, 0.9, 0.93, 1.04, 1.45, yaw=-0.1, exy=0.8, ez=0.64, seed=12, tone=0.02,
                     moss=m(cover=0.68, drips=5, t=0.075), carve='side', res=0.38))
    B.append(Boulder('lintel_l', -0.78, -0.62, 3.38, 1.18, 0.95, 0.74, hdn=0.62, yaw=0.18, exy=0.76, ez=0.74, seed=13,
                     ground=False, moss=m(cover=0.72, drips=4, t=0.075, front=0.9), carve='up', res=0.32))
    B.append(Boulder('lintel_r', 0.86, -0.55, 3.3, 1.08, 0.9, 0.68, hdn=0.6, yaw=-0.22, exy=0.76, ez=0.74, seed=31,
                     ground=False, moss=m(cover=0.7, drips=4, t=0.075, front=0.9), carve='up', res=0.32, tone=0.03))
    B.append(Boulder('shoulder_l', -1.95, -1.25, 2.9, 0.8, 0.78, 0.72, hdn=0.95, yaw=0.5, seed=14, ground=False,
                     moss=m(cover=0.66, drips=3), carve='side', res=0.38))
    B.append(Boulder('shoulder_r', 2.0, -1.35, 2.75, 0.76, 0.74, 0.66, hdn=0.95, yaw=-0.4, seed=15, ground=False,
                     moss=m(cover=0.64, drips=3), carve='side', res=0.38))
    B.append(Boulder('crest', 0.1, -2.85, 2.0, 1.05, 0.95, 1.75, yaw=0.08, exy=0.78, ez=0.82, seed=16, tone=0.02, taper=0.2,
                     moss=m(cover=0.7, drips=5, t=0.08), carve='back', res=0.42))
    B.append(Boulder('hill_l', -2.12, -1.78, 1.25, 0.8, 0.85, 1.75, yaw=-0.3, seed=17,
                     moss=m(cover=0.68, drips=3), carve='side', res=0.55))
    B.append(Boulder('hill_r', 2.18, -1.88, 1.15, 0.8, 0.85, 1.65, yaw=0.25, seed=18,
                     moss=m(cover=0.66, drips=3), carve='side', res=0.55))
    B.append(Boulder('back_l', -0.95, -3.85, 0.85, 1.2, 0.85, 1.45, yaw=0.2, seed=19, res=0.62,
                     moss=m(cover=0.64, drips=2), carve='back'))
    B.append(Boulder('back_r', 1.0, -4.05, 0.75, 1.05, 0.78, 1.3, yaw=-0.25, seed=20, res=0.62,
                     moss=m(cover=0.64, drips=2), carve='back'))
    # moss beds where the clump and grove of bamboo grow out of the hill (the kit's stands at (-1.3,-2.6), (1.6,-3.0))
    B.append(Boulder('bed_l', -1.3, -2.68, 1.1, 0.7, 0.6, 1.1, seed=21, res=0.36, exy=0.9, ez=0.8,
                     moss=m(cover=0.9, drips=0, t=0.08, nu=14), carve='side'))
    B.append(Boulder('bed_r', 1.6, -3.05, 0.95, 0.66, 0.58, 0.95, seed=22, res=0.36, exy=0.9, ez=0.8,
                     moss=m(cover=0.9, drips=0, t=0.08, nu=14), carve='back'))
    # small rocks round the foot (clear of the ferns at (-2.8,0.9), (2.9,1.0), (3.4,0.2), (-1.2,1.3))
    B.append(Boulder('rock_fl', -3.38, 0.55, 0.12, 0.44, 0.42, 0.46, yaw=0.4, seed=23, res=0.22, exy=0.75, ez=0.7,
                     moss=m(cover=0.58, drips=2, drop=0.6, t=0.055), carve=None))
    B.append(Boulder('rock_fr', 3.3, 0.62, 0.1, 0.3, 0.28, 0.34, yaw=-0.3, seed=24, res=0.2,
                     moss=m(cover=0.42, drips=0, t=0.045), carve=None))
    B.append(Boulder('rock_sl', -1.78, 0.95, 0.05, 0.3, 0.27, 0.3, yaw=0.9, seed=25, res=0.2,
                     moss=m(cover=0.38, drips=0, t=0.04), carve=None))
    B.append(Boulder('rock_sr', 1.82, 1.0, 0.04, 0.27, 0.25, 0.27, yaw=-0.6, seed=26, res=0.2, carve=None))
    B.append(Boulder('rock_bl', -3.42, -0.32, 0.25, 0.44, 0.46, 0.5, yaw=0.3, seed=27, res=0.24,
                     moss=m(cover=0.46, drips=1, drop=0.5, t=0.05), carve=None))
    B.append(Boulder('rock_br', 3.45, -0.42, 0.22, 0.38, 0.42, 0.46, yaw=-0.5, seed=28, res=0.24,
                     moss=m(cover=0.56, drips=2, drop=0.5, t=0.055), carve=None))
    for i, b in enumerate(B):
        paint = ST if i % 2 == 0 else STW
        sp = b.build(paint); parts.append(sp)
        if b.moss: parts.append(boulder_moss(b, MOSS, stone=sp))
    # ---- worn steps up to the mouth (tops 0.035 / 0.085 / 0.135: the hero's feet follow the terrain)
    SP = step_painter(seed=4)
    for k, (z, hx, hz, top, yaw) in enumerate(((1.12, 1.05, 0.25, 0.035, 0.025), (0.7, 0.95, 0.25, 0.085, -0.02), (0.2, 1.42, 0.32, 0.135, 0.0))):
        R = Matrix.Rotation(yaw, 3, 'Z')
        parts.append(slab(f'step_{k}', 'step', SP, hx, hz, top, rc=0.13, rb=0.05, nc=3, dish=0.012, wob=0.015, seed=40 + k,
                          xf=lambda q, z=z, R=R: R @ Vector((q.x, -q.y, q.z)) + L(0, 0, z)))
    # ---- the cave's shimenawa across the arch, above the spring line, with five shide
    ROPE = rope_painter()
    def crp(s, x0=-1.4, x1=1.4, y=2.84, sag=0.2):
        return L(x0 + (x1 - x0) * s, y - math.sin(PI * s) * sag, 0.42)
    rope = Beam(crp, UP, lambda s: 0.08 * (0.78 + 0.4 * math.sin(PI * s)), lambda s: 0.08 * (0.78 + 0.4 * math.sin(PI * s)),
                e=1.0, cap=0.05, twist=(0.14, 0.44))
    parts.append(rope.build('cave_rope', 'rope', ROPE, K=9, step=0.11, capn=1))
    PAPER = flat_painter('#fff6ea', '#f3eadc', shade=0.1)
    for k, t in enumerate((0.2, 0.4, 0.6, 0.8)):
        top = crp(t) + Vector((0, -0.1, -0.07))
        parts += zigzag_shide(f'cave_shide_{k}', top, PAPER, scale=0.9)
    # ---- the torii (kit layout: z 1.75, w 3.0, h 3.1)
    parts += torii(z=1.75, w=3.0, h=3.1, moss_top=False)
    # ---- flowers on the moss (cast down onto the caps)
    V, Fc, kinds = [], [], []
    for p in parts:
        if p.kind not in ('moss', 'stone', 'lip', 'torii', 'rope', 'step'): continue
        b0 = len(V); V += p.v
        for f in p.f:
            tri = [[f[0], f[1], f[2]]] if len(f) == 3 else [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]
            for t in tri: Fc.append([i + b0 for i in t]); kinds.append(p.kind)
    mb = BVHTree.FromPolygons(V, Fc)
    fl = [(-2.62, -0.2, '#f590b8'), (-2.42, -0.05, '#fff1e2'), (-2.66, 0.02, '#f590b8'),
          (2.45, -0.3, '#b996ee'), (2.36, -0.42, '#fff1e2')]
    for k, (x, z, c) in enumerate(fl):
        h = mb.ray_cast(L(x, 12, z), Vector((0, 0, -1)), 30)
        if h[0] is None or kinds[h[2]] != 'moss': print('GATES flower not on moss', x, z, h[2] is not None and kinds[h[2]]); continue
        n = h[1] if h[1].z > 0 else -h[1]
        parts.append(flower(f'flower_{k}', h[0] + n * 0.005, n, 0.11 + 0.02 * (k % 3), c, '#ffd166', seed=k))
    colliders = [[-2.35, -0.55, 1.3], [2.3, -0.5, 1.25], [0, -2.2, 2.6], [-3.3, 0.6, 0.55], [3.2, 0.7, 0.5], [0, -0.6, 1.0]]
    spots = [('lantern_l', -2.55, 1.55, 0.32, 'clear'), ('lantern_r', 2.55, 1.55, 0.32, 'clear'),
             ('fern', -2.8, 0.9, 0.12, 'clear'), ('fern', 2.9, 1.0, 0.12, 'clear'), ('fern', -1.2, 1.3, 0.12, 'clear'),
             ('fern', 3.4, 0.2, 0.12, 'clear'), ('bamboo_young', -3.6, -1.6, 0.3, 'clear'), ('bamboo_young', 3.7, -1.4, 0.3, 'clear'),
             ('bamboo_clump (grows out of the moss bed)', -1.3, -2.6, 0.2, 'bed'), ('bamboo_grove (grows out of the moss bed)', 1.6, -3.0, 0.2, 'bed'),
             ('spirit_lantern', 4.1, 2.7, 0.5, 'clear'), ('interact', 0, 2.8, 0.5, 'clear')]
    return parts, arch, mouth, colliders, spots, throat, colliders[-1]

# ================================================================== the maple gate
def build_maple():
    """the Maple Roots (gates/maple.js): a hollow in a bank of earth and stone under a great maple; two huge roots pour
    down the bank, arch over the mouth and cross at its crown; leaf litter drifted on the tops; the vermilion torii;
    a shimenawa across the roots. Everything sits BACK = 1.2 m further out in local z (the file's lp shift)."""
    BK = 1.2
    parts = []
    ST = stone_painter('#6c645e', '#958c84', '#b8aea4', warm='#c8c0b8', seed=3)
    STW = stone_painter('#68605c', '#918882', '#b2a9a0', warm='#c8c0b8', seed=4)
    LITTER = litter_painter(seed=5)
    arch = Arch(a=1.48, ys=1.9, b=1.02, n=4.0)
    mouth = {'lz': 0.24 + BK, 'w': 2.5, 'h': 2.7}
    # the earth rim behind the roots (it only shows low at the jambs)
    lip = Lip(arch, zc=0.02 + BK, w=0.38, D=0.42, e=0.62, seed=9, zfoot=0.04)
    LIPP = stone_painter('#4e3e34', '#6e5a4c', '#94806e', warm='#c8a888', seed=6)
    def lip_paint(part, p, n, meta):
        c = LIPP(part, p, n, meta)
        if meta and meta[0] is not None:
            c = mixc(c, '#2e2018', clamp(-math.cos(meta[0])) ** 1.5 * 0.55)
        return c
    parts.append(lip.build(lip_paint, step=0.5, K=6))
    throat = Throat(arch, rings=[(0.25 + BK, 1.03, 1.02, 0.10), (-0.2 + BK, 1.07, 1.04, 0.09), (-0.7 + BK, 1.02, 0.97, 0.08),
                                 (-1.3 + BK, 0.88, 0.84, 0.07), (-1.8 + BK, 0.64, 0.62, 0.07), (-2.15 + BK, 0.36, 0.38, 0.08)],
                    back=(-2.35 + BK, 0.75), fl0=0.10)
    def throat_paint(part, p, n, meta):
        lz = -p.y - BK; t = clamp((0.25 - lz) / 2.4)
        c = mixc('#4a3628', '#1e1510', smooth(t * 2.2))
        c = mixc(c, '#0e0a08', smooth((t - 0.35) / 0.65))
        if n.z > 0.6: c = mixc(c, '#3a2a20', 0.4 * (1 - t))
        return c
    parts.append(throat.build(throat_paint))
    # ---- the bank (hollow-frame x, z; +BK). Colliders (hollow frame): jambs (-2.4,-0.6,1.3) (2.35,-0.55,1.25),
    #      hill (0,-2.3,2.7), small (-3.4,0.6,.55) (3.3,0.7,.5), mouth (0,-0.6,1.0), root feet (+-1.55,0.25,.3)
    m = lambda **k: dict(dict(cover=0.7, drips=5, drop=1.0, t=0.07, front=0.6), **k)
    B = []
    B.append(Boulder('jamb_l', -2.5, -0.5 + BK, 0.95, 1.0, 1.1, 1.5, yaw=0.15, exy=0.8, ez=0.72, seed=51,
                     moss=m(cover=0.62, drips=5, t=0.075), carve='side', res=0.38))
    B.append(Boulder('jamb_r', 2.42, -0.52 + BK, 0.9, 0.95, 1.05, 1.42, yaw=-0.12, exy=0.82, ez=0.72, seed=52, tone=0.02,
                     moss=m(cover=0.62, drips=5, t=0.075), carve='side', res=0.38))
    B.append(Boulder('lintel_l', -0.8, -0.78 + BK, 3.32, 1.15, 0.92, 0.72, hdn=0.6, yaw=0.2, exy=0.8, ez=0.76, seed=53,
                     ground=False, moss=m(cover=0.62, drips=4, t=0.075, front=0.9), carve='up', res=0.34))
    B.append(Boulder('lintel_r', 0.85, -0.72 + BK, 3.25, 1.05, 0.9, 0.68, hdn=0.6, yaw=-0.2, exy=0.8, ez=0.76, seed=54,
                     ground=False, moss=m(cover=0.62, drips=4, t=0.075, front=0.9), carve='up', res=0.34, tone=0.03))
    B.append(Boulder('shoulder_l', -2.0, -1.35 + BK, 2.85, 0.8, 0.78, 0.7, hdn=0.95, yaw=0.5, seed=55, ground=False,
                     moss=m(cover=0.62, drips=3), carve='side', res=0.4))
    B.append(Boulder('shoulder_r', 2.05, -1.4 + BK, 2.7, 0.76, 0.74, 0.66, hdn=0.95, yaw=-0.4, seed=56, ground=False,
                     moss=m(cover=0.62, drips=3), carve='side', res=0.4))
    B.append(Boulder('crest', 0.1, -2.8 + BK, 2.1, 1.25, 1.0, 1.8, yaw=0.1, exy=0.8, ez=0.82, seed=57, taper=0.2,
                     moss=m(cover=0.62, drips=5, t=0.08), carve='back', res=0.5))
    B.append(Boulder('hill_l', -2.15, -1.85 + BK, 1.2, 0.82, 0.88, 1.7, yaw=-0.3, seed=58,
                     moss=m(cover=0.62, drips=3), carve='side', res=0.55))
    B.append(Boulder('hill_r', 2.2, -1.95 + BK, 1.1, 0.82, 0.88, 1.6, yaw=0.25, seed=59,
                     moss=m(cover=0.62, drips=3), carve='side', res=0.55))
    B.append(Boulder('back_l', -1.0, -3.9 + BK, 0.85, 1.25, 0.85, 1.45, yaw=0.2, seed=60, res=0.62,
                     moss=m(lobes=False, nu=10, cover=0.62, drips=2), carve='back'))
    B.append(Boulder('back_r', 1.05, -4.1 + BK, 0.75, 1.1, 0.8, 1.3, yaw=-0.25, seed=61, res=0.62,
                     moss=m(lobes=False, nu=10, cover=0.62, drips=2), carve='back'))
    # small stones round the foot (the kit's step-side stones would stand on the jizo, so they go)
    B.append(Boulder('rock_fl', -3.45, 0.55 + BK, 0.12, 0.44, 0.42, 0.46, yaw=0.4, seed=62, res=0.22,
                     moss=None, carve=None))
    B.append(Boulder('rock_fr', 3.38, 0.62 + BK, 0.1, 0.4, 0.38, 0.42, yaw=-0.3, seed=63, res=0.22,
                     moss=None, carve=None))
    B.append(Boulder('rock_bl', -3.5, -0.35 + BK, 0.25, 0.45, 0.46, 0.5, yaw=0.3, seed=64, res=0.24,
                     moss=None, carve=None))
    B.append(Boulder('rock_br', 3.55, -0.6 + BK, 0.22, 0.4, 0.42, 0.46, yaw=-0.5, seed=65, res=0.24, carve=None))
    for i, b in enumerate(B):
        sp = b.build(ST if i % 2 == 0 else STW); parts.append(sp)
        if b.moss: parts += litter_cap(b, LITTER, stone=sp)
    # ---- the two great roots: from a flared foot beside the mouth, up the jamb hugging the arch, over the crown,
    #      out over the far shoulder and up the bank into the crest. The front root (e = +1) crosses low and in front
    #      at the crown, the back one (e = -1) high and behind; a dark contact shadow where they touch.
    roots = {}
    RIMD = Vector((0, -0.45, 0.89)).normalized()
    def bark_painter(e):
        def paint(part, p, n, meta):
            a, v = (meta[1], meta[2]) if meta and meta[0] == 'beam' and meta[1] is not None else (0.0, 0.0)
            fur = math.cos(3 * a + v * 0.55 + 0.5 * math.sin(v * 1.3 + e))          # bark furrows, a slow twist along it
            c = mixc('#6e4a30', '#b0805a', smooth(n.z * 0.85 + 0.3))
            c = mixc(c, '#4a3020', smooth((fur - 0.25) / 0.5) * (0.85 - 0.35 * clamp(n.z)))
            c = mulc(c, 0.88 + 0.16 * clamp(n.dot(LDIR) * 0.5 + 0.5))
            rim = n.dot(RIMD)                                                     # a warm rim along the upper edge
            c = mixc(c, '#e2ac78', sstep(0.78, 0.95, rim) * 0.55)
            for ks in part.knots:                                                 # knots: a dark eye ringed lighter
                d = (p - ks).length
                if d < 0.3: c = mixc(c, '#3a2418', smooth((0.3 - d) / 0.2) * 0.7)
            o = roots.get(-e)
            if o is not None:
                hit = o.find_nearest(p)
                if hit[0] is not None and hit[3] < 0.22: c = mixc(c, '#24160e', smooth((0.22 - hit[3]) / 0.22) * 0.8)
            return c
        return paint
    def lump_r(base, L, ph, knots):
        def r(s):
            v = s * L
            k = 1 + 0.07 * math.sin(v * 1.9 + ph) + 0.05 * math.sin(v * 3.1 + 2 * ph)
            return base(s) * k + sum(0.07 * math.exp(-((s - sk) * L / 0.2) ** 2) for sk in knots)
        return r
    built = []
    for e in (1, -1):              # e = +1: the foot on the left (x < 0), the far shoulder on the right
        ctrl = [(L(-e * 2.2, -0.12, -0.15 + BK), 0.58), (L(-e * 2.02, 0.16, -0.15 + BK), 0.54)]
        s0 = next(s for s in [arch.len * k / 2000 for k in range(2001)] if arch.C(s).y >= 0.6)
        s1 = next(s for s in [arch.len * k / 2000 for k in range(2001)] if arch.C(s).y >= 2.45 and arch.C(s).x > 0)
        samples = [s0 + (s1 - s0) * k / 9 for k in range(10)]
        if e < 0: samples = [arch.len - s for s in samples]
        for s in samples:
            c, nn = arch.C(s), arch.N(s)
            x = c.x * e
            r = 0.36 + 0.14 * (1 - smooth(c.y / 2.7))
            cz = math.exp(-(c.x / 0.75) ** 2)
            # the two swap just right of the crown (the crossing: front low and in front); elsewhere a clear gap
            if e > 0:   # front: hugs the arch over the crown, swings well out over the far shoulder
                out = 0.85 * smooth((x - 0.2) / 0.9); z = -0.06 + 0.25 * cz - 0.2 * smooth((x - 0.5) / 0.8)
            else:       # back: rides well out over the crown and its far shoulder, behind
                out = 0.85 * smooth((x + 0.6) / 0.9); z = -0.06 - 0.3 * cz
            ctrl.append((L(c.x + nn.x * (r + out), c.y + nn.y * (r + out), z + BK), r))
        ctrl += [(L(e * 2.05, 3.5, -0.6 + BK), 0.4), (L(e * 1.65, 3.85, -1.35 + BK), 0.42), (L(e * 1.05, 3.65, -2.1 + BK), 0.45)]
        path, rad = spline(ctrl)
        Lr = sum((path((k + 1) / 200) - path(k / 200)).length for k in range(200))
        kn = [0.18, 0.47, 0.83] if e > 0 else [0.28, 0.66]
        rr = lump_r(rad, Lr, 1.3 + e, kn)
        root = Beam(path, FRONT, rr, rr, e=1.0, cap=0.14)
        rp = root.build(f'root_{e}', 'root', bark_painter(e), K=12, step=0.27, capn=2)
        # the knot eyes sit on the root's front-facing surface
        rp.knots = [path(sk) + Vector((0, -1, 0.35)).normalized() * rr(sk) for sk in kn]
        parts.append(rp); built.append((e, rp))
        # rootlets splaying from the foot into the ground (clear of the jizo at (+-1.9, 0.9))
        fx = -e * 2.06
        for k, (dx, dz, ln) in enumerate(((-e * 1.0, 0.0, 0.95), (-e * 0.5, -0.86, 0.8))):
            d = Vector((dx, 0, dz)).normalized()
            rc = [(L(fx, 0.15, -0.15 + BK), 0.22), (L(fx + d.x * ln * 0.55, 0.06, -0.15 + d.z * ln * 0.55 + BK), 0.14),
                  (L(fx + d.x * ln, -0.22, -0.15 + d.z * ln + BK), 0.08)]
            pth, rr2 = spline(rc, per=10)
            rl = Beam(pth, UP, rr2, rr2, e=1.0, cap=0.06)
            lp_ = rl.build(f'rootlet_{e}_{k}', 'root', bark_painter(e), K=8, step=0.24, capn=1); lp_.knots = []
            parts.append(lp_)
    for e, rp in built:            # each root's contact shadow looks the other root up
        Fc = []
        for f in rp.f:
            Fc += [f] if len(f) == 3 else [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]
        roots[e] = BVHTree.FromPolygons(rp.v, Fc)
    # ---- worn steps up to the mouth (a little red litter on them)
    SP = step_painter(top='#c9bba8', side='#a0907e', mossc='#b8502e', seed=8)
    for k, (z, hx, hz, top, yaw) in enumerate(((1.12, 1.05, 0.25, 0.035, 0.02), (0.7, 0.95, 0.25, 0.085, -0.025), (0.2, 1.42, 0.32, 0.135, 0.0))):
        R = Matrix.Rotation(yaw, 3, 'Z')
        parts.append(slab(f'step_{k}', 'step', SP, hx, hz, top, rc=0.13, rb=0.05, nc=3, dish=0.012, wob=0.015, seed=70 + k,
                          xf=lambda q, z=z, R=R: R @ Vector((q.x, -q.y, q.z)) + L(0, 0, z + BK)))
    # ---- the shimenawa across the roots, high under the crown so it reads above the kasagi, four shide
    ROPE = rope_painter()
    def crp(s, x0=-1.36, x1=1.36, y=2.86, sag=0.2):
        return L(x0 + (x1 - x0) * s, y - math.sin(PI * s) * sag, 0.64 + BK)
    rope = Beam(crp, UP, lambda s: 0.08 * (0.78 + 0.4 * math.sin(PI * s)), lambda s: 0.08 * (0.78 + 0.4 * math.sin(PI * s)),
                e=1.0, cap=0.05, twist=(0.14, 0.44))
    parts.append(rope.build('cave_rope', 'rope', ROPE, K=9, step=0.14, capn=1))
    PAPER = flat_painter('#fff6ea', '#f3eadc', shade=0.1)
    for k, t in enumerate((0.2, 0.4, 0.6, 0.8)):
        parts += zigzag_shide(f'cave_shide_{k}', crp(t) + Vector((0, -0.1, -0.07)), PAPER, scale=0.9)
    # ---- the torii (the file: lp(0, 1.85) -> local z 3.05)
    parts += torii(z=1.85 + BK, w=3.0, h=3.1, moss_top=False)
    # ---- maple leaves drifted on the litter caps and caught on the roots
    V, Fc, kinds = [], [], []
    for p in parts:
        if p.kind not in ('moss', 'stone', 'lip', 'torii', 'rope', 'step', 'root'): continue
        b0 = len(V); V += p.v
        for f in p.f:
            tri = [[f[0], f[1], f[2]]] if len(f) == 3 else [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]
            for t in tri: Fc.append([i + b0 for i in t]); kinds.append(p.kind)
    mb = BVHTree.FromPolygons(V, Fc)
    lv = [(-2.62, 0.75), (-2.3, 0.98), (2.5, 0.72), (2.24, 0.9), (-0.65, 0.42), (0.9, 0.48), (-2.0, -0.3),
          ('g', -2.3, 2.4), ('g', -1.55, 2.6), ('g', 2.3, 2.45), ('g', 1.5, 2.65)]
    lc = ['#b8302a', '#e0702a', '#e8a83a', '#c84a2a', '#8a4a2a']
    for k, it in enumerate(lv):
        if it[0] == 'g':      # on the ground at the jambs
            at, n = L(it[1], 0.0, it[2]), Vector((0, 0, 1))
        else:
            h = mb.ray_cast(L(it[0], 12, it[1]), Vector((0, 0, -1)), 30)
            if h[0] is None or kinds[h[2]] != 'moss': print('GATES leaf not on litter', it, h[2] is not None and kinds[h[2]]); continue
            at, n = h[0], (h[1] if h[1].z > 0 else -h[1])
        parts.append(maple_leaf(f'leaf_{k}', at + n * 0.004, n, 0.11 + 0.01 * (k % 3), lc[k % len(lc)], seed=40 + k))
    colliders = [[x, z + BK, r] for x, z, r in [[-2.4, -0.6, 1.3], [2.35, -0.55, 1.25], [0, -2.3, 2.7], [-3.4, 0.6, 0.55],
                                               [3.3, 0.7, 0.5], [0, -0.6, 1.0], [-1.55, 0.25, 0.3], [1.55, 0.25, 0.3]]]
    spots = [('lantern_post_l', -2.6, 1.5 + BK, 0.22, 'clear'), ('lantern_post_r', 2.6, 1.5 + BK, 0.22, 'clear'),
             ('jizo_l', -1.9, 0.9 + BK, 0.28, 'clear'), ('jizo_r', 1.9, 0.9 + BK, 0.28, 'clear'),
             ('leaf_pile', -3.0, 1.2 + BK, 0.4, 'clear'), ('leaf_pile', 3.1, 1.3 + BK, 0.35, 'clear'),
             ('leaf_pile', -1.0, 1.6 + BK, 0.25, 'clear'), ('leaf_pile', 3.6, 0.0 + BK, 0.3, 'clear'),
             ('mushrooms', -2.3, 1.9 + BK, 0.15, 'clear'), ('mushrooms', 2.5, 2.1 + BK, 0.15, 'clear'), ('mushrooms', 1.2, 1.4 + BK, 0.15, 'clear'),
             ('maple_tree', -3.7, -2.2 + BK, 0.5, 'clear'), ('spirit_lantern', 4.1, 2.7, 0.5, 'clear'), ('interact', 0, 2.8, 0.5, 'clear')]
    return parts, arch, mouth, colliders, spots, throat, colliders[5]

def strata_painter(base, band=0.55, k=0.86, wet=None, wet_h=0.5, seed=0):
    """wraps a stone painter: darker strata bands every `band` m (tilted, wavy) and a wet darker foot"""
    def paint(part, p, n, meta):
        c = base(part, p, n, meta)
        s = math.sin((p.z + 0.12 * math.sin(p.x * 0.9 + seed) + 0.05 * p.x) * TAU / band)
        if s > 0.72: c = mulc(c, k)
        if wet and p.z < wet_h: c = mixc(c, wet, 0.45 * clamp((wet_h - p.z) / wet_h))
        return c
    return paint

def coast_painter(base, seed=0):
    """sea-cliff rock: two or three soft strata bands, a darker wet band along the bottom 0.3 m"""
    def paint(part, p, n, meta):
        c = base(part, p, n, meta)
        y = p.z + 0.15 * math.sin(p.x * 0.7 + seed) + 0.04 * p.x
        for b0 in (0.75, 1.85, 3.1):
            d = abs(y - b0)
            if d < 0.26: c = mixc(c, '#948672', smooth((0.26 - d) / 0.18) * 0.55)
        wet = 0.3 + 0.04 * math.sin(p.x * 3.1 + p.y * 2.3 + seed)
        if p.z < wet: c = mixc(c, '#76705e', 0.55 * smooth((wet - p.z) / 0.08))
        return c
    return paint

def limpet(parts, name, at, n, r=0.05):
    p = Part(name, 'flower', ao=0.35)
    z = n.normalized(); xa = (Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))).cross(z).normalized(); ya = z.cross(xa)
    ring = [p.add_v(at + (xa * math.cos(TAU * j / 8) + ya * math.sin(TAU * j / 8)) * r - z * 0.005, ('r',)) for j in range(8)]
    apex = p.add_v(at + z * r * 0.75 + xa * r * 0.15, ('a',))
    for j in range(8): p.add_f([apex, ring[j], ring[(j + 1) % 8]], z)
    p.paint = lambda part, pp, nn, meta: mulc(hexc('#c8b8a0' if meta and meta[0] == 'a' else '#8a7a68'), 0.85 + 0.15 * clamp(nn.dot(LDIR) * 0.5 + 0.5))
    parts.append(p)

def scallop(parts, name, at, n, r=0.075, col='#f2b89a', seed=0):
    p = Part(name, 'flower', ao=0.3)
    rnd = random.Random(seed)
    z = n.normalized(); xa = (Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))).cross(z).normalized(); ya = z.cross(xa)
    rot = rnd.uniform(0, TAU); hinge = at - (xa * math.cos(rot) + ya * math.sin(rot)) * r * 0.5
    rim = []
    for j in range(9):
        a = rot - 1.25 + 2.5 * j / 8
        rim.append(p.add_v(hinge + (xa * math.cos(a) + ya * math.sin(a)) * r + z * 0.008, ('r', j)))
    top = p.add_v(hinge + (xa * math.cos(rot) + ya * math.sin(rot)) * r * 0.45 + z * 0.03, ('t', 0))
    h0 = p.add_v(hinge + z * 0.006, ('t', 0))
    for j in range(8):
        p.add_f([top, rim[j], rim[j + 1]], z)
    p.add_f([h0, rim[0], top], z); p.add_f([h0, top, rim[8]], z)
    c0, c1 = hexc(col), mulc(col, 0.8)
    p.paint = lambda part, pp, nn, meta: (c1 if meta and meta[0] == 'r' and meta[1] % 2 else c0)
    parts.append(p)

def barnacles(parts, name, at, n, count, spread, seed=0):
    """a cluster of barnacles on a surface: small cream cones with dark mouths"""
    rnd = random.Random(seed)
    z = n.normalized(); xa = (Vector((1, 0, 0)) if abs(z.x) < 0.9 else Vector((0, 1, 0))).cross(z).normalized(); ya = z.cross(xa)
    p = Part(name, 'flower', ao=0.4)
    for k in range(count):
        a, d = rnd.uniform(0, TAU), spread * math.sqrt(rnd.random())
        c = at + (xa * math.cos(a) + ya * math.sin(a)) * d
        r = rnd.uniform(0.035, 0.055); h = r * 0.9
        ring = [p.add_v(c + (xa * math.cos(TAU * j / 5) + ya * math.sin(TAU * j / 5)) * r - z * 0.01, ('s',)) for j in range(5)]
        top = [p.add_v(c + (xa * math.cos(TAU * j / 5) + ya * math.sin(TAU * j / 5)) * r * 0.45 + z * h, ('s',)) for j in range(5)]
        hole = p.add_v(c + z * (h * 0.6), ('h',))
        for j in range(5):
            j1 = (j + 1) % 5
            q = [ring[j], ring[j1], top[j1], top[j]]
            cc = sum((p.v[i] for i in q), Vector()) / 4
            p.add_f(q, cc - (c - z * 0.05))
            p.add_f([hole, top[j], top[j1]], z)
    def paint(part, pp, nn, meta):
        if meta and meta[0] == 'h': return hexc('#3a3430')
        return mulc(hexc('#e8dcc4'), 0.82 + 0.18 * clamp(nn.dot(LDIR) * 0.5 + 0.5))
    p.paint = paint
    parts.append(p)

# ================================================================== the tidepool gate
def build_tidepool():
    """the Tide Caves (gates/tidepool.js): a sea-cave arch in a banded sea cliff with sea stacks beside it; grass on the
    tops, barnacles at the foot; the driftwood rope gate with glass floats in their nets; the glowing tide pool"""
    parts = []
    ST = coast_painter(stone_painter('#9a8c78', '#c4b6a0', '#e2d6c0', warm='#f0e2c8', seed=7), seed=1)
    STW = coast_painter(stone_painter('#968874', '#c0b29c', '#ded2bc', warm='#f0e2c8', seed=8), seed=2)
    GRASS = moss_painter(lo='#66843f', mid='#8aa65a', hi='#b4c87a', warm='#b8c060', cool='#6a9a68', hue=0.05, seed=9)
    def tuft_paint(part, p, n, meta):
        t = meta[1] if meta and meta[0] == 'g' else 0.5
        return mulc(mixc('#66843f', '#b4c87a', smooth(t)), 0.9 + 0.12 * clamp(n.dot(LDIR) * 0.5 + 0.5))
    arch = Arch(a=1.6, ys=1.8, b=1.0, n=4.5)
    mouth = {'lz': 0.4, 'w': 2.8, 'h': 2.6}
    lip = Lip(arch, zc=0.22, w=1.5, D=1.5, e=1.0, seed=17, zfoot=-0.1)
    LP = coast_painter(stone_painter('#968874', '#c0b29c', '#e0d4be', warm='#f0e2c8', seed=10), seed=3)
    def lip_paint(part, p, n, meta):
        c = LP(part, p, n, meta)
        if meta and meta[0] is not None: c = mixc(c, '#3a4a48', clamp(-math.cos(meta[0])) ** 1.5 * 0.5)
        return c
    parts.append(lip.build(lip_paint, step=0.34, K=12))
    rl = random.Random(31)
    sA, sB = arch.len * 0.33, arch.len * 0.67
    dl = [(rl.uniform(sA, sB), rl.uniform(0.25, 0.4), rl.uniform(0.05, 0.12)) for _ in range(3)]
    def lo_l(s):
        u = clamp((s - sA) / (sB - sA)); tp = math.sqrt(max(0.0, math.sin(PI * u))); return -0.7 * tp - 0.03
    def hi_l(s):
        u = clamp((s - sA) / (sB - sA)); tp = math.sqrt(max(0.0, math.sin(PI * u)))
        return (0.45 + sum(d * math.exp(-((s - c) / w) ** 2) for c, w, d in dl)) * tp + 0.03
    parts.append(strip_moss('lip_grass', lip.Sfn, sA, sB, int((sB - sA) / 0.2), lo_l, hi_l, 0.06, GRASS, ncross=3))
    throat = Throat(arch, rings=[(0.15, 1.04, 1.03, 0.10), (-0.4, 1.07, 1.04, 0.09), (-0.95, 1.02, 0.97, 0.08),
                                 (-1.65, 0.88, 0.84, 0.07), (-2.25, 0.64, 0.62, 0.07), (-2.65, 0.36, 0.38, 0.08)],
                    back=(-2.85, 0.75), fl0=0.10)
    def throat_paint(part, p, n, meta):
        lz = -p.y; t = clamp((0.15 - lz) / 2.8)
        c = mixc('#1d5a64', '#0a2830', smooth(t * 2.2))
        c = mixc(c, '#04101a', smooth((t - 0.4) / 0.6))
        if n.z > 0.6: c = mixc(c, '#2a6a6a', 0.35 * (1 - t))
        return c
    parts.append(throat.build(throat_paint))
    for k, (x, z, h, r, col) in enumerate(((-1.15, -0.55, 0.42, 0.075, '#6ff0e8'), (1.2, -0.75, 0.36, 0.07, '#6ff0e8'),
                                           (-0.85, -1.35, 0.3, 0.06, '#6ff0e8'), (0.9, -1.5, 0.34, 0.065, '#6ff0e8'), (-0.2, -1.95, 0.26, 0.055, '#6ff0e8'))):
        parts.append(crystal(f'plankton_{k}', L(x, 0.08, z), h, r, col, tilt=(0.15 * (k % 2 * 2 - 1), 0.25 * (1 if x < 0 else -1))))
    m = lambda **k: dict(dict(cover=0.62, drips=0, t=0.06, front=0.5, tufts=4, tuft_paint=tuft_paint), **k)
    B = []
    B.append(Boulder('leg_l', -3.55, -0.85, 1.3, 1.2, 1.0, 2.3, yaw=0.12, exy=0.8, ez=0.72, seed=81, moss=m(), carve='side', res=0.4))
    B.append(Boulder('leg_r', 3.5, -0.9, 1.25, 1.15, 1.0, 2.2, yaw=-0.1, exy=0.8, ez=0.72, seed=82, moss=m(), carve='side', res=0.4))
    B.append(Boulder('crown_l', -1.25, -0.75, 3.95, 1.35, 1.05, 0.8, hdn=0.8, yaw=0.15, ground=False, seed=83, moss=m(tufts=5), carve='up', res=0.38))
    B.append(Boulder('crown_r', 1.3, -0.85, 3.85, 1.3, 1.0, 0.75, hdn=0.8, yaw=-0.2, ground=False, seed=84, moss=m(tufts=5), carve='up', res=0.38))
    B.append(Boulder('roof', 0.0, -1.95, 3.4, 1.7, 1.1, 0.9, hdn=0.9, yaw=0.05, ground=False, seed=85, moss=m(cover=0.62), carve='up', res=0.45))
    B.append(Boulder('cheek_l', -2.4, -1.9, 1.5, 0.95, 1.15, 1.9, yaw=0.2, seed=86, moss=m(), carve='side', res=0.48))
    B.append(Boulder('cheek_r', 2.45, -2.0, 1.45, 0.95, 1.15, 1.85, yaw=-0.2, seed=87, moss=m(), carve='side', res=0.48))
    # the sea stacks: tall banded columns (the kit's five), narrower at the top, grass on their crowns
    for k, (x, z, R, H, res) in enumerate(((-5.6, -1.75, 1.15, 4.6, 0.55), (5.55, -1.9, 1.1, 4.3, 0.55),
                                           (-2.3, -4.0, 1.8, 5.2, 0.75), (2.6, -4.2, 1.75, 5.0, 0.75), (0.1, -5.3, 2.1, 5.9, 0.85))):
        B.append(Boulder(f'stack_{k}', x, z, H * 0.5, R, R * 0.92, H * 0.5, yaw=k * 1.3, exy=0.9, ez=0.5, lump=0.06, taper=0.28,
                         seed=88 + k, moss=m(cover=0.6, tufts=4), carve='back', res=res))
    for i, b in enumerate(B):
        sp = b.build(ST if i % 2 == 0 else STW); parts.append(sp)
        if b.moss:
            mp = boulder_moss(b, GRASS, stone=sp); parts.append(mp)
            if getattr(mp, 'tufts', None): parts.append(mp.tufts)
    # ---- the driftwood rope gate at z 2.2: posts on stone feet, caps, glass floats in nets, a sagging shimenawa
    WOOD = lambda part, p, n, meta: mixc(mulc(mixc('#a8987e', '#d6cab2', smooth(n.z * 0.5 + 0.5)),
                                              0.84 + 0.2 * clamp(n.dot(LDIR) * 0.5 + 0.5)), '#8a7a64',
                                         0.5 * smooth((math.cos(4 * (meta[1] or 0) + p.z * 3.1) - 0.4) / 0.5) if meta and meta[0] == 'beam' else 0) \
        if p.z > 0.55 else mixc('#7a8070', '#a8987e', clamp(p.z / 0.55))
    FOOT = strata_painter(stone_painter('#7a7464', '#a89c88', '#cfc4ae', seed=11), seed=4)
    CAP = flat_painter('#7a6452', shade=0.15)
    for sx in (-1, 1):
        x0 = sx * 1.65
        post = Beam(lambda s, x0=x0, sx=sx: L(x0 + sx * 0.06 * s + 0.03 * math.sin(s * 5), -0.3 + 3.6 * s, 2.2 + 0.02 * math.sin(s * 4)),
                    Vector((1, 0, 0)), lambda s: 0.2 - 0.05 * s + 0.015 * math.sin(s * 9), lambda s: 0.2 - 0.05 * s + 0.015 * math.sin(s * 9),
                    e=1.0, cap=0.05)
        parts.append(post.build(f'dpost_{sx}', 'torii', WOOD, K=10, step=0.45, capn=1))
        parts.append(lathe(f'dfoot_{sx}', 'torii', FOOT, L(x0, 0, 2.2), [(0.62, GROUND), (0.6, 0.0), (0.56, 0.2), (0.46, 0.32), (0.3, 0.37)], K=12))
        parts.append(lathe(f'dcap_{sx}', 'torii', CAP, L(x0 + sx * 0.06, 3.28, 2.2), [(0.17, -0.02), (0.25, 0.04), (0.14, 0.2), (0.03, 0.32)], K=10))
        for (dy, dz, c) in ((2.25, 0.2, '#8fe0c8'), (1.85, 0.16, '#f0c070')):
            parts += glass_float(f'float_{sx}_{dy}', L(x0 + sx * 0.04, dy, 2.2 + dz), 0.17, c)
    ROPE = rope_painter()
    def grp(s, x0=-1.6, x1=1.6, y=2.82, sag=0.32):
        return L(x0 + (x1 - x0) * s, y - math.sin(PI * s) * sag, 2.26)
    rope = Beam(grp, UP, lambda s: 0.085 * (0.78 + 0.4 * math.sin(PI * s)), lambda s: 0.085 * (0.78 + 0.4 * math.sin(PI * s)),
                e=1.0, cap=0.05, twist=(0.14, 0.44))
    parts.append(rope.build('gate_rope', 'rope', ROPE, K=9, step=0.14, capn=1))
    PAPER = flat_painter('#fff6ea', '#f3eadc', shade=0.1)
    for k, t in enumerate((0.2, 0.4, 0.6, 0.8)):
        parts += zigzag_shide(f'gate_shide_{k}', grp(t) + Vector((0, -0.1, -0.07)), PAPER, scale=0.9)
    # ---- barnacles at the foot of the arch and the legs, and on the pool's stones
    V, Fc = [], []
    for p in parts:
        if p.kind not in ('stone', 'lip', 'step'): continue
        b0 = len(V); V += p.v
        for f in p.f: Fc += [[i + b0 for i in f]] if len(f) == 3 else [[f[0] + b0, f[1] + b0, f[2] + b0], [f[0] + b0, f[2] + b0, f[3] + b0]]
    mb = BVHTree.FromPolygons(V, Fc)
    # barnacle clusters, limpets and shells in the crevices at the waterline (0-0.6 m)
    def front_hit(x, h):
        hit = mb.ray_cast(L(x, h, 7), Vector((0, 1, 0)), 14)
        return hit if hit[0] is not None else None
    bpts = [(-2.75, 0.45), (2.6, 0.5), (-3.9, 0.3), (3.95, 0.35), (-1.95, 0.55), (2.0, 0.45), (-2.3, 0.2), (2.35, 0.25),
            (-3.2, 0.5), (3.15, 0.4), (-4.6, 0.25), (4.55, 0.3), (-5.6, 0.35), (5.5, 0.4), (-1.75, 0.15), (1.8, 0.2)]
    for k, (x, h) in enumerate(bpts):
        hit = front_hit(x, h)
        if hit is None: print('GATES barnacle miss', x, h); continue
        barnacles(parts, f'barn_{k}', hit[0], hit[1], 5 if k < 6 else 4, 0.2, seed=200 + k)
    for k, (x, h) in enumerate(((-2.55, 0.32), (2.45, 0.38), (-3.55, 0.18), (3.6, 0.22), (-2.05, 0.3), (2.15, 0.12),
                                (-4.2, 0.4), (4.25, 0.15), (-1.85, 0.42), (1.9, 0.35))):
        hit = front_hit(x, h)
        if hit is not None: limpet(parts, f'limpet_{k}', hit[0], hit[1], r=0.045 + 0.01 * (k % 3))
    for k, (x, h, c) in enumerate(((-2.9, 0.12, '#f2b89a'), (2.8, 0.15, '#f4d0b0'), (-3.75, 0.1, '#e8a4a0'), (3.8, 0.12, '#f2b89a'), (-1.9, 0.08, '#f4d0b0'))):
        hit = front_hit(x, h)
        if hit is not None: scallop(parts, f'shell_{k}', hit[0], hit[1], r=0.07 + 0.01 * (k % 2), col=c, seed=300 + k)
    colliders = [[-3.4, 0, 1.7], [3.4, 0, 1.7], [-5.2, -1.0, 1.9], [5.2, -1.1, 1.8], [0, -1.6, 1.6], [0, -4.6, 3.2], [-2.4, -3.8, 2.0], [2.6, -3.9, 2.0]]
    spots = [('lantern_l', -2.55, 3.3, 0.28, 'clear'), ('lantern_r', 2.55, 3.3, 0.28, 'clear'),
             ('kit_boulder', -3.9, 0.6, 0.25, 'clear'), ('kit_boulder', 4.1, 0.4, 0.25, 'clear'), ('kit_boulder', -2.6, 1.3, 0.2, 'clear'),
             ('kit_boulder', 3.0, 1.5, 0.2, 'clear'), ('kit_boulder', -4.8, -0.4, 0.25, 'clear'), ('kit_boulder', 5.0, -0.6, 0.25, 'clear'),
             ('kelp', -3.4, 1.2, 0.12, 'clear'), ('kelp', 3.6, 1.1, 0.12, 'clear'), ('kelp', -1.9, 0.9, 0.12, 'clear'), ('kelp', 2.1, 0.8, 0.12, 'clear'),
             ('kelp', -4.4, 1.0, 0.12, 'clear'), ('kelp', 4.6, 0.9, 0.12, 'clear'),
             ('starfish (on rock at h 1.3)', -2.9, 0.9, 1.3, 'on'), ('starfish (on rock at h 1.8)', 2.7, 0.8, 1.8, 'on'), ('starfish (on rock at h 3.4)', -1.6, 0.9, 3.4, 'on'),
             ('shell', 0.8, 3.4, 0.1, 'clear'), ('shell', -1.2, 3.8, 0.1, 'clear'), ('shell', 2.4, 3.0, 0.1, 'clear'), ('the game tide pool (flat, clear)', -2.5, 3.3, 1.0, 'clear'),
             ('spirit_lantern', 4.1, 2.7, 0.5, 'clear'), ('interact', 0, 2.8, 0.5, 'clear')]
    return parts, arch, mouth, colliders, spots, throat, colliders[4]

# ================================================================== the onsen gate
def build_onsen():
    """the Onsen Caverns (gates/onsen.js): an ice-cave mouth in a snowy cliff of dark slate, a thick rim of blue ice
    with a few faint crystals, a fringe of chunky icicles, frozen flows down the jambs, snow heaped on everything and
    drifted against the jambs; the vermilion snow torii"""
    parts = []
    ST = strata_painter(stone_painter('#3e4658', '#5a6478', '#7e8aa2', warm='#9aa6c0', seed=12), band=0.5, k=0.84, seed=5)
    STW = strata_painter(stone_painter('#3a4254', '#566074', '#78849c', warm='#9aa6c0', seed=13), band=0.5, k=0.84, seed=6)
    SNOW = moss_painter(lo='#c4d2ee', mid='#e4ecfa', hi='#f4f8ff', warm='#fbf8f2', cool='#d2def4', hue=0.04, seed=14)
    ICE = ice_painter()
    arch = Arch(a=1.48, ys=1.9, b=1.02, n=4.0)
    mouth = {'lz': 0.2, 'w': 2.5, 'h': 2.7}
    lip = Lip(arch, zc=0.1, w=0.46, D=0.5, e=0.62, seed=27, zfoot=0.04)
    def lip_paint(part, p, n, meta):
        c = ICE(part, p, n, meta)
        if meta and meta[0] is not None: c = mixc(c, '#3a5a86', clamp(-math.cos(meta[0])) ** 1.5 * 0.55)
        return c
    parts.append(lip.build(lip_paint, step=0.27, K=8))
    # snow on the ice rim's crown
    rl = random.Random(51)
    sA, sB = arch.len * 0.3, arch.len * 0.7
    dl = [(rl.uniform(sA, sB), rl.uniform(0.25, 0.4), rl.uniform(0.12, 0.25)) for _ in range(4)]
    def lo_l(s):
        u = clamp((s - sA) / (sB - sA)); tp = math.sqrt(max(0.0, math.sin(PI * u))); return -0.55 * tp - 0.03
    def hi_l(s):
        u = clamp((s - sA) / (sB - sA)); tp = math.sqrt(max(0.0, math.sin(PI * u)))
        return (0.5 + sum(d * math.exp(-((s - c) / w) ** 2) for c, w, d in dl)) * tp + 0.03
    parts.append(strip_moss('lip_snow', lip.Sfn, sA, sB, int((sB - sA) / 0.16), lo_l, hi_l, 0.07, SNOW, ncross=3))
    throat = Throat(arch, rings=[(0.25, 1.03, 1.02, 0.10), (-0.2, 1.07, 1.04, 0.09), (-0.7, 1.02, 0.97, 0.08),
                                 (-1.3, 0.88, 0.84, 0.07), (-1.8, 0.64, 0.62, 0.07), (-2.15, 0.36, 0.38, 0.08)],
                    back=(-2.35, 0.75), fl0=0.10)
    def throat_paint(part, p, n, meta):
        lz = -p.y; t = clamp((0.25 - lz) / 2.4)
        c = mixc('#3a5a86', '#142038', smooth(t * 2.2))
        c = mixc(c, '#070c16', smooth((t - 0.35) / 0.65))
        if n.z > 0.6: c = mixc(c, '#6a86b0', 0.35 * (1 - t))
        return c
    parts.append(throat.build(throat_paint))
    # icicles: chunky, longest at the crown, hung from the rim's front so their tips stay clear of the seal
    rr = random.Random(61)
    ni = 15
    for k in range(ni):
        s = arch.len * (0.27 + 0.46 * k / (ni - 1)) + rr.uniform(-0.04, 0.04)
        c, nn = arch.C(s), arch.N(s)
        crown = max(0.0, nn.y)
        att = L(c.x + nn.x * 0.3, c.y + nn.y * 0.3 - 0.03, lip.z(s) + lip.D(s) * 0.36)
        want = (0.3 + 0.4 * crown ** 2) * rr.uniform(0.8, 1.15)
        lim = want
        if abs(att.x) < 1.25 + 0.08: lim = min(want, att.z - 2.7 - (-att.y - 0.2) - 0.05)   # (clear of the seal from the 45-degree camera)
        if lim < 0.14: continue
        parts.append(icicle(f'icicle_{k}', att, lim, 0.075 + 0.08 * lim, ICE))
    # faint crystals in the ice rim (material glow): small, pale, on the rim's outer face
    for k, f in enumerate((0.18, 0.36, 0.62, 0.8)):
        s = arch.len * f; c, nn = arch.C(s), arch.N(s); w = lip.w(s)
        base = L(c.x + nn.x * (w * 0.9), c.y + nn.y * (w * 0.9), lip.z(s) + 0.12)
        parts.append(crystal(f'ice_crystal_{k}', base, 0.2, 0.045, '#8fd2ee', tilt=(-0.5, -0.4 * nn.x)))
    m = lambda **k: dict(dict(cover=0.8, drips=5, drop=1.1, t=0.1, front=0.7), **k)
    B = []
    B.append(Boulder('jamb_l', -2.35, -0.5, 0.95, 0.98, 1.08, 1.55, yaw=0.05, exy=0.78, ez=0.66, seed=211, moss=m(t=0.11), carve='side', res=0.38))
    B.append(Boulder('jamb_r', 2.36, -0.62, 0.9, 0.93, 1.0, 1.45, yaw=-0.1, exy=0.8, ez=0.64, seed=212, moss=m(t=0.11), carve='side', res=0.38))
    B.append(Boulder('lintel_l', -0.78, -0.62, 3.38, 1.18, 0.95, 0.74, hdn=0.62, yaw=0.18, exy=0.76, ez=0.74, seed=213,
                     ground=False, moss=m(cover=0.86, t=0.13, front=0.9), carve='up', res=0.34))
    B.append(Boulder('lintel_r', 0.86, -0.55, 3.3, 1.08, 0.9, 0.68, hdn=0.6, yaw=-0.22, exy=0.76, ez=0.74, seed=231,
                     ground=False, moss=m(cover=0.86, t=0.13, front=0.9), carve='up', res=0.34))
    B.append(Boulder('shoulder_l', -1.95, -1.25, 2.9, 0.8, 0.78, 0.72, hdn=0.95, yaw=0.5, seed=214, ground=False, moss=m(drips=4), carve='side', res=0.4))
    B.append(Boulder('shoulder_r', 2.0, -1.35, 2.75, 0.76, 0.74, 0.66, hdn=0.95, yaw=-0.4, seed=215, ground=False, moss=m(drips=4), carve='side', res=0.4))
    B.append(Boulder('crest', 0.1, -2.85, 2.0, 1.05, 0.95, 1.75, yaw=0.08, exy=0.78, ez=0.82, seed=216, taper=0.2, moss=m(t=0.12), carve='back', res=0.42))
    B.append(Boulder('hill_l', -2.12, -1.78, 1.25, 0.8, 0.85, 1.75, yaw=-0.3, seed=217, moss=m(drips=4), carve='side', res=0.55))
    B.append(Boulder('hill_r', 2.18, -1.88, 1.15, 0.8, 0.85, 1.65, yaw=0.25, seed=218, moss=m(drips=4), carve='side', res=0.55))
    B.append(Boulder('back_l', -0.95, -3.85, 0.85, 1.2, 0.85, 1.45, yaw=0.2, seed=219, res=0.62, moss=m(drips=3), carve='back'))
    B.append(Boulder('back_r', 1.0, -4.05, 0.75, 1.05, 0.78, 1.3, yaw=-0.25, seed=220, res=0.62, moss=m(drips=3), carve='back'))
    B.append(Boulder('rock_fl', -3.45, 0.45, 0.12, 0.4, 0.4, 0.44, yaw=0.4, seed=223, res=0.22, moss=m(cover=0.75, drips=2, t=0.07), carve=None))
    B.append(Boulder('rock_fr', 3.38, 0.72, 0.1, 0.3, 0.28, 0.34, yaw=-0.3, seed=224, res=0.2, moss=m(cover=0.75, drips=2, t=0.06), carve=None))
    B.append(Boulder('rock_bl', -3.42, -0.32, 0.25, 0.44, 0.46, 0.5, yaw=0.3, seed=227, res=0.24, moss=m(drips=2, t=0.07), carve=None))
    B.append(Boulder('rock_br', 3.45, -0.42, 0.22, 0.38, 0.42, 0.46, yaw=-0.5, seed=228, res=0.24, moss=m(drips=2, t=0.07), carve=None))
    for i, b in enumerate(B):
        sp = b.build(ST if i % 2 == 0 else STW); parts.append(sp)
        if b.moss: parts.append(boulder_moss(b, SNOW, stone=sp))
    # snow drifted against the jambs (walkable, low)
    for k, (x, z, r, h) in enumerate(((-1.78, 0.82, 0.5, 0.32), (-2.42, 0.42, 0.42, 0.26), (1.78, 0.86, 0.48, 0.3))):
        d = Boulder(f'drift_{k}', x, z, -0.05, r, r * 0.85, h + 0.05, yaw=x, exy=0.9, ez=0.7, seed=240 + k, res=0.24, carve=None)
        sp = d.build(SNOW); sp.kind = 'step'; parts.append(sp)
    # frozen flows down the jambs' faces
    V, Fc = [], []
    for p in parts:
        if p.kind not in ('stone', 'moss'): continue
        b0 = len(V); V += p.v
        for f in p.f: Fc += [[i + b0 for i in f]] if len(f) == 3 else [[f[0] + b0, f[1] + b0, f[2] + b0], [f[0] + b0, f[2] + b0, f[3] + b0]]
    mb = BVHTree.FromPolygons(V, Fc)
    for k, (x, top) in enumerate(((-1.95, 2.0), (-2.45, 1.75), (1.95, 1.9), (2.4, 1.6))):
        pts = []
        for j in range(6):
            h = top - (top - 0.05) * j / 5
            hit = mb.ray_cast(L(x + 0.05 * math.sin(j * 1.7 + k), h, 5), Vector((0, 1, 0)), 10)
            if hit[0] is not None: pts.append((hit[0] + hit[1] * 0.05, 0.1 * (1 - 0.5 * j / 5)))
        if len(pts) < 3: print('GATES flow miss', x); continue
        pth, rad = spline(pts, per=8)
        fl = Beam(pth, Vector((0, -1, 0)), rad, rad, e=1.0, cap=0.06)
        parts.append(fl.build(f'flow_{k}', 'ice', ICE, K=7, step=0.22, capn=1))
    # worn steps up to the mouth, snow on their treads
    SP = step_painter(top='#e8eef8', side='#7c8498', mossc='#f4f8ff', seed=15)
    for k, (z, hx, hz, top, yaw) in enumerate(((1.12, 1.05, 0.25, 0.035, 0.025), (0.7, 0.95, 0.25, 0.085, -0.02), (0.2, 1.42, 0.32, 0.135, 0.0))):
        R = Matrix.Rotation(yaw, 3, 'Z')
        parts.append(slab(f'step_{k}', 'step', SP, hx, hz, top, rc=0.13, rb=0.05, nc=3, dish=0.012, wob=0.015, seed=250 + k,
                          xf=lambda q, z=z, R=R: R @ Vector((q.x, -q.y, q.z)) + L(0, 0, z)))
    # the snow torii (kit layout: z 1.75, w 3.0, h 3.1)
    parts += torii(z=1.75, w=3.0, h=3.1, moss_top=False, snow=True)
    colliders = [[-2.4, -0.55, 1.3], [2.35, -0.5, 1.25], [0, -2.2, 2.6], [-3.35, 0.6, 0.55], [3.25, 0.7, 0.5], [0, -0.6, 1.0]]
    spots = [('yukimi_lantern_l', -2.6, 1.6, 0.5, 'clear'), ('yukimi_lantern_r', 2.6, 1.6, 0.5, 'clear'),
             ('snow_bush', -3.1, 1.2, 0.3, 'clear'), ('snow_bush', -4.0, 0.3, 0.3, 'clear'), ('snow_bush', 2.6, 0.6, 0.3, 'clear'),
             ('frost_grass', -1.3, 1.4, 0.1, 'clear'), ('frost_grass', 1.2, 1.3, 0.1, 'clear'), ('frost_grass', -2.4, 2.2, 0.1, 'clear'),
             ('frost_grass', 4.9, 2.2, 0.1, 'clear'), ('frost_grass', 1.6, 2.8, 0.1, 'clear'),
             ('snow_fir', -4.2, -2.4, 0.4, 'clear'), ('snow_fir', -2.6, -3.6, 0.4, 'clear'), ('snow_fir', 3.3, -3.0, 0.4, 'clear'),
             ('snow_fir', 4.7, -1.6, 0.4, 'clear'), ('snow_fir', -5.0, -0.4, 0.4, 'clear'),
             ('hot_spring', 3.6, 2.9, 1.35, 'clear'), ('oke', 2.3, 3.5, 0.2, 'clear'), ('spirit_lantern', -5.0, 3.9, 0.5, 'clear'), ('interact', 0, 2.8, 0.5, 'clear')]
    return parts, arch, mouth, colliders, spots, throat, colliders[5]

BUILDERS = {'bamboo': build_bamboo, 'maple': build_maple, 'tidepool': build_tidepool, 'onsen': build_onsen}

def run(zone):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts, arch, mouth, colliders, spots, throat, mcoll = BUILDERS[zone]()
    ob, tk = finish(parts, f'gate_{zone}', throat=throat)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print('GATES', zone, 'tris', tris, 'by kind', tk)
    out = export(ob, zone)
    R = checks(zone, parts, arch, mouth, colliders, spots, throat, os.path.join(PREVIEW, f'{zone}-checks.json'), mouth_collider=mcoll)
    R['triangles'] = tris; R['triangles_by_kind'] = tk
    with open(os.path.join(PREVIEW, f'{zone}-checks.json'), 'w', encoding='utf-8') as f: json.dump(R, f, indent=2)

for z in (BUILDERS if GATE == 'all' else [GATE]):
    run(z)
print('GATES done')
