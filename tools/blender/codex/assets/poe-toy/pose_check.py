"""Poke-through checks on the posed rig (the same game rotations as rig_tests.py), against the rest pose.
    blender --background --factory-startup --python pose_check.py   -> pose-check.json
- fur through cloth: fur triangles (head skin, ears, mitten paws, tail) newly crossing cloth / prop triangles (the body: top,
  collar, scarf, sash, shorts, wraps, tabi, hood, pouch, scroll; the sleeves, cuffs and guards), per pose. 'covered' = the
  approved hidden junctions (the paw's wrist inside the guard, the tail root inside the top / shorts, the head's underside
  inside the collar, the ear roots in the skull); 'visible' = everything else.
- the tail vs the fuma (riding the chest bone) and vs the shorts in the tail and gait poses;
- the ear flap vs the skull at earTip +0.6, and the left ear vs the festival mask over the game's ear range -> the safe earGain.
"""
import bpy, json, os, math, sys
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
T = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'poe-toy_rig.blend'))
arm = bpy.data.objects['Poe_Rig']; arm.data.pose_position = 'POSE'
LAB = json.load(open(os.path.join(T, 'rig-part-labels.json')))
src = open(os.path.join(T, 'rig_tests.py'), encoding='utf-8').read()
POSES = eval(src[src.index('POSES = [') + 8: src.index(']\nFACES') + 1])
SQ = (.58, -.24)
NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
PB = arm.pose.bones
def pose(ch):
    for b in PB: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    arm.location = (0, 0, 0)
    for name, v in ch.items():
        if name == 'root_y': arm.location = (0, 0, v); continue
        if name == 'smile': continue
        gx, gy, gz = v
        PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    bpy.context.view_layer.update()
def evaluated(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    V = np.array([tuple(e.matrix_world @ v.co) for v in m.vertices]); F = [tuple(p.vertices) for p in m.polygons]; e.to_mesh_clear(); return V, F
OB = {n: bpy.data.objects[n] for n in LAB}
REST = {n: np.array([tuple(v.co) for v in o.data.vertices]) for n, o in OB.items()}
POLY = {n: [tuple(p.vertices) for p in o.data.polygons] for n, o in OB.items()}
def faces_where(n, pred):
    lab = LAB[n]; return [k for k, f in enumerate(POLY[n]) if all(pred(lab[i], i) for i in f)]
# per-vertex parameters for the covered-junction classes
rig = json.load(open(os.path.join(T, 'joints-rig.json')))
BH = {b['name']: np.array(b['head_blender_m']) for b in rig['bones']}
def arm_t(p, t):
    sh = BH['upperarm_' + t]; wr = BH['hand_' + t]; d = wr - sh; return float((p - sh) @ d / (d @ d))
TAIL_ROOT_Y = .265      # the tail root inside the top / shorts at rest (y < this)
FUR = {}; CLOTH = {}
FUR['Poe_head'] = faces_where('Poe_head', lambda l, i: l == 'ball_head_skin')
FUR['Poe_tail'] = faces_where('Poe_tail', lambda l, i: True)
for t in 'LR':
    FUR['Poe_arm_' + t] = faces_where('Poe_arm_' + t, lambda l, i: l.startswith('black_mitten_paw'))
    FUR['Poe_ear_' + t] = faces_where('Poe_ear_' + t, lambda l, i: True)
    CLOTH['Poe_arm_' + t] = faces_where('Poe_arm_' + t, lambda l, i: not l.startswith('black_mitten_paw'))
CLOTH['Poe_body'] = faces_where('Poe_body', lambda l, i: True)
def covered(n, k):
    f = POLY[n][k]; c = REST[n][list(f)].mean(0); lab = LAB[n][f[0]]
    if n.startswith('Poe_arm_'): return arm_t(c, n[-1]) < .300                     # the wrist inside the guard
    if n == 'Poe_tail': return c[1] < TAIL_ROOT_Y                                  # the tail root inside the top and shorts
    if n == 'Poe_head': return c[2] < .700                                         # the head's underside inside the collar / hood
    if n.startswith('Poe_ear_'): return False
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
def chest_matrix():
    pb = PB['chest']; return arm.matrix_world @ pb.matrix @ arm.data.bones['chest'].matrix_local.inverted()
fuma = bpy.data.objects['fuma_back']; FUMA_V = np.array([tuple(v.co) for v in fuma.data.vertices]); FUMA_F = [tuple(p.vertices) for p in fuma.data.polygons]
def fuma_tree():
    M = np.array(chest_matrix()); V = (np.c_[FUMA_V, np.ones(len(FUMA_V))] @ M.T)[:, :3]
    return BVHTree.FromPolygons([Vector(p) for p in V], FUMA_F)
def overlap_count(na, ka, nb, kb, Vs, extra=None):
    ta = BVHTree.FromPolygons([Vector(p) for p in Vs[na]], [POLY[na][k] for k in ka])
    tb = extra if extra is not None else BVHTree.FromPolygons([Vector(p) for p in Vs[nb]], [POLY[nb][k] for k in kb])
    return len(ta.overlap(tb))
def all_V():
    return {n: evaluated(o)[0] for n, o in OB.items()}
SHORTS = faces_where('Poe_body', lambda l, i: l.startswith('dmoss_puffy_shorts'))
TAILF = FUR['Poe_tail']
res = {}; base_hits = None; base_tail = None
for key, label, ch, neutral in POSES:
    c = dict(NEUTRAL) if neutral else {}; c.update(ch); pose(c); Vs = all_V()
    hits = fur_through(Vs)
    if base_hits is None: base_hits = set(hits)
    new = {h: v for h, v in hits.items() if h not in base_hits}
    vis = {}; cov = {}
    for (n, k), (cl, fl) in new.items():
        key2 = fl.split('.')[0] + ' x ' + cl.split('.')[0]
        (cov if covered(n, k) else vis)[key2] = (cov if covered(n, k) else vis).get(key2, 0) + 1
    tail_fuma = overlap_count('Poe_tail', TAILF, None, None, Vs, extra=fuma_tree())
    tail_shorts = overlap_count('Poe_tail', TAILF, 'Poe_body', SHORTS, Vs)
    if base_tail is None: base_tail = (tail_fuma, tail_shorts)
    res[key] = {'label': label, 'visible_fur_through_cloth': sum(vis.values()), 'covered_junction_triangles': sum(cov.values()),
                'visible_by_pair': vis, 'covered_by_pair': cov, 'tail_x_fuma_tris': tail_fuma, 'tail_x_shorts_tris_new': max(0, tail_shorts - base_tail[1])}
    print('POSE', key, res[key]['visible_fur_through_cloth'], res[key]['covered_junction_triangles'], tail_fuma, flush=True)
# the ear flap vs the skull: the ear's OUTER surface (rest distance from the skull > 2 cm) must never go inside the skull
HEADF = FUR['Poe_head']
def head_tree(Vs): return BVHTree.FromPolygons([Vector(p) for p in Vs['Poe_head']], [POLY['Poe_head'][k] for k in HEADF])
def signed_to_head(P, tree):
    out = np.empty(len(P))
    for i, p in enumerate(P):
        loc, nrm, idx, dist = tree.find_nearest(Vector(p)); out[i] = dist if (Vector(p) - loc).dot(nrm) >= 0 else -dist
    return out
pose(dict(NEUTRAL)); Vs0 = all_V(); ht0 = head_tree(Vs0)
EAR_D0 = {t: signed_to_head(Vs0['Poe_ear_' + t], ht0) for t in 'LR'}
ear_skull = {}
for t in 'LR':
    outer = EAR_D0[t] > .02
    for tip, er in ((.6, .35), (.6, 0), (.3, 0), (-1.05, -.35), (-1.05, 0)):
        c = dict(NEUTRAL); c.update({'earTip_' + t: (tip, 0, 0), 'ear_' + t: (er, 0, 0)}); pose(c); Vs = all_V()
        d1 = signed_to_head(Vs['Poe_ear_' + t], head_tree(Vs))
        ear_skull['%s tip %+.2f ear %+.2f' % (t, tip, er)] = {'outer_surface_verts_inside_skull': int((outer & (d1 < -.001)).sum()),
                                                             'deepest_outer_mm': round(float(d1[outer].min()) * 1000, 1)}
# the left ear vs the festival mask (rigid on the head): an ear vertex is visibly through the mask when it is inside the mask's
# closed shell (odd crossings along the mask's facing) or in front of the mask's face (a ray back toward the head meets it)
MF = rig['mask_frame']; MFACE = Vector(MF['face']).normalized()
MASKF = faces_where('Poe_mask', lambda l, i: True)
def mask_tree(Vs): return BVHTree.FromPolygons([Vector(p) for p in Vs['Poe_mask']], [POLY['Poe_mask'][k] for k in MASKF])
def crossings(tree, p, d, maxd=.6):
    n_ = 0; o = Vector(p); travelled = 0.
    while travelled < maxd:
        hit = tree.ray_cast(o, d, maxd - travelled)
        if hit[0] is None: break
        n_ += 1; step = (hit[0] - o).length + 1e-5; travelled += step; o = hit[0] + d * 1e-5
    return n_
def through_mask(Vs, tol=.002):
    mt = mask_tree(Vs); bad = set()
    for i, p in enumerate(Vs['Poe_ear_L']):
        loc, nrm, idx, d = mt.find_nearest(Vector(p))      # inside = a majority of 3 ray parities AND behind the nearest face
        par = crossings(mt, p, MFACE) % 2 + crossings(mt, p, -MFACE) % 2 + crossings(mt, p, Vector((0, 0, 1))) % 2
        inside = par >= 2 and (Vector(p) - loc).dot(nrm) < 0 and d > tol
        h = mt.ray_cast(Vector(p), -MFACE, .25); front = h[0] is not None and h[3] > tol
        if inside or front: bad.add(i)
    return bad
pose(dict(NEUTRAL)); Vs0 = all_V(); MASK_REST = through_mask(Vs0)
def mask_new(tip, er):
    c = dict(NEUTRAL); c.update({'earTip_L': (float(tip), 0, 0), 'ear_L': (float(er), 0, 0)}); pose(c); Vs = all_V()
    return len(through_mask(Vs) - MASK_REST)
# the game's own ear motion (animator.js secondary()): the spring value S.a drives, with g = earGain,
#   earTip.x = soft(1.4 g S.a) (tanh limits 1.05 up / 0.6 tighter), ear.x = 0.35 tanh(0.25 g S.a / 0.35),
#   ear.z = +-0.12 S.a (g - 1) (mirrored L / R). S.a spans about -1.2 (a jump with a random flick) to +2.6 (the strongest
#   earKick, 7 x 0.3, with the spring's ~19 % overshoot).
def game_angles(Sa, g):
    a = Sa * 1.4 * g
    t = math.tanh(a / 1.05) * 1.05 if a < 0 else math.tanh(a / .6) * .6
    b = math.tanh(Sa * .25 * g / .35) * .35; zl = Sa * .12 * (g - 1)
    return t, b, zl, -zl
SA = np.linspace(-1.2, 2.6, 20)
def mask_count(Vs): return len(through_mask(Vs) - MASK_REST)
contract_mask = {}
for tip, er in ((.6, .35), (.6, 0), (.3, 0), (-.5, -.1), (-1.05, -.35), (-1.05, 0)):
    c = dict(NEUTRAL); c.update({'earTip_L': (tip, 0, 0), 'ear_L': (er, 0, 0)}); pose(c)
    contract_mask['L tip %+.2f ear %+.2f' % (tip, er)] = mask_count(all_V())
sweep = {}; safe_skull = 0.; safe_mask = 0.; safe_g = 0.
for g in [1.0, .9, .8, .7, .6, .5, .4, .3, .2, .1]:
    ws = 0.; ats = None; wm = 0; atm = None
    for Sa in SA:
        t, b, zl, zr = game_angles(float(Sa), g)
        c = dict(NEUTRAL); c.update({'earTip_L': (t, 0, 0), 'earTip_R': (t, 0, 0), 'ear_L': (b, 0, zl), 'ear_R': (b, 0, zr)}); pose(c); Vs = all_V()
        ht = head_tree(Vs)
        for e in 'LR':
            d1 = signed_to_head(Vs['Poe_ear_' + e], ht); dmin = float(d1[EAR_D0[e] > .02].min())
            if dmin < ws: ws = dmin; ats = [e, round(float(Sa), 2), round(t, 3), round(b, 3)]
        n_ = mask_count(Vs)
        if n_ > wm: wm = n_; atm = [round(float(Sa), 2), round(t, 3), round(b, 3)]
    sweep['%.2f' % g] = {'ear_outer_surface_deepest_in_skull_mm': round(ws * 1000, 1), 'worst_skull_at_ear_Sa_tip_ear': ats,
                         'left_ear_verts_through_mask_over_2mm': wm, 'worst_mask_at_Sa_tip_ear': atm}
    print('EARGAIN', g, round(ws * 1000, 1), ats, wm, atm, flush=True)
    if ws > -.002 and not safe_skull: safe_skull = g
    if wm == 0 and not safe_mask: safe_mask = g
    if ws > -.002 and wm == 0 and not safe_g: safe_g = g
by_sa = {}
for g in (1.0, .5):
    for Sa in (-1.2, -.6, -.3, 0., .3, .6, 1.0, 1.5, 2.0, 2.6):
        t, b, zl, zr = game_angles(Sa, g)
        c = dict(NEUTRAL); c.update({'earTip_R': (t, 0, 0), 'ear_R': (b, 0, zr), 'earTip_L': (t, 0, 0), 'ear_L': (b, 0, zl)}); pose(c); Vs = all_V(); ht = head_tree(Vs)
        dR = float(signed_to_head(Vs['Poe_ear_R'], ht)[EAR_D0['R'] > .02].min())
        by_sa['g%.1f Sa%+.1f' % (g, Sa)] = {'tip': round(t, 3), 'ear': round(b, 3), 'right_ear_outer_deepest_mm': round(dR * 1000, 1), 'left_ear_mask_verts': mask_count(Vs)}
        print('BYSA', g, Sa, by_sa['g%.1f Sa%+.1f' % (g, Sa)], flush=True)
mask_base = len(MASK_REST)
# the closed eye (blink 1.22, lidD -0.1): rays over each eye opening from the front, both 3/4 and both game cameras that reach
# the eyeball first (eye-white specks through the closed lids)
def gdir(yaw, elev=45):
    e = math.radians(elev); y = math.radians(yaw); return Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
c = dict(NEUTRAL); c.update({'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}); pose(c); dg_ = bpy.context.evaluated_depsgraph_get()
specks = {}
for t_, sx in (('L', 1), ('R', -1)):
    for vn, dv in (('front', Vector((0, -1, 0))), ('34in', Vector((sx * .6, -.8, .1)).normalized()), ('34out', Vector((-sx * .6, -.8, .1)).normalized()),
                   ('game+45', gdir(45)), ('game-45', gdir(-45))):
        n_ = 0
        for x in np.linspace(.08, .29, 106):
            for z in np.linspace(.80, 1.02, 106):
                o = Vector((sx * x, -.26, z)) + dv * 1.0
                ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg_, o, -dv, distance=3)
                if ok and ob.name.startswith('Poe_eye'): n_ += 1
        specks[t_ + ' ' + vn] = n_
print('SPECKS', json.dumps(specks), flush=True)
report = {'rule': 'visible = fur triangles (head skin, ears, mitten paws, tail) newly crossing cloth or prop faces vs rest; covered = the paw wrist inside its guard (arm t < 0.30), the tail root inside the top / shorts (rest y < %.3f), the head underside inside the collar (rest z < 0.70)' % TAIL_ROOT_Y,
          'fur_through_cloth': res, 'ear_outer_surface_vs_skull': ear_skull, 'left_ear_verts_behind_or_in_mask_at_rest_excluded': mask_base,
          'earGain_rule': 'the game motion over S.a in [-1.2, 2.6]: safe = no ear outer-surface vertex more than 2 mm inside the skull (both ears) and no left-ear vertex more than 2 mm through or in front of the mask', 'earGain_sweep': sweep, 'largest_safe_earGain_skull_both_ears': safe_skull, 'largest_safe_earGain_left_ear_vs_mask': safe_mask, 'largest_safe_earGain': safe_g, 'left_ear_vs_mask_contract_poses_verts_over_2mm': contract_mask, 'closed_eye_eyeball_rays_of_11236_per_view': specks, 'ear_by_spring_value': by_sa,
          'right_ear_note': 'the right ear has no mask; its range is limited only by the skull (see ear_outer_surface_vs_skull and the sweep)', 'left_ear_note': 'the left ear is weighted at LEFT_EAR_K = 0.12 of the right ear (rig_poe-toy.py): at full motion its flap enters the mask'}
json.dump(report, open(os.path.join(T, 'pose-check.json'), 'w'), indent=1)
print('POSE_CHECK', json.dumps({k: [v['visible_fur_through_cloth'], v['covered_junction_triangles'], v['tail_x_fuma_tris']] for k, v in res.items()}))
print('EAR', json.dumps(ear_skull), 'SAFE_EARGAIN', safe_g, 'skull', safe_skull, 'mask', safe_mask)
