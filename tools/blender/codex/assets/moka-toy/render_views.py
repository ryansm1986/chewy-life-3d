"""Review renders of a Moka glb (same lights and scales every round).

    blender --background --factory-startup --python render_views.py -- [--in model.glb] [--only name,name] [--out dir]

Writes into preview/: head_front|q25|34|side|back|top.png (ortho, 1000 px = 1.00 m, centre z = 1.00 m),
body_front|34|side|back.png (ortho, 1000 px = 1.50 m, centre z = 0.70 m), portrait.png (3/4 head and shoulders,
studio light), game-45.png (45 deg down, yaw +45 | -45, 135 mm lens), scales.json.
"""
import bpy, math, os, sys, json
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
MODEL = arg('--in', 'D:/projects/chewy-life-3d/public/models/moka-toy.glb')
def rel(p): return p if os.path.isabs(p) else os.path.join(ROOT, p)     # Blender resolves bare relative render paths from C:\
OUT = rel(arg('--out', 'preview')); os.makedirs(OUT, exist_ok=True)
only = set(arg('--only').split(',')) if arg('--only') else None
PORTRAIT = rel(arg('--portrait', 'portrait.png'))
G45 = rel(arg('--g45', 'game-45.png'))
MODEL = rel(MODEL)
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
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel; return o
L = [light('key', (-2.2, 1.9, 1.0), 175, 3.0, (1, .92, .86)), light('fill', (2.4, -.4, .6), 85, 3.0, (.88, .92, 1)),
     light('rim', (.8, 2.6, -2.8), 120, 2.5, (1, .88, .76))]
for o in L:
    tgt = Vector((0, 0, -3.2)); o.rotation_euler = (tgt - o.location).to_track_quat('-Z', 'Y').to_euler()
def aim(loc, target, ortho=None, lens=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
def shot(name, rx, ry, path=None):
    if only and name not in only: return
    sc.render.resolution_x = rx; sc.render.resolution_y = ry; sc.render.resolution_percentage = 100
    sc.render.filepath = path or os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
scales = {}
def view_dir(name):
    return {'front': (0, -1, 0), '34': (.64, -.77, 0), 'q25': (.4226, -.9063, 0), 'side': (1, 0, 0), 'back': (0, 1, 0),
            'top': (0, -.0001, 1), 'sideR': (-1, 0, 0)}[name]
HC = Vector((0, -.02, 1.00))
for n in ('front', 'q25', '34', 'side', 'back', 'top'):
    c = HC + Vector((0, .06, 0)) if n == 'side' else HC
    d = Vector(view_dir(n)).normalized(); aim(c + d * 4, c, ortho=1.0); shot('head_' + n, 1000, 1000)
    scales['head_' + n] = {'px_per_m': 1000 / 1.0, 'centre_m': list(c), 'res': [1000, 1000]}
BC = Vector((0, 0, .70))
for n in ('front', '34', 'side', 'back'):
    d = Vector(view_dir(n)).normalized(); aim(BC + d * 6, BC, ortho=1.50); shot('body_' + n, 750, 1000)
    scales['body_' + n] = {'px_per_m': 1000 / 1.50, 'centre_m': list(BC), 'res': [750, 1000]}
aim((1.52, -2.75, 1.42), (0, -.04, .98), ortho=.92); shot('portrait', 1100, 1100, PORTRAIT)
for k, yaw in (('p', 45), ('m', -45)):
    e = math.radians(45); y = math.radians(yaw)
    d = Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    t = Vector((0, 0, .72)); aim(t + d * 7.0, t, lens=135); shot('g45_' + k, 700, 700)
if not only or ('g45_p' in only and 'g45_m' in only):
    import numpy as np
    a = bpy.data.images.load(os.path.join(OUT, 'g45_p.png')); b = bpy.data.images.load(os.path.join(OUT, 'g45_m.png'))
    pa = np.empty(700 * 700 * 4, np.float32); pb = np.empty_like(pa); a.pixels.foreach_get(pa); b.pixels.foreach_get(pb)
    c = np.ones((700, 1410, 4), np.float32); c[:, :700] = pa.reshape(700, 700, 4); c[:, 710:] = pb.reshape(700, 700, 4)
    im = bpy.data.images.new('g45', 1410, 700); im.pixels.foreach_set(c.ravel()); im.filepath_raw = G45
    im.file_format = 'PNG'; im.save()
with open(os.path.join(OUT, 'scales.json'), 'w') as f: json.dump(scales, f, indent=1)
print('RENDER_VIEWS_DONE')
