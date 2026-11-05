# dg-onsen: the Ice Cavern's set pieces 2-9 (exec'd by build_dg-onsen.py after the hokora; same globals and frame).
# ================================================================== shared: barrels, cloth strips, faceted ice, rocks
def taru(r, h, seed, wd='#8a6a4e', hoops=(0.13, 0.5, 0.87), tag='barrels'):
    """a chunky wooden barrel (game-local: its foot at the origin, axis local +y): bulged staves with dark seams, three
    dark hoops, a sunken lid inside a pale chime rim"""
    rng = random.Random(seed * 7 + 1); K = 16; NS = 8
    tones = [mul(wd, 0.86 + 0.26 * rng.random()) for _ in range(NS)]
    rb = lambda t: r * (0.85 + 0.15 * math.sin(t * PI))
    prof = [(0.0, 0.0), (rb(0) * 0.96, 0.0)] + [(rb(t), t * h) for t in (0.03, 0.22, 0.5, 0.78, 0.97)] + \
           [(rb(1.0), h), (rb(1.0) - 0.024, h), (rb(1.0) - 0.028, h - 0.035), (0.0, h - 0.035)]
    c0 = F.W((0, 0, 0)); up = F.N((0, 1, 0)); e1 = F.N((1, 0, 0)); e2 = F.N((0, 0, 1))
    def col(p, n):
        q = p - c0; ax = q.dot(up); rad = q - up * ax; nu = n.dot(up)
        if ax > h - 0.04 and rad.length < rb(1) - 0.02: return mul(wd, 0.68)
        a = (math.atan2(rad.dot(e2), rad.dot(e1)) / TAU) % 1.0 * NS; i = int(a + 0.25) % NS; f = a - math.floor(a)
        c = tones[i]
        if f < 0.1 or f > 0.9: c = mul(c, 0.62)
        if ax > h - 0.006 or ax < 0.006: c = mix(c, '#d8b48a', 0.4)
        return mul(c, 0.8 + 0.24 * clamp(nu * 0.6 + 0.5))
    add(lathe(prof, K, th0=0.0).xform(F.m @ lm()), col, tag)
    for t in hoops:
        R = rb(t) + 0.009
        add(gloop([(R * math.cos(TAU * k / 14), t * h, R * math.sin(TAU * k / 14)) for k in range(14)], 0.019, K=4),
            lambda p, n: mix('#2e2a32', '#6a6470', clamp(n.dot(up) * 0.6 + 0.45)), tag)
    return rb

def strip_cloth(path, x0, x1, bands, tag='towels', wave=0.012, seed=0, uvy=(1.21, 0.59), nx=3):
    """a hanging cloth (game-local): a draped section path [(y, z)] swept across x0..x1, cut into colour bands along its
    arc length [(s0, s1, colour)] so each stripe has crisp edges (own verts); cloth uvs as the kit's B.cloth"""
    L = [0.0]
    for i in range(1, len(path)): L.append(L[-1] + math.dist(path[i - 1], path[i]))
    def at_s(s):
        for i in range(1, len(path)):
            if s <= L[i] or i == len(path) - 1:
                t = clamp((s - L[i - 1]) / max(1e-9, L[i] - L[i - 1])); a, b = path[i - 1], path[i]
                return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    yT, yB = uvy
    for s0, s1, c in bands:
        ss = [s0] + [s for s in L if s0 < s < s1] + [s1]
        extra = []
        for a, b in zip(ss, ss[1:]):
            n = max(1, int((b - a) / 0.09)); extra += [a + (b - a) * k / n for k in range(n)]
        ss = extra + [s1]
        t = PTmp(); grid = []
        for s in ss:
            y, z = at_s(s); row = []
            for i in range(nx + 1):
                u = i / nx; x = x0 + (x1 - x0) * u
                zz = z + wave * math.sin(u * PI * 1.7 + s * 6 + seed) * (0.4 + 0.6 * clamp((L[-1] - s) / 0.4))
                row.append(t.vert(F.W((x, y, zz))))
            grid.append(row)
        for j in range(len(ss) - 1):
            pa, pb = at_s(ss[j]), at_s(ss[j + 1])
            zm = (pa[1] + pb[1]) / 2
            hint = F.N((0, 0, 1 if zm >= 0 else -1)) if abs(zm) > 0.02 else F.N((0, 1, 0))      # (out of the drape)
            for i in range(nx):
                t.face([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], hint)
        t.normals()
        put(t, lambda p, n, c=c: mul(c, 0.9 + 0.12 * clamp(n.z * 0.5 + 0.5)), tag, 'cloth',
            uv=lambda p: ((p.x - x0) / (x1 - x0), clamp((p.z - yB) / (yT - yB))))

def facet_spike(pos, H, R0, lean=(0.0, 0.0), rot=0.0, seed=0, K=7, rock=0.0, tag='spire', deep=None):
    """a faceted ice spike (game-local foot pos): K irregular facet columns (each its own verts: crisp edges between
    facets), a gentle twist, a pale tip; deep blue at the root, a dark rock core showing at the foot (rock: its height)"""
    rng = random.Random(seed * 53 + 11); deep = deep or P_ICE['ice']
    ts = [0.0, 0.1, 0.26, 0.44, 0.62, 0.78, 0.9]
    jit = [1 + rng.uniform(-0.16, 0.16) for _ in range(K)]
    angs = sorted((TAU * k / K + rng.uniform(-0.18, 0.18)) for k in range(K))
    tw = rng.uniform(0.25, 0.55)
    with at(pos, ry=rot, rx=lean[0], rz=lean[1]):
        def P(i, k):
            t = ts[i]; r = R0 * (1 - t) ** 0.85 * (1 + 0.08 * math.sin(t * 9 + seed)) * jit[k % K]
            a = angs[k % K] + tw * t
            return (r * math.cos(a), t * H - 0.06, r * math.sin(a))
        apex = (0.0, H, 0.0)
        tm = PTmp()
        y_top = F.W(apex).z; y_bot = F.W((0, -0.06, 0)).z
        base_z = F.W((0, 0, 0)).z
        def Pm(i, k):          # the facet's mid-line, a touch proud: each facet a shallow gem ridge (two planes)
            a_, b_ = Vector(P(i, k)), Vector(P(i, k + 1)); m = (a_ + b_) / 2
            q = Vector((m.x, 0, m.z)); return tuple(m + q * 0.12)
        for k in range(K):
            col_ids = [(tm.vert(F.W(P(i, k))), tm.vert(F.W(Pm(i, k))), tm.vert(F.W(Pm(i, k))), tm.vert(F.W(P(i, k + 1)))) for i in range(len(ts))]   # (the mid-line split: a crisp ridge)
            ap = tm.vert(F.W(apex))
            mid = (Vector(P(0, k)) + Vector(P(0, k + 1))) / 2; hint = F.N((mid.x, 0.3 * R0, mid.z))
            for i in range(len(ts) - 1):
                (a0, m0, n0, b0), (a1, m1, n1, b1) = col_ids[i], col_ids[i + 1]
                tm.face([a0, m0, m1, a1], hint); tm.face([n0, b0, b1, n1], hint)
            a0, m0, n0, b0 = col_ids[-1]; tm.face([a0, m0, ap], hint); tm.face([n0, b0, tm.vert(F.W(apex))], hint)
        tm.normals()
        rk = rock
        def f(p, n):
            t = clamp((p.z - y_bot) / max(1e-6, (y_top - y_bot)))
            c = mix(P_ICE['dk'], deep, clamp(t * 4.0))
            c = mix(c, P_ICE['lt'], clamp((t - 0.3) * 1.5) * 0.85)
            if t > 0.8: c = mix(c, P_ICE['hi'], (t - 0.8) * 4.2)
            band = 0.5 + 0.5 * math.sin(t * 22 + seed)          # faint frozen growth bands
            c = mix(c, P_ICE['hi'], 0.1 * band * clamp(t * 2))
            if rk > 0 and (p.z - base_z) < rk * (0.75 + 0.5 * vnoise(p, 3.0, seed)): c = mix(c, '#3a4458', 0.75)
            return mul(c, 0.86 + 0.3 * clamp(-n.x * 0.3 - n.y * 0.45 + n.z * 0.45 + 0.42))
        add(tm, f, tag)

def rock_lump(pos, r, h, seed=0, tag='rock', K=9, snow=0.5):
    """a dark cavern rock with snow lying on its upper faces (painted)"""
    ph = seed * 1.3
    t = lathe([(0.0, -0.05), (0.98, -0.05), (1.0, 0.3), (0.84, 0.66), (0.5, 0.92), (0.0, 1.0)], K, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + 0.14 * math.sin(2 * th + ph) + 0.08 * math.sin(5 * th + seed)))
    t.xform(F.m @ lm(pos, ry=seed * 0.7, s=(r, h, r * 0.9)))
    def f(p, n):
        c = mix('#3e4658', '#6c788e', clamp(n.z * 0.5 + 0.45)); c = mul(c, 0.92 + 0.14 * vnoise(p, 4.0, seed))
        k = (n.z - 0.5 + (vnoise(p, 3.0, seed + 4) - 0.5) * 0.6) * 4.0
        return mix(c, SNOW(p, n), clamp(k * snow * 1.6)) if k > 0 else c
    add(t, f, tag)

# ================================================================== 2. the frozen barrels (kit frozenBarrels: ~1.6 x 1.3 x 0.63)
def build_frozenBarrels():
    new_asset(); rng = random.Random(11)
    for k, (x, z, s, yaw) in enumerate([(-0.32, -0.05, 1.0, 0.4), (0.36, 0.08, 0.86, 1.9)]):
        r, h = 0.24 * s, 0.5 * s
        with at((x, 0, z), ry=yaw):
            rb = taru(r, h, seed=k + 1, wd=('#8a6a4e', '#7e604a')[k])
            snow_cap(rb(1.0) + 0.006, rb(1.0) + 0.006, h, seed=20 + k, cover=1.04, drips=4, dlen=(0.16, 0.3), th=0.065, rho=0.03,
                     p=2.0, n=24, tag='barrelSnow')
            pillow((0.02, h + 0.035, -0.01), rb(1.0) * 0.72, 0.5, 30 + k, 1.0, 0.92, K=12, J=5, tag='barrelSnow', fine=False)
            for j in range(7):
                a = j / 7 * TAU + rng.uniform(-0.25, 0.25); L = 0.1 + 0.17 * rng.random() ** 1.3
                rr = rb(0.97) + 0.022
                icicle(rr * math.cos(a), h - 0.02, rr * math.sin(a), L * s)
    # the third barrel lying on its side at the front, a snow saddle along it
    r, h = 0.24 * 0.72, 0.5 * 0.72
    with at((0.0, 0.0, 0.5), ry=1.35):
        with at((h / 2, r - 0.012, 0.0), rz=PI / 2):
            with at((0, 0, 0), ry=0.3):
                taru(r, h, seed=5, wd='#86664c')
        sn = [(x, 2 * r - 0.03 + 0.01 * math.sin(x * 20), 0.012 * math.sin(x * 13)) for x in (-0.14, -0.07, 0.0, 0.07, 0.14)]
        put(gtube(sn, lambda u: 0.05 * (0.6 + 0.4 * math.sin(PI * u) ** 0.5), K=8), SNOW, 'saddle', 'body')
        pillow((-0.03, 2 * r - 0.01, 0.02), 0.09, 0.55, 41, 1.6, 1.2, K=10, J=4, tag='saddle', fine=False)
        drift((0.0, 0.0, 0.16), 0.2, 0.06, seed=44, sx=1.4, sz=0.7)
    # the oke beside them, snow heaped in it
    with at((0.62, 0, -0.42), ry=0.4):
        oke_bucket(0.14, 0.18, seed=3, K=14)
        pillow((0.0, 0.17, 0.0), 0.125, 0.55, 51, K=10, J=4, tag='okeSnow', fine=False)
        icicle(0.14, 0.16, 0.02, 0.06); icicle(-0.05, 0.16, 0.135, 0.08)
    # drifts banked behind and between, ice chips
    for k, (x, z, r_, h_, sx_) in enumerate([(-0.5, -0.36, 0.32, 0.17, 1.3), (0.05, -0.3, 0.3, 0.13, 1.2), (0.5, -0.36, 0.28, 0.12, 1.2),
                                              (-0.62, 0.3, 0.17, 0.07, 1.2)]):
        drift((x, 0.0, z), r_, h_, seed=60 + k, sx=sx_, sz=0.85, K=14)
    for k, (x, z, hh, ln) in enumerate([(0.42, 0.52, 0.14, (0.4, -0.35)), (0.5, 0.42, 0.09, (-0.3, -0.6)), (-0.55, 0.42, 0.11, (0.35, 0.4))]):
        ice_crystal((x, 0.0, z), hh, 0.038, lean=ln, rot=k * 1.3)
    return dict()

# ================================================================== 3. the bath deck (kit bathDeck: 1.7 x 1.3 sunoko)
def build_bathDeck():
    new_asset(); rng = random.Random(17)
    for x in (-0.72, 0.0, 0.72):
        put(beam(0.09, 0.065, 1.3, (x, 0.032, 0), c=0.016), wood('#5e4434', ao_z=0.0), 'bearers', 'body')
    tones = ['#b88a5e', '#a87c52', '#c0946a', '#b08258']
    for i in range(9):
        z = -0.56 + i * 0.14 + rng.uniform(-0.006, 0.006)
        put(box(1.7 + rng.uniform(-0.03, 0.03), 0.042, 0.112, (rng.uniform(-0.015, 0.015), 0.086, z), r=0.012, ry=rng.uniform(-0.012, 0.012)),
            lambda p, n, c=tones[i % 4], i=i: mul(c, (1.0 if n.z > 0.7 else 0.8) * (0.94 + 0.1 * vnoise(Vector((p.x * 4, p.y * 30, 0.0)), 1.0, i))), 'slats', 'body')
        for x in (-0.72, 0.72):                 # (dark pegs over the bearers)
            put(cyl(0.014, 0.014, 0.008, (x, 0.108, z), K=5), flat('#5a4030'), 'pegs', 'body')
    # the water oke with its ladle across, the stacked pair, the stool with a folded towel
    with at((-0.45, 0.107, -0.15), ry=0.3):
        oke_bucket(0.15, 0.18, water=True, seed=1, lugs=True, K=16)
        with at((0.0, 0.2, 0.0), ry=2.4):
            put(gtube([(-0.17, 0.0, 0.0), (0.2, 0.0, 0.0)], 0.017, K=5), wood('#d8b07a'), 'ladle', 'body')
            put(glathe([(0.0, 0.0), (0.05, 0.0), (0.056, 0.065), (0.046, 0.065), (0.042, 0.009), (0.0, 0.009)], 10, pos=(0.25, -0.03, 0.0)), wood('#c99e6c'), 'ladle', 'body')
    with at((-0.12, 0.107, 0.28), ry=-0.5):
        oke_bucket(0.13, 0.16, seed=2, K=14)
        with at((0.01, 0.125, 0.0), ry=0.4):
            oke_bucket(0.115, 0.14, seed=3, K=14)
        pillow((0.0, 0.245, 0.0), 0.075, 0.5, 9, K=10, J=4, tag='snowDab', fine=False)
    with at((0.45, 0.107, 0.0), ry=0.2):
        put(beam(0.44, 0.05, 0.27, (0, 0.245, 0), c=0.016), wood('#c8996a', seed=3), 'stool', 'body')
        for sxl in (-1, 1):
            put(box(0.055, 0.225, 0.24, (sxl * 0.16, 0.11, 0), r=0.014), wood('#a87a50', ao_z=0.0), 'stool', 'body')
        put(box(0.3, 0.036, 0.04, (0, 0.06, 0), r=0.0), wood('#966a46'), 'stool', 'body')
        # the folded tenugui: white, two indigo stripes, one end hanging over the edge
        put(box(0.3, 0.045, 0.18, (0.02, 0.292, 0.0), r=0.016), soft('#f2f0ec', 0.15), 'towel', 'body')
        for zz in (-0.045, 0.045):
            put(box(0.302, 0.047, 0.03, (0.02, 0.292, zz), r=0.0), soft('#3a6ec0', 0.15), 'towel', 'body')
        put(box(0.03, 0.12, 0.18, (0.178, 0.24, 0.0), r=0.01, rz=0.12), soft('#f2f0ec', 0.15), 'towel', 'body')
    # snow drifted along the back edge, creeping onto the slats; a dusting at one corner
    for k, (x, z, r_, h_, sx_) in enumerate([(-0.78, -0.66, 0.26, 0.14, 1.3), (0.02, -0.7, 0.24, 0.11, 1.4), (0.8, -0.64, 0.24, 0.13, 1.2),
                                              (0.95, 0.3, 0.16, 0.08, 0.8)]):
        drift((x, 0.0, z), r_, h_, seed=70 + k, sx=sx_, sz=0.8)
    for k, (x, z, r_) in enumerate([(-0.6, -0.5, 0.12), (0.62, -0.52, 0.11), (0.8, 0.5, 0.08)]):
        pillow((x, 0.105, z), r_, 0.3, 80 + k, 1.5, 0.9, K=10, J=4, tag='deckSnow', fine=False)
    return dict()

# ================================================================== 4. the towel rack (kit towelRack: 1.38 x 1.3)
def build_towelRack():
    new_asset(); rng = random.Random(23)
    for sx in (-1, 1):
        x = sx * 0.6
        put(beam(0.18, 0.07, 0.3, (x, 0.035, 0), c=0.018), wood('#5a3e2e', ao_z=0.0), 'feet', 'body')
        put(gtube([(x, 0.05, 0.0), (x, 0.7, 0.0), (x, 1.3, 0.0)], lambda u: 0.05 - 0.01 * u, K=8), wood('#6a4a36', seed=sx + 2), 'posts', 'body')
        put(sph(0.05, (x, 1.31, 0.0), sc=(1.0, 0.6, 1.0), K=8, J=3), wood('#7a5640'), 'posts', 'body')
        for sz in (-1, 1):
            put(gtube([(x, 0.07, sz * 0.13), (x, 0.3, sz * 0.035)], 0.022, K=5), wood('#5a3e2e'), 'braces', 'body')
        pillow((x, 1.33, 0.0), 0.075, 0.6, 30 + sx, K=9, J=4, tag='snow', fine=False)
        for sz in (-1, 1):
            drift((x + rng.uniform(-0.05, 0.05), 0.0, sz * 0.2), 0.14, 0.07, seed=40 + sx + sz, sx=1.2, sz=0.8)
    # the rail: a dried bamboo pole through the posts, node rings
    put(gtube([(-0.69, 1.22, 0.0), (0.69, 1.22, 0.0)], 0.032, K=8), lambda p, n: mix('#a8a060', '#e0d898', clamp(n.z * 0.5 + 0.5)), 'rail', 'body')
    for x in (-0.66, -0.2, 0.2, 0.66):
        put(gloop([(x, 1.22 + 0.035 * math.sin(TAU * k / 8), 0.035 * math.cos(TAU * k / 8)) for k in range(8)], 0.009, K=3), flat('#8a8248'), 'rail', 'body')
    # snow along the rail's top, a few icicles
    sn = [(x, 1.255 + 0.006 * math.sin(x * 17), 0.004 * math.sin(x * 9)) for x in (-0.64, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.64)]
    put(gtube(sn, lambda u: 0.03 + 0.01 * math.sin(u * 19) ** 2, K=7), SNOW, 'railSnow', 'body')
    for x, L in ((-0.6, 0.07), (0.19, 0.09), (0.57, 0.06)):
        icicle(x, 1.19, 0.01, L)
    # three tenugui hung over the rail (white with indigo stripes, one red with a pale band): a short back fall, the fold
    # round the rail, the long front fall to the kit's hem (y 0.59)
    R0 = 0.045
    path = [(0.9, -0.044), (1.06, -0.046), (1.18, -0.043)] + [(1.22 + R0 * math.sin(a), -R0 * math.cos(a)) for a in (1.2, 0.6, 0.0, -0.6, -1.2)] + \
           [(1.18, 0.044), (1.04, 0.05), (0.86, 0.056), (0.7, 0.054), (0.59, 0.05)]
    path = [(y, z) for (y, z) in path]
    # (the fold: angle a measured from the top; z = -R0 cos(a) runs back -> front through the top as a goes 1.2 -> -1.2)
    path[3:8] = [(1.22 + R0 * math.cos(a), R0 * math.sin(a)) for a in (-1.2, -0.6, 0.0, 0.6, 1.2)]
    Ls = [0.0]
    for i in range(1, len(path)): Ls.append(Ls[-1] + math.dist(path[i - 1], path[i]))
    Lt = Ls[-1]
    for i, x in enumerate((-0.38, 0.0, 0.38)):
        x0, x1 = x - 0.15, x + 0.15
        if i < 2:
            W, B = '#f2f0ec', ('#3a6ec0', '#2e5ca8')[i]
            cuts = [0.06, 0.09, 0.13, 0.15, 0.5, 0.53]               # (stripes, measured up from the bottom hem)
            bands = []; prev = 0.0
            for j in range(0, len(cuts), 2):
                bands.append((Lt - cuts[j], Lt - prev, W)); bands.append((Lt - cuts[j + 1], Lt - cuts[j], B)); prev = cuts[j + 1]
            bands.append((0.0, Lt - prev, W))
        else:
            Rd, Pa = '#e04a40', '#ffd0c0'
            bands = [(Lt - 0.44, Lt, Rd), (Lt - 0.5, Lt - 0.44, Pa), (0.0, Lt - 0.5, Rd)]
        strip_cloth(path, x0, x1, bands, tag='towels', seed=i * 2.1, uvy=(1.21, 0.59))
    return dict()

# ================================================================== 5. the snow monkey (kit snowMonkey: y = 0 at the water)
def build_snowMonkey():
    new_asset()
    fur, furL, furD = '#9c8c80', '#c4b6a8', '#6e6058'
    face, faceD = '#f09a8a', '#d0786c'
    def furc(seed):
        def f(p, n):
            c = mix(furD, fur, clamp(n.z * 0.6 + 0.55)); c = mix(c, furL, smooth(0.55, 1.0, n.z) * 0.5)
            return mul(c, 0.94 + 0.1 * vnoise(p, 14.0, seed))
        return f
    # the shoulders: a fluffy lobed mound rising out of the water
    t = lathe([(0.0, -0.1), (0.25, -0.1), (0.255, 0.0), (0.24, 0.05), (0.21, 0.1), (0.15, 0.145), (0.07, 0.165), (0.0, 0.17)], 18, th0=0.2,
              rfn=lambda rr, z, th: rr * (1 + 0.07 * math.sin(7 * th) * clamp(z * 6 + 0.6)))
    t.xform(F.m @ lm((0, 0.0, 0.0), s=(1.1, 1.0, 1.0)))
    add(t, furc(1), 'body')
    # the head with a ruff of fur tufts round the face
    put(sph(0.17, (0, 0.28, 0.01), sc=(1.04, 0.96, 0.98), K=16, J=10), furc(2), 'head', 'body')
    for k in range(9):
        a = -PI * 0.92 + k * (PI * 1.84 / 8)
        x, y = 0.122 * math.cos(a + PI / 2), 0.272 + 0.118 * math.sin(a + PI / 2) * 0.95
        put(sph(0.058, (x * 1.1, y, 0.095), sc=(1.0, 0.9, 0.72), K=9, J=5), furc(3 + k), 'ruff', 'body')
    # the heart-shaped pink face (well proud of the head and ruff), the muzzle, closed happy eyes, blushes, nose, a smile
    FZ = 0.035
    def facec(p, n): return mix(faceD, face, clamp(n.z * 0.4 - n.y * 0.5 + 0.35))
    put(sph(0.108, (0, 0.268, 0.12 + FZ), sc=(1.12, 1.0, 0.55), K=14, J=8), facec, 'face', 'body')
    for sx in (-1, 1):
        put(sph(0.052, (sx * 0.044, 0.313, 0.135 + FZ), sc=(1.0, 0.8, 0.5), K=8, J=4), facec, 'face', 'body')
    put(sph(0.042, (0, 0.238, 0.16 + FZ), sc=(1.25, 0.8, 0.5), K=10, J=5), facec, 'face', 'body')
    for sx in (-1, 1):
        put(gtube([(sx * 0.064, 0.287, 0.174 + FZ), (sx * 0.046, 0.299, 0.183 + FZ), (sx * 0.027, 0.289, 0.18 + FZ)], 0.0095, K=4), flat('#3a2624'), 'eyes', 'body')
        put(sph(0.026, (sx * 0.078, 0.25, 0.168 + FZ), sc=(1.0, 0.6, 0.4), K=7, J=3), flat('#ff9c9c'), 'blush', 'body')
        put(sph(0.045, (sx * 0.16, 0.285, 0.0), sc=(0.55, 1.0, 0.9), K=8, J=4), lambda p, n: mix(faceD, '#f4aa9a', clamp(n.z * 0.5 + 0.5)), 'ears', 'body')
    put(gtube([(-0.02, 0.226, 0.178 + FZ), (0.0, 0.219, 0.182 + FZ), (0.02, 0.226, 0.178 + FZ)], 0.0075, K=4), flat('#9a4a44'), 'mouth', 'body')
    put(sph(0.012, (0.0, 0.258, 0.178 + FZ), sc=(1.4, 0.8, 0.8), K=6, J=3), flat('#c86a62'), 'nose', 'body')
    # the arms resting on the water, pink hands
    for sx in (-1, 1):
        put(gtube([(sx * 0.17, 0.06, 0.05), (sx * 0.2, 0.035, 0.13), (sx * 0.19, 0.02, 0.2)], lambda u: 0.055 - 0.012 * u, K=8), furc(20 + sx), 'arms', 'body')
        put(sph(0.04, (sx * 0.185, 0.018, 0.235), sc=(1.0, 0.55, 1.15), K=8, J=4), facec, 'hands', 'body')
    # the snow cap on its head (and dabs on the shoulders)
    pillow((0.0, 0.43, -0.005), 0.115, 0.5, 5, 1.15, 1.05, K=16, J=6, tag='snow', fine=False)
    return dict()

# ================================================================== 6. the ice spire (kit iceSpire: 2.5 m spike + twin)
def build_iceSpire(v):
    new_asset(); rng = random.Random(91 + v * 13); sg = 1 if v == 0 else -1
    rock_lump((0.0, 0.0, 0.0), 0.62, 0.36, seed=3 + v, snow=0.3)
    if v == 0:
        facet_spike((0.0, 0.1, 0.0), 2.45, 0.46, lean=(0.03, 0.05), rot=0.4, seed=1, K=7, rock=0.32)
        facet_spike((0.4, 0.06, 0.2), 1.3, 0.25, lean=(0.12, -0.34), rot=1.3, seed=2, K=6)
        facet_spike((-0.3, 0.04, 0.34), 0.78, 0.17, lean=(0.42, 0.38), rot=2.0, seed=3, K=6)
    else:
        facet_spike((0.0, 0.1, 0.0), 2.35, 0.48, lean=(-0.04, -0.04), rot=1.7, seed=11, K=7, rock=0.3)
        facet_spike((-0.42, 0.06, 0.12), 1.5, 0.26, lean=(0.06, 0.36), rot=0.2, seed=12, K=6)
        facet_spike((0.34, 0.04, 0.3), 0.66, 0.16, lean=(0.4, -0.44), rot=2.6, seed=13, K=5)
        facet_spike((0.1, 0.04, -0.38), 0.9, 0.18, lean=(-0.45, -0.1), rot=0.9, seed=14, K=5)
    # the snow mound round the foot, crystals bursting out round it
    drift((0.0, 0.0, 0.0), 0.8, 0.26, seed=20 + v, sx=1.05, sz=0.95, K=14)
    for q in range(5):
        a = q / 5 * TAU + rng.uniform(-0.3, 0.3) + v * 0.6; d = 0.72 + rng.uniform(0.0, 0.2); hh = 0.18 + rng.uniform(0.0, 0.26)
        ice_crystal((math.cos(a) * d, 0.0, math.sin(a) * d), hh, 0.05, lean=(math.sin(a) * 0.5, -math.cos(a) * 0.5), rot=a)
        if q % 2 == 0:
            ice_crystal((math.cos(a + 0.2) * (d - 0.1), 0.0, math.sin(a + 0.2) * (d - 0.1)), hh * 0.55, 0.035, lean=(math.sin(a + 0.4) * 0.7, -math.cos(a + 0.4) * 0.7), rot=a + 1)
    for q in range(4):
        a = rng.uniform(0, TAU)
        drift((math.cos(a) * 0.95, 0.0, math.sin(a) * 0.88), 0.24 + rng.uniform(0, 0.1), 0.09, seed=30 + q + v * 5, sx=1.3, sz=0.8, ry=a)
    pillow((0.22 * sg, 0.42, 0.12), 0.14, 0.45, 40 + v, 1.2, 1.0, K=10, J=4, tag='snow', fine=False)
    return dict(v=v)

# ================================================================== 7. the cold brazier (kit coldBrazier: r 0.32, h 0.75)
def build_coldBrazier():
    new_asset()
    iron = lambda seed=0: lambda p, n: mul(mix('#2e2c34', '#6a6672', clamp(n.z * 0.55 + 0.45)), 0.94 + 0.12 * vnoise(p, 6.0, seed))
    for i in range(3):
        a = i / 3 * TAU + PI / 2; c, s = math.cos(a), math.sin(a)
        Q = lambda r, y, c=c, s=s: (c * r, y, s * r)
        put(gtube([Q(0.18, 0.46), Q(0.22, 0.32), Q(0.26, 0.14), Q(0.3, 0.04)], lambda u: 0.042 - 0.008 * u, K=6), iron(i), 'legs', 'body')
        put(sph(0.05, Q(0.305, 0.035), sc=(1.0, 0.75, 1.0), K=8, J=4), iron(i + 3), 'legs', 'body')
    put(gloop([(math.cos(TAU * k / 12) * 0.235, 0.24, math.sin(TAU * k / 12) * 0.235) for k in range(12)], 0.02, K=4), iron(7), 'ring', 'body')
    # the bowl: a thick iron dish with a rolled rim, a little rust
    prof = [(0.0, 0.43), (0.17, 0.44), (0.29, 0.54), (0.33, 0.63), (0.345, 0.655), (0.325, 0.67), (0.3, 0.64), (0.27, 0.57), (0.16, 0.5), (0.0, 0.49)]
    def bowlc(p, n):
        c = iron(8)(p, n)
        if vnoise(p, 9.0, 4) > 0.66: c = mix(c, '#7a4a36', 0.45)
        if p.z > 0.65 and n.z > 0.2: c = mix(c, '#8a8694', 0.4)
        return c
    put(glathe(prof, 16), bowlc, 'bowl', 'body')
    for a in (0.3, 0.3 + PI):                                   # two ring handles
        put(gloop([(math.cos(a) * (0.37 + 0.04 * math.cos(TAU * k / 8)), 0.6 + 0.04 * math.sin(TAU * k / 8), math.sin(a) * (0.37 + 0.04 * math.cos(TAU * k / 8))) for k in range(8)], 0.012, K=4), iron(9), 'bowl', 'body')
    # dead coals and grey ash showing at the rim where the snow is thin
    rng = random.Random(5)
    for k in range(7):
        a = rng.uniform(-1.2, 1.4) + PI / 2; d = rng.uniform(0.18, 0.27)
        put(sph(rng.uniform(0.04, 0.06), (math.cos(a) * d, 0.6 + rng.uniform(-0.01, 0.02), math.sin(a) * d), sc=(1.0, 0.7, 0.9), K=6, J=3),
            lambda p, n, k=k: mix('#26222a', '#5a5662' if k % 3 else '#a8a4ae', clamp(n.z * 0.6 + 0.3)), 'coals', 'body')
    # the snow heaped over it: a domed cap rolling over the rim, drips, icicles, drifts at the feet
    snow_cap(0.3, 0.3, 0.62, seed=9, cover=0.93, drips=3, dlen=(0.08, 0.16), th=0.07, rho=0.035, p=2.0, n=30, tag='snow', icicles=2, ilen=(0.06, 0.1))
    pillow((-0.02, 0.66, -0.04), 0.22, 0.5, 11, 1.0, 0.95, K=14, J=6, tag='snow', fine=False)
    pillow((0.06, 0.74, -0.06), 0.11, 0.55, 12, K=10, J=4, tag='snow', fine=False)
    for i in range(3):
        a = i / 3 * TAU + PI / 2
        if i != 1: drift((math.cos(a) * 0.32, 0.0, math.sin(a) * 0.32), 0.11, 0.05, seed=20 + i, sx=1.2, sz=0.9, ry=a)
    return dict()

# ================================================================== 8. the store pile (kit storePile: ~2.5 x 1.2)
def sack(r=0.18, h=None, col='#e8dcc4', seed=0, tag='sacks'):
    """a plump cloth sack, its neck tied with straw rope, a frilled top"""
    h = h or r * 1.7; ph = seed * 1.1
    prof = [(0.0, 0.0), (r * 0.82, 0.0), (r, h * 0.18), (r * 1.02, h * 0.42), (r * 0.86, h * 0.66), (r * 0.42, h * 0.84), (r * 0.26, h * 0.88), (0.0, h * 0.89)]
    t = lathe(prof, 12, th0=ph, rfn=lambda rr, z, th: rr * (1 + 0.07 * math.sin(3 * th + ph) + 0.05 * math.sin(5 * th + z * 9)))
    t.xform(F.m @ lm())
    put(t, lambda p, n: mul(mix(mul(col, 0.74), col, clamp(n.z * 0.55 + 0.5)), 0.95 + 0.08 * vnoise(p, 10.0, seed)), tag, 'body')
    put(glathe([(0.0, h * 0.86), (r * 0.3, h * 0.88), (r * 0.42, h * 1.0), (r * 0.26, h * 1.05), (0.0, h * 1.0)], 9, rfn=lambda rr, z, th: rr * (1 + 0.2 * math.sin(6 * th))),
        lambda p, n: mix(mul(col, 0.8), col, clamp(n.z * 0.5 + 0.5)), tag, 'body')
    put(gloop([(r * 0.29 * math.cos(TAU * k / 8), h * 0.87, r * 0.29 * math.sin(TAU * k / 8)) for k in range(8)], 0.018, K=4), rope_col(lambda p, n: p.x * 90 + p.y * 90), tag, 'body')
    return h

def build_storePile():
    new_asset(); rng = random.Random(29)
    # the roofed firewood rack (kit firewood w 1.2, h 0.62, d 0.34 at z -0.1): posts, a plank roof under snow, split logs
    w, h, d = 1.2, 0.62, 0.34
    with at((0, 0, -0.1)):
        for sx in (-1, 1):
            for sz in (-1, 1):
                hh = h + 0.1 + (0.0 if sz < 0 else -0.06)
                put(beam(0.065, hh, 0.065, (sx * (w / 2 + 0.035), hh / 2, sz * (d / 2 + 0.01)), c=0.014), wood('#5a4032', ao_z=0.0), 'rack', 'body')
        put(beam(w + 0.12, 0.05, d + 0.04, (0, 0.025, 0), c=0.012), wood('#6a4a36'), 'rack', 'body')
        nx, ny = 7, 5
        for j in range(ny):
            for i in range(nx - (j % 2)):
                x = -w / 2 + 0.075 + (i + 0.5 * (j % 2)) * (w - 0.15) / (nx - 1) + rng.uniform(-0.008, 0.008)
                y = 0.11 + j * 0.112; r = rng.uniform(0.064, 0.072); L = d * rng.uniform(0.92, 1.06); dz = rng.uniform(-0.025, 0.025)
                log_piece((x, y, -L / 2 + dz), (x, y, L / 2 + dz), r, K=5, seed=i * 7 + j, tag='firewood')
        with at((0, h + 0.11, 0.0), rx=0.22):
            for k in range(4):
                put(beam(w + 0.22, 0.04, (d + 0.24) / 4 - 0.008, (0, 0, -(d + 0.24) / 2 + (k + 0.5) * (d + 0.24) / 4), c=0.01),
                    wood(mul('#6e5040', 0.94 + 0.05 * (k % 2)), seed=k), 'roof', 'body')
            rd = [(th, rng.uniform(0.1, 0.16), rng.uniform(0.3, 0.42)) for th in (PI / 2 - 0.5, PI / 2 + 0.7)]
            he = drip_he(lambda th: 0.9 + 0.05 * math.sin(3 * th + 0.4) + 0.04 * math.sin(7 * th), rd)
            rect_icing((w + 0.22) / 2, (d + 0.24) / 2, 0.02, he, lambda th, s: 0.1 * (1 - 0.45 * s * s) * (1 + 0.2 * math.sin(4 * th) * (1 - s)),
                       (0, 0.0, 0), ths=drip_angles(30, rd, offs=(-0.7, 0.0, 0.7), min_gap=0.05), rho=0.02)
            for k in range(3):
                pillow(((k - 1) * 0.42, 0.09, 0.0), 0.2, 0.32, 5 + k, 1.2, 0.85, K=12, J=5, tag='roofSnow', fine=False)
            for k, x in enumerate((-0.48, -0.1, 0.25, 0.55)):
                icicle(x, -0.02, (d + 0.24) / 2 + 0.01, 0.07 + 0.06 * (k % 2))
    # the crate (kit [1.0, 0, 0.3], s 0.42): a planked box with dark corner battens, snow on the lid
    with at((1.0, 0, 0.3), ry=0.3):
        s = 0.42
        put(box(s, s, s, (0, s / 2, 0), r=0.02), wood('#a88a64', ao_z=0.0), 'crate', 'body')
        for k in range(1, 4):            # (plank seams on the faces the camera sees)
            put(box(s + 0.008, 0.014, s + 0.008, (0, k * s / 4, 0), r=0.0), flat('#7a5c40'), 'crate', 'body')
        for sx in (-1, 1):
            for sz in (-1, 1):
                put(beam(0.055, s + 0.01, 0.055, (sx * (s / 2 - 0.012), s / 2, sz * (s / 2 - 0.012)), c=0.01), wood('#6e5038'), 'crate', 'body')
        for yy in (0.03, s - 0.03):
            put(box(s + 0.014, 0.05, s + 0.014, (0, yy, 0), r=0.0), wood('#6e5038'), 'crate', 'body')
        snow_cap(s / 2 + 0.01, s / 2 + 0.01, s + 0.0, seed=17, cover=0.9, drips=3, dlen=(0.06, 0.12), th=0.07, rho=0.02, n=24, tag='crateSnow', icicles=2)
        pillow((0.03, s + 0.04, -0.02), 0.14, 0.5, 18, K=10, J=4, tag='crateSnow', fine=False)
    # the sacks (kit [-1.0, 0, 0.32] r 0.18 and [+0.3, 0, 0.12] r 0.15), snow on their shoulders
    with at((-1.0, 0, 0.32), ry=-0.2):
        hs = sack(0.18, col='#e8dcc4', seed=1)
        pillow((0.02, hs * 0.74, -0.03), 0.13, 0.42, 21, 1.1, 1.0, K=10, J=4, tag='sackSnow', fine=False)
        with at((0.3, 0, 0.12), ry=0.6):
            hs2 = sack(0.15, col='#d8c8a8', seed=2)
            pillow((0.0, hs2 * 0.76, 0.0), 0.1, 0.42, 22, K=9, J=4, tag='sackSnow', fine=False)
    # drifts in front and banked against the rack's back
    for k, (x, z, r_, h_, sx_) in enumerate([(-0.9, 0.62, 0.34, 0.17, 1.3), (0.05, 0.58, 0.3, 0.15, 1.4), (0.88, 0.68, 0.26, 0.15, 1.2),
                                              (-0.45, -0.38, 0.3, 0.16, 1.5), (0.45, -0.38, 0.3, 0.14, 1.4)]):
        drift((x, 0.0, z), r_, h_, seed=40 + k, sx=sx_, sz=0.8, K=10 if z < 0 else 16)
    return dict()

# ================================================================== 9. the lantern post (kit lanternPost: a chochin at [0.4, 1.6, 0])
def build_lanternPost():
    new_asset()
    # the stone footing, the timber post, the arm with a knee brace
    put(glathe([(0.0, 0.0), (0.17, 0.0), (0.19, 0.05), (0.16, 0.12), (0.1, 0.15), (0.0, 0.15)], 8,
               rfn=lambda rr, z, th: rr * (1 + 0.07 * math.sin(3 * th + 1) + 0.04 * math.sin(5 * th))), cstone('#7a8294', seed=3, snow=0.4, up=0.55), 'foot', 'body')
    put(beam(0.1, 1.62, 0.1, (0, 0.12 + 0.81, 0), c=0.022), wood('#5e4434', ao_z=0.12, seed=1), 'post', 'body')
    put(box(0.14, 0.04, 0.14, (0, 1.755, 0), r=0.012), wood('#4a3428'), 'post', 'body')
    put(beam(0.56, 0.07, 0.07, (0.24, 1.63, 0), c=0.016), wood('#5e4434', seed=2), 'arm', 'body')
    put(gtube([(0.04, 1.42, 0.0), (0.2, 1.6, 0.0)], 0.024, K=5), wood('#4e3a2e'), 'arm', 'body')
    put(cyl(0.012, 0.012, 0.05, (0.4, 1.575, 0), K=4), flat('#2e2a30'), 'hook', 'body')
    # the red paper chochin: dark caps, ribbed paper (glow, its own colour), a gold tassel
    with at((0.4, 1.55, 0.0)):
        y0 = 0.0; r = 0.155; hh = 0.32
        put(cyl(r * 0.52, r * 0.6, 0.05, (0, y0 - 0.025, 0), K=10), soft('#2a2226', 0.3), 'lanternCaps', 'body')
        N = 9; pts = []
        for k in range(N + 1):
            tt = k / N
            rr = r * (0.5 + 0.5 * math.sin(tt * PI)) * (1 + (0.04 if k % 2 else 0.0))
            pts.append((rr if 0 < k < N else 0.0, y0 - 0.05 - tt * hh))
        pts = pts[::-1]
        cc = '#e04a3a'; dark = mul(cc, 0.7); light = mix(cc, '#fff0d0', 0.3)
        top_z = F.W((0, y0 - 0.05, 0)).z
        def pc(p, n):
            tt = clamp((top_z - p.z) / hh)
            if 0.42 < tt < 0.58: return light
            return mix(dark, cc, math.sin(tt * PI))
        put(glathe(pts, 12), pc, 'paper', 'glow', uv=lambda p: (1.0, 0.55))
        put(cyl(r * 0.6, r * 0.52, 0.05, (0, y0 - 0.05 - hh - 0.02, 0), K=10), soft('#2a2226', 0.3), 'lanternCaps', 'body')
        put(cyl(0.016, 0.034, 0.11, (0, y0 - 0.05 - hh - 0.095, 0), K=6), lac('#f0bc4a', '#ffe08a', '#b0802a'), 'tassel', 'body')
        pillow((0.0, y0 + 0.005, 0.0), 0.06, 0.55, 3, K=8, J=3, tag='snow', fine=False)
    # snow: a cap on the post top, a roll along the arm, icicles off it, drifted round the foot
    pillow((0.0, 1.78, 0.0), 0.095, 0.62, 5, 1.0, 1.0, K=10, J=4, tag='snow', fine=False)
    put(gtube([(x, 1.68 + 0.004 * math.sin(x * 30), 0.0) for x in (0.06, 0.18, 0.3, 0.44)], lambda u: 0.034 + 0.012 * math.sin(u * 7) ** 2, K=7), SNOW, 'snow', 'body')
    for x, L in ((0.13, 0.07), (0.27, 0.1), (0.47, 0.06)):
        icicle(x, 1.6, 0.0, L)
    pillow((0.0, 0.14, 0.0), 0.15, 0.4, 7, 1.1, 1.0, K=10, J=4, tag='snow', fine=False)
    for k, (a, r_) in enumerate(((0.4, 0.17), (2.6, 0.14), (4.4, 0.15))):
        drift((math.cos(a) * 0.24, 0.0, math.sin(a) * 0.24), r_, 0.06, seed=10 + k, sx=1.3, sz=0.8, ry=a)
    return dict(paper=[0.4, 1.31, 0.0])
