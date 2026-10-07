"""Pose sheet and poke-through counts for shadow-whelp_rig.blend, driven like the game (world-axis rotations about bone heads,
game axes; values from animator.js poseQuad / secondary / bark), with the wing props on the body bone at their mounts.

    blender --background --factory-startup --python pose_whelp.py -- [--only a,b] [--no-render]

Game -> Blender: rot X = +X, rot Y (up) = +Z, rot Z = -Y; translation (gx, gy, gz) -> (gx, -gz, gy); euler order XYZ.
Wings: world = (the body bone's rest-to-pose transform) . T(mount) . R(flap about the forward axis) [. mirror x].
Poke-through (fur through costume): a fur vertex of Shadow_head, Shadow_body (barrel and legs, not the collar or tag) or
Shadow_tail that the costume covers at rest (a ray along its normal meets a hood / coat / bib / tail-cover shell within
3.5 cm) and that, in the pose, is no longer covered while a ray inward meets the shell within 3 cm: the fur came out
through it. The ears pass through their slits by design; ear-against-piping triangle overlaps are counted separately.
Writes pose-check.json, poses/<pose>_{game,side}.png and preview/poses.png.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

T = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
ONLY = set((arg('--only', '') or '').split(',')) - {''}
RENDER = '--no-render' not in argv
OUT = os.path.join(T, 'poses'); os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'shadow-whelp_rig.blend'))
sc = bpy.context.scene
arm = bpy.data.objects['Shadow_Rig']; arm.hide_render = True
WM = json.load(open(os.path.join(T, 'wing_mount.json')))
REF = json.load(open(os.path.join(T, 'costume_ref.json'))); AW, AH = REF['atlas']; CH = REF['charts']

# ---------------------------------------------------------------- stage (as pose_shadow.py)
sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 32
except Exception: pass
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.film_transparent = True
world = bpy.data.worlds.new('pv'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.86, 0.84, 0.80, 1); bg.inputs['Strength'].default_value = 0.65
def light(name, loc, energy, color):
    d = bpy.data.lights.new(name, 'SUN'); d.energy = energy; d.color = color; d.angle = math.radians(20)
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.35)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
light('key', (-2.0, -3.0, 4.0), 2.6, (1, 0.96, 0.9)); light('fill', (3.0, -1.5, 1.5), 0.9, (0.9, 0.94, 1.0)); light('rim', (0.5, 3.0, 2.5), 1.2, (1, 0.95, 0.88))
sc.use_nodes = True; nt = sc.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); ov = nt.nodes.new('CompositorNodeAlphaOver')
ov.inputs[1].default_value = (0.94, 0.92, 0.87, 1); nt.links.new(rl.outputs['Image'], ov.inputs[2])
cp = nt.nodes.new('CompositorNodeComposite'); nt.links.new(ov.outputs[0], cp.inputs[0])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
def shoot(path, kind, res=(520, 520), target=(0, 0.02, 0.32), dist=3.4, yaw=45, elev=45, lens=85, ortho=1.22):
    sc.render.resolution_x, sc.render.resolution_y = res
    if kind == 'side': cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho; d = Vector((1, 0, 0.0))
    else:
        cam.data.type = 'PERSP'; cam.data.lens = lens; e, y = math.radians(elev), math.radians(yaw)
        d = Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    cam.location = Vector(target) + d * (dist if cam.data.type == 'PERSP' else 3.0)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cam.data.clip_end = 20
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

# ---------------------------------------------------------------- the wing props
def import_wing():
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/shadow-whelp-wing.glb')
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH'][0]
WINGS = {'L': import_wing(), 'R': import_wing()}
def place_wings(flap):
    pb = arm.pose.bones['body']; B = arm.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted()
    for tag, w in WINGS.items():
        s = 1 if tag == 'L' else -1
        Rf = Matrix.Rotation(math.radians(flap), 4, Vector((0, -s, 0)))   # + raises the tip on either side
        w.matrix_world = B @ Matrix.Translation(Vector(WM[tag]['model_blender'])) @ Rf @ Matrix.Diagonal((s, 1, 1, 1))
    bpy.context.view_layer.update()

# ---------------------------------------------------------------- poses
def R(gx=0.0, gy=0.0, gz=0.0): return Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
NEUTRAL = {'lidD_L': {'rx': -0.10}, 'lidD_R': {'rx': -0.10}, 'tail1': {'rx': -0.3}}
def set_pose(spec):
    full = {k: dict(v) for k, v in NEUTRAL.items()}
    for k, v in spec.items(): full[k] = dict(v)
    for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    for b, sp in full.items():
        t = sp.get('t', (0, 0, 0))
        arm.pose.bones[b].matrix_basis = Matrix.Translation(Vector((t[0], -t[2], t[1]))) @ R(sp.get('rx', 0), sp.get('ry', 0), sp.get('rz', 0))
    bpy.context.view_layer.update()
EARS_FWD = {'ear_L': {'rx': 0.4, 'rz': 0.2}, 'ear_R': {'rx': 0.4, 'rz': -0.2}}      # secondary(): x + 0.4 a, z +/- 0.2 a, a = +1
EARS_BACK = {'ear_L': {'rx': -0.4, 'rz': -0.2}, 'ear_R': {'rx': -0.4, 'rz': 0.2}}   # a = -1
FLY = {'root': {'rx': -0.26}, 'legFL': {'rx': -0.9}, 'legFR': {'rx': -0.9}, 'legBL': {'rx': 0.95}, 'legBR': {'rx': 0.95}}
POSES = [   # (name, label, spec, flap, must_be_zero)
    ('rest', 'REST', {}, 15, False),
    ('walk_a', 'WALK (legs 0.75, bob, roll)', {'legFL': {'rx': 0.75}, 'legBR': {'rx': 0.75}, 'legFR': {'rx': -0.75}, 'legBL': {'rx': -0.75},
                                               'body': {'rz': 0.04, 't': (0, 0.03, 0)}, 'head': {'rx': 0.05}}, 15, True),
    ('walk_b', 'WALK, other foot', {'legFL': {'rx': -0.75}, 'legBR': {'rx': -0.75}, 'legFR': {'rx': 0.75}, 'legBL': {'rx': 0.75},
                                    'body': {'rz': -0.04, 't': (0, 0.03, 0)}, 'head': {'rx': -0.05}}, 15, True),
    ('run', 'RUN (legs 0.75, pitch 0.03, bob, roll)', {'legFL': {'rx': 0.75}, 'legBR': {'rx': 0.75}, 'legFR': {'rx': -0.75}, 'legBL': {'rx': -0.75},
                                                      'body': {'rx': 0.03, 'rz': 0.04, 't': (0, 0.03, 0)}, 'head': {'rx': 0.05}}, 15, True),
    ('run_b', 'RUN, other foot', {'legFL': {'rx': -0.75}, 'legBR': {'rx': -0.75}, 'legFR': {'rx': 0.75}, 'legBL': {'rx': 0.75},
                                  'body': {'rx': -0.03, 'rz': -0.04, 't': (0, 0.03, 0)}, 'head': {'rx': -0.05}}, 15, True),
    ('gallop', 'GALLOP / SPRINT (legs 0.95, pitch 0.07)', {'legFL': {'rx': 0.95}, 'legBR': {'rx': 0.95}, 'legFR': {'rx': -0.95}, 'legBL': {'rx': -0.95},
                                                          'body': {'rx': 0.07, 'rz': 0.04, 't': (0, 0.03, 0)}, 'head': {'rx': 0.05}}, 15, False),
    ('gallop_b', 'GALLOP, other foot', {'legFL': {'rx': -0.95}, 'legBR': {'rx': -0.95}, 'legFR': {'rx': 0.95}, 'legBL': {'rx': 0.95},
                                        'body': {'rx': -0.07, 'rz': -0.04, 't': (0, 0.03, 0)}, 'head': {'rx': -0.05}}, 15, False),
    ('sit', 'SIT', {'body': {'rx': -0.5, 't': (0, -0.045, 0)}, 'legBL': {'rx': -1.45, 't': (0, -0.08, 0)},
                    'legBR': {'rx': -1.45, 't': (0, -0.08, 0)}, 'head': {'rx': 0.38}}, 15, False),
    ('bark', 'BARK (head up, jaw open, ear kick)', dict({'head': {'rx': -0.35}, 'body': {'rx': 0.15}, 'jaw': {'rx': 0.42}}, **EARS_FWD), 15, False),
    ('head_turn', 'IDLE HEAD TURN 0.25', {'head': {'ry': 0.25, 'rx': 0.03}}, 15, False),
    ('tail_L', 'TAIL WAG +0.7', {'tail1': {'rx': -0.3, 'ry': 0.7}}, 15, False),
    ('tail_R', 'TAIL WAG -0.7', {'tail1': {'rx': -0.3, 'ry': -0.7}}, 15, False),
    ('ears_fwd', 'EAR SPRING +1 (fwd)', EARS_FWD, 15, False),
    ('ears_back', 'EAR SPRING -1 (back)', EARS_BACK, 15, False),
    ('ears_fwd06', 'EAR SPRING +0.6', {'ear_L': {'rx': 0.24, 'rz': 0.12}, 'ear_R': {'rx': 0.24, 'rz': -0.12}}, 15, False),
    ('ears_back06', 'EAR SPRING -0.6', {'ear_L': {'rx': -0.24, 'rz': -0.12}, 'ear_R': {'rx': -0.24, 'rz': 0.12}}, 15, False),
    ('fly_m30', 'FLYING, flap -30', FLY, -30, True),
    ('fly_p30', 'FLYING, flap +30', FLY, 30, True),
    ('fly_p60', 'FLYING, flap +60', FLY, 60, True),
]

# ---------------------------------------------------------------- poke-through
FUR = {'Shadow_head': None, 'Shadow_body': None, 'Shadow_tail': None}
COST = ['Whelp_hood', 'Whelp_coat', 'Whelp_tail']
def chart_of(u, v):
    x, y = u * AW, v * AH
    for k, (cx, cy, w, h) in CH.items():
        if cx <= x < cx + w and cy <= y < cy + h: return k
    return None
EDGE_V = {'hood': 15 / 19, 'coat': 12 / 16, 'bib': 6 / 10, 'tail': 9.0}   # grid rows past the shell edge (build_shadow-whelp.py: NJ / rows)
SHELL, MAIN = {}, {}
for nm in COST:
    me = bpy.data.objects[nm].data; uvl = me.uv_layers.active.data
    SHELL[nm] = [k for k, p in enumerate(me.polygons) if chart_of(*uvl[p.loop_start].uv) in ('hood', 'coat', 'bib', 'tail')]
    def vloc(p):
        ch = chart_of(*uvl[p.loop_start].uv); x, y, w, h = CH[ch]
        return ch, max((uvl[li].uv[1] * AH - y - 4) / (h - 8) for li in p.loop_indices)
    MAIN[nm] = [k for k in SHELL[nm] if vloc(me.polygons[k])[1] <= EDGE_V[vloc(me.polygons[k])[0]] + 1e-6]   # (not the hem's roll and tuck)
CUFF = {nm: [k for k, p in enumerate(bpy.data.objects[nm].data.polygons) if chart_of(*bpy.data.objects[nm].data.uv_layers.active.data[p.loop_start].uv) == 'cuff'] for nm in ['Whelp_hood']}
mb = bpy.data.objects['Shadow_body'].data; uvb = mb.uv_layers.active.data
vchart = {}
for p in mb.polygons:
    for li in p.loop_indices:
        u, v = uvb[li].uv; vchart[mb.loops[li].vertex_index] = (u * 2048, v * AH)
def body_fur(i):
    x, y = vchart[i]
    return not ((1536 <= x < 2048) and (1792 <= y < 2048))       # not the collar or the gold (tag, ring) charts
FUR_IDX = {'Shadow_head': None, 'Shadow_body': np.array([i for i in range(len(mb.vertices)) if body_fur(i)]), 'Shadow_tail': None}
def evaluated(nm):
    o = bpy.data.objects[nm]; dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    V = np.array([tuple(e.matrix_world @ v.co) for v in m.vertices]); Nn = np.array([tuple((e.matrix_world.to_3x3() @ v.normal).normalized()) for v in m.vertices])
    F = [tuple(p.vertices) for p in m.polygons]; e.to_mesh_clear(); return V, Nn, F
def shell_bvh():
    V_all, F_all, F_main, off = [], [], [], 0
    for nm in COST:
        V, _, F = evaluated(nm); V_all += [Vector(p) for p in V]
        F_all += [tuple(i + off for i in F[k]) for k in SHELL[nm]]; F_main += [tuple(i + off for i in F[k]) for k in MAIN[nm]]; off += len(V)
    return BVHTree.FromPolygons(V_all, F_all), BVHTree.FromPolygons(V_all, F_main)
def fur_state(bvhs):
    bvh, main = bvhs
    st = {}
    for nm in FUR:
        V, Nn, _ = evaluated(nm); idx = FUR_IDX[nm] if FUR_IDX[nm] is not None else np.arange(len(V))
        fw = np.zeros(len(idx), bool); bw = np.zeros(len(idx), bool); depth = np.zeros(len(idx))
        for j, i in enumerate(idx):
            p = Vector(V[i]); n = Vector(Nn[i])
            hit = bvh.ray_cast(p + n * 0.0005, n, 0.035); fw[j] = hit[0] is not None
            if not fw[j]:
                hb = main.ray_cast(p - n * 0.0002, -n, 0.030)                               # through the shell itself
                if hb[0] is not None: bw[j] = True; depth[j] = hb[3]
        st[nm] = (idx, fw, bw, depth)
    return st
def ear_piping_overlaps():
    Vh, _, Fh = evaluated('Whelp_hood'); ct = BVHTree.FromPolygons([Vector(p) for p in Vh], [Fh[k] for k in CUFF['Whelp_hood']])
    n = 0
    for e in ('Shadow_ear_L', 'Shadow_ear_R'):
        V, _, F = evaluated(e); et = BVHTree.FromPolygons([Vector(p) for p in V], F); n += len(et.overlap(ct))
    return n
set_pose({}); place_wings(15)
REST = fur_state(shell_bvh()); rest_ear = ear_piping_overlaps()
covered = {nm: REST[nm][1] for nm in FUR}
results = {'method': __doc__.split('Poke-through')[1].split('Writes')[0].strip(), 'covered_fur_vertices_at_rest': {nm: int(c.sum()) for nm, c in covered.items()},
           'ear_piping_triangle_overlaps_at_rest': rest_ear, 'poses': {}}
tiles = []
for name, label, spec, flap, must in POSES:
    if ONLY and name not in ONLY: continue
    set_pose(spec); place_wings(flap)
    st = fur_state(shell_bvh()); per = {}
    for nm in FUR:
        idx, fw, bw, depth = st[nm]; poke = covered[nm] & (~fw) & bw
        per[nm] = int(poke.sum())
        if poke.any(): per[nm + '_depth_max_mm'] = round(float(depth[poke].max()) * 1000, 2)
        if poke.any():
            V, _, _ = evaluated(nm); P_ = V[idx[poke]]; per[nm + '_where'] = [round(float(c), 3) for c in P_.mean(0)]
            per[nm + '_idx'] = [int(i) for i in idx[poke][:12]]
    tot = sum(v for k, v in per.items() if not k.endswith(('_where', '_idx', '_mm')))
    results['poses'][name] = {'label': label, 'flap_deg': flap, 'fur_through_costume': tot, 'by_mesh': per,
                              'ear_piping_triangle_overlaps': ear_piping_overlaps(), 'must_be_zero': must}
    print('POSE', name, tot, json.dumps(per), flush=True)
    if RENDER:
        tgt = (0, 0.09, 0.40) if name.startswith('fly') else (0, 0.09, 0.33)          # (wide enough for the wings and the long tail)
        shoot(os.path.join(OUT, name + '_game.png'), 'game', target=tgt)
        shoot(os.path.join(OUT, name + '_side.png'), 'side', target=tgt)
        tiles.append((name, label, tot))
results['must_be_zero_ok'] = all(r['fur_through_costume'] == 0 for r in results['poses'].values() if r['must_be_zero'])
json.dump(results, open(os.path.join(T, 'pose-check.json'), 'w'), indent=1)
print('POSE_CHECK', json.dumps({k: v['fur_through_costume'] for k, v in results['poses'].items()}), 'must_be_zero_ok', results['must_be_zero_ok'], flush=True)
set_pose({}); place_wings(15)
if RENDER and tiles:
    ims = []
    for name, label, tot in tiles:
        for s in ('game', 'side'):
            im = bpy.data.images.load(os.path.join(OUT, '%s_%s.png' % (name, s))); a = np.empty(im.size[0] * im.size[1] * 4, np.float32)
            im.pixels.foreach_get(a); ims.append((a.reshape(im.size[1], im.size[0], 4), label + ('' if s == 'game' else ' (side)'), tot))
    h, w = ims[0][0].shape[:2]; cols = 6; rows = (len(ims) + cols - 1) // cols
    canvas = np.ones((rows * h, cols * w, 4), np.float32)
    for k, (a, _, _) in enumerate(ims):
        r, c = k // cols, k % cols; y0 = (rows - 1 - r) * h; canvas[y0:y0 + h, c * w:(c + 1) * w] = a
    img = bpy.data.images.new('poses', cols * w, rows * h); img.pixels.foreach_set(canvas.ravel())
    img.filepath_raw = os.path.join(T, 'preview', 'poses_raw.png'); img.file_format = 'PNG'; img.save()
    json.dump([[lab, tot] for _, lab, tot in ims], open(os.path.join(OUT, 'labels.json'), 'w'))
print('POSES_DONE', flush=True)
