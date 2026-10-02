"""Pose and face test sheets for rosie-opus_rig.blend, posed exactly as the game drives the joints.

    blender --background --factory-startup --python rig_tests.py -- [--only poses|face]

Game rotation (gx, gy, gz) on a joint = Blender pose Euler 'YZX' (gx, -gz, gy) about world-aligned bone axes; the lips
translate by smile * (0, +7 mm up, 4 mm back) in game space = Blender (0, +0.004, +0.007) * smile.
Writes preview/poses.png (45-degree game camera | front, per pose) and preview/face.png (front | game +45 | game -45 | 3/4).
"""
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = argv[argv.index('--only') + 1] if '--only' in argv else None
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'rosie-opus_rig.blend'))
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 32
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
def montage(paths, cols, out, labels=None):
    ims = [bpy.data.images.load(p) for p in paths]; w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
    canvas = np.ones((rows * h, cols * w, 4), np.float32)
    for k, im in enumerate(ims):
        a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); a = a.reshape(h, w, 4)
        r, c = k // cols, k % cols; y0 = (rows - 1 - r) * h; canvas[y0:y0 + h, c * w:(c + 1) * w] = a
    img = bpy.data.images.new('m_' + os.path.basename(out), cols * w, rows * h); img.pixels.foreach_set(canvas.ravel())
    img.filepath_raw = out; img.file_format = 'PNG'; img.save()
    for p in paths: os.remove(p)

POSES = [
    ('rest', lambda: neutral()),
    ('walk', lambda: (neutral(), game_rot('thigh_L', gx=.62), game_rot('thigh_R', gx=-.62), game_rot('upperarm_L', gx=-.55, gz=.12), game_rot('upperarm_R', gx=.55, gz=-.12))),
    ('run', lambda: (neutral(), game_rot('thigh_L', gx=1.0), game_rot('thigh_R', gx=-1.0), game_rot('spine', gx=.26), game_rot('upperarm_L', gx=-.95, gz=.24), game_rot('upperarm_R', gx=.95, gz=-.24))),
    ('arms raised', lambda: (neutral(), game_rot('upperarm_L', gz=1.4), game_rot('upperarm_R', gz=-1.4))),
    ('arms in (spin)', lambda: (neutral(), game_rot('upperarm_R', gz=1.4 - .12, gx=-.2), game_rot('upperarm_L', gz=-1.4 + .12))),
    ('wave', lambda: (neutral(1.0), game_rot('upperarm_R', gz=2.5 - .12, gx=-.3), game_rot('upperarm_L', gz=.12), game_rot('head', gz=.12))),
    ('head turn + nod', lambda: (neutral(), game_rot('head', gx=.3, gy=.45))),
    ('happy hop', lambda: (face_state(.488, -.24, 0, 1.0), game_rot('upperarm_R', gz=2.4 - .12, gx=-.2), game_rot('upperarm_L', gz=-2.4 + .12, gx=-.2))),
]
FACES = [('rest', dict()), ('blink', dict(lidU=1.22)), ('happy', dict(lidU=.488, lidD=-.24, smile=1.0)), ('talk 0.15', dict(jaw=.15)),
         ('jaw 0.42', dict(jaw=.42)), ('jaw 0.42 + happy + lips', dict(lidU=.488, lidD=-.24, jaw=.42, smile=1.0))]
if only in (None, 'poses'):
    paths = []
    for name, fn in POSES:
        reset(); fn()
        t = Vector((0, 0, .66))
        aim(t + game_dir(45) * 5.6, t, lens=135); paths.append(shot(os.path.join(OUT, '_p_%s_g.png' % name.replace(' ', '_')), 380, 420))
        aim(t + Vector((0, -1, .06)).normalized() * 8, t, ortho=1.45); paths.append(shot(os.path.join(OUT, '_p_%s_f.png' % name.replace(' ', '_')), 380, 420))
    montage(paths, 4, os.path.join(OUT, 'poses.png'))
if only in (None, 'face'):
    paths = []
    HCt = Vector((0, -.06, .965))
    for name, kw in FACES:
        reset(); face_state(**kw)
        aim(HCt + Vector((0, -1, 0)) * 4, HCt, ortho=.62); paths.append(shot(os.path.join(OUT, '_f_%s_0.png' % len(paths)), 360, 360))
        for yaw in (45, -45):
            g = Vector((0, -.14, .83)); aim(g + game_dir(yaw) * 4, g, ortho=.60); paths.append(shot(os.path.join(OUT, '_f_%s_1.png' % len(paths)), 360, 360))
        aim(HCt + Vector((.64, -.77, 0)) * 4, HCt, ortho=.62); paths.append(shot(os.path.join(OUT, '_f_%s_3.png' % len(paths)), 360, 360))
    montage(paths, 4, os.path.join(OUT, 'face.png'))
if only == 'rest':         # every bone at rest, round-3 framings (portrait, head front / 3/4) -> scratch/rest_*.png
    reset(); sc.eevee.taa_render_samples = 48; bpy.data.lights['rim'].size = 2.5
    aim(Vector((1.52, -2.75, 1.42)), Vector((0, -.045, .97)), ortho=.78); shot(os.path.join(ROOT, 'scratch', 'rest_portrait.png'), 1100, 1100)
    HC = Vector((0, -.02, .99))
    for n, d in (('front', (0, -1, 0)), ('34', (.64, -.77, 0))):
        aim(HC + Vector(d).normalized() * 4, HC, ortho=.80); shot(os.path.join(ROOT, 'scratch', 'rest_head_%s.png' % n), 1000, 1000)
if only == 'posediag':     # diagnostics: side views of the legs / skirt, sleeves and collar close-ups -> scratch/posediag.png
    paths = []; byname = dict(POSES)
    for name in ('walk', 'run', 'run', 'wave', 'happy hop', 'head turn + nod', 'arms raised', 'arms in (spin)'):
        reset(); byname[name]()
        k = len(paths)
        if name in ('walk', 'run') and k < 4:
            t = Vector((0, 0, .36)); d = (1, 0, 0) if k == 0 else ((1, 0, 0) if k == 2 else (.5, -.86, 0))
            if k == 3: d = (-1, 0, 0)
            aim(t + Vector(d).normalized() * 4, t, ortho=.62)
        elif name == 'head turn + nod':
            t = Vector((0, -.08, .70)); aim(t + Vector((.6, -.8, -.15)).normalized() * 4, t, ortho=.40)
        else:
            t = Vector((0, 0, .66)); aim(t + Vector((.35, -1, .45)).normalized() * 4, t, ortho=.78)
        paths.append(shot(os.path.join(ROOT, 'scratch', '_pd%d.png' % k), 400, 400))
    montage(paths, 4, os.path.join(ROOT, 'scratch', 'posediag.png'))
if only == 'shoulder':     # diagnostics: the right shoulder at the arm poses, front and from above-front
    paths = []; byname = dict(POSES)
    for name in ('rest', 'arms raised', 'arms in (spin)', 'wave', 'happy hop', 'run'):
        reset(); byname[name]()
        t = Vector((-.20, -.02, .64))
        aim(t + Vector((0, -1, .05)).normalized() * 4, t, ortho=.30); paths.append(shot(os.path.join(ROOT, 'scratch', '_sh%d.png' % len(paths)), 360, 360))
        aim(t + Vector((-.3, -.6, .75)).normalized() * 4, t, ortho=.30); paths.append(shot(os.path.join(ROOT, 'scratch', '_sh%d.png' % len(paths)), 360, 360))
    montage(paths, 4, os.path.join(ROOT, 'scratch', 'shoulder.png'))
def toon_materials(L):
    """the game's toon response, unlit (emission), from the interpolated shading normal exactly as the game sees it:
    shade = 0.75 * hard band (N.L >= 0.12) + 0.25 * half-Lambert; colour = atlas * (0.38 + 0.62 * shade)"""
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
        if o.type == 'MESH':
            for s in o.material_slots: s.material = m
    return m
if only == 'toon':         # preview/toon-check.png: hard-ramp toon light, sun 50 deg up from either side, yaw 0 / +-0.6
    sc.view_settings.view_transform = 'Standard'
    rows = [('rest', dict(), 82), ('rest', dict(), -82), ('blink', dict(lidU=1.22), 82), ('happy', dict(lidU=.488, lidD=-.24, smile=1.0), -82)]
    paths = []
    for name, kw, az in rows:
        e = math.radians(50); a = math.radians(az)
        Lv = (math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))
        toon_materials(Lv); reset(); face_state(**kw)
        HCt = Vector((0, -.06, .935))
        for yaw in (0.0, 0.6, -0.6):
            d = Vector((math.sin(yaw), -math.cos(yaw), .08)).normalized()
            aim(HCt + d * 4, HCt, ortho=.55); paths.append(shot(os.path.join(ROOT, 'scratch', '_t%d.png' % len(paths)), 420, 420))
        t = Vector((0, -.02, .70)); aim(t + Vector((math.sin(.6 if az > 0 else -.6), -math.cos(.6), .25)).normalized() * 6, t, ortho=.95)
        paths.append(shot(os.path.join(ROOT, 'scratch', '_t%d.png' % len(paths)), 420, 420))
    montage(paths, 4, os.path.join(OUT, 'toon-check.png'))
if only == 'closeup':      # diagnostics: the left eye and the mouth, big (written to scratch/)
    paths = []; E = Vector((.140, -.20, .90)); Mo = Vector((0, -.25, .795))
    for name, kw in FACES:
        reset(); face_state(**kw)
        aim(E + Vector((0, -1, 0)) * 4, E, ortho=.235); paths.append(shot(os.path.join(ROOT, 'scratch', '_c%d.png' % len(paths)), 420, 420))
        aim(E + game_dir(-45) * 4, E, ortho=.235); paths.append(shot(os.path.join(ROOT, 'scratch', '_c%d.png' % len(paths)), 420, 420))
        aim(Mo + Vector((0, -1, 0)) * 4, Mo, ortho=.19); paths.append(shot(os.path.join(ROOT, 'scratch', '_c%d.png' % len(paths)), 420, 420))
        aim(Mo + Vector((.64, -.77, 0)) * 4, Mo, ortho=.19); paths.append(shot(os.path.join(ROOT, 'scratch', '_c%d.png' % len(paths)), 420, 420))
    montage(paths, 4, os.path.join(ROOT, 'scratch', 'closeup.png'))
reset()
print('RIG_TESTS_DONE')
