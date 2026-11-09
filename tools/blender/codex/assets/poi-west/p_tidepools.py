# The Tide Pools: poi-tidepools-0 (kit call 0 of pois/tidepools.js: y0 = -0.8) and poi-tidepools-1..3 (the three crabs: kit calls 1-3, pivot at y = 1).
# What stays the kit's: each pool's see-through water (ctx.add, at p.y over p.ol), the crabs' scuttling, the colliders. Our bowls and rim rocks sit round that water.
TAN = '#ecd09a'; CORAL_S = '#f07a45'; ANEM = ['#ff7fae', '#b878e0', '#ff8a60', '#e89ae8']

def pool_bowl(p, i):
    """a sandy dish under the water (its floor p.y - 0.24), teal toward the middle; a rocky skirt behind the rim so there's never a gap"""
    R, Y, D, px, pz = p['r'], p['y'], 0.24, p['x'], p['z']
    ol = p['ol']; n = len(ol); step = 2
    t = PTmp(); rings = []
    qs = [0.0, 0.3, 0.55, 0.8, 1.0, 1.22]
    cen = t.vert(V3(px, Y - D, pz), Z)
    for q in qs[1:]:
        row = []
        for k in range(0, n, step):
            x, z = ol[k]; yy = Y - D + D * min(1.0, q) ** 2.2 + (0.05 * (q - 1.0) if q > 1 else 0.0)
            if q <= 1.0: yy = max(yy, min(Y - 0.03, H(px + x * q, pz + z * q) + 0.03))   # (the bowl rides over any ground that would poke through the water)
            row.append(t.vert(V3(px + x * q, yy, pz + z * q), Z))
        rings.append(row)
    K = len(rings[0])
    for k in range(K): t.f.append([cen, rings[0][k], rings[0][(k + 1) % K]])
    for j in range(len(rings) - 1):
        for k in range(K): t.f.append([rings[j][k], rings[j + 1][k], rings[j + 1][(k + 1) % K], rings[j][(k + 1) % K]])
    for fi, f in enumerate(t.f):
        P_ = [t.v[v] for v in f]
        if (P_[1] - P_[0]).cross(P_[2] - P_[0]).z < 0: t.f[fi] = f[::-1]
    def c(q, nn):
        d = math.hypot(q.x - px, -q.y - pz) / R
        k = mix('#3fb3a8', TAN, clamp((d - 0.35) * 1.5) ** 2)
        return mul(k, 0.94 + 0.1 * vnoise(q, 5.5, i))
    put(t, c, 'bowl', 'body')
    # the skirt: a plain stone wall from the water down to the ground, behind the rocks
    wall = lathe([(R * 1.28, Y - 0.9), (R * 1.22, Y + 0.02)], 12).xform(Matrix.Translation(V3(px, 0, pz)))
    put(wall, flat('#7c7484'), 'bowl', 'body')

def barnacle(C, q, n, s, col='#f4ecdc'):
    """a little cone barnacle (4 tris) set on a surface"""
    n = n.normalized(); xa = (Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))).cross(n).normalized(); ya = n.cross(xa)
    base = []
    for k in range(4):
        a = TAU * k / 4 + 0.4; d = xa * math.cos(a) + ya * math.sin(a)
        base.append(C.v(q + d * s - n * 0.008, n + d, mul(col, 0.8)))
    tip = C.v(q + n * (s * 0.95), n, col)
    for k in range(4): C.tri(tip, base[k], base[(k + 1) % 4])

def rim_rocks(p, i, rnd):
    """rounded, cut-faced rocks of every size round the outline, just proud of the water uphill, taller where the ground falls away"""
    Y, px, pz, ol = p['y'], p['x'], p['z'], p['ol']; n = len(ol)
    u = rnd.random() * n; done = 0.0; cnt = 0; C = Cards('barnacles', 'body')
    per = TAU * (p['r'] + 0.3)
    while done < per and cnt < 24:
        k0 = int(u) % n; k1 = (k0 + 1) % n; f = u - int(u)
        ox, oz = ol[k0][0] + (ol[k1][0] - ol[k0][0]) * f, ol[k0][1] + (ol[k1][1] - ol[k0][1]) * f; a = math.atan2(oz, ox)
        r = 0.4 + rnd.random() * rnd.random() * 0.5 + (0.18 if rnd.random() < 0.22 else 0.0); d = math.hypot(ox, oz) + r * 0.5
        x0, z0 = px + math.cos(a) * d, pz + math.sin(a) * d; g = H(x0, z0)
        need = max(0.12 + rnd.random() * 0.12, Y + 0.14 + rnd.random() * 0.12 - g)
        sq = clamp(need * 0.95 / r, 0.5, 1.1); yc = g + need - r * sq
        big = r > 0.72; m = (0.5 if rnd.random() < 0.36 else 0.0) if r > 0.5 else 0.0
        top = rock(x0, yc, z0, r, sq=sq, st=1.1 + rnd.random() * 0.3, yaw=-a + PI / 2 + (rnd.random() - 0.5), moss=m, seed=300 + i * 40 + cnt, lod=1 if big else 0, cuts=4, wet=Y + 0.05, gy=min(g, Y - 0.1), tag='rim', drop=0.8)
        if rnd.random() < 0.45:
            for j in range(3):
                aa = a + PI + (rnd.random() - 0.5) * 2.2; dd = r * (0.72 + rnd.random() * 0.1); yy = top - r * sq * (0.3 + rnd.random() * 0.3)
                nn = Vector((math.cos(aa), -math.sin(aa), 0.45))
                barnacle(C, V3(x0 + math.cos(aa) * dd, yy, z0 + math.sin(aa) * dd), nn, rnd.uniform(0.04, 0.06))
        step = (r * 1.25) / (per / n)
        u += step; done += r * 1.25; cnt += 1
    C.flush()

def floor_y(p, x, z):
    t = clamp(math.hypot(x - p['x'], z - p['z']) / (p['r'] + 0.12)); return p['y'] - 0.24 + 0.24 * t ** 2.2 + 0.03 * t

def starfish(x, y, z, rot, R, col=CORAL_S):
    C = Cards('life', 'body'); up = Z; ctr = C.v(V3(x, y + 0.04, z), up, mix(col, '#ffc090', 0.45)); rim = []
    for k in range(10):
        a = rot + PI * k / 5; rr = R if k % 2 == 0 else R * 0.4
        rim.append(C.v(V3(x + math.cos(a) * rr, y + (0.008 if k % 2 == 0 else 0.018), z + math.sin(a) * rr), up, mix(col, '#ffb080', 0.15 if k % 2 == 0 else 0.0)))
    for k in range(10): C.tri(ctr, rim[(k + 1) % 10], rim[k])
    C.flush()

def anemone(x, y, z, col, R, seed):
    """a squat pedestal and a ring of fat soft tentacles (cards) round a dark mouth"""
    rnd = random.Random(seed); C = Cards('life', 'leaf')
    put(glathe([(R * 0.55, y - 0.01), (R * 0.42, y + 0.07), (0.0, y + 0.075)], K=6, pos=(x, 0, z)), lambda p, n: mul(col, 0.62), 'life', 'body')
    b = V3(x, y + 0.06, z); N = 10
    for k in range(N):
        a = TAU * k / N + rnd.uniform(-0.1, 0.1); e = rnd.uniform(0.42, 0.7)
        d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
        leaf2(C, b + Vector((math.cos(a), math.sin(a), 0)) * (R * 0.2), d, Z, R * rnd.uniform(0.95, 1.2), R * 0.42, mul(col, 0.8), mix(col, '#fff6f4', 0.45), sn=Z + d * 0.3)
    C.flush()

def seaweed(x, y, z, seed):
    rnd = random.Random(seed); C = Cards('life', 'leaf'); b = V3(x, y, z)
    for k in range(4):
        a = rnd.uniform(0, TAU); d = Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.9))
        leaf2(C, b, d, Vector((math.cos(a), math.sin(a), 0.2)), rnd.uniform(0.22, 0.32), 0.07, '#4a8a4a', '#8ab85a')
    C.flush()

def shell_(x, y, z, rot, s=1.0, kind=0):
    if kind:  # a ridged scallop
        C = Cards('life', 'body'); ctr = C.v(V3(x, y + 0.035 * s, z), Z, '#fff4e2'); rim = []
        for k in range(10):
            a = rot + TAU * k / 10; rr = (0.08 if k % 2 == 0 else 0.072) * s
            rim.append(C.v(V3(x + math.cos(a) * rr, y + 0.006, z + math.sin(a) * rr), Z, '#fff0d8' if k % 2 == 0 else '#dfc0a0'))
        for k in range(10): C.tri(ctr, rim[(k + 1) % 10], rim[k])
        C.flush(); return
    # a cream spiral cone
    with at((x, y + 0.04 * s, z), ry=rot, rz=PI / 2 - 0.3):
        pr = [(0.0, 0.0)] + [(0.058 * s * math.sin(q / 4 * PI * 0.9) * (1 - q / 4 * 0.5) * (1.08 if q % 2 else 0.92), q / 4 * 0.14 * s) for q in (1, 2, 3)] + [(0.0, 0.14 * s)]
        put(glathe(pr, K=6), lambda p, n: mix('#d9a878', '#fff0d8', clamp(n.z * 0.5 + 0.6)), 'life', 'body')

def bucket_(x, y, z):
    with at((x, y, z)):
        def c(p, n):
            a = math.atan2(p.y + z, p.x - x); st = abs(math.sin(a * 6)) ** 0.5
            return mix(mix('#b87e34', '#ecb45a', st), '#ffd890', clamp(n.z) * 0.3)
        put(glathe([(0.0, 0.0), (0.16, 0.0), (0.2, 0.37), (0.215, 0.39), (0.18, 0.39), (0.17, 0.08), (0.0, 0.08)], K=12), c, 'bucket', 'body')
        for h in (0.09, 0.31):
            put(gloop(circle_g(0.175 + h * 0.085, 12, h), 0.02, K=3), flat('#8a5a2e'), 'bucket', 'body')
        pts = [(0.2 * math.cos(PI * k / 6 + 0.4), 0.39 + 0.2 * math.sin(PI * k / 6), 0.2 * math.sin(0.4) * math.cos(PI * k / 6)) for k in range(7)]
        put(gtube(pts, lambda s: 0.018, K=3, caps=False), lambda p, n: mix('#a89470', '#e8d4a8', clamp(n.z + 0.4)), 'bucket', 'body')

def net_(x, y, z):
    a = -0.6; ux, uz = math.cos(a), math.sin(a)
    put(gtube([(x - ux * 0.5, y + 0.035, z - uz * 0.5), (x - ux * 0.12, y + 0.045, z - uz * 0.12)], lambda s: 0.03, K=5), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z + 0.3)), 'net', 'body')
    cx, cz = x + ux * 0.07, z + uz * 0.07
    put(gloop([(cx + 0.16 * math.cos(TAU * k / 12), y + 0.05, cz + 0.16 * math.sin(TAU * k / 12)) for k in range(12)], 0.022, K=3), flat('#f2e6c8'), 'net', 'body')
    t = glathe([(0.15, y + 0.05), (0.13, y + 0.02), (0.0, y + 0.015)], K=8, pos=(cx, 0, cz))
    def c(p, n):
        return '#a89878' if (int((p.x + p.y) * 22) + int((p.x - p.y) * 22)) % 2 else '#eee2c8'
    put(t, c, 'net', 'body')

def succulent(x, z, s, seed):
    rnd = random.Random(seed); y = H(x, z) - 0.01; C = Cards('succulents', 'leaf')
    for ring, nn in enumerate((6, 4)):
        L = (0.24 - ring * 0.07) * s; b = V3(x, y + 0.04 + ring * 0.04 * s, z)
        for k in range(nn):
            a = TAU * k / nn + ring * 0.5 + rnd.uniform(-0.1, 0.1); e = 0.35 + ring * 0.45
            d = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
            leaf4(C, b, d, Z + d * 0.3, L, L * 0.68, '#7aaa86', '#ff9ab8' if ring == 0 else '#c8d890', sn=Z + d * 0.5)
    C.flush()

def build_tidepools():
    use_site('tidepools')
    rnd = random.Random(4141); pools = S.pools
    for i, p in enumerate(pools):
        pool_bowl(p, i); rim_rocks(p, i, rnd)
        R = p['r']; n_st = 2 if R > 1.2 else 1
        def spot(k):
            a = rnd.uniform(0, TAU); d = R * (0.15 + rnd.random() * k); x = p['x'] + math.cos(a) * d; z = p['z'] + math.sin(a) * d
            return x, min(p['y'] - 0.06, floor_y(p, x, z)), z
        for k in range(n_st):
            x, y, z = spot(0.5); starfish(x, y, z, rnd.uniform(0, TAU), 0.2 + rnd.random() * 0.06)
        for k in range(3 if R > 1.2 else 2):
            x, y, z = spot(0.55); anemone(x, y, z, ANEM[(i + k) % 4], 0.22 + rnd.random() * 0.08, 400 + i * 10 + k)
        x, y, z = spot(0.65); seaweed(x, y, z, 450 + i)
        for k in range(2):
            x, y, z = spot(0.6); shell_(x, y, z, rnd.uniform(0, TAU), 1.0 + rnd.random() * 0.4, k % 2)
        for k in range(2):
            x, y, z = spot(0.72); pebble_(x, z, rnd.uniform(0.05, 0.09), seed=460 + i * 5 + k, y=y + 0.01, base=['#a8a0b8', '#8fa2a8', '#c9c2d0'][k % 3])
        # a stone poking up in the bigger pools
        if R > 1.2:
            a = rnd.uniform(0, TAU); dd = R * 0.45; x, z = p['x'] + math.cos(a) * dd, p['z'] + math.sin(a) * dd
            rock(x, p['y'] - 0.02, z, 0.2, sq=0.75, st=1.2, seed=480 + i, wet=p['y'] + 0.03, gy=p['y'] - 0.1, lod=0, cuts=2)
    # the broad dry rock with the bucket and the net
    bx, bz = 0.95, -2.35
    top = rock(bx, H(bx, bz) + 0.02, bz, 0.95, sq=0.42, st=1.3, yaw=0.5, moss=0.34, seed=500, lod=2, cuts=3, tag='rock')
    bucket_(bx + 0.15, top - 0.06, bz - 0.1)
    net_(bx - 0.35, top - 0.03, bz + 0.25)
    shell_(bx + 0.55, top - 0.07, bz + 0.15, 0.0, 1.3)
    for i, (x, z, r) in enumerate(((2.45, -2.0, 0.32), (1.75, -0.95, 0.34), (1.35, 0.2, 0.31), (1.2, 1.5, 0.33), (0.3, 2.45, 0.3))):
        step_stone(x, z, r, seed=i + 21)
    for i, (x, z, r) in enumerate(((1.1, 3.0, 0.55), (-6.2, -3.6, 0.7), (-3.4, -3.4, 0.55), (0.5, -4.6, 0.45), (2.6, 3.9, 0.5), (-4.2, 3.7, 0.5))):
        ground_rock(x, z, r, moss=0.5 if i % 2 == 0 else 0.0, sink=0.3, seed=510 + i, lod=1 if r > 0.5 else 0, cuts=4)
    W_ = S.water
    for i, (x, z, r) in enumerate(((-8.6, 0.8, 0.85), (-7.2, 4.6, 0.75), (-3.9, 6.6, 0.8))):
        rock(x, W_ - r * 0.25, z, r, sq=1.0, st=1.0, moss=0.5 if i < 2 else 0.0, seed=530 + i, wet=W_ + 0.25, gy=W_ - 0.2, lod=1 if i < 2 else 0, cuts=4)
        foam(x, z, r * 0.84, W_, seed=i)
    rope_fence(((1.6, -6.7), (1.72, -4.9), (1.95, -3.25)), seed=31)
    rope_fence(((2.75, -0.55), (3.3, 1.2), (3.25, 2.9)), seed=37)
    beach = ('#6fa24a', '#a9cf6a')
    for i, (x, z) in enumerate(((0.9, -5.6), (-1.0, -5.0), (2.3, -4.1), (-2.6, -3.0), (2.4, 1.9), (0.5, 4.6), (1.9, 3.3))):
        tuft_(x, z, h=0.65, n=7, seed=540 + i, colors=beach)
    for i, (x, z, s_) in enumerate(((0.2, -3.4, 1.0), (2.25, -2.95, 0.85), (2.1, 0.45, 0.9), (1.2, 2.25, 1.0), (2.3, -1.25, 0.9), (-1.3, -2.1, 0.9))):
        succulent(x, z, s_, 560 + i)
    pink = ['#ff93b6', '#fff6ee', '#ffb6cf']
    for i, (x, z, n) in enumerate(((2.4, 0.9, 4), (0.9, -3.4, 3), (1.5, -1.9, 3), (2.3, 2.6, 4), (0.0, -5.2, 3))):
        flowers_(x, z, n=n, r=0.45, colors=pink, seed=580 + i, nleaf=2)
    shrub_(0.9, -6.4, 0.5, flowers=['#ff93b6', '#fff6ee'], nf=6, seed=590)
    shrub_(-2.3, -4.8, 0.45, color='#62ad45', seed=591)
    pebbles(-2.0, 3.0, 2, 2.0, seed=12)
    finish('poi-tidepools-0', place='tidepools', K=0.42, weights={'leaf': 0.5})
    for k in (1, 2, 3): crab(k)

def crab(k):
    """a chunky red crab (its frame: walking along x, facing +z; the kit's pivot lifts it 1 m): a round shell, big eyes on stalks, two claws, six legs"""
    use_site('tidepools'); S.water = -99
    red, dark = '#e8604a', '#b83f30'
    rc = lambda p, n: mix(dark, mix(red, '#ffa084', 0.3), clamp(n.z * 0.9 + 0.35))
    with at((0, 1.0, 0)):
        put(sph(0.115, (0, 0.085, 0), sc=(1.32, 0.62, 1.0), K=8, J=4), rc, 'crab', 'body')
        for s in (-1, 1):
            put(gtube([(s * 0.045, 0.12, 0.06), (s * 0.05, 0.18, 0.07)], lambda q: 0.018, K=3, caps=False), flat(dark), 'crab', 'body')
            put(sph(0.036, (s * 0.05, 0.195, 0.07), K=6, J=2), flat('#fff8f0'), 'crab', 'body')
            put(sph(0.019, (s * 0.052, 0.2, 0.098), K=4, J=2), flat('#2a2230'), 'crab', 'body')
            put(gtube([(s * 0.1, 0.07, 0.05), (s * 0.15, 0.08, 0.12)], lambda q: 0.026, K=3, caps=False), rc, 'crab', 'body')
            put(sph(0.052, (s * 0.165, 0.09, 0.165), sc=(1.0, 0.72, 1.25), K=6, J=2), rc, 'crab', 'body')
            put(glathe([(0.024, 0.0), (0.0, 0.07)], K=4, pos=(s * 0.145, 0.095, 0.205), rx=PI / 2), flat(dark), 'crab', 'body')
            for j in range(3):
                z = -0.05 + j * 0.05
                put(gtube([(s * 0.11, 0.06, z), (s * 0.19, 0.07, z - 0.012), (s * 0.23, 0.0, z - 0.024)], lambda q: 0.02 - 0.008 * q, K=3, caps=False), flat(dark), 'crab', 'body')
    export_glb('poi-tidepools-%d' % k, place='tidepools')
