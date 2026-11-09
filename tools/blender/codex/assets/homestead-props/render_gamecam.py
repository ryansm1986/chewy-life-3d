# preview/<name>-gamecam.png for every GLB: the game camera (vertical FOV 20 deg, 45 deg down) at 18 m and 10 m, both 45 deg yaws, kit | ours.
#   blender --background --factory-startup --python render_gamecam.py -- [--only substring]
import bpy, os, sys, math
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', 'public', 'models'))
OUT = os.path.join(HERE, 'preview'); TMP = os.path.join(OUT, '_tmp'); os.makedirs(TMP, exist_ok=True)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = argv[argv.index('--only') + 1] if '--only' in argv else ''
print('GC pid', os.getpid())
C = ['turnip', 'carrot', 'cabbage', 'daikon', 'strawberry', 'rice', 'pumpkin', 'melon']
F = ['crucian', 'koi', 'goldKoi', 'moonKoi', 'ayu', 'trout', 'char', 'loach', 'rainbowTrout', 'salmon', 'seaBream', 'mackerel', 'flounder', 'octopus', 'pufferfish']
L = [('prop-crop-%s-%s' % (c, s), 'crop-%s-%s' % (c, s), 0.15) for c in C for s in ('young', 'ripe')] + [('prop-fish-' + f, 'fish-' + f, 0.1) for f in F] + \
    [('prop-rod-1', 'rod-1', 0.0), ('prop-rod-2', 'rod-2', 0.0), ('prop-tool-hoe', 'tool-hoe', 0.0), ('prop-tool-seedBag', 'tool-seedBag', 0.0), ('prop-campfire', 'campfire', 0.5), ('poi-seedStall-0', 'seedStall', 0.9)]
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def flat(name, h):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); h = h.lstrip('#')
    b.inputs['Base Color'].default_value = tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,); b.inputs['Roughness'].default_value = 0.9
    return m
def scene_base():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.004)); bpy.context.object.data.materials.append(flat('g', '#86c060'))
    sun = bpy.data.objects.new('s', bpy.data.lights.new('s', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 3.2; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.75
    ids = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in ids else 'BLENDER_EEVEE'
    try: sc.eevee.taa_render_samples = 12
    except Exception: pass
    sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'
    sc.render.resolution_x, sc.render.resolution_y = 480, 300
    cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)
    return sc, cam
def load(path):
    before = set(bpy.data.objects)
    if path.endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        mt = bpy.data.materials.new('kit'); mt.use_nodes = True; nt = mt.node_tree
        b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
        vc = nt.nodes.new('ShaderNodeVertexColor'); nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
        for o in obs:
            if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
            o.data.materials.clear(); o.data.materials.append(mt)
            for p in o.data.polygons: p.use_smooth = True
    else:
        bpy.ops.import_scene.gltf(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    return obs
def arr(p):
    im = bpy.data.images.load(p); w, h = im.size; a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im); return a.reshape(h, w, 4)
def save(a, p):
    h, w = a.shape[:2]; im = bpy.data.images.new('o', w, h); im.pixels.foreach_set(a.astype(np.float32).ravel()); im.filepath_raw = p; im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)
for name, kit, ty in L:
    if ONLY and ONLY not in name: continue
    sc, cam = scene_base()
    ours = load(os.path.join(MODELS, name + '.glb')); theirs = load(os.path.join(HERE, 'kit', kit + '.obj'))
    rows = []
    tgt = Vector((0, 0, ty))
    # a 1 m capsule for scale, by the piece
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(1.5, -1.1, 0.5)); cap = bpy.context.object; cap.scale = (1, 1, 2.2); cap.data.materials.append(flat('cap', '#9a7ae0'))
    for dist in (18, 10):
        row = []
        for label, show, hide in (('kit', theirs, ours), ('ours', ours, theirs)):
            for o in show: o.hide_render = False
            for o in hide: o.hide_render = True
            for yaw in (-45, 45):
                y, p = math.radians(yaw), math.radians(45)
                d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
                cam.location = tgt + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
                f = os.path.join(TMP, 't.png'); sc.render.filepath = f; bpy.ops.render.render(write_still=True)
                row.append(arr(f))
        rows.append(np.hstack(row))
    save(np.vstack(rows[::-1]), os.path.join(OUT, kit + '-gamecam.png'))
    print('GC', kit)
for f in os.listdir(TMP): os.remove(os.path.join(TMP, f))
os.rmdir(TMP)
print('GC done')
