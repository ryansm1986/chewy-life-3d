"""Pose tests for shadow-toy_rig.blend, driven like the game (world-axis rotations about bone heads).

blender --background --factory-startup --python pose_shadow.py -- [--out DIR] [--only name,name]
Game -> Blender: rot X = +X, rot Y (up) = +Z, rot Z = -Y; translation (gx, gy, gz) -> (gx, -gz, gy).
Euler order matches three.js 'XYZ': R = Rx(gx) . Ry_game(gy) . Rz_game(gz).
"""
import bpy, math, os, sys, json
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
OUT = arg('--out', os.path.join(ROOT, 'poses'))
ONLY = set(arg('--only', '').split(',')) - {''}
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'shadow-toy_rig.blend'))
scene = bpy.context.scene
arm = bpy.data.objects['Shadow_Rig']; arm.hide_render = True

scene.render.engine = 'BLENDER_EEVEE_NEXT'
try: scene.eevee.taa_render_samples = 32
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = True
world = bpy.data.worlds.new('pv'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.86, 0.84, 0.80, 1); bg.inputs['Strength'].default_value = 0.65
def light(name, loc, energy, color):
    d = bpy.data.lights.new(name, 'SUN'); d.energy = energy; d.color = color; d.angle = math.radians(20)
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.35)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
light('key', (-2.0, -3.0, 4.0), 2.6, (1, 0.96, 0.9)); light('fill', (3.0, -1.5, 1.5), 0.9, (0.9, 0.94, 1.0))
light('rim', (0.5, 3.0, 2.5), 1.2, (1, 0.95, 0.88))
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, -0.0005))
gp = bpy.context.object; gm = bpy.data.materials.new('ground'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.70, 0.55, 1); gp.data.materials.append(gm)
scene.use_nodes = True; nt = scene.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); ov = nt.nodes.new('CompositorNodeAlphaOver')
ov.inputs[1].default_value = (0.94, 0.92, 0.87, 1); nt.links.new(rl.outputs['Image'], ov.inputs[2])
cp = nt.nodes.new('CompositorNodeComposite'); nt.links.new(ov.outputs[0], cp.inputs[0])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam

def R(gx=0.0, gy=0.0, gz=0.0):
    return Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
NEUTRAL = {'lidD_L': {'rx': -0.10}, 'lidD_R': {'rx': -0.10}}
def set_pose(spec):
    full = dict(NEUTRAL); full.update(spec)
    for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    for b, sp in full.items():
        t = sp.get('t', (0, 0, 0))
        arm.pose.bones[b].matrix_basis = Matrix.Translation(Vector((t[0], -t[2], t[1]))) @ R(sp.get('rx', 0), sp.get('ry', 0), sp.get('rz', 0))
    bpy.context.view_layer.update()
def shoot(path, kind, res=(560, 560), target=(0, 0, 0.30), dist=2.3, yaw=45, elev=45, lens=85, ortho=0.8):
    scene.render.resolution_x, scene.render.resolution_y = res
    if kind == 'ortho_side':
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho; d = Vector((1, 0, 0))
    elif kind == 'ortho_front':
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho; d = Vector((0, -1, 0))
    else:
        cam.data.type = 'PERSP'; cam.data.lens = lens
        e, y = math.radians(elev), math.radians(yaw)
        d = Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)))
    cam.location = Vector(target) + d * (dist if cam.data.type == 'PERSP' else 3.0)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cam.data.clip_end = 20
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)

LIP = (0, 0.007, -0.004)    # game space: 7 mm up, 4 mm back (front is +z in the game)
POSES = [
    ('rest', {}),
    ('walk', {'legFL': {'rx': 0.75}, 'legBR': {'rx': 0.75}, 'legFR': {'rx': -0.75}, 'legBL': {'rx': -0.75}}),
    ('run_bob', {'body': {'rx': 0.10, 't': (0, 0.03, 0)}}),
    ('sit', {'body': {'rx': -0.5, 't': (0, -0.045, 0)}, 'legBL': {'rx': -1.45, 't': (0, -0.08, 0)},
             'legBR': {'rx': -1.45, 't': (0, -0.08, 0)}, 'head': {'rx': 0.38}}),
    ('head_turn_nod', {'head': {'ry': 0.3, 'rx': 0.25}}),
    ('ears_fwd', {'ear_L': {'rx': 0.4}, 'ear_R': {'rx': 0.4}}),
    ('ears_back', {'ear_L': {'rx': -0.4}, 'ear_R': {'rx': -0.4}}),
    ('tail_wag_L', {'tail1': {'rx': -0.3, 'ry': 0.9}}),
    ('tail_wag_R', {'tail1': {'rx': -0.3, 'ry': -0.9}}),
]
FACES = [
    ('f_rest', {}),
    ('f_blink', {'lidU_L': {'rx': 1.22}, 'lidU_R': {'rx': 1.22}}),
    ('f_happy', {'lidU_L': {'rx': 0.488}, 'lidU_R': {'rx': 0.488}, 'lidD_L': {'rx': -0.24}, 'lidD_R': {'rx': -0.24}}),
    ('f_jaw', {'jaw': {'rx': 0.42}}),
    ('f_jaw_happy', {'jaw': {'rx': 0.42}, 'lidU_L': {'rx': 0.488}, 'lidU_R': {'rx': 0.488}, 'lidD_L': {'rx': -0.24},
                     'lidD_R': {'rx': -0.24}, 'lip_L': {'t': LIP}, 'lip_R': {'t': LIP}}),
    ('f_lips', {'lip_L': {'t': LIP}, 'lip_R': {'t': LIP}}),
    ('f_lower', {'lidD_L': {'rx': -0.24}, 'lidD_R': {'rx': -0.24}}),
    ('f_zero', {'lidD_L': {'rx': 0.0}, 'lidD_R': {'rx': 0.0}}),
    ('f_upper0488', {'lidU_L': {'rx': 0.488}, 'lidU_R': {'rx': 0.488}}),
    ('f_half', {'lidU_L': {'rx': 0.61}, 'lidU_R': {'rx': 0.61}}),
]
MASK_MAT = bpy.data.materials.new('lid_mask'); MASK_MAT.use_nodes = True
_nt = MASK_MAT.node_tree; _nt.nodes.clear()
_em = _nt.nodes.new('ShaderNodeEmission'); _em.inputs['Color'].default_value = (1, 0, 0, 1); _em.inputs['Strength'].default_value = 1
_out = _nt.nodes.new('ShaderNodeOutputMaterial'); _nt.links.new(_em.outputs[0], _out.inputs[0])
LID_OBJS = [o for o in bpy.data.objects if o.type == 'MESH' and 'lid' in o.name]
ORIG = {o.name: list(o.data.materials) for o in LID_OBJS}
def mask_mode(on):
    for o in LID_OBJS:
        o.data.materials.clear()
        for m_ in ([MASK_MAT] if on else ORIG[o.name]): o.data.materials.append(m_)
done = []
for name, spec in POSES:
    if ONLY and name not in ONLY: continue
    set_pose(spec)
    shoot(os.path.join(OUT, name + '_game.png'), 'persp', target=(0, 0.02, 0.28), dist=2.5)
    shoot(os.path.join(OUT, name + '_side.png'), 'ortho_side', target=(0, 0.02, 0.36), ortho=0.85)
    done.append(name)
for name, spec in FACES:
    if ONLY and name not in ONLY: continue
    set_pose(spec)
    shoot(os.path.join(OUT, name + '_front.png'), 'ortho_front', res=(520, 520), target=(0, -0.05, 0.44), ortho=0.36)
    shoot(os.path.join(OUT, name + '_game.png'), 'persp', res=(520, 520), target=(0, -0.06, 0.45), dist=1.1, yaw=45)
    shoot(os.path.join(OUT, name + '_q34.png'), 'persp', res=(520, 520), target=(0, -0.06, 0.42), dist=1.1, yaw=-35, elev=8)
    if name in ('f_happy', 'f_jaw_happy'):          # close-ups: front and both 45 deg game yaws
        shoot(os.path.join(OUT, name + '_cu_front.png'), 'ortho_front', res=(640, 400), target=(0, -0.05, 0.445), ortho=0.36)
        shoot(os.path.join(OUT, name + '_cu_game+45.png'), 'persp', res=(640, 400), target=(0, -0.13, 0.43), dist=0.95, yaw=45)
        shoot(os.path.join(OUT, name + '_cu_game-45.png'), 'persp', res=(640, 400), target=(0, -0.13, 0.43), dist=0.95, yaw=-45)
    done.append(name)
if not ONLY or 'mask' in ONLY:
    for name, spec in FACES:
        if name not in ('f_happy', 'f_blink', 'f_rest'): continue
        set_pose(spec); mask_mode(True)
        shoot(os.path.join(OUT, name + '_mask_front.png'), 'ortho_front', res=(520, 520), target=(0, -0.05, 0.44), ortho=0.36)
        shoot(os.path.join(OUT, name + '_mask_game+45.png'), 'persp', res=(520, 520), target=(0, -0.06, 0.45), dist=1.1, yaw=45)
        shoot(os.path.join(OUT, name + '_mask_game-45.png'), 'persp', res=(520, 520), target=(0, -0.06, 0.45), dist=1.1, yaw=-45)
        mask_mode(False)
set_pose({})
print('POSES_DONE', json.dumps(done), flush=True)
