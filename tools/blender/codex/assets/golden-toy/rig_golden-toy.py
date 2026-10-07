"""Golden Dragoon (golden-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_golden-toy.py

Runs build_golden-toy.py in RIG_MODE (part labels; lid charts in unused atlas space; the approved GLB, blend and json files
are not touched), then adds (after Poe's and Moka's rigs):
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - the mouth: the approved open smile already has its rolled lip, cavity sac and tongue; the jaw opens it wider (the lower
    lip, chin and the sac's lower half on `jaw`, the corners on `lip_*`);
  - eyelids: rigid shells, surfaces of revolution about their bone's X axis (radius per vertex), in the coat, sized for the
    game's own values (blink +1.22, happy +0.488 / -0.24, neutral lidD -0.1);
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum);
and saves golden-toy_rig.blend (only Armature modifiers left), joints-rig.json, rig-part-labels.json and export/prop_mount.json.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_golden-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_golden-toy.py'), '__name__': 'golden_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_golden-toy.py'), 'exec'), ns)
W, CHIN, HY, WS = ns['W'], ns['CHIN'], ns['HY'], ns['WS']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
smooth, au, MAT, M2L, L2M = ns['smooth'], ns['au'], ns['MAT'], ns['M2L'], ns['L2M']
head_sdf, skull_sdf, front_hit, grad = ns['head_sdf'], ns['skull_sdf'], ns['front_hit'], ns['grad']
unit = ns['unit']
def sm(a, b, x): return float(smooth(a, b, x))
os.makedirs(ROOT / 'export', exist_ok=True); os.makedirs(ROOT / 'scratch', exist_ok=True)
MAT.use_backface_culling = True          # as the game draws it (three.js FrontSide) and as the glTF importer shows the approved model

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
BZS = ns['BZS']; ARMJ = ns['ARM']; LEGJ = ns['LEG']
MOUTH_W = ns['MOUTH_W']; MHW = ns['MHW_'] * W; MZC = ns['MZC']
def z_top(x):            # the upper lip edge of the open smile (the parting line between head and jaw)
    t = np.clip(np.abs(np.asarray(x, float)) / MHW, 0, 1); return CHIN + W * ns['mouth_top'](t)
CORNER_Z = float(CHIN + W * MOUTH_W[:, 1].max())
neck_c = L2M(np.array(ns['NECK'][0]))
lip_front_y = float(front_hit(0., CHIN + .27 * W)[0])
P = {'root': (0, -.010, 0), 'hips': (0, .010, round(.410 * BZS, 4)), 'spine': (0, .000, round(.520 * BZS, 4)),
     'chest': (0, -.010, round(.640 * BZS, 4)), 'neck': (0, -.012, round(.800 * BZS, 4)),
     'head': (0, float(neck_c[1]) + .040, CHIN + .001),                         # the skull base: the nod pivot at the back of the neck
     'jaw': (0, lip_front_y + .22 * W, CORNER_Z - .010)}                        # the hinge inside the head, 0.22 W behind the smile
BROW_Z = CHIN + .770 * W
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * EX, float(front_hit(s * EX, BROW_Z)[0]) + .012, BROW_Z)
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW * .98, CORNER_Z)[0]) + .004, CORNER_Z)
    P['upperarm_' + tag] = tuple(ARMJ[tag]['shoulder']); P['forearm_' + tag] = tuple(ARMJ[tag]['elbow']); P['hand_' + tag] = tuple(ARMJ[tag]['wrist'])
    P['thigh_' + tag] = tuple(LEGJ[tag]['hip']); P['shin_' + tag] = tuple(LEGJ[tag]['knee']); P['foot_' + tag] = tuple(LEGJ[tag]['ankle'])
TP = np.array(ns['TAIL_PATH']); TAIL_IDX = [int(v) for v in os.environ.get('TAIL_IDX', '3,7,11,15').split(',')]
for i in range(4): P['tail%d' % (i + 1)] = tuple(float(c) for c in TP[TAIL_IDX[i]])

# ---------------------------------------------------------------- the ears: pivots where the ear leaves the helmet rim / at the fold
EGRID = {}
for tag in 'LR':
    gp, gv = ns['EAR_GRID'][tag]; EGRID[tag] = (np.array(gp), np.array(gv))
def ear_rows(tag):
    gp, gv = EGRID[tag]; nu = 19; G = gp.reshape(-1, nu, 3); Vv = gv.reshape(-1, nu); return G, Vv
EAR_V_ROOT = float(os.environ.get('EAR_V_ROOT', '.10')); EAR_V_FOLD = float(os.environ.get('EAR_V_FOLD', '.62'))
EAR_IN = float(os.environ.get('EAR_IN', '.25'))          # the ear pivots move this fraction of the way in toward the head centre (x)
TIP_ABS = [float(v) for v in os.environ.get('TIP_ABS', '-.10,.98').split(',')] if os.environ.get('TIP_ABS', '-.10,.98') else None
# (the earTip hinge sits in front of and above the flap, inside the head at brow height: a forward swing lifts the locks back
#  and up past the cheek instead of sweeping into it; measured in scratch/ear_opt2.py)
EAR_RIM_FALL = float(os.environ.get('EAR_RIM_FALL', '.20')); EAR_BACK_FALL = float(os.environ.get('EAR_BACK_FALL', '.35'))   # (W units) how far below the helmet rim the ear blends from head to ear_
EAR_K = float(os.environ.get('EAR_K', '1.0')); TIP_K = float(os.environ.get('TIP_K', '.5'))   # ... and in y / z toward the head ball's centre, so swings glide round the skull
for s, tag in ((1, 'L'), (-1, 'R')):
    G, Vv = ear_rows(tag); vmid = Vv[:, 9]
    def row_pt(v):
        k = float(np.interp(v, vmid, np.arange(len(vmid)))); k0 = int(min(k, len(vmid) - 2)); f = k - k0
        return G[k0].mean(0) * (1 - f) + G[k0 + 1].mean(0) * f              # the row's centroid across the ear's width
    cen = np.array(ns['O'])
    pr = row_pt(EAR_V_ROOT); pf = row_pt(EAR_V_FOLD)
    P['ear_' + tag] = tuple(float(c) for c in pr + (cen - pr) * np.array([EAR_IN, EAR_K, EAR_K]))
    P['earTip_' + tag] = tuple(float(c) for c in pf + (cen - pf) * np.array([EAR_IN, TIP_K, TIP_K]))
    if TIP_ABS: P['earTip_' + tag] = (P['earTip_' + tag][0], TIP_ABS[0], TIP_ABS[1])

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Golden_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Golden_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Golden_eye_' + t].data.polygons]) for t in 'LR'}
def head_nr(p):          # the head field without the eye sockets: the closed lid shades like an unbroken face
    q = M2L(p); d = ns['base_local'](q); d = ns['smin'](d, ns['ell'](q, *ns['NECK']), ns['K_NECK'])
    return ns['smin'](d, ns['nose_sdf'](q), ns['K_N']) * W
LMAX = .80
def dvec(ph): return np.stack([np.zeros_like(ph), -np.cos(ph), np.sin(ph)], -1)
def outer_mesh(tree, o, d):
    """distance from o along d to the outermost surface of the mesh (None when no hit)"""
    h = tree.ray_cast(Vector(o + d * LMAX), Vector(-d), LMAX)
    return None if h[0] is None else LMAX - h[3]
def outer_field(O_, D, f=head_sdf, steps=200, it=26, t0=.02):
    """distances from O_ (n,3) along D (n,3) to the FIRST exit from the field going outward (the nearest skin; the pivots are
    inside the head). Rays that start outside report NaN."""
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
    """for rays from (x, pivot y, pivot z) at angles phs: (sees_eye, eye_d, skin_d (field), sr, psi) arrays (len(xs), len(phs))"""
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

# ---------------------------------------------------------------- eyelids
CLOSE, SQ_U, SQ_D, NEU_D = 1.22, .488, -.24, -.10
G_OPEN = .0015; G_SKIN = .0010; SINK = .0030; HIDE = .0008; HIDE_REST = .0030; HIDE_SQ = .0020
def lash_band(psi): return np.asarray(ns['lash_th'](np.asarray(psi, float)))
def in_poly2(P2, poly):
    return ns['in_poly'](np.asarray(P2, float), np.asarray(poly, float))
def opening_columns(tag, pivot, nx):
    rim = np.array([ns['verts'][i] for i in ns['roll_info'][1 if tag == 'L' else -1][0]])
    x0, x1 = rim[:, 0].min(), rim[:, 0].max(); pad = float(os.environ.get('LID_PAD', '.015'))   # one column past each side (covers the painted ring)
    return np.linspace(x0 - pad, x1 + pad, nx), (x0, x1)
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
PIV_DZ = float(os.environ.get('PIV_DZ', '-.02')); BAND_PAD = float(os.environ.get('BAND_PAD', '.08'))
SQ_LEVEL = os.environ.get('SQ_LEVEL', '1') == '1'; SQ_COV = float(os.environ.get('SQ_COV', '.27')); SQ_RISE = .03
def upper_lid(tag, R, nx=25, rows=None, build=True):
    s = 1 if tag == 'L' else -1; F_ = ns['EYEF'][s]
    Ec = F_['Sc']; n0 = np.array(F_['ax0']); nyz = unit(np.array([0, n0[1], n0[2]]))
    pivot = np.array([Ec[0], Ec[1] - nyz[1] * R, Ec[2] - nyz[2] * R + PIV_DZ])
    xs, (x0, x1) = opening_columns(tag, pivot, nx)
    lo, hi, ok = column_intervals(tag, pivot, xs)
    edge = lo - .0030 / R                                                 # the closed edge, 3 mm below the lower outline
    if build and SQ_LEVEL:
        # the happy squint's edge is a level line across the eye (a touch higher at the outer corner): each column's closed edge is
        # set so that, rotated up to the squint, it lands on that line; it never rises above the lower outline (the blink still closes)
        rim = np.array([ns['verts'][i] for i in ns['roll_info'][s][0]]); RX, RZ = rim[:, 0], rim[:, 2]
        def cross(x):
            zz = [RZ[a] + (x - RX[a]) / (RX[b] - RX[a]) * (RZ[b] - RZ[a]) for a, b in ((i, (i + 1) % len(rim)) for i in range(len(rim))) if (RX[a] - x) * (RX[b] - x) <= 0 and RX[a] != RX[b]]
            return (min(zz), max(zz)) if zz else (None, None)
        zb_c, zt_c = cross(Ec[0]); Hc = zt_c - zb_c; half = (rim[:, 0].max() - rim[:, 0].min()) / 2
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
    top_hidden = edge[c] + CLOSE - hi[c]                                  # rad between the opening top and the lid edge at rest
    if not build: return {'R': R, 'span_c': span_c, 'cov': cov, 'rest_margin_rad': top_hidden}
    # rows per column in angle: the edge strip, the opening, then dense over the top rim and the painted band (3 mm steps), then the sink
    SQD = CLOSE - SQ_U
    def col_angles(i):      # rows clustered where a pose crosses the rim: the closed edge, the squint's top-rim crossing, the closed top rim
        e_, l_, h_ = edge[i], lo[i], hi[i]; fs_ = h_ - SQD
        a_ = [e_, e_ + .006, max(l_ + .004, e_ + .012)]
        a_ += list(fs_ + np.array([-.045, -.024, -.012, -.004, .004, .012, .024, .045]))
        a_ += list(l_ + (h_ - l_) * np.array([.30, .60, .80]))
        a_ += list(h_ + np.array([-.024, -.012, -.004, .004, .012, .024, .040, .060, .085, .115, .155, .21]))
        a_ = np.unique(np.round(np.clip(np.array(a_), e_, None), 5))
        out = [a_[0]]
        for v in a_[1:]:
            if v - out[-1] > .003: out.append(v)
        return out
    cols_ = [col_angles(i) for i in range(nx)]; NRw = max(len(c_) for c_ in cols_)
    cols_ = [list(np.interp(np.linspace(0, 1, NRw), np.linspace(0, 1, len(c_)), c_)) if len(c_) < NRw else c_ for c_ in cols_]
    PHc = np.array(cols_)                                                 # closed-pose angles
    rows = np.linspace(0, 1, PHc.shape[1])
    def state(phs):
        out = [probe(tag, pivot, xs[i:i + 1], phs[i]) for i in range(nx)]
        return [np.concatenate([o[k] for o in out]) for k in range(7)]
    sc, ec, fc, src, psic, Oc, Dc = state(PHc)
    ss, es, fs, srs, psis, Os, Ds = state(PHc + (CLOSE - SQ_U))
    sr_, er_, fr_, srr, psir, Or_, Dr_ = state(PHc + CLOSE)
    # classification by what the camera sees: a pose's row is over the eye when its front projection (x, z) falls inside the
    # opening's rim outline; the painted band is the skin ring between the rim and the lash line (upper part) or the lid strip
    # just under the lower rim
    rimP = np.array([ns['verts'][i] for i in ns['roll_info'][s][0]])[:, [0, 2]]
    def over_eye(O_, D_, f_, grow=0.):
        Pp = O_ + D_ * np.nan_to_num(f_, nan=.2)[..., None]; c_ = rimP.mean(0)
        return in_poly2((Pp[..., [0, 2]].reshape(-1, 2) - c_) / (1 + grow) + c_, rimP).reshape(f_.shape), Pp
    in_c, Pc0 = over_eye(Oc, Dc, fc); in_s, Ps0 = over_eye(Os, Ds, fs); in_r, Pr0 = over_eye(Or_, Dr_, fr_)
    band = 1 + lash_band(psic) + BAND_PAD
    up_band = (~in_c) & (src <= band) & (np.sin(psic) > -.45)
    low_strip = np.zeros_like(in_c)          # (the closed edge follows the eye under the lower rim; the lash is painted inside the rim)
    cover = up_band | low_strip
    # the radius per row as a smooth curve inside per-row bounds (projected smoothing): the lid must be in front of the eye where
    # it is over the opening (closed and squint), on the skin over the painted band when closed, and under the skin wherever it is
    # not over the opening at the squint, at rest, and (sink rows) when closed. Closing over the eye wins a conflict.
    INF = 9.
    ecz = np.where(np.isfinite(ec), ec, -INF); esz = np.where(np.isfinite(es), es, -INF)
    L = np.full(r_shape := fc.shape, -INF); U = np.full(r_shape, INF)
    L = np.where(in_c, np.fmax(fc, ecz) + G_OPEN, L)
    L = np.where(cover, np.fmax(L, fc + G_SKIN), L)
    L = np.where(in_s, np.fmax(L, esz + HIDE), L)
    U = np.where(~in_s, np.fmin(U, fs - HIDE_SQ), U)
    U = np.fmin(U, fr_ - HIDE_REST)
    U = np.where(~in_c & ~cover, np.fmin(U, fc - .0006), U)
    conflict = L > U
    U = np.where(conflict & in_c, L, U); L = np.where(conflict & ~in_c, U, L)
    r = np.where(np.isfinite(L) & (L > -INF + 1), L, np.fmin(U, fc - SINK))
    r = np.clip(r, L, U)
    for _ in range(60):
        rs = r.copy()
        rs[:, 1:-1] = .25 * r[:, :-2] + .5 * r[:, 1:-1] + .25 * r[:, 2:]
        rs[1:-1, :] = .8 * rs[1:-1, :] + .1 * (rs[:-2, :] + rs[2:, :])
        r = np.clip(rs, L, U)
    r0 = r.copy()
    print('LID_BOUNDS', tag, R, json.dumps({'conflicts_closing_wins': int((conflict & in_c).sum()), 'conflicts_other': int((conflict & ~in_c).sum())}), flush=True)
    lost = cover & (r < fc)
    DBG = {'cover_rows': int(cover.sum()), 'cover_lost_under_skin': int(lost.sum()), 'rest_rows_over_eye': int(in_r.sum())}
    print('LID_DBG', tag, R, json.dumps(DBG), flush=True)
    conflicts = int(((r > fr_ - HIDE_REST + 1e-5)).sum())
    if os.environ.get('LID_VIS_DBG') and tag == 'L':
        Psq = pivot + r[..., None] * dvec(PHc + (CLOSE - SQ_U)) + np.stack([xs[:, None] - pivot[0] + 0 * r, 0 * r, 0 * r], -1)
        vis = []
        for (i, j), p_ in zip(np.ndindex(r.shape), Psq.reshape(-1, 3)):
            hs = skin_tree.ray_cast(Vector(p_) + Vector((0, -.0005, 0)), Vector((0, -1, 0)), 3)[0]
            he = eye_tree[tag].ray_cast(Vector(p_) + Vector((0, -.0005, 0)), Vector((0, -1, 0)), 3)[0]
            if hs is None and he is None: vis.append((i, j))
        out = [(i, j, bool(in_s[i, j]), bool(cover[i, j]), round(float((r[i, j] - fs[i, j]) * 1000), 1), round(float(Psq[i, j, 2]), 3)) for i, j in vis if not in_s[i, j]]
        print('VIS_SQ_OUTSIDE', len(out), out[:40], flush=True)
        Pcl = pivot + r[..., None] * dvec(PHc) + np.stack([xs[:, None] - pivot[0] + 0 * r, 0 * r, 0 * r], -1)
        beh = []
        for (i, j), p_ in zip(np.ndindex(r.shape), Pcl.reshape(-1, 3)):
            he = eye_tree[tag].ray_cast(Vector(p_) + Vector((0, -.0003, 0)), Vector((0, -1, 0)), 3)[0]
            if he is not None: beh.append((i, j, bool(in_c[i, j]), round(float(r[i, j] * 1000), 1), round(float(np.nan_to_num(ec[i, j], nan=-1) * 1000), 1), round(float(fc[i, j] * 1000), 1), round(float(PHc[i, j]), 3)))
        print('CLOSED_BEHIND_EYE', len(beh), beh[:30], flush=True)
        for ci in (8, 13):
            print('COL', ci, [(j, int(in_c[ci, j]), int(in_s[ci, j]), int(cover[ci, j]), round(float(r[ci, j] * 1e3), 1), round(float(np.nan_to_num(ec[ci, j], nan=-1) * 1e3), 1),
                              round(float(np.nan_to_num(fc[ci, j], nan=-1) * 1e3), 1), round(float(np.nan_to_num(fs[ci, j], nan=-1) * 1e3), 1), round(float(np.nan_to_num(es[ci, j], nan=-1) * 1e3), 1),
                              round(float(np.nan_to_num(fr_[ci, j], nan=-1) * 1e3), 1)) for j in range(r.shape[1])], flush=True)
        json.dump({'rim': rimP.tolist(), 'sq': Psq.reshape(-1, 3).tolist(), 'in_s': in_s.reshape(-1).tolist(), 'Ps0': Ps0.reshape(-1, 3).tolist(), 'r': r.reshape(-1).tolist(), 'fs': fs.reshape(-1).tolist()}, open(str(ROOT / 'scratch' / 'lid_dbg.json'), 'w'))
    PHr = PHc + CLOSE
    Vrest = pivot + r[..., None] * dvec(PHr) + np.stack([xs[:, None] - pivot[0] + 0 * r, 0 * r, 0 * r], -1)
    Pc = pivot + r[..., None] * dvec(PHc) + np.stack([xs[:, None] - pivot[0] + 0 * r, 0 * r, 0 * r], -1)
    # shading normals: the face without its socket over the opening, the real skin's outside it (closed pose), then rotated to rest
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
    info = {'pivot': pivot.tolist(), 'R': R, 'closed_eye_specks_of_1600': specks, 'span_c': round(float(span_c), 4), 'squint_coverage_centre': round(float(cov), 3),
            'rest_margin_rad': round(float(top_hidden), 3), 'conflicts_rest_hidden_vs_closed': conflicts,
            'closed_standoff_over_eye_mm': round(float(np.nanmax(np.where(sc, r - ec, np.nan)) * 1000), 2)}
    return dict(V=Vrest, N=Nrest, Pc=Pc, arc=arc, xs=xs, rows=np.array(rows), pivot=pivot, info=info, src=src, ok=ok)
def lower_lid(tag, nx=17):
    s = 1 if tag == 'L' else -1; F_ = ns['EYEF'][s]; Ec = F_['Sc']
    # the pivot sits behind and above the eye: from happy back to rest the lid swings down AND back into the cheek (never
    # down into the open mouth), and from neutral to happy it rises over the eye's lower rim
    H = 2 * EHH; BETA = math.radians(float(os.environ.get('LIDD_BETA', '62'))); lev = (.30 * H + .006) / (.14 * math.cos(BETA)) * 1.0
    zb = EZ - .70 * EHH
    pivot = np.array([Ec[0], Ec[1] + lev * math.cos(BETA), zb + lev * math.sin(BETA)])
    xs, (x0, x1) = opening_columns(tag, pivot, nx)
    ph_c = math.atan2(EZ - .5 * EHH - pivot[2], -(Ec[1] - pivot[1]))             # the eye's lower half seen from the pivot
    PHl = ph_c + np.linspace(-.30, .30, 641)
    sees, ed, fd, sr, psi, O_, D = probe(tag, pivot, xs, PHl)
    lo = np.full(nx, np.nan); hi = np.full(nx, np.nan)
    for i in range(nx):
        k = np.where(sees[i])[0]
        if len(k): lo[i] = PHl[k.min()]; hi[i] = PHl[k.max()]
    ok = np.isfinite(lo); idx = np.where(ok)[0]
    for i in np.where(~ok)[0]:
        j = idx[np.argmin(np.abs(idx - i))]; lo[i] = hi[i] = lo[j]
    X = (xs - Ec[0]) / (x1 - x0) * 2
    cov = .28 - .08 * np.clip(np.abs(X), 0, 1) ** 2                       # the happy crescent: higher at the centre (an upward arch)
    top_h = lo + cov * (hi - lo)                                          # the lid's top edge at the happy pose (-0.24)
    def col_angles(i):      # happy-pose angles: from the top edge down over the opening, dense at the lower rim, then the sink
        t_, l_ = top_h[i], lo[i]
        return [t_, t_ - .003] + list(t_ - (t_ - l_) * np.array([.18, .40, .62, .82, .94])) + list(l_ - np.array([-.002, .002, .005, .009, .014]))
    PHh = np.array([col_angles(i) for i in range(nx)]); rows = np.linspace(0, 1, PHh.shape[1])
    def state(phs):
        out = [probe(tag, pivot, xs[i:i + 1], phs[i]) for i in range(nx)]
        return [np.concatenate([o[k] for o in out]) for k in range(7)]
    sh_, eh, fh, srh, psih, Oh, Dh = state(PHh)
    sn, en, fn_, srn, psin, On, Dn = state(PHh + (SQ_D - NEU_D))          # the game's neutral (-0.1): 0.14 rad lower than happy
    s0, e0, f0, sr0, psi0, O0, D0 = state(PHh + SQ_D)                     # rest (0): 0.24 rad lower than happy
    r = np.where(sh_, np.fmax(fh, eh) + G_OPEN, fh - SINK * np.clip((srh - 1.00) / .03, .20, 1.5))      # under the skin right past the rim
    r = np.fmin(r, np.where(sn, np.inf, fn_ - HIDE_SQ)); r = np.fmin(r, np.where(s0, np.inf, f0 - HIDE_REST))
    r = np.where(sh_, np.fmax(r, eh + HIDE), r)
    shows_neutral = int((sn & (r > en - .0001)).sum())
    PHr = PHh + SQ_D
    Vrest = pivot + r[..., None] * dvec(PHr) + np.stack([xs[:, None] - pivot[0] + 0 * r, 0 * r, 0 * r], -1)
    Ph = pivot + r[..., None] * dvec(PHh) + np.stack([xs[:, None] - pivot[0] + 0 * r, 0 * r, 0 * r], -1)
    nn = grad(head_nr, Ph.reshape(-1, 3)); nk = grad(head_sdf, Ph.reshape(-1, 3))
    t_ = np.clip((srh.reshape(-1) - 1.0) / .10, 0, 1); t_ = t_ * t_ * (3 - 2 * t_)
    Nh = unit(nn * (1 - t_[:, None]) + nk * t_[:, None]); Nrest = rot_x(Nh, np.zeros(3), -SQ_D)     # rest = happy rotated by +0.24 about X
    arc = (top_h[:, None] - PHh) * r
    info = {'pivot': pivot.tolist(), 'lever_m': round(lev, 3), 'happy_cover_centre': .28, 'visible_at_neutral_verts': shows_neutral}
    return dict(V=Vrest, N=Nrest, Pc=Ph, arc=arc, xs=xs, rows=rows, pivot=pivot, info=info, src=srh, ok=ok)
RING_D = float(os.environ.get('RING_D', '.0055'))
def lower_lid_front(tag, nx=17):
    """the lower lid built at its happy pose by projecting from the front onto the eye and the skin (a rigid shell: rest =
    happy rotated +0.24 about X at a pivot behind and above the eye, so it swings down and back into the cheek)"""
    s = 1 if tag == 'L' else -1; F_ = ns['EYEF'][s]; Ec = F_['Sc']
    H = 2 * EHH; BETA = math.radians(float(os.environ.get('LIDD_BETA', '62'))); lev = (.30 * H + .006) / (.14 * math.cos(BETA))
    zb0 = EZ - .70 * EHH
    pivot = np.array([Ec[0], Ec[1] + lev * math.cos(BETA), zb0 + lev * math.sin(BETA)])
    rim = np.array([ns['verts'][i] for i in ns['roll_info'][s][0]]); RX, RZ = rim[:, 0], rim[:, 2]
    x0, x1 = RX.min(), RX.max(); xs = np.linspace(x0 + .002, x1 - .002, nx)
    def crossings(x):
        zz = []
        for i in range(len(rim)):
            a, b = i, (i + 1) % len(rim)
            if (RX[a] - x) * (RX[b] - x) <= 0 and RX[a] != RX[b]:
                t = (x - RX[a]) / (RX[b] - RX[a]); zz.append(RZ[a] + t * (RZ[b] - RZ[a]))
        return (min(zz), max(zz)) if zz else (EZ, EZ)
    X = (xs - Ec[0]) / ((x1 - x0) / 2)
    cov = .28 - .08 * np.clip(np.abs(X), 0, 1) ** 2
    fr_rows = np.array([0, .03, .18, .38, .58, .78, .92, 1.0])
    below = np.array([.0015, .0035, .0055, .0080, .011])
    G = []; SEE = []; ARC = []
    for i, x in enumerate(xs):
        zb_, zt_ = crossings(x); zh = zb_ + cov[i] * (zt_ - zb_)
        zs = list(zh - (zh - zb_) * fr_rows) + list(zb_ - below)
        col = []; see = []
        for z in zs:
            o = Vector((x, -1.5, z)); d = Vector((0, 1, 0))
            he = eye_tree[tag].ray_cast(o, d, 3); hs = skin_tree.ray_cast(o, d, 3)
            yf = float(front_hit(np.array([x]), np.array([z]))[0])
            ye = he[0].y if he[0] is not None else np.inf; ys_ = hs[0].y if hs[0] is not None else np.inf
            inside = z >= zb_ + .0004
            sees = inside
            ring_ = z >= zb_ - RING_D                                          # the painted rim ring under the opening: the lid lies on the skin over it
            y = (min(ye, ys_, yf) - G_OPEN) if inside else ((min(ys_, yf) - G_SKIN) if ring_ else (yf + SINK * min(1., max(.35, (zb_ - z - RING_D) / .003))))
            col.append((x, y, z)); see.append(sees)
        G.append(col); SEE.append(see); ARC.append([zh - z for z in zs])
    Ph = np.array(G); SEE = np.array(SEE); arc = np.array(ARC)
    nn = grad(head_nr, Ph.reshape(-1, 3)); nk = grad(head_sdf, Ph.reshape(-1, 3))
    srh_ = np.asarray(ns['eye_s3'](s, Ph.reshape(-1, 3))[0]); t_ = np.clip((srh_ - .98) / .10, 0, 1); t_ = t_ * t_ * (3 - 2 * t_)
    Nh = unit(nn * (1 - t_[:, None]) + nk * t_[:, None])
    Vrest = rot_x(Ph, pivot, -SQ_D)                                   # rest = happy rotated by +0.24 about X at the pivot
    Nrest = rot_x(Nh, np.zeros(3), -SQ_D)
    rows = np.linspace(0, 1, Ph.shape[1])
    info = {'pivot': pivot.tolist(), 'lever_m': round(lev, 3), 'beta_deg': round(math.degrees(BETA), 1), 'happy_cover_centre': .28, 'happy_cover_corners': .20}
    return dict(V=Vrest, N=Nrest.reshape(Ph.shape), Pc=Ph, arc=arc, xs=xs, rows=rows, pivot=pivot, info=info, src=None, ok=None)
LID_PAINT = {}; lid_objects = []; lid_info = {}
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
            u_ = i / (nx - 1) if name.endswith('_L') else 1 - i / (nx - 1)      # the R lid mirrors the L lid's chart (its columns run outer -> inner)
            layer.data[l].uv = au(chart, u_, float(L['rows'][j]))
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    for f in bm.faces:                                                    # outward = along the intended shading normals
        nf = sum((Vector(N[v.index]) for v in f.verts), Vector())
        if f.normal.dot(nf) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([tuple(N[me.loops[l].vertex_index]) for l in range(len(me.loops))])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    LID_NR[name] = nr; lid_objects.append((ob, bone)); return ob
LID_NR = {}
R_CAND = [float(v) for v in np.linspace(.12, .26, 15)]
if os.environ.get('LID_SWEEP_DZ'):
    for dz in [float(v) for v in os.environ['LID_SWEEP_DZ'].split(',')]:
        PIV_DZ = dz
        sc_ = min(((abs(st['cov'] - .28) + (0 if st['rest_margin_rad'] > .10 else 1 + (.10 - st['rest_margin_rad']) * 10), R, st) for R in R_CAND for st in [upper_lid('L', R, nx=9, build=False)]), key=lambda t: t[0])
        U_ = upper_lid('L', sc_[1]); print('SWEEP_DZ', dz, sc_[1], json.dumps(U_['info']), flush=True)
    sys.exit(0)
for tag in 'LR':
    scores = []
    for R in R_CAND:
        st = upper_lid(tag, R, nx=9, build=False)
        scores.append((abs(st['cov'] - .28) + (0 if st['rest_margin_rad'] > .10 else 1 + (.10 - st['rest_margin_rad']) * 10), R, st))
    sc_, Rb, st = min(scores, key=lambda t: t[0])
    print('LID_R', tag, Rb, json.dumps({k: round(float(v), 4) for k, v in st.items()}), flush=True)
    U = upper_lid(tag, Rb, nx=int(os.environ.get('LIDU_NX', '27')))
    make_lid('Golden_lidU_' + tag, U, 'lidU', 'lidU_' + tag); P['lidU_' + tag] = tuple(float(c) for c in U['pivot']); lid_info['lidU_' + tag] = U['info']
    D_ = lower_lid_front(tag)
    make_lid('Golden_lidD_' + tag, D_, 'lidD', 'lidD_' + tag); P['lidD_' + tag] = tuple(float(c) for c in D_['pivot']); lid_info['lidD_' + tag] = D_['info']
    if tag == 'L': LID_PAINT['lidU'] = U; LID_PAINT['lidD'] = D_
    print('LIDS', tag, json.dumps(lid_info['lidU_' + tag]), json.dumps(lid_info['lidD_' + tag]), flush=True)

LASH_C = float(os.environ.get('LASH_C', '.0068')); LASH_E = .0018
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
        sgn = 1                                                                       # (the L lid; the R lid mirrors it in x and shares the chart)
        d = Pp - np.array(ns['O']); d /= np.linalg.norm(d, axis=1, keepdims=True)
        uv = ns['head_uv'](d)
        ns['PAINT_OPTS']['lash'] = False
        Cs = np.asarray(ns['paint_head'](uv[:, 0], uv[:, 1])).reshape(-1, 3)
        # the coat just outside the opening: a ring at 1.12 x the opening, painted by the skin, Shepard-interpolated over the lid
        psr = np.linspace(0, 2 * math.pi, 96, endpoint=False); ring = ns['eye_pts'](1, psr, 1.12)
        rd = ring - np.array(ns['O']); rd /= np.linalg.norm(rd, axis=1, keepdims=True); ruv = ns['head_uv'](rd)
        RC = np.asarray(ns['paint_head'](ruv[:, 0], ruv[:, 1])).reshape(-1, 3)
        ns['PAINT_OPTS']['lash'] = True
        F_ = ns['EYEF'][1]; dd = Pp - F_['Sc']; X2 = dd @ F_['eo']; Z2 = dd @ F_['ev']
        rX = (ring - F_['Sc']) @ F_['eo']; rZ = (ring - F_['Sc']) @ F_['ev']
        wr = 1 / (((X2[:, None] - rX[None]) ** 2 + (Z2[:, None] - rZ[None]) ** 2) + 1e-7) ** 1.5
        CS = (wr[..., None] * RC[None]).sum(1) / wr.sum(1)[:, None]
        sr_, psi_, Xs_, Zs_ = ns['eye_s3'](1, Pp); sr_ = np.asarray(sr_); Zs_ = np.asarray(Zs_); Xs_ = np.asarray(Xs_)
        t_ = smooth(1.03, 1.14, sr_)
        C = mix(CS, Cs, t_)
        if chart == 'lidU':
            # the closed-eye lash: one soft U just inside the visible lower rim (thickest at the centre, tapering to the corners)
            ax_ = np.clip(np.abs(Xs_), 0, 1); wth = .025 + .060 * (1 - ax_ ** 2) ** .8
            lash = (1 - smooth(1.035, 1.06, sr_)) * smooth(1 - wth - .012, 1 - wth + .004, sr_) * smooth(.25, -.15, Zs_)
            lash = lash * (1 - smooth(.0050, .0095, arc))          # only near the lid's edge rows (else it shows across the squint crescent)
            # the squint edge: a thin dark line on the lid's very edge (hidden under the lower rim when closed)
            edge_ln = 1 - smooth(.0016, .0030, arc)
            C = mix(C, rgb('lash'), np.clip(.95 * lash + .85 * edge_ln * smooth(.2, -.2, Zs_), 0, 1))
        else:
            C = mix(C, rgb('lash'), .55 * np.exp(-((arc - .0006) / .0010) ** 2))
        C = C.reshape(h, w, 3)
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'golden-toy_rig_atlas.png'); ns['write_png'](path, a8)
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- weights
MC = np.array(ns['MC'])
NOSE_TIP_Y = HY + ns['NOSE_TIP_L'] * W
def lateral(x): return 1 - sm(.86 * MHW, 1.22 * MHW, abs(x))
CORNER_ANG = math.degrees(math.atan2(float(MOUTH_W[:, 1].max() * W + CHIN - MC[2]), MHW))
def mouth_inner_jaw(x, z):       # the rolled lip and the cavity sac: the bottom arc goes with the jaw, the top edge stays
    a = math.degrees(math.atan2(z - MC[2], x - MC[0]))
    up = sm(CORNER_ANG - 14, CORNER_ANG + 6, a) * sm(180 - CORNER_ANG + 14, 180 - CORNER_ANG - 6, a) if 0 < a < 180 else 0.
    return (1 - up) * (.55 + .45 * lateral(x * .85))
def lip_w(x, z): return .85 * math.exp(-((abs(x) - MHW) / (.040 * W)) ** 2 - ((z - CORNER_Z) / (.040 * W)) ** 2)
def face_weights(p):
    x, y, z = p; side = 'L' if x >= 0 else 'R'; q = M2L(np.array(p)); zl = q[2]; b = (y - NOSE_TIP_Y) / W
    d = float(head_sdf(np.array([p]))[0])
    inner = d < -.0004 and abs(x) < .36 * W and CHIN - .05 * W < z < CHIN + .36 * W and y > lip_front_y - .02
    lip = lip_w(x, z) * (1 - sm(.35, .55, b))
    if inner:
        jw = mouth_inner_jaw(x, z)
    else:
        below = 1 - sm(z_top(x) - .030 * W, z_top(x) - .006 * W, z)
        jw = below * lateral(x) * (1 - sm(.42, .70, b)) * (1 - sm(-.02, -.10, zl) * .5)
    neck = sm(-.02, -.12, zl) * sm(.40, .60, b) * (1 - jw)
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
EAR_KD = {}
for t_ in 'LR':
    gp, gv = EGRID[t_]; kd = KDTree(len(gp))
    for i_, p_ in enumerate(gp): kd.insert(Vector(p_), i_)
    kd.balance(); EAR_KD[t_] = (kd, gv)
def ear_weights(p, side):
    kd, gv = EAR_KD[side]; co, idx, dist = kd.find(Vector(p)); v = float(gv[idx])
    hd = 1 - sm(.02, .12, v)                                   # the buried root (under the helmet) follows the head
    # the ear hangs out from under the helmet rim: the part under and just below the rim (the back of the ear under the neck
    # guard included) stays on the head, so a swing bends the ear below the rim instead of lifting it into the helmet
    q = M2L(np.array([p]))[0]; dzr = float(q[2] - ns['helm_edge'](ns['psi_of'](q[None]))[0])
    psi_ = abs(float(ns['psi_of'](q[None])[0])); fall = EAR_RIM_FALL + EAR_BACK_FALL * sm(105, 150, psi_)   # longer under the neck guard
    hd = max(hd, sm(-fall, -.015, dzr))
    tip = sm(EAR_V_FOLD - .10, EAR_V_FOLD + .12, v)            # the lower locks swing on earTip, a smooth blend across the fold
    mv = 1 - hd
    return {'head': hd, 'ear_' + side: mv * (1 - tip), 'earTip_' + side: mv * tip}
ZH, ZS, ZC = P['hips'][2], P['spine'][2], P['chest'][2]
TORSO_H0 = float(os.environ.get('TORSO_H0', '.09')); TORSO_H1 = float(os.environ.get('TORSO_H1', '.07'))   # the belt line stays with the pelvis; the spine bends the plate above it
def torso(z):
    h_ = 1 - sm(ZH + TORSO_H0, ZS + TORSO_H1, z); c_ = sm(ZS + .06, ZC + .04, z); return h_, (1 - h_) * (1 - c_), (1 - h_) * c_
def arm_t(p, s_tag):
    sh = np.array(P['upperarm_' + s_tag]); wr_ = np.array(P['hand_' + s_tag]); d = wr_ - sh
    return float((np.array(p) - sh) @ d / (d @ d))
T_EL = {t: arm_t(P['forearm_' + t], t) for t in 'LR'}
def limb_arm(p, t_):
    t = arm_t(p, t_); te = T_EL[t_]
    ch = .55 * (1 - sm(-.10, .06, t))                            # the shoulder root blends into the chest
    fo = sm(te - .07, te + .07, t); ha = sm(.98, 1.06, t)
    up = (1 - fo); w = {'chest': ch, 'upperarm_' + t_: (1 - ch) * up, 'forearm_' + t_: (1 - ch) * fo * (1 - ha), 'hand_' + t_: (1 - ch) * fo * ha}
    return w
def arm_weights(p, lab, t_):
    t = arm_t(p, t_)
    if lab.startswith('mitten_paw'):
        fo = 1 - sm(.96, 1.04, t); return {'hand_' + t_: 1 - fo * .6, 'forearm_' + t_: fo * .6}
    if lab.startswith(('emerald_bracer', 'brass_bracer_rim')):
        up = .35 * (1 - sm(T_EL[t_] + .00, T_EL[t_] + .08, t)); return {'forearm_' + t_: 1 - up, 'upperarm_' + t_: up}
    if lab.startswith(('leather_wrist_strap', 'fur_wrist_cuff')):
        ha = .25 + .55 * sm(.97, 1.07, t); return {'forearm_' + t_: 1 - ha, 'hand_' + t_: ha}
    return limb_arm(p, t_)                                        # the fur arm and its feather locks follow their limb
def leg_t(p, t_):
    hp = np.array(P['thigh_' + t_]); an = np.array(P['foot_' + t_]); d = an - hp
    return float((np.array(p) - hp) @ d / (d @ d))
T_KN = {t: leg_t(P['shin_' + t], t) for t in 'LR'}
HIP_K = float(os.environ.get('HIP_K', '.8')); HIP_T = float(os.environ.get('HIP_T', '.35'))
def leg_weights(p, t_):
    t = leg_t(p, t_); tk = T_KN[t_]
    hp = HIP_K * (1 - sm(-.12, HIP_T, t)); sh = sm(tk - .08, tk + .08, t); ft = sm(.97, 1.08, t)
    return {'hips': hp, 'thigh_' + t_: (1 - hp) * (1 - sh), 'shin_' + t_: (1 - hp) * sh * (1 - ft), 'foot_' + t_: (1 - hp) * sh * ft}
TPATH = TP; TCUM = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(TPATH, axis=0), axis=1))]); TS = TCUM / TCUM[-1]
TB_S = np.array([TS[i] for i in TAIL_IDX])
TAIL_SPINE = float(os.environ.get('TAIL_SPINE', '.7'))
def tail_weights(p):
    d = np.linalg.norm(TPATH - np.array(p), axis=1); k = int(np.argmin(d)); s = TS[k]
    w = {}
    for i in range(4):
        a = TB_S[i]; b = TB_S[i + 1] if i < 3 else 1.01
        if a <= s < b:
            f = (s - a) / (b - a); blend = sm(.65, 1.0, f) if i < 3 else 0.
            w['tail%d' % (i + 1)] = 1 - blend
            if i < 3: w['tail%d' % (i + 2)] = blend
    if not w: w = {'tail1': 1.} if s < TB_S[0] else {'tail4': 1.}
    hips = 1 - sm(TB_S[0] - .10, TB_S[0] + .02, s)            # the root up to tail1 (under the quiver's foot) stays with the pelvis
    # the plume's top near its root sits under the quiver's foot: it rides partly on the spine so a lean keeps them together
    up = sm(.0, .03, p[2] - TPATH[k][2]) * (1 - sm(.12, .34, s)) * TAIL_SPINE
    out = {k_: v * (1 - hips) * (1 - up) for k_, v in w.items()}; out['hips'] = hips * (1 - up); out['spine'] = up
    return out
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.startswith(('emerald_chest_plate', 'leather_back_strap')):
        h_, sp_, c_ = torso(z)
        armw = .30 * sm(.13, .19, abs(x)) * sm(ZC - .02, ZC + .08, z)            # the plate's shoulders lift a little with the arms
        return {'hips': h_, 'spine': sp_, 'chest': c_ * (1 - armw), 'upperarm_' + side: c_ * armw}
    if lab.startswith('emerald_pauldron'):
        lame = lab.startswith('emerald_pauldron_lame')
        dx = abs(x) - .17; armw = (.45 if lame else .30) + .30 * sm(.0, .12, dx)
        return {'chest': 1 - armw, 'upperarm_' + side: armw}
    if lab.startswith(('leather_belt', 'brass_belt_edge', 'brass_medallion')):
        h_, sp_, c_ = torso(z); return {'hips': h_ + c_, 'spine': sp_}
    if lab.startswith('fur_hips'):
        h_, sp_, c_ = torso(z)
        th = .35 * sm(.06, .16, abs(x)) * sm(ZH + .02, ZH - .10, z)
        return {'hips': (h_ + c_) * (1 - th), 'spine': sp_ * (1 - th), 'thigh_' + side: th}
    if lab.startswith(('fur_leg', 'thigh_feather_tuft', 'fur_ankle_cuff')):
        t_ = 'L' if x >= 0 else 'R'; return leg_weights(p, t_)
    if lab.startswith('lightfur_foot'):
        t_ = 'L' if x >= 0 else 'R'; sh = .35 * sm(.06, .11, z); return {'foot_' + t_: 1 - sh, 'shin_' + t_: sh}
    if lab.startswith(('emerald_quiver', 'brass_quiver', 'javelin_', 'felt_fletch', 'leather_quiver_band')):
        return {'chest': 1}
    DEFAULTED.add(lab); return {'spine': 1}
DEFAULTED = set()
def tabard_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    top = P['hips'][2] + .075; bot = .25
    if lab.startswith('emerald_tasset'):
        ang = math.degrees(math.atan2(abs(x), -(y - RCY_)))       # 0 at the front, 90 at the side
        a = (TASSET_K - TASSET_FRONT * (1 - sm(55, 95, ang))) * sm(top, bot, z)   # the hem follows its thigh (the front edge a little less: the arms pass there in a crouch)
        return {'hips': 1 - a, 'thigh_' + side: a}
    a = TABARD_K * sm(top, bot, z); wl = sm(-.08, .08, x)          # the front panel follows both thighs, split across its width
    return {'hips': 1 - a, 'thigh_L': a * wl, 'thigh_R': a * (1 - wl)}
RCY_ = ns['RCY'] if 'RCY' in ns else -.015; TASSET_FRONT = float(os.environ.get('TASSET_FRONT', '.15'))
TASSET_K = float(os.environ.get('TASSET_K', '.97')); TABARD_K = float(os.environ.get('TABARD_K', '.60'))
def ruff_weights(p):
    x, y, z = p; nk = .25 + .45 * sm(CHIN - .12, CHIN - .02, z); return {'neck': nk, 'chest': 1 - nk}

# ---------------------------------------------------------------- the mouth cavity sac as its own object (no outline in the game)
def split_cavity():
    head = OBJ['Golden_head']; me = head.data; uvd = me.uv_layers.active.data
    x0, y0, w0, h0 = ns['CHARTS']['cavity']
    def in_cav(l): u, v = uvd[l].uv; return x0 - 1 <= u * 2048 <= x0 + w0 + 1 and y0 - 1 <= v * 2048 <= y0 + h0 + 1
    sel = [all(in_cav(l) for l in p.loop_indices) for p in me.polygons]
    bpy.ops.object.select_all(action='DESELECT'); head.select_set(True); bpy.context.view_layer.objects.active = head
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    me.polygons.foreach_set('select', sel); me.update()
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    cav = [o for o in bpy.context.selected_objects if o is not head][0]; cav.name = 'Golden_mouth_cavity'; cav.data.name = cav.name
    labels['Golden_head'] = ['ball_head_skin'] * len(head.data.vertices); labels[cav.name] = ['mouth_cavity'] * len(cav.data.vertices)
    OBJ[cav.name] = cav; base_objects.append(cav)
    return int(sum(sel))
CAVITY_FACES = split_cavity(); print('CAVITY_SPLIT', CAVITY_FACES, flush=True)

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
adata = bpy.data.armatures.new('Golden_game_skeleton'); arm = bpy.data.objects.new('Golden_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'
arm.show_in_front = True

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
    if o.name in ('Golden_head', 'Golden_mouth_cavity'): weights = [face_weights(p) for p in pp]
    elif o.name == 'Golden_helm': weights = [{'head': 1} for p in pp]
    elif o.name == 'Golden_tongue': weights = [{'jaw': 1} for p in pp]
    elif o.name.startswith('Golden_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Golden_ear_'): weights = [ear_weights(p, o.name[-1]) for p in pp]
    elif o.name.startswith('Golden_arm_'): weights = [arm_weights(p, l, o.name[-1]) for p, l in zip(pp, lab)]
    elif o.name == 'Golden_tail': weights = [tail_weights(p) for p in pp]
    elif o.name == 'Golden_tabard': weights = [tabard_weights(p, l) for p, l in zip(pp, lab)]
    elif o.name == 'Golden_ruff': weights = [ruff_weights(p) for p in pp]
    else: weights = [body_weights(p, l) for p, l in zip(pp, lab)]
    bind(o, weights); objects.append(o)
for o, b in lid_objects:
    bind(o, [{b: 1} for v in o.data.vertices]); objects.append(o); labels[o.name] = [b] * len(o.data.vertices)

# ---------------------------------------------------------------- outward winding: faces whose winding disagrees with their shading normals
# (folds in the approved surface; three.js culls by winding, so a few showed as pin-holes) are re-wound; shape and normals unchanged
REWOUND = {}
def tri_reversed(o):
    me = o.data; me.calc_loop_triangles(); cn = [Vector(l.vector) for l in me.corner_normals]; n_ = 0
    for t in me.loop_triangles:
        if t.area > 1e-12 and t.normal.dot(sum((cn[l] for l in t.loops), Vector()).normalized()) < -.2: n_ += 1
    return n_
for o in objects:
    if tri_reversed(o):              # triangulate (custom normals kept) so a fold inside a quad can be re-wound per triangle
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

# ---------------------------------------------------------------- prop mounts (the lance and javelin are separate GLBs)
def g3(v): v = np.asarray(v, float); return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]
PM = json.loads((ROOT / 'prop_mount.json').read_text())
grip = {}
for t_ in 'RL':
    palm = np.array(ARMJ[t_]['palm']); hand = np.array(P['hand_' + t_]); sh = np.array(P['upperarm_' + t_])
    ad = unit(hand - sh); fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
    grip_axis = unit(np.cross(ad, unit(np.cross(fwd, ad))) * 0 + fwd)      # a shaft through the closed mitten runs front-to-back across the palm
    grip[t_] = {'bone': 'hand_' + t_, 'hand_head_game': g3(hand), 'palm_centre_game': g3(palm), 'palm_offset_in_hand_frame_game': g3(palm - hand),
                'grip_axis_game': g3(grip_axis), 'arm_axis_game': g3(ad)}
QB, QT = np.array(ns['QB']) * np.array([1, 1, BZS]), np.array(ns['QT']) * np.array([1, 1, BZS])
qax = unit(QT - QB); chest = np.array(P['chest'])
mount = {'units': 'metres; game axes [x, y, z] = Blender [x, z, -y]; the game rebuilds bones without rotation, so a bone frame is the model frame translated to the bone head',
         'lance': {'prop': '/models/golden-lance.glb', 'prop_axis': 'the shaft runs along the prop\'s +Y (game), the tip at +Y; origin = the main grip',
                   'main_grip': {'bone': 'hand_R', 'position_in_bone_frame': grip['R']['palm_offset_in_hand_frame_game'], 'shaft_axis_game': grip['R']['grip_axis_game']},
                   'off_hand_grip': {'bone': 'hand_L', 'position_in_bone_frame': grip['L']['palm_offset_in_hand_frame_game'],
                                     'distance_along_shaft_from_main_m': PM['golden-lance.glb']['off_hand_grip_blender'][2]},
                   'note': 'two-handed: place the prop origin at the right palm and aim its +Y from the right palm toward the left palm; the left palm then sits at 0.44 m along the shaft when the paws are that far apart'},
         'javelin': {'prop': '/models/golden-javelin.glb', 'throw_grip': {'bone': 'hand_R', 'position_in_bone_frame': grip['R']['palm_offset_in_hand_frame_game'], 'shaft_axis_game': grip['R']['grip_axis_game']}},
         'quiver_back_mount': {'bone': 'chest', 'mouth_position_in_bone_frame': g3(QT - chest), 'mouth_position_model_game': g3(QT), 'axis_game': g3(qax),
                               'javelin_tips_model_game': [g3(np.array(t)) for t in ns['JAV_TIPS']],
                               'note': 'the quiver is part of the hero mesh (rigid on chest); a drawn javelin starts at the mouth along the axis'},
         'palms': grip}
(ROOT / 'export' / 'prop_mount.json').write_text(json.dumps(mount, indent=2))

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
        sd = head_sdf(rot_x(V, piv, a)); hidden[f'{o.name}@{a}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0003).sum())}
occ_pts = [v.co[:] for v in head.data.vertices]; occ_tris = [tuple(t.vertices) for t in head.data.loop_triangles]
for t_ in 'LR':
    e = OBJ['Golden_eye_' + t_]; e.data.calc_loop_triangles(); b0 = len(occ_pts); occ_pts += [v.co[:] for v in e.data.vertices]
    occ_tris += [tuple(b0 + i for i in t.vertices) for t in e.data.loop_triangles]
for nm in ('Golden_helm', 'Golden_ear_L', 'Golden_ear_R', 'Golden_tongue', 'Golden_mouth_cavity'):
    e = OBJ[nm]; e.data.calc_loop_triangles(); b0 = len(occ_pts); occ_pts += [v.co[:] for v in e.data.vertices]
    occ_tris += [tuple(b0 + i for i in t.vertices) for t in e.data.loop_triangles]
occ = BVHTree.FromPolygons(occ_pts, occ_tris)
VIEWS = {'front': Vector((0, -1, 0)), 'game+45': Vector((.5, -.5, .7071)), 'game-45': Vector((-.5, -.5, .7071)), 'below': Vector((0, -.9, -.44)).normalized()}
def seen(V):
    n_ = {}
    for k_, d_ in VIEWS.items(): n_[k_] = sum(1 for p in V if occ.ray_cast(Vector(p) + d_ * .0005, d_, 3)[0] is None)
    return n_
for o, bname in lid_objects:
    piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for a in ([0.0] if bname.startswith('lidU') else [0.0, NEU_D]):
        hidden[f'{o.name}@{a}']['seen_by_rays'] = seen(rot_x(V, piv, a))
        Vr_ = rot_x(V, piv, a); nr_ = LID_NR[o.name]
        idx_ = sorted(set(i for k_, d_ in VIEWS.items() for i, p in enumerate(Vr_) if occ.ray_cast(Vector(p) + d_ * .0005, d_, 3)[0] is None))
        hidden[f'{o.name}@{a}']['seen_col_row'] = [divmod(i, nr_) for i in idx_][:30]
        hidden[f'{o.name}@{a}']['seen_pts'] = [[round(float(c), 3) for c in Vr_[i]] for i in idx_][:8]
print('HIDDEN', json.dumps(hidden), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'golden-toy_rig.blend'))
(ROOT / 'rig-part-labels.json').write_text(json.dumps({o.name: labels[o.name] for o in objects}))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]], 'head_game_m': g3(P[b])} for b in HERO],
       'triangles': total, **{k: ns['LOG'][k] for k in ('head_refine_before', 'head_refine') if k in ns['LOG']}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'palms': grip, 'ear_pivots': {'v_root': EAR_V_ROOT, 'v_fold': EAR_V_FOLD, 'inward_fraction': EAR_IN},
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are rigid shells about their bone X axis (a radius per vertex): blink +1.22 closes, +0.488 is the happy squint, lidD -0.1 neutral, -0.24 happy.',
                 'Weights quantized to an exact 255 sum; <= 4 influences. Helmet, crest and crown dragon rigid to head; ears ear -> earTip across the fold.',
                 'The lance and javelin are separate GLBs; the mounts are in export/prop_mount.json.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('GOLDEN_RIG', json.dumps({'bones': len(HERO), 'triangles': total}), flush=True)
