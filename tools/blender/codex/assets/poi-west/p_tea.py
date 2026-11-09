# The Bamboo Tea Garden: poi-tea-0 (kit call 0 of pois/tea.js: y0 = 0.1) and poi-tea-1 (the deer scarer's moving tube, its pivot at y = 1).
# What stays the kit's: the scarer's pour (kit call 2), the lights, the walkable floor (flat at FT), the colliders.
ROOF_G = '#7f9f70'; ROOF_HI = '#a8c490'; ROOF_D = '#55734c'; TIMBER = '#dca45e'; TIMBER_D = '#b07c4a'; STRAW_C = '#e2c88c'
PAV = dict(x=0.8, z=-2.0, w=3.2, d=3.0); BASIN = (4.0, -0.75); UV_ = (0.75, 0.66)

def wood_c(c, k=0.14, seed=0):
    def f(p, n):
        q = mix(mul(c, 0.78), mix(c, '#ffe6c0', 0.18), clamp(n.z * 0.55 + 0.55))
        return mul(q, 1 - k / 2 + k * vnoise(Vector((p.x * 7, p.y * 7, p.z * 7)), 1.0, seed))
    return f

def rope_band(x, y, z, r, ax=None, K=5, tag='lashing'):
    """a lashing: a fat rope band round a log (axis: y by default, 'x' or 'z' for a beam)"""
    pr = [(r * 0.96, -0.07), (r + 0.03, -0.04), (r + 0.03, 0.04), (r * 0.96, 0.07)]
    rx, rz = (PI / 2, 0.0) if ax == 'z' else ((0.0, PI / 2) if ax == 'x' else (0.0, 0.0))
    t = lathe(pr, K).xform(F.m @ lm((x, y, z), rx=rx, rz=rz))
    put(t, lambda p, n: mix(ROPE_LO, ROPE, clamp(n.z * 0.4 + 0.6)), tag, 'body')

def pavilion(FT, H_):
    P = PAV; hw, hd = P['w'] / 2, P['d'] / 2
    # ---- the floor: chunky planks, a skirt beam, stubby legs on stone pads, a stone step
    NPL = 9
    for i in range(NPL):
        z = -hd + (i + 0.5) * P['d'] / NPL; c0 = ['#d09a60', '#dcaa6c', '#c89058'][i % 3]
        put(beam(P['w'], 0.075, P['d'] / NPL - 0.016, (0, FT - 0.0375, z), c=0.012), lambda p, n, c0=c0: mix(mul(c0, 0.74), mix(c0, '#ffe4b8', 0.12), clamp(n.z)), 'floor', 'body')
    for w, d, x, z in ((P['w'] + 0.1, 0.12, 0, hd), (P['w'] + 0.1, 0.12, 0, -hd), (0.12, P['d'], hw, 0), (0.12, P['d'], -hw, 0)):
        put(beam(w, 0.2, d, (x, FT - 0.17, z), c=0.02), wood_c(TIMBER_D), 'floor', 'body')
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (hw - 0.1), sz * (hd - 0.08); g0 = H_(x, z)
            h = FT - 0.25 - g0 + 0.1
            put(cyl(0.085, 0.095, h, (x, FT - 0.25 - h / 2 + 0.0, z), K=6), wood_c(TIMBER_D), 'floor', 'body')
            put(glathe([(0.0, g0 - 0.08), (0.19, g0 - 0.06), (0.17, g0 + 0.06), (0.0, g0 + 0.09)], K=6, pos=(x, 0, z)), lambda p, n: mix('#8e8690', '#d0c8c8', clamp(n.z * 0.8 + 0.2)), 'floor', 'body')
    put(beam(1.3, 0.2, 0.5, (0, FT - 0.2, hd + 0.3), c=0.04), lambda p, n: mix('#928a94', '#d8d0cc', clamp(n.z * 0.9 + 0.1)), 'floor', 'body')
    # ---- corner posts lashed with rope, the beams with their ends run out past the posts
    PH, px, pz = 2.15, hw - 0.15, hd - 0.15; BY = FT + PH
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * px, sz * pz
            put(glathe([(0.13, FT - 0.05), (0.115, FT + PH + 0.05)], K=8, pos=(x, 0, z)), wood_c(TIMBER, seed=sx + sz), 'posts', 'body')
            rope_band(x, FT + 0.16, z, 0.125); rope_band(x, FT + PH - 0.2, z, 0.118)
    for sz in (-1, 1):
        L = P['w'] + 0.8
        put(gtube([(-L / 2, BY, sz * pz), (0, BY + 0.004, sz * pz), (L / 2, BY, sz * pz)], lambda s: 0.115, K=8), wood_c(TIMBER, 0.2), 'beams', 'body')
        for sx in (-1, 1): rope_band(sx * (px + 0.24), BY, sz * pz, 0.115, ax='x')
    for sx in (-1, 1):
        put(gtube([(sx * px, BY - 0.16, -hd + 0.05), (sx * px, BY - 0.16, hd - 0.05)], lambda s: 0.09, K=6), wood_c(TIMBER_D, 0.2), 'beams', 'body')
    # ---- the roof: a gable, ridge along x: a dark board and curved half-round tile rolls, rounded eave ends, a fat ridge, crossed log ends
    YR, YE, ZL, XL, NT = BY + 0.95, BY + 0.18, hd + 0.5, hw + 0.42, 11
    def yA(u, x=0.0): return YE + (YR - YE) * (1 - u) ** 1.45 + 0.06 * u ** 3 + 0.1 * (abs(x) / XL) ** 3 * u ** 2
    for sz in (-1, 1):
        # the board (top and underside), a little under the rolls
        t = PTmp(); us = [0.0, 0.25, 0.5, 0.75, 1.0]; xs = [-XL, 0.0, XL]; ids = {}
        for i, u in enumerate(us):
            for j, x in enumerate(xs):
                ids[(i, j, 0)] = t.vert(F.W((x, yA(u, x) - 0.05, sz * u * ZL)))
                ids[(i, j, 1)] = t.vert(F.W((x, yA(u, x) - 0.12, sz * u * ZL)))
        for i in range(4):
            for j in range(2):
                t.face([ids[(i, j, 0)], ids[(i, j + 1, 0)], ids[(i + 1, j + 1, 0)], ids[(i + 1, j, 0)]], Z)
                t.face([ids[(i, j, 1)], ids[(i, j + 1, 1)], ids[(i + 1, j + 1, 1)], ids[(i + 1, j, 1)]], -Z)
            t.face([ids[(i, 0, 0)], ids[(i, 0, 1)], ids[(i + 1, 0, 1)], ids[(i + 1, 0, 0)]], F.N((-1, 0, 0)))
            t.face([ids[(i, 2, 0)], ids[(i, 2, 1)], ids[(i + 1, 2, 1)], ids[(i + 1, 2, 0)]], F.N((1, 0, 0)))
        t.normals()
        put(t, lambda p, n: mix(ROOF_D, mul(ROOF_D, 0.9), 0.5) if n.z > 0 else mix('#a87848', '#8a6038', clamp(-n.z)), 'roof', 'body')
        rr_ = 0.178; prof = [(-1.0, 0.0), (-0.72, 0.68), (0.0, 1.0), (0.72, 0.68), (1.0, 0.0)]
        for k in range(NT):
            x0 = -XL + 0.17 + k * (2 * XL - 0.34) / (NT - 1); c0 = ['#7f9f70', '#8aa97a', '#749666'][k % 3]
            rows = [0.02, 0.2, 0.42, 0.66, 0.86, 1.0]; ids = []
            t = PTmp()
            for u in rows:
                y0_ = yA(u, x0) + 0.0
                # (the tiles step: every other row a touch proud, so the courses read)
                pr = 1.06 if rows.index(u) % 2 else 1.0
                ids.append([t.vert(F.W((x0 + a * rr_ * pr, y0_ + b * rr_ * 0.62 * pr, sz * u * ZL))) for a, b in prof])
            for i in range(len(rows) - 1):
                for j in range(4): t.face([ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]], Z)
            # the rounded eave end: a fan closing the roll
            e = rows[-1]; ec = t.vert(F.W((x0, yA(e, x0) + 0.03, sz * (e * ZL + 0.015))))
            for j in range(4): t.face([ec, ids[-1][j], ids[-1][j + 1]], F.N((0, 0, sz)))
            t.normals()
            def col(p, n, c0=c0):
                if abs(n.dot(F.N((0, 0, sz)))) > 0.75 and n.z < 0.5: return mix('#5e7d52', '#6f9062', clamp(n.z + 0.4))
                return mix(mul(c0, 0.78), mix(c0, ROOF_HI, 0.55), clamp(n.z * 1.15 - 0.15))
            put(t, col, 'roof', 'body')
    put(gtube([(-XL - 0.05, YR + 0.08, 0), (0, YR + 0.1, 0), (XL + 0.05, YR + 0.08, 0)], lambda s: 0.19, K=8), lambda p, n: mix('#6a8a5c', ROOF_HI, clamp(n.z * 0.9)), 'roof', 'body')
    for sx in (-1, 1):
        for s2 in (-1, 1):
            a, b = (sx * (XL - 0.1), YR - 0.32, s2 * 0.44), (sx * (XL - 0.1), YR + 0.58, -s2 * 0.2)
            put(gtube([a, b], lambda s: 0.085, K=6), wood_c(TIMBER, 0.2), 'beams', 'body')
        rope_band(sx * (XL - 0.1), YR + 0.21, 0.02, 0.11, ax='x', K=6)
        # the gable's slatted board, set back under the roof
        n = 5
        for i in range(n):
            z0 = -ZL * 0.8 + i * (ZL * 1.6) / n; z1 = z0 + ZL * 1.6 / n - 0.025; zm = (z0 + z1) / 2; top = yA(abs(zm) / ZL) - 0.1
            put(box(0.05, top - BY + 0.05, z1 - z0, (sx * (hw - 0.05), (top + BY - 0.05) / 2, zm), r=0.0), lambda p, nn: mix('#b08a5c', '#e0bc88', clamp(nn.z * 0.4 + 0.6)), 'gable', 'body')
    # ---- rolled blinds at the back and the east, the back one half down
    put(gtube([(-P['w'] / 2 + 0.15, BY - 0.2, -pz - 0.02), (P['w'] / 2 - 0.15, BY - 0.2, -pz - 0.02)], lambda s: 0.08, K=6), lambda p, n: mix(mul(STRAW_C, 0.76), STRAW_C, clamp(n.z + 0.5)), 'blinds', 'body')
    t = PTmp(); W_ = P['w'] - 0.5; rows = 8; ids = []
    for j in range(rows + 1):
        y = BY - 0.2 - 0.76 * j / rows
        ids.append((t.vert(F.W((-W_ / 2, y, -pz + 0.03 - 0.03))), t.vert(F.W((W_ / 2, y, -pz + 0.03 - 0.03)))))
    for j in range(rows):
        t.f.append([ids[j][0], ids[j + 1][0], ids[j + 1][1], ids[j][1]])
    nz_ = F.N((0, 0, 1)); t.n = [nz_ for _ in t.v]
    put(t, lambda p, n: mul(STRAW_C, 0.82 + 0.3 * (0.5 + 0.5 * math.cos((BY_Z(BY) - p.z) * 60))), 'blinds', 'cloth', uv=lambda p, yt=F.W((0, BY - 0.2, 0)).z: (0.5, 1 - 0.55 * clamp((yt - p.z) / 0.76)))
    put(gtube([(px + 0.02, BY - 0.36, -hd + 0.15), (px + 0.02, BY - 0.36, hd - 0.15)], lambda s: 0.07, K=5), lambda p, n: mix(mul(STRAW_C, 0.76), STRAW_C, clamp(n.z + 0.5)), 'blinds', 'body')
    # ---- the low rail along the back and the east: chunky balusters
    def rail(a, b, n):
        put(gtube([(a[0], FT + 0.44, a[1]), (b[0], FT + 0.44, b[1])], lambda s: 0.045, K=5), wood_c(TIMBER, 0.15), 'rail', 'body')
        for k in range(1, n):
            q = k / n; put(box(0.05, 0.42, 0.05, (a[0] + (b[0] - a[0]) * q, FT + 0.21, a[1] + (b[1] - a[1]) * q), r=0.0), lambda p, nn: mix('#a06c3a', '#d09a5c', clamp(nn.z * 0.3 + nn.x * 0.3 + 0.5)), 'rail', 'body')
    rail((-px, -pz), (px, -pz), 9); rail((px, -pz), (px, pz - 0.2), 6)
    # ---- the tea table, the celadon pot and cups, four cushions, a vase and a jar
    TZ = -0.05
    put(glathe([(0.0, FT + 0.26), (0.45, FT + 0.26), (0.49, FT + 0.3), (0.46, FT + 0.345), (0.0, FT + 0.345)], K=14, pos=(0, 0, TZ)), lambda p, n: mix('#94592e', '#d09a60', clamp(n.z)), 'tea', 'body')
    for k in range(4):
        a = TAU * k / 4 + PI / 4
        put(cyl(0.05, 0.06, 0.28, (math.cos(a) * 0.3, FT + 0.13, TZ + math.sin(a) * 0.3), K=5), wood_c('#8a5430'), 'tea', 'body')
    with at((0.05, FT + 0.345, TZ - 0.05)):
        pot = '#9fc4a4'
        pc = lambda p, n: mix(mul(pot, 0.82), mix(pot, '#eef8ec', 0.55), clamp(n.z * 0.7 + 0.3))
        put(glathe([(0.0, 0.0), (0.09, 0.005), (0.125, 0.06), (0.115, 0.12), (0.07, 0.165), (0.0, 0.175)], K=8), pc, 'tea', 'body')
        put(sph(0.032, (0, 0.19, 0), K=5, J=2), lac('#7da483'), 'tea', 'body')
        put(gtube([(0.11, 0.08, 0), (0.17, 0.11, 0), (0.2, 0.155, 0)], lambda s: 0.03 - 0.012 * s, K=4), pc, 'tea', 'body')
        put(gtube([(-0.11, 0.13, 0), (-0.17, 0.11, 0), (-0.16, 0.05, 0), (-0.11, 0.04, 0)], lambda s: 0.016, K=3, caps=False), lac('#7da483'), 'tea', 'body')
    for x, z in ((-0.2, 0.12), (0.16, 0.17)):
        put(glathe([(0.0, 0.0), (0.04, 0.0), (0.056, 0.075), (0.042, 0.078), (0.0, 0.05)], K=7, pos=(x, FT + 0.345, TZ + z)), lambda p, n: '#7fa86a' if n.z > 0.85 else mix('#cfc4ac', '#f4ead6', clamp(n.z * 0.7 + 0.5)), 'tea', 'body')
    C = Cards('cushions', 'body')
    for x, z in ((0, TZ - 0.85), (0, TZ + 0.78), (-0.82, TZ), (0.82, TZ)):
        rf = lambda rr, zz, th, x=x: rr * (1 + 0.04 * math.cos(4 * th))
        put(glathe([(0.0, FT - 0.005), (0.27, FT + 0.01), (0.29, FT + 0.06), (0.22, FT + 0.11), (0.0, FT + 0.135)], K=8, pos=(x, 0, z), rfn=rf), lambda p, n: mix('#6e9458', '#a8c88c', clamp(n.z)), 'cushions', 'body')
        blossom(C, F.W((x, FT + 0.14, z)), Z, 0.09, '#f6eeda', eye='#e8b84a')
    C.flush()
    # (the vase and jar in the back corners)
    put(glathe([(0.0, FT), (0.08, FT + 0.01), (0.1, FT + 0.09), (0.055, FT + 0.2), (0.05, FT + 0.25), (0.07, FT + 0.28), (0.04, FT + 0.28)], K=7, pos=(px - 0.28, 0, -pz + 0.28)), lambda p, n: mix('#a87a50', '#dcae80', clamp(n.z + 0.5)), 'tea', 'body')
    C = Cards('cushions', 'leaf'); vb = F.W((px - 0.28, FT + 0.28, -pz + 0.28))
    for k in range(4):
        a = k * 1.6; d = Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.8))
        leaf2(C, vb, d, Z, 0.26, 0.09, '#4f8a3c', '#8cc25c')
        blossom(C, vb + d * 0.28, Z + Vector((0, -0.3, 0)), 0.06, ['#ff9ec0', '#ffc4d8'][k % 2], rot=a)
    C.flush()
    put(glathe([(0.0, FT), (0.09, FT + 0.01), (0.11, FT + 0.11), (0.075, FT + 0.19), (0.06, FT + 0.24), (0.0, FT + 0.25)], K=7, pos=(-px + 0.3, 0, -pz + 0.28)), lambda p, n: mix('#94543a', '#d08a64', clamp(n.z + 0.5)), 'tea', 'body')
    # ---- two cream paper lanterns on the front beam (the pavilion's one light stays the kit's)
    for sx in (-1, 1):
        lantern_paper((sx * (px - 0.25), BY - 0.1, pz + 0.1), r=0.17, h=0.3, cord=0.3, color='#fff1d6', K=7)

def BY_Z(BY): return BY  # (rows on the blind: its painter only needs world height)

def bamboo_pole(a, b, r, tag='basin', K=5, nodes=True):
    a, b = Vector(a), Vector(b); L_ = (b - a).length; nn = max(1, int(L_ / 0.32)) if nodes else 1
    pts = [tuple(a.lerp(b, k / nn)) for k in range(nn + 1)]
    bz0, bz1 = a.y, b.y
    def c(p, n):
        k = mix('#8fb25a', '#d4e494', clamp(n.z * 0.45 + 0.3))
        return k
    put(gtube(pts, lambda s: r, K=K, caps=True), c, tag, 'body')
    if nodes:
        for k in range(1, nn):
            q = a.lerp(b, k / nn); put(gtube([tuple(q - (b - a).normalized() * 0.018), tuple(q + (b - a).normalized() * 0.018)], lambda s: r * 1.14, K=K, caps=False), flat('#5f8a35'), tag, 'body')

def basin_(x, z, ux, uz):
    gy = H(x, z) - 0.04; R, h = 0.44, 0.55
    with at((x, gy, z)):
        prof = [(0.0, 0.0), (R * 0.9, 0.0), (R, 0.1), (R * 1.04, h * 0.7), (R * 0.97, h), (R * 0.86, h + 0.025), (R * 0.72, h - 0.02), (R * 0.68, h - 0.12), (0.0, h - 0.16)]
        ph = 1.3
        rf = lambda rr, zz, th: rr * (1 + 0.03 * math.sin(3 * th + ph))
        t = glathe(prof, K=12, rfn=rf); top = F.W((0, h, 0)).z
        def c(p, n):
            k = mix('#8a8290', '#d6cecc', clamp(n.z * 0.6 + (p.z - gy) / h * 0.5))
            m = clamp((vnoise(p, 3.5, 21) - 0.46) * 5) * clamp(n.z * 1.2 + 0.4) * 0.9
            return mix(k, '#7fa052', m)
        put(t, c, 'basin', 'body')
        wat = lathe([(0.0, 0.006), (R * 0.74, 0.0)], 12).xform(F.m @ lm((0, h - 0.04, 0)))
        put(wat, flat('#6fcfd0'), 'basin', 'water')
    # the spout: a bamboo post, a pipe out over the bowl, a stream; the overflow to the deer scarer
    px, pz = x - 0.55, z - 0.45; pg = H(px, pz)
    bamboo_pole((px, pg - 0.05, pz), (px, pg + 1.0, pz), 0.06)
    a, b = (px, pg + 0.88, pz), (x - 0.08, pg + 0.82, z - 0.05)
    bamboo_pole(a, b, 0.045, nodes=False)
    stream = '#d4f2f6'
    put(gtube([(b[0] + 0.03, b[1] - 0.02, b[2] + 0.02), (b[0] + 0.06, b[1] - 0.15, b[2] + 0.04), (x - 0.01, gy + h - 0.03, z)], lambda s: 0.032 - 0.008 * s, K=4), flat(stream), 'stream', 'body')
    c0 = (x + ux * (R * 0.8), gy + h + 0.06, z + uz * (R * 0.8)); c1 = (x + ux * 0.72, gy + h + 0.03, z + uz * 0.72)
    bamboo_pole(c0, c1, 0.042, nodes=False)
    put(gtube([c1, (c1[0] + ux * 0.03, c1[1] - 0.05, c1[2] + uz * 0.03), (c1[0] + ux * 0.04, c1[1] - 0.11, c1[2] + uz * 0.04)], lambda s: 0.026 - 0.008 * s, K=4), flat(stream), 'stream', 'body')
    # a ladle across the rim
    put(gtube([(x - R * 0.8, gy + h + 0.05, z + 0.12), (x + R * 0.5, gy + h + 0.07, z + 0.2)], lambda s: 0.02, K=3), lac('#5f8a35'), 'basin', 'body')
    put(cyl(0.06, 0.055, 0.08, (x + R * 0.55, gy + h + 0.07, z + 0.2), K=6), lac('#8fb25a'), 'basin', 'body')

def scarer_frame(sc, ux, uz):
    sx, sz = -uz, ux; gy = H(sc[0], sc[2])
    for s in (-1, 1):
        x, z = sc[0] + sx * s * 0.135, sc[2] + sz * s * 0.135
        bamboo_pole((x, gy - 0.05, z), (x, sc[1] + 0.08, z), 0.042)
        put(sph(0.046, (x, sc[1] + 0.09, z), K=5, J=2), flat('#5f8a35'), 'basin', 'body')
    ya = math.atan2(-sz, sx)
    put(gtube([(sc[0] - sx * 0.16, sc[1], sc[2] - sz * 0.16), (sc[0] + sx * 0.16, sc[1], sc[2] + sz * 0.16)], lambda s: 0.02, K=4), flat('#6a4a30'), 'basin', 'body')
    tx, tz = sc[0] + ux * 0.37, sc[2] + uz * 0.37
    rock(tx, H(tx, tz) - 0.06, tz, 0.17, sq=0.7, seed=31, cuts=2, lod=0)

def lantern_toro(x, y, z, ry, s=1.15):
    """the squat mossy stone lantern: base, post, a glowing fire box at the kit's light, a sweeping cap and jewel"""
    with at((x, y, z), ry=ry, s=s):
        stc = lambda p, n: mix('#8e8690', '#d6cecc', clamp(n.z * 0.75 + 0.3))
        def mossy(p, n):
            k = stc(p, n); m = clamp((vnoise(p, 3.4, 8) - 0.4) * 4.5) * clamp(n.z * 1.5 - 0.3)
            return mix(k, '#83a356', m)
        put(glathe([(0.3, -0.05), (0.3, 0.07), (0.24, 0.12), (0.12, 0.18), (0.0, 0.18)], K=6), mossy, 'toro', 'body')
        put(glathe([(0.12, 0.18), (0.095, 0.62)], K=6), stc, 'toro', 'body')
        put(glathe([(0.0, 0.62), (0.14, 0.64), (0.25, 0.72), (0.24, 0.76), (0.0, 0.76)], K=6), mossy, 'toro', 'body')
        glowput(glathe([(0.14, 0.75), (0.14, 0.97)], K=6, ry=0.52), flat('#ffeec0'), 'toro', flicker=0.7, tint=0.5)
        for k in range(6):
            a = TAU * (k + 0.5) / 6; put(box(0.06, 0.24, 0.06, (math.cos(a) * 0.155, 0.86, math.sin(a) * 0.155), r=0.0, ry=-a), stc, 'toro', 'body')
        rf = lambda rr, zz, th: rr * (1 + 0.1 * abs(math.cos(3 * th)) ** 3)
        put(glathe([(0.0, 0.97), (0.34, 0.99), (0.38, 1.06), (0.28, 1.13), (0.12, 1.23), (0.0, 1.27)], K=12, rfn=rf), mossy, 'toro', 'body')
        put(glathe([(0.08, 1.24), (0.085, 1.28), (0.04, 1.33), (0.075, 1.38), (0.0, 1.46)], K=6), stc, 'toro', 'body')

def gravel(cx, cz, rx, rz):
    """the raked bed: raised grooves in concentric ovals, kerb stones, three mossy stones"""
    ph = 0.7
    def R_(a): return 1 + 0.05 * math.sin(2 * a + ph) + 0.03 * math.sin(3 * a - ph)
    top = -1e9
    for k in range(24):
        a = TAU * k / 24
        for q in (0, 0.5, 1): top = max(top, H(cx + math.cos(a) * rx * q, cz + math.sin(a) * rz * q))
    y = top + 0.05; K = 22; rings = 12
    t = PTmp(); t.c = []; ids = []
    for j in range(rings + 1):
        q = (j / rings) ** 0.9; row = []
        groove = j % 2 == 1; yy = y + (-0.012 if groove else 0.012) * (1 - 0.3 * q)
        col = mix('#cdbd98', '#d8c8a4', 0.5) if groove else mix('#f6ecd0', '#fff6e0', 0.5)
        for k in range(K):
            a = TAU * k / K
            row.append(len(t.v)); t.v.append(V3(cx + math.cos(a) * rx * q * R_(a), yy, cz + math.sin(a) * rz * q * R_(a))); t.n.append(Z.copy()); t.c.append(srgb(col))
        ids.append(row)
    for j in range(rings):
        for k in range(K):
            k1 = (k + 1) % K; t.f.append([ids[j][k], ids[j + 1][k], ids[j + 1][k1], ids[j][k1]])
    # (viewed from above: wound counter-clockwise in Blender, the ring runs -z with game z)
    for fi, f in enumerate(t.f):
        P_ = [t.v[i] for i in f]
        if (P_[1] - P_[0]).cross(P_[2] - P_[0]).z < 0: t.f[fi] = f[::-1]
    put(t, None, 'gravel', 'body')
    # the packed lip, the kerb
    path = [(cx + math.cos(TAU * k / 22) * rx * R_(TAU * k / 22), y + 0.02, cz + math.sin(TAU * k / 22) * rz * R_(TAU * k / 22)) for k in range(22)]
    put(gloop(path, 0.07, K=3), lambda p, n: mix('#b0a280', '#d8cca8', clamp(n.z)), 'gravel', 'body')
    for i in range(9):
        a = TAU * i / 9 + 0.2; x, z = cx + math.cos(a) * rx * 1.05 * R_(a), cz + math.sin(a) * rz * 1.05 * R_(a)
        r = 0.15 + 0.05 * (i % 3) / 2
        t = lathe([(0.0, -0.1), (r * 1.2, -0.04), (r * 1.05, r * 0.45), (0.0, r * 0.7)], 5, sx=1.25, sy=0.85, th0=a).xform(Matrix.Translation(V3(x, H(x, z), z)))
        put(t, lambda p, n: mix('#8e8690', '#d6cecc', clamp(n.z * 0.8 + 0.2)), 'kerb', 'body')
    for i, (x, z, r, m) in enumerate(((-1.0, 3.5, 0.62, 0.52), (-1.85, 3.95, 0.42, 0.5), (-0.4, 4.25, 0.3, 0.45))):
        rock(x, y + r * 0.2, z, r, sq=0.8, st=1.2, moss=m, seed=50 + i, lod=1, cuts=3, gy=y)
    fern_(-1.35, 3.1, s=0.7, seed=60, y=y); fern_(-2.2, 4.25, s=0.55, seed=61, y=y)

def build_tea():
    use_site('tea')
    P = PAV; hw, hd = P['w'] / 2, P['d'] / 2
    gy = max(H(P['x'] + sx * hw, P['z'] + sz * hd) for sx in (-1, 1) for sz in (-1, 1))
    FT = gy + 0.36
    un = math.hypot(*UV_); ux, uz = UV_[0] / un, UV_[1] / un
    sc = (BASIN[0] + ux * 1.16, H(BASIN[0] + ux * 1.16, BASIN[1] + uz * 1.16) + 0.25, BASIN[1] + uz * 1.16)
    with at((P['x'], 0, P['z'])):
        pavilion(FT, lambda x, z: H(P['x'] + x, P['z'] + z))
    for i, (x, z, r) in enumerate(((0.78, -0.12, 0.34), (0.2, 0.72, 0.33), (-0.72, 1.22, 0.31), (-1.72, 1.45, 0.33), (-2.72, 1.55, 0.3))):
        step_stone(x, z, r, seed=i + 11, moss=0.1)
    gravel(-1.15, 3.75, 1.95, 1.5)
    basin_(BASIN[0], BASIN[1], ux, uz)
    scarer_frame(sc, ux, uz)
    lantern_toro(3.75, H(3.75, -3.75) - 0.04, -3.75, -0.6)
    for i, (x, z, r) in enumerate(((3.1, 0.55, 0.42), (5.6, -1.6, 0.5), (3.2, -2.2, 0.36), (5.9, 1.45, 0.42), (3.9, -4.95, 0.45), (-2.4, -4.2, 0.5), (-0.5, 0.05, 0.3), (-2.75, 2.35, 0.38), (2.4, 3.4, 0.55), (1.2, 5.3, 0.45), (-2.9, -1.0, 0.36), (-2.25, 5.7, 0.4))):
        ground_rock(x, z, r, sink=0.28, moss=0.5 if i % 3 != 2 else 0.0, seed=70 + i, lod=1 if r >= 0.5 else 0, cuts=3)
    rail_fence(((-3.35, -5.4), (-3.42, -3.6), (-3.5, -1.8), (-3.55, 0.25)), seed=2)
    rail_fence(((-3.5, 2.75), (-3.3, 4.55), (-2.45, 5.95), (-0.95, 6.45), (0.55, 6.3)), seed=8)
    for i, (x, z, n, h) in enumerate(((-0.6, -6.4, 2, 4.2), (2.3, -6.5, 1, 3.8), (5.6, -4.9, 3, 4.4), (6.7, -1.6, 2, 3.6))):
        bamboo_(x, z, n=n, h=h, spread=0.5, seed=90 + i, sprays=3)
    for i, (x, z, r, c, fw, nf) in enumerate(((-2.4, -2.6, 0.5, '#5aa548', ['#ffb6cf', '#ff93b6', '#fff6ee'], 7), (3.0, 4.3, 0.62, '#5aa548', ['#ffb6cf', '#ff93b6', '#ffc4d8', '#fff6ee'], 9), (5.0, -3.0, 0.42, '#4f9a3c', ['#fff6ee'], 4))):
        shrub_(x, z, r, color=c, flowers=fw, nf=nf, seed=100 + i, density=0.8)
    for i, (x, z) in enumerate(((-1.85, 2.45), (-2.6, -3.3), (2.6, 0.4), (5.0, -2.6), (3.3, -5.6), (-0.2, 5.9), (1.7, 4.6), (2.9, -1.7))):
        fern_(x, z, s=0.8 + 0.25 * ((i * 7) % 3) / 2, seed=110 + i)
    for i, (x, z, n) in enumerate(((-1.3, 2.25, 4), (2.2, 1.1, 4), (3.8, 0.9, 3), (4.6, -2.0, 3), (-2.0, -1.4, 3), (0.6, 5.0, 4))):
        flowers_(x, z, n=n, r=0.4, colors=['#ffb6cf', '#ff93b6', '#fff6ee', '#ffeef4'], seed=130 + i, nleaf=2)
    finish('poi-tea-0', place='tea', K=0.42, weights={'leaf': 0.5})
    # ---- the deer scarer's moving tube (its frame: the axle at the origin, the mouth along +z; the kit's pivot lifts it 1 m)
    use_site('tea'); S.water = -99
    with at((0, 1.0, 0)):
        r = 0.082; L0, L1 = -0.39, 0.5
        g = lambda p, n: mix('#a8c460', '#d8e49c', clamp(n.z * 0.5 + 0.35))
        put(gtube([(0, 0, L0), (0, 0, -0.22), (0, 0, 0.1), (0, 0, 0.36), (0, 0, L1)], lambda s: r, K=8, caps=False), g, 'scarer', 'body')
        for z in (-0.22, 0.1, 0.36): put(gtube([(0, 0, z - 0.016), (0, 0, z + 0.016)], lambda s: r * 1.12, K=8, caps=False), flat('#5f8a35'), 'scarer', 'body')
        put(glathe([(0.0, 0.0), (r, 0.0)], K=8, pos=(0, 0, L0), rx=-PI / 2), flat('#e3d9a6'), 'scarer', 'body') if False else None
        put(lathe([(0.0, 0.012), (r, 0.0)], 8).xform(F.m @ lm((0, 0, L0), rx=-PI / 2)), flat('#e3d9a6'), 'scarer', 'body')
        put(lathe([(0.0, 0.012), (r * 0.82, 0.0)], 8).xform(F.m @ lm((0, 0, L1 - 0.03), rx=PI / 2)), flat('#2f3a22'), 'scarer', 'body')
        put(gloop([(math.cos(TAU * k / 8) * r * 0.92, math.sin(TAU * k / 8) * r * 0.92, L1) for k in range(8)], 0.018, K=3, up=gl((0, 0, 1))), flat('#e3d9a6'), 'scarer', 'body')
        put(gtube([(-0.1, 0, 0), (0.1, 0, 0)], lambda s: 0.03, K=5), flat('#6a4a30'), 'scarer', 'body')
    export_glb('poi-tea-1', place='tea')
