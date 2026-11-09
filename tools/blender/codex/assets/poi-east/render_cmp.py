# Game-camera review renders for poi-east (Blender, EEVEE, vertex colours):
#   blender --background --factory-startup --python render_cmp.py -- --place seaarch --k 0 --out preview/poi-seaarch-0-gamecam.png
#           [--ty 1.0] [--cx 0 --cz 0] [--d1 18 --d2 10] [--closeup] [--no-kit]
# Rows: 18 m | 10 m at 45 deg down. Columns: ours from the game's yaw (local +z is the camera side: yaw 0) | ours -45 | ours +45 | the
# kit from the game's yaw. The terrain under the place (kit/places.json) and the sea at y = 0 stand in for the world; a 1 m capsule.
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
PID, K = arg('--place'), int(arg('--k', '0'))
OUT = os.path.abspath(arg('--out', os.path.join(HERE, 'preview', 'poi-%s-%d-gamecam.png' % (PID, K))))
GLB = 'D:/projects/chewy-life-3d/public/models/poi-%s-%d.glb' % (PID, K)
KITOBJ = os.path.join(HERE, 'kit', '%s-%d.obj' % (PID, K))
print('RC pid', os.getpid())
os.makedirs(os.path.dirname(OUT), exist_ok=True)
PL = json.load(open(os.path.join(HERE, 'kit', 'places.json')))[PID]['kits'][K]

def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    return m

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=GLB)
asset = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
for m in bpy.data.materials:
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = 0.6
kit = []
if os.path.exists(KITOBJ) and '--no-kit' not in argv:
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=KITOBJ)
    kit = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
    vc = nt.nodes.new('ShaderNodeVertexColor'); nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    for o in kit:
        if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
        o.data.materials.clear(); o.data.materials.append(mt)
        for p in o.data.polygons: p.use_smooth = True
        o.hide_render = True
# the terrain and the sea
g = PL['grid']; n = g['n']; H = PL['h']
vs = [(g['x0'] + i * g['step'], -(g['x0'] + j * g['step']), H[j * n + i]) for j in range(n) for i in range(n)]
fs = [(j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i) for j in range(n - 1) for i in range(n - 1)]
me = bpy.data.meshes.new('terr'); me.from_pydata(vs, [], fs); me.update(); me.shade_smooth()
ter = bpy.data.objects.new('terr', me); scene.collection.objects.link(ter)
ter.data.materials.append(flat_mat('terr', '#8eb45e' if PID == 'bees' else '#d8c08c' if PID == 'cove' else '#a0b868'))
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, PL['seaY']))
sea = bpy.context.object; sea.data.materials.append(flat_mat('sea', '#3aa6c8', 0.4))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
CX, CZ = float(arg('--cx', '0')), float(arg('--cz', '0'))
cap.location = Vector((CX + 0.8, -(CZ + 2.2), max(0, 0)))
gi = int((CX - g['x0']) / g['step']); gj = int((CZ + 2.2 - g['x0']) / g['step']); cap.location.z = H[gj * n + gi]
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.75
scene.render.engine = 'BLENDER_EEVEE_NEXT'
try: scene.eevee.taa_render_samples = 16
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(float(arg('--fov', '32')))
TGT = Vector((CX, -CZ, float(arg('--ty', '0.8'))))
def shoot(path, yaw_deg, pitch_deg=45, dist=18, w=640, h=460):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = TGT + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(path); iw, ih = im.size
    a = np.empty(iw * ih * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    return a.reshape(ih, iw, 4)
tmp = OUT + '_tmp.png'
rows = []
d1, d2 = float(arg('--d1', '18')), float(arg('--d2', '10'))
for dist in (d1, d2):
    cells = []
    for y in (0, -45, 45):
        cells.append(shoot(tmp, y, 45, dist))
    if kit:
        for o in asset: o.hide_render = True
        for o in kit: o.hide_render = False
        cells.append(shoot(tmp, 0, 45, dist))
        for o in asset: o.hide_render = False
        for o in kit: o.hide_render = True
    gap = np.ones((cells[0].shape[0], 6, 4), np.float32)
    parts = []
    for i, c in enumerate(cells):
        if i: parts.append(gap)
        parts.append(c)
    rows.append(np.hstack(parts))
gapr = np.ones((6, rows[0].shape[1], 4), np.float32)
arr = np.vstack([rows[1], gapr, rows[0]])
h, w = arr.shape[:2]; img = bpy.data.images.new('rc_out', w, h)
img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.filepath_raw = OUT; img.file_format = 'PNG'; img.save()
if os.path.exists(tmp): os.remove(tmp)
print('RC wrote', OUT)
