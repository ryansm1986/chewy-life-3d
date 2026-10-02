"""Pose, face and toon test sheets for moka-toy_rig.blend, posed exactly as the game drives the joints.

    blender --background --factory-startup --python rig_tests.py -- [--only poses|face|toon|closeup|ears]

Game rotation (gx, gy, gz) on a joint = Blender pose Euler 'YZX' (gx, -gz, gy) about world-aligned bone axes; the lips
translate by smile * (0, +7 mm up, 4 mm back) in game space = Blender (0, +0.004, +0.007) * smile.
Writes preview/poses.png (45-degree game camera | front, per pose), preview/face.png (front | game +45 | game -45 | 3/4)
and preview/toon-check.png (hard two-tone ramp, sun 50 deg up, yaw 0 / +-0.6).
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview'); SCR = os.path.join(ROOT, 'scratch')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = argv[argv.index('--only') + 1] if '--only' in argv else None
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'moka-toy_rig.blend'))
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
RIG = json.load(open(os.path.join(ROOT, 'joints-rig.json')))
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
def reset():
    for b in PB: b.rotation_mode = 'YZX'; b.rotation_euler = (0, 0, 0); b.location = (0, 0, 0)
def game_rot(bone, gx=0., gy=0., gz=0.):
    e = PB[bone].rotation_euler; PB[bone].rotation_euler = (e.x + gx, e.y - gz, e.z + gy)
def neutral(smile=.4, lidD=-.10):
    for t in 'LR':
        game_rot('lidD_' + t, gx=lidD); PB['lip_' + t].location = (0, .004 * smile, .007 * smile)
SQ_T = float(os.environ.get('SQ_U', '.488'))
def face_state(lidU=0., lidD=-.10, jaw=0., smile=.4):
    for t in 'LR':
        game_rot('lidU_' + t, gx=lidU); game_rot('lidD_' + t, gx=lidD); PB['lip_' + t].location = (0, .004 * smile, .007 * smile)
    game_rot('jaw', gx=jaw)
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
# the staff test: a 1.1 m cylinder (r 0.018) along the grip axis through the right palm, riding on hand_R
g = RIG['staff_grip']['hand_R']; pc = Vector((g['palm_centre_game'][0], -g['palm_centre_game'][2], g['palm_centre_game'][1]))
bpy.ops.mesh.primitive_cylinder_add(radius=.018, depth=1.1, vertices=20, location=pc + Vector((0, 0, .55 - .34)))
staff = bpy.context.object; staff.name = 'test_staff'
sm_ = bpy.data.materials.new('staff_test'); sm_.use_nodes = True; sm_.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.85, .62, .32, 1)
staff.data.materials.append(sm_)
mw = staff.matrix_world.copy(); staff.parent = arm; staff.parent_type = 'BONE'; staff.parent_bone = 'hand_R'; staff.matrix_world = mw
staff.hide_render = True
def with_staff(fn):
    def f(): staff.hide_render = False; fn()
    return f
POSES = [
    ('rest', lambda: neutral()),
    ('walk', lambda: (neutral(), game_rot('thigh_L', gx=.62), game_rot('thigh_R', gx=-.62), game_rot('upperarm_L', gx=-.55), game_rot('upperarm_R', gx=.55))),
    ('run', lambda: (neutral(), game_rot('thigh_L', gx=.97), game_rot('thigh_R', gx=-.97), game_rot('spine', gx=.26), game_rot('upperarm_L', gx=-.95), game_rot('upperarm_R', gx=.95))),
    ('cast overhead', lambda: (neutral(), game_rot('upperarm_R', gx=-2.95), game_rot('upperarm_L', gx=-2.5))),
    ('staff thrust', with_staff(lambda: (neutral(), game_rot('upperarm_R', gx=-1.6)))),
    ('staff lift out', with_staff(lambda: (neutral(), game_rot('upperarm_R', gx=-1.35, gz=1.05)))),
    ('arms out', lambda: (neutral(), game_rot('upperarm_L', gz=1.35), game_rot('upperarm_R', gz=-1.35))),
    ('wave', lambda: (neutral(1.0), game_rot('upperarm_R', gz=2.5, gx=-.3))),
    ('happy hop', lambda: (face_state(SQ_T, -.24, 0, 1.0), game_rot('upperarm_R', gz=2.4, gx=-.2), game_rot('upperarm_L', gz=-2.4, gx=-.2))),
    ('head turn + nod', lambda: (neutral(), game_rot('head', gx=.3, gy=.45))),
    ('ears +', lambda: (neutral(), [game_rot('ear_' + t, gx=.35) for t in 'LR'], [game_rot('earTip_' + t, gx=.6) for t in 'LR'])),
    ('ears -', lambda: (neutral(), [game_rot('ear_' + t, gx=-.35) for t in 'LR'], [game_rot('earTip_' + t, gx=-.6) for t in 'LR'])),
    ('ears side', lambda: (neutral(), game_rot('ear_L', gz=.10), game_rot('ear_R', gz=-.10))),
    ('tail wag +', lambda: (neutral(), game_rot('tail1', gy=.7, gx=-.15))),
    ('tail wag -', lambda: (neutral(), game_rot('tail1', gy=-.7, gx=-.15))),
    ('staff grip (rest)', with_staff(lambda: neutral())),
]
FACES = [('rest', dict()), ('blink', dict(lidU=1.22)), ('happy', dict(lidU=SQ_T, lidD=-.24, smile=1.0)), ('talk 0.15', dict(jaw=.15)),
         ('jaw 0.42', dict(jaw=.42)), ('jaw 0.42 + happy + lips', dict(lidU=SQ_T, lidD=-.24, jaw=.42, smile=1.0))]
if only in (None, 'poses'):
    paths = []
    for name, fn in POSES:
        reset(); staff.hide_render = True; fn()
        t = Vector((0, 0, .70))
        aim(t + game_dir(45) * 6.2, t, lens=135); paths.append(shot(os.path.join(OUT, '_p_%02d_g.png' % len(paths)), 380, 420))
        aim(t + Vector((0, -1, .06)).normalized() * 8, t, ortho=1.55); paths.append(shot(os.path.join(OUT, '_p_%02d_f.png' % len(paths)), 380, 420))
    staff.hide_render = True
    montage(paths, 4, os.path.join(OUT, 'poses.png'))
    print('POSE_ORDER', [n for n, _ in POSES])
if only in (None, 'face'):
    paths = []
    HCt = Vector((0, -.05, .93))
    for name, kw in FACES:
        reset(); face_state(**kw)
        aim(HCt + Vector((0, -1, 0)) * 4, HCt, ortho=.56); paths.append(shot(os.path.join(OUT, '_f_%02d.png' % len(paths)), 360, 360))
        for yaw in (45, -45):
            gt = Vector((0, -.16, .80)); aim(gt + game_dir(yaw) * 4, gt, ortho=.72); paths.append(shot(os.path.join(OUT, '_f_%02d.png' % len(paths)), 360, 360))
        aim(HCt + Vector((.64, -.77, 0)) * 4, HCt, ortho=.56); paths.append(shot(os.path.join(OUT, '_f_%02d.png' % len(paths)), 360, 360))
    montage(paths, 4, os.path.join(OUT, 'face.png'))
def toon_materials(L):
    img = next(n.image for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    m = bpy.data.materials.new('toon_check'); m.use_nodes = True; nt_ = m.node_tree; nt_.nodes.clear(); N = nt_.nodes.new; Lk = nt_.links.new
    tx = N('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
    geo = N('ShaderNodeNewGeometry'); lv = N('ShaderNodeCombineXYZ'); lv.inputs[0].default_value, lv.inputs[1].default_value, lv.inputs[2].default_value = L
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; Lk(geo.outputs['Normal'], dot.inputs[0]); Lk(lv.outputs[0], dot.inputs[1])
    ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'; Lk(dot.outputs['Value'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.12; ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    sh = N('ShaderNodeMath'); sh.operation = 'MULTIPLY_ADD'; Lk(dot.outputs['Value'], sh.inputs[0]); sh.inputs[1].default_value = .5; sh.inputs[2].default_value = .5
    shc = N('ShaderNodeClamp'); Lk(sh.outputs[0], shc.inputs[0])
    bw = N('ShaderNodeRGBToBW'); Lk(ramp.outputs['Color'], bw.inputs[0])
    hl = N('ShaderNodeMath'); hl.operation = 'MULTIPLY'; Lk(shc.outputs[0], hl.inputs[0]); hl.inputs[1].default_value = .25
    mx = N('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'; Lk(bw.outputs[0], mx.inputs[0]); mx.inputs[1].default_value = .75; Lk(hl.outputs[0], mx.inputs[2])
    lit = N('ShaderNodeMath'); lit.operation = 'MULTIPLY_ADD'; Lk(mx.outputs[0], lit.inputs[0]); lit.inputs[1].default_value = .62; lit.inputs[2].default_value = .38
    col = N('ShaderNodeMixRGB'); col.blend_type = 'MULTIPLY'; col.inputs['Fac'].default_value = 1
    Lk(tx.outputs['Color'], col.inputs['Color1']); Lk(lit.outputs[0], col.inputs['Color2'])
    em = N('ShaderNodeEmission'); Lk(col.outputs['Color'], em.inputs['Color'])
    out = N('ShaderNodeOutputMaterial'); Lk(em.outputs[0], out.inputs['Surface'])
    for o in sc.objects:
        if o.type == 'MESH' and o.name != 'test_staff':
            for s in o.material_slots: s.material = m
    return m
if only == 'toon':
    rows = [('rest', dict(), 34), ('rest', dict(), -34), ('blink', dict(lidU=1.22), 34), ('happy', dict(lidU=SQ_T, lidD=-.24, smile=1.0), -34)]
    paths = []
    for name, kw, az in rows:
        e = math.radians(50); a = math.radians(az)
        Lv = (math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))
        toon_materials(Lv); reset(); face_state(**kw)
        HCt = Vector((0, -.05, .93))
        for yaw in (0.0, 0.6, -0.6):
            d = Vector((math.sin(yaw), -math.cos(yaw), .08)).normalized()
            aim(HCt + d * 4, HCt, ortho=.60); paths.append(shot(os.path.join(SCR, '_t%02d.png' % len(paths)), 420, 420))
        t = Vector((0, -.02, .70)); aim(t + Vector((math.sin(.6 if az > 0 else -.6), -math.cos(.6), .25)).normalized() * 6, t, ortho=1.50)
        paths.append(shot(os.path.join(SCR, '_t%02d.png' % len(paths)), 420, 420))
    montage(paths, 4, os.path.join(OUT, 'toon-check.png'))
if only == 'closeup':
    paths = []; E = Vector((.129, -.20, .912)); Mo = Vector((0, -.30, .77))
    for name, kw in FACES:
        reset(); face_state(**kw)
        aim(E + Vector((0, -1, 0)) * 4, E, ortho=.22); paths.append(shot(os.path.join(SCR, '_c%02d.png' % len(paths)), 400, 400))
        aim(E + game_dir(-45) * 4, E, ortho=.22); paths.append(shot(os.path.join(SCR, '_c%02d.png' % len(paths)), 400, 400))
        aim(Mo + Vector((0, -1, 0)) * 4, Mo, ortho=.18); paths.append(shot(os.path.join(SCR, '_c%02d.png' % len(paths)), 400, 400))
        aim(Mo + Vector((.64, -.77, 0)) * 4, Mo, ortho=.18); paths.append(shot(os.path.join(SCR, '_c%02d.png' % len(paths)), 400, 400))
    montage(paths, 4, os.path.join(SCR, 'closeup.png'))
if only == 'lidtoon':     # the left eye under the hard two-tone ramp (both light sides), and the lid coverage in red
    paths = []; E = Vector((.129, -.20, .912))
    red = bpy.data.materials.new('lid_red'); red.use_nodes = True; nt_ = red.node_tree; nt_.nodes.clear()
    em_ = nt_.nodes.new('ShaderNodeEmission'); em_.inputs['Color'].default_value = (1, 0, 0, 1); o_ = nt_.nodes.new('ShaderNodeOutputMaterial'); nt_.links.new(em_.outputs[0], o_.inputs['Surface'])
    for name, kw in [('rest', dict()), ('blink', dict(lidU=1.22)), ('happy', dict(lidU=SQ_T, lidD=-.24, smile=1.0))]:
        for az in (34, -34):
            e = math.radians(50); a = math.radians(az); toon_materials((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
            reset(); face_state(**kw)
            aim(E + Vector((0, -1, 0)) * 4, E, ortho=.24); paths.append(shot(os.path.join(SCR, '_l%02d.png' % len(paths)), 360, 360))
        aim(E + game_dir(-45) * 4, E, ortho=.24); paths.append(shot(os.path.join(SCR, '_l%02d.png' % len(paths)), 360, 360))
        for o in sc.objects:
            if o.name.startswith('Moka_lid'): o.material_slots[0].material = red
        aim(E + Vector((0, -1, 0)) * 4, E, ortho=.24); paths.append(shot(os.path.join(SCR, '_l%02d.png' % len(paths)), 360, 360))
    montage(paths, 4, os.path.join(SCR, 'lidtoon.png'))
if only == 'diag':        # close-ups: legs / robe from the side at walk and run, shoulders at the arm poses, ears, tail
    paths = []; byname = dict(POSES)
    plan = [('walk', (0, 0, .36), (1, 0, 0), .80), ('run', (0, 0, .36), (1, 0, 0), .80), ('run', (0, 0, .36), (0, -1, .2), .80),
            ('walk', (0, 0, .36), (0, 1, .2), .80),
            ('cast overhead', (0, 0, .80), (0, -1, .1), 1.2), ('cast overhead', (0, 0, .80), (1, 0, .1), 1.2), ('arms out', (0, 0, .70), (0, -1, .1), 1.1),
            ('wave', (0, 0, .80), (0, -1, .1), 1.1), ('happy hop', (0, 0, .80), (0, -1, .1), 1.1), ('staff thrust', (0, 0, .70), (1, -.4, .2), 1.3),
            ('ears +', (0, 0, .80), (1, 0, .05), .9), ('ears -', (0, 0, .80), (1, 0, .05), .9), ('ears +', (0, 0, .80), (0, -1, .05), .9),
            ('tail wag +', (0, .1, .35), (0, 1, .25), .6), ('tail wag -', (0, .1, .35), (.5, .8, .25), .6), ('staff grip (rest)', (-.28, -.04, .42), (-.4, -1, .2), .35)]
    for name, t, d, o in plan:
        reset(); staff.hide_render = True; byname[name]()
        t = Vector(t); aim(t + Vector(d).normalized() * 5, t, ortho=o); paths.append(shot(os.path.join(SCR, '_d%02d.png' % len(paths)), 420, 420))
    staff.hide_render = True
    montage(paths, 4, os.path.join(SCR, 'diag.png'))
reset()
print('RIG_TESTS_DONE')
