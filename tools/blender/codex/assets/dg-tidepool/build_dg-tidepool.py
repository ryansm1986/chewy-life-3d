# PAWHAVEN: the Sea Cave's own set pieces (task dg-tidepool), built in Blender by script.
#   blender --background --factory-startup --python build_dg-tidepool.py -- --piece umiHokora|crabHusk|...|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up; each piece sits in its kit piece's own local frame (src/dungeon/zoneKits/tidepool.js
# KIT_PIECES): the same origin, facing (the kit's +z = Blender -Y), ground level and size. Layout code is written in the
# kit's game frame (x, y up, z front) and mapped to Blender (x, -z, y).
# Kits: base_kit.py + rg_kit.py + dg_common.py (copied from the approved dg-bamboo task: boulders, icing, beams, the gable
# roof, shide, AO, export) and the coastal bits ported from tools/blender/codex/assets/rg-tidepool (barnacles, buoys,
# crate, bucket, twisted rope, rope cradles).
# Materials (the game sorts by name, src/gfx/glbAssets.js bucketOf): body, glow, hot, cloth, water. NOT rock / reed:
# the dungeon's addPiece (zoneKits/common.js) bakes only body / leaf / cloth / water / stone / glow / hot.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
_c = os.path.join(HERE, 'dg_common.py')
exec(compile(open(_c, encoding='utf-8').read(), _c, 'exec'))

mixc, mulc, vn3 = DG['mixc'], DG['mulc'], DG['vnoise']
def add(t, col, tag='misc', glow=False):
    """(base_kit helpers such as pebble() add through this: body, or glow)"""
    return put(t, col, tag, 'glow' if glow else 'body')

# ================================================================== the sea-cave palette (sRGB)
BAS = dict(lo='#3c464e', mid='#5a656c', hi='#8a9698', warm='#a6a294')     # basalt (kit '#454e54'..'#636c70', tops '#7e888a')
SEA_MOSS = dict(lo='#2e4a2c', mid='#46663a', hi='#6a8a4e')                # sea moss icing, kept deep (the cave light lifts it)
DRIFT = '#a49a88'; DRIFT_DK = '#6e6456'; DRIFT_LT = '#cfc6b4'
WOOD_D = '#5a463a'

def SMP(seed): return DG['moss_painter'](lo=SEA_MOSS['lo'], mid=SEA_MOSS['mid'], hi=SEA_MOSS['hi'], seed=seed, warm='#8a8a40', cool='#3e7a62')

def basalt_painter(seed=0, wet=0.3, pal=BAS, salt=0.45, crust=0.3):
    """dark banded basalt: salt-dusted tops, a pinkish coralline crust on the flanks, a soaked foot with weed and
    barnacle speckle (DG painter: part, p, n, meta -> linear)"""
    sp = DG['stone_painter'](pal['lo'], pal['mid'], pal['hi'], warm=pal['warm'], seed=seed)
    def paint(part, p, n, meta):
        c = sp(part, p, n, meta)
        band = int(math.floor(p.z * 2.4 + 0.7 * vn3(p, 0.9, seed)))
        c = mulc(c, (0.92, 1.0, 0.88, 1.05)[band % 4])
        if n.z > 0.45:
            c = mixc(c, '#b8bebc', salt * smooth(0.45, 0.85, n.z) * clamp((vn3(p, 3.0, seed + 2) - 0.3) * 2.2))
        if -0.25 < n.z < 0.45 and vn3(p, 4.0, seed + 4) > 0.62: c = mixc(c, '#a8727c', crust)
        w = clamp((wet - p.z) / max(0.08, wet * 0.6) + (vn3(p, 3.0, seed + 6) - 0.5) * 0.6)
        if w > 0:
            c = mixc(c, '#27313a', w * 0.62)
            if p.z > -0.02 and vn3(p, 6.0, seed + 8) > 0.6: c = mixc(c, '#4a5a2a', w * 0.7)
            if p.z > -0.02 and vn3(p, 13.0, seed + 9) > 0.64: c = mixc(c, '#d8d2c2', w * 0.75)
        return c
    return paint

def barn_cluster(pos, nrm, s, seed, tag='barnacles'):
    """a few chunky volcano cones on a surface point (Blender coords) facing nrm (rg-tidepool)"""
    rng = random.Random(seed); n = Vector(nrm).normalized()
    side = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized(); up = n.cross(side)
    Rm = Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
    for k in range(rng.randint(3, 5)):
        a = rng.uniform(0, TAU); d = rng.uniform(0.0, 0.08) * s
        c = Vector(pos) + (side * math.cos(a) + up * math.sin(a)) * d - n * 0.01
        r = rng.uniform(0.032, 0.048) * s
        t = lathe([(0.0, -0.014), (r, -0.014), (r * 0.52, r * 0.95), (0.0, r * 0.6)], 5, th0=rng.uniform(0, 1))
        t.xform(Matrix.Translation(c) @ Rm)
        put(t, lambda p, nn: mix('#c4bcac', '#f4eee2', clamp(nn.z * 0.5 + 0.55)), tag, 'body')

def boulder(name, x, z, hc, ax, az, hup, seed, wet=0.35, moss=None, mseed=0, tag='rock', barn=0, bseed=None, **kw):
    """a DG boulder in basalt + optional sea-moss icing + barnacle clusters on its wet flanks (game-local, frame-free)"""
    b = DG['Boulder'](name, x, z, hc, ax, az, hup, seed=seed, moss=moss, **kw)
    sp = b.build(basalt_painter(seed, wet))
    putp(sp, tag, 'body')
    if moss:
        m = DG['boulder_moss'](b, SMP(mseed or seed), stone=sp)
        putp(m, tag + 'Moss', 'body')
        if getattr(m, 'tufts', None) is not None: putp(m.tufts, tag + 'Tufts', 'body')
    if barn:
        rnd = random.Random((bseed or seed) * 13 + 7); k = 0
        for _ in range(barn * 20):
            if k >= barn: break
            th = rnd.uniform(0, TAU); ph = rnd.uniform(-0.5, 0.7); q = b.P(th, ph)
            if not (0.04 < q.z < wet): continue
            nn = b.N(th, ph)
            if nn.z > 0.55: continue
            barn_cluster(q, nn, rnd.uniform(0.8, 1.2), (bseed or seed) * 31 + k); k += 1
    return b

def surface_hit(o_from, dirv, mats=('body',)):
    """ray-cast the asset built so far (Blender coords) -> (point, normal) or (None, None)"""
    allv, allf = [], []
    for k in mats:
        o = A.objs.get(k)
        if not o: continue
        b = len(allv); allv += o['v']
        for f in o['f']:
            for q in range(1, len(f) - 1): allf.append([f[0] + b, f[q] + b, f[q + 1] + b])
    bvh = BVHTree.FromPolygons(allv, allf)
    hit = bvh.ray_cast(o_from, dirv.normalized(), 10.0)
    return (hit[0], hit[1]) if hit[0] is not None else (None, None)

def ground_at(x, z, y0=3.0):
    """game height of the asset's surface under game (x, z) (current frame ignored)"""
    hp, hn = surface_hit(Vector((x, -z, y0)), Vector((0, 0, -1)))
    return (hp.z, hn) if hp is not None else (0.0, Vector((0, 0, 1)))

def local_fn():
    Mi = F.m.inverted()
    return lambda p: GMi @ (Mi @ p)

def twisted_rope(path_fn, n, r, tw=9.0, off=0.035, K=4, col=None, tag='rope'):
    """two straw strands twisting round a path (path_fn(u) -> game-local point) (rg-tidepool)"""
    col = col or (lambda p, nn: mix('#b89a5c', '#ecd8a0', clamp(nn.z * 0.6 + 0.4)))
    for k in range(2):
        pts = []
        for i in range(n + 1):
            u = i / n; c = path_fn(u); c2 = path_fn(min(1.0, u + 1e-3)); c1 = path_fn(max(0.0, u - 1e-3))
            T = Vector((c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2])).normalized()
            N = T.cross(Vector((0, 1, 0))); N = N.normalized() if N.length > 1e-6 else Vector((0, 0, 1))
            Bv = N.cross(T).normalized(); th = u * tw + k * PI
            pts.append((c[0] + (N.x * math.cos(th) + Bv.x * math.sin(th)) * off, c[1] + (N.y * math.cos(th) + Bv.y * math.sin(th)) * off,
                        c[2] + (N.z * math.cos(th) + Bv.z * math.sin(th)) * off))
        put(gtube(pts, lambda s: r * (0.85 + 0.15 * math.sin(s * PI)), K=K), col, tag, 'body')

def rope_bag(c, r, tag='floats'):
    """the rope cradle round a glass float (Blender centre c, radius r): two crossed loops + an equator"""
    for ax in (Vector((1, 0, 0)), Vector((0, 1, 0))):
        n = ax; s1 = n.cross(Vector((0, 0, 1))).normalized(); s2 = n.cross(s1)
        pts = [c + (s1 * math.cos(TAU * k / 10) + s2 * math.sin(TAU * k / 10)) * r * 1.05 for k in range(10)]
        put(tube_loop(pts, lambda s: 0.017, K=3, up=n), soft('#d8c088', 0.3), tag, 'body')
    put(tube_loop([c + Vector((math.cos(TAU * k / 10), math.sin(TAU * k / 10), 0)) * r * 1.05 for k in range(10)], lambda s: 0.017, K=3),
        soft('#d8c088', 0.3), tag, 'body')

def glass_float(pos, r, col, tag='floats', cradle=True):
    """a glowing glass fishing float (game-local centre) in its rope cradle"""
    c = F.W(pos)
    put(sph(r, pos, K=10, J=6), lambda p, n, cc=col: mix(mul(cc, 0.86), mix(cc, '#fff6ea', 0.35), clamp(n.z * 0.6 + 0.35)), tag, 'glow', uv=lambda p: (0.2, 0.8))
    if cradle: rope_bag(c, r, tag + 'Rope')

def starfish(pos, r, rot, col, tag='starfish'):
    """a chunky five-armed star lying on a surface (game-local pos), a dotted top"""
    pts = []
    for k in range(10):
        a = rot + PI / 2 + TAU * k / 10; rr = r if k % 2 == 0 else r * 0.45
        pts.append((math.cos(a) * rr, math.sin(a) * rr))
    with at(pos, rx=-PI / 2):
        put(prism(pts, 0.045, 0.0), lambda p, n: mix(mul(col, 0.78), mix(col, '#fff0dc', 0.22), clamp(n.z * 0.7 + 0.3)), tag, 'body')
    for k in range(5):
        a = rot + PI / 2 + TAU * k / 5
        put(sph(0.017, (pos[0] + math.cos(a) * r * 0.45, pos[1] + 0.045, pos[2] - math.sin(a) * r * 0.45), K=4, J=2), flat('#fff0d8'), tag, 'body')

def shell(pos, r, ry=0.0, col='#f0d8c8', tag='shells'):
    """a ribbed scallop lying on a surface (game-local)"""
    with at(pos, ry=ry):
        prof = [(0.0, 0.0), (r, 0.0), (r * 0.9, r * 0.25), (r * 0.5, r * 0.42), (0.0, r * 0.46)]
        t = lathe(prof, 10, sx=1.0, sy=0.85, rfn=lambda rr, z, th: rr * (1 + 0.08 * math.cos(th * 9)) * (0.55 + 0.45 * smooth(-1.2, 0.6, math.sin(th))))
        t.xform(F.m @ lm((0, 0, 0)))
        put(t, lambda p, n: mix(mul(col, 0.8), mix(col, '#fff6ea', 0.3), clamp(n.z * 0.6 + 0.3)), tag, 'body')

def kelp(pts, w, seed, tag='kelp', th=0.03):
    """a draped kelp frond: a flat ribbon (thick enough to read) along game-local pts, its edges rippled, lying flat
    where it lies on the ground; olive to yellow-green, a pale midrib"""
    P = [F.W(p) for p in pts]
    P = [P[0].lerp(P[1], 0.0)] + [p for p in P]
    S = []
    for i in range(len(P) - 1):
        for k in range(3): S.append(P[i].lerp(P[i + 1], k / 3))
    S.append(P[-1]); n = len(S)
    c0, c1 = ('#3e5a2c', '#7a9442') if seed % 2 else ('#4a5428', '#8a9440')
    t = PTmp(); top, bot = [], []
    for i, q in enumerate(S):
        d = (S[min(n - 1, i + 1)] - S[max(0, i - 1)]).normalized()
        side = d.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
        up = side.cross(d).normalized()
        if up.z < 0: up = -up
        u = i / (n - 1)
        ww = w * (0.45 + 0.55 * math.sin(min(1.0, u * 1.15 + 0.12) * PI)) * (1 + 0.18 * math.sin(i * 1.9 + seed))
        rip = up * (0.02 * math.sin(i * 2.3 + seed))
        row_t = [q - side * ww + rip + up * th / 2, q + up * th, q + side * ww - rip + up * th / 2]
        row_b = [r - up * th for r in row_t]
        top.append([t.vert(r) for r in row_t]); bot.append([t.vert(r) for r in row_b])
    for i in range(n - 1):
        for k in range(2):
            t.face([top[i][k], top[i][k + 1], top[i + 1][k + 1], top[i + 1][k]], Vector((0, 0, 1)))
            t.face([bot[i][k], bot[i + 1][k], bot[i + 1][k + 1], bot[i][k + 1]], Vector((0, 0, -1)))
        for k in (0, 2):
            sgn = -1 if k == 0 else 1
            t.face([top[i][k], top[i + 1][k], bot[i + 1][k], bot[i][k]], (t.v[top[i][k]] - t.v[top[i][1]]))
    for row, rb, sgn in ((top[0], bot[0], -1), (top[-1], bot[-1], 1)):
        d = (S[-1] - S[-2]) if sgn > 0 else (S[0] - S[1])
        t.face([row[0], row[1], row[2], rb[2], rb[1], rb[0]], d)
    t.normals()
    mid = S
    put(t, lambda p, nn: mix(mix(c0, c1, clamp(nn.z * 0.5 + 0.3 + 0.25 * vnoise(p, 5.0, seed))), '#b4b45a', 0.0), tag, 'body')

def drift_col(seed=0, base=DRIFT, lt=DRIFT_LT, wet_z=0.0):
    """sea-grey driftwood: grain streaks, darker knots, a light top"""
    def f(p, n):
        g = 0.84 + 0.18 * math.sin(p.x * 23 + p.y * 3 + math.sin(p.y * 9 + seed) * 2) ** 2
        c = mul(mix(mul(base, 0.82), lt, clamp(n.z * 0.5 + 0.35)), g)
        if vnoise(p, 7.0, seed) > 0.74: c = mul(c, 0.8)
        return c
    return f

# ================================================================== 1. the sea shrine (kit umiHokora: rock 1.9 x 1.55, h 1.55)
def build_umiHokora():
    new_asset()
    # ---------------- the base rock: a wide, low barnacled basalt boulder (kit lump R 0.75, squash 0.42, sx 1.25)
    boulder('base', 0.0, 0.0, 0.1, 0.98, 0.78, 0.27, seed=7, wet=0.2, exy=0.75, ez=0.8, lump=0.07, taper=0.06, flat=0.55, res=0.13,
            barn=10, tag='baseRock')
    boulder('side1', -0.78, 0.48, 0.06, 0.26, 0.22, 0.14, seed=11, wet=0.2, exy=0.8, ez=0.75, lump=0.1, res=0.1, barn=2, tag='baseRock')
    boulder('side2', 0.25, -0.72, 0.05, 0.3, 0.2, 0.16, seed=12, wet=0.2, exy=0.8, ez=0.75, lump=0.1, res=0.1, barn=1, tag='baseRock')
    # ---------------- the little stone fisherman god (kit B.at([0.72, 0.18, 0.28], -0.4)), seated on the rock's flank
    gy, _ = ground_at(0.74, 0.3)
    with at((0.74, gy - 0.02, 0.3), ry=-0.4):
        ST = '#b0aca4'; stc = stone_paint(ST, hi='#e2ded6', lo='#7c7872', seed=41, moss=0.35, moss_up=0.6)
        put(sph(0.18, (0, 0.16, 0), sc=(1.0, 0.9, 0.92), K=10, J=6), stc, 'ebisu', 'body')
        put(sph(0.12, (0, 0.38, 0.02), sc=(1.05, 0.95, 1.0), K=10, J=6), stc, 'ebisu', 'body')
        # his eboshi cap folded back, a smiling closed-eye face (sculpted arcs), round ears
        put(glathe([(0.0, 0.0), (0.085, 0.0), (0.07, 0.08), (0.04, 0.13), (0.0, 0.14)], 8, pos=(0, 0.45, -0.015), rx=-0.45),
            lambda p, n: mix('#4a4648', '#6e686a', clamp(n.z * 0.5 + 0.5)), 'ebisu', 'body')
        for e in (-1, 1):
            put(gtube([(e * 0.06, 0.4, 0.118), (e * 0.04, 0.41, 0.125), (e * 0.02, 0.4, 0.122)], 0.011, K=4), flat('#5a5650'), 'ebisu', 'body')
            put(sph(0.035, (e * 0.115, 0.37, 0.0), sc=(0.6, 1.0, 1.0), K=6, J=4), stc, 'ebisu', 'body')
        put(gtube([(-0.045, 0.335, 0.11), (0.0, 0.318, 0.12), (0.045, 0.335, 0.11)], 0.012, K=4), flat('#5a5650'), 'ebisu', 'body')
        for e in (-1, 1): put(sph(0.026, (e * 0.07, 0.35, 0.1), K=5, J=3), stc, 'ebisu', 'body')
        # arms: the right holds the rod over his shoulder, the left a red sea bream against his belly
        put(sph(0.06, (0.15, 0.22, 0.07), sc=(1, 0.9, 1), K=7, J=4), stc, 'ebisu', 'body')
        put(sph(0.06, (-0.14, 0.18, 0.09), sc=(1, 0.9, 1), K=7, J=4), stc, 'ebisu', 'body')
        put(gtube([(0.16, 0.2, 0.12), (0.12, 0.5, 0.0), (0.02, 0.86, -0.18)], lambda s: 0.021 - 0.006 * s, K=5),
            lambda p, n: mix('#5e4634', '#94704e', clamp(n.z * 0.5 + 0.5)), 'ebisu', 'body')
        put(gtube([(0.02, 0.86, -0.18), (-0.06, 0.66, -0.24), (-0.1, 0.4, -0.26)], 0.012, K=3), soft('#d8ccb0', 0.2), 'ebisu', 'body')
        with at((-0.06, 0.17, 0.15), ry=0.3):
            put(sph(0.075, (0, 0, 0), sc=(1.25, 0.7, 0.42), K=8, J=5), lambda p, n: mix('#b84a3e', '#e2705a', clamp(n.z * 0.5 + 0.4)), 'ebisu', 'body')
            with at((-0.09, 0, 0)):
                put(prism([(0.02, 0.0), (-0.06, 0.055), (-0.045, 0.0), (-0.06, -0.055)], 0.03, -0.015), flat('#a83e34'), 'ebisu', 'body')
        put(cyl(0.2, 0.22, 0.05, (0, 0.0, 0), K=10), stone_paint('#8a8e8c', seed=42), 'ebisu', 'body')
    # ---------------- sea life on the rock: kelp over the front edge, a starfish, shells, pebbles
    for k, (x, z, a) in enumerate([(-0.5, 0.6, 0.3), (0.1, 0.72, -0.2), (-0.86, 0.1, 1.4), (0.9, -0.3, -1.3)]):
        y0, _ = ground_at(x * 0.82, z * 0.82)
        d = Vector((x, 0, z)).normalized() if abs(x) + abs(z) > 0 else Vector((0, 0, 1))
        pts = [(x * 0.82, y0 + 0.02, z * 0.82), (x + d.x * 0.05, max(0.06, y0 * 0.5), z + d.z * 0.05), (x + d.x * 0.18, 0.02, z + d.z * 0.18),
               (x + d.x * 0.32 + 0.06 * math.sin(a), 0.01, z + d.z * 0.32 + 0.06 * math.cos(a))]
        kelp(pts, 0.06, k, tag='kelp')
    y0, _ = ground_at(-0.55, 0.3)
    starfish((-0.55, y0 + 0.005, 0.32), 0.11, 0.4, '#e8784a')
    shell((0.62, 0.0, 0.76), 0.07, ry=0.5); shell((-0.2, 0.0, 0.86), 0.06, ry=-0.4, col='#f4c8b8')
    for k, (x, z, r_) in enumerate([(0.8, 0.62, 0.07), (-0.95, -0.45, 0.06), (0.5, 0.86, 0.05)]):
        pebble((x, -0.01, z), r_, sq=0.6, seed=180 + k, col='#6e7880', tag='pebbles', K=6)
    # ---------------- the shrine (kit B.at([0, 0.34, -0.05]))
    Y0 = 0.34
    with at((0, Y0, -0.05)):
        # a dressed basalt plinth sunk into the rock
        put(rbox((0.98, 0.84, 0.24), r=0.05, M=F.m @ lm((0, -0.05, 0))), stone_paint('#7e868a', hi='#b2b8b6', lo='#4e565c', seed=31), 'plinth', 'body')
        # the shrine box: weathered driftwood planks, dark corner posts
        def wallc(p, n):
            c = mix(mul('#9a7c62', 0.78), mix('#9a7c62', '#d2c2a8', 0.4), clamp(n.z * 0.5 + 0.5))
            q = F_loc(p)
            c = mul(c, 0.86 + 0.14 * abs(math.sin(q[0] * 26)) if abs(n.z) < 0.5 else 1.0)
            return mul(c, 0.92 + 0.12 * vnoise(p, 5.0, 3))
        F_loc = local_fn()
        put(box(0.72, 0.64, 0.56, (0, 0.39, 0), r=0.03), wallc, 'shrine', 'body')
        for px_ in (-1, 1):
            for pz_ in (-1, 1):
                put(beam(0.085, 0.76, 0.085, (px_ * 0.38, 0.45, pz_ * 0.3), c=0.022), wood(WOOD_D, ao_z=Y0, seed=px_ + pz_ + 3), 'shrine', 'body')
        put(beam(0.86, 0.085, 0.1, (0, 0.1, 0.31), c=0.022), wood(WOOD_D), 'shrine', 'body')
        put(beam(0.9, 0.1, 0.11, (0, 0.76, 0.31), c=0.026), wood(WOOD_D), 'shrine', 'body')
        put(beam(0.9, 0.1, 0.11, (0, 0.76, -0.31), c=0.026), wood(WOOD_D), 'shrine', 'body')
        # the lattice doors: a dark recess, a pale kumiko grid
        for sxd in (-1, 1):
            put(box(0.33, 0.56, 0.04, (sxd * 0.17, 0.42, 0.285), r=0.012), lambda p, n: mix('#2c2428', '#423638', clamp(n.z + 0.3)), 'doors', 'body')
            for yy in (0.15, 0.69, 0.33, 0.51):
                put(box(0.33, 0.032, 0.03, (sxd * 0.17, yy, 0.31), r=0.0), soft('#cdb68a', 0.2), 'doors', 'body')
            for xo in (-0.15, 0.0, 0.15):
                put(box(0.032, 0.56, 0.03, (sxd * 0.17 + xo, 0.42, 0.309), r=0.0), soft('#cdb68a', 0.2), 'doors', 'body')
        # the roof: a sea-teal tiled gable, sea moss on its back and front, a dark ridge roll
        R = roof_gable(LX=0.66, DZ=0.56, YE=0.82, YR=1.18, TH=0.08, NR=6, RCOL=('#4e6c74', '#76969a', '#2a3c44'))
        gp = [(0.31, 0.8)] + [(-zz, R['top_y'](0.0, zz / R['DZ']) - 0.085) for zz in (-0.31, -0.2, -0.1, 0.0, 0.1, 0.2, 0.31)] + [(-0.31, 0.8)]
        with at((0, 0, 0), ry=PI / 2):
            put(prism(gp, 0.76, -0.38), lambda p, n: mix(mul(DRIFT, 0.62), mul(DRIFT, 0.85), clamp(n.z * 0.5 + 0.5)), 'shrine', 'body')
        k_ = R['LX'] / 0.9
        dfront = [(-0.4 * k_, 0.2, 0.16), (0.02, 0.26, 0.2), (0.36 * k_, 0.18, 0.15)]
        dback = [(-0.3 * k_, 0.24, 0.2), (0.24 * k_, 0.28, 0.2)]
        a0, a1 = -R['LX'] + 0.05, R['LX'] - 0.05
        def taper(s): return math.sqrt(max(0.0, math.sin(PI * clamp((s - a0) / (a1 - a0)))))
        def lo(s): return -(0.1 + 0.03 * math.sin(s * 6) + 0.8 * sum(dd * math.exp(-((s - c) / w_) ** 2) for c, dd, w_ in dfront)) * taper(s) - 0.02
        def hi(s): return (0.16 + 0.04 * math.sin(s * 6 + 1) + 0.8 * sum(dd * math.exp(-((s - c) / w_) ** 2) for c, dd, w_ in dback)) * taper(s) + 0.02
        mp = DG['strip_moss']('roof_moss', R['Sf'], a0, a1, 14, lo, hi, 0.045, SMP(3), ncross=6)
        putp(mp, 'roofmoss', 'body')
        LXr = R['LX'] + 0.03
        rg = DG['Beam'](lambda s_: F.W(((s_ * 2 - 1) * LXr, R['top_y']((s_ * 2 - 1) * R['LX'], 0.0) + 0.035 + 0.08 * abs(s_ * 2 - 1) ** 4, 0.0)),
                        Vector((0, 0, 1)), lambda s_: 0.055, lambda s_: 0.05, e=0.7, cap=0.05)
        putp(rg.build('ridge', 'roof', DG['lacquer_painter']('#3e5a60', '#24363c', '#62828a', spec='#a0bcc0', sheen=0.3), K=8, step=0.12, capn=2), 'ridge', 'body')
        # the shimenawa under the front eave with three shide
        ry_ = 0.7; fz = 0.37
        spts = [F.W((-0.44 + 0.88 * k / 10, ry_ - 0.06 * math.sin(PI * k / 10), fz + 0.01 * math.sin(PI * k / 10))) for k in range(11)]
        put(tube(spts, lambda s: 0.028 + 0.016 * math.sin(PI * s), K=6), rope_col(lambda p, n: p.x * 60 + math.atan2(n.z, -n.y) * 2), 'shimenawa', 'body')
        for x in (-0.24, 0.0, 0.24):
            tt = (x + 0.44) / 0.88
            top = F.W((x, ry_ - 0.06 * math.sin(PI * tt) - 0.03, fz + 0.03))
            shide_tabs(top, F.N((0, 0, 1)), scale=0.56, tag='shide', n=3, span=0.22)
        # the glass float hung from the front eave: it carries the kit's light (0.3, 0.86, 0.4)
        put(gtube([(0.3, 0.78, 0.45), (0.3, 0.6, 0.45)], 0.016, K=4), soft('#c8b078', 0.3), 'floatCord', 'body')
        glass_float((0.3, 0.52, 0.45), 0.09, '#5ccdc0', tag='float')
        # the offering shelf on two stone blocks at the plinth's front, a sea bream on a white stand, two sake flasks
        for sx in (-0.22, 0.22):
            put(box(0.1, 0.14, 0.12, (sx, 0.05, 0.47), r=0.02), stone_paint('#7e868a', seed=33), 'shelf', 'body')
        put(beam(0.68, 0.05, 0.22, (0, 0.14, 0.47), c=0.015), drift_col(4, base='#8a7a64'), 'shelf', 'body')
        put(glathe([(0.0, 0.0), (0.11, 0.0), (0.1, 0.03), (0.07, 0.04), (0.08, 0.075), (0.0, 0.075)], 8, pos=(-0.13, 0.165, 0.47)),
            lambda p, n: mix('#d8cfc0', '#fff4e4', clamp(n.z * 0.5 + 0.5)), 'offering', 'body')
        with at((-0.13, 0.31, 0.48), ry=0.1):
            loc = local_fn()
            def bream(p, n):
                q = loc(p); c = mix('#c83c36', '#f26a50', clamp(n.z * 0.5 + 0.4))
                return mix(c, '#ffd8c0', smooth(0.0, -0.05, q[1]) * 0.8)
            put(sph(0.1, (0, 0, 0), sc=(1.25, 0.68, 0.42), K=10, J=6), bream, 'offering', 'body')
            with at((-0.13, 0.0, 0.0)):
                put(prism([(0.02, 0.0), (-0.09, 0.075), (-0.065, 0.0), (-0.09, -0.075)], 0.036, -0.018), lambda p, n: mix('#b0322c', '#e8584a', clamp(n.z + 0.5)), 'offering', 'body')
            put(prism([(-0.05, 0.05), (0.0, 0.11), (0.06, 0.05)], 0.03, -0.015), flat('#c0423a'), 'offering', 'body')
            put(sph(0.016, (0.085, 0.015, 0.035), K=5, J=3), flat('#2e2830'), 'offering', 'body')
        for sx in (0.1, 0.2):
            put(glathe([(0.0, 0.0), (0.042, 0.0), (0.05, 0.05), (0.032, 0.11), (0.018, 0.14), (0.024, 0.165), (0.0, 0.165)], 8, pos=(sx, 0.165, 0.46)),
                lambda p, n: mix('#d8d0c4', '#fff6ea', clamp(n.z * 0.5 + 0.55)), 'offering', 'body')
            put(cyl(0.026, 0.026, 0.03, (sx, 0.24, 0.46), K=6), flat('#3a5a8a'), 'offering', 'body')
    return dict(light=[0.3, 0.86, 0.4], float=[0.3, 0.86, 0.4])

# ================================================================== 2. the crab husk (kit crabHusk: shell 1.55 x 1.24, h 0.34)
def build_crabHusk():
    new_asset()
    RX, RZ, H = 0.8, 0.64, 0.36
    def relief(fx, fz):
        """the heikegani's scowling face, sculpted (fx, fz in -1..1 of the carapace; +z = the front / mouth)"""
        d = 0.0
        fx, fz = fx * 1.12, (fz - 0.08) * 1.12
        # the brow: two raised ridges sloping down to the middle (a frown), a deep furrow between them
        bz = -0.08 + abs(fx) * 0.32
        d += 0.085 * math.exp(-((fz - bz) / 0.085) ** 2) * smooth(0.72, 0.1, abs(fx)) * smooth(0.0, 0.12, abs(fx))
        d -= 0.05 * math.exp(-(fx / 0.06) ** 2) * math.exp(-((fz + 0.05) / 0.2) ** 2)
        # two deep eye pits under the brows, cheek bulges under them
        for sx in (-1, 1):
            r = math.hypot(fx - sx * 0.33, (fz - 0.1) * 1.2)
            d -= 0.09 * math.exp(-(r / 0.12) ** 2)
            r2 = math.hypot(fx - sx * 0.4, fz - 0.36)
            d += 0.05 * math.exp(-(r2 / 0.13) ** 2)
        # a grimacing mouth groove with turned-down corners, a nose knob
        mz = 0.52 + 0.1 * (abs(fx) / 0.36) ** 2
        d -= 0.06 * math.exp(-((fz - mz) / 0.075) ** 2) * smooth(0.42, 0.3, abs(fx))
        d += 0.045 * math.exp(-((fx / 0.08) ** 2 + ((fz - 0.3) / 0.08) ** 2))
        # the shell's back plates: two shallow grooves
        for gz in (-0.45, -0.68):
            d -= 0.014 * math.exp(-((fz - gz - 0.12 * fx * fx) / 0.04) ** 2)
        return d
    NR, NS = 22, 52
    def P(r, a):
        """r 0..1 from the crown, a round the rim; the rim wobbles into blunt teeth at the front corners"""
        tooth = 0.0
        ang = (a % TAU)
        if math.sin(a) > 0.15: tooth = 0.07 * max(0.0, math.cos(ang * 11)) ** 4 * smooth(0.6, 0.95, r) * (1 - smooth(0.85, 1.0, math.sin(a)))
        ex = RX * (1 + tooth) * (1 + 0.1 * math.sin(a)); ez = RZ * (1 + tooth) * (1 - 0.06 * max(0.0, math.sin(a)) ** 8)
        x, z = math.cos(a) * r * ex, math.sin(a) * r * ez
        h = H * max(0.0, 1 - r ** 2.3) ** 0.62
        h += relief(x / RX, z / RZ) * smooth(1.0, 0.75, r)
        return (x, h + 0.03, z)
    t = PTmp(); rows = []
    for i in range(1, NR + 1):
        r = i / NR
        rows.append([t.vert(F.W(P(r, TAU * k / NS))) for k in range(NS)])
    # the rolled rim down to the sand and tucked under
    lip = [t.vert(F.W((P(1.0, TAU * k / NS)[0] * 1.03, 0.0, P(1.0, TAU * k / NS)[2] * 1.03))) for k in range(NS)]
    und = [t.vert(F.W((P(1.0, TAU * k / NS)[0] * 0.9, -0.02, P(1.0, TAU * k / NS)[2] * 0.9))) for k in range(NS)]
    top = t.vert(F.W(P(0.0, 0.0)))
    for k in range(NS):
        t.face([top, rows[0][k], rows[0][(k + 1) % NS]], Vector((0, 0, 1)))
    allr = rows + [lip, und]
    for i in range(len(allr) - 1):
        for k in range(NS):
            k2 = (k + 1) % NS
            a = TAU * (k + 0.5) / NS
            hint = Vector((math.cos(a), -math.sin(a), 1.0 if i < len(rows) - 1 else (0.2 if i == len(rows) - 1 else -1.0)))
            t.face([allr[i][k], allr[i + 1][k], allr[i + 1][k2], allr[i][k2]], hint)
    bot = t.vert(F.W((0, -0.02, 0)))
    for k in range(NS): t.face([und[k], bot, und[(k + 1) % NS]], Vector((0, 0, -1)))
    t.normals()
    def shellc(p, n):
        x, z = p.x, -p.y
        fx, fz = x / RX, z / RZ
        rel = relief(fx, fz) if math.hypot(fx, fz) < 1 else 0.0
        c = mix('#a8483c', '#d8745a', clamp(n.z * 0.7 + 0.1))
        c = mix(c, '#f0a888', smooth(0.5, 1.0, n.z) * 0.45)
        if rel < -0.008: c = mix(c, '#4a1c1e', clamp((-rel - 0.008) / 0.03) * 0.9)
        if rel > 0.02: c = mix(c, '#f8bc9a', clamp((rel - 0.02) / 0.04) * 0.6)
        if vnoise(p, 20.0, 5) > 0.76: c = mix(c, '#f2e6d6', 0.35)
        if p.z < 0.06: c = mul(c, 0.78)
        return c
    put(t, shellc, 'carapace', 'body')
    # barnacles on the back, a starfish clinging on, a bit of kelp over the rear
    for k, (fx, fz) in enumerate([(-0.55, -0.5), (-0.35, -0.62), (0.6, -0.45), (-0.7, -0.2)]):
        q = P(math.hypot(fx, fz), math.atan2(fz, fx))
        e = 1e-3; qa = Vector(F.W(P(math.hypot(fx, fz), math.atan2(fz, fx) + 0.05))); qb = Vector(F.W(P(math.hypot(fx, fz) + 0.03, math.atan2(fz, fx))))
        n = (qa - F.W(q)).cross(qb - F.W(q)).normalized()
        if n.z < 0: n = -n
        barn_cluster(F.W(q), n, 1.0, 90 + k)
    kelp([(0.2, P(0.3, -1.6)[1] + 0.02, -0.2), (0.28, P(0.62, -1.4)[1] + 0.02, -0.42), (0.36, 0.1, -0.66), (0.42, 0.01, -0.86)], 0.07, 3)
    # the legs: three a side, arched (up off the shell's edge, a knee, the tip planted in the sand), dark tips
    legc = lambda p, n: mix('#9a4034', '#e08466', clamp(n.z * 0.6 + 0.3))
    for sx in (-1, 1):
        for k in range(3):
            a = 0.28 - k * 0.5
            dx, dz = math.cos(a) * sx, math.sin(a)
            bx, bz = dx * RX * 0.86, dz * RZ * 0.8
            kx, kz = bx + dx * 0.26, bz + dz * 0.26
            tx, tz = kx + dx * 0.2 - 0.06 * dz * sx, kz + dz * 0.2 + 0.06 * dx * sx
            put(gtube([(bx, 0.1, bz), (kx - dx * 0.06, 0.23, kz - dz * 0.06), (kx, 0.24, kz)], lambda s: 0.058 - 0.01 * s, K=7), legc, 'legs', 'body')
            put(sph(0.056, (kx, 0.235, kz), K=7, J=4), legc, 'legs', 'body')
            put(gtube([(kx, 0.235, kz), (kx + dx * 0.1, 0.16, kz + dz * 0.1), (tx, 0.02, tz)], lambda s: 0.046 * (1 - 0.55 * s), K=7), legc, 'legs', 'body')
            put(glathe([(0.0, 0.0), (0.022, 0.03), (0.0, 0.08)], 5, pos=(tx, 0.0, tz)), flat('#3a1c1c'), 'legs', 'body')
    # the two cast-off claws lying on the sand (kit (1.05, 0.12, 0.6) ry 0.6 and (-0.9, 0.12, 0.9) ry -0.9)
    for ci, (x, z, ry, s) in enumerate([(1.05, 0.6, 0.6, 1.0), (-0.92, 0.88, -0.9 + PI, 0.88)]):
        with at((x, 0.0, z), ry=ry, s=s):
            loc = local_fn()
            def clawc(p, n):
                q = loc(p); c = mix('#a8483c', '#e07a5c', clamp(n.z * 0.6 + 0.3))
                if q[0] > 0.2: c = mix(c, '#3a1c1c', smooth(0.2, 0.36, q[0]))
                if vnoise(p, 12.0, 7 + ci) > 0.72: c = mix(c, '#f2e2d2', 0.4)
                return c
            put(sph(0.17, (-0.05, 0.13, 0.0), sc=(1.45, 0.78, 0.82), K=12, J=7), clawc, 'claws', 'body')       # the palm
            put(sph(0.08, (-0.3, 0.1, 0.0), sc=(1.2, 0.85, 0.9), K=8, J=5), clawc, 'claws', 'body')          # the wrist
            put(gtube([(0.14, 0.12, 0.045), (0.27, 0.11, 0.06), (0.4, 0.09, 0.02)], lambda u: 0.07 * (1 - 0.75 * u), K=7), clawc, 'claws', 'body')   # the fixed finger
            put(gtube([(0.14, 0.17, -0.04), (0.28, 0.2, -0.07), (0.38, 0.16, -0.035)], lambda u: 0.06 * (1 - 0.72 * u), K=7), clawc, 'claws', 'body')  # the movable one
            for k in range(3): put(sph(0.022, (0.2 + k * 0.06, 0.12, 0.0), K=4, J=2), flat('#f0e0c8'), 'claws', 'body')
    for k, (x, z, r_) in enumerate([(-0.75, -0.62, 0.06), (0.98, -0.25, 0.05)]):
        pebble((x, -0.01, z), r_, sq=0.6, seed=280 + k, col='#6e7880', tag='pebbles', K=6)
    shell((0.4, 0.0, 0.85), 0.065, ry=0.9)
    return dict()

# ================================================================== 3. the brazier (kit brazier: bowl r 0.4 on three stones, coals at 0.27)
def build_brazier():
    new_asset()
    for k in range(3):
        a = k / 3 * TAU + 0.15
        boulder('foot%d' % k, math.cos(a) * 0.3, math.sin(a) * 0.3, 0.06, 0.15, 0.13, 0.12, seed=61 + k, wet=0.06, exy=0.8, ez=0.75,
                lump=0.1, res=0.08, tag='feet')
    # the weathered iron bowl: a rolled rim, a riveted band, rust streaks and a verdigris bloom
    Y = 0.15
    def iron(p, n):
        c = mix('#3a3436', '#6a6060', clamp(n.z * 0.5 + 0.45))
        g = vnoise(p, 6.0, 3)
        if g > 0.58: c = mix(c, '#8a5236', clamp((g - 0.58) * 4) * 0.7)
        if vnoise(p, 4.0, 9) > 0.7: c = mix(c, '#5a8a7a', 0.35)
        return c
    put(glathe([(0.0, Y), (0.18, Y), (0.3, Y + 0.04), (0.38, Y + 0.16), (0.41, Y + 0.22), (0.43, Y + 0.25), (0.405, Y + 0.27), (0.37, Y + 0.23),
                (0.33, Y + 0.14), (0.24, Y + 0.08), (0.0, Y + 0.07)], 16), iron, 'bowl', 'body')
    put(gloop([(0.355 * math.cos(TAU * k / 16), Y + 0.12, 0.355 * math.sin(TAU * k / 16)) for k in range(16)], 0.022, K=4), iron, 'bowl', 'body')
    for k in range(8):
        a = TAU * k / 8
        put(sph(0.022, (0.37 * math.cos(a), Y + 0.12, 0.37 * math.sin(a)), K=5, J=3), flat('#7a6a62'), 'bowl', 'body')
    # three stubby legs into the stones
    for k in range(3):
        a = k / 3 * TAU + 0.15
        put(gtube([(0.2 * math.cos(a), Y + 0.04, 0.2 * math.sin(a)), (0.29 * math.cos(a), 0.1, 0.29 * math.sin(a))], 0.03, K=5), iron, 'bowl', 'body')
    # charred driftwood crossing in the bowl, glowing ends
    rnd = random.Random(5)
    for k in range(4):
        a = k / 4 * PI + rnd.uniform(-0.2, 0.2); L_ = 0.3
        p0 = (math.cos(a) * L_, Y + 0.17 + 0.03 * (k % 2), math.sin(a) * L_); p1 = (-math.cos(a) * L_ * 0.8, Y + 0.24 + 0.03 * (k % 2), -math.sin(a) * L_ * 0.8)
        put(gtube([p0, p1], 0.035, K=6), lambda p, n: mix('#2e2626', '#6a5a50', clamp(n.z * 0.5 + 0.3)), 'logs', 'body')
        put(sph(0.036, p0, K=6, J=3), lambda p, n: mix('#b8401a', '#e88a3a', clamp(n.z)), 'embers', 'hot', uv=lambda p: (0.8, 1.0))
    # the coals (hot): a lumpy mound of glowing embers, a few low flame tongues
    put(glathe([(0.0, Y + 0.25), (0.15, Y + 0.23), (0.28, Y + 0.17), (0.33, Y + 0.1), (0.0, Y + 0.1)], 12,
               rfn=lambda rr, z, th: rr * (1 + 0.07 * math.sin(th * 5) + 0.04 * math.sin(th * 3 + 1))),
        lambda p, n: mix('#2e2424', '#8a3418', clamp((vnoise(p, 16.0, 2) - 0.45) * 3.0)), 'coals', 'body')
    rnd2 = random.Random(9)
    for k in range(9):   # glowing embers nested in the ash (hot)
        a_ = rnd2.uniform(0, TAU); d_ = rnd2.uniform(0.04, 0.24); yy = Y + 0.25 - 0.13 * (d_ / 0.3) ** 2
        put(sph(rnd2.uniform(0.035, 0.05), (math.cos(a_) * d_, yy, math.sin(a_) * d_), sc=(1, 0.6, 1), K=6, J=3),
            lambda p, n: mix('#c04818', '#f09040', clamp(n.z)), 'embers', 'hot', uv=lambda p: (0.8, 1.0))
    for k, (x, z, h, r) in enumerate([(0.0, 0.0, 0.27, 0.1), (0.12, 0.06, 0.18, 0.07), (-0.1, 0.08, 0.2, 0.075), (0.02, -0.12, 0.18, 0.07)]):
        with at((x, Y + 0.2, z), ry=k * 1.3):
            put(glathe([(0.0, 0.0), (r, 0.03), (r * 0.9, h * 0.35), (r * 0.45, h * 0.7), (0.0, h)], 7,
                       rfn=lambda rr, zz, th: rr * (1 + 0.15 * math.sin(th * 3 + k))),
                lambda p, n: mix('#d8501c', '#f0a040', clamp((p.z - Y - 0.2) / 0.25)), 'flames', 'hot', uv=lambda p: (1.0, 1.0))
    return dict(light=[0, 0.7, 0])

# ================================================================== 4. the wedded rocks (kit weddedPair: stacks at x -1.2 (h 2.6) and 1.15 (h 2.0))
def build_weddedPair():
    new_asset()
    MS = lambda cover, drips, drop: dict(t=0.065, cover=cover, drips=drips, drop=drop, nu=11, rows=[-2, -1, 0.0, 0.4], dw=1.3, dexp=0.45,
                                         doffs=(-1.0, -0.75, -0.4, 0.0, 0.4, 0.75, 1.0))
    SA = [dict(x=-1.2, z=0.0, hc=0.46, ax=0.84, az=0.76, hup=0.52, seed=71, yaw=0.3, tilt=(0.0, 0.0), ground=True, lump=0.13, taper=0.16),
          dict(x=-1.12, z=-0.04, hc=1.27, ax=0.64, az=0.58, hup=0.44, hdn=0.42, seed=72, yaw=1.1, tilt=(0.1, -0.08), ground=False, lump=0.12, taper=0.15),
          dict(x=-1.22, z=0.03, hc=1.98, ax=0.47, az=0.43, hup=0.5, hdn=0.36, seed=73, yaw=-0.5, tilt=(-0.1, 0.12), ground=False, lump=0.12, taper=0.2)]
    SB = [dict(x=1.15, z=0.02, hc=0.4, ax=0.7, az=0.62, hup=0.44, seed=81, yaw=-0.4, tilt=(0.0, 0.0), ground=True, lump=0.14, taper=0.15),
          dict(x=1.1, z=0.05, hc=1.04, ax=0.53, az=0.48, hup=0.38, hdn=0.36, seed=82, yaw=0.6, tilt=(-0.08, 0.12), ground=False, lump=0.13, taper=0.15),
          dict(x=1.18, z=0.0, hc=1.58, ax=0.39, az=0.37, hup=0.4, hdn=0.3, seed=83, yaw=1.6, tilt=(0.12, -0.06), ground=False, lump=0.12, taper=0.22)]
    for j, st in enumerate((SA, SB)):
        for k, s in enumerate(st):
            s = dict(s); x, z, hc, ax, az, hup, seed = s.pop('x'), s.pop('z'), s.pop('hc'), s.pop('ax'), s.pop('az'), s.pop('hup'), s.pop('seed')
            boulder('st%d%d' % (j, k), x, z, hc, ax, az, hup, seed=seed, wet=0.62, exy=0.62, ez=0.6, flat=0.3, res=0.26 if k == 0 else 0.22,
                    moss=MS((0.5, 0.48, 0.55)[k], (5, 4, 4)[k], (0.8, 0.7, 0.6)[k]), tag='stack', barn=(4, 2, 0)[k], **s)
    # the great rope: a belt round each stack's upper stone (ray-cast rings), twisted across, sagging between them
    def belt(cx, cz, y, R0=1.5):
        pts = []
        for k in range(22):
            a = TAU * k / 22; yy = y + 0.03 * math.sin(a * 2 + cx)
            o = Vector((cx + math.cos(a) * R0, -(cz + math.sin(a) * R0), yy)); c = Vector((cx, -cz, yy))
            hp, hn = surface_hit(o, c - o)
            pts.append(hp + (hp - c).normalized() * 0.05 if hp is not None else c)
        return pts
    rcol = rope_col(lambda p, n: math.atan2(p.y, p.x) * 22 + p.z * 40)
    yA, yB = 1.9, 1.42
    bA, bB = belt(-1.2, 0.0, yA), belt(1.14, 0.03, yB)
    put(tube_loop(bA, lambda s: 0.065, K=5), rcol, 'rope', 'body')
    put(tube_loop(bB, lambda s: 0.06, K=5), rcol, 'rope', 'body')
    pa = max(bA, key=lambda v: v.x - 0.4 * v.y); pb = min(bB, key=lambda v: v.x + 0.4 * v.y)   # (the front-inner points of the belts)
    p0, p1 = (pa.x, pa.z, -pa.y), (pb.x, pb.z, -pb.y)
    SAG = 0.38
    rp = lambda u: (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u - math.sin(u * PI) * SAG, p0[2] + (p1[2] - p0[2]) * u + 0.08 * math.sin(u * PI))
    twisted_rope(rp, 20, 0.06, tw=11.0, off=0.045, K=4, col=rcol, tag='rope')
    # the paper streamers (cloth) and two straw tassels hanging from the span
    for k in range(1, 6):
        u = k / 6; c = rp(u)
        top = F.W((c[0], c[1] - 0.07, c[2] + 0.07))
        shide_tabs(top, F.N((0, 0, 1)), scale=0.9 if k % 2 else 0.78, tag='shide', n=4 if k % 2 else 3, span=0.42)
    for u in (0.08, 0.92):
        c = rp(u)
        put(glathe([(0.0, 0.0), (0.05, -0.02), (0.07, -0.18), (0.06, -0.26), (0.0, -0.27)], 7, pos=(c[0], c[1] - 0.04, c[2] + 0.04)),
            lambda p, n: mix('#b0904e', '#e8d090', clamp(n.z * 0.4 + 0.6 + 0.2 * math.sin(math.atan2(p.y, p.x) * 9))), 'tassel', 'body')
    # the foot: pebbles, a starfish, kelp between the stacks, shells
    for k, (x, z, r_) in enumerate([(-0.15, 0.55, 0.12), (0.2, 0.3, 0.09), (-2.05, 0.55, 0.1), (1.95, -0.3, 0.08), (0.05, -0.4, 0.1)]):
        pebble((x, -0.02, z), r_, sq=0.7, seed=90 + k, col='#5e6870', tag='pebbles', K=7)
    starfish((0.45, 0.005, 0.62), 0.12, 0.9, '#e86e4a')
    shell((-0.4, 0.0, 0.85), 0.07, ry=0.4); shell((1.6, 0.0, 0.72), 0.06, ry=-0.6, col='#f4c8b8')
    kelp([(-0.45, 0.25, 0.42), (-0.25, 0.04, 0.6), (0.0, 0.01, 0.7), (0.2, 0.01, 0.74)], 0.045, 1)
    kelp([(0.6, 0.2, 0.42), (0.4, 0.03, 0.55), (0.3, 0.01, 0.8)], 0.04, 2)
    return dict(rope=[[round(v, 3) for v in p0], [round(v, 3) for v in p1]])

# ================================================================== 5. the plank landing (kit planks: six boards 1.7 x 0.24 along x, two battens)
def build_planks():
    new_asset(); rnd = random.Random(21)
    for x in (-0.6, 0.6):
        put(beam(0.1, 0.045, 1.74, (x + rnd.uniform(-0.03, 0.03), 0.012, 0.0), c=0.012, ry=rnd.uniform(-0.04, 0.04)), drift_col(9, base='#6e6456', lt='#9a8e7c'), 'battens', 'body')
    paints = [None, '#5a8088', None, '#a05a4c', None, None]
    for i in range(6):
        L_ = 1.7 + rnd.uniform(-0.2, 0.2); w = 0.23 + rnd.uniform(-0.02, 0.02); z = (i - 2.5) * 0.27
        x0 = rnd.uniform(-0.1, 0.1); ry = rnd.uniform(-0.06, 0.06); base = ['#a8987e', '#b4a48a', '#9a8a72', '#bcae94'][i % 4]
        pc = paints[i]
        with at((x0, 0.0, z), ry=ry):
            loc = local_fn()
            def bc(p, n, base=base, pc=pc, seed=i, L_=L_):
                q = loc(p)
                c = mix(mul(base, 0.72), mix(base, DRIFT_LT, 0.35), clamp(n.z * 0.6 + 0.3))
                c = mul(c, 0.8 + 0.24 * math.sin(q[2] * 55 + math.sin(q[0] * 2.5 + seed) * 2.5) ** 2)
                if vnoise(p, 6.0, seed + 11) > 0.72: c = mul(c, 0.82)
                if pc and n.z > 0.5 and vnoise(p, 9.0, seed + 30) > 0.52: c = mix(c, pc, 0.45)
                if abs(n.x) > 0.7: c = mix(c, '#c8b496', 0.5)
                return c
            if i == 4:     # a snapped board: two pieces, a jagged gap
                put(rbox((L_ * 0.55, w, 0.05), r=0.014, extra=(3, 1, 0), M=F.m @ lm((-L_ * 0.22, 0.05, 0))), bc, 'boards', 'body')
                put(rbox((L_ * 0.38, w, 0.05), r=0.014, extra=(2, 1, 0), M=F.m @ lm((L_ * 0.31, 0.05, 0.01), ry=0.08, rz=0.03)), bc, 'boards', 'body')
            else:
                put(rbox((L_, w, 0.05), r=0.014, extra=(5, 1, 0), M=F.m @ lm((0, 0.05, 0), rz=0.012 * (i % 2 - 0.5))), bc, 'boards', 'body')
            for x in (-0.6, 0.6):
                for e in (-1, 1):
                    put(cyl(0.016, 0.018, 0.012, (x - x0 + 0.005, 0.078, e * w * 0.28), K=4), flat('#3e3836'), 'nails', 'body')
    # a few barnacles on the board ends, a shell and a scrap of kelp
    barn_cluster(F.W((0.88, 0.075, -0.68)), Vector((0, 0, 1)), 0.8, 3)
    barn_cluster(F.W((-0.92, 0.075, 0.55)), Vector((0, 0, 1)), 0.8, 4)
    shell((0.35, 0.075, 0.27), 0.06, ry=0.7)
    kelp([(-0.95, 0.06, -0.3), (-1.02, 0.03, -0.2), (-1.1, 0.01, -0.05)], 0.035, 5)
    return dict()

# ================================================================== 6. the net pile (kit netPile: heap 1.3 x 0.9 h 0.25, crate, buoys, bucket, coil; -z = the wall)
def build_netPile():
    new_asset()
    # the net heap: a folded, lumpy mound with a diamond mesh painted in (light cords, dark holes)
    NX, NZ = 33, 24; X0, X1, Z0, Z1 = -0.72, 0.72, -0.5, 0.5
    folds = [(-0.35, 0.05, 0.22, 0.07), (0.25, -0.1, 0.25, 0.06), (0.0, 0.25, 0.3, 0.05), (0.45, 0.2, 0.18, 0.04), (-0.5, -0.25, 0.2, 0.05)]
    def hgt(x, z):
        r = (x / 0.68) ** 2 + (z / 0.46) ** 2
        h = 0.27 * max(0.0, 1 - r) ** 0.7
        for fx, fz, fr, fh in folds: h += fh * math.exp(-((x - fx) ** 2 + (z - fz) ** 2) / (fr * fr)) * (1 if r < 1 else 0)
        h += 0.022 * math.sin(x * 14 + z * 6) * max(0.0, 1 - r)
        return max(0.0, h) - 0.02
    t = PTmp(); grid = []
    for j in range(NZ + 1):
        row = []
        for i in range(NX + 1):
            x = X0 + (X1 - X0) * i / NX; z = Z0 + (Z1 - Z0) * j / NZ
            row.append(t.vert(F.W((x, hgt(x, z), z))))
        grid.append(row)
    for j in range(NZ):
        for i in range(NX):
            q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
            if all(t.v[k].z < -0.015 for k in q): continue
            t.face(q, Vector((0, 0, 1)))
    t.normals()
    def netc(p, n):
        x, z = p.x, -p.y
        i = round((x - X0) / ((X1 - X0) / NX)); j = round((z - Z0) / ((Z1 - Z0) / NZ))
        cord = 1.0 if (i % 3 == 0 or j % 3 == 0) else 0.0
        c = mix('#5e5240', mix('#b4a27c', '#d8c89e', clamp(n.z)), 0.25 + 0.75 * cord)
        c = mul(c, 0.84 + 0.2 * clamp(n.z * 0.6 + 0.4))
        if vnoise(p, 3.0, 4) > 0.66: c = mix(c, '#7a8a5a', 0.25)
        return c
    put(t, netc, 'net', 'body')
    # the float line: a thick rope across the heap with chunky corks on it
    fl = lambda u: (-0.7 + 1.35 * u, hgt(-0.7 + 1.35 * u, -0.05 + 0.25 * math.sin(u * 2.5)) + 0.03, -0.05 + 0.25 * math.sin(u * 2.5))
    put(gtube([fl(k / 16) for k in range(17)], 0.025, K=5), soft('#d0b880', 0.3), 'floatLine', 'body')
    for k in range(1, 8):
        if k in (2, 4, 6): continue
        c = fl(k / 8)
        put(cyl(0.05, 0.05, 0.07, (c[0], c[1] + 0.01, c[2]), K=8, rz=PI / 2), lambda p, n: mix('#8a5e3a', '#c48a54', clamp(n.z * 0.5 + 0.5)), 'corks', 'body')
    # the four glass floats in their rope cradles, sitting in the net (kit (k - 1.5) * 0.3, y 0.22 / 0.28, z 0.1 / 0.22)
    cols = ['#6cc0f0', '#6cd4b0', '#f0b060', '#90d8f0']
    for k in range(4):
        x = (k - 1.5) * 0.3; z = 0.1 + (k % 2) * 0.12
        y = hgt(x, z) + 0.06
        glass_float((x, y, z), 0.09, cols[k], tag='float%d' % k)
    # the crate (kit (0.85, 0, -0.15) ry 0.3, size 0.36, blue-grey wood)
    with at((0.85, 0.0, -0.15), ry=0.3):
        s = 0.38; hh = 0.34; wd = '#5e7c96'
        def crc(p, n):
            c = mix(mul(wd, 0.72), mix(wd, '#a8bccc', 0.3), clamp(n.z * 0.5 + 0.45))
            if vnoise(p, 5.0, 8) > 0.6: c = mix(c, DRIFT, 0.5)
            return c
        put(beam(s, hh, s, (0, hh / 2, 0), c=0.03), crc, 'crate', 'body')
        for zz in (-1, 1):
            for yy in (0.06, hh - 0.06):
                put(box(s + 0.02, 0.06, 0.035, (0, yy, zz * s / 2), r=0.008), soft(mul(wd, 0.62), 0.2), 'crate', 'body')
            put(box(0.05, hh * 1.05, 0.03, (0, hh / 2, zz * (s / 2 + 0.01)), r=0.0, rz=0.75), soft(mul(wd, 0.62), 0.2), 'crate', 'body')
        for xx in (-1, 1):
            for yy in (0.06, hh - 0.06):
                put(box(0.035, 0.06, s + 0.02, (xx * s / 2, yy, 0), r=0.008), soft(mul(wd, 0.62), 0.2), 'crate', 'body')
        # a coil of spare line and a starfish on the lid
        for k in range(2):
            put(gloop([(0.03 + math.cos(TAU * i / 10) * (0.1 - k * 0.025), hh + 0.02 + k * 0.03, math.sin(TAU * i / 10) * (0.1 - k * 0.025)) for i in range(10)], 0.02, K=4),
                soft('#d8c088', 0.3), 'crate', 'body')
    # the two buoys (kit (-0.95, 0.17, 0.25), (-0.63, 0.17, 0.13)): red, a cream band, a rope eye
    for i, (x, z, ry, tilt) in enumerate([(-0.98, 0.25, 0.0, 0.25), (-0.66, 0.12, 0.8, -0.15)]):
        with at((x, 0.16, z), ry=ry, rz=tilt):
            loc = local_fn()
            def bc(p, n):
                c = '#fff0dc' if abs(loc(p)[1]) < 0.05 else '#d6463a'
                return mix(mul(c, 0.78), mix(c, '#fff6ea', 0.25), clamp(n.z * 0.5 + 0.5))
            put(sph(0.165, (0, 0, 0), sc=(1, 1.12, 1), K=12, J=7), bc, 'buoys', 'body')
            put(cyl(0.035, 0.04, 0.07, (0, 0.2, 0), K=6), soft('#4a4450', 0.3), 'buoys', 'body')
            put(gloop([(0.0, 0.26 + 0.04 * math.sin(TAU * k / 8), 0.045 * math.cos(TAU * k / 8)) for k in range(8)], 0.016, K=3), soft('#d8c088', 0.3), 'buoys', 'body')
    # the bucket (kit (0.5, 0, 0.55) r 0.13 h 0.18, water): wooden staves, two iron hoops, a rope handle, water in it
    with at((0.5, 0.0, 0.55)):
        r, h = 0.14, 0.2
        put(glathe([(0.0, 0.0), (r * 0.86, 0.0), (r, h), (r * 0.84, h), (r * 0.72, 0.03), (0.0, 0.03)], 12,
                   rfn=lambda rr, z, th: rr * (1 + 0.025 * abs(math.sin(th * 6)))),
            lambda p, n: mul(mix('#7a6450', '#b0947a', clamp(n.z * 0.5 + 0.5)), 0.86 + 0.14 * abs(math.sin(math.atan2(p.y, p.x) * 6))), 'bucket', 'body')
        for y in (0.045, h - 0.035):
            rr = r * (0.88 + 0.12 * y / h) + 0.006
            put(gloop([(rr * math.cos(TAU * k / 12), y, rr * math.sin(TAU * k / 12)) for k in range(12)], 0.015, K=3), soft('#4a4450', 0.3), 'bucket', 'body')
        put(gtube([(-r, h - 0.02, 0), (-r * 0.6, h + r * 0.75, 0), (0, h + r * 0.95, 0), (r * 0.6, h + r * 0.75, 0), (r, h - 0.02, 0)], 0.016, K=4),
            soft('#d0b880', 0.3), 'bucket', 'body')
        put(glathe([(0.0, h - 0.045), (r * 0.9, h - 0.045), (r * 0.88, h - 0.06), (0.0, h - 0.06)], 12),
            lambda p, n: mix('#3c8aa0', '#7ccce0', clamp(n.z * 0.4 + 0.4)), 'water', 'water')
    # the rope coil (kit (-0.4, 0.03, 0.62)): a flat spiral of 3.5 turns, its tail trailing toward the heap
    pts = []
    for k in range(56):
        u = k / 55; a = u * TAU * 3.5; rr = 0.07 + 0.16 * u
        pts.append((-0.4 + math.cos(a) * rr, 0.03 + 0.03 * (1 - u) + 0.008 * math.sin(a * 2), 0.62 + math.sin(a) * rr))
    last = pts[-1]
    pts += [(last[0] + 0.08, 0.03, last[2] - 0.12), (last[0] + 0.16, 0.06, last[2] - 0.3)]
    put(gtube(pts, 0.028, K=5), rope_col(lambda p, n: p.x * 70 + p.y * 50), 'coil', 'body')
    # sea litter: a starfish on the net, shells, a pebble
    starfish((0.3, hgt(0.3, 0.32) + 0.005, 0.32), 0.09, 0.4, '#e8784a')
    shell((0.2, 0.0, 0.7), 0.06, ry=0.3); shell((-0.95, 0.0, 0.62), 0.055, ry=-0.8, col='#f4c8b8')
    pebble((1.1, -0.01, 0.3), 0.06, sq=0.6, seed=190, col='#6e7880', tag='pebbles', K=6)
    return dict()

# ================================================================== run
PIECES = {'umiHokora': (build_umiHokora, 9, 0.008), 'crabHusk': (build_crabHusk, 5, 0.004), 'brazier': (build_brazier, 1, 0.004),
          'weddedPair': (build_weddedPair, 2, 0.008), 'planks': (build_planks, 21, 0.003), 'netPile': (build_netPile, 4, 0.004)}
names = list(PIECES) if PIECE == 'all' else PIECE.split(',')
for name in names:
    fn, sd, amt = PIECES[name]
    info = fn()
    keep = {k: list(o['c']) for k, o in A.objs.items() if k in ('glow', 'hot')}
    finish(A, seed=sd, amt=amt)
    for k, c in keep.items(): A.objs[k]['c'] = c
    ray_ao(skip=('glow', 'hot', 'cloth', 'water'))
    export_piece('dg-tidepool-' + name, info)
print('DGT done')
