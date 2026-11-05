# ================================================================== the captains' torn banners (wall, 0.5 x 1, h 0.98)
# The war banner each siege captain flew (src/regions/village/captains.js gear colours; models kamaitachi_storm,
# kakashi_oni, heikegani_brineclaw, yukidaruma_grand). A black lacquer pole on two pegs, sleeve loops, the banner (cloth:
# its uv.y = 1 at the hung top in glTF, so only the torn hem sways), the captain's crest embroidered on a lighter disc,
# a stitched patch, loose threads at the ragged hem, the red victory rosette with a paw pinned on its corner; and each
# captain's touch: Galeclaw's red scarf knotted on the pole, Strawgrin's straw in the hem and a crow on the pole,
# Brineclaw's gold crescent helm-crests on the pole ends, Frostbelly's snow and icicles on the pole.
BANNERS = {
    'bannerGaleclaw': dict(cloth='#2a7a6a', mark='#f4f0e0', edge='#1a4a40', crest='claws', fin='ball'),
    'bannerStrawgrin': dict(cloth='#7a2a1e', mark='#ffd07a', edge='#4a160e', crest='straw', fin='ball'),
    'bannerBrineclaw': dict(cloth='#1e3a5a', mark='#e8f4ff', edge='#0e2236', crest='claw', fin='crescent'),
    'bannerFrostbelly': dict(cloth='#3a3a6a', mark='#e8f0ff', edge='#1e1e44', crest='snow', fin='frost'),
}
BW, BTOP, BBOT, BZ0 = 0.42, 0.87, 0.19, 0.042

def b_rag(x):
    """the torn hem's height at x (torn lower on the right)"""
    return BBOT + 0.06 * (0.5 + 0.5 * math.sin(x * 61 + 1.3)) + 0.04 * (0.5 + 0.5 * math.sin(x * 23 + 0.4)) - 0.05 * max(0.0, x / BW * 2 - 0.2)

def b_cz(x, y):
    """the cloth's depth off the wall at (x, y): a soft ripple growing toward the hem"""
    t = clamp((BTOP - y) / (BTOP - BBOT))
    return BZ0 + 0.014 + 0.012 * math.sin(x * 14 + t * 3) * t + 0.01 * t * t

def b_uv(p):
    """cloth uv (Blender v = 0 at the hung top -> glTF uv.y = 1 there, the wind shader's attached edge)"""
    return (p.x * 2.0, 1.0 - clamp((p.z - BBOT) / (BTOP - BBOT)))

def on_cloth(t, zp):
    """move a decal built flat at game z = zp onto the rippled cloth (keeping each vertex's own offset from zp)"""
    for i, v in enumerate(t.v):
        off = -v.y - zp
        t.v[i] = Vector((v.x, -(b_cz(v.x, v.z) + off), v.z)); t.n[i] = None
    return t

def cloth_disc(R, cx, cy, lift, rings=3, seg=16):
    """a round patch lying on the rippled cloth (a polar grid, so it follows the ripple instead of fanning flat)"""
    t = Tmp()
    c = t.vert(F.W((cx, cy, b_cz(cx, cy) + lift))); ids = []
    for j in range(1, rings + 1):
        rr = R * j / rings; row = []
        for k in range(seg):
            x, y = cx + rr * math.cos(TAU * k / seg), cy + rr * math.sin(TAU * k / seg)
            row.append(t.vert(F.W((x, y, b_cz(x, y) + lift))))
        ids.append(row)
    nf = F.N((0, 0, 1))
    for k in range(seg):
        k1 = (k + 1) % seg
        t.face([c, ids[0][k], ids[0][k1]], nf)
        for j in range(rings - 1):
            t.face([ids[j][k], ids[j + 1][k], ids[j + 1][k1], ids[j][k1]], nf)
    t.open = True; t.orient(); t.normals(); t.done = True
    return t

def cl_add(t, col, tag):
    return add(t, col, tag, 'cloth', b_uv)

def crest_shapes(kind, m, C):
    """the captain's crest round (0, cy) on the cloth plane z = zp (decal shells, before on_cloth)"""
    out = []
    if kind == 'claws':          # Galeclaw: three gold sickle slashes under a wind swirl
        for k in (-1, 0, 1):
            pts = [(k * 0.048 + 0.045 - s * 0.09 + 0.018 * math.sin(s * PI), 0.08 - s * 0.17, 0.0) for s in [i / 7 for i in range(8)]]
            out.append((gtube(pts, lambda s: 0.003 + 0.011 * math.sin(min(1.0, s * 1.15 + 0.05) * PI), K=3), '#f4c84a'))
        sw = [(math.cos(s * 4.6) * (0.012 + s * 0.048), 0.11 + math.sin(s * 4.6) * (0.012 + s * 0.048) * 0.6, 0.0) for s in [i / 11 for i in range(12)]]
        out.append((gtube(sw, lambda s: 0.004 + 0.004 * s, K=3), m))
    elif kind == 'straw':        # Strawgrin: a scarecrow's straw hat over two crossed sheaves
        hat = [(-0.11, 0.04), (-0.05, 0.05), (-0.04, 0.1), (0.0, 0.13), (0.04, 0.1), (0.05, 0.05), (0.11, 0.04), (0.0, 0.065)]
        out.append((fan_shape(hat, (0, 0, 0), T=0.006, Tb=0.002, centre=(0.0, 0.07)), m))
        out.append((gtube([(-0.06, 0.062, 0.004), (0.0, 0.07, 0.006), (0.06, 0.062, 0.004)], 0.005, K=3), mul(m, 0.75)))
        for s in (-1, 1):
            out.append((gtube([(s * -0.07, -0.12, 0.0), (s * 0.05, 0.0, 0.0)], 0.011, K=3), m))
            for j in range(3):
                out.append((gtube([(s * 0.045, -0.004, 0.0), (s * (0.07 + j * 0.006), 0.03 + j * 0.008 - abs(j - 1) * 0.01, 0.0)], 0.0045, K=3), m))
        out.append((gtube([(-0.035, -0.04, 0.004), (0.035, -0.04, 0.004)], 0.007, K=3), mul(m, 0.78)))
    elif kind == 'claw':         # Brineclaw: one great crab pincer
        out.append((fan_shape(circ_ol(10, 0.058, 0.066), (-0.02, -0.03, 0.0), T=0.006, Tb=0.002, centre=(0.0, 0.0)), m))
        out.append((gtube(catmull([(0.0, 0.0, 0.0), (0.03, 0.055, 0.0), (0.07, 0.09, 0.0), (0.1, 0.098, 0.0)], 6), lambda s: 0.026 * (1 - s) ** 0.7 + 0.004, K=3), m))
        out.append((gtube(catmull([(0.02, -0.04, 0.0), (0.06, -0.026, 0.0), (0.088, 0.004, 0.0), (0.098, 0.03, 0.0)], 6), lambda s: 0.018 * (1 - s) ** 0.7 + 0.004, K=3), m))
        out.append((gtube([(-0.04, -0.085, 0.0), (-0.062, -0.135, 0.0)], lambda s: 0.016 - 0.005 * s, K=3), m))
        for x, y in ((0.035, 0.05), (0.06, 0.075), (0.055, -0.012), (0.074, 0.002), (-0.03, -0.02)):
            out.append((dot(0.0065, (x, y, 0.006), sc=(1, 1, 0.4), K=6, J=2), mul(m, 0.7)))
    else:                        # Frostbelly: a snowflake in a ring
        for k in range(3):
            a = k / 6 * TAU
            out.append((gtube([(-math.sin(a) * 0.1, -math.cos(a) * 0.1, 0.0), (0.0, 0.0, 0.0), (math.sin(a) * 0.1, math.cos(a) * 0.1, 0.0)], 0.0075, K=3), m))
        for k in range(6):
            a = k / 6 * TAU
            for s in (-1, 1):
                out.append((gtube([(math.sin(a) * 0.056, math.cos(a) * 0.056, 0.0), (math.sin(a) * 0.056 + math.sin(a + s * 0.8) * 0.03, math.cos(a) * 0.056 + math.cos(a + s * 0.8) * 0.03, 0.0)], 0.0055, K=3, caps=False), m))
        out.append((gloopc([(0.124 * math.cos(TAU * k / 18), 0.124 * math.sin(TAU * k / 18), 0.0) for k in range(18)], 0.0065, K=3), m))
    return out

def build_banner(P):
    new_asset()
    cloth, mark, edge = P['cloth'], P['mark'], P['edge']
    blk = lac(BLACK_LAC, hi='#6a5e7a')
    py, pz = BTOP + 0.03, BZ0
    # -- the pole, its pegs and finials
    add(cyl(0.017, 0.017, 0.45, (0, py, pz), K=8, rz=PI / 2), blk, 'pole')
    for s in (-1, 1):
        add(cyl(0.01, 0.01, pz + 0.01, (s * 0.17, py, pz / 2), K=6, rx=PI / 2), wood('#5a4030'), 'pole')
        x = s * 0.236
        if P['fin'] == 'crescent':           # Brineclaw's gold crescent helm-crest, horns up, a red sun in the middle
            arc = [(x + 0.03 * math.cos(a), py + 0.04 + 0.032 * math.sin(a), pz) for a in [PI * (0.9 + 1.2 * i / 6) for i in range(7)]]
            add(gtube(arc, lambda q: 0.004 + 0.009 * math.sin(PI * q) ** 0.6, K=4), gold(), 'pole')
            add(sph(0.016, (x, py, pz), K=6, J=3), gold(), 'pole')
            add(dot(0.011, (x, py, pz + 0.014), sc=(1, 1, 0.4), K=8, J=2), lac('#e8403a', hi='#ff9a80'), 'pole')
        elif P['fin'] == 'frost':
            add(sph(0.024, (x, py, pz), K=7, J=4), lac('#c8d8f0', hi='#ffffff', lo='#7a8ab0'), 'pole')
        else:
            add(sph(0.024, (x, py, pz), K=7, J=4), gold(), 'pole')
    # -- the banner sheet: hung from the pole, the hem torn in a ragged zig-zag
    NX, NY = 12, 10
    t = Tmp(); ids = []
    for j in range(NY + 1):
        row = []
        for i in range(NX + 1):
            x = -BW / 2 + BW * i / NX; yb = b_rag(x); y = BTOP - (BTOP - yb) * j / NY
            row.append(t.vert(F.W((x, y, b_cz(x, y)))))
        ids.append(row)
    nf = F.N((0, 0, 1))
    for j in range(NY):
        for i in range(NX):
            t.face([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], nf)
    def cloth_col(p, n):
        x, y = p.x, p.z
        c = mix(cloth, edge, clamp(1 - (y - b_rag(x)) / 0.05) * 0.6 + clamp(abs(x) / (BW / 2) - 0.9) * 4 * 0.4)
        c = mix(c, mix(cloth, '#ffffff', 0.12), clamp(1 - (BTOP - y) / 0.05) * 0.5)
        return mul(c, 0.94 + 0.08 * vnoise(p, 30.0, 4) + 0.04 * clamp(n.z))
    t.open = True; t.orient(); t.normals(); t.done = True
    A.add('furn', 'cloth', t, cloth_col, 'banner', b_uv)
    # sleeve loops over the pole
    for k in range(3):
        x = -BW / 2 + 0.06 + k * (BW - 0.12) / 2
        add(gloopc([(x, py + 0.026 * math.sin(TAU * i / 8), pz + 0.026 * math.cos(TAU * i / 8)) for i in range(8)], 0.009, K=3), soft(edge), 'loops', 'cloth', b_uv)
    # loose threads from the torn hem
    for x, L in ((-0.12, 0.05), (0.06, 0.07)):
        yb = b_rag(x)
        cl_add(gtube([(x, yb + 0.006, b_cz(x, yb) + 0.002), (x + 0.008, yb - L * 0.5, b_cz(x, yb) + 0.006), (x - 0.004, yb - L, b_cz(x, yb) + 0.004)], 0.005, K=3), flat(edge), 'threads')
    # -- the crest on its lighter disc
    cy, zp = 0.6, 0.0
    A.add('furn', 'cloth', cloth_disc(0.155, 0.0, cy, 0.003), lambda p, n: mul(mix(cloth, '#ffffff', 0.16), 0.97 + 0.05 * vnoise(p, 30.0, 6)), 'crest', b_uv)
    with at((0, cy, zp)):
        for sh, c in crest_shapes(P['crest'], mark, cloth):
            cl_add(on_cloth(sh, zp - 0.006), lambda p, n, c=c: paint(c, top=0.15, bot=0.25)(p, n), 'crest')
    # -- a stitched patch
    with at((-0.1, 0.36, zp), rz=0.2):
        cl_add(on_cloth(fan_shape(rr2(0.085, 0.064, 0.012, n=2), (0, 0, 0.003), T=0.0012, Tb=0.0006, centre=(0.0, 0.0)), zp), soft(mix(cloth, '#d8c4a0', 0.4)), 'patch')
        for k in range(6):
            a = k / 6 * TAU + 0.3
            cl_add(on_cloth(box(0.016, 0.005, 0.004, (math.cos(a) * 0.05, math.sin(a) * 0.04, 0.006), r=0.0, rz=a + PI / 2), zp), flat('#f0e0c0'), 'patch')
    # -- the victory rosette with a paw, pinned on the top right corner
    rx_, ry_ = 0.12, 0.8
    with at((rx_, ry_, 0.0)):
        z1 = 0.0
        for s in (-1, 1):
            tl = [(s * 0.012, 0.0), (s * 0.036, -0.115), (s * 0.02, -0.098), (s * 0.006, -0.116), (s * -0.008, 0.0)]
            cl_add(on_cloth(fan_shape(tl, (0, -0.02, 0.004), T=0.003, Tb=0.002), z1), flat(mul('#e8403a', 0.9 if s > 0 else 0.78)), 'rosette')
        for k in range(8):
            a = k / 8 * TAU
            pet = [(0.0, 0.0), (0.016, 0.02), (0.012, 0.042), (-0.012, 0.042), (-0.016, 0.02)]
            with at((0, 0, 0.008 + 0.002 * (k % 2)), rz=-a):
                cl_add(on_cloth(fan_shape(pet, (0, 0.008, 0), T=0.004, Tb=0.002, centre=(0.0, 0.025)), z1), lambda p, n, k=k: paint('#e8403a' if k % 2 else '#c83030', top=0.2, bot=0.3)(p, n), 'rosette')
        cl_add(on_cloth(dot(0.032, (0, 0, 0.014), sc=(1, 1, 0.3), K=12, J=2), z1), soft('#fff4e4'), 'rosette')
        cl_add(on_cloth(dot(0.011, (0, -0.007, 0.02), sc=(1.15, 1, 0.4), K=8, J=2), z1), flat('#8a4a2c'), 'rosette')
        for dx, dy in ((-0.016, 0.01), (-0.006, 0.018), (0.006, 0.018), (0.016, 0.01)):
            cl_add(on_cloth(dot(0.0052, (dx, dy, 0.02), sc=(1, 1, 0.5), K=6, J=2), z1), flat('#8a4a2c'), 'rosette')
    return py, pz

def build_bannerGaleclaw():
    py, pz = build_banner(BANNERS['bannerGaleclaw'])
    # Galeclaw's red scarf knotted round the pole's left end, its two tails hanging
    kx = -0.215
    add(sph(0.026, (kx, py, pz + 0.006), sc=(1.1, 1, 0.9), K=7, J=4), lambda p, n: paint('#e04838', top=0.2, bot=0.3)(p, n), 'scarf', 'cloth', b_uv)
    add(gloopc([(kx + 0.004 * math.sin(TAU * i / 8), py + 0.03 * math.sin(TAU * i / 8), pz + 0.03 * math.cos(TAU * i / 8)) for i in range(8)], 0.011, K=4), soft('#d83c30'), 'scarf', 'cloth', b_uv)
    for (dx, L, a) in ((-0.012, 0.17, 0.12), (0.014, 0.13, -0.18)):
        with at((kx + dx, py - 0.012, pz + 0.03), rz=a):
            yt_, yb_ = py - 0.012, py - 0.012 - L
            sh = sheet(-0.022, 0.022, [-L * j / 5 for j in range(6)], lambda x, y: 0.006 * math.sin(y * 40 + x * 30), nx=2)
            def uv_t(p, yt_=yt_, yb_=yb_): return (p.x * 2.0, 1.0 - clamp((p.z - yb_) / (yt_ - yb_)))
            add_open(sh, lambda p, n: mul(mix('#e04838', '#a82820', clamp((py - p.z) / 0.2)), 0.95 + 0.05 * clamp(n.z)), 'scarf', 'cloth', uv_t)

def build_bannerStrawgrin():
    py, pz = build_banner(BANNERS['bannerStrawgrin'])
    # straw still poking out of the torn hem
    for k, x in enumerate((-0.17, -0.09, 0.0, 0.08, 0.16)):
        yb = b_rag(x)
        for j in range(2):
            a = (j - 0.5) * 0.5 + 0.2 * math.sin(k * 2.1)
            cl_add(gtube([(x + j * 0.008, yb + 0.02, b_cz(x, yb) + 0.002), (x + j * 0.008 + math.sin(a) * 0.05, yb - math.cos(a) * 0.05, b_cz(x, yb) + 0.006)], lambda s: 0.0055 - 0.002 * s, K=3, caps=False), lambda p, n: mix('#e8c060', '#c89838', clamp(n.z + 0.3)), 'straw')
    # one of his crows perched on the pole
    with at((-0.13, py + 0.042, pz + 0.004), ry=0.5, s=0.9):
        crow = lambda p, n: mix('#2a2438', '#5a5070', clamp(n.z * 0.6 - n.y * 0.3))
        add(sph(0.03, (0, 0, 0), sc=(0.85, 0.85, 1.2), K=8, J=4), crow, 'crow')
        add(sph(0.022, (0, 0.032, 0.028), K=7, J=4), crow, 'crow')
        add(cyl(0.0, 0.009, 0.026, (0, 0.03, 0.058), K=5, rx=PI / 2), flat('#f4b030'), 'crow')
        for s in (-1, 1):
            add(dot(0.0065, (s * 0.015, 0.038, 0.04), sc=(1, 1, 0.4), K=6, J=2, ry=s * 0.7), flat('#fff6e8'), 'crow')
            add(dot(0.0035, (s * 0.0168, 0.0385, 0.043), sc=(1, 1, 0.5), K=5, J=2, ry=s * 0.7), flat('#1a1420'), 'crow')
            add(cyl(0.004, 0.004, 0.03, (s * 0.01, -0.03, 0.004), K=4), flat('#f4b030'), 'crow')
        add(fan_shape([(0.0, 0.0), (0.024, -0.05), (0.0, -0.04), (-0.024, -0.05)], (0, -0.006, -0.028), T=0.006, Tb=0.006, rx=-PI / 2 + 0.5), crow, 'crow')

def build_bannerBrineclaw():
    build_banner(BANNERS['bannerBrineclaw'])

def build_bannerFrostbelly():
    py, pz = build_banner(BANNERS['bannerFrostbelly'])
    # snow along the top of the pole and three little icicles under it
    snow = lambda p, n: mix('#c8d4ec', '#ffffff', clamp(n.z * 0.8 + 0.3))
    for x, L, h in ((-0.15, 0.09, 0.016), (-0.02, 0.12, 0.02), (0.13, 0.08, 0.015), (0.22, 0.04, 0.012)):
        add(sph(1.0, (x, py + 0.014, pz), sc=(L / 2, h, 0.024), K=8, J=4), snow, 'snow')
    for x, L in ((-0.21, 0.05), (0.21, 0.04), (0.0, 0.035)):
        add(cyl(0.0, 0.009, L, (x, py - 0.012 - L / 2, pz + 0.02), K=5), lambda p, n: mix('#a8c8f0', '#f0f8ff', clamp(n.z * 0.5 + 0.5 - n.y * 0.3)), 'snow')
