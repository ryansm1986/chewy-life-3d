"""Poke-through and safety checks on the posed rig (the same game rotations as rig_tests.py), against the rest pose.
    blender --background --factory-startup --python pose_check.py   -> pose-check.json
- fur through cloth / armour: fur triangles (head skin, ear locks, tail, paws + wrist fur, chest ruff, shorts, legs, leg cuffs)
  newly crossing cloth / armour triangles (torso, hood, pauldrons, belt, buckle, boots and caps, sleeves, gauntlets, tabard,
  cloak, tome), per pose. 'covered' = the designed hidden junctions (the wrist inside the gauntlet, the tail root under the
  cloak hem, the head's underside inside the ruff / hood, the legs inside the boot tops, the shorts' top under the belt, the
  ruff on the torso and under the hood); 'visible' = everything else.
- the ear locks: their outer surface vs the head skin, and the locks vs the pauldrons / torso / cloak, over the game's own
  ear motion (animator.js secondary) at a range of earGain values -> the largest safe earGain;
- the closed eye (blink 1.22): rays over each eye from the front, both 3/4 and both game cameras that reach the eyeball;
- the open mouth (jaw 0.42, with and without the smile): rays through the mouth that see a back face of the head (a hole).
"""
import bpy, json, os, math, sys
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
T = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'shihtzu-toy_rig.blend'))
arm = bpy.data.objects['Shihtzu_Rig']; arm.data.pose_position = 'POSE'
LAB = json.load(open(os.path.join(T, 'rig-part-labels.json')))
src = open(os.path.join(T, 'rig_tests.py'), encoding='utf-8').read()
POSES = eval(src[src.index('POSES = [') + 8: src.index(']\nHAPPY') + 1])
NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
PB = arm.pose.bones
_RJ = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'joints-rig.json')))
LID_HINGE = {t: Vector(_RJ['lid_hinge_blender'][t]) for t in 'LR'}   # Blender (cos t, +/- sin t, 0) = game (cos t, 0, -/+ sin t)
def pose(ch, smile=.4):
    for b in PB: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    arm.location = (0, 0, 0)
    for name, v in ch.items():
        if name in ('root_y', 'smile', 'flail'): continue
        gx, gy, gz = v
        if name.startswith('lid'): PB[name].matrix_basis = Matrix.Rotation(gx, 4, LID_HINGE[name[-1]]); continue   # the game's lidTilt hinge
        PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    if 'root_y' in ch: arm.location = (0, 0, ch['root_y'])
    smile = ch.get('smile', smile)
    for t in 'LR': PB['lip_' + t].location = (0, .004 * smile, .007 * smile)
    bpy.context.view_layer.update()
def evaluated(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    V = np.array([tuple(e.matrix_world @ v.co) for v in m.vertices]); e.to_mesh_clear(); return V
OB = {n: bpy.data.objects[n] for n in LAB}
REST = {n: np.array([tuple(v.co) for v in o.data.vertices]) for n, o in OB.items()}
POLY = {n: [tuple(p.vertices) for p in o.data.polygons] for n, o in OB.items()}
def faces_where(n, pred):
    lab = LAB[n]; return [k for k, f in enumerate(POLY[n]) if all(pred(lab[i], i) for i in f)]
rig = json.load(open(os.path.join(T, 'joints-rig.json')))
BH = {b['name']: np.array(b['head_blender_m']) for b in rig['bones']}
def arm_t(p, t):
    sh = BH['upperarm_' + t]; wr = BH['hand_' + t]; d = wr - sh; return float((p - sh) @ d / (d @ d))
FUR_BODY = ('white_chest_ruff', 'black_fur_shorts', 'black_fur_leg', 'white_leg_cuff')
CLOTH_BODY = ('armour_torso', 'plum_hood', 'pauldron', 'dark_belt', 'paw_buckle', 'buckle_tab', 'black_boot', 'silver_toe_cap', 'silver_heel_cap')
FUR = {}; CLOTH = {}
FUR['Shihtzu_head'] = faces_where('Shihtzu_head', lambda l, i: True)
FUR['Shihtzu_tail'] = faces_where('Shihtzu_tail', lambda l, i: True)
FUR['Shihtzu_body'] = faces_where('Shihtzu_body', lambda l, i: l.startswith(FUR_BODY))
CLOTH['Shihtzu_body'] = faces_where('Shihtzu_body', lambda l, i: l.startswith(CLOTH_BODY))
for t in 'LR':
    FUR['Shihtzu_arm_' + t] = faces_where('Shihtzu_arm_' + t, lambda l, i: l.startswith(('black_mitten_paw', 'white_wrist_fur')))
    FUR['Shihtzu_ear_' + t] = faces_where('Shihtzu_ear_' + t, lambda l, i: True)
    CLOTH['Shihtzu_arm_' + t] = faces_where('Shihtzu_arm_' + t, lambda l, i: l.startswith(('armour_sleeve', 'silver_gauntlet_cuff')))
for n in ('Shihtzu_tabard', 'Shihtzu_cloak', 'tome'): CLOTH[n] = faces_where(n, lambda l, i: True)
def covered(n, k, cl):
    f = POLY[n][k]; c = REST[n][list(f)].mean(0); lab = LAB[n][f[0]]
    if n.startswith('Shihtzu_arm_'): return arm_t(c, n[-1]) < 1.0                    # the wrist fur / paw cuff inside the gauntlet
    if n == 'Shihtzu_tail': return c[1] < .30                                         # the root under the cloak hem
    if n == 'Shihtzu_head': return c[2] < .675                                      # the head's underside / neck inside the ruff and hood
    if n == 'Shihtzu_body':
        if lab.startswith('white_chest_ruff'): return cl.startswith(('armour_torso', 'plum_hood'))   # the ruff sits on the torso, under the hood
        if lab.startswith(('black_fur_leg', 'white_leg_cuff')): return c[2] < .115 and cl.startswith(('black_boot', 'silver'))   # inside the boot top
        if lab.startswith('black_fur_shorts'): return c[2] > .40 and cl.startswith(('dark_belt', 'armour_torso'))   # the shorts' top under the belt
    return False
def build(names_faces, Vs):
    pts = []; tris = []; owner = []
    for n, ks in names_faces.items():
        V = Vs[n]; base = len(pts); pts += [Vector(p) for p in V]
        for k in ks: tris.append(tuple(base + i for i in POLY[n][k])); owner.append((n, k))
    return BVHTree.FromPolygons(pts, tris), owner
def fur_through(Vs):
    ft, fo = build(FUR, Vs); ct, co = build(CLOTH, Vs)
    hits = {}
    for i, j in ft.overlap(ct):
        n, k = fo[i]; cn_, ck = co[j]
        hits[(n, k)] = (LAB[cn_][POLY[cn_][ck][0]], LAB[n][POLY[n][k][0]])
    return hits
def all_V(): return {n: evaluated(o) for n, o in OB.items()}
def gdir(yaw, elev=45):
    e = math.radians(elev); y = math.radians(yaw); return Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
CAMS = [Vector((0, -1, .06)).normalized(), Vector((.64, -.77, .06)).normalized(), Vector((-.64, -.77, .06)).normalized(), gdir(45), gdir(-45),
        Vector((0, 1, .06)).normalized()]
def seen(n, k, Vs):
    dg_ = bpy.context.evaluated_depsgraph_get(); c = Vector(Vs[n][list(POLY[n][k])].mean(0))
    for d in CAMS:
        ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg_, c + d * 2.0, -d, distance=2.5)
        if ok and ob.name == n and (loc - c).length < .004: return True
    return False
res = {}; base_hits = None
for key, label, ch, neutral in POSES:
    c = dict(NEUTRAL) if neutral else {}; c.update(ch); pose(c); Vs = all_V()
    hits = fur_through(Vs)
    if base_hits is None: base_hits = set(hits)
    new = {h: v for h, v in hits.items() if h not in base_hits}
    vis = {}; cov = {}
    hid = {}
    for (n, k), (cl, fl) in new.items():
        key2 = fl.split('.')[0] + ' x ' + cl.split('.')[0]
        d_ = cov if covered(n, k, cl) else (vis if seen(n, k, Vs) else hid); d_[key2] = d_.get(key2, 0) + 1
    res[key] = {'label': label, 'visible_fur_through_cloth': sum(vis.values()), 'covered_junction_triangles': sum(cov.values()),
                'hidden_from_every_camera': sum(hid.values()), 'visible_by_pair': vis, 'covered_by_pair': cov, 'hidden_by_pair': hid}
    print('POSE', key, res[key]['visible_fur_through_cloth'], res[key]['covered_junction_triangles'], res[key]['hidden_from_every_camera'], json.dumps(vis), flush=True)
# ---- the ear locks over the game's ear motion
HEADF = FUR['Shihtzu_head']
def head_tree(Vs): return BVHTree.FromPolygons([Vector(p) for p in Vs['Shihtzu_head']], [POLY['Shihtzu_head'][k] for k in HEADF])
def signed_to(P, tree):
    out = np.empty(len(P))
    for i, p in enumerate(P):
        loc, nrm, idx, dist = tree.find_nearest(Vector(p)); out[i] = dist if (Vector(p) - loc).dot(nrm) >= 0 else -dist
    return out
ARMOUR = {'Shihtzu_body': faces_where('Shihtzu_body', lambda l, i: l.startswith(('pauldron', 'armour_torso', 'plum_hood'))), 'Shihtzu_cloak': CLOTH['Shihtzu_cloak']}
for t in 'LR': ARMOUR['Shihtzu_arm_' + t] = CLOTH['Shihtzu_arm_' + t]
def armour_overlaps(Vs):
    at, ao = build(ARMOUR, Vs); out = {}
    for t in 'LR':
        et = BVHTree.FromPolygons([Vector(p) for p in Vs['Shihtzu_ear_' + t]], POLY['Shihtzu_ear_' + t])
        out[t] = set(i for i, j in et.overlap(at))
    return out
pose(dict(NEUTRAL)); Vs0 = all_V(); ht0 = head_tree(Vs0)
EAR_D0 = {t: signed_to(Vs0['Shihtzu_ear_' + t], ht0) for t in 'LR'}
ARM0 = armour_overlaps(Vs0)
def game_angles(Sa, g):
    a = Sa * 1.4 * g
    t = math.tanh(a / 1.05) * 1.05 if a < 0 else math.tanh(a / .6) * .6
    b = math.tanh(Sa * .25 * g / .35) * .35; zl = Sa * .12 * (g - 1)
    return t, b, zl, -zl
def inside_depth(P, Vh, Fh):
    """depth (m) of each point inside the closed head skin (0 outside): ray parity along 3 directions (majority), then the nearest distance"""
    tr = BVHTree.FromPolygons([Vector(p) for p in Vh], Fh); out = np.zeros(len(P))
    dirs = [Vector((1, .13, .07)).normalized(), Vector((-.1, 1, .2)).normalized(), Vector((.05, -.2, 1)).normalized()]
    for i, p in enumerate(P):
        par = 0
        for d in dirs:
            o = Vector(p); n_ = 0; trav = 0.
            while trav < 1.5:
                h = tr.ray_cast(o, d, 1.5 - trav)
                if h[0] is None: break
                n_ += 1; trav += (h[0] - o).length + 1e-5; o = h[0] + d * 1e-5
            par += n_ % 2
        if par >= 2: out[i] = tr.find_nearest(Vector(p))[3]
    return out
def armour_depth(P, Vs):
    at, ao = build(ARMOUR, Vs); out = np.zeros(len(P))
    for i, p in enumerate(P):
        loc, nrm, idx, d = at.find_nearest(Vector(p), .04)
        if loc is not None and (Vector(p) - loc).dot(nrm) < 0: out[i] = d
    return out
HF_ALL = POLY['Shihtzu_head']
D0 = {e: (inside_depth(Vs0['Shihtzu_ear_' + e], Vs0['Shihtzu_head'], HF_ALL), armour_depth(Vs0['Shihtzu_ear_' + e], Vs0)) for e in 'LR'}
def ear_eval(c):
    pose(c); Vs = all_V(); hd = 0.; ad = 0.
    for e in 'LR':
        P = Vs['Shihtzu_ear_' + e]
        h = inside_depth(P, Vs['Shihtzu_head'], HF_ALL) - D0[e][0]; a = armour_depth(P, Vs) - D0[e][1]
        hd = max(hd, float(h.max())); ad = max(ad, float(a.max()))
    return round(hd * 1000, 1), round(ad * 1000, 1)
contract = {}
for name, ch in (('tips +0.6, ears +0.35', {'earTip_L': (.6, 0, 0), 'earTip_R': (.6, 0, 0), 'ear_L': (.35, 0, 0), 'ear_R': (.35, 0, 0)}),
                 ('tips -1.05, ears -0.35', {'earTip_L': (-1.05, 0, 0), 'earTip_R': (-1.05, 0, 0), 'ear_L': (-.35, 0, 0), 'ear_R': (-.35, 0, 0)}),
                 ('ears Z in 0.3', {'ear_L': (0, 0, -.3), 'ear_R': (0, 0, .3)}), ('ears Z out 0.3', {'ear_L': (0, 0, .3), 'ear_R': (0, 0, -.3)}),
                 ('arms raised Z 1.3', {'upperarm_L': (0, 0, 1.3), 'upperarm_R': (0, 0, -1.3)}), ('attack -2.4', {'upperarm_R': (-2.4, 0, -.12)})):
    c = dict(NEUTRAL); c.update(ch); d, a_ = ear_eval(c)
    contract[name] = {'lock_new_depth_into_head_mm': d, 'lock_new_depth_into_armour_mm': a_}
    print('EARPOSE', name, contract[name], flush=True)
def ear_sweep(SA):
    sweep = {}; safe_g = 0.
    for g in [1.0, .8, .6, .5, .4, .3, .2]:
        wh = 0; wa = 0; at = None
        for Sa in SA:
            t, b, zl, zr = game_angles(float(Sa), g)
            c = dict(NEUTRAL); c.update({'earTip_L': (t, 0, 0), 'earTip_R': (t, 0, 0), 'ear_L': (b, 0, zl), 'ear_R': (b, 0, zr)})
            h_, a_ = ear_eval(c)
            if h_ + a_ > wh + wa: wh, wa, at = h_, a_, [round(float(Sa), 2), round(t, 3), round(b, 3)]
        sweep['%.2f' % g] = {'lock_new_depth_into_head_mm_max': wh, 'lock_new_depth_into_armour_mm_max': wa, 'worst_at_Sa_tip_ear': at}
        print('EARGAIN', g, sweep['%.2f' % g], flush=True)
        if wh <= 6 and wa <= 6 and not safe_g: safe_g = g
    return sweep, safe_g
sweep, safe_g = ear_sweep(np.linspace(-1.2, 2.6, 14))                 # every spring value, the strongest earKick included
sweep_walk, safe_walk = ear_sweep(np.linspace(-.8, 1.2, 9))           # walking / running / idle (no kicks)
# ---- the closed eye: eyeball specks through the lids
def gdir(yaw, elev=45):
    e = math.radians(elev); y = math.radians(yaw); return Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
c = dict(NEUTRAL); c.update({'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}); pose(c); dg_ = bpy.context.evaluated_depsgraph_get()
eL = arm.data.bones['eye_L'].head_local
specks = {}
for t_, sx in (('L', 1), ('R', -1)):
    for vn, dv in (('front', Vector((0, -1, 0))), ('34in', Vector((sx * .6, -.8, .1)).normalized()), ('34out', Vector((-sx * .6, -.8, .1)).normalized()),
                   ('game+45', gdir(45)), ('game-45', gdir(-45))):
        n_ = 0
        for x in np.linspace(abs(eL.x) - .09, abs(eL.x) + .09, 90):
            for z in np.linspace(eL.z - .08, eL.z + .08, 80):
                o = Vector((sx * x, eL.y - .10, z)) + dv * 1.0
                ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg_, o, -dv, distance=3)
                if ok and ob.name.startswith('Shihtzu_eye'): n_ += 1
        specks[t_ + ' ' + vn] = n_
print('SPECKS', json.dumps(specks), flush=True)
# ---- the open mouth: rays through the mouth that meet a back face of the head (a hole into the interior)
lipL = arm.data.bones['lip_L'].head_local
holes = {}; HOLE_PTS = []
for smile in (.4, 1.0):
    c = dict(NEUTRAL); c.update({'jaw': (.42, 0, 0)}); pose(c, smile=smile); dg_ = bpy.context.evaluated_depsgraph_get()
    for vn, dv in (('front', Vector((0, -1, 0))), ('34L', Vector((.6, -.8, .05)).normalized()), ('34R', Vector((-.6, -.8, .05)).normalized()),
                   ('game+45', gdir(45)), ('game-45', gdir(-45)), ('below', Vector((0, -.8, -.6)).normalized())):
        n_ = 0; cav = 0
        for x in np.linspace(-lipL.x * 1.15, lipL.x * 1.15, 60):
            for z in np.linspace(lipL.z - .06, lipL.z + .02, 50):
                o = Vector((x, lipL.y - .005, z)) + dv * 1.0
                ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg_, o, -dv, distance=3)
                if not ok: continue
                if ob.name.startswith('Shihtzu_mouth') or ob.name.startswith('Shihtzu_tongue'): cav += 1
                elif ob.name == 'Shihtzu_head' and nrm.dot(-dv) > 0:
                    n_ += 1          # the ray travels along the normal: the skin's inside
                    if len(HOLE_PTS) < 400: HOLE_PTS.append([vn, round(smile, 1)] + [round(c, 4) for c in loc])
        holes['smile %.1f %s' % (smile, vn)] = {'back_face_rays (holes)': n_, 'cavity_or_tongue_rays': cav}
print('HOLES', json.dumps(holes), flush=True)
report = {'rule': 'visible = fur triangles newly crossing cloth / armour vs rest; covered = the designed hidden junctions (see the module doc)',
          'fur_through_cloth': res, 'ear_contract_poses': contract,
          'earGain_rule': 'the game ear motion (animator.js secondary) at each earGain: safe = no lock vertex pushed more than 6 mm deeper into the head (inside test by ray parity) or into the pauldrons / torso / hood / cloak / sleeves than at rest, over S.a in [-1.2, 2.6] (every spring value, the strongest earKick included) and over [-0.8, 1.2] (walk / run / idle)',
          'earGain_sweep_full': sweep, 'largest_safe_earGain_full_range': safe_g, 'earGain_sweep_walk': sweep_walk, 'largest_safe_earGain_walk': safe_walk, 'closed_eye_eyeball_rays_per_view_of_7200': specks, 'open_mouth_rays_of_3000': holes, 'hole_points_sample': HOLE_PTS[:80]}
json.dump(report, open(os.path.join(T, 'pose-check.json'), 'w'), indent=1)
print('POSE_CHECK', json.dumps({k: [v['visible_fur_through_cloth'], v['covered_junction_triangles']] for k, v in res.items()}))
print('SAFE_EARGAIN', safe_g, 'walk', safe_walk)
