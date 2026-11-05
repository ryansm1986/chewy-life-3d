# Review renders for the furn-big pieces, at the furnsheet's camera (src/tests/furnsheet.js: a 22 deg lens looking along
# the game direction (1, 0.95, 1.15) at the bounding sphere, distance r / sin(11 deg) * 1.02):
#   blender --background --factory-startup --python render_furn.py -- --in <glb> --out <png> [--res 800] [--view sheet|front|top|low]
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); RES = int(arg('--res', '800')); VIEW = arg('--view', 'sheet')
print('RF pid', os.getpid())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
asset = [o for o in scene.objects if o.type == 'MESH']
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in asset:
    for v in o.data.vertices:
        w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
c = (lo + hi) / 2; r = max((hi - lo).length / 2, 0.22)

def s2l(x): return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
gm = bpy.data.materials.new('rf_ground'); gm.use_nodes = True
b = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Base Color'].default_value = lin('#f3e3cc'); b.inputs['Roughness'].default_value = 0.95
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=max(0.8, r * 1.9), fill_type='NGON', location=(c.x, c.y, -0.001))
bpy.context.object.data.materials.append(gm)
sun = bpy.data.objects.new('rf_sun', bpy.data.lights.new('rf_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 1.6; sun.data.angle = math.radians(8)
kd = Vector((2.2, -3.0, 4.0)).normalized(); sun.rotation_euler = (-kd).to_track_quat('-Z', 'Y').to_euler()
rim = bpy.data.objects.new('rf_rim', bpy.data.lights.new('rf_rim', 'SUN')); scene.collection.objects.link(rim)
rim.data.energy = 0.5; rd = Vector((-4, 3, 3)).normalized(); rim.rotation_euler = (-rd).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('rf_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = lin('#fbf4ff'); bg.inputs['Strength'].default_value = 0.55
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng else 'BLENDER_EEVEE'
try: scene.eevee.taa_render_samples = 32
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rf_cam', bpy.data.cameras.new('rf_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle = math.radians(22)
dirs = {'sheet': (1, -1.15, 0.95), 'front': (0, -1, 0.35), 'top': (0.0001, -0.35, 1), 'low': (0.6, -1, 0.25), 'side': (1, -0.2, 0.4)}
d = Vector(dirs[VIEW]).normalized()
cam.location = c + d * (r / math.sin(math.radians(11)) * 1.02)
cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
scene.render.resolution_x = scene.render.resolution_y = RES
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('RF wrote', OUT)
