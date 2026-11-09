# Lighthouse Point: poi-lighthouse-0 (kit call 0 of pois/lighthouse.js, its frame: origin at the place's centre, y above the kit floor y0 = -1).
# What stays the kit's: the see-through glass drum (r 0.93) and the night beam (ctx.add), the two lights (B.light), the colliders.
CREAM = '#f7e8c6'; CREAM_D = '#d9c49a'; CORAL = '#e07a68'; CORAL_D = '#bc5a4e'; STW = '#d8d0c8'; STW2 = '#c6bcb4'
TW = dict(x=-3.0, z=0.2, door=1.02); R0, R1, TOP = 1.42, 1.16, 3.85
def RAD(h): return R0 + (R1 - R0) * clamp(h / TOP, -0.4, 1.0)

def course(y0, y1, N, base, phase, foot=False, skip=None, seed=0, gap=0.012):
    """one ring of plump stone blocks with mortar gaps (each block its own 18-tri pillow, its own tone)"""
    rnd = random.Random(seed)
    us = [0.0, 0.06, 0.5, 0.94, 1.0]; vs = [0.0, 0.14, 0.86, 1.0]
    for i in range(N):
        a0 = (i + phase) / N * TAU; da = TAU / N * rnd.uniform(0.97, 1.03)
        if skip and skip(a0 + da / 2, (y0 + y1) / 2): continue
        tone = rnd.uniform(0.95, 1.04); c0 = mul(base, tone)
        if rnd.random() < 0.18: c0 = mix(c0, '#fff4dc', 0.3)
        bulge = rnd.uniform(0.004, 0.018)
        t = PTmp(); ids = []
        for u in us:
            row = []
            for v in vs:
                a = a0 + gap / RAD(y0) * 1.1 + u * (TAU / N - gap / RAD(y0) * 2.2)
                y = y0 + gap + v * (y1 - y0 - 2 * gap)
                e = 0.0 if (0 < u < 1 and 0 < v < 1) else 0.03
                r = RAD(y) + 0.012 + bulge - e
                # (the tower's frame: +z is the door, a measured from +z toward +x)
                row.append(t.vert(F.W((math.sin(a) * r, y, math.cos(a) * r))))
            ids.append(row)
        cen = F.W((0, (y0 + y1) / 2, 0))
        for iu in range(4):
            for iv in range(3):
                q = [ids[iu][iv], ids[iu + 1][iv], ids[iu + 1][iv + 1], ids[iu][iv + 1]]
                fc = sum((t.v[k] for k in q), Vector()) / 4
                t.face(q, fc - cen)
        t.normals()
        if foot:
            def col(p, n, c0=c0, s=seed + i):
                k = mix(mul(c0, 0.8), c0, clamp(n.z * 0.6 + 0.65))
                m = clamp((F_FOOT - p.z) * 1.4) * clamp(vnoise(p, 2.6, s) * 1.9 - 0.45)
                return mix(k, '#7fa052', m)
        else:
            def col(p, n, c0=c0): return mix(mul(c0, 0.86), mix(c0, '#fff8ea', 0.2), clamp(n.z * 0.7 + 0.62))
        put(t, col, 'tower', 'body')

F_FOOT = 0.0
def tower():
    global F_FOOT
    F_FOOT = F.W((0, 0.15, 0)).z
    doorskip = lambda a, y: (abs(math.atan2(math.sin(a), math.cos(a))) < 0.26 and y < 1.25)
    put(glathe([(RAD(-1.25) - 0.035, -1.25), (RAD(TOP) - 0.035, TOP - 0.01)], K=18), flat('#b4a288'), 'tower', 'body')
    cs = [(-1.25, 0.3, 8, '#bdb2b4', True), (0.3, 1.52, 10, CREAM, False), (1.52, 2.1, 10, CORAL, False),
          (2.1, 2.7, 10, CREAM, False), (2.7, 3.28, 10, CORAL, False), (3.28, 3.76, 10, CREAM, False)]
    for ci, (y0, y1, N, c, ft) in enumerate(cs):
        course(y0, y1, N, c, 0.5 * (ci % 2) + 0.13, foot=ft, skip=doorskip, seed=70 + ci)
    # ---- the door: chamfered red planks under the arch, a brass porthole and knob, two iron straps
    zr = RAD(0.6) + 0.02
    with at((0, 0.17, zr)):
        for i in range(4):
            x = -0.3 + i * 0.2; top = 1.0 + math.sqrt(max(0.0, 0.16 - x * x)) * 0.75
            c0 = ['#d8604c', '#c85544', '#dc6450', '#cc5a48'][i]
            put(beam(0.19, top, 0.1, (x, top / 2, 0), c=0.02), lambda p, n, c0=c0: mix(mul(c0, 0.8), c0, clamp(n.z * 0.5 - n.y * 0.5 + 0.5)), 'door', 'body')
        for y in (0.3, 0.74):
            put(box(0.62, 0.05, 0.03, (-0.02, y, 0.06), r=0.0), flat('#54403c'), 'door', 'body')
        put(gloop([(0.11 * math.cos(TAU * k / 10), 0.98 + 0.11 * math.sin(TAU * k / 10), 0.06) for k in range(10)], 0.03, K=4, up=gl((0, 0, 1))), lac(BRASS_C), 'door', 'body')
        gg = lathe([(0.0, 0.012), (0.09, 0.0)], 10).xform(F.m @ lm((0, 0.98, 0.058), rx=PI / 2))
        glowput(gg, flat('#a8d4e0'), 'door', tint=0.4)
        put(sph(0.045, (0.24, 0.62, 0.07), K=6, J=3), lac(BRASS_C), 'door', 'body')
        # the arch's voussoirs and jambs: cut stone blocks
        for k in range(9):
            a = PI * k / 8; cx, cy = math.cos(a) * 0.53, 1.0 + math.sin(a) * 0.5
            c0 = STW if k % 2 else STW2
            put(beam(0.2, 0.17, 0.15, (cx, cy, 0.04), c=0.03, rz=a - PI / 2), lambda p, n, c0=c0: mix(mul(c0, 0.8), mix(c0, '#fff8ee', 0.25), clamp(n.z * 0.7 + 0.4)), 'arch', 'body')
        for sx in (-1, 1):
            for k in range(2):
                c0 = STW if (k + (sx > 0)) % 2 else STW2
                put(beam(0.19, 0.46, 0.15, (sx * 0.53, 0.24 + k * 0.48, 0.04), c=0.03), lambda p, n, c0=c0: mix(mul(c0, 0.8), mix(c0, '#fff8ee', 0.2), clamp(n.z * 0.7 + 0.4)), 'arch', 'body')
    # ---- the windows
    for a, y in ((-0.95, 2.18),):
        r = RAD(y) + 0.01
        with at((math.sin(a) * r, y, math.cos(a) * r), ry=a):
            poly = [(-0.15, -0.16), (0.15, -0.16), (0.15, 0.16)] + [(0.15 * math.cos(PI * k / 6), 0.16 + 0.15 * math.sin(PI * k / 6)) for k in range(1, 6)] + [(-0.15, 0.16)]
            glowput(prism(poly, 0.05, 0.0), flat('#86b0cc'), 'window', tint=0.5)
            path = [(-0.19, -0.2, 0.03), (-0.19, 0.16, 0.03)] + [(0.19 * math.cos(PI - PI * k / 6), 0.16 + 0.19 * math.sin(PI - PI * k / 6), 0.03) for k in range(1, 6)] + [(0.19, 0.16, 0.03), (0.19, -0.2, 0.03)]
            put(gtube(path, 0.042, K=4, up=gl((0, 0, 1))), lambda p, n: mix(mul(STW, 0.8), STW, clamp(n.z * 0.7 + 0.5)), 'window', 'body')
            put(box(0.03, 0.34, 0.03, (0, 0.02, 0.055), r=0.0), flat('#7a5a40'), 'window', 'body')
            put(box(0.3, 0.03, 0.03, (0, 0.03, 0.055), r=0.0), flat('#7a5a40'), 'window', 'body')
            put(beam(0.48, 0.07, 0.17, (0, -0.22, 0.05), c=0.02), lambda p, n: mix(mul(STW2, 0.8), mix(STW, '#fff8ee', 0.3), clamp(n.z)), 'window', 'body')
    # ---- the wall lantern (the kit's light sits at its glass)
    a, y = 0.52, 1.32; r = RAD(y)
    with at((math.sin(a) * r, y, math.cos(a) * r), ry=a):
        put(box(0.05, 0.05, 0.24, (0, 0.2, 0.1), r=0.0), flat('#54403c'), 'walllamp', 'body')
        put(glathe([(0.12, 0.13), (0.03, 0.22), (0.0, 0.25)], K=4, pos=(0, 0, 0.2), ry=PI / 4), lac(BRASS_C), 'walllamp', 'body')
        glowput(box(0.15, 0.2, 0.15, (0, 0.03, 0.2), r=0.0), flat('#ffdf9a'), 'walllamp', flicker=0.6, tint=0.8)
        for sx, sz in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            put(box(0.03, 0.22, 0.03, (sx * 0.075, 0.03, 0.2 + sz * 0.075), r=0.0), flat(BRASS_D), 'walllamp', 'body')
        put(glathe([(0.0, -0.12), (0.05, -0.12), (0.1, -0.07)], K=4, pos=(0, 0, 0.2), ry=PI / 4), lac(BRASS_C), 'walllamp', 'body')
    # ---- the gallery: a corbelled red flare, its deck, chunky honey posts, two rails
    gy = TOP
    corb = glathe([(RAD(gy - 0.2) - 0.03, gy - 0.22), (RAD(gy - 0.1) + 0.05, gy - 0.12), (1.5, gy + 0.02), (1.78, gy + 0.1), (1.82, gy + 0.2), (1.74, gy + 0.26), (0.0, gy + 0.27)], K=22)
    put(corb, lambda p, n: mix('#a24238', mix(CORAL, '#f08a74', 0.25), clamp(n.z * 0.75 + 0.5)) if n.z < 0.8 else mix('#c05a4c', '#b84f44', vnoise(p, 5, 3)), 'gallery', 'body')
    NP, rr = 8, 1.64
    for k in range(NP):
        a = TAU * k / NP + 0.2; px, pz = math.cos(a) * rr, math.sin(a) * rr
        put(glathe([(0.062, gy + 0.22), (0.058, gy + 0.84), (0.09, gy + 0.86), (0.082, gy + 0.93), (0.0, gy + 0.965)], K=6, pos=(px, 0, pz)), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z * 0.5 + 0.6 + n.x * 0.15)), 'gallery', 'body')
    for y, tk, K in ((gy + 0.82, 0.062, 4), (gy + 0.48, 0.045, 3)):
        put(gloop(circle_g(rr, 16, y), tk, K=K), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z * 0.6 + 0.55)), 'gallery', 'body')
    # ---- the lamp room: a cream drum, the lamp on its pedestal (the glass is the kit's own see-through mesh), brass mullions and rings, the dome
    put(glathe([(1.02, gy + 0.24), (1.06, gy + 0.3), (1.05, gy + 0.52), (0.98, gy + 0.56), (0.0, gy + 0.56)], K=20), lambda p, n: mix(mul(CREAM, 0.8), CREAM, clamp(n.z * 0.7 + 0.6)), 'lamproom', 'body')
    g0, g1 = gy + 0.56, gy + 1.5
    put(glathe([(0.3, g0), (0.2, g0 + 0.22), (0.0, g0 + 0.24)], K=8), lac('#8a6840'), 'lamproom', 'body')
    lp = []; LH = 0.62
    for k in range(9):
        t = k / 8; lp.append((max(0.0, (0.34 + 0.08 * math.sin(t * PI)) * (0.93 if k % 2 else 1.0) * (0.55 if k in (0, 8) else 1.0)), g0 + 0.22 + t * LH))
    def lens(p, n):
        t = clamp(1 - abs(p.z - F.W((0, g0 + 0.22 + LH / 2, 0)).z) * 3.0)
        return mix('#ffc256', '#fff6d0', t * 0.8)
    glowput(glathe(lp, K=8), lens, 'lamproom', flicker=0.12, tint=0.85)
    put(glathe([(0.24, g0 + 0.22 + LH), (0.12, g0 + 0.32 + LH), (0.0, g0 + 0.33 + LH)], K=8), lac(BRASS_C), 'lamproom', 'body')
    for k in range(8):
        a = TAU * k / 8; put(box(0.075, g1 - g0, 0.075, (math.cos(a) * 0.96, (g0 + g1) / 2, math.sin(a) * 0.96), r=0.0, ry=-a), lambda p, n: mix('#a87c38', '#e0b868', clamp(n.z * 0.2 + n.x * 0.3 - n.y * 0.3 + 0.5)), 'lamproom', 'body')
    for y in (g0, g1):
        put(gloop(circle_g(0.97, 16, y), 0.05, K=3), lac(BRASS_C), 'lamproom', 'body')
    put(glathe([(1.08, g1), (1.13, g1 + 0.05), (1.13, g1 + 0.13), (1.08, g1 + 0.17)], K=20), lambda p, n: mix(mul(CREAM, 0.82), CREAM, clamp(n.z * 0.6 + 0.6)), 'lamproom', 'body')
    dome = glathe([(0.0, g1), (1.1, g1 + 0.01), (1.17, g1 + 0.18), (1.1, g1 + 0.3), (0.98, g1 + 0.48), (0.8, g1 + 0.7), (0.55, g1 + 0.86), (0.28, g1 + 0.95), (0.0, g1 + 0.98)], K=18)
    put(dome, lambda p, n: mix(mix('#a84238', CORAL, 0.5), mix(CORAL, '#f49a84', 0.45), clamp(n.z * 1.05)) if n.z > -0.3 else mul(CORAL_D, 0.8), 'dome', 'body')
    put(glathe([(0.11, g1 + 0.96), (0.07, g1 + 1.16), (0.0, g1 + 1.17)], K=7), lac(CORAL_D), 'dome', 'body')
    put(sph(0.155, (0, g1 + 1.25, 0), K=9, J=5), lambda p, n: mix(CORAL, '#ffb09a', clamp(n.z * 0.7 + 0.1 - n.y * 0.25)), 'dome', 'body')

def circle_g(r, n, y): return [(r * math.cos(TAU * k / n), y, r * math.sin(TAU * k / n)) for k in range(n)]

def telescope(x, z, aim):
    gy = H(x, z); top = Vector((x, gy + 1.0, z))
    for k in range(3):
        a = aim + PI + (k - 1) * 2.1; fx, fz = x + math.cos(a) * 0.44, z + math.sin(a) * 0.44; foot = Vector((fx, H(fx, fz) - 0.03, fz))
        put(gtube([tuple(top - Vector((0, 0.05, 0))), tuple(foot.lerp(top, 0.5)), tuple(foot)], lambda s: 0.042 - 0.008 * s, K=5, caps=False), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z * 0.5 + n.x * 0.2 + 0.5)), 'telescope', 'body')
        put(cyl(0.05, 0.055, 0.06, (fx, foot.y + 0.05, fz), K=5), lac(BRASS_C), 'telescope', 'body')
    put(cyl(0.085, 0.1, 0.11, (x, top.y, z), K=8), lac(BRASS_C), 'telescope', 'body')
    el = 0.13; u = Vector((math.cos(aim) * math.cos(el), math.sin(el), math.sin(aim) * math.cos(el))); c = Vector((x, top.y + 0.14, z)); L = 0.95
    AT = lambda s: tuple(c + u * s)
    prof = [(-L * 0.42, 0.048), (-L * 0.1, 0.062), (L * 0.3, 0.076), (L * 0.58, 0.09)]
    put(gtube([AT(s) for s, _ in prof], lambda s: 0.048 + 0.042 * s, K=6, caps=True), lambda p, n: mix('#3e2c2a', '#6a4e44', clamp(n.z * 0.8 + 0.2)), 'telescope', 'body')
    for s, r in ((-L * 0.4, 0.062), (-L * 0.08, 0.076), (L * 0.3, 0.09), (L * 0.56, 0.108)):
        put(gtube([AT(s - 0.04), AT(s + 0.04)], lambda q, r=r: r, K=6, caps=False), lac(BRASS_C), 'telescope', 'body')
    put(gtube([AT(-L * 0.42 - 0.11), AT(-L * 0.42 + 0.01)], lambda q: 0.038, K=6), lac(BRASS_C), 'telescope', 'body')
    # (the big lens end, a bright disc, and the yoke)
    n_ = gl(tuple(u)).normalized()
    disc = lathe([(0.0, 0.01), (0.086, 0.0)], 8).xform(Matrix.Translation(V3(*AT(L * 0.6))) @ n_.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    put(disc, flat('#cfeaf2'), 'telescope', 'body')
    for sx in (-1, 1):
        put(box(0.03, 0.18, 0.06, (x - math.sin(aim) * sx * 0.1, top.y + 0.08, z + math.cos(aim) * sx * 0.1), r=0.0, ry=-aim), lac(BRASS_C), 'telescope', 'body')

def bench(x, y, z, yaw, w=1.7):
    # the kit's seat height (0.43) and depth: the Sit interaction sets the hero down on it
    with at((x, y, z), ry=yaw):
        tones = ['#c08a50', '#cc9458', '#bb8448', '#d09a60']
        for i in range(4):
            c0 = tones[i]
            put(beam(w, 0.06, 0.1, (0, 0.425, -0.165 + i * 0.105), c=0.02), lambda p, n, c0=c0: mix(mul(c0, 0.76), mix(c0, '#ffe0b0', 0.3), clamp(n.z)), 'bench', 'body')
        rake = 0.142
        pz = lambda yy: -0.18 - yy * rake
        for i in range(3):
            yy = 0.56 + i * 0.105; c0 = tones[(i + 1) % 4]
            put(beam(w - 0.04, 0.085, 0.04, (0, yy, pz(yy) + 0.048), c=0.012, rx=-math.atan(rake)), lambda p, n, c0=c0: mix(mul(c0, 0.8), mix(c0, '#ffe0b0', 0.2), clamp(n.z + 0.5)), 'bench', 'body')
        lc = lambda p, n: mix(mul(WD_LO, 0.86), WD, clamp(n.z * 0.5 + 0.5))
        for sx in (-1, 1):
            xx = sx * (w / 2 - 0.12)
            put(gtube([(xx, -0.05, pz(0)), (xx, 0.86, pz(0.86))], lambda s: 0.042, K=5), lc, 'bench', 'body')
            put(beam(0.075, 0.68, 0.075, (xx, 0.29, 0.17), c=0.015), lc, 'bench', 'body')
            put(beam(0.085, 0.05, 0.42, (xx, 0.62, -0.02), c=0.015), lambda p, n: mix(mul(WD, 0.8), WD_HI, clamp(n.z)), 'bench', 'body')

def crate_(x, y, z, yaw, s=0.58):
    with at((x, y, z), ry=yaw):
        c0 = '#c79058'
        put(box(s, s, s, (0, s / 2, 0), r=0.025), lambda p, n: mix(mul(c0, 0.72), mix(c0, '#ffe0b0', 0.22), clamp(n.z * 0.6 + 0.45 - n.y * 0.1)), 'crate', 'body')
        for a in (0, PI / 2, PI, -PI / 2):
            with at((0, 0, 0), ry=a):
                put(beam(0.085, 0.085, s + 0.03, (-s / 2 + 0.03, s / 2, s / 2 - 0.035 + 0.02 - s / 2 + s / 2), c=0.012, rx=PI / 2) if False else beam(0.085, s + 0.03, 0.04, (-s / 2 + 0.03, s / 2, s / 2), c=0.01), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z + 0.4)), 'crate', 'body')
                put(beam(0.085, s + 0.03, 0.04, (s / 2 - 0.03, s / 2, s / 2), c=0.01), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z + 0.4)), 'crate', 'body')
                put(beam(s - 0.1, 0.075, 0.03, (0, s / 2, s / 2 + 0.008), c=0.01, rz=0.72), lambda p, n: mix(WD_LO, WD, clamp(n.z + 0.4)), 'crate', 'body')
        put(beam(s + 0.02, 0.05, 0.1, (0, s + 0.01, 0.16), c=0.012), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z)), 'crate', 'body')
        put(beam(s + 0.02, 0.05, 0.1, (0, s + 0.01, -0.16), c=0.012), lambda p, n: mix(WD_LO, WD_HI, clamp(n.z)), 'crate', 'body')

def barrel_planter(x, z, r, seed=1):
    gy = H(x, z) - 0.02; h = r * 1.5
    with at((x, gy, z), ry=seed * 1.3):
        prof = [(r * 0.86, 0.0), (r * 1.0, h * 0.5), (r * 0.9, h), (r * 0.74, h + 0.002), (r * 0.7, h - 0.04), (0.0, h - 0.04)]
        def col(p, n, seed=seed):
            a = math.atan2(p.y, p.x); st = abs(math.sin(a * 5)) ** 0.5
            return mix(mix('#8a5a34', '#c98a50', st), '#f0c084', clamp(n.z) * 0.4)
        put(glathe(prof, K=9), col, 'barrel', 'body')
        for yy in (0.72,):
            rr = r * (0.9 + 0.1 * math.sin(yy * PI)) + 0.012
            put(gloop(circle_g(rr, 10, h * yy), 0.022, K=3), flat('#5c4a44'), 'barrel', 'body')
    C = Cards('barrel', 'leaf')
    rosette_leaves(C, x, gy + h, z, 5, r * 1.05, r * 0.6, seed=seed, el=0.65, pal=('#4f8a3c', '#8cc25c'), ring=0.03)
    rosette_leaves(C, x, gy + h + 0.07, z, 4, r * 0.7, r * 0.42, seed=seed + 1, el=1.0, pal=('#5a9444', '#a4d06c'))
    for k in range(4):
        a = k * 1.9 + seed; blossom(C, V3(x + math.cos(a) * r * 0.5, gy + h + 0.2 + 0.03 * (k % 2), z + math.sin(a) * r * 0.5), Z + Vector((0, -0.25, 0)), 0.075, BLOOM[(k + 1) % 4], rot=a)
    C.flush()

def build_lighthouse():
    use_site('lighthouse')
    T = TW; dx, dz = math.sin(T['door']), math.cos(T['door'])
    yb = H(T['x'] + dx * R0, T['z'] + dz * R0) + 0.04
    bench0 = (0.55, -3.35, -0.62); scope = (-0.95, -4.55, math.atan2(0.38, -0.92))
    with at((T['x'], yb, T['z']), ry=T['door']):
        tower()
    # ---- the knoll: big boulders hugging the tower's sea side, the shore rocks, rocks out in the sea
    def tw(a, d): return T['x'] + math.cos(a) * d, T['z'] + math.sin(a) * d
    for i, (a, d, r) in enumerate(((2.2, 1.75, 1.05), (2.85, 1.85, 1.3), (3.6, 1.8, 1.25), (4.45, 1.75, 1.0), (1.65, 1.8, 0.8), (5.1, 1.65, 0.7))):
        x, z = tw(a, d); ground_rock(x, z, r, sink=0.35, sq=0.8, moss=0.52 if i in (0, 2, 3) else 0.0, seed=100 + i, lod=1, cuts=4)
    for i, (x, z, r) in enumerate(((-5.6, -2.6, 1.3), (-5.3, 3.2, 1.2), (-4.4, 5.4, 1.0), (-3.9, -4.6, 1.05), (-3.1, -6.9, 0.9), (-2.2, 7.0, 0.85), (-6.2, 0.6, 1.0), (-4.6, -1.0, 0.75))):
        ground_rock(x, z, r, sink=0.3, moss=0.52 if i != 2 and i != 5 and i != 7 else 0.0, seed=120 + i, lod=2 if r >= 1.25 else 1, cuts=4)
    W_ = S.water
    for i, (x, z, r) in enumerate(((-8.3, -3.8, 1.15), (-9.4, 1.8, 1.25), (-7.6, 5.6, 0.95), (-6.1, -7.6, 0.9))):
        rock(x, W_ - r * 0.3, z, r, sq=1.05, st=1.0, moss=0.5, seed=140 + i, wet=W_ + 0.3, gy=W_ - 0.2, lod=1, cuts=4)
        foam(x, z, r * 0.84, W_, seed=i)
    for i, (x, z, r) in enumerate(((-7.7, -3.0, 0.45), (-6.9, 6.6, 0.4))):
        rock(x, W_ - 0.05 - r * 0.2, z, r, sq=0.8, st=1.0, seed=150 + i, wet=W_ + 0.12, gy=W_ - 0.1, lod=0, cuts=3)
        foam(x, z, r * 0.8, W_, seed=i + 7, K=15)
    # ---- the way in: two curved stone steps at the door, the stepping stones
    with at((T['x'], yb, T['z']), ry=T['door']):
        for rr, y, zz, c0 in ((0.86, -0.02, R0 + 0.12, '#cfc7c2'), (0.6, 0.1, R0 + 0.02, '#ddd5ce')):
            t = lathe([(rr + 0.04, -0.09), (rr, 0.07), (rr - 0.04, 0.085), (0.0, 0.085)], 14, sy=0.62, th0=0.2).xform(F.m @ lm((0, y, zz)))
            def col(p, n, c0=c0):
                k = mix(mul(c0, 0.78), mix(c0, '#fff8ee', 0.25), clamp(n.z * 0.8 + 0.2))
                return mul(k, 0.93 + 0.12 * vnoise(p, 3.2, 5))
            put(t, col, 'steps', 'body')
    for i, (x, z, r) in enumerate(((-0.95, 1.38, 0.36), (0.05, 1.62, 0.32), (1.1, 1.75, 0.34), (2.15, 1.82, 0.3), (3.15, 1.95, 0.33))):
        step_stone(x, z, r, seed=i + 1, moss=0.08)
    # ---- the keeper's bench, the telescope
    bench(bench0[0], H(bench0[0], bench0[1]), bench0[1], bench0[2])
    telescope(*scope[:2], scope[2])
    # ---- the rope fences (at the kit's own colliders)
    rope_fence(((-1.95, -2.75), (-1.95, -4.35), (-1.45, -5.95), (-0.2, -7.15), (1.3, -7.75)), seed=1)
    rope_fence(((-3.45, 2.75), (-3.0, 4.35), (-2.0, 5.75), (-0.6, 6.75)), seed=7)
    rope_fence(((2.9, -6.6), (3.2, -4.6), (3.35, -2.6), (3.45, -0.7)), seed=12)
    rope_fence(((3.6, 3.7), (3.2, 5.4), (2.2, 6.8)), seed=18)
    # ---- the door's crate, the barrel planters
    def out(k, s): return T['x'] + dx * (R0 + 0.35) + dz * s * k, T['z'] + dz * (R0 + 0.35) - dx * s * k
    x, z = out(1, 0.95); crate_(x, H(x, z) - 0.02, z, T['door'] + 0.3)
    x, z = out(-1, 1.0); barrel_planter(x, z, 0.24, seed=3)
    barrel_planter(-0.15, 2.55, 0.2, seed=5)
    # ---- plants: flower beds round the door and the knoll's foot, shrubs, ferns, shore grass
    fl = [(-1.55, 2.35, 7, 0.55, 1), (-2.6, 2.4, 4, 0.45, 1), (-0.6, -0.55, 6, 0.5, 1), (-1.6, -1.6, 3, 0.4, 0), (0.4, 0.35, 3, 0.45, 0), (2.6, -3.3, 3, 0.45, 0), (2.75, 4.6, 4, 0.5, 1), (1.0, 3.6, 3, 0.5, 0), (0.9, -6.6, 3, 0.5, 0)]
    for i, (x, z, n, r, sp) in enumerate(fl): flowers_(x, z, n=n, r=r, seed=200 + i, nleaf=2)
    for i, (x, z, r, c, fw) in enumerate(((2.3, 6.0, 0.45, '#5aa548', ['#ff93b6']), (-2.2, -1.85, 0.5, '#5aa548', ['#fff6ee', '#ffb6cf']), (-2.35, 3.55, 0.55, '#4f9a3c', ['#ff93b6', '#fff6ee']))):
        shrub_(x, z, r, color=c, flowers=fw, nf=4, seed=220 + i)
    for i, (x, z) in enumerate(((-1.25, -3.1), (-2.6, -5.6), (-2.85, 1.95), (-1.9, 6.2))): fern_(x, z, s=0.95, seed=240 + i)
    for i, (x, z) in enumerate(((-3.3, -3.6), (-3.9, 3.3), (-3.2, 6.3), (0.9, -1.4), (2.2, 0.6))): tuft_(x, z, h=0.5, seed=250 + i)
    pebbles(1.2, 1.2, 3, 2.0, seed=3)
    # ---- the lamp's light in the kit sits at g0 + 0.45; the wall lantern's at its glass: both inside our glow parts
    finish('poi-lighthouse-0', place='lighthouse', weights={'leaf': 0.5})
