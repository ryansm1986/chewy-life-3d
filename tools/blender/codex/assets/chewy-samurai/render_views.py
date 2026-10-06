"""Review renders of a GLB (same lights and scales every round).

    blender --background --factory-startup --python render_views.py -- [--in GLB] [--out DIR] [--only a,b]

Writes into DIR (default preview/): body_front|34|side|back.png (ortho, 1000 px = 1.40 m, centre z 0.66 m),
detail_*.png close-ups, g45_p|m.png (45 deg down, yaw +45 | -45), g45_bp|bm.png (from behind), game-45.png and
game-45-back.png (the pairs side by side), scales.json (px/m and centres for the comparison crops).
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
MODEL = arg('--in', 'D:/projects/chewy-life-3d/public/models/chewy-samurai.glb')
OUT = arg('--out', os.path.join(ROOT, 'preview')); os.makedirs(OUT, exist_ok=True)
only = set(arg('--only').split(',')) if arg('--only') else None
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
    o.rotation_euler = (Vector((0, 0, -3.2)) - Vector(rel)).to_track_quat('-Z', 'Y').to_euler(); return o
light('key', (-2.2, 1.9, 1.0), 175, 3.0, (1, .92, .86)); light('fill', (2.4, -.4, .6), 85, 3.0, (.88, .92, 1))
light('rim', (.8, 2.6, -2.8), 120, 2.5, (1, .88, .76))
def aim(loc, target, ortho=None, lens=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
def shot(name, rx, ry):
    if only and name not in only: return False
    sc.render.resolution_x = rx; sc.render.resolution_y = ry; sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True); return True
def vdir(n): return Vector({'front': (0, -1, 0), '34': (.64, -.77, 0), 'side': (1, 0, 0), 'back': (0, 1, 0), '34m': (-.64, -.77, 0),
                            'neck': (.35, -.75, .55), 'neckm': (-.35, -.75, .55)}[n]).normalized()
scales = {}
BC = Vector((0, 0, .66))
for n in ('front', '34', 'side', 'back'):
    d = vdir(n); aim(BC + d * 6, BC, ortho=1.40); shot('body_' + n, 700, 1000)
    scales['body_' + n] = {'px_per_m': 1000 / 1.40, 'centre_m': list(BC), 'res': [700, 1000]}
# close-ups: chest, hips (saya), back (vent and crest), shoulder
for nm, c, d, o in (('detail_chest', (0, -.1, .55), 'front', .42), ('detail_hip', (.22, -.05, .33), '34', .42),
                    ('detail_back', (0, .1, .42), 'back', .50), ('detail_side', (.1, 0, .36), 'side', .55),
                    ('detail_34m', (-.05, -.05, .45), '34m', .55), ('detail_neck', (0, -.05, .62), 'neck', .40),
                    ('detail_neckm', (0, -.05, .62), 'neckm', .40), ('detail_sleeves_front', (0, -.05, .55), 'front', .95),
                    ('detail_hakama_front', (0, -.05, .27), 'front', .62)):
    dd = vdir(d); aim(Vector(c) + dd * 6, Vector(c), ortho=o); shot(nm, 800, 800)
def g45(name, yaw, target=(0, 0, .62), dist=6.5, lens=150):
    e = math.radians(45); y = math.radians(yaw)
    d = Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    t = Vector(target); aim(t + d * dist, t, lens=lens); return shot(name, 800, 800)
done = [g45('g45_p', 45), g45('g45_m', -45), g45('g45_bp', 135), g45('g45_bm', -135),
        g45('sleeve45_p', 45, (0, 0, .56), 6.5, 300), g45('sleeve45_m', -45, (0, 0, .56), 6.5, 300)]
def pair(a, b, out):
    pa, pb = os.path.join(OUT, a + '.png'), os.path.join(OUT, b + '.png')
    if not (os.path.exists(pa) and os.path.exists(pb)): return
    A = bpy.data.images.load(pa); B = bpy.data.images.load(pb); w, h = A.size
    x = np.empty(w * h * 4, np.float32); y = np.empty_like(x); A.pixels.foreach_get(x); B.pixels.foreach_get(y)
    c = np.ones((h, 2 * w + 10, 4), np.float32); c[:, :w] = x.reshape(h, w, 4); c[:, w + 10:] = y.reshape(h, w, 4)
    im = bpy.data.images.new(out, 2 * w + 10, h); im.pixels.foreach_set(c.ravel()); im.filepath_raw = os.path.join(OUT, out + '.png')
    im.file_format = 'PNG'; im.save()
pair('g45_p', 'g45_m', 'game-45'); pair('g45_bp', 'g45_bm', 'game-45-back'); pair('sleeve45_p', 'sleeve45_m', 'detail_sleeves_45')
with open(os.path.join(OUT, 'scales.json'), 'w') as f: json.dump(scales, f, indent=1)
print('RENDER_VIEWS_DONE')
