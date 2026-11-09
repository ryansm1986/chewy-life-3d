# The rods and the tools: the kit's frames (grip at the origin, along +z). exec'd by build_homestead-props.py.
ROD_TIP_Z = 1.08

def shaft(prof, K, col, tag='shaft'):
    """a lathe along +z: prof [(r, z)]"""
    t = lathe([(r, z) for r, z in prof], K, th0=PI / K)
    t.xform(F.m @ lm((0, 0, 0), rx=-PI / 2) if False else Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    # (lathe's axis Blender +Z -> game +z, which is Blender -Y)
    t.xform(Matrix.Identity(4))
    return put(t, col, tag)

def Z_of(p): return -p.y       # a Blender point's game z

def collar(z, r, h, col, K=8, y=0.0):
    prof = [(0, z - h / 2), (r, z - h / 2 + 0.003), (r, z + h / 2 - 0.003), (0, z + h / 2)]
    t = shaft(prof, K, col, 'collar')
    return t

def ring_guide(z, r=0.03, tube_r=0.012, col='#c8c0b8', y0=0.016):
    """a line guide under the rod: a chunky little hoop"""
    pts = [(math.cos(TAU * k / 6) * r, -y0 - r + math.sin(TAU * k / 6) * r, z) for k in range(6)]
    P = [toB(p) for p in pts]
    t = tube_loop(P, lambda s: tube_r, K=3)
    put(t, lambda p, n: mix(mul(col, 0.78), col, clamp(n.z * 0.6 + 0.6)), 'guide')

def reel(zc, r, hub, cA, cB, knob, y=-0.058):
    """a fat little spool under the grip, a crank with a round knob"""
    prof = [(0, -0.03), (r * 0.86, -0.03), (r, -0.018), (r, 0.018), (r * 0.86, 0.03), (0, 0.03)]
    t = glathe(prof, 12, pos=(0, y, zc), rz=PI / 2)
    put(t, lambda p, n: mix(mul(cA, 0.78), cB, clamp(n.z * 0.55 + 0.5)), 'reel')
    for s in (-1, 1):
        put(sph(r * 0.52, (s * 0.03, y, zc), sc=(0.32, 1, 1), K=7, J=2), hub, 'reel')
    put(box(0.03, 0.034, 0.04, (0, y + 0.03, zc), r=0.008), mul(cA, 0.7), 'reel')
    vtube([(0.03, y, zc), (0.062, y - 0.004, zc), (0.066, y - 0.032, zc + 0.006)], 0.0115, K=4, col='#d8d0c4', tag='crank')
    egg((0.068, y - 0.04, zc + 0.008), 0.02, K=7, J=3, col=knob, tag='crank')

def build_rod(tier):
    new_asset()
    moon = tier >= 2
    if not moon:
        # ------------ the Bamboo Rod: real culm segments with swollen nodes, a cork grip, a red reel
        nodes = [0.16, 0.36, 0.56, 0.74, 0.91, 1.0]
        def rz(z): return 0.0235 + (0.0145 - 0.0235) * clamp((z - 0.1) / 0.98)
        prof = [(0, -0.05), (rz(0.0), -0.04)]
        z0 = 0.0
        for zn in nodes:
            prof += [(rz((z0 + zn) / 2) * 0.96, (z0 + zn) / 2), (rz(zn) * 1.02, zn - 0.014), (rz(zn) * 1.3, zn)]
            z0 = zn
        prof += [(rz(ROD_TIP_Z - 0.03), ROD_TIP_Z - 0.03)]
        prof += [(0.0, ROD_TIP_Z - 0.028)]
        def col(p, n):
            z = Z_of(p); c = mix('#c4a050', '#e6cc80', clamp(n.z * 0.6 + 0.55))
            near = min(abs(z - q) for q in nodes)
            if near < 0.012: c = mul(mix(c, '#9a7a38', 0.75), 1.0)
            return mix(c, '#a8c060', 0.14 * clamp((z - 0.2) * 1.2))
        shaft(prof, 6, col)
        # the cork grip: a fat barrel with two dark rings
        def cork(p, n):
            z = Z_of(p); c = mix('#b47c50', '#dca878', clamp(n.z * 0.6 + 0.55))
            return mix(c, '#8a5a38', 0.5 * smooth(0.55, 0.8, vnoise(p, 60.0, 4)))
        shaft([(0, -0.13), (0.026, -0.128), (0.031, -0.11), (0.032, -0.04), (0.03, 0.04), (0.027, 0.095), (0, 0.105)], 10, cork, 'grip')
        collar(0.096, 0.032, 0.028, lambda p, n: mix('#8a2c20', '#e8503a', clamp(n.z * 0.6 + 0.55)))
        collar(-0.125, 0.034, 0.038, lambda p, n: mix('#5e3a24', '#9a6a44', clamp(n.z * 0.6 + 0.55)))
        reel(0.135, 0.045, '#fff6e8', '#c8362a', '#f06a52', '#fff6e8')
        for z, r in ((0.34, 0.024), (0.58, 0.022), (0.82, 0.02)): ring_guide(z, r, 0.0105, '#d0c8bc', y0=0.012)
        # the rope wrap by the guides (a little red whipping, the owner's chunky read at distance)
        for z in (0.34, 0.58, 0.82): collar(z, rz(z) * 1.22, 0.022, lambda p, n: mix('#a82c24', '#f05a48', clamp(n.z * 0.6 + 0.55)), K=8)
        tipc, tiph = '#c8362a', '#f06a52'
    else:
        # ------------ the Moonlit Rod: navy lacquer, gold ferrules, a moon on a cord
        def rz(z): return 0.0235 + (0.0145 - 0.0235) * clamp((z - 0.1) / 0.98)
        prof = [(0, -0.05), (rz(0), -0.04), (rz(0.3), 0.3), (rz(0.6), 0.6), (rz(0.9), 0.9), (rz(ROD_TIP_Z - 0.03), ROD_TIP_Z - 0.03), (0.0, ROD_TIP_Z - 0.028)]
        navy = lambda p, n: mix(mix('#222a5c', '#344488', clamp(Z_of(p))), '#6e80d0', smooth(0.25, 0.95, n.z * 0.7 + (-n.y) * 0.25))
        shaft(prof, 6, navy)
        def stars(p, n): return navy(p, n)
        def gold(p, n): return mix('#a87c28', '#ffe07a', clamp(n.z * 0.6 + 0.55))
        shaft([(0, -0.13), (0.027, -0.128), (0.032, -0.11), (0.033, -0.04), (0.031, 0.04), (0.028, 0.095), (0, 0.105)], 10, lambda p, n: mix('#2e2040', '#5a4078', clamp(n.z * 0.6 + 0.5)), 'grip')
        for z in (-0.09, -0.035, 0.02, 0.07):    # the grip's gold wrap
            collar(z, 0.0335, 0.012, gold, K=8)
        collar(0.1, 0.033, 0.03, gold)
        put(sph(0.042, (0, 0, -0.14), sc=(1, 1, 1), K=8, J=4), gold, 'butt')
        reel(0.135, 0.047, '#fff3c0', '#c89a30', '#ffe07a', '#fff3c0')
        for z, r in ((0.34, 0.024), (0.58, 0.022), (0.82, 0.02)): ring_guide(z, r, 0.0105, '#ffd868', y0=0.012)
        for z in (0.34, 0.58, 0.82): collar(z, rz(z) * 1.26, 0.022, gold, K=8)
        for z in (0.24, 0.47, 0.7, 0.94):         # little gold stars on the blank
            put(sph(0.021, (0, rz(z) * 0.92, z), sc=(1, 0.42, 1), K=4, J=2), '#ffe890', 'star')
        # the crescent charm on a pink cord under the grip
        vtube([(0, -0.03, 0.18), (0.006, -0.08, 0.195), (0.004, -0.115, 0.2)], 0.0095, K=4, col='#ff8fb0', tag='charm')
        pts = []
        for i in range(7):
            a = 0.55 + i * (TAU * 0.72 / 6)
            pts.append((0.004, -0.152 + math.sin(a) * 0.036, 0.2 + math.cos(a) * 0.036))
        P = [toB(p) for p in pts]
        tt = tube(P, lambda s: 0.0085 + 0.0115 * math.sin(s * PI), K=5, caps=True, up=Vector((1, 0, 0)))
        put(tt, lambda p, n: mix('#e8b83c', '#fff0a0', clamp(n.z * 0.6 + 0.6)), 'charm')
        tipc, tiph = '#c89a30', '#ffe07a'
    # the tip-top: a bead whose very last vertex is ROD_TIP: the line attaches exactly there
    r = 0.021
    t = lathe([(0, ROD_TIP_Z - 0.042), (r * 0.8, ROD_TIP_Z - 0.03), (r, ROD_TIP_Z - 0.019), (r * 0.72, ROD_TIP_Z - 0.006), (0.0, ROD_TIP_Z)], 8, th0=PI / 8)
    t.xform(Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    put(t, lambda p, n: mix(tipc, tiph, clamp(n.z * 0.6 + 0.55)), 'tip')
    ray_ao(DMAX=0.07, K=0.34, NR=10, off=0.003)
    export_piece('prop-rod-%d' % tier, budget=1000)

def build_hoe():
    new_asset()
    # the ash handle with the grain painted, a wrapped red grip, an iron collar, a broad rounded blade with a bright edge
    def ash(p, n):
        z = Z_of(p); c = mix('#b88a50', '#e4bc80', clamp(n.z * 0.6 + 0.55))
        return mul(c, 0.94 + 0.1 * math.sin(z * 34 + math.sin(p.x * 80) * 1.4))
    shaft([(0, -0.1), (0.022, -0.095), (0.024, 0.1), (0.022, 0.4), (0.021, 0.66), (0, 0.682)], 8, ash, 'handle')
    shaft([(0, -0.105), (0.03, -0.1), (0.033, -0.075), (0.033, 0.03), (0.03, 0.055), (0, 0.06)], 10, lambda p, n: mix('#a82c20', '#f0604a', clamp(n.z * 0.6 + 0.55)), 'grip')
    for z in (-0.05, -0.012, 0.024):
        collar(z, 0.0345, 0.012, lambda p, n: mix('#7c2018', '#c8402e', clamp(n.z * 0.6 + 0.55)), K=8)
    egg((0, 0, -0.112), 0.034, K=8, J=4, col=lambda p, n: mix('#7a5230', '#b88858', clamp(n.z * 0.6 + 0.5)), tag='butt')
    iron = lambda p, n: mix('#62646a', '#a8aab0', clamp(n.z * 0.7 + 0.5))
    # the socket, a neck curving down, the blade
    shaft([(0, 0.6), (0.03, 0.605), (0.034, 0.65), (0.034, 0.7), (0.026, 0.72), (0, 0.726)], 10, iron, 'socket')
    collar(0.615, 0.036, 0.022, lambda p, n: mix('#484a50', '#84868c', clamp(n.z * 0.6 + 0.55)))
    vtube([(0, -0.004, 0.7), (0, -0.028, 0.722), (0, -0.056, 0.716)], 0.024, K=6, col=iron, tag='neck')
    # the blade: a chunky rounded plate, 19 x 13 x 3 cm, front slightly dished, its cutting edge bright
    bl = rbox((0.19, 0.036, 0.135), r=0.016, seg=1, extra=(1, 0, 1), M=F.m @ lm((0, -0.115, 0.704), rx=-0.08))
    bx0, by0 = -0.075, 0.0
    def blade(p, n):
        y = p.z   # (Blender z = game y)
        c = mix('#7a7c82', '#b4b6bc', clamp(n.z * 0.5 + (-n.y) * 0.25 + 0.5))
        return mix(c, '#f0f0f6', smooth(-0.145, -0.17, y))
    put(bl, blade, 'blade')
    for x in (-0.05, 0.05): put(sph(0.0155, (x, -0.076, 0.726), sc=(1, 1, 0.7), K=6, J=3), '#d8dade', 'rivet')
    ray_ao(DMAX=0.07, K=0.34, NR=10, off=0.003)
    export_piece('prop-tool-hoe', budget=800)

def build_seedbag():
    new_asset()
    # a fat burlap pouch: creased shoulders, woven paint, a patch with a sprout, a red tie, a tuft (grip at the top knot)
    cz = 0.03
    prof = [(0.0, -0.205), (0.05, -0.198), (0.082, -0.165), (0.094, -0.115), (0.082, -0.072), (0.055, -0.044), (0.037, -0.03), (0.034, -0.014)]
    def crease(rr, z, th): return rr * (1 + 0.075 * math.sin(th * 5 + 0.7) * smooth(-0.12, -0.04, z) + 0.022 * math.sin(th * 3 + z * 20))
    t = lathe(prof[0:], 16, rfn=crease).xform(F.m @ lm((0, 0, cz)))
    # (close the neck)
    def burlap(p, n):
        z_ = p.z; c = mix('#b89660', '#e4c88e', clamp(n.z * 0.55 + 0.55))
        w = math.sin(p.x * 180) * math.sin(z_ * 180)
        return mul(c, 0.96 + 0.06 * w)
    put(t, burlap, 'bag')
    # the tuft above the tie
    tf = lathe([(0.03, -0.016), (0.042, 0.012), (0.046, 0.034), (0.02, 0.036), (0.0, 0.02)], 10, rfn=lambda rr, z, th: rr * (1 + 0.16 * math.cos(th * 4))).xform(F.m @ lm((0, 0, cz)))
    put(tf, burlap, 'tuft')
    # the red tie: a fat loop and a bow's two tails
    P = [toB((math.cos(TAU * k / 10) * 0.038, -0.024, cz + math.sin(TAU * k / 10) * 0.038)) for k in range(10)]
    put(tube_loop(P, lambda s: 0.0125, K=5), lambda p, n: mix('#a82c20', '#f0604a', clamp(n.z * 0.6 + 0.55)), 'tie')
    for s in (-1, 1):
        vtube([(s * 0.03, -0.026, cz + 0.03), (s * 0.05, -0.05, cz + 0.046), (s * 0.052, -0.074, cz + 0.05)], lambda q: 0.012, K=4, col='#e0503c', tag='tie')
    # the patch on the front: a cream square with a green sprout (no text)
    put(box(0.075, 0.078, 0.022, (0, -0.118, cz + 0.087), r=0.01, rx=-0.02), lambda p, n: mix('#e8d4a8', '#fff4dc', clamp(n.z * 0.5 + 0.6 - n.y * 0.3)), 'patch')
    for s in (-1, 1):
        put(sph(0.022, (s * 0.016, -0.106, cz + 0.1), sc=(1, 0.55, 0.42), K=7, J=3, rz=s * 0.5), '#6cb04c', 'patch')
    put(cyl(0.007, 0.008, 0.03, (0, -0.128, cz + 0.098), K=4), '#4e8e3e', 'patch')
    ray_ao(DMAX=0.06, K=0.36, NR=10, off=0.003)
    export_piece('prop-tool-seedBag', budget=800)
