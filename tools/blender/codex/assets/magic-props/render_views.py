# Review renders for the magic props (beyond the standard preview.py):
#   blender --background --factory-startup --python render_views.py -- --in <glb> --out <dir> --piece <name>
#           [--kit <kit stand-in glb>] [--scale 0.78] [--disc r,z] [--dist 12] [--glow 0|1]
# Writes <dir>/<piece>-gamecam.png (45 deg down from --dist m at yaw -45 | 0 | +45, beside a 1 m capsule, the asset at
# --scale: its in-game size), <dir>/<piece>-kitcmp.png (the kit stand-in | ours, same camera, same scale),
# <dir>/<piece>-close.png (a closer game-camera view). --disc adds the portal's swirl disc stand-in (radius r at height z,
# before scaling). Objects named flame* are shown lit (--glow 1, default) or hidden (--glow 0, plus a -unlit render).
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); PIECE = arg('--piece', 'piece')
KIT = arg('--kit'); SCALE = float(arg('--scale', '1')); DISC = arg('--disc')
DIST = float(arg('--dist', '12')); RES = int(arg('--res', '720'))
os.makedirs(OUT, exist_ok=True)
print('RV pid', os.getpid())

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = lin(emit); b.inputs['Emission Strength'].default_value = 1.2
    return m

def load_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in obs if o.parent is None]
    for r in roots: r.scale = (SCALE, SCALE, SCALE)
    bpy.context.view_layer.update()
    return obs
ours = load_glb(SRC)
kit = load_glb(KIT) if KIT else []
def bounds(obs):
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in obs:
        if o.type != 'MESH': continue
        for v in o.data.vertices:
            w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi
lo, hi = bounds(ours)
centre = (lo + hi) / 2
flames = [o for o in ours if o.name.startswith('flame')]
GLOW = arg('--glow', '1') == '1'
# (the game draws a glow material unlit; here: a soft emission so it reads as lit, never a white-out)
for o in flames:
    for s in o.material_slots:
        m = s.material
        if m and m.use_nodes:
            b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            b.inputs['Emission Strength'].default_value = 1.0
discs = []
def add_disc(obs_list, xoff=0.0):
    if not DISC: return
    r, z = [float(v) for v in DISC.split(',')]
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=r * SCALE, fill_type='NGON', location=(xoff, 0, z * SCALE), rotation=(math.pi / 2, 0, 0))
    d = bpy.context.object; d.data.materials.append(flat_mat('rv_disc', '#b8a8f0', emit='#9c8ce0')); discs.append(d)
add_disc(ours)

# stage: ground, capsule, sun + sky
bpy.ops.mesh.primitive_plane_add(size=60, location=(centre.x, centre.y, -0.003))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', '#86b86a'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
cap.location = Vector((hi.x + 0.5, lo.y - 0.3, 0))
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 2.6; sun.data.angle = math.radians(12); sun.rotation_euler = (math.radians(42), 0, math.radians(-30))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.75, 0.82, 0.95, 1); bg.inputs['Strength'].default_value = 0.65
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 32
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam

def shoot(path, yaw_deg, pitch_deg=45, dist=DIST, lens=50, target=None, w=RES, h=RES):
    t = target if target is not None else Vector((centre.x, centre.y, (lo.z + hi.z) * 0.42))
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = t + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
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
def show(obs, on):
    for o in obs: o.hide_render = not on

tmp = os.path.join(OUT, '_rv'); os.makedirs(tmp, exist_ok=True)
show(kit, False)
shots = [shoot(os.path.join(tmp, 'g%d.png' % i), y) for i, y in enumerate((-45, 0, 45))]
save(row([load(p) for p in shots]), os.path.join(OUT, PIECE + '-gamecam.png'))
# a closer game-camera view, lit and (with a flame) unlit
cl = [shoot(os.path.join(tmp, 'c0.png'), -20, 45, dist=DIST * 0.42, w=900, h=900)]
if flames:
    show(flames, False); cl.append(shoot(os.path.join(tmp, 'c1.png'), -20, 45, dist=DIST * 0.42, w=900, h=900)); show(flames, True)
save(row([load(p) for p in cl]), os.path.join(OUT, PIECE + '-close.png'))
if kit:
    cap.hide_render = True
    a = shoot(os.path.join(tmp, 'k1.png'), 0, 45, dist=DIST * 0.5)
    show(ours, False); show(discs, False); show(kit, True)
    if DISC:
        r, z = [float(v) for v in DISC.split(',')]
        bpy.ops.mesh.primitive_circle_add(vertices=48, radius=r * SCALE, fill_type='NGON', location=(0, 0, z * SCALE), rotation=(math.pi / 2, 0, 0))
        bpy.context.object.data.materials.append(bpy.data.materials['rv_disc'])
    b = shoot(os.path.join(tmp, 'k0.png'), 0, 45, dist=DIST * 0.5)
    c = shoot(os.path.join(tmp, 'k2.png'), 0, 4, dist=DIST * 0.5, target=Vector((0, 0, hi.z * 0.5)))
    show(kit, False); show(ours, True)
    d = shoot(os.path.join(tmp, 'k3.png'), 0, 4, dist=DIST * 0.5, target=Vector((0, 0, hi.z * 0.5)))
    save(np.vstack([row([load(c), load(d)]), np.ones((6, RES * 2 + 6, 4), np.float32), row([load(b), load(a)])]),
         os.path.join(OUT, PIECE + '-kitcmp.png'))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
