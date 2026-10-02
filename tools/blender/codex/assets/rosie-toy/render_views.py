"""Review renders of the exported rosie-opus.glb (same lights and scales every round).

    blender --background --factory-startup --python render_views.py -- [--only name,name]

Writes into preview/: head_front|34|side|back|top.png (ortho, 1250 px/m, centre z = 0.99 m),
body_front|34|side|back.png (ortho, 700 px/m), portrait.png (3/4 head and shoulders, studio light),
game-45.png (45 deg down, yaw +45 | -45, 135 mm lens), scales.json (the px/m and centres, for compare crops).
"""
import bpy, math, os, sys, json
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview'); os.makedirs(OUT, exist_ok=True)
MODEL = 'D:/projects/chewy-life-3d/public/models/rosie-opus.glb'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
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
# studio lights ride with the camera so every view is lit the same way (like the sheet)
def light(name, rel, power, size, color):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel
    o.rotation_euler = (0, 0, 0); return o
L = [light('key', (-2.2, 1.9, 1.0), 175, 3.0, (1, .92, .86)), light('fill', (2.4, -.4, .6), 85, 3.0, (.88, .92, 1)),
     light('rim', (.8, 2.6, -2.8), 120, 2.5, (1, .88, .76))]
for o in L:   # aim each light at the camera's target (local -Z at 3.2 m)
    tgt = Vector((0, 0, -3.2)); o.rotation_euler = (tgt - o.location).to_track_quat('-Z', 'Y').to_euler()
def aim(loc, target, ortho=None, lens=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
    for o in L: pass
def shot(name, rx, ry):
    if only and name not in only: return
    sc.render.resolution_x = rx; sc.render.resolution_y = ry; sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
scales = {}
def view_dir(name):
    return {'front': (0, -1, 0), '34': (.64, -.77, 0), 'q25': (.4226, -.9063, 0), 'side': (1, 0, 0), 'back': (0, 1, 0), 'top': (0, -.0001, 1)}[name]
# head close-ups: 1000 px = 0.95 m (round 7: the 0.52 m head)
HC = Vector((0, -.02, 1.03))
for n in ('front', 'q25', '34', 'side', 'back', 'top'):
    c = HC + Vector((0, .07, 0)) if n == 'side' else HC      # the side view also frames the back of the hair
    d = Vector(view_dir(n)).normalized(); aim(c + d * 4, c, ortho=.95); shot('head_' + n, 1000, 1000)
    scales['head_' + n] = {'px_per_m': 1000 / .95, 'centre_m': list(c), 'res': [1000, 1000]}
# full body: 1000 px tall = 1.40 m
BC = Vector((0, 0, .66))
for n in ('front', '34', 'side', 'back'):
    d = Vector(view_dir(n)).normalized(); aim(BC + d * 6, BC, ortho=1.40); shot('body_' + n, 700, 1000)
    scales['body_' + n] = {'px_per_m': 1000 / 1.40, 'centre_m': list(BC), 'res': [700, 1000]}
# studio portrait, 3/4 head and shoulders (the chewy-b framing)
aim((1.52, -2.75, 1.42 + .05), (0, -.045, 1.0), ortho=.92); shot('../portrait', 1100, 1100)
# game camera 45 deg down, both yaws, long lens
for k, yaw in (('p', 45), ('m', -45)):
    e = math.radians(45); y = math.radians(yaw)
    d = Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    t = Vector((0, 0, .70)); aim(t + d * 7.0, t, lens=135); shot('g45_' + k, 700, 700)
if not only or ('g45_p' in only and 'g45_m' in only):
    a = bpy.data.images.load(os.path.join(OUT, 'g45_p.png')); b = bpy.data.images.load(os.path.join(OUT, 'g45_m.png'))
    import numpy as np
    pa = np.empty(700 * 700 * 4, np.float32); pb = np.empty_like(pa); a.pixels.foreach_get(pa); b.pixels.foreach_get(pb)
    c = np.ones((700, 1410, 4), np.float32); c[:, :700] = pa.reshape(700, 700, 4); c[:, 710:] = pb.reshape(700, 700, 4)
    im = bpy.data.images.new('g45', 1410, 700); im.pixels.foreach_set(c.ravel()); im.filepath_raw = os.path.join(OUT, '..', 'game-45.png')
    im.file_format = 'PNG'; im.save()
with open(os.path.join(OUT, 'scales.json'), 'w') as f: json.dump(scales, f, indent=1)
print('RENDER_VIEWS_DONE')
