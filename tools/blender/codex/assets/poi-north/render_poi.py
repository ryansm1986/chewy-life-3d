# poi-north review renders: <name>-gamecam.png: 45 deg down at 18 m (top row) and 10 m (bottom row), yaw +45 | -45, ours (left
# pair) beside the kit dump (right pair), on the place's terrain.
#   blender --background --factory-startup --python render_poi.py -- --in <glb> --kit <obj> --out <png> --place <id> [--tx x --ty y --tz z] [--pier]
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
HERE = os.path.dirname(os.path.abspath(__file__))
print('RP pid', os.getpid())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
def imp_glb(p):
    b = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=p); return [o for o in bpy.data.objects if o not in b and o.type == 'MESH']
def imp_obj(p):
    b = set(bpy.data.objects); bpy.ops.wm.obj_import(filepath=p); obs = [o for o in bpy.data.objects if o not in b and o.type == 'MESH']
    mt = bpy.data.materials.new('kitvc'); mt.use_nodes = True; nt = mt.node_tree
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = 0.85
    vc = nt.nodes.new('ShaderNodeVertexColor'); nt.links.new(vc.outputs['Color'], bs.inputs['Base Color'])
    for o in obs:
        if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
        o.data.materials.clear(); o.data.materials.append(mt)
        for f in o.data.polygons: f.use_smooth = True
    return obs
ours = imp_glb(arg('--in')); kit = imp_obj(arg('--kit'))
for m in bpy.data.materials:
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = 0.5
# the terrain (in the kit call's frame)
D = json.load(open(os.path.join(HERE, 'kitdump', 'scene.json')))[arg('--place')]
FX, FY, FZ = D['F']['X'], D['F']['Y'], D['F']['Z']; R, gs, N_, hg = D['R'], D['gs'], D['n'], D['hg']
def H(x, z):
    fx = min(max((x - (FX - R)) / gs, 0), N_ - 1.001); fz = min(max((z - (FZ - R)) / gs, 0), N_ - 1.001); i, j = int(fx), int(fz); u, v = fx - i, fz - j
    return (hg[j][i] * (1 - u) + hg[j][i + 1] * u) * (1 - v) + (hg[j + 1][i] * (1 - u) + hg[j + 1][i + 1] * u) * v
PIER = '--pier' in argv
yaw = 1.9
def W(x, z):
    if PIER: return (168.55 + math.sin(yaw) * z + math.cos(yaw) * x, 54.35 + math.cos(yaw) * z - math.sin(yaw) * x)
    return (FX + x, FZ + z)
S = 12.0; M_ = 60; vs, fs = [], []
for j in range(M_ + 1):
    for i in range(M_ + 1):
        x, z = -S + 2 * S * i / M_, -S + 2 * S * j / M_; wx, wz = W(x, z)
        vs.append((x, -z, H(wx, wz) - (0 if PIER else FY)))
for j in range(M_):
    for i in range(M_):
        a = j * (M_ + 1) + i; fs.append((a, a + M_ + 1, a + M_ + 2, a + 1))
me = bpy.data.meshes.new('ground'); me.from_pydata(vs, [], fs); me.update(); g = bpy.data.objects.new('ground', me); scene.collection.objects.link(g)
for f in me.polygons: f.use_smooth = True
gm = bpy.data.materials.new('g'); gm.use_nodes = True; next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.25, 0.42, 0.2, 1); me.materials.append(gm)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); scene.collection.objects.link(sun); sun.data.energy = 3.0; sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.8
scene.render.engine = 'BLENDER_EEVEE_NEXT'; scene.view_settings.view_transform = 'Standard'; scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); scene.collection.objects.link(cam); scene.camera = cam; cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)
TGT = Vector((float(arg('--tx', '0')), -float(arg('--tz', '0')), float(arg('--ty', '0.8'))))
tmp = os.path.join(os.path.dirname(arg('--out')), '_t_' + os.path.basename(arg('--out')))
def shot(obs_on, obs_off, y, dist):
    for o in obs_on: o.hide_render = False
    for o in obs_off: o.hide_render = True
    a, p = math.radians(y), math.radians(45); d = Vector((math.sin(a) * math.cos(p), -math.cos(a) * math.cos(p), math.sin(p)))
    cam.location = TGT + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = 640, 480; scene.render.filepath = tmp + '.png'; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(tmp + '.png'); wd, ht = im.size; arr = np.empty(wd * ht * 4, np.float32); im.pixels.foreach_get(arr); bpy.data.images.remove(im)
    return arr.reshape(ht, wd, 4)
rows_ = []
for dist in (10, 18):   # (image rows run bottom-up: the 18 m row ends on top)
    rows_.append(np.hstack([shot(ours, kit, 45, dist), shot(ours, kit, -45, dist), shot(kit, ours, 45, dist), shot(kit, ours, -45, dist)]))
out = np.vstack(rows_); h, wd = out.shape[:2]
img = bpy.data.images.new('o', wd, h); img.pixels.foreach_set(out.astype(np.float32).ravel()); img.filepath_raw = arg('--out'); img.file_format = 'PNG'; img.save()
os.remove(tmp + '.png')
print('RP done')
