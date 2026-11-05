# PAWHAVEN rg-maple: Momiji Hollow's landmark props in Blender, built by script.
#   blender --background --factory-startup --python build_rg-maple.py -- --piece lookout|jizo|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame (every piece): the kit piece's own local frame (src/regions/assets/mapleProps.js): 1 unit = 1 m, the same origin,
# the same ground (y = 0), the same facing. Blender Z up, the kit's +z (front) is Blender -Y (the glTF exporter turns
# it back). The layout below is written in the kit's frame through K(x, y, z) -> Blender (x, -z, y).
# Materials (the game sorts the meshes into its batches by these names): body (painted wood, cloth, fruit),
# stone (stone: the game's stone brush), glow (lantern paper, unlit + bloom; vertex colours carry its tint).
# Shared kit (rgkit.py): the village pieces' mesh accumulator, rounded boxes, lathes, tubes, sweeps, drapes.
import os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rgkit import *          # noqa: F401,F403  (bpy, Vector, Matrix, Tmp, Asset, rbox, lathe, tube, drape, paint, ...)
import rgkit

print('RG build pid', os.getpid())
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'

def K(x, y, z):
    """kit frame (x, y up, z front) -> Blender"""
    return Vector((x, -z, y))

def export_rg(asset, name, matdefs):
    rgkit.export(asset, 'rg-maple-' + name, matdefs)

# ================================================================== palette (Momiji Hollow: warm timber, cool stone)
DECK = ['#d6a068', '#cb935c', '#c08852', '#d2a470']
TIMBER = '#94603e'; TIMBER_HI = '#b67c50'; TIMBER_LO = '#64402c'
POST = '#7c4e34'; POST_HI = '#a06a44'
STONE_M = '#aaa2a8'; STONE_H = '#d0c8cc'; STONE_L = '#766e7c'
MOSS = '#78a046'; MOSS_HI = '#a2c062'; MOSS_LO = '#46682e'
BRONZE = '#c8963e'; BRONZE_HI = '#f2cc78'
ROPE = '#e2c486'; ROPE_DK = '#b08c52'
LEAVES = ['#dc4a2c', '#ea7a2e', '#f0a83a', '#c8342e', '#e45a30']
PAPER_GLOW = '#ffe6ae'
INK = '#4a3e48'

def stone_col(lo=STONE_L, mid=STONE_M, hi=STONE_H, z0=0.0, seed=0, ao=0.22, moss_low=0.0):
    """painted stone: light tops, darker undersides and contact, soft mottling, optional lichen near the foot"""
    def f(p, n):
        c = mix(mid, hi, clamp(n.z) * 0.55)
        if n.z < 0: c = mix(c, lo, -n.z * 0.7)
        c = mul(c, 0.93 + 0.13 * vnoise(p, 5.0, seed))
        c = mul(c, 1 - ao * (1 - smooth(0.0, 0.14, p.z - z0)))
        if moss_low:
            k = smooth(0.55, 0.75, vnoise(p, 9.0, seed + 3)) * (1 - smooth(0.0, 0.35, p.z - z0)) * moss_low * (1 - smooth(0.3, 0.7, n.z))
            c = mix(c, MOSS, k)
        return c
    return f

def moss_col(seed=0):
    """icing moss: light tops, darker drip edges and undersides"""
    def f(p, n):
        c = mix(MOSS_LO, MOSS, smooth(-0.15, 0.45, n.z))
        c = mix(c, MOSS_HI, smooth(0.55, 0.95, n.z) * 0.8)
        g = vnoise(p, 14.0, seed)
        c = mix(c, MOSS_HI, clamp((g - 0.6) * 2.2) * 0.35)
        c = mix(c, MOSS_LO, clamp((0.35 - g) * 2.2) * 0.3)
        return c
    return f

def wood_col(base, hi=None, seed=0, z0=None, ao=0.2, grain=0.06):
    hi = hi or mix(base, '#ffe2b8', 0.25)
    def f(p, n):
        c = mix(base, hi, clamp(n.z) * 0.6) if n.z >= 0 else mul(base, 1 + 0.28 * n.z)
        if grain: c = mul(c, 1 + grain * (vnoise(p, 7.0, seed) - 0.5) * 2)
        if z0 is not None: c = mul(c, 1 - ao * (1 - smooth(0.0, 0.18, p.z - z0)))
        return c
    return f

def maple_leaf(c, nrm, size, rot, color, curl=0.03):
    """a chunky fallen maple leaf: five pointed lobes (15-point star), tips curled up, two-sided"""
    t = Tmp(); z = Vector(nrm).normalized()
    xa = (X if abs(z.x) < 0.9 else Y).cross(z).normalized(); ya = z.cross(xa)
    top, bot = [], []
    for k in range(15):
        a = rot + TAU * k / 15; lobe = k % 3
        rr = size * (1.0 if lobe == 0 else (0.56 if lobe == 1 else 0.40)) / 2
        q = c + (xa * math.cos(a) + ya * math.sin(a)) * rr + z * (0.008 + curl * (rr / (size / 2)) ** 2)
        top.append(t.vert(q)); bot.append(t.vert(q - z * 0.007))
    tc = t.vert(c + z * 0.014); bc = t.vert(c + z * 0.006)
    for k in range(15):
        t.face([tc, top[k], top[(k + 1) % 15]], z); t.face([bc, bot[(k + 1) % 15], bot[k]], -z)
    base = srgb(color)
    def col(p, n):
        cc = mix(base, '#ffd890', clamp(n.dot(z)) * 0.18)
        return mul(cc, 0.78) if n.dot(z) < 0 else cc
    return t, col

def surf_walker(top_prof, cx, cy, sy=1.0, e=2.0, rfn=None, push=0.0):
    """F(th, h) for drape(): a lathe surface (profile (r, z) from its top pole downward, section superellipse e,
    y-scale sy, wobble rfn(r, z, th)) walked from the pole by profile arc length h"""
    segs = []; acc = 0.0
    for a, b in zip(top_prof, top_prof[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); segs.append((acc, L, a, b)); acc += L
    def F(th, h):
        for i, (s0, L, a, b) in enumerate(segs):
            if h <= s0 + L or i == len(segs) - 1:
                t = clamp((h - s0) / L, 0, 1.5); r = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t; break
        c, s = se_dir(th, e); rr = (rfn(r, z, th) if rfn else r) + push
        return Vector((cx + c * rr, cy + s * rr * sy, z))
    return F

def prism(x, y, z0, z1, hw, hd=None, K_=8, e=4.0, th0=None):
    """an upright squircle prism (open ends: buried / hidden), Blender coords"""
    hd = hw if hd is None else hd
    t = lathe([(hw, z0), (hw, z1)], K_, sy=hd / hw, e=e, th0=math.pi / K_ if th0 is None else th0)
    return t.xform(Matrix.Translation((x, y, 0)))

def rail_x(x0, x1, y, z, r, rz=None):
    """a rounded rail along Blender X (lathe on its side, rounded ends)"""
    rz = r * 0.85 if rz is None else rz
    L = x1 - x0
    t = lathe([(0.0, 0.0), (r * 0.7, 0.004), (r, 0.022), (r, L - 0.022), (r * 0.7, L - 0.004), (0.0, L)], 8, sx=1.0, sy=rz / r, e=3.0, th0=math.pi / 8)
    return t.xform(Matrix.Translation((x0, y, z)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(math.pi / 2, 4, 'Z'))

def rail_y(y0, y1, x, z, r, rz=None):
    rz = r * 0.85 if rz is None else rz
    L = y1 - y0
    t = lathe([(0.0, 0.0), (r * 0.7, 0.004), (r, 0.022), (r, L - 0.022), (r * 0.7, L - 0.004), (0.0, L)], 8, sx=rz / r, sy=1.0, e=3.0, th0=math.pi / 8)
    return t.xform(Matrix.Translation((x, y0, z)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))

# ================================================================== 1. the lookout
def build_lookout():
    """a timber viewing deck on a hill (kit lookout(0)): W 3.2 x D 2.2, the deck top at 0.485, railed on the front (+z,
    the view) and both sides, open at the back (the approach, -z) with a stone step; a bench and a coin telescope on the
    deck, a view signboard at the back left, a small stone lantern at the back right (the kit's light sits in its
    firebox), fallen maple leaves."""
    A = Asset(); rng = random.Random(311)
    OB = 'lookout'
    W, D, DT = 3.2, 2.2, 0.485                  # width, depth, deck top
    hx, hd = W / 2, D / 2
    PX, PZ = hx - 0.08, hd - 0.08               # post centres (kit frame)
    RT, RM = 1.40, 0.95                         # rail heights (kit: h + 0.95, h + 0.5)

    # ---- deck planks (along z, as the kit), a 2.5 cm gap between, tone and height jitter, the ends a touch darker
    n = round(W / 0.22); pw = W / n
    for i in range(n):
        x = -hx + (i + 0.5) * pw
        c = DECK[rng.randrange(len(DECK))]; dz = rng.uniform(-0.004, 0.004)
        L = D + rng.uniform(-0.02, 0.03)
        def pc(p, nn, c=c):
            cc = mix(c, '#f4cc90', clamp(nn.z) * 0.22) if nn.z > 0.5 else mul(c, 0.72 if nn.z < -0.5 else 0.82)
            end = smooth(L / 2 - 0.12, L / 2, abs(p.y))
            return mul(cc, 1 - 0.14 * end)
        A.add(OB, 'body', rbox((pw - 0.026, L, 0.07), r=0.02, M=M_at(K(x, DT - 0.035 + dz, rng.uniform(-0.01, 0.01)), rz=rng.uniform(-0.006, 0.006))), pc, 'planks')
    # ---- the fascia boards round the deck edge (front, sides, back), dark timber
    for (sx, sz, lx, lz) in ((0, 1, W + 0.08, 0.07), (0, -1, W + 0.08, 0.07), (-1, 0, 0.07, D - 0.06), (1, 0, 0.07, D - 0.06)):
        cx, cz = sx * (hx + 0.005), sz * (hd + 0.005)
        A.add(OB, 'body', rbox((lx, lz, 0.15), r=0.025, M=M_at(K(cx, DT - 0.07 - 0.075, cz))), wood_col(TIMBER, TIMBER_HI, seed=2), 'fascia')
    # under-deck joists (the shadow side reads as a structure, not a slab)

    # ---- posts: four corner posts up through the rail with bronze giboshi, two front posts, two back legs;
    # each stands on a rounded stone footing (the posts run on below the ground for hillside spots, as the kit's do)
    feet = {}
    def post(x, z, top, r=0.07, cap='round'):
        b = K(x, 0, z)
        prof = [(r, -0.8), (r, top - 0.03), (r * 0.82, top), (0.0, top + 0.01)] if cap == 'round' else [(r, -0.8), (r, top)]
        t = lathe(prof, 10, e=4.0, th0=math.pi / 10, rfn=lambda rr, zz, th: rr * (1 + 0.02 * math.sin(3 * th + x * 7)))
        t.xform(Matrix.Translation((b.x, b.y, 0)))
        A.add(OB, 'body', t, wood_col(POST, POST_HI, seed=int(x * 10 + z * 3) % 7, z0=0.0, ao=0.3), 'posts')
        # footing
        fr = 0.16 + rng.uniform(-0.01, 0.015)
        fw = lambda rr, zz, th, s=rng.uniform(0, 6): rr * (1 + 0.07 * math.sin(2 * th + s) + 0.04 * math.sin(5 * th + s))
        ft = lathe([(0.0, -0.06), (fr, -0.06), (fr * 1.04, 0.03), (fr * 0.92, 0.10), (fr * 0.6, 0.135), (0.0, 0.14)], 7, e=2.6,
                   th0=rng.uniform(0, 1), rfn=fw)
        ft.xform(Matrix.Translation((b.x, b.y, 0)))
        A.add(OB, 'stone', ft, stone_col(z0=0.0, seed=int(abs(x) * 9 + abs(z) * 5)), 'footings')
        feet[(round(x, 3), round(z, 3))] = (b, fr, fw)
        return b
    corners = [(sx * PX, sz * PZ) for sx in (-1, 1) for sz in (-1, 1)]
    for (x, z) in corners:
        b = post(x, z, RT + 0.04, r=0.075, cap='flat')
        # bronze giboshi finial
        g = lathe([(0.0, 0.0), (0.085, 0.0), (0.092, 0.035), (0.062, 0.075), (0.092, 0.125), (0.075, 0.18), (0.035, 0.235), (0.0, 0.27)], 8, th0=math.pi / 8)
        g.xform(Matrix.Translation((b.x, b.y, RT + 0.04)))
        A.add(OB, 'body', g, lambda p, nn: mix(mul(BRONZE, 0.8 + 0.25 * clamp(nn.z + 0.3)), BRONZE_HI, smooth(0.55, 0.95, nn.dot(LIGHT)) * 0.7), 'finials')
        A.add(OB, 'body', lathe([(0.088, -0.012), (0.092, 0.0), (0.092, 0.03), (0.088, 0.04)], 8, th0=math.pi / 8).xform(Matrix.Translation((b.x, b.y, RT + 0.02))),
              lambda p, nn: mul(BRONZE, 0.75 + 0.2 * clamp(nn.z)), 'finials')
    for x in (-0.52, 0.52):
        post(x, PZ, RT + 0.02, r=0.062)
    for x in (-0.55, 0.55):
        post(x, -PZ, DT - 0.07, r=0.06, cap='flat')

    # ---- rope wraps on the two front corner posts above the deck (two coils and a knot)
    def rope_col(p, nn):
        a = math.atan2(nn.z, math.hypot(nn.x, nn.y)) * 3 + (p.x + p.y) * 60
        return mix(ROPE, ROPE_DK, 0.5 + 0.5 * math.sin(a))
    for sx in (-1, 1):
        b = K(sx * PX, 0, PZ)
        for j, zz in enumerate((DT + 0.075, DT + 0.125)):
            pts = [Vector((b.x + math.cos(TAU * k / 10) * 0.094, b.y + math.sin(TAU * k / 10) * 0.094, zz + 0.006 * math.sin(TAU * k / 10 + j))) for k in range(10)]
            A.add(OB, 'body', tube_loop(pts, lambda s: 0.026, K=4), rope_col, 'rope')

    # ---- rails: a top rail and a mid rail on the front and both sides
    for z_, r_ in ((RT, 0.05), (RM, 0.038)):
        A.add(OB, 'body', rail_x(-PX, PX, -PZ, z_, r_), wood_col(TIMBER, TIMBER_HI, seed=4, grain=0.04), 'rails')
        for sx in (-1, 1):
            A.add(OB, 'body', rail_y(-PZ, PZ, sx * PX, z_, r_), wood_col(TIMBER, TIMBER_HI, seed=5, grain=0.04), 'rails')
    # balusters between the deck and the top rail
    bal = []
    for (x0, x1, cnt) in ((-PX, -0.52, 3), (-0.52, 0.52, 3), (0.52, PX, 3)):
        bal += [(x0 + (x1 - x0) * (k + 1) / (cnt + 1), PZ) for k in range(cnt)]
    for sx in (-1, 1):
        bal += [(sx * PX, -PZ + 2 * PZ * (k + 1) / 7) for k in range(6)]
    for (x, z) in bal:
        b = K(x, 0, z)
        A.add(OB, 'body', prism(b.x, b.y, DT - 0.01, RT - 0.03, 0.029, K_=6, e=3.0),
              wood_col(TIMBER, TIMBER_HI, seed=6, z0=DT, ao=0.25, grain=0.0), 'balusters')

    # ---- the back step (the approach): a chunky stone slab and a smaller flat stone
    for (z, top, hw, hdp, sd) in ((-hd - 0.2, 0.25, 0.46, 0.2, 1), (-hd - 0.5, 0.09, 0.32, 0.15, 2)):
        b = K(0.0, 0, z)
        st = lathe([(0.0, -0.05), (1.0, -0.05), (1.02, top * 0.55), (0.93, top - 0.012), (0.8, top), (0.0, top)], 10, sx=hw, sy=hdp, e=3.2,
                   th0=0.1, rfn=lambda rr, zz, th, s=sd: rr * (1 + 0.035 * math.sin(3 * th + s) + 0.02 * math.sin(7 * th)))
        st.xform(Matrix.Translation((b.x + 0.04 * sd - 0.06, b.y, 0)))
        A.add(OB, 'stone', st, stone_col(z0=0.0, seed=20 + sd, moss_low=0.6), 'step')
    # moss icing on three footings (40-55 % of each, rounded drips; the camera-side ones)
    for (x, z, sd) in ((PX, PZ, 2), (-0.52, PZ, 3)):
        b, fr, fw = feet[(round(x, 3), round(z, 3))]
        top = [(0.0, 0.14), (fr * 0.6, 0.135), (fr * 0.92, 0.10), (fr * 1.04, 0.03)]
        Fm = surf_walker(top, b.x, b.y, e=2.6, rfn=fw)
        md = [(1.0 + sd * 1.7, 0.035, 0.35), (3.6 + sd, 0.03, 0.3), (5.2 + sd * 0.5, 0.025, 0.28)]
        A.add(OB, 'body', drape(Fm, drip_he(lambda th, sd=sd: fr * 0.62 + 0.035 * math.sin(2 * th + sd) + 0.02 * math.sin(5 * th + sd * 2), md),
                                lambda th, s: 0.022 + 0.01 * smooth(0.5, 1.0, s), drip_angles(8, md), J=2,
                                inner=Vector((b.x, b.y, 0.08))), moss_col(sd), 'moss')

    # ---- the bench on the deck (kit B.at([-0.55, h, -0.2]), facing the view +z): chunky slats, a raked back, arms,
    # a red zabuton cushion
    BX, BZ, BW = -0.55, -0.2, 1.2
    bw = wood_col('#b8845a', '#dcae7c', seed=8)
    for i in range(3):
        A.add(OB, 'body', rbox((BW, 0.115, 0.05), r=0.02, M=M_at(K(BX, DT + 0.42, BZ - 0.13 + i * 0.125))), bw, 'bench')
    for i in range(2):
        yb = DT + 0.6 + i * 0.15
        zb = BZ - 0.2 - (yb - DT - 0.42) * 0.25
        A.add(OB, 'body', rbox((BW - 0.04, 0.05, 0.11), r=0.02, M=M_at(K(BX, yb, zb), rx=-0.24)), bw, 'bench')
    for sx in (-1, 1):
        x = BX + sx * (BW / 2 - 0.1)
        A.add(OB, 'body', rbox((0.07, 0.07, 0.42), r=0.02, M=M_at(K(x, DT + 0.2, BZ + 0.15))), wood_col(POST, POST_HI, z0=DT, ao=0.3, seed=3), 'bench')
        A.add(OB, 'body', rbox((0.07, 0.07, 0.86), r=0.02, M=M_at(K(x, DT + 0.42, BZ - 0.25), rx=-0.24)), wood_col(POST, POST_HI, z0=DT, ao=0.3, seed=3), 'bench')
        A.add(OB, 'body', rbox((0.085, 0.42, 0.045), r=0.02, M=M_at(K(x + sx * 0.005, DT + 0.64, BZ - 0.02))), bw, 'bench')
    cush = lathe([(0.0, 0.0), (1.0, 0.0), (1.05, 0.03), (0.92, 0.06), (0.0, 0.07)], 10, sx=0.24, sy=0.17, e=3.4, th0=math.pi / 10)
    cb = K(BX - 0.25, DT + 0.445, BZ + 0.0)
    A.add(OB, 'body', cush.xform(M_at(cb, rz=0.12)), lambda p, nn: mix('#c83a34', '#ee6a52', clamp(nn.z) * 0.5) if nn.z > -0.2 else srgb('#9a2a2a'), 'bench')
    # a maple leaf on the bench and one on the cushion
    for (x, z, s, rot, ci) in ((BX - 0.2, BZ - 0.03, 0.13, 2.2, 2),):
        yy = DT + 0.445 + (0.072 if ci == 2 else 0.0)
        t, cf = maple_leaf(K(x, yy, z), Z, s, rot, LEAVES[ci], curl=0.02)
        A.add(OB, 'body', t, cf, 'leaves')

    # ---- the coin telescope (kit B.at([0.7, h, D/2 - 0.45]), looking out at +z and a touch up)
    TX, TZ = 0.7, hd - 0.45
    b = K(TX, DT, TZ)
    A.add(OB, 'body', lathe([(0.0, 0.0), (0.13, 0.0), (0.13, 0.03), (0.08, 0.07), (0.05, 0.14), (0.046, 0.82), (0.07, 0.86), (0.0, 0.88)], 10, th0=math.pi / 10).xform(Matrix.Translation(b)),
          lambda p, nn: mix('#4c5a70', '#7a8aa4', clamp(nn.z) * 0.6) if nn.z > -0.3 else srgb('#36404e'), 'scope')
    A.add(OB, 'body', rbox((0.2, 0.17, 0.17), r=0.045, M=M_at(b + Vector((0, 0, 0.95)))), lambda p, nn: mix('#4a86c0', '#7ab0e0', clamp(nn.z) * 0.6) if nn.z > -0.3 else srgb('#34608e'), 'scope')
    A.add(OB, 'body', rbox((0.05, 0.03, 0.012), r=0.0, M=M_at(b + Vector((0, -0.088, 0.98)))), lambda p, nn: srgb('#2e3440'), 'scope')   # the coin slot
    # the scope tube along +z (Blender -Y), tilted up 0.2 rad, pivoting over the box
    MT = Matrix.Translation(b + Vector((0, 0, 1.06))) @ Matrix.Rotation(0.2 + math.pi / 2, 4, 'X')
    tub = lathe([(0.0, -0.2), (0.05, -0.2), (0.055, -0.17), (0.062, -0.16), (0.07, 0.15), (0.088, 0.17), (0.092, 0.25), (0.07, 0.262), (0.0, 0.262)], 9, th0=math.pi / 9)
    A.add(OB, 'body', tub.xform(MT), lambda p, nn: mix('#3e76b0', '#78b0e4', clamp(nn.z) * 0.7) if nn.z > -0.4 else srgb('#2c5482'), 'scope')
    for zz, rr in ((-0.05, 0.073), (0.168, 0.094)):
        A.add(OB, 'body', lathe([(rr, zz - 0.02), (rr + 0.006, zz - 0.012), (rr + 0.006, zz + 0.012), (rr, zz + 0.02)], 9, th0=math.pi / 9).xform(MT),
              lambda p, nn: mix(mul(BRONZE, 0.85), BRONZE_HI, clamp(nn.z) * 0.6), 'scope')
    A.add(OB, 'body', lathe([(0.0, 0.255), (0.066, 0.255), (0.06, 0.268), (0.0, 0.272)], 9, th0=math.pi / 9).xform(MT), lambda p, nn: mix('#2e4a78', '#a8d4ff', clamp(nn.z) * 0.6), 'scope')

    # ---- the view signboard (kit B.at([-W/2 - 0.35, 0, -D/2 - 0.2], 0.3)): a chunky post, a framed board under a
    # little gable roof, a raised emblem (two hills, a sun, a maple leaf), no text
    MS = M_at(K(-hx - 0.35, 0, -hd - 0.2), rz=0.3)
    def SP(x, y, z): return MS @ K(x, y, z)
    A.add(OB, 'body', lathe([(0.055, -0.3), (0.055, 1.38), (0.0, 1.4)], 8, e=4.0, th0=math.pi / 8).xform(MS), wood_col(POST, POST_HI, z0=0.0, ao=0.3, seed=11), 'sign')
    A.add(OB, 'stone', lathe([(0.0, -0.04), (0.15, -0.04), (0.155, 0.04), (0.11, 0.1), (0.0, 0.11)], 8, e=2.6, th0=0.3,
                             rfn=lambda rr, zz, th: rr * (1 + 0.08 * math.sin(2 * th + 1))).xform(MS), stone_col(z0=0.0, seed=33), 'sign')
    A.add(OB, 'body', rbox((0.70, 0.07, 0.44), r=0.03, M=MS @ M_at(K(0, 1.13, 0.065))), wood_col(TIMBER, TIMBER_HI, seed=12), 'sign')
    A.add(OB, 'body', rbox((0.60, 0.03, 0.34), r=0.012, M=MS @ M_at(K(0, 1.13, 0.105))), lambda p, nn: mix('#f2dcb0', '#fff0d4', clamp(nn.z + 0.3) * 0.4), 'sign')
    for sx in (-1, 1):     # the little gable roof over the board
        A.add(OB, 'body', rbox((0.43, 0.2, 0.04), r=0.015, M=MS @ M_at(K(sx * 0.19, 1.43, 0.06)) @ Matrix.Rotation(sx * -0.42, 4, 'Y')),
              lambda p, nn: mix('#8a3a2e', '#c4583e', clamp(nn.z) * 0.8) if nn.z > -0.2 else srgb('#5e2a22'), 'sign')
    A.add(OB, 'body', rail_x(-0.04, 0.04, 0, 0, 0.03).xform(MS @ M_at(K(0, 1.515, 0.06))), lambda p, nn: mul(TIMBER_LO, 1.1), 'sign')
    # emblem on the panel (front face at kit z 0.12): two hills, a sun, a little maple leaf
    def tri_prism(cx, cy, w, h, dz, color, zf=0.121):
        t = Tmp(); pts = [(-w / 2, 0.0), (w / 2, 0.0), (w * 0.08, h), (-w * 0.08, h)]
        f = [t.vert(SP(cx + a, cy + b, zf + dz)) for a, b in pts]
        bk = [t.vert(SP(cx + a, cy + b, zf - 0.004)) for a, b in pts]
        nf = (MS.to_3x3() @ (-Y)).normalized()
        t.face(f, nf)
        for k in range(4):
            t.face([f[k], bk[k], bk[(k + 1) % 4], f[(k + 1) % 4]], (t.v[f[k]] + t.v[f[(k + 1) % 4]]) / 2 - SP(cx, cy + h / 3, zf))
        A.add(OB, 'body', t, lambda p, nn, c=color: mix(c, '#ffffff', 0.12) if nn.dot(nf) > 0.7 else mul(c, 0.8), 'sign')
    tri_prism(-0.1, 1.0, 0.34, 0.2, 0.012, '#6a9a52')
    tri_prism(0.09, 1.0, 0.36, 0.25, 0.018, '#e2703a')
    sun = ellipsoid(Vector((0, 0, 0)), (0.045, 0.012, 0.045), K=10, J=3)
    A.add(OB, 'body', sun.xform(Matrix.Translation(SP(0.2, 1.22, 0.13)) @ MS.to_3x3().to_4x4()), lambda p, nn: mix(BRONZE_HI, '#ffe8a0', clamp(nn.z) * 0.5), 'sign')
    t, cf = maple_leaf(SP(-0.2, 1.22, 0.128), MS.to_3x3() @ (-Y), 0.1, 0.3, '#d8402a', curl=0.0)
    A.add(OB, 'body', t, cf, 'sign')

    # ---- the stone lantern (kit toro s 0.7 at [W/2 + 0.3, 0, -D/2 + 0.1]; the kit's light at y 0.62 sits in its
    # firebox, which is the glow): a hex base, a ringed post, a lotus platform, the firebox with four paper windows,
    # a hex kasa with upturned corners and moss icing, a hoju jewel
    L0 = K(hx + 0.3, 0, -hd + 0.1)
    ML = M_at(L0, rz=0.35)
    LS = stone_col(z0=0.0, seed=40)
    A.add(OB, 'stone', lathe([(0.0, 0.0), (0.2, 0.0), (0.21, 0.05), (0.17, 0.085), (0.11, 0.1), (0.0, 0.1)], 6, th0=0.0).xform(ML), LS, 'toro')
    A.add(OB, 'stone', lathe([(0.075, 0.09), (0.068, 0.2), (0.08, 0.215), (0.08, 0.24), (0.066, 0.255), (0.062, 0.42), (0.0, 0.43)], 8, th0=math.pi / 8).xform(ML), LS, 'toro')
    A.add(OB, 'stone', lathe([(0.0, 0.40), (0.09, 0.40), (0.165, 0.45), (0.17, 0.49), (0.0, 0.495)], 6, th0=0.0).xform(ML), LS, 'toro')
    FB0, FB1 = 0.49, 0.71                         # the firebox (the kit's light at 0.62)
    for k in range(4):                            # corner pillars
        a = math.pi / 4 + k * math.pi / 2
        A.add(OB, 'stone', rbox((0.045, 0.045, FB1 - FB0), r=0.012, M=ML @ M_at(Vector((math.cos(a) * 0.115, math.sin(a) * 0.115, (FB0 + FB1) / 2)))), LS, 'toro')
    A.add(OB, 'glow', rbox((0.15, 0.15, FB1 - FB0 - 0.02), r=0.02, M=ML @ M_at(Vector((0, 0, (FB0 + FB1) / 2)))), lambda p, nn: srgb(PAPER_GLOW), 'toro_glow')
    for k in range(4):                            # the window lattice bars (dark) over the glow
        R = Matrix.Rotation(k * math.pi / 2, 4, 'Z')
        A.add(OB, 'body', rbox((0.018, 0.012, FB1 - FB0 - 0.02), r=0.0, M=ML @ R @ M_at(Vector((0, -0.08, (FB0 + FB1) / 2)))), lambda p, nn: srgb('#4a3a34'), 'toro')
    kz = FB1
    kasa = [(0.0, kz - 0.005), (0.22, kz - 0.005), (0.26, kz + 0.035), (0.24, kz + 0.055), (0.15, kz + 0.1), (0.07, kz + 0.15), (0.0, kz + 0.17)]
    A.add(OB, 'stone', lathe(kasa, 6, th0=0.0, rfn=lambda rr, zz, th: rr * (1 + 0.1 * smooth(0.18, 0.25, rr) * (0.5 + 0.5 * math.cos(6 * th)))).xform(ML),
          lambda p, nn: mul(mix(STONE_M, STONE_H, clamp(nn.z) * 0.6), 1 - 0.32 * clamp(-nn.z)), 'toro')
    A.add(OB, 'stone', lathe([(0.0, kz + 0.15), (0.04, kz + 0.16), (0.05, kz + 0.2), (0.03, kz + 0.25), (0.0, kz + 0.28)], 6, th0=math.pi / 6).xform(ML),
          stone_col(z0=0.0, seed=41), 'toro')
    KT = [(0.0, kz + 0.17), (0.07, kz + 0.15), (0.15, kz + 0.1), (0.24, kz + 0.055), (0.30, kz + 0.02)]
    def kF(th, h):
        for (r0, z0), (r1, z1) in zip(KT, KT[1:]):
            if h <= r1: zz = z0 + (z1 - z0) * (h - r0) / (r1 - r0); break
        return ML @ Vector((math.cos(th) * h, math.sin(th) * h, zz))
    ldrips = [(0.6 + k * TAU / 5, 0.03 + 0.015 * ((k * 3) % 4), 0.4) for k in range(5)]
    A.add(OB, 'body', drape(kF, drip_he(lambda th: 0.13 + 0.03 * math.sin(2 * th + 1), ldrips), lambda th, s: 0.022 + 0.01 * s, drip_angles(9, ldrips), J=2,
                            inner=ML @ Vector((0, 0, kz + 0.08)), bead=False), moss_col(7), 'moss')

    # ---- fallen maple leaves on the deck (body: they lie still)
    spots = [(-1.2, 0.75), (-0.9, 0.2), (0.1, 0.55), (0.35, -0.6), (1.1, 0.3), (0.95, 0.85)]
    for i, (x, z) in enumerate(spots):
        t, cf = maple_leaf(K(x, DT, z), Z, rng.uniform(0.13, 0.17), rng.uniform(0, TAU), LEAVES[i % len(LEAVES)], curl=0.025)
        A.add(OB, 'body', t, cf, 'leaves')

    export_rg(A, 'lookout', {'body': {}, 'stone': {}, 'glow': dict(emission=PAPER_GLOW)})

# ================================================================== 2. the jizo
def jizo_figure(A, OB, PT, lod=0):
    """the jizo figure standing on a plinth top at height PT (canonical size: 1.1 m above PT); lod 1 = lighter
    meshes for the small trio statues"""
    lo = lod > 0
    # ---- the body: a robed bell (front-back a touch flat), soft vertical folds low down
    BSY = 0.88
    bprof = [(0.0, PT - 0.01), (0.205, PT - 0.01), (0.214, PT + 0.03), (0.21, 0.33), (0.196, 0.45), (0.172, 0.57), (0.142, 0.65), (0.095, 0.72), (0.0, 0.76)]
    bwob = lambda rr, z, th: rr * (1 + 0.03 * math.cos(7 * th + 0.4) * (1 - smooth(0.3, 0.55, z)))
    def body_col(p, n):
        c = mix(STONE_M, STONE_H, clamp(n.z) * 0.5 + smooth(0.3, 0.8, p.z) * 0.12)
        if n.z < 0: c = mix(c, STONE_L, -n.z * 0.6)
        c = mul(c, 0.94 + 0.12 * vnoise(p, 6.0, 9))
        c = mul(c, 1 - 0.2 * (1 - smooth(0.0, 0.1, p.z - PT)))
        k = smooth(0.58, 0.72, vnoise(p, 11.0, 4)) * (1 - smooth(0.0, 0.22, p.z - PT))
        return mix(c, MOSS, k * 0.6)
    A.add(OB, 'stone', lathe(bprof, 11 if lo else 14, sy=BSY, th0=math.pi / 14, rfn=bwob), body_col, 'body')
    # sleeves (arms folded in front) and the hands holding the jewel
    for sx in (-1, 1):
        a, b = Vector((sx * 0.16, -0.02, 0.6)), Vector((sx * 0.07, -0.17, 0.43))
        d = b - a; L = d.length
        arm = ellipsoid(Vector((0, 0, 0)), (0.06, 0.055, L / 2 + 0.04), K=7 if lo else 9, J=4 if lo else 5)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        arm.xform(Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4())
        A.add(OB, 'stone', arm, body_col, 'arms')
        hand = ellipsoid(Vector((0, 0, 0)), (0.055, 0.045, 0.042), K=6 if lo else 8, J=3 if lo else 4)
        hand.xform(M_at(Vector((sx * 0.04, -0.19, 0.415)), rz=sx * 0.3))
        A.add(OB, 'stone', hand, stone_col(seed=12), 'hands')
    jw = lathe([(0.0, 0.0), (0.03, 0.012), (0.042, 0.04), (0.036, 0.065), (0.016, 0.09), (0.0, 0.11)], 6 if lo else 8, th0=math.pi / 8)
    A.add(OB, 'stone', jw.xform(Matrix.Translation((0, -0.215, 0.425))), lambda p, n: mix('#c8c0c8', '#ece4ea', clamp(n.z + 0.2) * 0.7), 'jewel')

    # ---- the head: a big round head, a carved serene face (closed eyes, a small smile, a nose, the urna), long
    # earlobes, rosy cheeks
    HC = Vector((0, 0.0, 0.925)); RX, RY, RZ = 0.205, 0.195, 0.192
    A.add(OB, 'stone', ellipsoid(HC, (RX, RY, RZ), K=11 if lo else 14, J=8 if lo else 10), lambda p, n: mul(mix(STONE_M, STONE_H, clamp(n.z + 0.1) * 0.5 + clamp(-n.y) * 0.15), 0.95 + 0.08 * vnoise(p, 6, 2)), 'head')
    def hp(u, v, out=0.0):
        """the head surface at azimuth u (0 = the front, + toward +X) and elevation v, pushed `out` along the normal"""
        p = Vector((RX * math.sin(u) * math.cos(v), -RY * math.cos(u) * math.cos(v), RZ * math.sin(v)))
        nn = Vector((p.x / RX ** 2, p.y / RY ** 2, p.z / RZ ** 2)).normalized()
        return HC + p + nn * out
    carve = lambda p, n: srgb('#4e4250')
    for sx in (-1, 1):                              # closed eyes: gentle downward arcs
        pts = [hp(sx * (0.40 + 0.15 * t), -0.04 - 0.055 * (1 - t * t), -0.002) for t in [-1 + 2 * k / 4 for k in range(5)]]
        A.add(OB, 'body', tube(pts, lambda s: 0.013 if lo else 0.011, K=4 if lo else 5), carve, 'face')
        ck = ellipsoid(Vector((0, 0, 0)), (0.034, 0.008, 0.024), K=7 if lo else 10, J=2 if lo else 3)
        cp = hp(sx * 0.62, -0.23, 0.0); nrm = (cp - HC).normalized()
        ck.xform(Matrix.Translation(cp) @ Vector((0, -1, 0)).rotation_difference(nrm).to_matrix().to_4x4())
        A.add(OB, 'body', ck, lambda p, n: srgb('#f0a4a4'), 'face')
        ear = ellipsoid(Vector((0, 0, 0)), (0.03, 0.042, 0.078), K=6 if lo else 7, J=3 if lo else 4)
        ear.xform(M_at(hp(sx * 1.42, -0.12, -0.012), rz=sx * 0.15))
        A.add(OB, 'stone', ear, stone_col(seed=14), 'head')
    mpts = [hp(0.15 * t, -0.33 - 0.04 * (1 - t * t), -0.002) for t in [-1 + 2 * k / 4 for k in range(5)]]
    A.add(OB, 'body', tube(mpts, lambda s: 0.013 if lo else 0.0105, K=4 if lo else 5), carve, 'face')
    if not lo: A.add(OB, 'stone', ellipsoid(hp(0.0, -0.17, -0.006), (0.024, 0.02, 0.02), K=7, J=3), lambda p, n: mix(STONE_M, STONE_H, clamp(n.z + 0.3) * 0.6), 'face')
    if not lo: A.add(OB, 'stone', ellipsoid(hp(0.0, 0.15, -0.004), (0.014, 0.012, 0.014), K=6, J=3), lambda p, n: mix(STONE_M, STONE_H, clamp(n.z + 0.3) * 0.6), 'face')

    # ---- the red bib (yodarekake): a drape over the shoulders from the neck, long in front, a narrow collar at the
    # back, a cream hem bead round its edge, a little cream flower emblem
    bsegs = []; acc = 0.0
    btop = list(reversed(bprof[1:]))               # from the top pole down
    for a, b in zip(btop, btop[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); bsegs.append((acc, L, a, b)); acc += L
    def BF(th, h):
        for s0, L, a, b in bsegs:
            if h <= s0 + L or (s0, L, a, b) == bsegs[-1]:
                t = clamp((h - s0) / L, 0, 1.5); r = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t; break
        c, s = se_dir(th, 2.0); rr = bwob(r, z, th) + 0.004
        return Vector((c * rr, s * rr * BSY, z))
    FRONT = -math.pi / 2
    def bhe(th):
        f = 0.5 - 0.5 * math.sin(th)                 # 1 at the front
        return 0.15 + 0.19 * f ** 1.6
    bth = drip_angles(14 if lo else 22, [(FRONT, 0.03, 0.6)])
    bib = drape(BF, drip_he(bhe, [(FRONT, 0.03, 0.6)]), lambda th, s: 0.018 + 0.022 * smooth(0.6, 1.0, s), bth, J=3,
                inner=Vector((0, 0, 0.6)), bead=True)
    KB = len(bth); R = 3 + 3
    hem = {tuple(round(c, 6) for c in bib.v[i]) for i in range((R - 3) * KB, R * KB)}
    def bib_col(p, n):
        if tuple(round(c, 6) for c in p) in hem:
            return mix('#f4e6cc', '#fff6e6', clamp(n.z + 0.3) * 0.6)
        c = mix('#d0402e', '#ee6448', clamp(n.z) * 0.6 + clamp(-n.y) * 0.15)
        return mul(c, 1 - 0.25 * clamp(-n.z))
    A.add(OB, 'body', bib, bib_col, 'bib')

    # ---- the red knitted cap: a beanie over the crown that slumps a touch back, knitted ribs, a thick folded brim,
    # a lumpy pom-pom
    def cap_prof():
        out = []
        for ph_deg, off in ((0, 0.045), (15, 0.042), (30, 0.034), (44, 0.027), (55, 0.022), (60, 0.03), (64, 0.038), (71, 0.04), (77, 0.032), (80, 0.01), (82, -0.01)):
            ph = math.radians(ph_deg)
            lift = 0.06 * math.cos(ph) ** 2 if ph_deg < 58 else 0.0
            out.append(((RX + off) * math.sin(ph), HC.z + (RZ + off) * math.cos(ph) + lift))
        out[0] = (0.0, out[0][1] + 0.02)
        return out
    cpro = cap_prof()
    tilt = Matrix.Translation(HC) @ Matrix.Rotation(-0.12, 4, 'X') @ Matrix.Rotation(0.05, 4, 'Y') @ Matrix.Translation(-HC)
    NR = 7 if lo else 10
    def cwob(rr, z, th):
        brim = smooth(HC.z + 0.105, HC.z + 0.085, z)
        return rr * (1 + (0.04 if brim > 0.5 else 0.022) * (0.5 + 0.5 * math.cos(NR * th)))
    def cap_col(p, n):
        th = math.atan2((p.y - 0.02) / (RY / RX), p.x) - math.pi / 20
        rib = 0.5 + 0.5 * math.cos(NR * th)
        c = mix('#c63c30', '#ec6a50', clamp(n.z) * 0.55 + clamp(-n.y) * 0.1)
        brim = p.z < HC.z + 0.1
        c = mul(c, (0.8 if brim else 0.84) + (0.2 if brim else 0.16) * rib)
        return mul(c, 1 - 0.3 * clamp(-n.z))
    cap = lathe(cpro, 14 if lo else 20, sy=RY / RX, th0=math.pi / 20, rfn=cwob,
                off=lambda z: (0.0, 0.05 * smooth(HC.z + 0.05, HC.z + 0.25, z) ** 2))
    A.add(OB, 'body', cap.xform(tilt), cap_col, 'cap')
    pom_c = tilt @ Vector((0.0, 0.05, HC.z + RZ + 0.045 + 0.06 + 0.035))
    pom = lathe([(math.sin(math.pi * j / 6) * 0.058, -math.cos(math.pi * j / 6) * 0.055) for j in range(7)], 7 if lo else 9, th0=0.2,
                rfn=lambda rr, z, th: rr * (1 + 0.12 * math.sin(4 * th + z * 60) * math.sin(math.pi * (z + 0.055) / 0.11)))
    A.add(OB, 'body', pom.xform(Matrix.Translation(pom_c)), lambda p, n: mul(mix('#f2e4d0', '#fff6ea', clamp(n.z + 0.2) * 0.7), 0.9 + 0.1 * vnoise(p, 40, 1)), 'cap')


def build_jizo():
    """a stone jizo (kit jizo(seed)): a squircle plinth with moss icing, a robed body with sleeves and hands holding a
    hoju jewel, a big round head with a carved serene face and long earlobes, a red bib with a cream hem, a red knitted
    cap with a folded brim and a pom-pom, offerings (tea cups, persimmons, an onigiri) and a pinwheel."""
    A = Asset(); rng = random.Random(55)
    OB = 'jizo'
    PT = 0.205                                    # the plinth's top
    PY = -0.035                                   # the plinth sits a touch forward (room for the offerings)
    # ---- the plinth (kit base 0.62 x 0.52 x 0.22)
    pprof = [(0.0, 0.0), (0.30, 0.0), (0.312, 0.025), (0.312, 0.15), (0.298, 0.19), (0.265, PT), (0.0, PT)]
    PSY = 0.88
    pwob = lambda rr, z, th: rr * (1 + 0.018 * math.sin(3 * th + 0.7) + 0.012 * math.sin(5 * th + z * 20))
    pl = lathe(pprof, 16, sy=PSY, e=4.0, th0=math.pi / 16, rfn=pwob).xform(Matrix.Translation((0, PY, 0)))
    A.add(OB, 'stone', pl, stone_col(z0=0.0, seed=5, moss_low=0.5), 'plinth')
    # moss icing over the plinth's back and left (the front stays clear for the offerings): F walks the plinth surface
    # from its top centre, across the top and over the rounded edge
    top_r = [(0.0, PT), (0.265, PT), (0.298, 0.19), (0.312, 0.15), (0.312, 0.03)]
    segs = []; acc = 0.0
    for a, b in zip(top_r, top_r[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); segs.append((acc, L, a, b)); acc += L
    def F(th, h):
        for s0, L, a, b in segs:
            if h <= s0 + L or (s0, L, a, b) == segs[-1]:
                t = clamp((h - s0) / L, 0, 1.5); r = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t; break
        c, s = se_dir(th, 4.0); rr = pwob(r, z, th)
        return Vector((c * rr, PY + s * rr * PSY, z))
    BACK = math.pi / 2                             # Blender +Y = the kit's back
    pdrips = [(BACK - 0.3, 0.06, 0.26), (BACK + 0.5, 0.045, 0.22), (BACK + 1.15, 0.07, 0.26), (math.pi + 0.12, 0.04, 0.2), (BACK - 0.95, 0.04, 0.2)]
    def phe(th):
        back = max(0.0, math.sin(th)) ** 0.7       # 1 at the back, 0 from the sides forward
        left = 0.5 - 0.5 * math.cos(th)            # 1 at -X (the kit's left)
        k = max(back, left * 0.62 * smooth(-0.2, 0.5, math.sin(th)))
        return 0.12 + 0.22 * smooth(0.3, 0.85, k) + 0.012 * math.sin(4 * th + 1)
    A.add(OB, 'body', drape(F, drip_he(phe, pdrips), lambda th, s: 0.026 + 0.016 * smooth(0.5, 1.0, s), drip_angles(12, pdrips), J=3,
                            inner=Vector((0, PY, PT - 0.05))), moss_col(3), 'moss')

    jizo_figure(A, OB, PT)

    # ---- offerings on the plinth's front: two tea cups, two persimmons, an onigiri; a pinwheel in the ground
    for sx in (-1, 1):
        cup = lathe([(0.0, 0.0), (0.03, 0.0), (0.036, 0.01), (0.044, 0.06), (0.036, 0.062), (0.0, 0.05)], 9, th0=0.1)
        A.add(OB, 'body', cup.xform(Matrix.Translation((sx * 0.225, PY - 0.17, PT))),
              lambda p, n: srgb('#8a7a3e') if p.z - PT < 0.055 and n.z > 0.6 and p.z - PT > 0.03 else (srgb('#6a9ac8') if 0.022 < p.z - PT < 0.036 and n.z < 0.5 else mix('#eee4d8', '#fff6ea', clamp(n.z) * 0.5)), 'offerings')
    for i, (x, y) in enumerate(((-0.09, PY - 0.215), (0.0, PY - 0.24))):
        r_ = 0.046 - 0.004 * i
        t, cf, h = persimmon(Vector((x, y, PT + r_ * 0.86)), r_, FRESH[i], rng)
        A.add(OB, 'body', t, cf, 'offerings')
        A.add(OB, 'body', calyx(Vector((x, y, PT + r_ * 0.86 + h * 0.84)), r_ * 0.6, rng), calyx_col, 'offerings')
    oni = lathe([(0.0, 0.0), (0.055, 0.0), (0.06, 0.02), (0.05, 0.05), (0.025, 0.075), (0.0, 0.08)], 12, sy=0.6, th0=0.0,
                rfn=lambda rr, z, th: rr * (1 + 0.16 * math.cos(3 * (th - math.pi / 2))))
    oni.xform(M_at(Vector((0.11, PY - 0.225, PT)), rx=-0.15))
    A.add(OB, 'body', oni, lambda p, n: mix('#ece6dc', '#fffaf0', clamp(n.z + 0.3) * 0.6), 'offerings')
    A.add(OB, 'body', rbox((0.05, 0.05, 0.04), r=0.01, M=M_at(Vector((0.11, PY - 0.235, PT + 0.022)), rx=-0.15)), lambda p, n: srgb('#3c4a3a'), 'offerings')
    # the pinwheel (kit at [0.42, 0, 0.3], h 0.75): a stick, four chunky blades facing the front, a gold pin
    pw = K(0.42, 0, 0.3); PH_ = 0.75
    A.add(OB, 'body', lathe([(0.016, -0.1), (0.014, PH_), (0.0, PH_ + 0.01)], 5, th0=0.3).xform(Matrix.Translation(pw)), lambda p, n: mix('#c89a68', '#e8c090', clamp(n.z) * 0.5), 'pinwheel')
    hub = pw + Vector((0, -0.03, PH_))
    for k, colr in enumerate(['#ff6f7f', '#ffd24a', '#6ab0ff', '#8fe0c0']):
        a0 = k * math.pi / 2 + 0.3
        t = Tmp()
        outline = [(0.0, 0.0), (0.12, 0.016), (0.128, 0.072), (0.088, 0.112), (0.016, 0.112)]
        def P2(u, v, d):
            ca, sa = math.cos(a0), math.sin(a0)
            return hub + Vector((u * ca - v * sa, d, u * sa + v * ca))
        tw = [0.0, 0.006, 0.018, 0.028, 0.018]     # the blade twists back toward its tip (a curled vane)
        fi = [t.vert(P2(u, v, -tw[j])) for j, (u, v) in enumerate(outline)]
        bi = [t.vert(P2(u, v, -tw[j] + 0.012)) for j, (u, v) in enumerate(outline)]
        t.face(fi, -Y); t.face(bi[::-1], Y)
        for j in range(5): t.face([fi[j], bi[j], bi[(j + 1) % 5], fi[(j + 1) % 5]], (t.v[fi[j]] + t.v[fi[(j + 1) % 5]]) / 2 - hub)
        A.add(OB, 'body', t, lambda p, n, c=colr: srgb(c) if n.y < 0.3 else mul(c, 0.78), 'pinwheel')
    A.add(OB, 'body', ellipsoid(hub + Vector((0, -0.012, 0)), (0.024, 0.02, 0.024), K=7, J=3), lambda p, n: mix(BRONZE, BRONZE_HI, clamp(n.z + 0.2) * 0.6), 'pinwheel')
    # two fallen maple leaves on the plinth's back corner, over the moss
    for (x, y, rot, ci) in ((-0.24, PY + 0.16, 0.7, 0), (0.23, PY + 0.17, 2.4, 2)):
        t, cf = maple_leaf(Vector((x, y, PT + 0.02)), Vector((0.08 * math.copysign(1, x), 0.0, 1.0)), 0.12, rot, LEAVES[ci], curl=0.02)
        A.add(OB, 'body', t, cf, 'leaves')

    export_rg(A, 'jizo', {'body': {}, 'stone': {}})

# round 2 (jizoTrio, kakashi, tanuki, warabocchi, hasa, komodaru) runs in this namespace: it shares the kit and helpers
_r2 = os.path.join(HERE, 'rg_round2.py')
exec(compile(open(_r2, encoding='utf-8').read().split('# ---8<--- body' + chr(10), 1)[1], _r2, 'exec'), globals())
BUILDERS = {'lookout': build_lookout, 'jizo': build_jizo, **BUILDERS_R2}
for name in (BUILDERS if PIECE == 'all' else PIECE.split(',')):
    BUILDERS[name]()
print('RG done')
