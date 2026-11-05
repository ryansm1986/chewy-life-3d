# Review renders for dg-tidepool (beyond the standard preview.py):
#   blender --background --factory-startup --python render_views.py -- --in <glb> --out <dir> --tag <name>
#           [--kit <kit obj>] [--ty 0.8] [--only gamecam|kitcmp|close|all] [--cap 0.7,1.4]
# <tag>-gamecam.png: the game camera (vertical FOV 20 deg): row 1 pitch 45 deg at 18 m, row 2 pitch 35 deg at 10 m;
#   columns yaw -45 | 0 | +45 (yaw 0 = looking at the prop's front, the kit's +z); a 1 m capsule.
# <tag>-kitcmp.png: ours | the kit dump, same camera (pitch 40, yaw +45, ~12 m).
# <tag>-close.png: 9 m, pitch 35, yaw 0 | 135.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); TAG = arg('--tag', 'piece'); KIT = arg('--kit')
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
for m in bpy.data.materials:
    if ('glow' in m.name or m.name.startswith('hot')) and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = float(arg('--glow', '0.6'))
for o in kit: o.hide_render = True

bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.004))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', '#86b860'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
CP = [float(v) for v in arg('--cap', '0.6,1.6').split(',')]   # game (x, z) of the capsule
cap.location = Vector((CP[0], -CP[1], 0))
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.75
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 24
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)

TGT = Vector((0.0, 0.0, float(arg('--ty', '0.8'))))
def shoot(path, yaw_deg, pitch_deg=45, dist=18, target=None, w=800, h=600):
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
def row(arrs, gap=6):
    h = max(a.shape[0] for a in arrs); parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(arrs, gap=6):
    w = max(a.shape[1] for a in arrs); parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((gap, w, 4), np.float32))
        parts.append(a)
    return np.vstack(parts[::-1])

tmp = os.path.join(OUT, '_rv_' + TAG + '_' + ONLY); os.makedirs(tmp, exist_ok=True)
if ONLY in ('all', 'gamecam'):
    rows = []
    for pitch, dist in ((45, 18), (35, 10)):
        rows.append(row([load(shoot(os.path.join(tmp, 'g%d_%d.png' % (dist, y)), y, pitch, dist)) for y in (-45, 0, 45)]))
    save(col(rows), os.path.join(OUT, TAG + '-gamecam.png'))
if kit and ONLY in ('all', 'kitcmp'):
    RD = float(arg('--refdist', '12'))
    parts = [load(shoot(os.path.join(tmp, 'cmp.png'), 45, 40, RD, w=1000, h=750))]
    for o in asset: o.hide_render = True
    for o in kit: o.hide_render = False
    parts.append(load(shoot(os.path.join(tmp, 'cmpkit.png'), 45, 40, RD, w=1000, h=750)))
    save(row(parts), os.path.join(OUT, TAG + '-kitcmp.png'))
    for o in asset: o.hide_render = False
    for o in kit: o.hide_render = True
if ONLY in ('all', 'close'):
    CD = float(arg('--closedist', '9'))
    shots = [load(shoot(os.path.join(tmp, 'c%d.png' % y), y, 35, CD, w=900, h=700)) for y in (20, 135)]
    save(row(shots), os.path.join(OUT, TAG + '-close.png'))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
