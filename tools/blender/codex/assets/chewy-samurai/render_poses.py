"""Pose and face tests on the ACTUAL hero_export binary, with the game's pivot-only skeleton (adapted from chewy-b's
render-rig-round15.py). Rotations are game Euler angles (x, y, z) about world axes at each bone head:
game X = Blender +X, game Y = Blender +Z, game Z = Blender -Y.

    blender --background --factory-startup --python render_poses.py -- [--only key,key] [--toon]

Writes preview/pose-<key>-<view>.png, face-<key>-<view>.png, crop-*.png, toon-*.png and pose-tests.json.
"""
import bpy, math, json, os, sys
import numpy as np
from mathutils import Vector, Matrix
T = os.path.dirname(os.path.abspath(__file__)); PRE = os.path.join(T, 'preview'); EXP = os.path.join(T, 'export')
_av = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--exp' in _av: EXP = _av[_av.index('--exp') + 1]
CULL = _av[_av.index('--cull') + 1] if '--cull' in _av else None     # render the back-face-culled check with this file prefix, then stop
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'chewy-samurai_rig.blend'))
scene = bpy.context.scene; arm = bpy.data.objects['Chewy_Rig']
mat = bpy.data.objects['Chewy_head'].data.materials[0]
for ob in list(scene.objects):
    if ob.type in ('MESH', 'LIGHT', 'CAMERA'): bpy.data.objects.remove(ob, do_unlink=True)
meta = json.load(open(os.path.join(EXP, 'chewy_samurai.json'))); raw = open(os.path.join(EXP, 'chewy_samurai.bin'), 'rb').read()
A = {v['name']: np.frombuffer(raw, dtype='<' + v['type'], count=v['count'], offset=v['offset']).reshape(-1, v['itemSize']) for v in meta['layout']}
pos = A['position'][:, [0, 2, 1]].copy(); pos[:, 1] *= -1
normal = A['normal'].astype(float)[:, [0, 2, 1]] / 32767; normal[:, 1] *= -1
idx = A['index'].ravel().reshape(-1, 3); uv = A['uv']
me = bpy.data.meshes.new('baked_hero'); me.from_pydata(pos.tolist(), [], idx.tolist()); me.update()
layer = me.uv_layers.new(name='Atlas')
for p in me.polygons:
    p.use_smooth = True
    for l in p.loop_indices: layer.data[l].uv = uv[me.loops[l].vertex_index]
me.normals_split_custom_set([normal[l.vertex_index] for l in me.loops]); me.materials.append(mat)
ob = bpy.data.objects.new('chewy_samurai_baked', me); scene.collection.objects.link(ob)
img = bpy.data.images.load(os.path.join(EXP, 'chewy_samurai.png')); img.pack()
for node in mat.node_tree.nodes:
    if node.type == 'TEX_IMAGE': node.image = img
groups = [ob.vertex_groups.new(name=b['name']) for b in meta['bones']]
for v in me.vertices:
    for i, w in zip(A['skinIndex'][v.index], A['skinWeight'][v.index]):
        if w: groups[int(i)].add([v.index], int(w) / 255, 'REPLACE')
mod = ob.modifiers.new('game_weights', 'ARMATURE'); mod.object = arm
ob.parent = arm; ob.matrix_parent_inverse = Matrix.Identity(4)
bpy.context.view_layer.objects.active = arm; arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
for b in meta['bones']:
    x, z, ny = b['pos']; bone = arm.data.edit_bones[b['name']]; bone.head = (x, -ny, z); bone.tail = Vector((x, -ny, z)) + Vector((0, .045, 0)); bone.roll = 0
bpy.ops.object.mode_set(mode='OBJECT'); arm.data.pose_position = 'POSE'; arm.hide_render = True
# lights and camera (the review rig of render_views.py, riding with the camera)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
def light(name, rel, power, size, color):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.parent = cam; o.location = rel
    o.rotation_euler = (Vector((0, 0, -3.2)) - Vector(rel)).to_track_quat('-Z', 'Y').to_euler()
light('key', (-2.2, 1.9, 1.0), 175, 3.0, (1, .92, .86)); light('fill', (2.4, -.4, .6), 85, 3.0, (.88, .92, 1)); light('rim', (.8, 2.6, -2.8), 120, 2.5, (1, .88, .76))
scene.world = bpy.data.worlds.new('w'); scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.60, .55, .50, 1); scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
scene.render.engine = 'BLENDER_EEVEE_NEXT'; scene.eevee.taa_render_samples = 32
scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
scene.render.film_transparent = True; scene.use_nodes = True; nt = scene.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); ov = nt.nodes.new('CompositorNodeAlphaOver'); ov.inputs[1].default_value = (.93, .90, .86, 1)
nt.links.new(rl.outputs['Image'], ov.inputs[2]); cp = nt.nodes.new('CompositorNodeComposite'); nt.links.new(ov.outputs[0], cp.inputs[0])

NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
def P(**k): return k
POSES = [  # key, label, bone -> game (x, y, z); 'root_y': game Y offset (m); neutral arms / lids added unless rest
    ('rest', 'REST (ALL BONES AT REST)', {}, False),
    ('walk-game', 'WALK, GAME AMPLITUDE 0.62', {'thigh_L': (.62, 0, 0), 'thigh_R': (-.62, 0, 0), 'upperarm_L': (-.55, 0, .12), 'upperarm_R': (.55, 0, -.12), 'spine': (.1, 0, .05)}, True),
    ('walk-a', 'WALK EXTREME A', {'thigh_L': (.8, 0, 0), 'thigh_R': (-.8, 0, 0), 'upperarm_L': (-.6, 0, .12), 'upperarm_R': (.6, 0, -.12), 'spine': (.1, 0, .05)}, True),
    ('walk-b', 'WALK EXTREME B', {'thigh_L': (-.8, 0, 0), 'thigh_R': (.8, 0, 0), 'upperarm_L': (.6, 0, .12), 'upperarm_R': (-.6, 0, -.12), 'spine': (.1, 0, -.05)}, True),
    ('run', 'RUN (LEGS +-0.97, LEAN 0.26)', {'thigh_L': (.97, 0, 0), 'thigh_R': (-.97, 0, 0), 'upperarm_L': (-.95, 0, .24), 'upperarm_R': (.95, 0, -.24), 'spine': (.26, 0, 0)}, True),
    ('swing1', 'ONE-HAND SWING (WIND-UP)', {'upperarm_R': (-2.5, 0, -.62), 'upperarm_L': (-.4, 0, .42), 'spine': (0, .55, 0)}, True),
    ('swing2', 'TWO-HAND SWING (SPLIT PEAK)', {'upperarm_R': (-2.45, 0, .43), 'forearm_R': (-.8, 0, .3), 'upperarm_L': (-2.35, 0, -.43), 'forearm_L': (-.8, 0, -.3),
                                              'spine': (-.24, 0, 0), 'head': (-.22, 0, 0), 'thigh_L': (-.55, 0, 0), 'thigh_R': (-.35, 0, 0)}, True),
    ('throw', 'BALL THROW (WIND-UP)', {'upperarm_R': (-2.9, 0, -.42), 'upperarm_L': (.9, 0, .12), 'spine': (-.1, .5, 0)}, True),
    ('wave', 'ARM RAISE TO THE HEAD (WAVE)', {'upperarm_R': (-.3, 0, 2.38), 'head': (0, 0, .12)}, True),
    ('cast', 'CAST (BOTH ARMS UP)', {'upperarm_R': (-2.6, 0, .18), 'upperarm_L': (-2.6, 0, -.18), 'head': (-.2, 0, 0)}, True),
    ('raised', 'ARMS RAISED Z +-1.3', {'upperarm_L': (0, 0, 1.42), 'upperarm_R': (0, 0, -1.42)}, True),
    ('bark', 'BARK (HEAD UP, JAW 0.42)', {'head': (-.35, 0, 0), 'jaw': (.42, 0, 0), 'spine': (.15, 0, 0), 'upperarm_R': (-.6, 0, .38), 'upperarm_L': (-.6, 0, -.38)}, True),
    ('howl', 'HOWL (MOON CRY)', {'head': (-.62, 0, 0), 'jaw': (.42, 0, 0), 'spine': (-.28, 0, 0), 'upperarm_R': (-2.6, 0, .13), 'forearm_R': (-.25, 0, 0),
                                 'upperarm_L': (-.7, 0, -.43), 'forearm_L': (-1.2, 0, 0)}, True),
    ('roll', 'ROLL CROUCH', {'spine': (.9, 0, 0), 'upperarm_L': (-1.0, 0, .12), 'upperarm_R': (-1.0, 0, -.12), 'thigh_L': (-1.0, 0, 0), 'thigh_R': (-1.0, 0, 0)}, True),
    ('sit', 'SIT (LEGS -1.4, DROP 0.12)', {'thigh_L': (-1.4, 0, 0), 'thigh_R': (-1.4, 0, 0), 'root_y': -.12}, True),
    ('tail-l', 'TAIL WAG -0.7', {'tail1': (0, -.7, 0)}, True),
    ('tail-idle', 'TAIL WAG -0.35 (IDLE)', {'tail1': (-.15, -.35, 0)}, True),
    ('tail-r', 'TAIL WAG +0.7 (DROOP -0.3)', {'tail1': (-.3, .7, 0)}, True),
]
FACE = [('rest', 'REST (LIDD -0.1)', {}), ('talk', 'TALK (JAW 0.2)', {'jaw': (.2, 0, 0)}), ('blink', 'BLINK (LIDU 1.22)', {'lidU_L': (1.22, 0, 0), 'lidU_R': (1.22, 0, 0)}),
        ('bark', 'BARK (JAW 0.42 + SMILE)', {'jaw': (.42, 0, 0), 'move:lip_L': (0, .004, .007), 'move:lip_R': (0, .004, .007)}),
        ('happy', 'HAPPY (LIDU 0.488, LIDD -0.24)', {'lidU_L': (.488, 0, 0), 'lidU_R': (.488, 0, 0), 'lidD_L': (-.24, 0, 0), 'lidD_R': (-.24, 0, 0), 'move:lip_L': (0, .004, .007), 'move:lip_R': (0, .004, .007)})]
def pose(changes, neutral=True):
    for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
    arm.location = (0, 0, 0)
    ch = dict(NEUTRAL) if neutral else {}
    ch.update(changes)
    for name, value in ch.items():
        if name == 'root_y': arm.location = (0, 0, value); continue
        if name.startswith('move:'): arm.pose.bones[name[5:]].location = Vector(value); continue
        gx, gy, gz = value
        arm.pose.bones[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    bpy.context.view_layer.update()
def shoot(name, direction, target, scale, res=600):
    if only and not any(name.startswith(o) for o in only): return
    d = Vector(direction).normalized(); t = Vector(target); cam.location = t + d * 6
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cam.data.type = 'ORTHO'; cam.data.ortho_scale = scale
    scene.render.resolution_x = scene.render.resolution_y = res; scene.render.filepath = os.path.join(PRE, name + '.png'); bpy.ops.render.render(write_still=True)
G = (.5, -.5, math.sqrt(.5)); GM = (-.5, -.5, math.sqrt(.5)); GB = (.5, .5, math.sqrt(.5))
if CULL:   # the game draws one-sided (three.js FrontSide): cull back faces in the render too
    mat.use_backface_culling = True
    try: mat.use_backface_culling_shadow = True
    except Exception: pass
    pose({})
    GBM = (-.5, .5, math.sqrt(.5))
    for nm, d, tgt, sc in (('back-p', GB, (0, .1, .5), .62), ('back-m', GBM, (0, .1, .5), .62), ('chest-p', G, (0, -.08, .55), .55),
                           ('chest-m', GM, (0, -.08, .55), .55), ('full-p', G, (0, 0, .64), 1.75), ('full-back', GB, (0, 0, .64), 1.75)):
        d_ = Vector(d).normalized(); cam.location = Vector(tgt) + d_ * 6; cam.rotation_euler = (-d_).to_track_quat('-Z', 'Y').to_euler()
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = sc; scene.render.resolution_x = scene.render.resolution_y = 600
        scene.render.filepath = os.path.join(PRE, CULL + '-' + nm + '.png'); bpy.ops.render.render(write_still=True)
    print('CULL_DONE', flush=True); raise SystemExit(0)
VIEWS = [('front', (0, -1, 0)), ('game', G), ('gameM', GM), ('back', (0, 1, .15))]
for key, label, changes, neutral in POSES:
    pose(changes, neutral)
    for view, d in VIEWS: shoot('pose-' + key + '-' + view, d, (0, 0, .64), 1.75)
for key, label, changes in FACE:
    pose(changes)
    for view, d in (('front', (0, -1, 0)), ('game', G)): shoot('face-' + key + '-' + view, d, (0, -.015, 1.0) if view == 'game' else (0, -.03, .96), .91, 700)
# close crops of the cloth at the hard poses
for key, tgt, d, sc in (('walk-a', (0, -.1, .30), (0, -1, 0), .55), ('walk-a', (.05, -.05, .32), G, .6), ('run', (0, -.1, .30), (0, -1, 0), .55),
                        ('swing1', (-.2, 0, .58), (-.6, -.6, .4), .55), ('swing2', (0, 0, .62), G, .7), ('raised', (.25, 0, .58), (0, -1, 0), .5),
                        ('raised', (-.25, 0, .58), (0, -1, 0), .5), ('wave', (-.2, 0, .62), GM, .55), ('cast', (0, 0, .62), (0, -1, .2), .7),
                        ('tail-l', (0, .2, .36), (0, 1, .2), .4), ('tail-r', (0, .2, .36), (0, 1, .2), .4), ('sit', (0, -.1, .3), G, .7),
                        ('roll', (0, -.05, .45), (.7, -.7, .2), .8), ('walk-b', (.25, 0, .32), (1, 0, .1), .55), ('run', (.25, 0, .32), (1, 0, .1), .55),
                        ('howl', (0, .1, .66), (0, 1, .4), .5), ('bark', (0, .1, .66), (0, 1, .4), .5)):
    pose(dict(next(p[2] for p in POSES if p[0] == key)))
    shoot('crop-' + key + '-' + '%.2f_%.2f' % (d[0], d[1]), d, tgt, sc, 520)
# toon check: a 3-band ramp on the painted colour, like the game's toon shading
if '--toon' in argv or not only:
    nt2 = mat.node_tree; bsdf = next(n for n in nt2.nodes if n.type == 'BSDF_PRINCIPLED'); tex = next(n for n in nt2.nodes if n.type == 'TEX_IMAGE')
    out = next(n for n in nt2.nodes if n.type == 'OUTPUT_MATERIAL')
    dif = nt2.nodes.new('ShaderNodeBsdfDiffuse'); s2r = nt2.nodes.new('ShaderNodeShaderToRGB'); ramp = nt2.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'; e = ramp.color_ramp.elements
    e[0].position = 0; e[0].color = (.42, .40, .52, 1); e[1].position = .18; e[1].color = (.72, .70, .78, 1); el = e.new(.45); el.color = (1, .97, .92, 1)
    mul = nt2.nodes.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
    em = nt2.nodes.new('ShaderNodeEmission')
    nt2.links.new(dif.outputs[0], s2r.inputs[0]); nt2.links.new(s2r.outputs[0], ramp.inputs[0])
    nt2.links.new(ramp.outputs[0], mul.inputs[1]); nt2.links.new(tex.outputs[0], mul.inputs[2]); nt2.links.new(mul.outputs[0], em.inputs[0])
    nt2.links.new(em.outputs[0], out.inputs[0])
    sun = bpy.data.objects.new('toon_sun', bpy.data.lights.new('toon_sun', 'SUN')); scene.collection.objects.link(sun)
    sun.data.energy = 3.0; sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    for key in ('walk-a', 'run', 'swing1', 'swing2'):
        pose(dict(next(p[2] for p in POSES if p[0] == key)))
        for view, d in (('game', G), ('gameM', GM)): shoot('toon-' + key + '-' + view, d, (0, 0, .64), 1.75)
json.dump({'source': 'export/chewy_samurai.bin + .json, game pivot-only skeleton', 'neutral': NEUTRAL, 'poses': POSES, 'face': FACE},
          open(os.path.join(T, 'pose-tests.json'), 'w'), indent=1, default=list)
print('RENDER_POSES_DONE', flush=True)
