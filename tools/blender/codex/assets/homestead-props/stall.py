# Usagi's Seed Stall: stands in for seedStallTemplate() (glbStandIn). Front +z, base at the origin, about 2.6 x 1.6 x 2.4 m; door (0, 0, 1) and the
# 0.72 m collider stay the template's, so the cart's solid middle stays inside the kit's and only low goods and the awning spread further.
# Materials body, leaf, cloth (uv.y = 1 at the attached top), window_glow (uv = flicker, tint). exec'd by build_homestead-props.py.
WD = '#c98f5e'; WD_L = '#e2b988'; WD_P = '#f0d4a4'; WD_D = '#94684a'; WD_K = '#6e4c36'
MINT = ('#62b896', '#92dcc0'); CREAM = ('#e8d8c4', '#fff6ea')
CROPC = ['#c86aa8', '#ff8a3a', '#8ccc62', '#6ab04e', '#ff4a5e', '#e8c060', '#ff9a3a', '#b8e07a', '#7ab8e8', '#f4a0b8']

def plank(w, h, d, pos, base=WD, ry=0.0, rx=0.0, rz=0.0, seed=0, tag='cart', c=0.016):
    return put(beam(w, h, d, pos, c=c, ry=ry, rx=rx, rz=rz), wood(base, seed=seed, nz=0.09), tag)

def wheel(x, z, r=0.37, th=0.07):
    y = r - 0.005
    # the rim: a fat ring, an iron tyre
    n_ = 18
    P = [toB((x, y + math.sin(TAU * j / n_) * r * 0.92, z + math.cos(TAU * j / n_) * r * 0.92)) for j in range(n_)]
    put(tube_loop(P, lambda s: th * 0.62, K=6), lambda p, n: mix(WD_K, WD_L, clamp(n.z * 0.6 + 0.45)), 'wheel')
    for k in range(6):
        a = k * TAU / 6 + 0.26
        vtube([(x, y + math.sin(a) * 0.06, z + math.cos(a) * 0.06), (x, y + math.sin(a) * r * 0.86, z + math.cos(a) * r * 0.86)], lambda s: 0.026 - 0.006 * s, K=5, col=lambda p, n: mix(WD_D, WD_L, clamp(n.z * 0.6 + 0.45)), tag='wheel')
    put(glathe([(0, -0.08), (0.056, -0.07), (0.078, -0.03), (0.078, 0.03), (0.056, 0.07), (0, 0.08)], 10, pos=(x, y, z), rz=PI / 2), lambda p, n: mix('#5e4a3a', '#a07850', clamp(n.z * 0.6 + 0.5)), 'wheel')
    put(glathe([(0, -0.02), (0.03, -0.012), (0.03, 0.012), (0, 0.02)], 7, pos=(x + (0.086 if x > 0 else -0.086), y, z), rz=PI / 2), '#e8c060', 'wheel')

def striped_awning(w=2.42, top=(1.98, -0.5), low=(1.7, 0.14), drop=0.2, n=9):
    """stripes of chunky cloth: each its own closed pillow, running from the top (attached) over the front edge to a rounded tongue"""
    yT, zT = top; yL, zL = low
    def path(s):
        # s 0..0.7 down the slope with a soft sag, 0.7..1 the hanging valance
        if s <= 0.7:
            t = s / 0.7
            return yT + (yL - yT) * t - 0.03 * math.sin(t * PI), zT + (zL - zT) * t
        t = (s - 0.7) / 0.3
        return yL - drop * t, zL + 0.018 * math.sin(t * PI)
    ss = [0.0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.8, 0.9, 0.97, 1.0]
    yBot = yL - drop
    for i in range(n):
        x0 = -w / 2 + w * i / n; x1 = x0 + w / n; xm = (x0 + x1) / 2
        cols = MINT if i % 2 == 0 else CREAM
        rings, cs = [], []
        for j, s in enumerate(ss[:-1]):
            y, z = path(s); e = 0.002
            y2, z2 = path(min(1, s + 0.02)); y1, z1 = path(max(0, s - 0.02))
            Ty, Tz = y2 - y1, z2 - z1; L = math.hypot(Ty, Tz); Ty /= L; Tz /= L
            Ny, Nz = Tz, -Ty       # outward: up and forward (a slope falling toward +z has T (-, +), N (+, +))
            if Ny < 0 and s < 0.7: Ny, Nz = -Ny, -Nz
            if s >= 0.7 and Nz < 0: Ny, Nz = -Ny, -Nz
            # the tongue narrows at its foot
            k = 1.0
            if s > 0.86: k = math.sqrt(max(0.0, 1 - ((s - 0.86) / 0.142) ** 2))
            hw = (x1 - x0) / 2 * k * 0.995
            tk = 0.017; pil = 0.022 * k
            ring = []
            for (ax, off) in ((-1, tk), (0, tk + pil), (1, tk), (1, -tk), (0, -tk), (-1, -tk)):
                ring.append(toB((xm + ax * hw, y + Ny * off, z + Nz * off)))
            rings.append(ring); cs.append(toB((xm, y, z)))
        y, z = path(1.0)
        t = Tmp()
        y0, z0 = path(0.0)
        ring_surface(t, rings, cs, toB((xm, y0, z0 - 0.012)), toB((xm, y - 0.004, z)))
        def col(p, n, cols=cols):
            c = mix(cols[0], cols[1], clamp(n.z * 0.62 + (-n.y) * 0.3 + 0.32))
            if n.dot(Vector((0, 0.5, -0.85))) > 0.4 and p.z > yL: c = mul(c, 0.74)      # (the underside)
            return c
        put(t, col, 'awning', 'cloth', uv=lambda p, x0=x0, w=w: ((p.x + w / 2) / w, clamp((p.z - yBot) / (yL - yBot))))   # (as the kit's: the slope stays put, v = 1; only the hanging valance sways, v 1 -> 0)

def seed_packet(x, y, z, c, ry=0.0, rx=-0.22, seed=0):
    with at((x, y, z), ry=ry, rx=rx):
        put(box(0.17, 0.23, 0.04, (0, 0.115, 0), r=0.012), lambda p, n: mix('#e4d4b8', '#fff6e2', clamp(n.z * 0.5 - n.y * 0.5 + 0.45)), 'packet')
        put(box(0.176, 0.05, 0.046, (0, 0.205, 0), r=0.0), lambda p, n: mix(mul(c, 0.8), c, clamp(n.z * 0.5 - n.y * 0.5 + 0.45)), 'packet')
        put(sph(0.05, (0, 0.092, 0.02), sc=(1, 1, 0.42), K=8, J=3), lambda p, n: mix(mul(c, 0.82), mix(c, '#ffffff', 0.18), clamp(n.z * 0.6 + 0.6)), 'packet')
        put(sph(0.019, (0.012, 0.145, 0.021), sc=(1.3, 0.6, 0.36), K=5, J=2, rz=-0.6), '#5aa84a', 'packet')

def seedling_pot(x, y, z, r=0.085, c=('#b05e3e', '#e89470'), seed=0, big=False):
    h = r * 1.15
    put(glathe([(0, 0), (r * 0.72, 0), (r * 0.98, h * 0.82), (r * 1.1, h * 0.84), (r * 1.1, h), (r * 0.9, h * 1.02), (0, h * 0.94)], 10, pos=(x, y, z)), lambda p, n: mix(c[0], c[1], clamp(n.z * 0.45 - n.y * 0.3 + 0.48)), 'pot')
    put(sph(r * 0.86, (x, y + h * 0.94, z), sc=(1, 0.2, 1), K=8, J=3), '#5a3e2e', 'pot')
    rosette((x, y + h * 0.96, z), 5 if big else 4, 0.17 if big else 0.13, 0.05, el=0.92, droop=0.4, seed=seed, st=(0.3, 0.62, 0.86), cols=('#3e8a3e', '#62ac4c', '#a4d868'), twist=seed)

def sack(x, z, r=0.2, h=0.46, c=('#a08458', '#e4cc98'), seed=0, c2=None):
    t = glathe([(0, 0), (r * 0.78, 0.0), (r, h * 0.2), (r * 1.02, h * 0.5), (r * 0.8, h * 0.74), (r * 0.42, h * 0.84), (r * 0.34, h * 0.88), (r * 0.58, h * 0.99), (r * 0.3, h * 1.02), (0, h * 0.95)], 13, pos=(x, 0, z),
                rfn=lambda rr, zz, th: rr * (1 + 0.05 * math.sin(th * 5 + seed + zz * 9)))
    put(t, lambda p, n: mul(mix(c[0], c[1], clamp(n.z * 0.5 - n.y * 0.25 + 0.48)), 0.97 + 0.05 * math.sin(p.x * 120) * math.sin(p.z * 120)), 'sack')
    P = [toB((x + math.cos(TAU * j / 10) * r * 0.37, h * 0.86, z + math.sin(TAU * j / 10) * r * 0.37)) for j in range(10)]
    put(tube_loop(P, lambda s: 0.016, K=4), '#e0503c', 'sack')
    if c2:
        put(sph(0.065, (x, h * 0.46, z + r * 0.96), sc=(1, 1, 0.4), K=10, J=3), lambda p, n: mix(mul(c2, 0.84), c2, clamp(n.z * 0.5 + 0.6)), 'sack')

def herb_bunch(x, y, z, seed=0, c=('#4e8e44', '#6eb054', '#b0d874')):
    """a bunch of herbs hung to dry: a tied stem, leaves fanning downward"""
    vtube([(x, y + 0.11, z), (x, y - 0.0, z)], 0.0125, K=4, col='#a88a50', mat='body', tag='herb')
    P = [toB((x + math.cos(TAU * j / 7) * 0.03, y, z + math.sin(TAU * j / 7) * 0.03)) for j in range(7)]
    put(tube_loop(P, lambda s: 0.0125, K=3), '#e0503c', 'herb')
    rnd = random.Random(seed)
    for k in range(5):
        a = k * TAU / 5 + rnd.uniform(-0.3, 0.3)
        leaf((x, y, z), a, -1.18 + rnd.uniform(-0.12, 0.12), 0.2 * rnd.uniform(0.85, 1.1), 0.042, droop=0.02, st=(0.3, 0.62, 0.86), cols=c, cup=0.1, mat='leaf', tag='herb')

def lantern(x, y, z):
    """a paper lantern on a cord: the paper's own material glows at dusk (flicker 0.7, warm tint 0.25)"""
    vtube([(x, y + 0.3, z), (x, y + 0.12, z)], 0.0125, K=4, col='#5e4a3a', tag='lantern')
    prof = [(0, -0.11), (0.056, -0.106), (0.088, -0.066), (0.104, 0.0), (0.088, 0.066), (0.056, 0.106), (0, 0.11)]
    t = glathe(prof, 10, pos=(x, y, z))
    def col(p, n, y=y):
        c = mix('#ffd9a0', '#fff0c8', clamp(1 - abs(p.z - y) / 0.11))
        return mul(c, 0.86) if abs(math.sin((p.z - y) * 76)) < 0.22 else c
    put(t, col, 'lantern', 'window_glow', uv=lambda p: (0.7, 0.25))
    for s in (-1, 1):
        put(glathe([(0, -0.02), (0.06, -0.02), (0.068, 0.0), (0.06, 0.02), (0, 0.02)], 8, pos=(x, y + s * 0.112, z)), lambda p, n: mix('#7a2c24', '#d8503c', clamp(n.z * 0.6 + 0.5)), 'lantern')
    put(cyl(0.016, 0.02, 0.05, (x, y - 0.152, z), K=5), '#d8503c', 'lantern')

def sign():
    """the hanging sign over the awning: a sprout and a carrot between a bunny's two ears (no words)"""
    y = 2.13
    with at((0, y, -0.56), rx=-0.05):
        put(box(0.86, 0.32, 0.07, (0, 0, -0.012), r=0.026, seg=1), lambda p, n: mix(WD_K, WD_D, clamp(n.z * 0.6 + 0.45)), 'sign')
        put(box(0.78, 0.245, 0.06, (0, 0, 0.012), r=0.022, seg=1), lambda p, n: mix('#f0dcb8', '#fff6e2', clamp(n.z * 0.5 - n.y * 0.5 + 0.4)), 'sign')
        # the carrot
        with at((-0.17, 0.0, 0.04), rz=-0.65):
            put(glathe([(0, -0.1), (0.032, -0.03), (0.042, 0.05), (0.022, 0.08), (0, 0.082)], 7, pos=(0, -0.008, 0)), lambda p, n: mix('#e87020', '#ffa050', clamp(n.z * 0.5 - n.y * 0.5 + 0.45)), 'sign')
            for k in (-0.55, 0, 0.55):
                put(sph(0.03, (math.sin(k) * 0.03, 0.112, 0), sc=(0.5, 1.4, 0.4), rz=-k, K=6, J=3), '#5aa84a', 'sign')
        # the sprout
        put(cyl(0.014, 0.018, 0.13, (0.16, -0.048, 0.045), K=5), '#5a9a44', 'sign')
        for s in (-1, 1):
            put(sph(0.054, (0.16 + s * 0.05, 0.05, 0.045), sc=(1.1, 0.62, 0.36), rz=s * 0.5, K=8, J=4), lambda p, n: mix('#4e9440', '#a0d468', clamp(n.z * 0.5 - n.y * 0.5 + 0.5)), 'sign')
        put(sph(0.022, (0, 0, 0.044), sc=(1, 1, 0.4), K=6, J=2), '#e0503c', 'sign')
    # the ears
    for s in (-1, 1):
        for mat_c, rr, zo in (('#fff4e6', 0.058, 0.0), ('#f4a8bc', 0.032, 0.03)):
            put(sph(rr, (s * 0.2, y + 0.2, -0.57 + zo), sc=(0.94, 1.72, 0.5), rz=-s * 0.14, K=8, J=4), lambda p, n, c=mat_c: mix(mul(c, 0.84), c, clamp(n.z * 0.5 - n.y * 0.5 + 0.5)), 'sign')
    # hangers to the posts' top rail
    for s in (-1, 1):
        put(cyl(0.03, 0.03, 0.2, (s * 0.33, y - 0.2, -0.52), K=5), lambda p, n: mix(WD_K, WD_D, clamp(n.z * 0.5 + 0.5)), 'sign')

def basket(x, y, z, r=0.2, h=0.15, ry=0.0):
    prof = [(0, 0), (r * 0.76, 0), (r * 0.96, h * 0.6), (r * 1.04, h), (r * 1.1, h * 1.06), (r * 1.02, h * 1.14), (r * 0.9, h * 1.0), (0, h * 0.82)]
    t = glathe(prof, 14, pos=(x, y, z), ry=ry)
    def col(p, n, yb=y):
        c = mix('#94683c', '#e0b878', clamp(n.z * 0.45 - n.y * 0.35 + 0.45))
        th = math.atan2(p.y, p.x); w = math.sin(th * 16 + (p.z - yb) * 60)
        return mul(c, 0.92 + 0.12 * (1 if w > 0 else -0.3))
    put(t, col, 'basket')

class PTmp_(Tmp):
    def orient(self): return self

def build_stall():
    new_asset()
    # ---- the cart: a plank bed on its frame, vertical boards on the front, two big wheels
    TOP = 0.8
    put(box(1.72, 0.44, 0.8, (0, 0.53, -0.02), r=0.03), wood(WD, seed=2, ao_z=None), 'cart')
    for i in range(8):
        x = -0.75 + i * 0.215
        plank(0.2, 0.44, 0.042, (x, 0.53, 0.388), base=(WD_L if i % 2 else '#d8aa78'), seed=i + 3, rz=(i % 3 - 1) * 0.008)
    for s in (-1, 1):
        plank(0.09, 0.56, 0.09, (s * 0.87, 0.5, 0.4), base=WD_D, seed=s + 3)
        plank(0.09, 0.56, 0.09, (s * 0.87, 0.5, -0.42), base=WD_D, seed=s + 5)
    plank(1.84, 0.075, 0.09, (0, 0.32, 0.4), base=WD_D, seed=7)
    plank(1.84, 0.075, 0.09, (0, 0.32, -0.42), base=WD_D, seed=8)
    for i in range(5):
        z = -0.42 + i * 0.205
        plank(1.96, 0.075, 0.195, (0.01 * (i % 2), TOP, z), base=(WD_P if i % 2 else WD_L), seed=i + 11)
    # the emblem plaque on the front boards: a round cream shield and a sprout
    put(glathe([(0, -0.012), (0.17, -0.012), (0.185, 0.0), (0.17, 0.016), (0, 0.022)], 14, pos=(0, 0.53, 0.42), rx=PI / 2), lambda p, n: mix(WD_K, '#fff0d8', smooth(0.1, 0.65, -n.y)), 'plaque')
    # (the stem: an open quad facing out, so the stall's ink hull draws no arc across the plaque)
    st_ = PTmp_(); nb_ = toB(V3(0, 0, 1)); q_ = [st_.vert(toB(V3(x_, y_, 0.446)), nb_) for x_, y_ in ((-0.02, 0.44), (0.02, 0.44), (0.015, 0.58), (-0.015, 0.58))]
    st_.face(q_, nb_); put(st_, '#5a9a44', 'plaque')
    for s in (-1, 1):
        put(sph(0.062, (s * 0.056, 0.6, 0.445), sc=(1.12, 0.62, 0.36), rz=s * 0.48, K=8, J=4), lambda p, n: mix('#4e9440', '#a0d468', clamp(-n.y * 0.5 + n.z * 0.5 + 0.5)), 'plaque')
    # the wheels, the shafts at its back and a block under them
    for s in (-1, 1):
        wheel(s * 1.03, -0.08)
        plank(0.07, 0.07, 0.42, (s * 0.66, 0.36, -0.6), base=WD_D, seed=20 + s, rx=0.28)
    plank(1.4, 0.07, 0.07, (0, 0.3, -0.8), base=WD_D, seed=23)
    # ---- the posts, a top rail, struts to the awning
    for s in (-1, 1):
        put(cyl(0.05, 0.058, 1.32, (s * 0.92, 1.47, -0.42), K=8, bev=0.012), lambda p, n: mix(WD_K, WD_L, clamp(n.z * 0.2 - n.y * 0.5 + n.x * 0.2 + 0.45)), 'posts')
        put(glathe([(0, -0.03), (0.06, -0.03), (0.07, 0.0), (0.05, 0.03), (0, 0.04)], 8, pos=(s * 0.92, 2.15, -0.42)), '#e8c060', 'posts')
        vtube([(s * 0.92, 1.4, -0.4), (s * 0.94, 1.56, -0.16), (s * 0.95, 1.67, 0.08)], 0.024, K=5, col=lambda p, n: mix(WD_D, WD_L, clamp(n.z * 0.6 + 0.4)), tag='posts')
    plank(1.9, 0.08, 0.08, (0, 1.95, -0.43), base=WD_D, seed=31)
    plank(2.3, 0.06, 0.06, (0, 1.68, 0.11), base=WD_D, seed=32)
    # ---- the awning
    striped_awning()
    sign()
    # ---- the tiered display: three steps of seed packets
    for k, (y, z, w) in enumerate(((TOP + 0.09, 0.0, 1.62), (TOP + 0.21, -0.2, 1.62))):
        plank(w, 0.12, 0.26, (0, y, z), base=WD_P, seed=40 + k)
    rnd = seeded('packets')
    for i, c in enumerate(CROPC):
        row = 0 if i < 5 else 1
        k = i if i < 5 else i - 5
        x = -0.58 + k * 0.29 + (0.07 if row else 0)
        y = TOP + 0.15 + row * 0.12; z = 0.015 - row * 0.2
        if row == 1 and k > 3: x = -0.58 + 0.07
        seed_packet(x + rnd.uniform(-0.012, 0.012), y, z, c, ry=rnd.uniform(-0.1, 0.1), rx=-0.22 + rnd.uniform(-0.04, 0.04))
    # ---- the front of the table: seedlings, a basket of veg, a crate of little pots
    y0 = TOP + 0.04
    seedling_pot(-0.82, y0, 0.26, 0.082, seed=3); seedling_pot(-0.62, y0, 0.3, 0.07, c=('#a85a44', '#e4a07c'), seed=5); seedling_pot(0.8, y0, 0.27, 0.085, seed=8, big=True)
    basket(0.14, y0, 0.26, 0.21, 0.13, ry=0.3)
    # (the veg in it: turnips, carrots, a cabbage)
    by = y0 + 0.13
    put(sph(0.092, (0.05, by + 0.03, 0.22), sc=(1, 0.9, 1), K=10, J=5), lambda p, n: mix('#68ac50', '#c8ea90', clamp(n.z * 0.75 + 0.25)), 'veg')
    for k in range(4):
        ak = k * TAU / 4 + 0.5
        put(sph(0.074, (0.05 + math.cos(ak) * 0.052, by + 0.012, 0.22 + math.sin(ak) * 0.052), sc=(1, 0.8, 0.46), ry=-ak + PI / 2, rx=0.22, K=7, J=3), lambda p, n: mix('#4e9440', '#8cc860', clamp(n.z * 0.7 + 0.3)), 'veg')
    tur = lambda p, n, y1=by: mix('#fff4e6', '#c85aa4', smooth(y1 + 0.02, y1 + 0.075, p.z))
    put(sph(0.076, (0.22, by + 0.022, 0.2), sc=(1, 0.88, 1), K=9, J=5), tur, 'veg')
    rosette((0.22, by + 0.09, 0.2), 3, 0.1, 0.034, el=1.0, droop=0.3, seed=2, st=(0.35, 0.74), mat='leaf', cols=('#4e9440', '#6eb054', '#a4d868'))
    for (x, z, a) in ((0.15, 0.34, -0.9), (0.26, 0.31, -0.5)):
        with at((x, by + 0.03, z), rz=a, ry=0.2, rx=0.5):
            put(glathe([(0, -0.09), (0.034, 0.015), (0.04, 0.06), (0.02, 0.078), (0, 0.08)], 8), lambda p, n: mix('#e87020', '#ffa050', clamp(n.z * 0.6 + 0.5)), 'veg')
            for k in (-0.5, 0.3):
                put(sph(0.036, (k * 0.02, 0.108, 0), sc=(0.46, 1.4, 0.46), rz=-k, K=6, J=3), '#62a84a', 'veg')
    # a little tray of sprouts in the middle-left
    with at((-0.28, y0, 0.26), ry=0.1):
        put(box(0.42, 0.075, 0.26, (0, 0.038, 0), r=0.014), wood(WD_D, seed=44), 'tray')
        put(box(0.37, 0.022, 0.21, (0, 0.076, 0), r=0.0), '#5a3e2e', 'tray')
        A_ = GW((0, 0, 0))
        for (x, z) in ((-0.12, -0.05), (0.0, -0.05), (0.12, -0.05), (-0.12, 0.06), (0.0, 0.06), (0.12, 0.06)):
            b = GW((x, 0.082, z))
            for s_ in (0.3, 0.3 + PI):
                leaf(b, s_ + x * 7, 0.55, 0.085, 0.036, droop=0.25, st=(0.34, 0.74), cols=('#5aa848', '#84c45a', '#c0ea80'), mat='leaf', tag='sprout')
    # ---- herbs hung to dry from the front rail, the lanterns at its ends
    for x, s in ((-0.5, 1), (-0.16, 2), (0.34, 3), (0.62, 4)):
        herb_bunch(x, 1.54, 0.16, seed=s, c=('#4e8e44', '#6eb054', '#b0d874') if s % 2 else ('#6e8e4c', '#94ac5c', '#d0d890'))
    for s in (-1, 1): lantern(s * 1.1, 1.38, 0.11)
    # ---- the low goods at its sides: sacks of seed, a bucket with a dipper, a stack of pots
    sack(-1.13, 0.48, 0.17, 0.42, seed=2, c2='#ff8a3a')
    sack(-0.86, 0.62, 0.135, 0.33, seed=5, c=('#98845c', '#e8d4a4'), c2='#8ccc62')
    # the bucket with water (painted, body)
    bx, bz = 1.1, 0.44
    put(glathe([(0, 0), (0.12, 0), (0.15, 0.2), (0.158, 0.22), (0.14, 0.235), (0.128, 0.2), (0, 0.19)], 12, pos=(bx, 0, bz)), lambda p, n: mix(WD_D, WD_L, clamp(n.z * 0.45 - n.y * 0.35 + 0.45)), 'bucket')
    for y in (0.055, 0.17):
        P = [toB((bx + math.cos(TAU * j / 12) * (0.128 + y * 0.1), y, bz + math.sin(TAU * j / 12) * (0.128 + y * 0.1))) for j in range(12)]
        put(tube_loop(P, lambda s: 0.0125, K=3), '#6e6a7c', 'bucket')
    put(sph(0.128, (bx, 0.2, bz), sc=(1, 0.05, 1), K=12, J=3), lambda p, n: mix('#3c8cc0', '#9cdcf0', clamp(1 - math.hypot(p.x - bx, -p.y - bz) / 0.128)), 'bucket')
    vtube([(bx - 0.14, 0.24, bz), (bx + 0.02, 0.4, bz + 0.02), (bx + 0.14, 0.24, bz)], 0.014, K=4, col='#6e6a7c', tag='bucket')
    # a stack of terracotta pots
    for k, (x, z, r) in enumerate(((0.8, 0.62, 0.11),)):
        put(glathe([(0, 0), (r * 0.74, 0), (r, r * 1.05), (r * 1.1, r * 1.08), (r * 1.1, r * 1.3), (r * 0.9, r * 1.3), (r * 0.8, r * 1.0), (0, r * 0.3)], 11, pos=(x, 0, z)), lambda p, n: mix('#a8583c', '#ec9a74', clamp(n.z * 0.45 - n.y * 0.3 + 0.48)), 'pot')
        put(sph(r * 0.86, (x, r * 1.14, z), sc=(1, 0.16, 1), K=8, J=3), '#5a3e2e', 'pot')
        rosette((x, r * 1.16, z), 5, 0.24, 0.066, el=0.92, droop=0.4, seed=19, st=(0.25, 0.5, 0.74, 0.92), cols=('#3e8a3e', '#62ac4c', '#a4d868'))
    # ---- a climbing vine up the left post
    P_ = [(-0.92 + 0.058 * math.cos(q * 3), 0.82 + q * 0.28, -0.42 + 0.058 * math.sin(q * 3)) for q in [k * 0.5 for k in range(8)]]
    vtube(P_, 0.0125, K=4, cols=('#5a8a3a', '#7ab04a'), mat='leaf', tag='vine')
    for k, pp in enumerate(P_[1:]):
        a = k * 2.4 + 0.5
        leaf(pp, a, 0.25, 0.16, 0.054, droop=0.42, st=(0.3, 0.62, 0.86), cols=('#3e8a3e', '#5ea648', '#a4d868'), tag='vine')
    ray_ao(DMAX=0.5, K=0.55, ground=0.0, NR=16, off=0.006, gsize=6.0)
    export_piece('poi-seedStall-0', budget=9000)
