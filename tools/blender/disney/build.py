# Build a Disney-style hero in Blender and render a model sheet.
#   blender -b --factory-startup -P tools/blender/disney/build.py -- OUT_DIR [char=chewy|moka] [views=front,34,side,head]
#           [samples=64] [res=900] [look=clay|final] [blend=PATH]
# char= picks the character module (chewy.py, moka.py): its parts, colour masks, fur fields and rig landmarks.
import bpy, sys, os, math, time, importlib
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else os.path.join(HERE, '..', 'work', 'disney'))
opt = dict(a.split('=', 1) for a in argv[1:])
CHAR = opt.get('char', 'chewy')
import sdf, chewy, fur, rig as chrig
importlib.reload(sdf); importlib.reload(chewy); importlib.reload(fur); importlib.reload(chrig)
CH = chewy if CHAR == 'chewy' else importlib.reload(importlib.import_module(CHAR))
chrig.bind(CH)
from mathutils import Vector, Quaternion
from mathutils.kdtree import KDTree

VIEWS = [] if opt.get('views') == 'none' else opt.get('views', 'front,34,side,head').split(',')
SAMPLES = int(opt.get('samples', 64)); RES = int(opt.get('res', 900)); LOOK = opt.get('look', 'clay')
ONLY = opt.get('parts', '').split(',') if opt.get('parts') else None
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a): print(f'[{CHAR} {time.time() - T0:6.1f}s]', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ------------------------------------------------------------------ materials
def principled(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF']

def attr(nt, name, out='Color'):
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = name
    return a.outputs[out]

def mat_clay():
    m, nt, b = principled('clay')
    b.inputs['Base Color'].default_value = (0.45, 0.36, 0.3, 1); b.inputs['Roughness'].default_value = 0.55
    return m

def mat_painted(kind):
    """base colour + roughness from the mesh's per-vertex Col / Rough attributes"""
    m, nt, b = principled(kind)
    nt.links.new(attr(nt, 'Col'), b.inputs['Base Color'])
    nt.links.new(attr(nt, 'Rough', 'Fac'), b.inputs['Roughness'])
    if kind == 'fur':      # velvety short coat until the groom goes on
        b.inputs['Sheen Weight'].default_value = 0.6; b.inputs['Sheen Roughness'].default_value = 0.35
        b.inputs['Subsurface Weight'].default_value = 0.04; b.inputs['Subsurface Radius'].default_value = (0.02, 0.008, 0.004)
    elif kind == 'cloth':  # cotton: soft sheen and a fine weave bump
        b.inputs['Sheen Weight'].default_value = 0.5; b.inputs['Sheen Roughness'].default_value = 0.5
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 700; n.inputs['Detail'].default_value = 2
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.06; bump.inputs['Distance'].default_value = 0.0005
        nt.links.new(n.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    elif kind == 'skin':   # wet tongue
        b.inputs['Subsurface Weight'].default_value = 0.25; b.inputs['Subsurface Radius'].default_value = (0.01, 0.004, 0.003)
        b.inputs['Coat Weight'].default_value = 0.4; b.inputs['Coat Roughness'].default_value = 0.1
    elif kind == 'eye':    # glassy: a clear coat over the painted iris
        b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.02
        b.inputs['Coat IOR'].default_value = 1.38
    elif kind == 'gold':   # embroidered / metal trim: satin metal
        b.inputs['Metallic'].default_value = 0.85
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 500; n.inputs['Detail'].default_value = 2
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08; bump.inputs['Distance'].default_value = 0.0004
        nt.links.new(n.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    elif kind == 'glow':   # a magic orb: glassy shell over a glowing core (emission from the painted colour)
        nt.links.new(attr(nt, 'Col'), b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 9.0
        b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.03
    elif kind == 'wood':   # driftwood: grain running along the staff
        n = nt.nodes.new('ShaderNodeTexWave'); n.wave_type = 'BANDS'; n.bands_direction = 'Z'
        n.inputs['Scale'].default_value = 60; n.inputs['Distortion'].default_value = 6; n.inputs['Detail'].default_value = 3
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.0008
        nt.links.new(n.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

MATS = {'clay': mat_clay(), **{k: mat_painted(k) for k in ('fur', 'cloth', 'eye', 'skin', 'gold', 'glow', 'wood')}}

# ------------------------------------------------------------------ meshes
def make_mesh(name, Vx, Q, mat, color=None):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(Vx)); me.vertices.foreach_set('co', Vx.astype(np.float32).ravel())
    me.loops.add(Q.size); me.loops.foreach_set('vertex_index', Q.astype(np.int32).ravel())
    me.polygons.add(len(Q)); me.polygons.foreach_set('loop_start', (np.arange(len(Q), dtype=np.int32) * 4))
    me.update(calc_edges=True)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])  # a few quads where cuts meet come out flipped (glints)
    bm.to_mesh(me); bm.free()
    me.polygons.foreach_set('use_smooth', np.ones(len(Q), bool))
    if color is not None:
        rgb, rough = color(Vx)
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        ca.data.foreach_set('color', np.concatenate([rgb, np.ones((len(Vx), 1))], 1).astype(np.float32).ravel())
        ra = me.attributes.new('Rough', 'FLOAT', 'POINT'); ra.data.foreach_set('value', rough.astype(np.float32))
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    return ob

PARTS = {p['name']: p for p in CH.parts()}
MESHES = {}
for part in PARTS.values():
    if ONLY and part['name'] not in ONLY: continue
    if part.get('film_only') and opt.get('export'): continue  # render props (Moka's staff) stay out of the game asset
    Vx, Q = part['mesh']() if 'mesh' in part else sdf.surface_nets(part['f'], *part['box'], part['h'] * float(opt.get('hscale', 1)), clamp=part.get('clamp'))  # hscale=2: quick previews  # mesh: swept tubes etc.
    clay = LOOK == 'clay' and part['mat'] != 'glow'
    make_mesh(part['name'], Vx, Q, MATS['clay' if clay else part['mat']], None if clay else part['color'])
    MESHES[part['name']] = (Vx, Q)
    log(f"{part['name']}: {len(Vx)} verts, {len(Q)} quads")

# ------------------------------------------------------------------ fur
FUR_ON = LOOK != 'clay' and opt.get('fur', '1') != '0'
FUR_DENSITY = float(opt.get('furdensity', 1.0))

def hair_material():
    m = bpy.data.materials.new('hair'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    h = nt.nodes.new('ShaderNodeBsdfHairPrincipled'); h.parametrization = 'COLOR'
    info = nt.nodes.new('ShaderNodeHairInfo')
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY_ADD'
    nt.links.new(info.outputs['Intercept'], k.inputs[0]); k.inputs[1].default_value = 0.3; k.inputs[2].default_value = 0.62  # the hair model brightens colour: keep it chocolate
    sc = nt.nodes.new('ShaderNodeVectorMath'); sc.operation = 'SCALE'
    nt.links.new(attr(nt, 'Col'), sc.inputs[0]); nt.links.new(k.outputs[0], sc.inputs['Scale'])  # darker roots, sunlit tips
    nt.links.new(sc.outputs[0], h.inputs['Color'])
    for k, v in (('Roughness', 0.32), ('Radial Roughness', 0.45), ('Coat', 0.15), ('Random Roughness', 0.1)):
        if k in h.inputs: h.inputs[k].default_value = v
    nt.links.new(h.outputs[0], out.inputs['Surface'])
    return m

def make_fur(name, X, R, rgb, mat):
    n, pts = X.shape[:2]
    cv = bpy.data.hair_curves.new(name)
    cv.add_curves([pts] * n)
    cv.position_data.foreach_set('vector', X.astype(np.float32).ravel())
    ra = cv.attributes.get('radius') or cv.attributes.new('radius', 'FLOAT', 'POINT')
    ra.data.foreach_set('value', R.astype(np.float32).ravel())
    ca = cv.attributes.new('Col', 'FLOAT_COLOR', 'CURVE')
    ca.data.foreach_set('color', np.concatenate([rgb, np.ones((n, 1))], 1).astype(np.float32).ravel())
    cv.materials.append(mat)
    ob = bpy.data.objects.new(name, cv); scene.collection.objects.link(ob)
    return ob

FURS = {}
if FUR_ON:
    HAIR = hair_material(); rng = np.random.default_rng(7)
    head_f = PARTS['head']['f']
    def fields(name, P):  # (weight, length, comb, lift[, curl])
        if name == 'head':
            r = CH.head_fur(CH.to_head(P)); return (r[0], r[1] * CH.HEAD_SCALE) + tuple(r[2:])
        return CH.body_fur(P, head_f)
    for name, per_m2 in getattr(CH, 'FUR_DENSITY', (('head', 1.7e6), ('body', 1.4e6))):
        if name not in MESHES: continue
        Vx, Q = MESHES[name]
        wv = fields(name, Vx)[0]
        P, TRI, BARY = fur.sample_roots(Vx, Q, np.clip(wv, 0, None), per_m2 * FUR_DENSITY, rng)
        w, L, comb, lift, *extra = fields(name, P)
        keep = w > 0.05  # sampling already follows the weights; drop roots that landed on bare skin
        P, L, comb, lift, TRI, BARY = P[keep], L[keep], comb[keep], np.broadcast_to(lift, L.shape)[keep], TRI[keep], BARY[keep]
        N = sdf.gradient(PARTS[name]['f'], P, 0.0008)
        if extra:  # curly coat (Moka): a spiral per strand, more points to draw it
            X = fur.grow(P, N, L, comb, rng, lift=lift, curl=np.broadcast_to(extra[0], w.shape)[keep], pts=10, **getattr(CH, 'CURL', {}))
        else:
            X = fur.grow(P, N, L, comb, rng, lift=lift)
        rgb = PARTS[name]['color'](P)[0] * (0.9 + 0.2 * rng.random((len(P), 1)))
        FURS[name] = dict(ob=make_fur('fur_' + name, X, fur.radii(len(P), X.shape[1]), rgb, HAIR), tri=TRI, bary=BARY, X=X)
        log(f'fur_{name}: {len(P)} strands')
    scene.cycles_curves.shape = 'THICK'

# ------------------------------------------------------------------ rig
ARM = None
MESH_W = {}
def build_armature():
    arm = bpy.data.armatures.new('chewy_rig'); ob = bpy.data.objects.new('chewy_rig', arm); scene.collection.objects.link(ob)
    for o in scene.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, par, up in chrig.bone_defs():
        eb = arm.edit_bones.new(name); eb.head = Vector(h); eb.tail = Vector(t); eb.align_roll(Vector(up))
        if par: eb.parent = arm.edit_bones[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.show_in_front = True; ob.hide_render = True
    return ob

def set_groups(ob, W):
    for name, w in W.items():
        idx = np.nonzero(w > 0.002)[0]
        if not len(idx): continue
        vg = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        q = np.round(w[idx] * 200).astype(int)
        for val in np.unique(q): vg.add(idx[q == val].tolist(), float(val) / 200, 'REPLACE')

def skin_all():
    body_V = MESHES['body'][0]; body_W, chain = chrig.body_weights(body_V)
    def tree(mask):
        idx = np.nonzero(mask)[0]; kd = KDTree(len(idx))
        for j, i in enumerate(idx): kd.insert(body_V[i], int(i))
        kd.balance(); return kd
    kd_all = tree(np.ones(len(body_V), bool))
    kd_trunk = tree(np.isin(chain, ['torso', 'leg_L', 'leg_R']))  # never a hand or an arm
    kd_arm = None
    def near_W(Vx, arm, n=1, r=0.0, arm_only=False):
        """the weights of the body skin under each point (arm: may follow an arm); n > 1 averages the n nearest body
        vertices within ~r (smoother on loose cloth that spans several limbs); arm_only: only the arms' skin (a wide
        sleeve whose inside hangs nearer the chest than the arm)"""
        nonlocal kd_arm
        if arm_only:
            kd_arm = kd_arm or tree(np.isin(chain, ['arm_L', 'arm_R']))
        pick = lambda a: kd_arm if arm_only else (kd_all if a else kd_trunk)
        if n == 1:
            near = np.array([pick(a).find(co)[1] for co, a in zip(Vx, arm)])
            return {b: w[near] for b, w in body_W.items()}
        idx = np.zeros((len(Vx), n), int); dist = np.zeros((len(Vx), n))
        for i, (co, a) in enumerate(zip(Vx, arm)):
            hits = pick(a).find_n(co, n)
            idx[i] = [j for _, j, _ in hits]; dist[i] = [d for _, _, d in hits]
        k = np.exp(-(dist - dist[:, :1]) / max(r, 1e-6)); k /= k.sum(1, keepdims=True)
        return {b: (w[idx] * k).sum(1) for b, w in body_W.items()}
    for name, (Vx, Q) in MESHES.items():
        rule = PARTS[name].get('skin')  # clothes: None = the trunk and legs under it, 'arm' = the arm under it,
        if name == 'head': W = chrig.face_weights(Vx)  # a mask fn (True: may follow an arm), ('bone', b) rigid,
        elif name == 'tongue': W = {'jaw': np.ones(len(Vx))}  # ('fn', f): f(Vx, near_W) -> weights
        elif name == 'eyes': W = {'eye_L': (Vx[:, 0] > 0).astype(float), 'eye_R': (Vx[:, 0] <= 0).astype(float)}
        elif name == 'body': W = body_W
        elif isinstance(rule, tuple) and rule[0] == 'bone': W = {rule[1]: np.ones(len(Vx))}
        elif isinstance(rule, tuple) and rule[0] == 'fn': W = rule[1](Vx, near_W)
        else:  # clothes copy the skin they cover: sleeves and wraps the arm, everything else the trunk and legs
            arm = np.ones(len(Vx), bool) if rule == 'arm' else (rule(Vx) if callable(rule) else np.zeros(len(Vx), bool))
            W = near_W(Vx, arm)
        ob = bpy.data.objects[name]
        set_groups(ob, W); MESH_W[name] = W
        m = ob.modifiers.new('rig', 'ARMATURE'); m.object = ARM  # linear blend, the same maths the fur uses
    for name, F in FURS.items():  # each strand is skinned like the skin under its root
        W = MESH_W[name]; F['bones'] = [b for b in W if W[b].any()]
        Wm = np.stack([W[b] for b in F['bones']], 1).astype(np.float32)
        F['w'] = np.einsum('nk,nkb->nb', F['bary'].astype(np.float32), Wm[F['tri']])
    log('rig: skinned', ', '.join(MESHES))

def evaluated_verts(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg); me = ev.to_mesh()
    Vx = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', Vx); ev.to_mesh_clear()
    return Vx.reshape(-1, 3).astype(np.float64)

def apply_pose(pose_name='apose', expr_name='neutral'):
    apply_spec(chrig.BODY_POSES.get(pose_name, {}), chrig.expression(expr_name))

def apply_spec(body, E):
    if ARM is None: return
    for pb in ARM.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    rots = {k: list(v) for k, v in body.items()}
    for b, r in E['rot'].items(): rots[b] = rots.get(b, []) + r
    for b, lst in rots.items():
        pb = ARM.pose.bones[b]; Rr = pb.bone.matrix_local.to_3x3()
        q = Quaternion()
        for axis, deg in lst: q = Quaternion(Vector(axis).normalized(), math.radians(deg)) @ q
        pb.rotation_quaternion = (Rr.inverted() @ q.to_matrix() @ Rr).to_quaternion()
    for b, tv in E['t'].items():
        pb = ARM.pose.bones[b]; pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector(tv)
    bpy.context.view_layer.update()
    M = {pb.name: np.array(pb.matrix @ pb.bone.matrix_local.inverted()) for pb in ARM.pose.bones}
    for ob, lo in GLOWS: lo.location = evaluated_verts(ob).mean(0)  # the orb's light follows the pose
    for name, F in FURS.items():  # the groom follows the skin: strands are skinned with their roots' bone blend
        X = F['X']; out = np.zeros_like(X)
        for i, b in enumerate(F['bones']):
            w = F['w'][:, i]; m = w > 1e-4
            if m.any(): out[m] += w[m, None, None] * (X[m] @ M[b][:3, :3].T + M[b][:3, 3])
        F['ob'].data.position_data.foreach_set('vector', out.astype(np.float32).ravel()); F['ob'].data.update_tag()
    bpy.context.view_layer.update()

if opt.get('rig', '1') != '0' and 'body' in MESHES:
    ARM = build_armature(); skin_all()
GLOWS = []  # (mesh object, point light): a magic orb spills a little of its light on the hat, the paw and the robe
for name in MESHES:
    if PARTS[name]['mat'] != 'glow': continue
    rgb = PARTS[name]['color'](MESHES[name][0][:1])[0][0]
    L = bpy.data.lights.new(name + '_light', 'POINT'); L.energy = float(opt.get('glowlight', 6)); L.shadow_soft_size = 0.03
    L.color = tuple(float(c) for c in np.clip(rgb / max(rgb.max(), 1e-6), 0, 1))
    lo = bpy.data.objects.new(name + '_light', L); scene.collection.objects.link(lo); lo.location = MESHES[name][0].mean(0)
    GLOWS.append((bpy.data.objects[name], lo))

# ------------------------------------------------------------------ stage: cyclorama, three-point light, soft sky
def backdrop():
    bpy.ops.mesh.primitive_plane_add(size=1)
    ob = bpy.context.active_object; ob.name = 'backdrop'
    me = ob.data
    import bmesh
    bm = bmesh.new()
    prof = [(y, 0.0) for y in np.linspace(-6, 1.5, 16)] + [(1.5 + 1.2 * math.sin(a), 1.2 - 1.2 * math.cos(a)) for a in np.linspace(0.1, math.pi / 2, 10)] + [(2.7, z) for z in np.linspace(1.3, 6, 6)]
    rows = []
    for x in (-8, 8):
        rows.append([bm.verts.new((x, y, z)) for y, z in prof])
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    m = bpy.data.materials.new('backdrop'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.66, 0.72, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    me.materials.clear(); me.materials.append(m)
    return ob
BACKDROP = backdrop()

def area(name, loc, energy, size, color, target=(0, 0, 0.7)):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.size = size; L.color = color
    ob = bpy.data.objects.new(name, L); scene.collection.objects.link(ob); ob.location = loc
    d = np.array(target) - np.array(loc)
    ob.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
    return ob
RIG = bpy.data.objects.new('light_rig', None); scene.collection.objects.link(RIG)  # turns with the camera
for L in (area('key', (-2.2, -3.0, 3.2), 420, 2.5, (1.0, 0.93, 0.85)), area('fill', (3.0, -2.2, 1.4), 110, 3.0, (0.8, 0.88, 1.0)),
          area('rim', (1.8, 2.6, 2.6), 380, 1.5, (1.0, 0.95, 0.9)), area('rim2', (-2.0, 2.4, 1.6), 180, 1.5, (0.85, 0.9, 1.0))):
    L.parent = RIG
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.45, 0.5, 0.58, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25

# ------------------------------------------------------------------ camera + render
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.sensor_height = 24
scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    scene.cycles.device = 'GPU'
except Exception as e: log('no GPU', e)
scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = RES
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = float(opt.get('exposure', -0.4))
scene.render.film_transparent = False

# (name, yaw degrees from the front, pitch, focal mm, target, distance)
SHOTS = {
    'front': (0, 3, 85, (0, 0, 0.5), 4.2),
    '34': (-35, 6, 85, (0, 0, 0.5), 4.2),
    'side': (-90, 3, 85, (0, 0.02, 0.5), 4.2),
    'back': (160, 6, 85, (0, 0, 0.5), 4.2),
    'head': (-28, 4, 100, (0, -0.08, 0.81), 2.3),
    'headfront': (0, 2, 100, (0, -0.06, 0.81), 2.3),
    'headside': (-90, 2, 100, (0, -0.07, 0.81), 2.3),
    'hero': (-32, -2, 55, (0, -0.02, 0.52), 2.75),
}
SHOTS.update(getattr(CH, 'SHOTS', {}))
def place_camera(v):
    yaw, pitch, focal, tgt, dist = SHOTS[v]
    yr, pr = math.radians(yaw), math.radians(pitch)
    d = np.array([math.sin(yr) * math.cos(pr), -math.cos(yr) * math.cos(pr), math.sin(pr)])  # yaw 0: camera at -Y
    loc = np.array(tgt) + d * dist
    cam.location = loc; cam.data.lens = focal
    BACKDROP.rotation_euler = (0, 0, yr); RIG.rotation_euler = (0, 0, yr)  # studio turns with the camera
    look = np.array(tgt) - loc
    cam.rotation_euler = (math.atan2(math.hypot(look[0], look[1]), -look[2]), 0, math.atan2(look[1], look[0]) - math.pi / 2)

for shot in ([] if opt.get('anim') else VIEWS):  # view[:pose[:expression]]
    v, pose_name, expr_name = (shot.split(':') + ['apose', 'neutral'])[:3]
    apply_pose(pose_name, expr_name)
    place_camera(v)
    scene.render.filepath = os.path.join(OUT, LOOK + '_' + shot.replace(':', '-') + '.png')
    bpy.ops.render.render(write_still=True)
    log('rendered', scene.render.filepath)

if opt.get('anim'):  # an animated clip: frames, then an MP4 cut by Blender's own FFmpeg
    clip = chrig.Clip(); fps = int(opt.get('fps', 24)); n = int(opt.get('frames', int(clip.T * fps)))
    fdir = os.path.join(OUT, 'anim_' + opt['anim']); os.makedirs(fdir, exist_ok=True)
    place_camera(opt.get('animview', 'head'))
    times = [float(x) for x in opt['animtimes'].split(',')] if opt.get('animtimes') else [f / fps for f in range(n)]
    for f, tsec in enumerate(times):  # animtimes=0.4,1.0 renders single moments of the clip for checking
        body, E = clip.at(tsec); apply_spec(body, E)
        scene.render.filepath = os.path.join(fdir, f'f_{f:04d}.png')
        bpy.ops.render.render(write_still=True)
        if f % 12 == 0: log(f'frame {f}/{len(times)}')
    if opt.get('animtimes'): times = None
    vid = bpy.data.scenes.new('video') if times else None
if opt.get('anim') and vid:
    vid.sequence_editor_create()
    files = sorted(os.listdir(fdir))
    strip = vid.sequence_editor.sequences.new_image('frames', os.path.join(fdir, files[0]), 1, 1)
    for fn in files[1:]: strip.elements.append(fn)
    vid.frame_start, vid.frame_end = 1, len(files)
    vid.render.fps = fps; vid.render.resolution_x = scene.render.resolution_x; vid.render.resolution_y = scene.render.resolution_y
    vid.render.image_settings.file_format = 'FFMPEG'; vid.render.ffmpeg.format = 'MPEG4'; vid.render.ffmpeg.codec = 'H264'
    vid.render.ffmpeg.constant_rate_factor = 'HIGH'
    vid.render.filepath = os.path.join(OUT, f"{CHAR}_{opt['anim']}.mp4")
    bpy.ops.render.render(animation=True, scene=vid.name)
    log('video', vid.render.filepath)
if opt.get('export'):  # a game asset for src/actors/heroModels.js (rest pose, before any shot is posed)
    import game_export; importlib.reload(game_export)
    apply_pose('apose', 'neutral')
    game_export.export(dict(scene=scene, log=log, chewy=CH, chrig=chrig, MESHES=MESHES, MESH_W=MESH_W, PARTS=PARTS,
                            out=os.path.abspath(opt['export']), tex=int(opt.get('tex', 2048)), **getattr(CH, 'GAME', {})))
if opt.get('blend'): bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(opt['blend']))
