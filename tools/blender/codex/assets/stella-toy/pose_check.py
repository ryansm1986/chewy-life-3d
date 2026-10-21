"""Poke-through and safety checks on the posed rig (the same game rotations as rig_tests.py), against the rest pose.
    blender --background --factory-startup --python pose_check.py   -> pose-check.json
- legs / feet / tail through the bell skirts: for each vertex, a horizontal ray from the skirt axis through it; if the ray meets
  the (posed) skirt layer before the vertex, the vertex is outside that layer: its depth beyond the layer is the poke (designed
  exits excluded: the parts below each hem have no hit);
- the skirt layers crossing: the same test for the sheer layer against the pink one and the pink against the periwinkle;
- triangle overlaps (new vs rest) for: ears x sleeves / robe / pearls, fur arms x sleeves, pearls x head, tail x skirts / bow;
- the ears into the head (ray-parity inside depth, new vs rest), over the contract poses and the game's ear motion (earGain sweep);
- the closed eye (blink 1.22): rays that reach the eyeball; the open mouth (jaw 0.42): rays that meet the head's inside (holes).
"""
import bpy, json, os, math, sys
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
T = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'stella-toy_rig.blend'))
arm = bpy.data.objects['Stella_Rig']; arm.data.pose_position = 'POSE'
LAB = json.load(open(os.path.join(T, 'rig-part-labels.json')))
src = open(os.path.join(T, 'rig_tests.py'), encoding='utf-8').read()
POSES = eval(src[src.index('POSES = [') + 8: src.index(']\nHAPPY') + 1])
NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
PB = arm.pose.bones
_RJ = json.load(open(os.path.join(T, 'joints-rig.json')))
LID_HINGE = {t: Vector(_RJ.get('lid_hinge_blender', {'L': [1, 0, 0], 'R': [1, 0, 0]})[t]) for t in 'LR'}   # Blender (cos t, +/- sin t, 0) = game (cos t, 0, -/+ sin t): the game's lidTilt hinge
def pose(ch, smile=.4):
    for b in PB: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    for name, v in ch.items():
        if name in ('root_y', 'smile', 'parasol'): continue
        gx, gy, gz = v
        if name.startswith('lid'): PB[name].matrix_basis = Matrix.Rotation(gx, 4, LID_HINGE[name[-1]]); continue   # the game's lidTilt hinge
        PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    smile = ch.get('smile', smile)
    for t in 'LR': PB['lip_' + t].location = (0, .004 * smile, .007 * smile)
    bpy.context.view_layer.update()
def evaluated(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    V = np.array([tuple(e.matrix_world @ v.co) for v in m.vertices]); e.to_mesh_clear(); return V
OB = {n: bpy.data.objects[n] for n in LAB}
POLY = {n: [tuple(p.vertices) for p in o.data.polygons] for n, o in OB.items()}
def all_V(): return {n: evaluated(o) for n, o in OB.items()}
def tree(V, F): return BVHTree.FromPolygons([Vector(p) for p in V], F)
def sel(n, pred): lab = LAB[n]; return [i for i in range(len(lab)) if pred(lab[i])]
RCY = -.010
LEGV = {n: sel('Stella_body', lambda l, t=t: l.startswith(('fur_leg.' + t, 'fur_foot.' + t))) for t, n in (('L', 'legL'), ('R', 'legR'))}
SKIRTS = ['Stella_skirt_inner', 'Stella_skirt_mid', 'Stella_skirt_outer']
def outside_depth(P, St, axis_c=(0, RCY)):
    """for points P: depth (m) beyond the skirt surface along the horizontal ray from the skirt axis (0 if inside or no hit)"""
    out = np.zeros(len(P))
    for i, p in enumerate(P):
        c = Vector((axis_c[0], axis_c[1], p[2])); d = Vector(p) - c; L = d.length
        if L < 1e-6: continue
        d /= L; h = St.ray_cast(c, d, L)
        if h[0] is not None: out[i] = L - h[3]
    return out
def skirt_pokes(Vs):
    res = {}
    for sk in SKIRTS:
        St = tree(Vs[sk], POLY[sk])
        for nm, idx in LEGV.items():
            dd = outside_depth(Vs['Stella_body'][idx], St); res[nm + ' x ' + sk.split('_')[-1]] = round(float(dd.max()) * 1000, 1)
    return res
CROSS0 = {}
def layer_cross(Vs):
    res = {}
    for a, b in (('Stella_skirt_inner', 'Stella_skirt_mid'), ('Stella_skirt_mid', 'Stella_skirt_outer')):
        St = tree(Vs[b], POLY[b]); Pa = Vs[a]
        # only points above b's lowest hem point (below it, a hangs out by design)
        zmin = Vs[b][:, 2].min() + .015; m = Pa[:, 2] > zmin
        dd = np.zeros(len(Pa)); dd[m] = outside_depth(Pa[m], St)
        if (a, b) in CROSS0: dd = dd - CROSS0[(a, b)]                    # relative to rest (the notches between the lobes are open by design)
        else: CROSS0[(a, b)] = dd.copy(); dd = dd * 0
        res[a.split('_')[-1] + ' outside ' + b.split('_')[-1]] = round(float(dd.max()) * 1000, 1)
    return res
PEARL = sel('Stella_body', lambda l: l.startswith('pearl.')); ROBE = sel('Stella_body', lambda l: l.startswith(('robe_top', 'collar_band')))
def fsub(n, vids):
    s_ = set(vids); return [f for f in POLY[n] if all(i in s_ for i in f)]
PAIRS = {'ear_L x sleeve_L': ('Stella_ear_L', None, 'Stella_sleeve_L', None), 'ear_R x sleeve_R': ('Stella_ear_R', None, 'Stella_sleeve_R', None),
         'ear_L x robe': ('Stella_ear_L', None, 'Stella_body', ROBE), 'ear_R x robe': ('Stella_ear_R', None, 'Stella_body', ROBE),
         'ear_L x pearls': ('Stella_ear_L', None, 'Stella_body', PEARL), 'ear_R x pearls': ('Stella_ear_R', None, 'Stella_body', PEARL),
         'arm_L x sleeve_L': ('Stella_arm_L', None, 'Stella_sleeve_L', None), 'arm_R x sleeve_R': ('Stella_arm_R', None, 'Stella_sleeve_R', None),
         'pearls x head': ('Stella_body', PEARL, 'Stella_head', None), 'tail x skirt_outer': ('Stella_tail', None, 'Stella_skirt_outer', None),
         'tail x bow': ('Stella_tail', None, 'Stella_bow', None), 'tail x obi_tails': ('Stella_tail', None, 'Stella_obi_tails', None),
         'sleeve_L x robe': ('Stella_sleeve_L', None, 'Stella_body', ROBE), 'sleeve_R x robe': ('Stella_sleeve_R', None, 'Stella_body', ROBE),
         'obi_tails x skirt_outer': ('Stella_obi_tails', None, 'Stella_skirt_outer', None)}
def overlaps(Vs):
    out = {}
    for k, (a, av, b, bv) in PAIRS.items():
        Fa = POLY[a] if av is None else fsub(a, av); Fb = POLY[b] if bv is None else fsub(b, bv)
        out[k] = set(tree(Vs[a], Fa).overlap(tree(Vs[b], Fb)))
    return out
def inside_depth(P, Vh, Fh):
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
BOWT = sel('Stella_bow', lambda l: l.startswith('bow_tail'))
def sub(V, n, vids): return V[n] if vids is None else V[n][vids]
def cross_depth(A, av, B, bv, Vs, Vn, min0=.004, maxd=.06):
    """thin open shells: A's vertices that were clearly on one side of B (>= min0) at the neutral pose and are now on the other
    side (nearest point + its normal); the deepest such crossing in mm"""
    Pa = sub(Vs, A, av); Pa0 = sub(Vn, A, av); Fb = POLY[B] if bv is None else fsub(B, bv)
    tb = tree(Vs[B], Fb); tb0 = tree(Vn[B], Fb); worst = 0.
    for k in range(len(Pa)):
        h0 = tb0.find_nearest(Vector(Pa0[k]), maxd)
        if h0[0] is None: continue
        s0 = (Vector(Pa0[k]) - h0[0]).dot(h0[1])
        if abs(s0) < min0: continue
        h = tb.find_nearest(Vector(Pa[k]), maxd)
        if h[0] is None: continue
        s_ = (Vector(Pa[k]) - h[0]).dot(h[1])
        if s_ * s0 < 0: worst = max(worst, abs(s_))
    return round(worst * 1000, 1)
CROSS_PAIRS = {'ear_L through sleeve_L': ('Stella_ear_L', None, 'Stella_sleeve_L', None), 'sleeve_L through ear_L': ('Stella_sleeve_L', None, 'Stella_ear_L', None),
               'ear_R through sleeve_R': ('Stella_ear_R', None, 'Stella_sleeve_R', None), 'sleeve_R through ear_R': ('Stella_sleeve_R', None, 'Stella_ear_R', None),
               'obi_tails through skirt_outer': ('Stella_obi_tails', None, 'Stella_skirt_outer', None), 'skirt_outer through obi_tails': ('Stella_skirt_outer', None, 'Stella_obi_tails', None),
               'tail through bow_tails': ('Stella_tail', None, 'Stella_bow', BOWT), 'bow_tails through tail': ('Stella_bow', BOWT, 'Stella_tail', None),
               'tail through skirt_outer': ('Stella_tail', None, 'Stella_skirt_outer', None)}
def crossings(Vs, Vn):
    out = {}
    for k, (a, av, b, bv) in CROSS_PAIRS.items():
        d = cross_depth(a, av, b, bv, Vs, Vn)
        if d > 0: out[k] = d
    return out
pose(dict(NEUTRAL)); Vs0 = all_V(); OV0 = overlaps(Vs0); layer_cross(Vs0)
EAR_IN0 = {e: inside_depth(Vs0['Stella_ear_' + e], Vs0['Stella_head'], POLY['Stella_head']) for e in 'LR'}
PEARL_IN0 = inside_depth(Vs0['Stella_body'][PEARL], Vs0['Stella_head'], POLY['Stella_head'])
res = {}
for key, label, ch, neutral in POSES:
    c = dict(NEUTRAL) if neutral else {}; c.update(ch); pose(c); Vs = all_V()
    ov = overlaps(Vs); new = {k: len(v - OV0[k]) for k, v in ov.items() if len(v - OV0[k])}
    ear_in = max(float((inside_depth(Vs['Stella_ear_' + e], Vs['Stella_head'], POLY['Stella_head']) - EAR_IN0[e]).max()) for e in 'LR')
    pearl_in = float((inside_depth(Vs['Stella_body'][PEARL], Vs['Stella_head'], POLY['Stella_head']) - PEARL_IN0).max())
    res[key] = {'label': label, 'skirt_poke_mm': skirt_pokes(Vs), 'layer_cross_mm': layer_cross(Vs), 'new_overlap_tris': new, 'shell_cross_mm': crossings(Vs, Vs0),
                'ear_new_depth_into_head_mm': round(ear_in * 1000, 1), 'pearl_new_depth_into_head_mm': round(pearl_in * 1000, 1)}
    print('POSE', key, json.dumps({k: v for k, v in res[key].items() if k != 'label'}), flush=True)
# ---- the jaw and the pearls
for nm, ch in (('jaw .42', {'jaw': (.42, 0, 0)}), ('jaw .42 + head nod .3', {'jaw': (.42, 0, 0), 'head': (.3, 0, 0)}), ('head nod .25 (the game max)', {'head': (.25, 0, 0)}), ('head turn .45', {'head': (0, .45, 0)})):
    c = dict(NEUTRAL); c.update(ch); pose(c); Vs = all_V()
    pin = float((inside_depth(Vs['Stella_body'][PEARL], Vs['Stella_head'], POLY['Stella_head']) - PEARL_IN0).max())
    ov = overlaps(Vs); res['face: ' + nm] = {'pearl_new_depth_into_head_mm': round(pin * 1000, 1), 'new_overlap_tris': {k: len(v - OV0[k]) for k, v in ov.items() if len(v - OV0[k])}}
    print('FACEPOSE', nm, json.dumps(res['face: ' + nm]), flush=True)
if '--quick' in sys.argv: print('POSE_CHECK_DONE quick'); sys.exit(0)
# ---- the ears over the game's ear motion (animator.js secondary): the largest safe earGain
def game_angles(Sa, g):
    a = Sa * 1.4 * g
    t = math.tanh(a / 1.05) * 1.05 if a < 0 else math.tanh(a / .6) * .6
    b = math.tanh(Sa * .25 * g / .35) * .35; zl = Sa * .12 * (g - 1)
    return t, b, zl, -zl
SLV = {e: (Vs0['Stella_sleeve_' + e], POLY['Stella_sleeve_' + e]) for e in 'LR'}
def ear_eval(c):
    pose(c); Vs = all_V(); hd = 0.; sl = 0.
    for e in 'LR':
        P = Vs['Stella_ear_' + e]
        h = inside_depth(P, Vs['Stella_head'], POLY['Stella_head']) - EAR_IN0[e]; hd = max(hd, float(h.max()))
        sl = max(sl, cross_depth('Stella_ear_' + e, None, 'Stella_sleeve_' + e, None, Vs, Vs0), cross_depth('Stella_sleeve_' + e, None, 'Stella_ear_' + e, None, Vs, Vs0))
    return round(hd * 1000, 1), sl
def ear_sweep(SA):
    sweep = {}; safe_g = 0.
    for g in [1.0, .8, .6, .5, .4, .3]:
        wh = 0; ws = 0; at = None
        for Sa in SA:
            t, b, zl, zr = game_angles(float(Sa), g)
            c = dict(NEUTRAL); c.update({'earTip_L': (t, 0, 0), 'earTip_R': (t, 0, 0), 'ear_L': (b, 0, zl), 'ear_R': (b, 0, zr)})
            h_, s_ = ear_eval(c)
            if h_ > wh or s_ > ws: wh, ws, at = max(wh, h_), max(ws, s_), [round(float(Sa), 2), round(t, 3), round(b, 3)]
        sweep['%.2f' % g] = {'ear_new_depth_into_head_mm_max': wh, 'ear_sleeve_cross_mm_max': ws, 'worst_at_Sa_tip_ear': at}
        print('EARGAIN', g, sweep['%.2f' % g], flush=True)
        if wh <= 6 and ws <= 6 and not safe_g: safe_g = g
    return sweep, safe_g
sweep, safe_g = ear_sweep(np.linspace(-1.2, 2.6, 12))
sweep_walk, safe_walk = ear_sweep(np.linspace(-.8, 1.2, 8))
# ---- the closed eye: eyeball specks through the lids
def gdir(yaw, elev=45):
    e = math.radians(elev); y = math.radians(yaw); return Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
c = dict(NEUTRAL); c.update({'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}); pose(c); dg_ = bpy.context.evaluated_depsgraph_get()
eL = arm.data.bones['eye_L'].head_local
specks = {}
for t_, sx in (('L', 1), ('R', -1)):
    for vn, dv in (('front', Vector((0, -1, 0))), ('34in', Vector((sx * .6, -.8, .1)).normalized()), ('34out', Vector((-sx * .6, -.8, .1)).normalized()),
                   ('game+45', gdir(45)), ('game-45', gdir(-45))):
        n_ = 0; bk = 0
        for x in np.linspace(abs(eL.x) - .09, abs(eL.x) + .09, 90):
            for z in np.linspace(eL.z - .08, eL.z + .08, 80):
                o = Vector((sx * x, eL.y - .10, z)) + dv * 1.0
                ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg_, o, -dv, distance=3)
                if ok and ob.name.startswith('Stella_eye'): n_ += 1
                elif ok and nrm.dot(-dv) > 0: bk += 1                       # a back face: a gap between the lid and the skin
        specks[t_ + ' ' + vn] = n_; specks[t_ + ' ' + vn + ' back faces'] = bk
print('SPECKS', json.dumps(specks), flush=True)
# ---- the open mouth: rays through the mouth that meet a back face of the head (a hole)
lipL = arm.data.bones['lip_L'].head_local
holes = {}; HOLE_PTS = []
for smile in (.4, 1.0):
    c = dict(NEUTRAL); c.update({'jaw': (.42, 0, 0)}); pose(c, smile=smile); dg_ = bpy.context.evaluated_depsgraph_get()
    for vn, dv in (('front', Vector((0, -1, 0))), ('34L', Vector((.6, -.8, .05)).normalized()), ('34R', Vector((-.6, -.8, .05)).normalized()),
                   ('game+45', gdir(45)), ('game-45', gdir(-45)), ('below', Vector((0, -.8, -.6)).normalized())):
        n_ = 0; cav = 0
        for x in np.linspace(-lipL.x * 1.15, lipL.x * 1.15, 60):
            for z in np.linspace(lipL.z - .07, lipL.z + .02, 50):
                o = Vector((x, lipL.y - .005, z)) + dv * 1.0
                ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg_, o, -dv, distance=3)
                if not ok: continue
                if ob.name.startswith(('Stella_mouth', 'Stella_tongue')): cav += 1
                elif ob.name == 'Stella_head' and nrm.dot(-dv) > 0:
                    n_ += 1
                    if len(HOLE_PTS) < 400: HOLE_PTS.append([vn, round(smile, 1)] + [round(c, 4) for c in loc])
        holes['smile %.1f %s' % (smile, vn)] = {'back_face_rays (holes)': n_, 'cavity_or_tongue_rays': cav}
print('HOLES', json.dumps(holes), flush=True)
report = {'rule': 'skirt_poke_mm: how far a leg / foot vertex lies outside each skirt layer (horizontal rays from the skirt axis); layer_cross_mm: an inner layer outside the next one (above the outer hem), relative to rest; new_overlap_tris: triangle pairs intersecting that do not at the neutral pose (contact sliding counts too); shell_cross_mm: the deepest vertex now on the other side of a thin shell it was clearly (>= 4 mm) clear of at the neutral pose',
          'poses': res, 'earGain_sweep_full': sweep, 'largest_safe_earGain_full_range': safe_g, 'earGain_sweep_walk': sweep_walk,
          'largest_safe_earGain_walk': safe_walk, 'closed_eye_eyeball_rays_per_view_of_7200': specks, 'open_mouth_rays_of_3000': holes, 'hole_points_sample': HOLE_PTS[:80]}
json.dump(report, open(os.path.join(T, 'pose-check.json'), 'w'), indent=1)
print('SAFE_EARGAIN', safe_g, 'walk', safe_walk)
print('POSE_CHECK_DONE')
