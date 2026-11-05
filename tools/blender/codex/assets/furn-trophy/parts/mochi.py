# ================================================================== King Mochi's Crown Cushion (floor, 1 x 1, h 0.62)
# The mochi king (public/models/mochi-king.glb): a pink-white mochi with a gold crown of ball-tipped points (a ruby in
# front, green and blue jewels), an ermine collar and a brown handlebar moustache. Here: a red lacquer stand with black
# apron, gold corner caps and tassels; the plump mochi cushion asleep and proud, moustache and all, its ermine collar
# round its base; the little crown askew on top.
def build_trophyMochiCrown():
    new_asset()
    red = lac('#b43438', hi='#e8765e', lo='#7a1a26')
    # -- the stand: four toy feet with gold toes, a black lacquer apron, the red top board
    foot = [(0.0, 0.0), (0.046, 0.0), (0.054, 0.014), (0.04, 0.036), (0.036, 0.05), (0.044, 0.07), (0.05, 0.09), (0.0, 0.09)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(gl_lathe(foot, 8, pos=(sx * 0.31, 0.0, sz * 0.31), colfn=lambda c, fn: GOLD if c.z < 0.024 else RED_LAC), fsh(0.2, 0.3, sheen=0.45), 'stand')
    add(box(0.7, 0.045, 0.7, (0, 0.1, 0), r=0.016), lac(BLACK_LAC, hi='#6a5a78'), 'stand')
    add(box(0.8, 0.05, 0.8, (0, 0.14, 0), r=0.022), red, 'stand')
    y0 = 0.165
    for k in range(4):     # a gold rim round the tray's top edge
        with at((0, y0 + 0.002, 0), ry=k * PI / 2):
            add(box(0.74, 0.008, 0.024, (0, 0, 0.375), r=0.0), gold(), 'stand')
    for sx in (-1, 1):
        for sz in (-1, 1):
            with at((sx * 0.4, y0, sz * 0.4), rx=-PI / 2):
                add(puffy([(0.0, 0.0), (-sx * 0.13, 0.0), (0.0, sz * 0.13)], 0.006, bev=0.003, z0=-0.002), gold(), 'stand')
            tassel((sx * 0.392, 0.122, sz * 0.392), '#ffc83a', L=0.07, r=0.019)
    # -- the mochi: a plump round cushion, sagging a touch, pink-white with a soft blush underneath
    mp = [(0.0, y0), (0.25, y0), (0.292, y0 + 0.026), (0.312, y0 + 0.075), (0.308, y0 + 0.13), (0.284, y0 + 0.188),
          (0.232, y0 + 0.244), (0.152, y0 + 0.288), (0.066, y0 + 0.31), (0.0, y0 + 0.314)]
    def mochi_col(p, n):
        c = mix('#ffc8d6', '#fff0f0', smooth(y0 + 0.02, y0 + 0.22, p.z))
        c = mix(c, '#fffaf6', clamp(n.z - 0.5) * 0.9)
        c = mix(c, '#ffe2ea', clamp(-n.y * 0.6 - 0.2) * 0.4)
        return mul(c, 0.97 + 0.04 * vnoise(p, 9.0, 4))
    add(gl_lathe(mp, 28, rfn=lambda r, z, th: r * (1 + 0.012 * math.sin(3 * th + 0.4) * smooth(y0, y0 + 0.1, z))), mochi_col, 'mochi')
    rf = prof_r(mp[3:])
    L = lambda th, y, lf=0.0: on_lathe(rf, th, y, lf)
    # sleepy happy eyes (closed arches), the king's handlebar moustache, pink cheeks, his chin jewel
    for s in (-1, 1):
        ye = y0 + 0.212
        add(gtube([L(s * 0.29 + d * 1.0, ye + dy, 0.007) for d, dy in ((-0.088, -0.014), (-0.046, 0.011), (0.0, 0.019), (0.046, 0.011), (0.088, -0.014))], 0.0095, K=5), flat('#3a2a30'), 'face')
        mo = [(0.012, y0 + 0.158), (0.08, y0 + 0.146), (0.16, y0 + 0.143), (0.235, y0 + 0.154), (0.28, y0 + 0.176), (0.262, y0 + 0.198), (0.228, y0 + 0.19)]
        add(gtube(catmull([L(s * a, y, 0.008) for a, y in mo], 9), lambda q: 0.018 * (1 - q) ** 0.8 + 0.0055, K=6),
            paint('#7a4a2c', hi='#b07a4a', top=0.3, bot=0.3), 'moustache')
        add_open(surf_patch(rf, 0.14, y0 + 0.17, 0.024, lift=0.003, seg=10, rings=1, th0=s * 0.47), flat('#ff9fb2'), 'face')
    with at(L(0.0, y0 + 0.112, 0.004), rx=0.3):
        add(dot(0.02, (0, 0, 0), sc=(1, 1, 0.4), K=10, J=2), gold(), 'face')
        add(dot(0.011, (0, 0, 0.007), sc=(1, 1.15, 0.6), K=8, J=2), lac('#e0283a', hi='#ff8a90'), 'face')
    # a dusting of starch on its top
    for x, z in ((-0.13, 0.08), (0.12, -0.1), (0.06, 0.14), (-0.08, -0.15)):
        yy = prof_r([(y, r) for r, y in mp[3:]])(math.hypot(x, z))
        add(sph(0.026, (x, yy - 0.003, z), sc=(1, 0.16, 0.8), K=6, J=2), flat('#fffcf8'), 'mochi')
    # the ermine collar round its base: a fluffy white roll with black tufts
    ring = [(0.302 * math.sin(TAU * k / 26), y0 + 0.024, 0.302 * math.cos(TAU * k / 26)) for k in range(26)]
    add(gloop(ring, lambda s: 0.031 + 0.003 * math.sin(s * TAU * 9), K=6), lambda p, n: mul(paint('#fff8f2', top=0.08, bot=0.3)(p, n), 0.95 + 0.06 * vnoise(p, 30.0, 2)), 'ermine')
    for k in range(9):
        a = (k + 0.5) / 9 * TAU + 0.2
        with at((0.329 * math.sin(a), y0 + 0.03 + 0.008 * (k % 2), 0.329 * math.cos(a)), ry=a):
            add(dot(0.0105, (0, 0, 0), sc=(1, 1.4, 0.5), K=8, J=2), flat('#2e2630'), 'ermine')
    # -- the crown, slipped askew on top
    R = 0.108
    with at((-0.035, y0 + 0.29, -0.01), rz=0.15, rx=-0.1, ry=0.25):
        band = [(0.0, 0.0), (R, 0.0), (R + 0.008, 0.012), (R + 0.012, 0.05), (R + 0.004, 0.058), (R - 0.008, 0.052), (R * 0.62, 0.074), (0.0, 0.084)]
        add(gl_lathe(band, 18, colfn=lambda c, fn: '#c8304a' if (math.hypot(c.x, c.y) < R - 0.004 and c.z > 0.05) else GOLD), fsh(0.2, 0.3, sheen=0.5), 'crown')
        for k in range(5):
            a = k / 5 * TAU
            with at(((R + 0.006) * math.sin(a), 0.03, (R + 0.006) * math.cos(a)), ry=a):
                with at((0, 0, 0), rx=0.16):
                    add(fan_shape([(-0.036, 0.0), (0.036, 0.0), (0.026, 0.03), (0.013, 0.064), (0.0, 0.08), (-0.013, 0.064), (-0.026, 0.03)], (0, 0, 0), T=0.009, Tb=0.007, centre=(0.0, 0.028)), gold(), 'crown')
                    add(sph(0.017, (0, 0.092, 0), K=6, J=3), gold(1.04), 'crown')
            g = k / 5 * TAU + TAU / 10
            with at(((R + 0.012) * math.sin(g), 0.026, (R + 0.012) * math.cos(g)), ry=g):
                add(dot(0.013, (0, 0, 0), sc=(1, 1.2, 0.55), K=8, J=2), lac(('#3ab070', '#3a7ad8')[k % 2], hi='#e8fff0'), 'crown')
        with at(((R + 0.013) * math.sin(0.0), 0.026, (R + 0.013)), ry=0.0):
            add(dot(0.018, (0, 0, 0), sc=(1, 1.2, 0.55), K=10, J=2), lac('#e0283a', hi='#ff9aa0'), 'crown')
