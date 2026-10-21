"""Stella (stella-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_stella-toy.py

Runs build_stella-toy.py in RIG_MODE (part labels; lid / cavity / tongue charts in unused atlas space; the approved GLBs, blend,
atlas and json files are not touched), then adds (after Foosy's and Floofy's rigs):
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - eyelids: rigid shells (a radius per vertex; Foosy's construction) built in each eye's own frame and hinged on the
    game's tilted lid axis (HERO_MODELS lidTilt 0.5585: her eyes face 32 deg out), painted with the coat round the eye,
    the closed-eye lash and its wing on the upper lid's edge;
  - the mouth: the model's lip parting (cut in round 2, corners shared) weighted to jaw / lip, a closed cavity pocket built on the
    parting and a tongue on its floor (Floofy's construction);
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum): the costume follows the body, the
    bell skirts partly follow the thighs, the pearls stay on the chest / neck;
and saves stella-toy_rig.blend (only Armature modifiers left), joints-rig.json, rig-part-labels.json and prop_mount.rig.json
(the parasol in the right paw; it stays its own prop, public/models/stella-parasol.glb).
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_stella-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_stella-toy.py'), '__name__': 'stella_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_stella-toy.py'), 'exec'), ns)
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
smooth, au, MAT, M2L, L2M = ns['smooth'], ns['au'], ns['MAT'], ns['M2L'], ns['L2M']
head_sdf, front_hit, grad, unit = ns['head_sdf'], ns['front_hit'], ns['grad'], ns['unit']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
def g3(v): v = np.asarray(v, float); return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]
os.makedirs(ROOT / 'export', exist_ok=True); os.makedirs(ROOT / 'scratch', exist_ok=True)
MAT.use_backface_culling = True          # as the game draws it (three.js FrontSide)

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
LOOSE = {}
for o in base_objects:
    if o.name == 'Stella_head': continue                       # (the head has none; its vertex order carries the mouth parting ids)
    used = np.zeros(len(o.data.vertices), bool)
    for p_ in o.data.polygons: used[list(p_.vertices)] = True
    if used.all(): continue
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.where(~used)[0]], context='VERTS'); bm.to_mesh(o.data); bm.free(); o.data.update()
    labels[o.name] = [l for l, u in zip(labels[o.name], used) if u]; LOOSE[o.name] = int((~used).sum())
print('LOOSE_REMOVED', json.dumps(LOOSE), flush=True)
head = OBJ['Stella_head']

# ---------------------------------------------------------------- the mouth parting (cut in the model, round 2)
MA_X = ns['MA_X']; MHW = MA_X * W
mouth_arch, arch_z_m = ns['mouth_arch'], ns['arch_z_m']
Z_C = float(mouth_arch(np.array([0.]))[0, 1]); Z_K = float(mouth_arch(np.array([1.]))[0, 1])     # the parting at the centre / corners (W)
CORNER_Z = CHIN + W * Z_K; MZ = CHIN + W * Z_C
part_ids = list(ns['part_ids']); dup_of = dict(ns['dup_of'])
HV = np.array([list(v.co) for v in head.data.vertices])
_mi = ns['MOUTH_INFO']
assert np.abs(HV[part_ids] - np.array(_mi['parting_upper_m'])).max() < 2e-4, 'head vertex order changed: the parting ids no longer match'
LOWER_DUPS = set(dup_of.values())
rim = [tuple(HV[i]) for i in part_ids]                        # the parting, corner to corner (upper copies)
rim_lower_ids = [dup_of.get(i, i) for i in part_ids]          # the matching lower copies (the corners are shared)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
ARMJ = ns['ARM']; LEGJ = ns['LEG']; RCY = ns['RCY']; LIFT = ns['LIFT']
neck_c = L2M(np.array(ns['NECK'][0]))
mouth_y = float(front_hit(0., MZ)[0])
P = {'root': (0, RCY, 0), 'hips': (0, RCY, round(.380 * LIFT, 4)), 'spine': (0, RCY, round(.470 * LIFT, 4)),
     'chest': (0, RCY - .004, round(.560 * LIFT, 4)),
     'neck': (0, RCY - .004, round(.650 * LIFT, 4)),                         # at the collar (her neck is part of the head field)
     'head': (0, float(neck_c[1]) + .045, CHIN + .001),                       # the skull base: the nod pivot at the back of the neck, chin height
     'jaw': (0, mouth_y + .22 * W, CORNER_Z)}                               # the hinge inside the head, 0.22 W behind the smile, corner height
BROW_Z = CHIN + .775 * W
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * EX, float(front_hit(s * EX, BROW_Z)[0]) + .012, BROW_Z)
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, CORNER_Z)[0]) + .002, CORNER_Z)
    P['upperarm_' + tag] = tuple(ARMJ[tag]['shoulder']); P['forearm_' + tag] = tuple(ARMJ[tag]['elbow']); P['hand_' + tag] = tuple(ARMJ[tag]['wrist'])
    P['thigh_' + tag] = tuple(LEGJ[tag]['hip']); P['shin_' + tag] = tuple(LEGJ[tag]['knee']); P['foot_' + tag] = tuple(LEGJ[tag]['ankle'])
TP = np.array(ns['TAIL_PATH']); NTL = len(TP); TAIL_IDX = [int(v) for v in os.environ.get('TAIL_IDX', '3,6,10,13').split(',')]
for i in range(4): P['tail%d' % (i + 1)] = tuple(float(c) for c in TP[TAIL_IDX[i]])
# the ears: ear_ at the root on the skull, earTip at the fold where the root twists into the hanging lobe (round 4)
EGRID = {t: (np.array(ns['EAR_GRID'][t][0]), np.array(ns['EAR_GRID'][t][1])) for t in 'LR'}
EAR_NU = 15
EAR_V_ROOT = float(os.environ.get('EAR_V_ROOT', '.07')); EAR_V_FOLD = float(os.environ.get('EAR_V_FOLD', '.34'))
EAR_ROOT_IN = float(os.environ.get('EAR_ROOT_IN', '.55'))     # the root pivot moves this fraction of the way in toward the head centre
def ear_row_pt(tag, v):
    gp, gv = EGRID[tag]; G = gp.reshape(-1, EAR_NU, 3); Vv = gv.reshape(-1, EAR_NU); vmid = Vv[:, EAR_NU // 2]
    k = float(np.interp(v, vmid, np.arange(len(vmid)))); k0 = int(min(k, len(vmid) - 2)); f = k - k0
    return G[k0].mean(0) * (1 - f) + G[k0 + 1].mean(0) * f
for tag in 'LR':
    pr = ear_row_pt(tag, EAR_V_ROOT); cen = np.array(ns['O'])
    P['ear_' + tag] = tuple(float(c) for c in pr + (cen - pr) * np.array([EAR_ROOT_IN, EAR_ROOT_IN, EAR_ROOT_IN]))
    P['earTip_' + tag] = tuple(float(c) for c in ear_row_pt(tag, EAR_V_FOLD))

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Stella_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Stella_eye_' + t].data.polygons]) for t in 'LR'}
def head_nr(p):          # the head field without the eye sockets: the closed lid shades like an unbroken face
    q = M2L(p); smin, ell = ns['smin'], ns['ell']
    d = ns['base_local'](q); d = smin(d, ell(q, *ns['LIP']), ns['K_LIP'])
    d = smin(smin(d, ell(q, *ns['NECK']), ns['K_NECK']), ell(q, *ns['NAPE']), ns['K_NAPE'])
    return smin(d, ns['nose_sdf'](q), ns['K_N']) * W
LMAX = .80
def dvec(ph): return np.stack([np.zeros_like(ph), -np.cos(ph), np.sin(ph)], -1)
def outer_mesh(tree, o, d):
    h = tree.ray_cast(Vector(o + d * LMAX), Vector(-d), LMAX)
    return None if h[0] is None else LMAX - h[3]
def outer_field(O_, D, f=None, steps=200, it=26, t0=.02):
    """distances from O_ along D to the FIRST exit from the field going outward (NaN when the ray starts outside)"""
    if f is None: f = head_sdf                      # (looked up at call time: the lids are built in each eye's own frame)
    n = len(D); ts = np.linspace(t0, LMAX, steps); lo = np.full(n, np.nan); hi = np.full(n, np.nan); found = np.zeros(n, bool)
    prev_in = f(O_ + D * ts[0]) < 0
    for k in range(1, steps):
        cur_in = f(O_ + D * ts[k]) < 0; new = (~found) & prev_in & ~cur_in
        lo[new] = ts[k - 1]; hi[new] = ts[k]; found |= new; prev_in = cur_in
        if found.all(): break
    lo = np.where(found, lo, 0.); hi = np.where(found, hi, 0.)
    for _ in range(it):
        m = .5 * (lo + hi); ins = f(O_ + D * m[:, None]) < 0; lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return np.where(found, .5 * (lo + hi), np.nan)
def probe(tag, pivot, xs, phs):
    nx, nphi = len(xs), len(phs); s = 1 if tag == 'L' else -1
    O_ = np.repeat(np.stack([xs, np.full(nx, pivot[1]), np.full(nx, pivot[2])], -1)[:, None, :], nphi, 1).reshape(-1, 3)
    D = np.tile(dvec(np.asarray(phs)), (nx, 1))
    fd = outer_field(O_, D)
    ed = np.full(len(D), np.nan); sd = np.full(len(D), np.nan)
    for i in range(len(D)):
        a = outer_mesh(eye_tree[tag], O_[i], D[i]); b = outer_mesh(skin_tree, O_[i], D[i])
        if a is not None: ed[i] = a
        if b is not None: sd[i] = b
    sees = np.isfinite(ed) & (~np.isfinite(sd) | (ed > sd - .0003))
    Pf = O_ + D * np.nan_to_num(fd, nan=.2)[:, None]
    sr, psi, X, Z = ns['eye_s3'](s, Pf)
    sh = (nx, nphi)
    return sees.reshape(sh), ed.reshape(sh), fd.reshape(sh), np.asarray(sr).reshape(sh), np.asarray(psi).reshape(sh), O_.reshape(sh + (3,)), D.reshape(sh + (3,))
def rot_x(V, piv, a):
    V = np.asarray(V, float); c, s_ = math.cos(a), math.sin(a); d = V - piv
    return np.stack([d[..., 0], d[..., 1] * c - d[..., 2] * s_, d[..., 1] * s_ + d[..., 2] * c], -1) + piv

# ---------------------------------------------------------------- eyelids (Foosy's construction)
CLOSE, SQ_U, SQ_D, NEU_D = 1.22, float(os.environ.get('SQ_U', '.488')), float(os.environ.get('SQ_D', '-.24')), -.10
G_OPEN = .0015; G_SKIN = .0010; SINK = .0030; HIDE = .0008; HIDE_REST = .0030; HIDE_SQ = .0020
def lash_band(psi): return np.asarray(ns['lash_th'](np.asarray(psi, float)))
def in_poly2(P2, poly): return ns['in_poly'](np.asarray(P2, float), np.asarray(poly, float))
WING_PAD = float(os.environ.get('WING_PAD', '.050')); WING_IN = float(os.environ.get('WING_IN', '.012'))
def opening_columns(tag, pivot, nx):
    rim_ = np.array([ns['verts'][i] for i in ns['roll_info'][1 if tag == 'L' else -1][0]])
    x0, x1 = rim_[:, 0].min(), rim_[:, 0].max(); pad = float(os.environ.get('LID_PAD', '.024'))
    # the outer side reaches over the painted wing, as far as the hinge line stays inside the head (every column's rays start inside)
    s_ = 1 if tag == 'L' else -1; xo = x1 if tag == 'L' else x0; reach = 0.
    for k_ in range(1, 101):
        d_ = WING_PAD * k_ / 100
        if float(np.asarray(head_sdf(np.array([[xo + s_ * d_, pivot[1], pivot[2]]])))[0]) < -WING_IN: reach = d_
        else: break
    print('LID_WING_REACH', tag, round(reach, 4), flush=True)
    lo_, hi_ = (x0 - pad, x1 + reach) if tag == 'L' else (x0 - reach, x1 + pad)
    return np.linspace(lo_, hi_, nx), (x0, x1)
PH = np.linspace(-1.35, 1.35, 541)
def column_intervals(tag, pivot, xs):
    sees, ed, fd, sr, psi, O_, D = probe(tag, pivot, xs, PH)
    lo = np.full(len(xs), np.nan); hi = np.full(len(xs), np.nan)
    for i in range(len(xs)):
        k = np.where(sees[i])[0]
        if len(k): lo[i] = PH[k.min()]; hi[i] = PH[k.max()]
    ok = np.isfinite(lo)
    for i in np.where(~ok)[0]:
        j = np.where(ok)[0][np.argmin(np.abs(np.where(ok)[0] - i))]; lo[i] = lo[j]; hi[i] = hi[j]
    return lo, hi, ok
# (MID_FIX: the lid hinge 2 cm higher than before, so the lower and upper rims sit at even radii from it)
PIV_DZ = float(os.environ.get('PIV_DZ', '0' if os.environ.get('MID_FIX', '1') == '1' else '-.02')); BAND_PAD = float(os.environ.get('BAND_PAD', '.08')); WING_SR = float(os.environ.get('WING_SR', '1.58'))
MID_FIX = os.environ.get('MID_FIX', '1') == '1'; G_MID = float(os.environ.get('G_MID', '.0015'))
MID_WINS = os.environ.get('MID_WINS', '1') == '1'; COVER_SOFT = os.environ.get('COVER_SOFT', '1') == '1'; MID_UMAX = float(os.environ.get('MID_UMAX', '1.04')); MID_FACE_MAX = float(os.environ.get('MID_FACE_MAX', '0'))
MID_A = [float(v) for v in os.environ.get('MID_A', '.1,.2,.3,.366,.45,.55,.65,.732,.82,.9,.98,1.037,1.1,1.16' if MID_FIX else '.45,.6,.75,.9,1.05').split(',') if v]
HIDE_MID = float(os.environ.get('HIDE_MID', '.0015' if MID_FIX else '.0008'))
COV_W0, COV_W1 = float(os.environ.get('COV_W0', '.04')), float(os.environ.get('COV_W1', '.08')); IN_C_GROW = float(os.environ.get('IN_C_GROW', '.02'))
SQ_COV = float(os.environ.get('SQ_COV', '.255')); SQ_RISE = float(os.environ.get('SQ_RISE', '.04'))
LO_VIEWS = [(0, -1, 0), (.5, -.5, .7071), (-.5, -.5, .7071), (0, -.9, -.44), (.6, -.8, .1), (-.6, -.8, .1), (0, -.7, .7)]
def lo_from_views(tag, s, pivot, xs):
    """per column, the lowest closed-frame angle at which the eye is SEEN from the world views (the game camera, front, 3/4,
    below) at rest: the radial rays from the hinge miss the inner-lower part of the opening that these views see"""
    Rl_ = EYE_FR[tag]['Rl']; Ec = np.array(ns['EYEF'][s]['Sc'], float); dx = xs[1] - xs[0]; lo_w = np.full(len(xs), np.inf)
    for dv in LO_VIEWS:
        d = unit(np.array(dv, float) @ Rl_.T); rt = unit(np.cross(d, np.array([0, 0, 1.]))); up2 = np.cross(rt, d)
        for a in np.linspace(-1.5 * EHW, 1.5 * EHW, 72):
            for b in np.linspace(-1.5 * EHH, .2 * EHH, 50):
                o = Ec + rt * a + up2 * b + d * 1.0
                he = eye_tree[tag].ray_cast(Vector(o), Vector(-d), 3)
                if he[0] is None: continue
                hs = skin_tree.ray_cast(Vector(o), Vector(-d), 3)
                if hs[0] is not None and hs[3] < he[3] - 1e-4: continue
                q = np.array(he[0]); i = int(round((q[0] - xs[0]) / dx))
                if 0 <= i < len(xs) and q[2] < Ec[2]:
                    lo_w[i] = min(lo_w[i], math.atan2(q[2] - pivot[2], -(q[1] - pivot[1])))
    return lo_w
MV_ANGLES = [float(v) for v in os.environ.get('MV_ANGLES', '.2,.366,.5,.6,.732,.85,.95,1.037,1.12').split(',')]
MV_VIEWS = [(45, 20), (-45, 20), (45, 45), (-45, 45), (0, 0), (0, 20), (70, 10), (-70, 10)]   # (game yaw, elevation) deg
def mid_view_metric(tag, s, pivot, Pc, PHc, Fq, n=48):
    """the mid-blink seen from the game's views (in the eye's own frame): per lid angle a, rays over the eye whose first hit is
    the lid where the bare face would show skin (flap: the lid out of the skin), the eye with the lid behind it (tear: the lid
    inside the eyeball), or the eye above the lid's own edge line (gap: the lid short of the opening)"""
    Rl_ = EYE_FR[tag]['Rl']; Ec = np.array(ns['EYEF'][s]['Sc'], float); xs_c = Pc[:, 0, 0]; e_ph = PHc[:, 0]
    out = {}
    for a in MV_ANGLES:
        V = rot_x(Pc.reshape(-1, 3), pivot, -(CLOSE - a)); lt_ = BVHTree.FromPolygons([Vector(p) for p in V], Fq)
        tot = {'flap': 0, 'tear': 0, 'gap': 0}
        for yaw, el in MV_VIEWS:
            e_, y_ = math.radians(el), math.radians(yaw)
            d = unit(np.array([math.sin(y_) * math.cos(e_), -math.cos(y_) * math.cos(e_), math.sin(e_)]) @ Rl_.T)
            rt = unit(np.cross(d, np.array([0, 0, 1.]))); up2 = np.cross(rt, d)
            for a_ in np.linspace(-1.4 * EHW, 1.4 * EHW, n):
                for b_ in np.linspace(-1.4 * EHH, 1.4 * EHH, n):
                    o = Vector(Ec + rt * a_ + up2 * b_ + d * 1.0); dd = Vector(-d)
                    he = eye_tree[tag].ray_cast(o, dd, 3); hs = skin_tree.ray_cast(o, dd, 3); hl = lt_.ray_cast(o, dd, 3)
                    te = he[3] if he[0] is not None else 9.; ts = hs[3] if hs[0] is not None else 9.; tl = hl[3] if hl[0] is not None else 9.
                    if tl < min(te, ts) and ts < te and ts < 9.: tot['flap'] += 1
                    elif te < min(tl, ts):
                        if tl < 9.: tot['tear'] += 1
                        else:
                            q = np.array(he[0]); th_ = math.atan2(q[2] - pivot[2], -(q[1] - pivot[1]))
                            if th_ > float(np.interp(q[0], xs_c, e_ph)) + CLOSE - a + .015 and xs_c.min() < q[0] < xs_c.max(): tot['gap'] += 1
        out['%.3f' % a] = tot
    return out
def upper_lid(tag, R, nx=25, build=True):
    s = 1 if tag == 'L' else -1; F_ = ns['EYEF'][s]
    Ec = F_['Sc']; n0 = np.array(F_['ax0']); nyz = unit(np.array([0, n0[1], n0[2]]))
    pivot = np.array([Ec[0], Ec[1] - nyz[1] * R, Ec[2] - nyz[2] * R + PIV_DZ])
    xs, (x0, x1) = opening_columns(tag, pivot, nx)
    lo, hi, ok = column_intervals(tag, pivot, xs)
    edge = lo - .0030 / R
    if build and os.environ.get('LO_VIEWS', '0') == '1':
        lo_w = lo_from_views(tag, s, pivot, xs); need = np.isfinite(lo_w) & (lo_w < lo)
        print('LID_LO_VIEWS', tag, json.dumps({'columns_lowered': int(need.sum()), 'max_extra_rad': round(float(np.max(np.where(need, lo - lo_w, 0))), 4)}), flush=True)
        edge = np.minimum(edge, np.where(np.isfinite(lo_w), lo_w, 9.) - .0030 / R)
    # SQ_DESIGN=1: the old level-line squint edge (it pushed the corner columns' edge below the rim, so the closed lash and the lid
    # edge parted into two lines); with the tilted hinge the plain edge (on the lower rim when closed) gives a smooth U at the squint
    if build and os.environ.get('SQ_DESIGN', '1') == '1':
        # the happy squint's edge: a level line across the eye, a touch higher at the outer corner (never sloping down outward)
        rim_ = np.array([ns['verts'][i] for i in ns['roll_info'][s][0]]); RX, RZ = rim_[:, 0], rim_[:, 2]
        def cross(x):
            zz = [RZ[a] + (x - RX[a]) / (RX[b] - RX[a]) * (RZ[b] - RZ[a]) for a, b in ((i, (i + 1) % len(rim_)) for i in range(len(rim_))) if (RX[a] - x) * (RX[b] - x) <= 0 and RX[a] != RX[b]]
            return (min(zz), max(zz)) if zz else (None, None)
        zb_c, zt_c = cross(Ec[0]); Hc = zt_c - zb_c; half = (rim_[:, 0].max() - rim_[:, 0].min()) / 2
        z_lv = zt_c - SQ_COV * Hc
        for i, x in enumerate(xs):
            Xo = np.clip(s * (x - Ec[0]) / half, -1, 1); zt_ = z_lv + SQ_RISE * Hc * max(Xo, 0.)
            rg = R
            for _ in range(3):
                ph = math.asin(np.clip((zt_ - pivot[2]) / rg, -.99, .99))
                fd_ = outer_field(np.array([[x, pivot[1], pivot[2]]]), dvec(np.array([ph])))[0]
                rg = fd_ if np.isfinite(fd_) else rg
            edge[i] = min(ph - (CLOSE - SQ_U), lo[i] - .0030 / R)
    c = nx // 2; span_c = hi[c] - lo[c]
    cov = (hi[c] - (edge[c] + (CLOSE - SQ_U))) / span_c
    top_hidden = edge[c] + CLOSE - hi[c]
    if not build: return {'R': R, 'span_c': span_c, 'cov': cov, 'rest_margin_rad': top_hidden}
    SQD = CLOSE - SQ_U
    def col_angles(i):
        e_, l_, h_ = edge[i], lo[i], hi[i]; fs_ = h_ - SQD
        a_ = [e_, e_ + .006, max(l_ + .004, e_ + .012)]
        if os.environ.get('LO_VIEWS', '0') == '1' and l_ - e_ > .03: a_ += list(np.linspace(e_ + .012, l_, 5)[1:-1])          # rows down to an edge well below lo (the views' need)
        a_ += list(fs_ + np.array([-.045, -.024, -.012, -.004, .004, .012, .024, .045]))
        a_ += list(l_ + (h_ - l_) * np.array([.30, .60, .80]))
        a_ += list(h_ + np.array([-.024, -.012, -.004, .004, .012, .024, .040, .060, .085, .115, .155, .21, .27, .33]))
        a_ = np.unique(np.round(np.clip(np.array(a_), e_, None), 5))
        out = [a_[0]]
        for v in a_[1:]:
            if v - out[-1] > .003: out.append(v)
        return out
    cols_ = [col_angles(i) for i in range(nx)]; NRw = max(len(c_) for c_ in cols_)
    cols_ = [list(np.interp(np.linspace(0, 1, NRw), np.linspace(0, 1, len(c_)), c_)) if len(c_) < NRw else c_ for c_ in cols_]
    PHc = np.array(cols_)
    rows = np.linspace(0, 1, PHc.shape[1])
    def state(phs):
        out = [probe(tag, pivot, xs[i:i + 1], phs[i]) for i in range(nx)]
        return [np.concatenate([o[k] for o in out]) for k in range(7)]
    rimP = np.array([ns['verts'][i] for i in ns['roll_info'][s][0]])[:, [0, 2]]
    sc, ec, fc, src, psic, Oc, Dc = state(PHc)
    ss, es, fs, srs, psis, Os, Ds = state(PHc + (CLOSE - SQ_U))
    sr_, er_, fr_, srr, psir, Or_, Dr_ = state(PHc + CLOSE)
    U_mid = np.full(fc.shape, 9.); L_mid = np.full(fc.shape, -9.); A_U = np.full(fc.shape, -1.); A_L = np.full(fc.shape, -1.)
    for am in MID_A:                                       # the blink's middle: a vertex at closed angle ph sits at ph + CLOSE - am
        sm_, em_, fm_, srm_, psim_, Om_, Dm_ = state(PHc + (CLOSE - am))
        Pm_ = Om_ + Dm_ * np.nan_to_num(fm_, nan=.2)[..., None]; c_ = rimP.mean(0)
        in_m = in_poly2(Pm_[..., [0, 2]].reshape(-1, 2), rimP).reshape(fm_.shape)
        if MID_FIX:
            # MID_FIX (2026-10-17): over the opening means the hinge ray SEES the eye (the front projection's rim polygon let
            # the outer corner stand proud of the skin: a pale flap from the 20-degree look camera); there the lid stays in
            # front of the eyeball (it dipped into it: a torn edge) and no prouder than the face without its sockets
            ov_ = sm_ & np.isfinite(em_)
            # (the hide / face bounds stop at MID_UMAX: nearer closed the approved closed lid lies over the lower rim by design)
            nu_ = np.where(~ov_ & np.isfinite(fm_) & (am <= MID_UMAX), fm_ - HIDE_MID, 9.); A_U = np.where(nu_ < U_mid, am, A_U)
            U_mid = np.fmin(U_mid, nu_)
            nl_ = np.where(ov_, em_ + G_MID, -9.); A_L = np.where(nl_ > L_mid, am, A_L)
            L_mid = np.fmax(L_mid, nl_)
            fnm_ = outer_field(Om_.reshape(-1, 3), Dm_.reshape(-1, 3), f=head_nr).reshape(fm_.shape)
            nf_ = np.where(ov_ & np.isfinite(fnm_) & (am <= MID_FACE_MAX), np.fmax(fnm_ + G_SKIN, em_ + G_MID + .0005), 9.); A_U = np.where(nf_ < U_mid, am + 10, A_U)
            U_mid = np.fmin(U_mid, nf_)
        else:
            U_mid = np.where(~in_m & np.isfinite(fm_), np.fmin(U_mid, fm_ - HIDE_MID), U_mid)
    def over_eye(O_, D_, f_, grow=0.):
        Pp = O_ + D_ * np.nan_to_num(f_, nan=.2)[..., None]; c_ = rimP.mean(0)
        return in_poly2((Pp[..., [0, 2]].reshape(-1, 2) - c_) / (1 + grow) + c_, rimP).reshape(f_.shape), Pp
    in_c, Pc0 = over_eye(Oc, Dc, fc, grow=IN_C_GROW); in_s, Ps0 = over_eye(Os, Ds, fs); in_r, Pr0 = over_eye(Or_, Dr_, fr_)
    # the skin without the eye socket along each closed-state ray: where the shell dives under the skin it follows this, so it
    # never folds down into the socket (a fold showed its back face as a grey fleck at the inner corner)
    fn_c = outer_field(Oc.reshape(-1, 3), Dc.reshape(-1, 3), f=head_nr).reshape(fc.shape); fn_c = np.where(np.isfinite(fn_c), np.fmax(fn_c, fc), fc)
    band = 1 + lash_band(psic) + BAND_PAD
    # the closed lid's cover: a smooth field (1 over the opening, the lash band and the painted wing, a thin strip under the
    # lower rim; 0 beyond), so the line where the shell comes out of the skin is an even curve (a hard mask left a ragged edge)
    sp_, cp_ = np.sin(psic), np.cos(psic)
    X_c = np.asarray(ns['eye_s3'](s, Pc0.reshape(-1, 3))[2]).reshape(fc.shape)
    arc0 = (PHc - edge[:, None]) * np.nan_to_num(fc, nan=R)
    c_band = 1 - smooth(band - COV_W0, band + COV_W1, src)
    wing_soft = smooth(.28, .40, cp_) * smooth(-.18, -.06, sp_) * smooth(.995, .93, sp_)
    c_wing = wing_soft * (1 - smooth(WING_SR - .05, WING_SR + .06, src))
    cov_f = np.maximum(c_band, c_wing) * smooth(-.52, -.40, sp_)      # (below the opening the shell goes under the skin: those rows are the squint's edge)
    # and 0 toward the shell's own borders (the top rows, the end columns): the shell always goes under the skin before it ends
    jj_ = np.arange(cov_f.shape[1])[None, :]; ii_ = np.arange(cov_f.shape[0])[:, None]; nr__ = cov_f.shape[1]; nx__ = cov_f.shape[0]
    cov_f = cov_f * smooth(nr__ - 1., nr__ - 4., jj_) * smooth(0., 3., ii_) * smooth(nx__ - 1., nx__ - 4., ii_)
    cov_f = np.where(in_c, 1., cov_f)
    cover = cov_f >= .98; bare = (~in_c) & (cov_f <= .02); ramp = (~in_c) & ~cover & ~bare
    INF = 9.
    ecz = np.where(np.isfinite(ec), ec, -INF); esz = np.where(np.isfinite(es), es, -INF)
    # the closed shell's shape: the face without its eye sockets (+1 mm), smoothly over the eye's own bulge where that stands
    # higher; one smooth field across the rim, so there is no step where the opening ends
    def smax(a, b, k):
        h = np.clip(.5 + .5 * (a - b) / k, 0, 1); return b + (a - b) * h + k * h * (1 - h)
    T_close = np.where(np.isfinite(ec), smax(fn_c + G_SKIN, ecz + G_OPEN, .004), fn_c + G_SKIN)
    Tg = T_close * cov_f + (fn_c - SINK) * (1 - cov_f)
    L = np.full(fc.shape, -INF); U = np.full(fc.shape, INF)
    L = np.where(in_c, np.fmax(fc, ecz) + G_OPEN, L)
    # (MID_FIX: over the eye the closed lid's face-level cover is a target, not a bound: the mid-blink's hide under the upper
    # rim beats it, so the closed lid may sit a few mm under the face there instead of the mid-blink riding over the rim)
    L = np.where(cover & ~(in_c & (MID_FIX and COVER_SOFT)), np.fmax(L, T_close - .0002), L)
    L = np.where(ramp, np.fmax(L, Tg - .0003), L)
    L = np.where(in_s, np.fmax(L, esz + HIDE), L)
    if MID_FIX:
        cfm = (L_mid > U_mid + 1e-6) | (L_mid > fr_ - HIDE_REST + 1e-6)
        print('LID_MID_CONFLICTS', tag, R, json.dumps({'n': int(cfm.sum()), 'cols': sorted(set(int(i) for i in np.where(cfm)[0])),
              'deficit_mm_max': round(float(np.max(np.where(cfm, L_mid - np.fmin(U_mid, fr_ - HIDE_REST), 0))) * 1000, 2)}), flush=True)
        for i_, j_ in zip(*np.where(cfm)):
            ur_ = fr_[i_, j_] - HIDE_REST
            print('  MIDC', i_, j_, 'ph %.3f' % PHc[i_, j_], 'L %.4f@%.3f' % (L_mid[i_, j_], A_L[i_, j_]), 'U %.4f@%s' % (min(U_mid[i_, j_], ur_), 'rest' if ur_ < U_mid[i_, j_] else '%.3f' % A_U[i_, j_]), 'def %.1f' % ((L_mid[i_, j_] - min(U_mid[i_, j_], ur_)) * 1000), flush=True)
        L = np.fmax(L, L_mid)
    U_sq = np.where(~in_s, fs - HIDE_SQ, INF); U_rest = fr_ - HIDE_REST
    U = np.fmin(U, U_sq); U = np.fmin(U, U_rest); U = np.fmin(U, U_mid)
    U = np.where(cover & ~in_c, np.fmin(U, np.fmax(T_close + .0008, L)), U)
    LW_ = L_mid if MID_WINS else -9.                       # (MID_WINS: the mid-blink's in-front-of-the-eye bound beats the closed lid's dive)
    U = np.where(ramp, np.fmin(U, np.fmax(Tg + .0003, LW_)), U)
    U = np.where(bare, np.fmin(U, np.fmax(fn_c - .0006, LW_)), U)
    conflict = L > U
    cf = conflict & ~in_c
    if cf.any():
        ii, jj = np.where(cf)
        print('LID_CONFLICTS', tag, json.dumps({'n': int(cf.sum()), 'cols': sorted(set(int(i) for i in ii)), 'rows': sorted(set(int(j) for j in jj)),
              'src': [round(float(src[cf].min()), 3), round(float(src[cf].max()), 3)], 'psi_deg': [round(float(np.degrees(psic[cf]).min())), round(float(np.degrees(psic[cf]).max()))],
              'by_rest': int((cf & (U_rest < L)).sum()), 'by_squint': int((cf & (U_sq < L)).sum()), 'by_mid_blink': int((cf & (U_mid < L)).sum()), 'cover': int((cf & cover).sum()), 'ramp': int((cf & ramp).sum()),
              'deficit_mm_max': round(float((L - U)[cf].max()) * 1000, 2)}), flush=True)
    ci = conflict & in_c
    if ci.any(): print('LID_CONFLICTS_OPENING', tag, int(ci.sum()), 'by_rest', int((ci & (U_rest < L)).sum()), 'by_squint', int((ci & (U_sq < L)).sum()), 'by_mid_blink', int((ci & (U_mid < L)).sum()), flush=True)
    U = np.where(conflict & in_c, L, U); L = np.where(conflict & ~in_c, U, L)
    r = np.clip(np.fmin(Tg, U), L, U)
    for _ in range(60):
        rs = r.copy()
        rs[:, 1:-1] = .25 * r[:, :-2] + .5 * r[:, 1:-1] + .25 * r[:, 2:]
        rs[1:-1, :] = .8 * rs[1:-1, :] + .1 * (rs[:-2, :] + rs[2:, :])
        r = np.clip(rs, L, U)
    badr = ~np.isfinite(r) | (r > 3 * R + .3)                 # a safety net: a ray that found no surface never leaves a vertex out in space
    if badr.any():
        good_c = [i for i in range(r.shape[0]) if (~badr[i]).sum() >= 2]
        for i in range(r.shape[0]):
            g = ~badr[i]
            if g.sum() >= 2: r[i, ~g] = np.interp(np.where(~g)[0], np.where(g)[0], r[i, g])
            else: r[i] = r[min(good_c, key=lambda j: abs(j - i))]
    print('LID_BAD_R', tag, int(badr.sum()), flush=True)
    print('LID_BOUNDS', tag, R, json.dumps({'conflicts_closing_wins': int((conflict & in_c).sum()), 'conflicts_other': int((conflict & ~in_c).sum())}), flush=True)
    conflicts = int(((r > fr_ - HIDE_REST + 1e-5)).sum())
    PHr = PHc + CLOSE
    Vrest = pivot + r[..., None] * dvec(PHr) + np.stack([xs[:, None] - pivot[0] + 0 * r, 0 * r, 0 * r], -1)
    Pc = pivot + r[..., None] * dvec(PHc) + np.stack([xs[:, None] - pivot[0] + 0 * r, 0 * r, 0 * r], -1)
    nn = grad(head_nr, Pc.reshape(-1, 3)); nk = grad(head_sdf, Pc.reshape(-1, 3))
    t_ = np.clip((src.reshape(-1) - 1.0) / .12, 0, 1); t_ = t_ * t_ * (3 - 2 * t_)
    Nc = unit(nn * (1 - t_[:, None]) + nk * t_[:, None])
    Nrest = rot_x(Nc, np.zeros(3), -CLOSE)
    arc = (PHc - edge[:, None]) * r
    nr_ = Pc.shape[1]; Fq = [(i * nr_ + j, (i + 1) * nr_ + j, (i + 1) * nr_ + j + 1, i * nr_ + j + 1) for i in range(nx - 1) for j in range(nr_ - 1)]
    lt = BVHTree.FromPolygons([Vector(p) for p in Pc.reshape(-1, 3)], Fq)
    specks = {}
    for vn, dv in (('front', Vector((0, -1, 0))), ('game+45', Vector((.5, -.5, .7071))), ('game-45', Vector((-.5, -.5, .7071)))):
        n_ = 0
        for x in np.linspace(Ec[0] - EHW * 1.3, Ec[0] + EHW * 1.3, 40):
            for z in np.linspace(EZ - EHH * 1.25, EZ + EHH * 1.25, 40):
                o = Vector((x, -.20, z)) + dv * 1.0; d = -dv
                hs = [(h[3], k) for k, tr in (('eye', eye_tree[tag]), ('lid', lt), ('skin', skin_tree)) for h in [tr.ray_cast(o, d, 3)] if h[0] is not None]
                if hs and min(hs)[1] == 'eye': n_ += 1
        specks[vn] = n_
    if os.environ.get('LID_MIDVIEW', '1') == '1':
        mv = mid_view_metric(tag, s, pivot, Pc, PHc, Fq); print('LID_MIDVIEW', tag, R, json.dumps(mv), flush=True)
    info = {'pivot': pivot.tolist(), 'R': R, 'closed_eye_specks_of_1600': specks, 'span_c': round(float(span_c), 4), 'squint_coverage_centre': round(float(cov), 3),
            'rest_margin_rad': round(float(top_hidden), 3), 'conflicts_rest_hidden_vs_closed': conflicts,
            'closed_standoff_over_eye_mm': round(float(np.nanmax(np.where(sc, r - ec, np.nan)) * 1000), 2)}
    return dict(V=Vrest, N=Nrest, Pc=Pc, arc=arc, xs=xs, rows=np.array(rows), pivot=pivot, info=info, src=src, ok=ok)
RING_D = float(os.environ.get('RING_D', '.0055'))
def lower_lid_front(tag, nx=17):
    """the lower lid built at its happy pose by projecting from the front onto the eye and the skin (a rigid shell: rest =
    happy rotated +0.24 about X at a pivot behind and above the eye, so it swings down and back into the cheek)"""
    s = 1 if tag == 'L' else -1; F_ = ns['EYEF'][s]; Ec = F_['Sc']
    H = 2 * EHH; BETA = math.radians(float(os.environ.get('LIDD_BETA', '62'))); lev = (.30 * H + .006) / (.14 * math.cos(BETA))
    zb0 = EZ - .70 * EHH
    pivot = np.array([Ec[0], Ec[1] + lev * math.cos(BETA), zb0 + lev * math.sin(BETA)])
    rim_ = np.array([ns['verts'][i] for i in ns['roll_info'][s][0]]); RX, RZ = rim_[:, 0], rim_[:, 2]
    x0, x1 = RX.min(), RX.max(); xs = np.linspace(x0 + .002, x1 - .002, nx)
    def crossings(x):
        zz = []
        for i in range(len(rim_)):
            a, b = i, (i + 1) % len(rim_)
            if (RX[a] - x) * (RX[b] - x) <= 0 and RX[a] != RX[b]:
                t = (x - RX[a]) / (RX[b] - RX[a]); zz.append(RZ[a] + t * (RZ[b] - RZ[a]))
        return (min(zz), max(zz)) if zz else (EZ, EZ)
    X = (xs - Ec[0]) / ((x1 - x0) / 2)
    cov = .28 - .08 * np.clip(np.abs(X), 0, 1) ** 2
    fr_rows = np.array([0, .03, .18, .38, .58, .78, .92, 1.0])
    below = np.array([.0015, .0035, .0055, .0080, .011])
    G = []; ARC = []
    for i, x in enumerate(xs):
        zb_, zt_ = crossings(x); zh = zb_ + cov[i] * (zt_ - zb_)
        zs = list(zh - (zh - zb_) * fr_rows) + list(zb_ - below)
        col = []
        for z in zs:
            o = Vector((x, -1.5, z)); d = Vector((0, 1, 0))
            he = eye_tree[tag].ray_cast(o, d, 3); hs = skin_tree.ray_cast(o, d, 3)
            yf = float(front_hit(np.array([x]), np.array([z]))[0])
            ye = he[0].y if he[0] is not None else np.inf; ys_ = hs[0].y if hs[0] is not None else np.inf
            inside = z >= zb_ + .0004
            ring_ = z >= zb_ - RING_D
            y = (min(ye, ys_, yf) - G_OPEN) if inside else ((min(ys_, yf) - G_SKIN) if ring_ else (yf + SINK * min(1., max(.35, (zb_ - z - RING_D) / .003))))
            col.append((x, y, z))
        G.append(col); ARC.append([zh - z for z in zs])
    Ph = np.array(G); arc = np.array(ARC)
    nn = grad(head_nr, Ph.reshape(-1, 3)); nk = grad(head_sdf, Ph.reshape(-1, 3))
    srh_ = np.asarray(ns['eye_s3'](s, Ph.reshape(-1, 3))[0]); t_ = np.clip((srh_ - .98) / .10, 0, 1); t_ = t_ * t_ * (3 - 2 * t_)
    Nh = unit(nn * (1 - t_[:, None]) + nk * t_[:, None])
    Vrest = rot_x(Ph, pivot, -SQ_D); Nrest = rot_x(Nh, np.zeros(3), -SQ_D)
    rows = np.linspace(0, 1, Ph.shape[1])
    info = {'pivot': pivot.tolist(), 'lever_m': round(lev, 3), 'beta_deg': round(math.degrees(BETA), 1), 'happy_cover_centre': .28, 'happy_cover_corners': .20}
    return dict(V=Vrest, N=Nrest.reshape(Ph.shape), Pc=Ph, arc=arc, xs=xs, rows=rows, pivot=pivot, info=info, src=None, ok=None)
LID_PAINT = {}; lid_objects = []; lid_info = {}; LID_NR = {}
def make_lid(name, L, chart, bone):
    nx, nr = L['V'].shape[:2]
    V = L['V'].reshape(-1, 3); N = L['N'].reshape(-1, 3); F = []
    for i in range(nx - 1):
        for j in range(nr - 1):
            q = i * nr + j; F.append((q, q + nr, q + nr + 1, q + 1))
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], F); me.update()
    layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices:
            vi = me.loops[l].vertex_index; i, j = divmod(vi, nr)
            u_ = i / (nx - 1) if name.endswith('_L') else 1 - i / (nx - 1)      # the R lid mirrors the L lid's chart
            layer.data[l].uv = au(chart, u_, float(L['rows'][j]))
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    for f in bm.faces:
        nf = sum((Vector(N[v.index]) for v in f.verts), Vector())
        if f.normal.dot(nf) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([tuple(N[me.loops[l].vertex_index]) for l in range(len(me.loops))])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    LID_NR[name] = nr; lid_objects.append((ob, bone)); return ob
# ---------------------------------------------------------------- the tilted lid hinge (HERO_MODELS lidTilt)
# Her eyes face ~30 deg outward. About world X a rigid lid cannot make an even happy squint: the bottom rows of the inner half lie on
# the skin below the eye when closed but must stand in front of the upper eye at the squint (a 2 cm deficit), so the squint's inner
# half was eaten away (the edge sloped down outward). The game turns lidU / lidD about (cos t, 0, -/+ sin t) in game axes (L / R)
# = Blender (cos t, +/- sin t, 0): a horizontal hinge square to each eye's facing, through the lid bone's head. Each lid is built in
# its eye's own frame (head, eye and fields turned about the vertical through the eye's surface centre so the eye faces -Y and the
# hinge is X) with the construction above unchanged, then turned back (the Floofy method).
def Rz(phi):
    c, s_ = math.cos(phi), math.sin(phi); return np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.]])
EYE_FR = {}
for tag_, s_ in (('L', 1), ('R', -1)):
    ax_ = np.array(ns['EYEF'][s_]['ax0'], float); EYE_FR[tag_] = {'Sc': np.array(ns['EYEF'][s_]['Sc'], float), 's': s_, 'a_measured': math.atan2(s_ * ax_[0], -ax_[1])}
LID_TILT = round(float(np.mean([EYE_FR[t]['a_measured'] for t in 'LR'])), 4) if os.environ.get('LID_TILT', '1') != '0' else 0.
for t_ in 'LR':
    f_ = EYE_FR[t_]; f_['Rw'] = Rz(f_['s'] * LID_TILT); f_['Rl'] = Rz(-f_['s'] * LID_TILT)
def hinge(tag): return EYE_FR[tag]['Rw'] @ np.array([1., 0, 0])
def to_world(q, tag):
    f_ = EYE_FR[tag]; q = np.asarray(q, float); return f_['Sc'] + (q - f_['Sc']) @ f_['Rw'].T
def to_local(p, tag):
    f_ = EYE_FR[tag]; p = np.asarray(p, float); return f_['Sc'] + (p - f_['Sc']) @ f_['Rl'].T
def rot_axis(V, Pv, axis, ang):
    k = np.asarray(axis, float) / np.linalg.norm(axis); d = np.asarray(V, float) - Pv
    c, s_ = math.cos(ang), math.sin(ang)
    return Pv + d * c + np.cross(k, d) * s_ + np.outer(d @ k, k) * (1 - c)
print('LID_TILT', LID_TILT, 'measured', {t: round(EYE_FR[t]['a_measured'], 4) for t in 'LR'}, 'hinge L', hinge('L').round(4).tolist(), 'R', hinge('R').round(4).tolist(), flush=True)
HEAD_SDF_W, HEAD_NR_W, FRONT_HIT_W, EYE_S3_W = head_sdf, head_nr, front_hit, ns['eye_s3']
HV_W = np.array([list(v.co) for v in head.data.vertices]); HT_ = [tuple(t.vertices) for t in head.data.loop_triangles]
SWAP = {}
def _wrap_field(F, tag):
    def f(q):
        q = np.asarray(q, float); return np.asarray(F(to_world(q.reshape(-1, 3), tag))).reshape(q.shape[:-1])
    return f
def _wrap_s3(tag):
    def f(side, P_):
        P_ = np.asarray(P_, float); sh = P_.shape[:-1]
        out = EYE_S3_W(side, to_world(P_.reshape(-1, 3), tag))
        return tuple(np.asarray(o_).reshape(sh) for o_ in out)
    return f
def enter(tag):
    g = globals(); s_ = EYE_FR[tag]['s']
    for k in ('skin_tree', 'eye_tree', 'head_sdf', 'head_nr', 'front_hit', 'EZ', 'EHW', 'EHH'): SWAP[k] = g[k]
    for k in ('verts', 'EYEF', 'eye_s3'): SWAP['ns:' + k] = ns[k]
    hs_l = _wrap_field(HEAD_SDF_W, tag); g['head_sdf'] = hs_l; g['head_nr'] = _wrap_field(HEAD_NR_W, tag)
    g['front_hit'] = lambda x, z, f=None, hs_l=hs_l: FRONT_HIT_W(x, z, f if f is not None else hs_l)
    g['skin_tree'] = BVHTree.FromPolygons([Vector(p) for p in to_local(HV_W, tag)], HT_)
    eo = OBJ['Stella_eye_' + tag]
    g['eye_tree'] = {tag: BVHTree.FromPolygons([Vector(p) for p in to_local(np.array([list(v.co) for v in eo.data.vertices]), tag)],
                                               [tuple(p_.vertices) for p_ in eo.data.polygons])}
    ns['verts'] = to_local(np.asarray(SWAP['ns:verts'], float), tag)
    E_ = dict(SWAP['ns:EYEF']); F0 = dict(E_[s_]); Rl_ = EYE_FR[tag]['Rl']
    for k in ('ax0', 'ax', 'eo', 'ev'):
        if k in F0: F0[k] = np.asarray(F0[k], float) @ Rl_.T
    E_[s_] = F0; ns['EYEF'] = E_
    ns['eye_s3'] = _wrap_s3(tag)
    rimL = ns['verts'][ns['roll_info'][s_][0]]
    g['EZ'] = float(rimL[:, 2].max() + rimL[:, 2].min()) / 2; g['EHW'] = float(rimL[:, 0].max() - rimL[:, 0].min()) / 2; g['EHH'] = float(rimL[:, 2].max() - rimL[:, 2].min()) / 2
    print('EYE_FRAME', tag, 'EZ EHW EHH', round(g['EZ'], 4), round(g['EHW'], 4), round(g['EHH'], 4), flush=True)
def leave():
    g = globals()
    for k, v in SWAP.items():
        if k.startswith('ns:'): ns[k[3:]] = v
        else: g[k] = v
    SWAP.clear()
def lid_to_world(Ld, tag):
    Rw_ = EYE_FR[tag]['Rw']; sh = np.asarray(Ld['V']).shape
    Ld['V'] = to_world(np.asarray(Ld['V'], float).reshape(-1, 3), tag).reshape(sh)
    Ld['N'] = (np.asarray(Ld['N'], float).reshape(-1, 3) @ Rw_.T).reshape(sh)
    shp = np.asarray(Ld['Pc']).shape; Ld['Pc'] = to_world(np.asarray(Ld['Pc'], float).reshape(-1, 3), tag).reshape(shp)
    Ld['pivot_local'] = np.array(Ld['pivot']); Ld['pivot'] = to_world(np.array(Ld['pivot']), tag)
    Ld['info']['pivot'] = [float(c) for c in Ld['pivot']]; Ld['info']['hinge_blender'] = [round(float(c), 5) for c in hinge(tag)]
    return Ld
def dry_shots(out, U):
    """the trial L lid in flat magenta at the blink's middle angles, turned about the game hinge, from the look camera's views"""
    os.makedirs(out, exist_ok=True); sc_ = bpy.context.scene
    lid = bpy.data.objects['Stella_lidU_L']; m = bpy.data.materials.new('dry_lid'); m.diffuse_color = (1, 0, 1, 1)
    lid.data.materials.clear(); lid.data.materials.append(m)
    for o in sc_.objects:
        if o.type == 'MESH' and o.name.startswith('Stella_lidD'): o.hide_render = True
    sc_.render.engine = 'BLENDER_WORKBENCH'; sh = sc_.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'
    sc_.view_settings.view_transform = 'Standard'; sc_.render.resolution_x = sc_.render.resolution_y = 360
    cam = bpy.data.objects.new('dry_cam', bpy.data.cameras.new('dry_cam')); sc_.collection.objects.link(cam); sc_.camera = cam
    cam.data.lens = 520; piv = Vector(U['pivot']); k = Vector(hinge('L')); M0 = lid.matrix_world.copy()
    tg = Vector(ns['eye_centers']['L'])
    for a in [float(v) for v in os.environ.get('DRY_ANGLES', '.366,.6,.732,.85,1.037').split(',')]:
        lid.matrix_world = Matrix.Translation(piv) @ Matrix.Rotation(a, 4, k) @ Matrix.Translation(-piv) @ M0
        for yaw, el in ((45, 20), (-45, 20), (0, 20)):
            e_, y_ = math.radians(el), math.radians(yaw); d = Vector((math.sin(y_) * math.cos(e_), -math.cos(y_) * math.cos(e_), math.sin(e_)))
            cam.location = tg + d * 4.0; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
            sc_.render.filepath = os.path.join(out, 'dry_%.3f_%+d.png' % (a, yaw)); bpy.ops.render.render(write_still=True)
    lid.matrix_world = M0
R_CAND = [float(v) for v in np.linspace(.12, .26, 15)]
for tag in 'LR':
    enter(tag)
    scores = []
    for R in R_CAND:
        st = upper_lid(tag, R, nx=9, build=False)
        scores.append((abs(st['cov'] - .28) + (0 if st['rest_margin_rad'] > .10 else 1 + (.10 - st['rest_margin_rad']) * 10), R, st))
    sc_, Rb, st = min(scores, key=lambda t: t[0])
    if os.environ.get('LID_R', '.12' if MID_FIX else ''): Rb = float(os.environ.get('LID_R', '.12')); st = upper_lid(tag, Rb, nx=9, build=False)
    print('LID_R', tag, Rb, json.dumps({k: round(float(v), 4) for k, v in st.items()}), flush=True)
    U = upper_lid(tag, Rb, nx=int(os.environ.get('LIDU_NX', '27')))
    D_ = lower_lid_front(tag)
    leave(); U = lid_to_world(U, tag); D_ = lid_to_world(D_, tag)
    make_lid('Stella_lidU_' + tag, U, 'lidU', 'lidU_' + tag); P['lidU_' + tag] = tuple(float(c) for c in U['pivot']); lid_info['lidU_' + tag] = U['info']
    make_lid('Stella_lidD_' + tag, D_, 'lidD', 'lidD_' + tag); P['lidD_' + tag] = tuple(float(c) for c in D_['pivot']); lid_info['lidD_' + tag] = D_['info']
    if tag == 'L': LID_PAINT['lidU'] = U; LID_PAINT['lidD'] = D_
    print('LIDS', tag, json.dumps(lid_info['lidU_' + tag]), json.dumps(lid_info['lidD_' + tag]), flush=True)
    if os.environ.get('LID_DRY') == '1':                   # a lid trial: the L lid's numbers (and LID_DRY_SHOTS: renders), no rig files
        if os.environ.get('LID_DRY_SHOTS'): dry_shots(os.environ['LID_DRY_SHOTS'], U)
        print('LID_DRY_DONE', flush=True); sys.stdout.flush(); os._exit(0)

LASH_EDGE = [float(v) for v in os.environ.get('LASH_EDGE', '.0055,.0085').split(',')]; LASH_W = float(os.environ.get('LASH_W', '.060')); WING = float(os.environ.get('WING', '1'))
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, L in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        Uu, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        G = L['Pc']; A = L['arc']; rows = L['rows']; nc = G.shape[0]
        fi = Uu * (nc - 1); i0 = np.clip(np.floor(fi).astype(int), 0, nc - 2); a = fi - i0
        j0 = np.clip(np.searchsorted(rows, Vv, side='right') - 1, 0, len(rows) - 2); b = (Vv - rows[j0]) / (rows[j0 + 1] - rows[j0])
        def bil(Fv):
            Fv = np.asarray(Fv); e = (Ellipsis,) + (None,) * (Fv.ndim - 2)
            return (Fv[i0, j0] * ((1 - a) * (1 - b))[e] + Fv[i0 + 1, j0] * (a * (1 - b))[e] + Fv[i0, j0 + 1] * ((1 - a) * b)[e] + Fv[i0 + 1, j0 + 1] * (a * b)[e])
        Pp = bil(G).reshape(-1, 3); arc = bil(A).reshape(-1)
        d = Pp - np.array(ns['O']); d /= np.linalg.norm(d, axis=1, keepdims=True)
        uv = ns['head_uv'](d)
        ns['PAINT_OPTS']['lash'] = False
        Cs = np.asarray(ns['paint_head'](uv[:, 0], uv[:, 1])).reshape(-1, 3)
        psr = np.linspace(0, 2 * math.pi, 96, endpoint=False); ring = ns['eye_pts'](1, psr, 1.12)
        rd = ring - np.array(ns['O']); rd /= np.linalg.norm(rd, axis=1, keepdims=True); ruv = ns['head_uv'](rd)
        RC = np.asarray(ns['paint_head'](ruv[:, 0], ruv[:, 1])).reshape(-1, 3)
        ns['PAINT_OPTS']['lash'] = True
        F_ = ns['EYEF'][1]; dd = Pp - F_['Sc']; X2 = dd @ F_['eo']; Z2 = dd @ F_['ev']
        rX = (ring - F_['Sc']) @ F_['eo']; rZ = (ring - F_['Sc']) @ F_['ev']
        wr = 1 / (((X2[:, None] - rX[None]) ** 2 + (Z2[:, None] - rZ[None]) ** 2) + 1e-7) ** 1.5
        CS = (wr[..., None] * RC[None]).sum(1) / wr.sum(1)[:, None]
        sr_, psi_, Xs_, Zs_ = ns['eye_s3'](1, Pp); sr_ = np.asarray(sr_); Zs_ = np.asarray(Zs_); Xs_ = np.asarray(Xs_)
        C = mix(CS, Cs, smooth(1.03, 1.14, sr_))
        if chart == 'lidU':
            # the closed-eye lash: one soft U just inside the visible lower rim (thickest at the centre, tapering to the corners),
            # with the little wing at the outer corner (X > 0: her outer side on the L lid; the R lid mirrors the chart)
            ax_ = np.clip(np.abs(Xs_), 0, 1); wth = .025 + LASH_W * (1 - ax_ ** 2) ** .8
            lash = (1 - smooth(1.035, 1.06, sr_)) * smooth(1 - wth - .012, 1 - wth + .004, sr_) * smooth(.25, -.15, Zs_)
            lash = lash * (1 - smooth(.016, .022, arc))
            if MID_FIX:
                # (the mid-blink: the shell's own edge rows, a few mm below the closed lash, showed as a pale strip under it;
                # the lash runs on down to the edge, which lies at or under the lower rim when closed)
                lash = np.maximum(lash, (1 - smooth(LASH_EDGE[0], LASH_EDGE[1], arc)) * smooth(.25, -.15, Zs_) * (1 - smooth(.90, 1.02, ax_)))
            # the wing: a short tapered flick from the outer end of the U, up and out (in the eye plane's coordinates)
            tt = np.linspace(0, 1, 9); Pw = np.stack([.82 + .26 * tt, -.30 + .38 * tt ** 1.2], -1); hw = .070 * (1 - .85 * tt)
            wing = ns['stroke'](Xs_, Zs_, Pw, hw, .02) * WING * (1 - smooth(.0075, .0125, arc))
            srE_c = np.asarray(ns['eye_s3'](1, np.asarray(G[:, 0], float))[0]).reshape(-1)       # each column's lid edge, closed: how far out of the rim
            srE = srE_c[i0] * (1 - a) + srE_c[np.minimum(i0 + 1, nc - 1)] * a
            edge_ln = (1 - smooth(.0016, .0030, arc)) * (1 - smooth(.86, 1.0, np.abs(Xs_))) * (1 - smooth(1.05, 1.12, srE.reshape(-1)))
            C = mix(C, rgb('lash'), np.clip(np.maximum(.95 * lash, .95 * wing) + .85 * edge_ln * smooth(.2, -.2, Zs_), 0, 1))
        else:
            C = mix(C, rgb('lash'), .55 * np.exp(-((arc - .0006) / .0010) ** 2))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C.reshape(h, w, 3), 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'stella-toy_rig_atlas.png'); ns['write_png'](path, a8)
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- weights: the face
CUT = .94 * MHW
LIP_SX, LIP_SZ = float(os.environ.get('LIP_SX', '.045')), float(os.environ.get('LIP_SZ', '.040'))
def lip_w(x, z): return .85 * math.exp(-((abs(x) - MHW) / (LIP_SX * W)) ** 2 - ((z - CORNER_Z) / (LIP_SZ * W)) ** 2)
D_JAW = float(os.environ.get('D_JAW', '.085'))       # W: the lower lip's drop at full jaw weight at jaw +0.42
def lip_travel(xl):
    """the lower lip edge's share of the jaw's drop across the mouth: the open edge becomes a rounded D (deepest at the centre,
    sealed at the corners) under the 'w' of the upper lip, instead of the 'w' dropped whole"""
    t = min(abs(xl) / MA_X, 1.)
    ze = float(mouth_arch(np.array([t]))[0, 1]); z_open = Z_K - (Z_K - (Z_C - D_JAW)) * (1 - t * t) ** .8
    return float(np.clip((ze - z_open) / D_JAW, 0, 1))
JAW_BACK0, JAW_BACK1 = float(os.environ.get('JAW_BACK0', '.28')), float(os.environ.get('JAW_BACK1', '.46'))
def jaw_w(x, y, z, kind):
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - NOSE_TIP_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.006 * W, .010 * W, z - float(arch_z_m(x)))
    we = sm(.74 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.26, .40, abs(xl)); back = 1 - sm(JAW_BACK0, JAW_BACK1, b)      # the lower lip and the chin; soft falloffs into the cheeks and the throat
    base = below * lat * back * (1 - sm(Z_K + .010, Z_K + .050, zl))
    near = 1 - sm(.010 * W, .080 * W, float(arch_z_m(x)) - z)            # the profile at the lip, fading out down the chin
    chin = 1 - .40 * sm(.06, -.04, zl)                                    # the chin's underside (over the pearls) a little less
    return base * (lip_travel(xl) * near + (1 - near) * chin)
def head_kind(i, p):
    if i in LOWER_DUPS: return 'lower'
    if i in PART_SET: return 'upper'
    x, y, z = p
    return 'lower' if (z < float(arch_z_m(x)) and abs(x) < CUT and y < HY - .10) else 'upper'
PART_SET = set(part_ids)
NECK_Z0, NECK_Z1 = float(os.environ.get('NECK_Z0', '.03')), float(os.environ.get('NECK_Z1', '-.12'))
PEARL_C = []
for o_ in base_objects:
    if o_.name == 'Stella_body':
        V_ = np.array([list(v.co) for v in o_.data.vertices]); lab_ = labels[o_.name]
        for L_ in sorted(set(l for l in lab_ if l.startswith('pearl.'))):
            m_ = np.array([l == L_ for l in lab_]); c_ = V_[m_].mean(0); PEARL_C.append((c_, float(np.linalg.norm(V_[m_] - c_, axis=1).max())))
PEARL_NEAR0, PEARL_NEAR1 = float(os.environ.get('PEARL_NEAR0', '.008')), float(os.environ.get('PEARL_NEAR1', '.045'))
def pearl_near(p):
    d = min(float(np.linalg.norm(np.array(p) - c_)) - r_ for c_, r_ in PEARL_C); return 1 - sm(PEARL_NEAR0, PEARL_NEAR1, d)
def face_weights(p, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    pn = pearl_near(p) * sm(.20, .02, zl)
    jw = jaw_w(x, y, z, kind) * (1 - .85 * pn)
    neck = max(sm(NECK_Z0, NECK_Z1, zl) * (.55 + .45 * sm(.30, .55, b)), .90 * pn)      # the throat and the nape blend into the neck (the collar); the skin over the pearls goes with them
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
EAR_KD = {}
for t_ in 'LR':
    gp, gv = EGRID[t_]; kd = KDTree(len(gp))
    for i_, p_ in enumerate(gp): kd.insert(Vector(p_), i_)
    kd.balance(); EAR_KD[t_] = (kd, gv)
EAR_HD0, EAR_HD1 = float(os.environ.get('EAR_HD0', '.03')), float(os.environ.get('EAR_HD1', '.14'))
def ear_weights(p, side):
    kd, gv = EAR_KD[side]; co, idx, dist = kd.find(Vector(p)); v = float(gv[idx])
    hd = 1 - sm(EAR_HD0, EAR_HD1, v)                      # the root pressed onto the skull follows the head
    tip = sm(EAR_V_FOLD - .09, EAR_V_FOLD + .11, v)      # the hanging lobe swings on earTip, a smooth blend across the fold
    mv = 1 - hd
    return {'head': hd, 'ear_' + side: mv * (1 - tip), 'earTip_' + side: mv * tip}

# ---------------------------------------------------------------- weights: the body and the costume
ZH, ZS, ZC = P['hips'][2], P['spine'][2], P['chest'][2]
def torso(z):
    h_ = 1 - sm(ZH + .04, ZS + .02, z); c_ = sm(ZS + .03, ZC + .03, z); return h_, (1 - h_) * (1 - c_), (1 - h_) * c_
def arm_t(p, t_):
    sh = np.array(P['upperarm_' + t_]); wr_ = np.array(P['hand_' + t_]); d = wr_ - sh
    return float((np.array(p) - sh) @ d / (d @ d))
T_EL = {t: arm_t(P['forearm_' + t], t) for t in 'LR'}
def limb_arm(p, t_):
    t = arm_t(p, t_); te = T_EL[t_]
    ch = .55 * (1 - sm(-.10, .06, t)); fo = sm(te - .07, te + .07, t); ha = sm(.98, 1.06, t)
    return {'chest': ch, 'upperarm_' + t_: (1 - ch) * (1 - fo), 'forearm_' + t_: (1 - ch) * fo * (1 - ha), 'hand_' + t_: (1 - ch) * fo * ha}
SLV_CH = float(os.environ.get('SLV_CH', '.45'))
def sleeve_weights(p, t_):
    t = arm_t(p, t_); te = T_EL[t_]
    ch = SLV_CH * (1 - sm(-.20, .02, t))                  # the sleeve's root (tucked in the robe top's shoulder) stays with the chest
    fo = .80 * sm(te - .05, te + .25, t)                  # toward the cuff the bell follows the forearm
    return {'chest': ch, 'upperarm_' + t_: (1 - ch) * (1 - fo), 'forearm_' + t_: (1 - ch) * fo}
def arm_weights(p, lab, t_):
    t = arm_t(p, t_)
    if lab.startswith('mitten_paw'):
        fo = 1 - sm(.96, 1.04, t); return {'hand_' + t_: 1 - fo * .6, 'forearm_' + t_: fo * .6}
    return limb_arm(p, t_)
def leg_t(p, t_):
    hp = np.array(P['thigh_' + t_]); an = np.array(P['foot_' + t_]); d = an - hp
    return float((np.array(p) - hp) @ d / (d @ d))
T_KN = {t: leg_t(P['shin_' + t], t) for t in 'LR'}
def leg_weights(p, t_):
    t = leg_t(p, t_); tk = T_KN[t_]
    hp = max(.80 * (1 - sm(-.12, .30, t)), LEG_HIPS * sm(.30, .75, t)); sh = sm(tk - .08, tk + .08, t); ft = sm(.97, 1.08, t)
    return {'hips': hp, 'thigh_' + t_: (1 - hp) * (1 - sh), 'shin_' + t_: (1 - hp) * sh * (1 - ft), 'foot_' + t_: (1 - hp) * sh * ft}
LEG_HIPS = float(os.environ.get('LEG_HIPS', '.28'))
# the bell skirts: hips, the front and side panels partly following the thighs (0 at the waist, SK_K at the hem); one field in
# space for every layer, so the layers move together and never cross
SK_FRONT, SK_SIDE, SK_BACK = float(os.environ.get('SK_FRONT', '.45')), float(os.environ.get('SK_SIDE', '.34')), float(os.environ.get('SK_BACK', '.42'))
SK_Z0, SK_Z1, SK_P = float(os.environ.get('SK_Z0', '.47')), float(os.environ.get('SK_Z1', '.10')), float(os.environ.get('SK_P', '1.0'))
def skirt_amount(x, y, z):
    ang = math.degrees(math.atan2(abs(x), -(y - RCY)))   # 0 at the front, 90 at the side, 180 at the back
    k = np.interp(ang, [0, 60, 100, 150, 180], [SK_FRONT, SK_FRONT * .92, SK_SIDE, SK_BACK, SK_BACK])
    return float(k) * sm(SK_Z0, SK_Z1, z) ** SK_P
def thighs_split(x, amt):
    l_ = sm(-.07, .07, x); return {'thigh_L': amt * l_, 'thigh_R': amt * (1 - l_)}
def skirt_weights(p):
    x, y, z = p; a = skirt_amount(x, y, z); h_, sp_, c_ = torso(z)
    w = {'hips': (1 - a) * (h_ + c_ * 0) + (1 - a) * c_, 'spine': (1 - a) * sp_}
    for k, v in thighs_split(x, a).items(): w[k] = v
    return w
def pearl_weights(lab):
    return {'chest': .62, 'neck': .38}                   # rigid: every pearl stays round, on the chest and the neck
CENTRES = {}
def obj_label_centres(o):
    lab = labels[o.name]; V = np.array([list(v.co) for v in o.data.vertices]); out = {}
    for L_ in set(lab):
        m = np.array([l == L_ for l in lab]); out[L_] = V[m].mean(0)
    return out
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab == 'robe_top':
        h_, sp_, c_ = torso(z)
        armw = .32 * sm(.11, .17, abs(x)) * sm(ZC + .01, ZC + .07, z)      # the shoulders lift a little with the arms
        nk = .30 * sm(.66, .70, z) * (1 - sm(.06, .12, abs(x)))
        return {'hips': h_, 'spine': sp_, 'chest': c_ * (1 - armw) * (1 - nk), 'upperarm_' + side: c_ * armw, 'neck': c_ * (1 - armw) * nk}
    if lab.startswith('collar_band'):
        h_, sp_, c_ = torso(z); nk = .35 * sm(.64, .70, z)
        return {'hips': h_, 'spine': sp_, 'chest': c_ * (1 - nk), 'neck': c_ * nk}
    if lab.startswith('pearl.'): return pearl_weights(lab)
    if lab in ('obi', 'obi_knot') or lab.startswith('seaglass_bead'): return {'spine': .60, 'hips': .40}
    if lab.startswith('fur_leg'): return leg_weights(p, lab[-1])
    if lab.startswith('fur_foot'):
        t_ = lab[-1]; sh = .30 * sm(.07, .12, z); return {'foot_' + t_: (1 - sh) * (1 - LEG_HIPS), 'shin_' + t_: sh * (1 - LEG_HIPS), 'hips': LEG_HIPS}
    if lab == 'hips':
        th = .45 * sm(.05, .17, abs(x)) * sm(.37, .28, z)
        return {'hips': 1 - th, 'thigh_' + side: th}
    DEFAULTED.add(lab); return {'spine': 1}
DEFAULTED = set()
def obi_tail_weights(p):
    x, y, z = p; a = skirt_amount(x, y, z) * 1.05; top = sm(.50, .42, z)
    w = {'spine': (1 - top) * .6, 'hips': (1 - top) * .4 + top * (1 - a)}
    for k, v in thighs_split(x, top * a).items(): w[k] = v
    return w
def bow_weights(p, lab):
    x, y, z = p
    if lab.startswith('bow_tail'):
        lo = sm(.47, .33, z); a = skirt_amount(x, y, z) * lo
        w = {'spine': (1 - lo) * .55 + .0, 'chest': (1 - lo) * .45, 'hips': lo * (1 - a)}
        for k, v in thighs_split(x, a).items(): w[k] = v
        return w
    return {'chest': .45, 'spine': .55}                   # the loops and the knot: rigid
TAIL_CUM = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(TP, axis=0), axis=1))]); TS = TAIL_CUM / TAIL_CUM[-1]
TB_S = np.array([TS[i] for i in TAIL_IDX])
def tail_weights(p):
    d = np.linalg.norm(TP - np.array(p), axis=1); k = int(np.argmin(d)); s = TS[k]
    if k == 0:                                        # the root cap: by its own position along the start tangent
        t0 = unit(TP[1] - TP[0]); s = max(0., float((np.array(p) - TP[0]) @ t0) / TAIL_CUM[-1])
    w = {}
    for i in range(4):
        a = TB_S[i]; b = TB_S[i + 1] if i < 3 else 1.01
        if a <= s < b:
            f = (s - a) / (b - a); blend = sm(.65, 1.0, f) if i < 3 else 0.
            w['tail%d' % (i + 1)] = 1 - blend
            if i < 3: w['tail%d' % (i + 2)] = blend
    if not w: w = {'tail1': 1.} if s < TB_S[0] else {'tail4': 1.}
    hips = 1 - sm(TB_S[0] - .06, TB_S[0] + .02, s)       # the stem under the skirt stays with the pelvis
    out = {k_: v * (1 - hips) for k_, v in w.items()}; out['hips'] = out.get('hips', 0) + hips
    return out

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
adata = bpy.data.armatures.new('Stella_game_skeleton'); arm = bpy.data.objects.new('Stella_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'
arm.show_in_front = True

# ---------------------------------------------------------------- the mouth cavity and tongue (behind the parting; Floofy's construction)
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def skin_front(x, z):
    y = ray_y(skin_tree, x, z); return y if y is not None else float(front_hit(x, z)[0])
CAV_UP, CAV_DN, CAV_DEPTH = float(os.environ.get('CAV_UP', '.016')), float(os.environ.get('CAV_DN', '.110')), float(os.environ.get('CAV_DEPTH', '.160'))
cav_v = []; cav_w = []; cav_f = []; D = 3; n = len(rim)
up_w = [face_weights(HV[i], 'upper') for i in part_ids]
lo_w = [face_weights(HV[j], 'lower') for j in rim_lower_ids]
for level in ('upper', 'lower'):
    for j in range(D + 1):
        t = j / D
        for k, (x, y, z) in enumerate(rim):
            corner = max(1 - sm(.74 * CUT, CUT, abs(x)), .25)
            pz = z + (CAV_UP * W if level == 'upper' else -CAV_DN * W) * math.sin(t * math.pi * .5) * corner
            py = y + .0015 * (j > 0) + CAV_DEPTH * W * t * (.35 + .65 * corner)
            px = x * (1 - .10 * t)
            if j: py = max(py, skin_front(px, pz) + .005)
            cav_v.append((px, py, pz))
            sd = 'L' if x >= 0 else 'R'
            if level == 'upper': ww = {'head': 1 - up_w[k]['lip_' + sd], 'lip_' + sd: up_w[k]['lip_' + sd]}
            else: ww = dict(lo_w[k])
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
C_IN = np.array([0, rim[len(rim) // 2][1] + .06, MZ - .02 * W])
for i_, p_ in enumerate(cav_v):
    pv_ = np.array(p_)
    if float(head_sdf(pv_[None])[0]) > -.003 and i_ >= n and not ((D + 1) * n <= i_ < (D + 2) * n):   # (the rim rows stay on the parting)
        lo_, hi_ = 0., 1.
        for _ in range(24):
            m_ = (lo_ + hi_) / 2; q_ = pv_ + (C_IN - pv_) * m_
            if float(head_sdf(q_[None])[0]) < -.003: hi_ = m_
            else: lo_ = m_
        cav_v[i_] = tuple(pv_ + (C_IN - pv_) * hi_)
mouth = make_mesh('Stella_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bad_ = [f for f in bm.faces if f.calc_area() < 1e-10]
if bad_: bmesh.ops.delete(bm, geom=bad_, context='FACES_ONLY')
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZ - .03 * W))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()
bm.to_mesh(mouth.data); bm.free()
TONGUE_Y, TONGUE_Z = float(os.environ.get('TONGUE_Y', '.050')), float(os.environ.get('TONGUE_Z', '-.070'))
tongue_c = np.array([0, rim[len(rim) // 2][1] + TONGUE_Y, MZ + TONGUE_Z * W])
ns['parts']['_tongue'] = []
tongue = ns['lobe']('Stella_tongue', tongue_c, np.array([.014, .040, .080]) * W, [0, 0, 1.], '_tongue', ramp='eyedark', n=3, occ_in=0, pole=[1., 0, 0])
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)
tongue.data.materials.clear(); tongue.data.materials.append(MAT)
if tongue.data.attributes.get('cust_n') is not None: tongue.data.attributes.remove(tongue.data.attributes['cust_n'])

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
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]
    if o.name == 'Stella_head': weights = [face_weights(p, head_kind(i, p)) for i, p in enumerate(pp)]
    elif o.name.startswith('Stella_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Stella_ear_'): weights = [ear_weights(p, o.name[-1]) for p in pp]
    elif o.name.startswith('Stella_arm_'): weights = [arm_weights(p, l, o.name[-1]) for p, l in zip(pp, lab)]
    elif o.name.startswith('Stella_sleeve_'): weights = [sleeve_weights(p, o.name[-1]) for p in pp]
    elif o.name == 'Stella_tail': weights = [tail_weights(p) for p in pp]
    elif o.name.startswith('Stella_skirt_'): weights = [skirt_weights(p) for p in pp]
    elif o.name == 'Stella_obi_tails': weights = [obi_tail_weights(p) for p in pp]
    elif o.name == 'Stella_bow': weights = [bow_weights(p, l) for p, l in zip(pp, lab)]
    elif o.name == 'Stella_body':
        cen_ = obj_label_centres(o)
        weights = [body_weights(tuple(cen_[l]) if l.startswith(('pearl.', 'seaglass_bead', 'obi_knot')) else p, l) for p, l in zip(pp, lab)]
    else: DEFAULTED.add(o.name); weights = [{'spine': 1} for p in pp]
    bind(o, weights); objects.append(o)
bind(mouth, cav_w); bind(tongue, [{'jaw': 1} for v in tongue.data.vertices]); objects += [mouth, tongue]
labels['Stella_mouth_cavity'] = ['mouth_cavity'] * len(mouth.data.vertices); labels['Stella_tongue'] = ['tongue'] * len(tongue.data.vertices)
for o, b in lid_objects:
    bind(o, [{b: 1} for v in o.data.vertices]); objects.append(o); labels[o.name] = [b] * len(o.data.vertices)

# ---------------------------------------------------------------- outward winding (as Foosy's): faces whose winding disagrees with their shading normals are re-wound
REWOUND = {}
def tri_reversed(o):
    me = o.data; me.calc_loop_triangles(); cn = [Vector(l.vector) for l in me.corner_normals]; n_ = 0
    for t in me.loop_triangles:
        if t.area > 1e-12 and t.normal.dot(sum((cn[l] for l in t.loops), Vector()).normalized()) < -.2: n_ += 1
    return n_
for o in objects:
    if tri_reversed(o):
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        m = o.modifiers.new('tri', 'TRIANGULATE'); m.keep_custom_normals = True; m.quad_method = 'FIXED'; m.ngon_method = 'BEAUTY'
        bpy.ops.object.modifier_move_to_index(modifier='tri', index=0); bpy.ops.object.modifier_apply(modifier='tri')
for o in objects:
    me = o.data; cn = [tuple(l.vector) for l in me.corner_normals]
    keep = {}; flip = []
    for p in me.polygons:
        nv = Vector((0, 0, 0))
        for l in p.loop_indices: keep[(p.index, me.loops[l].vertex_index)] = cn[l]; nv += Vector(cn[l])
        if p.normal.dot(nv.normalized()) < -.2: flip.append(p.index)
    if not flip: continue
    for i in flip: me.polygons[i].flip()
    me.update()
    me.normals_split_custom_set([keep[(p.index, me.loops[l].vertex_index)] for p in me.polygons for l in p.loop_indices])
    REWOUND[o.name] = len(flip)
print('REWOUND', json.dumps(REWOUND), flush=True)

# ---------------------------------------------------------------- the parasol mount (the parasol stays its own prop: public/models/stella-parasol.glb)
PM = json.loads((ROOT / 'prop_mount.json').read_text())['stella-parasol.glb']
grip = {}
for t_ in 'RL':
    palm = np.array(ARMJ[t_]['palm']); hand = np.array(P['hand_' + t_]); sh = np.array(P['upperarm_' + t_])
    ad = unit(hand - sh); fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
    grip[t_] = {'bone': 'hand_' + t_, 'hand_head_game': g3(hand), 'palm_centre_game': g3(palm), 'palm_offset_in_hand_frame_game': g3(palm - hand),
                'fist_axis_game': g3(fwd), 'arm_axis_game': g3(ad)}
def quat_from_to(a, b):
    a = unit(np.asarray(a, float)); b = unit(np.asarray(b, float)); q = Vector(a).rotation_difference(Vector(b)); return [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)]
chest = np.array(P['chest']); shR = np.array(P['upperarm_R']); elR = np.array(P['forearm_R'])
def Rx(a): c, s_ = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s_], [0, s_, c]])
def Ry(a): c, s_ = math.cos(a), math.sin(a); return np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]])
def Rz(a): c, s_ = math.cos(a), math.sin(a); return np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1]])
def game_R(gx, gy, gz): return Rx(gx) @ Rz(gy) @ Ry(-gz)                # the game's joint rotation in Blender axes (rig_tests.py)
Cg = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]])                       # Blender -> game for vectors
def quat_of(Rb):                                                        # a rotation (Blender axes) -> the game-axes quaternion
    q = Matrix((Cg @ Rb @ Cg.T).tolist()).to_quaternion(); return [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)]
def frame_to(axis_b, side_hint=(1., 0, 0)):
    """a rotation (Blender axes) taking the prop's shaft (Blender +Z, its glTF up) onto axis_b, its +X kept close to side_hint"""
    zb = unit(np.asarray(axis_b, float)); xb = np.asarray(side_hint, float); xb = unit(xb - zb * (xb @ zb)); yb = np.cross(zb, xb)
    return np.stack([xb, yb, zb], 1)
palmR = np.array(ARMJ['R']['palm']); handR = np.array(P['hand_R'])
# the cast: right upper arm -2.4 X (plus the neutral -0.12 Z): the wagasa raised over her head, leaning out and back about 30
# deg (measured, scratch/diag_carry2.py --cast): the old lean (-0.12, 0.10, 1) cut the canopy into her crown and hid a third
# of her face from the right 45 deg yaw; this one covers none of it from yaws 0 to +-45 (1.3% at -60) and clears the head
R_cast = game_R(-2.4, 0, -.12); CAST_AXIS = unit(np.array([float(v) for v in os.environ.get('CAST_LEAN', '-.35,.45,1').split(',')]))
q_cast = quat_of(R_cast.T @ frame_to(CAST_AXIS, (1, 0, 0)))
# the carry: the paw raised beside her right shoulder (upper arm -0.55 X, forearm -1.0 X), the wagasa leaning back and out
# past the shoulder, the canopy behind her head. The direction is measured (scratch/diag_carry2.py): tilt 65 deg from
# vertical, heading 50 deg from straight back toward her right. With the 0.8 m sun wagasa, any shaft that rests on the
# shoulder (heading inward) cuts the canopy through her head or right ear; this one covers none of her face from yaws 0,
# +-30, +-45, +-60, +-90, and clears the right ear by 88 mm at rest and >= 15 mm at the game's head-turn / ear-swing extremes.
CARRY_UP, CARRY_FORE = (-.55, 0, -.10), (-1.0, 0, 0)
R1 = game_R(*CARRY_UP); R2 = game_R(*CARRY_FORE)
def carry_pt(p): p = np.asarray(p, float); return shR + R1 @ ((elR - shR) + R2 @ (p - elR))
grip_w = carry_pt(palmR)                                                 # the palm (the grip) in the carry pose
CARRY_TILT, CARRY_HEADING = (float(v) for v in os.environ.get('CARRY_DIR', '65,50').split(','))    # degrees: from vertical; from straight back toward her right
_t, _h = math.radians(CARRY_TILT), math.radians(CARRY_HEADING)
CARRY_AXIS = unit(np.array([-math.sin(_t) * math.sin(_h), math.sin(_t) * math.cos(_h), math.cos(_t)]))
R_carry = frame_to(CARRY_AXIS, (1, 0, 0))
q_carry_hand = quat_of((R1 @ R2).T @ R_carry); q_carry_chest = quat_of(R_carry)
PROP = {'units': 'metres; game axes [x, y, z] = Blender [x, z, -y]; the game rebuilds bones without rotation, so a bone frame is the model frame translated to the bone head',
        'parasol': {'prop': '/models/stella-parasol.glb (the sun wagasa)', 'prop_axis': 'the shaft runs along the prop\'s +Y (game), the canopy at +Y; origin = the grip, just above the hooked handle',
                    'grip_radius_m': PM['grip_radius_m'], 'canopy_top_prop_y_m': PM.get('top_game', PM.get('top_pearl_game'))[1], 'hook_bottom_prop_y_m': PM['hook_bottom_blender'][2],
                    'finial_prop_game': PM.get('finial_game'), 'canopy_across_m': PM.get('canopy_across_m'),
                    'in_right_paw': {'bone': 'hand_R', 'position_in_bone_frame': grip['R']['palm_offset_in_hand_frame_game'],
                                     'upright_quaternion_xyzw': [0, 0, 0, 1],
                                     'cast_quaternion_xyzw': q_cast,
                                     'note': 'quaternions map the prop\'s game axes into the hand bone\'s frame (bones carry no rest rotation). upright: the shaft vertical with the arm at rest; cast: with the right upper arm at (-2.4, 0, -0.12) the wagasa is raised over her head, leaning about 30 deg out and back (the canopy clear of her face from yaws 0 to +-45)'},
                    'carry_over_shoulder': {'pose': {'upperarm_R': list(CARRY_UP), 'forearm_R': list(CARRY_FORE)},
                                            'in_hand_R': {'position_in_bone_frame': grip['R']['palm_offset_in_hand_frame_game'], 'quaternion_xyzw': q_carry_hand},
                                            'or_on_chest': {'bone': 'chest', 'position_in_bone_frame': g3(grip_w - chest), 'position_model_game': g3(grip_w), 'quaternion_xyzw': q_carry_chest},
                                            'shaft_axis_game': g3(CARRY_AXIS),
                                            'carry_direction_deg': {'tilt_from_vertical': CARRY_TILT, 'heading_from_back_toward_right': CARRY_HEADING},
                                            'note': 'walking: the paw beside her right shoulder holds the grip; the wagasa leans back and out past the shoulder, the canopy behind her head (none of her face covered from yaws 0 to +-90 at 45 deg elevation; the right ear cleared by 88 mm at rest). Use in_hand_R while the arm holds the pose, or the chest mount if the arm keeps swinging (the paw then floats near the grip)'}},
        'palms': grip}
(ROOT / 'prop_mount.rig.json').write_text(json.dumps(PROP, indent=2))

# ---------------------------------------------------------------- checks and save
total = 0
for o in objects:
    o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
    assert len(o.modifiers) == 1 and o.modifiers[0].type == 'ARMATURE', o.name
    for v in o.data.vertices: assert 1 <= len(v.groups) <= 4 and abs(sum(g.weight for g in v.groups) - 1) < 1e-6, (o.name, v.index)
print('DEFAULTED_LABELS', sorted(DEFAULTED), flush=True)
print('TRI_TOTAL', total, flush=True); assert total <= 34000, total
hidden = {}
for o, bname in lid_objects:
    piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for a in ([0.0] if bname.startswith('lidU') else [0.0, NEU_D]):
        sd = head_sdf(rot_axis(V, piv, hinge(bname[-1]), a)); hidden[f'{o.name}@{a}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0003).sum())}
RIM_LOC = {t: to_local(np.array([ns['verts'][i] for i in ns['roll_info'][1 if t == 'L' else -1][0]]), t)[:, [0, 2]] for t in 'LR'}
for o, bname in lid_objects:
    if not bname.startswith('lidU'): continue
    t_ = bname[-1]; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for a in (.3, .45, .6, .75, .9, 1.05):
        Va = rot_axis(V, piv, hinge(t_), a); over = in_poly2(to_local(Va, t_)[:, [0, 2]], RIM_LOC[t_]); sd = head_sdf(Va)[~over]
        hidden[f'{o.name}@blink {a}'] = {'max_sdf_outside_opening_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0003).sum())}
occ_pts = [v.co[:] for v in head.data.vertices]; occ_tris = [tuple(t.vertices) for t in head.data.loop_triangles]
for nm in ('Stella_eye_L', 'Stella_eye_R', 'Stella_ear_L', 'Stella_ear_R', 'Stella_tongue', 'Stella_mouth_cavity'):
    e = bpy.data.objects[nm]; e.data.calc_loop_triangles(); b0 = len(occ_pts); occ_pts += [v.co[:] for v in e.data.vertices]
    occ_tris += [tuple(b0 + i for i in t.vertices) for t in e.data.loop_triangles]
occ = BVHTree.FromPolygons(occ_pts, occ_tris)
VIEWS = {'front': Vector((0, -1, 0)), 'game+45': Vector((.5, -.5, .7071)), 'game-45': Vector((-.5, -.5, .7071)), 'below': Vector((0, -.9, -.44)).normalized()}
def seen(V):
    return {k_: sum(1 for p in V if occ.ray_cast(Vector(p) + d_ * .0005, d_, 3)[0] is None) for k_, d_ in VIEWS.items()}
for o, bname in lid_objects:
    piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for a in ([0.0] if bname.startswith('lidU') else [0.0, NEU_D]):
        hidden[f'{o.name}@{a}']['seen_by_rays'] = seen(rot_axis(V, piv, hinge(bname[-1]), a))
for o in (mouth, tongue):
    V = np.array([list(v.co) for v in o.data.vertices]); sd = head_sdf(V)
    hidden[o.name + '@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'stella-toy_rig.blend'))
(ROOT / 'rig-part-labels.json').write_text(json.dumps({o.name: labels[o.name] for o in objects}))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]], 'head_game_m': g3(P[b])} for b in HERO],
       'triangles': total, 'lids': lid_info, 'lids_hidden_check': hidden, 'squint_designed_for': [SQ_U, SQ_D], 'lidTilt': LID_TILT, 'lid_hinge_blender': {t: [round(float(c), 5) for c in hinge(t)] for t in 'LR'},
       'mouth': {'parting_vertices': len(part_ids), 'split_vertices': len(dup_of), 'cavity_rim_points': len(rim), 'corner_z_m': round(CORNER_Z, 4)},
       'ears': {'v_root': EAR_V_ROOT, 'v_fold': EAR_V_FOLD, 'root_inward_fraction': EAR_ROOT_IN},
       'objects': {o.name: len(o.data.loop_triangles) for o in objects}, 'rewound_faces': REWOUND,
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre; neck at the collar.',
                 'Lids are rigid shells about their bone world X axis (a radius per vertex): blink +1.22 closes, +0.488 is the happy squint, lidD -0.1 neutral, -0.24 happy. Their pivots sit behind the eyes (a 13 cm opening needs an 11+ cm hinge for 1.22 rad), not at the eyeball centres.',
                 'The mouth parting was cut in the model (round 2); the lower copies are jaw-side, the corners shared (sealed). A closed cavity pocket on the parting, a tongue on its floor (jaw).',
                 'Weights quantized to an exact 255 sum; <= 4 influences. Ears: head (root) -> ear -> earTip (the hanging lobe below the fold).',
                 'The bell skirts and the obi tails follow the hips with the front / side panels partly on the thighs (one field in space for all layers).',
                 'The pearls are rigid (chest 0.62 / neck 0.38); the parasol is not part of the hero: prop_mount.rig.json.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('STELLA_RIG', json.dumps({'bones': len(HERO), 'triangles': total}), flush=True)
