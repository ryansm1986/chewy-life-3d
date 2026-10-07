"""Poke-through checks on the posed golden-toy rig (the same game rotations as rig_tests.py), against the rest pose.
    blender --background --factory-startup --python pose_check.py   -> pose-check.json
- fur through armour: fur triangles (fur arms + feather tufts + cuffs + paws, fur legs + thigh tufts + ankle cuffs + feet, the fur
  hips, the tail, the ears, the ruff, the head skin) newly crossing armour triangles (the chest plate, pauldrons, belt + edges +
  medallion, tabard + tassets, bracers + rims + wrist straps, quiver + straps), per pose. 'covered' = the approved hidden junctions
  (the arm root inside the pauldron / plate, the wrist inside the bracer, the hips and thigh tops under the tassets / tabard / belt,
  the tail root under the plate, the ruff's lower edge on the plate, the neck under the ruff); 'visible' = everything else.
- the ears vs the head (skin and helmet) at the contract extremes and over the game's own ear motion -> the safe earGain;
- the tail vs the quiver and the tassets in the tail and gait poses;
- closed-eye specks (eyeball rays) at blink from the front, both 3/4 and both game cameras.
"""
import bpy, json, os, math, sys
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
T = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'golden-toy_rig.blend'))
arm = bpy.data.objects['Golden_Rig']; arm.data.pose_position = 'POSE'
LAB = json.load(open(os.path.join(T, 'rig-part-labels.json')))
src = open(os.path.join(T, 'rig_tests.py'), encoding='utf-8').read()
POSES = eval(src[src.index('POSES = [') + 8: src.index(']\nFACES') + 1])
NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
PB = arm.pose.bones
def pose(ch):
    for b in PB: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    arm.location = (0, 0, 0)
    for name, v in ch.items():
        if name == 'root_y': arm.location = (0, 0, v); continue
        if name in ('smile', 'prop'): continue
        gx, gy, gz = v
        PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    bpy.context.view_layer.update()
def evaluated(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    V = np.array([tuple(e.matrix_world @ v.co) for v in m.vertices]); e.to_mesh_clear(); return V
OB = {n: bpy.data.objects[n] for n in LAB}
REST = {n: np.array([tuple(v.co) for v in o.data.vertices]) for n, o in OB.items()}
POLY = {n: [tuple(p.vertices) for p in o.data.polygons] for n, o in OB.items()}
def faces_where(n, pred):
    lab = LAB[n]; return [k for k, f in enumerate(POLY[n]) if all(pred(lab[i]) for i in f)]
FUR_LAB = ('fur_arm', 'arm_feather_tuft', 'fur_wrist_cuff', 'mitten_paw', 'fur_leg', 'thigh_feather_tuft', 'fur_ankle_cuff', 'lightfur_foot', 'fur_hips',
           'plumed_tail', 'tail_feather_lock', 'tail_tip_tuft', 'feathered_ear', 'cream_chest_ruff', 'ball_head_skin')
ARMOUR_LAB = ('emerald_chest_plate', 'emerald_pauldron', 'leather_belt', 'brass_belt_edge', 'brass_medallion', 'emerald_tabard_front', 'emerald_tasset',
              'emerald_bracer', 'brass_bracer_rim', 'leather_wrist_strap', 'emerald_quiver', 'brass_quiver', 'leather_back_strap', 'leather_quiver_band')
FUR = {}; ARM_ = {}
for n in OB:
    if n.startswith('Golden_lid') or n.startswith('Golden_eye') or n in ('Golden_helm', 'Golden_tongue'): continue
    f = faces_where(n, lambda l: l.startswith(FUR_LAB)); a = faces_where(n, lambda l: l.startswith(ARMOUR_LAB))
    if f: FUR[n] = f
    if a: ARM_[n] = a
rig = json.load(open(os.path.join(T, 'joints-rig.json')))
BH = {b['name']: np.array(b['head_blender_m']) for b in rig['bones']}
def arm_t(p, t):
    sh = BH['upperarm_' + t]; wr = BH['hand_' + t]; d = wr - sh; return float((p - sh) @ d / (d @ d))
def covered(n, k, an, ak):
    f = POLY[n][k]; c = REST[n][list(f)].mean(0); lab = LAB[n][f[0]]; alab = LAB[an][POLY[an][ak][0]]
    if lab.startswith(('fur_arm', 'arm_feather_tuft')):
        t = 'L' if c[0] > 0 else 'R'; tt = arm_t(c, t)
        if alab.startswith(('emerald_pauldron', 'emerald_chest_plate')) and tt < .30: return True       # the arm root under the pauldron
        if alab.startswith(('emerald_bracer', 'brass_bracer_rim', 'leather_wrist_strap')): return True     # the forearm inside its bracer
    if lab.startswith(('mitten_paw', 'fur_wrist_cuff')) and alab.startswith(('emerald_bracer', 'brass_bracer_rim', 'leather_wrist_strap')): return True
    if lab.startswith(('fur_hips', 'fur_leg', 'thigh_feather_tuft')) and alab.startswith(('emerald_tasset', 'emerald_tabard_front', 'leather_belt', 'brass_belt_edge', 'emerald_chest_plate')):
        return c[2] > .26                                                          # the hips and thigh tops under the skirt
    if lab.startswith(('plumed_tail', 'tail_feather_lock')) and alab.startswith(('emerald_chest_plate', 'emerald_tasset', 'leather_belt', 'brass_belt_edge')):
        return c[1] < .20                                                          # the tail root under the plate / belt
    if lab.startswith('cream_chest_ruff') and alab.startswith(('emerald_chest_plate', 'emerald_pauldron', 'leather_back_strap', 'emerald_quiver')): return True
    if lab.startswith('ball_head_skin') and alab.startswith(('emerald_chest_plate', 'emerald_pauldron')): return c[2] < .672   # the neck under the chin, inside the ruff
    return False
def build(names_faces, Vs):
    pts = []; tris = []; owner = []
    for n, ks in names_faces.items():
        V = Vs[n]; base = len(pts); pts += [Vector(p) for p in V]
        for k in ks: tris.append(tuple(base + i for i in POLY[n][k])); owner.append((n, k))
    return BVHTree.FromPolygons(pts, tris), owner
def fur_through(Vs):
    ft, fo = build(FUR, Vs); at, ao = build(ARM_, Vs)
    hits = {}
    for i, j in ft.overlap(at):
        n, k = fo[i]; an, ak = ao[j]; hits[(n, k, an, ak)] = (LAB[an][POLY[an][ak][0]], LAB[n][POLY[n][k][0]])
    return hits
def all_V(): return {n: evaluated(o) for n, o in OB.items()}
REST_C = {n: REST[n].mean(0) for n in REST}          # an armour piece's centre: its faces' outer side points away from it
CAM_DIRS = [Vector(v).normalized() for v in ((0, -1, .1), (0, 1, .1), (1, 0, .1), (-1, 0, .1), (.5, -.5, .7071), (-.5, -.5, .7071), (.5, .5, .7071), (-.5, .5, .7071))]
def seen_by_camera(v, owner, dg_):
    p = Vector(v)
    for d in CAM_DIRS:
        ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg_, p + d * 3, -d, distance=3.2)
        if ok and ob.name == owner and (loc - p).length < .004: return True
    return False
res = {}; base_hits = None
QUICK = [k for k in os.environ.get('QUICK', '').split(',') if k]
for key, label, ch, neutral in POSES:
    if QUICK and key not in QUICK and key != 'rest': continue
    c = dict(NEUTRAL) if neutral else {}; c.update(ch); pose(c); Vs = all_V()
    hits = fur_through(Vs)
    if base_hits is None: base_hits = set((n, k) for n, k, an, ak in hits)
    vis = {}; cov = {}; seen = set(); shown = {}; shown_pts = []
    dg_ = bpy.context.evaluated_depsgraph_get()
    for (n, k, an, ak), (al, fl) in hits.items():
        if (n, k) in base_hits or (n, k) in seen: continue
        seen.add((n, k)); key2 = fl.split('.')[0] + ' x ' + al.split('.')[0]
        d_ = cov if covered(n, k, an, ak) else vis; d_[key2] = d_.get(key2, 0) + 1
        if d_ is vis:
            # does the poked-through fur show? the fur triangle's vertices on the armour face's outer side, seen by a camera
            A = Vs[an][list(POLY[an][ak])]; na = np.cross(A[1] - A[0], A[2] - A[0]); na /= max(np.linalg.norm(na), 1e-12)
            if (na @ (A.mean(0) - REST_C[an])) < 0: na = -na
            out_v = [Vs[n][i] for i in POLY[n][k] if (Vs[n][i] - A.mean(0)) @ na > .0015]
            if any(seen_by_camera(v, n, dg_) for v in out_v):
                shown[key2] = shown.get(key2, 0) + 1; shown_pts.append([round(float(c), 3) for c in out_v[0]])
    res[key] = {'label': label, 'new_crossing_tris_not_covered': sum(vis.values()), 'visible_fur_through_armour_tris': sum(shown.values()), 'covered_junction_tris': sum(cov.values()),
                'crossing_by_pair': vis, 'visible_by_pair': shown, 'visible_points': shown_pts[:12], 'covered_by_pair': cov}
    print('POSE', key, res[key]['new_crossing_tris_not_covered'], res[key]['visible_fur_through_armour_tris'], res[key]['covered_junction_tris'], json.dumps(shown), shown_pts[:10], flush=True)
if QUICK:
    print('QUICK_DONE'); sys.exit(0)
# ---- the ears vs the head: the outer surface of the ear (its rest distance from the head > 1.5 cm) must stay outside the skin and the helmet
HEADF = {'Golden_head': list(range(len(POLY['Golden_head']))), 'Golden_helm': list(range(len(POLY['Golden_helm'])))}
def head_tree(Vs): return build(HEADF, Vs)[0]
def signed_to(P, tree):
    out = np.empty(len(P))
    for i, p in enumerate(P):
        loc, nrm, idx, dist = tree.find_nearest(Vector(p)); out[i] = dist if (Vector(p) - loc).dot(nrm) >= 0 else -dist
    return out
pose(dict(NEUTRAL)); Vs0 = all_V(); ht0 = head_tree(Vs0)
EAR_D0 = {t: signed_to(Vs0['Golden_ear_' + t], ht0) for t in 'LR'}
ear_contract = {}
for t in 'LR':
    outer = EAR_D0[t] > .015
    for tip, er, ez in ((.6, .35, 0), (.6, 0, 0), (-1.05, -.35, 0), (-1.05, 0, 0), (0, .35, .3), (0, -.35, -.3), (0, .35, -.3), (0, -.35, .3)):
        c = dict(NEUTRAL); c.update({'earTip_' + t: (tip, 0, 0), 'ear_' + t: (er, 0, ez)}); pose(c); Vs = all_V()
        d1 = signed_to(Vs['Golden_ear_' + t], head_tree(Vs))
        ear_contract['%s tip %+.2f ear x %+.2f z %+.2f' % (t, tip, er, ez)] = {'outer_verts_inside_head_or_helmet': int((outer & (d1 < -.002)).sum()), 'deepest_outer_mm': round(float(d1[outer].min()) * 1000, 1)}
    print('EARC', t, json.dumps({k: v for k, v in ear_contract.items() if k.startswith(t)}), flush=True)
# the game's own ear motion (animator.js secondary()): with g = earGain, earTip.x = soft(1.4 g S.a) (tanh limits 1.05 up / 0.6),
# ear.x = 0.35 tanh(0.25 g S.a / 0.35), ear.z = +-0.12 S.a (g - 1); S.a about -1.2 .. 2.6
def game_angles(Sa, g):
    a = Sa * 1.4 * g; t = math.tanh(a / 1.05) * 1.05 if a < 0 else math.tanh(a / .6) * .6
    b = math.tanh(Sa * .25 * g / .35) * .35; zl = Sa * .12 * (g - 1); return t, b, zl, -zl
SA = np.linspace(-1.2, 2.6, 14)
sweep = {}; safe_g = 0.
for g in [1.0, .9, .8, .7, .6, .5]:
    ws = 0.; at_ = None
    for Sa in SA:
        t, b, zl, zr = game_angles(float(Sa), g)
        c = dict(NEUTRAL); c.update({'earTip_L': (t, 0, 0), 'earTip_R': (t, 0, 0), 'ear_L': (b, 0, zl), 'ear_R': (b, 0, zr)}); pose(c); Vs = all_V(); ht = head_tree(Vs)
        for e in 'LR':
            d1 = signed_to(Vs['Golden_ear_' + e], ht); dmin = float(d1[EAR_D0[e] > .015].min())
            if dmin < ws: ws = dmin; at_ = [e, round(float(Sa), 2), round(t, 3), round(b, 3)]
    sweep['%.2f' % g] = {'ear_outer_deepest_in_head_or_helmet_mm': round(ws * 1000, 1), 'worst_at_ear_Sa_tip_ear': at_}
    print('EARGAIN', g, round(ws * 1000, 1), at_, flush=True)
    if ws > -.003 and not safe_g: safe_g = g
# ---- the tail vs the quiver / tassets
TAILF = {'Golden_tail': list(range(len(POLY['Golden_tail'])))}
QF = {'Golden_body': faces_where('Golden_body', lambda l: l.startswith(('emerald_quiver', 'brass_quiver', 'javelin_', 'felt_fletch', 'leather_quiver_band')))}
TF = {'Golden_tabard': list(range(len(POLY['Golden_tabard'])))}
tail_res = {}; base_tq = None
for key in ('rest', 'tail-l', 'tail-r', 'walk-a', 'walk-b', 'run', 'run-b', 'sit', 'roll', 'dive'):
    ch = next(p for p in POSES if p[0] == key); c = dict(NEUTRAL) if ch[3] else {}; c.update(ch[2]); pose(c); Vs = all_V()
    tt = build(TAILF, Vs)[0]; tq = len(tt.overlap(build(QF, Vs)[0])); ttb = len(tt.overlap(build(TF, Vs)[0]))
    if base_tq is None: base_tq = (tq, ttb)
    tail_res[key] = {'tail_x_quiver_tris_new': max(0, tq - base_tq[0]), 'tail_x_tabard_tris_new': max(0, ttb - base_tq[1])}
print('TAIL', json.dumps(tail_res), flush=True)
# ---- closed eyes: eyeball rays through the closed lids
def gdir(yaw, elev=45):
    e = math.radians(elev); y = math.radians(yaw); return Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
c = dict(NEUTRAL); c.update({'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}); pose(c); dg_ = bpy.context.evaluated_depsgraph_get()
specks = {}
for t_, sx in (('L', 1), ('R', -1)):
    for vn, dv in (('front', Vector((0, -1, 0))), ('34in', Vector((sx * .6, -.8, .1)).normalized()), ('34out', Vector((-sx * .6, -.8, .1)).normalized()),
                   ('game+45', gdir(45)), ('game-45', gdir(-45))):
        n_ = 0
        for x in np.linspace(.06, .26, 80):
            for z in np.linspace(.90, 1.10, 80):
                o = Vector((sx * x, -.30, z)) + dv * 1.0
                ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg_, o, -dv, distance=3)
                if ok and ob.name.startswith('Golden_eye'): n_ += 1
        specks[t_ + ' ' + vn] = n_
print('SPECKS', json.dumps(specks), flush=True)
report = {'rule': 'crossing = fur triangles newly crossing armour faces vs rest, minus the covered junctions (module docstring); visible = those whose poked-through vertices (outside the armour face) are seen by one of 8 cameras (front, back, both sides, four 45-degree game cameras)',
          'fur_through_armour': res, 'ear_vs_head_and_helmet_contract': ear_contract,
          'earGain_rule': 'the game ear motion over S.a in [-1.2, 2.6]: safe = no ear outer-surface vertex more than 3 mm inside the head skin or the helmet', 'earGain_sweep': sweep, 'largest_safe_earGain': safe_g,
          'tail': tail_res, 'closed_eye_eyeball_rays_of_6400_per_view': specks}
json.dump(report, open(os.path.join(T, 'pose-check.json'), 'w'), indent=1)
print('POSE_CHECK', json.dumps({k: [v['new_crossing_tris_not_covered'], v['visible_fur_through_armour_tris'], v['covered_junction_tris']] for k, v in res.items()}))
print('SAFE_EARGAIN', safe_g)
