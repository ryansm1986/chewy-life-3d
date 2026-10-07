"""Review renders for the whelp (same stage, lights and scales every round).

    blender --background --factory-startup --python render_views.py -- --mode views  [--in GLB] [--out DIR]
    blender --background --factory-startup --python render_views.py -- --mode flying [--out DIR]
    blender --background --factory-startup --python render_views.py -- --mode wing   [--out DIR]

views : body_front|34|side|back.png (ortho, 1000 px = 0.95 m, centre z 0.36 m), head_front|34.png, g45_p|m.png (45 deg
        down, yaw +45 | -45) and g45_bp|bm.png (from behind), game-45-standing.png / game-45-back.png (the pairs side by side).
flying: the flying test. Front legs tucked, hind legs trailing (linear-blend skinning with the rig's own leg field,
        rig_shadow-toy.py leg_w, about the rig's leg bone heads), the body pitched 15 deg nose-up about the body bone, the
        wing props (left = the GLB, right = its x-mirror) at their wing_mount.json roots, flapped about the forward axis.
        flying.png: rows = flap -30, +30, +60 deg (the game's range); columns = side | front 3/4 | game yaw +45 | game yaw -45.
        game-45.png: the flying pose at flap +30 from the game camera, yaw +45 | -45.
        fly_front.png / fly_side.png: flap +35 / +60 (the sheet callout's poses, within the cap) for the comparison; fly_hero.png: +40.
wing  : the prop alone: top | front (edge on) | 3/4 | game yaw +45.
"""
import bpy, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix
ROOT = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
MODE = arg('--mode', 'views')
MODEL = arg('--in', 'D:/projects/chewy-life-3d/public/models/shadow-whelp.glb')
WINGGLB = 'D:/projects/chewy-life-3d/public/models/shadow-whelp-wing.glb'
OUT = arg('--out', os.path.join(ROOT, 'preview')); os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
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
def light(name, rel, power, size, color):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel
    o.rotation_euler = (Vector((0, 0, -3.2)) - Vector(rel)).to_track_quat('-Z', 'Y').to_euler(); return o
light('key', (-2.2, 1.9, 1.0), 175, 3.0, (1, .92, .86)); light('fill', (2.4, -.4, .6), 85, 3.0, (.88, .92, 1))
light('rim', (.8, 2.6, -2.8), 120, 2.5, (1, .88, .76))
def aim(loc, target, ortho=None, lens=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
def shot(name, rx, ry):
    sc.render.resolution_x = rx; sc.render.resolution_y = ry; sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
    return sc.render.filepath
def vdir(n): return Vector({'front': (0, -1, 0), '34': (.64, -.77, 0), 'side': (1, 0, 0), 'back': (0, 1, 0), '34m': (-.64, -.77, 0),
                            'top': (0.001, -0.001, 1), '34up': (.55, -.62, .56)}[n]).normalized()
def g45(name, yaw, target, dist=6.5, lens=200, res=700):
    e = math.radians(45); y = math.radians(yaw)
    d = Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    aim(Vector(target) + d * dist, target, lens=lens); return shot(name, res, res)
def montage(paths, cols, out, gap=8):
    ims = [bpy.data.images.load(p) for p in paths]; w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
    c = np.ones((rows * h + (rows - 1) * gap, cols * w + (cols - 1) * gap, 4), np.float32)
    for k, im in enumerate(ims):
        a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); a = a.reshape(h, w, 4)
        r, q = k // cols, k % cols; y0 = (rows - 1 - r) * (h + gap)
        c[y0:y0 + h, q * (w + gap):q * (w + gap) + w] = a
    img = bpy.data.images.new(out, c.shape[1], c.shape[0]); img.pixels.foreach_set(c.ravel())
    img.filepath_raw = os.path.join(OUT, out + '.png'); img.file_format = 'PNG'; img.save()
    for p in paths: os.remove(p)

def import_glb(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

if MODE == 'views':
    import_glb(MODEL)
    BC = Vector((0, 0.02, 0.36)); scales = {}
    for n in ('front', '34', 'side', 'back'):
        d = vdir(n); aim(BC + d * 6, BC, ortho=0.95); shot('body_' + n, 700, 1000)
        scales['body_' + n] = {'px_per_m': 1000 / 0.95, 'centre_m': list(BC), 'res': [700, 1000]}
    HC = Vector((0, -0.04, 0.50))
    for n in ('front', '34'):
        d = vdir(n); aim(HC + d * 6, HC, ortho=0.50); shot('head_' + n, 800, 800)
    T = (0, 0.03, 0.34)
    g45('g45_p', 45, T); g45('g45_m', -45, T); g45('g45_bp', 135, T); g45('g45_bm', -135, T)
    def pair(a, b, out):
        A = bpy.data.images.load(os.path.join(OUT, a + '.png')); B = bpy.data.images.load(os.path.join(OUT, b + '.png')); w, h = A.size
        x = np.empty(w * h * 4, np.float32); y = np.empty_like(x); A.pixels.foreach_get(x); B.pixels.foreach_get(y)
        c = np.ones((h, 2 * w + 10, 4), np.float32); c[:, :w] = x.reshape(h, w, 4); c[:, w + 10:] = y.reshape(h, w, 4)
        im = bpy.data.images.new(out, 2 * w + 10, h); im.pixels.foreach_set(c.ravel()); im.filepath_raw = os.path.join(OUT, out + '.png')
        im.file_format = 'PNG'; im.save()
    pair('g45_p', 'g45_m', 'game-45-standing'); pair('g45_bp', 'g45_bm', 'game-45-back')
    json.dump(scales, open(os.path.join(OUT, 'scales.json'), 'w'), indent=1)

elif MODE == 'wing':
    obs = import_glb(WINGGLB)
    C = Vector((0.15, 0.06, 0.0))
    paths = []
    for n in ('top', 'front', '34up'):
        d = vdir(n); aim(C + d * 6, C, ortho=0.45); paths.append(shot('w_' + n, 600, 600))
    paths.append(g45('w_g45', 45, C, lens=300, res=600))
    montage(paths, 4, 'wing')

elif MODE == 'flying':
    model = import_glb(MODEL)
    wm = json.load(open(os.path.join(ROOT, 'wing_mount.json')))
    def sm(a, b, x):
        t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
    LEGS = {'FL': ((0.094, -0.06, 0.215), True), 'FR': ((-0.094, -0.06, 0.215), True),
            'BL': ((0.10, 0.185, 0.215), False), 'BR': ((-0.10, 0.185, 0.215), False)}
    FL, HL = (0.094, -0.060), (0.100, 0.192)
    def leg_w(P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]; out = {}
        for name, (x0, y0, front) in {'FL': (FL[0], FL[1], 1), 'FR': (-FL[0], FL[1], 1), 'BL': (HL[0], HL[1], 0), 'BR': (-HL[0], HL[1], 0)}.items():
            if front:
                d = np.hypot(x - x0, y - y0); Hh = 1 - sm(0.062, 0.118, d); V = 1 - sm(0.118, 0.215, z)
            else:
                q = np.hypot((x - x0) / 0.072, (y - (y0 - 0.012)) / 0.095); Hh = 1 - sm(0.85, 1.55, q); V = 1 - sm(0.108, 0.215, z)
            Hh = Hh * sm(0.0, 0.045, x * (1 if x0 > 0 else -1))
            paw = 1 - sm(0.09, 0.115, z)
            out[name] = V * (Hh + (1 - Hh) * paw * (1 - sm(0.06, 0.10, np.hypot(x - x0, y - y0))))
        return out
    ANG = {'FL': -52, 'FR': -52, 'BL': 55, 'BR': 55}      # deg about +X: front paws tucked forward, hind paws trailing
    def rx(a):
        a = math.radians(a); c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    for o in model:
        if o.type != 'MESH' or o.name not in ('Shadow_body', 'Whelp_coat'): continue
        M = np.array(o.matrix_world); Mi = np.linalg.inv(M)
        V = np.array([tuple(v.co) for v in o.data.vertices]); Pw = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
        W_ = leg_w(Pw); tot = np.zeros(len(Pw)); acc = np.zeros_like(Pw)
        for k, w in W_.items():
            piv = np.array(LEGS[k][0]); acc += w[:, None] * ((Pw - piv) @ rx(ANG[k]).T + piv); tot += w
        tot = np.clip(tot, 0, 1); Pn = acc + (1 - tot)[:, None] * Pw
        Pl = (np.c_[Pn, np.ones(len(Pn))] @ Mi.T)[:, :3]
        for v, p in zip(o.data.vertices, Pl): v.co = Vector(p)
        o.data.update()
    pitch = bpy.data.objects.new('pitch', None); sc.collection.objects.link(pitch); pitch.location = (0, 0.07, 0.21)
    bpy.context.view_layer.update()
    PINV = pitch.matrix_world.inverted()
    for o in model:
        if o.parent is None:
            o.parent = pitch; o.matrix_parent_inverse = PINV
    wings = {}
    for tag in 'LR':
        obs = import_glb(WINGGLB); w = [o for o in obs if o.type == 'MESH'][0]
        hinge = bpy.data.objects.new('hinge_' + tag, None); sc.collection.objects.link(hinge)
        hinge.location = Vector(wm[tag]['model_blender'])
        w.parent = hinge; w.matrix_parent_inverse = Matrix.Identity(4); w.location = (0, 0, 0); w.rotation_euler = (0, 0, 0)
        w.scale = (1 if tag == 'L' else -1, 1, 1)
        bpy.context.view_layer.update(); hinge.parent = pitch; hinge.matrix_parent_inverse = PINV
        wings[tag] = hinge
    def pose(flap, body_pitch=15):
        pitch.rotation_euler = (math.radians(-body_pitch), 0, 0)
        for tag, h in wings.items():
            s = 1 if tag == 'L' else -1
            h.rotation_euler = (0, math.radians(-s * flap), 0)   # about the forward axis (Blender -Y): + raises the tip
        bpy.context.view_layer.update()
    T = Vector((0, 0.05, 0.40)); paths = []
    for flap in (-30, 30, 60):                                      # the game's flap range: -30 .. +60
        pose(flap)
        aim(T + vdir('side') * 6, T, ortho=1.05); paths.append(shot('f_%d_side' % flap, 520, 520))
        aim(T + Vector((.55, -.70, .25)).normalized() * 6, T, ortho=1.05); paths.append(shot('f_%d_34' % flap, 520, 520))
        paths.append(g45('f_%d_gp' % flap, 45, T, lens=170, res=520))
        paths.append(g45('f_%d_gm' % flap, -45, T, lens=170, res=520))
    montage(paths, 4, 'flying')
    pose(35)                                                        # the sheet callout: front at ~35 deg, side at ~65 deg
    aim(T + vdir('front') * 6 + Vector((0, 0, 0.6)), T, ortho=1.05); shot('fly_front', 800, 700)
    pose(60)
    aim(T + Vector((-1, -0.12, 0.05)).normalized() * 6, T, ortho=1.05); shot('fly_side', 800, 700)
    pose(30)                                                        # the game camera, both yaws, with the wings
    gp = g45('fg45_p', 45, T, lens=170, res=700); gm = g45('fg45_m', -45, T, lens=170, res=700)
    montage([gp, gm], 2, 'game-45')
    pose(40)
    aim(T + Vector((.55, -.70, .30)).normalized() * 6, T, ortho=1.0); shot('fly_hero', 900, 900)
print('RENDER_DONE', MODE)
