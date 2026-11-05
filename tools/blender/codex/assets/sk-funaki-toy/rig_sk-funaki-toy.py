"""Funaki (sk-funaki-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, the game's world-axis contract.

    blender --background --factory-startup --python rig_sk-funaki-toy.py

Runs build_sk-funaki-toy.py in RIG_MODE (part labels, the rig atlas charts; the approved GLB / blend / JSON are not
touched, and at rest every bone leaves the approved look exactly as it was), then adds (after Sasa's rig,
tools/blender/work/codex/tk-sasa-toy, and Kuma's, tools/blender/codex/assets/kuma-toy):
  - the armature: exactly the hero contract, identity rest orientations, heads at the joints;
  - the upper lids (rig_lids.Lids.upper3): rigid shells about the game's tilted lid hinge (lidTilt = his eyes' outward
    facing), their rest edge running just under the lash ribbon, which is weighted 100% to lidU_* and rides the lid's edge:
    one lash line in every state; shut (+1.22) the ribbon lands under the lower rim as a "U". Their colour is the skin's
    own paint (fur, blush on) where they show;
  - the lower lids: built at the happy pose (LOW_T) hugging the eye, under the cheek at the neutral -0.10;
  - the mouth: the skin parted along the painted "w" between sealed corners, a closed cavity and a tongue; the muzzle's
    lower half, the chin and the under-jaw ride `jaw`, the corners `lip_*`;
  - weights (<= 4 influences, quantized to an exact 255 sum): the headband rigid on the head; the shirt, waistband, bib,
    pocket, straps and buttons on the torso's field (hips / spine / chest, the armhole riding a little with the sleeve, the
    collar line with the neck); the shorts legs on the thighs and shins with the seat partly following the thighs; the
    sleeves on the upper arms; mittens and feet rigid; the tool pouch rigid on the hips; the ears ear_* -> earTip_*;
  and saves sk-funaki-toy_rig.blend (only Armature modifiers left) and joints-rig.json.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
ns = {'__file__': str(ROOT / 'build_sk-funaki-toy.py'), '__name__': 'funaki_model', 'RIG_MODE': True}
exec(compile((ROOT / 'build_sk-funaki-toy.py').read_text(encoding='utf-8'), str(ROOT / 'build_sk-funaki-toy.py'), 'exec'), ns)
ns['lid_edge_Z'] = lambda X: 1.25 + 0 * np.asarray(X, float)      # open eyes: the skin's hole is the whole opening
import rig_lids
from rig_lids import rot_axis
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MZM, MHW = ns['MZM'], ns['MHW']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit, grad_n = ns['head_sdf'], ns['front_hit'], ns['grad_n']
def sm(a, b, x): return float(smooth(a, b, x))
_eax = ns['eye_axes']['L']
LID_TILT = float(os.environ.get('LID_TILT', '%.3f' % math.atan2(_eax[0], -_eax[1])))   # = the eyes' outward facing (13.5 deg)
LID_SQ = 0.                                                # the lid is designed AT REST, its edge under the lash ribbon
LID_B, LID_ZO = float(os.environ.get('LID_B', '.090')), float(os.environ.get('LID_ZO', '.05'))   # scratch/lidsearch.sh: the shut lash at the lower rim, never proud, 0.6 mm off the eye
LID_LIFT = float(os.environ.get('LID_LIFT', '-.0006'))
LOW_T = float(os.environ.get('LOW_T', '-.30'))             # the lower lid designed at the game's happy -0.30
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
head = OBJ['Funaki_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Funaki_eye_' + t].data.vertices], [tuple(p.vertices) for p in OBJ['Funaki_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
LD = rig_lids.Lids(ns, eye_tree)
def hinge(tag): return LD.hinge(tag, LID_TILT)
nose_v = np.array([list(v.co) for v, l in zip(head.data.vertices, labels['Funaki_head']) if l == 'nose_button'])
NOSE_TIP_L = float((nose_v[:, 1].min() - HY) / W)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
def smile_z(x):
    """the painted mouth line's centre (build: Funaki's plain U smile, the bottom at MOUTH_LO, the corners at MOUTH_HI)"""
    u = min(abs(x) / MHW, 1.0)
    return ns['MOUTH_LO'] + (ns['MOUTH_HI'] - ns['MOUTH_LO']) * u ** 1.8
mouth_y = float(front_hit(0., MZM)[0]); corner_z = smile_z(MHW)
P = {'root': (0, -.008, 0), 'hips': (0, .000, .262), 'spine': (0, .005, .380), 'chest': (0, .012, .480), 'neck': (0, .015, .570),
     'head': (0, HY + .054, CHIN + .002),                                     # the skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                            # the hinge line inside the head, 0.22 W behind the mouth
EAR_R = ns['EAR_R']
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, corner_z)[0]) + .002, corner_z)
    C0, ne, up, tt = ns['ear_info'][s]
    P['ear_' + tag] = tuple(float(c) for c in C0 - up * .55 * EAR_R - ne * .020)          # the ear's base, where it grows from the head
    P['earTip_' + tag] = tuple(float(c) for c in C0 + up * .25 * EAR_R + np.array([s * .012, 0, 0]))
    ja = ns['joint_arms'][tag]
    P['upperarm_' + tag] = tuple(ja['shoulder']); P['forearm_' + tag] = tuple(ja['elbow']); P['hand_' + tag] = tuple(ja['wrist'])
    jl = ns['joint_legs'][tag]
    P['thigh_' + tag] = tuple(jl['hip']); P['shin_' + tag] = tuple(jl['knee']); P['foot_' + tag] = tuple(jl['ankle'])
TC = np.array(ns['TAIL'][0])
for i, dy in enumerate((-.050, -.012, .018, .042)): P['tail%d' % (i + 1)] = tuple(float(c) for c in TC + np.array([0, dy, 0]))   # the root inside the seat

# ---------------------------------------------------------------- eyelids
lid_objects = []; lid_info = {}; LID_PAINT = {}
def mesh_grid(name, V, uvs, chart, nr, nc):
    """a (rows x cols) grid as quads; uvs (rows x cols x 2) chart-local"""
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
    for f in bm.faces:            # outward = away from the (tilted) hinge axis
        c = np.array(f.calc_center_median()) - piv; rv = c - k * (c @ k)
        if np.dot(np.array(f.normal), rv) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
def skin_normals(Vrest, piv, k, a_max, n_a=13, w_end=8., angs=None):
    """shading normals: the head ball's own normal under each vertex, averaged in the lid's frame over every angle at which
    the vertex shows (the end pose weighted), so the moving lid meets the skin round it without a step in the toon band"""
    acc = np.zeros_like(Vrest)
    for a in (np.linspace(0, a_max, n_a) if angs is None else angs):
        Pp = rot_axis(Vrest, piv, k, a); vis = head_sdf(Pp) > -.0006
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
        n = rot_axis(grad_n(Q), np.zeros(3), k, -a)
        w = np.where(vis, w_end if a == a_max else 1., 0.)
        if a == a_max: w = np.maximum(w, 1e-3)
        acc += w[:, None] * n
    return acc / np.linalg.norm(acc, axis=1, keepdims=True)
def cap_radii(V, piv, k, angs, tag, floor_angs, nr, nc, margin=.0008, eye_gap=.0006, keep_rows=0, smooth_r=0):
    """shrink radii (about the hinge) of the vertices that would stand out of the skin outside the opening at any test
    angle, never into the eye at the angles where they are over it; smoothed over the grid. The shell stays rigid."""
    c = V - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u = rad / r[:, None]
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
    if smooth_r:          # Funaki's lower lid: relax the radius field (the per-vertex eye floor is noisy), never under the floor or past the cap
        Rg = r_new.reshape(nr, nc); Fg = floor.reshape(nr, nc); Cg = (r - raw.ravel()).reshape(nr, nc)
        for _ in range(smooth_r):
            p_ = np.pad(Rg, 1, mode='edge'); Rg = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
            Rg = np.maximum(np.minimum(Rg, np.maximum(Cg, Fg)), Fg)
        r_new = Rg.ravel()
    return piv + ax + u * r_new[:, None], {'capped': int((r_new < r - 1e-6).sum()), 'max_shrink_mm': round(float((r - r_new).max()) * 1000, 1),
                                           'floored': int((r_new > r - sh.ravel() + 1e-6).sum())}
UP_ROWS = np.r_[np.linspace(0, .12, 5), np.linspace(.12, 1.55, 21)[1:]]       # body angles above the edge (fine at the edge)
_C2 = ns['LASH_C2']; _hw = ns['LASH_HW']
LASH_EDGE_K = float(os.environ.get('LASH_EDGE_K', '.30'))
def lash_edge_Z(X):
    """the upper lid's rest edge (EHH): under the lash ribbon's centre line by LASH_EDGE_K of its half-width, so the ribbon
    (on lidU) sits on the lid's edge in every pose; beyond the ribbon's ends it carries on level"""
    return float(np.interp(X, _C2[:, 0], _C2[:, 1] - LASH_EDGE_K * _hw))
for tag in 'LR':
    s = 1 if tag == 'L' else -1; k = hinge(tag)
    # ---- upper
    L = LD.upper3(tag, LID_TILT, LID_B, LID_ZO, u_sq=LID_SQ, sink=-LID_LIFT, zfun=lash_edge_Z)
    cols = L['cols']; nc = len(cols)
    rows = [np.array([rot_axis(c_['E'][None], c_['A'], k, -LID_SQ - al)[0] for c_ in cols]) for al in UP_ROWS]
    V = np.array(rows); nr = V.shape[0]; piv = L['Pv']
    Vf, capinfo = cap_radii(V.reshape(-1, 3), piv, k, np.linspace(0, 1.22, 25), tag, np.linspace(0, 1.22, 25), nr, nc, keep_rows=2, eye_gap=.0006)
    V = Vf.reshape(nr, nc, 3)
    uv = np.stack(np.meshgrid(L['uu'], UP_ROWS / UP_ROWS[-1]), -1)
    ob = mesh_grid('Funaki_lidU_' + tag, V, uv, 'lidU.' + tag, nr, nc); orient_out(ob, piv, k)
    # the skin's own normals where the lid shows: near shut (0.8-1.22, the brief) and, lighter, the low squint (0.15-0.25)
    NRM = skin_normals(V.reshape(-1, 3), piv, k, 1.22, w_end=6., angs=[.15, .20, .25, .15, .20, .25, .80, .90, 1.0, 1.1, 1.22])
    ob.data.normals_split_custom_set([tuple(NRM[ob.data.loops[l].vertex_index]) for l in range(len(ob.data.loops))])
    lid_objects.append((ob, 'lidU_' + tag)); P['lidU_' + tag] = tuple(float(c) for c in piv)
    LID_PAINT['lidU.' + tag] = dict(V=V, rows=UP_ROWS, uu=L['uu'], Xs=L['Xs'], piv=piv, k=k, tag=tag)
    sc_ = LD.score2(dict(L, V=V)); sc_.pop('worst(a, colX, row, mm, X, Z)', None)
    lid_info['Funaki_lidU_' + tag] = {'pivot': [round(float(c), 5) for c in piv], 'cap': capinfo, 'columns(X, r_b_mm, eye_clear_mm, hid_above_mm, hid_below_mm)': L['diag'], **sc_}
    # ---- lower
    Lo = LD.lower(tag, LID_TILT, dz=float(os.environ.get('LOW_DZ', '2.25')), arch_c=float(os.environ.get('ARCH_C', '.62')), arch_e=float(os.environ.get('ARCH_E', '.30')), target=LOW_T)
    Vl = np.transpose(Lo['V'], (1, 0, 2)).copy(); nrl, ncl = Vl.shape[0], Vl.shape[1]; pivl = Lo['Pv']
    Vlf, capl = cap_radii(Vl.reshape(-1, 3), pivl, k, (.04, 0., -.05, -.10, -.16, -.20, -.24, -.28, -.32, -.36), tag, (-.30, -.24, -.20), nrl, ncl, margin=.0014, eye_gap=.0020, smooth_r=8)
    Vl = Vlf.reshape(nrl, ncl, 3)
    uvl = np.stack(np.meshgrid((Lo['Xs'] - Lo['Xs'][0]) / (Lo['Xs'][-1] - Lo['Xs'][0]), np.linspace(0, 1, nrl)), -1)
    obl = mesh_grid('Funaki_lidD_' + tag, Vl, uvl, 'lidD.' + tag, nrl, ncl); orient_out(obl, pivl, k)
    NRl = skin_normals(Vl.reshape(-1, 3), pivl, k, LOW_T, angs=[-.20, -.24, -.30, -.30])   # the squint poses only (where it shows)
    obl.data.normals_split_custom_set([tuple(NRl[obl.data.loops[l].vertex_index]) for l in range(len(obl.data.loops))])
    lid_objects.append((obl, 'lidD_' + tag)); P['lidD_' + tag] = tuple(float(c) for c in pivl)
    LID_PAINT['lidD.' + tag] = dict(V=Vl, tag=tag, piv=pivl, k=k)
    lid_info['Funaki_lidD_' + tag] = {'pivot': [round(float(c), 5) for c in pivl], 'cap': capl}
print('LIDS', json.dumps(lid_info, default=float), flush=True)

# ---------------------------------------------------------------- the lash ribbon, rebuilt as a deep roll (round 2, the game check)
# The front face is the approved ribbon (same centre line, width and height proud of the skin: the rest look stays); behind it the
# roll runs LASH_IN into the head (hidden at rest), so when the blink turns it ~70 deg the camera sees its depth as a solid lash
# ~0.02 W thick. Shut, any part behind the closed lid is pushed out radially from the hinge (capped), so it stands on the lid.
LASH_IN = float(os.environ.get('LASH_IN', '.0160')); LASH_PUSH = float(os.environ.get('LASH_PUSH', '.0040')); LASH_END_IN = float(os.environ.get('LASH_END_IN', '.010')); LASH_END_HEAD = float(os.environ.get('LASH_END_HEAD', '0'))   # (tested .45: shut the lagging ends sink into the cheek; at 0.85 they kink)
LASH_DATA = {}
def lash_roll(tag):
    s = 1 if tag == 'L' else -1; C2a, HWa = ns['LASH_C2'], ns['LASH_HW']; NLT_, NLS_ = 30, 12
    L_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C2a * [EHW, EHH], axis=0), axis=1))]); tt = np.linspace(0, L_[-1], NLT_ + 1)
    C2 = np.stack([np.interp(tt, L_, C2a[:, 0]), np.interp(tt, L_, C2a[:, 1])], -1); hw = np.interp(tt, L_, HWa) * EHH
    S, n = ns['eye_pt'](s, C2[:, 0], C2[:, 1])
    tg = np.gradient(S, axis=0); tg = ns['unit'](tg - n * (tg * n).sum(1, keepdims=True)); sd = ns['unit'](np.cross(n, tg))
    u = tt / tt[-1]
    hp = (.0072 * W) * (.55 + .45 * smooth(0, .25, u)) * (1 - .60 * smooth(.75, 1.0, u))
    din = LASH_IN * (.55 + .45 * smooth(0, .20, u)) * (1 - .45 * smooth(.80, 1.0, u)) + LASH_END_IN * smooth(.30, .85, np.abs(C2[:, 0])) * (1 - smooth(1.05, 1.25, C2[:, 0]))
    V = []
    for i in range(NLT_ + 1):
        for k_ in range(NLS_):
            a = 2 * math.pi * k_ / NLS_; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * sa if sa > 0 else din[i] * sa
            V.append(S[i] + sd[i] * hw[i] * ca + n[i] * (up - .0010 * W))
    V = np.array(V); tip = len(V); V = np.vstack([V, S[-1] + tg[-1] * hw[-1] * .6 + n[-1] * (.25 * hp[-1])])
    root = len(V); V = np.vstack([V, S[0] - tg[0] * hw[0] * .8 + n[0] * (.2 * hp[0])])
    F = []
    for i in range(NLT_):
        for k_ in range(NLS_):
            a_, b_ = i * NLS_ + k_, i * NLS_ + (k_ + 1) % NLS_; F.append((a_, b_, b_ + NLS_, a_ + NLS_))
    for k_ in range(NLS_): F.append((NLT_ * NLS_ + k_, NLT_ * NLS_ + (k_ + 1) % NLS_, tip))
    for k_ in range(NLS_): F.append(((k_ + 1) % NLS_, k_, root))
    # shut: push the parts behind the closed lid out radially (the rotation keeps radii, so the push is the same at rest)
    piv = np.array(P['lidU_' + tag]); kx = hinge(tag); lo_ = [ob for ob, b_ in lid_objects if b_ == 'lidU_' + tag][0]
    LV = rot_axis(np.array([list(v.co) for v in lo_.data.vertices]), piv, kx, 1.22)
    lt_ = BVHTree.FromPolygons([Vector(q) for q in LV], [tuple(q.vertices) for q in lo_.data.polygons])
    Vc = rot_axis(V, piv, kx, 1.22); push = np.zeros(len(V))
    for i, pc in enumerate(Vc):
        d = pc - piv; d = d - kx * (d @ kx); d = d / np.linalg.norm(d)
        h = lt_.ray_cast(Vector(pc + d * .03), Vector(-d), .06)
        if h[0] is not None and h[3] < .03: push[i] = .03 - h[3] + .0012
    # the push may move only what is buried at rest, and never out of the skin there (the rest look stays); the visible front keeps <= LASH_PUSH
    depth = -head_sdf(V); push = np.minimum(push, np.maximum(LASH_PUSH * (depth > .0005), depth - .0015))
    dr = V - piv; dr = dr - np.outer(dr @ kx, kx); dr = dr / np.linalg.norm(dr, axis=1, keepdims=True); V = V + dr * push[:, None]
    LASH_DATA[tag] = dict(S=S, n=n, hp=hp, push_mm=[round(float(push.max()) * 1000, 2), int((push > 0).sum()), len(push)], V=V)
    o = OBJ['Funaki_lash_' + tag]; me_ = bpy.data.meshes.new('Funaki_lash_roll_' + tag); me_.from_pydata(V.tolist(), [], F); me_.update()
    lay = me_.uv_layers.new(name='Atlas'); val = np.full(len(V), .40)
    uvr = ns['ramp_uv']('lash', val)
    lv = np.zeros(len(me_.loops), np.int64); me_.loops.foreach_get('vertex_index', lv); lay.data.foreach_set('uv', uvr[lv].astype(np.float32).ravel())
    bm = bmesh.new(); bm.from_mesh(me_); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me_); bm.free()
    for p_ in me_.polygons: p_.use_smooth = True
    me_.materials.append(MAT); o.data = me_; labels[o.name] = ['lash.' + tag] * len(V)
    return o
for t_ in 'LR': lash_roll(t_)
def lash_shut_shape(tag):
    """the shut lash's centre line (front of the roll): its height at the middle vs its visible ends (EHH), and how much shows"""
    d = LASH_DATA[tag]; Pm = d['S'] + d['n'] * (d['hp'] * .5)[:, None]
    Ss = rot_axis(Pm, np.array(P['lidU_' + tag]), hinge(tag), 1.22); X_, Z_ = LD.eye_XZ(tag, Ss)
    vis = head_sdf(Ss) > -.0015
    mid = float(np.interp(0., X_[np.argsort(X_)], Z_[np.argsort(X_)]))
    ends = [float(Z_[vis][np.argmin(X_[vis])]), float(Z_[vis][np.argmax(X_[vis])])] if vis.any() else [0, 0]
    Xr_ = LD.eye_XZ(tag, d['V'])[0]; wh_ = LASH_END_HEAD * smooth(.50, .95, np.abs(Xr_))[:, None]
    Vs_ = (1 - wh_) * rot_axis(d['V'], np.array(P['lidU_' + tag]), hinge(tag), 1.22) + wh_ * d['V']; Xv, Zv = LD.eye_XZ(tag, Vs_); vv = head_sdf(Vs_) > -.0008
    prof = {}
    for xb in (-1.0, -.8, -.6, -.4, -.2, 0., .2, .4, .6, .8, 1.0):
        m_ = vv & (np.abs(Xv - xb) < .1)
        prof[xb] = [round(float(Zv[m_].min()), 2), round(float(Zv[m_].max()), 2)] if m_.any() else None
    return {'visible_Z_by_X(min,max)': prof, 'mid_Z_EHH': round(mid, 3), 'end_Z_EHH(inner, outer)': [round(e, 3) for e in ends], 'sag_EHH': round(min(ends) - mid, 3),
            'visible_X_range': [round(float(X_[vis].min()), 2), round(float(X_[vis].max()), 2)] if vis.any() else None, 'push': d['push_mm']}
LOG['lash_shut_shape'] = {t_: lash_shut_shape(t_) for t_ in 'LR'}
print('LASH_SHAPE', json.dumps(LOG['lash_shut_shape']), flush=True)
if os.environ.get('LID_ONLY'):
    li = lid_info['Funaki_lidU_L']; lo = lid_info['Funaki_lidD_L']
    def _rest(o_name, bname, angs):
        o = [ob for ob, b_ in lid_objects if ob.name == o_name][0]; V_ = np.array([list(v.co) for v in o.data.vertices]); out = []
        for a_ in angs:
            Vr = rot_axis(V_, np.array(P[bname]), hinge(bname[-1]), a_); op = LD.in_opening(bname[-1], Vr) | (LD.eye_sr(bname[-1], Vr) < .985)
            out.append(round(float(np.where(op, -9., head_sdf(Vr)).max()) * 1000, 1))
        return out
    print('LIDSEARCH', json.dumps({'B': LID_B, 'Zo': LID_ZO, 'lash': LOG['lash_shut_shape']['L'], 'shut': li['shut_edge_rel_lowrim_EHH'], 'eyeclear': li['eye_clear_min_mm'],
          'up_proud_0_.3_.6_.9_1.22': _rest('Funaki_lidU_L', 'lidU_L', (0, .3, .6, .9, 1.22)), 'r_b': li['r_b_mm_range'],
          'low_proud_0_-.1_-.2_-.3': _rest('Funaki_lidD_L', 'lidD_L', (0, -.1, -.2, -.3))}), flush=True)
    o = [ob for ob, b_ in lid_objects if ob.name == 'Funaki_lidD_L'][0]; V_ = np.array([list(v.co) for v in o.data.vertices])
    Vr = rot_axis(V_, np.array(P['lidD_L']), hinge('L'), -.10); sdv = head_sdf(Vr); bad = np.where(sdv > -.0005)[0]
    Xb, Zb = LD.eye_XZ('L', Vr[bad]); nrl_, ncl_ = LID_PAINT['lidD.L']['V'].shape[:2]
    print('LOWDBG', [(int(i // ncl_), int(i % ncl_), round(float(x_), 2), round(float(z_), 2), round(float(sdv[i]) * 1000, 1)) for i, x_, z_ in zip(bad, Xb, Zb)][::4], flush=True)
    raise SystemExit(0)

# ---------------------------------------------------------------- lid paint: the skin's own paint (fur, blush on), a lash edge
def grid_point(V, rows_v, U, Vv):
    nr, nc, _ = V.shape; ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = (ci - i0)[..., None]
    jj = np.clip(np.searchsorted(rows_v, Vv, side='right') - 1, 0, nr - 2); fb = ((Vv - rows_v[jj]) / (rows_v[jj + 1] - rows_v[jj]))[..., None]
    return V[jj, i0] * (1 - fa) * (1 - fb) + V[jj, i0 + 1] * fa * (1 - fb) + V[jj + 1, i0] * (1 - fa) * fb + V[jj + 1, i0 + 1] * fa * fb
def skin_paint_at(P_):
    """the face chart's paint (fur shade, muzzle, blush; the lash shade and lower lid line off) at the skin point under each lid point"""
    Q = P_.reshape(-1, 3).copy()
    for _ in range(4): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
    d = ns['unit'](Q - ns['O']); UV = ns['head_uv'](d)
    ns['PAINT_OPTS']['band'] = False
    C = ns['paint_face'](UV[:, 0], UV[:, 1])
    ns['PAINT_OPTS']['band'] = True
    return C.reshape(P_.shape)
SHUT_DZ = float(os.environ.get('SHUT_DZ', '-.10')); SHUT_HALF = float(os.environ.get('SHUT_HALF', '.0062')); SQ_HIDE = float(os.environ.get('SQ_HIDE', '9'))   # (off: the painted U showed as a second lash at 0.85)
SHUT_DIAG = {}
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        if chart.startswith('lidU'):              # the skin's paint where the lid shows (shut)
            Pt = grid_point(info['V'], info['rows'] / info['rows'][-1], U, Vv)
            V = info['V']; rows = info['rows']; nr, nc, _ = V.shape; vrow = rows / rows[-1]
            arc = np.array([[np.linalg.norm(V[j, i] - V[0, i]) for i in range(nc)] for j in range(nr)])   # chord from the edge (m)
            ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = ci - i0
            jj = np.clip(np.searchsorted(vrow, Vv, side='right') - 1, 0, nr - 2); fb = (Vv - vrow[jj]) / (vrow[jj + 1] - vrow[jj])
            A_ = (arc[jj, i0] * (1 - fa) * (1 - fb) + arc[jj, i0 + 1] * fa * (1 - fb) + arc[jj + 1, i0] * (1 - fa) * fb + arc[jj + 1, i0 + 1] * fa * fb)
            # the colour: the skin's paint where each part of the lid shows -- the edge band (shown at the squints) sampled at the
            # happy squint (0.30), the body (shown when shut; the shut edge band tucks under the lower rim) sampled shut
            Cq = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], .30).reshape(Pt.shape))
            Cs = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], 1.22).reshape(Pt.shape))
            C = mix(Cq, Cs, smooth(.022, .042, A_))
            C = mix(C, rgb('lash'), 1 - smooth(.0028, .0040, A_))            # a thin dark edge under the riding ribbon
            # the shut U (the game check): the dark lash curve painted on the lid where, shut, it lands just above the lower rim; its
            # ends rise with the rim into the corners (a U ~0.02 W thick); its middle runs under the riding ribbon (which is the
            # lash there), and it is cut where the lid would show it at the squints (arc < SQ_HIDE from the edge)
            tag_ = info['tag']; Vs = rot_axis(V.reshape(-1, 3), info['piv'], info['k'], 1.22).reshape(nr, nc, 3)
            A_land = np.full(nc, np.nan); Xland = np.zeros(nc)
            for i in range(nc):
                Xc_, Zc_ = LD.eye_XZ(tag_, Vs[:, i]); Xland[i] = float(np.median(Xc_[:6]))
                zt = -(max(1 - min(abs(Xland[i]), .999) ** EN, 0)) ** (1 / EN) + SHUT_DZ
                o_ = np.argsort(Zc_)
                if Zc_.min() <= zt <= Zc_.max(): A_land[i] = float(np.interp(zt, Zc_[o_], arc[o_, i]))
            okc = np.isfinite(A_land) & (np.abs(Xland) < .97)
            SHUT_DIAG[chart] = {'X': [round(float(v), 2) for v in Xland], 'A_land_mm': [round(float(v) * 1000, 1) if np.isfinite(v) else None for v in A_land]}
            if okc.sum() >= 4:
                Al = np.interp(np.arange(nc), np.where(okc)[0], A_land[okc]); Xl = np.interp(np.arange(nc), np.arange(nc), Xland)
                a0 = np.interp(ci, np.arange(nc), Al); xa = np.abs(np.interp(ci, np.arange(nc), Xl)); inside_ = np.interp(ci, np.arange(nc), okc.astype(float)) > .5
                half = SHUT_HALF * (1 - .45 * smooth(.70, .96, xa))               # tapering into the corners
                stroke_ = (1 - smooth(half, half + .0012, np.abs(A_ - a0))) * smooth(SQ_HIDE - .004, SQ_HIDE, A_) * (1 - smooth(.90, .97, xa)) * inside_
                C = mix(C, rgb('lash'), stroke_)
            C = mix(C, rgb('#6E4A34'), .35 * (1 - smooth(.004, .010, A_)) * smooth(.0028, .0040, A_))   # its soft contact shade
        else:                                      # the lower lid: the skin's paint at the happy pose, a soft lid line on its edge
            Vl_ = info['V']; Pt = grid_point(Vl_, np.linspace(0, 1, Vl_.shape[0]), U, Vv)
            C = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], LOW_T).reshape(Pt.shape))
            C = mix(C, rgb('#6E4A34'), .45 * np.exp(-((Vv - .03) / .025) ** 2))
            C = mix(C, rgb('lash'), .55 * (1 - smooth(.0, .02, Vv)))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'sk-funaki-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()
print('SHUT_U', json.dumps(SHUT_DIAG), flush=True)

# ---------------------------------------------------------------- mouth: part the skin along the painted "w", add the cavity
CUT = .94 * MHW
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Funaki_head']; uvl = old.uv_layers.active.data
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
    skin_ = rr[0][3] == 'head_skin'
    cut = skin_ and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')
    else: emit(rr, None)
me = bpy.data.meshes.new('Funaki_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'head_skin' for l_ in FL])
FN[onsk] = grad_n(FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Funaki_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0016: rim.append(p)
assert len(rim) >= 10, len(rim)
LOG['mouth_seam_points'] = len(rim)

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - MHW) / (.034 * W)) ** 2 - ((z - corner_z) / (.034 * W)) ** 2)
def jaw_w(x, y, z, kind):
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - NOSE_TIP_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.006 * W, .010 * W, z - smile_z(x))           # the whole skin around the sealed corners
    we = sm(.74 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.12, .26, abs(xl)); back = 1 - sm(.36, .50, b)
    return below * lat * back
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    if lab != 'head_skin': return {'head': 1.}                    # the nose button
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(.06, -.01, zl) * sm(.30, .45, b) * .5                # the hidden underside rides a little with the neck
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
ARMS = {tag: ns['joint_arms'][tag] for tag in 'LR'}
ARM_D = {tag: (np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder'])) / np.linalg.norm(np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder'])) for tag in 'LR'}
ARM_LEN = {tag: float(np.linalg.norm(np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder']))) for tag in 'LR'}
def torso_w(p):
    """the clothed torso's field, shared by every cloth layer on it (shirt, waistband, bib, pocket, straps, buttons)"""
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    hips = 1 - sm(.270, .340, z); chest = sm(.400, .470, z); top = sm(.555, .600, z)
    arm = .22 * sm(.17, .23, abs(x)) * sm(.44, .50, z) * (1 - top)        # the armhole rides a little with the sleeve
    th = .35 * sm(.24, .16, z); wl = th * sm(-.08, .08, x); wr = th - wl       # the seat and crotch partly follow the thighs
    body = 1 - top
    return {'hips': hips * body * (1 - th), 'thigh_L': hips * body * wl, 'thigh_R': hips * body * wr,
            'spine': (1 - hips) * (1 - chest) * body, 'chest': (1 - hips) * chest * body * (1 - arm),
            'upperarm_' + side: (1 - hips) * chest * body * arm, 'neck': .70 * top, 'head': .30 * top}
def arm_w(p, side):
    t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side]); Lw = ARM_LEN[side]
    fore = sm(.42 * Lw, .62 * Lw, t); hand = sm(.90 * Lw, 1.02 * Lw, t); chest = .25 * (1 - sm(-.04, .03, t))
    return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand),
            'hand_' + side: (1 - chest) * fore * hand}
def leg_w(p, side):
    x, y, z = p
    hips = sm(.235, .290, z); shin = 1 - sm(.135, .185, z); foot = 1 - sm(.055, .078, z)
    return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.endswith('.L'): side = 'L'
    if lab.endswith('.R'): side = 'R'
    if lab.startswith('lash.'):                                                 # the lash ribbon rides the upper lid's edge; its ends lag
        X_ = float(LD.eye_XZ(side, np.array(p))[0]); wh = LASH_END_HEAD * sm(.50, .95, abs(X_))    # a little (part head), so shut it sags into a U
        return {'lidU_' + side: 1 - wh, 'head': wh}
    if lab in ('torso', 'top_hem', 'bib', 'bib_pocket') or lab.startswith('strap.') or lab.startswith('button.'): return torso_w(p)
    if lab == 'headband': return {'head': 1.}
    if lab.startswith('arm.'): return arm_w(p, side)
    if lab.startswith('foot.'): return {'foot_' + side: 1.}
    if lab.startswith('leg.'): return leg_w(p, side)
    if lab == 'stub_tail':
        t2 = sm(TC[1] - .01, TC[1] + .045, y); return {'tail1': 1 - t2, 'tail2': t2}
    if lab.startswith('pouch') or lab.startswith('tool_'): return {'hips': 1.}       # the pouch and its mallet rigid on the hips
    raise KeyError(lab)
def ear_weights(p, s):
    """each ear 100% ear_* at its base, blending to earTip_* over its top half"""
    C0, ne, up, tt = ns['ear_info'][s]; tag = 'L' if s > 0 else 'R'; base = C0 - up * .55 * EAR_R
    hz = float((np.asarray(p) - base) @ up) / (float((C0 - base) @ up) + EAR_R)     # 0 at the base .. 1 at the top
    tip = .50 * sm(.45, 1.0, hz); return {'ear_' + tag: 1 - tip, 'earTip_' + tag: tip}

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
adata = bpy.data.armatures.new('Funaki_game_skeleton'); arm = bpy.data.objects.new('Funaki_Rig', adata); bpy.context.collection.objects.link(arm)
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
            pz = z + (.010 * W if level == 'upper' else -.042 * W) * math.sin(t * math.pi * .5) * corner
            py = y + .0015 + .080 * W * t * (.35 + .65 * corner)
            px_ = x * (1 - .06 * t)
            if j: py = max(py, skin_front(px_, pz) + .005)
            cav_v.append((px_, py, pz))
            ww = face_weights((x, y, z), 'head_skin', level)
            sd_ = 'L' if x >= 0 else 'R'
            if level == 'upper': ww = {'head': 1 - ww['lip_' + sd_], 'lip_' + sd_: ww['lip_' + sd_]}
            cav_w.append(ww)
for k_ in range(2):
    off = k_ * (D + 1) * n
    for j in range(D):
        for i in range(n - 1): cav_f.append((off + j * n + i, off + j * n + i + 1, off + (j + 1) * n + i + 1, off + (j + 1) * n + i))
for i in range(n - 1): cav_f.append((D * n + i, D * n + i + 1, (2 * D + 1) * n + i + 1, (2 * D + 1) * n + i))   # back wall
for i in (0, n - 1):
    for j in range(D): cav_f.append((j * n + i, (j + 1) * n + i, (D + 2 + j) * n + i, (D + 1 + j) * n + i))
def make_mesh(name, coords, polys, chart):
    me_ = bpy.data.meshes.new(name); me_.from_pydata(coords, [], polys); me_.update(); layer_ = me_.uv_layers.new(name='Atlas')
    for p in me_.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer_.data[l].uv = tuple(au(chart, .5, .5))
    ob_ = bpy.data.objects.new(name, me_); bpy.context.collection.objects.link(ob_); me_.materials.append(MAT); return ob_
mouth = make_mesh('Funaki_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZM))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()        # faces look into the pocket
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .034; TC_ = np.array([0, ty, MZM - .020 * W]); TR_ = np.array([.050, .036, .010]) * W
tv = []; tf = []; nseg, nrng = 12, 8
for j in range(nrng + 1):
    ph = math.pi * j / nrng
    for i in range(nseg): a = 2 * math.pi * i / nseg; tv.append(tuple(TC_ + TR_ * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), -math.cos(ph)])))
for j in range(nrng):
    for i in range(nseg): tf.append((j * nseg + i, j * nseg + (i + 1) % nseg, (j + 1) * nseg + (i + 1) % nseg, (j + 1) * nseg + i))
tongue = make_mesh('Funaki_tongue', tv, tf, 'tongue')
bm = bmesh.new(); bm.from_mesh(tongue.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-9); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(tongue.data); bm.free()

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
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]
    if o.name == 'Funaki_head': weights = [face_weights(p, l, k_) for p, l, k_ in zip(pp, lab, vkind)]
    elif o.name.startswith('Funaki_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Funaki_ear_'): weights = [ear_weights(p, 1 if o.name[-1] == 'L' else -1) for p in pp]
    else: weights = [body_weights(p, l) for p, l in zip(pp, lab)]
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
    """the upper lid's visible edge at a squint: screen height (W) of its outer end and middle relative to its inner end"""
    out = {}
    for o, bname in lid_objects:
        if not bname.startswith('lidU'): continue
        tag = bname[-1]; s_ = 1 if tag == 'L' else -1; info = LID_PAINT['lidU.' + tag]
        E = rot_axis(info['V'][0], np.array(P[bname]), hinge(tag), sq); vis = LD.eye_sr(tag, E) < .97
        Ev = E[vis]; Ev = Ev[np.argsort(s_ * Ev[:, 0])]
        if len(Ev) < 2: out[tag] = None; continue
        res = {}
        for nm, (yaw, el) in (('front', (0, 0)), ('game0', (0, 35.5)), ('game+45', (45, 35.5)), ('game-45', (-45, 35.5))):
            h = Ev @ cam_up(yaw, el) / W
            res[nm] = {'outer_minus_inner_W': round(float(h[-1] - h[0]), 4), 'mid_minus_inner_W': round(float(h[len(h) // 2] - h[0]), 4)}
        out[tag] = res
    return out
EDGES = {sq_: edge_screen(sq_) for sq_ in (.30, .36, .488)}
print('EDGE_SCREEN', json.dumps(EDGES), flush=True)
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Funaki_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
def proud_sweep(o, bname):
    tag = bname[-1]; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices]); out = {}
    angs = np.round(np.linspace(0, 1.22, 13), 3) if bname.startswith('lidU') else np.round([0., -.10, -.18, -.24, -.30, -.34], 3)
    for a in angs:
        Va = rot_axis(V, piv, hinge(tag), a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985); sd = np.where(op, -9., head_sdf(Va))
        bad = sd > .0005; out[float(a)] = [int(bad.sum()), round(float(sd.max()) * 1000, 1)]
    return out
PROUD = {o.name: proud_sweep(o, b) for o, b in lid_objects}
print('PROUD', json.dumps(PROUD), flush=True)
# the riding lash: at the shut pose its centre line against the lower rim (EHH below / above the outline)
LASH_SHUT = {}
for tag in 'LR':
    o = OBJ['Funaki_lash_' + tag]; V = np.array([list(v.co) for v in o.data.vertices])
    Vs = rot_axis(V, np.array(P['lidU_' + tag]), hinge(tag), 1.22); X_, Z_ = LD.eye_XZ(tag, Vs)
    m = np.abs(X_) < .9; zl = -(np.clip(1 - np.abs(X_[m]) ** EN, 0, 1)) ** (1 / EN)
    LASH_SHUT[tag] = {'z_rel_lowrim_EHH(min, mid, max)': [round(float(v), 3) for v in np.percentile(Z_[m] - zl, [0, 50, 100])],
                      'max_out_of_skin_mm': round(float(head_sdf(Vs).max()) * 1000, 1)}
print('LASH_SHUT', json.dumps(LASH_SHUT), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'sk-funaki-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'squint_designed_for': [.30, LOW_T],
       'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'happy_edge_screen': EDGES, 'proud_outside_opening(count, max_mm)': PROUD, 'lash_shut': LASH_SHUT, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids turn about the tilted hinge (cos t, +-sin t, 0) through their bone head (HERO_MODELS lidTilt = t).',
                 'The lash ribbons (Funaki_lash_L/R) are weighted 100% to lidU_L/R and ride the upper lid, whose rest edge runs just'
                 ' under the ribbon; one lash line in every pose. Lid colour = the face paint (fur, muzzle, blush) where the lid shows.',
                 'Clothing on the torso field (hips / spine / chest; the seat 35% on the thighs at the crotch); the trouser legs on the thighs and'
                 ' shins; sleeves on the upper arms with the armhole 22% on the arm; headband rigid on head; pouch + mallet rigid on hips.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2, default=float))
print('FUNAKI_RIG', json.dumps({'bones': len(HERO), 'triangles': total}), flush=True)
