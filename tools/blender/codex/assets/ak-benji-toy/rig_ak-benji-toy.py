"""Benji (ak-benji-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, the game's world-axis contract.

    blender --background --factory-startup --python rig_ak-benji-toy.py

Runs build_ak-benji-toy.py in RIG_MODE (part labels; the lid / cavity / tongue charts in unused atlas space; the approved GLB,
blend and json files are not touched; the build carries the director's phase-1 fixes: the tail's dark cap on its outer tip,
a 3 cm cupped leaf, true-black lash rolls), then adds (on Fuku's rig, tools/blender/codex/assets/tk-fuku-toy):
  - the armature: exactly the hero contract, identity rest orientations, heads at the joints;
  - the upper lids: rigid shells about the game's tilted lid hinge (lidTilt = the eyes' 18.2 deg outward facing) on Tanu's long
    lever (the hinge 0.21 m behind the eye), their rest edge on the top rim just under the lash roll; the lash rolls
    (Benji_lash_L/R) are weighted 100% to lidU_* and ride the lid's edge, so shut (lidClose) the roll lies along the lower rim
    as one thick level lash line; the lid body is the mask's own paint;
  - the lower lids: Tanu's (Kuma's) hugging shell on a long lever, under the rim at the game's neutral -0.10;
  - the mouth: the skin parted along the painted smile between sealed corners, a closed cavity and a tongue; the muzzle's
    lower half, the chin and the under-jaw ride `jaw`, the corners `lip_*`;
  - weights (<= 4 influences, quantized to an exact 255 sum): the shirt on hips / spine / chest, the fur hips following the
    thighs toward the hem, the apron band on hips / spine, the bib on spine / chest, the skirt and pocket on the hips with the
    lower half following the thighs, the apron straps on the chest riding a little with the neck at the shoulders, the sleeves
    on the upper arms blending to the chest at the armhole, the ears ear_ -> earTip_, the tail's root on hips and the rest
    along tail1-4, the leaf rigid on head, the bag rigid on hips + spine, its strap on the chest (its ends blending to the bag);
and saves ak-benji-toy_rig.blend (only Armature modifiers left) and joints-rig.json.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_ak-benji-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_ak-benji-toy.py'), '__name__': 'benji_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_ak-benji-toy.py'), 'exec'), ns)
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MZM = ns['MZM']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
def sm(a, b, x): return float(smooth(a, b, x))

# ---------------------------------------------------------------- bake world transforms, read part labels
base_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
labels = {}
for o in base_objects:
    names = [g.name.removeprefix('_part_') for g in o.vertex_groups]
    labels[o.name] = [names[max(v.groups, key=lambda g: g.weight).group] if v.groups else '' for v in o.data.vertices]
    mw = o.matrix_world.copy()
    for v in o.data.vertices: v.co = mw @ v.co
    o.matrix_world = Matrix.Identity(4)
OBJ = {o.name: o for o in base_objects}
print('OBJECTS', sorted(OBJ), flush=True)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
JA, JL = ns['joint_arms'], ns['joint_legs']
# Benji's painted smile (build paint_face): one arc z = CHIN + (0.167 + 0.033 (x / 0.072)^2) W for |x| <= 0.074 W
MHW = .074 * W
def smile_arc_z(x): return CHIN + (.167 + .033 * (min(abs(x), MHW) / (.072 * W)) ** 2) * W
mouth_y = float(front_hit(0., CHIN + .167 * W)[0])
CORNER_X = .070 * W; corner_z = smile_arc_z(CORNER_X)            # the sealed mouth corners (the arc's ends)
MUZ_FRONT_L = (mouth_y - HY) / W
TAIL_PTS = ns['TAIL_PTS']; catmull = ns['catmull']
TAIL_T = (.30, .52, .72, .88)            # tail1 at the root just outside the hips, tail4 near the tip
P = {'root': (0, -.010, 0), 'hips': (0, .000, .265), 'spine': (0, .000, .355), 'chest': (0, .000, .470), 'neck': (0, .015, .585),
     'head': (0, HY + .030, CHIN + .002),                             # the skull base: the nod pivot at the back of the neck, chin height
     'jaw': (0, mouth_y + .22 * W, corner_z)}                         # the hinge inside the head, 0.22 W behind the mouth
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = (s * CORNER_X, float(front_hit(s * CORNER_X, corner_z)[0]) + .002, corner_z)
    C0, ne, up, tt = ns['ear_info'][s]; R_E = .194 * W
    P['ear_' + tag] = tuple(float(c) for c in C0 - up * .55 * R_E - ne * .020)
    P['earTip_' + tag] = tuple(float(c) for c in C0 + up * .25 * R_E + np.array([s * .012, 0, 0]))
    P['upperarm_' + tag] = tuple(JA[tag]['shoulder']); P['forearm_' + tag] = tuple(JA[tag]['elbow']); P['hand_' + tag] = tuple(JA[tag]['wrist'])
    P['thigh_' + tag] = tuple(JL[tag]['hip']); P['shin_' + tag] = tuple(JL[tag]['knee']); P['foot_' + tag] = tuple(JL[tag]['ankle'])
for i, t in enumerate(TAIL_T):
    P['tail%d' % (i + 1)] = tuple(float(c) for c in catmull(TAIL_PTS, t))

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Benji_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Benji_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Benji_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def front_y(x, z, tag):
    a = ray_y(eye_tree[tag], x, z); b = ray_y(skin_tree, x, z)
    c = [v for v in (a, b) if v is not None]; return min(c) if c else None
def outline_z(X, top):
    a = np.clip(np.abs(X), 0, 1); return EZ + (1 if top else -1) * EHH * (1 - a ** EN) ** (1 / EN)
def skin_dist(x, pivot, phs, tmax=.34):
    """distance from the pivot to the outermost skin crossing along the rays (0, -cos ph, sin ph) in the plane x"""
    phs = np.asarray(phs, float); n = len(phs)
    d = np.stack([np.zeros(n), -np.cos(phs), np.sin(phs)], -1); o = np.array([x, pivot[1], pivot[2]])
    ts = np.linspace(tmax, .02, int(161 * tmax / .34))
    Pp = o + ts[None, :, None] * d[:, None, :]
    ins = (head_sdf(Pp.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(12):
        m = (lo + hi) / 2; inn = head_sdf(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return np.where(ins.any(1), (lo + hi) / 2, tmax)
def eye_dist(x, pivot, phs, tag, tmax=.34):
    """distance from the pivot axis to the outermost eye surface along the rays (0, -cos ph, sin ph) in the plane x"""
    out = []
    for ph in phs:
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * tmax, -d, tmax)
        out.append(tmax - h[3] if h[0] is not None else 0.)
    return np.array(out)
def eye_hits(x, pivot, phs, tag):
    """outermost VISIBLE eye surface (front projection inside the opening) along the hinge rays; nan elsewhere"""
    s_ = 1 if tag == 'L' else -1; out = np.full(len(phs), np.nan)
    for i, ph in enumerate(phs):
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * .40, -d, .40)
        if h[0] is not None and float(ns['eye_s'](s_, h[0].x, h[0].z)[0]) < 1.0: out[i] = .40 - h[3]
    return out
def eye_sd(p, tag):
    loc, nrm, idx, dist = eye_tree[tag].find_nearest(Vector(p), .3)
    if loc is None: return .3
    return dist if (Vector(p) - loc).dot(nrm) >= 0 else -dist

# ---------------------------------------------------------------- tilted lid hinges (HERO_MODELS lidTilt; the Floofy construction)
# The game turns lidU / lidD about (cos t, 0, -/+ sin t) in game axes (L / R) = Blender (cos t, +/- sin t, 0). Each lid is designed
# in its eye's own frame (the head and the eye rotated about the vertical through the eye's surface centre so the eye faces -Y
# and the hinge is X), then rotated back. Benji's eyes face 18.2 deg out (the model's eye_axis): t = 0.318.
LID_TILT = float(os.environ.get('LID_TILT', '.318'))
HEAD_SDF_W = head_sdf; FRONT_HIT_W = front_hit; GRAD_N_W = ns['grad_n']
def Rz(phi):
    c, s_ = math.cos(phi), math.sin(phi); return np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.]])
EYE_FRAME = {}
for tag_, s_ in (('L', 1), ('R', -1)):
    Sc_ = np.array([s_ * EX, float(FRONT_HIT_W(s_ * EX, EZ)[0]), EZ])
    EYE_FRAME[tag_] = {'Sc': Sc_, 's': s_, 'Rw': Rz(s_ * LID_TILT), 'Rl': Rz(-s_ * LID_TILT)}
def hinge(tag): return EYE_FRAME[tag]['Rw'] @ np.array([1., 0, 0])
def to_world(q, tag):
    f_ = EYE_FRAME[tag]; q = np.asarray(q, float); return f_['Sc'] + (q - f_['Sc']) @ f_['Rw'].T
def to_local(p, tag):
    f_ = EYE_FRAME[tag]; p = np.asarray(p, float); return f_['Sc'] + (p - f_['Sc']) @ f_['Rl'].T
print('LID_TILT', LID_TILT, 'hinge L', hinge('L').round(4).tolist(), 'R', hinge('R').round(4).tolist(), flush=True)
HV_W = np.array([v.co[:] for v in head.data.vertices]); TRI_W = [tuple(t.vertices) for t in head.data.loop_triangles]; SKIN_V = np.array(ns['verts'])
def eye_context(tag):
    f_ = EYE_FRAME[tag]; s_ = f_['s']
    sk_t = BVHTree.FromPolygons([Vector(p) for p in to_local(HV_W, tag)], TRI_W)
    eo = OBJ['Benji_eye_' + tag]; EVl = to_local(np.array([list(v.co) for v in eo.data.vertices]), tag)
    ey_t = BVHTree.FromPolygons([Vector(p) for p in EVl], [tuple(p.vertices) for p in eo.data.polygons])
    rimL = to_local(SKIN_V[ns['roll_info'][s_][0]], tag)
    xs, zs = rimL[:, 0], rimL[:, 2]
    EXl = abs(float(xs.max() + xs.min()) / 2); EZl = float(zs.max() + zs.min()) / 2
    EHWl = float(xs.max() - xs.min()) / 2; EHHl = float(zs.max() - zs.min()) / 2
    def eye_xz_l(side, psi, k=1.0):
        ux, uz = ns['eye_unit'](psi); return side * EXl + side * EHWl * k * ux, EZl + EHHl * k * uz
    def eye_s_l(side, x, z):
        X = side * (np.asarray(x) - side * EXl) / EHWl; Z = (np.asarray(z) - EZl) / EHHl
        return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
    def hsdf_l(q):
        q = np.asarray(q, float); return np.asarray(HEAD_SDF_W(to_world(q.reshape(-1, 3), tag))).reshape(q.shape[:-1])
    def front_hit_l(x, z, f=None): return FRONT_HIT_W(x, z, f if f is not None else hsdf_l)
    def grad_n_l(p, f=None): return ns['grad'](f if f is not None else hsdf_l, p)
    return {'front_hit': front_hit_l, 'head_sdf': hsdf_l, 'skin_tree': sk_t, 'eye_tree': ey_t,
            'EX': EXl, 'EZ': EZl, 'EHW': EHWl, 'EHH': EHHl, 'eye_s': eye_s_l, 'eye_xz': eye_xz_l, 'grad_n': grad_n_l,
            'fit': [round(EXl, 4), round(EZl, 4), round(EHWl, 4), round(EHHl, 4)]}
SWAP = {}
def enter(tag):
    ctx = eye_context(tag); g = globals()
    for k in ('front_hit', 'head_sdf', 'skin_tree', 'EX', 'EZ', 'EHW', 'EHH'):
        SWAP[k] = g[k]; g[k] = ctx[k]
    SWAP['eye_tree'] = g['eye_tree']; g['eye_tree'] = {tag: ctx['eye_tree']}
    for k in ('eye_s', 'eye_xz', 'grad_n'):
        SWAP['ns:' + k] = ns[k]; ns[k] = ctx[k]
    print('EYE_FRAME', tag, 'fit EX EZ EHW EHH', ctx['fit'], flush=True)
def leave():
    g = globals()
    for k, v in SWAP.items():
        if k.startswith('ns:'): ns[k[3:]] = v
        else: g[k] = v
    SWAP.clear()
def rot_axis(V, Pv, axis, ang):
    k = np.asarray(axis, float) / np.linalg.norm(axis); d = np.asarray(V, float) - Pv
    c, s_ = math.cos(ang), math.sin(ang)
    return Pv + d * c + np.cross(k, d) * s_ + np.outer(d @ k, k) * (1 - c)
def rot_x(V, Pv, a):
    """rotate about the local X axis through Pv (+a = the closing direction: the front moves down)"""
    V = np.asarray(V, float) - Pv; c, s_ = math.cos(a), math.sin(a)
    return np.stack([V[..., 0], V[..., 1] * c - V[..., 2] * s_, V[..., 1] * s_ + V[..., 2] * c], -1) + Pv

# ---------------------------------------------------------------- the upper lid: a short lever, the lash line rides its edge
# In the eye's frame: the pivot sits on the bisector of the centre column's chord (top rim -> just under the lower rim) where that
# chord subtends exactly the shut angle, so +1.22 carries the rest edge (on the top rim) to just under the lower rim. Per column
# (x slice) the shell is a surface of revolution about the hinge: the lash stripe rows lie on the skin over the painted band at
# rest (+0.4 mm), a short ledge slopes down to the body radius (just outside the circle through the column's rims, so the body is
# under the skin above the band at rest and in front of the eye over the opening when it closes), and the body carries on round
# the hinge far enough to cover the whole opening shut.
LIDU_SHUT = 1.22            # replaced by the lid's own shut angle (HERO_MODELS lidClose) once the left lid is designed
LU_TUCK = float(os.environ.get('LU_TUCK', '.008'))     # the shut edge under the lower rim, so the riding lash roll lies along it
LU = dict(YB=float(os.environ.get('LU_YB', '.21')), GAP=float(os.environ.get('LU_GAP', '.0012')), OFF=.0004,
          LEDGE=float(os.environ.get('LU_LEDGE', '.05')), NCOL=int(os.environ.get('LU_NCOL', '19')))
BODY_SLACK = float(os.environ.get('BODY_SLACK', '.008'))   # Benji: the body may sit this much over the eye's upper part (the bulge below stays covered by the lower lid / the cheek)
LIDU_ROWS_STRIPE = [0, .12, .25, .40, .55, .70, .85, 1.0]                  # stripe rows (edge .. band top), as fractions
LIDU_ROWS_LEDGE = [.25, .5, .75, 1.0]
LIDU_N_TRANS, LIDU_N_ZONE, LIDU_N_FALL = 3, 12, 0                          # in-between rows; the rows over the opening shut
LIDU_X_OUT = [1.08, 1.17, 1.26, 1.35, 1.44]; LIDU_X_IN = [-1.18, -1.08]
LID_CORNER_W = float(os.environ.get('LID_CORNER_W', '.5'))       # columns past the corners (the flicks, the band's ends)
RIB_W = float(os.environ.get('RIB_W', '.008'))                             # the shut "U": a dark lash ribbon where the lid crosses the lower rim
def band_top_Z(X):
    """the lash roll's outer edge in this column (eye units above EZ): sr = 0.965 + lash_th(psi) (build LASH ROLLS); the lid's
    stripe rows lie on the skin under the roll, from the top rim to just past its outer edge"""
    Zb = max(float(outline_z(X, True) - EZ) / EHH, .05)
    for _ in range(8):
        srt = .965 + float(ns['lash_th'](np.array([math.atan2(Zb, abs(X))]))[0]) + .02
        Zb = max(srt ** EN - min(abs(X), srt * .999) ** EN, 1e-6) ** (1 / EN)
    return Zb
LOG_LID = {}
def upper_lid_ride(tag):
    """the upper lid on Tanu's long lever (the hinge 0.21 m behind the eye at its centre of curvature, so the lid hugs the eye):
    its lash stripe lies on the painted band at rest and rides down on the edge (the lash line lowers with the lid at the squint);
    shut, the edge is far under the cheek and the closed "U" is a dark ribbon painted where the lid crosses the lower rim, with a
    light crease line right above it"""
    s = 1 if tag == 'L' else -1; cx = s * EX
    fy = lambda x, z: float(front_hit(np.array([x]), np.array([z]))[0])
    ye = fy(cx, EZ); yp, zp = ye + LU['YB'], EZ + hug_zo(tag); pivot = np.array([cx, yp, zp])
    def angp(y, z): return math.atan2(z - zp, yp - y)
    global LIDU_SHUT
    zt_c, zl_c = float(outline_z(0, True)), float(outline_z(0, False))
    pt_c, pl_c = angp(fy(cx, zt_c), zt_c), angp(fy(cx, zl_c), zl_c)
    r_c = math.hypot(yp - fy(cx, zt_c), zt_c - zp)
    LIDU_SHUT = round((pt_c - .001) - pl_c + LU_TUCK / r_c, 3)          # the centre edge: top rim at rest -> just under the lower rim
    Xs = np.r_[LIDU_X_IN, np.linspace(-1.0, 1.0, LU['NCOL']), LIDU_X_OUT]
    # in-game round 1: the lid carries the whole upper lash (band, corner ends, wing flicks); per column, where the skin's paint has it
    # (the full paint minus the rig's skin paint, sampled on the skin at rest)
    ZS = np.linspace(EZ - .20 * EHH, EZ + 2.2 * EHH, 96); XL = np.repeat(cx + s * EHW * Xs, len(ZS)); ZL = np.tile(ZS, len(Xs))
    YL = front_hit(XL, ZL); PL = to_world(np.stack([XL, YL, ZL], -1), tag); dd = PL - ns['O']; dd /= np.linalg.norm(dd, axis=1, keepdims=True)
    uvl_ = ns['head_uv'](dd)
    ns['PAINT_OPTS'].update(ride=False); Cf = np.asarray(ns['paint_face'](uvl_[:, 0], uvl_[:, 1]))
    ns['PAINT_OPTS'].update(ride=True); Cs = np.asarray(ns['paint_face'](uvl_[:, 0], uvl_[:, 1]))
    LASHCOV = (np.abs(Cf - Cs).max(-1) > .03).reshape(len(Xs), len(ZS))
    cols = []
    for X, cov in zip(Xs, LASHCOV):
        x = cx + s * EHW * X; Xc = float(np.clip(X, -1, 1))
        OPEN = abs(X) <= 1.0001                                          # the columns over the opening, the corners included
        if OPEN: zt, zl = float(outline_z(Xc, True)), float(outline_z(Xc, False))
        else: zt = zl = EZ
        zb = EZ + EHH * band_top_Z(Xc) if OPEN else EZ + .35 * EHH
        zc_ = ZS[cov & (ZS > (zt if OPEN else EZ - .15 * EHH))]
        if len(zc_): zb = max(zb if OPEN else -9, float(zc_.max()) + .0015)      # up over the flicks
        pt, pl, pb = angp(fy(x, zt), zt), angp(fy(x, zl), zl), angp(fy(x, zb), zb)
        pe = pt - .001                                                   # the rest edge just on the top rim
        OUTER_LASH = (not OPEN) and len(zc_) > 0
        if OUTER_LASH:                                                   # past the corners: the stripe lies on the skin over the lash there
            zlo = float(zc_.min()) - .0015; pe = angp(fy(x, zlo), zlo)
        st = np.linspace(pe, pb, len(LIDU_ROWS_STRIPE))
        if OPEN:
            po = np.linspace(pl - .01, pt + .01, 24); de = eye_dist(x, pivot, po, tag); emax = float(de.max())
            r_body = max(math.hypot(yp - fy(x, zt), zt - zp), math.hypot(yp - fy(x, zl), zl - zp), emax) + LU['GAP']
            r_body = min(r_body, max(math.hypot(yp - fy(x, zt), zt - zp), float(eye_dist(x, pivot, np.linspace(pl + .40 * (pt - pl), pt + .01, 16), tag).max())) + LU['GAP'] + BODY_SLACK)
            # Benji: the muzzle's bulge pushes the eye's lower-inner surface forward, so the stripe clears only the eye's upper 60 %
            # (it rides on the skin at rest; it dips into the bulge near the nasal corner only at the end of a blink)
            pu = np.linspace(pl + .40 * (pt - pl), pt + .01, 16); eup = float(eye_dist(x, pivot, pu, tag).max())
            d_st = np.maximum(skin_dist(x, pivot, st) + LU['OFF'], eup + .0008)     # on the band at rest, never inside the eye's upper part
        else:                                                            # past the corners: the body under the skin all through the sweep
            sw = np.linspace(pe - LIDU_SHUT - .1, pb + .3, 60); r_body = float(skin_dist(x, pivot, sw).min()) - .0010
            d_st = skin_dist(x, pivot, st) + LU['OFF'] if OUTER_LASH else np.minimum(skin_dist(x, pivot, st) + LU['OFF'], r_body)
        cols.append(dict(X=X, x=x, pt=pt, pl=pl, pb=pb, pe=pe, st=st, d_st=d_st, r_body=r_body))
    # the shut cover zone in rest angles (the rows over the opening at +1.22), the same for every column
    zone0 = min(c['pl'] for c in cols if abs(c['X']) < 1) + LIDU_SHUT - .05
    zone1 = max(c['pt'] for c in cols if abs(c['X']) < 1) + LIDU_SHUT + .05
    V = []; UVr = []; XR = []; ARC = []; KIND = []
    nr = len(LIDU_ROWS_STRIPE) + len(LIDU_ROWS_LEDGE) + LIDU_N_TRANS + LIDU_N_ZONE
    rib = []
    for i, c in enumerate(cols):
        rows = [(ph, float(c['d_st'][k]), 'stripe') for k, ph in enumerate(c['st'])]
        r0 = float(c['d_st'][-1]); ph0 = c['st'][-1]
        for f in LIDU_ROWS_LEDGE:
            rows.append((ph0 + LU['LEDGE'] * f, r0 + (c['r_body'] - r0) * float(ns['smoother'](0, 1, f)), 'ledge'))
        ph1 = ph0 + LU['LEDGE']; z0 = max(zone0, ph1 + .02 * (LIDU_N_TRANS + 1))
        for k in range(1, LIDU_N_TRANS + 1): rows.append((ph1 + (z0 - ph1) * k / (LIDU_N_TRANS + 1), c['r_body'], 'body'))
        for k in range(LIDU_N_ZONE): rows.append((z0 + (zone1 - z0) * k / (LIDU_N_ZONE - 1), c['r_body'], 'body'))
        arc = 0.; prev = None; arcs = []
        for j, (ph, r, kind) in enumerate(rows):
            if prev is not None: arc += abs(ph - prev[0]) * (r + prev[1]) / 2
            prev = (ph, r); arcs.append(arc)
            V.append((c['x'], yp - r * math.cos(ph), zp + r * math.sin(ph)))
            UVr.append((i / (len(cols) - 1), j / (nr - 1))); XR.append((c['x'], r, ph)); ARC.append(arc); KIND.append(kind)
        phs_ = np.array([r_[0] for r_ in rows])
        rib.append(float(np.interp(c['pl'] + LIDU_SHUT, phs_, arcs)))   # where this column's lid crosses its lower rim, shut
    fs = []
    for i in range(len(cols) - 1):
        for j in range(nr - 1):
            q = i * nr + j; fs.append((q, q + nr, q + nr + 1, q + 1))
    XR = np.array(XR)
    # shading normals: the skin ball's own normal under each vertex at the pose where it shows (stripe: rest; body: shut; ledge:
    # both), carried back into the lid's rest frame, so the lid meets the skin round it without a light / dark patch
    acc = np.zeros((len(XR), 3))
    for a, wk in ((0., {'stripe': 1., 'ledge': .5, 'body': .02}), (LIDU_SHUT, {'stripe': .02, 'ledge': .3, 'body': 1.}),
                  (.15, {'stripe': .3, 'ledge': .4, 'body': .2})):
        pa = XR[:, 2] - a
        Pp = np.stack([XR[:, 0], yp - XR[:, 1] * np.cos(pa), zp + XR[:, 1] * np.sin(pa)], -1)
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        n = ns['grad_n'](Q); n = rot_x(n, np.zeros(3), -a)
        acc += np.array([wk[k_] for k_ in KIND])[:, None] * n
    NRM = acc / np.linalg.norm(acc, axis=1, keepdims=True)
    cc = cols[len(cols) // 2]
    def edge_z(c_, a): return zp + float(c_['d_st'][0]) * math.sin(c_['pe'] - a)
    ztc, zlc = float(outline_z(0, True)), float(outline_z(0, False))
    # the squint: the lid edge down by its stripe + ledge (less 2 mm), so the light crease above the ledge never shows (a modest squint)
    arcs_c = np.array(ARC).reshape(len(cols), nr)[len(cols) // 2]; vis = arcs_c[len(LIDU_ROWS_STRIPE) + len(LIDU_ROWS_LEDGE) - 1] - .002
    sq = round(vis / float(cc['d_st'][0]), 3); sq_cover = round((ztc - edge_z(cc, sq)) / (ztc - zlc), 3)
    shut_ok = [round((zp + c_['r_body'] * math.sin(zone0 - LIDU_SHUT) - float(outline_z(c_['X'], False))) * 1000, 1) for c_ in cols if abs(c_['X']) <= .95]
    LOG_LID[tag] = {'pivot_eye_frame': pivot.round(4).tolist(), 'pivot_behind_eye_m': round(yp - ye, 4), 'lidClose': LIDU_SHUT,
                    'squint_angle': sq, 'squint_cover_centre': sq_cover,
                    'shut_edge_minus_lowrim_mm': [round((zp + float(c_['d_st'][0]) * math.sin(c_['pe'] - LIDU_SHUT) - float(outline_z(c_['X'], False))) * 1000, 1) for c_ in cols if abs(c_['X']) <= .95][::4],
                    'shut_zone_bottom_minus_lowrim_mm': [min(shut_ok), max(shut_ok)], 'r_body_centre_m': round(cc['r_body'], 4),
                    'stripe_excess_mm_centre': round((float(cc['d_st'][-1]) - float(cc['d_st'][0])) * 1000, 1),
                    'shut_ribbon_arc_centre_m': round(rib[len(cols) // 2], 4)}
    print('LIDU', tag, json.dumps(LOG_LID[tag]), flush=True)
    paint = {'XR': XR.reshape(len(cols), nr, 3), 'arc': np.array(ARC).reshape(len(cols), nr),
             'kind': np.array(KIND).reshape(len(cols), nr), 'X': np.array([c_['X'] for c_ in cols]), 'nr': nr, 'yp': yp, 'zp': zp,
             'stripe_arc': np.array([np.array(ARC).reshape(len(cols), nr)[i, len(LIDU_ROWS_STRIPE) - 1] for i in range(len(cols))]),
             'ledge_arc': np.array([np.array(ARC).reshape(len(cols), nr)[i, len(LIDU_ROWS_STRIPE) + len(LIDU_ROWS_LEDGE) - 1] for i in range(len(cols))]),
             'rib_arc': np.array(rib), 'sq': sq}
    return V, UVr, fs, pivot, [tuple(r) for r in NRM], paint


# ---------------------------------------------------------------- the lower lid hugs the eye on a long lever (Tanu's / Kuma's)
LD_T = float(os.environ.get('LD_T', '-.24')); LDH_GAP = .0015; LDH_COV = .30; LDH_ARCH = .14; LDH_OFF = float(os.environ.get('LDH_OFF', '-.0012'))   # Benji: the rows under the rim tuck under the skin (on it they showed as dashes at -0.10)
LD_RAMP, LD_BAND, LD_DIVE = .020, .028, .005; YB = .21
LD_YB = float(os.environ.get('LD_YB', '.21')); LD_ZO = float(os.environ.get('LD_ZO_DEF', '-.02'))   # Fuku: the lower lid's hinge near the eye's height (its eyes face 23 deg up,
                                                                    # so the hug centre sits 8 cm low and the cheek would come in front of the lid)
LDH_ROWS = [0, .04, .09, .15, .22, .30, .38, .46, .54, .62, .70, .78, .86, .93, 1.0]
def hug_zo(tag):
    s = 1 if tag == 'L' else -1; cx = s * EX; ye = float(front_hit(cx, EZ)[0]); yp = ye + YB
    zs_ = np.linspace(EZ - .85 * EHH, EZ + .85 * EHH, 15); best_ = None
    for zo in np.arange(-.080, .006, .002):
        pv = np.array([cx, yp, EZ + zo]); dd = []
        for z_ in zs_:
            y_ = ray_y(eye_tree[tag], cx, z_)
            if y_ is not None: dd.append(math.hypot(pv[1] - y_, z_ - pv[2]))
        sp = max(dd) - min(dd)
        if best_ is None or sp < best_[0]: best_ = (sp, zo)
    return best_[1]
def lower_lid_hug(tag):
    s = 1 if tag == 'L' else -1; cx = s * EX; ye = float(front_hit(cx, EZ)[0]); target = LD_T
    zo = float(os.environ['LD_ZO']) if os.environ.get('LD_ZO') else LD_ZO
    yp, zp = ye + LD_YB, EZ + zo; pivot = np.array([cx, yp, zp])
    def angp(y, z): return math.atan2(z - zp, yp - y)
    Xs = np.linspace(-.97, .97, 23); cols = []
    for X in Xs:
        x = cx + s * EHW * X
        zl = float(outline_z(X, False)); fy = lambda z: float(front_hit(np.array([x]), np.array([z]))[0])
        po = np.arange(angp(fy(zl), zl) - .02, angp(fy(EZ + .3 * EHH), EZ + .3 * EHH), .006); de = eye_hits(x, pivot, po, tag)
        r = (float(np.nanmax(de)) if np.isfinite(de).any() else float(eye_dist(x, pivot, [angp(fy(zl), zl)], tag)[0])) + LDH_GAP
        za = (EZ - EHH) + 2 * EHH * (LDH_COV - LDH_ARCH * X * X)
        za = max(za, zl - .004)
        pe = math.asin(max(-1, min(1, (za - zp) / r)))
        phR = math.asin(max(-1, min(1, (zl - zp) / r)))
        span = (pe - phR) + LD_BAND + LD_DIVE + .05
        phs = pe - np.array(LDH_ROWS) * span
        sk = skin_dist(x, pivot, phs)
        rr = []
        for ph, skn in zip(phs, sk):
            on = float(smooth(phR + LD_RAMP, phR + .002, ph)) * (1 - float(smooth(.80, .97, abs(X))))
            dive = float(smooth(phR - LD_BAND, phR - LD_BAND - LD_DIVE, ph))
            r_top = (1 - on) * r + on * max(r, skn + LDH_OFF)
            rr.append((1 - dive) * r_top + dive * (min(r, skn) - .006))
        cols.append(dict(X=X, x=x, r=r, pe=pe, phR=phR, phs=phs, rr=rr))
    V = []; UVs = []; G = []; XR = []
    for i, c in enumerate(cols):
        g_row = []
        for j, (t, ph, r_) in enumerate(zip(LDH_ROWS, c['phs'], c['rr'])):
            pr = ph + target
            V.append((c['x'], yp - r_ * math.cos(pr), zp + r_ * math.sin(pr))); UVs.append((i / (len(cols) - 1), t))
            g_row.append((c['x'], yp - r_ * math.cos(ph), zp + r_ * math.sin(ph))); XR.append((c['x'], r_, ph))
        G.append(g_row)
    XR = np.array(XR); acc = np.zeros((len(XR), 3))
    for a, wgt in ((target, 8.), (-.10, 1.), ((target - .10) / 2, 1.)):
        pa = XR[:, 2] + (target - a)
        Pp = np.stack([XR[:, 0], yp - XR[:, 1] * np.cos(pa), zp + XR[:, 1] * np.sin(pa)], -1)
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        n = ns['grad_n'](Q); c_, s_ = math.cos(-(target - a)), math.sin(-(target - a))
        acc += wgt * np.stack([n[:, 0], n[:, 1] * c_ - n[:, 2] * s_, n[:, 1] * s_ + n[:, 2] * c_], -1)
    NRM = [tuple(v) for v in acc / np.linalg.norm(acc, axis=1, keepdims=True)]
    nr = len(LDH_ROWS); fs = []
    for i in range(len(cols) - 1):
        for j in range(nr - 1):
            q = i * nr + j; fs.append((q, q + 1, q + nr + 1, q + nr))
    print('LID_LOWER_HUG', tag, 'pivot', pivot.round(4), 'r_centre', round(cols[len(cols) // 2]['r'], 4), flush=True)
    return V, UVs, fs, pivot, NRM, {'G': np.array(G), 'rows': np.array(LDH_ROWS), 'X': np.array([c['X'] for c in cols])}

lid_info = {}; lid_objects = []; LID_PAINT = {}
def make_lid(tag, upper):
    if upper:
        V, UVs, fs, pivot, NRM, paint = upper_lid_ride(tag)
    else:
        V, UVs, fs, pivot, NRM, paint = lower_lid_hug(tag)
        paint['G'] = to_world(np.asarray(paint['G']).reshape(-1, 3), tag).reshape(np.asarray(paint['G']).shape)
    chart = 'lidU' if upper else 'lidD'
    if tag == 'L': paint['frame'] = 'L'; LID_PAINT[chart] = paint            # the left lids paint the shared charts (mirror)
    name = ('Benji_lidU_' if upper else 'Benji_lidD_') + tag
    Rw_ = EYE_FRAME[tag]['Rw']; pivot_l = np.array(pivot)
    V = to_world(np.array(V), tag).tolist(); NRM = (np.array(NRM) @ Rw_.T).tolist(); pivot = to_world(pivot_l, tag)
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], fs); me.update()
    layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, *UVs[me.loops[l].vertex_index])
    bm = bmesh.new(); bm.from_mesh(me); hk = hinge(tag)
    for f in bm.faces:        # outward = away from the hinge axis
        c = np.array(f.calc_center_median()) - pivot; rv = c - hk * (c @ hk)
        if np.dot(np.array(f.normal), rv) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([tuple(NRM[me.loops[l].vertex_index]) for l in range(len(me.loops))])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    lid_objects.append((ob, ('lidU_' if upper else 'lidD_') + tag))
    lid_info[name] = {'pivot': [float(v) for v in pivot], 'pivot_eye_frame': [float(v) for v in pivot_l],
                      'hinge_blender': [round(float(v), 5) for v in hinge(tag)]}
    if upper:
        lid_info[name]['kinds'] = list(paint['kind'].ravel())
        # in-game round 1: the corner / flick columns ride the lid half way (linear blend with head): they follow the lid down to the
        # closed eye's outer end and sink into the skin instead of sliding out over the cheek
        cx_ = np.repeat(np.abs(paint['X']), paint['nr']); lid_info[name]['w_lid'] = list(np.where(cx_ > 1.02, LID_CORNER_W, np.where(cx_ > .999, .70, 1.)))   # the corner column 70 %, past it 50 % (Fuku)
    return tuple(float(v) for v in pivot)
for tag in 'LR':
    enter(tag)
    try:
        P['lidU_' + tag] = make_lid(tag, True)
        P['lidD_' + tag] = make_lid(tag, False)
    finally:
        leave()
SQ_U = round(float(np.mean([LOG_LID[t]['squint_angle'] for t in 'LR'])), 2)

# ---------------------------------------------------------------- the lid charts
# upper: the lash stripe (dark, the painted band carried on the lid), then the skin's own paint (band off, blush on) at the shut
# pose, with the shut "U": a dark lash ribbon where the lid crosses the lower rim and a light crease line right above it (clearly
# visible in the dark mask); lower: the skin's paint at its happy pose
CREASE_C = os.environ.get('CREASE_C', '#C9A894'); CREASE_W = float(os.environ.get('CREASE_W', '.011')); CREASE_GAP = float(os.environ.get('CREASE_GAP', '.0012'))
CREASE_SHOW = float(os.environ.get('CREASE_SHOW', '.62')); CREASE_ON = float(os.environ.get('CREASE_ON', '0'))      # the crease shows only once lidU > 0.62 x lidClose
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        if chart == 'lidU':
            XR = info['XR']; nc, nr = XR.shape[0], XR.shape[1]; rows = np.linspace(0, 1, nr)
            G = np.zeros_like(XR)                                         # each vertex where it shows: the stripe at rest, the rest shut
            a_sh = np.where(info['kind'] == 'stripe', 0., LIDU_SHUT)
            pa = XR[..., 2] - a_sh; G[..., 0] = XR[..., 0]; G[..., 1] = info['yp'] - XR[..., 1] * np.cos(pa); G[..., 2] = info['zp'] + XR[..., 1] * np.sin(pa)
            G = to_world(G.reshape(-1, 3), 'L').reshape(G.shape); A = info['arc']
        else:
            G = np.asarray(info['G']); rows = np.asarray(info['rows']); nc = G.shape[0]; A = np.zeros(G.shape[:2])
        fi = U * (nc - 1); i0 = np.clip(np.floor(fi).astype(int), 0, nc - 2); a = fi - i0
        j0 = np.clip(np.searchsorted(rows, Vv, side='right') - 1, 0, len(rows) - 2); b = (Vv - rows[j0]) / (rows[j0 + 1] - rows[j0])
        def bil(F):
            F = np.asarray(F, float); e = (Ellipsis,) + (None,) * (F.ndim - 2)
            return (F[i0, j0] * ((1 - a) * (1 - b))[e] + F[i0 + 1, j0] * (a * (1 - b))[e]
                    + F[i0, j0 + 1] * ((1 - a) * b)[e] + F[i0 + 1, j0 + 1] * (a * b)[e])
        Pp = bil(G).reshape(-1, 3); arc = bil(A)
        d = Pp - ns['O']; d /= np.linalg.norm(d, axis=1, keepdims=True)
        uv = ns['head_uv'](d)
        if chart == 'lidU':   # in-game round 1: the upper lid lives inside the mask: its body is the mask's own paint everywhere (sampling
            # it at the shut pose put the muzzle's cream and the blush on the corner columns, which overshoot onto the cheek)
            ns['PAINT_OPTS'].update(band=False, blush=False, muzzle=False, maskall=True, ride=False)
        else:
            ns['PAINT_OPTS'].update(band=False, blush=True, muzzle=True, ride=False)   # the skin's own paint at its happy pose, blush on
        C = np.asarray(ns['paint_face'](uv[:, 0], uv[:, 1])).reshape(h, w, 3)
        ns['PAINT_OPTS'].update(maskall=False)
        if chart == 'lidU':
            ns['PAINT_OPTS'].update(band=True, blush=True, muzzle=True, ride=False)     # ... and with its upper lash (band, flicks)
            Cl = np.asarray(ns['paint_face'](uv[:, 0], uv[:, 1])).reshape(h, w, 3)
        ns['PAINT_OPTS'].update(band=True, blush=True, muzzle=True, ride=True)
        if chart == 'lidU':
            sa = info['stripe_arc'][i0] * (1 - a) + info['stripe_arc'][i0 + 1] * a     # the stripe rows: the skin's lash, painted at rest
            Xc = info['X'][i0] * (1 - a) + info['X'][i0 + 1] * a
            stripe = 1 - smooth(sa - .0006, sa + .0006, arc)
            C = mix(C, Cl, stripe)
            la = info['ledge_arc'][i0] * (1 - a) + info['ledge_arc'][i0 + 1] * a
            re_ = info['XR'][i0, 0, 1] * (1 - a) + info['XR'][i0 + 1, 0, 1] * a        # the edge's radius: lid travel per radian here
            # in-game round 1: the crease stays under the skin until lidU passes 0.6 of lidClose (and past the stripe and ledge)
            c0 = np.maximum(la + CREASE_GAP, CREASE_SHOW * LIDU_SHUT * re_ + .004)
            dA = arc - (c0 + CREASE_W / 2); tp_ = (1 - smooth(.45, .80, np.abs(Xc)))   # off at the corners (the lid grazes the skin there)
            crease = (1 - smooth(CREASE_W * .40, CREASE_W * .56, np.abs(dA))) * tp_
            C = mix(C, rgb(CREASE_C), crease * CREASE_ON)
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'ak-benji-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- mouth: part the skin along the painted "w", add the cavity
def smile_z(x): return smile_arc_z(x)
CUT = .060 * W                                                       # parted for |x| < CUT; the arc's ends stay sealed
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Benji_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'head_skin' and co.z < smile_z(co.x)) else 'upper'
    key = (tuple(round(float(c), 7) for c in co), tuple(round(float(c), 6) for c in uv), tuple(round(float(c), 4) for c in no), lab, kind)
    if key not in cache:
        cache[key] = len(verts); verts.append(tuple(co)); vlab.append(lab); vkind.append(kind)
    return cache[key]
def emit(recs, kind):
    if len(recs) < 3: return
    for k in range(1, len(recs) - 1):
        rr = [recs[0], recs[k], recs[k + 1]]
        if (rr[1][0] - rr[0][0]).cross(rr[2][0] - rr[0][0]).length < 1e-12: continue
        ids = [addv(r, kind) for r in rr]
        faces.append(ids); fuv.append([tuple(r[1]) for r in rr]); fno.append([tuple(r[2]) for r in rr])
def clip(recs, keep_upper):
    out = []
    for i, a in enumerate(recs):
        b = recs[(i + 1) % len(recs)]; fa = a[0].z - smile_z(a[0].x); fb = b[0].z - smile_z(b[0].x)
        ia = fa >= 0 if keep_upper else fa <= 0; ib = fb >= 0 if keep_upper else fb <= 0
        if ia: out.append(a)
        if ia != ib:
            t = fa / (fa - fb); r = (a[0].lerp(b[0], t), a[1].lerp(b[1], t), a[2].lerp(b[2], t).normalized(), a[3]); out.append(r)
            if keep_upper: seam.append(tuple(r[0]))
    return out
for tr in old.loop_triangles:
    rr = [(old.vertices[old.loops[l].vertex_index].co.copy(), uvl[l].uv.copy(), cn[l].copy(), oldlab[old.loops[l].vertex_index]) for l in tr.loops]
    f = [r[0].z - smile_z(r[0].x) for r in rr]
    skin = rr[0][3] == 'head_skin'
    cut = skin and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')
    else: emit(rr, None)
me = bpy.data.meshes.new('Benji_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Benji_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0016: rim.append(p)
assert len(rim) >= 10, len(rim)
LOG = {'mouth_seam_points': len(rim), **{k: ns['LOG'][k] for k in ('head_refine_before', 'head_refine') if k in ns['LOG']}}

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - CORNER_X) / (.028 * W)) ** 2 - ((z - corner_z) / (.028 * W)) ** 2)
def jaw_w(x, y, z, kind):
    """the lower lip, the muzzle's lower half, the chin and the under-jaw; a smooth falloff into the cheeks (Benji's cream muzzle
    is 0.37 W wide: the jaw takes |x| < 0.16 W fully, fading out by 0.27 W)"""
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - MUZ_FRONT_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.008 * W, .012 * W, z - smile_z(x))
    we = sm(.80 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.16, .27, abs(xl)); back = 1 - sm(.36, .52, b)
    return below * lat * back
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab == 'nose_button': return {'head': 1}
    q = M2L(np.array(p)); zl = q[2]; yl = q[1]
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(.04, -.03, zl) * sm(.05, .25, yl)
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
def arm_t(p, side):
    sh = np.array(JA[side]['shoulder']); wr = np.array(JA[side]['wrist']); d = wr - sh
    return float((np.array(p) - sh) @ d / (d @ d))
def arm_weights(p, side):
    t = arm_t(p, side)
    if t > 1.02: return {'hand_' + side: 1}                                          # the mitten is rigid
    fore = sm(.40, .62, t); hand = sm(.94, 1.02, t)
    return {'upperarm_' + side: (1 - fore), 'forearm_' + side: fore * (1 - hand), 'hand_' + side: fore * hand}
def sleeve_weights(p, side):
    """the short sleeve rides the upper arm, the armhole (inside the shirt) blending to the chest"""
    t = arm_t(p, side)
    chest = .55 * (1 - sm(-.30, .10, t))
    return {'chest': chest, 'upperarm_' + side: 1 - chest}
def thighs(x, share):
    wl = share * sm(-.10, .10, x); return {'thigh_L': wl, 'thigh_R': share - wl}
def torso_w(z):
    hips = 1 - sm(.33, .40, z); chest = sm(.42, .50, z); neck = sm(.585, .625, z)
    return {'hips': hips, 'spine': (1 - hips) * (1 - chest), 'chest': (1 - hips) * chest * (1 - neck), 'neck': (1 - hips) * chest * neck * .7,
            'head': (1 - hips) * chest * neck * .3}
def bell_weights(p):
    """the shirt (hips -> spine -> chest -> neck), the shoulders following the arms a little, the fur hips following the thighs
    toward their hem (~45 % at the hem: the legs come out right under it), the hidden neck top riding the neck and head"""
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    w = torso_w(z)
    arm = .30 * sm(.12, .17, abs(x)) * sm(.43, .49, z) * (1 - sm(.55, .59, z))
    th = .36 * float(np.clip((.30 - z) / .13, 0, 1)) ** 1.2
    out = {k: v * (1 - arm) * (1 - th) for k, v in w.items()}
    out['upperarm_' + side] = arm * (1 - th)
    for k, v in thighs(x, th).items(): out[k] = out.get(k, 0) + v
    return out
def apron_weights(p, lab):
    x, y, z = p
    if lab == 'apron_band': sp = sm(.375, .43, z); return {'hips': .6 - .2 * sp, 'spine': .4 + .2 * sp}
    if lab == 'apron_bib': c = sm(.44, .50, z); return {'spine': 1 - c, 'chest': c}
    if lab.startswith('apron_strap'):
        # on the chest; over the shoulder riding a little with the neck so a nod doesn't push the head through them
        r = sm(.55, .60, z); low = 1 - sm(.41, .47, z)
        return {'spine': .6 * low, 'chest': (1 - .6 * low) * (1 - .25 * r), 'neck': (1 - .6 * low) * .25 * r}
    # the skirt and the pocket ride the hips (from under the band), the lower half following the thighs gently (~32 % at the hem)
    th = .40 * float(np.clip((.36 - z) / .19, 0, 1)) ** 1.1
    out = {'hips': 1 - th}; out.update(thighs(x, th)); return out
LASH_SIDE_W = float(os.environ.get('LASH_SIDE_W', '.40'))
def lash_weights(p, tag):
    """the roll rides lidU fully over the top of the eye; down its sides and on the wing it rides part way (blended with head), so
    shut it lies along the lower rim in the middle and its ends stay at the eye's corners: one soft lash curve, never a hoop
    hanging down the cheek (Fuku's corner columns, the same idea)"""
    s_ = 1 if tag == 'L' else -1; X = s_ * (p[0] - s_ * EX) / EHW; Z = (p[2] - EZ) / EHH
    side = max(sm(.92, 1.06, abs(X)) * sm(.55, .25, Z), sm(.15, -.35, Z))   # the wing and the roll's end down the outer side lag
    w = 1 - (1 - LASH_SIDE_W) * side
    return {'lidU_' + tag: w, 'head': 1 - w} if w < .999 else {'lidU_' + tag: 1.}
BAG_W8 = {'hips': .6, 'spine': .4}                      # the bag rides the hips and spine, rigid
def strap_weights(p):
    """the bag strap on the chest, its ends blending into the bag's weights where they leave the body for the bag"""
    pp = np.array(p); d = min(np.linalg.norm(pp - np.array(ns['_bag_top_f'])), np.linalg.norm(pp - np.array(ns['_bag_top_b'])))
    b = 1 - sm(.03, .12, d); x, y, z = p
    t = torso_w(z); tw = {k: v * (1 - b) for k, v in t.items() if k in ('hips', 'spine', 'chest', 'neck')}
    tw['chest'] = tw.get('chest', 0) + (1 - b) * t.get('head', 0)
    for k, v in BAG_W8.items(): tw[k] = tw.get(k, 0) + b * v
    return tw
def ear_weights(p, s):
    C0, ne, up, tt = ns['ear_info'][s]; R_E = .194 * W; tag = 'L' if s > 0 else 'R'
    h = float((np.array(p) - C0) @ up) / R_E
    tip = sm(-.05, .65, h)
    return {'ear_' + tag: 1 - tip, 'earTip_' + tag: tip}
def leg_weights(p, lab, side):
    x, y, z = p
    if lab.startswith('foot'): return {'foot_' + side: 1}
    hips = .55 * sm(.235, .275, z); shin = 1 - sm(.135, .175, z); foot = 1 - sm(.062, .085, z)
    return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
_TS = np.linspace(0, 1, 401); _TC = np.array([catmull(TAIL_PTS, t) for t in _TS])
T_HIP = .14                                       # the root inside the hips stays on hips; blends into tail1 by tail1's head
def tail_weights(p):
    d = np.linalg.norm(_TC - np.array(p), axis=1); k = int(np.argmin(d)); t = float(_TS[k])
    if k == len(_TS) - 1: t = 1.0
    T = TAIL_T
    if t <= T_HIP: return {'hips': 1}
    if t <= T[0]: f = sm(T_HIP, T[0], t); return {'hips': 1 - f, 'tail1': f}
    if t >= T[3]: return {'tail4': 1}
    for i in range(3):
        if T[i] <= t <= T[i + 1]:
            f = sm(T[i], T[i + 1], t); return {'tail%d' % (i + 1): 1 - f, 'tail%d' % (i + 2): f}

# ---------------------------------------------------------------- the armature
HERO = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'jaw']
for tag in 'LR': HERO += [k + '_' + tag for k in ('eye', 'lidU', 'lidD', 'brow', 'lip', 'ear', 'earTip', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot')]
HERO += ['tail1', 'tail2', 'tail3', 'tail4']
PARENT = {'root': None, 'hips': 'root', 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'jaw': 'head',
          'tail1': 'hips', 'tail2': 'tail1', 'tail3': 'tail2', 'tail4': 'tail3'}
for tag in 'LR':
    PARENT.update({f'eye_{tag}': 'head', f'lidU_{tag}': 'head', f'lidD_{tag}': 'head', f'brow_{tag}': 'head', f'lip_{tag}': 'head',
                   f'ear_{tag}': 'head', f'earTip_{tag}': f'ear_{tag}', f'upperarm_{tag}': 'chest', f'forearm_{tag}': f'upperarm_{tag}',
                   f'hand_{tag}': f'forearm_{tag}', f'thigh_{tag}': 'hips', f'shin_{tag}': f'thigh_{tag}', f'foot_{tag}': f'shin_{tag}'})
assert len(HERO) == 37 and set(HERO) == set(P), set(HERO) ^ set(P)
adata = bpy.data.armatures.new('Benji_game_skeleton'); arm = bpy.data.objects.new('Benji_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'
arm.show_in_front = True

# ---------------------------------------------------------------- the mouth cavity and tongue
def skin_front(x, z):
    y = ray_y(skin_tree, x, z); return y if y is not None else float(front_hit(x, z)[0])
cav_v = []; cav_w = []; cav_f = []; D = 3; n = len(rim)
for level in ('upper', 'lower'):
    for j in range(D + 1):
        t = j / D
        for x, y, z in rim:
            corner = 1 - sm(.74 * CUT, CUT, abs(x))
            pz = z + (.012 * W if level == 'upper' else -.050 * W) * math.sin(t * math.pi * .5) * corner
            py = y + .0015 + .090 * W * t * (.35 + .65 * corner)
            px_ = x * (1 - .06 * t)
            if j: py = max(py, skin_front(px_, pz) + .005)
            cav_v.append((px_, py, pz))
            ww = face_weights((x, y, z), 'head_skin', level)
            sd_ = 'lip_' + ('L' if x >= 0 else 'R')
            if level == 'upper': ww = {'head': 1 - ww[sd_], sd_: ww[sd_]}
            cav_w.append(ww)
for k in range(2):
    off = k * (D + 1) * n
    for j in range(D):
        for i in range(n - 1): cav_f.append((off + j * n + i, off + j * n + i + 1, off + (j + 1) * n + i + 1, off + (j + 1) * n + i))
for i in range(n - 1): cav_f.append((D * n + i, D * n + i + 1, (2 * D + 1) * n + i + 1, (2 * D + 1) * n + i))
for i in (0, n - 1):
    for j in range(D): cav_f.append((j * n + i, (j + 1) * n + i, (D + 2 + j) * n + i, (D + 1 + j) * n + i))
def make_mesh(name, coords, polys, chart):
    me = bpy.data.meshes.new(name); me.from_pydata(coords, [], polys); me.update(); layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, .5, .5)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT); return ob
mouth = make_mesh('Benji_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZM))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .032
tongue_c = np.array([0, ty, MZM - .020 * W]); tr_ = np.array([.050 * W, .040 * W, .012 * W])
tv = []; tf = []; seg, rows_ = 12, 6
for j in range(rows_ + 1):
    ph = math.pi * j / rows_
    for i in range(seg):
        a = 2 * math.pi * i / seg; tv.append(tuple(tongue_c + tr_ * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), math.cos(ph)])))
for j in range(rows_):
    for i in range(seg): tf.append((j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i))
tongue = make_mesh('Benji_tongue', tv, tf, 'tongue')
bm = bmesh.new(); bm.from_mesh(tongue.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(tongue.data); bm.free()
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)

# ---------------------------------------------------------------- bind
def bind(o, weights):
    o.vertex_groups.clear(); groups = {b: o.vertex_groups.new(name=b) for b in HERO}
    for v, ww in zip(o.data.vertices, weights):
        pairs = sorted([(b, float(w)) for b, w in ww.items() if w > 1e-4], key=lambda t: -t[1])[:4]
        tot = sum(w for b, w in pairs); assert tot > 0, (o.name, v.index)
        quant = np.round(np.array([w / tot for b, w in pairs]) * 255).astype(int); quant[0] += 255 - int(quant.sum())
        for (b, w), qv in zip(pairs, quant):
            if qv > 0: groups[b].add([v.index], int(qv) / 255, 'REPLACE')
    for g in list(o.vertex_groups):
        if not any(any(w.group == g.index for w in v.groups) for v in o.data.vertices): o.vertex_groups.remove(g)
    for m in list(o.modifiers): o.modifiers.remove(m)
    mod = o.modifiers.new('Game skin', 'ARMATURE'); mod.object = arm; mod.use_deform_preserve_volume = False
    o.parent = arm; o.matrix_parent_inverse = Matrix.Identity(4)
objects = []
for o in base_objects:
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]; nm = o.name
    if nm == 'Benji_head': weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, vkind)]
    elif nm.startswith('Benji_eye_'): weights = [{'eye_' + nm[-1]: 1} for p in pp]
    elif nm.startswith('Benji_ear_'): weights = [ear_weights(p, 1 if nm[-1] == 'L' else -1) for p in pp]
    elif nm == 'Benji_tail': weights = [tail_weights(p) for p in pp]
    elif nm == 'Benji_body': weights = [bell_weights(p) for p in pp]
    elif nm == 'Benji_apron': weights = [apron_weights(p, l) for p, l in zip(pp, lab)]
    elif nm.startswith('Benji_lash_'): weights = [lash_weights(p, nm[-1]) for p in pp]          # the lash rides the upper lid
    elif nm == 'Benji_leaf': weights = [{'head': 1.} for p in pp]                              # rigid on the head
    elif nm == 'Benji_bag': weights = [dict(BAG_W8) for p in pp]
    elif nm == 'Benji_strap': weights = [strap_weights(p) for p in pp]
    elif nm.startswith('Benji_sleeve_'): weights = [sleeve_weights(p, nm[-1]) for p in pp]
    elif nm.startswith('Benji_arm_'): weights = [arm_weights(p, nm[-1]) for p in pp]
    elif nm.startswith('Benji_leg_'): weights = [leg_weights(p, l, nm[-1]) for p, l in zip(pp, lab)]
    else: raise KeyError(nm)
    bind(o, weights); objects.append(o)
bind(mouth, cav_w); bind(tongue, [{'jaw': 1} for v in tongue.data.vertices]); objects += [mouth, tongue]
for o, b in lid_objects:
    wl_ = lid_info[o.name].get('w_lid', [1.] * len(o.data.vertices))
    bind(o, [{b: w_} if w_ >= 1 else {b: w_, 'head': 1 - w_} for w_ in wl_]); objects.append(o)

# ---------------------------------------------------------------- checks and save
total = 0
for o in objects:
    o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
    assert len(o.modifiers) == 1 and o.modifiers[0].type == 'ARMATURE', o.name
    for v in o.data.vertices: assert 1 <= len(v.groups) <= 4 and abs(sum(g.weight for g in v.groups) - 1) < 1e-6, (o.name, v.index)
print('TRI_TOTAL', total, flush=True); assert total <= 34000, total
def lid_checks():
    """rest: the upper lid's stripe on the skin (within 1 mm), everything else under it; the lower lid hidden at -0.10.
    Sweep: lid points outside the skin AND outside the opening (flaps, mm), and over the opening inside the eye (pokes)"""
    out = {}
    for o, bname in lid_objects:
        tag = bname[-1]; s_ = 1 if tag == 'L' else -1; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
        kinds = np.array(lid_info[o.name].get('kinds', ['body'] * len(V)))
        angs = np.round(sorted(set(list(np.linspace(0, LIDU_SHUT, 9)) + [SQ_U, 1.0, 1.22])), 3) if bname.startswith('lidU') else np.round([-.10, -.18, LD_T], 3)
        r = {}; enter(tag)
        for a in angs:
            wl_ = np.array(lid_info[o.name].get('w_lid', [1.] * len(V)))[:, None]
            Vr = to_local(V + wl_ * (rot_axis(V, piv, hinge(tag), float(a)) - V), tag); sd = head_sdf(Vr)
            sr, psi_, X_, Z_ = ns['eye_s'](s_, Vr[:, 0], Vr[:, 2])
            if bname.startswith('lidU') and a == 0:
                r['rest_stripe_sd_mm'] = [round(float(sd[kinds == 'stripe'].min()) * 1000, 2), round(float(sd[kinds == 'stripe'].max()) * 1000, 2)]
                r['rest_other_max_sd_mm'] = round(float(sd[kinds != 'stripe'].max()) * 1000, 2)
                if os.environ.get('FLAP_DIAG'):
                    k_ = np.where(kinds == 'stripe')[0]; k_ = k_[np.argsort(-sd[k_])][:10]
                    print('STRIPE_OUT', o.name, [(round(float(X_[i]), 2), round(float(Z_[i]), 2), round(float(sd[i]) * 1000, 1)) for i in k_], flush=True)
            flap = (sr > 1.03) & (sd > .0006)
            if bname.startswith('lidU'): flap &= ~((kinds == 'stripe') & (a < .02))
            esd = np.array([eye_sd(p, tag) for p in Vr[sr < .97]]) if (sr < .97).any() else np.zeros(0)
            r[float(a)] = [int(flap.sum()), round(float(sd[flap].max()) * 1000, 1) if flap.any() else 0, int((esd < -.0002).sum())]
            if flap.any() and os.environ.get('FLAP_DIAG'):
                k = np.where(flap)[0]; k = k[np.argsort(-sd[k])][:8]
                print('FLAP', o.name, a, [(round(float(X_[i]), 2), round(float(Z_[i]), 2), round(float(sd[i]) * 1000, 1), str(kinds[i])) for i in k], flush=True)
        leave(); out[o.name] = r
    return out
LIDCHK = lid_checks(); print('LID_CHECKS', json.dumps(LIDCHK), flush=True)
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
assert int((sd > -.0005).sum()) == 0, 'tongue shows at rest'
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'ak-benji-toy_rig.blend'))
for o in lid_info.values(): o.pop('kinds', None)
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'lidClose': LIDU_SHUT, 'squint_suggested': [SQ_U, LD_T], 'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'},
       'lids': lid_info, 'upper_lid': LOG_LID, 'lid_checks': LIDCHK, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their tilted hinge: a rotation slides them along themselves.',
                 'The lash rolls (Benji_lash_L/R) are weighted 100% to lidU_* and ride the upper lid, whose rest edge runs on the top rim under the roll.',
                 'The leaf is rigid on head; the bag rigid on hips + spine; the strap on the chest blending to the bag at its ends.',
                 'Weights quantized to an exact 255 sum; <= 4 influences.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('BENJI_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'squint': [SQ_U, LD_T], 'upper_lid': LOG_LID}), flush=True)
