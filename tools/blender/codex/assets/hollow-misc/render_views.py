# Review renders for the hollow-misc pieces (copied from hollow-decor; adds --ground <hex> and --only run):
#   blender --background --factory-startup --python render_views.py -- --in <glb> --out <dir> --tag <piece>
#           [--kit <kit obj>] [--ty 0.7] [--cap 0.85,-0.55] [--close 5] [--only all|gamecam|kitcmp|close]
# <tag>-gamecam.png: the game camera (vertical FOV 20 deg, 45 deg down) at 22 m and 12 m, yaw -45 | +45, a 1 m capsule.
# <tag>-kitcmp.png: the kit dump | ours at the same close camera (yaw -45 and +45, two rows).
# <tag>-close.png: ours close (yaw 0, 135), for detail.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); TAG = arg('--tag', 'piece')
KIT = arg('--kit'); ONLY = arg('--only', 'all')
W, H = int(arg('--w', '960')), int(arg('--h', '540'))
CLOSE = float(arg('--close', '5'))
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
for m in bpy.data.materials:   # daylight: the game's day level of window_glow is low
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = float(arg('--glow', '0.06'))
for o in kit: o.hide_render = True

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.004))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', arg('--ground', '#86c060')))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
CP = [float(v) for v in arg('--cap', '0.85,-0.75').split(',')]   # Blender x, y
cap.location = Vector((CP[0], CP[1], 0))
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.75
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 24
except Exception: pass
try: scene.eevee.use_shadows = True
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)

TGT = Vector((0.0, 0.0, float(arg('--ty', '0.7'))))
def shoot(path, yaw_deg, pitch_deg=45, dist=22, target=None, w=W, h=H):
    target = TGT if target is None else target
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = target + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
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
def resize(a, h):
    sc = h / a.shape[0]
    yi = (np.arange(h) / sc).astype(int).clip(0, a.shape[0] - 1)
    xi = (np.arange(int(a.shape[1] * sc)) / sc).astype(int).clip(0, a.shape[1] - 1)
    return a[yi][:, xi]
def row(arrs, gap=6):
    h = max(a.shape[0] for a in arrs); parts = []
    for i, a in enumerate(arrs):
        if a.shape[0] != h: a = resize(a, h)
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(arrs, gap=6):
    w = max(a.shape[1] for a in arrs); parts = []
    for i, a in enumerate(arrs):
        if a.shape[1] < w: a = np.hstack([a, np.ones((a.shape[0], w - a.shape[1], 4), np.float32)])
        if i: parts.append(np.ones((gap, w, 4), np.float32))
        parts.append(a)
    return np.vstack(parts[::-1])   # (image rows start at the bottom)

tmp = os.path.join(OUT, '_rv_' + TAG + '_' + ONLY); os.makedirs(tmp, exist_ok=True)
if ONLY == 'run':   # three pieces in a run (x -1 | 0 | +1, the right one turned 180 deg): do the ends meet flush?
    for dx, rz in ((-1.0, 0.0), (1.0, math.pi)):
        for o in load_asset(SRC):
            if o.parent is None: o.location.x += dx; o.rotation_mode = 'XYZ'; o.rotation_euler.z += rz
    cap.hide_render = True
    shots = [load(shoot(os.path.join(tmp, 'r%d.png' % y), y, 45, CLOSE, w=900, h=600)) for y in (-45, 45)]
    shots.append(load(shoot(os.path.join(tmp, 'rf.png'), 0, 12, CLOSE * 0.8, w=900, h=600)))
    save(row(shots[:2]), os.path.join(OUT, TAG + '-run.png')); save(shots[2], os.path.join(OUT, TAG + '-runfront.png'))
if ONLY in ('all', 'gamecam'):
    rows = []
    for dist in (22, 12):
        rows.append(row([load(shoot(os.path.join(tmp, 'g%d_%d.png' % (dist, y)), y, 45, dist)) for y in (-45, 45)]))
    save(col(rows), os.path.join(OUT, TAG + '-gamecam.png'))
if kit and ONLY in ('all', 'kitcmp'):
    rows = []
    for y in (-45, 45):
        ours = load(shoot(os.path.join(tmp, 'o%d.png' % y), y, 45, CLOSE, w=720, h=720))
        for o in asset: o.hide_render = True
        for o in kit: o.hide_render = False
        theirs = load(shoot(os.path.join(tmp, 'k%d.png' % y), y, 45, CLOSE, w=720, h=720))
        for o in asset: o.hide_render = False
        for o in kit: o.hide_render = True
        rows.append(row([theirs, ours]))
    save(col(rows), os.path.join(OUT, TAG + '-kitcmp.png'))
if ONLY in ('all', 'close'):
    cap.hide_render = True
    shots = [load(shoot(os.path.join(tmp, 'c%d.png' % y), y, 35, CLOSE * 0.8, w=720, h=720)) for y in (0, 135)]
    save(row(shots), os.path.join(OUT, TAG + '-close.png'))
    cap.hide_render = False
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
