# PAWHAVEN hollow-decor: Blossom Hollow's placeable decor pieces, built in Blender by script.
#   blender --background --factory-startup --python build_hollow-decor.py -- --piece <name>|all
#   (stoneLantern bench sakuraPlanter streetLamp miniTorii koiStatue lanternString sprinkler park)
# Deterministic (seeded PRNGs only). Frame: 1 unit = 1 m, Blender Z up, front = -Y (the game's +z, the door side).
# A kit function's local (x, y, z) maps to Blender (x, -z, y). Each piece keeps the kit design's footprint, door and
# light positions (src/world/buildings/services.js stoneLantern, decor.js bench / sakuraPlanter, props.js toro/bench/tree).
# The shared mesh/paint kit (hd_kit.py) is the village-pieces kit.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hd_kit import *   # noqa: F401,F403  (bpy, math, random, Vector, Matrix, Asset, Tmp, rbox, lathe, tube, drape, ...)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('HD build pid', os.getpid())
D2R = math.pi / 180

# ================================================================== extra generators
def lathe_a(prof, angs, rfn=None, sx=1.0, sy=1.0):
    """surface of revolution about Z with an explicit angle list; prof [(r, z)] bottom -> top, r = 0 ends = poles;
    rfn(r, z, th) -> radius"""
    t = Tmp(); rings, cs = [], []
    body = list(prof); p0 = p1 = None
    if body[0][0] < 1e-6: p0 = Vector((0, 0, body[0][1])); body = body[1:]
    if body[-1][0] < 1e-6: p1 = Vector((0, 0, body[-1][1])); body = body[:-1]
    for r, z in body:
        ring = []
        for th in angs:
            rr = rfn(r, z, th) if rfn else r
            ring.append(Vector((math.cos(th) * rr * sx, math.sin(th) * rr * sy, z)))
        rings.append(ring); cs.append(Vector((0, 0, z)))
    ring_surface(t, rings, cs, p0, p1)
    return t

PHI0 = -90 * D2R          # hex faces centred at -90 deg (a face looks straight at the front, -Y) + k * 60 deg
def hex_delta(th):
    """the angle from the nearest hex face centre, in (-30, 30] deg (radians)"""
    return ((th - PHI0 + math.pi / 6) % (math.pi / 3)) - math.pi / 6
def hex_rad(R, th):
    """radius of a regular hexagon of circumradius R at angle th"""
    return R * math.cos(math.pi / 6) / math.cos(hex_delta(th))
def hex_angs(mids=(), delta=4.5):
    """per side: the two corner-rounding samples (corner -+ delta deg) plus face samples at the given offsets (deg)"""
    out = []
    for k in range(6):
        c = PHI0 + k * math.pi / 3
        for d in [-30 + delta] + list(mids) + [30 - delta]: out.append(c + d * D2R)
    return out
def hex_rfn(r, z, th): return hex_rad(r, th)

def frame_of(nrm):
    z = nrm.normalized(); xa = (X if abs(z.x) < 0.9 else Y).cross(z).normalized(); return xa, z.cross(xa), z

def blossom(c, nrm, r, rot, per=3, notch=0.42, cup=0.22, dome=0.2):
    """a five-petal blossom card: a closed, slightly cupped lens (top + bottom fans), round-tipped notched petals"""
    xa, ya, z = frame_of(nrm); t = Tmp(); ids = []; M = 5 * per
    for k in range(M):
        a = rot + TAU * k / M
        f = abs((k % per) / per - 0.5) * 2              # 1 at the notch, ~0.33 on the petal shoulders
        rr = r * (1 - notch * f ** 2)
        ids.append(t.vert(c + (xa * math.cos(a) + ya * math.sin(a)) * rr + z * (cup * r * (rr / r) ** 2)))
    top = t.vert(c + z * r * dome); bot = t.vert(c - z * r * 0.1)
    for k in range(M):
        t.face([top, ids[k], ids[(k + 1) % M]], z); t.face([bot, ids[(k + 1) % M], ids[k]], -z)
    return t

def leaf_card(base, d, up, L, W, cup=0.35):
    """a cupped leaf card (closed lens): base -> tip along d, its face toward up"""
    d = d.normalized(); s = d.cross(up).normalized(); n = s.cross(d).normalized()
    t = Tmp()
    rim = [(0.0, 0.0), (0.3, 0.85), (0.66, 0.7), (1.0, 0.0), (0.66, -0.7), (0.3, -0.85)]
    ids = [t.vert(base + d * (u * L) + s * (w * W * 0.5) + n * (abs(w) * cup * W * 0.5 - 0.12 * W * u)) for u, w in rim]
    top = t.vert(base + d * (0.45 * L) + n * (W * 0.12)); bot = t.vert(base + d * (0.45 * L) - n * (W * 0.1))
    for k in range(6):
        t.face([top, ids[k], ids[(k + 1) % 6]], n); t.face([bot, ids[(k + 1) % 6], ids[k]], -n)
    return t

def chip(c, r, rot, nrm=Z, k=5, squash=0.7, th=0.008):
    """a fallen petal: a flat closed lens"""
    xa, ya, z = frame_of(nrm); t = Tmp(); ids = []
    for i in range(k):
        a = rot + TAU * i / k; rr = r * (1.0 if i % 2 == 0 else 0.86)
        ids.append(t.vert(c + xa * (math.cos(a) * rr) + ya * (math.sin(a) * rr * squash)))
    top = t.vert(c + z * th); bot = t.vert(c - z * th * 0.5)
    for i in range(k):
        t.face([top, ids[i], ids[(i + 1) % k]], z); t.face([bot, ids[(i + 1) % k], ids[i]], -z)
    return t

def fib_dirs(n, zmin=-0.2, seed=0):
    """n roughly even directions over the sphere cap z > zmin (golden spiral, seeded twist)"""
    out = []; ga = math.pi * (3 - math.sqrt(5)); ph = seed * 1.37
    for i in range(n):
        zz = 1 - (i + 0.5) / n * (1 - zmin); rr = math.sqrt(max(0.0, 1 - zz * zz)); a = i * ga + ph
        out.append(Vector((math.cos(a) * rr, math.sin(a) * rr, zz)))
    return out

# ================================================================== palette
STN = '#aaa0aa'; STN_HI = '#d8d0d0'; STN_LO = '#6a6078'
MOSS = '#79a446'; MOSS_HI = '#a3c866'; MOSS_LO = '#557f36'
LDIR = Vector((-0.35, -0.55, 0.76)).normalized()
LAMP = '#fbe2a6'
WOOD_SLAT = '#c88a54'; WOOD_SLAT_HI = '#e2b07a'; WOOD_FRAME = '#6e4434'; WOOD_FRAME_HI = '#90604a'; IRON = '#4c4044'
TERRA = '#d4774e'; TERRA_HI = '#eba070'; SOIL = '#7a5646'
BARK = '#6e4a46'; BARK_HI = '#9a706a'
PINK = ['#fde8f0', '#ffd2e3', '#ffbfd8', '#ffadcc']; PINK_DEEP = '#e2609a'; PINK_SHADE = '#e08ab2'

def moss_col(seed=3, warm='#b8b244', cool='#4c9a70'):
    """icing moss (the dungeon gates' painter): mid, tops to hi, drip edges / undersides to lo, soft light, mottling"""
    def f(p, n):
        c = mix(MOSS_LO, MOSS, smooth(-0.15, 0.45, n.z))
        c = mix(c, MOSS_HI, smooth(0.55, 0.95, n.z) * 0.85)
        c = mul(c, 0.84 + 0.2 * clamp(n.dot(LDIR) * 0.5 + 0.5))
        g = vnoise(p, 9, seed)
        c = mix(c, MOSS_HI, clamp((g - 0.55) * 2.0) * 0.35); c = mix(c, MOSS_LO, clamp((0.4 - g) * 2.2) * 0.3)
        return mix(c, warm if seed % 2 else cool, 0.05)
    return f

def stone_col(base=STN, hi=STN_HI, lo=STN_LO, ao_z=None, ao_h=0.12, ao_k=0.28, seed=0, nzf=6.0, nza=0.07, under=0.32):
    """painted stone: light tops, a cool darker underside, soft mottling, AO toward a contact height"""
    def f(p, n):
        up = n.z
        c = mix(base, hi, smooth(0.15, 1.0, up) * 0.8) if up >= 0 else mix(base, lo, clamp(-up) * under * 2.2)
        if ao_z is not None: c = mul(c, 1 - ao_k * (1 - smooth(0.0, ao_h, p.z - ao_z)))
        return mul(c, 1 + nza * (vnoise(p, nzf, seed) - 0.5) * 2)
    return f

def cushion(c, r, h, seed=0, K=10, lobes=4, amp=0.18):
    """a soft lobed moss cushion: a domed lathe with a rounded shoulder"""
    ph = seed * 1.7
    t = lathe([(0.0, 0.0), (r, 0.0), (r * 0.96, h * 0.35), (r * 0.78, h * 0.75), (r * 0.42, h * 0.97), (0.0, h)], K, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + amp * math.cos(lobes * th + ph) + 0.06 * math.sin(3 * th + seed)))
    return t.xform(Matrix.Translation(c))

class XA:
    """draw into asset A through a matrix: colours are painted in the part's own frame, then it is moved"""
    def __init__(self, A, M, obj=None): self.A, self.M, self.obj = A, M, obj
    def add(self, obj, mat, t, col, tag=None):
        t.orient(); t.normals()
        cols = [col(p, n) if callable(col) else col for p, n in zip(t.v, t.n)]
        t.xform(self.M); it = iter(cols)
        return self.A.add(self.obj or obj, mat, t, lambda p, n: next(it), tag)

def tube_lite(path, rad, K=5):
    """a closed tube along path: one ring per point, pole caps pushed out along the ends (cheap rounded ends)"""
    F = frames(path); n = len(path); rings, cs = [], []
    for i, (p, (T, W, U)) in enumerate(zip(path, F)):
        r = rad(i / (n - 1))
        rings.append([p + W * (r * math.cos(TAU * k / K)) + U * (r * math.sin(TAU * k / K)) for k in range(K)]); cs.append(p)
    t = Tmp()
    ring_surface(t, rings, cs, path[0] - F[0][0] * rad(0.0) * 0.7, path[-1] + F[-1][0] * rad(1.0) * 0.8)
    return t

def clump(A, OB, c, rb, seed, tiers=((7, 0.35, 1.0), (6, 0.8, 0.9), (3, 1.2, 0.75)), base='#5aa84a', hi='#9ad06a', lo='#3f7e3c', tag='bush'):
    """a leafy clump (hosta-like): tiers of cupped leaf cards arcing up and out from the crown; (n, elevation, length)"""
    rng = random.Random(seed); ph0 = rng.uniform(0, TAU)
    for ti, (n, el, ls) in enumerate(tiers):
        for i in range(n):
            a = ph0 + TAU * (i + 0.5 * ti) / n + rng.uniform(-0.2, 0.2)
            m = Vector((math.cos(a), math.sin(a), 0))
            e = el + rng.uniform(-0.12, 0.12)
            d = m * math.cos(e) + Z * math.sin(e)
            b = c + m * rb * 0.08 * (2 - ti) + Z * rb * 0.08 * ti
            L = rb * 1.25 * ls * rng.uniform(0.9, 1.1)
            up = (Z * math.cos(e) - m * math.sin(e)).lerp(Z, 0.15).normalized()
            tone = mix(lo, base, 0.55) if ti == 0 else mix(base, hi, clamp(0.25 + 0.35 * ti + rng.uniform(-0.15, 0.15)))
            def col(p, nn, tone=tone, b=b, L=L):
                k = clamp((p - b).length / L)
                return mul(mix(mul(tone, 0.72), tone, smooth(0.0, 0.55, k)), 0.94 + 0.1 * clamp(nn.z))
            A.add(OB, 'body', leaf_card(b, d, up, L, L * 0.58, cup=0.45), col, tag)

def bush(A, OB, c, rb, n, seed, base='#5aa84a', hi='#9ad06a', lo='#3f7e3c', tag='bush'):
    """a leaf-card bush: outward cupped leaves over a cap, an inner darker layer so it never reads see-through"""
    rng = random.Random(seed)
    dirs = fib_dirs(n, zmin=-0.1, seed=seed)
    for i, d in enumerate(dirs):
        inner = i % 5 == 4
        hl = math.hypot(d.x, d.y)
        m = Vector((d.x, d.y, 0)).normalized() if hl > 1e-3 else Vector((math.cos(i), math.sin(i), 0))
        T = (m * d.z - Z * hl) if hl > 0.2 else m                    # down the dome's meridian
        dd = (T * 0.6 + d * 0.4 + Vector((rng.uniform(-.15, .15), rng.uniform(-.15, .15), 0))).normalized()
        b = c + Vector((d.x * rb * 0.4, d.y * rb * 0.4, d.z * rb * 0.5)) * (0.6 if inner else 1.0) + Z * rb * 0.3
        L = rb * (0.85 if inner else 1.0) * rng.uniform(0.9, 1.1)
        up = d.lerp(Z, 0.3).normalized()
        tone = mix(lo, base, 0.35) if inner else mix(base, hi, clamp(0.15 + 0.7 * d.z + rng.uniform(-0.15, 0.15)))
        def col(p, nn, tone=tone, b=b, L=L):
            k = clamp((p - b).length / L)
            return mul(mix(mul(tone, 0.82), tone, smooth(0.0, 0.6, k)), 0.96 + 0.08 * clamp(nn.z))
        A.add(OB, 'body', leaf_card(b, dd, up, L, L * 0.6), col, tag)

# ================================================================== 1. stone lantern (services.js stoneLantern, props.js toro s 1.15)
def lantern_parts(A, OB, lite=False):
    """the toro (props.js toro x1.15) on its slab; lite: the bare lantern for the park (no slab, plants, lotus rings,
    lattice, moon windows or curls)"""
    S = 1.15; Z0 = 0.03
    def k(y): return Z0 + y * S          # kit toro height -> Blender z
    def R(r): return r * S

    # ---- the ground stone: a flat lobed slab, buried skirt to -0.3, light top
    def lob(th): return 1 + 0.06 * math.cos(3 * th + 1.0) + 0.035 * math.sin(5 * th + 0.4)
    if lite: Z0 = 0.0
    gprof = [(0.0, -0.3), (0.37, -0.3), (0.43, -0.06), (0.455, -0.005), (0.44, 0.035), (0.39, 0.062), (0.25, 0.078), (0.0, 0.082)]
    if not lite:
        A.add(OB, 'body', lathe(gprof, 13, rfn=lambda r, z, th: r * lob(th), th0=0.2),
              stone_col(mul(STN, 0.96), ao_z=0.0, ao_h=0.05, ao_k=0.3, seed=1, nzf=5), 'ground_stone')
        # moss cushions on the slab, tucked against the lantern's foot
        for i, (a, d, r, h) in enumerate([(-2.0, 0.34, 0.11, 0.085), (2.75, 0.35, 0.09, 0.075)]):
            cc = Vector((math.cos(a) * d, math.sin(a) * d, 0.03))
            A.add(OB, 'body', cushion(cc, r, h, seed=i + 2, K=8, lobes=3, amp=0.1), moss_col(5 + i), 'moss')

    # ---- kiso: a hex foot, then a ring of downturned lotus petals
    A.add(OB, 'body', lathe_a([(0, k(0.0)), (R(0.29), k(0.0)), (R(0.30), k(0.025)), (R(0.285), k(0.085)), (R(0.262), k(0.1)), (0, k(0.1))],
                              hex_angs(), hex_rfn), stone_col(ao_z=0.07, ao_h=0.06, seed=2), 'kiso')
    def lotus_rfn(n6=3, depth=0.1):
        return lambda r, z, th: r * (1 - depth + depth * abs(math.cos(n6 * (th - PHI0))) ** 0.5)
    angs18 = [PHI0 + TAU * i / 18 for i in range(18)]
    def lotus_col(lobe_lo=0.72):
        base = stone_col(seed=4)
        def f(p, n):
            th = math.atan2(p.y, p.x)
            return mul(base(p, n), lobe_lo + (1 - lobe_lo) * abs(math.cos(3 * (th - PHI0))) ** 0.8 + 0.06)
        return f
    if not lite:
        A.add(OB, 'body', lathe_a([(0, k(0.095)), (R(0.25), k(0.1)), (R(0.21), k(0.16)), (R(0.12), k(0.185)), (0, k(0.185))],
                                  angs18, lotus_rfn(depth=0.17)), lotus_col(), 'lotus')
    # ---- sao: the post with two carved rings (in its profile)
    pr = [(0, k(0.18)), (R(0.122), k(0.18)), (R(0.118), k(0.28)), (R(0.136), k(0.293)), (R(0.136), k(0.322)), (R(0.116), k(0.335)),
          (R(0.106), k(0.56)), (R(0.124), k(0.572)), (R(0.124), k(0.598)), (R(0.104), k(0.61)), (R(0.104), k(0.66)), (0, k(0.66))]
    post_c = stone_col(seed=6, nzf=4)
    A.add(OB, 'body', lathe(pr, 9, th0=0.1), lambda p, n: mul(post_c(p, n), 0.93 + 0.1 * smooth(k(0.2), k(0.6), p.z)), 'post')
    # ---- chudai: the flared hex platform and its upturned lotus
    if not lite:
        A.add(OB, 'body', lathe_a([(0, k(0.62)), (R(0.11), k(0.62)), (R(0.18), k(0.672)), (R(0.155), k(0.698)), (0, k(0.69))],
                                  angs18, lotus_rfn(depth=0.18)), lotus_col(0.72), 'lotus')
    A.add(OB, 'body', lathe_a([(0, k(0.655)), (R(0.15), k(0.655)), (R(0.238), k(0.718)), (R(0.25), k(0.738)), (R(0.238), k(0.758)), (0, k(0.758))],
                              hex_angs(), hex_rfn), stone_col(ao_z=k(0.66), ao_h=0.05, seed=7), 'chudai')

    # ---- hibukuro: the fire box. A stone hex body; glowing paper windows front and back with a wooden lattice, round
    # moon windows on the four diagonal faces; a capping lintel. (window_glow: the game drives the night glow.)
    FB0, FB1 = k(0.755), k(0.96)
    RB = R(0.172)                          # body circumradius
    A.add(OB, 'body', lathe_a([(0, FB0), (RB, FB0), (RB * 0.985, FB1), (0, FB1)], hex_angs(), hex_rfn),
          stone_col(mul(STN, 0.97), ao_z=FB0, ao_h=0.06, ao_k=0.3, seed=8), 'firebox')
    ap = RB * math.cos(math.pi / 6)       # apothem
    for side in (0, 3):                    # front (-Y) and back paper windows
        th = PHI0 + side * math.pi / 3; dv = Vector((math.cos(th), math.sin(th), 0))
        zc = (FB0 + FB1) / 2
        W_, H_ = R(0.15), R(0.165)
        A.add(OB, 'window_glow', rbox((W_, 0.03, H_), r=0.008, M=M_at(dv * (ap - 0.008) + Vector((0, 0, zc)), rz=th + math.pi / 2)), LAMP, 'glow')
        wood = paint(WOOD_FRAME, top=0.15, bot=0.25)
        if lite: continue
        A.add(OB, 'body', rbox((0.034, 0.034, H_ + 0.01), r=0.012, M=M_at(dv * (ap + 0.012) + Vector((0, 0, zc)), rz=th + math.pi / 2)), wood, 'lattice')
        A.add(OB, 'body', rbox((W_ + 0.01, 0.034, 0.034), r=0.012, M=M_at(dv * (ap + 0.012) + Vector((0, 0, zc + H_ * 0.18)), rz=th + math.pi / 2)), wood, 'lattice')
    for side in (() if lite else (1, 2, 4, 5)):   # moon windows
        th = PHI0 + side * math.pi / 3; dv = Vector((math.cos(th), math.sin(th), 0))
        zc = (FB0 + FB1) / 2 + 0.004
        win = lathe([(0.0, -0.01), (R(0.05), -0.01), (R(0.046), 0.008), (0.0, 0.01)], 12)
        win.xform(M_at(dv * (ap + 0.004) + Vector((0, 0, zc)), rz=th) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
        A.add(OB, 'window_glow', win, LAMP, 'glow')
    A.add(OB, 'body', lathe_a([(0, k(0.95)), (R(0.19), k(0.95)), (R(0.212), k(0.968)), (R(0.205), k(0.99)), (0, k(0.99))], hex_angs(), hex_rfn),
          stone_col(seed=9), 'lintel')

    # ---- kasa: the sweeping hex roof, corners lifting, a thick rim, a dark underside; moss icing over the top
    RC = R(0.37); ZR = k(1.085); HK = R(0.155); TH = R(0.07); LIFT = R(0.07)
    def lift(u, th): return LIFT * u ** 4 * (abs(hex_delta(th)) / (math.pi / 6)) ** 2.5
    def roof_top(rho, th):
        u = min(1.0, rho / hex_rad(RC, th))
        return ZR + HK * (1 - u) ** 1.6 + lift(u, th)
    kangs = hex_angs(mids=(0,), delta=5.0)
    def P(u, z_of, th): rr = hex_rad(RC, th) * u; return Vector((math.cos(th) * rr, math.sin(th) * rr, z_of(th)))
    rings_def = [
        (0.25, lambda th: roof_top(hex_rad(RC, th) * 0.25, th)),
        (0.52, lambda th: roof_top(hex_rad(RC, th) * 0.52, th)),
        (0.76, lambda th: roof_top(hex_rad(RC, th) * 0.76, th)),
        (0.93, lambda th: roof_top(hex_rad(RC, th) * 0.93, th)),
        (1.0, lambda th: roof_top(hex_rad(RC, th), th) - 0.006),
        (1.025, lambda th: roof_top(hex_rad(RC, th), th) - TH * 0.5),
        (1.0, lambda th: roof_top(hex_rad(RC, th), th) - TH + 0.004),
        (0.86, lambda th: roof_top(hex_rad(RC, th), th) - TH - 0.004 - lift(1.0, th) * 0.3),
        (0.55, lambda th: k(1.0)),
    ]
    rings = [[P(u, zf, th) for th in kangs] for u, zf in rings_def]
    cs = [Vector((0, 0, ZR + 0.02))] * len(rings)
    kt = Tmp(); ring_surface(kt, rings, cs, pole0=Vector((0, 0, ZR + HK)), pole1=Vector((0, 0, k(0.99))))
    def kasa_col(p, n):
        rho = math.hypot(p.x, p.y); th = math.atan2(p.y, p.x); u = rho / hex_rad(RC, th)
        if n.z < -0.3: return mul(STN_LO, 0.78 + 0.12 * smooth(0.5, 1.0, u))           # deep underside
        if n.z < 0.35: return mix(STN, STN_HI, 0.35)                                    # the pale rim band
        c = mix(STN, STN_HI, smooth(0.3, 1.0, n.z) * 0.7)
        c = mul(c, 0.92 + 0.1 * abs(math.cos(3 * (th - PHI0))) ** 4)                    # hip ridges catch light
        return mul(c, 0.95 + 0.1 * vnoise(p, 7, 10))
    A.add(OB, 'body', kt, kasa_col, 'kasa')
    # warabite: on each lifted corner the roof edge rolls up into a soft scroll: a short, low roll lying across the
    # corner (its axis along the eave), the corner tip tucked under it
    for i in range(0 if lite else 6):
        th = PHI0 + math.pi / 6 + i * math.pi / 3; dv = Vector((math.cos(th), math.sin(th), 0)); tv = Vector((-dv.y, dv.x, 0))
        c0 = dv * (RC * 0.95) + Vector((0, 0, roof_top(RC * 0.95, th) + 0.009))
        path = [c0 + tv * t + dv * (0.012 * abs(t) / 0.034) - Z * (0.006 * (t / 0.034) ** 2) for t in (-0.034, -0.012, 0.012, 0.034)]
        A.add(OB, 'body', tube_lite(path, lambda s: 0.021 * (0.8 + 0.2 * math.sin(math.pi * s)), K=6), stone_col(mul(STN, 1.05), seed=12 + i), 'curls')
    # moss icing: covers about half the roof, rounded drips down the slopes, a rolled lip
    drips = [(-1.62, 0.12, 0.27), (-0.48, 0.07, 0.22), (0.62, 0.09, 0.26), (2.62, 0.1, 0.27)]
    he = drip_he(lambda th: RC * (0.55 + 0.05 * math.sin(2 * th + 0.7) + 0.03 * math.sin(5 * th + 1.3)), drips)
    def he_c(th): return min(he(th), hex_rad(RC, th) * 0.94)
    def F(th, h): return Vector((math.cos(th) * h, math.sin(th) * h, roof_top(h, th)))
    mc = moss_col(8)
    def kmoss(p, n):                       # the cushion reads round: lighter crown, the rolled edge in shade
        th = math.atan2(p.y, p.x); kk = math.hypot(p.x, p.y) / max(1e-6, he_c(th))
        return mul(mc(p, n), 1.06 - 0.3 * smooth(0.7, 1.02, kk))
    def m_thick(th, s): return 0.04 * (1 - 0.3 * s) * (1 + 0.22 * math.sin(4 * th + 5 * s + 0.5) * math.sin(3 * th - 1.1))
    A.add(OB, 'body', drape(F, he_c, m_thick, drip_angles(12 if lite else 14, drips, offs=((-0.6, 0.0, 0.6) if lite else (-0.8, -0.4, 0.0, 0.4, 0.8))), 2,
                            Vector((0, 0, ZR + 0.02))), kmoss, 'moss')
    # ---- the petal cup and the hoju jewel
    A.add(OB, 'body', lathe([(0, k(1.215)), (R(0.06), k(1.215)), (R(0.098), k(1.25)), (R(0.092), k(1.278)), (0, k(1.272))], 10,
                            rfn=lambda r, z, th: r * (0.9 + 0.1 * abs(math.cos(3 * th)) ** 0.6)),
          stone_col(seed=13), 'cup')
    A.add(OB, 'body', lathe([(0, k(1.262)), (R(0.06), k(1.27)), (R(0.08), k(1.31)), (R(0.058), k(1.37)), (R(0.022), k(1.415)), (0, k(1.44))], 12),
          stone_col(mul(STN, 1.03), seed=14), 'hoju')

    # ---- the kit's two bushes and a rock round the slab (kit angles i * 2.1 + 0.4, r 0.36)
    for i in range(0 if lite else 3):
        a = i * 2.1 + 0.4; x, y = math.cos(a) * 0.36, -math.sin(a) * 0.36
        if i < 2:
            clump(A, OB, Vector((x, y, 0.03)), 0.15, seed=21 + i, tiers=((6, 0.35, 1.0), (5, 0.8, 0.9), (3, 1.2, 0.75)))
        else:
            rk = ellipsoid(Vector((0, 0, 0)), (0.13, 0.11, 0.085), K=8, J=4)
            rk.v = [v * (1 + 0.12 * (vnoise(v, 9, 31) - 0.5) * 2) for v in rk.v]
            rk.xform(M_at((x, y, 0.035), rz=0.6))
            sc = stone_col(mul(STN, 0.92), seed=32)
            A.add(OB, 'body', rk, lambda p, n: mix(sc(p, n), MOSS, smooth(0.55, 0.85, n.z) * 0.85), 'rock')

def build_stoneLantern():
    A = Asset(); lantern_parts(A, 'stoneLantern')
    return A, dict(body={}, window_glow=dict(emission=LAMP))

# ================================================================== 2. bench (decor.js bench, props.js bench w 0.95)
def build_bench():
    A = Asset(); OB = 'bench'; rng = random.Random(23)
    OY = 0.05                               # kit B.at([0, 0, -0.05]) -> Blender y + 0.05
    w = 0.95
    def slat_col(tone):
        base = mul(WOOD_SLAT, tone); hi = mul(WOOD_SLAT_HI, tone)
        def f(p, n):
            c = mix(base, hi, smooth(0.3, 1.0, n.z) * 0.7) if n.z > 0 else mul(base, 1 + 0.32 * n.z)
            if abs(n.x) > 0.7: c = mul(c, 0.8)                                          # end grain
            return mul(c, 1 - 0.18 * (1 - smooth(0.0, 0.12, p.z)))
        return f
    frame = lambda p, n: mul(mix(WOOD_FRAME, WOOD_FRAME_HI, smooth(0.3, 1.0, n.z) * 0.6) if n.z > 0 else mul(WOOD_FRAME, 1 + 0.3 * n.z),
                             1 - 0.2 * (1 - smooth(0.0, 0.15, p.z)))
    # seat: four chunky slats (a hand-made wobble, each its own tone)
    SZ = 0.43
    for i in range(4):
        y = -(-0.165 + i * 0.105) + OY
        A.add(OB, 'body', rbox((w + rng.uniform(-0.01, 0.01), 0.094, 0.052), r=0.018, M=M_at((rng.uniform(-0.006, 0.006), y, SZ + 0.005), rz=rng.uniform(-0.012, 0.012))),
              slat_col(0.92 + rng.uniform(0, 0.14)), 'seat')
    # the back: raked rear posts, three back slats, a crest rail with a little paw emblem
    rake = 0.142
    def postY(z): return -(-0.18 - z * rake) + OY        # kit z -0.18 - y*rake -> Blender y
    ang = math.atan(rake)
    for i in range(2):
        z = 0.56 + i * 0.105
        A.add(OB, 'body', rbox((w - 0.06, 0.034, 0.072), r=0.014, M=M_at((0, postY(z) - 0.05, z), rx=-ang)), slat_col(0.92 + rng.uniform(0, 0.12)), 'back')
    zc = 0.79
    crest = rbox((w + 0.02, 0.05, 0.1), r=0.022, seg=2, extra=(6, 0, 0),
                 warp=lambda p: Vector((p.x, p.y, p.z + 0.028 * (1 - (2 * p.x / (w + 0.02)) ** 2) * (1 if p.z > 0 else 0.6))),
                 M=M_at((0, postY(zc) - 0.05, zc), rx=-ang))
    A.add(OB, 'body', crest, slat_col(1.04), 'crest')
    # the paw emblem on the crest rail: a pad and four toes, carved proud in pale wood
    paw_n = Vector((0, -math.cos(ang), math.sin(ang)))
    pc = Vector((0, postY(zc + 0.02) - 0.05 - 0.026, zc + 0.02))
    def paw_col(p, n): return mix('#f6dcb2', '#fff0d6', smooth(0.0, 1.0, -n.y) * 0.5)
    pad = ellipsoid(Vector((0, 0, 0)), (0.034, 0.012, 0.026), K=10, J=4); pad.xform(M_at(pc + Vector((0, 0, -0.012)), rx=-ang))
    A.add(OB, 'body', pad, paw_col, 'paw')
    for j, (dx, dz) in enumerate([(-0.04, 0.018), (-0.015, 0.034), (0.015, 0.034), (0.04, 0.018)]):
        toe = ellipsoid(Vector((0, 0, 0)), (0.012, 0.01, 0.014), K=7, J=3); toe.xform(M_at(pc + Vector((dx, 0, dz)), rx=-ang))
        A.add(OB, 'body', toe, paw_col, 'paw')
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.1)
        # raked rear leg + back post (one piece from the ground to above the crest)
        L = 0.9; zm = L / 2 - 0.02
        A.add(OB, 'body', rbox((0.07, 0.07, L / math.cos(ang)), r=0.022, M=M_at((x, postY(zm), zm), rx=-ang)), frame, 'frame')
        # front leg up to the armrest
        A.add(OB, 'body', rbox((0.07, 0.07, 0.66), r=0.022, M=M_at((x, -0.17 + OY, 0.31))), frame, 'frame')
        # seat rail and a low stretcher
        A.add(OB, 'body', rbox((0.058, 0.44, 0.062), r=0.018, M=M_at((x, OY + 0.0, 0.385))), frame, 'frame')
        A.add(OB, 'body', rbox((0.05, 0.4, 0.045), r=0.015, M=M_at((x, OY + 0.01, 0.12))), frame, 'frame')
        # the armrest with a rounded knob over the front leg
        A.add(OB, 'body', rbox((0.088, 0.47, 0.046), r=0.02, M=M_at((x + sx * 0.006, OY + 0.015, 0.655))), slat_col(1.0), 'arm')
        kn = ellipsoid(Vector((0, 0, 0)), (0.05, 0.05, 0.03), K=10, J=3); kn.xform(M_at((x + sx * 0.006, -0.19 + OY, 0.67)))
        A.add(OB, 'body', kn, slat_col(1.06), 'arm')
        # little feet
        for yy in (-0.17 + OY, postY(0.0)):
            A.add(OB, 'body', rbox((0.092, 0.092, 0.05), r=0.016, M=M_at((x, yy, 0.0))), lambda p, n: mul(frame(p, n), 0.82), 'feet')
        # iron bolt heads on the outer faces
        for (yy, zz) in ((OY - 0.12, 0.385), (OY + 0.12, 0.385), (-0.17 + OY, 0.6)):
            b = ellipsoid(Vector((0, 0, 0)), (0.011, 0.021, 0.021), K=6, J=2); b.xform(M_at((x + sx * 0.037, yy, zz)))
            A.add(OB, 'body', b, lambda p, n: mul(IRON, 0.9 + 0.3 * clamp(n.z)), 'bolts')
    # the potted flowers at the front right corner (kit pot r 0.1, h 0.14 at game (0.4, 0, 0.32))
    px, py = 0.4, -0.32
    r, h = 0.1, 0.14
    pot = lathe([(0.0, 0.0), (r * 0.7, 0.0), (r * 0.74, h * 0.08), (r * 0.95, h * 0.78), (r * 1.14, h * 0.84), (r * 1.15, h * 1.0), (r * 0.95, h * 1.0), (0.0, h * 0.9)], 12)
    pot.xform(M_at((px, py, 0)))
    def pot_col(p, n):
        zz = p.z / h
        c = mix(TERRA, TERRA_HI, smooth(0.0, 1.0, n.z) * 0.5) if n.z > -0.2 else mul(TERRA, 0.75)
        if 0.52 < zz < 0.62: c = mix(c, '#f0c08a', 0.55)                              # a pale glaze band
        if zz > 0.8: c = mul(c, 1.07)
        return mul(c, 1 - 0.2 * (1 - smooth(0.0, 0.05, p.z)))
    A.add(OB, 'body', pot, pot_col, 'pot')
    soil = lathe([(0.0, h * 0.86), (r * 0.98, h * 0.86), (r * 0.96, h * 0.95), (0.0, h * 0.99)], 10); soil.xform(M_at((px, py, 0)))
    A.add(OB, 'body', soil, lambda p, n: mul(SOIL, 0.9 + 0.1 * clamp(n.z)), 'pot')
    bush(A, OB, Vector((px, py, h * 0.9)), 0.1, 11, seed=41, tag='flowers')
    fl = '#ff8fb0'
    for j, d in enumerate(fib_dirs(5, zmin=0.25, seed=7)):
        c = Vector((px, py, h * 0.9 + 0.06)) + d * 0.075
        bl = blossom(c, (d + Z).normalized(), 0.036, j * 0.9, per=3, notch=0.4, cup=0.18, dome=0.35)
        cc = c.copy()
        A.add(OB, 'body', bl, lambda p, n, cc=cc: mix(fl, '#ffd24a', 1 - smooth(0.006, 0.014, (p - cc).length)), 'flowers')
    return A, dict(body={})

# ================================================================== the little sakura (props.js tree 'sakura'; planter frame)
CAMV = Vector((0, -0.62, 0.78)).normalized()     # toward the game camera (45 deg down, from the front)
PINK_CORE = '#c25a8c'
def sakura_tree(A, OB, rng, n_out=13, n_core=4, mids=True, falling=4, r_out=(0.066, 0.08)):
    """a leaning trunk flaring into root knuckles (base at z 0.39, the planter's soil), four branches, and dense round
    blossom clusters: many small notched five-petal cards over a darker pink core of fill cards (depth), a share of
    them turned to face the camera; a few petals drifting down. Cards only: no crown mass. Returns the blossom count."""
    tprof = [(0.0, 0.39), (0.15, 0.39), (0.125, 0.452), (0.085, 0.53), (0.07, 0.66), (0.062, 0.84), (0.055, 1.0), (0.047, 1.1), (0.0, 1.13)]
    lean = lambda z: (0.05 * math.sin((z - 0.4) * 4.0), 0.03 * math.sin((z - 0.4) * 3.0 + 0.6))
    roots = lambda r, z, th: r * (1 + (0.5 if z < 0.46 else 0.12 * smooth(0.6, 0.45, z)) * (abs(math.cos(2 * th + 0.5)) ** 3 - 0.3))
    def bark_col(p, n):
        th = math.atan2(n.y, n.x)
        c = mix(BARK, BARK_HI, clamp(0.35 + 0.35 * n.z + 0.25 * math.sin(th * 3 + p.z * 9)))
        return mul(c, 1 - 0.25 * (1 - smooth(0.4, 0.5, p.z)))
    A.add(OB, 'body', lathe(tprof, 8, rfn=roots, off=lean), bark_col, 'trunk')
    top = Vector((lean(1.08)[0], lean(1.08)[1], 1.08))
    clusters = []; angs = []
    for i in range(4):
        a = i / 4 * TAU + 0.45 + rng.uniform(-0.25, 0.25); angs.append(a)
        end = top + Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.17 + rng.uniform(0.0, 0.14)))
        mid = top.lerp(end, 0.5) + Vector((0, 0, 0.06))
        A.add(OB, 'body', tube([top, mid, end], lambda s: 0.044 - 0.016 * s, K=5), bark_col, 'branches')
        clusters.append((end + Vector((0, 0, 0.04)), 0.2 + rng.uniform(0, 0.025)))
    clusters.append((top + Vector((0.02, -0.02, 0.48)), 0.24))
    if mids:   # two lower clusters between the branches, filling the front and one side of the crown
        for a in (angs[2] + 0.75, angs[3] + 0.8):
            clusters.append((top + Vector((math.cos(a) * 0.24, math.sin(a) * 0.24, 0.1)), 0.18))
    crown_c = sum((c for c, _ in clusters), Vector()) / len(clusters)
    nb = 0
    for ci, (cc, cr) in enumerate(clusters):
        for j, d in enumerate(fib_dirs(n_core, zmin=-0.25, seed=ci * 5 + 2)):        # the dark core
            p = cc + Vector((d.x * cr, d.y * cr, d.z * cr * 0.85)) * 0.5
            A.add(OB, 'body', blossom(p, d.lerp(Z, 0.3).normalized(), rng.uniform(0.09, 0.105), rng.uniform(0, TAU), per=2, notch=0.14, cup=0.25, dome=0.25),
                  lambda q, n: mul(PINK_CORE, 0.86 + 0.14 * clamp(n.z)), 'blossom_core')
        for j, d in enumerate(fib_dirs(n_out, zmin=-0.4, seed=ci * 3 + 1)):
            dd = (d + Vector((rng.uniform(-.12, .12), rng.uniform(-.12, .12), rng.uniform(-.08, .08)))).normalized()
            p = cc + Vector((dd.x * cr, dd.y * cr, dd.z * cr * 0.85)) * rng.uniform(0.86, 1.04)
            nrm = dd.lerp(Z, 0.25).normalized()
            if j % 3 == 1: nrm = nrm.lerp(CAMV, 0.6).normalized()                      # some face the camera
            r = rng.uniform(*r_out)
            tone = PINK[rng.randrange(4)]
            ht = clamp((p.z - crown_c.z + 0.3) / 0.65)
            tone = mix(mix(tone, PINK_SHADE, 0.5), tone, smooth(0.0, 0.85, ht))        # lower blossoms in pink shade
            pc = p.copy()
            def bcol(q, n, pc=pc, tone=tone, r=r):
                k = (q - pc).length / r
                return mix(PINK_DEEP, tone, smooth(0.1, 0.42, k))
            A.add(OB, 'body', blossom(p, nrm, r, rng.uniform(0, TAU), per=3, notch=0.36, cup=0.24, dome=0.22), bcol, 'blossoms'); nb += 1
    for i in range(falling):   # petals drifting down from the crown
        a = 0.6 + i * 1.7 + rng.uniform(-0.3, 0.3); d = rng.uniform(0.45, 0.62)
        c = Vector((math.cos(a) * d, math.sin(a) * d, 0.62 + 0.11 * i + rng.uniform(-0.04, 0.04)))
        nn = Vector((rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8), 1.0)).normalized()
        A.add(OB, 'body', chip(c, 0.036, rng.uniform(0, TAU), nrm=nn, th=0.01), PINK[1 + i % 3], 'petals')
    return nb

# ================================================================== 3. sakura planter (decor.js sakuraPlanter, props.js tree sakura s 0.58)
def build_sakuraPlanter():
    A = Asset(); OB = 'sakuraPlanter'; rng = random.Random(37)
    BOX = '#b6aab4'; BOX_HI = '#dcd2d2'; BOX_LO = '#766a80'
    # plinth (buried skirt), the box, framed panels with a sakura crest, a capping rim of four rails, corner blocks
    A.add(OB, 'body', rbox((0.86, 0.86, 0.36), r=0.03, M=M_at((0, 0, -0.12))), stone_col(mul(BOX, 0.9), BOX_HI, BOX_LO, ao_z=0.0, ao_h=0.05, seed=1), 'plinth')
    A.add(OB, 'body', rbox((0.76, 0.76, 0.32), r=0.045, M=M_at((0, 0, 0.2))), stone_col(BOX, BOX_HI, BOX_LO, ao_z=0.06, ao_h=0.1, ao_k=0.3, seed=2), 'box')
    for s in range(4):                      # (pale bevel frame, darker field)
        th = -math.pi / 2 + s * math.pi / 2; dv = Vector((math.cos(th), math.sin(th), 0))
        def panel_col(p, n, dv=dv):
            if n.dot(dv) > 0.9: return mul(BOX, 0.86)
            return mix(BOX_HI, '#f0e8e4', 0.3)
        A.add(OB, 'body', rbox((0.56, 0.03, 0.19), r=0.014, M=M_at(dv * 0.383 + Vector((0, 0, 0.205)), rz=th + math.pi / 2)), panel_col, 'panels')
        cc = dv * 0.402 + Vector((0, 0, 0.205))
        A.add(OB, 'body', blossom(cc, dv, 0.06, s * 0.3 + 0.31, per=3, notch=0.45, cup=0.0, dome=0.16),
              lambda p, n, cc=cc: mix('#f9eef0', '#ec9ab8', 1 - smooth(0.008, 0.02, (p - cc).length)), 'crest')
    for s in range(4):
        th = -math.pi / 2 + s * math.pi / 2; dv = Vector((math.cos(th), math.sin(th), 0))
        L = 0.86 if s % 2 == 0 else 0.66
        A.add(OB, 'body', rbox((L, 0.1, 0.08), r=0.026, M=M_at(dv * 0.38 + Vector((0, 0, 0.39)), rz=th + math.pi / 2)),
              stone_col(mul(BOX, 1.0), BOX_HI, BOX_LO, seed=3 + s), 'band')
    for sx in (-1, 1):
        for sy in (-1, 1):
            A.add(OB, 'body', rbox((0.15, 0.15, 0.1), r=0.034, M=M_at((sx * 0.4, sy * 0.4, 0.405), rz=rng.uniform(-0.04, 0.04))),
                  stone_col(mul(BOX, 1.02), BOX_HI, BOX_LO, seed=4), 'corners')
    # moss creeping up from the foot: soft cushions on the plinth against the box
    for i, (x, y, r, hh) in enumerate([(-0.39, -0.37, 0.1, 0.085), (0.41, 0.02, 0.085, 0.07)]):
        A.add(OB, 'body', cushion(Vector((x, y, 0.03)), r, hh, seed=i + 5, K=9, lobes=3, amp=0.1), moss_col(6 + i), 'moss')
    # the soil mound, a little moss cushion on it
    soil = lathe([(0.0, 0.36), (0.345, 0.36), (0.34, 0.41), (0.2, 0.435), (0.0, 0.442)], 12, e=4.0, th0=math.pi / 12)
    A.add(OB, 'body', soil, lambda p, n: mul(mix(SOIL, '#8a6450', smooth(0.6, 1.0, n.z) * 0.5), 0.92 + 0.1 * vnoise(p, 5, 9)), 'soil')
    A.add(OB, 'body', cushion(Vector((0.17, -0.15, 0.412)), 0.07, 0.04, seed=9, K=8, lobes=3, amp=0.1), moss_col(9), 'moss')

    nb = sakura_tree(A, OB, rng)
    # petals: a few on the soil, more drifted onto the ground round the box, thickest downwind (+x, front)
    for i in range(3):
        x, y = rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25)
        A.add(OB, 'body', chip(Vector((x, y, 0.437 if abs(x) < 0.18 and abs(y) < 0.18 else 0.418)), 0.034, rng.uniform(0, TAU)), PINK[2], 'petals')
    for i in range(6):
        a = -2.3 + i * 0.55 + rng.uniform(-0.2, 0.2); d = rng.uniform(0.52, 0.75)
        A.add(OB, 'body', chip(Vector((math.cos(a) * d + 0.06, math.sin(a) * d - 0.04, 0.006)), 0.038, rng.uniform(0, TAU)),
              [PINK[1], PINK[2], PINK[3]][i % 3], 'petals')
    print('HD sakura blossoms', nb)
    return A, dict(body={})

# ================================================================== shared: n-gon roofs, timber, the little extras
def ngon_delta(th, N, phi0): return ((th - phi0 + math.pi / N) % (TAU / N)) - math.pi / N
def ngon_rad(R, th, N, phi0): return R * math.cos(math.pi / N) / math.cos(ngon_delta(th, N, phi0))
def ngon_angs(N, phi0, mids=(), delta=4.5):
    out = []; half = 180.0 / N
    for k in range(N):
        c = phi0 + k * TAU / N
        for d in [-half + delta] + list(mids) + [half - delta]: out.append(c + d * D2R)
    return out

def ngon_roof(A, OB, N, phi0, RC, ZR, HK, TH, LIFT, z_in, col, mids=(0,), us=(0.25, 0.52, 0.76, 0.93), pw=1.6, tag='roof'):
    """a sweeping n-sided roof (the lantern kasa generalised): concave slopes, corners lifting, a thick rim, an underside
    rising to z_in; returns roof_top(rho, th)"""
    def lift(u, th): return LIFT * u ** 4 * (abs(ngon_delta(th, N, phi0)) / (math.pi / N)) ** 2.5
    def top(rho, th):
        u = min(1.0, rho / ngon_rad(RC, th, N, phi0)); return ZR + HK * (1 - u) ** pw + lift(u, th)
    angs = ngon_angs(N, phi0, mids, 5.0)
    def P(u, z):
        return [Vector((math.cos(th) * ngon_rad(RC, th, N, phi0) * u, math.sin(th) * ngon_rad(RC, th, N, phi0) * u, z(th))) for th in angs]
    R1 = lambda th: ngon_rad(RC, th, N, phi0)
    rings = [P(u, lambda th, u=u: top(R1(th) * u, th)) for u in us]
    rings += [P(1.0, lambda th: top(R1(th), th) - 0.006), P(1.025, lambda th: top(R1(th), th) - TH * 0.5),
              P(1.0, lambda th: top(R1(th), th) - TH + 0.004), P(0.86, lambda th: top(R1(th), th) - TH - 0.004 - lift(1.0, th) * 0.3),
              P(0.55, lambda th: z_in)]
    t = Tmp(); ring_surface(t, rings, [Vector((0, 0, ZR + 0.01))] * len(rings), pole0=Vector((0, 0, ZR + HK)), pole1=Vector((0, 0, z_in - 0.01)))
    A.add(OB, 'body', t, col, tag)
    return top

TIMBER = '#76503e'; TIMBER_HI = '#9c7458'
def timber_col(base=TIMBER, hi=TIMBER_HI, ao=0.15, seed=0):
    def f(p, n):
        c = mix(base, hi, smooth(0.2, 1.0, n.z) * 0.7) if n.z > 0 else mul(base, 1 + 0.3 * n.z)
        c = mul(c, 0.94 + 0.12 * vnoise(Vector((p.x * 3, p.y * 3, p.z * 0.6)), 6, seed))
        return mul(c, 1 - 0.2 * (1 - smooth(0.0, ao, p.z)))
    return f
def flat_col(c, k=0.25):
    return lambda p, n: mul(c, 1 + k * n.z if n.z < 0 else 1 + k * 0.4 * n.z)

def lily(c, r, rot):
    """a lily pad: a flat closed lens with its wedge notch"""
    t = Tmp(); ids = []
    for i in range(11):
        a = rot + 0.32 + (TAU - 0.64) * i / 10
        ids.append(t.vert(c + Vector((math.cos(a) * r, math.sin(a) * r, 0.0))))
    ids.append(t.vert(c + Vector((math.cos(rot) * r * 0.12, math.sin(rot) * r * 0.12, 0.0))))
    top = t.vert(c + Vector((0, 0, 0.012))); bot = t.vert(c - Vector((0, 0, 0.006)))
    M = len(ids)
    for i in range(M):
        t.face([top, ids[i], ids[(i + 1) % M]], Z); t.face([bot, ids[(i + 1) % M], ids[i]], -Z)
    return t

def flower_tuft(A, OB, c, color, seed, rb=0.07, r=0.045, tag='flowers'):
    """one garden flower: a little rosette of leaves and a five-petal bloom turned up toward the camera"""
    clump(A, OB, c, rb, seed, tiers=((3, 0.45, 1.0),), tag=tag)
    rng = random.Random(seed + 99)
    p = c + Vector((rng.uniform(-0.01, 0.01), rng.uniform(-0.01, 0.01), rb * 0.9 + 0.03))
    nrm = Z.lerp(CAMV, 0.5).normalized(); pc = p.copy()
    A.add(OB, 'body', blossom(p, nrm, r, rng.uniform(0, TAU), per=3, notch=0.36, cup=0.3, dome=0.3),
          lambda q, n: mix('#ffd24a', color, smooth(0.008, 0.016, (q - pc).length)), tag)

def bench_lite(A, OB, w=1.0):
    """the approved bench, light: slats, raked back with a crest rail, frames, armrests with knobs, feet (no pot,
    emblem, bolts or stretchers). Local frame: centred, feet at z 0, front -Y."""
    rng = random.Random(int(w * 100))
    def slat_col(tone):
        base = mul(WOOD_SLAT, tone); hi = mul(WOOD_SLAT_HI, tone)
        def f(p, n):
            c = mix(base, hi, smooth(0.3, 1.0, n.z) * 0.7) if n.z > 0 else mul(base, 1 + 0.32 * n.z)
            if abs(n.x) > 0.7: c = mul(c, 0.8)
            return mul(c, 1 - 0.18 * (1 - smooth(0.0, 0.12, p.z)))
        return f
    frame = lambda p, n: mul(mix(WOOD_FRAME, WOOD_FRAME_HI, smooth(0.3, 1.0, n.z) * 0.6) if n.z > 0 else mul(WOOD_FRAME, 1 + 0.3 * n.z),
                             1 - 0.2 * (1 - smooth(0.0, 0.15, p.z)))
    for i in range(4):
        A.add(OB, 'body', rbox((w + rng.uniform(-0.01, 0.01), 0.094, 0.052), r=0.018, M=M_at((0, 0.165 - i * 0.105, 0.435), rz=rng.uniform(-0.012, 0.012))),
              slat_col(0.92 + rng.uniform(0, 0.14)), 'seat')
    rake = 0.142; ang = math.atan(rake)
    def postY(z): return 0.18 + z * rake
    A.add(OB, 'body', rbox((w - 0.06, 0.034, 0.072), r=0.014, M=M_at((0, postY(0.6) - 0.05, 0.6), rx=-ang)), slat_col(0.95), 'back')
    A.add(OB, 'body', rbox((w + 0.02, 0.05, 0.1), r=0.022, M=M_at((0, postY(0.78) - 0.05, 0.78), rx=-ang)), slat_col(1.04), 'back')
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.1)
        A.add(OB, 'body', rbox((0.07, 0.07, 0.9 / math.cos(ang)), r=0.022, M=M_at((x, postY(0.43), 0.43), rx=-ang)), frame, 'frame')
        A.add(OB, 'body', rbox((0.07, 0.07, 0.66), r=0.022, M=M_at((x, -0.17, 0.31))), frame, 'frame')
        A.add(OB, 'body', rbox((0.058, 0.44, 0.062), r=0.018, M=M_at((x, 0.0, 0.385))), frame, 'frame')
        A.add(OB, 'body', rbox((0.088, 0.47, 0.046), r=0.02, M=M_at((x + sx * 0.006, 0.015, 0.655))), slat_col(1.0), 'arm')
        kn = ellipsoid(Vector((0, 0, 0)), (0.05, 0.05, 0.03), K=8, J=3); kn.xform(M_at((x + sx * 0.006, -0.19, 0.67)))
        A.add(OB, 'body', kn, slat_col(1.06), 'arm')

# ================================================================== 4. street lamp (services.js streetLamp: post h 1.75, andon box lantern)
def build_streetLamp():
    A = Asset(); OB = 'streetLamp'; rng = random.Random(51)
    h = 1.75
    A.add(OB, 'body', lathe_a([(0, -0.3), (0.25, -0.3), (0.255, 0.0), (0.245, 0.1), (0.2, 0.135), (0.13, 0.145), (0, 0.145)], hex_angs(), hex_rfn),
          lambda p, n: mix(stone_col(mul(STN, 0.9), seed=51, ao_z=0.0, ao_h=0.05, ao_k=0.3)(p, n), MOSS,
                           smooth(0.55, 0.85, n.z) * 0.7 * smooth(0.45, 0.65, vnoise(p, 7, 2))), 'base')
    A.add(OB, 'body', cushion(Vector((-0.16, 0.12, 0.0)), 0.1, 0.075, seed=3, K=8, lobes=3, amp=0.1), moss_col(4), 'moss')
    clump(A, OB, Vector((0.2, -0.15, 0.0)), 0.13, seed=52, tiers=((6, 0.35, 1.0), (5, 0.8, 0.9), (3, 1.2, 0.75)))   # the kit's plant
    tc = timber_col(seed=5)
    A.add(OB, 'body', rbox((0.11, 0.11, h - 0.13), r=0.024, M=M_at((0, 0, 0.13 + (h - 0.13) / 2))), tc, 'post')
    for zb in (0.45, 1.05):
        A.add(OB, 'body', rbox((0.132, 0.132, 0.046), r=0.014, M=M_at((0, 0, zb))), lambda p, n: mul(IRON, 0.9 + 0.35 * clamp(n.z)), 'bands')
    for k in range(4):                     # knee braces under the lantern
        a = k * math.pi / 2 + math.pi / 4
        A.add(OB, 'body', rbox((0.034, 0.034, 0.2), r=0.01, M=M_at((math.cos(a) * 0.1, math.sin(a) * 0.1, h - 0.07), rz=a, ry=0.75)), tc, 'post')
    A.add(OB, 'body', rbox((0.38, 0.38, 0.055), r=0.018, M=M_at((0, 0, h + 0.0275))), tc, 'lantern')
    y0 = h + 0.055; PH = 0.32
    A.add(OB, 'window_glow', rbox((0.268, 0.268, PH), r=0.012, M=M_at((0, 0, y0 + PH / 2))), LAMP, 'glow')
    fc = timber_col('#5e3e30', '#80584a', ao=0.0, seed=6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            A.add(OB, 'body', rbox((0.044, 0.044, PH + 0.03), r=0.013, M=M_at((sx * 0.142, sy * 0.142, y0 + PH / 2))), fc, 'frame')
    for k in range(4):
        th = -math.pi / 2 + k * math.pi / 2; dv = Vector((math.cos(th), math.sin(th), 0))
        for zz in (y0 + 0.02, y0 + PH - 0.012):
            A.add(OB, 'body', rbox((0.29, 0.032, 0.032), r=0.01, M=M_at(dv * 0.142 + Vector((0, 0, zz)), rz=th + math.pi / 2)), fc, 'frame')
        A.add(OB, 'body', rbox((0.022, 0.02, PH - 0.04), r=0.007, M=M_at(dv * 0.139 + Vector((0, 0, y0 + PH / 2)), rz=th + math.pi / 2)), fc, 'kumiko')
        A.add(OB, 'body', rbox((0.25, 0.02, 0.022), r=0.007, M=M_at(dv * 0.139 + Vector((0, 0, y0 + PH * 0.64)), rz=th + math.pi / 2)), fc, 'kumiko')
    SL = '#5c6280'; SL_HI = '#8a92b0'; SL_RIM = '#a4aac0'
    def roof_col(p, n):
        if n.z < -0.3: return mul('#4a3430', 0.9)
        if n.z < 0.35: return mix(SL_RIM, SL, 0.25)
        rho = math.hypot(p.x, p.y); th = math.atan2(p.y, p.x); u = rho / ngon_rad(0.4, th, 4, PHI0)
        c = mix(SL, SL_HI, smooth(0.3, 1.0, n.z) * 0.55)
        if int(u * 5 + 0.5) % 2: c = mul(c, 0.9)                                         # tile courses
        c = mul(c, 0.92 + 0.12 * abs(math.sin(2 * (th - PHI0))) ** 6)                   # hips catch the light
        return c
    ZR = y0 + PH + 0.085
    rt = ngon_roof(A, OB, 4, PHI0, 0.4, ZR, 0.2, 0.06, 0.075, y0 + PH, roof_col, mids=(-22, 0, 22), us=(0.2, 0.4, 0.6, 0.8, 0.93))
    zt = ZR + 0.2
    A.add(OB, 'body', lathe([(0, zt - 0.02), (0.05, zt - 0.015), (0.07, zt + 0.02), (0.06, zt + 0.04), (0, zt + 0.035)], 10), stone_col(seed=7), 'finial')
    A.add(OB, 'body', lathe([(0, zt + 0.03), (0.045, zt + 0.04), (0.055, zt + 0.075), (0.036, zt + 0.12), (0.012, zt + 0.15), (0, zt + 0.165)], 10),
          stone_col(mul(STN, 1.04), seed=8), 'finial')
    return A, dict(body={}, window_glow=dict(emission=LAMP))

# ================================================================== 5. mini torii (decor.js miniTorii: gate w 0.62 h 0.85, two kitsune)
VERM = '#e2573a'; VERM_HI = '#f4805a'; VERM_LO = '#b23e2c'; INK = '#3a2e36'
def lacquer(base=VERM, hi=VERM_HI, lo=VERM_LO):
    return lambda p, n: mix(base, hi, smooth(0.2, 1.0, n.z) * 0.7) if n.z >= 0 else mix(base, lo, clamp(-n.z) * 0.8)

def kitsune(A, OB, sx):
    """a toy stone fox: plinth, sitting body, big head with a snout, red-lined ears, red eyes, bushy tail, red bib"""
    W = '#fbf2e6'; W_LO = '#d8cdc6'
    wc = lambda p, n: mix(W, W_LO, clamp(-n.z) * 0.6 + (1 - smooth(0.0, 0.2, p.z)) * 0.0)
    A.add(OB, 'body', rbox((0.16, 0.16, 0.085), r=0.022, M=M_at((0, 0, 0.0425))), stone_col(mul(STN, 1.02), seed=60 + sx), 'fox_plinth')
    z0 = 0.085
    A.add(OB, 'body', ellipsoid(Vector((0, 0.012, z0 + 0.075)), (0.058, 0.062, 0.078), K=9, J=5), wc, 'fox')
    for px in (-1, 1):
        A.add(OB, 'body', ellipsoid(Vector((px * 0.026, -0.04, z0 + 0.02)), (0.02, 0.028, 0.02), K=6, J=3), wc, 'fox')
    A.add(OB, 'body', ellipsoid(Vector((0, -0.03, z0 + 0.118)), (0.048, 0.03, 0.036), K=8, J=3), lacquer('#e04a3a', '#f47a5a', '#a83426'), 'fox_bib')
    hz = z0 + 0.19
    A.add(OB, 'body', ellipsoid(Vector((0, -0.008, hz)), (0.054, 0.05, 0.05), K=9, J=5), wc, 'fox')
    A.add(OB, 'body', ellipsoid(Vector((0, -0.055, hz - 0.012)), (0.026, 0.04, 0.024), K=7, J=3), wc, 'fox')
    A.add(OB, 'body', ellipsoid(Vector((0, -0.094, hz - 0.006)), (0.011, 0.009, 0.009), K=5, J=2), lambda p, n: mul(INK, 1.0), 'fox_face')
    for px in (-1, 1):
        ear = ellipsoid(Vector((0, 0, 0)), (0.018, 0.011, 0.036), K=6, J=3)
        ear.xform(M_at((px * 0.028, 0.002, hz + 0.052), ry=px * 0.3))
        A.add(OB, 'body', ear, lambda p, n: '#ff8a8a' if n.y < -0.4 else W, 'fox')
        eye = ellipsoid(Vector((0, 0, 0)), (0.013, 0.005, 0.006), K=5, J=2)
        eye.xform(M_at((px * 0.022, -0.05, hz + 0.012), ry=px * 0.4))
        A.add(OB, 'body', eye, lambda p, n: '#d8382e', 'fox_face')
    tail = [Vector((0, 0.06, z0 + 0.03)), Vector((-sx * 0.02, 0.09, z0 + 0.09)), Vector((-sx * 0.026, 0.092, z0 + 0.16)), Vector((-sx * 0.012, 0.075, z0 + 0.22))]
    A.add(OB, 'body', tube_lite(tail, lambda s: 0.026 + 0.012 * math.sin(math.pi * min(1, s * 1.2)), K=7),
          lambda p, n: mix(W, '#ffd8a0', smooth(z0 + 0.17, z0 + 0.21, p.z)), 'fox_tail')

def build_miniTorii():
    A = Asset(); OB = 'miniTorii'; rng = random.Random(61)
    # the bed: a mossy mortar slab (buried skirt) and six flagstones with moss in the joints
    A.add(OB, 'body', rbox((0.9, 0.7, 0.36), r=0.03, M=M_at((0, 0, -0.13))),
          lambda p, n: mix(mul(STN, 0.85), MOSS, 0.85) if n.z > 0.5 else stone_col(mul(STN, 0.88), seed=62)(p, n), 'bed')
    FS = ['#cfc4c2', '#c4b8be', '#d8cec6', '#bfb4bc']
    for i in range(3):
        for j in range(2):
            x = -0.3 + i * 0.3 + rng.uniform(-0.006, 0.006); y = -0.175 + j * 0.35 + rng.uniform(-0.006, 0.006)
            A.add(OB, 'body', rbox((0.27 + rng.uniform(-0.01, 0.0), 0.32 + rng.uniform(-0.01, 0.0), 0.045), r=0.016,
                                   M=M_at((x, y, 0.05 + 0.006 + rng.uniform(-0.003, 0.003)), rz=rng.uniform(-0.03, 0.03))),
                  stone_col(FS[(i + j) % 4], STN_HI, STN_LO, ao_z=0.04, ao_h=0.03, seed=63 + i * 2 + j), 'flags')
    TZ = 0.075; w = 0.62; h = 0.85; pr = 0.09; TY = -0.05
    for sx in (-1, 1):
        post = lathe([(0, TZ), (pr * 1.02, TZ), (pr * 0.94, TZ + h * 0.6), (pr * 0.88, TZ + h + 0.02), (0, TZ + h + 0.02)], 10,
                     off=lambda z, sx=sx: (-sx * 0.03 * (z - TZ), 0.0))
        post.xform(Matrix.Translation((sx * w / 2, TY, 0)))
        A.add(OB, 'body', post, lacquer(), 'posts')
        base = lathe([(0, TZ - 0.01), (pr * 1.42, TZ - 0.01), (pr * 1.45, TZ + 0.15), (pr * 1.3, TZ + 0.2), (pr * 1.1, TZ + 0.21), (0, TZ + 0.21)], 10)
        base.xform(Matrix.Translation((sx * w / 2, TY, 0)))
        A.add(OB, 'body', base, lambda p, n: mix(INK, '#5c4c58', smooth(0.2, 1.0, n.z) * 0.8), 'bases')
    zn = TZ + h * 0.78
    A.add(OB, 'body', rbox((w + pr * 4.5, 0.1, 0.1), r=0.026, M=M_at((0, TY, zn))), lacquer(), 'nuki')
    L = w + pr * 8
    def beam(dz, hd, hh, colf, tag):
        path = [Vector((t * L / 2, TY, TZ + h + 0.1 + dz + abs(t) ** 2.6 * 0.2)) for t in [-1 + 2 * k / 12 for k in range(13)]]
        prof = [(-hd, -hh * 0.6), (-hd * 0.75, -hh), (hd * 0.75, -hh), (hd, -hh * 0.6), (hd, hh * 0.6), (hd * 0.75, hh), (-hd * 0.75, hh), (-hd, hh * 0.6)]
        A.add(OB, 'body', sweep(path, prof, inset=0.25, cap_d=0.014), colf, tag)
    beam(0.0, 0.07, 0.045, lambda p, n: mix(INK, '#6a5866', smooth(0.3, 1.0, n.z) * 0.8), 'kasagi')
    beam(-0.085, 0.06, 0.036, lacquer(), 'shimaki')
    A.add(OB, 'body', rbox((0.05, 0.06, 0.16), r=0.015, M=M_at((0, TY, (zn + TZ + h + 0.015) / 2))), lacquer(), 'gaku')
    gz = (zn + TZ + h + 0.02) / 2
    A.add(OB, 'body', rbox((0.17, 0.04, 0.21), r=0.016, M=M_at((0, TY - 0.04, gz))), lambda p, n: mix(INK, '#5c4c58', 0.3), 'gaku')
    A.add(OB, 'body', rbox((0.12, 0.02, 0.155), r=0.01, M=M_at((0, TY - 0.06, gz))), lambda p, n: mix('#e8b040', '#ffd870', smooth(0.0, 1.0, -n.y) * 0.4), 'gaku')
    cc = Vector((0, TY - 0.072, gz))
    A.add(OB, 'body', blossom(cc, -Y, 0.042, 0.31, per=3, notch=0.45, cup=0.0, dome=0.2), lambda p, n: mix('#c8402e', VERM, smooth(0.006, 0.014, (p - cc).length)), 'gaku')
    # a little shimenawa between the posts under the nuki, three zigzag shide
    rope = [Vector((-w / 2 + 0.07 + (w - 0.14) * k / 8, TY - 0.012, zn - 0.09 - 0.045 * math.sin(math.pi * k / 8))) for k in range(9)]
    A.add(OB, 'body', tube_lite(rope, lambda s: 0.024 - 0.006 * abs(s - 0.5), K=6),
          lambda p, n: mix(STRAW_DK, STRAW, 0.5 + 0.5 * math.sin(p.x * 60)), 'shimenawa')
    for k in (2, 4, 6):
        p0 = rope[k]
        for j in range(2):
            A.add(OB, 'body', rbox((0.04, 0.012, 0.05), r=0.004, M=M_at(p0 + Vector((0.012 if j else -0.006, -0.002, -0.045 - j * 0.045)))), PAPER, 'shide')
    for sx in (-1, 1):
        kitsune(XA(A, M_at((sx * 0.3, 0.24, 0.07), rz=sx * 0.35)), OB, sx)
    cup = lathe([(0, 0.07), (0.022, 0.07), (0.032, 0.105), (0.028, 0.108), (0, 0.098)], 10); cup.xform(Matrix.Translation((0, 0.2, 0)))
    A.add(OB, 'body', cup, lambda p, n: '#a8d8f0' if n.z > 0.8 and p.z > 0.095 else '#fff6ea', 'cup')
    return A, dict(body={})

# ================================================================== 6. koi statue (decor.js koiStatue: lobed pedestal, pool, splash crown, leaping koi)
def build_koiStatue():
    A = Asset(); OB = 'koiStatue'; rng = random.Random(71)
    prof = [(0, -0.3), (0.36, -0.3), (0.385, 0.0), (0.4, 0.05), (0.37, 0.085), (0.31, 0.11), (0.3, 0.14), (0.28, 0.2), (0.274, 0.25), (0.27, 0.3),
            (0.27, 0.35), (0.274, 0.4), (0.28, 0.44), (0.3, 0.46), (0.34, 0.5), (0.33, 0.535), (0, 0.535)]
    def ped_r(r, z, th):
        k = 0.975 + 0.025 * abs(math.cos(4 * th)) ** 0.5
        wave = 0.012 * math.sin(th * 8 + z * 30) * smooth(0.22, 0.26, z) * (1 - smooth(0.4, 0.44, z))
        return r * k + wave
    def ped_col(p, n):
        c = stone_col(STN, STN_HI, STN_LO, ao_z=0.0, ao_h=0.06, seed=72)(p, n)
        if 0.24 < p.z < 0.42:
            th = math.atan2(p.y, p.x); w_ = math.sin(th * 8 + p.z * 30) * 0.5 + 0.5
            c = mix(c, '#8ab0c8', 0.3 * w_)
        if p.z < 0.1 and n.z > 0.3: c = mix(c, MOSS, 0.65)
        return c
    A.add(OB, 'body', lathe(prof, 24, rfn=ped_r), ped_col, 'pedestal')
    A.add(OB, 'water', lathe([(0, 0.53), (0.305, 0.53), (0.305, 0.565), (0, 0.572)], 16), '#6ac4e4', 'pool')
    # the splash crown: a ring of water flaring up round the koi into eight points
    loop = [(0.2, 0.55), (0.17, 0.6), (0.19, 0.67), (0.26, 0.73), (0.29, 0.75), (0.25, 0.745), (0.17, 0.675), (0.15, 0.6), (0.16, 0.55)]
    K = 24; rings = []; cs = []
    for r, z in loop:
        ring = []
        for k in range(K):
            th = TAU * k / K + 0.13
            zz = z + (0.07 * abs(math.cos(4 * th)) ** 4 * clamp((z - 0.66) * 12) if z > 0.66 else 0.0)
            ring.append(Vector((math.cos(th) * r, math.sin(th) * r, zz)))
        rings.append(ring); cs.append(Vector((0, 0, z)))
    ct = Tmp(); ring_surface(ct, rings, cs, closed=True)
    A.add(OB, 'body', ct, lambda p, n: mix('#62bce0', '#eef9ff', smooth(0.62, 0.78, p.z)), 'splash')
    for k in range(8):
        a = k / 8 * TAU + 0.13
        A.add(OB, 'body', ellipsoid(Vector((math.cos(a) * 0.33, math.sin(a) * 0.33, 0.87 + (k % 2) * 0.03)), (0.022, 0.022, 0.03), K=5, J=3), '#f0faff', 'drops')
    for i in range(4):
        a = i * 1.7 + 0.4; d = rng.uniform(0.13, 0.22)
        A.add(OB, 'body', ellipsoid(Vector((math.cos(a) * d, math.sin(a) * d, 0.585)), (0.035, 0.035, 0.026), K=6, J=3), '#f4fbff', 'foam')
    # the leaping koi (kit path: rising from the pool, arching toward the front)
    Rk = [0.028, 0.05, 0.078, 0.104, 0.124, 0.132, 0.13, 0.12, 0.103, 0.078]
    def kp(t): return Vector((0, 0.13 - 0.19 * math.sin(t * math.pi * 0.9) + 0.02 * t, 0.62 + t * 0.64))
    path = [kp(i / 11) for i in range(12)]
    def rad(s):
        x = s * (len(Rk) - 1); i = min(int(x), len(Rk) - 2); f = x - i
        return Rk[i] + (Rk[i + 1] - Rk[i]) * f
    body = tube(path, rad, K=10, up=X)
    body.v = [Vector((v.x * 0.86, v.y, v.z)) for v in body.v]; body.n = [None] * len(body.v)
    def koi_col(p, n):
        c = '#fff8ee'
        g = vnoise(Vector((p.x * 0.6, p.y, p.z)), 5.5, 7) + (0.08 if n.x > 0 else -0.04)
        if g > 0.52: c = mix('#ff7a3a', '#ff9a56', smooth(0.0, 1.0, n.z) * 0.4)
        if p.z > 1.12 and n.y > -0.2: c = '#ff6630'                                     # the tancho cap
        return mul(c, 0.9 + 0.12 * clamp(n.dot(LDIR) * 0.5 + 0.5))
    A.add(OB, 'body', body, koi_col, 'koi')
    head = kp(8 / 9); tailp = kp(0.0); midp = kp(6 / 9); dors = kp(5 / 9)
    for sx in (-1, 1):
        A.add(OB, 'body', ellipsoid(Vector((sx * 0.08, head.y - 0.05, head.z + 0.035)), (0.018, 0.034, 0.034), K=8, J=4), lambda p, n: INK, 'koi_eye')
        A.add(OB, 'body', ellipsoid(Vector((sx * 0.093, head.y - 0.07, head.z + 0.05)), (0.006, 0.01, 0.01), K=5, J=2), '#fff6ea', 'koi_eye')
        fin = ellipsoid(Vector((0, 0, 0)), (0.016, 0.07, 0.095), K=7, J=3)
        fin.xform(M_at((sx * 0.115, midp.y - 0.03, midp.z - 0.07), rx=-0.5, ry=sx * 0.75))
        A.add(OB, 'body', fin, lambda p, n: mix('#ffb080', '#ffd0b0', smooth(0.0, 1.0, n.z) * 0.5), 'koi_fin')
    tip = kp(1.0); td = (tip - kp(0.94)).normalized(); mu = X; mv = td.cross(mu).normalized()
    mc = tip + td * 0.07
    mouth = [mc + mu * (math.cos(TAU * k / 8) * 0.03) + mv * (math.sin(TAU * k / 8) * 0.022) for k in range(8)]
    A.add(OB, 'body', tube_loop(mouth, lambda s: 0.013, K=5, up=td), '#ff9a80', 'koi_mouth')
    dfin = ellipsoid(Vector((0, 0, 0)), (0.012, 0.11, 0.06), K=7, J=3); dfin.xform(M_at((0, dors.y + 0.11, dors.z), rx=0.9))
    A.add(OB, 'body', dfin, lambda p, n: '#ff8a5a', 'koi_fin')
    for sy in (-1, 1):
        lobe = ellipsoid(Vector((0, 0, 0)), (0.014, 0.055, 0.11), K=7, J=3)
        lobe.xform(M_at((0, tailp.y - sy * 0.07, tailp.z - 0.07), rx=sy * 0.5 + 0.2))
        A.add(OB, 'body', lobe, lambda p, n: mix('#ff7a3a', '#ffb08a', smooth(0.6, 0.5, p.z)), 'koi_tail')
    for i in range(4):     # the kit's four little bushes round the foot (two with pink flowers)
        a = i * 1.6 + 0.3; c = Vector((math.cos(a) * 0.42, -math.sin(a) * 0.42, 0.0))
        clump(A, OB, c, 0.09, seed=73 + i, tiers=((5, 0.4, 1.0), (3, 1.0, 0.8)))
        if i % 2:
            for j, d in enumerate(fib_dirs(3, zmin=0.3, seed=i)):
                pc = c + Vector((0, 0, 0.09)) + d * 0.05
                A.add(OB, 'body', blossom(pc, d.lerp(CAMV, 0.4).normalized(), 0.03, j, per=3, notch=0.36, cup=0.3, dome=0.3),
                      lambda q, n, pc=pc: mix('#ffd24a', '#ff8fb0', smooth(0.005, 0.011, (q - pc).length)), 'flowers')
    return A, dict(body={}, water={})

# ================================================================== 7. lantern string (decor.js lanternString: posts at x +-0.9, h 1.9; the lanterns are the game's)
def build_lanternString():
    A = Asset(); OB = 'lanternString'; rng = random.Random(81)
    hP = 1.9
    tc = timber_col(seed=81)
    for x in (-0.9, 0.9):
        sg = 1 if x > 0 else -1
        def T(t): t.xform(Matrix.Translation((x, 0, 0))); return t
        A.add(OB, 'body', T(lathe([(0, 0.1), (0.058, 0.1), (0.052, hP), (0, hP)], 8, th0=0.3)), tc, 'posts')
        A.add(OB, 'body', T(lathe([(0, -0.3), (0.13, -0.3), (0.145, 0.0), (0.135, 0.09), (0.1, 0.13), (0, 0.135)], 9,
                                  rfn=lambda r, z, th: r * (1 + 0.05 * math.sin(3 * th + x)))),
              lambda p, n: mix(stone_col(seed=82)(p, n), MOSS, smooth(0.6, 0.9, n.z) * 0.7 * (0.5 + vnoise(p, 9, 3))), 'base')
        A.add(OB, 'body', T(lathe([(0, 0.12), (0.085, 0.12), (0.08, 0.19), (0.066, 0.205), (0, 0.205)], 9)), stone_col(mul(STN, 1.04), seed=83), 'base')
        for zb in (0.45, hP - 0.25):
            A.add(OB, 'body', T(lathe([(0, zb), (0.064, zb), (0.066, zb + 0.018), (0.064, zb + 0.036), (0, zb + 0.036)], 8)),
                  lambda p, n: mul(IRON, 0.9 + 0.35 * clamp(abs(n.z) + 0.3)), 'bands')
        wr = [(0, hP - 0.13)] + [(0.062 if k % 2 == 0 else 0.056, hP - 0.13 + 0.015 * k) for k in range(5)] + [(0, hP - 0.06)]
        A.add(OB, 'body', T(lathe(wr, 8)), lambda p, n: mix(STRAW_DK, STRAW, smooth(-0.2, 0.8, n.z)), 'wraps')
        A.add(OB, 'body', T(lathe([(0, hP - 0.012), (0.066, hP - 0.005), (0.076, hP + 0.04), (0.046, hP + 0.095), (0.014, hP + 0.14), (0, hP + 0.16)], 10)),
              lambda p, n: mix('#d8a040', '#ffd870', smooth(0.0, 1.0, n.z) * 0.6), 'giboshi')
        hook = [Vector((x - sg * 0.065 + math.cos(TAU * k / 8) * 0.022, 0, hP - 0.08 + math.sin(TAU * k / 8) * 0.022)) for k in range(8)]
        A.add(OB, 'body', tube_loop(hook, lambda s: 0.008, K=4, up=Y), IRON, 'hook')
    rope = [Vector((-0.87 + 1.74 * k / 16, 0, hP - 0.08 - math.sin(math.pi * k / 16) * 0.22)) for k in range(17)]
    A.add(OB, 'body', tube_lite(rope, lambda s: 0.015, K=6), lambda p, n: mix('#5a4040', '#8a6a5a', 0.5 + 0.5 * math.sin(p.x * 40)), 'rope')
    for i in range(5):     # a knot where each of the game's lanterns hangs
        t = (i + 0.5) / 5
        A.add(OB, 'body', ellipsoid(Vector((-0.9 + 1.8 * t, 0, hP - 0.08 - math.sin(t * math.pi) * 0.22 - 0.006)), (0.022, 0.02, 0.024), K=6, J=3),
              '#c84a3a', 'knots')
    A.add(OB, 'body', cushion(Vector((-0.78, -0.12, 0.0)), 0.08, 0.06, seed=4, K=8, lobes=3, amp=0.1), moss_col(5), 'moss')
    clump(A, OB, Vector((0.78, -0.13, 0.0)), 0.12, seed=84, tiers=((6, 0.35, 1.0), (5, 0.8, 0.9), (3, 1.2, 0.75)))
    return A, dict(body={})

# ================================================================== 8. sprinkler (gardenModels.js sprinkler: the spinning head is the game's)
def build_sprinkler():
    A = Asset(); OB = 'sprinkler'; rng = random.Random(91)
    A.add(OB, 'body', lathe([(0, -0.3), (0.29, -0.3), (0.31, 0.0), (0.305, 0.07), (0.285, 0.1), (0, 0.1)], 16),
          stone_col(mul(STN, 0.95), ao_z=0.0, ao_h=0.04, seed=91), 'base')
    ring = [Vector((math.cos(TAU * k / 20) * 0.27, math.sin(TAU * k / 20) * 0.27, 0.112)) for k in range(20)]
    A.add(OB, 'body', tube_loop(ring, lambda s: 0.032, K=7), stone_col('#8a8096', '#b4aabc', '#5a5068', seed=92), 'ring')
    A.add(OB, 'body', lathe([(0, 0.09), (0.25, 0.09), (0.245, 0.118), (0.15, 0.136), (0, 0.142)], 14),
          lambda p, n: mul(mix('#7cae58', '#a4cc72', smooth(0.5, 1.0, n.z) * 0.6), 0.92 + 0.12 * vnoise(p, 12, 4)), 'grass')
    for i in range(4):
        a = i * TAU / 4 + 0.6
        clump(A, OB, Vector((math.cos(a) * 0.17, math.sin(a) * 0.17, 0.12)), 0.05, seed=93 + i, tiers=((4, 0.9, 1.0),))
    brass = lambda p, n: mix('#c88a38', '#f2c46a', smooth(0.0, 1.0, n.z * 0.6 + n.dot(LDIR) * 0.4) * 0.8)
    A.add(OB, 'body', lathe([(0, 0.12), (0.052, 0.12), (0.052, 0.15), (0.035, 0.165), (0.032, 0.45), (0.04, 0.46), (0.04, 0.49), (0.03, 0.5), (0, 0.5)], 10), brass, 'riser')
    # a little red valve wheel on the front
    stub = lathe([(0, 0.0), (0.014, 0.0), (0.014, 0.05), (0, 0.05)], 6); stub.xform(M_at((0, -0.03, 0.3), rx=math.pi / 2))
    A.add(OB, 'body', stub, brass, 'valve')
    wheel = [Vector((math.cos(TAU * k / 10) * 0.036, -0.082, 0.3 + math.sin(TAU * k / 10) * 0.036)) for k in range(10)]
    red = lambda p, n: mix('#d84a3a', '#f47a5a', smooth(0.0, 1.0, n.z) * 0.5)
    A.add(OB, 'body', tube_loop(wheel, lambda s: 0.009, K=5, up=Y), red, 'valve')
    for a in (0.0, math.pi / 2):
        A.add(OB, 'body', rbox((0.072, 0.012, 0.012), r=0.004, M=M_at((0, -0.082, 0.3), ry=a)), red, 'valve')
    A.add(OB, 'body', ellipsoid(Vector((0, 0, 0.54)), (0.05, 0.05, 0.05), K=10, J=5), brass, 'joint')
    return A, dict(body={})

# ================================================================== 9. pocket park (services.js park, 3x3)
def build_park():
    A = Asset(); OB = 'park'; rng = random.Random(101)
    G0 = 0.05                               # the kit's props stand at y 0.05 on the 6 cm lawn
    LAWN = '#86c45e'
    A.add(OB, 'body', rbox((2.8, 2.8, 0.36), r=0.045, M=M_at((0, 0, -0.12))),
          lambda p, n: mix(mul(LAWN, 0.8), mix(LAWN, '#a4d878', 0.35), smooth(0.3, 1.0, n.z)) if n.z > -0.5 else mul(LAWN, 0.6), 'lawn')
    # the pond, front right (kit centre (0.55, 0.5)); the game swaps its animated water onto the `water` surface
    px, py = 0.55, -0.5
    pond = lathe([(0, 0.03), (1.0, 0.03), (1.0, 0.082), (0, 0.086)], 24, sx=0.74, sy=0.56); pond.xform(Matrix.Translation((px, py, 0)))
    A.add(OB, 'water', pond, '#5ab8d8', 'pond')
    PS = ['#c4bac4', '#d6ccc6', '#b4aab8', '#cdc2bc', '#bcb0c0']
    for i in range(14):
        a = i / 14 * TAU + rng.uniform(-0.08, 0.08)
        st = ellipsoid(Vector((0, 0, 0)), (0.13 * rng.uniform(0.85, 1.15), 0.105 * rng.uniform(0.85, 1.15), 0.075), K=7, J=3)
        st.v = [v * (1 + 0.1 * (vnoise(v, 11, i) - 0.5) * 2) for v in st.v]
        st.xform(M_at((px + math.cos(a) * 0.78, py - math.sin(a) * 0.6, 0.075), rz=rng.uniform(0, 3)))
        sc = stone_col(PS[i % 5], mul(PS[i % 5], 1.1), STN_LO, seed=110 + i)
        mo = i % 3 == 0
        A.add(OB, 'body', st, lambda p, n, sc=sc, mo=mo: mix(sc(p, n), MOSS, smooth(0.6, 0.85, n.z) * (0.8 if mo else 0.0)), 'pond_stones')
    for i, (dx, dy, r) in enumerate([(-0.25, 0.1, 0.1), (0.05, -0.12, 0.09), (0.3, 0.12, 0.08)]):
        A.add(OB, 'body', lily(Vector((px + dx, py + dy, 0.088)), r, i * 2.1), lambda p, n: mix('#5aa848', '#8ccc66', smooth(0.0, 1.0, n.z) * 0.6), 'lily')
    lc = Vector((px + 0.2, py + 0.1, 0.1))
    for j, (rr, cupv) in enumerate([(0.055, 0.35), (0.038, 0.6)]):
        A.add(OB, 'body', blossom(lc + Vector((0, 0, 0.008 * j)), Z, rr, j * 0.6, per=3, notch=0.2, cup=cupv, dome=0.25),
              lambda q, n: mix('#ffd24a', '#ff9ec0', smooth(0.006, 0.014, (q - lc).length)), 'lotus')
    for i, (dx, dy, a, c) in enumerate([(-0.05, 0.22, 0.4, '#ff8a3a'), (0.2, -0.2, 2.3, '#fff6ea')]):
        k0 = Vector((px + dx, py + dy, 0.084))
        kb = ellipsoid(Vector((0, 0, 0)), (0.085, 0.032, 0.024), K=8, J=3); kb.xform(M_at(k0, rz=a))
        A.add(OB, 'body', kb, lambda p, n, c=c, k0=k0: mix(c, '#ff6a2a' if c == '#fff6ea' else '#fff6ea', 0.6 if math.sin((p - k0).length * 60) > 0.4 else 0.0), 'koi')
        tl = ellipsoid(Vector((0, 0, 0)), (0.03, 0.03, 0.01), K=6, J=2); tl.xform(M_at(k0 + Vector((-math.cos(a) * 0.1, -math.sin(a) * 0.1, 0.0)), rz=a))
        A.add(OB, 'body', tl, c, 'koi')
    # the sakura, back left (kit tree s 0.7 = the planter's x 1.207)
    sakura_tree(XA(A, Matrix.Translation((-0.75, 0.7, G0)) @ Matrix.Scale(0.7 / 0.58, 4) @ Matrix.Translation((0, 0, -0.39))), OB, random.Random(102),
                n_out=12, n_core=4, mids=False, falling=2)
    # benches: back right facing front; left side facing the pond
    bench_lite(XA(A, M_at((0.55, 0.85, G0))), OB, 1.0)
    bench_lite(XA(A, M_at((-1.0, -0.55, G0), rz=math.pi / 2)), OB, 0.9)
    # the toro (kit toro s 0.55), left
    lantern_parts(XA(A, Matrix.Translation((-1.15, 0.15, G0)) @ Matrix.Scale(0.55 / 1.15, 4)), OB, lite=True)
    # flower beds, step stones to the front path, a flowering bush front right
    for (cx, cy, w, d, n, cols, sd) in [(-0.2, -1.0, 0.7, 0.35, 6, FLOWER_COLS, 120), (1.15, 0.2, 0.35, 0.7, 5, ['#ffbcd6', '#fff6ea', '#c8a8ff'], 130)]:
        bed = lathe([(0, 0.0), (1.0, 0.0), (0.8, 0.06), (0, 0.085)], 12, sx=w / 2 + 0.04, sy=d / 2 + 0.04); bed.xform(Matrix.Translation((cx, cy, G0 - 0.01)))
        A.add(OB, 'body', bed, lambda p, n: mul(SOIL, 0.88 + 0.14 * vnoise(p, 10, 5)), 'beds')
        rb = random.Random(sd)
        for i in range(n):
            fx = cx + (rb.uniform(-0.38, 0.38) * w); fy = cy + (rb.uniform(-0.38, 0.38) * d)
            flower_tuft(A, OB, Vector((fx, fy, G0 + 0.04)), cols[i % len(cols)], sd + i)
    for i in range(4):
        t = (i + 0.5) / 4
        sx_, sy_ = -0.3 + 0.1 * t + rng.uniform(-0.05, 0.05), -1.3 + 1.6 * t + rng.uniform(-0.04, 0.04)
        stn = lathe([(0, 0.02), (0.2, 0.02), (0.21, 0.05), (0.17, 0.072), (0, 0.078)], 9, sx=1.15,
                    rfn=lambda r, z, th, i=i: r * (1 + 0.08 * math.sin(3 * th + i) + 0.05 * math.sin(5 * th + 2 * i)), th0=rng.uniform(0, 3))
        stn.xform(M_at((sx_, sy_, G0 - 0.02), rz=rng.uniform(0, 3)))
        A.add(OB, 'body', stn, stone_col(PS[i % 5], STN_HI, STN_LO, seed=140 + i), 'step_stones')
    bc = Vector((1.2, -1.2, G0))
    clump(A, OB, bc, 0.2, seed=150)
    for j, d in enumerate(fib_dirs(4, zmin=0.3, seed=5)):
        pc = bc + Vector((0, 0, 0.16)) + d * 0.1
        A.add(OB, 'body', blossom(pc, d.lerp(CAMV, 0.4).normalized(), 0.045, j, per=3, notch=0.36, cup=0.3, dome=0.3),
              lambda q, n, pc=pc: mix('#ffd24a', '#ff8fb0', smooth(0.007, 0.015, (q - pc).length)), 'flowers')
    return A, dict(body={}, water={}, window_glow=dict(emission=LAMP))
FLOWER_COLS = ['#ff8fb0', '#ffd24a', '#fff6ea', '#c8a8ff', '#ff6f7f', '#ffb86a', '#8fc8ff']

BUILDS = dict(stoneLantern=build_stoneLantern, bench=build_bench, sakuraPlanter=build_sakuraPlanter, streetLamp=build_streetLamp,
              miniTorii=build_miniTorii, koiStatue=build_koiStatue, lanternString=build_lanternString, sprinkler=build_sprinkler, park=build_park)
for name, fn in BUILDS.items():
    if PIECE not in ('all', name): continue
    A, mats = fn()
    export(A, name, mats)
print('HD done')
