# ================================================================== Karakasa's Umbrella Stand (floor, 0.5 x 0.5, h 1.22)
# Lord Karakasa (public/models/kasa-lord.glb): a red paper umbrella with scalloped folds, gold-orange tassels on its hem,
# a little gold crown on its tip, a paper ofuda with a red seal, one big eye, pink blush and a long pink tongue. Here
# he is folded up and stood in a blue-and-white glazed stand the way he stands in the fight (tip up, his one leg in the
# pot), tied with a gold cord; his eye half-lidded in a sly wink, the tongue lolling over the pot lip.
def build_trophyKasaStand():
    new_asset()
    COB = '#2f5cb4'; PORC = '#f2f5fb'
    # -- the glazed pot: rolled lip, a dark mouth, cobalt bands and a row of seigaiha wave crests
    pot = [(0.0, 0.0), (0.13, 0.0), (0.146, 0.014), (0.158, 0.05), (0.166, 0.13), (0.167, 0.22), (0.16, 0.305), (0.148, 0.352),
           (0.15, 0.37), (0.16, 0.388), (0.152, 0.402), (0.134, 0.398), (0.128, 0.372), (0.0, 0.335)]
    def pot_col(c, fn):
        r = math.hypot(c.x, c.y)
        if c.z > 0.33 and r < 0.14 and fn.z > -0.2: return '#1e2a4a'
        if 0.018 < c.z < 0.062 or 0.318 < c.z < 0.36: return COB
        if c.z > 0.375: return '#e8eef8'
        return PORC
    add(gl_lathe(pot, 20, colfn=pot_col), fsh(0.12, 0.3, sheen=0.55), 'pot')
    rfp = prof_r(pot[2:8])
    for k in range(8):
        th = (k + 0.5) / 8 * TAU; y = 0.15; rp = rfp(y)
        for rr, c in ((0.04, COB), (0.024, '#3f6cc4')):
            pts = [on_lathe(rfp, th + rr / rp * math.cos(PI * i / 4), y + rr * math.sin(PI * i / 4), 0.003) for i in range(5)]
            add(gtube(pts, 0.0062, K=3, caps=False), flat(c), 'waves')
    # -- his leg (the bamboo shaft) going down into the pot
    add(cyl(0.017, 0.017, 0.14, (0, 0.39, 0), K=6), paint('#c8a070', top=0.2, bot=0.3), 'umbrella')
    # -- the folded canopy: eight paper folds gathered over his leg, bulging, tapering up to the tip
    NF = 8
    cp = [(0.0, 0.45), (0.09, 0.452), (0.138, 0.472), (0.158, 0.52), (0.165, 0.585), (0.158, 0.66), (0.142, 0.745), (0.116, 0.842),
          (0.086, 0.938), (0.054, 1.024), (0.026, 1.084), (0.0, 1.104)]
    fold = lambda r, z, th: r * (1 - 0.15 * (0.5 - 0.5 * math.cos(NF * th)))
    def canopy_col(p, n):
        a = math.atan2(p.y, p.x) + PI / 2       # (0 at the front: game +z = Blender -y)
        f = 0.5 + 0.5 * math.cos(NF * a)
        c = mix('#b82a32', '#ea4a42', f)
        c = mix(c, '#ff8a72', clamp(f * (n.z * 0.6 - n.y * 0.4)) * 0.45)
        return mul(c, 0.92 + 0.1 * clamp(n.z * 0.5 + 0.5))
    t = lathe(cp, NF * 4, th0=-PI / 2, rfn=lambda r, z, th: fold(r, z, th + PI / 2)); t.xform(F.m)
    add(t, canopy_col, 'umbrella')
    rfc = prof_r(cp[1:])
    # gold-orange tassels on the hem, one at each fold rib
    for k in range(NF):
        th = k / NF * TAU
        x, z = 0.146 * math.sin(th), 0.146 * math.cos(th); Lt = 0.05; rt = 0.016
        def tc(p, n, x=x, z=z):
            a = math.atan2(p.y + z, p.x - x)
            return paint(mix('#f8b838', '#e0802a', 0.5 + 0.5 * math.cos(a * 5)), top=0.15, bot=0.3)(p, n)
        add(glathe([(0.0, -Lt), (rt, -Lt + 0.008), (rt * 0.85, -Lt * 0.4), (rt * 0.5, -0.008), (rt * 0.8, 0.002), (0.0, 0.012)], K=5, pos=(x, 0.466, z)), tc, 'tassels')
    # the gold tie cord round the folds
    yc = 0.8
    add(gloop([(0.12 * math.sin(TAU * k / 18), yc + 0.006 * math.sin(TAU * k / 9), 0.12 * math.cos(TAU * k / 18)) for k in range(18)], 0.0075, K=3),
        lambda p, n: mix('#f4c040', '#c88a20', 0.5 + 0.5 * math.sin((p.x * 3 + p.y * 2) * 60)), 'cord')
    # -- the face: the big eye with a dark rim, a heavy lid in a sly wink, lashes; blush; the mouth and the long tongue
    ye = 0.62
    E = Vector(on_lathe(rfc, 0.0, ye, 0.0))
    add(dot(0.083, (0, ye + 0.002, E.z - 0.02), sc=(1, 1.02, 0.36), K=12, J=3), flat('#2a1a22'), 'eye')
    add(dot(0.073, (0, ye, E.z - 0.014), sc=(1, 1.05, 0.44), K=16, J=3), lambda p, n: mix('#fffaf2', '#ece2ea', clamp(-n.z * 0.8)), 'eye')
    add(dot(0.042, (0.004, ye - 0.014, E.z + 0.012), sc=(1, 1.06, 0.42), K=14, J=2), lambda p, n: mix('#5a3020', '#a8683a', clamp(-n.z * 0.7 + 0.2)), 'eye')
    add(dot(0.025, (0.005, ye - 0.016, E.z + 0.022), sc=(1, 1.06, 0.4), K=12, J=2), flat('#22161c'), 'eye')
    add(dot(0.011, (-0.012, ye - 0.003, E.z + 0.03), sc=(1, 1, 0.5), K=8, J=2), flat('#fffaf2'), 'eye')
    add(sph(0.078, (0, ye + 0.034, E.z - 0.016), sc=(1.02, 0.6, 0.4), K=10, J=3), canopy_col, 'eye')
    def sclera_z(x, y): return E.z - 0.014 + 0.073 * 0.44 * math.sqrt(max(0.0, 1 - (x / 0.073) ** 2 - ((y - ye) / 0.077) ** 2))
    def lid_z(x, y): return E.z - 0.016 + 0.078 * 0.4 * math.sqrt(max(0.0, 1 - (x / 0.0796) ** 2 - ((y - ye - 0.034) / 0.0468) ** 2))
    def lid_edge(x):           # where the lid surface comes out in front of the eyeball (bisection up from below)
        lo_, hi_ = ye - 0.03, ye + 0.07
        for _ in range(30):
            m = (lo_ + hi_) / 2
            if lid_z(x, m) > sclera_z(x, m): hi_ = m
            else: lo_ = m
        return (lo_ + hi_) / 2
    xs = [-0.066, -0.044, -0.022, 0.0, 0.022, 0.044, 0.066]
    lash = [(x, lid_edge(x), max(lid_z(x, lid_edge(x)), sclera_z(x, lid_edge(x))) + 0.002) for x in xs]
    add(gtube(lash, lambda s: 0.0055 + 0.0025 * math.sin(PI * s), K=4), flat('#2a1a22'), 'eye')
    for x0, ax in ((0.058, 1.0), (0.068, 0.55)):
        y0_ = lid_edge(x0); z0_ = sclera_z(x0, y0_) + 0.002
        add(gtube([(x0, y0_, z0_), (x0 + 0.026 * math.sin(ax), y0_ + 0.012 * math.cos(ax), z0_ + 0.004)], lambda s: 0.006 - 0.003 * s, K=4), flat('#2a1a22'), 'eye')
    for s in (-1, 1):
        add_open(surf_patch(rfc, 0.15, ye - 0.05, 0.022, lift=0.004, seg=10, rings=1, th0=s * 0.7), flat('#ff98b0'), 'eye')
    add_open(surf_patch(rfc, 0.3, 0.525, 0.014, lift=0.003, seg=12, rings=1, th0=0.0), flat('#5a1a28'), 'mouth')
    tp = catmull([(0.004, 0.528, rfc(0.528) - 0.012), (0.01, 0.51, rfc(0.51) + 0.012), (0.014, 0.47, 0.178), (0.008, 0.42, 0.19), (-0.008, 0.37, 0.19), (-0.016, 0.336, 0.178)], 9)
    P = [F.W(p) for p in tp]
    def tprof(i):
        s_ = i / 8; w = 0.02 + 0.006 * math.sin(PI * s_ * 0.9) - 0.002 * s_; u = 0.0075
        return [(w * math.cos(TAU * k / 8), u * math.sin(TAU * k / 8)) for k in range(8)]
    add(sweep(P, tprof, up=Vector((0, -1, 0)), cap=True, inset=0.45, cap_d=0.008),
        lambda p, n: mix('#e85a74', '#ff8ea2', clamp(-n.y * 0.6 + n.z * 0.3 + 0.2)), 'tongue')
    # -- the ofuda on his front: a cream paper slip with a red seal ring and a red stripe
    th = 0.48; yo = 0.88
    with at(on_lathe(rfc, th, yo, 0.008), ry=th):
        with at((0, 0, 0), rx=-0.3, rz=0.08):
            add(rb(0.072, 0.13, 0.012, (0, 0, 0), r=0.005), paint('#fff2d8', top=0.1, bot=0.25), 'ofuda')
            add(gloopc([(0.019 * math.cos(TAU * k / 10), 0.008 + 0.019 * math.sin(TAU * k / 10), 0.008) for k in range(10)], 0.005, K=3), flat('#d8303a'), 'ofuda')
            add(dot(0.008, (0, 0.008, 0.008), sc=(1, 1, 0.5), K=8, J=2), flat('#d8303a'), 'ofuda')
            add(box(0.009, 0.026, 0.006, (0, 0.05, 0.006), r=0.0), flat('#d8303a'), 'ofuda')
            add(box(0.009, 0.03, 0.006, (0, -0.036, 0.006), r=0.0), flat('#d8303a'), 'ofuda')
    # -- his little gold crown on the tip
    R = 0.046
    with at((0, 1.07, 0), rz=-0.08):
        add(gl_lathe([(0.0, 0.0), (R, 0.0), (R + 0.006, 0.01), (R + 0.008, 0.032), (R + 0.002, 0.036), (R * 0.6, 0.042), (0.0, 0.046)], 10), gold(), 'crown')
        for k in range(5):
            a = k / 5 * TAU
            with at(((R + 0.004) * math.sin(a), 0.022, (R + 0.004) * math.cos(a)), ry=a):
                with at((0, 0, 0), rx=0.14):
                    add(fan_shape([(-0.022, 0.0), (0.022, 0.0), (0.014, 0.024), (0.0, 0.054), (-0.014, 0.024)], (0, 0, 0), T=0.007, Tb=0.006, centre=(0.0, 0.02)), gold(), 'crown')
                    add(sph(0.013, (0, 0.064, 0), K=5, J=3), gold(1.04), 'crown')
        add(dot(0.012, (0, 0.018, R + 0.01), sc=(1, 1.2, 0.55), K=8, J=2), lac('#e0283a', hi='#ff9aa0'), 'crown')
