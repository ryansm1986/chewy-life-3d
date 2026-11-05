# rg-maple round 2 pieces: jizoTrio, kakashi, tanuki, warabocchi, hasa, komodaru.
# Not a module: build_rg-maple.py execs the part below the marker in its own namespace (the kit, palette and
# round-1 helpers) after its own builders are defined.

# ---8<--- body
# ================================================================== round 2 helpers
def merge_into(dst, src, M, obj):
    """copy every object of a scratch Asset into dst's object `obj`, transformed by M (uniform scale only)"""
    R = M.to_3x3().normalized()
    for o in src.objs.values():
        d = dst.objs.setdefault(obj, dict(v=[], n=[], c=[], f=[], m=[], mats=[]))
        mi = []
        for m in o['mats']:
            if m not in d['mats']: d['mats'].append(m)
            mi.append(d['mats'].index(m))
        b = len(d['v'])
        d['v'] += [M @ v for v in o['v']]; d['n'] += [(R @ n).normalized() for n in o['n']]; d['c'] += list(o['c'])
        d['f'] += [[i + b for i in f] for f in o['f']]; d['m'] += [mi[x] for x in o['m']]
    for k, v in src.count.items(): dst.count[k] = dst.count.get(k, 0) + v

STRAW_C = '#e6c47a'; STRAW_HI = '#f6dea0'; STRAW_LO = '#b08a4a'; STRAW_HEAD = '#d6a444'
def straw_col(base=STRAW_C, hi=STRAW_HI, lo=STRAW_LO, f=29, seed=0, cx=0.0, cy=0.0, z0=None, ao=0.25, cols=0, shade=None, k=0.2):
    """straw: vertical streaks round an axis at (cx, cy) (cols = the mesh's column count: alternate light / dark
    columns, else a soft streak frequency f), light tops, darker undersides and foot; shade(p) -> extra darkening"""
    def col(p, n):
        th = math.atan2(p.y - cy, p.x - cx)
        if cols:
            kk = round(th / TAU * cols) % cols
            st = 0.5 + 0.5 * (1 if kk % 2 else -1) * (0.6 + 0.4 * math.sin(kk * 2.3 + seed))
        else:
            st = 0.5 + 0.5 * math.sin(th * f + p.z * 3.0 + seed) * math.sin(th * (f * 0.61) + seed * 2)
        c = mix(base, hi, clamp(n.z) * 0.45 + st * k)
        c = mix(c, lo, clamp(-n.z) * 0.55 + (1 - st) * k * 0.9)
        if z0 is not None: c = mul(c, 1 - ao * (1 - smooth(0.0, 0.15, p.z - z0)))
        if shade: c = mul(c, 1 - shade(p))
        return c
    return col

def rope_ring(c, r, z, rad=0.02, K=5, n=16, sy=1.0, wob=0.004):
    pts = [Vector((c.x + math.cos(TAU * k / n) * r, c.y + math.sin(TAU * k / n) * r * sy, z + wob * math.sin(TAU * k / n * 3))) for k in range(n)]
    return tube_loop(pts, lambda s: rad, K=K)

def rope_col_fn(a=ROPE, b=ROPE_DK, f=55):
    def col(p, n):
        return mix(a, b, 0.5 + 0.5 * math.sin((p.x + p.y) * f + p.z * f * 0.7 + math.atan2(n.z, math.hypot(n.x, n.y)) * 3))
    return col

def fringe_tier(cx, cy, z_top, r_top, z_bot, r_bot, K, jag=0.05, teeth=12, bulge=0.03, thick=0.05, sy=1.0, seed=0, flare=0.0):
    """a thatch skirt round an axis: from a narrow top ring (tucked under the tier above) bulging down to a ragged
    fringed hem (teeth), then a short underside lip back in (open inside: hidden)"""
    t = Tmp(); rings = []; cs = []
    rng_ = random.Random(seed)
    jj = [rng_.uniform(0.6, 1.0) for _ in range(teeth)]
    def hem(th):
        u = (th / TAU * teeth) % 1.0; k = int(th / TAU * teeth) % teeth
        return jag * jj[k] * (1 - abs(2 * u - 1)) ** 1.5
    for s in (0.0, 0.3, 0.62, 0.86, 1.0):
        ring = []
        for k in range(K):
            th = TAU * k / K
            r = r_top + (r_bot - r_top) * s + bulge * math.sin(math.pi * s) + flare * s ** 3
            z = z_top + (z_bot - z_top) * s - (hem(th) if s == 1.0 else 0.0)
            r *= 1 + 0.025 * math.sin(3 * th + seed) * s
            ring.append(Vector((cx + math.cos(th) * r, cy + math.sin(th) * r * sy, z)))
        rings.append(ring); cs.append(Vector((cx, cy, z_top + (z_bot - z_top) * s)))
    lip = []
    for k in range(K):
        th = TAU * k / K; r = r_bot - thick + flare * 0.6
        lip.append(Vector((cx + math.cos(th) * r, cy + math.sin(th) * r * sy, z_bot - hem(th) * 0.4 + 0.02)))
    rings.append(lip); cs.append(Vector((cx, cy, z_bot + 0.3)))
    ring_surface(t, rings, cs)
    return t

def bamboo_tube(a, b, r, nodes=3, K=7, base='#c8b06a', hi='#e6d08e', node='#9a8048'):
    """a dried bamboo pole a -> b with swollen nodes (painted darker)"""
    d = (b - a); L = d.length; dn = d.normalized()
    ts = sorted(set([0.0, 1.0] + [(k + 1) / (nodes + 1) + o for k in range(nodes) for o in (-0.02 / L, 0.0, 0.02 / L)]))
    path = [a + d * t for t in ts]
    def rad(s):
        t = ts[min(len(ts) - 1, round(s * (len(ts) - 1)))]
        return r * (1.15 if any(abs(t - (k + 1) / (nodes + 1)) < 1e-6 for k in range(nodes)) else 1.0)
    tb = tube(path, rad, K=K)
    def col(p, n):
        s = (p - a).dot(dn) / L
        k = min(abs(s - (q + 1) / (nodes + 1)) * L for q in range(nodes))
        c = mix(base, hi, clamp(n.z) * 0.5)
        c = mul(c, 1 - 0.25 * clamp(-n.z))
        if k < 0.025: c = mix(c, node, 0.7)
        return c
    return tb, col

def pinwheel_into(A, OB, base, h, s=1.0):
    A.add(OB, 'body', lathe([(0.016, -0.1), (0.014, h), (0.0, h + 0.01)], 5, th0=0.3).xform(Matrix.Translation(base)), lambda p, n: mix('#c89a68', '#e8c090', clamp(n.z) * 0.5), 'pinwheel')
    hub = base + Vector((0, -0.03, h))
    for k, colr in enumerate(['#ff6f7f', '#ffd24a', '#6ab0ff', '#8fe0c0']):
        a0 = k * math.pi / 2 + 0.3
        t = Tmp()
        outline = [(0.0, 0.0), (0.12 * s, 0.016 * s), (0.128 * s, 0.072 * s), (0.088 * s, 0.112 * s), (0.016 * s, 0.112 * s)]
        def P2(u, v, d, a0=a0):
            ca, sa = math.cos(a0), math.sin(a0)
            return hub + Vector((u * ca - v * sa, d, u * sa + v * ca))
        tw = [0.0, 0.006, 0.018, 0.028, 0.018]
        fi = [t.vert(P2(u, v, -tw[j])) for j, (u, v) in enumerate(outline)]
        bi = [t.vert(P2(u, v, -tw[j] + 0.012)) for j, (u, v) in enumerate(outline)]
        t.face(fi, -Y); t.face(bi[::-1], Y)
        for j in range(5): t.face([fi[j], bi[j], bi[(j + 1) % 5], fi[(j + 1) % 5]], (t.v[fi[j]] + t.v[fi[(j + 1) % 5]]) / 2 - hub)
        A.add(OB, 'body', t, lambda p, n, c=colr: srgb(c) if n.y < 0.3 else mul(c, 0.78), 'pinwheel')
    A.add(OB, 'body', ellipsoid(hub + Vector((0, -0.012, 0)), (0.024, 0.02, 0.024), K=7, J=3), lambda p, n: mix(BRONZE, BRONZE_HI, clamp(n.z + 0.2) * 0.6), 'pinwheel')

def on_normal(e, c, nrm):
    """place a shape built facing -Y at point c, turned to face along nrm"""
    return e.xform(Matrix.Translation(c) @ Vector((0, -1, 0)).rotation_difference(nrm.normalized()).to_matrix().to_4x4())

def along(e, a, b):
    """place a shape built along +Z centred at the origin between a and b"""
    d = b - a
    return e.xform(Matrix.Translation((a + b) / 2) @ Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4())

# ================================================================== 3. the jizo trio
def build_jizoTrio():
    """three small jizo (kit jizoTrio = details.js jizoPiece(8, 3)): sizes 0.9 / 1.1 / 0.78 in a row 0.42 m apart,
    each on its own little mossy stone, the single jizo's figure at a lighter mesh; an offering stone in front with
    tea cups, persimmons and an onigiri; a pinwheel at the left end"""
    A = Asset(); rng = random.Random(8)
    OB = 'jizoTrio'
    sizes = [0.9, 1.1, 0.78]; dz = [0.03, -0.02, 0.04]; yaw = [0.12, -0.05, -0.14]
    fig = Asset(); jizo_figure(fig, 'f', 0.205, lod=1)
    FS = 0.54                                     # the figure's scale on a 0.1 m base (kit: ~0.69 m tall at s 1)
    for i, s in enumerate(sizes):
        x = (i - 1) * 0.42; c = K(x, 0, dz[i])
        BH = 0.1 * s
        bw = lambda rr, z, th, i=i: rr * (1 + 0.03 * math.sin(3 * th + i) + 0.02 * math.sin(5 * th + i * 2))
        base = lathe([(0.0, 0.0), (0.15, 0.0), (0.157, 0.02), (0.155, 0.075), (0.135, 0.1), (0.0, 0.1)], 12, sy=0.86, e=3.6,
                     th0=math.pi / 12, rfn=bw)
        base.xform(Matrix.Translation(c) @ Matrix.Rotation(yaw[i], 4, 'Z') @ Matrix.Scale(s, 4))
        A.add(OB, 'stone', base, stone_col(z0=0.0, seed=60 + i, moss_low=0.9), 'bases')
        M = Matrix.Translation(c + Vector((0, 0, BH))) @ Matrix.Rotation(yaw[i], 4, 'Z') @ Matrix.Scale(FS * s, 4) @ Matrix.Translation((0, 0, -0.205))
        merge_into(A, fig, M, OB)
        for k in range(2):                        # moss tufts on the back of each base
            a = math.pi / 2 + (k - 0.5) * 1.3 + yaw[i]
            p = c + Vector((math.cos(a) * 0.115 * s, math.sin(a) * 0.1 * s, BH - 0.012))
            A.add(OB, 'body', blob(p, 0.045 * s + 0.012, 0.035 * s + 0.01, lobes=4, K=8, seed=i * 3 + k), moss_col(i + k), 'moss')
    # the offering stone in front and its offerings
    oc = K(0.02, 0, 0.27)
    os_ = lathe([(0.0, 0.0), (1.0, 0.0), (1.02, 0.025), (0.9, 0.05), (0.0, 0.055)], 12, sx=0.42, sy=0.1, e=3.0, th0=0.2,
                rfn=lambda rr, z, th: rr * (1 + 0.04 * math.sin(3 * th + 1)))
    A.add(OB, 'stone', os_.xform(Matrix.Translation(oc)), stone_col(z0=0.0, seed=70), 'offerings')
    OT = 0.055
    for x in (-0.3, 0.3):
        cup = lathe([(0.0, 0.0), (0.03, 0.0), (0.036, 0.01), (0.044, 0.06), (0.036, 0.062), (0.0, 0.05)], 8, th0=0.1)
        A.add(OB, 'body', cup.xform(Matrix.Translation(oc + Vector((x, 0, OT)))),
              lambda p, n: srgb('#8a7a3e') if n.z > 0.6 and 0.03 < p.z - OT < 0.058 else mix('#eee4d8', '#fff6ea', clamp(n.z) * 0.5), 'offerings')
    for k, x in enumerate((-0.15, -0.06)):
        r_ = 0.04
        t, cf, h = persimmon(oc + Vector((x, 0.0, OT + r_ * 0.86)), r_, FRESH[k + 1], rng)
        A.add(OB, 'body', t, cf, 'offerings')
        A.add(OB, 'body', calyx(oc + Vector((x, 0.0, OT + r_ * 0.86 + h * 0.84)), r_ * 0.6, rng), calyx_col, 'offerings')
    oni = lathe([(0.0, 0.0), (0.05, 0.0), (0.055, 0.02), (0.045, 0.045), (0.022, 0.068), (0.0, 0.072)], 10, sy=0.6, th0=0.0,
                rfn=lambda rr, z, th: rr * (1 + 0.16 * math.cos(3 * (th - math.pi / 2))))
    A.add(OB, 'body', oni.xform(M_at(oc + Vector((0.08, 0.0, OT)), rx=-0.12)), lambda p, n: mix('#ece6dc', '#fffaf0', clamp(n.z + 0.3) * 0.6), 'offerings')
    A.add(OB, 'body', rbox((0.046, 0.045, 0.036), r=0.008, M=M_at(oc + Vector((0.08, -0.012, OT + 0.02)), rx=-0.12)), lambda p, n: srgb('#3c4a3a'), 'offerings')
    pinwheel_into(A, OB, K(-0.68, 0, 0.1), 0.55, 0.85)
    for (x, z, rot, ci) in ((0.62, 0.05, 1.1, 0), (-0.3, -0.18, 2.6, 2), (0.27, 0.12, 0.4, 1)):
        t, cf = maple_leaf(K(x, 0.012, z), Z, 0.13, rot, LEAVES[ci], curl=0.02)
        A.add(OB, 'body', t, cf, 'leaves')
    export_rg(A, 'jizoTrio', {'body': {}, 'stone': {}})

# ================================================================== 4. the kakashi
def build_kakashi():
    """a cheerful scarecrow (kit kakashi(0)): a post and crossbar, a sack head with a stitched smile under a wide
    sugegasa with a red chin tie, straw hair, a blue kimono tunic with a cream collar, a patch and a red obi bow, wide
    orange sleeves with straw bursting from the cuffs, a straw skirt, and a round crow perched on the left arm"""
    A = Asset()
    OB = 'kakashi'
    WOOD = '#9a6c46'
    A.add(OB, 'body', lathe([(0.05, -0.12), (0.046, 1.45), (0.0, 1.47)], 7, th0=0.2), wood_col(WOOD, seed=1, z0=0.0, ao=0.3), 'post')
    A.add(OB, 'body', rail_x(-0.62, 0.62, 0.0, 1.2, 0.036), wood_col(WOOD, seed=2), 'post')
    for k in range(5):                            # a hay tuft round the foot of the post
        a = TAU * k / 5 + 0.3
        st = lathe([(0.0, 0.0), (0.035, 0.0), (0.0, 0.14 + 0.03 * (k % 2))], 4, th0=a)
        A.add(OB, 'body', along(st.xform(Matrix.Translation((0, 0, -0.07))), Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 0.0)),
                                Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0.14))), straw_col(seed=k), 'hay')
    # the tunic: a flattened squircle bell round the post
    TSY = 0.5
    tprof = [(0.0, 0.62), (0.31, 0.62), (0.325, 0.66), (0.29, 0.85), (0.265, 1.04), (0.25, 1.17), (0.19, 1.27), (0.07, 1.31), (0.0, 1.32)]
    def tunic_col(p, n):
        c = mix('#4f6eae', '#7a98d4', clamp(n.z) * 0.5 + clamp(-n.y) * 0.1)
        c = mul(c, 1 - 0.28 * clamp(-n.z))
        return mul(c, 0.94 + 0.1 * vnoise(p, 18, 3))
    TE = 2.6
    A.add(OB, 'body', lathe(tprof, 14, sy=TSY, e=TE, th0=math.pi / 14, rfn=lambda rr, z, th: rr * (1 + 0.02 * math.sin(5 * th) * (1 - smooth(0.62, 0.9, z)))), tunic_col, 'tunic')
    def tun_r(z):
        for (r0, z0), (r1, z1) in zip(tprof[1:-1], tprof[2:]):
            if min(z0, z1) <= z <= max(z0, z1): return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return 0.25
    def tun_front(x, z, out=0.0):
        r = tun_r(z); u = clamp(x / r, -0.97, 0.97)
        # the lathe's superellipse section: |x/r|^e + |y/(r sy)|^e = 1
        yy = (1 - abs(u) ** TE) ** (1 / TE)
        return Vector((x, -(yy * r * TSY + out), z))
    for sx in (-1, 1):                            # the cream collar: a V from the shoulders to the obi
        pts = [tun_front(sx * (0.12 - 0.11 * t), 1.27 - 0.3 * t, 0.01) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
        A.add(OB, 'body', tube(pts, lambda s: 0.024, K=5), lambda p, n: mix('#d8c8a8', '#f0e4c8', clamp(n.z + 0.3) * 0.5), 'collar')
    pc = tun_front(0.14, 0.98, 0.006)
    A.add(OB, 'body', rbox((0.12, 0.02, 0.12), r=0.012, M=M_at(pc, rz=0.25, ry=0.15)), lambda p, n: mix('#f08aa0', '#ffb4c2', clamp(n.z + 0.3) * 0.4), 'patch')
    for d in (-1, 1):
        A.add(OB, 'body', rbox((0.09, 0.012, 0.014), r=0.0, M=M_at(pc + Vector((0, -0.012, 0)), rz=0.25, ry=d * 0.785)), lambda p, n: srgb('#7a3a4a'), 'patch')
    OBI0, OBI1 = 0.7, 0.8
    obi = lathe([(0.0, OBI0 - 0.01), (0.305, OBI0), (0.316, OBI0 + 0.02), (0.314, OBI1 - 0.02), (0.30, OBI1), (0.0, OBI1 + 0.01)], 14, sy=TSY + 0.04, e=TE, th0=math.pi / 14)
    red = lambda p, n: mul(mix('#d23c30', '#f06a50', clamp(n.z) * 0.5 + clamp(-n.y) * 0.2), 1 - 0.25 * clamp(-n.z))
    A.add(OB, 'body', obi, red, 'obi')
    bow = tun_front(-0.1, 0.75, 0.035)
    for sx in (-1, 1):
        A.add(OB, 'body', ellipsoid(Vector((0, 0, 0)), (0.07, 0.03, 0.045), K=8, J=4).xform(M_at(bow + Vector((sx * 0.06, 0, 0.012)), ry=sx * 0.35)), red, 'obi')
        A.add(OB, 'body', ellipsoid(Vector((0, 0, 0)), (0.03, 0.02, 0.08), K=6, J=3).xform(M_at(bow + Vector((sx * 0.035, -0.004, -0.08)), ry=sx * 0.3)), red, 'obi')
    A.add(OB, 'body', ellipsoid(bow + Vector((0, -0.012, 0.005)), (0.035, 0.03, 0.035), K=7, J=3), lambda p, n: srgb('#b8302a'), 'obi')
    A.add(OB, 'body', fringe_tier(0, 0, 0.66, 0.29, 0.4, 0.33, 18, jag=0.07, teeth=11, bulge=0.01, thick=0.04, sy=TSY + 0.12, seed=4), straw_col(seed=3), 'skirt')
    # sleeves along the arm, a hanging sleeve bag, straw bursting from the cuffs
    sleeve_c = lambda p, n: mul(mix('#e2963a', '#f6b860', clamp(n.z) * 0.6), 1 - 0.3 * clamp(-n.z))
    for sx in (-1, 1):
        pts = [Vector((sx * (0.18 + 0.42 * t), 0.0, 1.2 - 0.015 * t)) for t in (0.0, 0.33, 0.66, 1.0)]
        A.add(OB, 'body', tube(pts, lambda s: 0.095 + 0.03 * s, K=9, caps=False), sleeve_c, 'sleeves')
        A.add(OB, 'body', ellipsoid(Vector((sx * 0.46, 0.0, 1.11)), (0.13, 0.07, 0.11), K=9, J=4), sleeve_c, 'sleeves')
        cuff = Vector((sx * 0.6, 0.0, 1.185))
        A.add(OB, 'body', tube_loop([cuff + Vector((0, math.cos(TAU * k / 10) * 0.123, math.sin(TAU * k / 10) * 0.123)) for k in range(10)], lambda s: 0.017, K=4),
              lambda p, n: mul(sleeve_c(p, n), 0.85), 'sleeves')
        for k in range(6):
            a = TAU * k / 6 + 0.4 * sx; L = 0.13 + 0.04 * ((k * 5) % 3)
            d = Vector((sx * 1.0, math.cos(a) * 0.55, math.sin(a) * 0.55)).normalized()
            st = lathe([(0.0, -L / 2), (0.03, -L / 2), (0.0, L / 2)], 4, th0=a)
            p0 = cuff + Vector((-sx * 0.03, math.cos(a) * 0.05, math.sin(a) * 0.05))
            A.add(OB, 'body', along(st, p0, p0 + d * L), straw_col(seed=k + 7), 'straw')
    # the head: a cream sack, cinched at the neck with twine over a gathered frill
    HC = Vector((0, 0.0, 1.58)); HR = (0.2, 0.185, 0.19)
    def sack_col(p, n):
        c = mix('#f2e4c8', '#fff6e4', clamp(n.z + 0.2) * 0.5 + clamp(-n.y) * 0.15)
        return mul(c, (1 - 0.2 * clamp(-n.z)) * (0.95 + 0.07 * vnoise(p, 22, 5)))
    A.add(OB, 'body', ellipsoid(HC, HR, K=14, J=9), sack_col, 'head')
    A.add(OB, 'body', fringe_tier(0, 0, 1.43, 0.06, 1.37, 0.12, 12, jag=0.03, teeth=8, bulge=0.0, thick=0.03, sy=0.95, seed=2), sack_col, 'head')
    A.add(OB, 'body', rope_ring(Vector((0, 0, 0)), 0.068, 1.425, rad=0.017, K=4, n=10), rope_col_fn(), 'head')
    def hp(u, v, out=0.0):
        p = Vector((HR[0] * math.sin(u) * math.cos(v), -HR[1] * math.cos(u) * math.cos(v), HR[2] * math.sin(v)))
        nn = Vector((p.x / HR[0] ** 2, p.y / HR[1] ** 2, p.z / HR[2] ** 2)).normalized()
        return HC + p + nn * out, nn
    ink = lambda p, n: mix('#2e2632', '#4a3e4c', clamp(n.z) * 0.5)
    for sx in (-1, 1):
        c, nn = hp(sx * 0.36, 0.08, 0.002)
        A.add(OB, 'body', on_normal(ellipsoid(Vector((0, 0, 0)), (0.028, 0.012, 0.034), K=10, J=3), c, nn), ink, 'face')
        c, nn = hp(sx * 0.62, -0.18, 0.0)
        A.add(OB, 'body', on_normal(ellipsoid(Vector((0, 0, 0)), (0.038, 0.008, 0.026), K=8, J=2), c, nn), lambda p, n: srgb('#ff9eb0'), 'face')
    smile = [hp(0.3 * t, -0.2 - 0.09 * (1 - t * t), 0.0)[0] for t in [-1 + 2 * k / 6 for k in range(7)]]
    A.add(OB, 'body', tube(smile, lambda s: 0.016, K=5), ink, 'face')
    for k in range(9):                            # straw hair poking out under the hat (sides and back)
        a = math.pi / 2 + (k - 4) * 0.42
        p0 = HC + Vector((math.cos(a) * 0.15, math.sin(a) * 0.14, 0.11))
        d = Vector((math.cos(a), math.sin(a), -0.7)).normalized(); L = 0.13 + 0.03 * (k % 3)
        st = lathe([(0.0, -L / 2), (0.032, -L / 2), (0.0, L / 2)], 4, th0=a)
        A.add(OB, 'body', along(st, p0, p0 + d * L), straw_col(seed=k), 'hair')
    # the sugegasa: a wide shallow cone with woven rings, a knob, a red chin tie
    HZ = 1.72
    hat = []
    for k in range(9):
        r = 0.52 * k / 8; z = HZ + 0.28 * (1 - k / 8) ** 1.15
        hat.append((r, z + (0.008 if k % 2 else 0.0)))
    hat += [(0.53, HZ - 0.02), (0.47, HZ - 0.015), (0.0, HZ + 0.1)]
    def hat_col(p, n):
        r = math.hypot(p.x, p.y)
        if n.z < -0.2: return mul(STRAW_LO, 0.9)
        band = 0.5 + 0.5 * math.cos(r / 0.52 * 8 * math.pi)
        c = mix(STRAW_C, STRAW_HI, band * 0.45 + clamp(n.z) * 0.2)
        return mul(c, 0.9 + 0.1 * math.sin(math.atan2(p.y, p.x) * 36))
    A.add(OB, 'body', lathe(hat, 24, th0=0.0, rfn=lambda rr, z, th: rr * (1 + 0.01 * math.sin(3 * th))).xform(Matrix.Translation(HC) @ Matrix.Rotation(-0.06, 4, 'X') @ Matrix.Translation(-HC)), hat_col, 'hat')
    A.add(OB, 'body', ellipsoid(Vector((0, 0.017, HZ + 0.3)), (0.035, 0.035, 0.03), K=7, J=3), lambda p, n: mix(STRAW_LO, STRAW_C, clamp(n.z) * 0.8), 'hat')
    for sx in (-1, 1):
        tie = [Vector((sx * 0.17, 0.02, HZ - 0.0)), Vector((sx * 0.2, -0.04, 1.56)), Vector((sx * 0.13, -0.13, 1.44)), Vector((sx * 0.03, -0.16, 1.41))]
        A.add(OB, 'body', tube(resample(tie, 6), lambda s: 0.012, K=4), lambda p, n: srgb('#d23c30'), 'tie')
    # the crow on the left arm (kit B.at([-0.48, 1.24, 0.02], 0.5)), perched on the sleeve top
    MC = M_at(K(-0.45, 1.305, 0.0), rz=0.5)
    crow = lambda p, n: mix('#2a2a3a', '#4e4e68', clamp(n.z) * 0.6)
    A.add(OB, 'body', ellipsoid(Vector((0, 0, 0)), (0.085, 0.11, 0.08), K=9, J=5).xform(MC @ M_at(Vector((0, 0.0, 0.08)), rx=0.25)), crow, 'crow')
    A.add(OB, 'body', ellipsoid(Vector((0, -0.09, 0.17)), (0.062, 0.06, 0.06), K=9, J=5).xform(MC), crow, 'crow')
    A.add(OB, 'body', lathe([(0.0, 0.0), (0.022, 0.0), (0.0, 0.065)], 5).xform(MC @ M_at(Vector((0, -0.14, 0.165)), rx=math.pi / 2 + 0.25)), lambda p, n: mix('#e8a830', '#ffd060', clamp(n.z) * 0.6), 'crow')
    for sx in (-1, 1):
        A.add(OB, 'body', ellipsoid(Vector((sx * 0.032, -0.135, 0.19)), (0.017, 0.01, 0.019), K=6, J=3).xform(MC), lambda p, n: srgb('#fff6ea'), 'crow')
        A.add(OB, 'body', ellipsoid(Vector((sx * 0.034, -0.143, 0.19)), (0.009, 0.006, 0.01), K=5, J=2).xform(MC), lambda p, n: srgb('#1e1a22'), 'crow')
        A.add(OB, 'body', ellipsoid(Vector((0, 0, 0)), (0.025, 0.08, 0.05), K=6, J=3).xform(MC @ M_at(Vector((sx * 0.072, 0.01, 0.085)), rz=sx * 0.15)), crow, 'crow')
    A.add(OB, 'body', rbox((0.09, 0.14, 0.02), r=0.008, M=MC @ M_at(Vector((0, 0.13, 0.07)), rx=0.45)), crow, 'crow')
    export_rg(A, 'kakashi', {'body': {}})

# ================================================================== 5. the tanuki
def build_tanuki():
    """a Shigaraki tanuki statue (kit tanuki(seed, { s }), built at s = 1): glazed brown pottery, a big cream belly,
    a round head with a dark mask, big shiny eyes and a little open smile, round ears, a straw kasa, a sake flask with
    a red cord in his right paw and a ledger in his left, a striped tail, on a round mossy stone"""
    A = Asset()
    OB = 'tanuki'
    GL = '#8a5e3c'; GL_HI = '#c08a58'; GL_LO = '#4e3424'; CREAM = '#f0e0bc'
    def glaze(base=GL, hi=GL_HI, lo=GL_LO, seed=0):
        def f(p, n):
            c = mix(base, hi, clamp(n.z) * 0.35)
            c = mix(c, lo, clamp(-n.z) * 0.5)
            c = mul(c, 0.94 + 0.1 * vnoise(p, 9, seed))
            return mix(c, '#f8dcb8', smooth(0.82, 0.97, n.dot(LIGHT)) * 0.55)    # the glaze's soft painted shine
        return f
    # the base stone (kit cyl r 0.46 / 0.5, y -0.07 .. 0.03) with moss icing
    bw = lambda rr, z, th: rr * (1 + 0.035 * math.sin(3 * th + 1) + 0.02 * math.sin(7 * th))
    btop = [(0.0, 0.05), (0.43, 0.05), (0.47, 0.03), (0.5, -0.01), (0.5, -0.07)]
    A.add(OB, 'stone', lathe([(0.0, -0.07), (0.5, -0.07), (0.5, -0.01), (0.47, 0.03), (0.43, 0.05), (0.0, 0.05)], 16, th0=math.pi / 16, rfn=bw),
          stone_col(z0=-0.07, seed=80, moss_low=0.5), 'base')
    Fb = surf_walker(btop, 0, 0, e=2.0, rfn=bw)
    bdr = [(math.pi / 2 + 0.4, 0.04, 0.3), (math.pi + 0.3, 0.035, 0.25), (0.2, 0.03, 0.22), (math.pi / 2 - 0.7, 0.045, 0.28)]
    A.add(OB, 'body', drape(Fb, drip_he(lambda th: 0.3 + 0.03 * math.sin(2 * th) + 0.17 * smooth(-0.3, 0.8, math.sin(th)), bdr), lambda th, s: 0.022 + 0.01 * smooth(0.6, 1.0, s),
                            drip_angles(20, bdr), J=2, inner=Vector((0, 0, 0.0))), moss_col(9), 'moss')
    # the body: a big round pear; the cream belly a proud oval on the front
    Z0 = 0.045
    bprof = [(0.0, Z0), (0.24, Z0), (0.31, 0.12), (0.35, 0.3), (0.34, 0.45), (0.29, 0.6), (0.21, 0.72), (0.1, 0.8), (0.0, 0.82)]
    A.add(OB, 'body', lathe(bprof, 22, sy=0.92, th0=math.pi / 22), glaze(seed=1), 'body')
    belly = ellipsoid(Vector((0, -0.185, 0.33)), (0.255, 0.16, 0.25), K=20, J=10)
    A.add(OB, 'body', belly, lambda p, n: mix(mul(CREAM, 0.88), '#fff4dc', clamp(n.z + 0.2) * 0.4 + smooth(0.8, 0.97, n.dot(LIGHT)) * 0.5), 'belly')
    for sx in (-1, 1):
        A.add(OB, 'body', ellipsoid(Vector((sx * 0.16, -0.17, Z0 + 0.045)), (0.1, 0.12, 0.06), K=10, J=4), glaze(seed=2), 'feet')
        for k in range(3):
            A.add(OB, 'body', ellipsoid(Vector((sx * 0.16 + (k - 1) * 0.035, -0.275, Z0 + 0.05)), (0.018, 0.016, 0.014), K=5, J=2), lambda p, n: srgb(CREAM), 'feet')
        a, b = Vector((sx * 0.27, -0.02, 0.62)), Vector((sx * 0.33, -0.15, 0.44))
        A.add(OB, 'body', along(ellipsoid(Vector((0, 0, 0)), (0.085, 0.08, (b - a).length / 2 + 0.07), K=9, J=5), a, b), glaze(seed=3), 'arms')
        A.add(OB, 'body', ellipsoid(Vector((sx * 0.34, -0.18, 0.4)), (0.07, 0.065, 0.06), K=10, J=5), glaze(seed=4), 'arms')
    # the flask (tokkuri) in the right paw (kit at (0.36, 0.35, 0.18))
    fp = K(0.37, 0.33, 0.2)
    fl = lathe([(0.0, 0.0), (0.07, 0.005), (0.092, 0.07), (0.07, 0.15), (0.032, 0.2), (0.03, 0.235), (0.04, 0.25), (0.0, 0.26)], 10, th0=0.1)
    A.add(OB, 'body', fl.xform(Matrix.Translation(fp)), lambda p, n: mix('#ece2d0', '#fffaf0', clamp(n.z + 0.2) * 0.5 + smooth(0.85, 0.97, n.dot(LIGHT)) * 0.6) if p.z - fp.z > 0.035 else srgb('#a07850'), 'flask')
    A.add(OB, 'body', rope_ring(fp, 0.036, fp.z + 0.19, rad=0.012, K=4, n=10), lambda p, n: srgb('#d23c30'), 'flask')
    A.add(OB, 'body', tube([fp + Vector((0.035, 0.0, 0.19)), fp + Vector((0.06, -0.02, 0.12)), fp + Vector((0.055, -0.03, 0.06))], lambda s: 0.011, K=4), lambda p, n: srgb('#d23c30'), 'flask')
    # the ledger in the left paw (kit at (-0.34, 0.45, 0.2)): a blue cover, cream page edges, a paper slip
    ML = M_at(K(-0.36, 0.44, 0.2), ry=-0.2, rz=0.15)
    A.add(OB, 'body', rbox((0.16, 0.05, 0.2), r=0.012, M=ML), lambda p, n: mix('#4f74b4', '#7aa0dc', clamp(n.z + 0.2) * 0.4), 'ledger')
    A.add(OB, 'body', rbox((0.148, 0.054, 0.188), r=0.004, M=ML @ Matrix.Translation((0.014, 0, 0))), lambda p, n: srgb('#f4ead2'), 'ledger')
    A.add(OB, 'body', rbox((0.06, 0.056, 0.04), r=0.006, M=ML @ Matrix.Translation((0.0, -0.002, 0.06))), lambda p, n: srgb('#f4ead2'), 'ledger')
    # the head
    HC = Vector((0, -0.02, 0.93)); R_ = (0.235, 0.215, 0.22)
    A.add(OB, 'body', ellipsoid(HC, R_, K=16, J=10), glaze(seed=5), 'head')
    def hp(u, v, out=0.0):
        p = Vector((R_[0] * math.sin(u) * math.cos(v), -R_[1] * math.cos(u) * math.cos(v), R_[2] * math.sin(v)))
        nn = Vector((p.x / R_[0] ** 2, p.y / R_[1] ** 2, p.z / R_[2] ** 2)).normalized()
        return HC + p + nn * out, nn
    def onface(e, u, v, out=0.0):
        c, nn = hp(u, v, out); return on_normal(e, c, nn)
    for sx in (-1, 1):
        A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.088, 0.03, 0.074), K=16, J=4), sx * 0.37, 0.0, -0.01), lambda p, n: mix('#3a2820', '#5a4030', clamp(n.z) * 0.6), 'mask')
        A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.046, 0.026, 0.052), K=12, J=4), sx * 0.37, 0.02, 0.012), lambda p, n: mix('#1e1618', '#3a2c30', clamp(n.z) * 0.5), 'eyes')
        A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.015, 0.008, 0.016), K=7, J=2), sx * 0.37 - 0.06, 0.08, 0.034), lambda p, n: srgb('#fffaf2'), 'eyes')
        A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.007, 0.005, 0.007), K=5, J=2), sx * 0.37 + 0.05, -0.04, 0.034), lambda p, n: srgb('#fffaf2'), 'eyes')
        A.add(OB, 'body', ellipsoid(Vector((0, 0, 0)), (0.07, 0.04, 0.065), K=8, J=4).xform(M_at(HC + Vector((sx * 0.15, 0.03, 0.17)), ry=sx * -0.4)), glaze(seed=6), 'ears')
        A.add(OB, 'body', ellipsoid(Vector((0, 0, 0)), (0.04, 0.02, 0.038), K=7, J=3).xform(M_at(HC + Vector((sx * 0.15, 0.0, 0.165)), ry=sx * -0.4)), lambda p, n: srgb('#4a3226'), 'ears')
        A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.03, 0.006, 0.02), K=7, J=2), sx * 0.66, -0.25, 0.0), lambda p, n: srgb('#e89a88'), 'cheeks')
    A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.1, 0.075, 0.07), K=10, J=5), 0.0, -0.2, -0.03), lambda p, n: mix(mul(CREAM, 0.9), '#fff4dc', clamp(n.z + 0.3) * 0.5), 'muzzle')
    A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.036, 0.026, 0.026), K=8, J=3), 0.0, -0.12, 0.04), lambda p, n: mix('#2a1e1a', '#6a564e', smooth(0.7, 0.95, n.dot(LIGHT))), 'nose')
    # a little open smile: a dark mouth pocket with a pink tongue, set into the muzzle
    A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.036, 0.012, 0.018), K=8, J=3), 0.0, -0.33, 0.028), lambda p, n: srgb('#4a2228'), 'mouth')
    A.add(OB, 'body', onface(ellipsoid(Vector((0, 0, 0)), (0.02, 0.01, 0.01), K=6, J=2), 0.0, -0.345, 0.033), lambda p, n: srgb('#f08a8a'), 'mouth')
    # the straw kasa, tilted back a touch
    HZ = HC.z + 0.17
    hat = [(0.0, HZ + 0.16), (0.1, HZ + 0.115), (0.2, HZ + 0.065), (0.3, HZ + 0.02), (0.36, HZ - 0.005), (0.365, HZ - 0.025), (0.32, HZ - 0.02), (0.0, HZ + 0.06)]
    def hat_col(p, n):
        if n.z < -0.2: return mul(STRAW_LO, 0.85)
        r = math.hypot(p.x - HC.x, p.y - HC.y - 0.04)
        return mul(mix(STRAW_C, STRAW_HI, (0.5 + 0.5 * math.cos(r / 0.36 * 6 * math.pi)) * 0.4 + clamp(n.z) * 0.2), 0.92 + 0.08 * math.sin(math.atan2(p.y, p.x) * 30))
    A.add(OB, 'body', lathe(hat, 18, th0=0.0).xform(Matrix.Translation((0, 0.04, 0)) @ Matrix.Translation(HC) @ Matrix.Rotation(-0.18, 4, 'X') @ Matrix.Translation(-HC)), hat_col, 'hat')
    # the striped tail curling round behind
    tp = resample([Vector((0.0, 0.25, 0.18)), Vector((0.12, 0.34, 0.12)), Vector((0.24, 0.32, 0.08)), Vector((0.3, 0.22, 0.07))], 8)
    gl7 = glaze(seed=7)
    A.add(OB, 'body', tube(tp, lambda s: 0.1 * (1 - 0.45 * s) + 0.02 * math.sin(math.pi * s), K=9),
          lambda p, n: (mix(GL_LO, '#6a4a34', clamp(n.z) * 0.5) if math.sin((p - tp[0]).length * 34) > 0.3 else gl7(p, n)), 'tail')
    t, cf = maple_leaf(HC + Vector((0.12, 0.1, 0.27)), Vector((0.3, 0.4, 1.0)), 0.13, 0.6, '#7aa640', curl=0.02)   # the tanuki's leaf
    A.add(OB, 'body', t, cf, 'leaf')
    export_rg(A, 'tanuki', {'body': {}, 'stone': {}})

# ================================================================== 6. the warabocchi
def build_warabocchi():
    """a straw warabocchi (kit warabocchi(seed, { s }), built at s = 1): three overlapping thatch tiers with ragged
    fringed hems, twisted straw ropes at the joins, a tied topknot whose tuft splays out"""
    A = Asset()
    OB = 'warabocchi'
    tiers = [(0.82, 0.62, 0.0, 0.72, 1), (1.32, 0.46, 0.52, 0.77, 2), (1.84, 0.1, 1.04, 0.6, 3)]   # (z_top, r_top, z_bot, r_bot, seed)
    hems = [0.58, 1.1]
    def under_hem(p):                      # the soft shadow band just under each overhanging hem
        return max(0.42 * (1 - smooth(0.0, 0.18, h - p.z)) * (1 if p.z < h else 0) for h in hems)
    for zt, rt, zb, rb, sd in tiers:
        A.add(OB, 'body', fringe_tier(0, 0, zt, rt, zb + 0.06, rb, 32, jag=0.1, teeth=17, bulge=0.04, thick=0.07, seed=sd, flare=0.04),
              straw_col('#dcb468', '#f6dc96', '#94703a', seed=sd, cols=32, z0=0.0, ao=0.35, shade=under_hem, k=0.32), 'tiers')
    A.add(OB, 'body', lathe([(0.0, 0.0), (0.66, 0.0), (0.66, 0.07), (0.0, 0.07)], 14, th0=0.1), straw_col(seed=5, z0=0.0), 'tiers')
    for z, r in ((0.6, 0.7), (1.12, 0.53)):     # ropes at the joins (kit bands at 0.55 / 1.1)
        A.add(OB, 'body', rope_ring(Vector((0, 0, 0)), r, z, rad=0.034, K=5, n=26, wob=0.008), rope_col_fn('#c8a060', '#7e5a30', 40), 'ropes')
    # the topknot: a tied bundle, its tuft splaying up and out (kit cap to ~2.17)
    A.add(OB, 'body', lathe([(0.0, 1.78), (0.13, 1.8), (0.09, 1.9), (0.075, 1.98), (0.085, 2.0), (0.0, 2.02)], 10, th0=0.0), straw_col(seed=8, f=17), 'top')
    A.add(OB, 'body', rope_ring(Vector((0, 0, 0)), 0.085, 1.93, rad=0.022, K=4, n=10), rope_col_fn('#c89a50', '#8a6430', 40), 'top')
    for k in range(9):
        a = TAU * k / 9 + 0.2; tilt = 0.55 + 0.15 * (k % 2); L = 0.2 + 0.03 * (k % 3)
        d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        st = lathe([(0.0, -L / 2), (0.04, -L / 2), (0.03, -L / 2 + 0.08), (0.0, L / 2)], 4, th0=a)
        p0 = Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 1.98))
        A.add(OB, 'body', along(st, p0, p0 + d * L), straw_col(seed=k, f=11), 'top')
    export_rg(A, 'warabocchi', {'body': {}})

# ================================================================== 7. the hasa
def build_hasa():
    """a rice-drying rack (kit hasa(seed, { L: 3.4 }), along local x from 0 to L): two crossed bamboo pole pairs lashed
    with rope, a bamboo rail at 1.4 m hung with straw sheaves (ears down), a straw cap on the first crossing, a sparrow"""
    A = Asset(); rng = random.Random(41)
    OB = 'hasa'
    L, h = 3.4, 1.4
    for x in (0.0, L):
        for s in (-1, 1):
            t, cf = bamboo_tube(K(x + s * 0.3, -0.06, s * 0.18), K(x - s * 0.08, h + 0.22, -s * 0.05), 0.05, nodes=4, K=7)
            A.add(OB, 'body', t, cf, 'poles')
        lc = K(x, h - 0.02, 0.0)
        for k, rr in enumerate((0.085, 0.09)):    # the lashing where the poles cross under the rail
            pts = [lc + Vector((math.cos(TAU * j / 10) * 0.07, math.sin(TAU * j / 10) * rr, (k - 0.5) * 0.05 + 0.02 * math.sin(TAU * j / 10 * 2))) for j in range(10)]
            A.add(OB, 'body', tube_loop(pts, lambda s: 0.018, K=4), rope_col_fn(), 'lashing')
    t, cf = bamboo_tube(K(-0.22, h + 0.03, 0.0), K(L + 0.22, h + 0.03, 0.0), 0.045, nodes=7, K=8)
    A.add(OB, 'body', t, cf, 'rail')
    A.add(OB, 'body', lathe([(0.0, h + 0.16), (0.11, h + 0.18), (0.1, h + 0.22), (0.0, h + 0.42)], 8, th0=0.2), straw_col(seed=2, f=13), 'cap')
    n = round(L / 0.22)
    for i in range(n):
        x = 0.15 + i * 0.22 + rng.uniform(-0.02, 0.02)
        for side in (-1, 1):
            ln = 0.5 + rng.uniform(0.0, 0.08)
            top = K(x, h + 0.03, side * 0.07)
            r0 = 0.07 + rng.uniform(-0.006, 0.008)
            lean = rng.uniform(-0.12, 0.12)
            tb = fringe_tier(0, 0, 0.06, r0 * 0.7, -ln - 0.04, r0 * 1.45, 8, jag=0.09, teeth=5, bulge=0.012, thick=0.03, sy=0.8, seed=i * 2 + side)
            tb.xform(Matrix.Translation(top) @ Matrix.Rotation(side * 0.12 + lean * 0.3, 4, 'X') @ Matrix.Rotation(lean, 4, 'Y'))
            zb = top.z + 0.06 - (ln + 0.1) * 0.3; zh = top.z - ln * 0.45
            cc0 = rng.choice([STRAW_C, '#ecc880', '#dcb664'])
            def shf(p, nn, zb=zb, zh=zh, c=cc0, ctr=top):
                if abs(p.z - zb) < 0.03: return mix('#a07a40', '#c49a58', clamp(nn.z) * 0.5)      # the binding
                base = c if p.z > zh else STRAW_HEAD
                k = round(math.atan2(p.y - ctr.y, p.x - ctr.x) / TAU * 8) % 2
                cc = mix(base, STRAW_HI, clamp(nn.z) * 0.3 + 0.12 * k)
                return mul(cc, (1 - 0.32 * clamp(-nn.z)) * (0.9 + 0.08 * k))
            A.add(OB, 'body', tb, shf, 'sheaves')
        A.add(OB, 'body', ellipsoid(K(x, h + 0.085, 0.0), (0.075, 0.1, 0.05), K=7, J=3), straw_col(seed=i, f=9), 'sheaves')   # the fold
    MS = M_at(K(2.62, h + 0.13, 0.0), rz=-0.6)  # a sparrow on the rail
    A.add(OB, 'body', ellipsoid(Vector((0, 0, 0.05)), (0.05, 0.07, 0.048), K=8, J=4).xform(MS), lambda p, n: mix('#9a6a48', '#c8946a', clamp(n.z) * 0.6), 'sparrow')
    A.add(OB, 'body', ellipsoid(Vector((0, -0.055, 0.1)), (0.04, 0.038, 0.038), K=8, J=4).xform(MS), lambda p, n: mix('#7a5038', '#a8764e', clamp(n.z) * 0.6) if n.z > -0.3 else srgb('#f0e2cc'), 'sparrow')
    A.add(OB, 'body', ellipsoid(Vector((0, -0.04, 0.03)), (0.035, 0.04, 0.025), K=6, J=3).xform(MS), lambda p, n: srgb('#f2e6d2'), 'sparrow')
    A.add(OB, 'body', lathe([(0.0, 0.0), (0.012, 0.0), (0.0, 0.03)], 4).xform(MS @ M_at(Vector((0, -0.09, 0.095)), rx=math.pi / 2)), lambda p, n: srgb('#3a2a24'), 'sparrow')
    for sx in (-1, 1):
        A.add(OB, 'body', ellipsoid(Vector((sx * 0.026, -0.08, 0.11)), (0.008, 0.006, 0.009), K=5, J=2).xform(MS), lambda p, n: srgb('#1e1a1c'), 'sparrow')
    A.add(OB, 'body', rbox((0.05, 0.07, 0.012), r=0.004, M=MS @ M_at(Vector((0, 0.08, 0.06)), rx=0.4)), lambda p, n: srgb('#6a4430'), 'sparrow')
    export_rg(A, 'hasa', {'body': {}})

# ================================================================== 8. the komodaru
def build_komodaru():
    """a straw-wrapped sake barrel (kit komodaru(seed)): r <= 0.31, 0.52 tall (the arena stacks them 0.62 apart and
    0.53 up), a wooden lid, the komo mat bulging round the body with a frilled top edge, twisted ropes and vertical
    ties, a red brand cartouche with a cream roundel and a maple leaf (no text)"""
    A = Asset()
    OB = 'komodaru'
    WOODL = '#d2b080'
    A.add(OB, 'body', lathe([(0.0, 0.0), (0.24, 0.0), (0.25, 0.03), (0.25, 0.06), (0.0, 0.06)], 16, th0=0.1), wood_col('#a88458', seed=1, z0=0.0, ao=0.3), 'ends')
    A.add(OB, 'body', lathe([(0.0, 0.46), (0.255, 0.46), (0.258, 0.505), (0.25, 0.518), (0.22, 0.512), (0.0, 0.508)], 18, th0=0.1),
          lambda p, n: (mix(WOODL, '#f0d4a4', 0.3) if (math.hypot(p.x, p.y) * 30) % 1 > 0.25 else mul(WOODL, 0.85)) if n.z > 0.8 else mul('#a88458', 0.9 + 0.1 * clamp(n.z)), 'ends')
    mprof = [(0.255, 0.035), (0.28, 0.06), (0.296, 0.16), (0.3, 0.27), (0.296, 0.38), (0.282, 0.46), (0.262, 0.49)]
    def komo_col(p, n):
        k = round(math.atan2(p.y, p.x) / TAU * 32) % 32
        st = 0.5 + 0.5 * (1 if k % 2 else -1) * (0.7 + 0.3 * math.sin(k * 1.7))
        c = mix('#e2d0a0', '#f6e8c0', clamp(n.z) * 0.4 + st * 0.25)
        return mix(c, '#b8a070', (1 - st) * 0.25 + clamp(-n.z) * 0.4)
    A.add(OB, 'body', lathe(mprof, 32, th0=0.0, rfn=lambda rr, z, th: rr * (1 + 0.01 * math.cos(16 * th))), komo_col, 'komo')
    A.add(OB, 'body', fringe_tier(0, 0, 0.5, 0.25, 0.43, 0.294, 32, jag=0.035, teeth=16, bulge=0.012, thick=0.03, seed=3), komo_col, 'komo')
    rc = rope_col_fn('#c49a5a', '#7e5a32', 60)
    for z in (0.11, 0.41):
        A.add(OB, 'body', rope_ring(Vector((0, 0, 0)), 0.29, z, rad=0.014, K=4, n=20, wob=0.003), rc, 'ropes')
    for k in range(6):
        a = TAU * k / 6 + math.pi / 6
        if abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < 0.6: continue     # (the label's place)
        pts = [Vector((math.cos(a) * r, math.sin(a) * r, z)) for r, z in ((0.292, 0.11), (0.3, 0.2), (0.301, 0.3), (0.292, 0.41))]
        A.add(OB, 'body', tube(pts, lambda s: 0.011, K=4, caps=False), rc, 'ropes')
    def on_drum(a, z, r): return Vector((math.sin(a) * r, -math.cos(a) * r, z))
    t = Tmp(); NA, NZ = 5, 4; A0, Z0, Z1 = 0.36, 0.17, 0.39
    kr = lambda z: 0.3 - 0.004 * ((z - 0.27) / 0.11) ** 2
    front = [[t.vert(on_drum(-A0 + 2 * A0 * i / NA, Z0 + (Z1 - Z0) * j / NZ, kr(Z0 + (Z1 - Z0) * j / NZ) + 0.005)) for i in range(NA + 1)] for j in range(NZ + 1)]
    back = [[t.vert(on_drum(-A0 + 2 * A0 * i / NA, Z0 + (Z1 - Z0) * j / NZ, kr(Z0 + (Z1 - Z0) * j / NZ) - 0.01)) for i in range(NA + 1)] for j in range(NZ + 1)]
    for j in range(NZ):
        for i in range(NA):
            q = [front[j][i], front[j][i + 1], front[j + 1][i + 1], front[j + 1][i]]
            c = sum((t.v[k] for k in q), Vector()) / 4
            t.face(q, Vector((c.x, c.y, 0)))
    def ring_of(G):
        return [G[0][i] for i in range(NA + 1)] + [G[j][NA] for j in range(1, NZ + 1)] + [G[NZ][i] for i in range(NA - 1, -1, -1)] + [G[j][0] for j in range(NZ - 1, 0, -1)]
    lf_, lb_ = ring_of(front), ring_of(back)
    cen = on_drum(0.0, (Z0 + Z1) / 2, 0.292)
    for k in range(len(lf_)):
        a_, b_ = lf_[k], lf_[(k + 1) % len(lf_)]
        mid = (t.v[a_] + t.v[b_]) / 2
        t.face([a_, b_, lb_[(k + 1) % len(lb_)], lb_[k]], mid - cen)
    A.add(OB, 'body', t, lambda p, n: mix('#c8342c', '#ec5a44', clamp(-n.y) * 0.3 + clamp(n.z) * 0.3), 'label')
    A.add(OB, 'body', ellipsoid(on_drum(0.0, 0.28, 0.305), (0.068, 0.006, 0.068), K=16, J=4), lambda p, n: mix('#f6ead2', '#fff8ea', clamp(n.z + 0.2) * 0.4), 'label')
    lf, lcf = maple_leaf(on_drum(0.0, 0.28, 0.304), Vector((0, -1, 0)), 0.1, math.pi / 2, '#d8402a', curl=0.0)
    A.add(OB, 'body', lf, lcf, 'label')
    export_rg(A, 'komodaru', {'body': {}})

BUILDERS_R2 = {'jizoTrio': build_jizoTrio, 'kakashi': build_kakashi, 'tanuki': build_tanuki, 'warabocchi': build_warabocchi,
               'hasa': build_hasa, 'komodaru': build_komodaru}
