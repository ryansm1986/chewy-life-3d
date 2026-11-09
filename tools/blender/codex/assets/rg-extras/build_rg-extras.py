# PAWHAVEN rg-extras: the regions' remaining signature props, built in Blender by script.
#   blender --background --factory-startup --python build_rg-extras.py -- --piece taikobashi|bench|sheaf|bale|snowTorii|all
# Deterministic: seeded PRNGs only. 1 unit = 1 m, Blender Z up; each piece sits in its kit piece's local frame (the kit's
# (x, y, z) is Blender (x, -z, y)): same origin, facing, ground. Kits: base_kit + rg_kit + dg_common (the fixed exporter:
# uv written (u, 1 - v)) + snow_kit, copied from dg-onsen. Materials: body, glow, leaf, cloth.
#
# THE DECK: the taikobashi's walking surface is deckAt(z) = 0.3 + 0.85 cos(z / 3.8 * pi / 2) (mapleProps.js at
# { L: 7.6, w: 1.8, rise: 0.85 }). Every plank's top is the chord of that curve over its span, lifted half its sag. The
# bridge skips finish()'s warp, which would move the deck. deck_check.py measures the exported GLB.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
for _f in ('dg_common.py', 'snow_kit.py'):
    _p = os.path.join(HERE, _f)
    exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))

# ================================================================== shared helpers (from hollow-misc, rg-maple)
def frame_of(nrm):
    z = nrm.normalized(); xa = (X if abs(z.x) < 0.9 else Y).cross(z).normalized(); return xa, z.cross(xa), z

def blossom(c, nrm, r, rot, per=2, notch=0.32, cup=0.3, dome=0.18, petals=5):
    xa, ya, z = frame_of(nrm); t = Tmp(); ids = []; M = petals * per
    for k in range(M):
        a = rot + TAU * k / M
        f = abs((k % per) / per - 0.5) * 2
        rr = r * (1 - notch * f ** 2)
        ids.append(t.vert(c + (xa * math.cos(a) + ya * math.sin(a)) * rr + z * (cup * r * (rr / r) ** 2)))
    top = t.vert(c + z * r * dome); bot = t.vert(c - z * r * 0.1)
    for k in range(M):
        t.face([top, ids[k], ids[(k + 1) % M]], z); t.face([bot, ids[(k + 1) % M], ids[k]], -z)
    return t

def leaf_card(base, d, up, L, W, cup=0.35):
    d = d.normalized(); s = d.cross(up).normalized(); n = s.cross(d).normalized()
    t = Tmp()
    rim = [(0.0, 0.0), (0.3, 0.85), (0.66, 0.7), (1.0, 0.0), (0.66, -0.7), (0.3, -0.85)]
    ids = [t.vert(base + d * (u * L) + s * (w * W * 0.5) + n * (abs(w) * cup * W * 0.5 - 0.12 * W * u)) for u, w in rim]
    top = t.vert(base + d * (0.45 * L) + n * (W * 0.12)); bot = t.vert(base + d * (0.45 * L) - n * (W * 0.1))
    for k in range(6):
        t.face([top, ids[k], ids[(k + 1) % 6]], n); t.face([bot, ids[(k + 1) % 6], ids[k]], -n)
    return t

def tube_lite(path, rad, K=5):
    Fr = frames(path); n = len(path); rings, cs = [], []
    for i, (p, (T, W, U)) in enumerate(zip(path, Fr)):
        r = rad(i / (n - 1))
        rings.append([p + W * (r * math.cos(TAU * k / K)) + U * (r * math.sin(TAU * k / K)) for k in range(K)]); cs.append(p)
    t = Tmp()
    ring_surface(t, rings, cs, path[0] - Fr[0][0] * rad(0.0) * 0.7, path[-1] + Fr[-1][0] * rad(1.0) * 0.8)
    return t

def ring_flat(c, r0, r1, K, z=0.0):
    t = Tmp(); a = [t.vert(c + Vector((math.cos(TAU * k / K) * r0, math.sin(TAU * k / K) * r0, z))) for k in range(K)]
    b = [t.vert(c + Vector((math.cos(TAU * k / K) * r1, math.sin(TAU * k / K) * r1, z))) for k in range(K)]
    for k in range(K): t.face([a[k], a[(k + 1) % K], b[(k + 1) % K], b[k]], Z)
    return t

def cushion(c, r, h, seed=0, K=9, lobes=4, amp=0.16, sy=1.0):
    """a plump moss pad: rounded rim, domed top, a lobed outline"""
    ph = seed * 1.7
    t = lathe([(0.0, -0.01), (r * 0.92, -0.01), (r, h * 0.3), (r * 0.8, h * 0.74), (r * 0.42, h * 0.97), (0.0, h)], K, sy=sy, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + amp * math.cos(lobes * th + ph) + 0.05 * math.sin(3 * th + seed)))
    return t.xform(Matrix.Translation(c))

def rrect(w, h, r, k=1):
    pts = []; hw, hh = w / 2 - r, h / 2 - r
    for cx, cy, a0 in ((hw, -hh, -math.pi / 2), (hw, hh, 0.0), (-hw, hh, math.pi / 2), (-hw, -hh, math.pi)):
        for j in range(k + 1):
            a = a0 + math.pi / 2 * j / k; pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts

def moss_paint(seed=3):
    def f(p, n):
        c = mix('#3f6630', '#648c3e', smooth(-0.15, 0.45, n.z))
        c = mix(c, '#8fb058', smooth(0.55, 0.95, n.z) * 0.8)
        g = vnoise(p, 9, seed)
        return mix(c, '#8fb058', clamp((g - 0.55) * 2.0) * 0.3)
    return f

def maple_flake(c, size, rot, colr, nrm=Z, tag='fallen'):
    """a fallen maple leaf: a five-pointed star lens lying on a surface"""
    xa, ya, z = frame_of(nrm); t = Tmp(); ids = []; rr = [1.0, 0.42, 0.82, 0.38, 0.62, 0.3, 0.62, 0.38, 0.82, 0.42]
    for k in range(10):
        a = rot + TAU * k / 10
        ids.append(t.vert(c + (xa * math.cos(a) + ya * math.sin(a)) * (size * rr[k])))
    top = t.vert(c + z * 0.012); bot = t.vert(c - z * 0.004)
    for k in range(10):
        t.face([top, ids[k], ids[(k + 1) % 10]], z); t.face([bot, ids[(k + 1) % 10], ids[k]], -z)
    put(t, lambda p, n: mul(colr, 0.8 + 0.25 * clamp(n.z)), tag, 'body')

def paper_lantern(top, r, h, colr, K=8, N=6, flick=0.6, cord=0.05, tag='lanterns'):
    """a ribbed round chochin hanging from top (Blender): a cord, dark caps, the paper (glow, uv = (flicker, tint))"""
    put(tube_lite([top + Vector((0, 0, 0.004)), top - Vector((0, 0, cord))], lambda s: 0.016, K=3), '#3a2c2a', tag, 'body')
    z0 = top.z - cord - 0.01
    def cap(zc, rr):
        return lathe([(0, zc - 0.022), (rr * 0.92, zc - 0.022), (rr, zc), (rr * 0.92, zc + 0.022), (0, zc + 0.022)], 6).xform(Matrix.Translation((top.x, top.y, 0)))
    dk = lambda p, n: mix('#2a2024', '#584440', clamp(n.z))
    put(cap(z0, r * 0.5), dk, tag, 'body'); put(cap(z0 - h, r * 0.5), dk, tag, 'body')
    prof = [(0, z0 - h + 0.008)]
    for k in range(N + 1):
        u = k / N
        prof.append((r * (0.42 + 0.58 * math.sin(u * math.pi) ** 0.42) * (1.0 if k % 2 else 0.955), z0 - h + u * h))
    prof.append((0, z0 - 0.008))
    cc = srgb(colr); rib = mul(cc, 0.78); lit = mix(cc, '#fffaf0', 0.28); zc = z0 - h / 2
    def f(p, n):
        k = round((p.z - (z0 - h)) / h * N); u = clamp(1 - abs(p.z - zc) / (h / 2))
        return mix(cc if k % 2 else rib, lit, u * 0.4 * (k % 2))
    put(lathe(prof, K, th0=0.1).xform(Matrix.Translation((top.x, top.y, 0))), f, tag, 'glow', uv=lambda p: (flick, 0.0))

STRAW_C = '#e2bc70'; STRAW_HI = '#f8e2a0'; STRAW_LO = '#94703a'; STRAW_HEAD = '#d8a23e'
def straw_col(base=STRAW_C, hi=STRAW_HI, lo=STRAW_LO, seed=0, cx=0.0, cy=0.0, cols=0, f=23, k=0.32):
    def col(p, n):
        th = math.atan2(p.y - cy, p.x - cx)
        if cols:
            kk = round(th / TAU * cols) % cols
            st = 0.5 + 0.5 * (1 if kk % 2 else -1) * (0.6 + 0.4 * math.sin(kk * 2.3 + seed))
        else:
            st = 0.5 + 0.5 * math.sin(th * f + p.z * 3.0 + seed) * math.sin(th * (f * 0.61) + seed * 2)
        c = mix(base, hi, clamp(n.z) * 0.45 + st * k)
        return mix(c, lo, clamp(-n.z) * 0.55 + (1 - st) * k * 0.9)
    return col

def rope_col_fn(a='#d8b878', b='#94703e', f=55):
    def col(p, n):
        return mix(a, b, 0.5 + 0.5 * math.sin((p.x + p.y) * f + p.z * f * 0.7 + math.atan2(n.z, math.hypot(n.x, n.y)) * 3))
    return col

# ================================================================== 1. the taikobashi (kit taikobashi at L 7.6, w 1.8, rise 0.85)
BL, BW, BRISE, BDECK = 7.6, 1.8, 0.85, 0.3
def dh(s): return BDECK + BRISE * math.cos(clamp(s / (BL / 2), -1, 1) * PI / 2)     # = the kit's deckAt
def dslope(s): e = 1e-4; return (dh(s + e) - dh(s - e)) / (2 * e)
XB, XE = 0.985, 1.06                 # the rail / beam line, the round end posts (all clear the walkway |x| < 0.85)
LAC = '#e03c28'; LAC_DK = '#9e2a2a'; LAC_HI = '#f4684a'
PLANKS = ['#e4ac72', '#dba268', '#ecb87e', '#d09660']; SEAM = '#3a241c'; IRON = '#4a4650'
LDIR2 = Vector((-0.35, -0.55, 0.76)).normalized()

def lac_col(ao_z=None):
    def f(p, n):
        c = mix(LAC, LAC_DK, clamp(-n.z * 1.25 + 0.1))
        c = mix(c, LAC_HI, smooth(0.35, 1.0, n.z) * 0.4)
        c = mul(c, 0.94 + 0.1 * clamp(n.dot(LDIR2)))
        if ao_z is not None: c = mul(c, 0.76 + 0.24 * smooth(ao_z, ao_z + 0.6, p.z))
        return c
    return f

def bronze_col(p, n):
    c = mix('#9c7a3c', '#4e3818', clamp(-n.z * 1.4 + 0.35) * 0.8)
    c = mix(c, '#f0cf7e', clamp(n.z * 1.5 - 0.35) * 0.8)
    if 0.6 < n.z < 0.9: c = mix(c, '#fff0c4', 0.35)
    return c

def arch_path(x, off, s0, s1, n):
    return [Vector((x, s0 + (s1 - s0) * i / (n - 1), dh(s0 + (s1 - s0) * i / (n - 1)) + off)) for i in range(n)]

def stone_c(tint, seed, moss=False):
    pf = stone_paint(tint, hi='#dcd4d4', lo='#6e6678', seed=seed)
    def f(p, n):
        c = pf(p, n)
        return mul(c, 0.82 + 0.18 * smooth(-0.35, 0.15, p.z))
    return f

def finial(c, big):
    pr = ([(0, 0), (0.17, 0), (0.17, 0.035), (0.125, 0.058), (0.15, 0.13), (0.118, 0.215), (0.05, 0.27), (0.04, 0.32), (0, 0.39)] if big else
          [(0, 0), (0.1, 0), (0.1, 0.035), (0.088, 0.085), (0.052, 0.14), (0, 0.18)])
    put(lathe(pr, 8 if big else 5, th0=0.2).xform(Matrix.Translation(c)), bronze_col, 'finials', 'body')

def flower_box(sg, sc, rng):
    """an autumn planter on iron brackets outside the rail: chrysanthemums over two layers of leaf cards (dark inside)"""
    ang = math.atan(dslope(sc)); L = 0.96
    Mw = Matrix.Translation((sg * (XB + 0.235), sc, dh(sc) + 0.03)) @ Matrix.Rotation(ang, 4, 'X')
    def P(x, y, z): return Mw @ Vector((sg * x, y, z))
    def rb(size, pos, col, tag='fbox', r=0.03):
        put(rbox(size, r=r, M=Mw @ M_at(Vector((sg * pos[0], pos[1], pos[2])))), col, tag, 'body')
    plank = lambda c: (lambda p, n: mul(c, 1.08 if n.z > 0.6 else (0.98 if abs(n.z) < 0.4 else 0.78)))
    rb((0.28, L, 0.12), (0, 0, -0.062), plank('#94643a')); rb((0.28, L, 0.12), (0, 0, 0.062), plank('#a8743f'))
    for y in (-0.33, 0.33):
        rb((0.3, 0.05, 0.25), (0, y, 0), lambda p, n: mul(IRON, 0.9 + 0.32 * clamp(n.z + 0.3)), 'fbox_iron', r=0.012)
        rb((0.05, 0.05, 0.2), (-0.15, y, -0.2), IRON, 'fbox_iron', r=0.0)
    rb((0.25, L - 0.05, 0.03), (0, 0, 0.116), '#574436', 'fbox', r=0.0)
    # the dark inner layer of leaves, then the lighter outer one spilling over the lip (cards only)
    for i in range(14):
        inner = i < 6
        yy = -0.42 + 0.84 * ((i * 0.618 + 0.13) % 1.0); out = 1 if i % 3 else -1
        b = P(out * (0.03 if inner else 0.08), yy, 0.13)
        d = (Mw.to_3x3() @ Vector((sg * out * (0.45 if inner else 0.85), rng.uniform(-0.5, 0.5), 0.55 if inner else rng.uniform(-0.25, 0.25)))).normalized()
        L2 = rng.uniform(0.15, 0.19) if inner else rng.uniform(0.13, 0.17)
        tone = mix('#2c5c2a', '#3f7a38', rng.random()) if inner else rng.choice(['#5a9a48', '#6fae50', '#8ab84e', '#c89a3a', '#d8602e'] if i % 5 == 0 else ['#5a9a48', '#6fae50', '#8ab84e'])
        put(leaf_card(b, d, Vector((0, 0, 1)), L2, L2 * 0.66, cup=0.4), lambda p, n, tone=tone, b=b, L2=L2: mul(mix(mul(tone, 0.72), tone, smooth(0.0, 0.6, (p - b).length / L2)), 0.95 + 0.1 * clamp(n.z)), 'fbox_leaves', 'leaf')
    mums = ['#ffb23a', '#ff7f3a', '#fff0c8', '#f4563a', '#ffc85a', '#ff9440', '#fff0c8']
    nrm = (Mw.to_3x3() @ Vector((sg * 0.35, 0, 1))).normalized()
    for i in range(6):
        y = -0.34 + i * 0.136 + rng.uniform(-0.015, 0.015); x = (0.05 if i % 2 else -0.05) + rng.uniform(-0.015, 0.015)
        p0 = P(x, y, 0.215 + (0 if i % 2 else 0.04)); R = rng.uniform(0.078, 0.095); colr = mums[i]
        put(blossom(p0, nrm, R, rng.uniform(0, TAU), per=2, petals=7, notch=0.34), lambda q, n, p0=p0, colr=colr, R=R: mix(mix(colr, '#fff8e4', 0.3), colr, smooth(R * 0.15, R * 0.75, (q - p0).length)), 'fbox_flowers', 'leaf')
        put(ellipsoid(p0 + nrm * 0.016, (0.021, 0.021, 0.013), K=5, J=2), '#ffd24a' if colr != '#ffc85a' else '#e8703a', 'fbox_flowers', 'leaf')

def build_taikobashi():
    new_asset(); rng = random.Random(4517)
    # ---- the deck: 24 broad planks, each top the chord of deckAt over its span
    NP = 24; step = BL / NP; tones = []
    for i in range(NP):
        s0 = -BL / 2 + i * step; s1 = s0 + step; sm = (s0 + s1) / 2; z0, z1 = dh(s0), dh(s1)
        ang = math.atan2(z1 - z0, s1 - s0); L_ = math.hypot(s1 - s0, z1 - z0)
        nrm = Vector((0, -math.sin(ang), math.cos(ang)))
        sag = (dh(sm) - (z0 + z1) / 2) * 0.55
        top = Vector((0, sm, (z0 + z1) / 2 + sag))
        wx = 1.86 + rng.uniform(0.0, 0.03); xo = rng.uniform(-0.008, 0.008)
        pc = mul(PLANKS[(i * 7 + (i // 5)) % 4], 1 + rng.uniform(-0.04, 0.04)); sd = i
        def pf(p, n, pc=pc, sd=sd):
            if n.z > 0.9: c = mul(pc, 1.0 + 0.08 * (vnoise(Vector((p.x * 1.2, p.y * 9, 0)), 2.2, sd) - 0.5) * 2)
            else: c = mul(pc, 0.78 if n.z > -0.5 else 0.6)
            return mul(c, 1 - 0.1 * smooth(0.72, 0.93, abs(p.x)))
        put(rbox((wx, L_ - 0.034, 0.1), r=0.024, M=M_at(top - nrm * 0.05 + Vector((xo, 0, 0)), rx=ang)), pf, 'planks', 'body')
        if i % 3 == 0:
            for sx in (-1, 1):
                c = top + Vector((sx * 0.8, rng.uniform(-0.03, 0.03), 0)) + nrm * 0.001
                xa, ya, zz = frame_of(nrm); t = Tmp()
                ids = [t.vert(c + (xa * math.cos(TAU * k / 4 + 0.4) + ya * math.sin(TAU * k / 4 + 0.4)) * 0.026) for k in range(4)]
                tp = t.vert(c + zz * 0.008); bt = t.vert(c - zz * 0.005)
                for k in range(4):
                    t.face([tp, ids[k], ids[(k + 1) % 4]], zz); t.face([bt, ids[(k + 1) % 4], ids[k]], -zz)
                put(t, lambda p, n: mix('#7e6c62', '#a8988c', clamp(n.z - 0.5)), 'pegs', 'body')
    put(sweep(arch_path(0, -0.125, -BL / 2 + 0.02, BL / 2 - 0.02, 11), [(0.92, -0.02), (0.92, 0.02), (-0.92, 0.02), (-0.92, -0.02)]), SEAM, 'seam', 'body')
    # ---- side beams: a thick rounded curb at the deck's edge, dark cherry underneath; they die into the end posts
    for sx in (-1, 1):
        put(sweep(arch_path(sx * XB, -0.09, -3.66, 3.66, 11), rrect(0.2, 0.3, 0.065, 1)), lac_col(), 'beams', 'body')
    # ---- rails: a round top rail, a mid rail, end post to end post
    ZE = BL / 2 - 0.16
    for sx in (-1, 1):
        put(tube_lite(arch_path(sx * XB, 0.72, -ZE, ZE, 11), lambda s: 0.06, K=7), lac_col(), 'rails', 'body')
        put(tube_lite(arch_path(sx * XB, 0.38, -ZE, ZE, 11), lambda s: 0.046, K=5), lac_col(), 'rails', 'body')
    # ---- posts: stout rounded-square with bronze acorn caps; on one side (-x) three tall ones carry the lantern cord
    PZ = (-2.52, -1.26, 0.0, 1.26, 2.52); TALL = 1.72; tops = {}
    for sx in (-1, 1):
        for s in PZ:
            y = dh(s); tall = sx < 0 and s not in (-1.26, 1.26); t_ = y + (TALL if tall else 0.84); b = y - 0.06; w_ = 0.17 if tall else 0.155
            put(rbox((w_, w_, t_ - b), r=0.045, M=M_at(Vector((sx * XB, s, (t_ + b) / 2)))), lac_col(), 'posts', 'body')
            finial(Vector((sx * XB, s, t_ - 0.004)), False)
            if tall:
                tops[s] = Vector((sx * (XB + 0.1), s, t_ - 0.15))
                put(rbox((0.2, 0.2, 0.05), r=0.014, M=M_at(Vector((sx * XB, s, y + 0.84)))), bronze_col, 'post_bands', 'body')
    # ---- round end posts on the abutments: a dark collar, thick rope lashings, big bronze onion finials
    ZP = BL / 2 - 0.14
    for s0 in (-1, 1):
        for sx in (-1, 1):
            s = s0 * ZP; y = dh(s); b = 0.1; t_ = y + 0.9
            prof = [(0, b), (0.15, b), (0.142, t_ - 0.07), (0.158, t_ - 0.06), (0.158, t_ - 0.008), (0.12, t_), (0, t_)]
            put(lathe(prof, 8, th0=0.13).xform(Matrix.Translation((sx * XE, s, 0))),
                lambda p, n, t_=t_: mix(LAC_DK, '#5a1e20', 0.35) if p.z > t_ - 0.065 else lac_col()(p, n), 'end_posts', 'body')
            finial(Vector((sx * XE, s, t_ - 0.004)), True)
            zr = y + 0.12; rp = [(0, zr - 0.035), (0.145, zr - 0.035)]
            for k in range(2):
                zc = zr + k * 0.07
                rp += [(0.172, zc - 0.022), (0.185, zc), (0.172, zc + 0.022)] + ([(0.156, zc + 0.035)] if k < 1 else [])
            rp += [(0.145, zr + 0.07 + 0.035), (0, zr + 0.07 + 0.035)]
            def rope_c(p, n, cx=sx * XE, cy=s):
                th = math.atan2(p.y - cy, p.x - cx); w = 0.5 + 0.5 * math.sin(th * 5 + p.z * 95)
                return mul(mix('#a8844c', '#dcbc7c', 0.45 + 0.55 * w), 0.82 + 0.22 * clamp(n.z * 0.6 + 0.5))
            put(lathe(rp, 7, th0=0.2).xform(Matrix.Translation((sx * XE, s, 0))), rope_c, 'rope', 'body')
    # ---- the lantern cord: a sagging cord between the tall posts, paper lanterns hanging outside the rail
    LC = ['#fff0d0', '#f25a3c', '#ffe2a8', '#ffe2a8', '#f25a3c', '#fff0d0']
    for bay, (sa, sb) in enumerate(((-2.52, 0.0), (0.0, 2.52))):
        Pa, Pb = tops[sa], tops[sb]
        at_ = lambda u, Pa=Pa, Pb=Pb: Pa.lerp(Pb, u) - Z * (math.sin(u * math.pi) * 0.26)
        put(tube_lite([at_(k / 10) for k in range(11)], lambda s: 0.017, K=3), '#3a2c2a', 'cord', 'body')
        for i, u in enumerate((0.27, 0.73)):
            paper_lantern(at_(u), 0.165, 0.27, LC[bay * 2 + i])
    for s in (-2.52, 0.0, 2.52):
        p = tops[s]
        put(rbox((0.195, 0.195, 0.045), r=0.012, M=M_at(Vector((-XB, s, p.z)))), lambda p_, n: mix('#2c2224', '#54423e', clamp(n.z)), 'cord', 'body')
    # ---- legs: thick red legs under the posts in mossy stone sockets (the river stands at y -0.3, its bed at -0.82)
    for s in (-2.52, -1.26, 1.26, 2.52):
        y = dh(s); lt = y - 0.2; lb = -0.3
        for sx in (-1, 1):
            put(rbox((0.2, 0.2, lt - lb), r=0.05, M=M_at(Vector((sx * XB, s, (lt + lb) / 2)))), lac_col(ao_z=-0.1), 'legs', 'body')
            sd = rng.randrange(1000); ph = rng.uniform(0, TAU)
            prof = [(0, -1.0), (0.3, -1.0), (0.31, -0.3), (0.28, -0.16), (0.2, -0.1), (0, -0.09)]
            put(lathe(prof, 6, th0=ph, rfn=lambda r, z, th, sd=sd: r * (1 + 0.03 * math.sin(3 * th + sd))).xform(Matrix.Translation((sx * XB, s, 0))), stone_c('#a8a0a8', sd), 'sockets', 'body')
            if ((sx > 0) == (s > 0) and abs(s) < 2) or (sx > 0 and abs(s) > 2):
                a = rng.uniform(0, TAU); c = Vector((sx * XB + math.cos(a) * 0.14, s + math.sin(a) * 0.14, -0.16))
                put(cushion(c, 0.16, 0.085, seed=sd, K=7), moss_paint(sd), 'moss', 'body')
            if abs(s) < 2:
                put(ring_flat(Vector((sx * XB, s, -0.285)), 0.33, 0.39, 10), '#c4dce8', 'ripples', 'body')
        if abs(s) < 2: put(rbox((2.14, 0.16, 0.13), r=0.03, M=M_at(Vector((0, s, y - 0.3)), rx=math.atan(dslope(s)))), lambda p, n: mul(LAC_DK, 0.82 + 0.18 * clamp(n.z + 0.5)), 'cross_beams', 'body')
    # ---- abutments: chunky cut blocks under the deck ends, flanking blocks under the end posts, two low stone steps
    TINTS = ['#b0a9ae', '#a49ca4', '#bab2aa', '#aca4aa', '#b4aba2']
    for sg in (-1, 1):
        for sx in (-1, 1):
            for k, (z0, z1, x0, x1, s0, s1) in enumerate(((-0.55, 0.2, 0.66, 1.4, 3.28, 3.84), (-0.45, 0.08, 0.9, 1.44, 3.86, 4.28))):
                size = (x1 - x0 - 0.03 + rng.uniform(-0.02, 0.02), s1 - s0 - 0.03, z1 - z0 - 0.02)
                c = Vector((sx * (x0 + x1) / 2 + rng.uniform(-0.015, 0.015), sg * (s0 + s1) / 2 + rng.uniform(-0.015, 0.015), (z0 + z1) / 2))
                sd = rng.randrange(999)
                put(rbox(size, r=0.06, M=M_at(c, rz=rng.uniform(-0.02, 0.02))), stone_c(rng.choice(TINTS), sd), 'abutments', 'body')
            c = Vector((sx * 1.3, sg * 3.48, 0.19))
            sd = rng.randrange(999)
            put(cushion(c, 0.2, 0.115, seed=sd, K=11, lobes=5, amp=0.1, sy=1.25), moss_paint(sd), 'moss', 'body')
        put(rbox((1.34, 0.5, 0.5), r=0.05, M=M_at(Vector((0, sg * 3.5, -0.12)))), stone_c('#9e969e', 5), 'abutments', 'body')    # under the planks
        put(rbox((1.7, 0.24, 0.5), r=0.055, M=M_at(Vector((0, sg * 3.92, -0.06)))), stone_c('#b4aca8', 7), 'steps', 'body')       # top y 0.19
        put(rbox((1.76, 0.3, 0.46), r=0.055, M=M_at(Vector((rng.uniform(-0.02, 0.02), sg * 4.16, -0.105)))), stone_c('#aca4a4', 9), 'steps', 'body')  # top y 0.125
    # ---- autumn planters on the plain side (+x) in the second bay from each end
    for sc in (-1.89, 1.89): flower_box(1, sc, rng)
    # ---- a few fallen maple leaves near the deck's edges and on the steps
    REDS = ['#e8482e', '#f06a2a', '#d83a34', '#f2a02e']
    for k, (x, s) in enumerate(((0.62, -2.9), (-0.68, -1.5), (0.72, 0.5), (-0.6, 2.3))):
        n_ = Vector((0, -dslope(s), 1)).normalized()
        maple_flake(Vector((x, s, dh(s) + 0.002)), 0.085, k * 1.7, REDS[k % 4], nrm=n_)
    return dict(deck='deckAt(z) = 0.3 + 0.85 cos(z / 3.8 * pi / 2)')

# ================================================================== 2. the bench (kit bench: seeds 0, 1, 2 share this)
def build_bench():
    new_asset(); rng = random.Random(77)
    w = 1.3; wd, lg = '#b8845a', '#59402f'
    rake = 0.142; postZ = lambda y: -0.18 - y * rake
    for i in range(3):
        add(beam(w, 0.06, 0.12, (0, 0.425, -0.12 + i * 0.13), c=0.018), wood(mul(wd, 0.94 + 0.06 * i), seed=i), 'seat')
    for i in range(2):
        y = 0.6 + i * 0.13
        add(beam(w - 0.06, 0.1, 0.04, (0, y, postZ(y) + 0.05), c=0.014, rx=-math.atan(rake)), wood(mul(wd, 0.96 + 0.05 * i), seed=4 + i), 'back')
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.1)
        add(gtube([(x, 0.0, postZ(0)), (x, 0.84, postZ(0.84))], 0.036, K=5), wood(lg, ao_z=0.0), 'legs')
        add(beam(0.07, 0.64, 0.07, (x, 0.32, 0.17), c=0.016), wood(lg, ao_z=0.0), 'legs')
        add(beam(0.06, 0.06, 0.42, (x, 0.37, 0.0), c=0.014), wood(lg), 'legs')
        add(beam(0.09, 0.045, 0.44, (x + sx * 0.005, 0.66, -0.02), c=0.014), wood(wd, seed=8), 'arms')
        add(sph(0.045, (x + sx * 0.005, 0.665, 0.2), sc=(1.05, 0.6, 1.0), K=7, J=3), wood(wd), 'arms')
    add(beam(w - 0.2, 0.05, 0.05, (0, 0.12, -0.2), c=0.012), wood(lg), 'legs')
    # the red felt cushion (kit: the left half of the seat): plump and piped, gold tassels at its front corners
    red = lambda p, n: mix('#a82c30', '#ee5a50', clamp(n.z * 0.7 + 0.25))
    add(rbox((0.54, 0.36, 0.085), r=0.038, seg=2, M=F.m @ lm((-0.27, 0.495, 0.0))), red, 'cushion')
    add(gloop([(-0.27 + 0.272 * math.copysign(abs(math.cos(TAU * k / 14)) ** 0.45, math.cos(TAU * k / 14)), 0.492, 0.182 * math.copysign(abs(math.sin(TAU * k / 14)) ** 0.45, math.sin(TAU * k / 14))) for k in range(14)], 0.015, K=3),
        lambda p, n: mix('#7c1e24', '#c23a3a', clamp(n.z + 0.4)), 'cushion')
    for xc in (-0.53, -0.01):
        add(sph(0.026, (xc, 0.47, 0.186), K=6, J=3), lambda p, n: mix('#b8882e', '#f8d06a', clamp(n.z + 0.3)), 'cushion')
        add(glathe([(0.0, 0.0), (0.024, 0.0), (0.017, 0.07), (0.0, 0.075)], 5, pos=(xc, 0.385, 0.186)), lambda p, n: mix('#b8882e', '#f0c860', clamp(p.z / 0.47)), 'cushion')
    # a tea tray on the bare half: a cup and a skewer of dango
    add(box(0.3, 0.03, 0.2, (0.32, 0.47, 0.01), r=0.012), wood('#6a4632'), 'tray')
    add(glathe([(0.0, 0.0), (0.032, 0.0), (0.048, 0.07), (0.04, 0.07), (0.0, 0.058)], 8, pos=(0.25, 0.485, 0.02)), lambda p, n: '#cfe0a0' if n.z > 0.9 and p.z > 0.53 else mix('#d8ccb8', '#fff4e2', clamp(n.z * 0.6 + 0.4)), 'tray')
    for k, c in enumerate(('#ffb4c4', '#fff4e2', '#a8cc70')):
        add(sph(0.034, (0.36 + k * 0.06, 0.52, 0.0), sc=(1, 0.95, 1), K=7, J=3), lambda p, n, c=c: mix(mul(c, 0.82), c, clamp(n.z + 0.5)), 'tray')
    add(gtube([(0.3, 0.52, 0.0), (0.53, 0.52, 0.0)], 0.015, K=3), '#c8a070', 'tray')
    # the lantern post (kit lanternPost at [0.95, 0, -0.15], h 1.4), its arm carrying the red chochin over the kit's light
    with at((0.95, 0, -0.15)):
        h = 1.4
        add(cyl(0.05, 0.062, h, (0, h / 2, 0), K=7), wood('#54402f', ao_z=0.0), 'post')
        add(cyl(0.125, 0.165, 0.13, (0, 0.06, 0), K=7, bev=0.02), stone_paint('#aaa2a6', seed=3), 'post')
        add(cyl(0.08, 0.1, 0.06, (0, 0.15, 0), K=7), stone_paint('#c0b8b8', seed=4), 'post')
        put(cushion(F.W((0.06, 0.115, 0.05)), 0.1, 0.05, seed=4, K=7), moss_paint(4), 'moss', 'body')
        for y in (0.3, h - 0.3):
            add(cyl(0.066, 0.066, 0.035, (0, y, 0), K=7), lambda p, n: mix(IRON, '#7c7884', clamp(n.z)), 'post')
        add(glathe([(0.0, 0.0), (0.088, 0.0), (0.02, 0.075), (0.0, 0.08)], 7, pos=(0, h, 0)), wood('#54402f'), 'post')
        add(sph(0.03, (0, h + 0.09, 0), K=6, J=3), bronze_col, 'post')
        add(beam(0.05, 0.05, 0.42, (0, h - 0.05, 0.19), c=0.012), wood('#54402f'), 'post')
        add(gtube([(0, h - 0.3, 0.04), (0, h - 0.07, 0.22)], 0.018, K=4), wood('#54402f'), 'post')
        add(cyl(0.03, 0.03, 0.04, (0, h - 0.05, 0.41), K=6, rx=PI / 2), bronze_col, 'post')
        paper_lantern(F.W((0, h - 0.08, 0.34)), 0.17, 0.3, '#ee4a38', K=10, N=8, flick=0.6, cord=0.035)
    # fallen maple leaves on the cushion, the seat and round the feet
    REDS = ['#e8482e', '#f06a2a', '#d83a34', '#f2a02e']
    for k, (x, y, z) in enumerate(((-0.14, 0.54, 0.05), (0.08, 0.457, 0.1), (-0.5, 0.012, 0.36), (0.28, 0.012, 0.38), (-0.08, 0.012, 0.44), (0.72, 0.012, 0.3), (-0.72, 0.012, 0.28))):
        maple_flake(F.W((x, y, z)), 0.075 + 0.012 * (k % 3), k * 1.9, REDS[k % 4])
    return dict(light=[0.95, 1.2, 0.2])

# ================================================================== 3. the sheaves (kit sheaf: bundles leaned into a tepee)
def fringe_tier(cx, cy, z_top, r_top, z_bot, r_bot, K, jag=0.05, teeth=12, bulge=0.03, thick=0.05, sy=1.0, seed=0, flare=0.0):
    """a thatch skirt round an axis (rg-maple's): a narrow top ring bulging down to a ragged fringed hem, a short lip back in"""
    t = Tmp(); rings = []; cs = []
    rng_ = random.Random(seed)
    jj = [rng_.uniform(0.6, 1.0) for _ in range(teeth)]
    def hem(th):
        u = (th / TAU * teeth) % 1.0; k = int(th / TAU * teeth) % teeth
        return jag * jj[k] * (1 - abs(2 * u - 1)) ** 1.5
    for s_ in (0.0, 0.3, 0.62, 0.86, 1.0):
        ring = []
        for k in range(K):
            th = TAU * k / K
            r = r_top + (r_bot - r_top) * s_ + bulge * math.sin(math.pi * s_) + flare * s_ ** 3
            z = z_top + (z_bot - z_top) * s_ - (hem(th) if s_ == 1.0 else 0.0)
            r *= 1 + 0.025 * math.sin(3 * th + seed) * s_
            ring.append(Vector((cx + math.cos(th) * r, cy + math.sin(th) * r * sy, z)))
        rings.append(ring); cs.append(Vector((cx, cy, z_top + (z_bot - z_top) * s_)))
    lip = []
    for k in range(K):
        th = TAU * k / K; r = r_bot - thick + flare * 0.6
        lip.append(Vector((cx + math.cos(th) * r, cy + math.sin(th) * r * sy, z_bot - hem(th) * 0.4 + 0.02)))
    rings.append(lip); cs.append(Vector((cx, cy, z_bot + 0.3)))
    ring_surface(t, rings, cs)
    return t

def bundle(a, foot, r0, seed):
    """one bundle of cut straw leaning into the stook: its cut foot flared, drawn in toward the top"""
    d = Vector((math.cos(a), math.sin(a), 0))
    pts = [d * foot + Z * -0.03, d * (foot * 0.88) + Z * 0.14, d * (foot * 0.68) + Z * 0.36, d * (foot * 0.48) + Z * 0.58, d * (foot * 0.3) + Z * 0.8]
    rads = [r0 * 1.12, r0, r0 * 0.86, r0 * 0.74, r0 * 0.66]
    t = tube(pts, lambda s: rads[min(4, round(s * 4))], K=8)
    base = d * (foot * 0.6)
    put(t, straw_col(seed=seed, cx=base.x, cy=base.y, cols=8, k=0.36), 'bundles', 'body')

def build_sheaf(v):
    new_asset(); rng = random.Random(211 + v * 17)
    n = 5 if v == 0 else 4; ox, oy = (0.0, 0.0) if v == 0 else (0.025, -0.02)
    for i in range(n):
        bundle(i / n * TAU + rng.uniform(0, 0.3) + (0.3 if v else 0), 0.2 if v == 0 else 0.215, 0.105 if v == 0 else 0.125, i + v * 7)
    # the band tying them
    R_ = 0.205 if v == 0 else 0.225; zb = 0.46
    pts = [Vector((math.cos(TAU * k / 14) * R_ * (1 + 0.05 * math.sin(k * 2.1)), math.sin(TAU * k / 14) * R_ * (1 + 0.05 * math.sin(k * 2.1)), zb + 0.012 * math.sin(k * 1.3))) for k in range(14)]
    put(tube_loop(pts, lambda s: 0.028, K=4), rope_col_fn('#c89a50', '#7e5a30', 40), 'band', 'body')
    kn = Vector((R_ * math.cos(-1.1), R_ * math.sin(-1.1), zb))
    put(ellipsoid(kn, (0.042, 0.036, 0.036), K=6, J=3), '#a87c3e', 'band', 'body')
    # the hood: the rice heads bowing over, a heavy fringed cap darker at its hem, with chunky ears hanging out of it
    Kh = 26 if v == 0 else 22; rb = 0.27 if v == 0 else 0.285
    put(fringe_tier(ox, oy, 1.0, 0.07, 0.66, rb, Kh, jag=0.09, teeth=13 if v == 0 else 11, bulge=0.05, thick=0.06, seed=v + 2, flare=0.025),
        lambda p, n, f=straw_col('#d6a040', '#f8d880', '#8e6a2c', seed=v, cx=ox, cy=oy, cols=Kh, k=0.36): mul(f(p, n), 0.8 + 0.2 * smooth(0.62, 0.8, p.z)), 'hood', 'body')
    NE = 12 if v == 0 else 10
    for k in range(NE):
        a = TAU * (k + rng.uniform(-0.2, 0.2)) / NE; o = Vector((math.cos(a), math.sin(a), 0)); L_ = rng.uniform(0.17, 0.23)
        b = Vector((ox, oy, 0)) + o * (rb - 0.06) + Z * (0.76 + 0.03 * (k % 2))
        pth = [b, b + o * (L_ * 0.24) + Z * (-L_ * 0.24), b + o * (L_ * 0.33) + Z * (-L_ * 0.6), b + o * (L_ * 0.34) + Z * (-L_ * 0.95)]
        def er(s): return 0.056 * (1 - 0.4 * s) * (1 + 0.1 * math.sin(s * 13))
        put(tube_lite(pth, er, K=4), lambda p, n, b=b, L_=L_: mix(mix('#b4842c', STRAW_HEAD, clamp(n.z + 0.6)), '#f6d880', clamp((p - b).length / L_) * 0.7), 'ears', 'body')
    # the tied topknot (kit top ~1.07)
    put(lathe([(0.0, 0.94), (0.09, 0.95), (0.065, 1.0), (0.085, 1.045), (0.0, 1.07)], 8, th0=0.3), straw_col(seed=v + 3, f=13), 'crown', 'body')
    put(tube_loop([Vector((ox + math.cos(TAU * k / 9) * 0.075, oy + math.sin(TAU * k / 9) * 0.075, 1.0)) for k in range(9)], lambda s: 0.021, K=3), rope_col_fn('#c89a50', '#7e5a30', 40), 'crown', 'body')
    if v == 1:
        for sx, sy, a in ((0.27, -0.08, 0.5), (-0.24, 0.16, 2.6)):
            p0 = Vector((sx, sy, 0.03)); o = Vector((math.cos(a), math.sin(a), 0))
            put(tube_lite([p0, p0 + o * 0.08 + Z * 0.01, p0 + o * 0.15 + Z * 0.02], lambda s: 0.02, K=4), straw_col(seed=2, f=9), 'loose', 'body')
    maple_flake(Vector((0.26, -0.24, 0.012)), 0.07, 1.1 + v, '#e8482e' if v else '#f06a2a')
    return dict(variant=v)

# ================================================================== 4. the bales (kit bale: a round bale, axis along x, r 0.55, 0.95 wide, centre y 0.53)
def build_bale(v):
    new_asset(); rng = random.Random(331 + v * 13)
    R, HW, CZ = 0.55, 0.475, 0.53; K = 18; ph = rng.uniform(0, TAU)
    wob = [rng.uniform(-1, 1) for _ in range(K)]
    amp = 0.012 if v == 0 else 0.022
    def rr(k, x): return R * (1 + amp * wob[int(k) % K] + 0.02 * math.sin(k * TAU / K * 3 + ph) * (1 if v else 0.5) - 0.018 * (abs(x) / HW) ** 4)
    def pt(x, k, kr=1.0):
        a = TAU * k / K; r = rr(k, x) * kr
        return Vector((x, math.cos(a) * r, CZ + math.sin(a) * r))
    # the rolled drum: rows across the width (a shallow groove under each twine), ends rolled in rings
    bands = (-0.25, 0.25) if v == 0 else (-0.3, 0.02, 0.32)
    xs = [-HW + 2 * HW * i / 8 for i in range(9)]
    rows_side = [[pt(x, k, 1 - 0.012 * max(0.0, 1 - min(abs(x - b) for b in bands) / 0.07)) for k in range(K)] for x in xs]
    # end faces: concentric rolled layers, ridges alternating, a hollow eye
    FRAC = [0.97, 0.87, 0.77, 0.67, 0.56, 0.45, 0.34, 0.23, 0.12]
    def end_rows(sg):
        out = []
        for j, fr in enumerate(FRAC):
            x = sg * (HW + (0.012 if j % 2 else -0.012) - 0.02 * (1 - fr))
            out.append([pt(sg * HW, k + 0.5 * (j % 2), fr) + Vector((x - sg * HW, 0, 0)) for k in range(K)])
        return out
    t = Tmp()
    rings = list(reversed(end_rows(-1))) + rows_side + end_rows(1)
    # (the rows were built from -x to +x; a centre for each row's outward hint is on the axis)
    cs = [Vector((r[0].x, 0, CZ)) for r in rings]
    ring_surface(t, rings, cs, Vector((-HW + 0.03, 0, CZ)), Vector((HW - 0.03, 0, CZ)),
                 hints=lambda fc, c: (fc - Vector((0, 0, CZ))) if abs(fc.x) < HW * 0.97 else Vector((math.copysign(1, fc.x), 0, 0)))
    tones = [rng.uniform(-1, 1) for _ in range(40)]
    def col(p, n):
        e = abs(n.x) > 0.75
        d = math.hypot(p.y, p.z - CZ) / R
        if e:      # rolled rings: light and dark layers (one tone per ring of the mesh), a dark eye
            j = min(range(len(FRAC)), key=lambda q: abs(FRAC[q] - d))
            c = mix('#b8903e', '#f4dc98', 0.08 if j % 2 else 0.95)
            return mul(c, (0.7 + 0.3 * smooth(0.0, 0.34, d)) * (0.91 + 0.16 * (0.5 + 0.5 * math.sin(math.atan2(p.z - CZ, p.y) * 7 + j * 2.1))))
        i = int(((p.x + HW) / (2 * HW)) * 8.01); a = math.atan2(p.z - CZ, p.y)
        st = 0.5 + 0.5 * math.sin(a * 11 + tones[i] * 3 + p.x * 30)
        c = mix('#d4ae62', '#f6dc98', st * 0.55 + clamp(n.z) * 0.45)
        return mix(c, '#94703a', clamp(-n.z) * 0.6)
    put(t, col, 'drum', 'body')
    # the twine
    for b in bands:
        pts = [pt(b, k, 1.012) for k in range(K)]
        put(tube_loop(pts, lambda s: 0.02, K=3), lambda p, n: mix('#6e4630', '#a8764e', clamp(n.z * 0.6 + 0.5)), 'twine', 'body')
    # loose straw: ragged tufts lying against the upper curve, never out past the foot (the bale also stacks)
    for i in range(10 if v == 0 else 9):
        a = rng.uniform(0.15, PI - 0.15); x = rng.uniform(-HW * 0.9, HW * 0.9); d = rng.choice((-1, 1))
        p0 = Vector((x, math.cos(a) * (R - 0.005), CZ + math.sin(a) * (R - 0.005)))
        a2 = a + d * 0.32
        p2 = Vector((x + rng.uniform(-0.06, 0.06), math.cos(a2) * (R + 0.05), CZ + math.sin(a2) * (R + 0.05)))
        put(tube_lite([p0, p0.lerp(p2, 0.55) + (p0 - Vector((x, 0, CZ))).normalized() * 0.02, p2], lambda s: 0.021 * (1 - 0.5 * s), K=3), lambda p, n: mix('#d8b86e', '#fbe8a8', clamp(n.z)), 'tufts', 'body')
    if v == 1:
        a = 1.0; maple_flake(Vector((0.14, math.cos(a) * (R + 0.012), CZ + math.sin(a) * (R + 0.012))), 0.075, 0.6, '#e8482e', nrm=Vector((0, math.cos(a), math.sin(a))))
    return dict(variant=v)

# ================================================================== 5. the snow torii (kit snowTorii; pillars sit exactly at x = +-w / 2: the colliders' places)
def snow_strip(x0, x1, ytop, zf0, zb0, H, seed, nx=24, tag='snow', drips=4, lip=0.06, yb=0.0):
    """a plump snow cushion along a beam (game frame, along x): a rounded top, a rolled lip hanging over both edges with rounded
    drips, tapering shut at both ends. ytop(x) = the beam's top."""
    rng = random.Random(seed * 37 + 5)
    df = [(rng.uniform(x0 * 0.85, x1 * 0.85), rng.uniform(0.25, 0.42), rng.uniform(0.2, 0.42) * lip * 1.6) for _ in range(drips)]
    db = [(rng.uniform(x0 * 0.85, x1 * 0.85), rng.uniform(0.25, 0.4), rng.uniform(0.2, 0.42) * lip * 1.3) for _ in range(max(2, drips - 1))]
    ph = rng.uniform(0, TAU); rings = []
    def ring(x):
        u = (2 * x - x0 - x1) / (x1 - x0); tap = max(0.0, 1 - abs(u) ** 7) ** 0.5
        ff = sum(a * math.exp(-((x - c) / w) ** 2) for c, w, a in df); bb = sum(a * math.exp(-((x - c) / w) ** 2) for c, w, a in db)
        zf = (zf0 + 0.012 * math.sin(x * 5.3 + ph) + ff * 0.4) * tap; zb = (zb0 + 0.012 * math.sin(x * 4.1 + ph * 2) + bb * 0.4) * tap
        h = H * tap * (1 + 0.18 * math.sin(x * 2.6 + ph) + 0.1 * math.sin(x * 6.1 + ph * 1.7))
        y = ytop(x) + yb
        lf = (lip + ff) * tap; lb = (lip + bb) * tap
        return [(x, y - lf * 0.15, zf * 0.62), (x, y - lf, zf * 1.02), (x, y - lf * 0.2, zf * 1.1), (x, y + h * 0.5, zf * 0.96), (x, y + h * 0.9, zf * 0.56), (x, y + h, zf * 0.12),
                (x, y + h * 0.95, -zb * 0.4), (x, y + h * 0.55, -zb * 0.92), (x, y - lb * 0.2, -zb * 1.1), (x, y - lb, -zb * 1.02), (x, y - lb * 0.15, -zb * 0.62)]
    xs = [x0 + (x1 - x0) * k / nx for k in range(nx + 1)]
    R = [ring(x) for x in xs[1:-1]]
    t = gsurf(R, pole0=(x0, ytop(x0) + yb, 0.0), pole1=(x1, ytop(x1) + yb, 0.0))
    add(t, SNOW, tag)

def build_snowTorii(w, h, seed):
    new_asset(); rng = random.Random(seed * 11 + 3)
    BLACK = lambda p, n: mix('#241c24', '#463a44', clamp(n.z * 0.6 + 0.4))
    # the pillars: exactly at +-w / 2, sunk below the ground for the slopes they stand on; black nemaki feet, a bronze band
    for sx in (-1, 1):
        prof = [(0.0, -0.4), (0.178, -0.4), (0.172, 0.0), (0.158, h * 0.5), (0.14, h + 0.02), (0.0, h + 0.03)]
        Mi = F.W((sx * w / 2, 0, 0))
        def pc(p, n, b=lacq(VERM, VERM_DK, VERM_HI, seed=3)):
            c = b(p, n)
            if p.z < 0.42: c = BLACK(p, n)
            return c
        t = lathe([(0.0, -0.4), (0.178, -0.4), (0.174, 0.05), (0.172, 0.4), (0.171, 0.42), (0.163, 0.44), (0.158, h * 0.5), (0.145, h * 0.85), (0.14, h + 0.02), (0.0, h + 0.03)], 12, th0=0.13)
        add(t.xform(Matrix.Translation(Mi)), pc, 'pillars')
        add(glathe([(0.0, 0.0), (0.178, 0.0), (0.184, 0.022), (0.178, 0.045), (0.0, 0.045)], 12, pos=(sx * w / 2, 0.41, 0)), bronze, 'pillars')
    # the nuki through both pillars, little wedges either side of them
    yN = h * 0.72
    add(beam(w + 0.56, 0.17, 0.15, (0, yN, 0), c=0.03), lacq(VERM, VERM_DK, VERM_HI), 'nuki')
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(box(0.09, 0.09, 0.03, (sx * (w / 2 + 0.0), yN, sz * 0.17), r=0.0), bronze, 'nuki')
    # the kasagi and the black shimaki over it, sweeping up at the tips
    XK = w / 2 + 0.74; XS = w / 2 + 0.84
    def sori(x, X_): u = abs(x) / X_; return 0.1 * u * u + 0.15 * u ** 6
    pK = [F.W((-XK + 2 * XK * i / 14, h + 0.04 + sori(-XK + 2 * XK * i / 14, XK), 0)) for i in range(15)]
    pS = [F.W((-XS + 2 * XS * i / 16, h + 0.195 + sori(-XS + 2 * XS * i / 16, XS), 0)) for i in range(17)]
    add(sweep(pK, rrect(0.3, 0.2, 0.05, 1), cap_d=0.02), lacq(VERM, VERM_DK, VERM_HI), 'kasagi')
    add(sweep(pS, rrect(0.36, 0.13, 0.05, 1), cap_d=0.02), BLACK, 'shimaki')
    # the centre strut and the gaku: a black tablet in a gold frame with a snowflake emblem (no text)
    add(beam(0.16, h + 0.0 - yN - 0.02, 0.1, (0, (yN + h) / 2, -0.015), c=0.02), lacq(VERM, VERM_DK, VERM_HI), 'gaku')
    yG = (yN + 0.085 + h - 0.06) / 2; hG = min(0.46, h - yN - 0.22)
    with at((0, yG, 0.05)):
        add(box(0.42, hG, 0.05, (0, 0, 0), r=0.016), BLACK, 'gaku')
        for sy in (-1, 1): add(box(0.46, 0.035, 0.065, (0, sy * hG / 2, 0), r=0.008), bronze, 'gaku')
        for sx in (-1, 1): add(box(0.035, hG, 0.065, (sx * 0.215, 0, 0), r=0.008), bronze, 'gaku')
        for k in range(3):
            a = k * PI / 3 + PI / 2
            add(box(0.034, hG * 0.56, 0.03, (0, 0, 0.03), r=0.0, rz=a), lambda p, n: mix('#d8a83e', '#ffe28a', clamp(n.y * -1 + 0.2)), 'gaku')
    # the shimenawa under the nuki with three shide, snow lying on it; the ends lashed round the pillars
    yR = yN - 0.2
    rp = [F.W((-w / 2 + w * k / 12, yR - 0.14 * math.sin(PI * k / 12), 0.0)) for k in range(13)]
    add(tube(rp, lambda s: 0.038 + 0.014 * math.sin(PI * s), K=6), rope_col(lambda p, n: p.x * 40 + math.atan2(n.z, -n.y) * 2), 'shimenawa')
    for sx in (-1, 1):
        add(gloop([(sx * w / 2 + math.cos(TAU * k / 9) * 0.172, yR, math.sin(TAU * k / 9) * 0.172) for k in range(9)], 0.028, K=4), rope_col(lambda p, n: p.z * 70), 'shimenawa')
    for u in (0.25, 0.5, 0.75):
        x = -w / 2 + w * u; yy = yR - 0.14 * math.sin(PI * u) - 0.035
        shide_tabs(F.W((x, yy, 0.03)), F.N((0, 0, 1)), scale=0.85, tag='shide', span=0.34)
    for u in (0.37, 0.86):
        x = -w / 2 + w * u; yy = yR - 0.14 * math.sin(PI * u) + 0.04
        pillow((x, yy, 0.0), 0.075, 0.5, 40 + int(u * 100), 1.8, 0.75, K=9, J=4, tag='ropeSnow', fine=False)
    # the snow: a plump cushion along the shimaki, heaped pillows on it, a thinner cushion on the nuki, icicles under the lips
    ytS = lambda x: h + 0.195 + sori(x, XS) + 0.05
    snow_strip(-XS - 0.02, XS + 0.02, ytS, 0.21, 0.2, 0.17, seed, nx=30, tag='snow', drips=6, lip=0.075)
    for k in range(4):
        x = (k - 1.5) * (w + 0.9) / 4 + rng.uniform(-0.12, 0.12)
        pillow((x, ytS(x) + 0.12, rng.uniform(-0.02, 0.02)), 0.26, 0.42, seed + k * 3, 1.55, 0.72, K=14, J=5, tag='snowPillows', fine=False)
    ytN = lambda x: yN + 0.085
    snow_strip(-w / 2 + 0.13, -0.12, ytN, 0.105, 0.1, 0.09, seed + 1, nx=max(6, int(w * 1.8)), tag='nukiSnow', drips=2, lip=0.04)
    snow_strip(0.12, w / 2 - 0.13, ytN, 0.105, 0.1, 0.09, seed + 2, nx=max(6, int(w * 1.8)), tag='nukiSnow', drips=2, lip=0.04)
    for sx in (-1, 1):
        xe = sx * (w / 2 + 0.2)
        pillow((xe, yN + 0.1, 0.0), 0.085, 0.55, 80 + sx, 1.0, 0.95, K=9, J=4, tag='nukiSnow', fine=False)
    for k in range(9):
        x = -XK * 0.86 + 2 * XK * 0.86 * (k + 0.5) / 9 + rng.uniform(-0.06, 0.06)
        if abs(x) < 0.34: continue
        sz = 1 if k % 3 else -1
        icicle(x, h - 0.05 + sori(x, XK), sz * 0.135, rng.uniform(0.09, 0.2), tag='ice', r0=0.032)
    # drifts round the feet (plump mounds, buried in the slope), a few stones breaking through
    for k, sx in enumerate((-1, 1)):
        x = sx * w / 2
        drift((x, -0.04, 0.03), 0.5, 0.3, seed=seed + 40 + k, sx=1.05, sz=0.95, K=18)
        drift((x + sx * 0.32, -0.03, 0.26), 0.3, 0.17, seed=seed + 50 + k, K=14)
        pebble((x - sx * 0.36, 0.02, -0.14), 0.09, sq=0.7, seed=seed + 70 + k, col='#8e96a8', tag='pebbles', K=7)
    return dict(w=w, h=h, colliders='x = +-%.2f' % (w / 2))

def bronze(p, n):
    return mix(mix('#8c6c34', '#c89a4a', clamp(n.z * 0.7 + 0.5)), '#ffe0a0', clamp(n.z - 0.4) * 0.7)

# ================================================================== run
SETS = {
    'taikobashi': [('rg-maple-taikobashi', build_taikobashi, 0, 0.0)],
    'bench': [('rg-maple-bench', build_bench, 13, 0.006)],
    'sheaf': [('rg-maple-sheaf-v0', lambda: build_sheaf(0), 19, 0.008), ('rg-maple-sheaf-v1', lambda: build_sheaf(1), 23, 0.008)],
    'bale': [('rg-maple-bale-v0', lambda: build_bale(0), 29, 0.006), ('rg-maple-bale-v1', lambda: build_bale(1), 31, 0.006)],
    # (v0: the trail torii, w = trailW * 2 + 1.2 = 4.2, h 3.0; v1: the arena gate, w 3.2, h 3.4)
    'snowTorii': [('rg-onsen-snowTorii-v0', lambda: build_snowTorii(4.2, 3.0, 0), 37, 0.005), ('rg-onsen-snowTorii-v1', lambda: build_snowTorii(3.2, 3.4, 9), 41, 0.005)],
}
names = list(SETS) if PIECE == 'all' else PIECE.split(',')
for key in names:
    for name, fn, sd, amt in SETS[key]:
        info = fn()
        if amt > 0:                                 # (never the taikobashi: its deck must stay on deckAt)
            kept = {k: list(o['c']) for k, o in A.objs.items()} if key == 'snowTorii' else None
            finish(A, seed=sd, amt=amt)
            if kept:                                # (the warp only: finish's ground shading greys the drifts against the snow)
                for k, o in A.objs.items(): o['c'] = kept[k]
        ray_ao(weights={'leaf': 0.4})
        export_piece(name, info)
print('RGX done')
