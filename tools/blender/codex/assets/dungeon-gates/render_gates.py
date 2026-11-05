# Game-camera renders of a gate GLB (the brief's own views), with stand-ins for the kit dress so the framing reads:
#   blender --background --factory-startup --python render_gates.py -- --zone bamboo [--res 1600] [--close]
# Writes preview/<zone>-gamecam.png (yaw -45 | 0 | +45, 45 deg down, ~20 m, the game's 20 deg vertical FOV, a 1 m
# capsule at the interaction point) and preview/<zone>-kitcmp.png (our yaw-0 view beside refs/kit-<zone>-gate-game.png).
import bpy, math, os, sys
from mathutils import Vector
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
ZONE = arg('--zone', 'bamboo'); RES = int(arg('--res', '1600'))
OUT = os.path.join(HERE, 'preview'); os.makedirs(OUT, exist_ok=True)
print('RENDER pid', os.getpid())

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, 'public', 'models', f'gate-{ZONE}.glb'))
sc = bpy.context.scene
def L(x, h, z): return Vector((x, -z, h))
def mat(name, rgb, emit=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.85
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: m.blend_method = 'BLEND'
    return m
Z = {
    'bamboo': dict(ground=(0.2, 0.42, 0.12), seal=(0.84, 1.0, 0.6), mouth=(0.2, 2.5, 2.7), back=0.0,
                   lanterns=[(-2.55, 1.55), (2.55, 1.55)], ferns=[(-2.8, 0.9), (2.9, 1.0), (-1.2, 1.3), (3.4, 0.2)],
                   bamboo=[(-1.3, -2.6, 5, 7.5), (1.6, -3.0, 6, 7.0), (-3.6, -1.6, 3, 5.0), (3.7, -1.4, 3, 4.8)]),
    'maple': dict(ground=(0.36, 0.42, 0.16), seal=(1.0, 0.78, 0.52), mouth=(1.44, 2.5, 2.7), back=1.2,
                  posts=[(-2.6, 2.7), (2.6, 2.7)], jizo=[(-1.9, 2.1), (1.9, 2.1)],
                  piles=[(-3.0, 2.4, 0.8), (3.1, 2.5, 0.7), (-1.0, 2.8, 0.45), (3.6, 1.2, 0.6)],
                  mush=[(-2.3, 3.1), (2.5, 3.3), (1.2, 2.6)], trees=[(-3.7, -1.0)]),
    'tidepool': dict(ground=(0.82, 0.74, 0.55), seal=(0.56, 0.96, 1.0), mouth=(0.4, 2.8, 2.6), back=0.0,
                     lanterns=[(-2.55, 3.3), (2.55, 3.3)], kelp=[(-3.4, 1.2), (3.6, 1.1), (-1.9, 0.9), (2.1, 0.8), (-4.4, 1.0), (4.6, 0.9)],
                     rocks=[(-3.9, 0.6, 0.6), (4.1, 0.4, 0.52), (-2.6, 1.3, 0.35), (3.0, 1.5, 0.3), (-4.8, -0.4, 0.7), (5.0, -0.6, 0.63)],
                     spring=[(-2.5, 3.3, 1.0)]),
    'onsen': dict(ground=(0.84, 0.88, 0.96), seal=(0.75, 0.91, 1.0), mouth=(0.2, 2.5, 2.7), back=0.0,
                  lanterns=[(-2.6, 1.6), (2.6, 1.6)], firs=[(-4.2, -2.4, 5.4), (-2.6, -3.6, 6.2), (3.3, -3.0, 5.8), (4.7, -1.6, 4.6), (-5.0, -0.4, 4.2)],
                  bushes=[(-3.1, 1.2), (-4.0, 0.3), (2.6, 0.6)], spring=[(3.6, 2.9, 1.15)]),
}[ZONE]
GROUNDC, SEAL = Z['ground'], Z['seal']
# ground (slightly below the rim so the buried skirt hides)
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0)); g = bpy.context.object; g.data.materials.append(mat('ground', GROUNDC))
MOUTH = Z['mouth']
bpy.ops.mesh.primitive_plane_add(size=1, location=L(0, MOUTH[2] / 2, MOUTH[0])); c = bpy.context.object
c.rotation_euler = (math.pi / 2, 0, 0); c.scale = (MOUTH[1], MOUTH[2], 1); c.data.materials.append(mat('seal', SEAL, emit=0.6, alpha=0.35))
def cyl(loc, r, h, m, verts=12):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(loc.x, loc.y, loc.z + h / 2)); o = bpy.context.object; o.data.materials.append(m); return o
def cone(loc, r, h, m):
    bpy.ops.mesh.primitive_cone_add(radius1=r, depth=h, vertices=8, location=(loc.x, loc.y, loc.z + h / 2)); o = bpy.context.object; o.data.materials.append(m); return o
LAN = mat('lantern', (0.62, 0.6, 0.56)); FERN = mat('fern', (0.25, 0.55, 0.18)); BAM = mat('bamboo', (0.45, 0.7, 0.25)); HERO = mat('hero', (0.55, 0.32, 0.2))
RED = mat('red', (0.75, 0.15, 0.1)); PILE = mat('pile', (0.8, 0.3, 0.1)); WOOD = mat('wood', (0.3, 0.2, 0.14)); CAN = mat('canopy', (0.75, 0.12, 0.1))
for (x, z) in Z.get('lanterns', []):
    cyl(L(x, 0, z), 0.22, 1.1, LAN); cyl(L(x, 1.1, z), 0.34, 0.18, LAN, 6)
for (x, z) in Z.get('ferns', []): cone(L(x, 0, z), 0.35, 0.45, FERN)
for (x, z, n, hh) in Z.get('bamboo', []):
    for k in range(n):
        a = k * 2.4; r = 0.25 * math.sqrt(k)
        cyl(L(x + math.cos(a) * r, 0, z + math.sin(a) * r), 0.06, hh - 0.4 * k, BAM, 8)
for (x, z) in Z.get('posts', []):
    cyl(L(x, 0, z), 0.07, 1.85, WOOD, 8); bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=L(x * 0.87, 1.45, z)); bpy.context.object.data.materials.append(RED)
for (x, z) in Z.get('jizo', []):
    cyl(L(x, 0, z), 0.2, 0.55, LAN, 10); bpy.ops.mesh.primitive_uv_sphere_add(radius=0.17, location=L(x, 0.7, z)); bpy.context.object.data.materials.append(LAN)
for (x, z, R) in Z.get('piles', []):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=L(x, 0, z)); o = bpy.context.object; o.scale = (R, R, R * 0.42); o.data.materials.append(PILE)
for (x, z) in Z.get('mush', []): cone(L(x, 0, z), 0.16, 0.25, RED)
for (x, z) in Z.get('kelp', []): cone(L(x, 0, z), 0.18, 0.7, mat('kelp', (0.35, 0.5, 0.2)))
for (x, z, R) in Z.get('rocks', []):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=R, location=L(x, R * 0.45, z)); o = bpy.context.object; o.scale = (1, 1, 0.75); o.data.materials.append(mat('krock', (0.7, 0.64, 0.55)))
for (x, z, H) in Z.get('firs', []):
    cyl(L(x, 0, z), 0.2, 1.0, WOOD, 8); cone(L(x, 0.8, z), 1.3, H - 0.8, mat('fir', (0.16, 0.32, 0.26)))
for (x, z) in Z.get('bushes', []):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.45, location=L(x, 0.3, z)); bpy.context.object.data.materials.append(mat('bush', (0.2, 0.36, 0.26)))
for (x, z, R) in Z.get('spring', []):
    bpy.ops.mesh.primitive_cylinder_add(radius=R, depth=0.06, location=L(x, 0.04, z)); bpy.context.object.data.materials.append(mat('spring', (0.3, 0.6, 0.7)))
for (x, z) in Z.get('trees', []):
    cyl(L(x, 0, z), 0.35, 3.2, WOOD, 10); bpy.ops.mesh.primitive_uv_sphere_add(radius=2.2, location=L(x, 4.2, z)); bpy.context.object.data.materials.append(CAN)
bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=0.5, location=L(0, 0.5, 2.8)); h = bpy.context.object; h.data.materials.append(HERO)
for dz in (0.25, 0.75):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=L(0, dz, 2.8)); bpy.context.object.data.materials.append(HERO)
# light: a warm sun from the front-left, cool sky fill
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(6); sun.rotation_euler = (math.radians(42), 0, math.radians(-30))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.7, 0.8, 0.95, 1); bg.inputs['Strength'].default_value = 0.7
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng else 'BLENDER_EEVEE'
try: sc.eevee.taa_render_samples = 32
except Exception: pass
try: sc.eevee.use_shadows = True
except Exception: pass
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle = math.radians(20)
sc.render.resolution_x, sc.render.resolution_y = RES, RES * 9 // 16
BKZ = Z['back']
TARGET = L(0, 1.5, 0.4 + BKZ)
def shoot(name, yaw, pitch=45, dist=20.0, target=TARGET):
    yr, pr = math.radians(yaw), math.radians(pitch)
    d = Vector((math.sin(yr) * math.cos(pr), -math.cos(yr) * math.cos(pr), math.sin(pr)))
    cam.location = target + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
    return sc.render.filepath
def load(p):
    im = bpy.data.images.load(p); a = np.empty(im.size[0] * im.size[1] * 4, np.float32); im.pixels.foreach_get(a)
    return a.reshape(im.size[1], im.size[0], 4)
def save(arr, path):
    hgt, wid = arr.shape[:2]; im = bpy.data.images.new(os.path.basename(path), wid, hgt); im.pixels.foreach_set(arr.ravel())
    im.filepath_raw = path; im.file_format = 'PNG'; im.save()
def resize(a, wid, hgt):
    ys = (np.arange(hgt) * a.shape[0] / hgt).astype(int); xs = (np.arange(wid) * a.shape[1] / wid).astype(int); return a[ys][:, xs]
ps = [shoot(f'_{ZONE}_y{y}', y) for y in (-45, 0, 45)]
ims = [resize(load(p), RES // 2, RES * 9 // 32) for p in ps]
save(np.concatenate(ims, axis=1), os.path.join(OUT, f'{ZONE}-gamecam.png'))
big = load(ps[1]); save(big, os.path.join(OUT, f'{ZONE}-gamecam-front.png'))
# the kit comparison: the ref is a 1600x900 game shot, about 17 m from the gate
pk = shoot(f'_{ZONE}_kit', 0, 45, 17.0, L(0, 1.2, 0.8 + BKZ))
mine = resize(load(pk), 800, 450)
ref = os.path.join(HERE, 'refs', f'kit-{ZONE}-gate-game.png')
if os.path.exists(ref):
    save(np.concatenate([mine, resize(load(ref), 800, 450)], axis=1), os.path.join(OUT, f'{ZONE}-kitcmp.png'))
# a close look at the mouth (front, slightly down) for finish checks
c.hide_render = True     # (the close look shows the throat itself, no curtain)
pc = shoot(f'{ZONE}-close', 20, 30, 11.0, L(0, 1.8, 0.0 + BKZ))
for p in ps + [pk]: os.remove(p)
print('RENDER done')
