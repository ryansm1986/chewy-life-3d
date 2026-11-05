# PAWHAVEN: the village and regions' mossy boulders (task rocks-village), built in Blender by script.
#   blender --background --factory-startup --python build_rocks-village.py -- --piece village-rock:<k>|village-rock|all
# Writes D:/projects/chewy-life-3d/public/models/tree-village-rock-v<k>.glb (k = 0..3): ONE mesh object, material 'rock'
# (the game's vegetation.js rockGeo reads the part by material name), vertex colours 'Col' (linear), smooth custom
# normals, base near y = 0 (the skirt is buried to y = -0.13 like the kit rock).
# Deterministic: fixed seeds, mathutils noise (no seed state), Blender's collapse decimate.
#
# How a rock is made:
#  1. a high-res star-shaped stone: an icosphere (subdiv 6) whose radius along each direction u is a chunky
#     superellipsoid with low-frequency lumps, cut by a few planes with a SOFT min (flat cut facets with rounded edges,
#     not an egg), optionally unioned with a second lobe (soft max: a crease between the masses), clamped flat at the
#     buried base;
#  2. a moss cushion grown OUT of the crown: vertices inside an irregular cap edge (wobbles + rounded drips) are lifted
#     along the stone normal with a rolled-bead profile and pillowy lumps (a raised cushion, its edge a soft wall);
#  3. a few faceted pebbles at the foot, nestled against the stone (ray-cast);
#  4. each shell decimated (quadric collapse) to the budget; per-vertex normals taken from the high-res surface
#     (smooth shading across the big flat facet triangles); colours painted per vertex: stone lo/mid/hi by the normal,
#     mottling, ray AO in crevices and at the foot, a green stain near the moss; moss dark on the bead walls and drip
#     undersides, light on top, speckled.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = 'D:/projects/chewy-life-3d/public/models'
TAU = math.tau
ZB = -0.13                      # the buried flat base
GL = 0.1                        # the visible ground: the game sets rocks 0.1 m into the ground (vegetation.js rockPl)
UP = Vector((0, 0, 1))

# ------------------------------------------------------------------ colour helpers (designed in sRGB, written linear)
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def srgb(h):
    if isinstance(h, tuple): return h[:3]
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def mix(a, b, t):
    a, b = srgb(a), srgb(b); t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def mul(a, k): a = srgb(a); return tuple(max(0.0, min(1.0, c * k)) for c in a)
def lin(c): c = srgb(c); return (s2l(c[0]), s2l(c[1]), s2l(c[2]), 1.0)
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def sstep(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)
def smin(a, b, k):
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25
def smax(a, b, k): return -smin(-a, -b, k)
def nz(p, f=1.0, off=(0, 0, 0)):
    return noise.noise(Vector((p[0] * f + off[0], p[1] * f + off[1], p[2] * f + off[2])), noise_basis='PERLIN_ORIGINAL')

# the palette (sRGB): the kit rock's lavender-grey stone and its moss, with a wider value range so it models in toon
ST = dict(lo='#6a6280', mid='#9e96ac', hi='#cbc3d0', warm='#c0b0a8', foot='#6c6a5c')
PB = dict(lo='#7c7488', mid='#aaa2b2', hi='#d0c8d2')
MS = dict(lo='#335a2c', mid='#56883e', hi='#98c260', tip='#b8d47a')

# ------------------------------------------------------------------ the variants
# axes: (ax, ay, az_up, az_down) semi-axes about the centre C; p: the superellipsoid exponent (2 = ellipsoid, higher =
# boxier); planes: (normal, distance from C, edge softness k); lobe: a second ellipsoid (centre, axes, k) unioned in.
# moss: centre offset, cap polar angle th0 (rad), wobbles, drips (phi, length rad, half-width rad), thickness t.
def N(x, y, z): return Vector((x, y, z)).normalized()
VARIANTS = {
    0: dict(  # the table stone: broad and heavy, a tilted flat top, two cut flanks; moss over the table, drips off the low edge
        C=(0.0, 0.0, 0.2), axes=(0.66, 0.56, 0.5, 0.5), p=2.6, seed=3,
        lumps=[(1.6, 0.07), (3.1, 0.014)],
        planes=[(N(0.12, -0.18, 1), 0.36, 0.09), (N(1, 0.35, 0.15), 0.56, 0.08), (N(-0.6, 1, 0.1), 0.48, 0.09),
                (N(-1, -0.5, 0.35), 0.58, 0.1)],
        moss=dict(c=(0.03, 0.05, 0.0), th0=0.85, wob=(0.1, 0.07), t=0.074,
                  drips=[(-1.7, 0.3, 0.55), (1.6, 0.2, 0.5)]),
        pebbles=[(-2.2, 0.1, 0.11, 0.06, 1), (-1.75, 0.0, 0.07, 0.04, 2), (0.9, 0.05, 0.09, 0.05, 3)]),
    1: dict(  # the leaning wedge: taller, a big slanted split face on one side, a ridged crown; moss over the crown and back
        C=(0.0, 0.0, 0.22), axes=(0.56, 0.52, 0.56, 0.48), p=2.3, seed=14,
        lumps=[(1.8, 0.08), (3.4, 0.016)],
        planes=[(N(0.85, -0.3, 0.65), 0.34, 0.07), (N(-0.4, 0.2, 1), 0.47, 0.1), (N(-0.9, -0.6, 0.2), 0.5, 0.08),
                (N(0.1, 1, 0.25), 0.47, 0.09)],
        moss=dict(c=(-0.08, 0.05, 0.0), th0=0.8, wob=(0.1, 0.08), t=0.074,
                  drips=[(2.6, 0.34, 0.56), (-1.9, 0.2, 0.48)]),
        pebbles=[(0.1, 0.08, 0.1, 0.055, 4), (0.55, 0.0, 0.065, 0.04, 5), (-2.8, 0.06, 0.085, 0.05, 6)]),
    2: dict(  # the twin: a main mass with a lower shoulder lobe beside it, a crease between; moss pours into the crease
        C=(0.12, 0.0, 0.2), axes=(0.5, 0.5, 0.48, 0.48), p=2.3, seed=25,
        lumps=[(1.7, 0.07), (3.2, 0.014)],
        planes=[(N(0.2, 0.1, 1), 0.4, 0.09), (N(1, -0.2, 0.2), 0.45, 0.08), (N(0.2, -1, 0.3), 0.44, 0.08)],
        lobe=dict(c=(-0.48, 0.12, 0.02), axes=(0.36, 0.38, 0.3), k=0.1, planes=[(N(-1, 0.3, 0.4), 0.29, 0.07)]),
        moss=dict(c=(0.0, 0.0, 0.0), th0=0.81, wob=(0.1, 0.06), t=0.072,
                  drips=[(3.0, 0.4, 0.55), (-1.2, 0.2, 0.5)]),
        pebbles=[(-1.3, 0.04, 0.1, 0.055, 7), (2.4, 0.06, 0.08, 0.045, 8), (1.9, 0.0, 0.06, 0.035, 9)]),
    3: dict(  # the low slab: wide and low, cut all round like a hewn river stone; a big moss cushion and a moss pad beside it
        C=(0.0, 0.0, 0.16), axes=(0.7, 0.54, 0.42, 0.44), p=2.8, seed=36,
        lumps=[(1.5, 0.06), (3.0, 0.014)],
        planes=[(N(-0.08, 0.1, 1), 0.3, 0.08), (N(1, 0.2, 0.3), 0.6, 0.08), (N(-1, 0.25, 0.25), 0.62, 0.08),
                (N(0.3, -1, 0.3), 0.46, 0.08), (N(-0.25, 1, 0.35), 0.46, 0.08), (N(0.8, 0.8, 0.5), 0.6, 0.09)],
        moss=dict(c=(-0.05, -0.02, 0.0), th0=0.95, wob=(0.09, 0.07), t=0.076,
                  drips=[(-1.6, 0.26, 0.55), (2.5, 0.3, 0.56)]),
        pebbles=[(0.6, 0.06, 0.1, 0.05, 10), (-0.15, 0.02, 0.07, 0.04, 11), (3.3, 0.06, 0.09, 0.05, 12)],
        pad=(2.25, 0.18, 0.16, 0.05)),
}
STONE_TRIS = 930
CUT_DEEPEN, CUT_SOFT = 0.03, 0.6    # (all variants' cuts: a touch deeper and crisper than the table's values)
PEBBLE_TRIS = 36

# ------------------------------------------------------------------ the stone shape
def ray_ellipsoid(C, u, Q, A):
    """exit distance along C + t u from an ellipsoid centred Q with semi-axes A (0 if the ray misses it)"""
    o = Vector(((C.x - Q.x) / A[0], (C.y - Q.y) / A[1], (C.z - Q.z) / A[2]))
    d = Vector((u.x / A[0], u.y / A[1], u.z / A[2]))
    a, b, c = d.dot(d), 2 * o.dot(d), o.dot(o) - 1
    disc = b * b - 4 * a * c
    if disc < 0: return 0.0
    return max(0.0, (-b + math.sqrt(disc)) / (2 * a))

def plane_cut(R, u, planes):
    for n, d, k in planes:
        un = u.dot(n)
        if un > 0.03: R = smin(R, d / un, k)
    return R

def make_radial(S):
    C = Vector(S['C']); ax, ay, azu, azd = S['axes']; p = S['p']; sd = S['seed']
    offs = [(sd * 1.37 + i * 5.1, sd * 0.71 - i * 3.3, sd * 2.03 + i * 1.9) for i in range(4)]
    lobe = S.get('lobe')
    def base(u):
        az = azu if u.z >= 0 else azd
        R = (abs(u.x / ax) ** p + abs(u.y / ay) ** p + abs(u.z / az) ** p) ** (-1.0 / p)
        m = 1.0
        for i, (f, a) in enumerate(S['lumps']): m += a * nz(u, f, offs[i])
        return R * m
    def R(u):
        r0 = base(u)
        r = plane_cut(r0, u, [(n, d - CUT_DEEPEN, k * CUT_SOFT) for n, d, k in S['planes']])
        if lobe:
            Q = Vector(lobe['c']) + C
            t2 = ray_ellipsoid(C, u, Q, lobe['axes'])
            if t2 > 0:
                t2 *= 1.0 + 0.05 * nz(u, 2.2, offs[3])
                # the lobe's own cut, measured from its centre
                q = C + u * t2 - Q
                if q.length > 1e-6:
                    ul = q.normalized(); rl = plane_cut(q.length, ul, lobe['planes'])
                    t2 = max(0.0, t2 - (q.length - rl))
                r = smax(r, t2, lobe['k'])
        return r, r0
    return C, R

def ico(subdiv):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    return bm

def build_stone_hi(S):
    """the high-res stone + moss as a bmesh; returns (bm, moss signed-distance per vertex, facet weight per vertex)"""
    C, R = make_radial(S)
    bm = ico(6)
    for v in bm.verts:
        u = v.co.normalized(); r, r0 = R(u)
        q = C + u * r
        if q.z < ZB: q.z = ZB
        v.co = q
    bm.normal_update()
    # mean curvature of the bare stone (convex facet edges +, creases -), smoothed: the painter lights edges, darkens creases
    bm.verts.index_update()
    curv = []
    for v in bm.verts:
        acc = 0.0; n = 0
        for e in v.link_edges:
            d = v.co - e.other_vert(v).co; l2 = d.length_squared
            if l2 > 1e-12: acc += v.normal.dot(d) / l2; n += 1
        curv.append(2 * acc / max(n, 1))
    for _ in range(3):
        curv = [0.5 * curv[v.index] + 0.5 * sum(curv[e.other_vert(v).index] for e in v.link_edges) / len(v.link_edges) for v in bm.verts]
    # the moss cushion, grown out along the stone normal
    M = S['moss']; mc = C + Vector(M['c'])
    t = M['t']; wb = 0.045
    for v in bm.verts:
        s = moss_s(v.co, mc, M, S['seed'])
        if s <= 0: continue
        x = clamp(s / wb)
        prof = 1 - (1 - x) ** 2.5
        steep = clamp(v.normal.z * 1.4 + 0.2)
        th = t * (0.62 + 0.38 * steep)
        lump = 0.026 * nz(v.co, 3.2, (S['seed'] * 0.3, 7.7, 1.3)) + 0.01 * nz(v.co, 7.0, (2.2, S['seed'] * 0.5, 4.1))
        dome = 0.04 * sstep(0.03, 0.4, s)        # the cushion domes up toward its middle (no flat pancake)
        v.co = v.co + v.normal * (th * prof + lump * prof + dome)
    bm.normal_update()
    return bm, C, mc, curv

def moss_s(p, mc, M, seed):
    """signed arc distance (m) inside the moss cap edge at point p (positive = moss)"""
    d = p - mc; L = d.length
    if L < 1e-6: return 1.0
    dn = d / L
    th = math.acos(clamp(dn.z, -1, 1)); ph = math.atan2(dn.y, dn.x)
    a1, a2 = M['wob']
    e = (M['th0'] + a1 * 0.5 * math.sin(2 * ph + seed * 0.9) + a2 * math.sin(3 * ph + seed * 1.7) + a1 * 0.2 * math.sin(5 * ph + seed * 2.3)
         + 0.05 * nz((math.cos(ph), math.sin(ph), 0), 2.0, (seed, 1.1, 0)))
    ext = 0.0
    for c, ln, w in M['drips']:
        dd = math.atan2(math.sin(ph - c), math.cos(ph - c))
        if abs(dd) < w: ext = max(ext, ln * (1 - (dd / w) ** 2) ** 0.75)
    s = (e + ext - th) * L
    # the foot stays bare: drips end (roundly) well above the ground
    s = min(s, (p.z - (GL + 0.15)) * 1.2)
    return s

# ------------------------------------------------------------------ pebbles
def build_pebble_hi(seed, r, sq):
    rnd = random.Random(seed * 97 + 5)
    bm = ico(4)
    planes = []
    for _ in range(3):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1))).normalized()
        planes.append((n, rnd.uniform(0.72, 0.85), 0.18))
    planes.append((UP, 0.78, 0.2))
    off = (seed * 1.3, seed * 2.1, 0.7)
    for v in bm.verts:
        u = v.co.normalized()
        R = 1.0 + 0.08 * nz(u, 1.7, off)
        R = plane_cut(R, u, planes)
        q = u * R
        v.co = Vector((q.x * r * 1.15, q.y * r * 0.95, q.z * r * sq))
    return bm

# ------------------------------------------------------------------ Blender objects
def bm_to_obj(bm, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def decimate(ob, target):
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = min(1.0, target / n)
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.scene.objects: o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=m.name)

def relax(ob, src, iters=4, f=0.5):
    """even out the decimated triangles (no slivers, so per-vertex colour and normals interpolate cleanly): edge flips
    for the best angles, then a tangential umbrella step projected back onto the high-res surface"""
    bvh = BVHTree.FromObject(src, bpy.context.evaluated_depsgraph_get())
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for it in range(iters):
        bmesh.ops.beautify_fill(bm, faces=bm.faces[:], edges=bm.edges[:], method='ANGLE')
        bm.normal_update()
        new = []
        for v in bm.verts:
            nb = [e.other_vert(v).co for e in v.link_edges]
            if len(nb) < 3: continue
            c = sum(nb, Vector()) / len(nb)
            d = c - v.co; n = v.normal
            d = d - n * d.dot(n)
            new.append((v, v.co + d * f))
        for v, p in new:
            loc = bvh.find_nearest(p)[0]
            v.co = loc if loc is not None else p
    bmesh.ops.beautify_fill(bm, faces=bm.faces[:], edges=bm.edges[:], method='ANGLE')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()

def join(obs, name):
    for o in bpy.context.scene.objects: o.select_set(o in obs)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    return ob

def make_mat(name):
    mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.85; bsdf.inputs['Metallic'].default_value = 0.0
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    return mt

# ------------------------------------------------------------------ the build
def build(k):
    S = VARIANTS[k]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bm, C, mc, curv = build_stone_hi(S)
    hi_stone = bm_to_obj(bm, 'hi_stone')
    lo_stone = hi_stone.copy(); lo_stone.data = hi_stone.data.copy(); lo_stone.name = 'lo_stone'
    bpy.context.scene.collection.objects.link(lo_stone)
    decimate(lo_stone, STONE_TRIS)
    relax(lo_stone, hi_stone)
    # pebbles nestled against the stone's foot (a horizontal ray toward the centre at 4 cm)
    bvh_s = BVHTree.FromObject(hi_stone, bpy.context.evaluated_depsgraph_get())
    hi_parts, lo_parts = [hi_stone], [lo_stone]
    pads = []
    for i, (ph, gap, r, h, sd) in enumerate(S['pebbles']):
        d = Vector((math.cos(ph), math.sin(ph), 0))
        o = C.xy.to_3d() + d * 2.0; o.z = GL + 0.04
        hit, hn, _, _ = bvh_s.ray_cast(o, -d)
        base = hit if hit is not None else C.xy.to_3d() + d * 0.7
        c = base + d * (r * 1.05 + gap); c.z = GL + h * 0.2
        bmp = build_pebble_hi(sd, r, h / r)
        yaw = Matrix.Rotation(ph + sd, 4, 'Z')
        bmesh.ops.transform(bmp, matrix=Matrix.Translation(c) @ yaw, verts=bmp.verts)
        po = bm_to_obj(bmp, 'hi_peb%d' % i)
        lo = po.copy(); lo.data = po.data.copy(); lo.name = 'lo_peb%d' % i; bpy.context.scene.collection.objects.link(lo)
        decimate(lo, PEBBLE_TRIS); relax(lo, po, iters=2)
        hi_parts.append(po); lo_parts.append(lo)
    if S.get('pad'):   # a moss pad on the ground beside the stone (a flat cushion, painted as moss)
        ph, gap, r, h = S['pad']
        d = Vector((math.cos(ph), math.sin(ph), 0))
        o = C.xy.to_3d() + d * 2.0; o.z = GL + 0.03
        hit, _, _, _ = bvh_s.ray_cast(o, -d)
        base = hit if hit is not None else C.xy.to_3d() + d * 0.7
        c = base + d * (r * 0.75 + gap); c.z = GL - 0.02
        bmp = ico(4)
        for v in bmp.verts:
            u = v.co.normalized(); R = 1 + 0.12 * nz(u, 2.0, (4.4, 1.2, 9.0))
            q = u * R; v.co = Vector((q.x * r * 1.3, q.y * r, max(q.z, -0.3) * h)) + c
        po = bm_to_obj(bmp, 'hi_pad')
        lo = po.copy(); lo.data = po.data.copy(); lo.name = 'lo_pad'; bpy.context.scene.collection.objects.link(lo)
        decimate(lo, 44)
        hi_parts.append(po); lo_parts.append(lo); pads.append(c)
    # tag shells before joining (0 stone, 1 pebble, 2 pad)
    for ob, kind in zip(lo_parts, [0] + [1] * len(S['pebbles']) + [2] * len(pads)):
        a = ob.data.attributes.new('kind', 'INT', 'POINT'); a.data.foreach_set('value', [kind] * len(ob.data.vertices))
    hi = join(hi_parts, 'hi'); ob = join(lo_parts, 'rock')

    me = ob.data
    # per-vertex normals from the high-res surface (barycentric vertex normals of the nearest hi face)
    hm = hi.data; hm.calc_loop_triangles()
    bvh_h = BVHTree.FromObject(hi, bpy.context.evaluated_depsgraph_get())
    hvn = [v.normal.copy() for v in hm.vertices]
    tri_of_poly = {}
    for lt in hm.loop_triangles: tri_of_poly.setdefault(lt.polygon_index, lt)
    curv = curv + [0.0] * (len(hm.vertices) - len(curv))
    normals, curvs = [], []
    for v in me.vertices:
        loc, fn, fi, dist = bvh_h.find_nearest(v.co)
        lt = tri_of_poly.get(fi) if fi is not None else None
        if lt is None: normals.append(v.normal.copy()); curvs.append(0.0); continue
        a, b, c = (hm.vertices[i].co for i in lt.vertices)
        w = bary(loc, a, b, c)
        n = hvn[lt.vertices[0]] * w[0] + hvn[lt.vertices[1]] * w[1] + hvn[lt.vertices[2]] * w[2]
        normals.append(n.normalized() if n.length > 1e-8 else fn)
        curvs.append(sum(curv[i] * wi for i, wi in zip(lt.vertices, w)))
    # paint
    kinds = [0] * len(me.vertices); me.attributes['kind'].data.foreach_get('value', kinds)
    paint(ob, normals, kinds, S, C, mc, curvs)
    me.attributes.remove(me.attributes['kind'])
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in normals])
    me.materials.clear(); me.materials.append(make_mat('rock'))
    # remove the high-res helper
    bpy.data.objects.remove(hi, do_unlink=True)
    return ob, S

def bary(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-14: return (1 / 3, 1 / 3, 1 / 3)
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    v, w = clamp(v), clamp(w)
    if v + w > 1: s = v + w; v, w = v / s, w / s
    return (1 - v - w, v, w)

def ray_ao(ob, normals, n_rays=40, dist=0.45):
    bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    rnd = random.Random(77)
    dirs = []
    for i in range(n_rays):   # cosine-weighted hemisphere (fixed set)
        u1, u2 = (i + 0.5) / n_rays, rnd.random()
        r = math.sqrt(u1); a = TAU * u2
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0, 1 - u1)))))
    ao = []
    for v, n in zip(ob.data.vertices, normals):
        t = n.orthogonal().normalized(); b = n.cross(t)
        o = v.co + n * 0.006; occ = 0.0
        for d in dirs:
            w = t * d.x + b * d.y + n * d.z
            if w.z < 0 and o.z > GL and ((GL - o.z) / w.z) < dist: occ += 1; continue    # the ground
            hit = bvh.ray_cast(o, w, dist)
            if hit[0] is not None: occ += 1 - (hit[3] / dist) * 0.6
        ao.append(1 - occ / n_rays)
    return ao

def paint(ob, normals, kinds, S, C, mc, curvs):
    me = ob.data
    ao = ray_ao(ob, normals)
    _, Rf = make_radial(S)
    M = S['moss']; sd = S['seed']
    cols = []
    for v, n, kind, a, cv in zip(me.vertices, normals, kinds, ao, curvs):
        p = v.co
        occl = 0.5 + 0.5 * a                     # 0.5 .. 1
        if kind == 1:    # pebble
            c = mix(PB['lo'], PB['mid'], clamp(n.z * 0.9 + 0.7))
            c = mix(c, PB['hi'], clamp(n.z * 1.2 - 0.25))
            c = mul(c, (0.95 + 0.08 * nz(p, 9.0, (sd, 3, 1))) * occl)
        elif kind == 2:  # moss pad
            c = mix(MS['lo'], MS['mid'], clamp(n.z * 1.1 + 0.1))
            c = mix(c, MS['hi'], clamp(n.z * 1.1 - 0.45) * 0.8)
            c = mul(c, (0.92 + 0.12 * nz(p, 11.0, (1, sd, 2))) * (0.7 + 0.3 * a))
        else:
            s = moss_s(p, mc, M, sd)
            # stone: value by the normal (light tops, dark undersides), mottle, warm patches, cut-facet lift, AO, foot
            vz = n.z
            c = mix(ST['lo'], ST['mid'], clamp(vz * 0.9 + 0.75))
            c = mix(c, ST['hi'], clamp(vz * 1.1 - 0.15) * 0.85)
            u = (p - C).normalized(); rr, r0 = Rf(u)
            facet = sstep(0.01, 0.06, r0 - rr)        # how deep a plane cut this spot: cut faces read a touch smoother/lighter
            mott = 0.09 * nz(p, 2.6, (sd, 0.5, 2.0)) + 0.05 * nz(p, 7.5, (3.0, sd, 1.0))
            c = mul(c, 1.0 + mott * (1 - 0.6 * facet) + 0.04 * facet)
            c = mix(c, ST['warm'], 0.22 * clamp(nz(p, 1.6, (sd * 2.0, 4.0, 0.0)) * 2.0))
            c = mul(c, 1.0 + 0.13 * sstep(5.0, 16.0, cv) - 0.2 * sstep(-1.0, -8.0, cv))   # worn light edges, dark creases
            c = mix(c, ST['foot'], 0.45 * sstep(GL + 0.12, GL - 0.02, p.z))
            # a faint green creeping below the moss edge and in low crevices
            c = mix(c, '#7a9a5c', 0.28 * sstep(-0.12, 0.0, s) + 0.15 * sstep(0.7, 0.35, a) * sstep(GL + 0.25, GL, p.z))
            c = mul(c, occl * (1 - 0.16 * sstep(-0.07, 0.0, s)))     # the cushion tucks a soft shadow onto the stone
            if s > -0.004:
                # moss: dark on bead walls / drip undersides, light on top, speckled; the edge tucks in darker
                mz = n.z
                m = mix(MS['lo'], MS['mid'], clamp(mz * 1.3 + 0.15))
                m = mix(m, MS['hi'], clamp(mz * 1.5 - 0.55) * 0.9)
                m = mix(m, MS['tip'], clamp(mz * 2.0 - 1.55) * 0.5 * clamp(nz(p, 5.0, (sd, 9, 3)) * 2 + 0.5))
                m = mul(m, (0.94 + 0.1 * nz(p, 12.0, (2.0, sd, 5.0)) + 0.1 * nz(p, 4.0, (sd, 2.0, 8.0))) * (0.6 + 0.4 * a))
                m = mul(m, 0.82 + 0.18 * sstep(0.0, 0.05, s))
                c = mix(c, m, sstep(-0.004, 0.012, s))
        cols.append(c)
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    vi = [0] * len(me.loops); me.loops.foreach_get('vertex_index', vi)
    flat = []
    for i in vi: flat.extend(lin(cols[i]))
    attr.data.foreach_set('color', flat)
    me.color_attributes.active_color = attr
    try: me.color_attributes.render_color_index = me.color_attributes.find('Col')
    except Exception: pass

def moss_cover(ob, S, C, mc):
    """the moss's share of the stone's top-down silhouette area (faces facing up, stone shell only)"""
    me = ob.data; tot = mos = 0.0
    for poly in me.polygons:
        if poly.normal.z <= 0: continue
        cc = poly.center
        if cc.z < GL + 0.02: continue
        a = poly.area * poly.normal.z; tot += a
        if moss_s(cc, mc, S['moss'], S['seed']) > 0: mos += a
    return mos / max(tot, 1e-9)

def check(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    zero = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
    nan = sum(1 for v in bm.verts if any(math.isnan(c) for c in v.co))
    shells = len(bmesh_shells(bm)); bm.free()
    nn = sum(1 for l in ob.data.loops if any(math.isnan(c) for c in l.normal))
    return dict(zero_area=zero, nan_verts=nan, nan_normals=nn, shells=shells)

def bmesh_shells(bm):
    seen = set(); out = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; seen.add(v.index); n = 0
        while stack:
            x = stack.pop(); n += 1
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); stack.append(y)
        out.append(n)
    return out

def export(ob, S, k):
    name = 'tree-village-rock-v%d' % k
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    lo = Vector((min(v.co.x for v in ob.data.vertices), min(v.co.y for v in ob.data.vertices), min(v.co.z for v in ob.data.vertices)))
    hi = Vector((max(v.co.x for v in ob.data.vertices), max(v.co.y for v in ob.data.vertices), max(v.co.z for v in ob.data.vertices)))
    C = Vector(S['C']); mc = C + Vector(S['moss']['c'])
    print('RV %s tris %d verts %d' % (name, tris, len(ob.data.vertices)))
    print('RV %s bounds x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (name, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    print('RV %s moss cover %.2f' % (name, moss_cover(ob, S, C, mc)))
    print('RV %s check %s' % (name, check(ob)))
    os.makedirs(os.path.join(HERE, 'blend'), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'blend', name + '.blend'))
    for o in bpy.context.scene.objects: o.select_set(o == ob)
    out = os.path.join(MODELS, name + '.glb')
    kw = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_attributes=True, export_lights=False, export_cameras=False, export_animations=False,
              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError as e:
        print('RV export_vertex_color rejected:', e)
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('RV wrote', out)

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    piece = argv[argv.index('--piece') + 1] if '--piece' in argv else 'all'
    jobs = []
    for tok in piece.replace(' ', ',').split(','):
        if not tok: continue
        if tok in ('all', 'village-rock'): jobs += list(VARIANTS)
        elif ':' in tok: jobs.append(int(tok.split(':')[1]))
    for k in jobs:
        ob, S = build(k)
        export(ob, S, k)

main()
