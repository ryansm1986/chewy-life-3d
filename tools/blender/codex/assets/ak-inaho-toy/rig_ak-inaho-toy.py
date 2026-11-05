"""Inaho (ak-inaho-toy) phase 2: the 37-bone hero rig (from Chiku's, tools/blender/codex/assets/tk-chiku-toy). Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_ak-inaho-toy.py

Adapted from the Usagi rig (tools/blender/codex/assets/usagi-toy/rig_usagi-toy.py; the model builds share their machinery).
Runs build_ak-inaho-toy.py in RIG_MODE (part labels; lid / cavity / tongue charts in the free atlas block; nothing approved is
written), then adds:
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - the mouth: the skin parted along the painted 'w' smile between sealed corners, a closed cavity and a tongue;
  - eyelids: rigid shells on tilted hinges (HERO_MODELS lidTilt), just outside the eyeball, painted with the skin round the eye
    (blush on); the lash ribbons (Inaho_lash_L/R, built by the model) are 100 % lidU, so the lash rides the lid's edge;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum).
Saves ak-inaho-toy_rig.blend (only Armature modifiers left), joints-rig.json and rig-part-labels.json.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_ak-inaho-toy.py').read_text(encoding='utf-8')
os.environ.setdefault('REFINE_ADD', '620'); os.environ.setdefault('REFINE_DT', '.30')     # the rig's head: more toon-band refinement on the same field
ns = {'__file__': str(ROOT / 'build_ak-inaho-toy.py'), '__name__': 'inaho_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_ak-inaho-toy.py'), 'exec'), ns)
W, CHIN, HY, SW = ns['W'], ns['CHIN'], ns['HY'], ns['SW']
def u(x): return x * SW                                    # a Tanuki build-unit length -> Inaho metres
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MZ, MHW = ns['MZ'], ns['MHW']
smooth, au, MAT, M2L, L2M = ns['smooth'], ns['au'], ns['MAT'], ns['M2L'], ns['L2M']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
os.makedirs(ROOT / 'export', exist_ok=True)

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
JB = ns['JOINTS_BODY']
ARM = {s: {'upperarm': tuple(JB['arms'][t]['shoulder']), 'forearm': tuple(JB['arms'][t]['elbow']), 'hand': tuple(JB['arms'][t]['wrist'])}
       for s, t in ((1, 'L'), (-1, 'R'))}
LEG = {s: {'thigh': tuple(JB['legs'][t]['hip']), 'shin': tuple(JB['legs'][t]['knee']), 'foot': tuple(JB['legs'][t]['ankle'])} for s, t in ((1, 'L'), (-1, 'R'))}
# the painted 'w' smile: the same Catmull-Rom as paint_head
_MP = ns['cpath'](ns['MOUTH_P'], 44)
MX = _MP[:, 0] * W; MZS = CHIN + _MP[:, 1] * W
XL_C, XR_C = float(MX[0]), float(MX[-1])                     # the mouth corners (her right, her left)
def smile_z(x): return float(np.interp(x, MX, MZS))
CUT_L, CUT_R = .94 * XL_C, .94 * XR_C
def in_cut(x, k=1.): return (k * CUT_L) < x < (k * CUT_R)
def cut_frac(x): return x / CUT_R if x >= 0 else x / CUT_L          # 0 at the centre .. 1 at the cut's end, each side
neck_c = L2M(np.array(ns['NECK'][0]))
mouth_y = float(front_hit(0., smile_z(0.))[0]); corner_z = .5 * (smile_z(XL_C) + smile_z(XR_C))
P = {'root': (0, -.010, 0), 'hips': tuple(JB['hips']), 'spine': tuple(JB['spine']), 'chest': tuple(JB['chest']),
     'neck': tuple(JB['neck']),
     'head': (0, float(neck_c[1]) + u(.060), CHIN + u(.001)),               # skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                             # the hinge inside the head, 0.22 W behind the smile
BROW_Z = CHIN + .568 * W
# ears: ear_ where each ear leaves the straw hat's crown (ray from the tip down the ear's axis to the hat), earTip_ halfway up
# the free part (director: the ears bend only above the crown, earTip_ over their upper half)
def tree_of(o):
    o.data.calc_loop_triangles(); return BVHTree.FromPolygons([v.co[:] for v in o.data.vertices], [tuple(t.vertices) for t in o.data.loop_triangles])
hat_tree = tree_of(OBJ['Inaho_hat'])
EB, EU, ENf, EA = ns['ear_frame'](); EL = ns['EAR']['L']
EAR_T = {}
for s, tag in ((1, 'L'), (-1, 'R')):
    mir = np.array([s, 1, 1.])
    tipm = L2M((EB + EU * EL) * mir); basem = L2M(EB * mir); d = Vector(basem - tipm).normalized()
    h = hat_tree.ray_cast(Vector(tipm), d, 2.)
    t_hat = float(((M2L(np.array(h[0])) * mir - EB) @ EU) / EL)
    t_tip = t_hat + .5 * (1 - t_hat)
    EAR_T[tag] = (t_hat, t_tip)
    P['ear_' + tag] = tuple(float(v) for v in L2M((EB + EU * EL * t_hat) * mir))
    P['earTip_' + tag] = tuple(float(v) for v in L2M((EB + EU * EL * t_tip) * mir))
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * .211 * W, float(front_hit(s * .211 * W, BROW_Z)[0]) + u(.012), BROW_Z)
    xc = XR_C if s > 0 else XL_C; zc = smile_z(xc)
    P['lip_' + tag] = (xc, float(front_hit(xc, zc)[0]) + u(.002), zc)
    for k, v in ARM[s].items(): P[k + '_' + tag] = v
    for k, v in LEG[s].items(): P[k + '_' + tag] = v
TLC = np.array(JB['tail'][0]); TL_ROOT = TLC - np.array([0, .045, 0])
for i, dy in enumerate((0., .045, .080, .110)): P['tail%d' % (i + 1)] = tuple(float(c) for c in (TL_ROOT + np.array([0, dy, 0])))
print('EAR_T', json.dumps(EAR_T), flush=True)

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Inaho_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Inaho_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Inaho_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def front_y(x, z, tag):
    a = ray_y(eye_tree[tag], x, z); b = ray_y(skin_tree, x, z)
    c = [v for v in (a, b) if v is not None]; return min(c) if c else None

# ---------------------------------------------------------------- eyelids (the Sasa construction, tools/blender/codex/assets/tk-sasa-toy)
# Rigid shells about the game's tilted lid hinge (HERO_MODELS lidTilt: Blender (cos t, +-sin t, 0) through the bone head).
# Director (round 2 note): the lash ribbons (Inaho_lash_L/R) are 100 % lidU, so the upper lid is designed AT REST with its edge
# running just under the ribbon's centre line; per column, a circle about the hinge through the skin at the hole's top carries
# the edge down over the eye: shut (+1.22) the ribbon lands on the lower rim as one clear lash curve. The lower lid is built at
# the happy pose (-0.24) hugging the eye with an upward arch, then turned back to the neutral -0.10 under the cheek.
sys.path.insert(0, str(ROOT))
import rig_lids
from rig_lids import rot_axis
ns['lid_edge_Z'] = lambda X: 1.25 + 0 * np.asarray(X, float)        # the open eye: the whole opening shows at rest
ns['eye_axes'] = {}
for tag_, s_ in (('L', 1), ('R', -1)):
    Sc_ = np.array([s_ * EX, float(front_hit(s_ * EX, EZ)[0]), EZ]); ns['eye_axes'][tag_] = ns['grad_n'](Sc_[None])[0]
LID_TILT = round(float(np.mean([math.atan2(s_ * ns['eye_axes'][t_][0], -ns['eye_axes'][t_][1]) for t_, s_ in (('L', 1), ('R', -1))])), 4)
LD = rig_lids.Lids(ns, eye_tree)
def hinge(tag): return LD.hinge(tag, LID_TILT)
print('LID_TILT', LID_TILT, 'hinge L', hinge('L').round(4).tolist(), flush=True)
SQ_U = float(os.environ.get('SQ_U', '.40')); SQ_D = float(os.environ.get('SQ_D', '-.24'))     # the suggested heroModels squint
LOW_T = float(os.environ.get('LOW_T', '-.30'))     # the lower lid's design pose: 0.06 rad past the game's -0.24, so the neutral -0.10 hides it
LASH_SAG = float(os.environ.get('LASH_SAG', '.50'))      # the shut U's depth: 0.25 of the eye's height (EHH units)
LASH_EDGE_K = float(os.environ.get('LASH_EDGE_K', '.30')); LID_LIFT = float(os.environ.get('LID_LIFT', '-.0006'))
_C2 = ns['LASH_C2']; _HW = ns['LASH_HW']
def lash_edge_Z(X):
    """the upper lid's rest edge (EHH): under the ribbon's centre line by LASH_EDGE_K of its half-width"""
    return float(np.interp(X, _C2[:, 0], _C2[:, 1] - LASH_EDGE_K * _HW))
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
def skin_normals(Vrest, piv, k, a_max, n_a=13, w_end=8.):
    """shading normals: the head ball's own normal under each vertex, averaged in the lid's frame over every angle at which
    the vertex shows (the end pose weighted), so the moving lid meets the skin round it without a lighter patch"""
    acc = np.zeros_like(Vrest)
    for a in np.linspace(0, a_max, n_a):
        Pp = rot_axis(Vrest, piv, k, a); vis = head_sdf(Pp) > -.0006
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        n = rot_axis(ns['grad_n'](Q), np.zeros(3), k, -a)
        w = np.where(vis, w_end if a == a_max else 1., 0.)
        if a == a_max: w = np.maximum(w, 1e-3)
        acc += w[:, None] * n
    return acc / np.linalg.norm(acc, axis=1, keepdims=True)
def cap_radii(V, piv, k, angs, tag, floor_angs, nr, nc, margin=.0008, eye_gap=.0006, keep_rows=0):
    """shrink radii (about the hinge) of the vertices that would stand out of the skin outside the opening at any test angle,
    never into the eye where they are over it; smoothed over the grid; the shell stays rigid"""
    c = V - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u_ = rad / r[:, None]
    need = np.zeros(len(V)); floor = np.full(len(V), -9.)
    for a in angs:
        Va = rot_axis(V, piv, k, a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985)
        sd = head_sdf(Va); bad = (~op) & (sd > -margin); need[bad] = np.maximum(need[bad], sd[bad] + margin)
    for a in floor_angs:
        Va = rot_axis(V, piv, k, a); op = LD.eye_sr(tag, Va) < 1.0
        if op.any():
            idx = np.where(op)[0]; ed = LD.eye_dist(Va[idx], piv, k, tag); ok = np.isfinite(ed)
            floor[idx[ok]] = np.maximum(floor[idx[ok]], ed[ok] + eye_gap)
    sh = need.reshape(nr, nc); raw = sh.copy()
    for _ in range(10):
        p_ = np.pad(sh, 1, mode='edge'); sh = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
        sh = np.maximum(sh, raw)
    if keep_rows: sh[:keep_rows] = np.minimum(sh[:keep_rows], raw[:keep_rows])
    r_new = np.maximum(r - sh.ravel(), floor)
    return piv + ax + u_ * r_new[:, None], {'capped': int((r_new < r - 1e-6).sum()), 'max_shrink_mm': round(float((r - r_new).max()) * 1000, 1)}
# the lever: the pivot B behind the eye's surface centre (along its axis) and Zo eye-heights above it. Each candidate lid is built
# and capped in full; the score: the shut edge on the lower rim, ~28 % squint cover, and (heavily) any body standing out of the
# skin outside the opening at any angle (it read as a goggle outline round the shut eye) or dipping into the eye
UP_ROWS = np.r_[np.linspace(0, .12, 5), np.linspace(.12, 1.55, 13)[1:]]       # body angles above the edge (fine at the edge; the hidden body coarser)
def build_upper(tag, B, Zo):
    k = hinge(tag); L = LD.upper3(tag, LID_TILT, B, Zo, u_sq=0., sink=-LID_LIFT, zfun=lash_edge_Z); cols = L['cols']; nc = len(cols)
    V = np.array([np.array([rot_axis(c_['E'][None], c_['A'], k, -al)[0] for c_ in cols]) for al in UP_ROWS]); nr = V.shape[0]; piv = L['Pv']
    Vf, capinfo = cap_radii(V.reshape(-1, 3), piv, k, np.linspace(0, 1.22, 25), tag, np.linspace(0, 1.22, 25), nr, nc, keep_rows=2)
    return L, Vf.reshape(nr, nc, 3), piv, capinfo
def lever_score(B, Zo):
    L, V, piv, _ = build_upper('L', B, Zo); k = hinge('L'); c = len(L['cols']) // 2; Er = V[0, c]
    _, Zs = LD.eye_XZ('L', rot_axis(Er[None], piv, k, 1.22)[0]); _, Zq = LD.eye_XZ('L', rot_axis(Er[None], piv, k, SQ_U)[0])
    z0 = lash_edge_Z(0.); cover = (z0 - Zq) / (z0 + 1.)
    sc2 = LD.score2(dict(L, V=V), angs=np.linspace(0, 1.22, 7)); out = max(sc2['out_of_skin_mm_by_angle'].values())
    return abs(Zs - (-1.03)) + .6 * abs(cover - .28) + .25 * max(out + .5, 0) + .25 * max(-sc2['eye_clear_min_mm'], 0), Zs, cover, out, sc2['eye_clear_min_mm']
best = None
for B in (.085, .092, .099, .106, .113):        # the geometry: the rim's top and bottom equidistant from a hinge level with the eye,
    for Zo in (-.10, 0., .10):                   # 1.22 rad apart -> ~9-11 cm behind the eye (the first coarse search, 4.5-8.5 cm, never shut)
        try: r_ = lever_score(B, Zo)
        except Exception as ex: print('LEVER_FAIL', B, Zo, repr(ex), flush=True); continue
        print('LEVER_CAND', B, Zo, [round(float(v), 3) for v in r_], flush=True)
        if best is None or r_[0] < best[0][0]: best = (r_, B, Zo)
LID_B, LID_ZO = float(os.environ.get('LID_B', best[1])), float(os.environ.get('LID_ZO', best[2]))
print('LEVER', json.dumps({'B': LID_B, 'Zo': LID_ZO, 'score': [round(float(v), 3) for v in best[0]]}), flush=True)
# rig round 2 (director, in game): the shut lid read as a raised disc with a contour. Shut, every vertex over the opening sits on the
# skin field (which runs on unbroken over the eye hole) +0.3 mm, or 0.6 mm in front of the eyeball where the eye bulges; just outside
# the rim it dives 0.9 mm under the skin; then the shell is re-capped so rest and the mid-blink stay hidden / clear of the eye
FLUSH = float(os.environ.get('FLUSH', '.0003'))
def flush_shut(tag, V, piv, k):
    nr, nc = V.shape[:2]; flat = V.reshape(-1, 3).copy()
    c = flat - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u_ = rad / r[:, None]
    Vs = rot_axis(flat, piv, k, 1.22); sr = LD.eye_sr(tag, Vs); n_set = 0
    for i in np.where(sr < 1.30)[0]:
        A = piv + ax[i]; D = rot_axis(u_[i][None], np.zeros(3), k, 1.22)
        ds = float(LD.skin_dist_dirs(A, D)[0])
        if sr[i] < 1.0:
            ed = LD.eye_dist(Vs[i][None], piv, k, tag)[0]
            rt = ds + FLUSH
            if np.isfinite(ed): rt = max(rt, ed + .0006)
            r[i] = rt; n_set += 1
        else:
            r[i] = min(r[i], ds - .0009)
    flat = piv + ax + u_ * r[:, None]
    FLOOR_A0 = float(os.environ.get('FLOOR_A0', '.50'))      # the eye floor from here on (earlier, the edge rows ride the sunk upper rim)
    EYE_GAP_SHUT = float(os.environ.get('EYE_GAP_SHUT', '-.0030'))   # the riding ribbon covers the edge rows' few mm in the eye mid-blink
    flat, cap2 = cap_radii(flat, piv, k, np.linspace(0, 1.22, 25), tag, np.linspace(FLOOR_A0, 1.22, 19), nr, nc, keep_rows=2, eye_gap=EYE_GAP_SHUT)
    Vs = rot_axis(flat, piv, k, 1.22); sr = LD.eye_sr(tag, Vs); sd = head_sdf(Vs)
    rim = (sr > .85) & (sr < 1.0); mid = sr < .85
    if os.environ.get('FLUSH_MAP'):
        op_ = sr < 1.0; idx_ = np.where(op_)[0]
        print('FLUSH_HIST', tag, np.percentile(sd[op_] * 1000, [10, 50, 90, 99]).round(2).tolist(), flush=True)
        for i_ in idx_[np.argsort(-sd[idx_])][:10]:
            j_, c_ = divmod(int(i_), nc); X__, Z__ = LD.eye_XZ(tag, Vs[i_])
            print('FLUSH_TOP', tag, 'row', j_, 'col', c_, 'X %.2f Z %.2f sr %.2f proud %.1f mm' % (float(X__), float(Z__), float(sr[i_]), float(sd[i_]) * 1000), flush=True)
    return flat.reshape(nr, nc, 3), {'set': n_set, 'recap': cap2, 'shut_rim_proud_mm_max': round(float(sd[rim].max()) * 1000, 2) if rim.any() else None,
                                     'shut_mid_proud_mm_max': round(float(sd[mid].max()) * 1000, 2) if mid.any() else None}
def skin_normals_near_shut(Vrest, piv, k, angs=np.linspace(.80, 1.22, 8), w_end=8.):
    """shading normals from the skin's own normal under each vertex at the near-shut poses only (0.80-1.22, the shut pose weighted)"""
    acc = np.zeros_like(Vrest)
    for a in angs:
        Pp = rot_axis(Vrest, piv, k, a); Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        n = rot_axis(ns['grad_n'](Q), np.zeros(3), k, -a)
        acc += (w_end if a == angs[-1] else 1.) * n
    return acc / np.linalg.norm(acc, axis=1, keepdims=True)
for tag in 'LR':
    s = 1 if tag == 'L' else -1; k = hinge(tag)
    L, V, piv, capinfo = build_upper(tag, LID_B, LID_ZO); nr, nc = V.shape[0], V.shape[1]
    V, flushinfo = flush_shut(tag, V, piv, k); capinfo['flush'] = flushinfo
    print('FLUSH', tag, json.dumps(flushinfo), flush=True)
    uv = np.stack(np.meshgrid(L['uu'], UP_ROWS / UP_ROWS[-1]), -1)
    ob = mesh_grid('Inaho_lidU_' + tag, V, uv, 'lidU.' + tag, nr, nc); orient_out(ob, piv, k)
    NRM = skin_normals_near_shut(V.reshape(-1, 3), piv, k)
    ob.data.normals_split_custom_set([tuple(NRM[ob.data.loops[l].vertex_index]) for l in range(len(ob.data.loops))])
    lid_objects.append((ob, 'lidU_' + tag)); P['lidU_' + tag] = tuple(float(c) for c in piv)
    LID_PAINT['lidU.' + tag] = dict(V=V, piv=piv, k=k, ang=1.22, blush=True, edge=False)
    sc_ = LD.score2(dict(L, V=V)); sc_.pop('worst(a, colX, row, mm, X, Z)', None)
    lid_info['Inaho_lidU_' + tag] = {'pivot': [round(float(c), 5) for c in piv], 'lever_B_m': LID_B, 'lever_Zo_EHH': LID_ZO, 'cap': capinfo,
                                     'columns(X, r_b_mm, eye_clear_mm, hid_above_mm, hid_below_mm)': L['diag'], **sc_}
    Lo = LD.lower(tag, LID_TILT, dz=float(os.environ.get('LOW_DZ', '.5')), arch_c=float(os.environ.get('ARCH_C', '.88')), arch_e=float(os.environ.get('ARCH_E', '.36')), target=LOW_T)
    Vl = np.transpose(Lo['V'], (1, 0, 2)).copy(); nrl, ncl = Vl.shape[0], Vl.shape[1]; pivl = Lo['Pv']
    Vlf, capl = cap_radii(Vl.reshape(-1, 3), pivl, k, (.04, 0., -.05, -.10, -.16, -.20, -.24, -.28, -.32), tag, (-.30, -.24, -.20), nrl, ncl, margin=.0014)
    Vl = Vlf.reshape(nrl, ncl, 3)
    # tuck: rows that stand out of the cheek at the hidden angles (they swing down into the forward-bulging lower cheek) and are
    # outside the opening move in along the skin normal, 1.4 mm under it; at the happy pose they are already inside the cheek
    Vt_ = Vl.reshape(-1, 3).copy(); tucked = 0
    for _ in range(4):
        for ang in (.04, 0., -.05, -.10, -.16):
            Va = rot_axis(Vt_, pivl, k, ang); sd = head_sdf(Va); bad = (sd > -.0014) & (LD.eye_sr(tag, Va) > 1.02)
            if not bad.any(): continue
            tucked = max(tucked, int(bad.sum())); g_ = ns['grad_n'](Va[bad]); Va[bad] = Va[bad] - g_ * (sd[bad] + .0016)[:, None]
            Vt_ = rot_axis(Va, pivl, k, -ang)
    Vl = Vt_.reshape(nrl, ncl, 3); capl['tucked_max'] = tucked
    uvl = np.stack(np.meshgrid((Lo['Xs'] - Lo['Xs'][0]) / (Lo['Xs'][-1] - Lo['Xs'][0]), np.linspace(0, 1, nrl)), -1)
    obl = mesh_grid('Inaho_lidD_' + tag, Vl, uvl, 'lidD.' + tag, nrl, ncl); orient_out(obl, pivl, k)
    NRl = skin_normals(Vl.reshape(-1, 3), pivl, k, SQ_D)          # shaded for the game's happy pose
    obl.data.normals_split_custom_set([tuple(NRl[obl.data.loops[l].vertex_index]) for l in range(len(obl.data.loops))])
    lid_objects.append((obl, 'lidD_' + tag)); P['lidD_' + tag] = tuple(float(c) for c in pivl)
    LID_PAINT['lidD.' + tag] = dict(V=Vl, piv=pivl, k=k, ang=SQ_D, blush=False, edge=True)
    lid_info['Inaho_lidD_' + tag] = {'pivot': [round(float(c), 5) for c in pivl], 'cap': capl}
print('LIDS', json.dumps(lid_info, default=float), flush=True)

# rig round 2 (director): the shut lash read as a thin flat line. The ribbon is rebuilt as a roll: the same visible face as the model's
# (so rest looks the same), its back 10 mm deep inside the skin / eye (hidden at rest), so shut the 45-deg cameras see a thick body;
# the U is painted on the upper lid in its shut position (two arms rising from the ribbon's ends, see paint_lids), because a rigid
# ribbon that follows the top rim at rest always lands level or slightly arched with this hinge
LASH_IN = float(os.environ.get('LASH_IN', '.0100')); RIB_SHUT = {}
def rebuild_lash(tag):
    s_ = 1 if tag == 'L' else -1; o = OBJ['Inaho_lash_' + tag]
    C2 = ns['LASH_C2']; NLT = len(C2) - 1; tt = np.linspace(0, 1, NLT + 1); NLS = 9
    S_, n_ = ns['eye_pt'](s_, C2[:, 0], C2[:, 1])
    tg = np.gradient(S_, axis=0); tg = ns['unit'](tg - n_ * (tg * n_).sum(1, keepdims=True)); sd = ns['unit'](np.cross(n_, tg))
    hw = ns['LASH_HW'] * EHH
    hp = (.0075 * W) * (.55 + .45 * smooth(0, .25, tt)) * (1 - .60 * smooth(.80, 1.0, tt))
    Vv = []; NV = []
    for i in range(NLT + 1):
        for kk in range(NLS):
            a = 2 * math.pi * kk / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * sa if sa > 0 else LASH_IN * sa
            Vv.append(S_[i] + sd[i] * hw[i] * ca + n_[i] * (up - .0010 * W))
            NV.append(ns['unit'](sd[i] * ca / max(hw[i], 1e-4) + n_[i] * sa / max(hp[i] if sa > 0 else LASH_IN, 1e-4)))
    Vv = np.array(Vv); NV = np.array(NV)
    tip = len(Vv); Vv = np.vstack([Vv, S_[-1] + tg[-1] * hw[-1] * .7 + n_[-1] * (.25 * hp[-1])]); NV = np.vstack([NV, tg[-1]])
    root = len(Vv); Vv = np.vstack([Vv, S_[0] - tg[0] * hw[0] * .8 + n_[0] * (.2 * hp[0])]); NV = np.vstack([NV, -tg[0]])
    F = []
    for i in range(NLT):
        for kk in range(NLS):
            a_, b_ = i * NLS + kk, i * NLS + (kk + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for kk in range(NLS): F.append((NLT * NLS + kk, NLT * NLS + (kk + 1) % NLS, tip))
    for kk in range(NLS): F.append(((kk + 1) % NLS, kk, root))
    me = bpy.data.meshes.new('Inaho_lash_' + tag + '_roll'); me.from_pydata(Vv.tolist(), [], F); me.update()
    lay = me.uv_layers.new(name='Atlas'); UVv = ns['ramp_uv']('lash', ns['sval'](NV, 0., hi=.30, lo=.10))
    for li, l in enumerate(lay.data): l.uv = tuple(float(c) for c in UVv[me.loops[li].vertex_index])
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    for p_ in me.polygons: p_.use_smooth = True
    me.materials.append(MAT); o.data = me; labels[o.name] = ['lash.' + tag] * len(me.vertices)
    Sc = rot_axis(S_ + n_ * (.5 * hp)[:, None], np.array(P['lidU_' + tag]), hinge(tag), 1.22); Xs_, Zs_ = LD.eye_XZ(tag, Sc)
    RIB_SHUT[tag] = (np.asarray(Xs_, float), np.asarray(Zs_, float))
    print('RIB_SHUT', tag, 'X', np.round(Xs_[::5], 2).tolist(), 'Z', np.round(Zs_[::5], 2).tolist(), flush=True)
for tag in 'LR': rebuild_lash(tag)

EYE_FRAME = {t_: {'a_measured': math.atan2(s_ * ns['eye_axes'][t_][0], -ns['eye_axes'][t_][1])} for t_, s_ in (('L', 1), ('R', -1))}

def paint_lids():
    """each lid texel takes the head's own paint where it lies at its end pose (shut: the upper lid; happy: the lower one), blush
    on for the upper lid, no lash (the riding ribbon is the lash); the lower lid's top edge gets a soft dark arch"""
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    def paint_at(Pw, blush):
        d = Pw - ns['O']; d /= np.linalg.norm(d, axis=1, keepdims=True); uv = ns['head_uv'](d)
        ns['PAINT_OPTS']['band'] = False; ns['PAINT_OPTS']['blush'] = blush
        C = np.asarray(ns['paint_head'](uv[:, 0], uv[:, 1])).reshape(-1, 3)
        ns['PAINT_OPTS']['band'] = True; ns['PAINT_OPTS']['blush'] = True
        return C
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]; V = info['V']; nr, nc = V.shape[0], V.shape[1]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        fi = U * (nc - 1); i0 = np.clip(np.floor(fi).astype(int), 0, nc - 2); a = fi - i0
        fj = Vv * (nr - 1); j0 = np.clip(np.floor(fj).astype(int), 0, nr - 2); b = fj - j0
        G = (V[j0, i0] * ((1 - a) * (1 - b))[..., None] + V[j0, i0 + 1] * (a * (1 - b))[..., None]
             + V[j0 + 1, i0] * ((1 - a) * b)[..., None] + V[j0 + 1, i0 + 1] * (a * b)[..., None]).reshape(-1, 3)
        Pe = rot_axis(G, info['piv'], info['k'], info['ang'])
        C = paint_at(Pe, info['blush']).reshape(h, w, 3)
        if info['edge']: C = mix(C, rgb('#5A4234'), .70 * (1 - smooth(.035, .08, Vv)))     # the happy lower lid's soft dark arch
        if chart.startswith('lidU') and os.environ.get('LASH_U_PAINT'):     # off: any U painted on the lid shows rotated up at 0.2-0.85 (crossed dark marks)
            # the shut lash's U (rig round 2): two arms rising from the riding ribbon's line toward the corners, the middle SAG eye
            # half-heights below the ends; ~0.2 EHH (0.02 W) thick, soft-edged; under the ribbon in the middle, so it reads as one U
            tg_ = chart[-1]; Xr, Zr = RIB_SHUT[tg_]; o_ = np.argsort(Xr); X_, Z_ = LD.eye_XZ(tg_, Pe)
            X_ = np.asarray(X_, float); Z_ = np.asarray(Z_, float); ax_ = np.abs(X_)
            # the U follows the opening's own lower rim just inside it (the rim is a U ~0.25 of the eye's height deep), joining the
            # ribbon's level middle; ~0.2 EHH (0.02 W) thick, tapering at the corners, only where the shut lid shows (over the opening)
            rimZ = -np.clip(1 - np.clip(ax_, 0, 1) ** EN, 0, 1) ** (1 / EN)
            Zu = rimZ + .085 + .03 * smooth(.4, .9, ax_)
            hwz = .095 - .040 * smooth(.55, .93, ax_)
            sr_ = np.asarray(LD.eye_sr(tg_, Pe), float)
            arm = (1 - smooth(hwz - .025, hwz + .025, np.abs(Z_ - Zu))) * (1 - smooth(.985, 1.01, sr_)) * (1 - smooth(.90, .96, ax_))
            C = mix(C, rgb('lash'), arm.reshape(h, w))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'ak-inaho-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- mouth: part the skin along the 'w' line, add the cavity
FRONT_Y = HY - u(.10)
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Inaho_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'ball_head_skin' and co.z < smile_z(co.x) and in_cut(co.x) and co.y < FRONT_Y) else 'upper'
    key = (tuple(round(float(c), 7) for c in co), tuple(round(float(c), 6) for c in uv), tuple(round(float(c), 4) for c in no), lab, kind)
    if key not in cache:
        cache[key] = len(verts); verts.append(tuple(co)); vlab.append(lab); vkind.append(kind)
    return cache[key]
def emit(recs, kind):
    if len(recs) < 3: return
    for k in range(1, len(recs) - 1):
        rr = [recs[0], recs[k], recs[k + 1]]
        if (rr[1][0] - rr[0][0]).cross(rr[2][0] - rr[0][0]).length < 1e-13: continue
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
    skin = rr[0][3] == 'ball_head_skin'
    cut = skin and max(r[0].y for r in rr) < FRONT_Y and all(in_cut(r[0].x) for r in rr) and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')
    else: emit(rr, None)
me = bpy.data.meshes.new('Inaho_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, uq in zip(poly.loop_indices, uu): layer.data[l].uv = uq
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < u(.0003)) & np.array([l_ == 'ball_head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Inaho_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > u(.0016): rim.append(p)
assert len(rim) >= 10, len(rim)

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    xc = XR_C if x >= 0 else XL_C; zc = smile_z(xc)
    return .85 * math.exp(-((x - xc) / (.030 * W)) ** 2 - ((z - zc) / (.030 * W)) ** 2)
def jaw_w(x, y, z, kind):
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - NOSE_TIP_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.016 * W, .000 * W, z - smile_z(x))             # nothing above the line near the corners: no upper-lip fold
    we = sm(.60, 1., cut_frac(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.13, .26, abs(xl)); back = 1 - sm(.40, .58, b)          # the lower lip band and chin, a soft falloff into the cheeks
    return below * lat * back * (1 - sm(.23, .29, zl))
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab != 'ball_head_skin': return {'head': 1}
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-u(.22), -u(.12), y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(-.02, -.11, zl) * sm(.40, .55, b)
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
def ear_weights(p, side):
    s = 1 if side == 'L' else -1; mir = np.array([s, 1, 1.])
    t = float(((M2L(np.array(p)) * mir - EB) @ EU) / EL); t_hat, t_tip = EAR_T[side]
    hd = 1 - sm(t_hat - .10, t_hat + .06, t)       # the part inside the hat is rigid with the head (and the hat); a 6.5 cm blend, no crack
    tip = sm(t_tip - .16, t_tip + .16, t)          # the free part: ear_ at its base blending to earTip_ over the top half
    mv = 1 - hd
    return {'head': hd, 'ear_' + side: mv * (1 - tip), 'earTip_' + side: mv * tip}
def torso(z):                                       # hips / spine / chest along the body (hips 0.250, spine 0.345, chest 0.445, neck 0.555)
    h_ = 1 - sm(.225, .35, z); c_ = sm(.375, .475, z); return h_, max(0., 1 - h_ - c_), c_
def arm_t(p, s):
    sh = np.array(ARM[s]['upperarm']); wr_ = np.array(ARM[s]['hand']); d = wr_ - sh
    return float((np.array(p) - sh) @ d / (d @ d))
def tw(z): return dict(zip(('hips', 'spine', 'chest'), torso(z)))
def mixw(a, b, t):
    out = {}
    for k, v in a.items(): out[k] = out.get(k, 0) + v * (1 - t)
    for k, v in b.items(): out[k] = out.get(k, 0) + v * t
    return out
def shorts_w(x, z, side):
    # the overalls' shorts (and everything sewn on them: the cuffs, the pocket and its seams): hips at the seat and waist, each
    # leg's front and back following its thigh toward the hem (up to 90 % at the cuff; the feet sit up inside the hems)
    h_, sp_, c_ = torso(z)
    lg = .90 * sm(.025, .085, abs(x)) * sm(.33, .18, z)
    return {'hips': h_ * (1 - lg), 'spine': sp_, 'chest': c_, 'thigh_' + side: h_ * lg}
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab == 'shirt_torso':
        h_, sp_, c_ = torso(z); arm = .30 * sm(.13, .19, abs(x)) * sm(.415, .495, z)        # the shoulders lift a little with the sleeves
        return {'hips': h_, 'spine': sp_, 'chest': c_ * (1 - arm), 'upperarm_' + side: c_ * arm}
    if lab == 'overall_shorts' or lab.startswith('overall_cuff') or lab in ('overall_pocket', 'pocket_flap_seam', 'pocket_stitch'):
        return shorts_w(x, z, side)
    if lab in ('overall_bib', 'overall_waistband') or lab.startswith('overall_strap') or lab.startswith('overall_button'): return tw(z)
    if lab.startswith('bunny_foot') or lab.startswith('bunny_toe_line'):
        return {'foot_' + side: 1}
    return {'spine': 1}
def arm_weights(p, lab, t_):
    s_ = 1 if t_ == 'L' else -1; t = arm_t(p, s_)
    if lab.startswith('fur_mitten_arm'):         # t = the fraction from the shoulder (0) to the wrist (1); the elbow at 0.66
        up = 1 - sm(.55, .76, t); hand = sm(.92, 1.06, t)
        return {'upperarm_' + t_: up, 'forearm_' + t_: (1 - up) * (1 - hand), 'hand_' + t_: (1 - up) * hand}
    if lab.startswith('puff_sleeve'):
        chest = .30 * (1 - sm(-.20, .28, t)); return {'chest': chest, 'upperarm_' + t_: 1 - chest}
    return {'upperarm_' + t_: 1}

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
adata = bpy.data.armatures.new('Inaho_game_skeleton'); arm = bpy.data.objects.new('Inaho_Rig', adata); bpy.context.collection.objects.link(arm)

# ---------------------------------------------------------------- the mouth cavity and tongue
def skin_front(x, z):
    y = ray_y(skin_tree, x, z); return y if y is not None else float(front_hit(x, z)[0])
cav_v = []; cav_w = []; cav_f = []; D = 3; n = len(rim)
for level in ('upper', 'lower'):
    for j in range(D + 1):
        t = j / D
        for x, y, z in rim:
            corner = 1 - sm(.74, 1., cut_frac(x))
            pz = z + (.010 * W if level == 'upper' else -.050 * W) * math.sin(t * math.pi * .5) * corner
            py = y + u(.0015) + .085 * W * t * (.35 + .65 * corner)
            px = x * (1 - .06 * t)
            if j: py = max(py, skin_front(px, pz) + u(.005))
            cav_v.append((px, py, pz))
            ww = face_weights((x, y, z), 'ball_head_skin', level)
            sd = 'L' if x >= 0 else 'R'
            if level == 'upper': ww = {'head': 1 - ww['lip_' + sd], 'lip_' + sd: ww['lip_' + sd]}
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
mouth = make_mesh('Inaho_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bad_ = [f for f in bm.faces if f.calc_area() < 1e-11]
if bad_: bmesh.ops.delete(bm, geom=bad_, context='FACES_ONLY')
cc = Vector((0, rim[len(rim) // 2][1] + u(.03), MZ))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + u(.045)
tongue_c = np.array([0, ty, MZ - .036 * W])
ns['parts']['head'] = []
tongue = ns['lobe']('Inaho_tongue', tongue_c, np.array([.011, .034, .044]) * W, [0, 0, 1.], 'head', ramp='hole', n=3, occ_in=0, pole=[1., 0, 0])
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)
tongue.data.materials.clear(); tongue.data.materials.append(MAT)
if tongue.data.attributes.get('cust_n') is not None: tongue.data.attributes.remove(tongue.data.attributes['cust_n'])

# ---------------------------------------------------------------- weights per object
WEIGHTS = {}
objects = []
for o in base_objects:
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]
    if o.name == 'Inaho_head': weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, vkind)]
    elif o.name.startswith('Inaho_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Inaho_ear_'): weights = [ear_weights(p, o.name[-1]) for p in pp]
    elif o.name == 'Inaho_hat': weights = [{'head': 1} for p in pp]                 # the straw hat and its band: rigid on the head
    elif o.name.startswith('Inaho_lash_'): weights = [{'lidU_' + o.name[-1]: 1} for p in pp]     # the lash rides the upper lid's edge
    elif o.name.startswith('Inaho_arm_'): weights = [arm_weights(p, l, o.name[-1]) for p, l in zip(pp, lab)]
    elif o.name == 'Inaho_tail': weights = [{'tail1': 1} for p in pp]
    else: weights = [body_weights(p, l) for p, l in zip(pp, lab)]
    WEIGHTS[o.name] = weights; objects.append(o)
WEIGHTS[mouth.name] = cav_w; WEIGHTS[tongue.name] = [{'jaw': 1} for v in tongue.data.vertices]; objects += [mouth, tongue]
labels['Inaho_mouth_cavity'] = ['mouth_cavity'] * len(mouth.data.vertices); labels['Inaho_tongue'] = ['tongue'] * len(tongue.data.vertices)
for o, b in lid_objects:
    WEIGHTS[o.name] = [{b: 1} for v in o.data.vertices]; objects.append(o); labels[o.name] = [b] * len(o.data.vertices)

# ---------------------------------------------------------------- rest checks
total = 0
for o in objects: o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
print('TRI_TOTAL', total, flush=True); assert total <= 34000, total
hidden = {}
for o, bname in lid_objects:
    piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for ang in ([0.0] if bname.startswith('lidU') else [0.0, -.10]):
        Vr = rot_axis(V, piv, hinge(bname[-1]), ang)
        sd = head_sdf(Vr); hidden[f'{o.name}@{ang}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -u(.0005)).sum())}
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Inaho_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -u(.0005)).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
PS = dict(P)

bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = PS[name]; b.tail = Vector(PS[name]) + Vector((0, .028, 0)); b.roll = 0
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
for o in objects: bind(o, WEIGHTS[o.name])
for o in objects:
    assert len(o.modifiers) == 1 and o.modifiers[0].type == 'ARMATURE', o.name
    for v in o.data.vertices: assert 1 <= len(v.groups) <= 4 and abs(sum(g.weight for g in v.groups) - 1) < 1e-6, (o.name, v.index)
def g3(v): v = np.asarray(v, float); return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]
grip = {}
for t, s_ in (('R', -1), ('L', 1)):
    palm = np.array(JB['palm_' + t])
    grip['hand_' + t] = {'hand_head_game': g3(PS['hand_' + t]), 'palm_centre_game': g3(palm), 'palm_offset_from_hand_game': g3(palm - np.array(PS['hand_' + t]))}
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o not in objects]: bpy.data.objects.remove(o)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'ak-inaho-toy_rig.blend'))
(ROOT / 'rig-part-labels.json').write_text(json.dumps({o.name: labels[o.name] for o in objects}))
rig = {'units': 'metres (final, skull crown 1.03 m under the hat, hat top 1.14 m, ear tips 1.355 m)',
       'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in PS[b]], 'head_game_m': g3(PS[b])} for b in HERO],
       'triangles': total, **{k: ns['LOG'][k] for k in ('head_refine_before', 'head_refine') if k in ns['LOG']}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'squint_designed_for': [SQ_U, SQ_D], 'squint_game_director': [0.20, -0.24], 'lidTilt': LID_TILT, 'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'},
       'lid_hinge_game': {t: g3(hinge(t)) for t in 'LR'}, 'palms': grip, 'mouth_seam_points': len(rim), 'ear_hat_line_t': EAR_T,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their bone X axis: a rotation slides them along themselves.',
                 'Weights quantized to an exact 255 sum; <= 4 influences.',
                 'Ears: rigid with the head below where they leave the hat crown; ear_ there, earTip_ halfway up the free part, blending over the top half.',
                 'Straw hat + band rigid to head. Lash rolls 100 % lidU.',
                 'Cotton tail: rigid to tail1 (tail2-4 exist, unweighted).',
                 'Overall shorts, cuffs, pocket: hips at the seat and waist, each leg toward its hem on its thigh (up to 90 % at the cuffs).',
                 'Bib, waistband, straps, buttons by height (hips / spine / chest); the shirt likewise, its shoulders 30 % on the upper arms.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('INAHO_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'lidTilt': LID_TILT, 'lids': {k: v['pivot'] for k, v in lid_info.items()}}), flush=True)
