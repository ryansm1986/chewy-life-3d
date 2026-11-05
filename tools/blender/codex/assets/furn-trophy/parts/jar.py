# ================================================================== Danzaburo's Leaf Sake Jar (decor, 0.5 x 0.5, h 0.7)
# Danzaburo (public/models/danzaburo.glb): a tanuki in stone armour, a wide amber straw hat with a round green leaf on
# top, a striped tail and a cream sake flask on a cord. Here: a round tokkuri in amber glaze with a thick cream glaze
# poured over its shoulder (real drips), the tanuki's cream belly patch with a green leaf on it, a twisted straw rope
# and bow round the neck with a red-sealed paper tag, a cork stopper wearing a big red maple leaf, and his little straw
# hat (green leaf and all) hung on the cord against the jar's side; all on a round woven straw mat.
def build_trophyLeafJar():
    new_asset()
    MAPLE_L = [(0, 1.0), (0.12, 0.62), (0.42, 0.78), (0.3, 0.42), (0.5, 0.3), (0.16, 0.2), (0.06, 0.0), (-0.06, 0.0), (-0.16, 0.2), (-0.5, 0.3), (-0.3, 0.42), (-0.42, 0.78), (-0.12, 0.62)]
    # -- the woven mat
    mat = [(0.0, 0.0), (0.2, 0.0), (0.214, 0.01), (0.21, 0.024), (0.19, 0.03), (0.0, 0.031)]
    add(gl_lathe(mat, 24, colfn=lambda c, fn: ('#d8b670' if (angle_k(c, 24, PI / 24) + int(math.hypot(c.x, c.y) * 60)) % 2 else '#e8cc8a')), fsh(0.15, 0.3), 'mat')
    # -- the jar: amber glaze, an unglazed foot ring
    jp = [(0.0, 0.03), (0.1, 0.03), (0.128, 0.045), (0.17, 0.1), (0.198, 0.17), (0.205, 0.23), (0.195, 0.3), (0.165, 0.37),
          (0.12, 0.43), (0.08, 0.475), (0.058, 0.515), (0.054, 0.552), (0.064, 0.574), (0.06, 0.592), (0.044, 0.596), (0.0, 0.596)]
    def amber(c, fn):
        if c.z < 0.05: return '#c8a482'
        return mix('#a2542a', '#c87238', clamp(fn.z * 0.4 + 0.3))
    add(gl_lathe(jp, 26, colfn=amber), fsh(0.18, 0.32, sheen=0.6), 'jar')
    rfj = prof_r(jp[2:8])
    # the cream glaze poured over the shoulder: a proud shell with rounded drips (light tops, darker drip undersides)
    top = [(0.0, 0.596), (0.044, 0.596), (0.06, 0.592), (0.064, 0.574), (0.054, 0.552), (0.058, 0.515), (0.08, 0.475), (0.12, 0.43),
           (0.165, 0.37), (0.195, 0.3), (0.205, 0.23), (0.198, 0.17)]
    S, at_s = arc_param(top)
    def Fd(th, h):
        r, y = at_s(h)
        return F.W((r * math.sin(th), y, r * math.cos(th)))
    s42 = next(S[i] for i in range(len(top)) if top[i][1] <= 0.43)
    drips = [(0.35, 0.07, 0.2), (1.25, 0.05, 0.17), (2.2, 0.09, 0.22), (3.2, 0.06, 0.2), (4.15, 0.085, 0.22), (5.2, 0.05, 0.17), (5.85, 0.045, 0.14)]
    he = drip_he(lambda th: s42 + 0.012 * math.sin(3 * th + 0.5) + 0.006 * math.sin(7 * th), drips)
    ths = drip_angles(30, drips, offs=(-0.8, -0.35, 0.0, 0.35, 0.8))
    glz = drape(Fd, he, lambda th, s_: 0.0065, ths, 4, F.W((0, 0.45, 0)))
    add(glz, lambda p, n: mix(mix('#e6d2ae', '#fbf2de', clamp(n.z * 0.8 + 0.2)), '#fffaf0', clamp(-n.y * 0.4 + n.z * 0.4 - 0.3) ** 2 * 0.5), 'glaze')
    # the tanuki's belly patch and its green leaf
    add_open(surf_patch(rfj, 0.5, 0.215, 0.08, lift=0.003, seg=16, rings=2, th0=0.0), lambda p, n: paint('#f6e4c2', top=0.06, bot=0.2)(p, n), 'belly')
    lf = [(0.0, -0.05), (0.026, -0.034), (0.038, -0.006), (0.032, 0.022), (0.016, 0.042), (0.0, 0.054), (-0.016, 0.042), (-0.032, 0.022), (-0.038, -0.006), (-0.026, -0.034)]
    with at(on_lathe(rfj, 0.0, 0.215, 0.006), ry=0.0, rz=-0.4):
        add(fan_shape(lf, (0, 0, 0), T=0.006, Tb=0.003, centre=(0.0, 0.0)), lambda p, n: mix('#4a9a40', '#7cc05a', clamp(-n.y * 0.5 + n.z * 0.4)), 'belly')
        add(gtube([(0.0, -0.06, 0.006), (0.0, -0.02, 0.008), (0.0, 0.036, 0.007)], 0.0045, K=3, caps=False), flat('#2e6a2a'), 'belly')
    # -- the straw rope round the neck, a bow and its tails, the paper tag with a red seal
    ny = 0.488; nr = 0.072
    add(gloop([(nr * math.sin(TAU * k / 20), ny + 0.004 * math.sin(TAU * k / 20 * 3), nr * math.cos(TAU * k / 20)) for k in range(20)], 0.0095, K=4),
        lambda p, n: mix('#e8c878', '#b88a40', 0.5 + 0.5 * math.sin((p.x * 2 + p.z * 3 - p.y * 2) * 90)), 'rope')
    bz = nr + 0.008
    for s in (-1, 1):
        add(gtube(catmull([(0.006 * s, ny, bz), (0.03 * s, ny + 0.022, bz + 0.012), (0.055 * s, ny + 0.012, bz + 0.012), (0.04 * s, ny - 0.008, bz + 0.008), (0.008 * s, ny - 0.002, bz)], 7), 0.0075, K=4), soft('#dab86a'), 'rope')
    add(sph(0.013, (0.0, ny, bz + 0.004), K=6, J=3), soft('#d0a858'), 'rope')
    cordp = catmull([(0.008, ny - 0.006, bz + 0.004), (0.05, ny - 0.07, bz + 0.03), (0.1, ny - 0.15, 0.13), (0.125, 0.29, 0.15)], 8)
    add(gtube(cordp, 0.0058, K=3), soft('#d0a858'), 'rope')
    add(gtube(catmull([(-0.008, ny - 0.006, bz + 0.004), (-0.024, ny - 0.05, bz + 0.026), (-0.03, ny - 0.085, rfj(ny - 0.085) + 0.012)], 5), 0.0058, K=3), soft('#d0a858'), 'rope')
    with at((-0.032, ny - 0.13, rfj(ny - 0.13) + 0.012), ry=-0.12, rx=-0.55):
        add(rb(0.05, 0.072, 0.008, (0, 0, 0), r=0.004), paint('#fff6e4', top=0.1, bot=0.2), 'tag')
        add(fan_shape(MAPLE_L, (0, -0.024, 0.005), sc=0.036, T=0.003, Tb=0.001, centre=(0.0, 0.36)), flat('#d8303a'), 'tag')
    # -- the stopper and its big red maple leaf
    add(gl_lathe([(0.0, 0.556), (0.046, 0.556), (0.05, 0.6), (0.043, 0.628), (0.0, 0.632)], 12), wood('#c89060'), 'stopper')
    with at((0.0, 0.632, 0.0), ry=0.3, rx=-1.12):
        add(fan_shape(MAPLE_L, (0, -0.012, 0), sc=0.16, T=0.009, Tb=0.006, centre=(0.0, 0.36)),
            lambda p, n: mix(mix('#c8301e', '#ec4a2c', clamp(-n.y * 0.5 + n.z * 0.5 + 0.2)), '#ff9a3a', 0.0), 'leaf')
        for th in (0.0, 0.95, -0.95, 1.75, -1.75):
            add(gtube([(0.0, 0.05, 0.008), (math.sin(th) * 0.075, 0.05 + math.cos(th) * 0.075, 0.006)], lambda s_: 0.0045 - 0.0015 * s_, K=3, caps=False), flat('#a82418'), 'leaf')
        add(gtube([(0.0, 0.05, 0.004), (0.0, -0.02, 0.0), (0.008, -0.035, -0.006)], 0.005, K=4), flat('#7a3a1a'), 'leaf')
    # -- his little straw hat, hung on the cord against the jar's side (the green leaf on its crown)
    th = 0.78; yh = 0.235
    with at(on_lathe(rfj, th, yh, 0.012), ry=th):
        with at((0, -0.01, 0), rx=PI / 2 - 0.9, rz=0.35):
            hat = [(0.0, -0.006), (0.08, -0.006), (0.09, 0.0), (0.086, 0.01), (0.062, 0.03), (0.036, 0.054), (0.014, 0.072), (0.0, 0.076)]
            add(gl_lathe(hat, 20, colfn=lambda c, fn: ('#a8742c' if math.hypot(c.x, c.y) > 0.082 else mix('#c88c3a' if (angle_k(c, 20, PI / 20) + int(c.z * 70)) % 2 else '#dca452', '#e8bc66', clamp(c.z * 8)))), fsh(0.22, 0.34), 'hat')
            with at((0, 0.076, 0), rx=-0.5):
                add(fan_shape(lf, (0, 0.0, 0.0), sc=0.75, T=0.005, Tb=0.003, centre=(0.0, 0.0)), lambda p, n: mix('#4a9a40', '#86cc62', clamp(-n.y * 0.5 + n.z * 0.4)), 'hat')
