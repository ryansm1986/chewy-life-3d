"""Yuzu (yk-yuzu-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, the game's world-axis contract.

    blender --background --factory-startup --python rig_yk-yuzu-toy.py

Runs build_yk-yuzu-toy.py in RIG_MODE (part labels, the rig atlas charts; the approved GLB / blend / JSON are not touched; the
director's round-2 crown tweak: no lightening above the band, value-only shading at the swatch's hue), then adds
(Fuku's rig for the skeleton, mouth and costume weights; Kome's ribbon-lash lids, rig_lids.py):
  - the armature: exactly the hero contract, identity rest orientations, heads at the joints;
  - the moving upper lids (rig_lids.Lids.upper3): rigid shells about the game's tilted lid hinge (lidTilt = her eyes'
    14.5 deg outward facing), hidden under the skin above the opening at rest, their rest edge just under the lash roll;
    the rolls (Yuzu_lash_L/R) are weighted 100% to lidU_* and ride the lid's edge, so shut (+lidClose 0.50) they land on the lower
    rim as the closed lash line with its wing. The lid's colour is the skin's own paint (the mask, the blush) at the pose
    where it shows, per side; its shading normals are the skin's own at the near-shut poses (0.65-1.0 of lidClose);
  - the lower lids: built at the happy pose (LOW_T) hugging the eye, under the cheek at the neutral -0.10;
  - the mouth: the skin parted along the painted "u" between sealed corners, a closed cavity and a tongue; the muzzle's lower
    half, the chin and the under-jaw ride `jaw`, the corners `lip_*`;
  - weights (<= 4 influences, quantized to an exact 255 sum): the kimono and the over panel on hips / spine / chest with the
    hem following the thighs, the obi on hips / spine with the knot on the spine, the collar on the chest riding with the neck,
    the sleeves on the upper arms blending to the chest at the armhole, the headband rigid on the head, the ears ear_ ->
    earTip_ (their tucked roots on the head), the trousers hips -> thigh -> shin, the tail along tail1-4;
and saves yk-yuzu-toy_rig.blend (only Armature modifiers left) and joints-rig.json.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
ns = {'__file__': str(ROOT / 'build_yk-yuzu-toy.py'), '__name__': 'yuzu_model', 'RIG_MODE': True}
exec(compile((ROOT / 'build_yk-yuzu-toy.py').read_text(encoding='utf-8'), str(ROOT / 'build_yk-yuzu-toy.py'), 'exec'), ns)
import rig_lids
from rig_lids import rot_axis
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MZM = ns['MZM']; catmull = ns['catmull']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit, grad_n = ns['head_sdf'], ns['front_hit'], ns['grad_n']
def sm(a, b, x): return float(smooth(a, b, x))
def env(k, d): return float(os.environ.get(k, d))
LID_TILT = env('LID_TILT', '.253')        # = the eyes' measured outward facing (14.5 deg, the model's eye_axis)
LID_SQ = 0.                                # the lid is designed AT REST, its edge under the lash roll, which rides on it
LID_B, LID_ZO = env('LID_B', '.066'), env('LID_ZO', '-.20')
LID_LIFT = env('LID_LIFT', '-.0006')       # the lid's circle passes 0.6 mm under the skin at the opening's top
LOW_T = env('LOW_T', '-.30')               # the lower lid designed at the happy -0.30
LASH_EDGE_K = env('LASH_EDGE_K', '.55')    # the rest edge: this fraction of the roll's half-width under its centre line
SHUT = env('SHUT', '.65')                  # HERO_MODELS lidClose: the upper lid shuts at this angle (Fuku's construction). On the
                                           # shared 1.22 a rigid lid sweeping her tall (0.18 W) opening needs a ~10 cm lever, much
                                           # rounder than her flat face, so the lash roll stood 10-14 mm off the skin mid-blink (round 1)
SQ_U = env('SQ_U', '.13')                  # the game squint we design for (~0.22 of the shut angle; a low upper value)
def SA(a): return a * SHUT / 1.22          # a 1.22-based angle scaled to the lid's own shut angle
LOG = {}

# ---------------------------------------------------------------- bake world transforms, read part labels
base_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
labels = {}
for o in base_objects:
    names = [g.name.removeprefix('_part_') for g in o.vertex_groups]
    labels[o.name] = [names[max(v.groups, key=lambda g: g.weight).group] if v.groups else '' for v in o.data.vertices]
    mw = o.matrix_world.copy()
    for v in o.data.vertices: v.co = mw @ v.co
    o.matrix_world = Matrix.Identity(4)
    o.vertex_groups.clear()
OBJ = {o.name: o for o in base_objects}
print('OBJECTS', sorted(OBJ), flush=True)
head = OBJ['Yuzu_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Yuzu_eye_' + t].data.vertices], [tuple(p.vertices) for p in OBJ['Yuzu_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
LD = rig_lids.Lids(ns, eye_tree)
def hinge(tag): return LD.hinge(tag, LID_TILT)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
JA, JL = ns['joint_arms'], ns['joint_legs']
# Yuzu's painted "u" smile (build paint_face): ends (+-0.069, +0.020), (+-0.062, +0.011), (+-0.042, -0.006), (+-0.020, -0.014), (0, -0.016) W about MZM
SMILE_CTRL = [(.069 * W, MZM + .020 * W), (.062 * W, MZM + .011 * W), (.042 * W, MZM - .006 * W), (.020 * W, MZM - .014 * W), (0, MZM - .016 * W)]
MHW = .069 * W
mouth_y = float(front_hit(0., MZM)[0])
CORNER_X = .064 * W; corner_z = MZM + .015 * W                  # the sealed mouth corners (the u's upturned ends)
MUZ_FRONT_L = (mouth_y - HY) / W
TAIL_PTS = ns['TAIL_PTS']
TAIL_T = (.24, .46, .68, .88)            # tail1 where the tail leaves the kimono (the hidden root stays on hips), tail4 near the tip
P = {'root': (0, -.006, 0), 'hips': (0, .006, .300), 'spine': (0, .008, .390), 'chest': (0, .012, .490), 'neck': (0, .020, .612),
     'head': (0, HY + .040, CHIN + .002),                             # the skull base: the nod pivot at the back of the neck, chin height
     'jaw': (0, mouth_y + .22 * W, corner_z)}                         # the hinge inside the head, 0.22 W behind the mouth
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = (s * CORNER_X, float(front_hit(s * CORNER_X, corner_z)[0]) + .002, corner_z)
    C0, ne, up, tt = ns['ear_info'][s]; R_E = .166 * W
    P['ear_' + tag] = tuple(float(c) for c in C0 - up * .45 * R_E - ne * .020)     # the ear's base, where it leaves the band
    P['earTip_' + tag] = tuple(float(c) for c in C0 + up * .30 * R_E + np.array([s * .012, 0, 0]))
    P['upperarm_' + tag] = tuple(JA[tag]['shoulder']); P['forearm_' + tag] = tuple(JA[tag]['elbow']); P['hand_' + tag] = tuple(JA[tag]['wrist'])
    P['thigh_' + tag] = tuple(JL[tag]['hip']); P['shin_' + tag] = tuple(JL[tag]['knee']); P['foot_' + tag] = tuple(JL[tag]['ankle'])
for i, t in enumerate(TAIL_T):
    P['tail%d' % (i + 1)] = tuple(float(c) for c in catmull(TAIL_PTS, t))

# ---------------------------------------------------------------- eyelids (Kome's construction)
lid_objects = []; lid_info = {}; LID_PAINT = {}
def mesh_grid(name, V, uvs, chart, nr, nc):
    Vf = V.reshape(-1, 3); fs = []
    for j in range(nr - 1):
        for i in range(nc - 1):
            q = j * nc + i; fs.append((q, q + 1, q + nc + 1, q + nc))
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in Vf], [], fs); me.update()
    layer = me.uv_layers.new(name='Atlas'); UVf = uvs.reshape(-1, 2)
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = tuple(au(chart, *UVf[me.loops[l].vertex_index]))
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    return ob
def orient_out(ob, piv, k):
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me)
    for f in bm.faces:
        c = np.array(f.calc_center_median()) - piv; rv = c - k * (c @ k)
        if np.dot(np.array(f.normal), rv) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
def skin_normals(Vrest, piv, k, angs, n_a=9, end_w=8.):
    acc = np.zeros_like(Vrest)
    for a in np.linspace(angs[0], angs[1], n_a):
        Pp = rot_axis(Vrest, piv, k, a); vis = head_sdf(Pp) > -.0020
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
        n = rot_axis(grad_n(Q), np.zeros(3), k, -a)
        wa = end_w if abs(a - angs[1]) < 1e-9 else 1.
        acc += wa * np.where(vis, 1., 1e-3)[:, None] * n
    return acc / np.linalg.norm(acc, axis=1, keepdims=True)
def cap_radii(V, piv, k, angs, tag, floor_angs, nr, nc, margin=.0008, eye_gap=.0006, keep_rows=0):
    c = V - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u = rad / r[:, None]
    need = np.zeros(len(V)); floor = np.full(len(V), -9.)
    for a in angs:
        Va = rot_axis(V, piv, k, a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985)
        sd = head_sdf(Va); bad = (~op) & (sd > -margin); need[bad] = np.maximum(need[bad], sd[bad] + margin)
    for a in floor_angs:
        Va = rot_axis(V, piv, k, a); op = LD.eye_sr(tag, Va) < 1.0
        if op.any():
            idx = np.where(op)[0]; ed = LD.eye_dist(Va[idx], piv, k, tag)
            ok = np.isfinite(ed); floor[idx[ok]] = np.maximum(floor[idx[ok]], ed[ok] + eye_gap)
            if a > .55 and (~ok).any():
                mi = idx[~ok]; sdm = head_sdf(Va[mi]); floor[mi] = np.maximum(floor[mi], r[mi] - sdm + eye_gap * .5)
    sh = need.reshape(nr, nc); raw = sh.copy()
    for _ in range(10):
        p_ = np.pad(sh, 1, mode='edge'); sh = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
        sh = np.maximum(sh, raw)
    if keep_rows: sh[:keep_rows] = np.minimum(sh[:keep_rows], raw[:keep_rows])
    r_new = np.maximum(r - sh.ravel(), floor)
    return piv + ax + u * r_new[:, None], {'capped': int((r_new < r - 1e-6).sum()), 'max_shrink_mm': round(float((r - r_new).max()) * 1000, 1)}
UP_ROWS = np.r_[np.linspace(0, SA(.12), 5), np.linspace(SA(.12), SA(1.55), 15)[1:]]
_psi = np.radians(np.linspace(158, 0, 120)); _th = ns['lash_th'](_psi); _ux, _uz = ns['eye_unit'](_psi)
_ke = .965 + _th * (.5 - .5 * LASH_EDGE_K)
_LX, _LZ = _ux * _ke, _uz * _ke
def lash_edge_Z(X):
    z = float(np.interp(X, _LX, _LZ))
    if X < -.80: z += 0.15 * (-.80 - X)          # (Yuzu: less tuck, so shut it still covers the inner corner)
    if X < _LX[0]: z += 1.2 * (_LX[0] - X)
    return z
RIB_LAND = env('RIB_LAND', '-1.0')
PI_ = math.pi
def lid_pivot(tag, a=SHUT):
    s = 1 if tag == 'L' else -1; k = hinge(tag); O_ = np.array(ns['eye_centers'][tag])
    kc = .965 + float(ns['lash_th'](np.array([PI_ / 2]))[0]) / 2
    def surf(Xe, Ze):
        x = s * EX + s * EHW * Xe; z = EZ + EHH * Ze; return np.array([x, float(front_hit(x, z)[0]), z])
    R0 = surf(0., kc); R1 = surf(0., RIB_LAND)
    u = np.array([0, 0, 1.]); v = np.cross(k, u); v /= np.linalg.norm(v)
    p0 = np.array([(R0 - O_) @ v, (R0 - O_) @ u]); p1 = np.array([(R1 - O_) @ v, (R1 - O_) @ u])
    m = (p0 + p1) / 2; c = np.linalg.norm(p1 - p0); dd = (c / 2) / math.tan(a / 2); nrm = np.array([-(p1 - p0)[1], (p1 - p0)[0]]) / c
    best = None
    for sg in (1, -1):
        cc = m + sg * dd * nrm; C3 = O_ + cc[0] * v + cc[1] * u
        R0r = rot_axis(R0[None], C3, k, a)[0]; err = np.linalg.norm(R0r - R1)
        if best is None or err < best[0]: best = (err, C3)
    LOG['lid_pivot_' + tag] = {'pivot': [round(float(c_), 4) for c_ in best[1]], 'fit_err_mm': round(best[0] * 1000, 2),
                               'radius_mm': round(float(np.linalg.norm((R0 - best[1]) - k * ((R0 - best[1]) @ k))) * 1000, 1)}
    return best[1]
def lid_pivot_search(tag, C0, span=.080, step=.008):
    k = hinge(tag); u = np.array([0, 0, 1.]); v = np.cross(k, u); v /= np.linalg.norm(v)
    Vr = np.array([list(vv.co) for vv in OBJ['Yuzu_lash_' + tag].data.vertices]); X0, Z0 = LD.eye_XZ(tag, Vr)
    top = (np.abs(X0) < .45) & (Z0 > .85)
    best = None; offs = np.arange(-span, span + 1e-9, step)
    for dv in offs:
        for du in offs:
            C = C0 + dv * v + du * u
            Vs = rot_axis(Vr[top], C, k, SHUT); Zs = LD.eye_XZ(tag, Vs)[1]; land = float(np.median(Zs)); sl = head_sdf(Vs)
            if not (RIB_LAND - .12 <= land <= RIB_LAND + .12) or float(np.median(sl)) < -.003 or float(np.median(sl)) > .006: continue
            cost = 0.
            for a, wgt in ((.12, 2.), (.18, 3.), (.25, 2.), (.40, 1.2), (.60, 1.), (.85, 1.), (1.05, 1.)):
                sd = head_sdf(rot_axis(Vr[top], C, k, SA(a)))
                cost = max(cost, wgt * (max(0., float(np.percentile(sd, 95)) - .0055) + max(0., -.0025 - float(np.median(sd)))))
            if best is None or cost < best[0]: best = (cost, C, land, dv, du)
    if best is None: return C0
    LOG['lid_pivot_search_' + tag] = {'cost_mm': round(best[0] * 1000, 1), 'land_EHH': round(best[2], 3), 'shift_mm': [round(best[3] * 1000, 1), round(best[4] * 1000, 1)]}
    return best[1]
def lid_pivot_search_all(tag, shut, span=.088, step=.008):
    """(Yuzu) the hinge point for a given shut angle, judging the WHOLE lash roll: the top lands on the lower rim, the top stays
    on the face through the sweep, and no part of the roll outside the opening stands off the skin (its outer end swung under
    the eye like a tear in round 1); returns (cost_m, pivot, land)"""
    k = hinge(tag); u = np.array([0, 0, 1.]); v = np.cross(k, u); v /= np.linalg.norm(v)
    Vr = np.array([list(vv.co) for vv in OBJ['Yuzu_lash_' + tag].data.vertices]); X0, Z0 = LD.eye_XZ(tag, Vr)
    top = (np.abs(X0) < .45) & (Z0 > .85); C0 = lid_pivot(tag, shut)
    best = None; offs = np.arange(-span, span + 1e-9, step)
    for dv in offs:
        for du in offs:
            C = C0 + dv * v + du * u
            Vs = rot_axis(Vr[top], C, k, shut); Zs = LD.eye_XZ(tag, Vs)[1]; land = float(np.median(Zs)); sl = head_sdf(Vs)
            if not (RIB_LAND - .15 <= land <= RIB_LAND + .10) or float(np.median(sl)) < -.003 or float(np.median(sl)) > .006: continue
            cost = 0.
            for a, wgt in ((.12, 2.), (.18, 3.), (.25, 2.), (.40, 1.2), (.60, 1.), (.85, 1.), (1.05, 1.)):
                sd = head_sdf(rot_axis(Vr[top], C, k, a * shut / 1.22))
                cost = max(cost, wgt * (max(0., float(np.percentile(sd, 95)) - .0055) + max(0., -.0025 - float(np.median(sd)))))
            for f_ in (.3, .55, .8, 1.0):
                Va = rot_axis(Vr, C, k, f_ * shut); sd = head_sdf(Va); op = LD.eye_sr(tag, Va) < 1.0
                sd = sd[~op]
                if len(sd): cost = max(cost, 1.5 * max(0., float(sd.max()) - .0050))
            if best is None or cost < best[0]: best = (cost, C, land)
    return best
SEARCH = {}
if os.environ.get('SHUT_SCAN'):
    for sh_ in [float(v_) for v_ in os.environ['SHUT_SCAN'].split(',')]:
        b_ = lid_pivot_search_all('L', sh_)
        SEARCH[sh_] = None if b_ is None else {'cost_mm': round(b_[0] * 1000, 1), 'land': round(b_[2], 3), 'pivot': [round(float(c_), 4) for c_ in b_[1]]}
        print('SHUT_SCAN', sh_, SEARCH[sh_], flush=True)
    raise SystemExit
PIVOTS = {}
for t in 'LR':
    b_ = lid_pivot_search_all(t, SHUT)
    PIVOTS[t] = b_[1] if b_ is not None else lid_pivot_search(t, lid_pivot(t))
    LOG['lid_pivot_all_' + t] = None if b_ is None else {'cost_mm': round(b_[0] * 1000, 1), 'land_EHH': round(b_[2], 3)}
LD.pivot = lambda tag, B, Zo: PIVOTS[tag]
print('PIVOTS', json.dumps({k_: v_ for k_, v_ in LOG.items() if k_.startswith('lid_pivot')}), flush=True)
for tag in 'LR':
    s = 1 if tag == 'L' else -1; k = hinge(tag)
    L = LD.upper3(tag, LID_TILT, LID_B, LID_ZO, u_sq=LID_SQ, sink=-LID_LIFT, zfun=lash_edge_Z, nc=23, xr=(-1.48, 1.12))
    cols = L['cols']; nc = len(cols)
    rows = [np.array([rot_axis(c_['E'][None], c_['A'], k, -LID_SQ - al)[0] for c_ in cols]) for al in UP_ROWS]
    V = np.array(rows); nr = V.shape[0]; piv = L['Pv']
    Vf, capinfo = cap_radii(V.reshape(-1, 3), piv, k, np.linspace(0, SHUT, 25), tag, np.linspace(0, SHUT, 25), nr, nc, keep_rows=2, eye_gap=.0018, margin=.0014)
    V = Vf.reshape(nr, nc, 3)
    uv = np.stack(np.meshgrid(L['uu'], UP_ROWS / UP_ROWS[-1]), -1)
    if tag == 'L':
        _sd = head_sdf(V.reshape(-1, 3)).reshape(nr, nc); _op = (LD.in_opening(tag, V.reshape(-1, 3)) | (LD.eye_sr(tag, V.reshape(-1, 3)) < .985)).reshape(nr, nc)
        print('LIDREST rows (angle, max sd mm outside opening, n out, n over opening):', [(round(float(UP_ROWS[j]), 3), round(float(np.where(_op[j], -9, _sd[j]).max()) * 1000, 1), int(((~_op[j]) & (_sd[j] > .0005)).sum()), int(_op[j].sum())) for j in range(nr)], flush=True)
        _Vs = rot_axis(V.reshape(-1, 3), piv, k, SHUT); _X, _Z = LD.eye_XZ(tag, _Vs)
        print('LIDSHUT rows Z range:', [(round(float(UP_ROWS[j]), 3), round(float(_Z.reshape(nr, nc)[j].min()), 2), round(float(_Z.reshape(nr, nc)[j].max()), 2)) for j in range(nr)], flush=True)
    ob = mesh_grid('Yuzu_lidU_' + tag, V, uv, 'lidU.' + tag, nr, nc); orient_out(ob, piv, k)
    N_sq = skin_normals(V.reshape(-1, 3), piv, k, (SA(.10), SA(.40)), end_w=1.); N_sh = skin_normals(V.reshape(-1, 3), piv, k, (SA(.80), SHUT))
    wsh = np.repeat(smooth(SA(.22), SA(.55), UP_ROWS)[:, None], nc, 1).reshape(-1, 1)
    NRM = N_sq * (1 - wsh) + N_sh * wsh; NRM /= np.linalg.norm(NRM, axis=1, keepdims=True)
    ob.data.normals_split_custom_set([tuple(NRM[ob.data.loops[l].vertex_index]) for l in range(len(ob.data.loops))])
    lid_objects.append((ob, 'lidU_' + tag)); P['lidU_' + tag] = tuple(float(c) for c in piv)
    LID_PAINT['lidU.' + tag] = dict(V=V, rows=UP_ROWS, uu=L['uu'], Xs=L['Xs'], piv=piv, k=k, tag=tag)
    sc_ = LD.score2(dict(L, V=V), angs=np.linspace(0, SHUT, 13), shut=SHUT); sc_.pop('worst(a, colX, row, mm, X, Z)', None)
    lid_info['Yuzu_lidU_' + tag] = {'pivot': [round(float(c), 5) for c in piv], 'cap': capinfo, 'columns(X, r_b_mm, eye_clear_mm, hid_above_mm, hid_below_mm)': L['diag'], **sc_}
    Lo = LD.lower(tag, LID_TILT, dz=env('LOW_DZ', '2.0'), arch_c=env('ARCH_C', '.62'), arch_e=env('ARCH_E', '.30'), target=LOW_T, NX=21, NRW=11)
    Vl = np.transpose(Lo['V'], (1, 0, 2)).copy(); nrl, ncl = Vl.shape[0], Vl.shape[1]; pivl = Lo['Pv']
    Vlf, capl = cap_radii(Vl.reshape(-1, 3), pivl, k, (.04, 0., -.05, -.08, -.10, -.12, -.16, -.20, -.24, -.28, -.32, -.36), tag, (-.30, -.24, -.20), nrl, ncl, margin=.0026)
    Vl = Vlf.reshape(nrl, ncl, 3)
    uvl = np.stack(np.meshgrid((Lo['Xs'] - Lo['Xs'][0]) / (Lo['Xs'][-1] - Lo['Xs'][0]), np.linspace(0, 1, nrl)), -1)
    obl = mesh_grid('Yuzu_lidD_' + tag, Vl, uvl, 'lidD.' + tag, nrl, ncl); orient_out(obl, pivl, k)
    NRl = skin_normals(Vl.reshape(-1, 3), pivl, k, (-.10, LOW_T))
    obl.data.normals_split_custom_set([tuple(NRl[obl.data.loops[l].vertex_index]) for l in range(len(obl.data.loops))])
    lid_objects.append((obl, 'lidD_' + tag)); P['lidD_' + tag] = tuple(float(c) for c in pivl)
    LID_PAINT['lidD.' + tag] = dict(V=Vl, tag=tag, piv=pivl, k=k)
    lid_info['Yuzu_lidD_' + tag] = {'pivot': [round(float(c), 5) for c in pivl], 'cap': capl}
print('LIDS', json.dumps(lid_info, default=float), flush=True)

# ---------------------------------------------------------------- the lash rolls through the blink (they ride lidU)
LASH_SWEEP = {}
for tag in 'LR':
    Vr = np.array([list(v.co) for v in OBJ['Yuzu_lash_' + tag].data.vertices]); piv = np.array(P['lidU_' + tag]); k = hinge(tag)
    out = {}
    for a in (0., SQ_U, SA(.488), SA(.8), SA(1.0), SHUT):
        a = round(float(a), 3); Va = rot_axis(Vr, piv, k, a); sd = head_sdf(Va); X_, Z_ = LD.eye_XZ(tag, Va)
        inside = LD.eye_sr(tag, Va) < 1.0
        out[a] = {'proud_max_mm': round(float(np.where(inside, -9, sd).max()) * 1000, 1), 'buried_frac': round(float((sd < -.0015).mean()), 3),
                  'Z_range_EHH': [round(float(Z_.min()), 2), round(float(Z_.max()), 2)]}
    Va = rot_axis(Vr, piv, k, SHUT); sd = head_sdf(Va); X0_, Z0_ = LD.eye_XZ(tag, Vr); ii = np.argsort(-sd)[:8]
    out['worst_at_shut(X0, Z0, mm)'] = [(round(float(X0_[i]), 2), round(float(Z0_[i]), 2), round(float(sd[i]) * 1000, 1)) for i in ii]
    LASH_SWEEP[tag] = out
print('LASH_SWEEP', json.dumps(LASH_SWEEP), flush=True)

# ---------------------------------------------------------------- lid paint: the skin's own paint at the pose where it shows
def grid_point(V, rows_v, U, Vv):
    nr, nc, _ = V.shape; ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = (ci - i0)[..., None]
    jj = np.clip(np.searchsorted(rows_v, Vv, side='right') - 1, 0, nr - 2); fb = ((Vv - rows_v[jj]) / (rows_v[jj + 1] - rows_v[jj]))[..., None]
    return V[jj, i0] * (1 - fa) * (1 - fb) + V[jj, i0 + 1] * fa * (1 - fb) + V[jj + 1, i0] * (1 - fa) * fb + V[jj + 1, i0 + 1] * fa * fb
def skin_paint_at(P_):
    """the head's own paint (mask, blush, the soft shade) at the skin point under each lid point, per side"""
    Q = P_.reshape(-1, 3).copy()
    for _ in range(4): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
    return ns['paint_head_P'](Q).reshape(P_.shape)
RIB_T = env('RIB_T', '.0080'); RIB_DIAG = {}
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        if chart.startswith('lidU'):
            Pt = grid_point(info['V'], info['rows'] / info['rows'][-1], U, Vv)
            rows_a = Vv * info['rows'][-1]
            C_sh = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], SHUT).reshape(Pt.shape))
            C_sq = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], SA(.25)).reshape(Pt.shape))
            C = mix(C_sq, C_sh, smooth(SA(.22), SA(.55), rows_a))
            V = info['V']; nr, nc, _ = V.shape; vrow = info['rows'] / info['rows'][-1]
            arc = np.array([[np.linalg.norm(V[j, i] - V[0, i]) for i in range(nc)] for j in range(nr)])
            ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = ci - i0
            jj = np.clip(np.searchsorted(vrow, Vv, side='right') - 1, 0, nr - 2); fb = (Vv - vrow[jj]) / (vrow[jj + 1] - vrow[jj])
            A_ = (arc[jj, i0] * (1 - fa) * (1 - fb) + arc[jj, i0 + 1] * fa * (1 - fb) + arc[jj + 1, i0] * (1 - fa) * fb + arc[jj + 1, i0 + 1] * fa * fb)
            tag = info['tag']; Xc = info['Xs']
            Xt = np.interp(np.clip(U * (nc - 1), 0, nc - 1), np.arange(nc), Xc)
            onop = 1 - smooth(.92, 1.02, np.abs(Xt))                       # (Yuzu) only over the opening: no dark tail on the outer columns
            C = mix(C, rgb('lash'), (1 - smooth(.0050, .0068, A_)) * onop)  # the lid's own lash band (6 mm): with the roll, a solid shut line
            Vs = rot_axis(V.reshape(-1, 3), info['piv'], info['k'], SHUT).reshape(nr, nc, 3); em = np.full(nc, np.nan)
            for i in range(nc):
                sr = LD.eye_sr(tag, Vs[:, i]) - 1.0; Zr = LD.eye_XZ(tag, Vs[:, i])[1]
                cr = np.where((sr[:-1] > 0) & (sr[1:] <= 0) & (Zr[:-1] < 0))[0]
                if len(cr):
                    j = int(cr[0]); f_ = float(np.clip(sr[j] / max(sr[j] - sr[j + 1], 1e-9), 0, 1)); em[i] = arc[j, i] + (arc[j + 1, i] - arc[j, i]) * f_
            ok = np.isfinite(em) & (np.abs(Xc) < 1.02)
            RIB_DIAG[chart] = {'cols': int(ok.sum()), 'emerge_mm': [round(float(v) * 1000, 1) if np.isfinite(v) else None for v in em]}
            if ok.sum() >= 4:
                cf = np.polyfit(Xc[ok], em[ok], 2); emf = np.polyval(cf, Xc)
                inside = (Xc >= Xc[ok].min() - 1e-6) & (Xc <= Xc[ok].max() + 1e-6)
                e0 = np.interp(ci, np.arange(nc), emf); ins = np.interp(ci, np.arange(nc), inside.astype(float)) > .5
                Xi = np.interp(ci, np.arange(nc), Xc)
                taper = np.clip((Xi + 1.0) / .35, 0, 1) ** .7; flick = .0045 * smooth(.45, .98, Xi) ** 2
                top = e0 + (RIB_T * taper + flick)
                near = 1 - smooth(.0085, .0130, e0)
                rib = smooth(e0 - .0016, e0 - .0006, A_) * (1 - smooth(top - .0008, top + .0008, A_)) * ins * near
                C = mix(C, rgb('lash'), rib)
        else:                                      # the lower lid: the skin's paint at the happy pose, a soft crease on its edge
            Vl_ = info['V']; Pt = grid_point(Vl_, np.linspace(0, 1, Vl_.shape[0]), U, Vv)
            C = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], LOW_T).reshape(Pt.shape))     # (Yuzu) where it shows: over the lower eye, the mask
            C = C * (1 - .18 * np.exp(-((Vv - .03) / .03) ** 2))[..., None]
            C = mix(C, rgb('lash'), .30 * (1 - smooth(.0, .03, Vv)))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    # the mouth cavity and the tongue
    rgb = ns['rgb']
    for chart, col in (('cavity', '#5a1e22'), ('tongue', '#e88a96')):
        x0, y0, w, h = ns['CHARTS'][chart]; px[y0:y0 + h, x0:x0 + w, :3] = rgb(col)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'yk-yuzu-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- mouth: part the skin along the painted "u", add the cavity
_WS = np.array([catmull(SMILE_CTRL, q) for q in np.linspace(0, 1, 161)])
_WX, _WZ = _WS[::-1, 0], _WS[::-1, 1]
def smile_z(x):
    return float(np.interp(min(abs(x), MHW), _WX, _WZ))
CUT = .058 * W                                                       # parted for |x| < CUT; the upturned corners stay sealed
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Yuzu_head']; uvl = old.uv_layers.active.data
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
    for k_ in range(1, len(recs) - 1):
        rr = [recs[0], recs[k_], recs[k_ + 1]]
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
me = bpy.data.meshes.new('Yuzu_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'head_skin' for l_ in FL])
FN[onsk] = grad_n(FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Yuzu_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0016: rim.append(p)
assert len(rim) >= 10, len(rim)
LOG['mouth_seam_points'] = len(rim)

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - CORNER_X) / (.028 * W)) ** 2 - ((z - corner_z) / (.028 * W)) ** 2)
def jaw_w(x, y, z, kind):
    """the lower lip, the muzzle's lower half, the chin and the under-jaw; a smooth falloff into the cheeks (Yuzu's cream muzzle
    is 0.33 W wide: the jaw takes |x| < 0.15 W fully, fading out by 0.26 W)"""
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - MUZ_FRONT_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.008 * W, .012 * W, z - smile_z(x))
    we = sm(.80 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.15, .26, abs(xl)); back = 1 - sm(.36, .52, b)
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
    """the sleeve rides the upper arm, the armhole (inside the kimono) blending to the chest; the cuff a little to the forearm"""
    t = arm_t(p, side)
    chest = .55 * (1 - sm(-.22, .14, t)); fore = .20 * sm(.58, .80, t)
    return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore}
def thighs(x, share):
    wl = share * sm(-.10, .10, x); return {'thigh_L': wl, 'thigh_R': share - wl}
def bell_weights(p):
    """the kimono top (hips -> spine -> chest -> neck), the shoulders following the arms a little, its lower part following the
    thighs toward the hem (~36 % at the hem, so a walk and a run never push a leg through), the neck top riding neck and head"""
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    hips = 1 - sm(.36, .42, z); chest = sm(.46, .54, z); neck = sm(.605, .645, z)
    w = {'hips': hips, 'spine': (1 - hips) * (1 - chest), 'chest': (1 - hips) * chest * (1 - neck), 'neck': (1 - hips) * chest * neck * .7,
         'head': (1 - hips) * chest * neck * .3}
    arm = .30 * sm(.12, .17, abs(x)) * sm(.50, .56, z) * (1 - sm(.60, .63, z))
    th = .36 * float(np.clip((.37 - z) / .09, 0, 1)) ** .8
    out = {k: v * (1 - arm) * (1 - th) for k, v in w.items()}
    out['upperarm_' + side] = arm * (1 - th)
    for k, v in thighs(x, th).items(): out[k] = out.get(k, 0) + v
    return out
def obi_weights(p, lab):
    x, y, z = p
    if lab == 'obi_knot': return {'spine': 1}                                    # the director: the knot on the spine
    sp = sm(.36, .42, z); return {'hips': 1 - sp, 'spine': sp}
def collar_weights(p):
    """the collar on the chest, riding a little with the neck (more toward the nape) so a nod doesn't push the chin through it"""
    x, y, z = p; r = sm(.58, .64, z); low = 1 - sm(.47, .52, z)
    return {'spine': .6 * low, 'chest': (1 - .6 * low) * (.75 - .25 * r), 'neck': (1 - .6 * low) * (.25 + .20 * r), 'head': (1 - .6 * low) * .05 * r}
def ear_weights(p, s):
    """a spring ear: the root tucked under the band rides the head, the ear on ear_*, blending to earTip_* over its top half"""
    C0, ne, up, tt = ns['ear_info'][s]; R_E = .166 * W; tag = 'L' if s > 0 else 'R'
    h = float((np.array(p) - C0) @ up) / R_E
    hd = 1 - sm(-.80, -.45, h); tip = sm(-.05, .70, h)
    return {'head': hd, 'ear_' + tag: (1 - hd) * (1 - tip), 'earTip_' + tag: (1 - hd) * tip}
def lash_weights(pp, tag):
    """the roll 100% lidU; the wing flicks (past the opening's outer edge, up top) blend from lidU at their root toward head at
    their tip, so shut they don't swing down and out past the cheek (the in-game lesson: the far eye's flicks at 45 deg)"""
    X0, Z0 = LD.eye_XZ(tag, np.array(pp)); out = []
    for X, Z in zip(X0, Z0):
        t = float(np.clip((X - 1.06) / (1.52 - 1.06), 0, 1)) * sm(.25, .55, Z)
        hd = .80 * sm(0., 1., t)
        out.append({'lidU_' + tag: 1 - hd, 'head': hd} if hd > 1e-3 else {'lidU_' + tag: 1.})
    return out
def leg_weights(p, lab, side):
    """the trouser leg: its top (inside the kimono) rides the hips, then the thigh, the shin from the knee; the bun foot rigid"""
    x, y, z = p
    if lab.startswith('foot'): return {'foot_' + side: 1}
    hips = .60 * sm(.28, .35, z); shin = 1 - sm(.135, .195, z); foot = 1 - sm(.072, .094, z)
    return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
_TS = np.linspace(0, 1, 401); _TC = np.array([catmull(TAIL_PTS, t) for t in _TS])
T_HIP = .08                                       # the hidden root under the kimono (t < 0.08) stays on hips; blends into tail1 by its head
def tail_weights(p):
    d = np.linalg.norm(_TC - np.array(p), axis=1); k_ = int(np.argmin(d)); t = float(_TS[k_])
    if k_ == len(_TS) - 1: t = 1.0
    T = TAIL_T
    if t <= T_HIP: return {'hips': 1}
    if t <= T[0]: f = sm(T_HIP, T[0], t); return {'hips': 1 - f, 'tail1': f}
    if t >= T[3]: return {'tail4': 1}
    for i in range(3):
        if T[i] <= t <= T[i + 1]:
            f = sm(T[i], T[i + 1], t); return {'tail%d' % (i + 1): 1 - f, 'tail%d' % (i + 2): f}

# ---------------------------------------------------------------- the armature
HERO = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'jaw']
for tag in 'LR': HERO += [k_ + '_' + tag for k_ in ('eye', 'lidU', 'lidD', 'brow', 'lip', 'ear', 'earTip', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot')]
HERO += ['tail1', 'tail2', 'tail3', 'tail4']
PARENT = {'root': None, 'hips': 'root', 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'jaw': 'head',
          'tail1': 'hips', 'tail2': 'tail1', 'tail3': 'tail2', 'tail4': 'tail3'}
for tag in 'LR':
    PARENT.update({f'eye_{tag}': 'head', f'lidU_{tag}': 'head', f'lidD_{tag}': 'head', f'brow_{tag}': 'head', f'lip_{tag}': 'head',
                   f'ear_{tag}': 'head', f'earTip_{tag}': f'ear_{tag}', f'upperarm_{tag}': 'chest', f'forearm_{tag}': f'upperarm_{tag}',
                   f'hand_{tag}': f'forearm_{tag}', f'thigh_{tag}': 'hips', f'shin_{tag}': f'thigh_{tag}', f'foot_{tag}': f'shin_{tag}'})
assert len(HERO) == 37 and set(HERO) == set(P), set(HERO) ^ set(P)
adata = bpy.data.armatures.new('Yuzu_game_skeleton'); arm = bpy.data.objects.new('Yuzu_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'          # = three.js 'XYZ' order under the game axis mapping
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
for k_ in range(2):
    off = k_ * (D + 1) * n
    for j in range(D):
        for i in range(n - 1): cav_f.append((off + j * n + i, off + j * n + i + 1, off + (j + 1) * n + i + 1, off + (j + 1) * n + i))
for i in range(n - 1): cav_f.append((D * n + i, D * n + i + 1, (2 * D + 1) * n + i + 1, (2 * D + 1) * n + i))
for i in (0, n - 1):
    for j in range(D): cav_f.append((j * n + i, (j + 1) * n + i, (D + 2 + j) * n + i, (D + 1 + j) * n + i))
def make_mesh(name, coords, polys, chart):
    me_ = bpy.data.meshes.new(name); me_.from_pydata(coords, [], polys); me_.update(); layer_ = me_.uv_layers.new(name='Atlas')
    for p in me_.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer_.data[l].uv = tuple(au(chart, .5, .5))
    ob_ = bpy.data.objects.new(name, me_); bpy.context.collection.objects.link(ob_); me_.materials.append(MAT); return ob_
mouth = make_mesh('Yuzu_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZM))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .032
tongue_c = np.array([0, ty, MZM - .022 * W]); tr_ = np.array([.050 * W, .040 * W, .012 * W])
tv = []; tf = []; seg, rows_ = 12, 6
for j in range(rows_ + 1):
    ph = math.pi * j / rows_
    for i in range(seg):
        a = 2 * math.pi * i / seg; tv.append(tuple(tongue_c + tr_ * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), math.cos(ph)])))
for j in range(rows_):
    for i in range(seg): tf.append((j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i))
tongue = make_mesh('Yuzu_tongue', tv, tf, 'tongue')
bm = bmesh.new(); bm.from_mesh(tongue.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(tongue.data); bm.free()
for l in tongue.data.uv_layers.active.data: l.uv = tuple(au('tongue', .5, .5))

# ---------------------------------------------------------------- bind
def bind(o, weights):
    o.vertex_groups.clear(); groups = {b: o.vertex_groups.new(name=b) for b in HERO}
    for v, ww in zip(o.data.vertices, weights):
        pairs = sorted([(b, float(w)) for b, w in ww.items() if w > 1e-4], key=lambda t: (-t[1], t[0]))[:4]
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
    if nm == 'Yuzu_head': weights = [face_weights(p, l, k_) for p, l, k_ in zip(pp, lab, vkind)]
    elif nm.startswith('Yuzu_eye_'): weights = [{'eye_' + nm[-1]: 1} for p in pp]
    elif nm.startswith('Yuzu_lash_'): weights = lash_weights(pp, nm[-1])                       # the lash rides the upper lid's edge
    elif nm.startswith('Yuzu_ear_'): weights = [ear_weights(p, 1 if nm[-1] == 'L' else -1) for p in pp]
    elif nm == 'Yuzu_band': weights = [{'head': 1} for p in pp]                              # the director: rigid on the head
    elif nm == 'Yuzu_tail': weights = [tail_weights(p) for p in pp]
    elif nm in ('Yuzu_body', 'Yuzu_flap'): weights = [bell_weights(p) for p in pp]
    elif nm == 'Yuzu_obi': weights = [obi_weights(p, l) for p, l in zip(pp, lab)]
    elif nm == 'Yuzu_collar': weights = [collar_weights(p) for p in pp]
    elif nm.startswith('Yuzu_sleeve_'): weights = [sleeve_weights(p, nm[-1]) for p in pp]
    elif nm.startswith('Yuzu_arm_'): weights = [arm_weights(p, nm[-1]) for p in pp]
    elif nm.startswith('Yuzu_leg_'): weights = [leg_weights(p, l, nm[-1]) for p, l in zip(pp, lab)]
    else: raise KeyError(nm)
    bind(o, weights); objects.append(o)
bind(mouth, cav_w); bind(tongue, [{'jaw': 1} for v in tongue.data.vertices]); objects += [mouth, tongue]
for o, b in lid_objects: bind(o, [{b: 1} for v in o.data.vertices]); objects.append(o)

# ---------------------------------------------------------------- checks and save
total = 0
for o in objects:
    o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
    assert len(o.modifiers) == 1 and o.modifiers[0].type == 'ARMATURE', o.name
    for v in o.data.vertices: assert 1 <= len(v.groups) <= 4 and abs(sum(g.weight for g in v.groups) - 1) < 1e-6, (o.name, v.index)
print('TRI_TOTAL', total, flush=True); assert total <= 34000, total
hidden = {}
for o, bname in lid_objects:
    piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for ang in ([0.0] if bname.startswith('lidU') else [0.0, -.10]):
        Vr = rot_axis(V, piv, hinge(bname[-1]), ang); sd = head_sdf(Vr)
        op = LD.in_opening(bname[-1], Vr)
        hidden[f'{o.name}@{ang}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum()),
                                    'over_opening_count': int(op.sum())}
def cam_up(yaw_deg, elev_deg):
    e = math.radians(elev_deg); y = math.radians(yaw_deg)
    d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
    right = np.cross(-d, [0, 0, 1.]); right /= np.linalg.norm(right); up = np.cross(right, -d); return up
def edge_screen(sq):
    out = {}
    for o, bname in lid_objects:
        if not bname.startswith('lidU'): continue
        tag = bname[-1]; s_ = 1 if tag == 'L' else -1; info = LID_PAINT['lidU.' + tag]
        E = rot_axis(info['V'][0], np.array(P[bname]), hinge(tag), sq); vis = LD.eye_sr(tag, E) < .97
        Ev = E[vis]
        if len(Ev) < 3: out[tag] = 'edge not over the opening'; continue
        Ev = Ev[np.argsort(s_ * Ev[:, 0])]
        res = {}
        for nm_, (yaw, el) in (('front', (0, 0)), ('game0', (0, 35.5)), ('game+45', (45, 35.5)), ('game-45', (-45, 35.5))):
            h = Ev @ cam_up(yaw, el) / W
            res[nm_] = {'outer_minus_inner_W': round(float(h[-1] - h[0]), 4), 'mid_minus_inner_W': round(float(h[len(h) // 2] - h[0]), 4)}
        X_, Z_ = LD.eye_XZ(tag, Ev); res['covers_mid_frac'] = round(float((1 - Z_[len(Z_) // 2]) / 2), 3)
        out[tag] = res
    return out
EDGES = {round(float(sq_), 3): edge_screen(sq_) for sq_ in (.08, SQ_U, .15, SA(.488))}
print('EDGE_SCREEN', json.dumps(EDGES), flush=True)
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Yuzu_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
def proud_sweep(o, bname):
    tag = bname[-1]; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices]); out = {}
    angs = np.round(np.linspace(0, SHUT, 13), 3) if bname.startswith('lidU') else np.round([0., -.10, -.18, -.24, -.30, -.34], 3)
    for a in angs:
        Va = rot_axis(V, piv, hinge(tag), a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985); sd = np.where(op, -9., head_sdf(Va))
        bad = sd > .0005; out[float(a)] = [int(bad.sum()), round(float(sd.max()) * 1000, 1)]
    return out
PROUD = {o.name: proud_sweep(o, b) for o, b in lid_objects}
print('PROUD', json.dumps(PROUD), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'yk-yuzu-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'lidClose': SHUT, 'squint_designed_for': [SQ_U, LOW_T],
       'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'lash_sweep': LASH_SWEEP, 'shut_U_band': RIB_DIAG, 'happy_edge_screen': EDGES, 'proud_outside_opening(count, max_mm)': PROUD, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids turn about the tilted hinge (cos t, +-sin t, 0) through their bone head (HERO_MODELS lidTilt = t).',
                 'The lash rolls (Yuzu_lash_L/R) are weighted 100% to lidU_L/R and ride the upper lid, whose rest edge runs just under the roll.',
                 'Upper-lid colour = the head paint (mask, blush) at the near-shut pose, per side; shading normals = the skin normals over lidU 0.65-1.0 of lidClose (0.50).',
                 'Headband rigid on the head; the obi knot on the spine; the tail root under the kimono on the hips, then tail1-4.',
                 'Kimono + over panel: hips / spine / chest, the hem following the thighs (0.36 at the hem). Trousers: hips -> thigh -> shin.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2, default=float))
print('YUZU_RIG', json.dumps({'bones': len(HERO), 'triangles': total}), flush=True)
