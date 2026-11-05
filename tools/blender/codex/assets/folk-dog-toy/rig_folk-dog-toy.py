"""The folk dogs (folk-dog-toy) phase 2: the 37-bone hero rig, one design per run. Blender 4.3, deterministic, world-axis
game contract.

    blender --background --factory-startup --python rig_folk-dog-toy.py -- --design a|c

Adapted from the folk-bunny rig (tools/blender/codex/assets/folk-bunny-toy/rig_folk-bunny-toy.py; the model builds share their machinery).
Runs build_folk-dog-toy.py in RIG_MODE (part labels; lid / cavity / tongue charts in the free atlas block; nothing approved is
written), then adds:
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - the mouth: the skin parted along the painted smile between sealed corners, a closed cavity and a tongue;
  - eyelids: rigid shells on tilted hinges (HERO_MODELS lidTilt), just outside the eyeball, painted with the skin round the eye
    (blush on); the lash rolls (<Name>_lash_L/R: the line, its wing and the flick) are 100 % lidU, so the lash rides the lid's edge;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum).
Saves folk-dog-<x>-toy_rig.blend (only Armature modifiers left), joints-rig-<x>.json and rig-part-labels-<x>.json.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_folk-dog-toy.py').read_text(encoding='utf-8')
os.environ.setdefault('REFINE_ADD', '620'); os.environ.setdefault('REFINE_DT', '.30')     # the rig's head: more toon-band refinement on the same field
ns = {'__file__': str(ROOT / 'build_folk-dog-toy.py'), '__name__': 'folk_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_folk-dog-toy.py'), 'exec'), ns)
DESIGN, NAME, TASK = ns['DESIGN'], ns['NAME'], ns['TASK']; N_ = NAME + '_'
W, CHIN, HY, SW = ns['W'], ns['CHIN'], ns['HY'], ns['SW']
def u(x): return x * SW                                    # a Tanuki build-unit length -> metres
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MZ, MHW = ns['MZ'], ns['MHW']
smooth, au, MAT, M2L, L2M = ns['smooth'], ns['au'], ns['MAT'], ns['M2L'], ns['L2M']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
os.makedirs(ROOT / 'export' / DESIGN, exist_ok=True)

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
CUT_L, CUT_R = .88 * XL_C, .88 * XR_C          # the U smile's ends turn up steeply: the cut stops short of them (no corner slit)
def in_cut(x, k=1.): return (k * CUT_L) < x < (k * CUT_R)
def cut_frac(x): return x / CUT_R if x >= 0 else x / CUT_L          # 0 at the centre .. 1 at the cut's end, each side
neck_c = L2M(np.array(ns['NECK'][0]))
mouth_y = float(front_hit(0., smile_z(0.))[0]); corner_z = .5 * (smile_z(XL_C) + smile_z(XR_C))
P = {'root': (0, -.010, 0), 'hips': tuple(JB['hips']), 'spine': tuple(JB['spine']), 'chest': tuple(JB['chest']),
     'neck': tuple(JB['neck']),
     'head': (0, float(neck_c[1]) + u(.060), CHIN + u(.001)),               # skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                             # the hinge inside the head, 0.22 W behind the smile
BROW_X, BROW_Z = ns['BROW_C'][0], CHIN + ns['BROW_C'][1] * W
# ears: ear_ where each ear leaves the head, earTip_ halfway along the free part
def tree_of(o):
    o.data.calc_loop_triangles(); return BVHTree.FromPolygons([v.co[:] for v in o.data.vertices], [tuple(t.vertices) for t in o.data.loop_triangles])
EAR_T = {}
if DESIGN == 'c':
    # C: the upright ears leave the skull (a ray from the tip down the ear's axis to the skull)
    _skull_tree = tree_of(OBJ[N_ + 'head'])
    EB, EU, ENf, EA = ns['ear_frame'](); EL = ns['EAR']['L']
    for s, tag in ((1, 'L'), (-1, 'R')):
        mir = np.array([s, 1, 1.])
        tipm = L2M((EB + EU * EL) * mir); basem = L2M(EB * mir); d = Vector(basem - tipm).normalized()
        h = _skull_tree.ray_cast(Vector(tipm), d, 2.)
        t_hat = float(((M2L(np.array(h[0])) * mir - EB) @ EU) / EL)
        t_tip = t_hat + .5 * (1 - t_hat)
        EAR_T[tag] = (t_hat, t_tip)
        P['ear_' + tag] = tuple(float(v) for v in L2M((EB + EU * EL * t_hat) * mir))
        P['earTip_' + tag] = tuple(float(v) for v in L2M((EB + EU * EL * t_tip) * mir))
    def ear_t(p, side):
        s = 1 if side == 'L' else -1; mir = np.array([s, 1, 1.])
        return float(((M2L(np.array(p)) * mir - EB) @ EU) / EL)
else:
    # A: the drooping ears run along the skull's top corner, then hang; t runs along the curved centreline (the nearest of its dense samples);
    # ear_ where the centreline leaves the skull, earTip_ halfway down the free part
    _CP = ns['_cp']; _SL = ns['_sl']; LOP_L = ns['LOP_L']; _hn = ns['head_nn']
    _tt = np.linspace(0, 1, 401); _ins = _hn(ns['lop_path'](_tt)) < 0
    t_exit = float(_tt[np.argmin(_ins)]) if not _ins.all() else .3
    for s, tag in ((1, 'L'), (-1, 'R')):
        mir = np.array([s, 1, 1.]); t_hat = min(t_exit, .22); t_tip = t_hat + .5 * (1 - t_hat)      # the centreline runs along the cheek: hinge where it leaves the band
        EAR_T[tag] = (t_hat, t_tip)
        P['ear_' + tag] = tuple(float(v) for v in L2M(ns['lop_path'](np.array([t_hat]))[0] * mir))
        P['earTip_' + tag] = tuple(float(v) for v in L2M(ns['lop_path'](np.array([t_tip]))[0] * mir))
    def ear_t(p, side):
        s = 1 if side == 'L' else -1; q = M2L(np.array(p)) * np.array([s, 1, 1.])
        i = int(np.argmin(np.linalg.norm(_CP - q[None], axis=1))); return float(_SL[i] / LOP_L)
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * BROW_X * W, float(front_hit(s * BROW_X * W, BROW_Z)[0]) + u(.012), BROW_Z)
    xc = XR_C if s > 0 else XL_C; zc = smile_z(xc)
    P['lip_' + tag] = (xc, float(front_hit(xc, zc)[0]) + u(.002), zc)
    for k, v in ARM[s].items(): P[k + '_' + tag] = v
    for k, v in LEG[s].items(): P[k + '_' + tag] = v
_TP = np.asarray(ns['TAIL_PATH']); _tlen = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(_TP, axis=0), axis=1))]); _tlen /= _tlen[-1]
for i, tf in enumerate((0., .30, .58, .84)): P['tail%d' % (i + 1)] = tuple(float(np.interp(tf, _tlen, _TP[:, k])) for k in range(3))
print('EAR_T', json.dumps(EAR_T), flush=True)

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ[N_ + 'head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ[N_ + 'eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ[N_ + 'eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def front_y(x, z, tag):
    a = ray_y(eye_tree[tag], x, z); b = ray_y(skin_tree, x, z)
    c = [v for v in (a, b) if v is not None]; return min(c) if c else None

# ---------------------------------------------------------------- eyelids (the Sasa construction, tools/blender/codex/assets/tk-sasa-toy)
# Rigid shells about the game's tilted lid hinge (HERO_MODELS lidTilt: Blender (cos t, +-sin t, 0) through the bone head).
# Director (round 2 note): the lash ribbons (Chiku_lash_L/R) are 100 % lidU, so the upper lid is designed AT REST with its edge
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
def cap_radii(V, piv, k, angs, tag, floor_angs, nr, nc, margin=.0008, eye_gap=.0006, keep_rows=0, band=0., band_a0=9., band_proud=0.):
    """shrink radii (about the hinge) of the vertices that would stand out of the skin outside the opening at any test angle,
    never into the eye where they are over it; smoothed over the grid; the shell stays rigid.
    band (eye radii): from angle band_a0 on, a vertex within 1 + band of the opening may lie up to band_proud on the skin (the
    closing lid overlaps the skin round the opening, covering the eye-hole's rim roll)"""
    c = V - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u_ = rad / r[:, None]
    need = np.zeros(len(V)); floor = np.full(len(V), -9.)
    for a in angs:
        Va = rot_axis(V, piv, k, a); srv = LD.eye_sr(tag, Va); op = LD.in_opening(tag, Va) | (srv < .985)
        sd = head_sdf(Va)
        inb = (srv < 1. + band) & (a >= band_a0) & ~op
        lim = np.where(inb, band_proud, -margin)
        bad = (~op) & (sd > lim); need[bad] = np.maximum(need[bad], sd[bad] - lim[bad])
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
# lids round 2 (director, in game): with the hinge ~9 cm behind the eye the shut lid domed ~7 mm over the eye (the rigid shell must
# clear the eye's bulge all through its sweep, and on a short lever the eye stands further from the hinge mid-sweep than shut).
# Deep hinge: the pivot goes back and down toward the face's own centre of curvature, so the skin and the eye lie at nearly one
# radius from the hinge all through the sweep, and the lid closes at its own smaller angle LC (HERO_MODELS lidClose: the angle that
# carries the centre column's rest edge to the lower rim). Each candidate is built, flushed and scored in full (the search runs
# after flush_shut is defined, just before the lids are built).
LC = 1.22
def up_rows(): return np.r_[np.linspace(0, .12, 5), np.linspace(.12, max(UP_K * LC, .45), UP_N)[1:]]     # body angles above the edge
UP_K = float(os.environ.get('UP_K', '1.35')); UP_N = int(os.environ.get('UP_N', '20')); CAP_M = float(os.environ.get('CAP_M', '.0018'))      # folk-dog: taller, denser rows (the shut lid's top row ended at the opening's top rim and its chords dipped behind the eye)
def build_upper(tag, B, Zo):
    k = hinge(tag); L = LD.upper3(tag, LID_TILT, B, Zo, u_sq=0., sink=-LID_LIFT, zfun=lash_edge_Z); cols = L['cols']; nc = len(cols)
    V = np.array([np.array([rot_axis(c_['E'][None], c_['A'], k, -al)[0] for c_ in cols]) for al in up_rows()]); nr = V.shape[0]; piv = L['Pv']
    Vf, capinfo = cap_radii(V.reshape(-1, 3), piv, k, np.linspace(0, LC, 25), tag, np.linspace(0, LC, 25), nr, nc, keep_rows=2, margin=CAP_M)      # (the skin mesh's chords sag under the field: 0.8 mm let lid tops show through the forehead)
    return L, Vf.reshape(nr, nc, 3), piv, capinfo
def close_angle(tag, B, Zo):
    """the angle that carries the centre column's rest edge (on the hole's top) to just under the lower rim"""
    L = LD.upper3(tag, LID_TILT, B, Zo, u_sq=0., sink=-LID_LIFT, zfun=lash_edge_Z); c = L['cols'][len(L['cols']) // 2]
    angs = np.linspace(.05, 1.6, 621); E = np.array([rot_axis(c['E'][None], c['A'], hinge(tag), a)[0] for a in angs])
    _, Z = LD.eye_XZ(tag, E); i = int(np.argmax(Z < -1.03)); return (float(angs[i]) if Z[i] < -1.03 else 1.22) * LC_K
LC_K = float(os.environ.get('LC_K', '1.0')); FLICK_H = float(os.environ.get('FLICK_H', '0'))      # folk-dog round 1: the shut lash landed 0.3 EHH under the lower rim (on the cheek): close a little less
def lever_score(B, Zo):
    global LC
    LC = round(close_angle('L', B, Zo), 3); rig_lids.CLOSE = LC
    L, V, piv, _ = build_upper('L', B, Zo); k = hinge('L')
    V2, fi = flush_shut('L', V, piv, k); flat = V2.reshape(-1, 3)
    near = []
    for f in (.80, .87, .94, 1.0):                      # proud of the skin over / round the opening at the near-shut poses
        Va = rot_axis(flat, piv, k, f * LC); srv = LD.eye_sr('L', Va); m = srv < 1.15
        near.append(float(head_sdf(Va[m]).max()) * 1000 if m.any() else 0.)
    rest = float(head_sdf(flat).max()) * 1000           # at rest the shell stays under the skin
    mid = fi['shut_mid_proud_mm_max'] or 0.
    # in front of the eye, shut and near-shut (the first pass let the lid sink behind the eye's 2 mm bulge: the eye showed through)
    clr = 9.
    for f in (.87, 1.0):
        Va = rot_axis(flat, piv, k, f * LC); m = np.where(LD.eye_sr('L', Va) < .92)[0]
        if len(m):
            ed = LD.eye_dist(Va[m], piv, k, 'L'); c_ = Va[m] - piv; r_ = np.linalg.norm(c_ - np.outer(c_ @ k, k), axis=1); d_ = (r_ - ed)[np.isfinite(ed)]
            if len(d_): clr = min(clr, float(d_.min()) * 1000)
    return max(near) + .5 * mid + 6 * max(rest + .3, 0) + 6 * max(.3 - clr, 0), LC, round(max(near), 2), mid, round(rest, 2), round(clr, 2)
# rig round 2 (director, in game): the shut lid read as a raised disc with a contour. Shut, every vertex over the opening sits on the
# skin field (which runs on unbroken over the eye hole) +0.3 mm, or 0.6 mm in front of the eyeball where the eye bulges; just outside
# the rim it dives 0.9 mm under the skin; then the shell is re-capped so rest and the mid-blink stay hidden / clear of the eye
FLUSH = float(os.environ.get('FLUSH', '.0003'))
LASH_HEAD_X0, LASH_HEAD_X1 = float(os.environ.get('LASH_HEAD_X0', '.80')), float(os.environ.get('LASH_HEAD_X1', '1.25'))   # the lash's head share, eye radii (outer +)
LASH_HEAD_MAX = float(os.environ.get('LASH_HEAD_MAX', '.55'))
LID_N_WEND = float(os.environ.get('LID_N_WEND', '4'))
LASH_IN_MIN = float(os.environ.get('LASH_IN_MIN', '.0012')); LASH_PROUD = float(os.environ.get('LASH_PROUD', '.0012'))   # authoring metres
# the shut overlap band (rig round 2): the lid lies ON the skin (+FLUSH) for 0.20 eye radii (8.7 mm authoring) past the opening, then
# feathers under the skin over the next 0.10. The body rows are ~9 mm apart, so the band must span a full row: a row just outside
# the rim that dived under left the chord between it and the row over the eye crossing the skin INSIDE the rim, exposing the roll.
# The band may lie on the skin from 0.45 rad on (mid-blink: the closing body covers the top rim's roll too).
OVERLAP = float(os.environ.get('OVERLAP', '.20')); OV_FEATHER = float(os.environ.get('OV_FEATHER', '.10')); OV_A0 = float(os.environ.get('OV_A0', '.45'))
def flush_shut(tag, V, piv, k):
    nr, nc = V.shape[:2]; flat = V.reshape(-1, 3).copy()
    c = flat - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u_ = rad / r[:, None]
    Vs = rot_axis(flat, piv, k, LC); sr = LD.eye_sr(tag, Vs); n_set = 0
    for i in np.where(sr < 1.0 + OVERLAP + OV_FEATHER + .02)[0]:
        A = piv + ax[i]; D = rot_axis(u_[i][None], np.zeros(3), k, LC)
        ds = float(LD.skin_dist_dirs(A, D)[0])
        if sr[i] < 1.0:
            ed = LD.eye_dist(Vs[i][None], piv, k, tag)[0]
            rt = ds + FLUSH
            if np.isfinite(ed): rt = max(rt, ed + .0006)
            r[i] = rt; n_set += 1
        elif sr[i] < 1.0 + OVERLAP:
            # rig round 2 (director, in game): shut, the lid OVERLAPS the skin ~2 mm all round the opening, lying on it (+FLUSH),
            # so the eye-hole's rim roll (which shaded as a grey ring on her white fur) is covered; then it dives under the skin
            r[i] = ds + FLUSH; n_set += 1
        else:
            fd = smooth(1.0 + OVERLAP, 1.0 + OVERLAP + OV_FEATHER, sr[i])
            r[i] = min(r[i], ds + FLUSH - (FLUSH + .0009) * fd)
    flat = piv + ax + u_ * r[:, None]
    FLOOR_A0 = float(os.environ.get('FLOOR_A0', str(.41 * LC)))      # the eye floor from here on (earlier, the edge rows ride the sunk upper rim)
    EYE_GAP_SHUT = float(os.environ.get('EYE_GAP_SHUT', '.0004'))   # lids round 2: always in front of the eye from FLOOR_A0 on (the deep hinge leaves room)
    flat, cap2 = cap_radii(flat, piv, k, np.linspace(0, LC, 25), tag, np.linspace(FLOOR_A0, LC, 19), nr, nc, keep_rows=2, eye_gap=EYE_GAP_SHUT, margin=CAP_M,
                           band=OVERLAP + OV_FEATHER, band_a0=OV_A0 * LC / 1.22, band_proud=FLUSH + .0003)
    Vs = rot_axis(flat, piv, k, LC); sr = LD.eye_sr(tag, Vs); sd = head_sdf(Vs)
    rim = (sr > .85) & (sr < 1.0); mid = sr < .85
    if os.environ.get('FLUSH_MAP'):
        op_ = sr < 1.0; idx_ = np.where(op_)[0]
        print('FLUSH_HIST', tag, np.percentile(sd[op_] * 1000, [10, 50, 90, 99]).round(2).tolist(), flush=True)
        for i_ in idx_[np.argsort(-sd[idx_])][:10]:
            j_, c_ = divmod(int(i_), nc); X__, Z__ = LD.eye_XZ(tag, Vs[i_])
            print('FLUSH_TOP', tag, 'row', j_, 'col', c_, 'X %.2f Z %.2f sr %.2f proud %.1f mm' % (float(X__), float(Z__), float(sr[i_]), float(sd[i_]) * 1000), flush=True)
    bnd = (sr >= 1.0) & (sr < 1.0 + OVERLAP)
    return flat.reshape(nr, nc, 3), {'set': n_set, 'recap': cap2, 'shut_band_verts': int(bnd.sum()), 'shut_band_on_skin_frac': round(float((sd[bnd] > -.0004).mean()), 3) if bnd.any() else None, 'shut_rim_proud_mm_max': round(float(sd[rim].max()) * 1000, 2) if rim.any() else None,
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
best = None
if os.environ.get('LID_B'):
    best = ((0,), float(os.environ['LID_B']), float(os.environ.get('LID_ZO', '0')))
else:
    # (passes: B .25-.42 x Zo +.4 to -.25: past .33 m the pivot leaves the skin search's reach, rejected; the high hinges won only by
    # letting the shut lid sink behind the eye's bulge, now scored as the eye clearance)
    for B in (.23, .25, .27, .29):                 # the pivot behind the eye's surface centre (m), along its axis (pass 3: B .21-.29 x Zo -.15 to -.8: -.15 best)
        for Zo in (0., -.08, -.15, -.25):           # and below it (eye heights): back and a little down
            try: r_ = lever_score(B, Zo)
            except Exception as ex: print('LEVER_FAIL', B, Zo, repr(ex), flush=True); continue
            print('LEVER_CAND', B, Zo, [round(float(v), 3) for v in r_], flush=True)
            if r_[2] < -1.5: continue                  # sunk inside the head: the skin search missed
            if best is None or r_[0] < best[0][0]: best = (r_, B, Zo)
LID_B, LID_ZO = best[1], best[2]
LC = round(close_angle('L', LID_B, LID_ZO), 3); rig_lids.CLOSE = LC
UP_ROWS = up_rows()
print('LEVER', json.dumps({'B': LID_B, 'Zo': LID_ZO, 'lidClose': LC, 'score': [round(float(v), 3) for v in best[0]]}), flush=True)
for tag in 'LR':
    s = 1 if tag == 'L' else -1; k = hinge(tag)
    L, V, piv, capinfo = build_upper(tag, LID_B, LID_ZO); nr, nc = V.shape[0], V.shape[1]
    V, flushinfo = flush_shut(tag, V, piv, k); capinfo['flush'] = flushinfo
    print('FLUSH', tag, json.dumps(flushinfo), flush=True)
    uv = np.stack(np.meshgrid(L['uu'], UP_ROWS / UP_ROWS[-1]), -1)
    ob = mesh_grid(N_ + 'lidU_' + tag, V, uv, 'lidU.' + tag, nr, nc); orient_out(ob, piv, k)
    NRM = skin_normals_near_shut(V.reshape(-1, 3), piv, k, angs=LC * np.array([.80, .87, .94, 1.0]), w_end=LID_N_WEND)     # the near-shut poses (0.8 to shut)     # (the Nami rig, rounds 3-4: no pale disc)
    ob.data.normals_split_custom_set([tuple(NRM[ob.data.loops[l].vertex_index]) for l in range(len(ob.data.loops))])
    lid_objects.append((ob, 'lidU_' + tag)); P['lidU_' + tag] = tuple(float(c) for c in piv)
    LID_PAINT['lidU.' + tag] = dict(V=V, piv=piv, k=k, ang=LC, blush=True, edge=False)
    sc_ = LD.score2(dict(L, V=V)); sc_.pop('worst(a, colX, row, mm, X, Z)', None)
    lid_info[N_ + 'lidU_' + tag] = {'pivot': [round(float(c), 5) for c in piv], 'lever_B_m': LID_B, 'lever_Zo_EHH': LID_ZO, 'cap': capinfo,
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
    obl = mesh_grid(N_ + 'lidD_' + tag, Vl, uvl, 'lidD.' + tag, nrl, ncl); orient_out(obl, pivl, k)
    NRl = skin_normals(Vl.reshape(-1, 3), pivl, k, SQ_D)          # shaded for the game's happy pose
    obl.data.normals_split_custom_set([tuple(NRl[obl.data.loops[l].vertex_index]) for l in range(len(obl.data.loops))])
    lid_objects.append((obl, 'lidD_' + tag)); P['lidD_' + tag] = tuple(float(c) for c in pivl)
    LID_PAINT['lidD.' + tag] = dict(V=Vl, piv=pivl, k=k, ang=SQ_D, blush=False, edge=True)
    lid_info[N_ + 'lidD_' + tag] = {'pivot': [round(float(c), 5) for c in pivl], 'cap': capl}
print('LIDS', json.dumps(lid_info, default=float), flush=True)

# rig round 2 (director): the shut lash read as a thin flat line. The ribbon is rebuilt as a roll: the same visible face as the model's
# (so rest looks the same), its back 10 mm deep inside the skin / eye (hidden at rest), so shut the 45-deg cameras see a thick body;
# the U is painted on the upper lid in its shut position (two arms rising from the ribbon's ends, see paint_lids), because a rigid
# ribbon that follows the top rim at rest always lands level or slightly arched with this hinge
LASH_IN = float(os.environ.get('LASH_IN', '.0100')); RIB_SHUT = {}
def lash_roll(s_, C2, HWr, hp_max, NLS=9):
    """one roll: the model's visible face (rest looks the same), its back up to LASH_IN deep inside the skin / eye; each ring's back
    is the deepest whose shut position (the lid's rotation blended with the lash's head share) stays within LASH_PROUD of the skin
    (the Nami rig, round 4: a deep back swung out at the far eye's silhouette)"""
    NLT = len(C2) - 1; tt = np.linspace(0, 1, NLT + 1)
    S_, n_ = ns['eye_pt'](s_, C2[:, 0], C2[:, 1])
    tg = np.gradient(S_, axis=0); tg = ns['unit'](tg - n_ * (tg * n_).sum(1, keepdims=True)); sd = ns['unit'](np.cross(n_, tg))
    hw = HWr * EHH
    hp = hp_max * (.55 + .45 * smooth(0, .25, tt)) * (1 - .60 * smooth(.80, 1.0, tt))
    tag_ = 'L' if s_ > 0 else 'R'; piv_, k_ = np.array(P['lidU_' + tag_]), hinge(tag_)
    Xr_, _ = LD.eye_XZ(tag_, S_); hsh = LASH_HEAD_MAX * smooth(LASH_HEAD_X0, LASH_HEAD_X1, np.asarray(Xr_, float))
    def shut_of(Q, h): return h * Q + (1 - h) * rot_axis(Q, piv_, k_, LC)
    dep = np.full(NLT + 1, LASH_IN_MIN)
    for i in range(NLT + 1):
        ring_b = lambda d: np.array([S_[i] + sd[i] * hw[i] * math.cos(2 * math.pi * kk / NLS) + n_[i] * (d * math.sin(2 * math.pi * kk / NLS) - .0010 * W)
                                     for kk in range(NLS) if math.sin(2 * math.pi * kk / NLS) <= 0])
        for d in np.linspace(LASH_IN, LASH_IN_MIN, 18):
            if head_sdf(shut_of(ring_b(d), hsh[i])).max() <= LASH_PROUD: dep[i] = d; break
    for _ in range(2): dep[1:-1] = np.minimum(dep[1:-1], .5 * dep[1:-1] + .25 * (dep[:-2] + dep[2:]))
    Vv = []; NV = []
    for i in range(NLT + 1):
        for kk in range(NLS):
            a = 2 * math.pi * kk / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * sa if sa > 0 else dep[i] * sa
            Vv.append(S_[i] + sd[i] * hw[i] * ca + n_[i] * (up - .0010 * W))
            NV.append(ns['unit'](sd[i] * ca / max(hw[i], 1e-4) + n_[i] * sa / max(hp[i] if sa > 0 else dep[i], 1e-4)))
    Vv = np.array(Vv); NV = np.array(NV)
    tip = len(Vv); Vv = np.vstack([Vv, S_[-1] + tg[-1] * hw[-1] * .7 + n_[-1] * (.25 * hp[-1])]); NV = np.vstack([NV, tg[-1]])
    root = len(Vv); Vv = np.vstack([Vv, S_[0] - tg[0] * hw[0] * .8 + n_[0] * (.2 * hp[0])]); NV = np.vstack([NV, -tg[0]])
    F = []
    for i in range(NLT):
        for kk in range(NLS):
            a_, b_ = i * NLS + kk, i * NLS + (kk + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for kk in range(NLS): F.append((NLT * NLS + kk, NLT * NLS + (kk + 1) % NLS, tip))
    for kk in range(NLS): F.append(((kk + 1) % NLS, kk, root))
    return Vv, NV, F, S_, n_, hp
FLICK_HEAD = {}
def rebuild_lash(tag):
    s_ = 1 if tag == 'L' else -1; o = OBJ[N_ + 'lash_' + tag]
    V1, N1, F1, S_, n_, hp = lash_roll(s_, ns['LASH_C2'], ns['LASH_HW'], .0070 * W)
    V2, N2, F2, _, _, _ = lash_roll(s_, ns['FLICK_C2'], ns['FLICK_HW'], .0050 * W, NLS=7)
    Vv = np.vstack([V1, V2]); NV = np.vstack([N1, N2]); F = F1 + [tuple(i + len(V1) for i in f) for f in F2]
    nf = len(ns['FLICK_C2']) - 1; tf = np.concatenate([np.repeat(np.linspace(0, 1, nf + 1), 7), [1., 0.]])
    FLICK_HEAD[tag] = (len(V1), tf)            # the flick's vertices (index from) and their fraction along it
    me = bpy.data.meshes.new(N_ + 'lash_' + tag + '_roll'); me.from_pydata(Vv.tolist(), [], F); me.update()
    lay = me.uv_layers.new(name='Atlas'); UVv = ns['ramp_uv']('lash', ns['sval'](NV, 0., hi=.30, lo=.10))
    for li, l in enumerate(lay.data): l.uv = tuple(float(c) for c in UVv[me.loops[li].vertex_index])
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    for p_ in me.polygons: p_.use_smooth = True
    me.materials.append(MAT); o.data = me; labels[o.name] = ['lash.' + tag] * len(me.vertices)
    Sc = rot_axis(S_ + n_ * (.5 * hp)[:, None], np.array(P['lidU_' + tag]), hinge(tag), LC); Xs_, Zs_ = LD.eye_XZ(tag, Sc)
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
    path = str(ROOT / (TASK + '_rig_atlas.png'))
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
oldlab = labels[N_ + 'head']; uvl = old.uv_layers.active.data
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
me = bpy.data.meshes.new(N_ + 'head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, uq in zip(poly.loop_indices, uu): layer.data[l].uv = uq
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < u(.0003)) & np.array([l_ == 'ball_head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels[N_ + 'head'] = vlab
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
    field = 1 - sm(-.030 * W, -.008 * W, z - smile_z(x))            # near the corners the painted line's lower half stays on the head (no stretched streak)
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
    t = ear_t(p, side); t_hat, t_tip = EAR_T[side]
    hd = 1 - sm(t_hat - .10, t_hat + .06, t)       # the part inside the head is rigid with the head; a soft blend, no crack
    tip = sm(t_tip - .16, t_tip + .16, t)          # the free part: ear_ at its base blending to earTip_ over its far half
    mv = 1 - hd
    return {'head': hd, 'ear_' + side: mv * (1 - tip), 'earTip_' + side: mv * tip}
ZH, ZS, ZC = JB['hips'][2], JB['spine'][2], JB['chest'][2]; ZSH = JB['arms']['L']['shoulder'][2]
def torso(z):                                       # hips / spine / chest along the body (each design's own joint heights)
    h_ = 1 - sm(ZH, ZS + .03, z); c_ = sm(ZS + .07, ZC + .05, z); return h_, max(0., 1 - h_ - c_), c_
def arm_t(p, s):
    sh = np.array(ARM[s]['upperarm']); wr_ = np.array(ARM[s]['hand']); d = wr_ - sh
    return float((np.array(p) - sh) @ d / (d @ d))
def tw(z): return dict(zip(('hips', 'spine', 'chest'), torso(z)))
def trouser_w(x, z, side, ztop):
    """the overalls / shorts: hips at the seat and waist; each leg toward its hem follows its thigh"""
    h_, sp_, c_ = torso(z)
    lg = .92 * sm(.025, .085, abs(x)) * sm(ztop, .15, z)
    return {'hips': h_ * (1 - lg), 'spine': sp_ + c_, 'thigh_' + side: h_ * lg}
TAIL_P = np.asarray(ns['TAIL_PATH']); _tl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(TAIL_P, axis=0), axis=1))]); TAIL_T = _tl / _tl[-1]
TAIL_BT = (0., .30, .58, .84)                      # tail1-4 along the tail (fraction of its length)
def tail_t(p): return float(TAIL_T[int(np.argmin(np.linalg.norm(TAIL_P - np.array(p)[None], axis=1)))])
def tail_weights(p):
    t = tail_t(p); w = {}
    for i in range(4):
        a = TAIL_BT[i]; b = TAIL_BT[i + 1] if i < 3 else 2.
        if t <= a and i == 0: return {'tail1': 1}
        if a <= t < b:
            f = sm(0, 1, (t - a) / (b - a)) if i < 3 else 0.
            return {'tail%d' % (i + 1): 1 - f, **({'tail%d' % (i + 2): f} if i < 3 and f > 0 else {})}
    return {'tail4': 1}
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.startswith('dog_foot') or lab.startswith('dog_toe_line'):
        return {'foot_' + side: 1}
    if lab in ('fur_torso', 'shirt_body'):
        h_, sp_, c_ = torso(z); arm = .30 * sm(.13, .19, abs(x)) * sm(ZSH - .06, ZSH + .02, z)        # the shoulders lift a little with the arms
        return {'hips': h_, 'spine': sp_, 'chest': c_ * (1 - arm), 'upperarm_' + side: c_ * arm}
    if lab in ('overall_shell', 'overall_pocket', 'overall_pocket_mouth') or lab.startswith('overall_hem'):
        if lab.startswith('overall_hem'): side = 'L' if '.L' in lab else 'R'
        return trouser_w(x, z, side, .31)
    if lab in ('shorts', 'shorts_seam'):
        return trouser_w(x, z, side, .27)
    if lab in ('satchel_box', 'satchel_flap'):
        # the satchel hangs on the left hip: hips, a little of the left thigh (as the shorts' front under it) and the spine
        return {'hips': .62, 'thigh_L': .24, 'spine': .14}
    if lab in ('chest_patch', 'satchel_band') or lab.startswith(('overall_strap', 'overall_button')):
        return tw(z)
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
adata = bpy.data.armatures.new(N_ + 'game_skeleton'); arm = bpy.data.objects.new(N_ + 'Rig', adata); bpy.context.collection.objects.link(arm)

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
mouth = make_mesh(N_ + 'mouth_cavity', cav_v, cav_f, 'cavity')
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
tongue = ns['lobe'](N_ + 'tongue', tongue_c, np.array([.011, .034, .044]) * W, [0, 0, 1.], 'head', ramp='hole', n=3, occ_in=0, pole=[1., 0, 0])
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)
tongue.data.materials.clear(); tongue.data.materials.append(MAT)
if tongue.data.attributes.get('cust_n') is not None: tongue.data.attributes.remove(tongue.data.attributes['cust_n'])

# ---------------------------------------------------------------- weights per object
WEIGHTS = {}
objects = []
for o in base_objects:
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]
    if o.name == N_ + 'head': weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, vkind)]
    elif o.name.startswith(N_ + 'eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith(N_ + 'ear_'): weights = [ear_weights(p, o.name[-1]) for p in pp]
    elif o.name == N_ + ns['HAT_GROUP']: weights = [{'head': 1} for p in pp]      # the leaf: rigid to the head
    elif o.name.startswith(N_ + 'lash_'):
        # the lash rides the upper lid's edge; past the opening's outer corner the roll, its wing and the flick blend up to 55 % to the
        # head (the Nami rig, round 3): shut, their blended position runs along the chord of the lid's arc, inside the head, so they
        # tuck in instead of swinging out
        def _lw(p, tg=o.name[-1]):
            X_, Z_ = LD.eye_XZ(tg, np.array(p)); h_ = LASH_HEAD_MAX * sm(LASH_HEAD_X0, LASH_HEAD_X1, float(X_))
            return {'lidU_' + tg: 1 - h_, 'head': h_}
        def _fw(i, tg=o.name[-1]):
            h_ = FLICK_H * sm(.24, .34, float(FLICK_HEAD[tg][1][i - FLICK_HEAD[tg][0]]))     # folk-dog: the flick rides the lid whole (at 50 % head it stood up as a spike when shut)
            return {'lidU_' + tg: 1 - h_, 'head': h_}
        weights = [_lw(p) if i < FLICK_HEAD[o.name[-1]][0] else _fw(i) for i, p in enumerate(pp)]
    elif o.name.startswith(N_ + 'arm_'): weights = [arm_weights(p, l, o.name[-1]) for p, l in zip(pp, lab)]
    elif o.name == N_ + 'tail': weights = [tail_weights(p) for p in pp]
    else: weights = [body_weights(p, l) for p, l in zip(pp, lab)]
    WEIGHTS[o.name] = weights; objects.append(o)
WEIGHTS[mouth.name] = cav_w; WEIGHTS[tongue.name] = [{'jaw': 1} for v in tongue.data.vertices]; objects += [mouth, tongue]
labels[N_ + 'mouth_cavity'] = ['mouth_cavity'] * len(mouth.data.vertices); labels[N_ + 'tongue'] = ['tongue'] * len(tongue.data.vertices)
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
hidden[N_ + 'tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -u(.0005)).sum())}
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
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / (TASK + '_rig.blend')))
(ROOT / ('rig-part-labels-%s.json' % DESIGN)).write_text(json.dumps({o.name: labels[o.name] for o in objects}))
rig = {'design': DESIGN, 'units': 'metres (final)',
       'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in PS[b]], 'head_game_m': g3(PS[b])} for b in HERO],
       'triangles': total, **{k: ns['LOG'][k] for k in ('head_refine_before', 'head_refine') if k in ns['LOG']}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'squint_designed_for': [round(.14 * LC / 1.22, 3), SQ_D], 'lidClose': LC, 'lidTilt': LID_TILT, 'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'},
       'lid_hinge_game': {t: g3(hinge(t)) for t in 'LR'}, 'palms': grip, 'mouth_seam_points': len(rim), 'ear_hat_line_t': EAR_T,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their bone X axis: a rotation slides them along themselves.',
                 'Weights quantized to an exact 255 sum; <= 4 influences.',
                 'Ears: rigid with the head below where they leave the skull (A: the centreline along the skull corner); ear_ there, earTip_ halfway along the free part, blending over the far half.',
                 'Leaf (A) rigid to head. Lash rolls (line, wing) on lidU, the flick a uniform 50 % head past its first 30 %.',
                 'Tail: swept along tail1 -> tail4 (0 / 0.30 / 0.58 / 0.84 of its length), smooth blends between neighbours.',
                 'A: overall shell + hems + pocket hips at the seat and waist, each leg toward its hem on its thigh (up to 92 %); straps, buttons by height; the fur torso by height, shoulders lifting with the arms.',
                 'C: shirt by height (shoulders lift with the arms); shorts like A; satchel hips 62 / thigh_L 24 / spine 14; band by height; sleeves upperarm blending to chest; the black arm band upperarm.']}
(ROOT / ('joints-rig-%s.json' % DESIGN)).write_text(json.dumps(rig, indent=2))
print('FOLK_RIG', DESIGN, json.dumps({'bones': len(HERO), 'triangles': total, 'lidTilt': LID_TILT, 'lidClose': LC, 'lids': {k: v['pivot'] for k, v in lid_info.items()}}), flush=True)
