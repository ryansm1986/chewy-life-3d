# homestead-props shared kit: base_kit (the village-pieces / rg kit) + material buckets, per-vertex-colour shells, ray AO, the
# fixed exporter (uv written as (u, 1 - v), the glTF exporter flips V). exec'd by build_homestead-props.py.
import bpy, bmesh, math, os, sys, random, zlib
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

_base = os.path.join(HERE, 'base_kit.py')
exec(compile(open(_base, encoding='utf-8').read(), _base, 'exec'))
MODELS = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', 'public', 'models'))

class RAsset(Asset2):
    def __init__(self):
        super().__init__(); self.uv = {}
A = None
def new_asset():
    global A
    A = RAsset()
    F.m = Matrix.Identity(4); F.st = []

def put(t, col, tag='misc', mat='body', uv=None):
    """col: a '#hex' / sRGB tuple, a painter (p, n) in Blender coords -> sRGB, or None: per-vertex sRGB in t.c. uv(p) -> the game's (u, v)"""
    o = A.objs.get(mat); b = len(o['v']) if o else 0
    A.add(mat, mat, t, col, tag)
    if uv is not None:
        lst = A.uv.setdefault(mat, [])
        lst.extend([(0.0, 0.0)] * (b - len(lst)))
        lst.extend([uv(p) for p in A.objs[mat]['v'][b:]])
    return t

def seeded(name): return random.Random(zlib.crc32(name.encode()))
def V3(x, y, z): return Vector((x, y, z))             # a game-frame vector
def toB(p): return Vector((p[0], -p[2], p[1]))        # game -> Blender
def yup(n): return n.z                                # (a Blender normal's "up")
def c_lerp(cs, t):
    """a colour ramp: cs a list of colours, t 0..1"""
    t = clamp(t) * (len(cs) - 1); i = min(int(t), len(cs) - 2)
    return mix(cs[i], cs[i + 1], t - i)
def lerp3(a, b, t): return a + (b - a) * t
def curve(pts):
    """a smooth 1-D curve through [(x, y)], x ascending (cosine eased between the knots)"""
    def f(x):
        if x <= pts[0][0]: return pts[0][1]
        for (a, u), (b, v) in zip(pts, pts[1:]):
            if x <= b:
                t = (x - a) / (b - a); t = t * t * (3 - 2 * t) * 0.6 + t * 0.4
                return u + (v - u) * t
        return pts[-1][1]
    return f

# ------------------------------------------------------------------ leaves: a chunky blade with a real section
def leaf(base, az, el, L, W, droop=0.25, st=(0.2, 0.45, 0.7, 0.9), wf=None, cup=0.18, thick=0.014, across=4,
         cols=('#3f7d38', '#6fae4a', '#a6d66a'), vein=None, under=0.72, stalk=None, stalk_to=0.2, path=None, twist=0.0, mat='leaf', tag='leaf', fall=None):
    """a fat leaf from `base` (game xyz). Heading az in the ground plane (0 = +x, PI/2 = +z), elevation el; L long, W half-wide, tip
    falling by droop * L. st: the stations (0..1) as rings (lobes come from wf(s)); path(s) -> (point, normal) overrides the
    midrib. across 4: diamond section, 8: a cupped section. Vertex colours: base -> tip ramp, a vein, darker underside."""
    b = Vector(base)
    d0 = V3(math.cos(az) * math.cos(el), math.sin(el), math.sin(az) * math.cos(el))
    side0 = V3(-math.sin(az), 0, math.cos(az))
    wf = wf or (lambda s: math.sin(PI * min(1.0, s * 0.98 + 0.02) ** 0.72) ** 0.8)
    def P(s):
        if path: return path(s)[0]
        return b + d0 * (L * s) - V3(0, 1, 0) * (droop * L * s * s)
    def frame(s):
        if path:
            pp, nn = path(s); e = 0.01
            T = (path(min(1, s + e))[0] - path(max(0, s - e))[0]).normalized()
            sd = T.cross(nn).normalized(); nn = sd.cross(T).normalized()
            return pp, T, sd, nn
        e = 0.01; T = (P(min(1, s + e)) - P(max(0, s - e))).normalized()
        sd = side0 - T * side0.dot(T); sd.normalize()
        nn = sd.cross(T).normalized()
        if nn.y < 0: nn = -nn; sd = -sd
        if twist:
            q = Matrix.Rotation(twist * s, 3, T)
            sd = q @ sd; nn = q @ nn
        return P(s), T, sd, nn
    rings, cs, vcol = [], [], []
    for s in st:
        pp, T, sd, nn = frame(s)
        w = W * wf(s); th = thick * (1 - 0.4 * s)
        ramp = c_lerp(cols, s ** 0.85)
        if stalk is not None and s < stalk_to: ramp = mix(stalk, ramp, s / stalk_to)
        vc = vein or mix(ramp, '#e8f4b0', 0.28)
        if across == 4:
            sec = [(w, cup * w * 0.8, ramp), (0, th, vc), (-w, cup * w * 0.8, ramp), (0, -th, mul(ramp, under))]
        else:
            sec = [(w, cup * w, mix(ramp, cols[-1], 0.25)), (w * 0.5, cup * w * 0.22 + th * 0.8, ramp), (0, th, vc), (-w * 0.5, cup * w * 0.22 + th * 0.8, ramp),
                   (-w, cup * w, mix(ramp, cols[-1], 0.25)), (-w * 0.5, cup * w * 0.22 - th, mul(ramp, under)), (0, -th, mul(ramp, under * 0.95)), (w * 0.5, cup * w * 0.22 - th, mul(ramp, under))]
        rings.append([toB(pp + sd * a + nn * h) for a, h, _ in sec]); cs.append(toB(pp + nn * cup * w * 0.3))
        vcol.append([c for _, _, c in sec])
    t = Tmp()
    p0 = toB(P(0.0)); p1 = toB(P(1.0))
    ids = ring_surface(t, rings, cs, p0, p1)
    t.c = [None] * len(t.v)
    for row, cr in zip(ids, vcol):
        for i, c in zip(row, cr): t.c[i] = c
    t.c[-2] = stalk if stalk is not None else c_lerp(cols, 0.0)
    t.c[-1] = c_lerp(cols, 1.0)
    # (a pole: ring_surface adds pole0 then pole1)
    return put(t, None, tag, mat)

def rosette(at_, n, L, W, el=0.9, droop=0.35, twist=0.0, seed=0, jit=0.18, **kw):
    r = random.Random(seed)
    for i in range(n):
        a = twist + TAU * i / n + r.uniform(-jit, jit); l = L * r.uniform(0.86, 1.12)
        leaf(at_, a, el + r.uniform(-0.1, 0.1), l, W * r.uniform(0.9, 1.08), droop=droop, **kw)

LOBED = lambda s: (0.34 + 0.66 * math.sin(PI * min(1.0, s * 0.98 + 0.02) ** 0.75)) * (1.0 if s > 0.0 else 0)
def pinnate(a=0.42, b=1.0):
    """a lobed outline for stations in steps: every other station narrow"""
    def f(s):
        k = round(s * 20)
        env = math.sin(PI * min(1.0, s * 0.96 + 0.04) ** 0.7) ** 0.7
        return env * (b if k % 2 == 0 else a)
    return f

# ------------------------------------------------------------------ small solids
def vtube(pts, rad, K=5, cols=None, mat='body', tag='tube', col=None):
    """a tube along game points (rad a number or fn(s)); cols: a ramp base -> tip (per vertex through the painter)"""
    P = [toB(p) for p in pts]
    t = tube(P, rad if callable(rad) else (lambda s, r=rad: r), K=K, caps=True, up=Vector((0.13, 0.27, 0.95)).normalized())
    if cols:
        a, b = P[0], P[-1]; ab = b - a; L2 = max(1e-9, ab.dot(ab))
        return put(t, lambda p, n: mul(c_lerp(cols, clamp((p - a).dot(ab) / L2)), 0.88 + 0.16 * clamp(n.z * 0.5 + 0.5)), tag, mat)
    return put(t, col or '#6a9a3a', tag, mat)

def egg(pos, r, sc=(1, 1, 1), K=8, J=4, col='#ffffff', mat='body', tag='egg', **kw):
    return put(sph(r, pos, sc, K=K, J=J, **kw), col, tag, mat)

def rock(pos, r, sc=(1, 0.72, 1), K=14, J=7, seed=0, cuts=3, ry=0.0):
    """a stone with cut planes: an ellipsoid, wobbled, its vertices clipped to a few facets (a Tmp in Blender coords around `pos`)"""
    rnd = random.Random(seed)
    t = ellipsoid(Vector((0, 0, 0)), (r * sc[0], r * sc[2], r * sc[1]), K=K, J=J)
    planes = []
    for i in range(cuts):
        a = rnd.uniform(0, TAU) ; el = rnd.uniform(0.15, 1.05)
        nn = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        planes.append((nn, r * rnd.uniform(0.6, 0.78)))
    for i, v in enumerate(t.v):
        w = vnoise(v * (2.3 / max(r, 1e-3)) + Vector((seed, 0, 0)), 1.0, seed) - 0.5
        v = v * (1 + 0.22 * w)
        for nn, d in planes:
            q = v.dot(nn)
            if q > d: v = v - nn * (q - d)
        t.v[i] = v
    t.n = [None] * len(t.v)
    return t.xform(F.m @ lm(pos, ry=ry))

# ------------------------------------------------------------------ a fin: a fan of rays, a real thickness, a rolled rim
def fin(root, tip, thick=0.03, rows=2, c0='#c8a060', c1='#f0d890', ray=0.12, mat='body', tag='fin', rim=0.55):
    """root / tip: equal lists of game points (the attached line, the outer edge). A closed shell; colours run root -> tip with
    darker rays (every other column)."""
    n = len(root)
    root = [Vector(p) for p in root]; tip = [Vector(p) for p in tip]
    a = tip[n // 2] - root[n // 2]; b = root[-1] - root[0]
    nn = a.cross(b); nn = nn.normalized() if nn.length > 1e-9 else V3(1, 0, 0)
    t = Tmp(); front = []; back = []; cc = []
    for r in range(rows + 1):
        s = r / rows; rf, rb = [], []
        h = thick * 0.5 * (1 - (1 - rim) * s * s)
        for i in range(n):
            p = lerp3(root[i], tip[i], s)
            rf.append(t.vert(toB(p + nn * h))); rb.append(t.vert(toB(p - nn * h)))
            c = mix(c0, c1, s ** 0.8)
            if i % 2: c = mul(c, 1 - ray)
            cc += [c, mul(c, 0.94)]
        front.append(rf); back.append(rb)
    t.c = cc
    nb = toB(nn).normalized()
    for r in range(rows):
        for i in range(n - 1):
            t.face([front[r][i], front[r][i + 1], front[r + 1][i + 1], front[r + 1][i]], nb)
            t.face([back[r][i], back[r][i + 1], back[r + 1][i + 1], back[r + 1][i]], -nb)
    def rimf(a0, a1, b0, b1):
        m = (t.v[a0] + t.v[a1] + t.v[b0] + t.v[b1]) / 4
        c = sum((toB(lerp3(root[i], tip[i], 0.5)) for i in range(n)), Vector()) / n
        t.face([a0, a1, b1, b0], m - c)
    for i in range(n - 1):
        rimf(front[rows][i], front[rows][i + 1], back[rows][i], back[rows][i + 1])
        rimf(front[0][i], front[0][i + 1], back[0][i], back[0][i + 1])
    for r in range(rows):
        rimf(front[r][0], front[r + 1][0], back[r][0], back[r + 1][0])
        rimf(front[r][-1], front[r + 1][-1], back[r][-1], back[r + 1][-1])
    return put(t, None, tag, mat)

# ------------------------------------------------------------------ AO + export
def ray_ao(skip=('window_glow',), NR=20, DMAX=0.3, K=0.5, ground=None, gsize=6.0, weights=None, off=0.008):
    """painted ambient occlusion: colours darken with what the hemisphere over each vertex sees. ground: a plane at that game y."""
    weights = weights or {}
    allv, allf = [], []
    for k, o in A.objs.items():
        b = len(allv); allv += o['v']
        for f in o['f']:
            for q in range(1, len(f) - 1): allf.append([f[0] + b, f[q] + b, f[q + 1] + b])
    if ground is not None:
        b = len(allv); allv += [Vector((-gsize, -gsize, ground)), Vector((gsize, -gsize, ground)), Vector((gsize, gsize, ground)), Vector((-gsize, gsize, ground))]
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
            q = n.to_track_quat('Z', 'Y'); occ = 0.0; org = v + n * off
            for d in dirs:
                hit = bvh.ray_cast(org, q @ d, DMAX)
                if hit[0] is not None: occ += 1 - hit[3] / DMAX
            occ /= NR
            kk = 1 - w * clamp(occ * 1.25) * K
            c = o['c'][i]; o['c'][i] = (c[0] * kk, c[1] * kk, c[2] * kk, 1.0)

REPORT = {}
def export_piece(name, budget=None):
    """A.objs -> <name>.glb: one object per material, Col + uv (written (u, 1 - v): the exporter flips V)"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for m in A.objs:
        mt = bpy.data.materials.new(m); mt.use_nodes = True; nt = mt.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        if 'glow' in m:
            bsdf.inputs['Emission Color'].default_value = lin('#ffd890'); bsdf.inputs['Emission Strength'].default_value = 1.0
        mats[m] = mt
    obs = []
    for k, o in A.objs.items():
        ob = to_object(k, o, mats)
        uvs = A.uv.get(k, []) + [(0.0, 0.0)] * (len(o['v']) - len(A.uv.get(k, [])))
        me = ob.data; ul = me.uv_layers.new(name='UVMap'); data = []
        for li in range(len(me.loops)):
            u_, v_ = uvs[me.loops[li].vertex_index]; data.extend((u_, 1.0 - v_))
        ul.data.foreach_set('uv', data)
        obs.append(ob)
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in A.objs.values():
        for v in o['v']: lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    tris = A.tris(); per = {k: A.tris(k) for k in A.objs}
    chk = {ob.name: check(ob) for ob in obs}
    bad = {k: {a: b for a, b in v.items() if a in ('zero_area', 'nan_verts', 'nan_normals') and b} for k, v in chk.items()}
    bad = {k: v for k, v in bad.items() if v}
    over = budget is not None and tris > budget
    print('HS %-26s tris %5d%s %s  x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f %s' % (name, tris, ' OVER %d' % budget if over else '', per, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y, ('BAD ' + str(bad)) if bad else ''))
    REPORT[name] = dict(tris=tris, per=per, budget=budget, game_lo=[lo.x, lo.z, -hi.y], game_hi=[hi.x, hi.z, -lo.y], bad=bad, parts=dict(sorted(A.count.items(), key=lambda kv: -kv[1])))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('HS export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
