# PAWHAVEN: the Ice Cavern's own set pieces (task dg-onsen), built in Blender by script.
#   blender --background --factory-startup --python build_dg-onsen.py -- --piece snowHokora|frozenBarrels|...|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up; each piece sits in its kit piece's own local frame (src/dungeon/zoneKits/onsen.js
# KIT_PIECES): the same origin, facing (the kit's +z, the room side, is Blender -Y), ground level and size.
# Layout code is written in the kit's game frame (x, y up, z front) and mapped to Blender (x, -z, y).
# Kits: base_kit.py + rg_kit.py + dg_common.py (copied from dg-bamboo: buckets, painters, ray AO, export, the hokora
# gable roof and kitsune) and snow_kit.py (the onsen props' snow icing, pillows, icicles, oke, logs).
# Materials (the game sorts meshes into the kit piece's buckets by name): body, glow, cloth, water.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
for _f in ('dg_common.py', 'snow_kit.py'):
    _p = os.path.join(HERE, _f)
    exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))

# stone_paint's "moss" patches become painted snow lying on the up faces (kitsune plinths, the hokora's stones)
MOSS_LO, MOSS, MOSS_HI = '#b4c4e2', '#d4def0', '#eef3fb'
WD = '#8a6448'; WD_DK = '#5a4034'; WD_LT = '#c8996a'
SLATE = ('#4e586e', '#6e7a94', '#2c3244')

def roof_snow_col(p, n):
    """roof snow: the snow paint a shade deeper with a cool lavender in the shallows, so the white mass models"""
    c = SNOW(p, n)
    c = mix(c, '#aebde0', clamp(0.75 - n.z) * 0.55)
    return mul(c, 0.94 + 0.07 * vnoise(p, 5.0, 11))

def cstone(base=CSTONE, seed=0, snow=0.0, up=0.5):
    return stone_paint(base, hi='#c8d0de', lo='#4e5668', seed=seed, moss=snow, moss_up=up)

# ================================================================== 1. the snow hokora (kit snowHokora: 1.5 x 1.2 plinth, h 1.75)
def build_snowHokora():
    new_asset()
    # ---------------- the plinth: two dressed courses, snow on the top and banked on the ledge; a front step
    put(rbox((1.5, 1.2, 0.26), r=0.06, M=F.m @ lm((0, 0.11, 0))), cstone('#8c94a6', seed=31, snow=0.35, up=0.6), 'plinth', 'stone')
    put(rbox((1.3, 1.02, 0.1), r=0.035, M=F.m @ lm((0, 0.27, -0.04))), cstone('#9aa2b4', seed=32), 'plinth', 'stone')
    snow_cap(0.66, 0.52, 0.32, seed=3, cover=0.97, drips=5, dlen=(0.06, 0.12), th=0.05, rho=0.03, n=40, tag='plinthSnow')
    put(rbox((1.0, 0.34, 0.12), r=0.035, M=F.m @ lm((0.0, 0.06, 0.77), ry=0.03)), cstone('#8a92a4', seed=191, snow=0.3, up=0.7), 'step', 'stone')
    pillow((-0.36, 0.115, 0.78), 0.13, 0.32, 5, 1.3, 0.8, K=9, J=4, tag='stepSnow', fine=False)
    for k, (x, z, sx_) in enumerate([(-0.66, 0.0, 0.7), (0.68, -0.25, 0.7), (0.3, -0.58, 1.3), (-0.42, -0.58, 1.2)]):
        pillow((x, 0.24, z), 0.13, 0.42, 20 + k, sx_, 1.0 / sx_ + 0.2, K=9, J=4, tag='ledgeSnow', fine=False)
    # ---------------- the shrine box (kit B.at([0, 0.32, -0.05]))
    Y0 = 0.32
    with at((0, Y0, -0.05)):
        def wallc(p, n):
            c = mix(mul(WD, 0.8), mix(WD, '#c89a78', 0.3), clamp(n.z * 0.5 + 0.5))
            c = mul(c, 0.9 + 0.12 * vnoise(Vector((p.x * 6, p.y * 6, p.z * 0.8)), 1.0, 3))
            g = clamp(1 - (p.z - Y0) / 0.22 + (vnoise(p, 4, 9) - 0.5) * 0.6)
            return mix(c, '#aab6d0', g * 0.45)                    # frost creeping up from the snow
        put(box(0.8, 0.8, 0.64, (0, 0.42, 0), r=0.03), wallc, 'shrine', 'body')
        for px_ in (-1, 1):
            for pz_ in (-1, 1):
                put(beam(0.09, 0.86, 0.09, (px_ * 0.42, 0.43, pz_ * 0.34), c=0.022), wood(WD_DK, ao_z=Y0, seed=px_ + pz_ + 3), 'shrine', 'body')
        put(beam(0.98, 0.09, 0.11, (0, 0.05, 0.36), c=0.022), wood(WD_DK), 'shrine', 'body')
        put(beam(1.0, 0.11, 0.12, (0, 0.8, 0.36), c=0.026), wood(WD_DK), 'shrine', 'body')
        for sxd in (-1, 1):       # the lattice doors: a dark recess, a light kumiko grid
            put(box(0.37, 0.64, 0.04, (sxd * 0.19, 0.42, 0.33), r=0.012), lambda p, n: mix('#33241f', '#4e382e', clamp(n.z + 0.3)), 'doors', 'body')
            put(box(0.37, 0.034, 0.03, (sxd * 0.19, 0.115, 0.355), r=0.0), soft('#d8b484', 0.2), 'doors', 'body')
            put(box(0.37, 0.034, 0.03, (sxd * 0.19, 0.725, 0.355), r=0.0), soft('#d8b484', 0.2), 'doors', 'body')
            for k in range(2):
                put(box(0.35, 0.03, 0.03, (sxd * 0.19, 0.32 + k * 0.2, 0.358), r=0.0), soft('#d8b484', 0.2), 'doors', 'body')
            for xo in (-0.17, 0.0, 0.17):
                put(box(0.034, 0.62, 0.03, (sxd * 0.19 + xo, 0.42, 0.356), r=0.0), soft('#d8b484', 0.2), 'doors', 'body')
        # the slate gable roof under a heavy blanket of snow, a rolled cornice over both eaves, icicles
        R = roof_gable(LX=0.74, DZ=0.62, YE=0.9, YR=1.33, TH=0.085, pal=SLATE)
        gp = [(0.33, 0.8)] + [(-zz, R['top_y'](0.0, zz / R['DZ']) - 0.09) for zz in (-0.33, -0.22, -0.11, 0.0, 0.11, 0.22, 0.33)] + [(-0.33, 0.8)]
        with at((0, 0, 0), ry=PI / 2):
            put(prism(gp, 0.8, -0.4), lambda p, n: mix(mul(WD_DK, 0.75), WD_DK, clamp(n.z * 0.5 + 0.5)), 'shrine', 'body')
        a0, a1 = -R['LX'] + 0.035, R['LX'] - 0.035
        def taper(s): return max(0.0, math.sin(PI * clamp((s - a0) / (a1 - a0)))) ** 0.22
        dfront = [(-0.42, 0.1, 0.14), (-0.05, 0.14, 0.15), (0.36, 0.09, 0.13)]
        dback = [(-0.3, 0.1, 0.14), (0.24, 0.12, 0.14)]
        def lo(s): return -(0.97 + 0.02 * math.sin(s * 7) + sum(dd * math.exp(-((s - c) / w_) ** 2) for c, dd, w_ in dfront)) * taper(s)
        def hi(s): return (0.95 + 0.025 * math.sin(s * 6 + 1) + sum(dd * math.exp(-((s - c) / w_) ** 2) for c, dd, w_ in dback)) * taper(s)
        sp = DG['strip_moss']('roof_snow', R['Sf'], a0, a1, 24, lo, hi, 0.09, DGpaint(roof_snow_col), ncross=10)
        putp(sp, 'roofSnow', 'body')
        # soft heaped pillows along the slopes (the kit's heaped look; they give the white mass its modelling)
        for k, (x, v, r_, sx_) in enumerate([(-0.42, -0.3, 0.2, 1.25), (0.02, -0.36, 0.22, 1.35), (0.44, -0.28, 0.19, 1.2),
                                              (-0.22, 0.34, 0.2, 1.3), (0.26, 0.38, 0.2, 1.25)]):
            y_ = R['top_y'](x, v) + 0.1
            pillow((x, y_, -v * R['DZ']), r_, 0.5, 70 + k, sx_, 0.95, rx=(0.5 if v < 0 else -0.5), K=16, J=6, tag='roofPillows', fine=False, col=roof_snow_col)
        # the ridge: a dark cap roll, its turned-up ends poking out of a snow roll along the top
        LXr = R['LX'] + 0.03
        rg = DG['Beam'](lambda s_: F.W(((s_ * 2 - 1) * LXr, R['top_y']((s_ * 2 - 1) * R['LX'], 0.0) + 0.035 + 0.07 * abs(s_ * 2 - 1) ** 4, 0.0)),
                        Vector((0, 0, 1)), lambda s_: 0.055, lambda s_: 0.05, e=0.7, cap=0.05)
        putp(rg.build('ridge', 'roof', DG['lacquer_painter']('#4a5468', '#2a3040', '#6e7a94', spec='#a8b4cc', sheen=0.3), K=8, step=0.12, capn=2), 'ridge', 'body')
        rs = [(x, R['top_y'](x, 0.0) + 0.1 + 0.012 * math.sin(x * 9), 0.01 * math.sin(x * 5)) for x in (-0.56, -0.38, -0.19, 0.0, 0.19, 0.38, 0.56)]
        put(gtube(rs, lambda u: 0.07 * (0.55 + 0.45 * math.sin(PI * u) ** 0.4), K=8), SNOW, 'ridgeSnow', 'body')
        # icicles hanging from the front eave (and a few at the back)
        rng = random.Random(41)
        for k in range(10):
            x = -0.62 + k * 0.138 + rng.uniform(-0.03, 0.03)
            if k in (3, 7): continue
            ye = R['top_y'](x, -1.0) - 0.085
            icicle(x, ye, R['DZ'] - 0.02, 0.07 + 0.13 * rng.random() ** 1.5)
        for x in (-0.4, 0.05, 0.45):
            icicle(x, R['top_y'](x, 1.0) - 0.085, -R['DZ'] + 0.02, 0.06 + 0.07 * rng.random())
        # the shimenawa under the eave with three shide, the suzu bell on its red-and-white cord
        ry_ = 0.74; fz = 0.42
        spts = [F.W((-0.46 + 0.92 * k / 10, ry_ - 0.07 * math.sin(PI * k / 10), fz + 0.01 * math.sin(PI * k / 10))) for k in range(11)]
        put(tube(spts, lambda s: 0.03 + 0.016 * math.sin(PI * s), K=6), rope_col(lambda p, n: p.x * 60 + math.atan2(n.z, -n.y) * 2), 'shimenawa', 'body')
        for k, x in enumerate((-0.25, 0.0, 0.25)):
            tt = (x + 0.46) / 0.92
            top = F.W((x, ry_ - 0.07 * math.sin(PI * tt) - 0.035, fz + 0.03))
            shide_tabs(top, F.N((0, 0, 1)), scale=0.58, tag='shide')
        for x in (-0.36, 0.36):                                    # snow lying along the rope
            tt = (x + 0.46) / 0.92
            put(sph(0.045, (x, ry_ - 0.07 * math.sin(PI * tt) + 0.032, fz + 0.01), sc=(1.9, 0.6, 1.0), K=7, J=3), SNOW, 'ropeSnow', 'body')
        put(sph(0.07, (0.0, 0.83, 0.45), K=8, J=5), lac('#f0bc4a', '#ffe08a', '#b0802a'), 'bell', 'body')
        put(box(0.03, 0.03, 0.03, (0.0, 0.79, 0.5), r=0.0), flat('#5a4020'), 'bell', 'body')
        cord = [(0.0, 0.77, 0.47), (0.012, 0.6, 0.49), (0.02, 0.42, 0.5), (0.03, 0.26, 0.51)]
        put(gtube(cord, 0.02, K=5), lambda p, n: mix('#b8302a', '#f06450', clamp(n.z * 0.4 + 0.5)) if (int((p.z * 18)) % 2) else mix('#e8dcd0', '#fff6ea', clamp(n.z * 0.4 + 0.5)), 'bell', 'body')
        put(glathe([(0.0, 0.0), (0.035, 0.02), (0.045, 0.09), (0.0, 0.12)], 6, pos=(0.032, 0.17, 0.515)), lambda p, n: mix('#b8302a', '#f06450', clamp(n.z * 0.5 + 0.5)), 'bell', 'body')
    # ---------------- the offering box (kit [0, 0.42, 0.57]) on the plinth's front edge, snow heaped on its lid
    with at((0, Y0, 0.56)):
        put(box(0.46, 0.22, 0.26, (0, 0.11, 0), r=0.025), wood('#7a5640', ao_z=Y0, seed=5), 'offering', 'body')
        for k in range(4): put(box(0.42, 0.024, 0.034, (0, 0.23, -0.08 + k * 0.053), r=0.0), soft('#4a3228', 0.2), 'offering', 'body')
        put(box(0.5, 0.04, 0.3, (0, 0.215, 0), r=0.012), wood('#8e6648'), 'offering', 'body')
        snow_cap(0.25, 0.15, 0.235, seed=7, cover=0.78, drips=3, dlen=(0.05, 0.09), th=0.07, rho=0.015, n=24, tag='offerSnow', icicles=2, ilen=(0.04, 0.07))
    # ---------------- two candle stands of dark wood; their flames carry the kit's light (0, 0.9, 0.55)
    for sxc in (-1, 1):
        with at((sxc * 0.36, Y0, 0.5)):
            put(cyl(0.05, 0.065, 0.05, (0, 0.025, 0), K=7), wood(WD_DK), 'candles', 'body')
            put(gtube([(0, 0.02, 0), (0, 0.4, 0)], 0.03, K=6), wood('#6a4a38'), 'candles', 'body')
            put(glathe([(0.0, 0.38), (0.07, 0.38), (0.08, 0.415), (0.066, 0.43), (0.0, 0.43)], 7), soft('#4a3c3a', 0.3), 'candles', 'body')
            put(cyl(0.04, 0.043, 0.1, (0, 0.48, 0), K=7), lambda p, n: mix('#f2e6d0', '#fff6ea', clamp(n.z)), 'candles', 'body')
            put(glathe([(0.0, 0.53), (0.03, 0.55), (0.028, 0.585), (0.0, 0.64)], 6), lambda p, n: '#ffe2a0', 'flame', 'glow', uv=lambda p: (0.7, 0.0))
    # ---------------- the two round stone foxes in red bibs with snow caps (kit [+-0.95, 0, 0.5], turned in)
    for sx in (-1, 1):
        with at((sx * 0.96, 0, 0.5), ry=-sx * 0.3, s=0.95):
            kitsune(sx)
            snow_cap(0.2, 0.2, 0.33, seed=60 + sx, cover=0.62, drips=3, dlen=(0.06, 0.12), th=0.05, rho=0.03, n=22, tag='foxSnow')
            pillow((0.0, 0.855, 0.01), 0.1, 0.48, 61 + sx, 1.15, 1.0, K=9, J=4, tag='foxSnow', fine=False)
            pillow((sx * 0.2, 0.68, -0.03), 0.05, 0.6, 63 + sx, K=7, J=3, tag='foxSnow', fine=False)
    # ---------------- snow drifted round the plinth, a few ice chips, pebbles
    for k, (x, z, r_, h_, sx_, ry_) in enumerate([(-0.8, -0.5, 0.36, 0.16, 1.2, 0.3), (0.78, -0.42, 0.32, 0.15, 1.1, -0.4), (-0.62, 0.72, 0.2, 0.08, 1.2, 0.1),
                                                   (0.46, 0.78, 0.18, 0.07, 1.3, -0.2), (0.05, -0.72, 0.3, 0.12, 1.6, 0.0)]):
        drift((x, 0.0, z), r_, h_, seed=200 + k, sx=sx_, sz=1.0 / sx_ + 0.15, ry=ry_)
    for k, (x, z, h, rot, ln) in enumerate([(0.86, 0.12, 0.2, 0.3, (0.3, -0.35)), (0.93, 0.0, 0.13, 1.1, (-0.2, -0.6)), (-0.88, -0.1, 0.16, 0.7, (0.25, 0.45))]):
        ice_crystal((x, 0.0, z), h, 0.045, lean=ln, rot=rot)
    for k, (x, z, r_) in enumerate([(0.62, 0.9, 0.07), (-0.7, 0.92, 0.06)]):
        pebble((x, -0.01, z), r_, sq=0.6, seed=180 + k, col='#8e96a8', tag='pebbles', K=6)
    return dict(light=[0, 0.9, 0.55], flames=[[-0.36, 0.91, 0.5], [0.36, 0.91, 0.5]])

_p = os.path.join(HERE, 'pieces.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))   # (pieces 2-9)

# ================================================================== run
PIECES = {'snowHokora': (build_snowHokora, 7, 0.01), 'frozenBarrels': (build_frozenBarrels, 11, 0.006), 'bathDeck': (build_bathDeck, 13, 0.005),
          'towelRack': (build_towelRack, 17, 0.004), 'snowMonkey': (build_snowMonkey, 19, 0.002),
          'iceSpire-v0': (lambda: build_iceSpire(0), 23, 0.01), 'iceSpire-v1': (lambda: build_iceSpire(1), 29, 0.01),
          'coldBrazier': (build_coldBrazier, 31, 0.004), 'storePile': (build_storePile, 37, 0.006), 'lanternPost': (build_lanternPost, 41, 0.006)}
names = list(PIECES) if PIECE == 'all' else [n for p in PIECE.split(',') for n in PIECES if n == p or n.startswith(p + '-')]
for name in names:
    fn, sd, amt = PIECES[name]
    info = fn()
    finish(A, seed=sd, amt=amt)
    ray_ao(weights={'leaf': 0.4})
    export_piece('dg-onsen-' + name, info)
print('DGO done')
