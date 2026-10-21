"""the sun wagasa's over-the-shoulder carry, measured: for a grid of shaft directions (the grip fixed in the carry pose's
paw), how much of her visible face (eyes, muzzle, cheeks) and head (with the ears) the wagasa hides at the game camera
(45 deg elevation, yaws 0, +-30, +-45, +-60, +-90), plus its clearance from the head and ears and the shaft's distance
from the shoulder. --pose UX:UY:UZ:FX:FY:FZ sets the carry's arm (upper arm, forearm; game radians), --json the output.
--earcheck THETA:PHI,... re-measures the head and ear clearance at the game's head-turn / ear-swing extremes;
--cast X:Y:Z,... scores cast leans (Blender axes) with the right upper arm at (-2.4, 0, -0.12). --render THETA:PHI,... renders those candidates large from both 45 deg yaws, the side and the back.
THETA = the shaft's tilt from vertical (deg), PHI = its heading in the ground plane, 0 = straight back, + = to her right."""
import bpy, json, os, math, sys
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
T = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # the task folder (this script sits in scratch/ or measure/)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'stella-toy_rig.blend'))
arm = bpy.data.objects['Stella_Rig']; arm.data.pose_position = 'POSE'; PB = arm.pose.bones
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/stella-parasol.glb')
new = [o for o in set(bpy.data.objects) - before]; roots = [o for o in new if o.parent is None]
RJ = json.load(open(os.path.join(T, 'prop_mount.rig.json')))
def unit(v): v = np.asarray(v, float); return v / np.linalg.norm(v)
def Rx(a): c, s_ = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s_], [0, s_, c]])
def Ry(a): c, s_ = math.cos(a), math.sin(a); return np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]])
def Rz(a): c, s_ = math.cos(a), math.sin(a); return np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1]])
def game_R(gx, gy, gz): return Rx(gx) @ Rz(gy) @ Ry(-gz)
def frame_to(axis_b, side_hint=(1., 0, 0)):
    zb = unit(axis_b); xb = np.asarray(side_hint, float); xb = unit(xb - zb * (xb @ zb)); yb = np.cross(zb, xb); return np.stack([xb, yb, zb], 1)
H = {b.name: np.array(b.head_local) for b in arm.data.bones}
shR, elR = H['upperarm_R'], H['forearm_R']
pg = RJ['palms']['R']['palm_centre_game']; palmR = np.array([pg[0], -pg[2], pg[1]])
CARRY_UP, CARRY_FORE = (-.55, 0, -.10), (-1.0, 0, 0)
if '--pose' in argv:
    _p = [float(x) for x in argv[argv.index('--pose') + 1].split(':')]; CARRY_UP, CARRY_FORE = tuple(_p[:3]), tuple(_p[3:6])
R1 = game_R(*CARRY_UP); R2 = game_R(*CARRY_FORE)
def carry_pt(p): return shR + R1 @ ((elR - shR) + R2 @ (np.asarray(p, float) - elR))
grip_w = carry_pt(palmR); over = np.array([shR[0] - .055, shR[1] + .010, shR[2] + .125])
def pose(ch):
    for b in PB: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    for name, v in ch.items():
        gx, gy, gz = v; PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    bpy.context.view_layer.update()
pose({'upperarm_L': (0, 0, .12), 'upperarm_R': CARRY_UP, 'forearm_R': CARRY_FORE, 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)})
dg = bpy.context.evaluated_depsgraph_get()
def ev(name):
    o = bpy.data.objects[name].evaluated_get(dg); m = o.to_mesh(); mw = np.array(o.matrix_world)
    V = np.array([mw[:3, :3] @ np.array(v.co) + mw[:3, 3] for v in m.vertices]); N = np.array([unit(mw[:3, :3] @ np.array(v.normal)) for v in m.vertices])
    F = [list(p.vertices) for p in m.polygons]; o.to_mesh_clear(); return V, N, F
def bvh(parts):
    V = []; F = []
    for Vp, Fp in parts:
        off = len(V); V += [Vector(p) for p in Vp]; F += [[i + off for i in f] for f in Fp]
    return BVHTree.FromPolygons(V, F)
Vh, Nh, Fh = ev('Stella_head'); VeL, NeL, FeL = ev('Stella_eye_L'); VeR, NeR, FeR = ev('Stella_eye_R')
VaL, NaL, FaL = ev('Stella_ear_L'); VaR, NaR, FaR = ev('Stella_ear_R')
occ_body = bvh([(Vh, Fh), (VeL, FeL), (VeR, FeR), (VaL, FaL), (VaR, FaR)] + [ev(n)[::2] for n in ('Stella_body', 'Stella_sleeve_R', 'Stella_arm_R', 'Stella_sleeve_L', 'Stella_arm_L')])
eyeC = (VeL.mean(0) + VeR.mean(0)) / 2
# the face: head skin facing forward around the eyes and muzzle, plus the eyeballs' front halves
face_sel = (Nh[:, 1] < -.35) & (Vh[:, 2] > eyeC[2] - .17) & (Vh[:, 2] < eyeC[2] + .09) & (np.abs(Vh[:, 0]) < .20)
FACE = np.concatenate([Vh[face_sel][::3], VeL[NeL[:, 1] < -.3][::3], VeR[NeR[:, 1] < -.3][::3]])
HEAD = np.concatenate([Vh[::6], VaL[::6], VaR[::6]])
print('POSE', CARRY_UP, CARRY_FORE); print('POINTS face', len(FACE), 'head+ears', len(HEAD), 'grip_w', grip_w.round(4).tolist(), 'over', over.round(4).tolist(), flush=True)
def gdir(yaw, elev=45):
    e = math.radians(elev); y = math.radians(yaw); return np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
YAWS = (0, 30, -30, 45, -45, 60, -60, 90, -90)
VIS = {}
for yaw in YAWS:
    d = Vector(gdir(yaw)); VIS[yaw] = {}
    for tag, P in (('face', FACE), ('head', HEAD)):
        VIS[yaw][tag] = [p for p in P if occ_body.ray_cast(Vector(p) + d * .004, d, 5)[0] is None]
# the wagasa's mesh in its own frame (the grip at the origin, the shaft along +Z in Blender)
for r in roots: r.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()
PV = []; PF = []
for o in new:
    if o.type != 'MESH': continue
    mw = np.array(o.matrix_world); off = len(PV)
    PV += [mw[:3, :3] @ np.array(v.co) + mw[:3, 3] for v in o.data.vertices]; PF += [[i + off for i in p.vertices] for p in o.data.polygons]
PV = np.array(PV)
headT = bvh([(Vh, Fh), (VaL, FaL), (VaR, FaR)])
TR = {'head': BVHTree.FromPolygons([Vector(p) for p in Vh], Fh), 'earL': BVHTree.FromPolygons([Vector(p) for p in VaL], FaL), 'earR': BVHTree.FromPolygons([Vector(p) for p in VaR], FaR)}
_bod = [ev(n) for n in ('Stella_body', 'Stella_sleeve_R', 'Stella_arm_R')]
bodyT = bvh([(V_, F_) for V_, N_, F_ in _bod])
def signed(tree, p):
    loc, nrm, i, d = tree.find_nearest(Vector(p))
    return d if (Vector(p) - loc).dot(nrm) >= 0 else -d
def axis_of(theta, phi):
    t, p = math.radians(theta), math.radians(phi); return np.array([-math.sin(t) * math.sin(p), math.sin(t) * math.cos(p), math.cos(t)])
def place(axis):
    Rb = frame_to(axis, (1, 0, 0)); return Rb, (PV @ Rb.T) + grip_w
def score(theta, phi):
    axis = axis_of(theta, phi); Rb, W = place(axis); tr = BVHTree.FromPolygons([Vector(p) for p in W], PF)
    res = {}
    for yaw in YAWS:
        d = Vector(gdir(yaw))
        for tag in ('face', 'head'):
            P = VIS[yaw][tag]; hit = sum(1 for p in P if tr.ray_cast(Vector(p) + d * .004, d, 5)[0] is not None)
            res['%s%+d' % (tag, yaw)] = round(hit / max(1, len(P)), 3)
    pen = {k: len(tr.overlap(t_)) for k, t_ in TR.items()}
    hd = min(signed(TR['head'], p) for p in W[::3]); res['overlaps'] = pen; res['head_depth_mm'] = round(min(0, hd) * 1000, 1)
    clear = hd if sum(pen.values()) == 0 else -sum(pen.values()) / 1000.
    sh = [signed(bodyT, grip_w + t_ * axis) for t_ in np.linspace(.06, .40, 18)]
    dsh = min(sh); res['shaft_body_mm'] = round(dsh * 1000, 1)
    return axis, res, clear, dsh, float(W[:, 2].max())


if '--cast' in argv:
    Rc = game_R(-2.4, 0, -.12); pose({'upperarm_L': (0, 0, .12), 'upperarm_R': (-2.4, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)})
    dg = bpy.context.evaluated_depsgraph_get()
    Vh, Nh, Fh = ev('Stella_head'); VeL, NeL, FeL = ev('Stella_eye_L'); VeR, NeR, FeR = ev('Stella_eye_R'); VaL, NaL, FaL = ev('Stella_ear_L'); VaR, NaR, FaR = ev('Stella_ear_R')
    occ = bvh([(Vh, Fh), (VeL, FeL), (VeR, FeR), (VaL, FaL), (VaR, FaR)] + [ev(n)[::2] for n in ('Stella_body', 'Stella_sleeve_R', 'Stella_arm_R', 'Stella_sleeve_L', 'Stella_arm_L')])
    FACE = np.concatenate([Vh[face_sel][::3], VeL[NeL[:, 1] < -.3][::3], VeR[NeR[:, 1] < -.3][::3]]); HEAD = np.concatenate([Vh[::6], VaL[::6], VaR[::6]])
    gc = shR + Rc @ (palmR - shR); print('CAST grip', gc.round(4).tolist())
    trs = {'head': BVHTree.FromPolygons([Vector(p) for p in Vh], Fh), 'earL': BVHTree.FromPolygons([Vector(p) for p in VaL], FaL), 'earR': BVHTree.FromPolygons([Vector(p) for p in VaR], FaR)}
    for c in argv[argv.index('--cast') + 1].split(','):
        ax = unit([float(x) for x in c.split(':')]); Rb = frame_to(ax, (1, 0, 0)); W = (PV @ Rb.T) + gc; tr = BVHTree.FromPolygons([Vector(p) for p in W], PF); res = {}
        for yaw in YAWS:
            d = Vector(gdir(yaw))
            for tag, P in (('face', FACE), ('head', HEAD)):
                vis = [p for p in P if occ.ray_cast(Vector(p) + d * .004, d, 5)[0] is None]
                res['%s%+d' % (tag, yaw)] = round(sum(1 for p in vis if tr.ray_cast(Vector(p) + d * .004, d, 5)[0] is not None) / max(1, len(vis)), 3)
        ovl = {k: len(tr.overlap(t_)) for k, t_ in trs.items()}
        print('CASTCAND', c, 'overlaps', ovl, 'face', {k: v for k, v in res.items() if k.startswith('face')}, 'head', {k: v for k, v in res.items() if k.startswith('head')}, flush=True)
    print('CAST_DONE'); sys.exit(0)
if '--earcheck' in argv:
    CANDS = [tuple(float(x) for x in c.split(':')) for c in argv[argv.index('--earcheck') + 1].split(',')]
    base = {'upperarm_L': (0, 0, .12), 'upperarm_R': CARRY_UP, 'forearm_R': CARRY_FORE, 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
    VARS = [('rest', {}), ('head+.45', {'head': (0, .45, 0)}), ('head-.45', {'head': (0, -.45, 0)}), ('nod+.25', {'head': (.25, 0, 0)}),
            ('head-.45 nod-.2', {'head': (-.2, -.45, 0)}), ('earsX+.35', {'ear_L': (.35, 0, 0), 'ear_R': (.35, 0, 0)}), ('earsX-.35', {'ear_L': (-.35, 0, 0), 'ear_R': (-.35, 0, 0)}),
            ('earsZ.06', {'ear_L': (0, 0, .06), 'ear_R': (0, 0, -.06)}), ('tips+.6', {'earTip_L': (.6, 0, 0), 'earTip_R': (.6, 0, 0)}), ('tips-1', {'earTip_L': (-1., 0, 0), 'earTip_R': (-1., 0, 0)}),
            ('turn-.45 earsX-.35', {'head': (0, -.45, 0), 'ear_L': (-.35, 0, 0), 'ear_R': (-.35, 0, 0)}), ('turn+.45 earsX+.35', {'head': (0, .45, 0), 'ear_L': (.35, 0, 0), 'ear_R': (.35, 0, 0)})]
    for theta, phi in CANDS:
        axis = axis_of(theta, phi); Rb, W = place(axis); trP = BVHTree.FromPolygons([Vector(p) for p in W], PF); worst = 9
        for nm, ch in VARS:
            pose({**base, **ch}); dg = bpy.context.evaluated_depsgraph_get(); m_ = {}
            for part in ('Stella_head', 'Stella_ear_L', 'Stella_ear_R'):
                o = bpy.data.objects[part].evaluated_get(dg); me = o.to_mesh(); mw = o.matrix_world
                V_ = [mw @ v.co for v in me.vertices]; F_ = [list(p_.vertices) for p_ in me.polygons]; o.to_mesh_clear()
                t_ = BVHTree.FromPolygons(V_, F_); ov = len(trP.overlap(t_))
                dmin = min(trP.find_nearest(v)[3] for v in V_[::2])
                m_[part[7:]] = (ov, round(dmin * 1000, 1)); worst = min(worst, -1 if ov else dmin)
            print('EAR', theta, phi, nm, m_, flush=True)
        print('EARWORST', theta, phi, round(worst * 1000, 1), flush=True)
    print('EARCHECK_DONE'); sys.exit(0)
if '--render' not in argv:
    rows = []
    for theta in range(30, 91, 5):
        for phi in range(-60, 121, 10):
            axis, res, clear, dsh, top = score(theta, phi)
            f45 = max(res['face+45'], res['face-45']); fall = max(v for k, v in res.items() if k.startswith('face'))
            h45 = max(res['head+45'], res['head-45'])
            rows.append(dict(theta=theta, phi=phi, axis=axis.round(3).tolist(), face45=f45, face_all=fall, head45=h45, clear_mm=round(clear * 1000, 1), shoulder_mm=round(dsh * 1000, 1), top=round(top, 3), res=res))
            print('CAND th %2d ph %+3d  face45 %.3f  faceAll %.3f  head45 %.3f  clear %5.1f mm  shoulder %5.1f mm  top %.2f' % (theta, phi, f45, fall, h45, clear * 1000, dsh * 1000, top), flush=True)
    json.dump({'pose': [CARRY_UP, CARRY_FORE], 'grip_w': grip_w.tolist(), 'rows': rows}, open(argv[argv.index('--json') + 1] if '--json' in argv else os.path.join(T, 'scratch', 'diag_carry2.json'), 'w'), indent=1)
    print('DIAG_CARRY2_DONE'); sys.exit(0)
# ---- renders of the picked candidates
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 24
except Exception: pass
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.60, .55, .50, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.clip_start = .05; cam.data.clip_end = 60
for nm, rel, pw, col in (('key', (-2.2, 1.9, 1.0), 175, (1, .92, .86)), ('fill', (2.4, -.4, .6), 85, (.88, .92, 1)), ('rim', (.8, 2.6, -2.8), 120, (1, .88, .76))):
    d = bpy.data.lights.new(nm, 'AREA'); d.energy = pw; d.shape = 'DISK'; d.size = 3.0; d.color = col
    o = bpy.data.objects.new(nm, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel
    o.rotation_euler = (Vector((0, 0, -3.2)) - Vector(rel)).to_track_quat('-Z', 'Y').to_euler()
def aim(loc, target, ortho):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
paths = []; K = [0]; S = 520
def shot():
    p = os.path.join(T, 'scratch', '_dc2_%03d.png' % K[0]); K[0] += 1; sc.render.resolution_x = sc.render.resolution_y = S; sc.render.filepath = p
    bpy.ops.render.render(write_still=True); paths.append(p)
CANDS = [tuple(float(x) for x in c.split(':')) for c in argv[argv.index('--render') + 1].split(',')]
out = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(T, 'scratch', 'diag_carry2.png')
for theta, phi in CANDS:
    axis = axis_of(theta, phi); Rb = frame_to(axis, (1, 0, 0)); M = Matrix.Translation(Vector(grip_w)) @ Matrix(Rb.tolist()).to_4x4()
    for r in roots: r.matrix_world = M
    bpy.context.view_layer.update()
    t = Vector((-.05, .08, .82))
    for yaw in (45, -45): aim(t + Vector(gdir(yaw)) * 6, t, 1.7); shot()
    aim(t + Vector((-1, 0, .05)).normalized() * 6, t, 1.7); shot()
    aim(t + Vector(gdir(180, 30)) * 6, t, 1.7); shot()
    print('RENDER', theta, phi, 'axis', axis.round(4).tolist(), flush=True)
ims = [bpy.data.images.load(p) for p in paths]; w = h = S; cols = 4; rows_ = (len(ims) + cols - 1) // cols
canvas = np.ones((rows_ * h, cols * w, 4), np.float32)
for i, im in enumerate(ims):
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); a = a.reshape(h, w, 4); r_, c_ = i // cols, i % cols
    y0 = (rows_ - 1 - r_) * h; canvas[y0:y0 + h, c_ * w:(c_ + 1) * w] = a
img = bpy.data.images.new('dcm', cols * w, rows_ * h); img.pixels.foreach_set(canvas.ravel()); img.filepath_raw = out; img.file_format = 'PNG'; img.save()
for p in paths: os.remove(p)
print('DIAG_CARRY2_RENDERED', out)
