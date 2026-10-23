"""Review renders of the exported mochi-toy.glb (same lights and scales every round).

    blender --background --factory-startup --python render_views.py -- [--only name,name] [--toon]

Writes into preview/: head_front|q25|34|side|back|top.png (ortho, 0.90 m frames, centre z = 0.80 m),
body_front|34|side|back.png (ortho, 1.25 m tall frames), portrait.png (3/4 head and shoulders, studio light),
game-45.png (45 deg down, yaw +45 | -45, 135 mm lens), scales.json (px/m and centres, for compare crops).
--toon: a hard two-tone toon check of the face (sun ~50 deg up from the side), preview/toon-check.png.
"""
import bpy, math, os, sys, json
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview'); os.makedirs(OUT, exist_ok=True)
MODEL = 'D:/projects/chewy-life-3d/public/models/mochi-toy.glb'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
TOON = '--toon' in argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=MODEL)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 48
except Exception: pass
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'
sc.render.film_transparent = True
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.60, .55, .50, 1)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
sc.use_nodes = True; nt = sc.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); ov = nt.nodes.new('CompositorNodeAlphaOver')
ov.inputs[1].default_value = (.93, .90, .86, 1); nt.links.new(rl.outputs['Image'], ov.inputs[2])
cp = nt.nodes.new('CompositorNodeComposite'); nt.links.new(ov.outputs[0], cp.inputs[0])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.clip_start = .05; cam.data.clip_end = 50
def light(name, rel, power, size, color):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel
    return o
L = [light('key', (-2.2, 1.9, 1.0), 175, 3.0, (1, .92, .86)), light('fill', (2.4, -.4, .6), 85, 3.0, (.88, .92, 1)),
     light('rim', (.8, 2.6, -2.8), 120, 2.5, (1, .88, .76))]
for o in L:
    tgt = Vector((0, 0, -3.2)); o.rotation_euler = (tgt - o.location).to_track_quat('-Z', 'Y').to_euler()
def aim(loc, target, ortho=None, lens=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
def shot(name, rx, ry):
    if only and name not in only: return
    sc.render.resolution_x = rx; sc.render.resolution_y = ry; sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
def view_dir(name):
    return {'front': (0, -1, 0), '34': (.64, -.77, 0), 'q25': (.4226, -.9063, 0), 'q25R': (-.4226, -.9063, 0), '34R': (-.64, -.77, 0), 'side': (1, 0, 0), 'sideR': (-1, 0, 0),
            'back': (0, 1, 0), 'top': (0, -.0001, 1)}[name]
if TOON:
    # the game's hard light / shade band: Shader to RGB -> constant ramp at ~0.12, sun ~50 deg up from the side
    for o in L: o.hide_render = True
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 3.0
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        n = m.node_tree.nodes; bsdf = next((x for x in n if x.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None: continue
        tex = next((x for x in n if x.type == 'TEX_IMAGE'), None)
        dif = n.new('ShaderNodeBsdfDiffuse'); s2r = n.new('ShaderNodeShaderToRGB'); ramp = n.new('ShaderNodeValToRGB')
        ramp.color_ramp.interpolation = 'CONSTANT'; ramp.color_ramp.elements[0].color = (.45, .45, .5, 1); ramp.color_ramp.elements[1].position = .12
        ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        mul = n.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
        emi = n.new('ShaderNodeEmission'); outn = next(x for x in n if x.type == 'OUTPUT_MATERIAL')
        m.node_tree.links.new(dif.outputs[0], s2r.inputs[0]); m.node_tree.links.new(s2r.outputs[0], ramp.inputs[0])
        m.node_tree.links.new(ramp.outputs[0], mul.inputs['A'])
        if tex: m.node_tree.links.new(tex.outputs[0], mul.inputs['B'])
        m.node_tree.links.new(mul.outputs['Result'], emi.inputs[0]); m.node_tree.links.new(emi.outputs[0], outn.inputs[0])
    import numpy as np
    tiles = []
    HCt = Vector((0, -.05, .74))
    for k, (yaw, sy) in enumerate(((0, 1), (34, 1), (-34, -1))):
        y = math.radians(yaw); d = Vector((math.sin(y), -math.cos(y), .12)).normalized()
        sun.rotation_euler = (Vector((0, 0, 0)) - Vector((-.75 * sy, -.45, 1.05))).to_track_quat('-Z', 'Y').to_euler()
        aim(HCt + d * 4, HCt, ortho=.80); shot('toon_%d' % k, 700, 700); tiles.append(os.path.join(OUT, 'toon_%d.png' % k))
    ims = [bpy.data.images.load(t) for t in tiles]; c = np.ones((700, 2120, 4), np.float32)
    for k, im in enumerate(ims):
        a = np.empty(700 * 700 * 4, np.float32); im.pixels.foreach_get(a); c[:, k * 710:k * 710 + 700] = a.reshape(700, 700, 4)
    im = bpy.data.images.new('toon', 2120, 700); im.pixels.foreach_set(c.ravel()); im.filepath_raw = os.path.join(OUT, 'toon-check.png')
    im.file_format = 'PNG'; im.save()
    print('RENDER_VIEWS_DONE'); raise SystemExit
scales = {}
HC = Vector((0, -.01, .80))
for n in ('front', 'q25', '34', 'q25R', '34R', 'side', 'sideR', 'back', 'top'):
    c = HC + Vector((0, .03, 0)) if n in ('side', 'sideR') else HC
    d = Vector(view_dir(n)).normalized(); aim(c + d * 4, c, ortho=.90); shot('head_' + n, 1000, 1000)
    scales['head_' + n] = {'px_per_m': 1000 / .90, 'centre_m': list(c), 'res': [1000, 1000]}
BC = Vector((0, 0, .56))
for n in ('front', '34', 'side', 'back'):
    d = Vector(view_dir(n)).normalized(); aim(BC + d * 6, BC, ortho=1.25); shot('body_' + n, 1000, 1000)
    scales['body_' + n] = {'px_per_m': 1000 / 1.25, 'centre_m': list(BC), 'res': [1000, 1000]}
aim((1.52, -2.75, 1.16), (0, -.045, .74), ortho=.98); shot('../portrait', 1100, 1100)
for k, yaw in (('p', 45), ('m', -45)):
    e = math.radians(45); y = math.radians(yaw)
    d = Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    t = Vector((0, 0, .55)); aim(t + d * 7.0, t, lens=135); shot('g45_' + k, 700, 700)
if not only or ('g45_p' in only and 'g45_m' in only):
    import numpy as np
    a = bpy.data.images.load(os.path.join(OUT, 'g45_p.png')); b = bpy.data.images.load(os.path.join(OUT, 'g45_m.png'))
    pa = np.empty(700 * 700 * 4, np.float32); pb = np.empty_like(pa); a.pixels.foreach_get(pa); b.pixels.foreach_get(pb)
    c = np.ones((700, 1410, 4), np.float32); c[:, :700] = pa.reshape(700, 700, 4); c[:, 710:] = pb.reshape(700, 700, 4)
    im = bpy.data.images.new('g45', 1410, 700); im.pixels.foreach_set(c.ravel()); im.filepath_raw = os.path.join(OUT, '..', 'game-45.png')
    im.file_format = 'PNG'; im.save()
# ear close-ups from the game camera (45 deg down, both yaws, long lens)
for k, yaw in (('p', 45), ('m', -45)):
    e = math.radians(45); y = math.radians(yaw)
    d = Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    t = Vector((0, 0, .86)); aim(t + d * 3.2, t, lens=135); shot('ears45_' + k, 700, 700)
if not only or ('ears45_p' in only and 'ears45_m' in only):
    import numpy as np
    a = bpy.data.images.load(os.path.join(OUT, 'ears45_p.png')); b = bpy.data.images.load(os.path.join(OUT, 'ears45_m.png'))
    pa = np.empty(700 * 700 * 4, np.float32); pb = np.empty_like(pa); a.pixels.foreach_get(pa); b.pixels.foreach_get(pb)
    c = np.ones((700, 1410, 4), np.float32); c[:, :700] = pa.reshape(700, 700, 4); c[:, 710:] = pb.reshape(700, 700, 4)
    im = bpy.data.images.new('e45', 1410, 700); im.pixels.foreach_set(c.ravel()); im.filepath_raw = os.path.join(OUT, 'ears-game.png')
    im.file_format = 'PNG'; im.save()
with open(os.path.join(OUT, 'scales.json'), 'w') as f: json.dump(scales, f, indent=1)
print('RENDER_VIEWS_DONE')
