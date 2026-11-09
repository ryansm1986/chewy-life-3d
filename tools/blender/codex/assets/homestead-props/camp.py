# The campfire camp: stone ring, ash and embers, log teepee, tripod and pot, log seat, crate, skewer. Origin: the fire's centre on the
# ground; front (+z) is where the cook stands. flameGeos() stays the kit's: flames at y 0.05, r 0.2, 0.62 tall; the broth disc (r 0.19)
# sits at y 0.84 in the pot. All one material in the game: every look is vertex colour. exec'd by build_homestead-props.py.
def GW(p):
    """a point in the current F frame -> the game's world coords"""
    b = F.W(p); return V3(b.x, b.z, -b.y)

def log(a, b, r, K=8, bark=('#5e3e28', '#94684a'), endc=('#c89a68', '#f0d4a4'), char=None, wob=0.05, seed=0, tag='log', ends=True):
    """a chunky log from a to b (game points): knobbly bark, cut ends with a darker ring. char(h, p) -> 0..1 chars it (h 0 at a .. 1 at b)"""
    a = Vector(a); b = Vector(b); L = (b - a).length
    A_, B_ = toB(a), toB(b); ax = (B_ - A_).normalized()
    q = Vector((0, 0, 1)).rotation_difference(ax).to_matrix().to_4x4()
    M = Matrix.Translation(A_) @ q
    prof = [(0, 0.0), (r * 0.6, 0.0), (r * 0.92, 0.004), (r, 0.02), (r * 1.02, L * 0.33), (r * 0.98, L * 0.66), (r, L - 0.02), (r * 0.92, L - 0.004), (r * 0.6, L), (0, L)]
    rfn = lambda rr, z, th: rr * (1 + wob * math.sin(th * 3 + seed + z * 7) + wob * 0.6 * math.sin(th * 5 + seed * 2.1))
    t = lathe(prof, K, th0=seed * 0.7, rfn=rfn).xform(M)
    def col(p, n):
        h = clamp((p - A_).dot(ax) / L); nd = abs(n.dot(ax))
        rad = ((p - A_) - ax * (p - A_).dot(ax)).length / r
        if ends and nd > 0.72:
            c = mix(endc[1], endc[0], smooth(0.2, 0.75, rad))
            if 0.4 < rad < 0.62: c = mul(c, 0.86)
        else:
            c = mix(bark[0], bark[1], clamp(n.z * 0.55 + 0.45))
            c = mul(c, 0.9 + 0.16 * vnoise(p, 13.0, seed + 3))
        if char:
            k = clamp(char(h, p))
            c = mix(c, '#241a1c', k)
        return c
    return put(t, col, tag)

def build_campfire():
    new_asset()
    # ---- ash bed and embers
    t = lathe([(0, -0.012), (0.56, -0.012), (0.56, 0.008), (0.42, 0.024), (0.2, 0.036), (0, 0.04)], 22, rfn=lambda rr, z, th: rr * (1 + 0.05 * math.sin(th * 3 + 1) + 0.03 * math.sin(th * 7)))
    def ash(p, n):
        r = math.hypot(p.x, p.y)
        c = mix('#2a2024', '#54464a', smooth(0.05, 0.28, r)); c = mix(c, '#a49a96', smooth(0.26, 0.5, r))
        return mix(c, '#c9622c', 0.34 * (1 - smooth(0.04, 0.26, r)))
    put(t, ash, 'ash')
    rnd = seeded('embers')
    for i in range(6):
        a = rnd.uniform(0, TAU); r = rnd.uniform(0.1, 0.38); s = rnd.uniform(0.032, 0.05)
        tt = rock((math.cos(a) * r, 0.03, math.sin(a) * r), s, sc=(1.1, 0.62, 0.9), K=5, J=3, seed=i + 7, cuts=2, ry=a)
        hot = i % 3 != 0
        put(tt, (lambda p, n: mix('#ff6a24', '#ffc46a', clamp(n.z * 0.9))) if hot else (lambda p, n: mix('#241a1c', '#544648', clamp(n.z))), 'embers')
    # ---- the ring of chunky stones: cut planes, light tops, sooty inner faces; moss on three of them
    rnd = seeded('ring')
    PAL = ['#8e8e8a', '#868884', '#969288', '#8a8c8a', '#928e86']
    for i in range(10):
        a = i / 10 * TAU + rnd.uniform(-0.1, 0.1); r = 0.6 + rnd.uniform(-0.015, 0.03); s = rnd.uniform(0.135, 0.165)
        x, z = math.cos(a) * r, math.sin(a) * r
        tt = rock((x, 0.07, z), s, sc=(1.18, 0.78, 0.98), K=12, J=6, seed=i * 5 + 3, cuts=4, ry=-a)
        base = PAL[i % 5]; mossy = i in (1, 8)
        def col(p, n, base=base, mossy=mossy, seed=i):
            c = mix(mul(base, 0.68), mix(base, '#d8d6cc', 0.16), clamp(n.z * 0.8 + 0.28))
            c = mul(c, 0.92 + 0.15 * vnoise(p, 8.0, seed))
            # soot on the inner faces, toward the fire
            inward = -(n.x * p.x + n.y * p.y) / max(1e-4, math.hypot(p.x, p.y))
            c = mix(c, '#3e3234', smooth(0.25, 0.9, inward) * 0.72 * (1 - smooth(0.13, 0.22, p.z)))
            if mossy:
                m = (n.z - 0.62) * 2.2 + (vnoise(p, 9.0, seed + 11) - 0.5) * 2.4
                if m > 0: c = mix(c, mix('#466e34', '#7ea04c', clamp(n.z)), clamp(m * 3.0))
            return c
        put(tt, col, 'stones')
    # ---- two charred logs in the embers
    ch_all = lambda h, p: 0.72
    for a, L in ((0.4, 0.66), (2.25, 0.58)):
        ca, sa = math.cos(a), math.sin(a)
        log((-ca * L / 2, 0.07, -sa * L / 2), (ca * L / 2, 0.075, sa * L / 2), 0.062, K=8, char=lambda h, p: 0.62 + 0.3 * vnoise(p, 12.0, 2), seed=int(a * 7), endc=('#3a2c28', '#ff9a4a'))
    # ---- the log teepee: charred at the fire, bark above; the flames rise through its open heart
    for i in range(5):
        a = i / 5 * TAU + 0.3; bx, bz = math.cos(a) * 0.42, math.sin(a) * 0.42
        top = V3(math.cos(a) * 0.05, 0.57, math.sin(a) * 0.05)
        log((bx, 0.0, bz), top, 0.052, K=7, seed=i + 2, char=lambda h, p: 1.15 - 1.5 * h + 0.3 * (vnoise(p, 14.0, 3) - 0.5), bark=('#5a3a26', '#8e6444'), endc=('#3a2c28', '#a07850'))
    # ---- the tripod: three peeled poles, crossed and bound, their ends passing the lashing
    apex = V3(0, 1.3, 0)
    for i in range(3):
        a = i / 3 * TAU + 0.5; foot = V3(math.cos(a) * 0.74, -0.01, math.sin(a) * 0.74)
        d = apex - foot; over = apex + d.normalized() * 0.11 + V3(math.cos(a + 1) * 0.012, 0, math.sin(a + 1) * 0.012)
        log(foot, over, 0.032, K=6, seed=i * 3 + 11, wob=0.04, bark=('#5e4230', '#8a6848'), endc=('#c89a68', '#f0d4a4'))
    for k, y in enumerate((1.25, 1.3)):
        rr = 0.066 - 0.012 * k * 0
        P = [toB((math.cos(TAU * j / 10) * rr, y + 0.008 * math.sin(TAU * j / 10 + k), math.sin(TAU * j / 10) * rr)) for j in range(10)]
        put(tube_loop(P, lambda s: 0.017, K=4), lambda p, n: mix('#a88a50', '#ecd6a0', clamp(n.z * 0.6 + 0.5)), 'rope')
    # ---- the chain: three fat links and a hook to the bail
    iron = lambda p, n: mix('#2e2a34', '#6e6876', clamp(n.z * 0.65 + 0.42))
    yk = 1.22
    for k in range(3):
        rot = (k % 2) * PI / 2
        P = []
        for j in range(8):
            q = TAU * j / 8
            u = math.cos(q) * 0.024; v = math.sin(q) * 0.04
            P.append(toB((u * math.cos(rot), yk + v, u * math.sin(rot))))
        put(tube_loop(P, lambda s: 0.0125, K=4), iron, 'chain')
        yk -= 0.066
    # ---- the pot: open-topped (a real inner wall under the broth), a rolled rim, a soot-dark belly, two lugs, a bail
    Y = 0.62
    prof = [(0, Y), (0.13, Y + 0.002), (0.195, Y + 0.05), (0.226, Y + 0.12), (0.222, Y + 0.18), (0.206, Y + 0.238), (0.214, Y + 0.252), (0.228, Y + 0.268), (0.216, Y + 0.286),
            (0.2, Y + 0.28), (0.194, Y + 0.24), (0.19, Y + 0.19), (0, Y + 0.185)]
    t = lathe(prof, 18, th0=0.1)
    def potc(p, n):
        r = math.hypot(p.x, p.y)
        if r < 0.2 and p.z > Y + 0.15 and p.z < Y + 0.283: return '#1e1a20'
        c = mix('#2a2630', '#6a6474', clamp(n.z * 0.55 + (-n.y + n.x) * 0.2 + 0.4))
        c = mix(c, '#17141a', (1 - smooth(Y + 0.02, Y + 0.13, p.z)) * 0.7)
        if p.z > Y + 0.25: c = mix(c, '#8a8494', 0.55)
        return c
    put(t, potc, 'pot')
    for s in (-1, 1):
        P = [toB((s * (0.235 + math.cos(TAU * j / 8) * 0.03), Y + 0.235 + math.sin(TAU * j / 8) * 0.03, 0)) for j in range(8)]
        put(tube_loop(P, lambda q: 0.0125, K=4), iron, 'lug')
    pts = []
    for j in range(9):
        q = PI * j / 8
        pts.append((math.cos(q) * 0.24, Y + 0.25 + math.sin(q) * (1.03 - Y - 0.25 - 0.02), 0))
    vtube(pts, 0.0135, K=4, col=iron, tag='bail')
    # ---- the ladle resting in the pot
    log((0.07, 0.82, 0.03), (0.34, 1.2, 0.11), 0.018, K=5, bark=('#a8743e', '#d8a868'), endc=('#a8743e', '#e4bc80'), wob=0.0, seed=5, tag='ladle')
    # ---- the log seat with a folded red cushion
    a = 0.25; L = 0.96; c0 = V3(-0.1, 0.18, 1.35); dd = V3(math.cos(a), 0, -math.sin(a))
    log(c0 - dd * (L / 2), c0 + dd * (L / 2), 0.18, K=10, seed=3, wob=0.035, bark=('#5a3c2a', '#8a6242'), endc=('#9a7650', '#c8a478'), tag='seat')
    with at((-0.16, 0.355, 1.35), ry=a):
        def cush(p, n): return mix('#a8483c', '#ee7f62', clamp(n.z * 0.7 + 0.3))
        put(box(0.46, 0.06, 0.25, (0, 0, 0), r=0.026, seg=1), cush, 'cushion')
        put(box(0.46, 0.022, 0.05, (0, 0.03, 0.0), r=0.0), '#fff0dc', 'cushion')
    # ---- the crate of supplies: slats on corner posts, veg and a fish on top
    with at((1.0, 0, 0.55), ry=-0.5):
        W_ = '#cda070'; D_ = '#9c7450'
        wd = lambda c, s=0: wood(c, seed=s)
        for (x, z) in ((-0.23, -0.17), (0.23, -0.17), (-0.23, 0.17), (0.23, 0.17)):
            put(box(0.055, 0.34, 0.055, (x, 0.17, z), r=0.012), wd(D_, 2), 'crate')
        for k, y in enumerate((0.065, 0.165, 0.265)):
            for sz in (-1, 1):
                put(box(0.5, 0.082, 0.032, (0.004 * k, y, sz * 0.18), r=0.01), wd(W_, k + 3), 'crate')
            for sx in (-1, 1):
                put(box(0.032, 0.082, 0.34, (sx * 0.245, y, 0), r=0.01), wd(W_, k + 7), 'crate')
        put(box(0.46, 0.26, 0.33, (0, 0.12, 0), r=0.0), mul(D_, 0.5), 'crate')      # (the inside)
        # carrot, cabbage, turnip, heaped
        put(glathe([(0, -0.1), (0.05, 0.03), (0.042, 0.075), (0, 0.086)], 7, pos=(-0.14, 0.32, -0.04), rz=0.8), lambda p, n: mix('#e87020', '#ffa050', clamp(n.z * 0.6 + 0.55)), 'veg')
        put(glathe([(0, -0.1), (0.05, 0.03), (0.042, 0.075), (0, 0.086)], 7, pos=(-0.12, 0.33, 0.06), rz=-0.55, ry=0.4), lambda p, n: mix('#e87020', '#ffa050', clamp(n.z * 0.6 + 0.55)), 'veg')
        for x, y, z, rz_ in ((-0.21, 0.385, -0.05, 0.8), (-0.05, 0.395, 0.1, -0.55)):
            for k in (-0.5, 0.4):
                put(sph(0.042, (x + k * 0.03, y + 0.022, z), sc=(0.5, 1.3, 0.5), rz=k + rz_, K=6, J=3), lambda p, n: mix('#4e9440', '#9ad060', clamp(n.z)), 'veg')
        put(sph(0.105, (0.075, 0.345, -0.05), sc=(1, 0.92, 1), K=10, J=5), lambda p, n: mix('#68ac50', '#c4e68c', clamp(n.z * 0.75 + 0.25)), 'veg')
        for k in range(4):
            ak = k * TAU / 4 + 0.3
            put(sph(0.082, (0.075 + math.cos(ak) * 0.062, 0.325, -0.05 + math.sin(ak) * 0.062), sc=(1, 0.8, 0.46), ry=-ak + PI / 2, rx=0.22, K=7, J=3), lambda p, n: mix('#4e9440', '#8cc860', clamp(n.z * 0.7 + 0.3)), 'veg')
        put(sph(0.074, (0.13, 0.335, 0.075), sc=(1, 0.88, 1), K=9, J=5), lambda p, n: mix('#fff4e6', '#c85aa4', smooth(0.33, 0.42, p.z)), 'veg')
        # a fish lying over the top
        with at((0.0, 0.415, 0.09), ry=0.5):
            put(sph(0.1, (0, 0, 0), sc=(0.5, 0.42, 1.55), K=9, J=5), lambda p, n: mix('#eef2f2', '#5a7e92', smooth(-0.1, 0.5, n.z)), 'veg')
            put(glathe([(0.01, -0.02), (0.058, 0.03), (0.02, 0.05), (0, 0.04)], 5, pos=(0, 0, -0.16), rx=-PI / 2), '#4e6e82', 'veg')
            for s in (-1, 1):
                put(sph(0.018, (s * 0.04, 0.012, 0.09), K=5, J=2), '#fff8ee', 'veg'); put(sph(0.01, (s * 0.052, 0.012, 0.095), K=4, J=2), '#2a2028', 'veg')
    # ---- the forked skewer stand and a fish on a stick
    for s in (-1, 1):
        x = s * 0.31; z = 0.82
        log((x, -0.01, z), (x + s * 0.005, 0.4, z), 0.024, K=5, seed=s + 8, wob=0.05, bark=('#7a5234', '#a87c52'))
        for q in (-1, 1):
            vtube([(x, 0.38, z), (x + q * 0.012, 0.44, z + q * 0.04), (x + q * 0.012, 0.5, z + q * 0.06)], lambda u: 0.0175 - 0.004 * u, K=4, col=lambda p, n: mix('#7a5234', '#a87c52', clamp(n.z + 0.3)), tag='fork')
    log((-0.42, 0.44, 0.82), (0.42, 0.44, 0.82), 0.0145, K=5, seed=9, wob=0.0, bark=('#b48a58', '#d8b078'), tag='skewer')
    with at((0.02, 0.44, 0.82), ry=PI / 2):
        def grilled(p, n):
            c = mix('#f0d4a0', '#c8783a', smooth(-0.25, 0.3, n.z))
            if n.z > 0.0 and math.sin(p.x * 62) > 0.55: return mix(c, '#4a2c20', 0.72)
            return c
        put(sph(0.11, (0, 0, 0), sc=(0.5, 0.56, 1.65), K=10, J=6), grilled, 'skewerFish')
        root = [V3(0, -0.01 + i * 0.01, 0) for i in range(3)]
        put(glathe([(0.012, -0.02), (0.066, 0.026), (0.024, 0.05), (0, 0.044)], 6, pos=(0, 0, -0.175), rx=-PI / 2), '#b86c34', 'skewerFish')
        for s in (-1, 1):
            put(sph(0.02, (s * 0.048, 0.02, 0.11), K=5, J=2), '#fff8ee', 'skewerFish'); put(sph(0.011, (s * 0.062, 0.02, 0.116), K=4, J=2), '#2a2028', 'skewerFish')
    # ---- a tied bundle of firewood on the cook's left
    with at((-0.98, 0, 0.5), ry=0.62):
        for (x, y) in ((-0.085, 0.075), (0.085, 0.075), (0.0, 0.205)):
            a_ = GW((x, y, -0.3)); b_ = GW((x + 0.008, y, 0.3))
            log(a_, b_, 0.078, K=7, seed=int(x * 90) + 21, wob=0.05, tag='bundle')
        for z in (-0.13, 0.13):
            # (the rope hugs the stack: a hull round its three logs)
            P = [toB(GW((x_, y_, z))) for x_, y_ in ((-0.085, -0.012), (0.085, -0.012), (0.17, 0.07), (0.15, 0.15), (0.075, 0.262), (0.0, 0.296), (-0.075, 0.262), (-0.15, 0.15), (-0.17, 0.07))]
            put(tube_loop(P, lambda s: 0.016, K=4), lambda p, n: mix('#a88a50', '#ecd6a0', clamp(n.z * 0.6 + 0.5)), 'rope')
    ray_ao(DMAX=0.42, K=0.58, ground=0.0, NR=16, off=0.006, gsize=4.0)
    export_piece('prop-campfire', budget=6000)
