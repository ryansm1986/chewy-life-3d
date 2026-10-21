# Lord Karakasa (Pawhaven enemy EN-1, the Fox Shrine's boss) -- the callout on the approved kasa-obake sheet.
# Deterministic build, from an empty scene, of public/models/kasa-lord.glb (one rigid `body` object):
#   blender --background --factory-startup --python build_kasa-lord.py
# Built on build_kasa-obake.py (imported: the same mesh kit, canopy builder, eye, sweep, decals, material, export);
# the game scales it x2.6, so it is 1.65 m to the crown's tip here (about 4.3 m in the game).
# Measured on refs/sheet.png's callout front: 124 px/m (crown tip y 668 .. ground y 873), axis x 1097.
#   upper tier   crimson pleated canopy, crown at z 1.43 .. hem z 0.85-0.90, r 0.53
#   lower tier   the second skirt below it, hem z 0.455-0.52, r 0.69, flattened at the front for the face
#   tassels      12 chunky ones (gold knot + cap, amber fringe lump) under the lower tier's creases
#   crown        a gold band, 7 ball-tipped points and a central knob round the top
#   ofuda        a cream paper talisman with its red mark lying on the upper tier's front, hung from the crown
#   face         the big eye under the upper brim, a heavy lid, blush, the long royal tongue down to the floor
#   wood         the kasa-obake's leg, knob, geta and strap, x1.15 sturdier
import bpy, math, os, sys, importlib.util
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kasa_base', os.path.join(HERE, 'build_kasa-obake.py'))
K = importlib.util.module_from_spec(spec); spec.loader.exec_module(K)
Part, grid, lathe, sweep, Surf, decal = K.Part, K.grid, K.lathe, K.sweep, K.Surf, K.decal
hexc, mixc, mulc, smooth, clamp, radial = K.hexc, K.mixc, K.mulc, K.smooth, K.clamp, K.radial
X, Y, Z = K.X, K.Y, K.Z
print('LORD build pid', os.getpid())

V = dict(canopy='#c8364a', valley='#8e2236', under='#561722')
C = dict(gold='#d5aa45', gold_hi='#ecc96a', gold_lo='#a9802c', fringe='#c9722f', fringe_lo='#a35424',
         paper='#f3e6c8', paper_edge='#d9c39c', ink_red='#c8302a', cord='#e2c98a', lid='#292125')

UPPER = dict(K.CANOPY,
    profile=[(1.430, 0.115), (1.400, 0.170), (1.234, 0.300), (1.030, 0.435), (0.950, 0.490), (0.900, 0.520)],
    np=12, phis=[0.0, 0.12, 0.35, 0.65, 0.88], z_top=1.430, z_m=0.950, s_rows=[0.0, 0.10, 0.30, 0.60, 1.0],
    hem_crease=0.905, hem_lobe=0.850, flat=0.20, flat_z=(1.00, 0.90), crease=(0.012, 0.050), rho=(0.028, 0.022), jit=0.006,
    under=[('lip', 0.040, 0.030), (0.280, 0.990)], pole0=1.434, pole1=1.060, top_hi=False)
LOWER = dict(K.CANOPY,
    profile=[(0.990, 0.420), (0.830, 0.520), (0.670, 0.610), (0.560, 0.665), (0.500, 0.690)],
    np=12, phis=[0.0, 0.12, 0.35, 0.65, 0.88], z_top=0.980, z_m=0.560, s_rows=[0.0, 0.35, 0.68, 1.0],
    hem_crease=0.520, hem_lobe=0.455, flat=0.30, flat_z=(0.98, 0.80), crease=(0.012, 0.055), rho=(0.030, 0.025),
    jit=0.006, under=[('lip', 0.045, 0.030), (0.400, 0.560), (0.090, 0.640)], pole0=0.984, pole1=0.660, top_hi=False)
EYE = dict(cz=0.645, a=0.225, b=0.215, c=0.205, tilt=math.radians(8), apex_y=-0.69, iris=0.58, pupil=0.35, lift=0.030)

# ------------------------------------------------------------------ the heavy lid (a band lying on the eye's top)
def build_lid(m):
    """the heavy lid: a thick dark band lying over the eyeball's top rim, along a line of latitude just in front of
    its equator (so it caps the white's top from the front AND from the 45 deg camera above), round ends at the sides"""
    Cc, Rr, U, F = K.eye_frame(); a, b, c = EYE['a'], EYE['b'], EYE['c']
    def ball(be, ps):
        e = Rr * (a * math.sin(be) * math.cos(ps)) + U * (b * math.sin(be) * math.sin(ps)) + F * (c * math.cos(be))
        n = (Rr * (e.dot(Rr) / a ** 2) + U * (e.dot(U) / b ** 2) + F * (e.dot(F) / c ** 2)).normalized()
        return Cc + e, n
    wf = lambda s: 0.026 + 0.020 * math.sin(math.pi * clamp(s)) ** 0.5
    tf = lambda s: 0.015 + 0.009 * math.sin(math.pi * clamp(s)) ** 0.5
    n_ = 13; path, Ws = [], []
    for i in range(n_):
        s = i / (n_ - 1); ps = math.radians(186 - 192 * s)
        be = math.radians(76 + 6 * (1 - math.sin(math.pi * s)))
        p, n = ball(be, ps)
        p1, _ = ball(be + 0.05, ps); p0, _ = ball(be - 0.05, ps)
        path.append(p + n * (tf(s) * 0.5)); Ws.append((p1 - p0).normalized())
    L = hexc(C['lid'])
    sweep(m, path, Ws, wf, tf, 8, lambda s, k: L, sup=2.6, cap_tip=0.9, cap_root=0.9)

# ------------------------------------------------------------------ the royal tongue (down to the floor)
def build_tongue(m):
    path = [Vector(p) for p in ((0.0, -0.40, 0.520), (0.006, -0.520, 0.452), (0.016, -0.605, 0.355),
                                (0.030, -0.650, 0.262), (0.042, -0.668, 0.190), (0.050, -0.672, 0.150))]
    Ws = [X.copy() for _ in path]
    wf = lambda s: 0.128 + 0.018 * smooth(0.0, 0.5, s)
    tf = lambda s: 0.048 - 0.010 * s
    ANG = [0, 28, 55, 74, 87, 90, 93, 106, 125, 152, 180, 210, 245, 270, 295, 330]
    TG, GR = hexc(K.COMMON['tongue']), hexc(K.COMMON['groove'])
    def groove(s, k):
        along = 1 - smooth(0.10, 0.62, s); a_ = ANG[k]
        across = 1.0 if a_ == 90 else (0.5 * (1 - smooth(0.0, 0.45, s)) if a_ in (87, 93) else 0.0)
        return along * across
    def dip(s, k):
        return 0.009 * (1 - smooth(0.3, 0.7, s)) if ANG[k] == 90 else (0.004 * (1 - smooth(0.2, 0.6, s)) if ANG[k] in (87, 93) else 0.0)
    sweep(m, path, Ws, wf, tf, 0, None, sup=3.0, cap_tip=0.85, cap_root=0.6, angles=ANG, dip=dip,
          colv=lambda s, k: mixc(TG, GR, groove(s, k)))

# ------------------------------------------------------------------ gold: tassels, crown
def build_tassels(m, creases):
    G, GH, FR, FL = (hexc(C[k]) for k in ('gold', 'gold_hi', 'fringe', 'fringe_lo'))
    prof = [(0, -0.282), (0.046, -0.274), (0.070, -0.238), (0.074, -0.172), (0.056, -0.106), (0.050, -0.064), (0.034, -0.022), (0, -0.006)]
    for i, (th, r, zb) in enumerate(creases):
        c = radial(th) * (r + 0.030); z0 = zb + 0.010     # (out past the lip, so the tassels show from 45 deg above)
        def col(j, k):
            if j <= 3:                       # the fringe lump: amber strands (alternate columns), darker at the bottom
                c_ = FR if k % 2 else mulc(FR, 0.88)
                return mixc(c_, FL, 0.6) if j == 0 else c_
            return GH if j == 5 else G       # the gold cap and knot, lit on top
        lathe(m, [(rr, z0 + dz) for rr, dz in prof], 10, col, th0=th, centre=(c.x, c.y))

def build_crown(m):
    G, GH, GL = (hexc(C[k]) for k in ('gold', 'gold_hi', 'gold_lo'))
    lathe(m, [(0, 1.405), (0.105, 1.410), (0.138, 1.425), (0.142, 1.452), (0.132, 1.475), (0.140, 1.495), (0.128, 1.505), (0, 1.500)],
          16, lambda j, k: GL if j <= 1 else (GH if j >= 5 else G), th0=math.pi / 16)
    for i in range(7):
        th = 2 * math.pi * i / 7; c = radial(th) * 0.116
        lathe(m, [(0, 1.485), (0.036, 1.490), (0.022, 1.540), (0.011, 1.588), (0.020, 1.603), (0.017, 1.621), (0, 1.628)],
              6, lambda j, k: GH if j >= 4 else G, th0=th, centre=(c.x, c.y))
    lathe(m, [(0, 1.490), (0.030, 1.495), (0.024, 1.560), (0.038, 1.600), (0.034, 1.628), (0.018, 1.646), (0, 1.652)],
          8, lambda j, k: GH if j >= 4 else G)

# ------------------------------------------------------------------ the ofuda talisman on the upper tier's front
def build_ofuda(m, surf_up):
    PA, PE, RED, CO = (hexc(C[k]) for k in ('paper', 'paper_edge', 'ink_red', 'cord'))
    US = [-0.115, -0.099, -0.045, 0.0, 0.045, 0.099, 0.115]
    ZS = [1.350, 1.335, 1.270, 1.190, 1.110, 1.030, 0.975, 0.960]
    top, bot = [], []
    for z in ZS:
        hit = [surf_up.cast(Vector((u, -1.0, z)), Y) for u in US]
        y0 = hit[3][0].y; n0 = hit[3][1]
        rt, rb = [], []
        for u, (loc, n) in zip(US, hit):
            yc = y0 + (loc.y - y0) * 0.75            # the paper bends a little round the cone, not into the pleats
            rt.append(Vector((u, yc - 0.013, z)))
            rb.append(Vector((u, loc.y + 0.008, z)))
        top.append(rt); bot.append(rb)
    R_, C_ = len(ZS), len(US)
    it = [[m.vert(p) for p in row] for row in top]; ib = [[m.vert(p) for p in row] for row in bot]
    out = Vector((0, -1, 0.45)).normalized()
    f0 = len(m.f)
    for j in range(R_ - 1):
        for k in range(C_ - 1):
            edge = j == 0 or j == R_ - 2 or k == 0 or k == C_ - 2
            m.face([it[j][k], it[j][k + 1], it[j + 1][k + 1], it[j + 1][k]], PE if edge else PA, out)
            m.face([ib[j][k], ib[j][k + 1], ib[j + 1][k + 1], ib[j + 1][k]], PE, -out)
    f1 = len(m.f)
    ring = [(0, k) for k in range(C_)] + [(j, C_ - 1) for j in range(1, R_)] + [(R_ - 1, k) for k in range(C_ - 2, -1, -1)] + [(j, 0) for j in range(R_ - 2, 0, -1)]
    cen = sum((p for row in top for p in row), Vector()) / (R_ * C_)
    for a_, b_ in zip(ring, ring[1:] + ring[:1]):
        q = [it[a_[0]][a_[1]], it[b_[0]][b_[1]], ib[b_[0]][b_[1]], ib[a_[0]][a_[1]]]
        fc = sum((m.v[i] for i in q), Vector()) / 4
        d = fc - cen; d.y = 0
        m.face(q, PE, d)
    m.finish_normals()
    s_card = Surf(m, (f0, f1 - 0))
    nc = (out).normalized()
    cz = 1.150
    decal(m, s_card, Vector((0, -0.5, cz)), Y, X, 0.056, 0.056, 16, [0.58, 1.0], 0.003, lambda j: PA if j == 0 else RED)
    decal(m, s_card, Vector((0, -0.5, cz)), Y, X, 0.017, 0.017, 10, [1.0], 0.005, lambda j: RED)
    for zc in (1.262, 1.036):
        decal(m, s_card, Vector((0, -0.5, zc)), Y, X, 0.011, 0.056, 10, [1.0], 0.004, lambda j: RED)
    # the cord: from the card's top up to the crown band
    ytop = top[0][3].y
    path = [Vector((0, ytop + 0.006, 1.338)), Vector((0, ytop - 0.012, 1.372)), Vector((0, -0.142, 1.415)), Vector((0, -0.128, 1.442))]
    Ws = [X.copy() for _ in path]
    sweep(m, path, Ws, lambda s: 0.014, lambda s: 0.013, 8, lambda s, k: CO, cap_tip=0.6, cap_root=0.6)

# ------------------------------------------------------------------ wood: the kasa-obake's leg + geta, sturdier
def build_wood(m, S=1.15):
    t = Part('tmp'); K.build_wood(t)
    keep = [f for f, cl in zip(t.f, t.fc) if all(t.v[i].z < 1.0 for i in f)]   # (drops the collar + finial)
    cls = [cl for f, cl in zip(t.f, t.fc) if all(t.v[i].z < 1.0 for i in f)]
    mp = {}
    for f, cl in zip(keep, cls):
        for i in f:
            if i not in mp: mp[i] = m.vert(t.v[i] * S)
        m.face([mp[i] for i in f], cl)

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K.EYE.clear(); K.EYE.update(EYE)
    mat = K.make_material()
    m = Part('body'); counts = {}
    t0 = m.tris(); f0 = len(m.f); build_creases = K.build_canopy(m, V, UPPER); f1 = len(m.f); counts['upper'] = m.tris() - t0
    t0 = m.tris(); creases = K.build_canopy(m, V, LOWER); f2 = len(m.f); counts['lower'] = m.tris() - t0
    t0 = m.tris(); K.build_eye(m); f3 = len(m.f); counts['eye'] = m.tris() - t0
    m.finish_normals()
    s_up = Surf(m, (f0, f1)); s_lo = Surf(m, (f1, f2))
    t0 = m.tris(); build_lid(m); counts['lid'] = m.tris() - t0
    t0 = m.tris()
    BL = hexc(K.COMMON['blush'])
    for side in (-1, 1):
        c = Vector((side * 0.300, -0.3, 0.590))
        loc, n = s_lo.cast(c - Y * 0.6, Y)
        decal(m, s_lo, loc, (-n + Y).normalized(), X, 0.075, 0.048, 18, [0.55, 1.0], 0.008, lambda j: BL)
    counts['blush'] = m.tris() - t0
    t0 = m.tris(); build_tongue(m); counts['tongue'] = m.tris() - t0
    t0 = m.tris(); build_tassels(m, creases); counts['tassels'] = m.tris() - t0
    t0 = m.tris(); build_crown(m); counts['crown'] = m.tris() - t0
    t0 = m.tris(); build_ofuda(m, s_up); counts['ofuda'] = m.tris() - t0
    t0 = m.tris(); build_wood(m); counts['wood'] = m.tris() - t0
    ob = K.to_object(m, mat)
    lo = Vector((min(v.x for v in m.v), min(v.y for v in m.v), min(v.z for v in m.v)))
    hi = Vector((max(v.x for v in m.v), max(v.y for v in m.v), max(v.z for v in m.v)))
    print('LORD tris %d %s | W%.3f D%.3f H%.3f | x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (
        m.tris(), counts, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    bad = sum(1 for p in ob.data.polygons if p.area < 1e-9)
    nan = any(any(math.isnan(c) for c in v) for v in m.v)
    print('LORD degenerate faces %d nan %s' % (bad, nan))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'kasa-lord.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(K.MODELS, 'kasa-lord.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError: bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('LORD wrote', out)

build()
