# PAWHAVEN: the Onsen Highlands (the snowy region)'s landmark props in Blender (task rg-onsen), built by script.
#   blender --background --factory-startup --python build_rg-onsen.py -- --piece yukimiLantern|inn|...|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m. Each prop is built in its kit piece's own local frame (src/regions/assets/onsenProps.js): the same
# origin, facing (front = the kit's +z = Blender -Y), ground (y = 0) and size. The layout code is written in that game
# frame (x, y up, z front) and mapped to Blender (x, -z, y) by the kit's Frame.
# The shared kit (mesh accumulator with painted vertex colours, rounded boxes, beams, lathes, tubes, roofs.js maths, the
# snow kit: blankets, sheets, pillows, icicles, drape icing) is a frozen copy of the zv-onsen builder (onsen_kit.py).
# Materials (the game sorts meshes into the kit piece's buckets by these names): body, glow, cloth.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
_kit = os.path.join(HERE, 'onsen_kit.py')
exec(compile(open(_kit, encoding='utf-8').read(), _kit, 'exec'))
print('RG build pid', os.getpid())

# ---------------------------------------------------------------- routing: one object per material bucket
MATO = None
def add(t, col, tag='misc', glow=False):
    mat = 'glow' if glow else (MATO or 'body')
    A.add(mat, mat, t, col, tag)
    return t
class mat_as:
    def __init__(self, name): self.name = name
    def __enter__(self):
        global MATO; self.prev = MATO; MATO = self.name
    def __exit__(self, *e):
        global MATO; MATO = self.prev

def new_piece():
    global A, LAYER, MATO
    A = Asset2(); F.__init__(); LAYER = None; MATO = None
    PAL.update(dict(wall=T['plaster'], wallLo='#e0d4c2', frame=T['timber'], frameLo='#2e221e', paper='#fff2d8', ink='#2e2628', iron=T['iron']))

def gsurf(rings, pole0=None, pole1=None, closed=False):
    """a ring surface from game-frame rings of points (each the same length), optional game-frame poles"""
    tm = Tmp()
    R = [[F.W(p) for p in r] for r in rings]
    cs = [sum(r, Vector()) / len(r) for r in R]
    ring_surface(tm, R, cs, F.W(pole0) if pole0 else None, F.W(pole1) if pole1 else None, closed=closed)
    return tm

def icing(Ps, he, thick, ths, J, inner):
    """a snow / moss icing cap over a top surface Ps(u, th) -> game point (u = 0 the top pole, growing outward): it
    covers u < he(th) with thickness thick(th, s) (s = u / he), then a rolled lip that bulges proud and curls back under,
    tucked into the surface; closed by a fan to `inner` (a game point inside the base solid). Normals by finite
    differences in the game frame (taken upward), so the apex stays well-behaved."""
    V3 = lambda p: Vector(p)
    def N(u, th):
        e = 1e-3; uu = max(u, 0.06)
        a = V3(Ps(uu + e, th)) - V3(Ps(uu - e, th)); b = V3(Ps(uu, th + e)) - V3(Ps(uu, th - e))
        n = a.cross(b)
        if n.length < 1e-12: return Vector((0, 1, 0))
        n.normalize(); q = V3(Ps(uu, th)); o = Vector((q.x, 0, q.z))
        o = o.normalized() if o.length > 1e-6 else Vector((0, 0, 0))
        return n if n.y + 0.8 * n.dot(o) >= 0 else -n
    def D(u, th):
        e = 1e-3; return (V3(Ps(u + e, th)) - V3(Ps(u, th))).normalized()
    rings = []
    for j in range(1, J + 1):
        s = (j / J) ** 1.3
        rings.append([V3(Ps(he(th) * s, th)) + N(he(th) * s, th) * thick(th, s) for th in ths])
    lipr, curl, tuck = [], [], []
    for th in ths:
        u = he(th); n = N(u, th); dn = D(u, th); tk = thick(th, 1.0); p = V3(Ps(u, th))
        lipr.append(p + dn * tk * 0.5 + n * tk * 0.82)
        curl.append(p + dn * tk * 0.72 + n * tk * 0.28)
        tuck.append(V3(Ps(u - 0.006, th)) - n * 0.008)
    rings += [lipr, curl, tuck]
    top = V3(Ps(0.0, 0.0)) + Vector((0, 1, 0)) * thick(0.0, 0.0)
    t = Tmp(); R = [[F.W(tuple(p)) for p in r] for r in rings]
    ids = ring_surface(t, R, [F.W(inner)] * len(R), pole0=F.W(tuple(top)))
    ci = t.vert(F.W(inner)); last = ids[-1]; Kn = len(last)
    for k in range(Kn): t.face([ci, last[(k + 1) % Kn], last[k]], F.W(inner) - F.W(tuple(top)))
    return t

# ================================================================== the yukimi lantern (kit yukimiLantern, s = 1)
LSTONE, LSTONE_HI, LSTONE_LO = '#979db2', '#ced2dc', '#585e72'
def lstone(seed=0, warm=0.0):
    """lantern granite: light on top, cool and darker below, a soft mottling, a hint of warm lichen"""
    base = mix(LSTONE, '#b0a898', warm)
    def f(p, n):
        c = mix(mul(base, 0.8), mix(base, LSTONE_HI, 0.7), clamp(n.z * 0.8 + 0.25))
        if n.z < 0: c = mix(c, LSTONE_LO, -n.z * 0.6)
        c = mul(c, 0.93 + 0.12 * vnoise(p, 6.0, seed))
        return c
    return f

def build_yukimiLantern():
    new_piece()
    th0 = PI / 6                     # hexagon orientation: a flat side to the front (+z)
    # ---- three splayed, curved legs on little snowy feet
    for i in range(3):
        a = i / 3 * TAU + PI / 2; dx, dz = math.cos(a), math.sin(a)
        P = lambda r, y: (dx * r, y, dz * r)
        add(gtube([P(0.5, 0.05), P(0.46, 0.27), P(0.34, 0.5), P(0.17, 0.62)],
                  lambda u: 0.085 - 0.022 * u, K=6), lstone(i, 0.15), 'legs')
        add(glathe([(0.0, 0.0), (0.1, 0.0), (0.105, 0.03), (0.075, 0.07), (0.0, 0.075)], 7, pos=P(0.5, 0.0)), lstone(i + 3), 'legs')
    add(glathe([(0.0, 0.55), (0.17, 0.55), (0.21, 0.6), (0.0, 0.6)], 6, ry=th0), lstone(9), 'legs')
    # ---- the nakadai (middle platform): a bevelled hex plate
    add(glathe([(0.0, 0.58), (0.28, 0.58), (0.34, 0.62), (0.35, 0.67), (0.31, 0.71), (0.0, 0.71)], 6, ry=th0), lstone(4, 0.1), 'plate')
    # ---- the firebox (hibukuro): six corner posts, a dark inner box, three glowing paper windows, and on the other
    #      three sides stone panels with a sun, a crescent moon and a sun again cut through (glowing)
    yb, yt = 0.72, 1.06; ym = (yb + yt) / 2; hh = yt - yb
    add(glathe([(0.0, yb), (0.17, yb), (0.17, yt), (0.0, yt)], 6, ry=th0), flat('#4a4e62'), 'firebox')
    for k in range(6):
        a = k * TAU / 6                         # (the corners)
        with at((0.215 * math.cos(a), ym, 0.215 * math.sin(a)), ry=-a):
            add(beam(0.075, hh, 0.075, (0, 0, 0), c=0.02), lstone(10 + k), 'firebox')
    for k in range(6):
        a = k * TAU / 6 + TAU / 12              # the face normals
        with at((0, ym, 0), ry=PI / 2 - a):
            if k % 2 == 0:
                add(box(0.17, 0.27, 0.02, (0, 0, 0.17), r=0.0), lambda p, n: '#ffdc98', 'paper', glow=True)
                add(box(0.03, 0.27, 0.03, (0, 0, 0.185), r=0.0), flat('#3a3040'), 'paper')
                add(box(0.18, 0.03, 0.03, (0, 0.04, 0.185), r=0.0), flat('#3a3040'), 'paper')
            else:
                add(box(0.17, 0.27, 0.04, (0, 0, 0.175), r=0.0), lstone(20 + k), 'panel')
                if k == 3:      # the crescent moon: a glowing disc half-covered by a stone disc
                    add(glathe([(0.0, -0.006), (0.06, -0.006), (0.06, 0.006), (0.0, 0.006)], 8, pos=(0, 0.02, 0.196), rx=PI / 2), lambda p, n: '#ffd27a', 'panel', glow=True)
                    add(glathe([(0.0, -0.008), (0.054, -0.008), (0.054, 0.008), (0.0, 0.008)], 8, pos=(0.03, 0.035, 0.2), rx=PI / 2), lstone(31), 'panel')
                else:           # the sun
                    add(glathe([(0.0, -0.006), (0.055, -0.006), (0.055, 0.006), (0.0, 0.006)], 8, pos=(0, 0.02, 0.196), rx=PI / 2), lambda p, n: '#ffd27a', 'panel', glow=True)
    add(glathe([(0.0, yb - 0.02), (0.26, yb - 0.02), (0.27, yb + 0.01), (0.25, yb + 0.03), (0.0, yb + 0.03)], 6, ry=th0), lstone(6), 'firebox')
    # ---- the kasa: a wide hexagonal stone umbrella, gently concave slopes, soft raised hips, upturned warabi tips
    Rk = 0.74; ap = Rk * math.cos(PI / 6)
    K = 24; y0k = 1.05
    def corner(th):               # 1 at the six corners, 0 mid-side
        return (0.5 + 0.5 * math.cos(6 * th)) ** 3
    def rho(th):
        d = (th % (PI / 3)) - PI / 6
        return ap / math.cos(d) * 0.85 + Rk * 0.15 + 0.025 * corner(th) ** 2
    def lift(u, th): return 0.05 * corner(th) ** 1.5 * smooth(0.6, 1.0, u) ** 2
    def ytop(u, th):
        c = corner(th)
        return y0k + 0.07 + 0.2 * (1 - u) ** 1.35 + 0.015 * c * c * (1 - u) + lift(u, th)
    def P(u, th, y):
        r = rho(th) * u
        return (r * math.cos(th), y, r * math.sin(th))
    def Ps(u, th): return P(u, th, ytop(u, th))
    ths = [TAU * k / K for k in range(K)]
    rings = []
    for u in (0.5, 0.92):
        rings.append([P(u, th, y0k + 0.025 * (1 - u) + lift(u, th)) for th in ths])
    rings.append([P(1.0, th, ytop(1.0, th) - 0.085) for th in ths])
    rings.append([P(1.016, th, ytop(1.0, th) - 0.04) for th in ths])
    for u in (1.0, 0.9, 0.66, 0.36):
        rings.append([P(u, th, ytop(u, th) + (0.01 if u == 1.0 else 0.0)) for th in ths])
    t_k = gsurf(rings, pole0=(0, y0k + 0.03, 0), pole1=(0, ytop(0, 0) + 0.004, 0))
    def kasa_col(p, n):
        c = lstone(7, 0.08)(p, n)
        q = GMi @ (F.m.inverted() @ p); th = math.atan2(q.z, q.x)
        c = mix(c, LSTONE_HI, 0.3 * corner(th) * clamp(n.z))
        return mix(c, '#e8b070', 0.62 * clamp(-n.z - 0.15))      # the firebox's warm light on the kasa's underside
    add(t_k, kasa_col, 'kasa')
    # warabi curls at the six tips
    for k in range(6):
        th = k * TAU / 6; r = rho(th); yy = ytop(1.0, th)
        cx, cz = math.cos(th), math.sin(th)
        Q = lambda dr, dy: (cx * (r + dr), yy + dy, cz * (r + dr))
        add(gtube([Q(-0.05, -0.012), Q(0.004, 0.006), Q(0.02, 0.042), Q(-0.004, 0.066)], lambda u: 0.031 - 0.007 * u, K=5), lstone(40 + k, 0.1), 'kasa')
    # ---- the snow cap: a pillowy icing over about half the kasa, rounded drips down the flat sides, the tips clear
    rng = random.Random(77)
    drips = [(th, rng.uniform(0.12, 0.22), rng.uniform(0.14, 0.2)) for th in
             [PI / 6 + k * PI / 3 + rng.uniform(-0.12, 0.12) for k in range(6)] if rng.random() < 0.75]
    he = drip_he(lambda th: 0.64 + 0.05 * math.sin(3 * th + 0.7) + 0.035 * math.sin(5 * th + 1.9) - 0.08 * corner(th), drips)
    thick = lambda th, s: (0.13 * (1 - 0.5 * s * s) + 0.02 * math.sin(4 * th + 1.3) * (1 - s)) * (1 + 0.15 * vnoise(Vector((math.cos(th), math.sin(th), s)), 2.0, 5))
    add(icing(Ps, he, thick, drip_angles(18, drips, offs=(-0.7, 0.0, 0.7), min_gap=0.06), 4, (0, y0k + 0.1, 0)), SNOW, 'snow')
    for j, (th, L, w) in enumerate(drips[:4]):           # a few short icicles under the drips
        u = he(th) + 0.02
        if u > 0.86:
            x, y, z = Ps(u, th); icicle(x, y - 0.03, z, 0.07 + 0.04 * (j % 2))
    # ---- the hoju (sacred jewel) on a lotus collar, its own little snow dab
    yA = ytop(0, 0)
    add(cyl(0.07, 0.085, 0.16, (0, yA + 0.04, 0), K=8), lstone(50), 'hoju')
    add(glathe([(0.0, -0.03), (0.09, -0.025), (0.11, 0.0), (0.09, 0.03), (0.0, 0.035)], 9, pos=(0, yA + 0.135, 0)), lstone(51), 'hoju')
    add(glathe([(0.0, 0.0), (0.062, 0.01), (0.078, 0.055), (0.06, 0.1), (0.028, 0.135), (0.0, 0.155)], 9, pos=(0, yA + 0.155, 0)), lstone(52, 0.05), 'hoju')
    pillow((0.008, yA + 0.3, 0.0), 0.062, 0.55, 9, K=8, J=4, tag='snow', fine=False)
    # ---- snow drifted round the feet
    for i in range(3):
        a = i / 3 * TAU + PI / 2
        pillow((math.cos(a) * 0.52, 0.02, math.sin(a) * 0.52), 0.17, 0.45, 11 + i, 1.15, 0.95, ry=-a, K=9, J=4, tag='drift', fine=False)
    return A, dict(lights=[[0, 0.9, 0]])

# ================================================================== the mountain inn (kit inn: the ruined ryokan)

def foundation_lite(w, d, h, sides='flr', gap=0.8, seed=1, color=None):
    """a stone plinth (buried skirt) with chunky facing stones on the sides the game camera sees"""
    color = color or T['stone']
    add(beam(w - 0.04, h + 0.3, d - 0.04, (0, (h - 0.3) / 2, 0), c=0.06),
        lambda p, n: mul(mix(color, mix(color, '#eef0f6', 0.3), clamp(n.z)), 0.78 + 0.22 * smooth(-0.05, h, p.z)), 'foundation')
    rng = random.Random(seed)
    for side in sides:
        L = w if side in 'fb' else d
        n = max(2, round(L / gap))
        with on_face(dict(w=w, d=d), side, 0, 0):
            for i in range(n):
                u = -L / 2 + (i + 0.5) * L / n + rng.uniform(-0.05, 0.05)
                r = rng.uniform(0.2, 0.25) * (L / n) / gap
                c = ONSEN_STONES[rng.randrange(len(ONSEN_STONES))]
                t = lathe([(0.0, -0.3), (r, h * 0.35), (r * 0.82, h * 0.9), (0.0, h * rng.uniform(1.0, 1.12))], 6, th0=rng.uniform(0, 1), sx=1.0, sy=0.55,
                          rfn=lambda rr, zz, th, s=i: rr * (1 + 0.08 * math.sin(2 * th + s) + 0.05 * math.sin(3 * th + s * 1.3)))
                t.xform(F.m @ lm((u, 0.0, 0.02)))
                add(t, stone_col(c, i), 'foundation')

def noren_cloth(w=1.1, h=0.6, y=1.8, z=1.78, color='#2e4a8a', strips=3):
    """the doorway curtain: a dark rod (body), indigo strips with white hems and the hot-spring mark (cloth)"""
    add(cyl(0.03, 0.03, w + 0.18, (0, y + 0.02, z), K=7, rz=PI / 2), wood(PAL['frameLo']), 'noren')
    for s in (-1, 1): add(beam(0.05, 0.06, 0.2, (s * (w / 2 + 0.06), y + 0.02, z - 0.09), c=0.012), wood(PAL['frameLo']), 'noren')
    gap = 0.035; sw = (w - gap * (strips - 1)) / strips; hem = 0.075
    with mat_as('cloth'):
        for i in range(strips):
            x = -w / 2 + sw / 2 + i * (sw + gap); sway = (i - 1) * 0.015
            add(beam(sw, h - hem, 0.035, (x, y - (h - hem) / 2, z), c=0.012, rx=0.04, rz=sway),
                lambda p, n: mix(mul(color, 0.8), mix(color, '#6a88c0', 0.3), smooth(y - h, y, p.z) * 0.8 + clamp(-n.y) * 0.1), 'noren')
            add(beam(sw, hem, 0.04, (x + sway * -0.45, y - h + hem / 2 + 0.005, z + 0.018), c=0.014, rx=0.04), soft('#f4efe6', 0.2), 'noren')
        onsen_mark(0.3, (0, y - h * 0.5, z + 0.03), depth=0.016, col='#fff4e6', tag='noren', K=5)

def slope_frame(yS, x, z):
    """(point, ex, ez downslope, n) on a height field yS(x, z) (game frame)"""
    e = 0.02
    dx = (yS(x + e, z) - yS(x - e, z)) / (2 * e); dz = (yS(x, z + e) - yS(x, z - e)) / (2 * e)
    n = Vector((-dx, 1.0, -dz)).normalized(); ex = Vector((1, 0, 0)); ex = (ex - n * ex.dot(n)).normalized()
    ez = ex.cross(n).normalized()
    if ez.z < 0: ez = -ez
    return Vector((x, yS(x, z), z)), ex, ez, n

def broken_patch(c, ex, ez, n, rx=0.5, rz=0.4, seed=3):
    """a hole broken through a snowy roof: a jagged rim of snow, a band of snapped slate, the dark loft, splintered
    rafters poking up, loose tiles round it (all laid on the slope frame at c)"""
    rng = random.Random(seed)
    Pq = lambda a, b, h: tuple(c + ex * a + ez * b + n * h)
    K = 16; ph = rng.random() * 6
    jag = lambda f: 1 + 0.13 * math.sin(5 * f + ph) + 0.08 * math.sin(7 * f + ph * 1.7) + 0.05 * math.sin(11 * f + 2)
    rings = []
    for (r, h) in ((1.45, -0.12), (1.3, -0.01), (1.14, 0.04), (1.02, 0.035), (0.95, -0.02), (0.88, -0.06), (0.78, -0.12)):
        rings.append([Pq(rx * r * jag(TAU * k / K) * math.cos(TAU * k / K), rz * r * jag(TAU * k / K) * math.sin(TAU * k / K), h) for k in range(K)])
    tm = gsurf(rings, pole0=Pq(0, 0, -0.32), pole1=Pq(0, 0, -0.16))
    cB = F.W(tuple(c)); nB = F.N(tuple(n))
    def colf(p, nn):
        h = (p - cB).dot(nB)
        if h > -0.02: return snow_col(5)(p, nn)
        if h > -0.08: return mix('#3e455a', '#5a6480', clamp(nn.z))
        return mix('#2a2230', '#3a3040', clamp(-h * 3))
    add(tm, colf, 'broken')
    for k, f in enumerate((0.6, 2.4, 4.3)):
        p = Vector(Pq(rx * 1.18 * math.cos(f), rz * 1.18 * math.sin(f), 0.0))
        pillow(tuple(p), 0.12 + 0.03 * k, 0.5, 60 + k, 1.4, 1.0, ry=-f, K=9, J=4, tag='broken', fine=False)
    # splintered rafters: square beams running down the slope, snapped off proud of the hole
    for k, a in enumerate((-0.24, 0.04, 0.27)):
        b1 = rng.uniform(0.0, 0.22); h1 = rng.uniform(0.04, 0.12)
        add(gtube([Pq(a, -0.62, -0.14), Pq(a + 0.02, b1 - 0.1, h1 * 0.6), Pq(a + 0.03, b1, h1)], 0.042, K=4), wood('#6a4a36'), 'broken')
        tip = Vector(Pq(a + 0.03, b1, h1)) + ez * 0.1 + n * 0.03
        add(gtube([Pq(a + 0.03, b1, h1), tuple(tip)], lambda u: 0.035 * (1 - u * 0.85), K=4), wood('#c8a070'), 'broken')
    # loose tiles round it
    for k in range(4):
        f = rng.random() * TAU; r = 1.25 + rng.random() * 0.25
        p = Vector(Pq(rx * r * math.cos(f), rz * r * math.sin(f), 0.02))
        with at(tuple(p), ry=rng.uniform(0, PI), rx=rng.uniform(-0.3, 0.3)):
            add(box(0.2, 0.035, 0.15, (0, 0, 0), r=0.0), paint(SLATE_PAL['color'], hi=SLATE_PAL['hi'], top=0.3), 'tiles')

def build_inn():
    new_piece()
    w, d, y0, h1 = 5.6, 3.2, 0.3, 1.7
    zu, uw, ud, h2 = -0.15, 5.2, 2.7, 1.45
    uy = y0 + h1 + 0.1
    Fz = d / 2
    foundation_lite(w + 0.1, d + 0.1, y0, sides='flr', gap=0.75, seed=7)
    walls(dict(w=w, d=d, h=h1, y0=y0, plaster=T['plaster'], frame=T['timber'], koshi=T['koshi'], koshiSkip='fb',
               posts={'f': [-1.05, 1.05, -2.45, 2.45], 'l': [0.0], 'r': [0.0]}))
    blk = dict(w=w, d=d)
    # ---- the ground floor: the lit sliding doors, the noren, shoji to either side, a shoji in each side wall
    with on_face(blk, 'f', 0, y0): door_slide(1.1, 1.45, 'shoji', '#9a7656', T['timber'])
    noren_cloth(1.1, 0.6, 1.82, Fz + 0.2)
    for s in (-1, 1):
        with on_face(blk, 'f', s * 1.75, y0 + 0.95): shoji(1.2, 0.8, frame=T['timber'], cell=0.3)
    for side in 'lr':
        with on_face(blk, side, 0.75 if side == 'l' else -0.75, y0 + 0.95): shoji(0.8, 0.6, frame=T['timber'], cell=0.3)
    # the signboard over the door: the hot-spring mark, no lettering
    add(beam(w + 0.04, 0.26, 0.08, (0, y0 + h1 + 0.12, Fz + 0.02), c=0.02), wood(T['timberMid']), 'frieze')
    with at((0, 2.1, Fz + 0.08)):
        sign_board(1.0, 0.3, '#3a2a24', '#2a1e1a')
        onsen_mark(0.3, (0, 0.0, 0.035), depth=0.014, col='#f2e2c0', K=5)
    # ---- the engawa (veranda) along the front, on stone feet, a step stone at the door
    ez0, ez1, ey = Fz, Fz + 0.78, y0 + 0.02
    nb = 5; bw = (ez1 - ez0) / nb
    for i in range(nb):
        add(beam(w - 0.1, 0.05, bw - 0.012, (0, ey - 0.025, ez0 + (i + 0.5) * bw), c=0.012), wood(mul('#b08660', 1 + 0.05 * ((i * 7) % 3 - 1)), seed=i), 'engawa')
    add(beam(w - 0.06, 0.1, 0.08, (0, ey - 0.08, ez1 - 0.04), c=0.02), wood('#7a5a42'), 'engawa')
    for x in (-2.72, -1.4, 0.0, 1.4, 2.72):
        add(box(0.09, ey - 0.1, 0.09, (x, (ey - 0.1) / 2 + 0.04, ez1 - 0.1), r=0.0), wood('#5a4032', ao_z=0.0), 'engawa')
        pebble((x, 0.0, ez1 - 0.1), 0.11, 0.6, seed=int(x * 10) + 40, col=ONSEN_STONES[2], tag='engawa', K=6)
    pebble((0.0, 0.0, ez1 + 0.2), 0.32, 0.45, seed=17, col=ONSEN_STONES[4], tag='step', K=12)
    # ---- the hisashi: a pent roof over the veranda on two corner posts, heavy snow, icicles, the two chochin
    zb, ze = Fz - 0.4, Fz + 0.52          # (from the upper wall to just short of the veranda edge: the facade shows under it)
    yT = lambda z: 2.42 - (z - zb) / (ze - zb) * 0.22 - 0.015 * math.sin(PI * clamp((z - zb) / (ze - zb)))
    X0 = w / 2 + 0.25
    sweep_x([-X0, X0], lambda x: [(yT(zb), zb), (yT((zb + ze) / 2), (zb + ze) / 2), (yT(ze), ze), (yT(ze) - 0.1, ze), (yT((zb + ze) / 2) - 0.09, (zb + ze) / 2), (yT(zb) - 0.09, zb)],
            'hisashi', lambda p, nn: mix(SLATE_PAL['color'], SLATE_PAL['hi'], clamp(nn.z)) if nn.z > 0.3 else T['soffit'])
    add(beam(2 * X0 + 0.04, 0.12, 0.07, (0, yT(ze) - 0.05, ze + 0.03), c=0.02), wood(T['timber']), 'hisashi')
    for i in range(9):
        x = -X0 + 0.3 + i * (2 * X0 - 0.6) / 8
        add(box(0.07, 0.07, 0.42, (x, yT(ze - 0.22) - 0.13, ze - 0.22), r=0.0, rx=0.24), wood(T['timberMid']), 'hisashi')
    roll, drip = lip_rolls(2 * X0, 0.45, 61, 0.45, 0.05, 0.12)
    def snowp(x):
        sv = x + X0; r_ = roll(sv); dd = drip(sv) * smooth(0.3, 0.6, X0 - abs(x))
        tap = 0.3 + 0.7 * smooth(0.0, 0.4, X0 - abs(x))
        st = 0.12 * tap
        top = [(yT(z) + st * (1 + 0.38 * math.sin(x * 2.3 + z * 4.1 + 0.6 * math.sin(x * 0.9)) * math.sin(PI * (z - zb) / (ze - zb))), z) for z in (zb, zb + 0.3, zb + 0.6, ze - 0.1)]
        lipr = [(yT(ze) + st * 0.92, ze - 0.02 + 0.02 * r_), (yT(ze) + st * 0.45, ze + 0.045 + 0.035 * r_), (yT(ze) - 0.01 - dd * tap, ze + 0.03 + 0.02 * r_ + 0.2 * dd)]
        return top + lipr + [(yT(ze) - 0.006, ze - 0.03), (yT(zb) - 0.006, zb + 0.02)]
    NX = 36
    sweep_x([-X0 + 0.02 + (2 * X0 - 0.04) * i / NX for i in range(NX + 1)], snowp, 'roofsnow', SNOW)
    for k, x in enumerate((-2.1, -0.55, 1.0, 2.3)):     # snow piled against the upper wall
        pillow((x, yT(zb + 0.14) + 0.03, zb + 0.14), 0.27, 0.62, 70 + k, 1.7, 0.95, K=12, J=4, tag='roofsnow', fine=False)
    rng = random.Random(83)
    for i in range(16):
        x = -X0 + 0.25 + i * (2 * X0 - 0.5) / 15 + rng.uniform(-0.05, 0.05)
        if abs(abs(x) - 0.95) < 0.22 or rng.random() < 0.25: continue
        icicle(x, yT(ze) - 0.11, ze + 0.045, 0.08 + rng.random() ** 1.5 * 0.22)
    for s, colr in ((-1, '#e04a3a'), (1, '#fff0d0')):
        chochin(0.17, 0.36, colr, cord=0.06, pos=(s * 0.95, yT(Fz + 0.4) - 0.09, Fz + 0.4))
    # ---- the upper floor: warm board walls with battens, a row of glowing shoji, round windows in the sides
    PAL['wallLo'] = '#94684a'
    with at((0, 0, zu)): walls(dict(w=uw, d=ud, h=h2, y0=uy, plaster='#b88a62', frame=T['timber'], sill=False))
    PAL['wallLo'] = '#e0d4c2'
    ub = dict(w=uw, d=ud, cz=zu)
    for side, L in (('f', uw), ('l', ud), ('r', ud)):
        n = round(L / 0.42)
        for i in range(1, n):
            u = -L / 2 + i * L / n
            with on_face(ub, side, u, uy + h2 / 2): add(box(0.05, h2 - 0.04, 0.035, (0, 0, 0.012), r=0.0), wood('#7a5238'), 'battens')
    for k, u in enumerate((-1.6, 0.0, 1.6)):
        with on_face(ub, 'f', u, uy + 0.76):
            shoji(1.1, 0.75, frame=T['timber'], cell=0.28)
            if k == 2:                         # (one torn pane: the ryokan's been empty a while)
                add(box(0.2, 0.15, 0.012, (0.3, 0.12, 0.05), r=0.0), flat('#3a2a30'), 'window')
    for side in 'lr':
        with on_face(ub, side, 0, uy + 0.8): round_window(0.26, frame=T['timber'])
    # ---- the heavy irimoya roof under deep snow (a snow ring round the hips, a sheet over the gable top), dark
    #      onigawara, one corner broken open, a stovepipe for the bath-boiler steam
    with at((0, 0, zu)):
        tg, gO, cv2 = 0.55, 0.3, 0.3
        R2 = slate_roof('irimoya', uw, ud, uy + h2, 0.55, 1.25, cv2, tg=tg, gOver=gO, seed=37, ribW=0.8)
        A2, B2 = R2['A'], R2['Bz']; ys2 = roof_surf(R2, cv2)
        ob_ = A.objs['body']; n0 = len(ob_['v'])
        snow_blanket(lambda t: A2 - B2 * t, lambda t: B2 * (1 - t), ys2, lambda x, z: R2['yAt'](x, z) + 0.035, th=0.15, lip=0.1, droop=0.05,
                     NS=60, seed=43, cushion=0.07, tperiod=0.3, aperiod=1.2, tTop=tg + 0.08, inner=0.04, nmid=6, rollp=0.8, ice=dict(every=0.55, len=(0.07, 0.3)), back_keep=0.0)
        n1 = len(ob_['v'])
        Xg = A2 - B2 * tg + gO
        t0 = tg - 0.06; TT = lambda t: t0 + t * (1 - t0)
        with at((0, 0, 0), ry=PI / 2):
            snow_sheet(Xg + 0.02, lambda t: B2 * (1 - TT(t)), lambda t: ys2(TT(t)), th=0.17, lip=0.08, droop=0.05, endLip=0.07, ridge=0.07, NZ=10,
                       seed=45, cushion=0.05, tperiod=0.5, zperiod=1.0, nrows=5, rollp=0.7, drips=0.1)
        onigawara(Xg + 0.05, ys2(1.0) + 0.17 + 0.07 - 0.06, clamp(B2 / 1.4, 0.55, 1.1), seed=7)
        yS = lambda x, z: R2['yAt'](x, z) + 0.035 + 0.15
        c, ex, ezv, nv = slope_frame(yS, 1.75, 1.12)
        broken_patch(c, ex, ezv, nv, 0.5, 0.36, seed=5)
        # dent the blanket under the hole (its snow pushed down into the roof, the patch's rim hides the seam)
        Mi = F.m.inverted()
        for i in range(n0, n1):
            q = GMi @ (Mi @ ob_['v'][i]); rel = q - c
            rr = math.hypot(rel.dot(ex) / 0.5, rel.dot(ezv) / 0.36)
            if rr < 1.25:
                ob_['v'][i] = F.W(tuple(q - nv * 0.34 * (1 - smooth(0.95, 1.25, rr))))
        # the stovepipe (the region's steam puffs rise from game-local (1.98, 3.2, 0.28))
        px, pz = 1.98, 0.28 - zu
        yb_ = ys2(TT(clamp(1 - abs(px) / max(1e-3, Xg)))) if False else R2['yAt'](px, pz) + 0.1
        add(cyl(0.085, 0.085, 0.9, (px, yb_ + 0.35, pz), K=8), lac(T['iron'], hi='#7a7688'), 'pipe')
        add(cyl(0.11, 0.11, 0.08, (px, yb_ + 0.5, pz), K=8), soft('#3a3644', 0.3), 'pipe')
        add(glathe([(0.0, -0.02), (0.19, -0.02), (0.0, 0.12)], 8, pos=(px, yb_ + 0.9, pz)), lac('#5a5664', hi='#8a8698'), 'pipe')
        for s in (-1, 1): add(box(0.03, 0.12, 0.03, (px + s * 0.08, yb_ + 0.84, pz), r=0.0), soft(T['iron'], 0.3), 'pipe')
        pillow((px, yb_ + 0.99, pz), 0.12, 0.5, 13, tag='pipe', fine=False)
    # ---- snow banked against the side walls, drifts at the veranda ends, a few tiles fallen into the snow
    for s in (-1, 1):
        for k, zz in enumerate((-1.05, 0.0, 1.0)):
            pillow((s * (w / 2 + 0.14), 0.0, zz - 0.15), 0.5, 0.5 + 0.08 * (k % 2), 11 + k * 3 + s, 0.75, 1.3, ry=0.1 * s * (k - 1), K=12, J=4, tag='bank', fine=False)
        pillow((s * (w / 2 - 0.12), ey + 0.01, ez1 - 0.3), 0.3, 0.45, 30 + s, 1.0, 1.3, K=11, J=4, tag='drift', fine=False)
    pillow((-1.9, 0.0, ez1 + 0.22), 0.4, 0.34, 41, 1.4, 0.85, K=12, J=4, tag='drift', fine=False)
    pillow((2.15, 0.0, ez1 + 0.24), 0.36, 0.32, 42, 1.3, 0.85, K=12, J=4, tag='drift', fine=False)
    rng = random.Random(29)
    for k in range(4):
        with at((2.75 + rng.uniform(-0.3, 0.3), 0.07, ez1 + 0.25 + rng.uniform(-0.1, 0.25)), ry=rng.uniform(0, PI), rx=rng.uniform(-0.5, 0.5), rz=rng.uniform(-0.4, 0.4)):
            add(box(0.2, 0.035, 0.15, (0, 0, 0), r=0.0), paint(SLATE_PAL['color'], hi=SLATE_PAL['hi'], top=0.3), 'tiles')
    return A, dict(lights=[[-0.95, 1.8, 2.15], [0.95, 1.8, 2.15], [0, 1.3, 2.0]])

# ================================================================== round 2: shared small-prop helpers
def rect_icing(a, b, y, he, thick, inner, ths=None, rho=0.025, J=3, p=5.0, tag='snow'):
    """snow icing over a flat rectangular top (half extents a (x) by b (z) at height y, game frame): the profile runs
    flat, rounds the edge (radius rho) and hangs down the sides, so drips (he > 1) drape over the edges"""
    def R(th):
        c, s_ = abs(math.cos(th)), abs(math.sin(th))
        return ((c / a) ** p + (s_ / b) ** p + 1e-12) ** (-1 / p)
    def Ps(u, th):
        r = R(th); sd = u * r; c, s_ = math.cos(th), math.sin(th); f = r - rho
        if sd <= f: rad, dy = sd, 0.0
        elif sd <= f + PI * rho / 2:
            g = (sd - f) / rho; rad, dy = f + rho * math.sin(g), -rho * (1 - math.cos(g))
        else: rad, dy = r, -rho - (sd - f - PI * rho / 2)
        return (rad * c, y + dy, rad * s_)
    add(icing(Ps, he, thick, ths or [TAU * k / 32 for k in range(32)], J, inner), SNOW, tag)

def leaf_blade(base, d, up, L, W, th=0.02, droop=0.0, c0='#2f6a34', c1='#78b85a', tag='leaf'):
    """a chunky leaf: a diamond slab from base along d (game frame), bent down by droop at the tip (leaf material)"""
    d = Vector(d).normalized(); sv = d.cross(Vector(up)).normalized(); nv = sv.cross(d).normalized()
    if nv.y < 0: nv = -nv
    B0 = Vector(base)
    P = lambda x, w: B0 + d * x + sv * w - nv * droop * (x / L) ** 2
    out = [(0.0, 0.0), (L * 0.3, W / 2), (L * 0.68, W * 0.3), (L, 0.0), (L * 0.68, -W * 0.3), (L * 0.3, -W / 2)]
    t = Tmp(); n = len(out)
    top = [t.vert(F.W(tuple(P(x, w) + nv * th / 2))) for x, w in out]; bot = [t.vert(F.W(tuple(P(x, w) - nv * th / 2))) for x, w in out]
    ct = t.vert(F.W(tuple(P(L * 0.42, 0) + nv * th * 0.9))); cb = t.vert(F.W(tuple(P(L * 0.42, 0) - nv * th / 2)))
    nB = F.N(tuple(nv))
    for k in range(n):
        k1 = (k + 1) % n
        t.face([ct, top[k], top[k1]], nB); t.face([cb, bot[k1], bot[k]], -nB)
        t.face([top[k], bot[k], bot[k1], top[k1]], (t.v[top[k]] + t.v[top[k1]]) / 2 - t.v[ct])
    b0 = F.W(tuple(B0)); Lb = L
    add(t, lambda p_, nn: mul(mix(c0, c1, clamp((p_ - b0).length / Lb) * 0.8 + 0.2 * clamp(nn.z)), 0.9 + 0.12 * clamp(nn.z)), tag)

def oke_bucket(r=0.13, h=0.18, water=False, seed=0, lugs=False, tag='oke', K=16):
    """a wooden bath bucket: eight warm staves with dark seams, two copper hoops, a lighter rim, spring water"""
    staves = 8; cB = F.W((0, 0, 0)); rng = random.Random(seed * 13 + 1)
    tones = [mul('#c99e6c', 0.9 + 0.18 * rng.random()) for _ in range(staves)]
    def col(p, n):
        a = (math.atan2(p.y - cB.y, p.x - cB.x) / TAU) % 1.0 * staves; i = int(a) % staves; f = a - math.floor(a)
        c = tones[i]
        if f < 0.1 or f > 0.9: c = mul(c, 0.7)
        if p.z - cB.z > h * 0.9 and n.z > 0.3: c = mix(c, '#f0d4a4', 0.5)
        if p.z - cB.z < h * 0.6 and n.z > 0.5: c = mul('#6a4a34', 1.0)          # (the inside floor)
        return mul(c, 0.84 + 0.18 * clamp(n.z + 0.5))
    add(glathe([(0.0, 0.0), (r * 0.86, 0.0), (r, h), (r * 0.9, h), (r * 0.8, 0.035), (0.0, 0.035)], K), col, tag)
    for yy in (0.24, 0.78):
        R = r * (0.86 + 0.14 * yy) + 0.003
        add(gloop([(R * math.cos(TAU * k / 12), h * yy, R * math.sin(TAU * k / 12)) for k in range(12)], 0.0115, K=4), soft('#8a5a3c', 0.3), tag)
    if lugs:
        for s in (-1, 1): add(box(0.035, 0.08, 0.035, (s * (r * 0.95), h + 0.025, 0), r=0.0), wood('#c99e6c'), tag)
    if water:
        with mat_as('water'):
            add(glathe([(0.0, -0.006), (r * 0.885, -0.006), (r * 0.885, 0.004), (0.0, 0.006)], 14, pos=(0, h * 0.78, 0)),
                lambda p, n: mix('#3ec4c0', '#9aeee4', clamp((p - F.W((0, h * 0.78, 0))).length / (r * 0.9))), tag)

def log_piece(p0, p1, r, K=7, seed=0, tag='logs', end_c='#ecc890'):
    """a log or split from p0 to p1 (game frame): bark sides with a soft bevel, flat pale ends with growth rings"""
    a, b = Vector(p0), Vector(p1); ax = (b - a).normalized(); rng = random.Random(seed)
    u = ax.cross(Vector((0, 1, 0)) if abs(ax.y) < 0.9 else Vector((1, 0, 0))).normalized(); v = ax.cross(u)
    ph = rng.uniform(0, 1); e = min(0.012, r * 0.25)
    ring = lambda c, rr: [tuple(c + (u * math.cos(TAU * (k + ph) / K) + v * math.sin(TAU * (k + ph) / K)) * rr) for k in range(K)]
    rings = [ring(a, r - e), ring(a + ax * e, r), ring(b - ax * e, r), ring(b, r - e)]
    t = gsurf(rings, pole0=tuple(a), pole1=tuple(b))
    axB = F.N(tuple(ax)); cA = F.W(tuple(a))
    bark = mix('#7a5040', '#9a6a4a', rng.random())
    def col(p, n):
        if abs(n.dot(axB)) > 0.75:
            d = ((p - cA) - axB * (p - cA).dot(axB)).length / r
            return mix(end_c, '#c8945e', clamp(d) ** 2 * 0.7)
        return mul(bark, 0.82 + 0.2 * clamp(n.z + 0.4) + 0.08 * math.sin(math.atan2(n.y, n.x) * 9 + seed))
    add(t, col, tag)

def small_toro(seed=0, tag='toro'):
    """a small kasuga lantern: base, post, platform, a hex firebox with glowing paper, a snow-capped kasa, the jewel"""
    th0 = PI / 6
    add(glathe([(0.0, 0.0), (0.2, 0.0), (0.21, 0.05), (0.16, 0.1), (0.0, 0.1)], 6, ry=th0), lstone(seed), tag)
    add(cyl(0.06, 0.075, 0.52, (0, 0.35, 0), K=8), lstone(seed + 1), tag)
    add(glathe([(0.0, 0.6), (0.11, 0.6), (0.19, 0.66), (0.18, 0.72), (0.0, 0.72)], 6, ry=th0), lstone(seed + 2), tag)
    add(glathe([(0.0, 0.72), (0.12, 0.72), (0.12, 0.98), (0.0, 0.98)], 6, ry=th0), flat('#4a4e62'), tag)
    for k in range(6):
        a = k * TAU / 6
        with at((0.135 * math.cos(a), 0.85, 0.135 * math.sin(a)), ry=-a): add(box(0.05, 0.26, 0.05, (0, 0, 0), r=0.0), lstone(seed + 3 + k), tag)
    for k in range(6):
        a = k * TAU / 6 + TAU / 12
        with at((0, 0.85, 0), ry=PI / 2 - a):
            if k % 2 == 0: add(box(0.11, 0.2, 0.02, (0, 0, 0.11), r=0.0), lambda p, n: '#ffdc98', tag, glow=True)
            else:
                add(box(0.11, 0.2, 0.03, (0, 0, 0.11), r=0.0), lstone(seed + 10 + k), tag)
                add(glathe([(0.0, -0.005), (0.035, -0.005), (0.035, 0.005), (0.0, 0.005)], 8, pos=(0, 0.02, 0.127), rx=PI / 2), lambda p, n: '#ffd27a', tag, glow=True)
    kas = [(0.0, 0.97), (0.3, 0.97), (0.32, 1.01), (0.29, 1.04), (0.12, 1.13), (0.0, 1.15)]
    add(glathe(kas, 6, ry=th0), lambda p, n: mix(lstone(seed + 20)(p, n), '#e8b070', 0.6 * clamp(-n.z - 0.15)), tag)
    for k in range(6):
        a = k * TAU / 6; c_, s_ = math.cos(a), math.sin(a)
        add(gtube([(c_ * 0.28, 1.02, s_ * 0.28), (c_ * 0.33, 1.04, s_ * 0.33), (c_ * 0.33, 1.08, s_ * 0.33)], 0.022, K=4), lstone(seed + 30), tag)
    pillow((0.0, 1.1, 0.0), 0.22, 0.42, seed + 5, 1.0, 1.0, K=11, J=4, tag='snow', fine=False)
    add(glathe([(0.0, 0.0), (0.05, 0.01), (0.06, 0.05), (0.035, 0.09), (0.0, 0.11)], 8, pos=(0, 1.17, 0)), lstone(seed + 40), tag)
    pillow((0.0, 1.27, 0.0), 0.045, 0.6, seed + 6, K=7, J=3, tag='snow', fine=False)

def bamboo_clump(n=3, h=1.4, seed=0, tag='bamboo'):
    """a few culms (node rings, a lean), sprays of chunky blade leaves near the top (leaf), a dab of snow"""
    rng = random.Random(seed * 7 + 3)
    for i in range(n):
        a = i / n * TAU + rng.uniform(-0.3, 0.3); r0 = 0.1
        b = Vector((math.cos(a) * r0, 0.0, math.sin(a) * r0)); hh = h * rng.uniform(0.85, 1.05)
        lean = Vector((math.cos(a) * 0.12, 0, math.sin(a) * 0.12))
        top = b + Vector((0, hh, 0)) + lean
        add(gtube([tuple(b), tuple(b.lerp(top, 0.5) + lean * 0.1), tuple(top)], lambda u: 0.036 - 0.01 * u, K=6),
            lambda p, nn: mul(mix('#8cbf5a', '#b4d878', clamp(nn.z * 0.5 + 0.5)), 0.9), tag)
        for k in range(1, 4):
            q = b.lerp(top, k / 4)
            add(cyl(0.04 - 0.003 * k, 0.04 - 0.003 * k, 0.03, tuple(q), K=6), flat('#5e8e42'), tag)
        for k in range(3):
            q = b.lerp(top, 0.6 + 0.17 * k); ang0 = rng.uniform(0, TAU)
            for j in range(3):
                ang = ang0 + j * TAU / 3 + rng.uniform(-0.3, 0.3)
                d = (math.cos(ang), -0.25 + 0.1 * k, math.sin(ang))
                with mat_as('leaf'): leaf_blade(tuple(q), d, (0, 1, 0), 0.3, 0.075, 0.018, droop=0.06, c0='#3e7a38', c1='#8ccc5c', tag=tag)
        pillow(tuple(top + Vector((0.0, -0.08, 0.0))), 0.07, 0.6, seed + i, K=7, J=3, tag='snow', fine=False)

def leaf_bush(r=0.32, seed=0, flowers=('#ffbcd6', '#ff8fb0'), nl=30, tag='bush'):
    """a round shrub of chunky leaf blades (leaf material) over a dark core, pink flowers, a snow cap on top"""
    rng = random.Random(seed * 11 + 5)
    with mat_as('leaf'):
        pillow((0, r * 0.62, 0), r * 0.82, 0.95, seed, K=9, J=4, tag=tag, fine=False, col=lambda p, n: mul(mix('#1e4a2c', '#2e6a3a', clamp(n.z * 0.5 + 0.5)), 1.0))
        for i in range(nl):
            ga = i * 2.39996 + rng.uniform(-0.2, 0.2); v = (i + 0.5) / nl
            el = math.asin(clamp(1 - 1.15 * v, -0.3, 1.0))
            d = Vector((math.cos(ga) * math.cos(el), math.sin(el) + 0.25, math.sin(ga) * math.cos(el))).normalized()
            base = Vector((0, r * 0.62, 0)) + d * r * 0.55
            leaf_blade(tuple(base), tuple(d), (0, 1, 0) if abs(d.y) < 0.9 else (1, 0, 0), r * 0.75, r * 0.38, 0.022, droop=0.03, tag=tag)
    for i in range(5):
        ga = rng.uniform(-1.4, 1.4) + PI / 2; y = r * rng.uniform(0.5, 1.0)
        p = (math.cos(ga) * r * 1.0, y, math.sin(ga) * r * 0.95); c = flowers[i % len(flowers)]
        fb = blob(F.W(p), 0.06, 0.045, lobes=5, K=10, seed=i, amp=0.28)
        fb.c = [mul(c, 0.82)] * 10 + [mix(c, '#fff6ea', 0.2)] * 10 + [mul(c, 0.78), '#ffd24a']
        add(fb, None, tag)
    pillow((0.02, r * 1.28, 0.0), r * 0.62, 0.42, seed + 3, 1.1, 1.0, K=12, J=4, tag='snow', fine=False)

def rim_stone(x, z, r, seed, sq=0.62, snowy=True, tag='rim'):
    """a rounded rim stone: wet and dark on the water side, snow on its outer shoulder (painted, a soft broken edge)"""
    rng = random.Random(seed); out = Vector((x, 0, z)).normalized(); outB = F.N(tuple(out))
    c0 = ONSEN_STONES[seed % len(ONSEN_STONES)]
    t = lathe([(0.0, -0.1), (r, r * sq * 0.2), (r * 0.94, r * sq * 0.6), (r * 0.66, r * sq * 0.92), (0.0, r * sq)], 9, th0=rng.uniform(0, 1),
              rfn=lambda rr, zz, th: rr * (1 + 0.1 * math.sin(2 * th + seed) + 0.06 * math.sin(3 * th + seed * 1.7)))
    t.xform(F.m @ lm((x, 0.06, z), ry=rng.uniform(0, PI)))
    def col(p, n):
        c = stone_col(c0, seed)(p, n); w = clamp(-n.dot(outB) * 1.2)
        c = mix(c, mul(c0, 0.62), w * 0.75)
        if snowy:
            k = n.z + 0.6 * n.dot(outB) - 0.45 + 0.35 * (vnoise(p, 7.0, seed) - 0.5)
            if k > 0.5: c = mix(c, snow_col(seed)(p, n), smooth(0.5, 0.6, k))
        return c
    add(t, col, tag)

# ================================================================== the bathhouse (kit bathhouse: onsen template, snowed on)
def build_bathhouse():
    new_piece()
    px, pz = -0.2, 0.35
    rng = random.Random(41)
    # ---- the rock-rimmed hot pool: a stone kerb, teal water, rim stones (wet inside, snow outside), the big rock
    t = lathe([(0.0, 0.03), (1.38, 0.03), (1.4, 0.15), (1.26, 0.22), (1.16, 0.15), (0.0, 0.15)], 28, sx=1.1, sy=0.85)
    add(t.xform(F.m @ lm((px, 0, pz))), lambda p, n: mul('#5e6478', 0.9 + 0.15 * clamp(n.z)), 'pool')
    with mat_as('water'):
        tw = lathe([(0.0, 0.17), (1.2, 0.17), (1.2, 0.19), (0.0, 0.195)], 28, sx=1.1, sy=0.85).xform(F.m @ lm((px, 0, pz)))
        cW = F.W((px, 0.19, pz))
        add(tw, lambda p, n: mix('#2aa8b4', '#8eeade', clamp(((p.x - cW.x) / 1.32) ** 2 + ((p.y - cW.y) / 1.02) ** 2) ** 1.4), 'water')
    for i in range(20):
        a = i / 20 * TAU + rng.uniform(-0.05, 0.05); r = rng.uniform(0.17, 0.25)
        if abs(a - 3.75) < 0.35: continue            # (the big rock sits here)
        rim_stone(px + math.cos(a) * 1.44, pz + math.sin(a) * 1.13, r, 80 + i)
        if i % 4 == 0: pillow((px + math.cos(a) * 1.52, 0.06 + r * 0.55, pz + math.sin(a) * 1.2), r * 0.7, 0.42, 90 + i, 1.2, 0.9, ry=-a, K=9, J=4, tag='snow', fine=False)
    bx, bz = px - 1.0, pz - 0.7
    t = lathe([(0.0, -0.1), (0.46, 0.1), (0.4, 0.42), (0.22, 0.62), (0.0, 0.66)], 9, th0=0.3,
              rfn=lambda rr, zz, th: rr * (1 + 0.12 * math.sin(2 * th + 1) + 0.07 * math.sin(3 * th + 2)))
    add(t.xform(F.m @ lm((bx, 0, bz), ry=0.4)), lambda p, n: mix(stone_col('#a8a0b4', 3)(p, n), mul('#a8a0b4', 0.65), clamp(-n.x * 0.5 - n.y * 0.5)), 'rock')
    pillow((bx + 0.04, 0.6, bz - 0.04), 0.3, 0.42, 5, 1.1, 1.0, K=12, J=4, tag='snow', fine=False)
    with mat_as('cloth'):
        add(sbox(0.3, 0.05, 0.22, (bx + 0.24, 0.47, bz + 0.2), r=0.02, ry=0.4, rz=-0.35), soft('#fff4ea', 0.2), 'towel')
    # a rubber duck on the water
    add(sph(0.075, (px + 0.3, 0.22, pz - 0.2), sc=(1.1, 0.8, 1.0), K=8, J=4), lac('#ffd24a'), 'duck')
    add(sph(0.045, (px + 0.36, 0.3, pz - 0.2), K=7, J=4), lac('#ffd24a'), 'duck')
    add(glathe([(0.0, 0.0), (0.02, 0.0), (0.0, 0.04)], 5, pos=(px + 0.4, 0.3, pz - 0.2), rz=-PI / 2), flat('#ff8a3a'), 'duck')
    # the bamboo spout (kakei) pouring into the pool
    with at((px + 1.25, 0, pz - 0.75)):
        add(cyl(0.05, 0.06, 0.82, (0, 0.41, 0), K=7), lambda p, n: mul('#8fc86a', 0.85 + 0.2 * clamp(n.z + 0.5)), 'spout')
        add(cyl(0.055, 0.055, 0.03, (0, 0.55, 0), K=7), flat('#5e8e42'), 'spout')
        add(gtube([(0.0, 0.76, 0.0), (-0.24, 0.73, 0.16), (-0.48, 0.69, 0.33)], 0.04, K=6), lambda p, n: mul('#9ad874', 0.85 + 0.2 * clamp(n.z + 0.5)), 'spout')
        pillow((0, 0.83, 0), 0.075, 0.6, 3, K=7, J=3, tag='snow', fine=False)
        with mat_as('water'):
            add(gtube([(-0.5, 0.68, 0.34), (-0.55, 0.55, 0.38), (-0.58, 0.22, 0.4)], lambda u: 0.026 + 0.008 * u, K=6), lambda p, n: '#c8f4ff', 'water')
            add(glathe([(0.0, -0.005), (0.12, -0.005), (0.1, 0.012), (0.0, 0.016)], 10, pos=(-0.58, 0.195, 0.4)), lambda p, n: '#e8fcff', 'water')
    # ---- the bamboo screens (back and left), snow along the tops and drifts at their feet
    with at((-1.9, 0, -1.85), ry=PI / 2): bamboo_screen(3.8, cap_spacing=0.6)
    with at((-1.85, 0, -1.78)): bamboo_screen(2.38, cap_spacing=0.6)
    for k, x in enumerate((-1.3, -0.4, 0.5)):
        pillow((x, 0.0, -1.62), 0.36, 0.45, 20 + k, 1.4, 0.8, K=11, J=4, tag='bank', fine=False)
    for k, z in enumerate((-0.9, 0.1)):
        pillow((-1.62, 0.0, z), 0.34, 0.45, 25 + k, 0.8, 1.4, K=11, J=4, tag='bank', fine=False)
    # ---- the changing hut (back right): board walls, a lit shoji door, red and indigo noren with the hot-spring mark,
    #      a slate gable under snow with icicles, a paper lantern and a wind bell
    with at((1.25, 0, -1.0)):
        w, d, h, y0 = 1.1, 0.9, 1.3, 0.15
        add(beam(w + 0.12, y0 + 0.2, d + 0.12, (0, (y0 - 0.2) / 2, 0), c=0.04), stone_col(T['stone'], 3), 'hut')
        PAL['wallLo'] = '#9a7452'
        walls(dict(w=w, d=d, h=h, y0=y0, plaster='#c9a27a', frame=T['timberMid'], sill=False))
        PAL['wallLo'] = '#e0d4c2'
        blk = dict(w=w, d=d)
        for side, L in (('l', d), ('r', d)):
            for u in (-0.2, 0.2):
                with on_face(blk, side, u, y0 + h / 2): add(box(0.04, h - 0.04, 0.03, (0, 0, 0.01), r=0.0), wood('#8a6448'), 'hut')
        with on_face(blk, 'f', 0, y0): door_slide(0.7, 1.05, 'shoji', '#9a7656', T['timberMid'])
        for s, colr in ((-1, '#d84848'), (1, T['indigo'])):
            x = s * 0.18; yR = y0 + 1.12; zz = d / 2 + 0.13
            add(cyl(0.022, 0.022, 0.4, (x, yR + 0.02, zz), K=6, rz=PI / 2), wood(PAL['frameLo']), 'noren')
            with mat_as('cloth'):
                add(beam(0.32, 0.44, 0.03, (x, yR - 0.22, zz), c=0.01, rx=0.04, rz=s * 0.02),
                    lambda p, n, colr=colr: mix(mul(colr, 0.82), mix(colr, '#ffffff', 0.12), clamp(n.z + 0.3)), 'noren')
                add(beam(0.32, 0.06, 0.034, (x, yR - 0.41, zz + 0.016), c=0.01, rx=0.04), soft('#f4efe6', 0.2), 'noren')
                onsen_mark(0.17, (x, yR - 0.2, zz + 0.026), depth=0.012, col='#fff4e6', tag='noren', K=4)
        cv = 0.3
        Rh = slate_roof('gable', w, d, y0 + h, 0.26, 0.55, cv, gOver=0.2, ribW=0.24, seed=53)
        snow_gable_x(Rh, w, 0.2, cv, th=0.1, lip=0.06, ridge=0.05, NZ=8, seed=55, ice=dict(every=0.22, len=(0.05, 0.16)), nrows=4)
        chochin(0.1, 0.2, '#fff0d0', cord=0.04, pos=(0, y0 + h + 0.0, d / 2 + 0.3))
        with at((-0.42, y0 + h - 0.02, d / 2 + 0.22)): furin()
    # ---- towels drying on a rack behind the pool
    with at((0.2, 0, -1.45)):
        for sx in (-1, 1): add(cyl(0.028, 0.032, 0.95, (sx * 0.42, 0.475, 0), K=6), wood('#8a6448', ao_z=0.0), 'towels')
        add(cyl(0.024, 0.024, 0.98, (0, 0.92, 0), K=6, rz=PI / 2), wood('#8a6448'), 'towels')
        with mat_as('cloth'):
            for i, (x, c) in enumerate(((-0.24, '#fff4ea'), (0.0, '#8fd0ff'), (0.24, '#ffd0d8'))):
                add(sbox(0.2, 0.34, 0.03, (x, 0.75, 0.025), r=0.012), soft(c, 0.25), 'towels')
                add(sbox(0.2, 0.12, 0.03, (x, 0.86, -0.025), r=0.012), soft(mul(c, 0.92), 0.2), 'towels')
        for sx in (-1, 1): pillow((sx * 0.42, 0.97, 0), 0.05, 0.6, 7 + sx, K=6, J=3, tag='snow', fine=False)
    # ---- buckets, a step stone, the lantern, bamboo, a flowering shrub, drifts
    with at((0.95, 0, 0.9)):
        oke_bucket(0.12, 0.16, seed=1)
        with at((0.0, 0.16, 0.0), ry=0.3): oke_bucket(0.11, 0.15, seed=2)
        pillow((0.02, 0.31, 0), 0.07, 0.5, 9, K=7, J=3, tag='snow', fine=False)
    with at((1.35, 0, 0.55), ry=0.6): oke_bucket(0.12, 0.16, water=True, seed=3, lugs=True)
    pebble((0.55, 0.0, 1.55), 0.24, 0.4, seed=31, col='#c4c6d2', tag='step', K=10)
    pebble((0.1, 0.0, 1.95), 0.22, 0.4, seed=32, col='#b8bccb', tag='step', K=10)
    with at((-1.55, 0, 1.4)): small_toro(60)
    with at((1.6, 0, 1.55)): bamboo_clump(3, 1.4, seed=4)
    with at((-1.6, 0, 0.95)): leaf_bush(0.3, seed=6, nl=22)
    for (x, z, r, sx, sz) in ((1.9, 0.3, 0.34, 0.9, 1.4), (-1.1, 1.75, 0.32, 1.4, 0.9), (1.05, 1.85, 0.3, 1.3, 0.9)):
        pillow((x, 0.0, z), r, 0.36, int(x * 10 + z * 7), sx, sz, K=11, J=4, tag='drift', fine=False)
    return A, dict(lights=[[-1.55, 0.9, 1.3], [px, 0.8, pz]])

# ================================================================== the trail signpost (kit signpost)
def arrow_board(L=0.7, H=0.2, D=0.055, tip=0.16, base='#b48a60', emblem=None, seed=0):
    """an arrow-shaped board along local +x from the post (face frame: z out), bevelled; an emblem on both faces"""
    poly = [(-0.06, -H / 2), (L - tip, -H / 2), (L, 0.0), (L - tip, H / 2), (-0.06, H / 2)]
    add(puffy(poly, D / 2, bev=0.012, z0=0.0), wood(base, seed=seed), 'board')
    with at((0, 0, 0), ry=PI):
        add(puffy([(-x, y) for x, y in poly][::-1], D / 2, bev=0.012, z0=0.0), wood(mul(base, 0.96), seed=seed + 1), 'board')
    add(box(L - tip - 0.02, 0.03, D + 0.012, ((L - tip) / 2 - 0.04, -H / 2 + 0.03, 0), r=0.0), flat(mul(base, 0.72)), 'board')
    for sz in (1, -1):
        with at((0, 0, 0), ry=0 if sz > 0 else PI):
            ex = (L - tip) * 0.42 if sz > 0 else -(L - tip) * 0.42
            if emblem == 'onsen':
                add(glathe([(0.0, -0.006), (0.075, -0.006), (0.075, 0.006), (0.0, 0.006)], 12, pos=(ex, 0.0, D / 2 + 0.004), rx=PI / 2), flat('#3a5a8a'), 'emblem')
                onsen_mark(0.11, (ex, 0.005, D / 2 + 0.012), depth=0.01, col='#fff4e6', tag='emblem', K=4)
            else:   # a snowy peak
                add(puffy([(ex - 0.08, -0.06), (ex + 0.08, -0.06), (ex, 0.07)], 0.012, bev=0.004, z0=D / 2), flat('#4e5a78'), 'emblem')
                add(puffy([(ex - 0.034, 0.0), (ex + 0.034, 0.0), (ex, 0.07)], 0.016, bev=0.004, z0=D / 2), flat('#f4f6fc'), 'emblem')
    # snow along the top edge: a lumpy bead with two little drips
    rng = random.Random(seed * 3 + 1)
    pts = [(-0.04 + (L - tip * 0.6) * k / 5, H / 2 + 0.02, 0.0) for k in range(6)]
    add(gtube(pts, lambda u: 0.032 + 0.01 * math.sin(u * 9 + seed), K=6), SNOW, 'snow')
    for k in range(2):
        x = rng.uniform(0.1, L - tip - 0.1); sz = rng.choice((-1, 1))
        add(sph(0.022, (x, H / 2 - 0.01, sz * (D / 2 + 0.006)), sc=(1, 1.6, 0.8), K=6, J=3), SNOW, 'snow')

def build_signpost():
    new_piece()
    pebble((0.08, 0.0, 0.06), 0.2, 0.5, seed=3, col=ONSEN_STONES[1], tag='base', K=9)
    pebble((-0.1, 0.0, -0.05), 0.15, 0.55, seed=4, col=ONSEN_STONES[3], tag='base', K=8)
    add(beam(0.11, 1.62, 0.11, (0, 0.81, 0), c=0.025), wood('#6a4a36', ao_z=0.0, seed=2), 'post')
    for s in (-1, 1):   # the little gable cap on the post top
        add(box(0.2, 0.025, 0.12, (s * 0.05, 1.66, 0), r=0.0, rz=-s * 0.5), wood('#4a3428'), 'post')
    pillow((0.0, 1.71, 0.0), 0.085, 0.6, 5, 1.2, 1.0, K=8, J=4, tag='snow', fine=False)
    with at((0, 1.28, 0), ry=0.3): arrow_board(0.7, 0.2, 0.055, 0.16, '#b48a60', 'onsen', seed=1)
    with at((0, 1.0, 0), ry=-0.4): arrow_board(0.66, 0.19, 0.055, 0.15, '#a87e56', 'peak', seed=2)
    pillow((0.0, 0.0, 0.0), 0.24, 0.45, 8, 1.1, 1.0, K=12, J=4, tag='drift', fine=False)
    return A, dict()

# ================================================================== the bench (kit bench, seeds 0 and 1: one design)
def build_bench():
    new_piece()
    w = 1.3; wd, lg = '#b07e52', '#5a3e30'
    rake = 0.142; postZ = lambda y: -0.18 - y * rake
    for i in range(3):
        add(beam(w, 0.06, 0.12, (0, 0.425, -0.12 + i * 0.13), c=0.018), wood(mul(wd, 0.95 + 0.06 * i), seed=i), 'seat')
    for i in range(2):
        y = 0.6 + i * 0.13
        add(beam(w - 0.06, 0.1, 0.04, (0, y, postZ(y) + 0.05), c=0.014, rx=-math.atan(rake)), wood(mul(wd, 0.96 + 0.05 * i), seed=4 + i), 'back')
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.1)
        add(gtube([(x, 0.0, postZ(0)), (x, 0.84, postZ(0.84))], 0.036, K=4), wood(lg, ao_z=0.0), 'legs')
        add(beam(0.07, 0.64, 0.07, (x, 0.32, 0.17), c=0.016), wood(lg, ao_z=0.0), 'legs')
        add(beam(0.06, 0.06, 0.42, (x, 0.37, 0.0), c=0.014), wood(lg), 'legs')
        add(beam(0.09, 0.045, 0.44, (x + sx * 0.005, 0.66, -0.02), c=0.014), wood(wd, seed=8), 'arms')
        add(sph(0.045, (x + sx * 0.005, 0.665, 0.2), sc=(1.05, 0.6, 1.0), K=7, J=3), wood(wd), 'arms')
        pillow((x + sx * 0.005, 0.69, -0.04), 0.07, 0.5, 11 + sx, 0.75, 1.9, K=8, J=3, tag='snow', fine=False)
        for z in (0.17, -0.18):
            pillow((x, 0.0, z), 0.09, 0.5, 13 + sx + int(z * 10), K=7, J=3, tag='drift', fine=False)
    add(beam(w - 0.2, 0.05, 0.05, (0, 0.12, -0.2), c=0.012), wood(lg), 'legs')
    rng = random.Random(17)
    drips = [(th, rng.uniform(0.1, 0.17), rng.uniform(0.14, 0.2)) for th in (PI / 2 - 0.45, PI / 2 + 0.35, -PI / 2 + 0.3)]
    he = drip_he(lambda th: 0.82 + 0.06 * math.sin(3 * th + 1) + 0.05 * math.sin(7 * th + 2), drips)
    thick = lambda th, s: 0.075 * (1 - 0.45 * s * s) * (1 + 0.25 * math.sin(5 * th + 0.6) * (1 - s))
    rect_icing(0.6, 0.19, 0.455, he, thick, (0, 0.43, 0.01), ths=drip_angles(36, drips, offs=(-0.7, 0.0, 0.7), min_gap=0.05), rho=0.02)
    # snow along the top back board
    yb = 0.73 + 0.05
    add(gtube([(x, yb + 0.015, postZ(yb) + 0.05) for x in (-0.6, -0.3, 0.0, 0.3, 0.6)], lambda u: 0.03 + 0.008 * math.sin(u * 11), K=6), SNOW, 'snow')
    return A, dict()

# ================================================================== the bath buckets (kit oke)
def build_oke():
    new_piece()
    oke_bucket(0.13, 0.18, water=True, seed=1, lugs=True, K=32)
    with at((0.26, 0, 0.1), ry=0.5):
        oke_bucket(0.11, 0.16, seed=2, K=32)
        with at((0, 0.16, 0), ry=0.2):
            oke_bucket(0.1, 0.14, seed=3, K=32)
            pillow((0.0, 0.115, 0.0), 0.085, 0.5, 4, K=12, J=4, tag='snow', fine=False)
    # a ladle (hishaku) across the water bucket
    with at((0.0, 0.19, 0.0), ry=2.5):
        add(gtube([(-0.16, 0.012, 0.0), (0.2, 0.012, 0.0)], 0.016, K=5), wood('#d8b07a'), 'ladle')
        add(glathe([(0.0, 0.0), (0.045, 0.0), (0.05, 0.06), (0.042, 0.06), (0.038, 0.008), (0.0, 0.008)], 10, pos=(0.24, -0.02, 0.0)), wood('#c99e6c'), 'ladle')
    for (x, z, r) in ((-0.14, -0.1, 0.09), (0.4, 0.02, 0.08)):
        pillow((x, 0.0, z), r, 0.4, int(x * 40 + 9), 1.3, 0.9, K=10, J=3, tag='drift', fine=False)
    return A, dict()

# ================================================================== the woodcutter's rest (kit campRest)
def build_campRest():
    new_piece()
    rng = random.Random(23)
    # ---- the roofed firewood rack: four posts, a plank roof under snow, stacked split logs with pale ends
    w, h, d = 1.1, 0.62, 0.34
    for sx in (-1, 1):
        for sz in (-1, 1):
            hh = h + 0.09 + (0.0 if sz < 0 else -0.06)
            add(beam(0.06, hh, 0.06, (sx * (w / 2 + 0.03), hh / 2, sz * (d / 2 + 0.01)), c=0.014), wood('#5a4032', ao_z=0.0), 'rack')
    add(beam(w + 0.1, 0.05, d + 0.04, (0, 0.025, 0), c=0.012), wood('#6a4a36'), 'rack')
    nx, ny = 9, 5
    for j in range(ny):
        for i in range(nx - (j % 2)):
            x = -w / 2 + 0.065 + (i + 0.5 * (j % 2)) * (w - 0.13) / (nx - 1) + rng.uniform(-0.008, 0.008)
            y = 0.1 + j * 0.108; r = rng.uniform(0.05, 0.058); L = d * rng.uniform(0.92, 1.04); dz = rng.uniform(-0.02, 0.02)
            log_piece((x, y, -L / 2 + dz), (x, y, L / 2 + dz), r, K=5, seed=i * 7 + j, tag='firewood')
    with at((0, h + 0.1, 0.0), rx=0.22):
        for k in range(4):
            add(beam(w + 0.2, 0.04, (d + 0.22) / 4 - 0.008, (0, 0, -(d + 0.22) / 2 + (k + 0.5) * (d + 0.22) / 4), c=0.01), wood(mul('#6e5040', 0.94 + 0.05 * (k % 2)), seed=k), 'roof')
        rd = [(th, rng.uniform(0.1, 0.16), rng.uniform(0.14, 0.2)) for th in (PI / 2 - 0.15, PI / 2 + 0.7)]
        he = drip_he(lambda th: 0.84 + 0.05 * math.sin(3 * th + 0.4) + 0.04 * math.sin(7 * th), rd)
        rect_icing((w + 0.2) / 2, (d + 0.22) / 2, 0.02, he, lambda th, s: 0.09 * (1 - 0.45 * s * s) * (1 + 0.2 * math.sin(4 * th) * (1 - s)),
                   (0, 0.0, 0), ths=drip_angles(36, rd, offs=(-0.7, 0.0, 0.7), min_gap=0.05), rho=0.02)
        for k, x in enumerate((-0.35, 0.05, 0.4)):
            icicle(x, -0.02, (d + 0.22) / 2 + 0.01, 0.06 + 0.04 * (k % 2))
    # ---- the chopping block with its axe, splits round it
    with at((1.05, 0, 0.45), ry=0.6):
        cB = F.W((0, 0.26, 0))
        add(cyl(0.15, 0.17, 0.26, (0, 0.13, 0), K=10, bev=0.02),
            lambda p, n: mix('#ecc890', '#c89a68', 0.5 + 0.5 * math.sin((p - cB).length * 70)) if n.z > 0.8 else mul('#7a5642', 0.82 + 0.18 * clamp(n.z + 0.5)), 'block')
        with at((0.02, 0.27, 0), ry=0.4):
            add(gtube([(0.0, 0.0, 0.0), (0.24, 0.42, 0.0)], lambda u: 0.022 - 0.004 * u, K=6), wood('#c8a070'), 'axe')
            add(beam(0.05, 0.1, 0.15, (0.0, 0.02, 0.03), c=0.01, rz=-0.5), lac('#7a7884', hi='#b0aeb8'), 'axe')
            add(box(0.054, 0.025, 0.15, (-0.02, -0.025, 0.03), r=0.0, rz=-0.5), flat('#dcdce4'), 'axe')
        pillow((-0.07, 0.25, 0.05), 0.09, 0.4, 5, K=8, J=3, tag='snow', fine=False)
        for k in range(3):
            a = rng.uniform(0, TAU); x, z = math.cos(a) * 0.3 + 0.1, math.sin(a) * 0.25
            log_piece((x - 0.1 * math.cos(a + 1), 0.035, z - 0.1 * math.sin(a + 1)), (x + 0.1 * math.cos(a + 1), 0.035, z + 0.1 * math.sin(a + 1)), 0.04, K=4, seed=40 + k, tag='splits')
    # ---- the log pile: two logs and one on top, a snow saddle along it
    with at((-1.1, 0, 0.5), ry=-0.4):
        for k, (x, y) in enumerate(((-0.125, 0.12), (0.125, 0.12), (0.0, 0.33))):
            L = 1.0 * rng.uniform(0.92, 1.04); dz = rng.uniform(-0.05, 0.05)
            log_piece((x, y, -L / 2 + dz), (x, y, L / 2 + dz), 0.12 * rng.uniform(0.92, 1.02), K=8, seed=60 + k, tag='logpile')
        add(gtube([(0.0, 0.47, z) for z in (-0.42, -0.2, 0.05, 0.3, 0.44)], lambda u: 0.05 + 0.02 * math.sin(u * 7 + 1), K=7), SNOW, 'snow')
        for s in (-1, 1): pillow((s * 0.2, 0.26, 0.05), 0.1, 0.6, 70 + s, 0.8, 3.0, K=8, J=3, tag='snow', fine=False)
    # ---- snow banked behind and round the corners
    for i in range(3): pillow(((i - 1) * 0.9, 0.0, -0.38), 0.4, 0.38, 9 + i, 1.3, 0.85, K=12, J=4, tag='bank', fine=False)
    pillow((0.62, 0.0, 0.3), 0.18, 0.4, 31, K=9, J=3, tag='drift', fine=False)
    return A, dict()

# ================================================================== finishing and export
def export_piece(A, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {'body': vc_mat('body'), 'glow': vc_mat('glow', '#ffd890', 1.0), 'cloth': vc_mat('cloth'), 'leaf': vc_mat('leaf'), 'water': vc_mat('water')}
    next(n for n in mats['water'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Roughness'].default_value = 0.25
    obs = [to_object(k, o, mats) for k, o in A.objs.items()]
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for k, o in A.objs.items():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('RG %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('RG %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('RG %s bounds game x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('RG %s check %s %s' % (name, ob.name, check(ob)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('RG export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('RG wrote', out)

PIECES = {'yukimiLantern': (build_yukimiLantern, 0.015), 'inn': (build_inn, 0.02), 'bathhouse': (build_bathhouse, 0.015),
          'signpost': (build_signpost, 0.01), 'bench': (build_bench, 0.01), 'oke': (build_oke, 0.006), 'campRest': (build_campRest, 0.01)}
for name in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    fn, warp = PIECES[name]
    asset, info = fn()
    finish(asset, seed=5, amt=warp)
    print('RG %s info %s' % (name, info))
    export_piece(asset, 'rg-onsen-' + name)
