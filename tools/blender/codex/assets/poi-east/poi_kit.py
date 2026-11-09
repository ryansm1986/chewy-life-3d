# poi-east: the shared kit (exec'd by build_poi-east.py). On top of base_kit.py (the guild / landmarks generators): material
# buckets, the exporter (glow / cloth UVs written (u, 1 - v), since the glTF exporter flips V), the places' terrain, rocks
# cut from a high-res star-shaped surface with a separate moss shell (a crisp rim with rounded drips, tucked into the stone),
# leaf cards, rosettes of pine needles, flowers, fences. Everything is written in the kit call's game-local frame.
import bpy, bmesh, math, os, sys, random, json, heapq
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

REPO = 'D:/projects/chewy-life-3d'
MODELS = REPO + '/public/models'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PIECE = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
print('POI build pid', os.getpid())
_base = os.path.join(HERE, 'base_kit.py')
exec(compile(open(_base, encoding='utf-8').read(), _base, 'exec'))
GLOWM = 'window_glow'
PLACES = json.load(open(os.path.join(HERE, 'kit', 'places.json'), encoding='utf-8'))

def sstep(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)
def smin(a, b, k):
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25
def nzv(p, f=1.0, off=(0, 0, 0)):
    return noise.noise(Vector((p[0] * f + off[0], p[1] * f + off[1], p[2] * f + off[2])), noise_basis='PERLIN_ORIGINAL')

# ================================================================== the place's kit call: terrain, sea level
class Place:
    def __init__(self, pid, k):
        self.id, self.k = pid, k
        K = PLACES[pid]['kits'][k]; self.K = K
        self.x0 = K['grid']['x0']; self.step = K['grid']['step']; self.n = K['grid']['n']; self.hs = K['h']
        self.sea = K['seaY']; self.y = K['y']
    def h(self, x, z):
        """the ground under a local point, in the kit call's local y (F.h for a kit at the frame's origin)"""
        fx = clamp((x - self.x0) / self.step, 0, self.n - 1.001); fz = clamp((z - self.x0) / self.step, 0, self.n - 1.001)
        i, j = int(fx), int(fz); u, v = fx - i, fz - j; n = self.n; H = self.hs
        return (H[j * n + i] * (1 - u) + H[j * n + i + 1] * u) * (1 - v) + (H[(j + 1) * n + i] * (1 - u) + H[(j + 1) * n + i + 1] * u) * v
    def low(self, x, z, r):
        return min(self.h(x + r * math.cos(a), z + r * math.sin(a)) for a in [TAU * i / 8 for i in range(8)] + [0.0])

P = None      # the current Place

# ================================================================== accumulation in material buckets
class RAsset(Asset2):
    def __init__(self):
        super().__init__(); self.uv = {}
A = None
def new_asset(pid, k):
    global A, P
    A = RAsset(); P = Place(pid, k)
    F.m = Matrix.Identity(4); F.st = []
    return P

class Bag(Tmp):
    """a shell with per-vertex colours and given normals; faces keep the winding their hints give (open shells too)"""
    def __init__(self):
        super().__init__(); self.c = []
    def vc(self, p, n, c):
        i = self.vert(p, n); self.c.append(c); return i
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
    return put(t, col, tag, GLOWM if glow else 'body')
def bagput(t, tag, mat='body', uv=None): return put(t, None, tag, mat, uv)
def glow(t, col, tag='glow', flick=0.4, tint=0.0):
    """kit glow: uv = (flicker, tint); tint 1 takes the vertex colour instead of warm white"""
    return put(t, col, tag, GLOWM, uv=lambda p, f=flick, ti=tint: (f, ti))

# ================================================================== AO and export
def ray_ao(NR=18, DMAX=0.7, K=0.6, weights=None, skip=(GLOWM, 'cloth')):
    weights = weights or {}
    allv, allf = [], []
    for k, o in A.objs.items():
        b = len(allv); allv += o['v']
        for f in o['f']:
            for q in range(1, len(f) - 1): allf.append([f[0] + b, f[q] + b, f[q + 1] + b])
    # the terrain, as an occluder
    b = len(allv); st = 0.5; n = 53
    for j in range(n):
        for i in range(n):
            x, z = -13 + i * st, -13 + j * st
            allv.append(Vector((x, -z, P.h(x, z))))
    for j in range(n - 1):
        for i in range(n - 1):
            a = b + j * n + i; allf.append([a, a + 1, a + n + 1]); allf.append([a, a + n + 1, a + n])
    bvh = BVHTree.FromPolygons(allv, allf)
    dirs = []; ga = PI * (3 - math.sqrt(5))
    for k in range(NR):
        r = math.sqrt((k + 0.5) / NR); a = k * ga
        x, y = r * math.cos(a), r * math.sin(a); dirs.append(Vector((x, y, math.sqrt(max(0.0, 1 - x * x - y * y)))))
    for k, o in A.objs.items():
        if k in skip: continue
        w = weights.get(k, 1.0)
        for i, (v, n_) in enumerate(zip(o['v'], o['n'])):
            q = n_.to_track_quat('Z', 'Y'); occ = 0.0; org = v + n_ * 0.012
            for d in dirs:
                hit = bvh.ray_cast(org, q @ d, DMAX)
                if hit[0] is not None: occ += 1 - hit[3] / DMAX
            occ /= NR
            kk = 1 - w * clamp(occ * 1.25) * K
            c = o['c'][i]; o['c'][i] = (c[0] * kk, c[1] * kk, c[2] * kk, 1.0)

def export_piece(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {}
    for m in A.objs:
        mt = bpy.data.materials.new(m); mt.use_nodes = True; nt = mt.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0.0
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        if m == GLOWM:
            bsdf.inputs['Emission Color'].default_value = lin('#ffd890'); bsdf.inputs['Emission Strength'].default_value = 1.0
        if m in ('cloth', 'leaf'): mt.use_backface_culling = False
        mats[m] = mt
    obs = []
    for k, o in A.objs.items():
        ob = to_object(k, o, mats)
        if k in (GLOWM, 'cloth'):
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
    print('POI %s tris %d %s' % (name, A.tris(), {k: A.tris(k) for k in A.objs}))
    print('POI %s parts %s' % (name, dict(sorted(A.count.items(), key=lambda kv: -kv[1]))))
    print('POI %s bounds game x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (name, lo.x, hi.x, lo.z, hi.z, -hi.y, -lo.y))
    for ob in obs: print('POI %s check %s %s' % (name, ob.name, check(ob)))
    os.makedirs(os.path.join(HERE, 'blend'), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'blend', name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=True, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('POI export_vertex_color rejected:', e); bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('POI wrote', out)

# ================================================================== rocks
ST = dict(lo='#675f7c', mid='#9b93a8', hi='#cdc5d0', warm='#c2b0a6', wet='#544e62')
MS = dict(lo='#42663a', mid='#6e9048', hi='#a0ba60', tip='#bccf7c')

class RockShape:
    """a chunky star-shaped stone: a superellipsoid with slow lumps, cut by soft planes (flat facets with rounded edges).
    C: its centre (Blender); ax, ay: the semi-axes (game x, z), up, down: above and below the centre; yaw about Z."""
    def __init__(self, C, ax, ay, up, down, yaw=0.0, seed=1, p=2.3, lump=0.07, cuts=4, tilt=(0.0, 0.0)):
        self.C, self.ax, self.ay, self.up, self.down, self.p, self.seed, self.lump = C, ax, ay, up, down, p, seed, lump
        self.yaw = yaw
        self.R = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(tilt[0], 3, 'X') @ Matrix.Rotation(tilt[1], 3, 'Y'); self.Ri = self.R.inverted()
        rnd = random.Random(seed * 131 + 7); self.planes = []
        self.off = [(seed * 1.37 + i * 5.1, seed * 0.71 - i * 3.3, seed * 2.03 + i * 1.9) for i in range(3)]
        if cuts:
            a0 = rnd.uniform(0, TAU)
            n0 = Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 1)).normalized()
            self.planes.append((n0, rnd.uniform(0.78, 0.88), 0.1))
            for i in range(cuts - 1):
                a = a0 + TAU * i / (cuts - 1) + rnd.uniform(-0.45, 0.45)
                n = Vector((math.cos(a), math.sin(a), rnd.uniform(-0.1, 0.75))).normalized()
                self.planes.append((n, rnd.uniform(0.74, 0.88), 0.07))
    def radius(self, u):
        p = self.p
        R = (abs(u.x) ** p + abs(u.y) ** p + abs(u.z) ** p) ** (-1.0 / p)
        R *= 1 + self.lump * nzv(u, 1.7, self.off[0]) + self.lump * 0.25 * nzv(u, 3.4, self.off[1])
        for n, d, k in self.planes:
            un = u.dot(n)
            if un > 0.03: R = smin(R, d / un, k)
        return R
    def point(self, u):
        r = self.radius(u)
        q = Vector((u.x * r * self.ax, u.y * r * self.ay, u.z * r * (self.up if u.z >= 0 else self.down)))
        return self.C + self.R @ q
    def unit(self, p):
        """the unit-sphere direction of a world point (its polar angle does not depend on the stone's squash)"""
        q = self.Ri @ (p - self.C)
        d = Vector((q.x / self.ax, q.y / self.ay, q.z / (self.up if q.z >= 0 else self.down)))
        return d.normalized() if d.length > 1e-9 else Vector((0, 0, 1))
    @property
    def rm(self): return (self.ax + self.ay + self.up) / 3

def ico_mesh(subdiv):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    bm.verts.index_update()
    V = [v.co.normalized() for v in bm.verts]; Fa = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    return V, Fa

_ICO = {}
def shape_mesh(S, subdiv, clip=None):
    if subdiv not in _ICO: _ICO[subdiv] = ico_mesh(subdiv)
    U, Fa = _ICO[subdiv]
    V = []
    for u in U:
        q = S.point(u)
        if clip is not None and q.z < clip: q = Vector((q.x, q.y, clip))
        V.append(q)
    return V, [list(f) for f in Fa]

def vert_normals(V, Fa):
    acc = [Vector((0, 0, 0)) for _ in V]
    for f in Fa:
        a, b, c = V[f[0]], V[f[1]], V[f[2]]
        n = (b - a).cross(c - a)
        for i in f: acc[i] += n
    return [a.normalized() if a.length > 1e-12 else Vector((0, 0, 1)) for a in acc]

def vert_curv(V, Fa, N, smooth_it=2):
    nb = [set() for _ in V]
    for f in Fa:
        for i in range(3):
            nb[f[i]].add(f[(i + 1) % 3]); nb[f[i]].add(f[(i + 2) % 3])
    cv = [0.0] * len(V)
    for i, v in enumerate(V):
        acc = 0.0; n = 0
        for j in nb[i]:
            d = v - V[j]; l2 = d.length_squared
            if l2 > 1e-12: acc += N[i].dot(d) / l2; n += 1
        cv[i] = 2 * acc / max(n, 1)
    for _ in range(smooth_it):
        cv = [0.5 * cv[i] + 0.5 * sum(cv[j] for j in nb[i]) / max(1, len(nb[i])) for i in range(len(V))]
    return cv

def clip_positive(V, Fa, N, Sv):
    """the part of a triangle mesh where the field Sv > 0, cut exactly on its zero contour (smooth rims from a coarse grid)"""
    Sv = [s if abs(s) > 1e-5 else 1e-5 for s in Sv]
    nv, nn, ns, remap, emap, out = [], [], [], {}, {}, []
    def keep(i):
        if i not in remap:
            remap[i] = len(nv); nv.append(V[i]); nn.append(N[i]); ns.append(Sv[i])
        return remap[i]
    def cross(a, b):
        k = (min(a, b), max(a, b))
        if k not in emap:
            t = Sv[a] / (Sv[a] - Sv[b])
            emap[k] = len(nv); nv.append(V[a].lerp(V[b], t)); nn.append((N[a].lerp(N[b], t)).normalized()); ns.append(0.0)
        return emap[k]
    for f in Fa:
        a, b, c = f; sa, sb, sc = Sv[a] > 0, Sv[b] > 0, Sv[c] > 0
        cnt = sa + sb + sc
        if cnt == 0: continue
        if cnt == 3: out.append([keep(a), keep(b), keep(c)]); continue
        # rotate so a is the odd one
        if cnt == 1:
            while not Sv[a] > 0: a, b, c = b, c, a
            out.append([keep(a), cross(a, b), cross(a, c)])
        else:
            while Sv[a] > 0: a, b, c = b, c, a
            ab, ac = cross(a, b), cross(a, c)
            out.append([ab, keep(b), keep(c)]); out.append([ab, keep(c), ac])
    return nv, out, nn, ns

class HiSurf:
    def __init__(self, V, Fa, N, extra=None):
        self.V, self.F, self.N, self.E = V, Fa, N, extra
        self.bvh = BVHTree.FromPolygons(V, Fa)
    def sample(self, p):
        loc, fn, fi, d = self.bvh.find_nearest(p)
        f = self.F[fi]; a, b, c = self.V[f[0]], self.V[f[1]], self.V[f[2]]
        v0, v1, v2 = b - a, c - a, loc - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-16: w = (1 / 3, 1 / 3, 1 / 3)
        else:
            y = clamp((d11 * d20 - d01 * d21) / den); z = clamp((d00 * d21 - d01 * d20) / den)
            if y + z > 1: k = y + z; y, z = y / k, z / k
            w = (1 - y - z, y, z)
        n = self.N[f[0]] * w[0] + self.N[f[1]] * w[1] + self.N[f[2]] * w[2]
        n = n.normalized() if n.length > 1e-9 else fn
        e = tuple(sum(self.E[k][f[i]] * w[i] for i in range(3)) for k in range(len(self.E))) if self.E else ()
        return n, e

def decimate(V, Fa, target):
    """quadric collapse via a temporary object (evaluated, so no selection or ops) -> V, tris"""
    tris = len(Fa)
    if tris <= target: return list(V), [list(f) for f in Fa]
    me = bpy.data.meshes.new('_dec'); me.from_pydata([tuple(v) for v in V], [], Fa); me.update()
    ob = bpy.data.objects.new('_dec', me); bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = target / tris; m.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    ev = ob.evaluated_get(dg); em = ev.to_mesh()
    Vo = [v.co.copy() for v in em.vertices]; Fo = [list(p.vertices) for p in em.polygons]
    ev.to_mesh_clear(); bpy.data.objects.remove(ob, do_unlink=True); bpy.data.meshes.remove(me)
    Fo2 = []
    for f in Fo:
        for q in range(1, len(f) - 1): Fo2.append([f[0], f[q], f[q + 1]])
    return Vo, Fo2

def relax(V, Fa, hi, iters=2, f=0.5):
    """even out decimated triangles: edge flips for the best angles, a tangential umbrella step projected back on the high-res
    surface; open rims stay where they are"""
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in V]
    for t in Fa:
        try: bm.faces.new([vs[i] for i in t])
        except ValueError: pass
    bm.verts.index_update(); bm.faces.index_update()
    for it in range(iters):
        bmesh.ops.beautify_fill(bm, faces=bm.faces[:], edges=[e for e in bm.edges if not e.is_boundary], method='ANGLE')
        bm.normal_update()
        new = []
        for v in bm.verts:
            if any(e.is_boundary for e in v.link_edges): continue
            nb = [e.other_vert(v).co for e in v.link_edges]
            if len(nb) < 3: continue
            d = sum(nb, Vector()) / len(nb) - v.co; n = v.normal
            new.append((v, v.co + (d - n * d.dot(n)) * f))
        for v, p in new:
            loc = hi.bvh.find_nearest(p)[0]
            v.co = loc if loc is not None else p
    bmesh.ops.beautify_fill(bm, faces=bm.faces[:], edges=[e for e in bm.edges if not e.is_boundary], method='ANGLE')
    # (the collapse's optimal vertices can overshoot on an open rim: everything goes back on the high-res surface)
    for v in bm.verts:
        loc = hi.bvh.find_nearest(v.co)[0]
        if loc is not None: v.co = loc
    bm.verts.index_update()
    Vo = [v.co.copy() for v in bm.verts]; Fo = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    return Vo, Fo

def polar_cap(S, th0, seed, zmin=-1e9, nd=4, wob=(0.12, 0.08), toward=Vector((0, -1, 0)), dl=1.0):
    """the moss edge as a signed arc distance (m, + inside): a wobbling cap round the stone's crown with nd rounded drips,
    half of them on the camera side"""
    rnd = random.Random(seed * 37 + 11)
    ph_cam = math.atan2((S.Ri @ toward).y, (S.Ri @ toward).x)
    drips = []
    for i in range(nd):
        c = (ph_cam + rnd.uniform(-1.1, 1.1)) if i % 2 == 0 else rnd.uniform(-PI, PI)
        drips.append((c, rnd.uniform(0.2, 0.4) * dl, rnd.uniform(0.26, 0.38)))
    w0, w1 = rnd.uniform(0, TAU), rnd.uniform(0, TAU); rm = S.rm
    def f(p):
        u = S.unit(p)
        th = math.acos(clamp(u.z, -1, 1)); ph = math.atan2(u.y, u.x)
        e = th0 + wob[0] * 0.5 * math.sin(2 * ph + w0) + wob[1] * math.sin(3 * ph + w1) + wob[0] * 0.25 * math.sin(5 * ph + w0 * 2)
        ext = 0.0
        for c, ln, w in drips:
            dd = math.atan2(math.sin(ph - c), math.cos(ph - c))
            if abs(dd) < w: ext = max(ext, ln * (1 - (dd / w) ** 2) ** 0.7)
        s = (e + ext - th) * rm
        return min(s, (p.z - zmin) * 1.2)
    return f

def stone_col(p, n, s, cv, seed, kk, sea=None, tone=0.0):
    vz = n.z
    c = mix(ST['lo'], ST['mid'], clamp(vz * 0.9 + 0.75))
    c = mix(c, ST['hi'], clamp(vz * 1.1 - 0.15) * 0.85)
    c = mul(c, 1.0 + 0.1 * nzv(p, 2.3, (seed, 0.5, 2.0)) + 0.05 * nzv(p, 6.5, (3.0, seed, 1.0)) + tone)
    c = mix(c, ST['warm'], 0.25 * clamp(nzv(p, 1.4, (seed * 2.0, 4.0, 0.0)) * 2.2))
    c = mul(c, 1.0 + 0.12 * sstep(2.0 * kk, 9.0 * kk, cv) - 0.24 * sstep(-0.8 * kk, -6.0 * kk, cv))   # worn light edges, dark creases
    c = mix(c, '#84a05c', 0.3 * sstep(-0.1, 0.0, s) * clamp(vz + 0.6))                                # a green stain under the moss
    c = mul(c, 1 - 0.2 * sstep(-0.06, 0.0, s))
    if sea is not None:
        w = sstep(sea + 0.28 + 0.08 * nzv(p, 3.0, (seed, 1, 1)), sea - 0.02, p.z)
        c = mix(c, ST['wet'], 0.62 * w)
    return c

def moss_col(p, n, s, seed, sat=1.0):
    mz = n.z
    m = mix(MS['lo'], MS['mid'], clamp(mz * 1.3 + 0.15))
    m = mix(m, MS['hi'], clamp(mz * 1.5 - 0.55) * 0.92)
    m = mix(m, MS['tip'], clamp(mz * 2.0 - 1.55) * 0.5 * clamp(nzv(p, 5.0, (seed, 9, 3)) * 2 + 0.5))
    m = mul(m, 0.95 + 0.11 * nzv(p, 11.0, (2.0, seed, 5.0)) + 0.11 * nzv(p, 3.6, (seed, 2.0, 8.0)))
    return mul(m, 0.78 + 0.22 * sstep(0.0, 0.07, s))

def rock_shells(V, Fa, N, Sfield, st_tris, ms_tris, t, wb, seed, tag, sea=None, curv_k=1.0, drop_z=None, tone=0.0):
    """high-res stone (V, Fa, N) + a moss field -> a low-res stone shell (hidden faces under the moss dropped) and a moss
    shell offset along the stone's normals, its rim stood proud as a soft wall and tucked into the stone."""
    Sv = [Sfield(v) for v in V] if Sfield else None
    cv = vert_curv(V, Fa, N)
    keep = []
    for f in Fa:
        if drop_z is not None and all(V[i].z <= drop_z + 1e-4 for i in f): continue
        if Sv and all(Sv[i] > 0.05 for i in f): continue
        keep.append(f)
    # the stone
    used = {}; V1, N1, C1, F1 = [], [], [], []
    for f in keep:
        g = []
        for i in f:
            if i not in used: used[i] = len(V1); V1.append(V[i]); N1.append(N[i]); C1.append(cv[i])
            g.append(used[i])
        F1.append(g)
    Eh = [C1, [Sv[i] for i in used] if Sv else [-1.0] * len(V1)]
    hi = HiSurf(V1, F1, N1, Eh)
    Vl, Fl = decimate(V1, F1, st_tris)
    Vl, Fl = relax(Vl, Fl, hi)
    t1 = Bag()
    for v in Vl:
        n, e = hi.sample(v)
        t1.vc(v, n, stone_col(v, n, e[1], e[0], seed, curv_k, sea, tone))
    for f in Fl: t1.f.append(list(f))
    bagput(t1, tag)
    tot = len(Fl)
    if not Sv or max(Sv) <= 0: return tot
    # the moss
    mV, mF, mN, mS = clip_positive(V, Fa, N, Sv)
    oV = []
    for p, n, s in zip(mV, mN, mS):
        x = clamp(s / wb); prof = 0.6 + 0.4 * (1 - (1 - x) ** 2.2)
        lump = (0.28 * nzv(p, 3.0 / max(wb * 6, 0.3), (seed * 0.3, 7.7, 1.3)) + 0.12 * nzv(p, 7.0 / max(wb * 6, 0.3), (2.2, seed * 0.5, 4.1))) * x
        dome = 0.35 * sstep(wb * 0.6, wb * 4.5, s)
        oV.append(p + n * (t * (prof + lump + dome)))
    oN = vert_normals(oV, mF)
    him = HiSurf(oV, mF, oN, [mS, [n.x for n in mN], [n.y for n in mN], [n.z for n in mN]])
    Vl, Fl = decimate(oV, mF, ms_tris)
    Vl, Fl = relax(Vl, Fl, him, iters=1)
    t2 = Bag(); nb_acc = [Vector() for _ in Vl]; nb_cnt = [0] * len(Vl); edges = {}
    for f in Fl:
        for k in range(3):
            a, b = f[k], f[(k + 1) % 3]
            edges[(a, b)] = True
            nb_acc[a] += Vl[b]; nb_cnt[a] += 1
    rim = {a for (a, b) in edges if (b, a) not in edges} | {b for (a, b) in edges if (b, a) not in edges}
    for i, v in enumerate(Vl):
        n, e = him.sample(v)
        nn = n
        if i in rim and nb_cnt[i]:
            out = v - nb_acc[i] / nb_cnt[i]; out = out - n * out.dot(n)
            if out.length > 1e-6: nn = (n + out.normalized() * 0.9).normalized()
        t2.vc(v, nn, moss_col(v, n, 0.0 if i in rim else e[0], seed))
    tuck = {}
    for i in rim:
        v = Vl[i]; n, e = him.sample(v); ns = Vector((e[1], e[2], e[3]))
        ns = ns.normalized() if ns.length > 1e-6 else n
        out = v - nb_acc[i] / max(nb_cnt[i], 1); out = out - ns * out.dot(ns); out = out.normalized() if out.length > 1e-6 else Vector()
        q = v - ns * (t * 0.6 + 0.03) + out * 0.012
        tuck[i] = t2.vc(q, (out * 0.8 + ns * 0.5).normalized() if out.length else ns, mul(moss_col(v, Vector((0, 0, -0.2)), 0.0, seed), 0.62))
    for f in Fl: t2.f.append(list(f))
    for (a, b) in edges:
        if (b, a) not in edges: t2.f.append([b, a, tuck[a]]); t2.f.append([b, tuck[a], tuck[b]])
    bagput(t2, tag + '_moss')
    return tot + len(t2.f)

def rock(x, y, z, r, sq=0.85, stretch=1.1, yaw=0.0, moss=0.5, seed=1, tris=None, sea=None, tag='boulder', cuts=4, subdiv=None, down=0.525, clip=True, tone=0.0, nd=4):
    """the kit's boulder (props.mossyStone on a puff; the same centre, radius, squash and stretch, so its waterline, foam and
    collider still fit), recut: flat facets, an icing cap of moss. Local coordinates."""
    C = F.W((x, y, z))
    S = RockShape(C, r * stretch, r / math.sqrt(stretch), r * sq, r * down, yaw=yaw, seed=seed, cuts=cuts, p=2.25 + 0.3 * (seed % 3) / 2)
    ground = P.low(x, z, r * 0.8)
    clipz = ground - 0.14 if clip else None
    V, Fa = shape_mesh(S, subdiv or (5 if r > 0.95 else 4), clip=clipz)
    N = vert_normals(V, Fa)
    if tris is None:
        st = int(60 + 110 * r); ms = int(34 + 70 * r)
    else: st, ms = tris
    field = None
    if moss > 0:
        zfoot = max(ground, P.sea if sea is not None else ground) + 0.14
        field = polar_cap(S, 0.3 + 0.82 * moss, seed, zmin=zfoot, nd=nd)
    tot = rock_shells(V, Fa, N, field, st, ms, t=0.024 + 0.034 * r, wb=0.05 + 0.06 * r, seed=seed, tag=tag, sea=sea, curv_k=1.0 / max(r, 0.4), drop_z=clipz, tone=tone)
    S.mesh = HiSurf(V, Fa, N)
    S.tris = tot
    return S

def top_on(shapes, x, z):
    """the top of the given rocks' surfaces under a local point (local y), or None"""
    o = F.W((x, 40, z)); best = None
    for S in shapes:
        hit = S.mesh.bvh.ray_cast(o, Vector((0, 0, -1)), 80)
        if hit[0] is not None and (best is None or hit[0].z > best.z): best = hit[0]
    return None if best is None else (F.m.inverted() @ best).z

# ================================================================== leaves, flowers
def _basis(n):
    a = Vector((1, 0, 0)) if abs(n.x) < 0.8 else Vector((0, 1, 0))
    x = a.cross(n).normalized(); return x, n.cross(x)

def card(t, base, d, nrm, L, W, c0, c1, fold=0.22, shape=0.42, flatn=None, rnd4=True):
    """a chunky leaf: a folded diamond with rounded shoulders; d: its axis, nrm: its face. 4 tris (2 when rnd4 is off)"""
    d = d.normalized(); side = d.cross(nrm).normalized(); up = side.cross(d).normalized()
    if up.dot(nrm) < 0: up = -up
    n = flatn or nrm
    mid = base + d * (L * shape)
    a = t.vc(base, n, c0); b = t.vc(mid + side * (W / 2) - up * (fold * W * 0.5), (n + side * 0.4).normalized(), mix(c0, c1, 0.55))
    e = t.vc(base + d * L - up * (fold * W * 0.3), n, c1); g = t.vc(mid - side * (W / 2) - up * (fold * W * 0.5), (n - side * 0.4).normalized(), mix(c0, c1, 0.55))
    if rnd4:
        m = t.vc(mid + up * (fold * W * 0.25), n, mix(c0, c1, 0.5))
        t.face([a, b, m], n); t.face([b, e, m], n); t.face([e, g, m], n); t.face([g, a, m], n)
    else:
        t.face([a, b, e], n); t.face([a, e, g], n)

def leaf_bush(pos, r, pal=('#2e6638', '#4d8f46', '#8abf5c'), n=None, seed=0, flowers=None, nfl=0, h=None, tag='bush', sq=0.85, L=None):
    """a shrub of chunky leaf cards over a dark inner layer (never a smooth ball); pos: the foot (local), r: its radius"""
    rnd = random.Random(seed * 17 + 3); h = h if h is not None else r * sq
    c = F.W(pos); t = Bag(); n = n or int(10 + 60 * r); L = L or (0.32 + r * 0.42) * 0.62; ga = PI * (3 - math.sqrt(5))
    # the dark inner layer: broad cards pointing out at the foot and over the crown
    for k in range(6):
        a = TAU * k / 6 + rnd.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0.55)).normalized()
        card(t, c + Vector((0, 0, h * 0.3)), d, Vector((0, 0, 1)), r * 0.98, r * 0.85, mul(pal[0], 0.62), pal[0], rnd4=False)
    for k in range(n):
        v = (k + 0.5) / n; zz = 1 - v * 1.05; a = k * ga + rnd.uniform(-0.25, 0.25)
        rr = math.sqrt(max(0.0, 1 - zz * zz))
        dirn = Vector((rr * math.cos(a), rr * math.sin(a), zz))
        base = c + Vector((dirn.x * r * 0.62, dirn.y * r * 0.62, h * 0.42 + dirn.z * h * 0.5))
        out = Vector((dirn.x + rnd.uniform(-0.25, 0.25), dirn.y + rnd.uniform(-0.25, 0.25), 0.15 - 0.35 * dirn.z))
        if out.length < 0.2: out = Vector((math.cos(a), math.sin(a), 0))
        nrm = (dirn + Vector((0, 0, 0.55))).normalized()
        out = (out - nrm * out.dot(nrm))
        if out.length < 1e-3: out = Vector((math.cos(a), math.sin(a), 0))
        lit = clamp(dirn.z * 0.55 + 0.45 + rnd.uniform(-0.1, 0.1))
        c0 = mix(pal[0], pal[1], lit); c1 = mix(pal[1], pal[2], lit)
        card(t, base, out, nrm, L * rnd.uniform(0.85, 1.15), L * 0.62 * rnd.uniform(0.85, 1.15), c0, c1, flatn=(dirn * 0.7 + Vector((0, 0, 0.6))).normalized())
    bagput(t, tag, 'leaf')
    for k in range(nfl):
        a = rnd.uniform(0, TAU); zz = rnd.uniform(0.25, 0.95); rr = math.sqrt(1 - zz * zz)
        d = Vector((rr * math.cos(a), rr * math.sin(a), zz))
        q = c + Vector((d.x * r * 0.86, d.y * r * 0.86, h * 0.42 + d.z * h * 0.74))
        blossom(q, (d + Vector((0, -0.25, 0.5))).normalized(), rnd.uniform(0.07, 0.1) * (0.8 + r * 0.6), flowers[k % len(flowers)], tag=tag)

def blossom(q, nrm, r, col, eye='#ffd24a', tag='flower', petals=5, notch=0.48, lift=0.3):
    """a flat five-petal flower: a star fan (10 tris), its middle the eye; q in Blender coords"""
    t = Bag(); x, y = _basis(nrm)
    ci = t.vc(q + nrm * (r * 0.18), nrm, eye)
    ids = []; dk = mul(col, 0.82); hi = mix(col, '#ffffff', 0.25)
    for k in range(petals * 2):
        a = TAU * k / (petals * 2)
        rr = r if k % 2 == 0 else r * notch
        p = q + (x * math.cos(a) + y * math.sin(a)) * rr + nrm * (r * lift * (rr / r) * 0.4)
        ids.append(t.vc(p, (nrm + (x * math.cos(a) + y * math.sin(a)) * 0.35).normalized(), hi if k % 2 == 0 else dk))
    for k in range(len(ids)): t.face([ci, ids[k], ids[(k + 1) % len(ids)]], nrm)
    bagput(t, tag, 'leaf')

def blades(pos, rnd, n=5, h=0.34, W=0.07, pal=('#4c8436', '#7eb04a', '#b4d468'), tag='tuft', spread=0.08):
    """a tuft of chunky grass blades (2 segments, 3 tris each)"""
    t = Bag(); c = F.W(pos)
    for k in range(n):
        a = rnd.uniform(0, TAU); ch = rnd.uniform(0.8, 1.15) * h; lean = rnd.uniform(0.25, 0.6)
        d = Vector((math.cos(a), math.sin(a), 0)); side = Vector((-d.y, d.x, 0))
        b = c + d * rnd.uniform(0, spread); up = Vector((0, 0, 1))
        m = b + up * (ch * 0.55) + d * (ch * lean * 0.3); tip = b + up * ch + d * (ch * lean)
        nr = (up * 0.55 - d * 0.75 + up).normalized() if False else (up + d * 0.2).normalized()
        c0, c1, c2 = pal[0], mix(pal[0], pal[1], 0.7), mix(pal[1], pal[2], rnd.uniform(0.3, 0.9))
        i0 = t.vc(b - side * (W / 2), nr, c0); i1 = t.vc(b + side * (W / 2), nr, c0)
        i2 = t.vc(m - side * (W * 0.42), nr, c1); i3 = t.vc(m + side * (W * 0.42), nr, c1); i4 = t.vc(tip, nr, c2)
        t.face([i0, i1, i3], nr); t.face([i0, i3, i2], nr); t.face([i2, i3, i4], nr)
    bagput(t, tag, 'leaf')

def sea_pink(x, y, z, rnd, n=3, col='#eba6ba', blade=3, tag='seapink', s=1.0):
    """a clump of thrift: a few grass blades, pom-pom heads on chunky stalks. ~20 tris a head"""
    blades((x, y, z), rnd, n=blade, h=0.2 * s, W=0.05, tag=tag, spread=0.05)
    hi = mix(col, '#ffffff', 0.45); lo = mul(col, 0.74)
    for k in range(n):
        a = rnd.uniform(0, TAU); d = rnd.uniform(0.02, 0.13) * s; hh = rnd.uniform(0.2, 0.36) * s
        px, pz = x + math.cos(a) * d, z + math.sin(a) * d
        r = rnd.uniform(0.058, 0.074) * s
        put(glathe([(0.018, 0.0), (0.014, hh), (0.0, hh + 0.02)], 3, pos=(px, y - 0.01, pz)), flat('#5e8e3e'), tag, 'leaf')
        blossom(F.W((px, y + hh, pz)), Vector((rnd.uniform(-0.25, 0.25), -0.35, 1)).normalized(), r * 1.5, col, eye=mul(col, 0.62) if col != '#ffffff' else '#ffd24a', tag=tag, petals=6, notch=0.62)

# ================================================================== the coastal pine, ported from _east.cloudPine: the same trunk
# path (the hammock hangs from it) but a chunkier, clearer read: flat cloud pads of needle rosettes, dark cards under them
NEEDLE = ('#2a5e40', '#3c7c4e', '#5c9e58', '#a6d27c')
def rosette(t, c, rs, rnd, nrm, c0, c1, K=7, drop=0.5, sharp=0.44):
    """a star of needles round a point (14 tris): many short tips splayed out and down, the heart dark"""
    x, y = _basis(nrm); a0 = rnd.uniform(0, TAU)
    ci = t.vc(c + nrm * (rs * 0.3), nrm, c0); ids = []
    for k in range(K * 2):
        a = a0 + TAU * k / (K * 2); rr = rs * (rnd.uniform(0.92, 1.12) if k % 2 == 0 else sharp)
        p = c + (x * math.cos(a) + y * math.sin(a)) * rr - nrm * (drop * rr)
        n_ = (nrm + (x * math.cos(a) + y * math.sin(a)) * 0.14).normalized()
        ids.append(t.vc(p, n_, c1 if k % 2 == 0 else mix(c0, c1, 0.3)))
    for k in range(len(ids)): t.face([ci, ids[k], ids[(k + 1) % len(ids)]], nrm)

def pine(pos, s=1.0, lean=0.35, pads=4, dir=0.0, pad=None, padFrom=0.5, seed=1, ros=None, tag='pine', K=8, rs=None):
    pad = pad if pad is not None else s; rnd = random.Random(seed * 41 + 5)
    ld = Vector((math.cos(dir), 0, math.sin(dir))); H = 1.25 * s
    def tp(t):
        return Vector((0, t * H, 0)) + ld * (math.sin(t * 1.4) * lean * s) + Vector((math.sin(t * 5 + dir) * 0.06 * s, 0, math.cos(t * 4 + dir) * 0.06 * s))
    with at(pos):
        def bark(p, n):
            a = math.atan2(n.y, n.x)
            k = clamp(0.48 + 0.34 * n.z + 0.34 * math.sin(a * 4 + p.z * 1.6 / s) + nzv(p, 7.0 / s, (seed, 1, 2)) * 0.25)
            return mix('#4c3626', '#a8866a', k)
        pts = [tuple(tp(k / 8)) for k in range(9)]
        rad = lambda q: s * (0.11 - q * 0.065)
        put(gtube(pts, rad, K=K, caps=True), bark, tag)
        for k in range(3):
            a = k / 3 * TAU + dir
            q = (math.cos(a) * 0.09 * s, 0.03 * s, math.sin(a) * 0.09 * s)
            put(gtube([(q[0] * 0.1, 0.17 * s, q[2] * 0.1), q, (q[0] * 2.1, -0.05 * s, q[2] * 2.1)], lambda u: 0.055 * s * (1 - u * 0.8), K=5, caps=True), bark, tag)
        centres = []
        for i in range(pads):
            top = i == pads - 1
            u = 1 if top else padFrom + i * ((0.92 - padFrom) / max(1, pads - 2))
            a = dir + PI + (1 if i % 2 else -1) * (0.9 + rnd.random() * 0.6) + i * 0.4
            o = tp(min(1, u))
            c = o + Vector((0, 0.12 * pad, 0)) if top else o + Vector((math.cos(a) * 0.55 * pad, 0.12 * pad, math.sin(a) * 0.55 * pad))
            if not top:
                br = [tuple(o.lerp(c, j / 3) + Vector((0, math.sin(j / 3 * PI) * 0.08 * pad, 0))) for j in range(4)]
                put(gtube(br, lambda q: min(s, pad * 1.3) * (0.045 - q * 0.024), K=5, caps=False), bark, tag)
            centres.append((c, (0.42 if top else 0.48 + rnd.random() * 0.09) * pad))
        t = Bag(); rs0 = rs or 0.16 * min(pad, 1.75) ** 0.75
        for c, R in centres:
            C = F.W(tuple(c)); nr = ros or int(9 + 8 * (R / rs0 / 3) ** 2)
            for k in range(6):   # the dark underside
                a = TAU * k / 6 + rnd.uniform(-0.2, 0.2)
                d = Vector((math.cos(a), math.sin(a), -0.08))
                card(t, C + Vector((0, 0, -R * 0.06)), d, Vector((0, 0, 1)), R * 0.64, R * 0.7, mul(NEEDLE[0], 0.7), mul(NEEDLE[0], 0.95), rnd4=False, flatn=Vector((0, 0, 1)), shape=0.55)
            ga = PI * (3 - math.sqrt(5))
            for k in range(nr):
                v = (k + 0.5) / nr; rr = math.sqrt(v) * 0.94; a = k * ga + rnd.uniform(-0.2, 0.2)
                zz = math.sqrt(max(0.0, 1 - rr * rr))
                q = C + Vector((math.cos(a) * rr * R, math.sin(a) * rr * R, zz * R * 0.5 + rnd.uniform(-0.02, 0.02) * R))
                nrm = Vector((math.cos(a) * rr * 0.9, math.sin(a) * rr * 0.9, 0.55 + zz)).normalized()
                lit = zz * zz
                c0 = mix(NEEDLE[0], NEEDLE[1], lit); c1 = mix(NEEDLE[1 if rr > 0.85 else 2], NEEDLE[3], lit * rnd.uniform(0.55, 1.0))
                rosette(t, q, rs0 * rnd.uniform(0.92, 1.18), rnd, nrm, c0, c1)
        bagput(t, tag, 'leaf')
    return tp

# ================================================================== timber and rope
TIMBER = '#a9743e'; TIMBER_D = '#73502f'; TIMBER_HI = '#cf9a58'; ROPE = '#dcc38a'; ROPE_D = '#a98e58'
def tw(base=TIMBER, seed=0, nzk=0.07, grain=False):
    def f(p, n):
        c = mix(mul(base, 0.72), mix(base, '#ffe6c0', 0.16), clamp(n.z * 0.62 + 0.52))
        c = mul(c, 1 + nzk * nzv(p, 4.3, (seed, 3.1, 0.7)) * 2)
        return c
    return f
def endgrain(base=TIMBER, top='#d8b078', seed=0):
    f0 = tw(base, seed)
    def f(p, n):
        return top if n.z > 0.82 else f0(p, n)
    return f

def rope_band(x, y, z, r, turns=2, K=6, tag='rope', th=0.03):
    """turns of rope round a post of radius r at (x, y, z): one lathe with real grooves"""
    prof = []
    b = 0.042; tot = turns * b; y0 = -tot / 2
    prof.append((r + 0.002, y0 - 0.002))
    for k in range(turns):
        prof.append((r + th, y0 + (k + 0.5) * b))
        prof.append((r + th * 0.32, y0 + (k + 1) * b))
    prof[-1] = (r + 0.002, y0 + tot + 0.002)
    t = glathe(prof, K, pos=(x, y, z))
    Mi = F.m.inverted()
    def col(p, n):
        ly = (Mi @ p).z - y
        grv = abs(((ly - y0) / b) % 1 - 0.5) * 2
        return mul(mix(ROPE_D, ROPE, 1 - grv), 0.86 + 0.18 * clamp(n.z + 0.5))
    put(t, col, tag)

def post(x, y0, z, h, r=0.09, wraps=(), wood=TIMBER, K=7, tag='post', cap='flat', turns=2, bury=0.15, seed=0):
    if cap == 'flat':
        prof = [(r, -bury), (r * 0.96, h - 0.028), (r * 0.74, h), (0.0, h + 0.004)]
    else:
        prof = [(r, -bury), (r * 0.96, h - 0.03), (r * 0.8, h + r * 0.28), (0.0, h + r * 0.5)]
    put(glathe(prof, K, pos=(x, y0, z), ry=seed * 0.7), endgrain(wood, seed=seed + int(abs(x) * 7)) if cap == 'flat' else tw(wood, seed), tag)
    for w in wraps: rope_band(x, y0 + w, z, r * 0.96, turns=turns, K=K if K <= 6 else 6, tag=tag)

def rail(a, b, r=0.06, wood=TIMBER, K=6, sag=0.018, tag='rail', nseg=2):
    pts = []
    for k in range(nseg + 1):
        t_ = k / nseg; pts.append((a[0] + (b[0] - a[0]) * t_, a[1] + (b[1] - a[1]) * t_ - math.sin(t_ * PI) * sag, a[2] + (b[2] - a[2]) * t_))
    put(gtube(pts, r, K=K, caps=False), tw(wood, nzk=0.05), tag)

def poly_points(pts, every):
    P_ = []
    for i in range(len(pts)):
        P_.append(pts[i])
        if i < len(pts) - 1:
            ax, az = pts[i]; bx, bz = pts[i + 1]; L = math.hypot(bx - ax, bz - az); n = math.ceil(L / every)
            for k in range(1, n): P_.append((ax + (bx - ax) * k / n, az + (bz - az) * k / n))
    return P_

# ================================================================== small things
def pebbles_on(ptsrnd, n, tag='pebbles'):
    pass

def hoop(r0, r1, y0, y1, K=8, tag='hoops', pos=(0, 0, 0), col='#4e4a54'):
    put(glathe([(r0, y0), (r1, y1)], K, pos=pos), lambda p, n: mix(mul(col, 0.8), mix(col, '#a0a0a8', 0.3), clamp(n.z + 0.6)), tag)

def pebble_at(x, y, z, r, rnd, col=None, tag='pebbles'):
    col = col or rnd.choice(('#a8a0a8', '#c0b4ae', '#918a98', '#b4aeb6'))
    t = ellipsoid(F.W((x, y + r * 0.2, z)), (r * 1.2, r, r * 0.55), K=5, J=2)
    put(t, lambda p, n: mix(mul(col, 0.74), mix(col, '#f0ecea', 0.25), clamp(n.z * 0.8 + 0.25)), tag)
