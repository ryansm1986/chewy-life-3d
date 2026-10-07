"""Pose, face, toon and crop test sheets for golden-toy_rig.blend, posed exactly as the game drives the joints.

    blender --background --factory-startup --python rig_tests.py -- [--only poses|face|toon|crops]

Game rotation (gx, gy, gz) on a joint = Blender matrix_basis Rx(gx) @ Rz(gy) @ Ry(-gz) about world-aligned bone axes (three.js
XYZ); the lips translate by smile * (0, +7 mm up, 4 mm back) in game space = Blender (0, +0.004, +0.007) * smile.
Writes preview/poses.png (game +45 | front per pose), preview/poses-other.png (game -45 | side), preview/face.png
(front | game +45 | game -45 | 3/4 per face state, then closed-eye crops), preview/toon-check.png and preview/crops.png.
The lance and javelin props are shown in the paws for the weapon poses (positioned from export/prop_mount.json).
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview'); SCR = os.path.join(ROOT, 'scratch')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = argv[argv.index('--only') + 1] if '--only' in argv else None
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'golden-toy_rig.blend'))
sc = bpy.context.scene
arm = bpy.data.objects['Golden_Rig']; arm.data.pose_position = 'POSE'
sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 20
except Exception: pass
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.film_transparent = True
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.60, .55, .50, 1)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
sc.use_nodes = True; nt = sc.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); ov = nt.nodes.new('CompositorNodeAlphaOver'); ov.inputs[1].default_value = (.93, .90, .86, 1)
nt.links.new(rl.outputs['Image'], ov.inputs[2]); cp = nt.nodes.new('CompositorNodeComposite'); nt.links.new(ov.outputs[0], cp.inputs[0])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.clip_start = .05; cam.data.clip_end = 60
def light(name, rel, power, color):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = 3.0; d.color = color
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel
    o.rotation_euler = (Vector((0, 0, -3.2)) - Vector(rel)).to_track_quat('-Z', 'Y').to_euler()
for args in (('key', (-2.2, 1.9, 1.0), 175, (1, .92, .86)), ('fill', (2.4, -.4, .6), 85, (.88, .92, 1)), ('rim', (.8, 2.6, -2.8), 120, (1, .88, .76))):
    light(*args)
PB = arm.pose.bones
# the props, parented to the right hand at the palm (shaft along the grip axis from export/prop_mount.json)
MOUNT = json.load(open(os.path.join(ROOT, 'export', 'prop_mount.json')))
def load_prop(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); new = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
    return new[0]
PROPS = {}
for key, path in (('lance', 'D:/projects/chewy-life-3d/public/models/golden-lance.glb'), ('javelin', 'D:/projects/chewy-life-3d/public/models/golden-javelin.glb')):
    o = load_prop(path); o.hide_render = True; PROPS[key] = o
def b3(g): return Vector((g[0], -g[2], g[1]))           # game -> Blender
def place_prop(key, aim_to_left=False):
    o = PROPS[key]; o.hide_render = False
    pr = MOUNT['palms']['R']; hand = PB['hand_R']
    M = arm.matrix_world @ hand.matrix                  # the posed hand bone
    palm = M @ (arm.data.bones['hand_R'].matrix_local.inverted() @ b3(pr['palm_centre_game']))
    if aim_to_left:
        pl = MOUNT['palms']['L']; ML = arm.matrix_world @ PB['hand_L'].matrix
        palmL = ML @ (arm.data.bones['hand_L'].matrix_local.inverted() @ b3(pl['palm_centre_game'])); ax = (palmL - palm).normalized()
    else:
        ax = (M.to_3x3() @ (arm.data.bones['hand_R'].matrix_local.to_3x3().inverted() @ b3(pr['grip_axis_game']))).normalized()
        ax = -ax if key == 'javelin' else ax
    q = Vector((0, 0, 1)).rotation_difference(ax)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q; o.location = palm
def hide_props():
    for o in PROPS.values(): o.hide_render = True
NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
def pose(ch, smile=.4):
    for b in PB: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    arm.location = (0, 0, 0)
    for name, v in ch.items():
        if name == 'root_y': arm.location = (0, 0, v); continue
        if name in ('smile', 'prop'): smile = v if name == 'smile' else smile; continue
        gx, gy, gz = v
        PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    for t in 'LR': PB['lip_' + t].location = (0, .004 * smile, .007 * smile)
    bpy.context.view_layer.update()
    hide_props()
    if ch.get('prop') == 'lance2': place_prop('lance', aim_to_left=True)
    elif ch.get('prop'): place_prop(ch['prop'])
    bpy.context.view_layer.update()
SQ = (.488, -.24)      # the game's own happy squint (no per-model override)
POSES = [  # key, label, bone -> game (x, y, z); 'root_y': drop (m); neutral arms / lids added unless rest
    ('rest', 'REST (ALL BONES AT REST)', {}, False),
    ('walk-game', 'WALK, GAME AMPLITUDE 0.62', {'thigh_L': (.62, 0, 0), 'thigh_R': (-.62, 0, 0), 'upperarm_L': (-.55, 0, .12), 'upperarm_R': (.55, 0, -.12), 'spine': (.1, 0, .05)}, True),
    ('walk-a', 'WALK EXTREME A (0.8)', {'thigh_L': (.8, 0, 0), 'thigh_R': (-.8, 0, 0), 'upperarm_L': (-.6, 0, .12), 'upperarm_R': (.6, 0, -.12), 'spine': (.1, 0, .05)}, True),
    ('walk-b', 'WALK EXTREME B (0.8)', {'thigh_L': (-.8, 0, 0), 'thigh_R': (.8, 0, 0), 'upperarm_L': (.6, 0, .12), 'upperarm_R': (-.6, 0, -.12), 'spine': (.1, 0, -.05)}, True),
    ('run', 'RUN (LEGS +-0.97, LEAN 0.26)', {'thigh_L': (.97, 0, 0), 'thigh_R': (-.97, 0, 0), 'upperarm_L': (-.95, 0, .24), 'upperarm_R': (.95, 0, -.24), 'spine': (.26, 0, 0)}, True),
    ('run-b', 'RUN B', {'thigh_L': (-.97, 0, 0), 'thigh_R': (.97, 0, 0), 'upperarm_L': (.95, 0, .24), 'upperarm_R': (-.95, 0, -.24), 'spine': (.26, 0, 0)}, True),
    ('thrust', 'TWO-HANDED LANCE THRUST (BOTH ARMS FORWARD)', {'upperarm_R': (-1.45, 0, .30), 'upperarm_L': (-1.30, 0, -.40), 'forearm_R': (-.20, 0, 0), 'forearm_L': (-.35, 0, 0), 'spine': (.15, -.25, 0), 'thigh_L': (-.45, 0, 0), 'thigh_R': (.35, 0, 0), 'prop': 'lance2'}, True),
    ('dive', 'LEAPING DIVE (ARMS DOWN, LEGS TUCKED)', {'upperarm_R': (-.75, 0, -.65), 'upperarm_L': (-.75, 0, .65), 'thigh_L': (-1.0, 0, 0), 'thigh_R': (-1.0, 0, 0), 'shin_L': (1.4, 0, 0), 'shin_R': (1.4, 0, 0), 'spine': (.30, 0, 0), 'head': (-.15, 0, 0), 'prop': 'lance'}, True),
    ('throw', 'JAVELIN THROW (RIGHT ARM BACK AND UP)', {'upperarm_R': (-2.7, 0, -.45), 'forearm_R': (-.4, 0, 0), 'upperarm_L': (-.9, 0, .25), 'spine': (-.10, .45, 0), 'prop': 'javelin'}, True),
    ('raised', 'ARMS RAISED Z +-1.3', {'upperarm_L': (0, 0, 1.3), 'upperarm_R': (0, 0, -1.3)}, True),
    ('attack', 'ATTACK (RIGHT UPPER ARM -2.4 X)', {'upperarm_R': (-2.4, 0, -.12)}, True),
    ('head', 'HEAD TURNED +0.45 Y, NODDED +0.3 X', {'head': (.3, .45, 0)}, True),
    ('ears-up', 'EAR TIPS -1.05, EARS -0.35', {'earTip_L': (-1.05, 0, 0), 'earTip_R': (-1.05, 0, 0), 'ear_L': (-.35, 0, 0), 'ear_R': (-.35, 0, 0)}, True),
    ('ears-down', 'EAR TIPS +0.6, EARS +0.35', {'earTip_L': (.6, 0, 0), 'earTip_R': (.6, 0, 0), 'ear_L': (.35, 0, 0), 'ear_R': (.35, 0, 0)}, True),
    ('tail-l', 'TAIL WAG -0.7', {'tail1': (0, -.7, 0)}, True),
    ('tail-r', 'TAIL WAG +0.7 (DROOP -0.3)', {'tail1': (-.3, .7, 0)}, True),
    ('roll', 'ROLL CROUCH', {'spine': (.9, 0, 0), 'upperarm_L': (-1.2, 0, .12), 'upperarm_R': (-1.2, 0, -.12), 'thigh_L': (-1.2, 0, 0), 'thigh_R': (-1.2, 0, 0)}, True),
    ('sit', 'SIT (LEGS -1.4, DROP 0.12)', {'thigh_L': (-1.4, 0, 0), 'thigh_R': (-1.4, 0, 0), 'root_y': -.12}, True),
]
FACES = [('rest', 'REST (LIDD -0.1)', {}), ('blink', 'BLINK (LIDU 1.22)', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}),
         ('happy', 'HAPPY (LIDU 0.488, LIDD -0.24, SMILE)', {'lidU_L': (SQ[0], 0, 0), 'lidU_R': (SQ[0], 0, 0), 'lidD_L': (SQ[1], 0, 0), 'lidD_R': (SQ[1], 0, 0), 'smile': 1.0}),
         ('jaw', 'JAW 0.42', {'jaw': (.42, 0, 0)}),
         ('jaw-happy', 'JAW 0.42 + HAPPY + SMILE', {'jaw': (.42, 0, 0), 'lidU_L': (SQ[0], 0, 0), 'lidU_R': (SQ[0], 0, 0), 'lidD_L': (SQ[1], 0, 0), 'lidD_R': (SQ[1], 0, 0), 'smile': 1.0})]
def aim(loc, target, ortho=None, lens=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
def shot(path, rx, ry):
    sc.render.resolution_x = rx; sc.render.resolution_y = ry; sc.render.resolution_percentage = 100
    sc.render.filepath = path; bpy.context.view_layer.update(); bpy.ops.render.render(write_still=True); return path
def game_dir(yaw_deg, elev_deg=45):
    e = math.radians(elev_deg); y = math.radians(yaw_deg)
    return Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
def montage(paths, cols, out):
    ims = [bpy.data.images.load(p) for p in paths]; w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
    canvas = np.ones((rows * h, cols * w, 4), np.float32)
    for k, im in enumerate(ims):
        a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); a = a.reshape(h, w, 4)
        r, c = k // cols, k % cols; y0 = (rows - 1 - r) * h; canvas[y0:y0 + h, c * w:(c + 1) * w] = a
    img = bpy.data.images.new('m_' + os.path.basename(out), cols * w, rows * h); img.pixels.foreach_set(canvas.ravel())
    img.filepath_raw = out; img.file_format = 'PNG'; img.save()
    for p in paths: os.remove(p)
def tmp(k): return os.path.join(SCR, '_rt_%03d.png' % k)
ORDER = {}
if only in (None, 'poses'):
    pa = []; pb = []; k = 0
    for key, label, ch, neutral in POSES:
        c = dict(NEUTRAL) if neutral else {}; c.update(ch); pose(c)
        t = Vector((0, 0, .72 + (c.get('root_y', 0) if isinstance(c.get('root_y', 0), float) else 0)))
        aim(t + game_dir(45) * 7.2, t, lens=135); pa.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + Vector((0, -1, .06)).normalized() * 8, t, ortho=1.95); pa.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + game_dir(-45) * 7.2, t, lens=135); pb.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + Vector((1, 0, .06)).normalized() * 8, t, ortho=1.95); pb.append(shot(tmp(k), 380, 420)); k += 1
    montage(pa, 6, os.path.join(OUT, 'poses.png')); montage(pb, 6, os.path.join(OUT, 'poses-other.png'))
    ORDER['poses'] = [label for key, label, ch, n in POSES]
if only in (None, 'face'):
    paths = []; k = 500
    HCt = Vector((0, -.05, .94))
    for key, label, ch in FACES:
        c = dict(NEUTRAL); c.update(ch); pose(c)
        aim(HCt + Vector((0, -1, 0)) * 4, HCt, ortho=.80); paths.append(shot(tmp(k), 360, 360)); k += 1
        for yaw in (45, -45):
            gt = Vector((0, -.12, .92)); aim(gt + game_dir(yaw) * 4, gt, ortho=1.00); paths.append(shot(tmp(k), 360, 360)); k += 1
        aim(HCt + Vector((-.64, -.77, 0)) * 4, HCt, ortho=.80); paths.append(shot(tmp(k), 360, 360)); k += 1
    # closed-eye crops: both eyes at portrait scale (front), then the game camera at the game's pixel density, 6x nearest
    c = dict(NEUTRAL); c.update({'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}); pose(c)
    for sx in (-1, 1):
        E = Vector((sx * .157, -.28, 1.0)); aim(E + Vector((0, -1, 0)) * 3, E, ortho=.30); paths.append(shot(tmp(k), 360, 360)); k += 1
    for yaw in (45, -45):
        t = Vector((0, 0, .72)); aim(t + game_dir(yaw, math.degrees(.62)) * 30, t, ortho=160 / 90); src = shot(tmp(k), 160, 160); k += 1
        im = bpy.data.images.load(src); w, h = im.size; a_ = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a_); a_ = a_.reshape(h, w, 4)
        from bpy_extras.object_utils import world_to_camera_view
        pe_ = world_to_camera_view(sc, cam, Vector((0, -.26, 1.0))); cx = int(round(pe_.x * w)); cy = int(round(pe_.y * h))
        cx = min(max(cx, 30), w - 30); cy = min(max(cy, 30), h - 30); crop = a_[cy - 30:cy + 30, cx - 30:cx + 30]
        big = np.repeat(np.repeat(crop, 6, 0), 6, 1); img = bpy.data.images.new('gs_%d' % k, 360, 360); img.pixels.foreach_set(big.ravel())
        dst = tmp(k); img.filepath_raw = dst; img.file_format = 'PNG'; img.save(); paths.append(dst); k += 1; os.remove(src)
    montage(paths, 4, os.path.join(OUT, 'face.png')); ORDER['face'] = [label for key, label, ch in FACES] + ['CLOSED EYE CROPS: R front, L front, game camera yaw +45 / -45 (pitch 0.62, ~90 px/m), 6x nearest']
def toon_materials(L):
    img = next(n.image for m in bpy.data.materials if m.use_nodes and m.name.startswith('Golden_toy') for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    m = bpy.data.materials.new('toon_check'); m.use_nodes = True; nt_ = m.node_tree; nt_.nodes.clear(); N = nt_.nodes.new; Lk = nt_.links.new
    tx = N('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
    geo = N('ShaderNodeNewGeometry'); lv = N('ShaderNodeCombineXYZ'); lv.inputs[0].default_value, lv.inputs[1].default_value, lv.inputs[2].default_value = L
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; Lk(geo.outputs['Normal'], dot.inputs[0]); Lk(lv.outputs[0], dot.inputs[1])
    band = N('ShaderNodeMapRange'); band.interpolation_type = 'SMOOTHSTEP'; Lk(dot.outputs['Value'], band.inputs['Value'])
    band.inputs['From Min'].default_value = -.04; band.inputs['From Max'].default_value = .34
    sh = N('ShaderNodeMath'); sh.operation = 'MULTIPLY_ADD'; Lk(dot.outputs['Value'], sh.inputs[0]); sh.inputs[1].default_value = .5; sh.inputs[2].default_value = .5
    hl = N('ShaderNodeMath'); hl.operation = 'MULTIPLY'; Lk(sh.outputs[0], hl.inputs[0]); hl.inputs[1].default_value = .25
    mx = N('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'; Lk(band.outputs['Result'], mx.inputs[0]); mx.inputs[1].default_value = .75; Lk(hl.outputs[0], mx.inputs[2])
    lit = N('ShaderNodeMath'); lit.operation = 'MULTIPLY_ADD'; Lk(mx.outputs[0], lit.inputs[0]); lit.inputs[1].default_value = .62; lit.inputs[2].default_value = .38
    col = N('ShaderNodeMixRGB'); col.blend_type = 'MULTIPLY'; col.inputs['Fac'].default_value = 1
    Lk(tx.outputs['Color'], col.inputs['Color1']); Lk(lit.outputs[0], col.inputs['Color2'])
    em = N('ShaderNodeEmission'); Lk(col.outputs['Color'], em.inputs['Color'])
    out = N('ShaderNodeOutputMaterial'); Lk(em.outputs[0], out.inputs['Surface'])
    for o in sc.objects:
        if o.type == 'MESH' and o.name not in [p.name for p in PROPS.values()]:
            for s in o.material_slots: s.material = m
if only in (None, 'crops'):
    paths = []; k = 700
    c = dict(NEUTRAL); pose(c)
    for t_, sx in (('L', 1), ('R', -1)):
        E = Vector((sx * .157, -.28, 1.0))
        for yaw in (45, -45): aim(E + game_dir(yaw) * 3, E, ortho=.26); paths.append(shot(tmp(k), 360, 360)); k += 1
    for sm_ in (0.4, 1.0):
        c = dict(NEUTRAL); c.update({'jaw': (.42, 0, 0)}); pose(c, smile=sm_)
        for sx in (1, -1):
            Mo = Vector((sx * .13, -.30, .82)); aim(Mo + Vector((sx * .5, -.85, .15)).normalized() * 3, Mo, ortho=.26); paths.append(shot(tmp(k), 360, 360)); k += 1
    for tip in (-1.05, .6):
        c = dict(NEUTRAL); c.update({'earTip_L': (tip, 0, 0), 'ear_L': (.35 if tip > 0 else -.35, 0, 0)}); pose(c)
        Ec = Vector((.33, .02, .88))
        aim(Ec + Vector((.75, -.66, .25)).normalized() * 3, Ec, ortho=.70); paths.append(shot(tmp(k), 360, 360)); k += 1
        aim(Ec + game_dir(45) * 3, Ec, ortho=.70); paths.append(shot(tmp(k), 360, 360)); k += 1
    montage(paths, 4, os.path.join(OUT, 'crops.png'))
    ORDER['crops'] = ['eye L +45', 'eye L -45', 'eye R +45', 'eye R -45', 'mouth L jaw .42', 'mouth R jaw .42', 'mouth L jaw .42 smile', 'mouth R jaw .42 smile',
                      'ear L tip -1.05 ear -.35 side', 'ear L tip -1.05 game', 'ear L tip +0.6 ear +.35 side', 'ear L tip +0.6 game']
if only in (None, 'toon'):
    rows = [('rest', {}, 34), ('blink', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}, 34), ('blink', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}, -34),
            ('happy', {'lidU_L': (SQ[0], 0, 0), 'lidU_R': (SQ[0], 0, 0), 'lidD_L': (SQ[1], 0, 0), 'lidD_R': (SQ[1], 0, 0), 'smile': 1.0}, -34)]
    paths = []; k = 900
    for name, ch, az in rows:
        e = math.radians(50); a = math.radians(az)
        toon_materials((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        c = dict(NEUTRAL); c.update(ch); pose(c)
        HCt = Vector((0, -.05, .95))
        for yaw in (0.0, 0.6, -0.6):
            d = Vector((math.sin(yaw), -math.cos(yaw), .08)).normalized()
            aim(HCt + d * 4, HCt, ortho=1.10); paths.append(shot(tmp(k), 420, 420)); k += 1
        t = Vector((0, -.02, .72)); aim(t + Vector((math.sin(.6 if az > 0 else -.6), -math.cos(.6), .25)).normalized() * 6, t, ortho=1.75)
        paths.append(shot(tmp(k), 420, 420)); k += 1
    montage(paths, 4, os.path.join(OUT, 'toon-check.png')); ORDER['toon'] = [r[0] + ' az %+d' % r[2] for r in rows]
json.dump(ORDER, open(os.path.join(SCR, 'rig_tests_order_%s.json' % (only or 'all')), 'w'), indent=1)
print('RIG_TESTS_DONE', only)
