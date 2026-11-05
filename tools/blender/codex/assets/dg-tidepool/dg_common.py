# dg-tidepool (copied from dg-bamboo) shared helpers: extracted from tools/blender/codex/assets/rg-bamboo/build_rg-bamboo.py (lines 14-461: kits,
# painters, material buckets, ray AO, export, the hokora gable roof, the kitsune guardian). exec'd by build_dg-bamboo.py.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('DGT build pid', os.getpid())
_base = os.path.join(HERE, 'base_kit.py')
exec(compile(open(_base, encoding='utf-8').read(), _base, 'exec'))
_dg = os.path.join(HERE, 'rg_kit.py')
DG = {'__name__': 'rg_kit'}
exec(compile(open(_dg, encoding='utf-8').read(), _dg, 'exec'), DG)
DG['GROUND'] = -0.12                      # the buried skirt of grounded boulders (the dungeon floor is flat at y 0)
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
        if m in ('glow', 'hot'):   # (the game draws them unlit from the vertex colour; emission here only for the previews)
            nt.links.new(vc.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0
        if m in ('cloth', 'leaf'): mt.use_backface_culling = False
        mats[m] = mt
    obs = []
    for k, o in A.objs.items():
        ob = to_object(k, o, mats)
        if k != 'stone':  # (the game's batches need the kit's attribute set: its body / leaf / glow / cloth carry uv, d:stone's slabs don't)
            uvs = A.uv.get(k, []) + [(0.0, 0.0)] * (len(o['v']) - len(A.uv.get(k, [])))
            me = ob.data; ul = me.uv_layers.new(name='UVMap')
            data = []
            for li in range(len(me.loops)):
                u_, v_ = uvs[me.loops[li].vertex_index]; data.extend((u_, 1.0 - v_))   # (the glTF exporter flips v: the game gets the intended uv)
            ul.data.foreach_set('uv', data)
        obs.append(ob)
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    print('DGT %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('DGT %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('DGT %s bounds game x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('DGT %s check %s %s' % (name, ob.name, check(ob)))
    print('DGT %s info %s' % (name, info))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('DGT export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('DGT wrote', out)

# ================================================================== 1. the ruined shrine (kit ruinedShrine, ~6 x 5 m)
PT = 0.18     # the platform's top

def roof_gable(LX=0.9, DZ=0.74, YE=1.42, YR=1.98, TH=0.1, NR=0, sag=0.045, NX=8, tag='roof', RCOL=('#5e7a72', '#86a49a', '#33463f')):
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
    RC, RCH, RCL = RCOL
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

