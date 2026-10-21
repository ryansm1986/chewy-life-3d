"""Pose, face, toon and crop test sheets for stella-toy_rig.blend, posed exactly as the game drives the joints.

    blender --background --factory-startup --python rig_tests.py -- [--only poses|face|toon|crops] [--squint U,D]

Game rotation (gx, gy, gz) on a joint = Blender matrix_basis Rx(gx) @ Rz(gy) @ Ry(-gz) about world-aligned bone axes (three.js
XYZ); the lips translate by smile * (0, +7 mm up, 4 mm back) in game space = Blender (0, +0.004, +0.007) * smile.
The parasol (public/models/stella-parasol.glb) rides in the right paw at prop_mount.rig.json for the cast, and on the chest mount
for the carry.
Writes preview/poses.png (game +45 | front per pose), preview/poses-other.png (game -45 | side), preview/face.png
(front | game +45 | game -45 | 3/4 per face state + closed-eye crops), preview/toon-check.png and preview/crops.png.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview'); SCR = os.path.join(ROOT, 'scratch')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = argv[argv.index('--only') + 1] if '--only' in argv else None
SQ = tuple(float(v) for v in argv[argv.index('--squint') + 1].split(',')) if '--squint' in argv else (.488, -.24)
bpy.ops.wm.open_mainfile(filepath=os.environ.get('RIG_BLEND', os.path.join(ROOT, 'stella-toy_rig.blend')))
sc = bpy.context.scene
arm = bpy.data.objects['Stella_Rig']; arm.data.pose_position = 'POSE'
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
for args in (('key', (-2.2, 1.9, 1.0), 175, (1, .92, .86)), ('fill', (2.4, -.4, .6), 85, (.88, .92, 1)), ('rim', (.8, 2.6, -2.8), 120, (1, .88, .76))):
    light(*args)
PB = arm.pose.bones
_RJ = json.load(open(os.path.join(ROOT, 'joints-rig.json')))
LID_HINGE = {t: Vector(_RJ.get('lid_hinge_blender', {'L': [1, 0, 0], 'R': [1, 0, 0]})[t]) for t in 'LR'}   # Blender (cos t, +/- sin t, 0) = game (cos t, 0, -/+ sin t): the game's lidTilt hinge
# ---- the parasol
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/stella-parasol.glb')
PARA = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
for o in PARA: o.hide_render = True
PMJ = json.load(open(os.path.join(ROOT, 'prop_mount.rig.json')))['parasol']
def game_to_bl(v): return Vector((v[0], -v[2], v[1]))
C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))           # game -> Blender for vectors
def qmat(q): return Quaternion((q[3], q[0], q[1], q[2])).to_matrix()
def place_parasol(mode):
    for o in PARA: o.hide_render = mode is None
    if mode is None: return
    if mode in ('cast', 'upright', 'carry'):
        m = PMJ['in_right_paw']; hb = PB['hand_R']; Mh = arm.matrix_world @ hb.matrix @ arm.data.bones['hand_R'].matrix_local.inverted()
        pos = Mh @ (Vector(arm.data.bones['hand_R'].head_local) + game_to_bl(m['position_in_bone_frame']))
        q = PMJ['carry_over_shoulder']['in_hand_R']['quaternion_xyzw'] if mode == 'carry' else m['cast_quaternion_xyzw' if mode == 'cast' else 'upright_quaternion_xyzw']
        Rm = Mh.to_3x3() @ (C @ qmat(q) @ C.inverted())
    else:
        m = PMJ['carry_over_shoulder']['or_on_chest']; cb = PB['chest']; Mc = arm.matrix_world @ cb.matrix @ arm.data.bones['chest'].matrix_local.inverted()
        pos = Mc @ (Vector(arm.data.bones['chest'].head_local) + game_to_bl(m['position_in_bone_frame']))
        Rm = Mc.to_3x3() @ (C @ qmat(m['quaternion_xyzw']) @ C.inverted())
    for o in PARA: o.matrix_world = Matrix.Translation(pos) @ Rm.to_4x4()
    bpy.context.view_layer.update()
NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
def pose(ch, smile=.4):
    for b in PB: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    arm.location = (0, 0, 0)
    for name, v in ch.items():
        if name in ('root_y', 'smile', 'parasol'): continue
        gx, gy, gz = v
        if name.startswith('lid'): PB[name].matrix_basis = Matrix.Rotation(gx, 4, LID_HINGE[name[-1]]); continue   # the game's lidTilt hinge
        PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    if 'root_y' in ch: arm.location = (0, 0, ch['root_y'])
    smile = ch.get('smile', smile)
    for t in 'LR': PB['lip_' + t].location = (0, .004 * smile, .007 * smile)
    bpy.context.view_layer.update()
    place_parasol(ch.get('parasol'))
POSES = [  # key, label, bone -> game (x, y, z); neutral arms / lids added unless rest
    ('rest', 'REST (ALL BONES AT REST)', {}, False),
    ('walk-a', 'WALK EXTREME A (THIGHS +-0.8, ARMS -+0.6)', {'thigh_L': (.8, 0, 0), 'thigh_R': (-.8, 0, 0), 'upperarm_L': (-.6, 0, .12), 'upperarm_R': (.6, 0, -.12), 'spine': (.1, 0, .05)}, True),
    ('walk-b', 'WALK EXTREME B', {'thigh_L': (-.8, 0, 0), 'thigh_R': (.8, 0, 0), 'upperarm_L': (.6, 0, .12), 'upperarm_R': (-.6, 0, -.12), 'spine': (.1, 0, -.05)}, True),
    ('run', 'RUN (THIGHS +-1.0, LEAN 0.3)', {'thigh_L': (1.0, 0, 0), 'thigh_R': (-1.0, 0, 0), 'upperarm_L': (-.95, 0, .24), 'upperarm_R': (.95, 0, -.24), 'spine': (.3, 0, 0)}, True),
    ('run-b', 'RUN B', {'thigh_L': (-1.0, 0, 0), 'thigh_R': (1.0, 0, 0), 'upperarm_L': (.95, 0, .24), 'upperarm_R': (-.95, 0, -.24), 'spine': (.3, 0, 0)}, True),
    ('raised', 'ARMS RAISED Z +-1.3', {'upperarm_L': (0, 0, 1.3), 'upperarm_R': (0, 0, -1.3)}, True),
    ('cast', 'CAST (RIGHT UPPER ARM -2.4 X, PARASOL)', {'upperarm_R': (-2.4, 0, -.12), 'parasol': 'cast'}, True),
    ('carry', 'CARRY (PARASOL OVER THE SHOULDER)', {'upperarm_R': (-.55, 0, -.10), 'forearm_R': (-1.0, 0, 0), 'thigh_L': (.4, 0, 0), 'thigh_R': (-.4, 0, 0), 'parasol': 'carry'}, True),
    ('head', 'HEAD TURNED +0.45 Y, NODDED +0.3 X', {'head': (.3, .45, 0)}, True),
    ('lean', 'SPINE LEAN +-0.35 X, TWIST 0.4 Y', {'spine': (.35, .4, 0)}, True),
    ('ears-up', 'EAR TIPS -1.05, EARS -0.35 X', {'earTip_L': (-1.05, 0, 0), 'earTip_R': (-1.05, 0, 0), 'ear_L': (-.35, 0, 0), 'ear_R': (-.35, 0, 0)}, True),
    ('ears-down', 'EAR TIPS +0.6, EARS +0.35 X', {'earTip_L': (.6, 0, 0), 'earTip_R': (.6, 0, 0), 'ear_L': (.35, 0, 0), 'ear_R': (.35, 0, 0)}, True),
    ('ears-z', 'EARS Z +-0.3 (OUT)', {'ear_L': (0, 0, .3), 'ear_R': (0, 0, -.3)}, True),
    ('tail-l', 'TAIL WAG -0.7', {'tail1': (0, -.7, 0)}, True),
    ('tail-r', 'TAIL WAG +0.7 (DROOP -0.3)', {'tail1': (-.3, .7, 0)}, True),
]
HAPPY = {'lidU_L': (SQ[0], 0, 0), 'lidU_R': (SQ[0], 0, 0), 'lidD_L': (SQ[1], 0, 0), 'lidD_R': (SQ[1], 0, 0), 'smile': 1.0}
FACES = [('rest', 'REST (LIDD -0.1)', {}), ('blink', 'BLINK (LIDU 1.22)', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}),
         ('happy', 'HAPPY (LIDU %.3f, LIDD %.2f, SMILE)' % SQ, dict(HAPPY)),
         ('jaw', 'JAW 0.42', {'jaw': (.42, 0, 0)}),
         ('jaw-happy', 'JAW 0.42 + HAPPY + SMILE', {'jaw': (.42, 0, 0), **HAPPY})]
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
        t = Vector((0, 0, .66))
        aim(t + game_dir(45) * 7.0, t, lens=135); pa.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + Vector((0, -1, .06)).normalized() * 8, t, ortho=1.75); pa.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + game_dir(-45) * 7.0, t, lens=135); pb.append(shot(tmp(k), 380, 420)); k += 1
        aim(t + Vector((1, 0, .06)).normalized() * 8, t, ortho=1.75); pb.append(shot(tmp(k), 380, 420)); k += 1
    montage(pa, 6, os.path.join(OUT, 'poses.png')); montage(pb, 6, os.path.join(OUT, 'poses-other.png'))
    ORDER['poses'] = [label for key, label, ch, n in POSES]
if only in (None, 'face'):
    paths = []; k = 500
    HCt = Vector((0, -.05, .93))
    for key, label, ch in FACES:
        c = dict(NEUTRAL); c.update(ch); pose(c)
        aim(HCt + Vector((0, -1, 0)) * 4, HCt, ortho=.80); paths.append(shot(tmp(k), 360, 360)); k += 1
        for yaw in (45, -45):
            gt = Vector((0, -.12, .90)); aim(gt + game_dir(yaw) * 4, gt, ortho=.95); paths.append(shot(tmp(k), 360, 360)); k += 1
        aim(HCt + Vector((.64, -.77, 0)) * 4, HCt, ortho=.80); paths.append(shot(tmp(k), 360, 360)); k += 1
    for amt in (.6, .9):                                   # mid-blink (the game turns the lids about the tilted hinges)
        c = dict(NEUTRAL); c.update({'lidU_L': (amt, 0, 0), 'lidU_R': (amt, 0, 0)}); pose(c)
        for yaw in (45, -45):
            gt = Vector((0, -.12, .93)); aim(gt + game_dir(yaw) * 4, gt, ortho=.70); paths.append(shot(tmp(k), 360, 360)); k += 1
    c = dict(NEUTRAL); c.update({'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}); pose(c)
    eL = arm.data.bones['eye_L'].head_local
    for sx in (-1, 1):
        E = Vector((sx * abs(eL.x), eL.y - .04, eL.z)); aim(E + Vector((0, -1, 0)) * 3, E, ortho=.22); paths.append(shot(tmp(k), 360, 360)); k += 1
    from bpy_extras.object_utils import world_to_camera_view
    for yaw in (45, -45):
        t = Vector((0, 0, .66)); aim(t + game_dir(yaw, math.degrees(.62)) * 30, t, ortho=160 / 90); src = shot(tmp(k), 160, 160); k += 1
        im = bpy.data.images.load(src); w, h = im.size; a_ = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a_); a_ = a_.reshape(h, w, 4)
        pe_ = world_to_camera_view(sc, cam, Vector((0, -.26, .93))); cx = int(round(pe_.x * w)); cy = int(round(pe_.y * h))
        cx = min(max(cx, 30), w - 30); cy = min(max(cy, 30), h - 30); crop = a_[cy - 30:cy + 30, cx - 30:cx + 30]
        big = np.repeat(np.repeat(crop, 6, 0), 6, 1); img = bpy.data.images.new('gs_%d' % k, 360, 360); img.pixels.foreach_set(big.ravel())
        dst = tmp(k); img.filepath_raw = dst; img.file_format = 'PNG'; img.save(); paths.append(dst); k += 1; os.remove(src)
    montage(paths, 4, os.path.join(OUT, 'face.png')); ORDER['face'] = [label for key, label, ch in FACES] + ['MID-BLINK: LIDU 0.6 game +45, -45 | LIDU 0.9 game +45, -45'] + ['CLOSED EYE CROPS: R front, L front, game camera +45 / -45 at the game zoom (6x nearest)']
def toon_materials(L):
    img = next(n.image for m in bpy.data.materials if m.use_nodes and m.name.startswith('Stella_toy') for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
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
        if o.type == 'MESH' and o not in PARA:
            for s in o.material_slots: s.material = m
if only in (None, 'crops'):
    paths = []; k = 700
    c = dict(NEUTRAL); pose(c)
    eL = arm.data.bones['eye_L'].head_local
    for sx in (1, -1):
        E = Vector((sx * abs(eL.x), eL.y - .03, eL.z))
        for yaw in (45, -45): aim(E + game_dir(yaw) * 3, E, ortho=.20); paths.append(shot(tmp(k), 360, 360)); k += 1
    lipL = arm.data.bones['lip_L'].head_local
    for sm_ in (0.4, 1.0):
        c = dict(NEUTRAL); c.update({'jaw': (.42, 0, 0)}); pose(c, smile=sm_)
        for sx in (1, -1):
            Mo = Vector((sx * .05, lipL.y, lipL.z - .02)); aim(Mo + Vector((sx * .5, -.85, .15)).normalized() * 3, Mo, ortho=.20); paths.append(shot(tmp(k), 360, 360)); k += 1
    for ch in ({'upperarm_L': (0, 0, 1.3), 'upperarm_R': (0, 0, -1.3)}, {'upperarm_R': (-2.4, 0, -.12), 'earTip_L': (.6, 0, 0), 'earTip_R': (.6, 0, 0)}):
        c = dict(NEUTRAL); c.update(ch); pose(c)
        for yaw in (45, -45):
            t = Vector((0, -.02, .78)); aim(t + game_dir(yaw) * 4, t, ortho=.95); paths.append(shot(tmp(k), 360, 360)); k += 1
    montage(paths, 4, os.path.join(OUT, 'crops.png'))
    ORDER['crops'] = ['eye L +45', 'eye L -45', 'eye R +45', 'eye R -45', 'mouth L jaw .42', 'mouth R jaw .42', 'mouth L jaw .42 smile', 'mouth R jaw .42 smile',
                      'arms raised +45', 'arms raised -45', 'cast + ear tips +0.6, +45', 'same -45']
if only in (None, 'toon'):
    rows = [('rest', {}, 34), ('blink', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}, 34), ('blink', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}, -34),
            ('happy', dict(HAPPY), -34)]
    paths = []; k = 900
    for name, ch, az in rows:
        e = math.radians(50); a = math.radians(az)
        toon_materials((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        c = dict(NEUTRAL); c.update(ch); pose(c)
        HCt = Vector((0, -.05, .92))
        for yaw in (0.0, 0.6, -0.6):
            d = Vector((math.sin(yaw), -math.cos(yaw), .08)).normalized()
            aim(HCt + d * 4, HCt, ortho=.82); paths.append(shot(tmp(k), 420, 420)); k += 1
        t = Vector((0, -.02, .66)); aim(t + Vector((math.sin(.6 if az > 0 else -.6), -math.cos(.6), .25)).normalized() * 6, t, ortho=1.60)
        paths.append(shot(tmp(k), 420, 420)); k += 1
    montage(paths, 4, os.path.join(OUT, 'toon-check.png')); ORDER['toon'] = [r[0] + ' az %+d' % r[2] for r in rows]
json.dump(ORDER, open(os.path.join(SCR, 'rig_tests_order_%s.json' % (only or 'all')), 'w'), indent=1)
print('RIG_TESTS_DONE', only)
