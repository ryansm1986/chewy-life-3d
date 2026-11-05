# ================================================================== Umibozu's Sea Lantern (light, 0.5 x 0.5, h 1.2)
# Umibozu (public/models/umibozu.glb): a round teal sea monk with sleepy eyes, pink cheeks, a sprout on his head and a
# necklace of big pearls with one gold bead. Here: a sea-smoothed stone, a bleached driftwood post with a crooked arm,
# a rope down to an aqua glass float (glow) caught in a knotted net with a cork plug; his pearl necklace looped on the
# post, his little sprout growing from its top; a starfish, two shells and a tuft of seaweed on the stone.
def build_trophySeaLantern():
    new_asset()
    # -- the stone
    st = [(0.0, 0.0), (0.205, 0.0), (0.228, 0.03), (0.212, 0.074), (0.152, 0.102), (0.064, 0.114), (0.0, 0.115)]
    add(gl_lathe(st, 16, sx=1.0, rfn=lambda r, z, th: r * (1 + 0.07 * math.sin(3 * th + 0.6) + 0.04 * math.sin(5 * th + 1.1)), e=2.0),
        lambda p, n: mul(mix(mix('#8a96a0', '#c8d0d0', clamp(n.z * 0.8 + 0.1)), '#6a7884', clamp(0.03 - p.z) * 20), 0.94 + 0.1 * vnoise(p, 14.0, 5)), 'stone')
    # -- the driftwood post, its crooked arm and a stub of a branch
    px, pz = -0.11, -0.05
    dw = lambda p, n: mul(paint(mix('#dcd2c4', '#b4a898', 0.5 + 0.5 * math.sin(math.atan2(p.y + pz, p.x - px) * 5 + p.z * 9)), hi='#f2ece2', top=0.2, bot=0.3)(p, n), 0.95 + 0.08 * vnoise(p, 18.0, 2))
    post = catmull([(px, 0.06, pz), (px + 0.018, 0.3, pz - 0.008), (px - 0.014, 0.6, pz + 0.01), (px + 0.008, 0.9, pz - 0.006), (px + 0.004, 1.1, pz)], 12)
    add(gtube(post, lambda s_: 0.05 - 0.016 * s_ + 0.006 * math.sin(s_ * 19), K=7), dw, 'wood')
    arm = catmull([(px + 0.004, 1.03, pz), (px + 0.08, 1.1, pz + 0.03), (px + 0.17, 1.108, pz + 0.07), (px + 0.225, 1.07, pz + 0.085)], 7)
    add(gtube(arm, lambda s_: 0.03 - 0.01 * s_, K=6), dw, 'wood')
    add(gtube([(px - 0.01, 0.48, pz), (px - 0.06, 0.56, pz + 0.006), (px - 0.085, 0.585, pz + 0.01)], lambda s_: 0.016 - 0.008 * s_, K=5), dw, 'wood')
    # his sprout from the top of the post
    add(gtube(catmull([(px + 0.004, 1.09, pz), (px + 0.01, 1.14, pz + 0.004), (px + 0.03, 1.168, pz + 0.01)], 5), 0.0055, K=4), flat('#4a8a3a'), 'sprout', 'leaf')
    add(leafb(0.07, 0.05, (px + 0.03, 1.168, pz + 0.01), rz=-1.1, rx=0.3), lambda p, n: mix('#5aa84a', '#8ccc62', clamp(n.z * 0.6 - n.y * 0.3)), 'sprout', 'leaf')
    add(leafb(0.045, 0.034, (px + 0.008, 1.13, pz + 0.004), rz=0.9, rx=0.3), lambda p, n: mix('#5aa84a', '#8ccc62', clamp(n.z * 0.6 - n.y * 0.3)), 'sprout', 'leaf')
    # -- the rope from the arm, the float (glow) in its knotted net, the cork plug
    hx, hz = px + 0.222, pz + 0.085
    R = 0.135; cy = 0.82
    add(gtube([(hx, 1.07, hz), (hx + 0.002, 1.0, hz + 0.002), (hx, cy + R + 0.02, hz)], 0.0065, K=4), lambda p, n: mix('#d8bc8a', '#a88a60', 0.5 + 0.5 * math.sin(p.z * 300)), 'rope')
    add(sph(R, (hx, cy, hz), K=16, J=10), lambda p, n: mix(mix('#3a9cb0', '#7ad8e4', clamp(n.z * 0.6 + 0.5)), '#dcfcff', clamp(n.z * 0.5 - n.y * 0.4 - n.x * 0.3 - 0.2) ** 1.5 * 0.8), 'float', 'glow')
    add(dot(0.026, (hx - 0.05, cy + 0.06, hz + 0.105), sc=(1, 0.7, 0.3), K=8, J=2, ry=-0.4, rx=-0.45), flat('#f4fdff'), 'float')
    netc = lambda p, n: paint('#d4b47e', top=0.15, bot=0.3)(p, n)
    for k in range(4):
        a = k / 4 * PI + 0.2
        loop = [(hx + (R + 0.004) * math.sin(b) * math.cos(a), cy + (R + 0.004) * math.cos(b), hz + (R + 0.004) * math.sin(b) * math.sin(a)) for b in [TAU * i / 16 for i in range(16)]]
        add(gloop(loop, 0.0055, K=3), netc, 'net')
    for yy in (-0.45, 0.4):
        rr = (R + 0.006) * math.sqrt(1 - yy * yy)
        add(gloop([(hx + rr * math.sin(TAU * i / 14), cy + yy * R, hz + rr * math.cos(TAU * i / 14)) for i in range(14)], 0.0055, K=3), netc, 'net')
    for k in range(4):
        a = k / 4 * PI + 0.2
        for yy in (-0.45, 0.4):
            rr = (R + 0.008) * math.sqrt(1 - yy * yy)
            for sgn in (1, -1):
                x, z = hx + sgn * rr * math.cos(a), hz + sgn * rr * math.sin(a)
                if z - hz < -0.02: continue           # (only the knots the camera sees)
                add(sph(0.0085, (x, cy + yy * R, z), K=5, J=2), soft('#c8a470'), 'net')
    add(cyl(0.022, 0.026, 0.03, (hx, cy + R + 0.004, hz), K=8, bev=0.006), wood('#c89060'), 'float')
    # -- his pearl necklace looped round the post, one gold bead at the front
    ny = 0.6
    pts = []
    for i in range(11):
        t_ = i / 10; a = -1.2 + 2.4 * t_
        x = px + 0.07 * math.sin(a) + 0.006; z = pz + 0.07 * math.cos(a) + 0.03 * math.sin(PI * t_)
        y = ny - 0.1 * math.sin(PI * t_) + 0.02 * (t_ - 0.5)
        pts.append((x, y, z))
    for i, (x, y, z) in enumerate(pts):
        if i == 5: add(sph(0.026, (x, y, z), K=8, J=4), gold(), 'pearls')
        else: add(sph(0.02, (x, y, z), K=6, J=3), lambda p, n: mix(mix('#e8dcd2', '#fffaf4', clamp(n.z * 0.6 - n.y * 0.3 + 0.3)), '#ffe8f0', 0.15), 'pearls')
    # -- a starfish, two shells and a tuft of seaweed on the stone
    with at((0.07, 0.104, 0.07), rx=-PI / 2 + 0.3, rz=0.4):
        add(fan_shape(star_ol(5, 1.0, 0.44), (0, 0, 0), sc=0.068, T=0.01, Tb=0.004, centre=(0.0, 0.0)), lambda p, n: mix('#f06a3a', '#ffb07a', clamp(n.z * 0.6 + 0.1)), 'shells')
    sc_ol = [(0.0, -0.4)] + [(0.5 * math.cos(a), 0.05 + 0.45 * math.sin(a)) for a in [PI * (0.1 + 0.8 * i / 6) for i in range(7)]][::-1]
    for (x, z, r_, c) in ((0.14, -0.04, 0.5, '#ffa0b4'), (-0.02, 0.145, -0.6, '#fff0dc')):
        with at((x, 0.09, z), rx=-PI / 2 + 0.5, rz=r_):
            add(fan_shape(sc_ol[::-1], (0, 0, 0), sc=0.075, T=0.012, Tb=0.004, centre=(0.0, 0.05)), lambda p, n, c=c: mix(mul(c, 0.86), mix(c, '#ffffff', 0.4), clamp(n.z * 0.6 + 0.2)), 'shells')
    for k in range(5):
        a = k * 1.3 + 0.4; hgt = 0.1 + 0.025 * (k % 3)
        add(gtube(catmull([(-0.12, 0.07, 0.07), (-0.12 + math.sin(a) * 0.022, 0.07 + hgt * 0.5, 0.07 + math.cos(a) * 0.022), (-0.12 + math.sin(a) * 0.04, 0.07 + hgt, 0.07 + math.cos(a) * 0.04)], 5), lambda s_: 0.009 * (1 - s_) + 0.004, K=4),
            lambda p, n: mix('#3a8a4a', '#7ac46a', clamp((p.z - 0.07) * 8)), 'weed', 'leaf')
