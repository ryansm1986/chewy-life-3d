# Review sheet for one bush kind: every variant from the game camera's position (pitch 35 deg, 20 m away; a long lens
# crops the frame to the bush), both 45 deg yaws, both atlases applied and alpha tested (0.42, like the game), the kit
# bush beside each Blender bush, a toon band like the game's.
#   blender --background --factory-startup --python render_sheet.py -- --key hydrangea [--variants 0,1,2] [--close]
# Columns: kit +45 | Blender +45 | kit -45 | Blender -45; one row per variant. Foliage masses are hidden from the
# camera but cast shadows (they are shadow-only in the game). The kit OBJ has no normals (Blender derives them), so
# kit cards shade flatter than in the game; the Blender trees carry their own crown normals.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
KITD = os.path.join(HERE, 'kit')
COMMON = 'D:/projects/chewy-life-3d/tools/blender/work/codex/trees-common'
MODELS = 'D:/projects/chewy-life-3d/public/models'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
KEY = arg('--key', 'hydrangea')
VARS = [int(x) for x in arg('--variants', '0,1,2').split(',')]
CLOSE = '--close' in argv
OUT = arg('--out', os.path.join(HERE, 'preview', KEY + ('-close' if CLOSE else '-sheet') + '.png'))
TILE = int(arg('--tile', '512'))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
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
bg.inputs['Color'].default_value = (0.62, 0.74, 0.86, 1); bg.inputs["Strength"].default_value = 0.12

ATL = {}
for a in ('round', 'sakura'):
    ATL[a] = bpy.data.images.load(os.path.join(COMMON, 'atlas', 'village-%s.png' % a)); ATL[a].alpha_mode = 'STRAIGHT'

def toon_mat(name, tex=None, base=None):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree; N = nt.nodes; L = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial')
    if base is None:
        vc = N.new('ShaderNodeVertexColor'); col = vc.outputs['Color']
    else:
        rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = base; col = rgb.outputs[0]
    alpha = None
    if tex:
        ti = N.new('ShaderNodeTexImage'); ti.image = ATL[tex]; ti.interpolation = 'Linear'
        m = N.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = 'MULTIPLY'; m.inputs['Factor'].default_value = 1
        L.new(col, m.inputs[6]); L.new(ti.outputs['Color'], m.inputs[7]); col = m.outputs[2]
        gt = N.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.42
        L.new(ti.outputs['Alpha'], gt.inputs[0]); alpha = gt.outputs[0]
    # the game's cards do not flip their normal on the back face (noFlip): undo Blender's flip
    geo = N.new('ShaderNodeNewGeometry')
    sg = N.new('ShaderNodeMath'); sg.operation = 'MULTIPLY_ADD'; sg.inputs[1].default_value = -2; sg.inputs[2].default_value = 1
    L.new(geo.outputs['Backfacing'], sg.inputs[0])
    vs = N.new('ShaderNodeVectorMath'); vs.operation = 'SCALE'
    L.new(geo.outputs['Normal'], vs.inputs[0]); L.new(sg.outputs[0], vs.inputs['Scale'])
    dif = N.new('ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (1, 1, 1, 1)
    if tex or base is None: L.new(vs.outputs[0], dif.inputs['Normal'])
    s2r = N.new('ShaderNodeShaderToRGB'); L.new(dif.outputs[0], s2r.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'EASE'
    cr.elements[0].position = 0.12; cr.elements[0].color = (0.5, 0.43, 0.52, 1)
    cr.elements[1].position = 0.42; cr.elements[1].color = (1.08, 1.06, 1.0, 1)
    bw = N.new('ShaderNodeRGBToBW'); L.new(s2r.outputs['Color'], bw.inputs[0]); L.new(bw.outputs[0], ramp.inputs[0])
    m2 = N.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.blend_type = 'MULTIPLY'; m2.inputs['Factor'].default_value = 1
    L.new(col, m2.inputs[6]); L.new(ramp.outputs[0], m2.inputs[7])
    em = N.new('ShaderNodeEmission'); L.new(m2.outputs[2], em.inputs['Color']); em.inputs['Strength'].default_value = 1.0
    if alpha is not None:
        tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
        L.new(alpha, mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs[0])
        try: mt.surface_render_method = 'DITHERED'
        except Exception: mt.blend_method = 'HASHED'
    else:
        L.new(em.outputs[0], out.inputs[0])
    return mt

MAT_BARK = toon_mat('pv_bark'); MAT_CARD = {a: toon_mat('pv_card_' + a, tex=a) for a in ATL}

def assign(ob, mat):
    ob.data.materials.clear(); ob.data.materials.append(mat)

def load_obj(path):
    """the kit dump: 'v x y z r g b' (linear colours), 'vt u v' (game uv), 'o part' (y up)"""
    obs = []; cur = None; V = []; C = []; U = []; F = []; base = 0
    def flush():
        if cur is None or not F: return
        me = bpy.data.meshes.new(cur)
        me.from_pydata(V, [], [tuple(i - base for i in f) for f in F]); me.update()
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); uv = me.uv_layers.new(name='UVMap')
        vi = [0] * len(me.loops); me.loops.foreach_get('vertex_index', vi)
        cc = []; uu = []
        for i in vi: cc.extend((*C[i], 1.0)); uu.extend((U[i][0], 1.0 - U[i][1]) if U else (0, 0))
        ca.data.foreach_set('color', cc); uv.data.foreach_set('uv', uu)
        me.color_attributes.active_color = ca
        me.shade_smooth()
        ob = bpy.data.objects.new(cur, me); sc.collection.objects.link(ob); obs.append(ob)
    for line in open(path):
        if line.startswith('o '):
            flush(); base += len(V); cur = line[2:].strip(); V, C, U, F = [], [], [], []
        elif line.startswith('v '):
            a = list(map(float, line.split()[1:])); V.append((a[0], -a[2], a[1])); C.append(tuple(a[3:6]) if len(a) >= 6 else (1, 1, 1))
        elif line.startswith('vt '):
            a = list(map(float, line.split()[1:])); U.append((a[0], a[1]))
        elif line.startswith('f '):
            F.append(tuple(int(t.split('/')[0]) - 1 for t in line.split()[1:]))
    flush()
    return obs

def setup(obs):
    for ob in obs:
        nm = ob.name.split('.')[0]
        if nm.startswith('foliage'):
            assign(ob, MAT_BARK); ob.visible_camera = False
        elif nm.startswith('cards'):
            assign(ob, MAT_CARD[nm.split('_')[1]]); ob.visible_shadow = False  # the game's bush cards cast no shadow
        else:
            assign(ob, MAT_BARK); ob.visible_shadow = False   # berries: no shadow either

def load_glb(path):
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in sc.objects if o not in before and o.type == 'MESH']
    for o in obs:
        mn = o.data.materials[0].name if o.data.materials else o.name
        o.name = mn.split('.')[0]
    for o in list(sc.objects):
        if o not in before and o.type != 'MESH': o.select_set(False)
    return obs

# ground, sun, a 1 m scale capsule
bpy.ops.mesh.primitive_circle_add(vertices=48, radius=16, fill_type='NGON'); gr = bpy.context.object
assign(gr, toon_mat('pv_ground', base=(0.42, 0.62, 0.3, 1)))
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.15, depth=1.0, location=(-1.55, 0.0, 0.5)); cap = bpy.context.object
assign(cap, toon_mat('pv_cap', base=(0.95, 0.62, 0.3, 1)))
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 2.2; sun_d.angle = math.radians(3)
sun = bpy.data.objects.new('sun', sun_d); sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(42), 0, math.radians(-38))
cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 210 if not CLOSE else 300; cam_d.sensor_fit = 'HORIZONTAL'
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
txt_d = bpy.data.curves.new('label', 'FONT'); txt_d.size = 0.5
txt = bpy.data.objects.new('label', txt_d); sc.collection.objects.link(txt); txt.parent = cam
txt.location = (-1.6 if not CLOSE else -1.12, 1.42 if not CLOSE else 1.0, -20); txt_d.size = 0.15 if not CLOSE else 0.1; assign(txt, toon_mat('pv_txt', base=(0.15, 0.12, 0.2, 1)))
txt.visible_shadow = False

def place_cam(yaw, dist=20.0, pitch=35.0, tz=0.45):
    p, y = math.radians(pitch), math.radians(yaw)
    tgt = Vector((0, 0, tz))
    pos = tgt + Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p))) * dist
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()

def render(path):
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

def tiles_for(obs, label, yaws, tag):
    for o in obs: o.hide_render = False
    out = []
    for yw in yaws:
        txt_d.body = '%s  yaw %+d' % (label, yw)
        place_cam(yw, 20.0)
        pth = os.path.join(TMP, '%s_%s_%d.png' % (KEY, tag, yw)); render(pth); out.append(pth)
    for o in obs: o.hide_render = True
    return out

grid = []
for k in VARS:
    kit = load_obj(os.path.join(KITD, 'village-bush-%s-%d.obj' % (KEY, k))); setup(kit)
    for o in kit: o.hide_render = True
    mine = load_glb(os.path.join(MODELS, 'tree-village-bush-%s-v%d.glb' % (KEY, k))); setup(mine)
    for o in mine: o.hide_render = True
    if CLOSE:
        row = tiles_for(mine, 'blender v%d' % k, [45, -45], 'b%d' % k)
    else:
        a = tiles_for(kit, 'kit %d' % k, [45, -45], 'k%d' % k); b = tiles_for(mine, 'blender v%d' % k, [45, -45], 'b%d' % k)
        row = [a[0], b[0], a[1], b[1]]
    grid.append(row)
    for o in kit + mine: bpy.data.objects.remove(o, do_unlink=True)

# assemble
rows = []
for row in grid:
    ims = []
    for p in row:
        im = bpy.data.images.load(p); w, h = im.size
        a = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(a); ims.append(a.reshape(h, w, 4)); bpy.data.images.remove(im)
    rows.append(np.concatenate(ims, axis=1))
big = np.concatenate(rows[::-1], axis=0)  # Blender images are bottom-up: first variant on top
sky = np.array([0.80, 0.88, 0.95, 1.0], dtype=np.float32)
al = big[..., 3:4]
big = big * al + sky * (1 - al); big[..., 3] = 1.0
H, W = big.shape[:2]
img = bpy.data.images.new('sheet', W, H, alpha=True)
img.pixels.foreach_set(big.ravel()); img.filepath_raw = OUT; img.file_format = 'PNG'; img.save()
print('SHEET', OUT, W, H)
