# poi-west review renders: the place's real ground and sea, ours beside the kit dump, at the game camera (vertical FOV 20 deg).
#   blender --background --factory-startup --python render_views.py -- --place lighthouse --glbs poi-lighthouse-0.glb[,..] --kits 0[,..] --fx -1 --fz 0.5 [--far 18 --near 10]
# preview/<place>-gamecam.png: 2 rows (18 m, 10 m at pitch 45), 4 columns: ours yaw +45 | kit yaw +45 | ours yaw -45 | kit yaw -45
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
PLACE = arg('--place'); FAR = float(arg('--far', '18')); NEAR = float(arg('--near', '10')); TAG = arg('--tag', PLACE)
GLBS = arg('--glbs', 'poi-%s-0.glb' % PLACE).split(','); KITS = [k for k in arg('--kits', '0').split(',') if k]
FX, FZ, FY = float(arg('--fx', '0')), float(arg('--fz', '0')), float(arg('--fy', '1.2'))
OUT = os.path.join(HERE, 'preview'); os.makedirs(OUT, exist_ok=True)
print('RV pid', os.getpid())
d = json.load(open(os.path.join(HERE, 'site', PLACE + '.json')))
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9, alpha=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    return m
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
# ---- the ground (from the game's own heights), painted by height; the sea
g = d['grid']; n = len(g); st = d['step']; N = d['N']; dec = 2
vs, fs = [], []; idx = {}
for k in range(0, n, dec):
    for i in range(0, n, dec):
        idx[(i, k)] = len(vs); vs.append(((i - N * 4) * st, -(k - N * 4) * st, g[k][i]))
for k in range(0, n - dec, dec):
    for i in range(0, n - dec, dec):
        fs.append((idx[(i, k)], idx[(i, k + dec)], idx[(i + dec, k + dec)], idx[(i + dec, k)]))
me = bpy.data.meshes.new('ground'); me.from_pydata(vs, [], fs); me.update(); me.shade_smooth()
gob = bpy.data.objects.new('ground', me); scene.collection.objects.link(gob)
sea = -d['y0']
attr = me.color_attributes.new('C', 'FLOAT_COLOR', 'POINT')
col = []
for v in vs:
    t = v[2] - sea
    c = lin('#e4cb94') if t < 0.5 else lin('#7fb35a')
    col.extend(c)
attr.data.foreach_set('color', col)
gm = bpy.data.materials.new('gm'); gm.use_nodes = True; b = next(x for x in gm.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'); vc = gm.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'C'; gm.node_tree.links.new(vc.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 1.0
me.materials.append(gm)
bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, sea - 0.002)); s_ = bpy.context.object; s_.data.materials.append(flat_mat('sea', '#3fb7c9', 0.3))
# ---- assets
def load_glb(p):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=p); return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
def load_obj(p):
    before = set(bpy.data.objects); bpy.ops.wm.obj_import(filepath=p); obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree; b = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
    vc = nt.nodes.new('ShaderNodeVertexColor'); nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    for o in obs:
        if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
        o.data.materials.clear(); o.data.materials.append(mt)
    return obs
ours = []
for f in GLBS: ours += load_glb(os.path.join(REPO, 'public', 'models', f))
kit = []
for k in KITS: kit += load_obj(os.path.join(HERE, 'site', 'kit-%s-%s.obj' % (PLACE, k)))
for m in bpy.data.materials:
    if 'glow' in m.name and m.use_nodes:
        for x in m.node_tree.nodes:
            if x.type == 'BSDF_PRINCIPLED': x.inputs['Emission Strength'].default_value = 0.5
# a 1 m capsule
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(FX + 0.3, -FZ - 0.4, 0)); cap = bpy.context.object; cap.location.z = max(sea, 0) + 0.5
cap.data.materials.append(flat_mat('cap', '#9a7ae0'))
# light
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.0; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.75
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 16
except Exception: pass
scene.view_settings.view_transform = 'Standard'; scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20) * 2
TGT = Vector((FX, -FZ, FY))
def shoot(path, yaw_deg, dist, pitch=45, w_=760, h_=520):
    yaw, p = math.radians(yaw_deg), math.radians(pitch)
    dv = Vector((math.sin(yaw) * math.cos(p), -math.cos(yaw) * math.cos(p), math.sin(p)))
    cam.location = TGT + dv * dist; cam.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = w_, h_; scene.render.filepath = path; bpy.ops.render.render(write_still=True); return path
def load(p):
    im = bpy.data.images.load(p); wd, ht = im.size; a = np.empty(wd * ht * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im); return a.reshape(ht, wd, 4)
def save(arr, p):
    ht, wd = arr.shape[:2]; img = bpy.data.images.new('o', wd, ht); img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.filepath_raw = p; img.file_format = 'PNG'; img.save(); bpy.data.images.remove(img)
tmp = os.path.join(OUT, '_t_' + TAG); os.makedirs(tmp, exist_ok=True)
def show(a, b):
    for o in ours: o.hide_render = not a
    for o in kit: o.hide_render = not b
rows = []
for dist in (FAR, NEAR):
    cells = []
    for yaw in (45, -45):
        show(True, False); cells.append(load(shoot(os.path.join(tmp, 'o%d%d.png' % (dist, yaw)), yaw, dist)))
        if kit: show(False, True); cells.append(load(shoot(os.path.join(tmp, 'k%d%d.png' % (dist, yaw)), yaw, dist)))
    rows.append(np.hstack(cells))
save(np.vstack(rows[::-1]), os.path.join(OUT, TAG + '-gamecam.png'))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done')
