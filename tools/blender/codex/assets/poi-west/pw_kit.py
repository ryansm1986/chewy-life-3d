# poi-west shared kit (exec'd into build_poi-west.py's globals, after dg_common.py): the ground of a place, cut-plane boulders
# with moss icing, chunky fences, cheap leaf-card plants and flowers, foam, the under-ground cull, terrain-aware AO, the exporter.
# Everything is written in the kit call's local frame (game x, y up, z south), mapped to Blender (x, -z, y).
import json
from mathutils import Quaternion

SITE_DIR = os.path.join(HERE, 'site')
# a shell's outward side: the kit's orient() takes the signed volume about the world origin, which flips open shells at random, and
# a flipped shell's ink outline (glbInstance outline: true, drawn BackSide) then paints straight over it. Here: about each shell's
# own centre, so domes, tubes and dished stones come out right; a flat shell (no volume) keeps its hints.
def _orient(self):
    Fs = self.f; edge = {}
    for fi, f in enumerate(Fs):
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            edge.setdefault((min(a, b), max(a, b)), []).append(fi)
    seen = [False] * len(Fs)
    for s0 in range(len(Fs)):
        if seen[s0]: continue
        comp = [s0]; seen[s0] = True; stack = [s0]
        while stack:
            fi = stack.pop(); f = Fs[fi]
            for k in range(len(f)):
                a, b = f[k], f[(k + 1) % len(f)]
                for g in edge[(min(a, b), max(a, b))]:
                    if seen[g]: continue
                    gf = Fs[g]
                    if any(gf[m] == a and gf[(m + 1) % len(gf)] == b for m in range(len(gf))): Fs[g] = gf[::-1]
                    seen[g] = True; stack.append(g); comp.append(g)
        ids = {i for fi in comp for i in Fs[fi]}
        c = sum((self.v[i] for i in ids), Vector()) / max(1, len(ids)); vol = 0.0
        for fi in comp:
            P = [self.v[i] - c for i in Fs[fi]]
            for k in range(1, len(P) - 1): vol += P[0].dot(P[k].cross(P[k + 1]))
        if vol < -1e-9:
            for fi in comp: Fs[fi] = Fs[fi][::-1]
    return self
Tmp.orient = _orient
PTmp.orient = lambda self: self
Boulder0, boulder_moss = DG['Boulder'], DG['boulder_moss']
Part = DG['Part']; mixc, mulc, fbm = DG['mixc'], DG['mulc'], DG['fbm']; LDIR = DG['LDIR']; moss_painter = DG['moss_painter']

class Site:
    def __init__(self, sid):
        d = json.load(open(os.path.join(SITE_DIR, sid + '.json'), encoding='utf-8'))
        self.id, self.x, self.z, self.y0, self.step, self.N, self.grid = sid, d['x'], d['z'], d['y0'], d['step'], d['N'], d['grid']
        self.pools = d.get('pools'); self.n = len(self.grid); self.water = -self.y0   # (the sea: world y 0)
    def H(self, x, z):
        fx = clamp((x / self.step) + self.N * 4, 0, self.n - 1.001); fz = clamp((z / self.step) + self.N * 4, 0, self.n - 1.001)
        i, k = int(fx), int(fz); u, v = fx - i, fz - k; g = self.grid
        return (g[k][i] * (1 - u) + g[k][i + 1] * u) * (1 - v) + (g[k + 1][i] * (1 - u) + g[k + 1][i + 1] * u) * v
S = None
def H(x, z): return S.H(x, z)
def use_site(sid):
    global S; S = Site(sid); new_asset()
    F.m = Matrix.Identity(4); F.st = []; return S
def V3(x, y, z): return Vector((x, -z, y))      # kit-local -> Blender

# ================================================================== palette (judged in the game: its toon ramp pushes saturation up, shade goes violet)
WD = '#c28a52'; WD_HI = '#e0b078'; WD_LO = '#8a6240'; ROPE = '#e0c896'; ROPE_LO = '#ab9060'; BRASS_C = '#d9aa4e'; BRASS_D = '#9a7030'
STN_PAL = dict(lo='#90889a', mid='#aea5ae', hi='#d8cfce', warm='#e4d4c2')
MOSS_PAL = dict(lo='#5a7c3e', mid='#83a356', hi='#b8d082', warm='#b0a850', cool='#5c9470', hue=0.05)
BLOOM = ['#fff6ee', '#ffb6cf', '#ff93b6', '#ffeef4', '#ffd877']
GREENS = [('#4f8a3c', '#8cc25c'), ('#4a8040', '#7fb858'), ('#5a9444', '#9ccc66'), ('#3f7a3e', '#74ae52')]

# ================================================================== stone
class CutBoulder(Boulder0):
    """the kit's boulder with a few planes chiselled off it (stones have cut planes, not only smooth eggs)"""
    def __init__(self, *a, cuts=(), **k):
        self.cuts = list(cuts); super().__init__(*a, **k)
    def _P(self, th, ph):
        q = Boulder0._P(self, th, ph); v = q - self.c
        for n, d in self.cuts:
            s = v.dot(n) - d
            if s > 0: v = v - n * (s * 0.93)
        return self.c + v

def rock_paint(gy, top, seed=0, pal=None, wet=None, tone=0.0):
    pal = pal or STN_PAL
    def f(part, p, n, meta):
        t = clamp((p.z - gy) / max(0.25, top - gy))
        c = mixc(pal['lo'], pal['mid'], DG['smooth'](t * 1.6))
        c = mixc(c, pal['hi'], DG['smooth']((t - 0.4) / 0.6) * 0.8)
        c = mixc(c, pal['hi'], clamp(n.z) ** 2 * 0.4)
        lam = n.dot(LDIR)
        c = mixc(c, pal['warm'], clamp(lam) ** 2 * 0.25)
        c = mulc(c, 0.86 + 0.16 * clamp(lam * 0.5 + 0.5))
        c = mulc(c, 0.92 + 0.14 * fbm(p, 1.1, seed) + tone)
        if p.z < gy + 0.14: c = mulc(c, 0.78 + 0.22 * clamp((p.z - gy) / 0.14))
        if wet is not None and p.z < wet: c = mixc(c, '#5e5668', clamp((wet - p.z) * 3.5) * 0.55)
        return c
    return f

ML, MM, MH = '#4a7234', '#689040', '#96b65a'
MOSSV = set()     # (ids of the cushions' vertices: they take less contact shade, or the raised rim goes muddy)
def moss_cushion(b, stone, moss, lod, gy, seed, r, drop=1.0):
    """a plump moss cushion over a boulder's crown (as poi-north's moon pond): a raised dome, a rounded lip with a little thickness tucked
    into the stone, a soft lobed edge with a few rounded drips; light on top, darker at the rim. The stone under it is left out."""
    rng = random.Random(seed * 31 + 5); nd = {2: 4, 1: 3, 0: 2}[lod]; drips = []
    for k in range(nd):
        c = rng.uniform(0, TAU) if k % 2 else ((-PI / 2 - b.yaw_ + rng.uniform(-1.1, 1.1)) % TAU)     # (half of them on the camera's side)
        drips.append((c, rng.uniform(0.2, 0.4) * drop, rng.uniform(0.3, 0.46)))
    cov = 0.22 + moss * 0.5      # (the boulder's angle runs fast near its crown: about 45 % of what the camera sees)
    base = lambda th: cov + 0.1 * math.sin(3 * th + seed) + 0.08 * math.sin(5 * th + seed * 2) + 0.055 * math.sin(8 * th + seed * 3)
    he0 = drip_he(base, drips); centre = b.c.copy()
    def Pu(th, h): return Boulder0._P(b, th, PI / 2 - h)
    # (riding a little over the cut planes, so a cushion stays round where the stone is chiselled)
    def S_(th, h): return b.P(th, PI / 2 - h).lerp(Pu(th, h), 0.55)
    # the edge: evenly sampled and smoothed round the cushion, so it has no corners or points
    KE = {2: 14, 1: 12, 0: 10}[lod]; ths = [TAU * k / KE for k in range(KE)]; hv = []
    for th in ths:
        h = he0(th)
        while h > 0.25 and S_(th, h).z < gy + 0.05: h -= 0.05
        hv.append(h)
    for _ in range(2): hv = [(hv[i - 1] + 2 * hv[i] + hv[(i + 1) % KE]) / 4 for i in range(KE)]
    def he(th):
        q = (th % TAU) / TAU * KE; i = int(q) % KE; f = q - int(q)
        return hv[i] * (1 - f) + hv[(i + 1) % KE] * f
    def Nn(th, h):
        e = 2e-3
        a_ = Pu(th + e, h) - Pu(th - e, h); b_ = Pu(th, h + e) - Pu(th, max(1e-3, h - e))
        nn = b_.cross(a_)
        if nn.length < 1e-10: return Z.copy()
        nn.normalize()
        return nn if nn.dot(Pu(th, h) - centre) >= 0 else -nn
    Tk = max(0.048, 0.11 * r)
    m = PTmp(); mr = []
    for s_, kk in ((0.3, 1.75), (0.65, 1.35)):
        mr.append([S_(th, he(th) * s_) + Nn(th, he(th) * s_) * (Tk * kk) for th in ths])
    lip, tuck = [], []
    for th in ths:
        h = he(th); nn = Nn(th, h); dn_ = (S_(th, h + 0.02) - S_(th, h)).normalized()
        lip.append(S_(th, h) + dn_ * (Tk * 0.55) + nn * (Tk * 0.8)); tuck.append(S_(th, h + 0.04) - nn * 0.02)
    mr += [lip, tuck]
    ring_surface(m, mr, [centre] * 4, pole0=S_(0.0, 0.001) + Z * (Tk * 1.9), hints=lambda fc, c: fc - centre)
    m.normals()
    NR = len(ths); cols = []
    for ri in range(4):
        for k in range(NR):
            q = mr[ri][k]; n = m.n[ri * NR + k]
            # light on top, darker toward the rim: by ring as well as by the normal, so a cushion on a steep flank still reads
            c = mix(ML, MM, smooth(-0.1, 0.55, n.z)); c = mix(c, MH, smooth(0.6, 1.0, n.z) * 0.5)
            c = mix(c, MH, (0.42, 0.14, 0.0, 0.0)[ri])
            g = vnoise(q, 3.1 / max(0.6, r), seed + 9)
            c = mix(c, MH, clamp((g - 0.58) * 2.2) * 0.3); c = mix(c, ML, clamp((0.42 - g) * 2.2) * 0.3)
            if ri >= 2: c = mix(c, mul(ML, 0.78), 0.62 if ri == 2 else 1.0)      # (the lip's darker underside)
            cols.append(c)
    cols.append(mix(MM, MH, 0.7))
    m.c = cols
    o0 = A.objs.get('body'); b0 = len(o0['v']) if o0 else 0
    put(m, None, 'moss', 'body')
    MOSSV.update(id(v) for v in A.objs['body']['v'][b0:])
    # the stone under the cushion's interior is never seen
    def under(mt):
        if not mt: return False
        th, ph = mt
        if th is None: return ph > 0
        return (PI / 2 - ph) < he(th) - 0.1
    cov_ = [under(mt) for mt in stone.meta]
    stone.f = [f for f in stone.f if not all(cov_[i] for i in f)]

def rock(x, y, z, r, sq=0.75, st=1.15, yaw=None, seed=1, moss=0.0, cuts=3, lod=1, wet=None, gy=None, tag='rock', tone=0.0, drop=1.0, pal=None):
    """a boulder centred at kit-local (x, y, z). moss: 0 none, else the icing's cover (0.4..0.7). lod 2 big, 1 middling, 0 small.
    The part under the ground is culled at export. → the top's height"""
    rnd = random.Random(seed * 131 + 7)
    yaw = rnd.uniform(0, TAU) if yaw is None else yaw
    gy = H(x, z) if gy is None else gy
    pl = []
    for _ in range(cuts):
        a = rnd.uniform(0, TAU); el = rnd.uniform(0.05, 0.85)
        pl.append((Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el))), r * rnd.uniform(0.58, 0.8)))
    res = {2: 0.44, 1: 0.6, 0: 0.8}[lod] * r
    b = CutBoulder('r%d' % seed, x, z, y, r * st, r / math.sqrt(st), r * sq, r * sq * 0.85, yaw=yaw, exy=0.86, ez=0.82, lump=0.045, taper=0.1,
                   seed=seed, res=res, ground=False, cuts=pl, moss=None)
    p = b.build(rock_paint(gy, y + r * sq, seed, pal=pal, wet=wet, tone=tone))
    base_normals = p.normals
    def nrm():
        out = base_normals()
        for i, v in enumerate(p.v):
            d = v - b.c
            for n, dd in pl:
                if d.dot(n) - dd > -0.006: out[i] = (out[i] * 0.3 + n * 0.7).normalized(); break
        return out
    p.normals = nrm
    if moss > 0: moss_cushion(b, p, moss, lod, gy, seed, r, drop)
    putp(p, tag, 'body')
    return y + r * sq

def ground_rock(x, z, r, sink=0.25, sq=0.75, **k):
    """a boulder sat on the ground: `sink` of its height under the surface (the kit's groundStone)"""
    return rock(x, H(x, z) + r * sq * (0.62 - sink), z, r, sq=sq, **k)

def step_stone(x, z, r, seed=1, y=None, lift=0.07, moss=0.0, base='#c4bcc4', tag='stepstones'):
    rnd = random.Random(seed * 17 + 3); yy = (H(x, z) if y is None else y) + lift; yaw = rnd.uniform(0, TAU)
    ph = [rnd.uniform(0, TAU) for _ in range(3)]
    rf = lambda rr, zz, th: rr * (1 + 0.07 * math.sin(2 * th + ph[0]) + 0.05 * math.sin(3 * th + ph[1]) + 0.03 * math.sin(5 * th + ph[2]))
    t = lathe([(r * 1.02, -0.09), (r * 0.99, -0.004), (r * 0.86, 0.02), (0.0, 0.016)], 10, sx=1.14, sy=0.9, th0=yaw, rfn=rf)
    t.xform(Matrix.Translation(V3(x, yy, z)))
    def c(p, n):
        k = mix(mul(base, 0.72), mix(base, '#f2ece6', 0.35), clamp(n.z * 0.9 + 0.05))
        k = mul(k, 0.93 + 0.13 * vnoise(p, 2.6, seed))
        if moss and vnoise(p, 3.0, seed + 9) > 1 - moss: k = mix(k, '#7fa052', 0.7)
        return k
    put(t, c, tag, 'body')

def pebble_(x, z, r, seed=1, y=None, base=None, tag='pebbles'):
    rnd = random.Random(seed * 23 + 11); yy = (H(x, z) if y is None else y)
    base = base or ['#b4adbd', '#cfc8d6', '#9d97a8', '#e0d8d0'][seed % 4]
    t = lathe([(0.0, -0.3 * r), (r * 0.95, -0.1 * r), (r * 0.72, r * 0.32), (0.0, r * 0.5)], 5, sx=1.2, sy=0.9, th0=rnd.uniform(0, TAU))
    t.xform(Matrix.Translation(V3(x, yy, z)))
    put(t, lambda p, n: mix(mul(base, 0.72), mix(base, '#fff6ea', 0.2), clamp(n.z * 0.8 + 0.2)), tag, 'body')

def pebbles(x, z, n, spread, seed=1, size=0.07, y=None):
    rnd = random.Random(seed * 41 + 5)
    for i in range(n):
        a = rnd.uniform(0, TAU); d = math.sqrt(rnd.random()) * spread; px, pz = x + math.cos(a) * d, z + math.sin(a) * d
        pebble_(px, pz, size * rnd.uniform(0.7, 1.5), seed=seed + i, y=y)

def foam(x, z, r, y, seed=1, K=20, tag='foam'):
    """a lacy collar of foam at local water height y hugging a rock whose waterline radius is r: soft round lobes, paler outward"""
    rnd = random.Random(seed * 59 + 2); C = Cards(tag, 'body'); up = Vector((0, 0, 1))
    wid = max(0.08, r * 0.13); yy = y + 0.018; ph = rnd.uniform(0, TAU)
    inner, outer = [], []
    for k in range(K):
        a = TAU * k / K; ca, sa = math.cos(a), math.sin(a)
        lob = 0.5 + 0.5 * math.sin(a * 5 + ph)
        ro = r * (1.0 + 0.04 * math.sin(2 * a + ph * 2)) + wid * (0.35 + 1.0 * lob)
        ri = r * 0.8
        inner.append(C.v(V3(x + ca * ri, yy, z + sa * ri), up, '#c8ecef')); outer.append(C.v(V3(x + ca * ro, yy, z + sa * ro), up, '#eefafa'))
    for k in range(K):
        k1 = (k + 1) % K; C.quad(inner[k], outer[k], outer[k1], inner[k1])
    C.flush()

# ================================================================== fences
def post_(x, z, h=0.8, r=0.085, wraps=2, y=None, K=5, seed=0, wd=WD, tag='fence'):
    """a chunky round post sunk in the ground, with a rounded end-grain top and a rope lashing → its top point (Vector kit-local)"""
    gy = H(x, z) if y is None else y
    y0, top = gy - 0.15, gy + h
    prof = [(r * 1.08, y0 - top), (r * 1.0, -0.03), (r * 0.8, 0.012), (0.0, 0.022)]
    t = lathe(prof, K, th0=seed * 0.7).xform(Matrix.Translation(V3(x, top, z)))
    hi, lo = mix(wd, '#ffe8c8', 0.25), mul(wd, 0.72)
    def c(p, n):
        k = mix(lo, wd, clamp(n.x * 0.5 + 0.55 - n.y * 0.1)); k = mul(k, 0.92 + 0.14 * vnoise(Vector((p.x * 6, p.y * 6, p.z * 2.2)), 2.0, seed))
        if n.z > 0.7: k = mix(hi, mul(wd, 0.86), clamp(math.hypot(p.x - x, p.y + z) / (r * 0.7)) * 0.9)
        return k
    put(t, c, tag, 'body')
    if wraps:
        yw = top - 0.2
        pr = [(r * 0.98, -0.055), (r + 0.032, -0.03), (r + 0.032, 0.03), (r * 0.98, 0.055)]
        b = lathe(pr, 6, th0=seed).xform(Matrix.Translation(V3(x, yw, z)))
        put(b, lambda p, n: mix(ROPE_LO, ROPE, clamp(n.z * 0.3 + (0.7 if abs(p.z - yw) > 0.02 else 0.2))), tag, 'body')
    return Vector((x, top - 0.2, z))

def rope_(a, b, sag=0.1, r=0.03, n=3, K=4, col=None, tag='fence'):
    """a sagging rope (or a rail) between two kit-local points"""
    a, b = Vector(a), Vector(b)
    pts = []
    for k in range(n + 1):
        s = k / n; q = a.lerp(b, s); q.y -= math.sin(s * PI) * sag; pts.append(V3(q.x, q.y, q.z))
    t = tube(pts, lambda s: r, K=K, caps=False, up=Z)
    c0, c1 = col or (ROPE_LO, ROPE)
    put(t, lambda p, nn: mix(c0, c1, clamp(nn.z * 0.55 + 0.55)), tag, 'body')

def rope_fence(pts, h=0.8, seed=1, tag='fence', r=0.033):
    tops = [post_(x, z, h, seed=seed + i, tag=tag) for i, (x, z) in enumerate(pts)]
    for i in range(len(tops) - 1):
        rope_(tops[i], tops[i + 1], sag=0.05 + 0.035 * (tops[i] - tops[i + 1]).length, r=r, tag=tag)
    return tops

def rail_fence(pts, h=0.72, r=0.075, seed=1, tag='fence', rr=(0.042, 0.034)):
    tops = [post_(x, z, h, r=r, seed=seed + i, tag=tag) for i, (x, z) in enumerate(pts)]
    for i in range(len(tops) - 1):
        a, b = tops[i] + Vector((0, 0.1, 0)), tops[i + 1] + Vector((0, 0.1, 0))
        rope_(a, b, sag=0.015, r=rr[0], n=2, K=5, col=(WD_LO, WD_HI), tag=tag)
        rope_(a - Vector((0, 0.36, 0)), b - Vector((0, 0.36, 0)), sag=0.012, r=rr[1], n=2, K=4, col=(mul(WD_LO, 0.9), WD), tag=tag)
    return tops

# ================================================================== cards: leaves, flowers (open shells with explicit normals and colours)
class Cards:
    def __init__(self, tag='plants', mat='leaf'):
        self.t = PTmp(); self.t.c = []; self.tag, self.mat = tag, mat; self.up = False; self.double = False
    def fix_winding(self):
        """a card's front must face its normal: the ink shell is drawn BackSide, so a card wound the other way is painted over"""
        t = self.t
        for fi, f in enumerate(t.f):
            P = [t.v[i] for i in f]; nn = Vector((0, 0, 0))
            for k in range(1, len(P) - 1): nn += (P[k] - P[0]).cross(P[k + 1] - P[0])
            if nn.dot(Z if self.up else sum((t.n[i] for i in f), Vector())) < 0: t.f[fi] = f[::-1]
        if self.double:     # (steep blades, seen from both sides: two copies on the true plane normals, so each ink shell pushes behind the side the viewer sees)
            nf = []
            for f in t.f:
                P = [t.v[i] for i in f]; g = Vector((0, 0, 0))
                for k in range(1, len(P) - 1): g += (P[k] - P[0]).cross(P[k + 1] - P[0])
                if g.length < 1e-12: continue
                g.normalize()
                nf.append([self.v(t.v[i], g, t.c[i]) for i in f]); nf.append([self.v(t.v[i], -g, t.c[i]) for i in f][::-1])
            t.f = nf
    def v(self, p, n, c):
        t = self.t; t.v.append(Vector(p)); t.n.append(Vector(n).normalized()); t.c.append(srgb(c)); return len(t.v) - 1
    def tri(self, a, b, c): self.t.f.append([a, b, c])
    def quad(self, a, b, c, d): self.t.f.append([a, b, c, d])
    def flush(self, uv=None):
        self.fix_winding()
        if self.t.f: put(self.t, None, self.tag, self.mat, uv=uv)
        self.t = PTmp(); self.t.c = []

def _basis(d, nrm):
    d = d.normalized(); side = d.cross(nrm)
    if side.length < 1e-5: side = d.cross(Vector((0.3, 0.7, 0.2)))
    side.normalize(); return d, side, side.cross(d).normalized()

def leaf2(C, b, d, nrm, L, W, c0, c1, sn=None):
    """a pointed folded leaf: two triangles along a raised spine"""
    d, s, u = _basis(d, nrm); n0 = sn or u
    m = b + d * (L * 0.42); fold = u * (W * 0.16)
    i0 = C.v(b, n0, c0); i1 = C.v(m + s * (W * 0.5) - fold, (n0 + s * 0.3), mix(c0, c1, 0.55)); i2 = C.v(b + d * L, n0, c1); i3 = C.v(m - s * (W * 0.5) - fold, (n0 - s * 0.3), mix(c0, c1, 0.4))
    C.tri(i0, i2, i1); C.tri(i0, i3, i2)

def leaf4(C, b, d, nrm, L, W, c0, c1, sn=None):
    """a rounded chunky leaf: a fan of four triangles"""
    d, s, u = _basis(d, nrm); n0 = sn or u
    fold = u * (W * 0.14)
    i0 = C.v(b, n0, c0)
    pts = [(0.3, 0.86), (0.68, 0.92), (1.0, 0.0), (0.68, -0.92), (0.3, -0.86)]
    ids = []
    for f, w in pts:
        q = b + d * (L * f) + s * (W * 0.5 * w) - fold * abs(w); nn = n0 + s * (0.3 * w)
        ids.append(C.v(q, nn, mix(c0, c1, f * (1.0 if w == 0 else 0.8))))
    for k in range(4): C.tri(i0, ids[k + 1], ids[k])

def leaf_up(C, b, d, nrm, L, W, c0, c1, sn=None, tmax=1.05):
    """a leaf shingled like a tile on a roof: its slope clamped, its width level (the game draws stand-in leaf parts double-sided, no ink shell)"""
    d = d.normalized(); el = clamp(math.asin(clamp(d.z, -1.0, 1.0)), -tmax, tmax); h = Vector((d.x, d.y, 0))
    h = h.normalized() if h.length > 1e-3 else Vector((1, 0, 0))
    leaf2(C, b, h * math.cos(el) + Z * math.sin(el), Z, L, W, c0, c1, sn=sn)

def blossom(C, c, nrm, r, petal, eye='#ffd24a', rot=0.0, petals=5, edge=None):
    """a chunky toy blossom: a star of round-ish petals round a raised eye (14 tris)"""
    nrm = nrm.normalized(); xa = (Vector((1, 0, 0)) if abs(nrm.x) < 0.9 else Vector((0, 1, 0))).cross(nrm).normalized(); ya = nrm.cross(xa)
    edge = edge or mix(petal, '#fff6ee', 0.45); ctr = C.v(c + nrm * (r * 0.05), nrm, mix(petal, eye, 0.45))
    rim = []
    for k in range(petals * 2):
        a = rot + PI * k / petals; rr = r if k % 2 == 0 else r * 0.56
        q = c + (xa * math.cos(a) + ya * math.sin(a)) * rr + nrm * (r * (0.13 if k % 2 == 0 else 0.0))
        rim.append(C.v(q, nrm, edge if k % 2 == 0 else mix(petal, '#a8406a', 0.14)))
    for k in range(len(rim)): C.tri(ctr, rim[k], rim[(k + 1) % len(rim)])
    # the eye: a little pyramid
    e0 = c + nrm * (r * 0.26); ei = C.v(e0, nrm, mix(eye, '#fff6d0', 0.4)); eb = []
    for k in range(3):
        a = rot + TAU * k / 3; eb.append(C.v(c + nrm * (r * 0.06) + (xa * math.cos(a) + ya * math.sin(a)) * (r * 0.24), nrm, mul(eye, 0.9)))
    for k in range(3): C.tri(ei, eb[k], eb[(k + 1) % 3])

def spike_(C, c, h, r, col, seed=0):
    """a soft flower spire: one tapering lumpy plume, banded pale toward the tip"""
    prof = [(r * 1.0, 0.1 * h), (r * 1.35, 0.3 * h), (r * 1.0, 0.5 * h), (r * 0.95, 0.68 * h), (r * 0.5, 0.86 * h), (0.0, h)]
    t = lathe(prof, 5, th0=seed).xform(Matrix.Translation(c))
    z0 = c.z
    put(t, lambda p, n: mix(mix(col, '#c0608a', 0.22), mix(col, '#fff4f0', 0.5), clamp((p.z - z0) / h * 1.1) * (0.6 + 0.4 * clamp(n.z + 0.6))), C.tag, 'leaf')

def rosette_leaves(C, x, y, z, n, L, W, seed=0, el=0.5, pal=None, leaf=leaf2, ring=0.05):
    """a low rosette of leaves spreading from (x, y, z)"""
    rnd = random.Random(seed); c0, c1 = pal or GREENS[seed % 4]
    b0 = V3(x, y, z)
    for k in range(n):
        a = TAU * k / n + rnd.uniform(-0.35, 0.35); e = min(0.65, el + rnd.uniform(-0.2, 0.3))
        d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
        lL = L * rnd.uniform(0.75, 1.2)
        leaf(C, b0 + Vector((d.x, d.y, 0)) * ring, d, (Z * 0.9 + Vector((d.x, d.y, 0)) * 0.3), lL, W * rnd.uniform(0.85, 1.15), mul(c0, rnd.uniform(0.9, 1.05)), mul(c1, rnd.uniform(0.9, 1.08)), sn=(Z + Vector((d.x, d.y, 0)) * 0.35))

def flowers_(x, z, n=5, r=0.4, colors=BLOOM, size=1.0, spikes=0, seed=1, y=None, nleaf=None, tag='flowers'):
    """a clump: a mound of leaves, big blossoms nestled over it, spikes among them"""
    rnd = random.Random(seed * 67 + 1); C = Cards(tag, 'leaf')
    for i in range(n):
        a = rnd.uniform(0, TAU); d = math.sqrt(rnd.random()) * r; px, pz = x + math.cos(a) * d, z + math.sin(a) * d; gy = (H(px, pz) if y is None else y)
        if nleaf != 0: rosette_leaves(C, px, gy - 0.01, pz, nleaf or 3, 0.24 * size, 0.13 * size, seed=seed + i, el=0.55)
        hh = rnd.uniform(0.13, 0.26) * size
        col = colors[rnd.randrange(len(colors))]
        if i < spikes:
            spike_(C, V3(px, gy + 0.05, pz), 0.62 * size, 0.06 * size, rnd.choice(['#ff9fc0', '#ffc2d8', '#ffb0a8']), seed + i)
            continue
        nn = (Z + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.1) - 0.15, 0))).normalized()
        blossom(C, V3(px, gy + hh, pz), nn, rnd.uniform(0.085, 0.12) * size, col, rot=rnd.uniform(0, TAU), eye='#ff9a3a' if col == '#ffd877' else '#ffd24a')
    C.flush()

def shrub_(x, z, r=0.45, color='#5aa548', flowers=None, nf=6, fs=0.085, sq=0.82, seed=1, y=None, density=1.0, tag='shrubs'):
    """a round leafy shrub of layered cards only, no solid mass: big dark cards deep inside for depth, a darker middle layer, a dense shingled shell
    whose normals round off as one lumpy ball, blossoms on top. Every card faces up and out, so the game camera sees its front (the ink shell is drawn BackSide)."""
    rnd = random.Random(seed * 71 + 9); gy = H(x, z) if y is None else y
    cc = Vector((x, -z, gy + r * sq * 0.72))
    dark, lo, hi = mix(color, '#1c3f28', 0.66), mix(color, '#24502e', 0.42), mix(color, '#dcf090', 0.32)
    C = Cards(tag, 'leaf'); C.up = True
    def lump(dd): return 1 + 0.22 * (vnoise(cc + dd * 1.6, 1.0, seed) - 0.5)
    def tangent(nn, spin):
        tg = Vector((0, 0, -1)) + nn * nn.z
        if tg.length < 1e-3: tg = Vector((1, 0, 0))
        return Quaternion(nn, spin) @ tg.normalized()
    Ni = int((8 + r * r * 26) * density)
    for i in range(Ni):
        u = -0.05 + 1.05 * (i + rnd.random()) / Ni; th = i * 2.399963; s_ = math.sqrt(max(0.0, 1 - min(1, u) ** 2)); dd = Vector((s_ * math.cos(th), s_ * math.sin(th), min(1, u)))
        p = cc + Vector((dd.x, dd.y, dd.z * sq)) * (r * rnd.uniform(0.34, 0.66)); tg = tangent(dd, rnd.uniform(-2.4, 2.4)); L = r * rnd.uniform(0.66, 0.86)
        leaf_up(C, p - tg * (L * 0.45), tg, dd + Z * 0.7, L, L * 0.72, mul(dark, 0.86), dark, sn=dd + Z * 0.3)
    N = int((30 + r * r * 240) * density); Nm = int(N * 0.26)
    for i in range(Nm + N):
        mid = i < Nm; q_ = (i if mid else i - Nm) + rnd.random(); nn_ = Nm if mid else N
        u = -0.25 + 1.25 * q_ / nn_; th = i * 2.399963 + rnd.uniform(-0.3, 0.3); s_ = math.sqrt(max(0.0, 1 - min(1, u) ** 2)); nn = Vector((s_ * math.cos(th), s_ * math.sin(th), min(1, u)))
        p = cc + Vector((nn.x, nn.y, nn.z * sq)) * (r * lump(nn) * (rnd.uniform(0.76, 0.86) if mid else rnd.uniform(0.95, 1.07)))
        tg = tangent(nn, rnd.uniform(-1.1, 1.1)); L = rnd.uniform(0.22, 0.31) * min(1.3, 0.7 + r)
        k = clamp(0.5 + 0.5 * nn.z + rnd.uniform(-0.15, 0.15))
        c0, c1 = (mix(dark, lo, k), mix(lo, color, k)) if mid else (mix(lo, color, k), mix(color, hi, k))
        leaf_up(C, p - tg * (L * 0.35), tg, nn + Z * 0.6, L, L * 0.58, c0, c1, sn=nn + Z * 0.25)
    if flowers:
        for i in range(nf):
            a = i * 2.399963 + rnd.uniform(-0.4, 0.4); u = rnd.uniform(0.3, 0.85); s_ = math.sqrt(1 - u * u)
            nn = Vector((s_ * math.cos(a), s_ * math.sin(a), u)); p = cc + Vector((nn.x, nn.y, nn.z * sq)) * (r * 1.1)
            blossom(C, p, nn + Z * 0.4, fs * rnd.uniform(0.9, 1.2), flowers[i % len(flowers)], rot=rnd.uniform(0, TAU))
    C.flush()

def fern_(x, z, s=1.0, n=5, seed=1, y=None, tag='ferns'):
    """arching fronds: a zigzag strip of lobes, narrowing to a tip (12 tris a frond)"""
    rnd = random.Random(seed * 37 + 3); gy = H(x, z) if y is None else y; C = Cards(tag, 'leaf')
    c0, c1 = rnd.choice([('#3f7a3e', '#86c058'), ('#4a8a42', '#9acb60')])
    b = V3(x, gy + 0.03, z)
    for k in range(n):
        a = TAU * k / n + rnd.uniform(-0.3, 0.3); L = rnd.uniform(0.5, 0.72) * s; W = 0.11 * s; e = rnd.uniform(0.45, 0.65)
        d = Vector((math.cos(a), math.sin(a), 0)); side = Vector((-d.y, d.x, 0))
        prev = C.v(b, Z, c0)
        rows = 4; lr = None
        for i in range(1, rows + 1):
            t = i / rows; q = b + d * (L * t) + Z * (L * (math.sin(e) * t - 0.6 * t * t))
            ww = W * math.sin(PI * min(1.0, t * 1.02) ** 0.85) * (1.0 if i % 2 else 0.6)
            nn = (Z * 0.9 + d * 0.3)
            col = mix(c0, c1, t * 0.9)
            if i == rows:
                tip = C.v(q, nn, col)
                if lr: C.tri(lr[0], lr[1], tip)
            else:
                l = C.v(q + side * ww, nn, col); r = C.v(q - side * ww, nn, col)
                if lr is None: C.tri(prev, r, l)
                else: C.quad(lr[0], lr[1], r, l) if False else (C.tri(lr[0], lr[1], r), C.tri(lr[0], r, l))
                lr = (l, r)
    C.flush()

def tuft_(x, z, h=0.45, n=5, seed=1, y=None, colors=('#5f9e3e', '#9acb58'), lean=0.35, tag='tufts'):
    rnd = random.Random(seed * 29 + 4); gy = H(x, z) if y is None else y; C = Cards(tag, 'leaf')
    for k in range(n):
        a = rnd.uniform(0, TAU); L = h * rnd.uniform(0.7, 1.25); e = PI / 2 - lean * rnd.uniform(0.4, 1.4)
        d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
        b = V3(x + math.cos(a) * 0.05, gy - 0.02, z - math.sin(a) * 0.05)
        leaf2(C, b, d, (Z * 0.4 + Vector((d.x, d.y, 0))), L, 0.075, colors[0], colors[1], sn=(Z + Vector((d.x, d.y, 0)) * 0.4))
    C.flush()

def bamboo_(x, z, n=3, h=4.0, spread=0.5, seed=1, tag='bamboo', sprays=4, K=5):
    """chunky green culms with node rings, leaf sprays toward the top"""
    rnd = random.Random(seed * 83 + 2); C = Cards(tag, 'leaf')
    for i in range(n):
        cx, cz = x + rnd.uniform(-spread, spread), z + rnd.uniform(-spread, spread); gy = H(cx, cz) - 0.08
        hh = h * rnd.uniform(0.78, 1.1); lx, lz = rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25); r0 = rnd.uniform(0.072, 0.09)
        rows = 7; path = [V3(cx + lx * (j / rows) ** 2, gy + hh * j / rows, cz + lz * (j / rows) ** 2) for j in range(rows + 1)]
        t = tube(path, lambda s: r0 * (1 - 0.35 * s), K=K, caps=False, up=Vector((1, 0, 0)))
        base = rnd.choice(['#a0c468', '#94ba5e', '#aacc72'])
        def col(p, nn, gy=gy, base=base, hh=hh):
            q = (p.z - gy) / (hh / rows)
            kk = mix(base, '#d0e090', clamp(nn.x * 0.3 - nn.y * 0.2 + 0.3))
            if abs(q - round(q)) < 0.04: kk = mix(kk, '#55803a', 0.65)   # (the rows sit on the nodes)
            return kk
        put(t, col, tag, 'leaf')
        for k in range(sprays):
            s = 0.58 + k * (0.42 / max(1, sprays - 1)); q = path[min(rows, int(s * rows))]; a = rnd.uniform(0, TAU)
            ww = (0.9 - 0.25 * k / sprays)
            for j in range(5):
                aa = a + (j - 2) * 0.48; d = Vector((math.cos(aa), math.sin(aa), -0.18 + rnd.uniform(-0.1, 0.12)))
                leaf2(C, q + Vector((math.cos(a), math.sin(a), 0)) * 0.1, d, Z, 0.58 * ww, 0.14, '#4f8e3e', '#a3d068', sn=(Z + d * 0.25))
    C.flush()

# ================================================================== finish: cull, AO, export
def cull_under(extra=None):
    """drop faces entirely under the ground (or deeper than 45 cm under the sea); vertices compacted"""
    for k, o in A.objs.items():
        keep = []
        hgt = {}
        for f in o['f']:
            below = True
            for i in f:
                if i not in hgt:
                    v = o['v'][i]; hgt[i] = max(H(v.x, -v.y) - 0.16, S.water - 0.5)
                if o['v'][i].z >= hgt[i]: below = False; break
            keep.append(not below)
        used = {}
        nf, nm, nl = [], [], []
        ln = o.get('ln') or [None] * len(o['f'])
        for f, m, l, ok in zip(o['f'], o['m'], ln, keep):
            if not ok: continue
            nf.append([used.setdefault(i, len(used)) for i in f]); nm.append(m); nl.append(l)
        order = sorted(used, key=used.get)
        o['v'] = [o['v'][i] for i in order]; o['n'] = [o['n'][i] for i in order]; o['c'] = [o['c'][i] for i in order]
        o['f'], o['m'], o['ln'] = nf, nm, nl
        if k in A.uv:
            u = A.uv[k] + [(0.0, 0.0)] * (len(used) + 10 ** 6 - len(A.uv[k]))
            A.uv[k] = [u[i] if i < len(u) else (0.0, 0.0) for i in order]

def site_ao(skip=('window_glow', 'cloth', 'water'), NR=20, DMAX=1.0, K=0.6, weights=None, ground=True):
    """soft contact shade: rays against the piece and the place's own ground"""
    weights = weights or {}
    allv, allf = [], []
    for k, o in A.objs.items():
        b = len(allv); allv += o['v']
        for f in o['f']:
            for q in range(1, len(f) - 1): allf.append([f[0] + b, f[q] + b, f[q + 1] + b])
    if ground:
        st = 0.5; xs = [i * st for i in range(-26, 27)]; b = len(allv)
        for z in xs:
            for x in xs: allv.append(V3(x, H(x, z), z))
        nn = len(xs)
        for j in range(nn - 1):
            for i in range(nn - 1):
                a = b + j * nn + i; allf.append([a, a + 1, a + nn + 1]); allf.append([a, a + nn + 1, a + nn])
    bvh = BVHTree.FromPolygons(allv, allf)
    dirs = []; ga = PI * (3 - math.sqrt(5))
    for k in range(NR):
        r = math.sqrt((k + 0.5) / NR); a = k * ga
        x, y = r * math.cos(a), r * math.sin(a); dirs.append(Vector((x, y, math.sqrt(max(0.0, 1 - x * x - y * y)))))
    for k, o in A.objs.items():
        if k in skip: continue
        w = weights.get(k, 1.0)
        for i, (v, n) in enumerate(zip(o['v'], o['n'])):
            q = n.to_track_quat('Z', 'Y'); occ = 0.0; org = v + n * 0.015
            for d in dirs:
                hit = bvh.ray_cast(org, q @ d, DMAX)
                if hit[0] is not None: occ += 1 - hit[3] / DMAX
            occ /= NR
            kk = 1 - (w * 0.35 if id(v) in MOSSV else w) * clamp(occ * 1.25) * K
            c = o['c'][i]; o['c'][i] = (c[0] * kk, c[1] * kk, c[2] * kk, 1.0)

BUDGET = {}
def export_glb(name, place=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for m in A.objs:
        mt = bpy.data.materials.new(m); mt.use_nodes = True; nt = mt.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        if 'glow' in m:
            bsdf.inputs['Emission Color'].default_value = lin('#ffd890'); bsdf.inputs['Emission Strength'].default_value = 1.0
        mats[m] = mt
    obs = []
    for k, o in A.objs.items():
        ob = to_object(k, o, mats)
        uvs = A.uv.get(k, []) + [(0.0, 0.0)] * (len(o['v']) - len(A.uv.get(k, [])))
        me = ob.data; ul = me.uv_layers.new(name='UVMap'); data = []
        for li in range(len(me.loops)):
            u_, v_ = uvs[me.loops[li].vertex_index]; data.extend((u_, 1.0 - v_))   # (the glTF exporter flips v: the game gets the intended uv)
        ul.data.foreach_set('uv', data)
        obs.append(ob)
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('PW %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('PW %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('PW %s bounds game x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('PW %s check %s %s' % (name, ob.name, check(ob)))
    if place: BUDGET[place] = BUDGET.get(place, 0) + A.tris()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_attributes=True,
              export_lights=False, export_cameras=False, export_animations=False, export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('PW export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('PW wrote', out)

def cull_hidden(R=0.24, NR=18):
    """drop faces whose every vertex sees nothing of the sky within R: rocks pushed into rocks or into the tower"""
    allv, allf = [], []
    for k, o in A.objs.items():
        b = len(allv); allv += o['v']
        for f in o['f']:
            for q in range(1, len(f) - 1): allf.append([f[0] + b, f[q] + b, f[q + 1] + b])
    bvh = BVHTree.FromPolygons(allv, allf)
    ga = PI * (3 - math.sqrt(5)); dirs = []
    for k in range(NR):
        r = math.sqrt((k + 0.5) / NR); a = k * ga
        x, y = r * math.cos(a), r * math.sin(a); dirs.append(Vector((x, y, math.sqrt(max(0.0, 1 - x * x - y * y)))))
    for k, o in A.objs.items():
        if k in ('leaf', 'window_glow', 'cloth', 'water'): continue
        hid = []
        for v, n in zip(o['v'], o['n']):
            q = n.to_track_quat('Z', 'Y'); org = v + n * 0.01
            hid.append(all(bvh.ray_cast(org, q @ d, R)[0] is not None for d in dirs))
        ln = o.get('ln') or [None] * len(o['f'])
        def centre_hidden(f):
            # (several sample points: a point can sit inside a slat laid over the face, whose rays then all hit)
            P = [o['v'][j] for j in f]; nn = Vector((0, 0, 0))
            for q in range(1, len(P) - 1): nn += (P[q] - P[0]).cross(P[q + 1] - P[0])
            if nn.length < 1e-12: return True
            nn.normalize(); c = sum(P, Vector()) / len(P); qq = nn.to_track_quat('Z', 'Y')
            for pt in [c] + [c.lerp(v, 0.7) for v in P]:
                org = pt + nn * 0.01
                if not all(bvh.ray_cast(org, qq @ d, R)[0] is not None for d in dirs): return False
            return True
        keep = [i for i, f in enumerate(o['f']) if not (all(hid[j] for j in f) and centre_hidden(f))]
        o['f'] = [o['f'][i] for i in keep]; o['m'] = [o['m'][i] for i in keep]; o['ln'] = [ln[i] for i in keep]

def finish(name, place=None, ao=True, **k):
    cull_under()
    cull_hidden()
    if ao: site_ao(**k)
    export_glb(name, place)

# ---------------------------------------------------------------- small shared bits (game-local, in the F frame)
def glowuv(flicker=0.0, tint=0.0): return lambda p, f=flicker, t=tint: (f, t)
def glowput(t, col, tag='lamp', flicker=0.0, tint=0.0): return put(t, col, tag, 'window_glow', uv=glowuv(flicker, tint))

def lantern_paper(pos, r=0.15, h=0.28, cord=0.3, color='#fff1d6', K=8, tag='lanterns', mark=None, flicker=0.5):
    """a round paper chochin hung from `pos` (F frame): a cord, a dark cap and foot, ribbed glowing paper"""
    x, y, z = pos
    if cord > 0: put(cyl(0.016, 0.016, cord, (x, y - cord / 2, z), K=4), flat('#6a5040'), tag, 'body')
    y0 = y - cord
    put(cyl(r * 0.5, r * 0.56, 0.05, (x, y0 - 0.025, z), K=K), lac('#54402f'), tag, 'body')
    prof = []
    for k in range(7):
        t = k / 6; prof.append((max(0.0, r * (0.42 + 0.58 * math.sin(t * PI)) * (1.035 if k % 2 else 1.0)), -t * h))
    t = glathe(prof, K=K, pos=(x, y0 - 0.05, z))
    glowput(t, lambda p, n: mix(mul(color, 0.86), mix(color, '#fff8e8', 0.6), clamp(n.z * 0.35 + 0.65 - n.y * 0.2)), tag, flicker=flicker, tint=0.85)
    put(cyl(r * 0.5, r * 0.42, 0.04, (x, y0 - 0.05 - h - 0.012, z), K=K), lac('#54402f'), tag, 'body')
