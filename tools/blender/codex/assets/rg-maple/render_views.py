# Review renders for an rg-maple prop (beyond the standard preview.py):
#   blender --background --factory-startup --python render_views.py -- --in <glb> --out <dir> --piece <name>
#           [--kit <kit dump obj>] [--ty 0.8] [--cap x,y] [--far 18] [--near 10] [--kd 9] [--gameyaw 22]
# Writes <dir>/<piece>-gamecam.png: the game camera (vertical FOV 20 deg) at --far (top row) and --near (bottom row);
#   columns: pitch 45 yaw -45 | pitch 45 yaw +45 | pitch 35 yaw -45 | pitch 35 yaw +45; a 1 m capsule at --cap;
# <dir>/<piece>-kitcmp.png: ours (top) | the kit dump (bottom), pitch 35.5 deg (the game's 0.62 rad) at --kd m, from
#   the yaw the region's camera sees it at (--gameyaw) and from -45 / +45;
# <dir>/<piece>-close.png: close views, front 3/4 left | front | back 3/4 right.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); PIECE = arg('--piece', 'piece')
KIT = arg('--kit'); TY = float(arg('--ty', '0.8')); TX = float(arg('--tx', '0'))
CAP = [float(v) for v in arg('--cap', '1.2,-0.6').split(',')]
FAR, NEAR, KD = float(arg('--far', '18')), float(arg('--near', '10')), float(arg('--kd', '9'))
GAMEYAW = float(arg('--gameyaw', '22')); CLOSE = float(arg('--close', '4'))
W, H = int(arg('--w', '720')), int(arg('--h', '540'))
ONLY = arg('--only', 'all')
os.makedirs(OUT, exist_ok=True)
print('RV pid', os.getpid())

def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    return m

def load_asset(path):
    before = set(bpy.data.objects)
    if path.lower().endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree
        b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
        vc = nt.nodes.new('ShaderNodeVertexColor')
        nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
        for o in obs:
            if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
            o.data.materials.clear(); o.data.materials.append(mt)
            for p in o.data.polygons: p.use_smooth = True
    else:
        bpy.ops.import_scene.gltf(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    return obs

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
asset = load_asset(SRC)
kit = load_asset(KIT) if KIT else []
for m in bpy.data.materials:      # daylight: the game's glow is dim by day
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = float(arg('--glow', '0.3'))
for o in kit: o.hide_render = True

bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.002))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', '#93ac58'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
cap.location = Vector((CAP[0], CAP[1], 0))
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.0; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.8, 0.84, 0.95, 1); bg.inputs['Strength'].default_value = 0.75
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 24
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)

def shoot(path, yaw_deg, pitch_deg, dist, ty=None, w=W, h=H, fov=20):
    t = Vector((TX, 0, TY if ty is None else ty))
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    # yaw 0 = from the front (Blender -Y, the game's +z); positive yaw swings round toward +X
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = t + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.angle_y = math.radians(fov)
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
    h = max(a.shape[0] for a in arrs); parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(arrs, gap=6):
    parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((gap, a.shape[1], 4), np.float32))
        parts.append(a)
    return np.vstack(parts[::-1])   # (image rows start at the bottom: the first row on top)

tmp = os.path.join(OUT, '_rv_' + PIECE + '_' + ONLY); os.makedirs(tmp, exist_ok=True)
VIEWS = [(45, -45), (45, 45), (35, -45), (35, 45)]
if ONLY in ('all', 'gamecam'):
    rows = []
    for dist in (FAR, NEAR):
        rows.append(row([load(shoot(os.path.join(tmp, 'g%d_%d_%d.png' % (dist, p, y)), y, p, dist)) for p, y in VIEWS]))
    save(col(rows), os.path.join(OUT, PIECE + '-gamecam.png'))
if KIT and ONLY in ('all', 'kitcmp'):
    yaws = (GAMEYAW, -45, 45)
    ours = [load(shoot(os.path.join(tmp, 'o%d.png' % i), y, 35.5, KD)) for i, y in enumerate(yaws)]
    for o in asset: o.hide_render = True
    for o in kit: o.hide_render = False
    kits = [load(shoot(os.path.join(tmp, 'k%d.png' % i), y, 35.5, KD)) for i, y in enumerate(yaws)]
    for o in asset: o.hide_render = False
    for o in kit: o.hide_render = True
    save(col([row(ours), row(kits)]), os.path.join(OUT, PIECE + '-kitcmp.png'))
if ONLY in ('all', 'close'):
    cap.hide_render = True
    shots = [load(shoot(os.path.join(tmp, 'c%d.png' % y), y, 25, CLOSE, w=640, h=720, fov=30)) for y in (-35, 0, 150)]
    save(row(shots), os.path.join(OUT, PIECE + '-close.png'))
    cap.hide_render = False
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
