"""Captain Brineclaw (the Tidepools' siege captain): one more file of the approved Samurai Shell crab.

Blender 4.3:
  blender --background --factory-startup --python build_heikegani_brineclaw.py

Loads the soldier builder (build_heikegani.py) as a library WITHOUT running it, so the soldiers' GLBs are untouched,
overrides its shape constants with the captain's own, and exports public/models/heikegani_brineclaw.glb (+ .blend).
Units: metres at x1.0 (the game scales him x1.8), front = -Y, ground z = 0.

His shape (captains.js `look`: shellW 0.6 / shellD 0.44 / dome 0.27 vs the soldiers' 0.5 / 0.38 / 0.2, lip, 3 legs,
legK 1.9, legL 0.88, clawK 1.5, stalk 2.0):
  - a wider (x1.2), deeper (x1.15), higher (dome x1.3) shell with a thick rolled coral lip all round and a cream edge
  - three stubby, extra-thick legs a side (leg_L1..L3 / leg_R1..R3, ~1.9x as thick, a little shorter)
  - the soldiers' claws at x1.5, on his own axle, held up in front as a shield
  - the stalk eyes on long bent stalks (~2x), standing clear in front of the lip
  - the samurai face (scaled to him) with heavier brows and a stitched scar over his right eye; the crest and mon x1.15
  - the shell's top-back left clear for the game's banner pole
Parts: body (0,0,0), claws (origin = his axle), leg_L1..L3 / leg_R1..R3 (origin = each hip).
"""
import bpy, math, os, sys, json
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SOLDIER = os.path.join(HERE, 'build_heikegani.py')
print('BRINECLAW build pid', os.getpid(), flush=True)

# ------------------------------------------------------------------ the soldier builder, as a library
SRC = open(SOLDIER, encoding='utf-8').read()
assert SRC.rstrip().endswith('main()'), 'soldier script layout changed'
SRC = SRC.rstrip()[:-len('main()')]
S = {'__name__': 'heikegani_soldier', '__file__': SOLDIER}
exec(compile(SRC, SOLDIER, 'exec'), S)
np_, PI, TAU = np, math.pi, 2 * math.pi
lin, nz, sstep, loft, tube, frame, rmat, rot_x, catmull, ellipse, stroke, ccw, inside = (S[k] for k in
    ('lin', 'nz', 'sstep', 'loft', 'tube', 'frame', 'rmat', 'rot_x', 'catmull', 'ellipse', 'stroke', 'ccw', 'inside'))
Acc, Surface, decal, corner_colours = S['Acc'], S['Surface'], S['decal'], S['corner_colours']
def pieces(acc):
    """(V, N, local F, C, tag) per piece of an accumulator"""
    off = 0
    for V, N, F, C, tg in zip(acc.V, acc.N, acc.F, acc.C, acc.tags):
        yield V, N, F - off, C, tg; off += len(V)
# a decal that can be clipped to (or kept out of) a polygon: the scar sits ON the brow where it crosses it
_dsrc = SRC[SRC.index('def decal('):SRC.index('# ================================================================== the samurai face')]
_dsrc = _dsrc.replace('def decal(acc, surf, layers, spacing, offset, tag, dome=None, dome_d=0.02, own_normals=0.0, **proj):',
                      'def decal_clip(acc, surf, layers, spacing, offset, tag, dome=None, dome_d=0.02, own_normals=0.0, clip=None, clip_out=None, **proj):')
_dsrc = _dsrc.replace('    F = F[keep]; FC = FC[keep]\n',
                      '    if clip is not None: keep &= inside(clip, cen)\n    if clip_out is not None: keep &= ~inside(clip_out, cen)\n    if not keep.any(): return\n'
                      '    F = F[keep]; FC = FC[keep]\n', 1)
assert 'clip_out' in _dsrc and 'keep &= inside(clip' in _dsrc
exec(_dsrc, S); decal_clip = S['decal_clip']

PAL = dict(file='heikegani_brineclaw', shell='#ea6440', belly='#f8e6c8', leg='#d8583a', claw='#f4703f', tip='#3a1c1c',
           trim='#ffd257', face='#3a1418', eyew='#fff6e6', crest='#ffc83a', mon='#e8403a', pupil='#3a1418',
           catch='#ffffff', blush='#f29a8c', scar='#f7c3a6')

# the soldier's reference numbers (read before overriding)
SOL = dict(AXLE=S['AXLE'].copy(), ZR=S['ZR'], SH_H=S['SH_H'], SH_A=S['SH_A'], SH_B=S['SH_B'], CUFF=S['CUFF_C'][1].copy())
SOL_TOP = float(S['shell_point'](0.0, 0.0)[2])

# ================================================================== his dimensions
ZR = 0.33                       # rim height (soldier 0.27): his belly shows below a higher rim, his thick legs pass under
SH_H = 0.355                    # dome height (soldier 0.275, x1.3) -> top ~0.71
SH_A, SH_B = 0.468, 0.352       # x1.2 wide, x1.15 deep
AXLE = np.array([0.0, -0.27, 0.535])
CLAW_K = 1.5
CUFF_NEW = np.array([0.47, -0.46, 0.45])   # his cuff centre (+X claw)
CREST_K, FACE_KX, FACE_KZ = 1.15, 1.2, 1.29

# ------------------------------------------------------------------ claws first (built with the soldier's own numbers)
def build_claws_brine(pal):
    acc = Acc()
    for k in (-1, 1):
        a = Acc(); S['claw_pieces'](a, pal, k)
        c0 = SOL['CUFF'] * np.array([k, 1, 1]); c1 = CUFF_NEW * np.array([k, 1, 1])
        for V, N, F, C, tg in pieces(a):
            if tg == 'arm': continue                    # (rebuilt below, rooted on his own axle)
            acc.add((V - c0) * CLAW_K + c1, F, C, N=N, tag=tg, orient=False)
        # the arm: from his axle (buried in the shell, so no gap opens when the claws turn) into the wrist
        root = np.array([k * 0.27, AXLE[1], AXLE[2]])
        V, F, band, colm = tube(np.array([root, (root + c1) / 2 + np.array([0, 0, -0.02]), c1]), [0.068, 0.072, 0.074], 7,
                                cap0='pole', cap1='pole')
        acc.add(V, F, np.tile(lin(pal['claw']) * 0.8, (len(F), 1)), tag='arm')
    acc.transform(lambda V: rot_x(V, S['CLAW_PRE'], AXLE), lambda N: rot_x(N, S['CLAW_PRE'], np.zeros(3)))
    return acc

# ------------------------------------------------------------------ crest + mon (the soldier's, x1.15, on his dome)
def build_crest_brine(acc, pal):
    t = Acc(); S['build_crest'](t, pal); S['build_mon'](t, pal)
    foot0 = np.array([0.0, S['CREST_Y'], SOL_TOP])
    foot1 = np.array([0.0, S['CREST_Y'] + 0.01, TOP - 0.004])
    for V, N, F, C, tg in pieces(t):
        acc.add((V - foot0) * CREST_K + foot1, F, C, N=N, tag=tg, orient=False)

# ------------------------------------------------------------------ now switch the library to his shape
S.update(ZR=ZR, SH_H=SH_H, SH_A=SH_A, SH_B=SH_B, AXLE=AXLE, SH_COLS=34,
         SH_RHO=[0.15, 0.3, 0.45, 0.58, 0.7, 0.8, 0.88, 0.945, 1.0])
TOP = float(S['shell_point'](0.0, 0.0)[2])

def build_shell_brine(acc, pal):
    """the soldier's bell at his size, with a thick rolled coral lip all round and a cream edge under it"""
    shell_point = S['shell_point']; SH_COLS, SH_RHO = S['SH_COLS'], S['SH_RHO']
    T = np.arange(SH_COLS) / SH_COLS * TAU - PI / 2 + PI / SH_COLS
    rows = [shell_point(0.0, 0.0)[None]]
    for r in SH_RHO: rows.append(np.array([shell_point(r, t) for t in T]))
    rim = rows[-1]
    def scaled(sc, dz):
        R = rim.copy(); R[:, 0] *= sc; R[:, 1] *= sc; R[:, 2] = ZR + dz; return R
    rows += [scaled(1.028, 0.012), scaled(1.058, -0.004), scaled(1.062, -0.022),   # the roll: up, out, round ...
             scaled(1.045, -0.036), scaled(1.02, -0.044),                          # ... under (the cream edge) ...
             np.array([[0, 0.0, ZR - 0.044]])]                                   # ... and in (hidden by the belly)
    V, F, band, colm = loft(rows)
    sh, light, cream = lin(pal['shell']), lin('#fff0dc'), lin(pal['belly'])
    def col_red(P):
        h = (P[:, 2] - ZR) / SH_H
        c = sh[None] * (0.86 + 0.14 * sstep(0.0, 0.55, h))[:, None]
        return c + (light - c) * (0.10 * sstep(0.75, 1.0, h))[:, None]
    FC = corner_colours(V, F, col_red)
    nr = len(SH_RHO)
    roll = (band >= nr) & (band < nr + 3)          # rim -> up -> out -> round: the coral roll, a shade deeper
    FC[roll] = corner_colours(V, F, lambda P: sh[None] * (0.8 + 0.12 * sstep(ZR - 0.02, ZR + 0.012, P[:, 2]))[:, None])[roll]
    FC[band >= nr + 3] = cream * 0.97
    acc.add(V, F, FC, tag='shell')
    return V, F

def build_belly_brine(acc, pal):
    A, B, Yc = 0.405, 0.325, -0.01
    cols = 20; T = np.arange(cols) / cols * TAU + PI / cols
    def ring(sc, z):
        out = []
        for t in T:
            c, s = math.cos(t), math.sin(t)
            fx = math.copysign(abs(c) ** (2 / 2.4), c); fy = math.copysign(abs(s) ** (2 / 2.4), s)
            out.append([fx * A * sc, Yc + fy * B * (1.06 if s < 0 else 1.0) * sc, z])
        return np.array(out)
    rows = [np.array([[0, Yc, 0.112]]), ring(0.75, 0.124), ring(0.94, 0.165), ring(1.0, 0.23), ring(0.97, 0.3),
            np.array([[0, Yc, ZR - 0.01]])]
    V, F, band, colm = loft(rows)
    be = lin(pal['belly'])
    acc.add(V, F, corner_colours(V, F, lambda P: be[None] * (0.84 + 0.16 * sstep(0.12, 0.24, P[:, 2]))[:, None]), tag='belly')

# ------------------------------------------------------------------ the face: the soldier's layout, mapped onto his dome
class FaceSurface:
    """design coordinates of the soldier's face -> his dome (x1.2 across, x1.29 up from the rim)"""
    def __init__(self, surf): self.s = surf
    def project(self, pts, **kw):
        P = np.asarray(pts, float).copy()
        P[:, 0] *= FACE_KX; P[:, 1] = ZR + (P[:, 1] - SOL['ZR']) * FACE_KZ
        return self.s.project(P, **kw)
SCAR_PATH = np.array([[-0.143, 0.566], [-0.152, 0.535], [-0.162, 0.503], [-0.172, 0.472]])
def scar_polys():
    main = stroke(catmull(SCAR_PATH, 3), 0.0085, ncap=4)
    ticks = [stroke(np.array([[x - 0.017, z + 0.004], [x + 0.017, z - 0.004]]), 0.0055, ncap=3)
             for x, z in ((-0.147, 0.553), (-0.157, 0.52), (-0.167, 0.489))]
    return [main] + ticks
def brow_decal(acc, surf, brow, F_, k, pal):
    """his brows; the right one (viewer's left) carries the scar across it"""
    kw = dict(dome=0.012, dome_d=0.018, own_normals=0.7)
    if k > 0: return decal(acc, surf, [(brow, F_)], 0.018, 0.004, 'brows', **kw)
    sc = lin(pal['scar'])
    decal_clip(acc, surf, [(p_, sc) for p_ in scar_polys()] + [(brow, F_)], 0.018, 0.004, 'brows', clip=brow, **kw)
    for p_ in scar_polys():   # the rest of the scar on the bare shell
        decal_clip(acc, surf, [(p_, sc)], 0.014, 0.0045 + 0.0005 * (p_ is not scar_polys()[0]), 'scar', dome=0.0015, dome_d=0.005, clip_out=brow)
def build_face_brine(acc, surf, pal):
    src = SRC[SRC.index('def build_face(acc, surf, pal):'):SRC.index('# ================================================================== stalk eyes')]
    src = src.replace('[0, 0.45, 1], [0.02, 0.024, 0.018]', '[0, 0.45, 1], [0.025, 0.03, 0.023]')   # heavier, grizzled brows
    old = "decal(acc, surf, [(brow, F_)], 0.018, 0.004, 'brows', dome=0.012, dome_d=0.018, own_normals=0.7)"
    assert old in src; src = src.replace(old, "brow_decal(acc, surf, brow, F_, k, pal)")
    src = src.replace('def build_face(', 'def _face(')
    S['brow_decal'] = brow_decal
    exec(src, S)
    S['_face'](acc, FaceSurface(surf), pal)

# ------------------------------------------------------------------ stalk eyes on long bent stalks
def build_stalk_eyes_brine(acc, pal, belly_surf):
    W_, P_, C_, sh, bl = lin(pal['eyew']), lin(pal['pupil']), lin(pal['catch']), lin(pal['shell']), lin(pal['blush'])
    R = 0.05
    for k in (-1, 1):
        E = np.array([k * 0.1, -0.468, 0.37])
        # the stalk: out from under the lip, forward, then up in front of it (about twice the soldiers')
        st = catmull(np.array([[k * 0.075, -0.31, 0.235], [k * 0.088, -0.43, 0.262], [k * 0.098, -0.468, 0.32]]), 3)
        V, F, band, colm = tube(st, np.linspace(0.04, 0.034, len(st)), 7, cap0='pole', cap1='pole')
        acc.add(V, F, corner_colours(V, F, lambda P: (sh * 0.86)[None] * (0.9 + 0.1 * sstep(0.25, 0.34, P[:, 2]))[:, None]), tag='stalks')
        look = nz(np.array([k * 0.16, -1.0, 0.42])); u, v, a = frame(look)
        segs = 12; th = [0.0, 0.36, 0.66, 1.05, 1.6, 2.3, PI]; rows = []
        for t in th:
            if t in (0.0, PI): rows.append((E + a * R * math.cos(t))[None]); continue
            ang = np.arange(segs) / segs * TAU
            rows.append(E + a * R * math.cos(t) + R * math.sin(t) * (np.outer(np.cos(ang), u) + np.outer(np.sin(ang), v)))
        V, F, band, colm = loft(rows)
        FC = np.zeros((len(F), 3)); FC[:] = W_; FC[band <= 1] = P_
        acc.add(V, F, FC, tag='stalk_eyes')
        up_ = nz(np.array([0, 0, 1.0]) - a * a[2]); cd = nz(a + 0.36 * up_ - 0.12 * k * np.array([1.0, 0, 0]))
        cu, cv, _ = frame(cd); cc = E + cd * (R + 0.0012)
        ring = cc + 0.012 * (np.outer(np.cos(np.arange(7) / 7 * TAU), cu) + np.outer(np.sin(np.arange(7) / 7 * TAU), cv))
        ring = E + nz(ring - E) * (R + 0.0012)
        Vc = np.vstack([cc[None] + cd * 0.0008, ring]); Fc = np.array([[0, 1 + i, 1 + (i + 1) % 7] for i in range(7)])
        acc.add(Vc, Fc, np.tile(C_, (7, 1)), N=np.tile(cd, (8, 1)), tag='stalk_eyes')
        lid_ax = nz(np.array([0.0, 0.10, 1.0]) @ rmat([0, 1, 0], k * 0.42).T); lu, lv, la = frame(lid_ax)
        RL = R * 1.13; segs = 10; ang = np.arange(segs) / segs * TAU
        rows = [(E + la * RL)[None]]
        for t in (0.5, 0.86):
            rows.append(E + la * RL * math.cos(t) + RL * math.sin(t) * (np.outer(np.cos(ang), lu) + np.outer(np.sin(ang), lv)))
        t = 0.9; rows.append(E + la * R * 0.97 * math.cos(t) + R * 0.97 * math.sin(t) * (np.outer(np.cos(ang), lu) + np.outer(np.sin(ang), lv)))
        rows.append((E + la * R * 0.4)[None])
        V, F, band, colm = loft(rows)
        acc.add(V, F, corner_colours(V, F, lambda P: sh[None] * (0.9 + 0.1 * sstep(E[2] + 0.02, E[2] + 0.05, P[:, 2]))[:, None]), tag='stalk_lids')
        decal(acc, belly_surf, [(ellipse(k * 0.19, 0.235, 0.036, 0.022, 14), bl)], 0.02, 0.0045, 'blush', tilt=math.radians(10), yref=-0.33)

# ------------------------------------------------------------------ legs: three stubby, extra-thick legs a side
S['LEGS'] = [('1', 0.352, -0.158, math.radians(26), 1.0), ('2', 0.385, 0.03, math.radians(-2), 0.96),
             ('3', 0.352, 0.212, math.radians(-36), 1.0)]
S['HIP_Z'] = 0.13
S['LEG_SIDES'] = 9
S['LEG_RINGS'] = [  # (reach r, z, radius, kind): the femur runs low under the lip, the knee bulges out past it
    (-0.03, 0.118, 0.074, 0), (0.035, 0.128, 0.088, 0), (0.09, 0.14, 0.092, 0), (0.135, 0.15, 0.07, 1),
    (0.18, 0.165, 0.096, 0), (0.222, 0.162, 0.09, 0), (0.252, 0.13, 0.066, 1), (0.268, 0.094, 0.08, 0),
    (0.274, 0.064, 0.072, 2), (0.277, 0.042, 0.058, 2)]

# ================================================================== build + export
def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = S['make_material']()
    claws = build_claws_brine(PAL)        # (uses the soldier's claw numbers internally; placed on his axle)
    body = Acc()
    SV, SF = build_shell_brine(body, PAL)
    surf = Surface(SV, SF)
    bel = Acc(); build_belly_brine(bel, PAL)
    BV, _, BF = bel.arrays(); belly_surf = Surface(BV, BF)
    for V, N, F, C, tg in pieces(bel): body.add(V, F, C, N=N, tag=tg)
    build_face_brine(body, surf, PAL)
    build_stalk_eyes_brine(body, PAL, belly_surf)
    build_crest_brine(body, PAL)
    objs = {'body': body.to_object('body', mat, np.zeros(3)), 'claws': claws.to_object('claws', mat, AXLE)}
    legs = {}
    for side, tag in ((1, 'L'), (-1, 'R')):
        for spec in S['LEGS']:
            acc, hip = S['build_leg'](PAL, side, spec)
            nm = f'leg_{tag}{spec[0]}'; legs[nm] = (acc, hip); objs[nm] = acc.to_object(nm, mat, hip)
    st = {'variant': 'brineclaw', 'body': body.tris(), 'claws': claws.tris(), 'legs': {k: a.tris() for k, (a, h) in legs.items()},
          'body_parts': body.log, 'claw_parts': claws.log,
          'pivots': {'body': [0, 0, 0], 'claws': AXLE.round(4).tolist(), **{k: np.round(h, 4).tolist() for k, (a, h) in legs.items()}}}
    st['total'] = st['body'] + st['claws'] + sum(st['legs'].values())
    return (body, claws, legs), st

accs, st = build()
out = os.path.join(S['MODELS'], PAL['file'] + '.glb')
S['export'](out); st['glb'] = out
st['checks'] = S['checks'](accs)
print('BUILT', json.dumps(st), flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'heikegani_brineclaw.blend'), compress=True)
with open(os.path.join(HERE, 'build_stats_brineclaw.json'), 'w', encoding='utf-8') as f: json.dump(st, f, indent=2)
