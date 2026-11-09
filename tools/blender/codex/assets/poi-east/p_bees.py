# The Bee Meadow: kit 0 (bees are the place's own instanced mesh and stay). The layout numbers are src/world/outskirts/pois/bees.js's.
HIVES = ((-2.45, -0.95, '#a2e6d0', 0.08), (-0.8, -1.1, '#d0b0ee', -0.05), (0.85, -1.05, '#f6e080', 0.06), (2.5, -0.9, '#ffbea4', -0.1))
STAND = (2.75, 2.5, -0.22); SIGN = (4.85, 2.75, -0.4)

def hive(col):
    c = srgb(col); dark = mul(c, 0.7); hi = mix(c, '#ffffff', 0.32)
    def pb(p, n):
        k = mix(c, hi, clamp(n.z * 0.5 + 0.55))
        return mul(k, 0.97 + 0.06 * nzv(p, 7, (3, 1, 2)))
    for sx in (-1, 1):
        for sz in (-1, 1): put(box(0.09, 0.26, 0.09, (sx * 0.24, 0.12, sz * 0.19), r=0.0), tw(TIMBER_D), 'hives')
    put(beam(0.68, 0.065, 0.58, (0, 0.26, 0), c=0.02), tw(TIMBER), 'hives')
    put(box(0.46, 0.045, 0.2, (0, 0.262, 0.36), r=0.0, rx=0.16), tw(TIMBER_HI), 'hives')
    for i in range(2):
        y = 0.29 + i * 0.255
        put(box(0.6, 0.262, 0.52, (0, y + 0.122, 0), r=0.03), pb, 'hives')
        put(box(0.2, 0.05, 0.03, (0, y + 0.17, 0.255), r=0.0), flat(dark), 'hives')
    put(box(0.26, 0.05, 0.03, (0, 0.325, 0.255), r=0.0), flat('#3a2a22'), 'hives')
    # the gable and the planked roof, its slopes overhanging all round
    with at((0, 0.8, -0.24)):
        put(prism([(-0.3, 0.0), (0.3, 0.0), (0.0, 0.165)], 0.48), flat(dark), 'hives')
    for s in (-1, 1):
        for k, z in enumerate((-0.2, 0.2)):
            base = '#b57a44' if (k + (s > 0)) % 2 else '#a46a38'
            put(beam(0.42, 0.055, 0.395, (s * 0.172, 0.93, z), c=0.018, rz=-s * 0.5),
                lambda p, n, b=base: mix(mul(b, 0.66), mix(b, '#f0c890', 0.22), clamp(n.z * 0.9 + 0.1)), 'hives')
    put(cyl(0.05, 0.05, 0.82, (0, 1.015, 0), K=6, rx=PI / 2), tw('#8a5830'), 'hives')

def jar(x, y, z, s):
    def amber(p, n):
        c = mix('#f09a24', '#ffd868', clamp(n.z * 0.4 + 0.5 + (n.x - n.y) * 0.3))
        if -n.y > 0.45 and n.x < 0.1 and n.z > -0.15 and n.z < 0.5: c = mix(c, '#fff4d0', 0.55)
        return c
    put(glathe([(0.0, 0.0), (0.06 * s, 0.0), (0.072 * s, 0.03 * s), (0.072 * s, 0.1 * s), (0.05 * s, 0.13 * s)], 7, pos=(x, y, z)), amber, 'jars')
    put(glathe([(0.05 * s, 0.125 * s), (0.07 * s, 0.145 * s), (0.066 * s, 0.17 * s), (0.0, 0.18 * s)], 7, pos=(x, y, z)),
        lambda p, n: mix('#f0dcb4', '#fffaf0', clamp(n.z * 0.8 + 0.5)), 'jars')

def crate(x, y, z, s, yaw):
    with at((x, y, z), ry=yaw):
        put(box(s, s * 0.72, s, (0, s * 0.36, 0), r=0.018), tw('#b8854e'), 'stand')
        put(box(s + 0.012, s * 0.12, s + 0.012, (0, s * 0.42, 0), r=0.0), tw(TIMBER_D), 'stand')

def stand():
    W, D, top = 1.8, 0.74, 0.8
    for sx in (-1, 1):
        for sz, h in ((D / 2 - 0.06, 2.17), (-D / 2 + 0.06, 2.27)):
            post(sx * (W / 2 - 0.06), 0, sz, h, r=0.075, wraps=(top - 0.06,) if sz < 0 else (top - 0.06, h - 0.2), K=6, tag='stand', seed=int(sx + 3), turns=2)
    for i in range(4):
        put(beam(W - 0.02, 0.065, D / 4 - 0.012, (0, top, -D / 2 + D / 8 + i * D / 4), c=0.016), tw(TIMBER if i % 2 else TIMBER_HI, i), 'stand')
    put(box(W - 0.1, 0.12, 0.045, (0, top - 0.09, D / 2 - 0.05), r=0.0), tw(TIMBER_D), 'stand')
    put(box(W - 0.14, 0.045, D - 0.12, (0, 0.2, 0), r=0.0), tw(TIMBER_D), 'stand')
    crate(-0.45, 0.22, -0.05, 0.42, 0.15); crate(0.42, 0.22, 0.0, 0.38, -0.1)
    # the front cloth: cream, a coral band, cream
    t = Bag(); nn = F.N((0, 0, 1)); x0, x1 = -0.61, 0.01; z_ = D / 2 + 0.012; yt = top - 0.02
    for a, b, col in ((0.0, 0.3, '#fbf1de'), (0.3, 0.36, '#ec8a78'), (0.36, 0.46, '#f5e8d2')):
        ids = [t.vc(F.W((x, yt - v, z_ + 0.01 * math.sin(x * 9))), nn, col) for x, v in ((x0, b), (x1, b), (x1, a), (x0, a))]
        t.face(ids, nn)
    put(t, None, 'stand', 'cloth', uv=lambda p: (0.5, 1.0))
    # the shelf of jars, jars on the counter, the pail and the dippers
    for sx in (-1, 1): put(box(0.06, 0.3, 0.22, (sx * 0.55, top + 0.18, -0.2), r=0.0), tw(TIMBER_D), 'stand')
    put(beam(1.24, 0.05, 0.26, (0, top + 0.33, -0.2), c=0.014), tw(TIMBER), 'stand')
    for x in (-0.4, 0.0, 0.4): jar(x, top + 0.355, -0.2, 1.4)
    for x, z, s in ((-0.68, 0.2, 1.45), (-0.3, 0.22, 1.35), (-0.5, -0.04, 1.3)): jar(x, top + 0.03, z, s)
    with at((0.5, top + 0.03, 0.08), ry=0.3):
        def pail(p, n, Mi=F.m.inverted()):
            ly = (Mi @ p).z
            c = mix('#9a6636', '#d09a5e', clamp(n.z * 0.5 + 0.55))
            return mul(c, 0.72) if abs(ly - 0.05) < 0.03 or abs(ly - 0.2) < 0.03 else c
        put(glathe([(0.0, 0.0), (0.17, 0.0), (0.185, 0.05), (0.185, 0.2), (0.17, 0.26)], 9), tw('#c8894e', nzk=0.03), 'stand')
        hoop(0.192, 0.192, 0.04, 0.08, K=9, tag='stand'); hoop(0.192, 0.186, 0.18, 0.22, K=9, tag='stand')
        put(glathe([(0.175, 0.25), (0.17, 0.285), (0.04, 0.3), (0.05, 0.34), (0.0, 0.36)], 9), tw('#a86e3c'), 'stand')
    with at((0.02, top + 0.05, 0.3), ry=0.5):
        put(gtube([(-0.14, 0.0, 0), (0.16, 0.012, 0)], 0.017, K=4, caps=False), tw(TIMBER_HI), 'stand')
        put(glathe([(0.0, -0.06), (0.032, -0.045), (0.042, -0.015), (0.032, 0.015), (0.042, 0.04), (0.0, 0.06)], 5, pos=(-0.18, 0.0, 0), rz=PI / 2),
            lambda p, n: mix('#d8901c', '#ffc850', clamp(n.z * 0.6 + 0.5)), 'stand')
    # the awning: a sloped striped canopy, its hem scalloped
    n_ = 6; sw = (W + 0.16) / n_; yB, yF = 2.34, 2.14; zB, zF = -D / 2 - 0.08, D / 2 + 0.2; L = math.hypot(zF - zB, yB - yF); ang = math.atan2(yB - yF, zF - zB)
    for i in range(n_):
        col = '#fbf0de' if i % 2 else '#ec7f6c'; x = -W / 2 - 0.08 + sw * (i + 0.5)
        pc = lambda p, nn, c=col: mix(mul(c, 0.8), mix(c, '#ffffff', 0.12), clamp(nn.z * 0.8 + 0.4))
        put(box(sw + 0.004, 0.045, L, (x, (yB + yF) / 2 + 0.02, (zB + zF) / 2), r=0.0, rx=ang), pc, 'awning', 'cloth', uv=lambda p: (0.5, 1.0))
        with at((x, yF + 0.012, zF - 0.012)):
            R = sw / 2; poly = [(R * math.cos(-PI * k / 6), 0.72 * R * math.sin(-PI * k / 6)) for k in range(7)]
            put(prism(poly, 0.045, -0.022), lambda p, nn, c=col: mix(mul(c, 0.84), c, clamp(-nn.y)), 'awning', 'cloth', uv=lambda p: (0.5, 0.0))

def bear_sign():
    post(0, 0, 0, 1.22, r=0.075, wraps=(0.78,), K=6, tag='sign', turns=3)
    put(beam(0.68, 0.085, 0.085, (0, 0.78, 0.03), c=0.02), tw(TIMBER), 'sign')
    with at((0, 1.32, 0.05)):
        wd = lambda p, n: mul(mix('#a87038', '#d8a062', clamp(-n.y * 0.5 + n.z * 0.3 + 0.35)), 0.96 + 0.09 * nzv(p, 9, (1, 3, 1)))
        put(glathe([(0.0, -0.045), (0.27, -0.045), (0.295, -0.015), (0.295, 0.015), (0.27, 0.045), (0.0, 0.05)], 13, rx=PI / 2), wd, 'sign')
        for sx in (-1, 1):
            put(glathe([(0.0, -0.035), (0.105, -0.035), (0.105, 0.03), (0.0, 0.035)], 8, pos=(sx * 0.21, 0.22, -0.005), rx=PI / 2), wd, 'sign')
            put(ellipsoid(F.W((sx * 0.21, 0.22, 0.03)), (0.058, 0.058, 0.015), K=7, J=2).xform(Matrix.Rotation(PI / 2, 4, 'X') @ Matrix.Identity(4)) if False else sph(0.058, (sx * 0.21, 0.22, 0.03), sc=(1, 1, 0.24), K=7, J=2), flat('#e6bc8a'), 'sign')
            put(sph(0.042, (sx * 0.105, 0.055, 0.048), sc=(1, 1.15, 0.5), K=6, J=3), flat('#2e2018'), 'sign')
            put(sph(0.04, (sx * 0.17, -0.045, 0.045), sc=(1, 0.8, 0.2), K=6, J=2), flat('#efa090'), 'sign')
        put(sph(0.12, (0, -0.075, 0.05), sc=(1.15, 0.85, 0.38), K=9, J=3), lambda p, n: mix('#d8ae78', '#f0d0a0', clamp(-n.y)), 'sign')
        put(sph(0.04, (0, -0.03, 0.09), sc=(1.25, 0.9, 0.7), K=6, J=3), flat('#3a261c'), 'sign')
        arc = [(0.048 * math.cos(a), -0.1 + 0.03 * math.sin(a) - 0.02, 0.097) for a in [PI + PI * k / 4 for k in range(5)]]
        put(gtube(arc, 0.011, K=3, caps=False), flat('#3a261c'), 'sign')

def planter():
    def bar(p, n, Mi=F.m.inverted()):
        ly = (Mi @ p).z; a = math.atan2(n.y, n.x)
        c = mix('#b47c48', '#e4b078', clamp(n.z * 0.4 + 0.7))
        return mul(c, 0.7) if abs(ly - 0.07) < 0.03 or abs(ly - 0.26) < 0.03 else c
    put(glathe([(0.0, 0.0), (0.17, 0.0), (0.2, 0.08), (0.205, 0.16), (0.2, 0.26), (0.17, 0.33), (0.0, 0.3)], 8), tw('#c89560', nzk=0.03), 'planter')
    hoop(0.21, 0.214, 0.06, 0.1, K=8, tag='planter'); hoop(0.211, 0.203, 0.23, 0.27, K=8, tag='planter')
    leaf_bush((0, 0.28, 0), 0.28, pal=('#2f6a3a', '#4f9a48', '#8cc660'), n=10, seed=5, flowers=('#ff8fb0', '#ffffff', '#ffd24a'), nfl=5, tag='planter', L=0.22)

def lavender_row(x0, x1, z, rnd):
    L = x1 - x0; t = Bag()
    for k in range(int(L * 9)):                                # the grey-green bank: broad leaf cards
        x = x0 + rnd.random() * L; dz = rnd.uniform(-0.3, 0.3); y = P.h(x, z + dz)
        a = rnd.uniform(0, TAU); d = Vector((math.cos(a), math.sin(a), 0.5))
        card(t, F.W((x, y + 0.03, z + dz)), d, Vector((0, 0, 1)), 0.44, 0.2, '#3f6e44', '#86ac70', rnd4=False, flatn=Vector((0, -0.2, 1)).normalized())
    dk, md, lt = '#9e80dc', '#bda4f0', '#e8def9'
    n = int(L * 4.6)
    for k in range(n):
        x = x0 + (k + rnd.uniform(0.1, 0.9)) / n * L; dz = rnd.uniform(-0.3, 0.3); y = P.h(x, z + dz)
        mound = max(0.0, 1 - (dz / 0.36) ** 2) * 0.16
        hs = rnd.uniform(0.42, 0.62); base = F.W((x, y + mound, z + dz))
        lean = Vector((rnd.uniform(-0.12, 0.12), -dz * 0.7 + rnd.uniform(-0.05, 0.05), 1)).normalized()
        # the stalk, then the knobbly spire: a stack of three swellings, 4-sided
        xa, ya = _basis(lean); a0 = rnd.uniform(0, TAU); xa, ya = xa * math.cos(a0) + ya * math.sin(a0), ya * math.cos(a0) - xa * math.sin(a0)
        for f_, r, col in ((0.3, 0.09, dk), (0.5, 0.085, mix(dk, md, 0.5)), (0.68, 0.07, md), (0.85, 0.05, lt)):
            c_ = base + lean * (f_ * hs); hh = r * 1.25; a1 = rnd.uniform(0, TAU)
            ax = [xa * math.cos(a1 + TAU * j / 4) + ya * math.sin(a1 + TAU * j / 4) for j in range(4)]
            top_ = t.vc(c_ + lean * hh, lean, mix(col, '#ffffff', 0.22)); bot_ = t.vc(c_ - lean * hh, -lean, mul(col, 0.78))
            eq = [t.vc(c_ + d_ * r, (d_ + lean * 0.25).normalized(), col) for d_ in ax]
            for j in range(4):
                j1 = (j + 1) % 4; o_ = ax[j] + ax[j1]
                t.face([top_, eq[j], eq[j1]], o_ + lean); t.face([bot_, eq[j1], eq[j]], o_ - lean)
        s_a, s_b = t.vc(base + xa * 0.03, lean, '#6a8a5c'), t.vc(base - xa * 0.03, lean, '#6a8a5c'); s_c = t.vc(base + lean * (hs * 0.3), lean, '#6a8a5c')
        t.face([s_a, s_b, s_c], ya)
    bagput(t, 'lavender', 'leaf')

def sunflower(x, y, z, rnd, h):
    lean = rnd.uniform(-0.06, 0.06); tilt = rnd.uniform(0.55, 0.8); yaw = rnd.uniform(-0.3, 0.3)
    top = (x - math.sin(lean) * h, y + h, z)
    put(gtube([(x, y - 0.05, z), top], 0.03, K=3, caps=False), lambda p, n: mix('#4f8a34', '#6fa848', clamp(n.z + 0.5)), 'sunflowers', 'leaf')
    t = Bag(); up = Vector((0, 0, 1))
    for k, (fr, L, W) in enumerate(((0.35, 0.5, 0.33), (0.62, 0.44, 0.3), (0.05, 0.54, 0.36), (0.08, 0.5, 0.36))):
        a = rnd.uniform(0, TAU) if k > 1 else (k * PI + yaw)
        d = Vector((math.cos(a), math.sin(a), 0.2)).normalized()
        card(t, F.W((x, y + h * fr, z)), d, Vector((0, 0, 1)), L, W, '#3f7f34', '#74b04c', rnd4=k < 2, flatn=Vector((0, -0.25, 1)).normalized())
    bagput(t, 'sunflowers', 'leaf')
    with at(top, ry=yaw, rx=-tilt):
        t = Bag(); nn = F.N((0, 0, 1)); N_ = 10; R0 = 0.11; R1 = 0.31
        for layer, (rr, zz, c0, c1, off) in enumerate(((R1, -0.012, '#d88e14', '#f2b022', 0.5), (R1 * 0.9, 0.01, '#f0a81c', '#ffdc58', 0.0))):
            for k in range(N_):
                a = TAU * (k + off) / N_; da = TAU / N_ * 0.56
                def pt(r, ang, zq=zz): return F.W((r * math.cos(ang), r * math.sin(ang), zq))
                b0 = t.vc(pt(R0 * 0.9, a - da * 0.8), nn, c0); b1 = t.vc(pt(R0 * 0.9, a + da * 0.8), nn, c0)
                m0 = t.vc(pt(rr * 0.68, a - da), nn, mix(c0, c1, 0.6)); m1 = t.vc(pt(rr * 0.68, a + da), nn, mix(c0, c1, 0.6))
                tp = t.vc(pt(rr * rnd.uniform(0.96, 1.05), a, zz + 0.012), nn, c1)
                if layer == 1:
                    t.face([b0, b1, m1], nn); t.face([b0, m1, m0], nn); t.face([m0, m1, tp], nn)
                else:
                    t.face([b0, m1, tp], nn); t.face([b0, tp, m0], nn)
        bagput(t, 'sunflowers', 'leaf')
        put(glathe([(0.13, 0.015), (0.09, 0.05), (0.0, 0.065)], 7, rx=PI / 2),
            lambda p, n: mix('#4a2a14', '#8e5a2c', clamp(0.25 + 0.55 * (1 - abs(F.N((0, 0, 1)).dot(n))) + nzv(p, 30, (1, 2, 3)))), 'sunflowers', 'leaf')

def poppy(x, y, z, rnd, k=1.0):
    h = rnd.uniform(0.38, 0.72) * k; a = rnd.uniform(0, TAU); lx, lz = math.cos(a) * 0.05, math.sin(a) * 0.05
    tp = (x + lx * h, y + h, z + lz * h)
    put(gtube([(x, y - 0.03, z), tp], 0.017, K=3, caps=False), flat('#5f9a44'), 'poppies', 'leaf')
    R = rnd.uniform(0.17, 0.25); c0 = '#ff9a5a' if rnd.random() < 0.22 else '#ee6a4e'; hi = mix(c0, '#ffd6b0', 0.34); lo = mul(c0, 0.66)
    Q = F.W(tp); nrm = Vector((rnd.uniform(-0.28, 0.28), -0.3 + rnd.uniform(-0.25, 0.25), 1)).normalized(); xa, ya = _basis(nrm); a0 = rnd.uniform(0, TAU)
    t = Bag(); ci = t.vc(Q + nrm * 0.005, nrm, lo); ids = []
    for j in range(10):
        ang = a0 + TAU * j / 10; rr = R if j % 2 == 0 else R * 0.8
        d = xa * math.cos(ang) + ya * math.sin(ang)
        ids.append(t.vc(Q + d * rr + nrm * (rr * 0.42), (nrm + d * -0.35).normalized(), hi if j % 2 == 0 else c0))
    for j in range(10): t.face([ci, ids[j], ids[(j + 1) % 10]], nrm)
    bagput(t, 'poppies', 'leaf')
    put(ellipsoid(Q + nrm * 0.035, (0.045, 0.045, 0.03), K=5, J=2), flat('#2e2a26'), 'poppies', 'leaf')

def rope_fence(pts, every=1.65):
    pp = poly_points(pts, every); tops = []
    for i, (x, z) in enumerate(pp):
        y = P.h(x, z); post(x, y, z, 0.7, r=0.08, wraps=(0.53,), K=5, tag='fence', seed=i, turns=1); tops.append((x, y + 0.53, z))
    for a, b in zip(tops, tops[1:]):
        pts3 = [(a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4 - math.sin(k / 4 * PI) * 0.1, a[2] + (b[2] - a[2]) * k / 4) for k in range(5)]
        put(gtube(pts3, 0.03, K=3, caps=False), lambda p, n: mix(ROPE_D, ROPE, clamp(n.z * 0.6 + 0.55)), 'fence')

def piece_bees_0():
    new_asset('bees', 0)
    rnd = random.Random(909); gy = P.h
    for x, z, c, a in HIVES:
        with at((x, gy(x, z), z), ry=a): hive(c)
    with at((STAND[0], gy(STAND[0], STAND[1]), STAND[1]), ry=STAND[2]): stand()
    with at((SIGN[0], gy(SIGN[0], SIGN[1]), SIGN[1]), ry=SIGN[2]): bear_sign()
    with at((1.3, gy(1.3, 3.25), 3.25), ry=0.4): planter()
    # the flower bands
    for r in range(5):
        z = -0.55 + r * 0.7; x0 = -6.45 + (r % 2) * 0.15; x1 = -3.3 - (0.2 if r == 0 else 0)
        lavender_row(x0, x1, z, rnd)
    for r in range(3):
        for i in range(7):
            x = -3.05 + i * 0.98 + (r % 2) * 0.49 + rnd.uniform(-0.07, 0.07); z = -2.3 - r * 0.6 + rnd.uniform(-0.06, 0.06)
            if r == 2 and i in (0, 6): continue
            sunflower(x, gy(x, z), z, rnd, 0.95 + r * 0.22 + rnd.random() * 0.26)
    # the poppy bed
    cx, cz, rx, rz = 4.95, -0.45, 1.55, 1.3; t = Bag()
    for k in range(44):
        a = rnd.uniform(0, TAU); d = math.sqrt(rnd.random()); x, z = cx + math.cos(a) * d * rx, cz + math.sin(a) * d * rz
        q = rnd.uniform(0, TAU)
        card(t, F.W((x, gy(x, z) + 0.04 + (1 - d) * 0.14, z)), Vector((math.cos(q), math.sin(q), 0.28)), Vector((0, 0, 1)), 0.36, 0.2, '#357a36', '#74b04e', rnd4=False, flatn=Vector((0, -0.25, 1)).normalized())
    bagput(t, 'poppies', 'leaf')
    for i in range(23):
        a = rnd.uniform(0, TAU); d = math.sqrt((i + 0.5) / 23); x, z = cx + math.cos(a + i * 2.4) * d * rx, cz + math.sin(a + i * 2.4) * d * rz
        poppy(x, gy(x, z), z, rnd, 1.15 - d * 0.42)
    # daisies, grass, shrubs
    n = 0
    while n < 15:
        x, z = -6.8 + rnd.random() * 13.4, -3.8 + rnd.random() * 7.4
        if (abs(x - STAND[0]) < 1.2 and abs(z - STAND[1]) < 0.8) or (-1.8 < z < -0.3 and -3.1 < x < 3.1) or z > 3.6: continue
        n += 1
        c = '#ffffff' if rnd.random() < 0.7 else ('#ffd24a' if rnd.random() < 0.5 else '#ff9dc1')
        blossom(F.W((x, gy(x, z) + 0.1, z)), Vector((rnd.uniform(-0.2, 0.2), -0.25, 1)).normalized(), rnd.uniform(0.07, 0.09), c, eye='#ffc83a' if c != '#ffd24a' else '#ff9a3a', tag='daisies', petals=6, notch=0.55)
    for x, z in ((-3.1, 2.9), (0.2, 2.1), (-1.6, 0.6), (3.9, 1.6), (6.2, 1.5), (-6.6, -1.7), (0.9, 0.5), (-0.6, 3.4), (2.3, -3.9), (-4.4, -2.0)):
        blades((x, gy(x, z), z), rnd, n=6, h=0.36, tag='tufts')
    for i, (x, z, r) in enumerate(((3.75, -1.95, 0.4), (6.15, -2.65, 0.44), (-2.7, 2.45, 0.34))):
        leaf_bush((x, gy(x, z), z), r, n=16, seed=20 + i, flowers=('#ffffff', '#fff0a0'), nfl=4 if i != 1 else 0, tag='shrubs', L=0.28)
    # the low rope fences and the mossy stones
    rope_fence([(-7.0, -1.3), (-7.0, 2.4), (-3.15, 2.95)])
    rope_fence([(-3.7, -3.95), (-0.6, -4.15), (2.4, -4.1), (4.1, -3.7)])
    rope_fence([(6.75, -2.1), (6.85, 0.4), (6.4, 1.7)])
    for i, (x, z, r) in enumerate(((-7.05, -2.7, 0.75), (5.7, -3.3, 0.8), (-4.05, -3.35, 0.55), (-2.55, 3.5, 0.45), (7.0, 2.6, 0.55), (4.6, -4.25, 0.5), (-7.2, 3.1, 0.5))):
        rock(x, gy(x, z) - r * 0.3, z, r, sq=0.92, moss=0.5, seed=50 + i, yaw=rnd.uniform(0, TAU), tris=(int(40 + 90 * r), int(20 + 46 * r)), tag='stones', nd=3)
    ray_ao(DMAX=0.6, K=0.5, weights={'leaf': 0.55})
    export_piece('poi-bees-0')
