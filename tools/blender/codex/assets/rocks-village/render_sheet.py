# Review sheet for the village rocks: each variant at the game camera (pitch 35 deg, 20 m away, both 45 deg yaws),
# the kit rock beside each Blender rock, under a toon band like the game's. The detail tiles use a long lens (the same
# 20 m perspective, cropped to the rock); the last row is the game's own 20 deg field of view with all four on grass
# (kit cluster | Blender cluster), to judge readability at play distance.
#   blender --background --factory-startup --python render_sheet.py -- [--variants 0,1,2,3] [--out PNG] [--tile 448]
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = 'D:/projects/chewy-life-3d/public/models'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
VARS = [int(x) for x in arg('--variants', '0,1,2,3').split(',')]
OUT = arg('--out', os.path.join(HERE, 'preview', 'village-rock-sheet.png'))
TILE = int(arg('--tile', '448'))
CLUSTER = '--no-cluster' not in argv
TMP = os.path.join(HERE, 'preview', '_tiles'); os.makedirs(TMP, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng else 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = TILE
sc.render.film_transparent = True
try: sc.view_settings.view_transform = 'Standard'
except Exception: pass
try: sc.eevee.taa_render_samples = 32
except Exception: pass
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.62, 0.74, 0.86, 1); bg.inputs['Strength'].default_value = 0.12

def toon_mat(name, base=None):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    if base is None:
        vc = N.new('ShaderNodeVertexColor'); col = vc.outputs['Color']
    else:
        rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = base; col = rgb.outputs[0]
    dif = N.new('ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = N.new('ShaderNodeShaderToRGB'); L.new(dif.outputs[0], s2r.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'EASE'
    cr.elements[0].position = 0.12; cr.elements[0].color = (0.5, 0.43, 0.52, 1)
    cr.elements[1].position = 0.42; cr.elements[1].color = (1.08, 1.06, 1.0, 1)
    bw = N.new('ShaderNodeRGBToBW'); L.new(s2r.outputs['Color'], bw.inputs[0]); L.new(bw.outputs[0], ramp.inputs[0])
    m2 = N.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.blend_type = 'MULTIPLY'; m2.inputs['Factor'].default_value = 1
    L.new(col, m2.inputs[6]); L.new(ramp.outputs[0], m2.inputs[7])
    em = N.new('ShaderNodeEmission'); L.new(m2.outputs[2], em.inputs['Color']); em.inputs['Strength'].default_value = 1.0
    L.new(em.outputs[0], out.inputs[0])
    return mt

MAT = toon_mat('pv_rock')
def assign(ob, mat): ob.data.materials.clear(); ob.data.materials.append(mat)

def load_obj(path):
    V, C, F = [], [], []
    for line in open(path):
        if line.startswith('v '):
            a = list(map(float, line.split()[1:])); V.append((a[0], -a[2], a[1])); C.append(tuple(a[3:6]))
        elif line.startswith('f '):
            F.append(tuple(int(t.split('/')[0]) - 1 for t in line.split()[1:]))
    me = bpy.data.meshes.new('kit'); me.from_pydata(V, [], F); me.update()
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    vi = [0] * len(me.loops); me.loops.foreach_get('vertex_index', vi)
    cc = []
    for i in vi: cc.extend((*C[i], 1.0))
    ca.data.foreach_set('color', cc); me.color_attributes.active_color = ca
    me.shade_smooth()
    ob = bpy.data.objects.new('kit', me); sc.collection.objects.link(ob); assign(ob, MAT)
    return [ob]

def load_glb(path):
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in sc.objects if o not in before and o.type == 'MESH']
    for o in obs: assign(o, MAT)
    return obs

bpy.ops.mesh.primitive_circle_add(vertices=48, radius=30, fill_type='NGON'); gr = bpy.context.object
assign(gr, toon_mat('pv_ground', base=(0.42, 0.62, 0.3, 1)))
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.3, depth=1.0, location=(-1.4, 1.4, 0.5)); cap = bpy.context.object
assign(cap, toon_mat('pv_cap', base=(0.95, 0.62, 0.3, 1)))
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 2.2; sun_d.angle = math.radians(3)
sun = bpy.data.objects.new('sun', sun_d); sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(42), 0, math.radians(-38))
cam_d = bpy.data.cameras.new('cam'); cam_d.sensor_fit = 'VERTICAL'; cam_d.sensor_height = 24
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
txt_d = bpy.data.curves.new('label', 'FONT'); txt_d.size = 0.05
txt = bpy.data.objects.new('label', txt_d); sc.collection.objects.link(txt); txt.parent = cam
assign(txt, toon_mat('pv_txt', base=(0.15, 0.12, 0.2, 1))); txt.visible_shadow = False

def place_cam(yaw, fov_deg, dist=20.0, pitch=35.0, tz=0.25, tx=0.0, ty=0.0):
    p, y = math.radians(pitch), math.radians(yaw)
    tgt = Vector((tx, ty, tz))
    cam.location = tgt + Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p))) * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_d.lens = 12 / math.tan(math.radians(fov_deg) / 2)
    h = 2 * math.tan(math.radians(fov_deg) / 2)     # frame height at 1 m
    txt_d.size = 0.045 * h; txt.location = (-0.47 * h, 0.43 * h, -1.0)

def render(path): sc.render.filepath = path; bpy.ops.render.render(write_still=True)

DETAIL_FOV = 7.2     # deg: the same 20 m view, cropped to the rock (the game's own is 20 deg)
grid = []
for k in VARS:
    seed = k * 11 + 3
    kit = load_obj(os.path.join(HERE, 'kit', 'rock-%d.obj' % seed))
    mine = load_glb(os.path.join(MODELS, 'tree-village-rock-v%d.glb' % k))
    for o in kit + mine: o.location.z = -0.1     # the game sets rocks 0.1 m into the ground
    row = []
    for yw in (45, -45):
        for obs, lab, other in ((kit, 'kit rock(%d)' % seed, mine), (mine, 'blender v%d' % k, kit)):
            for o in obs: o.hide_render = False
            for o in other: o.hide_render = True
            txt_d.body = '%s  yaw %+d' % (lab, yw); place_cam(yw, DETAIL_FOV, tz=0.2)
            pth = os.path.join(TMP, 'r%d_%s_%d.png' % (k, lab[:3], yw)); render(pth); row.append(pth)
    grid.append(row)
    for o in kit + mine: bpy.data.objects.remove(o, do_unlink=True)

if CLUSTER:   # the game's 20 deg view: four kit rocks | four Blender rocks, scattered and rotated like the village
    import random
    rnd = random.Random(5)
    spots = [(-1.3, 0.6, 0.0, 1.0), (0.9, 1.1, 1.3, 1.25), (1.2, -1.0, 2.6, 0.8), (-0.9, -1.2, 4.0, 1.1)]
    def cluster(load):
        obs = []
        for k, (x, y, rz, s) in enumerate(spots):
            for o in load(k):
                o.location = (x, y, -0.1); o.rotation_euler = (0, 0, rz); o.scale = (s, s, s * 0.95); obs.append(o)
        return obs
    kitc = cluster(lambda k: load_obj(os.path.join(HERE, 'kit', 'rock-%d.obj' % (k * 11 + 3))))
    blc = cluster(lambda k: load_glb(os.path.join(MODELS, 'tree-village-rock-v%d.glb' % k)))
    cap.location = (-2.4, 2.2, 0.5)
    row = []
    for yw in (45, -45):
        for obs, lab, other in ((kitc, 'kit, game view', blc), (blc, 'blender, game view', kitc)):
            for o in obs: o.hide_render = False
            for o in other: o.hide_render = True
            txt_d.body = '%s  yaw %+d' % (lab, yw); place_cam(yw, 20.0, tz=0.2)
            pth = os.path.join(TMP, 'cl_%s_%d.png' % (lab[:3], yw)); render(pth); row.append(pth)
    grid.append(row)

rows = []
for row in grid:
    ims = []
    for p in row:
        im = bpy.data.images.load(p); w, h = im.size
        a = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(a); ims.append(a.reshape(h, w, 4)); bpy.data.images.remove(im)
    rows.append(np.concatenate(ims, axis=1))
big = np.concatenate(rows[::-1], axis=0)
sky = np.array([0.80, 0.88, 0.95, 1.0], dtype=np.float32)
al = big[..., 3:4]; big = big * al + sky * (1 - al); big[..., 3] = 1.0
H, W = big.shape[:2]
img = bpy.data.images.new('sheet', W, H, alpha=True)
img.pixels.foreach_set(big.ravel()); img.filepath_raw = OUT; img.file_format = 'PNG'; img.save()
print('SHEET', OUT, W, H)
