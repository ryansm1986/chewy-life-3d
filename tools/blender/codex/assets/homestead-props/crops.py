# The crops: <crop>-young and <crop>-ripe. Origin on the tile centre at the soil top (y = 0), inside +/-0.5; materials body (no sway) and
# leaf (the garden's grass wind). exec'd by build_homestead-props.py.
SPOTS = {1: [(0, 0)], 2: [(-0.18, 0.13), (0.19, -0.12)], 3: [(-0.24, 0.22), (0.0, 0.0), (0.24, -0.22)], 4: [(-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2)]}
GREEN = ('#3a7a38', '#62a648', '#a4d468')
GREEN_Y = ('#4c8e3e', '#7cbc52', '#bce07a')      # younger, fresher
FLAG = {'turnip': '#c86aa8', 'carrot': '#ff8a3a', 'cabbage': '#8ccc62', 'daikon': '#6ab04e', 'strawberry': '#ff4a5e', 'rice': '#e8c060', 'pumpkin': '#ff9a3a', 'melon': '#a8d468'}

def stake(crop):
    """the marker stake: a chunky peg, a cream flag with a crop-coloured bead (no text), at the tile's back-left corner like the kit's"""
    x, z = -0.38, -0.36
    W = '#c8965e'
    put(cyl(0.017, 0.022, 0.36, (x, 0.12, z), K=6), lambda p, n: mul(W, 0.8 + 0.28 * clamp(p.z / 0.3)), 'stake')
    put(box(0.17, 0.115, 0.036, (x + 0.055, 0.25, z), r=0.012), lambda p, n: mix('#e8d4b0', '#fff6e4', clamp(n.z * 0.5 + 0.55)), 'stake')
    egg((x + 0.055, 0.25, z + 0.02), 0.036, sc=(1, 1, 0.42), K=8, J=3, col=lambda p, n: mix(mul(FLAG[crop], 0.85), FLAG[crop], clamp(n.z + 0.6)), tag='stake')

def lathe_at(prof, K, pos, rfn=None, ry=0.0): return glathe(prof, K, pos=pos, rfn=rfn, ry=ry)

# ------------------------------------------------------------------ root crops
def C_turnip(ripe):
    for j, (x, z) in enumerate(SPOTS[2]):
        k = 1.0 if j == 0 else 0.94
        if ripe:
            r = 0.138 * k; y0 = -0.035
            t = lathe_at([(0, y0), (r * 0.42, y0 + 0.012), (r * 0.86, y0 + 0.055), (r, y0 + 0.118), (r * 0.9, y0 + 0.18), (r * 0.52, y0 + 0.228), (r * 0.16, y0 + 0.244), (0, y0 + 0.24)], 13, (x, 0, z))
            top = y0 + 0.244
            def bulb(p, n, t0=y0):
                h = (p.z - t0) / 0.244
                c = mix('#fff4e6', '#f7cfe4', smooth(0.36, 0.55, h))
                c = mix(c, '#c84f9e', smooth(0.5, 0.74, h))
                c = mix(c, '#a63c88', smooth(0.86, 1.0, h) * 0.6)
                return mul(c, 0.92 + 0.13 * clamp(n.z * 0.6 + 0.4))
            put(t, bulb, 'bulb')
            rosette((x, top - 0.012, z), 5, 0.3, 0.078, el=1.02, droop=0.42, seed=11 + j, st=(0.16, 0.3, 0.45, 0.6, 0.75, 0.9), wf=pinnate(0.62),
                    cols=GREEN, stalk='#b86aa0', stalk_to=0.25, twist=j * 0.7)
        else:
            r = 0.07; y0 = -0.02
            put(lathe_at([(0, y0), (r * 0.9, y0 + 0.03), (r, y0 + 0.06), (r * 0.6, y0 + 0.1), (0, y0 + 0.11)], 9, (x, 0, z)),
                lambda p, n, t0=y0: mix('#fff4e6', '#d878b8', smooth(0.45, 0.95, (p.z - t0) / 0.11)), 'bulb')
            rosette((x, 0.08, z), 4, 0.2, 0.062, el=1.0, droop=0.34, seed=21 + j, st=(0.2, 0.42, 0.65, 0.86), cols=GREEN_Y, twist=j * 0.9)
    if not ripe: stake('turnip')

def C_carrot(ripe):
    for j, (x, z) in enumerate(SPOTS[3]):
        if ripe:
            k = (1.0, 1.08, 0.96)[j]; r = 0.082 * k; top = 0.1 * k
            t = lathe_at([(0, -0.05), (r * 0.72, -0.045), (r, 0.012), (r * 0.98, top * 0.52), (r * 0.76, top * 0.92), (r * 0.3, top * 1.08), (0, top * 1.1)], 10, (x, 0, z))
            def body(p, n, y1=top):
                h = clamp(p.z / y1)
                c = mix('#e86a1c', '#ff9a42', clamp(n.z * 0.7 + 0.35))
                if 0.38 < h < 0.62: c = mul(c, 0.86)        # a growth ring
                return mix(c, '#6e9a3a', smooth(0.86, 1.04, h) * 0.55)
            put(t, body, 'carrot')
            rosette((x, top * 0.98, z), 4, 0.36, 0.078, el=1.22, droop=0.26, seed=31 + j, st=(0.2, 0.35, 0.5, 0.65, 0.8, 0.95), wf=pinnate(0.34),
                    cols=('#3e8038', '#62a84a', '#a0d868'), twist=0.4 * j, jit=0.3)
        else:
            egg((x, 0.008, z), 0.04, sc=(1, 0.9, 1), K=7, J=3, col='#ff9a4a', tag='carrot')
            rosette((x, 0.02, z), 3, 0.22, 0.06, el=1.2, droop=0.2, seed=41 + j, st=(0.2, 0.4, 0.6, 0.8), wf=pinnate(0.4), cols=GREEN_Y, twist=0.9 * j, jit=0.3)
    if not ripe: stake('carrot')

def C_daikon(ripe):
    for j, (x, z) in enumerate(SPOTS[2]):
        if ripe:
            k = 1.0 if j == 0 else 0.92; r = 0.1 * k; top = 0.27 * k
            t = lathe_at([(0, -0.06), (r * 0.7, -0.05), (r * 0.98, 0.02), (r, top * 0.5), (r * 0.94, top * 0.86), (r * 0.54, top * 1.0), (0, top * 1.02)], 11, (x, 0, z))
            def body(p, n, y1=top):
                h = clamp(p.z / y1)
                c = mix('#fff8ee', '#f2efd8', h)
                c = mix(c, '#a6d470', smooth(0.5, 0.95, h))
                return mul(c, 0.92 + 0.12 * clamp(n.z * 0.5 + 0.5))
            put(t, body, 'daikon')
            rosette((x, top * 0.97, z), 5, 0.4, 0.075, el=0.98, droop=0.5, seed=51 + j, st=(0.18, 0.34, 0.5, 0.66, 0.82, 0.94), wf=pinnate(0.58), cols=GREEN, stalk='#c0dc90', stalk_to=0.22, twist=0.5 + j)
        else:
            put(lathe_at([(0, -0.03), (0.05, -0.02), (0.056, 0.05), (0.03, 0.095), (0, 0.1)], 8, (x, 0, z)), lambda p, n: mix('#f4f4e0', '#b8dc8a', clamp(p.z / 0.09)), 'daikon')
            rosette((x, 0.075, z), 4, 0.25, 0.062, el=1.02, droop=0.42, seed=61 + j, st=(0.2, 0.42, 0.65, 0.86), wf=pinnate(0.7), cols=GREEN_Y, twist=j)
    if not ripe: stake('daikon')

# ------------------------------------------------------------------ cabbage
def wrap_leaf(c, R, az, a0, a1, W, cols, vein, mat='body', cup=-0.42, st=(0.14, 0.4, 0.68, 0.9), wf=None, tilt=0.0):
    """a leaf hugging a head: its midrib climbs the sphere (centre c, radius R) in the plane of azimuth az from elevation a0 to a1"""
    def path(s):
        a = a0 + (a1 - a0) * s
        rr = R * (1 + 0.1 * s)
        dd = V3(math.cos(az) * math.cos(a), math.sin(a), math.sin(az) * math.cos(a))
        return Vector(c) + dd * rr, dd
    return leaf(c, az, 0, 1, W, path=path, st=st, across=8, cup=cup, thick=0.016, cols=cols, vein=vein, mat=mat, wf=wf or (lambda s: math.sin(PI * min(1.0, s * 0.94 + 0.06) ** 0.72) ** 0.55), under=0.7)

def C_cabbage(ripe):
    if ripe:
        c = V3(0, 0.17, 0); R = 0.185
        put(sph(R, (0, 0.17, 0), (1, 0.94, 1), K=12, J=7), lambda p, n: mix('#a6d878', '#dcf0a8', clamp(n.z * 0.8 + 0.2)), 'head')
        pale = ('#8cc860', '#a8dc78', '#d0eea0'); mid = ('#5fa64a', '#86c45e', '#b4e07e'); dk = ('#3e8438', '#5ea246', '#8cc85c')
        for i in range(3):
            wrap_leaf(c, R * 1.0, i * TAU / 3 + 0.3, 0.1, 1.5, 0.16, pale, '#eef8c8', cup=-0.34)
        for i in range(5):
            wrap_leaf(c, R * 1.07, i * TAU / 5 + 0.9, -0.7, 0.95 + (i % 2) * 0.16, 0.18, mid, '#dcf0a8', cup=-0.4)
        rosette((0, 0.02, 0), 4, 0.42, 0.17, el=0.34, droop=0.1, twist=0.5, seed=71, jit=0.12, across=8, st=(0.2, 0.5, 0.82), cup=0.3, cols=dk, vein='#b8dc88',
                wf=lambda s: math.sin(PI * min(1.0, s * 0.92 + 0.08) ** 0.66) ** 0.6)
    else:
        put(sph(0.085, (0, 0.085, 0), (1, 0.92, 1), K=9, J=5), lambda p, n: mix('#a8d878', '#d8f0a8', clamp(n.z)), 'head')
        rosette((0, 0.02, 0), 6, 0.27, 0.11, el=0.62, droop=0.2, seed=73, across=8, st=(0.2, 0.5, 0.82), cup=0.36, cols=GREEN_Y, vein='#dcf0a8')
        stake('cabbage')

# ------------------------------------------------------------------ strawberry
def berry(x, y, z, r=0.07, tilt=(0, 0), seed=0, ripe=True):
    prof = [(0, -r * 1.25), (r * 0.72, -r * 0.62), (r, r * 0.18), (r * 0.72, r * 0.74), (0, r * 0.86)]
    t = lathe(prof, 6, th0=seed * 0.5).xform(F.m @ lm((x, y, z), rx=tilt[0], rz=tilt[1]))
    base = ('#d81e3c', '#ff4256') if ripe else ('#9cc860', '#d8e890')
    put(t, lambda p, n: mix(base[0], base[1], clamp(n.z * 0.7 + 0.45)), 'berry')
    # the calyx: one little green star (a five-pointed cap)
    cal = lathe([(r * 0.95, -0.012), (r * 0.5, 0.012), (0, 0.022)], 10, th0=seed, rfn=lambda rr, z, th: rr * (0.72 + 0.34 * math.cos(th * 5)) if rr > r * 0.7 else rr).xform(F.m @ lm((x, y + r * 0.82, z)))
    put(cal, lambda p, n: mix('#3e8a38', '#8ccc5c', clamp(n.z * 0.9)), 'calyx')
    if ripe:   # seeds: fat little gold dots standing proud
        rnd = random.Random(seed + 5)
        for i in range(2):
            a = i * 3.1 + rnd.uniform(0.2, 1.2) + 0.7; h = rnd.uniform(-0.35, 0.2)
            rr = r * (0.97 if h > -0.2 else 0.86)
            put(sph(0.0125, (x + math.cos(a) * rr, y + h * r, z + math.sin(a) * rr), K=4, J=2), '#ffe07a', 'seed')

def trifoliate(base, a, h, reach, L=0.13, W=0.075, cols=GREEN):
    x, y, z = base
    tip = (x + math.cos(a) * reach, y + h, z + math.sin(a) * reach)
    vtube([(x, y, z), tip], 0.014, K=3, cols=('#7ab04e', '#5a9a44'), mat='leaf', tag='stalk')
    for dk in (-0.85, 0, 0.85):
        leaf(tip, a + dk, 0.28, L * (1.08 if dk == 0 else 0.92), W, droop=0.34, st=(0.3, 0.72), cols=cols, wf=lambda s: math.sin(PI * min(1.0, s * 0.94 + 0.06) ** 0.62) ** 0.55, cup=0.26, thick=0.013)

def flower5p(x, y, z, r=0.042):
    fl = lathe([(0, -0.018), (r * 1.6, -0.004), (r * 1.7, 0.012), (r * 0.8, 0.018)], 10, rfn=lambda rr, zz, th: rr * (0.74 + 0.26 * abs(math.cos(th * 2.5)) ** 0.6)).xform(F.m @ lm((x, y, z)))
    put(fl, lambda p, n: mix('#efe2d4', '#fff8ee', clamp(n.z)), 'flower', 'leaf')
    egg((x, y + 0.016, z), r * 0.62, sc=(1, 0.6, 1), K=5, J=2, col='#ffd24a', mat='leaf', tag='flower')

def C_strawberry(ripe):
    rnd = seeded('straw%d' % ripe)
    n = 5 if ripe else 6
    for i in range(n):
        a = i * TAU / n + rnd.uniform(-0.2, 0.2); reach = rnd.uniform(0.13, 0.19); h = rnd.uniform(0.15, 0.21)
        trifoliate((0, 0.0, 0), a, h, reach, cols=GREEN if ripe else GREEN_Y)
    if ripe:
        for i, (a, rr, y, s) in enumerate([(0.5, 0.3, 0.085, 1.0), (1.75, 0.31, 0.09, 1.1), (2.9, 0.3, 0.085, 0.95), (4.1, 0.31, 0.085, 1.05), (5.3, 0.3, 0.09, 1.0)]):
            x, z = math.cos(a) * rr, math.sin(a) * rr
            vtube([(x * 0.4, 0.17, z * 0.4), (x, y + 0.075 * s, z)], 0.014, K=3, cols=('#6aa84a', '#8ab85a'), mat='body', tag='stalk')
            berry(x, y, z, 0.076 * s, seed=i * 3 + 1)
    else:
        flower5p(0.11, 0.24, 0.07); flower5p(-0.12, 0.23, -0.02); flower5p(0.0, 0.265, -0.13)
        berry(-0.06, 0.1, 0.24, 0.04, seed=3, ripe=False)
        stake('strawberry')

# ------------------------------------------------------------------ rice
def blade(x, z, a, h, w, lean, cols, st=(0.3, 0.62, 0.86)):
    d = lean
    leaf((x, -0.01, z), a, PI / 2 - d, h, w, droop=0.18 + d * 0.4, st=st, cols=cols, thick=0.013, cup=0.1,
         wf=lambda s: 0.9 - 0.5 * s if s < 0.95 else 0.2, tag='blade')

def panicle(x, z, a, h, cols):
    """a stem arching over to a drooping head of plump separate grains, two staggered rows"""
    ca, sa = math.cos(a), math.sin(a)
    top = (x + ca * 0.1, h * 0.94, z + sa * 0.1)
    vtube([(x, 0.0, z), (x + ca * 0.05, h * 0.68, z + sa * 0.05), top], 0.015, K=3, cols=('#a89c48', '#d8c468'), mat='leaf', tag='stem')
    for k in range(6):
        t = k / 5
        px = x + ca * (0.1 + 0.12 * t); py = h * 0.94 + 0.018 * math.sin(t * 2.4) - 0.15 * t * t; pz = z + sa * (0.1 + 0.12 * t)
        side = (-1 if k % 2 else 1) * 0.02 * (1 - 0.4 * t)
        put(sph(0.04 * (1 - 0.25 * t), (px - sa * side, py, pz + ca * side), sc=(1, 1.15, 1), K=5, J=2, ry=k * 0.7), lambda p, n: mix('#d09c30', '#ffe48c', clamp(n.z * 0.7 + 0.45)), 'grain', 'leaf')

def C_rice(ripe):
    rnd = seeded('rice%d' % ripe)
    GOLD = ('#a8a048', '#d4c060', '#f4dc8a'); YG = ('#4e9440', '#72b24c', '#b0dc72')
    for j, (x, z) in enumerate(SPOTS[4]):
        a0 = rnd.uniform(0, TAU)
        if ripe:
            for i in range(2): blade(x, z, a0 + 0.4 + i * PI + rnd.uniform(-0.3, 0.3), rnd.uniform(0.32, 0.4), 0.04, rnd.uniform(0.15, 0.32), GOLD, st=(0.4, 0.8))
            for i in range(2): panicle(x, z, a0 + 0.8 + i * PI + rnd.uniform(-0.4, 0.4), rnd.uniform(0.44, 0.52), GOLD)
        else:
            for i in range(6): blade(x, z, a0 + i * TAU / 6 + rnd.uniform(-0.3, 0.3), rnd.uniform(0.26, 0.36), 0.032, rnd.uniform(0.08, 0.3), YG)
    if not ripe: stake('rice')

# ------------------------------------------------------------------ the vines: big lobed leaves on the soil
SQ = {0.14: 0.62, 0.3: 1.0, 0.46: 0.72, 0.62: 0.92, 0.78: 0.62, 0.92: 0.3}
def squash_leaf(x, z, a, s, cols=('#35753a', '#58a048', '#94cc62')):
    st = tuple(sorted(SQ))
    leaf((x, 0.015, z), a, 0.3, 0.42 * s, 0.2 * s, droop=0.42, st=st, wf=lambda u: SQ.get(u, 0.7), across=8, cup=0.2, thick=0.016, cols=cols, vein='#b8dc88', stalk='#6a9a3a', stalk_to=0.14)

def vine(pts, r=0.02):
    vtube(pts, lambda s: r * (1 - 0.3 * s), K=5, cols=('#6a9a3a', '#86b048'), mat='leaf', tag='vine')

def curl(x, z, h=0.1):
    pts = []
    for k in range(9):
        t = k / 8; a = t * 8.5
        pts.append((x + math.cos(a) * 0.05 * (1 - t * 0.7), 0.04 + t * h, z + math.sin(a) * 0.05 * (1 - t * 0.7)))
    vtube(pts, 0.0125, K=4, cols=('#7aa840', '#a8cc58'), mat='leaf', tag='curl')

def ribbed(pos, R, H, ribs, K, c_lobe, c_groove, c_top, dimple=0.22, depth=0.09, J=6):
    """a ribbed squash: a lathe with a deep dimple at the top, K samples round, grooves painted dark"""
    prof = []
    for j in range(J + 1):
        q = PI * j / J
        r = math.sin(q); y = -math.cos(q)
        rr = R * (r ** 0.82 if r > 0 else 0)
        yy = H * (0.5 + 0.5 * y)
        if j >= J - 1: yy -= H * dimple * 0.6       # the dimple round the stem
        prof.append((rr, yy))
    prof[0] = (0.0, 0.0); prof[-1] = (0.0, H * (1 - dimple))
    cx = pos
    t = lathe(prof, K, th0=0.0, rfn=lambda rr, z, th: rr * (1 - depth * abs(math.cos(th * ribs / 2)) ** 3))
    t.xform(F.m @ lm(cx))
    C = toB(cx)
    def f(p, n):
        d = p - C; th = math.atan2(d.y, d.x); g = abs(math.cos(th * ribs / 2)) ** 3
        h = clamp(d.z / H)
        c = mix(c_lobe, c_top, smooth(0.55, 1.0, h) * 0.5)
        c = mix(c, c_groove, smooth(0.45, 1.0, g) * 0.8)
        return mul(c, 0.88 + 0.16 * clamp(n.z * 0.6 + 0.5))
    return put(t, f, 'fruit')

def C_pumpkin(ripe):
    vine([(-0.34, 0.0, 0.3), (-0.14, 0.03, 0.1), (0.06, 0.03, -0.14), (0.32, 0.0, -0.3)])
    squash_leaf(-0.14, 0.2, 2.5, 0.96); squash_leaf(0.12, -0.2, -0.75, 0.93); squash_leaf(-0.16, -0.14, -2.3, 0.9)
    if ripe:
        squash_leaf(0.2, 0.14, 0.72, 0.72)
        ribbed((0.03, -0.03, 0.02), 0.28, 0.36, 8, 32, '#ff9630', '#c85c14', '#ffbc5a', J=5)
        vtube([(0.03, 0.26, 0.02), (0.045, 0.32, 0.02), (0.085, 0.37, 0.03)], lambda s: 0.038 - 0.012 * s, K=6, cols=('#6a8a3a', '#8aa84a'), tag='stem')
        curl(0.28, 0.2, 0.09)
    else:
        ribbed((0.03, -0.015, 0.02), 0.115, 0.17, 8, 16, '#74b050', '#4a8a3c', '#b0d878', J=5)
        vtube([(0.03, 0.12, 0.02), (0.04, 0.17, 0.02)], 0.018, K=5, cols=('#6a9a3a', '#8ab048'), tag='stem')
        stake('pumpkin')

def C_melon(ripe):
    vine([(-0.34, 0.0, -0.22), (-0.1, 0.03, 0.0), (0.34, 0.0, 0.22)], r=0.018)
    C2 = ('#31703a', '#529a46', '#8cc860')
    squash_leaf(-0.15, 0.17, 2.35, 1.0, C2); squash_leaf(0.15, -0.18, -0.8, 0.95, C2); squash_leaf(0.17, 0.18, 0.85, 0.7, C2)
    if not ripe: squash_leaf(-0.2, -0.13, -2.4, 0.8, C2)
    R = 0.235 if ripe else 0.1
    K, J = (20, 11) if ripe else (14, 7)
    cy = R * 0.86
    prof = [(math.sin(PI * j / J) * R, -math.cos(PI * j / J) * R * 0.96) for j in range(J + 1)]
    prof[0] = (0.0, prof[0][1]); prof[-1] = (0.0, prof[-1][1])
    # the net lies along mesh edges: alternate rings are turned half a step, so each vertex is a crossing or a cell
    t = Tmp(); rings = []; cs = []; flags = []
    for j, (r, y) in enumerate(prof[1:-1]):
        row = []; fr = []
        for k in range(K):
            th = TAU * k / K + (0.5 * TAU / K if j % 2 else 0)
            # a netted rind: the crossings stand proud, the cells sink
            cell = ((k + (j // 2)) % 2 == 0) if j % 2 == 0 else False
            on = (j % 2 == 1) or (k + j // 2) % 2 == 0
            rr = r * (1.012 if on else 0.985)
            row.append(toB(V3(math.cos(th) * rr, cy + y * (1.012 if on else 0.985), math.sin(th) * rr))); fr.append(on)
        rings.append(row); flags.append(fr); cs.append(toB(V3(0, cy + y, 0)))
    ids = ring_surface(t, rings, cs, toB(V3(0, cy + prof[0][1], 0)), toB(V3(0, cy + prof[-1][1], 0)))
    base = ('#a6cc66', '#c4e080') if ripe else ('#5ea24c', '#88c264'); net = '#f4f6d8' if ripe else '#b8e098'
    t.c = [None] * len(t.v)
    t.normals()
    for row, fr in zip(ids, flags):
        for i, on in zip(row, fr):
            nz = t.n[i].z
            c = mix(base[0], base[1], clamp(nz * 0.6 + 0.5))
            t.c[i] = mix(c, net, 0.86 if on and ripe else (0.5 if on else 0.0))
    t.c[-2] = base[0]; t.c[-1] = base[1]
    t.n = [None] * len(t.v)
    put(t, None, 'fruit')
    if ripe:
        top = cy + R * 0.96
        put(cyl(0.017, 0.023, 0.075, (0, top + 0.03, 0), K=6), '#8a7a3a', 'stem')
        put(glathe([(0, -0.075), (0.017, -0.07), (0.017, 0.07), (0, 0.075)], 6, pos=(0, top + 0.075, 0), rz=PI / 2), lambda p, n: mix('#7a6a34', '#a8964e', clamp(n.z * 0.5 + 0.5)), 'stem')
        curl(0.3, -0.08, 0.1)
    else:
        put(cyl(0.012, 0.018, 0.05, (0, cy + R + 0.016, 0), K=5), '#8aa848', 'stem')
        stake('melon')

CROP_FN = dict(turnip=C_turnip, carrot=C_carrot, cabbage=C_cabbage, daikon=C_daikon, strawberry=C_strawberry, rice=C_rice, pumpkin=C_pumpkin, melon=C_melon)
def build_crop(crop, stage):
    new_asset()
    CROP_FN[crop](stage == 'ripe')
    ray_ao(DMAX=0.22, K=0.5, ground=-0.005, off=0.006, NR=16)
    export_piece('prop-crop-%s-%s' % (crop, stage), budget=900)
