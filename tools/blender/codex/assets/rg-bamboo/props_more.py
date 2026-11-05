# rg-bamboo: the torii, the stone lantern, the wind chimes and the bamboo bench. exec'd into build_rg-bamboo.py's globals
# (it uses that script's kits, painters and helpers).

# ================================================================== shared: bamboo poles, cloth strips
def bpole(a, b, r, col='#98bc5c', node='#5e8e42', step=0.36, K=8, tag='pole', mat='body', cap='#e2d6a0'):
    """a bamboo pole a -> b (game-local): node rings as small bulges with dark bands every ~step, a cut pale top"""
    A_, B_ = F.W(a), F.W(b); L = (B_ - A_).length; d = (B_ - A_).normalized(); nn = max(1, round(L / step))
    ts = [0.0]; rk = [1.0]
    for k in range(1, nn):
        t = k / nn; e = min(0.03 / L, 0.4 / nn)
        ts += [t - e, t, t + e]; rk += [1.0, 1.12, 1.0]
    ts.append(1.0); rk.append(0.96)
    path = [A_.lerp(B_, t) for t in ts]; npt = len(path)
    tb = tube(path, lambda s_: r * rk[min(npt - 1, round(s_ * (npt - 1)))], K=K, caps=True)
    knots = [k / nn * L for k in range(1, nn)]
    hi = mix(col, '#e8f0b0', 0.35)
    def f(p, n):
        u = (p - A_).dot(d)
        if u > L - 0.004 and n.dot(d) > 0.5: return cap
        c = mix(mul(col, 0.8), hi, clamp(n.z * 0.4 + 0.45 - n.y * 0.2))
        dk = min([abs(u - q) for q in knots] or [9])
        if dk < 0.03: c = mix(c, node, 0.75)
        return c
    put(tb, f, tag, mat)

def card(c, w, h, th, side, up, nrm):
    """a flat box (own verts per face): centre c, width along side, height along up, thickness along nrm"""
    t = PTmp(); corners = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1): corners[(sx, sy, sz)] = c + side * (sx * w / 2) + up * (sy * h / 2) + nrm * (sz * th / 2)
    for ax_, n_ in ((0, side), (1, up), (2, nrm)):
        for sg in (-1, 1):
            quad = []
            for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                key = [0, 0, 0]; key[ax_] = sg; o_ = [i for i in range(3) if i != ax_]; key[o_[0]] = u; key[o_[1]] = v
                quad.append(t.vert(corners[tuple(key)], n_ * sg))
            t.face(quad, n_ * sg)
    return t

# ================================================================== 3. the trail torii (kit torii, w 3.2, h 3.4)
def build_torii():
    new_asset(); W, H = 3.2, 3.4; L_ = GL
    REDP = DG['lacquer_painter'](VERM, VERM_DK, VERM_HI, spec='#ffd0b4', moss_below=0.7, seed=4)
    REDB = DG['lacquer_painter'](VERM, VERM_DK, VERM_HI, spec='#ffd0b4', seed=5)
    BLK = DG['lacquer_painter']('#3a3040', '#241e2a', '#5a4c62', spec='#a898b4', sheen=0.6)
    GOLD = DG['lacquer_painter']('#d8a440', '#9a6a26', '#f6cf72', spec='#fff0c0', sheen=0.8)
    lean = 0.035
    def xat_of(sx):
        xb, xt = sx * (W / 2 + lean * H / 2), sx * (W / 2 - lean * H / 2)
        return lambda y: xb + (xt - xb) * y / H
    for sx in (-1, 1):
        xat = xat_of(sx)
        post = DG['Beam'](lambda s_, xat=xat: L_(xat(-0.15 + (H + 0.1) * s_), -0.15 + (H + 0.1) * s_, 0), Vector((1, 0, 0)),
                          lambda s_: 0.175 - 0.025 * s_, lambda s_: 0.175 - 0.025 * s_, e=1.0, cap=0.05)
        putp(post.build('post', 'torii', REDP, K=12, step=0.85, capn=1), 'posts', 'body')
        putp(DG['lathe']('plinth', 'torii', DGpaint(stone_paint('#8a8290', seed=8 + sx, moss=0.75, moss_up=0.25)), L_(xat(0), 0, 0),
                         [(0.31, -0.12), (0.305, 0.02), (0.29, 0.18), (0.25, 0.27), (0.19, 0.31)], K=12), 'plinths', 'stone')
        for (y0, r0, hh) in ((0.4, 0.192, 0.075), (H - 0.06, 0.162, 0.06)):
            putp(DG['lathe']('band', 'torii', BLK, L_(xat(y0), y0, 0), [(r0 * 0.92, -hh), (r0, -hh * 0.5), (r0, hh * 0.5), (r0 * 0.92, hh)], K=12), 'posts', 'body')
        for k in range(2):     # grass at the plinth's foot
            grass((xat(0) + sx * 0.32 + (k - 0.5) * 0.3, 0.0, 0.26 - k * 0.52), seed=20 + k + (sx + 1) * 3)
    # nuki through the posts, wedges (kusabi) at the joints
    ny = H * 0.76
    nk = DG['Beam'](lambda s_: L_(-(W / 2 + 0.38) + (W + 0.76) * s_, ny, 0), Vector((0, 0, 1)), lambda s_: 0.09, lambda s_: 0.11, e=0.55, cap=0.05)
    putp(nk.build('nuki', 'torii', REDB, K=10, step=1.2, capn=2), 'nuki', 'body')
    for sx in (-1, 1):
        xp = xat_of(sx)(ny)
        put(box(0.07, 0.15, 0.06, (xp + sx * 0.21, ny, 0.1), r=0.012), lac('#5a3a2c', '#8a6048', '#3a2420'), 'nuki', 'body')
    # gakuzuka strut and the gaku: a dark frame, a gold plate with a raised bamboo-leaf emblem (no text)
    gz = DG['Beam'](lambda s_: L_(0, ny + 0.09 + (H - ny - 0.09) * s_, 0), Vector((1, 0, 0)), lambda s_: 0.08, lambda s_: 0.07, e=0.55, cap=0.02)
    putp(gz.build('gakuzuka', 'torii', REDB, K=8, step=0.5, capn=1), 'gaku', 'body')
    gy = H * 0.885
    putp(DG['slab']('gaku', 'torii', BLK, 0.24, 0.3, 0.05, bottom=-0.05, rc=0.08, rb=0.025, nc=2, dish=0.0, wob=0.0,
                    xf=lambda q: L_(q.x, gy + q.y, 0.09 + q.z)), 'gaku', 'body')
    putp(DG['slab']('gaku_plate', 'torii', GOLD, 0.175, 0.235, 0.03, bottom=-0.01, rc=0.06, rb=0.015, nc=2, dish=-0.006, wob=0.0,
                    xf=lambda q: L_(q.x, gy + q.y, 0.14 + q.z)), 'gaku', 'body')
    with at((0, gy - 0.02, 0.172)):
        for k, (a, ln) in enumerate(((0.0, 0.2), (0.75, 0.17), (-0.75, 0.17))):
            leaf = [(0.0, 0.0), (0.035, ln * 0.35), (0.0, ln), (-0.035, ln * 0.35)]
            with at((0, -0.08, 0), rz=a):
                put(prism(leaf, 0.022, 0.0), lambda p, n: mix('#3c5a2c', '#6a8a40', clamp(n.z)), 'gaku', 'body')
    # shimaki (red) under the kasagi (black), both swept up at the ends; moss icing along the kasagi with drips
    def sweep(Lh, y0, rise, pw=2.6): return lambda s_: L_((s_ * 2 - 1) * Lh, y0 + abs(s_ * 2 - 1) ** pw * rise, 0)
    sm = DG['Beam'](sweep(2.0, H + 0.04, 0.2), Vector((0, 0, 1)), lambda s_: 0.155, lambda s_: 0.11, e=0.55, cap=0.08)
    putp(sm.build('shimaki', 'torii', REDB, K=10, step=0.3, capn=2), 'kasagi', 'body')
    ks = DG['Beam'](sweep(2.17, H + 0.26, 0.3), Vector((0, 0, 1)), lambda s_: 0.21 - 0.02 * abs(s_ * 2 - 1), lambda s_: 0.115, e=0.5, cap=0.1)
    putp(ks.build('kasagi', 'torii', BLK, K=12, step=0.3, capn=2), 'kasagi', 'body')
    a0, a1 = 0.45, ks.len - 0.45
    rr = random.Random(77)
    dl = [(rr.uniform(a0 + 0.25, a1 - 0.25), rr.uniform(0.14, 0.24), rr.uniform(0.3, 0.45)) for _ in range(4)]
    def lo(v):
        u = clamp((v - a0) / (a1 - a0)); tp = math.sqrt(max(0.0, math.sin(PI * u)))
        return PI / 2 - (0.6 + sum(d * math.exp(-((v - c) / wd) ** 2) for c, wd, d in dl)) * tp - 0.02
    def hi(v):
        u = clamp((v - a0) / (a1 - a0)); tp = math.sqrt(max(0.0, math.sin(PI * u))); return PI / 2 + 0.62 * tp + 0.02
    putp(DG['strip_moss']('kasagi_moss', ks.Sfn, a0, a1, 22, lo, hi, 0.04, MOSSP(6), ncross=5), 'kasagi', 'stone')
    for k, v in enumerate((1.25, 2.9)):           # two tufts of grass up on the kasagi
        pt, n_ = ks.Sfn(v, PI / 2)
        p_ = DG['Part']('kt%d' % k, 'flower', ao=0.3); rq = random.Random(30 + k)
        DG['grass_clump'](p_, pt + n_ * 0.03, n_, Vector((0, -1, 0)), rq, nb=3); p_.paint = TUFTP; putp(p_, 'grass', 'leaf')
    # the shimenawa between the posts and three shide
    ry0, sag = H * 0.7, 0.18
    rp = lambda t_: F.W((-(W / 2 - 0.12) + (W - 0.24) * t_, ry0 - math.sin(PI * t_) * sag, 0.03))
    rpts = [rp(k / 14) for k in range(15)]
    put(tube(rpts, lambda s_: 0.055 * (0.78 + 0.4 * math.sin(PI * s_)), K=7), rope_col(lambda p, n: p.x * 22 + math.atan2(n.z, -n.y) * 2), 'rope', 'body')
    for k, t_ in enumerate((0.27, 0.5, 0.73)):
        shide_tabs(rp(t_) + Vector((0, -0.07, -0.05)), Vector((0, -1, 0)), scale=1.05, tag='shide')
    return dict(posts=[[-W / 2, 0], [W / 2, 0]], h=H)

# ================================================================== 4. the stone lantern (kit lantern, s 0.85 with its pad)
def kasa_t(R0=0.36, y0=1.03, K=18):
    """a hexagonal kasa in toro-local Blender coords: sweeping concave roof, six corners pushed out and curled up"""
    prof = [(0.0, y0 - 0.01), (R0 * 0.95, y0), (R0 * 1.04, y0 + 0.04), (R0 * 0.96, y0 + 0.075), (R0 * 0.62, y0 + 0.12),
            (R0 * 0.3, y0 + 0.19), (R0 * 0.12, y0 + 0.23), (0.0, y0 + 0.24)]
    t = lathe(prof, K, th0=0.0)
    for i, v in enumerate(t.v):
        r_ = math.hypot(v.x, v.y)
        if r_ < 1e-6: continue
        th = math.atan2(v.y, v.x); cf = max(0.0, math.cos(6 * th)) ** 3
        k = clamp((r_ / R0 - 0.5) / 0.5)
        t.v[i] = Vector((v.x * (1 + 0.14 * cf * k), v.y * (1 + 0.14 * cf * k), v.z + 0.06 * cf * k ** 2))
    t.n = [None] * len(t.v)
    return t

# (all body, no 'stone': the trail lanterns are placed before the pond's flagstones, and a GLB stone bucket carries a uv
#  the kit's d:stone slabs lack: the first geometry in a batch sets its attributes)
def build_lantern():
    new_asset()
    LS = '#b4acb0'
    def st(seed, moss=0.45, up=0.5): return stone_paint(LS, hi='#e6dede', lo='#7a7280', seed=seed, moss=moss, moss_up=up)
    # the pad: a rounded stone disc with moss creeping over its rim, moss cushions round the foot
    put(glathe([(0.0, -0.06), (0.5, -0.06), (0.49, 0.06), (0.45, 0.11), (0.0, 0.115)], 12), st(1, 0.55, 0.4), 'pad', 'body')
    for k, (a, d, r_) in enumerate(((0.6, 0.46, 0.13), (2.5, 0.48, 0.11), (4.3, 0.44, 0.12))):
        put(dome(F.W((math.cos(a) * d, 0.0, math.sin(a) * d)), r_, r_ * 0.6, lobes=3, K=10, seed=10 + k, amp=0.07), moss_col(10 + k), 'moss', 'body')
    with at((0, 0.08, 0), s=0.85, ry=-PI / 2):
        Ms = F.m.copy()
        put(cyl(0.27, 0.3, 0.09, (0, 0.045, 0), K=6, bev=0.015), st(2, 0.5, 0.5), 'base', 'body')
        put(glathe([(0.0, 0.09), (0.23, 0.09), (0.24, 0.12), (0.2, 0.17), (0.0, 0.17)], 12,
                   rfn=lambda rr, z, th: rr * (0.9 + 0.1 * abs(math.cos(3 * th)))), st(3, 0.4), 'base', 'body')
        put(cyl(0.092, 0.11, 0.48, (0, 0.41, 0), K=8), st(4, 0.25, 0.7), 'post', 'body')
        for y, rr in ((0.3, 0.118), (0.58, 0.106)): put(cyl(rr, rr, 0.035, (0, y, 0), K=8), st(5, 0.0), 'post', 'body')
        put(glathe([(0.0, 0.615), (0.1, 0.615), (0.15, 0.64), (0.165, 0.665), (0.0, 0.665)], 12,
                   rfn=lambda rr, z, th: rr * (0.9 + 0.1 * abs(math.cos(3 * th)))), st(6, 0.3), 'chudai', 'body')
        put(cyl(0.245, 0.15, 0.09, (0, 0.705, 0), K=6, bev=0.012), st(7, 0.45, 0.5), 'chudai', 'body')
        # the fire box: a glowing core, corner posts, sill and lintel, paper fronts with a lattice, moon windows
        put(cyl(0.132, 0.132, 0.2, (0, 0.86, 0), K=6), lambda p, n: '#fff0c8', 'firebox', 'glow', uv=lambda p: (0.7, 0.0))
        for k in range(6):
            a = (k + 0.5) / 6 * TAU
            put(box(0.055, 0.22, 0.055, (math.cos(a) * 0.15, 0.86, math.sin(a) * 0.15), r=0.0, ry=-a), st(8, 0.0), 'firebox', 'body')
        put(cyl(0.205, 0.205, 0.035, (0, 0.765, 0), K=6), st(9, 0.0), 'firebox', 'body')
        put(cyl(0.19, 0.215, 0.035, (0, 0.97, 0), K=6), st(9, 0.0), 'firebox', 'body')
        for k in range(6):
            a = k / 6 * TAU
            with at((math.cos(a) * 0.128, 0.86, math.sin(a) * 0.128), ry=-a + PI / 2):
                if k % 3 == 0:     # front / back: the paper glows through a dark cross lattice
                    put(box(0.026, 0.19, 0.02, (0, 0, 0.016), r=0.0), flat('#4a3a30'), 'firebox', 'body')
                    put(box(0.13, 0.026, 0.02, (0, 0.02, 0.016), r=0.0), flat('#4a3a30'), 'firebox', 'body')
                else:              # sides: a stone panel; two of them with a round moon window glowing through
                    put(box(0.13, 0.2, 0.026, (0, 0, 0.0), r=0.0), st(11, 0.0), 'firebox', 'body')
                    if k % 3 == 1:
                        put(cyl(0.045, 0.045, 0.02, (0, 0.01, 0.014), K=10, rx=PI / 2), lambda p, n: '#fff4d8', 'firebox', 'glow', uv=lambda p: (0.7, 0.0))
        # the kasa with its curled corners, its moss icing, the petal cup and the hoju jewel
        kt = kasa_t(); kt.xform(Ms)
        put(kt, lambda p, n: mix(mul(LS, 0.72), mix(LS, '#ece6e4', 0.4), clamp(n.z)) if n.z > -0.3 else mul(LS, 0.62), 'kasa', 'body')
        KT = [(0.0, 1.27), (0.043, 1.265), (0.108, 1.22), (0.223, 1.15), (0.346, 1.105), (0.374, 1.07)]
        def kF(th, h):
            zz = KT[-1][1]
            for (r0, z0), (r1, z1) in zip(KT, KT[1:]):
                if h <= r1: zz = z0 + (z1 - z0) * (h - r0) / (r1 - r0); break
            return Ms @ Vector((math.cos(th) * h, math.sin(th) * h, zz + 0.004))
        ldr = [(0.4 + k * TAU / 5 + 0.3 * math.sin(k * 2.1), 0.05 + 0.025 * ((k * 3) % 4), 0.4) for k in range(5)]
        put(drape(kF, drip_he(lambda th: 0.2 + 0.02 * math.sin(3 * th), ldr), lambda th, s_: 0.035 + 0.012 * s_, drip_angles(14, ldr), J=3,
                  inner=Ms @ Vector((0, 0, 1.15)), bead=True), moss_col(21), 'kasacap', 'body')
        put(glathe([(0.0, 1.25), (0.06, 1.255), (0.08, 1.29), (0.0, 1.3)], 8), st(12, 0.3), 'jewel', 'body')
        put(glathe([(0.0, 1.29), (0.05, 1.3), (0.062, 1.34), (0.035, 1.39), (0.0, 1.42)], 8), st(13, 0.0), 'jewel', 'body')
    return dict(light=[0, 0.811, 0])

# ================================================================== 5. the wind chimes (kit chimes, L 4.2, h 2.5; along local x from 0 to L)
def build_chimes():
    new_asset(); Lc, Hc = 4.2, 2.5
    for x in (0.0, Lc):
        bpole((x, -0.1, 0), (x, Hc, 0), 0.06, col='#98bc5c', node='#5e8e42', tag='poles')
        put(dome(F.W((x, 0.0, 0)), 0.2, 0.09, lobes=3, K=10, seed=int(x) + 3, amp=0.08), moss_col(int(x) + 3), 'foot', 'stone')
        put(gloop([(x + 0.075 * math.cos(TAU * k / 8), Hc - 0.13, 0.075 * math.sin(TAU * k / 8)) for k in range(8)], 0.018, K=4), soft(STRAW_DK, 0.2), 'ties', 'body')
        grass((x + 0.18, 0.0, 0.12), seed=40 + int(x)); grass((x - 0.15, 0.0, -0.14), seed=44 + int(x))
    sag = 0.28
    at_ = lambda t_: (t_ * Lc, Hc - 0.13 - math.sin(t_ * PI) * sag, 0.0)
    put(tube([F.W(at_(k / 16)) for k in range(17)], lambda s_: 0.022, K=6), rope_col(lambda p, n: p.x * 40 + math.atan2(n.z, -n.y) * 2), 'rope', 'body')
    glass = ['#bfe4ff', '#ffd0e0', '#d8f4d0', '#fff0b8', '#e0d4ff', '#c8f0ec']
    strips = ['#fff6e8', '#ff9ec0', '#8fd0ff', '#ffe07a', '#b8f0c8', '#e8c8ff']
    n = 6
    for i in range(n):
        t_ = (i + 0.7) / (n + 0.4); x, y, z = at_(t_); gc = glass[i]
        put(box(0.025, 0.1, 0.025, (x, y - 0.05, z), r=0.0), flat('#5a4a40'), 'cords', 'body')
        bt = y - 0.1
        prof = [(0.0, bt + 0.012), (0.035, bt + 0.006), (0.07, bt - 0.03), (0.09, bt - 0.09), (0.095, bt - 0.13),
                (0.085, bt - 0.135), (0.0, bt - 0.115)]
        def bell_col(p, nn, gc=gc, x=x, z=z, bt=bt):
            c = mix(mul(gc, 0.82), mix(gc, '#ffffff', 0.45), clamp(nn.z * 0.5 + 0.5))
            a = math.atan2(-p.y - z, p.x - x)
            if bt - 0.11 < p.z < bt - 0.03 and abs(math.sin(a * 1.5)) < 0.32: c = mix(c, '#ec5a3a', 0.85)    # goldfish dabs
            return c
        put(glathe(prof, 12, pos=(x, 0, z)), bell_col, 'bells', 'body')
        put(box(0.022, 0.12, 0.022, (x, bt - 0.17, z), r=0.0), flat('#5a4a40'), 'cords', 'body')
        put(sph(0.022, (x, bt - 0.23, z), K=6, J=3), flat('#c8a050'), 'cords', 'body')
        # the tanzaku: a paper strip that catches the wind (cloth: uv.y = 1 at its top)
        top = bt - 0.25; c = F.W((x, top - 0.17, z))
        t2 = card(c, 0.09, 0.34, 0.02, F.N((1, 0, 0)), F.N((0, 1, 0)), F.N((0, 0, 1)))
        sc = strips[(i * 2) % len(strips)]
        put(t2, lambda p, nn, sc=sc: mix(mul(sc, 0.9), sc, clamp(nn.z * 0.5 + 0.6)), 'tanzaku', 'cloth',
            uv=lambda p, c=c, top=top: (0.5 + (p.x - c.x) / 0.09, clamp((p.z - (top - 0.6)) / 0.6)))
    return dict(L=Lc, h=Hc)

# ================================================================== 6. the bamboo bench with a tea tray (kit bambooBench)
def build_bambooBench():
    new_asset(); w = 1.4
    for sx in (-1, 1):
        for sz in (-1, 1): bpole((sx * (w / 2 - 0.1), -0.02, sz * 0.18), (sx * (w / 2 - 0.1), 0.42, sz * 0.18), 0.045, col='#a8b060', node='#748040', step=0.3, tag='legs')
        bpole((sx * (w / 2 - 0.1), 0.38, -0.26), (sx * (w / 2 - 0.1), 0.38, 0.26), 0.04, col='#98a858', node='#6a7a40', step=0.3, tag='rails')
        for sz in (-1, 1):
            put(gloop([(sx * (w / 2 - 0.1) + 0.06 * math.cos(TAU * k / 7), 0.38 + 0.06 * math.sin(TAU * k / 7), sz * 0.18) for k in range(7)], 0.013, K=3, up=F.N((0, 0, 1))),
                soft(STRAW_DK, 0.2), 'ties', 'body')
    bpole((-(w / 2 - 0.1), 0.12, 0.18), ((w / 2 - 0.1), 0.12, 0.18), 0.035, col='#98a858', node='#6a7a40', step=0.4, tag='rails')
    for i in range(6):
        z = -0.2 + i * 0.08
        bpole((-w / 2, 0.45 + (i % 2) * 0.004, z), (w / 2, 0.45 + (i % 2) * 0.004, z), 0.036, col=('#c0c878' if i % 2 else '#b0b868'), node='#84904c', step=0.35, tag='slats')
    # the tea tray, a round teapot (lid, spout, handle) and two cups
    with at((0.36, 0.488, 0.0), ry=0.12):
        put(box(0.42, 0.03, 0.31, (0, 0.0, 0), r=0.012), wood('#6e4c3a'), 'tray', 'body')
        for sz in (-1, 1): put(box(0.42, 0.04, 0.03, (0, 0.025, sz * 0.14), r=0.01), wood('#5a3c2e'), 'tray', 'body')
        pc = lambda p, n: mix('#3e4e62', '#7a92a8', clamp(n.z * 0.6 + 0.35 - n.y * 0.2))
        put(sph(0.085, (-0.06, 0.085, 0.0), sc=(1.0, 0.82, 1.0), K=10, J=6), pc, 'pot', 'body')
        put(glathe([(0.0, 0.14), (0.045, 0.14), (0.05, 0.155), (0.02, 0.17), (0.0, 0.185)], 8, pos=(-0.06, 0, 0)), pc, 'pot', 'body')
        put(glathe([(0.0, 0.0), (0.026, 0.0), (0.016, 0.1), (0.0, 0.1)], 6, pos=(0.02, 0.06, 0.0), rz=-1.0), pc, 'pot', 'body')
        put(gtube([(-0.12, 0.13, 0.0), (-0.165, 0.1, 0.0), (-0.155, 0.04, 0.0)], 0.014, K=5), soft('#c8a060', 0.2), 'pot', 'body')
        for k, dz in enumerate((-0.085, 0.085)):
            put(glathe([(0.0, 0.0), (0.03, 0.0), (0.037, 0.06), (0.0, 0.05)], 8, pos=(0.11, 0.015, dz)), lambda p, n: mix('#d8d0c0', '#fff6ea', clamp(n.z * 0.5 + 0.5)), 'cups', 'body')
            put(cyl(0.03, 0.03, 0.006, (0.11, 0.07, dz), K=8), flat('#9ab868'), 'cups', 'body')
    return dict(seat=0.45)
