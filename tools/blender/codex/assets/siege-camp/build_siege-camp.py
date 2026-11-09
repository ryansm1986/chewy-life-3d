# PAWHAVEN: the siege camps' tents, stake barricades, campfires and captive cages (task siege-camp), built in Blender by script.
#   blender --background --factory-startup --python build_siege-camp.py -- --piece tent|spikes|campfire|cage|tent-v1|...|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up. Each piece sits in its kit function's local frame (src/regions/village/art.js): the same origin,
# facing, ground level and size. Layout code is written in the kit's game frame (x, y up, z front), mapped to Blender (x, -z, y).
# Kits: base_kit.py + rg_kit.py + dg_common.py (copied from dg-onsen: buckets, painters, ray AO, the fixed export).
# Materials (art.js glbInto sorts them into the Builder's buckets): body, cloth.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
_p = os.path.join(HERE, 'dg_common.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))

# ================================================================== palette (sRGB)
BARK_LO = '#4a3628'; BARK = '#7c5c40'; BARK_HI = '#ab885c'
RAW = '#ecd0a2'; RAW_DK = '#b48e62'
ROPE_LO = '#94804e'; ROPE_HI = '#f0dea8'
BONE = '#efe4c8'; BONE_DK = '#b4a484'; INKD = '#2c2230'
STRAW = '#ecc878'; STRAW_LT = '#fbe6a0'; STRAW_DK = '#a87e3c'; STRAW_UN = '#4e3c26'
BAM = '#b4b45e'; BAM_HI = '#d6d684'; BAM_LO = '#74763a'; BAM_NODE = '#e4dc9a'; BAM_RING = '#565a2c'
STONE_SET = [('#a8a0aa', '#d6ced2', '#6e6678'), ('#9c96a6', '#cac4d0', '#646072'), ('#b4aaa4', '#dcd2c8', '#766c6c'), ('#a4a4ac', '#d0d0d4', '#686874')]

# ================================================================== shells with hard (cut) edges
class HTmp(PTmp):
    """a shell whose corner normals split across edges sharper than deg: cut stone planes and whittled stake facets"""
    deg = 38.0
    def cn(self, f):
        if not hasattr(self, '_vf'):
            self._fn = {}; self._vf = {}
            for g in self.f:
                key = tuple(g); P = [self.v[i] for i in g]; nn = Vector((0, 0, 0))
                for k in range(1, len(P) - 1): nn += (P[k] - P[0]).cross(P[k + 1] - P[0])
                self._fn[key] = nn
                for i in g: self._vf.setdefault(i, []).append(key)
        fn = self._fn[tuple(f)]; fu = fn.normalized(); cs = math.cos(math.radians(self.deg)); out = []
        for i in f:
            acc = Vector((0, 0, 0))
            for g in self._vf[i]:
                gn = self._fn[g]
                if gn.normalized().dot(fu) >= cs: acc += gn
            out.append(acc.normalized() if acc.length > 1e-12 else fu)
        return out

def perp(d):
    r = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = (r - d * r.dot(d)).normalized(); return u, d.cross(u)

def put_cloth(t, col, tag, uvs):
    """a cloth piece with its uv per vertex (u, v as the game reads them: v = 1 is held still, 0 sways most)"""
    o = A.objs.get('cloth'); b = len(o['v']) if o else 0
    A.add('cloth', 'cloth', t, col, tag)
    lst = A.uv.setdefault('cloth', [])
    lst.extend([(0.0, 0.0)] * (b - len(lst))); lst.extend(uvs)

# ================================================================== wood
def sc_log(a, b, r0, r1=None, K=8, rows=4, seed=0, flute=0.06, bend=0.0, tag='log', pal=(BARK_LO, BARK, BARK_HI), cap0=True, cap1=True, capc=RAW, char=None):
    """a barked log from game-local a to b: fluted section, a bend, sawn end discs with a pale face and a dark rim;
    char(p, n) -> 0..1 chars the bark (the fire's logs)"""
    r1 = r0 if r1 is None else r1
    A_, B_ = F.W(a), F.W(b); ax = B_ - A_; Ln = ax.length; d = ax / Ln; u, w = perp(d)
    rnd = random.Random(seed * 13 + 7); ph = rnd.uniform(0, TAU)
    rings, cs, meta = [], [], []
    for j in range(rows + 1):
        s = j / rows; c = A_ + d * (Ln * s) + u * (bend * math.sin(PI * s))
        r = (r0 + (r1 - r0) * s) * (1 + 0.035 * math.sin(s * 7 + ph))
        ring = []
        for k in range(K):
            th = TAU * k / K; fl = 1 + flute * math.cos(3 * th + ph + s * 1.5) + flute * 0.6 * math.cos(5 * th + 2 * ph)
            ring.append(c + (u * math.cos(th) + w * math.sin(th)) * r * fl)
            meta.append((th, s))
        rings.append(ring); cs.append(c)
    t = PTmp(); ring_surface(t, rings, cs); t.normals()
    t.c = []
    for (th, s), p, n in zip(meta, t.v, t.n):
        f = 0.5 + 0.5 * math.cos(3 * th + ph + s * 1.5)
        c = mix(pal[0], pal[1], smooth(0.05, 0.6, f))
        c = mix(c, pal[2], smooth(0.55, 1.0, f) * (0.35 + 0.65 * clamp(n.z)))
        c = mul(c, (0.84 + 0.22 * clamp(n.z * 0.5 + 0.5)) * (0.94 + 0.12 * vnoise(p, 5.0, seed)))
        if char is not None:
            k = char(p, n)
            if k > 0: c = mix(c, '#2a2226', k)
        t.c.append(c)
    put(t, None, tag, 'body')
    for ok, ring, c, nn in ((cap0, rings[0], cs[0], -d), (cap1, rings[-1], cs[-1], d)):
        if not ok: continue
        q = PTmp()
        rim = [q.vert(p, nn) for p in ring]; mid = [q.vert(c + (p - c) * 0.58 + nn * 0.002, nn) for p in ring]; ci = q.vert(c + nn * 0.004, nn)
        n_ = len(ring)
        for k in range(n_):
            k1 = (k + 1) % n_
            q.face([rim[k], rim[k1], mid[k1], mid[k]], nn); q.face([ci, mid[k], mid[k1]], nn)
        q.c = [mul(capc, 0.62) for _ in rim] + [capc for _ in mid] + [mul(capc, 0.8)]
        put(q, None, tag + 'Cut', 'body')
    return t

def sc_stake(foot, top, r, K=6, seed=0, tag='stake', pal=(BARK_LO, BARK, BARK_HI), broken=False):
    """a sharpened stake: a barked shaft, then a whittled point of pale cut facets with a ragged edge (broken: a snapped top)"""
    A_, B_ = F.W(foot), F.W(top); ax = B_ - A_; Ln = ax.length; d = ax / Ln; u, w = perp(d)
    rnd = random.Random(seed * 17 + 3); ph = rnd.uniform(0, TAU)
    tl = min(0.3, Ln * 0.26) if not broken else 0.08
    def sec(c, rr, wob=0.04):
        return [c + (u * math.cos(ph + TAU * k / K) + w * math.sin(ph + TAU * k / K)) * rr * (1 + wob * math.sin(k * 2.4 + ph)) for k in range(K)]
    sh = A_ + d * (Ln - tl)
    rings = [sec(A_, r * 1.08), sec(A_ + d * (Ln - tl) * 0.45, r), sec(sh, r * 0.96)]; cs = [A_, A_ + d * (Ln - tl) * 0.45, sh]
    t = PTmp(); ids = ring_surface(t, rings, cs); t.normals(); t.c = []
    for i, (p, n) in enumerate(zip(t.v, t.n)):
        k = i % K; f = 0.5 + 0.5 * math.cos(2 * k + ph)
        c = mix(pal[0], pal[1], 0.35 + 0.65 * f); c = mix(c, pal[2], clamp(n.z) * 0.55 * f)
        t.c.append(mul(c, 0.9 + 0.14 * vnoise(p, 6.0, seed)))
    put(t, None, tag, 'body')
    # the point
    q = HTmp(); q.deg = 28.0
    base = [sh + (rings[2][k] - sh) + d * (-0.05 if k % 2 else 0.035) for k in range(K)]
    if broken:
        c1 = sh + d * tl
        tips = [c1 + (rings[2][k] - sh) * 0.85 + d * (0.075 if k % 2 else -0.05) * (1 + 0.4 * math.sin(k * 3.1)) for k in range(K)]
        b_ = [q.vert(p) for p in base]; tp = [q.vert(p) for p in tips]; ci = q.vert(c1 - d * 0.01)
        for k in range(K):
            k1 = (k + 1) % K
            fc = (base[k] + base[k1]) / 2 - sh
            q.face([b_[k], b_[k1], tp[k1], tp[k]], fc); q.face([ci, tp[k], tp[k1]], d)
    else:
        apex = B_ + u * rnd.uniform(-0.006, 0.006) + w * rnd.uniform(-0.006, 0.006)
        b_ = [q.vert(p) for p in base]; md = [q.vert(sh + d * (tl * 0.55) + (rings[2][k] - sh) * 0.52) for k in range(K)]; ap = q.vert(apex)
        for k in range(K):
            k1 = (k + 1) % K
            fc = (base[k] + base[k1]) / 2 - sh
            q.face([b_[k], b_[k1], md[k1], md[k]], fc); q.face([ap, md[k], md[k1]], fc + d * 0.1)
    def tipc(p, n):
        s = (p - sh).dot(d) / max(tl, 1e-4)
        c = mix(RAW_DK, RAW, smooth(-0.4, 0.5, s)); return mul(c, 0.82 + 0.26 * clamp(n.z * 0.6 + 0.4))
    put(q, tipc, tag + 'Tip', 'body')

def rope_f(seed=0, lo=ROPE_LO, hi=ROPE_HI):
    def f(p, n):
        c = mix(lo, hi, 0.2 + 0.8 * smooth(-0.5, 0.75, n.z))
        return mul(c, 0.9 + 0.2 * vnoise(p, 22.0, seed))
    return f

def sc_loop(c, axis, R, r=0.022, n=7, K=4, tag='rope', sq=(1.0, 1.0), seed=0, col=None):
    """a chunky loop of rope round a game-local axis"""
    c_ = F.W(c); d = F.N(axis); u, w = perp(d)
    path = [c_ + u * (math.cos(TAU * k / n) * R * sq[0]) + w * (math.sin(TAU * k / n) * R * sq[1]) for k in range(n)]
    t = tube_loop(path, lambda s: r, K=K, up=d)
    put(t, col or rope_f(seed), tag, 'body')

def sc_rope(pts, r=0.018, K=4, tag='rope', sag=0.0, n=None, seed=0, col=None):
    """a rope along game-local points; two points with sag -> a drooping line of n segments"""
    if len(pts) == 2 and n:
        a, b = Vector(pts[0]), Vector(pts[1]); pts = [tuple(a + (b - a) * (i / n) - Vector((0, sag * math.sin(PI * i / n), 0))) for i in range(n + 1)]
    P = [F.W(p) for p in pts]
    put(tube(P, lambda s: r, K=K, up=Y), col or rope_f(seed), tag, 'body')

# ================================================================== cut stone
_ICO = None
def ico1():
    global _ICO
    if _ICO: return _ICO
    g = (1 + 5 ** 0.5) / 2
    V0 = [Vector(v).normalized() for v in [(-1, g, 0), (1, g, 0), (-1, -g, 0), (1, -g, 0), (0, -1, g), (0, 1, g), (0, -1, -g), (0, 1, -g), (g, 0, -1), (g, 0, 1), (-g, 0, -1), (-g, 0, 1)]]
    F0 = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    mid = {}; V1 = list(V0); F1 = []
    def m(a, b):
        k = (min(a, b), max(a, b))
        if k not in mid: mid[k] = len(V1); V1.append((V1[a] + V1[b]).normalized())
        return mid[k]
    for a, b, c in F0:
        ab, bc, ca = m(a, b), m(b, c), m(c, a)
        F1 += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    _ICO = (V1, F1); return _ICO

def sc_stone(pos, rx, ry, rz, seed=0, cuts=4, yaw=0.0, pal=None, soot=None, tag='stones', tilt=(0.0, 0.0), bury=0.02):
    """a dressed field stone (game-local): a lumpy pebble with a few flat cut planes and hard edges, no faces under the ground"""
    rnd = random.Random(seed * 31 + 11); VV, FF = ico1()
    lumps = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-0.6, 0.6), rnd.uniform(-1, 1))).normalized() * rnd.uniform(1.6, 2.8), rnd.uniform(0, TAU), rnd.uniform(0.03, 0.07)) for _ in range(3)]
    planes = []
    for k in range(cuts):
        a = rnd.uniform(0, TAU); el = rnd.uniform(0.25, 0.95) if k else 1.25   # (the first: a flat top; the rest: shoulders)
        planes.append((Vector((math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el))), rnd.uniform(0.66, 0.84)))
    M = F.m @ lm(pos, yaw, tilt[0], tilt[1])
    t = HTmp(); keep = []
    for u in VV:
        p = u * (1 + sum(am * math.sin(w.dot(u) + ph) for w, ph, am in lumps))
        for nn, lim in planes:
            dd = p.dot(nn)
            if dd > lim: p = p - nn * (dd - lim)
        q = M @ gl((p.x * rx, p.y * ry, p.z * rz))
        z0 = (F.m @ gl((0, -bury, 0))).z
        if q.z < z0: q.z = z0
        keep.append(t.vert(q))
    ctr = M @ gl((0, 0, 0))
    z0 = (F.m @ gl((0, -bury, 0))).z + 1e-4
    for a, b, c in FF:
        if t.v[a].z <= z0 and t.v[b].z <= z0 and t.v[c].z <= z0: continue
        t.face([a, b, c], (t.v[a] + t.v[b] + t.v[c]) / 3 - ctr)
    base, hi, lo = pal or STONE_SET[seed % len(STONE_SET)]
    sp = stone_paint(base, hi=hi, lo=lo, seed=seed + 40)
    def col(p, n):
        c = sp(p, n)
        if n.z > 0.72: c = mix(c, hi, 0.4)        # the cut tops catch the light
        if soot is not None:
            k = soot(p, n)
            if k > 0: c = mix(c, '#2e2628', k)
        return c
    put(t, col, tag, 'body')

# ================================================================== little trophies
def sc_skull(pos, s=1.0, ry=0.0, tag='trophy'):
    """the camps' horned knob (the war banners' totem): a pale round head, dark sockets, two little horns"""
    with at(pos, ry=ry, s=s):
        bc = lambda p, n: mix(BONE_DK, BONE, smooth(-0.5, 0.6, n.z))
        put(sph(0.095, (0, 0, 0), sc=(1, 0.92, 1), K=8, J=5), bc, tag, 'body')
        for e in (-1, 1):
            put(glathe([(0.0, 0.0), (0.044, 0.0), (0.028, 0.06), (0.0, 0.115)], 5, pos=(e * 0.062, 0.06, 0), rz=-e * 0.5), lambda p, n: mix(BONE_DK, '#fff4dc', smooth(-0.2, 0.7, n.z)), tag, 'body')
            put(sph(0.027, (e * 0.038, 0.005, 0.078), sc=(1, 0.8, 0.5), K=6, J=3), flat(INKD), tag, 'body')

def straw_block(c, sx, sy, sz, seed=0, tag='straw', K=14):
    """a bound sheaf: a soft lumpy cushion of straw, streaked along its length"""
    t = lathe([(0.0, -1.0), (0.72, -0.86), (1.0, -0.2), (0.92, 0.55), (0.5, 0.95), (0.0, 1.0)], K, sx=sz, sy=sx, th0=seed * 0.3)
    M = F.m @ lm(c)
    t.v = [M @ Vector((p.x, p.y, p.z * sy)) for p in t.v]; t.n = [None] * len(t.v)
    t.orient(); t.normals(); t.c = []
    for i, (p, n) in enumerate(zip(t.v, t.n)):
        c0 = mix(STRAW_DK, STRAW, smooth(-0.4, 0.5, n.z)); c0 = mix(c0, STRAW_LT, smooth(0.5, 1.0, n.z) * (0.5 if i % 2 else 0.9))
        t.c.append(mul(c0, 0.92 if i % 2 else 1.04))
    put(t, None, tag, 'body')

# ================================================================== 1. the tent (kit tent: L 1.7, w 1.4, h 1.15; ridge along x, mouth toward +x)
TENT_WAYS = [
    # plum
    dict(C='#8c6494', CH='#c0a0c8', CL='#523a5e', FL='#725080', TRIM='#d4b478', PATCH=[('#c0a06c', '#8c7048'), ('#9a7ca8', '#6c5278'), ('#b08a5c', '#7c6040')], sag=0.03, seed=3),
    # slate
    dict(C='#6c88a6', CH='#aec8dc', CL='#3e5470', FL='#566e8a', TRIM='#d0b078', PATCH=[('#b89a6a', '#846c48'), ('#7c96ac', '#546c82'), ('#c2a470', '#8c744e')], sag=0.05, seed=17),
    # moss
    dict(C='#80965a', CH='#bace8a', CL='#4a5e36', FL='#667a46', TRIM='#d8bc80', PATCH=[('#c4a46c', '#8e744c'), ('#8ca05e', '#647840'), ('#a88a58', '#78603e')], sag=0.04, seed=29),
]

def build_tent(v):
    new_asset(); W_ = TENT_WAYS[v]
    L, w, h = 1.7, 1.4, 1.15
    HX = L / 2 + 0.02; HW = w / 2 + 0.04; rnd = random.Random(W_['seed']); sag = W_['sag']
    C_, CH, CL = W_['C'], W_['CH'], W_['CL']
    fa, fb = rnd.uniform(0, TAU), rnd.uniform(0, TAU)
    TEARS = {0: [(0.26, 0.2, 0.1, 1), (-0.52, 0.17, 0.08, -1)], 1: [(-0.26, 0.22, 0.13, 1), (0.52, 0.2, 0.09, 1), (0.13, 0.2, 0.11, -1)], 2: [(0.52, 0.2, 0.1, -1), (-0.39, 0.2, 0.1, 1)]}[v]
    def rh(x): return h - sag * (1 - (x / (L / 2)) ** 2)
    def tm(x, side):
        lift = 0.078 * abs(math.sin(TAU * (x + L / 2) / L)) ** 0.8
        tear = 0.0
        for x0, wd, dp, sd in TEARS:
            if sd == side: tear = max(tear, dp * clamp(1 - abs(x - x0) / wd))
        return 1 - lift / h - tear
    AF = 0.04
    def dfold(x, t, side):
        q = fa if side > 0 else fb
        return AF * t ** 1.3 * (math.sin(x * 5.4 + q) * 0.42 + math.sin(x * 12.5 + q * 2.1) * 0.58)
    def S(x, t, side, off=0.0, fold=True):
        """the canvas: x along the ridge, t 0 at the ridge .. 1 on the ground, side -1 / +1 (z), off along the slope's normal"""
        ny, nz = HW, side * h; nl = math.hypot(ny, nz); ny, nz = ny / nl, nz / nl
        d = (dfold(x, t, side) if fold else 0.0) + off
        y = rh(x) * (1 - t) - 0.05 * math.sin(PI * t); z = side * HW * t ** 0.96
        bow = -0.075 * math.sin(PI * min(t, 1.0)) * (abs(x) / HX) ** 6 * (1 if x > 0 else 1)
        return (x + (1 if x > 0 else -1) * bow, y + ny * d, z + nz * d)
    # ---------------- the canvas: a closed thick shell (outer, rolled hem, inner), its back end later closed by the gable
    NX, J = 16, 5; TH = 0.04
    FR = {5: 1.0, 4: 0.93, 3: 0.68, 2: 0.42, 1: 0.18}   # (row fractions: a narrow row by the hem, so the binding stays a tape)
    t_ = Tmp(); idO, idI, metaO = [], [], []; xs = [-HX + 2 * HX * i / (NX - 1) for i in range(NX)]
    for x in xs:
        oo, ii = [], []
        ts = [(-1, tm(x, -1) * FR[j]) for j in range(J, 0, -1)] + [(1, 0.0)] + [(1, tm(x, 1) * FR[j]) for j in range(1, J + 1)]
        for k, (sd, tt) in enumerate(ts):
            pO = S(x, tt, sd); oo.append(t_.vert(F.W(pO)))
            metaO.append((x, tt, sd, tt / tm(x, sd), dfold(x, tt, sd)))
            if tt == 0.0: pI = (pO[0], pO[1] - TH * 1.25, pO[2])
            else: pI = S(x, tt, sd, off=-TH)
            ii.append(t_.vert(F.W(pI)))
        idO.append(oo); idI.append(ii)
    Ns = 2 * J + 1
    for i in range(NX - 1):
        loop0 = idO[i] + idI[i][::-1]; loop1 = idO[i + 1] + idI[i + 1][::-1]; n_ = len(loop0)
        for k in range(n_):
            t_.face([loop0[k], loop0[(k + 1) % n_], loop1[(k + 1) % n_], loop1[k]], Vector((0, 0, 1)))
    for i in (0, NX - 1):
        for k in range(Ns - 1):
            t_.face([idO[i][k], idO[i][k + 1], idI[i][k + 1], idI[i][k]], Vector((1 if i else -1, 0, 0)))
    t_.orient(); t_.normals(); t_.c = [None] * len(t_.v)
    nv = 0
    for i in range(NX):
        for k in range(Ns):
            x, tt, sd, rel, df = metaO[nv]; nv += 1
            vi = idO[i][k]; p = t_.v[vi]; n = t_.n[vi]
            f = 0.5 + 0.5 * df / max(AF * max(tt, 0.2) ** 1.3, 1e-4)
            c = mix(CL, C_, smooth(0.0, 0.8, f) * 0.8 + 0.2)
            c = mix(c, CH, smooth(0.42, 0.0, tt) * 0.62)
            c = mix(c, CH, smooth(0.6, 1.0, f) * 0.22 * (1 - rel))
            c = mix(c, CL, smooth(0.62, 1.0, rel) * 0.5)
            c = mul(c, 0.94 + 0.12 * vnoise(p, 3.6, W_['seed']))
            if k in (0, Ns - 1): c = mix(c, W_['TRIM'], 0.72)               # the bound hem
            elif abs(i - (NX - 1)) == 0: c = mix(c, W_['TRIM'], 0.45)        # the mouth's edge, sewn in a paler tape
            t_.c[vi] = c
            t_.c[idI[i][k]] = mix('#1e1620', C_, 0.08) if k not in (0, Ns - 1) else mix(CL, W_['TRIM'], 0.3)
    put(t_, None, 'canvas', 'body')
    # ---------------- the closed back gable (fabric outside, near black inside), the floor in the dark
    xb = -HX + 0.05
    for sgn, colr in ((-1, mix(CL, C_, 0.45)), (1, '#1a1420')):
        g = PTmp(); pts = []
        for k in range(Ns):
            sd, tt = (-1, tm(xb, -1) * FR[J - k]) if k < J else (1, 0.0) if k == J else (1, tm(xb, 1) * FR[k - J])
            q = S(xb, tt, sd, off=-TH * 0.7); pts.append((xb, max(q[1], -0.0), q[2]))
        ids = [g.vert(F.W(q)) for q in pts]; ci = g.vert(F.W((xb - 0.012 * (-sgn), 0.36, 0)))
        for k in range(Ns - 1): g.face([ci, ids[k], ids[k + 1]], Vector((sgn, 0, 0)))
        g.face([ci, ids[-1], ids[0]], Vector((sgn, 0, 0)))
        put(g, flat(colr) if sgn > 0 else (lambda p, n, cc=colr: mix(mul(cc, 0.8), mix(cc, C_, 0.5), clamp(p.z / 1.1))), 'gable', 'body')
    xm = HX - 0.11; g = PTmp(); pts = []
    for k in range(Ns):
        sd, tt = (-1, tm(xm, -1) * FR[J - k]) if k < J else (1, 0.0) if k == J else (1, tm(xm, 1) * FR[k - J])
        q = S(xm, tt, sd, off=-TH * 0.8)
        pts.append((xm, -0.14 if k in (0, Ns - 1) else q[1], q[2]))
    ids = [g.vert(F.W(q)) for q in pts]; ci = g.vert(F.W((xm, 0.36, 0)))
    for k in range(Ns - 1): g.face([ci, ids[k], ids[k + 1]], Vector((1, 0, 0)))
    g.face([ci, ids[-1], ids[0]], Vector((1, 0, 0)))
    put(g, flat('#17111b'), 'mouth', 'body')
    # ---------------- the frame: crossed poles at both ends, the ridge pole under the canvas, sawn ends showing
    xp = HX + 0.075; yc = h + 0.03
    pp = lambda: (('#4a382c', '#6e5238', '#94744e'))
    for sx in (-1, 1):
        for s in (-1, 1):
            foot = (sx * xp + 0.0, -0.03, s * (HW - 0.1)); cross = (sx * xp + s * 0.024, yc, -s * 0.0)
            kk = (h + 0.21 + 0.03) / (yc + 0.03)
            tip = (foot[0] + (cross[0] - foot[0]) * kk, foot[1] + (cross[1] - foot[1]) * kk, foot[2] + (cross[2] - foot[2]) * kk)
            sc_log(foot, tip, 0.044, 0.038, K=6, rows=2, seed=40 + v + s + sx * 3, flute=0.03, tag='poles', pal=pp(), cap0=False)
        sc_loop((sx * xp, yc - 0.015, 0), (1, 0.15 * sx, 0), 0.075, r=0.021, n=7, K=4, tag='lash', sq=(1.0, 1.25), seed=v + 2)
    sc_log((-xp - 0.1, h + 0.032, 0), (xp + 0.1, h + 0.032, 0), 0.052, 0.048, K=7, rows=4, seed=44 + v, flute=0.04, bend=-sag, tag='ridge', pal=pp())
    for x_ in (-0.42, 0.4): sc_loop((x_, rh(x_) + 0.024, 0), (1, 0, 0), 0.066, r=0.021, n=6, K=4, tag='lash', seed=v + 3)
    # sewn seams: a raised tape down each flank
    for sd in (-1, 1):
        for xq in (-0.3 + 0.05 * sd, 0.27 + 0.04 * sd):
            P_ = [F.W(S(xq, tm(xq, sd) * tt, sd, off=0.012)) for tt in (0.03, 0.3, 0.6, 0.97)]
            put(tube(P_, lambda s_: 0.016, K=4, caps=False), lambda p, n: mix(CL, mix(C_, CH, 0.25), smooth(-0.3, 0.7, n.z)), 'seam', 'body')
    # ---------------- the patches (sewn-on cloth following the canvas), stitched in chunky cream
    SLEN = math.hypot(HW, h)
    def patch(xc, tc, side, hw, hh, cc, seed, stitches=6):
        rr = random.Random(seed)
        outl = []
        for k, (ax_, ay_) in enumerate(((1, 1), (0, 1.04), (-1, 1), (-1.05, 0), (-1, -1), (0, -1.06), (1, -1), (1.04, 0))):
            ku = 0.82 if (ax_ and ay_ and abs(ax_) == 1 and abs(ay_) == 1) else 1.0
            outl.append((ax_ * hw * ku * (1 + rr.uniform(-0.07, 0.07)), ay_ * hh * ku * (1 + rr.uniform(-0.07, 0.07))))
        Map = lambda dx, dy, off: S(xc + dx, tc - dy / SLEN, side, off=off)
        t2 = PTmp(); tops = [t2.vert(F.W(Map(a, b, 0.024))) for a, b in outl]; tuck = [t2.vert(F.W(Map(a * 1.04, b * 1.04, -0.012))) for a, b in outl]; ci = t2.vert(F.W(Map(0, 0, 0.03)))
        out_n = F.N((0, HW, side * h))
        n_ = len(outl)
        for k in range(n_):
            k1 = (k + 1) % n_
            t2.face([ci, tops[k], tops[k1]], out_n)
            t2.face([tops[k], tuck[k], tuck[k1], tops[k1]], (t2.v[tops[k]] + t2.v[tops[k1]]) / 2 - t2.v[ci])
        hi_, lo_ = cc
        put(t2, lambda p, n: mul(mix(lo_, hi_, smooth(-0.15, 0.55, n.z)), 0.94 + 0.12 * vnoise(p, 8.0, seed)), 'patch', 'body')
        # stitches: short dashes across the top and bottom edges
        for k in range(stitches):
            ky = 1 if k % 2 else -1; fx = -0.66 + 1.32 * ((k // 2) + 0.5) / max(1, (stitches + 1) // 2)
            a = Vector(F.W(Map(fx * hw, ky * hh * 0.78, 0.032))); b = Vector(F.W(Map(fx * hw + rr.uniform(-0.01, 0.01), ky * hh * 1.1, 0.014)))
            dd = (b - a); M = Matrix.Translation((a + b) / 2) @ dd.normalized().to_track_quat('X', 'Z').to_matrix().to_4x4()
            put(rbox((dd.length + 0.012, 0.03, 0.024), r=0.0, M=M), lambda p, n: mix('#b8a880', '#f4e8c8', clamp(n.z + 0.3)), 'stitch', 'body')
    plist = {0: [(-0.38, 0.5, 1, 0.14, 0.13, 0), (0.42, 0.68, 1, 0.11, 0.1, 2), (0.5, 0.5, -1, 0.14, 0.12, 1), (-0.46, 0.7, -1, 0.11, 0.1, 0)],
             1: [(0.34, 0.42, 1, 0.16, 0.14, 0), (-0.44, 0.62, 1, 0.13, 0.12, 1), (-0.3, 0.45, -1, 0.15, 0.15, 2), (0.42, 0.62, -1, 0.14, 0.11, 0), (-0.02, 0.76, 1, 0.09, 0.07, 2)],
             2: [(-0.56, 0.62, 1, 0.14, 0.11, 2), (0.45, 0.42, 1, 0.11, 0.12, 0), (-0.6, 0.58, -1, 0.14, 0.12, 0), (0.5, 0.64, -1, 0.12, 0.1, 1)]}[v]
    for i, (xc, tc, sd, hw, hh, pi_) in enumerate(plist): patch(xc, tc, sd, hw, hh, W_['PATCH'][pi_], W_['seed'] + i * 3)
    # ---------------- the yokai crest, sewn on (plum: both flanks; moss: one)
    CREST = [(0, 0.165), (0.06, 0.16), (0.09, 0.215), (0.15, 0.255), (0.15, 0.14), (0.185, 0.05), (0.165, -0.08), (0.09, -0.17), (0, -0.195), (-0.09, -0.17), (-0.165, -0.08), (-0.185, 0.05), (-0.15, 0.14), (-0.15, 0.255), (-0.09, 0.215), (-0.06, 0.16)]
    def crest(xc, tc, side):
        Map = lambda a, b, off: S(xc + a, tc - b / SLEN, side, off=off)
        def poly(pp_, off, colr, tag, cdy=0.0):
            t2 = PTmp(); ids = [t2.vert(F.W(Map(a, b, off))) for a, b in pp_]; rim = [t2.vert(F.W(Map(a, b, off - 0.016))) for a, b in pp_]
            ci = t2.vert(F.W(Map(sum(q[0] for q in pp_) / len(pp_), sum(q[1] for q in pp_) / len(pp_) + cdy, off))); nn = F.N((0, HW, side * h))
            for k in range(len(pp_)):
                k1 = (k + 1) % len(pp_)
                t2.face([ci, ids[k], ids[k1]], nn); t2.face([ids[k], rim[k], rim[k1], ids[k1]], (t2.v[ids[k]] + t2.v[ids[k1]]) / 2 - t2.v[ci])
            put(t2, colr, tag, 'body')
        poly(CREST, 0.03, lambda p, n: mix('#a89a7c', '#dccfac', smooth(-0.2, 0.5, n.z)), 'crest', cdy=0.01)
        for e in (-1, 1):
            poly([(e * 0.145, 0.06), (e * 0.03, 0.005), (e * 0.125, -0.025)], 0.04, flat(INKD), 'crestEye')
        poly([(-0.11, -0.085), (-0.055, -0.065), (0.0, -0.1), (0.055, -0.065), (0.11, -0.085), (0.0, -0.16)], 0.04, flat(INKD), 'crestEye')
    if v == 0: crest(-0.02, 0.5, 1); crest(0.0, 0.48, -1)
    if v == 2: crest(-0.06, 0.46, -1); crest(-0.04, 0.48, 1)
    # ---------------- the door flaps (cloth): hung from the ridge along the mouth's edge, hauled aside and tied back; a pale tape on the free edge
    for s in (-1, 1):
        rows_, cols_ = 6, 2; t2 = PTmp(); ids = []; uvs = []; tones = []
        xs_ = {0: 0.0, 1: 0.012 * s}[0]
        for j in range(rows_ + 1):
            vv = j / rows_; tt = tm(HX, s) * (0.02 + 0.92 * vv)
            e = S(HX, tt, s, off=TH * 0.25)
            wid = 0.03 + 0.2 * math.sin(PI * min(1.0, vv * 1.05)) ** 0.75 * (1 - 0.35 * smooth(0.6, 1.0, vv))
            if vv > 0.5: wid += 0.05 * smooth(0.5, 1.0, vv) * (1 if j % 2 else -0.5)
            row = []
            for i in range(cols_ + 1):
                u_ = i / cols_
                bulge = 0.022 * math.sin(PI * u_) + 0.016 * math.sin(j * 2.1 + s)
                y_ = e[1] + (0.04 * u_ if j >= rows_ else 0.0) + (0.05 * u_ * (0.5 - abs(vv - 0.5)))
                row.append(t2.vert(F.W((HX + 0.012 + bulge, y_, e[2] - s * wid * u_ - s * 0.0))))
                uvs.append((vv, 1.0 - 0.5 * u_))
                tones.append((u_, vv))
            ids.append(row)
        for j in range(rows_):
            for i in range(cols_):
                t2.face([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], Vector((1, 0, 0)))
        t2.normals(); t2.c = []
        for (u_, vv), p in zip(tones, t2.v):
            c = mix(W_['FL'], mix(W_['FL'], CH, 0.45), 0.5 + 0.5 * math.sin(vv * 9 + u_ * 2))
            c = mix(c, W_['TRIM'], smooth(0.62, 1.0, u_) * 0.85)
            t2.c.append(mul(c, 0.9 + 0.12 * (1 - vv)))
        put_cloth(t2, None, 'flap', uvs)
        # the tie-back
        ty = tm(HX, s) * 0.52; e = S(HX, ty, s)
        sc_rope([(HX + 0.04, e[1], e[2] - s * 0.17), (xp - 0.01, e[1] + 0.03, e[2] - s * 0.04)], r=0.018, tag='tie', seed=v)
    # ---------------- guy ropes and pegs from the hem's ties
    for sx in (-1, 1):
        for sd in (-1, 1):
            hx = sx * (HX - 0.12); q0 = S(hx, tm(hx, sd) * 0.97, sd)
            pk = (hx + sx * 0.07, 0.0, sd * (HW + 0.15))
            sc_log((pk[0], -0.03, pk[2]), (pk[0], 0.15, pk[2] + sd * 0.035), 0.032, 0.03, K=5, rows=1, seed=60 + sx + sd, flute=0.02, tag='peg', pal=('#5a4432', '#86684a', '#a88a60'), cap0=False)
            sc_rope([(q0[0], q0[1] + 0.03, q0[2]), (pk[0], 0.13, pk[2] + sd * 0.03)], r=0.016, tag='guy', seed=v + 5)
    # ---------------- each colourway's own dressing
    if v == 0:      # the horned knob on the mouth's crossed poles
        sc_skull((xp, h + 0.215, 0), s=1.05, ry=PI / 2)
    if v == 1:      # a spear lashed to the back poles, flying a ragged red pennant
        sx, top = -xp - 0.015, 1.86
        sc_log((sx, h - 0.2, 0.05), (sx, top, 0.03), 0.028, 0.026, K=5, rows=2, seed=70, flute=0.02, tag='staff', pal=('#4a382c', '#6e5238', '#94744e'), cap0=False)
        sc_loop((sx, h + 0.05, 0.05), (0, 1, 0), 0.05, r=0.018, n=6, K=4, tag='lash', seed=9)
        t2 = PTmp(); ids = []; uvs = []; tones = []
        zt, zb = top - 0.03, top - 0.3
        for i in range(4):
            u_ = i / 3; yy0 = zt - 0.02 * u_ - 0.05 * u_; yy1 = zb + 0.13 * u_ + (0.05 if i == 2 else 0.0)
            z_ = 0.05 + 0.44 * u_
            row = [t2.vert(F.W((sx + 0.014 * math.sin(i * 2.0), yy0 + (yy1 - yy0) * k / 2, z_))) for k in range(3)]
            ids.append(row)
            for k in range(3): uvs.append((k / 2, 1.0 - 0.75 * u_)); tones.append(u_)
        for i in range(3):
            for k in range(2): t2.face([ids[i][k], ids[i + 1][k], ids[i + 1][k + 1], ids[i][k + 1]], Vector((1, 0, 0)))
        t2.normals(); t2.c = [mix('#a82e30', '#e0544c', 0.3 + 0.7 * u_) for u_ in tones]
        put_cloth(t2, None, 'pennant', uvs)
    if v == 2:      # a bound straw bundle thrown over the back of the ridge, a straw mat in the doorway
        XS = [-0.6 + 0.42 * i / 8 for i in range(9)]; TS = [(-1, 0.4), (-1, 0.26), (-1, 0.12), (1, 0.0), (1, 0.12), (1, 0.26), (1, 0.4)]
        def saddle(x, sd, tt, off, i):
            lobe = 1.0 if i % 2 else 0.0
            ttx = tt * (1 + 0.1 * lobe) if tt >= 0.4 else tt
            q = S(x, ttx, sd, off=off + 0.007 * lobe)
            return (q[0], q[1] + 0.082 * clamp(1 - tt / 0.3), q[2])
        t2 = PTmp(); ids = []; tn = []
        for i, x in enumerate(XS):
            ids.append([t2.vert(F.W(saddle(x, sd, tt, 0.05, i))) for sd, tt in TS]); tn += [(i, tt) for sd, tt in TS]
        for i in range(8):
            for k in range(6):
                t2.face([ids[i][k], ids[i][k + 1], ids[i + 1][k + 1], ids[i + 1][k]], F.N((0, 1, 0)))
        rim = lambda sd, tt, x, i: t2.vert(F.W(saddle(x, sd, tt, -0.015, i)))
        for k, (sd, tt) in ((0, TS[0]), (6, TS[6])):
            low = [rim(sd, tt, x, i) for i, x in enumerate(XS)]; tn += [(i, 1.0) for i in range(9)]
            for i in range(8): t2.face([ids[i][k], ids[i + 1][k], low[i + 1], low[i]], F.N((0, 0.4, sd)))
        for i in (0, 8):
            low = [rim(sd, tt, XS[i], i) for sd, tt in TS]; tn += [(i, 1.0) for _ in TS]
            for k in range(6): t2.face([ids[i][k], ids[i][k + 1], low[k + 1], low[k]], F.N((-1 if i == 0 else 1, 0, 0)))
        t2.normals(); t2.c = []
        for (i, tt), p in zip(tn, t2.v):
            c = STRAW_UN if tt >= 1.0 else mix(STRAW, STRAW_LT, 0.75 - tt) if i % 2 else mix(STRAW_DK, STRAW, 0.95 - tt)
            t2.c.append(mul(c, 0.94 + 0.12 * vnoise(p, 4.0, 5)))
        put(t2, None, 'straw', 'body')
        for x_ in (-0.5, -0.28):
            P_ = []
            for sd, tt in ((-1, 0.4), (-1, 0.2), (1, 0.0), (1, 0.2), (1, 0.4)):
                P_.append(saddle(x_, sd, tt, 0.066, 0))
            sc_rope(P_, r=0.021, tag='lash', seed=4)
        mat = rbox((0.46, 0.84, 0.095), r=0.0, M=F.m @ lm((HX + 0.2, 0.036, 0.0), ry=0.03))
        put(mat, lambda p, n: mul(mix('#c4a868', '#e6cc8c', vnoise(Vector((p.x * 0.3, p.y * 3.4, 0)), 3.0, 5)), 0.9 + 0.12 * clamp(n.z)), 'mat', 'body')
    return dict(size=(L, w, h))

# ================================================================== 2. the stake barricade (kit spikes: 2.4 m along x; log at y 0.42, stakes to y 1.2, z +- 0.86)
def build_spikes(v):
    new_asset(); L = 2.4; rnd = random.Random(211 + v * 5)
    sc_log((-L / 2, 0.42, 0.01), (L / 2, 0.42, -0.01), 0.128, 0.116, K=10, rows=5, seed=80 + v, flute=0.055, bend=0.016 if v else -0.012, tag='log')
    n = 5; xs = [-L / 2 + 0.25 + i * (L - 0.5) / (n - 1) for i in range(n)]
    for i, x in enumerate(xs):
        x += rnd.uniform(-0.03, 0.03)
        for s in (-1, 1):
            a = 0.74 + rnd.uniform(-0.05, 0.05); le = rnd.uniform(-0.05, 0.05); dx = s * 0.058
            dr = Vector((le, math.cos(a), s * math.sin(a)))
            c = Vector((x + dx, 0.42, 0.0)); t0 = -0.42 / dr.y - 0.05; t1 = rnd.uniform(1.0, 1.15)
            broken = v == 1 and i == 3 and s == 1
            if broken: t1 = 0.46
            if v == 1 and i == 1 and s == -1: t1 = 0.92
            sc_stake(tuple(c + dr * t0), tuple(c + dr * t1), 0.064, K=6, seed=90 + i * 2 + (s > 0), broken=broken, tag='stake')
        # lashed either side of the crossing
        for e in (-1, 1): sc_loop((x + e * 0.128, 0.42, 0.0), (1, 0, 0), 0.13, r=0.028, n=9, K=4, tag='lash', seed=i + e + 5)
    # wedge stones at some feet
    for k, (x_, z_) in enumerate([(-0.9, 0.38), (0.5, -0.4), (1.05, 0.34)][: 3 if v == 0 else 2]):
        sc_stone((x_, 0.05, z_), 0.13, 0.085, 0.1, seed=300 + k + v, cuts=4, yaw=k * 1.3 + v, tag='wedge')
    if v == 0:
        # a low brace pole lashed along the feet, front side
        sc_log((-0.96, 0.135, 0.255), (0.92, 0.135, 0.27), 0.05, 0.046, K=6, rows=2, seed=120, flute=0.04, tag='brace')
        for x_ in (-0.5, 0.45): sc_loop((x_ + 0.06, 0.135, 0.255), (1, 0, 0), 0.066, r=0.018, n=6, K=4, tag='lash', seed=8)
    else:
        # a second, thinner rail high on the stakes (back side), a horned knob on a stub, and a rag tied to a stake
        sc_log((-1.12, 0.84, -0.335), (0.92, 0.82, -0.32), 0.052, 0.048, K=6, rows=2, seed=121, flute=0.04, tag='rail')
        for x_ in (-0.63, 0.32): sc_loop((x_, 0.83, -0.33), (1, 0, 0), 0.068, r=0.018, n=6, K=4, tag='lash', seed=9)
        sc_skull((-0.02, 1.2, 0.56), s=1.0, ry=0.15)
        # the rag: knotted on a front stake, hanging, ragged at the hem (uv v = 1 at the knot)
        x0, y0, z0 = -0.96, 0.82, 0.355
        t2 = PTmp(); ids = []; uvs = []; tones = []
        for j in range(4):
            vv = j / 3; wd = 0.1 + 0.06 * vv
            row = []
            for i in range(3):
                u_ = i / 2; drop = 0.42 * vv * (1.0 if not (j == 3 and i == 1) else 0.74)
                row.append(t2.vert(F.W((x0 + (u_ - 0.5) * wd * 2 + 0.02 * vv, y0 - drop, z0 + 0.06 + 0.03 * math.sin(i + j)))))
                uvs.append((u_, 1.0 - vv)); tones.append(vv)
            ids.append(row)
        for j in range(3):
            for i in range(2): t2.face([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], Vector((0, 0, 1)))
        t2.normals(); t2.c = [mix('#d0483c', '#a02c30', vv) for vv in tones]
        put_cloth(t2, None, 'rag', uvs)
        sc_loop((x0 + 0.01, y0 - 0.015, z0 + 0.0), (0, 0.8, 0.6), 0.078, r=0.02, n=6, K=4, tag='lash', seed=12)
    return dict(size=(L,))

# ================================================================== 3. the campfire (kit campfire: ring r 0.42; the embers and flames stay the kit's: centre open to r ~ 0.19, y < 0.05)
def build_campfire(v):
    new_asset(); R = 0.42; rnd = random.Random(401 + v * 3)
    def soot(p, n):
        r = math.hypot(p.x, p.y); return smooth(0.42, 0.28, r) * 0.82 * (0.35 + 0.65 * smooth(-0.1, 0.7, n.z + 0.3))
    # ---------------- the ash bed: pale at the rim, charcoal at the heart (dished a little: the kit's ember sits in it)
    K = 14
    prof_ = [(0.0, 0.056), (0.13, 0.06), (0.25, 0.07), (0.35, 0.078), (0.42, -0.005)]
    t = PTmp(); ids = []
    ci = t.vert(F.W((0, prof_[0][1], 0)))
    for r_, y_ in prof_[1:]:
        ids.append([t.vert(F.W((math.cos(TAU * k / K + 0.2) * r_ * (1 + 0.1 * math.sin(k * 2.6 + r_ * 9)), y_ + 0.008 * math.sin(k * 3.3 + r_ * 17), math.sin(TAU * k / K + 0.2) * r_ * (1 + 0.1 * math.sin(k * 2.6 + r_ * 9))))) for k in range(K)])
    up = Vector((0, 0, 1))
    for k in range(K):
        k1 = (k + 1) % K
        t.face([ci, ids[0][k], ids[0][k1]], up)
        for j in range(len(ids) - 1): t.face([ids[j][k], ids[j][k1], ids[j + 1][k1], ids[j + 1][k]], up)
    def ashc(p, n):
        r = math.hypot(p.x, p.y)
        c = mix('#332a2c', '#6a5f62', smooth(0.1, 0.25, r)); c = mix(c, '#a89ea2', smooth(0.24, 0.36, r))
        return mul(c, 0.9 + 0.2 * vnoise(p, 9.0, 3))
    put(t, ashc, 'ash', 'body')
    # a few charcoal chunks in the ash
    for k, (a, r_) in enumerate([(0.6, 0.27), (2.3, 0.3), (3.9, 0.25), (5.3, 0.29)][: 4 - v]):
        put(sph(0.042, (math.cos(a) * r_, 0.09, math.sin(a) * r_), sc=(1.1, 0.7, 0.9), K=5, J=3, ry=a), lambda p, n: mix('#231c20', '#4a3e42', clamp(n.z)), 'char', 'body')
    # ---------------- the stone ring
    ns = 10 if v == 0 else 9
    for i in range(ns):
        a = TAU * i / ns + rnd.uniform(-0.06, 0.06) + v * 0.2; rr = R + rnd.uniform(-0.012, 0.022)
        big = 1.0 + (0.2 if i % 3 == 0 else 0.0) * (1 if v == 0 else 0.7) + rnd.uniform(-0.05, 0.05)
        sc_stone((math.cos(a) * rr, 0.075 * big, math.sin(a) * rr), 0.135 * big, 0.135 * big, 0.108 * big, seed=500 + i + v * 20, cuts=4, yaw=-a + PI / 2 + rnd.uniform(-0.15, 0.15), soot=soot, tag='ring', pal=tuple(mul(q, 0.8) for q in STONE_SET[(500 + i + v * 20) % 4]))
    # ---------------- the logs
    def chars(p, n):
        r = math.hypot(p.x, p.y)
        return smooth(0.42, 0.22, r) * 0.82
    if v == 0:
        # crossed log-cabin fashion: two along x, two along z on top, the middle left open for the flames
        y0, y1 = 0.118, 0.196; o = 0.245; ck = dict(K=6, rows=2, char=chars, tag='firelog', capc='#d6b288')
        sc_log((-0.39, y0, o - 0.05), (0.31, y0 + 0.014, o + 0.045), 0.057, 0.051, seed=601, **ck)
        sc_log((-0.3, y0 + 0.01, -o - 0.04), (0.38, y0, -o + 0.035), 0.053, 0.056, seed=602, **ck)
        sc_log((o + 0.05, y1 - 0.004, -0.38), (o - 0.03, y1 + 0.01, 0.3), 0.054, 0.05, seed=603, **ck)
        sc_log((-o + 0.035, y1, -0.3), (-o - 0.05, y1 + 0.004, 0.4), 0.056, 0.05, seed=604, **ck)
        sc_log((0.2, y1 + 0.05, 0.33), (0.4, y1 - 0.075, 0.09), 0.046, 0.042, seed=605, **ck)
    else:
        # leaned in a ring, their burnt tips stopping short of the heart; a spit on two forked sticks with a fish roasting over the flames
        for i in range(5):
            a = TAU * i / 5 + 0.5; f = 0.36 + 0.02 * math.sin(i * 2.0); ti = 0.215 + 0.012 * math.cos(i * 3.0)
            sc_log((math.cos(a) * f, 0.075, math.sin(a) * f), (math.cos(a + 0.22) * ti, 0.31 + 0.03 * math.sin(i * 1.7), math.sin(a + 0.22) * ti), 0.052, 0.042, K=6, rows=2, seed=610 + i,
                   char=lambda p, n: smooth(0.33, 0.2, math.hypot(p.x, p.y)) * 0.9, tag='firelog', capc='#2a2226')
        Hy = 0.66
        for s in (-1, 1):
            xf = s * 0.555
            sc_log((xf, -0.03, 0.03 * s), (xf, Hy - 0.1, 0.015 * s), 0.03, 0.028, K=5, rows=1, seed=620 + s, flute=0.03, tag='fork', pal=('#4e3c2c', '#7a5c40', '#a08058'), cap0=False)
            for e in (-1, 1):
                sc_log((xf, Hy - 0.115, 0.015 * s), (xf + 0.004, Hy + 0.03, 0.015 * s + e * 0.055), 0.026, 0.021, K=5, rows=1, seed=625 + e, flute=0.0, tag='fork', pal=('#4e3c2c', '#7a5c40', '#a08058'), cap0=False)
        sc_log((-0.6, Hy - 0.052, 0.0), (0.6, Hy - 0.052, 0.012), 0.024, 0.024, K=5, rows=2, seed=630, flute=0.0, tag='spit', pal=('#66503c', '#8e7050', '#b0906a'))
        # the fish (toy-roasted, nose to the left)
        with at((0.02, Hy - 0.052, 0.004)):
            def fc(p, n):
                c = mix('#b86a34', '#ecb060', smooth(-0.3, 0.7, n.z)); return mix(c, '#fff0cc', smooth(-0.15, -0.8, n.z) * 0.6)
            put(sph(0.095, (0, 0, 0), sc=(1.95, 1.0, 0.72), K=9, J=5), fc, 'fish', 'body')
            put(glathe([(0.0, 0.0), (0.075, 0.0), (0.02, 0.14), (0.0, 0.15)], 4, pos=(0.2, 0.0, 0), rz=-PI / 2), fc, 'fish', 'body')
            for e in (-1, 1): put(sph(0.017, (-0.125, 0.018, e * 0.058), K=5, J=2), flat(INKD), 'fish', 'body')
    return dict(size=(R,))

# ================================================================== 4. the cage (kit cageTpl: w 1.1, d 1.0, h 1.2; the kit's door swings at the front on the left post)
def sc_bamboo(a, b, r, K=5, nodes=(0.33, 0.68), seed=0, tag='bars', cap=True):
    """a bamboo culm from game-local a to b: pale raised nodes with a dark ring under them, a light top, a cut end"""
    A_, B_ = F.W(a), F.W(b); ax = B_ - A_; Ln = ax.length; d = ax / Ln; u, w = perp(d)
    rnd = random.Random(seed * 3 + 1); ph = rnd.uniform(0, TAU); bend = rnd.uniform(-0.006, 0.006)
    rows = [(0.0, 1.0, 'c')]
    dn = min(0.03, r * 0.8) / Ln
    for s in nodes:
        s = clamp(s + rnd.uniform(-0.03, 0.03), 0.05, 0.95)
        rows += [(s - dn, 0.97, 'u'), (s, 1.16, 'n'), (s + dn, 0.97, 'c')]
    rows.append((1.0, 0.95, 'c'))
    rings, cs, meta = [], [], []
    for s, kk, tp in rows:
        c = A_ + d * (Ln * s) + u * (bend * math.sin(PI * s))
        rings.append([c + (u * math.cos(ph + TAU * k / K) + w * math.sin(ph + TAU * k / K)) * r * kk for k in range(K)]); cs.append(c)
        meta += [tp] * K
    t = PTmp(); ring_surface(t, rings, cs, pole0=A_ - d * r * 0.5 if cap else None, pole1=B_ + d * r * 0.5 if cap else None); t.normals(); t.c = []
    meta += ['e', 'e'] if cap else []
    for tp, p, n in zip(meta, t.v, t.n):
        if tp == 'n': c = mix(mul(BAM_NODE, 0.8), BAM_NODE, smooth(-0.5, 0.5, n.z))
        elif tp == 'u': c = mix(BAM_LO, BAM, 0.3)
        elif tp == 'e': c = RAW
        else:
            c = mix(BAM_LO, BAM, smooth(-0.6, 0.15, n.z + (-n.y) * 0.25)); c = mix(c, BAM_HI, smooth(0.15, 0.85, n.z + (-n.y) * 0.25) * 0.75)
            c = mul(c, 0.95 + 0.1 * vnoise(p, 4.0, seed))
        t.c.append(c)
    put(t, None, tag, 'body')

def thatch_tier(a, b, y0, y1, K, lobes, droop, seed, e=3.2, tag='thatch', fr=(1.0, 0.97, 0.72, 0.38), top=None):
    """a thatched skirt round a rounded rectangle (half sizes a, b; eave y0, crown y1): straw bundles drooping in lobes at the eave, streaked, a dark tucked underside"""
    t = Tmp(); ph = seed * 0.9; rings = []
    profile = [(0.86, y0 + 0.035, 'u'), (fr[0], y0, 'e'), (fr[1], y0 + 0.07, 's'), (fr[2], y0 + (y1 - y0) * 0.58, 'm'), (fr[3], y0 + (y1 - y0) * 0.92, 't')]
    for f, y, tp in profile:
        ring = []
        for k in range(K):
            th = TAU * k / K; c, s = se_dir(th, e)
            lobe = (1.0 if k % 2 else 0.0) * (0.8 + 0.2 * math.sin(k * 1.9 + ph))     # (bundles: every other point stands proud, all the way up)
            rr = f * (1.0 + {'u': 0.0, 'e': 0.05, 's': 0.05, 'm': 0.05, 't': 0.04}[tp] * lobe)
            yy = y - (droop * lobe if tp == 'e' else 0.0) + (0.016 * lobe if tp in 'sm' else 0.0)
            ring.append(t.vert(F.W((c * a * rr, yy, s * b * rr))))
        rings.append(ring)
    n_ = len(profile)
    for j in range(n_ - 1):
        for k in range(K):
            k1 = (k + 1) % K
            t.face([rings[j][k], rings[j][k1], rings[j + 1][k1], rings[j + 1][k]], Vector((0, 0, 1)))
    cu = t.vert(F.W((0, y0 + 0.06, 0))); ct = t.vert(F.W((0, top if top is not None else y1, 0)))
    for k in range(K):
        k1 = (k + 1) % K
        t.face([cu, rings[0][k1], rings[0][k]], Vector((0, 0, -1)))
        t.face([ct, rings[-1][k], rings[-1][k1]], Vector((0, 0, 1)))
    t.orient(); t.normals(); t.c = [None] * len(t.v)
    for j, (f, y, tp) in enumerate(profile):
        for k in range(K):
            vi = rings[j][k]; p = t.v[vi]; n = t.n[vi]; st = k % 2
            if tp == 'u': c = STRAW_UN
            elif tp == 'e': c = mix(STRAW_DK, STRAW, 0.55) if st else mul(STRAW_DK, 0.72)
            elif tp == 's': c = mix(STRAW_DK, STRAW, 0.85) if st else mul(STRAW_DK, 0.82)
            elif tp == 'm': c = mix(STRAW, STRAW_LT, 0.45) if st else mix(STRAW_DK, STRAW, 0.3)
            else: c = mix(STRAW, STRAW_LT, 0.9) if st else mix(STRAW_DK, STRAW, 0.55)
            t.c[vi] = mul(c, 0.94 + 0.12 * vnoise(p, 3.0, seed))
    t.c[cu] = STRAW_UN; t.c[ct] = STRAW_LT
    put(t, None, tag, 'body')

def thatch_gable(a, b, ye, yr, NX=18, lobes=9, droop=0.05, seed=0, tag='thatch'):
    """a thatched gable lid, the ridge along x: both slopes bulging a little, a lobed eave, streaks running down the slope, closed ends"""
    t = Tmp(); rows = [(-1, 1.0), (-1, 0.76), (-1, 0.5), (-1, 0.46), (-1, 0.2), (1, 0.0), (1, 0.2), (1, 0.46), (1, 0.5), (1, 0.76), (1, 1.0)]; secs = []
    def Y(tt): return ye + (yr - ye) * (1 - tt) ** 0.82
    for i in range(NX):
        x = -a + 2 * a * i / (NX - 1); sec = []
        lobe = (1.0 if i % 2 else 0.0) * (0.68 + 0.32 * math.sin(i * 1.9 + seed))
        for sd, tt in rows:
            up = tt < 0.48                                      # (the upper course: lifted, its bundles between the lower course's)
            lb = (0.68 + 0.32 * math.sin(i * 2.7 + seed)) - lobe if up else lobe
            lb = max(lb, 0.0)
            yy = Y(tt) - (droop * lb if tt == 1.0 else 0.0); zz = sd * b * tt * (1 + (0.03 * lb if tt == 1.0 else 0.0))
            xx = x * (1 - 0.05 * (1 - tt))
            if up and tt > 0.0: yy += 0.045 + 0.018 * lb - (0.042 * lb if tt == 0.46 else 0.0)
            elif tt == 0.0: yy += 0.045
            elif tt < 1.0: yy += (0.02 if tt == 0.76 else 0.0) * lb - (0.012 if tt == 0.5 else 0.0)
            sec.append(t.vert(F.W((xx, yy, zz))))
        sec.append(t.vert(F.W((x * 0.97, ye + 0.04, b * 0.86))))
        sec.append(t.vert(F.W((x * 0.97, ye + 0.09, 0.0))))
        sec.append(t.vert(F.W((x * 0.97, ye + 0.04, -b * 0.86))))
        secs.append(sec)
    Ns = len(secs[0])
    for i in range(NX - 1):
        for k in range(Ns):
            k1 = (k + 1) % Ns
            t.face([secs[i][k], secs[i][k1], secs[i + 1][k1], secs[i + 1][k]], Vector((0, 0, 1)))
    for i, sg in ((0, -1), (NX - 1, 1)):
        for k in range(1, Ns - 1): t.face([secs[i][0], secs[i][k], secs[i][k + 1]], Vector((sg, 0, 0)))
    t.orient(); t.normals(); t.c = [None] * len(t.v)
    for i in range(NX):
        st = i % 2
        for k in range(Ns):
            vi = secs[i][k]; p = t.v[vi]
            if k >= len(rows): c = STRAW_UN
            else:
                tt = rows[k][1]
                if abs(i - (NX - 1) / 2) > (NX - 1) / 2 - 0.5: c = mix(STRAW_DK, STRAW, 0.5 * (1 - tt))
                elif tt == 1.0: c = mix(STRAW_DK, STRAW, 0.55) if st else mul(STRAW_DK, 0.72)
                elif tt == 0.5: c = mul(STRAW_DK, 0.62)
                elif tt == 0.46: c = mix(STRAW_DK, STRAW, 0.2) if st else mix(STRAW_DK, STRAW, 0.6)
                elif tt == 0.76: c = mix(STRAW, STRAW_LT, 0.3) if st else mix(STRAW_DK, STRAW, 0.45)
                else: c = mix(STRAW, STRAW_LT, 0.9 - tt) if not st else mix(STRAW_DK, STRAW, 0.75 - tt)
            t.c[vi] = mul(c, 0.94 + 0.12 * vnoise(p, 3.0, seed))
    put(t, None, tag, 'body')

def build_cage(v):
    new_asset(); w, d, h = 1.1, 1.0, 1.2; rnd = random.Random(701 + v * 9)
    hx, hz = w / 2, d / 2
    # ---------------- the stone base: a curb of dressed stones (low enough at the front for the kit's door to sweep over), dark fill, floor slats
    def curb(x, z, sx, sz, seed, top=0.086, ry=0.0):
        with at((x, 0, z), ry=ry):
            M = F.m.copy(); t = slab_t(sx, sz, top, bottom=-0.02, rc=0.05, rb=0.022, nc=1, dish=0.004, wob=0.03, seed=seed)
        base, hi, lo = STONE_SET[seed % 4]
        sp = stone_paint(base, hi=hi, lo=lo, seed=seed)
        put(t, lambda p, n: mix(sp(p, n), hi, 0.3) if n.z > 0.8 else sp(p, n), 'curb', 'body')
    C = [(-0.32, 0.5 + 0.02, 0.56, 0.16, 0), (0.3, 0.52, 0.58, 0.16, 1), (-0.31, -0.52, 0.58, 0.16, 2), (0.32, -0.52, 0.56, 0.16, 3), (-0.56, 0.17, 0.16, 0.52, 4), (-0.56, -0.27, 0.16, 0.36, 5), (0.56, -0.17, 0.16, 0.52, 6), (0.56, 0.27, 0.16, 0.36, 7)]
    for k, (x, z, sx, sz, sd) in enumerate(C): curb(x, z, sx, sz, 800 + sd + v * 8, top=0.096 + (0.006 * (k % 3) if k > 1 else 0.0), ry=rnd.uniform(-0.02, 0.02))
    put(box(1.06, 0.05, 0.96, (0, 0.05, 0), r=0.0), flat('#2e2628'), 'fill', 'body')
    NS = 5
    for i in range(NS):
        z = -0.42 + i * 0.84 / (NS - 1) + rnd.uniform(-0.006, 0.006)
        col = '#d6b482' if i % 2 else '#c6a26e'
        put(beam(1.0, 0.03, 0.17, (rnd.uniform(-0.008, 0.008), 0.094, z), c=0.009, ry=rnd.uniform(-0.015, 0.015)), lambda p, n, c=col: mix(mul(c, 0.72), c, clamp(n.z)), 'slats', 'body')
    # ---------------- the corner posts, bars on the back and the sides (the front left open for the kit's door)
    for sx in (-1, 1):
        for sz in (-1, 1):
            sc_bamboo((sx * hx, 0.03, sz * hz), (sx * hx + rnd.uniform(-0.006, 0.006), h + 0.05, sz * hz + rnd.uniform(-0.006, 0.006)), 0.052, K=6, nodes=(0.31, 0.62, 0.87), seed=sx * 3 + sz + 10 + v, tag='post')
    kbar = 0
    for (ax_, az_, bx_, bz_, n) in ((-hx, -hz, hx, -hz, 6), (-hx, -hz, -hx, hz, 5), (hx, -hz, hx, hz, 5)):
        for i in range(1, n):
            f = i / n; x, z = ax_ + (bx_ - ax_) * f, az_ + (bz_ - az_) * f; kbar += 1
            sc_bamboo((x, 0.09, z), (x + rnd.uniform(-0.008, 0.008), h + 0.0, z + rnd.uniform(-0.008, 0.008)), 0.027, K=5, nodes=(0.3 + 0.05 * (i % 3), 0.72 - 0.04 * (i % 2)), seed=kbar + 30 + v * 40, tag='bars')
    # the rails: lashed just outside the bars, a fixed header over the door
    RO = 0.03
    def rail(a, b, seed): sc_bamboo(a, b, 0.03, K=5, nodes=(0.5,), seed=seed, tag='rails')
    for y, sd in ((0.17, 60), (h - 0.08, 64)):
        rail((-hx - 0.04, y, -hz - RO), (hx + 0.04, y + 0.004, -hz - RO), sd)
        rail((-hx - RO, y + 0.05, -hz - 0.04), (-hx - RO, y + 0.05, hz - 0.08), sd + 1)
        rail((hx + RO, y + 0.05, -hz - 0.04), (hx + RO, y + 0.05, hz - 0.08), sd + 2)
    sc_bamboo((-hx - 0.05, h + 0.022, hz), (hx + 0.05, h + 0.022, hz), 0.027, K=5, nodes=(0.5,), seed=70, tag='rails')
    # lashings: back corners and front-top; on the front-left post the door's two rope hinges (at the kit door's rails, y 0.2 and h - 0.12); the hasp under its lock on the right
    for sx in (-1, 1):
        for y in (0.2, h - 0.05):
            sc_loop((sx * hx, y, -hz), (0, 1, 0), 0.063, r=0.026, n=7, K=4, tag='lash', seed=v + 2)
        sc_loop((sx * hx, h + 0.012, hz), (0, 1, 0), 0.063, r=0.026, n=7, K=4, tag='lash', seed=v + 3)
    for y in (0.21, h - 0.11): sc_loop((-hx, y, hz), (0, 1, 0), 0.064, r=0.026, n=7, K=4, tag='hinge', seed=v + 4)
    sc_loop((hx, 0.585, hz), (0, 1, 0), 0.064, r=0.026, n=7, K=4, tag='hasp', seed=v + 5)
    sc_loop((hx, 0.24, hz), (0, 1, 0), 0.063, r=0.026, n=7, K=4, tag='lash', seed=v + 6)
    # ---------------- the lid
    if v == 0:
        thatch_tier(0.705, 0.655, 1.255, 1.42, 34, 17, 0.045, seed=3)
        thatch_tier(0.43, 0.4, 1.365, 1.5, 24, 12, 0.03, seed=7, tag='thatch', top=1.52)
        thatch_tier(0.2, 0.19, 1.475, 1.59, 14, 7, 0.022, seed=9, tag='thatch', e=2.0, top=1.625)
        sc_loop((0, 1.475, 0), (0, 1, 0), 0.178, r=0.028, n=10, K=4, tag='lidRope', seed=4)
    else:
        thatch_gable(0.73, 0.68, 1.255, 1.5, NX=18, lobes=9, droop=0.062, seed=2)
        sc_log((-0.8, 1.545, 0.0), (0.8, 1.54, 0.0), 0.07, 0.066, K=7, rows=3, seed=74, flute=0.09, tag='ridgeRoll', pal=(STRAW_DK, STRAW, STRAW_LT), capc='#c8a868')
        for x_ in (-0.42, 0.42): sc_loop((x_, 1.54, 0), (1, 0, 0), 0.09, r=0.024, n=7, K=4, tag='lidRope', seed=7)
        sc_skull((0.0, 1.69, 0.0), s=0.95, ry=0.0)
        # a scrap of boards nailed across the left side where something got out once
        with at((-hx - 0.052, 0.62, -0.05)):
            for k, (dy, rz_, lng) in enumerate(((0.0, 0.05, 0.68), (0.16, -0.04, 0.58))):
                col = '#d0aa78' if k else '#bc9666'
                put(beam(0.03, 0.125, lng, (0, dy, 0.02 * k), c=0.008, rx=rz_), lambda p, n, c=col: mix(mul(c, 0.74), mix(c, '#d0b088', 0.3), clamp(n.z + 0.4)), 'boards', 'body')
                for e in (-1, 1): put(cyl(0.022, 0.022, 0.016, (-0.02, dy + e * lng * 0.0, e * lng * 0.4 + 0.02 * k), K=5, rz=PI / 2), flat('#4a4450'), 'boards', 'body')
    return dict(size=(w, d, h))

# ================================================================== run
PIECES = {'tent-v0': (lambda: build_tent(0), 7, 0.012), 'tent-v1': (lambda: build_tent(1), 11, 0.012), 'tent-v2': (lambda: build_tent(2), 13, 0.012),
          'spikes-v0': (lambda: build_spikes(0), 17, 0.012), 'spikes-v1': (lambda: build_spikes(1), 19, 0.012),
          'campfire-v0': (lambda: build_campfire(0), 23, 0.0), 'campfire-v1': (lambda: build_campfire(1), 29, 0.0),
          'cage-v0': (lambda: build_cage(0), 31, 0.005), 'cage-v1': (lambda: build_cage(1), 37, 0.005)}
BUDGET = {'tent': 2500, 'spikes': 2000, 'campfire': 1500, 'cage': 4000}
AO = {'tent': dict(DMAX=0.7, K=0.5), 'spikes': dict(DMAX=0.5, K=0.45), 'campfire': dict(DMAX=0.42, K=0.5), 'cage': dict(DMAX=0.36, K=0.42)}
names = list(PIECES) if PIECE == 'all' else [n for p in PIECE.split(',') for n in PIECES if n == p or n.startswith(p + '-')]
for name in names:
    fn, sd, amt = PIECES[name]
    info = fn()
    if amt: finish(A, seed=sd, amt=amt)
    fam = name.split('-')[0]
    ray_ao(**AO[fam])
    tris = A.tris()
    if tris > BUDGET[fam]: print('SC OVER BUDGET', name, tris, BUDGET[fam])
    export_piece('prop-siege-' + name, info)
print('SC done')
