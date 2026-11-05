# ================================================================== Tamamo's Moon Lantern (light, 0.5 x 0.5, h 1.16)
# Tamamo (public/models/tamamo-toy.glb, tamamo-tail.glb): a white fox in a violet kimono with gold trim, a gold crescent
# moon in her hair and a white kitsune mask with red markings; her tails are fat teardrops, white at the root, lilac in
# the middle and sky blue at the tip. Here: a violet lacquer base with a gold rim, her nine tails fanned up behind the
# post like a peacock's train, a violet post with gold rings and a gold crescent finial, a crook holding the paper moon
# (glow) with her fox mask on its face and a lilac tassel beneath.
def build_trophyMoonLantern():
    new_asset()
    VIO = '#4c3e9e'; VIO_D = '#352a6e'
    # -- the base: violet lacquer, a gold band round its foot
    base = [(0.0, 0.0), (0.2, 0.0), (0.208, 0.012), (0.202, 0.03), (0.17, 0.05), (0.11, 0.064), (0.0, 0.068)]
    add(gl_lathe(base, 22, colfn=lambda c, fn: GOLD if 0.004 < c.z < 0.026 and math.hypot(c.x, c.y) > 0.19 else VIO), fsh(0.2, 0.3, sheen=0.5), 'base')
    # -- the nine tails: fat teardrops sweeping up and out behind the post, the tips flicking outward
    root = (0.0, 0.05, -0.015)
    prof = [(0.0, 0.0), (0.05, 0.03), (0.1, 0.08), (0.138, 0.15), (0.158, 0.23), (0.162, 0.31), (0.158, 0.38), (0.17, 0.445)]
    paths = []
    for k in range(9):
        a = (k - 4) / 4 * 1.45
        up = 1.0 - 0.32 * (abs(k - 4) / 4) ** 1.3 + 0.04 * (k % 2)
        d = (math.sin(a), -math.cos(a))
        pts = [(root[0] + d[0] * u, root[1] + y * up, root[2] + d[1] * u) for u, y in prof]
        paths.append(catmull(pts, 9))
    for k, P in enumerate(paths):
        W = [F.W(p) for p in P]
        def tail_col(p, n, W=W, k=k):
            best, bi = 1e9, 0
            for i, q in enumerate(W):
                dd = (p - q).length_squared
                if dd < best: best, bi = dd, i
            s_ = bi / (len(W) - 1)
            c = mix('#fbf8ff', '#d6c4f6', smooth(0.38, 0.72, s_))
            c = mix(c, '#a6d2fa', smooth(0.78, 0.98, s_))
            c = mul(c, 0.94 + 0.08 * clamp(n.z * 0.5 + 0.5) + 0.04 * (vnoise(p, 40.0, k) - 0.5))
            return c
        add(gtube(P, lambda s_: 0.01 + 0.058 * math.sin(PI * min(1.0, s_) ** 0.8) * (1 - 0.1 * s_), K=7), tail_col, 'tails')
    # -- the post: violet lacquer with gold rings, the crook arm, a gold crescent finial
    pz = -0.05
    add(cyl(0.018, 0.02, 0.98, (0, 0.55, pz), K=8), lac(VIO_D, hi='#7a6ab8'), 'post')
    for y in (0.36, 0.7, 1.0):
        add(cyl(0.024, 0.024, 0.018, (0, y, pz), K=8, bev=0.004), gold(), 'post')
    crook = catmull([(0, 1.02, pz), (0, 1.055, pz + 0.03), (0, 1.06, pz + 0.09), (0, 1.04, pz + 0.125), (0, 1.012, pz + 0.128)], 7)
    add(gtube(crook, 0.014, K=6), lac(VIO_D, hi='#7a6ab8'), 'post')
    with at((0, 1.11, pz), rz=0.35):     # (her hair ornament: a plump gold crescent, horns up)
        arc = [(0.034 * math.cos(a), 0.034 * math.sin(a), 0.0) for a in [PI * (0.12 + 1.36 * i / 8) for i in range(9)]]
        add(gtube(arc, lambda s_: 0.004 + 0.012 * math.sin(PI * s_), K=6), gold(), 'post')
    add(sph(0.016, (0, 1.065, pz), K=6, J=3), gold(), 'post')
    # -- the moon: a round paper lantern (glow), soft maria, lacquer caps, its cord and the lilac tassel
    R = 0.16; cy = 0.82; hz = pz + 0.125
    add(cyl(0.006, 0.006, 0.05, (0, cy + R + 0.016, hz), K=5), flat('#3a2f66'), 'moon')
    def moon_col(p, n):
        m = vnoise(p, 11.0, 7); m2 = vnoise(p, 26.0, 9)
        c = mix('#fff6de', '#f2deb2', clamp(m * 1.6 - 0.62) * 0.8 + clamp(m2 - 0.6) * 0.5)
        return mix(c, '#fffcf2', clamp(n.z) * 0.3)
    add(sph(R, (0, cy, hz), K=18, J=10), moon_col, 'moon', 'glow')
    for s in (1, -1):
        cap = [(0.0, 0.0), (0.052, 0.0), (0.056, 0.012 * s), (0.04, 0.022 * s), (0.0, 0.024 * s)]
        add(glathe(sorted(cap, key=lambda q: q[1]), K=10, pos=(0, cy + s * (R - 0.012), hz)), lac(VIO_D, hi='#7a6ab8'), 'moon')
    tassel((0, cy - R - 0.026, hz), '#b8a0ec', L=0.085, r=0.02, K=7)
    # -- the fox mask on the moon face: white, pointed ears, red markings, closed smiling eyes, a little nose
    mc = (0, cy, hz)
    mk = [(0.0, -0.062), (0.03, -0.054), (0.052, -0.022), (0.058, 0.012), (0.07, 0.07), (0.036, 0.04), (0.0, 0.046),
          (-0.036, 0.04), (-0.07, 0.07), (-0.058, 0.012), (-0.052, -0.022), (-0.03, -0.054)]
    zf = hz + R - 0.002
    with at((0, cy, zf)):
        t = puffy(mk[::-1], 0.008, bev=0.004, z0=0.0, centre=(0.0, 0.0))
    add(bend_sphere(t, mc, R + 0.004), lambda p, n: mix('#fbf6f0', '#ffffff', clamp(-n.y)), 'mask')
    zd = zf + 0.009
    def onmask(t): return bend_sphere(t, mc, R + 0.004)
    with at((0, cy, zd)):
        for s in (-1, 1):
            add(onmask(fan_shape([(s * 0.04, 0.036), (s * 0.06, 0.058), (s * 0.05, 0.03)], (0, 0, 0), T=0.003)), flat('#e04a3a'), 'mask')
            add(onmask(gtube([(s * 0.036, 0.004, 0.0), (s * 0.023, 0.013, 0.0), (s * 0.01, 0.005, 0.0)], 0.005, K=4)), flat('#3a2a30'), 'mask')
            add(onmask(gtube([(s * 0.012, 0.026, 0.0), (s * 0.03, 0.03, 0.0)], 0.0055, K=4)), flat('#e04a3a'), 'mask')
            add(onmask(gtube([(s * 0.03, -0.016, 0.0), (s * 0.05, -0.008, 0.0)], 0.005, K=4)), flat('#e04a3a'), 'mask')
        add(onmask(dot(0.009, (0, -0.032, 0.0), sc=(1.2, 0.9, 0.5), K=8, J=2)), flat('#3a2a30'), 'mask')
        add(onmask(gtube([(-0.012, -0.046, 0.0), (0.0, -0.042, 0.0), (0.012, -0.046, 0.0)], 0.0045, K=4)), flat('#e04a3a'), 'mask')
