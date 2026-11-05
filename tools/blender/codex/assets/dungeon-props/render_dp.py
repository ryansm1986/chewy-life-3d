# Review renders for the dungeon props.
#   blender --background --factory-startup --python render_dp.py -- --mode lineup --glbs a.glb,b.glb --out lineup.png
#   blender --background --factory-startup --python render_dp.py -- --mode chest --glbs chest-wood.glb,chest-gold.glb --out chest-open.png
#   blender --background --factory-startup --python render_dp.py -- --mode close --glbs x.glb --out close.png [--yaw 45]
# lineup: every piece in a row at the game camera (45 deg down, ~12 m) at yaw -45 and +45 (stacked), a 1 m capsule first.
# chest:  each chest shut and with the lid opened 1.9 rad (the game's makeChest), 45 deg down.
# close:  one piece, 45 deg down, yaws -45 | 0 | +45, framed close (for detail review).
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
MODE = arg('--mode', 'lineup'); GLBS = [os.path.abspath(g) for g in arg('--glbs').split(',')]
OUT = os.path.abspath(arg('--out')); RES = int(arg('--res', '1400'))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
print('RD pid', os.getpid())

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    return m

def load_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in obs if o.parent is None]
    return obs, roots

def bounds(obs):
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in obs:
        if o.type != 'MESH': continue
        for v in o.data.vertices:
            w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi

# stage: a dungeon-stone floor, sun + fill, sky
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.002))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rd_ground', '#7d776c'))
sun = bpy.data.objects.new('rd_sun', bpy.data.lights.new('rd_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 2.6; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(45), 0, math.radians(-35))
fill = bpy.data.objects.new('rd_fill', bpy.data.lights.new('rd_fill', 'SUN')); scene.collection.objects.link(fill)
fill.data.energy = 0.5; fill.rotation_euler = (math.radians(60), 0, math.radians(160))
world = bpy.data.worlds.new('rd_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.72, 0.78, 0.9, 1); bg.inputs['Strength'].default_value = 0.55
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 32
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rd_cam', bpy.data.cameras.new('rd_cam')); scene.collection.objects.link(cam); scene.camera = cam

def capsule(loc):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); c = bpy.context.object
    for dz in (0.28, -0.28):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
        s.select_set(True); c.select_set(True); bpy.context.view_layer.objects.active = c; bpy.ops.object.join()
    bpy.ops.object.shade_smooth(); c.data.materials.append(flat_mat('rd_cap', '#9a7ae0')); c.location = loc
    return c

def shoot(path, yaw_deg, target, dist, lens, w, h, pitch_deg=45):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = target + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens; scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    return path

def load(p):
    im = bpy.data.images.load(p); w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    return a.reshape(h, w, 4)
def save(arr, p):
    h, w = arr.shape[:2]; img = bpy.data.images.new('rd_out', w, h)
    img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
def stack(arrs, axis, gap=6):
    parts = []
    for i, a in enumerate(arrs):
        if i:
            shp = list(a.shape); shp[axis] = gap; parts.append(np.ones(shp, np.float32))
        parts.append(a)
    return np.concatenate(parts, axis=axis)
tmp = OUT + '_tmp'; os.makedirs(tmp, exist_ok=True)

if MODE == 'lineup':
    items = [load_glb(g) for g in GLBS]
    base = {r.name: r.location.copy() for it in items for r in it[1]}
    cap = capsule(Vector((0, 0, 0)))
    SP = 1.3; n = len(items) + 1
    shots = []
    for yi, yaw in enumerate((-45, 45)):
        right = Vector((math.cos(math.radians(yaw)), math.sin(math.radians(yaw)), 0))
        for i in range(n):
            off = right * ((i - (n - 1) / 2) * SP)
            if i == 0: cap.location = off
            else:
                for r in items[i - 1][1]: r.location = off + base[r.name]
        width = n * SP + 0.6
        lens = 36 * 12 / (width * 1.04)
        shots.append(shoot(os.path.join(tmp, 'l%d.png' % yi), yaw, Vector((0, 0, 0.55)), 12, lens, RES, int(RES * 0.36)))
    save(stack([load(p) for p in shots], 0), OUT)
elif MODE == 'chest':
    items = []
    for gi, g in enumerate(GLBS):
        for k, opened in enumerate((False, True)):
            obs, roots = load_glb(g)
            if opened:
                lid = next(o for o in obs if o.name.startswith('lid'))
                lid.rotation_mode = 'XYZ'; lid.rotation_euler = (lid.rotation_euler[0] - 1.9, lid.rotation_euler[1], lid.rotation_euler[2])
            items.append((roots, {r.name: r.location.copy() for r in roots}))
    n = len(items); SP = 1.3; shots = []
    for i, yaw in enumerate((-35, 35)):
        right = Vector((math.cos(math.radians(yaw)), math.sin(math.radians(yaw)), 0))
        for j, (roots, base) in enumerate(items):
            for r in roots: r.location = right * ((j - (n - 1) / 2) * SP) + base[r.name]
        shots.append(shoot(os.path.join(tmp, 'c%d.png' % i), yaw, Vector((0, 0, 0.4)), 7, 36 * 7 / ((n * SP + 0.3) * 1.04), RES, int(RES * 0.36)))
    save(stack([load(p) for p in shots], 0), OUT)
else:  # close
    obs, roots = load_glb(GLBS[0])
    lo, hi = bounds(obs); c = (lo + hi) / 2; R = max((hi - lo).length / 2, 0.5)
    yaws = [float(y) for y in arg('--yaws', '-45,0,45').split(',')]
    shots = [shoot(os.path.join(tmp, 'k%d.png' % i), y, Vector((c.x, c.y, c.z * 0.9)), R * 4.2, 50, 640, 640, pitch_deg=float(arg('--pitch', '45'))) for i, y in enumerate(yaws)]
    save(stack([load(p) for p in shots], 1), OUT)
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RD done', OUT)
