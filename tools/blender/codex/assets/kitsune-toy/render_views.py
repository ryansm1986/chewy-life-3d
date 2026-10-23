"""Review renders of the kitsune-toy glb (same lights and scales every round; after the stella-toy tool).

    blender --background --factory-startup --python render_views.py -- [--in model.glb] [--only name,name] [--out dir] [--tag fan]

Writes into preview/: head_front|34|34R|side|back.png (ortho 1.00 m over 1000 px, centre z 0.86 m),
body_front|34|34R|side|back.png (ortho 1.70 m over 1000 px, centre z 0.60 m), portrait.png (3/4 head and shoulders, in the task folder),
g45_p / g45_m (45 deg down, yaw +45 / -45, at her in-game x2.5 size) -> game-45.png, g45h_p / g45h_m -> game-45-head.png, scales.json.
'34' looks from her front-left (+X: the sheet's 3/4, the mask side); '34R' from her front-right.
--tag adds a suffix to every file name (e.g. the fan-preview renders: body_back_fan.png).
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
def rel(p): return p if os.path.isabs(p) else os.path.join(ROOT, p)
MODEL = rel(arg('--in', 'D:/projects/chewy-life-3d/public/models/kitsune-toy.glb'))
OUT = rel(arg('--out', 'preview')); os.makedirs(OUT, exist_ok=True)
only = set(arg('--only').split(',')) if arg('--only') else None
TAG = ('_' + arg('--tag')) if arg('--tag') else ''
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=MODEL)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 32
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
cam.data.clip_start = .05; cam.data.clip_end = 80
def light(name, rel_, power, size, color):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel_; return o
L = [light('key', (-2.2, 1.9, 1.0), 165, 3.0, (1, .93, .88)), light('fill', (2.4, -.4, .6), 80, 3.0, (.88, .92, 1)),
     light('rim', (.8, 2.6, -2.8), 110, 2.5, (1, .90, .80))]
for o in L:
    tgt = Vector((0, 0, -3.2)); o.rotation_euler = (tgt - o.location).to_track_quat('-Z', 'Y').to_euler()
def aim(loc, target, ortho=None, lens=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
def want(name): return only is None or name in only
def shot(name, rx, ry, path=None):
    sc.render.resolution_x = rx; sc.render.resolution_y = ry; sc.render.resolution_percentage = 100
    sc.render.filepath = path or os.path.join(OUT, name + TAG + '.png'); bpy.ops.render.render(write_still=True)
    return sc.render.filepath
def pair(a, b, out, w, h):
    A = bpy.data.images.load(a); B = bpy.data.images.load(b)
    pa = np.empty(w * h * 4, np.float32); pb = np.empty_like(pa); A.pixels.foreach_get(pa); B.pixels.foreach_get(pb)
    c = np.ones((h, 2 * w + 10, 4), np.float32); c[:, :w] = pa.reshape(h, w, 4); c[:, w + 10:] = pb.reshape(h, w, 4)
    im = bpy.data.images.new(os.path.basename(out), 2 * w + 10, h); im.pixels.foreach_set(c.ravel()); im.filepath_raw = out
    im.file_format = 'PNG'; im.save()
def view_dir(name):
    return {'front': (0, -1, 0), '34': (.64, -.77, 0), '34R': (-.64, -.77, 0), 'side': (1, 0, 0), 'back': (0, 1, 0),
            'top': (0, -.0001, 1), 'sideR': (-1, 0, 0)}[name]
scales = {}
def game_dir(yaw, pitch=45):
    e = math.radians(pitch); y = math.radians(yaw)
    return Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
HC = Vector((0, -.03, .86)); HO = 1.00
BC = Vector((0, .05, .60)); BO = 1.70
for n in ('front', '34', '34R', 'side', 'back', 'top', 'sideR'):
    if not want('head_' + n): continue
    d = Vector(view_dir(n)).normalized(); aim(HC + d * 4, HC, ortho=HO); shot('head_' + n, 1000, 1000)
    scales['head_' + n] = {'px_per_m': 1000 / HO, 'centre_m': list(HC), 'res': [1000, 1000]}
for n in ('front', '34', '34R', 'side', 'back'):
    if not want('body_' + n): continue
    d = Vector(view_dir(n)).normalized(); aim(BC + d * 6, BC, ortho=BO); shot('body_' + n, 1000, 1000)
    scales['body_' + n] = {'px_per_m': 1000 / BO, 'centre_m': list(BC), 'res': [1000, 1000]}
if want('portrait'):
    aim((1.75, -2.75, 1.25), (0, -.04, .80), ortho=1.20); shot('portrait', 1100, 1100, os.path.join(ROOT, 'portrait' + TAG + '.png'))
if want('portrait_front'):
    aim((0, -3.2, 1.00), (0, -.04, .80), ortho=1.20); shot('portrait-front', 1100, 1100, os.path.join(ROOT, 'portrait-front' + TAG + '.png'))
if want('g45') or want('g45h'):
    # her in-game size: the game draws her x2.5 (about 2.6 m to the crest) with the camera ~18 m away, 45 deg down. Uniform scaling leaves
    # the picture unchanged, so the model stays at 1x and the camera stands 18 / 2.5 = 7.2 m away (the lights keep their usual offsets).
    gp = bpy.data.objects.new('ground', bpy.data.meshes.new('ground'))
    gp.data.from_pydata([(-6, -6, -.002), (6, -6, -.002), (6, 6, -.002), (-6, 6, -.002)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new('gm'); gm.use_nodes = True
    next(n_ for n_ in gm.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (.42, .30, .20, 1)
    gp.data.materials.append(gm); sc.collection.objects.link(gp)
    if want('g45'):
        t = Vector((0, .05, .58))
        for nm_, yw in (('g45_p', 45), ('g45_m', -45), ('g45_0', 0)):
            aim(t + game_dir(yw) * 7.2, t, lens=150); shot(nm_, 800, 800)
        pair(os.path.join(OUT, 'g45_p' + TAG + '.png'), os.path.join(OUT, 'g45_m' + TAG + '.png'), os.path.join(OUT, 'game-45' + TAG + '.png'), 800, 800)
    if want('g45h'):
        t = Vector((0, -.03, .84))
        aim(t + game_dir(45) * 7.2, t, lens=300); shot('g45h_p', 800, 800)
        aim(t + game_dir(-45) * 7.2, t, lens=300); shot('g45h_m', 800, 800)
        pair(os.path.join(OUT, 'g45h_p' + TAG + '.png'), os.path.join(OUT, 'g45h_m' + TAG + '.png'), os.path.join(OUT, 'game-45-head' + TAG + '.png'), 800, 800)
with open(os.path.join(OUT, 'scales' + TAG + '.json'), 'w') as f: json.dump(scales, f, indent=1)
print('RENDER_VIEWS_DONE')
