"""Review renders of the Shih Tzu Knight glb (same lights and scales every round).

    blender --background --factory-startup --python render_views.py -- [--in model.glb] [--only name,name] [--out dir]
           [--toon] [--extra other.glb@x]   (--extra loads a second glb shifted by x metres, for the cast lineup)

Writes into preview/: head_front|34|side|back|top.png (ortho, 1000 px = 1.20 m, centre z 0.96 m),
body_front|34|side|back.png (ortho, 1000 px = 1.65 m, centre z 0.70 m), portrait.png (3/4 head and shoulders,
studio light), g45_p / g45_m (45 deg down, yaw +45 / -45, 135 mm lens) -> game-45.png, g45h_p / g45h_m (close head)
-> game-45-head.png, toon-check.png (the game's hard light/shade band: smoothstep(-0.04, 0.34, N.L), sun 50 deg up at
yaw 0 / +-0.6), scales.json.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
def rel(p): return p if os.path.isabs(p) else os.path.join(ROOT, p)
MODEL = rel(arg('--in', 'D:/projects/chewy-life-3d/public/models/shihtzu-toy.glb'))
OUT = rel(arg('--out', 'preview')); os.makedirs(OUT, exist_ok=True)
only = set(arg('--only').split(',')) if arg('--only') else None
TOON = '--toon' in argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=MODEL)
if arg('--extra'):
    path, dx = arg('--extra').split('@'); before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in set(bpy.data.objects) - before:
        if o.parent is None: o.location.x += float(dx)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 48
except Exception: pass
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'
sc.render.film_transparent = True
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.60, .55, .50, 1)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
sc.use_nodes = True; nt = sc.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); ov = nt.nodes.new('CompositorNodeAlphaOver')
ov.inputs[1].default_value = (.93, .90, .86, 1); nt.links.new(rl.outputs['Image'], ov.inputs[2])
cp = nt.nodes.new('CompositorNodeComposite'); nt.links.new(ov.outputs[0], cp.inputs[0])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.clip_start = .05; cam.data.clip_end = 50
def light(name, rel_, power, size, color):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel_; return o
L = [light('key', (-2.2, 1.9, 1.0), 175, 3.0, (1, .92, .86)), light('fill', (2.4, -.4, .6), 85, 3.0, (.88, .92, 1)),
     light('rim', (.8, 2.6, -2.8), 120, 2.5, (1, .88, .76))]
for o in L:
    tgt = Vector((0, 0, -3.2)); o.rotation_euler = (tgt - o.location).to_track_quat('-Z', 'Y').to_euler()
def aim(loc, target, ortho=None, lens=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
def want(name): return only is None or name in only
def shot(name, rx, ry, path=None):
    sc.render.resolution_x = rx; sc.render.resolution_y = ry; sc.render.resolution_percentage = 100
    sc.render.filepath = path or os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
    return sc.render.filepath
def pair(a, b, out, w, h):
    A = bpy.data.images.load(a); B = bpy.data.images.load(b)
    pa = np.empty(w * h * 4, np.float32); pb = np.empty_like(pa); A.pixels.foreach_get(pa); B.pixels.foreach_get(pb)
    c = np.ones((h, 2 * w + 10, 4), np.float32); c[:, :w] = pa.reshape(h, w, 4); c[:, w + 10:] = pb.reshape(h, w, 4)
    im = bpy.data.images.new(os.path.basename(out), 2 * w + 10, h); im.pixels.foreach_set(c.ravel()); im.filepath_raw = out
    im.file_format = 'PNG'; im.save()
def view_dir(name):
    return {'front': (0, -1, 0), '34': (.64, -.77, 0), 'q25': (.4226, -.9063, 0), 'side': (1, 0, 0), 'back': (0, 1, 0),
            'top': (0, -.0001, 1), 'sideR': (-1, 0, 0), '34R': (-.64, -.77, 0)}[name]
scales = {}
def game_dir(yaw, pitch=45):
    e = math.radians(pitch); y = math.radians(yaw)
    return Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
HEAD_FRAME = 1.20; HC = Vector((0, -.04, .96))
BODY_FRAME = 1.65; BC = Vector((0, 0, .70))
if not TOON:
    for n in ('front', 'q25', '34', 'side', 'back', 'top', 'sideR'):
        if not want('head_' + n): continue
        d = Vector(view_dir(n)).normalized(); aim(HC + d * 4, HC, ortho=HEAD_FRAME); shot('head_' + n, 1000, 1000)
        scales['head_' + n] = {'px_per_m': 1000 / HEAD_FRAME, 'centre_m': list(HC), 'res': [1000, 1000]}
    for n in ('front', '34', 'side', 'back', '34R'):
        if not want('body_' + n): continue
        d = Vector(view_dir(n)).normalized(); aim(BC + d * 6, BC, ortho=BODY_FRAME); shot('body_' + n, 900, 1000)
        scales['body_' + n] = {'px_per_m': 1000 / BODY_FRAME, 'centre_m': list(BC), 'res': [900, 1000]}
    if want('portrait'):
        aim((1.52, -2.75, 1.38), (0, -.05, .93), ortho=1.25); shot('portrait', 1100, 1100, os.path.join(ROOT, 'portrait.png'))
    if want('g45'):
        t = Vector((0, 0, .70))
        aim(t + game_dir(45) * 7.0, t, lens=135); shot('g45_p', 700, 700)
        aim(t + game_dir(-45) * 7.0, t, lens=135); shot('g45_m', 700, 700)
        pair(os.path.join(OUT, 'g45_p.png'), os.path.join(OUT, 'g45_m.png'), os.path.join(OUT, 'game-45.png'), 700, 700)
    if want('g45h'):
        t = Vector((0, -.04, .96))
        aim(t + game_dir(45) * 4.0, t, ortho=1.30); shot('g45h_p', 700, 700)
        aim(t + game_dir(-45) * 4.0, t, ortho=1.30); shot('g45h_m', 700, 700)
        pair(os.path.join(OUT, 'g45h_p.png'), os.path.join(OUT, 'g45h_m.png'), os.path.join(OUT, 'game-45-head.png'), 700, 700)
    if want('cast'):
        t = Vector((-.55, 0, .66)); aim(t + Vector((0, -1, .06)).normalized() * 8, t, ortho=2.3); shot('cast_front', 1200, 900)
        aim(t + game_dir(30, 30) * 9, t, ortho=2.5); shot('cast_game', 1200, 900)
    with open(os.path.join(OUT, 'scales.json'), 'w') as f: json.dump(scales, f, indent=1)
else:
    img = next(n.image for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    def toon_materials(Lv):
        m = bpy.data.materials.new('toon_check'); m.use_nodes = True; nt_ = m.node_tree; nt_.nodes.clear(); N = nt_.nodes.new; Lk = nt_.links.new
        tx = N('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
        geo = N('ShaderNodeNewGeometry'); lv = N('ShaderNodeCombineXYZ')
        lv.inputs[0].default_value, lv.inputs[1].default_value, lv.inputs[2].default_value = Lv
        dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; Lk(geo.outputs['Normal'], dot.inputs[0]); Lk(lv.outputs[0], dot.inputs[1])
        band = N('ShaderNodeMapRange'); band.interpolation_type = 'SMOOTHSTEP'; Lk(dot.outputs['Value'], band.inputs['Value'])
        band.inputs['From Min'].default_value = -.04; band.inputs['From Max'].default_value = .34
        sh = N('ShaderNodeMath'); sh.operation = 'MULTIPLY_ADD'; Lk(dot.outputs['Value'], sh.inputs[0]); sh.inputs[1].default_value = .5; sh.inputs[2].default_value = .5
        hl = N('ShaderNodeMath'); hl.operation = 'MULTIPLY'; Lk(sh.outputs[0], hl.inputs[0]); hl.inputs[1].default_value = .25
        mx = N('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'; Lk(band.outputs['Result'], mx.inputs[0]); mx.inputs[1].default_value = .75; Lk(hl.outputs[0], mx.inputs[2])
        lit = N('ShaderNodeMath'); lit.operation = 'MULTIPLY_ADD'; Lk(mx.outputs[0], lit.inputs[0]); lit.inputs[1].default_value = .62; lit.inputs[2].default_value = .38
        col = N('ShaderNodeMixRGB'); col.blend_type = 'MULTIPLY'; col.inputs['Fac'].default_value = 1
        Lk(tx.outputs['Color'], col.inputs['Color1']); Lk(lit.outputs[0], col.inputs['Color2'])
        gam = N('ShaderNodeGamma'); gam.inputs['Gamma'].default_value = .62; Lk(col.outputs['Color'], gam.inputs['Color'])
        em = N('ShaderNodeEmission'); Lk(gam.outputs['Color'], em.inputs['Color'])
        out = N('ShaderNodeOutputMaterial'); Lk(em.outputs[0], out.inputs['Surface'])
        for o in sc.objects:
            if o.type == 'MESH':
                for s in o.material_slots: s.material = m
    paths = []
    os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
    HCt = Vector((0, -.05, .93))
    for az in (34, -34):
        e = math.radians(50); a = math.radians(az)
        toon_materials((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        for yaw in (0.0, 0.6, -0.6):
            d = Vector((math.sin(yaw), -math.cos(yaw), .08)).normalized()
            aim(HCt + d * 4, HCt, ortho=.80); paths.append(shot('_t%02d' % len(paths), 460, 460, os.path.join(ROOT, 'scratch', '_t%02d.png' % len(paths))))
        t = Vector((0, -.02, .70)); aim(t + Vector((math.sin(.6 if az > 0 else -.6), -math.cos(.6), .25)).normalized() * 6, t, ortho=1.65)
        paths.append(shot('_t%02d' % len(paths), 460, 460, os.path.join(ROOT, 'scratch', '_t%02d.png' % len(paths))))
    ims = [bpy.data.images.load(p) for p in paths]; w, h = 460, 460; cols = 4; rows = 2
    canvas = np.ones((rows * h, cols * w, 4), np.float32)
    for k, im in enumerate(ims):
        a_ = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a_); r, c = k // cols, k % cols
        canvas[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = a_.reshape(h, w, 4)
    out = bpy.data.images.new('toon', cols * w, rows * h); out.pixels.foreach_set(canvas.ravel())
    out.filepath_raw = os.path.join(OUT, 'toon-check.png'); out.file_format = 'PNG'; out.save()
print('RENDER_VIEWS_DONE')
