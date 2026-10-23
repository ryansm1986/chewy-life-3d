"""Pose, face, toon and crop test sheets for usagi-toy_rig.blend (final metres, ear tips 1.10 m), posed exactly as the game drives the joints.

    blender --background --factory-startup --python rig_tests.py -- [--only poses|face|toon|crops]

Game rotation (gx, gy, gz) on a joint = Blender matrix_basis Rx(gx) @ Rz(gy) @ Ry(-gz) about world-aligned bone axes (three.js
XYZ); the lips translate by smile * (0, +7 mm up, 4 mm back) in game space = Blender (0, +0.004, +0.007) * smile.
Writes preview/poses.png (game +45 | front per pose), preview/poses-other.png (game -45 | side), preview/face.png
(front | game +45 | game -45 | 3/4 per face state), preview/toon-check.png and preview/crops.png.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview'); SCR = os.path.join(ROOT, 'scratch')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = argv[argv.index('--only') + 1] if '--only' in argv else None
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'usagi-toy_rig.blend'))
RJ = json.load(open(os.path.join(ROOT, 'joints-rig.json'))); BH = {b['name']: Vector(b['head_blender_m']) for b in RJ['bones']}
LID_TILT = RJ.get('lidTilt'); LID_HINGE = RJ.get('lid_hinge_blender', {})
sc = bpy.context.scene
arm = bpy.data.objects['Usagi_Rig']; arm.data.pose_position = 'POSE'
sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 24
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
for args in (('key', (-2.2, 1.9, 1.0), 140, (1, .92, .86)), ('fill', (2.4, -.4, .6), 68, (.88, .92, 1)), ('rim', (.8, 2.6, -2.8), 96, (1, .88, .76))):
    light(*args)
PB = arm.pose.bones
NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
def pose(ch, smile=.4):
    for b in PB: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    arm.location = (0, 0, 0)
    for name, v in ch.items():
        if name == 'root_y': arm.location = (0, 0, v); continue
        if name == 'smile': smile = v; continue
        gx, gy, gz = v
        if name[:4] in ('lidU', 'lidD') and LID_TILT:      # HERO_MODELS lidTilt: the lid turns about its eye's tilted hinge (animator.js lidTurn)
            PB[name].matrix_basis = Matrix.Rotation(gx, 4, Vector(LID_HINGE[name[-1]])); continue
        PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    for t in 'LR': PB['lip_' + t].location = (0, .004 * smile, .007 * smile)
    bpy.context.view_layer.update()
SQ = (.488, -.24)     # the game's default happy squint (0.4 x 1.22, -0.24); the lids are built for it
POSES = [  # key, label, bone -> game (x, y, z); 'root_y': drop (m); neutral arms / lids added unless rest (the shared villager brief's list)
    ('rest', 'REST (ALL BONES AT REST)', {}, False),
    ('walk', 'WALK (THIGHS +-0.62, ARMS -+0.55)', {'thigh_L': (.62, 0, 0), 'thigh_R': (-.62, 0, 0), 'upperarm_L': (-.55, 0, .12), 'upperarm_R': (.55, 0, -.12), 'spine': (.1, 0, .05)}, True),
    ('walk-b', 'WALK B', {'thigh_L': (-.62, 0, 0), 'thigh_R': (.62, 0, 0), 'upperarm_L': (.55, 0, .12), 'upperarm_R': (-.55, 0, -.12), 'spine': (.1, 0, -.05)}, True),
    ('run', 'RUN (THIGHS +-1.0, SPINE +0.26)', {'thigh_L': (1.0, 0, 0), 'thigh_R': (-1.0, 0, 0), 'upperarm_L': (-.95, 0, .24), 'upperarm_R': (.95, 0, -.24), 'spine': (.26, 0, 0)}, True),
    ('run-b', 'RUN B', {'thigh_L': (-1.0, 0, 0), 'thigh_R': (1.0, 0, 0), 'upperarm_L': (.95, 0, .24), 'upperarm_R': (-.95, 0, -.24), 'spine': (.26, 0, 0)}, True),
    ('raised', 'ARMS RAISED Z +-1.4', {'upperarm_L': (0, 0, 1.4), 'upperarm_R': (0, 0, -1.4)}, True),
    ('wave', 'WAVE (R ARM +2.5 Z -0.3 X, HEAD TILT 0.12)', {'upperarm_R': (-.3, 0, 2.5), 'head': (0, 0, .12)}, True),
    ('wave-out', 'WAVE OUTWARD (R ARM -2.5 Z -0.3 X)', {'upperarm_R': (-.3, 0, -2.5), 'head': (0, 0, .12)}, True),
    ('head', 'HEAD TURNED +0.45 Y, NODDED +0.3 X', {'head': (.3, .45, 0)}, True),
    ('lean', 'SPINE LEAN +0.35 X, TWIST +0.4 Y', {'spine': (.35, .4, 0)}, True),
    ('hop', 'HAPPY HOP (ARMS +-2.4 Z, -0.2 X)', {'upperarm_L': (-.2, 0, 2.4), 'upperarm_R': (-.2, 0, -2.4)}, True),
    ('ears-z', 'EARS +0.35 Z (L) / -0.35 Z (R), OUT', {'ear_L': (0, 0, .35), 'ear_R': (0, 0, -.35)}, True),
    ('ears-zin', 'EARS -0.35 Z (L) / +0.35 Z (R), IN', {'ear_L': (0, 0, -.35), 'ear_R': (0, 0, .35)}, True),
    ('ears-x', 'EARS +0.3 X (FORWARD)', {'ear_L': (.3, 0, 0), 'ear_R': (.3, 0, 0)}, True),
    ('ears-xb', 'EARS -0.3 X (BACK)', {'ear_L': (-.3, 0, 0), 'ear_R': (-.3, 0, 0)}, True),
    ('ears-flop', 'EARS +0.3 X + TIPS +0.5 X (FLOP)', {'ear_L': (.3, 0, .2), 'ear_R': (.3, 0, -.2), 'earTip_L': (.5, 0, 0), 'earTip_R': (.5, 0, 0)}, True),
    ('tail', 'TAIL WAG (TAIL1-4 +0.25 Y)', {'tail1': (0, .25, 0), 'tail2': (0, .25, 0), 'tail3': (0, .25, 0), 'tail4': (0, .25, 0)}, True),
    ('sit', 'SIT (LEGS -1.4, DROP 0.10)', {'thigh_L': (-1.4, 0, 0), 'thigh_R': (-1.4, 0, 0), 'root_y': -.10}, True),
]
FACES = [('rest', 'REST (LIDD -0.1)', {}), ('blink', 'BLINK (LIDU 1.22)', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}),
         ('happy', 'HAPPY (LIDU 0.488, LIDD -0.24, SMILE)', {'lidU_L': (SQ[0], 0, 0), 'lidU_R': (SQ[0], 0, 0), 'lidD_L': (SQ[1], 0, 0), 'lidD_R': (SQ[1], 0, 0), 'smile': 1.0}),
         ('talk', 'JAW 0.15 (TALK)', {'jaw': (.15, 0, 0)}),
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
def montage(paths, cols, out, labels=None):
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
        t = Vector((0, .04, .55 + (c.get('root_y', 0) if isinstance(c.get('root_y', 0), float) else 0)))
        aim(t + game_dir(45) * 6.0, t, lens=135); pa.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + Vector((0, -1, .06)).normalized() * 8, t, ortho=1.30); pa.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + game_dir(-45) * 6.0, t, lens=135); pb.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + Vector((1, 0, .06)).normalized() * 8, t, ortho=1.30); pb.append(shot(tmp(k), 380, 420)); k += 1
    montage(pa, 6, os.path.join(OUT, 'poses.png')); montage(pb, 6, os.path.join(OUT, 'poses-other.png'))
    ORDER['poses'] = [label for key, label, ch, n in POSES]
if only in (None, 'face'):
    paths = []; k = 500
    HCt = Vector((0, -.04, .62))
    for key, label, ch in FACES:
        c = dict(NEUTRAL); c.update(ch); pose(c)
        aim(HCt + Vector((0, -1, 0)) * 4, HCt, ortho=.62); paths.append(shot(tmp(k), 360, 360)); k += 1
        for yaw in (45, -45):
            gt = Vector((0, -.08, .64)); aim(gt + game_dir(yaw) * 4, gt, ortho=.80); paths.append(shot(tmp(k), 360, 360)); k += 1
        aim(HCt + Vector((.64, -.77, 0)) * 4, HCt, ortho=.62); paths.append(shot(tmp(k), 360, 360)); k += 1
    # closed-eye crops: both eyes at portrait scale (front), then the game camera at game pixel density (the hero ~165 px
    # tall, as in play), the head cropped and enlarged 4x with nearest-neighbour so the pixels read as they do in the game
    c = dict(NEUTRAL); c.update({'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}); pose(c)
    for sx in (-1, 1):
        E = BH['eye_L' if sx > 0 else 'eye_R'] + Vector((0, -.04, 0)); aim(E + Vector((0, -1, 0)) * 3, E, ortho=.20); paths.append(shot(tmp(k), 360, 360)); k += 1
    # the game's own camera (engine.js: fov 20, distance 34, pitch 0.62) at 1080p is ~90 px per metre: render at that density
    for yaw in (45, -45):
        t = Vector((0, .04, .55)); aim(t + game_dir(yaw, math.degrees(.62)) * 30, t, ortho=160 / 90); src = shot(tmp(k), 160, 160); k += 1
        im = bpy.data.images.load(src); w, h = im.size; a_ = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a_); a_ = a_.reshape(h, w, 4)
        from bpy_extras.object_utils import world_to_camera_view
        pe_ = world_to_camera_view(sc, cam, Vector((0, -.20, .62))); cx = int(round(pe_.x * w)); cy = int(round(pe_.y * h))
        cx = min(max(cx, 30), w - 30); cy = min(max(cy, 30), h - 30); crop = a_[cy - 30:cy + 30, cx - 30:cx + 30]
        big = np.repeat(np.repeat(crop, 6, 0), 6, 1); img = bpy.data.images.new('gs_%d' % k, 360, 360); img.pixels.foreach_set(big.ravel())
        dst = tmp(k); img.filepath_raw = dst; img.file_format = 'PNG'; img.save(); paths.append(dst); k += 1; os.remove(src)
    montage(paths, 4, os.path.join(OUT, 'face.png')); ORDER['face'] = [label for key, label, ch in FACES] + ['CLOSED EYE CROPS: R front, L front (portrait scale), game camera yaw +45 / -45 at the default game zoom (pitch 0.62, ~90 px/m at 1080p), 6x nearest']
def toon_materials(L):
    img = next(n.image for m in bpy.data.materials if m.use_nodes and m.name.startswith('Usagi_toy') for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    m = bpy.data.materials.new('toon_check'); m.use_nodes = True; nt_ = m.node_tree; nt_.nodes.clear(); N = nt_.nodes.new; Lk = nt_.links.new
    tx = N('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
    geo = N('ShaderNodeNewGeometry'); lv = N('ShaderNodeCombineXYZ'); lv.inputs[0].default_value, lv.inputs[1].default_value, lv.inputs[2].default_value = L
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; Lk(geo.outputs['Normal'], dot.inputs[0]); Lk(lv.outputs[0], dot.inputs[1])
    band = N('ShaderNodeMath'); band.operation = 'GREATER_THAN'; Lk(dot.outputs['Value'], band.inputs[0]); band.inputs[1].default_value = .12
    sh = N('ShaderNodeMath'); sh.operation = 'MULTIPLY_ADD'; Lk(dot.outputs['Value'], sh.inputs[0]); sh.inputs[1].default_value = .5; sh.inputs[2].default_value = .5
    hl = N('ShaderNodeMath'); hl.operation = 'MULTIPLY'; Lk(sh.outputs[0], hl.inputs[0]); hl.inputs[1].default_value = .25
    mx = N('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'; Lk(band.outputs[0], mx.inputs[0]); mx.inputs[1].default_value = .75; Lk(hl.outputs[0], mx.inputs[2])
    lit = N('ShaderNodeMath'); lit.operation = 'MULTIPLY_ADD'; Lk(mx.outputs[0], lit.inputs[0]); lit.inputs[1].default_value = .62; lit.inputs[2].default_value = .38
    col = N('ShaderNodeMixRGB'); col.blend_type = 'MULTIPLY'; col.inputs['Fac'].default_value = 1
    if os.environ.get('TOON_WHITE'): col.inputs['Color1'].default_value = (.8, .8, .8, 1)
    else: Lk(tx.outputs['Color'], col.inputs['Color1'])
    Lk(lit.outputs[0], col.inputs['Color2'])
    gam = N('ShaderNodeGamma'); gam.inputs['Gamma'].default_value = 1.0; Lk(col.outputs['Color'], gam.inputs['Color'])
    em = N('ShaderNodeEmission'); Lk(gam.outputs['Color'], em.inputs['Color'])
    out = N('ShaderNodeOutputMaterial'); Lk(em.outputs[0], out.inputs['Surface'])
    for o in sc.objects:
        if o.type == 'MESH':
            for s in o.material_slots: s.material = m
if only in (None, 'crops'):
    # close crops: both eyes at rest from both 45-degree cameras, both mouth corners at jaw 0.42 (with and without the smile),
    # the left ear under the mask at the ear-tip extremes
    paths = []; k = 700
    c = dict(NEUTRAL); pose(c)
    for t_, sx in (('L', 1), ('R', -1)):
        E = BH['eye_' + t_] + Vector((0, -.04, 0))
        for yaw in (45, -45): aim(E + game_dir(yaw) * 3, E, ortho=.18); paths.append(shot(tmp(k), 360, 360)); k += 1
    for sm_ in (0.4, 1.0):
        c = dict(NEUTRAL); c.update({'jaw': (.42, 0, 0)}); pose(c, smile=sm_)
        for sx in (1, -1):
            Mo = BH['lip_L' if sx > 0 else 'lip_R'] + Vector((-sx * .01, -.01, 0)); aim(Mo + Vector((sx * .5, -.85, .15)).normalized() * 3, Mo, ortho=.15); paths.append(shot(tmp(k), 360, 360)); k += 1
    for ea in ((0, 0, .35), (0, 0, -.35), (.3, 0, 0), (-.3, 0, 0)):
        c = dict(NEUTRAL); c.update({'ear_L': ea}); pose(c)
        Ec = BH['ear_L'] + Vector((0, 0, .03))
        aim(Ec + Vector((.75, -.66, .25)).normalized() * 3, Ec, ortho=.30); paths.append(shot(tmp(k), 360, 360)); k += 1
    montage(paths, 4, os.path.join(OUT, 'crops.png'))
    ORDER['crops'] = ['eye L +45', 'eye L -45', 'eye R +45', 'eye R -45', 'mouth L jaw .42', 'mouth R jaw .42', 'mouth L jaw .42 smile', 'mouth R jaw .42 smile',
                      'ear L +0.35 Z', 'ear L -0.35 Z', 'ear L +0.3 X', 'ear L -0.3 X']
if only in (None, 'toon'):
    rows = [('rest', {}, 34), ('rest', {}, -34), ('blink', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}, 34),
            ('happy', {'lidU_L': (SQ[0], 0, 0), 'lidU_R': (SQ[0], 0, 0), 'lidD_L': (SQ[1], 0, 0), 'lidD_R': (SQ[1], 0, 0), 'smile': 1.0}, -34)]
    paths = []; k = 900
    for name, ch, az in rows:
        e = math.radians(50); a = math.radians(az)
        toon_materials((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        c = dict(NEUTRAL); c.update(ch); pose(c)
        HCt = Vector((0, -.04, .62))
        for yaw in (0.0, 0.6, -0.6):
            d = Vector((math.sin(yaw), -math.cos(yaw), .08)).normalized()
            aim(HCt + d * 4, HCt, ortho=.62); paths.append(shot(tmp(k), 420, 420)); k += 1
        t = Vector((0, .04, .55)); aim(t + Vector((math.sin(.6 if az > 0 else -.6), -math.cos(.6), .25)).normalized() * 6, t, ortho=1.30)
        paths.append(shot(tmp(k), 420, 420)); k += 1
    montage(paths, 4, os.path.join(OUT if not os.environ.get('TOON_WHITE') else SCR, 'toon-check.png' if not os.environ.get('TOON_WHITE') else 'toon-white.png')); ORDER['toon'] = [r[0] + ' az %+d' % r[2] for r in rows]
json.dump(ORDER, open(os.path.join(SCR, 'rig_tests_order_%s.json' % (only or 'all')), 'w'), indent=1)
print('RIG_TESTS_DONE', only)
