# PAWHAVEN plaza pieces (Blossom Hollow's centrepieces): the Burrow gate, the plaza fountain, the Chewy statue and the
# village shrine as chunky toy-diorama Blender models.
#   blender --background --factory-startup --python build_plaza-pieces.py -- --piece burrowGate|fountain|chewyStatue|villageShrine|all
# The shrine hall uses the Guild kit, loaded as the module plaza_guildkit.py beside this script.
# Deterministic (fixed seeds, no wall-clock input): a rebuild from an empty scene reproduces each GLB exactly.
#
# Frame: 1 unit = 1 m, Blender Z up, ground z = 0, centred on the kit footprint's origin; the front faces -Y (the glTF
# exporter makes it the game's +z). A kit function's local (x, height, z) maps to Blender (x, -z, height) via L().
# Grounded masses carry a buried skirt to z = -0.3.
#
# The shared kit (Boulder, moss icing, Arch / Lip / Throat, Beam sweeps, rope, shide, slabs, lathes, painters and the
# torii) is copied from tools/blender/codex/assets/dungeon-gates/build_dungeon-gates.py so the plaza reads as one set
# with the zone gates. Vertex colours (attribute `Col`) with painted soft shading and a ray-cast AO pass.
# Materials: `body` (vertex colours), `window_glow` (lantern windows), `water_glow` (the fountain's water object).
import bpy, bmesh, math, os, sys, json, random, importlib
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
PREVIEW = os.path.join(HERE, 'preview')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None): return argv[argv.index(name) + 1] if name in argv else default
PIECE = arg('--piece', 'all')
NO_EXPORT = '--no-export' in argv
print('PLAZA build pid', os.getpid(), 'piece', PIECE)
sys.path.insert(0, HERE)      # (plaza_guildkit.py: the Guild's roof and wall kit, used by the shrine)

GROUND = -0.3          # the buried skirt
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
def torii(z=1.75, w=3.0, h=3.1, red='#d6573b', moss_top=True, seed=4, snow=False, rope=True, lod=1.0, post_moss=0.62):
    """a myojin torii at gate-local z: posts (lean in), stone drum plinths, black bands, nuki, gakuzuka + gaku, red
    shimaki under a black kasagi with upswept ends (moss on top); a shimenawa with three shide between the posts"""
    parts = []
    REDP = lacquer_painter(red, '#a53a28', '#f08a66', spec='#ffd0b4', moss_below=post_moss, seed=seed)
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
        parts.append(post.build(f'post_{sx}', 'torii', REDP, K=int(14 * lod), step=0.9, capn=1))
        # plinth: a rounded stone drum, buried to the skirt
        parts.append(lathe(f'plinth_{sx}', 'torii', STONE, L(xat(0), 0, zl),
                           [(0.27, GROUND), (0.265, 0.0), (0.255, 0.17), (0.225, 0.26), (0.17, 0.3)], K=14 if lod >= 0.75 else 8))
        # black nemaki band above the plinth and a daiwa ring under the shimaki
        for (y0, r0, hh) in ((0.37, 0.168, 0.075), (2.97, 0.15, 0.06)):
            parts.append(lathe(f'band_{sx}_{y0}', 'torii', BLK, L(xat(y0), y0, zl),
                               [(r0 * 0.92, -hh), (r0, -hh * 0.5), (r0, hh * 0.5), (r0 * 0.92, hh)], K=12 if lod >= 0.75 else 8))
    # nuki (tie beam), its ends through the posts
    nk = Beam(lambda s: L(-(w / 2 + 0.33) + (w + 0.66) * s, h * 0.76, zl), UP, lambda s: 0.085, lambda s: 0.1, e=0.55, cap=0.05)
    parts.append(nk.build('nuki', 'torii', REDB, K=12 if lod >= 0.75 else 6, step=1.0, capn=2))
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
    sm = Beam(sweep(w / 2 + 0.5, h + 0.03, 0.2), UP, lambda s: 0.15, lambda s: 0.105, e=0.55, cap=0.08)
    parts.append(sm.build('shimaki', 'torii', REDB, K=int(10 * lod), step=0.3 / lod, capn=2))
    ks = Beam(sweep(w / 2 + 0.66, h + 0.24, 0.3), UP, lambda s: 0.2 - 0.02 * abs(s * 2 - 1), lambda s: 0.11, e=0.5, cap=0.1)
    parts.append(ks.build('kasagi', 'torii', BLK, K=int(12 * lod), step=0.32 / lod, capn=2))
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
    if not rope: return parts
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

# ================================================================== plaza kit (new for this task)
# Every Part may carry .obj (the object it lands in; default 'main') and .mat (0 / 'body', 1 / 'window_glow', or a
# material name such as 'water_glow').
def matname(p):
    if p.mat in (0, None, 'body'): return 'body'
    if p.mat == 1: return 'window_glow'
    return p.mat

def xf_parts(parts, M):
    """apply a 4x4 matrix to every vertex of every part (positive determinant only: windings stay outward)"""
    for p in parts: p.v = [M @ v for v in p.v]
    return parts

def lathe2(name, kind, paint, base, prof, K=12, rfn=None, zfn=None, th0=0.0, pole0=True, pole1=True, ao=1.0, closed=True):
    """a surface of revolution about the vertical axis through `base`: prof [(r, z)] travels round the solid with the
    solid on its left (up the outside, in over the top), so the 2-D outward normal is (dz, -dr). Poles on the axis at
    prof[0] / prof[-1] heights. rfn(r, z, th) / zfn(r, z, th) wobble the radius / height per vertex."""
    p = Part(name, kind, paint=paint, closed=closed, ao=ao)
    ths = [th0 + TAU * k / K for k in range(K)]
    rings = []
    for j, (r, z) in enumerate(prof):
        ring = []
        for k, th in enumerate(ths):
            rr = rfn(r, z, th) if rfn else r
            zz = zfn(r, z, th) if zfn else z
            ring.append(p.add_v(base + Vector((math.cos(th) * rr, math.sin(th) * rr, zz)), ('lathe', th, j)))
        rings.append(ring)
    for j in range(len(prof) - 1):
        (r0, z0), (r1, z1) = prof[j], prof[j + 1]
        nr, nz = (z1 - z0), -(r1 - r0)
        for k in range(K):
            th = ths[k] + PI / K
            hint = Vector((math.cos(th) * nr, math.sin(th) * nr, nz))
            if hint.length < 1e-9: hint = Vector((math.cos(th), math.sin(th), 0))
            p.add_f([rings[j][k], rings[j][(k + 1) % K], rings[j + 1][(k + 1) % K], rings[j + 1][k]], hint)
    if pole0:
        b0 = p.add_v(base + Vector((0, 0, prof[0][1])), ('lathe', None, -1))
        for k in range(K): p.add_f([b0, rings[0][(k + 1) % K], rings[0][k]], Vector((0, 0, -1)))
    if pole1:
        b1 = p.add_v(base + Vector((0, 0, prof[-1][1])), ('lathe', None, len(prof)))
        for k in range(K): p.add_f([b1, rings[-1][k], rings[-1][(k + 1) % K]], Vector((0, 0, 1)))
    return p

def ellipsoid(name, kind, paint, c, rx, ry, rz, M=None, K=10, J=6, ao=1.0):
    prof = [(math.sin(PI * j / J), -math.cos(PI * j / J)) for j in range(1, J)]
    p = lathe2(name, kind, paint, Vector((0, 0, 0)), prof, K=K, ao=ao)
    p.v[-2] = Vector((0, 0, -1)); p.v[-1] = Vector((0, 0, 1))
    R = M.to_3x3() if M is not None else Matrix.Identity(3)
    p.v = [c + R @ Vector((v.x * rx, v.y * ry, v.z * rz)) for v in p.v]
    p.ecentre, p.eR = c, R
    return p

def flat_shape(name, kind, paint, outline, centre, z, thick, dome=0.0, ao=1.0):
    """a thick flat card: outline [(x, y)] (star-shaped about `centre`, Blender xy), top at z + thick/2"""
    p = Part(name, kind, paint=paint, closed=True, ao=ao)
    c = Vector((centre[0], centre[1], z))
    tc = p.add_v(c + Vector((0, 0, thick / 2 + dome)), ('top',))
    top = [p.add_v(Vector((x, y, z + thick / 2)), ('top',)) for x, y in outline]
    bot = [p.add_v(Vector((x, y, z - thick / 2)), ('bot',)) for x, y in outline]
    bc = p.add_v(c - Vector((0, 0, thick / 2)), ('bot',))
    n = len(outline)
    for k in range(n):
        k1 = (k + 1) % n
        p.add_f([tc, top[k], top[k1]], Vector((0, 0, 1)))
        p.add_f([bc, bot[k1], bot[k]], Vector((0, 0, -1)))
        mid = (p.v[top[k]] + p.v[top[k1]]) / 2
        p.add_f([top[k], bot[k], bot[k1], top[k1]], Vector((mid.x - c.x, mid.y - c.y, 0)))
    return p

def arc_block(name, kind, paint, a0, a1, r0, r1, z0, z1, bev, na=2, full=True, ao=1.0):
    """a cut stone on a ring (Blender angles a0..a1 round the z axis): a rounded-rectangle section (r0..r1, z0..z1,
    top corners rounded by bev; full=False rounds only the outer top corner) swept round, its ends rounded in"""
    sec = [(r0, z0), (r1, z0)]
    for k in range(3):
        t = PI / 2 * k / 2
        sec.append((r1 - bev + math.cos(t) * bev, z1 - bev + math.sin(t) * bev))
    if full:
        for k in range(3):
            t = PI / 2 + PI / 2 * k / 2
            sec.append((r0 + bev + math.cos(t) * bev, z1 - bev + math.sin(t) * bev))
    else:
        sec.append((r0, z1))
    rc, zc = (r0 + r1) / 2, (z0 + z1) / 2
    dA = min(bev / rc, (a1 - a0) * 0.25)
    sts = [(a0, 0.45), (a0 + dA * 0.55, 0.12)] + [(a0 + dA + (a1 - a0 - 2 * dA) * k / na, 0.0) for k in range(na + 1)] + \
          [(a1 - dA * 0.55, 0.12), (a1, 0.45)]
    p = Part(name, kind, paint=paint, closed=True, ao=ao)
    rows = []
    for a, sh in sts:
        row = []
        for r, z in sec:
            rr = rc + (r - rc) * (1 - sh); zz = z if z == z0 else zc + (z - zc) * (1 - sh * 0.7)
            row.append(p.add_v(Vector((math.cos(a) * rr, math.sin(a) * rr, zz)), ('blk', (a - a0) / (a1 - a0))))
        rows.append(row)
    n = len(sec)
    for i in range(len(sts) - 1):
        am = (sts[i][0] + sts[i + 1][0]) / 2
        cc = Vector((math.cos(am) * rc, math.sin(am) * rc, zc))
        for k in range(n):
            q = [rows[i][k], rows[i][(k + 1) % n], rows[i + 1][(k + 1) % n], rows[i + 1][k]]
            fc = sum((p.v[m] for m in q), Vector()) / 4
            p.add_f(q, fc - cc)
    for row, a, sgn in ((rows[0], a0, -1), (rows[-1], a1, 1)):
        cc = Vector((math.cos(a) * rc, math.sin(a) * rc, zc))
        ci = p.add_v(cc, ('blk', 0.0 if sgn < 0 else 1.0))
        tg = Vector((-math.sin(a), math.cos(a), 0)) * sgn
        for k in range(n): p.add_f([ci, row[k], row[(k + 1) % n]], tg)
    return p

def lobe_parts(parts, n, amp, zmin=-9, zmax=9, absolute=False):
    """radial lobes r *= 1 + amp cos(n th) (absolute: r += amp cos(n th)) on every vertex (the fountain's scallops)"""
    for p in parts:
        nv = []
        for v in p.v:
            r = math.hypot(v.x, v.y)
            if r < 1e-6 or v.z < zmin or v.z > zmax: nv.append(v); continue
            k = 1 + (amp / r if absolute else amp) * math.cos(n * math.atan2(v.y, v.x))
            nv.append(Vector((v.x * k, v.y * k, v.z)))
        p.v = nv

def moss_stone(base, amount=0.4, seed=0, mossc='#88b05a', hi='#a8c870'):
    """a stone painter with moss on its up-facing tops (soft noise-edged patches)"""
    def paint(part, p, n, meta):
        c = base(part, p, n, meta)
        if amount <= 0: return c
        m = clamp((n.z - 0.45) * 2.2) * clamp((vnoise(p, 6.0, seed) - (0.62 - amount * 0.5)) * 4.0)
        return mixc(c, mixc(mossc, hi, clamp(n.z)), m * 0.85)
    return paint

def solid_painter(c0, top=0.12, bot=0.22, seed=0, nz_amp=0.06, f=4.0):
    def paint(part, p, n, meta):
        c = hexc(c0)
        k = 1 + top * clamp(n.z) - bot * clamp(-n.z) + 0.1 * (clamp(n.dot(LDIR)) - 0.5)
        k *= 1 + nz_amp * (vnoise(p, f, seed) - 0.5) * 2
        return mulc(c, k)
    return paint

def ofuda(name, c, normal):
    """a paper talisman pasted on stone: a cream slip with a red band (no writing)"""
    z = normal.normalized(); xa = UP.cross(z); xa = xa.normalized() if xa.length > 1e-6 else Vector((1, 0, 0)); ya = z.cross(xa)
    R = Matrix((xa, ya, z)).transposed()
    pp = Part(name, 'shide', paint=flat_painter('#fff6ea', '#f3eadc', shade=0.08), ao=0.3)
    box_flat(pp, Vector((0, 0, 0)), 0.05, 0.11, 0.012); pp.v = [c + R @ v for v in pp.v]
    rb = Part(name + '_band', 'shide', paint=flat_painter('#e2483a', shade=0.08), ao=0.3)
    box_flat(rb, Vector((0, 0.045, 0.008)), 0.054, 0.022, 0.012); rb.v = [c + R @ v for v in rb.v]
    return [pp, rb]

def toro(name, at, s=1.0, yaw=0.0, seed=0, moss=0.45, lod=1.0):
    """a stone toro lantern (kit props.js toro): hex base, a lotus tier, the post, a flared hex platform, the fire box
    (six corner posts round a glowing core, material window_glow), a hex roof with lifted corners, the jewel"""
    parts = []
    tone = lambda k: stone_painter(mulc('#857c88', k), mulc('#aaa1ac', k), mulc('#d2cad0', k), seed=seed)
    ST = moss_stone(tone(1.0), moss, seed); ST2 = moss_stone(tone(1.04), moss * 0.6, seed + 1)
    O = Vector((0, 0, 0))
    parts.append(lathe2(name + '_kiso', 'stone', ST, O, [(0.3, -0.3), (0.3, 0.05), (0.285, 0.085), (0.25, 0.1)], K=6, th0=PI / 6))
    parts.append(lathe2(name + '_lotus', 'stone', ST2, O, [(0.235, 0.08), (0.24, 0.12), (0.2, 0.165), (0.12, 0.185)] if lod >= 1 else
                        [(0.235, 0.08), (0.22, 0.15), (0.12, 0.185)], K=12 if lod >= 1 else 6,
                        rfn=lambda r, z, th: r * (0.9 + 0.1 * abs(math.cos(3 * th)))))
    parts.append(lathe2(name + '_sao', 'stone', ST, O, [(0.105, 0.15), (0.1, 0.3), (0.115, 0.31), (0.115, 0.34), (0.098, 0.35), (0.092, 0.63)] if lod >= 1 else
                        [(0.105, 0.15), (0.092, 0.63)], K=8 if lod >= 1 else 6))
    parts.append(lathe2(name + '_chudai', 'stone', ST2, O, [(0.12, 0.6), (0.235, 0.675), (0.245, 0.705), (0.22, 0.725)], K=6, th0=PI / 6))
    core = lathe2(name + '_fire', 'glow', glow_painter('#ffe6a8'), O, [(0.125, 0.72), (0.125, 0.955)], K=6, th0=PI / 6, ao=0.0)
    core.mat = 1; parts.append(core)
    for k in range(6):
        a = PI / 6 + TAU * k / 6
        pp = Part(f'{name}_hp{k}', 'stone', paint=ST2, closed=True)
        box_flat(pp, Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, 0.84)), 0.032, 0.032, 0.12, rot=a); parts.append(pp)
    parts.append(lathe2(name + '_lintel', 'stone', ST, O, [(0.19, 0.94), (0.215, 0.965), (0.21, 0.985)], K=6, th0=PI / 6))
    # the kasa: twelve-sided so the six corners can be lifted and the edges drawn in
    corner = lambda th: abs(math.cos(3 * (th - PI / 6))) ** 6
    parts.append(lathe2(name + '_kasa', 'stone', moss_stone(tone(1.02), moss + 0.15, seed + 2), O,
                        [(0.16, 0.975), (0.34, 1.02), (0.36, 1.055), (0.3, 1.09), (0.17, 1.15), (0.07, 1.2)] if lod >= 1 else
                        [(0.16, 0.975), (0.35, 1.035), (0.3, 1.09), (0.07, 1.2)], K=12,
                        rfn=lambda r, z, th: r * (0.9 + 0.12 * corner(th)) if r > 0.2 else r,
                        zfn=lambda r, z, th: z + (0.055 * corner(th) * clamp((r - 0.25) / 0.1)) if r > 0.25 else z))
    parts.append(lathe2(name + '_hoju', 'stone', ST2, O, [(0.07, 1.19), (0.09, 1.22), (0.075, 1.27), (0.03, 1.31)], K=8 if lod >= 1 else 6))
    M = Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(s, 4)
    return xf_parts(parts, M)

def stone_dog(name, at, s=1.0, yaw=0.0, ball=1, seed=0, lod=1.0):
    """a komainu dog statue on a plinth (kit props2.js stoneDog): sitting body, round head with a snout and droopy
    ears, a curly mane, a red cloth bib, a red ball under one front paw, a curled tail"""
    parts = []
    kk = lambda K: K if lod >= 1 else max(6, int(K * 0.75))
    jj = lambda J: J if lod >= 1 else max(3, J - 1)
    SD = moss_stone(stone_painter('#8a8290', '#b2aab4', '#d8d0d6', seed=seed), 0.25, seed)
    SL = stone_painter('#968e9a', '#bcb4be', '#e0d8dc', seed=seed + 1)
    DK = solid_painter('#5a5060', top=0.1)
    RED = lacquer_painter('#e0503a', '#a63428', '#f88a6a', spec='#ffd8c0', sheen=0.5)
    parts.append(slab(name + '_plinth', 'stone', moss_stone(stone_painter('#7a7280', '#9e96a4', '#c4bcc6', seed=seed + 3), 0.55, seed + 3),
                      0.22, 0.2, 0.2, bottom=GROUND, rc=0.07, rb=0.035, nc=2, dish=0.0, wob=0.01, seed=seed,
                      xf=lambda q: Vector((q.x, -q.y, q.z))))
    parts.append(ellipsoid(name + '_body', 'stone', SD, Vector((0, 0.03, 0.38)), 0.16, 0.18, 0.19, K=kk(8), J=jj(5)))
    parts.append(ellipsoid(name + '_head', 'stone', SL, Vector((0, -0.04, 0.62)), 0.155, 0.14, 0.14, K=kk(9), J=jj(5)))
    parts.append(ellipsoid(name + '_snout', 'stone', SL, Vector((0, -0.17, 0.58)), 0.075, 0.06, 0.055, K=kk(8), J=jj(4)))
    parts.append(ellipsoid(name + '_nose', 'stone', DK, Vector((0, -0.225, 0.605)), 0.03, 0.022, 0.022, K=kk(6), J=jj(3)))
    for sx in (-1, 1):
        parts.append(ellipsoid(f'{name}_eye{sx}', 'stone', DK, Vector((sx * 0.06, -0.165, 0.665)), 0.026, 0.016, 0.03, K=kk(6), J=jj(3)))
        parts.append(ellipsoid(f'{name}_ear{sx}', 'stone', SD, Vector((sx * 0.14, -0.02, 0.62)), 0.04, 0.06, 0.085,
                               M=Matrix.Rotation(sx * 0.35, 4, 'Y'), K=kk(6), J=jj(4)))
        parts.append(ellipsoid(f'{name}_paw{sx}', 'stone', SL, Vector((sx * 0.08, -0.13, 0.235)), 0.05, 0.065, 0.04, K=kk(6), J=jj(4)))
        parts.append(ellipsoid(f'{name}_haunch{sx}', 'stone', SD, Vector((sx * 0.13, 0.06, 0.28)), 0.07, 0.11, 0.08, K=kk(6), J=jj(4)))
    for k in range(4):
        a = (k / 3 - 0.5) * 2.2
        parts.append(ellipsoid(f'{name}_mane{k}', 'stone', SD, Vector((math.sin(a) * 0.14, 0.04 + math.cos(a) * 0.06, 0.5 + math.cos(a) * 0.03)),
                               0.05, 0.05, 0.045, K=kk(6), J=jj(4)))
    parts.append(ellipsoid(name + '_tail', 'stone', SD, Vector((0, 0.2, 0.45)), 0.065, 0.06, 0.09, M=Matrix.Rotation(-0.4, 4, 'X'), K=kk(6), J=jj(4)))
    parts.append(ellipsoid(name + '_bib', 'cloth', RED, Vector((0, -0.11, 0.47)), 0.12, 0.05, 0.085, M=Matrix.Rotation(0.35, 4, 'X'), K=kk(10), J=jj(4)))
    parts.append(ellipsoid(name + '_ball', 'cloth', RED, Vector((ball * 0.1, -0.16, 0.265)), 0.06, 0.06, 0.06, K=kk(8), J=jj(5)))
    if lod < 1:                # (a lighter dog: drop the mane's outer curls and the haunches)
        parts = [p for p in parts if not (p.name.endswith(('_mane0', '_mane3')) or '_haunch' in p.name)]
    M = Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(s, 4)
    return xf_parts(parts, M)

def bamboo_clump(name, at, n=3, h=1.7, seed=0):
    rnd = random.Random(seed); parts = []
    def stalk_paint(part, p, n_, meta):
        c = mixc('#6eaa4a', '#b8e07a', smooth(n_.dot(LDIR) * 0.6 + 0.5))
        if (p.z % part.node) < 0.05: c = mixc(c, '#4e8a3a', 0.7)
        return c
    LEAF = moss_painter(lo='#4e8a3a', mid='#6eb04c', hi='#a8dc78', seed=seed + 5)
    for i in range(n):
        x, y = rnd.uniform(-0.16, 0.16), rnd.uniform(-0.16, 0.16)
        hh = h * rnd.uniform(0.75, 1.08); lx, ly = rnd.uniform(-0.18, 0.18), rnd.uniform(-0.18, 0.18)
        base = at + Vector((x, y, 0))
        path = lambda s, base=base, hh=hh, lx=lx, ly=ly: base + Vector((lx * s * s, ly * s * s, -0.15 + (hh + 0.15) * s))
        bm = Beam(path, Vector((1, 0, 0)), lambda s: 0.048 - 0.014 * s, lambda s: 0.048 - 0.014 * s, e=1.0, cap=0.03)
        st = bm.build(f'{name}_stalk{i}', 'leaf', stalk_paint, K=7, step=0.3, capn=1, cap0=False)
        st.node = rnd.uniform(0.36, 0.44); parts.append(st)
        for k in range(3):
            t = 0.58 + k * 0.15; a = rnd.uniform(0, TAU)
            c = path(t) + Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, -0.02))
            M = Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(0.3, 4, 'Y')
            parts.append(ellipsoid(f'{name}_leaf{i}_{k}', 'leaf', LEAF, c, 0.17, 0.045, 0.024, M=M, K=6, J=3, ao=0.4))
    return parts

def bush(name, at, r=0.26, flowers=('#c8a8ff', '#fff1e2'), seed=0, nf=6, K=9, J=5, nl=5, fr=0.07):
    rnd = random.Random(seed); parts = []
    LEAF = moss_painter(lo='#3e7a36', mid='#5c9a48', hi='#94c870', seed=seed + 3)
    lumps = []
    for k in range(nl):
        a = TAU * k / max(1, nl - 1) + rnd.uniform(-0.3, 0.3); d = r * 0.55 if k else 0.0
        c = at + Vector((math.cos(a) * d, math.sin(a) * d, r * (0.55 if k else 0.8)))
        rr = r * rnd.uniform(0.62, 0.78) if k else r * 0.82
        parts.append(ellipsoid(f'{name}_lump{k}', 'moss', LEAF, c, rr, rr, rr * 0.85, K=K, J=J, ao=0.6)); lumps.append((c, rr))
    for k in range(nf):
        c, rr = lumps[k % len(lumps)]
        a = rnd.uniform(0, TAU); el = rnd.uniform(0.25, 0.9)
        nrm = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        nrm.y -= 0.35; nrm.normalize()
        parts.append(flower(f'{name}_fl{k}', c + Vector((nrm.x * rr, nrm.y * rr, nrm.z * rr * 0.85)), nrm, fr,
                            flowers[k % len(flowers)], '#ffd166', seed=seed + k))
    return parts

# ------------------------------------------------------------------ assembly with named objects and materials
GLOWC = {'window_glow': '#ffe6a8', 'water_glow': '#3a8fb4'}

def finish_multi(parts, prefix, dmax=0.8, ground_ao=True):
    for k, p in enumerate(parts):
        p.n = p.normals()
        zs = [v.z for v in p.v]; p.zr = (min(zs), max(zs)); p.seed_off = k * 3
        p.col = [hexc(p.paint(p, v, n, m)) if p.paint else (0.8, 0.8, 0.8, 1.0) for v, n, m in zip(p.v, p.n, p.meta)]
    allv, allf = [], []
    for p in parts:
        if matname(p) != 'body': continue      # (glow and water don't shade their neighbours)
        b = len(allv); allv += p.v
        for f in p.f:
            if len(f) == 3: allf.append([i + b for i in f])
            else: allf += [[f[0] + b, f[1] + b, f[2] + b], [f[0] + b, f[2] + b, f[3] + b]]
    if ground_ao:
        b = len(allv); allv += [Vector((-14, -14, 0)), Vector((14, -14, 0)), Vector((14, 14, 0)), Vector((-14, 14, 0))]
        allf += [[b, b + 1, b + 2], [b, b + 2, b + 3]]
    bvh = BVHTree.FromPolygons(allv, allf)
    NR = 28; dirs = []
    ga = PI * (3 - math.sqrt(5))
    for k in range(NR):
        r = math.sqrt((k + 0.5) / NR); a = k * ga
        x, y = r * math.cos(a), r * math.sin(a); dirs.append(Vector((x, y, math.sqrt(max(0.0, 1 - x * x - y * y)))))
    for p in parts:
        if p.ao <= 0: continue
        for i, (v, n) in enumerate(zip(p.v, p.n)):
            if v.z < -0.15: continue
            q = n.to_track_quat('Z', 'Y'); occ = 0.0; o = v + n * 0.008
            for d in dirs:
                hit = bvh.ray_cast(o, q @ d, dmax)
                if hit[0] is not None: occ += 1 - hit[3] / dmax
            occ /= NR
            k = 1 - p.ao * clamp(occ * 1.25) * 0.6
            c = p.col[i]; p.col[i] = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    mats = {}
    def get_mat(nm):
        if nm in mats: return mats[nm]
        if nm in bpy.data.materials: mats[nm] = bpy.data.materials[nm]; return mats[nm]
        m = bpy.data.materials.new(nm); m.use_nodes = True
        bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bs.inputs['Roughness'].default_value = 0.8; bs.inputs['Metallic'].default_value = 0.0
        if nm == 'body':
            vc = m.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
            m.node_tree.links.new(vc.outputs['Color'], bs.inputs['Base Color'])
        else:
            gc = GLOWC.get(nm, '#ffffff')
            bs.inputs['Base Color'].default_value = hexc(gc); bs.inputs['Emission Color'].default_value = hexc(gc)
            bs.inputs['Emission Strength'].default_value = 1.0
        m.use_backface_culling = True
        mats[nm] = m; return m
    objs = {}
    for p in parts: objs.setdefault(getattr(p, 'obj', 'main'), []).append(p)
    out, tri_by_kind = [], {}
    for oname, ps in objs.items():
        verts, faces, cols, fm, mlist = [], [], [], [], []
        for p in ps:
            b = len(verts); verts += p.v; mn = matname(p)
            if mn not in mlist: mlist.append(mn)
            for f in p.f:
                P = [p.v[i] for i in f]
                ar = (P[1] - P[0]).cross(P[2] - P[0]).length + ((P[2] - P[0]).cross(P[3] - P[0]).length if len(P) == 4 else 0)
                if ar < 1e-10: continue
                faces.append([i + b for i in f]); fm.append(mlist.index(mn)); cols.append([p.col[i] for i in f])
            tri_by_kind[p.kind] = tri_by_kind.get(p.kind, 0) + p.tris()
        nm = prefix if oname == 'main' else oname
        me = bpy.data.meshes.new(nm); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        flat = []
        for fc in cols:
            for c in fc: flat.extend(c)
        attr.data.foreach_set('color', flat)
        me.color_attributes.active_color = attr
        try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
        except Exception: pass
        for mn in mlist: me.materials.append(get_mat(mn))
        me.polygons.foreach_set('material_index', fm)
        me.shade_smooth(); me.validate(verbose=False)
        ob = bpy.data.objects.new(nm, me); bpy.context.scene.collection.objects.link(ob); out.append(ob)
    for p in sorted(parts, key=lambda q: -q.tris())[:14]: print(f'PLAZA part {p.name:22s} {p.tris():5d}')
    return out, tri_by_kind

def mesh_check(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    zero = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
    nan = sum(1 for v in bm.verts if any(math.isnan(c) for c in v.co))
    bm.free()
    return dict(zero_area=zero, nan_verts=nan)

def export_glb(obs, fname):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, fname + '.blend'))
    if NO_EXPORT: return None
    for o in bpy.context.scene.objects: o.select_set(o in obs)
    out = os.path.join(MODELS, fname + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('PLAZA export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('PLAZA wrote', out)
    return out

def bounds(obs):
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in obs:
        for v in o.data.vertices: lo = Vector(map(min, lo, v.co)); hi = Vector(map(max, hi, v.co))
    return lo, hi

def body_bvh(parts, skip=()):
    V, Fc, own = [], [], []
    for p in parts:
        if p.kind in skip or matname(p) != 'body': continue
        b0 = len(V); V += p.v
        for f in p.f:
            for t in ([f] if len(f) == 3 else [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]): Fc.append([i + b0 for i in t]); own.append(p.name)
    return BVHTree.FromPolygons(V, Fc), own

# ================================================================== the Burrow gate (kit special.js dungeonGate, 4 x 4)
# The kit's portal (drawn by the game): a disc of radius 0.61 centred 0.72 m up at game z = -0.12, a tunnel from game
# z 0.03 back to -0.32, spinning arcs at z -0.26, a purple light at (0, 0.9, 0.75). Door (0, 0, 0.85). Torii at z 1.55
# (w 1.8, h 1.85), toro at (+-1.55, 1.35), stone dogs at (+-0.75, 0.8), stepping stones z 0.6 -> 1.9.
PORTAL = dict(cy=0.72, r=0.61, z=-0.12)
TORII_Z = 1.75   # (round 2: the director's call; the kit stands it at 1.55)

def build_burrow():
    parts = []
    ST = stone_painter('#7c7488', '#a49cb0', '#cfc8d6', seed=1)
    STW = stone_painter('#787286', '#a099ac', '#cac4d2', warm='#dccab8', seed=2)
    MOSS = moss_painter(seed=1)
    TUFT = moss_painter(lo='#4e8a3a', mid='#78b04e', hi='#a8d878', seed=9)
    # ---- the mouth: a round-topped burrow arch round the kit's portal disc
    arch = Arch(a=0.66, ys=0.72, b=0.68, n=2.2)
    lip = Lip(arch, zc=0.04, w=0.25, D=0.22, e=0.62, seed=7, zfoot=0.08)
    LIPP = stone_painter('#6f687a', '#958ea0', '#c6bec8', seed=5)
    def lip_paint(part, p, n, meta):
        c = LIPP(part, p, n, meta)
        if meta and meta[0] is not None:
            inner = clamp(-math.cos(meta[0])) ** 1.5
            c = mixc(c, '#3a3046', inner * 0.6)
        return c
    parts.append(lip.build(lip_paint, step=0.2, K=8))
    rl = random.Random(21)
    sA, sB = arch.len * 0.3, arch.len * 0.7
    dl = [(rl.uniform(sA, sB), rl.uniform(0.14, 0.22), rl.uniform(0.15, 0.3)) for _ in range(3)]
    def lo_l(s):
        u = clamp((s - sA) / (sB - sA)); tp = math.sqrt(max(0.0, math.sin(PI * u))); return -0.45 * tp - 0.03
    def hi_l(s):
        u = clamp((s - sA) / (sB - sA)); tp = math.sqrt(max(0.0, math.sin(PI * u)))
        return (0.55 + sum(d * math.exp(-((s - c) / w) ** 2) for c, w, d in dl)) * tp + 0.03
    parts.append(strip_moss('lip_moss', lip.Sfn, sA, sB, int((sB - sA) / 0.12), lo_l, hi_l, 0.035, MOSS, ncross=3))
    # ---- the throat: a short dark plum tunnel (the game's portal disc stands in it at z -0.12)
    throat = Throat(arch, rings=[(0.2, 1.03, 1.02, 0.05), (0.02, 1.05, 1.03, 0.04), (-0.3, 1.0, 0.97, 0.04),
                                 (-0.6, 0.86, 0.84, 0.04), (-0.85, 0.62, 0.62, 0.05), (-1.0, 0.36, 0.38, 0.06)],
                    back=(-1.1, 0.5), fl0=0.05)
    def throat_paint(part, p, n, meta):
        lz = -p.y; t = clamp((0.3 - lz) / 1.3)
        c = mixc('#4a3c58', '#251b32', smooth(t * 2.4))
        c = mixc(c, '#17101f', smooth((t - 0.35) / 0.65))
        if n.z > 0.6: c = mixc(c, '#3a3044', 0.45 * (1 - t))
        return c
    parts.append(throat.build(throat_paint))
    # ---- the mound (game-local x, z, centre height, semi-axes)
    m = lambda **k: dict(dict(cover=0.66, drips=4, drop=0.55, t=0.05, front=0.6, nu=11), **k)
    B = []
    B.append(Boulder('jamb_l', -1.12, -0.16, 0.42, 0.44, 0.43, 0.74, yaw=0.12, exy=0.8, ez=0.7, seed=11,
                     moss=m(cover=0.66, tufts=3, tuft_paint=TUFT), carve='side', res=0.28))
    B.append(Boulder('jamb_r', 1.1, -0.2, 0.38, 0.42, 0.41, 0.68, yaw=-0.1, exy=0.8, ez=0.68, seed=12, tone=0.02,
                     moss=m(cover=0.64), carve='side', res=0.28))
    B.append(Boulder('lintel_l', -0.4, -0.32, 1.74, 0.58, 0.46, 0.38, hdn=0.34, yaw=0.18, exy=0.76, ez=0.74, seed=13,
                     ground=False, moss=m(cover=0.7, drips=3, front=0.9), carve='up', res=0.26))
    B.append(Boulder('lintel_r', 0.46, -0.27, 1.7, 0.52, 0.43, 0.36, hdn=0.32, yaw=-0.22, exy=0.76, ez=0.74, seed=31,
                     ground=False, moss=m(cover=0.68, drips=3, front=0.9), carve='up', res=0.26, tone=0.03))
    B.append(Boulder('shoulder_l', -1.06, -0.6, 1.22, 0.42, 0.42, 0.4, hdn=0.5, yaw=0.5, seed=14, ground=False,
                     moss=m(cover=0.64, drips=3), carve='side', res=0.28))
    B.append(Boulder('shoulder_r', 1.1, -0.66, 1.14, 0.4, 0.4, 0.38, hdn=0.5, yaw=-0.4, seed=15, ground=False,
                     moss=m(cover=0.62, drips=3), carve='side', res=0.28))
    B.append(Boulder('crest', 0.05, -1.08, 1.22, 0.86, 0.72, 1.0, yaw=0.08, exy=0.78, ez=0.82, seed=16, tone=0.02, taper=0.2,
                     moss=m(cover=0.68, drips=5, t=0.055), carve='back', res=0.36))
    B.append(Boulder('hill_l', -1.3, -1.08, 0.5, 0.58, 0.6, 0.86, yaw=-0.3, seed=17,
                     moss=m(cover=0.64, drips=3), carve='side', res=0.36))
    B.append(Boulder('hill_r', 1.32, -1.12, 0.45, 0.55, 0.58, 0.8, yaw=0.25, seed=18,
                     moss=m(cover=0.62, drips=3), carve='side', res=0.36))
    B.append(Boulder('back_l', -0.6, -1.5, 0.4, 0.6, 0.42, 0.85, yaw=0.2, seed=19, res=0.42,
                     moss=m(cover=0.62, drips=2), carve='back'))
    B.append(Boulder('back_r', 0.66, -1.55, 0.35, 0.55, 0.38, 0.76, yaw=-0.25, seed=20, res=0.42,
                     moss=m(cover=0.62, drips=2), carve='back'))
    B.append(Boulder('rock_fl', -1.62, 0.04, 0.08, 0.27, 0.25, 0.27, yaw=0.4, seed=23, res=0.16, exy=0.75, ez=0.7,
                     moss=m(cover=0.55, drips=2, drop=0.35, t=0.04, nu=10), carve=None))
    B.append(Boulder('rock_fr', 1.7, 0.02, 0.06, 0.24, 0.22, 0.24, yaw=-0.3, seed=24, res=0.16,
                     moss=m(cover=0.45, drips=0, t=0.035, nu=10), carve=None))
    B.append(Boulder('rock_back', 1.52, -1.6, 0.1, 0.26, 0.24, 0.28, yaw=-0.6, seed=25, res=0.18,
                     moss=m(cover=0.5, drips=1, drop=0.35, t=0.04, nu=10), carve=None))
    for i, b in enumerate(B):
        sp = b.build(ST if i % 2 == 0 else STW); parts.append(sp)
        if b.moss:
            mp = boulder_moss(b, MOSS, stone=sp); parts.append(mp)
            if hasattr(mp, 'tufts'): parts.append(mp.tufts)
    # ---- stepping stones up to the mouth (kit stepStones z 0.6 -> 1.9) and a threshold stone
    SP = step_painter(seed=4)
    rs = random.Random(5)
    stones = [(0.0, 0.43, 0.46, 0.15, 0.05, 0.0)] + [(rs.uniform(-0.07, 0.07), 0.6 + 1.3 * (i + 0.5) / 4, rs.uniform(0.22, 0.26), rs.uniform(0.17, 0.2), 0.035, rs.uniform(-0.3, 0.3)) for i in range(4)]
    for k, (x, z, hx, hz, top, yaw) in enumerate(stones):
        R = Matrix.Rotation(yaw, 3, 'Z')
        parts.append(slab(f'step_{k}', 'step', SP, hx, hz, top, rc=min(hx, hz) * 0.6, rb=0.03, nc=2, dish=0.006, wob=0.03, seed=40 + k,
                          xf=lambda q, x=x, z=z, R=R: R @ Vector((q.x, -q.y, q.z)) + L(x, 0, z)))
    # ---- the cave's shimenawa across the mouth with three shide, and three paper ofuda on the rim
    ROPE = rope_painter()
    def crp(s): return L(-0.84 + 1.68 * s, 1.66 - math.sin(PI * s) * 0.07, 0.3)
    rope = Beam(crp, UP, lambda s: 0.05 * (0.8 + 0.4 * math.sin(PI * s)), lambda s: 0.05 * (0.8 + 0.4 * math.sin(PI * s)),
                e=1.0, cap=0.04, twist=(0.14, 0.3))
    parts.append(rope.build('cave_rope', 'rope', ROPE, K=7, step=0.12, capn=1))
    PAPER = flat_painter('#fff6ea', '#f3eadc', shade=0.1)
    for k, t in enumerate((0.27, 0.5, 0.73)):
        parts += zigzag_shide(f'cave_shide_{k}', crp(t) + Vector((0, -0.055, -0.04)), PAPER, scale=0.5)
    for k, f in enumerate((0.2, 0.37, 0.8)):
        s = arch.len * f; pt, nn = lip.Sfn(s, PI / 2 + 0.25)
        parts += ofuda(f'ofuda_{k}', pt + nn * 0.012, nn)
    # ---- the vermilion torii (kit: w 1.8, h 1.85; moved out from the kit's z 1.55 to 1.75 to clear the portal at 45 deg):
    #      the gate kit's torii at 0.6 scale, no rope of its own
    tp = torii(z=0.0, w=3.0, h=3.1, moss_top=False, rope=False, lod=0.75, post_moss=0.2)
    xf_parts(tp, Matrix.Translation(L(0, 0, TORII_Z)) @ Matrix.Scale(0.6, 4))
    parts += tp
    # ---- toro, stone dogs, the offering stand, bush, bamboo
    parts += toro('toro_l', L(-1.55, 0, 1.35), s=0.72, yaw=0.12, seed=3)
    parts += toro('toro_r', L(1.55, 0, 1.35), s=0.72, yaw=-0.1, seed=6)
    parts += stone_dog('dog_l', L(-0.75, 0, 0.8), s=0.68, yaw=0.3, ball=1, seed=7)
    parts += stone_dog('dog_r', L(0.75, 0, 0.8), s=0.68, yaw=-0.3, ball=-1, seed=8)
    WOOD = solid_painter('#c49668', top=0.1, bot=0.25, seed=3)
    WOODL = solid_painter('#e8cfa0', top=0.08, seed=4)
    st = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            pp = Part(f'stand_leg{sx}{sz}', 'wood', paint=WOOD, closed=True)
            box_flat(pp, Vector((sx * 0.14, sz * 0.1, 0.13)), 0.025, 0.025, 0.28); st.append(pp)
    pp = Part('stand_top', 'wood', paint=WOOD, closed=True); box_flat(pp, Vector((0, 0, 0.42)), 0.19, 0.15, 0.025); st.append(pp)
    pp = Part('stand_tray', 'wood', paint=WOODL, closed=True); box_flat(pp, Vector((0, 0, 0.462)), 0.13, 0.11, 0.018); st.append(pp)
    MOCHI = solid_painter('#fff6ea', top=0.04, bot=0.12)
    st.append(ellipsoid('mochi_1', 'food', MOCHI, Vector((0, 0, 0.52)), 0.095, 0.095, 0.05, K=10, J=5))
    st.append(ellipsoid('mochi_2', 'food', MOCHI, Vector((0, 0, 0.575)), 0.07, 0.07, 0.04, K=10, J=5))
    st.append(ellipsoid('mochi_orange', 'food', solid_painter('#ffa040', top=0.1), Vector((0, 0, 0.625)), 0.04, 0.04, 0.035, K=8, J=5))
    st.append(ellipsoid('mochi_leaf', 'leaf', solid_painter('#5a9a48'), Vector((0.03, -0.06, 0.55)), 0.08, 0.035, 0.012,
                        M=Matrix.Rotation(0.4, 4, 'Z') @ Matrix.Rotation(-0.3, 4, 'X'), K=6, J=3))
    parts += xf_parts(st, Matrix.Translation(L(-1.1, 0, 0.5)) @ Matrix.Rotation(0.35, 4, 'Z'))
    parts += bush('bush_l', L(-1.68, 0, 0.6), r=0.24, seed=31, nf=5, K=8, J=4)
    parts += bamboo_clump('bamboo_r', L(1.72, 0, 0.55), n=3, h=1.7, seed=41)
    # ---- carve the mass clear of the throat
    for p in parts:
        if p.carve and p.kind in ('stone', 'moss'):
            mv = carve(p, throat, p.carve)
            if mv: print(f'PLAZA carve {p.name}: {mv} verts ({p.carve})')
    # ---- little flowers on the moss caps
    mossy = [p for p in parts if p.kind == 'moss' and p.name.endswith('_moss')]
    mb, own = body_bvh(mossy)
    fl = [(-1.2, -0.08, '#f590b8'), (-1.04, -0.2, '#fff1e2'), (-1.3, -0.3, '#f590b8'), (1.16, -0.12, '#b996ee'),
          (-0.55, -0.3, '#f590b8'), (0.6, -0.22, '#fff1e2'), (0.15, -0.9, '#b996ee'),
          (-1.35, -0.95, '#fff1e2')]
    for k, (x, z, c) in enumerate(fl):
        h = mb.ray_cast(L(x, 6, z), Vector((0, 0, -1)), 12)
        if h[0] is None: print('PLAZA flower not on moss', x, z); continue
        n = h[1] if h[1].z > 0 else -h[1]
        parts.append(flower(f'flower_{k}', h[0] + n * 0.004, n, 0.085 + 0.015 * (k % 3), c, '#ffd166', seed=k))
    return parts, dict(arch=arch, throat=throat, lip=lip)

def checks_burrow(parts, info, obs):
    R = {}
    arch, throat = info['arch'], info['throat']
    cy, r, pz = PORTAL['cy'], PORTAL['r'], PORTAL['z']
    ring = [(math.cos(TAU * k / 64) * r, cy + math.sin(TAU * k / 64) * r) for k in range(64)]
    R['portal_disc'] = {'centre_h': cy, 'r': r, 'game_z': pz,
                        'inside_arch_opening': all(arch.inside(x, y) for x, y in ring),
                        'inside_throat_at_disc_z': all(throat.inside(L(x, y, pz), 0.0) for x, y in ring),
                        'inside_throat_at_kit_tunnel_front_z0.03': all(throat.inside(L(x, y, 0.03), 0.0) for x, y in ring),
                        'opening_inner_w': round(2 * arch.a, 3), 'opening_inner_top_h': round(arch.ys + arch.b, 3)}
    mass, mown = body_bvh(parts, skip=('torii', 'rope', 'shide', 'flower', 'throat'))
    dress, down = body_bvh([p for p in parts if p.kind in ('torii', 'rope', 'shide')])
    occl = {}
    for nm, (yw, pt) in {'front_level': (0, 0), 'yaw0_pitch45': (0, 45), 'yaw+45_pitch45': (45, 45), 'yaw-45_pitch45': (-45, 45)}.items():
        d = Vector((math.sin(math.radians(yw)) * math.cos(math.radians(pt)), -math.cos(math.radians(yw)) * math.cos(math.radians(pt)), math.sin(math.radians(pt))))
        tot = om = od = 0; who = {}; dwho = {}
        for ix in range(21):
            for iy in range(21):
                x = -r + (ix + 0.5) * 2 * r / 21; y = cy - r + (iy + 0.5) * 2 * r / 21
                if x * x + (y - cy) ** 2 > r * r: continue
                o = L(x, y, pz) + d * 0.01; tot += 1
                h = mass.ray_cast(o, d, 40)
                if h[0] is not None: om += 1; who[mown[h[2]]] = who.get(mown[h[2]], 0) + 1
                else:
                    hd = dress.ray_cast(o, d, 40)
                    if hd[0] is not None: od += 1; dw = down[hd[2]].split('_')[0]; dwho[dw] = dwho.get(dw, 0) + 1
        occl[nm] = {'by_mass_pct': round(100 * om / tot, 1), 'by_torii_rope_pct': round(100 * od / tot, 1),
                    'mass_blockers': dict(sorted(who.items(), key=lambda kv: -kv[1])[:5]), 'dress_blockers': dwho}
    R['portal_occlusion'] = occl
    allb, aown = body_bvh(parts)
    spots = {}
    for nm, x, z, rr in (('door', 0.0, 0.85, 0.3), ('torii_walk_through', 0.0, TORII_Z, 0.3)):
        top = -9; who = None
        for k in range(9):
            a = TAU * k / 8; q = 0 if k == 8 else rr
            h = allb.ray_cast(L(x + math.cos(a) * q, 1.2, z + math.sin(a) * q), Vector((0, 0, -1)), 3)
            if h[0] is not None and h[0].z > top: top = h[0].z; who = aown[h[2]]
        spots[nm] = {'x': x, 'z': z, 'r': rr, 'top_below_1.2m': round(top, 3), 'what': who}
    R['spots'] = spots
    return R

# ================================================================== the plaza fountain (kit decor.js fountain, 2 x 2)
# Kit numbers kept: coping top 0.37 with its lip out to ~0.94 (villagers sit on it); lower water 0.31; the upper bowl's
# petal tips at r ~0.47, y ~1.08 at the six jet angles (game k * 60 deg); upper water 1.035; the bud spout's tip at
# 1.27 (the central jet starts there); ripple rings at r 0.71, y 0.32. Door (0, 0, 1.1). Height 1.9 with the jet.
def build_fountain():
    parts = []
    SB = stone_painter('#968a98', '#c0b4b8', '#e4dad4', warm='#f0d8c4', seed=11)
    # paving ring: sixteen cut stones in two tones, moss in the joints
    for k in range(10):
        a0 = TAU * k / 10 + 0.016; a1 = TAU * (k + 1) / 10 - 0.016
        tn = 1.0 if k % 2 == 0 else 0.94
        base = step_painter(top=mulc('#e8d8be', tn), side=mulc('#b4a28a', tn), mossc='#86ac54', seed=20 + k)
        def pave(part, p, n, meta, base=base):
            c = base(part, p, n, meta)
            if meta and meta[0] == 'blk':
                u = meta[1]; e = max(clamp(1 - u / 0.12), clamp((u - 0.88) / 0.12))
                if n.z > 0.2: c = mixc(c, '#86ac54', e * clamp((vnoise(p, 9.0, 3) - 0.3) * 2.5) * 0.6)
            return c
        parts.append(arc_block(f'pave_{k}', 'step', pave, a0, a1, 0.8, 1.0, GROUND, 0.06, 0.03, na=1, full=False))
    # basin wall: foot moulding, the wall, a carved bead; the top closed at 0.29 (the pool floor under the water)
    def basin_paint(part, p, n, meta):
        c = SB(part, p, n, meta)
        rad = math.hypot(p.x, p.y)
        if 0.2 < p.z < 0.25 and rad > 0.84: c = mixc(c, '#efe6e0', 0.75)          # the carved bead
        if p.z < 0.13 and rad > 0.83:                                           # moss creeping round the foot
            c = mixc(c, '#76a04c', clamp((vnoise(p, 7.0, 5) - 0.5) * 3.0) * clamp((0.13 - p.z) / 0.08) * 0.7)
        if p.z > 0.285 and n.z > 0.8:                                           # the pool floor: deep teal
            c = mixc('#1e4e66', '#2e7590', clamp(rad / 0.85))
        return c
    wall = lathe2('basin', 'stone', basin_paint, Vector((0, 0, 0)),
                  [(0.83, GROUND), (0.84, 0.04), (0.88, 0.08), (0.866, 0.12), (0.85, 0.135), (0.85, 0.2),
                   (0.872, 0.222), (0.85, 0.245), (0.85, 0.28), (0.6, 0.29)], K=40)
    parts.append(wall)
    # the coping: sixteen chunky rounded stones, seams on the lobe crests and hollows
    coping = []
    for k in range(8):
        a0 = PI / 8 + PI / 4 * k + 0.012; a1 = PI / 8 + PI / 4 * (k + 1) - 0.012
        tn = 1.0 + 0.04 * math.sin(k * 2.3)
        PALE = stone_painter(mulc('#b4a8ae', tn), mulc('#dcd2ce', tn), mulc('#f4ece6', tn), warm='#f8e4d0', seed=40 + k)
        coping.append(arc_block(f'coping_{k}', 'stone', PALE, a0, a1, 0.8, 0.92, 0.268, 0.37, 0.04, na=3, full=True))
    parts += coping
    # lower water (object `water`)
    WP = lambda part, p, n, meta: mixc('#3a9cc8', '#86d4ec', clamp(math.hypot(p.x, p.y) / 0.76) ** 2)
    w1 = lathe2('water_low', 'water', WP, Vector((0, 0, 0)), [(0.83, 0.31), (0.45, 0.31)], K=40, pole0=False, ao=0.0)
    w1.obj = 'water'; w1.mat = 'water_glow'; parts.append(w1)
    lobe_parts([wall, w1] + coping, 8, 0.042, absolute=True)
    # pedestal: coin step, fluted column, a flared capital
    flute = lambda r, z, th: r * (1 + 0.1 * math.cos(8 * th)) if 0.47 < z < 0.77 else r
    def ped_paint(part, p, n, meta):
        c = SB(part, p, n, meta)
        if meta and meta[0] == 'lathe' and meta[1] is not None and 0.47 < p.z < 0.77:
            c = mulc(c, 0.88 + 0.14 * (0.5 + 0.5 * math.cos(8 * meta[1])))
        return c
    parts.append(lathe2('pedestal', 'stone', ped_paint, Vector((0, 0, 0)),
                        [(0.33, 0.24), (0.335, 0.36), (0.32, 0.39), (0.29, 0.402), (0.2, 0.406), (0.2, 0.43), (0.15, 0.47),
                         (0.13, 0.62), (0.12, 0.76), (0.15, 0.8), (0.19, 0.83), (0.19, 0.85)], K=24, rfn=flute))
    rc = random.Random(9)
    GOLDC = lacquer_painter('#e8b440', '#a87420', '#ffe08a', spec='#fff4c8', sheen=0.8)
    for i in range(6):
        a = rc.uniform(0, TAU); d = rc.uniform(0.23, 0.28)
        cn = lathe2(f'coin_{i}', 'coin', GOLDC, Vector((math.cos(a) * d, math.sin(a) * d, 0.402 + (0.012 if i % 4 == 0 else 0.0))),
                    [(0.036, 0.0), (0.036, 0.014)], K=7, ao=0.4)
        parts.append(cn)
    # the lotus bowl: twelve petals swelling round the outside, their tips lifting the rim into points
    PALEB = stone_painter('#b0a4aa', '#d8cec8', '#f2eae4', warm='#f8e4d0', seed=60)
    def bowl_paint(part, p, n, meta):
        c = PALEB(part, p, n, meta)
        pet = abs(math.cos(6 * math.atan2(p.y, p.x)))
        if n.z < 0.7: c = mulc(c, 0.86 + 0.16 * pet)                         # petal ridges on the outside
        if p.z < 1.04 and n.z > 0.85 and math.hypot(p.x, p.y) < 0.37: c = mixc('#1e4e66', '#2e7590', math.hypot(p.x, p.y) / 0.37)
        return c
    bowl = lathe2('bowl', 'stone', bowl_paint, Vector((0, 0, 0)),
                  [(0.14, 0.84), (0.32, 0.915), (0.45, 1.045), (0.43, 1.072), (0.37, 1.062), (0.2, 1.012)], K=48)
    nv = []
    for v in bowl.v:
        rad = math.hypot(v.x, v.y)
        if rad < 0.1: nv.append(v); continue
        pet = abs(math.cos(6 * math.atan2(v.y, v.x))) ** 3
        t = clamp((v.z - 0.86) / 0.2) * clamp((rad - 0.34) * 10)
        k = 1 + 0.07 * pet * t
        nv.append(Vector((v.x * k, v.y * k, v.z + 0.05 * pet * t * t)))
    bowl.v = nv; parts.append(bowl)
    w2 = lathe2('water_up', 'water', WP, Vector((0, 0, 0)), [(0.36, 1.035)], K=24, pole0=False, ao=0.0)
    w2.obj = 'water'; w2.mat = 'water_glow'; parts.append(w2)
    # the lotus-bud spout and its ring of opening petals
    BUD = lambda part, p, n, meta: mulc(mixc('#ffe8f0', '#ff8fb8', clamp((p.z - 1.08) * 5)), 0.9 + 0.1 * clamp(n.z + 0.5))
    parts.append(lathe2('bud', 'stone', BUD, Vector((0, 0, 1.03)),
                        [(0.04, 0.0), (0.075, 0.04), (0.088, 0.08), (0.08, 0.14), (0.05, 0.2), (0.018, 0.24)], K=12,
                        rfn=lambda r, z, th: r * (1 + 0.1 * math.cos(6 * th))))
    PET = lambda part, p, n, meta: mixc('#fff0f6', '#ff9cc4', clamp((math.hypot(p.x, p.y) - 0.07) * 9))
    for k in range(6):
        a = TAU * k / 6 + PI / 6
        parts.append(ellipsoid(f'budpetal_{k}', 'stone', PET, Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, 1.072)), 0.08, 0.048, 0.022,
                               M=Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-0.5, 4, 'Y'), K=6, J=3, ao=0.5))
    # pool life: koi, notched lily pads with a lotus flower, drifting petals
    for i in range(3):
        ga = i * 2.1 + 1.1; d = 0.5 + (i % 2) * 0.05; b = -ga
        c = Vector((math.cos(b) * d, math.sin(b) * d, 0.308))
        hd = b + (0.25 if i % 2 else -0.2)
        M = Matrix.Rotation(hd, 4, 'Z'); R3 = M.to_3x3(); Ri = R3.transposed()
        def koi_paint(part, p, n, meta, c=c, Ri=Ri, i=i):
            q = Ri @ (p - c)
            col = '#fff6ea'
            if i != 1 and math.sin(q.y * 55 + i) > -0.2: col = '#ff6a3a' if i else '#ff8a3a'
            if i == 1 and q.y > 0.02: col = '#ff5a3a'
            return mulc(col, 0.9 + 0.12 * clamp(n.z))
        parts.append(ellipsoid(f'koi_{i}', 'koi', koi_paint, c, 0.045, 0.105, 0.028, M=M, K=8, J=5, ao=0.3))
        parts.append(ellipsoid(f'koi_{i}_tail', 'koi', solid_painter('#fff6ea' if i == 1 else '#ff9a5a'), c + R3 @ Vector((0, -0.13, 0.008)),
                               0.055, 0.04, 0.012, M=M, K=8, J=3, ao=0.3))
    PAD = lambda part, p, n, meta: mulc(mixc('#5aa84a', '#8ccf6a', 0.6 if meta and meta[0] == 'top' else 0.0), 1.0 if n.z > 0 else 0.75)
    rp = random.Random(4)
    pads = [(0.35, 0.58, 0.11), (2.6, 0.6, 0.09), (4.3, 0.55, 0.1), (5.2, 0.62, 0.08)]
    for i, (ga, d, r) in enumerate(pads):
        cx, cy = math.cos(-ga) * d, math.sin(-ga) * d
        nt = rp.uniform(0, TAU)
        out = [(cx + math.cos(nt) * r * 0.12, cy + math.sin(nt) * r * 0.12)]
        for j in range(10):
            a = nt + 0.32 + (TAU - 0.64) * j / 9
            out.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        parts.append(flat_shape(f'pad_{i}', 'pad', PAD, out, (cx, cy), 0.318, 0.02, dome=0.008, ao=0.4))
        if i == 0:
            parts.append(flower('lotus_out', Vector((cx, cy, 0.335)), UP, 0.085, '#ff9cc4', '#ffd84a', seed=3))
            parts.append(flower('lotus_in', Vector((cx, cy, 0.355)), UP, 0.055, '#fff0f6', '#ffd84a', seed=4))
    for i in range(4):
        a = rp.uniform(0, TAU); d = rp.uniform(0.3, 0.68); cx, cy = math.cos(a) * d, math.sin(a) * d; ro = rp.uniform(0, TAU)
        out = [(cx + math.cos(ro + TAU * j / 7) * 0.04 * (1.0 if j % 7 else 0.7), cy + math.sin(ro + TAU * j / 7) * 0.026) for j in range(7)]
        parts.append(flat_shape(f'petal_{i}', 'pad', solid_painter(['#ffc4dc', '#ffb0cc', '#ffe0ec'][i % 3]), out, (cx, cy), 0.313, 0.01, ao=0.2))
    # two flower pots at the footprint's corners (kit: game (-0.85, 0.85), (0.85, -0.85))
    POT = lambda part, p, n, meta: mixc(mulc('#c8683e', 0.85 + 0.2 * clamp(n.dot(LDIR) * 0.5 + 0.5)), '#6b5546',
                                        1.0 if (n.z > 0.8 and math.hypot(p.x - part.c.x, p.y - part.c.y) < 0.11) else 0.0)
    for k, (x, y) in enumerate(((-0.8, -0.8), (0.8, 0.8))):
        c = Vector((x, y, 0))
        pot = lathe2(f'pot_{k}', 'pot', POT, c, [(0.09, -0.05), (0.1, 0.02), (0.125, 0.17), (0.145, 0.185), (0.145, 0.225), (0.115, 0.205)], K=10)
        pot.c = c; parts.append(pot)
        parts += bush(f'potplant_{k}', c + Vector((0, 0, 0.15)), r=0.12, flowers=('#ff8fb0', '#fff1e2'), seed=50 + k, nf=5, K=8, J=4, nl=4, fr=0.045)
    return parts, {}

def checks_fountain(parts, info, obs):
    R = {}
    cop = [p for p in parts if p.name.startswith('coping_')]
    zs = [v.z for p in cop for v in p.v]; rs = [math.hypot(v.x, v.y) for p in cop for v in p.v]
    R['rim'] = {'coping_top': round(max(zs), 3), 'coping_outer_r_max': round(max(rs), 3), 'coping_outer_r_min_at_hollows': None,
                'kit': {'top': 0.37, 'lip_out_to': 0.94}}
    w = [p for p in parts if getattr(p, 'obj', 'main') == 'water']
    R['water'] = {p.name: {'z': round(p.v[0].z, 3), 'r_max': round(max(math.hypot(v.x, v.y) for v in p.v), 3)} for p in w}
    bowl = next(p for p in parts if p.name == 'bowl')
    tips = []
    for k in range(6):
        a = -TAU * k / 6
        best = max(bowl.v, key=lambda v: (v.x * math.cos(a) + v.y * math.sin(a)) - 2 * abs(-v.x * math.sin(a) + v.y * math.cos(a)))
        tips.append([round(math.hypot(best.x, best.y), 3), round(best.z, 3)])
    R['petal_tips_at_jet_angles_r_h'] = tips
    R['jet_kit'] = {'arc_start_r_h': [0.47, 1.08], 'central_jet_start_h': 1.27, 'ripple_rings_r_h': [0.71, 0.32]}
    bud = next(p for p in parts if p.name == 'bud')
    R['bud_tip_h'] = round(max(v.z for v in bud.v), 3)
    allb, own = body_bvh(parts)
    # the ripple rings sit on open water (nothing above them but the arcs)
    blocked = []
    for k in range(6):
        a = -TAU * k / 6
        h = allb.ray_cast(Vector((math.cos(a) * 0.71, math.sin(a) * 0.71, 3)), Vector((0, 0, -1)), 5)
        if h[0] is not None and h[0].z > 0.3: blocked.append((k, own[h[2]], round(h[0].z, 3)))
    R['ripple_ring_spots_blocked'] = blocked
    return R

# ================================================================== the Chewy statue (kit decor.js chewyStatue, 2 x 2)
# Kit numbers kept: a three-tier stepped plinth (1.6 / 1.2 / 0.86 wide), the gold paw plaque on the top tier's front
# (centre 0.64 up at game z 0.435), the statue standing on the top (0.84 -> 0.86 with the cornice), a ring of flowers on
# the middle tier, a shrub at each corner. Door (0, 0, 1.1); height ~2.3 (the raised bone reaches 2.5).
# Chewy is the Toybox Chewy (chewy-b sheet-B) as a beloved stone toy (round 3): sitting, chubby and round, the head ~45%
# of the figure's height, big carved eyes (a shallow oval recess, deeper under the brow, a big raised pupil, a gilded
# catchlight) that read from 20 m, a wide open smile, floppy ears, only the sash band of the gi, a short tail; the gilded
# bone held up high in one paw; a real red scarf tied on; soft moss on the head and shoulders.
STATUE = dict(S=1.0, Z0=0.865)

def build_statue():
    parts = []
    S, Z0 = STATUE['S'], STATUE['Z0']
    def C(x, h, z): return L(x * S, Z0 + h * S, z * S)
    def E(name, pnt, c, r, M=None, K=10, J=6, ao=1.0):
        return ellipsoid(name, 'stone', pnt, C(*c), r[0] * S, r[1] * S, r[2] * S, M=M, K=K, J=J, ao=ao)
    def tube_(name, pnt, pts, r0, r1, K=8, step=0.06, kind='stone', cap=True):
        path, rad = spline([(C(*p), 1.0) for p in pts], per=12)
        bm = Beam(path, Vector((0, 0, 1)), lambda s: (r0 + (r1 - r0) * s) * S, lambda s: (r0 + (r1 - r0) * s) * S, e=1.0, cap=min(r0, r1) * S)
        return bm.build(name, kind, pnt, K=K, step=step * S, capn=2, cap0=cap, cap1=cap)
    def loop_(name, pnt, c, rx, rz, r, K=6, n=14, kind='stone', tilt=0.0):
        cx, h, cz = c
        path = lambda s: C(cx + math.cos(TAU * s) * rx, h + math.sin(TAU * s) * rz * tilt, cz + math.sin(TAU * s) * rz)
        bm = Beam(path, Vector((0, 0, 1)), lambda s: r * S, lambda s: r * S, e=1.0, cap=0.001)
        p = bm.build(name, kind, pnt, K=K, step=bm.len / n, capn=1, cap0=False, cap1=False)
        return p
    # stone tones: the fur a pale warm stone, the belly / muzzle lighter; soft moss on the head top and the shoulders
    FUR = moss_stone(stone_painter('#9c94a0', '#c6bec4', '#e6e0dc', warm='#f0e0d0', seed=71), 0.34, 71)
    FUR2 = moss_stone(stone_painter('#968e9a', '#c0b8be', '#e0dad6', warm='#f0e0d0', seed=72), 0.2, 72)
    LIGHT = stone_painter('#b0a8ae', '#dcd6d4', '#f2ece6', warm='#f8e8dc', seed=73)
    SASH = stone_painter('#857d8b', '#a8a0ac', '#c8c0c8', seed=74)
    DARK = solid_painter('#4c4456', top=0.12)
    RED = lacquer_painter('#e0503a', '#a63428', '#f88a6a', spec='#ffd8c0', sheen=0.45)
    GOLD = lacquer_painter('#e8b440', '#a87420', '#ffe08a', spec='#fff4c8', sheen=0.8)
    def dirB(n): return Vector((n[0], -n[2], n[1])).normalized()          # a local (x, up, z-front) direction -> Blender
    # ---- the body: sitting, chubby and round; a lighter belly; round thighs with the hind feet poking forward
    parts.append(E('body', FUR2, (0, 0.33, -0.02), (0.3, 0.27, 0.32), K=12, J=7))
    parts.append(E('belly', LIGHT, (0, 0.33, 0.075), (0.21, 0.17, 0.23), M=Matrix.Rotation(PI / 2, 4, 'X'), K=12, J=5))
    for sx in (-1, 1):
        parts.append(E(f'thigh{sx}', FUR2, (sx * 0.2, 0.14, 0.05), (0.15, 0.19, 0.13), K=10, J=6))
        parts.append(E(f'foot{sx}', LIGHT, (sx * 0.18, 0.065, 0.22), (0.1, 0.12, 0.065), K=9, J=5))
    # the gi's sash band (the only gi detail), a knot at the side
    parts.append(loop_('sash', SASH, (0, 0.37, -0.01), 0.305, 0.285, 0.034, K=6, n=18))
    parts.append(E('sash_knot', SASH, (-0.17, 0.37, 0.25), (0.06, 0.045, 0.05), K=8, J=5))
    # ---- the head: big (0.54 of the 1.13 m figure), full cheeks, muzzle, nose, a wide open smile
    HC, HR = (0.0, 0.86, 0.04), (0.33, 0.27, 0.29)                           # centre; radii x, up, z
    parts.append(E('head', FUR, HC, (HR[0], HR[2], HR[1]), K=14, J=9))
    def head_at(x, h, out=0.0):
        """the point on the head's front at local (x, h) and its outward normal, pushed out by `out`"""
        u, v = x / HR[0], (h - HC[1]) / HR[1]
        w = math.sqrt(max(0.0, 1 - u * u - v * v))
        z = HC[2] + HR[2] * w
        n = dirB((x / HR[0] ** 2, (h - HC[1]) / HR[1] ** 2, (z - HC[2]) / HR[2] ** 2))
        return C(x, h, z) + n * out, n
    for sx in (-1, 1):
        parts.append(E(f'cheek{sx}', FUR, (sx * 0.17, 0.75, 0.14), (0.14, 0.12, 0.11), K=10, J=6))
    parts.append(E('muzzle', LIGHT, (0, 0.755, 0.24), (0.135, 0.095, 0.09), K=12, J=6))
    parts.append(E('nose', DARK, (0, 0.81, 0.325), (0.062, 0.042, 0.045), K=10, J=5))
    parts.append(E('mouth', DARK, (0, 0.712, 0.296), (0.095, 0.05, 0.042), M=Matrix.Rotation(-0.35, 4, 'X'), K=12, J=5))
    parts.append(E('tongue', solid_painter('#dcb2b2', top=0.12), (0, 0.698, 0.322), (0.05, 0.03, 0.022), M=Matrix.Rotation(-0.3, 4, 'X'), K=8, J=4))
    for sx in (-1, 1):                     # the smile's corners, tucked up into the cheeks
        parts.append(E(f'smile{sx}', DARK, (sx * 0.085, 0.725, 0.29), (0.03, 0.018, 0.02), M=Matrix.Rotation(sx * 0.6, 4, 'Y'), K=6, J=3))
    # ---- big carved eyes (round 4): a shallow, softly carved oval recess (painted deeper at the top, as if under the brow),
    #      a big raised round pupil filling ~60% of it, a gilded catchlight at its upper
    #      outer side. No rim. The recess is ~0.13 m tall / 0.12 m wide: about 0.2 of the head's width.
    for sx in (-1, 1):
        pc, n = head_at(sx * 0.125, 0.89)
        Q = n.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        uax = (Q.to_3x3() @ Vector((1, 0, 0))); vax = (Q.to_3x3() @ Vector((0, 1, 0)))
        def recess(part, p, nn, meta, pc=pc, vax=vax, uax=uax):
            t = (p - pc).dot(vax) / 0.065; r = math.hypot((p - pc).dot(uax) / 0.06, t)
            c = mixc('#a8a0ae', '#5e5668', smooth((t + 0.2) / 1.1))           # deeper (darker) toward the top
            return mixc(c, '#b4acb6', smooth((r - 0.78) / 0.22) * 0.6)         # soft edge into the face
        parts.append(ellipsoid(f'eye_recess{sx}', 'statue', recess, pc - n * 0.005, 0.06, 0.065, 0.008, M=Q, K=14, J=3, ao=0.0))
        pp = pc + n * 0.003 + vax * -0.01 + uax * (-sx * 0.003)
        parts.append(ellipsoid(f'eye_pupil{sx}', 'statue', DARK, pp, 0.044, 0.046, 0.016, M=Q, K=12, J=3, ao=0.2))
        parts.append(ellipsoid(f'eye_glint{sx}', 'gold', GOLD, pp + n * 0.014 + vax * 0.02 + uax * (sx * 0.018), 0.016, 0.016, 0.01, M=Q, K=8, J=3, ao=0.0))
    # ---- floppy ears: broad flaps from the top of the head, flopping over and down the sides
    for sx in (-1, 1):
        ep, er = spline([(C(sx * 0.17, 1.07, -0.03), 1.0), (C(sx * 0.29, 1.06, -0.01), 1.0), (C(sx * 0.355, 0.96, 0.03), 1.0),
                         (C(sx * 0.37, 0.81, 0.07), 1.0)], per=10)
        ear = Beam(ep, Vector((sx * 0.9, 0, 0.45)), lambda q: 0.115 - 0.025 * q * q, lambda q: 0.042 - 0.008 * q, e=0.8, cap=0.045)
        parts.append(ear.build(f'ear{sx}', 'statue', FUR, K=8, step=0.05, capn=2))
    # ---- arms: chubby; the right paw holds the gilded bone up high, the left rests on its thigh
    parts.append(tube_('arm_r', FUR2, [(0.24, 0.5, 0.05), (0.38, 0.6, 0.1), (0.47, 0.72, 0.12)], 0.075, 0.07, K=8, step=0.06))
    parts.append(E('paw_r', LIGHT, (0.48, 0.75, 0.12), (0.085, 0.08, 0.08), K=9, J=5))
    parts.append(tube_('arm_l', FUR2, [(-0.25, 0.5, 0.04), (-0.32, 0.38, 0.12), (-0.28, 0.27, 0.2)], 0.075, 0.07, K=8, step=0.06))
    parts.append(E('paw_l', LIGHT, (-0.27, 0.25, 0.23), (0.085, 0.08, 0.075), K=9, J=5))
    # the gilded bone: a red-wrapped grip in the paw, the long bone above, round knuckle ends
    parts.append(tube_('bone_blade', GOLD, [(0.49, 0.79, 0.12), (0.5, 1.02, 0.11), (0.52, 1.27, 0.1)], 0.04, 0.036, K=8, step=0.12, kind='gold'))
    parts.append(tube_('bone_grip', RED, [(0.48, 0.79, 0.12), (0.475, 0.66, 0.125)], 0.044, 0.044, K=8, step=0.05, kind='cloth'))
    for sx in (-1, 1):
        parts.append(E(f'bone_top{sx}', GOLD, (0.52 + sx * 0.048, 1.3, 0.1), (0.058, 0.052, 0.058), K=8, J=5))
        parts.append(E(f'bone_bot{sx}', GOLD, (0.475 + sx * 0.042, 0.63, 0.125), (0.052, 0.048, 0.052), K=8, J=4))
    # ---- a short tail, curled up behind
    parts.append(tube_('tail', FUR2, [(0.0, 0.18, -0.26), (0.02, 0.26, -0.36), (0.05, 0.34, -0.34)], 0.065, 0.045, K=7, step=0.06))
    # ---- the red scarf: a collar under the chin, a knot, two short tails
    parts.append(loop_('scarf', RED, (0, 0.625, 0.02), 0.25, 0.225, 0.042, K=6, n=16, kind='cloth'))
    parts.append(E('scarf_knot', RED, (0.06, 0.6, 0.24), (0.06, 0.045, 0.05), K=8, J=5))
    for k, dx in enumerate((0.0, 0.11)):
        parts.append(tube_(f'scarf_tail{k}', RED, [(0.06, 0.585, 0.25), (0.04 + dx * 0.5, 0.53, 0.27), (0.02 + dx, 0.47, 0.265)], 0.034, 0.026, K=6, step=0.05, kind='cloth'))
    for p in parts:
        if p.kind == 'stone': p.kind = 'statue'
    # ---- the stepped plinth (kit tiers 1.6 / 1.2 / 0.86 wide, tops 0.2 / 0.48 / 0.84) with a cornice
    T1 = moss_stone(stone_painter('#7e7684', '#a29aa8', '#c6bec8', seed=81), 0.5, 81)
    T2 = moss_stone(stone_painter('#888090', '#aea6b2', '#d2cad2', seed=82), 0.42, 82)
    T3 = moss_stone(stone_painter('#928a98', '#bab2bc', '#ddd6da', seed=83), 0.3, 83)
    up = lambda q: Vector((q.x, -q.y, q.z))
    parts.append(slab('tier1', 'stone', T1, 0.8, 0.8, 0.2, bottom=GROUND, rc=0.12, rb=0.05, nc=3, dish=0.0, wob=0.01, seed=1, xf=up))
    parts.append(slab('tier2', 'stone', T2, 0.6, 0.6, 0.48, bottom=0.1, rc=0.1, rb=0.05, nc=3, dish=0.0, wob=0.01, seed=2, xf=up))
    parts.append(slab('tier3', 'stone', T3, 0.43, 0.43, 0.8, bottom=0.4, rc=0.08, rb=0.04, nc=3, dish=0.0, wob=0.006, seed=3, xf=up))
    parts.append(slab('cornice', 'stone', T2, 0.47, 0.47, 0.865, bottom=0.76, rc=0.08, rb=0.03, nc=3, dish=0.0, wob=0.006, seed=4, xf=up))
    # the gold plaque with a raised bronze paw (no text)
    parts.append(slab('plaque', 'gold', GOLD, 0.22, 0.1, 0.03, bottom=-0.01, rc=0.04, rb=0.012, nc=2, dish=0.0, wob=0.0,
                      xf=lambda q: L(q.x, 0.62 + q.y, 0.43 + q.z)))
    BRZ = lacquer_painter('#9a6430', '#6a4020', '#c8904a', spec='#f0d0a0', sheen=0.5)
    parts.append(ellipsoid('paw_pad', 'gold', BRZ, L(0, 0.595, 0.462), 0.055, 0.014, 0.042, K=8, J=3))
    for k in range(4):
        a = PI / 2 + (k - 1.5) * 0.55
        parts.append(ellipsoid(f'paw_toe{k}', 'gold', BRZ, L(math.cos(a) * 0.075, 0.6 + math.sin(a) * 0.065, 0.46), 0.022, 0.012, 0.026, K=6, J=3))
    # ---- the flower ring on the middle tier and a shrub at each corner of the bottom tier
    cols = ('#ff8fb0', '#fff1e2', '#ffd24a')
    ring = [(-0.52, -0.52), (0.0, -0.52), (0.52, -0.52), (0.52, 0.0), (0.52, 0.52), (0.0, 0.52), (-0.52, 0.52), (-0.52, 0.0)]
    rf = random.Random(6)
    for k, (gx, gz) in enumerate(ring):
        if gz > 0.4 and abs(gx) < 0.3: continue      # (the plaque's front stays clear)
        c = L(gx + rf.uniform(-0.03, 0.03), 0.48, gz + rf.uniform(-0.03, 0.03))
        parts.append(ellipsoid(f'ringleaf{k}', 'moss', moss_painter(lo='#3e7a36', mid='#5c9a48', hi='#94c870', seed=k), c, 0.075, 0.075, 0.04, K=7, J=3, ao=0.5))
        parts.append(flower(f'ringflower{k}', c + Vector((0, 0, 0.035)), UP, 0.06, cols[k % 3], '#ffd166' if k % 3 != 2 else '#ff9a3a', seed=k))
    for k, (gx, gz) in enumerate(((-0.68, -0.68), (0.68, -0.68), (-0.68, 0.68), (0.68, 0.68))):
        parts += bush(f'shrub{k}', L(gx, 0.2, gz) - Vector((0, 0, 0.02)), r=0.13, flowers=('#ff8fb0', '#fff1e2'), seed=90 + k, nf=1, K=8, J=4, nl=3, fr=0.05)
    # grass tufts round the foot
    TUFT = moss_painter(lo='#4e8a3a', mid='#78b04e', hi='#a8d878', seed=9)
    tp = Part('tufts', 'flower', paint=TUFT, ao=0.3)
    rt = random.Random(12)
    for k in range(4):
        a = TAU * (k + rt.uniform(0.2, 0.8)) / 4; d = 0.86 / max(abs(math.cos(a)), abs(math.sin(a)))
        base = Vector((math.cos(a) * min(d, 0.97), math.sin(a) * min(d, 0.97), 0.0))
        grass_clump(tp, base, UP, Vector((math.cos(a), math.sin(a), 0)), rt)
    parts.append(tp)
    return parts, {}

def checks_statue(parts, info, obs):
    R = {}
    pl = next(p for p in parts if p.name == 'plaque')
    xs = [v.x for v in pl.v]; zs = [v.z for v in pl.v]; ys = [-v.y for v in pl.v]
    R['plaque'] = {'centre_h': round((min(zs) + max(zs)) / 2, 3), 'w': round(max(xs) - min(xs), 3), 'h': round(max(zs) - min(zs), 3),
                   'front_game_z': round(max(ys), 3), 'kit': {'centre_h': 0.64, 'w': 0.5, 'h': 0.22, 'game_z': 0.435}}
    st = [p for p in parts if p.kind in ('statue', 'cloth', 'gold') and not p.name.startswith(('plaque', 'paw_'))]
    R['statue_top_h'] = round(max(v.z for p in st for v in p.v), 3)
    R['statue_head_top_h'] = round(max(v.z for v in next(p for p in parts if p.name == 'head').v), 3)
    R['plinth_top_h'] = round(max(v.z for v in next(p for p in parts if p.name == 'cornice').v), 3)
    allb, own = body_bvh(parts)
    top = -9; who = None
    for k in range(9):
        a = TAU * k / 8; q = 0 if k == 8 else 0.3
        h = allb.ray_cast(L(math.cos(a) * q, 3, 1.1 + math.sin(a) * q), Vector((0, 0, -1)), 5)
        if h[0] is not None and h[0].z > top: top = h[0].z; who = own[h[2]]
    R['door_spot'] = {'x': 0, 'z': 1.1, 'top': round(top, 3) if top > -9 else None, 'what': who}
    return R

# ================================================================== the village shrine (kit services.js shrine, 3 x 3)
# Kit layout kept: a stone platform (2.0 x 1.6 x 0.28, centred at z -0.55); the honden (1.4 x 1.05, 0.1 further back)
# with plaster walls in a vermilion frame, a lattice door, side shoji; a moss-green irimoya roof (the Guild's roof
# technique: crisp tile courses, round eave discs, curled hip caps, the oni ridge, a gold gegyo on the gables); a front
# kohai on two vermilion posts over the offering box, the bell and its rope, a shimenawa; two steps; the approach: a
# little torii at z 1.2 (w 1.1, h 1.35), stone dogs at (+-0.72, 0.55), toro at (+-1.2, 1.0), a sakura at (-1.1, -1.1),
# bamboo at (1.2, -1.2), an ema rack at (-1.3, -0.1) and an omikuji line at (1.32, -0.1), stepping stones; door (0, 1.5).
# Changed: the wall is 1.2 high (kit 1.05) so the kohai can tuck under the main eave and still clear a 1 m hero.
SHRINE = dict(pw=2.0, pd=1.6, ph=0.28, zc=-0.55, w=1.4, d=1.05, h=1.2, hz=-0.1)

def build_shrine_hall():
    """the hall in the Guild kit (module plaza_guildkit, game frame); returns its Asset and frame info"""
    K = importlib.import_module('plaza_guildkit')
    K.PAL.update(roof='#5a8c56', roofHi='#7aa66c', roofLo='#33552f', roofGroove='#426a3e', roofShadow='#31502d',
                 edge='#b4caa6', under='#8a4e3a', trim='#4c7a48', wall='#fff6ea', wallLo='#f0dcc6',
                 frame='#cf4a36', frameHi='#ec7656', frameLo='#9a3226', red='#d8503a', redHi='#f07a5e', redLo='#a0362a', gold='#f2c04a')
    K.A = K.Asset2(); K.F.__init__(); K.OB = 'villageShrine'
    sh = SHRINE; pw, pd, ph, zc, w, d, h = sh['pw'], sh['pd'], sh['ph'], sh['zc'], sh['w'], sh['d'], sh['h']
    y0 = ph
    info = {}
    K.F.push((0, 0, zc))
    K.foundation(pw, pd, ph, pad=0.08, seed=3)
    K.F.push((0, 0, sh['hz']))
    K.walls(dict(w=w, d=d, h=h, y0=y0, plaster=K.PAL['wall'], frame=K.PAL['frame'], posts={'l': [0.0], 'r': [0.0]}))
    blk = dict(w=w, d=d)
    with K.on_face(blk, 'f', 0, y0 + 0.5):                 # the lattice door: paper behind a vermilion grid
        K.shoji(0.8, 0.92, frame=K.PAL['frame'], cell=0.16, tag='door')
        K.add(K.beam(0.98, 0.1, 0.1, (0, 0.52, 0.04), c=0.03), K.lac(K.PAL['frame'], K.PAL['frameHi'], K.PAL['frameLo']), 'door')
    for side in ('l', 'r'):
        with K.on_face(blk, side, 0, y0 + 0.72): K.shoji(0.5, 0.4, frame=K.PAL['frame'], cell=0.17)
    # a vermilion rail round the walls just above the floor line (kit railAt 0.3)
    K.add(K.beam(w + 0.1, 0.07, 0.07, (0, y0 + 0.3, d / 2 + 0.03), c=0.02), K.lac(K.PAL['frame'], K.PAL['frameHi'], K.PAL['frameLo']), 'rail')
    for sx in (-1, 1):
        K.add(K.beam(0.07, 0.07, d + 0.1, (sx * (w / 2 + 0.03), y0 + 0.3, 0), c=0.02), K.lac(K.PAL['frame'], K.PAL['frameHi'], K.PAL['frameLo']), 'rail')
    top = K.roof(dict(type='irimoya', w=w, d=d, y0=y0 + h, over=0.34, H=0.9, curve=0.5, lift=0.3, liftW=0.6, thick=0.12,
                      ribW=0.24, ribAmp=0.034, course=0.24, courseAmp=0.018, tg=0.45, gOver=0.16, seed=17, rich=2, gableFill='#a83a2c'))
    info['ridgeY'] = top['ridgeY']
    # the kohai: a shed roof tucked under the main eave, on two vermilion posts
    zb, zf = d / 2 + 0.16, d / 2 + 0.66
    yb_ = top['underAt'](0.0, zb) - 0.03
    H = 0.15; th = 0.07; Bz = (zf - zb) / 2
    K.F.push((0, 0, (zb + zf) / 2))
    K.roof(dict(type='shed', w=1.0, d=zf - zb, y0=yb_ - H - th, over=0.0, gOver=0.1, H=H, curve=0.3, lift=0.1, liftW=0.3,
                thick=th, ribW=0.24, ribAmp=0.03, course=0.2, courseAmp=0.016, k=0.42, seed=19, rich=2))
    K.F.pop()
    yfront = yb_ - H                                     # the kohai's eave line (top surface)
    pz = d / 2 + 0.5; ph_ = yfront - th - 0.02
    for x in (-0.48, 0.48):
        K.add(K.cyl(0.055, 0.062, ph_, (x, ph_ / 2, pz), K=8), K.lac(K.PAL['red'], K.PAL['redHi'], K.PAL['redLo']), 'kohai')
        K.add(K.cyl(0.1, 0.12, 0.12, (x, 0.06, pz), K=8), K.stone_col(K.STONES[2]), 'kohai')
    K.add(K.beam(1.12, 0.1, 0.1, (0, ph_ - 0.03, pz), c=0.03), K.lac(K.PAL['red'], K.PAL['redHi'], K.PAL['redLo']), 'kohai')
    K.add(K.beam(0.09, 0.09, pz - d / 2, (0, ph_ - 0.03, d / 2 + (pz - d / 2) / 2), c=0.025), K.wood(K.PAL['frameLo']), 'kohai')
    # the offering box (saisen-bako): a slatted top, a gold paw on its front
    with K.at((0, y0, d / 2 + 0.3)):
        K.add(K.beam(0.52, 0.26, 0.26, (0, 0.13, 0), c=0.03), K.wood('#a8683e', ao_z=0.0), 'offering')
        for i in range(5): K.add(K.box(0.48, 0.03, 0.035, (0, 0.27, -0.09 + i * 0.045), r=0.0, rx=0.4), K.flat('#7a4a2e'), 'offering')
        K.paw(0.12, (0, 0.13, 0.135), depth=0.02, col=K.PAL['gold'], tag='offering')
    K.F.pop()
    K.F.pop()
    info.update(pz=zc + sh['hz'] + pz, ph=ph_, yfront=yfront, kohai_back=zc + sh['hz'] + zb, kohai_front=zc + sh['hz'] + zf, door_face=zc + sh['hz'] + d / 2)
    K.finish(K.A, seed=5, amt=0.02)
    return K, info

def sakura(name, base, s=1.0, seed=0):
    """a little sakura: a curved trunk with three branches, lumpy blossom clumps painted in dappled pinks, 3-D blossoms
    scattered on their tops"""
    rnd = random.Random(seed); parts = []
    BARK = solid_painter('#7a5040', top=0.15, bot=0.25, seed=seed)
    trunk_pts = [base + Vector(q) * s for q in ((0, 0, -0.15), (0.03, 0.02, 0.4), (-0.04, 0.05, 0.85), (0.02, 0.0, 1.2))]
    path, rad = spline([(p, 1.0) for p in trunk_pts], per=8)
    bm = Beam(path, Vector((1, 0, 0)), lambda q: (0.085 - 0.03 * q) * s, lambda q: (0.085 - 0.03 * q) * s, e=1.0, cap=0.03)
    parts.append(bm.build(name + '_trunk', 'wood', BARK, K=7, step=0.25 * s, capn=1, cap0=False))
    tips = []
    for k, (dx, dy, dz) in enumerate(((0.4, -0.05, 1.38), (-0.22, 0.04, 1.45), (0.12, -0.38, 1.58))):
        root = path(0.62 + 0.12 * k)
        tip = base + Vector((dx, dy, dz)) * s
        mid = root.lerp(tip, 0.5) + Vector((0, 0, 0.08 * s))
        bp, br = spline([(root, 1.0), (mid, 1.0), (tip, 1.0)], per=6)
        b2 = Beam(bp, Vector((0, 0, 1)), lambda q: (0.05 - 0.02 * q) * s, lambda q: (0.05 - 0.02 * q) * s, e=1.0, cap=0.02)
        parts.append(b2.build(f'{name}_branch{k}', 'wood', BARK, K=6, step=0.25 * s, capn=1))
        tips.append(tip)
    def bloom(part, p, n, meta):
        c = mixc('#d86a98', '#f4a8c4', smooth((n.z + 0.3) / 0.9))
        c = mixc(c, '#ffe0ec', smooth((n.z - 0.55) / 0.4) * 0.7)
        g = vnoise(p, 9.0, seed + 3)
        c = mixc(c, '#ffd0e2', clamp((g - 0.55) * 3) * 0.6)
        c = mixc(c, '#c45a8a', clamp((0.35 - g) * 3) * 0.5)
        return mulc(c, 0.86 + 0.18 * clamp(n.dot(LDIR) * 0.5 + 0.5))
    clumps = [(tips[0], 0.3), (tips[1], 0.32), (tips[2], 0.3), (base + Vector((0.0, 0.05, 1.62)) * s, 0.34), (base + Vector((0.25, -0.2, 1.5)) * s, 0.24)]
    for k, (c, r) in enumerate(clumps):
        rr = r * s
        n = 4 if r >= 0.3 else 3
        for j in range(n):
            a = TAU * j / n + rnd.uniform(-0.4, 0.4) + k
            off = Vector((math.cos(a) * rr * 0.5, math.sin(a) * rr * 0.5, rnd.uniform(-0.1, 0.2) * rr)) if j else Vector((0, 0, rr * 0.25))
            pr = rr * (0.62 if j else 0.7) * rnd.uniform(0.9, 1.1)
            cc = c + off
            p = ellipsoid(f'{name}_clump{k}_{j}', 'leaf', bloom, cc, pr, pr * 0.95, pr * 0.8, K=6, J=4, ao=0.8)
            p.v = [cc + (v - cc) * (1 + 0.14 * (vnoise(v, 9.0 / s, seed + k * 7 + j) - 0.5) * 2) for v in p.v]
            parts.append(p)
    return parts, clumps

def ema_rack(name, at, yaw):
    """the ema rack: two posts, a little gabled roof, a rail hung with painted wooden plaques (no writing)"""
    parts = []
    WOOD = solid_painter('#9a6a48', top=0.12, bot=0.25, seed=2)
    LIGHTW = solid_painter('#e8c890', top=0.1, bot=0.2, seed=3)
    ROOFC = solid_painter('#5a8a54', top=0.18, bot=0.3, seed=4)
    for sx in (-1, 1):
        pp = Part(f'{name}_post{sx}', 'wood', paint=WOOD, closed=True); box_flat(pp, Vector((sx * 0.33, 0, 0.36)), 0.035, 0.035, 0.66); parts.append(pp)
    for zz in (0.62, 0.38):
        pp = Part(f'{name}_rail{zz}', 'wood', paint=WOOD, closed=True); box_flat(pp, Vector((0, 0, zz)), 0.37, 0.025, 0.025); parts.append(pp)
    for sy in (-1, 1):
        pp = Part(f'{name}_roof{sy}', 'wood', paint=ROOFC, closed=True)
        box_flat(pp, Vector((0, sy * 0.09, 0.96)), 0.42, 0.1, 0.022)
        R = Matrix.Rotation(-sy * 0.62, 4, 'X')
        pp.v = [Vector((0, 0, 0.96)) + (R @ (v - Vector((0, 0, 0.96)))) + Vector((0, 0, -0.03)) for v in pp.v]; parts.append(pp)
    rr = random.Random(5)
    motifs = ['#e8503a', '#5a8ad8', '#f2c04a', '#e86a9a', '#6ab07a']
    for k in range(6):
        row = k // 3; x = -0.2 + (k % 3) * 0.2 + rr.uniform(-0.02, 0.02); z = (0.56 if row == 0 else 0.32) - 0.08
        ow, oh = 0.075, 0.06
        out = [(-ow, -oh), (ow, -oh), (ow, oh * 0.5), (0, oh * 1.2), (-ow, oh * 0.5)]
        pl = flat_shape(f'{name}_ema{k}', 'wood', LIGHTW, [(x + a, b) for a, b in out], (x, 0.0), 0.0, 0.025, ao=0.4)
        R = Matrix.Rotation(PI / 2, 4, 'X') @ Matrix.Rotation(rr.uniform(-0.15, 0.15), 4, 'Z')
        pl.v = [Vector((v.x, 0, 0)) + R @ Vector((0, v.y, v.z)) + Vector((0, -0.03 - 0.01 * row, z)) for v in pl.v]
        parts.append(pl)
        dot = ellipsoid(f'{name}_ema{k}_dot', 'wood', solid_painter(motifs[k % 5]), Vector((x, -0.06 - 0.01 * row, z - 0.005)), 0.03, 0.01, 0.026, K=6, J=3, ao=0.2)
        parts.append(dot)
    M = Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, 'Z')
    return xf_parts(parts, M)

def omikuji(name, at, yaw):
    """the omikuji line: two posts and two rails tied full of white paper fortunes"""
    parts = []
    WOOD = solid_painter('#9a6a48', top=0.12, bot=0.25, seed=6)
    PAPER = solid_painter('#fff6ea', top=0.05, bot=0.15)
    for sx in (-1, 1):
        pp = Part(f'{name}_post{sx}', 'wood', paint=WOOD, closed=True); box_flat(pp, Vector((sx * 0.36, 0, 0.32)), 0.035, 0.035, 0.6); parts.append(pp)
    rr = random.Random(8)
    for zz in (0.72, 0.46):
        rope = Beam(lambda s, zz=zz: Vector((-0.36 + 0.72 * s, 0, zz - math.sin(PI * s) * 0.03)), UP, lambda s: 0.018, lambda s: 0.018, e=1.0, cap=0.01)
        parts.append(rope.build(f'{name}_line{zz}', 'rope', rope_painter(), K=5, step=0.18, capn=1))
        for k in range(3):
            x = -0.2 + k * 0.2 + rr.uniform(-0.015, 0.015)
            parts.append(ellipsoid(f'{name}_kuji{zz}_{k}', 'shide', PAPER, Vector((x, -0.005, zz - 0.02)), 0.03, 0.022, 0.04,
                                   M=Matrix.Rotation(rr.uniform(-0.4, 0.4), 4, 'Y'), K=6, J=3, ao=0.3))
    M = Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, 'Z')
    return xf_parts(parts, M)

def build_shrine():
    K, info = build_shrine_hall()
    parts = []
    # ---- steps up to the platform (kit: two, rise 0.14, run 0.18) and stepping stones out to the torii
    SP = step_painter(top='#d4ccc4', side='#a69e98', seed=14)
    front = SHRINE['zc'] + SHRINE['pd'] / 2 + 0.04
    for k, (top, z) in enumerate(((0.19, front + 0.1), (0.1, front + 0.29))):
        parts.append(slab(f'step_{k}', 'step', SP, 0.42, 0.1, top, rc=0.06, rb=0.03, nc=2, dish=0.004, wob=0.01, seed=60 + k,
                          xf=lambda q, z=z: Vector((q.x, -q.y, q.z)) + L(0, 0, z)))
    rs = random.Random(7)
    for k, z in enumerate((0.9, 1.3)):
        parts.append(slab(f'stone_{k}', 'step', step_painter(seed=70 + k), rs.uniform(0.2, 0.23), rs.uniform(0.14, 0.16), 0.03, rc=0.12,
                          rb=0.025, nc=2, dish=0.004, wob=0.03, seed=70 + k,
                          xf=lambda q, z=z, a=rs.uniform(-0.3, 0.3), x=rs.uniform(-0.05, 0.05): Matrix.Rotation(a, 3, 'Z') @ Vector((q.x, -q.y, q.z)) + L(x, 0, z)))
    # ---- the kohai's shimenawa, the bell and its rope
    pz, yk = info['pz'], info['ph']
    ROPE = rope_painter()
    def srp(s): return L(-0.48 + 0.96 * s, yk - 0.06 - math.sin(PI * s) * 0.07, pz + 0.08)
    rope = Beam(srp, UP, lambda s: 0.038 * (0.8 + 0.4 * math.sin(PI * s)), lambda s: 0.038 * (0.8 + 0.4 * math.sin(PI * s)), e=1.0, cap=0.03, twist=(0.14, 0.24))
    parts.append(rope.build('kohai_rope', 'rope', ROPE, K=6, step=0.13, capn=1))
    for k, t in enumerate((0.25, 0.75)):
        parts += zigzag_shide(f'kohai_shide_{k}', srp(t) + Vector((0, -0.045, -0.035)), flat_painter('#fff6ea', '#f3eadc', shade=0.1), scale=0.5)
    GOLDP = lacquer_painter('#e8b440', '#a87420', '#ffe08a', spec='#fff4c8', sheen=0.8)
    bz = pz - 0.14; by = yk - 0.12
    parts.append(lathe2('bell', 'gold', GOLDP, L(0, by - 0.16, bz), [(0.11, 0.0), (0.105, 0.03), (0.09, 0.1), (0.06, 0.15), (0.02, 0.17)], K=8))
    cord = Beam(lambda s: L(0, by + 0.04 - 0.06 * s, bz), Vector((1, 0, 0)), lambda s: 0.016, lambda s: 0.016, e=1.0, cap=0.01)
    parts.append(cord.build('bell_cord', 'rope', flat_painter('#7a2a24'), K=4, step=0.05, capn=1))
    for k, (dx, c) in enumerate(((-0.045, '#d8503a'), (0.0, '#fff6ea'), (0.045, '#d8503a'))):
        sp_ = Beam(lambda s, dx=dx: L(dx * (0.4 + 0.6 * s), by - 0.17 - 0.62 * s, bz + 0.02 + 0.03 * s), Vector((0, -1, 0)),
                   lambda s: 0.024, lambda s: 0.024, e=1.0, cap=0.02)
        parts.append(sp_.build(f'bell_rope{k}', 'cloth', lacquer_painter(c, mulc(c, 0.7), mixc(c, '#ffffff', 0.3), sheen=0.2), K=4, step=0.2, capn=1))
    # ---- the approach: the little torii (kit w 1.1, h 1.35) at z 1.2
    tp = torii(z=0.0, w=1.1 / 0.435, h=3.1, moss_top=False, rope=False, lod=0.5, post_moss=0.15)
    xf_parts(tp, Matrix.Translation(L(0, 0, 1.2)) @ Matrix.Scale(0.435, 4))
    parts += tp
    parts += stone_dog('dog_l', L(-0.72, 0, 0.55), s=0.6, yaw=0.3, ball=1, seed=17, lod=0.6)
    parts += stone_dog('dog_r', L(0.72, 0, 0.55), s=0.6, yaw=-0.3, ball=-1, seed=18, lod=0.6)
    parts += toro('toro_l', L(-1.2, 0, 1.0), s=0.62, yaw=0.1, seed=21, lod=0.6)
    parts += toro('toro_r', L(1.2, 0, 1.0), s=0.62, yaw=-0.15, seed=22, lod=0.6)
    sk, clumps = sakura('sakura', L(-1.02, 0, -1.0), s=0.9, seed=31)
    parts += sk
    parts += bamboo_clump('bamboo', L(1.18, 0, -1.05), n=3, h=1.75, seed=44)
    parts += ema_rack('ema', L(-1.3, 0, -0.1), PI / 2)
    parts += omikuji('omikuji', L(1.32, 0, -0.1), -PI / 2)
    # blossoms on the sakura's clumps and a few fallen petals on the ground
    cl = [p for p in parts if p.name.startswith('sakura_clump')]
    cb, _ = body_bvh(cl)
    rb = random.Random(3)
    nb = 0
    for k in range(40):
        if nb >= 7: break
        c, r = clumps[k % len(clumps)]
        a = rb.uniform(0, TAU); d = rb.uniform(0.0, 0.85) * r * 0.9
        h = cb.ray_cast(c + Vector((math.cos(a) * d, math.sin(a) * d, 2.0)), Vector((0, 0, -1)), 4)
        if h[0] is None: continue
        n = h[1] if h[1].z > 0 else -h[1]
        parts.append(flower(f'blossom_{nb}', h[0] + n * 0.004, n, 0.06, rb.choice(('#ffe4ee', '#ffc4dc', '#fff4f8')), '#ff9ab8', seed=200 + k)); nb += 1
    for k in range(4):
        a = rb.uniform(0, TAU); d = rb.uniform(0.2, 0.75)
        x, y = -1.1 + math.cos(a) * d, 1.1 + math.sin(a) * d
        if abs(x) > 1.45 or abs(y) > 1.45: continue
        out = [(x + math.cos(a + TAU * j / 6) * 0.035, y + math.sin(a + TAU * j / 6) * 0.024) for j in range(6)]
        parts.append(flat_shape(f'petal_{k}', 'flower', solid_painter(rb.choice(('#ffc4dc', '#ffb0cc', '#ffe0ec'))), out, (x, y), 0.008, 0.012, ao=0.2))
    return parts, dict(K=K, info=info)

def checks_shrine(parts, info, obs):
    R = {}
    I = info['info']
    R['kohai'] = {k: round(v, 3) for k, v in I.items()}
    R['ridge_h'] = round(I['ridgeY'], 3)
    allb, own = body_bvh(parts)
    top = -9; who = None
    for k in range(9):
        a = TAU * k / 8; q = 0 if k == 8 else 0.3
        h = allb.ray_cast(L(math.cos(a) * q, 3, 1.5 + math.sin(a) * q), Vector((0, 0, -1)), 5)
        if h[0] is not None and h[0].z > top: top = h[0].z; who = own[h[2]]
    R['door_spot'] = {'x': 0, 'z': 1.5, 'top_of_props': round(top, 3) if top > -9 else None, 'what': who}
    return R

# ================================================================== run
def plaza_mat(nm):
    """the shared materials: `body` (vertex colours), glows (emission), created once per scene"""
    if nm in bpy.data.materials: return bpy.data.materials[nm]
    m = bpy.data.materials.new(nm); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Roughness'].default_value = 0.8; bs.inputs['Metallic'].default_value = 0.0
    if nm == 'body':
        vc = m.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        m.node_tree.links.new(vc.outputs['Color'], bs.inputs['Base Color'])
    else:
        gc = GLOWC.get(nm, '#ffffff')
        bs.inputs['Base Color'].default_value = hexc(gc); bs.inputs['Emission Color'].default_value = hexc(gc)
        bs.inputs['Emission Strength'].default_value = 1.0
    m.use_backface_culling = True
    return m

PIECES = {
    'burrowGate': (lambda: build_burrow(), lambda *a: checks_burrow(*a)),
    'fountain': (lambda: build_fountain(), lambda *a: checks_fountain(*a)),
    'chewyStatue': (lambda: build_statue(), lambda *a: checks_statue(*a)),
    'villageShrine': (lambda: build_shrine(), lambda *a: checks_shrine(*a)),
}

def run(piece):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build, chk = PIECES[piece]
    parts, info = build()
    obs = []
    K = info.get('K') if isinstance(info, dict) else None
    if K is not None:          # the shrine's hall (Guild kit): its own objects, sharing the materials
        mm = {'body': plaza_mat('body'), 'window_glow': plaza_mat('window_glow')}
        for k, o in K.A.objs.items():
            ob = K.to_object(piece if k == K.OB else piece + '_glow', o, mm); obs.append(ob)
            print('PLAZA hall', ob.name, K.check(ob))
        print('PLAZA hall parts', dict(sorted(K.A.count.items(), key=lambda kv: -kv[1])))
    pobs, tk = finish_multi(parts, piece + '_dress' if K is not None else piece, dmax=0.8)
    obs += pobs
    if K is not None: tk['hall'] = K.A.tris()
    tris = sum(len(p.vertices) - 2 for o in obs for p in o.data.polygons)
    lo, hi = bounds(obs)
    print('PLAZA', piece, 'tris', tris, 'by kind', tk)
    export_glb(obs, piece)
    R = chk(parts, info, obs)
    R['triangles'] = tris; R['triangles_by_object'] = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    R['triangles_by_kind'] = tk
    R['bounds_blender'] = {'min': [round(c, 3) for c in lo], 'max': [round(c, 3) for c in hi]}
    R['size_m_xyz_up'] = [round(hi.x - lo.x, 3), round(hi.y - lo.y, 3), round(hi.z, 3)]
    R['materials'] = sorted({m.name for o in obs for m in o.data.materials})
    R['mesh_checks'] = {o.name: mesh_check(o) for o in obs}
    os.makedirs(PREVIEW, exist_ok=True)
    with open(os.path.join(PREVIEW, f'{piece}-checks.json'), 'w', encoding='utf-8') as f: json.dump(R, f, indent=2)
    print('PLAZA checks', json.dumps(R))

for pc in (list(PIECES) if PIECE == 'all' else [PIECE]):
    run(pc)
print('PLAZA done')
