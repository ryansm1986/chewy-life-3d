# PAWHAVEN: the Whispering Bamboo Grove's landmark props (task rg-bamboo), built in Blender by script.
#   blender --background --factory-startup --python build_rg-bamboo.py -- --piece ruinedShrine|iwakura|all
# Deterministic: seeded PRNGs only; a re-run reproduces every GLB exactly.
# Frame: 1 unit = 1 m, Blender Z up; each prop sits in its kit piece's own local frame (src/regions/assets/bambooProps.js):
# the same origin, facing (the kit's +z, the approach, is Blender -Y), ground level and size. Layout code is written in
# the kit's game frame (x, y up, z front) and mapped to Blender (x, -z, y).
# Two kits, both reused from finished pieces:
#   base_kit.py  (the Takemori / Blossom Hollow landmarks): the mesh accumulator (per-vertex painted colours, per-object
#                materials), rounded boxes, beams, lathes, tubes, blobs, the game-frame transform stack, the hand-made warp
#   rg_kit.py    (the dungeon gates, exec'd into its own namespace DG): superellipsoid boulders with moss icing (rounded
#                drips, rolled bead edges), strip icing over swept beams, rounded-section beams, grass clumps, painters
# New here: a ray-cast AO pass over the whole prop, material buckets (body / stone / leaf / cloth / glow) as the game's
# kit piece buckets, cloth UVs (uv.y = 1 at the attached top, as the kit's B.cloth) and glow UVs (flicker, tint).
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('RG build pid', os.getpid())
_base = os.path.join(HERE, 'base_kit.py')
exec(compile(open(_base, encoding='utf-8').read(), _base, 'exec'))
_dg = os.path.join(HERE, 'rg_kit.py')
DG = {'__name__': 'rg_kit'}
exec(compile(open(_dg, encoding='utf-8').read(), _dg, 'exec'), DG)
DG['GROUND'] = -0.25                      # the buried skirt of grounded boulders (the kit's iwakura reaches y -0.25)
GL = DG['L']                              # game (x, y, z) -> Blender (x, -z, y), as gl()

# ================================================================== palette (sRGB)
STN = '#a49ca4'; STN_HI = '#d2cad0'; STN_LO = '#6e6678'
SLABS = ['#b8b0b8', '#aea6b2', '#c2b8b4', '#a8a0ac', '#bcb2aa']
MOSS_LO = '#557f36'; MOSS = '#79a446'; MOSS_HI = '#a8cc68'
VERM = '#d6573b'; VERM_DK = '#a53a28'; VERM_HI = '#f08a66'
INK = '#3a3040'
WOOD = '#94684e'; WOOD_DK = '#64463a'; WOOD_LT = '#c8a070'
STRAW = '#ecd6a0'; STRAW_DK = '#b89a5c'
PAPER = '#fff4e4'

# ================================================================== accumulation in material buckets
class RAsset(Asset2):
    def __init__(self):
        super().__init__(); self.uv = {}
A = None
def new_asset():
    global A
    A = RAsset()
    F.m = Matrix.Identity(4); F.st = []

class PTmp(Tmp):
    """a shell whose faces are already oriented by their hints (open shells too): no re-orientation"""
    def orient(self): return self

def put(t, col, tag, mat='body', uv=None):
    o = A.objs.get(mat); b = len(o['v']) if o else 0
    A.add(mat, mat, t, col, tag)
    if uv is not None:
        lst = A.uv.setdefault(mat, [])
        lst.extend([(0.0, 0.0)] * (b - len(lst)))
        lst.extend([uv(p) for p in A.objs[mat]['v'][b:]])
    return t

def add(t, col, tag='misc', glow=False):
    """(base_kit helpers such as pebble() add through this: stone, or glow)"""
    return put(t, col, tag, 'glow' if glow else 'stone')

def l2s(c): return tuple((12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055) for x in c[:3])
_pk = [0]
def putp(p, tag, mat='stone', uv=None):
    """a DG Part: its normals, painter (linear colours) -> a PTmp with per-vertex sRGB colours"""
    n = p.normals(); zs = [v.z for v in p.v]; p.zr = (min(zs), max(zs)); _pk[0] += 1; p.seed_off = _pk[0] * 3
    t = PTmp(); t.v = [v.copy() for v in p.v]; t.n = n; t.f = [list(f) for f in p.f]
    t.c = [l2s(p.paint(p, v, nn, m)) if p.paint else (0.8, 0.8, 0.8) for v, nn, m in zip(p.v, n, p.meta)]
    return put(t, None, tag, mat, uv)

# ================================================================== painters (base_kit style: (p, n) in Blender, sRGB)
def moss_col(seed=0, lo=MOSS_LO, mid=MOSS, hi=MOSS_HI):
    def f(p, n):
        c = mix(lo, mid, smooth(-0.15, 0.45, n.z))
        c = mix(c, hi, smooth(0.55, 0.95, n.z) * 0.8)
        g = vnoise(p, 2.6, seed + 11)
        c = mix(c, hi, clamp((g - 0.55) * 2.0) * 0.3)
        c = mix(c, lo, clamp((0.4 - g) * 2.2) * 0.3)
        return c
    return f

def stone_paint(base=STN, hi=STN_HI, lo=STN_LO, seed=0, moss=0.0, moss_up=0.55, mf=2.4):
    """stone: light tops, darker sides and undersides, soft mottling; optional moss on up-facing patches"""
    def f(p, n):
        c = mix(mul(base, 0.84), mix(base, hi, 0.55), clamp(n.z * 0.75 + 0.3))
        if n.z < 0: c = mix(c, lo, -n.z * 0.55)
        c = mul(c, 0.93 + 0.13 * vnoise(p, 3.2, seed))
        if moss > 0:
            m = (n.z - moss_up) * 2.5 + (vnoise(p, mf, seed + 7) - 0.5) * 2.2 - (1 - moss) * 1.2
            if m > 0: c = mix(c, mix(MOSS_LO, MOSS_HI, clamp(n.z) * 0.8), clamp(m * 1.6) * 0.9)
        return c
    return f

def lacq(base=VERM, dk=VERM_DK, hi=VERM_HI, moss_below=None, seed=0):
    def f(p, n):
        lam = n.dot(Vector((-0.45, -0.55, 0.7)).normalized())
        c = mix(dk, base, smooth(-0.55, 0.45, lam * 0.6))
        c = mix(c, hi, smooth(0.35, 0.85, lam) * 0.55)
        if n.z < -0.3: c = mul(c, 0.86)
        if moss_below is not None:
            lim = moss_below + (vnoise(p, 6.0, seed) - 0.5) * 0.3
            if p.z < lim: c = mix(c, '#6a9448', 0.65 * clamp((lim - p.z) / 0.15 + 0.4))
        return c
    return f

def TUFTP(part, q, n, meta):
    k = meta[1] if meta else 0.5
    return lin(mix(mix('#4a7a34', '#6ea444', k), '#b8dc78', smooth(0.5, 1.0, k) * 0.6))

def MOSSP(seed): return DG['moss_painter'](lo='#4c7632', mid='#6e9c40', hi='#9cc260', seed=seed)

def DGpaint(fn):
    """a base_kit (p, n) -> sRGB painter as a DG painter (part, p, n, meta) -> linear"""
    return lambda part, p, n, meta: lin(fn(p, n))

# ================================================================== shared shapes (game-local frame)
def slab_t(w, d, top, bottom=-0.1, rc=0.12, rb=0.04, nc=2, dish=0.008, wob=0.015, seed=1):
    """a rounded-rectangle flagstone: rounded corners, a rolled top edge, a slightly dished top, sides to `bottom`
    (no bottom face: it sits in the ground). Game-local, centred on x/z; placed by the F stack."""
    rnd = random.Random(seed); hx, hz = w / 2, d / 2; rc = min(rc, hx * 0.9, hz * 0.9)
    outl = []
    for k, (sx, sz) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        a0 = k * PI / 2; cx, cz = sx * (hx - rc), sz * (hz - rc)
        for j in range(nc + 1):
            a = a0 + PI / 2 * j / nc; outl.append((cx + math.cos(a) * rc, cz + math.sin(a) * rc))
    jit = [1 + rnd.uniform(-1, 1) * wob for _ in outl]
    def ring(inset, y, flare=0.0):
        out = []
        for (x, z), j in zip(outl, jit):
            r = math.hypot(x, z); k = max(0.0, (r - inset) / r) * j + flare / max(r, 1e-6)
            out.append(F.W((x * k, y + (j - 1) * 0.3 * rb, z * k)))
        return out
    t = PTmp()
    rings = [ring(rb * 1.1, top), ring(rb * 0.32, top - rb * 0.3), ring(0.0, top - rb), ring(-0.02, bottom, 0.02)]
    mid = F.W((0, (top + bottom) / 2, 0))
    ring_surface(t, rings, [mid] * 4, pole0=F.W((0, top - dish, 0)))
    return t

def slab_col(base, M, hx, hz, moss=0.5, seed=0):
    """flagstone paint: light top, shaded rim and sides; moss creeping in from the joints and corners"""
    Mi = M.inverted()
    def f(p, n):
        lp = Mi @ p
        e = min(hx - abs(lp.x), hz - abs(lp.y))
        c = mix(mul(base, 0.8), mix(base, '#f6f0ea', 0.28), clamp(n.z * 0.8 + 0.2))
        if n.z < 0.5: c = mul(c, 0.86)
        c = mul(c, 0.93 + 0.13 * vnoise(p, 2.6, seed))
        m = (0.1 - e) / 0.1 * 0.9 + (vnoise(p, 1.9, seed + 5) - 0.5) * 1.2 - (1 - moss) * 1.0 + (0.6 if n.z < 0.5 else -0.25)
        if m > 0: c = mix(c, mix(MOSS_LO, MOSS, clamp(n.z + 0.3)), clamp(m * 1.7) * 0.85)
        return c
    return f

def flagstone(w, d, top, pos, ry=0.0, rx=0.0, rz=0.0, base='#b8b0b8', moss=0.5, seed=1, rc=0.11, tag='platform', bottom=-0.12, nc=1):
    with at(pos, ry=ry, rx=rx, rz=rz):
        M = F.m.copy()
        t = slab_t(w, d, top, bottom=bottom, rc=rc, seed=seed, nc=nc)
    put(t, slab_col(base, M, w / 2, d / 2, moss, seed), tag, 'stone')

def moss_blob(pos, r, h, seed=0, lobes=5, K=16, tag='mossdrift', amp=0.11):
    """a moss cushion / drift: a lobed squat lathe resting at pos (game-local)"""
    put(dome(F.W(pos), r, h, lobes=lobes, K=K, seed=seed, amp=amp), moss_col(seed), tag, 'stone')

def dome(c, r, h, lobes=5, K=12, seed=0, amp=0.11):
    """a soft pillowy dome (a moss cushion): rounded rim, domed top, a gently lobed outline, its foot tucked under"""
    ph = seed * 1.7
    t = lathe([(0.0, -0.02), (r * 0.94, -0.02), (r, h * 0.28), (r * 0.82, h * 0.72), (r * 0.42, h * 0.97), (0.0, h)], K, th0=ph,
              rfn=lambda rr, z, th: rr * (1 + amp * math.cos(lobes * th + ph) + 0.05 * math.sin(3 * th + seed)))
    return t.xform(Matrix.Translation(c))

def PTmp_from(t):
    """re-wrap a closed base_kit Tmp (orientation by hints is fine) so it keeps its winding"""
    return t

def frond(base, d, L, wdt, droop, lobes=3, up=Vector((0, 0, 1)), seed=0):
    """a chunky fern frond (Blender coords): a folded blade with lobed sides, double-faced (top / under)"""
    d = d.normalized(); side = d.cross(up)
    if side.length < 1e-6: side = Vector((1, 0, 0))
    side.normalize(); nrm = side.cross(d).normalized()
    if nrm.z < 0: nrm = -nrm
    n = 2 * lobes + 2
    t = PTmp(); top, und = [], []
    for i in range(n + 1):
        s = i / n
        c = base + d * (L * s) - up * (droop * L * s * s)
        wv = wdt * math.sin(PI * min(1.0, s * 1.08) ** 0.8) * (1.0 if (i % 2 == 1 or i == 0) else 0.62)
        if i == n: wv = 0.0
        fold = nrm * (wv * 0.35)
        row = [c - side * wv, c + fold, c + side * wv]
        top.append([t.vert(q) for q in row]); und.append([t.vert(q - nrm * 0.012) for q in row])
    for i in range(n):
        for k in range(2):
            q = [top[i][k], top[i][k + 1], top[i + 1][k + 1], top[i + 1][k]]
            t.face(q, nrm)
            q = [und[i][k], und[i][k + 1], und[i + 1][k + 1], und[i + 1][k]]
            t.face(q, -nrm)
    t.normals()
    return t

def fern(pos, n=5, L=0.5, wdt=0.09, seed=0, tag='fern', tilt=0.65):
    rnd = random.Random(seed); c0 = F.W(pos)
    for k in range(n):
        a = TAU * k / n + rnd.uniform(-0.3, 0.3)
        el = tilt + rnd.uniform(-0.15, 0.15)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        t = frond(c0 + Vector((0, 0, 0.01)), d, L * rnd.uniform(0.8, 1.1), wdt, 0.45, lobes=2, seed=seed + k)
        g0 = '#4f8a3c'; g1 = '#9ccc62'
        put(t, lambda p, nn, c0=c0, L=L: mix(g0, g1, clamp((p - c0).length / L) * 0.75 + clamp(nn.z) * 0.25), tag, 'leaf')

def grass(pos, seed=0, tag='grass', nb=None, normal=Vector((0, 0, 1))):
    rnd = random.Random(seed)
    p = DG['Part']('grass_%d' % seed, 'flower', ao=0.3)
    outw = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)).normalized()
    DG['grass_clump'](p, F.W(pos), normal, outw, rnd, nb=nb)
    def gp(part, q, n, meta):
        k = meta[1] if meta else 0.5
        return lin(mix(mix('#4a7a34', '#6ea444', k), '#b8dc78', smooth(0.5, 1.0, k) * 0.6))
    p.paint = gp
    putp(p, tag, 'leaf')

def flower5(pos, nrm=Vector((0, 0, 1)), r=0.06, petal='#ff9ec0', centre='#ffd24a', seed=0, tag='flowers'):
    p = DG['flower']('fl_%d' % seed, F.W(pos), nrm, r, petal, centre, seed=seed)
    putp(p, tag, 'body')

def shide_tabs(top, out, tag='shide', scale=1.0, surf=None, span=0.3, n=4):
    """zigzag paper shide: four 3 cm thick tabs stepping down from `top` (Blender), facing `out` (horizontal);
    surf(z) -> (point, normal) lays them over a curved surface. Cloth UVs: uv.y = 1 at the top (attached)."""
    out = Vector((out.x, out.y, 0)).normalized(); side = Vector((0, 0, 1)).cross(out).normalized()
    w, h, th = 0.12 * scale, 0.1 * scale, 0.03
    yTop = top.z; yBot = yTop - span
    for k in range(n):
        x = (0.05 if k % 2 else -0.05) * scale
        zc = top.z - h * (k + 0.5) + 0.012 * k
        c = top + side * x
        c.z = zc
        nn = out
        if surf is not None:
            sp, sn = surf(zc, top + side * x)
            c = sp + sn * (th / 2 + 0.012 + 0.006 * k); nn = sn
        # a box whose faces are its own (flat shading): tab plane spanned by side and the surface's down tangent,
        # every other tab turned a little about the surface normal (the lightning-bolt zigzag)
        dn = side.cross(nn).normalized()
        if dn.z > 0: dn = -dn
        Rk = Matrix.Rotation((0.28 if k % 2 else -0.28), 3, nn)
        side_k = Rk @ side; dn = Rk @ dn
        t = PTmp()
        corners = {}
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    corners[(sx, sy, sz)] = c + side_k * (sx * w / 2) + dn * (sy * (h / 2 + 0.006)) + nn * (sz * th / 2)
        for ax_, n_ in ((0, side_k), (1, dn), (2, nn)):
            for s in (-1, 1):
                quad = []
                for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    key = [0, 0, 0]; key[ax_] = s; o_ = [i for i in range(3) if i != ax_]; key[o_[0]] = u; key[o_[1]] = v
                    quad.append(t.vert(corners[tuple(key)], n_ * s))
                t.face(quad, n_ * s)
        put(t, lambda p, n: mix(mul(PAPER, 0.9), PAPER, clamp(n.z * 0.5 + 0.6)), tag, 'cloth',
            uv=lambda p, yTop=yTop, yBot=yBot, c=c, side=side: (0.5 + (p - c).dot(side) / 0.3, clamp((p.z - yBot) / (yTop - yBot))))

def rope_col(phase_fn):
    def f(p, n):
        ph = phase_fn(p, n)
        c = mix(STRAW_DK, STRAW, 0.2 + 0.8 * (0.5 + 0.5 * math.cos(ph)) ** 0.8)
        return mul(c, 0.86 + 0.16 * clamp(n.z * 0.5 + 0.5))
    return f

# ================================================================== AO and export
def ray_ao(skip=('glow', 'cloth'), NR=24, DMAX=0.85, K=0.62, weights=None):
    weights = weights or {}
    allv, allf = [], []
    for k, o in A.objs.items():
        b = len(allv); allv += o['v']
        for f in o['f']:
            for q in range(1, len(f) - 1): allf.append([f[0] + b, f[q] + b, f[q + 1] + b])
    b = len(allv); allv += [Vector((-14, -14, 0)), Vector((14, -14, 0)), Vector((14, 14, 0)), Vector((-14, 14, 0))]
    allf += [[b, b + 1, b + 2], [b, b + 2, b + 3]]
    bvh = BVHTree.FromPolygons(allv, allf)
    dirs = []; ga = PI * (3 - math.sqrt(5))
    for k in range(NR):
        r = math.sqrt((k + 0.5) / NR); a = k * ga
        x, y = r * math.cos(a), r * math.sin(a); dirs.append(Vector((x, y, math.sqrt(max(0.0, 1 - x * x - y * y)))))
    for k, o in A.objs.items():
        if k in skip: continue
        w = weights.get(k, 1.0)
        for i, (v, n) in enumerate(zip(o['v'], o['n'])):
            if v.z < -0.06: continue
            q = n.to_track_quat('Z', 'Y'); occ = 0.0; org = v + n * 0.012
            for d in dirs:
                hit = bvh.ray_cast(org, q @ d, DMAX)
                if hit[0] is not None: occ += 1 - hit[3] / DMAX
            occ /= NR
            kk = 1 - w * clamp(occ * 1.25) * K
            c = o['c'][i]; o['c'][i] = (c[0] * kk, c[1] * kk, c[2] * kk, 1.0)

def export_piece(name, info):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for m in A.objs:
        mt = bpy.data.materials.new(m); mt.use_nodes = True; nt = mt.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        if m == 'glow':
            bsdf.inputs['Emission Color'].default_value = lin('#ffd890'); bsdf.inputs['Emission Strength'].default_value = 1.0
        if m in ('cloth', 'leaf'): mt.use_backface_culling = False
        mats[m] = mt
    obs = []
    for k, o in A.objs.items():
        ob = to_object(k, o, mats)
        if k != 'stone':  # (the game's batches need the kit's attribute set: its body / leaf / glow / cloth carry uv, d:stone's slabs don't)
            uvs = A.uv.get(k, []) + [(0.0, 0.0)] * (len(o['v']) - len(A.uv.get(k, [])))
            me = ob.data; ul = me.uv_layers.new(name='UVMap')
            data = []
            for li in range(len(me.loops)): data.extend(uvs[me.loops[li].vertex_index])
            ul.data.foreach_set('uv', data)
        obs.append(ob)
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('RG %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('RG %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('RG %s bounds game x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('RG %s check %s %s' % (name, ob.name, check(ob)))
    print('RG %s info %s' % (name, info))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('RG export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('RG wrote', out)

# ================================================================== 1. the ruined shrine (kit ruinedShrine, ~6 x 5 m)
PT = 0.18     # the platform's top

def roof_gable(LX=0.9, DZ=0.74, YE=1.42, YR=1.98, TH=0.1, NR=0, sag=0.045, NX=8, tag='roof'):
    """the hokora's gable roof in the current frame (ridge along x, the front slope toward +z): a curved slab with
    rounded tile rolls, eaves turned up at the corners, the ridge sagging a little; dark weathered teal-grey"""
    vs = [-1.0, -0.72, -0.42, -0.14, 0.0, 0.14, 0.42, 0.72, 1.0]
    def top_y(x, v):
        tt = (math.sqrt(v * v + 0.012) - math.sqrt(0.012)) / (math.sqrt(1.012) - math.sqrt(0.012)); u = abs(x) / LX   # (a rounded ridge)
        f = tt * (1 + 0.55 * (1 - tt))
        y = YR - (YR - YE) * f
        y += 0.06 * tt ** 5 * (0.35 + 0.65 * u ** 3)
        y -= sag * (1 - u * u) * (1 - 0.6 * tt)
        return y
    def roll(x): return 0.5 - 0.5 * math.cos(TAU * (x / (2 * LX) + 0.5) * NR) if NR else 1.0
    def profile(x):
        top = [(v * DZ, top_y(x, v) + 0.02 * roll(x) * smooth(0.0, 0.25, abs(v))) for v in vs]
        und = [(v * (DZ - 0.014), top_y(x, v) - TH + 0.014 * abs(v)) for v in reversed(vs)]
        return top + [(DZ + 0.026, top_y(x, 1) - TH * 0.45)] + und + [(-DZ - 0.026, top_y(x, -1) - TH * 0.45)]
    xs = [-LX + 2 * LX * i / NX for i in range(NX + 1)]
    rf = PTmp(); rings = []; cs = []
    # (profile w: + toward the back = game -z)
    for x in xs:
        rings.append([F.W((x, y, -w)) for w, y in profile(x)]); cs.append(F.W((x, YR - 0.2, 0)))
    n = len(vs)
    def inset(ring, xd):
        outr = []
        for k, p in enumerate(ring):
            if k < n: q = ring[n + 1 + (n - 1 - k)]
            elif k == n: q = ring[k]
            elif k < 2 * n + 1: q = ring[n - 1 - (k - n - 1)]
            else: q = ring[k]
            m = (p + q) / 2
            outr.append(m + (p - m) * 0.55 + F.N((1, 0, 0)) * xd)
        return outr
    rings = [inset(rings[0], -0.014)] + rings + [inset(rings[-1], 0.014)]
    cs = [cs[0] - F.N((1, 0, 0)) * 0.014] + cs + [cs[-1] + F.N((1, 0, 0)) * 0.014]
    ids = ring_surface(rf, rings, cs)
    for a, sgn in ((ids[0], -1), (ids[-1], 1)):
        nrm = F.N((1, 0, 0)) * sgn
        for k in range(n - 1):
            p0, p1 = a[k], a[k + 1]; q0, q1 = a[n + 1 + (n - 1 - k)], a[n + 1 + (n - 1 - (k + 1))]
            rf.face([p0, p1, q1, q0], nrm)
        rf.face([a[n - 1], a[n], a[n + 1]], nrm); rf.face([a[0], a[2 * n + 1], a[2 * n]], nrm)
    rf.normals()
    Mi = F.m.inverted()
    RC, RCH, RCL = '#5e7a72', '#86a49a', '#33463f'
    def col(p, nn):
        lp = Mi @ p; x = lp.x; v = clamp(-lp.y / DZ, -1, 1)
        ln = (Mi.to_3x3() @ nn).normalized()
        if ln.z < -0.35: return mul(RCL, 0.9)                                  # the underside: deep shade
        if abs(ln.x) > 0.8: return mix(RCL, RC, 0.45)                          # gable ends
        if abs(ln.z) < 0.5: return mix(RCL, RC, 0.55)                          # eave rims
        c = mix(RC, RCH, 0.5 - 0.5 * abs(v) ** 1.3)
        c = mul(c, 0.7 + 0.3 * roll(x) ** 0.7)
        c = mul(c, 0.9 + 0.16 * vnoise(Vector((p.x * 3.0, p.y * 0.8, p.z * 0.8)), 3.0, 4))
        return c
    put(rf, col, tag, 'body')
    def Sf(s, a):
        """the roof's top surface: s along the ridge (x), a across (-1 front .. 1 back) -> (point, normal) in Blender"""
        P = F.W((s, top_y(s, a) + 0.012, -a * DZ))
        e = 1e-3
        dx = F.W((s + e, top_y(s + e, a), -a * DZ)) - F.W((s - e, top_y(s - e, a), -a * DZ))
        da = F.W((s, top_y(s, a + e), -(a + e) * DZ)) - F.W((s, top_y(s, a - e), -(a - e) * DZ))
        nn = dx.cross(da).normalized()
        if nn.z < 0: nn = -nn
        return P, nn
    return dict(top_y=top_y, Sf=Sf, LX=LX, DZ=DZ)

def kitsune(sx):
    """a little round kitsune guardian in a red bib on a mossy plinth (current frame: the plinth's foot, facing +z)"""
    ST = '#d6ccc8'
    pl = rbox((0.44, 0.44, 0.33), r=0.05, M=F.m @ lm((0, 0.165, 0)))
    put(pl, stone_paint('#aaa2aa', seed=12 + sx, moss=0.65, moss_up=0.35), 'kitsune', 'stone')
    stc = stone_paint(ST, hi='#f4eeea', lo='#9a9098', seed=20 + sx)
    put(sph(0.16, (0, 0.5, -0.02), sc=(0.92, 1.18, 0.92), K=8, J=4), stc, 'kitsune', 'stone')
    put(sph(0.125, (0, 0.74, 0.03), sc=(1.0, 0.92, 1.0), K=8, J=4), stc, 'kitsune', 'stone')
    put(glathe([(0.0, 0.0), (0.062, 0.0), (0.04, 0.09), (0.0, 0.15)], 7, pos=(0, 0.715, 0.1), rx=PI / 2), stc, 'kitsune', 'stone')
    put(sph(0.024, (0, 0.715, 0.25), K=5, J=2), flat('#4a3c48'), 'kitsune', 'stone')
    for e in (-1, 1):
        put(glathe([(0.0, 0.0), (0.05, 0.0), (0.0, 0.15)], 4, pos=(e * 0.07, 0.83, 0.0), rz=-e * 0.32, ry=PI / 4), stc, 'kitsune', 'stone')
        put(glathe([(0.0, 0.0), (0.028, 0.0), (0.0, 0.1)], 4, pos=(e * 0.072, 0.845, 0.012), rz=-e * 0.32, ry=PI / 4),
            flat('#c87a6a'), 'kitsune', 'stone')
        put(box(0.045, 0.014, 0.016, (e * 0.05, 0.765, 0.142), r=0.0, rz=e * 0.35), flat('#4a3c48'), 'kitsune', 'stone')
    # the bushy tail curling up its side, a light tip
    pts = [(sx * 0.1, 0.37, -0.12), (sx * 0.22, 0.47, -0.08), (sx * 0.22, 0.64, -0.02), (sx * 0.13, 0.78, -0.02)]
    rads = lambda s: 0.045 + 0.06 * math.sin(PI * min(1.0, s * 1.15))
    put(gtube(pts, rads, K=5), lambda p, n: mix(mul(ST, 0.86), '#f4eeea', clamp(n.z * 0.6 + 0.3)), 'kitsune', 'stone')
    # the red bib with a gold jewel
    redc = lambda p, n: mix('#a82c28', '#f06a50', clamp(n.z * 0.45 + 0.35 - n.y * 0.35))
    put(gloop([(0.105 * math.cos(TAU * k / 8), 0.64, 0.105 * math.sin(TAU * k / 8) - 0.0) for k in range(8)], 0.024, K=3), redc, 'kitsune', 'body')
    with at((0, 0.545, 0.1), rx=-0.24):
        tri = [(-0.115, 0.085), (0.115, 0.085), (0.075, 0.0), (0.03, -0.075), (0.0, -0.095), (-0.03, -0.075), (-0.075, 0.0)]
        put(prism(tri, 0.03, 0.0), redc, 'kitsune', 'body')
        put(sph(0.03, (0, 0.035, 0.045), K=6, J=3), lac('#f0bc4a', '#ffe08a', '#b8862a'), 'kitsune', 'body')

def broken_end(part, beam, at_end, amp=0.06, seed=0):
    """jag a DG Beam's cap into a snapped end (verts beyond the beam's length pushed in and out along it)"""
    rnd = random.Random(seed)
    T = (beam.path(1.0) - beam.path(0.98)).normalized() if at_end else (beam.path(0.0) - beam.path(0.02)).normalized()
    for i, m in enumerate(part.meta):
        if not m or m[0] != 'beam': continue
        v = m[2]
        if (at_end and v > beam.len) or ((not at_end) and v < 0):
            a = m[1] if m[1] is not None else 0.0
            j = amp * (0.6 * math.sin(3 * a + seed) + 0.4 * math.sin(5 * a + 2 * seed))
            part.v[i] = part.v[i] + T * j
    return part

def raw_or(paint, beam, at_end, raw='#d8a878'):
    def f(part, p, n, meta):
        c = paint(part, p, n, meta)
        if meta and meta[0] == 'beam':
            v = meta[2]
            if (at_end and v > beam.len + 0.004) or ((not at_end) and v < -0.004): return lin(mix(raw, mul(raw, 0.8), 0.5 - 0.5 * n.z))
        return c
    return f

def build_ruinedShrine():
    new_asset(); rng = random.Random(31)
    # ---------------- the cracked platform: 4 x 3 big slabs (one heaved, one sunk, one cracked in two, a corner gone)
    xs = [-1.53, -0.51, 0.51, 1.53]; zs = [-1.89, -0.81, 0.27]
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            sd = 100 + i * 7 + j * 13; base = SLABS[(i * 3 + j * 2) % len(SLABS)]
            if (i, j) == (3, 0): continue                                   # the back-right corner: gone
            if (i, j) == (0, 2):                                            # the front-left: cracked in two, one half tipped
                flagstone(0.44, 0.98, PT, (x - 0.255, 0, z), ry=0.03, base=base, moss=0.6, seed=sd)
                flagstone(0.46, 0.98, PT + 0.01, (x + 0.245, 0.0, z + 0.02), ry=-0.06, rz=0.1, base=base, moss=0.5, seed=sd + 1)
                continue
            y = 0.0; rx = rng.uniform(-0.015, 0.015); rz = rng.uniform(-0.015, 0.015)
            if (i, j) == (3, 1): rx, rz = -0.1, 0.12                       # heaved by a root
            if (i, j) == (1, 0): y = -0.06                                  # sunk
            flagstone(0.98 + rng.uniform(-0.02, 0.01), 1.02 + rng.uniform(-0.02, 0.01), PT, (x + rng.uniform(-0.02, 0.02), y, z + rng.uniform(-0.02, 0.02)),
                      ry=rng.uniform(-0.04, 0.04), rx=rx, rz=rz, base=base, moss=0.45 + 0.2 * ((i + j) % 2), seed=sd)
    # rubble where the corner slab went: a broken chunk, pebbles, moss
    for k, (px, pz, pr) in ():
        pebble((px, -0.03, pz), pr, sq=0.7, seed=180 + k, col=STONES[2], tag='rubble', K=6)
    # ---------------- front steps
    flagstone(1.62, 0.44, 0.115, (0.0, 0, 1.05), ry=0.02, base=SLABS[3], moss=0.45, seed=191)
    flagstone(1.42, 0.42, 0.05, (0.03, 0, 1.47), ry=-0.03, base=SLABS[0], moss=0.55, seed=192)
    # ---------------- the hokora (kit B.at([0, 0.16, -1.0]))
    HY = PT - 0.02
    with at((0, HY, -1.0), ry=0.03):
        put(rbox((1.3, 1.0, 0.3), r=0.06, M=F.m @ lm((0, 0.15, 0))), stone_paint('#aaa2a8', seed=31, moss=0.55, moss_up=0.45), 'hokora', 'stone')
        put(rbox((1.36, 1.06, 0.06), r=0.028, M=F.m @ lm((0, 0.31, 0))), stone_paint('#b8b0b4', seed=32, moss=0.45, moss_up=0.5), 'hokora', 'stone')
        B0 = 0.34
        WB = '#8e664e'
        def wallc(p, n):
            c = mix(mul(WB, 0.82), mix(WB, '#c89a78', 0.3), clamp(n.z * 0.5 + 0.5))
            c = mul(c, 0.9 + 0.12 * vnoise(Vector((p.x * 6, p.y * 6, p.z * 0.8)), 1.0, 3))
            g = clamp(1 - (p.z - (HY + B0)) / 0.32 + (vnoise(p, 4, 9) - 0.5) * 0.8)
            return mix(c, '#6a8a4a', g * 0.55)
        put(box(1.0, 0.92, 0.8, (0, B0 + 0.46, 0), r=0.035), wallc, 'hokora', 'body')
        for px_ in (-1, 1):
            for pz_ in (-1, 1):
                put(beam(0.1, 1.0, 0.1, (px_ * 0.5, B0 + 0.5, pz_ * 0.4), c=0.025), wood(WOOD_DK, ao_z=HY + B0, seed=px_ + pz_), 'hokora', 'body')
        put(beam(1.12, 0.1, 0.12, (0, B0 + 0.06, 0.42), c=0.025), wood(WOOD_DK), 'hokora', 'body')
        put(beam(1.16, 0.12, 0.14, (0, B0 + 0.98, 0.42), c=0.03), wood(WOOD_DK), 'hokora', 'body')
        # the lattice doors (one pane broken in)
        for sxd in (-1, 1):
            put(box(0.42, 0.7, 0.04, (sxd * 0.215, B0 + 0.47, 0.41), r=0.012), lambda p, n: mix('#3c2a24', '#5a4034', clamp(n.z + 0.3)), 'doors', 'body')
            for k in range(4):
                put(box(0.4, 0.035, 0.03, (sxd * 0.215, B0 + 0.2 + k * 0.17, 0.44), r=0.0), soft('#c8a878', 0.2), 'doors', 'body')
            put(box(0.035, 0.66, 0.03, (sxd * 0.215, B0 + 0.47, 0.443), r=0.0), soft('#c8a878', 0.2), 'doors', 'body')
        put(box(0.14, 0.18, 0.02, (0.3, B0 + 0.62, 0.465), r=0.0), flat('#1e1618'), 'doors', 'body')
        # the roof, its moss icing (strip over the ridge with rounded drips down both slopes), cushions and a fern
        R = roof_gable(YE=B0 + 1.05, YR=B0 + 1.62)
        # the gable infill under the roof (wood), between the wall top and the roof's underside
        gp = [(0.43, B0 + 0.9)] + [(-zz, R['top_y'](0.0, zz / R['DZ']) - 0.105) for zz in (-0.43, -0.3, -0.15, 0.0, 0.15, 0.3, 0.43)] + [(-0.43, B0 + 0.9)]
        with at((0, 0, 0), ry=PI / 2):
            put(prism(gp, 0.96, -0.48), lambda p, n: mix(mul(WOOD_DK, 0.75), WOOD_DK, clamp(n.z * 0.5 + 0.5)), 'hokora', 'body')
        dfront = [(-0.5, 0.3, 0.2), (-0.05, 0.4, 0.24), (0.45, 0.26, 0.2)]
        dback = [(-0.4, 0.3, 0.24), (0.3, 0.34, 0.24)]
        a0, a1 = -R['LX'] + 0.04, R['LX'] - 0.04
        def taper(s): return math.sqrt(max(0.0, math.sin(PI * clamp((s - a0) / (a1 - a0)))))
        def lo(s): return -(0.38 + 0.03 * math.sin(s * 5) + sum(d * math.exp(-((s - c) / w_) ** 2) for c, d, w_ in dfront)) * taper(s) - 0.02
        def hi(s): return (0.42 + 0.04 * math.sin(s * 5 + 1) + sum(d * math.exp(-((s - c) / w_) ** 2) for c, d, w_ in dback)) * taper(s) + 0.02
        mp = DG['strip_moss']('roof_moss', R['Sf'], a0, a1, 18, lo, hi, 0.055, MOSSP(3), ncross=7)
        putp(mp, 'roofmoss', 'stone')
        for k, (x, v, r_) in enumerate([(0.42, -0.2, 0.12)]):
            y = R['top_y'](x, v)
            moss_blob((x, y + 0.02, -v * R['DZ']), r_, r_ * 0.6, seed=40 + k, lobes=3, K=10, amp=0.06)
        with at((-0.22, R['top_y'](-0.22, 0) + 0.03, 0.0)):
            fern((0, 0, 0), n=4, L=0.48, wdt=0.1, seed=51, tag='roofFern', tilt=0.75)
        # the shimenawa under the eave, three shide
        ry_ = B0 + 0.9; fz = 0.5
        spts = [F.W((-0.5 + 1.0 * k / 10, ry_ - 0.08 * math.sin(PI * k / 10), fz + 0.01 * math.sin(PI * k / 10))) for k in range(11)]
        put(tube(spts, lambda s: 0.03 + 0.016 * math.sin(PI * s), K=6), rope_col(lambda p, n: p.x * 60 + math.atan2(n.z, -n.y) * 2), 'shimenawa', 'body')
        for k, x in enumerate((-0.25, 0.0, 0.25)):
            tt = 0.5 + x
            top = F.W((x, ry_ - 0.08 * math.sin(PI * tt) - 0.04, fz + 0.03))
            shide_tabs(top, F.N((0, 0, 1)), scale=0.62, tag='shide')
        # the offering box (saisen-bako) and two bamboo candle stands with lit candles (the kit's light at (0, 1.0, 0.2))
        with at((0, -HY + PT, 0.74)):
            put(box(0.48, 0.24, 0.28, (0, 0.12, 0), r=0.025), wood('#7a5640', ao_z=PT, seed=5), 'offering', 'body')
            for k in range(4): put(box(0.44, 0.024, 0.035, (0, 0.25, -0.09 + k * 0.06), r=0.0), soft('#4a3228', 0.2), 'offering', 'body')
    for sxc in (-1, 1):
        cx, cz = sxc * 0.5, -0.12
        with at((cx, PT, cz)):
            bpole = gtube([(0, 0.03, 0), (0, 0.72, 0)], 0.035, K=6)
            put(bpole, lambda p, n: mix('#8aa858', '#c8d888', clamp(n.z * 0.5 + 0.4 - n.y * 0.2)), 'candles', 'body')
            put(glathe([(0.0, 0.70), (0.075, 0.70), (0.085, 0.74), (0.07, 0.75), (0.0, 0.75)], 7), soft('#5a4640', 0.3), 'candles', 'body')
            put(cyl(0.042, 0.045, 0.13, (0, 0.81, 0), K=7), lambda p, n: mix('#f2e6d0', '#fff6ea', clamp(n.z)), 'candles', 'body')
            put(glathe([(0.0, 0.875), (0.032, 0.9), (0.03, 0.94), (0.0, 1.0)], 6), lambda p, n: '#ffe7a8', 'flame', 'glow',
                uv=lambda p: (0.7, 0.0))
    # ---------------- the broken torii (kit B.at([-1.2, 0, 2.3])): one post standing with half its lintel
    TX, TZ = -1.2, 2.3; L_ = GL
    REDP = DG['lacquer_painter'](VERM, VERM_DK, VERM_HI, spec='#ffd0b4', moss_below=0.55, seed=4)
    REDB = DG['lacquer_painter'](VERM, VERM_DK, VERM_HI, spec='#ffd0b4', seed=5)
    BLK = DG['lacquer_painter']('#3a3040', '#241e2a', '#5a4c62', spec='#a898b4', sheen=0.6)
    post = DG['Beam'](lambda s: L_(TX + 0.03 * s, -0.1 + 2.36 * s, TZ), Vector((1, 0, 0)), lambda s: 0.14 - 0.02 * s, lambda s: 0.14 - 0.02 * s, e=1.0, cap=0.05)
    putp(post.build('post', 'torii', REDP, K=9, step=0.8, capn=1), 'torii', 'body')
    putp(DG['lathe']('plinth', 'torii', DGpaint(stone_paint('#7a7280', seed=8, moss=0.7, moss_up=0.3)), L_(TX, 0, TZ),
                     [(0.25, -0.1), (0.24, 0.12), (0.205, 0.23), (0.15, 0.27)], K=10), 'torii', 'stone')
    for (y0, r0, hh) in ((0.34, 0.158, 0.07), (2.12, 0.135, 0.055)):
        putp(DG['lathe']('band', 'torii', BLK, L_(TX + 0.03 * (y0 + 0.1) / 2.36, y0, TZ), [(r0 * 0.92, -hh), (r0, -hh * 0.5), (r0, hh * 0.5), (r0 * 0.92, hh)], K=10), 'torii', 'body')
    # half the shimaki (red) under half the kasagi (black, mossy): the intact upswept end at -x, snapped at +x, sagging
    def lint(x0, x1, y0, sagk, up_end):
        return lambda s: L_(TX + x0 + (x1 - x0) * s, y0 + (up_end * (1 - s) ** 2.6) - sagk * s * s, TZ)
    sm = DG['Beam'](lint(-0.42, 0.95, 2.22, 0.1, 0.1), Vector((0, 0, 1)), lambda s: 0.13, lambda s: 0.095, e=0.55, cap=0.07)
    p_sm = sm.build('shimaki', 'torii', raw_or(REDB, sm, True), K=8, step=0.3, capn=2)
    putp(broken_end(p_sm, sm, True, amp=0.05, seed=2), 'torii', 'body')
    ks = DG['Beam'](lint(-0.55, 1.05, 2.42, 0.13, 0.17), Vector((0, 0, 1)), lambda s: 0.17, lambda s: 0.1, e=0.5, cap=0.09)
    p_ks = ks.build('kasagi', 'torii', raw_or(BLK, ks, True), K=8, step=0.3, capn=2)
    putp(broken_end(p_ks, ks, True, amp=0.07, seed=5), 'torii', 'body')
    def klo(v): u = clamp((v - 0.15) / (ks.len - 0.35)); return PI / 2 - (0.6 + 0.25 * math.sin(v * 4)) * math.sqrt(max(0.0, math.sin(PI * u))) - 0.02
    def khi(v): u = clamp((v - 0.15) / (ks.len - 0.35)); return PI / 2 + 0.62 * math.sqrt(max(0.0, math.sin(PI * u))) + 0.02
    putp(DG['strip_moss']('kasagi_moss', ks.Sfn, 0.15, ks.len - 0.2, 8, klo, khi, 0.035, DG['moss_painter'](seed=6), ncross=3), 'torii', 'stone')
    nk = DG['Beam'](lambda s: L_(TX - 0.3 + 0.95 * s, 1.78 - 0.04 * s * s, TZ), Vector((0, 0, 1)), lambda s: 0.075, lambda s: 0.09, e=0.55, cap=0.05)
    p_nk = nk.build('nuki', 'torii', raw_or(REDB, nk, True), K=10, step=0.5, capn=2)
    putp(broken_end(p_nk, nk, True, amp=0.05, seed=8), 'torii', 'body')
    # ---------------- the fallen post (kit B.at([1.6, 0.12, 2.45], 1.35)) and the fallen lintel piece (kit [2.0, 0.08, 1.4], 0.5)
    ax_ = Vector((math.cos(1.35), 0, -math.sin(1.35)))
    c0 = Vector((1.6, 0.115, 2.45)); Lp = 2.05
    fp = DG['Beam'](lambda s: L_(*(c0 + ax_ * (Lp * (s - 0.5)))), Vector((0, 0, 1)), lambda s: 0.13, lambda s: 0.13, e=1.0, cap=0.04)
    FPP = DG['lacquer_painter']('#c85a3e', '#9a3a2a', '#e88a68', spec='#ffd0b4', sheen=0.4, seed=9)
    def fpp(part, p, n, meta):
        c = FPP(part, p, n, meta)
        m = (n.z - 0.6) * 2.2 + (DG['vnoise'](p, 2.2, 13) - 0.6) * 2.2
        if m > 0: c = DG['mixc'](c, '#6a9a46', clamp(m * 1.5) * 0.8)
        return c
    p_fp = fp.build('fallen_post', 'torii', raw_or(fpp, fp, False), K=8, step=0.5, capn=1)
    putp(broken_end(p_fp, fp, False, amp=0.07, seed=11), 'fallen', 'body')
    for vb in (Lp - 0.42,):
        cc = c0 + ax_ * (vb - Lp / 2)
        bl = DG['Beam'](lambda s, cc=cc: L_(*(cc + ax_ * (0.12 * (s - 0.5)))), Vector((0, 0, 1)), lambda s: 0.145, lambda s: 0.145, e=1.0, cap=0.01)
        putp(bl.build('fallen_band', 'torii', BLK, K=10, step=0.2, capn=1), 'fallen', 'body')
    ax2 = Vector((math.cos(1.05), 0, -math.sin(1.05))); c2 = Vector((2.4, 0.09, 1.25))   # (beside the post, not across it)
    fl = DG['Beam'](lambda s: L_(*(c2 + ax2 * (1.5 * (s - 0.5)) + Vector((0, 0.12 * (1 - s) ** 2.6, 0)))), Vector((0, 0.1, 1)).normalized(), lambda s: 0.16, lambda s: 0.095, e=0.5, cap=0.08)
    p_fl = fl.build('fallen_kasagi', 'torii', raw_or(BLK, fl, True), K=10, step=0.3, capn=2)
    putp(broken_end(p_fl, fl, True, amp=0.06, seed=13), 'fallen', 'body')
    def flo(v): u = clamp((v - 0.1) / (fl.len - 0.3)); return PI / 2 - 0.7 * math.sqrt(max(0.0, math.sin(PI * u))) - 0.02
    def fhi(v): u = clamp((v - 0.1) / (fl.len - 0.3)); return PI / 2 + (0.5 + 0.3 * math.sin(v * 5)) * math.sqrt(max(0.0, math.sin(PI * u))) + 0.02
    putp(DG['strip_moss']('fallen_moss', fl.Sfn, 0.1, fl.len - 0.2, 7, flo, fhi, 0.035, DG['moss_painter'](seed=8), ncross=3), 'fallen', 'stone')
    # ---------------- the toppled lantern: the post still standing (kit [-2.3, 0, 0.6]), its head in the moss ([-2.7, 0.14, 1.35])
    LS = '#b0a8ac'
    with at((-2.3, 0, 0.6), ry=0.3):
        put(cyl(0.27, 0.31, 0.12, (0, 0.04, 0), K=6, bev=0.02), stone_paint(LS, seed=70, moss=0.7, moss_up=0.4), 'lantern', 'stone')
        put(glathe([(0.0, 0.09), (0.23, 0.09), (0.24, 0.12), (0.2, 0.17), (0.0, 0.17)], 6), stone_paint(LS, seed=71, moss=0.6, moss_up=0.4), 'lantern', 'stone')
        st = cyl(0.1, 0.12, 0.5, (0, 0.42, 0), K=8)
        for i, v in enumerate(st.v):          # the snapped top
            lp = F.m.inverted() @ v
            if lp.z > 0.6: st.v[i] = v + Vector((0, 0, 0.05 * math.sin(math.atan2(lp.y, lp.x) * 3 + 1) - 0.02))
        st.n = [None] * len(st.v)
        put(st, stone_paint(LS, seed=72, moss=0.55, moss_up=0.5), 'lantern', 'stone')
    with at((-2.66, 0.13, 1.38), ry=0.8, rz=1.42):
        def lst(seed): return stone_paint(LS, seed=seed, moss=0.55, moss_up=0.45)
        put(cyl(0.21, 0.13, 0.09, (0, 0.0, 0), K=6), lst(73), 'lantern', 'stone')
        put(cyl(0.125, 0.125, 0.19, (0, 0.14, 0), K=6), lambda p, n: mix('#d8c8a8', '#f0e4c8', clamp(n.z)), 'lantern', 'body')
        for kk in range(0, 6, 2):
            a = (kk + 0.5) / 6 * TAU
            put(box(0.055, 0.21, 0.055, (math.cos(a) * 0.14, 0.14, math.sin(a) * 0.14), r=0.0, ry=-a), lst(74), 'lantern', 'stone')
        put(cyl(0.18, 0.18, 0.03, (0, 0.05, 0), K=6), lst(75), 'lantern', 'stone')
        put(glathe([(0.0, 0.23), (0.3, 0.26), (0.34, 0.31), (0.3, 0.34), (0.18, 0.4), (0.07, 0.45), (0.0, 0.46)], 6,
                   rfn=lambda rr, z, th: rr * (1 + 0.07 * max(0.0, math.cos(6 * th))) if rr > 0.28 else rr), lst(76), 'lantern', 'stone')
        put(glathe([(0.0, 0.45), (0.055, 0.46), (0.068, 0.51), (0.036, 0.56), (0.0, 0.59)], 6), lst(77), 'lantern', 'stone')
    # ---------------- the two kitsune guardians (kit [+-1.25, 0, 1.0], facing in a little)
    for sx in (-1, 1):
        with at((sx * 1.25, 0, 1.0), ry=-sx * 0.25):
            kitsune(sx)
    # ---------------- moss drifts over the platform edges and on the ground, grass, ferns, a few flowers
    for k, (x, y, z, r_, h_) in enumerate([(-2.08, 0.0, -1.2, 0.36, 0.17), (2.15, 0.0, -0.6, 0.32, 0.15),
                                           (-0.9, 0.0, -2.45, 0.34, 0.15), (1.55, 0.06, -2.15, 0.3, 0.15),
                                           (1.05, 0.0, 2.7, 0.26, 0.12)]):
        moss_blob((x, y, z), r_, h_, seed=200 + k, lobes=3, K=10, amp=0.07)
    for k, (x, z) in enumerate([(-2.15, -0.7), (2.2, -1.25), (-1.0, 1.42)]):
        grass((x, 0.0, z), seed=300 + k, tag='grass')
    with at((-2.0, 0.02, -2.1)): fern((0, 0, 0), n=4, L=0.55, wdt=0.11, seed=61, tag='fern')
    for k, (x, y, z, pc) in ():
        flower5((x, y, z), r=0.06, petal=pc, seed=400 + k)
    info = dict(light=[0, 1.0, 0.2], flames=[[-0.5, round(PT + 0.94, 3), -0.12], [0.5, round(PT + 0.94, 3), -0.12]],
                cols=[[0, -1.0, 0.8], [-1.2, 2.3, 0.25], [-2.3, 0.6, 0.3], [-1.25, 1.0, 0.3], [1.25, 1.0, 0.3]])
    return info

# ================================================================== 2. the iwakura (kit iwakura, R 1.3)
def build_iwakura():
    new_asset()
    R = 1.3
    SP = DG['stone_painter']('#6c6676', '#958d9e', '#bdb4c2', warm='#d4c2b4', seed=3)
    b = DG['Boulder']('iwakura', 0.0, 0.0, 0.2, 1.42, 1.3, 1.6, yaw=0.35, exy=0.92, ez=1.0, lump=0.17, taper=0.22,
                      seed=4, res=0.12, tilt=(0.1, -0.07), flat=0.12,
                      moss=dict(tufts=9, tuft_paint=TUFTP, t=0.1, cover=0.52, drips=6, drop=1.15, front=0.5, nu=30, zmin=1.0, dw=1.35, dexp=0.42,
                                doffs=(-1.0, -0.8, -0.5, -0.22, 0.0, 0.22, 0.5, 0.8, 1.0)))
    # finer grids than the gates' (one big hero stone)
    ths, phs = b.grids(res=0.1)
    part = DG['Part']('iwakura', 'stone', paint=SP, closed=True)
    part.boulder = b
    DG['surf'](part, b.P, ths, phs, True, lambda c, u, v: c - b.c, pole0=Vector((b.c.x, b.c.y, DG['GROUND'])), pole1=b.P(0, PI / 2))
    b.ths, b.phs = ths, phs
    moss = DG['boulder_moss'](b, MOSSP(4), stone=part)
    # a few hard facets on the lower band (below the rope): planes facing out and a touch up shave the bulge flat
    C0 = Vector((b.c.x, b.c.y, 0.35)); ZR = 0.8
    rf = random.Random(17); planes = []
    for k in range(6):
        a = TAU * (k + rf.uniform(-0.2, 0.2)) / 6
        n_ = Vector((math.cos(a), math.sin(a), rf.uniform(0.05, 0.22))).normalized()
        hmax = max((v - C0).dot(n_) for v in part.v if v.z < ZR)
        planes.append((n_, hmax - rf.uniform(0.14, 0.22)))
    def facet(v):
        w = 1.0 - smooth(ZR - 0.12, ZR + 0.18, v.z)
        if w <= 0 or v.z < -0.02: return v
        for n_, d in planes:
            sd = (v - C0).dot(n_) - d
            if sd > 0: v = v - n_ * (sd * w)
        return v
    part.v = [facet(v) for v in part.v]
    putp(part, 'stone', 'stone'); putp(moss, 'moss', 'stone')
    if getattr(moss, 'tufts', None) is not None: putp(moss.tufts, 'tufts', 'leaf')
    for k, (th, d, r_) in ():
        ph = PI / 2 - d; q = b.P(th, ph) + b.N(th, ph) * 0.07
        put(dome(q - b.N(th, ph) * 0.03, r_, r_ * 0.45, lobes=4 + k, K=12, seed=900 + k), moss_col(900 + k, lo='#4c7632', mid='#6e9c40', hi='#a4c866'), 'crowncushion', 'stone')
    # ---------------- the shimenawa: a thick two-strand twisted straw rope hugging the stone a little above its widest
    def surf_at(th, z):
        lo, hi = -PI / 2 + 0.05, PI / 2 - 0.02
        for _ in range(40):
            mid = (lo + hi) / 2
            if b.P(th, mid).z < z: lo = mid
            else: hi = mid
        e = 2e-3; FP = lambda t_, p_: facet(b.P(t_, p_))
        n_ = (FP(th + e, hi) - FP(th - e, hi)).cross(FP(th, hi + e) - FP(th, hi - e))
        q = FP(th, hi); o_ = q - Vector((b.c.x, b.c.y, q.z))
        n_ = n_.normalized() if n_.length > 1e-9 else o_.normalized()
        if n_.dot(o_) < 0: n_ = -n_
        return q, n_
    def ang_of(th):
        q = b.P(th, 0.0); return math.atan2(q.y - b.c.y, q.x - b.c.x)
    RR = 0.1
    zr = lambda a: 0.8 + 0.1 * math.sin(a - 0.4) + 0.025 * math.sin(2 * a + 0.6)    # (a tilted girdle: low at the front)
    dense = []
    for k in range(240):
        th = TAU * k / 240; a = ang_of(th)
        p, n = surf_at(th, zr(a)); n = Vector((n.x, n.y, n.z * 0.35)).normalized()
        dense.append(p + n * (RR * 0.72))
    # resample by arc length
    Ls = [0.0]
    for i in range(1, len(dense) + 1): Ls.append(Ls[-1] + (dense[i % len(dense)] - dense[i - 1]).length)
    tot = Ls[-1]; NP = 112; path = []; j = 0
    for k in range(NP):
        s = tot * k / NP
        while Ls[j + 1] < s: j += 1
        f = (s - Ls[j]) / max(1e-9, Ls[j + 1] - Ls[j]); path.append(dense[j].lerp(dense[(j + 1) % len(dense)], f))
    NT = round(tot / 0.36); K = 8
    t = PTmp(); rings = []; cen = []
    for i, p in enumerate(path):
        T = (path[(i + 1) % NP] - path[i - 1]).normalized()
        U = (Vector((0, 0, 1)) - T * T.z).normalized(); W = T.cross(U)
        s = i / NP; row = []
        for k in range(K):
            a = TAU * k / K
            r = RR * (1 + 0.2 * math.cos(2 * a - TAU * s * NT))
            row.append(t.vert(p + W * (r * math.cos(a)) + U * (r * math.sin(a))))
        rings.append(row); cen.append(p)
    tw = {}
    for i in range(NP):
        i1 = (i + 1) % NP
        for k in range(K):
            q = [rings[i][k], rings[i][(k + 1) % K], rings[i1][(k + 1) % K], rings[i1][k]]
            fc = sum((t.v[v] for v in q), Vector()) / 4
            t.face(q, fc - (cen[i] + cen[i1]) / 2)
    for i in range(NP):
        for k in range(K): tw[rings[i][k]] = 2 * TAU * k / K - TAU * (i / NP) * NT
    t.normals()
    put(t, rope_col(lambda p, n, tw=tw, t=t: 0.0), 'rope', 'body')
    # repaint by the twist phase (vertex order of t is kept by Asset.add)
    o = A.objs['body']; base = len(o['v']) - len(t.v)
    for vi, ph in tw.items():
        p = o['v'][base + vi]; n = o['n'][base + vi]
        c = mix(STRAW_DK, STRAW, 0.15 + 0.85 * (0.5 + 0.5 * math.cos(ph)) ** 0.7)
        o['c'][base + vi] = lin(mul(c, 0.86 + 0.16 * clamp(n.z * 0.5 + 0.5)))
    # ---------------- five shide and two straw tassels across the front (kit: a = pi/2 + (k - 2) * 0.42, +z)
    def th_at_angle(a):
        best = min(range(240), key=lambda k: abs(math.atan2(math.sin(ang_of(TAU * k / 240) - a), math.cos(ang_of(TAU * k / 240) - a))))
        return TAU * best / 240
    for k in range(3):
        ga = PI / 2 + (k - 1) * 0.5                           # game angle (x = cos, z = sin)
        ba = -ga                                              # Blender angle (y = -z)
        th = th_at_angle(ba)
        z0 = zr(ang_of(th)) - RR * 0.8
        top, n0 = surf_at(th, z0)
        out = Vector((n0.x, n0.y, 0)).normalized()
        def surf(z, q, th=th):
            p, n = surf_at(th, z); return p, n
        shide_tabs(top + out * 0.03, out, scale=1.35, surf=surf, span=1.0, n=3)
    for k, ga in ():
        th = th_at_angle(-ga); z0 = zr(ang_of(th)) - RR * 0.5
        p, n = surf_at(th, z0 - 0.12)
        c = p + n * 0.055
        tz = lathe([(0.0, 0.11), (0.03, 0.1), (0.045, 0.02), (0.055, -0.1), (0.04, -0.16), (0.0, -0.17)], 7).xform(Matrix.Translation(c))
        put(tz, lambda p_, n_: mix(STRAW_DK, STRAW, clamp(n_.z * 0.4 + 0.6) * (0.75 + 0.25 * math.sin(math.atan2(n_.y, n_.x) * 7))), 'tassel', 'body')
        put(tube_loop([c + Vector((0.047 * math.cos(TAU * i / 7), 0.047 * math.sin(TAU * i / 7), 0.06)) for i in range(7)], lambda s: 0.014, K=4),
            soft(STRAW_DK, 0.2), 'tassel', 'body')
    # ---------------- companion stones, moss tufts, grass and flowers round the foot
    SP2 = DG['stone_painter']('#7a7484', '#a29aaa', '#ccc4cc', seed=7)
    for k, (x, z, hc, ax, az, hup, yaw) in enumerate([(1.42, 0.78, 0.12, 0.36, 0.3, 0.26, 0.6), (-1.28, 0.98, 0.08, 0.28, 0.24, 0.2, -0.4),
                                                      (-0.62, -1.38, 0.1, 0.34, 0.26, 0.22, 0.2)]):
        sb = DG['Boulder']('pebble%d' % k, x, z, hc, ax, az, hup, yaw=yaw, exy=0.75, ez=0.7, lump=0.06, taper=0.12, seed=20 + k, res=0.12,
                           moss=dict(t=0.05, cover=0.55, drips=3, drop=0.6, nu=18, dw=1.3, dexp=0.45, doffs=(-1.0, -0.7, -0.3, 0.0, 0.3, 0.7, 1.0)))
        sp = sb.build(SP2)
        sm = DG['boulder_moss'](sb, MOSSP(20 + k), stone=sp)
        putp(sp, 'pebbles', 'stone'); putp(sm, 'pebbles', 'stone')
    for k, (x, z, r_, h_) in enumerate([(0.95, 1.3, 0.2, 0.1), (-1.55, -0.4, 0.22, 0.11)]):
        moss_blob((x, 0.0, z), r_, r_ * 0.6, seed=500 + k, lobes=3, K=16, amp=0.06)
    for k, (x, z) in enumerate([(0.55, 1.42), (-0.95, 1.2), (1.5, 0.3), (-1.55, 0.35), (1.15, -1.1), (-1.45, -0.85), (0.4, -1.45), (1.75, 0.95)]):
        grass((x, 0.0, z), seed=600 + k)
    for k, (x, y, z, pc) in enumerate([(0.98, 0.09, 1.28, '#ff9ec0'), (-0.36, 0.06, 1.4, '#ffffff'), (-1.48, 0.1, -0.42, '#ffd0e0')]):
        flower5((x, y, z), r=0.06, petal=pc, seed=700 + k)
    # two flowers up in the crown moss
    for k, (th, d) in enumerate(((-PI / 2 + 0.5, 0.3), (PI / 2 + 0.9, 0.25))):
        tb = None
        ph = PI / 2 - d * 1.6
        q = b.P(th, ph); n = b.N(th, ph)
        p = DG['flower']('crownfl%d' % k, q + n * 0.075, n, 0.065, '#ff9ec0' if k == 0 else '#ffffff', '#ffd24a', seed=800 + k)
        putp(p, 'flowers', 'body')
    return dict(R=R, rope_y=round(zr(0.0), 3), rope_r=RR)

_pm = os.path.join(HERE, 'props_more.py')
exec(compile(open(_pm, encoding='utf-8').read(), _pm, 'exec'))
PIECES = {'ruinedShrine': build_ruinedShrine, 'iwakura': build_iwakura, 'torii': build_torii, 'lantern': build_lantern,
          'chimes': build_chimes, 'bambooBench': build_bambooBench}
for name in (list(PIECES) if PIECE == 'all' else PIECE.split(',')):
    info = PIECES[name]()
    finish(A, seed={'ruinedShrine': 7, 'iwakura': 11, 'torii': 13, 'lantern': 17, 'chimes': 19, 'bambooBench': 23}[name], amt=0.012 if name in ('ruinedShrine', 'iwakura', 'torii') else 0.005)
    ray_ao(weights={'leaf': 0.4})
    export_piece('rg-bamboo-' + name, info)
print('RG done')
