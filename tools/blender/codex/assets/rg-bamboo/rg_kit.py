# rg-bamboo shared kit: extracted verbatim from tools/blender/codex/assets/dungeon-gates/build_dungeon-gates.py
# (lines 33-400: colour/noise, Part, surf, Boulder, boulder_moss, grass_clump, strip_moss; 549-838: Beam, spline, rbox, slab,
# lathe, box_flat, painters, zigzag_shide, flower). exec'd by build_rg-bamboo.py into its globals; GROUND is set there.
import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
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
        drips.append((c % TAU, rnd.uniform(0.12, 0.45) * drop, rnd.uniform(0.22, 0.34) * M.get('dw', 1.0), 0.0))
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
                if (b.ground and pts[j].z < 0.06) or pts[j].z < M.get('zmin', -1e9): jl = max(1, j - 1); break
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
                ext = max(ext, ln * (1 - (dd / w) ** 2) ** M.get('dexp', 0.75))
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
    for c, ln, w, _ in drips: ths += [(c + w * f) % TAU for f in M.get('doffs', (-1.05, -0.5, 0.0, 0.5, 1.05))]
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
