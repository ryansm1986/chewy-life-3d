# Driftwood Cove: kit 0 (the hut, the bonfire, the logs, the pines, the shore), kit 1 (the rope round the pines; the hammock is
# its moving part and stays). The kit's flames, swinging lantern and shell chimes stay too. Numbers: src/world/outskirts/pois/cove.js.
HUT = (0.2, -0.6, 0.06); FIRE = (0.75, 2.55); LOGS = ((-0.95, 3.55), (2.5, 3.6)); PINES = ((2.05, -3.2, 2.6), (3.45, -0.6, -0.4))
DRIFT = '#b8a07e'; DRIFT_D = '#8c7658'; DRIFT_HI = '#dccaa6'; CREAM = '#ece2c6'; TEAL = '#6fa6a2'; TEAL_D = '#4f8783'

def hut():
    LW, D, WH = 2.6, 2.1, 1.62
    def toPlace(x, z):
        c, s = math.cos(HUT[2]), math.sin(HUT[2]); return HUT[0] + x * c + z * s, HUT[1] - x * s + z * c
    g = lambda x, z: P.h(*toPlace(x, z))
    fl = max(g(0, D / 2 + 0.3), g(0, 0)) + 0.12
    print('POI hut floor', fl)
    zf = D / 2 + 0.01; DW, DH = 0.8, 1.34
    # ---- the upturned boat for a roof, a barrel of clinker planks (the concept's cream and teal bands), its bow toward the camera
    zF, zB = 1.42, -1.42; XF = 1.84; E0 = fl + 1.14; TT = fl + 2.42
    def X_(z): return XF * (1 - 0.14 * (max(zF - z, 0.0) / (zF - zB)) ** 1.6)
    def T_(z): return E0 + (TT - E0) * (1 - 0.1 * (z / zF) ** 2)
    def S_(ph, z, out=0.0):
        s = max(math.sin(ph), 0.0) ** 0.82; c = math.cos(ph); c = math.copysign(abs(c) ** 0.9, c)
        return Vector((c * (X_(z) + out), E0 + (T_(z) - E0 + out) * s, z))
    M = 14; N_ = 11; bands = 'CTCCTCCTCTC'
    for i in range(N_):
        z0, z1 = zF + (zB - zF) * i / N_, zF + (zB - zF) * (i + 1) / N_
        base = TEAL if bands[i] == 'T' else CREAM
        t = Bag(); prev = None
        for j in range(M + 1):
            ph = PI * j / M
            n3 = Vector((math.cos(ph), math.sin(ph) * 1.1, 0.0)).normalized()
            nb = F.N((n3.x, n3.y, 0.28)); nf = F.N((n3.x, n3.y, 0.0))
            shade = lambda k, seed=i * 3 + j: mul(mix(mul(base, 0.8), mix(base, '#ffffff', 0.1), clamp(n3.y * 0.9 + 0.15)), k * (0.97 + 0.07 * nzv(Vector((j * 0.7, i * 1.7, 0)), 1.0, (0, 0, 0))))
            a = t.vc(F.W(tuple(S_(ph, z0, 0.016))), nb, shade(1.02)); b = t.vc(F.W(tuple(S_(ph, z1, 0.0))), nf, shade(0.9))
            if prev:
                t.face([prev[0], a, b, prev[1]], F.N((n3.x, n3.y, 0.0)))
            prev = (a, b)
        bagput(t, 'hull')
    # the rim round the bow's opening, the soffit under it, the stern's cap
    rimp = [tuple(S_(PI * j / 14, zF + 0.015, 0.03)) for j in range(15)]
    put(gtube(rimp, 0.078, K=6, caps=True), lambda p, n: mix(mul(CREAM, 0.78), '#fff6e4', clamp(n.z * 0.7 + 0.4)), 'hull')
    t = Bag(); nd = F.N((0, -1, 0)); dk = '#4e3a2e'; ids0 = []; ids1 = []
    for j in range(15):
        ph = PI * j / 14; ids0.append(t.vc(F.W(tuple(S_(ph, zF))), nd, dk)); ids1.append(t.vc(F.W(tuple(S_(ph, zf - 0.03, -0.06))), nd, mul(dk, 0.8)))
    for j in range(14): t.face([ids0[j], ids0[j + 1], ids1[j + 1], ids1[j]], nd)
    ids = [t.vc(F.W(tuple(S_(PI * j / 14, zB))), F.N((0, 0, -1)), '#6a5240') for j in range(15)]
    c0 = t.vc(F.W((0, E0, zB)), F.N((0, 0, -1)), '#6a5240')
    for j in range(14): t.face([c0, ids[j], ids[j + 1]], F.N((0, 0, -1)))
    bagput(t, 'hull')
    for sx in (0, PI):
        put(gtube([tuple(S_(sx, z, 0.03)) for z in (zF, 0.5, -0.5, zB)], 0.06, K=5, caps=True), lambda p, n: mix(mul(CREAM, 0.72), CREAM, clamp(n.z * 0.7 + 0.4)), 'hull')
    # the keel: a chunky beam along the ridge, its bow end curling up past the rim
    kp = [(0, T_(z) + 0.05, z) for z in (zB - 0.08, -0.95, -0.45, 0.05, 0.55, 1.05, 1.42)] + [(0, T_(1.42) + 0.14, 1.56), (0, T_(1.42) + 0.33, 1.63)]
    put(gtube(kp, lambda s: 0.1 - 0.03 * s ** 3, K=6, caps=True), lambda p, n: mix('#5e4028', '#a07448', clamp(n.z * 0.75 + 0.3)), 'hull')
    # ---- the walls: vertical planks under the bow's arch, plain boards where the eaves hide them
    tones = ('#d0a06a', '#bc8e58', '#dcae78', '#c69a62')
    np_ = 11; w = LW / np_
    S_at = lambda x: E0 + (T_(zf) - E0) * max(1 - (x / X_(zf)) ** 2, 0.0) ** 0.42 - 0.02
    for i in range(np_):
        x = -LW / 2 + (i + 0.5) * w; top = min(S_at(x - w / 2), S_at(x + w / 2)); h = top - fl
        put(box(w - 0.014, h, 0.08, (x, fl + h / 2, D / 2 - 0.04), r=0.0), tw(tones[(i * 3) % 4], i, nzk=0.05), 'walls')
    for sx in (-1, 1): put(box(0.08, WH + 0.04, D, (sx * LW / 2, fl + WH / 2, 0), r=0.0), tw(tones[1 + sx]), 'walls')
    put(box(LW, WH + 0.16, 0.08, (0, fl + WH / 2 + 0.08, -D / 2), r=0.0), tw(tones[1]), 'walls')
    # the floor, its stilts, the corner posts with rope
    put(beam(LW + 0.3, 0.09, D + 0.3, (0, fl, 0), c=0.024), tw(DRIFT), 'walls')
    for x in (-LW / 2, 0, LW / 2):
        y0 = g(x, D / 2) - 0.15; h = fl - y0
        if h > 0.05: put(glathe([(0.095, y0), (0.08, fl)], 6), tw(TIMBER_D), 'walls')
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * LW / 2, sz * D / 2; y0 = min(fl, g(x, z)) - 0.1; h = fl + WH + 0.08 - y0
            put(glathe([(0.125, y0), (0.11, y0 + h)], 8, pos=(x, 0, z)), lambda p, n, sd=sx + sz: mul(mix(mul(TIMBER_D, 0.82), mix(TIMBER_D, '#c09a70', 0.2), clamp(n.z * 0.5 + 0.55)), 1 + 0.12 * nzv(p, 5, (sd, 1, 1))), 'walls')
            if sz > 0:
                rope_band(x, fl + 0.35, z, 0.12, turns=3, K=7, tag='rope'); rope_band(x, fl + WH - 0.25, z, 0.115, turns=2, K=7, tag='rope')
    # ---- the arched teal door in a chunky frame, its brass porthole glowing at night
    def ay(x): return DH - DW / 2 + math.sqrt(max((DW / 2) ** 2 - x * x, 0.0))
    with at((0, fl + 0.04, zf)):
        pw = DW / 4
        for i in range(4):
            x0, x1 = -DW / 2 + i * pw + 0.006, -DW / 2 + (i + 1) * pw - 0.006; xm = (x0 + x1) / 2
            b = (TEAL, '#7cb0aa', TEAL_D, '#669e9a')[i]
            put(prism([(x0, 0.0), (x1, 0.0), (x1, ay(x1)), (xm, ay(xm)), (x0, ay(x0))], 0.06), lambda p, n, c=b: mix(mul(c, 0.78), c, clamp(-n.y * 0.8 + n.z * 0.5 + 0.2)), 'door')
        arch = [(-DW / 2 - 0.05, -0.02, 0.05), (-DW / 2 - 0.05, DH - DW / 2, 0.05)] + [((DW / 2 + 0.05) * math.cos(PI - PI * k / 8), DH - DW / 2 + (DW / 2 + 0.05) * math.sin(PI * k / 8), 0.05) for k in range(1, 8)] + [(DW / 2 + 0.05, DH - DW / 2, 0.05), (DW / 2 + 0.05, -0.02, 0.05)]
        put(gtube(arch, 0.082, K=5, caps=False, up=Vector((0, -1, 0))), lambda p, n: mix('#6a4c30', '#a47c52', clamp(-n.y * 0.6 + n.z * 0.5 + 0.3)), 'door')
    wy = fl + 0.04 + DH - 0.42
    with at((0, wy, zf + 0.09)):
        ring = [(0.175 * math.cos(TAU * k / 12), 0.175 * math.sin(TAU * k / 12), 0.0) for k in range(12)]
        put(gloop(ring, 0.05, K=4, up=Vector((0, -1, 0))), lac('#b8873c', '#ecc472', '#7a5a2a'), 'door')
        t = Bag(); nn = F.N((0, 0, 1)); ci = t.vc(F.W((0, 0, -0.012)), nn, (1.0, 0.86, 0.58))
        ids = [t.vc(F.W((0.165 * math.cos(TAU * k / 12), 0.165 * math.sin(TAU * k / 12), -0.012)), nn, (1.0, 0.82, 0.5)) for k in range(12)]
        for k in range(12): t.face([ci, ids[k], ids[(k + 1) % 12]], nn)
        put(t, None, 'door', GLOWM, uv=lambda p: (0.4, 0.0))
        for rz_ in (0.0, PI / 2): put(box(0.32, 0.032, 0.025, (0, 0, 0.0), r=0.0, rz=rz_), flat('#7c5a38'), 'door')
    put(sph(0.045, (DW / 2 - 0.13, fl + 0.72, zf + 0.09), K=6, J=3), lac('#d8a24a', '#ffe08a', '#8a6428'), 'door')
    # the threshold, the mat, the plank step down to the sand
    put(beam(DW + 0.4, 0.08, 0.28, (0, fl + 0.03, zf + 0.13), c=0.02), tw(TIMBER), 'door')
    put(box(0.66, 0.03, 0.34, (0, fl + 0.08, zf + 0.13), r=0.0), lambda p, n: mix('#a88a5a', '#d8bc88', clamp(n.z)), 'door')
    for i in range(3):
        z = D / 2 + 0.42 + i * 0.22; px, pz = toPlace(0, z)
        put(beam(1.25, 0.065, 0.21, (0.02 * (i - 1), g(0, z) + 0.03, z), c=0.018, ry=0.04 * (i - 1)), tw(DRIFT if i % 2 else '#c4ab86', i), 'door')
    # ---- the brackets the kit's swinging lantern and shell chimes hang from
    lx, ly = -DW / 2 - 0.42, fl + 1.42
    put(box(0.07, 0.07, 0.38, (lx, ly + 0.09, zf + 0.18), r=0.0), tw(TIMBER_D), 'brackets')
    put(box(0.05, 0.3, 0.05, (lx, ly - 0.05, zf + 0.09), r=0.0, rx=0.7), tw(TIMBER_D), 'brackets')
    cx = DW / 2 + 0.5; cz = 2.7 / 2 * pow(1 - (cx / 1.75) ** 2, 0.38) - 0.04
    put(box(0.07, 0.07, cz - D / 2 + 0.2, (cx, fl + WH - 0.03, (cz + D / 2) / 2 + 0.03), r=0.0), tw(TIMBER_D), 'brackets')

def drift_col(p, n):
    a = math.atan2(n.x, n.z) if abs(n.y) < 0.98 else 0.0
    c = mix(DRIFT, DRIFT_D, clamp(0.5 + 0.5 * math.sin(a * 5 + p.x * 3 + p.y * 3)))
    return mix(c, DRIFT_HI, clamp(n.z) * 0.5)

def drift_log(rnd, L=1.7, r=0.23):
    pts = []; rs = []
    for i in range(7):
        t_ = i / 6; x = -L / 2 + t_ * L
        pts.append((x, r + math.sin(t_ * PI) * 0.045, math.sin(t_ * 2.3 + 1) * 0.045))
        rs.append(r * (0.94 + 0.1 * math.sin(t_ * 9 + 1.3) * math.sin(t_ * 4)))
    t = Bag(); K_ = 12; rows_ = []
    for i, q in enumerate(pts):
        row = []
        for j in range(K_):
            a = TAU * j / K_ + 0.25 * math.sin(i * 0.9); gr = 1 if j % 2 else 0
            rr = rs[i] * (0.93 if gr else 1.03) * (1 + 0.03 * math.sin(i * 1.7 + j))
            nl = Vector((0.0, math.cos(a), math.sin(a)))
            pp = F.W((q[0], q[1] + nl.y * rr, q[2] + nl.z * rr))
            lit = clamp(nl.y * 0.6 + 0.5)
            c = mix(DRIFT_D, DRIFT, lit) if gr else mix(DRIFT, DRIFT_HI, lit)
            row.append(t.vc(pp, F.N(tuple(nl)), mul(c, 0.84) if gr else c))
        rows_.append(row)
    for i in range(6):
        for j in range(K_):
            j1 = (j + 1) % K_; q_ = [rows_[i][j], rows_[i][j1], rows_[i + 1][j1], rows_[i + 1][j]]
            t.face(q_, t.n[q_[0]])
    bagput(t, 'logs')
    for sx, i in ((-1, 0), (1, 6)):
        q = pts[i]; rr = rs[i]
        def rings(p, n, q=q, rr=rr, Mi=F.m.inverted()):
            lp = Mi @ p; d = math.hypot(lp.y - (-q[2]), lp.z - q[1]) / rr
            return '#3e2e24' if d < 0.28 else mix('#e4d2ae', '#a88e6c', abs(math.sin(d * 8)) * 0.6 + (0.3 if d > 0.86 else 0))
        put(glathe([(rr, 0.0), (rr * 0.82, 0.018 * 1), (rr * 0.32, 0.018), (rr * 0.26, -0.06), (0.0, -0.07)], 9, pos=(q[0], q[1], q[2]), rz=-sx * PI / 2), rings, 'logs')
    put(gtube([(0.35, r * 1.75, 0.05), (0.45, r * 2.1, 0.14), (0.5, r * 2.3, 0.22)], lambda s: 0.065 - 0.02 * s, K=5, caps=True), drift_col, 'logs')

def bonfire(rnd):
    def bed(p, n): return mix('#3a2a24', '#6a4a38', clamp(nzv(p, 7, (2, 3, 4)) + 0.4))
    put(glathe([(0.66, -0.04), (0.62, 0.035), (0.34, 0.07), (0.0, 0.08)], 10), bed, 'fire')
    for k in range(6):
        a = rnd.uniform(0, TAU); d = rnd.uniform(0.12, 0.46); r = rnd.uniform(0.05, 0.08)
        put(ellipsoid(F.W((math.cos(a) * d, 0.08, math.sin(a) * d)), (r, r, r * 0.7), K=5, J=2), lambda p, n: mix('#d8501c', '#ffae3a', clamp(n.z)), 'fire')
    for k in range(3):
        a = rnd.uniform(0, TAU); d = rnd.uniform(0.05, 0.28)
        glow(ellipsoid(F.W((math.cos(a) * d, 0.1, math.sin(a) * d)), (0.05, 0.05, 0.04), K=5, J=2), flat('#ff8a34'), 'fire', flick=1.0, tint=1.0)
    for k in range(4):
        a = k / 4 * TAU + 0.4
        q0 = (math.cos(a) * 0.5, 0.07, math.sin(a) * 0.5); q1 = (math.cos(a) * 0.08, 0.36, math.sin(a) * 0.08)
        put(gtube([q0, q1], lambda s: 0.068 - 0.012 * s, K=6, caps=True), lambda p, n, Mi=F.m.inverted(): mix('#8a5a38', '#241814', sstep(0.12, 0.42, (Mi @ p).z)), 'fire')

def bucket():
    def col(p, n, Mi=F.m.inverted()):
        ly = (Mi @ p).z; c = mix('#8a5e36', '#c8945a', clamp(n.z * 0.4 + 0.6))
        return mul(c, 0.82) if abs(math.sin(math.atan2(n.y, n.x) * 4.5)) < 0.2 else c
    put(glathe([(0.0, 0.0), (0.16, 0.0), (0.185, 0.07), (0.2, 0.24), (0.205, 0.31), (0.16, 0.31), (0.14, 0.1), (0.0, 0.1)], 9), col, 'bucket')
    hoop(0.195, 0.2, 0.05, 0.1, K=9); hoop(0.208, 0.214, 0.21, 0.26, K=9)
    arc = [(0.195 * math.cos(PI * k / 6), 0.31 + 0.15 * math.sin(PI * k / 6), 0.0) for k in range(7)]
    put(gtube(arc, 0.02, K=3, caps=False), flat(ROPE), 'bucket')

def wood_pile():
    ww = lambda p, n: mix('#7a5230', '#b4845a', clamp(n.z * 0.7 + 0.45))
    rows = ((-0.3, 0.1, 0.1), (0.0, 0.1, 0.105), (0.3, 0.1, 0.1), (-0.16, 0.27, 0.098), (0.15, 0.27, 0.1), (0.0, 0.43, 0.095))
    for i, (x, y, r) in enumerate(rows):
        L_ = 0.78 - i * 0.015; zc = 0.02 * (i % 3)
        put(cyl(r, r, L_, (x, y, zc), K=7, rx=PI / 2), ww, 'woodpile')
        put(glathe([(r * 0.92, 0.0), (r * 0.5, 0.004), (0.0, 0.004)], 7, pos=(x, y, zc + L_ / 2 + 0.002), rx=PI / 2), lambda p, n, r_=r, X_=x, Y_=y, Mi=F.m.inverted(): mix('#f0d6a4', '#c89a64', abs(math.sin(math.hypot((Mi @ p).x - X_, (Mi @ p).z - Y_) / r_ * 7))), 'woodpile')

def piece_cove_0():
    new_asset('cove', 0)
    rnd = random.Random(1010); gy = P.h
    with at((HUT[0], 0, HUT[1]), ry=HUT[2]): hut()
    with at((FIRE[0], gy(*FIRE), FIRE[1])): bonfire(rnd)
    for k in range(10):
        a = k / 10 * TAU + rnd.uniform(0, 0.2); r = rnd.uniform(0.21, 0.28)
        x, z = FIRE[0] + math.cos(a) * 0.72, FIRE[1] + math.sin(a) * 0.72
        rock(x, gy(x, z) + r * 0.25, z, r, sq=0.78, stretch=1.2, moss=0, seed=200 + k, yaw=-a, tris=(34, 0), tag='firering', cuts=3, subdiv=3, down=0.6, nd=2)
    for x, z in LOGS:
        a = math.atan2(x - FIRE[0], z - FIRE[1])
        with at((x, gy(x, z) - 0.05, z), ry=a): drift_log(rnd)
    with at((1.75, gy(1.75, 0.75), 0.75), ry=0.1): wood_pile()
    with at((-1.05, gy(-1.05, 0.7), 0.7)): bucket()
    # the coastal pines (the kit's trunk path: the hammock hangs from it)
    for i, (x, z, d) in enumerate(PINES):
        pine((x, gy(x, z) - 0.06, z), s=3.1, pad=1.75, padFrom=0.64, lean=0.1, dir=d, pads=4, seed=21 + i, ros=30, K=9, rs=0.2)
    # the driftwood fence
    pp = poly_points([(2.85, 4.7), (2.98, 5.55), (2.82, 6.4)], 1.1); tops = []
    for i, (x, z) in enumerate(pp):
        y = gy(x, z); h = 0.72 + rnd.random() * 0.22; lean = rnd.uniform(-0.06, 0.06)
        put(gtube([(x + math.sin(k + i) * 0.02 + lean * k / 3 * h, y - 0.12 + (h + 0.12) * k / 3, z) for k in range(4)], lambda s: 0.08 - s * 0.024, K=6, caps=True), drift_col, 'fence')
        rope_band(x + lean * 0.5 * h, y + 0.55, z, 0.07, turns=2, K=6, tag='fence'); tops.append((x, y, z))
    for a, b in zip(tops, tops[1:]):
        for ry_, w_ in ((0.56, 0.055), (0.3, 0.05)):
            put(gtube([(a[0] + (b[0] - a[0]) * k / 3, a[1] + (b[1] - a[1]) * k / 3 + ry_ + math.sin(k / 3 * PI) * 0.035, a[2] + (b[2] - a[2]) * k / 3) for k in range(4)], w_, K=5, caps=False), lambda p, n: mix(DRIFT, DRIFT_HI, clamp(n.z * 0.7 + 0.3)), 'fence')
    # the mossy shore rocks, their feet in the surf (the kit's places: the foam collars wait for them), a few under the water
    for i, (x, z, r, under) in enumerate(((-2.7, -1.6, 0.95, 0), (-3.4, 1.0, 1.1, 0), (-2.6, 3.9, 0.85, 0), (-3.9, -3.3, 0.8, 0), (-1.9, -4.4, 0.6, 0), (-3.1, 5.6, 0.75, 0), (-4.5, 2.6, 0.6, 1), (-4.2, -0.6, 0.55, 1), (-2.0, 6.6, 0.5, 1))):
        bed = gy(x, z) + P.y; yw = bed + r * 0.1 if under else max(bed + r * 0.3, -r * 0.45)
        rock(x, yw - P.y, z, r * (1.0 if under else 1.08), sq=0.5 if under else 0.88 / 1.08, stretch=1.15, moss=0.2 if under else 0.55, seed=Math.floor(x * 17 + z * 5) if False else 300 + i, yaw=rnd.uniform(0, TAU), sea=P.sea, tris=(44, 14) if under else (int(44 + 96 * r), int(16 + 44 * r)), tag='shore', nd=3)
    # dune grass, sea pinks, shrubs, pebbles
    for x, z in ((-1.7, -3.0), (1.9, -3.4), (-0.9, -3.6), (2.9, 0.6), (3.0, -2.4), (-1.6, 0.6), (2.95, 3.0), (-0.6, 4.6), (1.9, 5.6), (3.6, -0.3), (3.1, 2.4), (-2.0, 2.8)):
        blades((x, gy(x, z), z), rnd, n=6, h=0.46, W=0.075, pal=('#5c8a3c', '#88b04e', '#c0d870'), tag='dunegrass')
    for x, z in ((-1.5, -2.6), (2.5, -3.0), (3.2, 0.1), (1.3, -3.3), (-0.2, 4.2), (2.6, 5.0), (3.2, 3.7)):
        sea_pink(x, gy(x, z), z, rnd, n=3, blade=3, col='#ffffff' if rnd.random() < 0.4 else '#eca5b9')
    for i, (x, z, r) in enumerate(((-1.9, -3.7, 0.38), (2.8, -3.3, 0.34), (-1.72, -0.15, 0.3), (1.62, -1.45, 0.3))):
        leaf_bush((x, gy(x, z), z), r, n=13, seed=40 + i, flowers=('#eca5b9', '#ffffff'), nfl=4, tag='shrubs', L=0.26)
    n = 0
    while n < 20:
        x, z = -1.6 + rnd.random() * 5.0, -2.8 + rnd.random() * 9.0
        if math.hypot(x - FIRE[0], z - FIRE[1]) < 1.0 or (abs(x - HUT[0]) < 1.9 and abs(z - HUT[1]) < 1.4): continue
        n += 1; pebble_at(x, gy(x, z) + 0.005, z, rnd.uniform(0.045, 0.085), rnd)
    ray_ao(DMAX=0.65, K=0.55, weights={'leaf': 0.5})
    export_piece('poi-cove-0')

def piece_cove_1():
    new_asset('cove', 1)
    s = 3.1; lean = 0.1; H = 1.25 * s; t_ = 1.18 / H
    for x, z, d in PINES:
        y = P.h(x, z) - 0.06
        ld = Vector((math.cos(d), 0, math.sin(d)))
        q = Vector((0, t_ * H, 0)) + ld * (math.sin(t_ * 1.4) * lean * s) + Vector((math.sin(t_ * 5 + d) * 0.06 * s, 0, math.cos(t_ * 4 + d) * 0.06 * s))
        rope_band(x + q.x, y + q.y, z + q.z, s * (0.11 - t_ * 0.065) + 0.012, turns=4, K=10, tag='rope', th=0.036)
    export_piece('poi-cove-1')
