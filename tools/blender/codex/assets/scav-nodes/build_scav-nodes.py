# PAWHAVEN: the 21 scavenging nodes, each with a full and a taken look (task scav-nodes), built in Blender by script.
#   blender --background --factory-startup --python build_scav-nodes.py -- --piece <model|model-full|all>[,<...>]
# Writes D:/projects/chewy-life-3d/public/models/prop-scav-<model>-<full|taken>.glb: one mesh, one material 'body', vertex colours,
# ground at y = 0, the kit's origin and size. Budget: full <= 1500 tris, taken <= 900. Deterministic (fixed seeds).
# The rule for a pair: the full and the taken look share their non-goods verbatim (the bed, the base stone, the stump, the
# shell in the sand), so a node stays the same object in the same place with the goods gone.
import bpy, os, sys, math, random, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, 'scav_kit.py'), encoding='utf-8').read(), 'scav_kit.py', 'exec'))
MODELS_DIR = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', 'public', 'models'))
print('SCV pid', os.getpid())

# ---- wood palettes (the kit's hues, a wider value range)
WOOD_PALE = dict(bark='#c4ae8a', hi='#f6ead2', end='#f6ead2', ring='#b89a72', lip='#dcc8a4')
WOOD_PALE2 = dict(WOOD_PALE, bark='#b8a27e', hi='#ecdcbc')
BAMBOO_DRY = dict(bark='#b89c4c', hi='#f6e6a8', end='#fbf0c8', ring='#c0a060')
BAMBOO_DRY2 = dict(BAMBOO_DRY, bark='#a89e48', hi='#ece49c')
BAMBOO = dict(bark='#6f9e3e', hi='#cfe680', end='#f6eebc', ring='#c8b878')
MAPLE_BARK = dict(bark='#6a4632', hi='#b08468', end='#eccb9c', ring='#ac7c58', lip='#c89c74')
SEA_WOOD = dict(bark='#a8a49c', hi='#f6f2ea', end='#ece4d6', ring='#a8a090', lip='#d8d2c6')
PINE_BARK = dict(bark='#6a4e3c', hi='#a08068', end='#eccb9c', ring='#ac7c58', lip='#c89c74')
MAPLE_COLS = ['#e8483a', '#f0703a', '#ff9a4a', '#d8383a', '#ffc04a', '#f05a3a']
SNOW = ('#c4d2ea', '#f8fbff')
RED_BOW = dict(lo='#b42a2a', hi='#ff6a54')

def snow_paint(seed=0):
    def p(q, n, m):
        c = mix(SNOW[0], SNOW[1], clamp(n.y * 1.25 - 0.08))
        c = mix(c, '#eef3fb', sstep(0.05, 0.0, q.y))     # (the foot melts into the snow it sits on)
        return mul(c, 0.98 + 0.04 * nz(q, 7.0, (seed, 1, 2)))
    return p

def ribbon_col(q, n, m): return mix(RED_BOW['lo'], RED_BOW['hi'], clamp(n.y * 0.6 + 0.42))

def bow(A, p, r, axis):
    """a red ribbon tied round a log: a broad band, two plump loops, two swallow tails, the knot (the kit's signature here; chunky enough for 20 m)"""
    ax = axis.normalized(); sd = ax.cross(UP).normalized()
    w = 0.036
    M = Matrix.Translation(p) @ UP.rotation_difference(ax).to_matrix().to_4x4()
    band = lathe([(r * 0.98, -w), (r * 1.05, -w * 0.7), (r * 1.05, w * 0.7), (r * 0.98, w)], 12, M=M, ao=0.6); band.orient()
    A.add(band, ribbon_col)
    top = p + UP * (r + 0.02)
    for s in (-1, 1):
        # a loop: a plump teardrop lying out along the log, a dark fold where it meets the knot
        q0 = top + ax * s * 0.02 + UP * 0.012
        rows = []
        pr = [(0.0, 0.015, 0.012), (0.03, 0.034, 0.03), (0.075, 0.05, 0.045), (0.12, 0.054, 0.05), (0.158, 0.038, 0.04), (0.175, 0.012, 0.016)]
        K = 7
        for t, wy, wz in pr:
            rows.append([q0 + ax * s * t + UP * (t * 0.2) + UP * math.cos(TAU * k / K) * wy + sd * math.sin(TAU * k / K) * (wz + 0.012) for k in range(K)])
        S = Shell(0.5); grid(S, rows, True, meta=lambda i, j: i); S.orient()
        A.add(S, lambda q, n, m: mul(ribbon_col(q, n, m), 0.72 if m == 0 else (0.88 if m == 1 else 1.0)))
        tail = [top + sd * 0.03 * s + ax * s * 0.02, top + sd * (r * 0.66) + ax * s * 0.055 - UP * (r * 0.2), top + sd * (r * 1.0) + ax * s * 0.085 - UP * (r * 0.72), top + sd * (r * 1.12) + ax * s * 0.1 - UP * (r * 1.4)]
        strap(A, tail, lambda t: 0.028 + 0.008 * t, ribbon_col, th=0.012, up=sd + UP)
    A.add(blob(top + UP * 0.016, 0.036, (1.15, 0.95, 1.05), 1, ao=0.2), lambda q, n, m: mix('#a82828', '#f05a48', n.y * 0.5 + 0.5))

# ==================================================================== Blossom Hollow
def driftwood_keep(A):
    """the seaside bits that stay: the pink scallop and the conch"""
    scallop(A, V(-0.5, 0, 0.36), 0.125, 0.6, col='#ffdce0', rib='#f08a98')
    conch(A, V(0.52, 0, 0.32), 0.075, 0.8)

def driftwood_full(A, r):
    driftwood_keep(A)
    a = log(A, V(-0.56, 0.115, -0.13), V(0.5, 0.115, -0.21), 0.122, WOOD_PALE, K=10, n=6, seed=1, bend=0.05)
    b = log(A, V(-0.5, 0.11, 0.13), V(0.54, 0.12, 0.08), 0.116, WOOD_PALE2, K=10, n=6, seed=2, bend=-0.04)
    c = log(A, V(-0.36, 0.3, -0.04), V(0.4, 0.31, -0.06), 0.1, dict(WOOD_PALE, bark='#c2ae8c', hi='#faf0da'), K=10, n=5, seed=3, bend=0.06)
    stub(A, V(0.12, 0.17, 0.2), V(0.5, 0.75, 0.5), 0.15, 0.04, WOOD_PALE2, seed=4)
    stub(A, V(-0.24, 0.33, -0.1), V(-0.4, 0.8, -0.5), 0.14, 0.035, WOOD_PALE, seed=5)
    for x, y, z, nn in ((-0.2, 0.17, -0.25, V(0, 0.2, -1)), (0.3, 0.17, 0.2, V(0, 0.4, 1)), (0.18, 0.4, -0.05, V(0.1, 1, 0.1)), (-0.34, 0.17, 0.235, V(0, 0.3, 1))):
        knot(A, V(x, y, z), nn, 0.032, col='#a08c6a', dark='#5c4834')
    bow(A, V(0.0, 0.335, -0.05), 0.098, V(1, 0.02, -0.03))

def driftwood_taken(A, r):
    driftwood_keep(A)
    log(A, V(-0.21, 0.066, 0.06), V(0.2, 0.07, -0.02), 0.066, WOOD_PALE2, K=8, n=3, seed=5, bend=0.03)
    # the bark and splinters left where the logs lay (the same footprint), a dropped bit of the ribbon
    for x, z, s, c in ((-0.44, -0.2, 0.05, '#c2ae8c'), (0.42, -0.22, 0.045, '#dcc8a4'), (-0.34, 0.2, 0.04, '#ab9270'), (0.36, 0.14, 0.05, '#c2ae8c'), (0.08, -0.26, 0.04, '#dcc8a4'), (-0.06, 0.28, 0.035, '#ab9270'), (0.5, -0.04, 0.035, '#dcc8a4')):
        chip(A, V(x, 0.0, z), s, x * 9 + z * 5, c, tilt=0.5)
    strap(A, [V(-0.36, 0.018, 0.0), V(-0.27, 0.026, -0.1), V(-0.15, 0.022, -0.1), V(-0.09, 0.02, -0.21)], 0.03, ribbon_col, th=0.011)

STONE_BLUE = dict(lo='#65758e', mid='#8fa0b8', hi='#ccd8e6', warm='#b0bac8', foot='#6a7480')
STONE_CREAM = dict(lo='#8a7a68', mid='#c8b8a0', hi='#f4ecdc', warm='#e0ceb4', foot='#7a6e5e')
STONE_SLATE = dict(lo='#566680', mid='#7e8ea8', hi='#b8c6d8', warm='#94a0b2', foot='#5c6470')
STONE_TAN = dict(lo='#7c6e5e', mid='#b4a48e', hi='#e6dcc8', warm='#ccb89c', foot='#6e6456')

def stack_print(col='#dfe6ee', r0=0.2):
    """the dry pale footprint on a base stone: what shows when the upper stones are lifted off"""
    def f(q, n, c):
        return mix(c, col, 0.62 * sstep(r0, r0 * 0.62, math.hypot(q.x - 0.02, q.z + 0.02)) * sstep(0.2, 0.26, q.y))
    return f
def cairn_base(A, pal, seed=11, sm=False, extra=None):
    return stone(A, V(0, 0.13, 0), (0.34, 0.2, 0.2, 0.3), seed=seed, p=2.5 if not sm else 2.1, planes=cuts(seed, 3 if not sm else 2, 0.84, 0.1, 0.76), tris=300, pal=pal, paint_extra=extra)

def riverStone_keep(A, extra=None):
    base = cairn_base(A, STONE_BLUE, extra=extra)
    pebble(A, V(0.46, 0, 0.2), 0.105, 0.62, 21, STONE_TAN, tris=44)
    pebble(A, V(-0.44, 0, -0.2), 0.09, 0.6, 22, STONE_SLATE, tris=36)
    return base

def riverStone_full(A, r):
    base = riverStone_keep(A); y = shell_top(base)
    s = stone(A, V(0.02, y + 0.05, -0.02), (0.235, 0.11, 0.13, 0.205), seed=12, p=2.4, planes=cuts(12, 3, 0.84, 0.1, 0.8), tris=240, pal=STONE_CREAM, ground=-5); y = shell_top(s)
    s = stone(A, V(-0.015, y + 0.038, 0.01), (0.165, 0.09, 0.1, 0.15), seed=13, p=2.3, planes=cuts(13, 3, 0.84, 0.1, 0.8), tris=190, pal=STONE_SLATE, ground=-5); y = shell_top(s)
    stone(A, V(0.012, y + 0.028, 0), (0.105, 0.068, 0.07, 0.095), seed=14, p=2.2, planes=cuts(14, 2, 0.84, 0.12, 0.82), tris=120, pal=STONE_TAN, ground=-5)
    pebble(A, V(0.2, 0, 0.42), 0.08, 0.62, 23, STONE_BLUE, tris=36)
    pebble(A, V(-0.34, 0, 0.32), 0.07, 0.62, 24, STONE_CREAM, tris=30)

def riverStone_taken(A, r):
    riverStone_keep(A, stack_print())

# petals
PETALS = ['#ffc4dc', '#ffb0cc', '#ffe6f0', '#f79cc0', '#fff4f6', '#ff9ec0', '#ffd6e6']
SAKURA_BARK = dict(bark='#5c3e48', hi='#92687a', end='#8a6a60', ring='#6a4a48')
def sakura_sprig(A, a, b, r, k=1.0, nb=5):
    log(A, a, b, 0.024 * k + 0.004, SAKURA_BARK, K=5, n=4, bend=0.1, seed=int(a.x * 10), ridge=0.0, caps=(True, False), wob=0.03)
    d = b - a
    for i, (t, s0) in enumerate(((1, 0.098), (0.76, 0.09), (0.54, 0.084), (0.9, 0.074), (0.66, 0.074), (0.38, 0.07))[:nb]):
        s = s0 * k; q = a + d * t + V((r.random() - 0.5) * 0.08, 0.036 + (r.random() - 0.5) * 0.04, (r.random() - 0.5) * 0.1)
        blossom(A, q, s, V((r.random() - 0.5) * 0.7, 1, (r.random() - 0.5) * 0.7), yaw=r.random() * TAU)
    for t in (0.42, 0.72):
        q = a + d * t; blade(A, q, V(r.uniform(-1, 1), 0.3, r.uniform(-1, 1)), 0.13, 0.04, segs=2, lo='#6fb050', hi='#a8d878', both=False)

def petalDrift_full(A, r):
    R, H, SX = 0.54, 0.24, 1.18
    def bed(q, n, m):
        c = mix('#f4b2cc', '#ffe0ea', n.y * 1.1 - 0.05)
        return mul(c, 0.98 + 0.06 * nz(q, 7.0))
    mound(A, R, H, None, seed=1, sx=SX, noise_=0.12, rings=4, seg=20, bumps=0.12, paint=bed, ao=0.4)
    def hAt(d): return H * max(0.0, 1 - (d / R) ** 2) ** 0.75
    for i in range(80):
        a = r.random() * TAU; d = r.random() ** 0.72 * 0.8; x, z = math.cos(a) * d * SX, math.sin(a) * d
        y = hAt(d) * 0.98 + 0.012 + r.random() * 0.012
        petal(A, V(x, y, z), r.random() * TAU, 0.07 + r.random() * 0.032, PETALS[i % len(PETALS)], 0.9 if d < 0.45 else 0.35, r)
    sakura_sprig(A, V(-0.36, 0.14, 0.1), V(0.28, 0.46, -0.08), r)
    sakura_sprig(A, V(0.1, 0.17, 0.22), V(0.42, 0.28, 0.3), r, 0.8, nb=3)

def petalDrift_taken(A, r):
    # the bed scooped away: a ring of stray petals round the old footprint, a little bare twig with one flower left on it
    cs = ['#ffc4dc', '#ffb0cc', '#f79cc0', '#ffe6f0']
    for i in range(24):
        a = TAU * i / 24 + r.random() * 0.25; d = 0.3 + r.random() * 0.46
        petal(A, V(math.cos(a) * d * 1.18, 0.014, math.sin(a) * d), r.random() * TAU, 0.062 + r.random() * 0.02, cs[i % 4], 0.25, r)
    a, b = V(-0.12, 0.018, 0.1), V(0.15, 0.05, -0.02)
    log(A, a, b, 0.021, SAKURA_BARK, K=5, n=3, bend=0.08, seed=2, ridge=0.0, caps=(True, False), wob=0.03)
    blossom(A, b + V(0, 0.018, 0), 0.075, V(0.2, 1, 0.1), yaw=0.3)

GREENS = ['#4a8a3c', '#5e9e48', '#74b254', '#90c462']
BARK_OLD = dict(bark='#4a3226', hi='#8a6650', end='#caa47c', ring='#8e6a4c')
def mulberry_shared(A, r):
    # the old mulberry: a gnarled short trunk forking into boughs under a domed crown of leaf clusters
    log(A, V(0.0, -0.02, 0.0), V(0.03, 0.3, 0.02), 0.085, BARK_OLD, K=7, n=2, taper=0.8, bend=0.04, seed=1, caps=(False, False))
    log(A, V(0.02, 0.22, 0.02), V(0.3, 0.46, 0.14), 0.04, BARK_OLD, K=5, n=2, bend=0.05, seed=2, caps=(False, False), ridge=0.0)
    log(A, V(0.02, 0.24, 0.0), V(-0.3, 0.44, 0.06), 0.04, BARK_OLD, K=5, n=2, bend=0.05, seed=3, caps=(False, False), ridge=0.0)
    lobes = ((0.0, 0.44, 0.0, 0.4), (0.31, 0.36, 0.14, 0.27), (-0.3, 0.35, 0.09, 0.28), (0.05, 0.64, -0.03, 0.25), (-0.08, 0.34, 0.3, 0.23), (0.12, 0.34, -0.31, 0.24))
    for i, (x, y, z, R) in enumerate(lobes):
        s = blob(V(x, y, z), R * 0.94, (1, 0.86, 1), 2 if i in (0, 3) else 1, jit=0.1, seed=i + 1, ao=0.7)
        A.add(s, lambda q, n, m: mix('#3a6c34', '#5e963e', n.y * 0.5 + 0.5))
    # leaf cards all over the crown, facing out and up, pale above and deep below
    nl = 112
    ga = PI * (3 - math.sqrt(5))
    for i in range(nl):
        L = lobes[i % len(lobes)]; t = (i / nl * 7.13) % 1.0     # (spread over the lobes)
        y0 = 1 - 1.5 * t; rr = math.sqrt(max(0.0, 1 - min(1, y0 * y0))); a = i * ga
        u = V(rr * math.cos(a), y0, rr * math.sin(a))
        p = V(L[0], L[1], L[2]) + V(u.x, u.y * 0.86, u.z) * L[3] * (0.94 + r.random() * 0.1)
        if p.y < 0.09: continue
        o = (p - V(0.0, 0.3, 0.0)).normalized()
        d = (o + V(r.uniform(-0.75, 0.75), r.uniform(-0.3, 0.1), r.uniform(-0.75, 0.75))).normalized()
        k = clamp((p.y - 0.15) / 0.62) * 0.75 + r.random() * 0.25
        lo = mix(GREENS[0], GREENS[2], k); hi = mix(GREENS[1], '#b4dc78', k)
        blade(A, p - d * 0.05, d, 0.23 + r.random() * 0.05, 0.08, up=(o + UP).normalized(), droop=0.3, segs=2, tent=0.2, lo=mul(lo, 0.9), hi=hi, ao=0.5, smid=0.36)
    # mulberries: fat knobbly drupes, dark purple and red
    for x, y, z, c in ((0.26, 0.5, 0.25, '#4a2440'), (-0.2, 0.48, 0.3, '#c8304e'), (0.34, 0.34, 0.32, '#4a2440'), (-0.38, 0.4, 0.22, '#c8304e'), (0.08, 0.7, 0.2, '#4a2440'), (-0.12, 0.66, -0.24, '#4a2440')):
        A.add(blob(V(x, y, z), 0.037, (1, 1.3, 1), 1, ao=0.1), lambda q, n, m, cc=c: mix(mul(cc, 0.8), mix(cc, '#ffffff', 0.25), n.y * 0.6 + 0.5))
def mulberry_full(A, r):
    mulberry_shared(A, r)
    for x, y, z, t in ((0.25, 0.62, 0.3, 0.3), (-0.22, 0.56, 0.36, -0.4), (0.04, 0.86, 0.14, 0.1), (0.44, 0.44, 0.04, 0.6), (-0.42, 0.5, -0.06, -0.5), (0.1, 0.68, -0.3, 0.2)):
        cocoon(A, V(x, y, z), 0.095, tilt=t, yaw=x * 7)
def mulberry_taken(A, r):
    mulberry_shared(A, r)

# ==================================================================== the Bamboo Grove
def culms_keep(A):
    u0, u1 = V(0.72, -0.02, -0.32), V(0.74, 0.56, -0.3)
    culm(A, u0, u1, 0.085, BAMBOO, K=8, nodes=2, seed=4, cut1=0.1, band='#7e9a3c')
    for x, z, a in ((0.56, 0.36, 0.4), (-0.5, 0.34, -0.9), (0.1, 0.4, 2.2), (-0.66, -0.3, 1.4)):
        blade(A, V(x, 0.016, z), V(math.cos(a), 0.0, math.sin(a)), 0.27, 0.058, droop=-0.04, segs=2, lo='#a8924c', hi='#d8c478')
def culms_full(A, r):
    culms_keep(A)
    a0, a1, b0, b1, c0, c1 = V(-0.6, 0.1, -0.11), V(0.56, 0.1, -0.14), V(-0.58, 0.1, 0.11), V(0.58, 0.1, 0.09), V(-0.46, 0.27, -0.01), V(0.48, 0.27, -0.03)
    culm(A, a0, a1, 0.102, BAMBOO_DRY, K=8, nodes=3, seed=1, cut0=0.06, cut1=0.0)
    culm(A, b0, b1, 0.102, BAMBOO_DRY2, K=8, nodes=3, seed=2, cut0=0.0, cut1=0.07)
    culm(A, c0, c1, 0.092, dict(BAMBOO_DRY, bark='#c4a858'), K=8, nodes=2, seed=3, cut0=0.05, cut1=0.05)
    for x, dz in ((-0.25, -0.0), (0.27, -0.03)):
        circ = ((-0.125 + dz, 0.1, 0.108), (0.1 + dz, 0.1, 0.108), (-0.02 + dz * 0.5, 0.27, 0.098))
        pts = []
        for i in range(14):
            a = TAU * i / 14; u = (math.cos(a), math.sin(a))
            z_, y_, r_ = max(circ, key=lambda c: c[0] * u[0] + c[1] * u[1] + c[2])
            pts.append(V(x, max(0.024, y_ + u[1] * (r_ + 0.012)), z_ + u[0] * (r_ + 0.012)))
        A.add(tube(pts, lambda i, s_, a_: 0.03, 4, closed=True, ao=0.6), rope_paint('#b08c4c', '#ecd08a', 8))
def culms_taken(A, r):
    culms_keep(A)
    culm(A, V(-0.2, 0.066, 0.0), V(0.22, 0.068, 0.04), 0.066, BAMBOO_DRY, K=8, nodes=1, seed=4, cut0=0.03, cut1=0.0)
    # the straw rope left in a loose ring on the ground
    pts = [V(0.08 + math.cos(a) * 0.2 * (1 + 0.1 * math.sin(a * 3)), 0.022, 0.26 + math.sin(a) * 0.15) for a in [TAU * i / 10 for i in range(10)]]
    pts = pts[:-1]
    A.add(tube(pts, lambda i, s, a: 0.022, 4, ao=0.7), rope_paint('#b08c4c', '#ecd08a', 5))
    for x, z, a, c in ((-0.46, -0.08, 1, '#c8b868'), (-0.26, 0.22, 2.6, '#d8c878'), (0.36, -0.1, 0.4, '#c8b868')):
        chip(A, V(x, 0, z), 0.04, a, c, tilt=0.4)

MOSSY = dict(lo='#78768a', mid='#9c9aaa', hi='#c8c8d2', warm='#b2aea6', foot='#74766a')
def rubble_keep(A, r):
    for x, z in ((-0.52, -0.2), (0.5, -0.36), (-0.14, -0.42)):
        pebble(A, V(x, 0, z), 0.08, 0.6, int(abs(x * 31 + z * 7)) + 1, MOSSY, tris=30)
    fern(A, V(-0.46, 0, 0.3), 0.38, 0.075, 5, seed=2); fern(A, V(0.46, 0, -0.1), 0.32, 0.07, 5, seed=3)
def mossRubble_full(A, r):
    rubble_keep(A, r)
    M1 = dict(c=(0.02, 0.02, 0.0), th0=1.12, wob=(0.14, 0.09), t=0.04, drips=((1.2, 0.4, 0.5), (-2.0, 0.3, 0.5)), foot=0.09)
    stone(A, V(-0.19, 0.15, 0.03), (0.36, 0.21, 0.2, 0.3), seed=31, p=2.8, planes=cuts(31, 4, 0.82, 0.08, 0.72), moss=M1, tris=320, pal=MOSSY)
    stone(A, V(0.24, 0.13, -0.12), (0.3, 0.2, 0.18, 0.25), seed=32, p=2.8, planes=cuts(32, 4, 0.8, 0.08, 0.74), moss=dict(M1, th0=1.0, drips=((0.2, 0.42, 0.5), (2.8, 0.2, 0.4))), tris=260, pal=MOSSY)
    stone(A, V(0.07, 0.1, 0.3), (0.22, 0.14, 0.14, 0.18), seed=33, p=2.6, planes=cuts(33, 3, 0.82, 0.1, 0.76), moss=dict(M1, th0=0.95, t=0.03, foot=0.06), tris=150, pal=MOSSY)
    stone(A, V(0.0, 0.36, -0.03), (0.2, 0.12, 0.12, 0.17), seed=35, p=2.8, planes=cuts(35, 3, 0.8, 0.08, 0.7), moss=dict(M1, th0=0.92, t=0.03, foot=0.27, drips=((1.0, 0.3, 0.5),)), tris=170, pal=MOSSY, ground=-5)
    stone(A, V(0.42, 0.07, 0.24), (0.13, 0.09, 0.09, 0.11), seed=34, p=2.4, planes=cuts(34, 2, 0.84, 0.12, 0.8), tris=60, pal=MOSSY)
def mossRubble_taken(A, r):
    rubble_keep(A, r)
    stone(A, V(-0.02, 0.05, 0.05), (0.17, 0.1, 0.08, 0.14), seed=36, p=2.6, planes=cuts(36, 3, 0.82, 0.1, 0.76), moss=dict(c=(0, 0, 0), th0=0.8, t=0.028, foot=0.03), tris=160, pal=MOSSY)
    for x, z, a in ((-0.3, 0.02, 1.0), (0.22, 0.2, 2.2), (0.28, -0.08, 0.3)):
        chip(A, V(x, 0, z), 0.05, a, '#a0a0ae', tilt=0.5)

GREEN_CULM = dict(bark='#6f9e3e', hi='#d0e684', end='#f4eec0', ring='#c8b878')
def cocoons_shared(A, r):
    # a stand of three culms from a soil heave, a leafy twig off the tall one; the cocoons hang from it in the full look
    mound(A, 0.28, 0.05, None, seed=7, x=0.02, z=0.08, sx=1.5, rings=2, seg=14, noise_=0.14, bumps=0.1, ao=0.3,
          paint=lambda q, n, m: mix('#a08a60', '#c4ac80', n.y * 0.9))
    culm(A, V(0, -0.02, 0), V(0.08, 0.98, 0.04), 0.092, GREEN_CULM, K=8, nodes=3, seed=1, cut1=0.1, band='#7e9a3c', taper=0.92)
    culm(A, V(0.26, -0.02, 0.14), V(0.28, 0.5, 0.16), 0.074, dict(GREEN_CULM, bark='#7ea644'), K=8, nodes=2, seed=2, cut1=0.08, band='#7e9a3c')
    culm(A, V(-0.28, -0.02, 0.1), V(-0.3, 0.3, 0.11), 0.06, dict(GREEN_CULM, bark='#86aa48'), K=7, nodes=1, seed=3, cut1=0.06, band='#7e9a3c')
    twig_leaves(A, V(0.065, 0.74, 0.04), V(-0.3, 0.92, 0.1), 5, '#4f8a3a', '#a4d262', seed=4, W=0.058, L=0.26)
    twig_leaves(A, V(0.05, 0.54, 0.03), V(0.34, 0.7, -0.06), 4, '#4f8a3a', '#a4d262', seed=5, W=0.052, L=0.22)
    for x, z, a in ((0.34, -0.26, 0.4), (-0.32, 0.3, 2.2), (0.46, 0.3, 1.1)):
        blade(A, V(x, 0.016, z), V(math.cos(a), 0, math.sin(a)), 0.26, 0.056, droop=-0.04, segs=2, lo='#a8924c', hi='#d8c478')
def cocoons_full(A, r):
    cocoons_shared(A, r)
    for x, y, z, th in ((-0.14, 0.62, 0.11, 0.1), (-0.27, 0.72, 0.13, 0.12), (0.24, 0.5, -0.05, 0.11), (0.13, 0.34, 0.09, 0.0), (0.33, 0.56, 0.0, 0.08), (-0.1, 0.3, -0.05, 0.0)):
        cocoon(A, V(x, y, z), 0.082, thread=th, tilt=0.04 if th else 0.5, yaw=x * 6)
    # a fluffy silk moth resting on the short culm's rim
    mp = V(0.28, 0.51, 0.17)
    A.add(blob(mp, 0.038, (1, 0.8, 1.45), 1, ao=0.2), lambda q, n, m: '#fff6e8')
    for s in (-1, 1):
        w = Shell(0.2); pts = [V(0, 0, -0.04), V(s * 0.085, 0.03, -0.075), V(s * 0.115, 0.028, -0.01), V(s * 0.08, 0.02, 0.05), V(0, 0, 0.04)]
        for q in pts: w.vert(mp + q, (abs(q.x)))
        w.f = [(0, 1, 2), (0, 2, 3), (0, 3, 4)]; w.orient(UP); A.add(w, lambda q, n, m: mix('#f8ecd0', '#fffaf2', m / 0.1))
    for s in (-1, 1):
        A.add(tube([mp + V(s * 0.012, 0.01, 0.05), mp + V(s * 0.05, 0.04, 0.085)], lambda i, u, a: 0.009, 3, ao=0.1), '#c8a878')
def cocoons_taken(A, r):
    cocoons_shared(A, r)
    # broken silk threads left on the twigs, a wisp at the culm
    for x, y, z in ((-0.14, 0.76, 0.11), (-0.27, 0.87, 0.13), (0.24, 0.63, -0.05), (0.33, 0.66, 0.0)):
        A.add(tube([V(x, y, z), V(x + 0.01, y - 0.05, z)], lambda i, u, a: 0.014, 3, ao=0.1), '#f4eee0')

def shoot(A, p, h, seed, R=0.13, K=8, cut=False):
    """a bamboo shoot: overlapping pointed sheaths, tawny with dark flecks, pale at the lips, the tip green"""
    rnd = random.Random(seed * 17 + 1); n = 7 if h > 0.45 else 6
    for i in range(n):
        t0 = i / n; rr = R * (1 - t0 * 0.74); hh = 0.26 * h * (1 - t0 * 0.4) + 0.05; y0 = h * t0 * 0.78 + (0.0 if i else -0.02)
        th = rnd.uniform(0, TAU)
        prof = [(rr, 0.0), (rr * 0.8, hh * 0.45), (rr * 0.32, hh * 0.86), (0.0, hh)]
        def lip(j, a):
            return 0.5 + 0.5 * math.cos(a - th)
        S = Shell(0.8); rows = []
        for j, (r_, y_) in enumerate(prof[:-1]):
            row = []
            for k in range(K):
                a = TAU * k / K; c = 0.5 + 0.5 * math.cos(a - th)
                row.append(V(p[0] + math.cos(a) * r_ * (1.07 if j == 0 else 1.0), p[1] + y0 + y_ + (hh * 0.26 * c ** 2 if j == 0 else 0), p[2] + math.sin(a) * r_ * (1.07 if j == 0 else 1.0)))
            rows.append(row)
        grid(S, rows, True, pole1=V(p[0] + math.cos(th) * rr * 0.1, p[1] + y0 + hh, p[2] + math.sin(th) * rr * 0.1), meta=lambda i_, j_: (i_, j_))
        S.orient()
        last = i == n - 1
        A.add(S, (lambda q, nn, m, i=i, last=last: (mix('#7ca83e', '#c8e080', clamp(m[0] / 2.0)) if last else
              mul(mix('#7c5430' if i % 2 else '#946638', '#efcf96', clamp(m[0] / 2.0 * 0.9 + (0.25 if m[0] == 0 else 0))), 0.84 + 0.16 * (1 if nz(q, 34.0) > -0.2 else 0)))))

SHOOT_SPOTS = ((-0.14, 0.0, 0.54, 1), (0.18, -0.1, 0.42, 2), (0.02, 0.24, 0.32, 3))
MUSH_SPOTS = ((0.38, 0.2, 0.19, 0.15, 1), (0.5, 0.0, 0.135, -0.2, 2), (-0.4, 0.26, 0.155, 0.1, 3))
def shoots_keep(A):
    mound(A, 0.42, 0.06, None, seed=4, x=0.02, z=0.04, sx=1.15, rings=2, seg=14, noise_=0.14, ao=0.3, paint=lambda q, n, m: mix('#a08a60', '#c4ac80', n.y * 0.9))
    for x, z, a in ((-0.46, -0.24, 0.6), (0.36, -0.4, 2.4), (-0.1, 0.46, 1.6)):
        blade(A, V(x, 0.016, z), V(math.cos(a), 0, math.sin(a)), 0.27, 0.058, droop=-0.04, segs=2, lo='#a0a048', hi='#c8c86c')
def shoots_full(A, r):
    shoots_keep(A)
    for x, z, h, s in SHOOT_SPOTS: shoot(A, V(x, 0.02, z), h, s, 0.152)
    for x, z, s, t, y in MUSH_SPOTS: mushroom(A, V(x, 0, z), s * 1.1, tilt=t, yaw=y, spots=3)
def shoots_taken(A, r):
    shoots_keep(A)
    for x, z, h, s in SHOOT_SPOTS[:3]:
        # the cut stub: a sheath collar and a pale ringed cut face
        R = 0.105 * (0.8 + h * 0.35)
        S = lathe([(R * 1.12, -0.01), (R * 1.04, 0.05), (R * 0.94, 0.09)], 8, M=Matrix.Translation(V(x, 0.05, z)), ao=0.7); S.orient()
        A.add(S, lambda q, n, m: mix('#8a6036', '#cda470', m[0] / 2))
        T = lathe([(R * 0.94, 0.09), (R * 0.6, 0.09), (0.0, 0.082)], 8, M=Matrix.Translation(V(x, 0.05, z)), ao=0.3); T.orient(UP)
        A.add(T, lambda q, n, m: ('#f6eec8' if m[0] != 1 else '#dcc890'))
    for x, z, s, t, y in MUSH_SPOTS:
        S = lathe([(s * 0.36, -0.01), (s * 0.3, s * 0.18), (0.0, s * 0.2)], 6, M=Matrix.Translation(V(x, 0, z)), ao=0.6); S.orient(); A.add(S, lambda q, n, m: '#f2e6d0' if m[0] < 2 else '#e8d4b0')

# ==================================================================== Momiji Hollow
def branches_keep(A, r):
    for x, z, s, y in ((-0.5, -0.38, 0.11, 1), (0.5, 0.36, 0.115, 2), (-0.2, 0.46, 0.105, 3)):
        maple(A, V(x, 0.03, z), y, s, MAPLE_COLS[y], r, tilt=0.25)
def branches_full(A, r):
    branches_keep(A, r)
    log(A, V(-0.58, 0.085, 0.06), V(0.56, 0.09, -0.12), 0.085, MAPLE_BARK, K=8, n=6, seed=1, bend=0.08)
    log(A, V(-0.44, 0.08, -0.3), V(0.46, 0.08, 0.28), 0.074, dict(MAPLE_BARK, bark='#5f3c2a', hi='#a87864'), K=8, n=6, seed=2, bend=-0.07)
    log(A, V(-0.5, 0.05, 0.3), V(0.36, 0.42, -0.06), 0.064, MAPLE_BARK, K=8, n=6, seed=3, bend=0.05)
    log(A, V(0.0, 0.25, 0.12), V(0.22, 0.5, 0.3), 0.036, MAPLE_BARK, K=5, n=3, seed=4, bend=0.05, caps=(False, True), ridge=0.0)
    log(A, V(0.2, 0.34, 0.0), V(0.42, 0.56, -0.14), 0.032, MAPLE_BARK, K=5, n=3, seed=5, bend=0.05, caps=(False, True), ridge=0.0)
    log(A, V(-0.14, 0.2, 0.17), V(-0.34, 0.42, 0.26), 0.028, MAPLE_BARK, K=5, n=2, seed=6, bend=0.05, caps=(False, True), ridge=0.0)
    stub(A, V(0.24, 0.13, -0.06), V(0.4, 0.5, -0.9), 0.14, 0.03, MAPLE_BARK, K=5, seed=7)
    tw = ((0.22, 0.52, 0.32, 0.135), (0.42, 0.58, -0.13, 0.145), (0.3, 0.58, 0.06, 0.12), (0.12, 0.46, 0.22, 0.115), (0.32, 0.48, 0.34, 0.11), (0.5, 0.52, -0.02, 0.115), (-0.34, 0.44, 0.27, 0.125), (-0.4, 0.38, 0.17, 0.11), (-0.24, 0.42, 0.34, 0.1), (0.34, 0.5, -0.24, 0.11))
    for i, (x, y, z, s) in enumerate(tw):
        maple(A, V(x, y, z), r.random() * TAU, s, MAPLE_COLS[i % 5], r, tilt=0.8, both=True)
    for x, z, s in ((-0.08, -0.32, 0.1), (0.2, 0.42, 0.1), (0.46, -0.3, 0.1)):
        maple(A, V(x, 0.03, z), r.random() * TAU, s, MAPLE_COLS[r.randrange(5)], r, tilt=0.25)
def branches_taken(A, r):
    branches_keep(A, r)
    log(A, V(-0.22, 0.05, 0.0), V(0.2, 0.05, 0.06), 0.045, MAPLE_BARK, K=6, n=3, seed=6, bend=0.05)
    maple(A, V(0.27, 0.025, -0.13), 1, 0.105, '#f0703a', r, tilt=0.2)
    for x, z, a in ((-0.3, -0.12, 0.7), (0.36, 0.12, 1.9), (0.02, -0.2, 2.8), (-0.04, 0.24, 0.2)):
        chip(A, V(x, 0, z), 0.04, a, '#8e6a50', tilt=0.5)

TERRA = ['#d8b48a', '#c29c74', '#e8cca4', '#ae8a66']
def slab(A, c, w, h, d, yaw, col, seed=0, rc=0.05, bev=0.022, moss=0.0):
    """a cut terrace block: a rounded-rectangle outline with a chipped corner, a rolled top edge, a slightly dished top"""
    rnd = random.Random(seed * 7 + 3); hx, hz = w / 2, d / 2; outl = []
    for k, (sx, sz) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        a0 = k * PI / 2; cx, cz = sx * (hx - rc), sz * (hz - rc)
        for j in range(3):
            a = a0 + PI / 2 * j / 2; outl.append((cx + math.cos(a) * rc, cz + math.sin(a) * rc))
    chip_k = rnd.randrange(4) * 3 + 1
    outl[chip_k] = (outl[chip_k][0] * 0.86, outl[chip_k][1] * 0.86)
    jit = [1 + rnd.uniform(-1, 1) * 0.02 for _ in outl]
    def ring(ins, y, fl=0.0):
        return [V((x * j) * max(0.0, 1 - ins / math.hypot(x, z)) + fl * x / math.hypot(x, z), y + (j - 1) * 0.3, (z * j) * max(0.0, 1 - ins / math.hypot(x, z)) + fl * z / math.hypot(x, z)) for (x, z), j in zip(outl, jit)]
    S = Shell(1.0)
    grid(S, [ring(bev * 1.15, h), ring(bev * 0.35, h - bev * 0.32), ring(0, h - bev), ring(-0.004, 0.0)], True, pole0=V(0, h - 0.006, 0), meta=lambda i, j: (i, j))
    S.xf(tm(Vector(c), yaw)); S.orient()
    def p(q, n, m):
        cc = mix(mul(col, 0.74), mix(col, '#fbeed6', 0.45), clamp(n.y * 0.85 + 0.2))
        cc = mul(cc, 0.93 + 0.14 * nz(q, 8.0, (seed, 2, 1)))
        return cc
    A.add(S, p)
    return S

def terrace_keep(A, r):
    for x, z, s in ((-0.56, 0.3, 21), (0.56, 0.26, 22)):
        pebble(A, V(x, 0, z), 0.085, 0.62, s, STONE_TAN, tris=30)
    maple(A, V(-0.5, 0.025, -0.3), 2.1, 0.11, '#ff9a4a', r, tilt=0.2)
    for i in range(5):
        a = i * 1.3; d = V(math.cos(a) * 0.5, 0.9, math.sin(a) * 0.5)
        blade(A, V(-0.42, 0.0, -0.13), d, 0.2 + i * 0.012, 0.03, droop=0.35, segs=2, lo='#5a8a3c', hi='#a0c860', both=True)
    slab(A, V(-0.14, -0.01, 0.1), 0.62, 0.13, 0.48, 0.2, TERRA[3], seed=1)     # (the footing stays)
def terrace_full(A, r):
    terrace_keep(A, r)
    slab(A, V(0.28, 0, -0.08), 0.5, 0.15, 0.38, -0.3, TERRA[1], seed=2)
    slab(A, V(0.1, 0, 0.36), 0.42, 0.12, 0.28, 0.5, TERRA[0], seed=3)
    slab(A, V(-0.06, 0.13, -0.02), 0.54, 0.14, 0.38, -0.15, TERRA[2], seed=4)
    slab(A, V(0.08, 0.27, 0.0), 0.4, 0.12, 0.3, 0.35, TERRA[1], seed=5)
    slab(A, V(0.02, 0.39, -0.02), 0.26, 0.1, 0.21, -0.4, TERRA[0], seed=6)
    moss_dab(A, V(-0.21, 0.27, 0.08), UP, 0.09, 0.028, seed=1, sc=1.2)
    moss_dab(A, V(0.32, 0.15, -0.15), UP, 0.07, 0.024, seed=2)
    moss_dab(A, V(0.14, 0.39, -0.08), UP, 0.05, 0.02, seed=3)
    maple(A, V(0.04, 0.5, -0.02), 0.7, 0.115, '#e8483a', r, tilt=0.1)
def terrace_taken(A, r):
    terrace_keep(A, r)
    moss_dab(A, V(-0.28, 0.12, 0.15), UP, 0.07, 0.022, seed=5, sc=1.1)
    for x, z, a in ((0.28, -0.08, 1.0), (0.14, 0.26, 2.2), (0.34, 0.12, 0.4)):
        chip(A, V(x, 0, z), 0.055, a, TERRA[1], tilt=0.5)

def mapleLeaves_full(A, r):
    R, H, SX = 0.5, 0.25, 1.15
    def bed(q, n, m):
        return mul(mix('#b04a2a', '#e47838', n.y * 1.05 - 0.05), 0.96 + 0.08 * nz(q, 8.0))
    mound(A, R, H, None, seed=1, sx=SX, noise_=0.12, rings=4, seg=20, bumps=0.12, paint=bed, ao=0.4)
    def hAt(d): return H * max(0.0, 1 - (d / R) ** 2) ** 0.75
    n = 74
    for i in range(n):
        a = r.random() * TAU; d = r.random() ** 0.65 * 0.76; x, z = math.cos(a) * d * SX, math.sin(a) * d
        y = hAt(d) * 0.98 + 0.014 + r.random() * 0.015
        maple(A, V(x, y, z), r.random() * TAU, 0.11 + r.random() * 0.05, MAPLE_COLS[i % len(MAPLE_COLS)], r, tilt=0.85 if d < 0.45 else 0.35)
    log(A, V(-0.3, 0.22, 0.0), V(0.22, 0.34, -0.12), 0.026, MAPLE_BARK, K=5, n=3, seed=7, ridge=0.0, caps=(True, True))
    for x, z, a in ((0.08, 0.02, 0.4), (-0.16, 0.1, 1.9), (0.2, -0.1, 3.1)):
        maple(A, V(x, 0.33, z), a, 0.12, MAPLE_COLS[r.randrange(4)], r, rx=1.1, rz=0.2, both=True, cup=0.2)
def mapleLeaves_taken(A, r):
    for i in range(16):
        a = TAU * i / 16 + r.random() * 0.3; d = 0.3 + r.random() * 0.42
        maple(A, V(math.cos(a) * d * 1.15, 0.022, math.sin(a) * d), r.random() * TAU, 0.1 + r.random() * 0.03, MAPLE_COLS[i % 4], r, tilt=0.22)
    log(A, V(-0.14, 0.03, 0.0), V(0.14, 0.04, -0.06), 0.024, MAPLE_BARK, K=5, n=2, seed=8, ridge=0.0, caps=(True, True))

def honey_shared(A, r):
    # a fat hollow log, its open end toward +x +z: the bark ridged, the rear end cut, the mouth a pale rolled rim with a dark inside
    a, b = V(-0.52, 0.225, -0.24), V(0.44, 0.225, 0.24); T = (b - a).normalized(); R = 0.235; K = 14
    pts = [a.lerp(b, i / 6) for i in range(7)]
    f = 7
    pal = dict(bark='#573826', hi='#a87a58', end='#eccb9c', ring='#ac7c58', lip='#c89c74')
    S = tube(pts, lambda i, s, ang: R * (1 - 0.06 * s) * (1 + 0.05 * math.cos(ang * f + s * 2) + 0.05 * nz(pts[i], 3.0)), K)
    A.add(S, bark_paint(pal, K, 1))
    cap_shell(A, S, S.rows[0], a, -T, pal, rings=(0.82, 0.5), dome=0.008)
    # the mouth: the rim rolls over and goes in
    last = [S.v[i] for i in S.rows[-1]]
    def toward(q, k, ax): return b.lerp(q, k) + T * ax
    rim = Shell(0.2); ids = grid(rim, [last, [toward(q, 0.92, 0.024) for q in last], [toward(q, 0.76, 0.012) for q in last], [toward(q, 0.72, -0.04) for q in last]], True, meta=lambda i, j: (i, j)); rim.orient(T)
    A.add(rim, lambda q, n, m: ('#c49a70', '#ecd0a4', '#dcb484', '#7a5438')[m[0]])
    inn = Shell(0.0); R3 = [toward(q, 0.72, -0.04) for q in last]; R4 = [toward(q, 0.7, -0.22) for q in last]; R5 = [toward(q, 0.64, -0.42) for q in last]
    grid(inn, [R3, R4, R5], True, pole1=b - T * 0.46, meta=lambda i, j: (i, j)); inn.orient(); inn.flip()
    A.add(inn, lambda q, n, m: ('#5a3a26', '#3e261c', '#2e1c18', '#2a1a16')[clamp(m[0], 0, 3).__int__()])
    for i, (t, ang, rr) in enumerate(((0.16, 0.0, 0.1), (0.42, 0.2, 0.125), (0.68, -0.25, 0.09), (0.3, 1.1, 0.075))):
        q = a.lerp(b, t); s1 = perp(T); u = (V(0, 1, 0) * math.cos(ang) + T.cross(UP).normalized() * math.sin(ang)).normalized()
        moss_dab(A, q + u * (R * 0.96), u, rr, 0.036, seed=i + 1, sc=1.3, K=8)
    return T, b, R

COMB_RIM, COMB_PIT = '#ffe07a', '#c8801c'
def comb_cell(A, p, nrm, s):
    """one honeycomb cell: a pale wax hexagon rim round an amber pit"""
    q = UP.rotation_difference(nrm.normalized()).to_matrix(); S = Shell(0.2); K = 6
    ring = lambda rr, y: [p + q @ V(math.cos(TAU * k / K + 0.52) * rr, y, math.sin(TAU * k / K + 0.52) * rr) for k in range(K)]
    grid(S, [ring(s, 0.0), ring(s * 0.62, 0.0), ring(s * 0.46, -s * 0.34)], True, pole1=p + q @ V(0, -s * 0.36, 0), meta=lambda i, j: (i, j))
    S.orient(q @ UP)
    A.add(S, lambda q_, n, m: mix(COMB_PIT, '#e8a42c', 0.3) if m[0] >= 2 else mix(COMB_RIM, '#fff0ac', clamp(n.y)))

def honeyLog_full(A, r):
    T, b, R = honey_shared(A, r)
    # the comb, wedged in the mouth and leaning out: an amber slab, its face a sheet of hex cells
    nf = (T + V(0, 0.32, 0)).normalized(); sd = T.cross(UP).normalized(); upf = sd.cross(nf).normalized()
    if upf.y < 0: upf = -upf
    c = b + T * 0.0 + V(0, -0.035, 0)
    slab_m = Matrix((sd, upf, nf)).transposed()
    A.add(blob(c, 0.165, (1.02, 0.98, 0.42), 2, jit=0.03, seed=5, ao=0.3, M=slab_m), lambda q, n, m: mix('#c88224', '#f4b63c', n.y * 0.5 + 0.5))
    ce = 0.05
    for ix, iy in ((0, 0), (1, 0), (-1, 0), (2, 0), (-2, 0), (0, 1), (-1, 1), (1, 1), (-2, 1), (0, -1), (-1, -1), (1, -1), (-2, -1)):
        off = sd * ((ix + (0.5 if iy % 2 else 0)) * ce * 1.76) + upf * (iy * ce * 1.52)
        comb_cell(A, c + nf * 0.076 + off - nf * (off.length ** 2) * 0.9, (nf + off * 1.4).normalized(), ce)
    # honey: slow gold drips off the comb and a small pool
    for x, y, z, s in ((b.x + 0.06, 0.06, b.z + 0.12, 0.042),):
        S = lathe([(0.0, 1.7), (0.42, 0.8), (0.8, 0.0), (0.0, -0.74)], 6, M=Matrix.Translation(V(x, y, z)) @ Matrix.Scale(s, 4), ao=0.2); S.orient()
        A.add(S, lambda q, n, m: mix('#e89418', '#ffe078', n.y * 0.6 + 0.45))
    S = lathe([(0.09, -0.01), (0.075, 0.016), (0.0, 0.022)], 8, M=Matrix.Translation(V(b.x + 0.07, 0.0, b.z + 0.13)), ao=0.1); S.orient(UP); A.add(S, lambda q, n, m: mix('#f0a428', '#ffdc64', m[0] * 0.5))
    # a bee
    bp = V(b.x + 0.12, 0.52, b.z + 0.02)
    body = lathe([(0.0, -0.06), (0.028, -0.042), (0.036, -0.014), (0.034, 0.014), (0.024, 0.04), (0.0, 0.055)], 7, M=tm(bp, 0.5, 0, PI / 2), ao=0.2); body.orient()
    A.add(body, lambda q, n, m: ('#ffd040', '#2a2030', '#ffd040', '#2a2030', '#ffd040', '#ffd040')[m[0]])
    for s in (-1, 1):
        blade(A, bp + V(0, 0.02, 0), V(-0.3, 0.55, s * 0.9), 0.1, 0.034, droop=0.0, segs=2, tent=0.0, lo='#dcf0ff', hi='#ffffff', both=True, ao=0.0)
    # shiitake on the log and at its foot
    mushroom(A, V(-0.22, 0.39, -0.08), 0.15, tilt=0.2, yaw=0.5, spots=1)
    mushroom(A, V(-0.04, 0.42, 0.06), 0.115, tilt=-0.15, yaw=1.4, spots=1)
    mushroom(A, V(0.54, 0, -0.12), 0.17, yaw=2, spots=1)
def honeyLog_taken(A, r):
    T, b, R = honey_shared(A, r)
    # the empty hollow: a smear of wax on the lip, cut stems where the shiitake grew
    A.add(blob(b + T * 0.015 + V(0, -0.15, 0), 0.05, (1.4, 0.3, 1.0), 1, ao=0.2), lambda q, n, m: '#f0c04c')
    for x, y, z, s in ((-0.22, 0.39, -0.08, 0.15), (-0.04, 0.42, 0.06, 0.115), (0.54, 0, -0.12, 0.17)):
        S = lathe([(s * 0.34, -0.01), (s * 0.3, s * 0.22), (0.0, s * 0.24)], 6, M=Matrix.Translation(V(x, y, z)), ao=0.5); S.orient(); A.add(S, lambda q, n, m: '#f2e6d0' if m[0] < 2 else '#e8d4b0')

# ==================================================================== Tidepool Point
KELP = ('#2e5a2a', '#7a9a48')
def kelp(A, p, L, a, upright=False, w=0.042, seed=0, seg=5, lo=KELP[0], hi=KELP[1], over=None):
    """a chunky ruffled seaweed strap, double-faced; lying over `over` (a shell's BVH) when given"""
    S = Shell(0.5); rows = []
    d = V(math.cos(a), 0, math.sin(a))
    for i in range(seg + 1):
        t = i / seg; q = Vector(p) + d * L * t * (0.34 if upright else 1.0) + d.cross(UP) * math.sin(t * 5 + a) * 0.05 * t
        if upright: q.y += math.sin(t * PI * 0.55) * L * 0.78 - t * t * L * 0.1
        else: q.y += 0.012 + math.sin(t * PI) * 0.03
        side = d.cross(UP).normalized() if not upright else d.cross(UP).normalized()
        ww = w * (1 - t * 0.55) * (1 + 0.32 * math.sin(i * 1.9 + seed))
        rows.append([q - side * ww, q + side * ww])
    grid(S, rows, False, meta=lambda i, j: i / seg)
    S.orient(UP)
    hy = lambda q: clamp((q.y - p[1]) / max(0.1, L * 0.5)) if upright else 0.55
    A.add(S, lambda q, n, m: mul(mix(lo, hi, 0.3 + 0.7 * m), 0.95 + 0.1 * nz(q, 12.0)))
    T = Shell(0.5); T.v = [v - S.n[i] * 0.01 for i, v in enumerate(S.v)]; T.m = list(S.m); T.f = [tuple(reversed(f)) for f in S.f]; T.fixed = True
    A.add(T, lambda q, n, m: mul(mix(lo, hi, 0.1 + 0.6 * m), 0.82))

def seaDrift_keep(A, r):
    starfish(A, V(-0.46, 0, -0.3), 0.135, '#ff8450', yaw=0.6)
def seaDrift_full(A, r):
    seaDrift_keep(A, r)
    m = log(A, V(-0.62, 0.11, 0.1), V(0.56, 0.13, -0.1), 0.125, SEA_WOOD, K=10, n=7, seed=1, bend=0.12, taper=0.72, point=(1, 0), ridge=0.09)
    log(A, V(-0.2, 0.1, -0.4), V(0.32, 0.37, 0.3), 0.09, dict(SEA_WOOD, bark='#9c9890'), K=9, n=5, seed=2, bend=-0.1, taper=0.62, point=(0, 1), ridge=0.09)
    log(A, V(0.34, 0.1, -0.3), V(0.64, 0.075, -0.5), 0.056, SEA_WOOD, K=7, n=3, seed=3, taper=0.6, point=(0, 1), caps=(False, False))
    stub(A, V(-0.26, 0.16, 0.13), V(-0.3, 0.7, 0.7), 0.16, 0.042, SEA_WOOD, K=6, seed=4)
    for x, y, z, nn in ((-0.3, 0.2, 0.2, V(0, 0.5, 1)), (0.2, 0.235, 0.05, V(0, 1, 0.2)), (0.42, 0.2, -0.1, V(0.1, 0.8, 0.5))):
        knot(A, V(x, y, z), nn, 0.032, col='#a49c90', dark='#54504c')
    for x, y, z, nn in ((-0.1, 0.22, 0.13, V(0, 1, 0.4)), (-0.03, 0.23, 0.14, V(0.1, 1, 0.5)), (-0.07, 0.25, 0.08, V(0, 1, 0.1)), (0.05, 0.3, -0.13, V(0, 1, 0)), (0.3, 0.14, 0.07, V(0, 0.7, 1))):
        barnacle(A, V(x, y, z), nn, 0.03)
    # seaweed slung over the log, its ends on the sand
    for y0, a, L in ((0.235, 0.95, 0.44), (0.235, -2.2, 0.36)):
        kelp(A, V(-0.05, y0, 0.0), L, a, seg=4, w=0.045, seed=int(a * 3))
        kelp(A, V(0.22, y0 + 0.02, -0.02), L * 0.8, a + 0.3, seg=3, w=0.04, seed=int(a * 5))
def seaDrift_taken(A, r):
    seaDrift_keep(A, r)
    log(A, V(-0.23, 0.058, 0.03), V(0.2, 0.066, -0.05), 0.062, SEA_WOOD, K=8, n=3, seed=4, taper=0.7, point=(1, 0))
    for x, z, a in ((-0.5, 0.1, 0.5), (0.42, -0.2, 1.3), (0.26, 0.16, 2.6), (-0.1, -0.22, 0.2), (0.56, -0.42, 1.0)):
        chip(A, V(x, 0, z), 0.048, a, '#c4c0b6', tilt=0.5)
    kelp(A, V(0.14, 0.0, 0.2), 0.3, 0.5, seg=3, w=0.04, seed=3)

SEA_SALT = dict(lo='#4e5a70', mid='#74829a', hi='#b4c2d2', warm='#8490a2', foot='#4c5664')
SEA_SALT2 = dict(lo='#5e6a80', mid='#8a98ae', hi='#ccd8e4', warm='#9ca8b8', foot='#566070')
SEA_SALT3 = dict(lo='#465064', mid='#667488', hi='#a2b0c2', warm='#748094', foot='#3e4856')
def salt_line(q, n, c):
    """a pale tide line, and a wet dark foot"""
    return mix(c, '#e8ece8', 0.32 * sstep(0.1, 0.14, q.y) * sstep(0.2, 0.15, q.y)) if q.y < 0.2 else c
def seaStones_keep(A, extra=None):
    base = stone(A, V(0, 0.13, 0), (0.33, 0.2, 0.2, 0.3), seed=41, p=2.1, planes=cuts(41, 2, 0.88, 0.16, 0.8), tris=300, pal=SEA_SALT, foot_h=0.12, paint_extra=(lambda q, n, c: extra(q, n, salt_line(q, n, c))) if extra else salt_line)
    starfish(A, V(0.42, 0, 0.3), 0.125, '#ffa63e', yaw=1.0)
    scallop(A, V(-0.44, 0, 0.34), 0.115, 2.1)
    barnacle(A, V(0.27, 0.13, 0.1), V(0.8, 0.4, 0.4), 0.028); barnacle(A, V(0.23, 0.19, 0.12), V(0.7, 0.7, 0.4), 0.024); barnacle(A, V(0.26, 0.09, 0.17), V(0.7, 0.3, 0.6), 0.024)
    return base
def seaStones_full(A, r):
    base = seaStones_keep(A); y = shell_top(base)
    s = stone(A, V(0.02, y + 0.05, -0.02), (0.23, 0.11, 0.12, 0.2), seed=42, p=2.1, planes=cuts(42, 2, 0.88, 0.16, 0.82), tris=220, pal=SEA_SALT2, ground=-5); y = shell_top(s)
    s = stone(A, V(-0.01, y + 0.04, 0.01), (0.165, 0.09, 0.1, 0.145), seed=43, p=2.05, planes=cuts(43, 1, 0.9, 0.16, 0.84), tris=170, pal=SEA_SALT3, ground=-5); y = shell_top(s)
    stone(A, V(0.01, y + 0.03, 0), (0.105, 0.07, 0.07, 0.09), seed=44, p=2.0, planes=cuts(44, 1, 0.9, 0.18, 0.86), tris=100, pal=SEA_SALT2, ground=-5)
    pebble(A, V(0.34, 0, -0.26), 0.1, 0.6, 45, SEA_SALT2, tris=36)
    pebble(A, V(-0.4, 0, -0.18), 0.085, 0.6, 46, SEA_SALT, tris=30)
    pebble(A, V(0.14, 0, 0.42), 0.075, 0.6, 47, SEA_SALT3, tris=30)
def seaStones_taken(A, r):
    seaStones_keep(A, stack_print('#c8d2dc'))

NET_ROCK = dict(lo='#666c7e', mid='#8c92a2', hi='#c0c6d0', warm='#a2a6ae', foot='#5e6470')
def net_keep(A):
    R = stone(A, V(0, 0.15, 0), (0.42, 0.24, 0.2, 0.37), seed=51, p=2.3, planes=cuts(51, 3, 0.86, 0.14, 0.82), tris=300, pal=NET_ROCK)
    coil(A, V(-0.5, 0, 0.26), 0.13, 0.08, turns=2.3, seg=20, rr=0.026, K=4)
    return R
def proj_on(bvh, p, c, off=0.016):
    """project p onto the rock along the line to its centre (the net hugs it)"""
    d = (c - p).normalized(); hit = bvh.ray_cast(p, d, 2.0)
    if hit[0] is None: return p, (p - c).normalized()
    return hit[0] + hit[1] * off, hit[1]
def cord(A, pts, nrms, w=0.021, h=0.016, col=('#1e8a80', '#58d0c0')):
    """a net cord: a rounded roof ribbon lying on the rock (3 verts across), chunky"""
    S = Shell(0.4); rows = []
    for i, (q, n) in enumerate(zip(pts, nrms)):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); side = d.cross(n).normalized()
        rows.append([q - side * w - n * 0.016, q + n * h, q + side * w - n * 0.016])
    grid(S, rows, False, meta=lambda i, j: j); S.orient(nrms[0] * 1.0 if False else None)
    # (a ribbon: orient by its own normals)
    tot = 0.0
    for a, b, c in S.tris():
        tot += (S.v[b] - S.v[a]).cross(S.v[c] - S.v[a]).dot(rows[0][1] - rows[0][0] if False else (S.v[a] - sum(pts, Vector()) / len(pts) + nrms[0] * 0.0))
    A.add(S, lambda q, n, m: mix(col[0], col[1], 0.85 if m == 1 else 0.1))
    return S
def net_lattice(A, R, u0=0.1, u1=0.98, a0=0.0, a1=TAU, strands=8, knots=True):
    vs = R.v; cen = V(0, 0.12, 0); bvh = BVHTree.FromPolygons(vs, list(R.tris()), all_triangles=True)
    H, RX, RZ = 0.5, 0.46, 0.42
    def dome(a, u):
        s = math.sin(u * PI / 2); return V(math.cos(a) * RX * s, 0.02 + H * math.cos(u * PI / 2), math.sin(a) * RZ * s)
    TW = 1.3; crossings = []
    for k in range(strands):
        ak = a0 + (a1 - a0) * k / strands
        for sgn in (1, -1):
            pts, ns = [], []
            for i in range(7):
                u = u0 + (i / 6) * (u1 - u0); a = ak + sgn * u * TW
                q, n = proj_on(bvh, dome(a, u), cen); pts.append(q); ns.append(n)
            s = Shell(0.4); rows = []
            for i, (q, n) in enumerate(zip(pts, ns)):
                d = (pts[min(i + 1, 6)] - pts[max(i - 1, 0)]).normalized(); side = d.cross(n).normalized()
                rows.append([q - side * 0.023 - n * 0.016, q + n * 0.014, q + side * 0.023 - n * 0.016])
            grid(s, rows, False, meta=lambda i_, j_: j_)
            # outward by the rock's normal
            t = sum(((s.v[b] - s.v[a]).cross(s.v[c] - s.v[a])).dot(ns[0] + ns[-1]) for a, b, c in s.tris())
            if t < 0: s.f = [tuple(reversed(f)) for f in s.f]
            s.fixed = True
            A.add(s, lambda q, n, m, sg=sgn: mix('#167a70' if sg > 0 else '#105e58', '#5cd4c4' if sg > 0 else '#40b4a8', 0.9 if m == 1 else 0.05))
    # a knot at each crossing of neighbours
    if not knots: return
    for k in range(strands):
        ak = a0 + (a1 - a0) * k / strands
        for m_ in (1,):
            u = 0.28 + m_ * (a1 - a0) / strands / 2 / TW
            if u > u1: continue
            q, n = proj_on(bvh, dome(ak + u * TW, u), cen, 0.02)
            A.add(blob(q, 0.026, (1, 0.8, 1), 1, ao=0.1), lambda q_, n_, m__: mix('#0e5a54', '#2ca89c', n_.y * 0.5 + 0.5))
def netScraps_full(A, r):
    R = net_keep(A)
    net_lattice(A, R)
    hem = [V(math.cos(TAU * i / 22) * 0.455 * (1 + 0.03 * math.sin(i)), 0.03 + 0.008 * math.sin(i * 2.3), math.sin(TAU * i / 22) * 0.42) for i in range(22)]
    A.add(tube(hem, lambda i, s, a: 0.026, 4, closed=True, ao=0.7), rope_paint('#a88a50', '#ecd6a0', 11))
    for x, z, c, s in ((0.38, 0.3, '#ff7a30', 0.092), (-0.06, 0.45, '#ffc83e', 0.085), (0.48, -0.22, '#ff5a5a', 0.08)):
        A.add(blob(V(x, s * 0.78, z), s, (1, 0.86, 1), 2, ao=0.5), lambda q, n, m, cc=c: mix(mul(cc, 0.76), mix(cc, '#ffffff', 0.5), clamp(n.y * 0.8 + 0.25)))
def netScraps_taken(A, r):
    R = net_keep(A)
    # a torn corner of the net snagged on the rock, one float left
    net_lattice(A, R, u0=0.42, u1=0.98, a0=0.5, a1=1.7, strands=4, knots=False)
    A.add(blob(V(0.38, 0.072, 0.3), 0.092, (1, 0.86, 1), 2, ao=0.5), lambda q, n, m: mix(mul('#ff7a30', 0.76), mix('#ff7a30', '#ffffff', 0.5), clamp(n.y * 0.8 + 0.25)))

POOL = dict(lo='#68708a', mid='#8a92a4', hi='#c0c8d2', warm='#a0a4ac', foot='#5c6270')
POOL2 = dict(lo='#747c92', mid='#9aa2b0', hi='#d0d6de', warm='#aeb2b8', foot='#646a76')
def pool_shared(A, r):
    # a rock-rimmed pool: chunky rim stones round a still turquoise pool, a pink coral sprig on the rim
    rr = random.Random(431)
    for i in range(10):
        a = TAU * i / 10 + rr.random() * 0.3; d = 0.43 + rr.random() * 0.05; R = 0.115 + rr.random() * 0.06
        x, z = math.cos(a) * d * 1.14, math.sin(a) * d
        stone(A, V(x, R * 0.42, z), (R * 1.08, R * 0.74, R * 0.5, R * 0.95), seed=60 + i, p=2.2, planes=cuts(60 + i, 2, 0.84, 0.14, 0.78), tris=54, pal=POOL if i % 2 else POOL2, sub=4, yaw=a)
    S = Shell(0.15); K = 20; rows = []
    for t in (1.0, 0.72, 0.36):
        rows.append([V(math.cos(TAU * k / K) * 0.46 * 1.12 * t, 0.058, math.sin(TAU * k / K) * 0.46 * t) for k in range(K)])
    grid(S, rows, True, pole1=V(0, 0.058, 0), meta=lambda i, j: (i, j)); S.orient(UP)
    A.add(S, lambda q, n, m: mix('#2f9fbc', '#a6ecef', clamp(math.hypot(q.x / 1.12, q.z) / 0.42) ** 1.5) if m[0] > 0 else '#c4f4f0')
    # painted glints on the water: small raised pale quads
    for x, z, a, w in ((-0.12, -0.18, 0.5, 0.08), (0.2, 0.16, 0.5, 0.06), (0.0, 0.26, 0.5, 0.05)):
        g = Shell(0.0); M = tm(V(x, 0.061, z), a)
        for dx, dz in ((-w, 0), (0, -0.014), (w, 0), (0, 0.014)): g.vert(M @ V(dx, 0, dz), 0)
        g.f = [(0, 3, 2, 1)]; g.orient(UP); A.add(g, '#e8fbfa')
    coral_pal = dict(bark='#ffa0b8', hi='#ffd8e2', end='#ffd8e0', ring='#ff9ab4')
    x, z, h = -0.5, -0.26, 0.42
    log(A, V(x, 0.02, z), V(x + 0.02, h, z - 0.02), 0.038, coral_pal, K=5, n=2, seed=1, bend=0.05, caps=(False, False), ridge=0.0, wob=0.0)
    for s, y0, y1 in ((-1, 0.5, 0.86), (1, 0.45, 0.8), (-1, 0.25, 0.5)):
        log(A, V(x, h * y0, z), V(x + s * 0.11, h * y1, z + 0.03), 0.026, coral_pal, K=5, n=1, seed=2, bend=0.0, caps=(False, False), ridge=0.0, wob=0.0)
        A.add(blob(V(x + s * 0.11, h * y1, z + 0.03), 0.03, sub=1, ao=0.0), '#ffd0dc')
    A.add(blob(V(x + 0.02, h, z - 0.02), 0.034, sub=1, ao=0.0), '#ffd0dc')
GEMS = (('#2ad8b8', '#b4fff0'), ('#7fe85a', '#ddffb8'), ('#ffb84a', '#ffe8b0'), ('#e6f4ff', '#ffffff'), ('#4ab4ff', '#c4ecff'), ('#ff7ac8', '#ffd4ef'), ('#2ad8b8', '#b4fff0'), ('#7fe85a', '#ddffb8'))
def seaGlass_full(A, r):
    pool_shared(A, r)
    for i, (x, z, s) in enumerate(((0.06, 0.02, 0.092), (-0.17, 0.12, 0.08), (0.2, -0.13, 0.075), (-0.07, -0.17, 0.07), (0.25, 0.14, 0.068), (-0.26, -0.04, 0.066), (0.02, 0.22, 0.062), (0.34, -0.02, 0.058))):
        lo, hi = GEMS[i]; rr = random.Random(i + 9)
        g = blob(V(x, 0.075, z), s, (1, 0.62, 0.86), 1, jit=0.06, seed=i, ao=0.0, M=rot(x * 20, 0.25, 0.2))
        for t in range(len(g.f)): pass
        fl = Shell(0.0);
        for f in g.f:   # flat facets, each its own tone
            tone = rr.uniform(0.0, 1.0); a = [g.v[j] for j in f]; b = len(fl.v)
            for q in a: fl.vert(q, tone)
            fl.f.append((b, b + 1, b + 2))
        fl.orient(); A.add(fl, lambda q, n, m, lo=lo, hi=hi: mix(mix(lo, hi, m * 0.5), hi, clamp(n.y) * 0.75))
def seaGlass_taken(A, r):
    pool_shared(A, r)

SW_ROCK = dict(lo='#565e70', mid='#7a8294', hi='#b0b6c2', warm='#8c929c', foot='#505660')
SW_MOSS = dict(lo='#2a5228', mid='#4e7c34', hi='#88a848', tip='#a4bc58')
def seaweed_keep(A, moss):
    M = dict(c=(0, 0.02, 0), th0=0.95, wob=(0.14, 0.1), t=0.04, drips=((0.8, 0.5, 0.5), (-1.6, 0.4, 0.5), (2.9, 0.45, 0.45)), foot=0.03) if moss else dict(c=(-0.06, 0.02, 0.05), th0=0.36, wob=(0.14, 0.1), t=0.018, drips=((0.8, 0.22, 0.5),), foot=0.03)
    R = stone(A, V(-0.02, 0.15, -0.04), (0.28, 0.2, 0.17, 0.25), seed=71, p=2.2, planes=cuts(71, 3, 0.86, 0.14, 0.86), moss=M, tris=280 if moss else 220, pal=SW_ROCK, mosspal=SW_MOSS)
    scallop(A, V(0.38, 0, 0.26), 0.13, 0.6, col='#fff0e0')
    conch(A, V(-0.42, 0, 0.3), 0.08, 2.6)
    return R
def seaweed_full(A, r):
    seaweed_keep(A, True)
    scallop(A, V(0.46, 0, -0.12), 0.105, 2.1, col='#ffd8e8', rib='#f09ab8')
    for i in range(14):
        a = i / 14 * TAU + r.random() * 0.3; L = 0.42 + r.random() * 0.22
        kelp(A, V(math.cos(a) * 0.17 - 0.02, 0.2 + r.random() * 0.1, math.sin(a) * 0.16 - 0.04), L, a, upright=True, seg=4, w=0.052, seed=i)
    for a, L in ((0.4, 0.34), (2.4, 0.3), (-1.2, 0.34), (3.6, 0.28)):
        kelp(A, V(math.cos(a) * 0.24, 0.01, math.sin(a) * 0.22), L, a, seg=3, w=0.05, seed=int(a * 7))
def seaweed_taken(A, r):
    seaweed_keep(A, False)
    # a stub or two of torn strap on the bare damp rock, one washed off on the sand
    kelp(A, V(0.2, 0.0, 0.05), 0.28, 0.6, seg=3, w=0.042, seed=3)

# ==================================================================== the Onsen
def cone_pine(A, x, y, z, s=1.0, yaw=0.0, tilt=1.0):
    """a pine cone: stacked scale rings on its side"""
    pr = [(0.0, -0.075), (0.05, -0.06), (0.062, -0.022), (0.042, -0.012), (0.05, 0.02), (0.03, 0.03), (0.032, 0.058), (0.0, 0.082)]
    S = lathe([(r_ * s, y_ * s) for r_, y_ in pr], 5, M=tm(V(x, y, z), yaw, 0, tilt), ao=0.5); S.orient()
    A.add(S, lambda q, n, m: mul(mix('#6e4630', '#c08a5a', 1.0 if m[0] in (2, 4, 6) else 0.2), 1.0))

def fir_bough(A, a, b, r, lift=1.0, snow=0.5, fronds=8, seed=0):
    """a pine bough: the branch, overlapping serrated needle fronds off either side and along the top (hiding most of the wood),
    dark under, light tips, snow lying in patches on the tops"""
    log(A, a, b, 0.034, PINE_BARK, K=5, n=3, seed=seed, bend=0.05, ridge=0.0, caps=(True, False))
    d = b - a; T = d.normalized(); side = T.cross(UP).normalized()
    def sn(q, nn, c, m):
        s_ = nz(q, 8.0, (seed, 3, 7)) * 2.2 + snow - 0.5 + (0.1 if m[0] < 0.6 else -0.15)
        return mix(c, '#f4f8ff', sstep(0.0, 0.1, s_))
    for i in range(fronds):
        t = (i + 0.4) / fronds; q = a + d * t
        sg = 1 if i % 2 else -1
        dd = (side * sg + T * (0.6 + 0.2 * r.random()) + V(0, 0.22 + r.random() * 0.2, 0)).normalized()
        ln = (0.44 - t * 0.14) * lift * (0.92 + r.random() * 0.16)
        frond(A, q + V(0, 0.03, 0), dd, ln, 0.098 * lift, droop=0.34, lobes=3, lo='#27624a', hi='#5aa068', snow=sn, tip_col='#8cc684')
    for t in (0.08, 0.26, 0.44, 0.62, 0.8):     # the top row, along the branch, hiding the wood
        frond(A, a + d * t + V(0, 0.05, 0), T + V(0, 0.16, 0), 0.34 * lift, 0.092 * lift, droop=0.2, lobes=3, lo='#27624a', hi='#5aa068', snow=sn, tip_col='#8cc684')
    frond(A, b, T + V(0, 0.1, 0), 0.28 * lift, 0.09 * lift, droop=0.2, lobes=3, lo='#27624a', hi='#5aa068', snow=sn, tip_col='#8cc684')

def snow_blob(A, p, r_, sc=(1.3, 0.46, 1.0), seed=0):
    A.add(blob(p, r_, sc, 1, jit=0.12, seed=seed, ao=0.3), snow_paint(seed))

def pine_keep(A, r):
    return mound(A, 0.58, 0.085, None, seed=1, sx=1.1, rings=3, seg=24, bumps=0.15, noise_=0.09, paint=snow_paint(1), ao=0.35)
def pine_cones(A):
    for x, z, yw in ((0.52, 0.36, 0.5), (-0.52, -0.36, 2.0), (0.6, 0.18, 3.2)):
        cone_pine(A, x, 0.05, z, 1.15, yw, 1.35)
def pine_full(A, r):
    pine_keep(A, r); pine_cones(A)
    fir_bough(A, V(-0.56, 0.1, -0.04), V(0.5, 0.13, -0.16), r, 1.0, 0.3, 7, seed=1)
    fir_bough(A, V(-0.38, 0.1, 0.32), V(0.42, 0.18, 0.14), r, 0.92, 0.3, 6, seed=2)
    fir_bough(A, V(-0.2, 0.1, -0.36), V(0.24, 0.5, 0.0), r, 0.78, 0.36, 5, seed=3)
    for x, y, z, s in ((-0.2, 0.25, -0.06, 0.07), (0.16, 0.31, -0.12, 0.07), (0.06, 0.34, 0.2, 0.06), (0.17, 0.56, -0.02, 0.06)):
        snow_blob(A, V(x, y, z), s, seed=int(x * 20) + 5)
def pine_taken(A, r):
    S = pine_keep(A, r); pine_cones(A)
    # bough-shaped hollows pressed in the snow: dimmed snow where they lay; a stray snapped twig and dropped needles
    C = A.C[0]
    for i, q in enumerate(S.v):
        d1 = abs(q.z + 0.1 + (q.x * 0.11)); d2 = abs(q.z - 0.23 + (q.x * 0.22))
        k = max(sstep(0.11, 0.02, d1), sstep(0.11, 0.02, d2)) * sstep(0.56, 0.4, abs(q.x))
        C[i] = mix(C[i], '#9db2d4', k * 0.5)
    log(A, V(-0.2, 0.095, 0.02), V(0.18, 0.1, 0.05), 0.04, PINE_BARK, K=6, n=3, seed=3)
    for x, z, a, L in ((0.28, -0.1, 0.5, 0.2), (-0.3, -0.16, 2.2, 0.2), (0.1, 0.26, 1.2, 0.17), (-0.36, 0.22, 3.0, 0.18)):
        frond(A, V(x, 0.082, z), V(math.cos(a), 0.05, math.sin(a)), L, 0.066, droop=0.1, lobes=2, lo='#1e5238', hi='#4e9460', tip_col='#74b878')

RUST = '#d8833e'
def basin(A, cx, cz, R, y0, hgt, k, K=22, full=True, chip=()):
    """a rimstone basin: a lobed cream wall flaring to the ground, a rolled lip, rust stains where it spills, a turquoise pool"""
    def wob(a): return 1 + 0.13 * math.sin(a * 4 + k * 2) + 0.06 * math.sin(a * 7 + k)
    def dent(a):
        d = 1.0
        for c, w, amt in chip:
            dd = abs(math.atan2(math.sin(a - c), math.cos(a - c)))
            if dd < w: d -= amt * (1 - dd / w)
        return d
    rows = []
    for fr, y in ((1.26, y0 - 0.02), (1.14, y0 + hgt * 0.4), (1.02, y0 + hgt * 0.92), (0.92, y0 + hgt * 1.04), (0.8, y0 + hgt * 0.84)):
        row = []
        for i in range(K):
            a = TAU * i / K; w = wob(a) * (dent(a) if fr < 1.1 else 1.0)
            h = y * (1 if dent(a) >= 0.99 or fr > 1.1 else 1) - (0 if dent(a) >= 0.99 or fr > 1.1 else hgt * 0.5)
            row.append(V(cx + math.cos(a) * R * w * fr, h, cz + math.sin(a) * R * w * fr))
        rows.append(row)
    S = Shell(0.8); grid(S, rows, True, meta=lambda i, j: (i, TAU * j / K)); S.orient()
    def p(q, n, m):
        i, a = m
        c = mix('#c8ad8c', '#fff4e2', clamp(n.y * 0.8 + 0.28))
        if i <= 2:
            sp = math.sin(a * 6 + k * 1.3) + 0.5 * math.sin(a * 11 + k)
            if sp > 0.35: c = mix(c, RUST, 0.72 * clamp((3 - i) / 2.5))
        if i == 3: c = mix(c, '#fffaf0', 0.6)
        return mul(c, 0.95 + 0.08 * nz(q, 10.0, (k, 0, 1)))
    A.add(S, p)
    W = Shell(0.2); wrows = []
    yw = y0 + hgt * 0.8
    for t in (0.8, 0.52, 0.24):
        wrows.append([V(cx + math.cos(TAU * i / K) * R * wob(TAU * i / K) * dent(TAU * i / K) * t, yw, cz + math.sin(TAU * i / K) * R * wob(TAU * i / K) * dent(TAU * i / K) * t) for i in range(K)])
    grid(W, wrows, True, pole1=V(cx, yw, cz), meta=lambda i, j: i); W.orient(UP)
    A.add(W, lambda q, n, m: mix('#2fa2c4', '#a8ecf2', clamp(math.hypot(q.x - cx, q.z - cz) / (R * 0.8)) ** 1.6) if m > 0 else '#c0f2f2')
    return S

SINTER = dict(lo='#b0987a', mid='#e4d2b6', hi='#fff6e6', warm='#f0d4aa', foot='#a08a6c')
def sinter_keep(A):
    basin_low = None
    for x, z, R_, s in ((0.52, 0.34, 0.085, 81), (-0.54, 0.2, 0.075, 82), (0.3, -0.5, 0.07, 83)):
        pebble(A, V(x, 0, z), R_, 0.62, s, SINTER, tris=30)
def sinter_full(A, r):
    sinter_keep(A)
    basin(A, 0.12, 0.14, 0.5, 0.0, 0.12, 0, K=28)
    basin(A, -0.08, -0.06, 0.36, 0.1, 0.14, 1, K=24)
    basin(A, -0.22, -0.22, 0.22, 0.22, 0.15, 2, K=18)
    for x, z, s in ((0.26, -0.3, 86), (-0.42, 0.14, 87)):
        pebble(A, V(x, 0.0, z), 0.09, 0.8, s, SINTER, tris=30)
def sinter_taken(A, r):
    sinter_keep(A)
    # the two upper basins chipped away down to crusty stumps in the lowest pool, whose rim is bitten; chips round the foot
    basin(A, 0.12, 0.14, 0.5, 0.0, 0.09, 0, K=28, chip=((0.7, 0.34, 0.2), (3.6, 0.3, 0.17)))
    stone(A, V(-0.1, 0.075, -0.1), (0.16, 0.06, 0.09, 0.14), seed=88, p=2.0, lumps=((3.0, 0.2), (6.0, 0.08)), planes=cuts(88, 2, 0.9, 0.18, 0.0), tris=90, pal=SINTER)
    stone(A, V(0.1, 0.075, 0.08), (0.08, 0.04, 0.06, 0.07), seed=89, p=2.0, lumps=((3.0, 0.2),), tris=36, pal=SINTER, sub=4)
    for x, z, a, s in ((0.6, 0.36, 1.0, 0.055), (-0.42, -0.26, 2.2, 0.05), (0.08, -0.46, 0.5, 0.06), (-0.26, 0.42, 1.6, 0.05), (0.56, -0.2, 0.2, 0.045)):
        chip(A, V(x, 0, z), s, a, '#f4e4cc', tilt=0.5)

ICE = ((0, 0, 0.82, 0.104, 0, 0), (0.16, 0.08, 0.56, 0.086, 0.35, 0.15), (-0.16, 0.1, 0.52, 0.08, -0.3, 0.25), (0.05, -0.17, 0.46, 0.076, 0.1, -0.4), (-0.11, -0.11, 0.33, 0.06, -0.3, -0.3), (0.27, -0.1, 0.31, 0.06, 0.5, -0.2), (-0.3, -0.02, 0.27, 0.056, -0.6, 0.0), (0.12, 0.26, 0.26, 0.052, 0.3, 0.5))
def ice_keep(A):
    S = mound(A, 0.47, 0.13, None, seed=1, rings=4, seg=22, bumps=0.15, noise_=0.09, paint=snow_paint(1), ao=0.35)
    return S
def iceCrystal_full(A, r):
    ice_keep(A)
    for i, (x, z, h, rr, tx, tz) in enumerate(ICE):
        crystal(A, V(x, 0.07, z), h, rr, tx, tz, yaw=i * 0.7, seed=i)
    for x, z, s in ((0.1, 0.14, 0.05), (-0.09, -0.04, 0.05), (0.2, -0.2, 0.04), (-0.2, 0.18, 0.045), (0.05, -0.05, 0.04)):
        snow_blob(A, V(x, 0.12, z), s, sc=(1.3, 0.6, 1.1), seed=int(x * 30) + 3)
def iceCrystal_taken(A, r):
    ice_keep(A)
    # snapped stumps where the crystals stood, one small shard left
    for i, (x, z, h, rr, tx, tz) in enumerate(ICE[:5]):
        crystal(A, V(x, 0.07, z), 0.085 + i * 0.002, rr * 0.98, tx * 0.5, tz * 0.5, yaw=i * 0.7, seed=i, broken=True)
    crystal(A, V(0.27, 0.05, -0.1), 0.14, 0.04, 0.5, -0.2, yaw=1.0, seed=3)
    for x, z, a in ((0.3, 0.2, 1.0), (-0.32, 0.12, 2.0), (-0.18, -0.3, 0.3)):
        chip(A, V(x, 0.06, z), 0.04, a, '#b4dcf8', tilt=0.5)

def stump_shared(A, r):
    mound(A, 0.52, 0.08, None, seed=6, rings=3, seg=24, bumps=0.15, noise_=0.09, paint=snow_paint(6), ao=0.35)
    K = 14; f = 7
    def rfn(rr, y, a):
        root = 1 + 0.2 * sstep(0.14, 0.0, y) * (0.5 + 0.5 * math.cos(a * 4 + 0.6)) ** 2
        return rr * root * (1 + 0.035 * math.cos(a * f))
    S = lathe([(0.34, -0.01), (0.3, 0.09), (0.265, 0.24), (0.25, 0.37), (0.235, 0.395)], K, rfn=rfn, ao=1.0); S.orient()
    bk = dict(bark='#694632', hi='#b68c62')
    A.add(S, lambda q, n, m: mul(mix(bk['bark'], bk['hi'], 0.25 + 0.5 * clamp(n.y + 0.45)), 0.8 + 0.28 * (0.5 + 0.5 * math.cos(m[1] * f)) ** 0.8))
    # the cut top's end grain, half under an icing of snow
    T = lathe([(0.235, 0.395), (0.17, 0.4), (0.1, 0.4), (0.0, 0.396)], K, ao=0.5); T.orient(UP)
    A.add(T, lambda q, n, m: ('#d0a678', '#f0d2a4', '#b48c60', '#7c5a3c')[m[0]])
    # the snow cap, an irregular icing with rounded drips over one side (about half the top)
    def edge(a):
        return 0.8 + 0.34 * math.cos(a - 2.2) + 0.1 * math.sin(a * 3 + 1) + 0.06 * math.sin(a * 5)
    rows = []; KK = 18
    for u in (1.0, 0.85, 0.55, 0.25):
        row = []
        for i in range(KK):
            a = TAU * i / KK; e = edge(a); rr = e * u * 0.27 + (0.018 if u == 1.0 else 0)
            lift = (1 - u) ** 0.5 * 0.08
            drop = 0.0
            if rr > 0.235: drop = -(rr - 0.235) * 1.5
            rows_y = 0.4 + 0.018 + lift + drop - (0.018 if u == 1.0 else 0)
            row.append(V(0.0 + math.cos(a) * min(rr, 0.262), rows_y, math.sin(a) * min(rr, 0.262)))
        rows.append(row)
    C = Shell(0.5); grid(C, rows, True, pole1=V(0.0, 0.5, 0.0), meta=lambda i, j: i); C.orient(UP)
    A.add(C, lambda q, n, m: mix(SNOW[0], SNOW[1], clamp(n.y * 1.3 - 0.1) if m > 0 else 0.35))
STUMP_MUSH = ((0.31, 0.2, 0.19, 0.08, 1), (0.2, 0.31, 0.135, 0.2, 2), (-0.34, 0.16, 0.16, -0.1, 3), (0.34, -0.16, 0.13, 0.15, 4))
def snowForage_full(A, r):
    stump_shared(A, r)
    for x, z, s, t, y in STUMP_MUSH: mushroom(A, V(x, 0.03, z), s, tilt=t, yaw=y, spots=2, cap='#a4623c', cap_hi='#d89e6c')
    # a little honey pot someone left in the snow: glazed, its gold honey showing under a terracotta lid
    M = Matrix.Translation(V(-0.17, 0.035, -0.34))
    pot = lathe([(0.075, -0.01), (0.1, 0.05), (0.09, 0.12), (0.064, 0.15), (0.074, 0.17), (0.0, 0.172)], 10, M=M, ao=0.7); pot.orient()
    A.add(pot, lambda q, n, m: ('#ffb438', '#ffc248', '#ffd868', '#f4e4c8', '#fff2d8', '#fff2d8')[m[0]])
    lid = lathe([(0.086, 0.165), (0.08, 0.19), (0.03, 0.205), (0.024, 0.225), (0.0, 0.236)], 9, M=M, ao=0.3); lid.orient()
    A.add(lid, lambda q, n, m: mix('#a84e28', '#e08a54', clamp(n.y * 0.7 + 0.2)))
def snowForage_taken(A, r):
    stump_shared(A, r)
    for x, z, s, t, y in STUMP_MUSH:
        S = lathe([(s * 0.34, -0.01), (s * 0.3, s * 0.2), (0.0, s * 0.22)], 6, M=Matrix.Translation(V(x, 0.03, z)), ao=0.5); S.orient(); A.add(S, lambda q, n, m: '#f2e6d0' if m[0] < 2 else '#e8d4b0')
    # the pot's round print left in the snow
    S = lathe([(0.12, 0.06), (0.1, 0.075), (0.085, 0.066), (0.0, 0.058)], 10, M=Matrix.Translation(V(-0.17, 0.0, -0.34)), ao=0.3); S.orient(UP)
    A.add(S, lambda q, n, m: ('#d4e0f2', '#f4f8ff', '#b4c6e0', '#a8bcd8')[m[0]])

# ====================================================================
MODELS = ['driftwood', 'riverStone', 'petalDrift', 'mulberry', 'culms', 'mossRubble', 'cocoons', 'shoots', 'branches', 'terrace', 'mapleLeaves', 'honeyLog', 'seaDrift', 'seaStones', 'netScraps', 'seaGlass', 'seaweed', 'pine', 'sinter', 'iceCrystal', 'snowForage']
BUDGET = {'full': 1500, 'taken': 900}

def build_one(model, look):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    A = Asset(); r = random.Random(sum(ord(c) * (i + 1) for i, c in enumerate(model)) + (0 if look == 'full' else 1000))
    globals()['%s_%s' % (model, look)](A, r)
    return export(A, 'prop-scav-%s-%s' % (model, look), MODELS_DIR, None, BUDGET[look])

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    piece = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
    jobs = []
    for tok in piece.split(','):
        if tok == 'all': jobs += [(m, l) for m in MODELS for l in ('full', 'taken')]
        elif tok.endswith('-full') or tok.endswith('-taken'):
            m, l = tok.rsplit('-', 1); jobs.append((m, l))
        elif tok: jobs += [(tok, 'full'), (tok, 'taken')]
    t0 = time.time()
    for m, l in jobs: build_one(m, l)
    print('SCV done %d in %.1fs' % (len(jobs), time.time() - t0))
main()
