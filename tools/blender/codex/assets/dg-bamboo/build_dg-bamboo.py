# PAWHAVEN: the Bamboo Cave's own set pieces (task dg-bamboo), built in Blender by script.
#   blender --background --factory-startup --python build_dg-bamboo.py -- --piece hokora|culmStack|...|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up; each piece sits in its kit piece's own local frame (src/dungeon/zoneKits/bamboo.js
# KIT_PIECES): the same origin, facing (the kit's +z, the visitor / room side, is Blender -Y), ground level and size.
# Layout code is written in the kit's game frame (x, y up, z front) and mapped to Blender (x, -z, y).
# Kits (reused from finished pieces): base_kit.py + rg_kit.py (the gates' boulders, moss icing, beams) and dg_common.py
# (rg-bamboo's buckets, painters, ray AO, export, the hokora gable roof and kitsune).
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
_c = os.path.join(HERE, 'dg_common.py')
exec(compile(open(_c, encoding='utf-8').read(), _c, 'exec'))

# ================================================================== the cave palette (sRGB): the grove's, a shade darker
HST = '#aaa2a8'                                            # the hokora's dressed stone (kit '#aaa4a8')
ROCK = dict(lo='#4a5244', mid='#6e7864', hi='#a0a68c', warm='#bcb490')   # the cave's grey-green rock (kit '#868a7c'..'#b8b8a6')
MK = dict(lo='#5e5a58', mid='#8a8580', hi='#bab2a6', warm='#d0bc9a')     # the marker stones (kit '#aaa6a0')
CMOSS = dict(lo='#34582a', mid='#4e7e36', hi='#7aa44e')     # (one step deeper than the grove's: the cave light lifts tops)    # cave moss (kit '#557e3e' / '#8ab05a')
CULM = ['#6cbf4a', '#7ccb56', '#5eb244', '#4f9a44', '#8cc456']
DRY = ['#c2b46c', '#b0a862', '#ccbc7a', '#a8ae62']

def CMP(seed): return DG['moss_painter'](lo=CMOSS['lo'], mid=CMOSS['mid'], hi=CMOSS['hi'], seed=seed)
def cmoss_col(seed): return moss_col(seed, lo='#3a622c', mid='#548436', hi='#80aa52')
def moss_blob(pos, r, h, seed=0, lobes=5, K=16, tag='mossdrift', amp=0.11):
    """a moss cushion (dg_common's, in the cave moss)"""
    put(dome(F.W(pos), r, h, lobes=lobes, K=K, seed=seed, amp=amp), cmoss_col(seed), tag, 'stone')

# ================================================================== bamboo culms, leaves, splinters
def culm(a, b, r, col='#7cc456', node='#4a8034', step=0.38, K=8, cut0=True, cut1=True, tag='culm', mat='body',
         rim='#eee2ae', hollow='#7c6c40', seed=0, bulge=1.1, taper=1.0, broken1=0.0, cap1=None):
    """a bamboo culm a -> b (game-local): node rings as crisp bulges with a dark band and a pale waxy band under them;
    cut ends show a pale rim round a dark hollow; broken1 > 0 jags the b end into a splintered break"""
    A_, B_ = F.W(a), F.W(b); D = B_ - A_; L = D.length; d = D.normalized()
    rnd = random.Random(seed * 17 + 3)
    nn = max(1, round(L / step))
    knots = []
    us, rk = [0.012 if cut0 else 0.0], [1.0]
    for k in range(1, nn):
        u = L * k / nn + rnd.uniform(-0.04, 0.04) * L / nn; knots.append(u)
        e = min(0.03, L / nn * 0.12)
        us += [u - e, u, u + e]; rk += [1.0, bulge, 1.0]
    us.append(L - (0.012 if cut1 else 0.0)); rk.append(1.0)
    up = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
    W = d.cross(up).normalized(); U = W.cross(d).normalized()
    def ring(c, rr, jag=None):
        out = []
        for k in range(K):
            a_ = TAU * k / K
            q = c + W * (rr * math.cos(a_)) + U * (rr * math.sin(a_))
            if jag is not None: q = q + d * jag(k)
            out.append(q)
        return out
    rad = lambda u: r * (1 - (1 - taper) * u / L)
    rings, cs = [], []
    pole0 = pole1 = None
    if cut0:
        rings += [ring(A_ + d * 0.05, r * 0.66), ring(A_, r * 0.66), ring(A_, r * 0.9)]; cs += [A_ + d * 0.05, A_, A_]
        pole0 = A_ + d * 0.05
    else:
        pole0 = A_ - d * r * 0.8
    for u, k in zip(us, rk):
        rings.append(ring(A_ + d * u, rad(u) * k)); cs.append(A_ + d * u)
    jags = None
    if broken1 > 0:
        jags = [broken1 * (0.5 + 0.5 * math.sin(k * 2.7 + seed)) * (1.0 if k % 2 else 0.45) for k in range(K)]
        rings.append(ring(B_, rad(L) * 0.92, jag=lambda k: jags[k])); cs.append(B_)
        rings.append(ring(B_ - d * 0.01, rad(L) * 0.62, jag=lambda k: jags[k] * 0.7)); cs.append(B_)
        pole1 = B_ - d * 0.05
    elif cut1:
        rings += [ring(B_, rad(L) * 0.9), ring(B_, rad(L) * 0.66), ring(B_ - d * 0.05, rad(L) * 0.66)]; cs += [B_, B_, B_ - d * 0.05]
        pole1 = B_ - d * 0.05
    else:
        pole1 = B_ + d * rad(L) * 0.8 if cap1 is None else cap1
    t = Tmp(); ring_surface(t, rings, cs, pole0, pole1)
    hi = mix(col, '#eef4c0', 0.32)
    def f(p, n):
        q = p - A_; u = q.dot(d); rr = (q - d * u).length
        if cut0 and u < 0.006: return hollow if rr < r * 0.72 else rim
        if cut1 and u > L - 0.006: return hollow if rr < rad(L) * 0.72 else rim
        if broken1 > 0 and u > L - 0.06 and rr < rad(L) * 0.8: return hollow if rr < rad(L) * 0.3 else '#d8ca8e'
        c = mix(mul(col, 0.74), hi, clamp(n.z * 0.42 + 0.5 - n.y * 0.12))
        if knots:
            dk = min(knots, key=lambda kk: abs(u - kk)); dd = u - dk
            if abs(dd) < 0.016: c = mix(c, node, 0.72)
            elif -0.07 < dd < -0.016: c = mix(c, '#e8f0d4', 0.28)
        c = mul(c, 0.95 + 0.08 * vnoise(Vector((u * 1.6, rr * 9, 0.3)), 2.0, seed))
        return c
    put(t, f, tag, mat)
    return A_, B_, d, L, knots

def leaf_card(base, dirv, Ln, w, droop, c0, c1, tag='leaf', mat='leaf', up=None, curl=0.0, n=4):
    """a chunky lanceolate bamboo leaf (Blender coords): a folded blade, double-faced, pointed both ends"""
    up = up or Vector((0, 0, 1))
    d = dirv.normalized(); side = d.cross(up)
    if side.length < 1e-6: side = Vector((1, 0, 0))
    side.normalize(); nrm = side.cross(d).normalized()
    if nrm.z < 0: nrm = -nrm
    t = PTmp(); top, und = [], []
    for i in range(n + 1):
        s = i / n
        c = base + d * (Ln * s) - up * (droop * Ln * s * s)
        wv = w * math.sin(PI * min(1.0, s ** 0.75)) if 0 < i < n else 0.0
        if i == 0: wv = w * 0.18
        fold = nrm * (wv * 0.3) + up * (curl * wv)
        row = [c - side * wv + up * (curl * wv * 0.6), c + fold, c + side * wv + up * (curl * wv * 0.6)]
        top.append([t.vert(q) for q in row]); und.append([t.vert(q - nrm * 0.014) for q in row])
    for i in range(n):
        for k in range(2):
            t.face([top[i][k], top[i][k + 1], top[i + 1][k + 1], top[i + 1][k]], nrm)
            t.face([und[i][k], und[i][k + 1], und[i + 1][k + 1], und[i + 1][k]], -nrm)
    # (close the rim so the two faces read as one chunky leaf)
    for i in range(n):
        for k in (0, 2):
            q = [top[i][k], top[i + 1][k], und[i + 1][k], und[i][k]]
            t.face(q, (side if k == 2 else -side))
    t.normals()
    b0 = base.copy()
    put(t, lambda p, nn, b0=b0: mix(c0, c1, clamp((p - b0).length / Ln * 0.8 + clamp(nn.z) * 0.25)), tag, mat)

def leaf_spray(tip, out, rnd, n=5, size=1.0, pal=None, tag='leaves', droop=0.55):
    """a spray of bamboo leaves fanning from a twig tip (Blender coords), drooping outward"""
    pal = pal or [('#4e9a3c', '#9cd060'), ('#5aa644', '#aad86a'), ('#468c38', '#8cc456')]
    out = Vector((out.x, out.y, 0)).normalized() if Vector((out.x, out.y, 0)).length > 1e-6 else Vector((1, 0, 0))
    for k in range(n):
        a = (k - (n - 1) / 2) * 0.55 + rnd.uniform(-0.15, 0.15)
        dh = Matrix.Rotation(a, 3, 'Z') @ out
        dv = Vector((dh.x, dh.y, rnd.uniform(0.05, 0.4))).normalized()
        c0, c1 = pal[k % len(pal)]
        leaf_card(tip + Vector((0, 0, rnd.uniform(-0.03, 0.03))), dv, 0.3 * size * rnd.uniform(0.85, 1.15), 0.055 * size, droop, c0, c1, tag=tag)

def splinter(base, dirv, Ln, r=0.02, col='#dccf92', tag='splinters', mat='body'):
    d = dirv.normalized()
    t = tube([base, base + d * Ln * 0.5, base + d * Ln], lambda s: r * (1 - s * 0.85), K=3, caps=True)
    put(t, lambda p, n: mix(mul(col, 0.8), col, clamp(n.z * 0.5 + 0.5)), tag, mat)

def mushroom(pos, h, r, cap='#e8a070', tag='mushrooms'):
    """a little round toadstool (game-local pos on a surface)"""
    put(glathe([(0.0, 0.0), (r * 0.42, 0.0), (r * 0.36, h * 0.7), (0.0, h * 0.72)], 6, pos=pos), lambda p, n: mix('#d8c8b0', '#fff2dc', clamp(n.z * 0.5 + 0.5)), tag, 'body')
    put(glathe([(0.0, h * 0.55), (r, h * 0.62), (r * 0.94, h * 0.82), (r * 0.6, h * 0.98), (0.0, h * 1.02)], 8, pos=pos),
        lambda p, n: mix(mul(cap, 0.7), mix(cap, '#ffe0c0', 0.25), clamp(n.z * 0.8 + 0.2)), tag, 'body')

def boulder(name, x, z, hc, ax, az, hup, seed, pal=ROCK, moss=None, mseed=0, tag='rock', **kw):
    """a DG boulder + its moss icing (game-local), put into the stone bucket"""
    b = DG['Boulder'](name, x, z, hc, ax, az, hup, seed=seed, moss=moss, **kw)
    sp = b.build(DG['stone_painter'](pal['lo'], pal['mid'], pal['hi'], warm=pal['warm'], seed=seed))
    out = [sp]
    if moss:
        m = DG['boulder_moss'](b, CMP(mseed or seed), stone=sp)
        putp(sp, tag, 'stone'); putp(m, tag + 'Moss', 'stone')
        if getattr(m, 'tufts', None) is not None: putp(m.tufts, tag + 'Tufts', 'leaf')
    else:
        putp(sp, tag, 'stone')
    return b

def surface_hit(o_from, dirv, mats=('stone', 'body')):
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

# ================================================================== 1. the hokora (kit hokora: 1.5 x 1.2 plinth, h 1.7)
def build_hokora():
    new_asset()
    # ---------------- the plinth: a two-course dressed stone base, mossy on top, and a front step
    put(rbox((1.5, 1.2, 0.26), r=0.06, M=F.m @ lm((0, 0.11, 0))), stone_paint(HST, seed=31, moss=0.5, moss_up=0.45), 'plinth', 'stone')
    put(rbox((1.3, 1.02, 0.1), r=0.035, M=F.m @ lm((0, 0.27, -0.04))), stone_paint('#b8b0b4', seed=32, moss=0.4, moss_up=0.5), 'plinth', 'stone')
    flagstone(1.0, 0.34, 0.12, (0.0, 0, 0.77), ry=0.03, base='#b0a8ae', moss=0.45, seed=191, bottom=-0.06)
    # ---------------- the shrine box (kit B.at([0, 0.32, -0.05]))
    Y0 = 0.32
    with at((0, Y0, -0.05)):
        WB = '#8e664e'
        def wallc(p, n):
            c = mix(mul(WB, 0.8), mix(WB, '#c89a78', 0.3), clamp(n.z * 0.5 + 0.5))
            c = mul(c, 0.9 + 0.12 * vnoise(Vector((p.x * 6, p.y * 6, p.z * 0.8)), 1.0, 3))
            g = clamp(1 - (p.z - Y0) / 0.28 + (vnoise(p, 4, 9) - 0.5) * 0.8)
            return mix(c, '#5e8040', g * 0.5)
        put(box(0.8, 0.8, 0.64, (0, 0.42, 0), r=0.03), wallc, 'shrine', 'body')
        for px_ in (-1, 1):
            for pz_ in (-1, 1):
                put(beam(0.09, 0.86, 0.09, (px_ * 0.42, 0.43, pz_ * 0.34), c=0.022), wood(WOOD_DK, ao_z=Y0, seed=px_ + pz_ + 3), 'shrine', 'body')
        put(beam(0.98, 0.09, 0.11, (0, 0.05, 0.36), c=0.022), wood(WOOD_DK), 'shrine', 'body')
        put(beam(1.0, 0.11, 0.12, (0, 0.8, 0.36), c=0.026), wood(WOOD_DK), 'shrine', 'body')
        # the lattice doors: a dark recess, a light kumiko grid (3 x 2 panes per leaf)
        for sxd in (-1, 1):
            put(box(0.37, 0.64, 0.04, (sxd * 0.19, 0.42, 0.33), r=0.012), lambda p, n: mix('#33241f', '#4e382e', clamp(n.z + 0.3)), 'doors', 'body')
            put(box(0.37, 0.034, 0.03, (sxd * 0.19, 0.115, 0.355), r=0.0), soft('#d2b080', 0.2), 'doors', 'body')
            put(box(0.37, 0.034, 0.03, (sxd * 0.19, 0.725, 0.355), r=0.0), soft('#d2b080', 0.2), 'doors', 'body')
            for k in range(2):
                put(box(0.35, 0.03, 0.03, (sxd * 0.19, 0.32 + k * 0.2, 0.358), r=0.0), soft('#d2b080', 0.2), 'doors', 'body')
            for xo in (-0.17, 0.0, 0.17):
                put(box(0.034, 0.62, 0.03, (sxd * 0.19 + xo, 0.42, 0.356), r=0.0), soft('#d2b080', 0.2), 'doors', 'body')
        # the roof, its moss icing, a cushion and a fern
        R = roof_gable(LX=0.72, DZ=0.6, YE=0.9, YR=1.33, TH=0.085)
        gp = [(0.33, 0.8)] + [(-zz, R['top_y'](0.0, zz / R['DZ']) - 0.09) for zz in (-0.33, -0.22, -0.11, 0.0, 0.11, 0.22, 0.33)] + [(-0.33, 0.8)]
        with at((0, 0, 0), ry=PI / 2):
            put(prism(gp, 0.8, -0.4), lambda p, n: mix(mul(WOOD_DK, 0.75), WOOD_DK, clamp(n.z * 0.5 + 0.5)), 'shrine', 'body')
        k_ = R['LX'] / 0.9
        dfront = [(-0.42 * k_, 0.24, 0.16), (-0.05, 0.32, 0.2), (0.38 * k_, 0.22, 0.16)]
        dback = [(-0.32 * k_, 0.26, 0.2), (0.26 * k_, 0.3, 0.2)]
        a0, a1 = -R['LX'] + 0.04, R['LX'] - 0.04
        def taper(s): return math.sqrt(max(0.0, math.sin(PI * clamp((s - a0) / (a1 - a0)))))
        def lo(s): return -(0.2 + 0.03 * math.sin(s * 6) + 0.8 * sum(dd * math.exp(-((s - c) / w_) ** 2) for c, dd, w_ in dfront)) * taper(s) - 0.02
        def hi(s): return (0.24 + 0.04 * math.sin(s * 6 + 1) + 0.8 * sum(dd * math.exp(-((s - c) / w_) ** 2) for c, dd, w_ in dback)) * taper(s) + 0.02
        mp = DG['strip_moss']('roof_moss', R['Sf'], a0, a1, 16, lo, hi, 0.05, CMP(3), ncross=7)
        putp(mp, 'roofmoss', 'stone')
        # the ridge: a rounded dark cap roll along the top, its ends turned up, poking through the moss
        LXr = R['LX'] + 0.03
        rg = DG['Beam'](lambda s_: F.W(((s_ * 2 - 1) * LXr, R['top_y']((s_ * 2 - 1) * R['LX'], 0.0) + 0.035 + 0.07 * abs(s_ * 2 - 1) ** 4, 0.0)),
                        Vector((0, 0, 1)), lambda s_: 0.055, lambda s_: 0.05, e=0.7, cap=0.05)
        putp(rg.build('ridge', 'roof', DG['lacquer_painter']('#4a6660', '#2c403c', '#6e8c84', spec='#a8c4bc', sheen=0.3), K=8, step=0.12, capn=2), 'ridge', 'body')
        x_, v_ = 0.36, -0.16; y_ = R['top_y'](x_, v_)
        moss_blob((x_, y_ + 0.015, -v_ * R['DZ']), 0.1, 0.06, seed=40, lobes=3, K=10, amp=0.06)
        with at((-0.2, R['top_y'](-0.2, 0) + 0.03, 0.0)):
            fern((0, 0, 0), n=4, L=0.4, wdt=0.09, seed=51, tag='roofFern', tilt=0.75)
        # the shimenawa under the eave with three shide, the suzu bell on its red-and-white cord
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
    # ---------------- the offering box (kit [0, 0.42, 0.57]) on the plinth's front edge
    with at((0, Y0, 0.56)):
        put(box(0.46, 0.22, 0.26, (0, 0.11, 0), r=0.025), wood('#7a5640', ao_z=Y0, seed=5), 'offering', 'body')
        for k in range(4): put(box(0.42, 0.024, 0.034, (0, 0.23, -0.08 + k * 0.053), r=0.0), soft('#4a3228', 0.2), 'offering', 'body')
        put(box(0.5, 0.04, 0.3, (0, 0.215, 0), r=0.012), wood('#8e6648'), 'offering', 'body')
    # ---------------- two bamboo candle stands; their flames carry the kit's light (0, 0.9, 0.55)
    for sxc in (-1, 1):
        with at((sxc * 0.36, Y0, 0.5)):
            put(gtube([(0, -0.02, 0), (0, 0.4, 0)], 0.032, K=6), lambda p, n: mix('#6e9a48', '#b8d880', clamp(n.z * 0.5 + 0.4 - n.y * 0.2)), 'candles', 'body')
            put(glathe([(0.0, 0.38), (0.07, 0.38), (0.08, 0.415), (0.066, 0.43), (0.0, 0.43)], 7), soft('#5a4640', 0.3), 'candles', 'body')
            put(cyl(0.04, 0.043, 0.1, (0, 0.48, 0), K=7), lambda p, n: mix('#f2e6d0', '#fff6ea', clamp(n.z)), 'candles', 'body')
            put(glathe([(0.0, 0.53), (0.03, 0.55), (0.028, 0.585), (0.0, 0.64)], 6), lambda p, n: '#ffe2a0', 'flame', 'glow', uv=lambda p: (0.7, 0.0))
    # ---------------- the two round stone foxes in red bibs (kit [+-0.95, 0, 0.5], turned in)
    for sx in (-1, 1):
        with at((sx * 0.96, 0, 0.5), ry=-sx * 0.3, s=0.95):
            kitsune(sx)
    # ---------------- moss cushions at the plinth's corners, grass, a fern at the back, pebbles
    for k, (x, y, z, r_, h_) in enumerate([(-0.74, 0.0, -0.55, 0.24, 0.12), (0.72, 0.0, -0.5, 0.2, 0.1), (-0.62, 0.0, 0.62, 0.16, 0.08),
                                           (0.5, 0.0, 0.66, 0.13, 0.07)]):
        moss_blob((x, y, z), r_, h_, seed=200 + k, lobes=3, K=10, amp=0.07)
    for k, (x, z) in enumerate([(-0.8, -0.2), (0.82, -0.15), (-0.45, 0.72), (0.66, -0.66)]):
        grass((x, 0.0, z), seed=300 + k, tag='grass')
    with at((0.6, 0.02, -0.58)): fern((0, 0, 0), n=5, L=0.48, wdt=0.1, seed=61, tag='fern')
    for k, (x, z, r_) in enumerate([(0.62, 0.86, 0.07), (-0.66, 0.86, 0.06)]):
        pebble((x, -0.01, z), r_, sq=0.6, seed=180 + k, col='#b4aeb0', tag='pebbles', K=6)
    return dict(light=[0, 0.9, 0.55], flames=[[-0.36, 0.91, 0.5], [0.36, 0.91, 0.5]])

# ================================================================== 2. the culm stack (kit culmStack: 1.8 x 0.82 x 0.9)
def build_culmStack():
    new_asset(); rnd = random.Random(7)
    # two rough crossbars on the floor
    for k, x in enumerate((-0.58, 0.6)):
        put(beam(0.13, 0.12, 0.82, (x, 0.06, 0.0), c=0.03, ry=0.04 * (1 - 2 * k)), wood('#7a5a40', ao_z=0.0, seed=k, nz=0.08), 'bars', 'body')
    rows = [(5, 0.0), (4, 1.0), (3, 2.0)]
    r0 = 0.078; pitch = 0.168
    for n, j in rows:
        y = 0.12 + r0 + j * pitch * 0.87
        for i in range(n):
            z = (i - (n - 1) / 2) * pitch + rnd.uniform(-0.01, 0.01)
            rr = r0 + rnd.uniform(-0.006, 0.006)
            Ln = 1.6 + rnd.uniform(-0.08, 0.26); off = rnd.uniform(-0.12, 0.12)
            c = CULM[(i * 3 + int(j) * 2) % len(CULM)]
            culm((-Ln / 2 + off, y, z), (Ln / 2 + off, y + rnd.uniform(-0.006, 0.006), z), rr, col=c, node='#4a8034', step=0.42, K=7,
                 seed=int(j * 10 + i), tag='culms')
    # two straw rope bindings round the pile: the hull of the corner culms (support-function outline)
    top = 0.12 + r0 + 2 * pitch * 0.87
    corners = [(-2 * pitch, 0.12 + r0), (2 * pitch, 0.12 + r0), (pitch, top), (-pitch, top)]
    for x in (-0.3, 0.34):
        pts = []
        for k in range(22):
            a = TAU * k / 22; dz, dy = math.cos(a), math.sin(a)
            cz, cy = max(corners, key=lambda c: c[0] * dz + c[1] * dy)
            R_ = r0 + 0.026
            pts.append((x + 0.008 * math.sin(a * 3), cy + dy * R_, cz + dz * R_))
        put(gloop(pts, 0.024, K=5), rope_col(lambda p, n: p.y * 70 + p.z * 70), 'rope', 'body')
    # a dropped straw rope coil and a few loose leaves on the bar ends
    with at((0.78, 0.0, 0.48)):
        for k in range(3):
            put(gloop([(math.cos(TAU * i / 12) * (0.13 - k * 0.012), 0.025 + k * 0.035, math.sin(TAU * i / 12) * (0.13 - k * 0.012)) for i in range(12)], 0.022, K=5),
                rope_col(lambda p, n: p.x * 80 + p.y * 40), 'coil', 'body')
    for k in range(4):
        a = rnd.uniform(0, TAU)
        b0 = F.W((rnd.uniform(-0.8, 0.8), 0.012, rnd.uniform(0.4, 0.6) * (1 if k % 2 else -1)))
        leaf_card(b0, Vector((math.cos(a), math.sin(a), 0.0)), 0.24, 0.05, -0.12, '#b8a45e', '#d8c47a', tag='litter', mat='leaf', n=3)
    return dict()

# ================================================================== 3. the shoot basket (kit shootBasket: r 0.37, h 0.6)
def takenoko(pos, h, r, tilt=(0.0, 0.0), seed=0, tag='shoots'):
    """a bamboo shoot: a plump cone of overlapping hairy brown sheaths, the tips paling to yellow-green"""
    rnd = random.Random(seed)
    prof = [(0.0, 0.0)]
    tiers = 4
    for k in range(tiers):
        z0 = h * (k / tiers) ** 0.85; z1 = h * ((k + 1) / tiers) ** 0.85
        r_a = r * (1 - (k / tiers) ** 0.9); r_b = r * (1 - ((k + 1) / tiers) ** 0.9)
        prof += [(r_a * 1.04, z0 + 0.004), (r_a * 0.96 + (r_b - r_a) * 0.2, z0 + (z1 - z0) * 0.4), (max(r_b * 1.1, 0.006), z1 - 0.004)]
    prof.append((0.0, h * 1.06))
    with at(pos, rx=tilt[0], rz=tilt[1], ry=rnd.uniform(0, TAU)):
        t = glathe(prof, 8, rfn=lambda rr, z, th: rr * (1 + 0.05 * math.sin(3 * th + z * 30)))
        Mi = F.m.inverted(); hh = h
        def f(p, n):
            lp = Mi @ p; z = lp.z / hh
            c = mix('#7a4e30', '#b4844e', clamp(n.z * 0.4 + 0.5))
            c = mix(c, '#c8a060', clamp((z - 0.4) * 1.6))
            c = mix(c, '#c4d068', smooth(0.62, 0.95, z))
            if vnoise(p, 22.0, seed) > 0.68 and z < 0.75: c = mul(c, 0.72)       # the hairy dark speckle
            return c
        put(t, f, tag, 'body')
        # two fresh sheath points flaring off the tip
        for k in range(2):
            a = TAU * k / 2 + rnd.uniform(-0.4, 0.4)
            put(glathe([(0.0, 0.0), (0.022, 0.0), (0.0, h * 0.26)], 4, pos=(math.cos(a) * r * 0.2, h * 0.8, math.sin(a) * r * 0.2), rx=math.sin(a) * 0.5, rz=-math.cos(a) * 0.5),
                lambda p, n: mix('#a8b858', '#e0e894', clamp(n.z * 0.5 + 0.5)), 'shootTips', 'body')

def build_shootBasket():
    new_asset()
    # the basket: woven bands (horizontal weavers as ridges, vertical stakes as ribs), a thick wrapped rim
    K = 20; HP = 0.26 / 6
    def wob(rr, z, th):
        return rr * (1 + 0.035 * math.cos(10 * th) + (0.035 * math.cos((z - 0.03) * PI / HP) if 0.03 < z < 0.29 else 0.0))
    zs = [0.0, 0.03] + [0.03 + 0.26 * k / 12 for k in range(1, 13)]
    def rad_at(z): return 0.27 + 0.09 * math.sin(PI / 2 * clamp(z / 0.3)) ** 0.8
    outer = [(0.0, 0.0), (0.24, 0.0)] + [(rad_at(z), z) for z in zs[1:]]
    inner = [(rad_at(z) - 0.028, z) for z in (0.29, 0.17, 0.08)] + [(0.2, 0.05), (0.0, 0.05)]
    prof = outer + inner
    t = glathe(prof, K, rfn=wob)
    def bc(p, n):
        z = p.z; th = math.atan2(p.y, p.x); rr = math.hypot(p.x, p.y)
        if rr < rad_at(z) - 0.015 and z > 0.04: return mix('#6e5232', '#8e6c42', clamp(z / 0.3))         # inside: shaded
        weave = 0.5 + 0.5 * math.cos((z - 0.03) * PI / HP) * math.cos(10 * th)
        c = mix('#9a7444', '#e0be7c', 0.25 + 0.6 * weave)
        c = mul(c, 0.82 + 0.2 * clamp(n.z * 0.5 + 0.5 - n.y * 0.15))
        if z < 0.035: c = mul(c, 0.8)
        return c
    put(t, bc, 'basket', 'body')
    rim = [(math.cos(TAU * i / 20) * (rad_at(0.3) - 0.012), 0.3, math.sin(TAU * i / 20) * (rad_at(0.3) - 0.012)) for i in range(20)]
    put(gloop(rim, 0.03, K=6), lambda p, n: mul(mix('#8c6a3e', '#c89c60', 0.5 + 0.5 * math.cos(math.atan2(p.y, p.x) * 20)), 0.86 + 0.18 * clamp(n.z * 0.5 + 0.5)), 'rim', 'body')
    # two rope handles
    for sx in (-1, 1):
        hp = [(sx * 0.33, 0.28, -0.08), (sx * 0.41, 0.33, -0.05), (sx * 0.43, 0.36, 0.0), (sx * 0.41, 0.33, 0.05), (sx * 0.33, 0.28, 0.08)]
        put(gtube(hp, 0.02, K=5), rope_col(lambda p, n: p.z * 90 + p.x * 30), 'handles', 'body')
    # the heap of shoots
    for k, (x, y, z, h, r, tx, tz) in enumerate([(0.0, 0.24, 0.0, 0.34, 0.095, 0.0, 0.08), (0.16, 0.22, 0.05, 0.28, 0.085, 0.1, -0.5),
                                                  (-0.15, 0.22, 0.07, 0.29, 0.085, 0.25, 0.45), (0.05, 0.22, -0.16, 0.27, 0.08, -0.45, -0.15),
                                                  (0.02, 0.23, 0.17, 0.25, 0.08, 0.55, -0.1)]):
        takenoko((x, y, z), h, r, tilt=(tx, tz), seed=10 + k)
    # one shoot leaning against the basket's front, a bamboo leaf on the floor
    takenoko((0.3, 0.0, 0.3), 0.24, 0.08, tilt=(0.3, -0.55), seed=30)
    return dict()

# ================================================================== 4. the marker stone (kit stoneMarker: 0.6 x 0.95)
def ofuda(stone_c, h0, h1, w, seed=0, tag='ofuda'):
    """a paper charm laid on the stone's front face (game +z): cream paper with a red stripe emblem and a red seal
    diamond, conforming to the stone (ray-cast), 1.2 cm proud; three crisp strips (own verts, hard colour edges)"""
    cols = [(-w / 2, -w * 0.16, '#fff2dc'), (-w * 0.16, w * 0.16, '#c8403a'), (w * 0.16, w / 2, '#fff2dc')]
    nz = 6
    for x0, x1, cc in cols:
        t = PTmp(); grid = []
        for j in range(nz + 1):
            y = h0 + (h1 - h0) * j / nz
            row = []
            for x in (x0, x1):
                o = F.W((x, y, 1.5)); hp, hn = surface_hit(o, F.N((0, 0, -1)))
                if hp is None: hp, hn = F.W((x, y, stone_c)), F.N((0, 0, 1))
                row.append(t.vert(hp + hn * 0.012, hn))
            grid.append(row)
        for j in range(nz):
            q = [grid[j][0], grid[j][1], grid[j + 1][1], grid[j + 1][0]]
            t.face(q, F.N((0, 0, 1)))
        put(t, lambda p, n, cc=cc: mul(cc, 0.92 + 0.08 * clamp(n.z + 0.5)), tag, 'cloth')
    # a red seal diamond near the top (on the paper, a touch prouder)
    yc = h1 - (h1 - h0) * 0.16
    o = F.W((0, yc, 1.5)); hp, hn = surface_hit(o, F.N((0, 0, -1)))
    if hp is not None:
        t = PTmp(); c = hp + hn * 0.02
        sd = F.N((1, 0, 0)); upv = hn.cross(sd).normalized()
        if upv.z < 0: upv = -upv
        sd = upv.cross(hn).normalized()
        ids = [t.vert(c + upv * 0.04), t.vert(c + sd * 0.04), t.vert(c - upv * 0.04), t.vert(c - sd * 0.04)]
        t.face(ids, hn)
        put(t, flat('#b8302c'), tag, 'cloth')

def build_stoneMarker(v):
    new_asset()
    if v == 0:      # a tall upright slab, its crown iced in moss, the charm on its face
        b = boulder('marker', 0.0, 0.0, 0.4, 0.28, 0.17, 0.55, seed=21, pal=MK, yaw=0.08, exy=0.55, ez=0.7, lump=0.09, taper=0.14,
                    tilt=(0.04, -0.05), res=0.07, tag='marker', flat=0.35,
                    moss=dict(t=0.045, cover=0.64, drips=4, drop=0.26, nu=28, dw=1.45, dexp=0.6, zmin=0.7, front=0.2, rows=[-2, -1, 0.0, 0.22, 0.45, 0.7],
                              doffs=(-1.0, -0.6, 0.0, 0.6, 1.0)))
        ofuda(0.2, 0.36, 0.68, 0.12, seed=1)
        mounds = [(0.28, 0.12, 0.13, 0.07), (-0.27, 0.05, 0.11, 0.06), (0.06, -0.24, 0.12, 0.06)]
        grs = [(-0.3, 0.16), (0.3, -0.12), (0.12, 0.28)]
        pebs = [(-0.2, 0.3, 0.05)]
    else:           # a squat leaning boulder with a straw rope belt, one shide, the charm under the rope
        b = boulder('marker', 0.0, 0.0, 0.3, 0.33, 0.25, 0.48, seed=33, pal=MK, yaw=-0.15, exy=0.68, ez=0.75, lump=0.11, taper=0.22,
                    tilt=(0.06, 0.12), res=0.07, tag='marker', flat=0.3,
                    moss=dict(t=0.045, cover=0.64, drips=4, drop=0.26, nu=28, dw=1.45, dexp=0.6, zmin=0.6, front=0.2, rows=[-2, -1, 0.0, 0.22, 0.45, 0.7],
                              doffs=(-1.0, -0.6, 0.0, 0.6, 1.0)))
        ofuda(0.26, 0.2, 0.44, 0.115, seed=2)
        # the straw rope belt round the stone at ~0.5 m (ray-cast ring)
        pts = []
        for k in range(20):
            a = TAU * k / 20; yy = 0.5 + 0.03 * math.sin(a + 0.5)
            o = F.W((math.cos(a) * 1.2, yy, math.sin(a) * 1.2)); c = F.W((0, yy, 0))
            hp, hn = surface_hit(o, c - o, mats=('stone',))
            pts.append(hp + hn * 0.028 if hp is not None else c)
        put(tube_loop(pts, lambda s: 0.03, K=6), rope_col(lambda p, n: math.atan2(p.y, p.x) * 22 + p.z * 40), 'rope', 'body')
        for a in (0.95, -1.05):     # two shide hanging off the rope to either side of the charm
            o = F.W((math.sin(a) * 1.2, 0.5, math.cos(a) * 1.2)); hp, hn = surface_hit(o, F.W((0, 0.5, 0)) - o, mats=('stone',))
            if hp is not None:
                shide_tabs(hp + hn * 0.05 + Vector((0, 0, -0.035)), Vector((hn.x, hn.y, 0)), scale=0.66, tag='shide', n=3, span=0.2)
        mounds = [(0.34, -0.05, 0.12, 0.06), (-0.3, 0.16, 0.12, 0.06), (-0.08, -0.3, 0.13, 0.07)]
        grs = [(0.3, 0.22), (-0.36, -0.1), (0.16, -0.3)]
        pebs = [(0.34, 0.26, 0.05), (-0.2, 0.33, 0.04)]
    for k, (x, z, r_, h_) in enumerate(mounds):
        moss_blob((x, 0.0, z), r_, h_, seed=500 + k + v * 10, lobes=3, K=10, amp=0.07)
    for k, (x, z) in enumerate(grs):
        grass((x, 0.0, z), seed=600 + k + v * 10)
    for k, (x, z, r_) in enumerate(pebs):
        pebble((x, -0.01, z), r_, sq=0.6, seed=640 + k + v, col='#a8a49c', tag='pebbles', K=6)
    return dict(v=v)

# ================================================================== 5. the rock pillar (kit rockPillar: ~2 x 2.65 x 2)
def build_rockPillar(v):
    new_asset()
    MS = lambda cover, drips, drop, seed=0: dict(t=0.07, cover=cover, drips=drips, drop=drop, nu=20, rows=[-2, -1, 0.0, 0.3, 0.62], dw=1.3, dexp=0.45, tufts=3 if drips > 5 else 2,
                                                tuft_paint=TUFTP, doffs=(-1.0, -0.75, -0.4, 0.0, 0.4, 0.75, 1.0))
    if v == 0:
        st = [dict(x=0.0, z=0.0, hc=0.52, ax=0.8, az=0.72, hup=0.56, seed=41, yaw=0.3, tilt=(0.0, 0.0), ground=True, lump=0.13, taper=0.18),
              dict(x=0.1, z=-0.07, hc=1.36, ax=0.58, az=0.52, hup=0.44, hdn=0.42, seed=42, yaw=1.1, tilt=(0.14, -0.1), ground=False, lump=0.12, taper=0.15),
              dict(x=-0.04, z=0.04, hc=2.08, ax=0.42, az=0.38, hup=0.44, hdn=0.34, seed=43, yaw=-0.5, tilt=(-0.12, 0.14), ground=False, lump=0.12, taper=0.2)]
        cb, ct, side = (1.02, 0.0, 0.46), (0.5, 2.55, 0.24), 1
    else:
        st = [dict(x=0.0, z=0.0, hc=0.46, ax=0.86, az=0.7, hup=0.5, seed=51, yaw=-0.4, tilt=(0.0, 0.0), ground=True, lump=0.14, taper=0.15),
              dict(x=-0.12, z=0.06, hc=1.26, ax=0.6, az=0.5, hup=0.46, hdn=0.42, seed=52, yaw=0.6, tilt=(-0.1, 0.16), ground=False, lump=0.13, taper=0.15),
              dict(x=0.02, z=-0.05, hc=2.0, ax=0.4, az=0.42, hup=0.48, hdn=0.34, seed=53, yaw=1.6, tilt=(0.16, -0.08), ground=False, lump=0.12, taper=0.22)]
        cb, ct, side = (-1.02, 0.0, 0.42), (-0.52, 2.5, 0.2), -1
    for k, s in enumerate(st):
        s = dict(s); x, z, hc, ax, az, hup, seed = s.pop('x'), s.pop('z'), s.pop('hc'), s.pop('ax'), s.pop('az'), s.pop('hup'), s.pop('seed')
        boulder('stone%d' % k, x, z, hc, ax, az, hup, seed=seed, pal=ROCK, exy=0.8, ez=0.75, res=0.18 if k == 0 else 0.13,
                moss=MS((0.5, 0.52, 0.55)[k], (6, 5, 4)[k], (0.9, 0.8, 0.7)[k]), tag='pillar', **s)
    # the young culm leaning on the middle stone: planted out at the foot, its top in a spray of fresh leaves
    a_, b_ = Vector(cb), Vector(ct)
    A_, B_, d, L, knots = culm(cb, ct, 0.052, col='#7cc456', node='#4a8034', step=0.42, K=7, cut0=False, cut1=False, seed=60 + v, taper=0.8,
                               tag='youngCulm')
    rnd = random.Random(70 + v)
    for k, u in enumerate(knots[-3:-1]):
        q = A_ + d * u
        out = Vector((side * 1.0, -0.6 if k % 2 else 0.4, 0)).normalized()
        tw = q + out * 0.22 + Vector((0, 0, 0.12))
        put(tube([q, (q + tw) / 2 + Vector((0, 0, 0.03)), tw], lambda s: 0.016 * (1 - 0.4 * s), K=4), soft('#6aa448', 0.2), 'twigs', 'body')
        leaf_spray(tw, out, rnd, n=3, size=0.9)
    leaf_spray(B_ + Vector((0, 0, 0.02)), Vector((side * 0.6, -0.8, 0)), rnd, n=3, size=1.05)
    leaf_spray(B_ + Vector((0, 0, 0.02)), Vector((-side * 0.4, 0.9, 0)), rnd, n=2, size=0.85)
    # the foot: moss cushions, ferns, grass, pebbles, a takenoko at the culm's foot
    sgn = side
    for k, (x, z, r_, h_) in enumerate([(-0.8 * sgn, 0.55, 0.22, 0.11), (0.62 * sgn, -0.7, 0.24, 0.12), (-0.55 * sgn, -0.75, 0.2, 0.1)]):
        moss_blob((x, 0.0, z), r_, h_, seed=800 + k + v * 10, lobes=3, K=10, amp=0.07)
    with at((-0.85 * sgn, 0.0, -0.35)): fern((0, 0, 0), n=4, L=0.55, wdt=0.11, seed=81 + v, tag='fern')
    with at((0.45 * sgn, 0.0, 0.85)): fern((0, 0, 0), n=3, L=0.42, wdt=0.09, seed=83 + v, tag='fern')
    for k, (x, z) in enumerate([(0.2 * sgn, 0.88), (-0.6 * sgn, 0.8), (0.9 * sgn, -0.45)]):
        grass((x, 0.0, z), seed=850 + k + v * 10)
    for k, (x, z, r_) in enumerate([(1.12 * sgn, 0.75, 0.08), (-0.25 * sgn, 0.95, 0.07)]):
        pebble((x, -0.01, z), r_, sq=0.6, seed=870 + k + v, col='#9a9c8c', tag='pebbles', K=6)
    takenoko((cb[0] + 0.25 * sgn, 0.0, cb[2] + 0.22), 0.2, 0.065, tilt=(0.15, -0.3 * sgn), seed=90 + v)
    return dict(v=v)

# ================================================================== 6. the root tangle (kit rootTangle: local -z = the wall)
def build_rootTangle(v):
    new_asset(); rnd = random.Random(101 + v * 7)
    SPL = DG['spline']
    def root(ctrl, r0, r1, bark, furrow=(5, 0.12), name='root', tag='roots', nodes=None, rootlets=0):
        P = [(GL(*p), 0.0) for p in ctrl]
        path, _ = SPL(P)
        bm = DG['Beam'](path, Vector((0, 0, 1)), lambda s: r0 + (r1 - r0) * s ** 0.8, lambda s: r0 + (r1 - r0) * s ** 0.8, e=1.0,
                        cap=r1 * 0.9, furrow=furrow)
        if nodes:
            base_hw = bm.hw
            def hw(s, bm=bm, nodes=nodes, base_hw=base_hw):
                v_ = s * bm.len; k = min(abs(v_ - u) for u in nodes)
                return base_hw(s) * (1 + 0.18 * max(0.0, 1 - k / 0.03))
            bm.hw = hw; bm.hh = hw
        part = bm.build(name, 'root', bark, K=10 if r0 > 0.1 else (8 if r0 > 0.06 else 6), step=0.09, capn=1, cap0=False)
        putp(part, tag, 'body')
        if nodes:      # crisp node rings (the build's 9 cm rows would miss a bulge)
            for u in nodes:
                s_ = clamp(u / bm.len); q = path(s_); T = (path(min(1, s_ + 0.01)) - path(max(0, s_ - 0.01))).normalized()
                Wv = T.cross(Vector((0, 0, 1))).normalized(); Uv = Wv.cross(T).normalized(); rr = bm.hw(s_) * 1.02
                ring_pts = [q + Wv * (rr * math.cos(TAU * k / 8)) + Uv * (rr * math.sin(TAU * k / 8)) for k in range(8)]
                put(tube_loop(ring_pts, lambda s__: 0.016, K=4), lambda p, n: mix('#6e5634', '#a08458', clamp(n.z * 0.5 + 0.5)), 'nodes', 'body')
        if rootlets:
            for k in range(rootlets):
                s = 0.25 + 0.6 * (k + rnd.uniform(0.2, 0.8)) / rootlets
                q = path(s); T = (path(min(1, s + 0.01)) - path(max(0, s - 0.01))).normalized()
                sd = T.cross(Vector((0, 0, 1))).normalized() * (1 if k % 2 else -1)
                tip = q + sd * rnd.uniform(0.14, 0.24) + T * 0.08 + Vector((0, 0, -0.05))
                tip.z = max(0.01, tip.z)
                put(tube([q, (q + tip) / 2 + Vector((0, 0, 0.02)), tip], lambda s_: 0.02 * (1 - 0.6 * s_), K=4), soft('#c4ac82', 0.2), 'rootlets', 'body')
        return path, bm
    def bark_p(c0, c1, seed):
        def f(part, p, n, meta):
            a = meta[1] if meta and meta[0] == 'beam' and meta[1] is not None else 0.0
            c = DG['mixc'](c0, c1, clamp(n.z * 0.5 + 0.45))
            c = DG['mulc'](c, 0.7 + 0.38 * (0.5 + 0.5 * math.cos(5 * a + 0.6 * math.sin(p.x * 1.3))))
            c = DG['mulc'](c, 0.94 + 0.1 * DG['vnoise'](p, 3.0, seed))
            if p.z < 0.08: c = DG['mixc'](c, '#3e5a2e', 0.35 * clamp((0.08 - p.z) / 0.08))
            return c
        return f
    def rhiz_p(seed, nodes_of):
        def f(part, p, n, meta):
            vv = meta[2] if meta and meta[0] == 'beam' else 0.0
            c = DG['mixc']('#a08458', '#e2cc98', clamp(n.z * 0.55 + 0.4))
            nd = nodes_of()
            if nd and min(abs(vv - u) for u in nd) < 0.018: c = DG['mixc'](c, '#7a6038', 0.7)
            return DG['mulc'](c, 0.94 + 0.08 * DG['vnoise'](p, 4.0, seed))
        return f
    if v == 0:
        thick = [(-0.2, 0.62, -0.5), (-0.28, 0.52, -0.15), (-0.12, 0.22, 0.3), (0.05, 0.1, 0.85), (0.18, 0.06, 1.4), (0.12, 0.02, 1.8)]
        fork = [(-0.12, 0.24, 0.28), (-0.4, 0.12, 0.6), (-0.7, 0.05, 0.95), (-0.86, 0.02, 1.15)]
        rh = [[(0.45, 0.42, -0.4), (0.5, 0.3, 0.0), (0.62, 0.08, 0.5), (0.8, 0.05, 1.0), (0.78, 0.03, 1.35)],
              [(0.2, 0.36, -0.4), (0.3, 0.2, 0.05), (0.4, 0.06, 0.5), (0.3, 0.05, 0.95)],
              [(-0.6, 0.34, -0.4), (-0.7, 0.2, -0.05), (-0.88, 0.06, 0.35), (-0.95, 0.04, 0.6)]]
        stones = [(0.85, -0.05, 0.16, 0.14, 0.13, 61), (-0.95, 0.1, 0.13, 0.12, 0.11, 62)]
        mush = (-0.15, 0.24)
    else:
        thick = [(0.25, 0.6, -0.5), (0.3, 0.5, -0.12), (0.15, 0.2, 0.35), (-0.1, 0.1, 0.9), (-0.3, 0.06, 1.5), (-0.28, 0.02, 1.95)]
        fork = [(0.15, 0.22, 0.32), (0.5, 0.12, 0.7), (0.78, 0.05, 1.05), (0.9, 0.02, 1.3)]
        rh = [[(-0.5, 0.42, -0.4), (-0.55, 0.28, 0.0), (-0.72, 0.08, 0.45), (-0.85, 0.05, 0.9), (-0.8, 0.03, 1.2)],
              [(-0.1, 0.36, -0.4), (-0.15, 0.2, 0.05), (-0.05, 0.06, 0.55), (0.2, 0.05, 0.9)],
              [(0.65, 0.34, -0.4), (0.75, 0.2, -0.05), (0.95, 0.06, 0.3), (1.0, 0.04, 0.55)],
              [(0.0, 0.5, -0.4), (0.05, 0.4, -0.1)]]
        stones = [(-0.95, 0.0, 0.15, 0.13, 0.12, 71), (0.55, 1.15, 0.12, 0.1, 0.1, 72)]
        mush = (0.18, 0.28)
    # the old tree root: dark furrowed bark, a fork, rootlets
    tpath, tb = root(thick, 0.15, 0.035, bark_p('#4e3c2e', '#8a6a4c', 3 + v), furrow=(5, 0.2), name='thick', tag='treeRoot', rootlets=3)
    root(fork, 0.075, 0.025, bark_p('#56422e', '#8e6e50', 5 + v), furrow=(4, 0.18), name='fork', tag='treeRoot', rootlets=1)
    # pale bamboo rhizomes with node rings and rootlets at the nodes
    for k, ctrl in enumerate(rh):
        holder = {}
        r0 = 0.055 if k < 3 else 0.05
        P = [(GL(*p), 0.0) for p in ctrl]; pth, _ = SPL(P)
        Ln = sum((pth((i + 1) / 100) - pth(i / 100)).length for i in range(100))
        nodes = [Ln * f for f in (0.22, 0.42, 0.62, 0.82)] if Ln > 0.6 else [Ln * 0.5]
        holder['n'] = nodes
        root(ctrl, r0, r0 * 0.6, rhiz_p(11 + k, lambda h=holder: h['n']), furrow=None, name='rhiz%d' % k, tag='rhizomes', nodes=nodes,
             rootlets=2 if Ln > 0.6 else 0)
    # moss cushions along the wall foot and over the root's shoulder, stones, a fern, grass, little mushrooms
    for k, (x, z, r_, h_) in enumerate([(-0.5 * (1 - 2 * v), -0.2, 0.26, 0.13), (0.62 * (1 - 2 * v), -0.15, 0.22, 0.11), (0.0, -0.25, 0.2, 0.1), (0.35 * (1 - 2 * v), 0.55, 0.15, 0.07)]):
        moss_blob((x, 0.0, z), r_, h_, seed=900 + k + v * 10, lobes=3, K=10, amp=0.07)
    for k, (x, z, ax, az, hup, sd) in enumerate(stones):
        boulder('pebble%d' % k, x, z, hup * 0.35, ax, az, hup, seed=sd, pal=ROCK, exy=0.75, ez=0.7, lump=0.08, taper=0.12, res=0.1,
                moss=dict(t=0.04, cover=0.5, drips=3, drop=0.6, nu=16, dw=1.3, dexp=0.45, doffs=(-1.0, -0.6, 0.0, 0.6, 1.0)), tag='stones')
    with at((0.85 * (1 - 2 * v), 0.0, -0.1)): fern((0, 0, 0), n=5, L=0.48, wdt=0.1, seed=95 + v, tag='fern')
    for k, (x, z) in enumerate([(-0.3, 0.0), (0.95, 0.4), (-0.75, 0.55)]):
        grass((x * (1 - 2 * v), 0.0, z), seed=960 + k + v * 10)
    for k, (dx, dz, h, r_) in enumerate([(0.0, 0.0, 0.12, 0.07), (0.1, 0.05, 0.09, 0.055), (-0.06, 0.09, 0.07, 0.045)]):
        q = tpath(mush[1]); top = q + Vector((0, 0, tb.hw(mush[1]) * 0.75))
        gp = (top.x + dx, top.z - 0.02, -top.y + dz)
        mushroom(gp, h, r_, cap=('#e8946a', '#f0b070', '#e8946a')[k])
    return dict(v=v)

# ================================================================== 7. the fallen bamboo (kit fallenBamboo; local -z = the wall)
def build_fallenBamboo():
    new_asset(); rnd = random.Random(131)
    dry = lambda k: DRY[k % len(DRY)]
    # one culm leaning on the wall (its top split), two lying at its foot (one snapped, splinters), dead leaves
    A1, B1, d1, L1, k1 = culm((0.38, 0.072, 0.95), (-0.62, 1.8, -0.3), 0.072, col=dry(0), node='#7a7040', step=0.4, K=8, seed=1,
                               broken1=0.09, tag='leaning')
    A2, B2, d2, L2, k2 = culm((-1.25, 0.075, 0.55), (1.06, 0.075, 0.28), 0.075, col=dry(1), node='#7a7440', step=0.42, K=8, seed=2,
                               broken1=0.12, tag='lying')
    A3, B3, d3, L3, k3 = culm((0.15, 0.064, 1.38), (1.36, 0.064, 0.6), 0.063, col=dry(2), node='#76703e', step=0.4, K=8, seed=3, tag='lying')
    # splinters at the snapped end of the long culm, and a few on the floor
    for k in range(5):
        a = rnd.uniform(-0.6, 0.6)
        base = B2 - d2 * 0.04 + Vector((0, 0, rnd.uniform(-0.04, 0.04))) + d2.cross(Vector((0, 0, 1))).normalized() * rnd.uniform(-0.05, 0.05)
        dv = Matrix.Rotation(a, 3, 'Z') @ d2; dv.z += rnd.uniform(-0.05, 0.15)
        splinter(base, dv, rnd.uniform(0.16, 0.28), r=0.022)
    for k in range(4):
        b0 = F.W((rnd.uniform(-0.6, 1.3), 0.02, rnd.uniform(0.2, 1.3)))
        a = rnd.uniform(0, TAU)
        splinter(b0, Vector((math.cos(a), math.sin(a), 0.02)), rnd.uniform(0.14, 0.24), r=0.02)
    # dry leaves still clinging to a twig near the leaning culm's top
    for k, u in enumerate(k1[-2:]):
        q = A1 + d1 * u; out = Vector((0.9 if k else -0.7, -0.6, 0)).normalized()
        tw = q + out * 0.2 + Vector((0, 0, 0.06))
        put(tube([q, tw], lambda s: 0.016 * (1 - 0.4 * s), K=4), soft('#a89a58', 0.2), 'twigs', 'body')
        leaf_spray(tw, out, rnd, n=3, size=0.85, pal=[('#a08a48', '#d6c27a'), ('#b09a52', '#e0cc88')], droop=0.8)
    # dead leaves drifted on the floor (flat, a little curled)
    pal = [('#a88e4c', '#d2bc74'), ('#9c8448', '#c8b06a'), ('#98a050', '#c4c872'), ('#b89c58', '#e0cc88')]
    for k in range(18):
        x = rnd.uniform(-1.3, 1.45); z = rnd.uniform(0.15, 1.45)
        a = rnd.uniform(0, TAU); c0, c1 = pal[k % 4]
        leaf_card(F.W((x, 0.014 + 0.004 * (k % 3), z)), Vector((math.cos(a), math.sin(a), 0.0)), rnd.uniform(0.2, 0.28), 0.05, -0.1,
                  c0, c1, tag='deadLeaves', mat='leaf', n=3, curl=0.25)
    # moss creeping round the foot of the leaning culm, a grass tuft
    moss_blob((0.55, 0.0, 1.12), 0.16, 0.07, seed=150, lobes=3, K=10, amp=0.07)
    moss_blob((-0.75, 0.0, -0.1), 0.2, 0.09, seed=151, lobes=3, K=10, amp=0.07)
    grass((-0.95, 0.0, 0.05), seed=160); grass((1.15, 0.0, 1.05), seed=161)
    return dict(lean=[[round(A1.x, 3), round(A1.z, 3), round(-A1.y, 3)], [round(B1.x, 3), round(B1.z, 3), round(-B1.y, 3)]])

# ================================================================== run
PIECES = {'hokora': (build_hokora, 7, 0.01), 'culmStack': (build_culmStack, 11, 0.005), 'shootBasket': (build_shootBasket, 13, 0.004),
          'stoneMarker-v0': (lambda: build_stoneMarker(0), 17, 0.005), 'stoneMarker-v1': (lambda: build_stoneMarker(1), 19, 0.005),
          'rockPillar-v0': (lambda: build_rockPillar(0), 23, 0.012), 'rockPillar-v1': (lambda: build_rockPillar(1), 29, 0.012),
          'rootTangle-v0': (lambda: build_rootTangle(0), 31, 0.006), 'rootTangle-v1': (lambda: build_rootTangle(1), 37, 0.006),
          'fallenBamboo': (build_fallenBamboo, 41, 0.006)}
names = list(PIECES) if PIECE == 'all' else [n for p in PIECE.split(',') for n in PIECES if n == p or n.startswith(p + '-')]
for name in names:
    fn, sd, amt = PIECES[name]
    info = fn()
    finish(A, seed=sd, amt=amt)
    ray_ao(weights={'leaf': 0.4})
    export_piece('dg-bamboo-' + name, info)
print('DGB done')
