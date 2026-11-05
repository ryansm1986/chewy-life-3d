# Review renders for a zv-maple building (beyond the standard preview.py):
#   blender --background --factory-startup --python render_views.py -- --in <glb> --out <dir> --piece <name>
#           [--kit <kit screenshot png> --kitbox x0,y0,x1,y1] [--state saved|siege]
# Writes <dir>/<piece>-gamecam.png: a 2 x 2 sheet, 45 deg down at ~22 m (top row) and ~12 m (bottom row), game yaws
#   +45 | -45 (the village camera's two yaws), the saved look, a 1 m capsule by the door;
# <dir>/<piece>-siege.png: the besieged look at 12 m from both yaws;
# <dir>/<piece>-kitcmp.png: the kit screenshot crop | ours from the same yaw.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); PIECE = arg('--piece', 'piece')
KIT = arg('--kit'); KITBOX = arg('--kitbox'); KITYAW = float(arg('--kityaw', '45'))
DOOR = [float(v) for v in arg('--door', '0,2').split(',')]
RES = int(arg('--res', '800'))
GP = math.degrees(0.62)                 # the game camera's pitch (core/engine.js), FOV 20 deg vertical
os.makedirs(OUT, exist_ok=True)
print('RV pid', os.getpid())

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
asset = [o for o in scene.objects if o.type == 'MESH']
def nodes_named(n): return [o for o in scene.objects if o.name.split('.')[0] == n]
saved = nodes_named('saved'); siege = nodes_named('siege')
def tree(objs):
    out = []
    for o in objs: out += [o] + list(o.children_recursive)
    return out
saved, siege = tree(saved), tree(siege)
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in asset:
    for v in o.data.vertices:
        w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
centre = (lo + hi) / 2

def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    return m
# the game draws window_glow unlit-ish by day: keep it from blowing out here
for m in bpy.data.materials:
    if 'glow' in m.name and m.node_tree:
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b: b.inputs['Emission Strength'].default_value = 0.15

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.003))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', '#8ab060'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
cap.location = Vector((DOOR[0], -DOOR[1], 0))
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 2.6; sun.data.angle = math.radians(14); sun.rotation_euler = (math.radians(40), 0, math.radians(-25))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.82, 0.92, 1); bg.inputs['Strength'].default_value = 0.7
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 32
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam

def show(state):
    for o in saved: o.hide_render = state != 'saved'
    for o in siege: o.hide_render = state != 'siege'

def shoot(path, yaw_deg, pitch_deg=45, dist=22, fov=20, target=None, w=RES, h=RES):
    t = target if target is not None else Vector((centre.x, centre.y, 1.2))
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    # yaw 0 = from the front (Blender -Y, the game's +z); positive yaw swings round toward +X
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = t + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(fov)
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    return path

def load(p):
    im = bpy.data.images.load(p); w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    return a.reshape(h, w, 4)
def save(arr, p):
    h, w = arr.shape[:2]; img = bpy.data.images.new('rv_out', w, h)
    img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
def row(arrs, gap=6):
    h = max(a.shape[0] for a in arrs)
    parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(arrs, gap=6):
    parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((gap, a.shape[1], 4), np.float32))
        parts.append(a)
    return np.vstack(parts[::-1])         # (image rows start at the bottom: the first row on top)

tmp = os.path.join(OUT, '_rv_' + PIECE); os.makedirs(tmp, exist_ok=True)
# The village camera: yaw pi/4 and 3pi/4 round the hero; a building faces the square, so from the building's own frame
# the camera sits front-left or front-right of it, about 45 deg each way.
show('saved')
far = [shoot(os.path.join(tmp, 'f%d.png' % i), y, 45, 22, 24) for i, y in enumerate((45, -45))]
near = [shoot(os.path.join(tmp, 'n%d.png' % i), y, 45, 12, 36) for i, y in enumerate((45, -45))]
save(col([row([load(p) for p in far]), row([load(p) for p in near])]), os.path.join(OUT, PIECE + '-gamecam.png'))
show('siege')
sg = [shoot(os.path.join(tmp, 's%d.png' % i), y, GP, 22, 22) for i, y in enumerate((45, -45))]
save(row([load(p) for p in sg]), os.path.join(OUT, PIECE + '-siege.png'))
show('saved')
fr = shoot(os.path.join(tmp, 'front.png'), 0, 30, 14, 36)
os.replace(fr, os.path.join(OUT, PIECE + '-front.png'))
low = shoot(os.path.join(tmp, 'low.png'), 20, 8, 9, 30, target=Vector((centre.x, centre.y, 1.0)))
os.replace(low, os.path.join(OUT, PIECE + '-low.png'))
if KIT and KITBOX:
    x0, y0, x1, y1 = [int(v) for v in KITBOX.split(',')]
    k = load(KIT); H = k.shape[0]
    crop = k[H - y1:H - y0, x0:x1]
    ours = load(shoot(os.path.join(tmp, 'k.png'), KITYAW, GP, 20, 20, w=1600, h=900))
    sc = ours.shape[0] / crop.shape[0]
    yi = (np.arange(ours.shape[0]) / sc).astype(int).clip(0, crop.shape[0] - 1)
    xi = (np.arange(int(crop.shape[1] * sc)) / sc).astype(int).clip(0, crop.shape[1] - 1)
    save(row([crop[yi][:, xi], ours]), os.path.join(OUT, PIECE + '-kitcmp.png'))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
