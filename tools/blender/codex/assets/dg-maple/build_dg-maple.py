# PAWHAVEN: the Maple Halls' own set pieces (task dg-maple), built in Blender by script.
#   blender --background --factory-startup --python build_dg-maple.py -- --piece hokora|rootTangle|...|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up; each piece sits in its kit piece's own local frame (src/dungeon/zoneKits/maple.js
# KIT_PIECES): the same origin, facing (the kit's +z, the visitor / room side, is Blender -Y), ground level and size.
# Layout code is written in the kit's game frame (x, y up, z front) and mapped to Blender (x, -z, y).
# Kits (reused from dg-bamboo): base_kit.py + rg_kit.py (boulders, moss icing, beams) and dg_common.py (buckets,
# painters, ray AO, export, the gable roof). New here: momiji leaves, maple bark roots, the stone tanuki, persimmons.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
_c = os.path.join(HERE, 'dg_common.py')
exec(compile(open(_c, encoding='utf-8').read(), _c, 'exec'))

# ================================================================== the halls' palette (sRGB): the hollow's autumn, underground
LEAVES = ['#c8402c', '#e2602e', '#f08a34', '#f2b440', '#a8382a', '#d86a30']
AM = dict(lo='#3e4c28', mid='#5e7036', hi='#8a9a4c')                  # autumn moss (the kit's mossDk / mossLt)
MOSS_LO, MOSS, MOSS_HI = AM['lo'], AM['mid'], AM['hi']              # (dg_common's stone_paint / slab_col read these)
BARK = ('#4a3628', '#94704e')                                        # maple bark (kit barkGeo '#5a4232'..'#ae8c6c')
HST = '#a89a8c'                                                      # the hokora's dressed stone (kit '#a49688')
ROCK = dict(lo='#4e4640', mid='#78706a', hi='#a8a096', warm='#c0a888')
CAPS = ['#d8643a', '#e8884a', '#c8502e']                              # mushroom caps

def AMP(seed): return DG['moss_painter'](lo=AM['lo'], mid=AM['mid'], hi=AM['hi'], seed=seed, warm='#a8943a', cool='#5a7a44')
def amoss_col(seed): return moss_col(seed, lo='#425028', mid='#62743a', hi='#8e9e50')
def moss_blob(pos, r, h, seed=0, lobes=5, K=16, tag='mossdrift', amp=0.11):
    put(dome(F.W(pos), r, h, lobes=lobes, K=K, seed=seed, amp=amp), amoss_col(seed), tag, 'stone')

# ================================================================== momiji (maple leaves)
_LOBES = [(-2.05, 0.6), (-1.02, 0.9), (0.0, 1.0), (1.02, 0.9), (2.05, 0.6)]
def _momiji_outline():
    pts = [(PI, 0.13)]
    for j, (a, L) in enumerate(_LOBES):
        pts += [(a - 0.26, L * 0.58), (a, L), (a + 0.26, L * 0.58)]
        if j < 4: pts.append(((a + _LOBES[j + 1][0]) / 2, 0.33))
    pts.append((PI - 0.0001, 0.13))
    return pts[:-1]
MOMIJI = _momiji_outline()

def momiji(c, nrm, size, rot, color, curl=0.035, tag='leaves', mat='leaf'):
    """a chunky five-lobed maple leaf (Blender coords): pointed serrated lobes, a pale heart and deeper tips, its tips
    curled a little off the surface; two faces 7 mm apart (top / under)"""
    z = Vector(nrm).normalized()
    xa = (X if abs(z.x) < 0.9 else Y).cross(z).normalized(); ya = z.cross(xa)
    R = size * 0.55
    t = PTmp(); top, bot = [], []
    for a, r in MOMIJI:
        d = ya * math.cos(a + rot) + xa * math.sin(a + rot)
        q = c + d * (r * R) + z * (0.006 + curl * r * r)
        top.append(t.vert(q)); bot.append(t.vert(q - z * 0.007))
    tc = t.vert(c + z * 0.016); bc = t.vert(c + z * 0.009)
    n = len(top)
    for k in range(n):
        t.face([tc, top[k], top[(k + 1) % n]], z); t.face([bc, bot[(k + 1) % n], bot[k]], -z)
    t.normals()
    base = srgb(color); dark = mul(base, 0.7); light = mix(base, '#ffe8b8', 0.24)
    def col(p, nn, c=c, z=z):
        d = clamp(((p - c) - z * (p - c).dot(z)).length / R)
        cc = mix(light, dark, clamp((d - 0.2) * 1.3))
        return mul(cc, 0.78) if nn.dot(z) < 0 else cc
    put(t, col, tag, mat)

def scene_bvh(mats=('stone', 'body')):
    allv, allf = [], []
    for k in mats:
        o = A.objs.get(k)
        if not o: continue
        b = len(allv); allv += o['v']
        for f in o['f']:
            for q in range(1, len(f) - 1): allf.append([f[0] + b, f[q] + b, f[q + 1] + b])
    b = len(allv); allv += [Vector((-9, -9, 0)), Vector((9, -9, 0)), Vector((9, 9, 0)), Vector((-9, 9, 0))]
    allf += [[b, b + 1, b + 2], [b, b + 2, b + 3]]
    return BVHTree.FromPolygons(allv, allf)

def leaf_rain(n, x0, x1, z0, z1, rnd, size=(0.1, 0.14), nmin=0.5, tag='leaves', mats=('stone', 'body'), avoid=None, pal=None):
    """drop n momiji from above onto whatever is built (game-local box x0..x1, z0..z1): each lands on the first
    up-facing surface under it, laid along it"""
    bvh = scene_bvh(mats); pal = pal or LEAVES
    placed = tries = 0
    while placed < n and tries < n * 8:
        tries += 1
        x = rnd.uniform(x0, x1); z = rnd.uniform(z0, z1)
        if avoid and avoid(x, z): continue
        hit = bvh.ray_cast(F.W((x, 4.0, z)), Vector((0, 0, -1)), 10.0)
        if hit[0] is None or hit[1].z < nmin: continue
        nn = (hit[1] + Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0))).normalized()
        momiji(hit[0] + hit[1] * (0.004 + 0.003 * (placed % 3)), nn, rnd.uniform(*size), rnd.uniform(0, TAU), pal[(placed * 5 + int(x * 7)) % len(pal)], tag=tag)
        placed += 1

def mushroom(pos, h, r, cap='#d8643a', tag='mushrooms', tilt=(0.0, 0.0)):
    """a little round toadstool (game-local pos), a pale stem, a domed cap with a lighter top and two pale spots"""
    with at(pos, rx=tilt[0], rz=tilt[1]):
        put(glathe([(0.0, 0.0), (r * 0.46, 0.0), (r * 0.36, h * 0.7), (0.0, h * 0.72)], 6), lambda p, n: mix('#d8c4a8', '#fff2dc', clamp(n.z * 0.5 + 0.5)), tag, 'body')
        put(glathe([(0.0, h * 0.52), (r, h * 0.6), (r * 0.94, h * 0.8), (r * 0.6, h * 0.97), (0.0, h * 1.02)], 8),
            lambda p, n: mix(mul(cap, 0.66), mix(cap, '#ffd8b0', 0.22), clamp(n.z * 0.8 + 0.2)), tag, 'body')
        for k in range(2):
            a = 0.8 + k * 2.6
            put(sph(r * 0.17, (math.cos(a) * r * 0.5, h * 0.95, math.sin(a) * r * 0.5), sc=(1, 0.4, 1), K=5, J=2), flat('#fff0dc'), tag, 'body')

def bark_p(c0=BARK[0], c1=BARK[1], seed=0, moss=0.0, ground_moss=True):
    """maple bark on a DG Beam: furrows along it (by the section angle), plates across, a lit crown; optional autumn moss
    on the up-facing crown, a damp mossy foot"""
    def f(part, p, n, meta):
        a = meta[1] if meta and meta[0] == 'beam' and meta[1] is not None else 0.0
        v = meta[2] if meta and meta[0] == 'beam' else 0.0
        c = DG['mixc'](c0, c1, clamp(n.z * 0.5 + 0.45))
        fz = 0.5 + 0.5 * math.cos(5 * a + 0.6 * math.sin(v * 1.7 + seed)); c = DG['mulc'](c, 0.6 + 0.5 * fz ** 1.5)
        if ((v / 0.38 + seed * 0.37) % 1) > 0.9: c = DG['mulc'](c, 0.8)
        c = DG['mulc'](c, 0.94 + 0.1 * DG['vnoise'](p, 3.0, seed))
        if moss > 0:
            m = n.z - (1 - moss) + (DG['vnoise'](p, 3.2, seed + 5) - 0.5) * 0.7
            if m > 0: c = DG['mixc'](c, DG['mixc'](AM['lo'], AM['mid'], clamp(n.z) * 0.8), clamp(m * 3.0) * 0.85)
        if ground_moss and p.z < 0.06: c = DG['mixc'](c, '#3a4426', 0.35 * clamp((0.06 - p.z) / 0.06))
        return c
    return f

SPL = DG['spline']
def wiggle(ctrl, amp, seed=0):
    """an S-wobble: a midpoint pushed sideways (in plan) between each pair of control points, alternating sides"""
    out = [ctrl[0]]
    for i in range(len(ctrl) - 1):
        a, b = Vector(ctrl[i]), Vector(ctrl[i + 1]); m = (a + b) / 2; d = b - a
        side = Vector((-d.z, 0.0, d.x))
        if side.length > 1e-6: side.normalize()
        m += side * amp * (1 if (i + seed) % 2 else -1) * min(1.0, d.length * 1.5)
        out += [tuple(m), ctrl[i + 1]]
    return out

def root(ctrl, r0, r1, paint, furrow=(5, 0.2), name='root', tag='roots', K=None, step=0.09, cap0=False, burls=(), flat=0.84, wig=0.0, seed=0):
    """a maple root / limb along game-local control points: a furrowed DG Beam tapering r0 -> r1, a little flatter than
    round (flat), with optional burls ((u, size) bumps along it) and an S-wobble; returns (path, beam)"""
    if wig: ctrl = wiggle(ctrl, wig, seed)
    P = [(GL(*p), 0.0) for p in ctrl]
    path, _ = SPL(P)
    hw0 = lambda s: r0 + (r1 - r0) * s ** 0.8
    if burls:
        def hw(s):
            return hw0(s) * (1 + sum(b * math.exp(-((s - u) / 0.06) ** 2) for u, b in burls))
    else: hw = hw0
    bm = DG['Beam'](path, Vector((0, 0, 1)), hw, (lambda s: hw(s) * flat), e=1.0, cap=r1 * 0.9, furrow=furrow)
    K = K or (10 if r0 > 0.1 else (8 if r0 > 0.06 else 6))
    part = bm.build(name, 'root', paint, K=K, step=step, capn=1, cap0=cap0)
    putp(part, tag, 'body')
    return path, bm

def twig(pts, r0, r1, col='#6a5040', tag='twigs', K=4):
    put(gtube(pts, lambda s: r0 + (r1 - r0) * s, K=K), lambda p, n: mix(mul(col, 0.75), mix(col, '#c8a888', 0.25), clamp(n.z * 0.5 + 0.5)), tag, 'body')

def boulder(name, x, z, hc, ax, az, hup, seed, pal=ROCK, moss=None, tag='rock', **kw):
    b = DG['Boulder'](name, x, z, hc, ax, az, hup, seed=seed, moss=moss, **kw)
    sp = b.build(DG['stone_painter'](pal['lo'], pal['mid'], pal['hi'], warm=pal['warm'], seed=seed))
    putp(sp, tag, 'stone')
    if moss:
        m = DG['boulder_moss'](b, AMP(seed), stone=sp)
        putp(m, tag + 'Moss', 'stone')
    return b

# ================================================================== persimmons
LIGHT = Vector((-0.35, -0.55, 0.76)).normalized()
def persimmon(c, r, color, rng, dried=False, K=8, tag='persimmons'):
    """(rg-maple's) a plump persimmon (Blender c): fresh is squat with a dimpled top; dried (hoshigaki) is flatter,
    deeper amber and wrinkled, a dark calyx stub on top; a painted glossy highlight"""
    h = r * (0.8 if dried else 0.86)
    if dried: prof = [(0.0, -h), (r * 0.62, -h * 0.82), (r * 0.94, -h * 0.1), (r * 0.8, h * 0.6), (0.0, h)]
    else: prof = [(0.0, -h), (r * 0.74, -h * 0.84), (r, -h * 0.12), (r * 0.9, h * 0.52), (0.0, h * 0.86)]
    ph = rng.uniform(0, 1)
    t = lathe(prof, K, sy=0.84 if dried else 1.0, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + 0.07 * math.cos(4 * (th - ph)) + (0.05 * math.sin(7 * th + z * 40) if dried else 0)))
    t.xform(M_at(c, rz=rng.uniform(0, TAU)))
    base, topc = srgb(color), mix(color, '#ffb860', 0.35)
    def col(p, n, c=c):
        k = clamp((p.z - c.z) / (2 * h) + 0.5)
        cc = mix(mul(base, 0.78), topc, k)
        cc = mul(cc, 1 - 0.18 * clamp(-n.z))
        gl_ = smooth(0.8, 0.97, n.dot(LIGHT))
        cc = mix(cc, '#ffe4b8' if not dried else '#f4b878', gl_ * (0.8 if not dried else 0.5))
        if dried: cc = mul(cc, 0.9 + 0.14 * vnoise(p, 40, 3))
        return cc
    put(t, col, tag, 'body')
    # the calyx: four chunky sepals (fresh: green-brown star; dried: a dark stub with a twist of stalk)
    if dried:
        put(lathe([(0.0, -0.01), (0.022, -0.01), (0.016, 0.016), (0.0, 0.02)], 5).xform(Matrix.Translation(c + Vector((0, 0, h * 0.86)))), soft('#4a3622', 0.3), tag, 'body')
    else:
        tt = PTmp(); ph = rng.uniform(0, TAU); pts = []
        for k in range(8):
            a = ph + TAU * k / 8; rr = r * 0.6 if k % 2 == 0 else r * 0.24
            pts.append(c + Vector((math.cos(a) * rr, math.sin(a) * rr, h * 0.82 + (0.0 if k % 2 == 0 else 0.01))))
        top = tt.vert(c + Vector((0, 0, h * 0.82 + 0.022))); bot = tt.vert(c + Vector((0, 0, h * 0.82 - 0.004)))
        ids = [tt.vert(p) for p in pts]
        for k in range(8):
            tt.face([top, ids[k], ids[(k + 1) % 8]], Z); tt.face([bot, ids[(k + 1) % 8], ids[k]], -Z)
        tt.normals()
        put(tt, lambda p, n: mix('#5e6a2e', '#98a050', clamp(n.z) * 0.6) if n.z > 0 else srgb('#3e4220'), tag, 'body')
    return h

# ================================================================== the stone tanuki (hokora guardians)
def tanuki(sx):
    """a round stone tanuki in a straw kasa and a red bib, a tokkuri in one paw, on a mossy plinth (current frame:
    the plinth's foot, facing +z)"""
    put(rbox((0.36, 0.36, 0.22), r=0.045, M=F.m @ lm((0, 0.11, 0))), stone_paint('#9e9284', seed=12 + sx, moss=0.6, moss_up=0.4), 'tanuki', 'stone')
    ST = '#c8bcae'
    stc = stone_paint(ST, hi='#f2eae0', lo='#8a7e74', seed=20 + sx)
    put(sph(0.16, (0, 0.37, -0.01), sc=(1.0, 1.0, 0.94), K=10, J=6), stc, 'tanuki', 'stone')                 # body
    put(sph(0.115, (0, 0.33, 0.075), sc=(1.0, 1.02, 0.62), K=10, J=5), stone_paint('#e2d8ca', hi='#fbf4ea', lo='#a89c90', seed=3), 'tanuki', 'stone')  # belly
    put(sph(0.108, (0, 0.575, 0.02), sc=(1.04, 0.96, 1.0), K=10, J=6), stc, 'tanuki', 'stone')               # head
    put(sph(0.05, (0, 0.55, 0.115), sc=(1.1, 0.8, 0.9), K=7, J=4), stone_paint('#e8dfd2', hi='#fbf4ea', seed=4), 'tanuki', 'stone')  # muzzle
    put(sph(0.02, (0, 0.567, 0.158), K=5, J=3), flat('#3e3436'), 'tanuki', 'stone')                         # nose
    for e in (-1, 1):
        put(sph(0.036, (e * 0.046, 0.592, 0.092), sc=(1.0, 0.8, 0.5), K=6, J=3, rz=-e * 0.35), flat('#5a4c48'), 'tanuki', 'stone')  # the mask
        put(sph(0.016, (e * 0.046, 0.596, 0.108), K=5, J=2), flat('#2e2628'), 'tanuki', 'stone')             # eyes
        put(sph(0.034, (e * 0.07, 0.655, -0.005), sc=(1.0, 0.9, 0.6), K=6, J=3), stc, 'tanuki', 'stone')     # ears
        put(sph(0.042, (e * 0.1, 0.18, 0.09), sc=(1.0, 0.7, 1.2), K=6, J=3), stc, 'tanuki', 'stone')         # feet
    put(sph(0.075, (-sx * 0.02, 0.25, -0.15), sc=(0.85, 0.7, 1.2), K=7, J=4), stc, 'tanuki', 'stone')        # the tail
    # one paw holding a little tokkuri (the shigaraki way), the other on the belly
    put(sph(0.04, (sx * 0.125, 0.4, 0.08), K=6, J=3), stc, 'tanuki', 'stone')
    with at((sx * 0.155, 0.3, 0.08)):
        put(glathe([(0.0, 0.0), (0.036, 0.004), (0.045, 0.05), (0.03, 0.09), (0.016, 0.11), (0.02, 0.13), (0.0, 0.135)], 7),
            lambda p, n: mix('#a87a4e', '#e0b07a', clamp(n.z * 0.5 + 0.5)), 'tanuki', 'body')
    put(sph(0.038, (-sx * 0.1, 0.36, 0.11), K=6, J=3), stc, 'tanuki', 'stone')
    # the straw kasa
    with at((0, 0.665, -0.02), rx=-0.32):
        put(glathe([(0.0, 0.0), (0.15, 0.0), (0.148, 0.018), (0.06, 0.064), (0.0, 0.088)], 12),
            lambda p, n: mul(mix('#a88a4c', '#e6c886', clamp(n.z * 0.6 + 0.3)), 0.88 + 0.14 * (0.5 + 0.5 * math.cos(math.atan2(p.y, p.x) * 24))), 'tanuki', 'body')
    # the red bib
    redc = lambda p, n: mix('#a82c28', '#f06a50', clamp(n.z * 0.45 + 0.35 - n.y * 0.35))
    put(gloop([(0.1 * math.cos(TAU * k / 8), 0.5, 0.1 * math.sin(TAU * k / 8) + 0.01) for k in range(8)], 0.022, K=4), redc, 'tanuki', 'body')
    with at((0, 0.43, 0.105), rx=-0.3):
        tri = [(-0.1, 0.07), (0.1, 0.07), (0.065, 0.0), (0.026, -0.06), (0.0, -0.075), (-0.026, -0.06), (-0.065, 0.0)]
        put(prism(tri, 0.028, 0.0), redc, 'tanuki', 'body')

# ================================================================== 1. the hokora (kit hokora: 1.5 x 1.2 plinth, h 1.7)
def build_hokora():
    new_asset(); rnd = random.Random(5)
    # ---------------- the plinth: two courses of warm dressed stone, mossy on top, a front step
    put(rbox((1.5, 1.2, 0.26), r=0.06, M=F.m @ lm((0, 0.11, 0))), stone_paint(HST, hi='#d8ccc0', lo='#6e6258', seed=31, moss=0.45, moss_up=0.45), 'plinth', 'stone')
    put(rbox((1.3, 1.02, 0.1), r=0.035, M=F.m @ lm((0, 0.27, -0.04))), stone_paint('#b4a698', hi='#ddd2c6', lo='#6e6258', seed=32, moss=0.35, moss_up=0.5), 'plinth', 'stone')
    flagstone(1.0, 0.34, 0.12, (0.0, 0, 0.77), ry=0.03, base='#ab9d90', moss=0.4, seed=191, bottom=-0.06)
    Y0 = 0.32
    with at((0, Y0, -0.05)):
        WB = '#8a6448'
        def wallc(p, n):
            c = mix(mul(WB, 0.8), mix(WB, '#c89a78', 0.3), clamp(n.z * 0.5 + 0.5))
            c = mul(c, 0.9 + 0.12 * vnoise(Vector((p.x * 6, p.y * 6, p.z * 0.8)), 1.0, 3))
            g = clamp(1 - (p.z - Y0) / 0.28 + (vnoise(p, 4, 9) - 0.5) * 0.8)
            return mix(c, AM['mid'], g * 0.45)
        put(box(0.8, 0.8, 0.64, (0, 0.42, 0), r=0.03), wallc, 'shrine', 'body')
        PD = '#5e4232'
        for px_ in (-1, 1):
            for pz_ in (-1, 1):
                put(beam(0.09, 0.86, 0.09, (px_ * 0.42, 0.43, pz_ * 0.34), c=0.022), wood(PD, ao_z=Y0, seed=px_ + pz_ + 3), 'shrine', 'body')
        put(beam(0.98, 0.09, 0.11, (0, 0.05, 0.36), c=0.022), wood(PD), 'shrine', 'body')
        put(beam(1.0, 0.11, 0.12, (0, 0.8, 0.36), c=0.026), wood(PD), 'shrine', 'body')
        for sxd in (-1, 1):       # the lattice doors: a dark recess, a light kumiko grid
            put(box(0.37, 0.64, 0.04, (sxd * 0.19, 0.42, 0.33), r=0.012), lambda p, n: mix('#33241f', '#4e382e', clamp(n.z + 0.3)), 'doors', 'body')
            for yy in (0.115, 0.725):
                put(box(0.37, 0.034, 0.03, (sxd * 0.19, yy, 0.355), r=0.0), soft('#d8b484', 0.2), 'doors', 'body')
            for k in range(2):
                put(box(0.35, 0.03, 0.03, (sxd * 0.19, 0.32 + k * 0.2, 0.358), r=0.0), soft('#d8b484', 0.2), 'doors', 'body')
            for xo in (-0.17, 0.0, 0.17):
                put(box(0.034, 0.62, 0.03, (sxd * 0.19 + xo, 0.42, 0.356), r=0.0), soft('#d8b484', 0.2), 'doors', 'body')
        # the copper-green gable roof, its autumn moss, the ridge roll
        R = roof_gable(LX=0.72, DZ=0.6, YE=0.9, YR=1.33, TH=0.085, NR=6, NX=24, rpal=('#5a8a78', '#88b4a2', '#2e4c46'))
        gp = [(0.33, 0.8)] + [(-zz, R['top_y'](0.0, zz / R['DZ']) - 0.09) for zz in (-0.33, -0.22, -0.11, 0.0, 0.11, 0.22, 0.33)] + [(-0.33, 0.8)]
        with at((0, 0, 0), ry=PI / 2):
            put(prism(gp, 0.8, -0.4), lambda p, n: mix(mul(PD, 0.75), PD, clamp(n.z * 0.5 + 0.5)), 'shrine', 'body')
        k_ = R['LX'] / 0.9
        dfront = [(-0.4 * k_, 0.22, 0.16), (0.02, 0.3, 0.2), (0.4 * k_, 0.2, 0.15)]
        dback = [(-0.3 * k_, 0.26, 0.2), (0.28 * k_, 0.3, 0.2)]
        a0, a1 = -R['LX'] + 0.04, R['LX'] - 0.04
        def taper(s): return math.sqrt(max(0.0, math.sin(PI * clamp((s - a0) / (a1 - a0)))))
        def lo(s): return -(0.18 + 0.03 * math.sin(s * 6) + 0.8 * sum(dd * math.exp(-((s - c) / w_) ** 2) for c, dd, w_ in dfront)) * taper(s) - 0.02
        def hi(s): return (0.24 + 0.04 * math.sin(s * 6 + 1) + 0.8 * sum(dd * math.exp(-((s - c) / w_) ** 2) for c, dd, w_ in dback)) * taper(s) + 0.02
        mp = DG['strip_moss']('roof_moss', R['Sf'], a0, a1, 16, lo, hi, 0.05, AMP(3), ncross=7)
        putp(mp, 'roofmoss', 'stone')
        LXr = R['LX'] + 0.03
        rg = DG['Beam'](lambda s_: F.W(((s_ * 2 - 1) * LXr, R['top_y']((s_ * 2 - 1) * R['LX'], 0.0) + 0.035 + 0.07 * abs(s_ * 2 - 1) ** 4, 0.0)),
                        Vector((0, 0, 1)), lambda s_: 0.055, lambda s_: 0.05, e=0.7, cap=0.05)
        putp(rg.build('ridge', 'roof', DG['lacquer_painter']('#3e6058', '#243a36', '#62887c', spec='#a8c4bc', sheen=0.3), K=8, step=0.12, capn=2), 'ridge', 'body')
        x_, v_ = 0.36, -0.16; y_ = R['top_y'](x_, v_)
        moss_blob((x_, y_ + 0.015, -v_ * R['DZ']), 0.1, 0.06, seed=40, lobes=3, K=10, amp=0.06)
        # the shimenawa under the eave, three shide, the bell on its red-and-white cord
        ry_ = 0.74; fz = 0.42
        spts = [F.W((-0.46 + 0.92 * k / 10, ry_ - 0.07 * math.sin(PI * k / 10), fz + 0.01 * math.sin(PI * k / 10))) for k in range(11)]
        put(tube(spts, lambda s: 0.03 + 0.016 * math.sin(PI * s), K=6), rope_col(lambda p, n: p.x * 60 + math.atan2(n.z, -n.y) * 2), 'shimenawa', 'body')
        for k, x in enumerate((-0.25, 0.0, 0.25)):
            tt = (x + 0.46) / 0.92
            top = F.W((x, ry_ - 0.07 * math.sin(PI * tt) - 0.035, fz + 0.03))
            shide_tabs(top, F.N((0, 0, 1)), scale=0.58, tag='shide')
        put(sph(0.07, (0.0, 0.83, 0.45), K=8, J=5), lac('#f0bc4a', '#ffe08a', '#b0802a'), 'bell', 'body')
        put(box(0.03, 0.03, 0.03, (0.0, 0.79, 0.5), r=0.0), flat('#5a4020'), 'bell', 'body')
        cord = [(0.0, 0.77, 0.47), (0.012, 0.6, 0.49), (0.02, 0.42, 0.5), (0.03, 0.26, 0.51)]
        put(gtube(cord, 0.02, K=5), lambda p, n: mix('#b8302a', '#f06450', clamp(n.z * 0.4 + 0.5)) if (int((p.z * 18)) % 2) else mix('#e8dcd0', '#fff6ea', clamp(n.z * 0.4 + 0.5)), 'bell', 'body')
        put(glathe([(0.0, 0.0), (0.035, 0.02), (0.045, 0.09), (0.0, 0.12)], 6, pos=(0.032, 0.17, 0.515)), lambda p, n: mix('#b8302a', '#f06450', clamp(n.z * 0.5 + 0.5)), 'bell', 'body')
        # two red paper lanterns hung from the eave's front corners (they carry the kit's light, (0, 0.9, 0.55))
        for sxl in (-1, 1):
            with glow_uv((1.0, 0.55)):      # (the kit chochin's glow: flicker 1, tint 0.55)
                chochin(r=0.085, h=0.17, color='#e0543a', cord=0.1, pos=(sxl * 0.53, 0.86, 0.5), glow=True, tag='lanterns')
    # ---------------- the offering box (kit [0, 0.42, 0.57]) on the plinth's front edge
    with at((0, Y0, 0.56)):
        put(box(0.46, 0.22, 0.26, (0, 0.11, 0), r=0.025), wood('#6e4e38', ao_z=Y0, seed=5), 'offering', 'body')
        for k in range(4): put(box(0.42, 0.024, 0.034, (0, 0.23, -0.08 + k * 0.053), r=0.0), soft('#3e2a22', 0.2), 'offering', 'body')
        put(box(0.5, 0.04, 0.3, (0, 0.215, 0), r=0.012), wood('#86603e'), 'offering', 'body')
    # ---------------- a tokkuri of sake and its cup on the left, a little sanbo of persimmons on the right
    with at((-0.4, Y0, 0.5)):
        put(glathe([(0.0, 0.0), (0.05, 0.004), (0.068, 0.06), (0.046, 0.13), (0.022, 0.17), (0.028, 0.2), (0.0, 0.205)], 9),
            lambda p, n: mix('#d8cfc0', '#fbf6ec', clamp(n.z * 0.6 + 0.4)) if not (0.43 < p.z < 0.465) else mix('#2e4a8a', '#4a6ab8', clamp(n.z * 0.5 + 0.5)), 'sake', 'body')
        put(glathe([(0.0, 0.0), (0.03, 0.0), (0.04, 0.04), (0.034, 0.042), (0.0, 0.03)], 8, pos=(0.11, 0.0, 0.05)), lambda p, n: mix('#d8cfc0', '#fbf6ec', clamp(n.z * 0.6 + 0.4)), 'sake', 'body')
    with at((0.4, Y0, 0.48)):
        put(box(0.2, 0.08, 0.2, (0, 0.04, 0), r=0.012), wood('#c89a68'), 'sanbo', 'body')
        put(box(0.24, 0.025, 0.24, (0, 0.092, 0), r=0.008), wood('#d8ae7c'), 'sanbo', 'body')
        rr = random.Random(11)
        for k, (x, z, y) in enumerate([(-0.045, 0.03, 0.0), (0.05, 0.035, 0.0), (0.0, -0.05, 0.0), (0.0, 0.0, 0.07)]):
            persimmon(F.W((x, 0.105 + 0.045 + y, z)), 0.05, '#ec7a2a', rr)
    # ---------------- the two stone tanuki in straw hats (kit [+-0.95, 0, 0.5], turned in)
    for sx in (-1, 1):
        with at((sx * 0.96, 0, 0.5), ry=-sx * 0.3, s=1.0):
            tanuki(sx)
    # ---------------- moss cushions, grass, pebbles
    for k, (x, y, z, r_, h_) in enumerate([(-0.74, 0.0, -0.55, 0.24, 0.12), (0.72, 0.0, -0.5, 0.2, 0.1), (-0.62, 0.0, 0.66, 0.15, 0.07),
                                           (0.56, 0.0, 0.7, 0.13, 0.07)]):
        moss_blob((x, y, z), r_, h_, seed=200 + k, lobes=3, K=10, amp=0.07)
    for k, (x, z) in enumerate([(-0.82, -0.2), (0.84, -0.15), (0.66, -0.66)]):
        grass((x, 0.0, z), seed=300 + k, tag='grass')
    for k, (x, z, r_) in enumerate([(0.62, 0.88, 0.07), (-0.66, 0.9, 0.06)]):
        pebble((x, -0.01, z), r_, sq=0.6, seed=180 + k, col='#a89c94', tag='pebbles', K=6)
    # ---------------- momiji drifted over everything: the roof moss, the plinth, the floor round it
    leaf_rain(36, -1.25, 1.25, -0.95, 1.05, rnd, size=(0.13, 0.18))
    return dict(light=[0, 0.9, 0.55], lanterns=[[-0.53, 1.0, 0.45], [0.53, 1.0, 0.45]])

# ================================================================== 2. the root tangle (kit rootTangle: local -z = the wall)
def build_rootTangle(v):
    new_asset(); rnd = random.Random(101 + v * 7)
    m = 1 - 2 * v                         # v1 mirrors the layout's lean (and has its own roots)
    if v == 0:
        roots = [  # (ctrl, r0, r1, moss, burls)
            ([(-0.25, 0.68, -0.45), (-0.3, 0.58, -0.12), (-0.15, 0.28, 0.3), (0.02, 0.1, 0.8), (0.16, 0.04, 1.32), (0.12, -0.05, 1.75)], 0.17, 0.04, 0.24, [(0.32, 0.12)]),
            ([(0.52, 0.52, -0.45), (0.56, 0.42, -0.12), (0.64, 0.16, 0.3), (0.8, 0.06, 0.75), (0.88, -0.04, 1.08)], 0.12, 0.035, 0.2, [(0.25, 0.1)]),
        ]
        forks = [([(-0.17, 0.27, 0.3), (-0.45, 0.14, 0.6), (-0.72, 0.05, 0.94), (-0.9, -0.03, 1.16)], 0.08, 0.025),
                 ([(0.68, 0.13, 0.42), (0.42, 0.07, 0.72), (0.3, 0.03, 1.05), (0.34, -0.03, 1.26)], 0.055, 0.02)]
        thin = [[(0.14, 0.42, -0.42), (0.2, 0.26, -0.05), (0.3, 0.08, 0.42), (0.36, 0.03, 0.62), (0.52, -0.03, 0.82)],
                [(-0.72, 0.38, -0.42), (-0.76, 0.24, -0.1), (-0.9, 0.07, 0.28), (-0.98, -0.02, 0.55)]]
        mush = (0, 0.3); stones = [(0.98, 0.32, 0.15, 0.13, 0.13, 61)]
        clods = [(-0.28, -0.12, 0.24), (0.52, -0.14, 0.2), (0.12, -0.16, 0.16), (-0.75, -0.15, 0.17)]
    else:
        roots = [
            ([(0.3, 0.7, -0.45), (0.34, 0.6, -0.12), (0.2, 0.3, 0.32), (-0.05, 0.1, 0.85), (-0.26, 0.04, 1.42), (-0.24, -0.05, 1.9)], 0.18, 0.04, 0.24, [(0.3, 0.14), (0.62, 0.08)]),
            ([(-0.55, 0.46, -0.45), (-0.6, 0.36, -0.12), (-0.7, 0.12, 0.3), (-0.84, 0.03, 0.62), (-0.9, -0.04, 0.85)], 0.1, 0.03, 0.2, []),
        ]
        forks = [([(0.2, 0.3, 0.32), (0.5, 0.15, 0.66), (0.78, 0.05, 1.0), (0.94, -0.03, 1.22)], 0.085, 0.025),
                 ([(-0.02, 0.12, 0.8), (-0.4, 0.06, 1.05), (-0.62, -0.03, 1.28)], 0.05, 0.02)]
        thin = [[(-0.1, 0.44, -0.42), (-0.12, 0.28, -0.05), (-0.22, 0.08, 0.38), (-0.38, 0.03, 0.55), (-0.5, -0.03, 0.66)],
                [(0.72, 0.36, -0.42), (0.78, 0.22, -0.1), (0.94, 0.06, 0.25), (1.02, -0.02, 0.5)],
                [(0.02, 0.56, -0.42), (0.06, 0.46, -0.16)]]
        mush = (0, 0.28); stones = [(-1.0, 0.3, 0.14, 0.12, 0.12, 71), (0.62, 1.22, 0.1, 0.09, 0.09, 72)]
        clods = [(0.3, -0.12, 0.25), (-0.56, -0.14, 0.18), (-0.1, -0.16, 0.16), (0.74, -0.15, 0.17)]
    paths = []
    for k, (ctrl, r0, r1, moss, burls) in enumerate(roots):
        paths.append(root(ctrl, r0, r1, bark_p(seed=3 + k + v, moss=moss), furrow=(5, 0.2), name='thick%d' % k, tag='treeRoots', burls=burls, wig=0.09, seed=k + v, cap0=True))
    for k, (ctrl, r0, r1) in enumerate(forks):
        root(ctrl, r0, r1, bark_p(BARK[0], '#9a7454', seed=7 + k + v, moss=0.1), furrow=(4, 0.18), name='fork%d' % k, tag='treeRoots', wig=0.07, seed=k + 1)
    for k, ctrl in enumerate(thin):
        root(ctrl, 0.065 if len(ctrl) > 2 else 0.06, 0.024, bark_p('#56402e', '#a07a58', seed=11 + k + v), furrow=(3, 0.15), name='thin%d' % k, tag='thinRoots', K=6, wig=0.06 if len(ctrl) > 2 else 0.0, seed=k, cap0=True)
    # hair rootlets off the thick roots, pale where they're fresh
    for k, (path, bm) in enumerate(paths):
        for j in range(3):
            s = 0.3 + 0.2 * j + rnd.uniform(-0.05, 0.05)
            q = path(s); T = (path(min(1, s + 0.01)) - path(max(0, s - 0.01))).normalized()
            sd = T.cross(Vector((0, 0, 1))).normalized() * (1 if (j + k) % 2 else -1)
            q0 = q + sd * bm.hw(s) * 0.7
            tip = q + sd * (bm.hw(s) + rnd.uniform(0.18, 0.28)) + T * 0.08; tip.z = -0.03
            mid = q0 + (tip - q0) * 0.45 + sd * 0.05; mid.z = q0.z * 0.6 + 0.02
            put(tube([q0, mid, tip], lambda s_: 0.03 * (1 - 0.5 * s_), K=4),
                lambda p, n: mix('#6e5440', '#b08a66', clamp(n.z * 0.5 + 0.5)), 'rootlets', 'body')
    # the earthen bank at the wall foot the roots break out of (so they never start in mid-air, wherever the wall is)
    bank = lathe([(0.0, -0.04), (0.98, -0.04), (1.0, 0.1), (0.94, 0.26), (0.86, 0.42), (0.72, 0.56), (0.55, 0.68), (0.3, 0.78), (0.0, 0.81)], 20, sx=1.0, sy=0.36, th0=0.1,
                 rfn=lambda r_, z, th: r_ * (1 + 0.07 * math.cos(3 * th + v) + 0.06 * math.sin(5 * th + 1.3 * v + z * 7) + 0.05 * math.cos(9 * th - z * 5 + v)))
    bank.xform(Matrix.Translation(GL(0.05 * m, 0.0, -0.42)))
    def bankc(p, n):
        c = mul(mix('#4e3828', '#9a785a', clamp(n.z * 0.6 + 0.3)), 0.88 + 0.18 * vnoise(p, 5.0, 3 + v))
        if vnoise(p, 9.0, 8) > 0.66: c = mul(c, 0.8)                                    # pebbly crumbs
        mm = n.z - 0.5 + (vnoise(p, 2.6, 21 + v) - 0.5) * 0.9
        if mm > 0: c = mix(c, mix(AM['lo'], AM['mid'], clamp(n.z)), clamp(mm * 3.0) * 0.85)
        return c
    put(bank, bankc, 'bank', 'stone')
    # earth clods spilling out of the wall foot round the roots' bases
    for k, (x, z, r_) in enumerate(clods):
        put(dome(F.W((x, -0.02, z)), r_, r_ * 0.7, lobes=3, K=11, seed=400 + k + v * 9, amp=0.09),
            lambda p, n: mul(mix('#5a4232', '#9a7a5c', clamp(n.z * 0.7 + 0.2)), 0.9 + 0.16 * vnoise(p, 6.0, 7)), 'earth', 'stone')
    # moss cushions in the crotches, stones, a grass tuft
    for k, (x, z, r_, h_) in enumerate([(-0.5 * m, -0.05, 0.2, 0.1), (0.25 * m, 0.0, 0.16, 0.08), (0.42 * m, 0.62, 0.14, 0.06), (-0.62 * m, 0.72, 0.13, 0.06)]):
        moss_blob((x, 0.0, z), r_, h_, seed=900 + k + v * 10, lobes=3, K=10, amp=0.07)
    for k, (x, z, ax, az, hup, sd) in enumerate(stones):
        boulder('pebble%d' % k, x, z, hup * 0.35, ax, az, hup, seed=sd, exy=0.75, ez=0.7, lump=0.08, taper=0.12, res=0.1,
                moss=dict(t=0.04, cover=0.5, drips=3, drop=0.6, nu=16, dw=1.3, dexp=0.45, doffs=(-1.0, -0.6, 0.0, 0.6, 1.0)), tag='stones')
    for k, (x, z) in enumerate([(-0.35 * m, 0.1), (0.95 * m, 0.6)]):
        grass((x, 0.0, z), seed=960 + k + v * 10)
    # a mushroom cluster on the big root's shoulder, a couple at a clod
    path, bm = paths[0]
    for k, (ds, dx, h, r_) in enumerate([(0.0, 0.0, 0.13, 0.075), (0.04, 0.08, 0.1, 0.06), (-0.03, -0.07, 0.08, 0.05)]):
        s = mush[1] + ds; q = path(s); top = q + Vector((0, 0, bm.hw(s) * 0.82))
        mushroom((top.x + dx, top.z - 0.02, -top.y + dx * 0.4), h, r_, cap=CAPS[k % 3])
    cx, cz, cr = clods[1]
    for k, (dx, dz, h, r_) in enumerate([(0.0, cr * 0.9, 0.09, 0.055), (0.07, cr * 0.8, 0.07, 0.045)]):
        mushroom((cx + dx, 0.0, cz + dz), h, r_, cap=CAPS[(k + 1) % 3])
    leaf_rain(25, -1.15, 1.15, -0.75, 1.75, rnd, size=(0.13, 0.18))
    return dict(v=v)

# ================================================================== 3. the fallen branch (kit fallenBranch: along local x)
def build_fallenBranch(v):
    new_asset(); rnd = random.Random(131 + v * 17)
    if v == 0:
        main = [(-1.22, 0.1, 0.06), (-0.7, 0.1, -0.06), (-0.1, 0.085, 0.05), (0.5, 0.07, -0.04), (1.0, 0.06, 0.1), (1.32, 0.05, 0.2)]
        forks = [(0.24, [(0.32, -0.32, 0.075), (0.62, -0.68, 0.05), (0.8, -0.95, 0.03)]),          # (dx, dz, height) off the limb
                 (0.48, [(0.3, 0.3, 0.17), (0.55, 0.58, 0.27), (0.68, 0.82, 0.32)]),              # (this one sticks up)
                 (0.72, [(0.26, -0.28, 0.06), (0.46, -0.55, 0.035)])]
    else:
        main = [(-1.26, 0.1, -0.04), (-0.66, 0.095, 0.08), (-0.05, 0.085, -0.04), (0.55, 0.07, 0.06), (1.05, 0.06, -0.06), (1.36, 0.05, -0.18)]
        forks = [(0.2, [(0.3, 0.34, 0.075), (0.58, 0.72, 0.05), (0.72, 1.0, 0.03)]),
                 (0.45, [(0.32, -0.3, 0.16), (0.58, -0.58, 0.26), (0.72, -0.8, 0.3)]),
                 (0.7, [(0.28, 0.24, 0.055), (0.5, 0.5, 0.035)])]
    r0, r1 = 0.115, 0.05
    P = [(GL(*p), 0.0) for p in main]; path, _ = SPL(P)
    bm = DG['Beam'](path, Vector((0, 0, 1)), lambda s: r0 + (r1 - r0) * s, lambda s: (r0 + (r1 - r0) * s) * 0.94, e=1.0, cap=0.05, furrow=(5, 0.16))
    part = bm.build('limb', 'root', None, K=10, step=0.09, capn=2)
    broken_end(part, bm, False, amp=0.06, seed=3 + v)
    part.paint = raw_or(bark_p(seed=21 + v, moss=0.14, ground_moss=False), bm, False, raw='#d8b088')
    putp(part, 'limb', 'body')
    # the forks: each off the limb, lying low or propped up, with twigs off them and leaves still on the tips
    tips = []
    for k, (s, ctrl) in enumerate(forks):
        q = path(s); b0 = (q.x, q.z, -q.y)                                # (Blender -> game)
        pts = [b0] + [(b0[0] + dx, y, b0[2] + dz) for dx, dz, y in ctrl]
        rk = 0.06 - 0.008 * k
        fp, fb = root(pts, rk, 0.02, bark_p('#4e3a2c', '#9a7656', seed=31 + k + v, moss=0.0, ground_moss=False), furrow=(4, 0.14), name='fork%d' % k, tag='forks', K=6, step=0.1)
        tips.append((fp(1.0), (fp(1.0) - fp(0.85)).normalized()))
        for j in range(2):             # two twigs off each fork
            u = 0.45 + 0.3 * j
            a = fp(u); T = (fp(min(1, u + 0.02)) - fp(u - 0.02)).normalized()
            side = T.cross(Vector((0, 0, 1))).normalized() * (1 if j % 2 else -1)
            e = a + T * 0.16 + side * rnd.uniform(0.2, 0.3) + Vector((0, 0, rnd.uniform(0.03, 0.12)))
            put(tube([a, (a + e) / 2 + Vector((0, 0, 0.02)), e], lambda s_: 0.028 * (1 - 0.45 * s_), K=4),
                lambda p, n: mix('#5a4434', '#a88a68', clamp(n.z * 0.5 + 0.5)), 'twigs', 'body')
            tips.append((e, (e - a).normalized()))
    # the limb's own forked tip
    q1 = path(1.0); T1 = (path(1.0) - path(0.96)).normalized()
    for sd in (-1, 1):
        side = T1.cross(Vector((0, 0, 1))).normalized() * sd
        e = q1 + T1 * 0.3 + side * 0.18 + Vector((0, 0, 0.06 + 0.05 * sd))
        put(tube([q1 - T1 * 0.04, (q1 + e) / 2, e], lambda s_: 0.04 * (1 - 0.5 * s_), K=5), lambda p, n: mix('#5a4434', '#a88a68', clamp(n.z * 0.5 + 0.5)), 'twigs', 'body')
        tips.append((e, (e - q1).normalized()))
    # leaves still on the tips: little bunches of three or four, held up off the floor
    for k, (tp, d) in enumerate(tips):
        nl = 3 if k % 2 else 4
        for j in range(nl):
            a = TAU * j / nl + rnd.uniform(-0.3, 0.3) + k
            off = Vector((math.cos(a), math.sin(a), 0)) * 0.07 + d * 0.05
            nn = Vector((math.cos(a) * 0.45, math.sin(a) * 0.45, 1.0)).normalized()
            momiji(tp + off + Vector((0, 0, 0.02 + 0.012 * j)), nn, rnd.uniform(0.12, 0.16), rnd.uniform(0, TAU), LEAVES[(k * 3 + j) % 6], curl=0.04, tag='leavesOn')
    # moss creeping on the limb's crown near the broken end, a moss cushion and a mushroom at the foot
    moss_blob((-0.9, 0.0, 0.2 if v == 0 else -0.24), 0.17, 0.07, seed=150 + v, lobes=3, K=10, amp=0.07)
    hp = path(0.12)
    mushroom((hp.x + 0.02, 0.0, -hp.y + 0.15 * (1 if v == 0 else -1)), 0.1, 0.06, cap=CAPS[v])
    mushroom((hp.x + 0.12, 0.0, -hp.y + 0.2 * (1 if v == 0 else -1)), 0.075, 0.045, cap=CAPS[2])
    # fallen leaves round it (the kit's strew: 16 over ~1.4 m)
    leaf_rain(22, -1.45, 1.45, -1.0, 1.05, rnd, size=(0.13, 0.18))
    return dict(v=v)

# ================================================================== 4. the stump (kit stump: r ~0.4, h ~0.52)
def build_stump():
    new_asset(); rnd = random.Random(77)
    Rr, H = 0.41, 0.52
    DARK = (0.86, 0.66, 0.44, 0.24)                      # the growth rings (fractions of the cut's radius), drawn crisp
    RINGS = [0.93] + [d + e for c in DARK for d, e in ((c, 0.035), (c, 0.0), (c, -0.035))] + [0.1]
    def wob(rr, z, th):
        k = 1 + 0.06 * math.cos(3 * th + 1.0) + 0.035 * math.cos(5 * th + 2.0)
        if rr > Rr * 0.9: k *= 1 + 0.045 * math.cos(11 * th + 0.8 * math.sin(z * 6))     # bark furrows
        return rr * k
    prof = [(0.0, -0.08), (Rr * 1.32, -0.08), (Rr * 1.22, 0.03), (Rr * 1.08, 0.13), (Rr * 1.01, 0.28), (Rr * 0.99, H - 0.04), (Rr * 0.975, H + 0.01),
            (Rr * 0.9, H + 0.012), (Rr * 0.86, H - 0.012)] + [(Rr * 0.88 * d, H - 0.01 + 0.012 * (1 - d)) for d in RINGS] + [(0.0, H + 0.003)]
    t = lathe(prof, 22, rfn=wob, th0=0.2)
    def sc(p, n):
        rr = math.hypot(p.x, p.y); th = math.atan2(p.y, p.x)
        if n.z > 0.75 and rr < Rr * 0.9 and p.z > H - 0.03:                    # the cut: rings, pith
            d = rr / (Rr * 0.88 * (1 + 0.06 * math.cos(3 * th + 1.0) + 0.035 * math.cos(5 * th + 2.0)))
            c = mix('#ecca98', '#c09060', d * 0.5)
            if min(abs(d - k_) for k_ in DARK) < 0.012: c = mix(c, '#8a5a38', 0.8)
            if d > 0.95: c = mix(c, '#a07048', 0.6)
            if d < 0.08: c = mix(c, '#7a5638', 0.7)
            for ca in (0.6, 2.4, 4.2):
                if abs(math.sin((th - ca) * 0.5)) < 0.02 / max(d, 0.1) and 0.15 < d < 0.85: c = mix(c, '#6a4a30', 0.6)
            return c
        c = mix(BARK[0], BARK[1], clamp(n.z * 0.4 + 0.45))
        c = mul(c, 0.7 + 0.38 * (0.5 + 0.5 * math.cos(11 * th + 0.8 * math.sin(p.z * 6))))
        if n.z > 0.6: c = mix('#5a4030', '#8e6c4c', 0.5)                         # the bark rim's top
        c = mul(c, 0.94 + 0.1 * vnoise(p, 3.0, 5))
        m = (vnoise(p, 2.4, 9) - 0.5) * 1.6 + (0.4 - abs(th - 2.0)) * 1.2 + (0.2 - p.z) * 2.0      # moss on the back-left foot
        if m > 0: c = mix(c, mix(AM['lo'], AM['mid'], clamp(n.z + 0.4)), clamp(m * 1.8) * 0.85)
        if p.z < 0.05: c = mix(c, '#3a4426', 0.35)
        return c
    put(t, sc, 'stump', 'body')
    # five root flares diving into the floor
    for k in range(5):
        a = 0.5 + k * TAU / 5 + rnd.uniform(-0.25, 0.25)
        ca, sa = math.cos(a), math.sin(a)
        L_ = 0.3 + 0.12 * ((k * 7) % 3) / 2
        ctrl = [(ca * Rr * 0.7, 0.26, -sa * Rr * 0.7), (ca * (Rr + 0.08), 0.1, -sa * (Rr + 0.08)), (ca * (Rr + L_ * 0.6), 0.03, -sa * (Rr + L_ * 0.6)), (ca * (Rr + L_), -0.07, -sa * (Rr + L_))]
        root(ctrl, 0.13, 0.05, bark_p(seed=40 + k), furrow=(4, 0.16), name='flare%d' % k, tag='flares', K=8, flat=0.75)
    # the glowing shelf fungus stepping up the +x side (kit: four brackets about a = -0.5 .. 0.5)
    for k in range(4):
        a = (k - 1.5) * 0.36; y = H * (0.22 + k * 0.18); s_ = 0.15 - k * 0.014
        rr = Rr * (1.06 if k == 0 else 1.0) - 0.02
        c = Vector((math.cos(a) * rr, math.sin(a) * rr, y))
        with at((c.x, c.z, -c.y), ry=a):
            pr = [(0.0, -0.035), (s_ * 0.7, -0.03), (s_, -0.006), (s_ * 0.98, 0.01), (s_ * 0.75, 0.03), (0.0, 0.042)]
            br = lathe(pr, 12, sx=0.78, sy=1.0, th0=0.0, rfn=lambda r_, z, th: r_ * (1 + 0.05 * math.cos(3 * th + k)))
            br.xform(F.m @ lm((0.0, 0, 0)) @ Matrix.Translation((0.0, 0.0, 0.0)))
            Mi = F.m.inverted(); S_ = s_
            def fc(p, n, Mi=Mi, S_=S_):
                lp = Mi @ p; d = clamp(math.hypot(lp.x / 0.78, lp.y) / S_)
                if n.z < -0.3: return mix('#b05a26', '#d8783a', d)                     # the gills underneath
                c = mix('#d87a34', '#ffb868', smooth(0.35, 0.95, d))                 # bright growing rim
                if 0.55 < d < 0.62 or 0.8 < d < 0.85: c = mul(c, 0.86)
                return c
            put(br, fc, 'fungus', 'glow', uv=lambda p: (0.1, 0.0))      # (the kit stump fungus' glow: flicker 0.1, tint 0)
    # mushrooms at the foot, a moss cushion, a grass tuft, a couple of pebbles
    for k, (x, z, h, r_) in enumerate([(-0.5, 0.32, 0.12, 0.07), (-0.42, 0.42, 0.09, 0.055), (-0.58, 0.44, 0.075, 0.045), (0.2, -0.56, 0.1, 0.06)]):
        mushroom((x, 0.0, z), h, r_, cap=CAPS[k % 3])
    moss_blob((-0.3, 0.0, -0.55), 0.2, 0.09, seed=71, lobes=3, K=10, amp=0.07)
    grass((-0.62, 0.0, -0.2), seed=73); grass((0.6, 0.0, 0.5), seed=74)
    for k, (x, z, r_) in enumerate([(0.72, -0.3, 0.07), (-0.2, 0.72, 0.06)]):
        pebble((x, -0.01, z), r_, sq=0.6, seed=180 + k, col='#a09488', tag='pebbles', K=6)
    leaf_rain(16, -0.95, 0.95, -0.95, 0.95, rnd, size=(0.13, 0.18))
    return dict(top=H)

# ================================================================== 5. the hoshigaki rack (kit hoshigakiRack: along local x)
def build_hoshigakiRack():
    new_asset(); rnd = random.Random(61)
    W, H = 1.5, 1.55
    POLE = '#5e4434'
    def pole(a, b, r, col=POLE, tag='frame', K=7):
        put(gtube([a, ((a[0] + b[0]) / 2 + 0.01, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), b], lambda s: r * (1 - 0.15 * s), K=K, caps=True),
            lambda p, n: mul(mix(mul(col, 0.78), mix(col, '#c8a07a', 0.3), clamp(n.z * 0.4 + 0.5 - n.y * 0.1)), 0.92 + 0.1 * vnoise(p, 6.0, 3)), tag, 'body')
    # two crooked timber posts on flat footing stones, a back strut each, a pole lashed across the tops
    for sx in (-1, 1):
        x = sx * W / 2
        pole((x, -0.05, 0.0), (x + sx * 0.02, H + 0.12, -0.01), 0.055)
        pole((x, 0.0, -0.42), (x, H - 0.25, -0.03), 0.04)                      # the back strut
        put(rbox((0.26, 0.24, 0.08), r=0.03, M=F.m @ lm((x, 0.02, 0.0), ry=0.3 * sx)), stone_paint('#9e9284', seed=5 + sx, moss=0.4, moss_up=0.5), 'footing', 'stone')
        for yy, zz in ((H, 0.0), (H - 0.26, -0.02)):                           # rope lashings
            put(gloop([(x + 0.068 * math.cos(TAU * k / 8), yy + 0.02 * math.sin(TAU * k / 8 * 2), zz + 0.068 * math.sin(TAU * k / 8)) for k in range(8)], 0.02, K=4),
                rope_col(lambda p, n: p.z * 140 + p.x * 40), 'lashing', 'body')
    put(gtube([(-W / 2 - 0.18, H, 0.0), (0.0, H - 0.012, 0.0), (W / 2 + 0.18, H, 0.0)], 0.038, K=8),
        lambda p, n: mul(mix('#8a6a48', '#d0aa78', clamp(n.z * 0.5 + 0.5)), 0.92 + 0.12 * vnoise(p, 6.0, 4)), 'bar', 'body')
    # two rafters front-to-back on the post tops, the straw rain cover (front edge lower) with a ragged fringe
    tilt = 0.14
    def cov(x, zf):                       # the cover's top surface height at depth zf (game z)
        return H + 0.17 - zf * math.tan(tilt)
    for sx in (-1, 1):
        put(beam(0.05, 0.05, 0.62, (sx * (W / 2 + 0.02), cov(0, 0) - 0.07, 0.0), c=0.012, rx=tilt), wood('#6e5240'), 'rafters', 'body')
    D = 0.6; WC = W + 0.5
    for tier, (zc, dd, yoff) in enumerate([(0.0, D, 0.0)]):
        with at((0, cov(0, zc) + yoff, zc), rx=tilt):
            # the thatch: a slab of straw bundles laid front-to-back (a ridge per bundle, 4.5 cm), a soft rolled crown
            NX, NZ, BW = 44, 4, WC / 44
            def ytop(i, j):
                u = j / NZ; return 0.03 + 0.012 * math.sin(PI * u) + (0.012 if i % 2 else 0.0) * (0.6 + 0.4 * math.sin(i * 2.3)) * (0.3 + 0.7 * math.sin(PI * u))
            th = PTmp()
            T = [[th.vert(F.W((-WC / 2 + i * BW, ytop(i, j), -dd / 2 + dd * j / NZ))) for j in range(NZ + 1)] for i in range(NX + 1)]
            Bm = [[th.vert(F.W((-WC / 2 + i * BW, -0.03, -dd / 2 + dd * j / NZ))) for j in range(NZ + 1)] for i in range(NX + 1)]
            up, dn_ = F.N((0, 1, 0)), F.N((0, -1, 0))
            for i in range(NX):
                for j in range(NZ):
                    th.face([T[i][j], T[i + 1][j], T[i + 1][j + 1], T[i][j + 1]], up)
                for j, sg in ((0, -1), (NZ, 1)):
                    th.face([T[i][j], T[i + 1][j], Bm[i + 1][j], Bm[i][j]], F.N((0, 0, sg)))
            for i0 in range(0, NX, 4):
                i1 = min(NX, i0 + 4); th.face([Bm[i0][0], Bm[i1][0], Bm[i1][NZ], Bm[i0][NZ]], dn_)
            for j in range(NZ):
                for i, sg in ((0, -1), (NX, 1)):
                    th.face([T[i][j], T[i][j + 1], Bm[i][j + 1], Bm[i][j]], F.N((sg, 0, 0)))
            th.normals()
            ridge = {}
            for i in range(NX + 1):
                for j in range(NZ + 1): ridge[T[i][j]] = (i % 2, j)
            cols = []
            for vi, (pp, nn) in enumerate(zip(th.v, th.n)):
                rj = ridge.get(vi)
                k = (0.98 if rj[0] else 0.72) if rj else 0.62
                if rj and rj[1] in (0, NZ): k *= 0.85
                c = mix('#8a6a38', '#e0bc74', clamp(nn.z * 0.5 + 0.35))
                cols.append(mul(c, k * (0.9 + 0.2 * vnoise(pp, 7.0, 2))))
            th.c = cols
            put(th, None, 'cover', 'body')
            # the ragged fringes front and back: straw ends hanging in uneven tufts below the cover's edges
            for sgn in (1, -1):
                teeth = []
                n_ = 22
                for k in range(n_ + 1):
                    x = -WC / 2 + WC * k / n_
                    teeth.append((x, -0.05 - (0.09 if k % 2 else 0.03) * (0.7 + 0.6 * abs(math.sin(k * 1.7 + sgn)))))
                fr = PTmp(); zo, zi = sgn * (dd / 2 - 0.005), sgn * (dd / 2 - 0.04)
                nf = F.N((0, 0, sgn)); dn = F.N((0, -1, 0))
                to = [fr.vert(F.W((x, 0.0, zo))) for x, y in teeth]; ti = [fr.vert(F.W((x, 0.0, zi))) for x, y in teeth]
                bo = [fr.vert(F.W((x, y, zo))) for x, y in teeth]; bi = [fr.vert(F.W((x, y, zi))) for x, y in teeth]
                for k in range(n_):
                    fr.face([to[k], to[k + 1], bo[k + 1], bo[k]], nf)            # the outer face
                    fr.face([ti[k], ti[k + 1], bi[k + 1], bi[k]], -nf)           # the inner face
                    fr.face([bo[k], bo[k + 1], bi[k + 1], bi[k]], dn)            # the ragged underside
                for k, sd in ((0, -1), (n_, 1)):
                    fr.face([to[k], bo[k], bi[k], ti[k]], F.N((sd, 0, 0)))
                fr.normals()
                put(fr, lambda p, n: mul(mix('#7e6034', '#d0aa66', clamp(n.z * 0.4 + 0.5 - n.y * 0.15)), 0.74 + 0.3 * (0.5 + 0.5 * math.cos(p.x * 110)) ** 2), 'fringe', 'cloth')
    # two rope ties across the cover
    for x in (-0.45, 0.45):
        put(gtube([(x, cov(0, -0.3) + 0.03, -0.31), (x, cov(0, 0) + 0.035, 0.0), (x, cov(0, 0.3) + 0.03, 0.31)], 0.024, K=5), lambda p, n: mul(mix('#5a4026', '#a07a4a', clamp(n.z * 0.5 + 0.5)), 0.85 + 0.2 * (0.5 + 0.5 * math.cos(p.y * 140))), 'ties', 'body')
    # six strings of hoshigaki hung from the pole
    for i in range(6):
        x = -W / 2 + 0.2 + i * (W - 0.4) / 5
        n = 5 + (1 if i in (1, 4) else 0) - (1 if i == 3 else 0)
        y_end = H - 0.1 - (n - 1) * 0.12 - 0.07
        put(gtube([(x, H + 0.02, 0.0), (x + 0.004, (H + y_end) / 2, 0.006), (x, y_end, 0.0)], 0.011, K=4, caps=True),
            rope_col(lambda p, n: p.z * 160), 'cords', 'body')
        put(gloop([(x + 0.045 * math.cos(TAU * k / 6), H + 0.005, 0.045 * math.sin(TAU * k / 6)) for k in range(6)], 0.014, K=4), rope_col(lambda p, n: p.x * 100), 'cords', 'body')
        for k in range(n):
            y = H - 0.11 - k * 0.12
            ox = (0.012 if k % 2 else -0.012)
            persimmon(F.W((x + ox, y, 0.008 * ((i + k) % 3 - 1))), 0.054, ('#c8642a', '#b0502a', '#d0702e')[(i + k) % 3], rnd, dried=True, K=7)
    # a flat bamboo tray of fresh persimmons waiting under the rack, leaves round the posts
    with at((0.32, 0.0, 0.28), ry=0.4):
        put(glathe([(0.0, 0.0), (0.2, 0.0), (0.24, 0.05), (0.225, 0.055), (0.18, 0.018), (0.0, 0.018)], 14),
            lambda p, n: mul(mix('#a88a50', '#e6cc8a', clamp(n.z * 0.5 + 0.5)), 0.86 + 0.16 * (0.5 + 0.5 * math.cos(math.atan2(p.y - F.m.translation.y, p.x - F.m.translation.x) * 30))), 'tray', 'body')
        rr = random.Random(9)
        for k, (x, z) in enumerate([(-0.07, 0.03), (0.07, 0.04), (0.0, -0.08), (0.1, -0.06)]):
            persimmon(F.W((x, 0.018 + 0.046, z)), 0.054, '#ec7a2a', rr)
    for k, (x, z) in enumerate([(-0.85, 0.2), (0.9, -0.2)]):
        grass((x, 0.0, z), seed=600 + k)
    leaf_rain(9, -1.0, 1.0, -0.5, 0.75, rnd, size=(0.13, 0.17), avoid=lambda x, z: abs(z) < 0.35 and abs(x) < 0.7 and False)
    return dict()

# ================================================================== 6. the sake table (kit sakeTable: 1.0 x 0.6 top at 0.355)
def build_sakeTable():
    new_asset(); rnd = random.Random(91)
    TW = '#7a5440'
    # the low table: a thick top with rounded edges, four chunky legs with an apron
    put(rbox((1.0, 0.6, 0.07), r=0.025, M=F.m @ lm((0, 0.32, 0))),
        lambda p, n: mul(mix(mul(TW, 0.74), mix(TW, '#c08a64', 0.32), clamp(n.z * 0.7 + 0.25)), 0.92 + 0.1 * math.sin(p.x * 34 + 2 * math.sin(p.y * 9))), 'table', 'body')
    for sx in (-1, 1):
        for sz in (-1, 1):
            put(beam(0.07, 0.29, 0.07, (sx * 0.41, 0.145, sz * 0.23), c=0.016), wood('#4e3628', ao_z=0.0, seed=sx + sz), 'legs', 'body')
        put(beam(0.04, 0.05, 0.4, (sx * 0.41, 0.26, 0.0), c=0.01), wood('#4e3628'), 'legs', 'body')
    for sz in (-1, 1):
        put(beam(0.78, 0.05, 0.04, (0, 0.26, sz * 0.23), c=0.01), wood('#4e3628'), 'legs', 'body')
    TY = 0.355
    # the tokkuri: a white bottle with an indigo band and a straw cord at its neck
    with at((-0.2, TY, 0.05)):
        Mi_y = F.W((0, 0, 0)).z
        put(glathe([(0.0, 0.0), (0.066, 0.004), (0.088, 0.07), (0.076, 0.13), (0.04, 0.18), (0.026, 0.205), (0.034, 0.24), (0.026, 0.25), (0.0, 0.245)], 12),
            lambda p, n, y0=Mi_y: (mix('#2e4a8a', '#4e6eb8', clamp(n.z * 0.4 + 0.5 - n.y * 0.2)) if 0.095 < p.z - y0 < 0.125 else mix('#d8cfc0', '#fbf6ec', clamp(n.z * 0.5 + 0.45 - n.y * 0.15))),
            'tokkuri', 'body')
        put(gloop([(0.03 * math.cos(TAU * k / 6), 0.2, 0.03 * math.sin(TAU * k / 6)) for k in range(6)], 0.012, K=4), rope_col(lambda p, n: p.x * 200), 'tokkuri', 'body')
    # a red lacquer tray (oshiki) with three janome cups of sake
    with at((0.17, TY, -0.02), ry=0.12):
        put(rbox((0.38, 0.3, 0.025), r=0.01, M=F.m @ lm((0, 0.0125, 0))), lac('#b8342a', '#e86a50', '#7a2018'), 'tray', 'body')
        for sx in (-1, 1):
            put(box(0.38, 0.03, 0.02, (0, 0.035, sx * 0.14), r=0.0), lac('#b8342a', '#e86a50', '#7a2018'), 'tray', 'body')
            put(box(0.02, 0.03, 0.3, (sx * 0.18, 0.035, 0), r=0.0), lac('#b8342a', '#e86a50', '#7a2018'), 'tray', 'body')
        for k, (x, z) in enumerate([(-0.08, 0.05), (0.08, 0.06), (0.0, -0.07)]):
            with at((x, 0.025, z)):
                y0 = F.W((0, 0, 0)).z; c0 = F.W((0, 0, 0))
                put(glathe([(0.0, 0.0), (0.03, 0.0), (0.034, 0.008), (0.05, 0.05), (0.044, 0.052), (0.038, 0.044), (0.0, 0.04)], 10),
                    lambda p, n, c0=c0: (mix('#2e4a8a', '#4e6eb8', 0.5) if (n.z > 0.5 and 0.012 < math.hypot(p.x - c0.x, p.y - c0.y) < 0.024 and p.z - c0.z > 0.03) else mix('#d8cfc0', '#fbf6ec', clamp(n.z * 0.5 + 0.45))),
                    'cups', 'body')
                put(cyl(0.036, 0.036, 0.004, (0, 0.045, 0), K=10), flat('#ece0b4'), 'sake', 'body')
    # a little dish of fresh persimmons at the table's far corner
    with at((0.32, TY, 0.2)):
        put(glathe([(0.0, 0.0), (0.06, 0.0), (0.1, 0.03), (0.092, 0.034), (0.05, 0.012), (0.0, 0.012)], 10), lambda p, n: mix('#9a8a70', '#e8dcc4', clamp(n.z * 0.5 + 0.5)), 'dish', 'body')
        rr = random.Random(4)
        persimmon(F.W((-0.03, 0.012 + 0.044, 0.0)), 0.05, '#ec7a2a', rr); persimmon(F.W((0.04, 0.012 + 0.044, 0.02)), 0.048, '#f08a34', rr)
    # two zabuton: a woven straw one on the visitor's side, a red one behind; puffy, a tuft button in the middle
    for sz, colr in ((1, 'straw'), (-1, 'red')):
        with at((0.02 * sz, 0.0, sz * 0.62), ry=0.08 * sz):
            prof = [(0.0, 0.0), (0.3, 0.0), (0.33, 0.035), (0.31, 0.065), (0.22, 0.08), (0.0, 0.082)]
            zb = lathe(prof, 16, e=4.0, th0=PI / 16, rfn=lambda r_, z, th: r_ * 0.84)
            zb.xform(F.m @ lm((0, 0, 0)))
            if colr == 'straw':
                f = lambda p, n: mul(mix('#a88448', '#e6c47e', clamp(n.z * 0.6 + 0.35)), 0.86 + 0.16 * (0.5 + 0.5 * math.cos(p.x * 70) * math.cos(p.y * 70)))
            else:
                f = lambda p, n: mix('#8a2a2c', '#d85a54', clamp(n.z * 0.6 + 0.3))
            put(zb, f, 'zabuton', 'cloth')
            put(sph(0.03, (0, 0.082, 0), sc=(1, 0.5, 1), K=6, J=3), flat('#e8c460' if colr == 'red' else '#b8483e'), 'zabuton', 'cloth')
            for e in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
                put(sph(0.022, (e[0] * 0.235, 0.05, e[1] * 0.235), K=5, J=2), flat('#e8c460' if colr == 'red' else '#b8483e'), 'zabuton', 'cloth')
    # a few momiji blown onto the table and round it
    leaf_rain(10, -0.75, 0.75, -0.95, 0.95, rnd, size=(0.12, 0.16), avoid=lambda x, z: math.hypot(x + 0.2, z - 0.05) < 0.12)
    return dict()

# ================================================================== run
PIECES = {'hokora': (build_hokora, 7, 0.01),
          'rootTangle-v0': (lambda: build_rootTangle(0), 31, 0.006), 'rootTangle-v1': (lambda: build_rootTangle(1), 37, 0.006),
          'fallenBranch-v0': (lambda: build_fallenBranch(0), 41, 0.005), 'fallenBranch-v1': (lambda: build_fallenBranch(1), 43, 0.005),
          'stump': (build_stump, 47, 0.006), 'hoshigakiRack': (build_hoshigakiRack, 53, 0.006), 'sakeTable': (build_sakeTable, 59, 0.003)}
names = list(PIECES) if PIECE == 'all' else [n for p in PIECE.split(',') for n in PIECES if n == p or n.startswith(p + '-')]
for name in names:
    fn, sd, amt = PIECES[name]
    info = fn()
    finish(A, seed=sd, amt=amt)
    ray_ao(weights={'leaf': 0.4})
    export_piece('dg-maple-' + name, info)
print('DGB done')
