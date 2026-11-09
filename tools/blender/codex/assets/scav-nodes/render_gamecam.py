# The review sheets the brief asks for: preview/<model>-gamecam.png. Game camera (FOV 20 deg, 45 deg down) at 18 m and 10 m, both 45 deg yaws, each view:
# blender full | blender taken | kit full | kit taken, in a row across the screen, under a toon band like the game's.
#   blender --background --factory-startup --python render_gamecam.py -- [--models a,b,c]
import bpy, os, sys, math
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); MODELS = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', 'public', 'models'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
ALL = {'driftwood': 'g', 'riverStone': 'g', 'petalDrift': 'g', 'mulberry': 'g', 'culms': 'g', 'mossRubble': 'g', 'cocoons': 'g', 'shoots': 'g', 'branches': 'm', 'terrace': 'm', 'mapleLeaves': 'm', 'honeyLog': 'm', 'seaDrift': 's', 'seaStones': 's', 'netScraps': 's', 'seaGlass': 's', 'seaweed': 's', 'pine': 'w', 'sinter': 'w', 'iceCrystal': 'w', 'snowForage': 'w'}
GR = {'g': (0.32, 0.52, 0.16, 1), 'm': (0.58, 0.44, 0.17, 1), 's': (0.8, 0.68, 0.38, 1), 'w': (0.84, 0.9, 0.97, 1)}
LIST = [m for m in arg('--models', ','.join(ALL)).split(',') if m]
OUT = os.path.join(HERE, 'preview'); TMP = os.path.join(OUT, '_gc'); os.makedirs(TMP, exist_ok=True)
print('GC pid', os.getpid())
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1000, 330
try: sc.view_settings.view_transform = 'Standard'
except Exception: pass
try: sc.eevee.taa_render_samples = 16
except Exception: pass
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.62, 0.74, 0.86, 1); bg.inputs['Strength'].default_value = 0.12
def toon(name, base=None):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    if base is None: vc = N.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; col = vc.outputs['Color']
    else: rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = base; col = rgb.outputs[0]
    dif = N.new('ShaderNodeBsdfDiffuse'); s2r = N.new('ShaderNodeShaderToRGB'); L.new(dif.outputs[0], s2r.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'EASE'
    cr.elements[0].position = 0.12; cr.elements[0].color = (0.5, 0.43, 0.52, 1); cr.elements[1].position = 0.42; cr.elements[1].color = (1.08, 1.06, 1.0, 1)
    bw = N.new('ShaderNodeRGBToBW'); L.new(s2r.outputs['Color'], bw.inputs[0]); L.new(bw.outputs[0], ramp.inputs[0])
    m2 = N.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.blend_type = 'MULTIPLY'; m2.inputs['Factor'].default_value = 1
    L.new(col, m2.inputs[6]); L.new(ramp.outputs[0], m2.inputs[7])
    em = N.new('ShaderNodeEmission'); L.new(m2.outputs[2], em.inputs['Color']); L.new(em.outputs[0], out.inputs[0])
    return mt
MAT = toon('vc')
def assign(o, m): o.data.materials.clear(); o.data.materials.append(m)
def load_kit(path):
    Vs, C, F = [], [], []
    for line in open(path):
        if line.startswith('v '): a = list(map(float, line.split()[1:])); Vs.append((a[0], -a[2], a[1])); C.append(a[3:6])
        elif line.startswith('f '): F.append(tuple(int(t) - 1 for t in line.split()[1:]))
    me = bpy.data.meshes.new('kit'); me.from_pydata(Vs, [], F); me.update()
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); vi = [0] * len(me.loops); me.loops.foreach_get('vertex_index', vi)
    cc = []
    for i in vi: cc.extend((*C[i], 1.0))
    ca.data.foreach_set('color', cc); me.color_attributes.active_color = ca; me.shade_smooth()
    ob = bpy.data.objects.new('kit', me); sc.collection.objects.link(ob); assign(ob, MAT); return ob
def load_glb(path):
    before = set(sc.objects); bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in sc.objects if o not in before]
    m = [o for o in obs if o.type == 'MESH'][0]; m.data.color_attributes[0].name = 'Col'; assign(m, MAT)
    for o in obs:
        if o is not m: bpy.data.objects.remove(o, do_unlink=True)
    m.parent = None; m.location = (0, 0, 0); m.rotation_mode = 'XYZ'; m.rotation_euler = (0, 0, 0); return m
bpy.ops.mesh.primitive_circle_add(vertices=48, radius=60, fill_type='NGON'); gr = bpy.context.object
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 2.2; sun_d.angle = math.radians(3)
sun = bpy.data.objects.new('sun', sun_d); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(42), 0, math.radians(-38))
cam_d = bpy.data.cameras.new('cam'); cam_d.sensor_fit = 'VERTICAL'; cam_d.sensor_height = 24; cam_d.lens = 12 / math.tan(math.radians(10))
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
def shoot(objs, yaw, dist, path):
    y = math.radians(yaw); p = math.radians(45); fwd = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    right = Vector((math.cos(y), math.sin(y), 0)); sp = 1.9
    for i, o in enumerate(objs): o.location = right * ((i - 1.5) * sp)
    tgt = Vector((0, 0, 0.25)); cam.location = tgt + fwd * dist; cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(path); W, H = im.size; a = np.empty(W * H * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im); os.remove(path)
    return a.reshape(H, W, 4)
for m in LIST:
    assign(gr, toon('g' + m, GR[ALL[m]]))
    objs = [load_glb(os.path.join(MODELS, 'prop-scav-%s-full.glb' % m)), load_glb(os.path.join(MODELS, 'prop-scav-%s-taken.glb' % m)), load_kit(os.path.join(HERE, 'kitdump', 'kit-%s-full.obj' % m)), load_kit(os.path.join(HERE, 'kitdump', 'kit-%s-taken.obj' % m))]
    rows = [shoot(objs, yw, d, os.path.join(TMP, '%s.png' % m)) for d, yw in ((18, 45), (18, -45), (10, 45), (10, -45))]
    big = np.concatenate(rows[::-1], axis=0); H, W = big.shape[:2]
    img = bpy.data.images.new('s', W, H); img.pixels.foreach_set(big.ravel()); img.filepath_raw = os.path.join(OUT, m + '-gamecam.png'); img.file_format = 'PNG'; img.save(); bpy.data.images.remove(img)
    for o in objs:
        me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)
    print('GC', m, flush=True)
print('GC done')
